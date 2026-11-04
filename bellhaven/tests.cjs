// Bellhaven node tests: SPEC section 12.A. Run from any folder:   node bellhaven/tests.cjs   (exit code 1 on any failure)
//
// Built so far (engine core, SPEC 13.1 steps 1-2): tests 1-8, 11-13, 19, 21, plus X1-X5 (goals, arrivals, view and
// demo, the Lab's dev ops, the clock's frame rules). The people-and-runs stage replaces the todo() placeholders for
// tests 9, 10, 14-18 and 20 with real tests (search for "todo(") and extends test 5's run-warp part with the full
// startRun -> resolveRun flow and test 19 with revives.
'use strict';
const path = require('path'), fs = require('fs'), vm = require('vm');
const DIR = __dirname;
const E = require(path.join(DIR, 'engine.js'));
const D = require(path.join(DIR, 'data.js'));
const N = require(path.join(DIR, 'names.js'));
const Run = require(path.join(DIR, 'run.js'));

const T0 = Date.UTC(2026, 10, 4, 9, 0, 0), SEC = 1000, MIN = 60000, H = 3600000, DAY = 86400000;
let pass = 0, fail = 0, todos = 0; const failures = [];
let current = '';
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(current + ': ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + ' (got ' + A + ', want ' + B + ')'); }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' ±' + tol + ')'); }
function test(name, fn) {
  current = name; const f0 = fail, t = Date.now();
  try { fn(); } catch (e) { fail++; failures.push(name + ': threw ' + (e && e.stack || e)); }
  console.log((fail === f0 ? 'PASS ' : 'FAIL ') + name + '  (' + (Date.now() - t) + ' ms)');
}
function todo(name, what) { todos++; console.log('TODO ' + name + '  (' + what + ')'); }
const must = (s, a, now) => { const r = E.act(s, a, now == null ? s.realLast : now); if (!r.ok) throw new Error('act ' + JSON.stringify(a) + ' failed: ' + r.err + ' ' + JSON.stringify(r.data)); return r; };
const act = (s, a, now) => E.act(s, a, now == null ? s.realLast : now);
const clone = (s) => JSON.parse(JSON.stringify(s));
const PRONOUN = /\b(he|she|him|her|his|hers|they|them|their|theirs)\b/i;

// ------------------------------------------------------------------ fixtures
function city(o) {
  o = o || {};
  const s = E.create({ realNow: T0, tzOffsetMin: 0, seed: o.seed == null ? 1 : o.seed });
  if (o.tower) s.buildings[0].lv = o.tower;
  if (o.ring != null) s.ring = o.ring;
  if (o.res) Object.assign(s.res, o.res);
  if (o.goalsDone) s.goal = D.GOALS.length;
  if (o.noRubble) s.rubble = [];
  return s;
}
function addB(s, type, lv, gx, gy, extra) {
  const cp = E.canPlace(s, type, gx, gy);
  if (!cp.ok) throw new Error('fixture: ' + type + ' at ' + gx + ',' + gy + ' is ' + cp.reason);
  const b = { id: 'b' + (++s.ids.b), type, lv, gx, gy };
  if (type === 'house') b.houseIdx = s.buildings.filter((x) => x.type === 'house').length;
  if (type === 'kiln' || type === 'cannery') { b.bubbleBase = 0; b.bubbleSinceMs = s.cityMs; }
  Object.assign(b, extra || {});
  s.buildings.push(b);
  return b;
}
const job = (s, kind, target, toLv, endMs) => { const j = { id: 'j' + (++s.ids.j), kind, target, toLv, startMs: s.cityMs, endMs }; s.jobs.push(j); return j; };
const runDest = (d) => ({ T: d.threat, W: d.dir.W, H: d.dir.H, len: d.dir.lengthS, hordeMul: d.dir.hordeMul });
const DEST = {}; D.DESTS.forEach((d) => { DEST[d.id] = runDest(d); });

// ================================================================== 1
test('1 data rule: every cost <= 80 % of the highest cap at its unlock level, at cost x 0.25, 1 and 4', () => {
  for (const m of [0.25, 0.5, 1, 1.5, 2, 4]) eq(D.assertData(m), [], 'violations at x' + m);
  eq(E.DATA_RULE, [], 'asserted when the engine loads');
  const s = city();
  for (const m of [0.25, 4]) { const r = must(s, { type: 'dev', op: 'mul', key: 'cost', value: m }); eq(r.data.dataRule, [], 'Lab costs x' + m + ' re-check'); }
  eq(E.caps(s), { bricks: 4000, cans: 2400 }, 'cost x 4 also scales the caps');
  eq(E.cost(s, 'kiln', 2), { res: 'bricks', n: 1000 }, 'cost x 4 scales a cost');
  // a cost that breaks the rule is reported
  const save = D.BUILDINGS.kiln.cost[2]; D.BUILDINGS.kiln.cost[2] = 2500;
  ok(D.assertData(1).length === 1 && /Kiln L2/.test(D.assertData(1)[0]), 'a violation is reported: ' + D.assertData(1));
  D.BUILDINGS.kiln.cost[2] = save;
});

// ================================================================== 2
test('2 tables: 3.4, 3.2, 4.8 and 6.1 against BH.DATA', () => {
  const T = D.TOWER;
  const tower = [[2, 150, 20, 3, 1, 3.6], [3, 300, 60, 5, 2, 3.9], [4, 800, 480, 8, 2, 4.2], [5, 1900, 2700, 10, 2, 4.5], [6, 4500, 21600, 12, 3, 4.8],
    [7, 9000, 43200, 15, 3, 5.1], [8, 15000, 64800, 18, 3, 5.4], [9, 24000, 108000, 20, 3, 5.7], [10, 36000, 151200, 40, 3, 6.0]];
  for (const [L, c, t, sp, cr, hw] of tower) eq([T.cost[L], T.time[L], T.sparks[L], T.cranes[L], T.hordeWarn[L]], [c, t, sp, cr, hw], 'Bell Tower L' + L);
  eq([T.cranes[1], T.hordeWarn[1]], [1, 3.3], 'Bell Tower L1');
  for (let L = 1; L <= 10; L++) near(T.hordeWarn[L], 3 + 0.3 * L, 1e-9, 'horde warning 3 + 0.3 L at ' + L);
  eq(T.cost.reduce((a, b) => a + b, 0), 91650, 'the ladder costs 91,650 bricks');
  near(T.time.reduce((a, b) => a + b, 0) / 3600, 108.9, 0.05, 'the ladder takes 108.9 h');
  eq(T.sparks.reduce((a, b) => a + b, 0), 131, 'Tower sparks total 131');
  const K = D.BUILDINGS.kiln, C = D.BUILDINGS.cannery;
  const prod = [[1, 100, 80, 10, 300, 150, 3, 900, 450], [2, 250, 200, 60, 360, 180, 4, 1440, 720], [3, 600, 500, 300, 430, 210, 5, 2150, 1050],
    [4, 1300, 1100, 1200, 510, 240, 6, 3060, 1440], [5, 2100, 1800, 3600, 600, 270, 8, 4800, 2160], [6, 4100, 3600, 7200, 700, 300, 10, 7000, 3000],
    [7, 7500, 6600, 14400, 810, 330, 12, 9720, 3960], [8, 12000, 10500, 28800, 930, 360, 14, 13020, 5040]];
  for (const [L, kc, cc, t, kr, cr, hold, kb, cb] of prod) {
    eq([K.cost[L], C.cost[L], K.time[L], C.time[L], K.rate[L], C.rate[L], K.hold[L], C.hold[L], K.rate[L] * K.hold[L], C.rate[L] * C.hold[L]],
      [kc, cc, t, t, kr, cr, hold, hold, kb, cb], 'Kiln/Cannery L' + L);
  }
  const DP = D.BUILDINGS.depot;
  const dep = [[1, 150, 20, 1200, 700], [2, 400, 120, 2000, 1200], [3, 1000, 600, 3500, 2000], [4, 2200, 1800, 5500, 3200], [5, 3400, 3600, 8500, 5000],
    [6, 6800, 7200, 13000, 7500], [7, 11000, 14400, 20000, 11000], [8, 18000, 21600, 30000, 16000]];
  for (const [L, c, t, b, cn] of dep) eq([DP.cost[L], DP.time[L], DP.capB[L], DP.capC[L]], [c, t, b, cn], 'Depot L' + L);
  const caps = [[1, 1000, 600], [2, 3000, 1800], [3, 4500, 2600], [4, 12000, 7000], [5, 18000, 10600], [6, 27000, 15600], [7, 61000, 33600], [8, 91000, 48600], [9, 91000, 48600], [10, 91000, 48600]];
  for (const [Tw, b, c] of caps) eq([D.maxCapAt(Tw, 'bricks'), D.maxCapAt(Tw, 'cans')], [b, c], 'highest caps at Tower ' + Tw);
  const HS = D.BUILDINGS.house;
  eq([HS.cost[1], HS.cost[2], HS.time[1], HS.time[2], HS.beds[1], HS.beds[2], HS.cur, HS.max], [80, 300, 30, 600, 2, 3, 'cans', 2], 'House');
  const CL = D.BUILDINGS.clinic;
  const cli = [[1, 60, 30, 0.03, 0.92, 1], [2, 300, 300, 0.06, 0.85, 1], [3, 900, 1500, 0.09, 0.78, 1], [4, 2200, 3600, 0.12, 0.72, 1], [5, 6000, 10800, 0.15, 0.66, 2], [6, 12000, 21600, 0.18, 0.60, 2]];
  for (const [L, c, t, r, m, sw] of cli) eq([CL.cost[L], CL.time[L], CL.rescue[L], CL.restMul[L], CL.sw[L]], [c, t, r, m, sw], 'Clinic L' + L);
  eq([CL.restMul[0], CL.sw[0], D.LAB_DEFAULT.clinicRescue], [1, 1, 0.03], 'Clinic L0 and the per-level stretcher');
  const AR = D.BUILDINGS.armory;
  const arm = [[0, 0, 0, 'pistol', 1.00, 0], [1, 60, 30, 'smg', 1.00, 5], [2, 250, 180, 'smg', 1.03, 7], [3, 700, 900, 'shotgun', 1.06, 10], [4, 1600, 2700, 'shotgun', 1.09, 12],
    [5, 3500, 7200, 'rifle', 1.12, 15], [6, 8000, 14400, 'rifle', 1.15, 17], [7, 14000, 21600, 'rifle', 1.18, 19], [8, 22000, 36000, 'rifle', 1.21, 21]];
  for (const [L, c, t, w, dm, p] of arm) eq([AR.cost[L], AR.time[L], AR.weapon[L], AR.damage[L], AR.power[L]], [c, t, w, dm, p], 'Armory L' + L);
  const IN = D.BUILDINGS.inn;
  const inn = [[1, 100, 60, 2, 0, 3600], [2, 450, 600, 3, 0, 2400], [3, 1200, 2400, 3, 1, 1200]];
  for (const [L, c, t, n, l2, r] of inn) eq([IN.cost[L], IN.time[L], IN.travelers[L], IN.level2[L], IN.refresh[L]], [c, t, n, l2, r], 'Inn L' + L);
  eq(D.TYPES.map((t) => [t, D.BUILDINGS[t].w, D.BUILDINGS[t].cur, D.BUILDINGS[t].max, D.BUILDINGS[t].count]),
    [['tower', 3, 'bricks', 10, [[1, 1]]], ['kiln', 2, 'bricks', 8, [[1, 1], [3, 2], [6, 3]]], ['cannery', 2, 'bricks', 8, [[1, 1], [5, 2]]],
      ['depot', 2, 'bricks', 8, [[2, 1], [4, 2], [7, 3]]], ['house', 2, 'cans', 2, [[1, 1], [3, 2], [6, 3]]], ['clinic', 2, 'cans', 6, [[2, 1]]],
      ['armory', 2, 'cans', 8, [[2, 1]]], ['inn', 2, 'cans', 3, [[3, 1]]]], '3.4: footprints, currencies, max levels, counts by Tower level');
  // 3.2 land rings
  const X = D.EXPAND;
  eq([X.tower, X.cost, X.time, X.rubble, X.clear, X.glint], [[1, 2, 4, 6, 8], [0, 150, 1000, 4000, 10000], [0, 60, 900, 3600, 10800], [6, 5, 6, 7, 8], [25, 50, 75, 100, 125], 3], '3.2 rings');
  // 2 and 3.1 start
  const s = city();
  eq([s.res, E.caps(s), s.buildings.map((b) => [b.type, b.lv, b.gx, b.gy]), E.bubble(s, 'b2').whole], [{ bricks: 200, cans: 150, sparks: 15 }, { bricks: 1000, cans: 600 },
    [['tower', 1, 10, 10], ['kiln', 1, 13, 9], ['house', 1, 9, 13]], 100], 'start amounts and layout');
  eq(s.rubble.map((r) => [r.gx, r.gy, r.glint]), [[8, 8, true], [15, 8, false], [8, 11, false], [11, 15, false], [15, 15, false], [8, 15, false]], 'start rubble, (8, 8) glinting');
  eq([E.cranes(s), E.beds(s), s.people.length], [{ total: 1, free: 1 }, 2, 2], 'one crane, two beds, two starters');
  // 4.8 XP
  eq(D.XP_AT, [0, 0, 60, 180, 380, 680, 1100, 1700, 2500, 3600, 5000], 'cumulative XP');
  // 6.1 destinations, kit and director
  const dst = [['D1', 'Allotments', 6, 1, false, 'sprinter', 40, 25, 20, 180, 1.00, 2, 25, 15, 20], ['D2', 'Car Wash', 16, 2, true, 'brawler', 90, 45, 35, 360, 0.40, 4, 50, 30, 40],
    ['D3', 'Night Market', 24, 3, false, 'scout', 200, 80, 60, 720, 0.35, 6, 75, 45, 60], ['D4', 'Rail Yard', 34, 5, false, 'marksman', 600, 150, 100, 1200, 0.30, 10, 100, 60, 80],
    ['D5', 'Hospital Hill', 46, 7, false, 'medic', 1300, 260, 150, 2100, 0.25, 14, 125, 75, 100], ['D6', 'Ferry Terminal', 58, 9, false, 'sprinter', 2600, 420, 220, 3000, 0.20, 18, 150, 90, 120]];
  for (const [id, name, th, tw, cl, fav, b, c, xp, rest, resc, first, km, kp, kb] of dst) {
    const d = D.DESTS.find((x) => x.id === id), k = E.price.kit(id);
    eq([d.name, d.threat, d.tower, d.clinic, d.fav, d.bricks, d.cans, d.xp, d.rest, d.rescue, d.first, k.medkit, k.pills, k.bomb, D.LAB_DEFAULT.rescueBase[d.n - 1]],
      [name, th, tw, cl, fav, b, c, xp, rest, resc, first, km, kp, kb, resc], '6.1 ' + id);
  }
  eq(D.DESTS.reduce((a, d) => a + d.first, 0), 54, 'first clears total 54 ✦');
  const dir = [['D1', 2, 1, 0.8, 35, 210, [50, 70], [90, 130], 45, 10, [2, 3, 2, 3, false]], ['D2', 3, 1, 0.9, 40, 240, [45, 65], [85, 125], 50, 10, [1, 3, 2, 2, false]],
    ['D3', 3, 2, 1.0, 45, 300, [40, 60], [75, 120], 60, 10, [1, 2, 2, 2, true]], ['D4', 4, 2, 1.2, 55, 360, [35, 55], [70, 110], 65, 9, [1, 2, 1, 2, true]],
    ['D5', 4, 3, 1.4, 65, 390, [35, 50], [65, 100], 70, 9, [1, 1, 1, 1, true]], ['D6', 5, 4, 1.7, 75, 420, [30, 45], [60, 90], 80, 8, [0, 1, 1, 1, true]]];
  for (const [id, W, Hh, hm, cap, len, fh, gap, gate, wave, sup] of dir) {
    const d = D.DESTS.find((x) => x.id === id).dir, m = D.DESTS.find((x) => x.id === id).supplies;
    eq([d.W, d.H, d.hordeMul, d.zombieCap, d.lengthS, d.firstHordeS, d.hordeGapS, d.gateS, d.waveEveryS, [m.medkit, m.pills, m.noiseBomb, m.ammo, m.rifleInLot]],
      [W, Hh, hm, cap, len, fh, gap, gate, wave, sup], '6.1 director ' + id);
  }
  // 2: sparks sources and the revive table of 6.6.2
  eq(D.GOALS.reduce((a, g) => a + (g[1].sparks || 0), 0), 35, 'goal sparks total 35');
  const rv = city(); rv.people[0].lv = 5;
  const big = city(); big.buildings[0].lv = 8; for (const [x, y] of [[13, 13], [8, 9], [11, 13]]) addB(big, 'depot', 8, x, y); big.rubble = [];
  for (const [L, cans, sparks] of [[1, [100, 200, 400], [12, 24, 48]], [2, [250, 500, 1000], [16, 32, 64]], [5, [1300, 2600, 5200], [28, 56, 112]], [10, [5050, 10100, 20200], [48, 96, 192]]]) {
    const p = big.people[0]; p.lv = L;
    for (let n = 0; n < 3; n++) { p.revives = n; const pr = E.price.revive(big, p.id); eq([pr.cans, pr.sparks], [cans[n], sparks[n]], 'revive L' + L + ' n=' + n); }
    p.revives = 5; eq(E.price.revive(big, p.id).sparks, sparks[2], 'escalation stops at n = 2');
  }
  eq(E.price.invite(city()), 120, 'inviting the 3rd person costs 120 cans');
});

// ================================================================== 3
test('3 skip prices: the 5.6 table, confirm at 20, the Lab threshold and exponent', () => {
  const table = [[60, 0], [61, 2], [120, 2], [300, 4], [600, 7], [900, 9], [1800, 14], [2700, 19], [3600, 23], [7200, 38], [14400, 63], [21600, 84],
    [28800, 103], [43200, 137], [64800, 184], [86400, 226], [108000, 265], [151200, 338]];
  for (const [sec, sp] of table) eq(E.price.skip(sec), sp, 'price(' + sec + ' s)');
  eq([E.price.skip(400), E.price.skip(370), E.price.skip(38 * 60), E.price.skip(30 * 3600), E.price.skip(46 * 60), E.price.skip(10), E.price.skip(0)], [5, 5, 17, 265, 19, 0, 0], 'worked examples');
  eq(D.TOWER.time.reduce((a, t) => a + E.price.skip(t), 0), 1033, 'skipping the whole ladder costs 1,033 ✦');
  // confirm at 20 or more: the Tower 5 job (45 min, 19 ✦) needs one tap, Tower 6 (6 h, 84 ✦) two
  const s = city({ tower: 4, res: { bricks: 900, sparks: 500 }, goalsDone: true });
  s.buildings.push({ id: 'b9', type: 'depot', lv: 1, gx: 13, gy: 13 }); s.ids.b = 9; s.res.bricks = 2000;
  must(s, { type: 'upgrade', id: 'b1' });
  const j = s.jobs[0]; eq(E.price.skip((j.endMs - s.cityMs) / SEC), 19, 'Tower 5 at 45 min costs 19 ✦');
  must(s, { type: 'finish', jobId: j.id });
  eq([s.res.sparks, s.buildings[0].lv], [500 + 10 - 19, 5], 'one tap under 20 ✦ (and Tower 5 pays its 10 ✦)');
  s.res.bricks = 4600; s.buildings.find((b) => b.id === 'b9').lv = 5;
  must(s, { type: 'upgrade', id: 'b1' });
  const j2 = s.jobs[0], r = act(s, { type: 'finish', jobId: j2.id });
  eq([r.ok, r.err, r.data], [false, 'confirm', { price: 84 }], 'a price of 20 ✦ or more asks for confirmation');
  must(s, { type: 'finish', jobId: j2.id, confirm: true });
  eq(s.buildings[0].lv, 6, 'confirmed finish');
  // the Lab's free threshold, exponent and multiplier
  must(s, { type: 'dev', op: 'set', key: 'freeSec', value: 300 });
  eq([E.price.skip(300, s), E.price.skip(301, s)], [0, 4], 'free threshold 300 s');
  must(s, { type: 'dev', op: 'set', key: 'skipExp', value: 0.9 });
  eq(E.price.skip(3600, s), Math.ceil(1.2 * Math.pow(60, 0.9)), 'exponent 0.9');
  must(s, { type: 'dev', op: 'set', key: 'skipK', value: 3 });
  eq(E.price.skip(3600, s), Math.ceil(3 * Math.pow(60, 0.9)), 'multiplier 3');
  must(s, { type: 'dev', op: 'set', key: 'freeSec', value: 9999 });
  eq(s.lab.freeSec, 300, 'free threshold clamps at 300 s');
});

// ================================================================== 4
function steppingCity() {
  const s = city({ seed: 4, tower: 6, ring: 2, res: { bricks: 900, cans: 500, sparks: 40 } });
  const k3 = s.buildings[1]; k3.lv = 3; k3.bubbleBase = 12.5; k3.bubbleSinceMs = 0;
  s.buildings[2].lv = 2;                                                  // House 1 at L2: 3 beds, so the stranger can come
  const k6 = addB(s, 'kiln', 6, 6, 6, { bubbleBase: 123.4, bubbleSinceMs: 0 });
  addB(s, 'cannery', 4, 6, 9);
  const dp = addB(s, 'depot', 5, 15, 6);
  const inn = addB(s, 'inn', 2, 6, 14);
  addB(s, 'clinic', 2, 13, 13);
  E._internal.refreshInn(s, []); s.inn.nextRefreshMs = 30 * MIN + 7;
  const [a, b] = s.people;
  a.state = 'rest'; a.restKind = 'tired'; a.restFromMs = 0; a.restUntilMs = 2 * H + 7;
  b.state = 'down'; b.downUntilMs = 5 * H + 13;
  job(s, 'upgrade', k3.id, 4, H + 1);
  job(s, 'upgrade', 'b5', 5, 8 * H - 1);                                  // the cannery
  job(s, 'upgrade', dp.id, 6, 12 * H);
  return { s, k6, inn };
}
test('4 event stepping: advance(8 h) once equals 480 x advance(1 min), byte for byte', () => {
  for (const source of ['offline', 'frame']) {
    const A = steppingCity().s, B = clone(A);
    const evA = E.advance(A, 8 * H, { source });
    let evB = []; for (let i = 0; i < 480; i++) evB = evB.concat(E.advance(B, MIN, { source }));
    eq(A.cityMs, 8 * H, 'the clock moved 8 h (' + source + ')');
    ok(E.serialize(A) === E.serialize(B), 'identical serialize() (' + source + ')');
    const kinds = (ev) => ev.filter((e) => e.type !== 'bubbleFull').map((e) => e.type + ':' + (e.jobId || e.personId || e.n || ''));
    eq(kinds(evB), kinds(evA), 'the same events in the same order (' + source + ')');
    eq(evA.filter((e) => e.type === 'bubbleFull').length, evB.filter((e) => e.type === 'bubbleFull').length, 'bubbleFull fires once per fill (' + source + ')');
  }
  const { s } = steppingCity(); const ev = E.advance(s, 8 * H, { source: 'offline' });
  const types = ev.map((e) => e.type);
  for (const t of ['stranger', 'jobDone', 'rested', 'innRefresh', 'downExpired', 'gravePlaced', 'bubbleFull']) ok(types.includes(t), 'event ' + t + ' in flight');
  eq(s.people[1].state, 'fallen', 'the Down window ran out at 5 h');
  eq(ev.filter((e) => e.type === 'innRefresh').length, 12, 'the Inn (L2, 40 min) refreshed 12 times in 8 h');
  eq(s.jobs.length, 1, 'only the 12 h job is still running');
  // the closed form: 430/h and 700/h never drift, and the bubble stops at its hold
  const k6 = s.buildings.find((b) => b.type === 'kiln' && b.lv === 6), b6 = E.bubble(s, k6.id), b4 = E.bubble(s, 'b2');
  eq([b6.amount, b6.full, b6.hold], [123.4 + 700 * 8, false, 7000], 'Kiln L6: 123.4 + 8 h x 700/h, never accumulated');
  eq([b4.amount, b4.full, s.buildings[1].lv, s.buildings[1].bubbleBase, s.buildings[1].bubbleSinceMs], [3060, true, 4, 12.5 + 430 * (H + 1) / H, H + 1], 'Kiln L3 -> L4 at 1 h + 1 ms re-based, then full at its 3,060 hold');
  // a collect takes floor() and leaves the fraction
  const c = city({ goalsDone: true }); const kl = c.buildings[1]; kl.lv = 3; kl.bubbleBase = 0; kl.bubbleSinceMs = 0; c.buildings[0].lv = 3; c.res.bricks = 0;
  E.advance(c, 10 * MIN, { source: 'offline' });
  near(E.bubble(c, kl.id).amount, 430 / 6, 1e-9, '10 min of a 430/h Kiln');
  const r = must(c, { type: 'collect', id: kl.id });
  eq([r.data.n, c.res.bricks], [71, 71], 'collect takes floor(71.67)');
  near(kl.bubbleBase, 430 / 6 - 71, 1e-9, 'the fraction stays in the bubble');
  eq(kl.bubbleSinceMs, c.cityMs, 're-based at the collect');
});

// ================================================================== 5
test('5 offline: 10 h credit, a 25 h gap, the 7-day cap, rollback, welcome rows; the run-warp cap', () => {
  const s = city({ tower: 3, goalsDone: true, res: { cans: 400 } });
  s.buildings[2].lv = 2; addB(s, 'depot', 1, 13, 13); s.res.bricks = 1100;
  must(s, { type: 'upgrade', id: 'b2' }); must(s, { type: 'upgrade', id: 'b1' });   // Kiln L2 (1 min) and Tower 4 (8 min) on two cranes
  const a = s.people[0]; a.state = 'rest'; a.restKind = 'tired'; a.restFromMs = 0; a.restUntilMs = 2 * H;
  const res0 = Object.assign({}, s.res);
  const r = E.resume(s, T0 + 10 * H);
  eq([r.creditedMs, r.rollback], [10 * H, false], '10 h credited');
  const done = r.events.filter((e) => e.type === 'jobDone').map((e) => e.buildingType);
  eq(done, ['kiln', 'tower'], 'jobs finish in order');
  eq([s.buildings[0].lv, s.buildings[1].lv], [4, 2], 'levels rose');
  const bub = E.bubble(s, 'b2'); eq([bub.amount, bub.hold, bub.full], [1440, 1440, true], 'the bubble filled to its hold and no further');
  eq(a.state, 'ready', 'the rest ended');
  eq([s.res.bricks, s.res.cans, s.res.sparks], [res0.bricks, res0.cans, res0.sparks + 8], 'nothing auto-collected (Tower 4 paid its 8 ✦)');
  ok(r.welcome && r.welcome.rows.length >= 4, 'welcome card with rows: ' + JSON.stringify(r.welcome));
  const txt = r.welcome.rows.map((x) => x.text);
  ok(txt.includes('Kiln 2 finished'), 'row: Kiln 2 finished');
  ok(txt.some((t) => /^Bell Tower 4 · new: 2nd Depot, land 12 × 12, 4th crane for sale$/.test(t)), 'row: Bell Tower 4 with what it opens: ' + txt);
  ok(txt.includes('Waiting: 1,440 bricks'), 'row: the waiting bubbles');
  ok(txt.includes(a.first + ' is rested.'), 'row: rested');
  eq(r.welcome.title, 'WHILE YOU WERE AWAY · 10 h', 'title');
  // a 25 h gap turns a Down person into a grave on the default spot (the House's front tile, 6.7)
  const s2 = city({ goalsDone: true }); const b = s2.people[1];
  b.state = 'down'; b.downUntilMs = 24 * H;
  const r2 = E.resume(s2, T0 + 25 * H);
  eq(b.state, 'fallen', 'Fallen after 24 h');
  eq([s2.graves[0].gx, s2.graves[0].gy, s2.graves[0].personId], [9, 15, b.id], 'grave at (9, 15), in front of the blue House');
  eq(r2.welcome.rows[0].text, b.first + '’s day ran out. A grave stands by the blue House.', 'welcome row for the expired deadline');
  ok(b.epitaph && b.epitaph.length === 2, 'epitaph written');
  // a Down person still waiting is the first row, with the time left
  const s3 = city({ goalsDone: true }); const c = s3.people[1]; c.state = 'down'; c.downUntilMs = 24 * H;
  const r3 = E.resume(s3, T0 + 4 * H);
  eq(r3.welcome.rows[0], { kind: 'down', personId: c.id, action: 'decide', text: c.first + ' is Down · 20 h left to decide' }, 'Down row first');
  // the 7-day cap, the 5 s threshold and the backwards clock
  const s4 = city(); eq(E.resume(s4, T0 + 30 * DAY).creditedMs, 7 * DAY, 'credit capped at 7 days');
  const s5 = city(); eq(E.resume(s5, T0 + 5000).creditedMs, 0, 'a gap of 5 s or less credits nothing');
  eq(E.resume(s5, T0 + 11000).creditedMs, 6000, 'a later gap over 5 s is credited from the last real stamp');
  const s6 = city(); s6.realLast = T0 + H; const r6 = E.resume(s6, T0);
  eq([r6.rollback, r6.creditedMs, s6.realLast, s6.cityMs], [true, 0, T0, 0], 'a clock that went backwards credits 0 and resets realLast');
  const s7 = city(); eq(E.resume(s7, T0 + 90 * SEC).welcome, null, 'no welcome card under 2 min');
  // the run-warp cap (5.1): helpers the startRun / resolveRun actions use (the full flow is tested with them, stage 3)
  const W = E._internal, w = city();
  const sim = (warpS) => ({ source: 'sim', warpS });
  eq(W.warpAtGo(w, T0), null, 'the first simulated GO of a save has no cap');
  eq(W.runClockMs(w, sim(null), { time: 300 }), 300 * SEC, 'so it advances the full result.time');
  eq(W.warpAtGo(w, T0 + 10 * SEC), 60, 'a GO 10 s after the previous one: 6 x 10 s');
  eq(W.runClockMs(w, sim(60), { time: 300 }), 60 * SEC, 'advances min(result.time, 60 s)');
  eq(W.warpAtGo(w, T0 + 70 * SEC), 360, 'a GO 60 s after: 360 s');
  eq(W.runClockMs(w, sim(360), { time: 300 }), 300 * SEC, 'advances min(result.time, 360 s)');
  const back = E.load(E.serialize(w), T0 + 200 * SEC).state;
  eq([back.lastSimGoRealMs, W.warpAtGo(back, T0 + 80 * SEC)], [T0 + 70 * SEC, 60], 'a reload between two GOs does not reset the cap');
  must(w, { type: 'dev', op: 'runWarp', value: 0 });
  eq(W.warpAtGo(w, T0 + 90 * SEC), null, 'runWarp 0 removes the cap');
  eq([W.runClockMs(w, { source: 'external', warpS: null }, { time: 300, source: 'game' }), W.runClockMs(w, sim(null), { time: 300, source: 'paste' })], [0, 0], 'results from the game or a Lab paste advance nothing');
  must(w, { type: 'dev', op: 'runsAdvanceClock', value: false });
  eq(W.runClockMs(w, sim(null), { time: 300 }), 0, '"Runs advance the clock" off');
});

// ================================================================== 6
function randomActions(seed, n) {
  const R = N.mulberry32(seed), pick = (a) => a[Math.floor(R() * a.length)], out = [];
  for (let i = 0; i < n; i++) {
    const k = R();
    if (k < 0.18) out.push({ kind: 'tick', ms: Math.floor(R() * 4000) });
    else if (k < 0.25) out.push({ kind: 'resume', ms: Math.floor(R() * 3 * H) });
    else out.push({ kind: 'act', r: R(), r2: R(), r3: R(), t: pick(['collect', 'place', 'upgrade', 'expand', 'clearRubble', 'move', 'finish', 'restNow', 'innNow', 'buyCrane', 'grant', 'tower', 'claimPack', 'moveGrave', 'kill']) });
  }
  return out;
}
function applyRandom(s, x) {
  const at = (r, list) => list[Math.floor(r * list.length)];
  if (x.kind === 'tick') return E.tick(s, x.ms, s.realLast + x.ms);
  if (x.kind === 'resume') return E.resume(s, s.realLast + x.ms);
  const b = at(x.r, s.buildings), types = D.TYPES.filter((t) => t !== 'tower');
  switch (x.t) {
    case 'collect': return E.act(s, { type: 'collect', id: b.id }, s.realLast + 100);
    case 'place': { const t = at(x.r, types), sp = E.suggestSpot(s, t, 6 + x.r2 * 12, 6 + x.r3 * 12); return sp ? E.act(s, { type: 'place', kind: t, gx: sp.gx, gy: sp.gy, finishOther: x.r2 < 0.3 }, s.realLast + 100) : null; }
    case 'upgrade': return E.act(s, { type: 'upgrade', id: b.id, finishOther: x.r2 < 0.3 }, s.realLast + 100);
    case 'expand': return E.act(s, { type: 'expand', finishOther: x.r2 < 0.5 }, s.realLast + 100);
    case 'clearRubble': return s.rubble.length ? E.act(s, { type: 'clearRubble', id: at(x.r, s.rubble).id }, s.realLast + 100) : null;
    case 'move': { const sp = E.suggestSpot(s, b.type, 6 + x.r2 * 12, 6 + x.r3 * 12, b.id); return sp ? E.act(s, { type: 'move', target: { kind: 'building', id: b.id }, gx: sp.gx, gy: sp.gy }, s.realLast + 100) : null; }
    case 'moveGrave': { if (!s.graves.length) return null; const g = at(x.r, s.graves), sp = E.suggestSpot(s, 'grave', 6 + x.r2 * 12, 6 + x.r3 * 12, g.id); return sp ? E.act(s, { type: 'move', target: { kind: 'grave', id: g.id }, gx: sp.gx, gy: sp.gy }, s.realLast + 100) : null; }
    case 'finish': return s.jobs.length ? E.act(s, { type: 'finish', jobId: at(x.r, s.jobs).id, confirm: x.r2 < 0.5 }, s.realLast + 100) : null;
    case 'restNow': return E.act(s, { type: 'restNow', personId: at(x.r, s.people).id, confirm: true }, s.realLast + 100);
    case 'innNow': return E.act(s, { type: 'innNow', confirm: x.r2 < 0.5 }, s.realLast + 100);
    case 'buyCrane': return E.act(s, { type: 'buyCrane' }, s.realLast + 100);
    case 'grant': return E.act(s, { type: 'dev', op: 'grant', what: x.r < 0.5 ? 'bricks' : 'cans' }, s.realLast + 100);
    case 'tower': return x.r < 0.15 ? E.act(s, { type: 'dev', op: 'setTower', lv: 1 + Math.floor(x.r2 * 10) }, s.realLast + 100) : null;
    case 'claimPack': return x.r < 0.2 ? E.act(s, { type: 'claimPack', size: 100 }, s.realLast + 100) : null;
    case 'kill': { const p = at(x.r, s.people); return x.r2 < 0.2 ? E.act(s, { type: 'dev', op: 'kill', personId: p.id }, s.realLast + 100) : null; }
  }
  return null;
}
test('6 determinism: same seed + same 200 actions -> identical serialize(); create(20261104) gives the 4.7 starters', () => {
  for (const seed of [6, 66, 666]) {
    const A = E.create({ realNow: T0, tzOffsetMin: 60, seed }), B = E.create({ realNow: T0, tzOffsetMin: 60, seed });
    const xs = randomActions(seed, 200);
    let okActs = 0;
    for (const x of xs) { const ra = applyRandom(A, x); applyRandom(B, x); if (ra && ra.ok) okActs++; }
    ok(okActs >= 40, 'seed ' + seed + ': enough of the random actions succeeded (' + okActs + ')');
    ok(E.serialize(A) === E.serialize(B), 'seed ' + seed + ': identical serialize()');
  }
  const s = E.create({ realNow: T0, tzOffsetMin: 120, seed: 20261104 });
  const pick = (p) => [p.seed, p.first, p.last, p.age, p.role, p.trade, p.trait, p.habit, p.look, p.lv, p.xp, p.state, p.houseId, p.history];
  eq(pick(s.people[0]), [2763498110, 'Efua', 'Boateng', 37, 'sprinter', 'PE teacher', 'heavy', 19, { skin: '#7a4a33', hairStyle: 'curls', hair: '#7a4b2a', jacket: '#c9503c', acc: 'headband' }, 1, 0, 'ready', 'b3', [[0, 'Night 0. One of the first two.']]], 'Efua Boateng');
  eq(pick(s.people[1]), [244105850, 'Ngozi', 'Balogun', 33, 'brawler', 'rugby coach', 'iron_stomach', 11, { skin: '#7a4a33', hairStyle: 'ponytail', hair: '#1d1a1a', jacket: '#7a5ca8', acc: 'beanie' }, 1, 0, 'ready', 'b3', [[0, 'Night 0. One of the first two.']]], 'Ngozi Balogun');
  eq([s.nextIndex, s.saveSeed], [2, 20261104], 'two indexes used');
});

// ================================================================== 7
test('7 save and load: lossless round trip; sanitize repairs; v 2; garbage', () => {
  const played = E.create({ realNow: T0, tzOffsetMin: 0, seed: 7 });
  for (const x of randomActions(77, 200)) applyRandom(played, x);
  for (const [name, s] of [['fresh', city()], ['demo', E.demo({ realNow: T0, tzOffsetMin: 60 })], ['played', played], ['stepping', (() => { const x = steppingCity().s; E.advance(x, 0); return x; })()]]) {
    const raw = E.serialize(s), r = E.load(raw, T0 + 10 * H);
    eq([r.status, r.notes], ['ok', []], name + ': loads as ok (load settles state-based rules; a settled save is unchanged)');
    ok(E.serialize(r.state) === raw, name + ': round trip byte for byte');
  }
  const o = JSON.parse(E.serialize(played)); const f = city(); const o2 = JSON.parse(E.serialize(f));
  o2.res.bricks = NaN; o2.res.cans = -50; o2.res.sparks = 12.7; o2.unknownKey = 1; o2.buildings[0].junk = 'x'; o2.people[0].junk = 1;
  o2.buildings[1].lv = 7;                                                  // a Kiln above Tower 1
  o2.jobs = [{ id: 'j9', kind: 'upgrade', target: 'b99', toLv: 2, startMs: 0, endMs: 1000 }];
  o2.people[0].houseId = 'b77'; o2.people[1].look.jacket = 'red'; o2.people[1].lv = 99;
  o2.graves = [{ id: 'g1', personId: 'p42', gx: 9, gy: 15, placedMs: 0 }];
  o2.pending = { runId: 'bh-000001', personId: 'p9', destId: 'D1' };
  o2.lab.mul.cost = 99; o2.lab.timeScale = 7; o2.tel.runs = -3; o2.tel.firstDownMs = 'x';
  o2.rubble.push({ id: 'r9', gx: 10, gy: 10, ring: 0, glint: false });   // on the Tower
  o2.buildings.push({ id: 'b4', type: 'cannery', lv: 1, gx: 9, gy: 13, bubbleBase: 5, bubbleSinceMs: 0 });   // on the House
  const notes = [], s2 = E.sanitize(o2, notes);
  eq([s2.res.bricks, s2.res.cans, s2.res.sparks], [0, 0, 13], 'NaN, negatives and fractions fixed');
  ok(!('unknownKey' in s2) && !('junk' in s2.buildings[0]) && !('junk' in s2.people[0]), 'unknown keys dropped');
  eq(s2.buildings[1].lv, 1, 'a level above the Tower is lowered');
  eq(s2.jobs, [], 'a job for a missing building is dropped');
  eq(s2.people[0].houseId, 'b3', 'a dangling house reference is repaired');
  eq([s2.people[1].look.jacket, s2.people[1].lv], [N.JACKETS[0], 10], 'bad colour and level fixed');
  eq([s2.graves, s2.pending], [[], null], 'a grave for nobody and a run for nobody are dropped');
  eq([s2.lab.mul.cost, s2.lab.timeScale, s2.tel.runs, s2.tel.firstDownMs], [4, 1, 0, null], 'Lab and telemetry clamped');
  eq(s2.rubble.length, 6, 'rubble on the Tower dropped');
  const can = s2.buildings.find((b) => b.id === 'b4');
  ok(can && E.canPlace(s2, 'cannery', can.gx, can.gy, can.id).ok && !(can.gx === 9 && can.gy === 13), 'an overlapping building moves to a free spot: ' + JSON.stringify(can));
  ok(notes.length >= 8, 'notes say what was fixed: ' + notes.length);
  ok(E.serialize(E.sanitize(JSON.parse(E.serialize(s2)), [])) === E.serialize(s2), 'a sanitized state is stable');
  // a Fallen person's grave is never lost; a person with a grave is Fallen
  const f2 = JSON.parse(E.serialize(city())); f2.people[1].state = 'fallen';
  const s3 = E.sanitize(f2, []); eq([s3.graves.length, s3.graves[0].personId, s3.graves[0].gx], [1, 'p1', null], 'a missing grave is restored (waiting for a place)');
  E.advance(s3, 0); ok(s3.graves[0].gx != null, 'and then placed on its default spot');
  // versions and garbage
  const fut = E.load(JSON.stringify({ v: 2, res: { bricks: 5 } }), T0);
  eq([fut.status, fut.state.res.bricks, fut.bad], ['future-version', 200, undefined], 'v 2 loads as future-version, in memory, never overwritten');
  const bad = E.load('{not json', T0);
  eq([bad.status, bad.bad, bad.state.people.length], ['corrupt-reset', '{not json', 2], 'garbage -> corrupt-reset with the .bad copy');
  eq(E.load('[1,2]', T0).status, 'corrupt-reset', 'a non-object -> corrupt-reset');
  eq(E.load(null, T0).status, 'new', 'no save -> new');
  const old = JSON.parse(E.serialize(city())); delete old.v;
  const mg = E.load(JSON.stringify(old), T0); eq([mg.status, mg.state.v], ['migrated', 1], 'a save without v migrates');
  ok(o.v === 1, 'played save is v1');
});

// ================================================================== 8
test('8 run model: 6.3.4 fixtures, margin curve, 6.9 JSON byte for byte, city rolls, nothing used after the gate', () => {
  const rows = [
    ['A', 'D1', 17, '', 0, null, 0, 81.5, 100, 0.0, [5, 15, 80], [17, 88, 22]],
    ['B', 'D2', 22, 'mp', 1, null, 0, 91.8, 43, 4.7, [0, 18, 82], [24, 106, 27]],
    ['C', 'D2', 21, 'mp', 1, null, 0, 90.8, 43, 5.3, [0, 16, 84], [25, 106, 27]],
    ['D', 'D3', 27, 'mpb', 1, null, 0, 92.3, 38, 4.8, [0, 23, 77], [23, 133, 34]],
    ["D'", 'D3', 27, 'mp', 1, null, 0, 86.3, 38, 8.5, [0, 13, 87], null],
    ["D''", 'D3', 27, '', 1, null, 0, 65.0, 38, 21.7, [10, 30, 60], null],
    ["D'''", 'D3', 27, 'mpb', 1, 60, 0, 85.5, 38, 9.0, [9, 19, 72], null],
    ['E', 'D3', 38, 'mpb', 2, null, 0, 99.0, 41, 0.6, [0, 0, 100], [13, 133, 34]],
    ['F', 'D4', 40, 'mpb', 3, null, 0, 94.3, 39, 3.5, [4, 13, 83], [20, 162, 41]],
    ["F'", 'D4', 45, 'mpb', 3, null, 0, 97.5, 39, 1.5, null, null],
    ['G', 'D5', 53, 'mpb', 4, null, 0, 96.5, 37, 2.2, null, [21, 200, 52]],
    ['H', 'D6', 70, 'mpb', 6, null, 0, 97.5, 38, 1.6, null, [16, 268, 70]],
    ['I', 'D3', 23, 'mp', 1, null, -0.15, 78.0, 23, 16.9, null, null],
    ['J', 'D3', 21, 'mp', 1, null, 0.15, 74.3, 53, 12.1, null, null]];
  for (const [n, di, P, kit, cl, startHp, add, home, resc, death, falls, refs] of rows) {
    const L = { P, maxHp: 100, startHp: startHp || undefined, sw: cl >= 5 ? 2 : 1, heal: 0.8, pillsTemp: 50, medkit: kit.includes('m') ? 1 : 0, pills: kit.includes('p') ? 1 : 0, bomb: kit.includes('b') ? 1 : 0, weapon: 'smg', shoveMul: 1 };
    const r = Run.mc(DEST[di], L), d = D.DESTS.find((x) => x.id === di);
    const rescue = d.rescue >= 1 ? 1 : Math.max(0, Math.min(0.95, d.rescue + D.LAB_DEFAULT.clinicRescue * cl + add));
    near(100 * r.home, home, 0.1, n + ' Home %');
    eq(Math.round(100 * rescue), resc, n + ' rescue');
    near(100 * (1 - r.home) * (1 - rescue), death, 0.1, n + ' Death %');
    const tot = r.falls.streets + r.falls.hordes + r.falls.gate;
    if (falls) eq([r.falls.streets, r.falls.hordes, r.falls.gate].map((x) => Math.round(100 * x / tot)), falls, n + ' falls streets / hordes / gate');
    if (refs) eq([r.refs.dmgP10, r.refs.killsP90, r.refs.shovesP90], refs, n + ' refs');
    eq(Run.homeOdds(DEST[di], L), r.home, n + ' the lean twin gives the same odds');
  }
  const curve = [[-10, [31, 51, 59, 64]], [-5, [44, 62, 68, 78]], [0, [58, 78, 80, 88]], [5, [69, 87, 90, 94]], [10, [83, 93, 96, 98]], [15, [92, 98, 98, 99]]];
  for (const [m, want] of curve) {
    const base = { P: 24 + m, maxHp: 100, sw: 1, heal: 0.8, pillsTemp: 50, weapon: 'smg' };
    const got = [{}, { medkit: 1 }, { medkit: 1, pills: 1 }, { medkit: 1, pills: 1, bomb: 1 }].map((k) => Math.round(100 * Run.mc(DEST.D3, Object.assign({}, base, k)).home));
    eq(got, want, 'margin curve at m ' + m);
  }
  // 6.9: the simulated result for the handoff example, and the loss for seed 1003, byte for byte
  const spec = `{ "v": 1, "kind": "bellhaven.result", "runId": "bh-000034", "seed": 2318841977, "source": "sim",
    "result": "safe_room", "fellAt": null, "progress": 1, "time": 330, "kills": 114, "accuracy": 42, "shoves": 32,
    "damageTaken": 108, "endHp": 1, "hordes": 3, "secondWindUsed": 1,
    "used": { "medkit": 0, "pills": 1, "noiseBomb": 1 },
    "events": [[49, "streets", 3], [127, "horde", 30], [163, "streets", 3], [192, "noiseBomb"], [192, "horde", 4],
               [223, "streets", 5], [288, "secondWind"], [288, "pills", 50], [288, "gate", 73], [330, "safe_room"]] }`;
  const Le = { P: 36, maxHp: 100, startHp: 100, sw: 1, heal: 0.8, pillsTemp: 50, medkit: 1, pills: 1, bomb: 1, weapon: 'smg', shoveMul: 1, accAdd: 0 };
  const win = Run.simulate(DEST.D3, Le, 2318841977);
  ok(JSON.stringify(Run.toResult(win, { runId: 'bh-000034', seed: 2318841977, source: 'sim', pillsTemp: 50 })) === JSON.stringify(JSON.parse(spec)), '6.9 result JSON byte for byte: ' + JSON.stringify(Run.toResult(win, { runId: 'bh-000034', seed: 2318841977, source: 'sim', pillsTemp: 50 })));
  eq([win.endHp, win.used.medkit], [1, 0], 'endHp 1 and the medkit unused (nothing is used after the gate)');
  const lossJson = '{"result":"overrun","fellAt":"gate","progress":0.9,"time":280,"kills":91,"accuracy":30,"shoves":27,"damageTaken":168,"endHp":0,"hordes":2,"secondWindUsed":1,"used":{"medkit":1,"pills":1,"noiseBomb":0},"events":[[55,"streets",12],[75,"streets",10],[75,"pills",50],[135,"horde",44],[181,"streets",16],[181,"medkit",59],[193,"horde",69],[252,"secondWind"],[252,"overrun","gate"],[280,"overrun_end"]]}';
  const L3 = { P: 27, maxHp: 100, startHp: 64, sw: 1, heal: 0.8, pillsTemp: 50, medkit: 1, pills: 1, bomb: 0, weapon: 'smg' };
  const loss = Run.toResult(Run.simulate(DEST.D3, L3, 1003), { pillsTemp: 50 });
  const lossOut = {}; for (const k of Object.keys(JSON.parse(lossJson))) lossOut[k] = loss[k];
  ok(JSON.stringify(lossOut) === lossJson, 'the loss for seed 1003 byte for byte: ' + JSON.stringify(lossOut));
  const rw = Run.cityRolls(2318841977), rl = Run.cityRolls(1003);
  eq([rw.luck, rw.spare, rw.stretcher].map((x) => x.toFixed(4)), ['1.0011', '0.0436', '0.9237'], 'city rolls luck / spare / stretcher');
  eq([rl.luck.toFixed(4), rl.stretcher.toFixed(4), rl.stretcher >= 0.38], ['0.9474', '0.4401', true], 'the loss rolls Down at rescue 0.38');
  eq([Math.round(200 * rw.luck) + Math.round(0.25 * 114), Math.round(80 * rw.luck)], [229, 80], '6.9 loot: +229 bricks, +80 cans');
  eq([Math.round(200 * rl.luck * 0.3 * 0.9) + Math.round(0.25 * 91), Math.round(80 * rl.luck * 0.3 * 0.9)], [74, 20], '6.9 loss loot: 74 bricks, 20 cans');
  // nothing is used after the gate, and the lean twin agrees with the full model, over random runs
  const R = N.mulberry32(8);
  let after = 0, mismatch = 0;
  for (let i = 0; i < 10000; i++) {
    const d = DEST[D.DEST_IDS[Math.floor(R() * 6)]], maxHp = [100, 105, 110, 115, 120][Math.floor(R() * 5)];
    const L = { P: Math.floor(R() * 90), maxHp, startHp: Math.round(maxHp * (0.6 + 0.02 * Math.floor(R() * 21))), sw: 1 + Math.floor(R() * 2), heal: 0.8 + 0.02 * Math.floor(R() * 11),
      pillsTemp: R() < 0.5 ? 50 : 70, medkit: R() < 0.6 ? 1 : 0, pills: R() < 0.6 ? 1 : 0, bomb: R() < 0.5 ? 1 : 0, weapon: 'rifle', shoveMul: 1, accAdd: 0 };
    const seed = Math.floor(R() * 4294967296) >>> 0, x = Run.simulate(d, L, seed);
    const gi = x.log.findIndex((e) => e[1] === 'gate');
    if (gi >= 0 && x.log.slice(gi + 1).some((e) => e[1] === 'pills' || e[1] === 'medkit')) after++;
    const ev = Run.events(x, L.pillsTemp), g2 = ev.findIndex((e) => e[1] === 'gate');
    if (g2 >= 0 && ev.slice(g2 + 1).some((e) => e[1] === 'pills' || e[1] === 'medkit')) after++;
    if (!!x.win !== !!Run.winOnly(d, L, seed)) mismatch++;
  }
  eq(after, 0, 'no pills or medkit event follows the gate in 10,000 random runs');
  eq(mismatch, 0, 'lean twin = full model in 10,000 random runs');
});

todo('9 the run responds to the character and the city', 'people-and-runs stage: odds(), the responsiveness fixtures of 6.3.4');
todo('10 death rules', 'people-and-runs stage: rescue, the third present person, forced wins, Lab force options');

// ================================================================== 11
test('11 generator: 4.7 fixtures, unique names, trait shares, no pronouns, epitaph run lines', () => {
  const a = N.person(20261104, 0, { role: 'sprinter' }), b = N.person(20261104, 1, { role: 'brawler', taken: ['Efua'], takenHabits: [19] }), c = N.person(20261104, 2, { taken: ['Efua', 'Ngozi'], takenHabits: [19, 11] });
  eq(a, { seed: 2763498110, index: 0, first: 'Efua', last: 'Boateng', name: 'Efua Boateng', age: 37, role: 'sprinter', trade: 'PE teacher', trait: 'heavy', habit: 19, look: { skin: '#7a4a33', hairStyle: 'curls', hair: '#7a4b2a', jacket: '#c9503c', acc: 'headband' }, lv: 1 }, '4.7 Efua');
  eq(b, { seed: 244105850, index: 1, first: 'Ngozi', last: 'Balogun', name: 'Ngozi Balogun', age: 33, role: 'brawler', trade: 'rugby coach', trait: 'iron_stomach', habit: 11, look: { skin: '#7a4a33', hairStyle: 'ponytail', hair: '#1d1a1a', jacket: '#7a5ca8', acc: 'beanie' }, lv: 1 }, '4.7 Ngozi');
  eq(c, { seed: 229460489, index: 2, first: 'Burak', last: 'Şahin', name: 'Burak Şahin', age: 34, role: 'brawler', trade: 'firefighter', trait: 'night_owl', habit: 20, look: { skin: '#c68e6a', hairStyle: 'ponytail', hair: '#c8954e', jacket: '#7a5ca8', acc: 'cap' }, lv: 1 }, '4.7 Burak');
  eq([N.hash(20261104, 0), N.mulberry32(1)()], [2763498110, 0.6270739405881613], 'hash and mulberry32 references');
  eq([N.cardLine(a), N.cardLine(b), N.cardLine(c)], ['Used to be a PE teacher. Cannot stand silence.', 'Used to be a rugby coach. Talks to the radio.', 'Used to be a firefighter. Keeps a seed packet for later.'], '4.7 card lines');
  eq([N.usedToBe('archery coach'), N.usedToBe('DJ')], ['Used to be an archery coach.', 'Used to be a DJ.'], 'articles');
  // the handoff values of 4.7 at Tower 1, Armory 0, rested
  const s = E.create({ realNow: T0, tzOffsetMin: 0, seed: 20261104 });
  const de = E.derived(s, 'p0', 'D1'), dn = E.derived(s, 'p1', 'D1');
  eq([de.maxHp, de.speed, dn.shoveCdMul, dn.pillsTemp], [110, 187, 0.97, 70], '4.7 handoff values for Efua and Ngozi');
  must(s, { type: 'dev', op: 'addPerson' });
  const bu = s.people[2], dbu = E.derived(s, bu.id, 'D3');
  eq([bu.first, dbu.shoveCdMul, dbu.flashlightR, dbu.power - E.derived(s, bu.id, 'D4').power], ['Burak', 0.97, 560, 2], 'Burak: +2 power at the Night Market');
  // 120 people from one save with no repeated first name (the engine's own path)
  const big = E.create({ realNow: T0, tzOffsetMin: 0, seed: 7 });
  for (let i = 0; i < 118; i++) must(big, { type: 'dev', op: 'addPerson' });
  eq(new Set(big.people.map((p) => p.first)).size, 120, '120 people, 120 first names');
  // trait shares within ±15 % of 10 % over 10,000 people
  const cnt = {}; for (let i = 0; i < 10000; i++) { const p = N.person(99, i); cnt[p.trait] = (cnt[p.trait] || 0) + 1; }
  for (const t of D.TRAIT_IDS) ok(cnt[t] >= 850 && cnt[t] <= 1150, 'trait ' + t + ' share ' + cnt[t] / 100 + ' %');
  // epitaph run lines
  const ep = E._internal.epitaph, p = clone(s.people[0]);
  p.arrivedNight = 3; p.runs = 0; eq(ep(s, p), ['Came to the gate on Night 3.', 'Could not stand silence.'], 'epitaph, 0 runs');
  p.runs = 1; eq(ep(s, p)[0], 'Ran one night for Bellhaven.', 'epitaph, 1 run');
  p.runs = 12; eq(ep(s, p)[0], 'Ran 12 nights for Bellhaven.', 'epitaph, 12 runs');
  p.bestKills = 214; eq(ep(s, p)[0], 'Once cleared 214 in one night.', 'epitaph, a best night of 120+');
  p.nick = 'ghost'; eq(ep(s, p)[0], 'Everyone called Efua “Ghost”.', 'epitaph, a nickname first');
  // every generated string: cards, history, epitaphs, offers, goals, welcome rows, towers, the Lab's explainers
  const strs = [], T = D.TEXT;
  for (let i = 0; i < 400; i++) {
    const q = N.person(4242, i), first = q.first, D0 = D.DESTS[i % 6].name, nk = D.NICKNAMES[D.NICK_IDS[i % 7]].name;
    strs.push(N.cardLine(q), N.habitLine(q.habit), N.habitPast(q.habit), N.usedToBe(q.trade));
    for (const k of Object.keys(T.arrived)) strs.push(T.arrived[k].replace('{n}', 1234));
    const fill = (t) => t.replace(/\{n\}/g, '1234').replace(/\{D\}/g, D0).replace(/\{F\}/g, first).replace(/\{Nick\}/g, nk).replace(/\{N\}/g, q.name).replace(/\{L\}/g, 10).replace(/\{m\}/g, '12:34').replace(/\{k\}/g, '1,234');
    for (const k of ['win', 'winSecondWind', 'hurt', 'down', 'revivedCans', 'revivedSparks', 'nickname', 'level', 'lost']) { const line = fill(T[k]); strs.push(line); ok(line.length <= 60 || i > 0, 'history line under 60: ' + line); }
    const pp = Object.assign({}, q, { nick: i % 3 ? null : D.NICK_IDS[i % 7], bestKills: i % 5 === 0 ? 150 : 0, runs: i % 4, arrivedNight: 7 });
    strs.push(...ep(s, pp));
  }
  for (const k of D.TRAIT_IDS) strs.push(D.TRAITS[k].name, D.TRAITS[k].line, D.TRAITS[k].effect);
  for (const k of D.NICK_IDS) strs.push(D.NICKNAMES[k].name, D.NICKNAMES[k].perk);
  strs.push(...T.explainers, T.deathOn, T.finale, ...D.GOALS.map((g) => g[2]));
  for (let L = 1; L <= 10; L++) strs.push(...E.towerOpens(L).map((o) => o.text));
  const v = E.view(E.demo({ realNow: T0, tzOffsetMin: 0 }));
  for (const pv of v.people.concat(v.remembered, v.inn.travelers)) strs.push(pv.card, pv.pill, pv.traitLine, pv.fullName, ...(pv.history || []).map((h) => h[1]), ...(pv.epitaph || []));
  for (const pv of v.people) { const dv = E.derived(E.demo({ realNow: T0 }), pv.id, 'D3'); strs.push(dv.roleLine, dv.ttlLine); }
  const st = steppingCity().s, rr = E.resume(st, T0 + 6 * H); strs.push(...rr.welcome.rows.map((x) => x.text), rr.welcome.title);
  const gs = city({ tower: 3 }); for (let g = 0; g <= D.GOALS.length; g++) { gs.goal = g; const go = E.goal(gs); strs.push(go.text, go.eta, go.side ? go.side.text : ''); }
  const fc = city(); must(fc, { type: 'upgrade', id: 'b1' }); const nc = act(fc, { type: 'place', kind: 'cannery', gx: 13, gy: 13 }); strs.push(nc.data.label);
  const bad = strs.filter((x) => PRONOUN.test(x));
  eq(bad.slice(0, 5), [], 'no pronoun in ' + strs.length + ' generated strings');
});

// ================================================================== 12
test('12 placement: the land, the gate, overlaps, moving, graves, counts and the gating rule', () => {
  const s = city({ goalsDone: true });
  eq(E.canPlace(s, 'kiln', 7, 10), { ok: false, reason: 'outside' }, 'outside the land (ring 0 is [8, 16))');
  eq(E.canPlace(s, 'kiln', 15, 9), { ok: false, reason: 'outside' }, 'half outside');
  eq(E.canPlace(s, 'kiln', 14, 11), { ok: false, reason: 'gate' }, 'over a gate tile (15, 11)');
  eq(E.canPlace(s, 'grave', 15, 12), { ok: false, reason: 'gate' }, 'gate tile (15, 12)');
  eq(E.canPlace(s, 'grave', 14, 12), { ok: true, reason: null }, 'next to the gate is fine');
  eq(E.canPlace(s, 'kiln', 11, 12), { ok: false, reason: 'occupied' }, 'on the Bell Tower');
  eq(E.canPlace(s, 'kiln', 8, 11), { ok: false, reason: 'occupied' }, 'on rubble');
  s.graves.push({ id: 'g1', personId: 'p1', gx: 12, gy: 14, placedMs: 0, houseId: null }); s.ids.g = 1;
  s.decor.push({ id: 'd1', type: 'tree', gx: 14, gy: 14 }); s.ids.d = 1;
  eq(E.canPlace(s, 'kiln', 11, 13), { ok: false, reason: 'occupied' }, 'on a grave');
  eq(E.canPlace(s, 'kiln', 13, 13), { ok: false, reason: 'occupied' }, 'on a decoration');
  eq(E.canPlace(s, 'kiln', 13.5, 12), { ok: false, reason: 'bad' }, 'whole tiles only');
  const r = act(s, { type: 'place', kind: 'cannery', gx: 8, gy: 11 });
  eq([r.ok, r.err, r.data], [false, 'blocked', { reason: 'occupied' }], 'place on rubble -> blocked');
  eq(s.res.bricks, 200, 'nothing spent on a refused placement');
  // moving is free, instant and keeps a running job
  const s2 = city({ goalsDone: true });
  const pl = must(s2, { type: 'place', kind: 'cannery', gx: 13, gy: 13 }); const id = pl.data.buildingId, jid = pl.data.jobId;
  const res0 = clone(s2.res), job0 = clone(s2.jobs[0]);
  must(s2, { type: 'move', target: { kind: 'building', id }, gx: 13, gy: 11 });
  eq([s2.res, s2.jobs[0], s2.buildings.find((b) => b.id === id).gx, s2.buildings.find((b) => b.id === id).gy], [res0, job0, 13, 11], 'moved for free with its job');
  E.advance(s2, 10 * SEC);
  eq([s2.buildings.find((b) => b.id === id).lv, s2.jobs.length], [1, 0], 'the job finished at the new place');
  ok(!act(s2, { type: 'finish', jobId: jid }).ok, 'the finished job is gone');
  eq(act(s2, { type: 'move', target: { kind: 'building', id: 'b1' }, gx: 7, gy: 7 }).err, 'blocked', 'the Tower cannot leave the land');
  must(s2, { type: 'move', target: { kind: 'building', id: 'b1' }, gx: 10, gy: 9 });
  eq([s2.buildings[0].gx, s2.buildings[0].gy], [10, 9], 'the Tower moves (overlapping its old self is fine)');
  eq(act(s2, { type: 'move', target: { kind: 'rubble', id: 'r1' }, gx: 9, gy: 9 }).err, 'notFound', 'rubble cannot move');
  // graves move but are never removed
  const s3 = city({ goalsDone: true });
  const ev = []; const g = E._internal.fall(s3, s3.people[1], 'goodbye', ev);
  eq([g.gx, g.gy], [9, 15], 'grave on the default spot');
  must(s3, { type: 'move', target: { kind: 'grave', id: g.id }, gx: 12, gy: 14 });
  eq([s3.graves[0].gx, s3.graves[0].gy], [12, 14], 'grave moved');
  eq(act(s3, { type: 'clearRubble', id: g.id }).err, 'notFound', 'a grave is not rubble');
  must(s3, { type: 'dev', op: 'clearRubble' }); eq([s3.rubble.length, s3.graves.length], [0, 1], 'clearing all rubble keeps the grave');
  eq(act(s3, { type: 'move', target: { kind: 'grave', id: g.id }, gx: 12, gy: 12 }).err, 'blocked', 'a grave cannot go on the Tower');
  // counts per Tower level and the gating rule
  const s4 = city({ goalsDone: true, res: { bricks: 900, cans: 500 } });
  eq([act(s4, { type: 'place', kind: 'kiln', gx: 13, gy: 13 }).err, act(s4, { type: 'place', kind: 'kiln', gx: 13, gy: 13 }).data], ['locked', { needTower: 3 }], 'a 2nd Kiln needs Tower 3');
  eq(act(s4, { type: 'place', kind: 'depot', gx: 13, gy: 13 }).data, { needTower: 2 }, 'a Depot needs Tower 2');
  eq(act(s4, { type: 'place', kind: 'inn', gx: 13, gy: 13 }).data, { needTower: 3 }, 'the Inn needs Tower 3');
  eq(act(s4, { type: 'place', kind: 'tower', gx: 13, gy: 13 }).err, 'notFound', 'nobody builds a second Tower');
  eq([act(s4, { type: 'upgrade', id: 'b2' }).err, act(s4, { type: 'upgrade', id: 'b2' }).data], ['locked', { needTower: 2 }], 'Kiln L2 needs Tower 2 (the gating rule)');
  eq(act(s4, { type: 'upgrade', id: 'b3' }).data, { needTower: 2 }, 'House L2 needs Tower 2');
  must(s4, { type: 'place', kind: 'cannery', gx: 13, gy: 13 });
  eq(act(s4, { type: 'upgrade', id: 'b4', finishOther: true }).err, 'busy', 'a building under construction is busy');
  const s5 = city({ goalsDone: true, tower: 10, ring: 4, noRubble: true, res: { bricks: 50000, cans: 20000 } });
  for (const [x, y] of [[4, 4], [4, 7]]) addB(s5, 'kiln', 1, x, y);
  eq(act(s5, { type: 'place', kind: 'kiln', gx: 4, gy: 10 }).err, 'max', 'a 4th Kiln: max');
  s5.buildings[2].lv = 2; eq(act(s5, { type: 'upgrade', id: 'b3' }).err, 'max', 'House L3 does not exist: max');
  eq(act(s5, { type: 'upgrade', id: 'b1' }).err, 'max', 'Tower 11: max');
  eq(act(s5, { type: 'expand' }).err, 'max', 'no 5th ring');
  const s6 = city({ goalsDone: true, res: { bricks: 900 } });
  eq(act(s6, { type: 'expand' }).data, { needTower: 2 }, 'the first expansion needs Tower 2');
  s6.buildings[0].lv = 2; must(s6, { type: 'expand' });
  ok(s6.res.bricks === 750 && s6.jobs[0].kind === 'expand' && s6.jobs[0].endMs - s6.jobs[0].startMs === 60 * SEC, 'expansion: 150 bricks, 1 min');
  s6.buildings[0].lv = 3; eq(act(s6, { type: 'expand' }).err, 'busy', 'one expansion at a time');
  const ev2 = E.advance(s6, 60 * SEC).filter((e) => e.type === 'expanded')[0];
  const ring1 = s6.rubble.filter((x) => x.ring === 1);
  eq([s6.ring, ring1.length, ring1.filter((x) => x.glint).length, ev2.side], [1, 5, 1, 10], 'ring 1: 5 rubble, one glinting');
  ok(ring1.every((x) => (x.gx === 7 || x.gx === 16 || x.gy === 7 || x.gy === 16) && !(x.gx === 16 && (x.gy === 11 || x.gy === 12))), 'new rubble on the ring, never on the gate');
  eq(E.canPlace(s6, 'grave', 16, 11).reason, 'gate', 'the gate moved out with the fence');
  eq(E.canPlace(s6, 'grave', 15, 11).ok, true, 'the old gate tile is land now');
  const gl = ring1.find((x) => x.glint), sp0 = s6.res.sparks, br0 = s6.res.bricks;
  must(s6, { type: 'clearRubble', id: gl.id });
  eq([s6.res.sparks - sp0, br0 - s6.res.bricks], [3, 50], 'clearing the glinting piece: 50 bricks, +3 ✦');
  s6.res.bricks = 10; eq(act(s6, { type: 'clearRubble', id: ring1.find((x) => !x.glint).id }).data, { res: 'bricks', need: 40 }, 'clearing needs the bricks');
  // suggestSpot: the valid origin nearest the point; the onboarding Cannery ghost
  const s7 = city(); eq(E.suggestSpot(s7, 'cannery', 14, 14), { gx: 13, gy: 13 }, 'the first spot (13, 13)');
  const sp = E.suggestSpot(s7, 'kiln', 12, 12); ok(sp && E.canPlace(s7, 'kiln', sp.gx, sp.gy).ok, 'a suggested spot is valid');
  // graveSpot: in front of the House, else the quiet corner
  const s8 = city(); s8.people[1].houseId = null; eq(E.graveSpot(s8, 'p1'), { gx: 9, gy: 8 }, 'no House: the quiet corner (8, 8) is rubble, so the next tile by gy then gx');
  eq(E.graveSpot(s8, 'p0'), { gx: 9, gy: 15 }, 'in front of the House');
});

// ================================================================== 13
test('13 cranes: one job each, noCrane, finishOther, the 4th crane', () => {
  const s = city({ goalsDone: true, res: { bricks: 900, cans: 500 } });
  must(s, { type: 'upgrade', id: 'b1' });
  const r = act(s, { type: 'place', kind: 'cannery', gx: 13, gy: 13 });
  eq([r.ok, r.err, r.data], [false, 'noCrane', { jobId: 'j1', price: 0, label: 'Finish the Bell Tower now · free' }], 'one crane at Tower 1: noCrane with the finish offer');
  eq([s.res.bricks, s.buildings.length], [750, 3], 'nothing spent or placed');
  const r2 = must(s, { type: 'place', kind: 'cannery', gx: 13, gy: 13, finishOther: true });
  eq([s.buildings[0].lv, s.jobs.length, s.jobs[0].target, s.res.bricks, s.flags.paidSkip], [2, 1, r2.data.buildingId, 670, false], 'finishOther: the Tower finished free, the Cannery started');
  // the job with the least time left is offered; a paid finishOther (Kiln L3, 5 min: 4 ✦)
  const t = city({ goalsDone: true, tower: 3, res: { bricks: 1000, cans: 500, sparks: 10 } });
  must(t, { type: 'upgrade', id: 'b3' }); must(t, { type: 'upgrade', id: 'b2' });           // House L2 (10 min), Kiln L2 (1 min)
  eq(t.jobs.length, 2, 'two cranes at Tower 3, two jobs');
  const nc = act(t, { type: 'place', kind: 'cannery', gx: 13, gy: 13 });
  eq([nc.err, nc.data.jobId, nc.data.price, nc.data.label], ['noCrane', t.jobs[1].id, 0, 'Finish the Kiln now · free'], 'the Kiln (1 min left) is offered');
  E.advance(t, 61 * SEC);
  must(t, { type: 'upgrade', id: 'b2' });                                                    // Kiln L3: 600 bricks, 5 min
  const nc2 = act(t, { type: 'place', kind: 'cannery', gx: 13, gy: 13 });
  eq([nc2.err, nc2.data.price, nc2.data.label], ['noCrane', 4, 'Finish the Kiln now · 4 ✦'], 'Kiln L3 (5 min) offered at 4 ✦');
  must(t, { type: 'place', kind: 'cannery', gx: 13, gy: 13, finishOther: true });
  eq([t.res.sparks, t.buildings[1].lv, t.flags.paidSkip, t.jobs.map((j) => j.target).sort()], [6, 3, true, ['b3', 'b4']], 'paid 4 ✦, the Kiln finished, the Cannery started, paidSkip set');
  eq(t.tel.sparksOut, { finish: 4 }, 'the sink is finish');
  const u = city({ goalsDone: true, tower: 3, res: { bricks: 500, sparks: 3 } });
  job(u, 'upgrade', 'b2', 2, 5 * MIN); job(u, 'upgrade', 'b3', 2, 10 * MIN);
  const pk = act(u, { type: 'place', kind: 'cannery', gx: 13, gy: 13, finishOther: true });
  eq([pk.err, pk.data, u.jobs.length, u.res], ['cost', { res: 'sparks', need: 1 }, 2, { bricks: 500, cans: 150, sparks: 3 }], 'finishOther needs the sparks; nothing changes');
  // cranes per Tower level and the 4th crane
  const c = city({ goalsDone: true });
  for (const [lv, n] of [[1, 1], [2, 1], [3, 2], [5, 2], [6, 3], [10, 3]]) { c.buildings[0].lv = lv; eq(E.cranes(c).total, n, 'cranes at Tower ' + lv); }
  c.buildings[0].lv = 3; c.res.sparks = 500;
  eq([act(c, { type: 'buyCrane' }).err, act(c, { type: 'buyCrane' }).data], ['locked', { needTower: 4 }], 'the 4th crane needs Tower 4');
  c.buildings[0].lv = 4; c.res.sparks = 199;
  eq(act(c, { type: 'buyCrane' }).data, { res: 'sparks', need: 1 }, 'it costs 200 ✦');
  c.res.sparks = 200; must(c, { type: 'buyCrane' });
  eq([c.res.sparks, E.cranes(c).total, c.crane4, c.flags.paidSkip, c.tel.sparksOut.crane], [0, 3, true, false, 200], 'bought: 3 cranes at Tower 4, paidSkip untouched');
  eq(act(c, { type: 'buyCrane' }).err, 'max', 'only one 4th crane');
  c.buildings[0].lv = 6; eq(E.cranes(c).total, 4, '4 cranes at Tower 6');
});

todo('14 death -> revive -> grave', 'people-and-runs stage: the offer, prices, REVIVE / REVIVE NOW / SAY GOODBYE, the stranger flow');
todo('15 no soft-lock', 'people-and-runs stage: everyone Down, 50 seeds x 3,000 random legal actions, goal() never empty');
todo('16 kit', 'people-and-runs stage: auto-pack, held at GO, returned before loot, never cut by the cap');
todo('17 validation', 'people-and-runs stage: every row of the 6.9 table, idempotent apply, reload replay');
todo('18 nicknames', 'people-and-runs stage: relative triggers from refs, perks in the handoff');

// ================================================================== 19
test('19 sparks never buy resources: the sinks, paidSkip', () => {
  // the sinks: a session that spends sparks every way the engine allows
  const s = city({ tower: 4, res: { bricks: 1000, cans: 600, sparks: 2000 } });
  s.buildings[2].lv = 2;
  must(s, { type: 'place', kind: 'depot', gx: 13, gy: 13 }); E.advance(s, 20 * SEC);
  must(s, { type: 'place', kind: 'inn', gx: 13, gy: 11 }); E.advance(s, 60 * SEC);
  s.res.bricks = 2000; must(s, { type: 'upgrade', id: 'b1' });
  const before = clone(s.res), lv0 = E._internal.living(s).length;
  const jb = s.jobs.find((j) => j.target === 'b1');
  must(s, { type: 'finish', jobId: jb.id });
  // every action, one by one: spending sparks never raises bricks, cans, people or land
  const ALL = ['collect', 'place', 'upgrade', 'expand', 'clearRubble', 'move', 'finish', 'restNow', 'innNow', 'buyCrane', 'claimPack', 'flag', 'setLastDest', 'invite', 'startRun', 'resolveRun', 'revive', 'goodbye'];
  const R = N.mulberry32(19); let spends = 0;
  for (let i = 0; i < 400; i++) {
    const c = steppingCity().s; c.goal = D.GOALS.length; E.advance(c, Math.floor(R() * 4 * H));
    c.res.sparks = 1000; const pr = c.people.find((x) => x.state === 'ready');
    if (pr && R() < 0.5) { pr.state = 'rest'; pr.restKind = 'hurt'; pr.restFromMs = c.cityMs; pr.restUntilMs = c.cityMs + Math.floor(R() * 2 * H); }
    const t = ALL[Math.floor(R() * ALL.length)], b = c.buildings[Math.floor(R() * c.buildings.length)], j = c.jobs[0];
    const a = { type: t, id: b.id, kind: 'cannery', gx: 13, gy: 15, jobId: j ? j.id : null, personId: (pr || c.people[0]).id, confirm: true, finishOther: true, size: 100, name: 'metPeople', destId: 'D2', travelerId: c.inn.travelers[0] && c.inn.travelers[0].id, target: { kind: 'building', id: b.id } };
    const r0 = clone(c.res), L0 = E._internal.living(c).length, ring0 = c.ring, out = E.act(c, a, c.realLast);
    if (c.res.sparks < r0.sparks) {
      spends++;
      ok(c.res.bricks <= r0.bricks && c.res.cans <= r0.cans && E._internal.living(c).length <= L0 && c.ring === ring0 + (out.events.some((e) => e.type === 'expanded') ? 1 : 0), t + ' spent sparks and gave resources: ' + JSON.stringify([r0, c.res]));
      ok(['finish', 'restNow', 'innNow', 'buyCrane', 'revive', 'place', 'upgrade', 'expand'].includes(t), t + ' is not a sink');
      for (const k of Object.keys(c.tel.sparksOut)) ok(['finish', 'restNow', 'innNow', 'revive', 'crane'].includes(k), 'sink ' + k);
    }
  }
  ok(spends > 30, 'enough spending actions tried: ' + spends);
  // paidSkip: a paid FINISH, REST NOW or NEW TRAVELERS NOW sets it; a free one and the 4th crane do not
  const f = city({ goalsDone: true, res: { bricks: 900, sparks: 100 } });
  must(f, { type: 'upgrade', id: 'b1' }); must(f, { type: 'finish', jobId: f.jobs[0].id }); eq(f.flags.paidSkip, false, 'a free finish');
  eq(act(f, { type: 'buyCrane' }).err, 'locked', 'the 4th crane needs Tower 4'); eq(f.flags.paidSkip, false, 'not by a refused crane');
  f.buildings[0].lv = 4; f.res.sparks = 300; must(f, { type: 'buyCrane' }); eq([f.flags.paidSkip, f.res.sparks], [false, 100], 'not by the 4th crane');
  const q = f.people[0]; q.state = 'rest'; q.restKind = 'tired'; q.restFromMs = f.cityMs; q.restUntilMs = f.cityMs + 50 * SEC;
  must(f, { type: 'restNow', personId: q.id }); eq(f.flags.paidSkip, false, 'a free REST NOW');
  f.res.sparks = 100; q.state = 'rest'; q.restUntilMs = f.cityMs + 10 * MIN; must(f, { type: 'restNow', personId: q.id });
  eq([f.flags.paidSkip, f.res.sparks], [true, 93], 'a paid REST NOW (7 ✦)');
  const i2 = steppingCity().s; i2.goal = 30; must(i2, { type: 'innNow', confirm: true }); eq(i2.flags.paidSkip, true, 'a paid NEW TRAVELERS NOW');
  const j3 = city({ goalsDone: true, tower: 3, res: { bricks: 900, sparks: 50 } }); must(j3, { type: 'upgrade', id: 'b1' }); must(j3, { type: 'finish', jobId: j3.jobs[0].id });
  eq([j3.flags.paidSkip, j3.res.sparks], [true, 50 - 6 + 8], 'a paid FINISH (Tower 4: 6 ✦)');
  // the goal chain's step 14 completes on it
  const g = city({ tower: 3, res: { bricks: 900, sparks: 50 } }); g.goal = 13; must(g, { type: 'upgrade', id: 'b1' });
  eq(E.goal(g).eta, 'ready now', 'step 14 is ready while a timer over 60 s runs');
  must(g, { type: 'finish', jobId: g.jobs[0].id }); eq(g.goal >= 14, true, 'step 14 completed by a paid finish');
  // revive with sparks: added by the people-and-runs stage (must not set paidSkip)
  const rv = act(city(), { type: 'revive', personId: 'p1', pay: 'sparks' });
  if (rv.data && rv.data.todo) todo('19b a sparks revive does not set paidSkip', 'people-and-runs stage');
});

todo('20 handoff', 'people-and-runs stage: every 6.8 field for 3 fixture states');

// ================================================================== 21
test('21 engine source hygiene: no DOM, clock, storage or unseeded randomness; loads as classic scripts', () => {
  const FILES = ['data.js', 'names.js', 'run.js', 'engine.js'];
  const BAD = [/\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /Date\.now/, /\bperformance\b/, /Math\.random/];
  for (const f of FILES) {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const re of BAD) ok(!re.test(src), f + ' must not contain ' + re);
    ok(!/\bimport\s|\bexport\s/.test(src), f + ' is a classic script (no ES modules)');
  }
  // the browser path: four classic scripts in one global, in index.html's order, with no require()
  const ctx = vm.createContext({ console });
  ctx.self = ctx;
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), ctx, { filename: f });
  ok(ctx.BH && ctx.BH.DATA && ctx.BH.Names && ctx.BH.Run && ctx.BH.Engine, 'BH.DATA, BH.Names, BH.Run and BH.Engine exist');
  const s = ctx.BH.Engine.create({ realNow: T0, tzOffsetMin: 0, seed: 20261104 });
  eq([s.people[0].first, ctx.BH.Engine.view(s).goal.text], ['Efua', 'Build a Cannery'], 'the browser copy works');
  ok(ctx.BH.Engine.serialize(s) === E.serialize(E.create({ realNow: T0, tzOffsetMin: 0, seed: 20261104 })), 'the same state in node and in the browser');
});

// ================================================================== X: more of this stage's rules (goals, arrivals, view, Lab, clock)
test('X1 goals: the 7.2 chain, state-based steps, C1 (harder wins count), C2 (needs a bigger Depot), ETAs', () => {
  eq(D.GOALS.length, 30, '30 steps');
  eq(D.GOALS.map((g) => g[1]), [{ cans: 30 }, { bricks: 50 }, {}, { cans: 40 }, { cans: 40 }, { bricks: 80 }, { bricks: 60 }, {}, { cans: 40 }, { bricks: 60 }, { cans: 60 }, { cans: 60 },
    { bricks: 150 }, { sparks: 5 }, { cans: 100 }, { cans: 60 }, {}, { bricks: 150 }, { sparks: 5 }, {}, { sparks: 5 }, { sparks: 5 }, {}, { sparks: 5 }, {}, { sparks: 5 }, {}, {}, { sparks: 5 }, {}], 'rewards');
  // the onboarding: Cannery, then the Allotments
  const s = city({ res: { bricks: 300 } });
  eq([E.goal(s).text, E.goal(s).eta, E.goal(s).target], ['Build a Cannery', 'ready now', { kind: 'build', type: 'cannery' }], 'step 1');
  must(s, { type: 'place', kind: 'cannery', gx: 13, gy: 13 });
  eq([E.goal(s).eta, E.goal(s).target.kind], ['in 0:10', 'building'], 'step 1 while the crane works');
  const ev = E.advance(s, 10 * SEC).filter((e) => e.type === 'goal');
  eq([ev.length, ev[0].step, ev[0].reward, s.res.cans, s.goal], [1, 1, { cans: 30 }, 180, 1], 'step 1 pays 30 cans at once');
  eq([E.goal(s).text, E.goal(s).eta, E.goal(s).target], ['Make it home from the Allotments', '1 run', { kind: 'dest', destId: 'D1' }], 'step 2');
  // C1: a win at a harder place completes the run steps (state-based: one already satisfied pays when reached)
  s.dest.D2.cleared = true; E.advance(s, 0);
  eq([s.goal, s.res.bricks], [2, 220 + 50], 'step 2 completes on the Car Wash win and pays 50 bricks');
  s.buildings[0].lv = 2; s.res.cans = 600; E.advance(s, 0);
  eq(s.goal, 3, 'step 3 (Tower 2) completes when reached');
  for (const [x, y, t] of [[13, 11, 'armory'], [11, 13, 'clinic']]) addB(s, t, 1, x, y);
  E.advance(s, 0);
  eq([s.goal, E.goal(s).text], [6, 'Build a Depot'], 'steps 4-6 complete in order (the Car Wash already won)');
  // C2: the next Tower above the cap: "needs a bigger Depot", the target is the Depot
  const c2 = city({ tower: 4, res: { bricks: 900 } }); c2.goal = 19;
  eq([E.goal(c2).text, E.goal(c2).eta, E.goal(c2).target], ['Bell Tower to 5', 'needs a bigger Depot', { kind: 'build', type: 'depot' }], 'Tower 5 (1,900) above a 1,000 cap');
  ok(E.goal(c2).side && /^Meanwhile: /.test(E.goal(c2).side.text), 'a side task while the ETA is long: ' + JSON.stringify(E.goal(c2).side));
  const dep = addB(c2, 'depot', 1, 13, 13), kb = c2.buildings[1];
  const bubble = (n) => { kb.bubbleBase = n; kb.bubbleSinceMs = c2.cityMs; };
  bubble(0); eq([E.goal(c2).eta, E.goal(c2).side], ['in 3:20:00', { text: 'Meanwhile: upgrade a Kiln', target: { kind: 'building', id: 'b2' } }], '1,000 short at 300/h (5 runs at the Night Market); the cheapest affordable upgrade on the side');
  dep.lv = 2; c2.res.bricks = 1500; bubble(500);
  eq([E.goal(c2).eta, E.goal(c2).target], ['ready now', { kind: 'collect', id: 'b2' }], 'the Kiln bubble covers the rest: collect first');
  bubble(0); eq([E.goal(c2).eta, E.goal(c2).side], ['≈ 2 runs', null], '400 short: 1 h 20 of production or 2 Night Market wins');
  c2.res.bricks = 1880; eq(E.goal(c2).eta, 'in 4:00', '20 bricks at 300/h');
  c2.res.bricks = 0; eq([E.goal(c2).eta, E.goal(c2).side], ['in 6:20:00', { text: 'Meanwhile: a run at the Night Market · ~200 bricks', target: { kind: 'dest', destId: 'D3' } }], 'from nothing: 6 h 20 at 300/h (10 runs); nothing affordable: a run');
  c2.res.bricks = 1900; eq([E.goal(c2).eta, E.goal(c2).target], ['ready now', { kind: 'building', id: 'b1' }], 'affordable with a free crane');
  job(c2, 'upgrade', 'b2', 2, c2.cityMs + 50 * SEC); job(c2, 'upgrade', 'b3', 2, c2.cityMs + 90 * SEC);
  eq(E.goal(c2).eta, 'in 0:50', 'affordable, every crane busy: when the first one frees');
  // needs Tower N, state-based completion
  const c3 = city({ tower: 3, res: { cans: 300 } }); c3.goal = 15;
  eq([E.goal(c3).text, E.goal(c3).eta, E.goal(c3).target], ['Upgrade a House to level 2', 'ready now', { kind: 'building', id: 'b3' }], 'step 16 at Tower 3');
  c3.res.cans = 150; eq(E.goal(c3).eta, '≈ 2 runs', '150 cans short, no Cannery: 2 Night Market wins');
  const c4 = city({ tower: 3 }); c4.goal = 17; addB(c4, 'clinic', 3, 13, 13);
  E.advance(c4, 0); eq(c4.goal, 18, 'Clinic to 2, already above, completes on the next settle');
  c4.goal = 23; eq([E.goal(c4).text, E.goal(c4).eta], ['Clinic to 4', 'needs Tower 4'], 'Clinic to 4 at Tower 3');
  const c5 = city({ tower: 7 }); c5.goal = 25; eq(E.goal(c5).eta, '1 run', 'Hospital Hill is open at Tower 7');
  c5.buildings[0].lv = 6; eq([E.goal(c5).eta, E.goal(c5).target], ['needs Tower 7', { kind: 'dest', destId: 'D5' }], 'locked destination');
  const c6 = city({ tower: 2 }); c6.goal = 5; eq([E.goal(c6).eta, E.goal(c6).target], ['needs the Clinic', { kind: 'build', type: 'clinic' }], 'the Car Wash needs the Clinic');
  const c7 = city({ tower: 3 }); c7.goal = 14; eq([E.goal(c7).text, E.goal(c7).eta, E.goal(c7).target], ['Build a second Kiln', 'ready now', { kind: 'build', type: 'kiln' }], 'a 2nd Kiln at Tower 3');
  c7.buildings[0].lv = 2; eq(E.goal(c7).eta, 'needs Tower 3', 'a 2nd Kiln at Tower 2');
  // people steps
  const c8 = city({ tower: 3 }); c8.goal = 11;
  eq([E.goal(c8).text, E.goal(c8).eta], ['Have 4 people', 'needs the Inn'], 'no Inn yet');
  addB(c8, 'inn', 1, 13, 13); E._internal.refreshInn(c8, []);
  eq(E.goal(c8).eta, 'needs a free bed', 'two beds, two people');
  addB(c8, 'house', 1, 11, 13); c8.flags.strangerDone = true;
  eq(E.goal(c8).eta, 'ready now', 'a free bed, travelers waiting, 150 cans for a 120-can invite');
  // step 14 when nothing is running
  const c9 = city(); c9.goal = 13; eq(E.goal(c9).eta, 'start a job longer than a minute', 'step 14 with no timer');
  // after step 30
  const cz = city({ tower: 10 }); cz.goal = 30; const gz = E.goal(cz);
  eq([gz.text, gz.done, gz.step], ['Bellhaven is whole.', true, 31], 'the chain is done');
  ok(gz.eta && gz.side, 'side tasks after the chain');
  // never empty, at every step and in odd states
  for (const st of [city(), city({ tower: 10, ring: 4 }), steppingCity().s, E.demo({ realNow: T0 })]) for (let k = 0; k <= 30; k++) { st.goal = k; const go = E.goal(st); ok(go.text && go.eta, 'goal text and ETA at step ' + k + ': ' + JSON.stringify(go)); }
});

test('X2 arrivals the clock drives: the stranger, the drifter, the death unlock, the Inn', () => {
  const s = city({ goalsDone: true, tower: 2, res: { bricks: 900, cans: 400 } });
  must(s, { type: 'upgrade', id: 'b3' }); E.advance(s, 10 * MIN);
  eq([E.beds(s), s.people.length], [3, 2], 'a free bed, but no stranger at Tower 2');
  must(s, { type: 'upgrade', id: 'b1' }); const ev = E.advance(s, 60 * SEC);
  const st = s.people[2];
  ok(ev.some((e) => e.type === 'stranger'), 'the stranger arrives with Tower 3 and a free bed');
  eq([st.state, st.lv, st.xp, st.arrivedHow, st.houseId, st.downUntilMs - s.cityMs, st.history[0][1], s.flags.strangerDone],
    ['down', 2, 60, 'stranger', null, 24 * H, 'Night 0. Found Down at the gate.', true], 'Down at the gate, L2, 24 h, no House yet');
  eq(E.price.revive(s, st.id), { cans: 50, sparks: 5, n: 0, stranger: true }, 'the special prices 50 cans / 5 ✦');
  eq(E.view(s).people.find((p) => p.id === st.id).where, 'gate', 'lies at the gate');
  eq(s.flags.deathOn, false, 'the Down stranger does not unlock death');
  must(s, { type: 'dev', op: 'kill', personId: 'p0' }); must(s, { type: 'dev', op: 'kill', personId: 'p1' });
  const dr = s.people[3];
  ok(dr && dr.arrivedHow === 'drifter' && dr.state === 'ready' && dr.lv === 1, 'nobody present: a drifter walks in at once');
  eq(dr.houseId, null, 'every bed is held: the drifter sleeps on the plaza bench');
  eq(E.view(s).people.find((p) => p.id === dr.id).where, 'walk', 'and walks around');
  must(s, { type: 'dev', op: 'reviveAll' });
  ok(s.flags.deathOn, 'three present people unlock death (4 now)');
  // the Inn: travelers on its first level, every refresh replaces them, L3 brings one L2
  const c = city({ goalsDone: true, tower: 3, res: { cans: 500, sparks: 100 } }); c.flags.strangerDone = true;
  must(c, { type: 'place', kind: 'inn', gx: 13, gy: 13 }); const e1 = E.advance(c, 60 * SEC);
  const t1 = c.inn.travelers.map((p) => p.id);
  eq([t1.length, c.inn.nextRefreshMs - c.cityMs, e1.filter((e) => e.type === 'innRefresh').length], [2, H, 1], 'two travelers, next batch in 1 h');
  E.advance(c, H); ok(c.inn.travelers.every((p) => !t1.includes(p.id)), 'the refresh replaced every traveler');
  const names = new Set(c.people.map((p) => p.first).concat(c.inn.travelers.map((p) => p.first)));
  eq(names.size, c.people.length + c.inn.travelers.length, 'traveler first names are unique');
  c.buildings.find((b) => b.type === 'inn').lv = 3; c.buildings[0].lv = 3; must(c, { type: 'innNow' , confirm: true });
  eq(c.inn.travelers.map((p) => p.lv), [2, 1, 1], 'Inn 3: three travelers, one at level 2');
  // kin (4.11, P1): about 20 % of travelers and drifters take a buried family name
  const k = city({ goalsDone: true, tower: 3 }); k.flags.strangerDone = true; addB(k, 'inn', 1, 13, 13);
  const gone = k.people[1]; E._internal.fall(k, gone, 'goodbye', []);
  let kin = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    E._internal.refreshInn(k, []);
    for (const t of k.inn.travelers) { n++; if (t.kin) { kin++; ok(t.kin === gone.id && t.last === gone.last, 'kin carries the buried family name'); } }
  }
  ok(kin / n > 0.15 && kin / n < 0.25, 'kin share ' + (100 * kin / n).toFixed(1) + ' % of ' + n);
  for (let i = 0; i < 50 && !k.inn.travelers.some((t) => t.kin); i++) E._internal.refreshInn(k, []);
  const kv = E.view(k).inn.travelers.find((t) => t.kin) || {};
  eq(kv.kinLine, 'Says ' + gone.first + ' ' + gone.last + ' was family.', 'the card line');
  ok(!PRONOUN.test(kv.kinLine || ''), 'no pronoun');
  eq(N.person(20261104, 2, { taken: ['Efua', 'Ngozi'], takenHabits: [19, 11], buried: ['Boateng'] }).first, 'Burak', 'kin never shifts the stream');
});

test('X3 view and #demo: everything the renderer and the HUD read', () => {
  const v = E.view(city());
  eq([v.land.ring, v.land.side, v.land.lo, v.land.hi, v.land.gate, v.land.quietCorner], [0, 8, 8, 16, { x: 16, gy: [11, 12], tiles: [[15, 11], [15, 12]] }, { gx: 8, gy: 8 }], 'land and gate');
  eq([v.walkable.length, v.walkable[11 * 24 + 15], v.walkable[10 * 24 + 10], v.walkable[0]], [576, '1', '0', '0'], 'walkable grid: the gate tile walks, the Tower does not');
  eq(v.plaza.length, 16 - 4, 'the free tiles around the Tower are plaza (the Kiln and the House cover 4)');
  const k = v.buildings.find((b) => b.type === 'kiln');
  eq([k.w, k.d, k.label, k.bubble.res, k.bubble.whole, k.bubble.show, k.bubble.full, k.next.err, k.next.needTower], [2, 2, 'KILN · LV 1', 'bricks', 100, true, false, 'locked', 2], 'a Kiln with its bubble and its upgrade state');
  const h = v.buildings.find((b) => b.type === 'house');
  eq([h.house.color, h.house.beds, h.house.residents, h.house.lit], ['blue', 2, ['p0', 'p1'], false], 'House 1');
  eq([v.cranes.total, v.cranes.free, v.cranes.list.length, v.cranes.list[0].busy], [1, 1, 1, false], 'one parked crane');
  eq([v.chips.tower, v.chips.bricks.n, v.chips.cans.cap, v.chips.sparks, v.chips.cranes, v.chips.people], [1, 200, 600, 15, { free: 1, total: 1 }, { living: 2, beds: 2, down: false }], 'chips');
  eq(v.tray.filter((c) => !c.decor).map((c) => [c.type, c.built, c.allowed, c.locked, c.err]), [['tower', 1, 1, null, 'max'], ['kiln', 1, 1, 3, 'locked'], ['cannery', 0, 1, null, null], ['depot', 0, 0, 2, 'locked'],
    ['house', 1, 1, 3, 'locked'], ['clinic', 0, 0, 2, 'locked'], ['armory', 0, 0, 2, 'locked'], ['inn', 0, 0, 3, 'locked']], 'the tray');
  eq(v.dests.map((d) => [d.id, d.open, d.lock]), [['D1', true, null], ['D2', false, 'Tower 2'], ['D3', false, 'Tower 3'], ['D4', false, 'Tower 5'], ['D5', false, 'Tower 7'], ['D6', false, 'Tower 9']], 'destinations');
  eq([v.play.personId, v.play.destId, v.people.find((p) => p.suggested).id], ['p0', 'D1', 'p0'], 'PLAY suggests the favoured Sprinter at the Allotments (placeholder until odds)');
  const v0 = E.view(E.create({ realNow: T0, tzOffsetMin: 0, seed: 20261104 }));
  eq(v0.people.map((p) => [p.fullName, p.where, p.pill, p.card, p.house, p.roleName, p.traitName]), [['Efua Boateng', 'walk', 'Rested', 'Used to be a PE teacher. Cannot stand silence.', 'blue', 'Sprinter', 'Heavy'],
    ['Ngozi Balogun', 'walk', 'Rested', 'Used to be a rugby coach. Talks to the radio.', 'blue', 'Brawler', 'Iron stomach']], 'people');
  // the demo: a Tower-4 city like the mock
  const d = E.demo({ realNow: T0, tzOffsetMin: 60 }), dv = E.view(d);
  eq([d.demo, dv.tower.lv, dv.land.side, dv.res, dv.chips.cranes, dv.goal.text, dv.goal.eta], [true, 4, 12, { bricks: 1240, cans: 380, sparks: 48 }, { free: 1, total: 2 }, 'Clinic to 2', 'ready now'], 'the demo city');
  const busy = dv.cranes.list.find((c) => c.busy), kj = dv.jobs[0];
  eq([E.fmt.clock(kj.leftMs / 1000), kj.name, kj.toLv, busy.site], ['4:12', 'Kiln', 3, { gx: 6, gy: 12, w: 2, d: 2 }], 'a crane over the Kiln with 4:12 left');
  eq([dv.buildings.length, dv.rubble.filter((r) => r.glint).length, dv.graves.length, dv.decor.length, dv.inn.travelers.length], [10, 1, 1, 4, 2], 'buildings, glinting rubble, a grave, trees, travelers');
  ok(dv.buildings.find((b) => b.type === 'cannery').bubble.full, 'a full Cannery bubble');
  eq(dv.buildings.find((b) => b.type === 'house' && b.house.idx === 0).house.resting, 2, '"z 2" on the blue House');
  eq(dv.graves[0].candle && !dv.graves[0].grassed && dv.graves[0].flowers === 0, true, 'a new grave: candle lit, soil, no flowers yet');
  for (const b of d.buildings) ok(E.canPlace(d, b.type, b.gx, b.gy, b.id).ok, 'demo ' + b.type + ' placed validly');
  ok(E.load(E.serialize(d), T0).state.demo === true, 'the demo flag survives (the UI never saves it)');
  // speed: view() is cheap enough for every frame
  const t = Date.now(); for (let i = 0; i < 500; i++) E.view(d); const ms = (Date.now() - t) / 500;
  ok(ms < 2, 'view() ' + ms.toFixed(3) + ' ms');
  // info(): the building sheet rows
  const info = E.info(d, d.buildings.find((b) => b.type === 'armory').id);
  eq([info.title, info.rows[0]], ['ARMORY · LV 2', { label: 'Start weapon', from: 'SMG', to: 'Shotgun', run: true }], 'Armory sheet');
});

test('X4 the Lab: every dev op that changes state', () => {
  const s = city({ goalsDone: true });
  must(s, { type: 'dev', op: 'timeScale', value: 600 }); eq(s.lab.timeScale, 600, 'time scale');
  eq(act(s, { type: 'dev', op: 'timeScale', value: 7 }).err, 'notFound', 'only 0, 1, 10, 60, 600');
  const r = must(s, { type: 'dev', op: 'skipAhead', ms: H });
  eq([s.cityMs, r.data.welcome.title], [H, 'WHILE YOU WERE AWAY · 1 h'], '+1 h through the offline path');
  must(s, { type: 'dev', op: 'grant', what: 'bricks' }); eq(s.res.bricks, 1000, '+1,000 bricks, cut at the cap');
  must(s, { type: 'dev', op: 'grant', what: 'sparks' }); eq([s.res.sparks, s.tel.devSparks, s.tel.sparksIn], [115, 100, {}], '+100 ✦, tagged dev');
  must(s, { type: 'dev', op: 'fillBubbles' }); eq(E.bubble(s, 'b2').full, true, 'fill every bubble');
  must(s, { type: 'dev', op: 'setTower', lv: 5 }); eq([s.buildings[0].lv, E.cranes(s).total], [5, 2], 'set the Tower');
  s.buildings[1].lv = 5; must(s, { type: 'dev', op: 'setTower', lv: 2 }); eq(s.buildings[1].lv, 2, 'lowering the Tower lowers the rest');
  s.res.cans = 300; must(s, { type: 'upgrade', id: 'b3' }); const p = s.people[0]; p.state = 'rest'; p.restKind = 'tired'; p.restFromMs = s.cityMs; p.restUntilMs = s.cityMs + H;
  must(s, { type: 'dev', op: 'finishAll' }); eq([s.jobs.length, s.buildings[2].lv, p.state, s.flags.paidSkip], [0, 2, 'ready', false], 'finish every timer (free, not a paid skip)');
  must(s, { type: 'dev', op: 'clearRubble' }); eq(s.rubble.length, 0, 'clear all rubble');
  for (const [op, value, key] of [['force', 'down', 'force'], ['runScreenS', 20, 'runScreenS'], ['lockSeed', 1234, 'lockSeed'], ['waitReal', true, 'waitReal'], ['runWarp', 12, 'runWarp'], ['runsAdvanceClock', false, 'runsAdvanceClock']]) {
    must(s, { type: 'dev', op, value }); eq(s.lab[key], value, op);
  }
  must(s, { type: 'dev', op: 'forcedWins', value: 0 }); eq(s.forcedWins, 0, 'forced first wins');
  const b0 = E.bubble(s, 'b2').amount; must(s, { type: 'dev', op: 'mul', key: 'prod', value: 2 });
  eq([s.lab.mul.prod, E.bubble(s, 'b2').amount, s.buildings[1].bubbleSinceMs], [2, b0, s.cityMs], 'production x 2 re-bases the bubble first');
  E.advance(s, 30 * MIN); near(E.bubble(s, 'b2').amount, Math.min(b0 + 360, 2 * 360 * 4), 1e-9, 'then fills at the new rate');
  must(s, { type: 'dev', op: 'mul', key: 'time', value: 0.5 }); eq(E.jobMs(s, 'kiln', 4), 600 * SEC, 'times x 0.5');
  must(s, { type: 'dev', op: 'rescueBase', destId: 'D3', value: 0.5 }); eq(s.lab.rescueBase[2], 0.5, 'stretcher base per destination');
  eq(act(s, { type: 'dev', op: 'rescueBase', destId: 'D1', value: 0.5 }).err, 'notFound', 'the Allotments stay at 100 %');
  for (const [key, value, want] of [['clinicRescue', 0.2, 0.1], ['tiredFloor', 0.5, 0.5], ['escalationCap', 3, 3], ['downWindowMs', 60000, 60000], ['skipK', 2, 2], ['reducedMotion', true, true]]) {
    must(s, { type: 'dev', op: 'set', key, value }); eq(s.lab[key], want, key);
  }
  must(s, { type: 'dev', op: 'resetLab' }); eq([s.lab.mul.prod, s.lab.clinicRescue, s.lab.timeScale], [1, 0.03, 600], 'reset the tuning (the time scale stays)');
  const n0 = s.people.length; must(s, { type: 'dev', op: 'addPerson', seed: 99, lv: 3 });
  const q = s.people[n0]; eq([q.lv, q.xp, q.arrivedHow, q.houseId, q.seed], [3, 180, 'lab', 'b3', N.hash(99, 0)], 'generate one from a seed: the free third bed');
  must(s, { type: 'dev', op: 'addPerson' }); eq([s.people.length, s.people[n0 + 1].houseId], [n0 + 2, null], 'ignores beds: a fourth sleeps on the plaza bench');
  must(s, { type: 'dev', op: 'kill', personId: q.id }); eq([q.state, q.downUntilMs - s.cityMs], ['down', 86400000], 'kill: Down for the deadline');
  must(s, { type: 'dev', op: 'reviveAll' }); eq(q.state, 'ready', 'revive all');
  must(s, { type: 'dev', op: 'setLevel', personId: q.id, lv: 6 }); eq([q.lv, q.xp], [6, 1100], 'set level');
  const gx = must(s, { type: 'dev', op: 'giveXp', personId: q.id, xp: 2400 });
  eq([q.lv, gx.events.filter((e) => e.type === 'levelUp').map((e) => e.lv), q.history.map((h) => h[1]).slice(-2)], [8, [7, 8], ['Night 0. Arrived from the Lab.', 'Night 0. Level 7.']], 'give XP: level-ups and the level-7 line');
  must(s, { type: 'dev', op: 'replayOnboarding' }); eq(s.flags.metPeople, false, 'replay the onboarding');
  s.lab.mul.loot = 2; must(s, { type: 'dev', op: 'reroll', seed: 20261104 });
  eq([s.saveSeed, s.people[0].first, s.cityMs, s.lab.mul.loot], [20261104, 'Efua', 0, 2], 'reroll: a new save seed, the Lab kept');
  must(s, { type: 'dev', op: 'reset', seed: 5 }); eq([s.saveSeed, s.lab.mul.loot], [5, 1], 'reset: everything new');
  eq(act(s, { type: 'dev', op: 'nope' }).err, 'notFound', 'unknown op');
  must(s, { type: 'claimPack', size: 500 }); eq([s.res.sparks, s.tel.packs, s.tel.sparksIn], [515, 1, {}], 'a free test pack, dev-tagged');
  eq(act(s, { type: 'claimPack', size: 999 }).err, 'notFound', 'only the three free packs');
});

test('X5 the clock: frames, the 1 s clamp, the Lab scale, frozen while a simulated run is pending', () => {
  const s = city({ goalsDone: true });
  E.tick(s, 16, T0 + 16); eq(s.cityMs, 16, 'a frame moves the clock by the real delta');
  E.tick(s, 3000, T0 + 3016); eq(s.cityMs, 1016, 'clamped to 1 s per frame');
  must(s, { type: 'dev', op: 'timeScale', value: 60 }, T0 + 3016);
  E.tick(s, 100, T0 + 3116); eq(s.cityMs, 1016 + 6000, 'x 60');
  must(s, { type: 'dev', op: 'timeScale', value: 0 }, T0 + 3116); E.tick(s, 100, T0 + 3216); eq(s.cityMs, 7016, 'paused');
  must(s, { type: 'dev', op: 'timeScale', value: 1 }, T0 + 3216);
  s.pending = { runId: 'bh-000001', source: 'sim', personId: 'p0', destId: 'D1' };
  E.tick(s, 100, T0 + 3316); eq(s.cityMs, 7016, 'frozen while a simulated run is pending');
  s.pending.source = 'external'; E.tick(s, 100, T0 + 3416); eq(s.cityMs, 7116, 'a real-game run lets the clock run');
  s.pending = null;
  const ev = E.tick(s, 16, T0 + 3416 + 3 * H);
  eq([ev[0].type, ev[0].ms, s.cityMs, !!ev[0].welcome], ['offline', 3 * H, 7116 + 3 * H, true], 'a frame after a long gap credits it through resume()');
  eq(E.tick(s, 16, T0).length, 0, 'a frame from the past credits nothing'); eq(s.realLast, T0, 'and resets the stamp');
  // act() sets realLast first
  E.act(s, { type: 'flag', name: 'metPeople' }, T0 + 99); eq([s.realLast, s.flags.metPeople], [T0 + 99, true], 'act stamps realLast');
  eq(E.act(s, { type: 'flag', name: 'deathOn' }).err, 'notFound', 'engine flags are not UI flags');
  // speed: a week offline in one call
  const w = steppingCity().s, t = Date.now(); E.resume(w, T0 + 7 * DAY); const ms = Date.now() - t;
  ok(ms < 500, '7 days offline in ' + ms + ' ms');
});

test('X6 invariants under random play and random save damage (a regression net)', () => {
  const inv = (s, tag) => {
    for (const k of ['bricks', 'cans', 'sparks']) ok(Number.isInteger(s.res[k]) && s.res[k] >= 0, tag + ': ' + k + ' ' + s.res[k]);
    const T = s.buildings.find((b) => b.type === 'tower').lv, lo = 8 - s.ring, hi = 16 + s.ring, occ = {};
    const put = (x, y, id) => { const k = x + ',' + y; ok(!occ[k] && x >= lo && y >= lo && x < hi && y < hi && !(x === 15 + s.ring && (y === 11 || y === 12)), tag + ': ' + id + ' at ' + k); occ[k] = id; };
    for (const b of s.buildings) { const w = D.BUILDINGS[b.type].w; for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) put(b.gx + i, b.gy + j, b.id); ok(b.type === 'tower' || b.lv <= T, tag + ': gating ' + b.id); }
    for (const o of s.rubble.concat(s.decor, s.graves.filter((g) => g.gx != null))) put(o.gx, o.gy, o.id);
    for (const j of s.jobs) ok(j.kind === 'expand' || (s.buildings.find((b) => b.id === j.target) || {}).lv + 1 === j.toLv, tag + ': job ' + j.id);
    const fallen = s.people.filter((p) => p.state === 'fallen');
    ok(s.graves.length === fallen.length && fallen.every((p) => s.graves.some((g) => g.personId === p.id) && !p.houseId), tag + ': one grave per Fallen person');
    for (const h of s.buildings.filter((b) => b.type === 'house')) ok(s.people.filter((p) => p.state !== 'fallen' && p.houseId === h.id).length <= (h.lv ? D.BUILDINGS.house.beds[h.lv] : 0), tag + ': beds');
    ok(s.people.some((p) => p.state === 'ready' || p.state === 'rest' || p.state === 'out'), tag + ': someone is present');
    const names = s.people.map((p) => p.first).concat(s.inn.travelers.map((p) => p.first)); ok(new Set(names).size === names.length, tag + ': unique first names');
    const g = E.goal(s); ok(g.text && g.eta, tag + ': goal text');
  };
  const ACTS = ['collect', 'place', 'upgrade', 'expand', 'clearRubble', 'move', 'finish', 'restNow', 'innNow', 'buyCrane', 'grant', 'tower', 'kill', 'tick', 'resume', 'addPerson', 'decor'];
  for (let seed = 1; seed <= 8; seed++) {
    const R = N.mulberry32(seed * 31), pick = (a) => a[Math.floor(R() * a.length)], s = E.create({ realNow: T0, tzOffsetMin: 0, seed });
    for (let i = 0; i < 600; i++) {
      const t = pick(ACTS), b = pick(s.buildings), now = s.realLast + Math.floor(R() * 3000), sp = (ty, id) => E.suggestSpot(s, ty, 4 + R() * 16, 4 + R() * 16, id);
      if (t === 'collect') E.act(s, { type: 'collect', id: b.id }, now);
      else if (t === 'place') { const ty = pick(D.TYPES), x = sp(ty); if (x) E.act(s, { type: 'place', kind: ty, gx: x.gx, gy: x.gy, finishOther: R() < 0.3 }, now); }
      else if (t === 'decor') { const x = sp('decor'); if (x) E.act(s, { type: 'place', kind: pick(['tree', 'bench', 'lamp']), gx: x.gx, gy: x.gy }, now); }
      else if (t === 'upgrade') E.act(s, { type: 'upgrade', id: b.id, finishOther: R() < 0.3 }, now);
      else if (t === 'expand') E.act(s, { type: 'expand', finishOther: R() < 0.5 }, now);
      else if (t === 'clearRubble') { if (s.rubble.length) E.act(s, { type: 'clearRubble', id: pick(s.rubble).id }, now); }
      else if (t === 'move') E.act(s, { type: 'move', target: { kind: 'building', id: b.id }, gx: Math.floor(R() * 24), gy: Math.floor(R() * 24) }, now);
      else if (t === 'finish') { if (s.jobs.length) E.act(s, { type: 'finish', jobId: pick(s.jobs).id, confirm: R() < 0.7 }, now); }
      else if (t === 'restNow') E.act(s, { type: 'restNow', personId: pick(s.people).id, confirm: true }, now);
      else if (t === 'innNow') E.act(s, { type: 'innNow', confirm: true }, now);
      else if (t === 'buyCrane') E.act(s, { type: 'buyCrane' }, now);
      else if (t === 'grant') E.act(s, { type: 'dev', op: 'grant', what: pick(['bricks', 'cans', 'sparks']) }, now);
      else if (t === 'tower') { if (R() < 0.2) E.act(s, { type: 'dev', op: 'setTower', lv: 1 + Math.floor(R() * 10) }, now); }
      else if (t === 'kill') { if (R() < 0.3) E.act(s, { type: 'dev', op: 'kill', personId: pick(s.people).id }, now); }
      else if (t === 'addPerson') { if (R() < 0.1) E.act(s, { type: 'dev', op: 'addPerson' }, now); }
      else if (t === 'tick') E.tick(s, 16, s.realLast + Math.floor(R() * 1200));
      else E.resume(s, s.realLast + Math.floor(R() * (R() < 0.2 ? 30 * DAY : 2 * H)));
      if (i % 50 === 49) { inv(s, 'seed ' + seed + ' #' + i); const raw = E.serialize(s); ok(E.serialize(E.load(raw, s.realLast).state) === raw, 'seed ' + seed + ' #' + i + ': round trip'); E.view(s); }
    }
  }
  // damaged saves always load, play and settle into a valid city
  const RR = N.mulberry32(4242), pk = (a) => a[Math.floor(RR() * a.length)];
  const junk = () => pk([null, NaN, -1, 1e12, 'x', {}, [], true, 0.5, 'b1', 'p0', [1, 2], { a: 1 }]);
  const mutate = (o, d) => { if (!o || typeof o !== 'object') return; const ks = Object.keys(o); if (!ks.length) return;
    for (let n = 0; n < 1 + Math.floor(RR() * 3); n++) { const k = pk(ks), r = RR(); if (r < 0.25) o[k] = junk(); else if (r < 0.35) delete o[k]; else if (d < 4) mutate(o[k], d + 1); } };
  const bases = [E.serialize(city()), E.serialize(E.demo({ realNow: T0 }))];
  for (let i = 0; i < 400; i++) {
    const o = JSON.parse(pk(bases)); mutate(o, 0);
    const s = E.load(JSON.stringify(o), T0).state;
    inv(s, 'damaged save ' + i); E.view(s); E.advance(s, H); E.act(s, { type: 'upgrade', id: s.buildings[0].id }, T0);
    const raw = E.serialize(s); ok(E.serialize(E.load(raw, T0).state) === raw, 'damaged save ' + i + ': stable after repair');
  }
});

// ------------------------------------------------------------------ summary
console.log('\n' + pass + ' checks passed, ' + fail + ' failed, ' + todos + ' to do (people-and-runs stage)');
if (fail) { console.log(failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1; }
