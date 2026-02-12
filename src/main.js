(() => {
  'use strict';
  const LW = window.LW;

  function App() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;

    this.seed = 0;
    this.world = null;
    this.entities = new LW.EntityWorld();
    this.player = new LW.Player();

    this.loop = new LW.Loop();
    this.input = new LW.Input();
    this.ui = new LW.UI(document.getElementById('uiRoot'));
    this.dialogue = new LW.Dialogue();
    this.menu = new LW.Menu(this);

    this.cameraX = 0;
    this.cameraY = 0;

    this._w = 1;
    this._h = 1;
    this._dpr = 1;

    this._debugText = '';
    this._debugT = 0;
    this._vignette = null;

    this._bindUI();
    this._bindCanvasResize();

    // Start paused at menu; will create world on new/continue.
    this.menu.openMenu();
  }

  App.prototype._bindUI = function () {
    const touchLayer = document.getElementById('touchLayer');
    const buttons = {
      attack: document.getElementById('btnAttack'),
      block: document.getElementById('btnBlock'),
      dodge: document.getElementById('btnDodge'),
      interact: document.getElementById('btnInteract'),
    };
    this.input.attach(touchLayer, buttons);

    // User gesture: unlock audio.
    touchLayer.addEventListener(
      'touchstart',
      () => {
        LW.audio.userGesture();
      },
      { passive: true }
    );
  };

  App.prototype._bindCanvasResize = function () {
    const onResize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.min(2.25, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const bw = Math.floor(w * dpr);
      const bh = Math.floor(h * dpr);
      if (this.canvas.width !== bw || this.canvas.height !== bh) {
        this.canvas.width = bw;
        this.canvas.height = bh;
      }
      this._w = w;
      this._h = h;
      this._dpr = dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.input.onResize(w, h, dpr);
      this._vignette = null;
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    onResize();
  };

  App.prototype.newGame = function () {
    // Fresh seed; deterministic world.
    const seed = (LW.now() * 1000) >>> 0;
    this._initWorld(seed, true);
    this.saveGame();
    this.ui.toast('New game started.');
  };

  App.prototype.continueGame = function () {
    const save = LW.storage.load();
    if (!save) {
      this.ui.toast('No save found.');
      return;
    }
    this._initWorld(save.seed >>> 0, false);
    this.loadFromSave(save);
    this.ui.toast('Loaded save.');
  };

  App.prototype._initWorld = function (seed, fresh) {
    this.seed = seed >>> 0;
    this.world = new LW.World(this.seed);
    this.entities = new LW.EntityWorld();
    this.player = new LW.Player();
    this.entities.add(this.player);

    // Spawn at hamlet.
    const a = this.world.anchors().hamlet;
    const t = LW.consts.TILE;
    this.player.x = (a.x + 1) * t + t * 0.5;
    this.player.y = (a.y + 2) * t + t * 0.5;
    this.cameraX = this.player.x;
    this.cameraY = this.player.y;

    // Spawn living world NPCs for this seed.
    if (LW.npc && LW.npc.spawnForWorld) LW.npc.spawnForWorld(this);

    // Start loop if needed.
    if (!this._running) {
      this._running = true;
      this._startLoop();
    }

    if (fresh) {
      LW.law.reputation.townfolk = 0;
      LW.law.reputation.guards = 0;
      LW.law.reputation.nobles = 0;
      LW.law.reputation.rebels = 0;
      if (LW.quests && LW.quests.reset) LW.quests.reset();
    }
  };

  App.prototype._startLoop = function () {
    this.loop.onUpdate = (dt) => this.update(dt);
    this.loop.onRender = (a) => this.render(a);
    this.loop.start();
  };

  App.prototype.saveGame = function () {
    if (!this.world) return false;
    const data = {
      v: 1,
      seed: this.seed >>> 0,
      day: this.world.day | 0,
      timeMinutes: this.world.timeMinutes | 0,
      player: this.player.serialize(),
      law: LW.law && LW.law.serialize ? LW.law.serialize() : { reputation: LW.law.reputation },
      quests: LW.quests && LW.quests.serialize ? LW.quests.serialize() : null,
      worldState: LW.npc && LW.npc.serializeWorldState ? LW.npc.serializeWorldState() : null,
    };
    return LW.storage.save(data);
  };

  App.prototype.loadFromSave = function (data) {
    if (!data) return;
    if (data.day != null && data.timeMinutes != null) this.world.setTimeFromSave(data.day, data.timeMinutes);
    this.player.deserialize(data.player);
    if (data.law && LW.law && LW.law.deserialize) LW.law.deserialize(data.law);
    else if (data.rep) LW.law.reputation = data.rep;
    if (data.quests && LW.quests && LW.quests.deserialize) LW.quests.deserialize(data.quests);
    if (data.worldState && LW.npc && LW.npc.applyWorldState) LW.npc.applyWorldState(this, data.worldState);
  };

  App.prototype.update = function (dt) {
    if (!this.world) return;
    this.world.advanceTime(dt);

    // Stream around player.
    this.world.streamAround(this.player.x, this.player.y, 2);

    const uiLocked = this._isUiBlocking();

    if (!uiLocked) {
      // Player movement (touch joystick).
      const ix = this.input.joyDx;
      const iy = this.input.joyDy;
      const mag = this.input.joyMag;
      const move = LW.math.norm(ix, iy);
      if (move.d > 0.001) this.player.facing = LW.math.angleTo(move.x, move.y);

      this.player.blocking = !!this.input.btnBlock;
      const running = mag > 0.72 && !this.player.blocking;

      // Stamina regen/usage
      const staRegen = this.player.blocking ? 6 : 10;
      this.player.sta = Math.min(this.player.staMax, this.player.sta + staRegen * dt);
      if (running) this.player.sta = Math.max(0, this.player.sta - 14 * dt);
      const tired = this.player.sta <= 8;
      const speedMul = this.world.speedMulAtWorld(this.player.x, this.player.y);
      const base = this.player.speed * speedMul * (running && !tired ? this.player.runMul : 1);

      const vx = move.x * base * mag;
      const vy = move.y * base * mag;
      this._moveWithCollision(this.player, vx, vy, dt);

      // Inputs (one-shots)
      const pressed = this.input.consumePressed();
      if (pressed.interact) this._tryInteract();
      if (pressed.dodge) this._tryDodge();
    } else {
      // UI panels open: prevent accidental actions.
      this.player.blocking = false;
      this.input.consumePressed();
    }

    // Systems (stubbed for now)
    LW.npc.update(dt, this);
    LW.law.update(dt, this);
    LW.combat.update(dt, this);
    LW.quests.update(dt, this);

    // Camera follow (tight)
    this.cameraX = LW.util.lerp(this.cameraX, this.player.x, 0.18);
    this.cameraY = LW.util.lerp(this.cameraY, this.player.y, 0.18);

    this.ui.update(this);

    // Autosave occasionally
    this._autosaveT = (this._autosaveT || 0) + dt;
    if (this._autosaveT > 10) {
      this._autosaveT = 0;
      this.saveGame();
    }
  };

  App.prototype._moveWithCollision = function (e, vx, vy, dt) {
    const nx = e.x + vx * dt;
    const ny = e.y + vy * dt;
    // simple tile collision: separate axis
    if (this.world.isPassableWorld(nx, e.y)) e.x = nx;
    if (this.world.isPassableWorld(e.x, ny)) e.y = ny;
  };

  App.prototype._tryInteract = function () {
    if (this.dialogue.active) return;

    // Prefer interacting with nearest NPC in range.
    const near = LW.npc && LW.npc.nearestTo ? LW.npc.nearestTo(this, this.player.x, this.player.y, 40) : null;
    if (near) {
      LW.npc.openDialogue(this, near);
      return;
    }

    // World interactions (jobs/props)
    if (LW.quests && LW.quests.tryInteract && LW.quests.tryInteract(this)) return;

    // Fallback: open a dialogue with "self" tips.
    const w = this.world;
    const t = LW.consts.TILE;
    const tx = Math.floor(this.player.x / t);
    const ty = Math.floor(this.player.y / t);
    const rz = w.restrictedZoneAtTile(tx, ty);
    const hint =
      rz === 1
        ? 'This lane feels watched — the wealthy keep it private.'
        : rz === 2
          ? 'Barracks air: oil, sweat, and hard rules.'
          : rz === 3
            ? 'The town walls loom. The city has its own peace.'
            : 'You scan the road for purpose.';

    this.dialogue.open({
      title: 'Thoughts',
      body: hint,
      choices: [
        {
          label: 'Save',
          onPick: () => {
            this.saveGame();
            LW.audio.beep(520, 0.05, 'triangle', 0.02);
            this.ui.toast('Game saved.');
          },
        },
        {
          label: 'Close',
          onPick: () => this.dialogue.close(),
        },
      ],
    });
  };

  App.prototype._tryDodge = function () {
    // Simple stamina dodge step.
    if (this.player.sta < 18) {
      this.ui.toast('Too tired to dodge.');
      return;
    }
    this.player.sta -= 18;
    const step = 46;
    const ax = Math.cos(this.player.facing);
    const ay = Math.sin(this.player.facing);
    const nx = this.player.x + ax * step;
    const ny = this.player.y + ay * step;
    if (this.world.isPassableWorld(nx, this.player.y)) this.player.x = nx;
    if (this.world.isPassableWorld(this.player.x, ny)) this.player.y = ny;
    LW.audio.beep(330, 0.05, 'square', 0.015);
  };

  App.prototype._tryAttack = function () {
    // Attacks are handled by `LW.combat` (kept for backwards safety).
  };

  App.prototype.render = function () {
    if (!this.world) {
      // Clear
      this.ctx.fillStyle = LW.tiles.PAL.bg;
      this.ctx.fillRect(0, 0, this._w, this._h);
      return;
    }
    const ctx = this.ctx;
    const { PROPS } = LW.tiles;

    // Day/night tint
    const night = this.world.isNight();
    ctx.fillStyle = night ? '#100d0a' : '#17130e';
    ctx.fillRect(0, 0, this._w, this._h);

    const t = LW.consts.TILE;
    const camX = this.cameraX;
    const camY = this.cameraY;

    const viewW = this._w;
    const viewH = this._h;
    const left = camX - viewW * 0.5;
    const top = camY - viewH * 0.5;

    // Tile range
    const tx0 = Math.floor(left / t) - 1;
    const ty0 = Math.floor(top / t) - 1;
    const tx1 = Math.floor((left + viewW) / t) + 2;
    const ty1 = Math.floor((top + viewH) / t) + 2;

    // Draw tiles
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const id = this.world.tileAt(tx, ty);
        const x = tx * t - left;
        const y = ty * t - top;

        // base fill
        ctx.fillStyle = PROPS.baseCol[id] || '#2a251f';
        ctx.fillRect(x, y, t, t);

        // silhouette outline (subtle)
        ctx.strokeStyle = night ? 'rgba(239,231,214,0.06)' : 'rgba(239,231,214,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, t - 1, t - 1);

        // Road highlight
        if (id === LW.tiles.T.ROAD) {
          ctx.fillStyle = night ? 'rgba(224,184,106,0.06)' : 'rgba(224,184,106,0.10)';
          ctx.fillRect(x + 2, y + 2, t - 4, t - 4);
        }
      }
    }

    // World markers (jobs/training)
    if (LW.quests && LW.quests.render) LW.quests.render(ctx, this, left, top);

    // Subtle vignette/shadow (reduced in low power)
    if (!LW.flags.lowPower) {
      if (!this._vignette || this._vignette.w !== viewW || this._vignette.h !== viewH || this._vignette.night !== night) {
        const g = ctx.createRadialGradient(
          viewW * 0.5,
          viewH * 0.5,
          30,
          viewW * 0.5,
          viewH * 0.5,
          Math.max(viewW, viewH) * 0.75
        );
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, night ? 'rgba(0,0,0,0.50)' : 'rgba(0,0,0,0.34)');
        this._vignette = { w: viewW, h: viewH, night, g };
      }
      ctx.fillStyle = this._vignette.g;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // Draw player paper-doll silhouette
    // NPCs first, then player on top (simple ordering).
    if (LW.npc && LW.npc.npcs) {
      for (let i = 0; i < LW.npc.npcs.length; i++) {
        const n = LW.npc.npcs[i];
        if (n && !n.dead) this._drawPerson(n, left, top, false);
      }
    }
    this._drawPerson(this.player, left, top, true);

    // Speech bubbles
    if (LW.npc && LW.npc.bubbles) this._drawBubbles(left, top);

    // Debug overlay
    if (LW.flags.debug) this._drawDebug(left, top);

    // Joystick hint ring
    this._drawJoystick();
  };

  App.prototype._drawPerson = function (e, left, top, isPlayer) {
    const ctx = this.ctx;
    const x = e.x - left;
    const y = e.y - top;

    // Body proportions (procedural paper-doll)
    const facing = e.facing || 0;
    const fx = Math.cos(facing);
    const fy = Math.sin(facing);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(x, y + 8, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Colors (faction/rank silhouette)
    const ink = 'rgba(10,8,6,0.92)';
    const paper = isPlayer ? 'rgba(239,231,214,0.90)' : 'rgba(239,231,214,0.82)';
    let cloth = isPlayer ? 'rgba(193,139,58,0.78)' : 'rgba(193,139,58,0.58)';
    if (!isPlayer && e && e.faction) {
      if (e.faction === 'guards') cloth = 'rgba(47,122,76,0.62)';
      else if (e.faction === 'nobles') cloth = 'rgba(224,184,106,0.72)';
      else if (e.faction === 'rebels') cloth = 'rgba(179,58,46,0.58)';
      else if (e.faction === 'bandits') cloth = 'rgba(33,30,26,0.72)';
    }

    // Torso
    ctx.fillStyle = cloth;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 5, y - 9, 10, 14, 4);
    ctx.fill();
    ctx.stroke();

    // Head
    ctx.fillStyle = paper;
    ctx.beginPath();
    ctx.ellipse(x + fx * 1.5, y - 14 + fy * 1.0, 4.2, 4.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Legs
    ctx.fillStyle = 'rgba(217,207,187,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 5);
    ctx.lineTo(x - 4, y + 12);
    ctx.moveTo(x + 2, y + 5);
    ctx.lineTo(x + 4, y + 12);
    ctx.strokeStyle = ink;
    ctx.stroke();

    // Weapon hint
    ctx.strokeStyle = isPlayer ? 'rgba(224,184,106,0.85)' : 'rgba(224,184,106,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + fx * 6, y - 2 + fy * 6);
    ctx.lineTo(x + fx * 10, y + 3 + fy * 10);
    ctx.stroke();

    // Telegraph (windup): readable red arc
    if (!isPlayer && e.atkPhase === 1) {
      ctx.strokeStyle = 'rgba(179,58,46,0.78)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 2, 14, facing - 0.8, facing + 0.8);
      ctx.stroke();
    }

    // Hostile marker
    if (!isPlayer && e.hostile) {
      ctx.fillStyle = 'rgba(179,58,46,0.86)';
      ctx.beginPath();
      ctx.ellipse(x, y - 24, 4.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Block stance
    if (isPlayer && e.blocking) {
      ctx.strokeStyle = 'rgba(239,231,214,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 2, 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  App.prototype._drawBubbles = function (left, top) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < LW.npc.bubbles.length; i++) {
      const b = LW.npc.bubbles[i];
      const x = b.x - left;
      const y = b.y - top - 28;
      const text = b.text;
      const padX = 8;
      const padY = 6;
      const tw = ctx.measureText(text).width;
      const w = Math.min(260, tw + padX * 2);
      const h = 22;
      const bx = x - w * 0.5;
      const by = y - h;

      ctx.fillStyle = 'rgba(20,17,13,0.82)';
      ctx.strokeStyle = 'rgba(239,231,214,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, w, h, 10);
      ctx.fill();
      ctx.stroke();

      // tail
      ctx.fillStyle = 'rgba(20,17,13,0.82)';
      ctx.beginPath();
      ctx.moveTo(x - 4, by + h);
      ctx.lineTo(x + 4, by + h);
      ctx.lineTo(x, by + h + 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(239,231,214,0.92)';
      const clipped = text.length > 56 ? text.slice(0, 55) + '…' : text;
      ctx.fillText(clipped, bx + padX, by + h * 0.5);
    }
    ctx.restore();
  };

  App.prototype._drawDebug = function (left, top) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(20,17,13,0.78)';
    ctx.strokeStyle = 'rgba(239,231,214,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(12, 64, 240, 152, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(239,231,214,0.92)';
    ctx.font = '12px system-ui, sans-serif';
    const t = LW.consts.TILE;
    const tx = Math.floor(this.player.x / t);
    const ty = Math.floor(this.player.y / t);
    const csz = LW.consts.CHUNK_TILES;
    const cx = Math.floor(tx / csz);
    const cy = Math.floor(ty / csz);
    const lines = [
      `Ent: ${this.entities.entities.length}`,
      `Chunks: ${this.world._chunks.size}`,
      `Tile: ${tx},${ty}`,
      `Chunk: ${cx},${cy}`,
      `Night: ${this.world.isNight() ? 'yes' : 'no'}`,
      `Wanted: ${LW.law?.wanted ?? 0}`,
      `Rep (G/T/N/R): ${LW.law?.reputation?.guards ?? 0}/${LW.law?.reputation?.townfolk ?? 0}/${LW.law?.reputation?.nobles ?? 0}/${LW.law?.reputation?.rebels ?? 0}`,
      `Path: ${LW.path?.stats?.hits ?? 0} hit / ${LW.path?.stats?.requests ?? 0} req`,
    ];
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 22, 88 + i * 16);
    ctx.restore();
  };

  App.prototype._drawJoystick = function () {
    if (!this.input.joyActive) return;
    const ctx = this.ctx;
    const bx = this.input.joyBaseX;
    const by = this.input.joyBaseY;
    const x = this.input.joyX;
    const y = this.input.joyY;
    ctx.save();
    ctx.strokeStyle = 'rgba(239,231,214,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(224,184,106,0.38)';
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  App.prototype._isUiBlocking = function () {
    // Any full-screen panel blocks gameplay input.
    if (this.dialogue && this.dialogue.active) return true;
    if (this.menu) {
      if (this.menu.panel.classList.contains('show')) return true;
      if (this.menu.panelHelp.classList.contains('show')) return true;
      if (this.menu.panelArrest.classList.contains('show')) return true;
    }
    return false;
  };

  App.prototype.onArrestChoice = function (choice) {
    if (LW.law && LW.law.onArrestChoice) LW.law.onArrestChoice(this, choice);
  };

  LW.app = new App();
})();

