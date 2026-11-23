/* L'Amor che Morde: the theatre. A toy-theatre opera house in Canvas 2D.
   Everything on stage is a pure function of the audio time t and window.OPERA (score.js):
   curtain, house lights, scenery, blocking, poses, lip sync, lighting, the pit and the Maestro's
   baton. Seeking anywhere just works. Interactive extras (roses, the shushing zombie in row A)
   keep their own small state. */
(function () {
  'use strict';
  const OP = window.OPERA;

  // ------------------------------------------------------------------ small helpers
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIn = (x) => Math.pow(clamp(x, 0, 1), 2);
  const mixc = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const rgb = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lastIdx(list, t) {           // index of the last item with item[0] <= t, or -1
    let lo = 0, hi = list.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }

  // ------------------------------------------------------------------ world layout
  // World units: the auditorium is 1920 wide; the proscenium opening is x 300..1620, y 210..780.
  const OPEN = { l: 300, r: 1620, t: 210, b: 780 };
  const FLOOR = 762;          // where soloists stand
  const UPSTAGE = 716;        // where the chorus stands
  const sx = (x) => 960 + x * 560;

  // ------------------------------------------------------------------ cue tracks
  const cuesBy = {};
  for (const c of OP.cues) (cuesBy[c[1]] = cuesBy[c[1]] || []).push(c);
  const list = (k) => cuesBy[k] || [];

  // a scalar tweened by cues [t, kind, value, dur]
  function tweenTrack(cues, valueOf, initial) {
    const segs = [];
    let cur = { t: -1e9, from: initial, to: initial, d: 0 };
    const at = (s, t) => (s.d <= 0 || t >= s.t + s.d ? s.to : lerp(s.from, s.to, smooth((t - s.t) / s.d)));
    for (const c of cues) {
      const s = { t: c[0], from: at(cur, c[0]), to: valueOf(c), d: +c[3] || 0 };
      segs.push(s); cur = s;
    }
    return (t) => {
      let lo = 0, hi = segs.length - 1, r = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (segs[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; }
      return r < 0 ? initial : at(segs[r], t);
    };
  }
  const curtainAt = tweenTrack(list('curtain'), (c) => (c[2] === 'up' ? 1 : 0), 0);
  const houseAt = tweenTrack(list('house'), (c) => +c[2], 1);
  function sceneAt(t) { const l = list('scene'); const i = lastIdx(l, t); return i < 0 ? 'piazza' : l[i][2]; }

  // lighting presets: amb = stage tint, lvl = brightness, spot = follow-spot colour and strength,
  // moon/green/torch/glory = special sources, fog density
  const LIGHTS = {
    dusk: { amb: [255, 210, 170], lvl: 0.95, spot: [255, 230, 190], sa: 0.0, moon: 0, green: 0, torch: 0, fog: 0.0, glory: 0, sky: 0 },
    wedding: { amb: [255, 222, 178], lvl: 1.0, spot: [255, 236, 200], sa: 0.32, moon: 0, green: 0, torch: 0, fog: 0.0, glory: 0, sky: 0 },
    night: { amb: [104, 128, 206], lvl: 0.64, spot: [200, 215, 255], sa: 0.2, moon: 0.7, green: 0, torch: 0, fog: 0.55, glory: 0, sky: 1 },
    moon: { amb: [134, 156, 226], lvl: 0.76, spot: [220, 230, 255], sa: 0.38, moon: 1, green: 0, torch: 0, fog: 0.5, glory: 0, sky: 1 },
    romanza: { amb: [110, 128, 214], lvl: 0.6, spot: [255, 214, 165], sa: 0.62, moon: 1, green: 0, torch: 0, fog: 0.6, glory: 0, sky: 1 },
    storm: { amb: [86, 98, 158], lvl: 0.48, spot: [180, 200, 255], sa: 0.1, moon: 0.15, green: 0, torch: 0, fog: 0.75, glory: 0, sky: 1 },
    zombie: { amb: [124, 190, 134], lvl: 0.64, spot: [190, 255, 180], sa: 0.45, moon: 0.5, green: 0.75, torch: 0, fog: 0.7, glory: 0, sky: 1 },
    duet: { amb: [176, 128, 205], lvl: 0.62, spot: [255, 196, 222], sa: 0.7, moon: 0.85, green: 0.25, torch: 0, fog: 0.6, glory: 0, sky: 1 },
    blackout: { amb: [14, 14, 24], lvl: 0.05, spot: [0, 0, 0], sa: 0.0, moon: 0, green: 0, torch: 0, fog: 0.3, glory: 0, sky: 1 },
    dead: { amb: [110, 200, 122], lvl: 0.7, spot: [200, 255, 190], sa: 0.3, moon: 0.3, green: 1, torch: 0, fog: 0.85, glory: 0, sky: 1 },
    torch: { amb: [222, 148, 92], lvl: 0.72, spot: [255, 200, 150], sa: 0.35, moon: 0.2, green: 0.55, torch: 1, fog: 0.65, glory: 0, sky: 1 },
    tender: { amb: [178, 156, 218], lvl: 0.64, spot: [255, 204, 214], sa: 0.66, moon: 0.9, green: 0.3, torch: 0, fog: 0.5, glory: 0, sky: 1 },
    grief: { amb: [96, 116, 182], lvl: 0.52, spot: [210, 220, 255], sa: 0.42, moon: 0.6, green: 0.2, torch: 0, fog: 0.6, glory: 0, sky: 1 },
    finale: { amb: [236, 150, 196], lvl: 0.88, spot: [255, 222, 170], sa: 0.8, moon: 0.6, green: 0.35, torch: 0, fog: 0.5, glory: 1, sky: 1 },
    bows: { amb: [255, 238, 214], lvl: 1.0, spot: [255, 240, 215], sa: 0.3, moon: 0.4, green: 0.1, torch: 0, fog: 0.2, glory: 0.2, sky: 1 },
  };
  const LKEYS = ['lvl', 'sa', 'moon', 'green', 'torch', 'fog', 'glory', 'sky'];
  const lightCues = list('light');
  function lightAt(t) {
    const i = lastIdx(lightCues, t);
    if (i < 0) return Object.assign({}, LIGHTS.dusk);
    const cur = LIGHTS[lightCues[i][2]] || LIGHTS.dusk;
    const d = +lightCues[i][3] || 0;
    const k = d <= 0 ? 1 : smooth((t - lightCues[i][0]) / d);
    if (k >= 1 || i === 0) return Object.assign({}, cur);
    const prev = lightAt(lightCues[i][0] - 1e-6);
    const out = { amb: mixc(prev.amb, cur.amb, k), spot: mixc(prev.spot, cur.spot, k) };
    for (const key of LKEYS) out[key] = lerp(prev[key], cur[key], k);
    return out;
  }

  // ------------------------------------------------------------------ characters
  const WHO = ['livia', 'amadeo', 'velena', 'ossobuco'];
  const CH = {};
  for (const w of WHO) CH[w] = { moves: [], poses: [], shows: [], zom: [], face: [] };
  for (const c of OP.cues) {
    const w = c[2];
    if (!CH[w]) continue;
    if (c[1] === 'at') { CH[w].moves.push([c[0], c[3], 0]); if (c[4] !== undefined) CH[w].face.push([c[0], c[4]]); }
    else if (c[1] === 'move') CH[w].moves.push([c[0], c[3], +c[4]]);
    else if (c[1] === 'pose') CH[w].poses.push([c[0], c[3]]);
    else if (c[1] === 'show') CH[w].shows.push([c[0], c[3]]);
    else if (c[1] === 'zombie') CH[w].zom.push([c[0], c[3]]);
  }
  for (const w of WHO) {           // precompute the x each move starts from
    let x = 0;
    for (const m of CH[w].moves) { m.push(x); x = m[1]; }
  }
  function charX(w, t) {
    const mv = CH[w].moves;
    const i = lastIdx(mv, t);
    if (i < 0) return mv.length ? mv[0][1] : 0;
    const [t0, x1, d, x0] = mv[i];
    if (d <= 0 || t >= t0 + d) return x1;
    return lerp(x0, x1, smooth((t - t0) / d));
  }
  function charFacing(w, t) {
    // facing follows the direction of a move while walking, otherwise the last 'at' facing
    const mv = CH[w].moves;
    const i = lastIdx(mv, t);
    if (i >= 0 && mv[i][2] > 0 && t < mv[i][0] + mv[i][2] && Math.abs(mv[i][1] - mv[i][3]) > 0.02) return mv[i][1] > mv[i][3] ? 1 : -1;
    const f = CH[w].face;
    const j = lastIdx(f, t);
    let face = j < 0 ? 1 : f[j][1];
    if (i >= 0 && mv[i][2] > 0 && (j < 0 || mv[i][0] > f[j][0]) && Math.abs(mv[i][1] - mv[i][3]) > 0.02) face = mv[i][1] > mv[i][3] ? 1 : -1;
    // soloists turn to look at a partner who is singing
    return face;
  }
  function charShown(w, t) { const s = CH[w].shows; const i = lastIdx(s, t); return i < 0 ? true : !!s[i][1]; }
  function charZombie(w, t) {
    const z = CH[w].zom; const i = lastIdx(z, t);
    if (i < 0) return 0;
    return clamp((t - z[i][0]) / 2.2, 0, 1) * z[i][1] + (i > 0 ? z[i - 1][1] : 0) * (1 - clamp((t - z[i][0]) / 2.2, 0, 1));
  }

  // poses: absolute arm angles [upper, fore] for the screen-left (L) and screen-right (R) arm,
  // measured from straight down, positive = outward. lean/bend/crouch/tilt in radians or 0..1.
  const P = (aL, aR, o) => Object.assign({ aL, aR, lean: 0, bend: 0, crouch: 0, tilt: 0, brow: 0, fall: 0, rise: 1, mouth: 0, hide: 0 }, o || {});
  const POSES = {
    idle: P([0.14, 0.06], [0.14, 0.06]),
    heart: P([0.5, 0.95], [0.32, -1.75]),
    arms: P([2.0, 2.45], [2.0, 2.45], { tilt: -0.08 }),
    swoon: P([0.25, 0.15], [2.55, -2.35], { lean: -0.12, tilt: -0.15, brow: 1 }),
    clutch: P([0.5, -2.15], [0.5, -2.15], { bend: 0.12, brow: 1 }),
    toast: P([0.15, 0.05], [1.15, 2.7]),
    drink: P([0.15, 0.05], [0.85, -2.65]),
    aside: P([0.35, 0.7], [0.6, -2.45], { lean: 0.08, brow: -1 }),
    gloat: P([0.45, -1.35], [0.45, -1.35], { bend: 0.06, brow: -1 }),
    kneel: P([0.45, 0.7], [0.35, -1.6], { crouch: 0.5, tilt: -0.1, brow: 1 }),
    despair: P([2.35, -2.75], [2.35, -2.75], { crouch: 0.25, brow: 1 }),
    die: P([0.5, -2.15], [0.5, -2.15], { brow: 1 }),
    dead: P([0.6, 0.4], [1.2, 1.1], { fall: 1 }),
    buried: P([1.4, 1.5], [1.4, 1.5], { rise: 0 }),
    rise: P([1.45, 1.55], [-1.35, -1.45], { brow: 1 }),
    getup: P([-1.3, -1.4], [1.4, 1.5], { brow: 1 }),
    reach: P([-1.35, -1.45], [1.45, 1.55], { brow: 1 }),
    sway: P([-1.3, -1.4], [1.4, 1.5], { brow: 1 }),
    lunge: P([-1.2, -1.3], [1.5, 1.7], { lean: 0.22, mouth: 1, brow: -1 }),
    bite: P([-0.9, -1.6], [1.1, 1.9], { lean: 0.42, mouth: 1, brow: -1 }),
    torn: P([2.4, -2.8], [2.4, -2.8], { brow: 1 }),
    tender: P([0.6, 1.05], [0.6, 1.05], { tilt: 0.1 }),
    offer: P([1.25, 1.4], [1.25, 1.4], { tilt: 0.12 }),
    mourn: P([0.15, 0.1], [0.45, -1.25], { tilt: 0.2, brow: 1 }),
    amazed: P([2.2, 2.05], [2.2, 2.05], { lean: -0.06, brow: 1, mouth: 0.6 }),
    cower: P([2.55, -2.2], [2.55, -2.2], { crouch: 0.55, brow: 1 }),
    dig: P([0.6, -0.9], [0.9, -0.4], { bend: 0.12 }),
    sing: P([0.3, 0.2], [1.4, 2.0]),
    point: P([0.2, 0.1], [1.6, 1.62]),
    shrug: P([0.9, 1.95], [0.9, 1.95], { brow: 1 }),
    lament: P([0.4, 0.6], [2.6, -2.45], { brow: 1, tilt: -0.1 }),
    listen: P([0.2, 0.1], [1.95, -2.65], { lean: 0.1 }),
    hide: P([0.6, -1.0], [0.6, -1.0], { crouch: 0.62, hide: 1 }),
    command: P([0.45, -1.1], [1.7, 1.72], { brow: -1 }),
    scream: P([2.8, 3.0], [2.8, 3.0], { mouth: 1, brow: 1 }),
    high: P([2.25, 2.6], [2.25, 2.6], { tilt: -0.18 }),
    bow: P([0.2, -0.6], [1.3, 1.5]),
    sing2: P([1.1, 1.9], [0.3, 0.3]),
  };
  const ARM_KEYS = ['aL', 'aR'];
  const NUM_KEYS = ['lean', 'bend', 'crouch', 'tilt', 'brow', 'fall', 'rise', 'mouth', 'hide'];
  function blendPose(a, b, k) {
    const o = {};
    for (const key of ARM_KEYS) o[key] = [lerp(a[key][0], b[key][0], k), lerp(a[key][1], b[key][1], k)];
    for (const key of NUM_KEYS) o[key] = lerp(a[key], b[key], k);
    return o;
  }
  function clonePose(p) { return blendPose(p, p, 0); }

  // a pose as it is dt seconds after it was cued (some poses move)
  function livePose(name, dt, t, seed) {
    const base = POSES[name] || POSES.idle;
    const p = clonePose(base);
    switch (name) {
      case 'die': {
        const k = smooth((dt - 0.5) / 1.4);
        p.fall = k; p.bend = 0.12 * (1 - k);
        break;
      }
      case 'rise': {
        p.rise = easeOut(dt / 3.2) * 0.98 + 0.02 * smooth(dt / 3.2);
        p.lean = 0.05 * Math.sin(dt * 2.1);
        break;
      }
      case 'getup': {
        p.fall = 1 - smooth((dt - 0.6) / 2.4);
        p.lean = 0.06 * Math.sin(dt * 2.4) * (1 - p.fall);
        break;
      }
      case 'sway': case 'reach':
        p.lean = 0.07 * Math.sin(t * 2.6 + seed);
        p.aL[0] += 0.08 * Math.sin(t * 2.6 + seed + 1); p.aR[0] += 0.08 * Math.sin(t * 2.6 + seed);
        break;
      case 'dig': {
        const c = (t * 0.9 + seed) % 1;
        const s = Math.sin(c * Math.PI * 2);
        p.bend = 0.16 + 0.1 * s; p.aR[0] = 0.9 + 0.35 * s; p.aL[0] = 0.6 + 0.3 * s;
        break;
      }
      case 'bow': {
        const k = Math.sin(clamp(dt / 1.7, 0, 1) * Math.PI);
        p.bend = 0.75 * k;
        p.aR = [lerp(0.15, 1.3, k), lerp(0.05, 1.5, k)];
        p.aL = [lerp(0.15, 0.2, k), lerp(0.05, -0.6, k)];
        if (dt > 1.7) Object.assign(p, clonePose(POSES.idle));
        break;
      }
      case 'lunge': p.lean = 0.22 * smooth(dt / 0.35); break;
      case 'bite': p.lean = 0.42 * smooth(dt / 0.25); break;
      case 'scream': p.lean = 0.04 * Math.sin(t * 30); break;
      case 'torn': p.lean = 0.08 * Math.sin(t * 1.7); break;
      case 'cower': p.lean = 0.03 * Math.sin(t * 11); break;
      default: break;
    }
    return p;
  }
  function charPose(w, t) {
    const ps = CH[w].poses;
    const i = lastIdx(ps, t);
    const seed = WHO.indexOf(w) * 1.7;
    if (i < 0) return { p: livePose('idle', 99, t, seed), name: 'idle', dt: 99 };
    const [t1, n1] = ps[i];
    const cur = livePose(n1, t - t1, t, seed);
    const k = smooth((t - t1) / 0.45);
    if (k >= 1 || i === 0 || n1 === 'dead' || n1 === 'buried') return { p: cur, name: n1, dt: t - t1 };
    const [t0, n0] = ps[i - 1];
    const prev = livePose(n0, t1 - t0, t1, seed);
    if (n0 === 'buried' || n0 === 'dead') return { p: cur, name: n1, dt: t - t1 };
    return { p: blendPose(prev, cur, k), name: n1, dt: t - t1 };
  }

  // ------------------------------------------------------------------ singing (lip sync)
  const MOUTH = { a: [1.0, 0.25], e: [0.62, 0.9], i: [0.38, 1.0], o: [0.85, 0.0], u: [0.45, -0.3], M: [0.0, 0.4], c: [0.18, 0.5] };
  function singAt(who, t) {
    const L = OP.sing[who];
    if (!L) return null;
    const i = lastIdx(L, t);
    if (i < 0) return null;
    const s = L[i];
    if (t > s[1] + 0.06) {
      // between segments: lips relax
      return { open: 0, wide: 0.4, lvl: 0, singing: t < s[1] + 0.5 };
    }
    const m = MOUTH[s[2]] || MOUTH.c;
    const into = clamp((t - s[0]) / 0.05, 0, 1);
    const outof = clamp((s[1] + 0.05 - t) / 0.07, 0, 1);
    const k = Math.min(into, outof);
    return { open: m[0] * (0.55 + 0.45 * s[3]) * k, wide: m[1], lvl: s[3], singing: true };
  }
  function isSinging(who, t) {
    const L = OP.sing[who];
    if (!L) return 0;
    const i = lastIdx(L, t + 0.15);
    if (i < 0) return 0;
    const s = L[i];
    if (t > s[1] + 0.45) return 0;
    return s[3];
  }

  // ------------------------------------------------------------------ groups (chorus)
  const groupCues = { vill: [], dead: [] };
  for (const c of list('group')) if (groupCues[c[2]]) groupCues[c[2]].push([c[0], c[3], +c[4] || 0]);
  function groupAt(g, t) {
    const l = groupCues[g];
    const i = lastIdx(l, t);
    if (i < 0) return { action: 'hide', dt: 0, prev: 'hide' };
    return { action: l[i][1], dt: t - l[i][0], d: l[i][2], prev: i > 0 ? l[i - 1][1] : 'hide', prevDt: i > 0 ? l[i][0] - l[i - 1][0] : 0 };
  }

  // one-shot effects
  const FX = list('fx').map((c) => [c[0], c[2], c[3]]);
  function fxSince(name, t) {
    let best = null;
    for (const f of FX) if (f[1] === name && f[0] <= t) best = f;
    return best ? t - best[0] : null;
  }
  function fxLast(name, t) { let b = null; for (const f of FX) if (f[1] === name && f[0] <= t) b = f; return b; }

  // the Maestro
  const MAE = list('maestro');
  function maestroAt(t) { const i = lastIdx(MAE, t); return i < 0 ? { a: 'away', dt: 0 } : { a: MAE[i][2], dt: t - MAE[i][0] }; }
  function beatAt(t) {
    const B = OP.beats;
    const i = lastIdx(B, t);
    if (i < 0) return null;
    const b = B[i];
    const next = B[i + 1];
    const span = next ? next[0] - b[0] : 0.8;
    if (!next || span > 2.6) {
      if (t - b[0] > 1.2) return null;
      return { k: b[1], n: b[2], ph: clamp((t - b[0]) / 0.8, 0, 1), span: 0.8 };
    }
    return { k: b[1], n: b[2], ph: clamp((t - b[0]) / span, 0, 1), span };
  }
  function envAt(t) { const e = OP.env; const i = clamp(Math.floor(t * 10), 0, e.length - 1); return e[i] / 99; }
  function pitAt(key, t) { const s = OP.pit[key]; const i = clamp(Math.floor(t * 10), 0, s.length - 1); return +s[i]; }

  // export the state functions the page uses
  window.OperaState = { curtainAt, houseAt, sceneAt, lightAt, charX, charPose, singAt, isSinging, groupAt, maestroAt, beatAt, envAt, sx, OPEN, FLOOR };
  window.OperaUtil = { clamp, lerp, smooth, easeOut, easeIn, mixc, rgb, hash, mulberry, lastIdx, charFacing, charShown, charZombie, fxSince, fxLast, pitAt, LIGHTS, POSES, livePose, blendPose };
})();
