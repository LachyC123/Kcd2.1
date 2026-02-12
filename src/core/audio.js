(() => {
  'use strict';
  const LW = window.LW;

  // Optional tiny audio. Must not block gameplay if unavailable.
  function AudioSys() {
    this.ctx = null;
    this.enabled = false;
    this._lastTap = 0;
  }

  AudioSys.prototype.initIfNeeded = function () {
    if (this.ctx || this.enabled === false) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.enabled = true;
    } catch {
      this.enabled = false;
    }
  };

  AudioSys.prototype.userGesture = function () {
    // call from any touch; attempts resume.
    if (!this.ctx) this.initIfNeeded();
    if (!this.ctx) return;
    const now = LW.now();
    if (now - this._lastTap < 120) return;
    this._lastTap = now;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  };

  AudioSys.prototype.beep = function (freq, dur, type, gain) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq || 440;
    g.gain.value = gain != null ? gain : 0.03;
    g.gain.setTargetAtTime(0.0001, t0 + (dur || 0.06), 0.04);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + (dur || 0.06));
  };

  LW.audio = new AudioSys();
})();

