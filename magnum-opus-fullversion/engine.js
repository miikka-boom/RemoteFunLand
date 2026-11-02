// MAGNUM OPUS engine: timeline, scene shaders, bloom + post, 2D overlay, live playback
// and a deterministic capture API for rendering the MP4.
//
// Everything on screen is a pure function of the time t (seconds, 0..MO.DUR, from
// SCORE.duration). Scenes are fragment shaders registered with MO.scene() (directly, or by
// a shot factory that a cue in SCORE.cues runs); the typography layer is a 2D canvas drawn
// by functions registered with MO.overlay(). See scenes/*.js and overlay.js.
(() => {
  'use strict';
  const S = window.SCORE;
  const BEAT = 60 / S.bpm, BAR = BEAT * S.beatsPerBar, STEP = BEAT / S.stepsPerBeat, DUR = S.duration;
  const params = new URLSearchParams(location.search);

  const MO = window.MO = {
    S, BEAT, BAR, STEP, DUR, params,
    scenes: [], overlays: [], pending: [],
    reduced: false,      // less flashing / motion
    quality: 1,          // scene render scale (live mode adapts it)
    t: 0,
    capture: params.has('capture'),
    lookahead: params.has('lookahead') ? Math.max(0, +params.get('lookahead') || 0) : 10,   // seconds compiled before live playback starts
    compileJobs: Math.max(1, +params.get('bgjobs') || 2),   // background compiles in flight at once
  };

  // ---------------------------------------------------------------- timeline helpers
  MO.beatTime = (b) => b * BEAT;
  MO.barTime = (bar, beat = 0, step = 0) => bar * BAR + beat * BEAT + step * STEP;
  MO.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  MO.mix = (a, b, k) => a + (b - a) * k;
  MO.remap = (x, a, b) => MO.clamp((x - a) / (b - a));
  MO.smooth = (x) => { x = MO.clamp(x); return x * x * (3 - 2 * x); };
  MO.easeOut = (x) => { x = MO.clamp(x); return 1 - Math.pow(1 - x, 3); };
  MO.easeIn = (x) => { x = MO.clamp(x); return x * x * x; };
  MO.easeInOut = (x) => { x = MO.clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  // keyframes: [[t0, v0], [t1, v1], ...] with values numbers or arrays; ease optional per call
  MO.keys = (k, t, ease = MO.smooth) => {
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) {
      if (t < k[i][0]) {
        const a = k[i - 1], b = k[i], u = ease((t - a[0]) / (b[0] - a[0]));
        return Array.isArray(a[1]) ? a[1].map((v, j) => v + (b[1][j] - v) * u) : a[1] + (b[1] - a[1]) * u;
      }
    }
    return k[k.length - 1][1];
  };
  MO.scene = (def) => { MO.scenes.push(def); };
  // shot factories: scene files register MO.shot(id, (cue) => MO.scene({...})); score.js "cues"
  // places them on the timeline (see the cue contract in the full-version notes). Without cues the
  // scene files register their scenes directly, as in the 30 s piece.
  MO.shots = {};
  MO.shot = (id, factory) => { MO.shots[id] = factory; };
  MO.cues = [];
  const cueMode = Array.isArray(S.cues);
  function expandCues(errorFs) {
    if (MO._cuesExpanded || !cueMode) return;
    MO._cuesExpanded = true;
    S.cues.forEach((c, index) => {
      const bpb = S.beatsPerBar;
      const cue = MO.makeCue(c.shot, c.beats ? c.beats[0] : c.bars[0] * bpb, c.beats ? c.beats[1] : c.bars[1] * bpb, c.params, index);
      const f = MO.shots[c.shot];
      if (!f) {
        console.error(`MAGNUM OPUS: no shot factory "${c.shot}" (cue ${index})`);
        MO.scenes.push({ id: `${c.shot}-missing`, fs: errorFs, from: cue.from, to: cue.to, cue });
      } else MO.runShot(cue);
    });
  }
  // a cue object for a shot over [beat0, beat1); used by expandCues and by scene files that place
  // their own shots when the score has no cue list (the 30 s layout)
  MO.makeCue = (shot, beat0, beat1, params = {}, index = MO.cues.length) => {
    const bpb = S.beatsPerBar;
    const cue = { shot, from: beat0 * BEAT, to: beat1 * BEAT, beat0, beat1, bar0: beat0 / bpb, bar1: beat1 / bpb, params: params || {}, index };
    MO.cues.push(cue);
    return cue;
  };
  // run a shot factory for a cue; scenes it registers default to the cue's window and take the
  // cue's generic post knobs (params.grade, params.frame) unless the factory set their own
  MO.runShot = (cue) => {
    const n = MO.scenes.length;
    MO.shots[cue.shot](cue);
    const p = cue.params || {};
    for (let i = n; i < MO.scenes.length; i++) {
      const sc = MO.scenes[i];
      sc.from = sc.from ?? cue.from; sc.to = sc.to ?? cue.to; sc.cue = cue;
      if (!sc.section) { const sec = MO.section(cue.from + 1e-4); sc.section = sec && sec.id; }
      if (sc.grade === undefined && p.grade != null) sc.grade = p.grade;
      if (sc.frame === undefined && p.frame != null) sc.frame = p.frame;
    }
  };
  MO.overlay = (fn) => { MO.overlays.push(fn); };
  MO.waitFor = (p) => { MO.pending.push(p); };
  MO.section = (t) => S.sections.find((s) => t >= s.bars[0] * BAR && t < s.bars[1] * BAR) || S.sections[S.sections.length - 1];

  // ---------------------------------------------------------------- score events
  function parse(rows, vel = 0.8) {
    const out = [];
    rows.forEach((row, bar) => {
      for (let s = 0; s < 16; s++) {
        const c = row[s];
        if (c === 'x' || c === 'X') out.push({ t: MO.barTime(bar, 0, s), v: c === 'X' ? 1 : vel });
        else if (c === 'r') { out.push({ t: MO.barTime(bar, 0, s), v: 0.7 }); out.push({ t: MO.barTime(bar, 0, s + 0.5), v: 0.7 }); }
      }
    });
    return out;
  }
  MO.events = {};
  for (const k in S.drums) MO.events[k] = parse(S.drums[k]);
  MO.events.hits = S.hits.map((h) => ({ t: h.beat * BEAT, v: 1, type: h.type })).sort((a, b) => a.t - b.t);
  MO.events.chakras = S.chakras.map((c, i) => ({ t: c.beat * BEAT, v: 1, i }));
  // last event at or before t (binary search); returns {e, i} or null
  MO.last = (name, t) => {
    const ev = MO.events[name]; let lo = 0, hi = ev.length - 1, best = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (ev[m].t <= t + 1e-6) { best = m; lo = m + 1; } else hi = m - 1; }
    return best < 0 ? null : { e: ev[best], i: best };
  };
  // decaying envelope: velocity * exp(-(t - hit) / decay)
  MO.env = (name, t, decay) => { const l = MO.last(name, t); return l ? l.e.v * Math.exp(-(t - l.e.t) / decay) : 0; };
  MO.count = (name, t) => { const l = MO.last(name, t); return l ? l.i + 1 : 0; };
  MO.energy = (t) => { const b = t / BAR, i = Math.min(S.energy.length - 1, Math.floor(b)), j = Math.min(S.energy.length - 1, i + 1); return MO.mix(S.energy[i], S.energy[j], MO.smooth(b - i)); };
  MO.chordIndex = (t) => Math.min(S.chords.length - 1, Math.floor(t / BAR));
  // words of the rap / hook with absolute times: [{text, t, line, lineIndex}]
  // Lines without `words` (announcer entries, chops) are skipped; an unknown part gives [].
  MO.words = (part) => ((S.vocals && S.vocals[part]) || []).flatMap((line, li) => Array.isArray(line.words) && line.bar != null
    ? line.words.map(([w, step]) => ({ text: w, t: MO.barTime(line.bar, 0, step), line, li })) : []);
  // Shared lookups for shot factories (times in seconds, half-open windows [a, b)).
  // MO.wordsIn(re, a, b, parts): words whose text matches re (RegExp or string, case-insensitive) in [a, b).
  MO.wordsIn = (re, a, b, parts = ['rap', 'hook', 'sung', 'spoken']) => {
    const rx = re instanceof RegExp ? re : new RegExp(re == null ? '' : String(re), 'i');
    return parts.flatMap((p) => MO.words(p)).filter((w) => w.t >= a - 1e-6 && w.t < b - 1e-6 && rx.test(w.text)).sort((x, y) => x.t - y.t);
  };
  // MO.fxIn(type, a, b): score fx entries (type 'flash' | 'impact' | 'shake' | null for all) in [a, b), with t added.
  MO.fxIn = (type, a, b) => (S.fx || []).map((f) => ({ ...f, t: f.beat * BEAT }))
    .filter((f) => (!type || f.type === type) && f.t >= a - 1e-6 && f.t < b - 1e-6).sort((x, y) => x.t - y.t);
  // MO.eventsIn(name, a, b): drum / hits / chakras events of MO.events[name] in [a, b).
  MO.eventsIn = (name, a, b) => (MO.events[name] || []).filter((e) => e.t >= a - 1e-6 && e.t < b - 1e-6);
  // Match-cut constants shared by shots that must line up across a cut (spec risk 8). Scene files add
  // their entries with `MO.MATCH.key = MO.MATCH.key || {...}` and read the others' entries at cue time.
  MO.MATCH = MO.MATCH || {};

  MO.globals = (t) => ({
    uTime: t,
    uBeat: t / BEAT,
    uBar: t / BAR,
    uKick: MO.env('kick', t, 0.12),
    uClap: MO.env('clap', t, 0.16),
    uHat: MO.env('closedHat', t, 0.05),
    uOpenHat: MO.env('openHat', t, 0.11),
    uRoll: MO.env('roll', t, 0.07),
    uCrash: MO.env('hits', t, 0.7),
    uKickN: MO.count('kick', t),
    uClapN: MO.count('clap', t),
    uEnergy: MO.energy(t),
    uChord: MO.chordIndex(t),
    uReduced: MO.reduced ? 1 : 0,
  });

  // post effects from SCORE.fx, plus a gentle kick pump in the high-energy sections
  function fxAt(t) {
    let flash = 0, flashColor = [1, 1, 1], impact = 0, impactPol = 1, shake = 0;
    for (const f of S.fx) {
      const t0 = f.beat * BEAT; if (t < t0) continue;
      const dt = t - t0;
      if (f.type === 'flash') { const a = f.amount * Math.exp(-dt / f.decay); if (a > flash) { flash = a; flashColor = f.color; } }
      else if (f.type === 'impact') { if (dt < f.duration) { impact = 1; impactPol = f.polarity || 1; } }
      else if (f.type === 'shake') shake += f.amount * Math.exp(-dt / f.decay);
    }
    const e = MO.energy(t);
    const pump = e > 0.6 ? MO.env('kick', t, 0.1) * (e - 0.6) * 0.03 : 0;
    if (MO.reduced) { flash *= 0.25; impact = 0; shake *= 0.3; }
    // chromatic aberration follows the shake but is capped so a hit never smears the frame
    return { flash, flashColor, impact, impactPol, shake, zoom: MO.reduced ? pump * 0.3 : pump, ca: 0.5 + Math.min(2.0, 6 * shake * 30) };
  }
  MO.fxAt = fxAt;

  // ---------------------------------------------------------------- generic per-scene post knobs
  // grade: { hue (degrees), saturation, contrast, gain [r,g,b], lift [r,g,b] }, applied to the
  // tone-mapped picture (display-referred, 0..1) before flashes and typography:
  //   c = H(hue) c; c = Sat(saturation) c; c = (c - 0.5) * contrast + 0.5; c *= gain; c = c + lift * (1 - c)
  // frame: { mirrorX, zoom (>= 1), offset [x, y] (fractions of the frame), roll (degrees) }: the
  // camera on the scene layer (scene + bloom, not the typography). Zoom grows by itself so a roll
  // never shows an edge, and the offset is clamped to what the zoom leaves room for.
  // Each value may be a constant or keyframes [[u, v], ...] with u = 0..1 over the cue (the scene's
  // own window without a cue); a whole knob may also be a function (t, local, MO) => object.
  const kv = (v, u) => (Array.isArray(v) && Array.isArray(v[0]) ? MO.keys(v, u) : v);
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? +v : d);
  const vec = (v, n, d) => {
    if (typeof v === 'number' && Number.isFinite(v)) return new Array(n).fill(v);
    if (Array.isArray(v) && v.length >= n) return v.slice(0, n).map((x) => num(x, d));
    return new Array(n).fill(d);
  };
  function knobU(sc, t) {
    const a = sc.cue ? sc.cue.from : sc.from, b = sc.cue ? sc.cue.to : sc.to;
    return b > a ? MO.clamp((t - a) / (b - a)) : 0;
  }
  const knobDef = (def, sc, t) => (typeof def === 'function' ? def(t, t - sc.from, MO) : def);
  // CSS filter matrices (Rec. 709 luma weights), row-major
  function hueMat(deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    ];
  }
  function satMat(k) {
    return [
      0.213 + 0.787 * k, 0.715 - 0.715 * k, 0.072 - 0.072 * k,
      0.213 - 0.213 * k, 0.715 + 0.285 * k, 0.072 - 0.072 * k,
      0.213 - 0.213 * k, 0.715 - 0.715 * k, 0.072 + 0.928 * k,
    ];
  }
  // returns { m: mat3 (column-major), o: vec3 } or null for the identity
  MO.gradeAt = function gradeAt(sc, t) {
    const g = knobDef(sc.grade, sc, t);
    if (!g || typeof g !== 'object') return null;
    const u = knobU(sc, t);
    const hue = num(kv(g.hue, u), 0), sat = num(kv(g.saturation, u), 1), con = num(kv(g.contrast, u), 1);
    const gain = vec(kv(g.gain, u), 3, 1), lift = vec(kv(g.lift, u), 3, 0);
    if (hue === 0 && sat === 1 && con === 1 && gain.every((x) => x === 1) && lift.every((x) => x === 0)) return null;
    const H = hueMat(hue), Sm = satMat(sat), P = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) P[i * 3 + j] = Sm[i * 3] * H[j] + Sm[i * 3 + 1] * H[3 + j] + Sm[i * 3 + 2] * H[6 + j];
    const m = new Float32Array(9), o = new Float32Array(3);
    for (let i = 0; i < 3; i++) {
      const s1 = (1 - lift[i]) * gain[i];
      for (let j = 0; j < 3; j++) m[j * 3 + i] = s1 * con * P[i * 3 + j];
      o[i] = s1 * 0.5 * (1 - con) + lift[i];
    }
    return { m, o };
  };
  // returns { l: mat2 (column-major), c: vec2, zoom } or null for the identity; aspect = width / height
  MO.frameAt = function frameAt(sc, t, aspect = 16 / 9) {
    const f = knobDef(sc.frame, sc, t);
    if (!f || typeof f !== 'object') return null;
    const u = knobU(sc, t);
    const mx = num(kv(f.mirrorX, u), 0) > 0.5 ? -1 : 1;
    const roll = MO.clamp(num(kv(f.roll, u), 0), -30, 30) * Math.PI / 180;
    const off = vec(kv(f.offset, u), 2, 0);
    let zoom = Math.max(1, num(kv(f.zoom, u), 1));
    if (mx === 1 && roll === 0 && zoom === 1 && off[0] === 0 && off[1] === 0) return null;
    const c = Math.cos(roll), s = Math.sin(roll), A = aspect;
    // screen offset from the centre -> source offset: mirror * aspect^-1 * R(-roll) * aspect / zoom
    const l1 = [mx * c, mx * s / A, -s * A, c];   // row-major at zoom 1
    const ex1 = 0.5 * (Math.abs(l1[0]) + Math.abs(l1[1])), ey1 = 0.5 * (Math.abs(l1[2]) + Math.abs(l1[3]));
    zoom = Math.max(zoom, 2 * ex1, 2 * ey1);
    const ex = ex1 / zoom, ey = ey1 / zoom;
    const ox = MO.clamp(off[0], -(0.5 - ex), 0.5 - ex), oy = MO.clamp(off[1], -(0.5 - ey), 0.5 - ey);
    return { l: new Float32Array([l1[0] / zoom, l1[2] / zoom, l1[1] / zoom, l1[3] / zoom]), c: new Float32Array([0.5 + ox, 0.5 + oy]), zoom };
  };

  // ---------------------------------------------------------------- WebGL plumbing
  let gl, canvas, hdr = false, quad, W = 1280, H = 720;
  let sceneT = null, bloomLv = [], overlayCanvas, overlayCtx, overlayTex;
  let vsShader = null;
  let ready = false;       // programs and targets exist for the current context
  let warming = false;     // init's pre-warm may render before the engine is ready for the page
  let stale = false;       // GL objects belong to a context that was lost (drop them, don't delete them)
  let initGen = 0;         // a newer MO.init call supersedes an older one still in flight
  let parallel = null;     // KHR_parallel_shader_compile
  const progs = {};
  MO.ready = false;        // live playback can start (the programs near the start point are ready)
  MO.allReady = false;     // every program is compiled and warm
  MO.contextLost = false;
  MO.lastFrame = null;     // { t, id, held, fallback } of the last MO.render
  const overlayErrors = new Set();
  MO.noOverlay = params.has('nooverlay');
  const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const FS_DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uHalf; uniform float uPrefilter, uThreshold, uKnee;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv - uHalf).rgb + texture(uSrc, vUv + uHalf).rgb;
  c += texture(uSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb + texture(uSrc, vUv - vec2(uHalf.x, -uHalf.y)).rgb;
  c /= 8.0;
  if (uPrefilter > 0.5) {
    c = min(c, vec3(60.0));
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); rq = rq * rq / (4.0 * uKnee + 1e-4);
    c *= max(rq, br - uThreshold) / max(br, 1e-4);
  }
  o = vec4(c, 1.0);
}`;
  const FS_UP = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uHalf;
void main() {
  vec2 h = uHalf;
  vec3 c = texture(uSrc, vUv + vec2(-2.0 * h.x, 0.0)).rgb + texture(uSrc, vUv + vec2(2.0 * h.x, 0.0)).rgb
         + texture(uSrc, vUv + vec2(0.0, -2.0 * h.y)).rgb + texture(uSrc, vUv + vec2(0.0, 2.0 * h.y)).rgb
         + 2.0 * (texture(uSrc, vUv + vec2(-h.x, h.y)).rgb + texture(uSrc, vUv + vec2(h.x, h.y)).rgb
         + texture(uSrc, vUv + vec2(h.x, -h.y)).rgb + texture(uSrc, vUv + vec2(-h.x, -h.y)).rgb);
  o = vec4(c / 12.0, 1.0);
}`;
  // uFrameOn / uGradeOn are uniform branches: with both off the result is bit-identical to the
  // pass without the knobs
  const FS_POST = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uOverlay;
uniform vec2 uRes, uShakeOff; uniform vec3 uFlashColor;
uniform float uTime, uBloomStrength, uExposure, uFlash, uImpact, uImpactPol, uCA, uGrain, uVignette, uHasOverlay, uZoom;
uniform float uFrameOn, uGradeOn; uniform mat2 uFrameL; uniform vec2 uFrameC; uniform mat3 uGradeM; uniform vec3 uGradeO;
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = (vUv - 0.5) * (1.0 - uZoom) + 0.5 + uShakeOff;
  vec2 dc = uv - 0.5;
  vec2 off = dc * uCA * 0.012 * dot(dc, dc);
  vec2 su = uv;
  if (uFrameOn > 0.5) { su = uFrameC + uFrameL * dc; off = uFrameL * off; }
  vec3 col = vec3(texture(uScene, su + off).r, texture(uScene, su).g, texture(uScene, su - off).b);
  col += texture(uBloom, su).rgb * uBloomStrength;
  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));
  if (uGradeOn > 0.5) col = clamp(uGradeM * col + uGradeO, 0.0, 1.0);
  // the flash washes the picture but not the typography, so subtitles stay readable through it
  col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
  vec4 ov = texture(uOverlay, vUv) * uHasOverlay;
  col = col * (1.0 - ov.a) + ov.rgb;
  if (uImpact > 0.0) {
    // anime impact frame: two-tone luminance key; polarity -1 keeps light lines on black
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    float k = smoothstep(0.32, 0.42, l);
    if (uImpactPol < 0.0) k = 1.0 - k;
    vec3 imp = mix(vec3(1.0, 0.96, 0.90), vec3(0.05, 0.0, 0.02), k);
    col = mix(col, imp, uImpact);
  }
  col *= 1.0 - uVignette * dot(dc, dc) * 1.5;
  col += (h21(gl_FragCoord.xy + fract(uTime * 7.13) * 413.0) - 0.5) * uGrain;
  o = vec4(col, 1.0);
}`;
  // drawn while a scene's program is still compiling and there is no good frame to hold: a dim
  // glow that keeps the kick, so the picture never goes dead while the music plays
  const FS_FALLBACK = `#version 300 es
precision highp float; out vec4 fragColor;
uniform vec2 uRes; uniform float uKick, uEnergy;
void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  float g = exp(-dot(p, p) * 1.4) * (0.08 + 0.22 * uEnergy) * (0.6 + 0.4 * uKick);
  fragColor = vec4(vec3(1.0, 0.70, 0.36) * g, 1.0);
}`;

  const ERROR_FS = `
void main() {
  vec2 p = gl_FragCoord.xy / uRes.y * 12.0;
  float c = mod(floor(p.x) + floor(p.y), 2.0);
  fragColor = vec4(mix(vec3(0.6, 0.0, 0.5), vec3(0.1, 0.0, 0.1), c), 1.0);
}`;
  // Programs are built in two phases. startProgram() only issues compile + link, without asking
  // for any status, so the driver can work on several programs at once (in parallel where
  // KHR_parallel_shader_compile exists) while the page keeps painting. finishProgram() then
  // reads the result, which blocks only if that program is not done yet.
  const lostError = () => Object.assign(new Error('The WebGL context was lost'), { contextLost: true });
  function shaderLog(s, name, lineOffset) {
    const log = gl.getShaderInfoLog(s) || '';
    return `[shader ${name}] ` + log.replace(/ERROR: 0:(\d+)/g, (m, n) => `ERROR: ${name} line ${Number(n) - lineOffset}`);
  }
  function startProgram(fsSrc, name, lineOffset = 0) {
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
    const p = gl.createProgram();
    gl.attachShader(p, vsShader); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    return { p, fs, name, lineOffset };
  }
  const jobDone = (job) => !parallel || gl.getProgramParameter(job.p, parallel.COMPLETION_STATUS_KHR);
  function finishProgram(job) {
    const { p, fs, name, lineOffset } = job;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (gl.isContextLost()) throw lostError();
      let msg;
      if (!gl.getShaderParameter(vsShader, gl.COMPILE_STATUS)) msg = shaderLog(vsShader, name + ' (vs)', 0);
      else if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) msg = shaderLog(fs, name, lineOffset);
      else msg = `[link ${name}] ${gl.getProgramInfoLog(p)}`;
      gl.deleteProgram(p); gl.deleteShader(fs);
      throw new Error(msg);
    }
    gl.deleteShader(fs);   // flagged only; freed with the program
    return programInfo(p, name);
  }
  function program(fsSrc, name, lineOffset = 0) { return finishProgram(startProgram(fsSrc, name, lineOffset)); }
  function programInfo(p, name) {
    const info = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const u = gl.getActiveUniform(p, i);
      const base = u.name.replace(/\[0\]$/, '');
      info[base] = { loc: gl.getUniformLocation(p, u.name), type: u.type, size: u.size };
    }
    return { p, u: info, name };
  }
  function setUniforms(pr, vals) {
    for (const k in vals) {
      const u = pr.u[k]; if (!u) continue;
      const v = vals[k];
      switch (u.type) {
        case gl.FLOAT: u.size > 1 ? gl.uniform1fv(u.loc, v) : gl.uniform1f(u.loc, v); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, v); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, v); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, v); break;
        case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: u.size > 1 ? gl.uniform1iv(u.loc, v) : gl.uniform1i(u.loc, v); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(u.loc, false, v); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
        default: break;
      }
    }
  }
  // a program shared by several scenes starts each scene from the GL defaults (all zero), as its own
  // program would: a uniform one scene sets never leaks into the next
  function resetUniforms(pr) {
    for (const k in pr.u) {
      const u = pr.u[k], n = u.size;
      switch (u.type) {
        case gl.FLOAT: gl.uniform1fv(u.loc, new Float32Array(n)); break;
        case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, new Float32Array(2 * n)); break;
        case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, new Float32Array(3 * n)); break;
        case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, new Float32Array(4 * n)); break;
        case gl.INT: case gl.BOOL: case gl.SAMPLER_2D: gl.uniform1iv(u.loc, new Int32Array(n)); break;
        case gl.INT_VEC2: case gl.BOOL_VEC2: gl.uniform2iv(u.loc, new Int32Array(2 * n)); break;
        case gl.INT_VEC3: case gl.BOOL_VEC3: gl.uniform3iv(u.loc, new Int32Array(3 * n)); break;
        case gl.INT_VEC4: case gl.BOOL_VEC4: gl.uniform4iv(u.loc, new Int32Array(4 * n)); break;
        case gl.FLOAT_MAT2: gl.uniformMatrix2fv(u.loc, false, new Float32Array(4 * n)); break;
        case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, new Float32Array(9 * n)); break;
        case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, new Float32Array(16 * n)); break;
        default: break;
      }
    }
  }
  let sceneValid = false;  // sceneT holds a frame drawn by a real scene program (a held frame can reuse it)
  function target(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && hdr) { hdr = false; gl.deleteTexture(tex); gl.deleteFramebuffer(fb); return target(w, h); }
    return { tex, fb, w, h };
  }
  function freeTarget(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }

  function buildTargets() {
    const sw = Math.max(64, Math.round(W * MO.quality)), sh = Math.max(36, Math.round(H * MO.quality));
    if (sceneT && sceneT.w === sw && sceneT.h === sh) return;
    freeTarget(sceneT); bloomLv.forEach(freeTarget); bloomLv = [];
    sceneT = target(sw, sh); sceneValid = false;
    let w = sw, h = sh;
    for (let i = 0; i < 6; i++) { w = Math.max(2, w >> 1); h = Math.max(2, h >> 1); bloomLv.push(target(w, h)); }
  }

  function draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); }

  // ---------------------------------------------------------------- programs: dedupe + progressive compile
  // A unit is one compiled program, shared by every scene whose fragment source is byte-identical
  // (the same shot in three choruses compiles once). States: QUEUED -> COMPILING -> LINKED ->
  // READY (warm, drawable). A unit that fails to compile becomes FAILED and draws the warning
  // pattern. Live mode compiles the units near the start point before MO.init resolves and the
  // rest in the background, nearest to the playhead first; capture mode compiles everything.
  const QUEUED = 0, COMPILING = 1, LINKED = 2, READY = 3, FAILED = 4;
  let units = [];
  let warmOn = true;           // live mode draws each program once before first use
  let focusT = 0;              // where compiling should look ahead from (playhead or seek target)
  let bgFence = null;
  let bgPaused = false, bgKick = null;
  let prefix = '';
  const usable = (u) => u.state === READY || u.state === FAILED;
  const stats = { initStart: 0, startupMs: 0, allMs: 0, programs: 0, scenes: 0, startupUnits: 0 };
  function buildUnits() {
    const bySrc = new Map();
    units = [];
    for (const sc of MO.scenes) {
      const src = String(sc.fs);
      let u = bySrc.get(src);
      if (!u) {
        u = { i: units.length, src, scenes: [], spans: [], state: QUEUED, job: null, prog: null, lastScene: null, error: null };
        bySrc.set(src, u); units.push(u);
      }
      u.scenes.push(sc); u.spans.push([sc.from, sc.to]); sc.unit = u; sc.prog = null;
    }
    for (const u of units) u.shared = u.scenes.length > 1;
  }
  // the next time a unit is on screen at or after time t; units only behind t come last, in order
  function nextUse(u, t) {
    let best = Infinity;
    for (const [a, b] of u.spans) if (b > t) best = Math.min(best, Math.max(a, t));
    return best === Infinity ? DUR + u.spans[0][0] : best;
  }
  // units on screen in [t, end of the cue at t + MO.lookahead)
  function neededUnits(t) {
    const sc = MO.sceneAt(t);
    const end = Math.min(DUR, Math.max(t, sc.cue ? sc.cue.to : sc.to) + MO.lookahead);
    const set = new Set([sc.unit]);
    for (const s of MO.scenes) if (s.to > t && s.from < end) set.add(s.unit);
    return [...set].sort((a, b) => nextUse(a, t) - nextUse(b, t));
  }
  function issue(u) {
    const sc = u.scenes[0];
    u.job = startProgram(prefix + u.src, 'scene ' + sc.id + (u.shared ? ` (shared by ${u.scenes.length} scenes)` : ''), 0);
    u.state = COMPILING;
  }
  function errorProgram() {
    if (!progs.error) progs.error = program(window.MO_HEADER + '\n#line 1\n' + ERROR_FS, 'error');
    return progs.error;
  }
  function settle(u) {
    for (const sc of u.scenes) sc.prog = u.prog;
    try { MO.onCompile && MO.onCompile(MO.compileStatus()); } catch (e) { /* page UI only */ }
  }
  function finishUnit(u) {
    try {
      u.prog = finishProgram(u.job);
      u.state = warmOn ? LINKED : READY;
    } catch (e) {
      if (e.contextLost) throw e;
      // one broken scene must not take the whole piece down: log it and draw a warning pattern
      const msg = String(e.message || e);
      console.error(msg);
      u.error = msg;
      for (const sc of u.scenes) { sc.error = msg; sc.uniforms = null; }
      u.prog = errorProgram(); u.state = FAILED;
    }
    u.job = null;
    if (usable(u)) settle(u);
  }
  // Pre-warm: draw a unit once into the smallest bloom target (same format and blend state as the
  // scene pass). Drivers that finish compiling on first use (ANGLE on Metal/D3D, SwiftShader) then
  // do it here instead of at a shot cut.
  function warmDraw(u) {
    buildTargets();
    const sc = u.scenes[0], pr = u.prog;
    const tiny = bloomLv[bloomLv.length - 1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, tiny.fb); gl.viewport(0, 0, tiny.w, tiny.h);
    gl.disable(gl.BLEND);
    gl.useProgram(pr.p);
    if (u.shared && u.lastScene !== sc) resetUniforms(pr);
    u.lastScene = sc;
    const t = Math.min(DUR - 1e-3, sc.from + 0.05);
    const uu = MO.globals(t);
    uu.uRes = [tiny.w, tiny.h]; uu.uLocal = t - sc.from; uu.uDur = sc.to - sc.from;
    setUniforms(pr, uu);
    if (sc.uniforms) { try { setUniforms(pr, sc.uniforms(t, t - sc.from, MO) || {}); } catch (e) { /* reported on first real render */ } }
    draw();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function allDone() {
    if (MO.allReady) return;
    MO.allReady = true;
    stats.allMs = performance.now() - stats.initStart;
    try { MO.onCompile && MO.onCompile(MO.compileStatus()); } catch (e) { /* page UI only */ }
  }
  MO.compileStatus = () => ({
    programs: units.length, ready: units.filter(usable).length, compiling: units.filter((u) => u.state === COMPILING).length,
    scenes: MO.scenes.length, allReady: MO.allReady, startupPrograms: stats.startupUnits,
    startupMs: Math.round(stats.startupMs), allMs: Math.round(stats.allMs), parallel: !!parallel,
  });
  // the page calls this when it seeks: compiling looks ahead from t at once (MO.render does it too)
  MO.prefetch = (t) => { focusT = MO.clamp(+t || 0, 0, DUR); };
  MO.isReadyAt = (t) => { const sc = MO.sceneAt(t); return !!(sc && sc.unit && usable(sc.unit)); };
  // pause the background compile (the page does while the MP4 plays); it picks up where it was
  MO.setBackgroundCompile = (on) => {
    bgPaused = !on;
    if (on && bgKick) { const k = bgKick; bgKick = null; k(); }
  };
  // after the next frame has been handed to the compositor (or 50 ms in a background tab)
  const afterFrame = (fn) => {
    let done = false; const go = () => { if (!done) { done = true; fn(); } };
    requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 50);
  };
  function startBackground(gen) {
    const inflight = [];
    let fenceUnit = null;
    const live = () => gen === initGen && !stale && gl && !gl.isContextLost();
    const tick = () => {
      if (!live()) return;                         // superseded or lost: the next MO.init starts over
      if (bgPaused) { bgKick = () => afterFrame(tick); return; }
      const t0 = performance.now();
      try {
        // 1. collect finished compiles (without the extension the read blocks: one per tick, the tick after issuing)
        for (let i = 0; i < inflight.length; i++) {
          const u = inflight[i];
          if (parallel && !jobDone(u.job)) continue;
          inflight.splice(i--, 1);
          finishUnit(u);
          if (!parallel) break;
        }
        // 2. warm one linked unit at a time; a fence says when the GPU has done it
        if (bgFence && gl.getSyncParameter(bgFence, gl.SYNC_STATUS) === gl.SIGNALED) {
          gl.deleteSync(bgFence); bgFence = null;
          fenceUnit.state = READY; settle(fenceUnit); fenceUnit = null;
        }
        if (!bgFence) {
          let best = null, bt = Infinity;
          for (const u of units) if (u.state === LINKED) { const n = nextUse(u, focusT); if (n < bt) { bt = n; best = u; } }
          if (best) {
            warmDraw(best);
            bgFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
            fenceUnit = best;
            if (!bgFence) { best.state = READY; settle(best); fenceUnit = null; }
          }
        }
        // 3. start new compiles nearest to the playhead first; the unit under the playhead jumps the queue
        const q = units.filter((u) => u.state === QUEUED);
        if (q.length) {
          q.sort((a, b) => nextUse(a, focusT) - nextUse(b, focusT));
          const here = MO.sceneAt(focusT).unit;
          if (here && here.state === QUEUED) { issue(here); inflight.push(here); q.splice(q.indexOf(here), 1); }
          const max = parallel ? MO.compileJobs : 1;
          while (inflight.length < max && q.length && performance.now() - t0 < 8) { const u = q.shift(); issue(u); inflight.push(u); }
        }
      } catch (e) {
        if (e && e.contextLost) return;
        console.error('[background compile] ' + String(e && e.stack || e));
      }
      if (units.every(usable)) { allDone(); return; }
      afterFrame(tick);
    };
    afterFrame(tick);
  }

  // ---------------------------------------------------------------- init
  // Yield to the browser so it can paint (status text, progress) between steps. The timeout
  // keeps init moving in a background tab, where requestAnimationFrame does not run.
  const nextFrame = () => new Promise((res) => {
    let done = false; const go = () => { if (!done) { done = true; res(); } };
    requestAnimationFrame(go); setTimeout(go, 50);
  });

  // Forget every GL object. After a context loss they are already gone, so only drop them.
  function releaseGL() {
    const del = gl && !stale && !gl.isContextLost();
    if (del) {
      for (const k in progs) if (progs[k]) gl.deleteProgram(progs[k].p);
      for (const u of units) {
        if (u.prog && u.prog !== progs.error) gl.deleteProgram(u.prog.p);
        if (u.job) { gl.deleteProgram(u.job.p); gl.deleteShader(u.job.fs); }
      }
      if (bgFence) gl.deleteSync(bgFence);
      freeTarget(sceneT); bloomLv.forEach(freeTarget);
      if (overlayTex) gl.deleteTexture(overlayTex);
      if (quad) gl.deleteBuffer(quad);
      if (vsShader) gl.deleteShader(vsShader);
    }
    for (const k in progs) delete progs[k];
    for (const u of units) { u.prog = null; u.job = null; u.state = QUEUED; }
    for (const sc of MO.scenes) sc.prog = null;
    units = []; bgFence = null; bgKick = null;
    sceneT = null; bloomLv = []; overlayTex = null; quad = null; vsShader = null; sceneValid = false;
    stale = false;
  }

  // with a cue list the cues define the picture: any stretch of [0, DUR) that no scene covers gets
  // the warning pattern, and a console error names it
  function fillGaps() {
    if (MO._gapsFilled) return;
    MO._gapsFilled = true;
    const iv = MO.scenes.map((s) => [s.from, s.to]).sort((a, b) => a[0] - b[0]);
    let cur = 0;
    const gaps = [];
    for (const [a, b] of iv) { if (a > cur + 1e-6) gaps.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < DUR - 1e-6) gaps.push([cur, DUR]);
    for (const [a, b] of gaps) {
      console.error(`MAGNUM OPUS: no scene covers ${a.toFixed(3)}-${b.toFixed(3)} s (bars ${(a / BAR).toFixed(2)}-${(b / BAR).toFixed(2)})`);
      MO.scenes.push({ id: `gap-${(a / BAR).toFixed(2)}`, fs: ERROR_FS, from: a, to: b });
    }
  }

  // MO.init is re-entrant: calling it again (for example after the WebGL context was lost and
  // restored) rebuilds every program and target on the canvas's current context.
  // opts: { canvas, width, height, preserve, onProgress(done, total), warmAt (seconds: where playback
  //   will start), warm (false skips the pre-warm), progressive (false compiles everything first) }
  // Resolves when the programs for [warmAt, end of its cue + MO.lookahead) are ready (all of them in
  // capture mode); the rest compile in the background (MO.compileStatus(), MO.onCompile, MO.allReady).
  MO.init = async function init(opts) {
    const gen = ++initGen;
    const check = () => {
      if (gen !== initGen) throw new Error('MO.init was superseded by a newer call');
      if (gl.isContextLost()) throw lostError();
    };
    stats.initStart = performance.now(); stats.startupMs = 0; stats.allMs = 0;
    ready = false; MO.ready = false; MO.allReady = false;
    if (canvas && canvas !== opts.canvas) stale = true;   // a different canvas: never touch the old objects
    canvas = opts.canvas;
    W = opts.width; H = opts.height;
    canvas.width = W; canvas.height = H;
    if (!canvas.__moLossHooks) {
      canvas.__moLossHooks = true;
      // preventDefault lets the browser restore the context; the page decides what to show meanwhile
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ready = false; MO.ready = false; stale = true; MO.contextLost = true; });
      canvas.addEventListener('webglcontextrestored', () => { MO.contextLost = false; });
    }
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    if (gl.isContextLost()) throw lostError();
    MO.gl = gl;
    MO.contextLost = false;
    releaseGL();
    hdr = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    parallel = gl.getExtension('KHR_parallel_shader_compile');
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // the overlay canvas survives a context loss; only its texture is per context
    if (!overlayCanvas) { overlayCanvas = document.createElement('canvas'); overlayCtx = overlayCanvas.getContext('2d'); }
    if (overlayCanvas.width !== W || overlayCanvas.height !== H) { overlayCanvas.width = W; overlayCanvas.height = H; }
    overlayTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, overlayTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

    expandCues(ERROR_FS);
    // without a cue list, a section without a registered scene gets a visible placeholder
    if (!cueMode) {
      for (const sec of S.sections) {
        if (!MO.scenes.some((sc) => (sc.section || sc.id) === sec.id)) MO.scenes.push({ id: sec.id + '-missing', section: sec.id, fs: ERROR_FS });
      }
    }
    for (const sc of MO.scenes) {
      const sec = S.sections.find((s) => s.id === sc.section || s.id === sc.id);
      sc.from = sc.from ?? (sec ? sec.bars[0] * BAR : 0);
      sc.to = sc.to ?? (sec ? sec.bars[1] * BAR : DUR);
    }
    if (cueMode) fillGaps();
    MO.scenes.sort((a, b) => a.from - b.from);
    buildUnits();
    stats.programs = units.length; stats.scenes = MO.scenes.length;

    // phase 1: issue the compiles and links we wait for, without querying anything
    prefix = window.MO_HEADER + window.MO_LIB + '\n#line 1\n';   // #line 1: errors count from the scene's own source
    vsShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsShader, VS); gl.compileShader(vsShader);
    // capture renders offline (no hitch to avoid, and a few stills would pay for every scene): no warm-up
    warmOn = !MO.capture && opts.warm !== false;
    const progressive = !MO.capture && opts.progressive !== false && !params.has('fullcompile');
    const at = MO.clamp(+opts.warmAt || 0, 0, DUR - 1e-3);
    focusT = at;
    const engineJobs = [
      { key: 'down', job: startProgram(FS_DOWN, 'bloom-down') },
      { key: 'up', job: startProgram(FS_UP, 'bloom-up') },
      { key: 'post', job: startProgram(FS_POST, 'post') },
      { key: 'fallback', job: startProgram(FS_FALLBACK, 'fallback') },
    ];
    let total = 0, done = 0;
    const report = () => { try { opts.onProgress && opts.onProgress(done, total); } catch (e) { /* UI only */ } };
    const waitGPU = async () => {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) return;
      try {
        // a sync object's status only updates between tasks: poll without blocking the page
        while (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) { await new Promise((r) => setTimeout(r, 8)); check(); }
      } finally { gl.deleteSync(sync); }
    };
    // compile, link (and in live mode warm) a set of units while the page shows progress
    const compileNow = async (list, extraJobs = [], warmFrame = false) => {
      list = list.filter((u) => u.state === QUEUED);
      list.forEach(issue);
      const base = done;
      total += extraJobs.length + list.length + (warmOn ? list.length + (warmFrame ? 1 : 0) : 0);
      report();
      await nextFrame(); check();
      // phase 2: wait for completion without blocking where the driver can tell us, then read results
      if (parallel) {
        for (;;) {
          const n = extraJobs.filter((j) => jobDone(j.job)).length + list.filter((u) => jobDone(u.job)).length;
          done = base + n; report();
          if (n === extraJobs.length + list.length) break;
          await nextFrame(); check();
        }
      }
      let fin = 0, slice = performance.now();
      const step = async () => {
        done = Math.max(done, base + ++fin); report();   // never runs backwards
        // without the extension each status read can block; give the page a frame every ~40 ms
        if (performance.now() - slice > 40) { await nextFrame(); check(); slice = performance.now(); }
      };
      for (const j of extraJobs) { progs[j.key] = finishProgram(j.job); await step(); }   // engine programs must work
      for (const u of list) { finishUnit(u); await step(); }
      buildTargets();
      if (warmOn) {
        warming = true;
        try {
          for (const u of list) {
            if (u.state === LINKED) { warmDraw(u); await waitGPU(); check(); u.state = READY; settle(u); }
            done++; report();
          }
          if (warmFrame) { MO.render(at); await waitGPU(); check(); done++; report(); }   // the frame the page is about to show
        } finally { warming = false; }
      }
    };
    await compileNow(progressive ? neededUnits(at) : units.slice(), engineJobs, true);
    // a seek while this ran (MO.prefetch) moved the start point: have that stretch ready too
    for (let i = 0; progressive && i < 4; i++) {
      const more = neededUnits(focusT).filter((u) => !usable(u));
      if (!more.length) break;
      await compileNow(more);
    }
    stats.startupUnits = units.filter(usable).length;

    await Promise.all(MO.pending);
    check();
    MO.hdr = hdr;
    ready = true; MO.ready = true;
    stats.startupMs = performance.now() - stats.initStart;
    if (units.every(usable)) allDone(); else startBackground(gen);
    return MO;
  };

  // Safe to call at any time: before init (or while it runs) it only records the size.
  MO.resize = function resize(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    if (canvas) { canvas.width = W; canvas.height = H; }
    if (overlayCanvas) { overlayCanvas.width = W; overlayCanvas.height = H; }
    if (!ready) return;
    sceneT && freeTarget(sceneT); sceneT = null; buildTargets();
  };
  MO.setQuality = function setQuality(q) { MO.quality = MO.clamp(q, 0.3, 1); if (ready) buildTargets(); };
  MO.size = () => ({ W, H, sw: sceneT ? sceneT.w : 0, sh: sceneT ? sceneT.h : 0, hdr });

  MO.sceneAt = (t) => {
    let pick = MO.scenes[0];
    for (const sc of MO.scenes) if (t >= sc.from && t < sc.to) pick = sc;
    if (t >= DUR) pick = MO.scenes[MO.scenes.length - 1];
    return pick;
  };

  // ---------------------------------------------------------------- render one frame
  // If the scene at t is still compiling, the frame keeps the last good scene picture while
  // playback runs on (the typography and post effects stay live), or after a jump shows a dim
  // fallback; MO.lastFrame says which. Neither waits for the compile.
  let lastGoodT = -1e9, lastGoodSc = null, prevT = -1e9;
  MO.render = function render(t) {
    MO.t = t;
    if (!(ready || warming) || gl.isContextLost()) return null;   // nothing to draw with until (re)init
    buildTargets();
    const sc = MO.sceneAt(t);
    focusT = MO.clamp(t, 0, DUR);
    const unit = sc.unit;
    let held = false, fallback = false, ps = sc, pt = t;
    gl.disable(gl.BLEND);

    // 1. scene
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fb);
    gl.viewport(0, 0, sceneT.w, sceneT.h);
    if (unit && usable(unit)) {
      const pr = unit.prog;
      const local = t - sc.from;
      gl.useProgram(pr.p);
      if (unit.shared && unit.lastScene !== sc && unit.state === READY) resetUniforms(pr);
      unit.lastScene = sc;
      const u = MO.globals(t);
      u.uRes = [sceneT.w, sceneT.h]; u.uLocal = local; u.uDur = sc.to - sc.from;
      setUniforms(pr, u);
      if (sc.uniforms) {
        try { setUniforms(pr, sc.uniforms(t, local, MO) || {}); }
        catch (e) { const m = String(e && e.stack || e); if (!overlayErrors.has(m)) { overlayErrors.add(m); console.error(`[scene ${sc.id} uniforms] ` + m); } }
      }
      draw();
      sceneValid = true; lastGoodT = t; lastGoodSc = sc;
    } else if (sceneValid && lastGoodSc && Math.abs(t - prevT) < 0.5) {
      held = true; ps = lastGoodSc; pt = lastGoodT;           // playback ran into it: hold the picture
    } else {
      fallback = true; ps = null;
      gl.useProgram(progs.fallback.p);
      const u = MO.globals(t); u.uRes = [sceneT.w, sceneT.h];
      setUniforms(progs.fallback, u);
      draw();
      sceneValid = false;
    }
    prevT = t;
    const local = ps ? pt - ps.from : 0;
    const pp = (v, d) => (!ps ? d : typeof v === 'function' ? v(pt, local, MO) : (v ?? d));

    // 2. bloom: prefilter + dual-filter down, then up with additive blend
    let src = sceneT;
    gl.useProgram(progs.down.p);
    for (let i = 0; i < bloomLv.length; i++) {
      const dst = bloomLv[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
      setUniforms(progs.down, { uSrc: 0, uHalf: [0.5 / src.w, 0.5 / src.h], uPrefilter: i === 0 ? 1 : 0, uThreshold: ps ? pp(ps.bloomThreshold, 0.85) : 0.85, uKnee: 0.5 });
      draw(); src = dst;
    }
    gl.useProgram(progs.up.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = bloomLv.length - 1; i > 0; i--) {
      const s = bloomLv[i], d = bloomLv[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.w, d.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex);
      setUniforms(progs.up, { uSrc: 0, uHalf: [0.5 / s.w, 0.5 / s.h] });
      draw();
    }
    gl.disable(gl.BLEND);

    // 3. overlay (2D canvas)
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.clearRect(0, 0, W, H);
    let drew = false;
    if (!MO.noOverlay) for (const fn of MO.overlays) {
      overlayCtx.save();
      try { if (fn(overlayCtx, t, W, H, MO)) drew = true; }
      catch (e) { const m = String(e && e.stack || e); if (!overlayErrors.has(m)) { overlayErrors.add(m); console.error('[overlay] ' + m); } }
      overlayCtx.restore();
    }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, overlayTex);
    if (drew) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlayCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }

    // 4. post to screen
    const fx = fxAt(t);
    const sh = fx.shake;
    // 5-8 Hz components: well below the 15 Hz Nyquist limit of a 30 fps video, so the shake reads the same in the MP4 and live
    const shakeOff = [sh * (Math.sin(t * 38.3) + Math.sin(t * 52.9 + 1.3)) * 0.5, sh * (Math.sin(t * 45.6 + 2.1) + Math.sin(t * 31.4)) * 0.5 * (16 / 9)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(progs.post.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomLv[0].tex);
    const post = {
      uScene: 0, uBloom: 1, uOverlay: 2, uRes: [W, H], uTime: t,
      uBloomStrength: pp(ps && ps.bloom, 0.6), uExposure: pp(ps && ps.exposure, 1.0),
      uFlash: fx.flash, uFlashColor: fx.flashColor, uImpact: fx.impact, uImpactPol: fx.impactPol, uCA: fx.ca + pp(ps && ps.ca, 0),
      uGrain: MO.grain ?? 0.025, uVignette: pp(ps && ps.vignette, 0.35), uHasOverlay: drew ? 1 : 0,
      uShakeOff: shakeOff, uZoom: fx.zoom, uGradeOn: 0, uFrameOn: 0,
    };
    if (ps && (ps.grade || ps.frame)) {
      try {
        const g = ps.grade ? MO.gradeAt(ps, pt) : null;
        if (g) { post.uGradeOn = 1; post.uGradeM = g.m; post.uGradeO = g.o; }
        const f = ps.frame ? MO.frameAt(ps, pt, W / H) : null;
        if (f) { post.uFrameOn = 1; post.uFrameL = f.l; post.uFrameC = f.c; }
      } catch (e) { const m = String(e && e.stack || e); if (!overlayErrors.has(m)) { overlayErrors.add(m); console.error(`[scene ${ps.id} grade/frame] ` + m); } }
    }
    setUniforms(progs.post, post);
    draw();
    MO.lastFrame = { t, id: sc.id, held, fallback };
    return sc.id;
  };

  // ---------------------------------------------------------------- capture API (tools/render-video.cjs)
  if (MO.capture) {
    let px = null;   // one readback buffer for the whole render: a long video must not allocate per frame
    window.__capture = {
      ready: null,
      frame(t) {
        // gl.finish() does not block on ANGLE/SwiftShader; a 1-pixel readback forces the frame to complete.
        const t0 = performance.now(); const id = MO.render(t);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        return { id, ms: performance.now() - t0 };
      },
      rgba() {
        if (!px || px.length !== W * H * 4) px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let s = ''; const CH = 0x8000;
        for (let i = 0; i < px.length; i += CH) s += String.fromCharCode.apply(null, px.subarray(i, i + CH));
        return btoa(s);
      },
      png() { return canvas.toDataURL('image/png'); },
      jpeg(q = 0.92) { return canvas.toDataURL('image/jpeg', q); },
      size() { return { W, H, hdr, dur: DUR, scenes: MO.scenes.map((s) => [s.id, +s.from.toFixed(3), +s.to.toFixed(3)]), programs: units.length }; },
      compile() { return MO.compileStatus(); },
    };
  }
})();
