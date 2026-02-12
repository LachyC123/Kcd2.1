(() => {
  'use strict';
  const LW = window.LW;

  class Pool {
    constructor(factory, reset, initial = 0) {
      this._factory = factory;
      this._reset = reset || (() => {});
      this._items = [];
      for (let i = 0; i < initial; i++) this._items.push(factory());
    }
    acquire() {
      return this._items.length ? this._items.pop() : this._factory();
    }
    release(obj) {
      this._reset(obj);
      this._items.push(obj);
    }
    size() {
      return this._items.length;
    }
  }

  LW.Pool = Pool;
})();

