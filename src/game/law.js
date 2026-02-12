(() => {
  'use strict';
  const LW = window.LW;

  const CRIME = {
    TRESPASS: 'trespass',
    ASSAULT: 'assault',
    MURDER: 'murder',
    STEAL: 'steal',
  };

  function canAccessRestricted(player, zoneId) {
    // Minimal disguise/access system via clothing tags.
    const tag = player.clothing?.tag || 'peasant';
    if (zoneId === 1) return tag === 'noble';
    if (zoneId === 2) return tag === 'guard';
    return true;
  }

  function isWitness(npc) {
    if (!npc || npc.dead) return false;
    if (npc.faction === 'bandits' || npc.faction === 'rebels') return false;
    // sleeping NPCs don't witness
    if (LW.NPC_STATE && npc.state === LW.NPC_STATE.SLEEP) return false;
    return true;
  }

  const law = {
    CRIME,
    reputation: {
      townfolk: 0,
      guards: 0,
      nobles: 0,
      rebels: 0,
    },

    wanted: 0, // 0..3
    wantedBy: 'guards',
    lastCrime: null, // {type, tx,ty, tDay, tMin}

    _trespassT: 0,
    _trespassWarned: false,
    _trespassReported: false,

    arresting: false,
    _arrestCooldown: 0,

    // witness reports queue -> after delay guards become aware
    reports: [], // {npcId, type, tx, ty, delay, severity}

    recordCrime(app, type, wx, wy, severity) {
      if (!app || !app.world) return;
      const t = LW.consts.TILE;
      const tx = Math.floor(wx / t);
      const ty = Math.floor(wy / t);

      this.wanted = Math.max(this.wanted, severity || 1);
      this.wantedBy = 'guards';
      this.lastCrime = { type, tx, ty, tDay: app.world.day | 0, tMin: app.world.timeMinutes | 0 };

      // Witnesses remember + may report after delay
      if (LW.npc && LW.npc.npcs) {
        for (let i = 0; i < LW.npc.npcs.length; i++) {
          const n = LW.npc.npcs[i];
          if (!isWitness(n)) continue;
          const dx = n.x - wx;
          const dy = n.y - wy;
          const dsq = dx * dx + dy * dy;
          if (dsq > 120 * 120) continue;
          // distance-weighted chance
          const chance = LW.clamp(1 - Math.sqrt(dsq) / 120, 0, 1);
          if (n._rng && n._rng.f01() < chance * 0.85) {
            n.remember({ t: app.world.day, type: 'crime', crime: type, tx, ty });
            this.reports.push({
              npcId: n.id,
              type,
              tx,
              ty,
              delay: 6 + (n._rng ? n._rng.f01() * 10 : 8),
              severity: severity || 1,
            });
          }
        }
      }
    },

    onArrestChoice(app, choice) {
      if (!app || !app.world) return;
      if (!this.arresting) return;
      this.arresting = false;
      this._arrestCooldown = 4.0;

      if (choice === 'comply') {
        const fine = Math.min(2, app.player.inventory.coin | 0);
        app.player.inventory.coin -= fine;
        this.reputation.guards -= 5;
        this.reputation.townfolk -= 1;
        this.wanted = 0;
        this._trespassT = 0;
        this._trespassWarned = false;
        this._trespassReported = false;

        // Move player to outside town gate region
        const a = app.world.anchors();
        const t = LW.consts.TILE;
        app.player.x = (a.gate.x - 6 + 0.5) * t;
        app.player.y = (a.gate.y + 4 + 0.5) * t;
        app.world.timeMinutes = (app.world.timeMinutes + 30) % 1440;
        app.ui.toast(`You pay a fine (${fine} coin) and are escorted out.`);
      } else if (choice === 'resist') {
        this.reputation.guards -= 10;
        this.wanted = Math.max(this.wanted, 2);
        // Make nearby guards hostile (combat system will act on this)
        if (LW.npc && LW.npc.npcs) {
          for (let i = 0; i < LW.npc.npcs.length; i++) {
            const n = LW.npc.npcs[i];
            if (n.faction !== 'guards') continue;
            const dx = n.x - app.player.x;
            const dy = n.y - app.player.y;
            if (dx * dx + dy * dy < 160 * 160) n.hostile = true;
          }
        }
        app.ui.toast('You resist arrest. The guards draw steel.');
      }
    },

    update(dt, app) {
      if (!app || !app.world) return;
      this._arrestCooldown = Math.max(0, this._arrestCooldown - dt);

      // Process witness reports after delay -> increases wanted, nudges guard attention
      for (let i = this.reports.length - 1; i >= 0; i--) {
        const r = this.reports[i];
        r.delay -= dt;
        if (r.delay > 0) continue;
        // report lands
        this.wanted = Math.max(this.wanted, r.severity | 0);
        this.lastCrime = { type: r.type, tx: r.tx, ty: r.ty, tDay: app.world.day | 0, tMin: app.world.timeMinutes | 0 };
        LW.util.removeSwap(this.reports, i);
      }

      // Trespass: restricted zones after dark
      const t = LW.consts.TILE;
      const ptx = Math.floor(app.player.x / t);
      const pty = Math.floor(app.player.y / t);
      const zone = app.world.restrictedZoneAtTile(ptx, pty);
      const night = app.world.isNight();
      const trespass = night && (zone === 1 || zone === 2) && !canAccessRestricted(app.player, zone);

      if (trespass) {
        this._trespassT += dt;
        if (!this._trespassWarned && this._trespassT > 1.0) {
          this._trespassWarned = true;
          app.ui.toast(zone === 2 ? 'Restricted: Barracks. Leave.' : 'Restricted: Noble lane. Leave.');
          // nearby guard bark
          const g = LW.npc?.nearestTo ? LW.npc.nearestTo(app, app.player.x, app.player.y, 120) : null;
          if (g && g.faction === 'guards') LW.npc.say(app, g, '“Out. Now.”', 2.0);
        }
        if (!this._trespassReported && this._trespassT > 6.0) {
          this._trespassReported = true;
          this.recordCrime(app, CRIME.TRESPASS, app.player.x, app.player.y, 1);
        }
      } else {
        this._trespassT = Math.max(0, this._trespassT - dt * 1.8);
        if (this._trespassT <= 0.05) {
          this._trespassWarned = false;
          this._trespassReported = false;
        }
      }

      // Arrest attempt if wanted and guard is close
      if (this.wanted > 0 && !this.arresting && this._arrestCooldown <= 0 && !app.dialogue.active) {
        // Find nearby guard
        let guard = null;
        if (LW.npc && LW.npc.npcs) {
          let best = 80 * 80;
          for (let i = 0; i < LW.npc.npcs.length; i++) {
            const n = LW.npc.npcs[i];
            if (n.faction !== 'guards' || n.dead) continue;
            const dx = n.x - app.player.x;
            const dy = n.y - app.player.y;
            const dsq = dx * dx + dy * dy;
            if (dsq < best) {
              best = dsq;
              guard = n;
            }
          }
        }
        if (guard && !guard.hostile) {
          this.arresting = true;
          app.menu.showArrest('A guard steps in front of you. “By the King’s peace, you will come with us.”');
        }
      }
    },
  };

  LW.law = law;
})();

