(() => {
  'use strict';
  const LW = window.LW;
  const { T, PROPS } = LW.tiles;

  // Chunk streaming world.
  // Coordinates in "tiles" for generation, but entities use world-units (tile*LW.consts.TILE).

  function chunkKey(cx, cy) {
    return `${cx},${cy}`;
  }

  class Chunk {
    constructor(cx, cy, tiles, stamps) {
      this.cx = cx | 0;
      this.cy = cy | 0;
      this.tiles = tiles; // Uint8Array
      this.stamps = stamps || {};
      this.lastTouched = 0;
    }
  }

  class World {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.timeMinutes = 8 * 60; // start morning
      this.day = 1;

      this._chunks = new Map();
      this._tileScratch = new Uint8Array(LW.consts.CHUNK_TILES * LW.consts.CHUNK_TILES);
      this._anchors = LW.worldgen.featureAnchors(this.seed);

      // Restricted zones (computed from town stamp bounds; stored as rects in tile coords)
      this.restricted = [];
      this._townBounds = null;
      this._nobleLane = null;
      this._barracks = null;
    }

    anchors() {
      return this._anchors;
    }

    setTimeFromSave(day, mins) {
      this.day = day | 0;
      this.timeMinutes = mins | 0;
    }

    advanceTime(dt) {
      // dt in seconds; in-game time scale: 10x (1 real sec = 10 game sec)
      const scale = 10;
      this.timeMinutes += (dt * scale) / 60;
      if (this.timeMinutes >= 1440) {
        this.timeMinutes -= 1440;
        this.day++;
      }
    }

    isNight() {
      const m = this.timeMinutes;
      return m < 6 * 60 || m >= 20 * 60;
    }

    chunkAtWorld(wx, wy) {
      const t = LW.consts.TILE;
      const tx = Math.floor(wx / t);
      const ty = Math.floor(wy / t);
      return this.chunkAtTile(tx, ty);
    }

    chunkAtTile(tx, ty) {
      const csz = LW.consts.CHUNK_TILES;
      const cx = Math.floor(tx / csz);
      const cy = Math.floor(ty / csz);
      return this.ensureChunk(cx, cy);
    }

    ensureChunk(cx, cy) {
      const k = chunkKey(cx, cy);
      let c = this._chunks.get(k);
      if (c) return c;
      const tiles = new Uint8Array(this._tileScratch.length);
      // Generate into scratch then copy (avoid allocations in generator).
      const stamps = LW.worldgen.generateChunk(this.seed, cx, cy, tiles);
      c = new Chunk(cx, cy, tiles, stamps);
      this._chunks.set(k, c);

      // If we got town info in this chunk, cache restricted zones (in tile coords).
      if (stamps && stamps.townInfo) {
        const { nobleLane, barracks, bounds } = stamps.townInfo;
        this._townBounds = bounds;
        this._nobleLane = nobleLane;
        this._barracks = barracks;
      }
      return c;
    }

    streamAround(wx, wy, radiusChunks) {
      const t = LW.consts.TILE;
      const csz = LW.consts.CHUNK_TILES;
      const tx = Math.floor(wx / t);
      const ty = Math.floor(wy / t);
      const pcx = Math.floor(tx / csz);
      const pcy = Math.floor(ty / csz);
      const now = LW.now();
      for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
        for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
          const c = this.ensureChunk(pcx + dx, pcy + dy);
          c.lastTouched = now;
        }
      }

      // Trim old chunks (simple LRU by time).
      // Keep a modest cap for mobile memory.
      const cap = 90;
      if (this._chunks.size <= cap) return;
      // One pass: find cutoff by sorting keys (avoid heavy sort: scan min multiple times is ok small)
      let toRemove = this._chunks.size - cap;
      while (toRemove > 0) {
        let oldestK = null;
        let oldestT = Infinity;
        for (const [k, c] of this._chunks.entries()) {
          if (c.lastTouched < oldestT) {
            oldestT = c.lastTouched;
            oldestK = k;
          }
        }
        if (!oldestK) break;
        this._chunks.delete(oldestK);
        toRemove--;
      }
    }

    tileAt(tx, ty) {
      const csz = LW.consts.CHUNK_TILES;
      const cx = Math.floor(tx / csz);
      const cy = Math.floor(ty / csz);
      const c = this.ensureChunk(cx, cy);
      const ox = cx * csz;
      const oy = cy * csz;
      const lx = tx - ox;
      const ly = ty - oy;
      if (lx < 0 || ly < 0 || lx >= csz || ly >= csz) return T.GRASS;
      return c.tiles[lx + ly * csz];
    }

    tileAtWorld(wx, wy) {
      const t = LW.consts.TILE;
      const tx = Math.floor(wx / t);
      const ty = Math.floor(wy / t);
      return this.tileAt(tx, ty);
    }

    isPassableWorld(wx, wy) {
      const id = this.tileAtWorld(wx, wy);
      return PROPS.passable[id] === 1;
    }

    speedMulAtWorld(wx, wy) {
      const id = this.tileAtWorld(wx, wy);
      return PROPS.speedMul[id] || 1;
    }

    placeNameAtWorld(wx, wy) {
      const t = LW.consts.TILE;
      const tx = Math.floor(wx / t);
      const ty = Math.floor(wy / t);
      const a = this._anchors;
      const dxTown = Math.abs(tx - a.town.x) + Math.abs(ty - a.town.y);
      const dxHam = Math.abs(tx - a.hamlet.x) + Math.abs(ty - a.hamlet.y);
      if (dxTown < 60) return 'Kastellum Town';
      if (dxHam < 60) return 'Hearthmere Hamlet';
      const dxFort = Math.abs(tx - a.fort.x) + Math.abs(ty - a.fort.y);
      if (dxFort < 45) return 'Stonewatch Fort';
      const dxShr = Math.abs(tx - a.shrine.x) + Math.abs(ty - a.shrine.y);
      if (dxShr < 40) return 'Roadside Shrine';
      return 'Frontier Wilds';
    }

    restrictedZoneAtTile(tx, ty) {
      // Returns 0 none, 1 noble, 2 barracks, 3 town wall interior.
      const n = this._nobleLane;
      if (n && tx >= n.x0 && tx <= n.x1 && ty >= n.y0 && ty <= n.y1) return 1;
      const b = this._barracks;
      if (b && tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1) return 2;
      const tb = this._townBounds;
      if (tb && tx >= tb.x0 && tx <= tb.x1 && ty >= tb.y0 && ty <= tb.y1) return 3;
      return 0;
    }
  }

  LW.World = World;
})();

