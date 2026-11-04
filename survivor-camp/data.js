// Survivor Camp: every table of the camp economy as plain data (SPEC sections 2-7).
// Tuning is a data edit: costs, times, rates and caps are stored as computed tables, not formulas.
// Classic script: attaches to window.SC.DATA in the browser, module.exports in node.
(function (root, f) {
  const api = f(root.SC || {});
  if (typeof module === 'object' && module.exports) module.exports = api; else (root.SC = root.SC || {}).DATA = api;
})(typeof self !== 'undefined' ? self : this, function (SC) {
  'use strict';

  // Building order used by the scene, the Lab and the bot's fallback priority.
  const BUILDING_IDS = ['campfire', 'storehouse', 'bunkhouse', 'salvage', 'garden', 'radio', 'workbench', 'infirmary', 'generator'];

  // Per building: cost[L] = [scrap, food, meds, bp] to reach level L (null = start level), time[L] in seconds.
  // reqCL(L) = campfire ? L - 1 : max(unlockCL, L).
  const BUILDINGS = {
    campfire: {
      name: 'Campfire', short: 'Fire', unlockCL: 1, start: 1, max: 10,
      cost: [null, null, [100, 20, 0, 0], [250, 60, 0, 0], [500, 150, 0, 0], [1100, 400, 0, 0], [2600, 1100, 0, 0],
        [5500, 2400, 0, 0], [10000, 4400, 0, 0], [15000, 6500, 0, 0], [26000, 11000, 0, 0]],
      time: [0, 0, 30, 180, 900, 2700, 7200, 14400, 28800, 28800, 36000],
      survivors: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10],          // survivors needed to reach CL L
      bat: [0, 0, 10, 15, 20, 25, 30, 35, 40, 45, 50],        // battery reward on reaching CL L
    },
    storehouse: {
      name: 'Storehouse', short: 'Store', unlockCL: 1, start: 1, max: 10,
      cost: [null, null, [200, 60, 0, 0], [600, 180, 0, 0], [1400, 420, 0, 0], [3000, 900, 0, 0], [5500, 1650, 0, 0],
        [9000, 2700, 0, 0], [14000, 4200, 0, 0], [21000, 6300, 0, 0], [30000, 9000, 0, 0]],
      time: [0, 0, 60, 180, 570, 1440, 3600, 7200, 14400, 23040, 34560],
      caps: {
        scrap: [0, 600, 1500, 3000, 5500, 10000, 16000, 25000, 37500, 56000, 80000],
        food: [0, 300, 600, 1250, 2250, 3750, 6250, 10000, 15000, 22500, 32500],
        meds: [0, 50, 100, 180, 300, 500, 750, 1100, 1600, 2250, 3100],
      },
    },
    bunkhouse: {
      name: 'Bunkhouse', short: 'Bunks', unlockCL: 1, start: 1, max: 10,
      cost: [null, null, [110, 55, 0, 0], [270, 140, 0, 0], [590, 300, 0, 0], [1150, 580, 0, 0], [2150, 1100, 0, 0],
        [3600, 1800, 0, 0], [5400, 2700, 0, 0], [8100, 4050, 0, 0], [11700, 5850, 0, 0]],
      time: [0, 0, 60, 180, 570, 1440, 3600, 7200, 14400, 23040, 34560],
      beds: [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    },
    salvage: {
      name: 'Salvage Yard', short: 'Salvage', unlockCL: 1, start: 0, max: 10, produces: 'scrap',
      cost: [null, [40, 10, 0, 0], [120, 35, 0, 0], [300, 90, 0, 0], [650, 200, 0, 0], [1300, 390, 0, 0], [2400, 720, 0, 0],
        [4000, 1200, 0, 0], [6000, 1800, 0, 0], [9000, 2700, 0, 0], [13000, 3900, 0, 0]],
      time: [0, 10, 60, 240, 720, 1800, 4500, 9000, 18000, 28800, 43200],
      rate: [0, 60, 90, 130, 180, 250, 340, 450, 600, 780, 1000],   // scrap/h with 0 workers
      holds: [0, 3, 4, 5, 6, 8, 8, 10, 10, 12, 12],                 // buffer hours
    },
    garden: {
      name: 'Garden', short: 'Garden', unlockCL: 1, start: 0, max: 10, produces: 'food',
      cost: [null, [30, 5, 0, 0], [95, 15, 0, 0], [240, 35, 0, 0], [520, 80, 0, 0], [1050, 160, 0, 0], [1900, 290, 0, 0],
        [3200, 480, 0, 0], [4800, 720, 0, 0], [7200, 1100, 0, 0], [10400, 1550, 0, 0]],
      time: [0, 20, 60, 240, 720, 1800, 4500, 9000, 18000, 28800, 43200],
      rate: [0, 30, 45, 65, 90, 125, 165, 210, 260, 320, 380],
      holds: [0, 3, 4, 5, 6, 8, 8, 10, 10, 12, 12],
    },
    radio: {
      name: 'Radio Mast', short: 'Radio', unlockCL: 2, start: 0, max: 10,
      cost: [null, [50, 20, 0, 0], [140, 55, 0, 0], [360, 140, 0, 0], [780, 310, 0, 0], [1550, 620, 0, 0], [2900, 1150, 0, 0],
        [4800, 1900, 0, 0], [7200, 2900, 0, 0], [10800, 4300, 0, 0], [15600, 6250, 0, 0]],
      time: [0, 30, 60, 240, 720, 1800, 4500, 9000, 18000, 28800, 43200],
      hordeWarnS: [3.0, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5],
      gear: [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      partyMul: [0, 0, 1.00, 1.15, 1.30, 1.45, 1.60, 1.75, 1.90, 2.05, 2.20],
      partySlots: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3],
    },
    workbench: {
      name: 'Workbench', short: 'Bench', unlockCL: 2, start: 0, max: 10,
      cost: [null, [50, 10, 0, 0], [160, 30, 0, 0], [390, 80, 0, 1], [850, 170, 0, 2], [1700, 340, 0, 3], [3100, 620, 0, 4],
        [5200, 1050, 0, 5], [7800, 1550, 0, 6], [11700, 2350, 0, 8], [16900, 3400, 0, 10]],
      time: [0, 45, 60, 300, 870, 2160, 5400, 10800, 21600, 34560, 51840],
      damageMul: [1.00, 1.00, 1.04, 1.08, 1.12, 1.16, 1.20, 1.24, 1.28, 1.32, 1.36],
      magMul: [1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.2, 1.2, 1.2, 1.3, 1.3],
      gear: [0, 0, 2, 6, 8, 10, 14, 16, 18, 22, 24],
    },
    infirmary: {
      name: 'Infirmary', short: 'Infirmary', unlockCL: 3, start: 0, max: 10, produces: 'meds',
      cost: [null, [45, 25, 0, 0], [130, 65, 0, 0], [330, 170, 0, 0], [720, 360, 70, 0], [1450, 730, 150, 0], [2650, 1350, 270, 0],
        [4400, 2200, 440, 0], [6600, 3300, 660, 0], [9900, 4950, 990, 0], [14300, 7150, 1450, 0]],
      time: [0, 60, 60, 240, 720, 1800, 4500, 9000, 18000, 28800, 43200],
      rate: [0, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26],
      holds: [0, 3, 4, 5, 6, 8, 8, 10, 10, 12, 12],
      maxHp: [100, 100, 105, 110, 115, 120, 125, 130, 130, 130, 130],
      secondWind: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2],
      injuryCut: [0, 0.08, 0.16, 0.24, 0.32, 0.40, 0.48, 0.50, 0.50, 0.50, 0.50],
      stash: 20,                                                       // meds in the bubble on the first build
    },
    generator: {
      name: 'Generator', short: 'Generator', unlockCL: 5, start: 0, max: 10,
      cost: [null, [60, 20, 0, 0], [180, 55, 0, 0], [450, 140, 0, 0], [980, 290, 0, 0], [1950, 590, 0, 0], [3600, 1100, 0, 0],
        [6000, 1800, 0, 0], [9000, 2700, 0, 0], [13500, 4050, 0, 0], [19500, 5850, 0, 0]],
      time: [0, 60, 90, 360, 1080, 2700, 6750, 13500, 27000, 43200, 64800],
      intervalH: [0, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.75, 2.5, 2.25],    // one battery every
      holds: [0, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
      flashlightR: [520, 536, 551, 567, 582, 598, 614, 629, 645, 660, 676],
      gear: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    },
  };

  const PRODUCERS = ['salvage', 'garden', 'infirmary'];      // worker round-robin order
  const WORKER_SLOTS = 2;
  const WORKER_BONUS = 0.5;                                  // +50% of base per worker
  const FIRST_BUILD_BUFFER_H = 0.25;                         // a new producer starts with 15 minutes of output
  const BUBBLE_MIN_SHARE = 0.05;                             // bubble shows at 5% of the buffer

  const START = {
    res: { scrap: 60, food: 30, meds: 0, bat: 10, bp: 0 },
    lv: { campfire: 1, storehouse: 1, bunkhouse: 1, salvage: 0, garden: 0, radio: 0, workbench: 0, infirmary: 0, generator: 0 },
    people: ['Noor', 'Tomas'],
    runner: 'p2',
    pile: 40,
    crews: 1,
    forcedWins: 2,
  };

  const CREW = { start: 1, freeAtCL: 3, thirdPrice: 250, thirdFromCL: 4, max: 3, showFromCL: 2 };

  // Runs (SPEC 5.1). Field names are exactly what run.js reads, plus the camp-side fields.
  const ROUTES = [
    { id: 'R1', name: 'Corner Store', danger: 1, req: 8, radio: 0, len: 240, wander: 3, hordes: 1, caches: 2, hordeMul: 0.8, cap: 35, haul: { scrap: 70, food: 35, meds: 0 }, bp: 0, rescue: 0.10, firstBat: 5 },
    { id: 'R2', name: 'Laundromat Row', danger: 2, req: 14, radio: 1, len: 300, wander: 3, hordes: 2, caches: 2, hordeMul: 1.0, cap: 45, haul: { scrap: 140, food: 65, meds: 6 }, bp: 0.25, rescue: 0.20, firstBat: 10 },
    { id: 'R3', name: 'Bus Depot', danger: 3, req: 26, radio: 2, len: 360, wander: 4, hordes: 2, caches: 3, hordeMul: 1.2, cap: 55, haul: { scrap: 215, food: 90, meds: 12 }, bp: 0.40, rescue: 0.25, firstBat: 15 },
    { id: 'R4', name: 'Clinic Block', danger: 4, req: 38, radio: 5, len: 390, wander: 4, hordes: 3, caches: 3, hordeMul: 1.45, cap: 65, haul: { scrap: 520, food: 185, meds: 24 }, bp: 0.45, rescue: 0.30, firstBat: 20 },
    { id: 'R5', name: 'Stadium Gate', danger: 5, req: 52, radio: 6, len: 420, wander: 5, hordes: 4, caches: 4, hordeMul: 1.7, cap: 75, haul: { scrap: 800, food: 280, meds: 32 }, bp: 0.60, rescue: 0.35, firstBat: 25 },
  ];
  const ROUTE_FIRST_WIN_BP = 2;
  const ROUTE_BAT_DROP = { R4: [0.10, 2], R5: [0.20, 3] };  // [chance per win, batteries]
  const ROUTE_PLACE = { R1: 'behind the corner store counter', R2: 'in the laundromat', R3: 'in a burnt-out bus', R4: 'in the clinic pharmacy', R5: 'under the stadium stands' };
  // Camp-mode spawn table (the game's start safe room holds only the ammo box in camp mode). medkit 0.5 = 50% per run.
  const MAP_SUPPLIES = {
    R1: { medkit: 1, pills: 1, noiseBomb: 0, ammo: 2, weapons: [] },
    R2: { medkit: 1, pills: 1, noiseBomb: 1, ammo: 2, weapons: [] },
    R3: { medkit: 0.5, pills: 1, noiseBomb: 1, ammo: 2, weapons: [] },
    R4: { medkit: 0, pills: 1, noiseBomb: 1, ammo: 1, weapons: [] },
    R5: { medkit: 0, pills: 0, noiseBomb: 1, ammo: 1, weapons: [] },
  };
  const PITY = { rescue: 4, bp: 4 };                        // the 5th win in a row without one gives one
  const EXTRA_RESCUE_FOOD = 100;
  const GATE_MAX = 2;
  const DAILY = { wins: 3, bat: 5 };
  const LOSS_PAYOUT = 0.35;
  const RUN_STATS = { medkitSec: 3, medkitHeal: 0.8, bombLifeS: 6, extraCaches: 0 };

  // Weapons: unlocked at the Workbench for Blueprints, once.
  const WEAPONS = {
    pistol: { name: 'Pistol', bp: 0, wb: 0, rank: 0 },
    smg: { name: 'SMG', bp: 2, wb: 1, rank: 1 },
    shotgun: { name: 'Shotgun', bp: 4, wb: 3, rank: 2 },
    rifle: { name: 'Rifle', bp: 8, wb: 5, rank: 3 },
  };
  const WEAPON_ORDER = ['pistol', 'smg', 'shotgun', 'rifle'];

  // Crafting (SPEC 4.3).
  const CRAFTS = {
    medkit: { name: 'Medkit', building: 'infirmary', minLv: 1, cost: { scrap: 0, food: 0, meds: 20 }, time: 480 },
    pills: { name: 'Pills', building: 'infirmary', minLv: 1, cost: { scrap: 0, food: 0, meds: 10 }, time: 180 },
    bomb: { name: 'Noise bomb', building: 'workbench', minLv: 3, cost: { scrap: 80, food: 0, meds: 5 }, time: 300 },
  };
  const STOCK_MAX = 3;
  const QUEUE_MAX = 3;

  const RECRUIT = { radioMin: 1, foodPer: 40, minutesPer: 4, exp: 1.5 };

  const PARTIES = {
    minRadio: 2,
    kinds: {
      '30m': { name: 'Quick sweep', sec: 1800, loot: { scrap: 120, food: 40, meds: 0 } },
      '2h': { name: 'Supply run', sec: 7200, loot: { scrap: 400, food: 140, meds: 8 } },
      '8h': { name: 'Long haul', sec: 28800, loot: { scrap: 1300, food: 450, meds: 30 } },
    },
    order: ['30m', '2h', '8h'],
  };

  const INJURY = { lossMinPerDanger: 6, swWinMinPerDanger: 2, hurtHpShare: 0.6 };

  const SKIP = { freeSec: 30, exp: 0.8, mul: 1, confirmAt: 20 };
  const MOMENTUM = { pct: 0.05, minSec: 60, cap: 0.25 };
  const OFFLINE = { capMs: 7 * 86400000, welcomeMinMs: 2 * 60000, logGapMs: 86400000 };
  const TIME_SCALES = [0, 1, 10, 60, 600];
  const FRAME_CLAMP_MS = 1000;

  // Free prototype test packs: no prices, no payment of any kind.
  const PACKS = { small: 100, medium: 500, large: 2500 };

  const SUPPLY_DROP = { medkit: 1, pills: 1, scrap: 100 };   // on finishing Radio 1

  // Roster: Noor and Tomas start, Ilse is the scripted first rescue; recruits and rescues take the next unused name.
  const ROSTER = ['Noor', 'Tomas', 'Ilse', 'Dev', 'Marta', 'Kofi', 'Wren', 'Yusuf', 'Hana', 'Pavel', 'Rosa', 'Jonah',
    'Aiko', 'Bram', 'Lena', 'Omar', 'Tess', 'Viktor', 'Mei', 'Sami', 'Greta', 'Luis', 'Ines', 'Theo'];
  const ARRIVAL_LINES = {
    rescue: '{name} was hiding {place}. Coming with you.',
    recruit: '{name} heard the radio and walked in at dusk.',
    gate: '{name} waits at the gate for a free bed.',
    food: 'No bed for {name}, who leaves you a sack of food and heads north.',
  };
  const PARTY_LINES = [
    '{name} found a crate of bolts behind the laundromat.',
    '{name} came back with a car battery and a sack of rice.',
    '{name} stripped a delivery van down to the frame.',
    '{name} raided a garden centre for seed packets.',
    '{name} found a pharmacy nobody had emptied yet.',
    '{name} dragged home a shopping cart full of copper.',
  ];

  // Objective chain (SPEC 7.2). check: interpreted by the engine. target: building the goal chip points at.
  const OBJECTIVES = [
    { text: 'Build the Garden', check: { level: 'garden', lv: 1 }, reward: { scrap: 30 }, target: 'garden' },
    { text: 'Build the Workbench', check: { level: 'workbench', lv: 1 }, reward: { scrap: 30 }, target: 'workbench' },
    { text: 'Unlock the SMG', check: { weapon: 'smg' }, reward: { food: 20 }, target: null },
    { text: 'Build the Radio Mast', check: { level: 'radio', lv: 1 }, reward: {}, target: 'radio', note: 'The supply drop arrives' },
    { text: 'Win on Laundromat Row', check: { wins: 'R2' }, reward: { scrap: 50 }, target: null },
    { text: 'Speed up a timer with batteries', check: { flag: 'taughtSkip' }, reward: { bat: 5 }, target: null },
    { text: 'Bunkhouse to 2', check: { level: 'bunkhouse', lv: 2 }, reward: { food: 40 }, target: 'bunkhouse' },
    { text: 'Have 4 survivors', check: { survivors: 4 }, reward: { scrap: 50 }, target: null },
    { text: 'Storehouse to 2', check: { level: 'storehouse', lv: 2 }, reward: { scrap: 60 }, target: 'storehouse' },
    { text: 'Campfire to 3', check: { level: 'campfire', lv: 3 }, reward: { food: 40 }, target: 'campfire' },
    { text: 'Build the Infirmary and craft a medkit', check: { level: 'infirmary', lv: 1, flag: 'medkitMade' }, reward: { meds: 20 }, target: 'infirmary' },
    { text: 'Win a run with a medkit equipped', check: { flag: 'medRunWin' }, reward: { scrap: 60 }, target: null },
    { text: 'Campfire to 4', check: { level: 'campfire', lv: 4 }, reward: { bat: 5 }, target: 'campfire' },
    { text: 'Send a scavenging party', check: { flag: 'partySent' }, reward: { bat: 5 }, target: 'radio' },
    { text: 'Win on Bus Depot', check: { wins: 'R3' }, reward: { bat: 5 }, target: null },
    { text: 'Unlock the Shotgun', check: { weapon: 'shotgun' }, reward: { bat: 5 }, target: 'workbench' },
    { text: 'Craft a noise bomb', check: { flag: 'bombMade' }, reward: { bat: 5 }, target: null },
    { text: 'Hire the third crew or have 6 survivors', check: { crewsOrSurvivors: [3, 6] }, reward: { bat: 10 }, target: null },
    { text: 'Campfire to 5', check: { level: 'campfire', lv: 5 }, reward: { bat: 10 }, target: 'campfire' },
    { text: 'Build the Generator and collect a battery', check: { level: 'generator', lv: 1, flag: 'genCollected' }, reward: { bat: 5 }, target: 'generator' },
    { text: 'Win on Clinic Block', check: { wins: 'R4' }, reward: { bat: 10 }, target: 'radio' },
    { text: 'Campfire to 6', check: { level: 'campfire', lv: 6 }, reward: { bat: 10 }, target: 'campfire' },
    { text: 'Win on Stadium Gate', check: { wins: 'R5' }, reward: { bat: 15 }, target: 'radio' },
    { text: 'Campfire to 7', check: { level: 'campfire', lv: 7 }, reward: { bat: 15 }, target: 'campfire' },
    { text: 'Unlock the Rifle', check: { weapon: 'rifle' }, reward: { bat: 10 }, target: 'workbench' },
    { text: 'Campfire to 8', check: { level: 'campfire', lv: 8 }, reward: { bat: 15 }, target: 'campfire' },
    { text: 'Infirmary to 8 (Second Wind x2)', check: { level: 'infirmary', lv: 8 }, reward: { bat: 15 }, target: 'infirmary' },
    { text: 'Campfire to 9', check: { level: 'campfire', lv: 9 }, reward: { bat: 20 }, target: 'campfire' },
    { text: 'Campfire to 10: light the signal fire', check: { level: 'campfire', lv: 10 }, reward: { bat: 25 }, target: 'campfire', end: true },
  ];

  // First minutes (SPEC 7.1): Noor coaches. The engine advances `ftue.step`; the UI draws the spotlight.
  const FTUE = [
    { step: 1, target: 'fire', line: 'Tap the fire.', after: 'There. Now they can see us.' },
    { step: 2, target: 'pile', line: 'Grab that scrap.' },
    { step: 3, target: 'salvage', line: 'Build a Salvage Yard.' },
    { step: 4, target: 'play', line: 'Corner Store. Go.' },
    { step: 5, target: 'crate', line: 'Open it.' },
    { step: 6, target: 'campfire', line: 'Feed the fire. More light, more room.' },
  ];

  // Scene numbers the engine exposes in view() (world units, SPEC 3.1 / 8.2).
  const SCENE = {
    world: { w: 1280, h: 560 },
    campRange: [null, [360, 920], [220, 1060], [120, 1160], [0, 1280], [0, 1280], [0, 1280], [0, 1280], [0, 1280], [0, 1280], [0, 1280]],
    lightBase: 280, lightPerCL: 50,
  };

  // Lab ranges (SPEC 9).
  const LAB = {
    mul: { min: 0.25, max: 4 },
    freeSec: { min: 0, max: 300 },
    skipExp: { min: 0.6, max: 1.0 },
    momentum: { min: 0, max: 0.15 },
    momentumCap: { min: 0, max: 0.5 },
    skill: { min: -0.2, max: 0.2 },
    lossPayout: { min: 0, max: 0.6 },
    injuryMin: { min: 0, max: 15 },
    intelG: { min: 0, max: 6 },
    D0: { min: 80, max: 150 },
    night: { min: 0.3, max: 0.8 },
    medCalm: { min: 0.4, max: 1.0 },
    runScreenSec: [3, 8, 20],
    grant: { scrap: 1000, food: 500, meds: 100, bp: 5, bat: 100 },
  };

  // The one scaling rule for the Lab "costs" multiplier: costs and storage caps scale together.
  function scale(v, mult) {
    if (!mult || mult === 1) return v;
    return v > 0 ? Math.max(1, Math.round(v * mult)) : 0;
  }
  function reqCL(id, lv) { return id === 'campfire' ? lv - 1 : Math.max(BUILDINGS[id].unlockCL, lv); }

  // Data rule: every cost (S, F, M) of building b at level L is at most 80% of the storage cap at
  // Storehouse level max(1, reqCL - 1). Returns the list of violations (empty = ok).
  function assertData(mult) {
    const m = mult || 1, caps = BUILDINGS.storehouse.caps, out = [];
    for (const id of BUILDING_IDS) {
      const b = BUILDINGS[id];
      for (let L = 1; L <= b.max; L++) {
        const c = b.cost[L]; if (!c) continue;
        const sl = Math.max(1, reqCL(id, L) - 1);
        const keys = ['scrap', 'food', 'meds'];
        for (let i = 0; i < 3; i++) {
          const cost = scale(c[i], m), cap = scale(caps[keys[i]][sl], m);
          if (cost > 0.8 * cap) out.push({ id, lv: L, res: keys[i], cost, cap, storehouse: sl });
        }
      }
    }
    return out;
  }

  return {
    BUILDING_IDS, BUILDINGS, PRODUCERS, WORKER_SLOTS, WORKER_BONUS, FIRST_BUILD_BUFFER_H, BUBBLE_MIN_SHARE,
    START, CREW, ROUTES, ROUTE_FIRST_WIN_BP, ROUTE_BAT_DROP, ROUTE_PLACE, MAP_SUPPLIES, PITY, EXTRA_RESCUE_FOOD, GATE_MAX,
    DAILY, LOSS_PAYOUT, RUN_STATS, WEAPONS, WEAPON_ORDER, CRAFTS, STOCK_MAX, QUEUE_MAX, RECRUIT, PARTIES, INJURY, SKIP,
    MOMENTUM, OFFLINE, TIME_SCALES, FRAME_CLAMP_MS, PACKS, SUPPLY_DROP, ROSTER, ARRIVAL_LINES, PARTY_LINES, OBJECTIVES,
    FTUE, SCENE, LAB, scale, reqCL, assertData,
  };
});
