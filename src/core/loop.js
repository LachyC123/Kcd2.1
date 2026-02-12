(() => {
  'use strict';
  const LW = window.LW;

  function Loop() {
    this._running = false;
    this._last = 0;
    this._acc = 0;
    this._raf = 0;
    this._frames = 0;
    this._fps = 0;
    this._fpsT = 0;

    this.onUpdate = null; // (dtFixed)=>void
    this.onRender = null; // (alpha)=>void
  }

  Loop.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    this._last = LW.now();
    this._acc = 0;
    this._frames = 0;
    this._fps = 0;
    this._fpsT = this._last;
    const tick = () => {
      if (!this._running) return;
      const now = LW.now();
      let frameDt = (now - this._last) / 1000;
      this._last = now;
      if (frameDt > LW.consts.MAX_FRAME_DT) frameDt = LW.consts.MAX_FRAME_DT;
      this._acc += frameDt;

      let steps = 0;
      const dt = LW.consts.FIXED_DT;
      while (this._acc >= dt && steps < LW.consts.SIM_STEPS_CAP) {
        if (this.onUpdate) this.onUpdate(dt);
        this._acc -= dt;
        steps++;
      }
      // If falling behind hard, drop remaining accumulator.
      if (steps === LW.consts.SIM_STEPS_CAP) this._acc = 0;

      const alpha = this._acc / dt;
      if (this.onRender) this.onRender(alpha);

      // FPS
      this._frames++;
      const elapsed = now - this._fpsT;
      if (elapsed >= 500) {
        this._fps = Math.round((this._frames * 1000) / elapsed);
        this._frames = 0;
        this._fpsT = now;
      }

      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  };

  Loop.prototype.stop = function () {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };

  Loop.prototype.fps = function () {
    return this._fps;
  };

  LW.Loop = Loop;
})();

(() => {
  'use strict';
  const LW = window.LW;

  function Loop() {
    this._running = false;
    this._last = 0;
    this._acc = 0;
    this._raf = 0;
    this._frames = 0;
    this._fps = 0;
    this._fpsT = 0;

    this.onUpdate = null; // (dtFixed)=>void
    this.onRender = null; // (alpha)=>void
  }

  Loop.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    this._last = LW.now();
    this._acc = 0;
    this._frames = 0;
    this._fps = 0;
    this._fpsT = this._last;
    const tick = () => {
      if (!this._running) return;
      const now = LW.now();
      let frameDt = (now - this._last) / 1000;
      this._last = now;
      if (frameDt > LW.consts.MAX_FRAME_DT) frameDt = LW.consts.MAX_FRAME_DT;
      this._acc += frameDt;

      let steps = 0;
      const dt = LW.consts.FIXED_DT;
      while (this._acc >= dt && steps < LW.consts.SIM_STEPS_CAP) {
        if (this.onUpdate) this.onUpdate(dt);
        this._acc -= dt;
        steps++;
      }
      // If falling behind hard, drop remaining accumulator.
      if (steps === LW.consts.SIM_STEPS_CAP) this._acc = 0;

      const alpha = this._acc / dt;
      if (this.onRender) this.onRender(alpha);

      // FPS
      this._frames++;
      const elapsed = now - this._fpsT;
      if (elapsed >= 500) {
        this._fps = Math.round((this._frames * 1000) / elapsed);
        this._frames = 0;
        this._fpsT = now;
      }

      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  };

  Loop.prototype.stop = function () {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  };

  Loop.prototype.fps = function () {
    return this._fps;
  };

  LW.Loop = Loop;
})();

