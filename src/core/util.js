(() => {
  'use strict';
  const LW = window.LW;

  LW.util = {
    lerp(a, b, t) {
      return a + (b - a) * t;
    },
    invLerp(a, b, v) {
      return b !== a ? (v - a) / (b - a) : 0;
    },
    smoothstep(t) {
      t = LW.clamp(t, 0, 1);
      return t * t * (3 - 2 * t);
    },
    hashStr(s) {
      // FNV-1a 32-bit
      let h = 0x811c9dc5 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    },
    fmtTimeMinutes(mins) {
      mins = ((mins % 1440) + 1440) % 1440;
      const hh = (mins / 60) | 0;
      const mm = mins % 60;
      const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
      return `${pad2(hh)}:${pad2(mm)}`;
    },
    pick(rng, arr) {
      return arr[(rng.u32() % arr.length) | 0];
    },
    removeSwap(arr, idx) {
      const last = arr.length - 1;
      if (idx < 0 || idx > last) return;
      if (idx !== last) arr[idx] = arr[last];
      arr.pop();
    },
  };

  // Canvas compatibility: roundRect is missing on some engines.
  // Adds a minimal polyfill for path building (not perfect, but good enough for UI cards).
  try {
    const proto = CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (proto && !proto.roundRect) {
      proto.roundRect = function (x, y, w, h, r) {
        const rr = typeof r === 'number' ? r : (r && r[0]) || 0;
        const rad = Math.max(0, Math.min(rr, Math.min(w, h) * 0.5));
        this.beginPath();
        this.moveTo(x + rad, y);
        this.lineTo(x + w - rad, y);
        this.quadraticCurveTo(x + w, y, x + w, y + rad);
        this.lineTo(x + w, y + h - rad);
        this.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
        this.lineTo(x + rad, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - rad);
        this.lineTo(x, y + rad);
        this.quadraticCurveTo(x, y, x + rad, y);
        return this;
      };
    }
  } catch {
    // ignore
  }
})();

