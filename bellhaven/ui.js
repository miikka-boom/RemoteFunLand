/* Bellhaven UI (BH.UI): the playable page's DOM side. SPEC 5.5-5.6 (offline, skip prices), 7.1-7.3 (first minutes,
 * the goal chip, the stranger), 8.2-8.5 (gestures, HUD, building sheet, action bar, build tray, placement), 8.6-8.9
 * (roster, person and traveler cards, the run sheet, run screen and result card, the fall beat, the revive offer,
 * goodbye, grave placement and the memorial card), 6.2-6.7 (choosing who goes, the odds in idle frames, the walk to the
 * gate and back), 8.10-8.14 (welcome card, City and Sparks sheets, one-time cards, portrait and desktop), 8.16-8.17
 * (juice, reduced motion), 11.1-11.2 (save, load, the time loop).
 *
 * The only file that touches localStorage, Date.now and performance.now. Every state change goes through
 * Engine.act(state, action, Date.now()); the city is drawn by BH.Iso from Engine.view(); sound is BH.Sfx (optional);
 * the Lab is BH.Lab (optional). Classic script with the shared UMD header; it does nothing outside a browser.
 *
 * ===================================================================================================== HOW IT WORKS
 * Time loop (requestAnimationFrame): Engine.tick(S, frame delta, Date.now()) -> events -> handle(); the view is
 *   rebuilt after every act and at most every 100 ms otherwise (Engine.view is cheap) and pushed to iso.setView;
 *   iso.frame(ts) draws; the HUD re-renders on change (string-diffed); open sheets and overlays re-render twice a
 *   second (timers) through morph(); odds for PLAY and the run sheet are computed by a time-sliced queue keyed by
 *   Engine.oddsKey (below, <= 8 ms of odds work a frame, 6.3.5); the run screen animates in rscFrame(ts); the save is
 *   written after every successful act, every 10 s, on visibilitychange (hidden) and pagehide.
 * Save and load (11.2): key 'bellhaven.v1' (every access in try/catch; if storage throws the game runs in memory and
 *   says "Progress won't be saved in this browser." once); 'corrupt-reset' copies the raw save to 'bellhaven.v1.bad';
 *   'future-version' plays in memory and never overwrites that save; #demo plays Engine.demo() and never saves.
 *   Offline time is credited by Engine.resume() on load and on every return to the tab (the welcome card, 5.5).
 * URL: #demo (the Tower-4 demo city, in memory) · ?insets=L[,B[,R[,T]]] a simulated notch for tests (px; R defaults
 *   to L) · ?seed=N the save seed of a NEW save (tests; an existing save is kept).
 *
 * ===================================================================================================== STRUCTURE
 * Rendering is plain HTML strings, applied with morph(el, html): an element-by-element patch that keeps every node
 *   whose tag (and data-k key) is unchanged, so a button that only changes its label is never replaced (a tap is
 *   never lost to a re-render). Interaction is one delegated click handler: an element with data-do="name" calls
 *   DO[name](el, event); its data-* attributes carry the arguments. aria-disabled="true" with data-why="..." shows
 *   that reason as a toast instead.
 * Component helpers (UI.h): ic(name, color) inline SVG icon (BH.Art) · esc(text) · btn({ do, label, sub, cls, data,
 *   icon, off, why, primary }) · costChip({ res, n }) · needLine(cost) · timeChip(sec) · skipBtn(key, price, do,
 *   data, verb) the 5.6 skip button with the second-tap confirm at 20 ✦ or more · portrait(look, size, grey) <img> ·
 *   pill(text, cls) · num(n) (fmt.compact with the layout's narrowness) · line(icon/img, title, sub, right).
 * Sheets (one at a time, docked right; bottom sheets in portrait): UI.sheet.register(kind, { head(V, a), body(V, a),
 *   foot(V, a), subject(a) -> iso target kept visible }), UI.sheet.open(kind, args), .close(), .current().
 *   Kinds here: building {id} (the House, Clinic and Inn blocks list residents, Down / Recovering people and the
 *   travelers as cards), city, sparks, jobs, res {res}, people (the roster, 8.6).
 * Overlays (full screen, one at a time, the rest wait in a queue; the city is not interactive under them):
 *   UI.overlay.register(kind, { render(V, a) -> html, dark?, esc?(a) (Esc / ✕), enter?(a), onOpen?(a),
 *   onClose?(a) }), UI.overlay.open(kind, args) (opens now, the current one is queued back), .queue(kind, args)
 *   (after the current ones), .close(), .current(). Kinds here: welcome, meet, tower, death, finale, crane (no free
 *   crane), run (the run sheet), runscreen, result, offer (revive), person (person and traveler card), memorial, json
 *   (the handoff or result JSON with COPY). An overlay re-shown from the queue gets onOpen again, so the run sheet
 *   and the result card keep their state in their args (inited / started) and never restart.
 * Events: Engine events go through handle(events, ctx): flyers, sounds, toasts and cards for the city events below,
 *   then every listener added with UI.onEvent(type, fn(e, ctx)) (here: stranger -> the camera finds the stranger and
 *   the offer opens once; dev op kill -> the offer). ctx: { act, offline, tick, at }.
 *   Cards and toasts: a card that opens clears the toasts raised before it (they sat on its title; the storage notices
 *   are kept), and city news raised while a card is up (a run goal reached as the result shows, a job done under the
 *   Tower card, a revive's confirmation) waits for the last card to close: cityFx(fn, holds) / runLater(); the chips
 *   hold the old numbers meanwhile. Under any card the bottom bar steps back (.ov-open), and under the night screens
 *   (the run sheet, the run screen, the result) the top bar too (.ov-dark).
 * Modes: ui.mode = null | { kind: 'place', type, cost } | { kind: 'move', target, labels?, onDone? } (8.5). PLAY
 *   becomes ✓ PLACE / BLOCKED / ✓ DONE, BUILD becomes ✕ CANCEL. Grave placement after SAY GOODBYE is 'move' with the
 *   labels { ok: 'LAY TO REST', cancel: null, hint: 'Drag to choose a place' } (no ✕; Esc does nothing).
 *
 * ===================================================================================================== THE RUN FLOW
 * PLAY / SEND TONIGHT / a run goal / a landmark -> hooks.openRun({ destId?, personId? }) -> the run sheet (8.7.1):
 *   destinations, the runner strip (Engine.strip, cached odds; "…" until known), the runner card (Engine.runCard once
 *   the selected runner's odds are cached: HOME · DEATH, the fall cost (R15), the tired line, the danger hint), the
 *   kit toggles (opt-outs; their effects from Engine.kitDeltas), REST NOW (R7), "Sent to the game ›" (the handoff
 *   preview), GO at PLAY's rect ("RUN IT ANYWAY?" under 50 % needs a second tap within 3 s). With a run pending,
 *   openRun shows the run screen instead.
 * The odds queue (6.3.5): every frame oddsWork() walks oddsJobs() in order (the selected runner here, the rest of the
 *   strip, that runner's flipped kits and rested odds, then PLAY's oddsTodo) and computes the uncached ones with
 *   Engine.odds until the next one would pass 8 ms (one computation, 400 runs, is the smallest step; an estimate of
 *   its cost is kept). UI.oddsStats() reports what it did (computations, ms, the worst frame, the sheet fill times).
 * GO: act startRun (saved before anything moves) -> the sheet closes, iso.holdArrivals(true), iso.walkOut(runner,
 *   { follow, onGate }) -> at the gate (or 2.6 s) the screen fades to night: the run screen (6.4, 8.7.2) plays
 *   Engine.runSim(state) over lab.runScreenS (8 s): the dot, the events (wanderers, HORDE!, the gate, pills, medkit,
 *   noise bomb, SECOND WIND), the HP bar with temporary HP, kills; » jumps to the end. Then act resolveRun -> the
 *   result card (8.7.3): stats, loot rows counting up, XP and level pop, sparks, nickname, kit settlement, overflow,
 *   rest; on "Overrun." the beat (1.1 s of stats, then 1.5 s "Did Emre make it home?", instant with reduced motion),
 *   then the Hurt line or the revive offer (once). BACK TO TOWN (PLAY's rect) flies the loot into the chips (they held
 *   their old numbers: ui.inflight), releases the homecoming (sack, stretcher or limp; the bell rings twice when a
 *   winner reaches the gate) and keeps the gate in view. A reload during the run reopens the run screen on the same
 *   night. "Wait for a real result" (the Lab) shows the handoff on the run screen; a pasted result
 *   (labApi.resolveResult) or SIMULATE IT resolves it the same way.
 * The offer (8.8): one calm card; REVIVE (cans), REVIVE NOW (sparks), SAY GOODBYE; ✕, DECIDE LATER, Esc and closing
 *   the page are "decide later". SAY GOODBYE: act goodbye (the grave stands on its default spot) -> the bell tolls
 *   once, low -> grave move mode with LAY TO REST. The memorial card (8.9) opens from a grave, the roster or a Fallen
 *   person's card.
 *
 * ===================================================================================================== HOOKS FOR OTHERS
 * Sound (sfx.js, BH.Sfx; every call is guarded with "BH.Sfx &&"):
 *   BH.Sfx.unlock()            on the first pointerdown or keydown (creates the AudioContext; never before a gesture),
 *                              and again on the next pointerup / click (touch browsers only grant audio there), at most
 *                              4 calls: it must be idempotent (create once, resume() when suspended)
 *   BH.Sfx.setMuted(muted)     the City sheet's SOUND toggle and the Lab (state.ui.sound, saved with the game)
 *   BH.Sfx.play(cue, opts)     cues: 'tick' (UI tick) · 'collect' { step (0, 1, 2 ... rising along a pentatonic
 *     scale within a streak of collects), res } · 'place' (a thud and three hammer taps) · 'whirr' (a soft crane
 *     whirr: placement starts, a job starts) · 'finish' (a finish chime) · 'bell' { times: 1 | 2 | 3, low } (1:
 *     LET'S BEGIN, 2: a safe return, 3: a Tower level, low: a goodbye or an expired window) · the run screen:
 *     'drone' { on } (on at the start, off at the end), 'heartbeat' (one lub-dub every 0.9 s while HP is under 30 %),
 *     'horde' (HORDE!; { gate: true } at the gate), 'fallBeat' (the beat) · P1 extras: 'spark' (sparks earned),
 *     'levelUp', 'nickname' (the result card), 'revive', 'invite', 'expand' (the fence moves), 'rubble' (cleared),
 *     'deny' (a tap on something disabled, a refused action). Unknown cues must be ignored by sfx.js.
 * Lab (lab.js, BH.Lab): the LAB chip calls BH.Lab.open(api) after showing the #lab panel (a right panel; full screen
 *   below 640 px wide); BH.Lab.close() is called when the UI closes it (✕ in the Lab should call api.close()).
 *   api = UI.labApi: { el (the #lab element to render into), Engine, DATA, Art, fmt, getState() (the live state:
 *   read it, change it only through act / dev), view() (the latest Engine.view), act(action) -> result (events,
 *   save and redraw handled), dev(op, args) = act({ type: 'dev', op, ...args }), redraw(), save(), resetSave() (a new
 *   city; the Lab asks twice first), exportSave() -> string, importSave(str) -> { ok, status, notes } (validated
 *   by Engine.load; replaces the city), setTimeScale(x), reducedMotion: { get() -> true|false|null, set(v),
 *   effective() -> bool }, sound: { get() -> bool, set(on) }, skipAhead(ms) (through the offline path: shows the
 *   welcome card), showWelcome(w), replayOnboarding(), openDemo(), resolveResult(json) (paste a result: the run
 *   flow's hook), openOffer(personId) (the revive offer; a second call for the same person is skipped), kpis(),
 *   toast(text), close(), isDemo(), layout() -> { W, H, k, ... }, perf() -> { frames, avg, max, p95 } (ms of script
 *   per frame, the last 120 frames), on(name, fn): 'tick' (once a second while open), 'events' (every batch of engine
 *   events), 'close' }.
 *   The Lab may also call UI.hooks: openOffer(personId) (a dev kill opens it by itself), openPerson(id),
 *   openMemorial(graveId), openRun({ destId, personId }), openRunScreen(), openRoster(), resolveResult(json).
 * Tests and the Lab: UI.oddsStats() -> { computed, totalMs, avgMs, p95Ms, maxMs, maxFrameMs, framesWithWork,
 *   budgetMs, fills: [{ ms, computed, frames }] } · UI.run.sheet() (the run sheet's choices) · UI.run.screen().
 *
 * ===================================================================================================== DEVIATIONS
 * See the comments marked "Spec reading:" where the spec was ambiguous: the UI scale also looks at the width (so a
 * portrait phone is never scaled past its screen), compact numbers follow the compact top bar as well as < 700 px,
 * the Tower's tray card opens the City sheet, a tray card that cannot be afforded explains instead of entering
 * placement, the action bar sits at the goal chip's x between 640 and 760 px (and centred otherwise). People and runs:
 * the result card's BACK TO TOWN sits at PLAY's rect below a centred card (the 330 px card and a 60 px button cannot
 * both fit 390 px), the person card's CARD | HISTORY tabs sit in its footer, the run screen's kill counter is
 * interpolated (the result lists the total only), a run's loot lands in the chips when the card closes.
 * Integration: the result card puts the sparks (first clear / daily) on the loot row and a win's rest line as a plain
 * row, so the usual card fits 330 px at 844 and the 568 screen without scrolling; after a loss the card scrolls the
 * fall line into view. The camera returns, behind the night screens, to where it was before following the runner out.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).UI = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined') return {};
  const E = BH.Engine, D = BH.DATA, Art = BH.Art, Iso = BH.Iso, fmt = E.fmt;
  const KEY = 'bellhaven.v1', KEY_BAD = 'bellhaven.v1.bad', KEY_UPRIGHT = 'bellhaven.upright';
  const MIN = 60000, HOUR = 3600000;
  const RES = ['bricks', 'cans', 'sparks'];
  const RES_ICON = { bricks: 'brick', cans: 'can', sparks: 'spark' };
  const RES_WORD = { bricks: 'bricks', cans: 'cans', sparks: '✦' };
  const EXPL = D.TEXT.explainers;   // 13.3: build, collect, land, people, who goes, kit, down, inn, sparks
  const BLURB = {
    tower: 'Caps every other level. Opens buildings, land, places and cranes.', kiln: 'Makes bricks into its bubble.',
    cannery: 'Makes cans into its bubble.', depot: 'Raises the brick and can caps.', house: 'Beds for the people of Bellhaven.',
    clinic: 'Stretcher chance, faster rest, medkit and pills.', armory: 'The start weapon and damage of every runner.',
    inn: 'Travelers stop here. Invite one if a bed is free.',
  };
  const TYPE_ICON = { tower: 'tower', kiln: 'brick', cannery: 'can', depot: 'house', house: 'house', clinic: 'medkit', armory: 'bomb', inn: 'house' };

  // ---------------------------------------------------------------------------------------------- small helpers
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => performance.now();
  const ICONS = new Map();
  function ic(name, color) {
    const k = name + '|' + (color || '');
    let s = ICONS.get(k);
    if (s == null) { s = (Art && Art.iconSVG(name, 20, color ? { color } : undefined)) || ''; ICONS.set(k, s); }
    return s;
  }
  function data(o) { let s = ''; if (o) for (const k of Object.keys(o)) if (o[k] != null) s += ' data-' + k + '="' + esc(o[k]) + '"'; return s; }
  function btn(o) {
    const cls = 'btn' + (o.cls ? ' ' + o.cls : '') + (o.off ? ' off' : '') + (o.sub ? ' stack' : '');
    return '<button class="' + cls + '"' + (o.do ? ' data-do="' + o.do + '"' : '') + data(o.data) + (o.off ? ' aria-disabled="true"' : '') +
      (o.why ? ' data-why="' + esc(o.why) + '"' : '') + (o.primary ? ' data-primary="1"' : '') + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + '>' +
      (o.icon ? ic(o.icon, o.iconColor) : '') + (o.sub ? '<span>' + o.label + '</span><span class="sub">' + o.sub + '</span>' : (o.label || '')) + '</button>';
  }
  const pill = (text, cls) => '<span class="pill' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>';
  const escNb = (t) => esc(t).replace(/\b(Night|Lv|Tower) (\d+)/g, '$1&nbsp;$2');   // "Night 15" never breaks across lines
  function num(n) { return fmt.compact(n, ui.narrow); }
  function costChip(c, have) {
    if (!c) return '';
    const h = have == null ? (V ? V.res[c.res] : 0) : have, short = h < c.n;
    return '<span class="cchip' + (short ? ' short' : '') + '">' + ic(RES_ICON[c.res]) + fmt.num(c.n) + '</span>';
  }
  function needText(c) { const h = V.res[c.res]; return h < c.n ? 'Need ' + fmt.num(c.n - h) + ' more ' + RES_WORD[c.res] : null; }
  function needLine(c) { const t = c ? needText(c) : null; return t ? '<div class="need">' + esc(t) + '</div>' : ''; }
  const timeChip = (sec) => '<span class="cchip">' + ic('clock', '#a9aeb3') + esc(fmt.dur(sec)) + '</span>';
  const PORTRAITS = new Map();
  function portrait(look, size, grey, cls) {
    if (!look) return '';
    const k = JSON.stringify(look) + size + (grey ? 'g' : '');
    let u = PORTRAITS.get(k);
    if (u == null) { u = Art.portraitURL(look, size, { grey: !!grey }) || ''; PORTRAITS.set(k, u); }
    return '<img class="' + (cls || 'pimg') + '" alt="" src="' + u + '" width="' + size + '" height="' + size + '">';
  }
  function line(left, title, sub, right, o) {
    o = o || {};
    return '<div class="line"' + (o.k ? ' data-k="' + esc(o.k) + '"' : '') + '>' + (left || '') + '<div class="grow"><b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div>' + (right || '') + '</div>';
  }
  const bld = (id) => (V ? V.buildings.find((b) => b.id === id) : null) || null;
  const personV = (id) => (V ? V.people.find((p) => p.id === id) || (V.inn ? V.inn.travelers.find((p) => p.id === id) : null) || V.remembered.find((p) => p.id === id) : null) || null;
  const nameOf = (type) => (D.BUILDINGS[type] ? D.BUILDINGS[type].name : D.DECOR[type] ? D.DECOR[type].name : type);
  const theB = (type) => (type === 'tower' ? 'the Bell Tower' : type === 'inn' || type === 'clinic' || type === 'armory' ? 'the ' + nameOf(type) : 'a ' + nameOf(type));

  // morph(el, html): patch el's children to match html, keeping nodes whose tag (and data-k) did not change
  function morph(el, html) {
    if (!el || el.__html === html) return false;
    el.__html = html;
    const t = document.createElement('template'); t.innerHTML = html;
    patch(el, t.content);
    return true;
  }
  function patch(a, b) {
    const bn = Array.prototype.slice.call(b.childNodes);
    for (let i = 0; i < bn.length; i++) {
      const x = a.childNodes[i], y = bn[i];
      if (!x) { a.appendChild(y); continue; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || (x.nodeType === 1 && (x.getAttribute('data-k') || '') !== (y.getAttribute('data-k') || ''))) { a.replaceChild(y, x); continue; }
      if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      const xa = x.attributes, ya = y.attributes;
      for (let j = xa.length - 1; j >= 0; j--) { const n = xa[j].name; if (!y.hasAttribute(n)) x.removeAttribute(n); }
      for (let j = 0; j < ya.length; j++) { const n = ya[j].name, v = ya[j].value; if (x.getAttribute(n) !== v) x.setAttribute(n, v); }
      patch(x, y);
    }
    while (a.childNodes.length > bn.length) a.removeChild(a.lastChild);
  }

  // ---------------------------------------------------------------------------------------------- storage (11.2)
  const store = {
    ok: true, warned: false,
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { store.fail(); return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { store.fail(); return false; } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { store.fail(); } },
    fail() { store.ok = false; if (!store.warned) { store.warned = true; setTimeout(() => toast('Progress won’t be saved in this browser.', { keep: true, ms: 4000 }), 600); } },
  };

  // ---------------------------------------------------------------------------------------------- page state
  let S = null, V = null, iso = null;
  const Q = parseQuery();
  const ui = {
    demo: false, noSave: false, status: 'new', notes: [],
    sheet: null, overlay: null, queue: [], tray: false, mode: null, sel: null, lab: false,
    narrow: false, layout: {}, reduced: false, portrait: false, upright: false,
    confirm: null, disp: { bricks: 0, cans: 0, sparks: 0 }, inflight: { bricks: 0, cans: 0, sparks: 0 }, dispInit: false,
    lastTs: 0, lastView: 0, lastHud: 0, lastPanel: 0, lastSave: 0, lastCoach: 0, lastLabTick: 0,
    dirty: true, hudDirty: true, panelDirty: true, coach: null, goalPulse: null, streak: { n: 0, at: 0 },
    gestured: false, insetKey: '', meetTimer: null, booted: false, later: [],
  };
  const SHEETS = {}, OVERLAYS = {}, LISTENERS = {}, DO = {};
  const labSubs = { tick: [], events: [], close: [] };

  function parseQuery() {
    const q = {}; let sp;
    try { sp = new URLSearchParams(location.search); } catch (e) { return q; }
    const ins = sp.get('insets');
    if (ins) { const a = ins.split(',').map((x) => Math.max(0, +x || 0)); q.insets = { l: a[0] || 0, b: a[1] || 0, r: a[2] != null ? a[2] : a[0] || 0, t: a[3] || 0 }; }
    const seed = sp.get('seed'); if (seed != null && /^\d+$/.test(seed)) q.seed = +seed >>> 0;
    return q;
  }

  // ---------------------------------------------------------------------------------------------- layout (8.3, 8.14)
  function layout() {
    const W = window.innerWidth, H = window.innerHeight, root = document.documentElement;
    const cs = getComputedStyle($('probe'));
    let sl = parseFloat(cs.paddingLeft) || 0, sr = parseFloat(cs.paddingRight) || 0, sb = parseFloat(cs.paddingBottom) || 0, st = parseFloat(cs.paddingTop) || 0;
    if (Q.insets) { sl = Q.insets.l; sr = Q.insets.r; sb = Q.insets.b; st = Q.insets.t; }
    const portrait = H > W && W < 768;
    // Spec reading: 8.14 scales the UI by clamp(1, H / 390, 1.4); the width is also checked so a tall narrow window
    // (a phone held upright, a portrait desktop window) is never scaled past what its width can hold.
    const k = clamp(Math.min(H / 390, W / 844), 1, 1.4);
    const pad = W >= 667 ? 12 : 8, pl = Math.max(pad, sl), pr = Math.max(pad, sr), pb = Math.max(W >= 667 ? 8 : 6, sb);
    const usable = W - pl - pr;
    const tb = portrait || usable < 552 * k ? 'rows' : usable >= 740 * k ? 'wide' : 'compact';
    const pt = Math.max(W >= 667 ? 8 : 6, st);
    const bb = portrait || W < 640 * k ? 'compact' : W >= 760 * k ? 'wide' : 'mid';
    const topBottom = pt + (tb === 'rows' ? 92 : 44) * k;
    const sht = topBottom + (tb === 'wide' ? 8 : 6) * k;
    const shw = (bb === 'wide' ? 340 : 280) * k;
    const barH = (bb === 'compact' ? 52 : 60) * k, bw = W - pl - pr;
    let abl;
    if (bb === 'wide') abl = (60 * k + (bw - 236 * k)) / 2 - 176 * k;
    else if (bb === 'mid') abl = 68 * k;
    else abl = Math.max(56 * k, (52 * k + (bw - 168 * k)) / 2 - 153 * k);
    // Spec reading: compact numbers (2) below 700 px, and whenever the compact top bar is used (its chips are 96 px)
    ui.narrow = W < 700 || tb !== 'wide';
    ui.portrait = portrait;
    ui.layout = { W, H, k, pl, pr, pt, pb, sl, sr, sb, st, tb, bb, topBottom, sht, shw, barH, abl, portrait };
    const st2 = root.style;
    st2.setProperty('--k', k.toFixed(4)); st2.setProperty('--pl', pl + 'px'); st2.setProperty('--pr', pr + 'px');
    st2.setProperty('--pt', pt + 'px'); st2.setProperty('--pb', pb + 'px'); st2.setProperty('--sht', sht + 'px');
    st2.setProperty('--shw', shw + 'px'); st2.setProperty('--abl', abl + 'px');
    const cl = root.classList;
    for (const c of ['tb-wide', 'tb-compact', 'tb-rows', 'bb-wide', 'bb-mid', 'bb-compact']) cl.remove(c);
    cl.add('tb-' + tb); cl.add('bb-' + bb);
    cl.toggle('portrait', portrait);
    showRotate();
    applyInsets();
    ui.hudDirty = true; ui.panelDirty = true;
  }
  // The camera's clear view (8.1): the screen minus the top bar, the bottom bar (or the tray) and any right sheet.
  function applyInsets() {
    if (!iso) return;
    const L = ui.layout; if (!L.W) return;
    let right = 0, bottom = L.pb + L.barH;
    if (ui.sheet || ui.lab) {
      if (L.portrait) { const el = ui.lab ? $('lab') : $('sheet'); const r = el ? el.getBoundingClientRect() : null; bottom = r && r.height ? L.H - r.top : L.H * 0.62; }
      else { const el = ui.lab ? $('lab') : $('sheet'); const r = el ? el.getBoundingClientRect() : null; right = r && r.width ? L.W - r.left : L.shw + L.pr; }
    }
    if (ui.tray) { const r = $('tray').getBoundingClientRect(); if (r.height) bottom = Math.max(bottom, L.H - r.top); }
    if (L.portrait && ui.sel && !ui.sheet) bottom += 56 * L.k;
    const ins = { top: Math.round(L.topBottom), bottom: Math.round(bottom), left: Math.round(L.sl), right: Math.round(right), pad: Math.round(Math.max(L.pl, L.pr)) };
    const key = JSON.stringify(ins);
    if (key === ui.insetKey) return;
    ui.insetKey = key;
    iso.setInsets(ins);
  }
  function setClass(name, on) { document.documentElement.classList.toggle(name, !!on); }

  // ---------------------------------------------------------------------------------------------- reduced motion (8.17)
  let mql = null;
  function applyReduced() {
    const lab = S && S.lab ? S.lab.reducedMotion : null;
    ui.reduced = lab == null ? !!(mql && mql.matches) : !!lab;
    setClass('rm', ui.reduced);
    if (iso) iso.setReducedMotion(ui.reduced);
  }

  // ---------------------------------------------------------------------------------------------- sound hooks (sfx.js)
  function sfx(cue, o) {
    if (!S || !ui.gestured || (S.ui && S.ui.sound === false)) return;   // nothing before the first tap (8.16)
    try { if (BH.Sfx && BH.Sfx.play) BH.Sfx.play(cue, o || {}); } catch (e) { /* sound is optional */ }
  }
  // The first pointerdown or keydown creates the AudioContext (8.16). Touch browsers grant audio only on the
  // pointerup / click that follows, so unlock() is called again then (a few times at most; it must be idempotent).
  function unlockAudio() {
    ui.gestured = true;
    if (ui.unlocks >= 4) return;
    ui.unlocks = (ui.unlocks || 0) + 1;
    try {
      if (BH.Sfx && BH.Sfx.unlock) BH.Sfx.unlock();
      if (BH.Sfx && BH.Sfx.setMuted) BH.Sfx.setMuted(!!(S && S.ui && S.ui.sound === false));
    } catch (e) { /* no audio */ }
  }
  function setSound(on) {
    doAct({ type: 'setSound', on: !!on }, { quiet: true });
    try { if (BH.Sfx && BH.Sfx.setMuted) BH.Sfx.setMuted(!on); } catch (e) { /* optional */ }
    if (on) sfx('tick');
  }

  // ---------------------------------------------------------------------------------------------- acting
  function doAct(a, ctx) {
    ctx = ctx || {};
    if (!S) return { ok: false, err: 'state', events: [] };
    const before = { bricks: S.res.bricks, cans: S.res.cans, sparks: S.res.sparks };
    const r = E.act(S, a, Date.now());
    if (r.ok) save();
    handle(r.events, Object.assign({ act: a }, ctx));
    if (r.ok) for (const k of RES) { const d = before[k] - S.res[k]; if (d > 0 && !ctx.noMinus) minus(k, d); }
    if (!r.ok && !ctx.quiet) explain(r);
    refresh();
    return r;
  }
  function explain(r) {
    const d = r.data || {};
    const t = {
      cost: d.res ? 'Need ' + fmt.num(d.need) + ' more ' + RES_WORD[d.res] : 'Not enough',
      locked: d.needTower ? 'Needs Tower ' + d.needTower : d.item ? 'Not unlocked yet' : 'Locked',
      max: 'Already at the highest level', busy: 'A crane is already on it', beds: 'No free bed',
      blocked: d.reason === 'outside' ? 'Keep it inside the fence' : d.reason === 'gate' ? 'Keep the gate clear' : 'Something is in the way',
      pending: 'Tonight’s runner is still out', noCrane: 'Every crane is busy', confirm: 'Tap again to confirm',
    }[r.err] || 'Not possible right now';
    toast(t, { kind: 'bad' });
    sfx('deny');
  }
  function refresh() {
    if (!S) return;
    V = E.view(S); ui.lastView = now(); ui.dirty = false;
    if (iso) iso.setView(V);
    renderHud(); renderPanels();
  }

  // ---------------------------------------------------------------------------------------------- events -> juice, sound, cards
  function handle(evs, ctx) {
    if (!evs || !evs.length) return;
    ctx = ctx || {};
    let n = 0;
    for (const e of evs) {
      const fn = CORE[e.type];
      try { if (fn) fn(e, ctx); } catch (err) { console.error(err); }
      const ls = LISTENERS[e.type];
      if (ls) for (const l of ls) { try { l(e, ctx); } catch (err) { console.error(err); } }
      n++;
    }
    if (n) { ui.dirty = true; ui.panelDirty = true; }
    for (const f of labSubs.events) { try { f(evs, ctx); } catch (err) { console.error(err); } }
  }
  const nameFor = (id) => { const p = S ? S.people.find((x) => x.id === id) : null; return p ? p.first : 'Someone'; };
  const CORE = {
    collected(e, ctx) {
      if (e.n > 0) {
        const at = ctx.at || (iso ? iso.screenOf({ kind: 'bubble', id: e.buildingId }) : null);
        const t = now(); ui.streak.n = t - ui.streak.at < 2500 ? ui.streak.n + 1 : 0; ui.streak.at = t;
        sfx('collect', { step: ui.streak.n, res: e.res });
        fly(e.res, e.n, at);
      }
      if (e.overflow > 0) toast('Storage full: ' + fmt.num(e.overflow) + ' ' + e.res + ' stay in the bubble.', { icon: RES_ICON[e.res] });
      else if (e.n === 0 && S.res[e.res] >= E.caps(S)[e.res]) toast('Storage full. A Depot keeps more.', { icon: RES_ICON[e.res] });
    },
    jobStarted() { sfx('whirr'); },
    placed(e) { sfx('place'); if (e.decorId) toast(nameOf(e.buildingType) + ' placed.'); },
    jobDone(e, ctx) {
      if (e.buildingType === 'tower' || e.kind === 'expand') return;
      if (!ctx.offline) { sfx('finish'); cityFx(() => toast(e.kind === 'build' ? e.name + ' built.' : e.name + ' is level ' + e.lv + '.', { icon: 'check', kind: 'good' })); }
    },
    towerUp(e, ctx) {
      if (ctx.offline) return;                                  // the welcome card lists it (5.5)
      sfx('finish');
      if (e.sparks > 0) { const at = iso ? iso.screenOf({ kind: 'building', id: V ? V.tower.id : 'b1' }) : null; fly('sparks', e.sparks, at); }
      queueOverlay('tower', { lv: e.lv, opens: e.opens || [], sparks: e.sparks || 0 });
    },
    finale() { queueOverlay('finale', {}); },
    expanded(e, ctx) { if (!ctx.offline) { sfx('expand'); cityFx(() => toast('The fence moves out: land ' + e.side + ' × ' + e.side + '.', { icon: 'check', kind: 'good' })); } },
    rested(e, ctx) { if (!ctx.offline && !e.early && ctx.tick) cityFx(() => toast(nameFor(e.personId) + ' is rested.', { icon: 'people' })); },
    innRefresh(e, ctx) { if (!ctx.offline && ctx.tick) cityFx(() => toast(e.n + ' new traveler' + (e.n === 1 ? '' : 's') + ' at the Inn.', { icon: 'house' })); },
    stranger(e) { cityFx(() => toast('Someone lies Down at the gate.', { icon: 'heart', kind: 'bad', ms: 4000 })); },
    drifter(e) { cityFx(() => toast(nameFor(e.personId) + ' drifted in at the gate.', { icon: 'people' })); },
    deathOn() { if (S && !S.flags.deathCardSeen) queueOverlay('death', {}); },
    downExpired(e, ctx) { if (!ctx.offline) { sfx('bell', { times: 1, low: true }); if (iso) iso.ringBell(1, { low: true }); cityFx(() => toast(nameFor(e.personId) + '’s day ran out. ' + (e.where || ''), { icon: 'grave', ms: 4500 })); } },
    goal(e, ctx) {                                              // a run goal lands while the result card is up: after it
      const rw = e.reward || {};
      cityFx((held) => {
        toast('✓ ' + e.text + rewardText(rw), { kind: 'good' });
        const from = ctx.offline ? null : goalRect();
        for (const k of RES) if (rw[k] > 0) fly(k, rw[k], from, held);
      }, rw);
    },
    packClaimed(e, ctx) { fly('sparks', e.size, ctx.at || null); toast('+' + fmt.num(e.size) + ' ✦ · a free test pack', { icon: 'spark' }); },
    rubbleCleared(e) {
      if (e.sparks > 0) { const at = iso ? iso.tileToScreen(e.gx + 0.5, e.gy + 0.5, 18) : null; fly('sparks', e.sparks, at); sfx('spark'); toast('+' + e.sparks + ' ✦ hidden in the rubble', { icon: 'spark', kind: 'good' }); }
      else sfx('rubble');
    },
    craneBought() { sfx('finish'); toast('A 4th crane joins Bellhaven.', { icon: 'crane', kind: 'good' }); },
    offline(e) { if (e.welcome) queueOverlay('welcome', e.welcome); },
    invited(e) { cityFx(() => toast(nameFor(e.personId) + ' moves in.', { icon: 'people', kind: 'good' })); },
  };
  // City news raised while a card is open (a run goal reached as the result shows, a job done under the Tower card)
  // waits for the card to close: its toast would sit on the card's title and its flyer would cross the card. The chips
  // hold the old numbers meanwhile (holds: the amounts the deferred flyers will bring).
  function cityFx(fn, holds) {
    if (!ui.overlay) { fn(false); return; }
    if (holds) for (const k of RES) if (holds[k] > 0) ui.inflight[k] += holds[k];
    ui.later.push(fn);
  }
  function runLater() {
    if (ui.overlay || !ui.later.length) return;
    const q = ui.later; ui.later = [];
    q.forEach((fn, i) => setTimeout(() => { if (ui.overlay) { ui.later.push(fn); return; } try { fn(true); } catch (e) { console.error(e); } }, 350 + i * 450));
  }
  function rewardText(rw) { const p = []; for (const k of RES) if (rw[k] > 0) p.push('+' + fmt.num(rw[k]) + ' ' + RES_WORD[k]); return p.length ? ' · ' + p.join(' ') : ''; }

  // ---------------------------------------------------------------------------------------------- juice (8.16): flyers, chips, toasts
  function chipOf(res) { return res === 'bricks' ? $('cBricks') : res === 'cans' ? $('cCans') : $('cSparks'); }
  function fly(res, n, from, held) {
    const chip = chipOf(res);
    if (held && n > 0) ui.inflight[res] = Math.max(0, ui.inflight[res] - n);   // a deferred reward: counted again below
    if (!chip || !(n > 0)) return;
    if (ui.reduced || !from || document.hidden) { flash(res); return; }
    const r = chip.getBoundingClientRect(), k = ui.layout.k || 1;
    const to = { x: r.left + 18 * k, y: r.top + r.height / 2 };
    const count = n >= 200 ? 5 : n >= 50 ? 4 : n >= 10 ? 3 : 2, share = [];
    let left = n; for (let i = 0; i < count; i++) { const s = i === count - 1 ? left : Math.floor(n / count); share.push(s); left -= s; }
    ui.inflight[res] += n;
    const layer = $('fx'), dur = 450;
    for (let i = 0; i < count; i++) {
      const delay = i * 55, el = document.createElement('div'), inner = document.createElement('div');
      el.className = 'fly'; inner.innerHTML = Art.iconSVG(RES_ICON[res], 22) || '';
      el.appendChild(inner); layer.appendChild(el);
      const jx = (i - (count - 1) / 2) * 9 * k;
      const x0 = from.x + jx, y0 = from.y;
      el.style.transform = 'translate(' + x0 + 'px,' + y0 + 'px)';
      try {
        el.animate([{ transform: 'translate(' + x0 + 'px,' + y0 + 'px)' }, { transform: 'translate(' + to.x + 'px,' + y0 + 'px)' }], { duration: dur, delay, easing: 'cubic-bezier(.3,.1,.6,1)', fill: 'both' });
        inner.animate([{ transform: 'translateY(0) scale(.6)' }, { transform: 'translateY(' + (-26 * k) + 'px) scale(1.15)', offset: 0.25 }, { transform: 'translateY(' + (to.y - y0) + 'px) scale(.8)' }],
          { duration: dur, delay, easing: 'cubic-bezier(.45,0,.8,.6)', fill: 'both' });
      } catch (err) { /* no Web Animations: the number still lands */ }
      setTimeout(() => { el.remove(); ui.inflight[res] = Math.max(0, ui.inflight[res] - share[i]); gulp(res); }, delay + dur);
    }
  }
  function gulp(res) {
    const chip = chipOf(res); if (!chip) return;
    if (ui.reduced) { flash(res); return; }
    chip.classList.remove('gulp'); void chip.offsetWidth; chip.classList.add('gulp');
  }
  function flash(res) {
    const chip = chipOf(res); if (!chip) return;
    chip.classList.add('flash'); clearTimeout(chip.__ft); chip.__ft = setTimeout(() => chip.classList.remove('flash'), 380);
  }
  function minus(res, n) {
    const chip = chipOf(res); if (!chip) return;
    if (ui.reduced) { flash(res); return; }
    const m = document.createElement('span'); m.className = 'minus'; m.textContent = '−' + fmt.compact(n, true);
    chip.appendChild(m); setTimeout(() => m.remove(), 950);
  }
  function animChips(dt) {
    if (!V) return;
    if (!ui.dispInit) { for (const k of RES) ui.disp[k] = V.res[k]; ui.dispInit = true; }
    let changed = false;
    for (const k of RES) {
      const target = Math.max(0, V.res[k] - ui.inflight[k]);
      let d = ui.disp[k];
      if (d === target) continue;
      if (ui.reduced) d = target;
      else { const step = Math.max(1, Math.abs(target - d) * Math.min(1, dt / 140)); d = d < target ? Math.min(target, d + step) : Math.max(target, d - step); }
      ui.disp[k] = d; changed = true;
    }
    if (changed) renderChips();
  }
  function toast(text, o) {
    o = o || {};
    const box = $('toasts'); if (!box) return;
    for (const c of box.children) if (c.__text === text && !c.classList.contains('out')) { clearTimeout(c.__t); c.__t = setTimeout(() => dropToast(c), o.ms || 2500); return; }
    const el = document.createElement('div');
    el.className = 'toast' + (o.kind ? ' ' + o.kind : ''); el.__text = text; el.__keep = !!o.keep;
    el.innerHTML = (o.icon ? ic(o.icon) : '') + '<span>' + esc(text) + '</span>';
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    el.__t = setTimeout(() => dropToast(el), o.ms || 2500);
  }
  function dropToast(el) { el.classList.add('out'); setTimeout(() => el.remove(), ui.reduced ? 0 : 320); }
  // a card that opens takes the screen: the toasts about what happened before it go (they sit over the card's title
  // otherwise); the storage notices stay (keep). Toasts raised while the card is up show as usual.
  function clearToasts() { const box = $('toasts'); if (box) for (const c of Array.prototype.slice.call(box.children)) if (!c.__keep && !c.classList.contains('out')) { clearTimeout(c.__t); dropToast(c); } }
  let hintT = null;
  function hint(text, ms) {
    const el = $('hint'); el.textContent = text; el.hidden = false; setClass('has-hint', true);
    clearTimeout(hintT); hintT = setTimeout(hideHint, ms || 4000);
  }
  function hideHint() { clearTimeout(hintT); const el = $('hint'); if (el) el.hidden = true; setClass('has-hint', false); }
  function goalRect() { const r = $('goal').getBoundingClientRect(); return r.width ? { x: r.left + 24 * (ui.layout.k || 1), y: r.top + r.height / 2 } : { x: 90, y: ui.layout.H - 40 }; }

  // ---------------------------------------------------------------------------------------------- the HUD (8.3)
  function renderHud() {
    if (!V) return;
    renderChips(); renderBottom();
    ui.lastHud = now(); ui.hudDirty = false;
  }
  // a chip whose text no longer fits gets .t1, then .t2 (smaller numbers); measured only when its text length changes
  function fitChip(el) {
    const len = el.textContent.length + '|' + ui.layout.W + ui.layout.tb;
    if (el.__fit === len) return;
    el.__fit = len;
    const n = el.querySelector('.n') || el.querySelector('b');
    const over = () => el.scrollWidth > el.clientWidth + 0.5 || (n && n.scrollWidth > n.clientWidth + 0.5);
    el.classList.remove('t1', 't2');
    if (!over()) return;
    el.classList.add('t1');
    if (!over()) return;
    el.classList.remove('t1'); el.classList.add('t2');
  }
  function renderChips() {
    const v = V, L = ui.layout;
    morph($('back'), ic('back'));
    morph($('cTower'), ic('tower') + '<span class="tl"><small>TOWER</small><b>' + v.tower.lv + '</b></span>');
    for (const res of ['bricks', 'cans']) {
      const el = chipOf(res), cap = v.caps[res], d = Math.round(ui.disp[res]);
      morph(el, ic(RES_ICON[res]) + '<span class="n"><b>' + num(d) + '</b><small>' + (L.tb === 'wide' ? '/ ' : '/') + num(cap) + '</small></span>' +
        '<i class="cap"><i style="width:' + (cap ? Math.min(100, d / cap * 100).toFixed(1) : 0) + '%"></i></i>');
      el.classList.toggle('full', d >= cap);
      if (res === 'cans') el.classList.toggle('over', v.res.cans > cap);
      el.setAttribute('aria-label', fmt.num(v.res[res]) + ' of ' + fmt.num(cap) + ' ' + res);
    }
    morph($('cSparks'), ic('spark') + '<b>' + num(Math.round(ui.disp.sparks)) + '</b><span class="plus">' + ic('plus', '#12161c') + '</span>');
    $('cSparks').setAttribute('aria-label', fmt.num(v.res.sparks) + ' sparks, and the free test packs');
    morph($('cCranes'), ic('crane', '#f5c25a') + '<b>' + v.cranes.free + '/' + v.cranes.total + '</b>');
    $('cCranes').setAttribute('aria-label', v.cranes.free + ' of ' + v.cranes.total + ' cranes free');
    morph($('cPeople'), ic('people') + '<b>' + v.chips.people.living + '/' + v.chips.people.beds + '</b><i class="dot"></i>');
    $('cPeople').classList.toggle('down', !!v.chips.people.down);
    morph($('cLab'), ic('flask', '#a9aeb3') + '<span>LAB</span>');
    fitChip(chipOf('bricks')); fitChip(chipOf('cans')); fitChip(chipOf('sparks'));
    $('cTower').classList.toggle('pulse', ui.coach && ui.coach.dom === 'cTower');
  }
  function renderBottom() {
    const v = V, m = ui.mode, L = ui.layout;
    // BUILD (8.5: BUILD becomes ✕ CANCEL in placement and move mode)
    const b = $('bBuild');
    if (m) {
      const canCancel = !(m.labels && m.labels.cancel === null);
      morph(b, canCancel ? ic('close') + '<span>CANCEL</span>' : '');
      b.style.visibility = canCancel ? '' : 'hidden';
      b.className = 'bbtn cancel'; b.setAttribute('aria-label', 'Cancel');
    } else {
      const n = v.chips.build.affordable;
      morph(b, ic('hammer') + '<span>BUILD</span>' + (n > 0 ? '<i class="badge">' + n + '</i>' : ''));
      b.style.visibility = '';
      b.className = 'bbtn' + (ui.coach && ui.coach.dom === 'bBuild' ? ' pulse' : ''); b.setAttribute('aria-label', 'Build' + (n ? ', ' + n + ' affordable' : ''));
    }
    renderGoal(); renderPlay(); renderAbar();
  }
  function renderGoal() {
    const g = V.goal, el = $('goal');
    let eta = g.eta || '';
    if (!g.done && g.reward) { const rw = rewardText(g.reward); if (rw) eta += (eta ? ' · ' : '') + rw.slice(3); }
    if (g.side) eta += ' · ' + g.side.text;
    morph(el, ic('flag', '#ff7a2f') + '<span class="gt">' + esc(g.text) + '</span><span class="ge">' + esc(eta) + '</span><i class="bar"><i style="width:' + Math.round((g.progress || 0) * 100) + '%"></i></i>');
    el.classList.toggle('done', !!g.done);
    el.setAttribute('aria-label', 'Goal: ' + g.text + (g.eta ? ', ' + g.eta : ''));
  }
  function renderPlay() {
    const el = $('play'), v = V, m = ui.mode, compact = ui.layout.bb === 'compact';
    let cls = '', html = '', aria = 'Who goes tonight?';
    if (m) {
      const lab = m.labels || {};
      if (m.kind === 'place') {
        if (m.valid) { cls = 'place mode'; html = '<span class="tx"><span class="t1">' + (compact ? '✓ PLACE' : '✓ PLACE · <span class="cost">' + fmt.num(m.cost.n) + ' ' + ic(RES_ICON[m.cost.res]) + '</span>') + '</span>' + (compact ? '<span class="t2"><span class="cost">' + fmt.num(m.cost.n) + ' ' + ic(RES_ICON[m.cost.res]) + '</span></span>' : '') + '</span>'; aria = 'Place for ' + m.cost.n + ' ' + m.cost.res; }
        else { cls = 'blocked mode'; html = '<span class="tx"><span class="t1">BLOCKED</span></span>'; aria = 'Blocked'; }
      } else {
        if (m.valid) { cls = 'done mode'; html = '<span class="tx"><span class="t1">' + esc(lab.ok || '✓ DONE') + '</span></span>'; aria = lab.ok || 'Done'; }
        else { cls = 'blocked mode'; html = '<span class="tx"><span class="t1">BLOCKED</span></span>'; aria = 'Blocked'; }
      }
      if (ui.coach && ui.coach.dom === 'play' && m.valid) cls += ' pulse';
    } else if (v.pending) {
      cls = 'out';
      const p = personV(v.pending.personId);
      html = '<span class="pt">' + (p ? portrait(p.look, compact ? 32 : 44) : '<i class="ph"></i>') + '</span><span class="tx"><span class="t1">NIGHT ' + v.pending.night + '</span><span class="t2">' +
        esc((p ? p.first : 'The runner') + ' is out · ' + v.pending.destName) + '</span></span>';
      aria = 'Night ' + v.pending.night + ': the runner is out';
    } else if (!v.play) {
      html = '<span class="pt"><i class="ph"></i></span><span class="tx"><span class="t1">' + (compact ? 'WHO GOES?' : 'WHO GOES TONIGHT?') + '</span><span class="t2">Nobody can go right now</span></span>';
    } else {
      const p = v.play, red = p.deathRed;
      const homeT = p.homeText, deathT = p.deathText == null ? '…' : p.deathText;
      if (compact) {
        html = '<span class="pt">' + portrait(p.look, 32) + (p.hpText ? '<span class="hp">' + esc(p.hpText) + '</span>' : '') + '</span><span class="tx"><span class="t1">WHO GOES?</span><span class="t2">' +
          (red ? '<b>' + esc(homeT) + '</b> · <b class="red">' + esc(deathT) + '</b>' : esc(p.first) + ' · <b>' + esc(homeT) + '</b>') + '</span></span>';
      } else {
        html = '<span class="pt">' + portrait(p.look, 44) + (p.hpText ? '<span class="hp">' + esc(p.hpText) + '</span>' : '') + '</span><span class="tx"><span class="t1">WHO GOES TONIGHT?</span>' +
          '<span class="t2">' + esc(p.label) + '</span><span class="t3"><span class="h">HOME ' + esc(homeT) + '</span> · <span class="d' + (red ? ' red' : '') + '">DEATH ' + esc(deathT) + '</span></span></span>';
      }
      if (p.dailyTag) html += '<span class="tag">' + esc(p.dailyTag) + '</span>';
      aria = 'Who goes tonight? ' + p.label + ', home ' + homeT + ', death ' + deathT;
      if (ui.coach && ui.coach.dom === 'play') cls += ' pulse';
    }
    el.className = cls;
    morph(el, html);
    el.setAttribute('aria-label', aria);
    const blocked = !!m && !m.valid;                           // BLOCKED is disabled; a tap says why
    if (blocked) { el.setAttribute('aria-disabled', 'true'); el.dataset.why = m.reason === 'outside' ? 'Keep it inside the fence' : m.reason === 'gate' ? 'Keep the gate clear' : 'Something is in the way'; }
    else { el.removeAttribute('aria-disabled'); delete el.dataset.why; }
  }
  // The action bar (8.4): the selection's name and level, then up to 4 round buttons.
  function rb(o) {
    return '<button class="rb' + (o.cls ? ' ' + o.cls : '') + (o.off ? ' off' : '') + (o.pulse ? ' pulse' : '') + '" data-do="' + o.do + '"' + data(o.data) + (o.off ? ' aria-disabled="true"' : '') +
      (o.why ? ' data-why="' + esc(o.why) + '"' : '') + ' aria-label="' + esc(o.aria || o.label) + '">' + ic(o.icon, o.iconColor) + '<span class="c">' + o.label + '</span></button>';
  }
  function renderAbar() {
    const el = $('abar'), t = ui.sel;
    const show = !!t && !ui.mode && !ui.sheet && !ui.tray;
    setClass('sel', show);
    if (!show) { morph(el, ''); return; }
    let label = '', sub = '', buttons = '';
    const c = ui.coach || {};
    const gone = () => { ui.sel = null; setClass('sel', false); morph(el, ''); };   // the selection no longer exists
    if (t.kind === 'building') {
      const b = bld(t.id); if (!b) { gone(); return; }
      const j = b.job, n = b.next;
      label = b.building ? b.name.toUpperCase() : b.label;
      if (j) sub = (j.kind === 'build' ? 'Building' : '→ LV ' + j.toLv) + ' · ' + fmt.clock(j.leftMs / 1000);
      else if (n) sub = n.needTower ? 'Next: needs Tower ' + n.needTower : '→ LV ' + n.lv + ' · ' + fmt.dur(n.timeS);
      else sub = b.type === 'tower' && b.lv >= 10 ? 'The gold bell' : 'Max level';
      buttons += rb({ do: 'info', icon: 'info', label: 'INFO', aria: 'Details' });
      if (j) buttons += rb({ do: 'finish', data: { job: j.id }, icon: 'finish', iconColor: j.free ? '#12161c' : null, cls: j.free ? 'free' : skipConfirming('job:' + j.id) ? 'confirm' : 'spk',
        label: j.free ? 'FREE' : j.price + ' ✦' + (skipConfirming('job:' + j.id) ? '?' : ''), aria: j.label, pulse: c.abar === 'finish' && c.sel === b.id });
      else if (n) {
        const why = n.needTower ? 'Needs Tower ' + n.needTower : n.err === 'cost' ? needText(n.cost) : null;
        buttons += rb({ do: 'upgrade', data: { id: b.id }, icon: n.needTower ? 'lock' : 'up', iconColor: n.needTower ? '#a9aeb3' : null, cls: (n.ok || n.err === 'noCrane' ? 'go' : '') + (n.err === 'cost' ? ' short' : ''),
          label: n.needTower ? 'TOWER ' + n.needTower : ic(RES_ICON[n.cost.res]) + num(n.cost.n), off: !!n.needTower, why,
          aria: n.needTower ? 'Needs Tower ' + n.needTower : 'Upgrade for ' + n.cost.n + ' ' + n.cost.res, pulse: c.abar === 'upgrade' && c.sel === b.id && n.ok });
      } else buttons += rb({ do: 'info', icon: 'star', label: 'MAX', off: true, why: 'Already at the highest level', aria: 'Max level' });
      buttons += rb({ do: 'move', icon: 'move', label: 'MOVE', aria: 'Move' });
      if (b.bubble && b.bubble.whole >= 1 && !j) buttons += rb({ do: 'collect', data: { id: b.id }, icon: RES_ICON[b.bubble.res], cls: 'col', label: num(b.bubble.whole), aria: 'Collect ' + b.bubble.whole + ' ' + b.bubble.res });
      else if (b.bubble && b.bubble.whole >= 1 && j) buttons += rb({ do: 'collect', data: { id: b.id }, icon: RES_ICON[b.bubble.res], cls: 'col', label: num(b.bubble.whole), aria: 'Collect' });
      // 6.6.3: the Clinic's red pill (or a House's lantern) is one tap from the revive offer
      const dn = b.type === 'clinic' || b.type === 'house' ? V.people.find((q) => q.state === 'down' && (b.type === 'clinic' ? q.where === 'clinic' : q.where === 'house' && q.houseId === b.id)) : null;
      if (dn) buttons += rb({ do: 'decide', data: { id: dn.id }, icon: 'heart', cls: 'go', label: 'DECIDE', aria: 'Decide about ' + dn.first });
    } else if (t.kind === 'grave') {
      const g = V.graves.find((x) => x.id === t.id); if (!g) { gone(); return; }
      label = 'GRAVE · ' + g.first.toUpperCase(); sub = 'Remembered';
      buttons += rb({ do: 'info', icon: 'grave', label: 'CARD', aria: 'Memorial card' }) + rb({ do: 'move', icon: 'move', label: 'MOVE', aria: 'Move' });
    } else if (t.kind === 'decor') {
      const dc = V.decor.find((x) => x.id === t.id); if (!dc) { gone(); return; }
      label = nameOf(dc.type).toUpperCase(); sub = 'Decoration';
      buttons += rb({ do: 'move', icon: 'move', label: 'MOVE', aria: 'Move' });
    } else if (t.kind === 'rubble') {
      const r = V.rubble.find((x) => x.id === t.id); if (!r) { gone(); return; }
      label = 'RUBBLE'; sub = r.glint ? 'Something glints in it' : 'Clearing is instant';
      buttons += rb({ do: 'clear', data: { id: r.id }, icon: 'hammer', cls: r.ok ? 'go' : 'short', label: ic('brick') + num(r.cost.n), aria: 'Clear for ' + r.cost.n + ' bricks' });
    } else if (t.kind === 'person') {
      const p = personV(t.id); if (!p) { gone(); return; }
      label = p.first.toUpperCase() + ' · LV ' + p.lv; sub = p.roleName + ' · ' + p.pill;
      buttons += rb({ do: 'info', icon: 'info', label: 'CARD', aria: 'Person card' });
      if (p.canRun) buttons += rb({ do: 'send', data: { id: p.id }, icon: 'flag', cls: 'go', label: 'SEND', aria: 'Send tonight' });
      if (p.state === 'rest') {                                   // REST NOW (5.6) one tap away, like a building's FINISH: the goal
        const pr = E.price.skip(p.restLeftMs / 1000, S), k = 'rest:' + p.id, conf = skipConfirming(k);   // chip's "Finish something with sparks" lands here
        buttons += rb({ do: 'restNow', data: { id: p.id }, icon: 'finish', iconColor: pr === 0 ? '#12161c' : null, cls: pr === 0 ? 'free' : conf ? 'confirm' : 'spk',
          label: pr === 0 ? 'FREE' : pr + ' ✦' + (conf ? '?' : ''), aria: pr === 0 ? 'Rest now, free' : 'Rest now for ' + pr + ' sparks', pulse: c.abar === 'rest' && c.sel === p.id });
      }
      if (p.state === 'down') buttons += rb({ do: 'decide', data: { id: p.id }, icon: 'heart', cls: 'go', label: 'DECIDE', aria: 'Decide' });
    }
    morph(el, '<div class="al"><b>' + esc(label) + '</b><span>' + esc(sub) + '</span></div>' + buttons);
  }

  // ---------------------------------------------------------------------------------------------- the skip button and its confirm (5.6)
  const skipConfirming = (key) => !!(ui.confirm && ui.confirm.key === key && Date.now() < ui.confirm.until);
  function skipBtn(key, price, doName, d, verb, o) {
    o = o || {};
    verb = verb || 'FINISH';
    if (price === 0) return btn({ do: doName, data: d, cls: 'good' + (o.main ? ' main' : ''), label: verb + ' FREE', primary: o.primary, icon: o.main ? null : 'finish', iconColor: '#12161c' });
    const conf = skipConfirming(key);
    return btn({ do: doName, data: d, cls: 'spark' + (conf ? ' confirm' : '') + (o.main ? ' main' : ''), primary: o.primary,
      label: conf ? (verb === 'FINISH' ? 'FINISH NOW' : verb) + ' · ' + price + ' ✦?' : verb + ' · ' + price + ' ✦', sub: o.sub });
  }
  function skipAct(key, action) {
    const conf = skipConfirming(key);
    const r = doAct(Object.assign({}, action, conf ? { confirm: true } : {}), { quiet: true });
    if (r.ok) { ui.confirm = null; return r; }
    if (r.err === 'confirm') {
      ui.confirm = { key, until: Date.now() + 3000 }; sfx('tick');
      ui.panelDirty = true; renderPanels(); renderAbar();
      setTimeout(() => { ui.panelDirty = true; ui.hudDirty = true; }, 3050);
      return r;
    }
    explain(r); return r;
  }

  // ---------------------------------------------------------------------------------------------- sheets (8.4, 8.11, 8.12; one at a time)
  function openSheet(kind, args) {
    if (!SHEETS[kind]) return;
    if (ui.mode) cancelMode();
    if (ui.tray) closeTray(true);
    if (ui.lab) closeLab();
    ui.sheet = { kind, args: args || {} };
    const def = SHEETS[kind], subj = def.subject ? def.subject(ui.sheet.args) : null;
    $('sheet').__html = null;
    setClass('sheet-open', true);
    if (subj && iso) { ui.sel = subj; iso.select(subj, { focus: false, bounce: false }); }
    renderSheet(); renderAbar(); renderBottom();
    applyInsets();
    if (subj && iso) iso.focus(subj, { ease: true });
    sfx('tick');
  }
  function closeSheet(keepSel) {
    if (!ui.sheet) return;
    const def = SHEETS[ui.sheet.kind];
    if (def && def.subject && !keepSel) { ui.sel = null; if (iso) iso.select(null); }
    ui.sheet = null; setClass('sheet-open', false);
    morph($('sheet'), '');
    applyInsets(); renderAbar(); renderBottom();
  }
  function renderSheet() {
    if (!ui.sheet || !V) return;
    const def = SHEETS[ui.sheet.kind], a = ui.sheet.args;
    let head = '', body = '', foot = '';
    try { head = def.head(V, a); body = def.body(V, a); foot = def.foot ? def.foot(V, a) : ''; } catch (e) { console.error(e); }
    if (head == null) { closeSheet(); return; }
    morph($('sheet'), '<div class="sh-head">' + head + '<button class="xbtn" data-do="closeSheet" aria-label="Close">' + ic('close') + '</button></div><div class="sh-body">' + body + '</div>' +
      (foot ? '<div class="sh-foot">' + foot + '</div>' : ''));
  }
  // ---------------------------------------------------------------------------------------------- overlays (full screen; queue)
  function openOverlay(kind, args) {
    if (!OVERLAYS[kind]) return;
    if (ui.overlay) ui.queue.unshift(ui.overlay);
    showOverlayNow({ kind, args: args || {} });
  }
  function queueOverlay(kind, args) {
    if (!OVERLAYS[kind]) return;
    if (!ui.overlay && ui.booted) showOverlayNow({ kind, args: args || {} });
    else ui.queue.push({ kind, args: args || {} });
  }
  function showOverlayNow(o) {
    if (ui.mode && o.kind !== 'crane') cancelMode();
    if (ui.tray) closeTray(true);
    ui.overlay = o;
    clearToasts();
    const def = OVERLAYS[o.kind], el = $('overlay');
    el.__html = null; el.className = def.dark ? 'dark' : '';
    setClass('ov-open', true); setClass('ov-dark', !!def.dark);
    if (iso) iso.setInteractive(false);
    if (def.onOpen) { try { def.onOpen(o.args); } catch (e) { console.error(e); } }
    renderOverlay();
  }
  function closeOverlay(kind) {                                // kind: close only if that overlay is the one showing
    const o = ui.overlay; if (!o || (typeof kind === 'string' && o.kind !== kind)) return;
    const def = OVERLAYS[o.kind];
    ui.overlay = null;
    if (def && def.onClose) { try { def.onClose(o.args); } catch (e) { console.error(e); } }
    if (ui.overlay) return;                                 // onClose opened the next one
    const next = ui.queue.shift();
    if (next) { showOverlayNow(next); return; }
    morph($('overlay'), ''); setClass('ov-open', false); setClass('ov-dark', false);
    if (iso) iso.setInteractive(true);
    renderHud();
    runLater();
  }
  function renderOverlay() {
    if (!ui.overlay || !V) return;
    const def = OVERLAYS[ui.overlay.kind];
    let html = '';
    try { html = def.render(V, ui.overlay.args); } catch (e) { console.error(e); }
    if (html == null) { closeOverlay(); return; }
    morph($('overlay'), html);
  }
  function renderPanels() {
    renderSheet(); renderOverlay(); renderTray();
    ui.lastPanel = now(); ui.panelDirty = false;
  }

  // ---------------------------------------------------------------------------------------------- the building sheet (8.4)
  function rowsHtml(rows, max) {
    if (!rows || !rows.length) return '';
    let s = '<div class="rows">';
    for (const r of rows) {
      const same = max || String(r.from) === String(r.to);
      s += '<span class="k">' + (r.run ? '<span class="run">RUN</span>' : '') + esc(r.label) + '</span><span class="v">' + esc(r.from) + (same ? '' : ' → <span class="to">' + esc(r.to) + '</span>') + '</span>';
    }
    return s + '</div>';
  }
  function jobBlock(j) {
    if (!j) return '';
    return '<div class="timer">' + ic('crane', '#f5c25a') + '<div class="grow" style="flex:1"><b>' + fmt.clock(j.leftMs / 1000) + '</b> <span>' + esc(j.kind === 'build' ? 'until built' : j.kind === 'expand' ? 'until the fence moves' : 'until level ' + j.toLv) + '</span>' +
      '<div class="pbar"><i style="width:' + Math.round(j.progress * 100) + '%"></i></div></div></div>';
  }
  function mainFoot(b, info) {
    const j = b.job, n = b.next, c = ui.coach || {};
    if (j) {
      const note = '<span class="note"><b>' + fmt.clock(j.leftMs / 1000) + '</b>' + (j.free ? 'free under a minute' : j.confirm ? 'asks twice' : 'skip with sparks') + '</span>';
      return note + skipBtn('job:' + j.id, j.price, 'finish', { job: j.id }, 'FINISH', { main: true, primary: true });
    }
    if (!n) return '<span class="note">' + (b.type === 'tower' ? 'Bellhaven is whole.' : 'The highest level.') + '</span>' + btn({ cls: 'main off', label: 'MAX LEVEL', off: true, why: 'Already at the highest level', do: 'noop' });
    if (n.needTower) return '<span class="note">Level ' + n.lv + ' needs the Bell Tower at ' + n.needTower + '.</span>' + btn({ cls: 'main off', label: 'NEEDS TOWER ' + n.needTower, off: true, why: 'Needs Tower ' + n.needTower, do: 'noop' });
    const short = n.err === 'cost';
    return '<span class="note"><b>LV ' + b.lv + ' → ' + n.lv + '</b>' + esc(fmt.dur(n.timeS)) + '</span>' +
      btn({ do: 'upgrade', data: { id: b.id }, cls: 'primary main' + (short ? ' off' : '') + (c.sheetMain && c.sel === b.id && n.ok ? ' pulse' : ''), primary: true, why: short ? needText(n.cost) : null,
        label: 'UPGRADE', sub: fmt.num(n.cost.n) + ' ' + RES_WORD[n.cost.res] + ' · ' + fmt.dur(n.timeS) });
  }
  function bubbleBlock(b) {
    const bb = b.bubble; if (!bb) return '';
    const rate = V.rates[bb.res] > 0 ? (b.type === 'kiln' ? D.BUILDINGS.kiln.rate[b.lv] : D.BUILDINGS.cannery.rate[b.lv]) * S.lab.mul.prod : 0;
    const left = bb.hold - bb.amount, eta = rate > 0 && left > 0 ? fmt.dur(left / rate * 3600) : null;
    return line('<span class="ic" style="width:auto">' + ic(RES_ICON[bb.res]) + '</span>', fmt.num(bb.whole) + ' / ' + fmt.num(bb.hold) + ' ' + bb.res + ' waiting',
      bb.full ? 'Full: collect it to keep it filling' : eta ? 'Full in ' + esc(eta) : 'Filling', bb.whole >= 1 ? btn({ do: 'collect', data: { id: b.id }, cls: 'light', label: 'COLLECT' }) : '');
  }
  SHEETS.building = {
    subject: (a) => ({ kind: 'building', id: a.id }),
    head(v, a) {
      const b = bld(a.id); if (!b) return null;
      return '<div class="sh-title">' + esc(b.building ? b.name.toUpperCase() + ' · BEING BUILT' : b.label) + '<small>' + esc(BLURB[b.type] || '') + '</small></div><button class="xbtn" data-do="move" data-id="' + b.id + '" aria-label="Move">' + ic('move') + '</button>';
    },
    body(v, a) {
      const b = bld(a.id); if (!b) return '';
      const inf = E.info(S, b.id); let s = '';
      if (b.job) s += jobBlock(b.job);
      if (b.bubble) s += bubbleBlock(b);
      if (b.type === 'house' && b.house) s += houseBlock(b);
      if (b.type === 'clinic') s += clinicBlock(b);
      if (b.type === 'inn') s += innBlock(b);
      if (b.type === 'depot') s += '<div class="rows" style="margin-bottom:8px"><span class="k">Caps now</span><span class="v">' + fmt.num(v.caps.bricks) + ' ' + ic('brick') + '  ' + fmt.num(v.caps.cans) + ' ' + ic('can') + '</span></div>';
      const max = !b.next;
      s += '<div class="sec">' + (max ? 'At level ' + b.lv : b.building ? 'Level 1' : 'Level ' + b.lv + ' → ' + (b.lv + 1)) + '</div>' + rowsHtml(inf ? inf.rows : [], max);
      if (b.next && !b.job) {
        s += '<div class="costs">' + costChip(b.next.cost) + timeChip(b.next.timeS) + (b.next.needTower ? pill('Needs Tower ' + b.next.needTower, 'warm') : '') + '</div>';
        s += needLine(b.next.cost);
        if (b.next.err === 'noCrane') s += '<div class="need" style="color:var(--timer)">Every crane is busy: upgrading offers to finish a job first.</div>';
      }
      const ex = b.type === 'kiln' || b.type === 'cannery' || b.type === 'depot' ? EXPL[1] : b.type === 'house' ? EXPL[3] : b.type === 'clinic' ? EXPL[6] : b.type === 'armory' ? EXPL[5] : b.type === 'inn' ? EXPL[7] : EXPL[0];
      s += '<p class="expl">' + esc(ex) + '</p>';
      return s;
    },
    foot(v, a) { const b = bld(a.id); return b ? mainFoot(b) : ''; },
  };
  function houseBlock(b) {
    const res = b.house.residents.map((id) => personV(id)).filter(Boolean);
    let s = '<div class="sec">Beds ' + res.length + '/' + b.house.beds + ' · the ' + b.house.color + ' House</div>';
    if (!res.length) s += '<p class="expl">Nobody sleeps here yet.</p>';
    for (const p of res) s += line(portrait(p.look, 40, p.state === 'down'), esc(p.fullName), esc('Lv ' + p.lv + ' · ' + p.roleName), pill(p.pill, p.state === 'down' ? 'red' : p.state === 'ready' ? 'good' : 'warm') +
      btn({ do: 'person', data: { id: p.id }, cls: 'ghost icon', icon: 'info', aria: 'Card of ' + p.first }), { k: p.id });
    return s;
  }
  function clinicBlock(b) {
    const down = V.people.filter((p) => p.state === 'down' && p.where === 'clinic'), rec = V.people.filter((p) => p.state === 'rest' && p.restKind === 'recovering');
    let s = '';
    if (down.length) { s += '<div class="sec">Down</div>'; for (const p of down) s += line(portrait(p.look, 40, true), esc(p.first + ' ' + p.last), esc(fmt.hoursLeft(p.downLeftMs) + ' to decide'), btn({ do: 'decide', data: { id: p.id }, cls: 'primary', label: 'DECIDE' }), { k: p.id }); }
    if (rec.length) {
      s += '<div class="sec">Recovering</div>';
      for (const p of rec) { const pr = E.price.skip(p.restLeftMs / 1000, S); s += line(portrait(p.look, 40), esc(p.first + ' ' + p.last), esc(p.pill), skipBtn('rest:' + p.id, pr, 'restNow', { id: p.id }, 'REST NOW'), { k: p.id }); }
    }
    return s;
  }
  // the Inn sheet (8.6): the travelers as compact cards side by side (one per row below 640 px), the refresh timer
  function innBlock(b) {
    const inn = V.inn; if (!inn || b.lv < 1) return '';
    let s = '<div class="sec">At the Inn (' + inn.travelers.length + ')</div>';
    if (inn.travelers.length) { s += '<div class="tcards">'; for (const t of inn.travelers) s += travelerCard(t); s += '</div>'; const inv = inviteInfo(); if (inv && !inv.ok) s += '<p class="empty">' + esc(inv.why === 'No free bed' ? 'No free bed: a new House or a House upgrade makes room.' : inv.why + ' to invite.') + '</p>'; }
    else s += '<p class="expl">Nobody is staying right now.</p>';
    if (inn.leftMs != null) s += line('', 'New travelers in ' + fmt.clock(inn.leftMs / 1000), 'Each arrival replaces everyone at the Inn', skipBtn('inn', inn.price, 'innNow', null, 'NOW'));
    return s;
  }
  function travelerCard(t) {
    const inv = inviteInfo();
    return '<div class="tvc" data-k="' + t.id + '"><button class="tm" data-do="person" data-id="' + t.id + '" aria-label="' + esc('Card of ' + t.name) + '">' + portrait(t.look, 40) +
      '<span class="tx"><b>' + esc(t.first) + '</b><small>Lv ' + t.lv + ' · ' + esc(t.roleName) + '</small><small>' + esc(t.traitName) + '</small></span></button>' +
      (inv ? btn({ do: 'invite', data: { id: t.id }, cls: inv.ok ? 'primary' : '', off: !inv.ok, why: inv.why, label: 'INVITE · ' + fmt.num(inv.price), aria: 'Invite ' + t.first + ' for ' + inv.price + ' cans' }) : '') + '</div>';
  }

  // ---------------------------------------------------------------------------------------------- the City sheet (8.11)
  SHEETS.city = {
    subject: () => ({ kind: 'building', id: V ? V.tower.id : 'b1' }),
    head(v) { return '<div class="sh-title">BELL TOWER · LV ' + v.tower.lv + '<small>' + (v.night ? 'Night ' + v.night : 'Before the first night') + ' · the heart of Bellhaven</small></div><button class="xbtn" data-do="move" data-id="' + v.tower.id + '" aria-label="Move">' + ic('move') + '</button>'; },
    body(v) {
      const t = v.tower, n = t.next; let s = '';
      if (t.job) s += jobBlock(t.job);
      if (n) {
        s += '<div class="sec">Level ' + n.lv + ' opens</div><div class="opens">';
        for (const o of n.opens || []) s += '<span class="pill">' + ic(o.kind === 'dest' ? 'flag' : o.kind === 'land' ? 'move' : o.kind === 'crane' || o.kind === 'crane4' ? 'crane' : o.kind === 'stranger' ? 'heart' : o.kind === 'finale' ? 'bell' : TYPE_ICON[o.type] || 'house') + esc(cap1(o.text)) + '</span>';
        const sp = D.TOWER.sparks[n.lv]; if (sp) s += '<span class="pill spk">+' + sp + ' ✦</span>';
        s += '</div>';
        if (!t.job) s += '<div class="costs">' + costChip(n.cost) + timeChip(n.timeS) + '</div>' + needLine(n.cost);
      } else s += '<p>The gold bell rings over the whole city.</p>';
      // land
      const L = v.land, ln = L.next, xj = v.jobs.find((j) => j.kind === 'expand');
      s += '<div class="sec">Land</div>';
      if (xj) s += line(ic('move'), 'Land ' + L.side + ' × ' + L.side + ' → ' + (L.side + 2) + ' × ' + (L.side + 2), 'The fence moves in ' + fmt.clock(xj.leftMs / 1000), skipBtn('job:' + xj.id, xj.price, 'finish', { job: xj.id }));
      else if (!ln) s += line(ic('move'), 'Land ' + L.side + ' × ' + L.side, 'As big as Bellhaven gets', '');
      else if (ln.needTower) s += line(ic('move'), 'Land ' + L.side + ' × ' + L.side + ' → ' + ln.side + ' × ' + ln.side, 'Needs Tower ' + ln.needTower, '');
      else s += line(ic('move'), 'Land ' + L.side + ' × ' + L.side + ' → ' + ln.side + ' × ' + ln.side, esc(fmt.dur(ln.timeS)) + (ln.err === 'cost' ? ' · ' + esc(needText(ln.cost)) : ''),
        btn({ do: 'expand', cls: 'primary' + (ui.coach && ui.coach.dom === 'cTower' ? ' pulse' : ''), off: !(ln.ok || ln.err === 'noCrane'), why: ln.err === 'cost' ? needText(ln.cost) : 'Not possible right now', label: 'EXPAND · ' + fmt.num(ln.cost.n) }));
      // cranes
      s += '<div class="sec">Cranes</div>';
      const cr = v.cranes, buy = cr.buy;
      let right = '';
      if (!cr.crane4) {
        if (buy.err === 'locked') right = pill('4th from Tower ' + D.RULES.crane4Tower);
        else { const conf = skipConfirming('crane4'); right = btn({ do: 'buyCrane', cls: 'spark' + (conf ? ' confirm' : ''), off: !buy.ok, why: buy.err === 'cost' ? 'Need ' + (buy.price - v.res.sparks) + ' more ✦' : 'Not possible right now', label: conf ? 'BUY · ' + buy.price + ' ✦?' : 'BUY THE 4TH · ' + buy.price + ' ✦' }); }
      }
      s += line(ic('crane', '#f5c25a'), 'Cranes ' + cr.total + ' · ' + cr.free + ' free', 'One job each, no queue', right);
      s += '<div class="sec">City</div>';
      s += line(ic(S.ui.sound !== false ? 'sound' : 'mute'), 'Sound', S.ui.sound !== false ? 'On' : 'Off', btn({ do: 'sound', cls: 'ghost', label: S.ui.sound !== false ? 'SOUND ON' : 'SOUND OFF' }));
      s += line(ic('tower'), v.night ? 'Night ' + v.night : 'No runs yet', v.night === 1 ? 'One run so far' : v.night ? fmt.num(v.night) + ' runs so far' : 'The first night is one tap on WHO GOES TONIGHT?', btn({ do: 'fit', cls: 'ghost', label: 'FIT CITY' }));
      s += '<p class="expl">' + esc(EXPL[0]) + ' ' + esc(EXPL[2]) + '</p>';
      return s;
    },
    foot(v) { const b = bld(v.tower.id); return b ? mainFoot(b) : ''; },
  };
  function cap1(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }

  // ---------------------------------------------------------------------------------------------- the Sparks sheet and the free test packs (8.12)
  SHEETS.sparks = {
    head(v) { return '<div class="sh-title">SPARKS ✦ ' + fmt.num(v.res.sparks) + '<small>Time and lives, never bricks or cans</small></div>'; },
    body(v) {
      let s = '<p style="margin:0">' + esc(EXPL[8]) + '</p><div class="sec">Where sparks come from</div><ul class="srcs">' +
        '<li>Bell Tower levels 2-10<b>131 ✦</b></li><li>First clear of each place<b>54 ✦</b></li><li>The first safe return each day<b>5 ✦</b></li>' +
        '<li>Goals<b>35 ✦</b></li><li>The glinting rubble of each land ring<b>3 ✦ each</b></li></ul><div class="sec">Prototype test packs</div><div class="packs">';
      for (const n of [100, 500, 2500]) s += '<div class="pack"><div class="grow"><b>' + ic('spark') + fmt.num(n) + '</b><span>PROTOTYPE TEST PACK · FREE · NO PAYMENT</span></div>' + btn({ do: 'claimPack', data: { size: n }, cls: 'spark', label: 'CLAIM' }) + '</div>';
      return s + '</div><p class="expl">This prototype has no shop. The packs are free and only here for testing.</p>';
    },
  };
  // ---------------------------------------------------------------------------------------------- the jobs list (cranes chip)
  SHEETS.jobs = {
    head(v) { return '<div class="sh-title">CRANES · ' + v.cranes.free + '/' + v.cranes.total + ' FREE<small>One job each, no queue</small></div>'; },
    body(v) {
      let s = '';
      for (const j of v.jobs) {
        const b = j.buildingId ? bld(j.buildingId) : null;
        const title = j.kind === 'expand' ? 'Land ' + (8 + 2 * j.toLv) + ' × ' + (8 + 2 * j.toLv) : (j.kind === 'build' ? 'Building ' + theB(j.type) : nameOf(j.type) + ' → LV ' + j.toLv);
        s += line(ic('crane', '#f5c25a'), esc(title), fmt.clock(j.leftMs / 1000) + ' left' + (b ? '' : ''), btn({ do: 'goJob', data: { id: j.buildingId || 'expand' }, cls: 'ghost icon', icon: 'info', aria: 'Show' }) +
          skipBtn('job:' + j.id, j.price, 'finish', { job: j.id }), { k: j.id });
      }
      for (let i = v.jobs.length; i < v.cranes.total; i++) s += line(ic('crane', '#a9aeb3'), 'A free crane', 'Folded beside the Bell Tower', btn({ do: 'build', cls: 'primary', label: 'BUILD' }), { k: 'free' + i });
      if (!v.cranes.crane4) {
        const buy = v.cranes.buy, conf = skipConfirming('crane4');
        s += '<div class="sec">The 4th crane</div>' + line(ic('crane', '#4fd8ff'), 'Bought once, for good', buy.err === 'locked' ? 'From Tower ' + D.RULES.crane4Tower : 'One more job at a time',
          buy.err === 'locked' ? '' : btn({ do: 'buyCrane', cls: 'spark' + (conf ? ' confirm' : ''), off: !buy.ok, why: buy.err === 'cost' ? 'Need ' + (buy.price - v.res.sparks) + ' more ✦' : 'Not possible right now', label: conf ? 'BUY · ' + buy.price + ' ✦?' : 'BUY · ' + buy.price + ' ✦' }));
      }
      return s + '<p class="expl">' + esc(EXPL[0]) + '</p>';
    },
  };
  // ---------------------------------------------------------------------------------------------- where bricks and cans come from (the chips)
  SHEETS.res = {
    head(v, a) { const r = a.res === 'cans' ? 'cans' : 'bricks'; return '<div class="sh-title">' + r.toUpperCase() + ' · ' + fmt.num(v.res[r]) + ' / ' + fmt.num(v.caps[r]) + '<small>' + fmt.num(Math.round(v.rates[r])) + ' an hour from ' + (r === 'bricks' ? 'Kilns' : 'Canneries') + '</small></div>'; },
    body(v, a) {
      const r = a.res === 'cans' ? 'cans' : 'bricks', type = r === 'bricks' ? 'kiln' : 'cannery';
      let s = '<p style="margin:0">' + esc(EXPL[1]) + '</p><div class="sec">' + (r === 'bricks' ? 'Kilns' : 'Canneries') + '</div>';
      const list = v.buildings.filter((b) => b.type === type);
      if (!list.length) s += line(ic(RES_ICON[r]), 'No ' + nameOf(type) + ' yet', 'Build one from the BUILD tray', btn({ do: 'build', cls: 'primary', label: 'BUILD' }));
      for (const b of list) {
        const bb = b.bubble;
        s += line(ic(RES_ICON[r]), esc(b.label), b.building ? 'Being built' : bb ? fmt.num(bb.whole) + ' / ' + fmt.num(bb.hold) + ' waiting' : 'Starting', bb && bb.whole >= 1 ? btn({ do: 'collect', data: { id: b.id }, cls: 'light', label: 'COLLECT' }) : btn({ do: 'goJob', data: { id: b.id }, cls: 'ghost icon', icon: 'info', aria: 'Show' }), { k: b.id });
      }
      const dest = v.dests.filter((d) => d.open).pop();
      s += '<div class="sec">Also</div><ul class="srcs"><li>A win at the ' + esc(dest.name) + '<b>~' + fmt.num(r === 'bricks' ? dest.bricks : dest.cans) + ' ' + r + '</b></li>' +
        '<li>Goal rewards<b>' + (r === 'bricks' ? 'bricks' : 'cans') + '</b></li><li>Storage cap<b>' + fmt.num(v.caps[r]) + '</b></li></ul>' +
        '<p class="expl">' + (r === 'bricks' ? 'Bricks build the Bell Tower, Kilns, Canneries and Depots, move the fence and clear rubble.' : 'Cans pay for Houses, the Clinic, the Armory and the Inn, for invites, the kit and revives.') + '</p>';
      return s;
    },
  };
  // ---------------------------------------------------------------------------------------------- the roster (8.6)
  // PEOPLE · 6/9 BEDS: rows of 56 px in the view's order (Down with DECIDE, Ready, Resting, Hurt, Recovering, then the
  // runner who is Out); then AT THE INN (INVITE) and REMEMBERED (a tap: the memorial card and the camera on the grave).
  const stateCls = (p) => (p.state === 'down' ? 'red' : p.state === 'ready' ? 'good' : p.state === 'out' ? '' : p.restKind === 'hurt' ? 'red' : p.restKind === 'recovering' ? 'spk' : 'warm');
  function rosterRow(p) {
    const down = p.state === 'down';
    return '<div class="prow" data-k="' + p.id + '"><button class="pm" data-do="person" data-id="' + p.id + '" aria-label="' + esc(p.fullName + ', level ' + p.lv + ' ' + p.roleName + ', ' + p.pill) + '">' + portrait(p.look, 44, down) +
      '<span class="pt"><b>' + esc(p.fullName) + '</b>' + (down ? '<span>' + pill(p.pill, 'red') + '</span><span><em>Lv ' + p.lv + ' · ' + esc(p.roleName) + '</em></span>'
        : '<span><em>Lv ' + p.lv + ' · ' + esc(p.roleName) + '</em>' + pill(p.traitName.toUpperCase(), 'warm') + '</span>') + '</span></button>' +
      (down ? btn({ do: 'decide', data: { id: p.id }, cls: 'primary', label: 'DECIDE', aria: 'Decide about ' + p.first }) : '<span class="st">' + pill(p.pill, stateCls(p)) + '</span>') + '</div>';
  }
  function travelerRow(t) {
    const inv = inviteInfo();
    return '<div class="prow" data-k="' + t.id + '"><button class="pm" data-do="person" data-id="' + t.id + '" aria-label="' + esc('Card of ' + t.name) + '">' + portrait(t.look, 44) +
      '<span class="pt"><b>' + esc(t.name) + '</b><span><em>Lv ' + t.lv + ' · ' + esc(t.roleName) + '</em>' + pill(t.traitName.toUpperCase(), 'warm') + '</span></span></button>' +
      (inv ? btn({ do: 'invite', data: { id: t.id }, cls: inv.ok ? 'primary' : '', off: !inv.ok, why: inv.why, label: 'INVITE · ' + fmt.num(inv.price), aria: 'Invite ' + t.first + ' for ' + inv.price + ' cans' }) : '') + '</div>';
  }
  function rememberedRow(p) {
    const g = p.graveId ? V.graves.find((x) => x.id === p.graveId) : null, ep = p.epitaph && p.epitaph[0] ? p.epitaph[0] : '';
    return '<div class="prow gone" data-k="' + p.id + '"><button class="pm" data-do="remember" data-id="' + esc(p.graveId || '') + '" aria-label="' + esc('Remember ' + p.fullName) + '">' + portrait(p.look, 44, true) +
      '<span class="pt"><b>' + esc(p.fullName) + '</b><span><em>' + esc(g && g.waiting ? 'Waiting for a place' : ep) + '</em></span></span></button></div>';
  }
  SHEETS.people = {
    head(v) { return '<div class="sh-title">PEOPLE · ' + v.chips.people.living + '/' + v.chips.people.beds + ' BEDS<small>Tap a name for the card and the history</small></div>'; },
    body(v) {
      let s = '';
      for (const p of v.people) s += rosterRow(p);
      if (!v.people.length) s += '<p class="empty">Nobody lives here right now. A drifter walks in at the gate.</p>';
      if (v.inn && v.inn.lv >= 1) {
        s += '<div class="sec">At the Inn (' + v.inn.travelers.length + ')</div>';
        for (const t of v.inn.travelers) s += travelerRow(t);
        const inv = inviteInfo(); if (inv && !inv.ok && v.inn.travelers.length) s += '<p class="empty">' + esc(inv.why === 'No free bed' ? 'No free bed: a new House or a House upgrade makes room.' : inv.why + ' to invite.') + '</p>';
        if (!v.inn.travelers.length) s += '<p class="empty">Nobody is staying right now' + (v.inn.leftMs != null ? ': new travelers in ' + fmt.clock(v.inn.leftMs / 1000) : '') + '.</p>';
      }
      if (v.remembered.length) { s += '<div class="sec">Remembered (' + v.remembered.length + ')</div>'; for (const p of v.remembered) s += rememberedRow(p); }
      return s + '<p class="expl">' + esc(EXPL[3]) + '</p><p class="expl">' + esc(EXPL[4]) + '</p>';
    },
  };

  // ---------------------------------------------------------------------------------------------- the build tray (8.5)
  const TRAY_ORDER = ['kiln', 'cannery', 'depot', 'house', 'clinic', 'armory', 'inn', 'tower', 'tree', 'bench', 'lamp'];
  function openTray(focusType) {
    if (ui.mode) return;
    if (ui.sheet) closeSheet();
    if (ui.lab) closeLab();
    deselect();
    ui.tray = true; ui.trayFocus = focusType || null;
    $('tray').__html = null;
    setClass('tray-open', true);
    renderTray(); renderBottom(); applyInsets();
    if (focusType) { const c = $('tray').querySelector('[data-type="' + focusType + '"]'); if (c && c.scrollIntoView) { try { c.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { /* old browsers */ } } }
    sfx('tick');
  }
  function closeTray(silent) {
    if (!ui.tray) return;
    ui.tray = false; ui.trayFocus = null; setClass('tray-open', false); morph($('tray'), '');
    applyInsets(); if (!silent) renderBottom();
  }
  function renderTray() {
    if (!ui.tray || !V) return;
    const compact = ui.layout.bb === 'compact', tw = compact ? 72 : 84, th = compact ? 42 : 56, c = ui.coach || {};
    let s = '<div class="tx"><button class="xbtn" data-do="closeTray" aria-label="Close the tray">' + ic('close') + '</button></div><div class="cards">';
    const byType = {}; for (const t of V.tray) byType[t.type] = t;
    for (const type of TRAY_ORDER) {
      const t = byType[type]; if (!t) continue;
      const img = t.decor ? decorThumb(type, tw, th) : Art.thumbURL(type, 1, tw, th);
      const locked = !!t.locked, full = t.full, short = !locked && !full && V.res[t.cost.res] < t.cost.n;
      const cls = 'tcard' + (locked ? ' locked off' : full ? ' off' : '') + (t.ok ? ' go' : '') + ((c.card === type || ui.trayFocus === type) && !locked && !full ? ' pulse' : '');
      s += '<button class="' + cls + '" data-do="trayCard" data-type="' + type + '" data-k="' + type + '" aria-label="' + esc(t.name + (locked ? ', needs Tower ' + t.locked : full ? ', all built' : ', ' + t.cost.n + ' ' + t.cost.res)) + '">' +
        (img ? '<img alt="" src="' + img + '">' : '') + '<b>' + esc(t.name) + '</b>' +
        (locked ? '<span class="lock">' + ic('lock', '#a9aeb3') + 'Tower ' + t.locked + '</span>' : type === 'tower' ? '<span class="lock">Lv ' + V.tower.lv + '</span>' : '<span class="tc' + (short ? ' short' : '') + '">' + ic(RES_ICON[t.cost.res]) + fmt.num(t.cost.n) + '</span>') +
        (t.decor ? '' : '<span class="cnt">' + t.built + '/' + (t.allowed || t.max) + '</span>') + '</button>';
    }
    morph($('tray'), s + '</div>');
  }
  const DTHUMB = new Map();
  function decorThumb(type, w, h) {                           // a decoration drawn by its own recipe on a grass tile
    const key = type + w + 'x' + h; let u = DTHUMB.get(key); if (u != null) return u;
    u = '';
    try {
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1)), c = document.createElement('canvas');
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const g = c.getContext('2d'); g.scale(dpr, dpr);
      const z = Math.min(w / 64 * 0.95, h / 78), x = w / 2, y = h - 33 * z;
      Art.tile(g, x, y, z, 1, 1, '#9dc876');
      Art.decor(g, type, x, y, z, { size: 0.9, t: 0, reduced: true });
      u = c.toDataURL('image/png');
    } catch (e) { u = ''; }
    DTHUMB.set(key, u); return u;
  }

  // ---------------------------------------------------------------------------------------------- placement and move mode (8.5)
  function startPlace(type) {
    const t = V.tray.find((x) => x.type === type); if (!t) return;
    closeTray(true);
    let gx, gy;
    if (type === 'cannery' && S.goal === 0) {                 // 7.1: the onboarding Cannery ghost sits on (13, 13)
      const sp = D.START.firstSpot; if (E.canPlace(S, 'cannery', sp.gx, sp.gy).ok) { gx = sp.gx; gy = sp.gy; }
    }
    const gh = iso.ghostStart({ kind: type, mode: 'place', gx, gy });
    ui.mode = { kind: 'place', type, cost: t.cost, decor: t.decor, valid: !!(gh && gh.valid), reason: gh ? gh.reason : null };
    deselect(true);
    hint('Drag to place · pinch to zoom', 4000);
    sfx('whirr');
    applyInsets(); renderBottom();
  }
  function startMove(target, labels) {
    if (!target) return;
    if (ui.sheet) closeSheet(true);
    let gh = iso.ghost();
    if (!gh || gh.mode !== 'move' || gh.id !== target.id) gh = iso.ghostStart({ mode: 'move', id: target.id });
    if (!gh) return;
    ui.mode = { kind: 'move', target: { kind: gh.targetKind || target.kind, id: target.id }, valid: !!gh.valid, reason: gh.reason, labels: labels || null };
    ui.sel = null; setClass('sel', false);
    hint(labels && labels.hint ? labels.hint : 'Drag to move · free and instant', 4000);
    applyInsets(); renderBottom();
  }
  function confirmMode(finishOther) {
    const m = ui.mode, gh = iso ? iso.ghost() : null; if (!m || !gh) return;
    if (!gh.valid) { explain({ err: 'blocked', data: { reason: gh.reason } }); return; }
    if (m.kind === 'place') {
      const r = doAct({ type: 'place', kind: gh.kind, gx: gh.gx, gy: gh.gy, finishOther: !!finishOther }, { quiet: true });
      if (r.ok) { iso.ghostEnd(); endMode(); if (r.data && r.data.buildingId) { ui.sel = null; } return; }
      if (r.err === 'noCrane') { craneConfirm(r.data, () => confirmMode(true), () => cancelMode()); return; }
      explain(r);
    } else {
      if (!gh.moved) { iso.ghostEnd(); endMode(); if (m.onDone) m.onDone(false); return; }
      const r = doAct({ type: 'move', target: m.target, gx: gh.gx, gy: gh.gy }, { quiet: true });
      if (r.ok) { iso.ghostEnd({ commit: true }); endMode(); if (m.onDone) m.onDone(true); sfx('place'); return; }
      explain(r);
    }
  }
  function cancelMode() {
    const m = ui.mode; if (!m) return;
    if (m.labels && m.labels.cancel === null) return;          // grave placement: no ✕ (8.9)
    if (iso) iso.ghostEnd();
    endMode();
    if (m.onCancel) m.onCancel();
  }
  function endMode() { ui.mode = null; hideHint(); applyInsets(); renderHud(); }
  // 3.5: every crane busy -> "Finish the Kiln now · 7 ✦" or WAIT
  function craneConfirm(d, onFinish, onWait) { openOverlay('crane', { label: d && d.label ? d.label : 'Finish a job now', price: d ? d.price : 0, jobId: d ? d.jobId : null, onFinish, onWait }); }
  function deselect(keep) { ui.sel = null; if (iso && !keep) iso.select(null); setClass('sel', false); renderAbar(); }

  // ---------------------------------------------------------------------------------------------- actions behind buttons
  function upgrade(id) {
    const b = bld(id); if (!b) return;
    const r = doAct({ type: 'upgrade', id }, { quiet: true });
    if (r.ok) return;
    if (r.err === 'noCrane') { craneConfirm(r.data, () => doAct({ type: 'upgrade', id, finishOther: true }), null); return; }
    explain(r);
  }
  function expand() {
    const r = doAct({ type: 'expand' }, { quiet: true });
    if (r.ok) { toast('A crane starts moving the fence.', { icon: 'crane' }); return; }
    if (r.err === 'noCrane') { craneConfirm(r.data, () => doAct({ type: 'expand', finishOther: true }), null); return; }
    explain(r);
  }
  function collect(id, at) {
    const b = bld(id); if (!b) return;
    doAct({ type: 'collect', id }, { at: at || (iso ? iso.screenOf({ kind: 'bubble', id }) : null) });
  }
  function openSelSheet(t) {
    if (!t) return;
    if (t.kind === 'building') { const b = bld(t.id); if (!b) return; if (b.type === 'tower') openSheet('city'); else openSheet('building', { id: t.id }); }
    else if (t.kind === 'grave') hooks.openMemorial(t.id);
    else if (t.kind === 'person') hooks.openPerson(t.id);
  }
  Object.assign(DO, {
    noop() {},
    build() { if (ui.mode) { cancelMode(); return; } if (ui.tray) { closeTray(); return; } openTray(); },
    play() {
      if (ui.mode) { confirmMode(false); return; }
      if (ui.tray) closeTray();
      hooks.openRun({});
    },
    goal() {
      const g = V.goal, t = g.target; sfx('tick');
      if (!t) { toast(g.eta || g.text); return; }
      if (t.kind === 'build') { openTray(t.type); return; }
      if (t.kind === 'building' || t.kind === 'collect') {
        const tg = { kind: 'building', id: t.id }; if (ui.sheet) closeSheet();
        ui.sel = tg; iso.select(tg, { focus: true }); iso.pulse(t.kind === 'collect' ? { kind: 'bubble', id: t.id } : tg, { ms: 3200 });
        ui.goalPulse = { until: now() + 3200 }; renderAbar(); return;
      }
      if (t.kind === 'dest') { hooks.openRun({ destId: t.destId }); return; }
      if (t.kind === 'expand') { openSheet('city'); return; }
      if (t.kind === 'job') { const j = V.jobs.find((x) => x.id === t.id); if (j && j.buildingId) { const tg = { kind: 'building', id: j.buildingId }; ui.sel = tg; iso.select(tg, { focus: true }); iso.pulse(tg, { ms: 3200 }); renderAbar(); } else openSheet('city'); return; }
      if (t.kind === 'person') { const tg = { kind: 'person', id: t.id }; ui.sel = tg; iso.select(tg, { focus: true }); renderAbar(); }
    },
    openCity() { if (ui.sheet && ui.sheet.kind === 'city') { closeSheet(); return; } openSheet('city'); },
    openRes(el) { const r = el.dataset.res; if (ui.sheet && ui.sheet.kind === 'res' && ui.sheet.args.res === r) { closeSheet(); return; } openSheet('res', { res: r }); },
    openSparks() { if (ui.sheet && ui.sheet.kind === 'sparks') { closeSheet(); return; } openSheet('sparks'); },
    openJobs() { if (ui.sheet && ui.sheet.kind === 'jobs') { closeSheet(); return; } openSheet('jobs'); },
    openPeople() { if (ui.sheet && ui.sheet.kind === 'people') { closeSheet(); return; } hooks.openRoster(); },
    openLab() { if (ui.lab) { closeLab(); return; } openLab(); },
    closeSheet() { closeSheet(); },
    closeTray() { closeTray(); },
    closeOverlay() { const o = ui.overlay, def = o ? OVERLAYS[o.kind] : null; if (def && def.esc) def.esc(o.args); else closeOverlay(); },
    trayCard(el) {
      const type = el.dataset.type, t = V.tray.find((x) => x.type === type); if (!t) return;
      if (type === 'tower') { closeTray(); openSheet('city'); return; }
      if (t.locked) { toast('Needs Tower ' + t.locked, { icon: 'lock' }); return; }
      if (t.full) { toast('All ' + t.max + ' built', { icon: 'check' }); return; }
      // Spec reading: a card that cannot be afforded explains the shortfall instead of entering placement (5.7)
      if (V.res[t.cost.res] < t.cost.n) { toast(needText(t.cost), { kind: 'bad' }); return; }
      startPlace(type);
    },
    info() { openSelSheet(ui.sel); },
    move(el) { const id = el && el.dataset.id; const t = id ? (bld(id) ? { kind: 'building', id } : null) : ui.sel; if (t) startMove(t); },
    upgrade(el) { upgrade(el.dataset.id || (ui.sel && ui.sel.id)); },
    expand() { expand(); },
    collect(el) { collect(el.dataset.id, iso ? iso.screenOf({ kind: 'bubble', id: el.dataset.id }) : null); },
    finish(el) { const id = el.dataset.job; skipAct('job:' + id, { type: 'finish', jobId: id }); },
    restNow(el) { const id = el.dataset.id; skipAct('rest:' + id, { type: 'restNow', personId: id }); },
    innNow() { skipAct('inn', { type: 'innNow' }); },
    clear(el) { const r = doAct({ type: 'clearRubble', id: el.dataset.id }); if (r.ok) deselect(); },
    buyCrane() {
      if (!skipConfirming('crane4')) { ui.confirm = { key: 'crane4', until: Date.now() + 3000 }; ui.panelDirty = true; renderPanels(); setTimeout(() => { ui.panelDirty = true; }, 3050); sfx('tick'); return; }
      ui.confirm = null; doAct({ type: 'buyCrane' });
    },
    claimPack(el) { const r = el.getBoundingClientRect(); doAct({ type: 'claimPack', size: +el.dataset.size }, { at: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); },
    sound() { setSound(S.ui.sound === false); },
    fit() { if (iso) iso.fit({ ease: true }); if (ui.layout.portrait || ui.layout.bb === 'compact') closeSheet(); },
    goJob(el) {
      const id = el.dataset.id; closeSheet();
      if (id === 'expand') { openSheet('city'); return; }
      const tg = { kind: 'building', id }; ui.sel = tg; iso.select(tg, { focus: true }); renderAbar();
    },
    upright() { ui.upright = true; store.set(KEY_UPRIGHT, '1'); showRotate(); sfx('tick'); },
  });

  // ---------------------------------------------------------------------------------------------- one-time cards (8.13) and the welcome card (8.10)
  const WROW_ICON = { down: ['heart', '#ff4b2f'], expired: ['grave', null], job: ['crane', '#f5c25a'], bubbles: ['brick', null], people: ['people', null], inn: ['house', null] };
  OVERLAYS.welcome = {
    render(v, w) {
      let s = '<div class="card"><div class="cb"><h2>' + esc(w.title) + '</h2>';
      for (const r of w.rows) {
        const ico = WROW_ICON[r.kind] || ['check', null], live = r.kind === 'down' && r.personId ? personV(r.personId) : null;
        const decide = r.action === 'decide' && live && live.state === 'down';
        s += '<div class="wrow' + (r.kind === 'down' ? ' down' : '') + '"><span class="ic">' + ic(r.kind === 'bubbles' && /cans/.test(r.text) && !/bricks/.test(r.text) ? 'can' : ico[0], ico[1]) + '</span><span class="grow">' + esc(r.text) + '</span>' +
          (decide ? btn({ do: 'decide', data: { id: r.personId }, cls: 'primary', label: 'DECIDE' }) : '') + '</div>';
      }
      if (w.more) s += '<div class="wrow"><span class="ic">' + ic('plus') + '</span><span class="grow soft">and ' + w.more + ' more</span></div>';
      if (!w.rows.length) s += '<p class="soft">Bellhaven kept going while you were away.</p>';
      return s + '</div><div class="cf"><span class="grow">Nothing was collected or decided for you.</span>' + btn({ do: 'closeOverlay', cls: 'primary', label: 'OK', primary: true }) + '</div></div>';
    },
  };
  // 7.1: Meet your people, one card per starter, then LET'S BEGIN (rings the bell once, eases to the fit view)
  OVERLAYS.meet = {
    render(v, a) {
      const ps = S.people.filter((p) => p.arrivedHow === 'starter').map((p) => personV(p.id)).filter(Boolean);
      const i = clamp(a.i || 0, 0, Math.max(0, ps.length - 1)), p = ps[i];
      if (!p) return null;
      const last = i >= ps.length - 1;
      let dots = '<div class="dots">'; for (let k = 0; k < ps.length; k++) dots += '<i class="' + (k === i ? 'on' : '') + '"></i>'; dots += '</div>';
      return '<div class="card" data-k="meet' + i + '"><div class="cb"><div class="sec">Meet your people · ' + (i + 1) + ' of ' + ps.length + '</div><div class="meet">' + portrait(p.look, 96) + '<div>' +
        '<div class="who">' + esc(p.name) + '<small>, ' + p.age + '</small></div><div class="chips">' + pill(p.roleName.toUpperCase()) + pill(p.traitName.toUpperCase(), 'warm') + '</div>' +
        '<p>' + esc(p.card) + '</p><p class="soft" style="font-size:12px">' + esc(p.traitLine) + '</p></div></div></div>' +
        '<div class="cf"><span class="grow">' + dots + '</span>' + btn({ do: last ? 'letsBegin' : 'meetNext', cls: 'primary', label: last ? 'LET’S BEGIN' : 'NEXT', primary: true }) + '</div></div>';
    },
    esc() { DO.letsBegin(); },
  };
  DO.meetNext = () => { if (ui.overlay && ui.overlay.kind === 'meet') { ui.overlay.args.i = (ui.overlay.args.i || 0) + 1; sfx('tick'); renderOverlay(); } };
  DO.letsBegin = () => {
    doAct({ type: 'flag', name: 'metPeople' }, { quiet: true });
    closeOverlay('meet');
    if (iso) { iso.ringBell(1); iso.fit({ ease: true }); }
    sfx('bell', { times: 1 });
  };
  OVERLAYS.tower = {
    render(v, a) {
      let s = '<div class="card"><div class="cb"><h2>BELL TOWER ' + a.lv + '<small>The bell rings three times over Bellhaven.</small></h2>';
      if (a.opens && a.opens.length) { s += '<div class="sec">New</div><div class="opens">'; for (const o of a.opens) s += '<span class="pill">' + esc(cap1(o.text)) + '</span>'; s += '</div>'; }
      if (a.sparks) s += '<div class="opens" style="margin-top:8px"><span class="pill spk">+' + a.sparks + ' ✦</span></div>';
      return s + '</div><div class="cf">' + btn({ do: 'closeOverlay', cls: 'primary', label: 'OK', primary: true }) + '</div></div>';
    },
    onOpen() { if (iso) iso.ringBell(3); sfx('bell', { times: 3 }); },
  };
  OVERLAYS.death = {
    render() {
      return '<div class="card"><div class="cb"><h2>THREE PEOPLE NOW</h2><p>' + esc(D.TEXT.deathOn) + '</p><p class="soft" style="font-size:12.5px">' + esc(EXPL[6]) + '</p></div><div class="cf">' +
        btn({ do: 'closeOverlay', cls: 'primary', label: 'OK', primary: true }) + '</div></div>';
    },
    onClose() { doAct({ type: 'flag', name: 'deathCardSeen' }, { quiet: true }); },
  };
  OVERLAYS.finale = {
    render() {
      const living = S.people.filter((p) => p.state !== 'fallen'), gone = S.people.filter((p) => p.state === 'fallen');
      let s = '<div class="card wide"><div class="cb"><h2>THE GOLD BELL</h2><p>' + esc(D.TEXT.finale) + '</p><div class="names">';
      for (const p of living) s += '<div>' + esc(p.first + ' ' + p.last) + '</div>';
      for (const p of gone) s += '<div class="gone">' + esc(p.first + ' ' + p.last) + '</div>';
      return s + '</div></div><div class="cf">' + btn({ do: 'closeOverlay', cls: 'primary', label: 'OK', primary: true }) + '</div></div>';
    },
    onOpen() {
      // P1: everyone gathers on the plaza; one toll per name while the names show
      if (iso && iso.gather) iso.gather(true);
      const n = S.people.length; let i = 0;
      const toll = () => { if (!ui.overlay || ui.overlay.kind !== 'finale' || i >= n) return; i++; sfx('bell', { times: 1, low: i > S.people.filter((p) => p.state !== 'fallen').length }); if (iso) iso.ringBell(1); setTimeout(toll, 1400); };
      toll();
    },
    onClose() {
      // the card covers the plaza: the gathering stays for 20 s after it closes, with the Tower in view, then everyone
      // goes back to their day
      if (iso && iso.gather) {
        try { if (V && V.tower) iso.setCamera({ tx: V.tower.gx + 1.5, ty: V.tower.gy + 2, z: Math.max(iso.getCamera().z, 1.1) }, { ease: true }); } catch (e) { /* the Tower is always there */ }
        clearTimeout(ui.gatherT); ui.gatherT = setTimeout(() => { if (iso && iso.gather) iso.gather(false); }, 20000);
      }
      doAct({ type: 'flag', name: 'finale' }, { quiet: true });
    },
  };
  OVERLAYS.crane = {
    render(v, a) {
      const free = !a.price;
      return '<div class="card"><div class="cb"><div class="confirm-q">Every crane is busy</div><p class="soft">Finishing a job frees its crane, and the new job starts at once.</p></div><div class="cf">' +
        btn({ do: 'craneWait', cls: 'ghost', label: 'WAIT' }) + btn({ do: 'craneFinish', cls: free ? 'good' : 'spark', label: a.label, primary: true }) + '</div></div>';
    },
    esc() { DO.craneWait(); },
  };
  DO.craneFinish = () => { const o = ui.overlay; if (!o || o.kind !== 'crane') return; closeOverlay('crane'); if (o.args.onFinish) o.args.onFinish(); };
  DO.craneWait = () => { const o = ui.overlay; if (!o || o.kind !== 'crane') return; closeOverlay('crane'); if (o.args.onWait) o.args.onWait(); };

  // ============================================================================================== PEOPLE AND RUNS
  // 6.2-6.7, 7.1 (the stranger), 8.6-8.9: the run sheet with its time-sliced odds, the walk to the gate, the run screen,
  // the result card with the fall beat, the revive offer, goodbye and the grave, the memorial card, the person and
  // traveler cards, and the JSON cards. Every number and line comes from the engine; every change goes through act().
  const KIT_ITEMS = ['medkit', 'pills', 'bomb'];
  const KIT_WORD = D.TEXT.kitName;                                    // Medkit, Pills, Noise bomb
  const wideL = () => ui.layout.bb === 'wide' && !ui.layout.portrait;
  const bLv = (type) => { let m = 0; if (V) for (const b of V.buildings) if (b.type === type && b.lv > m) m = b.lv; return m; };
  const kitUnlocked = (it) => (it === 'bomb' ? bLv('armory') >= 2 : bLv('clinic') >= 1);
  const kitLock = (it) => (it === 'bomb' ? 'Armory 2' : 'the Clinic');
  const signPct = (x) => (x < 0 ? '−' : '+') + Math.round(Math.abs(x) * 100) + '%';
  // a portrait in a sized frame (CSS sets the frame; the bitmap follows the UI scale so it stays sharp)
  function pp(look, size, grey, extra) {
    if (!look) return '<span class="pp' + (extra ? ' ' + extra : '') + '"></span>';
    return '<span class="pp' + (extra ? ' ' + extra : '') + '">' + portrait(look, Math.round(size * (ui.layout.k || 1)), grey, 'pi') + '</span>';
  }
  function lvFrac(lv, xp, from, to) { return lv >= 10 ? 1 : clamp((xp - from) / Math.max(1, to - from), 0, 1); }
  // swap the current overlay for another (the queue stays put, so nothing queued flashes in between)
  function swapOverlay(kind, args) {
    const o = ui.overlay;
    if (o) { const def = OVERLAYS[o.kind]; ui.overlay = null; if (def && def.onClose) { try { def.onClose(o.args); } catch (e) { console.error(e); } } }
    showOverlayNow({ kind, args: args || {} });
  }
  const isOv = (kind) => !!(ui.overlay && ui.overlay.kind === kind);

  // ---------------------------------------------------------------------------------------------- odds in idle frames (6.3.5)
  // A time-sliced queue keyed by Engine.oddsKey (the engine's LRU cache is the queue's memory): every frame computes the
  // uncached odds in this order and stops before 8 ms of work: the selected runner at the selected destination, the rest
  // of the strip (Ready first; badges show "…" until ready), that runner's kit deltas (one flipped kit per item) and
  // rested odds, then PLAY's suggestion. One computation (the 400 reference runs) is the smallest step.
  const OQ = { budget: 8, est: 1.5, n: 0, ms: 0, max: 0, maxFrame: 0, frames: 0, recent: [], fills: [] };
  function oddsJobs() {
    const out = [];
    if (!S.pending && isOv('run') && rs.destId) {
      const d = rs.destId, sel = rsSel();
      if (sel) out.push({ destId: d, personId: sel, kit: rs.kit, sheet: true });
      for (const t of E.oddsTodo(S, d)) { t.sheet = true; out.push(t); }
      if (sel) {
        const k = E.kitNorm(S, d, rs.kit);
        for (const it of KIT_ITEMS) if (kitUnlocked(it)) out.push({ destId: d, personId: sel, kit: Object.assign({}, k, { [it]: k[it] ? 0 : 1 }), sheet: true });
        const p = S.people.find((x) => x.id === sel);
        if (p && p.state === 'rest') out.push({ destId: d, personId: sel, kit: k, rested: true, sheet: true });
      }
    }
    if (!S.pending && V.play && !V.play.known) for (const t of E.oddsTodo(S)) out.push(t);
    return out;
  }
  function oddsWork() {
    if (!V || !S) return;
    const jobs = oddsJobs(); if (!jobs.length) return;
    const t0 = now(); let did = 0, left = 0;
    for (const j of jobs) {
      const o = j.rested ? { rested: true } : undefined;
      if (E.oddsCached(S, j.destId, j.personId, j.kit, o)) continue;
      if (did && now() - t0 + OQ.est > OQ.budget) { if (j.sheet) left++; continue; }
      const a = now(); E.odds(S, j.destId, j.personId, j.kit, o); const ms = now() - a;
      OQ.est = OQ.est * 0.6 + ms * 0.4; OQ.n++; OQ.ms += ms; if (ms > OQ.max) OQ.max = ms; did++;
      OQ.recent.push(ms); if (OQ.recent.length > 300) OQ.recent.shift();
    }
    if (did) { const f = now() - t0; OQ.frames++; if (f > OQ.maxFrame) OQ.maxFrame = f; ui.dirty = true; ui.panelDirty = true; }
    // measurement: how long the open run sheet took until every number on it was known
    if (isOv('run') && rs.openedAt && !rs.filledAt && !left && !jobs.some((j) => j.sheet && !E.oddsCached(S, j.destId, j.personId, j.kit, j.rested ? { rested: true } : undefined))) {
      rs.filledAt = now();
      OQ.fills.push({ ms: Math.round(rs.filledAt - rs.openedAt), computed: OQ.n - rs.n0, frames: OQ.frames - rs.f0 });
      if (OQ.fills.length > 50) OQ.fills.shift();
    }
  }
  function oddsStats() {
    const r = OQ.recent.slice().sort((a, b) => a - b), n = r.length;
    return { computed: OQ.n, totalMs: +OQ.ms.toFixed(2), avgMs: OQ.n ? +(OQ.ms / OQ.n).toFixed(3) : 0, p95Ms: n ? +r[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(3) : 0,
      maxMs: +OQ.max.toFixed(3), maxFrameMs: +OQ.maxFrame.toFixed(3), framesWithWork: OQ.frames, budgetMs: OQ.budget, fills: OQ.fills.slice() };
  }

  // ---------------------------------------------------------------------------------------------- the run sheet (6.2, 8.7.1)
  // rs survives while a JSON card sits on top of the sheet; it resets when the sheet opens afresh.
  const rs = { destId: null, personId: null, picked: false, kit: null, lowUntil: 0, openedAt: 0, filledAt: 0, n0: 0, f0: 0 };
  function rsReset(a) {
    const open = V.dests.filter((d) => d.open);
    let dest = a.destId && V.dests.find((d) => d.id === a.destId && d.open) ? a.destId : V.play ? V.play.destId : S.lastDest;
    if (!V.dests.find((d) => d.id === dest && d.open)) dest = (open[0] || V.dests[0]).id;
    rs.destId = dest; rs.personId = a.personId || (V.play && V.play.destId === dest ? V.play.personId : null); rs.picked = !!a.personId;
    rs.kit = null; rs.lowUntil = 0; rsMark();
  }
  function rsMark() { rs.openedAt = now(); rs.filledAt = 0; rs.n0 = OQ.n; rs.f0 = OQ.frames; }
  // the selected runner: the one picked (or sent from a card), else the suggestion for this destination (cached odds;
  // until they are known it follows the engine's fallback order, so the preselection settles within a few frames)
  function rsSel() {
    const strip = E.strip(S, rs.destId);
    if (rs.personId && strip.some((r) => r.personId === rs.personId)) return rs.personId;
    const sg = E.suggest(S, rs.destId);
    return sg ? sg.personId : strip.length ? strip[0].personId : null;
  }
  function rsCard(sel) { return sel && E.oddsCached(S, rs.destId, sel, rs.kit) ? E.runCard(S, rs.destId, sel, rs.kit) : null; }
  OVERLAYS.run = {
    dark: true,
    onOpen(a) { if (!a.inited) { a.inited = true; rsReset(a); } else rsMark(); },
    render(v) { return v.pending ? null : rsHtml(v); },
    esc() { closeOverlay('run'); },
  };
  function rsHtml(v) {
    const wide = wideL(), dest = rs.destId, strip = E.strip(S, dest), sel = rsSel(), p = sel ? personV(sel) : null, c = rsCard(sel);
    const g = v.goal, gd = S.goal < 9 && !g.done && g.target && g.target.kind === 'dest' ? g.target.destId : null;   // the onboarding spotlight (7.1)
    let s = '<div class="rs"><div class="rs-head"><h2>NIGHT ' + (v.night + 1) + ' · WHO GOES TONIGHT?</h2>' +
      '<button class="xbtn" data-do="rsClose" aria-label="Close">' + ic('close') + '</button></div><div class="rs-dests" aria-label="Destinations">';
    for (const d of v.dests) {
      const on = d.id === dest;
      let pips = '<span class="pips" aria-hidden="true">'; for (let i = 1; i <= 6; i++) pips += '<i' + (i <= d.n ? ' class="f"' : '') + '></i>'; pips += '</span>';
      const l2 = d.open ? '<span class="dl">' + ic('brick') + fmt.num(d.bricks) + ' · ' + ic('can') + fmt.num(d.cans) + '</span>' + (d.cleared ? '<span></span>' : '<span class="fc">✦ ' + d.firstSparks + '</span>')
        : '<span class="dl">' + ic('lock', '#a9aeb3') + esc(d.lock) + '</span><span></span>';
      const why = d.open ? null : d.name + (/^Tower/.test(d.lock) ? ' opens at ' + d.lock : ': ' + d.lock.toLowerCase());
      s += '<button class="dest' + (on ? ' on' : '') + (d.open ? '' : ' locked') + (gd === d.id && !on ? ' pulse' : '') + '" data-do="rsDest" data-id="' + d.id + '" data-k="' + d.id + '" aria-pressed="' + on + '"' +
        (why ? ' aria-disabled="true" data-why="' + esc(why) + '"' : '') + ' aria-label="' + esc(d.name + ', threat ' + d.n + ' of 6' + (d.open ? ', win ' + d.bricks + ' bricks and ' + d.cans + ' cans' : ', locked: ' + d.lock)) + '">' +
        '<span class="dn">' + esc(d.name) + '</span>' + pips + l2 + '</button>';
    }
    s += '</div><div class="rs-right"><div class="rs-strip" aria-label="Who can go">';
    for (const r of strip) {
      const q = personV(r.personId); if (!q) continue;
      const home = r.personId === sel && c ? c.odds.home : r.home;
      const badge = home == null ? '…' : fmt.pct(home), bc = home == null ? 'wait' : home >= 0.85 ? 'good' : home >= 0.7 ? 'ok' : 'low';
      const chip = r.state === 'recovering' ? r.chip.replace('Recovering', 'Rec.') : r.chip;
      s += '<button class="rn' + (r.personId === sel ? ' on' : '') + '" data-do="rsPick" data-id="' + r.personId + '" data-k="' + r.personId + '" aria-pressed="' + (r.personId === sel) + '" aria-label="' +
        esc(q.first + ', home ' + (home == null ? 'not known yet' : badge) + ', ' + r.chip) + '"><span class="pp">' + portrait(q.look, Math.round((wide ? 40 : 32) * (ui.layout.k || 1)), false, 'pi') +
        '<span class="ob ' + bc + '">' + badge + '</span></span><b>' + esc(q.first) + '</b><span class="sc ' + r.state + '">' + esc(chip) + '</span></button>';
    }
    if (!strip.length) s += '<p class="empty">Nobody can go right now.</p>';
    s += '</div>' + rsCardHtml(p, c, wide);
    const json = '<button class="jlink" data-do="rsHandoff" aria-label="Sent to the game: the handoff JSON">Sent to the game<b>›</b></button>';
    const rest = rsRestHtml(p, c, wide), kits = rsKitHtml(dest, c, wide), go = rsGoHtml(p, c, gd === dest);
    if (wide) s += '<div class="rs-rowa">' + kits + rest + '</div><div class="rs-rowb">' + json + go + '</div>';
    else s += '<div class="rs-rowa">' + json + rest + '</div><div class="rs-rowb">' + kits + go + '</div>';
    return s + '</div></div>';
  }
  function rsCardHtml(p, c, wide) {
    if (!p) return '<div class="rs-card"><p class="empty">Nobody can go right now. A drifter walks in when nobody is home.</p></div>';
    const dv = E.derived(S, p.id, rs.destId), f = lvFrac(p.lv, p.xp, p.xpFrom, p.xpTo);
    let s = '<div class="rs-card">' + pp(p.look, wide ? 72 : 48) +
      '<div class="rc-info"><div class="rc-name">' + esc(p.fullName) + (wide ? '' : '<small>LV ' + p.lv + '</small>') + '</div><div class="rc-role">' + esc(dv.roleLine) + '</div><div class="rc-ttl">' + esc(dv.ttlLine) + '</div>' +
      '<div class="rc-chips">' + (wide ? pill(p.traitChip, 'warm') : pill(dv.roleLine) + pill(p.traitName.toUpperCase(), 'warm')) + '</div>' +
      '<div class="rc-lv"><b>LV ' + p.lv + '</b><span class="lvbar"><i style="width:' + (f * 100).toFixed(1) + '%"></i></span><small>' + (p.lv >= 10 ? 'max level' : fmt.num(p.xp) + ' / ' + fmt.num(p.xpTo) + ' XP') + '</small></div></div><div class="rc-odds">';
    if (!c) return s + '<div class="rc-big"><span class="h">HOME …</span><span class="sep">·</span><span class="d">DEATH …</span></div><div class="rc-l one">Working out the odds from 400 runs…</div></div></div>';
    const o = c.odds, safe = o.safe, q = safe === 'home' ? 'close to home' : safe === 'third' ? 'nobody dies before your third person' : null;
    s += '<div class="rc-big"><span class="h">' + esc(c.homeText) + '</span><span class="sep">·</span><span class="d' + (c.deathRed ? ' red' : '') + '">' + esc(q ? 'DEATH 0%' : c.deathText) + '</span>' +
      (q ? '<span class="q">· ' + q + '</span>' : '') + '</div>';
    const lines = [];
    if (q) lines.push(['q', cap1(q) + '.']);
    if (c.fallLine) lines.push(['cost', c.fallLine]);                     // R15: what a fall would cost, before GO
    if (c.tiredLine) lines.push(['tired', c.tiredLine]);
    else if (p.state === 'rest') lines.push(['tired', (p.hpText || '') + ' now · the rested odds are on the way']);
    lines.push(['hint', c.hint]);
    const one = c.fallLine ? 'cost' : q ? 'q' : 'hint';                   // 568: one 13 px line (8.7.1); "close to home" in full
    for (const l of lines) s += '<div class="rc-l ' + l[0] + (l[0] === one ? ' one' : '') + '">' + esc(l[1]) + '</div>';
    return s + '</div></div>';
  }
  function rsKitHtml(dest, c, wide) {
    const pr = (V.dests.find((x) => x.id === dest) || {}).kit || { medkit: 0, pills: 0, bomb: 0 }, k = E.kitNorm(S, dest, rs.kit);
    let s = '<div class="kits" role="group" aria-label="The kit: packed if the cans allow, you only pay for what gets used">';
    for (const it of KIT_ITEMS) {
      const open = kitUnlocked(it), on = open && !!k[it], t = c ? c.toggles.find((x) => x.item === it) : null;
      const eff = t && t.delta != null ? signPct(t.delta) : open ? '…' : '';
      const aria = KIT_WORD[it] + (open ? ', ' + pr[it] + ' cans, ' + (on ? 'packed' : 'left at home') + (t && t.delta != null ? ', ' + eff + ' home' : '') : ', needs ' + kitLock(it));
      s += '<button class="kit' + (on ? ' on' : '') + (open ? '' : ' lock') + '" data-do="rsKit" data-item="' + it + '" aria-pressed="' + on + '" aria-label="' + esc(aria) + '"' +
        (open ? '' : ' aria-disabled="true" data-why="' + esc(KIT_WORD[it] + ' needs ' + kitLock(it)) + '"') + '>' + ic(it) +
        '<span class="kt"><b>' + esc(KIT_WORD[it]) + '</b><small>' + (open ? ic('can') + pr[it] + (wide ? ' · <span class="e">' + eff + '</span>' : '') : ic('lock', '#a9aeb3') + (it === 'bomb' ? 'ARM 2' : 'CLINIC')) + '</small></span>' +
        (on ? '<span class="ck">' + ic('check', '#12161c') + '</span>' : '') + '</button>';
    }
    return s + '</div>';
  }
  // REST NOW (R7): only while the selected runner is not fully rested; at 568 the label carries the rested odds
  function rsRestHtml(p, c, wide) {
    if (!p || p.state !== 'rest') return '';
    const pr = E.price.skip(p.restLeftMs / 1000, S), key = 'rest:' + p.id, conf = skipConfirming(key);
    const after = !wide && c && c.rest ? ' → ' + fmt.pct(c.rest.home) : '';
    const label = pr === 0 ? 'REST NOW · FREE' : 'REST NOW · ' + pr + ' ✦' + (conf ? '?' : '');
    return '<button class="btn ' + (pr === 0 ? 'good' : 'spark' + (conf ? ' confirm' : '')) + ' rest-btn" data-do="restNow" data-id="' + p.id + '" aria-label="' +
      esc('Rest now: ' + (pr ? pr + ' sparks' : 'free') + (c && c.rest ? ', home ' + fmt.pct(c.rest.home) + ' after' : '')) + '">' + esc(label + after) + '</button>';
  }
  function rsGoHtml(p, c, pulse) {
    if (!p) return '<button class="go-btn off" data-do="noop" aria-disabled="true" data-why="Nobody can go right now">GO</button>';
    const name = 'GO · ' + p.first.toUpperCase();
    if (!c) return '<button class="go-btn off" data-do="rsGo" data-primary="1" aria-disabled="true" data-why="One moment: working out the odds">' + esc(name) + '<small>working out the odds…</small></button>';
    if (c.go.err === 'cost') return '<button class="go-btn off" data-do="rsGo" data-primary="1" aria-disabled="true" data-why="' + esc('Need ' + fmt.num(c.kitTotal - S.res.cans) + ' more cans for the kit') + '">' + esc(name) + '<small>not enough cans for the kit</small></button>';
    const armed = c.low && Date.now() < rs.lowUntil;
    const sub = armed ? 'tap again to go' : c.low ? 'home ' + fmt.pct(c.odds.home) : c.kitTotal ? c.kitTotal + ' cans held for the kit' : 'no kit packed';
    return '<button class="go-btn' + (c.low ? ' low' : '') + (armed ? ' armed' : '') + (pulse && !c.low ? ' pulse' : '') + '" data-do="rsGo" data-primary="1" aria-label="' + esc((c.low ? 'Run it anyway? ' : 'Go: ') + p.first + ', ' + c.homeText + ', ' + c.deathText) + '">' +
      esc(c.low ? 'RUN IT ANYWAY?' : name) + '<small>' + esc(sub) + '</small></button>';
  }
  Object.assign(DO, {
    rsClose() { closeOverlay('run'); },
    rsDest(el) { const id = el.dataset.id; if (!id || id === rs.destId) return; rs.destId = id; rs.kit = null; rs.lowUntil = 0; if (!rs.picked) rs.personId = null; rsMark(); renderOverlay(); },
    rsPick(el) { const id = el.dataset.id; if (rs.personId !== id || !rs.picked) { rs.personId = id; rs.picked = true; rs.kit = null; rs.lowUntil = 0; rsMark(); } renderOverlay(); },
    rsKit(el) {
      const it = el.dataset.item, sel = rsSel(); if (!sel || !KIT_ITEMS.includes(it)) return;
      const pr = (V.dests.find((x) => x.id === rs.destId) || {}).kit, k = E.kitNorm(S, rs.destId, rs.kit);
      let tot = 0; for (const x of KIT_ITEMS) if (k[x]) tot += pr[x];
      if (!k[it] && tot + pr[it] > S.res.cans) { toast('Need ' + fmt.num(tot + pr[it] - S.res.cans) + ' more cans to pack the ' + D.TEXT.kitLower[it], { kind: 'bad', icon: 'can' }); return; }
      k[it] = k[it] ? 0 : 1; rs.kit = k; rs.personId = sel; rs.lowUntil = 0;
      renderOverlay();
      if (!wideL()) {                                             // 568: the toggle's effect shows in a toast (8.7.1)
        const dl = E.kitDeltas(S, rs.destId, sel, k, { cachedOnly: true }), d = dl && dl[it] != null ? ' · ' + signPct(dl[it]) + ' home' : '';
        toast(KIT_WORD[it] + ' · ' + pr[it] + ' cans' + d + (k[it] ? ' · packed' : ' · left at home'), { icon: it });
      }
    },
    rsGo() {
      const sel = rsSel(), c = rsCard(sel); if (!sel) return;
      if (!c) { toast('One moment: working out the odds'); return; }
      if (c.low && Date.now() >= rs.lowUntil) {                   // "Run it anyway?": a second tap within 3 s
        rs.lowUntil = Date.now() + 3000; renderOverlay();
        setTimeout(() => { if (isOv('run')) { ui.panelDirty = true; renderOverlay(); } }, 3050);
        return;
      }
      const r = doAct({ type: 'startRun', destId: rs.destId, personId: sel, kit: c.kit, confirmLow: !!c.low }, { quiet: true });
      rs.lowUntil = 0;
      if (!r.ok) { if (r.err === 'confirm') { rs.lowUntil = Date.now() + 3000; renderOverlay(); return; } explain(r); renderOverlay(); return; }
      goFlow(sel, r.data);
    },
    rsHandoff() {
      const sel = rsSel(); if (!sel) return;
      const h = E.buildHandoff(S, rs.destId, sel, rs.kit, null);
      if (h) openOverlay('json', { title: 'SENT TO THE GAME', sub: 'Tonight’s handoff to Two Thumbs Left. A preview: the run seed is drawn at GO.', json: h });
    },
  });

  // ---------------------------------------------------------------------------------------------- GO: the walk to the gate (4.12, 6.4)
  // The handoff, refs, the held kit and the run-warp allowance are saved by startRun before anything moves. The runner
  // walks to the gate with the camera following (1.2 s) and through it, then the screen fades to night. Homecomings
  // wait (iso.holdArrivals) until the result card closes.
  let flow = null;                                                // { personId, runId, opened }
  function goFlow(pid, data) {
    closeOverlay('run');
    if (iso) iso.holdArrivals(true);
    flow = { personId: pid, runId: data.runId, opened: false, cam: iso ? iso.getCamera() : null };   // the view before the camera followed the runner out
    const f = flow, toNight = () => { if (flow !== f || f.opened) return; openRunScreen(); };
    try { if (iso) iso.walkOut(pid, { follow: true, onGate: () => setTimeout(toNight, ui.reduced ? 120 : 420) }); } catch (e) { console.error(e); }
    setTimeout(toNight, ui.reduced ? 600 : 2600);                // a fallback when the walk is cut short or off screen
  }
  function openRunScreen() {
    if (!S.pending || isOv('runscreen')) return;
    if (flow) flow.opened = true;
    if (iso) iso.holdArrivals(true);
    if (ui.mode) cancelMode();
    if (ui.sheet) closeSheet();
    openOverlay('runscreen', {});
  }

  // ---------------------------------------------------------------------------------------------- the run screen (6.4, 8.7.2)
  // The simulated night: the strip from the start room to the safe room, the model's events popping as the dot reaches
  // them, the HP bar (temporary HP in white), the kill counter; » jumps to the end. A reload replays the same night
  // (the engine's runSim reads the seed and run input saved at GO). "Wait for a real result" (the Lab) shows the
  // handoff and waits for a pasted result, with a way to simulate it instead.
  let rsc = null;
  const FIGHT_W = { streets: 0.3, horde: 1, gate: 1.6 };
  OVERLAYS.runscreen = {
    dark: true,
    onOpen() { if (!rsc || !S.pending || rsc.runId !== S.pending.runId) rscInit(); if (iso) iso.holdArrivals(true); },
    render() { if (!S.pending && !(rsc && rsc.resolving)) return null; return rsc ? rsc.html : null; },
    esc() { if (rsc && !rsc.sim) closeOverlay('runscreen'); else DO.rscSkip(); },
  };
  function rscInit() {
    const pe = S.pending; if (!pe) { rsc = null; return; }
    const sim = pe.source === 'sim', h = pe.handoff || {}, pl = h.player || {};
    rsc = { runId: pe.runId, personId: pe.personId, sim, t0: 0, dur: Math.max(1000, (S.lab.runScreenS || 8) * 1000), idx: 0, ended: false, endAt: 0, resolved: false, resolving: false,
      max: pl.maxHp || 100, hp: Math.min(pl.maxHp || 100, pl.startHp || pl.maxHp || 100), temp: 0, bumps: 0, lastBeat: 0, lastF: 0, gate: false, evs: [], res: null, end: 1, trickle: 0 };
    if (sim) {
      const res = E.runSim(S); rsc.res = res; rsc.win = res.result === 'safe_room';
      const end = rsc.win ? 1 : clamp(+res.progress || 0, 0.02, 1), T = Math.max(1, res.time);
      rsc.end = end;
      for (const e of res.events || []) {
        const k = e[1]; if (k === 'safe_room' || k === 'overrun_end') continue;
        rsc.evs.push({ t: e[0], k, v: e[2], f: k === 'overrun' ? end : clamp(e[0] / T, 0, end), kills: 0 });
      }
      // the kill counter: 40 % trickles in along the way, 60 % lands at the fights (weighted like the model's fights)
      let tw = 0; const fights = rsc.evs.filter((e) => FIGHT_W[e.k]); for (const e of fights) tw += FIGHT_W[e.k];
      const K = res.kills || 0, fk = tw ? Math.round(K * 0.6) : 0; rsc.trickle = K - fk;
      let given = 0; fights.forEach((e, i) => { e.kills = i === fights.length - 1 ? fk - given : Math.round(fk * FIGHT_W[e.k] / tw); given += e.kills; });
    }
    rsc.html = rscHtml(pe);
  }
  function rscHtml(pe) {
    const h = pe.handoff || {}, d = V.dests.find((x) => x.id === pe.destId) || {}, p = personV(pe.personId), wide = wideL();
    const name = p ? p.fullName : (h.runner && h.runner.name) || 'The runner';
    let s = '<div class="rsc" data-k="rsc-' + esc(pe.runId) + '"><div class="rsc-top">' + pp(p ? p.look : null, wide ? 64 : 48) + '<div class="rsc-who"><b>' + esc(name) + '</b><span>Night ' + pe.night + ' · ' + esc(d.name || '') + '</span></div>';
    if (!rsc.sim) {
      s += '</div><button class="xbtn skip" data-do="closeOverlay" aria-label="Close">' + ic('close') + '</button><div class="rsc-wait"><p style="margin:0;font-size:15px">Waiting for Two Thumbs Left. Paste the result JSON in the Lab’s Runs group, or simulate this night instead.</p>' +
        '<div class="row">' + (BH.Lab && BH.Lab.open ? btn({ do: 'rscLab', cls: 'ghost', label: 'OPEN THE LAB', icon: 'flask' }) : '') + btn({ do: 'rscSimulate', cls: 'primary', label: 'SIMULATE IT', primary: true }) +
        btn({ do: 'copyHandoff', cls: 'ghost', label: 'COPY THE HANDOFF' }) + '</div><div class="sec" style="margin-top:6px">Sent to the game</div><pre class="hj">' + esc(JSON.stringify(h, null, 2)) + '</pre></div></div>';
      return s;
    }
    s += '<div class="rsc-hp"><div class="hl">HP<b class="hpn">' + Math.round(rsc.hp) + ' / ' + rsc.max + '</b></div><div class="hpbar"><i class="tmp" style="transform:scaleX(' + (rsc.hp / rsc.max).toFixed(3) + ')"></i><i class="hp" style="transform:scaleX(' + (rsc.hp / rsc.max).toFixed(3) + ')"></i></div></div>' +
      '<div class="rsc-kills"><small>KILLS</small><b class="kn">0</b></div></div><button class="skip" data-do="rscSkip" data-primary="1" aria-label="Skip to the end">»</button>';
    s += '<div class="rsc-mid"><div class="rsc-ban" aria-live="polite"><span class="bn"></span></div><div class="track"><i class="lane"></i><i class="done"></i><i class="gatez" style="left:78%;width:14%"></i>' +
      '<i class="room s"></i><i class="room e"></i><span class="lbl s">START ROOM</span><span class="lbl g" style="left:85%">GATE</span><span class="lbl e">SAFE ROOM</span>';
    rsc.evs.forEach((e, i) => {
      const left = 'left:' + (e.f * 100).toFixed(2) + '%';
      if (e.k === 'streets') s += '<i class="mk" data-i="' + i + '" style="' + left + '"></i>';
      else if (e.k === 'horde') s += '<i class="mk horde" data-i="' + i + '" style="' + left + '"></i>';
      else if (e.k === 'pills' || e.k === 'medkit' || e.k === 'noiseBomb') s += '<i class="mk item" data-i="' + i + '" style="' + left + '">' + ic(e.k === 'noiseBomb' ? 'bomb' : e.k) + '</i>';
      else if (e.k === 'secondWind') s += '<i class="mk sw" data-i="' + i + '" style="' + left + '">SECOND WIND</i>';
      else if (e.k === 'overrun') s += '<i class="mk ko" data-i="' + i + '" style="' + left + '"></i>';
    });
    s += '<i class="dot"><i class="ring"></i></i></div></div><div class="rsc-log" aria-live="polite"></div></div>';
    return s;
  }
  function rscEls() {
    const root = $('overlay').querySelector('.rsc'); if (!root) return null;
    if (rsc.el && rsc.el.root === root) return rsc.el;
    rsc.el = { root, dot: root.querySelector('.dot'), done: root.querySelector('.done'), hp: root.querySelector('.hpbar .hp'), tmp: root.querySelector('.hpbar .tmp'), bar: root.querySelector('.hpbar'),
      hpn: root.querySelector('.hpn'), kn: root.querySelector('.kn'), log: root.querySelector('.rsc-log'), ban: root.querySelector('.bn'), gate: root.querySelector('.gatez') };
    return rsc.el;
  }
  function rscLog(el, t, text, cls) {
    if (!el.log) return;
    for (const q of el.log.children) q.classList.add('old');
    const p = document.createElement('p'); if (cls) p.className = cls;
    p.innerHTML = (t != null ? '<b>' + fmt.clock(t) + '</b>' : '') + esc(text);
    el.log.appendChild(p);
    while (el.log.children.length > 3) el.log.removeChild(el.log.firstChild);
  }
  function rscBanner(el, text, cls, arrow) {
    if (!el.ban) return;
    el.ban.className = 'bn'; void el.ban.offsetWidth;
    el.ban.className = 'bn show' + (cls ? ' ' + cls : '');
    el.ban.innerHTML = esc(text) + (arrow ? '<i class="arrow"></i>' : '');
    clearTimeout(rsc.banT); rsc.banT = setTimeout(() => { if (el.ban && rsc && !rsc.ended) el.ban.className = 'bn'; }, 1400);
  }
  function rscHp(el) {
    const f = clamp(rsc.hp / rsc.max, 0, 1), ft = clamp((rsc.hp + rsc.temp) / rsc.max, 0, 1);
    if (el.hp) el.hp.style.transform = 'scaleX(' + f.toFixed(3) + ')';
    if (el.tmp) el.tmp.style.transform = 'scaleX(' + ft.toFixed(3) + ')';
    if (el.bar) el.bar.classList.toggle('low', f < 0.3);
    if (el.hpn) el.hpn.textContent = Math.round(rsc.hp) + (rsc.temp > 0 ? ' +' + Math.round(rsc.temp) : '') + ' / ' + rsc.max;
  }
  function rscFire(el, e) {
    const mk = el.root.querySelector('.mk[data-i="' + rsc.evs.indexOf(e) + '"]'); if (mk) mk.classList.add('on');
    const hit = (d) => { d = Math.max(0, +d || 0); const ft = Math.min(rsc.temp, d); rsc.temp -= ft; rsc.hp = Math.max(1, rsc.hp - (d - ft)); return d; };
    switch (e.k) {
      case 'streets': { const d = hit(e.v); rsc.bumps += e.kills; rscLog(el, e.t, 'Wanderers · ' + (d ? '−' + d + ' HP' : 'no harm')); break; }
      case 'horde': { const d = hit(e.v); rsc.bumps += e.kills; rscLog(el, e.t, 'HORDE! · −' + d + ' HP', 'bad'); rscBanner(el, 'HORDE!', '', true); sfx('horde'); break; }
      case 'gate': {
        const d = hit(e.v); rsc.bumps += e.kills; rsc.gate = true; rscLog(el, e.t, 'The gate · −' + d + ' HP', 'bad'); rscBanner(el, 'THE GATE', 'calm');
        if (el.gate) el.gate.classList.add('hot'); if (el.dot && !ui.reduced) el.dot.classList.add('gate'); sfx('horde', { gate: true }); break;
      }
      case 'noiseBomb': rscLog(el, e.t, 'Noise bomb · the horde follows the beeping'); break;   // 6.4 says "they follow": no pronouns on screen
      case 'pills': rsc.temp = Math.min(rsc.max - rsc.hp, rsc.temp + (+e.v || 50)); rscLog(el, e.t, 'Pills · +' + (+e.v || 50) + ' temporary HP', 'good'); break;
      case 'medkit': rsc.hp = Math.min(rsc.max, rsc.hp + (+e.v || 0)); rsc.temp = Math.min(rsc.temp, rsc.max - rsc.hp); rscLog(el, e.t, 'Medkit · +' + (+e.v || 0) + ' HP', 'good'); break;
      case 'secondWind': rscLog(el, e.t, 'SECOND WIND', 'bad'); rscBanner(el, 'SECOND WIND'); sfx('heartbeat'); break;
      case 'overrun': {
        rsc.hp = 0; rsc.temp = 0; const w = { streets: 'in the streets', hordes: 'in a horde', gate: 'at the gate' }[e.v] || 'out there';
        rscLog(el, rsc.res ? rsc.res.time : e.t, 'Overrun ' + w + '.', 'bad'); if (el.dot) el.dot.classList.add('dead'); break;
      }
      default: break;
    }
    rsc.lastF = e.f;
    rscHp(el);
  }
  function rscFrame(ts) {
    if (!rsc || !rsc.sim || rsc.resolved || !isOv('runscreen')) return;
    const el = rscEls(); if (!el) return;
    if (!rsc.t0) { rsc.t0 = ts; sfx('drone', { on: true }); rscLog(el, 0, 'Out of the start room.'); }
    const k = clamp((ts - rsc.t0) / rsc.dur, 0, 1), x = k * rsc.end;
    while (!rsc.ended && rsc.idx < rsc.evs.length && rsc.evs[rsc.idx].f <= x + 1e-9) rscFire(el, rsc.evs[rsc.idx++]);
    const shown = rsc.ended ? rsc.end : ui.reduced ? rsc.lastF : x;   // reduced motion: the dot steps from event to event (8.17)
    if (el.dot) el.dot.style.left = (shown * 100).toFixed(2) + '%';
    if (el.done) el.done.style.transform = 'scaleX(' + shown.toFixed(4) + ')';
    if (el.kn && !rsc.ended) el.kn.textContent = String(Math.round(rsc.trickle * (rsc.end ? Math.min(1, x / rsc.end) : 1)) + rsc.bumps);
    if (!rsc.ended && rsc.hp > 0 && rsc.hp / rsc.max < 0.3 && ts - rsc.lastBeat > 900) { rsc.lastBeat = ts; sfx('heartbeat'); }
    if (k >= 1 && !rsc.ended) rscEnd(el, ts);
    if (rsc.ended && ts - rsc.endAt > (rsc.skipped ? 350 : ui.reduced ? 500 : 1100)) rscResolve();
  }
  function rscEnd(el, ts) {
    while (rsc.idx < rsc.evs.length) rscFire(el, rsc.evs[rsc.idx++]);
    rsc.ended = true; rsc.endAt = ts;
    const r = rsc.res;
    if (el.kn) el.kn.textContent = String(r.kills);
    if (el.dot) el.dot.style.left = (rsc.end * 100).toFixed(2) + '%';
    if (el.done) el.done.style.transform = 'scaleX(' + rsc.end.toFixed(4) + ')';
    if (rsc.win) { rsc.hp = r.endHp; rsc.temp = 0; rscHp(el); rscLog(el, r.time, 'SAFE ROOM · You made it.', 'good'); rscBanner(el, 'YOU MADE IT', 'go'); }
    else rscBanner(el, 'OVERRUN');
    sfx('drone', { on: false });
  }
  function rscResolve() {
    if (!rsc || rsc.resolved) return;
    rsc.resolved = true; rsc.resolving = true;
    resolveNow({ type: 'resolveRun', source: 'sim' });
  }
  // resolve the pending run (the run screen's end, SIMULATE IT, or a pasted result) and show the result card
  function resolveNow(action) {
    const before = { bricks: S.res.bricks, cans: S.res.cans, sparks: S.res.sparks };
    const r = doAct(action, { quiet: true });
    if (rsc) rsc.resolving = false;
    if (!r.ok) {
      const er = r.data && r.data.errors && r.data.errors[0];
      toast(er || 'The result could not be applied', { kind: 'bad' });
      if (isOv('runscreen') && !S.pending) closeOverlay('runscreen');
      return r;
    }
    showResult(r.data, before);
    return r;
  }
  Object.assign(DO, {
    rscSkip() {
      if (!rsc || !rsc.sim || rsc.resolved) return;
      const el = rscEls(); if (!el) return;
      if (!rsc.t0) rsc.t0 = now();
      if (!rsc.ended) { rsc.skipped = true; rscEnd(el, now()); return; }
      rscResolve();
    },
    rscSimulate() { if (!S.pending) return; if (rsc) { rsc.resolved = true; rsc.resolving = true; } resolveNow({ type: 'resolveRun', source: 'sim' }); },
    rscLab() { closeOverlay('runscreen'); openLab(); },
    copyHandoff() { const pe = S.pending; if (pe && pe.handoff) copyText(JSON.stringify(pe.handoff, null, 2)); },
  });

  // ---------------------------------------------------------------------------------------------- the result card and the fall beat (8.7.3, 6.6.1)
  // The loot is already in storage when the card opens (resolveRun saved it); the chips keep their old numbers
  // (ui.inflight) and the gains fly to them when BACK TO TOWN closes the card. On "Overrun." the stats show first, then
  // "Did Emre make it home?" plays for 1.5 s (two heartbeats, the portrait greys; instant with reduced motion), then
  // either the Hurt line or the revive offer (opened once). BACK TO TOWN waits for the beat.
  function showResult(data, before) {
    const rw = data.reward, gains = {};
    for (const k of RES) { const g = S.res[k] - before[k]; if (g > 0) { gains[k] = g; ui.inflight[k] += g; } }
    const a = { rw, notes: data.notes || [], result: data.result, handoff: S.lastRun ? S.lastRun.handoff : null, gains, phase: null, timers: [], started: false, offerShown: false };
    // behind the night screens the camera goes back to where the player had it before following the runner out onto the
    // road (else the city stays shoved into a corner); the homecoming then only nudges it to keep the gate in view
    if (flow && flow.cam && iso) { try { iso.setCamera(flow.cam, { ease: false }); } catch (e) { /* the camera clamps it */ } }
    rsc = null; if (flow) flow.opened = true;
    if (iso) iso.holdArrivals(true);
    if (isOv('runscreen')) swapOverlay('result', a); else openOverlay('result', a);
  }
  OVERLAYS.result = {
    dark: true,
    onOpen(a) { if (!a.started) { a.started = true; resultStart(a); } else if (!a.rw.win && a.phase === 'done') setTimeout(resultReveal, 0); },   // back from the offer: the outcome line in view
    onClose(a) { resultClosed(a); },
    render(v, a) { return resultHtml(v, a); },
    esc(a) { if (a.phase === 'done') closeOverlay('result'); },
  };
  function resultStart(a) {
    const rw = a.rw, beat = !rw.win && !!(rw.lines && rw.lines.beat);
    const later = (fn, ms) => a.timers.push(setTimeout(fn, ms));
    if (!beat) a.phase = 'done';
    else if (ui.reduced) { a.phase = 'done'; if (rw.outcome === 'down') later(() => resultOffer(a), 60); }   // 8.17: the outcome at once
    else {
      a.phase = 'stats';
      later(() => {
        a.phase = 'beat'; sfx('fallBeat'); if (isOv('result')) { renderOverlay(); resultReveal(); }
        later(() => { a.phase = 'done'; if (isOv('result')) { renderOverlay(); resultReveal(); } if (rw.outcome === 'down') resultOffer(a); }, 1500);
      }, 1100);
    }
    if (!rw.win && a.phase === 'done') later(resultReveal, 30);
    if (rw.sparks && (rw.sparks.firstClear || rw.sparks.daily)) later(() => sfx('spark'), 450);
    if (rw.levelUps && rw.levelUps.length) later(() => sfx('levelUp'), 700);
    if (rw.nickname) later(() => sfx('nickname'), 1000);
    requestAnimationFrame(countUp);
  }
  // At 568 the card scrolls (8.7.3): after a loss, keep the fall line (the beat, then the outcome) in view
  function resultReveal() {
    const f = $('overlay').querySelector('.res-body .fall'), body = f ? f.closest('.res-body') : null;
    if (!body || body.scrollHeight <= body.clientHeight + 1) return;
    const fb = f.getBoundingClientRect(), bb = body.getBoundingClientRect();
    if (fb.bottom > bb.bottom - 4) body.scrollTop += fb.bottom - bb.bottom + 8;
  }
  function resultOffer(a) {
    if (a.offerShown) return;
    a.offerShown = true;
    if (E.offer(S, a.rw.personId)) openOverlay('offer', { personId: a.rw.personId, fromResult: true });
  }
  function countUp() {                                            // the loot rows count up (8.7.3); reduced motion shows the totals
    if (ui.reduced || !isOv('result')) return;
    const els = Array.prototype.slice.call($('overlay').querySelectorAll('[data-count]')); if (!els.length) return;
    const t0 = now(), dur = 750;
    const step = () => {
      const k = clamp((now() - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3);
      for (const el of els) if (el.isConnected) el.textContent = fmt.num(Math.round((+el.dataset.count || 0) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }
  function resultHtml(v, a) {
    const rw = a.rw, res = a.result || {}, L = rw.lines || {}, p = personV(rw.personId), wide = wideL(), first = p ? p.first : 'The runner';
    const st = p ? p.state : null, grey = a.phase === 'beat' || (a.phase === 'done' && (st === 'down' || st === 'fallen'));
    let s = '<div class="rcd"><div class="res-card"><div class="res-body"><div class="res-top">' + pp(p ? p.look : null, wide ? 64 : 52, false, grey ? 'grey' : '') +
      '<h2 class="' + (rw.win ? 'win' : 'loss') + '">' + esc(L.title || (rw.win ? 'You made it.' : 'Overrun.')) + '<small>' + esc(L.sub || '') + '</small></h2></div>';
    const stats = [['Time', fmt.clock(res.time || 0)], ['Kills', fmt.num(res.kills || 0)], ['Accuracy', (res.accuracy || 0) + '%'], ['Shoves', fmt.num(res.shoves || 0)], ['Damage taken', fmt.num(res.damageTaken || 0)], ['Hordes', fmt.num(res.hordes || 0)]];
    s += '<dl class="stats">' + stats.map((x) => '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>').join('') + '</dl><div class="loot">';
    const cnt = (n) => '<b>+<span data-count="' + n + '">' + fmt.num(n) + '</span></b>';
    s += '<div class="lr"><span class="amt">' + ic('brick') + cnt(rw.bricks) + '</span>' + (rw.killBricks ? '<span class="soft">' + esc(L.salvage) + '</span>' : '') +
      '<span class="amt">' + ic('can') + cnt(rw.cans) + '</span>' + (rw.sparks.firstClear || rw.sparks.daily ? '<span class="amt spark-t">' + ic('spark') + '<b>+' + (rw.sparks.firstClear + rw.sparks.daily) + '</b></span>' +
        // the sparks row of 8.7.3 rides on the loot row: the card fits 330 px (and 568) without scrolling more often
        '<span class="soft spark-t">' + [rw.sparks.firstClear ? 'first clear' : '', rw.sparks.daily ? 'daily spark' : ''].filter(Boolean).join(' · ') + '</span>' : '') + '</div>';
    const f = lvFrac(rw.lvTo, rw.xpNow, rw.xpFrom, rw.xpTo), up = rw.levelUps && rw.levelUps.length;
    s += '<div class="lr xp"><span class="amt">' + cnt(rw.xp) + '<b>XP</b></span><span class="lvbar grow"><i style="width:' + (f * 100).toFixed(1) + '%"></i></span><span class="soft">Lv ' + rw.lvTo +
      (rw.lvTo < 10 ? ' · ' + fmt.num(rw.xpNow) + ' / ' + fmt.num(rw.xpTo) : '') + '</span>' + (up ? '<span class="lvpop">LV ' + rw.lvTo + '</span>' : '') + '</div>';
    if (L.nick) s += '<div class="nickc">' + esc(L.nick).replace('“' + esc(rw.nickName) + '”', '<b>“' + esc(rw.nickName) + '”</b>') + '</div>';
    if (L.kit) s += '<div class="lr soft">' + esc(L.kit) + '</div>';
    if (L.overflow) s += '<div class="lr" style="color:var(--timer)">' + esc(L.overflow) + '</div>';
    s += resultFall(a, p, first) + '</div></div></div>';
    const back = a.phase === 'done';
    s += '<div class="res-bar"><span class="links"><button class="jlink" data-do="resJson" data-which="handoff">Sent to the game<b>›</b></button><button class="jlink" data-do="resJson" data-which="result">Back from the game<b>›</b></button></span>' +
      '<button class="go-btn' + (back ? '' : ' off') + '" data-do="resultBack" data-primary="1"' + (back ? '' : ' aria-disabled="true" data-why="One moment"') + '>BACK TO TOWN</button></div></div>';
    return s;
  }
  function resultFall(a, p, first) {
    const rw = a.rw, L = rw.lines || {};
    if (rw.win) return L.rest ? '<div class="lr rest">' + ic('house') + '<span class="grow">' + esc(L.rest) + '</span></div>' : '';
    if (a.phase === 'stats') return '';
    if (a.phase === 'beat') return '<div class="fall beat"><i></i><span class="grow">' + esc(L.beat) + '</span></div>';
    if (rw.outcome === 'hurt') return '<div class="fall">' + ic('heart', '#ff8f7a') + '<span class="grow">' + esc(L.fall) + '</span></div>';
    // Down: what happened since (the offer decides it)
    if (!p) return '';
    if (p.state === 'down') return '<div class="fall beat">' + ic('heart', '#ff4b2f') + '<span class="grow">' + esc(first + ' is Down · ' + fmt.hoursLeft(p.downLeftMs) + ' to decide.') + '</span>' +
      btn({ do: 'decide', data: { id: p.id }, cls: 'primary', label: 'DECIDE' }) + '</div>';
    if (p.state === 'rest') return '<div class="fall">' + ic('heart', '#9fd3cb') + '<span class="grow">' + esc(first + ' is recovering · ' + p.pill.replace(/^Recovering /, '') + ' left.') + '</span></div>';
    if (p.state === 'ready') return '<div class="fall">' + ic('heart', '#3bd16f') + '<span class="grow">' + esc(first + ' is up and Ready.') + '</span></div>';
    return '<div class="fall">' + ic('grave') + '<span class="grow">' + esc(first + ' rests in Bellhaven now.') + '</span></div>';
  }
  function resultClosed(a) {
    for (const t of a.timers || []) clearTimeout(t); a.timers = [];
    const L = ui.layout, k = L.k || 1, from = { x: L.W - L.pr - (L.bb === 'compact' ? 84 : 118) * k, y: L.H - L.pb - 28 * k };
    for (const r of RES) { const g = a.gains && a.gains[r]; if (g > 0) { ui.inflight[r] = Math.max(0, ui.inflight[r] - g); fly(r, g, from); } }
    a.gains = {};
    flow = null;
    if (iso) iso.holdArrivals(false);
    const rw = a.rw;
    if (rw.win) {                                                 // the bell rings twice as the winner comes through the gate
      ui.bellFor = rw.personId;
      if (ui.reduced) ringHome(); else setTimeout(() => { if (ui.bellFor === rw.personId) ringHome(); }, 6500);
    }
    const pv = personV(rw.personId);                             // watch the homecoming: the camera keeps the gate in view
    if (iso && pv && pv.state !== 'down' && pv.state !== 'fallen') { try { iso.focus({ kind: 'gate' }, { ease: true }); } catch (e) { /* the gate is always there */ } }
  }
  function ringHome() { ui.bellFor = null; if (iso) iso.ringBell(2); sfx('bell', { times: 2 }); }
  Object.assign(DO, {
    resultBack() { const o = ui.overlay; if (!o || o.kind !== 'result' || o.args.phase !== 'done') return; closeOverlay('result'); },
    resJson(el) {
      const o = ui.overlay; if (!o || o.kind !== 'result') return;
      const a = o.args, which = el.dataset.which;
      if (which === 'handoff') { if (a.handoff) openOverlay('json', { title: 'SENT TO THE GAME', sub: 'The handoff of Night ' + a.rw.night + ' to Two Thumbs Left.', json: a.handoff }); return; }
      openOverlay('json', { title: 'BACK FROM THE GAME', sub: 'The result of Night ' + a.rw.night + ' (' + (a.result && a.result.source === 'sim' ? 'simulated' : a.result && a.result.source === 'game' ? 'from the game' : 'pasted') + '). It carries no loot: Bellhaven pays from these stats.', json: a.result, notes: a.notes, details: true });
    },
  });

  // ---------------------------------------------------------------------------------------------- the revive offer (6.6.2, 8.8)
  // One calm offer: no ticking seconds, no pulsing, no shop link, no discount; a short balance disables a button with
  // "Need 320 more cans". Closing (✕, DECIDE LATER, Esc, the page) is "decide later"; nothing reopens it by itself.
  OVERLAYS.offer = {
    render(v, a) { return offerHtml(a); },
    esc() { DO.offerLater(); },
  };
  function offerHtml(a) {
    const o = E.offer(S, a.personId); if (!o) return null;
    const wide = wideL();
    let s = '<div class="offer" role="document"><button class="xbtn x" data-do="offerLater" aria-label="Decide later">' + ic('close') + '</button>';
    s += '<div class="of-who">' + pp(o.look, wide ? 96 : 80, true) + '<h2>' + esc(o.title) + '</h2><p>' + escNb(o.roleLine) + '</p><p class="w">' + escNb(o.where) + '</p>' + (o.revivedText ? '<p>' + esc(o.revivedText) + '</p>' : '') + '</div>';
    s += '<div class="of-btns">' +
      btn({ do: 'revive', data: { id: o.personId, pay: 'cans' }, cls: o.revive.ok ? 'primary' : '', off: !o.revive.ok, why: o.revive.needText, label: esc(o.revive.label) + ic('can'), sub: esc(o.revive.ok ? o.revive.sub : o.revive.needText), aria: 'Revive with ' + o.revive.cans + ' cans, ' + o.revive.sub }) +
      btn({ do: 'revive', data: { id: o.personId, pay: 'sparks' }, cls: 'spark', off: !o.reviveNow.ok, why: o.reviveNow.needText, label: esc(o.reviveNow.label), sub: esc(o.reviveNow.ok ? o.reviveNow.sub : o.reviveNow.needText), aria: 'Revive now with ' + o.reviveNow.sparks + ' sparks, ready at once' }) +
      btn({ do: 'goodbye', data: { id: o.personId }, cls: 'ghost', label: 'SAY GOODBYE', sub: esc(o.goodbye.sub) }) + '</div>';
    return s + '<div class="of-foot"><span>' + esc(o.leftText) + '</span>' + btn({ do: 'offerLater', cls: 'ghost', label: 'DECIDE LATER' }) + '</div></div>';
  }
  // an offer for this person is showing or waiting already (the stranger, the Lab's kill and a DECIDE can meet)
  const offerOpen = (pid) => (isOv('offer') && ui.overlay.args.personId === pid) || ui.queue.some((q) => q.kind === 'offer' && q.args.personId === pid);
  function whereDown(p) { return !p ? '' : p.where === 'gate' ? 'at the gate' : p.where === 'clinic' ? 'in the Clinic' : 'at home'; }
  Object.assign(DO, {
    offerLater() {
      const o = ui.overlay; if (!o || o.kind !== 'offer') return;
      const p = personV(o.args.personId);
      closeOverlay('offer');
      if (p && p.state === 'down') cityFx(() => toast(p.first + ' waits ' + whereDown(p) + ' · ' + fmt.hoursLeft(p.downLeftMs) + ' to decide.', { icon: 'heart' }));
    },
    revive(el) {
      const id = el.dataset.id, pay = el.dataset.pay;
      const r = doAct({ type: 'revive', personId: id, pay }, { quiet: true });
      if (!r.ok) { explain(r); return; }
      if (isOv('offer')) closeOverlay('offer');
      const p = personV(id), first = p ? p.first : 'Someone';
      sfx('revive');                                              // the card behind the offer (the result, the death card) first
      cityFx(() => toast(pay === 'cans' ? first + ' rests ' + fmt.dur(r.data.restMs / 1000) + (bLv('clinic') >= 1 ? ' in the Clinic.' : '.') : first + ' is up and Ready.', { icon: 'heart', kind: 'good' }));
    },
    goodbye(el) {
      const id = el.dataset.id, p0 = personV(id), first = p0 ? p0.first : 'Someone';
      const r = doAct({ type: 'goodbye', personId: id }, { quiet: true });
      if (!r.ok) { explain(r); return; }
      // the grave needs the city: the result card (and this person's card) behind the offer close too
      ui.queue = ui.queue.filter((q) => { if (q.kind === 'result') { resultClosed(q.args); return false; } return !(q.kind === 'person' && q.args.id === id); });
      if (isOv('offer')) closeOverlay('offer');
      if (isOv('result')) closeOverlay('result');
      sfx('bell', { times: 1, low: true }); if (iso) iso.ringBell(1, { low: true });
      const gid = r.data && r.data.graveId;
      if (gid && r.data.spot && iso) {                            // 6.7: move mode on the default spot, LAY TO REST, no ✕
        ui.sel = null; iso.select(null);
        try { iso.focus({ kind: 'grave', id: gid }, { ease: true }); } catch (e) { /* the grave is on the land */ }
        startMove({ kind: 'grave', id: gid }, { ok: 'LAY TO REST', cancel: null, hint: 'Drag to choose a place' });
        if (ui.mode) ui.mode.onDone = () => toast(first + ' is laid to rest. Tap the grave to remember.', { icon: 'grave', ms: 3500 });
      } else if (gid) toast('No free tile: ' + first + '’s grave waits for a place.', { icon: 'grave', ms: 4000 });
    },
  });

  // ---------------------------------------------------------------------------------------------- the memorial card (8.9)
  OVERLAYS.memorial = {
    render(v, a) {
      const m = E.memorial(S, a.id); if (!m) return null;
      let s = '<div class="card mc"><button class="xbtn x" data-do="closeOverlay" aria-label="Close">' + ic('close') + '</button><div class="cb"><div class="pc-top">' + pp(m.look, 80, true) + '<div class="pc-txt">' +
        '<div class="who">' + esc(m.name) + '</div><p class="mut">' + esc(m.roleLine) + '</p><p class="mut">' + esc(m.usedToBe) + '</p></div></div>' +
        '<p class="epi">' + m.epitaph.map(esc).join('<br>') + '</p>';
      if (m.record) s += '<p class="soft" style="font-size:13px;margin:4px 0">' + esc(m.record) + '</p>';
      if (m.fellLine) s += '<p class="soft" style="font-size:13px;margin:4px 0">' + escNb(m.fellLine) + '</p>';
      if (m.waiting) s += '<p class="soft" style="font-size:13px;margin:4px 0">Waiting for a place: the grave stands as soon as a tile frees.</p>';
      return s + '</div><div class="cf">' + btn({ do: 'memorialMove', data: { id: m.graveId }, cls: 'ghost', label: 'MOVE', off: m.waiting, why: m.waiting ? 'Waiting for a place' : null }) +
        btn({ do: 'closeOverlay', cls: 'primary', label: 'CLOSE', primary: true }) + '</div></div>';
    },
    esc() { closeOverlay('memorial'); },
  };
  DO.memorialMove = (el) => { const id = el.dataset.id; closeOverlay('memorial'); startMove({ kind: 'grave', id }); };
  DO.remember = (el) => {                                        // the roster's REMEMBERED: the memorial and the camera on the grave
    const gid = el.dataset.id, g = V.graves.find((x) => x.id === gid);
    if (ui.sheet && (ui.layout.portrait || ui.layout.bb !== 'wide')) closeSheet();
    if (g && g.gx != null && iso) { const t = { kind: 'grave', id: gid }; ui.sel = t; iso.select(t, { focus: true }); }
    hooks.openMemorial(gid);
  };

  // ---------------------------------------------------------------------------------------------- the person card and the traveler card (8.6)
  OVERLAYS.person = {
    render(v, a) { return personHtml(v, a); },
    esc() { closeOverlay('person'); },
  };
  function stateLine(p) {
    if (p.state === 'out') { const pe = V.pending; return 'Out tonight' + (pe && pe.personId === p.id ? ' · ' + pe.destName : ''); }
    if (p.state === 'down') return p.pill + ' left to decide · ' + whereDown(p);
    const home = p.where === 'clinic' ? 'in the Clinic' : p.house ? 'the ' + p.house + ' House' : 'sleeps on the plaza bench';
    return p.pill + ' · ' + home;
  }
  function personHtml(v, a) {
    const p = personV(a.id); if (!p || p.state === 'fallen') return null;
    const trav = p.arrivedHow === 'traveler', wide = wideL(), hist = !trav && a.tab === 'history';
    let s = '<div class="card pc"><button class="xbtn x" data-do="closeOverlay" aria-label="Close">' + ic('close') + '</button><div class="cb">';
    if (hist) {
      s += '<div class="pc-top">' + pp(p.look, 56, p.state === 'down') + '<div class="pc-txt"><div class="who">' + esc(p.fullName) + '</div><p class="mut">' + esc(p.roleName + ' · Lv ' + p.lv + ' · ' + fmt.num(p.runs) + (p.runs === 1 ? ' night · ' : ' nights · ') + fmt.num(p.kills) + ' kills') + '</p></div></div>';
      const h = (p.history || []).slice(-12).reverse();
      s += '<ul class="hist" aria-label="History">' + (h.length ? h.map((x) => '<li>' + esc(x[1]) + '</li>').join('') : '<li class="soft">Nothing yet.</li>') + '</ul>';
    } else {
      const f = lvFrac(p.lv, p.xp, p.xpFrom, p.xpTo);
      s += '<div class="pc-top">' + pp(p.look, wide ? 96 : 72, p.state === 'down') + '<div class="pc-txt"><div class="who">' + esc(p.fullName) + '<small>, ' + p.age + '</small></div><p>' + esc(p.card) + '</p>' +
        (p.kinLine ? '<p class="mut">' + esc(p.kinLine) + '</p>' : '') +
        '<div class="chips">' + pill(p.roleChip) + '</div><div class="mut">' + esc(p.ttlLine) + '</div><div class="chips">' + pill(p.traitChip, 'warm') + (p.nickChip ? pill(p.nickChip, 'spk') : '') + '</div>' +
        '<div class="mut" style="font-style:italic">“' + esc(p.traitLine) + '”</div>' +
        '<div class="xp"><span>LV ' + p.lv + '</span><span class="lvbar"><i style="width:' + (f * 100).toFixed(1) + '%"></i></span><small>' + (p.lv >= 10 ? 'max level' : fmt.num(p.xp) + ' / ' + fmt.num(p.xpTo) + ' XP') + '</small></div>' +
        (trav ? '<div class="mut">Staying at the Inn · leaves when new travelers arrive</div>' : '<div class="mut">' + esc(stateLine(p)) + '</div>') + '</div></div>';
    }
    s += '</div><div class="cf">';
    if (!trav) s += '<span class="grow" style="display:flex;gap:4px">' + ['card', 'history'].map((t) => '<button class="tab' + ((a.tab || 'card') === t ? ' on' : '') + '" data-do="personTab" data-tab="' + t + '" aria-pressed="' + ((a.tab || 'card') === t) + '">' + t.toUpperCase() + '</button>').join('') + '</span>';
    else s += '<span class="grow"></span>';
    if (trav) {
      const inv = inviteInfo();
      if (inv) s += btn({ do: 'invite', data: { id: p.id }, cls: inv.ok ? 'primary' : '', off: !inv.ok, why: inv.why, label: 'INVITE · ' + fmt.num(inv.price) + ' cans', sub: inv.ok ? null : esc(inv.why), primary: inv.ok, aria: 'Invite ' + p.first + ' for ' + inv.price + ' cans' + (inv.ok ? '' : ': ' + inv.why) });
    } else {
      if (p.state === 'rest') s += skipBtn('rest:' + p.id, E.price.skip(p.restLeftMs / 1000, S), 'restNow', { id: p.id }, 'REST NOW');
      if (p.state === 'down') s += btn({ do: 'decide', data: { id: p.id }, cls: 'primary', label: 'DECIDE', primary: true });
      if (p.canRun) s += btn({ do: 'send', data: { id: p.id }, cls: 'primary', label: 'SEND TONIGHT', primary: true });
    }
    return s + '</div></div>';
  }
  DO.personTab = (el) => { const o = ui.overlay; if (!o || o.kind !== 'person') return; o.args.tab = el.dataset.tab; renderOverlay(); };
  function inviteInfo() {
    const inn = V.inn; if (!inn || inn.lv < 1) return null;
    const ci = inn.canInvite;
    return { ok: ci.ok, price: inn.invitePrice, why: ci.err === 'beds' ? 'No free bed' : ci.err === 'cost' ? 'Need ' + fmt.num(inn.invitePrice - V.res.cans) + ' more cans' : null };
  }
  Object.assign(DO, {
    invite(el) {
      const id = el.dataset.id, r = doAct({ type: 'invite', travelerId: id });
      if (r.ok) sfx('invite');
      if (r.ok && isOv('person') && ui.overlay.args.id === id) closeOverlay('person');
    },
    person(el) { hooks.openPerson(el.dataset.id); },
    memorial(el) { hooks.openMemorial(el.dataset.id); },
    decide(el) { hooks.openOffer(el.dataset.id || (ui.sel && ui.sel.id)); },
    send(el) { const id = el.dataset.id; if (isOv('person')) closeOverlay('person'); hooks.openRun({ personId: id }); },
  });

  // ---------------------------------------------------------------------------------------------- the JSON cards (6.8, 6.9)
  OVERLAYS.json = {
    render(v, a) {
      let s = '<div class="card jc"><button class="xbtn x" data-do="closeOverlay" aria-label="Close">' + ic('close') + '</button><div class="cb"><h2>' + esc(a.title) + '<small>' + esc(a.sub || '') + '</small></h2>';
      if (a.details) s += '<div class="sec">Details</div>' + (a.notes && a.notes.length ? '<ul class="notes">' + a.notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '<p class="soft" style="font-size:12.5px;margin:0">Validated with no notes.</p>');
      return s + '<pre>' + esc(JSON.stringify(a.json, null, 2)) + '</pre></div><div class="cf">' + btn({ do: 'copyJson', cls: 'ghost', label: 'COPY' }) + btn({ do: 'closeOverlay', cls: 'primary', label: 'CLOSE', primary: true }) + '</div></div>';
    },
    esc() { closeOverlay('json'); },
  };
  DO.copyJson = () => { const o = ui.overlay; if (o && o.kind === 'json') copyText(JSON.stringify(o.args.json, null, 2)); };
  function copyText(txt) {
    const done = () => toast('Copied.', { icon: 'check', kind: 'good' });
    const fallback = () => { if (legacyCopy(txt)) done(); else toast('Select the text to copy it.'); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback(); } catch (e) { fallback(); }
  }
  function legacyCopy(txt) {
    try {
      const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand ? document.execCommand('copy') : false; ta.remove(); return !!ok;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------------------------------------- people events: the stranger, revives, the Lab's kill
  function strangerOffer(pid, tries) {                            // 6.6.6, 7.1: the camera finds the stranger, then the offer opens once
    setTimeout(() => {
      const p = S && S.people.find((x) => x.id === pid); if (!p || p.state !== 'down') return;
      if ((ui.mode || ui.tray) && tries < 60) { strangerOffer(pid, tries + 1); return; }
      if (iso && !ui.overlay) { try { iso.focus({ kind: 'person', id: pid }, { ease: true }); } catch (e) { /* off screen is fine */ } }
      if (!offerOpen(pid)) queueOverlay('offer', { personId: pid });
    }, tries ? 1000 : 1400);
  }
  (LISTENERS.stranger = LISTENERS.stranger || []).push((e, ctx) => { if (!ctx.offline && !ui.demo && e.personId) strangerOffer(e.personId, 0); });
  (LISTENERS.dev = LISTENERS.dev || []).push((e, ctx) => {     // the Lab's "kill the selected person" opens the Down flow (9)
    const a = ctx.act; if (e.op === 'kill' && a && a.personId) setTimeout(() => hooks.openOffer(a.personId), 0);
  });

  // what the rest of the page (and the Lab) calls
  const hooks = {
    openRun(a) { if (S.pending) { openRunScreen(); return; } if (isOv('run')) return; openOverlay('run', Object.assign({}, a || {})); },
    openOffer(personId) { if (personId && E.offer(S, personId) && !offerOpen(personId)) openOverlay('offer', { personId }); },
    openPerson(id) {
      if (!id) return;
      const p = personV(id);
      if (p && p.state === 'fallen') { if (p.graveId) hooks.openMemorial(p.graveId); return; }
      openOverlay('person', { id, tab: 'card' });
    },
    openMemorial(graveId) { if (graveId) openOverlay('memorial', { id: graveId }); },
    openRoster() { openSheet('people'); },
    openRunScreen,
    resolveResult(json) {                                         // the Lab's "paste a result JSON": the same validation and card
      if (!S.pending) return { ok: false, err: 'state', events: [], data: { errors: ['No run is out'], notes: [] } };
      if (rsc) { rsc.resolved = true; rsc.resolving = true; }
      return resolveNow({ type: 'resolveRun', result: json, source: 'paste' });
    },
  };

  // ---------------------------------------------------------------------------------------------- the Lab panel (lab.js)
  function openLab() {
    if (ui.sheet) closeSheet();
    if (ui.mode) cancelMode();
    if (ui.tray) closeTray(true);
    deselect();                                                 // the action bar would sit half under the panel
    if (!BH.Lab || !BH.Lab.open) { toast('The Lab is not part of this build yet.', { icon: 'flask' }); return; }
    let el = $('lab');
    if (!el) { el = document.createElement('aside'); el.id = 'lab'; el.setAttribute('aria-label', 'The Lab'); document.body.appendChild(el); }
    labApi.el = el;
    ui.lab = true; setClass('lab-open', true); applyInsets();
    try { BH.Lab.open(labApi); } catch (e) { console.error(e); }
  }
  function closeLab() {
    if (!ui.lab) return;
    ui.lab = false; setClass('lab-open', false);
    try { if (BH.Lab && BH.Lab.close) BH.Lab.close(); } catch (e) { console.error(e); }
    for (const f of labSubs.close) { try { f(); } catch (e) { console.error(e); } }
    applyInsets(); refresh();
  }
  function replaceState(next, status) {
    S = next; ui.status = status || 'ok'; ui.dispInit = false; ui.inflight = { bricks: 0, cans: 0, sparks: 0 }; ui.later = [];
    ui.sel = null; ui.mode = null; ui.queue = []; ui.bellFor = null;
    if (ui.overlay && ui.overlay.args && ui.overlay.args.timers) for (const t of ui.overlay.args.timers) clearTimeout(t);
    rsc = null; flow = null;                                    // the run flow of the old city ends with it
    if (iso) { iso.ghostEnd(); iso.select(null); iso.holdArrivals(false); clearTimeout(ui.gatherT); if (iso.gather) iso.gather(false); }
    if (ui.overlay) { ui.overlay = null; morph($('overlay'), ''); setClass('ov-open', false); setClass('ov-dark', false); if (iso) iso.setInteractive(true); }
    applyReduced(); refresh(); save();
    if (iso) iso.fit({ ease: false });
  }
  const labApi = {
    el: null, Engine: E, DATA: D, Art, fmt,
    getState: () => S,
    view: () => V,
    act: (a) => doAct(a),
    dev: (op, args) => doAct(Object.assign({}, args || {}, { type: 'dev', op })),
    redraw: () => { ui.dirty = true; refresh(); },
    save: () => save(),
    resetSave() { const t = E.create({ realNow: Date.now(), tzOffsetMin: -new Date().getTimezoneOffset() }); t.ui.sound = S.ui.sound; replaceState(t, 'new'); maybeMeet(); },
    exportSave: () => E.serialize(S),
    importSave(str) {
      const r = E.load(str, Date.now(), { tzOffsetMin: -new Date().getTimezoneOffset() });
      if (r.status === 'corrupt-reset' || r.status === 'future-version') return { ok: false, status: r.status, notes: r.notes };
      replaceState(r.state, r.status);
      const rr = E.resume(S, Date.now()); handle(rr.events, { offline: true }); if (rr.welcome) queueOverlay('welcome', rr.welcome);
      refresh();
      return { ok: true, status: r.status, notes: r.notes };
    },
    setTimeScale: (x) => doAct({ type: 'dev', op: 'timeScale', value: x }),
    reducedMotion: { get: () => (S ? S.lab.reducedMotion : null), set: (v) => { doAct({ type: 'dev', op: 'set', key: 'reducedMotion', value: v }); applyReduced(); }, effective: () => ui.reduced },
    sound: { get: () => !!(S && S.ui.sound !== false), set: (on) => setSound(on) },
    skipAhead(ms) { const r = doAct({ type: 'dev', op: 'skipAhead', ms }); if (r.ok && r.data && r.data.welcome) queueOverlay('welcome', r.data.welcome); return r; },
    showWelcome: (w) => queueOverlay('welcome', w),
    replayOnboarding() { doAct({ type: 'dev', op: 'replayOnboarding' }); closeLab(); maybeMeet(0); },
    openDemo() { try { location.hash = 'demo'; location.reload(); } catch (e) { /* no navigation */ } },
    resolveResult: (json) => hooks.resolveResult(json),
    openOffer: (personId) => hooks.openOffer(personId),         // the Lab's KILL (hooks.openOffer skips a duplicate)
    kpis: () => E.kpis(S),
    toast: (t, o) => toast(t, o),
    close: () => closeLab(),
    isDemo: () => ui.demo,
    layout: () => Object.assign({}, ui.layout),
    perf: () => perfStats(),                                    // { frames, avg, max, p95 } ms of script per frame
    on(name, fn) { if (labSubs[name] && typeof fn === 'function') labSubs[name].push(fn); return () => { const l = labSubs[name]; const i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); }; },
  };

  // ---------------------------------------------------------------------------------------------- the onboarding spotlight (7.1)
  function coachTarget() {
    if (!S.flags.metPeople || ui.overlay || ui.demo || S.goal >= 9) return null;
    const g = V.goal, kiln = V.buildings.find((b) => b.type === 'kiln' && b.lv >= 1 && b.bubble && b.bubble.show);
    if (S.tel.bricksProd === 0 && kiln) return { iso: { kind: 'bubble', id: kiln.id } };
    const fj = V.jobs.find((j) => j.free && j.leftMs > 0 && j.buildingId);
    if (fj) return { iso: { kind: 'building', id: fj.buildingId }, abar: 'finish', sel: fj.buildingId };
    const t = g.target; if (!t) return null;
    if (t.kind === 'build') return ui.mode ? { dom: 'play' } : ui.tray ? { card: t.type } : { dom: 'bBuild' };
    if (t.kind === 'building') { const b = bld(t.id); if (!b || (b.next && !b.next.ok && b.next.err !== 'noCrane')) return null; return { iso: { kind: 'building', id: t.id }, abar: 'upgrade', sel: t.id, sheetMain: true }; }
    if (t.kind === 'dest') return { dom: 'play' };
    if (t.kind === 'collect') return { iso: { kind: 'bubble', id: t.id } };
    if (t.kind === 'expand') return { dom: 'cTower' };
    return null;
  }
  function runCoach() {
    const gp = !!(ui.goalPulse && now() < ui.goalPulse.until);   // a goal-chip tap pulses its target for a while
    if (!gp && ui.goalPulse) { ui.goalPulse = null; ui.coachKey = null; }
    let c = null;
    try { c = coachTarget(); } catch (e) { c = null; }
    const key = JSON.stringify(c);
    if (key === ui.coachKey) return;
    ui.coachKey = key; ui.coach = c;
    if (iso && !gp) iso.pulse(c && c.iso ? c.iso : null);
    ui.hudDirty = true; ui.panelDirty = true;
  }

  // ---------------------------------------------------------------------------------------------- save (11.2)
  function save() {
    if (!S || ui.noSave || S.demo) return;
    ui.lastSave = Date.now();
    store.set(KEY, E.serialize(S));
  }
  function resumeNow() {
    if (!S || ui.demo) { if (S) S.realLast = Date.now(); return; }
    const r = E.resume(S, Date.now());
    handle(r.events, { offline: true });
    if (r.welcome) queueOverlay('welcome', r.welcome);
    refresh(); save();
  }

  // ---------------------------------------------------------------------------------------------- the time loop
  const perf = { ms: new Float32Array(120), i: 0, n: 0 };     // script time of the last 120 frames (tests, the Lab)
  function perfStats() {
    const n = Math.min(perf.n, 120); if (!n) return { frames: 0, avg: 0, max: 0, p95: 0 };
    const a = Array.prototype.slice.call(perf.ms, 0, n).sort((x, y) => x - y);
    return { frames: perf.n, avg: a.reduce((x, y) => x + y, 0) / n, max: a[n - 1], p95: a[Math.min(n - 1, Math.floor(n * 0.95))] };
  }
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!S) return;
    const t0 = now();
    const dt = ui.lastTs ? clamp(ts - ui.lastTs, 0, 250) : 16; ui.lastTs = ts;
    const ev = E.tick(S, dt, Date.now());
    if (ev.length) handle(ev, ev[0].type === 'offline' ? { offline: true } : { tick: true });   // a gap over 5 s is credited as offline time
    if (ui.dirty || ts - ui.lastView > 100) { V = E.view(S); ui.lastView = ts; ui.dirty = false; ui.hudDirty = true; if (iso) iso.setView(V); }
    if (iso) iso.frame(ts);
    if (ui.hudDirty || ts - ui.lastHud > 250) renderHud();
    animChips(dt);
    if (ui.panelDirty || ts - ui.lastPanel > 500) renderPanels();
    if (ts - ui.lastCoach > 300) { ui.lastCoach = ts; runCoach(); }
    oddsWork();
    rscFrame(ts);
    if (ui.lab && ts - ui.lastLabTick > 1000) { ui.lastLabTick = ts; for (const f of labSubs.tick) { try { f(); } catch (e) { console.error(e); } } }
    if (Date.now() - ui.lastSave > 10000) save();
    perf.ms[perf.i] = now() - t0; perf.i = (perf.i + 1) % 120; perf.n++;
  }

  // ---------------------------------------------------------------------------------------------- input (8.2: the DOM side)
  function onClick(e) {
    const el = e.target && e.target.closest ? e.target.closest('[data-do]') : null;
    if (!el) return;
    const fn = DO[el.dataset.do]; if (!fn) return;
    e.preventDefault();
    if (el.getAttribute('aria-disabled') === 'true') { const why = el.dataset.why; if (why) toast(why); sfx('deny'); return; }
    if (el.dataset.do !== 'collect' && el.dataset.do !== 'play') sfx('tick');
    fn(el, e);
  }
  function onKey(e) {
    unlockAudio();
    const tg = e.target, tag = tg && tg.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tg && tg.isContentEditable)) return;
    if (ui.lab && $('lab') && $('lab').contains(tg)) { if (e.key === 'Escape') { closeLab(); e.preventDefault(); } return; }
    if (e.key === 'Escape') { escape(); e.preventDefault(); return; }
    if (e.key === 'Enter') {
      if (ui.overlay) { const b = $('overlay').querySelector('[data-primary]'); if (b) { b.click(); e.preventDefault(); } return; }
      if (ui.mode) { confirmMode(false); e.preventDefault(); }
      return;
    }
    if (ui.overlay || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'p' || e.key === 'P') { DO.play(); e.preventDefault(); return; }
    if (e.key === 'b' || e.key === 'B') { DO.build(); e.preventDefault(); return; }
    if (iso && iso.key(e)) e.preventDefault();
  }
  function escape() {
    if (ui.overlay) { DO.closeOverlay(); return; }
    if (ui.lab) { closeLab(); return; }
    if (ui.mode) { cancelMode(); return; }
    if (ui.tray) { closeTray(); return; }
    if (ui.sheet) { closeSheet(); return; }
    if (ui.sel) deselect();
  }

  // ---------------------------------------------------------------------------------------------- iso callbacks (the canvas side of 8.2)
  function isoCallbacks() {
    return {
      onTap(hit) {
        unlockAudio();
        if (ui.tray) { closeTray(); return false; }
        if (ui.lab && ui.layout.bb === 'compact') return false;
        return undefined;
      },
      onCollect(id, at) { collect(id, at); },
      onSelect(t, info) {
        if (ui.mode) return;
        if (!t) {
          const sheetSubj = ui.sheet && SHEETS[ui.sheet.kind].subject;
          ui.sel = null;
          if (ui.sheet) closeSheet(!sheetSubj);
          renderAbar(); applyInsets(); return;
        }
        ui.sel = t; ui.goalPulse = null;
        if (info && info.again) { openSelSheet(t); return; }
        if (ui.sheet) {
          if (ui.sheet.kind === 'building' && t.kind === 'building' && bld(t.id) && bld(t.id).type !== 'tower') { ui.sheet.args = { id: t.id }; $('sheet').__html = null; renderSheet(); iso.focus(t, { ease: true }); return; }
          if (ui.sheet.kind === 'city' && t.kind === 'building' && bld(t.id) && bld(t.id).type === 'tower') return;
          closeSheet(true);
        }
        renderAbar(); applyInsets();
      },
      onLandmark(destId) { const d = V.dests.find((x) => x.id === destId); if (d && !d.open) { toast(d.name + ': ' + d.lock, { icon: 'lock' }); return; } hooks.openRun({ destId }); },
      onLift() { try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* no haptics */ } },
      onMoveStart(target) { startMove(target); },
      onTrip(e) { if (e && e.kind === 'in' && ui.bellFor && e.personId === ui.bellFor && (e.phase === 'gate' || e.phase === 'done')) ringHome(); },
      onGhostMove(gh) {
        if (!ui.mode) return;
        const was = ui.mode.valid; ui.mode.valid = !!gh.valid; ui.mode.reason = gh.reason;
        if (gh.dragging && ui.mode.kind === 'place' && !ui.mode.whirred) { ui.mode.whirred = true; sfx('whirr'); }
        if (was !== ui.mode.valid) renderPlay();
      },
    };
  }

  // ---------------------------------------------------------------------------------------------- the portrait card (8.14)
  function showRotate() {
    const on = ui.portrait && !ui.upright;
    const el = $('rotate');
    if (on && !el.__built) {
      el.__built = true;
      el.innerHTML = '<div class="rc">' + rotateIcon() + '<h2>Turn your phone sideways</h2><p>Bellhaven is made for landscape.</p>' +
        btn({ do: 'upright', cls: 'ghost', label: 'USE IT UPRIGHT ANYWAY' }) + '</div>';
    }
    setClass('rotate-on', on);
  }
  function rotateIcon() {
    return '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><rect x="15" y="6" width="18" height="30" rx="3" fill="none" stroke="#f3efe6" stroke-width="2.5"/>' +
      '<path d="M8 40c6 4 26 4 32-4" fill="none" stroke="#ff7a2f" stroke-width="2.5" stroke-linecap="round"/><path d="M36 30l4 6-7 1" fill="none" stroke="#ff7a2f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  // ---------------------------------------------------------------------------------------------- boot
  function maybeMeet(delay) {
    if (!S || S.flags.metPeople || ui.demo) return;
    clearTimeout(ui.meetTimer);
    if (iso && V) { const t = V.tower; iso.setCamera({ tx: t.gx + 1.5, ty: t.gy + 1.5, z: 1.15 }); }
    ui.meetTimer = setTimeout(() => { if (!S.flags.metPeople && !(ui.overlay && ui.overlay.kind === 'meet')) queueOverlay('meet', { i: 0 }); }, delay == null ? 2500 : delay);
  }
  function boot() {
    const real = Date.now(), tz = -new Date().getTimezoneOffset();
    try { mql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { mql = null; }
    ui.demo = /^#demo\b/.test(location.hash || '');
    ui.upright = store.get(KEY_UPRIGHT) === '1';
    if (ui.demo) { S = E.demo({ realNow: real, tzOffsetMin: tz }); ui.noSave = true; ui.status = 'demo'; }
    else {
      const raw = store.get(KEY);
      const r = E.load(raw, real, { tzOffsetMin: tz, seed: Q.seed });
      S = r.state; ui.status = r.status; ui.notes = r.notes || [];
      if (r.status === 'corrupt-reset') { store.set(KEY_BAD, raw); setTimeout(() => toast('The old save could not be read. It was kept aside and a new city begins.', { ms: 5000, keep: true }), 800); }
      if (r.status === 'future-version') { ui.noSave = true; setTimeout(() => toast('This save is from a newer version. Playing without saving.', { ms: 5000, keep: true }), 800); }
    }
    applyReduced();
    layout();
    V = E.view(S);
    iso = Iso.create($('city'), Object.assign({ view: V, reducedMotion: ui.reduced }, isoCallbacks()));
    applyInsets();
    if (!ui.demo) {
      const rr = E.resume(S, Date.now());
      handle(rr.events, { offline: true });
      if (rr.welcome) ui.queue.push({ kind: 'welcome', args: rr.welcome });
    }
    V = E.view(S); iso.setView(V);
    if (S.flags.metPeople || ui.demo) iso.fit({ ease: false }); else maybeMeet();
    for (const k of RES) ui.disp[k] = V.res[k]; ui.dispInit = true;
    renderHud();
    save();
    ui.booted = true;
    if (S.pending && !ui.demo) ui.queue.unshift({ kind: 'runscreen', args: {} });   // 6.2: a reload during the run replays the same night
    const next = ui.queue.shift(); if (next) showOverlayNow(next);
    if (mql) { const fn = () => applyReduced(); if (mql.addEventListener) mql.addEventListener('change', fn); else if (mql.addListener) mql.addListener(fn); }
    document.addEventListener('click', onClick);
    document.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    document.addEventListener('pointerup', unlockAudio, { capture: true, passive: true });
    document.addEventListener('click', unlockAudio, { capture: true, passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', () => { layout(); if (iso) iso.resize(); });
    window.addEventListener('orientationchange', () => setTimeout(() => { layout(); if (iso) iso.resize(); }, 120));
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else resumeNow(); });
    window.addEventListener('pagehide', save);
    window.addEventListener('hashchange', () => { const d = /^#demo\b/.test(location.hash || ''); if (d !== ui.demo) location.reload(); });
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------------------------- the API (the next stage, the Lab, tests)
  const UI = {
    get state() { return S; }, get view() { return V; }, get iso() { return iso; }, ui, hooks, labApi, DO,
    act: doAct, refresh, save, toast, hint, handle,
    sheet: { register(kind, def) { SHEETS[kind] = def; }, open: openSheet, close: closeSheet, current: () => ui.sheet, render: renderSheet },
    overlay: { register(kind, def) { OVERLAYS[kind] = def; }, open: openOverlay, queue: queueOverlay, close: closeOverlay, current: () => ui.overlay, render: renderOverlay },
    onEvent(type, fn) { (LISTENERS[type] = LISTENERS[type] || []).push(fn); },
    mode: { startMove, cancel: cancelMode, confirm: confirmMode, current: () => ui.mode },
    h: { ic, esc, btn, costChip, needLine, needText, timeChip, skipBtn, skipAct, portrait, pill, num, line, morph },
    sfx, fly, perf: perfStats, layout: () => Object.assign({}, ui.layout), select(t) { ui.sel = t; if (iso) iso.select(t, { focus: true }); renderAbar(); },
    oddsStats, run: { sheet: () => Object.assign({}, rs), screen: () => (rsc ? { runId: rsc.runId, sim: rsc.sim, ended: !!rsc.ended, resolved: !!rsc.resolved } : null) },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return UI;
});
