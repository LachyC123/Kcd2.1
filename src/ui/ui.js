(() => {
  'use strict';
  const LW = window.LW;

  function UI(root) {
    this.root = root;
    this.el = {
      hudTime: document.getElementById('hudTime'),
      hudPlace: document.getElementById('hudPlace'),
      hudHp: document.getElementById('hudHp'),
      hudSta: document.getElementById('hudSta'),
      hudRep: document.getElementById('hudRep'),
      hudSeed: document.getElementById('hudSeed'),
      hudFps: document.getElementById('hudFps'),
      toast: document.getElementById('toast'),
    };
    this._toastT = 0;
    this._toastDur = 0;
  }

  UI.prototype.toast = function (text, ms) {
    const el = this.el.toast;
    el.textContent = text;
    el.classList.add('show');
    this._toastT = LW.now();
    this._toastDur = ms || 1400;
  };

  UI.prototype.update = function (app) {
    const w = app.world;
    const p = app.player;
    this.el.hudTime.textContent = `${w.day} • ${LW.util.fmtTimeMinutes(w.timeMinutes | 0)}`;
    this.el.hudPlace.textContent = w.placeNameAtWorld(p.x, p.y);
    const hp = LW.clamp(p.hp / p.hpMax, 0, 1);
    const sta = LW.clamp(p.sta / p.staMax, 0, 1);
    this.el.hudHp.style.width = `${Math.round(hp * 100)}%`;
    this.el.hudSta.style.width = `${Math.round(sta * 100)}%`;
    this.el.hudSeed.textContent = String(app.seed >>> 0);
    this.el.hudFps.textContent = app.loop ? String(app.loop.fps()) : '—';
    this.el.hudRep.textContent = String(LW.law?.reputation?.townfolk ?? 0);

    // Toast timeout
    if (this.el.toast.classList.contains('show')) {
      const now = LW.now();
      if (now - this._toastT > this._toastDur) this.el.toast.classList.remove('show');
    }
  };

  LW.UI = UI;
})();

