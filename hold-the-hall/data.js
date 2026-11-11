/* Hold the Hall: data tables. Classic script: HH.DATA in the browser, module.exports in node.
 *
 * The town is N x N blocks of LOT x LOT tiles with ST-tile streets between them and around them (WORLD tiles a side).
 * The Town Hall is the centre block. Every other block is a ruin of one TYPE that becomes a building once it is taken.
 */
(function (root, f) { const api = f(); if (typeof module === 'object' && module.exports) module.exports = api; else (root.HH = root.HH || {}).DATA = api; })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SEC = 1000, MIN = 60000;
  const N = 5, LOT = 4, ST = 1, P = LOT + ST, WORLD = N * P + ST, C = 2;   // 26 tiles a side; the hall is block (C, C)

  // cost and time are per level reached: cost[0] restores the ruin (level 1), cost[1] upgrades to level 2, ...
  const TYPES = {
    hall: { name: 'Town Hall', max: 3, cost: [0, 250, 2000], time: [0, 10 * MIN, 120 * MIN],
      line: 'The heart of the town. Higher levels reach further out and let buildings grow.', ruins: ['Town Hall'] },
    home: { name: 'Homes', max: 2, cost: [30, 300], time: [10 * SEC, 10 * MIN],
      line: '+1 bed per level. Someone new moves in.', ruins: ['Corner House', 'Row Houses', 'Maple Flats', 'The Duplex', 'Brick Terrace', 'Old Boarding House'] },
    garden: { name: 'Garden', max: 3, cost: [25, 150, 600], time: [15 * SEC, 6 * MIN, 40 * MIN], rate: [6, 12, 24], cap: [60, 180, 480],
      line: 'Grows supplies while you are away.', ruins: ['Community Garden', 'Old Park', 'Schoolyard', 'Allotments', 'Greenhouse Lot'] },
    workshop: { name: 'Workshop', max: 3, cost: [60, 300, 1000], time: [40 * SEC, 8 * MIN, 45 * MIN], loot: 0.2,
      line: '+20 % supplies from every run, per level.', ruins: ['Auto Garage', 'Hardware Store', 'Print Shop'] },
    clinic: { name: 'Clinic', max: 3, cost: [60, 300, 1000], time: [40 * SEC, 8 * MIN, 45 * MIN], rescue: 0.1, rest: 0.15,
      line: 'More get carried home, and everyone rests faster.', ruins: ['Pharmacy', 'Vet Clinic', 'Dental Office'] },
    armory: { name: 'Armory', max: 3, cost: [70, 350, 1200], time: [50 * SEC, 10 * MIN, 60 * MIN], power: 4,
      line: '+4 power for everyone, per level.', ruins: ['Police Station', 'Hunting Store', 'Guard Depot'] },
    tower: { name: 'Watchtower', max: 3, cost: [50, 250, 900], time: [30 * SEC, 8 * MIN, 45 * MIN], tap: 1, ammo: 2,
      line: 'Wall shots pay +1 and the wall holds +2 ammo, per level.', ruins: ['Water Tower', 'Fire Station', 'Radio Mast', 'Grain Silo'] },
    gas: { name: 'Fuel Depot', max: 3, cost: [80, 300, 1000], time: [60 * SEC, 10 * MIN, 60 * MIN], rate: [1 / 20, 1 / 14, 1 / 10], cap: [2, 3, 4],
      line: 'Drips fuel. Slowly.', ruins: ['Gas Station'] },
    bridge: { name: 'The Bridge', max: 0, cost: [], time: [], line: 'The only road out. Take it and the town is yours.', ruins: ['The Bridge'] },
  };
  const HALL = { reach: [1, 2, 2], bridge: 3, ammo: [6, 8, 10] };   // which ring can be attacked, per hall level

  const RULES = {
    start: { sup: 20, fuel: 3 }, beds0: 3,
    power0: 8, powerLv: 6, spread: 6, winMin: 0.05, winMax: 0.97, forcedWins: 2,
    rescue0: 0.55, deathMin: 4,                     // nobody is left behind while fewer than 4 people live here
    runMs: 7 * SEC, lossLoot: 0.3, lossXp: 0.4,
    loot0: 12, lootT: 2, bonus0: 20, bonusT: 4,      // per run; the bonus is paid once, when the block is taken
    xp0: 12, xpNeed: 30, maxLv: 10,                  // need = xpNeed x level
    rest0: 45 * SEC, restT: 10 * SEC, restRing: [1, 1, 2], hurtMul: 3, restMin: 0.4,   // the outer ring is a longer walk
    reviveSup: 30, reviveFuel: 2, recoverMs: 60 * SEC, reviveEsc: 2,
    ammoMs: 8 * SEC, arriveMs: 150 * SEC, moveInMs: 6 * SEC,
    hordeFirst: 150 * SEC, hordeGap: [210 * SEC, 300 * SEC], hordeMs: 30 * SEC, hordeN: 8, hordeSup: 30, hordeFuel: 1,
    freeSkipMs: 15 * SEC, skipExp: 0.75, pack: 20, offlineMax: 12 * 60 * MIN,
  };

  const TRAITS = {
    tough: { name: 'Tough', line: 'Shrugs off what floors others.', fx: '+4 power', power: 4 },
    lucky: { name: 'Lucky', line: 'Always gets found.', fx: 'carried home more often', rescue: 0.2 },
    scavenger: { name: 'Scavenger', line: 'Comes home with full pockets.', fx: '+30 % supplies', loot: 0.3 },
    quick: { name: 'Quick', line: 'Back up before the kettle boils.', fx: 'rests 30 % faster', rest: 0.7 },
    bright: { name: 'Bright', line: 'Learns something every night.', fx: '+30 % XP', xp: 0.3 },
    reckless: { name: 'Reckless', line: 'Goes in first.', fx: '+6 power, carried home less often', power: 6, rescue: -0.15 },
  };
  const NAMES = ['Ines', 'Tobias', 'Wren', 'Mira', 'Jonah', 'Amara', 'Felix', 'Noor', 'Kasper', 'Lena', 'Oskar', 'Yuki', 'Rafael', 'Sana', 'Milo', 'Petra',
    'Idris', 'Greta', 'Luca', 'Zofia', 'Arjun', 'Maeve', 'Emil', 'Tamsin', 'Davi', 'Rosa', 'Hugo', 'Anouk', 'Kofi', 'Elsa', 'Mateo', 'Priya',
    'Sven', 'Nadia', 'Theo', 'Imani', 'Aksel', 'Vera', 'Omar', 'Linnea', 'Jude', 'Keiko', 'Anton', 'Soraya', 'Leo', 'Marta', 'Niko', 'Freya',
    'Samir', 'Tessa', 'Bram', 'Yara', 'Otto', 'Chidi', 'Alma', 'Ravi', 'Signe', 'Dario', 'Hana', 'Pavel', 'Runa', 'Malik', 'Ida', 'Enzo'];
  const LOOKS = {
    skin: ['#f2c9a5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'],
    hair: ['#2b2118', '#5a3825', '#a55728', '#d6b370', '#8a8f98', '#1a1a1a'],
    jacket: ['#d9534f', '#f0a030', '#3a8fbf', '#5aa469', '#8e6bbf', '#d27d9c', '#c9b458', '#4fb3a5'],
    styles: 4,   // 0 short, 1 long, 2 beanie, 3 bun
  };

  // The goal chip. k: kills | blocks (owned, the hall included) | built (restored buildings) | hall (level) | people | won
  const GOALS = [
    { k: 'kills', n: 3, text: 'Walkers come to the light. Tap 3 at the wall.', sup: 20 },
    { k: 'blocks', n: 2, text: 'EXPAND: take the block next door.', fuel: 1 },
    { k: 'built', n: 1, text: 'Restore the ruin you took.', sup: 20 },
    { k: 'blocks', n: 3, text: 'Take another block.', sup: 30 },
    { k: 'built', n: 2, text: 'Restore two buildings.', sup: 30 },
    { k: 'blocks', n: 5, text: 'Hold 5 blocks.', fuel: 2 },
    { k: 'hall', n: 2, text: 'Upgrade the Town Hall to reach further.', sup: 60 },
    { k: 'blocks', n: 9, text: 'Take every block around the hall.', fuel: 3 },
    { k: 'people', n: 6, text: 'Shelter 6 survivors.', sup: 80 },
    { k: 'blocks', n: 15, text: 'Hold 15 blocks.', fuel: 3 },
    { k: 'hall', n: 3, text: 'Upgrade the Town Hall to level 3.', sup: 150 },
    { k: 'won', n: 1, text: 'Take the bridge. Take back the town.', fuel: 5 },
  ];

  // Two Thumbs Left settings a block's threat stands for (the handoff's director)
  const director = (threat) => ({
    wanderers: 2 + Math.floor(threat / 12), hordes: 1 + Math.floor(threat / 14), hordeMul: Math.round((0.8 + threat / 50) * 100) / 100,
    zombieCap: 30 + threat, lengthS: 180 + 5 * threat,
  });

  return { SEC, MIN, N, LOT, ST, P, WORLD, C, TYPES, HALL, RULES, TRAITS, NAMES, LOOKS, GOALS, director };
});
