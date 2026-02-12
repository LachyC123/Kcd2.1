(() => {
  'use strict';
  const LW = window.LW;
  const { T } = LW.tiles;

  // Deterministic chunk generator. Produces:
  // - roads (fast travel)
  // - river band
  // - woodland patches
  // - a walled town and small fort/shrine markers (simple layout)
  // All derived from seed + chunk coords.

  function hash2(seed, x, y) {
    // 32-bit mix
    let h = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca6b)) >>> 0;
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function noise01(seed, x, y) {
    return (hash2(seed, x, y) >>> 8) / 16777216;
  }

  function smoothNoise(seed, x, y) {
    // Value noise on integer lattice, bilinear, deterministic and cheap.
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const n00 = noise01(seed, xi, yi);
    const n10 = noise01(seed, xi + 1, yi);
    const n01 = noise01(seed, xi, yi + 1);
    const n11 = noise01(seed, xi + 1, yi + 1);
    const sx = LW.util.smoothstep(xf);
    const sy = LW.util.smoothstep(yf);
    const nx0 = LW.util.lerp(n00, n10, sx);
    const nx1 = LW.util.lerp(n01, n11, sx);
    return LW.util.lerp(nx0, nx1, sy);
  }

  function fbm(seed, x, y) {
    let v = 0;
    let a = 0.55;
    let f = 1 / 48;
    for (let i = 0; i < 4; i++) {
      v += smoothNoise(seed + i * 1013, x * f, y * f) * a;
      a *= 0.5;
      f *= 2;
    }
    return v;
  }

  function featureAnchors(seed) {
    // Fixed, seed-based anchor points in world tiles.
    // Town near origin; hamlet offset; fort and shrine further.
    const rng = LW.rng.fromSeed(seed ^ 0xabcddcba);
    const town = { x: 48 + rng.iRange(-8, 8), y: 16 + rng.iRange(-6, 6) };
    const hamlet = { x: town.x - 92 + rng.iRange(-8, 8), y: town.y + 40 + rng.iRange(-8, 8) };
    const fort = { x: town.x + 120 + rng.iRange(-12, 12), y: town.y - 64 + rng.iRange(-10, 10) };
    const shrine = { x: town.x + 18 + rng.iRange(-6, 6), y: town.y + 98 + rng.iRange(-8, 8) };
    const gate = { x: town.x - 18, y: town.y + 4 };
    return { town, hamlet, fort, shrine, gate };
  }

  function paintTown(tiles, w, h, ox, oy, anchor) {
    // Very simple "walled town" stamp: rectangular wall with streets + plazas.
    const cx = anchor.x - ox;
    const cy = anchor.y - oy;
    const halfW = 28;
    const halfH = 20;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const inside = dx >= -halfW && dx <= halfW && dy >= -halfH && dy <= halfH;
        if (!inside) continue;
        const border = dx === -halfW || dx === halfW || dy === -halfH || dy === halfH;
        const idx = x + y * w;
        if (border) tiles[idx] = T.WALL;
        else tiles[idx] = T.FLOOR;
      }
    }
    // Main roads crossing
    for (let x = cx - halfW + 1; x <= cx + halfW - 1; x++) {
      const y = cy;
      if (x >= 0 && x < w && y >= 0 && y < h) tiles[x + y * w] = T.ROAD;
    }
    for (let y = cy - halfH + 1; y <= cy + halfH - 1; y++) {
      const x = cx + 4;
      if (x >= 0 && x < w && y >= 0 && y < h) tiles[x + y * w] = T.ROAD;
    }
    // Restricted lane (noble) and barracks zone markers (overlay stored separately by world)
    return {
      bounds: { x0: anchor.x - halfW, y0: anchor.y - halfH, x1: anchor.x + halfW, y1: anchor.y + halfH },
      nobleLane: { x0: anchor.x + 10, y0: anchor.y - 10, x1: anchor.x + 24, y1: anchor.y + 10 },
      barracks: { x0: anchor.x - 8, y0: anchor.y - 16, x1: anchor.x + 6, y1: anchor.y - 6 },
    };
  }

  function paintFort(tiles, w, h, ox, oy, anchor) {
    const cx = anchor.x - ox;
    const cy = anchor.y - oy;
    const half = 10;
    for (let y = cy - half; y <= cy + half; y++) {
      for (let x = cx - half; x <= cx + half; x++) {
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const idx = x + y * w;
        const border = x === cx - half || x === cx + half || y === cy - half || y === cy + half;
        tiles[idx] = border ? T.WALL : T.STONE;
      }
    }
    // Gate gap
    const gx = cx - half;
    const gy = cy + 2;
    if (gx >= 0 && gx < w && gy >= 0 && gy < h) tiles[gx + gy * w] = T.ROAD;
  }

  function paintShrine(tiles, w, h, ox, oy, anchor) {
    const cx = anchor.x - ox;
    const cy = anchor.y - oy;
    for (let y = cy - 4; y <= cy + 4; y++) {
      for (let x = cx - 4; x <= cx + 4; x++) {
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const idx = x + y * w;
        tiles[idx] = T.STONE;
      }
    }
    // small altar marking
    if (cx >= 0 && cx < w && cy >= 0 && cy < h) tiles[cx + cy * w] = T.FLOOR;
  }

  function generateChunk(seed, cx, cy, outTiles) {
    const w = LW.consts.CHUNK_TILES;
    const h = LW.consts.CHUNK_TILES;
    const ox = cx * w;
    const oy = cy * h;

    // Base terrain
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const wx = ox + tx;
        const wy = oy + ty;

        const e = fbm(seed, wx, wy);
        const m = fbm(seed ^ 0x33ccaa11, wx + 1000, wy - 700);

        let t = T.GRASS;

        // River band: meandering near y ~ 36 + noise, blocks movement
        const riverY = 36 + (smoothNoise(seed ^ 0x77aa44ff, wx * 0.03, 0) - 0.5) * 18;
        const distRiver = Math.abs(wy - riverY);
        if (distRiver < 2.2) t = T.WATER;
        else if (distRiver < 3.4) t = T.DIRT;

        // Forest patches where moisture high
        if (t !== T.WATER) {
          const forest = m * 0.8 + e * 0.2;
          if (forest > 0.62) t = T.FOREST;
        }

        // Farms near hamlet / roads later
        outTiles[tx + ty * w] = t;
      }
    }

    // Roads: cardinal grid lines biased by seed, plus a main road linking hamlet -> town -> fort.
    const anchors = featureAnchors(seed);
    const roadFreq = 48;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const wx = ox + tx;
        const wy = oy + ty;
        const idx = tx + ty * w;
        if (outTiles[idx] === T.WATER) continue;
        const gx = (wx + (seed & 31)) % roadFreq;
        const gy = (wy + ((seed >>> 5) & 31)) % roadFreq;
        if (gx === 0 || gy === 0) outTiles[idx] = T.ROAD;
      }
    }

    // Path corridor between anchors (cheap manhattan "highway")
    function paintCorridor(ax, ay, bx, by) {
      // iterate along a simple L-shaped manhattan path and paint within chunk.
      const dx = bx >= ax ? 1 : -1;
      const dy = by >= ay ? 1 : -1;
      for (let x = ax; x !== bx; x += dx) {
        const wx = x, wy = ay;
        if (wx >= ox && wx < ox + w && wy >= oy && wy < oy + h) {
          const tx = wx - ox, ty = wy - oy;
          const idx = tx + ty * w;
          if (outTiles[idx] !== T.WATER) outTiles[idx] = T.ROAD;
        }
      }
      for (let y = ay; y !== by; y += dy) {
        const wx = bx, wy = y;
        if (wx >= ox && wx < ox + w && wy >= oy && wy < oy + h) {
          const tx = wx - ox, ty = wy - oy;
          const idx = tx + ty * w;
          if (outTiles[idx] !== T.WATER) outTiles[idx] = T.ROAD;
        }
      }
    }
    paintCorridor(anchors.hamlet.x, anchors.hamlet.y, anchors.town.x, anchors.town.y);
    paintCorridor(anchors.town.x, anchors.town.y, anchors.fort.x, anchors.fort.y);

    // Stamp structures
    const stamps = { townInfo: null };
    stamps.townInfo = paintTown(outTiles, w, h, ox, oy, anchors.town);
    paintFort(outTiles, w, h, ox, oy, anchors.fort);
    paintShrine(outTiles, w, h, ox, oy, anchors.shrine);

    // Hamlet farmland stamp
    {
      const cxh = anchors.hamlet.x - ox;
      const cyh = anchors.hamlet.y - oy;
      for (let y = cyh - 10; y <= cyh + 10; y++) {
        for (let x = cxh - 14; x <= cxh + 14; x++) {
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          const idx = x + y * w;
          if (outTiles[idx] !== T.WATER && outTiles[idx] !== T.WALL) outTiles[idx] = T.FARMLAND;
        }
      }
      // Hamlet road ring-ish
      for (let x = cxh - 16; x <= cxh + 16; x++) {
        const y = cyh + 12;
        if (x >= 0 && x < w && y >= 0 && y < h) outTiles[x + y * w] = T.ROAD;
      }
    }

    return stamps;
  }

  LW.worldgen = { generateChunk, featureAnchors };
})();

