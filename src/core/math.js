(() => {
  'use strict';
  const LW = window.LW;

  LW.math = {
    TAU: Math.PI * 2,
    len2(x, y) {
      return Math.sqrt(x * x + y * y);
    },
    len2sq(x, y) {
      return x * x + y * y;
    },
    norm(x, y) {
      const d = Math.sqrt(x * x + y * y);
      if (d < 1e-8) return { x: 0, y: 0, d: 0 };
      return { x: x / d, y: y / d, d };
    },
    dot(ax, ay, bx, by) {
      return ax * bx + ay * by;
    },
    angleTo(x, y) {
      return Math.atan2(y, x);
    },
    wrapAngle(a) {
      while (a <= -Math.PI) a += Math.PI * 2;
      while (a > Math.PI) a -= Math.PI * 2;
      return a;
    },
  };
})();

