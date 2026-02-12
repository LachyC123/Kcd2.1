(() => {
  'use strict';
  const LW = window.LW;

  const { PROPS } = LW.tiles;

  // Grid A* with caching. Designed for NPC schedules (path requests are infrequent).
  // Paths are in tile coordinates, stored as packed int (x16|y16) with signed 16-bit decode.

  function pack16(x, y) {
    return (((x & 0xffff) << 16) | (y & 0xffff)) | 0;
  }
  function unpackX(p) {
    const x = (p >> 16) & 0xffff;
    return x & 0x8000 ? x - 0x10000 : x;
  }
  function unpackY(p) {
    const y = p & 0xffff;
    return y & 0x8000 ? y - 0x10000 : y;
  }

  class MinHeap {
    constructor() {
      this.i = new Int32Array(0);
      this.f = new Float32Array(0);
      this.len = 0;
    }
    ensure(n) {
      if (this.i.length >= n) return;
      const cap = Math.max(n, (this.i.length * 2) | 0, 64);
      this.i = new Int32Array(cap);
      this.f = new Float32Array(cap);
    }
    clear() {
      this.len = 0;
    }
    push(idx, f) {
      const n = this.len + 1;
      this.ensure(n);
      let k = this.len;
      this.len = n;
      while (k > 0) {
        const p = ((k - 1) / 2) | 0;
        if (this.f[p] <= f) break;
        this.i[k] = this.i[p];
        this.f[k] = this.f[p];
        k = p;
      }
      this.i[k] = idx;
      this.f[k] = f;
    }
    pop() {
      if (this.len <= 0) return -1;
      const out = this.i[0];
      const lastIdx = this.i[this.len - 1];
      const lastF = this.f[this.len - 1];
      this.len--;
      let k = 0;
      while (true) {
        const l = k * 2 + 1;
        if (l >= this.len) break;
        const r = l + 1;
        let c = l;
        if (r < this.len && this.f[r] < this.f[l]) c = r;
        if (this.f[c] >= lastF) break;
        this.i[k] = this.i[c];
        this.f[k] = this.f[c];
        k = c;
      }
      if (this.len > 0) {
        this.i[k] = lastIdx;
        this.f[k] = lastF;
      }
      return out;
    }
  }

  class Scratch {
    constructor() {
      this.w = 0;
      this.h = 0;
      this.minx = 0;
      this.miny = 0;
      this.g = new Float32Array(0);
      this.parent = new Int32Array(0);
      this.state = new Uint8Array(0); // 0 unvisited, 1 open, 2 closed
      this.heap = new MinHeap();
    }
    ensure(w, h) {
      const n = w * h;
      if (this.g.length < n) {
        const cap = Math.max(n, (this.g.length * 2) | 0, 2048);
        this.g = new Float32Array(cap);
        this.parent = new Int32Array(cap);
        this.state = new Uint8Array(cap);
      }
      this.w = w;
      this.h = h;
    }
    reset(n) {
      // Only reset first n entries; typed array fill is fast.
      this.state.fill(0, 0, n);
      this.parent.fill(-1, 0, n);
      // g left uninitialized; we set when visited.
      this.heap.clear();
    }
  }

  const scratch = new Scratch();

  function heuristic(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  function moveCost(tileId) {
    const sp = PROPS.speedMul[tileId] || 1;
    // prefer roads, avoid forests; keep within sane bounds
    const c = 1 / sp;
    return c < 0.6 ? 0.6 : c > 2.2 ? 2.2 : c;
  }

  function findPathTiles(world, sx, sy, tx, ty, outPacked) {
    // returns length; writes packed coords into outPacked (JS array)
    const stats = LW.path.stats;
    stats.requests++;

    if ((sx | 0) === (tx | 0) && (sy | 0) === (ty | 0)) {
      outPacked.length = 0;
      return 0;
    }

    // Quick bounds and max search radius: this slice keeps NPCs fairly local.
    const d = heuristic(sx, sy, tx, ty);
    const maxD = 140;
    if (d > maxD) return 0;

    const margin = 12;
    const minx = Math.min(sx, tx) - margin;
    const maxx = Math.max(sx, tx) + margin;
    const miny = Math.min(sy, ty) - margin;
    const maxy = Math.max(sy, ty) + margin;

    const w = (maxx - minx + 1) | 0;
    const h = (maxy - miny + 1) | 0;
    if (w <= 0 || h <= 0 || w * h > 90000) return 0;

    scratch.ensure(w, h);
    scratch.minx = minx;
    scratch.miny = miny;
    const n = w * h;
    scratch.reset(n);

    const toIdx = (x, y) => (x - minx) + (y - miny) * w;

    const startI = toIdx(sx, sy);
    const goalI = toIdx(tx, ty);

    // If goal not passable, fail quickly.
    const goalTile = world.tileAt(tx, ty);
    if (!PROPS.passable[goalTile]) return 0;

    scratch.g[startI] = 0;
    scratch.parent[startI] = -1;
    scratch.state[startI] = 1;
    scratch.heap.push(startI, heuristic(sx, sy, tx, ty));

    let expanded = 0;
    const expandCap = 14000;

    while (scratch.heap.len > 0) {
      const ci = scratch.heap.pop();
      if (ci < 0) break;
      if (scratch.state[ci] === 2) continue;
      scratch.state[ci] = 2;
      expanded++;
      if (ci === goalI) break;
      if (expanded > expandCap) break;

      const cx = minx + (ci % w);
      const cy = miny + ((ci / w) | 0);
      const cg = scratch.g[ci];

      // 4-neighborhood
      // unrolled neighbors to avoid allocations
      // left
      {
        const nx = cx - 1;
        const ny = cy;
        if (nx >= minx) {
          const ni = ci - 1;
          const tid = world.tileAt(nx, ny);
          if (PROPS.passable[tid]) {
            const ng = cg + moveCost(tid);
            if (scratch.state[ni] === 0 || ng < scratch.g[ni]) {
              scratch.g[ni] = ng;
              scratch.parent[ni] = ci;
              scratch.state[ni] = 1;
              scratch.heap.push(ni, ng + heuristic(nx, ny, tx, ty));
            }
          }
        }
      }
      // right
      {
        const nx = cx + 1;
        const ny = cy;
        if (nx <= maxx) {
          const ni = ci + 1;
          const tid = world.tileAt(nx, ny);
          if (PROPS.passable[tid]) {
            const ng = cg + moveCost(tid);
            if (scratch.state[ni] === 0 || ng < scratch.g[ni]) {
              scratch.g[ni] = ng;
              scratch.parent[ni] = ci;
              scratch.state[ni] = 1;
              scratch.heap.push(ni, ng + heuristic(nx, ny, tx, ty));
            }
          }
        }
      }
      // up
      {
        const nx = cx;
        const ny = cy - 1;
        if (ny >= miny) {
          const ni = ci - w;
          const tid = world.tileAt(nx, ny);
          if (PROPS.passable[tid]) {
            const ng = cg + moveCost(tid);
            if (scratch.state[ni] === 0 || ng < scratch.g[ni]) {
              scratch.g[ni] = ng;
              scratch.parent[ni] = ci;
              scratch.state[ni] = 1;
              scratch.heap.push(ni, ng + heuristic(nx, ny, tx, ty));
            }
          }
        }
      }
      // down
      {
        const nx = cx;
        const ny = cy + 1;
        if (ny <= maxy) {
          const ni = ci + w;
          const tid = world.tileAt(nx, ny);
          if (PROPS.passable[tid]) {
            const ng = cg + moveCost(tid);
            if (scratch.state[ni] === 0 || ng < scratch.g[ni]) {
              scratch.g[ni] = ng;
              scratch.parent[ni] = ci;
              scratch.state[ni] = 1;
              scratch.heap.push(ni, ng + heuristic(nx, ny, tx, ty));
            }
          }
        }
      }
    }

    stats.expanded += expanded;

    if (scratch.parent[goalI] === -1) return 0;

    // Reconstruct (reverse)
    outPacked.length = 0;
    let cur = goalI;
    let safety = 0;
    while (cur !== -1 && cur !== startI && safety++ < 5000) {
      const x = minx + (cur % w);
      const y = miny + ((cur / w) | 0);
      outPacked.push(pack16(x, y));
      cur = scratch.parent[cur];
    }
    outPacked.reverse();
    return outPacked.length;
  }

  class Cache {
    constructor(cap) {
      this.cap = cap | 0;
      this.map = new Map(); // key-> {path:Array<int>, t:number}
    }
    get(key) {
      const v = this.map.get(key);
      if (!v) return null;
      // refresh LRU by reinserting
      this.map.delete(key);
      this.map.set(key, v);
      return v.path;
    }
    set(key, path) {
      this.map.set(key, { path, t: LW.now() });
      while (this.map.size > this.cap) {
        const oldestK = this.map.keys().next().value;
        this.map.delete(oldestK);
      }
    }
  }

  const cache = new Cache(360);

  function keyFor(sx, sy, tx, ty) {
    // string key; path calls are not per-frame.
    return `${sx},${sy}>${tx},${ty}`;
  }

  function getPath(world, sx, sy, tx, ty, outPacked) {
    const k = keyFor(sx | 0, sy | 0, tx | 0, ty | 0);
    const cached = cache.get(k);
    if (cached) {
      LW.path.stats.hits++;
      outPacked.length = 0;
      for (let i = 0; i < cached.length; i++) outPacked.push(cached[i]);
      return outPacked.length;
    }
    const len = findPathTiles(world, sx | 0, sy | 0, tx | 0, ty | 0, outPacked);
    if (len > 0) cache.set(k, outPacked.slice(0));
    return len;
  }

  LW.path = {
    pack16,
    unpackX,
    unpackY,
    getPath,
    findPathTiles,
    stats: {
      requests: 0,
      hits: 0,
      expanded: 0,
    },
  };
})();

