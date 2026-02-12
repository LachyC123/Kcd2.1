(() => {
  'use strict';
  const LW = window.LW;

  const qs = {
    wood: {
      // repeatable job: chop at woodpile, deliver to foreman for coin
      enabled: true,
    },
    courier: {
      stage: 0, // 0 none, 1 carrying letter, 2 delivered
      cooldown: 0,
    },
    spar: {
      active: false,
      trainerId: 0,
      endCd: 0,
    },

    reset() {
      this.wood = { enabled: true };
      this.courier = { stage: 0, cooldown: 0 };
      this.spar = { active: false, trainerId: 0, endCd: 0 };
    },

    markers(app) {
      const a = app.world.anchors();
      return {
        woodpile: { tx: a.hamlet.x - 8, ty: a.hamlet.y + 14 },
        training: { tx: a.town.x - 6, ty: a.town.y - 14 },
        clerk: { tx: a.town.x + 2, ty: a.town.y + 1 },
      };
    },

    serialize() {
      return {
        wood: this.wood,
        courier: this.courier,
        spar: this.spar,
      };
    },
    deserialize(s) {
      if (!s) return;
      if (s.wood) this.wood = s.wood;
      if (s.courier) this.courier = s.courier;
      if (s.spar) this.spar = s.spar;
    },

    update(dt, app) {
      if (!app.world) return;
      if (this.courier.cooldown > 0) this.courier.cooldown = Math.max(0, this.courier.cooldown - dt);

      // Sparring end check
      if (this.spar.active) {
        const trainer = app.entities.get(this.spar.trainerId);
        if (!trainer || trainer.dead) {
          this.spar.active = false;
          return;
        }
        this.spar.endCd = Math.max(0, this.spar.endCd - dt);

        // End if someone is low
        if (trainer.hp <= 6 || app.player.hp <= 6) {
          if (this.spar.endCd <= 0) {
            this._endSpar(app, trainer);
            this.spar.endCd = 2.0;
          }
        }
      }
    },

    render(ctx, app, left, top) {
      if (!app.world) return;
      const t = LW.consts.TILE;
      const m = this.markers(app);

      const drawMarker = (tx, ty, col, label) => {
        const x = (tx + 0.5) * t - left;
        const y = (ty + 0.5) * t - top;
        ctx.save();
        ctx.fillStyle = col;
        ctx.strokeStyle = 'rgba(10,8,6,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, 6, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (LW.flags.debug) {
          ctx.font = '11px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(239,231,214,0.82)';
          ctx.fillText(label, x + 10, y + 4);
        }
        ctx.restore();
      };

      drawMarker(m.woodpile.tx, m.woodpile.ty, 'rgba(224,184,106,0.82)', 'Woodpile');
      drawMarker(m.training.tx, m.training.ty, 'rgba(47,122,76,0.72)', 'Training');
      drawMarker(m.clerk.tx, m.clerk.ty, 'rgba(239,231,214,0.72)', 'Clerk');
    },

    tryInteract(app) {
      if (!app.world) return false;
      const t = LW.consts.TILE;
      const ptx = Math.floor(app.player.x / t);
      const pty = Math.floor(app.player.y / t);
      const m = this.markers(app);

      // Woodpile interaction
      if (Math.abs(ptx - m.woodpile.tx) <= 1 && Math.abs(pty - m.woodpile.ty) <= 1) {
        if (app.player.sta < 8) {
          app.ui.toast('Too tired to chop.');
          return true;
        }
        app.player.sta -= 8;
        app.player.inventory.wood = (app.player.inventory.wood | 0) + 1;
        LW.audio.beep(260, 0.05, 'square', 0.015);
        app.ui.toast(`Chopped wood. You carry ${app.player.inventory.wood}.`);
        return true;
      }

      return false;
    },

    getDialogueChoices(app, npc) {
      const choices = [];
      const inv = app.player.inventory;

      if (npc.key === 'foreman') {
        choices.push({
          label: inv.wood > 0 ? `Deliver wood (${inv.wood})` : 'Ask for work',
          onPick: () => {
            if (inv.wood <= 0) {
              app.ui.toast('“Woodpile’s by the road. Chop, then bring it to me.”');
              return;
            }
            const pay = inv.wood;
            inv.wood = 0;
            inv.coin = (inv.coin | 0) + pay;
            LW.law.reputation.townfolk += 1;
            if (LW.npc && LW.npc.say) LW.npc.say(app, npc, '“Good. Coin for labor.”', 2.2);
            app.ui.toast(`Paid ${pay} coin.`);
          },
        });
      }

      if (npc.key === 'courier') {
        if (this.courier.stage === 0 && !inv.letter && this.courier.cooldown <= 0) {
          choices.push({
            label: 'Courier work',
            onPick: () => {
              this.courier.stage = 1;
              inv.letter = true;
              app.ui.toast('You take a sealed letter for the town clerk.');
            },
          });
        } else if (this.courier.stage === 1 && inv.letter) {
          choices.push({
            label: 'About the letter',
            onPick: () => {
              app.ui.toast('“Find the clerk inside Kastellum. Don’t open it.”');
            },
          });
        } else if (this.courier.cooldown > 0) {
          choices.push({
            label: 'Any work?',
            onPick: () => app.ui.toast('“Not today. Check back later.”'),
          });
        }
      }

      if (npc.key === 'clerk') {
        if (this.courier.stage === 1 && inv.letter) {
          choices.push({
            label: 'Deliver letter',
            onPick: () => {
              inv.letter = false;
              this.courier.stage = 2;
              this.courier.cooldown = 60;
              inv.coin = (inv.coin | 0) + 6;
              LW.law.reputation.townfolk += 2;
              app.ui.toast('Delivered. Paid 6 coin.');
            },
          });
        } else {
          choices.push({
            label: 'Ask about work',
            onPick: () => app.ui.toast('“If you want coin, speak to the tavern or the foreman.”'),
          });
        }
      }

      if (npc.key === 'trainer') {
        choices.push({
          label: this.spar.active ? 'Stop sparring' : 'Spar (training)',
          onPick: () => {
            if (this.spar.active) {
              const tr = app.entities.get(this.spar.trainerId);
              if (tr) this._endSpar(app, tr);
              return;
            }
            this._startSpar(app, npc);
          },
        });
      }

      if (npc.key === 'gate') {
        choices.push({
          label: 'Ask entry',
          onPick: () => {
            const night = app.world.isNight();
            if (night) app.ui.toast('“Gate’s watched at night. Don’t linger.”');
            else app.ui.toast('“Kastellum’s open — keep to the road.”');
          },
        });
      }

      return choices;
    },

    _startSpar(app, trainer) {
      this.spar.active = true;
      this.spar.trainerId = trainer.id;
      trainer.spar = true;
      trainer.hostile = true;
      trainer.hp = Math.min(trainer.hpMax, 46);
      app.player.hp = Math.max(app.player.hp, 60);
      LW.npc.say(app, trainer, '“Guard up. Light blows.”', 2.0);
      app.ui.toast('Sparring started. Reduce them below 6 HP to win.');
    },

    _endSpar(app, trainer) {
      this.spar.active = false;
      trainer.spar = false;
      trainer.hostile = false;
      trainer.atkPhase = 0;
      trainer.atkT = 0;
      trainer.hp = trainer.hpMax;
      app.player.hp = Math.max(app.player.hp, 40);
      app.player.sta = app.player.staMax;
      LW.law.reputation.guards += 1;
      LW.npc.say(app, trainer, '“Enough. Better.”', 2.0);
      app.ui.toast('Sparring ends. (+Guard repute)');
    },
  };

  LW.quests = qs;
})();

