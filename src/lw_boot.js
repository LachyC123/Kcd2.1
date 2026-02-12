(() => {
  'use strict';
  // Single global namespace (file:// friendly, no imports).
  const LW = (window.LW = window.LW || {});
  LW.VERSION = '0.1.0';

  LW.now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  LW.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  LW.assert = (cond, msg) => {
    if (!cond) throw new Error(msg || 'Assertion failed');
  };

  LW.flags = {
    debug: false,
    lowPower: false,
  };

  LW.consts = {
    TILE: 16, // world units
    CHUNK_TILES: 32,
    CHUNK_SIZE: 32 * 16, // in world units
    FIXED_DT: 1 / 60,
    MAX_FRAME_DT: 1 / 15,
    SIM_STEPS_CAP: 5,
    // Mobile UX: joystick and action regions
    JOY_ZONE_FRAC: 0.55, // left portion of screen used for joystick
  };
})();
