// Survivor Camp node tests: SPEC section 12 A, tests 1-16 (test 17 is sim-bot.cjs).
//   node survivor-camp/tests.cjs        non-zero exit on any failure
'use strict';
const E = require('./engine.js');
const D = require('./data.js');
const Run = require('./run.js');

const T0 = Date.UTC(2026, 10, 3, 18, 0, 0);
const MIN = 60000, H = 3600000, DAY = 86400000;
let pass = 0, fail = 0; const failures = [];
let current = '';
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(current + ': ' + msg); } }
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); ok(A === B, msg + ' (got ' + A + ', want ' + B + ')'); }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' ±' + tol + ')'); }
function test(name, fn) {
  current = name; const f0 = fail, t = Date.now();
  try { fn(); } catch (e) { fail++; failures.push(name + ': threw ' + (e && e.stack || e)); }
  console.log((fail === f0 ? 'PASS ' : 'FAIL ') + name + '  (' + (Date.now() - t) + ' ms)');
}
const act = (s, a) => E.act(s, a);
const must = (s, a) => { const r = E.act(s, a); if (!r.ok) throw new Error('act ' + JSON.stringify(a) + ' failed: ' + r.err); return r; };
const clone = (s) => JSON.parse(JSON.stringify(s));

// A camp in a given configuration (FTUE done, pile taken, forced wins used up).
function camp(o) {
  o = o || {};
  const s = E.create({ realNow: T0, tzOffsetMs: 0, seed: o.seed || 1 });
  s.ftue = { step: 6, done: true }; s.pile = 0; s.forcedWins = 0; s.runSeq = o.runSeq != null ? o.runSeq : 3;
  if (o.lv) Object.assign(s.lv, o.lv);
  if (o.res) Object.assign(s.res, o.res);
  if (o.people) while (s.people.length < o.people) s.people.push({ id: 'p' + (s.people.length + 1), name: E.nextName(s), state: 'home', until: null, runs: 0, wins: 0, joinedAt: 0 });
  if (o.crews) s.crews = o.crews;
  if (o.stock) Object.assign(s.stock, o.stock);
  if (o.weapons) Object.assign(s.weapons, o.weapons);
  s.objective = o.objective != null ? o.objective : D.OBJECTIVES.length;   // objectives off unless a test wants them
  return s;
}
const L0 = (o) => Object.assign({ primary: 'pistol', gearBase: 10, intel: 0, maxHp: 100, sw: 1, medkit: 0, pills: 0, bomb: 0, hurt: false, skill: 0 }, o);
const R = {}; D.ROUTES.forEach((r) => { R[r.id] = r; });
const pct = (x) => Math.round(x * 100);

// ------------------------------------------------------------------ 1
test('1 data rule: 0 violations at cost multipliers 0.25, 1, 1.5, 4', () => {
  for (const m of [0.25, 1, 1.5, 4]) eq(D.assertData(m), [], 'violations at x' + m);
  const s = camp();
  for (const m of [0.25, 4]) { const r = must(s, { type: 'dev', op: 'mul', key: 'cost', value: m }); eq(r.dataRule, [], 'Lab costs x' + m + ' re-check'); }
  must(s, { type: 'dev', op: 'mul', key: 'cost', value: 4 });
  eq(E.caps(s), { scrap: 2400, food: 1200, meds: 200 }, 'costs multiplier also scales the caps');
});

// ------------------------------------------------------------------ 2
test('2 tables: costs, times, caps, rates equal SPEC section 3', () => {
  const cf = [[2, 100, 20, 2, 30, 10, 0], [3, 250, 60, 3, 180, 15, 3], [4, 500, 150, 4, 900, 20, 9], [5, 1100, 400, 5, 2700, 25, 22], [6, 2600, 1100, 6, 7200, 30, 47],
    [7, 5500, 2400, 7, 14400, 35, 81], [8, 10000, 4400, 8, 28800, 40, 140], [9, 15000, 6500, 9, 28800, 45, 140], [10, 26000, 11000, 10, 36000, 50, 167]];
  for (const [L, sc, f, sv, t, bat, skip] of cf) {
    const c = E.cost('campfire', L);
    eq([c.scrap, c.food, D.BUILDINGS.campfire.survivors[L], E.buildTime('campfire', L), D.BUILDINGS.campfire.bat[L], E.price.skip(E.buildTime('campfire', L)), E.reqCL('campfire', L)], [sc, f, sv, t, bat, skip, L - 1], 'Campfire ' + L);
  }
  const wb = [[1, 50, 10, 0, 45, 2, 1.00, 1.0, 0], [2, 160, 30, 0, 60, 2, 1.04, 1.0, 2], [3, 390, 80, 1, 300, 3, 1.08, 1.1, 6], [4, 850, 170, 2, 870, 4, 1.12, 1.1, 8], [5, 1700, 340, 3, 2160, 5, 1.16, 1.1, 10],
    [6, 3100, 620, 4, 5400, 6, 1.20, 1.2, 14], [7, 5200, 1050, 5, 10800, 7, 1.24, 1.2, 16], [8, 7800, 1550, 6, 21600, 8, 1.28, 1.2, 18], [9, 11700, 2350, 8, 34560, 9, 1.32, 1.3, 22], [10, 16900, 3400, 10, 51840, 10, 1.36, 1.3, 24]];
  for (const [L, sc, f, bp, t, req, dm, mm, g] of wb) {
    const c = E.cost('workbench', L), W = D.BUILDINGS.workbench;
    eq([c.scrap, c.food, c.bp, E.buildTime('workbench', L), E.reqCL('workbench', L), W.damageMul[L], W.magMul[L], W.gear[L]], [sc, f, bp, t, req, dm, mm, g], 'Workbench ' + L);
    near(W.damageMul[L], 1 + 0.04 * Math.max(0, L - 1), 1e-9, 'damageMul formula L' + L);
    eq(W.gear[L], 2 * Math.max(0, L - 1) + 2 * ((L >= 3) + (L >= 6) + (L >= 9)), 'WB gear formula L' + L);
  }
  const sh = [[2, 200, 60, 60, 1500, 600, 100], [3, 600, 180, 180, 3000, 1250, 180], [4, 1400, 420, 570, 5500, 2250, 300], [5, 3000, 900, 1440, 10000, 3750, 500], [6, 5500, 1650, 3600, 16000, 6250, 750],
    [7, 9000, 2700, 7200, 25000, 10000, 1100], [8, 14000, 4200, 14400, 37500, 15000, 1600], [9, 21000, 6300, 23040, 56000, 22500, 2250], [10, 30000, 9000, 34560, 80000, 32500, 3100]];
  for (const [L, sc, f, t, cs, cf2, cm] of sh) {
    const c = E.cost('storehouse', L), C = D.BUILDINGS.storehouse.caps;
    eq([c.scrap, c.food, E.buildTime('storehouse', L), C.scrap[L], C.food[L], C.meds[L], E.reqCL('storehouse', L)], [sc, f, t, cs, cf2, cm, L], 'Storehouse ' + L);
  }
  eq([D.BUILDINGS.storehouse.caps.scrap[1], D.BUILDINGS.storehouse.caps.food[1], D.BUILDINGS.storehouse.caps.meds[1]], [600, 300, 50], 'Storehouse 1 caps');
  const bh = [[2, 110, 55, 60, 4], [3, 270, 140, 180, 5], [4, 590, 300, 570, 6], [5, 1150, 580, 1440, 7], [6, 2150, 1100, 3600, 8], [7, 3600, 1800, 7200, 9], [8, 5400, 2700, 14400, 10], [9, 8100, 4050, 23040, 11], [10, 11700, 5850, 34560, 12]];
  for (const [L, sc, f, t, beds] of bh) { const c = E.cost('bunkhouse', L); eq([c.scrap, c.food, E.buildTime('bunkhouse', L), D.BUILDINGS.bunkhouse.beds[L]], [sc, f, t, beds], 'Bunkhouse ' + L); }
  const sal = [[40, 10], [120, 35], [300, 90], [650, 200], [1300, 390], [2400, 720], [4000, 1200], [6000, 1800], [9000, 2700], [13000, 3900]];
  const gar = [[30, 5], [95, 15], [240, 35], [520, 80], [1050, 160], [1900, 290], [3200, 480], [4800, 720], [7200, 1100], [10400, 1550]];
  const ptime = [60, 240, 720, 1800, 4500, 9000, 18000, 28800, 43200];
  const srate = [60, 90, 130, 180, 250, 340, 450, 600, 780, 1000], grate = [30, 45, 65, 90, 125, 165, 210, 260, 320, 380], holds = [3, 4, 5, 6, 8, 8, 10, 10, 12, 12];
  for (let L = 1; L <= 10; L++) {
    const a = E.cost('salvage', L), b = E.cost('garden', L);
    eq([a.scrap, a.food, b.scrap, b.food], sal[L - 1].concat(gar[L - 1]), 'Salvage/Garden cost ' + L);
    eq([E.buildTime('salvage', L), E.buildTime('garden', L)], L === 1 ? [10, 20] : [ptime[L - 2], ptime[L - 2]], 'Salvage/Garden time ' + L);
    eq([D.BUILDINGS.salvage.rate[L], D.BUILDINGS.garden.rate[L], D.BUILDINGS.salvage.holds[L], D.BUILDINGS.garden.holds[L], E.reqCL('salvage', L)], [srate[L - 1], grate[L - 1], holds[L - 1], holds[L - 1], L], 'rates ' + L);
  }
  const inf = [[45, 25, 0, 60, 3, 8, 100, 1], [130, 65, 0, 60, 3, 10, 105, 1], [330, 170, 0, 240, 3, 12, 110, 1], [720, 360, 70, 720, 4, 14, 115, 1], [1450, 730, 150, 1800, 5, 16, 120, 1],
    [2650, 1350, 270, 4500, 6, 18, 125, 1], [4400, 2200, 440, 9000, 7, 20, 130, 1], [6600, 3300, 660, 18000, 8, 22, 130, 2], [9900, 4950, 990, 28800, 9, 24, 130, 2], [14300, 7150, 1450, 43200, 10, 26, 130, 2]];
  inf.forEach((r, i) => { const L = i + 1, c = E.cost('infirmary', L), I = D.BUILDINGS.infirmary; eq([c.scrap, c.food, c.meds, E.buildTime('infirmary', L), E.reqCL('infirmary', L), I.rate[L], I.maxHp[L], I.secondWind[L]], r, 'Infirmary ' + L); });
  const rad = [[50, 20, 30, 2, 3.0], [140, 55, 60, 2, 3.5], [360, 140, 240, 3, 4.0], [780, 310, 720, 4, 4.5], [1550, 620, 1800, 5, 5.0], [2900, 1150, 4500, 6, 5.5], [4800, 1900, 9000, 7, 6.0], [7200, 2900, 18000, 8, 6.5], [10800, 4300, 28800, 9, 7.0], [15600, 6250, 43200, 10, 7.5]];
  rad.forEach((r, i) => { const L = i + 1, c = E.cost('radio', L); eq([c.scrap, c.food, E.buildTime('radio', L), E.reqCL('radio', L), D.BUILDINGS.radio.hordeWarnS[L]], r, 'Radio ' + L); });
  const gen = [[60, 20, 60, 6, 2, 536], [180, 55, 90, 5.5, 2, 551], [450, 140, 360, 5, 3, 567], [980, 290, 1080, 4.5, 3, 582], [1950, 590, 2700, 4, 4, 598], [3600, 1100, 6750, 3.5, 4, 614],
    [6000, 1800, 13500, 3, 5, 629], [9000, 2700, 27000, 2.75, 5, 645], [13500, 4050, 43200, 2.5, 6, 660], [19500, 5850, 64800, 2.25, 6, 676]];
  gen.forEach((r, i) => { const L = i + 1, c = E.cost('generator', L), G = D.BUILDINGS.generator; eq([c.scrap, c.food, E.buildTime('generator', L), G.intervalH[L], G.holds[L], G.flashlightR[L]], r, 'Generator ' + L); eq(G.flashlightR[L], Math.round(520 * (1 + 0.03 * L)), 'flashlight formula ' + L); eq(E.reqCL('generator', L), Math.max(5, L), 'Generator reqCL ' + L); });
  // gear score formula (SPEC 5.2) against the engine for every Workbench/Radio/Generator combination
  const s = camp({ lv: { campfire: 10 } });
  for (let wbl = 0; wbl <= 10; wbl++) for (const rl of [0, 1, 5, 10]) for (const gl of [0, 3, 10]) {
    s.lv.workbench = wbl; s.lv.radio = rl; s.lv.generator = gl;
    const want = 10 + 2 * Math.max(0, wbl - 1) + 2 * ((wbl >= 3) + (wbl >= 6) + (wbl >= 9)) + Math.max(0, rl - 1) + gl;
    eq(E.loadoutFor(s, 'R1', { intel: 0 }).gearBase, want, 'gearBase WB' + wbl + ' R' + rl + ' G' + gl);
  }
});

// ------------------------------------------------------------------ 3
test('3 skip prices equal the 4.10 table', () => {
  const rows = [[1, 0], [15, 0], [30, 0], [31, 1], [60, 1], [120, 2], [180, 3], [300, 4], [600, 7], [900, 9], [1800, 16], [2700, 22], [3600, 27], [7200, 47], [14400, 81], [28800, 140], [36000, 167], [43200, 194]];
  for (const [sec, bat] of rows) eq(E.price.skip(sec), bat, 'price ' + sec + ' s');
  const s = camp(); eq(E.price.skip(30, s), 0, '30 s free'); eq(E.price.skip(31, s), 1, '31 s');
  must(s, { type: 'dev', op: 'skipExp', value: 1.0 }); eq(E.price.skip(3600, s), 60, 'exponent 1.0, 60 m');
});

// ------------------------------------------------------------------ 4
test('4 shortfall "Build now": 38, 63, 56 and never for BP/survivors/CL/storage/zero income', () => {
  // CL2 camp, Salvage 1 + Garden 1 with one worker each (90/h, 45/h)
  const s = camp({ lv: { campfire: 2, salvage: 1, garden: 1 }, res: { scrap: 0, food: 0 } });
  eq([E.rate(s, 'salvage'), E.rate(s, 'garden')], [90, 45], 'rates with 1 worker');
  const sf = (sc, fo) => E.price.shortfall(s, { scrap: sc, food: fo, meds: 0, bp: 0 });
  eq(sf(140, 0).price, 38, 'missing 140 S'); eq(sf(30, 0).price, 11, 'missing 30 S'); eq(sf(140, 40).price, 63, 'missing 140 S + 40 F');
  eq(sf(140, 0).label, 'Build now: 1 h 33 m of scrap · 38 bat', 'label');
  const w = camp({ lv: { campfire: 8, storehouse: 8, salvage: 8 }, res: { scrap: 0 } });
  eq(E.rate(w, 'salvage'), 1200, 'Salvage 8 with 2 workers');
  eq(E.price.shortfall(w, { scrap: 3000, food: 0, meds: 0, bp: 0 }).price, 56, 'missing 3 000 S'); eq(E.price.shortfall(w, { scrap: 600, food: 0, meds: 0, bp: 0 }).price, 16, 'missing 600 S');
  // gates
  const g = camp({ lv: { campfire: 3, salvage: 1, garden: 1, workbench: 2 }, res: { scrap: 0, food: 0, bp: 0 } });
  eq(E.price.shortfall(g, E.cost('workbench', 3, g)), null, 'BP missing: not offered');
  eq(E.price.shortfall(g, E.cost('campfire', 4, g)), null, 'survivors missing: not offered');
  eq(E.price.shortfall(g, E.cost('generator', 1, g)), null, 'CL gate: not offered');
  const st = camp({ lv: { campfire: 5, salvage: 2, garden: 2 }, res: { scrap: 0, food: 0 }, people: 6 });
  eq(E.price.shortfall(st, E.cost('campfire', 6, st)), null, 'cost above storage cap: not offered');
  const z = camp({ lv: { campfire: 2, salvage: 1 }, res: { scrap: 0, food: 0 } });
  eq(E.price.shortfall(z, { scrap: 10, food: 10, meds: 0, bp: 0 }), null, 'food missing with 0 food income: not offered');
  ok(E.price.shortfall(z, { scrap: 10, food: 0, meds: 0, bp: 0 }) !== null, 'scrap-only shortfall offered');
  // buildNow buys exactly the shortfall
  const b = camp({ lv: { campfire: 2, salvage: 1, garden: 1 }, res: { scrap: 60, food: 60, bat: 100 } });
  const r = must(b, { type: 'buildNow', id: 'storehouse' });
  eq([r.price, b.res.bat, b.res.scrap, b.res.food, b.jobs.length], [38, 62, 0, 0, 1], 'buildNow storehouse 2 at 38 bat');
  ok(!act(g, { type: 'buildNow', id: 'workbench' }).ok, 'buildNow refused when BP is missing');
});

// A mid-game camp with every kind of timer running.
function midGame(seed) {
  const s = camp({ seed: seed || 5, lv: { campfire: 5, storehouse: 5, bunkhouse: 5, salvage: 4, garden: 4, radio: 5, workbench: 3, infirmary: 3, generator: 2 },
    res: { scrap: 2000, food: 900, meds: 120, bat: 50, bp: 3 }, people: 6, crews: 2, objective: 18 });
  s.buf = { salvage: 100.5, garden: 40.25, infirmary: 5 }; s.gen = { charges: 1, accMs: 2 * H };
  s.jobs = [{ id: 'campfire', toLv: 6, startAt: 0, endAt: 2 * H, dur: 2 * H, cut: 0 }, { id: 'salvage', toLv: 5, startAt: 0, endAt: 30 * MIN, dur: 30 * MIN, cut: 0 }];
  s.craft.infirmary = [{ item: 'medkit', dur: 8 * MIN, endAt: 5 * MIN, cut: 0 }, { item: 'pills', dur: 3 * MIN, endAt: null, cut: 0 }, { item: 'medkit', dur: 8 * MIN, endAt: null, cut: 0 }];
  s.craft.workbench = [{ item: 'bomb', dur: 5 * MIN, endAt: 4 * MIN, cut: 0 }];
  s.recruit = { name: E.nextName(s), endAt: 44 * MIN, dur: 44.7 * MIN, cut: 0 };
  s.people[5].state = 'party'; s.people[5].until = 2 * H;
  s.parties = [{ id: 'x1', who: s.people[5].id, kind: '2h', endAt: 2 * H, loot: { scrap: 580, food: 203, meds: 12 }, back: false }];
  s.people[4].state = 'injured'; s.people[4].until = 20 * MIN;
  s.weapons.smg = true;
  return s;
}

// ------------------------------------------------------------------ 5
test('5 event stepping: advance(8 h) once equals 480 x advance(1 min)', () => {
  const a = midGame(), b = clone(a);
  const ea = E.advance(a, 8 * H, { source: 'frame' });
  const eb = []; for (let i = 0; i < 480; i++) for (const e of E.advance(b, MIN, { source: 'frame' })) eb.push(e);
  eq(a.campNow, b.campNow, 'clock');
  for (const k of ['scrap', 'food', 'meds', 'bat', 'bp']) near(a.res[k], b.res[k], 1, 'res.' + k);
  for (const k of ['salvage', 'garden', 'infirmary']) near(a.buf[k], b.buf[k], 1, 'buf.' + k);
  eq(a.lv, b.lv, 'levels'); eq(a.stock, b.stock, 'stock'); eq(a.gen, b.gen, 'generator');
  eq(a.people.map((p) => [p.id, p.state, p.until]), b.people.map((p) => [p.id, p.state, p.until]), 'people');
  eq(a.parties, b.parties, 'parties'); eq(a.recruit, b.recruit, 'recruit'); eq(a.craft, b.craft, 'craft queues');
  const types = (ev) => ev.map((e) => e.type).sort();
  eq(types(ea), types(eb), 'event types');
  ok(ea.some((e) => e.type === 'jobDone') && ea.some((e) => e.type === 'craftDone') && ea.some((e) => e.type === 'partyBack') && ea.some((e) => e.type === 'recruitDone') && ea.some((e) => e.type === 'healed') && ea.some((e) => e.type === 'genCharge'), 'all event kinds happened');
  eq(a.lv.campfire, 6, 'Campfire 6 done'); eq(a.stock, { medkit: 2, pills: 1, bomb: 1 }, 'three crafts and a bomb');
});

// ------------------------------------------------------------------ 6
test('6 offline: 10 h accrual, level-ups in order, rollback, 7-day cap, 600x closes at 1x', () => {
  const s = camp({ lv: { campfire: 9, storehouse: 9, salvage: 9, garden: 2 } });
  const rs = E.rate(s, 'salvage'), rg = E.rate(s, 'garden');
  const L = E.load(E.serialize(s), T0 + 10 * H); eq(L.status, 'ok', 'load status');
  const r = E.resume(L.state, T0 + 10 * H);
  eq(r.creditedMs, 10 * H, 'credited 10 h');
  near(L.state.buf.salvage, Math.min(rs * 10, rs * 12), 1e-6, 'salvage buffer = rate x 10 h');
  near(L.state.buf.garden, Math.min(rg * 10, rg * 4), 1e-6, 'garden buffer = its cap');
  ok(r.welcome && r.welcome.rows.some((x) => x.id === 'garden' && /FULL for 6 h/.test(x.text)), 'welcome row says FULL for 6 h');
  // a level-up 2 h in: production switches rate at that moment
  const u = camp({ lv: { campfire: 10, storehouse: 10, salvage: 9 } });
  u.jobs = [{ id: 'salvage', toLv: 10, startAt: 0, endAt: 2 * H, dur: 12 * H, cut: 0 }];
  const r9 = E.rate(u, 'salvage');
  const U = E.load(E.serialize(u), T0).state; const ru = E.resume(U, T0 + 10 * H);
  eq(U.lv.salvage, 10, 'job finished offline'); ok(ru.events.some((e) => e.type === 'jobDone'), 'jobDone event returned');
  const r10 = E.rate(U, 'salvage');
  near(U.buf.salvage, r9 * 2 + r10 * 8, 1e-6, 'buffer = 2 h at L9 + 8 h at L10');
  // rollback
  const k = camp(); const c0 = k.campNow;
  const rb = E.resume(k, T0 - MIN);
  eq([rb.creditedMs, rb.rollback, k.campNow, k.realSeenAt], [0, true, c0, T0 - MIN], 'rollback credits 0');
  ok(k.tele.log.some((x) => x.type === 'clock_rollback'), 'clock_rollback logged');
  // 30 days away
  const m = camp(); const r30 = E.resume(m, T0 + 30 * DAY);
  eq([r30.creditedMs, m.campNow], [7 * DAY, 7 * DAY], 'credits exactly 7 d');
  ok(m.tele.log.some((x) => x.type === 'offline_gap'), 'offline_gap logged');
  // closed at 600x, back 1 h later
  const f = camp(); must(f, { type: 'dev', op: 'timeScale', value: 600 });
  const F = E.load(E.serialize(f), T0).state; const before = F.campNow; const rf = E.resume(F, T0 + H);
  eq([rf.creditedMs, F.campNow - before], [H, H], 'credits 1 h, not 600 h');
});

// ------------------------------------------------------------------ 7
test('7 time scale and frame clamp', () => {
  const s = camp(); must(s, { type: 'dev', op: 'timeScale', value: 600 });
  E.tick(s, 1000, T0 + 1000); eq(s.campNow, 10 * MIN, '1 s at 600x = 10 min');
  must(s, { type: 'dev', op: 'timeScale', value: 1 });
  E.tick(s, 5000, T0 + 6000); eq(s.campNow, 10 * MIN + 1000, 'a 5 s frame gap counts as 1 s');
  eq(s.realSeenAt, T0 + 6000, 'tick records realSeenAt');
  must(s, { type: 'dev', op: 'timeScale', value: 0 }); E.tick(s, 1000, T0 + 7000); eq(s.campNow, 10 * MIN + 1000, 'paused');
  must(s, { type: 'dev', op: 'timeScale', value: 1 }); must(s, { type: 'startRun', routeId: 'R1' });
  E.tick(s, 1000, T0 + 8000); eq(s.campNow, 10 * MIN + 1000, 'the run screen pauses the camp clock');
  // batteries earned at 600x are tagged dev
  const g = camp({ lv: { campfire: 5, generator: 1 } }); must(g, { type: 'dev', op: 'timeScale', value: 600 });
  for (let i = 0; i < 40; i++) E.tick(g, 1000, T0 + i * 1000);
  must(g, { type: 'collect', id: 'generator' });
  ok((g.tele.bat.earned.dev || 0) > 0 && !g.tele.bat.earned.generator, 'generator batteries collected at 600x are tagged dev');
});

// A fixed action script (includes runs) for determinism and save tests.
function script(s) {
  const out = [];
  const A = (a) => out.push(E.act(s, a));
  const run = (route) => { const st = E.act(s, { type: 'startRun', routeId: route }); out.push(st); if (st.ok) A({ type: 'resolveRun', result: E.runSim(s) }); A({ type: 'openCrate' }); };
  A({ type: 'tapFire' }); A({ type: 'takePile' }); A({ type: 'build', id: 'salvage' }); A({ type: 'finishFree', target: { kind: 'job', id: 'salvage' } });
  A({ type: 'collectAll' }); run('R1'); A({ type: 'build', id: 'campfire' }); E.advance(s, MIN); A({ type: 'collectAll' });
  A({ type: 'build', id: 'garden' }); E.advance(s, 30 * MIN); A({ type: 'collectAll' }); A({ type: 'build', id: 'workbench' }); run('R1'); E.advance(s, 2 * MIN);
  A({ type: 'collectAll' }); A({ type: 'unlockWeapon', weapon: 'smg' }); A({ type: 'build', id: 'radio' }); E.advance(s, MIN); run('R2'); run('R2');
  A({ type: 'collectAll' }); A({ type: 'build', id: 'bunkhouse' }); A({ type: 'skip', target: { kind: 'job', id: 'bunkhouse' }, confirm: true });
  A({ type: 'recruit' }); E.advance(s, 3 * H); A({ type: 'collectAll' }); run('R2'); A({ type: 'claimPack', size: 'small' });
  return out;
}

// ------------------------------------------------------------------ 8
test('8 determinism: same seed + same actions -> identical serialize()', () => {
  const a = E.create({ realNow: T0, tzOffsetMs: 3600000, seed: 1234 }), b = E.create({ realNow: T0, tzOffsetMs: 3600000, seed: 1234 });
  const ra = script(a), rb = script(b);
  ok(ra.filter((x) => x.ok).length > 20, 'script mostly succeeds (' + ra.filter((x) => x.ok).length + ' ok)');
  eq(E.serialize(a), E.serialize(b), 'serialized states');
  const c = E.create({ realNow: T0, tzOffsetMs: 3600000, seed: 99 }); script(c);
  ok(E.serialize(a) !== E.serialize(c), 'a different seed gives a different camp');
});

// ------------------------------------------------------------------ 9
test('9 save/load: lossless round trip; NaN, negatives, levels above CL, unknown keys, v:2', () => {
  const s = E.create({ realNow: T0, tzOffsetMs: 0, seed: 77 }); script(s); E.act(s, { type: 'startRun', routeId: 'R1' });
  const raw = E.serialize(s), L = E.load(raw, T0);
  eq(L.status, 'ok', 'status'); eq(L.notes, [], 'no fixes on a clean save'); ok(E.serialize(L.state) === raw, 'round trip is byte-identical');
  eq(E.load(null, T0).status, 'new', 'no save -> new');
  eq(E.load('{not json', T0).status, 'corrupt-reset', 'unparsable -> corrupt-reset');
  eq(E.load(JSON.stringify({ hello: 1 }), T0).status, 'corrupt-reset', 'no version -> corrupt-reset');
  const fut = E.load(JSON.stringify(Object.assign(JSON.parse(raw), { v: 2 })), T0);
  eq(fut.status, 'future-version', 'v:2 -> future-version'); eq(fut.state.campNow, 0, 'future save is not used');
  const bad = JSON.parse(raw);
  bad.res.scrap = null; bad.res.food = -50; bad.res.meds = 12.7; bad.res.bat = 'lots'; bad.lv.campfire = 2; bad.lv.workbench = 7; bad.lv.generator = 3; bad.lv.radio = -1;
  bad.hack = 1; bad.res.gold = 5; bad.stock.medkit = 9; bad.jobs = [{ id: 'garden', toLv: bad.lv.garden + 1, startAt: 0, endAt: 1e9, dur: 60000, cut: 0 }, { id: 'salvage', toLv: 9, endAt: NaN, dur: 1 }, { id: 'radio', toLv: 1, startAt: 0, endAt: 'x', dur: 30000, cut: 0 }];
  bad.crews = 1; bad.truck = { scrap: 0, food: 0, meds: 0 }; bad.lv.storehouse = 1; bad.res.food = 5000;
  const B = E.load(JSON.stringify(bad), T0).state;
  eq([B.res.scrap, B.res.meds, B.res.bat], [0, 12, 0], 'null/float/string resources fixed');
  eq([B.lv.campfire, B.lv.workbench, B.lv.generator, B.lv.radio], [2, 2, 0, 0], 'levels clamped to CL and unlocks');
  ok(!('hack' in B) && !('gold' in B.res), 'unknown keys dropped');
  eq(B.stock.medkit, 3, 'stock <= 3'); eq(B.jobs.length, 1, 'bad timers and jobs beyond crews dropped');
  eq([B.res.food, B.truck.food], [300, 300], 'resources above the cap moved to the truck (truck holds 1x cap)');
  const neg = JSON.parse(raw); neg.res.food = -50; eq(E.load(JSON.stringify(neg), T0).state.res.food, 0, 'negatives clamped to 0');
  const nan = JSON.parse(raw); nan.campNow = 'NaN'; nan.buf.salvage = -3; const N = E.load(JSON.stringify(nan), T0).state; eq([N.campNow, N.buf.salvage], [0, 0], 'non-finite numbers -> 0');
  ok(E.sanitize(JSON.parse(raw)) && E.migrate({ v: 1, a: 1 }).v === 1, 'sanitize/migrate exposed');
});

// ------------------------------------------------------------------ 10
test('10 run model: 5.7 worked examples exactly, haul, every 5.4 odds fixture within ±2', () => {
  const L = L0({ primary: 'smg', medkit: 1, pills: 1, rescue: { chance: 0.2, guaranteed: false } });
  const w = Run.simulate(R.R2, L, 48206);
  eq(w, { win: true, progress: 1, time: 288, kills: 127, accuracy: 37, shoves: 30, damageTaken: 62, hordes: 3, secondWindUsed: 0, used: { medkit: 1, pills: 1, noiseBomb: 0 }, cachesFound: 2, rescued: false, endedAt: null,
    events: [[20, 'wander', 2, 6], [26, 'wander', 12, 11], [33, 'cache'], [38, 'wander', 9, 11], [125, 'horde', 12, 14], [153, 'cache'], [173, 'horde', 12, 16], [221, 'gate', 15, 46], [221, 'pills', 50], [221, 'medkit', 50], [288, 'safe_room']] }, 'win 48206');
  const l = Run.simulate(R.R2, L, 48202);
  eq([l.win, l.endedAt, l.time, l.progress, l.kills, l.accuracy, l.damageTaken, l.secondWindUsed, l.used, l.cachesFound], [false, 'gate', 227, 0.79, 96, 41, 140, 1, { medkit: 0, pills: 1, noiseBomb: 0 }, 2], 'loss 48202');
  const hw = Run.haul(R.R2, Object.assign({ result: 'safe_room' }, w), 48206), hl = Run.haul(R.R2, Object.assign({ result: 'overrun' }, l), 48202);
  eq([hw.scrap, hw.food, hw.meds], [239, 80, 6], 'win haul'); eq([hl.scrap, hl.food, hl.meds], [117, 30, 2], 'loss haul kept');
  // through the engine: same camp, same seed -> the 5.10 payload, the 5.9 handoff and the 239/80/6 reward
  const s = camp({ lv: { campfire: 2, radio: 1, workbench: 1 }, weapons: { smg: true }, stock: { medkit: 1, pills: 1 }, people: 3, runSeq: 3 });
  s.loadout.primary = 'smg'; s.loadout.runner = 'p2'; s.campNow = 1503000;
  must(s, { type: 'dev', op: 'lockSeed', value: 48206 });
  const st = must(s, { type: 'startRun', routeId: 'R2' });
  const h = st.handoff;
  eq(Object.keys(h), ['v', 'runId', 'seed', 'createdAtCamp', 'route', 'runner', 'loadout', 'stats', 'intel', 'gear', 'odds', 'force'], 'handoff keys');
  eq(Object.keys(h.route), ['id', 'name', 'danger', 'hordeMul', 'zombieCap', 'lengthS', 'wanderers', 'hordes', 'caches', 'mapSupplies', 'rescue'], 'handoff.route keys');
  eq(Object.keys(h.stats), ['maxHp', 'startHp', 'secondWind', 'damageMul', 'magMul', 'flashlightR', 'hordeWarnS', 'medkitSec', 'medkitHeal', 'bombLifeS', 'extraCaches'], 'handoff.stats keys');
  eq([h.runId, h.seed, h.createdAtCamp, h.route.rescue.name, h.runner.name, h.loadout, h.gear, h.odds, h.force, h.stats.hordeWarnS, h.route.mapSupplies],
    ['r-000004', 48206, 1503000, 'Dev', 'Tomas', { primary: 'smg', medkit: 1, pills: 1, noiseBomb: 0 }, 18, 0.91, 'auto', 3, { medkit: 1, pills: 1, noiseBomb: 1, ammo: 2, weapons: [] }], 'handoff matches the 5.9 example');
  const res = E.runSim(s);
  eq(res, { v: 1, runId: 'r-000004', seed: 48206, source: 'sim', result: 'safe_room', progress: 1, endedAt: null, time: 288, kills: 127, accuracy: 37, shoves: 30, damageTaken: 62, hordes: 3, secondWindUsed: 0,
    used: { medkit: 1, pills: 1, noiseBomb: 0 }, cachesFound: 2, rescued: false, events: w.events }, 'result payload matches 5.10');
  const rr = must(s, { type: 'resolveRun', result: res });
  eq([rr.reward.haul.scrap, rr.reward.haul.food, rr.reward.haul.meds, rr.reward.bp.first], [239, 80, 6, 2], 'reward 239 S, 80 F, 6 M, +2 BP first win');
  // 5.4 fixtures (±2 points)
  const fx = [
    [L0({}), [63, 46, 14, 4, 0]], [L0({ primary: 'smg' }), [81, 68, 34, 11, 1]], [L0({ primary: 'smg', medkit: 1, pills: 1 }), [95, 91, 67, 33, 7]], [L0({ primary: 'smg', medkit: 1 }), [88, 84, 54, 25, 4]],
    [L0({ primary: 'shotgun', gearBase: 20, maxHp: 110, medkit: 1, pills: 1, bomb: 1 }), [100, 100, 94, 71, 34]], [L0({ primary: 'rifle', gearBase: 30, maxHp: 120, medkit: 1, pills: 1, bomb: 1 }), [100, 100, 99, 96, 77]],
    [L0({ primary: 'rifle', gearBase: 39, maxHp: 130, sw: 2, medkit: 1, pills: 1, bomb: 1 }), [100, 100, 100, 100, 93]],
  ];
  fx.forEach(([l2, want], i) => D.ROUTES.forEach((r, j) => near(pct(Run.mc(r, l2)), want[j], 2, 'milestone ' + i + ' ' + r.id)));
  const dl = [['R1', L0({}), [63, 75, 79, 73, 92, 36, 70, 83]], ['R2', L0({ primary: 'smg' }), [68, 84, 83, 74, 95, 41, 75, 89]], ['R3', L0({ primary: 'smg', gearBase: 11, maxHp: 105 }), [41, 60, 55, 46, 78, 14, 49, 63]],
    ['R4', L0({ primary: 'shotgun', gearBase: 20, maxHp: 110 }), [36, 58, 52, 42, 71, 14, 44, 65]]];
  for (const [rid, b, want] of dl) {
    const cases = [{}, { medkit: 1 }, { pills: 1 }, { bomb: 1 }, { medkit: 1, pills: 1, bomb: 1 }, { hurt: true }, { intel: 1 }, { intel: 3 }];
    cases.forEach((c, i) => near(pct(Run.mc(R[rid], Object.assign({}, b, c))), want[i], 2, 'deltas ' + rid + ' ' + JSON.stringify(c)));
  }
  [['pistol', 46], ['smg', 68], ['shotgun', 72], ['rifle', 77]].forEach(([wp, v]) => near(pct(Run.mc(R.R2, L0({ primary: wp }))), v, 2, 'weapon ' + wp + ' at R2'));
  const mg = { '-10': [29, 49, 63, 66, 75], '-5': [43, 62, 73, 80, 84], 0: [56, 74, 82, 89, 93], 5: [70, 86, 90, 94, 95], 10: [83, 92, 95, 96, 98] };
  for (const m of Object.keys(mg)) {
    const b = L0({ gearBase: 26 + +m }), steps = [b, Object.assign({}, b, { medkit: 1 }), Object.assign({}, b, { medkit: 1, pills: 1 }), Object.assign({}, b, { medkit: 1, pills: 1, bomb: 1 }), Object.assign({}, b, { medkit: 1, pills: 1, bomb: 1, sw: 2, maxHp: 120 })];
    steps.forEach((l2, i) => near(pct(Run.mc(R.R3, l2)), mg[m][i], 2, 'margin ' + m + ' step ' + i));
  }
});

// ------------------------------------------------------------------ 11
test('11 outcome responds to upgrades (monotone odds)', () => {
  const base = { campfire: 10, storehouse: 10, workbench: 3, radio: 3, generator: 2, infirmary: 3 };
  for (const b of ['workbench', 'radio', 'generator', 'infirmary']) for (const rid of ['R3', 'R4', 'R5']) {
    let prev = -1; const s = camp({ lv: base, weapons: { smg: true } }); s.loadout.primary = 'smg';
    for (let L = 0; L <= 10; L++) { s.lv[b] = L; const o = E.odds(s, rid, null, { deltas: false }).odds; ok(o >= prev, b + ' ' + L + ' on ' + rid + ' (' + o + ' < ' + prev + ')'); prev = o; }
  }
  const s = camp({ lv: base, weapons: { smg: true, shotgun: true, rifle: true }, stock: { medkit: 1, pills: 1, bomb: 1 } });
  for (const rid of ['R2', 'R3', 'R4', 'R5']) for (const k of ['medkit', 'pills', 'bomb']) {
    const o = E.odds(s, rid, { primary: 'smg' }); ok(o.deltas[k] >= 0, k + ' never lowers odds on ' + rid);
  }
  const w = ['pistol', 'smg', 'shotgun', 'rifle'].map((p) => Run.mc(R.R2, L0({ primary: p })));
  ok(w[0] < w[1] && w[1] < w[2] && w[2] < w[3], 'pistol < SMG < shotgun < rifle on R2 (' + w.map(pct).join(' < ') + ')');
  ok(E.odds(s, 'R2', { primary: 'smg', hurt: true, medkit: 0, pills: 0, bomb: 0 }).odds < E.odds(s, 'R2', { primary: 'smg', medkit: 0, pills: 0, bomb: 0 }).odds, 'hurt lowers odds');
  const it = [0, 1, 2, 3].map((n) => E.odds(s, 'R3', { primary: 'smg', intel: n, medkit: 0, pills: 0, bomb: 0 }).odds);
  ok(it[0] < it[1] && it[1] < it[2] && it[2] < it[3], 'intel raises odds (' + it.map(pct).join(' < ') + ')');
});

// ------------------------------------------------------------------ 12
test('12 loss and item rules, intel, injuries, never blocked', () => {
  const s = camp({ lv: { campfire: 3, radio: 2, workbench: 3, infirmary: 1, bunkhouse: 3 }, weapons: { smg: true }, stock: { medkit: 2, pills: 2, bomb: 1 }, people: 4, res: { bp: 3 } });
  s.loadout.primary = 'smg';
  const before = { bp: s.res.bp, people: s.people.length };
  must(s, { type: 'dev', op: 'force', value: 'loss' });
  const st = must(s, { type: 'startRun', routeId: 'R2' }); const runner = st.handoff.runner.id;
  const res = E.runSim(s); eq(res.result, 'overrun', 'forced loss');
  const stock0 = Object.assign({}, s.stock);
  const rr = must(s, { type: 'resolveRun', result: res });
  eq(s.stock, { medkit: stock0.medkit - res.used.medkit, pills: stock0.pills - res.used.pills, bomb: stock0.bomb - res.used.noiseBomb }, 'only used items are spent');
  eq([s.res.bp, s.people.length, rr.reward.rescue], [before.bp, before.people, null], 'a loss gives no BP and no rescue');
  eq(s.routes.R2.intel, 1, 'intel +1');
  const p = s.people.find((x) => x.id === runner);
  eq(p.state, 'injured', 'runner injured'); near((p.until - s.campNow) / MIN, 6 * 2 * (1 - 0.08), 1e-9, 'injury 12 x 0.92 min');
  ok(s.loadout.runner !== runner, 'runner auto-switched to a fit person');
  ok(E.canStartRun(s, 'R1').ok, 'an injury never blocks a run (>= 3 people)');
  for (const n of [2, 3, 3]) { must(s, { type: 'dev', op: 'force', value: 'loss' }); must(s, { type: 'startRun', routeId: 'R2' }); must(s, { type: 'resolveRun', result: E.runSim(s) }); eq(s.routes.R2.intel, n, 'intel ' + n + ' (max 3)'); }
  must(s, { type: 'dev', op: 'force', value: 'win' }); must(s, { type: 'startRun', routeId: 'R2' }); must(s, { type: 'resolveRun', result: E.runSim(s) });
  eq(s.routes.R2.intel, 0, 'intel resets after a win');
  // run hurt is always allowed
  const hurt = s.people.find((x) => x.state === 'injured') || (() => { s.people[0].state = 'injured'; s.people[0].until = s.campNow + H; return s.people[0]; })();
  must(s, { type: 'setLoadout', patch: { runner: hurt.id } });
  const h2 = must(s, { type: 'startRun', routeId: 'R1' }).handoff;
  eq([h2.runner.hurt, h2.stats.startHp], [true, Math.round(0.6 * h2.stats.maxHp)], 'runs hurt at 60%');
  must(s, { type: 'resolveRun', result: E.runSim(s) });
  // 4.6 table: minutes and skip prices
  const table = { 1: [[6, 5], [5.5, 4], [4.6, 4], [3.6, 3], [3, 3]], 2: [[12, 8], [11, 7], [9.1, 6], [7.2, 5], [6, 5]], 3: [[18, 11], [16.6, 10], [13.7, 9], [10.8, 7], [9, 6]],
    4: [[24, 13], [22.1, 12], [18.2, 11], [14.4, 9], [12, 8]], 5: [[30, 16], [27.6, 15], [22.8, 13], [18, 11], [15, 9]] };
  const infs = [0, 1, 3, 5, 7];
  for (const d of [1, 2, 3, 4, 5]) infs.forEach((inf, i) => {
    const c = camp({ lv: { campfire: 7, infirmary: inf, radio: 6 }, people: 4 }); const route = D.ROUTES[d - 1];
    const rw = E.reward(c, route, { result: 'overrun', progress: 0.5, kills: 10, cachesFound: 0, used: { medkit: 0, pills: 0, noiseBomb: 0 }, secondWindUsed: 0, seed: 1 }, { seed: 1, handoff: { loadout: { medkit: 0, pills: 0, noiseBomb: 0 }, runner: { id: 'p1' }, route: { rescue: null } } });
    eq([Math.round(rw.injury.min * 10) / 10, E.price.skip(rw.injury.min * 60)], table[d][i], 'injury R' + d + ' Infirmary ' + inf);
  });
  // two people, one on a party and one hurt: still never blocked
  const two = camp({ lv: { campfire: 2, radio: 2 } }); two.people[0].state = 'injured'; two.people[0].until = H;
  ok(E.canStartRun(two, 'R1').ok, 'two people, one hurt: run allowed');
});

// ------------------------------------------------------------------ 13
test('13 momentum: 20 wins never cut a timer by more than 25%; 5.7 example', () => {
  const s = camp({ lv: { campfire: 7, storehouse: 7, bunkhouse: 7, infirmary: 2, radio: 2 }, people: 8, crews: 3, res: { meds: 100, food: 2000 } });
  s.jobs = [{ id: 'campfire', toLv: 8, startAt: 0, endAt: 8 * H, dur: 8 * H, cut: 0 }, { id: 'storehouse', toLv: 8, startAt: 0, endAt: 4 * H, dur: 4 * H, cut: 0 }, { id: 'salvage', toLv: 1, startAt: 0, endAt: 30 * MIN, dur: 30 * MIN, cut: 0 }];
  must(s, { type: 'craft', building: 'infirmary', item: 'medkit' }); must(s, { type: 'recruit' });
  const durs = {}; for (const j of s.jobs) durs[j.id] = j.dur;
  let maxShare = 0, cuts = 0;
  for (let i = 0; i < 20; i++) {
    must(s, { type: 'dev', op: 'force', value: 'win' }); must(s, { type: 'startRun', routeId: 'R1' });
    const r = must(s, { type: 'resolveRun', result: E.runSim(s) });
    for (const c of r.reward.momentum) { cuts++; maxShare = Math.max(maxShare, c.share); }
    for (const j of s.jobs) ok(j.cut <= 0.25 * j.dur + 1e-6, j.id + ' cut ' + j.cut + ' > 25% of ' + j.dur);
  }
  ok(cuts > 20, 'momentum applied (' + cuts + ' cuts)'); ok(maxShare <= 0.25 + 1e-9, 'max share ' + maxShare);
  const cf = s.jobs.find((j) => j.id === 'campfire'); near(cf.cut, 0.25 * durs.campfire, 1, 'long timer reaches exactly its 25% cap');
  // 5.7: a Campfire 3 timer (3 m) with 2 m left loses 45 s
  const e = camp({ lv: { campfire: 2 }, people: 3 }); e.jobs = [{ id: 'campfire', toLv: 3, startAt: 0, endAt: 2 * MIN, dur: 3 * MIN, cut: 0 }];
  must(e, { type: 'dev', op: 'runUsesCampTime', value: false }); must(e, { type: 'dev', op: 'force', value: 'win' }); must(e, { type: 'startRun', routeId: 'R1' });
  const r = must(e, { type: 'resolveRun', result: E.runSim(e) });
  eq([r.reward.momentum.length, r.reward.momentum[0].cutMs, e.jobs[0].endAt], [1, 45000, 75000], 'Campfire 3 loses 45 s (its 25% cap)');
  ok(/Campfire 3 −45 s \(25 \/ 25%\)/.test(r.reward.momentum[0].text), 'result card line: ' + r.reward.momentum[0].text);
});

// ------------------------------------------------------------------ 14
test('14 validateResult: wrong run, second claim, clamps, used, rescue, reload replay', () => {
  const s = camp({ lv: { campfire: 2, radio: 1 }, stock: { medkit: 0, pills: 1 } });
  const h = must(s, { type: 'startRun', routeId: 'R2' }).handoff;
  const good = E.runSim(s);
  const wrong = Object.assign({}, good, { runId: 'r-999999' });
  const v1 = E.validateResult(wrong, s.pending); ok(!v1.ok && v1.errors.includes('This result is from a different run'), 'wrong runId rejected');
  ok(!E.act(s, { type: 'resolveRun', result: wrong }).ok, 'act refuses a wrong runId');
  ok(!E.validateResult(Object.assign({}, good, { v: 2 }), s.pending).ok, 'v must be 1');
  const wild = Object.assign({}, good, { result: 'overrun', time: 99999, kills: -5, accuracy: 150, shoves: 1e9, damageTaken: 1e6, progress: 7, hordes: 50, secondWindUsed: 9, cachesFound: 99,
    used: { medkit: 1, pills: 1, noiseBomb: 1 }, rescued: true, extra: 'ignored', endedAt: 'moon' });
  const v = E.validateResult(wild, s.pending);
  ok(v.ok, 'clampable result accepted');
  eq([v.res.time, v.res.kills, v.res.accuracy, v.res.shoves, v.res.damageTaken, v.res.progress, v.res.hordes, v.res.secondWindUsed, v.res.cachesFound],
    [1800, 0, 100, 2000, 5000, 1, 10, 2, h.route.caches], 'out-of-range fields clamped');
  eq(v.res.used, { medkit: 0, pills: 1, noiseBomb: 0 }, 'used above the equipped amount clamped');
  eq([v.res.rescued, v.res.endedAt, 'extra' in v.res], [false, null, false], 'no rescue on an overrun; bad endedAt nulled; unknown fields ignored');
  ok(v.notes.length > 5, 'clamps are listed');
  must(s, { type: 'resolveRun', result: good });
  ok(!E.act(s, { type: 'resolveRun', result: good }).ok, 'a result is claimable once');
  ok(!E.validateResult(good, s.pending).ok, 'no pending after the claim');
  // rescued false when the handoff had no rescue
  must(s, { type: 'startRun', routeId: 'R1' }); s.pending.handoff.route.rescue = null;
  const r2 = Object.assign({}, E.runSim(s), { result: 'safe_room', rescued: true });
  eq(E.validateResult(r2, s.pending).res.rescued, false, 'rescued ignored without route.rescue');
  must(s, { type: 'dev', op: 'cancelRun' });
  // a reload with a pending sim run replays the identical result (also for a forced outcome)
  for (const force of ['auto', 'win', 'gateLoss']) {
    if (force !== 'auto') must(s, { type: 'dev', op: 'force', value: force });
    must(s, { type: 'startRun', routeId: 'R2' });
    const before = E.runSim(s), L = E.load(E.serialize(s), T0).state, after = E.runSim(L);
    eq(after, before, 'replay after reload (' + force + ')');
    if (force === 'gateLoss') eq([after.result, after.endedAt], ['overrun', 'gate'], 'forced gate loss');
    must(s, { type: 'resolveRun', result: before });
  }
});

// ------------------------------------------------------------------ 15
test('15 batteries never buy power', () => {
  const RICH = 1e6;
  const strip = (x) => { const c = clone(x); delete c.tele; delete c.seq; c.res.bat = 0; if (c.flags) c.flags.taughtSkip = false; return JSON.stringify(c); };
  const power = (x) => JSON.stringify({ bp: x.res.bp, weapons: x.weapons, people: x.people.length + x.gate.length, crews: x.crews });
  const s0 = midGame(9); s0.res.bp = 1; s0.stock = { medkit: 1, pills: 1, bomb: 0 }; s0.objective = D.OBJECTIVES.length;
  s0.jobs.push({ id: 'workbench', toLv: 4, startAt: 0, endAt: 3 * H, dur: 3 * H, cut: 0 }); s0.crews = 3;
  const actions = [{ type: 'tapFire' }, { type: 'takePile' }, { type: 'collectAll' }, { type: 'openCrate' }, { type: 'unloadTruck' }];
  for (const id of D.BUILDING_IDS) actions.push({ type: 'build', id }, { type: 'buildNow', id }, { type: 'collect', id });
  for (const t of [{ kind: 'job', id: 'campfire' }, { kind: 'job', id: 'salvage' }, { kind: 'job', id: 'workbench' }, { kind: 'craft', id: 'infirmary' }, { kind: 'craft', id: 'workbench' }, { kind: 'recruit', id: 'recruit' }, { kind: 'party', id: 'x1' }, { kind: 'injury', id: s0.people[4].id }])
    actions.push({ type: 'skip', target: t, confirm: true }, { type: 'finishFree', target: t });
  for (const it of ['medkit', 'pills', 'bomb']) actions.push({ type: 'craft', item: it });
  for (const w of ['smg', 'shotgun', 'rifle']) actions.push({ type: 'unlockWeapon', weapon: w });
  actions.push({ type: 'recruit' }, { type: 'sendParty', kind: '2h' }, { type: 'buyCrew' }, { type: 'claimPack', size: 'large' }, { type: 'setLoadout', patch: { primary: 'smg' } });
  const types = new Set(actions.map((a) => a.type)); types.add('startRun'); types.add('resolveRun'); types.add('dev');
  eq([...types].sort(), ['buildNow', 'buyCrew', 'claimPack', 'collect', 'collectAll', 'craft', 'dev', 'finishFree', 'openCrate', 'recruit', 'resolveRun', 'sendParty', 'setLoadout', 'skip', 'startRun', 'takePile', 'tapFire', 'unloadTruck', 'unlockWeapon', 'build'].sort(), 'every act type enumerated');
  let spenders = 0;
  for (const a of actions) {
    const rich = clone(s0); rich.res.bat = RICH; const poor = clone(s0); poor.res.bat = 0;
    const rr = E.act(rich, a), rp = E.act(poor, a);
    const sumSpent = (x) => Object.values(x.tele.bat.spent).reduce((p, q) => p + q, 0);
    const spent = sumSpent(rich) - sumSpent(s0);
    if (a.type === 'claimPack') { ok(rich.res.bat > RICH && power(rich) === power(s0), 'packs give batteries only'); continue; }
    if (!(spent > 0)) { ok(rr.ok === rp.ok && strip(rich) === strip(poor), a.type + ' ' + JSON.stringify(a.target || a.id || a.item || a.weapon || '') + ': same with or without batteries'); continue; }
    spenders++;
    ok(['skip', 'buildNow', 'buyCrew'].includes(a.type), a.type + ' spends batteries');
    eq(JSON.parse(power(rich)).bp, s0.res.bp, a.type + ': BP unchanged'); eq(rich.weapons, s0.weapons, a.type + ': weapons unchanged');
    for (const id of D.BUILDING_IDS) ok(rich.lv[id] <= rich.lv.campfire || id === 'campfire', a.type + ': ' + id + ' not above CL');
    if (a.type === 'skip') {
      // a skip equals the time that timer needed: finish it by the clock in the poor camp and compare
      const t = a.target, p2 = clone(s0); p2.res.bat = 0;
      const ref = t.kind === 'job' ? p2.jobs.find((j) => j.id === t.id) : t.kind === 'craft' ? p2.craft[t.id][0] : t.kind === 'recruit' ? p2.recruit : t.kind === 'party' ? p2.parties.find((x) => x.id === t.id) : p2.people.find((x) => x.id === t.id);
      if (t.kind === 'injury') ref.until = p2.campNow; else ref.endAt = p2.campNow;
      E.advance(p2, 0);
      ok(strip(rich) === strip(p2), 'skip ' + t.kind + ' ' + t.id + ' only buys that timer\'s time');
    } else if (a.type === 'buildNow') {
      const p2 = clone(s0); p2.res.bat = 0; const c = E.cost(a.id, p2.lv[a.id] + 1, p2);
      for (const k of ['scrap', 'food', 'meds']) p2.res[k] = Math.max(p2.res[k], c[k]);
      must(p2, { type: 'build', id: a.id });
      ok(strip(rich) === strip(p2), 'buildNow ' + a.id + ' only buys the missing resources');
    } else if (a.type === 'buyCrew') {
      const p2 = clone(s0); p2.crews = 3; ok(strip(rich).replace(/"crews":3/, '') === strip(p2).replace(/"crews":3/, ''), 'buyCrew changes only the crew count');
    }
  }
  ok(spenders >= 5, 'battery-spending actions exercised (' + spenders + ')');
  // buildNow is refused for BP / CL / survivors / storage gates even with batteries
  const g = camp({ lv: { campfire: 3, salvage: 1, garden: 1, workbench: 2 }, res: { bat: RICH, bp: 0, scrap: 0, food: 0 } });
  for (const id of ['workbench', 'generator', 'campfire']) ok(!E.act(g, { type: 'buildNow', id }).ok, 'buildNow ' + id + ' refused at a non-resource gate');
  // a run result never depends on batteries
  const a1 = camp({ lv: { campfire: 2, radio: 1 } }), a2 = clone(a1); a2.res.bat = RICH;
  must(a1, { type: 'dev', op: 'lockSeed', value: 4242 }); must(a2, { type: 'dev', op: 'lockSeed', value: 4242 });
  must(a1, { type: 'startRun', routeId: 'R2' }); must(a2, { type: 'startRun', routeId: 'R2' });
  eq(E.runSim(a1), E.runSim(a2), 'same run result rich or poor');
  eq(E.odds(a1, 'R2').odds, E.odds(a2, 'R2').odds, 'same odds rich or poor');
});

// ------------------------------------------------------------------ 16
test('16 no soft-lock: 10 000 random legal actions; goal() never empty', () => {
  const s = E.create({ realNow: T0, tzOffsetMs: 0, seed: 2026 });
  const rnd = Run.mulberry32(16);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const targets = () => {
    const t = [];
    for (const j of s.jobs) t.push({ kind: 'job', id: j.id });
    for (const b of ['infirmary', 'workbench']) if (s.craft[b].length) t.push({ kind: 'craft', id: b });
    if (s.recruit) t.push({ kind: 'recruit', id: 'recruit' });
    for (const p of s.parties) if (!p.back) t.push({ kind: 'party', id: p.id });
    for (const p of s.people) if (p.state === 'injured') t.push({ kind: 'injury', id: p.id });
    return t.length ? t : [{ kind: 'job', id: 'campfire' }];
  };
  const gen = () => {
    const r = rnd();
    if (r < 0.30) return { type: 'build', id: pick(D.BUILDING_IDS) };
    if (r < 0.40) return { type: 'collectAll' };
    if (r < 0.48) return { type: 'startRun', routeId: pick(D.ROUTES).id, external: rnd() < 0.05 };
    if (r < 0.53) return { type: pick(['skip', 'finishFree']), target: pick(targets()), confirm: rnd() < 0.5 };
    if (r < 0.58) return { type: 'craft', item: pick(['medkit', 'pills', 'bomb']) };
    if (r < 0.61) return { type: 'unlockWeapon', weapon: pick(['smg', 'shotgun', 'rifle']) };
    if (r < 0.64) return { type: 'recruit' };
    if (r < 0.67) return { type: 'sendParty', kind: pick(['30m', '2h', '8h']) };
    if (r < 0.69) return { type: 'buyCrew' };
    if (r < 0.71) return { type: 'buildNow', id: pick(D.BUILDING_IDS) };
    if (r < 0.74) return { type: 'setLoadout', patch: pick([{ primary: pick(['pistol', 'smg', 'shotgun', 'rifle']) }, { use: { medkit: rnd() < 0.5, pills: rnd() < 0.5, bomb: rnd() < 0.5 } }, { runner: pick(s.people).id }, { route: pick(D.ROUTES).id }]) };
    if (r < 0.77) return { type: pick(['tapFire', 'takePile', 'openCrate', 'unloadTruck']) };
    if (r < 0.80) return { type: 'collect', id: pick(['salvage', 'garden', 'infirmary', 'generator', 'radio', 'truck', 'crate']) };
    if (r < 0.81) return { type: 'claimPack', size: pick(['small', 'medium']) };
    if (r < 0.83) return { type: 'dev', op: pick(['grant', 'grant', 'finishAll', 'fillStorage']), what: pick(['scrap', 'food', 'meds', 'bp', 'survivor', 'bat']) };
    if (r < 0.835) return { type: 'dev', op: 'setCL', n: 1 + Math.floor(rnd() * 10) };
    return null;                                                      // let time pass
  };
  let legal = 0, steps = 0, lock = 0, emptyGoal = 0, rt = 0;
  while (legal < 10000 && steps < 60000) {
    steps++;
    const a = gen();
    if (!a) { E.advance(s, Math.floor(rnd() * rnd() * 3 * H) + 1000); continue; }
    const r = E.act(s, a);
    if (r.ok) legal++;
    if (s.pending) { const rr = E.act(s, { type: 'resolveRun', result: E.runSim(s) }); if (!rr.ok) lock++; }
    if (!E.canStartRun(s, 'R1').ok) lock++;
    const g = E.goal(s);
    if (!(g.main && g.main.text) && !(g.side && g.side.text)) emptyGoal++;
    if (legal % 1000 === 0 && r.ok) { const raw = E.serialize(s); if (E.serialize(E.load(raw, T0).state) !== raw) rt++; }
  }
  eq(legal, 10000, 'legal actions performed');
  eq([lock, emptyGoal, rt], [0, 0, 0], 'R1 always startable, goal never empty, saves round-trip');
  for (const k of ['scrap', 'food', 'meds', 'bat', 'bp']) ok(Number.isInteger(s.res[k]) && s.res[k] >= 0, 'res.' + k + ' integer >= 0');
});

// ------------------------------------------------------------------ extra checks the UI relies on
test('FTUE: 6 steps through the engine, goal chip after', () => {
  const s = E.create({ realNow: T0, tzOffsetMs: 0, seed: 3 });
  eq(E.goal(s).main.text, 'Tap the fire.', 'step 1 line');
  must(s, { type: 'tapFire' }); must(s, { type: 'takePile' }); must(s, { type: 'build', id: 'salvage' }); must(s, { type: 'finishFree', target: { kind: 'job', id: 'salvage' } });
  eq(s.ftue.step, 3, 'three steps done');
  const h = must(s, { type: 'startRun', routeId: 'R1' }).handoff;
  eq([h.loadout.primary, h.force, h.route.rescue.name, h.route.rescue.guaranteed], ['pistol', 'win', 'Ilse', true], 'FTUE run: pistol, forced win, Ilse');
  const r = must(s, { type: 'resolveRun', result: E.runSim(s) });
  eq([r.reward.win, r.reward.bp.total, r.reward.rescue.name], [true, 2, 'Ilse'], 'forced win, +2 BP, Ilse rescued');
  must(s, { type: 'openCrate' }); eq(s.ftue.step, 5, 'crate opened');
  must(s, { type: 'build', id: 'campfire' }); must(s, { type: 'finishFree', target: { kind: 'job', id: 'campfire' } });
  eq([s.ftue.done, s.lv.campfire, E.goal(s).main.n], [true, 2, 1], 'CL2, FTUE done, goal chip shows objective 1');
  const v = E.view(s); ok(v.hotspots.salvage.label.startsWith('Salvage Yard, level 1'), 'hotspot label: ' + v.hotspots.salvage.label);
  ok(Array.isArray(v.timeline) && v.dawn > 0 && v.lightRadius === 330 && v.campRange[0] === 220, 'view exposes timeline, dawn, light, camp range');
});

test('objective chain: state-based, instant when already satisfied, rewards paid', () => {
  const s = camp({ lv: { campfire: 3, garden: 1, workbench: 1, radio: 1, bunkhouse: 2, storehouse: 2 }, weapons: { smg: true }, people: 4, objective: 0 });
  s.routes.R2.wins = 1; s.flags.taughtSkip = true;
  const sc = s.res.scrap; E.advance(s, 0);
  eq(s.objective, 10, 'objectives 1-10 complete at once');
  eq(s.res.scrap - sc, 30 + 30 + 50 + 50 + 60, 'scrap rewards of 1, 2, 5, 8, 9');
});

test('engine source: no DOM, no clock reads, no unseeded randomness; classic scripts', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8');
  for (const bad of ['Date.now', 'performance.now', 'Math.random', 'document.', 'window.', 'localStorage', 'new Date']) ok(!src.includes(bad), 'engine.js must not use ' + bad);
  for (const f of ['data.js', 'run.js', 'engine.js']) { const c = fs.readFileSync(path.join(__dirname, f), 'utf8'); ok(!/^\s*(import|export)\s/m.test(c), f + ' is a classic script'); ok(c.includes("typeof self !== 'undefined' ? self : this"), f + ' uses the shared UMD wrapper'); }
  const ref = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
  ok(ref.includes('function simulate(route, L, seed)') && ref.includes('return { K, WEAPON, CACHE, mulberry32, gear, simulate, mc, haul };'), 'run.js exports the 5.3 model');
});

test('UI surface: demo camp, view fields, loss hint, welcome, KPIs', () => {
  const d = E.demo({ realNow: T0 });
  const v = E.view(d);
  for (const k of ['cl', 'caps', 'rates', 'workers', 'buffers', 'beds', 'fit', 'jobs', 'crewsFree', 'gear', 'stats', 'frontier', 'routes', 'affordable', 'blockers', 'timeline', 'dawn', 'lightRadius', 'campRange', 'hotspots', 'assign', 'slotNotes', 'daily', 'crew3'])
    ok(k in v, 'view.' + k);
  eq([v.cl, v.frontier, v.jobs.length, v.timeline.length], [5, 'R3', 2, 5], 'demo camp is a CL5 mid-game camp');
  for (const id of D.BUILDING_IDS) ok(typeof v.hotspots[id].label === 'string' && v.hotspots[id].label.length > 5, 'hotspot label ' + id);
  eq(v.slotNotes.garden, 'Garden −1 worker: Marta is out on a party', 'empty slot reason');
  eq(v.slotNotes.infirmary, 'Infirmary −1 worker: Kofi is hurt', 'second empty slot reason');
  ok(v.jobs.every((j) => typeof j.price === 'number' && typeof j.free === 'boolean' && j.left > 0), 'job timers carry price, free and left');
  eq(E.serialize(E.load(E.serialize(d), T0).state), E.serialize(d), 'demo camp is a valid save');
  const g = E.goal(d); ok(g.main.text && g.long.items.length === 4, 'goal main + next-CL checklist');
  const lh = E.lossHint(d, 'R3'); ok(lh.text.length > 10 && /Next Bus Depot run: \d+% → \d+%/.test(lh.intel.text), 'loss hint: ' + lh.text + ' / ' + lh.intel.text);
  d.loadout.use.medkit = false; eq(E.lossHint(d, 'R3').kind, 'equip', 'hint: take the medkit next time');
  const w = E.act(d, { type: 'dev', op: 'skipAhead', ms: 8 * H });
  ok(w.ok && w.welcome.rows.length >= 4, 'skip ahead +8 h returns welcome rows (' + w.welcome.rows.map((r) => r.text).join(' | ') + ')');
  ok(d.tele.log.some((x) => x.dev && x.type === 'dev:skipAhead'), 'Lab actions are logged dev');
  const k = E.kpis(d); ok('runShareScrap' in k && 'crewIdleShare' in k && Array.isArray(k.buckets), 'kpis summary');
  const sh = E.camp ? null : camp(); must(sh, { type: 'claimPack', size: 'medium' });
  ok(sh.tele.log.some((x) => x.type === 'pack_claimed' && x.data.size === 'medium') && sh.tele.bat.earned.pack === 500 && sh.tele.packs.medium === 1, 'pack_claimed logged and tagged pack');
  const lab = E.routeLab(camp({ lv: { campfire: 3, radio: 2 } }), 200); eq(lab.map((r) => r.id), ['R1', 'R2', 'R3'], 'route lab covers unlocked routes');
  ok(lab.every((r) => r.valuePerAttempt > 0 && r.valuePerCampMin > 0), 'route lab values');
});

console.log('\n' + pass + ' checks passed, ' + fail + ' failed');
if (fail) { console.log('\nFailures:'); for (const f of failures.slice(0, 60)) console.log(' - ' + f); }
process.exit(fail ? 1 : 0);
