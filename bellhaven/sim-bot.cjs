#!/usr/bin/env node
'use strict';
/* Bellhaven pacing bot: SPEC 10 (pacing targets), 12.B test 22, 13.1 step 4 and 14 (the economy proof), on the REAL engine.

   It ports the personas, metrics and judgements of the economy reference (sim/ref.cjs) and plays each one on engine.js,
   required as it is and driven only the way a player drives it: act() for every tap, advance() for the frames while the
   city is open, resume() when the player comes back (after load(serialize()), as the browser reloads the save). Reads
   (odds, goal, price, suggestSpot, autoKit, runSim, view) are the calls the UI makes. The reference is the oracle for
   rules and distributions, not for per-seed traces (13.1 step 4): compare medians and ranges over seeds.

     node bellhaven/sim-bot.cjs    the check (about 2 min; exit code 1 on any ✗):
         4 personas (active, idle checker, spender, reckless) x 20 seeds x 7 days: the section-10 pacing tables, the
         Tower times and the weekly KPIs; P4 over 200 one-hour active saves; P10 calibration against the true odds (4,000
         random seeds per model input); P12 random legal play (50 seeds) and the worst case (every persona wiped at
         20 min and on day 2, the same 20 seeds); the 15-minute prototype test (30 seeds) and the run-warp check (14.4,
         10 seeds); then the assertions P1-P14 (+ T15 and W) with ✓ / ✗, the six judgements of 14.6 and the engine
         sanity line (act errors, the clock, reloads, view/goal/kpis on real saves, the same save twice).
     --seeds 1-20 | 1,2,9   --days 7   --personas active,idle,spender,reckless
     --hour-seeds 1-200   --wipe-seeds (default: --seeds)   --soak 50   --soak-steps 2000   --tester-seeds 1-30   --warp-seeds 1-10
     --no-hour --no-cal --no-soak --no-wipe --no-tester --no-warp   skip a part (its rows then show "-", not ✓)
     --trace active:3       the event log of one save (no checks)
     --json <file>          also write the weekly rows, the assertions and the judgements as JSON

   Time model (as ref.cjs): t = 0 is 09:00 on day 1 (realNow = 2026-11-02 09:00 UTC, timezone offset 0, so the daily
   spark's day starts at midnight); the wall clock and the city clock move together. A run takes its game length (Two
   Thumbs Left, about 4-7 min) plus 25 s on the result card; a moment with no run chosen waits 30 s. Each run is the
   prototype's simulated run (GO -> runSim -> resolveRun: the forced first wins and the 400-seed odds are the engine's)
   and the bot turns the Lab's run-warp cap off at the start of each save, because these personas model the real game's
   run length (SPEC 10) and the cap only limits tapping through 8 s run screens (5.1); the 15-minute tester keeps it on.
   The worst case's wipe is a fixture: the people go through Lab kills and SAY GOODBYE, but no action destroys
   resources, so it zeroes bricks, cans, sparks, the bubbles and the Inn on the state (as ref.cjs does). */

const path = require('path'), fs = require('fs');
const E = require(path.join(__dirname, 'engine.js'));
const D = require(path.join(__dirname, 'data.js'));
const Run = require(path.join(__dirname, 'run.js'));
const I = E._internal;

const SEC = 1000, MIN = 60000, H = 3600000, DAY = 86400000;
const REAL0 = Date.UTC(2026, 10, 2, 9, 0, 0);             // 09:00 on day 1 (timezone offset 0: the daily spark's day starts at midnight)
const RUN_TAIL = 25 * SEC, WAIT = 30 * SEC;               // the result card after a run; a wait with no run chosen
const B = D.BUILDINGS, EXP = D.EXPAND, GOALS = D.GOALS, DESTS = D.DESTS, RULES = D.RULES;
const TYPES = D.TYPES.filter((t) => t !== 'tower');
const DEST = {}; DESTS.forEach((d) => { DEST[d.id] = d; });
const FREE_WEEK = 275;                                     // a free week of sparks (14.6, P14)

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; return v != null && !v.startsWith('--') ? v : true; };
const list = (v) => String(v).split(',').flatMap((x) => { const m = x.match(/^(\d+)-(\d+)$/); return m ? Array.from({ length: +m[2] - +m[1] + 1 }, (_, i) => +m[1] + i) : [+x]; });

// ============================================================================ PERSONAS (SPEC 10, ref.cjs)
const PERSONAS = {
  active:   { key: 'active', label: 'Active', sched: 'active', minHome: 0.72, maxDeath: 0.09, spread: 0.3, saveMs: 6 * H, inviteReserve: 100, teachSkip: true, crane4: true, lastResortSparks: true, reviveH: 8 },
  idle:     { key: 'idle', label: 'Idle checker', sched: 'idle', minHome: 0.72, maxDeath: 0.09, spread: 0.3, saveMs: 1 * H, inviteReserve: 100, teachSkip: true, crane4: true, lastResortSparks: true, reviveH: 8 },
  spender:  { key: 'spender', label: 'Spender', sched: 'active', minHome: 0.72, maxDeath: 0.09, spread: 0, saveMs: 6 * H, inviteReserve: 100, packs: true, skipJobs: true, skipRest: true, reviveSparks: true, crane4: true },
  reckless: { key: 'reckless', label: 'Reckless', sched: 'active', reckless: true, saveMs: 6 * H, inviteReserve: 100, teachSkip: true, crane4: true, lastResortSparks: true, reviveH: 8 },
  // the 15-minute prototype tester (SPEC 10, 14.4): 8 s run screens, a GO about every 60 s, the Lab's run-warp cap on
  tester:   { key: 'tester', label: '15-min tester', sched: 'tester', minHome: 0.72, maxDeath: 0.09, spread: 0.3, saveMs: 6 * H, inviteReserve: 0, teachSkip: true, crane4: true, runWall: 60 * SEC, runWarp: 6, testLen: 15 * MIN },
};
const RUN_SCREEN = 8 * SEC;                               // the simulated run screen (8.7.2; Lab 3 / 8 / 20 s)
// Sessions in wall time: [start, end] ms after 09:00 on day 1 (SPEC 10).
function sessions(kind, horizon, testLen) {
  const S = [], at = (day, hour, len) => { const a = day * DAY + Math.round((hour - 9) * H); if (a < horizon) S.push([a, Math.min(horizon, a + len)]); };
  if (kind === 'active') { S.push([0, Math.min(horizon, H)]); for (const h of [13, 16, 19, 22]) at(0, h, 20 * MIN); for (let d = 1; d <= 8; d++) for (const h of [7.5, 10, 12.5, 15, 17.5, 20, 22.5]) at(d, h, 20 * MIN); }
  else if (kind === 'idle') { S.push([0, Math.min(horizon, 10 * MIN)]); for (const h of [12, 15, 18, 21]) at(0, h, 3 * MIN); for (let d = 1; d <= 8; d++) for (const h of [8, 11, 14, 17, 20, 23]) at(d, h, 3 * MIN); }
  else if (kind === 'tester') S.push([0, Math.min(horizon, testLen || 15 * MIN)]);
  return S;
}

// ============================================================================ reads of the engine state (the same values the UI shows)
const towerOf = (s) => s.buildings.find((x) => x.type === 'tower');
const towerLv = (s) => I.towerLv(s);
const jobFor = (s, id) => s.jobs.find((j) => j.target === id) || null;
const ofType = (s, t) => s.buildings.filter((x) => x.type === t);
const maxLv = (s, t) => ofType(s, t).reduce((m, x) => Math.max(m, x.lv), 0);
const allowed = (s, t) => { let n = 0; for (const [tw, c] of B[t].count) if (towerLv(s) >= tw) n = c; return n; };
const living = (s) => I.living(s), present = (s) => I.present(s);
const atHome = (s) => s.people.filter((p) => p.state === 'ready' || p.state === 'rest');
const openDests = (s) => DESTS.filter((d) => I.destOpen(s, d));
const cap = (s, k) => I.capOf(s, k), rate = (s, k) => I.rateOf(s, k);   // rate per hour
const cranesTotal = (s) => E.cranes(s).total;
const goalKey = (s) => (s.goal < GOALS.length ? GOALS[s.goal][0] : 'done');
const hpFrac = (s, p) => I.startHpFrac(s, p);
const skipPrice = (ms, s) => E.price.skip(ms / SEC, s);
const sumObj = (o) => Object.keys(o || {}).reduce((a, k) => a + o[k], 0);
const reviveCansRaw = (lv, n) => (RULES.reviveCansA * lv * lv + RULES.reviveCansB) * Math.pow(2, Math.min(n, RULES.escalationCap));
const expandCost = (s) => Math.round(EXP.cost[s.ring + 1] * s.lab.mul.cost);
const expandMs = (s) => Math.round(EXP.time[s.ring + 1] * SEC * s.lab.mul.time);
const clearCost = (s, ring) => Math.round(EXP.clear[ring] * s.lab.mul.cost);
const spotFor = (s, type) => E.suggestSpot(s, type, 12, 12);   // a sensible player: the free spot nearest the land's centre

// Every job that could start now if paid for, in ref.cjs's order (the Tower, the land, then each type: build, upgrades).
function cands(s) {
  const c = [], T = towerLv(s), tw = towerOf(s);
  if (T < 10 && !jobFor(s, tw.id)) c.push({ kind: 'tower', type: 'tower', id: tw.id, lv: T, cur: 'bricks', cost: E.cost(s, 'tower', T + 1).n, time: E.jobMs(s, 'tower', T + 1) });
  if (s.ring < EXP.maxRing && T >= EXP.tower[s.ring + 1] && !s.jobs.some((j) => j.kind === 'expand')) c.push({ kind: 'expand', type: null, id: null, lv: s.ring, cur: 'bricks', cost: expandCost(s), time: expandMs(s) });
  for (const t of TYPES) {
    const L = ofType(s, t);
    if (L.length < allowed(s, t)) c.push({ kind: 'build', type: t, id: null, lv: 0, cur: B[t].cur, cost: E.cost(s, t, 1).n, time: E.jobMs(s, t, 1) });
    for (const o of L) if (o.lv >= 1 && o.lv < B[t].max && o.lv + 1 <= T && !jobFor(s, o.id)) c.push({ kind: 'upgrade', type: t, id: o.id, lv: o.lv, cur: B[t].cur, cost: E.cost(s, t, o.lv + 1).n, time: E.jobMs(s, t, o.lv + 1) });
  }
  return c;
}
function hasWork(s) {                                     // anything left to build, upgrade or expand at this Tower level
  const T = towerLv(s);
  if (T < 10 && !jobFor(s, towerOf(s).id)) return true;
  if (s.ring < EXP.maxRing && T >= EXP.tower[s.ring + 1] && !s.jobs.some((j) => j.kind === 'expand')) return true;
  for (const t of TYPES) { const L = ofType(s, t); if (L.length < allowed(s, t)) return true; for (const o of L) if (o.lv >= 1 && o.lv < B[t].max && o.lv + 1 <= T && !jobFor(s, o.id)) return true; }
  return false;
}
const complete = (s) => towerLv(s) >= 10 && !s.jobs.length && !hasWork(s);
function freeTiles(s) {                                    // free land tiles (the gate excluded)
  const G = D.START.world, occ = new Uint8Array(G * G), lo = 8 - s.ring, hi = 16 + s.ring;
  const mark = (x, y, w) => { for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) if (x + i >= 0 && x + i < G && y + j >= 0 && y + j < G) occ[(y + j) * G + x + i] = 1; };
  for (const o of s.buildings) mark(o.gx, o.gy, B[o.type].w);
  for (const r of s.rubble) mark(r.gx, r.gy, 1);
  for (const g of s.graves) if (g.gx != null) mark(g.gx, g.gy, 1);
  for (const d of s.decor) mark(d.gx, d.gy, 1);
  let n = 0;
  for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) if (!occ[y * G + x] && !(x === 15 + s.ring && D.START.gateGy.includes(y))) n++;
  return n;
}
// The goal chip within reach (SPEC 7.2, 10 P13, ref.cjs): affordable now, production or 1-3 runs of the best open place
// cover the shortfall within 3 h, the step's job is running, or else an affordable side task (any non-Tower job).
function goalWithinReach(s) {
  if (s.goal >= GOALS.length) return true;
  const g = GOALS[s.goal][0].split(':'), T = towerLv(s), best = openDests(s).pop();
  const prodEta = (cur, cost) => {
    if (cost > cap(s, cur)) return Infinity;                                   // needs a bigger Depot first (the side task)
    const short = cost - s.res[cur]; if (short <= 0) return 0;
    if (short <= 3 * (cur === 'bricks' ? best.bricks : best.cans)) return 0;   // about 1-3 runs
    return short / Math.max(1e-9, rate(s, cur) / H);
  };
  let eta = Infinity;
  if (g[0] === 'tower') eta = jobFor(s, towerOf(s).id) ? 0 : prodEta('bricks', E.cost(s, 'tower', T + 1).n);
  else if (g[0] === 'build' || g[0] === 'count') {
    const t = g[1], L = ofType(s, t);
    if (s.jobs.some((j) => j.target && L.some((o) => o.id === j.target))) eta = 0;
    else if (g[0] === 'count' ? L.length < allowed(s, t) : (L.length ? L.some((o) => o.lv + 1 <= T && o.lv < B[t].max) : allowed(s, t) > 0)) {
      const o = L.filter((x) => x.lv > 0).sort((a, b) => b.lv - a.lv)[0];
      eta = prodEta(B[t].cur, g[0] === 'count' || !o ? E.cost(s, t, 1).n : E.cost(s, t, o.lv + 1).n);
    }
  } else if (g[0] === 'expand') eta = s.jobs.some((j) => j.kind === 'expand') || s.ring >= EXP.maxRing ? 0 : prodEta('bricks', expandCost(s));
  else if (g[0] === 'win') eta = I.destOpen(s, DEST[g[1]]) ? 0 : Infinity;
  else if (g[0] === 'people') eta = E.beds(s) > living(s).length ? 0 : Infinity;
  else if (g[0] === 'skip') {
    const fr = s.lab.freeSec * SEC;
    eta = s.jobs.some((j) => j.endMs - s.cityMs > fr) || s.people.some((p) => p.state === 'rest' && p.restUntilMs - s.cityMs > fr) || (s.inn.nextRefreshMs != null && s.inn.nextRefreshMs - s.cityMs > fr) ? 0 : Infinity;
  }
  if (eta <= 3 * H) return true;
  return cands(s).some((x) => x.kind !== 'tower' && x.cost <= s.res[x.cur]);
}

// ============================================================================ THE BOT: one save
function newBot(P, seed, horizon, opts) {
  const s = E.create({ realNow: REAL0, tzOffsetMin: 0, seed });
  const b = { P, seed, s, wall: 0, horizon, opts: opts || {}, noPay: false, online: false,
    m: { online: 0, nothing: 0, noReach: 0, noReachRun: 0, noReachMax: 0, noReachBy: {}, storageWall: 0, sessions: [], lastEnds: 0,
      checks: [3 * MIN, 15 * MIN, H, DAY, 7 * DAY].filter((c) => c <= horizon), snaps: [], runLog: [], downInfo: [], byeNew: 0, byeDear: 0,
      crane4At: null, completeAt: null, idleRunMs: 0, skipSp: 0, skipSec: 0, errors: [], clockDrift: 0, prices: 0, priceBad: [], priceInfo: [],
      deathRule: [], sparkBuys: [], maxDeathShown: 0, wipe: null, perDest: {}, overflowB: 0, towerWall: {}, strangerWall: null, t4skip: null,
      reloads: 0, reloadBad: [], smokeBad: [] } };
  if (P.runWall != null) b.m.checks = [];                 // the tester: wall and city clocks differ (the run warp); no snapshots
  // The four personas play Two Thumbs Left's run length: the clock moves by the whole run (header). The tester keeps the
  // prototype's cap (the Lab default, 6) or turns it off for the warp check's uncapped rows.
  act(b, { type: 'dev', op: 'runWarp', value: P.runWall != null ? P.runWarp : 0 });
  return b;
}
const now = (b) => REAL0 + b.wall;
function log(b, msg) { if (b.opts.trace) { const s = b.s; console.log(`${fmtT(b.wall / SEC).padStart(7)} T${towerLv(s)} B${s.res.bricks} C${s.res.cans} S${s.res.sparks} | ${msg}`); } }
// Every state change goes through act(). An error is a mismatch between the bot and the engine: recorded and reported.
function act(b, a) {
  const s = b.s, r0 = { bricks: s.res.bricks, cans: s.res.cans, sparks: s.res.sparks }, ob = s.tel.overflowBricks;
  const r = E.act(s, a, now(b));
  if (!r.ok) { if (b.m.errors.length < 20) b.m.errors.push(a.type + (a.op ? ':' + a.op : '') + ' -> ' + r.err + ' ' + JSON.stringify(r.data || {}).slice(0, 120)); return r; }
  seen(b, r.events);
  if (s.tel.overflowBricks > ob && hasWork(s)) b.m.overflowB += s.tel.overflowBricks - ob;   // bricks lost to the cap before content ends
  // P8: sparks never buy bricks or cans. In an act that spent sparks (or claimed a pack), the only bricks and cans that
  // may arrive are goal rewards completed by it (a finished job can complete a goal step).
  if (s.res.sparks < r0.sparks || a.type === 'claimPack') {
    let gb = 0, gc = 0; for (const e of r.events) if (e.type === 'goal' && e.reward) { gb += e.reward.bricks || 0; gc += e.reward.cans || 0; }
    if (s.res.bricks - r0.bricks > gb || s.res.cans - r0.cans > gc) b.m.sparkBuys.push(a.type + ': +' + (s.res.bricks - r0.bricks) + ' bricks, +' + (s.res.cans - r0.cans) + ' cans');
  }
  return r;
}
// Wall times of what the tester measures (the city clock runs ahead of the wall under the run warp).
function seen(b, events) {
  for (const e of events) {
    if (e.type === 'towerUp' && b.m.towerWall[e.lv] == null) b.m.towerWall[e.lv] = b.wall;
    else if (e.type === 'stranger' && b.m.strangerWall == null) b.m.strangerWall = b.wall;
  }
}
// P11: every price that appears is at most 80 % of its cap at that moment. Builds, upgrades, the land and rubble: the
// highest cap the player can have at the current Tower level (the data rule, 3.4, checked live); invites, kit and
// revives (cans): the can cap the city has right now. Also counted (information only): a build price paid above 80 % of
// the city's own cap at that moment (a player who has not raised the Depots yet; the C2 chip says "needs a bigger Depot").
function checkPrice(b, what, n, cur, live) {
  const s = b.s; b.m.prices++;
  const c = live ? cap(s, cur) : D.maxCapAt(towerLv(s), cur, s.lab.mul.cost);
  if (n > 0.8 * c + 1e-9 && b.m.priceBad.length < 20) b.m.priceBad.push(`${what}: ${n} ${cur} > 80 % of ${c} at Tower ${towerLv(s)}`);
}
// ---------------------------------------------------------------------------- time
function snapTake(b, st, at) {
  const L = living(st), lv = L.map((p) => p.lv), t = st.tel, cm = t.craneMs || 0;
  b.m.snaps.push({ t: at, tower: towerLv(st), nb: st.buildings.filter((o) => o.type !== 'tower' && o.lv > 0).length,
    sumLv: st.buildings.reduce((a, o) => a + (o.type === 'tower' ? 0 : o.lv), 0), land: 8 + 2 * st.ring, people: L.length,
    topLv: lv.length ? Math.max(...lv) : 0, runs: t.runs, wins: t.wins, downs: t.downs, revC: t.revivesCans, revS: t.revivesSparks,
    graves: st.graves.length, spIn: sumObj(t.sparksIn), spOut: sumObj(t.sparksOut), packs: t.packs, sparks: st.res.sparks,
    idle: cm ? (t.idleOnMs + t.idleOffMs + t.idleGatedMs) / cm : 0, idleOn: cm ? (t.idleOnMs + b.m.idleRunMs) / cm : 0,
    idleOff: cm ? (t.idleOffMs - b.m.idleRunMs) / cm : 0, idleGated: cm ? t.idleGatedMs / cm : 0,
    nothing: b.m.online ? b.m.nothing / b.m.online : 0, noReach: b.m.online ? b.m.noReach / b.m.online : 0 });
}
// Pass time to `to` (wall ms): frames while the city is open, or away (resume() credits the gap when the player is back).
// Snapshots (3 min, 15 min, 1 h, 1 day, 1 week) are taken at the exact checkpoint times.
function pass(b, to, away) {
  while (b.wall < to) {
    const cp = b.m.checks.length && b.m.checks[0] <= to ? b.m.checks[0] : null, stop = cp != null ? Math.max(cp, b.wall) : to, ms = stop - b.wall;
    if (ms > 0) {
      if (away && ms > RULES.offlineMinS * SEC) {
        if (b.s.realLast !== now(b)) act(b, { type: 'setLastDest', destId: b.s.lastDest });   // the last tap before leaving
        b.wall = stop; seen(b, E.resume(b.s, now(b)).events);
      } else { b.wall = stop; seen(b, E.advance(b.s, ms, { source: away ? 'offline' : 'frame' })); }
    }
    if (cp != null && b.wall >= cp) { b.m.checks.shift(); snapTake(b, b.s, cp); }
  }
  if (b.P.runWall == null && b.s.cityMs !== b.wall) b.m.clockDrift++;
}
const frames = (b, ms) => pass(b, b.wall + Math.max(0, Math.round(ms)), false);
// ---------------------------------------------------------------------------- the persona's decisions (ref.cjs)
function collectAll(b) {
  const s = b.s;
  for (const o of s.buildings) {
    if ((o.type !== 'kiln' && o.type !== 'cannery') || o.lv < 1) continue;
    const k = o.type === 'kiln' ? 'bricks' : 'cans', v = E.bubble(s, o.id);
    if (v && Math.floor(Math.min(v.amount, Math.max(0, cap(s, k) - s.res[k]))) > 0) act(b, { type: 'collect', id: o.id });
  }
}
function finishJob(b, j) {
  const s = b.s, left = j.endMs - s.cityMs, pr = skipPrice(left, s);
  const r = act(b, { type: 'finish', jobId: j.id, confirm: true });
  if (r.ok && pr > 0) { b.m.skipSp += pr; b.m.skipSec += left / SEC; log(b, `finish ${j.kind} with ${pr} sparks (${fmtT(left / SEC)} left)`); }
  return r.ok;
}
function chooseJob(b) {
  const s = b.s, P = b.P, c = cands(s); if (!c.length) return null;
  const g = goalKey(s).split(':'), bedsNeeded = living(s).length + 1 >= E.beds(s), free = freeTiles(s), capB = cap(s, 'bricks');
  const tw = c.find((x) => x.kind === 'tower');
  const pri = { kiln: 3, armory: 3.1, cannery: 3.2, clinic: 3.6, depot: 4, inn: 5, house: 6 };
  for (const x of c) {
    if (x.kind === 'tower') x.pri = 0;
    else if (x.kind === 'expand') x.pri = free < 14 ? 1 : 6;
    else if (x.kind === 'build') x.pri = x.type === 'house' ? (bedsNeeded ? 1 : 5) : { kiln: 1.2, cannery: 1.2, armory: 1.3, clinic: 1.3, depot: 1.4, inn: 1.5 }[x.type];
    else {
      x.pri = pri[x.type] + x.lv * 0.15;
      if (x.type === 'depot' && tw && tw.cost > 0.8 * capB) x.pri = 0.5;     // raise a Depot when the next Tower nears the cap
      if (x.type === 'house' && bedsNeeded) x.pri = 2;
    }
    if ((g[0] === 'build' || g[0] === 'count') && x.type === g[1] && x.kind !== 'tower') x.pri = 0.8;
    if (g[0] === 'tower' && x.kind === 'tower') x.pri = 0;
    if (g[0] === 'expand' && x.kind === 'expand') x.pri = 0.8;
  }
  let spot; const hasSpot = () => (spot === undefined ? (spot = !!spotFor(s, 'kiln')) : spot);
  const gx = c.filter((x) => x.pri === 0.8 && x.cost <= s.res[x.cur] && (x.kind !== 'build' || hasSpot())).sort((a, b2) => a.cost - b2.cost)[0];
  if (gx) return gx;                                                       // follow the goal chip
  if (tw && tw.cost <= s.res.bricks) return tw;
  const br = rate(s, 'bricks') / H, towerEta = tw ? Math.max(0, tw.cost - s.res.bricks) / Math.max(1e-12, br) : Infinity;
  const ok = c.filter((x) => x.kind !== 'tower' && x.cost <= s.res[x.cur] && (x.kind !== 'build' || hasSpot())
    && (x.cur !== 'bricks' || !tw || towerEta > P.saveMs || x.pri <= 1.5 || s.res.bricks - x.cost >= tw.cost));
  ok.sort((a, b2) => a.pri - b2.pri || a.cost - b2.cost);
  return ok[0] || null;
}
function startJob(b, x) {
  const s = b.s, P = b.P; let r;
  if (x.kind === 'build') { const sp = spotFor(s, x.type); if (!sp) return false; r = act(b, { type: 'place', kind: x.type, gx: sp.gx, gy: sp.gy }); }
  else if (x.kind === 'expand') r = act(b, { type: 'expand' });
  else r = act(b, { type: 'upgrade', id: x.id });
  if (!r.ok) return false;
  log(b, `start ${x.kind} ${x.type || ''}${x.kind === 'upgrade' || x.kind === 'tower' ? ' L' + (x.lv + 1) : ''} (${x.cost} ${x.cur}, ${fmtT(x.time / SEC)})`);
  if (x.kind === 'tower' && x.lv === 3 && b.m.t4skip == null) b.m.t4skip = [skipPrice(x.time, s), s.res.sparks];   // 10: the Tower 4 timer's skip
  const j = s.jobs.find((q) => q.id === r.data.jobId);
  if (j) {
    if (j.endMs - s.cityMs <= s.lab.freeSec * SEC) finishJob(b, j);
    else if (P.skipJobs && !b.noPay && s.res.sparks >= skipPrice(j.endMs - s.cityMs, s)) finishJob(b, j);
  }
  return true;
}
function clearRubble(b, need) {                              // clear when rich (6 x the price) or when a building has no room
  const s = b.s;
  const order = s.rubble.slice().sort((a, c) => EXP.clear[a.ring] - EXP.clear[c.ring] || ((a.gx - 12) ** 2 + (a.gy - 12) ** 2) - ((c.gx - 12) ** 2 + (c.gy - 12) ** 2));
  for (const r of order) {
    const price = clearCost(s, r.ring);
    if (!(s.res.bricks >= 6 * price || (need && s.res.bricks >= price))) continue;
    checkPrice(b, 'rubble', price, 'bricks', false);
    act(b, { type: 'clearRubble', id: r.id });
    if (need && spotFor(s, 'kiln')) return;
  }
}
function revive(b, p, pay) { const r = act(b, { type: 'revive', personId: p.id, pay }); if (r.ok) log(b, `revive ${p.first} L${p.lv} with ${pay} (${r.data.price})`); return r.ok; }
function goodbye(b, p, why) { const r = act(b, { type: 'goodbye', personId: p.id }); if (r.ok) log(b, `goodbye ${p.first} L${p.lv} (${why})`); return r.ok; }
function handleDowns(b) {
  const s = b.s, P = b.P;
  for (const p of s.people.slice()) {
    if (p.state !== 'down') continue;
    const pr = E.price.revive(s, p.id);
    if (pr.stranger) {
      if (P.reviveSparks && !b.noPay && s.res.sparks >= pr.sparks) revive(b, p, 'sparks');
      else if (s.res.cans >= pr.cans) revive(b, p, 'cans');
      continue;
    }
    checkPrice(b, 'revive', pr.cans, 'cans', true);
    if (P.reviveSparks && !b.noPay && s.res.sparks >= pr.sparks) { revive(b, p, 'sparks'); continue; }
    const waiting = maxLv(s, 'inn') >= 1 && s.inn.travelers.length > 0;
    if (p.lv <= 2 && waiting) { b.m.byeNew++; goodbye(b, p, 'a new face waits at the Inn'); continue; }
    if (P.reviveH && pr.cans > P.reviveH * rate(s, 'cans')) { b.m.byeDear++; goodbye(b, p, 'too dear'); continue; }
    if (s.res.cans >= pr.cans) { revive(b, p, 'cans'); continue; }
    if (!b.noPay && P.lastResortSparks && p.lv >= 4 && p.downUntilMs - s.cityMs < 3 * H && s.res.sparks >= pr.sparks) revive(b, p, 'sparks');
  }
}
function invites(b) {
  const s = b.s, P = b.P;
  if (maxLv(s, 'inn') < 1) return;
  for (let guard = 0; guard < 12; guard++) {
    if (living(s).length >= E.beds(s)) return;
    const t = s.inn.travelers.slice().sort((a, c) => c.lv - a.lv)[0];
    if (!t) return;
    const price = E.price.invite(s);
    if (price > s.res.cans - P.inviteReserve) return;
    checkPrice(b, 'invite', price, 'cans', true);
    const r = act(b, { type: 'invite', travelerId: t.id });
    if (!r.ok) return;
    log(b, `invite ${t.first} L${t.lv} ${t.role}/${t.trait} (${price} cans)`);
  }
}
function decide(b) {
  const s = b.s, P = b.P;
  if (P.packs && !b.noPay && s.res.sparks < 100) act(b, { type: 'claimPack', size: 500 });
  collectAll(b);
  for (const j of s.jobs.slice()) {
    if (!s.jobs.includes(j)) continue;
    const left = j.endMs - s.cityMs, pr = skipPrice(left, s);
    if (left <= s.lab.freeSec * SEC) finishJob(b, j);
    else if (P.skipJobs && !b.noPay && s.res.sparks >= pr) finishJob(b, j);
    else if (P.teachSkip && !b.noPay && goalKey(s) === 'skip' && s.res.sparks >= pr) finishJob(b, j);   // the teach-skip goal (7.2 step 14)
  }
  handleDowns(b);
  if (!s.crane4 && !b.noPay && P.crane4 && towerLv(s) >= RULES.crane4Tower && s.res.sparks >= RULES.crane4 + (P.packs ? 0 : 20)) {
    if (act(b, { type: 'buyCrane' }).ok) { b.m.crane4At = b.wall; log(b, '4th crane'); }
  }
  // P11: every price on offer at this moment (the tray, the building sheets, the land)
  for (const x of cands(s)) checkPrice(b, x.kind + ' ' + (x.type || 'land'), x.cost, x.cur, false);
  for (let guard = 0; guard < 3; guard++) {
    let started = 0;
    while (s.jobs.length < cranesTotal(s)) {
      const x = chooseJob(b), c0 = x ? cap(s, x.cur) : 0;
      if (!x || !startJob(b, x)) break;
      started++; if (x.cost > 0.8 * c0) b.m.priceInfo.push((x.type || 'land') + ' L' + (x.lv + 1));
    }
    const wantRoom = s.jobs.length < cranesTotal(s) && cands(s).some((x) => x.kind === 'build' && x.cost <= s.res[x.cur]) && !spotFor(s, 'kiln');
    clearRubble(b, wantRoom);
    if (!started && !wantRoom) break;
  }
  invites(b);
}
// ---------------------------------------------------------------------------- runs
function chooseRun(b) {
  const s = b.s, P = b.P;
  if (P.skipRest && !b.noPay) for (const p of s.people) if (p.state === 'rest') {
    const left = p.restUntilMs - s.cityMs, pr = skipPrice(left, s);
    if (s.res.sparks >= pr && act(b, { type: 'restNow', personId: p.id, confirm: true }).ok && pr) { b.m.skipSp += pr; b.m.skipSec += left / SEC; }
  }
  const home = atHome(s); if (!home.length || s.pending) return null;
  const dests = openDests(s);
  if (P.reckless) {                    // always the most dangerous open destination, the best odds among everyone at home
    const d = dests[dests.length - 1], kit = E.autoKit(s, d.id); let best = null;
    for (const p of home) { const o = E.odds(s, d.id, p.id, kit); if (!best || o.home > best.o.home + 1e-9 || (Math.abs(o.home - best.o.home) < 1e-9 && p.state === 'ready' && best.p.state !== 'ready')) best = { p, d, kit, o }; }
    return best;
  }
  const g = goalKey(s).split(':'), goalD = g[0] === 'win' && I.destOpen(s, DEST[g[1]]) ? DEST[g[1]] : null;
  for (const set of [home.filter((p) => p.state === 'ready'), home.filter((p) => p.state === 'rest')]) {
    if (!set.length) continue;
    if (goalD) { const r = pickRun(b, set, [goalD]); if (r) return r; }
    const r = pickRun(b, set, dests); if (r) return r;
  }
  return null;
}
function pickRun(b, set, dests) {
  const s = b.s, P = b.P; let best = null; const all = [];
  for (const d of dests) {
    const kit = E.autoKit(s, d.id);
    for (const p of set) {
      const o = E.odds(s, d.id, p.id, kit);
      if (o.death > P.maxDeath + 1e-12 || o.home < (o.death === 0 ? 0.5 : P.minHome)) continue;
      const v = o.home * (d.bricks + 1.5 * d.cans) - o.death * reviveCansRaw(p.lv, p.revives) - p.lv * 0.01 - (1 - hpFrac(s, p)) * 50;
      const c = { p, d, kit, o, v }; all.push(c); if (!best || v > best.v) best = c;
    }
  }
  if (best && P.spread > 0) { const ok = all.filter((x) => x.v >= best.v * (1 - P.spread)); ok.sort((a, c) => a.p.lv - c.p.lv || c.v - a.v); return ok[0]; }
  return best;
}
// GO -> the run (its game length in real time) -> the result -> 25 s on the result card.
function doRun(b, ch) {
  const s = b.s, d = ch.d, p = ch.p, kit = { medkit: ch.kit.medkit, pills: ch.kit.pills, bomb: ch.kit.bomb }, tired = hpFrac(s, p) < 1;
  const go = act(b, { type: 'startRun', destId: d.id, personId: p.id, kit, confirmLow: true });
  if (!go.ok) return false;
  const pe = s.pending, od = pe.odds;
  if ((d.id === 'D1' || !s.flags.deathOn) && od.death !== 0) b.m.deathRule.push(`GO at ${d.id} with Death ${od.death} (deathOn ${s.flags.deathOn})`);   // P12
  checkPrice(b, 'kit', pe.held, 'cans', true);
  if (od.death > b.m.maxDeathShown) b.m.maxDeathShown = od.death;
  const pd = b.m.perDest[d.id] || (b.m.perDest[d.id] = { runs: 0, wins: 0, downs: 0, death: 0, tired: 0 });
  pd.runs++; pd.death += od.death; if (tired) pd.tired++;
  const rl = { d: d.id, L: pe.L, hm: pe.dest.hordeMul, shown: od.home, forced: pe.forcedFirst ? 1 : 0, win: 0 };
  b.m.runLog.push(rl);
  // The run: Two Thumbs Left's game length in real time, or for the tester the 8 s run screen (the clock waits for the
  // result, then moves by min(result.time, the run-warp allowance): 5.1).
  const res = E.runSim(s), tester = b.P.runWall != null, ms = tester ? RUN_SCREEN : res.time * SEC;
  // the city waits for the result (a pending simulated run): a checkpoint inside the run is taken on a copy advanced to it
  while (b.m.checks.length && b.m.checks[0] <= b.wall + ms) {
    const cp = b.m.checks.shift(), c = JSON.parse(JSON.stringify(s));
    E.advance(c, cp - c.cityMs, { source: 'run' }); snapTake(b, c, cp);
  }
  b.wall += ms;
  const idle0 = s.tel.idleOffMs;
  const r = act(b, { type: 'resolveRun', source: 'sim' });
  if (!r.ok) return true;
  if (b.online) b.m.idleRunMs += s.tel.idleOffMs - idle0;     // crane time idle during a run counts as online (ref.cjs)
  if (!tester && s.cityMs !== b.wall) b.m.clockDrift++;
  b.m.warpCut = (b.m.warpCut || 0) + res.time * SEC - r.data.reward.clockMs;
  const out = r.data.outcome; rl.win = out === 'win' ? 1 : 0;
  if (out === 'win') pd.wins++;
  if (out === 'down') {
    pd.downs++;
    const pr = E.price.revive(s, p.id);
    b.m.downInfo.push({ t: b.wall, lv: p.lv, n: pr.n, cans: pr.cans, sparks: pr.sparks, held: s.res.cans, capC: cap(s, 'cans'), rateC: rate(s, 'cans'), d: d.id });
    checkPrice(b, 'revive', pr.cans, 'cans', true);
  }
  log(b, `run ${d.id} ${p.first} L${p.lv} ${p.role}/${p.trait} home ${(100 * od.home).toFixed(0)}% death ${(100 * od.death).toFixed(1)}% -> ${out.toUpperCase()}${r.data.reward.nickname ? ' (' + r.data.reward.nickName + ')' : ''}`);
  frames(b, tester ? b.P.runWall - RUN_SCREEN : RUN_TAIL);
  return true;
}
// ---------------------------------------------------------------------------- the worst case (P12, 14.5)
function wipe(b) {
  const s = b.s, front = openDests(s).pop().id, L = living(s);
  b.m.wipe = { at: b.wall, tower: towerLv(s), front, people: L.length, top: Math.max(...L.map((p) => p.lv)), firstRun: null, back3: null, backFront: null, runs0: s.tel.runs, spOut0: sumObj(s.tel.sparksOut), packs0: s.tel.packs };
  for (const p of s.people.slice()) {
    if (p.state === 'fallen') continue;
    if (p.state !== 'down') act(b, { type: 'dev', op: 'kill', personId: p.id });
    act(b, { type: 'goodbye', personId: p.id });
  }
  s.res.bricks = 0; s.res.cans = 0; s.res.sparks = 0;           // the fixture (header): no action destroys resources
  for (const o of s.buildings) if (o.type === 'kiln' || o.type === 'cannery') { o.bubbleBase = 0; o.bubbleSinceMs = s.cityMs; }
  s.inn.travelers = [];
  b.noPay = true;
  log(b, 'WIPE: everyone gone, 0 bricks, 0 cans, 0 sparks');
}
function wipeProbe(b) {
  const w = b.m.wipe, s = b.s; if (!w) return;
  const t = b.wall - w.at;
  if (w.firstRun == null && s.tel.runs > w.runs0) w.firstRun = t;
  if (w.back3 == null && present(s).length >= 3) w.back3 = t;
  if (w.backFront == null) { const kit = E.autoKit(s, w.front); if (atHome(s).some((p) => E.odds(s, w.front, p.id, kit, { rested: true }).home >= 0.72)) w.backFront = t; }
}
// ---------------------------------------------------------------------------- one save
// The browser between sessions: the page is closed (the UI saved serialize() after the last act) and the next visit loads
// that save, then resume() credits the time away. A reload must change nothing (load settles a clean save as a no-op).
function reload(b) {
  const raw = E.serialize(b.s), r = E.load(raw, now(b)), again = E.serialize(r.state);
  b.m.reloads++;
  if (r.status !== 'ok' || again !== raw) {
    let i = 0; while (i < raw.length && raw[i] === again[i]) i++;
    if (b.m.reloadBad.length < 5) b.m.reloadBad.push(`${b.P.key} seed ${b.seed} at ${fmtMs(b.wall)}: ${r.status}${r.notes.length ? ' (' + r.notes.join('; ') + ')' : ''} ...${raw.slice(Math.max(0, i - 60), i + 40)}`);
  }
  b.s = r.state;
}
// What the UI reads every frame must not break on a real save (8: the HUD, the goal chip; 9: the Lab's telemetry).
function smoke(b) {
  try { const v = E.view(b.s), g = E.goal(b.s), k = E.kpis(b.s); if (!v || !g || !g.text || !g.eta || !k) throw new Error('empty goal or view'); }
  catch (err) { if (b.m.smokeBad.length < 5) b.m.smokeBad.push(`${b.P.key} seed ${b.seed} at ${fmtMs(b.wall)}: ${String(err && err.message || err).slice(0, 160)}`); }
}
function play(P, seed, horizon, opts) {
  const b = newBot(P, seed, horizon, opts);
  const beats = (s) => s.tel.levelUps + s.tel.nicknames + s.tel.invites + s.tel.drifters + (s.flags.strangerDone ? 1 : 0);
  let first = true;
  for (const [a, e] of sessions(P.sched, horizon, P.testLen)) {
    if (!first && !b.opts.noReload) reload(b);
    first = false;
    pass(b, a, true);
    const s = b.s;
    if (b.m.completeAt == null && complete(s)) b.m.completeAt = b.wall;
    b.online = true;
    const jobs0 = s.tel.jobsStarted, beats0 = beats(s);
    while (b.wall < e) {
      if (b.opts.wipeAt != null && !b.m.wipe && b.wall >= b.opts.wipeAt) wipe(b);
      decide(b);
      const reach = goalWithinReach(s);
      const wall = towerLv(s) < 10 && !jobFor(s, towerOf(s).id) && E.cost(s, 'tower', towerLv(s) + 1).n > cap(s, 'bricks');
      const ch = chooseRun(b), t0 = b.wall;
      if (!ch || !doRun(b, ch)) { const w = Math.min(WAIT, e - b.wall); b.m.nothing += w; frames(b, w); }
      const dt = b.wall - t0; b.m.online += dt;
      if (wall) b.m.storageWall += dt;
      if (!reach) { const gk = goalKey(s); b.m.noReachBy[gk] = (b.m.noReachBy[gk] || 0) + dt; b.m.noReach += dt; b.m.noReachRun += dt; b.m.noReachMax = Math.max(b.m.noReachMax, b.m.noReachRun); } else b.m.noReachRun = 0;
      wipeProbe(b);
    }
    decide(b);
    b.m.sessions.push({ a, jobs: s.tel.jobsStarted - jobs0, ends: s.tel.jobsDone - b.m.lastEnds, people: beats(s) - beats0, work: !complete(s) });
    b.m.lastEnds = s.tel.jobsDone;
    b.online = false;
    if (!b.opts.noSmoke) smoke(b);
  }
  pass(b, horizon, true);
  return summary(b);
}
// What a save leaves for the report (the state itself is dropped). SANITY gathers the engine checks of every save played.
const SANITY = { saves: 0, errors: [], drift: 0, reloads: 0, reloadBad: [], smokeBad: [] };
function summary(b) {
  const s = b.s, t = s.tel, Z = SANITY;
  Z.saves++; Z.drift += b.m.clockDrift; Z.reloads += b.m.reloads;
  for (const [k, v] of [['errors', b.m.errors], ['reloadBad', b.m.reloadBad], ['smokeBad', b.m.smokeBad]]) for (const x of v) if (Z[k].length < 8) Z[k].push(x);
  return { seed: b.seed, P: b.P.key, horizon: b.horizon, snaps: b.m.snaps, m: b.m, tower: towerLv(s), goal: s.goal,
    tel: { runs: t.runs, wins: t.wins, downs: t.downs, rescues: t.rescues, revC: t.revivesCans, revS: t.revivesSparks, graves: s.graves.length, goodbyes: t.goodbyes,
      expired: t.expired, drifters: t.drifters, invites: t.invites, nicks: t.nicknames, towerAt: t.towerAtMs.slice(), firstDown: t.firstDownMs, firstGrave: t.firstGraveMs,
      strangerAt: t.strangerAtMs, strangerRev: t.strangerRev, spIn: sumObj(t.sparksIn), spOut: sumObj(t.sparksOut), spBy: Object.assign({}, t.sparksIn, ...Object.keys(t.sparksOut).map((k) => ({ ['-' + k]: t.sparksOut[k] }))),
      packs: t.packs, devSparks: t.devSparks, deathShown: t.deathShown, runB: t.bricksRun, prodB: t.bricksProd, overflowB: t.overflowBricks, kitSpent: t.kitSpent,
      priceViolations: t.priceViolations, onlineMs: t.onlineMs, nothingMs: t.nothingMs, calib: t.calib },
    crane4: s.crane4, cityMs: s.cityMs, wall: b.wall };
}

// ============================================================================ P12: random legal play never soft-locks
function soak(seeds, steps) {
  let stuck = 0, runs = 0, downs = 0, graves = 0, deathBad = 0, errs = 0; const notes = [];
  for (const seed of seeds) {
    const R = Run.mulberry32(seed * 7717 + 13), pick = (a) => a[Math.floor(R() * a.length)];
    const s = E.create({ realNow: REAL0, tzOffsetMin: 0, seed: 50000 + seed });
    let real = REAL0;
    const A = (a) => E.act(s, a, real);
    for (let i = 0; i < steps; i++) {
      real += 1000 + Math.floor(R() * 20000);
      const x = R(), going = atHome(s), downP = s.people.filter((q) => q.state === 'down');
      if (s.pending) { const r = A({ type: 'resolveRun', source: 'sim' }); if (r.ok && r.data.outcome === 'down') downs++; if (!r.ok) errs++; }
      else if (x < 0.25 && going.length) {
        const ds = openDests(s), d = R() < 0.5 ? ds[ds.length - 1] : pick(ds), q = pick(going), kit = R() < 0.7 ? E.autoKit(s, d.id) : { medkit: 0, pills: 0, bomb: 0 };
        const o = E.odds(s, d.id, q.id, kit);
        if ((d.id === 'D1' || !s.flags.deathOn) && o.death !== 0) { deathBad++; if (notes.length < 5) notes.push(`seed ${seed}: Death ${o.death} at ${d.id}`); }
        if (A({ type: 'startRun', destId: d.id, personId: q.id, kit: { medkit: kit.medkit, pills: kit.pills, bomb: kit.bomb }, confirmLow: true }).ok) runs++;
      } else if (x < 0.32 && downP.length) { const q = pick(downP), y = R(); if (y < 0.4) A({ type: 'revive', personId: q.id, pay: 'cans' }); else if (y < 0.5) A({ type: 'revive', personId: q.id, pay: 'sparks' }); else if (A({ type: 'goodbye', personId: q.id }).ok) graves++; }
      else if (x < 0.36 && s.inn.travelers.length) A({ type: 'invite', travelerId: pick(s.inn.travelers).id });
      else if (x < 0.50) { for (const o of s.buildings) if (o.type === 'kiln' || o.type === 'cannery') A({ type: 'collect', id: o.id }); }
      else if (x < 0.62) { const c = cands(s).filter((y) => y.cost <= s.res[y.cur]); if (c.length && s.jobs.length < cranesTotal(s)) { const y = pick(c); if (y.kind === 'build') { const sp = spotFor(s, y.type); if (sp) A({ type: 'place', kind: y.type, gx: sp.gx, gy: sp.gy }); } else if (y.kind === 'expand') A({ type: 'expand' }); else A({ type: 'upgrade', id: y.id }); } }
      else if (x < 0.66) { if (s.jobs.length) A({ type: 'finish', jobId: pick(s.jobs).id, confirm: R() < 0.5 }); }
      else if (x < 0.68) { if (s.rubble.length) A({ type: 'clearRubble', id: pick(s.rubble).id }); }
      else if (x < 0.70) A({ type: 'restNow', personId: pick(s.people).id, confirm: R() < 0.5 });
      else if (x < 0.90) { const ms = Math.floor(R() * 10 * MIN); E.advance(s, ms, { source: 'frame' }); real += ms; }
      else { real += Math.floor(R() * (R() < 0.15 ? 2 * DAY : 4 * H)); E.resume(s, real); }
      if (!s.pending && !atHome(s).length) { stuck++; if (notes.length < 5) notes.push(`seed ${seed} step ${i}: nobody can go`); }
      if (i % 200 === 199) {                               // every 200 steps: an Allotments run with no kit can start, and the chip has a goal
        const g = E.goal(s); if (!g.text || !g.eta) { stuck++; if (notes.length < 5) notes.push(`seed ${seed} step ${i}: an empty goal chip`); }
        if (!s.pending) { const t = JSON.parse(JSON.stringify(s)), q = atHome(t)[0]; if (!q || !E.act(t, { type: 'startRun', destId: 'D1', personId: q.id, kit: {}, confirmLow: true }, real).ok) { stuck++; if (notes.length < 5) notes.push(`seed ${seed} step ${i}: no Allotments run can start`); } }
      }
    }
  }
  return { seeds: seeds.length, steps, stuck, runs, downs, graves, deathBad, errs, notes };
}

// ============================================================================ REPORT helpers (ref.cjs)
function fmtT(t) { if (t == null) return '-'; if (t < 90) return Math.round(t) + 's'; if (t < 3600) return (t / 60).toFixed(1) + 'm'; if (t < 2 * 86400) return (t / 3600).toFixed(1) + 'h'; return (t / 86400).toFixed(2) + 'd'; }
const fmtMs = (ms) => (ms == null ? '-' : fmtT(ms / SEC));
const med = (a) => { const v = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const rng = (a, f = (x) => x) => { const v = a.filter((x) => x != null).sort((x, y) => x - y); if (!v.length) return '-'; const lo = f(v[0]), hi = f(v[v.length - 1]); return lo === hi ? `${lo}` : `${lo}-${hi}`; };
const pct = (x) => (x == null ? '-' : Math.round(100 * x) + '%');
const mr = (a, f = (x) => x) => { const m = med(a); return m == null ? '-' : `${f(m)} (${rng(a, f)})`; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const CHECK_LABELS = ['3 min', '15 min', '1 h', '1 day', '1 week'];
function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i]).length)));
  return [head.map((h, i) => String(h).padEnd(w[i])).join(' | '), w.map((x) => '-'.repeat(x)).join('-+-'), ...rows.map((r) => r.map((c, i) => String(c).padEnd(w[i])).join(' | '))].join('\n');
}
function pacingTable(name, saves) {
  const rows = [];
  for (let k = 0; k < CHECK_LABELS.length; k++) {
    const S = saves.map((x) => x.snaps[k]).filter(Boolean); if (!S.length) continue;
    const f = (g, fm) => mr(S.map(g), fm);
    rows.push([CHECK_LABELS[k], f((x) => x.tower), `${f((x) => x.nb)} · Σlv ${med(S.map((x) => x.sumLv))}`, `${med(S.map((x) => x.land))}`,
      `${f((x) => x.people)} · top L${med(S.map((x) => x.topLv))}`, f((x) => x.runs), f((x) => x.wins), f((x) => x.downs),
      `${f((x) => x.revC)} / ${f((x) => x.revS)}`, f((x) => x.graves), `+${f((x) => x.spIn)} / −${f((x) => x.spOut)}${S[0].packs ? ` (packs ${med(S.map((x) => x.packs))})` : ''}`,
      f((x) => x.idle, pct), f((x) => x.nothing, pct)]);
  }
  return `${PERSONAS[name].label.toUpperCase()}  (median (min-max) over ${saves.length} seeds)\n` +
    table(['time', 'Tower', 'buildings', 'land', 'people', 'runs', 'wins', 'Downs', 'revives cans / ✦', 'graves', '✦ earned / spent', 'idle cranes', 'nothing to do'], rows);
}
function weekly(saves) {
  const W = saves.map((x) => x.snaps[x.snaps.length - 1]);
  const T = (k) => saves.map((x) => x.tel.towerAt[k]);
  const deadAll = saves.map((x) => { let run = 0, best = 0; for (const q of x.m.sessions) { if (q.work && q.jobs === 0 && q.ends === 0 && q.people === 0) { run++; best = Math.max(best, run); } else run = 0; } return best; });
  const deadAllShare = saves.map((x) => { const L = x.m.sessions.filter((q) => q.work); return L.length ? L.filter((q) => q.jobs === 0 && q.ends === 0 && q.people === 0).length / L.length : 0; });
  const deadJobs = saves.map((x) => { let run = 0, best = 0; for (const q of x.m.sessions) { if (q.work && q.jobs === 0 && q.ends === 0) { run++; best = Math.max(best, run); } else run = 0; } return best; });
  const downs = saves.flatMap((x) => x.m.downInfo);
  return { W, T, deadAll, deadAllShare, deadJobs, downs,
    reviveHours: downs.filter((d) => d.rateC > 0).map((d) => d.cans / d.rateC), affordNow: downs.length ? downs.filter((d) => d.held >= d.cans).length / downs.length : null,
    t10: T(10), crane4: saves.map((x) => x.m.crane4At), firstDown: saves.map((x) => x.tel.firstDown), storageWall: saves.map((x) => x.m.storageWall),
    runShare: saves.map((x) => (x.tel.runB + x.tel.prodB ? x.tel.runB / (x.tel.runB + x.tel.prodB) : 0)), expired: saves.map((x) => x.tel.expired),
    byeNew: saves.map((x) => x.m.byeNew), byeDear: saves.map((x) => x.m.byeDear), goalsDone: saves.map((x) => x.goal), revC: W.map((x) => x.revC), revS: W.map((x) => x.revS),
    drifters: saves.map((x) => x.tel.drifters), invites: saves.map((x) => x.tel.invites), nicks: saves.map((x) => x.tel.nicks), noReachMax: saves.map((x) => x.m.noReachMax),
    skipSp: saves.map((x) => x.m.skipSp), skipSec: saves.map((x) => x.m.skipSec), deathShown: saves.map((x) => x.tel.deathShown),
    h1Down: saves.filter((x) => x.tel.firstDown != null && x.tel.firstDown < H).length, overflow: saves.map((x) => x.m.overflowB),
    idleSplit: W.map((x) => [x.idleOn, x.idleOff, x.idleGated]), engNothing: saves.map((x) => (x.tel.onlineMs ? x.tel.nothingMs / x.tel.onlineMs : 0)),
    perDest: saves.map((x) => x.m.perDest), noReachBy: saves.map((x) => x.m.noReachBy) };
}
// P10: the shown Home % against the true odds (4,000 random seeds per model input) and the actual outcomes
const TRUE = new Map(); let trueSeed = 24680;
function trueOdds(r) {
  const key = r.d + '|' + r.hm + '|' + JSON.stringify(r.L); let t = TRUE.get(key);
  if (t === undefined) {
    const d = DEST[r.d], dest = { T: d.threat, W: d.dir.W, H: d.dir.H, len: d.dir.lengthS, hordeMul: r.hm }; let w = 0;
    for (let i = 0; i < 4000; i++) { trueSeed = (Math.imul(trueSeed, 1664525) + 1013904223) >>> 0; w += Run.winOnly(dest, r.L, trueSeed); }
    t = w / 4000; TRUE.set(key, t);
  }
  return t;
}
function calibration(saves) {
  const Bk = Array.from({ length: 10 }, () => ({ n: 0, shown: 0, tru: 0, act: 0 }));
  for (const x of saves) for (const r of x.m.runLog) { if (r.forced) continue; const k = Bk[Math.min(9, Math.floor(r.shown * 10))]; k.n++; k.shown += r.shown; k.tru += trueOdds(r); k.act += r.win; }
  const rows = Bk.map((k, i) => { if (k.n < 50) return null; const sh = 100 * k.shown / k.n, tr = 100 * k.tru / k.n, ac = 100 * k.act / k.n, se = 100 * Math.sqrt((sh / 100) * (1 - sh / 100) / k.n); return { b: i, n: k.n, shown: sh, tru: tr, act: ac, se, ok: Math.abs(ac - sh) <= 3 * se + 1.5 }; }).filter(Boolean);
  const nn = rows.reduce((a, r) => a + r.n, 0), bias = nn ? rows.reduce((a, r) => a + (r.shown - r.tru) * r.n, 0) / nn : 0;
  return { rows, ok: rows.length > 0 && rows.every((r) => r.ok), bias };
}

// ============================================================================ MAIN
function main() {
  const t0 = Date.now();
  if (opt('trace')) {
    const [n, sd] = String(opt('trace')).split(':'), days = +opt('days', 7);
    const x = play(PERSONAS[n], +sd || 1, days * DAY, { trace: true });
    console.log(x.snaps.map((q) => `${fmtMs(q.t)} T${q.tower} buildings ${q.nb} Σlv ${q.sumLv} people ${q.people} top L${q.topLv} runs ${q.runs} downs ${q.downs} graves ${q.graves} ✦ +${q.spIn}/−${q.spOut}`).join('\n'));
    if (x.m.errors.length) console.log('act errors:', x.m.errors);
    return 0;
  }
  const seeds = list(opt('seeds', '1-20')), days = +opt('days', 7), names = String(opt('personas', 'active,idle,spender,reckless')).split(',');
  const say = (x) => console.log(x);
  const R = {};
  for (const n of names) { const t1 = Date.now(); R[n] = seeds.map((sd) => play(PERSONAS[n], sd, days * DAY)); say(`  played ${PERSONAS[n].label}: ${seeds.length} saves in ${((Date.now() - t1) / 1000).toFixed(1)} s`); }
  say(`\nBellhaven pacing bot (the real engine) · ${names.length} personas × ${seeds.length} seeds (${rng(seeds)}) × ${days} days · t = 0 is 09:00 on day 1 · median (min-max)\n`);
  for (const n of names) { say(pacingTable(n, R[n])); say(''); }
  const K = {}; for (const n of names) K[n] = weekly(R[n]);
  const kRows = [
    ['Tower reached (median h)', (k) => [4, 5, 6, 7, 8, 9, 10].map((t) => { const v = med(k.T(t)); return v == null ? `T${t} -` : `T${t} ${(v / H).toFixed(1)}`; }).join(' · ')],
    ['Tower 10 (day)', (k) => (k.t10.some((x) => x == null) ? `not in ${k.t10.filter((x) => x == null).length}/${k.t10.length}` : mr(k.t10.map((x) => x / DAY), (x) => x.toFixed(2)))],
    ['runs per day · win rate', (k) => `${(med(k.W.map((x) => x.runs)) / days).toFixed(1)} · ${pct(med(k.W.map((x) => x.wins / Math.max(1, x.runs))))}`],
    ['Downs · expected from shown odds', (k) => `${mr(k.W.map((x) => x.downs))} · ${mr(k.deathShown, (x) => x.toFixed(1))}`],
    ['graves (new face let go / too dear / expired)', (k) => `${mr(k.W.map((x) => x.graves))} (${med(k.byeNew)} / ${med(k.byeDear)} / ${med(k.expired)})`],
    ['revives cans / sparks', (k) => `${mr(k.revC)} / ${mr(k.revS)}`],
    ['own Down in the first hour', (k) => `${k.h1Down}/${k.W.length}`],
    ['first own Down', (k) => mr(k.firstDown, fmtMs)],
    ['cans revive in hours of can output', (k) => (k.reviveHours.length ? `${med(k.reviveHours).toFixed(1)} (${Math.min(...k.reviveHours).toFixed(1)}-${Math.max(...k.reviveHours).toFixed(1)})` : '-')],
    ['cans revive affordable at the fall', (k) => pct(k.affordNow)],
    ['invites · drifters', (k) => `${mr(k.invites)} · ${mr(k.drifters)}`],
    ['nicknames', (k) => mr(k.nicks)],
    ['✦ earned · spent', (k) => `${mr(k.W.map((x) => x.spIn))} · ${mr(k.W.map((x) => x.spOut))}`],
    ['4th crane (day)', (k) => (k.crane4.some((x) => x == null) ? `bought in ${k.crane4.filter((x) => x != null).length}/${k.crane4.length}` : mr(k.crane4.map((x) => x / DAY), (x) => x.toFixed(1)))],
    ['✦ on skips (✦ per hour skipped)', (k) => `${mr(k.skipSp)} (${med(k.skipSec) ? (med(k.skipSp) / (med(k.skipSec) / 3600)).toFixed(0) : '-'})`],
    ['bricks from runs', (k) => mr(k.runShare, pct)],
    ['idle cranes (online / offline / nothing allowed)', (k) => `${pct(med(k.W.map((x) => x.idle)))} (${pct(med(k.idleSplit.map((x) => x[0])))} / ${pct(med(k.idleSplit.map((x) => x[1])))} / ${pct(med(k.idleSplit.map((x) => x[2])))})`],
    ['sessions with no beat (most in a row)', (k) => `${mr(k.deadAllShare, pct)} (${mr(k.deadAll)})`],
    ['sessions with no job started or finished (most in a row)', (k) => mr(k.deadJobs)],
    ['online time with no goal in reach (longest)', (k) => `${mr(k.W.map((x) => x.noReach), pct)} (${mr(k.noReachMax, fmtMs)})`],
    ['online time with the next Tower above the cap', (k) => mr(k.storageWall, fmtMs)],
    ['bricks lost to the cap (before content ends)', (k) => mr(k.overflow)],
    ['nothing to do (no run chosen · engine frames)', (k) => `${mr(k.W.map((x) => x.nothing), pct)} · ${mr(k.engNothing, pct)}`],
    ['runs a week by place (Downs), median', (k) => DESTS.map((d) => `${d.id} ${med(k.perDest.map((x) => (x[d.id] ? x[d.id].runs : 0)))} (${med(k.perDest.map((x) => (x[d.id] ? x[d.id].downs : 0)))})`).join(' · ')],
    ['no goal in reach: the steps it waited on', (k) => { const c = {}; for (const x of k.noReachBy) for (const g of Object.keys(x)) c[g] = (c[g] || 0) + x[g]; const top = Object.keys(c).sort((a, b2) => c[b2] - c[a]).slice(0, 3); return top.length ? top.map((g) => `${g} ${fmtMs(c[g] / k.W.length)}`).join(' · ') + ' a save' : '-'; }],
  ];
  say('Weekly KPIs');
  say(table(['', ...names.map((n) => PERSONAS[n].label)], kRows.map(([lab, f]) => [lab, ...names.map((n) => String(f(K[n])))])));
  say('');
  // the extra checks
  let H1 = null, W = null, SO = null, CAL = null, TS = null, WR = null;
  if (!opt('no-hour') && names.includes('active')) {
    const hs = list(opt('hour-seeds', '1-200')), t1 = Date.now();
    const S = hs.map((sd) => play(PERSONAS.active, sd, H));
    H1 = { n: S.length, downs: S.filter((x) => x.tel.firstDown != null && x.tel.firstDown < H).length };
    say(`Own Down within the first hour (P4; active, ${S.length} one-hour saves, seeds ${rng(hs)}): ${H1.downs}/${H1.n} = ${pct(H1.downs / H1.n)}  (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  if (!opt('no-cal')) {
    const t1 = Date.now(); CAL = calibration(names.flatMap((n) => R[n]));
    say(`Calibration (P10; all personas pooled, forced first wins left out; bucket: runs · shown → true (4,000 random seeds) → actual; tolerance 3 SE + 1.5 points): ${CAL.rows.map((c) => `${c.b}0s n${c.n} · ${c.shown.toFixed(1)} → ${c.tru.toFixed(1)} → ${c.act.toFixed(1)}${c.ok ? '' : ' ✗'}`).join('; ')} · shown − true ${CAL.bias >= 0 ? '+' : ''}${CAL.bias.toFixed(1)} points  (${TRUE.size} model inputs, ${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  if (!opt('no-soak')) {
    const t1 = Date.now(), n = +opt('soak', 50); SO = soak(list('1-' + n), +opt('soak-steps', 2000));
    say(`Random legal play (P12; ${SO.seeds} seeds × ${SO.steps} steps, an Allotments run and the goal chip probed every 200 steps): ${SO.stuck} soft-lock moments · ${SO.runs} runs, ${SO.downs} Downs, ${SO.graves} graves, ${SO.errs} rejected results · Death shown above 0 at the Allotments or before the third person: ${SO.deathBad}${SO.notes.length ? ' · ' + SO.notes.join('; ') : ''}  (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  if (!opt('no-tester')) {
    const ts = list(opt('tester-seeds', '1-30')), t1 = Date.now(), S = ts.map((sd) => play(PERSONAS.tester, sd, 15 * MIN));
    const f = (pred) => S.filter(pred).length, tw = (k) => S.map((x) => x.m.towerWall[k]).filter((x) => x != null);
    TS = { n: S.length, t4: f((x) => x.tower >= 4), runs12: f((x) => x.tel.runs >= 12), nick: f((x) => x.tel.nicks >= 1), invite: f((x) => x.tel.invites >= 1),
      risky: f((x) => x.m.maxDeathShown > 0.05), down: f((x) => x.tel.downs > 0), skip: f((x) => x.m.t4skip && x.m.t4skip[0] > 0 && x.m.t4skip[1] >= x.m.t4skip[0]), t4at: med(tw(4)) };
    say(`15-minute prototype test (SPEC 10: 8 s run screens, a GO about every 60 s, the run-warp cap on, follows the goal chip; ${S.length} seeds): Tower 2 at ${mr(tw(2), fmtMs)} · Tower 3 at ${mr(tw(3), fmtMs)} · Tower 4 at ${mr(tw(4), fmtMs)}, by 15 min in ${TS.t4}/${TS.n} · the stranger at ${mr(S.map((x) => x.m.strangerWall), fmtMs)} · ${mr(S.map((x) => x.tel.runs))} runs (≥ 12 in ${TS.runs12}/${TS.n}) · city clock ${mr(S.map((x) => x.cityMs), fmtMs)} · a nickname ${TS.nick}/${TS.n} · an invite ${TS.invite}/${TS.n} · a run with Death > 5 % ${TS.risky}/${TS.n} · an own Down ${TS.down}/${TS.n} · the Tower 4 timer skip ${mr(S.map((x) => (x.m.t4skip ? x.m.t4skip[0] : null)))} ✦ with ${mr(S.map((x) => (x.m.t4skip ? x.m.t4skip[1] : null)))} ✦ held (affordable ${TS.skip}/${TS.n})  (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  if (!opt('no-warp')) {
    const t1 = Date.now(), wsd = list(opt('warp-seeds', '1-10')), out = []; WR = [];
    for (const wallS of [60, 20, 10]) for (const warp of [6, 0]) {
      const P = Object.assign({}, PERSONAS.tester, { runWall: wallS * SEC, runWarp: warp, testLen: H }), S = wsd.map((sd) => play(P, sd, H));
      const speed = med(S.map((x) => x.cityMs / x.wall)); WR.push({ wallS, warp, speed, tower: med(S.map((x) => x.tower)) });
      out.push(`${wallS} s per run${warp ? '' : ' (no cap)'}: clock ${speed.toFixed(1)}× · Tower ${med(S.map((x) => x.tower))} at 60 min (${rng(S.map((x) => x.tower))}) · ${med(S.map((x) => x.tel.runs))} runs`);
    }
    say(`Run-warp check (5.1, 14.4: the tester tapping through simulated runs for 60 real minutes; ${wsd.length} seeds; median clock speed in multiples of real time): ${out.join(' · ')}  (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
  }
  if (!opt('no-wipe')) {
    const ws = opt('wipe-seeds') ? list(opt('wipe-seeds')) : seeds, t1 = Date.now(), rows = []; W = [];
    for (const n of names) for (const [tag, at] of [['20 min', 20 * MIN], ['day 2 12:00', DAY + 3 * H]]) {
      const S = ws.map((sd) => play(PERSONAS[n], sd, days * DAY, { wipeAt: at }));
      const base = ws.map((sd) => { const i = seeds.indexOf(sd); return i >= 0 ? R[n][i].tower : play(PERSONAS[n], sd, days * DAY).tower; });
      const w = S.map((x) => x.m.wipe);
      const sameSession = w.every((x) => x && x.firstRun != null && x.firstRun <= 30 * MIN), back3 = w.every((x) => x && x.back3 != null && x.back3 <= DAY);
      const front = w.every((x) => x && x.backFront != null && x.backFront <= 2 * DAY), tower = S.every((x, i) => x.tower >= base[i] - 1);
      const noPay = S.every((x) => x.tel.spOut === x.m.wipe.spOut0 && x.tel.packs === x.m.wipe.packs0);
      const okAll = sameSession && back3 && front && tower && noPay;
      rows.push([PERSONAS[n].label, tag, `T${med(w.map((x) => x.tower))} · ${med(w.map((x) => x.people))} people (top L${med(w.map((x) => x.top))}) · ${DEST[w[0].front].name}`,
        mr(w.map((x) => x.firstRun), fmtMs), mr(w.map((x) => x.back3), fmtMs), mr(w.map((x) => x.backFront), fmtMs), `${mr(S.map((x) => x.tower))} (unharmed ${mr(base)})`,
        `${med(S.map((x) => x.snaps[x.snaps.length - 1].people))} · top L${med(S.map((x) => x.snaps[x.snaps.length - 1].topLv))}`, noPay ? '0' : 'spent!', okAll ? '✓' : '✗']);
      W.push({ label: `${PERSONAS[n].label} @${tag}`, ok: okAll });
    }
    say(`\nWorst case (P12, 14.5; seeds ${rng(ws)}): everyone gone, 0 bricks, 0 cans, 0 sparks, empty bubbles; then the same persona plays on without paying  (${((Date.now() - t1) / 1000).toFixed(1)} s)`);
    say(table(['persona', 'wipe at', 'before the wipe', 'first run after', 'back to 3 people', 'a runner ≥72% at the old frontier', 'Tower at day 7', 'people at day 7 · top level', '✦ spent after', ''], rows));
  }
  // ---------------------------------------------------------------- the assertions (SPEC 10) and the judgements (14.6)
  const A = K.active, Id = K.idle, Sp = K.spender, Rk = K.reckless, all = names.flatMap((n) => R[n]);
  const rowsA = [], add = (id, tier, what, ref, got, ok) => rowsA.push([id, tier, what, ref, got, ok == null ? '-' : ok ? '✓' : '✗']);
  const days7 = (x) => x / DAY;
  if (A) {
    const t10 = A.t10.map((x) => (x == null ? null : days7(x))), inWin = t10.filter((x) => x != null && x >= 6 && x <= 7).length;
    add('P1', 'P0', 'Active reaches Tower 10 between day 6.0 and 7.0 in ≥ 18 of 20 seeds', '20/20, 6.2 d (6.2-6.3)', `${inWin}/${t10.length}, ${mr(t10, (x) => (x == null ? '-' : x.toFixed(2)))} d`, inWin >= Math.ceil(0.9 * t10.length));
    const dw = A.W.map((x) => x.downs * 7 / days);
    add('P2', 'P0', 'Active Downs per week 5-11 (median)', '7', `${mr(dw, (x) => +x.toFixed(1))}`, med(dw) >= 5 && med(dw) <= 11);
    const g = A.W.map((x) => x.graves * 7 / days), gm = mean(g), with1 = g.filter((x) => x >= 1).length;
    add('P3', 'P0', 'Active graves per week: mean 1.5-4.0, a grave in ≥ 12 of 20 seeds', '1.85, 13/20', `${gm.toFixed(2)}, ${with1}/${g.length} (${mr(g)})`, gm >= 1.5 && gm <= 4 && with1 >= Math.ceil(0.6 * g.length));
  }
  if (H1) add('P4', 'P1', 'Active own Down within the first hour in ≥ 25 % of 200 one-hour saves', '31 %', `${pct(H1.downs / H1.n)} (${H1.downs}/${H1.n})`, H1.downs / H1.n >= 0.25);
  if (A) {
    const nth = med(A.W.map((x) => x.nothing)), wr = med(A.W.map((x) => x.wins / Math.max(1, x.runs)));
    add('P5', 'P0', 'Active nothing-to-do time < 5 %; win rate 88-96 %', '0 %, 92 %', `${pct(nth)}, ${(100 * wr).toFixed(1)} %`, nth < 0.05 && wr >= 0.88 && wr <= 0.96);
  }
  if (Id) {
    const tw = Id.W.map((x) => x.tower), dn = Id.W.map((x) => x.downs), gr = Id.W.map((x) => x.graves);
    add('P6', 'P1', 'Idle checker at day 7: median Tower 9, every seed ≥ 8; Downs 0-5; graves 0-3 (medians)', '9 (9-10), 2, 1', `${mr(tw)}, ${mr(dn)}, ${mr(gr)}`, med(tw) === 9 && Math.min(...tw) >= 8 && med(dn) <= 5 && med(gr) <= 3);
  }
  if (A && Rk) {
    const ag = mean(A.W.map((x) => x.graves)), rg = mean(Rk.W.map((x) => x.graves)), ad = mean(A.W.map((x) => x.downs)), rd = mean(Rk.W.map((x) => x.downs));
    add('P7', 'P1', 'Reckless: mean graves ≥ 1.75 × and mean Downs ≥ 1.25 × the active\'s (same seeds)', '6.1 ×, 3.1 ×', `${(rg / Math.max(1e-9, ag)).toFixed(2)} × (${rg.toFixed(2)} / ${ag.toFixed(2)}), ${(rd / Math.max(1e-9, ad)).toFixed(2)} × (${rd.toFixed(1)} / ${ad.toFixed(1)})`, rg >= 1.75 * ag && rd >= 1.25 * ad);
  }
  if (A && Sp) {
    const lead = med(A.t10.map((x) => (x == null ? Infinity : days7(x)))) - med(Sp.t10.map((x) => (x == null ? Infinity : days7(x))));
    const sg = Sp.W.map((x) => x.graves), buys = R.spender.flatMap((x) => x.m.sparkBuys);
    add('P8', 'P0', 'Spender reaches Tower 10 1.5-3.0 days before the active median; 0 graves; never gains bricks or cans from sparks', '2.2 d, 0', `${lead.toFixed(2)} d, graves ${mr(sg)}, ${buys.length} sparks-for-resources acts`, lead >= 1.5 && lead <= 3 && Math.max(...sg) === 0 && buys.length === 0);
  }
  if (A) {
    const sp = A.W.map((x) => x.spIn * 7 / days), cr = A.crane4.map((x) => (x == null ? null : days7(x))), crOk = cr.every((x) => x != null && x >= 3 && x <= 7);
    add('P9', 'P1', 'Free active sparks: earned 250-300 a week (median); the 4th crane bought between day 3 and 7', '275, day 4.4-6.3', `${mr(sp, (x) => Math.round(x))}, day ${mr(cr, (x) => (x == null ? '-' : x.toFixed(1)))} (in ${cr.filter((x) => x != null).length}/${cr.length})`, med(sp) >= 250 && med(sp) <= 300 && crOk);
  }
  if (CAL) add('P10', 'P1', 'Calibration: every 10 % bucket with ≥ 50 runs within 3 SE + 1.5 points; shown − true within 2 points', '9/9 buckets; +0.7', `${CAL.rows.filter((r) => r.ok).length}/${CAL.rows.length} buckets; ${CAL.bias >= 0 ? '+' : ''}${CAL.bias.toFixed(2)}`, CAL.ok && Math.abs(CAL.bias) <= 2);
  {
    const bad = all.flatMap((x) => x.m.priceBad), eng = all.reduce((a, x) => a + x.tel.priceViolations, 0), seen = all.reduce((a, x) => a + x.m.prices, 0), info = all.flatMap((x) => x.m.priceInfo);
    add('P11', 'P0', 'Every price that appears (builds, invites, revives, kit) is ≤ 80 % of its cap at that moment', '0 violations', `${bad.length + eng + D.assertData(1).length} violations in ${seen} prices (data rule ${D.assertData(1).length}, engine ${eng})`, bad.length + eng + D.assertData(1).length === 0);
    if (bad.length) say('P11 violations: ' + bad.slice(0, 5).join('; '));
    if (info.length) { const c = {}; for (const k of info) c[k] = (c[k] || 0) + 1; say(`P11 note: ${info.length} jobs were started with a price above 80 % of the city's own cap at that moment (the player had not raised the Depots that far yet; below the data rule's cap): ${Object.keys(c).sort((a, b2) => c[b2] - c[a]).slice(0, 6).map((k) => k + ' ×' + c[k]).join(', ')}`); }
  }
  {
    const dr = all.flatMap((x) => x.m.deathRule);
    const softOk = SO ? SO.stuck === 0 && SO.deathBad === 0 && SO.errs === 0 && dr.length === 0 : null;
    add('P12a', 'P0', 'No soft-lock in 50 seeds of random legal play; Death 0 before the third present person and at the Allotments', 'no soft-lock', SO ? `${SO.stuck} stuck moments in ${SO.seeds} seeds; Death rule broken ${SO.deathBad + dr.length} times` : '-', softOk);
    add('P12b', 'P1', 'After a wipe (20 min, day 2): a run the same session, 3 people within a day, Tower at day 7 within one level, without paying', 'wipe test 8/8', W ? `${W.filter((x) => x.ok).length}/${W.length}` : '-', W ? W.every((x) => x.ok) : null);
  }
  if (A) {
    const nr = med(A.W.map((x) => x.noReach)), nrMax = Math.max(...A.noReachMax), chain = A.goalsDone.filter((g) => g >= GOALS.length).length, beatRun = Math.max(...A.deadAll);
    add('P13', 'P1', 'Active: ≤ 5 % of online time with no goal in reach, longest ≤ 40 min; the chain finishes in every seed; ≤ 3 sessions in a row with no beat', '0 %, 38 min, 20/20, 2', `${pct(nr)}, ${fmtMs(nrMax)}, ${chain}/${A.goalsDone.length}, ${beatRun}`, nr <= 0.05 && nrMax <= 40 * MIN && chain === A.goalsDone.length && beatRun <= 3);
    const allDowns = names.flatMap((n) => K[n].downs), first = allDowns.filter((d) => d.n === 0 && d.rateC > 0), worstFirst = first.length ? Math.max(...first.map((d) => d.cans / d.rateC)) : 0;
    const spMax = allDowns.length ? Math.max(...allDowns.map((d) => d.sparks)) : 0, mh = med(A.reviveHours);
    add('P14', 'P1', 'Revives: median cans revive ≥ 1 h of the city\'s Cannery output; every first revive ≤ 24 h of it; every sparks revive ≤ 70 % of a free week (275 ✦)', '3.2 h, 9.4 h, 192 ✦', `${mh == null ? '-' : mh.toFixed(1)} h, ${worstFirst.toFixed(1)} h, ${spMax} ✦`, mh != null && mh >= 1 && worstFirst <= 24 && spMax <= 0.7 * FREE_WEEK);
  }
  if (TS) add('T15', '10', '15-minute prototype test: Tower 4 by 15 min, ≥ 12 runs, a nickname, an invite, a run at Death > 5 % and an affordable Tower 4 skip, each in every seed', '30/30 each; Tower 4 at 11.0 min',
    `${TS.t4}, ${TS.runs12}, ${TS.nick}, ${TS.invite}, ${TS.risky}, ${TS.skip} of ${TS.n}; Tower 4 at ${fmtMs(TS.t4at)}`, [TS.t4, TS.runs12, TS.nick, TS.invite, TS.risky, TS.skip].every((x) => x === TS.n));
  if (WR) {
    const cap6 = WR.filter((x) => x.warp), free = WR.filter((x) => !x.warp);
    add('W', '5.1', 'Run-warp cap: tapping through simulated runs at 60, 20 and 10 s per run keeps the clock at or under 7× real time', '5.5×, 6.6×, 6.2× (no cap 5.5×, 16.5×, 35.2×)',
      `${cap6.map((x) => x.speed.toFixed(1) + '×').join(', ')} (no cap ${free.map((x) => x.speed.toFixed(1) + '×').join(', ')})`, cap6.every((x) => x.speed <= 7));
  }
  // judgements (14.6), with ref.cjs's criteria
  const J = [], okc = (c) => (c ? '✓' : '✗');
  if (A) {
    const nr = med(A.W.map((x) => x.noReach)), nrMax = Math.max(...A.noReachMax), chain = A.goalsDone.every((g) => g >= GOALS.length);
    J.push(['1 goal in reach', `${pct(nr)}, longest ${fmtMs(nrMax)}; chain done in ${A.goalsDone.filter((g) => g >= GOALS.length).length}/${A.W.length}`, okc(nr <= 0.05 && nrMax <= 40 * MIN && chain)]);
    const t10 = A.t10.map((x) => (x == null ? Infinity : days7(x))), deadAll = Math.max(...A.deadAll), sw = Math.max(...A.storageWall), nth = med(A.W.map((x) => x.nothing));
    J.push(['2 slow but steady', `T10 ${mr(t10, (x) => x.toFixed(2))}; ${deadAll} in a row; storage ${fmtMs(sw)}; nothing ${pct(nth)}`, okc(t10.every((x) => x >= 6 && x <= 7) && deadAll <= 3 && sw <= 3 * H && nth === 0)]);
  }
  if (A && Rk) {
    const g = A.W.map((x) => x.graves), gMean = mean(g), rgMean = mean(Rk.W.map((x) => x.graves)), adMean = mean(A.W.map((x) => x.downs)), rdMean = mean(Rk.W.map((x) => x.downs));
    const with1 = g.filter((x) => x >= 1).length / g.length, h1 = H1 ? H1.downs / H1.n : null, dr = all.flatMap((x) => x.m.deathRule).length + (SO ? SO.deathBad : 0);
    J.push(['3 death real but fair', `active graves ${mr(g)}, mean ${gMean.toFixed(2)}, a grave in ${pct(with1)} of seeds, Downs ${med(A.W.map((x) => x.downs))}; first-hour Down ${h1 == null ? '-' : pct(h1)}; reckless graves mean ${rgMean.toFixed(1)} (${(rgMean / Math.max(1e-9, gMean)).toFixed(1)} ×), Downs mean ${rdMean.toFixed(1)} (${(rdMean / Math.max(1e-9, adMean)).toFixed(1)} ×); calibration ${CAL ? (CAL.ok ? 'within tolerance' : 'OUT') + ` in ${CAL.rows.length} buckets, shown − true ${CAL.bias.toFixed(1)} points` : '-'}; Death rule broken ${dr} times`,
      okc(gMean >= 1.5 && gMean <= 4 && with1 >= 0.6 && (h1 == null || h1 >= 0.25) && rgMean >= 1.75 * gMean && rdMean >= 1.25 * adMean && (!CAL || (CAL.ok && Math.abs(CAL.bias) <= 2)) && dr === 0)]);
  }
  if (A) {
    const allDowns = names.flatMap((n) => K[n].downs), first = allDowns.filter((d) => d.n === 0 && d.rateC > 0);
    const worstFirst = first.length ? Math.max(...first.map((d) => d.cans / d.rateC)) : 0, capOk = allDowns.every((d) => d.cans <= 0.8 * d.capC + 1e-9), spMax = allDowns.length ? Math.max(...allDowns.map((d) => d.sparks)) : 0;
    const mh = med(A.reviveHours), paid = med(A.revC.map((r, i) => r / Math.max(1, A.W[i].downs)));
    J.push(['4 revive prices', `median ${mh == null ? '-' : mh.toFixed(1)} h; worst first revive ${worstFirst.toFixed(1)} h; cap clamp ${capOk ? 'held' : 'broken'}; dearest sparks revive ${spMax} ✦ (${pct(spMax / FREE_WEEK)}); active revives ${pct(paid)} of Downs`, okc(mh != null && mh >= 1 && worstFirst <= 24 && capOk && spMax <= 0.7 * FREE_WEEK && paid >= 0.5)]);
  }
  if (A && Sp) {
    const lead = med(A.t10.map((x) => (x == null ? Infinity : days7(x)))) - med(Sp.t10.map((x) => (x == null ? Infinity : days7(x))));
    const ladder = D.TOWER.time.slice(2).reduce((a, t) => a + E.price.skip(t), 0), sp = med(A.W.map((x) => x.spIn)), crane = A.crane4.every((x) => x != null);
    const teach = R.active.every((x) => x.goal > GOALS.findIndex((g) => g[0] === 'skip'));
    J.push(['5 skip prices', `lead ${lead.toFixed(2)} d; ladder ${ladder} ✦ = ${(ladder / sp).toFixed(1)} weeks; 4th crane in ${A.crane4.filter((x) => x != null).length}/${A.W.length} (day ${mr(A.crane4.map((x) => (x == null ? null : x / DAY)), (x) => x.toFixed(1))}); teach skip paid in ${R.active.filter((x) => x.goal > GOALS.findIndex((g) => g[0] === 'skip')).length}/${R.active.length}`, okc(lead >= 1.5 && lead <= 3 && ladder >= 3 * sp && crane && teach)]);
  }
  if (W) J.push(['6 recovery from the worst case', W.map((r) => `${r.label}: ${r.ok ? 'ok' : 'FAIL'}`).join('; '), okc(W.every((r) => r.ok))]);
  say('\nSection 10 assertions (P0 is 13.1\'s P0 set for the bot, P1 the rest; ✓ / ✗)');
  say(table(['#', 'tier', 'assertion', 'reference (ref.cjs)', 'the real engine', ''], rowsA));
  say('\nJudgement (14.6)');
  say(table(['question', 'result', ''], J));
  // The same save played twice gives the same week (the engine is pure and its odds cache never changes a result).
  let det = null;
  if (R[names[0]]) { const a = R[names[0]][0], b2 = play(PERSONAS[names[0]], seeds[0], days * DAY), key = (x) => JSON.stringify([x.snaps, x.tel, x.m.sessions, x.m.runLog]); det = key(a) === key(b2); }
  const Z = SANITY, sane = !Z.errors.length && !Z.drift && !Z.reloadBad.length && !Z.smokeBad.length && det !== false;
  say(`\nEngine sanity over all ${Z.saves} saves played: ${Z.errors.length} unexpected act errors${Z.errors.length ? ' (' + Z.errors.slice(0, 4).join('; ') + ')' : ''} · the city clock off the wall clock ${Z.drift} times · ${Z.reloads} reloads (load(serialize()) at every session start), ${Z.reloadBad.length} changed the save${Z.reloadBad.length ? ' (' + Z.reloadBad.slice(0, 2).join('; ') + ')' : ''} · view() / goal() / kpis() at every session end: ${Z.smokeBad.length} failures${Z.smokeBad.length ? ' (' + Z.smokeBad.slice(0, 2).join('; ') + ')' : ''} · the same save twice: ${det == null ? '-' : det ? 'identical' : 'DIFFERENT'} · ${E.oddsCacheSize()} odds in the engine's cache · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (opt('json')) fs.writeFileSync(String(opt('json')), JSON.stringify({ K: Object.fromEntries(names.map((n) => [n, { W: K[n].W, t10: K[n].t10 }])), assertions: rowsA, judgements: J }, null, 1));
  const failed = rowsA.filter((r) => r[5] === '✗').length + J.filter((r) => r[2] === '✗').length + (sane ? 0 : 1);
  say(failed ? `\nFAIL: ${failed} check(s) failed` : '\nPASS: every assertion and judgement holds');
  return failed ? 1 : 0;
}
if (require.main === module) process.exitCode = main();
module.exports = { PERSONAS, play, soak, sessions, goalWithinReach, calibration };
