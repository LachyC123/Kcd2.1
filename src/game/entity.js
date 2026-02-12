(() => {
  'use strict';
  const LW = window.LW;

  let NEXT_ID = 1;

  class Entity {
    constructor(kind) {
      this.id = NEXT_ID++;
      this.kind = kind || 'entity';
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.r = 6;
      this.dead = false;
      this.faction = 'neutral';
      this.rank = 0; // 0 commoner, 1 guard, 2 noble, 3 rebel
      this.name = 'Unknown';
      this.tags = 0;
    }
  }

  class EntityWorld {
    constructor() {
      this.entities = [];
      this._byId = new Map();
    }
    add(e) {
      this.entities.push(e);
      this._byId.set(e.id, e);
      return e;
    }
    remove(e) {
      this._byId.delete(e.id);
      const idx = this.entities.indexOf(e);
      if (idx >= 0) LW.util.removeSwap(this.entities, idx);
    }
    get(id) {
      return this._byId.get(id) || null;
    }
  }

  LW.Entity = Entity;
  LW.EntityWorld = EntityWorld;
})();

