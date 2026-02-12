(() => {
  'use strict';
  const LW = window.LW;

  // Ink-and-ochre palette, high contrast outlines.
  const PAL = {
    bg: '#14110d',
    ink: '#1a140f',
    paper: '#efe7d6',
    paper2: '#d9cfbb',
    ochre: '#c18b3a',
    ochre2: '#e0b86a',
    red: '#b33a2e',
    green: '#2f7a4c',
    blueInk: '#243140',
  };

  const T = {
    GRASS: 1,
    DIRT: 2,
    ROAD: 3,
    FOREST: 4,
    WATER: 5,
    STONE: 6,
    WALL: 7,
    FLOOR: 8,
    FARMLAND: 9,
    RESTRICT: 10, // overlay marker (restricted zone; still walkable depending rules)
  };

  const PROPS = {
    passable: new Uint8Array(256),
    speedMul: new Float32Array(256),
    baseCol: new Array(256),
  };

  function defTile(id, passable, speedMul, col) {
    PROPS.passable[id] = passable ? 1 : 0;
    PROPS.speedMul[id] = speedMul;
    PROPS.baseCol[id] = col;
  }

  defTile(T.GRASS, true, 1.0, '#2c2b22');
  defTile(T.DIRT, true, 0.95, '#3a2f24');
  defTile(T.ROAD, true, 1.25, '#4a3826');
  defTile(T.FOREST, true, 0.78, '#262a22');
  defTile(T.WATER, false, 0.0, '#1d2731');
  defTile(T.STONE, true, 0.98, '#3b3a38');
  defTile(T.WALL, false, 0.0, '#2b2724');
  defTile(T.FLOOR, true, 1.0, '#362f2a');
  defTile(T.FARMLAND, true, 0.92, '#3c2f23');
  defTile(T.RESTRICT, true, 1.0, '#000000');

  LW.tiles = { PAL, T, PROPS };
})();

