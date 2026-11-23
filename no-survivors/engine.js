// NO SURVIVORS: Keep Them Dancing. The playback engine.
// Clock (the soundtrack is the master clock), cue playback, the frame state S, transitions, post FX
// (WebGL2 with a pure-2D fallback), the overlay pass, still mode, NS.renderStill and NS.engine.
// Loaded after core.js, score.js and the kits, before overlay.js, the scenes and end.js. It boots on
// DOMContentLoaded + NS.fontsReady, so every later script has registered its shots by then.
//
// ---- for scene authors -------------------------------------------------------------------------
// NS.shot(name, { init(env), warm(env)?, release()?, layout(S)?, draw(ctx, S) })
//   init(env) once after the fonts load; warm(env) at least one bar before the shot's cue (and by
//   renderStill); release() when the shot is more than one cue behind. env = { makeCanvas(w, h, tag),
//   freeCanvas(c), cacheScale, W, H, shot, still }. makeCanvas's tag defaults to the shot name.
//   layout(S) -> { lyricZone: 'top'|'bottom'|'center', keepOut: [[x, y, w, h], ...] } (pure, cheap).
//   draw(ctx, S): ctx is already transformed to the 1280 x 720 frame and cleared to black.
// S (one fresh object per draw; pure function of S.t):
//   t bar beat step ibar ibeat          global seconds / fractional bar, beat, 16th; int bar, int beat-in-bar
//   cue p shot cueIndex t0 t1 dur       the cue (with .bars .params .trans), its params, timing
//   lt lb lbar u                        local seconds / beats / bars since cue start, 0..1 (may leave 0..1)
//   W H                                 1280, 720
//   kick snare hat crash tom            seconds since the last hit (x, X, both halves of r; no ghosts;
//                                       hat includes 'open'); Infinity if none yet
//   next(lane)                          seconds until the next hit in that lane (same counting)
//   drum(lane, minVel?)                 { since, next, vel, pitch } over every onset of any lane (kick snare
//                                       hat open crash ride tom), ghosts included (vel: X 1, x .7, r .6, g .3;
//                                       pitch 'h'|'m'|'f' for toms); minVel skips softer onsets
//   hit(type) hitNext(type)             seconds since the latest / until the next SCORE.hits onset (every: n
//                                       expands to beat, beat+n, ... < toBeat); Infinity if none
//   hitSpan(type)                       { on, k, since, dur, t0, t1, hit } for the active or most recent
//                                       ranged (toBeat) hit of that type, else null
//   hitEntry(type)                      the SCORE.hits entry of the latest onset (for .who, .pitch), or null
//   gap                                 { t0, t1, k, since, dur, note } while inside a SCORE.gaps span, else null
//   section                             the SCORE.sections entry (+ t0, t1, index) at t
//   env                                 energy 0..1 (SCORE.energy, smoothed across bar lines)
//   flashK shakeK reduced reducedMotion 0.3 / 1; 0.35 / 1; Reduce flashing; prefers-reduced-motion
//   night witching now                  night counter, witching hour, a Date (pinned by ?now in stills)
//   post                                post-FX requests for this frame (see below), starts empty
//   anchor(who, x, y, ctx?)             speaker head for the overlay (or anchor(who, [x, y], ctx?)); pass ctx to map
//                                       from its CURRENT user space into frame units (call it before restoring the
//                                       transform the character was drawn with). anchors: { WHO: [x, y] }, per frame
//   lyricZone layout                    from layout(S) (+ clue keep-outs + shelf); the scene may override lyricZone
//   trans                               null, or { type, k, role: 'out'|'in' } while drawn inside a transition
//   still lod q shelf cssScale          still/polaroid render; horde thinning (1, or .6 at q .5); internal
//                                       scale; { y: 720, h: 216|0 } phone caption shelf; CSS px per frame unit
//   shakeXY                             [dx, dy] frame units (set before the overlay draws)
// S.post: bloom 0..2 (.6), grain 0..1 (.35), vignette 0..1 (.55), ca 0..1 (.15), flash [r,g,b,a] (additive,
//   a scaled by flashK, large flashes limited to one per beat live), shake (frame units, scaled by shakeK),
//   tint [r,g,b,k] (multiply grade), scan 0..1 (scanlines/VHS), blackout 0..1. Colours 0..1 (0..255 accepted).
// Transitions (cue.trans of the incoming cue, window [t0 - d/2, t0 + d/2], d = beats * 0.4 s):
//   cut | flash (hard cut at t0 under a warm-white flash; with Reduce flashing a quick crossfade under a faint glow)
//   | fade | whip | glitch | burn (outgoing burns away from its centre). In whip/glitch/fade/burn both shots draw
//   (outgoing past t1, incoming before t0).
//
// ---- NS.engine ---------------------------------------------------------------------------------
//   time() play() pause() toggle() seek(t) playing ended duration (179.2) on(ev, fn) -> off  off(ev, fn)
//   events: 'play' 'pause' 'seek' (t) 'end' 'frame' (t, S)
//   layoutAt(t) -> { lyricZone, keepOut: [[x,y,w,h]...], clues: [id...], clueRects: [{id, rect}], shelf }
//   mem() -> NS.mem()  audioCtx  audio  q  lod  gl  reduced  setReduced(b)  muted  setMuted(b)
//   cues sections cueAt(t) sectionAt(t) cueIndexAt(t) transAt(t)  fullscreen(on?)  errors  stats()
//   still(t, {overlay, trans}) -> Promise<{ t, cue, draw, post, overlay, total }>  (render the live view at exactly t;
//     used by still mode and check.cjs; also runs the warm/release policy for t)
//   snapshot({overlay}) -> canvas (the composited live view: frame [+ shelf] + overlay; freed on the next call)
//   onsets('hit', type) | onsets('drum', lane) (counted onsets) | onsets('drumAll', lane) -> Float64Array of seconds
//   tools: record(on) / records() -> [[t, rafNow, drawMs, postMs, overlayMs, cueIndex]...], manage(t), lastS,
//     lastPost, setOverlay(b)
// URL parameters (core.js parses ?a=1&b and #hash): t=<sec> start time; still (render exactly that frame, no gate or
//   audio; window.NS_READY = true once drawn with all six fonts loaded); end (open the board); reduced[=0];
//   q=<0.5..1> fixed quality; mute; autoplay (skip the gate and play; tests); gl=0 (2D post path); overlay=0;
//   dev (purity traps on shot draw/layout; dev=all also traps the overlay); night=, now=, witching (core.js).
// Page hooks (index.html): #stage > #box > #frame (#view-gl, #view-2d) + #shelf + #overlay; #gate (#gate-play,
//   #gate-reduce, #gate-night); the transport (#tp-*); #endcard (fallback when NS.board is missing); #board (end.js).
// NS.renderStill(t, { rect, w, h, overlay, trans, witching, reduced, post }) -> a new canvas (tag 'still';
//   NS.freeCanvas it when done). rect [x, y, w, h] (or fn(S)) is scaled to fill (cover) w x h.
(function () {
  'use strict';
  const NS = window.NS;
  if (!NS) { console.error('engine.js: core.js must load first'); return; }
  const SCORE = window.SCORE || {};
  const W = NS.W, H = NS.H, BEAT = NS.BEAT, BAR = NS.BAR, STEP = NS.STEP;
  const END = +SCORE.end || NS.END;
  const clamp = NS.clamp, lerp = NS.lerp, smoothstep = NS.smoothstep;
  const P = NS.params, has = NS.has;
  const flag = (k) => has(k) && P[k] !== '0' && P[k] !== 'false';
  const STILL = flag('still');
  const DEV = has('dev') && P.dev !== '0';
  const DEV_ALL = DEV && P.dev === 'all';
  const MUTE = flag('mute');
  const AUTOPLAY = flag('autoplay');
  const END_PARAM = has('end');
  const GL_WANTED = !(has('gl') && (P.gl === '0' || P.gl === 'false'));
  const OVERLAY_ON = !(has('overlay') && P.overlay === '0');
  const Q_FIXED = has('q') && P.q !== '' && isFinite(+P.q) ? clamp(+P.q, 0.5, 1) : null;
  const START_T = clamp(NS.num('t', 0), 0, END);
  const EPS = 1e-7;
  const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FAMILIES = ['Metal Mania', 'Anton', 'Bangers', 'Permanent Marker', 'Share Tech Mono', 'Special Elite'];
  const WARM = [1, 0.902, 0.753];   // #ffe6c0

  // ---- error reporting: once per place + message ------------------------------------------------------
  const errors = [];
  const seenErr = new Set();
  function report(where, e) {
    const msg = (e && e.message) || String(e);
    const key = where + '|' + msg;
    if (seenErr.has(key)) return;
    seenErr.add(key);
    errors.push({ where, msg });
    const frames = e && e.stack ? String(e.stack).split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !/engine\.js/.test(l)) : [];
    const st = frames.length ? '\n    ' + frames.slice(0, 2).join('\n    ') : '';
    console.error('[NS] ' + where + ': ' + msg + st);
  }

  // ---- timeline -----------------------------------------------------------------------------------
  const CUES = (Array.isArray(SCORE.cues) && SCORE.cues.length ? SCORE.cues : [{ shot: 'untitled', bars: [0, NS.BARS] }])
    .map((c, i) => {
      const tr = c.trans && c.trans.type ? c.trans : { type: 'cut' };
      const t0 = c.bars[0] * BAR, t1 = c.bars[1] * BAR;
      const td = tr.type === 'cut' || i === 0 ? 0 : Math.max(0.05, (+tr.beats || 0.5) * BEAT);
      return { shot: c.shot, bars: c.bars, params: c.params || {}, trans: tr, index: i, t0, t1, dur: t1 - t0, td, src: c };
    });
  const CUE_T0 = CUES.map((c) => c.t0);
  const SECTIONS = (SCORE.sections || []).map((s, i) => Object.assign({}, s, { index: i, t0: s.bars[0] * BAR, t1: s.bars[1] * BAR }));
  const SEC_T0 = SECTIONS.map((s) => s.t0);
  const GAPS = (SCORE.gaps || []).filter((g) => isFinite(g.fromBeat) && isFinite(g.toBeat))
    .map((g) => ({ t0: g.fromBeat * BEAT, t1: g.toBeat * BEAT, note: g.note || '' }))
    .sort((a, b) => a.t0 - b.t0);
  const GAP_T0 = GAPS.map((g) => g.t0);

  function lastLE(arr, t) {   // index of the last element <= t, or -1
    let lo = 0, hi = arr.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  const cueIndexAt = (t) => Math.max(0, lastLE(CUE_T0, t + EPS));
  const sectionAt = (t) => SECTIONS.length ? SECTIONS[Math.max(0, lastLE(SEC_T0, t + EPS))] : null;
  function gapAt(t) {
    const i = lastLE(GAP_T0, t + EPS);
    for (let j = i; j >= 0 && j > i - 3; j--) {
      const g = GAPS[j];
      if (t >= g.t0 - EPS && t < g.t1) return { t0: g.t0, t1: g.t1, k: clamp((t - g.t0) / (g.t1 - g.t0)), since: t - g.t0, dur: g.t1 - g.t0, note: g.note };
    }
    return null;
  }

  // energy, smoothed across bar lines (half a beat each side)
  const EN = Array.isArray(SCORE.energy) ? SCORE.energy : [];
  const enAt = (b) => { const v = EN[clamp(b, 0, Math.max(0, EN.length - 1))]; return isFinite(v) ? +v : 0.5; };
  function envAt(t) {
    const bar = t / BAR, b = Math.floor(bar), f = bar - b, X = 0.125;
    if (f < X) return lerp(enAt(b - 1), enAt(b), 0.5 + 0.5 * smoothstep(0, X, f));
    if (f > 1 - X) return lerp(enAt(b), enAt(b + 1), 0.5 * smoothstep(1 - X, 1, f));
    return enAt(b);
  }

  // ---- drums: SCORE.drums lanes of 112 strings x 16 steps ('x' 'X' 'r' 'g' '.'; toms h/m/f, upper = accent)
  const DR = {};     // lane -> { t: Float64Array, vel: Float32Array, pitch: [] }   every onset incl. ghosts
  const MAIN = {};   // lane -> Float64Array of counted onsets (no ghosts); hat = hat + open
  (function buildDrums() {
    const tmp = {};
    const add = (lane, t, vel, pitch, ghost) => (tmp[lane] || (tmp[lane] = [])).push([t, vel, pitch, ghost]);
    const D = SCORE.drums;
    let any = false;
    if (D && typeof D === 'object' && !Array.isArray(D)) {
      Object.keys(D).forEach((lane) => {
        const arr = D[lane];
        if (!Array.isArray(arr)) return;
        arr.forEach((pat, bar) => {
          if (typeof pat !== 'string') return;
          for (let s = 0; s < pat.length; s++) {
            const ch = pat[s];
            if (ch === '.' || ch === '-' || ch === ' ' || ch === '_') continue;
            const t = bar * BAR + s * STEP;
            let vel = 0.7, pitch = null, ghost = false, dbl = false;
            if (ch === 'X') vel = 1;
            else if (ch === 'x') vel = 0.7;
            else if (ch === 'r') { vel = 0.6; dbl = true; }
            else if (ch === 'R') { vel = 0.8; dbl = true; }
            else if (ch === 'g' || ch === 'G') { vel = 0.3; ghost = true; }
            else if (ch === 'h' || ch === 'm' || ch === 'f') pitch = ch;
            else if (ch === 'H' || ch === 'M' || ch === 'F') { vel = 1; pitch = ch.toLowerCase(); }
            if (lane === 'tom' && !pitch) pitch = 'm';
            add(lane, t, vel, pitch, ghost);
            if (dbl) add(lane, t + STEP / 2, vel, pitch, ghost);
            any = true;
          }
        });
      });
    }
    if (!any) {   // fallback: kick on beats 0 and 2, snare on 1 and 3 of every bar with energy > 0.3
      for (let b = 0; b < NS.BARS; b++) {
        if (enAt(b) <= 0.3) continue;
        add('kick', b * BAR, 0.9, null, false); add('kick', b * BAR + 2 * BEAT, 0.8, null, false);
        add('snare', b * BAR + BEAT, 0.9, null, false); add('snare', b * BAR + 3 * BEAT, 0.9, null, false);
      }
    }
    ['kick', 'snare', 'hat', 'open', 'crash', 'ride', 'tom'].concat(Object.keys(tmp)).forEach((lane) => {
      if (DR[lane]) return;
      const L = (tmp[lane] || []).sort((a, b) => a[0] - b[0]);
      DR[lane] = { t: Float64Array.from(L.map((x) => x[0])), vel: Float32Array.from(L.map((x) => x[1])), pitch: L.map((x) => x[2]) };
      MAIN[lane] = Float64Array.from(L.filter((x) => !x[3]).map((x) => x[0]));
    });
    const hat = Array.from(MAIN.hat).concat(Array.from(MAIN.open)).sort((a, b) => a - b);
    MAIN.hat = Float64Array.from(hat);
  })();
  const sinceIn = (arr, t) => { const i = lastLE(arr, t + EPS); return i < 0 ? Infinity : Math.max(0, t - arr[i]); };
  const untilIn = (arr, t) => { const i = lastLE(arr, t + EPS); return i + 1 < arr.length ? arr[i + 1] - t : Infinity; };
  function drumInfo(lane, t, minVel) {
    const L = DR[lane];
    if (!L || !L.t.length) return { since: Infinity, next: Infinity, vel: 0, pitch: null };
    const i0 = lastLE(L.t, t + EPS);
    let i = i0, j = i0 + 1;
    if (minVel) { while (i >= 0 && L.vel[i] < minVel) i--; while (j < L.t.length && L.vel[j] < minVel) j++; }
    return { since: i < 0 ? Infinity : Math.max(0, t - L.t[i]), next: j < L.t.length ? L.t[j] - t : Infinity, vel: i < 0 ? 0 : L.vel[i], pitch: i < 0 ? null : L.pitch[i] };
  }

  // ---- hits: SCORE.hits (beat, toBeat?, every?) --------------------------------------------------------
  const HIT = {};
  (function buildHits() {
    const tmp = {};
    (SCORE.hits || []).forEach((h) => {
      if (!h || !h.type || !isFinite(h.beat)) return;
      const R = tmp[h.type] || (tmp[h.type] = { on: [], spans: [] });
      const every = +h.every > 0 ? +h.every : 0;
      if (every && isFinite(h.toBeat)) { for (let n = 0; h.beat + n * every < h.toBeat - 1e-9; n++) R.on.push([(h.beat + n * every) * BEAT, h]); }
      else R.on.push([h.beat * BEAT, h]);
      if (isFinite(h.toBeat) && h.toBeat > h.beat) R.spans.push({ t0: h.beat * BEAT, t1: h.toBeat * BEAT, hit: h });
    });
    Object.keys(tmp).forEach((ty) => {
      const R = tmp[ty];
      R.on.sort((a, b) => a[0] - b[0]);
      R.spans.sort((a, b) => a.t0 - b.t0);
      HIT[ty] = { on: Float64Array.from(R.on.map((x) => x[0])), ent: R.on.map((x) => x[1]), spans: R.spans, spanT0: R.spans.map((s) => s.t0) };
    });
  })();
  const NOHIT = { on: new Float64Array(0), ent: [], spans: [], spanT0: [] };
  function hitSpanAt(type, t) {
    const R = HIT[type] || NOHIT;
    const i = lastLE(R.spanT0, t + EPS);
    if (i < 0) return null;
    let s = R.spans[i];
    for (let j = i; j >= 0; j--) { if (t < R.spans[j].t1) { s = R.spans[j]; break; } }
    return { on: t < s.t1, k: clamp((t - s.t0) / (s.t1 - s.t0)), since: Math.max(0, t - s.t0), dur: s.t1 - s.t0, t0: s.t0, t1: s.t1, hit: s.hit };
  }
  function hitEntryAt(type, t) { const R = HIT[type] || NOHIT; const i = lastLE(R.on, t + EPS); return i < 0 ? null : R.ent[i]; }

  // ---- mutable engine state -------------------------------------------------------------------------
  let reduced = false;
  try { const v = localStorage.getItem('ns.reduceFlashing'); if (v === '1') reduced = true; else if (v === null) reduced = reducedMotion; } catch (e) { reduced = reducedMotion; }
  if (has('reduced')) reduced = P.reduced !== '0';
  NS.reduced = reduced;
  const Q_STEPS = [1, 0.75, 0.5];
  let qi = (NS.cacheScale < 1) ? 1 : 0;
  let qCap = 1;
  let curQ = Q_FIXED != null ? Q_FIXED : Q_STEPS[qi];
  const lodNow = () => (STILL ? 1 : (Q_FIXED != null ? (Q_FIXED <= 0.5 ? 0.6 : 1) : (Q_STEPS[qi] <= 0.5 ? 0.6 : 1)));
  const loadPerf = performance.now();
  const paramNow = has('now') ? new Date(P.now) : null;
  function nowDate() {
    if (paramNow && !isNaN(paramNow)) return STILL ? new Date(paramNow.getTime()) : new Date(paramNow.getTime() + (performance.now() - loadPerf));
    return new Date();
  }

  // ---- shots: init / warm / release -------------------------------------------------------------------
  const inited = new Set(), warmed = new Set(), broken = {}, stillUse = {};
  function envFor(name) {
    return { makeCanvas: (w, h, tag) => NS.makeCanvas(w, h, tag || name), freeCanvas: NS.freeCanvas, cacheScale: NS.cacheScale, W, H, shot: name, still: STILL };
  }
  function ensureInit(name) {
    const shot = NS.shots[name];
    if (!shot) return false;
    if (inited.has(name)) return !broken[name];
    inited.add(name);
    if (typeof shot.init === 'function') {
      try { shot.init(envFor(name)); } catch (e) { broken[name] = e; report(name + '.init', e); return false; }
    }
    return true;
  }
  function ensureWarm(name) {
    if (!ensureInit(name)) return false;
    if (warmed.has(name)) return true;
    warmed.add(name);
    const shot = NS.shots[name];
    if (typeof shot.warm === 'function') { try { shot.warm(envFor(name)); } catch (e) { report(name + '.warm', e); } }
    return true;
  }
  function releaseShot(name) {
    if (!warmed.has(name)) return;
    warmed.delete(name);
    const shot = NS.shots[name];
    if (shot && typeof shot.release === 'function') { try { shot.release(); } catch (e) { report(name + '.release', e); } }
  }
  // Warm the current, previous and (from two bars before its start) the next cue's shot; release the rest,
  // unless renderStill used it in the last four seconds.
  function manageWarm(t) {
    const i = cueIndexAt(t);
    const need = new Set();
    if (CUES[i - 1]) need.add(CUES[i - 1].shot);
    need.add(CUES[i].shot);
    const nx = CUES[i + 1];
    if (nx && t >= nx.t0 - 2 * BAR) {
      need.add(nx.shot);
      if (nx.trans.type === 'burn' && !BURN.field) burnField();   // build the burn-order field before it is needed
    }
    need.forEach((n) => { if (NS.shots[n]) ensureWarm(n); });
    const now = performance.now();
    Array.from(warmed).forEach((n) => { if (!need.has(n) && !(stillUse[n] > now - 4000)) releaseShot(n); });
  }

  // ---- purity traps (?dev) ----------------------------------------------------------------------------
  function trapped(name, fn) {
    if (!DEV) return fn();
    const mr = Math.random, dn = Date.now, pn = performance.now;
    const thrower = (f) => function () { throw new Error('impure: ' + name + ' called ' + f); };
    Math.random = thrower('Math.random'); Date.now = thrower('Date.now'); performance.now = thrower('performance.now');
    try { return fn(); } finally { Math.random = mr; Date.now = dn; performance.now = pn; }
  }

  // ---- frame state ------------------------------------------------------------------------------------
  function frameBase(t, o) {
    const bar = t / BAR, beat = t / BEAT;
    const red = !!o.reduced;
    const ibar = Math.floor(bar + EPS);
    return {
      t, bar, beat, step: t / STEP, ibar, ibeat: Math.floor(beat + EPS) - ibar * 4,
      W, H,
      env: envAt(t),
      flashK: red ? 0.3 : 1,
      shakeK: (red || reducedMotion) ? 0.35 : 1,
      reduced: red, reducedMotion,
      night: NS.night, witching: !!o.witching, now: o.now,
      still: !!o.still, lod: o.lod, q: o.q, shelf: o.shelf, cssScale: o.cssScale,
      section: sectionAt(t), gap: gapAt(t),
      kick: sinceIn(MAIN.kick, t), snare: sinceIn(MAIN.snare, t), hat: sinceIn(MAIN.hat, t),
      crash: sinceIn(MAIN.crash, t), tom: sinceIn(MAIN.tom, t),
      next: (lane) => (MAIN[lane] ? untilIn(MAIN[lane], t) : Infinity),
      drum: (lane, minVel) => drumInfo(lane, t, minVel),
      hit: (type) => sinceIn((HIT[type] || NOHIT).on, t),
      hitNext: (type) => untilIn((HIT[type] || NOHIT).on, t),
      hitSpan: (type) => hitSpanAt(type, t),
      hitEntry: (type) => hitEntryAt(type, t),
      shakeXY: [0, 0],
      dev: DEV,
    };
  }
  function cueState(base, cue, trans) {
    const S = Object.assign({}, base);
    S.cue = cue; S.p = cue.params; S.shot = cue.shot; S.cueIndex = cue.index;
    S.t0 = cue.t0; S.t1 = cue.t1; S.dur = cue.dur;
    S.lt = base.t - cue.t0; S.lb = S.lt / BEAT; S.lbar = S.lt / BAR; S.u = S.lt / cue.dur;
    S.post = {};
    S.anchors = {};
    S.lyricZone = 'bottom';
    S.layout = null;
    S.trans = trans || null;
    S._bs = 1; S._bx = 0; S._by = 0;
    S.anchor = function (who, x, y, ctx) {
      if (Array.isArray(x)) { ctx = y; y = x[1]; x = x[0]; }   // S.anchor(who, [x, y], ctx) as the kits return points
      if (!isFinite(x) || !isFinite(y)) return;
      let fx = x, fy = y;
      if (ctx && typeof ctx.getTransform === 'function') {
        const m = ctx.getTransform();
        fx = (m.a * x + m.c * y + m.e - S._bx) / S._bs;
        fy = (m.b * x + m.d * y + m.f - S._by) / S._bs;
      }
      S.anchors[String(who).toUpperCase()] = [fx, fy];
    };
    return S;
  }

  // ---- layout: the shot's layout(S) + active clue keep-outs + the shelf ---------------------------------
  const validRect = (r) => Array.isArray(r) && r.length >= 4 && r.every((v, i) => i > 3 || isFinite(v)) && r[2] > 0 && r[3] > 0;
  const CLUES = (SCORE.clues || []).filter((c) => c && c.id && Array.isArray(c.hold));
  function clueRectsAt(t, S) {
    const out = [];
    for (const c of CLUES) {
      if (c.witching && !S.witching) continue;
      if (t < c.hold[0] * BAR - EPS || t >= c.hold[1] * BAR) continue;
      const reg = NS.clues[c.id];
      let r = reg && reg.rect;
      if (typeof r === 'function') { try { r = trapped('clue ' + c.id, () => r(S)); } catch (e) { report('clue ' + c.id + '.rect', e); r = null; } }
      out.push({ id: c.id, rect: validRect(r) ? r.slice(0, 4).map(Number) : null });
    }
    return out;
  }
  function layoutFor(S, cue) {
    const shot = NS.shots[cue.shot];
    let L = null;
    if (shot && typeof shot.layout === 'function' && ensureInit(cue.shot)) {
      try { L = trapped(cue.shot, () => shot.layout(S)); } catch (e) { report(cue.shot + '.layout', e); }
    }
    const lz = L && /^(top|bottom|center|auto)$/.test(L.lyricZone) ? L.lyricZone : 'bottom';
    const keepOut = L && Array.isArray(L.keepOut) ? L.keepOut.filter(validRect).map((r) => r.slice(0, 4).map(Number)) : [];
    const clueRects = clueRectsAt(S.t, S);
    clueRects.forEach((c) => { if (c.rect) keepOut.push(c.rect); });
    return { lyricZone: lz, keepOut, clues: clueRects.map((c) => c.id), clueRects, shelf: S.shelf };
  }

  // ---- transitions ------------------------------------------------------------------------------------
  function transAt(t) {
    const i = cueIndexAt(t), c = CUES[i], n = CUES[i + 1];
    if (n && n.td > 0 && t >= n.t0 - n.td / 2 - EPS) return { out: c, inn: n, type: n.trans.type, t0: n.t0, d: n.td, k: clamp((t - (n.t0 - n.td / 2)) / n.td) };
    if (i > 0 && c.td > 0 && t < c.t0 + c.td / 2) return { out: CUES[i - 1], inn: c, type: c.trans.type, t0: c.t0, d: c.td, k: clamp((t - (c.t0 - c.td / 2)) / c.td) };
    return null;
  }

  // ---- post-FX requests -------------------------------------------------------------------------------
  const DEF = { bloom: 0.6, grain: 0.35, vignette: 0.55, ca: 0.15, shake: 0, scan: 0, blackout: 0 };
  const RANGE = { bloom: [0, 2], grain: [0, 1], vignette: [0, 1], ca: [0, 1], shake: [0, 80], scan: [0, 1], blackout: [0, 1] };
  function vec4(a, defA) {
    if (!Array.isArray(a) || a.length < 3) return null;
    let r = +a[0], g = +a[1], b = +a[2];
    const al = a.length > 3 ? +a[3] : defA;
    if (![r, g, b, al].every(isFinite)) return null;
    if (r > 1 || g > 1 || b > 1) { r /= 255; g /= 255; b /= 255; }
    return [clamp(r), clamp(g), clamp(b), clamp(al)];
  }
  function resolvePost(r) {
    r = r || {};
    const o = {};
    for (const k in DEF) { const v = +r[k]; o[k] = (r[k] != null && isFinite(v)) ? clamp(v, RANGE[k][0], RANGE[k][1]) : DEF[k]; }
    o.flash = vec4(r.flash, 1);
    o.tint = vec4(r.tint, 1);
    return o;
  }
  function mixPost(a, b, k) {
    const o = {};
    for (const key in DEF) o[key] = lerp(a[key], b[key], k);
    const ta = a.tint || [1, 1, 1, 0], tb = b.tint || [1, 1, 1, 0];
    o.tint = (a.tint || b.tint) ? [0, 1, 2, 3].map((i) => lerp(ta[i], tb[i], k)) : null;
    const fa = a.flash ? a.flash[3] * (1 - k) : 0, fb = b.flash ? b.flash[3] * k : 0;
    o.flash = (fa || fb) ? (fa >= fb ? a.flash : b.flash).slice(0, 3).concat([Math.min(1, fa + fb)]) : null;
    return o;
  }
  function addFlash(f, g) {
    if (!f) return g.slice();
    if (!g) return f.slice();
    const a = Math.min(1, f[3] + g[3]), w = g[3] / Math.max(1e-6, f[3] + g[3]);
    return [lerp(f[0], g[0], w), lerp(f[1], g[1], w), lerp(f[2], g[2], w), a];
  }
  // Live limiter: a large flash (a > 0.2) may start at most once per beat (once per second when reduced).
  const lim = { start: -1e9, inFlash: false, supp: false, last: -1e9 };
  function limitFlash(a, t) {
    const TH = 0.2, minGap = reduced ? 1.0 : BEAT;
    if (t < lim.last - 1e-6 || t - lim.last > 0.5) { lim.inFlash = false; lim.supp = false; lim.start = -1e9; }
    lim.last = t;
    if (a <= TH) { lim.inFlash = false; lim.supp = false; return a; }
    if (lim.inFlash) return a;
    if (lim.supp) return TH;
    if (t - lim.start < minGap) { lim.supp = true; return TH; }
    lim.inFlash = true; lim.start = t;
    return a;
  }
  function finalizePost(post, t, S, live) {
    const o = Object.assign({}, post);
    if (o.flash) {
      const f = o.flash;
      let a = f[3] * S.flashK;
      if (f[0] > 0.5 && f[1] < 0.35 * f[0] && f[2] < 0.35 * f[0]) a = Math.min(a, 0.25);   // never a saturated-red full-frame flash
      if (live) a = limitFlash(a, t);
      o.flash = a > 0.002 ? [f[0], f[1], f[2], a] : null;
    } else if (live) limitFlash(0, t);
    const A = clamp(o.shake, 0, 80) * S.shakeK;
    o.shakeAmp = A;
    o.shakeXY = A > 0.01 ? [A * NS.noise1(t * 23, 3), A * 0.8 * NS.noise1(t * 23 + 50, 9)] : [0, 0];
    return o;
  }

  // ---- drawing a cue (or the placeholder card) -------------------------------------------------------
  function drawCue(ctx, cue, S, tgt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, tgt.w, tgt.h);
    ctx.setTransform(tgt.bs, 0, 0, tgt.bs, tgt.bx, tgt.by);
    S._bs = tgt.bs; S._bx = tgt.bx; S._by = tgt.by;
    S.layout = layoutFor(S, cue);
    S.lyricZone = S.layout.lyricZone;
    const name = cue.shot, shot = NS.shots[name];
    if (shot && typeof shot.draw === 'function' && ensureWarm(name)) {
      ctx.save();
      try {
        trapped(name, () => shot.draw(ctx, S));
        ctx.restore();
        return;
      } catch (e) {
        report(name + '.draw', e);
        for (let i = 0; i < 64; i++) ctx.restore();
        ctx.setTransform(tgt.bs, 0, 0, tgt.bs, tgt.bx, tgt.by);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        S.post = {};
        drawPlaceholder(ctx, S, e);
        return;
      }
    }
    drawPlaceholder(ctx, S, broken[name] || null);
  }

  // Cached sprites shared by the placeholder and the 2D post path (all from NS.makeCanvas).
  const SPR = {};
  function glowSprite() {
    if (SPR.glow) return SPR.glow;
    const c = SPR.glow = NS.makeCanvas(128, 128, 'engine');
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  }
  function tintedGlow(color) {
    const key = 'glow' + color;
    if (SPR[key]) return SPR[key];
    const c = SPR[key] = NS.makeCanvas(128, 128, 'engine');
    const g = c.getContext('2d');
    g.drawImage(glowSprite(), 0, 0);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    return c;
  }
  const ACCENTS = [NS.C.vex, NS.C.granny, NS.C.tiny, NS.C.noodle, NS.C.sodium, NS.C.lamp, NS.C.zombieRim, NS.C.fire];
  function nameHash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function fmtClock(t, cs) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (cs ? s.toFixed(2).padStart(5, '0') : String(Math.floor(s)).padStart(2, '0'));
  }

  // A deliberate, readable test card for every shot that has not been built yet: shot name, section,
  // bar:beat, a beat pulse, drum lamps and the latest score hit, so the whole timeline plays before scenes exist.
  function drawPlaceholder(ctx, S, err) {
    const cue = S.cue, name = cue.shot || '?';
    const acc = ACCENTS[nameHash(name) % ACCENTS.length];
    const C = NS.C;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e1627'); g.addColorStop(0.62, '#070b14'); g.addColorStop(1, '#040509');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // registration grid + crop marks
    ctx.strokeStyle = 'rgba(159,232,255,0.045)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < W; x += 80) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 80; y < H; y += 80) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(233,226,207,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    [[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.moveTo(x, y + 26 * sy); ctx.lineTo(x, y); ctx.lineTo(x + 26 * sx, y);
    });
    ctx.stroke();
    // beat pulse: a ring per beat, a glow per kick, a flicker per snare
    const ph = S.beat - Math.floor(S.beat);
    const cx = 640, cy = 300;
    // gentle by design: a large-area pulse must stay far below the flash thresholds (SPEC 10.6)
    const kick = Math.exp(-S.kick * 5), snare = Math.exp(-S.snare * 10);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2 + 0.1 * kick * (0.5 + 0.5 * S.env) * S.flashK;
    const gs = 540 + 40 * kick;
    ctx.drawImage(tintedGlow(acc), cx - gs / 2, cy - gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = acc;
    for (let k = 0; k < 3; k++) {
      const p = (ph + k) / 3;
      ctx.globalAlpha = (1 - p) * 0.45;
      ctx.lineWidth = 2 + 4 * (1 - p);
      ctx.beginPath(); ctx.arc(cx, cy, 120 + p * 300, 0, NS.TAU); ctx.stroke();
    }
    ctx.globalAlpha = 0.3 + 0.4 * snare * S.flashK;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 112, 0, NS.TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    // titles
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(233,226,207,0.6)';
    ctx.font = NS.font(24, NS.F.hud);
    ctx.fillText('SHOT ' + String(cue.index + 1).padStart(2, '0') + ' / ' + String(CUES.length).padStart(2, '0') + (err ? '  ·  ERROR' : '  ·  NOT BUILT YET'), cx, 196);
    ctx.font = NS.font(132, NS.F.title);
    ctx.fillStyle = '#000'; ctx.globalAlpha = 0.6;
    ctx.fillText(name.toUpperCase(), cx + 5, 352 + 6);
    ctx.globalAlpha = 1; ctx.fillStyle = C.white;
    ctx.fillText(name.toUpperCase(), cx, 352);
    const sec = S.section;
    ctx.font = NS.font(34, NS.F.type); ctx.fillStyle = acc;
    ctx.fillText((sec ? sec.label : '') + '  ·  bars ' + cue.bars[0] + '–' + cue.bars[1], cx, 416);
    if (S.trans) {
      ctx.font = NS.font(22, NS.F.hud); ctx.fillStyle = 'rgba(233,226,207,0.7)';
      ctx.fillText('TRANSITION ' + S.trans.type.toUpperCase() + ' · ' + S.trans.role.toUpperCase() + ' · ' + S.trans.k.toFixed(2), cx, 458);
    }
    // bottom: bar:beat counter, time, progress through the cue, drum lamps, latest hit
    ctx.textAlign = 'left';
    ctx.font = NS.font(20, NS.F.hud); ctx.fillStyle = 'rgba(233,226,207,0.5)';
    ctx.fillText('BAR : BEAT', 64, 560);
    ctx.font = NS.font(72, NS.F.hud); ctx.fillStyle = C.white;
    ctx.fillText(S.ibar + ':' + S.ibeat, 60, 628);
    ctx.textAlign = 'right';
    ctx.font = NS.font(20, NS.F.hud); ctx.fillStyle = 'rgba(233,226,207,0.5)';
    ctx.fillText('TIME', W - 64, 560);
    ctx.font = NS.font(44, NS.F.hud); ctx.fillStyle = 'rgba(233,226,207,0.9)';
    ctx.fillText(fmtClock(S.t, true), W - 60, 612);
    const x0 = 64, x1 = W - 64, py = 662;
    ctx.fillStyle = 'rgba(233,226,207,0.12)'; ctx.fillRect(x0, py, x1 - x0, 4);
    ctx.fillStyle = acc; ctx.fillRect(x0, py, (x1 - x0) * clamp(S.u), 4);
    const nb = cue.bars[1] - cue.bars[0];
    ctx.fillStyle = 'rgba(233,226,207,0.45)';
    for (let b = 0; b <= nb; b++) ctx.fillRect(x0 + (x1 - x0) * b / nb - 1, py - 6, 2, 16);
    const lamps = [['K', S.kick], ['S', S.snare], ['H', S.hat], ['C', S.crash], ['T', S.tom]];
    ctx.textAlign = 'center'; ctx.font = NS.font(22, NS.F.hud);
    lamps.forEach(([l, s], i) => {
      const x = 470 + i * 70, y = 600, k = Math.exp(-s * 8);
      ctx.fillStyle = 'rgba(233,226,207,0.10)'; ctx.beginPath(); ctx.arc(x, y, 22, 0, NS.TAU); ctx.fill();
      if (k > 0.02) { ctx.globalAlpha = k; ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(x, y, 22, 0, NS.TAU); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = k > 0.5 ? '#05070d' : 'rgba(233,226,207,0.7)';
      ctx.fillText(l, x, y + 8);
    });
    // energy meter
    ctx.fillStyle = 'rgba(233,226,207,0.12)'; ctx.fillRect(470 - 22, 634, 4 * 70 + 44, 6);
    ctx.fillStyle = acc; ctx.fillRect(470 - 22, 634, (4 * 70 + 44) * clamp(S.env), 6);
    let latest = null, lt = Infinity;
    for (const ty in HIT) { const s = S.hit(ty); if (s < lt) { lt = s; latest = ty; } }
    if (latest && lt < 1.2) {
      ctx.globalAlpha = clamp(1.4 - lt * 1.1);
      ctx.font = NS.font(40, NS.F.comic); ctx.fillStyle = C.tiny;
      ctx.fillText(latest.toUpperCase() + '!', cx, 520);
      ctx.globalAlpha = 1;
    }
    if (S.gap) {
      ctx.font = NS.font(22, NS.F.hud); ctx.fillStyle = C.lamp;
      ctx.fillText('— GAP —', cx, 486);
    }
    if (err) {
      ctx.fillStyle = 'rgba(90,11,16,0.92)'; ctx.fillRect(0, 60, W, 70);
      ctx.fillStyle = C.white; ctx.font = NS.font(24, NS.F.hud); ctx.textAlign = 'center';
      const msg = String((err && err.message) || err).slice(0, 90);
      ctx.fillText(name + ': ' + msg, cx, 104);
    }
    ctx.restore();
    S.post = { bloom: 0.75, grain: 0.3, vignette: 0.6, ca: 0.12 };
  }

  // ---- transition compositing -------------------------------------------------------------------------
  function blendTrans(ctx, A, B, tr, t, tgt, S) {
    const w = tgt.w, h = tgt.h, k = tr.k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (tr.type === 'whip') {
      // a whip pan: outgoing leaves left, incoming arrives from the right, with directional motion blur
      // accumulated at quarter width (smooth streaks, cheap), mixed over a sharp copy by speed
      const e = NS.ease.inOutCubic(k);
      const v = k < 0.5 ? 12 * k * k : 12 * (1 - k) * (1 - k);       // d/dk of inOutCubic (peak 3)
      const off = e * w, m = clamp(v / 2.2);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(A, -off, 0); ctx.drawImage(B, w - off, 0);
      if (m > 0.02) {
        const sw = Math.max(16, Math.round(w / 4)), sh = Math.max(9, Math.round(h / 2));
        const M1 = tgt.tmp(3, sw, sh), M2 = tgt.tmp(4, sw, sh), g1 = M1.ctx, g2 = M2.ctx;
        const N = 8, blur = 0.24 * m * sw, so = off * sw / w;
        [g1, g2].forEach((g) => { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.fillRect(0, 0, sw, sh); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 / N; });
        for (let i = 0; i < N; i++) {          // fine taps
          const dx = (i / (N - 1) - 0.5) * blur / N;
          g1.drawImage(A, -so + dx, 0, sw, sh);
          g1.drawImage(B, sw - so + dx, 0, sw, sh);
        }
        for (let i = 0; i < N; i++) g2.drawImage(M1.canvas, (i / (N - 1) - 0.5) * blur * (N - 1) / N, 0);   // coarse taps
        [g1, g2].forEach((g) => { g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; });
        ctx.globalAlpha = m;
        ctx.drawImage(M2.canvas, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      return { dx: k < 0.5 ? -off : w - off };
    }
    if (tr.type === 'glitch') {
      const amt = 1 - Math.abs(2 * k - 1);
      const fr = Math.floor(t * 30);
      const r = NS.rng(fr * 7919 + 13);
      ctx.drawImage(k < 0.5 ? A : B, 0, 0);
      const n = 8 + Math.floor(amt * 16);
      for (let i = 0; i < n; i++) {
        const y = Math.floor(r() * h), sh = Math.max(2, Math.floor((0.008 + r() * 0.07) * h));
        const src = r() < k ? B : A, dx = (r() - 0.5) * amt * 0.22 * w;
        ctx.drawImage(src, 0, y, w, sh, dx, y, w, sh);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const y = r() * h, sh = (0.01 + r() * 0.05) * h;
        ctx.fillStyle = i % 2 ? 'rgba(0,255,220,' + (0.12 * amt) + ')' : 'rgba(255,40,120,' + (0.12 * amt) + ')';
        ctx.fillRect(0, y, w, sh);
      }
      ctx.globalAlpha = 0.35 * amt;
      ctx.drawImage(k < 0.5 ? B : A, (r() - 0.5) * 0.03 * w, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      return null;
    }
    if (tr.type === 'burn') { burnComposite(ctx, A, B, k, tgt, S); return null; }
    // fade (and anything unknown)
    ctx.drawImage(A, 0, 0);
    ctx.globalAlpha = NS.ease.inOutQuad(k);
    ctx.drawImage(B, 0, 0);
    ctx.globalAlpha = 1;
    return null;
  }

  // Film burn: a noise-edged hole grows from the centre of the outgoing frame with a curling orange rim
  // (no white flash; reduced: a thin rim only). Mask computed at 480 x 270 from a cached burn-order field.
  const BURN = { w: 480, h: 270, field: null, lo: 0, hi: 1, mask: null, rim: null, maskImg: null, rimImg: null };
  function burnField() {
    if (BURN.field) return;
    const bw = BURN.w, bh = BURN.h, f = new Float32Array(bw * bh);
    let lo = Infinity, hi = -Infinity;
    const fbm = (x, y) => {
      let v = 0, a = 0.5, fx = x, fy = y;
      for (let o = 0; o < 4; o++) { v += a * (NS.noise1(fx + NS.noise1(fy * 0.7, 31 + o) * 2.3, 11 + o) ); fx *= 2.1; fy *= 2.1; a *= 0.5; }
      return v;
    };
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const nx = (x / bw - 0.5) * 1.778, ny = (y / bh - 0.5);
        const r = Math.sqrt(nx * nx + ny * ny) / 1.02;
        const ang = Math.atan2(ny, nx);
        const v = r * 0.78 + 0.22 * (fbm(x * 0.018 + 3.1, y * 0.018 - 1.7) * 0.5 + 0.5) + 0.05 * NS.noise1(ang * 5 + 9, 77);
        f[y * bw + x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    BURN.field = f; BURN.lo = lo; BURN.hi = hi;
    BURN.mask = NS.makeCanvas(bw, bh, 'engine'); BURN.rim = NS.makeCanvas(bw, bh, 'engine');
    BURN.maskImg = BURN.mask.getContext('2d').createImageData(bw, bh);
    BURN.rimImg = BURN.rim.getContext('2d').createImageData(bw, bh);
  }
  function burnComposite(ctx, A, B, k, tgt, S) {
    burnField();
    const bw = BURN.w, bh = BURN.h, f = BURN.field, md = BURN.maskImg.data, rd = BURN.rimImg.data;
    const red = S && S.reduced;
    const th = lerp(BURN.lo - 0.03, BURN.hi + 0.05, NS.ease.inQuad(clamp(k)));
    const soft = 0.006, rimW = red ? 0.012 : 0.03, charW = 0.05;
    for (let i = 0, p = 0; i < f.length; i++, p += 4) {
      const v = f[i];
      const d = v - th;                       // < 0 burnt through
      const keep = d <= 0 ? 0 : d >= soft ? 1 : d / soft;
      // mask: outgoing alpha, darkened (charred) just outside the rim
      const ch = d > 0 && d < rimW + charW ? 1 - clamp((d - rimW) / charW) : 0;
      md[p] = 34 + 221 * (1 - ch * 0.85); md[p + 1] = 18 + 237 * (1 - ch * 0.92); md[p + 2] = 10 + 245 * (1 - ch); md[p + 3] = keep * 255;
      // rim glow: hottest at the burning edge
      let gl = 0;
      if (d > -0.004 && d < rimW) gl = 1 - Math.abs(d - rimW * 0.3) / (rimW * 0.9);
      gl = clamp(gl);
      const hot = gl * gl;
      rd[p] = 255; rd[p + 1] = 70 + 150 * hot; rd[p + 2] = 10 + 80 * hot * hot; rd[p + 3] = gl * (red ? 150 : 255);
    }
    BURN.mask.getContext('2d').putImageData(BURN.maskImg, 0, 0);
    BURN.rim.getContext('2d').putImageData(BURN.rimImg, 0, 0);
    const w = tgt.w, h = tgt.h;
    const C = tgt.tmp(2);
    const c = C.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    c.globalCompositeOperation = 'copy'; c.drawImage(A, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.drawImage(BURN.mask, 0, 0, w, h);   // char tint (rgb), alpha ignored by multiply
    c.globalCompositeOperation = 'destination-in'; c.drawImage(BURN.mask, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(B, 0, 0);
    ctx.drawImage(C.canvas, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = red ? 0.6 : 1;
    ctx.drawImage(BURN.rim, 0, 0, w, h);
    if (!red) { ctx.globalAlpha = 0.35; ctx.drawImage(BURN.rim, -w * 0.004, -h * 0.004, w * 1.008, h * 1.008); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---- compose one frame of the scene into a target ------------------------------------------------------
  // tgt: { ctx, w, h, bs, bx, by, opts, allowTrans, tmp(i) -> { canvas, ctx } }
  function composeScene(t, tgt) {
    const base = frameBase(t, tgt.opts);
    const tr = tgt.allowTrans ? transAt(t) : null;
    let S, post;
    if (!tr) {
      const cue = CUES[cueIndexAt(t)];
      S = cueState(base, cue, null);
      drawCue(tgt.ctx, cue, S, tgt);
      post = resolvePost(S.post);
    } else if (tr.type === 'flash' && !base.reduced) {
      const cue = t < tr.t0 ? tr.out : tr.inn;
      S = cueState(base, cue, { type: 'flash', k: tr.k, role: cue === tr.out ? 'out' : 'in' });
      drawCue(tgt.ctx, cue, S, tgt);
      post = resolvePost(S.post);
      const a = Math.pow(clamp(1 - Math.abs(t - tr.t0) / (tr.d / 2)), 1.6);
      if (a > 0.002) post.flash = addFlash(post.flash, WARM.concat([a]));
    } else {
      const A = tgt.tmp(0), B = tgt.tmp(1);
      const So = cueState(base, tr.out, { type: tr.type, k: tr.k, role: 'out' });
      const Si = cueState(base, tr.inn, { type: tr.type, k: tr.k, role: 'in' });
      drawCue(A.ctx, tr.out, So, tgt);
      drawCue(B.ctx, tr.inn, Si, tgt);
      // with Reduce flashing a flash cut becomes a quick crossfade under a faint warm glow
      const res = blendTrans(tgt.ctx, A.canvas, B.canvas, tr.type === 'flash' ? Object.assign({}, tr, { type: 'fade' }) : tr, t, tgt, Si);
      S = tr.k < 0.5 ? So : Si;
      if (res && res.dx) {   // whip: move the dominant shot's anchors with it
        const dx = res.dx / tgt.bs;
        Object.keys(S.anchors).forEach((k2) => { S.anchors[k2] = [S.anchors[k2][0] + dx, S.anchors[k2][1]]; });
      }
      post = mixPost(resolvePost(So.post), resolvePost(Si.post), smoothstep(0, 1, tr.k));
      if (tr.type === 'flash') {
        const a = 0.5 * Math.pow(clamp(1 - Math.abs(t - tr.t0) / (tr.d / 2)), 1.6);
        if (a > 0.002) post.flash = addFlash(post.flash, WARM.concat([a]));
      }
    }
    return { S, post, tr };
  }

  // ---- 2D post path (fallback, and every renderStill) -----------------------------------------------------
  function scratch(key, w, h, alpha) {
    let s = SPR[key];
    if (s && s.canvas.width === w && s.canvas.height === h) return s;
    if (s) NS.freeCanvas(s.canvas);
    const c = NS.makeCanvas(w, h, 'post');
    s = SPR[key] = { canvas: c, ctx: c.getContext('2d', { alpha: alpha !== false }) };
    return s;
  }
  function vignetteSprite() {
    if (SPR.vig) return SPR.vig;
    const c = SPR.vig = NS.makeCanvas(256, 256, 'post');
    const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 40, 128, 128, 184);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.08)');
    gr.addColorStop(0.75, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return c;
  }
  function grainTile(i) {
    const key = 'grain' + i;
    if (SPR[key]) return SPR[key];
    const c = SPR[key] = NS.makeCanvas(128, 128, 'post');
    const g = c.getContext('2d'), img = g.createImageData(128, 128), d = img.data, r = NS.rng(1009 + i * 17);
    for (let p = 0; p < d.length; p += 4) { const v = 128 + (r() + r() + r() - 1.5) * 120; d[p] = d[p + 1] = d[p + 2] = clamp(v, 0, 255); d[p + 3] = 255; }
    g.putImageData(img, 0, 0);
    return c;
  }
  function scanSprite() {
    if (SPR.scan) return SPR.scan;
    const c = SPR.scan = NS.makeCanvas(4, 4, 'post');
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 4, 4);
    g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 2, 4, 2);
    return c;
  }
  const rgb = (r, g, b, a) => 'rgba(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ',' + (a == null ? 1 : a) + ')';
  function post2D(dctx, src, dw, dh, post, t, o) {
    dctx.save();
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.globalAlpha = 1; dctx.globalCompositeOperation = 'source-over';
    dctx.imageSmoothingEnabled = true;
    let x = 0, y = 0, w = dw, h = dh;
    if (o.shake && post.shakeAmp > 0.01) {
      const z = 1 + 2 * post.shakeAmp / W;
      w = dw * z; h = dh * z;
      x = (dw - w) / 2 + post.shakeXY[0] * dw / W; y = (dh - h) / 2 + post.shakeXY[1] * dh / H;
    }
    dctx.fillStyle = '#000'; dctx.fillRect(0, 0, dw, dh);
    dctx.drawImage(src, x, y, w, h);
    if (post.bloom > 0.01) {
      const bw = Math.max(8, Math.round(dw / 8)), bh = Math.max(5, Math.round(dh / 8));
      const a = scratch('bA', bw, bh, false), b = scratch('bB', bw, bh, false);
      const tw = Math.max(4, Math.round(bw / 3)), th = Math.max(3, Math.round(bh / 3));
      const c3 = scratch('bC', tw, th, false);
      a.ctx.imageSmoothingEnabled = true; a.ctx.imageSmoothingQuality = 'high';
      a.ctx.globalCompositeOperation = 'source-over';
      a.ctx.drawImage(src, 0, 0, bw, bh);
      b.ctx.globalCompositeOperation = 'source-over'; b.ctx.drawImage(a.canvas, 0, 0);
      b.ctx.globalCompositeOperation = 'multiply'; b.ctx.drawImage(a.canvas, 0, 0); b.ctx.drawImage(a.canvas, 0, 0);
      b.ctx.globalCompositeOperation = 'source-over';
      c3.ctx.imageSmoothingQuality = 'high'; c3.ctx.drawImage(b.canvas, 0, 0, tw, th);
      dctx.globalCompositeOperation = 'lighter';
      dctx.globalAlpha = Math.min(1, post.bloom * 0.8);
      dctx.drawImage(b.canvas, x, y, w, h);
      dctx.globalAlpha = Math.min(1, post.bloom * 0.6);
      dctx.drawImage(c3.canvas, x, y, w, h);
      if (post.bloom > 1.2) { dctx.globalAlpha = Math.min(1, post.bloom - 1.2); dctx.drawImage(c3.canvas, x - w * 0.01, y - h * 0.01, w * 1.02, h * 1.02); }
      dctx.globalAlpha = 1; dctx.globalCompositeOperation = 'source-over';
    }
    if (post.tint && post.tint[3] > 0.001) {
      const k = post.tint[3];
      dctx.globalCompositeOperation = 'multiply';
      dctx.fillStyle = rgb(lerp(1, post.tint[0], k), lerp(1, post.tint[1], k), lerp(1, post.tint[2], k));
      dctx.fillRect(0, 0, dw, dh);
      dctx.globalCompositeOperation = 'source-over';
    }
    if (post.vignette > 0.01) { dctx.globalAlpha = Math.min(1, post.vignette * 0.95); dctx.drawImage(vignetteSprite(), -dw * 0.04, -dh * 0.04, dw * 1.08, dh * 1.08); dctx.globalAlpha = 1; }
    if (post.scan > 0.01) {
      const pat = dctx.createPattern(scanSprite(), 'repeat');
      const pitch = Math.max(1, Math.round(dh / 270));
      dctx.save(); dctx.scale(1, pitch / 2); dctx.globalAlpha = post.scan * 0.3; dctx.fillStyle = pat; dctx.fillRect(0, 0, dw, dh * 2 / pitch + 4); dctx.restore();
    }
    if (post.grain > 0.01) {
      const fr = Math.floor(t * 24);
      const tile = grainTile(Math.floor(NS.hash(fr, 5) * 4));
      const pat = dctx.createPattern(tile, 'repeat');
      const ox = Math.floor(NS.hash(fr, 6) * 128), oy = Math.floor(NS.hash(fr, 7) * 128);
      const gs = Math.max(1, dw / 960);
      dctx.save();
      dctx.globalCompositeOperation = 'overlay'; dctx.globalAlpha = post.grain * 0.32;
      dctx.scale(gs, gs); dctx.translate(-ox, -oy);
      dctx.fillStyle = pat; dctx.fillRect(ox, oy, dw / gs, dh / gs);
      dctx.restore();
    }
    if (post.flash && post.flash[3] > 0.002) {
      dctx.globalCompositeOperation = 'lighter';
      dctx.fillStyle = rgb(post.flash[0], post.flash[1], post.flash[2], post.flash[3]);
      dctx.fillRect(0, 0, dw, dh);
      dctx.globalCompositeOperation = 'source-over';
    }
    if (post.blackout > 0.001) { dctx.fillStyle = 'rgba(0,0,0,' + clamp(post.blackout) + ')'; dctx.fillRect(0, 0, dw, dh); }
    dctx.restore();
  }

  // ---- WebGL2 post path ------------------------------------------------------------------------------------
  const VS = `#version 300 es
out vec2 v_uv;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS_BRIGHT = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_tx; uniform float u_th;
vec3 S(vec2 uv) { return texture(u_src, vec2(uv.x, 1.0 - uv.y)).rgb; }
void main() {
  vec3 c = (S(v_uv + vec2(-u_tx.x, -u_tx.y)) + S(v_uv + vec2(u_tx.x, -u_tx.y)) + S(v_uv + vec2(-u_tx.x, u_tx.y)) + S(v_uv + vec2(u_tx.x, u_tx.y))) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  float knee = 0.22;
  float s = clamp(l - u_th + knee, 0.0, 2.0 * knee); s = s * s / (4.0 * knee + 1e-4);
  float w = max(s, l - u_th) / max(l, 1e-4);
  o = vec4(c * w, 1.0);
}`;
  const FS_BLUR = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_dir;
void main() {
  vec3 c = texture(u_src, v_uv).rgb * 0.2270270270;
  c += texture(u_src, v_uv + u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_src, v_uv - u_dir * 1.3846153846).rgb * 0.3162162162;
  c += texture(u_src, v_uv + u_dir * 3.2307692308).rgb * 0.0702702703;
  c += texture(u_src, v_uv - u_dir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;
  const FS_DOWN = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
uniform sampler2D u_src; uniform vec2 u_tx;
void main() {
  vec3 c = texture(u_src, v_uv + vec2(-u_tx.x, -u_tx.y)).rgb + texture(u_src, v_uv + vec2(u_tx.x, -u_tx.y)).rgb
         + texture(u_src, v_uv + vec2(-u_tx.x, u_tx.y)).rgb + texture(u_src, v_uv + vec2(u_tx.x, u_tx.y)).rgb;
  o = vec4(c * 0.25, 1.0);
}`;
  const FS_FINAL = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
uniform sampler2D u_scene, u_b1, u_b2, u_b3;
uniform vec2 u_res; uniform vec4 u_shake; uniform vec4 u_flash; uniform vec4 u_tint;
uniform float u_bloom, u_grain, u_vig, u_ca, u_scan, u_black, u_time, u_seed;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 SC(vec2 uv) { return texture(u_scene, vec2(uv.x, 1.0 - uv.y)).rgb; }
void main() {
  vec2 uv = (v_uv - 0.5) / u_shake.z + 0.5 + u_shake.xy;
  if (u_scan > 0.001) uv.x += u_scan * 0.0012 * sin(uv.y * 310.0 + u_time * 41.0) * step(0.6, hash(vec2(floor(uv.y * 90.0), floor(u_time * 12.0))));
  vec2 cd = uv - 0.5;
  vec3 col;
  if (u_ca > 0.001) {
    vec2 off = cd * u_ca * 0.016 * (0.35 + dot(cd, cd) * 2.4);
    col = vec3(SC(uv + off).r, SC(uv).g, SC(uv - off).b);
  } else col = SC(uv);
  vec3 bl = texture(u_b1, uv).rgb * 1.0 + texture(u_b2, uv).rgb * 0.9 + texture(u_b3, uv).rgb * 0.8;
  col += bl * u_bloom;
  col *= mix(vec3(1.0), u_tint.rgb, u_tint.a);
  vec2 vd = (v_uv - 0.5) * vec2(1.0, 0.84);
  float vig = smoothstep(0.3, 0.8, length(vd));
  col *= 1.0 - u_vig * vig * 0.88;
  if (u_scan > 0.001) {
    float pitch = max(2.0, floor(u_res.y / 270.0));
    float s = 0.5 + 0.5 * cos(gl_FragCoord.y * 6.2831853 / pitch);
    col *= 1.0 - u_scan * 0.3 * s;
    float roll = smoothstep(0.08, 0.0, abs(fract(v_uv.y * 0.6 - u_time * 0.18) - 0.5));
    col += u_scan * 0.04 * roll;
  }
  float n = hash(floor(gl_FragCoord.xy / max(1.0, u_res.x / 960.0)) + u_seed) - 0.5;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += n * u_grain * 0.12 * (1.0 - 0.65 * clamp(lum, 0.0, 1.0));
  col += u_flash.rgb * u_flash.a;
  col *= 1.0 - u_black;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
  function createGL(canvas) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: STILL, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) return null;
    const R = { gl, ok: false };
    function sh(type, src) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(s));
      return s;
    }
    function prog(fs, names) {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
      const u = {};
      names.forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
      return { p, u };
    }
    function tex(w, h) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    }
    function target(w, h) {
      const t = tex(w, h), f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, f, w, h };
    }
    R.setup = function () {
      R.ok = false;
      R.bright = prog(FS_BRIGHT, ['u_src', 'u_tx', 'u_th']);
      R.blur = prog(FS_BLUR, ['u_src', 'u_dir']);
      R.down = prog(FS_DOWN, ['u_src', 'u_tx']);
      R.final = prog(FS_FINAL, ['u_scene', 'u_b1', 'u_b2', 'u_b3', 'u_res', 'u_shake', 'u_flash', 'u_tint', 'u_bloom', 'u_grain', 'u_vig', 'u_ca', 'u_scan', 'u_black', 'u_time', 'u_seed']);
      R.vao = gl.createVertexArray();
      R.scene = tex(0, 0); R.sw = 0; R.sh = 0;
      R.levels = null;
      R.ok = true;
    };
    function levels(sw, sh) {
      if (R.levels && R.levels.sw === sw && R.levels.sh === sh) return R.levels;
      if (R.levels) R.levels.list.forEach((L) => { gl.deleteTexture(L.a.t); gl.deleteFramebuffer(L.a.f); gl.deleteTexture(L.b.t); gl.deleteFramebuffer(L.b.f); });
      const list = [4, 8, 16].map((d) => { const w = Math.max(2, Math.round(sw / d)), h = Math.max(2, Math.round(sh / d)); return { w, h, a: target(w, h), b: target(w, h) }; });
      R.levels = { sw, sh, list };
      return R.levels;
    }
    function pass(pr, tgtFb, w, h) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgtFb); gl.viewport(0, 0, w, h);
      gl.useProgram(pr.p);
    }
    R.render = function (src, post, t, outW, outH) {
      if (!R.ok || gl.isContextLost()) return false;
      if (canvas.width !== outW || canvas.height !== outH) { canvas.width = outW; canvas.height = outH; }
      gl.bindVertexArray(R.vao);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, R.scene);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (R.sw !== src.width || R.sh !== src.height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
        R.sw = src.width; R.sh = src.height;
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const LV = levels(R.sw, R.sh).list;
      if (post.bloom > 0.01) {
        const L1 = LV[0];
        pass(R.bright, L1.a.f, L1.w, L1.h);
        gl.bindTexture(gl.TEXTURE_2D, R.scene);
        gl.uniform1i(R.bright.u.u_src, 0); gl.uniform2f(R.bright.u.u_tx, 1 / R.sw, 1 / R.sh); gl.uniform1f(R.bright.u.u_th, 0.5);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        for (let i = 0; i < LV.length; i++) {
          const L = LV[i];
          if (i > 0) {
            const Pv = LV[i - 1];
            pass(R.down, L.a.f, L.w, L.h);
            gl.bindTexture(gl.TEXTURE_2D, Pv.a.t);
            gl.uniform1i(R.down.u.u_src, 0); gl.uniform2f(R.down.u.u_tx, 0.5 / Pv.w, 0.5 / Pv.h);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
          }
          pass(R.blur, L.b.f, L.w, L.h);
          gl.bindTexture(gl.TEXTURE_2D, L.a.t);
          gl.uniform1i(R.blur.u.u_src, 0); gl.uniform2f(R.blur.u.u_dir, 1 / L.w, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          pass(R.blur, L.a.f, L.w, L.h);
          gl.bindTexture(gl.TEXTURE_2D, L.b.t);
          gl.uniform2f(R.blur.u.u_dir, 0, 1 / L.h);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }
      pass(R.final, null, outW, outH);
      const u = R.final.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.scene);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, LV[0].a.t);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, LV[1].a.t);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, LV[2].a.t);
      gl.uniform1i(u.u_scene, 0); gl.uniform1i(u.u_b1, 1); gl.uniform1i(u.u_b2, 2); gl.uniform1i(u.u_b3, 3);
      gl.uniform2f(u.u_res, outW, outH);
      const z = 1 + 2 * (post.shakeAmp || 0) / W;
      gl.uniform4f(u.u_shake, -(post.shakeXY[0] / W), post.shakeXY[1] / H, z, 0);
      const f = post.flash || [0, 0, 0, 0];
      gl.uniform4f(u.u_flash, f[0], f[1], f[2], f[3]);
      const tn = post.tint || [1, 1, 1, 0];
      gl.uniform4f(u.u_tint, tn[0], tn[1], tn[2], tn[3]);
      gl.uniform1f(u.u_bloom, post.bloom > 0.01 ? post.bloom : 0);
      gl.uniform1f(u.u_grain, post.grain); gl.uniform1f(u.u_vig, post.vignette); gl.uniform1f(u.u_ca, post.ca);
      gl.uniform1f(u.u_scan, post.scan); gl.uniform1f(u.u_black, post.blackout);
      gl.uniform1f(u.u_time, t % 1000); gl.uniform1f(u.u_seed, (Math.floor(t * 24) % 977) * 1.618);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      return true;
    };
    try { R.setup(); } catch (e) { console.warn('[NS] WebGL2 post disabled: ' + e.message); return null; }
    return R;
  }

  // ---- DOM ---------------------------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  let dom = null;
  function getDom() {
    if (dom) return dom;
    let stage = $('stage');
    if (!stage) {   // a bare harness page: build a minimal stage
      stage = document.createElement('div'); stage.id = 'stage'; stage.className = 'stage';
      stage.innerHTML = '<div class="box" id="box"><div class="frame" id="frame"><canvas id="view-gl"></canvas><canvas id="view-2d"></canvas></div><div class="shelf" id="shelf"></div><canvas id="overlay"></canvas></div>';
      document.body.appendChild(stage);
    }
    dom = {
      body: document.body, stage, box: $('box'), frame: $('frame'), shelf: $('shelf'),
      vgl: $('view-gl'), v2d: $('view-2d'), ov: $('overlay'),
      gate: $('gate'), gatePlay: $('gate-play'), gateReduce: $('gate-reduce'), gateNight: $('gate-night'), gateWarn: $('gate-warn'), gateReduceLabel: $('gate-reduce-label'),
      tpPlay: $('tp-play'), tpRange: $('tp-range'), tpFill: $('tp-fill'), tpTicks: $('tp-ticks'), tpCur: $('tp-cur'), tpDur: $('tp-dur'),
      tpSec: $('tp-sec'), tpReduce: $('tp-reduce'), tpFs: $('tp-fs'), tpHover: $('tp-hover'), tpScrub: $('tp-scrub'),
      note: $('note'), endcard: $('endcard'), endNight: $('end-night'), endPlay: $('end-play'), fsExit: $('fs-exit'),
    };
    return dom;
  }

  // ---- views and sizing ----------------------------------------------------------------------------------
  const view = { cssW: W, cssH: H, shelfH: 0, shelf: false, dpr: 1, odpr: 1, glr: null, glLost: false, v2ctx: null, octx: null };
  const live = { scene: null, sctx: null, w: 0, h: 0, tmps: [] };
  function liveTmp(i, tw, th) {
    let s = live.tmps[i];
    tw = tw || live.w; th = th || live.h;
    if (s && s.canvas.width === tw && s.canvas.height === th) return s;
    if (s) NS.freeCanvas(s.canvas);
    const c = NS.makeCanvas(tw, th, 'engine');
    s = live.tmps[i] = { canvas: c, ctx: c.getContext('2d') };
    return s;
  }
  function ensureLiveCanvas() {
    const w = Math.round(W * curQ), h = Math.round(H * curQ);
    if (live.scene && live.w === w && live.h === h) return;
    if (live.scene) NS.freeCanvas(live.scene);
    live.tmps.forEach((s) => s && NS.freeCanvas(s.canvas)); live.tmps = [];
    live.scene = NS.makeCanvas(w, h, 'engine');
    live.sctx = live.scene.getContext('2d', { alpha: false });
    live.w = w; live.h = h;
  }
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || document.body.classList.contains('pseudo-fs');
  function layoutStage() {
    const d = getDom();
    const fs = isFs();
    const sw = d.stage.clientWidth || window.innerWidth;
    const sh = fs ? (d.stage.clientHeight || window.innerHeight) : Infinity;
    const portrait = window.innerHeight > window.innerWidth;
    let fw = sw, shelf = fw < 640 && portrait && !STILL_NO_SHELF;
    let k = shelf ? 1.3 : 1;
    if (fw * 9 / 16 * k > sh) { fw = sh / k * 16 / 9; shelf = fw < 640 && portrait && !STILL_NO_SHELF; k = shelf ? 1.3 : 1; }
    fw = Math.floor(fw);
    const fh = Math.round(fw * 9 / 16), shH = shelf ? Math.round(fh * 0.3) : 0;
    view.cssW = fw; view.cssH = fh; view.shelfH = shH; view.shelf = shelf;
    d.stage.classList.toggle('has-shelf', shelf);
    if (d.box) { d.box.style.width = fw + 'px'; d.box.style.height = (fh + shH) + 'px'; }
    if (d.frame) d.frame.style.height = fh + 'px';
    if (d.shelf) d.shelf.style.height = shH + 'px';
    const dpr = window.devicePixelRatio || 1;
    view.dpr = STILL ? dpr : Math.min(dpr, 2, 2560 / Math.max(1, fw));
    view.odpr = STILL ? dpr : Math.min(dpr, 2.5, 4096 / Math.max(1, fw));
    const vw = Math.max(2, Math.round(fw * view.dpr)), vh = Math.max(2, Math.round(fh * view.dpr));
    [d.vgl, d.v2d].forEach((c) => { if (c && (c.width !== vw || c.height !== vh)) { if (c !== d.vgl || !view.glr) { c.width = vw; c.height = vh; } } });
    if (d.ov) {
      const ow = Math.max(2, Math.round(fw * view.odpr)), oh = Math.max(2, Math.round((fh + shH) * view.odpr));
      if (d.ov.width !== ow || d.ov.height !== oh) { d.ov.width = ow; d.ov.height = oh; }
    }
    // display cap on the internal quality: no point rendering far above the device pixels
    const devW = fw * dpr;
    qCap = devW >= 1100 ? 1 : devW >= 800 ? 0.75 : 0.5;
    if (Q_FIXED == null && !playing) curQ = Math.min(Q_STEPS[qi], qCap);   // while playing: at the next cue boundary
    dirty = true;
  }
  const STILL_NO_SHELF = false;
  function setupViews() {
    const d = getDom();
    view.v2ctx = d.v2d ? d.v2d.getContext('2d', { alpha: false }) : null;
    view.octx = d.ov ? d.ov.getContext('2d') : null;
    if (GL_WANTED && d.vgl) {
      view.glr = createGL(d.vgl);
      d.vgl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); view.glLost = true; showView(); dirty = true; }, false);
      d.vgl.addEventListener('webglcontextrestored', () => {
        try { view.glr && view.glr.setup(); view.glLost = false; } catch (e) { console.warn('[NS] WebGL restore failed: ' + e.message); }
        showView(); dirty = true;
      }, false);
    }
    showView();
  }
  const usingGL = () => !!(view.glr && view.glr.ok && !view.glLost);
  function showView() {
    const d = getDom();
    const g = usingGL();
    if (d.vgl) d.vgl.hidden = !g;
    if (d.v2d) d.v2d.hidden = g;
    if (d.stage) d.stage.dataset.post = g ? 'gl' : '2d';
  }

  // ---- the live render --------------------------------------------------------------------------------------
  let dirty = true, lastS = null, lastPost = null, overlayEnabled = OVERLAY_ON;
  const timing = { draw: 0, post: 0, overlay: 0, total: 0 };
  let recording = null;
  function liveOpts() {
    return {
      still: STILL, lod: lodNow(), q: curQ, shelf: { y: H, h: view.shelf ? Math.round(H * 0.3) : 0 },
      cssScale: view.cssW / W, witching: NS.witching, reduced, now: nowDate(),
    };
  }
  function renderLive(t, o) {
    o = o || {};
    const d = getDom();
    const tA = performance.now();
    ensureLiveCanvas();
    const tgt = { ctx: live.sctx, w: live.w, h: live.h, bs: live.w / W, bx: 0, by: 0, opts: liveOpts(), allowTrans: o.trans !== false, tmp: liveTmp };
    const res = composeScene(t, tgt);
    const S = res.S;
    const post = finalizePost(res.post, t, S, !STILL);
    S.shakeXY = post.shakeXY;
    const tB = performance.now();
    const vw = Math.max(2, Math.round(view.cssW * view.dpr)), vh = Math.max(2, Math.round(view.cssH * view.dpr));
    let ok = false;
    if (usingGL()) {
      try { ok = view.glr.render(live.scene, post, t, vw, vh); } catch (e) { report('gl.render', e); ok = false; }
      if (!ok && !view.glLost) { view.glr.ok = false; showView(); }
    }
    if (!ok && view.v2ctx) {
      if (d.v2d.width !== vw || d.v2d.height !== vh) { d.v2d.width = vw; d.v2d.height = vh; }
      post2D(view.v2ctx, live.scene, vw, vh, post, t, { shake: true });
    }
    const tC = performance.now();
    if (view.octx) {
      const oc = view.octx, ov = d.ov;
      oc.setTransform(1, 0, 0, 1, 0, 0);
      oc.clearRect(0, 0, ov.width, ov.height);
      const show = o.overlay != null ? o.overlay : overlayEnabled;
      if (show && NS.overlay && typeof NS.overlay.draw === 'function') {
        const os = ov.width / W;
        oc.save();
        oc.setTransform(os, 0, 0, os, 0, 0);
        try { DEV_ALL ? trapped('overlay', () => NS.overlay.draw(oc, S)) : NS.overlay.draw(oc, S); } catch (e) { report('overlay.draw', e); }
        oc.restore();
      }
    }
    const tD = performance.now();
    timing.draw = tB - tA; timing.post = tC - tB; timing.overlay = tD - tC; timing.total = tD - tA;
    lastS = S; lastPost = post;
    if (recording) recording.push([t, 0, timing.draw, timing.post, timing.overlay, S.cueIndex]);
    return S;
  }

  // ---- renderStill: any frame into a new canvas, without touching the live view ---------------------------
  const stillC = { scene: null, sctx: null, w: 0, h: 0, tmps: [] };
  function stillTmp(i, tw, th) {
    let s = stillC.tmps[i];
    tw = tw || stillC.w; th = th || stillC.h;
    if (s && s.canvas.width === tw && s.canvas.height === th) return s;
    if (s) NS.freeCanvas(s.canvas);
    const c = NS.makeCanvas(tw, th, 'engine');
    s = stillC.tmps[i] = { canvas: c, ctx: c.getContext('2d') };
    return s;
  }
  function resolveRect(rect, t, witch, red) {
    if (Array.isArray(rect) && validRect(rect)) return rect.slice(0, 4).map(Number);
    if (typeof rect === 'function') {
      const cue = CUES[cueIndexAt(t)];
      const S = cueState(frameBase(t, { still: true, lod: 1, q: 1, shelf: { y: H, h: 0 }, cssScale: 1, witching: witch, reduced: red, now: nowDate() }), cue, null);
      try { const r = trapped('clue rect', () => rect(S)); if (validRect(r)) return r.slice(0, 4).map(Number); } catch (e) { report('renderStill rect', e); }
    }
    return [0, 0, W, H];
  }
  NS.renderStill = function (t, o) {
    o = o || {};
    t = clamp(+t || 0, 0, END);
    const witch = o.witching != null ? !!o.witching : NS.witching;
    const red = o.reduced != null ? !!o.reduced : reduced;
    const saveW = NS.witching, saveR = NS.reduced;
    NS.witching = witch; NS.reduced = red;
    try {
      const r = resolveRect(o.rect, t, witch, red);
      const ow = Math.max(1, Math.round(o.w || 640));
      const oh = Math.max(1, Math.round(o.h || ow * r[3] / r[2]));
      const sc = Math.max(ow / r[2], oh / r[3]);
      const bx = (ow - r[2] * sc) / 2 - r[0] * sc, by = (oh - r[3] * sc) / 2 - r[1] * sc;
      if (!stillC.scene || stillC.w !== ow || stillC.h !== oh) {
        if (stillC.scene) NS.freeCanvas(stillC.scene);
        stillC.tmps.forEach((s) => s && NS.freeCanvas(s.canvas)); stillC.tmps = [];
        stillC.scene = NS.makeCanvas(ow, oh, 'engine'); stillC.sctx = stillC.scene.getContext('2d', { alpha: false });
        stillC.w = ow; stillC.h = oh;
      }
      const tr = o.trans ? transAt(t) : null;
      const names = tr ? [tr.out.shot, tr.inn.shot] : [CUES[cueIndexAt(t)].shot];
      const nowMs = performance.now();
      names.forEach((n) => { stillUse[n] = nowMs; if (NS.shots[n]) ensureWarm(n); });
      const opts = { still: true, lod: 1, q: Math.min(1, sc), shelf: { y: H, h: 0 }, cssScale: sc, witching: witch, reduced: red, now: nowDate() };
      const tgt = { ctx: stillC.sctx, w: ow, h: oh, bs: sc, bx, by, opts, allowTrans: !!o.trans, tmp: stillTmp };
      const res = composeScene(t, tgt);
      const S = res.S;
      const post = finalizePost(res.post, t, S, false);
      if (o.rect) { post.shakeAmp = 0; post.shakeXY = [0, 0]; }
      S.shakeXY = post.shakeXY;
      const out = NS.makeCanvas(ow, oh, o.tag || 'still');
      const octx = out.getContext('2d');
      if (o.post === false) octx.drawImage(stillC.scene, 0, 0);
      else post2D(octx, stillC.scene, ow, oh, post, t, { shake: !o.rect });
      if (o.overlay && NS.overlay && typeof NS.overlay.draw === 'function') {
        octx.save();
        octx.setTransform(sc, 0, 0, sc, bx, by);
        try { DEV_ALL ? trapped('overlay', () => NS.overlay.draw(octx, S)) : NS.overlay.draw(octx, S); } catch (e) { report('overlay.draw (still)', e); }
        octx.restore();
      }
      return out;
    } finally { NS.witching = saveW; NS.reduced = saveR; }
  };

  // ---- clock, transport ---------------------------------------------------------------------------------
  const listeners = {};
  function on(ev, fn) { (listeners[ev] || (listeners[ev] = new Set())).add(fn); return () => off(ev, fn); }
  function off(ev, fn) { if (listeners[ev]) listeners[ev].delete(fn); }
  function emit(ev, a, b) { if (!listeners[ev]) return; listeners[ev].forEach((fn) => { try { fn(a, b); } catch (e) { report('listener ' + ev, e); } }); }

  let playing = false, ended = false, booted = false, gated = !STILL && !END_PARAM && !AUTOPLAY;
  let audioOk = !STILL, audio = null, muted = MUTE, noteTimer = 0;
  const clk = { t: START_T, perf: performance.now(), mode: 'silent', lastA: -1, lastAPerf: 0, wait: false, waitA: 0, waitSince: 0 };
  // After play() or a seek the picture holds until the audio position starts moving (at most 1.5 s), so a slow
  // start never makes the picture run ahead and snap back.
  function holdForAudio() { if (audio && audioOk) { clk.wait = true; clk.waitA = audio.currentTime; clk.waitSince = performance.now(); } }
  if (!STILL) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.muted = muted;
    audio.addEventListener('error', () => {
      if (!audioOk) return;
      audioOk = false;
      if (playing) { clk.mode = 'silent'; clk.perf = performance.now(); clk.wait = false; }
      if (gated) pendingNote = 'Soundtrack not found: the picture plays silently.';
      else showNote('Soundtrack not found: the picture plays silently.', 9000);
    });
    audio.addEventListener('ended', () => { if (playing) finish(); });
    audio.addEventListener('pause', () => { if (playing && clk.mode === 'audio' && !audio.ended && !internalPause) pause(); });
    audio.src = 'keep-them-dancing.mp3';
  }
  let internalPause = false, pendingNote = '';
  function clockNow(nowMs) {
    if (!playing) { clk.perf = nowMs; return clk.t; }
    const dt = Math.max(0, Math.min(0.25, (nowMs - clk.perf) / 1000));
    clk.perf = nowMs;
    if (clk.mode !== 'audio' || !audioOk) { clk.t += dt; return clk.t; }
    const a = audio.currentTime;
    if (clk.wait) {
      if (a !== clk.waitA || nowMs - clk.waitSince > 1500) { clk.wait = false; clk.lastA = a; clk.lastAPerf = nowMs; clk.t = a !== clk.waitA ? a : clk.t; }
      return clk.t;
    }
    if (a !== clk.lastA) { clk.lastA = a; clk.lastAPerf = nowMs; }
    if (clk.lastA < 0) { clk.t += dt; return clk.t; }
    const pred = clk.lastA + Math.min(0.25, (nowMs - clk.lastAPerf) / 1000);
    clk.t += dt;
    const err = pred - clk.t;
    if (Math.abs(err) > 0.15) clk.t = pred; else clk.t += err * 0.12;
    return clk.t;
  }
  function ensureAudioCtx() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!E.audioCtx) E.audioCtx = new AC();
      if (E.audioCtx.state === 'suspended') E.audioCtx.resume().catch(() => {});
    } catch (e) { /* no Web Audio: the board copes */ }
  }
  function hideGate() {
    if (!gated) return;
    gated = false;
    const d = getDom();
    document.body.classList.remove('gated');
    if (d.gate) { d.gate.classList.add('gone'); setTimeout(() => { d.gate.hidden = true; }, 450); }
    requestAnimationFrame(() => { layoutStage(); });
  }
  function play() {
    if (STILL) return;
    const d = getDom();
    if (d.endcard) d.endcard.hidden = true;
    if (ended || clk.t >= END - 0.02) { clk.t = 0; ended = false; }
    hideGate();
    playing = true; ended = false;
    clk.perf = performance.now(); clk.lastA = -1;
    if (audioOk && audio) {
      try { if (Math.abs(audio.currentTime - clk.t) > 0.05) audio.currentTime = clk.t; } catch (e) { /* not seekable yet */ }
      clk.mode = 'audio';
      holdForAudio();
      let pr = null;
      try { pr = audio.play(); } catch (e) { pr = Promise.reject(e); }
      if (pr && pr.catch) pr.catch((e) => {
        if (!playing || clk.mode !== 'audio') return;
        clk.mode = 'silent'; clk.perf = performance.now(); clk.wait = false;
        if (e && e.name === 'NotAllowedError') showNote('Sound is blocked here: press play again to hear it.', 7000);
        else { audioOk = false; showNote('Soundtrack unavailable: the picture plays silently.', 9000); }
      });
    } else clk.mode = 'silent';
    ensureAudioCtx();
    if (pendingNote) { showNote(pendingNote, 9000); pendingNote = ''; }
    emit('play');
    dirty = true;
    startLoop();
    updateUI(true);
  }
  function pause() {
    if (!playing) return;
    playing = false;
    if (audio && !audio.paused) { internalPause = true; try { audio.pause(); } catch (e) { /* ignore */ } internalPause = false; }
    emit('pause');
    dirty = true;
    updateUI(true);
  }
  function toggle() { if (playing) pause(); else play(); }
  function seek(t) {
    t = clamp(+t || 0, 0, END);
    clk.t = t; clk.lastA = -1; clk.perf = performance.now();
    if (t < END - 0.02) ended = false;
    if (audio && audioOk) { try { audio.currentTime = t; } catch (e) { /* ignore */ } if (playing) holdForAudio(); }
    lim.last = -1e9;
    const d = getDom();
    if (d.endcard && t < END - 0.02) d.endcard.hidden = true;
    dirty = true;
    emit('seek', t);
    updateUI(true);
  }
  function finish() {
    clk.t = END;
    playing = false; ended = true;
    renderLive(END - 1e-3);
    emit('end');
    updateUI(true);
    openBoard('end');
  }
  const boardOpen = () => !!(NS.board && NS.board.isOpen);
  let endTimer = 0;
  function openBoard(reason) {
    const d = getDom();
    if (isFs()) fullscreen(false);   // the board lives outside the stage: leave full screen first
    if (NS.board && typeof NS.board.open === 'function') {
      try { NS.board.open({ reason }); return; } catch (e) { report('board.open', e); }
    }
    if (d.endcard) {
      const card = (SCORE.cards || []).find((c) => c.type === 'end');
      const lines = (card && card.lines) || ['NIGHT {night} · NO SURVIVORS', 'NIGHT {next} BEGINS IN {countdown}'];
      const next = document.getElementById('end-next');
      const fillEnd = () => {
        if (d.endNight) d.endNight.textContent = NS.fill(lines[0]);
        if (next) next.textContent = lines[1] ? NS.fill(lines[1]) : '';
      };
      fillEnd();
      clearInterval(endTimer);
      endTimer = setInterval(() => { if (d.endcard.hidden) clearInterval(endTimer); else fillEnd(); }, 1000);
      d.endcard.hidden = false;
    }
  }
  function showNote(text, ms) {
    const d = getDom();
    if (!d.note) return;
    d.note.textContent = text;
    d.note.hidden = false;
    d.note.classList.add('show');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { d.note.classList.remove('show'); setTimeout(() => { d.note.hidden = true; }, 500); }, ms || 6000);
  }
  function setReduced(v) {
    reduced = !!v; NS.reduced = reduced;
    try { localStorage.setItem('ns.reduceFlashing', reduced ? '1' : '0'); } catch (e) { /* private mode */ }
    const d = getDom();
    if (d.gateReduce) d.gateReduce.checked = reduced;
    if (d.tpReduce) { d.tpReduce.setAttribute('aria-pressed', reduced ? 'true' : 'false'); d.tpReduce.classList.toggle('on', reduced); }
    dirty = true;
  }
  function setMuted(v) { muted = !!v; if (audio) audio.muted = muted; }

  // ---- adaptive quality: steps 1 / 0.75 / 0.5, decided only at cue boundaries ---------------------------
  const pf = { cue: -1, sum: 0, n: 0, cost: 0, good: 0, last: 0 };
  function adapt(now, t, natural) {
    const dt = now - pf.last; pf.last = now;
    const ci = cueIndexAt(t);
    if (ci !== pf.cue) {
      if (Q_FIXED == null && natural && pf.cue >= 0 && ci === pf.cue + 1 && pf.n > 30) {
        const avg = pf.sum / pf.n, cost = pf.cost / pf.n;
        if (avg > 26 && qi < 2) { qi++; pf.good = 0; }
        else if (avg < 18.5 && cost < 8 && qi > 0) { if (++pf.good >= 2) { qi--; pf.good = 0; } }
        else pf.good = 0;
      }
      curQ = Q_FIXED != null ? Q_FIXED : Math.min(Q_STEPS[qi], qCap);
      pf.cue = ci; pf.sum = 0; pf.n = 0; pf.cost = 0;
    } else if (playing && dt > 0 && dt < 250) { pf.sum += dt; pf.n++; pf.cost += timing.total; }
  }

  // ---- the loop ------------------------------------------------------------------------------------------
  let raf = 0, wasBoard = false, lastUI = 0, seeked = false;
  function startLoop() { if (!raf && !STILL && !document.hidden) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    if (document.hidden) return;
    raf = requestAnimationFrame(tick);
    if (!booted) return;
    const bo = boardOpen();
    if (bo) { wasBoard = true; return; }
    if (wasBoard) { wasBoard = false; dirty = true; layoutStage(); }
    const prevT = clk.t;
    const t = clockNow(now);
    if (playing && t >= END) { finish(); return; }
    if (playing || dirty) {
      const tt = clamp(t, 0, END);
      manageWarm(tt);
      adapt(now, tt, playing && !dirty && tt >= prevT && tt - prevT < 0.5);
      const S = renderLive(tt);
      if (recording && recording.length) recording[recording.length - 1][1] = now;
      dirty = false;
      emit('frame', tt, S);
    }
    if (now - lastUI > 66) { lastUI = now; updateUI(false); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
    else { clk.perf = performance.now(); clk.lastA = -1; dirty = true; startLoop(); }
  });
  setInterval(() => { if (booted && !STILL && (boardOpen() || document.hidden)) manageWarm(clk.t); }, 1000);

  // ---- transport UI -----------------------------------------------------------------------------------------
  let scrubbing = false, lastSec = '', lastCur = '';
  function updateUI(force) {
    const d = getDom();
    const t = clamp(clk.t, 0, END);
    if (d.tpRange && !scrubbing) d.tpRange.value = t.toFixed(2);
    if (d.tpFill) d.tpFill.style.width = (100 * t / END).toFixed(3) + '%';
    const cur = fmtClock(t, false);
    if (d.tpCur && (force || cur !== lastCur)) { d.tpCur.textContent = cur; lastCur = cur; }
    const s = sectionAt(t);
    const lab = s ? s.label + ' · bar ' + Math.min(NS.BARS - 1, Math.floor(t / BAR + EPS)) : '';
    if (d.tpSec && (force || lab !== lastSec)) { d.tpSec.textContent = lab; lastSec = lab; }
    if (d.tpPlay) {
      d.tpPlay.classList.toggle('is-playing', playing);
      d.tpPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      d.tpPlay.title = (playing ? 'Pause' : 'Play') + ' (Space)';
    }
    if (d.tpRange) d.tpRange.setAttribute('aria-valuetext', cur + ', ' + (s ? s.label : ''));
  }
  function stepBar(dir) {
    const b = clk.t / BAR;
    const nb = dir > 0 ? Math.floor(b + 1e-6) + 1 : Math.ceil(b - 1e-6) - 1;
    seek(clamp(nb, 0, NS.BARS) * BAR);
  }
  function stepSection(dir) {
    if (!SECTIONS.length) return;
    const i = Math.max(0, lastLE(SEC_T0, clk.t + EPS));
    if (dir > 0) { if (SECTIONS[i + 1]) seek(SECTIONS[i + 1].t0); }
    else seek(clk.t - SECTIONS[i].t0 > BAR * 0.5 || i === 0 ? SECTIONS[i].t0 : SECTIONS[i - 1].t0);
  }
  function fullscreen(want) {
    const d = getDom();
    const cur = isFs();
    if (want == null) want = !cur;
    if (want === cur) return;
    const el = d.stage;
    if (want) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        try {
          const pr = req.call(el);
          if (pr && pr.catch) pr.catch(() => { document.body.classList.add('pseudo-fs'); layoutStage(); });
        } catch (e) { document.body.classList.add('pseudo-fs'); }
      } else document.body.classList.add('pseudo-fs');
    } else {
      if (document.body.classList.contains('pseudo-fs')) document.body.classList.remove('pseudo-fs');
      else { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) try { const pr = ex.call(document); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ } }
    }
    setTimeout(layoutStage, 60);
  }
  function wireUI() {
    const d = getDom();
    if (d.tpDur) d.tpDur.textContent = fmtClock(END, false);
    if (d.tpRange) {
      d.tpRange.max = String(END);
      d.tpRange.addEventListener('pointerdown', () => { scrubbing = true; });
      window.addEventListener('pointerup', () => { if (scrubbing) { scrubbing = false; updateUI(true); } });
      d.tpRange.addEventListener('input', () => { seek(+d.tpRange.value); });
      d.tpRange.addEventListener('change', () => { scrubbing = false; });
      d.tpRange.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); stepBar(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); stepBar(-1); }
        else if (e.key === 'PageUp') { e.preventDefault(); stepSection(1); }
        else if (e.key === 'PageDown') { e.preventDefault(); stepSection(-1); }
        else if (e.key === 'Home') { e.preventDefault(); seek(0); }
        else if (e.key === 'End') { e.preventDefault(); seek(END - 0.05); }
      });
    }
    if (d.tpTicks && !d.tpTicks.childElementCount) {
      SECTIONS.forEach((s, i) => {
        if (i === 0) return;
        const el = document.createElement('i');
        el.style.left = (100 * s.t0 / END) + '%';
        el.className = /chorus/.test(s.id) ? 'major' : '';
        d.tpTicks.appendChild(el);
      });
    }
    if (d.tpScrub && d.tpHover) {
      d.tpScrub.addEventListener('pointermove', (e) => {
        const r = d.tpScrub.getBoundingClientRect();
        const k = clamp((e.clientX - r.left) / r.width), t = k * END, s = sectionAt(t);
        d.tpHover.textContent = (s ? s.label + ' · ' : '') + fmtClock(t, false);
        d.tpHover.style.left = (k * 100) + '%';
        d.tpHover.classList.add('show');
      });
      d.tpScrub.addEventListener('pointerleave', () => d.tpHover.classList.remove('show'));
    }
    if (d.tpPlay) d.tpPlay.addEventListener('click', () => toggle());
    if (d.tpReduce) d.tpReduce.addEventListener('click', () => setReduced(!reduced));
    if (d.tpFs) d.tpFs.addEventListener('click', () => fullscreen());
    if (d.fsExit) d.fsExit.addEventListener('click', (e) => { e.stopPropagation(); fullscreen(false); });
    if (d.gateReduce) d.gateReduce.addEventListener('change', () => setReduced(d.gateReduce.checked));
    if (d.gatePlay) d.gatePlay.addEventListener('click', () => play());
    if (d.endPlay) d.endPlay.addEventListener('click', () => { seek(0); play(); });
    if (d.frame) d.frame.addEventListener('click', () => { if (!gated) toggle(); });
    let hideT = 0;
    const showUi = () => {
      if (!isFs()) return;
      d.stage.classList.add('ui-show'); clearTimeout(hideT);
      hideT = setTimeout(() => d.stage.classList.remove('ui-show'), 2600);
    };
    d.stage.addEventListener('pointermove', showUi);
    d.stage.addEventListener('pointerdown', showUi);
    document.addEventListener('fullscreenchange', () => { d.stage.classList.toggle('is-fs', isFs()); setTimeout(layoutStage, 30); });
    document.addEventListener('webkitfullscreenchange', () => { d.stage.classList.toggle('is-fs', isFs()); setTimeout(layoutStage, 30); });
    if (window.ResizeObserver) new ResizeObserver(() => layoutStage()).observe(d.stage);
    window.addEventListener('resize', () => layoutStage());
    document.addEventListener('keydown', onKey);
    if (d.gateNight) {
      const g = (SCORE.texts && SCORE.texts.gate) || {};
      let lastGate = '';
      const fillGate = () => {
        const txt = NS.fill(NS.witching ? (g.witching || 'NIGHT {night} · LIVE NOW') : (g.normal || 'NIGHT {night} · DOORS 3:00 AM'));
        if (txt === lastGate) return;
        lastGate = txt;
        d.gateNight.textContent = '';
        txt.split(' · ').forEach((part, i) => {   // each phrase stays on one line; wrapping happens between them
          if (i) { const dot = document.createElement('i'); dot.textContent = '·'; dot.setAttribute('aria-hidden', 'true'); d.gateNight.appendChild(dot); }
          const sp = document.createElement('span'); sp.textContent = part; d.gateNight.appendChild(sp);
        });
        d.gateNight.setAttribute('aria-label', txt);
      };
      fillGate();
      if (!STILL) setInterval(() => { if (gated) fillGate(); }, 1000);
    }
    if (d.gateWarn && SCORE.warning && SCORE.warning.text) d.gateWarn.textContent = SCORE.warning.text;
    if (d.gateReduceLabel && SCORE.warning && SCORE.warning.reduce) d.gateReduceLabel.textContent = SCORE.warning.reduce;
    setReduced(reduced);
  }
  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || STILL) return;
    if (boardOpen()) return;
    const tg = e.target || {};
    const tag = (tg.tagName || '').toUpperCase();
    if ((tag === 'INPUT' && tg.type !== 'range' && tg.type !== 'checkbox') || tag === 'TEXTAREA' || tag === 'SELECT' || tg.isContentEditable) return;
    const k = e.key;
    if ((k === ' ' || k === 'Enter') && (tag === 'BUTTON' || tag === 'A' || (tag === 'INPUT' && tg.type === 'checkbox'))) return;   // let the control handle it
    if (gated) { if (k === ' ' || k === 'Enter') { e.preventDefault(); play(); } return; }
    if (tag === 'INPUT' && tg.type === 'range' && /Arrow|Page|Home|End/.test(k)) return;   // handled on the scrubber
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowRight') { e.preventDefault(); stepBar(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); stepBar(-1); }
    else if (k === 'n' || k === 'N') stepSection(1);
    else if (k === 'p' || k === 'P') stepSection(-1);
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'm' || k === 'M') setMuted(!muted);
    else if (k === 'Escape' && document.body.classList.contains('pseudo-fs')) fullscreen(false);
  }

  // ---- still mode and tools -----------------------------------------------------------------------------------
  function fontsLoaded() { if (!document.fonts || !document.fonts.check) return true; return FAMILIES.every((f) => document.fonts.check("40px '" + f + "'")); }
  function waitFonts(ms) {
    return new Promise((res) => {
      const t0 = performance.now();
      const poll = () => { if (fontsLoaded() || performance.now() - t0 > ms) res(fontsLoaded()); else setTimeout(poll, 40); };
      poll();
    });
  }
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  async function still(t, o) {
    o = o || {};
    t = clamp(+t || 0, 0, END);
    clk.t = t;
    manageWarm(t);
    renderLive(t, { overlay: o.overlay != null ? !!o.overlay : overlayEnabled, trans: o.trans !== false });
    await nextFrame();
    return { t, cue: lastS ? lastS.shot : null, draw: timing.draw, post: timing.post, overlay: timing.overlay, total: timing.total };
  }
  let snap = null;
  function snapshot(o) {
    o = o || {};
    const d = getDom();
    if (!STILL && booted) renderLive(clamp(clk.t, 0, END));   // same task as the copy: no preserveDrawingBuffer needed
    const src = usingGL() ? d.vgl : d.v2d;
    const w = src.width, fh = src.height;
    const sh = view.shelf ? Math.round(fh * 0.3) : 0;
    if (snap) NS.freeCanvas(snap);
    snap = NS.makeCanvas(w, fh + sh, 'snapshot');
    const c = snap.getContext('2d');
    c.fillStyle = NS.C.night0; c.fillRect(0, 0, w, fh + sh);
    c.drawImage(src, 0, 0);
    if (o.overlay !== false && d.ov) c.drawImage(d.ov, 0, 0, w, fh + sh);
    return snap;
  }

  // ---- the public object ------------------------------------------------------------------------------------
  const E = NS.engine = {
    get playing() { return playing; },
    get ended() { return ended; },
    duration: END,
    audioDuration: NS.DURATION,
    time: () => clk.t,
    play, pause, toggle, seek,
    on, off,
    layoutAt(t) {
      t = clamp(+t || 0, 0, END);
      const cue = CUES[cueIndexAt(t)];
      const S = cueState(frameBase(t, liveOpts()), cue, null);
      return layoutFor(S, cue);
    },
    mem: () => NS.mem(),
    audioCtx: null,
    get audio() { return audio; },
    get q() { return curQ; },
    get lod() { return lodNow(); },
    get gl() { return usingGL(); },
    get reduced() { return reduced; },
    setReduced,
    get muted() { return muted; },
    setMuted,
    cues: CUES, sections: SECTIONS,
    cueAt: (t) => CUES[cueIndexAt(t)], cueIndexAt, sectionAt: (t) => sectionAt(t), transAt: (t) => transAt(t),
    fullscreen,
    errors,
    still, snapshot,
    renderStill: (t, o) => NS.renderStill(t, o),
    onsets(kind, name) { if (kind === 'hit') return (HIT[name] || NOHIT).on; if (kind === 'drumAll') return DR[name] ? DR[name].t : new Float64Array(0); return MAIN[name] || new Float64Array(0); },
    stats() { return { q: curQ, lod: lodNow(), gl: usingGL(), timing: Object.assign({}, timing), cue: lastS ? lastS.shot : null, mem: NS.mem(), errors: errors.length, warmed: Array.from(warmed), audio: audioOk ? (clk.mode) : 'missing' }; },
    record(onOff) { recording = onOff ? [] : null; },
    records() { return recording ? recording.slice() : []; },
    manage: manageWarm,
    get lastS() { return lastS; },
    get lastPost() { return lastPost; },
    setOverlay(v) { overlayEnabled = !!v; dirty = true; },
  };

  // ---- boot -----------------------------------------------------------------------------------------------
  function boot() {
    const d = getDom();
    if (STILL) document.body.classList.add('still');
    if (gated) document.body.classList.add('gated');
    else if (d.gate) d.gate.hidden = true;
    setupViews();
    wireUI();
    layoutStage();
    const ready = NS.fontsReady || Promise.resolve(true);
    Promise.resolve(ready).catch(() => null).then(() => {
      Object.keys(NS.shots).forEach((n) => ensureInit(n));
      if (NS.overlay && typeof NS.overlay.init === 'function') { try { NS.overlay.init(envFor('overlay')); } catch (e) { report('overlay.init', e); } }
      booted = true;
      document.body.classList.add('booted');
      if (STILL) {
        still(START_T).then(() => waitFonts(8000)).then((ok) => {
          if (!ok) console.warn('[NS] fonts not all loaded: ' + FAMILIES.filter((f) => !document.fonts.check("40px '" + f + "'")).join(', '));
          return still(START_T);
        }).then(() => { window.NS_READY = true; });
        return;
      }
      clk.t = START_T;
      manageWarm(START_T);
      dirty = true;
      startLoop();
      if (END_PARAM) { clk.t = END; ended = true; updateUI(true); openBoard('param'); }
      else if (AUTOPLAY) play();
      waitFonts(8000).then(() => { dirty = true; window.NS_READY = true; });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
