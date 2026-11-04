/* Bellhaven UI (BH.UI): the playable page's DOM side. SPEC 5.5-5.6 (offline, skip prices), 7.1-7.3 (first minutes,
 * the goal chip), 8.2-8.5 (gestures, HUD, building sheet, action bar, build tray, placement), 8.10-8.14 (welcome card,
 * City and Sparks sheets, one-time cards, portrait and desktop), 8.16-8.17 (juice, reduced motion), 11.1-11.2 (save,
 * load, the time loop).
 *
 * The only file that touches localStorage, Date.now and performance.now. Every state change goes through
 * Engine.act(state, action, Date.now()); the city is drawn by BH.Iso from Engine.view(); sound is BH.Sfx (optional);
 * the Lab is BH.Lab (optional). Classic script with the shared UMD header; it does nothing outside a browser.
 *
 * ===================================================================================================== HOW IT WORKS
 * Time loop (requestAnimationFrame): Engine.tick(S, frame delta, Date.now()) -> events -> handle(); the view is
 *   rebuilt after every act and at most every 100 ms otherwise (Engine.view is cheap) and pushed to iso.setView;
 *   iso.frame(ts) draws; the HUD re-renders on change (string-diffed); open sheets and overlays re-render twice a
 *   second (timers) through morph(); odds for PLAY and the run sheet are computed in idle frames (<= 6 ms a frame,
 *   6.3.5); the save is written after every successful act, every 10 s, on visibilitychange (hidden) and pagehide.
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
 *   Kinds here: building {id}, city, sparks, jobs, res {res}, people (placeholder roster).
 * Overlays (full screen, one at a time, the rest wait in a queue; the city is not interactive under them):
 *   UI.overlay.register(kind, { render(V, a) -> html, dark?, esc?(a) (Esc / ✕), enter?(a), onOpen?(a),
 *   onClose?(a) }), UI.overlay.open(kind, args) (opens now, the current one is queued back), .queue(kind, args)
 *   (after the current ones), .close(), .current(). Kinds here: welcome, meet, tower, death, finale, crane (no free
 *   crane), and PLACEHOLDERS for the next stage: run (the run sheet, with an instant simulated run), result, offer
 *   (revive), person, memorial. The next stage replaces those five by registering the same kinds (or editing them in
 *   place) and adds the run screen; UI.hooks.openRun / openOffer / openPerson / openMemorial are what the rest of the
 *   page calls, so swapping them is enough.
 * Events: Engine events go through handle(events, ctx): flyers, sounds, toasts and cards for the city events below,
 *   then every listener added with UI.onEvent(type, fn(e, ctx)) (the run flow: runStarted, runResolved, down, daily,
 *   firstClear, levelUp, nickname, invited, revived, fell). ctx: { act, offline, tick, at }.
 * Modes: ui.mode = null | { kind: 'place', type, cost } | { kind: 'move', target } (8.5). PLAY becomes ✓ PLACE /
 *   BLOCKED / ✓ DONE, BUILD becomes ✕ CANCEL. Grave placement (next stage) can reuse 'move' with its own labels via
 *   ui.mode.labels { ok: 'LAY TO REST', cancel: null }.
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
 *     LET'S BEGIN, 2: a safe return, 3: a Tower level, low: a goodbye or an expired window) · run screen (next
 *     stage): 'drone' { on }, 'heartbeat', 'horde', 'fallBeat'. Unknown cues must be ignored by sfx.js.
 * Lab (lab.js, BH.Lab): the LAB chip calls BH.Lab.open(api) after showing the #lab panel (a right panel; full screen
 *   below 640 px wide); BH.Lab.close() is called when the UI closes it (✕ in the Lab should call api.close()).
 *   api = UI.labApi: { el (the #lab element to render into), Engine, DATA, Art, fmt, getState() (the live state:
 *   read it, change it only through act / dev), view() (the latest Engine.view), act(action) -> result (events,
 *   save and redraw handled), dev(op, args) = act({ type: 'dev', op, ...args }), redraw(), save(), resetSave() (a new
 *   city; the Lab asks twice first), exportSave() -> string, importSave(str) -> { ok, status, notes } (validated
 *   by Engine.load; replaces the city), setTimeScale(x), reducedMotion: { get() -> true|false|null, set(v),
 *   effective() -> bool }, sound: { get() -> bool, set(on) }, skipAhead(ms) (through the offline path: shows the
 *   welcome card), showWelcome(w), replayOnboarding(), openDemo(), resolveResult(json) (paste a result: the run
 *   flow's hook), kpis(), toast(text), close(), isDemo(), layout() -> { W, H, k, ... }, perf() -> { frames, avg, max, p95 } (ms of script
 *   per frame, the last 120 frames), on(name, fn): 'tick' (once
 *   a second while open), 'events' (every batch of engine events), 'close' }.
 *
 * ===================================================================================================== DEVIATIONS
 * See the comments marked "Spec reading:" where the spec was ambiguous: the UI scale also looks at the width (so a
 * portrait phone is never scaled past its screen), compact numbers follow the compact top bar as well as < 700 px,
 * the Tower's tray card opens the City sheet, a tray card that cannot be afforded explains instead of entering
 * placement, the action bar sits at the goal chip's x between 640 and 760 px (and centred otherwise).
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
    fail() { store.ok = false; if (!store.warned) { store.warned = true; setTimeout(() => toast('Progress won’t be saved in this browser.'), 600); } },
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
    gestured: false, insetKey: '', meetTimer: null, booted: false,
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
    sfx('tick');
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
      if (!ctx.offline) { sfx('finish'); toast(e.kind === 'build' ? e.name + ' built.' : e.name + ' is level ' + e.lv + '.', { icon: 'check', kind: 'good' }); }
    },
    towerUp(e, ctx) {
      if (ctx.offline) return;                                  // the welcome card lists it (5.5)
      sfx('finish');
      if (e.sparks > 0) { const at = iso ? iso.screenOf({ kind: 'building', id: V ? V.tower.id : 'b1' }) : null; fly('sparks', e.sparks, at); }
      queueOverlay('tower', { lv: e.lv, opens: e.opens || [], sparks: e.sparks || 0 });
    },
    finale() { queueOverlay('finale', {}); },
    expanded(e, ctx) { if (!ctx.offline) { sfx('finish'); toast('The fence moves out: land ' + e.side + ' × ' + e.side + '.', { icon: 'check', kind: 'good' }); } },
    rested(e, ctx) { if (!ctx.offline && !e.early && ctx.tick) toast(nameFor(e.personId) + ' is rested.', { icon: 'people' }); },
    innRefresh(e, ctx) { if (!ctx.offline && ctx.tick) toast(e.n + ' new traveler' + (e.n === 1 ? '' : 's') + ' at the Inn.', { icon: 'house' }); },
    stranger(e) { toast('Someone lies Down at the gate.', { icon: 'heart', kind: 'bad', ms: 4000 }); },
    drifter(e) { toast(nameFor(e.personId) + ' drifted in at the gate.', { icon: 'people' }); },
    deathOn() { if (S && !S.flags.deathCardSeen) queueOverlay('death', {}); },
    downExpired(e, ctx) { if (!ctx.offline) { sfx('bell', { times: 1, low: true }); if (iso) iso.ringBell(1, { low: true }); toast(nameFor(e.personId) + '’s day ran out. ' + (e.where || ''), { icon: 'grave', ms: 4500 }); } },
    goal(e, ctx) {
      const rw = e.reward || {}, from = ctx.offline ? null : goalRect();
      toast('✓ ' + e.text + rewardText(rw), { kind: 'good' });
      for (const k of RES) if (rw[k] > 0) fly(k, rw[k], from);
    },
    packClaimed(e, ctx) { fly('sparks', e.size, ctx.at || null); toast('+' + fmt.num(e.size) + ' ✦ · a free test pack', { icon: 'spark' }); },
    rubbleCleared(e) {
      if (e.sparks > 0) { const at = iso ? iso.tileToScreen(e.gx + 0.5, e.gy + 0.5, 18) : null; fly('sparks', e.sparks, at); toast('+' + e.sparks + ' ✦ hidden in the rubble', { icon: 'spark', kind: 'good' }); }
      else sfx('place');
    },
    craneBought() { sfx('finish'); toast('A 4th crane joins Bellhaven.', { icon: 'crane', kind: 'good' }); },
    offline(e) { if (e.welcome) queueOverlay('welcome', e.welcome); },
    invited(e) { toast(nameFor(e.personId) + ' moves in.', { icon: 'people', kind: 'good' }); },
  };
  function rewardText(rw) { const p = []; for (const k of RES) if (rw[k] > 0) p.push('+' + fmt.num(rw[k]) + ' ' + RES_WORD[k]); return p.length ? ' · ' + p.join(' ') : ''; }

  // ---------------------------------------------------------------------------------------------- juice (8.16): flyers, chips, toasts
  function chipOf(res) { return res === 'bricks' ? $('cBricks') : res === 'cans' ? $('cCans') : $('cSparks'); }
  function fly(res, n, from) {
    const chip = chipOf(res);
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
    el.className = 'toast' + (o.kind ? ' ' + o.kind : ''); el.__text = text;
    el.innerHTML = (o.icon ? ic(o.icon) : '') + '<span>' + esc(text) + '</span>';
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    el.__t = setTimeout(() => dropToast(el), o.ms || 2500);
  }
  function dropToast(el) { el.classList.add('out'); setTimeout(() => el.remove(), ui.reduced ? 0 : 320); }
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
    const def = OVERLAYS[o.kind], el = $('overlay');
    el.__html = null; el.className = def.dark ? 'dark' : '';
    setClass('ov-open', true);
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
    morph($('overlay'), ''); setClass('ov-open', false);
    if (iso) iso.setInteractive(true);
    renderHud();
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
  function innBlock(b) {
    const inn = V.inn; if (!inn || b.lv < 1) return '';
    let s = '<div class="sec">At the Inn (' + inn.travelers.length + ')</div>';
    const ci = inn.canInvite;
    for (const p of inn.travelers) {
      const why = ci.err === 'beds' ? 'No free bed' : ci.err === 'cost' ? 'Need ' + fmt.num(inn.invitePrice - V.res.cans) + ' more cans' : null;
      s += line(portrait(p.look, 40), esc(p.name), esc('Lv ' + p.lv + ' · ' + p.roleName + ' · ' + p.traitName),
        btn({ do: 'invite', data: { id: p.id }, cls: ci.ok ? 'primary' : 'off', off: !ci.ok, why, label: 'INVITE · ' + fmt.num(inn.invitePrice) }) + btn({ do: 'person', data: { id: p.id }, cls: 'ghost icon', icon: 'info', aria: 'Card of ' + p.first }), { k: p.id });
    }
    if (!inn.travelers.length) s += '<p class="expl">Nobody is staying right now.</p>';
    if (inn.leftMs != null) s += line('', 'New travelers in ' + fmt.clock(inn.leftMs / 1000), 'Each arrival replaces everyone at the Inn', skipBtn('inn', inn.price, 'innNow', null, 'NOW'));
    return s;
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
    head(v) { return '<div class="sh-title">CRANES · ' + v.cranes.free + '/' + v.cranes.total + ' FREE<small>' + esc(EXPL[0]) + '</small></div>'; },
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
      return s;
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
  // ---------------------------------------------------------------------------------------------- PLACEHOLDER (next stage): the roster (8.6)
  SHEETS.people = {
    head(v) { return '<div class="sh-title">PEOPLE · ' + v.chips.people.living + '/' + v.chips.people.beds + ' BEDS<small>' + esc(EXPL[3]) + '</small></div>'; },
    body(v) {
      let s = '';
      for (const p of v.people) s += line(portrait(p.look, 40, p.state === 'down'), esc(p.fullName), esc('Lv ' + p.lv + ' · ' + p.roleName + ' · ' + p.traitName),
        pill(p.pill, p.state === 'down' ? 'red' : p.state === 'ready' ? 'good' : 'warm') + btn({ do: p.state === 'down' ? 'decide' : 'person', data: { id: p.id }, cls: p.state === 'down' ? 'primary' : 'ghost icon', icon: p.state === 'down' ? null : 'info', label: p.state === 'down' ? 'DECIDE' : '', aria: 'Card of ' + p.first }), { k: p.id });
      if (v.inn && v.inn.travelers.length) {
        s += '<div class="sec">At the Inn (' + v.inn.travelers.length + ')</div>';
        for (const p of v.inn.travelers) s += line(portrait(p.look, 40), esc(p.name), esc('Lv ' + p.lv + ' · ' + p.roleName), btn({ do: 'person', data: { id: p.id }, cls: 'ghost icon', icon: 'info', aria: 'Card of ' + p.first }), { k: p.id });
      }
      if (v.remembered.length) {
        s += '<div class="sec">Remembered (' + v.remembered.length + ')</div>';
        for (const p of v.remembered) s += line(portrait(p.look, 40, true), esc(p.fullName), esc(p.epitaph ? p.epitaph[0] || '' : ''), p.graveId ? btn({ do: 'memorial', data: { id: p.graveId }, cls: 'ghost icon', icon: 'grave', aria: 'Memorial of ' + p.first }) : '', { k: p.id });
      }
      return s;
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
    invite(el) { doAct({ type: 'invite', travelerId: el.dataset.id }); },
    person(el) { hooks.openPerson(el.dataset.id); },
    memorial(el) { hooks.openMemorial(el.dataset.id); },
    decide(el) { hooks.openOffer(el.dataset.id || (ui.sel && ui.sel.id)); },
    send(el) { hooks.openRun({ personId: el.dataset.id }); },
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
    onClose() { if (iso && iso.gather) iso.gather(false); doAct({ type: 'flag', name: 'finale' }, { quiet: true }); },
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

  // ---------------------------------------------------------------------------------------------- PLACEHOLDERS for the next stage: run sheet, result, revive offer, person card, memorial
  // A plain run sheet with an instant simulated run, so the goal chain can be played end to end before the full 8.7
  // screens exist. The next stage replaces these overlay kinds (and UI.hooks) with the real run flow.
  const run = { destId: null, personId: null, kit: null };
  function runDefaults(a) {
    const dests = V.dests.filter((d) => d.open);
    let dest = a.destId && V.dests.find((d) => d.id === a.destId) ? a.destId : V.play ? V.play.destId : (dests[0] || V.dests[0]).id;
    if (!V.dests.find((d) => d.id === dest && d.open)) dest = (dests[0] || V.dests[0]).id;
    return dest;
  }
  OVERLAYS.run = {
    dark: true,
    onOpen(a) { run.destId = runDefaults(a); run.personId = a.personId || null; run.kit = null; if (run.destId !== S.lastDest) doAct({ type: 'setLastDest', destId: run.destId }, { quiet: true }); },
    render(v) {
      if (v.pending) return '<div class="rs"><div class="rs-head"><h2>NIGHT ' + v.pending.night + ' · ' + esc(v.pending.destName.toUpperCase()) + '</h2><button class="xbtn" data-do="closeOverlay" aria-label="Close">' + ic('close') + '</button></div>' +
        '<div class="rs-body"><p>' + esc(nameFor(v.pending.personId)) + ' is out.</p>' + btn({ do: 'runResolve', cls: 'primary', label: 'SEE HOW IT WENT', primary: true }) + '</div></div>';
      const dest = run.destId, strip = E.strip(S, dest);
      let pid = run.personId && strip.find((r) => r.personId === run.personId) ? run.personId : null;
      if (!pid) { const sg = E.suggest(S, dest); pid = sg ? sg.personId : strip[0] ? strip[0].personId : null; }
      let s = '<div class="rs"><div class="rs-head"><h2>NIGHT ' + (v.night + 1) + ' · WHO GOES TONIGHT?</h2><button class="xbtn" data-do="closeOverlay" aria-label="Close">' + ic('close') + '</button></div><div class="rs-body"><div class="rs-row">';
      for (const d of v.dests) s += '<button class="dchip' + (d.id === dest ? ' on' : '') + (d.open ? '' : ' off') + '" data-do="runDest" data-id="' + d.id + '"' + (d.open ? '' : ' aria-disabled="true" data-why="' + esc(d.lock) + '"') + '><b>' + esc(d.name) + '</b><span>' +
        (d.open ? (d.cleared ? fmt.num(d.bricks) + ' · ' + fmt.num(d.cans) : '✦ ' + d.firstSparks + ' first clear') : esc(d.lock)) + '</span></button>';
      s += '</div><div class="rs-row">';
      for (const r of strip) { const p = personV(r.personId); s += '<button class="rchip' + (r.personId === pid ? ' on' : '') + '" data-do="runPick" data-id="' + r.personId + '">' + portrait(p.look, 40) + '<b>' + esc(p.first) + '</b>' + pill(r.home == null ? '…' : fmt.pct(r.home), r.badge === 'good' ? 'good' : r.badge === 'low' ? 'red' : '') + '</button>'; }
      if (!strip.length) s += '<p class="soft">Nobody can go right now.</p>';
      s += '</div>';
      if (pid) {
        const c = E.runCard(S, dest, pid, run.kit);
        s += '<div><b class="cond" style="font-size:20px">' + esc(c.name) + '</b> <span class="soft">Lv ' + c.lv + '</span><div class="soft" style="font-size:12px">' + esc(c.roleLine) + ' · ' + esc(c.traitChip) + '</div></div>' +
          '<div class="odds"><span class="h">' + esc(c.homeText) + '</span><span class="d' + (c.deathRed ? ' red' : '') + '">' + esc(c.deathText) + '</span></div>' +
          (c.fallLine ? '<div class="soft" style="font-size:12.5px">' + esc(c.fallLine) + '</div>' : '') + (c.tiredLine ? '<div class="soft" style="font-size:12.5px">' + esc(c.tiredLine) + '</div>' : '') +
          '<div class="soft" style="font-size:12.5px">' + esc(c.hint) + '</div><div class="kitrow">';
        for (const t of c.toggles) if (t.open) s += btn({ do: 'runKit', data: { item: t.item }, cls: t.on ? 'on' : 'ghost', label: esc(t.label) });
        s += '</div>' + (c.rest ? skipBtn('rest:' + pid, c.rest.price, 'restNow', { id: pid }, 'REST NOW') : '');
        s += '<div class="rs-go">' + btn({ do: 'runGo', data: { id: pid }, cls: (c.low ? 'bad' : 'primary') + ' main' + (c.go.ok ? '' : ' off'), why: c.go.ok ? null : c.go.err === 'cost' ? 'Need more cans for the kit' : 'Not possible right now', label: run.low ? 'RUN IT ANYWAY?' : c.go.label, primary: true }) + '</div>';
      }
      return s + '</div></div>';
    },
    esc() { closeOverlay(); },
  };
  DO.runDest = (el) => { run.destId = el.dataset.id; run.kit = null; doAct({ type: 'setLastDest', destId: run.destId }, { quiet: true }); renderOverlay(); };
  DO.runPick = (el) => { run.personId = el.dataset.id; run.kit = null; run.low = false; renderOverlay(); };
  DO.runKit = (el) => {
    const sg = E.suggest(S, run.destId), pid = run.personId || (sg ? sg.personId : null); if (!pid) return;
    const it = el.dataset.item, c = E.runCard(S, run.destId, pid, run.kit), k = Object.assign({}, c.kit);
    const t = c.toggles.find((x) => x.item === it); if (!t) return;
    if (!k[it] && !t.canTurnOn) { toast('Need more cans', { kind: 'bad' }); return; }
    k[it] = k[it] ? 0 : 1; run.kit = k; renderOverlay();
  };
  DO.runGo = (el) => {
    const pid = el.dataset.id, c = E.runCard(S, run.destId, pid, run.kit);
    if (c.low && !run.low) { run.low = true; renderOverlay(); setTimeout(() => { run.low = false; renderOverlay(); }, 3000); return; }
    const r = doAct({ type: 'startRun', destId: run.destId, personId: pid, kit: c.kit, confirmLow: !!run.low }, { quiet: true });
    run.low = false;
    if (!r.ok) { explain(r); return; }
    if (iso) iso.holdArrivals(true);
    DO.runResolve();
  };
  DO.runResolve = () => {
    const r = doAct({ type: 'resolveRun', source: 'sim' }, { quiet: true });
    if (!r.ok) { explain(r); if (iso) iso.holdArrivals(false); return; }
    closeOverlay('run');
    openOverlay('result', { reward: r.data.reward, offer: r.data.offer });
  };
  OVERLAYS.result = {
    dark: true,
    render(v, a) {
      const w = a.reward, L = w.lines || {};
      let s = '<div class="card"><div class="cb"><h2 style="color:' + (w.win ? 'var(--good)' : 'var(--bad)') + '">' + esc(L.title) + '<small>' + esc(L.sub) + '</small></h2><ul class="srcs">' +
        '<li>Bricks<b>+' + fmt.num(w.bricks) + (L.salvage ? ' (' + esc(L.salvage) + ')' : '') + '</b></li><li>Cans<b>+' + fmt.num(w.cans) + '</b></li><li>XP<b>+' + fmt.num(w.xp) + '</b></li>';
      if (L.firstClear) s += '<li>Sparks<b>' + esc(L.firstClear) + '</b></li>';
      if (L.daily) s += '<li>Sparks<b>' + esc(L.daily) + '</b></li>';
      s += '</ul>';
      for (const k of ['nick', 'kit', 'overflow', 'rest', 'fall']) if (L[k]) s += '<p class="soft" style="font-size:12.5px">' + esc(L[k]) + '</p>';
      return s + '</div><div class="cf">' + btn({ do: 'resultBack', cls: 'primary', label: 'BACK TO TOWN', primary: true }) + '</div></div>';
    },
    esc() { DO.resultBack(); },
  };
  DO.resultBack = () => {
    const o = ui.overlay; if (!o || o.kind !== 'result') return;
    closeOverlay('result');
    if (iso) iso.holdArrivals(false);
    if (o.args.reward && o.args.reward.win) { if (iso) iso.ringBell(2); sfx('bell', { times: 2 }); }
    if (o.args.offer) openOverlay('offer', { personId: o.args.offer.personId });
  };
  OVERLAYS.offer = {
    render(v, a) {
      const o = E.offer(S, a.personId); if (!o) return null;
      return '<div class="card"><div class="cb"><div class="meet">' + portrait(o.look, 80, true) + '<div><div class="who" style="font-size:22px">' + esc(o.title) + '</div><p class="soft">' + esc(o.roleLine) + '<br>' + esc(o.where) + '</p></div></div>' +
        '<div class="tr-list" style="margin-top:10px">' +
        btn({ do: 'revive', data: { id: o.personId, pay: 'cans' }, cls: 'primary' + (o.revive.ok ? '' : ' off'), why: o.revive.needText, label: esc(o.revive.label) + ' ' + ic('can'), sub: esc(o.revive.sub) }) +
        btn({ do: 'revive', data: { id: o.personId, pay: 'sparks' }, cls: 'spark' + (o.reviveNow.ok ? '' : ' off'), why: o.reviveNow.needText, label: esc(o.reviveNow.label), sub: esc(o.reviveNow.sub) }) +
        btn({ do: 'goodbye', data: { id: o.personId }, cls: 'ghost', label: 'SAY GOODBYE', sub: esc(o.goodbye.sub) }) + '</div>' + (o.revivedText ? '<p class="soft">' + esc(o.revivedText) + '</p>' : '') +
        '</div><div class="cf"><span class="grow">' + esc(o.leftText) + '</span>' + btn({ do: 'closeOverlay', cls: 'ghost', label: 'DECIDE LATER' }) + '</div></div>';
    },
  };
  DO.revive = (el) => { const r = doAct({ type: 'revive', personId: el.dataset.id, pay: el.dataset.pay }); if (r.ok) closeOverlay('offer'); };
  DO.goodbye = (el) => {
    const r = doAct({ type: 'goodbye', personId: el.dataset.id });
    if (!r.ok) return;
    closeOverlay('offer'); sfx('bell', { times: 1, low: true }); if (iso) iso.ringBell(1, { low: true });
    if (r.data && r.data.graveId) {
      const gid = r.data.graveId;
      if (r.data.spot && iso) {                                 // 6.7: the grave's move mode opens with LAY TO REST and no ✕
        iso.focus({ kind: 'grave', id: gid }, { ease: true });
        startMove({ kind: 'grave', id: gid }, { ok: 'LAY TO REST', cancel: null, hint: 'Drag to choose a place' });
      }
    }
  };
  OVERLAYS.person = {
    render(v, a) {
      const p = personV(a.id); if (!p) return null;
      const trav = p.arrivedHow === 'traveler', inn = v.inn;
      let s = '<div class="card wide"><button class="xbtn x" data-do="closeOverlay" aria-label="Close">' + ic('close') + '</button><div class="cb"><div class="meet">' + portrait(p.look, 96, p.state === 'down' || p.state === 'fallen') + '<div style="min-width:0">' +
        '<div class="who">' + esc(p.fullName) + '<small>, ' + p.age + '</small></div><p>' + esc(p.card) + '</p><div class="chips">' + pill(p.roleChip) + pill(p.traitChip, 'warm') + (p.nickChip ? pill(p.nickChip, 'spk') : '') + '</div>' +
        '<p class="soft" style="font-size:12px">' + esc(p.ttlLine) + '</p><p class="soft" style="font-size:12px">Lv ' + p.lv + ' · ' + fmt.num(p.xp) + ' / ' + fmt.num(p.xpTo) + ' XP · ' + esc(p.pill) + (p.house ? ' · the ' + esc(p.house) + ' House' : '') + '</p></div></div>';
      if (!trav && p.history && p.history.length) { s += '<div class="sec">History</div>'; for (const h of p.history.slice(-5).reverse()) s += '<div class="soft" style="font-size:12.5px">' + esc(h[1]) + '</div>'; }
      s += '</div><div class="cf">';
      if (trav && inn) s += btn({ do: 'invite', data: { id: p.id }, cls: 'primary' + (inn.canInvite.ok ? '' : ' off'), why: inn.canInvite.err === 'beds' ? 'No free bed' : inn.canInvite.err === 'cost' ? 'Need ' + fmt.num(inn.invitePrice - v.res.cans) + ' more cans' : null, label: 'INVITE · ' + fmt.num(inn.invitePrice) + ' cans', primary: true });
      else {
        if (p.state === 'rest') s += skipBtn('rest:' + p.id, E.price.skip(p.restLeftMs / 1000, S), 'restNow', { id: p.id }, 'REST NOW');
        if (p.state === 'down') s += btn({ do: 'decide', data: { id: p.id }, cls: 'primary', label: 'DECIDE', primary: true });
        if (p.canRun) s += btn({ do: 'send', data: { id: p.id }, cls: 'primary', label: 'SEND TONIGHT', primary: true });
      }
      return s + '</div></div>';
    },
  };
  OVERLAYS.memorial = {
    render(v, a) {
      const m = E.memorial(S, a.id); if (!m) return null;
      return '<div class="card"><div class="cb"><div class="meet">' + portrait(m.look, 80, true) + '<div><div class="who" style="font-size:22px">' + esc(m.name) + '</div><p class="soft">' + esc(m.roleLine) + '<br>' + esc(m.usedToBe) + '</p></div></div>' +
        '<p style="font-style:italic">' + m.epitaph.map(esc).join('<br>') + '</p>' + (m.record ? '<p class="soft">' + esc(m.record) + '</p>' : '') + (m.fellLine ? '<p class="soft">' + esc(m.fellLine) + '</p>' : '') +
        '</div><div class="cf">' + btn({ do: 'memorialMove', data: { id: m.graveId }, cls: 'ghost', label: 'MOVE' }) + btn({ do: 'closeOverlay', cls: 'primary', label: 'CLOSE', primary: true }) + '</div></div>';
    },
  };
  DO.memorialMove = (el) => { const id = el.dataset.id; closeOverlay('memorial'); startMove({ kind: 'grave', id }); };
  // what the rest of the page calls; the next stage swaps these for the full run flow, roster and death screens
  const hooks = {
    openRun(a) { openOverlay('run', a || {}); },
    openOffer(personId) { if (personId) openOverlay('offer', { personId }); },
    openPerson(id) { if (id) openOverlay('person', { id }); },
    openMemorial(graveId) { if (graveId) openOverlay('memorial', { id: graveId }); },
    openRoster() { openSheet('people'); },
    resolveResult(json) {                                       // the Lab's "paste a result JSON"
      const r = doAct({ type: 'resolveRun', result: json, source: 'paste' }, { quiet: true });
      if (r.ok) { if (iso) iso.holdArrivals(true); openOverlay('result', { reward: r.data.reward, offer: r.data.offer }); }
      return r;
    },
  };

  // ---------------------------------------------------------------------------------------------- the Lab panel (lab.js)
  function openLab() {
    if (ui.sheet) closeSheet();
    if (ui.mode) cancelMode();
    if (ui.tray) closeTray(true);
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
    S = next; ui.status = status || 'ok'; ui.dispInit = false; ui.inflight = { bricks: 0, cans: 0, sparks: 0 };
    ui.sel = null; ui.mode = null; ui.queue = [];
    if (iso) { iso.ghostEnd(); iso.select(null); }
    if (ui.overlay) { ui.overlay = null; morph($('overlay'), ''); setClass('ov-open', false); if (iso) iso.setInteractive(true); }
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
    kpis: () => E.kpis(S),
    toast: (t, o) => toast(t, o),
    close: () => closeLab(),
    isDemo: () => ui.demo,
    layout: () => Object.assign({}, ui.layout),
    perf: () => perfStats(),                                    // { frames, avg, max, p95 } ms of script per frame
    on(name, fn) { if (labSubs[name] && typeof fn === 'function') labSubs[name].push(fn); return () => { const l = labSubs[name]; const i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); }; },
  };

  // ---------------------------------------------------------------------------------------------- the onboarding spotlight (7.1) and odds in idle frames (6.3.5)
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
  function oddsWork() {
    if (!V || !S) return;
    const t0 = now();
    let list = null;
    if (ui.overlay && ui.overlay.kind === 'run' && run.destId) list = E.oddsTodo(S, run.destId);
    if ((!list || !list.length) && V.play && !V.play.known) list = E.oddsTodo(S);
    if (!list || !list.length) return;
    for (const it of list) {
      E.odds(S, it.destId, it.personId, it.kit);
      ui.dirty = true; ui.panelDirty = true;
      if (now() - t0 > 6) break;
    }
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
    if (el.getAttribute('aria-disabled') === 'true') { const why = el.dataset.why; if (why) toast(why); sfx('tick'); return; }
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
      if (r.status === 'corrupt-reset') { store.set(KEY_BAD, raw); setTimeout(() => toast('The old save could not be read. It was kept aside and a new city begins.', { ms: 5000 }), 800); }
      if (r.status === 'future-version') { ui.noSave = true; setTimeout(() => toast('This save is from a newer version. Playing without saving.', { ms: 5000 }), 800); }
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
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  return UI;
});
