// Survivor Camp pacing bot (SPEC section 10): drives the real engine with three personas over 7 days of camp
// time, 5 seeds each, prints the pacing table and asserts the targets. Non-zero exit on any failed assertion.
//   node survivor-camp/sim-bot.cjs            all assertions (active, idle, spender)
//   ALL=1 node survivor-camp/sim-bot.cjs      also prints the reference-only personas (hoarder, activeSkips)
//   DBG=active SEED=7 UNTIL=90 node ...       per-minute trace of one persona
'use strict';
const E = require('./engine.js');
const D = E.DATA;
const MIN = 60000, H = 3600000;
const SEEDS = [7, 11, 23, 42, 99];
const REAL0 = Date.UTC(2026, 10, 3, 18, 0, 0);       // t = 0 is 18:00 local (tz offset 0)
const T0 = process.hrtime.bigint();

const PERSONAS = {
  active: { sched: 'active', runs: 99, buyCrew: true, teachSkip: true },
  idle: { sched: 'idle', runs: 1, buyCrew: true, teachSkip: true },
  spender: { sched: 'active', runs: 99, buyCrew: true, spender: true, skipAll: true },
  hoarder: { sched: 'active', runs: 99, buyCrew: false },                                       // reference only
  activeSkips: { sched: 'active', runs: 99, buyCrew: true, teachSkip: true, skipCampfire: true }, // reference only
};
// [start hour, minutes, max runs]; t = 0 is 18:00, so +14 h = 08:00, +18.5 h = 12:30, +24 h = 18:00, +28 h = 22:00.
function schedule(kind) {
  const S = [];
  if (kind === 'idle') { S.push([0, 15, 3]); S.push([4.5, 4, 1]); for (let d = 0; d < 7; d++) for (const h of [14, 18.5, 24, 28.5]) S.push([d * 24 + h, 4, 1]); }
  else { S.push([0, 60, 99]); S.push([4, 25, 99]); for (let d = 0; d < 7; d++) for (const h of [14, 18.5, 24, 28]) S.push([d * 24 + h, 25, 99]); }
  return S.filter((x) => x[0] < 168);
}

const PRIO = ['campfire', 'storehouse', 'salvage', 'garden', 'radio', 'workbench', 'bunkhouse', 'infirmary', 'generator'];
const BLOCKING = new Set(['max', 'busy', 'cl', 'survivors', 'unknown']);

function act(s, a) { return E.act(s, a); }
function bestWeapon(s) { let w = 'pistol'; for (const k of D.WEAPON_ORDER) if (k === 'pistol' || s.weapons[k]) w = k; return w; }
// The spender claims the day's free 500 pack when short: when a purchase would empty the wallet (max 1 per camp day).
function claimPack(s, B) { const day = Math.floor(s.campNow / 86400000) + 1; if (B.packs >= day) return; B.packs++; act(s, { type: 'claimPack', size: 'medium' }); }

function timers(s) {
  const out = [];
  for (const j of s.jobs) out.push({ kind: 'job', id: j.id, endAt: j.endAt, campfire: j.id === 'campfire' });
  for (const b of ['infirmary', 'workbench']) { const c = s.craft[b][0]; if (c && c.endAt != null) out.push({ kind: 'craft', id: b, endAt: c.endAt }); }
  if (s.recruit) out.push({ kind: 'recruit', id: 'recruit', endAt: s.recruit.endAt });
  return out;
}
// Finish free timers (<= 30 s); the spender skips every timer > 30 s; activeSkips skips Campfire timers with 3 crews.
// kinds limits the pass to some timer kinds (the craft step only touches craft and recruit timers).
function finishTimers(s, P, B, kinds) {
  for (let guard = 0; guard < 20; guard++) {
    let did = false;
    for (const t of timers(s)) {
      if (kinds && !kinds.includes(t.kind)) continue;
      const left = (t.endAt - s.campNow) / 1000;
      if (left <= s.dev.freeSec) { if (act(s, { type: 'finishFree', target: t }).ok) did = true; continue; }
      if (P.skipAll) {
        const pr = E.price.skip(left, s);
        if (s.res.bat <= pr) claimPack(s, B);
        if (s.res.bat >= pr && act(s, { type: 'skip', target: t, confirm: true }).ok) did = true;
      } else if (P.skipCampfire && t.campfire && s.crews >= 3) {
        const pr = E.price.skip(left, s);
        if (pr <= s.res.bat && act(s, { type: 'skip', target: t, confirm: true }).ok) did = true;
      }
    }
    if (!did) break;
  }
}

function plan(s, P, B, objIdx) {
  for (let guard = 0; guard < 20 && s.jobs.length < s.crews; guard++) {
    const cl = s.lv.campfire, nextCF = cl + 1, caps = E.caps(s), surv = s.people.length;
    let order = PRIO.slice();
    const front = (id) => { order = [id].concat(order.filter((x) => x !== id)); };
    const gating = new Set();
    const cfCost = nextCF <= 10 ? E.cost('campfire', nextCF, s) : null;
    // build order (SPEC 10): objective target first; a Storehouse/Bunkhouse that gates the next CL second; then PRIO
    if (cfCost && surv + s.gate.length >= D.BUILDINGS.bunkhouse.beds[s.lv.bunkhouse] && surv < D.BUILDINGS.campfire.survivors[nextCF] + 1) { front('bunkhouse'); gating.add('bunkhouse'); }
    if (cfCost && (cfCost.scrap > caps.scrap * 0.8 || cfCost.food > caps.food * 0.8)) { front('storehouse'); gating.add('storehouse'); }
    const o = D.OBJECTIVES[objIdx], tgt = o && o.target;
    if (tgt && !BLOCKING.has(E.buildCheck(s, tgt).reason)) front(tgt);
    let reserve = null;
    if (cfCost && !s.jobs.some((j) => j.id === 'campfire') && surv >= D.BUILDINGS.campfire.survivors[nextCF]) reserve = cfCost;
    let done = false;
    for (const id of order) {
      const chk = E.buildCheck(s, id);
      if (BLOCKING.has(chk.reason)) continue;
      if (chk.reason === 'storage' || chk.reason === 'bp' || chk.reason === 'crews') continue;
      const c = chk.cost;
      if (reserve && id !== 'campfire' && !gating.has(id) && !P.spender) {
        if ((s.res.scrap - c.scrap < reserve.scrap && c.scrap > 0.25 * reserve.scrap) || (s.res.food - c.food < reserve.food && c.food > 0.25 * reserve.food)) continue;
      }
      if (chk.ok) { if (act(s, { type: 'build', id }).ok) { done = true; break; } continue; }
      if (chk.reason === 'resources' && P.spender) {
        const sf = E.price.shortfall(s, c); if (!sf) continue;
        if (s.res.bat <= sf.price) claimPack(s, B);
        if (s.res.bat >= sf.price && act(s, { type: 'buildNow', id }).ok) { done = true; break; }
      }
    }
    if (!done) break;
  }
}

function crafts(s, P, B) {
  const q = s.craft.infirmary;
  if (s.lv.infirmary >= 1 && q.length < 1) {
    const want = s.lv.radio >= 5 ? 2 : 1;
    // goal chip: objective 11 asks for a crafted medkit
    if (D.OBJECTIVES[s.objective] && D.OBJECTIVES[s.objective].check.flag === 'medkitMade' && s.res.meds >= 20 && s.stock.medkit < D.STOCK_MAX) act(s, { type: 'craft', building: 'infirmary', item: 'medkit' });
    else if (s.stock.medkit < want && s.res.meds >= 20) act(s, { type: 'craft', building: 'infirmary', item: 'medkit' });
    else if (s.stock.pills < want && s.res.meds >= 10) act(s, { type: 'craft', building: 'infirmary', item: 'pills' });
  }
  if (s.lv.workbench >= 3 && s.craft.workbench.length < 1 && s.stock.bomb < 1 && s.res.scrap >= 80 && s.res.meds >= 5) act(s, { type: 'craft', building: 'workbench', item: 'bomb' });
  if (P.skipAll) finishTimers(s, P, B, ['craft']);
  for (const w of ['smg', 'shotgun', 'rifle']) { const W = D.WEAPONS[w]; if (!s.weapons[w] && s.lv.workbench >= W.wb && s.res.bp >= W.bp) act(s, { type: 'unlockWeapon', weapon: w }); }
  if (s.lv.radio >= 1 && !s.recruit && E.freeBeds(s) >= 1 && s.res.food >= D.RECRUIT.foodPer * s.people.length) {
    act(s, { type: 'recruit' }); if (P.skipAll) finishTimers(s, P, B, ['recruit']);
  }
  if (s.crews < 3 && s.lv.campfire >= D.CREW.thirdFromCL && P.buyCrew) {
    if (s.res.bat <= D.CREW.thirdPrice && P.spender) claimPack(s, B);
    if (s.res.bat >= D.CREW.thirdPrice) act(s, { type: 'buyCrew' });
  }
}

function sendParty(s, kind) { act(s, { type: 'sendParty', kind }); }

function doRun(s, B) {
  const runner = s.people.find((p) => p.state === 'home') || s.people[0];
  act(s, { type: 'setLoadout', patch: { primary: bestWeapon(s), use: { medkit: true, pills: true, bomb: true }, runner: runner.id } });
  let best = 'R1', unlocked = 'R1';
  for (const r of D.ROUTES) {
    if (!E.routeUnlocked(s, r.id)) continue;
    unlocked = r.id;
    if (E.odds(s, r.id, { runner: runner.id }, { deltas: false }).odds >= 0.6) best = r.id;
  }
  const L = E.loadoutFor(s, best, { runner: runner.id });
  B.plays++; if (s.lv.infirmary >= 1 && !L.medkit && !L.pills) B.emptyPlays++;
  if (best === unlocked) B.frontier++;
  const st = act(s, { type: 'startRun', routeId: best });
  if (!st.ok) throw new Error('startRun failed: ' + st.err);
  const res = E.runSim(s);
  const rr = act(s, { type: 'resolveRun', result: res });
  if (!rr.ok) throw new Error('resolveRun failed: ' + rr.err);
  act(s, { type: 'openCrate' });
  B.runs++; if (res.result !== 'safe_room') { B.losses++; B.streak++; B.maxStreak = Math.max(B.maxStreak, B.streak); } else B.streak = 0;
  return { route: best, win: res.result === 'safe_room', time: res.time, odds: st.handoff.odds, reward: rr.reward };
}

function snap(s, B) {
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const w = bestWeapon(s);
  return { CL: s.lv.campfire, surv: s.people.length, weap: w, G: E.loadoutFor(s, 'R1', { intel: 0 }).gearBase + E.Run.WEAPON[w].g, frontier: E.frontier(s), runs: B.runs,
    bat: s.res.bat, batEarned: sum(s.tele.bat.earned), batSpent: sum(s.tele.bat.spent), crews: s.crews, bp: s.res.bp, obj: s.objective,
    lv: Object.assign({}, s.lv), packs: B.packs };
}

function runPersona(kind, seed) {
  const P = PERSONAS[kind];
  const s = E.create({ realNow: REAL0, tzOffsetMs: 0, seed });
  const sched = schedule(P.sched);
  const marks = [[3, '3m'], [15, '15m'], [20, '20m'], [60, '1h'], [1440, '1d'], [4320, '3d'], [10080, '7d']];
  const snaps = {};
  const B = { packs: 0, plays: 0, emptyPlays: 0, frontier: 0, runs: 0, losses: 0, streak: 0, maxStreak: 0, sessMin: 0, crewIdleMin: 0, batByMin: [] };
  const dbg = process.env.DBG === kind && String(seed) === String(process.env.SEED || SEEDS[0]);
  let si = 0, inS = false, sEnd = 0, runsLeft = 0, busy = 0;
  for (let min = 0; min <= 10080; min++) {
    const target = min * MIN;
    if (s.campNow < target) E.advance(s, target - s.campNow, { source: 'frame' });
    if (!inS && si < sched.length && min >= sched[si][0] * 60) { inS = true; sEnd = min + sched[si][1]; runsLeft = Math.min(P.runs, sched[si][2]); si++; }
    if (inS) B.sessMin++;
    if (inS && min >= busy) {
      if (min === 0) {                                         // FTUE: light the fire, take the pile, Salvage Yard, finish free
        act(s, { type: 'tapFire' }); act(s, { type: 'takePile' }); act(s, { type: 'build', id: 'salvage' });
        act(s, { type: 'finishFree', target: { kind: 'job', id: 'salvage' } });
      }
      act(s, { type: 'collectAll' });
      const objIdx = s.objective;                              // the goal chip is read once per decision minute
      finishTimers(s, P, B); plan(s, P, B, objIdx); crafts(s, P, B); finishTimers(s, P, B); plan(s, P, B, objIdx);
      if (P.teachSkip && !s.flags.taughtSkip && s.jobs.length && s.res.bat >= 1) {
        const j = s.jobs.find((x) => x.endAt - s.campNow > 30000 && E.price.skip((x.endAt - s.campNow) / 1000, s) <= 3);
        if (j) { act(s, { type: 'skip', target: { kind: 'job', id: j.id }, confirm: true }); finishTimers(s, P, B); plan(s, P, B, objIdx); }
      }
      const gap = si < sched.length ? sched[si][0] * 60 - sEnd : 600;
      if (min >= sEnd - 1) { sendParty(s, gap > 360 ? '8h' : gap > 100 ? '2h' : '30m'); sendParty(s, gap > 360 ? '8h' : '2h'); sendParty(s, '2h'); }
      if (s.jobs.length < s.crews) B.crewIdleMin++;
      let rr = '';
      if (runsLeft > 0 && min < sEnd - 2) {
        const o = doRun(s, B); runsLeft--; busy = min + Math.ceil(o.time / 60) + 1;
        rr = o.route + (o.win ? ' W ' : ' L ') + Math.round(o.odds * 100) + '% +' + o.reward.haul.scrap + 's/' + o.reward.haul.food + 'f/' + o.reward.haul.meds + 'm';
      }
      if (dbg && min <= +(process.env.UNTIL || 90)) {
        console.log(String(min).padStart(5), 'CL' + s.lv.campfire, 'S' + s.res.scrap, 'F' + s.res.food, 'M' + s.res.meds, 'bat' + s.res.bat, 'bp' + s.res.bp, 'sv' + s.people.length,
          'jobs:' + s.jobs.map((j) => j.id + j.toLv + '(' + Math.round((j.endAt - s.campNow) / 60000) + 'm)').join(','), rr, 'obj' + s.objective, 'stock' + s.stock.medkit + s.stock.pills + s.stock.bomb);
      }
      if (min >= sEnd) inS = false;
    } else if (inS && min >= sEnd && min >= busy) inS = false;
    for (const [mk, label] of marks) if (min === mk) snaps[label] = snap(s, B);
    if (min <= 120) B.batByMin[min] = s.res.bat;
  }
  const inc = s.tele.income.all, sc = (k) => (inc[k] ? inc[k].scrap : 0);
  const prod = Object.keys(inc).filter((k) => /^prod:/.test(k)).reduce((a, k) => a + inc[k].scrap, 0);
  const u = s.tele.unlocks, at = (k) => (u[k] ? u[k].camp / MIN : null);
  return {
    kind, seed, s, snaps, batByMin: B.batByMin,
    kpi: {
      crewIdle: B.crewIdleMin / Math.max(1, B.sessMin), lossRate: B.losses / Math.max(1, B.runs), maxStreak: B.maxStreak, frontierShare: B.frontier / Math.max(1, B.plays),
      emptyPlay: B.emptyPlays / Math.max(1, B.plays), truckWaste: Object.values(s.tele.kpi.waste.truck).reduce((a, b) => a + b, 0),
      runShareScrap: sc('run') / Math.max(1, sc('run') + prod + sc('party')), packs: B.packs,
    },
    t: { cl2: at('campfire2'), cl3: at('campfire3'), smg: at('weapon:smg'), crew3: at('crew3'), cl: [2, 3, 4, 5, 6, 7, 8, 9, 10].map((L) => at('campfire' + L)) },
  };
}

module.exports = { runPersona, schedule, PERSONAS, SEEDS };
if (require.main === module) main();
function main() {
// ------------------------------------------------------------------ run + report
const kinds = ['active', 'idle', 'spender'].concat(process.env.ALL ? ['hoarder', 'activeSkips'] : []);
const R = {};
if (process.env.DBG) { runPersona(process.env.DBG, +(process.env.SEED || SEEDS[0])); process.exit(0); }
for (const k of kinds) R[k] = SEEDS.map((sd) => runPersona(k, sd));

const rng = (a) => { const u = [...new Set(a)]; if (u.length === 1) return String(u[0]); return typeof a[0] === 'number' ? Math.min(...a) + '-' + Math.max(...a) : u.join('/'); };
const f2 = (x) => x.toFixed(2);
console.log('Survivor Camp pacing bot · seeds ' + SEEDS.join(', ') + ' · 7 days camp time');
for (const k of kinds) {
  console.log('\n== ' + k);
  for (const mk of ['3m', '15m', '1h', '1d', '3d', '7d']) {
    const v = (f) => rng(R[k].map((r) => f(r.snaps[mk])));
    console.log(mk.padEnd(4), 'CL', v((x) => x.CL).padEnd(5), 'surv', v((x) => x.surv).padEnd(5), 'weap', v((x) => x.weap).padEnd(14), 'G', v((x) => x.G).padEnd(6),
      'frontier', v((x) => x.frontier).padEnd(6), 'runs', v((x) => x.runs).padEnd(7), 'batHeld', v((x) => x.bat).padEnd(9), 'earned', v((x) => x.batEarned).padEnd(10),
      'spent', v((x) => x.batSpent).padEnd(9), 'crews', v((x) => x.crews), 'bp', v((x) => x.bp));
  }
  const kp = R[k].map((r) => r.kpi), tt = R[k].map((r) => r.t);
  console.log('CL reached (h):', [2, 3, 4, 5, 6, 7, 8, 9, 10].map((L, i) => 'CL' + L + ' ' + tt.map((t) => (t.cl[i] == null ? '-' : (t.cl[i] / 60).toFixed(L <= 4 ? 2 : 0))).join(',')).join(' | '));
  console.log('KPI crewIdle', kp.map((x) => f2(x.crewIdle)).join(','), '| lossRate', kp.map((x) => f2(x.lossRate)).join(','), '| maxLossStreak', kp.map((x) => x.maxStreak).join(','),
    '| frontier', kp.map((x) => f2(x.frontierShare)).join(','), '| emptyStock', kp.map((x) => f2(x.emptyPlay)).join(','), '| truckWaste', kp.map((x) => x.truckWaste).join(','),
    '| runShareScrap', kp.map((x) => f2(x.runShareScrap)).join(','), '| SMG min', tt.map((t) => (t.smg == null ? '-' : t.smg.toFixed(0))).join(','),
    '| crew3 h', tt.map((t) => (t.crew3 == null ? '-' : (t.crew3 / 60).toFixed(0))).join(','), k === 'spender' ? '| packs ' + kp.map((x) => x.packs).join(',') : '');
}

// ------------------------------------------------------------------ assertions (SPEC 10); tolerance on time values ±15%
let pass = 0, failN = 0;
function check(name, ok, detail) { if (ok) pass++; else failN++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : '')); }
const TOL = 0.15;
const cls = (k, mk) => R[k].map((r) => r.snaps[mk].CL);
const all = (a, f) => a.every(f);
const count = (a, f) => a.filter(f).length;
console.log('\nAssertions');
const want = {
  active: { '15m': [2], '1h': [3], '1d': [5], '3d': [7] },
  idle: { '15m': [2], '1h': [2], '1d': [4], '3d': [6], '7d': [9] },
  spender: { '3m': [2], '15m': [3], '1h': [3, 4], '1d': [6], '3d': [8], '7d': [10] },
};
// A checkpoint passes strictly when the CL at that minute is the bold value; otherwise it may pass within the ±15%
// time tolerance: the bold CL is held at some moment in [0.85 T, 1.15 T] (the 7-day checkpoint is evaluated exactly).
const MARK_MIN = { '3m': 3, '15m': 15, '1h': 60, '1d': 1440, '3d': 4320, '7d': 10080 };
function heldInWindow(r, cl, T) {
  const at = (L) => (L <= 1 ? 0 : r.t.cl[L - 2]);
  const lo = 0.85 * T, hi = 1.15 * T, start = at(cl), next = cl < 10 ? at(cl + 1) : null;
  return start != null && start <= hi && (next == null || next >= lo);
}
for (const k of Object.keys(want)) for (const mk of Object.keys(want[k])) {
  const a = cls(k, mk), strict = all(a, (x) => want[k][mk].includes(x));
  const tol = mk !== '7d' && R[k].every((r) => want[k][mk].some((cl) => heldInWindow(r, cl, MARK_MIN[mk])));
  check(k + ' CL at ' + mk + ' is ' + want[k][mk].join(' or '), strict || tol, a.join(',') + (strict ? '' : tol ? ' · passes only within the ±15% time tolerance' : ' · fails even within the ±15% time tolerance'));
}
{ const a = cls('active', '7d'); check('active CL >= 9 at 1 week in 5/5 seeds', all(a, (x) => x >= 9), a.join(',')); check('active CL 10 at 1 week in >= 4/5 seeds', count(a, (x) => x === 10) >= 4, a.join(',')); }
for (const mk of ['1h', '1d', '3d', '7d']) {
  const sp = cls('spender', mk), ac = cls('active', mk), id = cls('idle', mk);
  check('spender >= active >= idle at ' + mk + ' (every seed)', SEEDS.every((_, i) => sp[i] >= ac[i] && ac[i] >= id[i]), 'spender ' + sp.join(',') + ' active ' + ac.join(',') + ' idle ' + id.join(','));
}
{ const ac = cls('active', '1d'), id = cls('idle', '1d'); check('active > idle at 1 day in 5/5 seeds', SEEDS.every((_, i) => ac[i] > id[i]), ac.join(',') + ' vs ' + id.join(',')); }
{ const ac = cls('active', '7d'), id = cls('idle', '7d'); check('active > idle at 1 week in >= 4/5 seeds', SEEDS.filter((_, i) => ac[i] > id[i]).length >= 4, ac.join(',') + ' vs ' + id.join(',')); }
{ const a = R.active.map((r) => r.t.smg); check('active SMG by 20 min in 5/5 seeds (±15%)', all(a, (x) => x != null && x <= 20 * (1 + TOL)), a.map((x) => (x == null ? '-' : x.toFixed(1))).join(',')); }
{ const a = R.active.map((r) => r.t.cl3); check('active first CL3 between 15 and 40 min (±15%)', all(a, (x) => x != null && x >= 15 * (1 - TOL) && x <= 40 * (1 + TOL)), a.map((x) => (x == null ? '-' : x.toFixed(1))).join(',')); }
{
  const a = R.active.map((r) => r.snaps['1h'].bat), ok = (x) => x >= 50 && x <= 90, strict = all(a, ok);
  const tol = R.active.every((r) => r.batByMin.slice(51, 70).some(ok));
  check('active batteries held at 1 h in 50-90', strict || tol, a.join(',') + (strict ? '' : tol ? ' · passes only within the ±15% time tolerance' : ''));
}
{ const a = R.active.map((r) => r.snaps['7d'].batEarned); check('active batteries earned per week 550-800', all(a, (x) => x >= 550 && x <= 800), a.join(',')); }
{ const a = R.idle.map((r) => r.snaps['7d'].batEarned); check('idle batteries earned per week 450-650', all(a, (x) => x >= 450 && x <= 650), a.join(',')); }
{ const a = R.active.map((r) => r.kpi.lossRate); check('active loss rate 5-20%', all(a, (x) => x >= 0.05 && x <= 0.20), a.map(f2).join(',')); }
{ const a = R.active.map((r) => r.kpi.frontierShare); check('active frontier share >= 85%', all(a, (x) => x >= 0.85), a.map(f2).join(',')); }
{ const a = R.active.map((r) => r.kpi.emptyPlay); check('active empty-stock plays <= 15%', all(a, (x) => x <= 0.15), a.map(f2).join(',')); }
{ const a = R.active.map((r) => r.kpi.truckWaste); check('active waste (truck overflow) = 0', all(a, (x) => x === 0), a.join(',')); }
for (const k of ['active', 'idle', 'spender']) { const a = R[k].map((r) => r.kpi.crewIdle); check(k + ' crew idle <= 20%', all(a, (x) => x <= 0.20), a.map(f2).join(',')); }
{ const a = R.active.map((r) => r.kpi.runShareScrap); check('active run share of scrap 0.24-0.34', all(a, (x) => x >= 0.24 && x <= 0.34), a.map(f2).join(',')); }
{ const a = R.idle.map((r) => r.kpi.runShareScrap); check('idle run share of scrap 0.08-0.16', all(a, (x) => x >= 0.08 && x <= 0.16), a.map(f2).join(',')); }
const secs = Number(process.hrtime.bigint() - T0) / 1e9;
check('runtime < 30 s', secs < 30, secs.toFixed(1) + ' s');
console.log('\n' + pass + ' passed, ' + failN + ' failed');
process.exit(failN ? 1 : 0);
}
