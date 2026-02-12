(() => {
  'use strict';
  const LW = window.LW;

  // Touch-only input abstraction. No per-frame allocations.
  function Input() {
    this.width = 1;
    this.height = 1;
    this.dpr = 1;

    this.joyActive = false;
    this.joyId = -1;
    this.joyBaseX = 0;
    this.joyBaseY = 0;
    this.joyX = 0;
    this.joyY = 0;
    this.joyDx = 0;
    this.joyDy = 0;
    this.joyMag = 0;

    this.pointerX = 0;
    this.pointerY = 0;

    this.btnAttack = false;
    this.btnBlock = false;
    this.btnDodge = false;
    this.btnInteract = false;
    this._btnInteractPressed = false;
    this._btnDodgePressed = false;

    this._touchLayer = null;
  }

  Input.prototype.onResize = function (w, h, dpr) {
    this.width = w;
    this.height = h;
    this.dpr = dpr;
  };

  Input.prototype.attach = function (touchLayerEl, buttons) {
    this._touchLayer = touchLayerEl;

    const onTouchStart = (e) => {
      e.preventDefault();
      const touches = e.changedTouches;
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        const x = t.clientX;
        const y = t.clientY;
        this.pointerX = x;
        this.pointerY = y;

        const joyZoneW = this.width * LW.consts.JOY_ZONE_FRAC;
        if (!this.joyActive && x <= joyZoneW) {
          this.joyActive = true;
          this.joyId = t.identifier;
          this.joyBaseX = x;
          this.joyBaseY = y;
          this.joyX = x;
          this.joyY = y;
          this._recalcJoy();
        }
      }
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      const touches = e.changedTouches;
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        if (this.joyActive && t.identifier === this.joyId) {
          this.joyX = t.clientX;
          this.joyY = t.clientY;
          this._recalcJoy();
        }
        this.pointerX = t.clientX;
        this.pointerY = t.clientY;
      }
    };
    const onTouchEnd = (e) => {
      e.preventDefault();
      const touches = e.changedTouches;
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        if (this.joyActive && t.identifier === this.joyId) {
          this.joyActive = false;
          this.joyId = -1;
          this.joyDx = 0;
          this.joyDy = 0;
          this.joyMag = 0;
        }
      }
    };

    touchLayerEl.addEventListener('touchstart', onTouchStart, { passive: false });
    touchLayerEl.addEventListener('touchmove', onTouchMove, { passive: false });
    touchLayerEl.addEventListener('touchend', onTouchEnd, { passive: false });
    touchLayerEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Button bindings (touch + pointer fallback).
    const bindHold = (el, field) => {
      const down = (e) => {
        e.preventDefault();
        this[field] = true;
      };
      const up = (e) => {
        e.preventDefault();
        this[field] = false;
      };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    const bindPress = (el, field, pressedField) => {
      const press = (e) => {
        e.preventDefault();
        this[field] = true;
        this[pressedField] = true;
        // release immediately (tap behavior)
        queueMicrotask(() => {
          this[field] = false;
        });
      };
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('pointerdown', press);
    };

    bindHold(buttons.attack, 'btnAttack');
    bindHold(buttons.block, 'btnBlock');
    bindPress(buttons.dodge, 'btnDodge', '_btnDodgePressed');
    bindPress(buttons.interact, 'btnInteract', '_btnInteractPressed');
  };

  Input.prototype._recalcJoy = function () {
    const dx = this.joyX - this.joyBaseX;
    const dy = this.joyY - this.joyBaseY;
    const maxR = Math.min(64, Math.min(this.width, this.height) * 0.12);
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxR * maxR) {
      this.joyDx = dx / maxR;
      this.joyDy = dy / maxR;
    } else {
      const d = Math.sqrt(d2);
      const inv = 1 / d;
      this.joyDx = (dx * inv);
      this.joyDy = (dy * inv);
    }
    const mag = Math.sqrt(this.joyDx * this.joyDx + this.joyDy * this.joyDy);
    this.joyMag = mag > 1 ? 1 : mag;
  };

  Input.prototype.consumePressed = function () {
    // One-shot presses.
    const p = {
      interact: this._btnInteractPressed,
      dodge: this._btnDodgePressed,
    };
    this._btnInteractPressed = false;
    this._btnDodgePressed = false;
    return p;
  };

  LW.Input = Input;
})();

