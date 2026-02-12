(() => {
  'use strict';
  const LW = window.LW;

  const NAMES_M = [
    'Auron',
    'Cassor',
    'Decian',
    'Faustus',
    'Lucan',
    'Marcon',
    'Nerion',
    'Ostus',
    'Quintor',
    'Rufan',
    'Silvan',
    'Teren',
    'Valcor',
    'Varric',
  ];
  const NAMES_F = [
    'Aurelia',
    'Brinna',
    'Cassia',
    'Doria',
    'Elenna',
    'Fabria',
    'Livara',
    'Marcella',
    'Nerisa',
    'Quinna',
    'Sabira',
    'Terenna',
    'Valeria',
    'Vesna',
  ];
  const COGNOMEN = [
    'of Hearthmere',
    'of Kastellum',
    'Stonehand',
    'Ashcloak',
    'Riverwise',
    'Wheatborn',
    'Iron-Quiet',
    'Brightscar',
    'Lowridge',
    'Hawkmind',
  ];

  const ROLE = {
    FARMER: 'farmer',
    WOODCUTTER: 'woodcutter',
    TAVERN: 'tavern',
    COURIER: 'courier',
    GUARD: 'guard',
    NOBLE: 'noble',
    BANDIT: 'bandit',
    REBEL: 'rebel',
  };

  const STATE = {
    IDLE: 0,
    TRAVEL: 1,
    WORK: 2,
    SOCIAL: 3,
    SLEEP: 4,
    INVESTIGATE: 5,
    FLEE: 6,
    FIGHT: 7,
  };

  class NPC extends LW.Entity {
    constructor(role) {
      super('npc');
      this.role = role || ROLE.FARMER;
      this.state = STATE.IDLE;
      this.faction = 'townfolk';
      this.rank = 0;

      // Combat stats/state
      this.hp = 60;
      this.hpMax = 60;
      this.sta = 60;
      this.staMax = 60;
      this.bleedT = 0;
      this.hostile = false;
      this.atkPhase = 0; // 0 idle, 1 windup, 2 active, 3 recover
      this.atkT = 0;
      this.atkCd = 0;
      this.atkHit = 0;

      this.homeTx = 0;
      this.homeTy = 0;
      this.jobTx = 0;
      this.jobTy = 0;
      this.leisureTx = 0;
      this.leisureTy = 0;

      this.goalTx = 0;
      this.goalTy = 0;

      this.speed = 46; // units/sec baseline
      this.facing = 0;

      this.path = [];
      this.pathIdx = 0;
      this._repathCd = 0;

      this.personality = {
        bold: 0,
        kind: 0,
        lawful: 0,
      };
      this.relPlayer = 0; // -100..100

      this.memory = []; // fixed-ish ring via push/shift, small

      this.barkCd = 1 + Math.random() * 2;
      this._rng = null;
    }

    initRng(seed) {
      this._rng = LW.rng.fromSeed((seed ^ Math.imul(this.id, 2654435761)) >>> 0);
    }

    remember(entry) {
      this.memory.push(entry);
      if (this.memory.length > 12) this.memory.shift();
    }
  }

  function makeName(rng) {
    const female = rng.chance(0.44);
    const first = female ? LW.util.pick(rng, NAMES_F) : LW.util.pick(rng, NAMES_M);
    const cog = rng.chance(0.72) ? ' ' + LW.util.pick(rng, COGNOMEN) : '';
    return first + cog;
  }

  function scheduleForRole(role) {
    // Returns a function (mins, world, npc)=> { state, target: 'home'|'job'|'leisure'|'wander' }
    // Simple Roman-influenced frontier rhythms.
    if (role === ROLE.GUARD) {
      return (m) => {
        if (m < 6 * 60) return { state: STATE.SLEEP, target: 'home' };
        if (m < 7 * 60) return { state: STATE.IDLE, target: 'job' }; // muster
        if (m < 12 * 60) return { state: STATE.WORK, target: 'job' }; // patrol
        if (m < 13 * 60) return { state: STATE.SOCIAL, target: 'leisure' }; // meal
        if (m < 18 * 60) return { state: STATE.WORK, target: 'job' };
        if (m < 20 * 60) return { state: STATE.SOCIAL, target: 'leisure' };
        return { state: STATE.SLEEP, target: 'home' };
      };
    }
    if (role === ROLE.TAVERN) {
      return (m) => {
        if (m < 7 * 60) return { state: STATE.SLEEP, target: 'home' };
        if (m < 10 * 60) return { state: STATE.WORK, target: 'job' };
        if (m < 15 * 60) return { state: STATE.WORK, target: 'job' };
        if (m < 22 * 60) return { state: STATE.WORK, target: 'job' };
        return { state: STATE.SLEEP, target: 'home' };
      };
    }
    if (role === ROLE.NOBLE) {
      return (m) => {
        if (m < 8 * 60) return { state: STATE.SLEEP, target: 'home' };
        if (m < 11 * 60) return { state: STATE.SOCIAL, target: 'leisure' }; // court/forum
        if (m < 15 * 60) return { state: STATE.IDLE, target: 'home' }; // household
        if (m < 19 * 60) return { state: STATE.SOCIAL, target: 'leisure' };
        if (m < 22 * 60) return { state: STATE.IDLE, target: 'home' };
        return { state: STATE.SLEEP, target: 'home' };
      };
    }
    if (role === ROLE.BANDIT || role === ROLE.REBEL) {
      return (m, world) => {
        if (world.isNight()) return { state: STATE.IDLE, target: 'wander' };
        return { state: STATE.IDLE, target: 'home' };
      };
    }
    // default laborer
    return (m) => {
      if (m < 6 * 60) return { state: STATE.SLEEP, target: 'home' };
      if (m < 7 * 60) return { state: STATE.SOCIAL, target: 'leisure' }; // quick meal
      if (m < 12 * 60) return { state: STATE.WORK, target: 'job' };
      if (m < 13 * 60) return { state: STATE.SOCIAL, target: 'leisure' };
      if (m < 18 * 60) return { state: STATE.WORK, target: 'job' };
      if (m < 20 * 60) return { state: STATE.SOCIAL, target: 'leisure' };
      return { state: STATE.SLEEP, target: 'home' };
    };
  }

  // Precompute schedule functions (avoid per-frame allocations).
  const SCHEDULE = {
    [ROLE.FARMER]: scheduleForRole(ROLE.FARMER),
    [ROLE.WOODCUTTER]: scheduleForRole(ROLE.WOODCUTTER),
    [ROLE.TAVERN]: scheduleForRole(ROLE.TAVERN),
    [ROLE.COURIER]: scheduleForRole(ROLE.COURIER),
    [ROLE.GUARD]: scheduleForRole(ROLE.GUARD),
    [ROLE.NOBLE]: scheduleForRole(ROLE.NOBLE),
    [ROLE.BANDIT]: scheduleForRole(ROLE.BANDIT),
    [ROLE.REBEL]: scheduleForRole(ROLE.REBEL),
  };

  function barkLine(npc, app) {
    const w = app.world;
    const night = w.isNight();
    if (npc.role === ROLE.GUARD) {
      const lines = night
        ? ['“Keep your hands where I can see.”', '“Curfew’s for a reason.”', '“The peace holds… if we hold it.”']
        : ['“Roads clear. Eyes open.”', '“By the King’s peace.”', '“Move along.”'];
      return LW.util.pick(npc._rng, lines);
    }
    if (npc.role === ROLE.TAVERN) {
      const lines = ['“Warm broth. Cheap cup.”', '“News travels faster than horses.”', '“Coin on the bar, eyes on the door.”'];
      return LW.util.pick(npc._rng, lines);
    }
    if (npc.role === ROLE.NOBLE) {
      const lines = ['“Mind your posture.”', '“The frontier makes men coarse.”', '“A kingdom is a ledger of favors.”'];
      return LW.util.pick(npc._rng, lines);
    }
    if (npc.role === ROLE.BANDIT) {
      const lines = ['“Quiet now…”', '“Easy pickings.”', '“No witnesses.”'];
      return LW.util.pick(npc._rng, lines);
    }
    if (npc.role === ROLE.REBEL) {
      const lines = ['“Not all chains are iron.”', '“The hills remember.”', '“Speak soft. Listen hard.”'];
      return LW.util.pick(npc._rng, lines);
    }
    const lines = night
      ? ['“Long day… long night.”', '“Storm’s coming, I can taste it.”', '“Don’t linger by the lane.”']
      : ['“Work waits for no one.”', '“Road’s easier on the feet.”', '“Grain’s thin this season.”'];
    return LW.util.pick(npc._rng, lines);
  }

  function bubbleReset(b) {
    b.x = 0;
    b.y = 0;
    b.text = '';
    b.ttl = 0;
    b.who = 0;
  }

  const bubblePool = new LW.Pool(() => ({ x: 0, y: 0, text: '', ttl: 0, who: 0 }), bubbleReset, 24);

  const sys = {
    npcs: [],
    bubbles: [],
    _sepAcc: 0,

    spawnForWorld(app) {
      this.npcs.length = 0;
      this.bubbles.length = 0;

      const rng = LW.rng.fromSeed(app.seed ^ 0x4b1d55aa);
      const t = LW.consts.TILE;
      const a = app.world.anchors();

      const spawnOne = (role, baseTx, baseTy, spread, faction, rank) => {
        const n = new NPC(role);
        n.initRng(app.seed);
        n.name = makeName(rng);
        n.faction = faction;
        n.rank = rank | 0;
        n.personality.bold = rng.fSigned();
        n.personality.kind = rng.fSigned();
        n.personality.lawful = rng.fSigned();
        n.relPlayer = rng.iRange(-10, 10);

        const hx = baseTx + rng.iRange(-spread, spread);
        const hy = baseTy + rng.iRange(-spread, spread);
        n.homeTx = hx;
        n.homeTy = hy;
        n.jobTx = baseTx + rng.iRange(-spread, spread);
        n.jobTy = baseTy + rng.iRange(-spread, spread);
        n.leisureTx = baseTx + rng.iRange(-spread, spread);
        n.leisureTy = baseTy + rng.iRange(-spread, spread);
        n.goalTx = n.homeTx;
        n.goalTy = n.homeTy;

        n.x = (hx + 0.5) * t;
        n.y = (hy + 0.5) * t;

        if (role === ROLE.GUARD) n.speed = 54;
        if (role === ROLE.NOBLE) n.speed = 44;
        if (role === ROLE.BANDIT || role === ROLE.REBEL) n.speed = 52;

        // Stats by role
        if (role === ROLE.GUARD) {
          n.hpMax = 92;
          n.hp = 92;
          n.staMax = 80;
          n.sta = 80;
        } else if (role === ROLE.NOBLE) {
          n.hpMax = 70;
          n.hp = 70;
          n.staMax = 60;
          n.sta = 60;
        } else if (role === ROLE.BANDIT) {
          n.hpMax = 76;
          n.hp = 76;
          n.staMax = 70;
          n.sta = 70;
          n.hostile = false; // will aggro near player
        } else if (role === ROLE.REBEL) {
          n.hpMax = 80;
          n.hp = 80;
          n.staMax = 74;
          n.sta = 74;
          n.hostile = false;
        } else {
          n.hpMax = 62;
          n.hp = 62;
          n.staMax = 62;
          n.sta = 62;
        }

        app.entities.add(n);
        this.npcs.push(n);
        return n;
      };

      // Hamlet: farmers and woodcutter + a courier
      for (let i = 0; i < 10; i++) spawnOne(ROLE.FARMER, a.hamlet.x, a.hamlet.y, 18, 'townfolk', 0);
      for (let i = 0; i < 4; i++) spawnOne(ROLE.WOODCUTTER, a.hamlet.x - 10, a.hamlet.y + 6, 16, 'townfolk', 0);
      spawnOne(ROLE.COURIER, a.hamlet.x + 6, a.hamlet.y + 10, 10, 'townfolk', 0);

      // Town: tavernkeep + merchants + guards + a noble
      spawnOne(ROLE.TAVERN, a.town.x + 6, a.town.y + 2, 10, 'townfolk', 0);
      for (let i = 0; i < 8; i++) spawnOne(ROLE.FARMER, a.town.x - 10, a.town.y + 6, 20, 'townfolk', 0);
      for (let i = 0; i < 9; i++) spawnOne(ROLE.GUARD, a.town.x - 2, a.town.y - 10, 18, 'guards', 1);
      spawnOne(ROLE.NOBLE, a.town.x + 16, a.town.y - 2, 8, 'nobles', 2);

      // Wilderness threats near roads / woods
      for (let i = 0; i < 6; i++) spawnOne(ROLE.BANDIT, a.town.x - 70, a.town.y + 20, 22, 'bandits', 0);
      for (let i = 0; i < 5; i++) spawnOne(ROLE.REBEL, a.fort.x - 40, a.fort.y + 10, 22, 'rebels', 0);
    },

    update(dt, app) {
      if (!app.world) return;
      const w = app.world;
      const t = LW.consts.TILE;

      // Bubble update
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.ttl -= dt;
        if (b.ttl <= 0) {
          LW.util.removeSwap(this.bubbles, i);
          bubblePool.release(b);
        }
      }

      for (let i = 0; i < this.npcs.length; i++) {
        const n = this.npcs[i];
        if (n.dead) continue;

        // Schedule -> desired state/target
        const sched = SCHEDULE[n.role] || SCHEDULE[ROLE.FARMER];
        const desire = sched(w.timeMinutes | 0, w, n);

        let targTx = n.homeTx;
        let targTy = n.homeTy;
        if (desire.target === 'job') {
          targTx = n.jobTx;
          targTy = n.jobTy;
        } else if (desire.target === 'leisure') {
          targTx = n.leisureTx;
          targTy = n.leisureTy;
        } else if (desire.target === 'wander') {
          // small wander around current home region at night
          if (n._rng.chance(0.02)) {
            n.goalTx = n.homeTx + n._rng.iRange(-14, 14);
            n.goalTy = n.homeTy + n._rng.iRange(-10, 10);
          }
          targTx = n.goalTx;
          targTy = n.goalTy;
        }

        const curTx = Math.floor(n.x / t);
        const curTy = Math.floor(n.y / t);

        const dist = Math.abs(curTx - targTx) + Math.abs(curTy - targTy);
        const shouldTravel = dist > 2 && desire.state !== STATE.SLEEP;

        // Repath cooldown (avoid spam)
        n._repathCd -= dt;

        // If goal changed or we should be traveling, ensure path
        const goalChanged = (n.goalTx | 0) !== (targTx | 0) || (n.goalTy | 0) !== (targTy | 0);
        if (goalChanged) {
          n.goalTx = targTx | 0;
          n.goalTy = targTy | 0;
          n.path.length = 0;
          n.pathIdx = 0;
          n._repathCd = 0;
        }

        if (shouldTravel) {
          n.state = STATE.TRAVEL;
          if ((n.path.length === 0 || n.pathIdx >= n.path.length) && n._repathCd <= 0) {
            n._repathCd = 1.0 + n._rng.f01() * 0.6;
            LW.path.getPath(w, curTx, curTy, n.goalTx, n.goalTy, n.path);
            n.pathIdx = 0;
          }
          this._moveAlongPath(n, app, dt);
        } else {
          n.state = desire.state;
          // small idle shuffle to prevent perfect stillness
          if (n.state !== STATE.SLEEP && n._rng.chance(0.01)) {
            const nx = n.x + n._rng.fSigned() * 10;
            const ny = n.y + n._rng.fSigned() * 10;
            if (w.isPassableWorld(nx, n.y)) n.x = nx;
            if (w.isPassableWorld(n.x, ny)) n.y = ny;
          }
        }

        // Ambient bark
        n.barkCd -= dt;
        if (n.barkCd <= 0 && !app.dialogue.active) {
          const p = n.role === ROLE.GUARD ? 0.010 : 0.007;
          if (n._rng.f01() < p) {
            this.say(app, n, barkLine(n, app), 2.2 + n._rng.f01() * 1.2);
          }
          n.barkCd = 2.8 + n._rng.f01() * 5.0;
        }
      }

      // Separation in bursts (cheap)
      this._sepAcc += dt;
      if (this._sepAcc > 0.12) {
        this._sepAcc = 0;
        this._separate(app);
      }
    },

    _moveAlongPath(n, app, dt) {
      const w = app.world;
      const t = LW.consts.TILE;
      if (n.pathIdx >= n.path.length) return;
      const p = n.path[n.pathIdx];
      const tx = LW.path.unpackX(p);
      const ty = LW.path.unpackY(p);
      const goalX = (tx + 0.5) * t;
      const goalY = (ty + 0.5) * t;
      const dx = goalX - n.x;
      const dy = goalY - n.y;
      const dsq = dx * dx + dy * dy;
      if (dsq < 16) {
        n.pathIdx++;
        return;
      }
      const d = Math.sqrt(dsq);
      const inv = d > 1e-6 ? 1 / d : 0;
      const nx = dx * inv;
      const ny = dy * inv;
      n.facing = LW.math.angleTo(nx, ny);
      const spMul = w.speedMulAtWorld(n.x, n.y);
      const sp = n.speed * spMul;
      const vx = nx * sp;
      const vy = ny * sp;
      const nextX = n.x + vx * dt;
      const nextY = n.y + vy * dt;
      if (w.isPassableWorld(nextX, n.y)) n.x = nextX;
      if (w.isPassableWorld(n.x, nextY)) n.y = nextY;
    },

    _separate(app) {
      const ents = app.entities.entities;
      const n = ents.length;
      for (let i = 0; i < n; i++) {
        const a = ents[i];
        if (!a || a.dead) continue;
        for (let j = i + 1; j < n; j++) {
          const b = ents[j];
          if (!b || b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = (a.r + b.r + 2) | 0;
          const dsq = dx * dx + dy * dy;
          if (dsq < rr * rr && dsq > 0.0001) {
            const d = Math.sqrt(dsq);
            const inv = 1 / d;
            const push = (rr - d) * 0.24;
            const px = dx * inv * push;
            const py = dy * inv * push;
            // push apart, but keep player a bit sturdier
            const aMul = a.kind === 'player' ? 0.4 : 1;
            const bMul = b.kind === 'player' ? 0.4 : 1;
            a.x -= px * aMul;
            a.y -= py * aMul;
            b.x += px * bMul;
            b.y += py * bMul;
          }
        }
      }
    },

    say(app, npc, text, ttl) {
      const b = bubblePool.acquire();
      b.x = npc.x;
      b.y = npc.y;
      b.text = text;
      b.ttl = ttl || 2.6;
      b.who = npc.id;
      this.bubbles.push(b);
    },

    nearestTo(app, x, y, maxDist) {
      let best = null;
      let bestD = maxDist * maxDist;
      for (let i = 0; i < this.npcs.length; i++) {
        const n = this.npcs[i];
        if (n.dead) continue;
        const dx = n.x - x;
        const dy = n.y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    },

    openDialogue(app, npc) {
      if (!npc || app.dialogue.active) return;
      const rep = LW.law.reputation;
      const repVal =
        npc.faction === 'guards'
          ? rep.guards
          : npc.faction === 'nobles'
            ? rep.nobles
            : npc.faction === 'rebels'
              ? rep.rebels
              : npc.faction === 'bandits'
                ? -40
                : rep.townfolk;

      const tone =
        npc.rank >= 2
          ? 'high'
          : npc.faction === 'guards'
            ? 'guard'
            : npc.faction === 'rebels'
              ? 'rebel'
              : npc.faction === 'bandits'
                ? 'bandit'
                : 'plain';

      const greetLine =
        tone === 'high'
          ? repVal >= 10
            ? '“Ah. A familiar face among the dust.”'
            : '“Do mind your distance.”'
          : tone === 'guard'
            ? repVal >= 10
              ? '“Evening. Keep your nose clean.”'
              : '“State your business.”'
            : tone === 'rebel'
              ? '“Keep your voice down.”'
              : tone === 'bandit'
                ? '“You lost, friend?”'
                : repVal >= 10
                  ? '“Good to see you upright.”'
                  : '“Aye?”';

      const directions = () => {
        const a = app.world.anchors();
        const lines = [
          `“Follow the road north-east for Kastellum’s walls.”`,
          `“The river crossing sits west of the town road.”`,
          `“Stonewatch Fort stands east along the main road.”`,
          `“A shrine lies south of town — folk leave coins there.”`,
        ];
        app.ui.toast(LW.util.pick(npc._rng, lines));
        npc.remember({ t: app.world.day, type: 'talk', about: 'directions' });
      };

      const rumors = () => {
        const lines = [
          '“A patrol went missing by the bandit trails.”',
          '“They say the legate’s clerk keeps two ledgers.”',
          '“Noble lane’s closed after dark. They spook easy.”',
          '“Someone’s been cutting the river ropes at night.”',
          '“A rebel scout was seen near the fort road.”',
        ];
        app.ui.toast(LW.util.pick(npc._rng, lines));
        npc.remember({ t: app.world.day, type: 'talk', about: 'rumor' });
      };

      const trade = () => {
        if (npc.role !== ROLE.TAVERN) {
          app.ui.toast('They have nothing to trade.');
          return;
        }
        if (app.player.inventory.coin <= 0) {
          app.ui.toast('No coin.');
          return;
        }
        app.player.inventory.coin -= 1;
        app.player.hp = Math.min(app.player.hpMax, app.player.hp + 10);
        app.ui.toast('You buy broth (+10 health).');
      };

      const threaten = () => {
        npc.relPlayer -= 8;
        LW.law.reputation.townfolk -= 1;
        this.say(app, npc, '“Watch your tongue.”', 2.2);
        app.ui.toast('They remember that.');
      };

      app.dialogue.open({
        title: npc.name,
        body: greetLine,
        choices: [
          { label: 'Greet', onPick: () => app.ui.toast('You exchange a few words.') },
          { label: 'Ask directions', onPick: directions },
          { label: 'Ask rumors', onPick: rumors },
          { label: 'Trade', onPick: trade },
          { label: 'Threaten', onPick: threaten },
        ],
      });
    },
  };

  LW.npc = sys;
  LW.NPC = NPC;
  LW.NPC_ROLE = ROLE;
  LW.NPC_STATE = STATE;
})();

