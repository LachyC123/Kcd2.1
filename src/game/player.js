(() => {
  'use strict';
  const LW = window.LW;

  class Player extends LW.Entity {
    constructor() {
      super('player');
      this.name = 'You';
      this.faction = 'wanderer';
      this.rank = 0;

      this.hp = 100;
      this.hpMax = 100;
      this.sta = 100;
      this.staMax = 100;

      this.speed = 64; // world units/sec base
      this.runMul = 1.25;
      this.blocking = false;
      this.facing = 0; // angle

      // Combat state (kept on object for JIT stability)
      this.atkPhase = 0; // 0 idle, 1 windup, 2 active, 3 recover
      this.atkT = 0;
      this.atkCd = 0;
      this.atkHit = 0;
      this.bleedT = 0;

      this.inventory = {
        coin: 4,
        knife: true,
        wood: 0,
        letter: false,
      };

      this.clothing = {
        tag: 'peasant', // affects access
      };
    }

    serialize() {
      return {
        x: this.x,
        y: this.y,
        hp: this.hp,
        sta: this.sta,
        bleedT: this.bleedT,
        inv: this.inventory,
        clothing: this.clothing,
      };
    }
    deserialize(s) {
      if (!s) return;
      this.x = s.x || 0;
      this.y = s.y || 0;
      this.hp = s.hp != null ? s.hp : this.hp;
      this.sta = s.sta != null ? s.sta : this.sta;
      this.bleedT = s.bleedT != null ? s.bleedT : 0;
      this.inventory = s.inv || this.inventory;
      this.clothing = s.clothing || this.clothing;
    }
  }

  LW.Player = Player;
})();

