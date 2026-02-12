(() => {
  'use strict';
  const LW = window.LW;

  const COS_ARC_PLAYER = Math.cos((70 * Math.PI) / 180);
  const COS_ARC_BLOCK = Math.cos((100 * Math.PI) / 180);

  const CFG = {
    player: {
      windup: 0.12,
      active: 0.11,
      recover: 0.18,
      staminaCost: 14,
      range: 22,
      dmg: 16,
      bleedChance: 0.22,
    },
    npc: {
      windup: 0.22,
      active: 0.12,
      recover: 0.22,
      staminaCost: 12,
      range: 20,
      dmg: 12,
      bleedChance: 0.18,
    },
  };

  function inFront(ent, dx, dy, cosArc) {
    const a = ent.facing || 0;
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-5) return true;
    const inv = 1 / d;
    const dot = fx * (dx * inv) + fy * (dy * inv);
    return dot >= cosArc;
  }

  function applyBleed(v, seconds) {
    v.bleedT = Math.min(10, (v.bleedT || 0) + seconds);
  }

  function applyDamage(app, attacker, victim, dmg, cause) {
    if (!victim || victim.dead) return;
    let final = dmg;

    // Player block mitigation
    if (victim.kind === 'player' && victim.blocking) {
      const dx = attacker.x - victim.x;
      const dy = attacker.y - victim.y;
      if (inFront(victim, dx, dy, COS_ARC_BLOCK)) final *= 0.35;
    }
    // NPC block mitigation (future)
    if (victim.kind === 'npc' && victim.blocking) final *= 0.5;

    victim.hp = Math.max(0, (victim.hp || 0) - final);

    // Crime hooks
    if (attacker.kind === 'player' && victim.kind === 'npc') {
      if (victim.faction !== 'bandits' && victim.faction !== 'rebels') {
        // assault/murder unless already hostile
        if (!victim.hostile && cause === 'melee') {
          LW.law.recordCrime(app, LW.law.CRIME.ASSAULT, victim.x, victim.y, 1);
          LW.law.reputation.townfolk -= 1;
          if (victim.faction === 'guards') LW.law.reputation.guards -= 2;
          if (victim.faction === 'nobles') LW.law.reputation.nobles -= 3;
        }
      }
    }

    if (victim.hp <= 0) {
      victim.dead = true;
      if (victim.kind === 'npc' && victim.faction !== 'bandits' && victim.faction !== 'rebels') {
        LW.law.recordCrime(app, LW.law.CRIME.MURDER, victim.x, victim.y, 3);
        LW.law.reputation.townfolk -= 10;
        if (victim.faction === 'guards') LW.law.reputation.guards -= 18;
        if (victim.faction === 'nobles') LW.law.reputation.nobles -= 24;
      }
    }
  }

  function startAttack(ent, cfg) {
    if ((ent.atkPhase | 0) !== 0) return false;
    if ((ent.atkCd || 0) > 0) return false;
    if ((ent.sta || 0) < cfg.staminaCost) return false;
    ent.sta -= cfg.staminaCost;
    ent.atkPhase = 1;
    ent.atkT = cfg.windup;
    ent.atkHit = 0;
    return true;
  }

  function tickAttack(ent, dt, cfg, onActive) {
    if ((ent.atkCd || 0) > 0) ent.atkCd = Math.max(0, ent.atkCd - dt);
    if ((ent.atkPhase | 0) === 0) return;
    ent.atkT -= dt;
    if (ent.atkT > 0) return;
    if (ent.atkPhase === 1) {
      ent.atkPhase = 2;
      ent.atkT = cfg.active;
      if (onActive) onActive();
      return;
    }
    if (ent.atkPhase === 2) {
      ent.atkPhase = 3;
      ent.atkT = cfg.recover;
      return;
    }
    if (ent.atkPhase === 3) {
      ent.atkPhase = 0;
      ent.atkT = 0;
      ent.atkCd = 0.08;
    }
  }

  function regenSta(ent, dt, base) {
    ent.sta = Math.min(ent.staMax || 0, (ent.sta || 0) + base * dt);
  }

  function bleedTick(ent, dt) {
    if (!ent.bleedT) return;
    ent.bleedT = Math.max(0, ent.bleedT - dt);
    // 1 damage per second while bleeding, low but meaningful
    ent.hp = Math.max(0, ent.hp - 1.0 * dt);
    if (ent.hp <= 0) ent.dead = true;
  }

  function nearestHostileTarget(app, attacker, range) {
    // Find closest valid NPC target for player
    if (!LW.npc || !LW.npc.npcs) return null;
    let best = null;
    let bestD = range * range;
    for (let i = 0; i < LW.npc.npcs.length; i++) {
      const n = LW.npc.npcs[i];
      if (!n || n.dead) continue;
      // Player can hit anyone; but aim for nearest in front
      const dx = n.x - attacker.x;
      const dy = n.y - attacker.y;
      const dsq = dx * dx + dy * dy;
      if (dsq > bestD) continue;
      if (!inFront(attacker, dx, dy, COS_ARC_PLAYER)) continue;
      bestD = dsq;
      best = n;
    }
    return best;
  }

  function npcAggro(app, n) {
    if (n.dead) return;
    if (n.faction !== 'bandits' && n.faction !== 'rebels') return;
    const dx = app.player.x - n.x;
    const dy = app.player.y - n.y;
    const dsq = dx * dx + dy * dy;
    if (dsq < 120 * 120) {
      if (!n.hostile) {
        n.hostile = true;
        if (LW.npc && LW.npc.say && n._rng && n._rng.chance(0.4)) LW.npc.say(app, n, '“There.”', 1.6);
      }
    }
  }

  function npcChase(app, n, dt) {
    const w = app.world;
    const dx = app.player.x - n.x;
    const dy = app.player.y - n.y;
    const dsq = dx * dx + dy * dy;
    if (dsq < 1) return;
    const d = Math.sqrt(dsq);
    const inv = 1 / d;
    const nx = dx * inv;
    const ny = dy * inv;
    n.facing = LW.math.angleTo(nx, ny);

    // Move in when out of range
    const desired = 18;
    if (d > desired) {
      const spMul = w.speedMulAtWorld(n.x, n.y);
      const sp = n.speed * spMul * 1.18;
      const vx = nx * sp;
      const vy = ny * sp;
      const nextX = n.x + vx * dt;
      const nextY = n.y + vy * dt;
      if (w.isPassableWorld(nextX, n.y)) n.x = nextX;
      if (w.isPassableWorld(n.x, nextY)) n.y = nextY;
    }
  }

  LW.combat = {
    update(dt, app) {
      if (!app || !app.world) return;

      // Bleed ticks always
      bleedTick(app.player, dt);
      if (LW.npc && LW.npc.npcs) {
        for (let i = 0; i < LW.npc.npcs.length; i++) bleedTick(LW.npc.npcs[i], dt);
      }

      // If UI blocks, don't run combat AI/attacks
      if (app._isUiBlocking && app._isUiBlocking()) return;

      // Player attack input -> attack state machine
      if (app.input.btnAttack) startAttack(app.player, CFG.player);

      tickAttack(app.player, dt, CFG.player, () => {
        if (app.player.atkHit) return;
        const target = nearestHostileTarget(app, app.player, CFG.player.range);
        if (!target) return;
        app.player.atkHit = 1;
        applyDamage(app, app.player, target, CFG.player.dmg, 'melee');
        if (Math.random() < CFG.player.bleedChance) applyBleed(target, 5.5);
        // Enemies turn hostile once struck
        if (target.faction === 'bandits' || target.faction === 'rebels') target.hostile = true;
        LW.audio.beep(240, 0.05, 'triangle', 0.02);
      });

      // NPC combat AI
      if (LW.npc && LW.npc.npcs) {
        for (let i = 0; i < LW.npc.npcs.length; i++) {
          const n = LW.npc.npcs[i];
          if (!n || n.dead) continue;

          // stamina regen
          regenSta(n, dt, 8);

          npcAggro(app, n);

          if (!n.hostile) continue;

          n.state = LW.NPC_STATE ? LW.NPC_STATE.FIGHT : n.state;

          // chase
          npcChase(app, n, dt);

          // attack if in range
          const dx = app.player.x - n.x;
          const dy = app.player.y - n.y;
          const dsq = dx * dx + dy * dy;
          if (dsq < CFG.npc.range * CFG.npc.range) startAttack(n, CFG.npc);

          tickAttack(n, dt, CFG.npc, () => {
            if (n.atkHit) return;
            const dx2 = app.player.x - n.x;
            const dy2 = app.player.y - n.y;
            const dsq2 = dx2 * dx2 + dy2 * dy2;
            if (dsq2 > CFG.npc.range * CFG.npc.range) return;
            if (!inFront(n, dx2, dy2, COS_ARC_PLAYER)) return;
            n.atkHit = 1;
            applyDamage(app, n, app.player, CFG.npc.dmg, 'melee');
            if (Math.random() < CFG.npc.bleedChance) applyBleed(app.player, 6.5);
            LW.audio.beep(160, 0.05, 'square', 0.02);
          });
        }
      }
    },
  };
})();

