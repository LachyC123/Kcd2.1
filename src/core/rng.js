(() => {
  'use strict';
  const LW = window.LW;

  // PCG32-ish small RNG. Deterministic across JS engines via 32-bit ops.
  function Rng(seed) {
    this.state = (seed >>> 0) || 0x12345678;
    this.inc = 0xda3e39cb >>> 0;
  }
  Rng.prototype.nextU32 = function () {
    // LCG then xorshift/rotate output (PCG-like).
    const old = this.state >>> 0;
    this.state = (Math.imul(old, 747796405) + this.inc) >>> 0;
    let xorshifted = (((old >>> 18) ^ old) >>> 27) >>> 0;
    const rot = old >>> 59; // will be 0 in 32-bit, but keep shape
    // rotate right by rot (0..31). For 32-bit state, rot from 0..31 via high bits:
    const r = (old >>> 27) & 31;
    return ((xorshifted >>> r) | (xorshifted << ((32 - r) & 31))) >>> 0;
  };
  Rng.prototype.u32 = function () {
    return this.nextU32();
  };
  Rng.prototype.f01 = function () {
    // [0,1)
    return (this.nextU32() >>> 8) / 16777216;
  };
  Rng.prototype.fRange = function (a, b) {
    return a + (b - a) * this.f01();
  };
  Rng.prototype.iRange = function (a, bInclusive) {
    const r = this.nextU32();
    const span = (bInclusive - a + 1) | 0;
    return a + (r % span);
  };
  Rng.prototype.chance = function (p) {
    return this.f01() < p;
  };
  Rng.prototype.fSigned = function () {
    return this.f01() * 2 - 1;
  };
  Rng.prototype.clone = function () {
    const r = new Rng(1);
    r.state = this.state >>> 0;
    r.inc = this.inc >>> 0;
    return r;
  };

  LW.Rng = Rng;

  LW.rng = {
    fromSeed(seedU32) {
      return new Rng(seedU32 >>> 0);
    },
    seedFromText(text) {
      return LW.util.hashStr(String(text || '')) >>> 0;
    },
  };
})();

