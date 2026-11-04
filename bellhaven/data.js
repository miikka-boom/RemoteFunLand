/* Bellhaven data tables (SPEC sections 2-7): plain data, lookups only, no rules beyond the data rule check.
 *
 * Classic script with the shared UMD header: BH.DATA in the browser (load it first), module.exports in node.
 * Times in this file are SECONDS (the engine converts them to integer ms); money is bricks, cans or sparks.
 * Arrays indexed by level carry a 0 at index 0 (level 0 = not built yet), so cost[L] is the price of reaching L.
 *
 *   BH.DATA.TOWER, BUILDINGS, TYPES, WEAPON_NAMES, CAP0, EXPAND, START, DESTS (with .dir, the TTL director, and .supplies),
 *   DEST_IDS, KIT, XP_AT, ROLE_STATS, TRAITS, TRAIT_IDS, NICKNAMES, NICK_IDS, RULES, SKIP, GOALS, DECOR, HOUSE_COLORS,
 *   FLOWERS, GRAVE, TEXT, LAB_DEFAULT, LAB_RANGE, depotsAllowed(T), maxCapAt(T, cur, costMul)
 *   BH.DATA.assertData(costMul = 1) -> [] when every cost is at most 80 % of the highest cap the player can have at the
 *     Tower level where that cost first appears (SPEC 3.4, datarule.cjs); else a list of violation strings.
 *     Costs and caps are scaled by costMul and rounded the way the engine rounds them (Math.round).
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).DATA = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const MIN = 60, H = 3600;

  // ------------------------------------------------------------------ 3.4.1 Bell Tower (index = level)
  const TOWER = {
    cost:   [0, 0, 150, 300, 800, 1900, 4500, 9000, 15000, 24000, 36000],
    time:   [0, 0, 20, 60, 8 * MIN, 45 * MIN, 6 * H, 12 * H, 18 * H, 30 * H, 42 * H],
    sparks: [0, 0, 3, 5, 8, 10, 12, 15, 18, 20, 40],
    cranes: [0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3],
    hordeWarn: [0, 3.3, 3.6, 3.9, 4.2, 4.5, 4.8, 5.1, 5.4, 5.7, 6.0],     // 3 + 0.3 x level (s)
    max: 10,
  };

  // ------------------------------------------------------------------ 3.4 buildings. count: [[towerLevel, howMany], ...]
  const PT = [0, 10, 60, 5 * MIN, 20 * MIN, H, 2 * H, 4 * H, 8 * H];   // Kiln and Cannery times L1-L8
  const BUILDINGS = {
    tower:   { name: 'Bell Tower', short: 'Tower', w: 3, cur: 'bricks', max: 10, count: [[1, 1]], cost: TOWER.cost, time: TOWER.time },
    kiln:    { name: 'Kiln', w: 2, cur: 'bricks', max: 8, count: [[1, 1], [3, 2], [6, 3]],
               cost: [0, 100, 250, 600, 1300, 2100, 4100, 7500, 12000], time: PT,
               res: 'bricks', rate: [0, 300, 360, 430, 510, 600, 700, 810, 930], hold: [0, 3, 4, 5, 6, 8, 10, 12, 14] },
    cannery: { name: 'Cannery', w: 2, cur: 'bricks', max: 8, count: [[1, 1], [5, 2]],
               cost: [0, 80, 200, 500, 1100, 1800, 3600, 6600, 10500], time: PT,
               res: 'cans', rate: [0, 150, 180, 210, 240, 270, 300, 330, 360], hold: [0, 3, 4, 5, 6, 8, 10, 12, 14] },
    depot:   { name: 'Depot', w: 2, cur: 'bricks', max: 8, count: [[2, 1], [4, 2], [7, 3]],
               cost: [0, 150, 400, 1000, 2200, 3400, 6800, 11000, 18000],
               time: [0, 20, 2 * MIN, 10 * MIN, 30 * MIN, H, 2 * H, 4 * H, 6 * H],
               capB: [0, 1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000], capC: [0, 700, 1200, 2000, 3200, 5000, 7500, 11000, 16000] },
    house:   { name: 'House', w: 2, cur: 'cans', max: 2, count: [[1, 1], [3, 2], [6, 3]],
               cost: [0, 80, 300], time: [0, 30, 10 * MIN], beds: [0, 2, 3] },
    clinic:  { name: 'Clinic', w: 2, cur: 'cans', max: 6, count: [[2, 1]],
               cost: [0, 60, 300, 900, 2200, 6000, 12000], time: [0, 30, 5 * MIN, 25 * MIN, H, 3 * H, 6 * H],
               rescue: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18],                  // + stretcher chance (Lab: per level)
               restMul: [1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.60], sw: [1, 1, 1, 1, 1, 2, 2] },
    armory:  { name: 'Armory', w: 2, cur: 'cans', max: 8, count: [[2, 1]],
               cost: [0, 60, 250, 700, 1600, 3500, 8000, 14000, 22000],
               time: [0, 30, 3 * MIN, 15 * MIN, 45 * MIN, 2 * H, 4 * H, 6 * H, 10 * H],
               weapon: ['pistol', 'smg', 'smg', 'shotgun', 'shotgun', 'rifle', 'rifle', 'rifle', 'rifle'],
               damage: [1.00, 1.00, 1.03, 1.06, 1.09, 1.12, 1.15, 1.18, 1.21], power: [0, 5, 7, 10, 12, 15, 17, 19, 21] },
    inn:     { name: 'Inn', w: 2, cur: 'cans', max: 3, count: [[3, 1]],
               cost: [0, 100, 450, 1200], time: [0, 60, 10 * MIN, 40 * MIN],
               travelers: [0, 2, 3, 3], level2: [0, 0, 0, 1], refresh: [0, H, 40 * MIN, 20 * MIN] },
  };
  const TYPES = ['tower', 'kiln', 'cannery', 'depot', 'house', 'clinic', 'armory', 'inn'];
  const WEAPON_NAMES = { pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'Rifle' };
  const CAP0 = { bricks: 1000, cans: 600 };                               // the Tower's base caps (2)

  // ------------------------------------------------------------------ 3.2 land rings (index = ring)
  const EXPAND = {
    tower:  [1, 2, 4, 6, 8],
    cost:   [0, 150, 1000, 4000, 10000],
    time:   [0, MIN, 15 * MIN, H, 3 * H],
    rubble: [6, 5, 6, 7, 8],
    clear:  [25, 50, 75, 100, 125],
    glint: 3, maxRing: 4,
  };

  // ------------------------------------------------------------------ 2, 3.1 start
  const START = {
    bricks: 200, cans: 150, sparks: 15, kilnBubble: 100,
    tower: { gx: 10, gy: 10 }, kiln: { gx: 13, gy: 9 }, house: { gx: 9, gy: 13 },
    rubble: [[8, 8, true], [15, 8, false], [8, 11, false], [11, 15, false], [15, 15, false], [8, 15, false]],
    firstSpot: { gx: 13, gy: 13 },                                        // the onboarding Cannery ghost
    world: 24, gateGy: [11, 12],
  };

  // ------------------------------------------------------------------ 6.1 destinations and their Two Thumbs Left director
  const DESTS = [
    { id: 'D1', n: 1, name: 'Allotments', threat: 6, tower: 1, clinic: false, fav: 'sprinter', bricks: 40, cans: 25, xp: 20, rest: 3 * MIN, rescue: 1.00, first: 2,
      dir: { W: 2, H: 1, hordeMul: 0.8, zombieCap: 35, lengthS: 210, firstHordeS: [50, 70], hordeGapS: [90, 130], gateS: 45, waveEveryS: 10 },
      supplies: { medkit: 2, pills: 3, noiseBomb: 2, ammo: 3, rifleInLot: false } },
    { id: 'D2', n: 2, name: 'Car Wash', threat: 16, tower: 2, clinic: true, fav: 'brawler', bricks: 90, cans: 45, xp: 35, rest: 6 * MIN, rescue: 0.40, first: 4,
      dir: { W: 3, H: 1, hordeMul: 0.9, zombieCap: 40, lengthS: 240, firstHordeS: [45, 65], hordeGapS: [85, 125], gateS: 50, waveEveryS: 10 },
      supplies: { medkit: 1, pills: 3, noiseBomb: 2, ammo: 2, rifleInLot: false } },
    { id: 'D3', n: 3, name: 'Night Market', threat: 24, tower: 3, clinic: false, fav: 'scout', bricks: 200, cans: 80, xp: 60, rest: 12 * MIN, rescue: 0.35, first: 6,
      dir: { W: 3, H: 2, hordeMul: 1.0, zombieCap: 45, lengthS: 300, firstHordeS: [40, 60], hordeGapS: [75, 120], gateS: 60, waveEveryS: 10 },
      supplies: { medkit: 1, pills: 2, noiseBomb: 2, ammo: 2, rifleInLot: true } },
    { id: 'D4', n: 4, name: 'Rail Yard', threat: 34, tower: 5, clinic: false, fav: 'marksman', bricks: 600, cans: 150, xp: 100, rest: 20 * MIN, rescue: 0.30, first: 10,
      dir: { W: 4, H: 2, hordeMul: 1.2, zombieCap: 55, lengthS: 360, firstHordeS: [35, 55], hordeGapS: [70, 110], gateS: 65, waveEveryS: 9 },
      supplies: { medkit: 1, pills: 2, noiseBomb: 1, ammo: 2, rifleInLot: true } },
    { id: 'D5', n: 5, name: 'Hospital Hill', threat: 46, tower: 7, clinic: false, fav: 'medic', bricks: 1300, cans: 260, xp: 150, rest: 35 * MIN, rescue: 0.25, first: 14,
      dir: { W: 4, H: 3, hordeMul: 1.4, zombieCap: 65, lengthS: 390, firstHordeS: [35, 50], hordeGapS: [65, 100], gateS: 70, waveEveryS: 9 },
      supplies: { medkit: 1, pills: 1, noiseBomb: 1, ammo: 1, rifleInLot: true } },
    { id: 'D6', n: 6, name: 'Ferry Terminal', threat: 58, tower: 9, clinic: false, fav: 'sprinter', bricks: 2600, cans: 420, xp: 220, rest: 50 * MIN, rescue: 0.20, first: 18,
      dir: { W: 5, H: 4, hordeMul: 1.7, zombieCap: 75, lengthS: 420, firstHordeS: [30, 45], hordeGapS: [60, 90], gateS: 80, waveEveryS: 8 },
      supplies: { medkit: 0, pills: 1, noiseBomb: 1, ammo: 1, rifleInLot: true } },
  ];
  const DEST_IDS = DESTS.map((d) => d.id);
  const KIT = { medkit: 25, pills: 15, bomb: 20, order: ['medkit', 'pills', 'bomb'], bombLifeS: 6 };   // cans x destination number

  // ------------------------------------------------------------------ 4.4-4.8 people
  const XP_AT = [0, 0, 60, 180, 380, 680, 1100, 1700, 2500, 3600, 5000];   // cumulative XP to reach level L
  const ROLE_STATS = {   // 4.4: one stat each, growing with level L
    sprinter: { name: 'Sprinter', fav: ['D1', 'D6'], ttl: 'speed', base: 200, perLv: 2 },
    brawler:  { name: 'Brawler', fav: ['D2'], ttl: 'shoveCdMul', base: 1, perLv: -0.03 },
    marksman: { name: 'Marksman', fav: ['D4'], ttl: 'assist', base: 0.5, perLv: 0.03, damagePerLv: 0.01 },
    medic:    { name: 'Medic', fav: ['D5'], ttl: 'medkitHeal', base: 0.8, perLv: 0.02, healS: 3, healSPerLv: -0.1 },
    scout:    { name: 'Scout', fav: ['D3'], ttl: 'flashlightR', base: 520, perLv: 12, warnPerLv: 0.2 },
  };
  const TRAITS = {       // 4.5, in the generator's order (names.js TRAITS)
    tough:         { name: 'Tough', line: 'Shrugs off what floors others.', effect: 'max HP 115', maxHp: 115 },
    lucky:         { name: 'Lucky', line: 'Always gets found.', effect: 'stretcher chance +15 %', rescue: 0.15 },
    light_sleeper: { name: 'Light sleeper', line: 'Up before the bell.', effect: 'rest × 0.7', rest: 0.7 },
    quick_learner: { name: 'Quick learner', line: 'Never makes the same mistake twice.', effect: 'XP × 1.25', xp: 1.25 },
    steady:        { name: 'Steady', line: 'Hands that never shake.', effect: 'aim assist +0.10', power: 2, assist: 0.10, accAdd: 6 },
    iron_stomach:  { name: 'Iron stomach', line: 'Pills hit harder.', effect: 'pills give +70 temporary HP (not +50)', pillsTemp: 70 },
    night_owl:     { name: 'Night owl', line: 'Sees in the dark.', effect: 'flashlight +40; +2 power at the Night Market', flashlight: 40, powerAt: { D3: 2 } },
    reckless:      { name: 'Reckless', line: 'Goes in first.', effect: 'damage × 1.1, stretcher chance −15 %', power: 2, damage: 1.1, rescue: -0.15 },
    loud:          { name: 'Loud', line: 'Everyone hears the jokes.', effect: 'loot × 1.2, hordes × 1.15', power: -2, loot: 1.2, hordeMul: 1.15 },
    heavy:         { name: 'Heavy', line: 'Hard to knock over. Hard to hurry.', effect: 'max HP +10, speed −15', power: -1, maxHp: 110, speed: -15 },
  };
  const TRAIT_IDS = ['tough', 'lucky', 'light_sleeper', 'quick_learner', 'steady', 'iron_stomach', 'night_owl', 'reckless', 'loud', 'heavy'];
  const NICKNAMES = {    // 4.8, checked after every run in this order
    ghost:       { name: 'Ghost', perk: 'speed +5', speed: 5 },
    mower:       { name: 'Mower', perk: 'damage × 1.05', damage: 1.05 },
    elbows:      { name: 'Elbows', perk: 'shove cooldowns × 0.9', shove: 0.9 },
    gatecrasher: { name: 'Gatecrasher', perk: 'horde warning +1 s', warn: 1, endHpMax: 10 },
    lastbreath:  { name: 'Lastbreath', perk: 'max HP +5', maxHp: 5 },
    comeback:    { name: 'Comeback', perk: 'stretcher +5 %', rescue: 0.05, hurtTimes: 2 },
    oldhand:     { name: 'Old Hand', perk: 'rest × 0.75', rest: 0.75, runs: 15 },
  };
  const NICK_IDS = ['ghost', 'mower', 'elbows', 'gatecrasher', 'lastbreath', 'comeback', 'oldhand'];

  // ------------------------------------------------------------------ rules of 2, 4.10, 5, 6.5-6.7
  const RULES = {
    lossLoot: 0.3, lossXp: 0.4, killBricks: 0.25, hurtMul: 3, daily: 5, crane4: 200, crane4Tower: 4, forcedWins: 2,
    inviteBase: 60, invitePer: 30, maxBeds: 9,
    reviveCansA: 50, reviveCansB: 50, reviveSparksA: 8, reviveSparksB: 4, reviveCapShare: 0.8, escalationCap: 2,
    recoverPerLvS: 10 * MIN, strangerCans: 50, strangerSparks: 5, strangerLv: 2, strangerTower: 3,
    downS: 24 * H, offlineMinS: 5, offlineCapS: 7 * 24 * H, welcomeMinS: 2 * MIN, frameClampMs: 1000,
    runWarp: 6, mcN: 400, mcSeedStep: 7919, maxHistory: 12, maxHistoryChars: 60, epitaphKills: 120,
    bubbleShow: 0.1, maxWalkers: 9,
  };
  const SKIP = { freeSec: 60, k: 1.2, exp: 0.72, confirmAt: 20 };          // 5.6

  // ------------------------------------------------------------------ 7.2 the goal chain: [key, reward, text]
  const GOALS = [
    ['build:cannery:1', { cans: 30 }, 'Build a Cannery'],
    ['win:D1', { bricks: 50 }, 'Make it home from the Allotments'],
    ['tower:2', {}, 'Bell Tower to 2'],
    ['build:armory:1', { cans: 40 }, 'Build the Armory'],
    ['build:clinic:1', { cans: 40 }, 'Build the Clinic'],
    ['win:D2', { bricks: 80 }, 'Make it home from the Car Wash'],
    ['build:depot:1', { bricks: 60 }, 'Build a Depot'],
    ['tower:3', {}, 'Bell Tower to 3'],
    ['count:house:2', { cans: 40 }, 'Build a second House'],
    ['expand:1', { bricks: 60 }, 'Expand the land'],
    ['build:inn:1', { cans: 60 }, 'Build the Inn'],
    ['people:4', { cans: 60 }, 'Have 4 people'],
    ['win:D3', { bricks: 150 }, 'Make it home from the Night Market'],
    ['skip', { sparks: 5 }, 'Finish something with sparks'],
    ['count:kiln:2', { cans: 100 }, 'Build a second Kiln'],
    ['build:house:2', { cans: 60 }, 'Upgrade a House to level 2'],
    ['tower:4', {}, 'Bell Tower to 4'],
    ['build:clinic:2', { bricks: 150 }, 'Clinic to 2'],
    ['build:armory:3', { sparks: 5 }, 'Armory to 3 (the shotgun)'],
    ['tower:5', {}, 'Bell Tower to 5'],
    ['win:D4', { sparks: 5 }, 'Make it home from the Rail Yard'],
    ['people:5', { sparks: 5 }, 'Have 5 people'],
    ['tower:6', {}, 'Bell Tower to 6'],
    ['build:clinic:4', { sparks: 5 }, 'Clinic to 4'],
    ['tower:7', {}, 'Bell Tower to 7'],
    ['win:D5', { sparks: 5 }, 'Make it home from Hospital Hill'],
    ['tower:8', {}, 'Bell Tower to 8'],
    ['tower:9', {}, 'Bell Tower to 9'],
    ['win:D6', { sparks: 5 }, 'Make it home from the Ferry Terminal'],
    ['tower:10', {}, 'Bell Tower to 10: ring the gold bell'],
  ];

  // ------------------------------------------------------------------ 3.6 decorations (P1): 1 x 1, no effect, placed at once
  const DECOR = {
    tree:  { name: 'Tree', cost: 50, tower: 2 },
    bench: { name: 'Bench', cost: 80, tower: 3 },
    lamp:  { name: 'Lamp', cost: 120, tower: 5 },
  };

  // ------------------------------------------------------------------ look (8.15) that the engine hands to the renderer
  const HOUSE_COLORS = [{ name: 'blue', roof: '#5b7fb8' }, { name: 'green', roof: '#5d9b6b' }, { name: 'plum', roof: '#9a70b0' }];
  const FLOWERS = ['#f2c14e', '#e5534b', '#f7f2e8', '#9a70b0'];
  const GRAVE = { grassMs: 86400000, flowers2Ms: 3 * 86400000, flowers4Ms: 7 * 86400000, candleMs: 86400000 };

  // ------------------------------------------------------------------ player-facing strings (4.13; no pronouns anywhere)
  const TEXT = {
    arrived: { starter: 'Night {n}. One of the first two.', inn: 'Night {n}. Walked in from the Inn.', drifter: 'Night {n}. Drifted in at the gate.',
               stranger: 'Night {n}. Found Down at the gate.', lab: 'Night {n}. Arrived from the Lab.' },
    win: 'Night {n}. {D}: home in {m}, {k} kills.', winSecondWind: 'Night {n}. {D}: home on a second wind.',
    hurt: 'Night {n}. Overrun at the {D}. Carried home.', down: 'Night {n}. Overrun at the {D}. Down.',
    revivedCans: 'Night {n}. Revived in the Clinic.', revivedSparks: 'Night {n}. Revived with sparks.',
    nickname: 'Night {n}. Everyone calls {F} “{Nick}” now.', level: 'Night {n}. Level {L}.', lost: 'Night {n}. Lost {N} at the {D}.',
    levelLines: [3, 5, 7, 10],
    epitaphNick: 'Everyone called {F} “{Nick}”.', epitaphKills: 'Once cleared {k} in one night.',
    epitaphRuns0: 'Came to the gate on Night {n}.', epitaphRuns1: 'Ran one night for Bellhaven.', epitaphRunsN: 'Ran {k} nights for Bellhaven.',
    usedToBe: 'Used to be {a} {trade}.',
    finale: 'Bellhaven is whole. The gold bell rings for everyone who lives here, and for everyone who is remembered here.',
    deathOn: 'From now on a failed run can cost a life. The odds are always on the button.',
    explainers: [   // 13.3: every system in three short sentences or fewer
      'Cranes build and upgrade, one job each. Nothing can be higher than the Bell Tower.',
      'Kilns make bricks and Canneries make cans. Tap a bubble to collect. Depots let you keep more.',
      'Expand the fence for more land. Clear the rubble; some of it hides sparks.',
      'Everyone has a role, a trait and a level. Runs make people stronger and can earn a nickname. A role that fits the place helps a lot.',   // 13.3 says "them": no pronouns
      'Pick a place and a runner. The odds are shown before you go. Tired runners can go, but start with less health.',
      'Medkit, pills and a noise bomb are packed if you have the cans. You only pay for what gets used.',
      'If a run fails, the stretcher team may still bring the runner home. If not, revive the runner with cans or sparks within a day, or say goodbye. The fallen get a grave in the city.',   // 13.3 says "revive them": no pronouns
      'Travelers stop at the Inn. Invite one if you have a free bed.',
      'Sparks finish timers and revive people. Anything under a minute is free. You earn sparks by playing.',
    ],
  };

  // ------------------------------------------------------------------ 9 the Lab: defaults and ranges (saved with the game)
  const LAB_DEFAULT = {
    timeScale: 1, runsAdvanceClock: true, runWarp: 6, force: 'auto', runScreenS: 8, lockSeed: null, waitReal: false,
    mul: { cost: 1, time: 1, prod: 1, loot: 1, xp: 1, death: 1, revive: 1, rest: 1, inn: 1 },
    rescueBase: [1, 0.40, 0.35, 0.30, 0.25, 0.20], clinicRescue: 0.03, tiredFloor: 0.6, escalationCap: 2,
    downWindowMs: 86400000, freeSec: 60, skipExp: 0.72, skipK: 1.2, reducedMotion: null,
  };
  const LAB_RANGE = {
    timeScale: [0, 1, 10, 60, 600], runScreenS: [3, 8, 20], force: ['auto', 'win', 'loss', 'down', 'hurt'],
    runWarp: [0, 20], forcedWins: [0, 2],
    mul: { cost: [0.25, 4], time: [0.1, 4], prod: [0.25, 4], loot: [0.25, 4], xp: [0.25, 4], death: [0, 3], revive: [0.25, 4], rest: [0.1, 4], inn: [0.1, 4] },
    rescueBase: [0, 1], clinicRescue: [0, 0.10], tiredFloor: [0.3, 1.0], escalationCap: [0, 4], downWindowMs: [60000, 172800000],
    freeSec: [0, 300], skipExp: [0.6, 0.9], skipK: [0.5, 3],
  };

  // ------------------------------------------------------------------ the data rule (3.4): asserted at load and by tests
  function depotsAllowed(T) { let n = 0; for (const [tw, c] of BUILDINGS.depot.count) if (T >= tw) n = c; return n; }
  function maxCapAt(T, cur, costMul) {          // all allowed Depots at the highest allowed level
    const m = costMul == null ? 1 : costMul, lv = Math.min(BUILDINGS.depot.max, T), row = cur === 'bricks' ? BUILDINGS.depot.capB : BUILDINGS.depot.capC;
    return Math.round(CAP0[cur] * m) + depotsAllowed(T) * Math.round(row[lv] * m);
  }
  function assertData(costMul) {
    const m = costMul == null ? 1 : costMul, bad = [];
    const chk = (what, cost, T, cur) => {
      const c = Math.round(cost * m), cap = maxCapAt(T, cur, m);
      if (c > 0.8 * cap) bad.push(what + ': ' + c + ' ' + cur + ' > 80 % of ' + cap + ' at Tower ' + T);
    };
    for (let L = 2; L <= TOWER.max; L++) chk('Bell Tower L' + L, TOWER.cost[L], L - 1, 'bricks');
    for (const t of TYPES) {
      if (t === 'tower') continue;
      const B = BUILDINGS[t], first = B.count[0][0];
      for (let L = 1; L <= B.max; L++) chk(B.name + ' L' + L, B.cost[L], Math.max(L, first), B.cur);
    }
    for (let r = 1; r <= EXPAND.maxRing; r++) chk('Expansion ' + r, EXPAND.cost[r], EXPAND.tower[r], 'bricks');
    for (let r = 0; r <= EXPAND.maxRing; r++) chk('Rubble on ring ' + r, EXPAND.clear[r], EXPAND.tower[r], 'bricks');
    for (const k of Object.keys(DECOR)) chk('Decoration ' + k, DECOR[k].cost, DECOR[k].tower, 'bricks');
    return bad;
  }

  return { TOWER, BUILDINGS, TYPES, WEAPON_NAMES, CAP0, EXPAND, START, DESTS, DEST_IDS, KIT, XP_AT, ROLE_STATS, TRAITS, TRAIT_IDS,
    NICKNAMES, NICK_IDS, RULES, SKIP, GOALS, DECOR, HOUSE_COLORS, FLOWERS, GRAVE, TEXT, LAB_DEFAULT, LAB_RANGE,
    depotsAllowed, maxCapAt, assertData };
});
