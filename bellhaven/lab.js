/* Bellhaven Lab (BH.Lab): the dev and tuning panel of SPEC 9, with 13.1's P1 (b): the calibration table and the
 * section-10 targets with ✓ / ✗ for this save's persona-like play.
 *
 * PLUGS IN  The LAB chip (ui.js) shows the #lab panel and calls BH.Lab.open(api); ✕ here calls api.close(), and ui.js
 *   calls BH.Lab.close() whenever it hides the panel. api = UI.labApi, documented at the top of ui.js: el, Engine,
 *   DATA, Art, fmt, getState, view, act, dev, exportSave, importSave, resetSave, setTimeScale, reducedMotion, sound,
 *   skipAhead, replayOnboarding, openDemo, resolveResult, kpis, toast, close, isDemo, perf, on('tick' | 'events' |
 *   'close'). Every change goes through api.act / api.dev, that is Engine.act({ type: 'dev', op, ... }): the engine
 *   tags it dev (never income in the telemetry), the UI saves and redraws, and the tuning is saved with the game. The
 *   Lab reads the live state and never writes to it. Optional: api.openOffer(personId) (else BH.UI.hooks.openOffer)
 *   opens the revive offer after "kill".
 * DOM  The Lab builds its own root (div.bhl) inside api.el and injects one scoped stylesheet (style#bhl-css) drawn
 *   with the page's tokens (--ink, --accent, --u, ... with fallbacks, so a bare test page renders it too). Groups
 *   collapse, the body scrolls, every control is at least 44 x 44 CSS px, and only the wide tables scroll sideways,
 *   inside their own boxes. Controls are built once per opening; values, labels and tables are patched in place
 *   (keyed, like ui.js's morph, so a button under a finger is never replaced) once a second (api.on('tick')), after
 *   every Lab action and after engine events, and only for the groups that are open.
 * TIME  No Date.now, performance.now or storage here (11.1: ui.js owns them). "Now" is state.realLast, which the UI
 *   stamps every frame; two-tap confirmations disarm with a timer; the odds table fills one runner x place pair per
 *   animation frame (0.5-3 ms each), only while the Runs group is open.
 * GROUPS (SPEC 9) Time · Grants · Runs · Tuning · Sound (added: the sound switch that ui.js routes to the Lab, and a
 *   tester for every cue of BH.Sfx) · People · State · Telemetry. Every tuning value has its own reset (↺) and the
 *   Tuning group resets the whole Lab (asks twice).
 * SPEC READINGS (each also marked "Spec reading:" where it happens)
 *   - "open the free test packs" claims the free test packs (Engine.act claimPack: free, labelled, dev-tagged).
 *   - A forced outcome stays on until it is set back to Auto (the engine's rule; section 9 does not say "one run").
 *   - "reroll the starters (a new save seed)" builds the new city on a copy with the engine's dev reroll (the Lab
 *     settings kept), loads it with api.importSave (so the UI resets cleanly) and plays the meet cards.
 *   - "the section-10 targets for this save's persona-like play": the Lab guesses the persona from the telemetry
 *     (packs claimed and more sparks spent than earned: the spender; a mean shown Death of 7 % or more per run: the
 *     reckless player; under 12 runs a day: the idle checker; else the active player; a switch overrides the guess)
 *     and judges this one save against section 10's 20-seed range where the spec prints one, else against a band
 *     around the median (Tower level ±1, shares ±8 points, rates ±40 %). Medians and means over 20 seeds are what
 *     sim-bot.cjs asserts; one save can only be in or out of range.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Lab = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const NONE = { open() {}, close() {}, isOpen: () => false, refresh() {} };
  if (typeof document === 'undefined' || typeof window === 'undefined') return NONE;

  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const GROUPS = [['time', 'Time'], ['grants', 'Grants'], ['runs', 'Runs'], ['tuning', 'Tuning'], ['sound', 'Sound'], ['people', 'People'], ['state', 'State'], ['tele', 'Telemetry']];
  const STEPS_A = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4], STEPS_B = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4], STEPS_D = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
  const MULS = [['cost', 'Costs', STEPS_A], ['time', 'Build times', STEPS_B], ['prod', 'Production', STEPS_A], ['loot', 'Loot', STEPS_A], ['xp', 'XP', STEPS_A],
    ['death', 'Death', STEPS_D], ['revive', 'Revive price', STEPS_A], ['rest', 'Rest', STEPS_B], ['inn', 'Inn refresh', STEPS_B]];
  const seq = (a, b, s, d) => { const o = []; for (let x = a; x <= b + 1e-9; x += s) o.push(+x.toFixed(d)); return o; };
  const WINDOWS = [1, 5, 15, 30, 60, 120, 240, 480, 720, 1080, 1440, 2160, 2880].map((m) => m * MIN);
  const FREE = [0, 10, 20, 30, 45, 60, 90, 120, 180, 240, 300];
  const SKIP_AT = [[120, '2 min'], [600, '10 min'], [3600, '1 h'], [8 * 3600, '8 h'], [42 * 3600, '42 h']];
  const SRC = { tower: 'Bell Tower levels', goals: 'Goals', firstClear: 'First clears', daily: 'Daily spark', rubble: 'Rubble' };
  const SINK = { finish: 'Finish', restNow: 'Rest now', innNow: 'New travelers now', revive: 'Revives', crane: 'The 4th crane' };
  const CUE_TESTS = [['tick', 'TICK'], ['collect', 'COLLECT · BRICKS', { res: 'bricks', streak: 6 }], ['collect', 'COLLECT · CANS', { res: 'cans', streak: 6 }],
    ['collect', 'GLINT · SPARKS', { res: 'sparks', step: 4 }], ['place', 'PLACE'], ['whirr', 'WHIRR'], ['finish', 'FINISH'], ['bell', 'BELL ×1', { times: 1 }],
    ['bell', 'BELL ×2 · HOME', { times: 2 }], ['bell', 'BELL ×3 · TOWER', { times: 3 }], ['bell', 'TOLL · LOW', { times: 1, low: true }], ['heartbeat', 'HEARTBEAT'],
    ['horde', 'HORDE!'], ['horde', 'GATE CRESCENDO', { gate: true }], ['fallBeat', 'FALL BEAT'],
    // P1 "more sound": sfx.js has them, ui.js does not call them yet
    ['levelUp', 'LEVEL UP', null, 1], ['nickname', 'NICKNAME', null, 1], ['revive', 'REVIVE', null, 1], ['invite', 'INVITE', null, 1],
    ['expand', 'EXPAND', null, 1], ['rubble', 'RUBBLE', null, 1], ['spark', 'SPARKS', null, 1], ['deny', 'DENY', null, 1]];
  // Section 10 (sim/ref.cjs, 20 seeds). tw: the Tower level at 15 min / 1 h / 1 day [median, lo, hi]; t10: the day of
  // Tower 10 [lo, hi, id]; day7: the Tower at day 7; the rest [median, lo, hi, id?] per day, per week or as a share.
  // lo-hi is the 20-seed range where section 10 prints one, else the band of the header (Spec reading).
  const REF = {
    active: { name: 'the active player', tw: { q: [3, 2, 4], h: [4, 3, 4], d: [6, 5, 7] }, t10: [6.0, 7.0, 'P1'], runsDay: [25, 15, 35], win: [0.92, 0.88, 0.96, 'P5'],
      downs: [7, 2, 11, 'P2'], graves: [1, 0, 5, 'P3'], sparks: [275, 250, 300, 'P9'], runShare: [0.33, 0.30, 0.35], idle: [0.44, 0.36, 0.52],
      towers: { 3: 8.5 * MIN, 4: 55 * MIN, 5: 4.1 * HOUR, 6: 16.3 * HOUR, 7: 1.65 * DAY, 8: 2.7 * DAY, 9: 4.3 * DAY, 10: 6.2 * DAY } },
    idle: { name: 'the idle checker', tw: { q: [3, 2, 4], h: [3, 2, 4], d: [5, 4, 6] }, day7: [9, 8, 10, 'P6'], runsDay: [6.3, 3.8, 8.8], win: [0.89, 0.81, 0.97],
      downs: [2, 0, 7, 'P6'], graves: [1, 0, 7], sparks: [235, 141, 329], runShare: [0.09, 0.07, 0.14], idle: [0.53, 0.45, 0.61],
      towers: { 4: 3.1 * HOUR, 5: 6.8 * HOUR, 6: 1.2 * DAY, 7: 2.5 * DAY, 8: 3.7 * DAY, 9: 5.3 * DAY } },
    spender: { name: 'the spender', tw: { q: [3, 2, 4], h: [4, 3, 5], d: [6, 6, 7] }, t10: [3.2, 4.7, 'P8'], runsDay: [23, 13.8, 32.2], win: [0.96, 0.88, 1],
      downs: [4, 0, 8], graves: [0, 0, 0, 'P8'], sparks: [275, 165, 385], runShare: [0.43, 0.42, 0.47],
      towers: { 4: 47 * MIN, 5: 4 * HOUR, 6: 10 * HOUR, 7: 25 * HOUR, 8: 1.5 * DAY, 9: 2.9 * DAY, 10: 4 * DAY } },
    reckless: { name: 'the reckless player', tw: { q: [2, 2, 3], h: [4, 3, 5], d: [6, 5, 7] }, t10: [5.5, 7.0], runsDay: [24, 14.4, 33.6], win: [0.81, 0.73, 0.89],
      downs: [18, 1, 68], graves: [9, 1, 29], sparks: [273, 164, 382], runShare: [0.32, 0.29, 0.35], idle: [0.44, 0.36, 0.52],
      towers: { 10: 6.1 * DAY } },
  };

  let A = null, E = null, D = null, F = null, rootEl = null, bodyEl = null, unsubs = [], queued = 0;
  const CTL = {}, OUT = {}, ACTS = {};
  const L = {                                                 // panel memory for this page (the tuning itself is saved)
    open: { time: true }, persona: 'auto', sel: null, galSeed: 1, galPick: null, addLv: 1, seed: null, paste: null, pasteText: '',
    saveMsg: null, saveText: '', armed: {}, oddsRaf: 0, oddsTodo: null, oddsN: 0, drone: false, heart: false, scroll: 0, faces: new Map(), gal: null,
  };
  const rep = { t: 0, i: 0, fired: false, el: null };

  // ---------------------------------------------------------------------------------------------- small helpers
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const S_ = () => (A ? A.getState() : null);
  function V_() { const v = A && A.view ? A.view() : null; if (v) return v; const s = S_(); return s ? E.view(s) : null; }
  const dur = (ms) => F.dur(Math.max(0, ms) / 1000);
  const ok3 = (v) => v != null && isFinite(v);
  const pct0 = (x) => (ok3(x) ? Math.round(x * 100) + ' %' : '–');
  const pct1 = (x) => (ok3(x) ? (Math.round(x * 1000) / 10).toFixed(1) + ' %' : '–');
  const dec1 = (x) => (ok3(x) ? (Math.round(x * 10) / 10).toFixed(1) : '–');
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  const nameOfRole = (r) => (D.ROLE_STATS[r] ? D.ROLE_STATS[r].name : r);
  const nameOfTrait = (t) => (D.TRAITS[t] ? D.TRAITS[t].name : t);
  const destOf = (id) => D.DESTS.find((d) => d.id === id) || null;
  function dayClock(ms) { const c = ms + 9 * HOUR; return 'Day ' + (Math.floor(c / DAY) + 1) + ' · ' + pad2(Math.floor((c % DAY) / HOUR)) + ':' + pad2(Math.floor((c % HOUR) / MIN)); }
  const scaleText = (x) => (x === 0 ? 'PAUSED' : x + '×');
  function ic(name) { try { return A && A.Art && A.Art.iconSVG ? A.Art.iconSVG(name, 18) || '' : ''; } catch (e) { return ''; } }
  function face(look, size, grey) {
    if (!look || !A || !A.Art || !A.Art.portraitURL) return '<i class="bhl-ph"></i>';
    const k = JSON.stringify(look) + '|' + size + (grey ? 'g' : '');
    let u = L.faces.get(k);
    if (u == null) { try { u = A.Art.portraitURL(look, size, { grey: !!grey }) || ''; } catch (e) { u = ''; } if (L.faces.size > 160) L.faces.clear(); L.faces.set(k, u); }
    return u ? '<img alt="" src="' + u + '" width="' + size + '" height="' + size + '">' : '<i class="bhl-ph"></i>';
  }
  const ck = (ok) => (ok === true ? '<span class="ok bhl-ck">✓</span>' : ok === false ? '<span class="no bhl-ck">✗</span>' : '<span class="mu">–</span>');
  function toast(t) { try { if (A && A.toast) A.toast(t); } catch (e) { /* the toast is optional */ } }
  function sfx(cue, o) { try { if (BH.Sfx && BH.Sfx.play) return BH.Sfx.play(cue, o || {}); } catch (e) { /* sound is optional */ } return false; }
  function dev(op, args) { return A.dev(op, args || {}) || { ok: false }; }
  let kmemo = null;                                           // one kpis() per refresh, shared by the outputs
  function kpis() { if (!kmemo) kmemo = A.kpis ? A.kpis() : E.kpis(S_()); return kmemo; }

  // morph(el, html): patch el to match html, keeping every node whose tag (and data-k) is unchanged (as in ui.js)
  function morph(el, html) {
    if (!el || el.__h === html) return;
    el.__h = html;
    const t = document.createElement('template'); t.innerHTML = html;
    patch(el, t.content);
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

  // ---------------------------------------------------------------------------------------------- markup helpers
  // b(a, label, o): an action button (data-a); o: { cls, x (data-x), why (disabled, the reason as a toast), arm
  // (a second label: the action asks twice), aria, icon }
  function b(a, label, o) {
    o = o || {};
    return '<button type="button" class="bhl-b' + (o.cls ? ' ' + o.cls : '') + '" data-a="' + a + '"' + (o.x != null ? ' data-x="' + esc(o.x) + '"' : '') +
      (o.why ? ' aria-disabled="true" data-why="' + esc(o.why) + '"' : '') + (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') +
      (o.arm ? ' data-arm="' + a + '" data-l0="' + esc(label) + '" data-l1="' + esc(o.arm) + '"' : '') + '>' + (o.icon ? ic(o.icon) : '') + '<span>' + esc(label) + '</span></button>';
  }
  // row: the label and its control on one line, the explanation (sub, or a live output) under them, a segmented
  // control on its own line last
  const row = (label, sub, ctl, out) => '<div class="bhl-r"><div class="bhl-k"><b>' + esc(label) + '</b></div>' + (ctl || '') +
    (out ? '<span class="bhl-sub" data-o="' + out + '">' + esc(sub || '') + '</span>' : sub ? '<span class="bhl-sub">' + esc(sub) + '</span>' : '') + '</div>';
  const head = (t) => '<div class="bhl-h">' + esc(t) + '</div>';
  const note = (html, out) => '<p class="bhl-n"' + (out ? ' data-o="' + out + '"' : '') + '>' + (html || '') + '</p>';
  function defSeg(id, opts, get, set, aria, cls) {
    CTL[id] = { kind: 'seg', get, set };
    return '<div class="bhl-seg' + (cls ? ' ' + cls : '') + '" role="group" aria-label="' + esc(aria) + '">' + opts.map(([v, t]) => '<button type="button" class="bhl-b" data-c="' + id + '" data-v="' + esc(JSON.stringify(v)) + '" aria-pressed="false">' + esc(t) + '</button>').join('') + '</div>';
  }
  function defTog(id, get, set, aria) {
    CTL[id] = { kind: 'tog', get, set };
    return '<button type="button" class="bhl-b tog" data-c="' + id + '" data-v="t" aria-pressed="false" aria-label="' + esc(aria) + '"><span>OFF</span></button>';
  }
  function defStep(id, list, get, set, fmtv, def) { CTL[id] = { kind: 'step', list, get, set, fmt: fmtv, def }; }
  const stepM = (id, aria, reset) => '<div class="bhl-st"><button type="button" class="bhl-b" data-c="' + id + '" data-v="-1" aria-label="' + esc('Lower ' + aria) + '">−</button><output data-ov="' + id + '"></output>' +
    '<button type="button" class="bhl-b" data-c="' + id + '" data-v="1" aria-label="' + esc('Raise ' + aria) + '">+</button>' +
    (reset ? '<button type="button" class="bhl-b rs" data-c="' + id + '" data-v="r" aria-label="' + esc('Reset ' + aria) + '">↺</button>' : '') + '</div>';
  function nearest(list, v) { let bi = 0; for (let i = 1; i < list.length; i++) if (Math.abs(list[i] - v) < Math.abs(list[bi] - v)) bi = i; return bi; }
  const near = (a, c) => a != null && c != null && Math.abs(a - c) < 1e-9;

  // ---------------------------------------------------------------------------------------------- the stylesheet (scoped to .bhl)
  const CSS = [
    '.bhl{--lu:var(--u,1px);flex:1;min-height:0;min-width:0;display:flex;flex-direction:column;color:var(--ink,#f3efe6);font:500 calc(13*var(--lu))/1.35 var(--body,Barlow,system-ui,sans-serif);-webkit-user-select:none;user-select:none}',
    '.bhl *{box-sizing:border-box}',
    ':where(.bhl) button{font:inherit;color:inherit;border:0;background:none;padding:0;margin:0;cursor:pointer;touch-action:manipulation;-webkit-appearance:none;appearance:none;-webkit-touch-callout:none}',
    ':where(.bhl) button:focus{outline:none}.bhl button:focus-visible,.bhl input:focus-visible,.bhl textarea:focus-visible{outline:2px solid var(--accent,#ff7a2f);outline-offset:1px}',
    '.bhl svg{display:block;flex:none}',
    '.bhl-hd{flex:none;display:flex;align-items:center;gap:calc(6*var(--lu));min-height:calc(52*var(--lu));padding:calc(4*var(--lu)) calc(4*var(--lu)) calc(4*var(--lu)) calc(14*var(--lu));border-bottom:1px solid var(--line,rgba(255,255,255,.09))}',
    '.bhl-hd>svg{width:calc(20*var(--lu));height:calc(20*var(--lu));color:var(--accent,#ff7a2f)}',
    '.bhl-ti{flex:1;min-width:0;display:flex;flex-direction:column;gap:calc(2*var(--lu));font:800 calc(18*var(--lu))/1.05 var(--cond,"Barlow Condensed","Arial Narrow",sans-serif);letter-spacing:.02em;text-transform:uppercase}',
    '.bhl-ti small{font:600 calc(11.5*var(--lu))/1.25 var(--body,Barlow,system-ui,sans-serif);color:var(--ink-soft,#a9aeb3);text-transform:none;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bhl-x{width:calc(44*var(--lu));height:calc(44*var(--lu));border-radius:calc(10*var(--lu));display:flex;align-items:center;justify-content:center;flex:none;color:var(--ink-soft,#a9aeb3)}',
    '.bhl-x svg{width:calc(20*var(--lu));height:calc(20*var(--lu))}.bhl-x:active{background:rgba(255,255,255,.08)}',
    '.bhl-bd{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:0 calc(10*var(--lu)) calc(18*var(--lu))}',
    '.bhl-g{border-bottom:1px solid var(--line,rgba(255,255,255,.09))}',
    '.bhl-gh{width:100%;min-height:calc(48*var(--lu));display:flex;align-items:center;gap:calc(8*var(--lu));padding:0 calc(4*var(--lu));text-align:left}',
    '.bhl-gh b{flex:none;font:800 calc(15*var(--lu))/1 var(--cond,"Barlow Condensed",sans-serif);letter-spacing:.07em;text-transform:uppercase}',
    '.bhl-gh span{flex:1;min-width:0;text-align:right;color:var(--ink-soft,#a9aeb3);font-size:calc(11.5*var(--lu));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bhl-gh i{flex:none;width:calc(9*var(--lu));height:calc(9*var(--lu));margin:0 calc(6*var(--lu)) calc(4*var(--lu));border-right:2px solid var(--ink-soft,#a9aeb3);border-bottom:2px solid var(--ink-soft,#a9aeb3);transform:rotate(45deg)}',
    '.bhl-g.open>.bhl-gh i{transform:rotate(225deg);margin-bottom:calc(-4*var(--lu))}',
    '.bhl-gb{display:none;padding:0 calc(2*var(--lu)) calc(14*var(--lu))}.bhl-g.open>.bhl-gb{display:block}',
    '.bhl-r{display:flex;align-items:center;flex-wrap:wrap;gap:calc(6*var(--lu));min-height:calc(48*var(--lu));padding:calc(3*var(--lu)) 0}',
    '.bhl-k{flex:1 1 calc(110*var(--lu));min-width:0;order:0}',
    '.bhl-k b{display:block;font:700 calc(14.5*var(--lu))/1.15 var(--cond,"Barlow Condensed",sans-serif);letter-spacing:.01em}',
    '.bhl-sub{order:2;flex:1 1 100%;margin-top:calc(-3*var(--lu));font-size:calc(11.5*var(--lu));line-height:1.35;color:var(--ink-soft,#a9aeb3)}',
    '.bhl-sub:empty{display:none}',
    '.bhl-b{position:relative;min-width:calc(44*var(--lu));min-height:calc(44*var(--lu));padding:0 calc(10*var(--lu));border-radius:calc(10*var(--lu));background:rgba(255,255,255,.08);display:inline-flex;align-items:center;justify-content:center;gap:calc(5*var(--lu));font:800 calc(13.5*var(--lu))/1.08 var(--cond,"Barlow Condensed",sans-serif);letter-spacing:.03em;text-transform:uppercase;text-align:center}',
    '.bhl-b:active{background:rgba(255,255,255,.16)}',
    '.bhl-b[aria-pressed="true"]{background:var(--accent,#ff7a2f);color:#12161c}',
    '.bhl-b.pri{background:var(--accent,#ff7a2f);color:#12161c}.bhl-b.good{background:var(--good,#3bd16f);color:#12161c}',
    '.bhl-b.bad{background:rgba(255,75,47,.14);color:#ff8f7a;box-shadow:inset 0 0 0 1.5px rgba(255,75,47,.55)}',
    '.bhl-b.armed{background:var(--bad,#ff4b2f);color:#fff;box-shadow:none}',
    '.bhl-b.spk{background:rgba(79,216,255,.1);color:var(--spark,#4fd8ff);box-shadow:inset 0 0 0 1.5px var(--spark,#4fd8ff)}',
    '.bhl-b[aria-disabled="true"]{opacity:.45}',
    '.bhl-b svg{width:calc(16*var(--lu));height:calc(16*var(--lu))}',
    '.bhl-b.tog{min-width:calc(64*var(--lu));flex:none;order:1}',
    '.bhl-seg{order:3;flex:1 1 100%;display:flex;flex-wrap:wrap;gap:calc(4*var(--lu))}',
    '.bhl-seg .bhl-b{flex:1 1 calc(44*var(--lu));padding:0 calc(4*var(--lu))}',
    '.bhl-seg.g5{display:grid;grid-template-columns:repeat(5,1fr)}',
    '.bhl-btns{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(112*var(--lu)),1fr));gap:calc(6*var(--lu));margin:calc(4*var(--lu)) 0}',
    '.bhl-btns .bhl-b{padding:calc(5*var(--lu)) calc(8*var(--lu))}',
    '.bhl-btns.q{grid-template-columns:repeat(auto-fill,minmax(calc(76*var(--lu)),1fr))}',
    '.bhl-st{order:1;flex:none;margin-left:auto;display:flex;align-items:center;gap:calc(4*var(--lu))}',
    '.bhl-st output{min-width:calc(78*var(--lu));text-align:center;font:800 calc(14.5*var(--lu))/1.1 var(--cond,"Barlow Condensed",sans-serif);white-space:nowrap}',
    '.bhl-st .bhl-b{width:calc(44*var(--lu));padding:0;font-size:calc(21*var(--lu));font-weight:700}',
    '.bhl-st .bhl-b.rs{font-size:calc(17*var(--lu))}.bhl-st .bhl-b.rs.def{opacity:.3}.bhl-st .bhl-b.end{opacity:.35}',
    '.bhl-h{margin:calc(14*var(--lu)) 0 calc(4*var(--lu));font:800 calc(12*var(--lu))/1 var(--cond,"Barlow Condensed",sans-serif);letter-spacing:.08em;color:var(--ink-soft,#a9aeb3);text-transform:uppercase}',
    '.bhl-n{margin:calc(4*var(--lu)) 0 calc(6*var(--lu));font-size:calc(12*var(--lu));line-height:1.4;color:var(--ink-soft,#a9aeb3)}',
    '.bhl-n b{color:var(--ink,#f3efe6);font-weight:700}',
    '.bhl input[type=number],.bhl input[type=text],.bhl textarea{font:500 calc(13*var(--lu))/1.3 var(--body,Barlow,system-ui,sans-serif);color:var(--ink,#f3efe6);background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.14);border-radius:calc(10*var(--lu));padding:0 calc(10*var(--lu));min-height:calc(44*var(--lu));min-width:calc(44*var(--lu));-webkit-user-select:text;user-select:text}',
    '.bhl input[type=number]{width:calc(128*var(--lu));flex:none}',
    '.bhl textarea{display:block;width:100%;min-height:calc(100*var(--lu));padding:calc(8*var(--lu)) calc(10*var(--lu));font:500 calc(11.5*var(--lu))/1.35 ui-monospace,Menlo,Consolas,monospace;resize:vertical;white-space:pre;overflow:auto}',
    '.bhl-in{display:flex;flex-wrap:wrap;align-items:center;gap:calc(6*var(--lu));margin:calc(4*var(--lu)) 0}',
    '.bhl-msg{margin:calc(6*var(--lu)) 0;font-size:calc(12*var(--lu));line-height:1.4;overflow-wrap:anywhere}',
    '.bhl-msg.ok{color:var(--good,#3bd16f)}.bhl-msg.bad{color:#ff8f7a}.bhl-msg.info{color:var(--ink-soft,#a9aeb3)}',
    '.bhl-msg ul{margin:calc(4*var(--lu)) 0 0;padding-left:calc(18*var(--lu));color:var(--ink-soft,#a9aeb3)}',
    '.bhl-tw{max-width:100%;overflow-x:auto;overscroll-behavior-x:contain;margin:calc(4*var(--lu)) 0}',
    '.bhl table{border-collapse:collapse;width:100%;font-size:calc(12*var(--lu));line-height:1.25}',
    '.bhl th{padding:calc(4*var(--lu)) calc(5*var(--lu));text-align:left;white-space:nowrap;border-bottom:1px solid var(--line,rgba(255,255,255,.09));font:800 calc(10.5*var(--lu))/1.2 var(--cond,"Barlow Condensed",sans-serif);letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft,#a9aeb3)}',
    '.bhl td{padding:calc(4*var(--lu)) calc(5*var(--lu));border-bottom:1px solid rgba(255,255,255,.05);vertical-align:top}',
    '.bhl td.n,.bhl th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.bhl table.odds td,.bhl table.odds th{padding-left:calc(3.5*var(--lu));padding-right:calc(3.5*var(--lu))}',
    '.bhl table.odds td b{display:block;font:700 calc(13*var(--lu))/1.15 var(--cond,"Barlow Condensed",sans-serif);white-space:nowrap}',
    '.bhl table.odds td span{display:block;font-size:calc(10.5*var(--lu));white-space:nowrap}',
    '.bhl tr.sub td{padding-top:calc(9*var(--lu));color:var(--ink-soft,#a9aeb3);font:800 calc(11*var(--lu))/1.2 var(--cond,"Barlow Condensed",sans-serif);letter-spacing:.05em;text-transform:uppercase}',
    '.bhl .ok{color:var(--good,#3bd16f)}.bhl .no,.bhl .red{color:#ff8f7a}.bhl .mu{color:var(--ink-soft,#a9aeb3)}.bhl .bhl-ck{font-weight:800;font-size:calc(14*var(--lu))}',
    '.bhl-ppl{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(158*var(--lu)),1fr));gap:calc(6*var(--lu))}',
    '.bhl-p{display:flex;align-items:center;gap:calc(8*var(--lu));min-height:calc(52*var(--lu));min-width:0;padding:calc(4*var(--lu)) calc(8*var(--lu)) calc(4*var(--lu)) calc(5*var(--lu));border-radius:calc(10*var(--lu));background:rgba(255,255,255,.05);text-align:left}',
    '.bhl-p[aria-pressed="true"],.bhl-gal button[aria-pressed="true"]{box-shadow:inset 0 0 0 2px var(--accent,#ff7a2f)}',
    '.bhl-p img,.bhl-p .bhl-ph{width:calc(38*var(--lu));height:calc(38*var(--lu));border-radius:50%;flex:none}',
    '.bhl-p .t{flex:1;min-width:0}',
    '.bhl-p .t b{display:block;font:700 calc(13.5*var(--lu))/1.15 var(--cond,"Barlow Condensed",sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bhl-p .t span{display:block;font-size:calc(11*var(--lu));color:var(--ink-soft,#a9aeb3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bhl-p .t span.red{color:#ff8f7a}',
    '.bhl-ph{display:block;background:rgba(255,255,255,.1)}',
    '.bhl-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(calc(82*var(--lu)),1fr));gap:calc(6*var(--lu))}',
    '.bhl-gal button{display:flex;flex-direction:column;align-items:center;gap:calc(2*var(--lu));min-width:0;min-height:calc(44*var(--lu));padding:calc(6*var(--lu)) calc(3*var(--lu));border-radius:calc(10*var(--lu));background:rgba(255,255,255,.05)}',
    '.bhl-gal img,.bhl-gal .bhl-ph{width:calc(48*var(--lu));height:calc(48*var(--lu));border-radius:50%}',
    '.bhl-gal b{max-width:100%;font:700 calc(12.5*var(--lu))/1.15 var(--cond,"Barlow Condensed",sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bhl-gal span{max-width:100%;font-size:calc(10.5*var(--lu));color:var(--ink-soft,#a9aeb3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.bhl-card{display:flex;gap:calc(10*var(--lu));align-items:center;margin:calc(8*var(--lu)) 0 calc(2*var(--lu))}',
    '.bhl-card img,.bhl-card .bhl-ph{width:calc(64*var(--lu));height:calc(64*var(--lu));border-radius:50%;flex:none}',
    '.bhl-card .t{min-width:0}.bhl-card b{display:block;font:800 calc(17*var(--lu))/1.1 var(--cond,"Barlow Condensed",sans-serif)}',
    '.bhl-card span{display:block;font-size:calc(12*var(--lu));color:var(--ink-soft,#a9aeb3)}',
    '.bhl pre{margin:calc(4*var(--lu)) 0;max-height:calc(220*var(--lu));overflow:auto;padding:calc(8*var(--lu));border-radius:calc(8*var(--lu));background:rgba(255,255,255,.04);font:500 calc(11*var(--lu))/1.35 ui-monospace,Menlo,Consolas,monospace;white-space:pre;-webkit-user-select:text;user-select:text}',
    '.bhl-btns>span{display:contents}',
  ].join('\n');
  function injectCss() {
    if (document.getElementById('bhl-css')) return;
    const st = document.createElement('style'); st.id = 'bhl-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------------------------------------------------------------------------------------------- the panel
  function group(id, title, inner) {
    const open = !!L.open[id];
    return '<section class="bhl-g' + (open ? ' open' : '') + '" data-gid="' + id + '"><button type="button" class="bhl-gh" data-g="' + id + '" aria-expanded="' + open + '" aria-controls="bhl-gb-' + id + '">' +
      '<b>' + esc(title) + '</b><span data-o="sum:' + id + '"></span><i aria-hidden="true"></i></button><div class="bhl-gb" id="bhl-gb-' + id + '">' + inner + '</div></section>';
  }
  function build() {
    for (const k of Object.keys(CTL)) delete CTL[k];
    const S = S_(), lab = () => S_().lab;
    const B = {};
    // ----- Time (9): scale, pause, skip ahead through the offline path, runs and the clock, the run-warp cap (5.1)
    B.time = row('Time scale', '', defSeg('timeScale', [[0, 'PAUSE'], [1, '1×'], [10, '10×'], [60, '60×'], [600, '600×']], () => lab().timeScale, (v) => A.setTimeScale(v), 'Time scale'), 'scaleSub') +
      head('Skip ahead') + '<div class="bhl-btns q">' + b('skip', '+10 MIN', { x: 10 * MIN }) + b('skip', '+1 H', { x: HOUR }) + b('skip', '+8 H', { x: 8 * HOUR }) + b('skip', '+1 DAY', { x: DAY }) + '</div>' +
      note('Through the offline path: bubbles fill up to the hold, jobs finish in order, a Down window can run out, and the welcome card shows.') +
      row('Runs advance the clock', 'A simulated run moves the city clock by its length', defTog('runsClock', () => lab().runsAdvanceClock, (v) => dev('runsAdvanceClock', { value: v }), 'Runs advance the clock')) +
      row('Run-warp cap', '', stepM('runWarp', 'the run-warp cap', true), 'warpSub') + note('', 'timeInfo');
    defStep('runWarp', seq(0, 20, 1, 0), () => lab().runWarp, (v) => dev('runWarp', { value: v }), (v) => (v ? v + '× real' : 'Off'), 6);
    // ----- Grants (9)
    B.grants = '<div class="bhl-btns">' + b('grant', '+1,000 BRICKS', { x: 'bricks' }) + b('grant', '+1,000 CANS', { x: 'cans' }) + b('grant', '+100 ✦', { x: 'sparks', cls: 'spk' }) +
      b('fill', 'FILL EVERY BUBBLE') + b('finishAll', 'FINISH EVERY TIMER') + b('rubble', 'CLEAR ALL RUBBLE') + '</div>' +
      head('Set the Bell Tower') + defSeg('tower', seq(1, 10, 1, 0).map((n) => [n, String(n)]), () => towerLv(), (v) => dev('setTower', { lv: v }), 'Bell Tower level', 'g5') +
      note('Buildings above the new level drop to it; jobs that no longer fit are cancelled.') +
      head('Free test packs') + '<div class="bhl-btns">' + b('pack', '+100 ✦', { x: 100, cls: 'spk', aria: 'Claim the free 100 sparks test pack' }) + b('pack', '+500 ✦', { x: 500, cls: 'spk', aria: 'Claim the free 500 sparks test pack' }) + b('pack', '+2,500 ✦', { x: 2500, cls: 'spk', aria: 'Claim the free 2,500 sparks test pack' }) + '</div>' +
      note('Prototype test packs: free, no payment. Lab grants and packs are tagged dev and never count as income.') + note('', 'grantInfo');
    // ----- Runs (9). Spec reading: a forced outcome stays on until set back to Auto (the engine keeps lab.force)
    B.runs = row('Outcome of the next runs', 'Stays on until set back to Auto. Down ignores the third-person rule and the Allotments’ rescue.',
      defSeg('force', [['auto', 'AUTO'], ['win', 'WIN'], ['loss', 'LOSS'], ['down', 'DOWN'], ['hurt', 'HURT']], () => lab().force, (v) => dev('force', { value: v }), 'Force the outcome')) +
      row('Run screen', '', defSeg('runScreenS', [[3, '3 S'], [8, '8 S'], [20, '20 S']], () => lab().runScreenS, (v) => dev('runScreenS', { value: v }), 'Run screen length')) +
      row('Forced first wins left', 'A new save starts with 2', defSeg('forcedWins', [[0, '0'], [1, '1'], [2, '2']], () => S_().forcedWins, (v) => dev('forcedWins', { value: v }), 'Forced first wins')) +
      row('Lock the run seed', '', defTog('lockSeed', () => lab().lockSeed != null, (v) => dev('lockSeed', { value: v ? seedIn() : null }), 'Lock the run seed'), 'seedSub') +
      '<div class="bhl-in"><input type="number" inputmode="numeric" min="0" max="4294967295" step="1" data-in="seed" aria-label="Run seed"></div>' +
      row('Wait for a real result', 'GO shows the handoff and waits for a result pasted below', defTog('waitReal', () => !!lab().waitReal, (v) => dev('waitReal', { value: v }), 'Wait for a real result')) +
      '<div data-o="pending"></div>' +
      head('Paste a result JSON') + '<textarea data-in="paste" spellcheck="false" autocomplete="off" aria-label="Result JSON" placeholder="{ &quot;v&quot;: 1, &quot;kind&quot;: &quot;bellhaven.result&quot;, … }"></textarea>' +
      '<div class="bhl-btns">' + b('fillSim', 'FILL FROM THE SIM') + b('check', 'VALIDATE') + b('apply', 'APPLY', { cls: 'pri' }) + '</div><div data-o="pasteMsg"></div>' +
      head('Odds: every runner × every open place') + '<div data-o="odds"></div>';
    // ----- Tuning (9): every value saved with the game, each with a reset
    let tu = '';
    for (const [key, label, list] of MULS) {
      defStep('mul:' + key, list, () => lab().mul[key], (v) => mulSet(key, v), (v) => '×' + v, 1);
      tu += row(label, '', stepM('mul:' + key, label, true), 'mul:' + key);
    }
    tu += head('Stretcher base (rescue chance after an overrun)');
    for (const d of D.DESTS.slice(1)) {
      const i = D.DEST_IDS.indexOf(d.id);
      defStep('rb:' + d.id, seq(0, 1, 0.05, 2), () => lab().rescueBase[i], (v) => dev('rescueBase', { destId: d.id, value: v }), (v) => Math.round(v * 100) + ' %', D.LAB_DEFAULT.rescueBase[i]);
      tu += row(d.id + ' ' + d.name, '', stepM('rb:' + d.id, d.name + ' stretcher base', true));
    }
    const setK = (k, v) => dev('set', { key: k, value: v });
    defStep('clinicRescue', seq(0, 0.1, 0.01, 2), () => lab().clinicRescue, (v) => setK('clinicRescue', v), (v) => '+' + Math.round(v * 100) + ' % / lv', D.LAB_DEFAULT.clinicRescue);
    defStep('tiredFloor', seq(0.3, 1, 0.05, 2), () => lab().tiredFloor, (v) => setK('tiredFloor', v), (v) => Math.round(v * 100) + ' % HP', D.LAB_DEFAULT.tiredFloor);
    defStep('escalationCap', [0, 1, 2, 3, 4], () => lab().escalationCap, (v) => setK('escalationCap', v), (v) => 'n ≤ ' + v + ' (×' + Math.pow(2, v) + ')', D.LAB_DEFAULT.escalationCap);
    defStep('downWindowMs', WINDOWS, () => lab().downWindowMs, (v) => setK('downWindowMs', v), (v) => dur(v), D.LAB_DEFAULT.downWindowMs);
    defStep('freeSec', FREE, () => lab().freeSec, (v) => setK('freeSec', v), (v) => v + ' s', D.LAB_DEFAULT.freeSec);
    defStep('skipExp', seq(0.6, 0.9, 0.01, 2), () => lab().skipExp, (v) => setK('skipExp', v), (v) => v.toFixed(2), D.LAB_DEFAULT.skipExp);
    defStep('skipK', seq(0.5, 3, 0.1, 1), () => lab().skipK, (v) => setK('skipK', v), (v) => '×' + v.toFixed(1), D.LAB_DEFAULT.skipK);
    tu += row('Clinic stretcher per level', '', stepM('clinicRescue', 'the Clinic stretcher per level', true), 'clinicSub') +
      head('People and prices') +
      row('Tired floor', '', stepM('tiredFloor', 'the tired floor', true), 'tiredSub') +
      row('Revive escalation cap', '', stepM('escalationCap', 'the revive escalation cap', true), 'escSub') +
      row('Down window', '', stepM('downWindowMs', 'the Down window', true), 'downSub') +
      head('Skip price (5.6)') +
      row('Free finish', '', stepM('freeSec', 'the free-finish seconds', true), 'freeSub') +
      row('Skip exponent', '', stepM('skipExp', 'the skip exponent', true)) +
      row('Skip multiplier', '', stepM('skipK', 'the skip multiplier', true)) + note('', 'skipInfo') +
      head('Motion') + row('Reduced motion', '', defSeg('rm', [[true, 'ON'], [false, 'OFF'], [null, 'SYSTEM']], () => A.reducedMotion.get(), (v) => A.reducedMotion.set(v), 'Reduced motion'), 'rmSub') +
      '<div class="bhl-btns">' + b('resetLab', 'RESET THE WHOLE LAB', { cls: 'bad', arm: 'TAP AGAIN TO RESET' }) + '</div>' +
      note('Back to the defaults of SPEC 9: every multiplier, rescue, price and run setting (the time scale stays).');
    B.tuning = tu;
    // ----- Sound (added): the switch ui.js routes to the Lab, and a tester for every cue
    let so = row('Sound', 'Saved with the game, like SOUND in the City sheet', defTog('sound', () => !!(A.sound && A.sound.get()), (v) => A.sound.set(v), 'Sound')) +
      head('The cues of 8.16') + '<div class="bhl-btns">';
    CUE_TESTS.forEach((c, i) => { if (!c[3]) so += b('cue', c[1], { x: i }); });
    so += b('drone', 'DRONE LOOP') + b('heart', 'HEARTBEAT LOOP') + '</div>' + head('More sound (P1, not called by the page yet)') + '<div class="bhl-btns">';
    CUE_TESTS.forEach((c, i) => { if (c[3]) so += b('cue', c[1], { x: i }); });
    so += '</div>' + note('', 'sfx');
    B.sound = so;
    // ----- People (9)
    defStep('plv', seq(1, 10, 1, 0), () => { const p = S_().people.find((x) => x.id === L.sel); return p ? p.lv : 1; }, (v) => { if (L.sel) dev('setLevel', { personId: L.sel, lv: v }); }, (v) => 'Lv ' + v);
    defStep('addLv', seq(1, 10, 1, 0), () => L.addLv, (v) => { L.addLv = v; L.gal = null; }, (v) => 'Lv ' + v);
    B.people = '<div data-o="people"></div><div data-o="person"></div><div data-o="peopleBtns"></div>' +
      head('Generator gallery') + '<div class="bhl-in"><input type="number" inputmode="numeric" min="0" max="4294967295" step="1" data-in="gal" aria-label="Gallery seed">' +
      b('galStep', '‹', { x: -1, aria: 'Previous seed' }) + b('galStep', '›', { x: 1, aria: 'Next seed' }) + b('galRandom', 'REROLL') + '</div>' +
      '<div data-o="gallery"></div><div data-o="galPick"></div>' +
      head('Starters') + note('', 'starters') + '<div class="bhl-btns">' + b('reroll', 'REROLL THE STARTERS', { cls: 'bad', arm: 'TAP AGAIN: A NEW CITY' }) + '</div>' +
      note('A new save seed, so a new city with two new starters; the Lab settings stay. The meet cards follow.');
    // ----- State (9)
    B.state = note('', 'saveInfo') + '<div class="bhl-btns">' + b('export', 'EXPORT') + b('download', 'DOWNLOAD') + b('file', 'OPEN A FILE') + b('checkSave', 'CHECK') + b('importSave', 'IMPORT', { cls: 'pri', arm: 'TAP AGAIN TO IMPORT' }) + '</div>' +
      '<textarea data-in="save" spellcheck="false" autocomplete="off" aria-label="Save JSON" placeholder="EXPORT fills this box. Paste a save here to CHECK and IMPORT it."></textarea>' +
      '<div data-o="saveMsg"></div>' +
      head('Start again') + '<div class="bhl-btns">' + b('replay', 'REPLAY THE ONBOARDING') + '<span data-o="demoBtn"></span>' + b('reset', 'RESET THE CITY', { cls: 'bad', arm: 'TAP AGAIN: ALL IS LOST' }) + '</div>';
    // ----- Telemetry (9, and 13.1 P1 (b))
    B.tele = head('Section-10 targets') + defSeg('persona', [['auto', 'AUTO'], ['active', 'ACTIVE'], ['idle', 'IDLE'], ['spender', 'SPENDER'], ['reckless', 'RECKLESS']], () => L.persona, (v) => { L.persona = v; }, 'Persona') +
      note('', 'persona') + '<div data-o="targets"></div>' + head('Calibration (P10)') + '<div data-o="calib"></div>' + head('Counters') + '<div data-o="tele"></div>' +
      head('Time to each Tower level') + '<div data-o="towers"></div>' + '<div class="bhl-btns">' + b('copyKpis', 'COPY THE KPIS') + '</div>';
    let h = '<div class="bhl-hd">' + ic('flask') + '<div class="bhl-ti">The Lab<small data-o="clock"></small></div><button type="button" class="bhl-x" data-a="close" aria-label="Close the Lab">' + ic('close') + '</button></div><div class="bhl-bd">';
    for (const [id, title] of GROUPS) h += group(id, title, B[id]);
    if (!S) h += note('No city yet.');
    return h + '</div>';
  }
  function towerLv() { const s = S_(); const t = s ? s.buildings.find((x) => x.type === 'tower') : null; return t ? t.lv : 1; }
  function mulSet(key, v) {
    const r = dev('mul', { key, value: v });
    if (key === 'cost' && r && r.ok && r.data && r.data.dataRule && r.data.dataRule.length) toast('Data rule: ' + r.data.dataRule.length + ' prices above 80 % of the cap at ×' + v);
    return r;
  }
  function seedIn() {
    const el = rootEl && rootEl.querySelector('[data-in="seed"]'), v = el ? Math.floor(+el.value) : NaN;
    return isFinite(v) && v >= 0 ? v >>> 0 : (L.seed != null ? L.seed : 1);
  }

  // ---------------------------------------------------------------------------------------------- live outputs
  OUT.clock = () => { const s = S_(); if (!s) return ''; return esc(dayClock(s.cityMs) + ' · ' + scaleText(s.lab.timeScale) + ' · Night ' + s.night + (A.isDemo && A.isDemo() ? ' · demo city' : '') + ' · dev only'); };
  OUT['sum:time'] = () => { const s = S_(); return s ? esc(scaleText(s.lab.timeScale) + ' · ' + dayClock(s.cityMs)) : ''; };
  OUT.scaleSub = () => { const s = S_(), x = s.lab.timeScale; return x === 0 ? 'The city clock is stopped. Runs still resolve.' : 'The city clock runs at ' + x + '× real time while the page is open'; };
  OUT.warpSub = () => esc(S_().lab.runWarp ? 'A simulated run moves the clock at most ' + S_().lab.runWarp + '× the real time since the last GO (default 6)' : 'Off: a simulated run moves the clock by its full length');
  OUT.timeInfo = () => {
    const s = S_(), lb = s.lab;
    let h = 'City clock <b>' + esc(dur(s.cityMs)) + '</b> (' + esc(dayClock(s.cityMs)) + '). ';
    if (!lb.runsAdvanceClock) h += 'Simulated runs leave the clock alone (dev).';
    else if (s.pending && s.pending.source === 'sim') h += s.pending.warpS == null ? 'Tonight’s run moves the clock by its full length.' : 'Tonight’s run may move the clock up to <b>' + esc(F.dur(s.pending.warpS)) + '</b>.';
    else if (s.lastSimGoRealMs == null) h += 'No simulated GO yet: the next one moves the clock by the run’s full length.';
    else if (!lb.runWarp) h += 'No cap: a simulated run moves the clock by its full length.';
    else { const gap = Math.max(0, s.realLast - s.lastSimGoRealMs) / 1000; h += 'Last simulated GO ' + esc(F.dur(gap)) + ' ago: a GO now may move the clock up to <b>' + esc(F.dur(lb.runWarp * gap)) + '</b> (' + lb.runWarp + ' × ' + esc(F.dur(gap)) + ').'; }
    return h + ' Results from the game or pasted here move nothing.';
  };
  OUT['sum:grants'] = () => { const s = S_(); return s ? 'Tower ' + towerLv() + ' · ' + F.compact(s.res.bricks, true) + ' bricks · ' + F.compact(s.res.cans, true) + ' cans · ' + F.compact(s.res.sparks, true) + ' ✦' : ''; };
  OUT.grantInfo = () => {
    const s = S_(), c = E.caps(s), v = V_();
    let wb = 0, wc = 0; for (const x of v.buildings) if (x.bubble) { if (x.bubble.res === 'bricks') wb += x.bubble.whole || 0; else wc += x.bubble.whole || 0; }
    return 'Bricks <b>' + F.num(s.res.bricks) + '</b> / ' + F.num(c.bricks) + ' · cans <b>' + F.num(s.res.cans) + '</b> / ' + F.num(c.cans) + ' · ✦ <b>' + F.num(s.res.sparks) + '</b> · in bubbles ' + F.num(wb) + ' bricks, ' + F.num(wc) + ' cans · rubble left ' + s.rubble.length + ' · jobs ' + s.jobs.length;
  };
  OUT['sum:runs'] = () => { const s = S_(); if (!s) return ''; const lb = s.lab; return (lb.force === 'auto' ? 'auto' : 'force ' + lb.force.toUpperCase()) + ' · ' + lb.runScreenS + ' s' + (lb.lockSeed != null ? ' · seed locked' : '') + (lb.waitReal ? ' · waits for the game' : '') + (s.pending ? ' · a run is out' : ''); };
  OUT.seedSub = () => { const s = S_(), last = s.lastRun && s.lastRun.result ? s.lastRun.result.seed : null; return esc(s.lab.lockSeed != null ? 'Every run uses seed ' + s.lab.lockSeed + ' (and the same night)' : 'Off: each GO draws a seed from the city RNG' + (last != null ? ' · the last run’s seed was ' + last : '')); };
  OUT.pending = () => {
    const s = S_(), v = V_(), pe = v.pending;
    let h = '';
    if (pe) {
      h += '<p class="bhl-msg info"><b>' + esc(pe.title) + ' · ' + esc(pe.first) + '</b> is out (' + esc(pe.runId) + ', ' + (pe.sim ? 'simulated' : 'waiting for a result from the game') + (pe.force && pe.force !== 'auto' ? ', forced ' + esc(pe.force) : '') + ', seed ' + esc(s.pending.seed) + ').</p>';
      h += '<div class="bhl-btns">' + b('copy', 'COPY THE HANDOFF', { x: 'handoff' }) + '</div>';
    } else h += '<p class="bhl-msg info">No run is out.' + (s.lab.waitReal ? ' The next GO will wait for a result pasted below.' : '') + '</p>';
    if (s.lastRun && s.lastRun.result) {
      const w = s.lastRun.reward || {};
      h += '<p class="bhl-n">Last run: ' + esc((w.lines && w.lines.sub) || s.lastRun.result.runId) + ' · ' + esc(w.outcome || s.lastRun.result.result) + (s.lastRun.notes && s.lastRun.notes.length ? ' · ' + s.lastRun.notes.length + ' validation notes' : '') + '</p>' +
        '<div class="bhl-btns">' + b('copy', 'COPY ITS HANDOFF', { x: 'lastHandoff' }) + b('copy', 'COPY ITS RESULT', { x: 'lastResult' }) + '</div>';
    }
    return h;
  };
  function msgHtml(m) {
    if (!m) return '';
    return '<div class="bhl-msg ' + (m.kind || 'info') + '">' + esc(m.text) + (m.list && m.list.length ? '<ul>' + m.list.slice(0, 12).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>';
  }
  OUT.pasteMsg = () => msgHtml(L.paste);
  OUT.odds = () => {
    const s = S_(); let rows;
    try { rows = E.oddsTable(s, { cachedOnly: true }); } catch (e) { return note('The odds table is not available: ' + esc(e.message)); }
    if (!rows.length) return note('Nobody can go right now.');
    const done = rows.filter((r) => r.computed).length;
    if (done < rows.length) kickOdds();
    let h = note((done < rows.length ? 'Computing ' + done + ' of ' + rows.length + '… ' : rows.length + ' pairs, 400 seeded runs each. ') + 'Kit packed automatically (M medkit, P pills, B noise bomb). Refs: damage P10 / kills P90 / shoves P90. Falls: % in the streets / hordes / at the gate.') +
      '<div class="bhl-tw"><table class="odds"><thead><tr><th>Runner</th><th class="n">Home</th><th class="n">Death</th><th class="n">Resc.</th><th class="n">Refs</th><th class="n">Falls</th></tr></thead><tbody>';
    let cur = null;
    for (const r of rows) {
      if (r.destId !== cur) { cur = r.destId; const d = destOf(cur); h += '<tr class="sub" data-k="' + cur + '"><td colspan="6">' + esc(d.id + ' ' + d.name + ' · threat ' + d.threat) + '</td></tr>'; }
      const kit = r.kit ? ['medkit', 'pills', 'bomb'].filter((k) => r.kit[k]).map((k) => ({ medkit: 'M', pills: 'P', bomb: 'B' })[k]).join('') : '';
      h += '<tr data-k="' + r.destId + r.personId + '"><td><b>' + esc(r.first) + '</b><span class="mu">L' + r.lv + (r.state && r.state !== 'ready' ? ' · ' + esc(r.state) : '') + (kit ? ' · ' + kit : '') + '</span></td>';
      if (!r.computed) { h += '<td class="n mu">…</td><td class="n mu">…</td><td class="n mu">…</td><td class="n mu">…</td><td class="n mu">…</td></tr>'; continue; }
      const fl = r.falls || {}, nf = (fl.streets || 0) + (fl.hordes || 0) + (fl.gate || 0);
      h += '<td class="n">' + F.pct(r.home) + '</td><td class="n' + (r.death > 0.05 ? ' red' : '') + '">' + F.pct(r.death, 'death') + '</td><td class="n">' + F.pct(r.rescue) + '</td>' +
        '<td class="n">' + (r.refs ? r.refs.dmgP10 + '/' + r.refs.killsP90 + '/' + r.refs.shovesP90 : '–') + '</td>' +
        '<td class="n">' + (nf ? [fl.streets, fl.hordes, fl.gate].map((x) => Math.round(100 * (x || 0) / nf)).join('/') : 'none') + '</td></tr>';
    }
    return h + '</tbody></table></div>';
  };
  function defaultsChanged() {
    const s = S_(); if (!s) return 0;
    const lb = s.lab, d = D.LAB_DEFAULT; let n = 0;
    for (const k of Object.keys(d.mul)) if (!near(lb.mul[k], d.mul[k])) n++;
    d.rescueBase.forEach((x, i) => { if (!near(lb.rescueBase[i], x)) n++; });
    for (const k of ['clinicRescue', 'tiredFloor', 'escalationCap', 'downWindowMs', 'freeSec', 'skipExp', 'skipK']) if (!near(lb[k], d[k])) n++;
    if (lb.reducedMotion !== d.reducedMotion) n++;
    return n;
  }
  OUT['sum:tuning'] = () => { const n = defaultsChanged(); return n ? n + ' changed' : 'defaults'; };
  OUT['mul:cost'] = () => {
    const s = S_(), bad = D.assertData(s.lab.mul.cost), c = E.caps(s), lv = towerLv();
    return esc('Caps scale with it: ' + F.num(c.bricks) + ' / ' + F.num(c.cans) + ' now' + (lv < 10 ? ' · Bell Tower ' + (lv + 1) + ' costs ' + F.num(E.cost(s, 'tower', lv + 1).n) + ' bricks' : '') + ' · data rule ') +
      (bad.length ? '<span class="red">' + bad.length + ' over 80 % of the cap</span>' : '<span class="ok">0 violations</span>');
  };
  OUT['mul:time'] = () => { const s = S_(), lv = Math.min(10, towerLv() + 1); return esc('Jobs and expansions · Bell Tower ' + lv + ' takes ' + dur(E.jobMs(s, 'tower', lv))); };
  OUT['mul:prod'] = () => { const r = E.rates(S_()); return esc('Kilns and Canneries · now ' + F.num(Math.round(r.bricks)) + ' bricks/h and ' + F.num(Math.round(r.cans)) + ' cans/h'); };
  OUT['mul:loot'] = () => { const m = S_().lab.mul.loot, d = destOf('D3'); return esc('Run bricks and cans · a Night Market win ≈ ' + F.num(Math.round(d.bricks * m)) + ' bricks, ' + F.num(Math.round(d.cans * m)) + ' cans'); };
  OUT['mul:xp'] = () => { const m = S_().lab.mul.xp, d = destOf('D3'); return esc('From runs and the Lab · a Night Market win ≈ ' + Math.round(d.xp * m) + ' XP'); };
  OUT['mul:death'] = () => esc('Multiplies 1 − rescue: Death = (1 − Home) × (1 − rescue) × ' + S_().lab.mul.death);
  OUT['mul:revive'] = () => {
    const s = S_(), p = s.people.filter((x) => x.state !== 'fallen').sort((x, y) => y.lv - x.lv)[0], pr = p ? E.price.revive(s, p.id) : null;
    return esc(pr ? 'Cans and sparks · reviving ' + p.first + ' (L' + p.lv + ') now: ' + F.num(pr.cans) + ' cans or ' + pr.sparks + ' ✦' : 'Cans and sparks');
  };
  OUT['mul:rest'] = () => { const m = S_().lab.mul.rest, d = destOf('D3'); return esc('Every rest after a run · a Night Market rest base ' + F.dur(d.rest * m)); };
  OUT['mul:inn'] = () => { const s = S_(), m = s.lab.mul.inn, inn = D.BUILDINGS.inn.refresh; return esc('Time between travelers · ' + [1, 2, 3].map((l) => F.dur(inn[l] * m)).join(' / ') + ' at Inn 1 / 2 / 3'); };
  OUT.clinicSub = () => { const s = S_(), i = D.DEST_IDS.indexOf('D3'); return esc('Night Market with Clinic 2: ' + Math.round((s.lab.rescueBase[i] + 2 * s.lab.clinicRescue) * 100) + ' % before traits'); };
  OUT.tiredSub = () => esc('A runner just back starts at ' + Math.round(S_().lab.tiredFloor * 100) + ' % HP and regains it over the rest');
  OUT.escSub = () => { const n = S_().lab.escalationCap; return esc('Revive prices double per earlier revive, at most ×' + Math.pow(2, n)); };
  OUT.downSub = () => esc('Time to decide before a Down person is buried: ' + dur(S_().lab.downWindowMs));
  OUT.freeSub = () => esc('Timers of ' + S_().lab.freeSec + ' s or less finish free');
  OUT.skipInfo = () => { const s = S_(); return 'Prices now: ' + SKIP_AT.map(([sec, t]) => esc(t) + ' <b>' + E.price.skip(sec, s) + ' ✦</b>').join(' · ') + ' (default 2 · 7 · 23 · 103 · 338).'; };
  OUT.rmSub = () => esc('Now ' + (A.reducedMotion.effective() ? 'on' : 'off') + (A.reducedMotion.get() == null ? ', following the system setting' : ', set here'));
  OUT['sum:sound'] = () => (A.sound && A.sound.get() ? 'on' : 'off');
  OUT.sfx = () => {
    if (!BH.Sfx) return 'sfx.js is not loaded.';
    const st = BH.Sfx.state ? BH.Sfx.state() : {};
    if (!st.created) return 'No audio yet: it starts on the first tap anywhere.';
    return 'Audio ' + esc(st.ctx) + (st.muted ? ' · muted' : '') + ' · ' + (st.voices || 0) + ' sounding · ' + (st.played || 0) + ' cues played' + (st.loops && st.loops.length ? ' · loops: ' + esc(st.loops.join(', ')) : '') + (st.error ? ' · <span class="red">' + esc(st.error) + '</span>' : '');
  };
  OUT['sum:people'] = () => { const v = V_(); if (!v) return ''; const down = v.people.filter((p) => p.state === 'down').length; return v.people.length + ' living' + (down ? ' · ' + down + ' Down' : '') + (v.remembered.length ? ' · ' + v.remembered.length + ' remembered' : ''); };
  OUT.people = () => {
    const v = V_();
    if (!v.people.length) return note('Nobody lives here right now.');
    if (!L.sel || !v.people.some((p) => p.id === L.sel)) L.sel = v.people[0].id;
    return '<div class="bhl-ppl">' + v.people.map((p) => '<button type="button" class="bhl-p" data-k="' + p.id + '" data-a="pick" data-x="' + p.id + '" aria-pressed="' + (p.id === L.sel) + '">' + face(p.look, 38, p.state === 'down') +
      '<span class="t"><b>' + esc(p.first + ' ' + p.last) + '</b><span' + (p.state === 'down' ? ' class="red"' : '') + '>' + esc('Lv ' + p.lv + ' · ' + p.roleName + ' · ' + p.pill) + '</span></span></button>').join('') + '</div>';
  };
  OUT.person = () => {
    const s = S_(), p = s.people.find((x) => x.id === L.sel), pv = V_().people.find((x) => x.id === L.sel);
    if (!p || !pv) return '';
    let h = row(pv.fullName, pv.traitName + ' · ' + F.num(p.xp) + ' / ' + F.num(pv.xpTo) + ' XP · ' + p.runs + ' runs · ' + pv.pill) + '<div class="bhl-btns">';
    if (p.state === 'down') h += b('decide', 'DECIDE · THE OFFER', { cls: 'pri' });
    else h += b('kill', 'KILL · DOWN NOW', { cls: 'bad', why: p.state === 'out' ? p.first + ' is out on a run' : null });
    h += b('xp', '+50 XP', { x: 50 }) + b('xp', '+250 XP', { x: 250 }) + b('xp', '+1,000 XP', { x: 1000 }) + '</div>';
    return h + row('Level', 'Sets the XP to the start of the level', stepM('plv', 'the level of ' + p.first, false));
  };
  OUT.peopleBtns = () => { const n = S_().people.filter((p) => p.state === 'down').length; return '<div class="bhl-btns">' + b('reviveAll', n ? 'REVIVE ALL · ' + n + ' DOWN' : 'REVIVE ALL', { cls: 'good', why: n ? null : 'Nobody is Down' }) + '</div>'; };
  function gallery() {
    if (!L.gal || L.gal.seed !== L.galSeed) L.gal = { seed: L.galSeed, list: E.gallery(L.galSeed, 12), pick: null };
    return L.gal;
  }
  OUT.gallery = () => {
    const g = gallery();
    return '<div class="bhl-gal">' + g.list.map((p, i) => '<button type="button" data-k="g' + L.galSeed + '-' + i + '" data-a="galPick" data-x="' + i + '" aria-pressed="' + (i === L.galPick) + '" aria-label="' + esc(p.name + ', ' + nameOfRole(p.role) + ', ' + nameOfTrait(p.trait)) + '">' +
      face(p.look, 48) + '<b>' + esc(p.first) + '</b><span>' + esc(nameOfRole(p.role)) + '</span><span>' + esc(nameOfTrait(p.trait)) + '</span></button>').join('') + '</div>';
  };
  OUT.galPick = () => {
    if (L.galPick == null) return note('Tap a face to see who would arrive, then add that person to the city (beds are ignored).');
    const s = S_(), g = gallery(), key = L.galSeed + '|' + L.galPick + '|' + L.addLv + '|' + s.people.length + '|' + s.inn.travelers.length;
    if (!g.pick || g.pick.key !== key) {          // a dry run on a copy: exactly who addPerson would bring (a first name in use is re-drawn)
      let p = null;
      try { const t = JSON.parse(E.serialize(s)), r = E.act(t, { type: 'dev', op: 'addPerson', seed: L.galSeed, index: L.galPick, lv: L.addLv }, s.realLast); p = r.ok ? t.people.find((x) => x.id === r.data.personId) : null; } catch (e) { p = null; }
      g.pick = { key, p };
    }
    const p = g.pick.p; if (!p) return '';
    return '<div class="bhl-card">' + face(p.look, 64) + '<div class="t"><b>' + esc(p.first + ' ' + p.last + ', ' + p.age) + '</b><span>' + esc(nameOfRole(p.role) + ' · ' + nameOfTrait(p.trait) + ' · used to be ' + (/^[aeiou]/i.test(p.trade) ? 'an ' : 'a ') + p.trade) + '</span></div></div>' +
      row('Arrives at', 'Seed ' + L.galSeed + ', face ' + (L.galPick + 1), stepM('addLv', 'the arrival level', false)) + '<div class="bhl-btns">' + b('add', 'ADD ' + p.first.toUpperCase() + ' TO THE CITY', { cls: 'pri' }) + '</div>';
  };
  OUT.starters = () => { const s = S_(), st = s.people.filter((p) => p.arrivedHow === 'starter'); return 'Save seed <b>' + s.saveSeed + '</b>' + (st.length ? ': ' + st.map((p) => '<b>' + esc(p.first + ' ' + p.last) + '</b> (' + esc(nameOfRole(p.role) + ' · ' + nameOfTrait(p.trait)) + ')').join(' and ') : '') + '.'; };
  OUT['sum:state'] = () => (A.isDemo && A.isDemo() ? 'demo city · never saved' : kb(A.exportSave().length));
  OUT.saveInfo = () => {
    const s = S_(), size = A.exportSave().length;
    return (A.isDemo && A.isDemo() ? '<b>Demo city (#demo): never saved.</b> Lab changes here are lost on reload. ' : 'Saved on this device as <b>bellhaven.v1</b> (when the browser allows storage). ') + kb(size) + ' · save seed ' + s.saveSeed + ' · ' + esc(dayClock(s.cityMs)) + ' · Night ' + s.night + '.';
  };
  OUT.saveMsg = () => msgHtml(L.saveMsg);
  OUT.demoBtn = () => (A.isDemo && A.isDemo() ? b('demo', 'LEAVE THE DEMO') : b('demo', 'OPEN #DEMO'));
  // ----- the section-10 targets for this save's persona-like play (13.1 P1 (b)). Spec reading: section 10 describes
  // four personas over 20 seeds; one save is matched to the persona it plays like (or the one picked by hand)
  function guess(k) {
    if (k.packs > 0 && k.sparksSpent > k.sparksEarned) return { p: 'spender', why: k.packs + ' free test pack' + (k.packs > 1 ? 's' : '') + ' claimed and ' + F.num(k.sparksSpent) + ' ✦ spent (' + F.num(k.sparksEarned) + ' earned)' };
    if (k.runs >= 10 && k.expectedDowns / k.runs >= 0.07) return { p: 'reckless', why: 'the shown Death averages ' + pct1(k.expectedDowns / k.runs) + ' a run' };
    if (k.days >= 0.5 && k.runsPerDay < 12) return { p: 'idle', why: dec1(k.runsPerDay) + ' runs a day' };
    return { p: 'active', why: k.days >= 0.5 ? dec1(k.runsPerDay) + ' runs a day' : 'the default before half a day of play' };
  }
  function persona(k) { const g = guess(k); return L.persona === 'auto' ? g : { p: L.persona, why: 'set by hand (the guess: ' + g.p + ')' }; }
  function targets(s, k) {
    const per = persona(k).p, R = REF[per], t = s.cityMs, days = t / DAY, rows = [];
    const add = (id, label, value, ref, ok) => rows.push({ id: id || '', label, value, ref, ok });
    const band = (r, f) => f(r[0]) + (r[1] !== r[2] ? ' (' + f(r[1]) + '-' + f(r[2]) + ')' : '');
    const lvAt = (ms) => { let lv = 1; for (let i = 2; i <= 10; i++) if (k.towerAtMs[i] != null && k.towerAtMs[i] <= ms) lv = i; return lv; };
    for (const [key, ms, name] of [['q', 15 * MIN, '15 min'], ['h', HOUR, '1 h'], ['d', DAY, '1 day']]) {
      const r = R.tw[key], v = t >= ms ? lvAt(ms) : null;
      add('', 'Tower at ' + name, v == null ? 'at ' + name : 'Tower ' + v, band(r, String), v == null ? null : v >= r[1] && v <= r[2]);
    }
    if (R.t10) {
      const at = k.towerAtMs[10], d10 = at != null ? at / DAY : null;
      add(R.t10[2], 'Tower 10', d10 != null ? 'day ' + dec1(d10) : days > R.t10[1] ? 'not by day ' + dec1(days) : 'day ' + dec1(days) + ' so far', 'day ' + R.t10[0].toFixed(1) + '-' + R.t10[1].toFixed(1),
        d10 != null ? d10 >= R.t10[0] && d10 <= R.t10[1] : days > R.t10[1] ? false : null);
    }
    if (R.day7) { const v = t >= 7 * DAY ? lvAt(7 * DAY) : null; add(R.day7[3], 'Tower at day 7', v == null ? 'at day 7' : 'Tower ' + v, band(R.day7, String), v == null ? null : v >= R.day7[1] && v <= R.day7[2]); }
    const wk = (n) => (days > 0 ? n * 7 / days : 0), dayOk = days >= 1, inR = (v, r) => v >= r[1] - 1e-9 && v <= r[2] + 1e-9;
    add('', 'Runs a day', dayOk ? dec1(k.runsPerDay) : 'after 1 day', band(R.runsDay, dec1), dayOk ? inR(k.runsPerDay, R.runsDay) : null);
    add(R.win[3], 'Win rate', k.runs >= 20 ? pct0(k.winRate) : k.runs + ' of 20 runs', band(R.win, pct0), k.runs >= 20 ? inR(k.winRate, R.win) : null);
    add(R.downs[3], 'Downs a week', dayOk ? dec1(wk(k.downs)) : 'after 1 day', band(R.downs, String), dayOk ? inR(wk(k.downs), R.downs) : null);
    add(R.graves[3], 'Graves a week', dayOk ? dec1(wk(k.graves)) : 'after 1 day', band(R.graves, String), dayOk ? inR(wk(k.graves), R.graves) : null);
    if (R.sparks) add(R.sparks[3], 'Sparks a week', dayOk ? F.num(Math.round(wk(k.sparksEarned))) + ' ✦' : 'after 1 day', band(R.sparks, String) + ' ✦', dayOk ? inR(wk(k.sparksEarned), R.sparks) : null);
    add('', 'Run bricks', dayOk ? pct0(k.runShareBricks) : 'after 1 day', band(R.runShare, pct0), dayOk ? inR(k.runShareBricks, R.runShare) : null);
    if (R.idle) add('', 'Crane idle', dayOk ? pct0(k.craneIdle) : 'after 1 day', band(R.idle, pct0), dayOk ? inR(k.craneIdle, R.idle) : null);
    const on = k.onlineMs >= 10 * MIN;
    add('P5', 'Nothing to do', on ? pct1(k.nothingShare) : 'after 10 min online', 'under 5 %', on ? k.nothingShare < 0.05 : null);
    const p10 = (k.targets || []).find((x) => x.id === 'P10');
    add('P10', 'Calibration', p10 && p10.value != null ? p10.value + ' judged' : 'no bucket of 50', '3 SE + 1.5 pts', p10 ? p10.ok : null);
    add('P11', 'Prices over 80 % of cap', String(k.priceViolations), '0', k.priceViolations === 0);
    return { per, rows };
  }
  OUT['sum:tele'] = () => {
    const s = S_(); if (!s) return '';
    const k = kpis(), t = targets(s, k), y = t.rows.filter((r) => r.ok === true).length, n = t.rows.filter((r) => r.ok === false).length;
    return t.per + ' · ✓ ' + y + ' · ✗ ' + n + ' · ' + k.runs + ' runs';
  };
  OUT.persona = () => { const k = kpis(), g = persona(k); return 'Judged as <b>' + esc(REF[g.p].name) + '</b> (' + esc(g.why) + '). One save is judged against section 10’s 20-seed range where it prints one, else a band around the median; medians over 20 seeds are sim-bot.cjs’s job.'; };
  OUT.targets = () => {
    const t = targets(S_(), kpis());
    return '<div class="bhl-tw"><table><thead><tr><th>#</th><th>Target</th><th class="n">This save</th><th class="n">Section 10</th><th class="n">✓</th></tr></thead><tbody>' +
      t.rows.map((r) => '<tr><td class="mu">' + esc(r.id) + '</td><td>' + esc(r.label) + '</td><td class="n">' + esc(r.value) + '</td><td class="n mu">' + esc(r.ref) + '</td><td class="n">' + ck(r.ok) + '</td></tr>').join('') + '</tbody></table></div>';
  };
  OUT.calib = () => {
    const k = kpis(), rows = k.calibration.filter((x) => x.runs > 0);
    if (!rows.length) return note('No natural simulated runs yet (forced wins and Lab-forced outcomes are left out).');
    return '<div class="bhl-tw"><table class="odds"><thead><tr><th>Shown</th><th class="n">Runs</th><th class="n">Mean</th><th class="n">Actual</th><th class="n">±</th><th class="n">✓</th></tr></thead><tbody>' +
      rows.map((x) => {
        const se = Math.sqrt(Math.max(0, x.shown * (1 - x.shown)) / x.runs), tol = 3 * se + 0.015, judged = x.runs >= 50;
        return '<tr><td>' + x.bucket + '-' + (x.bucket + 10) + '</td><td class="n">' + x.runs + '</td><td class="n">' + pct1(x.shown) + '</td><td class="n">' + pct1(x.actual) + '</td><td class="n mu">' + pct1(tol) + '</td><td class="n">' +
          (judged ? ck(Math.abs(x.actual - x.shown) <= tol) : '<span class="mu">n&lt;50</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + note('Shown Home % in 10-point buckets (natural simulated runs). In every bucket with 50 runs or more, |actual − mean shown| must stay within ± = 3 SE + 1.5 points (SE = √(p(1 − p)/n)).');
  };
  OUT.tele = () => {
    const k = kpis(), s = S_(), list = (o, names) => { const ks = Object.keys(o || {}).filter((x) => o[x]); return ks.length ? ks.map((x) => esc(names ? names[x] || x : x) + ' ' + F.num(o[x])).join(' · ') : 'none'; };
    const destList = (o) => { const ks = Object.keys(o || {}).filter((x) => o[x]); return ks.length ? ks.map((x) => esc((destOf(x) || { name: x }).name) + ' ' + o[x]).join(' · ') : 'none'; };
    const lvList = (o) => { const ks = Object.keys(o || {}).filter((x) => o[x]).sort((a, c) => a - c); return ks.length ? ks.map((x) => 'L' + x + ' ' + o[x]).join(' · ') : 'none'; };
    const when = (ms) => (ms == null ? 'not yet' : dur(ms));
    const pf = A.perf ? A.perf() : null;
    const rows = [
      ['Runs', k.runs + ' · ' + k.wins + ' won · ' + k.losses + ' lost' + (k.runs ? ' (' + pct0(k.winRate) + ')' : '')],
      ['Runs per hour · per day', dec1(k.runsPerHour) + ' · ' + dec1(k.runsPerDay)],
      ['Downs · stretcher rescues', k.downs + ' · ' + k.rescues + ' (expected Downs from the shown odds ' + dec1(k.expectedDowns) + ')'],
      ['Revives with cans · with sparks', k.revivesCans + ' · ' + k.revivesSparks + ' (the stranger: ' + esc(k.strangerRevive) + ')'],
      ['Goodbyes · expired windows · graves', k.goodbyes + ' · ' + k.expired + ' · ' + k.graves],
      ['Drifters · invites · nicknames', k.drifters + ' · ' + k.invites + ' · ' + k.nicknames],
      ['Downs by place', destList(k.downsByDest)], ['Downs by level', lvList(k.downsByLv)],
      ['First own Down · first grave', when(k.firstDownMs) + ' · ' + when(k.firstGraveMs) + (k.strangerAtMs != null ? ' (the stranger at ' + dur(k.strangerAtMs) + ')' : '')],
      ['Sparks earned by source', F.num(k.sparksEarned) + ' ✦: ' + list(k.sparksIn, SRC)], ['Sparks spent by sink', F.num(k.sparksSpent) + ' ✦: ' + list(k.sparksOut, SINK)],
      ['Dev sparks (Lab, packs)', F.num(k.devSparks) + ' ✦ · ' + k.packs + ' packs'],
      ['Crane idle', pct0(k.craneIdle) + ' (online ' + pct0(k.craneIdleOnline) + ' · offline ' + pct0(k.craneIdleOffline) + ' · nothing allowed ' + pct0(k.craneIdleGated) + ')'],
      ['Depot overflow', F.num(k.overflowBricks) + ' bricks · ' + F.num(k.overflowCans) + ' cans'],
      ['Nothing-to-do time', pct1(k.nothingShare) + ' of ' + dur(k.onlineMs) + ' online'],
      ['Bricks from runs', pct0(k.runShareBricks)],
      ['Jobs · level-ups · kit spent', k.jobsDone + ' / ' + k.jobsStarted + ' jobs · ' + k.levelUps + ' level-ups · ' + F.num(k.kitSpent) + ' cans of kit'],
      ['City clock', dur(s.cityMs) + ' (' + dayClock(s.cityMs) + ')'],
      ['Frame cost (script)', pf && pf.frames ? pf.avg.toFixed(2) + ' ms avg · p95 ' + pf.p95.toFixed(2) + ' · max ' + pf.max.toFixed(1) + ' (last 120 frames)' : 'not measured'],
      ['Odds cache', (E.oddsCacheSize ? E.oddsCacheSize() : '–') + ' entries'],
    ];
    return '<div class="bhl-tw"><table><tbody>' + rows.map((r) => '<tr><td class="mu">' + esc(r[0]) + '</td><td>' + r[1] + '</td></tr>').join('') + '</tbody></table></div>';
  };
  OUT.towers = () => {
    const k = kpis(), per = persona(k).p, R = REF[per].towers;
    let h = '<div class="bhl-tw"><table><thead><tr><th>Tower</th><th class="n">Reached at</th><th class="n">Median, ' + esc(per) + '</th><th class="n">This ÷ median</th></tr></thead><tbody>';
    for (let lv = 2; lv <= 10; lv++) {
      const at = k.towerAtMs[lv], ref = R[lv];
      h += '<tr><td>' + lv + '</td><td class="n">' + (at != null ? esc(dur(at)) : '<span class="mu">–</span>') + '</td><td class="n mu">' + (ref ? esc(dur(ref)) : '–') + '</td><td class="n">' + (at != null && ref ? (at / ref).toFixed(2) + '×' : '') + '</td></tr>';
    }
    return h + '</tbody></table></div>';
  };

  // ---------------------------------------------------------------------------------------------- actions
  function copy(text, what) {
    const done = (ok) => toast(ok ? what + ' copied' : 'Copying is blocked here: select the text instead');
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); done(ok);
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => done(true), fallback); return; } } catch (e) { /* the fallback below */ }
    fallback();
  }
  function box(name) { return rootEl ? rootEl.querySelector('[data-in="' + name + '"]') : null; }
  function parseJson(text) { try { return { ok: true, v: JSON.parse(text) }; } catch (e) { return { ok: false, err: String((e && e.message) || e) }; } }
  function openOffer(id) {
    const fn = typeof A.openOffer === 'function' ? A.openOffer : BH.UI && BH.UI.hooks && typeof BH.UI.hooks.openOffer === 'function' ? BH.UI.hooks.openOffer : null;
    if (fn) fn(id); else toast('Down now. Decide from the roster.');
  }
  function arm(name) {                                        // the first tap arms, a second within 3 s confirms
    if (L.armed[name]) { clearTimeout(L.armed[name]); delete L.armed[name]; syncArm(); return true; }
    L.armed[name] = setTimeout(() => { delete L.armed[name]; syncArm(); }, 3000);
    syncArm();
    return false;
  }
  ACTS.close = () => { if (A && A.close) A.close(); else close(); };
  ACTS.skip = (x) => { const ms = +x, r = A.skipAhead(ms); if (r && r.ok && !(r.data && r.data.welcome)) toast('+' + dur(ms) + ': nothing new'); };
  ACTS.grant = (x) => {
    if (x === 'sparks') { if (dev('grant', { what: 'sparks' }).ok) toast('+100 ✦ (dev)'); return; }
    const r = dev('grant', { what: x }), n = r && r.data ? r.data.n : 0;
    toast(n >= 1000 ? '+1,000 ' + x + ' (dev)' : n > 0 ? '+' + F.num(n) + ' ' + x + ': the cap is reached' : 'The ' + x + ' cap is full');
  };
  ACTS.fill = () => dev('fillBubbles');
  ACTS.finishAll = () => dev('finishAll');
  ACTS.rubble = () => { const n = S_().rubble.length; if (dev('clearRubble').ok) toast(n ? n + ' rubble cleared (no sparks)' : 'No rubble left'); };
  ACTS.pack = (x) => { A.act({ type: 'claimPack', size: +x }); };    // Spec reading: "open the free test packs" = claim them (free, dev-tagged)
  ACTS.copy = (x) => {
    const s = S_();
    if (x === 'handoff' && s.pending) copy(JSON.stringify(s.pending.handoff, null, 1), 'The handoff');
    else if (x === 'lastHandoff' && s.lastRun) copy(JSON.stringify(s.lastRun.handoff, null, 1), 'The handoff');
    else if (x === 'lastResult' && s.lastRun) copy(JSON.stringify(s.lastRun.result, null, 1), 'The result');
  };
  ACTS.fillSim = () => {
    const s = S_();
    if (!s.pending) { L.paste = { kind: 'bad', text: 'No run is out. Turn on “Wait for a real result” and GO: the run then waits for a result here.' }; return; }
    const res = E.runSim(s), el = box('paste');
    if (el && res) { el.value = JSON.stringify(res, null, 1); L.pasteText = el.value; }
    L.paste = { kind: 'info', text: 'Filled with what the simulation returns for ' + s.pending.runId + ' (Lab force included). Edit it, then VALIDATE or APPLY.' };
  };
  function readPaste() {
    const el = box('paste'), text = el ? el.value.trim() : '';
    if (!text) { L.paste = { kind: 'bad', text: 'Paste a result JSON first.' }; return null; }
    const p = parseJson(text);
    if (!p.ok) { L.paste = { kind: 'bad', text: 'Not JSON: ' + p.err }; return null; }
    return p.v;
  }
  ACTS.check = () => {
    const obj = readPaste(); if (!obj) return;
    const s = S_(), v = E.validateResult(obj && typeof obj === 'object' ? Object.assign({}, obj, { source: 'paste' }) : obj, s.pending, s);
    L.paste = v.ok ? { kind: 'ok', text: 'Valid for ' + v.res.runId + ': ' + (v.res.result === 'safe_room' ? 'a safe return' : 'overrun' + (v.res.fellAt ? ' (' + v.res.fellAt + ')' : '')) + (v.notes.length ? '. Fixes and notes:' : '. No notes.'), list: v.notes }
      : { kind: 'bad', text: 'Rejected: ' + v.errors.join(' · '), list: v.notes };
  };
  ACTS.apply = () => {
    const obj = readPaste(); if (!obj) return;
    const r = A.resolveResult(obj) || { ok: false };
    if (r.ok) {
      const d = r.data || {}, w = d.reward || {};
      L.paste = { kind: 'ok', text: 'Applied ' + ((d.result && d.result.runId) || '') + ': ' + (d.outcome || '') + ' · +' + F.num(w.bricks || 0) + ' bricks, +' + F.num(w.cans || 0) + ' cans, +' + (w.xp || 0) + ' XP. The clock did not move (a pasted result).', list: d.notes || [] };
      const el = box('paste'); if (el) el.value = ''; L.pasteText = '';
    } else L.paste = { kind: 'bad', text: 'Rejected: ' + ((r.data && r.data.errors && r.data.errors.join(' · ')) || r.err || 'not applied'), list: (r.data && r.data.notes) || [] };
  };
  ACTS.resetLab = () => { if (!arm('resetLab')) return; if (dev('resetLab').ok) { A.reducedMotion.set(null); toast('The Lab is back to its defaults'); } };
  ACTS.cue = (x) => {
    const c = CUE_TESTS[+x]; if (!c) return;
    if (!soundReady()) return;
    const o = c[2] || {};
    if (o.streak) { for (let i = 0; i < o.streak; i++) setTimeout(() => sfx('collect', { step: i, res: o.res }), i * 150); return; }
    sfx(c[0], o);
  };
  function soundReady() {
    if (!BH.Sfx) { toast('sfx.js is not loaded'); return false; }
    if (A.sound && !A.sound.get()) { toast('Sound is off'); return false; }
    if (BH.Sfx.unlock) BH.Sfx.unlock();                       // inside this tap: a gesture
    return true;
  }
  ACTS.drone = () => { if (!L.drone && !soundReady()) return; L.drone = !L.drone; sfx('drone', { on: L.drone }); };
  ACTS.heart = () => { if (!L.heart && !soundReady()) return; L.heart = !L.heart; sfx('heartbeat', { on: L.heart }); };
  ACTS.pick = (x) => { L.sel = x; };
  ACTS.kill = () => {
    const s = S_(), p = s.people.find((x) => x.id === L.sel); if (!p) return;
    const r = dev('kill', { personId: p.id });
    if (r.ok) openOffer(p.id);
  };
  ACTS.decide = () => { if (L.sel) openOffer(L.sel); };
  ACTS.xp = (x) => { if (L.sel && dev('giveXp', { personId: L.sel, xp: +x }).ok) toast('+' + F.num(+x) + ' XP × ' + S_().lab.mul.xp + ' (dev)'); };
  ACTS.reviveAll = () => { const n = S_().people.filter((p) => p.state === 'down').length; if (dev('reviveAll').ok) toast(n + ' revived (dev, no price)'); };
  ACTS.galStep = (x) => { L.galSeed = Math.max(0, Math.min(4294967295, L.galSeed + (+x))); L.galPick = null; syncInputs(true); };
  ACTS.galRandom = () => { L.galSeed = Math.floor(Math.random() * 1000000); L.galPick = null; syncInputs(true); };
  ACTS.galPick = (x) => { L.galPick = L.galPick === +x ? null : +x; };
  ACTS.add = () => {
    if (L.galPick == null) return;
    const r = dev('addPerson', { seed: L.galSeed, index: L.galPick, lv: L.addLv });
    if (!r.ok) return;
    const p = S_().people.find((x) => x.id === r.data.personId);
    if (p) { L.sel = p.id; toast(p.first + ' ' + p.last + ' arrived from the Lab (Lv ' + p.lv + ')'); }
  };
  // Spec reading: "reroll the starters (a new save seed)": the engine's dev reroll on a copy (the Lab settings kept),
  // loaded with importSave so the UI resets cleanly, then the meet cards for the new pair.
  ACTS.reroll = () => {
    if (!arm('reroll')) return;
    const s = S_(), t = JSON.parse(A.exportSave()), r = E.act(t, { type: 'dev', op: 'reroll' }, s.realLast);
    if (!r.ok) { toast('Not possible right now'); return; }
    const imp = A.importSave(E.serialize(t));
    if (!imp || !imp.ok) { toast('The new city could not be loaded'); return; }
    L.sel = null;
    toast('New starters: ' + t.people.filter((p) => p.arrivedHow === 'starter').map((p) => p.first).join(' and '));
    A.replayOnboarding();
  };
  ACTS.export = () => {
    const raw = A.exportSave(), el = box('save');
    if (el) { el.value = raw; L.saveText = raw; }
    copy(raw, 'The save');
    L.saveMsg = { kind: 'ok', text: 'Exported ' + kb(raw.length) + ' into the box below (and to the clipboard where the browser allows it).' };
  };
  ACTS.download = () => {
    const s = S_(), raw = A.exportSave();
    try {
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), a = document.createElement('a');
      a.href = url; a.download = 'bellhaven-' + s.saveSeed + '-night' + s.night + '.json'; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      L.saveMsg = { kind: 'ok', text: 'Downloaded ' + a.download + ' (' + kb(raw.length) + ').' };
    } catch (e) { L.saveMsg = { kind: 'bad', text: 'This browser blocked the download: use EXPORT and copy the text.' }; }
  };
  ACTS.file = () => {                                         // a detached file input: nothing stays in the panel
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0]; if (!file) return;
      const fr = new FileReader();
      fr.onload = () => { const t = String(fr.result || ''), sv = box('save'); if (sv) sv.value = t; L.saveText = t; L.saveMsg = { kind: 'info', text: 'Loaded ' + file.name + ' (' + kb(t.length) + '). CHECK it, then IMPORT.' }; sync(); };
      fr.onerror = () => { L.saveMsg = { kind: 'bad', text: 'Could not read ' + file.name + '.' }; sync(); };
      fr.readAsText(file);
    });
    inp.click();
  };
  function checkRaw(raw) {
    if (!raw) return { ok: false, msg: { kind: 'bad', text: 'Paste a save into the box first (or OPEN A FILE).' } };
    const r = E.load(raw, S_().realLast);
    if (r.status === 'corrupt-reset') return { ok: false, msg: { kind: 'bad', text: 'Not a readable Bellhaven save.' } };
    if (r.status === 'future-version') return { ok: false, msg: { kind: 'bad', text: 'Saved by a newer version of Bellhaven: it cannot be imported here.' } };
    if (r.status === 'new') return { ok: false, msg: { kind: 'bad', text: 'Paste a save into the box first.' } };
    const t = r.state, tw = t.buildings.find((x) => x.type === 'tower'), lv = t.people.filter((p) => p.state !== 'fallen').length;
    return { ok: true, msg: { kind: 'ok', text: 'Readable (' + r.status + '): Tower ' + (tw ? tw.lv : 1) + ', ' + lv + ' living, ' + dayClock(t.cityMs) + ', Night ' + t.night + ', save seed ' + t.saveSeed + '.' + (r.notes && r.notes.length ? ' Fixes on load:' : ''), list: r.notes || [] } };
  }
  ACTS.checkSave = () => { const el = box('save'); L.saveMsg = checkRaw(el ? el.value.trim() : '').msg; };
  ACTS.importSave = () => {
    const el = box('save'), raw = el ? el.value.trim() : '', c = checkRaw(raw);
    if (!c.ok) { L.saveMsg = c.msg; return; }
    if (!arm('importSave')) { L.saveMsg = { kind: 'info', text: 'This replaces the city on this device. Tap IMPORT again within 3 s.' }; return; }
    const r = A.importSave(raw) || { ok: false };
    L.saveMsg = r.ok ? { kind: 'ok', text: 'Imported (' + r.status + ').' + (r.notes && r.notes.length ? ' Fixed on load:' : ''), list: r.notes || [] } : { kind: 'bad', text: 'Not imported: ' + (r.status || 'unreadable') };
    L.sel = null;
  };
  ACTS.replay = () => A.replayOnboarding();
  ACTS.demo = () => {
    if (A.isDemo && A.isDemo()) { try { location.hash = ''; } catch (e) { /* no navigation */ } return; }
    A.openDemo();
  };
  ACTS.reset = () => { if (!arm('reset')) return; A.resetSave(); toast('A new city'); ACTS.close(); };
  ACTS.copyKpis = () => { kmemo = null; copy(JSON.stringify(kpis(), null, 1), 'The KPIs'); };

  // ---------------------------------------------------------------------------------------------- sync
  function setAttr(el, n, v) { if (el.getAttribute(n) !== v) el.setAttribute(n, v); }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function syncCtl() {
    for (const id of Object.keys(CTL)) {
      const c = CTL[id]; let v;
      try { v = c.get(); } catch (e) { continue; }
      const els = rootEl.querySelectorAll('[data-c="' + id + '"]');
      if (!els.length) continue;
      if (c.kind === 'seg') { const sv = JSON.stringify(v == null ? null : v); for (const el of els) setAttr(el, 'aria-pressed', String(el.dataset.v === sv)); }
      else if (c.kind === 'tog') { for (const el of els) { setAttr(el, 'aria-pressed', String(!!v)); const sp = el.firstChild; if (sp) setText(sp, v ? 'ON' : 'OFF'); } }
      else {
        const o = rootEl.querySelector('[data-ov="' + id + '"]'); if (o) setText(o, c.fmt(v));
        const i = nearest(c.list, v);
        for (const el of els) {
          if (el.dataset.v === 'r') el.classList.toggle('def', c.def == null || near(v, c.def));
          else el.classList.toggle('end', el.dataset.v === '-1' ? i === 0 && v <= c.list[0] : i === c.list.length - 1 && v >= c.list[c.list.length - 1]);
        }
      }
    }
  }
  function syncArm() {
    if (!rootEl) return;
    for (const [k, on] of [['drone', L.drone], ['heart', L.heart]]) { const el = rootEl.querySelector('[data-a="' + k + '"]'); if (el) setAttr(el, 'aria-pressed', String(!!on)); }
    for (const el of rootEl.querySelectorAll('[data-arm]')) {
      const on = !!L.armed[el.dataset.arm], sp = el.lastChild;
      el.classList.toggle('armed', on);
      if (sp) setText(sp, on ? el.dataset.l1 : el.dataset.l0);
    }
  }
  function syncInputs(force) {
    const s = S_(), act = document.activeElement;
    const seed = box('seed'); if (seed && (act !== seed || force)) { const v = s.lab.lockSeed != null ? s.lab.lockSeed : L.seed != null ? L.seed : s.lastRun && s.lastRun.result ? s.lastRun.result.seed : 1; if (String(seed.value) !== String(v)) seed.value = v; }
    const gal = box('gal'); if (gal && (act !== gal || force) && String(gal.value) !== String(L.galSeed)) gal.value = L.galSeed;
    const ac = document.activeElement;
    const ps = box('paste'); if (ps && ac !== ps && !ps.value && L.pasteText) ps.value = L.pasteText;
    const sv = box('save'); if (sv && ac !== sv && !sv.value && L.saveText) sv.value = L.saveText;
  }
  function syncOut() {
    for (const el of rootEl.querySelectorAll('[data-o]')) {
      const gb = el.closest('.bhl-gb'); if (gb && !gb.parentNode.classList.contains('open')) continue;
      const fn = OUT[el.dataset.o]; if (!fn) continue;
      let h = '';
      try { h = fn() || ''; } catch (e) { h = '<span class="red">' + esc((e && e.message) || e) + '</span>'; if (!el.__err) { el.__err = 1; console.error(e); } }
      morph(el, h);
    }
  }
  function sync(force) {
    if (!rootEl || !A) return;
    if (!S_()) return;
    kmemo = null;
    syncOut(); syncCtl(); syncArm(); syncInputs(force);
  }
  // Engine events refresh the panel at most every 300 ms (at 600× a frame can carry events every frame); the rAF
  // timestamp is the clock here, so the Lab never reads performance.now.
  function queue() {
    if (queued || !rootEl) return;
    queued = requestAnimationFrame((ts) => { queued = 0; if (ts - (L.evSync || 0) < 300) return; L.evSync = ts; sync(); });   // a skipped one waits for the next tick
  }
  function renderOut(key) { if (!rootEl) return; kmemo = null; const el = rootEl.querySelector('[data-o="' + key + '"]'); const fn = OUT[key]; if (el && fn) { try { morph(el, fn()); } catch (e) { /* shown on the next sync */ } } }
  // The odds table: one pair per animation frame while the Runs group is open (6.3.5's budget is 8 ms a frame).
  function kickOdds() { if (!L.oddsRaf && rootEl) L.oddsRaf = requestAnimationFrame(pumpOdds); }
  function pumpOdds() {
    L.oddsRaf = 0;
    if (!rootEl || !A || !L.open.runs) { L.oddsTodo = null; return; }
    const s = S_(); if (!s) return;
    if (!L.oddsTodo || !L.oddsTodo.length) { try { L.oddsTodo = E.oddsTable(s, { cachedOnly: true }).filter((r) => !r.computed); } catch (e) { L.oddsTodo = []; } }
    const r = L.oddsTodo.shift();
    if (r) { try { E.odds(s, r.destId, r.personId); } catch (e) { /* skipped */ } L.oddsN++; }
    if (L.oddsTodo.length) { if (L.oddsN % 6 === 0) renderOut('odds'); L.oddsRaf = requestAnimationFrame(pumpOdds); }
    else { L.oddsTodo = null; renderOut('odds'); }
  }

  // ---------------------------------------------------------------------------------------------- input
  function onClick(e) {
    const el = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!el || !rootEl || !rootEl.contains(el)) return;
    if (el.getAttribute('aria-disabled') === 'true') { if (el.dataset.why) toast(el.dataset.why); sfx('tick'); return; }
    if (el.dataset.g) { toggleGroup(el.dataset.g); sfx('tick'); return; }
    if (el.dataset.c) {
      if (rep.fired && e.detail !== 0) { rep.fired = false; return; }   // the hold already repeated this press
      press(el.dataset.c, el.dataset.v); sfx('tick'); return;
    }
    const fn = el.dataset.a ? ACTS[el.dataset.a] : null;
    if (!fn) return;
    if (el.dataset.a !== 'cue') sfx('tick');
    try { fn(el.dataset.x, el); } catch (err) { console.error(err); toast('Lab: ' + ((err && err.message) || err)); }
    if (rootEl) sync();
  }
  function press(id, v) {
    const c = CTL[id]; if (!c) return;
    let cur = null; try { cur = c.get(); } catch (e) { cur = null; }
    if (c.kind === 'seg') c.set(JSON.parse(v));
    else if (c.kind === 'tog') c.set(!cur);
    else if (v === 'r') { if (c.def != null) c.set(c.def); }
    else { const i = nearest(c.list, cur), j = Math.max(0, Math.min(c.list.length - 1, i + (+v))); if (j !== i || !near(cur, c.list[i])) c.set(c.list[j]); }
    if (rootEl) sync();
  }
  function stopRep() {
    clearTimeout(rep.t); clearInterval(rep.i); rep.t = 0; rep.i = 0; rep.el = null;
    window.removeEventListener('pointerup', stopRep, true); window.removeEventListener('pointercancel', stopRep, true);
  }
  function onDown(e) {                                        // holding − or + repeats (after 420 ms, every 110 ms)
    const el = e.target && e.target.closest ? e.target.closest('[data-c]') : null;
    stopRep(); rep.fired = false;
    if (!el || !rootEl.contains(el) || (el.dataset.v !== '1' && el.dataset.v !== '-1')) return;
    const id = el.dataset.c, v = el.dataset.v;
    rep.el = el;
    window.addEventListener('pointerup', stopRep, true); window.addEventListener('pointercancel', stopRep, true);
    rep.t = setTimeout(() => { rep.i = setInterval(() => { if (!rootEl) { stopRep(); return; } rep.fired = true; press(id, v); }, 110); }, 420);
  }
  function onOut(e) { if (rep.el && e.target === rep.el) stopRep(); }
  function onChange(e) {
    const el = e.target; if (!el || !el.dataset) return;
    const k = el.dataset.in;
    if (k === 'seed') { const v = Math.floor(+el.value); if (isFinite(v) && v >= 0) { L.seed = v >>> 0; if (S_().lab.lockSeed != null) dev('lockSeed', { value: L.seed }); } sync(); }
    else if (k === 'gal') { const v = Math.floor(+el.value); if (isFinite(v) && v >= 0) { L.galSeed = Math.min(4294967295, v); L.galPick = null; } sync(); }
  }
  function onInput(e) { const el = e.target; if (!el || !el.dataset) return; if (el.dataset.in === 'paste') L.pasteText = el.value; else if (el.dataset.in === 'save') L.saveText = el.value; }
  function toggleGroup(id) {
    L.open[id] = !L.open[id];
    const sec = rootEl.querySelector('[data-gid="' + id + '"]'); if (!sec) return;
    sec.classList.toggle('open', L.open[id]);
    setAttr(sec.querySelector('.bhl-gh'), 'aria-expanded', String(!!L.open[id]));
    if (id === 'runs' && !L.open[id] && L.oddsRaf) { cancelAnimationFrame(L.oddsRaf); L.oddsRaf = 0; L.oddsTodo = null; }
    sync();
  }

  // ---------------------------------------------------------------------------------------------- open and close
  function open(api) {
    if (!api || !api.el) return;
    if (rootEl && A === api && api.el.contains(rootEl)) { sync(true); return; }
    if (rootEl) close();
    A = api; E = api.Engine || BH.Engine; D = api.DATA || BH.DATA; F = api.fmt || (E && E.fmt);
    if (!E || !D || !F) return;
    injectCss();
    for (const old of api.el.querySelectorAll('.bhl')) old.remove();
    const s0 = S_(), waiting = !!(s0 && s0.pending && s0.pending.source !== 'sim');   // the run screen's OPEN THE LAB
    if (waiting) L.open.runs = true;
    rootEl = document.createElement('div'); rootEl.className = 'bhl';
    rootEl.innerHTML = build();
    api.el.appendChild(rootEl);
    bodyEl = rootEl.querySelector('.bhl-bd');
    rootEl.addEventListener('click', onClick);
    rootEl.addEventListener('pointerdown', onDown);
    rootEl.addEventListener('pointerout', onOut);
    rootEl.addEventListener('change', onChange);
    rootEl.addEventListener('input', onInput);
    if (typeof api.on === 'function') {
      for (const [name, fn] of [['tick', () => sync()], ['events', () => queue()], ['close', () => close()]]) { const u = api.on(name, fn); if (typeof u === 'function') unsubs.push(u); }
    }
    sync(true);
    const ps = waiting ? box('paste') : null;
    if (ps && bodyEl) bodyEl.scrollTop += ps.getBoundingClientRect().top - bodyEl.getBoundingClientRect().top - 120;   // straight to the paste box
    else if (bodyEl && L.scroll) bodyEl.scrollTop = L.scroll;
  }
  function close() {
    if (!rootEl) return;
    stopRep();
    for (const u of unsubs) { try { u(); } catch (e) { /* already gone */ } }
    unsubs = [];
    if (L.oddsRaf) cancelAnimationFrame(L.oddsRaf); L.oddsRaf = 0; L.oddsTodo = null;
    if (queued) cancelAnimationFrame(queued); queued = 0;
    for (const k of Object.keys(L.armed)) { clearTimeout(L.armed[k]); delete L.armed[k]; }
    if (L.drone) { L.drone = false; sfx('drone', { on: false }); }
    if (L.heart) { L.heart = false; sfx('heartbeat', { on: false }); }
    if (bodyEl) L.scroll = bodyEl.scrollTop;
    rootEl.remove(); rootEl = null; bodyEl = null;
  }
  return { open, close, isOpen: () => !!rootEl, refresh: () => sync(true), GROUPS: GROUPS.map((g) => g[0]) };
});
