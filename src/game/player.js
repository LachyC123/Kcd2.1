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
      this.lastAttackT = -999;
      this.facing = 0; // angle

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
      this.inventory = s.inv || this.inventory;
      this.clothing = s.clothing || this.clothing;
    }
  }

  LW.Player = Player;
})();

