/* Survivor Camp engine: pure camp state + rules (SPEC sections 2-7, 9, 11).
 *
 * No DOM access, no clock reads and no unseeded random numbers (tests.cjs greps for them). Time and randomness are
 * injected: the UI passes real-time stamps (the wall clock) and frame deltas (the frame timer); every random draw
 * comes from state.rng (mulberry32 stepping, saved). Classic script: SC.Engine in the browser (after data.js and
 * run.js), module.exports in node. The engine never touches storage: the UI saves serialize() in try/catch, copies an
 * unreadable save to 'survivor-camp.v1.bad' on status 'corrupt-reset', and never overwrites a 'future-version' save.
 *
 * API (every function mutates only the state it is given)
 *   Engine.create({ realNow, tzOffsetMs, seed })         -> state (start state of SPEC 2)
 *   Engine.load(raw|null, realNow, opts?)                 -> { state, status: 'new'|'ok'|'migrated'|'corrupt-reset'|'future-version', notes }
 *                                                            (load does not credit offline time: call resume() next)
 *   Engine.serialize(state)                               -> JSON string (the UI writes it in try/catch)
 *   Engine.sanitize(obj, notes?)                          -> a clean state (unknown keys dropped, numbers clamped)
 *   Engine.migrate(obj)                                   -> obj at CURRENT_V
 *   Engine.tick(state, realDeltaMs, realNow)              -> events[]  frame: advance(min(d, 1000) x timeScale); paused while a run is pending
 *   Engine.resume(state, realNow)                         -> { creditedMs, rollback, events, welcome }  offline at 1x, cap 7 d, rollback credits 0
 *   Engine.advance(state, campMs, ctx)                    -> events[]  event-stepped core; ctx { source: 'frame'|'offline'|'skipAhead'|'run', dev }
 *   Engine.act(state, action)                             -> { ok, err, events, ...extra }  the only way the UI changes state
 *   Engine.view(state, opts?)                             -> derived read-only View (opts.odds: false skips route odds)
 *   Engine.goal(state)                                    -> { main, side, long }  (main and side always carry text)
 *   Engine.timeline(state, n = 5)                         -> next n events [{ at, inMs, kind, id, label }]
 *   Engine.welcome(state, events, creditedMs)             -> { ms, rows[] } for the welcome-back card
 *   Engine.price.skip(sec, state?) / Engine.price.shortfall(state, cost) -> int / { price, label, parts } | null
 *   Engine.cost(id, lv, state?) -> { scrap, food, meds, bp, id, lv }   Engine.buildTime(id, lv, state?) -> seconds
 *   Engine.reqCL(id, lv)   Engine.buildCheck(state, id) -> { ok, reason, label, lv, cost, time, reqCL, missing? }
 *   Engine.loadoutFor(state, routeId, patch?)            -> L (run.js input)
 *   Engine.odds(state, routeId, patch?, opts?)           -> { odds, gear, deltas: { medkit, pills, bomb } }  cached mc(route, L, 400)
 *   Engine.buildHandoff(state, routeId, seed?)           -> handoff payload (SPEC 5.9); seed null = preview
 *   Engine.runSim(state)                                  -> result payload (SPEC 5.10) for state.pending, deterministic (forced outcomes searched)
 *   Engine.validateResult(res, pending)                   -> { ok, res (clamped), errors[], notes[] }
 *   Engine.reward(state, route, res, pending?)            -> reward breakdown (SPEC 5.6), no mutation
 *   Engine.canStartRun(state, routeId)                    -> { ok, err }
 *   Engine.routeLab(state, n = 1000)                       -> per-route odds, medians and value per attempt / per camp-minute
 *   Engine.kpis(state)                                    -> telemetry summary (end card, Lab tables)
 *   Engine.lossHint(state, routeId)                       -> { text, kind, intel: { route, before, after } } for the loss card
 *   Engine.demo({ realNow, tzOffsetMs })                  -> a CL5 mid-game camp for the #demo hash (in memory only)
 *   Engine.fmt.dur(sec) / fmt.clock(sec) / fmt.num(n)
 *
 * Actions for act(): tapFire, takePile, build {id}, buildNow {id}, finishFree {target}, skip {target, confirm},
 *   collect {id}, collectAll, openCrate, unloadTruck, craft {building, item}, unlockWeapon {weapon}, recruit,
 *   sendParty {kind}, buyCrew, claimPack {size}, setLoadout {patch}, startRun {routeId, external},
 *   resolveRun {result}, dev {op, ...}.  target = { kind: 'job'|'craft'|'recruit'|'party'|'injury', id }
 *   (job id = building id, craft id = 'infirmary'|'workbench', party id = party.id, injury id = person id).
 *   dev ops: timeScale {value}, skipAhead {ms}, runUsesCampTime {value}, grant {what}, fillStorage, finishAll,
 *   setCL {n}, force {value}, lockSeed {value}, forcedWins {value}, skill {value}, runScreenSec {value},
 *   lossPayout {value}, injuryMin {value}, intelG {value}, sim {D0, night, medCalm}, mul {key, value},
 *   freeSec {value}, skipExp {value}, momentum {value}, momentumCap {value}, reducedMotion {value},
 *   particles {value}, volume {value}, muted {value}, replayFtue, skipFtue, cancelRun.
 *
 * Run flow: act startRun -> (UI) Engine.runSim(state) or a pasted/real result -> act resolveRun {result}.
 * View highlights for the UI: hotspots{id: {label (aria), state, level, lockLabel, bubble, timer}}, timeline (next 5),
 *   assign{salvage|garden|infirmary|fire: names}, slotNotes{id: "Garden −1 worker: Tomas is hurt"}, next{id: build
 *   check + shortfall offer}, routes[{odds}], frontierOdds, daily, crew3, dawn, lightRadius, campRange, generator.
 * Events: jobStarted, jobDone, craftDone, partyBack, recruitDone, healed, genCharge, clUp, objectiveDone, full,
 *   waste, dayRollover, runStarted, runResolved, rescued, momentum, truckOverflow, offline, supplyDrop, injured,
 *   collected, crateOpened, crew, ftue, fireLit, packClaimed, weapon.
 */
(function (root, f) {
  const api = f(root.SC || {});
  if (typeof module === 'object' && module.exports) module.exports = api; else (root.SC = root.SC || {}).Engine = api;
})(typeof self !== 'undefined' ? self : this, function (SC) {
  'use strict';
  const DATA = SC.DATA || (typeof require === 'function' ? require('./data.js') : null);
  const Run = SC.Run || (typeof require === 'function' ? require('./run.js') : null);

  const CURRENT_V = 1;
  const DATA_RULE = DATA.assertData(1);                       // SPEC 3 data rule, asserted when the engine loads
  const MIGRATIONS = { 1: (s) => s };
  const SEC = 1000, MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const B = DATA.BUILDINGS, RES = ['scrap', 'food', 'meds'], ITEMS = ['medkit', 'pills', 'bomb'];
  const ROUTE = {}; DATA.ROUTES.forEach((r) => { ROUTE[r.id] = r; });
  const ROUTE_IDS = DATA.ROUTES.map((r) => r.id);
  const PROD_RES = { salvage: 'scrap', garden: 'food', infirmary: 'meds' };
  const RES_PROD = { scrap: 'salvage', food: 'garden', meds: 'infirmary' };
  const RES_NAME = { scrap: 'scrap', food: 'food', meds: 'meds' };
  const ITEM_NAME = { medkit: 'medkit', pills: 'pills', bomb: 'noise bomb' };
  // "a medkit", "2 noise bombs", "pills", "3 pills": pills are already plural.
  const itemCount = (item, n) => item === 'pills' ? (n > 1 ? n + ' pills' : 'pills') : (n > 1 ? n + ' ' + ITEM_NAME[item] + 's' : 'a ' + ITEM_NAME[item]);
  // Median win haul per route (SPEC 5.5), used only for the goal chip's "≈ N runs".
  const MEDIAN_HAUL = { R1: { scrap: 126, food: 38, meds: 0 }, R2: { scrap: 225, food: 71, meds: 6 }, R3: { scrap: 341, food: 103, meds: 12 },
    R4: { scrap: 697, food: 205, meds: 24 }, R5: { scrap: 1091, food: 313, meds: 33 } };

  // ------------------------------------------------------------------ small helpers
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const nn = (v, d) => Math.max(0, fin(v, d));
  const int0 = (v, d) => Math.floor(nn(v, d));
  const clampN = (v, lo, hi, d) => Math.min(hi, Math.max(lo, fin(v, d)));
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const str = (v, d) => (typeof v === 'string' ? v : d);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const pad = (n, w) => String(n).padStart(w, '0');

  function fmtDur(sec) {
    sec = Math.max(0, sec || 0);
    if (sec < 60) return Math.ceil(sec) + ' s';
    if (sec < 3600) { const m = Math.floor(sec / 60), r = Math.round(sec - m * 60); return r === 60 ? (m + 1) + ' m' : r ? m + ' m ' + r + ' s' : m + ' m'; }
    if (sec < 172800) { const h = Math.floor(sec / 3600), m = Math.round((sec - h * 3600) / 60); return m === 60 ? (h + 1) + ' h' : m ? h + ' h ' + m + ' m' : h + ' h'; }
    const d = Math.floor(sec / 86400), h = Math.round((sec - d * 86400) / 3600); return h === 24 ? (d + 1) + ' d' : h ? d + ' d ' + h + ' h' : d + ' d';
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ':' + pad(m, 2) + ':' + pad(s, 2) : m + ':' + pad(s, 2);
  }
  function fmtNum(n) {
    n = Math.floor(n || 0);
    if (n < 10000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(n < 100000 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  }

  // mulberry32 stepping on the saved state (same generator as run.js)
  function rand(s) {
    let a = s.rng | 0; a = a + 0x6D2B79F5 | 0; s.rng = a >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function drawSeed(s) { return 1 + Math.floor(rand(s) * 2147483646); }

  // ------------------------------------------------------------------ derived values
  const cl = (s) => s.lv.campfire;
  const mul = (s, k) => (s && s.dev && s.dev.mul && s.dev.mul[k]) || 1;
  function capsAt(s, sh) {
    const c = B.storehouse.caps, m = mul(s, 'cost');
    return { scrap: DATA.scale(c.scrap[sh], m), food: DATA.scale(c.food[sh], m), meds: DATA.scale(c.meds[sh], m) };
  }
  const caps = (s) => capsAt(s, s.lv.storehouse);
  const beds = (s) => B.bunkhouse.beds[s.lv.bunkhouse];
  const fitPeople = (s) => s.people.filter((p) => p.state === 'home');
  const personById = (s, id) => (id ? s.people.find((p) => p.id === id) || null : null);
  const freeBeds = (s) => beds(s) - s.people.length - s.gate.length - (s.recruit ? 1 : 0);
  const routeUnlocked = (s, r) => !r.radio || s.lv.radio >= r.radio;
  function frontier(s) {
    let f = null, best = DATA.ROUTES[0], bo = -1;
    for (const r of DATA.ROUTES) { if (!routeUnlocked(s, r)) continue; const o = odds(s, r.id, null, { deltas: false }).odds; if (o >= 0.6) f = r; if (o > bo) { bo = o; best = r; } }
    return f || best;
  }
  const campDay = (s) => Math.floor((s.createdAt + s.tzOffsetMs + s.campNow) / DAY);
  const nextMidnight = (s) => (Math.max(campDay(s), s.daily.day) + 1) * DAY - s.createdAt - s.tzOffsetMs;
  function workers(s) {
    let n = fitPeople(s).length; const w = { salvage: 0, garden: 0, infirmary: 0 };
    for (let pass = 0; pass < DATA.WORKER_SLOTS; pass++) for (const id of DATA.PRODUCERS) if (s.lv[id] > 0 && n > 0) { w[id]++; n--; }
    return w;
  }
  // Who works where (round robin over fit people at home; the rest sit by the fire) and why a slot is empty.
  function assignWork(s) {
    const fit = fitPeople(s), out = { salvage: [], garden: [], infirmary: [], fire: [] }, notes = {};
    let i = 0;
    for (let pass = 0; pass < DATA.WORKER_SLOTS; pass++) for (const id of DATA.PRODUCERS) if (s.lv[id] > 0 && i < fit.length) out[id].push(fit[i++].name);
    while (i < fit.length) out.fire.push(fit[i++].name);
    const away = s.people.filter((p) => p.state !== 'home'); let a = 0;
    for (const id of DATA.PRODUCERS) {
      if (!s.lv[id]) continue;
      const miss = DATA.WORKER_SLOTS - out[id].length; if (miss <= 0) continue;
      const who = away.slice(a, a + miss); a += who.length;
      const why = who.map((p) => p.name + (p.state === 'injured' ? ' is hurt' : ' is out on a party'));
      if (why.length < miss) why.push('not enough people');
      notes[id] = B[id].name + ' −' + miss + ' worker' + (miss > 1 ? 's' : '') + ': ' + why.join(', ');
    }
    return { assign: out, notes };
  }
  function rate(s, id, w) { const L = s.lv[id]; if (!L) return 0; w = w || workers(s); return B[id].rate[L] * (1 + DATA.WORKER_BONUS * w[id]) * mul(s, 'prod'); }
  function genInterval(s) { const L = s.lv.generator; return L ? B.generator.intervalH[L] * HOUR / mul(s, 'bat') : Infinity; }
  function gearBase(s) { return 10 + B.workbench.gear[s.lv.workbench] + B.radio.gear[s.lv.radio] + B.generator.gear[s.lv.generator]; }
  function bestWeapon(s) { let w = 'pistol'; for (const k of DATA.WEAPON_ORDER) if (k === 'pistol' || s.weapons[k]) w = k; return w; }
  const weaponOwned = (s, w) => w === 'pistol' || (DATA.WEAPONS[w] && s.weapons[w] === true);
  const isDev = (s, ctx) => !!(ctx && ctx.dev) || (!(ctx && ctx.source === 'offline') && s.dev.timeScale > 1);
  const partySlots = (s) => B.radio.partySlots[s.lv.radio];
  const activeParties = (s) => s.parties.filter((p) => !p.back);
  const injuryCut = (s) => B.infirmary.injuryCut[s.lv.infirmary];

  function nextName(s) {
    const used = new Set();
    for (const p of s.people) used.add(p.name);
    for (const g of s.gate) used.add(g.name);
    if (s.recruit) used.add(s.recruit.name);
    for (const n of s.gone) used.add(n);
    if (s.pending && s.pending.handoff && s.pending.handoff.route && s.pending.handoff.route.rescue) used.add(s.pending.handoff.route.rescue.name);
    for (const n of DATA.ROSTER) if (!used.has(n)) return n;
    for (let i = 1; ; i++) if (!used.has('Survivor ' + i)) return 'Survivor ' + i;
  }
  function newPersonId(s) {
    let m = 0;
    for (const p of s.people.concat(s.gate)) { const n = parseInt(String(p.id).slice(1), 10); if (n > m) m = n; }
    return 'p' + (m + 1);
  }
  const person = (id, name, joinedAt) => ({ id, name, state: 'home', until: null, runs: 0, wins: 0, joinedAt });

  // ------------------------------------------------------------------ costs and checks
  const reqCL = DATA.reqCL;
  function cost(id, lv, s) {
    const b = B[id]; const c = b && b.cost[lv]; if (!c) return null;
    const m = mul(s, 'cost');
    return { scrap: DATA.scale(c[0], m), food: DATA.scale(c[1], m), meds: DATA.scale(c[2], m), bp: c[3], id, lv };
  }
  function buildTime(id, lv, s) { const b = B[id]; if (!b || b.time[lv] == null) return null; return b.time[lv] * mul(s, 'time'); }
  function storehouseFor(s, c) {
    for (let L = 1; L <= 10; L++) { const cp = capsAt(s, L); if (c.scrap <= cp.scrap && c.food <= cp.food && c.meds <= cp.meds) return L; }
    return 11;
  }
  function soonestJob(s) { let j = null; for (const x of s.jobs) if (!j || x.endAt < j.endAt) j = x; return j; }

  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  function buildCheck(s, id) {
    const b = own(B, id) ? B[id] : null; if (!b) return { ok: false, reason: 'unknown', label: 'Unknown building' };
    const lv = s.lv[id] + 1;
    if (lv > b.max) return { ok: false, reason: 'max', lv: b.max, label: 'Max level' };
    const c = cost(id, lv, s), t = buildTime(id, lv, s), req = reqCL(id, lv);
    const base = { lv, cost: c, time: t, reqCL: req };
    const job = s.jobs.find((j) => j.id === id);
    if (job) return Object.assign(base, { ok: false, reason: 'busy', label: 'Upgrading · ' + fmtClock((job.endAt - s.campNow) / SEC) });
    if (cl(s) < req) return Object.assign(base, { ok: false, reason: 'cl', label: 'Needs Camp Lv ' + req });
    if (id === 'campfire' && s.people.length < b.survivors[lv]) return Object.assign(base, { ok: false, reason: 'survivors', need: b.survivors[lv], label: 'Needs ' + b.survivors[lv] + ' survivors' });
    const cp = caps(s);
    if (c.scrap > cp.scrap || c.food > cp.food || c.meds > cp.meds) { const n = storehouseFor(s, c); return Object.assign(base, { ok: false, reason: 'storage', need: n, label: 'Needs Storehouse Lv ' + n }); }
    if (c.bp > s.res.bp) return Object.assign(base, { ok: false, reason: 'bp', need: c.bp, label: 'Needs ' + c.bp + ' Blueprints' });
    if (s.jobs.length >= s.crews) { const j = soonestJob(s); return Object.assign(base, { ok: false, reason: 'crews', label: 'Crews busy · next free in ' + fmtClock((j.endAt - s.campNow) / SEC) }); }
    const missing = {}; let any = false;
    for (const k of RES) if (s.res[k] < c[k]) { missing[k] = c[k] - s.res[k]; any = true; }
    if (any) {
      const k = RES.find((x) => missing[x]);
      return Object.assign(base, { ok: false, reason: 'resources', missing, label: 'Need ' + missing[k] + ' ' + RES_NAME[k] });
    }
    return Object.assign(base, { ok: true, reason: null, label: (s.lv[id] ? 'UPGRADE · ' : 'BUILD · ') + (t <= 60 ? fmtDur(t) : fmtClock(t)) });
  }

  function priceSkip(sec, s) {
    const d = s && s.dev ? s.dev : null;
    const free = d ? d.freeSec : DATA.SKIP.freeSec, exp = d ? d.skipExp : DATA.SKIP.exp, m = d ? mul(s, 'skip') : DATA.SKIP.mul;
    if (!(sec > free)) return 0;
    return Math.max(1, Math.ceil(m * Math.pow(sec / 60, exp)));
  }
  // Shortfall "Build now": priced as the production time of what is missing. Never for BP, survivors,
  // a CL gate, storage, busy crews, or a resource with 0 income.
  function priceShortfall(s, c) {
    if (!c) return null;
    if (c.id) { const chk = buildCheck(s, c.id); if (chk.reason !== 'resources') return null; } else {
      const cp = caps(s); if (c.scrap > cp.scrap || c.food > cp.food || c.meds > cp.meds || (c.bp || 0) > s.res.bp) return null;
    }
    const w = workers(s); let price = 0; const parts = [];
    for (const k of RES) {
      const miss = (c[k] || 0) - s.res[k]; if (miss <= 0) continue;
      const r = rate(s, RES_PROD[k], w); if (!(r > 0)) return null;
      const sec = miss / r * 3600; price += priceSkip(sec, s); parts.push({ res: k, missing: miss, sec });
    }
    if (!parts.length) return null;
    price = Math.max(1, price);
    return { price, parts, label: 'Build now: ' + parts.map((p) => fmtDur(p.sec) + ' of ' + RES_NAME[p.res]).join(', ') + ' · ' + price + ' bat' };
  }

  // ------------------------------------------------------------------ telemetry
  function newTele() {
    return {
      log: [], unlocks: {}, income: { all: {}, hourIdx: 0, hour: {}, prevHour: {} },
      bat: { earned: {}, spent: {} }, packs: {},
      runs: { total: 0, wins: 0, losses: 0, streak: 0, maxStreak: 0, frontier: 0, plays: 0, playsAfterCL3: 0, emptyPlays: 0, timeMs: 0, byRoute: {} },
      buckets: [],
      kpi: { fgMs: 0, crewIdleMs: 0, nothingMs: 0, fullMs: { scrap: 0, food: 0, meds: 0 }, injuredMs: 0,
        waste: { salvage: 0, garden: 0, infirmary: 0, generator: 0, truck: { scrap: 0, food: 0, meds: 0 } },
        items: { crafted: {}, used: {}, returned: {} }, batFirstHour: { spent: 0, under5: 0 }, devRows: 0 },
    };
  }
  function log(s, type, data, dev) {
    const L = s.tele.log;
    L.push({ real: s.realSeenAt, camp: Math.round(s.campNow), type, data: data == null ? null : data, dev: !!dev });
    if (L.length > 500) L.splice(0, L.length - 500);
    if (dev) s.tele.kpi.devRows++;
  }
  function unlock(s, key) { if (!(key in s.tele.unlocks)) s.tele.unlocks[key] = { camp: Math.round(s.campNow), real: s.realSeenAt }; }
  function addIncome(s, src, k, n) {
    if (!n) return;
    const I = s.tele.income, h = Math.floor(s.campNow / HOUR);
    if (I.hourIdx !== h) { I.prevHour = h === I.hourIdx + 1 ? I.hour : {}; I.hour = {}; I.hourIdx = h; }
    for (const bag of [I.all, I.hour]) { const b = bag[src] || (bag[src] = { scrap: 0, food: 0, meds: 0 }); b[k] += n; }
  }
  const bump = (o, k, n) => { o[k] = (o[k] || 0) + (n == null ? 1 : n); };

  function earnBat(s, n, src, ctx, raw) {
    n = raw ? Math.round(n) : Math.round(n * mul(s, 'bat'));
    if (!(n > 0)) return 0;
    const tag = src === 'pack' ? 'pack' : isDev(s, ctx) ? 'dev' : src;
    s.res.bat += n; bump(s.tele.bat.earned, tag, n);
    return n;
  }
  function spendBat(s, n, cat, leftMs) {
    s.res.bat -= n; bump(s.tele.bat.spent, cat, n);
    if (s.campNow < HOUR && /^skip/.test(cat)) { const k = s.tele.kpi.batFirstHour; k.spent += n; if (leftMs != null && leftMs <= 5 * MIN) k.under5 += n; }
  }
  // Loot into storage; overflow to the truck (up to 1x cap); the rest is lost, shown and counted.
  function gain(s, loot, src, ev, ctx) {
    const cp = caps(s), out = { stored: { scrap: 0, food: 0, meds: 0 }, truck: { scrap: 0, food: 0, meds: 0 }, lost: { scrap: 0, food: 0, meds: 0 } };
    const tag = ctx && isDev(s, ctx) && src !== 'pack' ? 'dev' : src;
    for (const k of RES) {
      const v = Math.max(0, Math.floor((loot && loot[k]) || 0)); if (!v) continue;
      const inS = Math.min(Math.max(0, cp[k] - s.res[k]), v); s.res[k] += inS;
      const over = v - inS, inT = Math.min(Math.max(0, cp[k] - s.truck[k]), over); s.truck[k] += inT;
      const lost = over - inT;
      out.stored[k] = inS; out.truck[k] = inT; out.lost[k] = lost;
      addIncome(s, tag, k, v - lost);
      if (lost > 0) { s.tele.kpi.waste.truck[k] += lost; if (ev) ev.push({ type: 'truckOverflow', res: k, lost, text: 'Truck full: ' + lost + ' ' + RES_NAME[k] + ' left behind' }); }
    }
    return out;
  }

  // ------------------------------------------------------------------ create
  function defaultDev() {
    return { timeScale: 1, mul: { prod: 1, loot: 1, cost: 1, time: 1, bat: 1, skip: 1 }, freeSec: DATA.SKIP.freeSec, skipExp: DATA.SKIP.exp,
      momentum: DATA.MOMENTUM.pct, momentumCap: DATA.MOMENTUM.cap, force: 'auto', lockSeed: null, forcedWinsSetting: DATA.START.forcedWins, skill: 0,
      runScreenSec: 8, lossPayout: DATA.LOSS_PAYOUT, injuryMin: DATA.INJURY.lossMinPerDanger, intelG: 3,
      sim: { D0: 110, night: 0.6, medCalm: 0.6 }, runUsesCampTime: true, reducedMotion: false, particles: 1, volume: 0.8, muted: false };
  }
  function create(opts) {
    opts = opts || {};
    const realNow = fin(opts.realNow, 0), tz = fin(opts.tzOffsetMs, 0);
    const seed = opts.seed != null ? (opts.seed >>> 0) : ((Math.floor(realNow) % 4294967296) ^ 0x5f3759df) >>> 0;
    const st = DATA.START;
    const routes = {}; for (const id of ROUTE_IDS) routes[id] = { runs: 0, wins: 0, firstWin: false, intel: 0 };
    const s = {
      v: CURRENT_V, createdAt: realNow, tzOffsetMs: tz, campNow: 0, realSeenAt: realNow,
      rng: seed, tabId: '', seq: 0,
      ftue: { step: 0, done: false },
      res: Object.assign({}, st.res),
      lv: Object.assign({}, st.lv),
      buf: { salvage: 0, garden: 0, infirmary: 0 },
      gen: { charges: 0, accMs: 0 },
      jobs: [],
      crews: st.crews,
      craft: { infirmary: [], workbench: [] },
      stock: { medkit: 0, pills: 0, bomb: 0 },
      weapons: { smg: false, shotgun: false, rifle: false },
      people: st.people.map((n, i) => person('p' + (i + 1), n, 0)),
      gate: [], gone: [],
      recruit: null,
      parties: [],
      truck: { scrap: 0, food: 0, meds: 0 },
      crate: null,
      pile: st.pile,
      routes,
      pity: { rescue: 0, bp: 0 },
      forcedWins: st.forcedWins,
      daily: { day: 0, wins: 0 },
      loadout: { primary: 'pistol', use: { medkit: true, pills: true, bomb: true }, runner: st.runner, route: 'R1' },
      runSeq: 0, pending: null,
      lastHandoff: null, lastResult: null, lastReward: null,
      objective: 0,
      flags: { dropGiven: false, stashGiven: false, taughtSkip: false, bombMade: false, medkitMade: false, medRunWin: false, partySent: false, genCollected: false },
      tele: newTele(),
      dev: defaultDev(),
    };
    s.tabId = 't' + Math.floor(rand(s) * 2176782336).toString(36);
    s.daily.day = campDay(s);
    s.tele.bat.earned.start = st.res.bat;
    log(s, 'create', { seed });
    return s;
  }

  // ------------------------------------------------------------------ event-stepped time
  function nextEvent(s) {
    let best = null;
    const consider = (at, kind, ref, prio) => {
      if (at == null || !isFinite(at)) return;
      if (!best || at < best.at || (at === best.at && prio < best.prio)) best = { at, kind, ref, prio };
    };
    for (const j of s.jobs) consider(j.endAt, 'job', j, 0);
    for (const b of ['infirmary', 'workbench']) { const q = s.craft[b]; if (q.length && q[0].endAt != null) consider(q[0].endAt, 'craft', b, 1); }
    if (s.recruit) consider(s.recruit.endAt, 'recruit', null, 2);
    for (const p of s.parties) if (!p.back) consider(p.endAt, 'party', p, 3);
    for (const p of s.people) if (p.state === 'injured') consider(p.until, 'injury', p, 4);
    if (s.lv.generator > 0) consider(s.campNow + Math.max(0, genInterval(s) - s.gen.accMs), 'gen', null, 5);
    consider(nextMidnight(s), 'day', null, 6);
    return best;
  }

  function integrate(s, dt, ev, ctx) {
    if (!(dt > 0)) return;
    const w = workers(s), h = dt / HOUR, k = s.tele.kpi;
    for (const id of DATA.PRODUCERS) {
      const L = s.lv[id]; if (!L) continue;
      const r = rate(s, id, w), cap = r * B[id].holds[L], add = r * h, b = s.buf[id];
      if (b >= cap) { k.waste[id] += add; if (ctx && ctx.fullMs) bump(ctx.fullMs, id, dt); continue; }
      if (b + add >= cap) {
        s.buf[id] = cap; k.waste[id] += b + add - cap;
        if (ctx && ctx.fullMs && r > 0) bump(ctx.fullMs, id, dt - (cap - b) / r * HOUR);
        ev.push({ type: 'full', id });
      } else s.buf[id] = b + add;
    }
    if (s.lv.generator > 0) s.gen.accMs += dt;
    const cp = caps(s);
    for (const r of RES) if (s.res[r] >= cp[r]) k.fullMs[r] += dt;
    let inj = 0; for (const p of s.people) if (p.state === 'injured') inj++;
    if (inj) k.injuredMs += inj * dt;
  }

  function advance(s, ms, ctx) {
    ctx = ctx || { source: 'frame' };
    const ev = [];
    ms = fin(ms, 0); if (ms < 0) ms = 0;
    const end = s.campNow + ms;
    for (let guard = 0; guard < 500000; guard++) {
      const n = nextEvent(s);
      if (!n || n.at > end) break;
      if (n.at > s.campNow) { integrate(s, n.at - s.campNow, ev, ctx); s.campNow = n.at; }
      applyEvent(s, n, ev, ctx);
    }
    if (end > s.campNow) { integrate(s, end - s.campNow, ev, ctx); s.campNow = end; }
    afterChange(s, ev, ctx);
    return ev;
  }

  function applyEvent(s, n, ev, ctx) {
    if (n.kind === 'job') {
      const i = s.jobs.indexOf(n.ref); if (i >= 0) s.jobs.splice(i, 1);
      completeJob(s, n.ref, ev, ctx);
    } else if (n.kind === 'craft') {
      const q = s.craft[n.ref], c = q.shift();
      s.stock[c.item] = Math.min(DATA.STOCK_MAX, s.stock[c.item] + 1);
      if (c.item === 'medkit') s.flags.medkitMade = true;
      if (c.item === 'bomb') s.flags.bombMade = true;
      bump(s.tele.kpi.items.crafted, c.item);
      if (q.length) q[0].endAt = s.campNow + q[0].dur;
      ev.push({ type: 'craftDone', building: n.ref, item: c.item, text: B[n.ref].name + ' made ' + itemCount(c.item, 1) });
    } else if (n.kind === 'recruit') {
      const r = s.recruit; s.recruit = null;
      const p = person(newPersonId(s), r.name, Math.round(s.campNow));
      s.people.push(p);
      unlock(s, 'survivors' + s.people.length);
      ev.push({ type: 'recruitDone', id: p.id, name: p.name, text: DATA.ARRIVAL_LINES.recruit.replace('{name}', p.name) });
    } else if (n.kind === 'party') {
      const pa = n.ref; pa.back = true;
      const p = personById(s, pa.who);
      if (p && p.state === 'party') { p.state = 'home'; p.until = null; }
      const lines = DATA.PARTY_LINES, line = lines[Math.floor(rand(s) * lines.length)].replace('{name}', p ? p.name : 'The party');
      ev.push({ type: 'partyBack', id: pa.id, who: pa.who, name: p ? p.name : '', kind: pa.kind, loot: Object.assign({}, pa.loot), text: line });
    } else if (n.kind === 'injury') {
      const p = n.ref; p.state = 'home'; p.until = null;
      ev.push({ type: 'healed', id: p.id, name: p.name, text: p.name + ' is healed' });
    } else if (n.kind === 'gen') {
      const iv = genInterval(s);
      s.gen.accMs = Math.max(0, s.gen.accMs - iv); if (s.gen.accMs < 1e-6) s.gen.accMs = 0;
      const holds = B.generator.holds[s.lv.generator];
      if (s.gen.charges < holds) { s.gen.charges++; ev.push({ type: 'genCharge', charges: s.gen.charges }); } else { s.tele.kpi.waste.generator++; ev.push({ type: 'waste', what: 'generator', n: 1 }); }
    } else if (n.kind === 'day') {
      s.daily = { day: Math.max(campDay(s), s.daily.day + 1), wins: 0 };
      ev.push({ type: 'dayRollover', day: s.daily.day });
    }
  }

  function completeJob(s, j, ev, ctx) {
    const id = j.id, lv = j.toLv;
    s.lv[id] = lv; unlock(s, id + lv);
    ev.push({ type: 'jobDone', id, lv, text: B[id].name + ' ' + lv + ' finished' });
    if (id === 'campfire') {
      const bat = earnBat(s, B.campfire.bat[lv], 'cl', ctx);
      const news = DATA.BUILDING_IDS.filter((b) => B[b].unlockCL === lv).map((b) => B[b].name);
      if (lv >= DATA.CREW.freeAtCL && s.crews < 2) { s.crews = 2; unlock(s, 'crew2'); ev.push({ type: 'crew', crews: 2 }); }
      ev.push({ type: 'clUp', cl: lv, bat, news, crew3ForSale: lv === DATA.CREW.thirdFromCL, final: lv === 10,
        text: 'Camp Lv ' + lv + (news.length ? ' · New: ' + news.join(', ') : '') + (lv === DATA.CREW.thirdFromCL ? ' · build crew 3 for sale' : '') + ' · Every building to Lv ' + lv + ' · +' + bat + ' batteries' });
    } else if ((id === 'salvage' || id === 'garden') && lv === 1) {
      s.buf[id] = Math.max(s.buf[id], rate(s, id) * DATA.FIRST_BUILD_BUFFER_H);
    } else if (id === 'infirmary' && lv === 1 && !s.flags.stashGiven) {
      s.flags.stashGiven = true; s.buf.infirmary += B.infirmary.stash;
    } else if (id === 'radio' && lv === 1 && !s.flags.dropGiven) {
      s.flags.dropGiven = true; const d = DATA.SUPPLY_DROP;
      const room = (k) => Math.max(0, DATA.STOCK_MAX - s.stock[k] - s.craft[DATA.CRAFTS[k].building].filter((c) => c.item === k).length);
      const mk = Math.min(d.medkit, room('medkit')), pl = Math.min(d.pills, room('pills'));
      s.stock.medkit += mk; s.stock.pills += pl;
      const g = gain(s, { scrap: d.scrap, meds: (d.medkit - mk) * DATA.CRAFTS.medkit.cost.meds + (d.pills - pl) * DATA.CRAFTS.pills.cost.meds }, 'drop', ev, ctx);
      ev.push({ type: 'supplyDrop', medkit: mk, pills: pl, meds: (d.medkit - mk) * DATA.CRAFTS.medkit.cost.meds + (d.pills - pl) * DATA.CRAFTS.pills.cost.meds, scrap: d.scrap, stored: g.stored });
    } else if (id === 'bunkhouse') moveGate(s, ev);
    for (const r of DATA.ROUTES) if (r.radio && id === 'radio' && r.radio === lv) unlock(s, 'route:' + r.id);
  }

  function moveGate(s, ev) {
    while (s.gate.length && s.people.length + (s.recruit ? 1 : 0) < beds(s)) {
      const g = s.gate.shift(); s.people.push(person(g.id, g.name, Math.round(s.campNow)));
      unlock(s, 'survivors' + s.people.length);
      if (ev) ev.push({ type: 'arrived', id: g.id, name: g.name, text: g.name + ' moves into the Bunkhouse' });
    }
  }

  function afterChange(s, ev, ctx) {
    checkObjectives(s, ev, ctx);
    updateFtue(s, ev);
    logEvents(s, ev, ctx);
  }
  // Key events go to the session log too (screens are logged by the UI through Engine.log).
  const LOGGED = { jobDone: 1, clUp: 1, craftDone: 1, partyBack: 1, recruitDone: 1, healed: 1, objectiveDone: 1, rescued: 1, truckOverflow: 1, dayRollover: 1, supplyDrop: 1, injured: 1, crew: 1, arrived: 1 };
  const loggedEv = new WeakSet();
  function logEvents(s, ev, ctx) {
    const dev = isDev(s, ctx);
    for (const e of ev) {
      if (!LOGGED[e.type] || loggedEv.has(e)) continue;
      loggedEv.add(e);
      const d = {}; for (const k of ['id', 'lv', 'cl', 'item', 'building', 'name', 'kind', 'n', 'res', 'lost', 'day', 'where', 'min']) if (e[k] !== undefined) d[k] = e[k];
      log(s, 'ev:' + e.type, d, dev);
    }
  }

  function objDone(s, o) {
    const c = o.check;
    if (c.level && !(s.lv[c.level] >= c.lv)) return false;
    if (c.flag && !s.flags[c.flag]) return false;
    if (c.weapon && !s.weapons[c.weapon]) return false;
    if (c.wins && !(s.routes[c.wins].wins >= 1)) return false;
    if (c.survivors && s.people.length < c.survivors) return false;
    if (c.crewsOrSurvivors && !(s.crews >= c.crewsOrSurvivors[0] || s.people.length >= c.crewsOrSurvivors[1])) return false;
    return true;
  }
  function checkObjectives(s, ev, ctx) {
    const O = DATA.OBJECTIVES;
    while (s.objective < O.length && objDone(s, O[s.objective])) {
      const o = O[s.objective], idx = s.objective;
      const rw = o.reward;
      if (rw.scrap || rw.food || rw.meds) gain(s, rw, 'objective', ev, ctx);
      if (rw.bat) earnBat(s, rw.bat, 'objective', ctx);
      s.objective++; unlock(s, 'obj' + (idx + 1));
      ev.push({ type: 'objectiveDone', idx, n: idx + 1, text: o.text, reward: Object.assign({}, rw), end: !!o.end });
    }
  }
  function updateFtue(s, ev) {
    const f = s.ftue; if (f.done) return;
    for (let moved = true; moved && !f.done;) {
      moved = false;
      const st = f.step;
      if (st === 1 && s.pile === 0) f.step = 2;
      else if (st === 2 && s.lv.salvage >= 1) f.step = 3;
      else if (st === 3 && s.runSeq >= 1) f.step = 4;
      else if (st === 4 && s.runSeq >= 1 && !s.pending && !s.crate) f.step = 5;
      else if (st === 5 && cl(s) >= 2) { f.step = 6; f.done = true; }
      if (f.step !== st) { moved = true; if (ev) ev.push({ type: 'ftue', step: f.step, done: f.done }); }
    }
  }

  // ------------------------------------------------------------------ timers (skip / finish free)
  function timerRef(s, target) {
    if (!isObj(target)) return null;
    const k = target.kind, id = target.id;
    if (k === 'job') { const j = s.jobs.find((x) => x.id === id); return j ? { kind: k, id, obj: j, field: 'endAt', dur: j.dur, label: B[j.id].name + ' ' + j.toLv } : null; }
    if (k === 'craft') { const q = s.craft[id]; const c = q && q[0]; return c && c.endAt != null ? { kind: k, id, obj: c, field: 'endAt', dur: c.dur, label: ITEM_NAME[c.item] } : null; }
    if (k === 'recruit') return s.recruit ? { kind: k, id: 'recruit', obj: s.recruit, field: 'endAt', dur: s.recruit.dur, label: 'Recruit ' + s.recruit.name } : null;
    if (k === 'party') { const p = s.parties.find((x) => x.id === id && !x.back); return p ? { kind: k, id, obj: p, field: 'endAt', dur: DATA.PARTIES.kinds[p.kind].sec * SEC, label: DATA.PARTIES.kinds[p.kind].name } : null; }
    if (k === 'injury') { const p = s.people.find((x) => x.id === id && x.state === 'injured'); return p ? { kind: k, id, obj: p, field: 'until', dur: null, label: p.name + ' (hurt)' } : null; }
    return null;
  }
  const timerLeft = (s, t) => Math.max(0, t.obj[t.field] - s.campNow);
  function settle(s, ev, ctx) { const e = advance(s, 0, ctx); for (const x of e) ev.push(x); }

  // ------------------------------------------------------------------ collecting
  function collectBuffer(s, id, ev, ctx) {
    const k = PROD_RES[id], room = Math.max(0, caps(s)[k] - s.res[k]);
    const n = Math.floor(Math.min(room, s.buf[id]));
    if (n <= 0) return 0;
    s.res[k] += n; s.buf[id] -= n; if (s.buf[id] < 1e-9) s.buf[id] = 0;
    addIncome(s, isDev(s, ctx) ? 'dev' : 'prod:' + id, k, n);
    ev.push({ type: 'collected', id, amounts: { [k]: n } });
    return n;
  }
  function collectGenerator(s, ev, ctx) {
    const n = s.gen.charges; if (!n) return 0;
    s.gen.charges = 0;
    const got = earnBat(s, n, 'generator', ctx, true);
    s.flags.genCollected = true;
    ev.push({ type: 'collected', id: 'generator', amounts: { bat: got } });
    return got;
  }
  function collectParties(s, ev, ctx) {
    const back = s.parties.filter((p) => p.back); if (!back.length) return 0;
    const tot = { scrap: 0, food: 0, meds: 0 };
    for (const p of back) { for (const k of RES) tot[k] += p.loot[k]; }
    s.parties = s.parties.filter((p) => !p.back);
    const g = gain(s, tot, 'party', ev, ctx);
    ev.push({ type: 'collected', id: 'radio', amounts: tot, stored: g.stored, truck: g.truck, lost: g.lost });
    return 1;
  }
  function unloadTruck(s, ev) {
    const cp = caps(s), moved = { scrap: 0, food: 0, meds: 0 }; let any = 0;
    for (const k of RES) { const n = Math.min(s.truck[k], Math.max(0, cp[k] - s.res[k])); if (n > 0) { s.res[k] += n; s.truck[k] -= n; moved[k] = n; any += n; } }
    if (any) ev.push({ type: 'collected', id: 'truck', amounts: moved });
    return any;
  }
  function openCrateInternal(s, ev, ctx) {
    const c = s.crate; if (!c) return null;
    s.crate = null;
    const loot = { scrap: c.scrap, food: c.food, meds: c.meds };
    const g = gain(s, loot, 'run', ev, ctx);
    ev.push({ type: 'crateOpened', runId: c.runId, amounts: loot, stored: g.stored, truck: g.truck, lost: g.lost, person: c.person });
    return g;
  }

  // ------------------------------------------------------------------ runs
  const oddsCache = new Map(); let kSig = '';
  function syncK(s) {
    const d = s.dev, K = Run.K;
    const sig = d.sim.D0 + ',' + d.sim.night + ',' + d.sim.medCalm + ',' + d.intelG;
    if (sig !== kSig) { K.D0 = d.sim.D0; K.NIGHT = d.sim.night; K.MED_CALM = d.sim.medCalm; K.INTEL_G = d.intelG; oddsCache.clear(); kSig = sig; }
  }
  function mcCached(route, L) {
    const key = route.id + JSON.stringify(L);
    let v = oddsCache.get(key);
    if (v === undefined) { v = Run.mc(route, L, 400); if (oddsCache.size > 20000) oddsCache.clear(); oddsCache.set(key, v); }
    return v;
  }
  function pickRunner(s) {
    const p = personById(s, s.loadout.runner);
    if (p && p.state !== 'party') return p;
    return fitPeople(s)[0] || s.people.find((x) => x.state === 'injured') || s.people[0] || null;
  }
  function rescueFor(s, route) {
    if (!route.rescue) return null;
    return { chance: route.rescue, guaranteed: s.runSeq === 0 || s.pity.rescue >= DATA.PITY.rescue };
  }
  function loadoutFor(s, routeId, patch) {
    syncK(s); patch = patch || {};
    const route = ROUTE[routeId] || ROUTE.R1;
    const runner = personById(s, patch.runner) || pickRunner(s);
    let primary = patch.primary || s.loadout.primary; if (!weaponOwned(s, primary)) primary = bestWeapon(s);
    const use = Object.assign({}, s.loadout.use, patch.use || {});
    const item = (k) => (patch[k] != null ? (patch[k] ? 1 : 0) : (use[k] && s.stock[k] > 0 ? 1 : 0));
    const inf = s.lv.infirmary;
    return {
      primary, gearBase: gearBase(s), intel: patch.intel != null ? patch.intel : s.routes[route.id].intel,
      maxHp: B.infirmary.maxHp[inf], sw: B.infirmary.secondWind[inf],
      medkit: item('medkit'), pills: item('pills'), bomb: item('bomb'),
      hurt: patch.hurt != null ? !!patch.hurt : !!(runner && runner.state === 'injured'),
      skill: patch.skill != null ? patch.skill : s.dev.skill,
      rescue: patch.rescue !== undefined ? patch.rescue : rescueFor(s, route),
    };
  }
  function odds(s, routeId, patch, opts) {
    const route = ROUTE[routeId] || ROUTE.R1;
    const L = loadoutFor(s, route.id, patch); L.rescue = null;
    const o = mcCached(route, L), out = { odds: o, gear: Run.gear(L), deltas: { medkit: null, pills: null, bomb: null } };
    if (!opts || opts.deltas !== false) {
      for (const k of ITEMS) {
        if (!(s.stock[k] > 0)) continue;
        const w = Object.assign({}, L, { [k]: 1 }), wo = Object.assign({}, L, { [k]: 0 });
        out.deltas[k] = mcCached(route, w) - mcCached(route, wo);
      }
    }
    return out;
  }
  function runStats(s, L) {
    const maxHp = B.infirmary.maxHp[s.lv.infirmary];
    return { maxHp, startHp: L.hurt ? Math.round(maxHp * DATA.INJURY.hurtHpShare) : maxHp, secondWind: L.sw,
      damageMul: B.workbench.damageMul[s.lv.workbench], magMul: B.workbench.magMul[s.lv.workbench],
      flashlightR: B.generator.flashlightR[s.lv.generator], hordeWarnS: B.radio.hordeWarnS[s.lv.radio] + 0.5 * (L.intel || 0),
      medkitSec: DATA.RUN_STATS.medkitSec, medkitHeal: DATA.RUN_STATS.medkitHeal, bombLifeS: DATA.RUN_STATS.bombLifeS, extraCaches: DATA.RUN_STATS.extraCaches };
  }
  function buildHandoff(s, routeId, seed, opts) {
    opts = opts || {};
    const route = ROUTE[routeId] || ROUTE.R1;
    const runner = opts.runner || pickRunner(s);
    const L = opts.L || loadoutFor(s, route.id, { runner: runner && runner.id });
    const ms = Object.assign({}, DATA.MAP_SUPPLIES[route.id]); ms.weapons = [];
    if (ms.medkit > 0 && ms.medkit < 1) ms.medkit = seed == null ? ms.medkit : (Run.mulberry32((seed ^ 0x27d4eb2d) | 0)() < ms.medkit ? 1 : 0);
    const Lo = Object.assign({}, L, { rescue: null });
    const o = mcCached(route, Lo);
    const rsc = L.rescue ? { name: nextName(s), chance: L.rescue.chance, guaranteed: !!L.rescue.guaranteed } : null;
    let force = opts.force;
    if (force == null) force = s.dev.force !== 'auto' ? s.dev.force : s.forcedWins > 0 ? 'win' : 'auto';
    return {
      v: 1, runId: 'r-' + pad(opts.runSeq != null ? opts.runSeq : s.runSeq + 1, 6), seed: seed == null ? null : seed, createdAtCamp: Math.round(s.campNow),
      route: { id: route.id, name: route.name, danger: route.danger, hordeMul: route.hordeMul, zombieCap: route.cap, lengthS: route.len,
        wanderers: route.wander, hordes: route.hordes, caches: route.caches, mapSupplies: ms, rescue: rsc },
      runner: runner ? { id: runner.id, name: runner.name, hurt: runner.state === 'injured' } : null,
      loadout: { primary: L.primary, medkit: L.medkit, pills: L.pills, noiseBomb: L.bomb },
      stats: runStats(s, L), intel: L.intel || 0, gear: Run.gear(L), odds: Math.round(o * 100) / 100, force,
    };
  }
  function canStartRun(s, routeId) {
    if (s.pending) return { ok: false, err: 'A run is already under way' };
    const route = own(ROUTE, routeId) ? ROUTE[routeId] : null; if (!route) return { ok: false, err: 'Unknown route' };
    if (!routeUnlocked(s, route)) return { ok: false, err: 'Needs Radio Mast Lv ' + route.radio };
    if (!pickRunner(s)) return { ok: false, err: 'Nobody can run' };
    return { ok: true, err: null };
  }
  function resultPayload(p, r, seed) {
    return { v: 1, runId: p.handoff.runId, seed, source: 'sim', result: r.win ? 'safe_room' : 'overrun', progress: r.progress, endedAt: r.endedAt,
      time: r.time, kills: r.kills, accuracy: r.accuracy, shoves: r.shoves, damageTaken: r.damageTaken, hordes: r.hordes,
      secondWindUsed: r.secondWindUsed, used: Object.assign({}, r.used), cachesFound: r.cachesFound, rescued: r.rescued, events: r.events };
  }
  // The simulated result for the pending run. Forced outcomes search seed + k x 7919 (k = 0..199), then retry with
  // skill -1 (loss) / +1 (win). Deterministic from the pending record, so a reload replays the identical result.
  function runSim(s) {
    const p = s.pending; if (!p) return null;
    syncK(s);
    const route = ROUTE[p.handoff.route.id], L = p.L, f = p.force;
    if (f === 'auto' || !f) return resultPayload(p, Run.simulate(route, L, p.seed), p.seed);
    const match = (x) => (f === 'win' ? x.win : f === 'loss' ? !x.win : f === 'gateLoss' ? !x.win && x.endedAt === 'gate' : true);
    for (const skill of [L.skill || 0, f === 'win' ? 1 : -1]) {
      const LL = skill === (L.skill || 0) ? L : Object.assign({}, L, { skill });
      let hurtWin = null;                                      // a forced win prefers a seed that leaves the runner unhurt
      for (let k = 0; k < 200; k++) {
        const sd = (p.seed + k * 7919) >>> 0, x = Run.simulate(route, LL, sd);
        if (!match(x)) continue;
        if (f !== 'win' || !x.secondWindUsed) return resultPayload(p, x, sd);
        if (!hurtWin) hurtWin = [x, sd];
      }
      if (hurtWin) return resultPayload(p, hurtWin[0], hurtWin[1]);
    }
    return resultPayload(p, Run.simulate(route, L, p.seed), p.seed);
  }

  function seedOf(res, pending, notes) {
    const want = pending.seed >>> 0, got = typeof res.seed === 'number' && isFinite(res.seed) ? Math.floor(res.seed) >>> 0 : want;
    const d = (got - want + 4294967296) % 4294967296;
    if (got === want || (pending.force && pending.force !== 'auto' && d % 7919 === 0 && d / 7919 < 200)) return got;
    notes.push('seed ignored: the camp uses the handoff seed'); return want;
  }
  function validateResult(res, pending) {
    const errors = [], notes = [];
    if (!pending || !pending.handoff) return { ok: false, res: null, errors: ['No run is waiting for a result'], notes };
    if (!isObj(res)) return { ok: false, res: null, errors: ['Not a result object'], notes };
    if (res.v !== 1) errors.push('Unknown version: v must be 1');
    if (res.runId !== pending.handoff.runId) errors.push('This result is from a different run');
    if (res.result !== 'safe_room' && res.result !== 'overrun') errors.push('result must be "safe_room" or "overrun"');
    if (errors.length) return { ok: false, res: null, errors, notes };
    const h = pending.handoff, win = res.result === 'safe_room';
    const num = (k, lo, hi, int) => {
      let v = res[k];
      if (typeof v !== 'number' || !isFinite(v)) { if (v !== undefined) notes.push(k + ' is not a number'); v = lo; }
      let c = Math.min(hi, Math.max(lo, v)); if (int) c = Math.round(c);
      if (c !== v) notes.push(k + ' clamped to ' + c);
      return c;
    };
    const usedIn = isObj(res.used) ? res.used : {};
    const used = {};
    for (const [k, lk] of [['medkit', 'medkit'], ['pills', 'pills'], ['noiseBomb', 'noiseBomb']]) {
      const v = Math.round(clampN(usedIn[k], 0, 1, 0)), max = h.loadout[lk] || 0;
      if (v > max) notes.push('used.' + k + ' clamped to ' + max + ' (not equipped)');
      used[k] = Math.min(v, max);
    }
    const maxCaches = h.route.caches + (h.stats.extraCaches || 0);
    let rescued = res.rescued === true;
    if (rescued && (!win || !h.route.rescue)) { notes.push('rescued ignored'); rescued = false; }
    let endedAt = win ? null : (['wander', 'horde', 'gate'].includes(res.endedAt) ? res.endedAt : null);
    const events = Array.isArray(res.events) ? res.events.filter((e) => Array.isArray(e) && typeof e[0] === 'number' && isFinite(e[0]) && typeof e[1] === 'string').slice(0, 200).map((e) => e.slice(0, 6)) : [];
    const out = {
      v: 1, runId: res.runId, seed: seedOf(res, pending, notes),
      source: ['sim', 'paste', 'game'].includes(res.source) ? res.source : 'paste', result: res.result,
      progress: win ? 1 : num('progress', 0, 1), endedAt,
      time: num('time', 0, 1800, true), kills: num('kills', 0, 2000, true), accuracy: num('accuracy', 0, 100, true),
      shoves: num('shoves', 0, 2000, true), damageTaken: num('damageTaken', 0, 5000, true), hordes: num('hordes', 0, 10, true),
      secondWindUsed: num('secondWindUsed', 0, 2, true), used, cachesFound: Math.min(maxCaches, num('cachesFound', 0, 99, true)),
      rescued, events,
    };
    if (win && res.progress !== undefined && res.progress !== 1) notes.push('progress set to 1 for a win');
    return { ok: true, res: out, errors: [], notes };
  }

  // What a validated result pays (SPEC 5.6). Reads the state, never changes it. Drop rolls are seeded by the run seed.
  function reward(s, route, res, pend) {
    pend = pend || s.pending;
    syncK(s);
    const win = res.result === 'safe_room', seed = fin(res.seed, pend ? pend.seed : 0);
    const h = Run.haul(route, res, seed, s.dev.lossPayout, mul(s, 'loot'));
    const rs = s.routes[route.id];
    const R = Run.mulberry32((seed ^ 0x85ebca6b) | 0), bpRoll = R(), batRoll = R();
    const ho = pend && pend.handoff;
    const lo = ho ? ho.loadout : { medkit: 0, pills: 0, noiseBomb: 0 };
    const runnerId = ho && ho.runner ? ho.runner.id : null;
    const out = {
      win, route: route.id, runId: res.runId, seed,
      haul: { scrap: h.scrap, food: h.food, meds: h.meds, parts: h.parts },
      bp: { first: 0, drop: 0, pity: false, total: 0 }, bat: [], batTotal: 0,
      rescue: null, intel: { before: rs.intel, after: rs.intel }, injury: null,
      items: { used: { medkit: res.used.medkit, pills: res.used.pills, bomb: res.used.noiseBomb },
        returned: { medkit: (lo.medkit || 0) - res.used.medkit, pills: (lo.pills || 0) - res.used.pills, bomb: (lo.noiseBomb || 0) - res.used.noiseBomb } },
      pity: { rescue: s.pity.rescue, bp: s.pity.bp }, daily: null,
    };
    const cut = 1 - injuryCut(s);
    if (win) {
      if (!rs.firstWin) { out.bp.first = DATA.ROUTE_FIRST_WIN_BP; out.bat.push({ src: 'firstWin', n: route.firstBat }); }
      if (route.bp > 0) {
        if (bpRoll < route.bp || s.pity.bp >= DATA.PITY.bp) { out.bp.drop = 1; out.bp.pity = !(bpRoll < route.bp); out.pity.bp = 0; } else out.pity.bp = s.pity.bp + 1;
      }
      const today = campDay(s), wins = s.daily.day === today ? s.daily.wins : 0;
      if (wins < DATA.DAILY.wins) out.bat.push({ src: 'dailyWin', n: DATA.DAILY.bat });
      out.daily = { day: today, wins: wins + 1 };
      const drop = DATA.ROUTE_BAT_DROP[route.id];
      if (drop && batRoll < drop[0]) out.bat.push({ src: 'drop', n: drop[1] });
      if (res.rescued && ho && ho.route.rescue) {
        const name = ho.route.rescue.name;
        const where = s.people.length + (s.recruit ? 1 : 0) < beds(s) ? 'bed' : s.gate.length < DATA.GATE_MAX ? 'gate' : 'food';
        out.rescue = { name, where, place: DATA.ROUTE_PLACE[route.id], food: where === 'food' ? DATA.EXTRA_RESCUE_FOOD : 0 };
        out.pity.rescue = 0;
      } else out.pity.rescue = s.pity.rescue + 1;
      out.intel.after = 0;
      if (res.secondWindUsed > 0) out.injury = { who: runnerId, min: DATA.INJURY.swWinMinPerDanger * route.danger * cut };
    } else {
      out.intel.after = Math.min(3, rs.intel + 1);
      out.injury = { who: runnerId, min: s.dev.injuryMin * route.danger * cut };
    }
    if (out.injury && !(out.injury.min > 0)) out.injury = null;
    out.bp.total = out.bp.first + out.bp.drop;
    out.batTotal = out.bat.reduce((a, b) => a + Math.round(b.n * mul(s, 'bat')), 0);
    return out;
  }

  function applyMomentum(s, ev) {
    const pct = s.dev.momentum, capShare = s.dev.momentumCap, out = [];
    if (!(pct > 0) || !(capShare > 0)) return out;
    const cutOne = (t, kind, id, label) => {
      const left = t.endAt - s.campNow; if (!(left > 0)) return;
      const room = capShare * t.dur - t.cut; if (!(room > 0)) return;
      const c = Math.min(left, room, Math.max(DATA.MOMENTUM.minSec * SEC, pct * left));
      t.endAt -= c; t.cut += c;
      out.push({ kind, id, label, cutMs: c, share: t.cut / t.dur, cap: capShare,
        text: label + ' −' + fmtDur(c / SEC) + ' (' + Math.round(100 * t.cut / t.dur) + ' / ' + Math.round(100 * capShare) + '%)' });
    };
    for (const j of s.jobs) cutOne(j, 'job', j.id, B[j.id].name + ' ' + j.toLv);
    for (const b of ['infirmary', 'workbench']) { const c = s.craft[b][0]; if (c && c.endAt != null) cutOne(c, 'craft', b, B[b].name + ' ' + ITEM_NAME[c.item]); }
    if (s.recruit) cutOne(s.recruit, 'recruit', 'recruit', 'Recruit ' + s.recruit.name);
    if (out.length) ev.push({ type: 'momentum', cuts: out, text: 'Crews pushed: ' + out.map((x) => x.text).join(', ') });
    return out;
  }

  // ------------------------------------------------------------------ actions
  const fail = (err, extra) => Object.assign({ err }, extra || {});
  function payCost(s, c) { for (const k of RES) s.res[k] -= c[k] || 0; if (c.bp) s.res.bp -= c.bp; }
  function startJob(s, id, chk, ev) {
    payCost(s, chk.cost);
    const dur = chk.time * SEC;
    const j = { id, toLv: chk.lv, startAt: s.campNow, endAt: s.campNow + dur, dur, cut: 0 };
    s.jobs.push(j);
    ev.push({ type: 'jobStarted', id, lv: chk.lv, cost: { scrap: chk.cost.scrap, food: chk.cost.food, meds: chk.cost.meds, bp: chk.cost.bp }, dur });
    return j;
  }
  function skipTimer(s, t, ev, ctx) { t.obj[t.field] = s.campNow; settle(s, ev, ctx); }

  const ACTIONS = {
    tapFire(s, a, ev) { if (s.ftue.step === 0) s.ftue.step = 1; ev.push({ type: 'fireLit' }); return {}; },
    takePile(s, a, ev, ctx) {
      if (!(s.pile > 0)) return fail('The pile is gone');
      const n = s.pile; s.pile = 0;
      const g = gain(s, { scrap: n }, 'pile', ev, ctx);
      ev.push({ type: 'collected', id: 'pile', amounts: { scrap: n }, stored: g.stored });
      return {};
    },
    build(s, a, ev) {
      const chk = buildCheck(s, a.id); if (!chk.ok) return fail(chk.label, { reason: chk.reason });
      startJob(s, a.id, chk, ev); return { logData: { id: a.id, lv: chk.lv } };
    },
    buildNow(s, a, ev) {
      const chk = buildCheck(s, a.id);
      if (chk.ok) { startJob(s, a.id, chk, ev); return { price: 0, logData: { id: a.id, lv: chk.lv, price: 0 } }; }
      if (chk.reason !== 'resources') return fail(chk.label, { reason: chk.reason });
      const p = priceShortfall(s, chk.cost); if (!p) return fail('Build now is not offered here', { reason: 'noIncome' });
      if (s.res.bat < p.price) return fail('Not enough batteries', { reason: 'bat', price: p.price });
      spendBat(s, p.price, 'shortfall');
      for (const k of RES) s.res[k] = Math.max(s.res[k], chk.cost[k]);
      startJob(s, a.id, chk, ev);
      return { price: p.price, logData: { id: a.id, lv: chk.lv, price: p.price } };
    },
    finishFree(s, a, ev, ctx) {
      const t = timerRef(s, a.target); if (!t) return fail('No such timer');
      if (timerLeft(s, t) > s.dev.freeSec * SEC) return fail('Not free yet');
      skipTimer(s, t, ev, ctx); return { logData: { kind: t.kind, id: t.id } };
    },
    skip(s, a, ev, ctx) {
      const t = timerRef(s, a.target); if (!t) return fail('No such timer');
      const left = timerLeft(s, t), price = priceSkip(left / SEC, s);
      if (price === 0) { skipTimer(s, t, ev, ctx); return { price: 0, logData: { kind: t.kind, id: t.id, price: 0 } }; }
      if (price >= DATA.SKIP.confirmAt && !a.confirm) return fail('Confirm ' + price + '?', { needConfirm: true, price });
      if (s.res.bat < price) return fail('Not enough batteries', { reason: 'bat', price });
      spendBat(s, price, 'skip:' + t.kind, left);
      s.flags.taughtSkip = true;
      ev.push({ type: 'skipped', kind: t.kind, id: t.id, price, label: t.label });
      skipTimer(s, t, ev, ctx);
      return { price, logData: { kind: t.kind, id: t.id, price, leftMs: Math.round(left) } };
    },
    collect(s, a, ev, ctx) {
      const id = a.id; let n = 0;
      if (own(PROD_RES, id)) n = collectBuffer(s, id, ev, ctx);
      else if (id === 'generator') n = collectGenerator(s, ev, ctx);
      else if (id === 'radio') n = collectParties(s, ev, ctx);
      else if (id === 'truck') n = unloadTruck(s, ev);
      else if (id === 'crate') n = openCrateInternal(s, ev, ctx) ? 1 : 0;
      else return fail('Nothing to collect there');
      if (!n) return fail(PROD_RES[id] && s.buf[id] >= 1 ? 'Storage full' : 'Nothing to collect');
      return { logData: { id } };
    },
    collectAll(s, a, ev, ctx) {
      unloadTruck(s, ev);
      for (const id of DATA.PRODUCERS) if (s.lv[id]) collectBuffer(s, id, ev, ctx);
      collectGenerator(s, ev, ctx);
      collectParties(s, ev, ctx);
      openCrateInternal(s, ev, ctx);
      moveGate(s, ev);
      return {};
    },
    openCrate(s, a, ev, ctx) { if (!s.crate) return fail('No crate'); openCrateInternal(s, ev, ctx); return {}; },
    unloadTruck(s, a, ev) { if (!unloadTruck(s, ev)) return fail(s.truck.scrap + s.truck.food + s.truck.meds ? 'Storage full' : 'The truck is empty'); return {}; },
    craft(s, a, ev) {
      const d = own(DATA.CRAFTS, a.item) ? DATA.CRAFTS[a.item] : null; if (!d || (a.building && d.building !== a.building)) return fail('Unknown recipe');
      const b = d.building;
      if (s.lv[b] < d.minLv) return fail('Needs ' + B[b].name + ' Lv ' + d.minLv);
      const q = s.craft[b]; if (q.length >= DATA.QUEUE_MAX) return fail('Queue full');
      const queued = q.filter((c) => c.item === a.item).length;
      if (s.stock[a.item] + queued + 1 > DATA.STOCK_MAX) return fail('Stock full');
      for (const k of RES) if (s.res[k] < (d.cost[k] || 0)) return fail('Need ' + (d.cost[k] - s.res[k]) + ' ' + RES_NAME[k], { reason: 'resources' });
      payCost(s, d.cost);
      const dur = d.time * SEC * mul(s, 'time');
      q.push({ item: a.item, dur, endAt: q.length ? null : s.campNow + dur, cut: 0 });
      ev.push({ type: 'craftStarted', building: b, item: a.item, cost: Object.assign({}, d.cost), dur });
      return { logData: { item: a.item } };
    },
    unlockWeapon(s, a, ev) {
      const w = DATA.WEAPONS[a.weapon]; if (!w || a.weapon === 'pistol') return fail('Unknown weapon');
      if (s.weapons[a.weapon]) return fail('Already unlocked');
      if (s.lv.workbench < w.wb) return fail('Needs Workbench Lv ' + w.wb);
      if (s.res.bp < w.bp) return fail('Needs ' + w.bp + ' Blueprints', { reason: 'bp' });
      s.res.bp -= w.bp; s.weapons[a.weapon] = true; unlock(s, 'weapon:' + a.weapon);
      if (w.rank > DATA.WEAPONS[s.loadout.primary].rank) s.loadout.primary = a.weapon;
      ev.push({ type: 'weapon', weapon: a.weapon, name: w.name });
      return { logData: { weapon: a.weapon } };
    },
    recruit(s, a, ev) {
      if (s.lv.radio < DATA.RECRUIT.radioMin) return fail('Needs Radio Mast Lv 1');
      if (s.recruit) return fail('Already recruiting');
      if (freeBeds(s) < 1) return fail('No free bed', { reason: 'beds' });
      const n = s.people.length, food = DATA.RECRUIT.foodPer * n;
      if (s.res.food < food) return fail('Need ' + (food - s.res.food) + ' food', { reason: 'resources' });
      s.res.food -= food;
      const dur = DATA.RECRUIT.minutesPer * Math.pow(n, DATA.RECRUIT.exp) * MIN * mul(s, 'time');
      const name = nextName(s);
      s.recruit = { name, endAt: s.campNow + dur, dur, cut: 0 };
      ev.push({ type: 'recruitStarted', name, food, dur });
      return { logData: { name } };
    },
    sendParty(s, a, ev) {
      const kind = own(DATA.PARTIES.kinds, a.kind) ? DATA.PARTIES.kinds[a.kind] : null; if (!kind) return fail('Unknown party');
      if (s.lv.radio < DATA.PARTIES.minRadio) return fail('Needs Radio Mast Lv ' + DATA.PARTIES.minRadio);
      if (activeParties(s).length >= partySlots(s)) return fail('No free party slot');
      const rid = s.pending && s.pending.handoff.runner ? s.pending.handoff.runner.id : null;
      const fit = fitPeople(s).filter((p) => p.id !== rid); if (fit.length < 2) return fail('Someone has to stay at camp');
      const who = fit[fit.length - 1];
      const m = B.radio.partyMul[s.lv.radio];
      const loot = {}; for (const k of RES) loot[k] = Math.round(kind.loot[k] * m);
      const dur = kind.sec * SEC * mul(s, 'time');
      const pa = { id: 'x' + (s.seq + 1), who: who.id, kind: a.kind, endAt: s.campNow + dur, loot, back: false };
      s.parties.push(pa);
      who.state = 'party'; who.until = pa.endAt;
      if (s.loadout.runner === who.id) { const f2 = fitPeople(s)[0]; if (f2) s.loadout.runner = f2.id; }
      s.flags.partySent = true;
      ev.push({ type: 'partySent', id: pa.id, who: who.id, name: who.name, kind: a.kind, dur });
      return { logData: { kind: a.kind, who: who.name } };
    },
    buyCrew(s, a, ev) {
      if (s.crews >= DATA.CREW.max) return fail('All crews hired');
      if (cl(s) < DATA.CREW.thirdFromCL) return fail('From Camp Lv ' + DATA.CREW.thirdFromCL);
      if (s.res.bat < DATA.CREW.thirdPrice) return fail('Not enough batteries', { reason: 'bat', price: DATA.CREW.thirdPrice });
      spendBat(s, DATA.CREW.thirdPrice, 'crew');
      s.crews = DATA.CREW.max; unlock(s, 'crew3');
      ev.push({ type: 'crew', crews: s.crews });
      return {};
    },
    claimPack(s, a, ev) {
      const n = own(DATA.PACKS, a.size) ? DATA.PACKS[a.size] : 0; if (!n) return fail('Unknown pack');
      earnBat(s, n, 'pack', null, true); bump(s.tele.packs, a.size);
      log(s, 'pack_claimed', { size: a.size }, false);
      ev.push({ type: 'packClaimed', size: a.size, bat: n });
      return {};
    },
    setLoadout(s, a) {
      const p = isObj(a.patch) ? a.patch : {};
      if (p.primary != null && !weaponOwned(s, p.primary)) return fail('Weapon not unlocked');
      if (p.runner != null) { const r = personById(s, p.runner); if (!r) return fail('Unknown survivor'); if (r.state === 'party') return fail(r.name + ' is out on a party'); }
      if (p.route != null) { const r = own(ROUTE, p.route) ? ROUTE[p.route] : null; if (!r) return fail('Unknown route'); if (!routeUnlocked(s, r)) return fail('Needs Radio Mast Lv ' + r.radio); }
      if (p.primary != null) s.loadout.primary = p.primary;
      if (isObj(p.use)) for (const k of ITEMS) if (typeof p.use[k] === 'boolean') s.loadout.use[k] = p.use[k];
      if (p.runner != null) s.loadout.runner = p.runner;
      if (p.route != null) s.loadout.route = p.route;
      return {};
    },
    startRun(s, a, ev) {
      const routeId = a.routeId || s.loadout.route;
      const can = canStartRun(s, routeId); if (!can.ok) return fail(can.err);
      const route = ROUTE[routeId], runner = pickRunner(s);
      const seed = s.dev.lockSeed != null ? (s.dev.lockSeed >>> 0) : drawSeed(s);
      let force = s.dev.force;
      if (force !== 'auto') s.dev.force = 'auto';
      if (s.forcedWins > 0) { s.forcedWins--; if (force === 'auto') force = 'win'; }
      const L = loadoutFor(s, route.id, { runner: runner.id });
      const cl3 = cl(s) >= 3, fr = frontier(s).id === route.id;
      s.runSeq++;
      const handoff = buildHandoff(s, route.id, seed, { L, runner, force, runSeq: s.runSeq });
      s.pending = { handoff, force, seed, source: a.external ? 'game' : 'sim', L };
      s.loadout.route = route.id; s.loadout.runner = runner.id;
      s.lastHandoff = handoff;
      const T = s.tele.runs; T.plays++; if (fr) T.frontier++;
      if (cl3) { T.playsAfterCL3++; if (!(s.stock.medkit > 0) && !(s.stock.pills > 0)) T.emptyPlays++; }
      unlock(s, 'firstRun');
      ev.push({ type: 'runStarted', runId: handoff.runId, route: route.id, odds: handoff.odds, force, external: !!a.external });
      return { handoff, logData: { runId: handoff.runId, route: route.id, odds: handoff.odds, force } };
    },
    resolveRun(s, a, ev, ctx) {
      const p = s.pending; if (!p) return fail('No run is waiting for a result');
      const v = validateResult(a.result, p); if (!v.ok) return fail(v.errors[0], { errors: v.errors });
      const res = v.res, route = ROUTE[p.handoff.route.id], win = res.result === 'safe_room';
      const runCtx = { source: 'run', dev: !s.dev.runUsesCampTime || isDev(s, ctx) };
      if (s.dev.runUsesCampTime && res.time > 0) { const e = advance(s, res.time * SEC, runCtx); for (const x of e) ev.push(x); }
      const mom = win ? applyMomentum(s, ev) : [];
      const rw = reward(s, route, res, p);
      if (s.crate) openCrateInternal(s, ev, ctx);
      s.crate = { runId: res.runId, scrap: rw.haul.scrap, food: rw.haul.food, meds: rw.haul.meds, person: null };
      const rs = s.routes[route.id];
      rs.runs++;
      if (win) { rs.wins++; if (!rs.firstWin) { rs.firstWin = true; unlock(s, 'firstWin:' + route.id); } }
      rs.intel = rw.intel.after;
      s.res.bp += rw.bp.total;
      s.pity.bp = rw.pity.bp; s.pity.rescue = rw.pity.rescue;
      if (rw.daily) s.daily = rw.daily;
      for (const b of rw.bat) earnBat(s, b.n, b.src, runCtx);
      const runner = personById(s, p.handoff.runner && p.handoff.runner.id);
      if (runner) { runner.runs++; if (win) runner.wins++; }
      if (rw.injury && runner && runner.state !== 'party') {
        const until = s.campNow + rw.injury.min * MIN;
        runner.state = 'injured'; runner.until = Math.max(runner.until || 0, until);
        ev.push({ type: 'injured', id: runner.id, name: runner.name, min: rw.injury.min, text: runner.name + ' is hurt, back in ' + fmtDur(rw.injury.min * 60) });
        if (s.loadout.runner === runner.id) { const f2 = fitPeople(s)[0]; if (f2) s.loadout.runner = f2.id; }
      }
      const K = s.tele.kpi.items;
      for (const k of ITEMS) {
        const u = rw.items.used[k] || 0, r = rw.items.returned[k] || 0;
        if (u) { s.stock[k] = Math.max(0, s.stock[k] - u); bump(K.used, k, u); }
        if (r) bump(K.returned, k, r);
      }
      if (rw.rescue) {
        const r = rw.rescue; s.crate.person = r.name;
        if (r.where === 'bed') { const np = person(newPersonId(s), r.name, Math.round(s.campNow)); s.people.push(np); unlock(s, 'survivors' + s.people.length); }
        else if (r.where === 'gate') s.gate.push({ id: newPersonId(s), name: r.name });
        else { s.crate.food += r.food; s.gone.push(r.name); if (s.gone.length > 200) s.gone.splice(0, s.gone.length - 200); }
        const line = (r.where === 'bed' ? DATA.ARRIVAL_LINES.rescue : DATA.ARRIVAL_LINES[r.where]).replace('{name}', r.name).replace('{place}', r.place);
        ev.push({ type: 'rescued', name: r.name, where: r.where, text: line });
      }
      if (win && p.handoff.loadout.medkit) s.flags.medRunWin = true;
      s.lastResult = res; s.lastReward = rw; s.pending = null;
      // telemetry
      const T = s.tele.runs, br = T.byRoute[route.id] || (T.byRoute[route.id] = { n: 0, wins: 0, odds: 0 });
      T.total++; br.n++; br.odds += p.handoff.odds || 0; T.timeMs = (T.timeMs || 0) + res.time * SEC;
      if (win) { T.wins++; br.wins++; T.streak = 0; } else { T.losses++; T.streak++; if (T.streak > T.maxStreak) T.maxStreak = T.streak; }
      const bi = Math.min(9, Math.floor((p.handoff.odds || 0) * 10)), bk = s.tele.buckets[bi] || (s.tele.buckets[bi] = { n: 0, wins: 0 });
      for (let i = 0; i < 10; i++) if (!s.tele.buckets[i]) s.tele.buckets[i] = { n: 0, wins: 0 };
      bk.n++; if (win) bk.wins++;
      rw.momentum = mom;
      ev.push({ type: 'runResolved', win, runId: res.runId, route: route.id, reward: rw });
      return { reward: rw, result: res, notes: v.notes, logData: { runId: res.runId, route: route.id, win, odds: p.handoff.odds } };
    },
    dev(s, a, ev, ctx) { return devOp(s, a, ev, ctx); },
  };

  function act(s, a) {
    const ev = [];
    if (!isObj(a) || typeof a.type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, a.type)) return { ok: false, err: 'Unknown action', events: ev };
    const ctx = { source: 'act', dev: a.type === 'dev' };
    const r = ACTIONS[a.type](s, a, ev, ctx) || {};
    if (r.err) { delete r.logData; return Object.assign({ ok: false, events: ev }, r); }
    s.seq++;
    afterChange(s, ev, ctx);
    const data = r.logData || null; delete r.logData;
    log(s, a.type === 'dev' ? 'dev:' + a.op : a.type, data, a.type === 'dev');
    return Object.assign({ ok: true, err: null, events: ev }, r);
  }

  // ------------------------------------------------------------------ Lab (dev) operations
  function devOp(s, a, ev, ctx) {
    const d = s.dev, L = DATA.LAB, val = a.value;
    const setNum = (key, lo, hi) => { if (typeof val !== 'number' || !isFinite(val)) return fail('Bad value'); d[key] = clampN(val, lo, hi, d[key]); return { logData: { [key]: d[key] } }; };
    switch (a.op) {
      case 'timeScale': if (!DATA.TIME_SCALES.includes(val)) return fail('Bad time scale'); d.timeScale = val; return { logData: { timeScale: val } };
      case 'skipAhead': {
        const ms = fin(a.ms, 0); if (!(ms > 0)) return fail('Bad duration');
        const fullMs = {}; const e = advance(s, ms, { source: 'skipAhead', dev: true, fullMs });
        for (const x of e) ev.push(x);
        return { welcome: welcome(s, e, ms, fullMs), logData: { ms } };
      }
      case 'runUsesCampTime': d.runUsesCampTime = !!val; return { logData: { runUsesCampTime: d.runUsesCampTime } };
      case 'grant': {
        const w = a.what, g = L.grant;
        if (w === 'scrap' || w === 'food' || w === 'meds') gain(s, { [w]: g[w] }, 'dev', ev, ctx);
        else if (w === 'bp') s.res.bp += g.bp;
        else if (w === 'bat') earnBat(s, g.bat, 'dev', ctx, true);
        else if (w === 'survivor') {
          const name = nextName(s);
          if (s.people.length + (s.recruit ? 1 : 0) < beds(s)) s.people.push(person(newPersonId(s), name, Math.round(s.campNow)));
          else if (s.gate.length < DATA.GATE_MAX) s.gate.push({ id: newPersonId(s), name });
          else return fail('No bed and the gate is full');
        } else return fail('Unknown grant');
        return { logData: { what: w } };
      }
      case 'fillStorage': { const cp = caps(s); for (const k of RES) s.res[k] = Math.max(s.res[k], cp[k]); return {}; }
      case 'finishAll': {
        for (let guard = 0; guard < 100; guard++) {
          let any = false;
          for (const j of s.jobs) { j.endAt = s.campNow; any = true; }
          for (const b of ['infirmary', 'workbench']) { const c = s.craft[b][0]; if (c) { c.endAt = s.campNow; any = true; } }
          if (s.recruit) { s.recruit.endAt = s.campNow; any = true; }
          for (const p of s.parties) if (!p.back) { p.endAt = s.campNow; any = true; }
          for (const p of s.people) if (p.state === 'injured') { p.until = s.campNow; any = true; }
          if (!any) break;
          settle(s, ev, { source: 'act', dev: true });
        }
        return {};
      }
      case 'setCL': {
        const n = Math.round(clampN(a.n != null ? a.n : val, 1, 10, cl(s)));
        s.lv.campfire = n;
        for (const id of DATA.BUILDING_IDS) if (id !== 'campfire') { const b = B[id]; const lo = b.start; s.lv[id] = n < b.unlockCL ? Math.min(lo, 0) : Math.max(lo, Math.min(s.lv[id], n)); }
        s.jobs = s.jobs.filter((j) => j.toLv === s.lv[j.id] + 1 && reqCL(j.id, j.toLv) <= n && j.toLv <= 10);
        if (n >= DATA.CREW.freeAtCL && s.crews < 2) s.crews = 2;
        normalize(s);
        unlock(s, 'campfire' + n);
        return { logData: { cl: n } };
      }
      case 'force': if (!['auto', 'win', 'loss', 'gateLoss'].includes(val)) return fail('Bad force'); d.force = val; return { logData: { force: val } };
      case 'lockSeed': d.lockSeed = val == null || val === false ? null : (Math.floor(fin(+val, 1)) >>> 0); return { logData: { lockSeed: d.lockSeed } };
      case 'forcedWins': { const n = Math.round(clampN(val, 0, 2, 2)); d.forcedWinsSetting = n; s.forcedWins = Math.max(0, n - s.runSeq); return { logData: { forcedWins: n } }; }
      case 'skill': return setNum('skill', L.skill.min, L.skill.max);
      case 'runScreenSec': if (!L.runScreenSec.includes(val)) return fail('Bad value'); d.runScreenSec = val; return {};
      case 'lossPayout': return setNum('lossPayout', L.lossPayout.min, L.lossPayout.max);
      case 'injuryMin': return setNum('injuryMin', L.injuryMin.min, L.injuryMin.max);
      case 'intelG': return setNum('intelG', L.intelG.min, L.intelG.max);
      case 'sim': {
        if (a.D0 != null) d.sim.D0 = clampN(+a.D0, L.D0.min, L.D0.max, d.sim.D0);
        if (a.night != null) d.sim.night = clampN(+a.night, L.night.min, L.night.max, d.sim.night);
        if (a.medCalm != null) d.sim.medCalm = clampN(+a.medCalm, L.medCalm.min, L.medCalm.max, d.sim.medCalm);
        syncK(s); return { logData: Object.assign({}, d.sim) };
      }
      case 'mul': {
        if (!Object.prototype.hasOwnProperty.call(d.mul, a.key)) return fail('Unknown multiplier');
        if (typeof val !== 'number' || !isFinite(val)) return fail('Bad value');
        d.mul[a.key] = clampN(val, L.mul.min, L.mul.max, 1);
        return { dataRule: DATA.assertData(d.mul.cost), logData: { key: a.key, value: d.mul[a.key] } };
      }
      case 'freeSec': return setNum('freeSec', L.freeSec.min, L.freeSec.max);
      case 'skipExp': return setNum('skipExp', L.skipExp.min, L.skipExp.max);
      case 'momentum': return setNum('momentum', L.momentum.min, L.momentum.max);
      case 'momentumCap': return setNum('momentumCap', L.momentumCap.min, L.momentumCap.max);
      case 'reducedMotion': d.reducedMotion = !!val; return {};
      case 'particles': if (![0, 0.5, 1, 2].includes(val)) return fail('Bad value'); d.particles = val; return {};
      case 'volume': return setNum('volume', 0, 1);
      case 'muted': d.muted = !!val; return {};
      case 'skipFtue': {
        if (s.pile > 0) { const n = s.pile; s.pile = 0; gain(s, { scrap: n }, 'pile', ev, ctx); }
        s.ftue.step = 6; s.ftue.done = true; return {};
      }
      case 'replayFtue': {
        const fresh = create({ realNow: s.realSeenAt, tzOffsetMs: s.tzOffsetMs, seed: s.rng });
        const keepDev = clone(s.dev), keepTele = s.tele;
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, fresh); s.dev = keepDev; s.dev.timeScale = 1; s.tele = keepTele;
        return {};
      }
      case 'cancelRun': if (!s.pending) return fail('No run under way'); s.pending = null; return {};
      default: return fail('Unknown dev op');
    }
  }

  // ------------------------------------------------------------------ frame clock and offline
  function tick(s, realDeltaMs, realNow) {
    if (typeof realNow === 'number' && isFinite(realNow)) s.realSeenAt = realNow;
    const d = Math.min(Math.max(0, fin(realDeltaMs, 0)), DATA.FRAME_CLAMP_MS);
    if (s.pending) return [];                                    // the run screen pauses the camp clock
    const dt = d * s.dev.timeScale;
    if (!(dt > 0)) return [];
    const ctx = { source: 'frame', dev: s.dev.timeScale > 1 };
    const k = s.tele.kpi; k.fgMs += dt;
    let affordable = false;
    for (const id of DATA.BUILDING_IDS) if (buildCheck(s, id).ok) { affordable = true; break; }
    if (affordable && s.jobs.length < s.crews) k.crewIdleMs += dt;
    if (!affordable && !anythingReady(s) && !anyCraftAffordable(s)) k.nothingMs += dt;
    return advance(s, dt, ctx);
  }
  function anythingReady(s) {
    for (const id of DATA.PRODUCERS) if (s.lv[id] && bubble(s, id).show) return true;
    return s.gen.charges > 0 || s.parties.some((p) => p.back) || !!s.crate || s.pile > 0 || (s.truck.scrap + s.truck.food + s.truck.meds > 0 && unloadable(s));
  }
  function unloadable(s) { const cp = caps(s); return RES.some((k) => s.truck[k] > 0 && s.res[k] < cp[k]); }
  function anyCraftAffordable(s) {
    for (const item of ITEMS) {
      const d = DATA.CRAFTS[item], q = s.craft[d.building];
      if (s.lv[d.building] < d.minLv || q.length >= DATA.QUEUE_MAX) continue;
      if (s.stock[item] + q.filter((c) => c.item === item).length >= DATA.STOCK_MAX) continue;
      if (RES.every((k) => s.res[k] >= (d.cost[k] || 0))) return true;
    }
    return false;
  }
  function resume(s, realNow) {
    const gap = fin(realNow, s.realSeenAt) - s.realSeenAt;
    if (gap < 0) {
      log(s, 'clock_rollback', { gapMs: Math.round(gap) }, false);
      s.realSeenAt = realNow;
      return { creditedMs: 0, rollback: true, events: [], welcome: null };
    }
    const credited = Math.min(gap, DATA.OFFLINE.capMs);
    if (gap > DATA.OFFLINE.logGapMs) log(s, 'offline_gap', { gapMs: Math.round(gap), creditedMs: Math.round(credited) }, false);
    s.realSeenAt = realNow;
    if (!(credited > 0)) return { creditedMs: 0, rollback: false, events: [], welcome: null };
    const fullMs = {};
    const ev = advance(s, credited, { source: 'offline', fullMs });
    const w = credited >= DATA.OFFLINE.welcomeMinMs ? welcome(s, ev, credited, fullMs) : null;
    if (w) ev.push({ type: 'offline', ms: credited, rows: w.rows });
    return { creditedMs: credited, rollback: false, events: ev, welcome: w };
  }
  // Welcome-back rows, one per source (SPEC 4.9).
  function welcome(s, ev, ms, fullMs) {
    const rows = [];
    for (const id of DATA.PRODUCERS) {
      if (!s.lv[id]) continue;
      const n = Math.floor(s.buf[id]); if (n < 1) continue;
      const fm = (fullMs && fullMs[id]) || 0;
      rows.push({ id, kind: 'bubble', res: PROD_RES[id], amount: n, text: B[id].name + ' +' + n + ' ' + RES_NAME[PROD_RES[id]] + (fm >= MIN ? ' · FULL for ' + fmtDur(fm / SEC) : '') });
    }
    const crafted = {};
    for (const e of ev) {
      if (e.type === 'jobDone') rows.push({ id: e.id, kind: 'job', text: e.text });
      else if (e.type === 'craftDone') { const k = e.building + ':' + e.item; crafted[k] = (crafted[k] || 0) + 1; }
      else if (e.type === 'partyBack') rows.push({ id: 'radio', kind: 'party', text: (e.name ? e.name + '\'s ' : 'The ') + DATA.PARTIES.kinds[e.kind].name.toLowerCase() + ' is back' });
      else if (e.type === 'healed') rows.push({ id: e.id, kind: 'healed', text: e.text });
      else if (e.type === 'recruitDone') rows.push({ id: 'radio', kind: 'recruit', text: e.name + ' joined the camp' });
      else if (e.type === 'clUp') rows.push({ id: 'campfire', kind: 'cl', text: 'Camp Lv ' + e.cl });
    }
    for (const k of Object.keys(crafted)) { const [b, item] = k.split(':'); const n = crafted[k]; rows.push({ id: b, kind: 'craft', text: B[b].name + ' made ' + itemCount(item, n) }); }
    if (s.gen.charges > 0) rows.push({ id: 'generator', kind: 'generator', amount: s.gen.charges, text: 'Generator: ' + s.gen.charges + ' batter' + (s.gen.charges > 1 ? 'ies' : 'y') });
    if (s.truck.scrap + s.truck.food + s.truck.meds > 0) rows.push({ id: 'truck', kind: 'truck', text: 'The truck holds overflow' });
    return { ms, rows };
  }

  // ------------------------------------------------------------------ view, goal, timeline
  function bubble(s, id) {
    const L = s.lv[id]; if (!L) return { stored: 0, cap: 0, full: false, show: false, rate: 0 };
    const r = rate(s, id), cap = r * B[id].holds[L], st = s.buf[id];
    return { stored: Math.floor(st), cap, full: cap > 0 && st >= cap, show: Math.floor(st) >= Math.max(1, DATA.BUBBLE_MIN_SHARE * cap), rate: r, fullInMs: st >= cap || !(r > 0) ? 0 : (cap - st) / r * HOUR };
  }
  function timerInfo(s, endAt, dur, label, extra) {
    const left = Math.max(0, endAt - s.campNow), sec = left / SEC, price = priceSkip(sec, s);
    return Object.assign({ left, leftSec: sec, total: dur, progress: dur ? Math.min(1, 1 - left / dur) : 1, price, free: price === 0, confirm: price >= DATA.SKIP.confirmAt, clock: fmtClock(sec), label }, extra || {});
  }
  function timeline(s, n) {
    n = n || 5; const out = [];
    const push = (at, kind, id, label) => { if (at != null && isFinite(at) && at >= s.campNow) out.push({ at, inMs: at - s.campNow, kind, id, label }); };
    for (const j of s.jobs) push(j.endAt, 'job', j.id, B[j.id].name + ' ' + j.toLv);
    for (const b of ['infirmary', 'workbench']) {
      let t = s.campNow;
      for (const c of s.craft[b]) { t = c.endAt != null ? c.endAt : t + c.dur; push(t, 'craft', b, ITEM_NAME[c.item]); }
    }
    if (s.recruit) push(s.recruit.endAt, 'recruit', 'recruit', s.recruit.name + ' arrives');
    for (const p of s.parties) if (!p.back) { const who = personById(s, p.who); push(p.endAt, 'party', p.id, (who ? who.name + '\'s ' : '') + DATA.PARTIES.kinds[p.kind].name.toLowerCase()); }
    for (const p of s.people) if (p.state === 'injured') push(p.until, 'injury', p.id, p.name + ' healed');
    if (s.lv.generator) push(s.campNow + Math.max(0, genInterval(s) - s.gen.accMs), 'gen', 'generator', 'Battery charged');
    for (const id of DATA.PRODUCERS) { const bb = bubble(s, id); if (s.lv[id] && !bb.full && bb.rate > 0) push(s.campNow + bb.fullInMs, 'full', id, B[id].name + ' full'); }
    out.sort((a, b) => a.at - b.at);
    return out.slice(0, n);
  }

  function hotspotLabel(s, id) {
    const b = B[id], L = s.lv[id], job = s.jobs.find((j) => j.id === id);
    if (!L && cl(s) < b.unlockCL) return b.name + ', locked, Camp Lv ' + b.unlockCL;
    if (!L) return b.name + ' plot, ' + (job ? 'building, ' + fmtClock((job.endAt - s.campNow) / SEC) + ' left' : 'tap to build');
    let t = b.name + ', level ' + L;
    if (PROD_RES[id]) { const bb = bubble(s, id); if (bb.show) t += ', ' + bb.stored + ' ' + RES_NAME[PROD_RES[id]] + ' ready' + (bb.full ? ', full' : ''); }
    if (id === 'generator' && s.gen.charges) t += ', ' + s.gen.charges + ' batter' + (s.gen.charges > 1 ? 'ies' : 'y') + ' ready';
    if (id === 'radio' && s.parties.some((p) => p.back)) t += ', a party crate is ready';
    if (job) t += ', upgrading, ' + fmtClock((job.endAt - s.campNow) / SEC) + ' left';
    return t;
  }

  function view(s, opts) {
    opts = opts || {};
    const c = cl(s), cp = caps(s), w = workers(s);
    const buffers = {}; for (const id of DATA.PRODUCERS) buffers[id] = bubble(s, id);
    const affordable = {}, blockers = {}, next = {}, hotspots = {};
    for (const id of DATA.BUILDING_IDS) {
      const chk = buildCheck(s, id); affordable[id] = !!chk.ok; blockers[id] = chk.ok ? '' : chk.label;
      const sf = chk.reason === 'resources' ? priceShortfall(s, chk.cost) : null;
      next[id] = { lv: chk.lv, cost: chk.cost, time: chk.time, reqCL: chk.reqCL, ok: chk.ok, reason: chk.reason, label: chk.label, shortfall: sf };
      const L = s.lv[id], job = s.jobs.find((j) => j.id === id);
      const state = job ? 'constructing' : !L ? (c < B[id].unlockCL ? 'locked' : 'available') : (PROD_RES[id] && buffers[id].full) ? 'full' : PROD_RES[id] ? 'producing' : 'built';
      hotspots[id] = { id, label: hotspotLabel(s, id), state, level: L, lockLabel: c < B[id].unlockCL ? 'Camp Lv ' + B[id].unlockCL : '',
        bubble: PROD_RES[id] ? buffers[id] : id === 'generator' ? { stored: s.gen.charges, show: s.gen.charges > 0, full: s.gen.charges >= B.generator.holds[L || 0] } : id === 'radio' ? { show: s.parties.some((p) => p.back) } : null,
        timer: job ? timerInfo(s, job.endAt, job.dur, B[id].name + ' ' + job.toLv, { target: { kind: 'job', id } }) : null };
    }
    hotspots.crate = { id: 'crate', label: s.crate ? 'Supply crate from the run, tap to open' : '', state: s.crate ? 'ready' : 'none' };
    hotspots.truck = { id: 'truck', label: s.truck.scrap + s.truck.food + s.truck.meds > 0 ? 'Truck at the gate with ' + RES.filter((k) => s.truck[k]).map((k) => s.truck[k] + ' ' + RES_NAME[k]).join(', ') : '', state: s.truck.scrap + s.truck.food + s.truck.meds > 0 ? 'ready' : 'none' };
    hotspots.pile = { id: 'pile', label: s.pile > 0 ? 'Scrap pile, ' + s.pile + ' scrap' : '', state: s.pile > 0 ? 'ready' : 'none' };
    hotspots.fire = { id: 'fire', label: s.ftue.step === 0 ? 'Unlit fire, tap to light it' : 'Campfire, Camp Lv ' + c, state: s.ftue.step === 0 ? 'unlit' : 'lit' };
    const fr = frontier(s), sel = ROUTE[s.loadout.route] || fr;
    const Lsel = loadoutFor(s, sel.id);
    const routes = DATA.ROUTES.map((r) => {
      const u = routeUnlocked(s, r), rs = s.routes[r.id];
      const o = { id: r.id, name: r.name, danger: r.danger, unlocked: u, req: r.radio ? 'Radio Lv ' + r.radio : '', intel: rs.intel, runs: rs.runs, wins: rs.wins, firstWin: rs.firstWin, rescue: r.rescue, haul: r.haul };
      if (u && opts.odds !== false) o.odds = odds(s, r.id, null, { deltas: false }).odds;
      return o;
    });
    const crew3 = { owned: s.crews >= 3, price: DATA.CREW.thirdPrice, fromCL: DATA.CREW.thirdFromCL, visible: c >= DATA.CREW.showFromCL, available: s.crews < 3 && c >= DATA.CREW.thirdFromCL, label: 'Crew 3 · ' + DATA.CREW.thirdPrice + ' bat · from Camp Lv ' + DATA.CREW.thirdFromCL };
    const runner = pickRunner(s);
    const today = campDay(s), work = assignWork(s);
    const worksAt = {}; for (const k of Object.keys(work.assign)) for (const n of work.assign[k]) worksAt[n] = k;
    return {
      cl: c, campNow: s.campNow, day: today, res: Object.assign({}, s.res), caps: cp,
      rates: { salvage: rate(s, 'salvage', w), garden: rate(s, 'garden', w), infirmary: rate(s, 'infirmary', w) }, workers: w,
      buffers, beds: beds(s), survivors: s.people.length, fit: fitPeople(s).length, freeBeds: freeBeds(s),
      people: s.people.map((p) => Object.assign({}, p, { leftMs: p.until != null ? Math.max(0, p.until - s.campNow) : 0, worksAt: worksAt[p.name] || null })),
      assign: work.assign, slotNotes: work.notes,
      gate: s.gate.slice(),
      jobs: s.jobs.map((j) => Object.assign({ id: j.id, toLv: j.toLv }, timerInfo(s, j.endAt, j.dur, B[j.id].name + ' ' + j.toLv, { target: { kind: 'job', id: j.id } }))),
      crafts: { infirmary: s.craft.infirmary.map((x, i) => ({ item: x.item, active: i === 0, timer: x.endAt != null ? timerInfo(s, x.endAt, x.dur, ITEM_NAME[x.item], { target: { kind: 'craft', id: 'infirmary' } }) : null })),
        workbench: s.craft.workbench.map((x, i) => ({ item: x.item, active: i === 0, timer: x.endAt != null ? timerInfo(s, x.endAt, x.dur, ITEM_NAME[x.item], { target: { kind: 'craft', id: 'workbench' } }) : null })) },
      recruit: s.recruit ? Object.assign({ name: s.recruit.name }, timerInfo(s, s.recruit.endAt, s.recruit.dur, 'Recruit ' + s.recruit.name, { target: { kind: 'recruit', id: 'recruit' } })) : null,
      recruitOffer: s.lv.radio >= 1 ? { food: DATA.RECRUIT.foodPer * s.people.length, sec: DATA.RECRUIT.minutesPer * Math.pow(s.people.length, DATA.RECRUIT.exp) * 60 * mul(s, 'time'), bed: freeBeds(s) >= 1 } : null,
      parties: s.parties.map((p) => Object.assign({ id: p.id, who: p.who, kind: p.kind, back: p.back, loot: p.loot }, p.back ? {} : timerInfo(s, p.endAt, DATA.PARTIES.kinds[p.kind].sec * SEC * mul(s, 'time'), DATA.PARTIES.kinds[p.kind].name, { target: { kind: 'party', id: p.id } }))),
      partySlots: partySlots(s), partiesActive: activeParties(s).length,
      crews: s.crews, crewsFree: s.crews - s.jobs.length, crew3,
      gear: Run.gear(Lsel), gearBase: gearBase(s), stats: runStats(s, Lsel), loadout: clone(s.loadout), runner: runner ? { id: runner.id, name: runner.name, hurt: runner.state === 'injured' } : null,
      weapons: Object.assign({ pistol: true }, s.weapons), stock: Object.assign({}, s.stock), bp: s.res.bp, bat: s.res.bat,
      frontier: fr.id, frontierOdds: opts.odds === false ? null : odds(s, fr.id, null, { deltas: false }).odds, routes,
      affordable, blockers, next, hotspots, timeline: timeline(s, 5),
      dawn: (c - 1) / 9, lightRadius: DATA.SCENE.lightBase + DATA.SCENE.lightPerCL * (c - 1), campRange: DATA.SCENE.campRange[c],
      generator: { charges: s.gen.charges, holds: B.generator.holds[s.lv.generator], nextInMs: s.lv.generator ? Math.max(0, genInterval(s) - s.gen.accMs) : null },
      crate: s.crate ? Object.assign({}, s.crate) : null, truck: Object.assign({}, s.truck), pile: s.pile,
      daily: { wins: s.daily.day === today ? s.daily.wins : 0, max: DATA.DAILY.wins },
      objective: s.objective < DATA.OBJECTIVES.length ? { idx: s.objective, n: s.objective + 1, text: DATA.OBJECTIVES[s.objective].text } : null,
      ftue: Object.assign({}, s.ftue), forcedRun: s.forcedWins > 0 || s.dev.force === 'win', pending: !!s.pending,
    };
  }

  // ETA to cover a resource shortfall: by runs on the frontier or by idle production.
  function shortfallEta(s, missing) {
    const fr = frontier(s), mh = MEDIAN_HAUL[fr.id], w = workers(s);
    let runs = 0, idleSec = 0, idleOk = true, runsOk = true;
    for (const k of RES) {
      const m = missing[k] || 0; if (m <= 0) continue;
      if (mh[k] > 0) runs = Math.max(runs, Math.ceil(m / mh[k])); else runsOk = false;
      const r = rate(s, RES_PROD[k], w); if (r > 0) idleSec = Math.max(idleSec, m / r * 3600); else idleOk = false;
    }
    if (runsOk && (!idleOk || runs * 360 < idleSec) && runs <= 20) return { sec: runs * 360, text: '≈ ' + runs + ' run' + (runs > 1 ? 's' : '') };
    if (idleOk) return { sec: idleSec, text: '≈ ' + fmtDur(idleSec) + ' idle' };
    return { sec: runs * 360, text: '≈ ' + runs + ' runs' };
  }
  function runGoalText(s, r) { const o = odds(s, r.id, null, { deltas: false }).odds; return 'Run ' + r.name + ' (' + Math.round(o * 100) + '%)'; }
  // "Reach building id at level lv": the first blocker, as a goal.
  function levelGoal(s, id, lv, text, depth) {
    depth = depth || 0;
    if (s.lv[id] >= lv) return null;
    const job = s.jobs.find((j) => j.id === id);
    if (job) { const sec = (job.endAt - s.campNow) / SEC; return { text, target: id, etaSec: sec, eta: 'ready in ' + fmtDur(sec), blocked: false, kind: 'timer' }; }
    if (s.lv[id] + 1 < lv && depth < 3) return levelGoal(s, id, s.lv[id] + 1, B[id].name + ' to ' + (s.lv[id] + 1), depth + 1) || { text, target: id, blocked: true };
    const chk = buildCheck(s, id);
    if (chk.ok) return { text, target: id, etaSec: 0, eta: 'ready now', blocked: false, kind: 'build' };
    const sub = (t, target, extra) => Object.assign({ text: t, target, blocked: true, kind: chk.reason, parent: text }, extra || {});
    switch (chk.reason) {
      case 'cl': { const g = depth < 3 ? levelGoal(s, 'campfire', chk.reqCL, 'Campfire to ' + chk.reqCL, depth + 1) : null; return g ? Object.assign(g, { parent: text, blocked: true, text: 'Needs Camp Lv ' + chk.reqCL + ': ' + g.text }) : sub('Needs Camp Lv ' + chk.reqCL, 'campfire'); }
      case 'storage': return sub('Storehouse to ' + chk.need, 'storehouse', { eta: s.jobs.some((j) => j.id === 'storehouse') ? 'upgrading' : '' });
      case 'survivors': {
        if (freeBeds(s) >= 1 && s.lv.radio >= 1) return sub(s.recruit ? 'Recruiting ' + s.recruit.name : 'Recruit at the Radio Mast', 'radio', s.recruit ? { etaSec: (s.recruit.endAt - s.campNow) / SEC, eta: 'ready in ' + fmtDur((s.recruit.endAt - s.campNow) / SEC) } : {});
        if (freeBeds(s) >= 1) return sub('Rescue survivors on runs', 'play');
        return sub('Bunkhouse to ' + (s.lv.bunkhouse + 1), 'bunkhouse');
      }
      case 'bp': return sub('Win on ' + frontier(s).name + ' for Blueprints (' + s.res.bp + ' / ' + chk.need + ')', 'play');
      case 'crews': { const j = soonestJob(s); const sec = (j.endAt - s.campNow) / SEC; return { text, target: id, etaSec: sec, eta: 'crew free in ' + fmtDur(sec), blocked: true, kind: 'crews' }; }
      case 'resources': { const e = shortfallEta(s, chk.missing); return { text, target: id, etaSec: e.sec, eta: e.text, blocked: false, kind: 'resources', missing: chk.missing }; }
      default: return sub(chk.label, id);
    }
  }
  function mainGoal(s) {
    if (!s.ftue.done) { const f = DATA.FTUE[Math.min(5, s.ftue.step)]; return { text: f.line, target: f.target, kind: 'ftue', blocked: false, etaSec: 0, eta: '' }; }
    const O = DATA.OBJECTIVES;
    if (s.objective >= O.length) return { text: 'Signal fire lit. Keep the camp running', target: 'campfire', kind: 'done', blocked: false, etaSec: null, eta: '' };
    const o = O[s.objective], c = o.check, base = { objective: s.objective, n: s.objective + 1 };
    let g = null;
    if (c.level && s.lv[c.level] < c.lv) g = levelGoal(s, c.level, c.lv, o.text);
    else if (c.level === 'infirmary' && c.flag === 'medkitMade') {
      const q = s.craft.infirmary.find((x) => x.item === 'medkit');
      if (q) { const a = s.craft.infirmary[0]; const sec = a.endAt != null ? (a.endAt - s.campNow) / SEC : 0; g = { text: 'Craft a medkit', target: 'infirmary', etaSec: sec, eta: 'ready in ' + fmtDur(sec), kind: 'timer' }; }
      else if (s.res.meds >= 20) g = { text: 'Craft a medkit', target: 'infirmary', etaSec: 0, eta: 'ready now', kind: 'craft' };
      else { const e = shortfallEta(s, { meds: 20 - s.res.meds }); g = { text: 'Craft a medkit (20 meds)', target: 'infirmary', etaSec: e.sec, eta: e.text, kind: 'resources' }; }
    } else if (c.flag === 'genCollected') {
      if (s.gen.charges > 0) g = { text: 'Collect the Generator battery', target: 'generator', etaSec: 0, eta: 'ready now', kind: 'collect' };
      else { const sec = Math.max(0, genInterval(s) - s.gen.accMs) / SEC; g = { text: o.text, target: 'generator', etaSec: sec, eta: 'ready in ' + fmtDur(sec), kind: 'timer' }; }
    } else if (c.weapon) {
      const W = DATA.WEAPONS[c.weapon];
      if (s.lv.workbench < W.wb) g = levelGoal(s, 'workbench', W.wb, 'Workbench to ' + W.wb);
      else if (s.res.bp < W.bp) g = { text: 'Win on ' + frontier(s).name + ' for Blueprints (' + s.res.bp + ' / ' + W.bp + ')', target: 'play', blocked: true, kind: 'bp', etaSec: 360 * 2, eta: '' };
      else g = { text: o.text + ' (' + W.bp + ' BP)', target: 'workbench', etaSec: 0, eta: 'ready now', kind: 'unlock' };
    } else if (c.wins) {
      const r = ROUTE[c.wins];
      if (!routeUnlocked(s, r)) g = levelGoal(s, 'radio', r.radio, 'Radio Mast to ' + r.radio);
      else { const o = odds(s, r.id, null, { deltas: false }).odds; g = { text: (o < 0.6 ? 'Gear up for ' : 'Run ') + r.name + ' (' + Math.round(o * 100) + '%)', target: 'play', route: r.id, etaSec: 360, eta: '≈ 1 run', kind: 'run', blocked: o < 0.6 }; }
    } else if (c.flag === 'taughtSkip') {
      const timers = s.jobs.filter((j) => j.endAt - s.campNow > s.dev.freeSec * SEC);
      if (timers.length) { const j = timers[0]; const pr = priceSkip((j.endAt - s.campNow) / SEC, s); g = { text: 'Speed up ' + B[j.id].name + ' ' + j.toLv + ' · ' + pr + ' bat', target: j.id, etaSec: 0, eta: 'ready now', kind: 'skip' }; }
      else g = { text: 'Start an upgrade, then speed it up', target: 'campfire', etaSec: 0, eta: '', kind: 'skip' };
    } else if (c.survivors) {
      if (s.recruit) { const sec = (s.recruit.endAt - s.campNow) / SEC; g = { text: o.text + ' · ' + s.recruit.name + ' is on the way', target: 'radio', etaSec: sec, eta: 'ready in ' + fmtDur(sec), kind: 'timer' }; }
      else if (freeBeds(s) < 1) g = levelGoal(s, 'bunkhouse', s.lv.bunkhouse + 1, 'Bunkhouse to ' + (s.lv.bunkhouse + 1));
      else if (s.lv.radio >= 1) {
        const need = DATA.RECRUIT.foodPer * s.people.length;
        if (s.res.food >= need) g = { text: 'Recruit at the Radio Mast', target: 'radio', etaSec: 0, eta: 'ready now', kind: 'recruit' };
        else { const e = shortfallEta(s, { food: need - s.res.food }); g = { text: 'Recruit (' + need + ' food)', target: 'radio', etaSec: e.sec, eta: e.text, kind: 'resources', missing: { food: need - s.res.food } }; }
      }
      else g = { text: 'Rescue survivors on runs', target: 'play', etaSec: 360 * 4, eta: '', kind: 'run' };
    } else if (c.flag === 'medRunWin') {
      if (s.stock.medkit > 0) g = { text: o.text, target: 'play', etaSec: 360, eta: '≈ 1 run', kind: 'run' };
      else if (s.lv.infirmary >= 1 && s.craft.infirmary.some((x) => x.item === 'medkit')) g = { text: 'Craft a medkit at the Infirmary', target: 'infirmary', etaSec: 480, eta: '', kind: 'craft' };
      else if (s.lv.infirmary >= 1) g = s.res.meds >= 20 ? { text: 'Craft a medkit at the Infirmary', target: 'infirmary', etaSec: 0, eta: 'ready now', kind: 'craft' }
        : (() => { const e = shortfallEta(s, { meds: 20 - s.res.meds }); return { text: 'Craft a medkit (20 meds)', target: 'infirmary', etaSec: e.sec, eta: e.text, kind: 'resources', missing: { meds: 20 - s.res.meds } }; })();
      else g = levelGoal(s, 'infirmary', 1, 'Build the Infirmary');
    } else if (c.flag === 'partySent') {
      if (s.lv.radio < 2) g = levelGoal(s, 'radio', 2, 'Radio Mast to 2');
      else g = { text: 'Send a scavenging party', target: 'radio', etaSec: 0, eta: '', kind: 'party', blocked: fitPeople(s).length < 2 || activeParties(s).length >= partySlots(s) };
    } else if (c.flag === 'bombMade') {
      if (s.lv.workbench < 3) g = levelGoal(s, 'workbench', 3, 'Workbench to 3');
      else if (s.craft.workbench.some((x) => x.item === 'bomb')) g = { text: 'Craft a noise bomb at the Workbench', target: 'workbench', etaSec: 300, eta: '', kind: 'craft' };
      else { const c = DATA.CRAFTS.bomb.cost, miss = {}; for (const k of RES) if ((c[k] || 0) > s.res[k]) miss[k] = c[k] - s.res[k];
        if (!Object.keys(miss).length) g = { text: 'Craft a noise bomb at the Workbench', target: 'workbench', etaSec: 0, eta: 'ready now', kind: 'craft' };
        else { const e = shortfallEta(s, miss); g = { text: 'Craft a noise bomb (' + RES.filter((k) => c[k]).map((k) => c[k] + ' ' + k).join(' + ') + ')', target: 'workbench', etaSec: e.sec, eta: e.text, kind: 'resources', missing: miss }; } }
    } else if (c.crewsOrSurvivors) {
      if (cl(s) >= DATA.CREW.thirdFromCL) g = { text: 'Crew 3 or ' + c.crewsOrSurvivors[1] + ' survivors', target: 'campfire', etaSec: null, eta: s.res.bat + '/' + DATA.CREW.thirdPrice + ' bat', kind: 'crew', blocked: s.res.bat < DATA.CREW.thirdPrice };
      else g = { text: 'Have 6 survivors (' + s.people.length + ' / 6)', target: freeBeds(s) >= 1 ? 'radio' : 'bunkhouse', etaSec: null, eta: '', kind: 'survivors' };
    }
    if (!g) g = { text: o.text, target: o.target || 'play', etaSec: 0, eta: '', kind: 'objective' };
    if (g.blocked == null) g.blocked = false;
    return Object.assign(base, { objectiveText: o.text }, g);
  }
  // The "Meanwhile" line. With the main goal a build that can start now, one free crew stays reserved for it.
  function sideGoal(s, main) {
    for (const id of DATA.PRODUCERS) if (s.lv[id] && bubble(s, id).full && s.res[PROD_RES[id]] < caps(s)[PROD_RES[id]]) return { text: 'Collect the ' + B[id].name, target: id, kind: 'collect' };
    if (s.lv.infirmary >= 1 && !s.stock.medkit && !s.stock.pills && !s.craft.infirmary.length && s.res.meds >= 10)
      return { text: s.res.meds >= 20 ? 'Craft a medkit' : 'Craft pills', target: 'infirmary', kind: 'craft' };
    const reserve = main && main.kind === 'build' && main.etaSec === 0 ? 1 : 0;
    if (s.jobs.length < s.crews - reserve) {
      let best = null;
      for (const id of DATA.BUILDING_IDS) { const chk = buildCheck(s, id); if (chk.ok && !(reserve && id === main.target) && chk.time <= 30 * 60 && (!best || chk.cost.scrap < best.chk.cost.scrap)) best = { id, chk }; }
      if (best) return { text: (s.lv[best.id] ? 'Upgrade the ' : 'Build the ') + B[best.id].name + ' (' + fmtDur(best.chk.time) + ')', target: best.id, kind: 'build' };
    }
    if (s.lv.radio >= DATA.PARTIES.minRadio && activeParties(s).length < partySlots(s) && fitPeople(s).length >= 2) return { text: 'Send a party', target: 'radio', kind: 'party' };
    return { text: runGoalText(s, frontier(s)), target: 'play', route: frontier(s).id, kind: 'run' };
  }
  function longGoal(s) {
    const c = cl(s);
    if (c >= 10) return { cl: 10, done: true, items: [], text: 'Signal fire lit' };
    const n = c + 1, cc = cost('campfire', n, s), cp = caps(s);
    const items = [
      { key: 'scrap', label: 'Scrap', have: s.res.scrap, need: cc.scrap, ok: s.res.scrap >= cc.scrap },
      { key: 'food', label: 'Food', have: s.res.food, need: cc.food, ok: s.res.food >= cc.food },
      { key: 'survivors', label: 'Survivors', have: s.people.length, need: B.campfire.survivors[n], ok: s.people.length >= B.campfire.survivors[n] },
      { key: 'storehouse', label: 'Storehouse', ok: cc.scrap <= cp.scrap && cc.food <= cp.food, need: storehouseFor(s, cc), have: s.lv.storehouse },
    ];
    const news = DATA.BUILDING_IDS.filter((b) => B[b].unlockCL === n).map((b) => B[b].name);
    const nextRoute = DATA.ROUTES.find((r) => !routeUnlocked(s, r));
    const nextWeapon = DATA.WEAPON_ORDER.find((w) => w !== 'pistol' && !s.weapons[w]);
    return { cl: n, items, news, everythingTo: n, nextRoute: nextRoute ? { id: nextRoute.id, name: nextRoute.name, req: 'Radio Mast Lv ' + nextRoute.radio } : null,
      nextWeapon: nextWeapon ? { id: nextWeapon, name: DATA.WEAPONS[nextWeapon].name, req: 'Workbench Lv ' + DATA.WEAPONS[nextWeapon].wb + ' + ' + DATA.WEAPONS[nextWeapon].bp + ' BP' } : null,
      text: 'Camp Lv ' + n };
  }
  function goal(s) {
    const main = mainGoal(s);
    const sg = main.kind === 'ftue' ? null : sideGoal(s, main);
    const same = sg && sg.kind === main.kind && sg.target === main.target;
    const side = sg && !same && (main.blocked || main.etaSec == null || main.etaSec > 1800 || main.kind === 'done' || sg.kind === 'collect' || sg.kind === 'craft' || sg.kind === 'build') ? sg : null;
    return { main, side, long: longGoal(s) };
  }

  // ------------------------------------------------------------------ Route lab and KPIs
  function routeLab(s, n) {
    n = n || 1000; syncK(s);
    const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(p * (b.length - 1))] : 0; };
    return DATA.ROUTES.filter((r) => routeUnlocked(s, r)).map((r) => {
      const L = loadoutFor(s, r.id); L.rescue = null;
      let w = 0, val = 0, time = 0; const kills = [], times = [], dmg = [];
      for (let i = 1; i <= n; i++) {
        const x = Run.simulate(r, L, 100000 + i);
        const h = Run.haul(r, { result: x.win ? 'safe_room' : 'overrun', progress: x.progress, cachesFound: x.cachesFound, kills: x.kills }, 100000 + i, s.dev.lossPayout, mul(s, 'loot'));
        if (x.win) { w++; kills.push(x.kills); times.push(x.time); dmg.push(x.damageTaken); }
        val += h.scrap + 2 * h.food + 10 * h.meds; time += x.time;
      }
      return { id: r.id, name: r.name, odds: w / n, kills: q(kills, 0.5), time: q(times, 0.5), damage: q(dmg, 0.5), valuePerAttempt: val / n, valuePerCampMin: val / Math.max(1, time / 60) };
    });
  }
  function kpis(s) {
    const t = s.tele, sum = (o) => Object.keys(o).reduce((a, k) => a + (k === 'dev' ? 0 : o[k]), 0);
    const clTimes = {}; for (let L = 2; L <= 10; L++) { const u = t.unlocks['campfire' + L]; if (u) clTimes[L] = u; }
    const scrapBy = {}; for (const k of Object.keys(t.income.all)) scrapBy[k] = t.income.all[k].scrap;
    const runScrap = scrapBy.run || 0, prodScrap = Object.keys(scrapBy).filter((k) => /^prod:/.test(k)).reduce((a, k) => a + scrapBy[k], 0), partyScrap = scrapBy.party || 0;
    return {
      cl: cl(s), clTimes, runs: t.runs.total, wins: t.runs.wins, winRate: t.runs.total ? t.runs.wins / t.runs.total : 0, lossRate: t.runs.total ? t.runs.losses / t.runs.total : 0,
      maxLossStreak: t.runs.maxStreak, frontierShare: t.runs.plays ? t.runs.frontier / t.runs.plays : 0, emptyStockShare: t.runs.playsAfterCL3 ? t.runs.emptyPlays / t.runs.playsAfterCL3 : 0,
      batEarned: sum(t.bat.earned), batEarnedDev: t.bat.earned.dev || 0, batSpent: sum(t.bat.spent), batEarnedBy: Object.assign({}, t.bat.earned), batSpentBy: Object.assign({}, t.bat.spent),
      packs: Object.assign({}, t.packs), batFirstHourUnder5Share: t.kpi.batFirstHour.spent ? t.kpi.batFirstHour.under5 / t.kpi.batFirstHour.spent : 0,
      crewIdleShare: t.kpi.fgMs ? t.kpi.crewIdleMs / t.kpi.fgMs : 0, nothingShare: t.kpi.fgMs ? t.kpi.nothingMs / t.kpi.fgMs : 0,
      storageFullMs: Object.assign({}, t.kpi.fullMs), waste: clone(t.kpi.waste), injuredPersonMinPerHour: s.campNow ? t.kpi.injuredMs / MIN / (s.campNow / HOUR) : 0,
      runShareScrap: runScrap + prodScrap + partyScrap ? runScrap / (runScrap + prodScrap + partyScrap) : 0,
      runVsIdleScrapPerHour: t.runs.timeMs && prodScrap && s.campNow ? (runScrap / (t.runs.timeMs / HOUR)) / (prodScrap / (s.campNow / HOUR)) : 0,
      injurySkipShare: (() => { const sk = Object.keys(t.bat.spent).filter((k) => /^skip:/.test(k)).reduce((a, k) => a + t.bat.spent[k], 0); return sk ? (t.bat.spent['skip:injury'] || 0) / sk : 0; })(),
      incomeLastHour: clone(t.income.prevHour), incomeThisHour: clone(t.income.hour), incomeAll: clone(t.income.all),
      buckets: t.buckets.map((b, i) => ({ from: i * 10, n: b ? b.n : 0, wins: b ? b.wins : 0 })), items: clone(t.kpi.items),
    };
  }

  // Loss card (SPEC 5.8): the intel line and one hint, the first that applies.
  function lossHint(s, routeId) {
    const route = ROUTE[routeId] || ROUTE[s.loadout.route] || ROUTE.R1, rs = s.routes[route.id];
    const now = odds(s, route.id, null, { deltas: false }).odds, prev = rs.intel > 0 ? odds(s, route.id, { intel: rs.intel - 1 }, { deltas: false }).odds : now;
    const intel = { route: route.name, before: prev, after: now, text: 'Next ' + route.name + ' run: ' + Math.round(prev * 100) + '% → ' + Math.round(now * 100) + '%' };
    const o = odds(s, route.id);
    for (const k of ITEMS) if (s.stock[k] > 0 && !s.loadout.use[k] && o.deltas[k] > 0)
      return { kind: 'equip', item: k, text: 'Take the ' + ITEM_NAME[k] + ' next time: +' + Math.round(o.deltas[k] * 100) + '%', intel };
    if (s.stock.medkit === 0 && s.lv.infirmary >= 1) return { kind: 'craft', item: 'medkit', target: 'infirmary', text: 'Craft a medkit at the Infirmary (' + fmtDur(DATA.CRAFTS.medkit.time * mul(s, 'time')) + ')', intel };
    for (const w of DATA.WEAPON_ORDER) {
      const W = DATA.WEAPONS[w];
      if (w === 'pistol' || s.weapons[w] || s.lv.workbench < W.wb || s.res.bp < W.bp) continue;
      const g = Run.WEAPON[w].g - Run.WEAPON[bestWeapon(s)].g;
      if (g > 0) return { kind: 'weapon', weapon: w, target: 'workbench', text: 'The ' + W.name.toLowerCase() + ' is ready at the Workbench: +' + g + ' gear', intel };
    }
    let safe = null;
    for (const r of DATA.ROUTES) if (routeUnlocked(s, r) && r.id !== route.id) { const x = odds(s, r.id, null, { deltas: false }).odds; if (!safe || x > safe.odds || (x === safe.odds && r.danger > safe.r.danger)) safe = { r, odds: x }; }
    const text = route.name + ' is ' + Math.round(now * 100) + '% for you right now.' + (safe ? ' ' + safe.r.name + ' is ' + Math.round(safe.odds * 100) + '%.' : '');
    return { kind: 'route', route: safe ? safe.r.id : route.id, text, intel };
  }

  // A CL5 mid-game camp for the #demo hash and the thumbnail. In memory only: the UI never saves it.
  function demo(opts) {
    opts = opts || {};
    const s = create({ realNow: fin(opts.realNow, 0), tzOffsetMs: fin(opts.tzOffsetMs, 0), seed: 5 });
    const realNow = fin(opts.realNow, 0);
    s.campNow = 20 * HOUR; s.createdAt = realNow - 20 * HOUR; s.realSeenAt = realNow; s.daily.day = campDay(s);
    s.ftue = { step: 6, done: true }; s.pile = 0; s.forcedWins = 0; s.runSeq = 23; s.objective = 19;
    Object.assign(s.lv, { campfire: 5, storehouse: 4, bunkhouse: 4, salvage: 4, garden: 3, radio: 3, workbench: 3, infirmary: 2, generator: 1 });
    Object.assign(s.res, { scrap: 2140, food: 760, meds: 64, bat: 142, bp: 3 });
    for (const n of ['Ilse', 'Dev', 'Marta', 'Kofi']) s.people.push(person(newPersonId(s), n, Math.round(s.campNow / 2)));
    s.crews = 2; s.weapons.smg = true; s.weapons.shotgun = true; s.loadout.primary = 'shotgun'; s.loadout.route = 'R3';
    Object.assign(s.stock, { medkit: 1, pills: 2, bomb: 1 });
    const now = s.campNow;
    s.jobs = [{ id: 'campfire', toLv: 6, startAt: now - 48 * MIN, endAt: now + 72 * MIN, dur: 2 * HOUR, cut: 0 }, { id: 'salvage', toLv: 5, startAt: now - 21 * MIN, endAt: now + 9 * MIN, dur: 30 * MIN, cut: 0 }];
    s.craft.infirmary = [{ item: 'medkit', dur: 8 * MIN, endAt: now + 3 * MIN, cut: 0 }, { item: 'pills', dur: 3 * MIN, endAt: null, cut: 0 }];
    s.craft.workbench = [{ item: 'bomb', dur: 5 * MIN, endAt: now + 2 * MIN, cut: 0 }];
    const marta = s.people.find((p) => p.name === 'Marta'), kofi = s.people.find((p) => p.name === 'Kofi');
    marta.state = 'party'; marta.until = now + 70 * MIN;
    s.parties = [{ id: 'x1', who: marta.id, kind: '2h', endAt: now + 70 * MIN, loot: { scrap: 460, food: 161, meds: 9 }, back: false }];
    kofi.state = 'injured'; kofi.until = now + 9 * MIN;
    const w = workers(s);
    s.buf.salvage = rate(s, 'salvage', w) * B.salvage.holds[4] * 0.6; s.buf.garden = rate(s, 'garden', w) * B.garden.holds[3]; s.buf.infirmary = 12;
    s.gen = { charges: 1, accMs: 2 * HOUR };
    s.crate = { runId: 'r-000023', scrap: 341, food: 103, meds: 12, person: null };
    Object.assign(s.routes.R1, { runs: 6, wins: 6, firstWin: true }); Object.assign(s.routes.R2, { runs: 11, wins: 9, firstWin: true }); Object.assign(s.routes.R3, { runs: 6, wins: 4, firstWin: true, intel: 1 });
    Object.assign(s.flags, { dropGiven: true, stashGiven: true, taughtSkip: true, bombMade: true, medkitMade: true, medRunWin: true, partySent: true });
    for (let L = 2; L <= 5; L++) s.tele.unlocks['campfire' + L] = { camp: [0, 0, 6, 20, 68, 15 * 60][L] * MIN, real: realNow };
    return s;
  }

  // ------------------------------------------------------------------ save / load
  function serialize(s) { return JSON.stringify(s); }
  function migrate(obj) {
    let v = Math.max(0, Math.floor(fin(obj.v, 0)));
    while (v < CURRENT_V) { v++; obj = MIGRATIONS[v](obj); obj.v = v; }
    return obj;
  }
  function sanitize(o, notes) {
    notes = notes || [];
    const note = (m) => notes.push(m);
    const t = create({ realNow: fin(o.createdAt, 0), tzOffsetMs: fin(o.tzOffsetMs, 0), seed: 1 });
    const s = {};
    s.v = CURRENT_V; s.createdAt = fin(o.createdAt, 0); s.tzOffsetMs = fin(o.tzOffsetMs, 0); s.campNow = nn(o.campNow, 0);
    s.realSeenAt = fin(o.realSeenAt, s.createdAt); s.rng = typeof o.rng === 'number' && isFinite(o.rng) ? o.rng >>> 0 : t.rng;
    s.tabId = str(o.tabId, t.tabId); s.seq = int0(o.seq, 0);
    const f = isObj(o.ftue) ? o.ftue : {};
    s.ftue = { step: Math.round(clampN(f.step, 0, 6, 0)), done: bool(f.done, false) };
    const r = isObj(o.res) ? o.res : {};
    s.res = {}; for (const k of ['scrap', 'food', 'meds', 'bat', 'bp']) { const v = int0(r[k], 0); if (v !== r[k]) note('res.' + k + ' fixed'); s.res[k] = v; }
    const lv = isObj(o.lv) ? o.lv : {};
    s.lv = {};
    const C = Math.round(clampN(lv.campfire, 1, 10, 1)); s.lv.campfire = C;
    for (const id of DATA.BUILDING_IDS) if (id !== 'campfire') {
      const b = B[id]; let v = Math.round(clampN(lv[id], 0, 10, b.start));
      v = C < b.unlockCL ? 0 : Math.min(v, C); v = Math.max(v, b.start);
      if (v !== lv[id]) note('lv.' + id + ' fixed');
      s.lv[id] = v;
    }
    s.lv = Object.assign({}, t.lv, s.lv);
    const bf = isObj(o.buf) ? o.buf : {};
    s.buf = { salvage: nn(bf.salvage, 0), garden: nn(bf.garden, 0), infirmary: nn(bf.infirmary, 0) };
    const g = isObj(o.gen) ? o.gen : {};
    s.gen = { charges: Math.round(clampN(g.charges, 0, B.generator.holds[s.lv.generator], 0)), accMs: nn(g.accMs, 0) };
    const crews = Math.round(clampN(o.crews, 1, DATA.CREW.max, 1));
    const seen = new Set();
    s.jobs = (Array.isArray(o.jobs) ? o.jobs : []).filter((j) => {
      if (!isObj(j) || !B[j.id] || seen.has(j.id)) return false;
      if (!(typeof j.endAt === 'number' && isFinite(j.endAt)) || !(j.dur > 0) || j.toLv !== s.lv[j.id] + 1 || j.toLv > 10 || reqCL(j.id, j.toLv) > C) { note('job dropped'); return false; }
      seen.add(j.id); return true;
    }).slice(0, crews).map((j) => ({ id: j.id, toLv: j.toLv, startAt: fin(j.startAt, s.campNow), endAt: j.endAt, dur: j.dur, cut: nn(j.cut, 0) }));
    s.crews = crews;
    const cr = isObj(o.craft) ? o.craft : {};
    s.craft = {};
    for (const b of ['infirmary', 'workbench']) {
      const q = (Array.isArray(cr[b]) ? cr[b] : []).filter((c) => isObj(c) && DATA.CRAFTS[c.item] && DATA.CRAFTS[c.item].building === b && c.dur > 0 && isFinite(c.dur)).slice(0, DATA.QUEUE_MAX)
        .map((c) => ({ item: c.item, dur: c.dur, endAt: typeof c.endAt === 'number' && isFinite(c.endAt) ? c.endAt : null, cut: nn(c.cut, 0) }));
      q.forEach((c, i) => { if (i === 0 && c.endAt == null) c.endAt = s.campNow + c.dur; if (i > 0) c.endAt = null; });
      s.craft[b] = q;
    }
    const sk = isObj(o.stock) ? o.stock : {};
    s.stock = { medkit: Math.round(clampN(sk.medkit, 0, DATA.STOCK_MAX, 0)), pills: Math.round(clampN(sk.pills, 0, DATA.STOCK_MAX, 0)), bomb: Math.round(clampN(sk.bomb, 0, DATA.STOCK_MAX, 0)) };
    const wp = isObj(o.weapons) ? o.weapons : {};
    s.weapons = { smg: wp.smg === true, shotgun: wp.shotgun === true, rifle: wp.rifle === true };
    const pids = new Set();
    s.people = (Array.isArray(o.people) ? o.people : []).filter((p) => isObj(p) && typeof p.id === 'string' && typeof p.name === 'string' && !pids.has(p.id) && pids.add(p.id))
      .map((p) => ({ id: p.id, name: p.name, state: ['home', 'party', 'injured'].includes(p.state) ? p.state : 'home', until: typeof p.until === 'number' && isFinite(p.until) ? p.until : null,
        runs: int0(p.runs, 0), wins: int0(p.wins, 0), joinedAt: nn(p.joinedAt, 0) }));
    if (!s.people.length) { note('people reset'); s.people = t.people; }
    s.gate = (Array.isArray(o.gate) ? o.gate : []).filter((x) => isObj(x) && typeof x.id === 'string' && typeof x.name === 'string' && !pids.has(x.id) && pids.add(x.id)).slice(0, DATA.GATE_MAX).map((x) => ({ id: x.id, name: x.name }));
    s.gone = (Array.isArray(o.gone) ? o.gone : []).filter((n) => typeof n === 'string').slice(-200);
    const rc = o.recruit;
    s.recruit = isObj(rc) && typeof rc.name === 'string' && typeof rc.endAt === 'number' && isFinite(rc.endAt) && rc.dur > 0 ? { name: rc.name, endAt: rc.endAt, dur: rc.dur, cut: nn(rc.cut, 0) } : null;
    s.parties = (Array.isArray(o.parties) ? o.parties : []).filter((p) => isObj(p) && typeof p.id === 'string' && typeof p.who === 'string' && DATA.PARTIES.kinds[p.kind] && typeof p.endAt === 'number' && isFinite(p.endAt))
      .map((p) => ({ id: p.id, who: p.who, kind: p.kind, endAt: p.endAt, loot: { scrap: int0(p.loot && p.loot.scrap, 0), food: int0(p.loot && p.loot.food, 0), meds: int0(p.loot && p.loot.meds, 0) }, back: p.back === true }));
    for (const p of s.people) {
      if (p.state === 'injured' && p.until == null) { p.state = 'home'; note('injury without end dropped'); }
      if (p.state === 'party' && !s.parties.some((x) => x.who === p.id && !x.back)) { p.state = 'home'; p.until = null; note('party member returned'); }
      if (p.state === 'home') p.until = null;
    }
    const tr = isObj(o.truck) ? o.truck : {};
    s.truck = { scrap: int0(tr.scrap, 0), food: int0(tr.food, 0), meds: int0(tr.meds, 0) };
    const ct = o.crate;
    s.crate = isObj(ct) ? { runId: typeof ct.runId === 'string' ? ct.runId : null, scrap: int0(ct.scrap, 0), food: int0(ct.food, 0), meds: int0(ct.meds, 0), person: typeof ct.person === 'string' ? ct.person : null } : null;
    s.pile = Math.round(clampN(o.pile, 0, DATA.START.pile, 0));
    const ro = isObj(o.routes) ? o.routes : {};
    s.routes = {}; for (const id of ROUTE_IDS) { const x = isObj(ro[id]) ? ro[id] : {}; s.routes[id] = { runs: int0(x.runs, 0), wins: int0(x.wins, 0), firstWin: x.firstWin === true, intel: Math.round(clampN(x.intel, 0, 3, 0)) }; }
    const pi = isObj(o.pity) ? o.pity : {};
    s.pity = { rescue: int0(pi.rescue, 0), bp: int0(pi.bp, 0) };
    s.forcedWins = Math.round(clampN(o.forcedWins, 0, 2, 0));
    const dl = isObj(o.daily) ? o.daily : {};
    s.daily = { day: Math.min(Math.floor(fin(dl.day, 0)), Math.floor((s.createdAt + s.tzOffsetMs + s.campNow) / DAY)), wins: int0(dl.wins, 0) };
    const lo = isObj(o.loadout) ? o.loadout : {}, use = isObj(lo.use) ? lo.use : {};
    s.loadout = { primary: weaponOwned(s, lo.primary) ? lo.primary : 'pistol', use: { medkit: bool(use.medkit, true), pills: bool(use.pills, true), bomb: bool(use.bomb, true) },
      runner: s.people.some((p) => p.id === lo.runner) ? lo.runner : s.people[s.people.length > 1 ? 1 : 0].id, route: own(ROUTE, lo.route) && routeUnlocked(s, ROUTE[lo.route]) ? lo.route : 'R1' };
    s.runSeq = int0(o.runSeq, 0);
    const pe = o.pending;
    s.pending = isObj(pe) && isObj(pe.handoff) && typeof pe.handoff.runId === 'string' && isObj(pe.handoff.route) && ROUTE[pe.handoff.route.id] && isObj(pe.handoff.loadout) && isObj(pe.handoff.stats)
      && typeof pe.seed === 'number' && isFinite(pe.seed) && ['auto', 'win', 'loss', 'gateLoss'].includes(pe.force) && ['sim', 'game'].includes(pe.source) && isObj(pe.L) && WEAPON_OK(pe.L.primary)
      ? { handoff: clone(pe.handoff), force: pe.force, seed: pe.seed, source: pe.source, L: clone(pe.L) } : null;
    if (pe && !s.pending) note('pending run dropped');
    s.lastHandoff = isObj(o.lastHandoff) ? clone(o.lastHandoff) : null;
    s.lastResult = isObj(o.lastResult) ? clone(o.lastResult) : null;
    s.lastReward = isObj(o.lastReward) ? clone(o.lastReward) : null;
    s.objective = Math.round(clampN(o.objective, 0, DATA.OBJECTIVES.length, 0));
    const fl = isObj(o.flags) ? o.flags : {};
    s.flags = {}; for (const k of Object.keys(t.flags)) s.flags[k] = fl[k] === true;
    const te = isObj(o.tele) ? o.tele : {}, tt = t.tele;
    s.tele = {
      log: Array.isArray(te.log) ? clone(te.log.slice(-500)) : tt.log,
      unlocks: isObj(te.unlocks) ? clone(te.unlocks) : tt.unlocks,
      income: isObj(te.income) && isObj(te.income.all) && isObj(te.income.hour) && isObj(te.income.prevHour) ? clone(te.income) : tt.income,
      bat: isObj(te.bat) && isObj(te.bat.earned) && isObj(te.bat.spent) ? clone(te.bat) : tt.bat,
      packs: isObj(te.packs) ? clone(te.packs) : tt.packs,
      runs: isObj(te.runs) && isObj(te.runs.byRoute) && Object.values(te.runs.byRoute).every((b) => isObj(b) && isFinite(b.n) && isFinite(b.wins) && isFinite(b.odds)) ? Object.assign(tt.runs, clone(te.runs)) : tt.runs,
      buckets: Array.isArray(te.buckets) && te.buckets.length <= 10 && te.buckets.every((b) => isObj(b) && isFinite(b.n) && isFinite(b.wins)) ? clone(te.buckets) : tt.buckets,
      kpi: isObj(te.kpi) && isObj(te.kpi.waste) && isObj(te.kpi.waste.truck) && isObj(te.kpi.fullMs) && isObj(te.kpi.items) && ['crafted', 'used', 'returned'].every((k) => isObj(te.kpi.items[k])) && isObj(te.kpi.batFirstHour) ? Object.assign(tt.kpi, clone(te.kpi)) : tt.kpi,
    };
    const dv = isObj(o.dev) ? o.dev : {}, td = t.dev, L = DATA.LAB, m = isObj(dv.mul) ? dv.mul : {}, sm = isObj(dv.sim) ? dv.sim : {};
    s.dev = {
      timeScale: DATA.TIME_SCALES.includes(dv.timeScale) ? dv.timeScale : 1,
      mul: {}, freeSec: clampN(dv.freeSec, L.freeSec.min, L.freeSec.max, td.freeSec), skipExp: clampN(dv.skipExp, L.skipExp.min, L.skipExp.max, td.skipExp),
      momentum: clampN(dv.momentum, L.momentum.min, L.momentum.max, td.momentum), momentumCap: clampN(dv.momentumCap, L.momentumCap.min, L.momentumCap.max, td.momentumCap),
      force: ['auto', 'win', 'loss', 'gateLoss'].includes(dv.force) ? dv.force : 'auto', lockSeed: typeof dv.lockSeed === 'number' && isFinite(dv.lockSeed) ? dv.lockSeed >>> 0 : null,
      forcedWinsSetting: Math.round(clampN(dv.forcedWinsSetting, 0, 2, 2)), skill: clampN(dv.skill, L.skill.min, L.skill.max, 0),
      runScreenSec: L.runScreenSec.includes(dv.runScreenSec) ? dv.runScreenSec : 8, lossPayout: clampN(dv.lossPayout, L.lossPayout.min, L.lossPayout.max, td.lossPayout),
      injuryMin: clampN(dv.injuryMin, L.injuryMin.min, L.injuryMin.max, td.injuryMin), intelG: clampN(dv.intelG, L.intelG.min, L.intelG.max, td.intelG),
      sim: { D0: clampN(sm.D0, L.D0.min, L.D0.max, 110), night: clampN(sm.night, L.night.min, L.night.max, 0.6), medCalm: clampN(sm.medCalm, L.medCalm.min, L.medCalm.max, 0.6) },
      runUsesCampTime: bool(dv.runUsesCampTime, true), reducedMotion: bool(dv.reducedMotion, false), particles: [0, 0.5, 1, 2].includes(dv.particles) ? dv.particles : 1,
      volume: clampN(dv.volume, 0, 1, 0.8), muted: bool(dv.muted, false),
    };
    for (const k of Object.keys(td.mul)) s.dev.mul[k] = clampN(m[k], L.mul.min, L.mul.max, 1);
    normalize(s, notes);
    return s;
  }
  // Consistency rules shared by sanitize() and the Lab's "set CL": resources above the caps go to the truck,
  // a generator at level 0 holds nothing, locked routes and unowned weapons fall back, crafts need their building.
  function normalize(s, notes) {
    const note = (m) => { if (notes) notes.push(m); };
    const cp = caps(s), lim = capsAt({ dev: { mul: { cost: DATA.LAB.mul.max } } }, s.lv.storehouse);
    for (const k of RES) {
      const keep = s.res[k] + s.truck[k] <= 2 * lim[k];   // holdings a Lab costs multiplier could have produced are kept
      if (s.res[k] > cp[k]) { const over = s.res[k] - cp[k]; s.res[k] = cp[k]; s.truck[k] = keep ? s.truck[k] + over : Math.min(cp[k], s.truck[k] + over); note(k + ' above cap moved to the truck'); }
      if (!keep && s.truck[k] > cp[k]) { s.truck[k] = cp[k]; note('truck ' + k + ' above cap trimmed'); }
    }
    if (!s.lv.generator) { if (s.gen.charges || s.gen.accMs) note('generator reset'); s.gen.charges = 0; s.gen.accMs = 0; }
    else s.gen.charges = Math.min(s.gen.charges, B.generator.holds[s.lv.generator]);
    if (!routeUnlocked(s, ROUTE[s.loadout.route])) { s.loadout.route = 'R1'; note('route reset to R1'); }
    if (!weaponOwned(s, s.loadout.primary)) s.loadout.primary = 'pistol';
    for (const b of ['infirmary', 'workbench']) {
      const q = s.craft[b], keep = q.filter((c) => s.lv[b] >= DATA.CRAFTS[c.item].minLv);
      if (keep.length !== q.length) { note(b + ' crafts dropped'); keep.forEach((c, i) => { if (i === 0 && c.endAt == null) c.endAt = s.campNow + c.dur; }); s.craft[b] = keep; }
    }
    return s;
  }
  const WEAPON_OK = (w) => typeof w === 'string' && !!DATA.WEAPONS[w];
  function load(raw, realNow, opts) {
    opts = opts || {};
    const fresh = () => create({ realNow, tzOffsetMs: opts.tzOffsetMs, seed: opts.seed });
    if (raw == null || raw === '') return { state: fresh(), status: 'new', notes: [] };
    let obj;
    try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { state: fresh(), status: 'corrupt-reset', notes: ['Save could not be read: ' + e.message] }; }
    if (!isObj(obj) || typeof obj.v !== 'number' || !isFinite(obj.v)) return { state: fresh(), status: 'corrupt-reset', notes: ['Save has no version'] };
    if (obj.v > CURRENT_V) return { state: fresh(), status: 'future-version', notes: ['Saved by a newer version (v' + obj.v + ')'] };
    const migrated = obj.v < CURRENT_V;
    const notes = [];
    try { obj = migrate(obj); } catch (e) { return { state: fresh(), status: 'corrupt-reset', notes: ['Migration failed: ' + e.message] }; }
    let state;
    try { state = sanitize(obj, notes); } catch (e) { return { state: fresh(), status: 'corrupt-reset', notes: ['Save was damaged: ' + e.message] }; }
    const rule = DATA.assertData(state.dev.mul.cost);
    if (rule.length) notes.push('data rule: ' + rule.length + ' cost(s) above 80% of their storage cap');
    return { state, status: migrated ? 'migrated' : 'ok', notes };
  }

  return {
    CURRENT_V, MIGRATIONS, DATA, Run, DATA_RULE,
    log: (s, type, data, dev) => log(s, type, data, dev),
    create, load, serialize, sanitize, migrate, tick, resume, advance, act, view, goal, timeline, welcome,
    price: { skip: priceSkip, shortfall: priceShortfall },
    cost, buildTime, reqCL, buildCheck, loadoutFor, odds, buildHandoff, runSim, validateResult, reward, canStartRun,
    routeLab, kpis, lossHint, demo,
    fmt: { dur: fmtDur, clock: fmtClock, num: fmtNum },
    // helpers for tests and the bot (read-only)
    caps, rate: (s, id) => rate(s, id), workers, frontier: (s) => frontier(s).id, campDay, nextName, freeBeds,
    routeUnlocked: (s, id) => routeUnlocked(s, ROUTE[id]),
  };
});
