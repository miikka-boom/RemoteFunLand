/* Bellhaven engine: all city rules and state (SPEC sections 2-7, 9, 11). Pure: no DOM, no clock reads, no unseeded
 * random numbers (tests.cjs greps for them). Time and randomness are injected: the UI passes the wall clock as realNow
 * (integer ms) and frame deltas; every random draw comes from state.rng (mulberry32 stepping, saved) or from a seed
 * stored in the state (person seeds, run seeds, the city rolls). Same seed + same actions -> byte-identical serialize().
 * Classic script: BH.Engine in the browser after data.js, names.js and run.js; module.exports in node (it requires
 * them from its own folder). The engine never touches storage: the UI saves serialize() in try/catch (key
 * 'bellhaven.v1'), copies an unreadable save to 'bellhaven.v1.bad' on status 'corrupt-reset' (load returns it as
 * `bad`), and never overwrites a 'future-version' save. A demo state (state.demo true) is never saved.
 *
 * ==================================================================================================== FUNCTIONS
 *   create({ realNow, tzOffsetMin, seed })   -> state  (3.1 start layout, 2 start amounts, the two starters)
 *            tzOffsetMin = minutes east of UTC (the negated getTimezoneOffset()); seed = uint32 save seed
 *   load(raw | null, realNow, opts?)          -> { state, status: 'new'|'ok'|'migrated'|'corrupt-reset'|'future-version',
 *            notes[], bad? }   opts { tzOffsetMin, seed } for a new state. load settles the state-based rules at the
 *            saved time (a no-op for a clean save) but never credits offline time: call resume(state, realNow) next
 *            (it builds the welcome-back card).
 *   serialize(state) -> string    migrate(obj) -> obj    sanitize(obj, notes?) -> state (drops unknown keys, clamps
 *            numbers, levels <= Tower, repairs ids, overlaps and dangling references; notes[] says what it fixed)
 *   tick(state, realDeltaMs, realNow)         -> events[]  one frame: advance(min(d, 1000) x lab.timeScale) at
 *            source 'frame', d = realNow - state.realLast (integer ms from the wall clock, so frames never drift;
 *            realDeltaMs only when realNow is missing; an act() between frames stamps realLast too, so those few ms
 *            are simply not credited). Frozen while a simulated run is pending. A gap over 5 s is credited through
 *            resume() instead (the events then start with { type: 'offline', ms, welcome }).
 *   resume(state, realNow)                    -> { creditedMs, rollback, events, welcome | null }
 *            credits min(gap, 7 days) at 1x when the gap is over 5 s; a clock that went backwards credits 0
 *            (rollback true) and resets realLast; welcome when the credit is 2 min or more (5.5):
 *            { ms, title: 'WHILE YOU WERE AWAY · 3 h 12 min', rows: [{ kind: 'down'|'expired'|'job'|'bubbles'|'people'|
 *            'inn', text, personId?, graveId?, buildingId?, action?: 'decide' }] (6 at most, most important first), more }
 *   advance(state, ms, ctx)                   -> events[]  event-stepped; ctx { source: 'frame'|'offline'|'run'|'dev' }.
 *            advance(8 h) equals 480 x advance(1 min) byte for byte (integer ms everywhere, closed-form bubbles).
 *   act(state, action, realNow)               -> { ok, err?, events[], data? }  the only way the UI changes state.
 *            Sets state.realLast = realNow first; a failed action changes nothing else. After a successful action
 *            the engine settles state-based rules at the current time (goals, the stranger, the drifter, death unlock).
 *   view(state)                               -> View (derived, read-only; see below). Cheap enough for every frame.
 *   goal(state)                               -> { step, key, text, reward, eta, progress, side, target, done }
 *   info(state, buildingId)                   -> { id, type, title, rows: [{ label, from, to, run }], next, job, opens }
 *            the building sheet (8.4): before -> after rows, RUN-tagged run effects, the Tower's next opens
 *   derived(state, personId, destId)          -> the 4.6 values for this person there (card and handoff), plus
 *            { power, rescue, restMul, weapon, shoveMul, accAdd, hordeMul, roleLine, ttlLine }
 *   price.skip(sec, state?) -> sparks    price.revive(state, personId) -> { cans, sparks, n, stranger }
 *   price.invite(state) -> cans          price.kit(destId) -> { medkit, pills, bomb }
 *   autoKit(state, destId)                    -> { medkit, pills, bomb, total }  (packed in order while it fits)
 *   canPlace(state, kind, gx, gy, ignoreId?)  -> { ok, reason: 'outside'|'gate'|'occupied'|'bad'|null }
 *            kind: a building type (footprint 3 x 3 for the Tower, else 2 x 2), or 'grave' | 'decor' | 'rubble' (1 x 1)
 *   suggestSpot(state, type, nearGx, nearGy)  -> { gx, gy } | null  the valid origin whose footprint centre is nearest
 *            the point (nearGx, nearGy) in grid units (pass the ground point under the clear view's centre; to aim at an
 *            origin, pass origin + w / 2, e.g. the onboarding Cannery: DATA.START.firstSpot + 1 = (14, 14))
 *   graveSpot(state, personId)                -> { gx, gy } | null  6.7 default spot
 *   kpis(state)                               -> telemetry summary (Lab, sim-bot): counters, shares, calibration,
 *            the section-10 targets this save can be judged on
 *   demo({ realNow, tzOffsetMin })            -> a Tower-4 city like the mock for #demo (state.demo true: never save it)
 *   towerOpens(lv) -> [{ kind, id?, type?, text }]   what Tower level lv opens (3.4.1, 3.7)
 *   cost(state, type, lv) -> { res, n }   jobMs(state, type, lv) -> ms   caps(state) -> { bricks, cans }
 *   rates(state) -> { bricks, cans } per hour   cranes(state) -> { total, free }   beds(state)   bubble(state, id)
 *   fmt.compact(n, narrow) · fmt.num(n) · fmt.dur(sec) · fmt.clock(sec) · fmt.pct(x, 'death'?) · fmt.hoursLeft(ms) ·
 *   fmt.iso(ms)
 *
 *   STAGE 3 (people and runs) stubs, documented where they live below: odds, oddsKey, kitDeltas, restedOdds, strip and
 *   suggest (placeholders without odds today: strip orders by favoured role, Ready first, lower level, lower index),
 *   buildHandoff, runSim, validateResult, reward, and the actions startRun, resolveRun, revive, goodbye, invite (they
 *   answer err 'state' with data.todo). Ready-made helpers, exposed as Engine._internal: fall(s, p, why, ev) (Fallen,
 *   epitaph, grave on its default spot or waiting, the events), setDown(s, p), addXp(s, p, xp, ev) (level-ups, history
 *   lines), assignHouse(s, p), gain(s, res, n, src) (cut at the cap), earn(s, n, why) / spend(s, n, why) (sparks and
 *   their telemetry), history(s, p, text), epitaph(s, p), genPerson(s, { lv, how, role }), refreshInn(s, ev),
 *   warpAtGo(s, realNow) -> warpS (stamps lastSimGoRealMs) and runClockMs(s, pending, result) (5.1),
 *   restFrac / startHpFrac / restMulOf (6.2, 4.6), settle(s, ev), welcome(s, events, ms); plus Run.cityRolls(seed),
 *   Run.toResult(r, meta), Run.mc(), Run.homeOdds() and DATA.TEXT for every history and epitaph template.
 *
 * ==================================================================================================== STATE (11.2, save v1)
 *   As 11.2, plus: ids { b, j, r, g, d } (id counters: 'b4', 'j12', ...), demo (true only for #demo), grave.houseId
 *   (the House the person slept in, for the default spot), person.kin (the buried person whose family name a traveler
 *   or drifter took, P1). Times are integer ms; bubbles are bubbleBase + bubbleSinceMs. Inn travelers are full person
 *   records (state 'ready', no House, no history until invited). Beds: living people hold their beds, even the stranger
 *   Down at the gate with no House; a newcomer while living > beds (a drifter, a Lab arrival) sleeps on the plaza bench
 *   (houseId null) until a bed frees.
 *
 * ==================================================================================================== VIEW
 *   { v, cityMs, night, demo, today, realLast,
 *     tower: { id, lv, gx, gy, storeys, gold, hordeWarnS, job, next: { lv, cost, timeS, opens[], ok, err, needTower } | null },
 *     land: { ring, side, lo, hi, gate: { x (the fence line gx = hi), gy: [11, 12], tiles: [[gx, gy] x 2] },
 *             quietCorner: { gx, gy }, next: { ring, side, needTower, cost, timeS, ok, err } | null,
 *             groundKey (changes when the land, the Tower's spot or the plaza change: re-render the ground cache) },
 *     plaza: [[gx, gy], ...] free tiles within 1 of the Tower's footprint (paving, cosmetic),
 *     walkable: string of 576 '0'/'1' (index gy * 24 + gx): free land tiles, gate tiles included,
 *     buildings: [{ id, type, name, lv, gx, gy, w, d, label ('KILN · LV 3'), maxLv, building (lv 0: under construction),
 *                   job: JobView | null, bubble: { res, amount, whole, hold, frac, show, full } | null,
 *                   next: { lv, cost, timeS, ok, err, needTower } | null,
 *                   house: { idx, color, roof, beds, residents[], resting, lit, lantern } (houses),
 *                   clinic: { down: [{ personId, first, leftMs }], recovering[] } (Clinic),
 *                   inn: { travelers } (Inn), tower: { storeys, gold } (Tower) }],
 *     jobs: [JobView { id, kind, buildingId, type, name, toLv, startMs, endMs, leftMs, progress, price, free, confirm, label }],
 *     cranes: { total, free, crane4, buy: { ok, err, price }, list: [{ i, busy, jobId, site: { gx, gy, w, d } | null, park: { x, y } }] },
 *     rubble: [{ id, gx, gy, ring, glint, cost: { res, n }, ok }],
 *     graves: [{ id, personId, gx, gy, waiting, placedMs, ageMs, first, name, initial, ribbon, grassed, flowers,
 *                flowerColors[4], candle, epitaph }],
 *     decor: [{ id, type, gx, gy }],
 *     people: [PersonView] living, roster order (Down, Ready, Resting, Hurt, Recovering, Out),
 *     remembered: [PersonView] the Fallen (with graveId),
 *     inn: { id, lv, travelers: [PersonView], nextRefreshMs, leftMs, price, invitePrice, canInvite: { ok, err } } | null,
 *     res, caps, rates (per hour), chips: { tower, bricks: { n, cap, frac }, cans: { n, cap, frac, over },
 *             sparks, cranes: { free, total }, people: { living, beds, down }, build: { affordable } },
 *     tray: [{ type, name, decor, cost, timeS, built, allowed, max, locked (needs Tower N) | null, full, affordable, ok, err }],
 *     dests: [{ id, n, name, threat, open, lock ('Tower 5' | 'Needs the Clinic') | null, cleared, firstSparks, bricks,
 *               cans, xp, fav, kit }],
 *     goal: goal(state), play: suggest(state) | null, daily: { claimed }, deathOn,
 *     pending: { runId, personId, destId, source } | null, flags, lab: { timeScale, reducedMotion, runScreenS, force, waitReal } }
 *   PersonView: { id, index, first, last, name, fullName (with “nickname”), nick, nickName, age, role, roleName,
 *     trade, card ('Used to be a taxi driver. Rates every sunset out of ten.'), trait, traitName, traitLine, habit, look,
 *     lv, xp, xpFrom, xpTo, state, restKind, restLeftMs, restTotalMs, startHpFrac, downLeftMs, houseId, house (color name),
 *     where: 'walk'|'house'|'bench'|'clinic'|'gate'|'out'|'grave', pill ('Rested', 'Tired 6:10', 'Hurt 31:00',
 *     'Recovering 12:00', 'Down · 20 h', 'Out'), stranger, runs, wins, kills, bestKills, revives, history, epitaph,
 *     suggested, graveId, arrivedNight, arrivedHow ('starter'|'inn'|'drifter'|'stranger'|'lab'|'traveler'), fellNight,
 *     fellDest, fellOdds, kin, kinLine ('Says Efua Boateng was family.' | null) }
 *
 * ==================================================================================================== EVENTS
 *   { type, ... }: jobStarted { jobId, kind, buildingId, toLv } · jobDone { jobId, kind, buildingId, buildingType, lv, name } ·
 *   towerUp { lv, opens, sparks, text } · finale · expanded { ring, side, rubble[], glintId } · bubbleFull { buildingId,
 *   res, at } · collected { buildingId, res, n, overflow } · placed { buildingId | decorId, buildingType, jobId } · moved { kind, id, gx,
 *   gy } · finished { jobId, price } · rubbleCleared { rubbleId, sparks, gx, gy } · craneBought · rested { personId, early, price? } ·
 *   innRefresh { n, travelers[] } · stranger { personId } · drifter { personId } · deathOn · fell { personId, graveId,
 *   why, where } · downExpired { personId, graveId, where } · gravePlaced { graveId, personId, gx, gy } · goal { step,
 *   key, text, reward } · levelUp { personId, lv } · packClaimed { size } · offline { ms, welcome? } · dev { op }.
 *   Stage 3 adds: daily, firstClear, nickname, invited, revived (and fills the run events).
 *
 * ==================================================================================================== ACTIONS
 *   collect { id } · place { kind, gx, gy, finishOther? } (kind: a building type or 'tree' | 'bench' | 'lamp') ·
 *   upgrade { id, finishOther? } · expand { finishOther? } · clearRubble { id } · move { target: { kind: 'building' |
 *   'grave' | 'decor', id }, gx, gy } · finish { jobId, confirm? } · restNow { personId, confirm? } · innNow { confirm? } ·
 *   buyCrane · claimPack { size: 100 | 500 | 2500 } · flag { name: 'metPeople' | 'deathCardSeen' | 'finale' } ·
 *   setLastDest { destId } · dev { op, ... } · STAGE 3: invite { travelerId } · startRun { destId, personId, kit,
 *   confirmLow? } -> data.handoff · resolveRun { result, source } -> data { reward, outcome, notes } · revive {
 *   personId, pay: 'cans' | 'sparks' } · goodbye { personId } -> data { graveId, spot }.
 *   finishOther: with every crane busy, pays the skip price of the job with the least time left (no second confirm:
 *   the "Finish the Kiln now · 7 ✦" dialog is the confirmation), finishes it and starts the new job.
 *   Prices of 20 ✦ or more need confirm: true (else err 'confirm', data { price }).
 *
 * ==================================================================================================== ERRORS
 *   noCrane (data { jobId, price, label }) · cost (data { res, need }) · locked (data { needTower }) ·
 *   max · blocked (data { reason }) · beds · busy · notFound · confirm (data { price }) · pending · state
 *
 * ==================================================================================================== DEV OPS (act { type: 'dev', op })
 *   Time:    timeScale { value: 0|1|10|60|600 } · skipAhead { ms } (offline path: data.welcome) · runsAdvanceClock { value }
 *            · runWarp { value: 0 (no cap) | 1-20 }
 *   Grants:  grant { what: 'bricks'|'cans'|'sparks', n? (1,000 / 1,000 / 100) } · fillBubbles · finishAll (jobs, rests,
 *            the Inn; never a Down deadline) · setTower { lv } · clearRubble (all, no sparks)
 *   Runs:    force { value: 'auto'|'win'|'loss'|'down'|'hurt' } · runScreenS { value: 3|8|20 } · lockSeed { value: uint|null }
 *            · forcedWins { value: 0-2 } · waitReal { value } · (paste a result: STAGE 3 resolveRun { source: 'paste' })
 *   Tuning:  mul { key: cost|time|prod|loot|xp|death|revive|rest|inn, value } (costs and caps scale together; prod
 *            re-bases every bubble first; data.dataRule lists violations) · rescueBase { destId, value } · set { key:
 *            clinicRescue|tiredFloor|escalationCap|downWindowMs|freeSec|skipExp|skipK|reducedMotion, value } · resetLab
 *   People:  addPerson { seed?, lv? } (ignores beds) · kill { personId } (Down now) · reviveAll · setLevel { personId, lv }
 *            · giveXp { personId, xp } · reroll { seed? } (a new save seed, the Lab kept)
 *   State:   replayOnboarding · reset { seed? } (export/import: serialize() and load())
 *   Every dev change is tagged dev: Lab sparks and packs never count as income in the telemetry.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Engine = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const DATA = BH.DATA || (typeof require === 'function' ? require('./data.js') : null);
  const Names = BH.Names || (typeof require === 'function' ? require('./names.js') : null);
  const Run = BH.Run || (typeof require === 'function' ? require('./run.js') : null);

  const V = 1, SEC = 1000, MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const B = DATA.BUILDINGS, TYPES = DATA.TYPES, EXP = DATA.EXPAND, RULES = DATA.RULES, TEXT = DATA.TEXT, START = DATA.START;
  const GOALS = DATA.GOALS, XP_AT = DATA.XP_AT, G = START.world;
  const DEST = {}; DATA.DESTS.forEach((d) => { DEST[d.id] = d; });
  const DATA_RULE = DATA.assertData(1);                      // SPEC 3.4: asserted when the engine loads (tests check it is [])
  const MIGRATIONS = { 1: (o) => o };
  const PRODUCERS = { kiln: 'bricks', cannery: 'cans' };
  const STATES = ['ready', 'rest', 'out', 'down', 'fallen'], REST_KINDS = ['tired', 'hurt', 'recovering'];
  const HOWS = ['starter', 'inn', 'traveler', 'drifter', 'stranger', 'lab'];
  const UI_FLAGS = ['metPeople', 'deathCardSeen', 'finale'];
  const PACKS = [100, 500, 2500];
  const BIG = 9e15;                                          // counters never exceed a safe integer

  // ------------------------------------------------------------------ small helpers
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clampInt = (v, lo, hi, d) => Math.round(clamp(fin(v, d), lo, hi));
  const uint = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.floor(Math.abs(v)) >>> 0 : d);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const str = (v, d) => (typeof v === 'string' ? v : d);
  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const idNum = (id) => +String(id).replace(/^\D+/, '') || 0;
  const ordinal = (n) => (n === 1 ? '' : n === 2 ? '2nd ' : n === 3 ? '3rd ' : n + 'th ');
  const joinNames = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

  // ------------------------------------------------------------------ number and time formats (2, 5.5, 6.3.3)
  const dec1 = (x) => { const v = Math.floor(x * 10 + 1e-9) / 10; return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1); };
  function fmtNum(n) { n = Math.floor(fin(n, 0)); const t = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '-' : '') + t; }
  function fmtCompact(n, narrow) {
    n = Math.floor(fin(n, 0)); const a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a < 1000) return String(n);
    if (a < 10000) return narrow ? sg + dec1(a / 1000) + 'k' : fmtNum(n);
    if (a < 100000) return sg + dec1(a / 1000) + 'k';
    if (a < 1e6) return sg + Math.floor(a / 1000) + 'k';
    return sg + dec1(a / 1e6) + 'M';
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(fin(sec, 0)));
    if (sec < 60) return sec + ' s';
    if (sec < 3600) return Math.floor(sec / 60) + ' min';
    if (sec < 172800) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return m ? h + ' h ' + m + ' min' : h + ' h'; }
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600); return h ? d + ' d ' + h + ' h' : d + ' d';
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(fin(sec, 0) - 1e-9));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(x) : m + ':' + pad2(x);
  }
  function fmtPct(x, mode) {
    const p = 100 * fin(x, 0);
    if (mode === 'death') { if (p <= 0) return '0%'; const r = Math.round(p * 10) / 10; return (r < 10 ? r.toFixed(1) : String(Math.round(p))) + '%'; }
    return Math.round(p) + '%';
  }
  function fmtHoursLeft(ms) { const h = Math.floor(Math.max(0, fin(ms, 0)) / HOUR); return h >= 1 ? h + ' h left' : 'under an hour left'; }
  function fmtIso(ms) {                                       // ISO 8601 from epoch ms, pure arithmetic (civil from days)
    ms = Math.floor(fin(ms, 0)); const days = Math.floor(ms / DAY); let rem = ms - days * DAY;
    const z = days + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    let y = yoe + era * 400; const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9); if (m <= 2) y++;
    const hh = Math.floor(rem / HOUR); rem -= hh * HOUR; const mm = Math.floor(rem / MIN); rem -= mm * MIN; const ss = Math.floor(rem / SEC);
    return y + '-' + pad2(m) + '-' + pad2(d) + 'T' + pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss) + '.' + String(rem - ss * SEC).padStart(3, '0') + 'Z';
  }
  const fmt = { compact: fmtCompact, num: fmtNum, dur: fmtDur, clock: fmtClock, pct: fmtPct, hoursLeft: fmtHoursLeft, iso: fmtIso };

  // ------------------------------------------------------------------ the city RNG: mulberry32 stepping on state.rng
  function rand(s) {
    let a = s.rng | 0; a = a + 0x6D2B79F5 | 0; s.rng = a >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  const nid = (s, k) => k + (++s.ids[k]);

  // ------------------------------------------------------------------ lookups
  const byId = (s, id) => s.buildings.find((b) => b.id === id) || null;
  const towerB = (s) => s.buildings.find((b) => b.type === 'tower');
  const towerLv = (s) => { const t = towerB(s); return t ? t.lv : 1; };
  const personById = (s, id) => s.people.find((p) => p.id === id) || null;
  const jobFor = (s, bid) => s.jobs.find((j) => j.target === bid) || null;
  const ofType = (s, t) => s.buildings.filter((b) => b.type === t);
  const countBuilt = (s, t) => s.buildings.reduce((n, b) => n + (b.type === t && b.lv >= 1 ? 1 : 0), 0);
  const maxLvOf = (s, t) => s.buildings.reduce((m, b) => (b.type === t && b.lv > m ? b.lv : m), 0);
  const living = (s) => s.people.filter((p) => p.state !== 'fallen');
  const present = (s) => s.people.filter((p) => p.state === 'ready' || p.state === 'rest' || p.state === 'out');
  const innB = (s) => s.buildings.find((b) => b.type === 'inn') || null;
  const clinicLv = (s) => maxLvOf(s, 'clinic');
  const armoryLv = (s) => maxLvOf(s, 'armory');
  function allowedCount(s, t) { let n = 0; const T = towerLv(s); for (const [tw, c] of B[t].count) if (T >= tw) n = c; return n; }
  const maxCount = (t) => B[t].count[B[t].count.length - 1][1];
  function countTower(t, have) { for (const [tw, c] of B[t].count) if (c > have) return tw; return null; }
  function costOf(s, t, lv) { return { res: B[t].cur, n: Math.round(B[t].cost[lv] * s.lab.mul.cost) }; }
  function jobMs(s, t, lv) { return Math.round(B[t].time[lv] * SEC * s.lab.mul.time); }
  const expandCost = (s, ring) => Math.round(EXP.cost[ring] * s.lab.mul.cost);
  const expandMs = (s, ring) => Math.round(EXP.time[ring] * SEC * s.lab.mul.time);
  const clearCost = (s, ring) => Math.round(EXP.clear[ring] * s.lab.mul.cost);
  function capOf(s, res) {
    const m = s.lab.mul.cost, row = res === 'bricks' ? B.depot.capB : B.depot.capC;
    let c = Math.round(DATA.CAP0[res] * m);
    for (const b of s.buildings) if (b.type === 'depot' && b.lv >= 1) c += Math.round(row[b.lv] * m);
    return c;
  }
  const rateLv = (s, t, lv) => B[t].rate[lv] * s.lab.mul.prod;            // per hour, the Lab's multiplier included
  const holdLv = (s, t, lv) => rateLv(s, t, lv) * B[t].hold[lv];
  function rateOf(s, res) { let r = 0; for (const b of s.buildings) if (PRODUCERS[b.type] === res && b.lv >= 1) r += rateLv(s, b.type, b.lv); return r; }
  const cranesTotal = (s) => DATA.TOWER.cranes[towerLv(s)] + (s.crane4 ? 1 : 0);
  const cranesFree = (s) => Math.max(0, cranesTotal(s) - s.jobs.length);
  function bedsOf(s) { let n = 0; for (const b of s.buildings) if (b.type === 'house' && b.lv >= 1) n += B.house.beds[b.lv]; return n; }
  function destOpen(s, d) { return towerLv(s) >= d.tower && (!d.clinic || clinicLv(s) >= 1); }
  function destLock(s, d) { return towerLv(s) < d.tower ? 'Tower ' + d.tower : d.clinic && clinicLv(s) < 1 ? 'Needs the Clinic' : null; }
  const lootMul = (s) => s.lab.mul.loot;
  function skipPrice(sec, s) {
    const L = s && s.lab ? s.lab : DATA.LAB_DEFAULT;
    if (!(sec > L.freeSec)) return 0;
    return Math.ceil(L.skipK * Math.pow(sec / 60, L.skipExp));
  }
  const dayOf = (s, realNow) => Math.floor((fin(realNow, 0) + s.tzOffsetMin * MIN) / DAY);

  // ------------------------------------------------------------------ the grid (3.1-3.3)
  const landLo = (s) => 8 - s.ring, landHi = (s) => 16 + s.ring;
  const inLand = (s, x, y) => x >= landLo(s) && x < landHi(s) && y >= landLo(s) && y < landHi(s);
  const isGate = (s, x, y) => x === 15 + s.ring && (y === START.gateGy[0] || y === START.gateGy[1]);
  const footW = (kind) => (B[kind] ? B[kind].w : 1);
  function occGrid(s, ignoreId) {
    const g = new Array(G * G).fill(null), put = (x, y, w, o) => { for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) { const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < G && Y < G) g[Y * G + X] = o; } };
    for (const b of s.buildings) if (b.id !== ignoreId) put(b.gx, b.gy, B[b.type].w, b.id);
    for (const r of s.rubble) if (r.id !== ignoreId) put(r.gx, r.gy, 1, r.id);
    for (const d of s.decor) if (d.id !== ignoreId) put(d.gx, d.gy, 1, d.id);
    for (const g2 of s.graves) if (g2.id !== ignoreId && g2.gx != null) put(g2.gx, g2.gy, 1, g2.id);
    return g;
  }
  function fitsGrid(s, grid, w, gx, gy) {
    if (!Number.isInteger(gx) || !Number.isInteger(gy)) return 'bad';
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const x = gx + i, y = gy + j;
      if (!inLand(s, x, y)) return 'outside';
      if (isGate(s, x, y)) return 'gate';
      if (grid[y * G + x] != null) return 'occupied';
    }
    return null;
  }
  function canPlace(s, kind, gx, gy, ignoreId) {
    const reason = fitsGrid(s, occGrid(s, ignoreId), footW(kind), gx, gy);
    return { ok: !reason, reason };
  }
  function suggestSpot(s, type, nearGx, nearGy, ignoreId) {
    const w = footW(type), grid = occGrid(s, ignoreId), lo = landLo(s), hi = landHi(s);
    const cx = fin(nearGx, 12), cy = fin(nearGy, 12);
    let best = null, bd = Infinity;
    for (let y = lo; y + w <= hi; y++) for (let x = lo; x + w <= hi; x++) {
      if (fitsGrid(s, grid, w, x, y)) continue;
      const dx = x + w / 2 - cx, dy = y + w / 2 - cy, dd = dx * dx + dy * dy;
      if (dd < bd - 1e-9) { bd = dd; best = { gx: x, gy: y }; }
    }
    return best;
  }
  function spotFrom(s, sx, sy, grid) {                        // 6.7: Chebyshev rings 0, 1, 2, ...; gy then gx ascending
    grid = grid || occGrid(s);
    for (let r = 0; r < G; r++) for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r || x < 0 || y < 0 || x >= G || y >= G) continue;
      if (!fitsGrid(s, grid, 1, x, y)) return { gx: x, gy: y };
    }
    return null;
  }
  function graveStart(s, houseId) {
    const h = houseId ? byId(s, houseId) : null;
    return h && h.type === 'house' ? { gx: h.gx, gy: h.gy + 2, house: h } : { gx: landLo(s), gy: landLo(s), house: null };
  }
  function graveSpot(s, personId) {
    const p = personById(s, personId); if (!p) return null;
    const g = s.graves.find((x) => x.personId === personId);
    const st = graveStart(s, p.state === 'fallen' && g ? g.houseId : p.houseId);
    return spotFrom(s, st.gx, st.gy, occGrid(s, g ? g.id : null));
  }
  function plazaTiles(s, grid) {
    const t = towerB(s); if (!t) return [];
    grid = grid || occGrid(s); const out = [];
    for (let y = t.gy - 1; y <= t.gy + 3; y++) for (let x = t.gx - 1; x <= t.gx + 3; x++) {
      if (x >= t.gx && x < t.gx + 3 && y >= t.gy && y < t.gy + 3) continue;
      if (inLand(s, x, y) && !isGate(s, x, y) && grid[y * G + x] == null) out.push([x, y]);
    }
    return out;
  }

  // ------------------------------------------------------------------ money and telemetry bookkeeping
  function gain(s, res, n, src) {                             // storage gains are cut at the cap (2)
    n = Math.max(0, Math.round(fin(n, 0)));
    const room = Math.max(0, capOf(s, res) - s.res[res]), g = Math.min(room, n);
    s.res[res] += g;
    if (n > g && src !== 'dev') { if (res === 'bricks') s.tel.overflowBricks += n - g; else s.tel.overflowCans += n - g; }
    if (res === 'bricks') { if (src === 'run') s.tel.bricksRun += g; else if (src === 'prod') s.tel.bricksProd += g; else if (src === 'goal') s.tel.bricksGoal += g; }
    else if (src === 'run') s.tel.cansRun += g; else if (src === 'prod') s.tel.cansProd += g;
    return g;
  }
  function earn(s, n, why) {                                  // sparks; dev sources never count as income (9)
    if (!(n > 0)) return 0;
    s.res.sparks += n;
    if (why === 'pack' || why === 'lab') s.tel.devSparks += n; else s.tel.sparksIn[why] = (s.tel.sparksIn[why] || 0) + n;
    return n;
  }
  function spend(s, n, why) {                                 // the sinks: finish, restNow, innNow, revive, crane (19)
    if (!(n > 0)) return 0;
    s.res.sparks -= n; s.tel.sparksOut[why] = (s.tel.sparksOut[why] || 0) + n;
    return n;
  }

  // ------------------------------------------------------------------ bubbles (5.2): closed form, never accumulated
  function bubbleAt(s, b, at) {
    if (!PRODUCERS[b.type]) return 0;
    if (b.lv < 1) return b.bubbleBase || 0;
    const rate = rateLv(s, b.type, b.lv);
    return Math.min(rate * B[b.type].hold[b.lv], b.bubbleBase + rate * Math.max(0, (at == null ? s.cityMs : at) - b.bubbleSinceMs) / HOUR);
  }
  function rebase(s, b, at, left) { b.bubbleBase = left == null ? bubbleAt(s, b, at) : left; b.bubbleSinceMs = at; }
  function fillMs(s, b) {
    if (!PRODUCERS[b.type] || b.lv < 1) return null;
    const rate = rateLv(s, b.type, b.lv), hold = rate * B[b.type].hold[b.lv];
    if (!(rate > 0) || b.bubbleBase >= hold) return null;
    return b.bubbleSinceMs + Math.ceil((hold - b.bubbleBase) / rate * HOUR);
  }
  function bubbleView(s, b) {
    const res = PRODUCERS[b.type]; if (!res || b.lv < 1) return null;
    const amount = bubbleAt(s, b), hold = holdLv(s, b.type, b.lv);
    return { res, amount, whole: Math.floor(amount), hold, frac: hold > 0 ? amount / hold : 0, show: amount >= RULES.bubbleShow * hold && amount >= 1, full: amount >= hold };
  }

  // ------------------------------------------------------------------ people
  function takenNames(s, extra) { const t = []; for (const p of s.people) t.push(p.first); for (const p of s.inn.travelers) t.push(p.first); return extra ? t.concat(extra) : t; }
  const takenHabits = (s) => living(s).map((p) => p.habit);
  function personRecord(g, how, night) {
    const lv = clamp(g.lv || 1, 1, 10), line = how === 'traveler' ? null : TEXT.arrived[how] || TEXT.arrived.lab;
    return { id: 'p' + g.index, index: g.index, seed: g.seed, first: g.first, last: g.last, nick: null, age: g.age, role: g.role,
      trade: g.trade, trait: g.trait, habit: g.habit, look: { skin: g.look.skin, hairStyle: g.look.hairStyle, hair: g.look.hair, jacket: g.look.jacket, acc: g.look.acc },
      lv, xp: XP_AT[lv], state: 'ready', restKind: null, restFromMs: 0, restUntilMs: 0, downUntilMs: 0, houseId: null,
      revives: 0, runs: 0, wins: 0, hurtCount: 0, kills: 0, bestKills: 0,
      history: line ? [[night, fill(line, { n: night })]] : [], arrivedNight: night, arrivedHow: how,
      fellNight: null, fellDest: null, fellOdds: null, epitaph: null, kin: null };
  }
  // A new person from the save seed and the next index (4.2): first names unique among the living, the buried and the Inn.
  // Kin (4.11, P1): travelers and drifters may take a buried family name (the generator always draws for it, so the
  // stream never shifts); the record then names that grave's person ("Says Efua Boateng was family.").
  function genPerson(s, o) {
    o = o || {};
    const index = s.nextIndex++, how = o.how || 'lab';
    const seed = o.seed != null ? o.seed >>> 0 : s.saveSeed, idx = o.seed != null ? 0 : index;
    const opts = { taken: takenNames(s, o.extraTaken), takenHabits: takenHabits(s), role: o.role || null, lv: o.lv || 1 };
    const buried = how === 'traveler' || how === 'drifter' ? s.graves.map((gr) => personById(s, gr.personId)).filter(Boolean) : [];
    const g = Names.person(seed, idx, buried.length ? Object.assign({ buried: buried.map((q) => q.last) }, opts) : opts);
    g.index = index;
    const rec = personRecord(g, how, s.night);
    if (buried.length && g.last !== Names.person(seed, idx, opts).last) { const k = buried.filter((q) => q.last === g.last).pop(); if (k) rec.kin = k.id; }
    return rec;
  }
  function history(s, p, text) {
    p.history.push([s.night, text]);
    while (p.history.length > RULES.maxHistory) p.history.shift();
  }
  function epitaph(s, p) {
    let l1;
    if (p.nick && DATA.NICKNAMES[p.nick]) l1 = fill(TEXT.epitaphNick, { F: p.first, Nick: DATA.NICKNAMES[p.nick].name });
    else if (p.bestKills >= RULES.epitaphKills) l1 = fill(TEXT.epitaphKills, { k: fmtNum(p.bestKills) });
    else if (p.runs === 0) l1 = fill(TEXT.epitaphRuns0, { n: p.arrivedNight });
    else if (p.runs === 1) l1 = TEXT.epitaphRuns1;
    else l1 = fill(TEXT.epitaphRunsN, { k: p.runs });
    return [l1, Names.habitPast(p.habit)];
  }
  function addXp(s, p, xp, ev) {                              // 4.8: people level only by running (and the Lab)
    p.xp = Math.max(0, p.xp + Math.max(0, Math.round(fin(xp, 0))));
    while (p.lv < 10 && p.xp >= XP_AT[p.lv + 1]) {
      p.lv++; s.tel.levelUps++;
      if (TEXT.levelLines.includes(p.lv)) history(s, p, fill(TEXT.level, { n: s.night, L: p.lv }));
      ev.push({ type: 'levelUp', personId: p.id, lv: p.lv });
    }
  }
  function assignHouse(s, p) {                                // 4.10: the lowest-index House with a free bed
    // Living people hold their beds even without a House (the stranger Down at the gate): while living > beds the
    // newcomer (a drifter, a Lab arrival) sleeps on the plaza bench until a bed frees.
    if (s.people.reduce((n, q) => n + (q !== p && q.state !== 'fallen' ? 1 : 0), 0) + 1 > bedsOf(s)) { p.houseId = null; return null; }
    const houses = s.buildings.filter((b) => b.type === 'house' && b.lv >= 1).sort((a, b) => a.houseIdx - b.houseIdx);
    for (const h of houses) {
      const used = s.people.reduce((n, q) => n + (q !== p && q.state !== 'fallen' && q.houseId === h.id ? 1 : 0), 0);
      if (used < B.house.beds[h.lv]) { p.houseId = h.id; return h.id; }
    }
    p.houseId = null; return null;
  }
  function houseName(s, houseId) { const h = houseId ? byId(s, houseId) : null; return h && h.type === 'house' ? DATA.HOUSE_COLORS[h.houseIdx % 3].name : null; }
  function graveWhere(s, grave) {
    if (!grave || grave.gx == null) return 'The grave waits for a place.';
    const c = houseName(s, grave.houseId);
    return c ? 'A grave stands by the ' + c + ' House.' : 'A grave stands in the quiet corner.';
  }
  // Fallen at once, the epitaph written, the grave on its default spot (or waiting for a free tile): 6.6.2, 6.7.
  function fall(s, p, why, ev) {
    const houseId = p.state === 'fallen' ? null : p.houseId;
    p.state = 'fallen'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; p.downUntilMs = 0;
    p.epitaph = epitaph(s, p);
    const st = graveStart(s, houseId), spot = spotFrom(s, st.gx, st.gy);
    const grave = { id: nid(s, 'g'), personId: p.id, gx: spot ? spot.gx : null, gy: spot ? spot.gy : null, placedMs: s.cityMs, houseId: st.house ? st.house.id : null };
    s.graves.push(grave);
    p.houseId = null;                                         // frees the bed
    s.tel.graves++;
    if (why === 'expired') s.tel.expired++; else if (why === 'goodbye') s.tel.goodbyes++;
    if (s.tel.firstGraveMs == null) s.tel.firstGraveMs = s.cityMs;
    const where = graveWhere(s, grave);
    ev.push({ type: 'fell', personId: p.id, graveId: grave.id, why, where });
    if (spot) ev.push({ type: 'gravePlaced', graveId: grave.id, personId: p.id, gx: spot.gx, gy: spot.gy });
    if (why === 'expired') ev.push({ type: 'downExpired', personId: p.id, graveId: grave.id, where });
    return grave;
  }
  function setDown(s, p) { p.state = 'down'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; p.downUntilMs = s.cityMs + Math.round(s.lab.downWindowMs); }
  function restMulOf(s, p) {
    return B.clinic.restMul[clinicLv(s)] * (p.trait === 'light_sleeper' ? DATA.TRAITS.light_sleeper.rest : 1) * (p.nick === 'oldhand' ? DATA.NICKNAMES.oldhand.rest : 1) * s.lab.mul.rest;
  }
  function restFrac(s, p) {                                   // the share of rest done, in 5 % steps (6.2)
    if (p.state !== 'rest') return 1;
    const tot = Math.max(1, p.restUntilMs - p.restFromMs), done = clamp((s.cityMs - p.restFromMs) / tot, 0, 1);
    return Math.floor(done * 20 + 1e-9) / 20;
  }
  function startHpFrac(s, p) { const f = s.lab.tiredFloor; return f + (1 - f) * restFrac(s, p); }

  // 4.6: what this person brings to a run at destId (the card and the handoff). Pure.
  function derived(s, personId, destId) {
    const p = typeof personId === 'object' && personId ? personId : (personById(s, personId) || s.inn.travelers.find((t) => t.id === personId));
    if (!p) return null;
    const d = DEST[destId] || DEST[s.lastDest] || DATA.DESTS[0], L = p.lv, T = towerLv(s), ar = armoryLv(s), cl = clinicLv(s), role = p.role, tr = p.trait, nk = p.nick;
    const maxHp = (tr === 'tough' ? 115 : tr === 'heavy' ? 110 : 100) + (nk === 'lastbreath' ? 5 : 0);
    const hpFrac = startHpFrac(s, p), startHp = Math.round(maxHp * hpFrac);
    const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
    const speed = 200 + (role === 'sprinter' ? 2 * L : 0) + (tr === 'heavy' ? -15 : 0) + (nk === 'ghost' ? 5 : 0);
    const shoveCdMul = r2((role === 'brawler' ? 1 - 0.03 * L : 1) * (nk === 'elbows' ? 0.9 : 1));
    const assist = r2(Math.min(1, 0.5 + (role === 'marksman' ? 0.03 * L : 0) + (tr === 'steady' ? 0.10 : 0)));
    const flashlightR = 520 + (role === 'scout' ? 12 * L : 0) + (tr === 'night_owl' ? 40 : 0);
    const hordeWarnS = r1(Math.min(8, 3 + 0.3 * T + (role === 'scout' ? 0.2 * L : 0) + (nk === 'gatecrasher' ? 1 : 0)));
    const damageMul = r2(B.armory.damage[ar] * (role === 'marksman' ? 1 + 0.01 * L : 1) * (tr === 'reckless' ? 1.1 : 1) * (nk === 'mower' ? 1.05 : 1));
    const medkitHeal = role === 'medic' ? r2(0.8 + 0.02 * L) : 0.8, medkitHealS = role === 'medic' ? r1(3 - 0.1 * L) : 3;
    const pillsTemp = tr === 'iron_stomach' ? 70 : 50, secondWind = B.clinic.sw[cl];
    const tp = DATA.TRAITS[tr] || {}, fav = DATA.ROLE_STATS[role] && DATA.ROLE_STATS[role].fav.includes(d.id);
    const power = 8 + 4 * L + B.armory.power[ar] + (fav ? 5 : 0) + (tp.power || 0) + ((tp.powerAt && tp.powerAt[d.id]) || 0);
    const di = DATA.DEST_IDS.indexOf(d.id), base = s.lab.rescueBase[di];
    let rescue = clamp(base + s.lab.clinicRescue * cl + (tp.rescue || 0) + (nk === 'comeback' ? 0.05 : 0), 0, 0.95);
    if (base >= 1 || !s.flags.deathOn) rescue = 1;            // 6.3.3: the Allotments and before the third present person
    const weapon = B.armory.weapon[ar];
    const roleName = DATA.ROLE_STATS[role] ? DATA.ROLE_STATS[role].name.toUpperCase() : role;
    const roleLine = fav ? roleName + ' · +5 at the ' + d.name : role === 'medic' ? roleName + ' · medkit heals ' + Math.round(medkitHeal * 100) + ' %' : roleName;
    const ttl = role === 'sprinter' ? 'speed ' + speed : role === 'brawler' ? 'shove cooldowns ×' + shoveCdMul.toFixed(2)
      : role === 'marksman' ? 'aim assist ' + assist.toFixed(2) + ' · damage ×' + damageMul.toFixed(2)
      : role === 'medic' ? 'medkit ' + Math.round(medkitHeal * 100) + ' % in ' + medkitHealS + ' s' : 'flashlight ' + flashlightR + ' · horde warning +' + r1(0.2 * L) + ' s';
    return { maxHp, startHp, startHpFrac: hpFrac, secondWind, speed, shoveCdMul, assist, flashlightR, hordeWarnS, damageMul, medkitHeal, medkitHealS,
      pillsTemp, power, rescue, restMul: restMulOf(s, p), weapon, favoured: !!fav, shoveMul: role === 'brawler' ? 1 + 0.03 * L : 1,
      accAdd: (tr === 'steady' ? 6 : 0) + (role === 'marksman' ? L : 0), hordeMul: d.dir.hordeMul * (tr === 'loud' ? 1.15 : 1),
      roleLine, ttlLine: 'In Two Thumbs Left: ' + ttl };
  }

  // ------------------------------------------------------------------ prices (5.6, 6.2, 6.6.2)
  const price = {
    skip: (sec, s) => skipPrice(sec, s),
    revive(s, personId) {
      const p = personById(s, personId); if (!p) return null;
      if (p.arrivedHow === 'stranger' && p.revives === 0) return { cans: RULES.strangerCans, sparks: RULES.strangerSparks, n: 0, stranger: true };
      const n = p.revives, esc = Math.pow(2, Math.min(n, s.lab.escalationCap)), m = s.lab.mul.revive;
      const clampC = Math.floor(RULES.reviveCapShare * capOf(s, 'cans') / 10) * 10;
      const cans = Math.min(Math.round((RULES.reviveCansA * p.lv * p.lv + RULES.reviveCansB) * esc * m), clampC);
      return { cans, sparks: Math.round((RULES.reviveSparksA + RULES.reviveSparksB * p.lv) * esc * m), n, stranger: false };
    },
    invite: (s) => RULES.inviteBase + RULES.invitePer * living(s).length,
    kit(destId) { const d = DEST[destId] || DATA.DESTS[0]; return { medkit: DATA.KIT.medkit * d.n, pills: DATA.KIT.pills * d.n, bomb: DATA.KIT.bomb * d.n }; },
  };
  function autoKit(s, destId) {                               // 6.2: medkit, pills, noise bomb while the total fits the cans held
    const pr = price.kit(destId), kit = { medkit: 0, pills: 0, bomb: 0, total: 0 };
    for (const k of DATA.KIT.order) {
      const open = k === 'bomb' ? armoryLv(s) >= 2 : clinicLv(s) >= 1;
      if (open && kit.total + pr[k] <= s.res.cans) { kit[k] = 1; kit.total += pr[k]; }
    }
    return kit;
  }

  // ------------------------------------------------------------------ what a Tower level opens (3.4.1, 3.7)
  function towerOpens(lv) {
    const out = [];
    for (const t of TYPES) {
      if (t === 'tower') continue;
      const cnt = B[t].count; let prev = 0;
      for (const [tw, c] of cnt) { if (tw === lv) for (let k = prev + 1; k <= c; k++) out.push({ kind: 'building', type: t, nth: k, text: ordinal(k) + B[t].name }); prev = c; }
    }
    for (const d of DATA.DESTS) if (d.tower === lv) out.push({ kind: 'dest', id: d.id, text: d.name });
    for (let r = 1; r <= EXP.maxRing; r++) if (EXP.tower[r] === lv) out.push({ kind: 'land', ring: r, text: 'land ' + (8 + 2 * r) + ' × ' + (8 + 2 * r) });
    if (DATA.TOWER.cranes[lv] > DATA.TOWER.cranes[lv - 1]) out.push({ kind: 'crane', text: ordinal(DATA.TOWER.cranes[lv]) + 'crane' });
    if (lv === RULES.crane4Tower) out.push({ kind: 'crane4', text: '4th crane for sale' });
    if (lv === RULES.strangerTower) out.push({ kind: 'stranger', text: 'a stranger at the gate' });
    if (lv === 10) out.push({ kind: 'finale', text: 'the gold bell' });
    return out;
  }

  // ------------------------------------------------------------------ jobs and cranes (5.3)
  function jobName(s, j) { const b = j.target ? byId(s, j.target) : null; return j.kind === 'expand' ? 'land' : b ? B[b.type].name : 'job'; }
  function jobView(s, j) {
    const left = Math.max(0, j.endMs - s.cityMs), dur = Math.max(1, j.endMs - j.startMs), b = j.target ? byId(s, j.target) : null;
    const pr = skipPrice(left / SEC, s), name = jobName(s, j);
    return { id: j.id, kind: j.kind, buildingId: j.target, type: b ? b.type : null, name, toLv: j.toLv, startMs: j.startMs, endMs: j.endMs,
      leftMs: left, progress: clamp(1 - left / dur, 0, 1), price: pr, free: pr === 0, confirm: pr >= DATA.SKIP.confirmAt,
      label: pr ? 'FINISH · ' + pr + ' ✦' : 'FINISH FREE' };
  }
  function soonestJob(s) { let j = null; for (const x of s.jobs) if (!j || x.endMs < j.endMs || (x.endMs === j.endMs && idNum(x.id) < idNum(j.id))) j = x; return j; }
  function startJob(s, kind, target, toLv, durMs, ev) {
    const j = { id: nid(s, 'j'), kind, target, toLv, startMs: s.cityMs, endMs: s.cityMs + Math.max(0, Math.round(durMs)) };
    s.jobs.push(j); s.tel.jobsStarted++;
    ev.push({ type: 'jobStarted', jobId: j.id, kind, buildingId: target, toLv });
    return j;
  }
  function dropRubble(s, ev) {                                // 3.2: the new ring's rubble from the city RNG, one glinting piece
    const lo = landLo(s), hi = landHi(s), tiles = [];
    for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) if ((x === lo || y === lo || x === hi - 1 || y === hi - 1) && !isGate(s, x, y)) tiles.push([x, y]);
    const n = EXP.rubble[s.ring], gl = Math.floor(rand(s) * n), ids = [];
    let glintId = null;
    for (let i = 0; i < n && i < tiles.length; i++) {
      const k = i + Math.floor(rand(s) * (tiles.length - i)); const t = tiles[i]; tiles[i] = tiles[k]; tiles[k] = t;
      const r = { id: nid(s, 'r'), gx: tiles[i][0], gy: tiles[i][1], ring: s.ring, glint: i === gl };
      s.rubble.push(r); ids.push(r.id); if (r.glint) glintId = r.id;
    }
    return { ids, glintId };
  }
  function completeJob(s, j, ev) {
    const i = s.jobs.indexOf(j); if (i >= 0) s.jobs.splice(i, 1);
    const at = j.endMs; s.tel.jobsDone++;
    if (j.kind === 'expand') {
      if (s.ring >= EXP.maxRing) return;
      s.ring++;
      const r = dropRubble(s, ev), side = 8 + 2 * s.ring;
      ev.push({ type: 'jobDone', jobId: j.id, kind: 'expand', buildingId: null, buildingType: null, lv: s.ring, name: 'land' });
      ev.push({ type: 'expanded', ring: s.ring, side, rubble: r.ids, glintId: r.glintId });
      return;
    }
    const b = byId(s, j.target); if (!b) return;
    const from = b.lv;
    if (PRODUCERS[b.type]) rebase(s, b, at);                  // a level change re-bases the bubble (a new producer starts empty)
    b.lv = Math.max(b.lv, Math.min(B[b.type].max, j.toLv));
    ev.push({ type: 'jobDone', jobId: j.id, kind: j.kind, buildingId: b.id, buildingType: b.type, lv: b.lv, name: B[b.type].name });
    if (b.type === 'tower') {
      for (let L = from + 1; L <= b.lv; L++) {
        const sp = earn(s, DATA.TOWER.sparks[L], 'tower'), opens = towerOpens(L);
        s.tel.towerAtMs[L] = at;
        ev.push({ type: 'towerUp', lv: L, opens, sparks: sp, text: 'Bell Tower ' + L + (opens.length ? ' · new: ' + opens.map((o) => o.text).join(', ') : '') });
        if (L === 10) ev.push({ type: 'finale' });
      }
    } else if (b.type === 'inn') {
      if (from === 0) refreshInn(s, ev);                      // the first batch arrives when the level-1 job completes
      else if (s.inn.nextRefreshMs != null) s.inn.nextRefreshMs = Math.min(s.inn.nextRefreshMs, s.cityMs + innPeriod(s, b.lv));
    } else if (b.type === 'house') housePresent(s);
  }
  const innPeriod = (s, lv) => Math.round(B.inn.refresh[lv] * SEC * s.lab.mul.inn);
  function refreshInn(s, ev) {                                // each refresh replaces every traveler (3.4.7)
    const inn = innB(s);
    if (!inn || inn.lv < 1) { s.inn.travelers = []; s.inn.nextRefreshMs = null; return; }
    const n = B.inn.travelers[inn.lv], n2 = B.inn.level2[inn.lv];
    s.inn.travelers = [];
    for (let i = 0; i < n; i++) s.inn.travelers.push(genPerson(s, { lv: i < n2 ? 2 : 1, how: 'traveler' }));
    s.inn.nextRefreshMs = s.cityMs + innPeriod(s, inn.lv);
    ev.push({ type: 'innRefresh', n, travelers: s.inn.travelers.map((p) => p.id) });
  }
  function housePresent(s) { for (const p of s.people) if (p.houseId == null && (p.state === 'ready' || p.state === 'rest' || p.state === 'out')) assignHouse(s, p); }
  function fixBeds(s) {                                       // after a House lost a level (the Lab): the extras sleep on the bench
    let moved = 0;
    for (const h of s.buildings) if (h.type === 'house') {
      const res = s.people.filter((p) => p.state !== 'fallen' && p.houseId === h.id), beds = h.lv >= 1 ? B.house.beds[h.lv] : 0;
      for (const p of res.slice(beds)) { p.houseId = null; moved++; }
    }
    if (moved) housePresent(s);
    return moved;
  }
  function finishJob(s, j, pr, ev) {                          // pr sparks already checked
    if (pr > 0) { spend(s, pr, 'finish'); s.flags.paidSkip = true; }
    j.endMs = s.cityMs;
    ev.push({ type: 'finished', jobId: j.id, price: pr });
    completeJob(s, j, ev);
  }
  // A free crane, or with finishOther the job with the least time left finished at its skip price (3.5).
  function needCrane(s, a, ev) {
    if (cranesFree(s) > 0) return null;
    const j = soonestJob(s); if (!j) return { err: 'noCrane' };
    const pr = skipPrice((j.endMs - s.cityMs) / SEC, s);
    if (!a.finishOther) return { err: 'noCrane', data: { jobId: j.id, price: pr, label: 'Finish the ' + jobName(s, j) + ' now · ' + (pr ? pr + ' ✦' : 'free') } };
    if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
    finishJob(s, j, pr, ev);
    return null;
  }
  function hasWork(s) {                                       // anything left to build, upgrade or expand at this Tower level
    const T = towerLv(s), tw = towerB(s);
    if (T < 10 && tw && !jobFor(s, tw.id)) return true;
    if (s.ring < EXP.maxRing && T >= EXP.tower[s.ring + 1] && !s.jobs.some((j) => j.kind === 'expand')) return true;
    for (const t of TYPES) {
      if (t === 'tower') continue;
      if (ofType(s, t).length < allowedCount(s, t)) return true;
      for (const b of s.buildings) if (b.type === t && b.lv >= 1 && b.lv < B[t].max && b.lv + 1 <= T && !jobFor(s, b.id)) return true;
    }
    return false;
  }
  function candidates(s) {                                    // every job that could start now if paid for
    const c = [], T = towerLv(s), tw = towerB(s);
    if (tw && T < 10 && !jobFor(s, tw.id)) c.push(Object.assign({ kind: 'upgrade', type: 'tower', id: tw.id, toLv: T + 1 }, costOf(s, 'tower', T + 1)));
    if (s.ring < EXP.maxRing && T >= EXP.tower[s.ring + 1] && !s.jobs.some((j) => j.kind === 'expand')) c.push({ kind: 'expand', type: null, id: null, toLv: s.ring + 1, res: 'bricks', n: expandCost(s, s.ring + 1) });
    for (const t of TYPES) {
      if (t === 'tower') continue;
      if (ofType(s, t).length < allowedCount(s, t)) c.push(Object.assign({ kind: 'build', type: t, id: null, toLv: 1 }, costOf(s, t, 1)));
      for (const b of s.buildings) if (b.type === t && b.lv >= 1 && b.lv < B[t].max && b.lv + 1 <= T && !jobFor(s, b.id)) c.push(Object.assign({ kind: 'upgrade', type: t, id: b.id, toLv: b.lv + 1 }, costOf(s, t, b.lv + 1)));
    }
    return c;
  }
  function canDoSomething(s) {                                // the "nothing to do" telemetry (9): nobody can go and nothing affordable
    if (!s.pending && s.people.some((p) => p.state === 'ready' || p.state === 'rest')) return true;
    if (cranesFree(s) < 1) return false;
    return candidates(s).some((c) => c.n <= s.res[c.res]);
  }

  // ------------------------------------------------------------------ the city clock (5.1): event-stepped
  function accrue(s, dt, source) {
    if (!(dt > 0)) return;
    const c = cranesTotal(s), busy = Math.min(c, s.jobs.length), work = hasWork(s);
    if (!(towerLv(s) >= 10 && !work && busy === 0)) {
      s.tel.craneMs += c * dt; s.tel.craneBusyMs += busy * dt;
      const idle = (c - busy) * dt;
      if (idle > 0) { if (!work) s.tel.idleGatedMs += idle; else if (source === 'frame') s.tel.idleOnMs += idle; else s.tel.idleOffMs += idle; }
    }
    if (source === 'frame') { s.tel.onlineMs += dt; if (!canDoSomething(s)) s.tel.nothingMs += dt; }
  }
  function placeWaitingGraves(s, ev) {
    for (const g of s.graves) if (g.gx == null) {
      const st = graveStart(s, g.houseId), spot = spotFrom(s, st.gx, st.gy);
      if (!spot) return;
      g.gx = spot.gx; g.gy = spot.gy; g.placedMs = s.cityMs;
      ev.push({ type: 'gravePlaced', graveId: g.id, personId: g.personId, gx: g.gx, gy: g.gy });
    }
  }
  function checkStranger(s, ev) {                             // 6.6.6: the first moment Tower >= 3 and a bed is free
    if (s.flags.strangerDone || towerLv(s) < RULES.strangerTower || living(s).length >= bedsOf(s)) return;
    const p = genPerson(s, { lv: RULES.strangerLv, how: 'stranger' });
    setDown(s, p); p.fellNight = s.night;
    s.people.push(p); s.flags.strangerDone = true; s.tel.strangerAtMs = s.cityMs;
    ev.push({ type: 'stranger', personId: p.id });
  }
  function checkDrifter(s, ev) {                              // 4.11: nobody present -> a free L1 drifter walks in, ignoring beds
    if (present(s).length > 0) return;
    const p = genPerson(s, { lv: 1, how: 'drifter' });
    s.people.push(p); assignHouse(s, p); s.tel.drifters++;
    ev.push({ type: 'drifter', personId: p.id });
  }
  function checkDeathOn(s, ev) { if (!s.flags.deathOn && present(s).length >= 3) { s.flags.deathOn = true; ev.push({ type: 'deathOn' }); } }
  // Everything due at s.cityMs, then the state-based rules. Idempotent: calling it twice at one time changes nothing.
  function settle(s, ev) {
    for (let guard = 0; guard < 1000; guard++) {
      let j = null;
      for (const x of s.jobs) if (x.endMs <= s.cityMs && (!j || x.endMs < j.endMs || (x.endMs === j.endMs && idNum(x.id) < idNum(j.id)))) j = x;
      if (!j) break;
      completeJob(s, j, ev);
    }
    for (const p of s.people.slice()) {
      if (p.state === 'rest' && p.restUntilMs <= s.cityMs) { p.state = 'ready'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; ev.push({ type: 'rested', personId: p.id, early: false }); }
      else if (p.state === 'down' && p.downUntilMs <= s.cityMs) fall(s, p, 'expired', ev);
    }
    if (s.inn.nextRefreshMs != null && s.inn.nextRefreshMs <= s.cityMs) refreshInn(s, ev);
    placeWaitingGraves(s, ev);
    housePresent(s);
    checkStranger(s, ev);
    checkDrifter(s, ev);
    checkDeathOn(s, ev);
    checkGoals(s, ev);
  }
  function nextDue(s, limit) {
    let next = limit;
    for (const j of s.jobs) if (j.endMs < next) next = j.endMs;
    for (const p of s.people) {
      if (p.state === 'rest' && p.restUntilMs < next) next = p.restUntilMs;
      else if (p.state === 'down' && p.downUntilMs < next) next = p.downUntilMs;
    }
    if (s.inn.nextRefreshMs != null && s.inn.nextRefreshMs < next) next = s.inn.nextRefreshMs;
    for (const b of s.buildings) { const f = fillMs(s, b); if (f != null && f > s.cityMs && f < next) next = f; }
    return Math.max(next, s.cityMs);
  }
  function advance(s, ms, ctx) {
    const source = (ctx && ctx.source) || 'dev', ev = [];
    ms = Math.max(0, Math.round(fin(ms, 0)));
    const target = s.cityMs + ms;
    settle(s, ev);                                            // state-based rules first, at the current time
    for (let guard = 0; guard < 2000000; guard++) {
      const next = nextDue(s, target), t0 = s.cityMs;
      accrue(s, next - t0, source);
      s.cityMs = next;
      for (const b of s.buildings) { const f = fillMs(s, b); if (f != null && f > t0 && f <= next) ev.push({ type: 'bubbleFull', buildingId: b.id, res: PRODUCERS[b.type], at: f }); }
      settle(s, ev);
      if (s.cityMs >= target) break;
    }
    return ev;
  }
  function tick(s, realDeltaMs, realNow) {
    let d;
    if (typeof realNow === 'number' && isFinite(realNow)) {
      realNow = Math.round(realNow);
      const gap = realNow - s.realLast;
      if (gap > RULES.offlineMinS * SEC) { const r = resume(s, realNow); return [{ type: 'offline', ms: r.creditedMs, welcome: r.welcome }].concat(r.events); }
      if (gap < 0) { s.realLast = realNow; return []; }
      d = gap; s.realLast = realNow;
    } else d = Math.max(0, Math.round(fin(realDeltaMs, 0)));
    if (s.pending && s.pending.source === 'sim') return [];   // the clock waits for a simulated run's result
    const ms = Math.round(Math.min(d, RULES.frameClampMs) * s.lab.timeScale);
    return ms > 0 ? advance(s, ms, { source: 'frame' }) : [];
  }
  function resume(s, realNow) {
    realNow = Math.round(fin(realNow, s.realLast));
    const gap = realNow - s.realLast;
    if (gap < 0) { s.realLast = realNow; return { creditedMs: 0, rollback: true, events: [], welcome: null }; }
    s.realLast = realNow;
    if (gap <= RULES.offlineMinS * SEC) return { creditedMs: 0, rollback: false, events: [], welcome: null };
    const credit = Math.min(gap, RULES.offlineCapS * SEC);
    const events = advance(s, credit, { source: 'offline' });
    return { creditedMs: credit, rollback: false, events, welcome: credit >= RULES.welcomeMinS * SEC ? welcome(s, events, credit) : null };
  }
  // 5.5: up to 6 rows, most important first, then "and N more". Nothing is collected or decided for the player.
  function welcome(s, events, ms) {
    const rows = [];
    for (const p of s.people) if (p.state === 'down') {
      const left = fmtHoursLeft(p.downUntilMs - s.cityMs);
      rows.push({ kind: 'down', personId: p.id, action: 'decide', text: (p.arrivedHow === 'stranger' && p.revives === 0 ? 'A stranger lies Down at the gate' : p.first + ' is Down') + ' · ' + left + ' to decide' });
    }
    for (const e of events) if (e.type === 'downExpired') { const p = personById(s, e.personId); rows.push({ kind: 'expired', personId: e.personId, graveId: e.graveId, text: (p ? p.first : 'Someone') + '’s day ran out. ' + e.where }); }
    for (const e of events) {
      if (e.type === 'towerUp') rows.push({ kind: 'job', text: e.text });
      else if (e.type === 'jobDone') {
        if (e.kind === 'expand') rows.push({ kind: 'job', text: 'Land ' + (8 + 2 * e.lv) + ' × ' + (8 + 2 * e.lv) + ' is ready' });
        else if (e.buildingId && byId(s, e.buildingId) && byId(s, e.buildingId).type !== 'tower') rows.push({ kind: 'job', buildingId: e.buildingId, text: e.kind === 'build' ? e.name + ' built' : e.name + ' ' + e.lv + ' finished' });
      }
    }
    let wb = 0, wc = 0;
    for (const b of s.buildings) { const v = bubbleView(s, b); if (v) { if (v.res === 'bricks') wb += v.whole; else wc += v.whole; } }
    if (wb + wc > 0) rows.push({ kind: 'bubbles', text: 'Waiting: ' + [wb ? fmtNum(wb) + ' bricks' : '', wc ? fmtNum(wc) + ' cans' : ''].filter(Boolean).join(' · ') });
    const rested = []; for (const e of events) if (e.type === 'rested') { const p = personById(s, e.personId); if (p && p.state === 'ready' && !rested.includes(p.first)) rested.push(p.first); }
    if (rested.length) rows.push({ kind: 'people', text: joinNames(rested) + (rested.length > 1 ? ' are rested.' : ' is rested.') });
    for (const e of events) if (e.type === 'drifter') { const p = personById(s, e.personId); if (p) rows.push({ kind: 'people', personId: p.id, text: p.first + ' drifted in at the gate.' }); }
    let inn = null; for (const e of events) if (e.type === 'innRefresh') inn = e;
    if (inn) rows.push({ kind: 'inn', text: inn.n + ' new traveler' + (inn.n === 1 ? '' : 's') + ' at the Inn.' });
    return { ms, title: 'WHILE YOU WERE AWAY · ' + fmtDur(ms / SEC), rows: rows.slice(0, 6), more: Math.max(0, rows.length - 6) };
  }

  // ------------------------------------------------------------------ goals (7.2)
  function goalDone(s, key) {
    const [k, a, b] = key.split(':');
    if (k === 'build') return maxLvOf(s, a) >= +b;
    if (k === 'count') return countBuilt(s, a) >= +b;
    if (k === 'tower') return towerLv(s) >= +a;
    if (k === 'win') { const i = DATA.DEST_IDS.indexOf(a); return DATA.DEST_IDS.some((id, j) => j >= i && s.dest[id].cleared); }   // C1: there or harder
    if (k === 'people') return living(s).length >= +a;
    if (k === 'expand') return s.ring >= +a;
    if (k === 'skip') return !!s.flags.paidSkip;
    return false;
  }
  function checkGoals(s, ev) {
    while (s.goal < GOALS.length && goalDone(s, GOALS[s.goal][0])) {
      const [key, rw, text] = GOALS[s.goal], paid = {};
      for (const k of Object.keys(rw)) paid[k] = k === 'sparks' ? earn(s, rw[k], 'goals') : gain(s, k, rw[k], 'goal');
      s.goal++;
      ev.push({ type: 'goal', step: s.goal, key, text, reward: paid });
    }
  }
  function bestOpenDest(s) { let d = DATA.DESTS[0]; for (const x of DATA.DESTS) if (destOpen(s, x)) d = x; return d; }
  function depotTarget(s) {                                   // C2: storage is never an invisible wall
    if (ofType(s, 'depot').length < allowedCount(s, 'depot')) return { kind: 'build', type: 'depot' };
    const T = towerLv(s), d = ofType(s, 'depot').filter((b) => b.lv >= 1 && b.lv < B.depot.max && b.lv + 1 <= T).sort((a, b) => a.lv - b.lv)[0];
    if (d) return { kind: 'building', id: d.id };
    const busy = ofType(s, 'depot').find((b) => jobFor(s, b.id));
    return busy ? { kind: 'building', id: busy.id } : allowedCount(s, 'depot') ? { kind: 'building', id: towerB(s).id } : { kind: 'build', type: 'depot' };
  }
  // The ETA of a cost: "ready now", "in 4:12" (production covers it), "≈ 2 runs", "needs a bigger Depot".
  function costEta(s, res, cost, target) {
    const held = s.res[res], progress = cost > 0 ? clamp(held / cost, 0, 1) : 1;
    if (cost > capOf(s, res)) return { eta: 'needs a bigger Depot', mins: Infinity, progress, target: depotTarget(s) };
    if (held >= cost) {
      if (cranesFree(s) > 0) return { eta: 'ready now', mins: 0, progress, target };
      const j = soonestJob(s), left = (j.endMs - s.cityMs) / SEC;
      return { eta: 'in ' + fmtClock(left), mins: left / 60, progress, target };
    }
    const short = cost - held;
    let bub = 0, fullest = null;
    for (const b of s.buildings) if (PRODUCERS[b.type] === res && b.lv >= 1) { const a = Math.floor(bubbleAt(s, b)); bub += a; if (!fullest || a > fullest.a) fullest = { a, id: b.id }; }
    if (bub >= short) return { eta: 'ready now', mins: 0, progress, target: { kind: 'collect', id: fullest.id } };
    const rate = rateOf(s, res) / HOUR, tProd = rate > 0 ? (short - bub) / rate : Infinity;
    const d = bestOpenDest(s), per = (res === 'bricks' ? d.bricks : d.cans) * lootMul(s), runs = Math.ceil((short - bub) / Math.max(1, per));
    if (tProd <= 30 * MIN) return { eta: 'in ' + fmtClock(tProd / SEC), mins: tProd / MIN, progress, target };
    if (runs <= 3) return { eta: '≈ ' + runs + (runs === 1 ? ' run' : ' runs'), mins: 0, progress, target };
    if (!isFinite(tProd)) return { eta: res === 'bricks' ? 'needs a Kiln' : 'needs a Cannery', mins: Infinity, progress, target: { kind: 'build', type: res === 'bricks' ? 'kiln' : 'cannery' } };
    return { eta: 'in ' + fmtClock(tProd / SEC), mins: tProd / MIN, progress, target };
  }
  const jobEta = (s, j, target) => ({ eta: 'in ' + fmtClock((j.endMs - s.cityMs) / SEC), mins: (j.endMs - s.cityMs) / MIN, progress: jobView(s, j).progress, target: target || { kind: 'job', id: j.id } });
  const needTower = (s, n, target) => ({ eta: 'needs Tower ' + n, mins: Infinity, progress: 0, target: target || { kind: 'building', id: towerB(s).id } });
  function sideTask(s, res) {
    const fc = cranesFree(s) > 0, up = fc ? candidates(s).filter((c) => c.kind === 'upgrade' && c.type !== 'tower' && c.n <= s.res[c.res]).sort((a, b) => a.n - b.n || idNum(a.id) - idNum(b.id))[0] : null;
    if (up) return { text: 'Meanwhile: upgrade ' + (B[up.type].name === 'Inn' ? 'the Inn' : 'a ' + B[up.type].name), target: { kind: 'building', id: up.id } };
    const d = bestOpenDest(s), loot = Math.round((res === 'cans' ? d.cans : d.bricks) * lootMul(s));
    return { text: 'Meanwhile: a run at the ' + d.name + ' · ~' + fmtNum(loot) + ' ' + (res === 'cans' ? 'cans' : 'bricks'), target: { kind: 'dest', destId: d.id } };
  }
  function goal(s) {
    if (s.goal >= GOALS.length) {
      const fc = cranesFree(s) > 0, up = fc ? candidates(s).filter((c) => c.kind === 'upgrade' && c.n <= s.res[c.res]).sort((a, b) => a.n - b.n)[0] : null;
      const noNick = living(s).find((p) => !p.nick);
      const side = up ? { text: 'Max a building: upgrade ' + (up.type === 'inn' ? 'the Inn' : 'a ' + B[up.type].name), target: { kind: 'building', id: up.id } }
        : noNick ? { text: 'A nickname for everyone: ' + noNick.first + ' has none yet', target: { kind: 'person', id: noNick.id } }
        : { text: 'A run at the Ferry Terminal', target: { kind: 'dest', destId: 'D6' } };
      return { step: GOALS.length + 1, key: 'done', text: 'Bellhaven is whole.', reward: {}, eta: side.text, progress: 1, side, target: side.target, done: true };
    }
    const [key, reward, text] = GOALS[s.goal], [k, a, b] = key.split(':'), T = towerLv(s);
    let r, res = 'bricks';
    if (k === 'build' || k === 'count') {
      res = B[a].cur;
      const all = ofType(s, a), built = all.filter((x) => x.lv >= 1);
      const buildJob = s.jobs.find((j) => j.kind === 'build' && all.some((x) => x.id === j.target));
      if (k === 'count' || !built.length) {               // a new one is needed (or under way)
        if (buildJob) r = jobEta(s, buildJob, { kind: 'building', id: buildJob.target });
        else if (all.length < allowedCount(s, a)) { const c = costOf(s, a, 1); r = costEta(s, c.res, c.n, { kind: 'build', type: a }); }
        else r = needTower(s, countTower(a, all.length) || T + 1);
      } else {                                            // the highest one goes up a level
        const top = built.slice().sort((x, y) => y.lv - x.lv || idNum(x.id) - idNum(y.id))[0], j = jobFor(s, top.id);
        if (j) r = jobEta(s, j, { kind: 'building', id: top.id });
        else if (top.lv + 1 > T) r = needTower(s, top.lv + 1);
        else { const c = costOf(s, a, top.lv + 1); r = costEta(s, c.res, c.n, { kind: 'building', id: top.id }); }
      }
    } else if (k === 'tower') {
      const tw = towerB(s), j = jobFor(s, tw.id);
      r = j ? jobEta(s, j, { kind: 'building', id: tw.id }) : costEta(s, 'bricks', costOf(s, 'tower', T + 1).n, { kind: 'building', id: tw.id });
    } else if (k === 'expand') {
      const j = s.jobs.find((x) => x.kind === 'expand');
      r = j ? jobEta(s, j, { kind: 'expand' }) : s.ring >= EXP.maxRing ? { eta: 'ready now', mins: 0, progress: 1, target: { kind: 'expand' } }
        : T < EXP.tower[s.ring + 1] ? needTower(s, EXP.tower[s.ring + 1]) : costEta(s, 'bricks', expandCost(s, s.ring + 1), { kind: 'expand' });
    } else if (k === 'win') {
      const d = DEST[a], lock = destLock(s, d);
      if (lock) r = lock.startsWith('Tower') ? needTower(s, d.tower, { kind: 'dest', destId: d.id }) : { eta: 'needs the Clinic', mins: Infinity, progress: 0, target: clinicLv(s) ? { kind: 'dest', destId: d.id } : { kind: 'build', type: 'clinic' } };
      else { const hint = oddsHint(s, d.id); r = { eta: '1 run' + (hint ? ' · HOME ' + fmtPct(hint.home) : ''), mins: 0, progress: 0, target: { kind: 'dest', destId: d.id } }; }
    } else if (k === 'people') {
      res = 'cans';
      const inn = innB(s), L = living(s).length, n = +a;
      if (!inn) r = allowedCount(s, 'inn') ? Object.assign(costEta(s, 'cans', costOf(s, 'inn', 1).n, { kind: 'build', type: 'inn' }), { eta: 'needs the Inn' }) : needTower(s, countTower('inn', 0));
      else if (inn.lv < 1) { const j = jobFor(s, inn.id); r = j ? jobEta(s, j, { kind: 'building', id: inn.id }) : { eta: 'needs the Inn', mins: Infinity, progress: 0, target: { kind: 'building', id: inn.id } }; }
      else if (L >= bedsOf(s)) {
        const h = ofType(s, 'house').find((x) => x.lv >= 1 && x.lv < B.house.max && x.lv + 1 <= T && !jobFor(s, x.id));
        r = { eta: 'needs a free bed', mins: Infinity, progress: L / n, target: ofType(s, 'house').length < allowedCount(s, 'house') ? { kind: 'build', type: 'house' } : h ? { kind: 'building', id: h.id } : { kind: 'building', id: inn.id } };
      } else if (!s.inn.travelers.length) r = { eta: 'in ' + fmtClock((s.inn.nextRefreshMs - s.cityMs) / SEC), mins: (s.inn.nextRefreshMs - s.cityMs) / MIN, progress: L / n, target: { kind: 'building', id: inn.id } };
      else { r = costEta(s, 'cans', price.invite(s), { kind: 'building', id: inn.id }); r.progress = L / n; }
    } else if (k === 'skip') {
      const j = s.jobs.find((x) => x.endMs - s.cityMs > s.lab.freeSec * SEC), p = s.people.find((x) => x.state === 'rest' && x.restUntilMs - s.cityMs > s.lab.freeSec * SEC);
      const inn = innB(s), innT = inn && inn.lv >= 1 && s.inn.nextRefreshMs != null && s.inn.nextRefreshMs - s.cityMs > s.lab.freeSec * SEC;
      r = j ? { eta: 'ready now', mins: 0, progress: 0, target: { kind: 'job', id: j.id } } : p ? { eta: 'ready now', mins: 0, progress: 0, target: { kind: 'person', id: p.id } }
        : innT ? { eta: 'ready now', mins: 0, progress: 0, target: { kind: 'building', id: inn.id } } : { eta: 'start a job longer than a minute', mins: Infinity, progress: 0, target: null };
    } else r = { eta: '', mins: 0, progress: 0, target: null };
    const side = r.mins > 30 && k !== 'skip' ? sideTask(s, res) : null;
    return { step: s.goal + 1, key, text, reward, eta: r.eta, progress: clamp(fin(r.progress, 0), 0, 1), side, target: r.target, done: false };
  }

  // ------------------------------------------------------------------ actions
  function placeDecor(s, a, ev) {
    const D = DATA.DECOR[a.kind];
    if (towerLv(s) < D.tower) return { err: 'locked', data: { needTower: D.tower } };
    const cp = canPlace(s, 'decor', a.gx, a.gy); if (!cp.ok) return { err: 'blocked', data: { reason: cp.reason } };
    const n = Math.round(D.cost * s.lab.mul.cost); if (s.res.bricks < n) return { err: 'cost', data: { res: 'bricks', need: n - s.res.bricks } };
    s.res.bricks -= n;
    const d = { id: nid(s, 'd'), type: a.kind, gx: a.gx, gy: a.gy }; s.decor.push(d);
    ev.push({ type: 'placed', decorId: d.id, buildingType: a.kind });
    return { data: { decorId: d.id } };
  }
  const ACTIONS = {
    collect(s, a, ev) {
      const b = byId(s, a.id); if (!b || !PRODUCERS[b.type]) return { err: 'notFound' };
      if (b.lv < 1) return { err: 'state' };
      const res = PRODUCERS[b.type], amt = bubbleAt(s, b), room = Math.max(0, capOf(s, res) - s.res[res]);
      const take = Math.floor(Math.min(amt, room));
      if (take > 0) { s.res[res] += take; rebase(s, b, s.cityMs, amt - take); if (res === 'bricks') s.tel.bricksProd += take; else s.tel.cansProd += take; }
      const overflow = Math.max(0, Math.floor(amt) - take);
      ev.push({ type: 'collected', buildingId: b.id, res, n: take, overflow: take < Math.floor(amt) ? overflow : 0 });
      return { data: { n: take, overflow } };
    },
    place(s, a, ev) {
      if (DATA.DECOR[a.kind]) return placeDecor(s, a, ev);
      const t = a.kind; if (!B[t] || t === 'tower') return { err: 'notFound' };
      const have = ofType(s, t).length;
      if (have >= allowedCount(s, t)) return have >= maxCount(t) ? { err: 'max' } : { err: 'locked', data: { needTower: countTower(t, have) } };
      const cp = canPlace(s, t, a.gx, a.gy); if (!cp.ok) return { err: 'blocked', data: { reason: cp.reason } };
      const c = costOf(s, t, 1); if (s.res[c.res] < c.n) return { err: 'cost', data: { res: c.res, need: c.n - s.res[c.res] } };
      const cr = needCrane(s, a, ev); if (cr) return cr;
      s.res[c.res] -= c.n;
      const b = { id: nid(s, 'b'), type: t, lv: 0, gx: a.gx, gy: a.gy };
      if (t === 'house') b.houseIdx = ofType(s, 'house').length;
      if (PRODUCERS[t]) { b.bubbleBase = 0; b.bubbleSinceMs = s.cityMs; }
      s.buildings.push(b);
      const j = startJob(s, 'build', b.id, 1, jobMs(s, t, 1), ev);
      ev.push({ type: 'placed', buildingId: b.id, buildingType: t, jobId: j.id });
      return { data: { buildingId: b.id, jobId: j.id } };
    },
    upgrade(s, a, ev) {
      const b = byId(s, a.id); if (!b) return { err: 'notFound' };
      if (b.lv < 1 || jobFor(s, b.id)) return { err: 'busy' };
      if (b.lv >= B[b.type].max) return { err: 'max' };
      if (b.type !== 'tower' && b.lv + 1 > towerLv(s)) return { err: 'locked', data: { needTower: b.lv + 1 } };
      const c = costOf(s, b.type, b.lv + 1); if (s.res[c.res] < c.n) return { err: 'cost', data: { res: c.res, need: c.n - s.res[c.res] } };
      const cr = needCrane(s, a, ev); if (cr) return cr;
      if (jobFor(s, b.id)) return { err: 'busy' };
      s.res[c.res] -= c.n;
      const j = startJob(s, 'upgrade', b.id, b.lv + 1, jobMs(s, b.type, b.lv + 1), ev);
      return { data: { jobId: j.id } };
    },
    expand(s, a, ev) {
      if (s.ring >= EXP.maxRing) return { err: 'max' };
      const r = s.ring + 1;
      if (towerLv(s) < EXP.tower[r]) return { err: 'locked', data: { needTower: EXP.tower[r] } };
      if (s.jobs.some((j) => j.kind === 'expand')) return { err: 'busy' };
      const n = expandCost(s, r); if (s.res.bricks < n) return { err: 'cost', data: { res: 'bricks', need: n - s.res.bricks } };
      const cr = needCrane(s, a, ev); if (cr) return cr;
      if (s.ring + 1 !== r) return { err: 'state' };
      s.res.bricks -= n;
      const j = startJob(s, 'expand', null, r, expandMs(s, r), ev);
      return { data: { jobId: j.id } };
    },
    clearRubble(s, a, ev) {
      const r = s.rubble.find((x) => x.id === a.id); if (!r) return { err: 'notFound' };
      const n = clearCost(s, r.ring); if (s.res.bricks < n) return { err: 'cost', data: { res: 'bricks', need: n - s.res.bricks } };
      s.res.bricks -= n; s.rubble.splice(s.rubble.indexOf(r), 1);
      const sp = r.glint ? earn(s, EXP.glint, 'rubble') : 0;
      ev.push({ type: 'rubbleCleared', rubbleId: r.id, sparks: sp, gx: r.gx, gy: r.gy });
      return { data: { sparks: sp } };
    },
    move(s, a, ev) {
      const t = isObj(a.target) ? a.target : {};
      const list = t.kind === 'building' ? s.buildings : t.kind === 'grave' ? s.graves : t.kind === 'decor' ? s.decor : null;
      if (!list) return { err: 'notFound' };
      const o = list.find((x) => x.id === t.id); if (!o) return { err: 'notFound' };
      const cp = canPlace(s, t.kind === 'building' ? o.type : t.kind, a.gx, a.gy, o.id); if (!cp.ok) return { err: 'blocked', data: { reason: cp.reason } };
      const was = o.gx == null;
      o.gx = a.gx; o.gy = a.gy;
      if (t.kind === 'grave' && was) o.placedMs = s.cityMs;
      ev.push({ type: 'moved', kind: t.kind, id: o.id, gx: o.gx, gy: o.gy });
      return { data: { gx: o.gx, gy: o.gy } };
    },
    finish(s, a, ev) {
      const j = s.jobs.find((x) => x.id === a.jobId); if (!j) return { err: 'notFound' };
      const pr = skipPrice((j.endMs - s.cityMs) / SEC, s);
      if (pr >= DATA.SKIP.confirmAt && !a.confirm) return { err: 'confirm', data: { price: pr } };
      if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
      finishJob(s, j, pr, ev);
      return { data: { price: pr } };
    },
    restNow(s, a, ev) {
      const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
      if (p.state !== 'rest') return { err: 'state' };
      const pr = skipPrice((p.restUntilMs - s.cityMs) / SEC, s);
      if (pr >= DATA.SKIP.confirmAt && !a.confirm) return { err: 'confirm', data: { price: pr } };
      if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
      if (pr > 0) { spend(s, pr, 'restNow'); s.flags.paidSkip = true; }
      p.state = 'ready'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0;
      ev.push({ type: 'rested', personId: p.id, early: true, price: pr });
      return { data: { price: pr } };
    },
    innNow(s, a, ev) {
      const inn = innB(s); if (!inn) return { err: 'notFound' };
      if (inn.lv < 1 || s.inn.nextRefreshMs == null) return { err: 'state' };
      const pr = skipPrice((s.inn.nextRefreshMs - s.cityMs) / SEC, s);
      if (pr >= DATA.SKIP.confirmAt && !a.confirm) return { err: 'confirm', data: { price: pr } };
      if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
      if (pr > 0) { spend(s, pr, 'innNow'); s.flags.paidSkip = true; }
      refreshInn(s, ev);
      return { data: { price: pr } };
    },
    buyCrane(s, a, ev) {
      if (s.crane4) return { err: 'max' };
      if (towerLv(s) < RULES.crane4Tower) return { err: 'locked', data: { needTower: RULES.crane4Tower } };
      if (s.res.sparks < RULES.crane4) return { err: 'cost', data: { res: 'sparks', need: RULES.crane4 - s.res.sparks } };
      spend(s, RULES.crane4, 'crane'); s.crane4 = true;
      ev.push({ type: 'craneBought' });
      return {};
    },
    claimPack(s, a, ev) {                                     // 8.12: a free, clearly labelled prototype test pack (dev-tagged)
      if (!PACKS.includes(a.size)) return { err: 'notFound' };
      earn(s, a.size, 'pack'); s.tel.packs++;
      ev.push({ type: 'packClaimed', size: a.size });
      return {};
    },
    flag(s, a) { if (!UI_FLAGS.includes(a.name)) return { err: 'notFound' }; s.flags[a.name] = a.value !== false; return {}; },
    setLastDest(s, a) { if (!DEST[a.destId]) return { err: 'notFound' }; s.lastDest = a.destId; return {}; },
    dev(s, a, ev) { return devOp(s, a, ev); },
    // ---------------------------------------------------------------- STAGE 3 (people and runs): not built yet
    invite: stage3('invite'), startRun: stage3('startRun'), resolveRun: stage3('resolveRun'), revive: stage3('revive'), goodbye: stage3('goodbye'),
  };
  function stage3(name) { return function () { return { err: 'state', data: { todo: name + ' is part of the people-and-runs stage' } }; }; }

  function act(s, a, realNow) {
    if (typeof realNow === 'number' && isFinite(realNow)) s.realLast = Math.round(realNow);
    const ev = [];
    if (!isObj(a) || typeof a.type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, a.type)) return { ok: false, err: 'notFound', events: ev };
    const r = ACTIONS[a.type](s, a, ev, realNow) || {};
    if (r.err) return { ok: false, err: r.err, events: ev, data: r.data };
    settle(s, ev);
    return { ok: true, events: ev, data: r.data };
  }

  // ------------------------------------------------------------------ the Lab (9): every control that changes state
  function labRange(key) { return DATA.LAB_RANGE[key]; }
  function devOp(s, a, ev) {
    const L = s.lab, op = a.op, v = a.value;
    const pick = (list) => (list.includes(v) ? v : null);
    ev.push({ type: 'dev', op });
    switch (op) {
      case 'timeScale': { const x = pick(labRange('timeScale')); if (x == null) return { err: 'notFound' }; L.timeScale = x; return {}; }
      case 'skipAhead': {
        const ms = Math.round(clamp(fin(a.ms, 0), 0, RULES.offlineCapS * SEC));
        const e2 = advance(s, ms, { source: 'dev' }); for (const e of e2) ev.push(e);
        return { data: { welcome: welcome(s, e2, ms) } };
      }
      case 'runsAdvanceClock': L.runsAdvanceClock = v !== false; return {};
      case 'runWarp': L.runWarp = v == null || v === false ? 0 : clampInt(v, 0, 20, 6); return {};
      case 'grant': {
        const what = a.what;
        if (what === 'sparks') { earn(s, Math.round(fin(a.n, 100)), 'lab'); return {}; }
        if (what !== 'bricks' && what !== 'cans') return { err: 'notFound' };
        return { data: { n: gain(s, what, fin(a.n, 1000), 'dev') } };
      }
      case 'fillBubbles': for (const b of s.buildings) if (PRODUCERS[b.type] && b.lv >= 1) rebase(s, b, s.cityMs, holdLv(s, b.type, b.lv)); return {};
      case 'finishAll': {
        for (const j of s.jobs.slice().sort((x, y) => x.endMs - y.endMs || idNum(x.id) - idNum(y.id))) { j.endMs = s.cityMs; completeJob(s, j, ev); }
        for (const p of s.people) if (p.state === 'rest') { p.state = 'ready'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; ev.push({ type: 'rested', personId: p.id, early: true }); }
        if (innB(s) && innB(s).lv >= 1) refreshInn(s, ev);
        return {};
      }
      case 'setTower': {
        const lv = clampInt(a.lv, 1, 10, 1), tw = towerB(s);
        for (const j of s.jobs.slice()) {
          const b = j.target ? byId(s, j.target) : null;
          if ((b && b.type === 'tower') || (b && j.toLv > lv) || (j.kind === 'expand' && EXP.tower[j.toLv] > lv)) s.jobs.splice(s.jobs.indexOf(j), 1);
        }
        const from = tw.lv; tw.lv = lv;
        for (const b of s.buildings) if (b.type !== 'tower' && b.lv > lv) { if (PRODUCERS[b.type]) rebase(s, b, s.cityMs); b.lv = lv; }
        fixBeds(s);
        for (let k = from + 1; k <= lv; k++) { if (s.tel.towerAtMs[k] == null) s.tel.towerAtMs[k] = s.cityMs; ev.push({ type: 'towerUp', lv: k, opens: towerOpens(k), sparks: 0, text: 'Bell Tower ' + k }); }
        if (lv === 10 && from < 10) ev.push({ type: 'finale' });
        return {};
      }
      case 'clearRubble': s.rubble = []; return {};
      case 'force': { const x = pick(labRange('force')); if (x == null) return { err: 'notFound' }; L.force = x; return {}; }
      case 'runScreenS': { const x = pick(labRange('runScreenS')); if (x == null) return { err: 'notFound' }; L.runScreenS = x; return {}; }
      case 'lockSeed': L.lockSeed = v == null || v === false ? null : uint(v, null); return {};
      case 'forcedWins': s.forcedWins = clampInt(v, 0, 2, 0); return {};
      case 'waitReal': L.waitReal = !!v; return {};
      case 'mul': {
        const rg = DATA.LAB_RANGE.mul[a.key]; if (!rg) return { err: 'notFound' };
        const x = clamp(fin(v, 1), rg[0], rg[1]);
        if (a.key === 'prod') for (const b of s.buildings) if (PRODUCERS[b.type] && b.lv >= 1) rebase(s, b, s.cityMs);   // 5.2
        L.mul[a.key] = x;
        return { data: { dataRule: a.key === 'cost' ? DATA.assertData(x) : [] } };
      }
      case 'rescueBase': { const i = DATA.DEST_IDS.indexOf(a.destId); if (i < 1) return { err: 'notFound' }; L.rescueBase[i] = clamp(fin(v, L.rescueBase[i]), 0, 1); return {}; }
      case 'set': {
        const k = a.key, rg = DATA.LAB_RANGE[k];
        if (k === 'reducedMotion') { L.reducedMotion = v === true ? true : v === false ? false : null; return {}; }
        if (!rg || !['clinicRescue', 'tiredFloor', 'escalationCap', 'downWindowMs', 'freeSec', 'skipExp', 'skipK'].includes(k)) return { err: 'notFound' };
        let x = clamp(fin(v, L[k]), rg[0], rg[1]); if (k === 'escalationCap' || k === 'downWindowMs' || k === 'freeSec') x = Math.round(x);
        L[k] = x; return {};
      }
      case 'resetLab': { const keep = { timeScale: L.timeScale }; s.lab = clone(DATA.LAB_DEFAULT); s.lab.timeScale = keep.timeScale; for (const b of s.buildings) if (PRODUCERS[b.type] && b.lv >= 1) rebase(s, b, s.cityMs); return {}; }
      case 'addPerson': {
        const p = genPerson(s, { seed: a.seed != null ? uint(a.seed, 0) : null, lv: clampInt(a.lv, 1, 10, 1), how: 'lab' });
        s.people.push(p); assignHouse(s, p);
        return { data: { personId: p.id } };
      }
      case 'kill': {
        const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
        if (p.state === 'fallen' || p.state === 'down') return { err: 'state' };
        if (p.state === 'out') return { err: 'pending' };
        setDown(s, p); if (p.fellNight == null) p.fellNight = s.night;
        return { data: { personId: p.id } };
      }
      case 'reviveAll': for (const p of s.people) if (p.state === 'down') { p.state = 'ready'; p.downUntilMs = 0; if (p.houseId == null) assignHouse(s, p); } return {};
      case 'setLevel': {
        const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
        const lv = clampInt(a.lv, 1, 10, p.lv); p.lv = lv; p.xp = XP_AT[lv]; return {};
      }
      case 'giveXp': { const p = personById(s, a.personId); if (!p) return { err: 'notFound' }; addXp(s, p, fin(a.xp, 0) * s.lab.mul.xp, ev); return {}; }
      case 'reroll': case 'reset': {
        const seed = a.seed != null ? uint(a.seed, 1) : (Math.floor(rand(s) * 4294967296) >>> 0);
        const t = create({ realNow: s.realLast, tzOffsetMin: s.tzOffsetMin, seed });
        const keepLab = op === 'reroll' ? clone(s.lab) : null, sound = s.ui.sound;
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, t);
        if (keepLab) s.lab = keepLab;
        s.ui.sound = sound;
        return { data: { seed } };
      }
      case 'replayOnboarding': s.flags.metPeople = false; return {};
      default: return { err: 'notFound' };
    }
  }

  // ------------------------------------------------------------------ the run-warp cap (5.1): helpers for STAGE 3
  // At GO: pending.warpS = warp x real seconds since the previous simulated GO (null = no cap), then the GO is stamped.
  function warpAtGo(s, realNow) {
    const w = s.lab.runWarp, prev = s.lastSimGoRealMs;
    const warpS = prev == null || !w ? null : w * Math.max(0, realNow - prev) / SEC;
    s.lastSimGoRealMs = Math.round(realNow);
    return warpS;
  }
  // At resolution: how far the city clock moves for this result (ms). Real-game and pasted results add nothing.
  function runClockMs(s, pending, res) {
    if (!pending || pending.source !== 'sim' || (res && res.source && res.source !== 'sim') || !s.lab.runsAdvanceClock) return 0;
    const t = Math.max(0, fin(res && res.time, 0));
    return Math.round(SEC * (pending.warpS == null ? t : Math.min(t, pending.warpS)));
  }

  // ------------------------------------------------------------------ STAGE 3 stubs (people and runs; see SPEC 6, 11.3)
  // odds(state, destId, personId, kit?) -> { home, death, rescue, power, margin, startHp, maxHp, falls, refs, hint }; cached
  //   by oddsKey (an LRU of 300, SPEC 6.3.5). Until it exists, view.play and goal ETAs carry no odds (null).
  function odds() { return null; }
  function oddsKey(s, destId, personId, kit) { return [destId, personId, kit ? [kit.medkit, kit.pills, kit.bomb].join('') : 'auto'].join('|'); }
  function kitDeltas() { return null; }
  function restedOdds() { return null; }
  function oddsHint(s, destId) { const sg = suggest(s, destId); return sg && sg.home != null ? sg : null; }
  // strip(state, destId) -> runners who can go (Ready, Resting, Hurt, Recovering), best Home % first. Placeholder order
  // until odds exist: favoured role, then Ready before resting, lower level, lower index (6.2's tie rules).
  function strip(s, destId) {
    const d = DEST[destId] || DEST[s.lastDest];
    return s.people.filter((p) => p.state === 'ready' || p.state === 'rest').map((p) => ({ p, fav: DATA.ROLE_STATS[p.role].fav.includes(d.id) }))
      .sort((x, y) => (y.fav - x.fav) || ((x.p.state === 'ready' ? 0 : 1) - (y.p.state === 'ready' ? 0 : 1)) || x.p.lv - y.p.lv || x.p.index - y.p.index)
      .map(({ p }) => ({ personId: p.id, home: null, death: null, state: p.state === 'rest' ? p.restKind : 'ready', restLeftMs: p.state === 'rest' ? Math.max(0, p.restUntilMs - s.cityMs) : 0 }));
  }
  // suggest(state) -> PLAY's suggestion for the last destination used: { personId, destId, home, death, tired }.
  function suggest(s, destId) {
    const id = destId || s.lastDest, st = strip(s, id)[0];
    return st ? { personId: st.personId, destId: id, home: st.home, death: st.death, tired: st.state !== 'ready' } : null;
  }
  function buildHandoff() { return null; }                     // 6.8
  function runSim() { return null; }                           // 6.9 for state.pending (Run.simulate + Run.toResult)
  function validateResult(res) { return { ok: false, res, errors: ['not built yet'], notes: [] }; }   // 6.9 table
  function reward() { return null; }                           // 6.5 breakdown, no mutation

  // ------------------------------------------------------------------ view (read-only, derived)
  const ROSTER = { down: 0, ready: 1, tired: 2, hurt: 3, recovering: 4, out: 5 };
  function kinLine(s, p) { const k = p.kin ? personById(s, p.kin) : null; return k ? 'Says ' + k.first + ' ' + k.last + ' was family.' : null; }
  function personView(s, p, suggestedId) {
    const restLeft = p.state === 'rest' ? Math.max(0, p.restUntilMs - s.cityMs) : 0, downLeft = p.state === 'down' ? Math.max(0, p.downUntilMs - s.cityMs) : 0;
    const clinic = clinicLv(s) >= 1, stranger = p.arrivedHow === 'stranger' && p.revives === 0 && p.houseId == null;
    const where = p.state === 'ready' ? 'walk' : p.state === 'out' ? 'out' : p.state === 'fallen' ? 'grave'
      : p.state === 'down' ? (stranger ? 'gate' : clinic ? 'clinic' : 'house')
      : p.restKind === 'recovering' && clinic ? 'clinic' : p.houseId ? 'house' : 'bench';
    const pill = p.state === 'ready' ? 'Rested' : p.state === 'out' ? 'Out' : p.state === 'fallen' ? 'Fallen'
      : p.state === 'down' ? 'Down · ' + Math.floor(downLeft / HOUR) + ' h'
      : (p.restKind === 'hurt' ? 'Hurt ' : p.restKind === 'recovering' ? 'Recovering ' : 'Tired ') + fmtClock(restLeft / SEC);
    const nk = p.nick && DATA.NICKNAMES[p.nick] ? DATA.NICKNAMES[p.nick].name : null, tr = DATA.TRAITS[p.trait] || {};
    const g = p.state === 'fallen' ? s.graves.find((x) => x.personId === p.id) : null;
    return { id: p.id, index: p.index, first: p.first, last: p.last, name: p.first + ' ' + p.last, fullName: nk ? p.first + ' “' + nk + '” ' + p.last : p.first + ' ' + p.last,
      nick: p.nick, nickName: nk, age: p.age, role: p.role, roleName: DATA.ROLE_STATS[p.role] ? DATA.ROLE_STATS[p.role].name : p.role, trade: p.trade,
      card: Names.cardLine(p), trait: p.trait, traitName: tr.name || p.trait, traitLine: tr.line || '', habit: p.habit, look: p.look,
      lv: p.lv, xp: p.xp, xpFrom: XP_AT[p.lv], xpTo: p.lv < 10 ? XP_AT[p.lv + 1] : XP_AT[10], state: p.state, restKind: p.restKind,
      restLeftMs: restLeft, restTotalMs: p.state === 'rest' ? Math.max(0, p.restUntilMs - p.restFromMs) : 0, startHpFrac: startHpFrac(s, p),
      downLeftMs: downLeft, houseId: p.houseId, house: houseName(s, p.houseId), where, pill, stranger, runs: p.runs, wins: p.wins,
      kills: p.kills, bestKills: p.bestKills, revives: p.revives, history: p.history, epitaph: p.epitaph, suggested: p.id === suggestedId,
      graveId: g ? g.id : null, arrivedNight: p.arrivedNight, arrivedHow: p.arrivedHow, fellNight: p.fellNight, fellDest: p.fellDest, fellOdds: p.fellOdds,
      kin: p.kin, kinLine: kinLine(s, p) };
  }
  function nextUp(s, b) {
    const T = towerLv(s);
    if (b.lv >= B[b.type].max) return null;
    const lv = b.lv + 1, c = costOf(s, b.type, lv), j = jobFor(s, b.id);
    const needT = b.type !== 'tower' && lv > T ? lv : null;
    const err = b.lv < 1 || j ? 'busy' : needT ? 'locked' : s.res[c.res] < c.n ? 'cost' : cranesFree(s) < 1 ? 'noCrane' : null;
    return { lv, cost: c, timeS: jobMs(s, b.type, lv) / SEC, ok: !err, err, needTower: needT, need: err === 'cost' ? c.n - s.res[c.res] : 0 };
  }
  function view(s) {
    const grid = occGrid(s), T = towerLv(s), tw = towerB(s), sug = suggest(s), sugId = sug ? sug.personId : null;
    const jobs = s.jobs.slice().sort((a, b) => a.endMs - b.endMs || idNum(a.id) - idNum(b.id)).map((j) => jobView(s, j));
    const jobOf = {}; for (const j of jobs) if (j.buildingId) jobOf[j.buildingId] = j;
    const buildings = s.buildings.map((b) => {
      const o = { id: b.id, type: b.type, name: B[b.type].name, lv: b.lv, gx: b.gx, gy: b.gy, w: B[b.type].w, d: B[b.type].w,
        label: B[b.type].name.toUpperCase() + ' · LV ' + b.lv, maxLv: B[b.type].max, building: b.lv < 1, job: jobOf[b.id] || null,
        bubble: bubbleView(s, b), next: nextUp(s, b) };
      if (b.type === 'house') {
        const res = s.people.filter((p) => p.state !== 'fallen' && p.houseId === b.id), col = DATA.HOUSE_COLORS[b.houseIdx % 3];
        const resting = res.filter((p) => p.state === 'rest' && p.restKind !== 'recovering').length;
        o.house = { idx: b.houseIdx, color: col.name, roof: col.roof, beds: b.lv >= 1 ? B.house.beds[b.lv] : 0, residents: res.map((p) => p.id), resting, lit: resting > 0, lantern: res.some((p) => p.state === 'down') };
      } else if (b.type === 'clinic') {
        o.clinic = { down: s.people.filter((p) => p.state === 'down' && !(p.arrivedHow === 'stranger' && p.revives === 0 && p.houseId == null)).map((p) => ({ personId: p.id, first: p.first, leftMs: Math.max(0, p.downUntilMs - s.cityMs) })),
          recovering: s.people.filter((p) => p.state === 'rest' && p.restKind === 'recovering').map((p) => p.id) };
      } else if (b.type === 'inn') o.inn = { travelers: s.inn.travelers.length };
      else if (b.type === 'tower') o.tower = { storeys: 1 + Math.ceil(b.lv / 2), gold: b.lv >= 10 };
      return o;
    });
    const total = cranesTotal(s), cranesList = [];
    for (let i = 0; i < Math.max(total, jobs.length); i++) {               // (more jobs than cranes only after the Lab lowered the Tower)
      const j = jobs[i], b = j && j.buildingId ? byId(s, j.buildingId) : null;
      const site = !j ? null : b ? { gx: b.gx, gy: b.gy, w: B[b.type].w, d: B[b.type].w } : { gx: landHi(s) - 1, gy: START.gateGy[0], w: 1, d: 2 };
      cranesList.push({ i, busy: !!j, jobId: j ? j.id : null, site, park: tw ? { x: tw.gx + 3.3, y: tw.gy + 0.4 + 0.8 * (i - (jobs.length)) } : { x: 12, y: 12 } });
    }
    const people = living(s).map((p) => personView(s, p, sugId)).sort((a, b) => ROSTER[a.state === 'rest' ? a.restKind : a.state] - ROSTER[b.state === 'rest' ? b.restKind : b.state] || a.index - b.index);
    const remembered = s.people.filter((p) => p.state === 'fallen').map((p) => personView(s, p, null));
    const graves = s.graves.map((g) => {
      const p = personById(s, g.personId), age = g.gx == null ? 0 : Math.max(0, s.cityMs - g.placedMs), r = Names.mulberry32(((p ? p.seed : 0) ^ 0x0f10e2) >>> 0);
      return { id: g.id, personId: g.personId, gx: g.gx, gy: g.gy, waiting: g.gx == null, placedMs: g.placedMs, ageMs: age, first: p ? p.first : '', name: p ? p.first + ' ' + p.last : '',
        initial: p ? p.first.charAt(0) : '', ribbon: p ? p.look.jacket : '#8a8f98', grassed: age >= DATA.GRAVE.grassMs,
        flowers: age >= DATA.GRAVE.flowers4Ms ? 4 : age >= DATA.GRAVE.flowers2Ms ? 2 : 0, flowerColors: [0, 1, 2, 3].map(() => DATA.FLOWERS[Math.floor(r() * 4)]),
        candle: g.gx != null && age < DATA.GRAVE.candleMs, epitaph: p ? p.epitaph : null };
    });
    const caps = { bricks: capOf(s, 'bricks'), cans: capOf(s, 'cans') }, inn = innB(s);
    const tray = TYPES.map((t) => {
      const have = ofType(s, t).length, allowed = allowedCount(s, t), c = costOf(s, t, 1), full = have >= maxCount(t);
      const locked = !full && have >= allowed ? countTower(t, have) : null;
      const err = full || have >= allowed ? (full ? 'max' : 'locked') : s.res[c.res] < c.n ? 'cost' : cranesFree(s) < 1 ? 'noCrane' : null;
      return { type: t, name: B[t].name, decor: false, cost: c, timeS: jobMs(s, t, 1) / SEC, built: have, allowed, max: maxCount(t), locked, full, affordable: !err || err === 'noCrane', ok: !err, err };
    });
    for (const k of Object.keys(DATA.DECOR)) {
      const D = DATA.DECOR[k], n = Math.round(D.cost * s.lab.mul.cost), locked = T < D.tower ? D.tower : null;
      const err = locked ? 'locked' : s.res.bricks < n ? 'cost' : null;
      tray.push({ type: k, name: D.name, decor: true, cost: { res: 'bricks', n }, timeS: 0, built: s.decor.filter((d) => d.type === k).length, allowed: null, max: null, locked, full: false, affordable: !err, ok: !err, err });
    }
    const lo = landLo(s), hi = landHi(s), plaza = plazaTiles(s, grid);
    let walk = '';
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) walk += inLand(s, x, y) && grid[y * G + x] == null ? '1' : '0';
    const nextRing = s.ring < EXP.maxRing ? s.ring + 1 : null;
    const landNext = nextRing == null ? null : (() => {
      const n = expandCost(s, nextRing), needT = T < EXP.tower[nextRing] ? EXP.tower[nextRing] : null, busy = s.jobs.some((j) => j.kind === 'expand');
      const err = busy ? 'busy' : needT ? 'locked' : s.res.bricks < n ? 'cost' : cranesFree(s) < 1 ? 'noCrane' : null;
      return { ring: nextRing, side: 8 + 2 * nextRing, needTower: needT, cost: { res: 'bricks', n }, timeS: expandMs(s, nextRing) / SEC, ok: !err, err };
    })();
    const tn = tw ? nextUp(s, tw) : null;
    if (tn) tn.opens = towerOpens(tn.lv);
    const today = dayOf(s, s.realLast);
    return {
      v: V, cityMs: s.cityMs, night: s.night, demo: !!s.demo, today, realLast: s.realLast,
      tower: { id: tw.id, lv: T, gx: tw.gx, gy: tw.gy, storeys: 1 + Math.ceil(T / 2), gold: T >= 10, hordeWarnS: DATA.TOWER.hordeWarn[T], job: jobOf[tw.id] || null, next: tn },
      land: { ring: s.ring, side: hi - lo, lo, hi, gate: { x: hi, gy: START.gateGy.slice(), tiles: START.gateGy.map((y) => [hi - 1, y]) },
              quietCorner: { gx: lo, gy: lo }, next: landNext, groundKey: s.ring + '|' + tw.gx + ',' + tw.gy + '|' + plaza.map((t) => t.join(',')).join(';') },
      plaza, walkable: walk, buildings, jobs,
      cranes: { total, free: cranesFree(s), crane4: s.crane4, buy: { ok: !s.crane4 && T >= RULES.crane4Tower && s.res.sparks >= RULES.crane4, err: s.crane4 ? 'max' : T < RULES.crane4Tower ? 'locked' : s.res.sparks < RULES.crane4 ? 'cost' : null, price: RULES.crane4 }, list: cranesList },
      rubble: s.rubble.map((r) => ({ id: r.id, gx: r.gx, gy: r.gy, ring: r.ring, glint: r.glint, cost: { res: 'bricks', n: clearCost(s, r.ring) }, ok: s.res.bricks >= clearCost(s, r.ring) })),
      graves, decor: s.decor.map((d) => ({ id: d.id, type: d.type, gx: d.gx, gy: d.gy })), people, remembered,
      inn: inn ? { id: inn.id, lv: inn.lv, travelers: s.inn.travelers.map((p) => personView(s, p, null)), nextRefreshMs: s.inn.nextRefreshMs,
        leftMs: s.inn.nextRefreshMs != null ? Math.max(0, s.inn.nextRefreshMs - s.cityMs) : null,
        price: s.inn.nextRefreshMs != null ? skipPrice(Math.max(0, s.inn.nextRefreshMs - s.cityMs) / SEC, s) : null, invitePrice: price.invite(s),
        canInvite: living(s).length >= bedsOf(s) ? { ok: false, err: 'beds' } : s.res.cans < price.invite(s) ? { ok: false, err: 'cost' } : { ok: true, err: null } } : null,
      res: { bricks: s.res.bricks, cans: s.res.cans, sparks: s.res.sparks }, caps, rates: { bricks: rateOf(s, 'bricks'), cans: rateOf(s, 'cans') },
      chips: { tower: T, bricks: { n: s.res.bricks, cap: caps.bricks, frac: caps.bricks ? Math.min(1, s.res.bricks / caps.bricks) : 0 },
        cans: { n: s.res.cans, cap: caps.cans, frac: caps.cans ? Math.min(1, s.res.cans / caps.cans) : 0, over: s.res.cans > caps.cans }, sparks: s.res.sparks,
        cranes: { free: cranesFree(s), total }, people: { living: living(s).length, beds: bedsOf(s), down: s.people.some((p) => p.state === 'down') },
        build: { affordable: tray.filter((c) => !c.decor && c.affordable).length } },
      tray,
      dests: DATA.DESTS.map((d) => ({ id: d.id, n: d.n, name: d.name, threat: d.threat, open: destOpen(s, d), lock: destLock(s, d), cleared: s.dest[d.id].cleared,
        firstSparks: d.first, bricks: d.bricks, cans: d.cans, xp: d.xp, fav: d.fav, kit: price.kit(d.id) })),
      goal: goal(s), play: sug, daily: { claimed: s.daily.lastDay === today }, deathOn: s.flags.deathOn,
      pending: s.pending ? { runId: s.pending.runId, personId: s.pending.personId, destId: s.pending.destId, source: s.pending.source } : null,
      flags: Object.assign({}, s.flags), lab: { timeScale: s.lab.timeScale, reducedMotion: s.lab.reducedMotion, runScreenS: s.lab.runScreenS, force: s.lab.force, waitReal: s.lab.waitReal },
    };
  }

  // The building sheet (8.4): before -> after rows, RUN-tagged effects, the next level's cost and time.
  function info(s, id) {
    const b = byId(s, id); if (!b) return null;
    const L = b.lv, N = Math.min(B[b.type].max, L + 1), rows = [], row = (label, from, to, run) => rows.push({ label, from, to, run: !!run });
    const pct = (x) => '+' + Math.round(x * 100) + '%', hrs = (h) => h + ' h';
    switch (b.type) {
      case 'tower': row('Cranes', DATA.TOWER.cranes[L], DATA.TOWER.cranes[N]); row('Horde warning', DATA.TOWER.hordeWarn[L] + ' s', DATA.TOWER.hordeWarn[N] + ' s', true); row('Level cap', L, N); break;
      case 'kiln': case 'cannery': row((b.type === 'kiln' ? 'Bricks' : 'Cans') + '/h', fmtNum(rateLv(s, b.type, L)), fmtNum(rateLv(s, b.type, N))); row('Holds', hrs(B[b.type].hold[L]), hrs(B[b.type].hold[N])); break;
      case 'depot': row('Brick cap', '+' + fmtNum(Math.round(B.depot.capB[L] * s.lab.mul.cost)), '+' + fmtNum(Math.round(B.depot.capB[N] * s.lab.mul.cost))); row('Can cap', '+' + fmtNum(Math.round(B.depot.capC[L] * s.lab.mul.cost)), '+' + fmtNum(Math.round(B.depot.capC[N] * s.lab.mul.cost))); break;
      case 'house': row('Beds', B.house.beds[L], B.house.beds[N]); break;
      case 'clinic': row('Stretcher chance', pct(s.lab.clinicRescue * L), pct(s.lab.clinicRescue * N), true); row('Rest ×', B.clinic.restMul[L].toFixed(2), B.clinic.restMul[N].toFixed(2)); row('Second winds', B.clinic.sw[L], B.clinic.sw[N], true); if (L < 1) row('Kit', 'no kit', 'medkit and pills', true); break;
      case 'armory': row('Start weapon', DATA.WEAPON_NAMES[B.armory.weapon[L]], DATA.WEAPON_NAMES[B.armory.weapon[N]], true); row('Damage ×', B.armory.damage[L].toFixed(2), B.armory.damage[N].toFixed(2), true); row('Power', '+' + B.armory.power[L], '+' + B.armory.power[N], true); if (L < 2 && N >= 2) row('Kit', 'no noise bomb', 'noise bomb', true); break;
      case 'inn': row('Travelers', B.inn.travelers[L], B.inn.travelers[N]); row('New travelers every', fmtDur(B.inn.refresh[L]), fmtDur(B.inn.refresh[N])); if (N === 3 && L < 3) row('Level 2 travelers', 0, 1); break;
    }
    const j = jobFor(s, b.id);
    return { id: b.id, type: b.type, title: B[b.type].name.toUpperCase() + ' · LV ' + L, rows, next: nextUp(s, b), job: j ? jobView(s, j) : null,
      opens: b.type === 'tower' && L < 10 ? towerOpens(L + 1) : [] };
  }

  // ------------------------------------------------------------------ telemetry summary (9)
  function kpis(s) {
    const t = s.tel, days = s.cityMs / DAY, hours = s.cityMs / HOUR, sum = (o) => Object.keys(o).reduce((a, k) => a + o[k], 0);
    const calib = t.calib.map((b, i) => ({ bucket: i * 10, runs: b[0], shown: b[0] ? b[1] / b[0] : null, actual: b[0] ? b[2] / b[0] : null }));
    const perWeek = (n) => (days > 0 ? n * 7 / days : 0), earned = sum(t.sparksIn), spent = sum(t.sparksOut);
    const k = { cityMs: s.cityMs, days, runs: t.runs, wins: t.wins, losses: t.losses, winRate: t.runs ? t.wins / t.runs : null,
      runsPerHour: hours > 0 ? t.runs / hours : 0, runsPerDay: days > 0 ? t.runs / days : 0, downs: t.downs, rescues: t.rescues,
      revivesCans: t.revivesCans, revivesSparks: t.revivesSparks, goodbyes: t.goodbyes, expired: t.expired, graves: t.graves,
      drifters: t.drifters, invites: t.invites, nicknames: t.nicknames, downsByDest: t.downsByDest, downsByLv: t.downsByLv,
      firstDownMs: t.firstDownMs, firstGraveMs: t.firstGraveMs, strangerAtMs: t.strangerAtMs, sparksIn: t.sparksIn, sparksOut: t.sparksOut,
      sparksEarned: earned, sparksSpent: spent, devSparks: t.devSparks, packs: t.packs,
      craneIdle: t.craneMs ? (t.idleOnMs + t.idleOffMs + t.idleGatedMs) / t.craneMs : 0, craneIdleOnline: t.craneMs ? t.idleOnMs / t.craneMs : 0,
      craneIdleOffline: t.craneMs ? t.idleOffMs / t.craneMs : 0, craneIdleGated: t.craneMs ? t.idleGatedMs / t.craneMs : 0,
      overflowBricks: t.overflowBricks, overflowCans: t.overflowCans, onlineMs: t.onlineMs, nothingShare: t.onlineMs ? t.nothingMs / t.onlineMs : 0,
      towerAtMs: t.towerAtMs, runShareBricks: t.bricksRun + t.bricksProd ? t.bricksRun / (t.bricksRun + t.bricksProd) : 0,
      jobsStarted: t.jobsStarted, jobsDone: t.jobsDone, levelUps: t.levelUps, kitSpent: t.kitSpent, priceViolations: t.priceViolations, calibration: calib };
    // The section-10 targets this one save can be judged on (P1 of 13.1 (b)): per-week rates scaled from its own clock.
    const T10 = t.towerAtMs[10], tg = [];
    const add = (id, label, value, text, ok) => tg.push({ id, label, value, target: text, ok: value == null ? null : ok });
    add('P1', 'Tower 10 (day)', T10 != null ? T10 / DAY : null, '6.0-7.0 for an active player', T10 != null && T10 / DAY >= 6 && T10 / DAY <= 7);
    add('P2', 'Downs per week', days >= 1 ? perWeek(t.downs) : null, '5-11', perWeek(t.downs) >= 5 && perWeek(t.downs) <= 11);
    add('P3', 'Graves per week', days >= 1 ? perWeek(t.graves) : null, 'mean 1.5-4', perWeek(t.graves) >= 1.5 && perWeek(t.graves) <= 4);
    add('P5', 'Nothing-to-do time', t.onlineMs ? k.nothingShare : null, '< 5 %', k.nothingShare < 0.05);
    add('P5', 'Win rate', t.runs >= 10 ? k.winRate : null, '88-96 %', k.winRate >= 0.88 && k.winRate <= 0.96);
    add('P9', 'Sparks earned per week', days >= 1 ? perWeek(earned) : null, '250-300', perWeek(earned) >= 250 && perWeek(earned) <= 300);
    add('P10', 'Calibration buckets', calib.some((b) => b.runs >= 50) ? calib.filter((b) => b.runs >= 50).length : null, 'actual within 3 SE + 1.5 points',
      calib.filter((b) => b.runs >= 50).every((b) => Math.abs(b.actual - b.shown) <= 3 * Math.sqrt(b.shown * (1 - b.shown) / b.runs) + 0.015));
    add('P11', 'Prices above 80 % of the cap', t.priceViolations, '0', t.priceViolations === 0);
    k.targets = tg;
    return k;
  }

  // ------------------------------------------------------------------ save format (11.2)
  function newTel() {
    return { runs: 0, wins: 0, losses: 0, downs: 0, rescues: 0, revivesCans: 0, revivesSparks: 0, goodbyes: 0, expired: 0, graves: 0,
      drifters: 0, invites: 0, nicknames: 0, strangerAtMs: null, downsByDest: {}, downsByLv: {}, firstDownMs: null, firstGraveMs: null,
      sparksIn: {}, sparksOut: {}, devSparks: 0, packs: 0, craneMs: 0, craneBusyMs: 0, idleOnMs: 0, idleOffMs: 0, idleGatedMs: 0,
      overflowBricks: 0, overflowCans: 0, onlineMs: 0, nothingMs: 0, towerAtMs: [null, 0, null, null, null, null, null, null, null, null, null],
      bricksRun: 0, bricksProd: 0, bricksGoal: 0, cansRun: 0, cansProd: 0, kitSpent: 0, priceViolations: 0, jobsStarted: 0, jobsDone: 0, levelUps: 0,
      calib: Array.from({ length: 10 }, () => [0, 0, 0]) };
  }
  function create(o) {
    o = o || {};
    const realNow = Math.round(fin(o.realNow, 0));
    const seed = (o.seed != null && isFinite(o.seed) ? Number(o.seed) : Names.hash(realNow >>> 0, Math.floor(realNow / 4294967296) >>> 0)) >>> 0;
    const dest = {}; for (const id of DATA.DEST_IDS) dest[id] = { cleared: false };
    const s = {
      v: V, saveSeed: seed, rng: Names.hash(seed, 0x5eed), cityMs: 0, realLast: realNow, tzOffsetMin: clampInt(o.tzOffsetMin, -840, 840, 0),
      lastSimGoRealMs: null, res: { bricks: START.bricks, cans: START.cans, sparks: START.sparks }, ring: 0,
      buildings: [], jobs: [], crane4: false, rubble: [], decor: [], graves: [], people: [], inn: { travelers: [], nextRefreshMs: null },
      nextIndex: 0, night: 0, lastDest: 'D1', dest, pending: null, lastRun: null, goal: 0,
      flags: { deathOn: false, deathCardSeen: false, strangerDone: false, metPeople: false, finale: false, paidSkip: false },
      daily: { lastDay: null }, forcedWins: RULES.forcedWins, appliedRunIds: [], tel: newTel(), lab: clone(DATA.LAB_DEFAULT), ui: { sound: true },
      ids: { b: 0, j: 0, r: 0, g: 0, d: 0 }, demo: false,
    };
    s.buildings.push({ id: nid(s, 'b'), type: 'tower', lv: 1, gx: START.tower.gx, gy: START.tower.gy });
    s.buildings.push({ id: nid(s, 'b'), type: 'kiln', lv: 1, gx: START.kiln.gx, gy: START.kiln.gy, bubbleBase: START.kilnBubble, bubbleSinceMs: 0 });
    const house = { id: nid(s, 'b'), type: 'house', lv: 1, gx: START.house.gx, gy: START.house.gy, houseIdx: 0 };
    s.buildings.push(house);
    for (const [x, y, g] of START.rubble) s.rubble.push({ id: nid(s, 'r'), gx: x, gy: y, ring: 0, glint: g });
    for (const role of ['sprinter', 'brawler']) { const p = genPerson(s, { role, how: 'starter' }); p.houseId = house.id; s.people.push(p); }
    return s;
  }
  function serialize(s) { return JSON.stringify(s); }
  function migrate(o) {
    let v = Math.max(0, Math.floor(fin(o.v, 0)));
    while (v < V) { v++; o = MIGRATIONS[v](o); o.v = v; }
    return o;
  }
  const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  function cleanPerson(p, notes) {
    if (!isObj(p) || typeof p.first !== 'string' || typeof p.last !== 'string' || !p.first) return null;
    const lv = clampInt(p.lv, 1, 10, 1), look = isObj(p.look) ? p.look : {};
    const role = Names.ROLES.includes(p.role) ? p.role : 'sprinter', state = STATES.includes(p.state) ? p.state : 'ready';
    const xpHi = lv < 10 ? XP_AT[lv + 1] - 1 : BIG, xp = clampInt(p.xp, XP_AT[lv], xpHi, XP_AT[lv]);
    if (xp !== p.xp || lv !== p.lv) notes.push('person ' + p.first + ': level or XP fixed');
    const q = { id: typeof p.id === 'string' && /^p\d+$/.test(p.id) ? p.id : null, index: clampInt(p.index, 0, BIG, 0), seed: uint(p.seed, 0),
      first: p.first.slice(0, 40), last: p.last.slice(0, 40), nick: DATA.NICKNAMES[p.nick] ? p.nick : null, age: clampInt(p.age, 19, 64, 30),
      role, trade: typeof p.trade === 'string' && Names.TRADES[role].includes(p.trade) ? p.trade : Names.TRADES[role][0],
      trait: DATA.TRAIT_IDS.includes(p.trait) ? p.trait : 'tough', habit: clampInt(p.habit, 0, Names.HABITS.length - 1, 0),
      look: { skin: isColor(look.skin) ? look.skin : Names.SKIN[0], hairStyle: Names.STYLES.includes(look.hairStyle) ? look.hairStyle : 'short',
        hair: isColor(look.hair) ? look.hair : Names.HAIR[0], jacket: isColor(look.jacket) ? look.jacket : Names.JACKETS[0], acc: Names.ACC.includes(look.acc) ? look.acc : 'none' },
      lv, xp, state, restKind: state === 'rest' ? (REST_KINDS.includes(p.restKind) ? p.restKind : 'tired') : null,
      restFromMs: Math.max(0, Math.round(fin(p.restFromMs, 0))), restUntilMs: Math.max(0, Math.round(fin(p.restUntilMs, 0))),
      downUntilMs: Math.max(0, Math.round(fin(p.downUntilMs, 0))), houseId: typeof p.houseId === 'string' ? p.houseId : null,
      revives: clampInt(p.revives, 0, BIG, 0), runs: clampInt(p.runs, 0, BIG, 0), wins: clampInt(p.wins, 0, BIG, 0), hurtCount: clampInt(p.hurtCount, 0, BIG, 0),
      kills: clampInt(p.kills, 0, BIG, 0), bestKills: clampInt(p.bestKills, 0, BIG, 0),
      history: (Array.isArray(p.history) ? p.history : []).filter((h) => Array.isArray(h) && typeof h[1] === 'string').map((h) => [clampInt(h[0], 0, BIG, 0), h[1].slice(0, 120)]).slice(-RULES.maxHistory),
      arrivedNight: clampInt(p.arrivedNight, 0, BIG, 0), arrivedHow: HOWS.includes(p.arrivedHow) ? p.arrivedHow : 'lab',
      fellNight: p.fellNight == null ? null : clampInt(p.fellNight, 0, BIG, 0), fellDest: DEST[p.fellDest] ? p.fellDest : null,
      fellOdds: p.fellOdds == null ? null : clamp(fin(p.fellOdds, 0), 0, 1),
      epitaph: Array.isArray(p.epitaph) && p.epitaph.length === 2 && p.epitaph.every((x) => typeof x === 'string') ? p.epitaph.slice() : null,
      kin: typeof p.kin === 'string' && /^p\d+$/.test(p.kin) ? p.kin : null };
    if (q.wins > q.runs) q.wins = q.runs;
    if (q.state === 'rest' && q.restUntilMs < q.restFromMs) { q.restUntilMs = q.restFromMs; notes.push('rest end fixed'); }
    return q;
  }
  function sanitize(o, notes) {
    notes = notes || [];
    const note = (m) => notes.push(m);
    o = isObj(o) ? o : {};
    const seed = uint(o.saveSeed, 20261104);
    const t = create({ realNow: fin(o.realLast, 0), tzOffsetMin: fin(o.tzOffsetMin, 0), seed });
    const s = {};
    s.v = V; s.saveSeed = seed; s.rng = uint(o.rng, t.rng);
    s.cityMs = Math.max(0, Math.round(fin(o.cityMs, 0))); s.realLast = Math.max(0, Math.round(fin(o.realLast, 0)));
    s.tzOffsetMin = clampInt(o.tzOffsetMin, -840, 840, 0);
    s.lastSimGoRealMs = o.lastSimGoRealMs == null ? null : Math.max(0, Math.round(fin(o.lastSimGoRealMs, 0)));
    const r = isObj(o.res) ? o.res : {};
    s.res = {}; for (const k of ['bricks', 'cans', 'sparks']) { const v = Math.max(0, Math.round(fin(r[k], 0))); if (v !== r[k]) note('res.' + k + ' fixed'); s.res[k] = v; }
    s.ring = clampInt(o.ring, 0, EXP.maxRing, 0);
    // buildings: one Tower, known types, levels <= the Tower, unique ids
    const ids = new Set(), bl = [];
    for (const b of Array.isArray(o.buildings) ? o.buildings : []) {
      if (!isObj(b) || !B[b.type]) { note('unknown building dropped'); continue; }
      if (b.type === 'tower' && bl.some((x) => x.type === 'tower')) { note('second Tower dropped'); continue; }
      let id = typeof b.id === 'string' && /^b\d+$/.test(b.id) && !ids.has(b.id) ? b.id : null;
      const q = { id, type: b.type, lv: clampInt(b.lv, b.type === 'tower' ? 1 : 0, B[b.type].max, 1), gx: clampInt(b.gx, 0, G - 1, 0), gy: clampInt(b.gy, 0, G - 1, 0) };
      if (b.type === 'house') q.houseIdx = clampInt(b.houseIdx, 0, 2, 0);
      if (PRODUCERS[b.type]) { q.bubbleBase = Math.max(0, fin(b.bubbleBase, 0)); q.bubbleSinceMs = clampInt(b.bubbleSinceMs, 0, s.cityMs, s.cityMs); }
      if (q.lv !== b.lv) note(b.type + ' level fixed');
      bl.push(q); if (id) ids.add(id);
    }
    if (!bl.some((b) => b.type === 'tower')) { note('Bell Tower restored'); bl.unshift({ id: null, type: 'tower', lv: 1, gx: START.tower.gx, gy: START.tower.gy }); }
    const T = bl.find((b) => b.type === 'tower').lv;
    for (const b of bl) if (b.type !== 'tower' && b.lv > T) { note(b.type + ' above the Tower lowered'); b.lv = T; }
    const hs = bl.filter((b) => b.type === 'house').sort((a, b) => a.houseIdx - b.houseIdx);
    hs.forEach((h, i) => { if (h.houseIdx !== i) { h.houseIdx = i; note('house colour fixed'); } });
    s.buildings = bl;
    const maxNum = (list, k) => list.reduce((m, x) => (x.id && x.id.charAt(0) === k ? Math.max(m, idNum(x.id)) : m), 0);
    const oi = isObj(o.ids) ? o.ids : {};
    s.ids = { b: Math.max(clampInt(oi.b, 0, BIG, 0), maxNum(bl, 'b')) };
    for (const b of bl) if (!b.id) { b.id = 'b' + (++s.ids.b); note('building id repaired'); }
    s.jobs = [];
    const okRing = s.ring;
    for (const j of Array.isArray(o.jobs) ? o.jobs : []) {
      if (!isObj(j) || !['build', 'upgrade', 'expand'].includes(j.kind)) { note('job dropped'); continue; }
      const q = { id: typeof j.id === 'string' && /^j\d+$/.test(j.id) && !s.jobs.some((x) => x.id === j.id) ? j.id : null, kind: j.kind,
        target: j.kind === 'expand' ? null : typeof j.target === 'string' ? j.target : null, toLv: clampInt(j.toLv, 1, 10, 1),
        startMs: Math.max(0, Math.round(fin(j.startMs, s.cityMs))), endMs: Math.max(0, Math.round(fin(j.endMs, s.cityMs))) };
      if (q.endMs < q.startMs) q.endMs = q.startMs;
      if (q.kind === 'expand') { if (q.toLv !== okRing + 1 || okRing >= EXP.maxRing || s.jobs.some((x) => x.kind === 'expand')) { note('expansion job dropped'); continue; } }
      else {
        const b = bl.find((x) => x.id === q.target);
        if (!b || s.jobs.some((x) => x.target === q.target) || q.toLv !== b.lv + 1 || (q.kind === 'build') !== (b.lv === 0) || (b.type !== 'tower' && q.toLv > T)) { note('job dropped'); continue; }
      }
      s.jobs.push(q);
    }
    for (const b of bl) if (b.lv === 0 && !s.jobs.some((j) => j.target === b.id)) { b.lv = 1; note(b.type + ' with no build job finished'); }
    s.crane4 = o.crane4 === true;
    // positions: inside the land, off the gate, no overlaps (moved to the nearest valid spot when needed)
    s.rubble = []; s.decor = []; s.graves = [];
    const tmp = Object.assign({}, t, { ring: s.ring, buildings: [], rubble: s.rubble, decor: s.decor, graves: s.graves });
    for (const b of bl.slice().sort((a, b) => (a.type === 'tower' ? -1 : b.type === 'tower' ? 1 : 0))) {
      const reason = fitsGrid(tmp, occGrid(tmp), B[b.type].w, b.gx, b.gy);
      if (reason) { const sp = suggestSpot(tmp, b.type, b.gx + B[b.type].w / 2, b.gy + B[b.type].w / 2); if (sp) { b.gx = sp.gx; b.gy = sp.gy; note(b.type + ' moved to a free spot'); } else note(b.type + ' has no free spot'); }
      tmp.buildings.push(b);
    }
    s.ids.j = Math.max(clampInt(oi.j, 0, BIG, 0), maxNum(s.jobs, 'j')); for (const j of s.jobs) if (!j.id) j.id = 'j' + (++s.ids.j);
    const rids = new Set();
    for (const x of Array.isArray(o.rubble) ? o.rubble : []) {
      if (!isObj(x)) continue;
      const q = { id: typeof x.id === 'string' && /^r\d+$/.test(x.id) && !rids.has(x.id) ? x.id : null, gx: clampInt(x.gx, 0, G - 1, 0), gy: clampInt(x.gy, 0, G - 1, 0), ring: clampInt(x.ring, 0, EXP.maxRing, 0), glint: x.glint === true };
      if (fitsGrid(tmp, occGrid(tmp), 1, q.gx, q.gy)) { note('rubble dropped'); continue; }
      s.rubble.push(q); if (q.id) rids.add(q.id);
    }
    s.ids.r = Math.max(clampInt(oi.r, 0, BIG, 0), maxNum(s.rubble, 'r')); for (const x of s.rubble) if (!x.id) x.id = 'r' + (++s.ids.r);
    for (const x of Array.isArray(o.decor) ? o.decor : []) {
      if (!isObj(x) || !DATA.DECOR[x.type]) continue;
      const q = { id: typeof x.id === 'string' && /^d\d+$/.test(x.id) && !s.decor.some((y) => y.id === x.id) ? x.id : null, type: x.type, gx: clampInt(x.gx, 0, G - 1, 0), gy: clampInt(x.gy, 0, G - 1, 0) };
      if (fitsGrid(tmp, occGrid(tmp), 1, q.gx, q.gy)) { note('decoration dropped'); continue; }
      s.decor.push(q);
    }
    s.ids.d = Math.max(clampInt(oi.d, 0, BIG, 0), maxNum(s.decor, 'd')); for (const x of s.decor) if (!x.id) x.id = 'd' + (++s.ids.d);
    // people: unique ids, valid houses; graves for the Fallen; travelers
    s.people = [];
    const pids = new Set();
    let maxIndex = -1;
    for (const p of Array.isArray(o.people) ? o.people : []) { const q = cleanPerson(p, notes); if (!q) { note('person dropped'); continue; } s.people.push(q); maxIndex = Math.max(maxIndex, q.index); }
    const travelers = [];
    const ti = isObj(o.inn) ? o.inn : {};
    for (const p of Array.isArray(ti.travelers) ? ti.travelers : []) { const q = cleanPerson(p, notes); if (q) { q.state = 'ready'; q.restKind = null; q.houseId = null; travelers.push(q); maxIndex = Math.max(maxIndex, q.index); } }
    s.nextIndex = Math.max(clampInt(o.nextIndex, 0, BIG, 0), maxIndex + 1);
    for (const q of s.people.concat(travelers)) { if (!q.id || pids.has(q.id)) { q.index = s.nextIndex++; q.id = 'p' + q.index; note('person id repaired'); } pids.add(q.id); }
    for (const g of Array.isArray(o.graves) ? o.graves : []) {
      if (!isObj(g)) continue;
      const p = s.people.find((x) => x.id === g.personId);
      if (!p || s.graves.some((x) => x.personId === p.id)) { note('dangling grave dropped'); continue; }
      if (p.state !== 'fallen') { p.state = 'fallen'; p.restKind = null; note('person with a grave set Fallen'); }
      const q = { id: typeof g.id === 'string' && /^g\d+$/.test(g.id) && !s.graves.some((x) => x.id === g.id) ? g.id : null, personId: p.id,
        gx: g.gx == null ? null : clampInt(g.gx, 0, G - 1, 0), gy: g.gx == null ? null : clampInt(g.gy, 0, G - 1, 0), placedMs: clampInt(g.placedMs, 0, s.cityMs, s.cityMs),
        houseId: typeof g.houseId === 'string' && bl.some((b) => b.id === g.houseId && b.type === 'house') ? g.houseId : null };
      if (q.gx != null && fitsGrid(tmp, occGrid(tmp), 1, q.gx, q.gy)) { q.gx = null; q.gy = null; note('grave waits for a place'); }
      s.graves.push(q);
    }
    s.ids.g = Math.max(clampInt(oi.g, 0, BIG, 0), maxNum(s.graves, 'g')); for (const x of s.graves) if (!x.id) x.id = 'g' + (++s.ids.g);
    for (const p of s.people) if (p.state === 'fallen' && !s.graves.some((g) => g.personId === p.id)) { s.graves.push({ id: 'g' + (++s.ids.g), personId: p.id, gx: null, gy: null, placedMs: s.cityMs, houseId: null }); note('missing grave restored'); }
    for (const p of s.people.concat(travelers)) if (p.kin && !s.people.some((q) => q.id === p.kin && q.state === 'fallen')) { p.kin = null; note('kin reference dropped'); }
    for (const p of s.people) {
      if (p.houseId && !bl.some((b) => b.id === p.houseId && b.type === 'house')) { p.houseId = null; note('house reference repaired'); }
      if (p.state === 'fallen') { p.houseId = null; if (!p.epitaph) p.epitaph = epitaph(s, p); }
    }
    if (fixBeds(Object.assign({}, t, { buildings: bl, people: s.people }))) note('bed overflow repaired');
    s.inn = { travelers, nextRefreshMs: ti.nextRefreshMs == null ? null : Math.max(0, Math.round(fin(ti.nextRefreshMs, s.cityMs))) };
    const innBl = bl.find((b) => b.type === 'inn');
    if (!innBl || innBl.lv < 1) { if (travelers.length || s.inn.nextRefreshMs != null) note('Inn travelers dropped'); s.inn.travelers = []; s.inn.nextRefreshMs = null; }
    else if (s.inn.nextRefreshMs == null) s.inn.nextRefreshMs = s.cityMs;
    s.night = clampInt(o.night, 0, BIG, 0);
    s.lastDest = DEST[o.lastDest] ? o.lastDest : 'D1';
    s.dest = {}; const od = isObj(o.dest) ? o.dest : {};
    for (const id of DATA.DEST_IDS) s.dest[id] = { cleared: isObj(od[id]) && od[id].cleared === true };
    // pending (stage 3 owns its fields): a broken one is dropped and the runner comes home
    s.pending = null;
    const pe = o.pending;
    if (isObj(pe)) {
      const p = s.people.find((x) => x.id === pe.personId);
      if (p && p.state === 'out' && DEST[pe.destId] && typeof pe.runId === 'string') {
        s.pending = { runId: pe.runId, night: clampInt(pe.night, 0, BIG, 0), seed: uint(pe.seed, 0), destId: pe.destId, personId: p.id,
          source: pe.source === 'external' ? 'external' : 'sim', kit: isObj(pe.kit) ? { medkit: pe.kit.medkit ? 1 : 0, pills: pe.kit.pills ? 1 : 0, bomb: pe.kit.bomb ? 1 : 0 } : { medkit: 0, pills: 0, bomb: 0 },
          held: clampInt(pe.held, 0, BIG, 0), handoff: isObj(pe.handoff) ? clone(pe.handoff) : null, refs: isObj(pe.refs) ? clone(pe.refs) : null,
          falls: isObj(pe.falls) ? clone(pe.falls) : null, startedCityMs: clampInt(pe.startedCityMs, 0, s.cityMs, s.cityMs),
          warpS: pe.warpS == null ? null : Math.max(0, fin(pe.warpS, 0)) };
        for (const k of Object.keys(pe)) if (!(k in s.pending)) s.pending[k] = clone(pe[k]);   // keys added by later stages survive
      } else note('broken pending run dropped');
    }
    for (const p of s.people) if (p.state === 'out' && (!s.pending || s.pending.personId !== p.id)) { p.state = 'ready'; note('runner without a run came home'); }
    s.lastRun = isObj(o.lastRun) ? clone(o.lastRun) : null;
    s.goal = clampInt(o.goal, 0, GOALS.length, 0);
    const fl = isObj(o.flags) ? o.flags : {};
    s.flags = {}; for (const k of Object.keys(t.flags)) s.flags[k] = fl[k] === true;
    s.daily = { lastDay: isObj(o.daily) && o.daily.lastDay != null ? clampInt(o.daily.lastDay, 0, BIG, 0) : null };
    s.forcedWins = clampInt(o.forcedWins, 0, RULES.forcedWins, RULES.forcedWins);
    s.appliedRunIds = (Array.isArray(o.appliedRunIds) ? o.appliedRunIds : []).filter((x) => typeof x === 'string').slice(-100);
    const ot = isObj(o.tel) ? o.tel : {};
    s.tel = newTel();
    for (const k of Object.keys(s.tel)) {
      const d = s.tel[k], v = ot[k];
      if (v === undefined) continue;
      if (d === null) s.tel[k] = typeof v === 'number' && isFinite(v) ? Math.max(0, v) : null;
      else if (typeof d === 'number') s.tel[k] = typeof v === 'number' && isFinite(v) ? Math.max(0, v) : d;
      else if (k === 'towerAtMs') s.tel[k] = Array.from({ length: 11 }, (_, i) => (Array.isArray(v) && typeof v[i] === 'number' && isFinite(v[i]) ? Math.max(0, v[i]) : d[i]));
      else if (k === 'calib') s.tel[k] = Array.from({ length: 10 }, (_, i) => (Array.isArray(v) && Array.isArray(v[i]) ? [0, 1, 2].map((j) => Math.max(0, fin(v[i][j], 0))) : [0, 0, 0]));
      else if (isObj(d) && isObj(v)) { const m = {}; for (const kk of Object.keys(v)) if (typeof v[kk] === 'number' && isFinite(v[kk])) m[kk] = Math.max(0, v[kk]); s.tel[k] = m; }
    }
    const ol = isObj(o.lab) ? o.lab : {}, LR = DATA.LAB_RANGE;
    s.lab = clone(DATA.LAB_DEFAULT);
    if (LR.timeScale.includes(ol.timeScale)) s.lab.timeScale = ol.timeScale;
    if (typeof ol.runsAdvanceClock === 'boolean') s.lab.runsAdvanceClock = ol.runsAdvanceClock;
    if (ol.runWarp != null) s.lab.runWarp = clampInt(ol.runWarp, 0, 20, 6);
    if (LR.force.includes(ol.force)) s.lab.force = ol.force;
    if (LR.runScreenS.includes(ol.runScreenS)) s.lab.runScreenS = ol.runScreenS;
    s.lab.lockSeed = ol.lockSeed == null ? null : uint(ol.lockSeed, null);
    s.lab.waitReal = ol.waitReal === true;
    if (isObj(ol.mul)) for (const k of Object.keys(s.lab.mul)) s.lab.mul[k] = clamp(fin(ol.mul[k], 1), LR.mul[k][0], LR.mul[k][1]);
    if (Array.isArray(ol.rescueBase)) s.lab.rescueBase = s.lab.rescueBase.map((d, i) => (i === 0 ? 1 : clamp(fin(ol.rescueBase[i], d), 0, 1)));
    for (const k of ['clinicRescue', 'tiredFloor', 'escalationCap', 'downWindowMs', 'freeSec', 'skipExp', 'skipK']) if (ol[k] != null) s.lab[k] = clamp(fin(ol[k], s.lab[k]), LR[k][0], LR[k][1]);
    for (const k of ['escalationCap', 'downWindowMs', 'freeSec']) s.lab[k] = Math.round(s.lab[k]);
    s.lab.reducedMotion = ol.reducedMotion === true ? true : ol.reducedMotion === false ? false : null;
    s.ui = { sound: !(isObj(o.ui) && o.ui.sound === false) };
    s.ids = { b: s.ids.b, j: s.ids.j, r: s.ids.r, g: s.ids.g, d: s.ids.d };
    s.demo = o.demo === true;
    // a house with free beds takes any homeless present person
    for (const p of s.people) if (!p.houseId && (p.state === 'ready' || p.state === 'rest' || p.state === 'out')) assignHouse(s, p);
    // canonical key order (the same as create), so a clean save round-trips byte for byte
    const out = {}; for (const k of Object.keys(t)) out[k] = s[k];
    return out;
  }
  function load(raw, realNow, opts) {
    opts = opts || {};
    const fresh = () => create({ realNow, tzOffsetMin: opts.tzOffsetMin, seed: opts.seed });
    if (raw == null || raw === '') return { state: fresh(), status: 'new', notes: [] };
    let o;
    try { o = typeof raw === 'string' ? JSON.parse(raw) : clone(raw); } catch (e) { return { state: fresh(), status: 'corrupt-reset', notes: ['unreadable save'], bad: raw }; }
    if (!isObj(o)) return { state: fresh(), status: 'corrupt-reset', notes: ['unreadable save'], bad: raw };
    const v = typeof o.v === 'number' ? o.v : null;
    if (v != null && v > V) return { state: fresh(), status: 'future-version', notes: ['this save is from a newer version (v' + v + ')'] };
    const notes = []; let status = 'ok';
    if (v !== V) { o = migrate(o); status = 'migrated'; notes.push('migrated from v' + (v == null ? 0 : v)); }
    const s = sanitize(o, notes);
    settle(s, []);                                            // state-based rules at the saved time (a no-op for a clean save)
    return { state: s, status, notes };
  }

  // ------------------------------------------------------------------ #demo: a Tower-4 city like the mock (never saved)
  function demo(o) {
    o = o || {};
    const s = create({ realNow: o.realNow, tzOffsetMin: o.tzOffsetMin, seed: 20261104 });
    s.demo = true;
    const at = (lv) => ({ bubbleBase: 0, bubbleSinceMs: 0, lv });
    s.ring = 2; s.cityMs = 75 * MIN; s.night = 14; s.goal = 17; s.lastDest = 'D3';
    s.flags = { deathOn: true, deathCardSeen: true, strangerDone: true, metPeople: true, finale: false, paidSkip: true };
    for (const id of ['D1', 'D2', 'D3']) s.dest[id].cleared = true;
    s.forcedWins = 0; s.res = { bricks: 1240, cans: 380, sparks: 48 };
    const tw = s.buildings[0]; tw.lv = 4; tw.gx = 8; tw.gy = 8;
    const k1 = s.buildings[1]; Object.assign(k1, at(3), { gx: 12, gy: 7 });
    const h1 = s.buildings[2]; h1.lv = 2; h1.gx = 9; h1.gy = 15;
    s.ids.b = 3;
    const add = (type, lv, gx, gy, extra) => { const b = Object.assign({ id: 'b' + (++s.ids.b), type, lv, gx, gy }, extra || {}); s.buildings.push(b); return b; };
    const k2 = add('kiln', 2, 6, 12, { bubbleBase: 0, bubbleSinceMs: 0 });
    const cn = add('cannery', 2, 15, 7, { bubbleBase: 0, bubbleSinceMs: 0 });
    add('depot', 2, 15, 10); add('armory', 2, 7, 14); add('clinic', 1, 11, 12);
    add('house', 1, 12, 15, { houseIdx: 1 }); const inn = add('inn', 1, 15, 14);
    rebase(s, k1, s.cityMs, 0.4 * holdLv(s, 'kiln', 3)); rebase(s, k2, s.cityMs, 0.2 * holdLv(s, 'kiln', 2)); rebase(s, cn, s.cityMs, holdLv(s, 'cannery', 2));
    s.rubble = [{ id: 'r1', gx: 17, gy: 6, ring: 2, glint: true }, { id: 'r2', gx: 6, gy: 17, ring: 2, glint: false }, { id: 'r3', gx: 17, gy: 17, ring: 2, glint: false }];
    s.ids.r = 3;
    s.decor = [{ id: 'd1', type: 'tree', gx: 6, gy: 6 }, { id: 'd2', type: 'tree', gx: 11, gy: 6 }, { id: 'd3', type: 'tree', gx: 8, gy: 17 }, { id: 'd4', type: 'tree', gx: 17, gy: 9 }];
    s.ids.d = 4;
    s.jobs = [{ id: 'j1', kind: 'upgrade', target: k2.id, toLv: 3, startMs: s.cityMs - 48 * SEC, endMs: s.cityMs + 252 * SEC }];
    s.ids.j = 1;
    // people: the two starters plus three more from the same generator; the sixth fell at the Night Market
    const [efua, ngozi] = s.people;
    efua.lv = 3; efua.xp = 230; efua.runs = 7; efua.wins = 7; efua.kills = 610; efua.bestKills = 121; efua.nick = 'mower';
    ngozi.lv = 2; ngozi.xp = 120; ngozi.runs = 4; ngozi.wins = 4; ngozi.kills = 300; ngozi.bestKills = 98;
    const more = [];
    for (let i = 0; i < 4; i++) { const p = genPerson(s, { lv: 1, how: i === 0 ? 'stranger' : 'inn' }); s.people.push(p); more.push(p); }
    const [burak, thiago, petros, joy] = more;
    burak.lv = 2; burak.xp = 90; burak.runs = 2; burak.wins = 2; burak.revives = 1; burak.history.push([3, 'Night 3. Revived in the Clinic.']);
    for (const p of [efua, ngozi, burak]) p.houseId = h1.id;
    for (const p of [thiago, petros]) p.houseId = s.buildings.find((b) => b.type === 'house' && b.houseIdx === 1).id;
    ngozi.state = 'rest'; ngozi.restKind = 'tired'; ngozi.restFromMs = s.cityMs - 4 * MIN; ngozi.restUntilMs = s.cityMs + 6 * MIN;
    burak.state = 'rest'; burak.restKind = 'tired'; burak.restFromMs = s.cityMs - 2 * MIN; burak.restUntilMs = s.cityMs + 9 * MIN;
    petros.runs = 1; petros.wins = 1;
    joy.runs = 2; joy.wins = 1; joy.fellNight = 11; joy.fellDest = 'D3'; joy.fellOdds = 0.86; joy.houseId = null;
    joy.state = 'fallen'; joy.epitaph = epitaph(s, joy);
    s.graves = [{ id: 'g1', personId: joy.id, gx: 7, gy: 17, placedMs: 50 * MIN, houseId: null }]; s.ids.g = 1;
    s.tel.graves = 1; s.tel.goodbyes = 1; s.tel.runs = 14; s.tel.wins = 12; s.tel.losses = 2; s.tel.downs = 1; s.tel.firstGraveMs = 50 * MIN; s.tel.firstDownMs = 48 * MIN;
    s.tel.towerAtMs = [null, 0, 1.5 * MIN, 4 * MIN, 55 * MIN, null, null, null, null, null, null];
    s.tel.sparksIn = { tower: 16, goals: 5, firstClear: 12, daily: 5, rubble: 9 }; s.tel.sparksOut = { finish: 4 };
    inn.lv = 1; refreshInn(s, []); s.inn.nextRefreshMs = s.cityMs + 38 * MIN;
    return s;
  }

  return {
    V, SEC, MIN, HOUR, DAY, DATA_RULE,
    create, load, serialize, migrate, sanitize, tick, resume, advance, act, view, goal, info, derived, kpis, demo,
    odds, oddsKey, kitDeltas, restedOdds, strip, suggest, autoKit, buildHandoff, runSim, validateResult, reward,
    price, canPlace, suggestSpot, graveSpot, towerOpens, fmt,
    cost: (s, t, lv) => costOf(s, t, lv), jobMs, caps: (s) => ({ bricks: capOf(s, 'bricks'), cans: capOf(s, 'cans') }),
    rates: (s) => ({ bricks: rateOf(s, 'bricks'), cans: rateOf(s, 'cans') }), cranes: (s) => ({ total: cranesTotal(s), free: cranesFree(s) }),
    beds: bedsOf, bubble: (s, id) => { const b = byId(s, id); return b ? bubbleView(s, b) : null; },
    _internal: { settle, fall, addXp, assignHouse, gain, earn, spend, history, epitaph, genPerson, setDown, warpAtGo, runClockMs,
      restFrac, startHpFrac, restMulOf, welcome, refreshInn, completeJob, living, present, towerLv, capOf, rateOf, destOpen, DEST },
  };
});
