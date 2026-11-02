// NIGREDO — XIII Death. Owner: eye. Two shot factories (see the block above each MO.shot):
//   nigredo.eye  (30 s piece: beats 0–5)   the great eye (Alex Grey line art) opens inside a
//                Providence triangle; the push-in dives into the pupil under the NIGREDO insert
//   nigredo.sun  (30 s piece: beats 5–16)  the sol niger over a still black mercury sea, ravens
//                spiralling; the colossal Shadow rises behind it, lurching up on every beat; a fast
//                push-in on its face, dutch tilt, its eyes snap open a beat before the cut
// One shader per shot, so only one runs per frame; every knob is a uniform, so one program serves
// every cue of a shot. Everything is a pure function of time. Without a cue list in the score the
// file places both shots at their 30 s windows itself (end of file).
// The eye GLSL between the EYE markers is identical in coda.js (the circle closes there).
(() => {
  const BEAT = MO.BEAT;

  // ==== CUE CLOCK BEGIN (identical in nigredo.js, albedo.js and coda.js) ====
  // Places a shot's choreography in any cue. The choreography is written on the shot's natural
  // timeline: the times it has in the 30 s piece, beats nb0..nb1. For a cue anywhere, of any length:
  //   K.S(n)  real time of the natural time n anchored to the cue's start (reveals, entrances).
  //           The head plays at natural speed; K.sq > 1 speeds it up when the cue is too short for
  //           its first headBeats plus its last tailBeats. K.H(t) is the inverse: natural head time.
  //   K.E(n)  real time of n anchored to the cue's end: dives, snaps and closes keep their distance
  //           to the cut. A move from an S anchor to an E anchor stretches with the cue.
  //   K.M(t)  ambient-motion clock (spins, flames, drifts): t, sped up around the cue start by
  //           params.speed and shifted by params.seed (seconds of motion = seed * 9.73).
  //   K.nb(b) natural time of the shot's own beat b; K.d(x) snaps float noise in a shift to 0.
  //   K.p(name, default, min, max) and K.on(name, default) read a numeric / on-off param.
  // params.offsetBeats starts the cue that many beats into the natural choreography. In the shot's
  // own 30 s window without offset (K.ident) S, E and H return their argument, and M does while
  // speed is 1 and seed 0 (K.still): the 30 s edit renders exactly as before.
  const cueClock = (cue, nb0, nb1, headBeats, tailBeats) => {
    const BT = MO.BEAT, P = cue.params || {};
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const p = (k, d, lo = -Infinity, hi = Infinity) => MO.clamp(num(P[k], d), lo, hi);
    const on = (k, d) => { const v = P[k]; return v === undefined || v === null ? d : !!v && v !== 'off' && v !== '0'; };
    const off = p('offsetBeats', 0, 0, 256) * BT, speed = p('speed', 1, 0, 16), seed = p('seed', 0);
    const n0 = nb0 * BT, n1 = nb1 * BT;
    const ident = off === 0 && cue.beat0 === nb0 && cue.beat1 === nb1;
    const head = Math.max(0, headBeats * BT - off), room = cue.to - cue.from - tailBeats * BT;
    const sq = ident ? 1 : Math.max(1, head / Math.max(room, 0.25 * head, 1e-3));
    const still = speed === 1 && seed === 0;
    return {
      P, p, on, ident, still, sq, off, n0, n1, speed, seed,
      nb: (b) => (nb0 + b) * BT,
      S: (n) => (ident ? n : cue.from + (n - n0 - off) / sq),
      H: (t) => (ident ? t : n0 + off + (t - cue.from) * sq),
      E: (n) => (ident ? n : cue.to - (n1 - n)),
      M: (t) => (still ? t : cue.from + (t - cue.from) * speed + seed * 9.73),
      d: (x) => (Math.abs(x) < 1e-9 ? 0 : x),
    };
  };
  // keyframe times made non-decreasing (a squeezed or re-anchored cue may reorder them)
  const mono = (k) => { for (let i = 1; i < k.length; i++) if (k[i][0] <= k[i - 1][0]) k[i] = [k[i - 1][0] + 1e-4, k[i][1]]; return k; };
  // ==== CUE CLOCK END ====

  // ==== EYE GLSL BEGIN (identical in nigredo.js and coda.js) ====
  const EYE = `
// THE GREAT EYE. Eye space: the corners at x = -1 and x = +1, y up; the iris (radius EY_R)
// sits at EY_IC. Everything is fine luminous line art on black.
uniform float uOpen;    // lid opening: 0 closed, 1 open (overshoots a little)
uniform float uIgnite;  // iris ignition 0..1, the fibres light from the pupil outward
uniform float uLines;   // contour-line reveal 0..1, a front travelling outward from the eye
uniform float uGlint;   // travelling cornea glint 0..1 (outside 0..1 = off)
uniform float uGold;    // palette: 0 nigredo (bone, violet, verdigris), 1 rubedo (gold, crimson)
uniform float uSpin;    // iris ring rotation (kaleidoscope)
uniform float uPupil;   // pupil size factor
uniform vec2  uLook;    // iris offset (gaze, tremble)
uniform float uAura;    // flame aura strength
uniform float uHi;      // anime cornea highlights 0..1
uniform float uSun;     // pupil fire 0..1: 0 the black sun, 1 the white-hot sun (unset = 0 in nigredo)

const vec2  EY_IC = vec2(0.0, 0.03);
const float EY_R  = 0.40;
const float EY_SU = 0.60;   // the socket (first contour line) above
const float EY_SL = 0.46;   // and below

vec3 eyBone, eyVio, eyVerd, eyEmber, eyDeep, eyHot;
void ey_palette(float g) {
  eyBone  = mix(vec3(0.82, 0.80, 0.74), vec3(1.00, 0.62, 0.20), g);
  eyVio   = mix(vec3(0.36, 0.18, 0.85), vec3(0.85, 0.04, 0.03), g);
  eyVerd  = mix(vec3(0.08, 0.58, 0.48), vec3(1.00, 0.40, 0.04), g);
  eyEmber = mix(vec3(0.90, 0.30, 0.08), vec3(0.90, 0.02, 0.16), g);
  eyDeep  = mix(vec3(0.010, 0.005, 0.022), vec3(0.040, 0.002, 0.004), g);
  eyHot   = mix(vec3(0.75, 0.80, 0.92), vec3(1.00, 0.86, 0.60), g);
}

// anti-aliased stroke of an SDF value d (half width w in pixels; pe = pixel size in d's units)
float ey_st(float d, float pe, float w) { return 1.0 - smoothstep(w - 0.7, w + 0.7, abs(d) / pe); }
float ey_gl(float d, float pe, float g) { return exp(-abs(d) / (g * pe)); }
// lines at the integers of v (fw = |dv| per pixel, w = half width in pixels); fades to the
// average coverage where the lines get too dense to resolve (no moire)
float ey_lines(float v, float fw, float w) {
  fw = max(fw, 1e-6);
  float d = abs(fract(v + 0.5) - 0.5) / fw;
  float l = 1.0 - smoothstep(w - 0.7, w + 0.7, d);
  return mix(l, min(1.0, 2.0 * w * fw), smoothstep(0.12, 0.32, fw));
}

float ey_lidU(float x, float o) { float k = max(1.0 - x * x, 0.0); return o * 0.50 * k * (1.0 + 0.35 * k) / 1.35 * (1.0 - 0.07 * x); }
float ey_lidL(float x, float o) { float k = max(1.0 - x * x, 0.0); return -o * 0.36 * k * (1.0 + 0.20 * k) / 1.20 * (1.0 + 0.10 * x); }
// distance to the upper / lower lid (> 0 outside the opening), slope-corrected
float ey_dU(vec2 e, float o) {
  if (abs(e.x) >= 1.0) return length(e - vec2(sign(e.x), 0.0));
  float s = (ey_lidU(e.x + 0.003, o) - ey_lidU(e.x - 0.003, o)) / 0.006;
  return (e.y - ey_lidU(e.x, o)) / sqrt(1.0 + s * s);
}
float ey_dL(vec2 e, float o) {
  if (abs(e.x) >= 1.0) return length(e - vec2(sign(e.x), 0.0));
  float s = (ey_lidL(e.x + 0.003, o) - ey_lidL(e.x - 0.003, o)) / 0.006;
  return (ey_lidL(e.x, o) - e.y) / sqrt(1.0 + s * s);
}
// almond gauge: 1 on the socket line, growing outward; the far contours get rounder
float ey_lam(vec2 e) {
  float H = e.y > 0.0 ? EY_SU : EY_SL;
  float y = abs(e.y), xx = e.x * e.x;
  float l = (y + sqrt(y * y + 4.0 * H * H * xx)) / (2.0 * H);
  H *= 1.0 + 0.32 * max(l - 1.0, 0.0);
  return (y + sqrt(y * y + 4.0 * H * H * xx)) / (2.0 * H);
}

// the iris mandala; q in iris units (radius 1), pe = pixel size in iris units
vec3 ey_iris(vec2 q, float pe) {
  float r = length(q), rr = max(r, 0.03);
  float a = atan(q.y, q.x);
  float rp = 0.33 * uPupil;
  float front = mix(rp - 0.02, 1.35, uIgnite);
  float lit = smoothstep(front + 0.01, front - 0.20, r);
  float edge = exp(-abs(r - front) / 0.035) * step(0.001, uIgnite) * (1.0 - smoothstep(0.7, 1.0, uIgnite));
  float a1 = a + uSpin, a2 = a - 0.7 * uSpin;
  // collarette: the wavy ring between the pupillary and the ciliary zone
  float rc = 0.56 + 0.026 * sin(a1 * 12.0) + 0.010 * sin(a1 * 36.0 + 1.0);
  float drc = (0.312 * cos(a1 * 12.0) + 0.36 * cos(a1 * 36.0 + 1.0)) / rr;
  float inner = smoothstep(rc + 0.012, rc - 0.012, r);
  vec3 col = eyDeep * 2.0 + mix(eyVio * 0.06, eyVerd * 0.09, inner) * (0.3 + 0.7 * lit)
           + uGold * mix(eyVio * 0.22, eyVerd * 0.30, inner) * lit * (0.75 + 0.25 * sin(r * 30.0 - uSpin * 8.0));

  // pupillary zone: dense straight fibres (a corona around the pupil)
  float v1 = a1 / TAU * 90.0 + 0.20 * sin(r * 16.0 + a1 * 6.0);
  float f1 = ey_lines(v1, 90.0 / (TAU * rr) * pe, 0.6) * inner * smoothstep(rp, rp + 0.05, r);
  float h1 = hash11(floor(v1 + 0.5) + 11.0);
  col += mix(eyVerd, eyBone, 0.15 * h1) * f1 * (0.30 + 0.55 * h1) * lit;
  // ciliary zone: fine wavy fibres in beaded segments
  float ci = (1.0 - inner) * smoothstep(0.995, 0.93, r);
  float v2 = (a2 + 0.06 * sin(a2 * 8.0 + r * 10.0) + 0.05 * (r - rc)) / TAU * 150.0;
  float f2 = ey_lines(v2, 150.0 / (TAU * rr) * pe, 0.55) * ci;
  float h2 = hash11(floor(v2 + 0.5) + 3.0);
  float seg = 0.55 + 0.45 * sin(r * 34.0 + h2 * TAU);
  col += mix(eyVio, eyBone, 0.10 * h2) * f2 * (0.25 + 0.45 * h2) * seg * lit;
  // bold trabeculae
  float v3 = (a2 + 0.16 * sin(r * 7.0 + a2 * 3.0)) / TAU * 36.0;
  float f3 = ey_lines(v3, 36.0 / (TAU * rr) * pe, 1.1) * ci;
  col += mix(eyVio, eyVerd, 0.5) * f3 * 0.55 * lit;

  // crypts: dark lenses with bright outlines
  {
    float n = 22.0, ca = a2 / TAU * n, id = floor(ca), h = hash11(id + 5.3);
    vec2 cq = vec2((fract(ca) - 0.5) * TAU / n * r, r - (0.68 + 0.05 * (h - 0.5)));
    float cd = sdVesica(cq, 0.020 + 0.010 * h, 0.055 + 0.025 * h);
    col *= 1.0 - 0.8 * (1.0 - smoothstep(-pe, pe, cd));
    col += eyBone * 0.55 * ey_st(cd, pe, 0.55) * lit;
  }
  // a ring of tiny eyes (eyes within the eye)
  {
    float n = 16.0, ea = (a2 + 0.5 * uSpin) / TAU * n;
    vec2 eq = vec2((fract(ea) - 0.5) * TAU / n * r, r - 0.835);
    float ed = sdVesica(eq.yx, 0.030, 0.068);
    col = mix(col, eyDeep * 2.0, 0.9 * (1.0 - smoothstep(-pe, pe, ed)));
    col += eyBone * 0.95 * ey_st(ed, pe, 0.6) * lit;
    float pd = length(eq) - 0.017;
    col += mix(eyEmber, eyHot, 0.3 * uGold) * 1.6 * (1.0 - smoothstep(-pe, pe, pd)) * lit;
  }
  // contraction furrows: broken concentric arcs
  {
    float fu = min(abs(r - 0.765), abs(r - 0.915));
    float brk = step(0.32, fract(a2 / TAU * 11.0 + 0.3 * sin(a2 * 3.0)));
    col += eyVio * 0.5 * ey_st(fu, pe, 0.5) * brk * lit;
  }
  // sacred geometry: twelve circles through the centre (the rosette), thin ember lines
  {
    vec2 k = kaleido(rot(0.5 * uSpin) * q, 12.0);
    float d = 1e3;
    for (int i = -2; i <= 2; i++) {
      float ph = float(i) * TAU / 12.0;
      d = min(d, abs(length(k - 0.5 * vec2(cos(ph), sin(ph))) - 0.5));
    }
    col += eyEmber * 0.40 * ey_st(d, pe, 0.45) * lit * smoothstep(rp + 0.02, rp + 0.08, r) * smoothstep(1.0, 0.94, r);
  }
  // collarette line
  {
    float dc = (r - rc) / sqrt(1.0 + drc * drc);
    col += eyBone * (1.3 * ey_st(dc, pe, 0.9) + 0.25 * ey_gl(dc, pe, 5.0)) * lit;
  }
  // limbal ring
  col *= 0.45 + 0.55 * smoothstep(1.0, 0.88, r);
  col += eyVio * (1.1 * ey_st(r - 1.0, pe, 0.8) + 0.25 * ey_gl(r - 1.0, pe, 6.0)) * (0.3 + 0.7 * lit);
  // pupil: nigredo = the black sun; rubedo = a white-hot sun around a black eclipse core.
  // uSun ignites it on screen (lead to gold): a front of fire runs from the rim in to the core.
  {
    float rpw = rp + 0.008 * sin(a1 * 40.0);
    float pin = 1.0 - smoothstep(-pe, pe, r - rpw);
    float core = r / rp;
    float fr = 1.0 - 0.75 * uSun;
    vec3 hot = eyHot * (0.7 + 1.5 * (1.0 - core * core)) * smoothstep(0.30, 0.40, core)
             + eyHot * 2.5 * ey_st(core - 0.35, pe / rp, 0.8);
    hot = hot * uSun * smoothstep(fr - 0.15, fr, core) + eyHot * 1.8 * exp(-abs(core - fr) / 0.05) * uSun * (1.0 - uSun) * 4.0;
    col = mix(col, hot, pin);
    col += mix(eyEmber, eyVerd, 0.5 + 0.5 * sin(a * 20.0)) * 1.4 * ey_st(r - rpw, pe, 0.8) * (0.4 + 0.6 * lit);
  }
  col += edge * mix(eyVerd, eyBone, 0.5) * 1.6;
  return col;
}

// the whole eye over the background bg; e in eye space, pe = pixel size in eye units
vec3 ey_eye(vec3 bg, vec2 e, float pe, float t) {
  float o = uOpen;
  float ax = abs(e.x);
  vec3 col = bg;
  float dU = ey_dU(e, o), dL = ey_dL(e, o);
  float inEye = ax < 1.0 ? 1.0 - smoothstep(-pe, pe, max(dU, dL)) : 0.0;
  float lam = ey_lam(e);

  // ---- contour lines and the flame aura (outside the socket)
  if (lam > 0.96) {
    float th = atan(ax, e.y);                       // 0 straight up, PI straight down, mirror symmetric
    float up = smoothstep(2.5, 0.9, th);
    // flame tongues: pointed bulges that curl outward as they rise and flicker one by one
    float ph = th * 2.6 - 0.22 * (lam - 1.0);
    float tid = floor(ph + 0.5);
    float tri = 1.0 - 2.0 * abs(fract(ph + 0.5) - 0.5);
    float tng = pow(tri, 2.2) * (0.7 + 0.3 * sin(t * 3.1 + tid * 2.3));
    float fl = tng * up * smoothstep(1.06, 1.9, lam);
    float u = log(lam) * 22.0 - log(1.0 + 0.55 * fl) * 22.0;
    u += 0.18 * sin(e.x * 7.0 + lam * 5.0 - t * 0.7) * smoothstep(1.05, 1.8, lam);
    float fw = fwidth(u);
    float ln = ey_lines(u, fw, 0.55);
    float idx = floor(u + 0.5);
    float major = mod(idx, 4.0) < 0.5 ? 0.75 : 0.20;
    float lf = mix(1.0, 5.5, uLines);
    float reveal = smoothstep(lf, lf - 0.25, lam);
    float lead = ey_st(lam - lf + 0.1, fwidth(lam), 0.8) * step(0.001, uLines) * (1.0 - uLines);
    float fall = exp(-(lam - 1.0) * 1.5);
    vec3 lc = mix(eyBone, eyVio, sat((lam - 1.0) * 2.0));
    lc = mix(lc, eyVerd, sat((lam - 1.8) * 0.9) * 0.7);
    lc = mix(lc, eyEmber, sat(fl * 1.3));
    col += lc * ln * major * fall * reveal;
    col += mix(eyVio, eyEmber, sat(fl * 1.5)) * (0.015 + 0.10 * fl) * exp(-(lam - 1.1) * 1.1) * uAura * reveal;
    col += eyBone * lead * 0.5;
  }
  // ---- lid folds between the lids and the socket
  if (lam < 1.02 && ax < 1.0) {
    float k = 1.0 - e.x * e.x;
    float yU = ey_lidU(e.x, o), yL = ey_lidL(e.x, o);
    if (e.y > yU) {
      float g = EY_SU * k - yU;
      float f = (e.y - yU) / max(g, 1e-4);
      col += eyBone * 0.55 * ey_st((f - 0.40) * g, pe, 0.6);
      col += eyVio * 0.50 * ey_st((f - 0.72) * g, pe, 0.5);
    } else if (e.y < yL) {
      float g = yL + EY_SL * k;
      float f = (yL - e.y) / max(g, 1e-4);
      col += eyVio * 0.45 * ey_st((f - 0.52) * g, pe, 0.5);
    }
  }
  // ---- inside: the eyeball
  if (inEye > 0.0) {
    vec2 c = EY_IC + uLook;
    vec2 q = (e - c) / EY_R;
    float rq = length(q);
    float sph = sat(1.0 - length((e - c) * vec2(0.85, 1.5)));
    float vein = pow(ridge(e * vec2(5.0, 9.0) + 3.7), 14.0) * smoothstep(0.25, 0.9, ax);
    vec3 ins = eyDeep * 1.3 + eyBone * 0.03 * sph * sph + eyEmber * 0.08 * vein;
    if (rq < 1.15) {
      float pq = pe / EY_R;
      vec3 ir = ey_iris(q, pq);
      ins = mix(ins, ir, 1.0 - smoothstep(1.0 - pq, 1.0 + pq, rq));
    }
    ins *= mix(0.15, 1.0, smoothstep(0.0, 0.17, -dU)) * mix(0.45, 1.0, smoothstep(0.0, 0.05, -dL));
    // light leaking through the slit while the lids are nearly shut
    ins += eyHot * 1.6 * (1.0 - smoothstep(0.04, 0.32, o)) * (1.0 - ax * ax) * step(0.003, o);
    // anime highlights: a rounded lozenge up-left, a small dot down-right
    float pq = pe / EY_R;
    float hl = sdEllipse(rot(-0.6) * (q - vec2(-0.42, 0.42)), vec2(0.12, 0.06));
    float hd = length(q - vec2(0.40, -0.32)) - 0.04;
    ins += eyHot * 2.0 * (1.0 - smoothstep(-pq, pq, min(hl, hd))) * uHi;
    // the travelling glint
    if (uGlint > 0.0 && uGlint < 1.0) {
      float gd = dot(q, normalize(vec2(1.0, 0.45))) - mix(-1.4, 1.4, uGlint);
      float band = exp(-gd * gd / 0.0005) + 0.15 * exp(-gd * gd / 0.012);
      ins += eyHot * 1.4 * band * smoothstep(1.0, 0.85, rq) * sin(PI * uGlint);
    }
    col = mix(col, ins, inEye);
  }
  // ---- the lids, the waterline and the lashes
  {
    float lw = ax < 1.0 ? 1.0 : 0.0;
    col += eyBone * (1.3 * ey_st(dU, pe, 1.0) + 0.18 * ey_gl(dU, pe, 6.0));
    col += eyBone * (0.9 * ey_st(dL, pe, 0.8) + 0.12 * ey_gl(dL, pe, 5.0));
    col += eyVio * 0.5 * ey_st(dL + 0.012 * o, pe, 0.5) * lw;
    if (dU > 0.0 && dU < 0.22 && ax < 0.97) {
      // lashes fan outward and curl like small flames
      float v = dU, g = 1.0 + 2.2 * v + 11.0 * v * v;
      float x0 = e.x / g, n = 12.0, id = floor(x0 * n + 0.5), h = hash11(id * 3.17 + 1.0);
      float L = (0.08 + 0.10 * h) * sqrt(max(1.0 - (id / n) * (id / n), 0.0)) * (0.5 + 0.5 * sat(o));
      float dx = abs(x0 * n - id) / n * g;
      float wl = mix(0.0065, 0.0005, sat(v / L));
      col += eyBone * 0.75 * (1.0 - smoothstep(wl, wl + pe, dx)) * smoothstep(L, L * 0.5, v);
    }
    if (dL > 0.0 && dL < 0.07 && ax < 0.9) {
      float v = dL, g = 1.0 + 0.7 * v;
      float x0 = e.x / g, n = 18.0, id = floor(x0 * n + 0.5), h = hash11(id * 5.1 + 2.0);
      float L = (0.025 + 0.025 * h) * sqrt(max(1.0 - (id / n) * (id / n), 0.0)) * sat(o * 2.0);
      float dx = abs(x0 * n - id) / n * g;
      float wl = mix(0.0035, 0.0006, sat(v / max(L, 1e-3)));
      col += eyVio * 0.45 * (1.0 - smoothstep(wl, wl + pe, dx)) * smoothstep(L, L * 0.6, v) * step(0.5, h);
    }
  }
  // glint sparkle at the edge of the cornea
  if (uGlint > 0.0 && uGlint < 1.0) {
    vec2 dir = normalize(vec2(1.0, 0.45));
    float gp = mix(-1.4, 1.4, uGlint);
    vec2 sp = EY_IC + uLook + EY_R * (dir * gp + vec2(-dir.y, dir.x) * sqrt(max(1.0 - gp * gp, 0.0)) * 0.92);
    col += eyHot * 2.2 * sparkle(e, sp, 0.22 * sin(PI * uGlint));
  }
  return col;
}
`;
  // ==== EYE GLSL END ====

  // ------------------------------------------------------------------ N1: the eye opens
  const N1 = EYE + `
uniform float uZ;      // screen units per eye unit (the push-in)
uniform vec2  uPC;     // screen position of the iris centre
uniform float uTri;    // Providence triangle + glory
uniform float uDive;   // 0..1 the dive into the pupil
uniform float uPal;    // palette knob: 0 nigredo .. 1 rubedo (params.gold)

void main() {
  ey_palette(uPal);
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec2 e = (p - uPC) / uZ + EY_IC;
  float pe = px() / uZ;
  float t = uTime;
  // ink ground with a faint bruise-violet breath around the eye
  vec3 col = vec3(0.004, 0.002, 0.008) + vec3(0.030, 0.012, 0.050) * exp(-dot(e, e) * 0.6) * (0.5 + 0.5 * uLines);
  // the eye in the triangle (Holy Mountain / Providence) with a glory of rays
  if (uTri > 0.001) {
    vec2 tq = e - vec2(0.0, 0.30);
    float td = sdTriangle(tq, 1.62);
    float tl = ey_st(td, pe, 1.0) + 0.6 * ey_st(td - 0.05, pe, 0.6);
    vec3 gold = vec3(0.85, 0.55, 0.22);
    col += gold * (1.1 * tl + 0.18 * ey_gl(td, pe, 10.0)) * uTri;
    float ra = atan(e.y - 0.1, e.x);
    float rv = ra / TAU * 36.0 + 0.5;
    float rl = ey_lines(rv, 36.0 / (TAU * max(length(e - vec2(0.0, 0.1)), 0.1)) * pe, 0.6);
    float lng = mod(floor(rv), 2.0) < 0.5 ? 1.0 : 0.4;
    col += gold * 0.35 * rl * smoothstep(0.02, 0.08, td) * exp(-td * 4.0 / lng) * smoothstep(-0.2, 0.5, e.y) * uTri;
  }
  col = ey_eye(col, e, pe, t);
  // the dive: the pupil swallows the frame, ink speed lines rush outward
  if (uDive > 0.0) {
    vec2 d = p;
    float a = atan(d.y, d.x), r = length(d);
    float v = a / TAU * 70.0;
    float h = hash11(floor(v) + 3.0);
    float sl = smoothstep(0.42, 0.5, abs(fract(v) - 0.5)) * step(0.5, h);
    col *= 1.0 - 0.85 * sl * uDive * smoothstep(0.2, 0.6 + h, r);
    col += vec3(0.5, 0.35, 0.9) * 0.4 * sl * uDive * smoothstep(0.5, 1.6, r);
  }
  fragColor = vec4(col, 1.0);
}`;

  // ------------------------------------------------------------------ N2–N4: the black sun, the Shadow
  const N2 = EYE + `
uniform float uZc;       // camera zoom
uniform vec2  uCc;       // camera centre (world)
uniform float uTilt;     // dutch angle
uniform float uRise;     // Shadow body origin y (world)
uniform float uSS;       // Shadow scale (world units per body unit)
uniform float uShA;      // Shadow visibility
uniform float uEyes;     // Shadow eyes 0 closed .. 1 open
uniform float uEyeGlow;  // extra eye glow (claps, end)
uniform float uKT;       // seconds since the last kick
uniform float uKA;       // kick accent (0 before the kicks start)
uniform float uSunR;
uniform vec4  uBird[7];  // x, y, scale * facing, heading (+10 when behind the sun)
uniform float uBirdA;
uniform float uSpeed;    // dark speed lines
uniform float uHN;       // closed hats so far (speed line pattern)
uniform float uFade;     // fade in from the dive
uniform float uFace;     // face push-in amount
uniform float uSnap;     // the eyes' snap burst (decays)
uniform float uSnapR;    // its shockwave radius
uniform vec2  uEyeS;     // screen position between the Shadow's eyes
uniform float uPal;      // palette knob: 0 nigredo .. 1 rubedo (params.gold)

const vec2  NG_SUN = vec2(0.0, 0.16);
const float NG_HZ = -0.32;

vec2 ng_rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

// a raven seen from below as it circles: forward = +x, broad fingered wings along y, wedge tail
float ng_raven(vec2 q, float flap) {
  float s = sin(flap);
  float body = sdEllipse(q - vec2(0.02, 0.0), vec2(0.30, 0.08));
  float head = length(q - vec2(0.32, 0.0)) - 0.075;
  float beak = sdTaper(q, vec2(0.36, 0.0), vec2(0.52, 0.0), 0.036, 0.006);
  float tx = -q.x - 0.16;
  float tail = max(max(abs(q.y) - (0.045 + 0.32 * tx), -tx), tx - 0.34 + abs(q.y) * 0.9) * 0.8;
  float d = smin(smin(body, head, 0.05), tail, 0.05);
  d = min(d, beak);
  vec2 m = vec2(q.x, abs(q.y));
  float sp = 1.0 - 0.50 * s * s;                      // foreshortened at the top and bottom of the stroke
  vec2 sh = vec2(0.06, 0.04);
  vec2 wr = vec2(0.03 + 0.07 * s, 0.05 + 0.45 * sp);
  vec2 tp = vec2(-0.10 + 0.12 * s, 0.05 + 0.95 * sp);
  float w = smin(sdTaper(m, sh, wr, 0.15, 0.12), sdTaper(m, wr, tp, 0.12, 0.05), 0.05);
  vec2 b = mix(wr, tp, 0.45);
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    w = min(w, sdTaper(m, b + vec2(-0.04 * fk, 0.0), tp + vec2(-0.07 * fk + 0.03, 0.10 - 0.06 * fk) * sp, 0.035, 0.008));
  }
  return smin(d, w, 0.04);
}

// the anime eye of the Shadow; q in eye units (half width 1), facing outward
vec3 ng_shadowEye(vec2 q, float pe, float open) {
  vec3 col = vec3(0.0);
  float k = max(1.0 - q.x * q.x, 0.0);
  // closed: a downward bowed lid line
  float yc = -0.30 * k + 0.05;
  float dc = (q.y - yc) / sqrt(1.0 + pow(0.6 * q.x, 2.0));
  col += vec3(0.55, 0.30, 1.0) * (0.9 * ey_st(dc, pe, 0.7) + 0.15 * ey_gl(dc, pe, 2.5)) * (1.0 - open) * step(abs(q.x), 1.0);
  if (open > 0.01) {
    // open: a sharp slit almond, upper lid slanted (the inner corner low)
    float yU = open * 0.30 * k * (1.0 + 0.75 * q.x) + 0.06 * q.x;
    float yL = -open * 0.15 * k * (1.0 - 0.3 * q.x) + 0.06 * q.x;
    float inside = step(abs(q.x), 1.0) * (1.0 - smoothstep(-pe, pe, max(q.y - yU, yL - q.y)));
    vec2 iq = q - vec2(0.02, 0.02);
    float ir = length(iq);
    vec3 w = vec3(1.25, 1.2, 1.4);
    w = mix(w, vec3(0.35, 0.0, 0.02), 1.0 - smoothstep(-pe, pe, ir - 0.27));
    w = mix(w, vec3(3.0, 0.10, 0.05), 1.0 - smoothstep(-pe, pe, abs(ir - 0.34) - 0.075));
    float slit = sdVesica(iq, 0.045, 0.28);
    w = mix(w, vec3(0.0), 1.0 - smoothstep(-pe, pe, slit));
    col = mix(col, w, inside * open);
    float edge = min(abs(q.y - yU), abs(q.y - yL));
    col += vec3(1.0, 0.85, 0.95) * 1.5 * ey_st(edge, pe, 1.0) * open * step(abs(q.x), 1.0);
  }
  return col;
}

// everything above the horizon; w in world units, pe = pixel size in world units
vec3 ng_sky(vec2 w, float pe, float t) {
  vec2 d = w - NG_SUN;
  float r = length(d), a = atan(d.y, d.x);
  float rs = uSunR;
  float kick = exp(-uKT / 0.16) * uKA;
  vec3 col = vec3(0.004, 0.002, 0.008);
  col += vec3(0.11, 0.035, 0.17) * exp(-max(r - rs, 0.0) * 2.4) * (0.75 + 0.35 * kick);
  col += vec3(0.05, 0.012, 0.010) * exp(-max(r - rs, 0.0) * 0.9);
  // the sky is a vast eye whose pupil is the black sun: almond contour lines that step
  // outward by exactly one line on every kick (seamless ripple)
  {
    vec2 se = d / 0.66;
    float lam = ey_lam(se);
    float th = atan(abs(se.x), se.y);
    float tri = 1.0 - 2.0 * abs(fract(th * 2.6 - 0.2 * (lam - 1.0) + 0.5) - 0.5);
    float fl = pow(tri, 2.2) * smoothstep(2.5, 0.9, th) * smoothstep(1.1, 2.2, lam);
    float u = log(max(lam, 1e-3)) * 9.0 - log(1.0 + 0.45 * fl) * 9.0 - uKA * (1.0 - exp(-uKT / 0.09));
    float ln = ey_lines(u, fwidth(u), 0.5);
    float ui = floor(u + 0.5);
    float dash = smoothstep(0.22, 0.30, abs(fract(atan(se.y, se.x) / TAU * 140.0 + ui * 0.5) - 0.5));
    vec3 lc = mix(eyVio, eyVerd, 0.5 + 0.5 * sin(ui * 1.7));
    lc = mix(lc, eyEmber, sat(fl * 1.4));
    col += lc * 0.17 * ln * mix(1.0, dash, step(0.5, mod(ui, 2.0))) * exp(-(lam - 1.0) * 0.6) * smoothstep(0.85, 1.0, lam);
    col += eyBone * 0.35 * ey_st(lam - 1.0, fwidth(lam), 0.6) * (1.0 - 0.6 * uShA);
  }
  // dark speed lines (from the hats)
  if (uSpeed > 0.0) {
    float v = a / TAU * 96.0;
    float id = floor(v), h = hash11(id * 1.37 + uHN * 7.31);
    float sl = smoothstep(0.30, 0.45, abs(fract(v) - 0.5)) * step(0.55, h) * smoothstep(rs * (1.5 + h), rs * (2.2 + h), r);
    col *= 1.0 - 0.85 * sl * uSpeed;
  }
  // the Shadow: a colossal figure darker than the dark, violet rim, aura contours, Death's bones
  if (uShA > 0.0) {
    vec2 bp = (w - vec2(0.0, uRise)) / uSS;
    float bd = sdBody(bp, 0.22) * uSS;
    float rimK = 0.60 + 0.40 * smoothstep(-0.6, 0.9, w.y);
    if (bd > 0.0 && bd < 0.45) {
      float wob = bd + 0.010 * sin(w.x * 23.0 + w.y * 7.0 - t * 2.0) * smoothstep(0.02, 0.15, bd);
      float ln = ey_lines(wob / 0.034, pe / 0.034, 0.55);
      col += eyVio * 0.40 * ln * exp(-bd * 6.0) * smoothstep(0.012, 0.03, bd) * uShA;
    }
    col += vec3(0.30, 0.10, 0.55) * 0.14 * exp(-max(bd, 0.0) / 0.07) * step(0.0, bd) * rimK * uShA;
    float inside = 1.0 - smoothstep(-pe, pe, bd);
    vec3 inner = vec3(0.0007, 0.0003, 0.0014);
    // the skeleton, faint as an X-ray (XIII Death)
    if (bd < 0.01) {
      vec2 q = vec2(abs(bp.x), bp.y);
      float sk = 1e3;
      float ry = 0.30 + 0.042 * clamp(floor((bp.y + 0.10 * pow(q.x / 0.16, 1.5) - 0.30) / 0.042 + 0.5), 0.0, 6.0);
      float rib = abs(bp.y - (ry - 0.10 * pow(q.x / 0.16, 1.5))) + step(0.165 - 0.004 * abs(ry - 0.47) * 25.0, q.x) + step(q.x, 0.02);
      sk = min(sk, rib);
      sk = min(sk, sdSegment(q, vec2(0.02, 0.60), vec2(0.18, 0.625)));
      sk = min(sk, sdSegment(q, vec2(0.0, 0.42), vec2(0.0, 0.58)) - 0.006);
      sk = min(sk, abs(sdEllipse(bp - vec2(0.0, 0.85), vec2(0.088, 0.112))));
      inner += vec3(0.55, 0.50, 0.62) * 0.10 * ey_st(sk * uSS, pe, 0.6);
    }
    // the Shadow's face: contour lines around its eyes (the great eye's echo) and the eyes
    {
      vec2 fq = vec2(abs(bp.x) - 0.047, bp.y - 0.862) / 0.030;
      if (length(fq) < 6.0) {
        vec2 fe = vec2(fq.x * 0.55, fq.y);
        float lam = ey_lam(fe);
        float ll = ey_lines(log(max(lam, 0.5)) * 9.0, fwidth(log(max(lam, 0.5)) * 9.0), 0.5);
        inner += eyVio * 0.22 * ll * smoothstep(1.0, 1.3, lam) * exp(-(lam - 1.0) * 0.7) * uFace;
        inner += ng_shadowEye(fq, pe / (uSS * 0.030), uEyes) * (1.0 + 0.3 * uEyeGlow);
      }
    }
    col = mix(col, inner, inside * uShA);
    // the violet rim: strong enough that the silhouette reads against the purple glow as soon as it rises
    col += eyVio * (1.7 * ey_st(bd, pe, 0.8) + 0.28 * exp(-abs(bd) / 0.008)) * rimK * uShA;
    // eye glow spilling out when open
    if (uEyes > 0.0) {
      vec2 g1 = vec2(abs(bp.x) - 0.047, bp.y - 0.862) * uSS;
      float gl = exp(-length(g1 * vec2(0.7, 2.2)) / (0.006 + 0.010 * uEyeGlow));
      col += vec3(1.0, 0.30, 0.55) * gl * uEyes * (0.25 + 0.6 * uEyeGlow);
      float streak = exp(-abs(g1.y) / 0.0018) * exp(-abs(g1.x) / (0.05 + 0.30 * uEyeGlow));
      col += vec3(0.9, 0.7, 1.0) * streak * uEyes * (0.35 + 0.8 * uEyeGlow);
    }
  }
  // corona: an eclipse drawn in ink: long helmet streamers and a dense fine fringe, flaring on the kick
  if (r > rs * 0.98 && r < rs * 2.7) {
    float x = (r - rs) / rs;
    float stream = 0.8 * pow(0.5 + 0.5 * cos(a * 3.0 + 0.4), 3.0) + 0.5 * pow(0.5 + 0.5 * cos(a * 5.0 - 1.1), 6.0);
    float v = (a + 0.05 * x * sin(a * 3.0)) / TAU * 170.0;
    float id = floor(v + 0.5), h = hash11(id * 0.731 + 4.0);
    float L = (0.05 + 0.22 * h * h + 0.55 * stream * h) * (1.0 + 0.5 * kick) * (1.0 - 0.75 * smoothstep(0.3, 0.9, sin(a)) * uShA);
    float ln = ey_lines(v, 170.0 / (TAU * r) * pe, 0.5);
    vec3 cc = mix(eyEmber, eyVio, sat(x / 0.35));
    cc = mix(cc, eyVerd, sat((x - 0.45) / 0.5));
    col += cc * ln * exp(-x / L) * (0.9 + 0.8 * kick) * (0.5 + 0.5 * h) * smoothstep(0.0, 0.015, x);
    float l2 = ey_lines(a / TAU * 300.0, 300.0 / (TAU * r) * pe, 0.4);
    col += mix(eyBone, eyEmber, 0.45) * 0.45 * l2 * exp(-x / (0.05 + 0.05 * kick));
    col += mix(eyEmber, eyVio, sat(x * 2.0)) * 0.10 * exp(-x / (0.12 + 0.30 * stream)) * (1.0 + kick) * (1.0 - 0.6 * smoothstep(0.3, 0.9, sin(a)) * uShA);
  }
  // the black disc with a diamond-thin rim
  float sd = r - rs;
  col = mix(col, vec3(0.0), 1.0 - smoothstep(-pe, pe, sd));
  col += mix(eyBone, eyEmber, 0.35) * (1.8 * ey_st(sd, pe, 0.7) + 0.25 * ey_gl(sd, pe, 3.0)) * (0.8 + 0.6 * kick);
  // ravens
  if (uBirdA > 0.0) {
    for (int i = 0; i < 7; i++) {
      vec4 b = uBird[i];
      float sc = abs(b.z);
      vec2 bq = w - b.xy;
      if (dot(bq, bq) > sc * sc * 1.1) continue;
      bool behind = b.w > 5.0;
      float hd = behind ? b.w - 10.0 : b.w;
      vec2 q = ng_rot(bq / sc, -hd);
      float fd = ng_raven(q, uBeat * TAU + PI + 0.35 * float(i)) * sc;
      float m = (1.0 - smoothstep(-pe, pe, fd)) * uBirdA;
      if (behind) m *= smoothstep(rs - pe, rs + pe, r);
      vec3 sheen = mix(eyVerd, eyVio, 0.5 + 0.5 * sin(q.x * 6.0 + float(i)));
      col = mix(col, vec3(0.0005), m);
      col += sheen * 0.7 * ey_st(fd, pe, 0.6) * uBirdA * (behind ? smoothstep(rs, rs + 0.01, r) : 1.0);
    }
  }
  return col;
}

void main() {
  ey_palette(uPal);
  vec2 p = uvCentered(gl_FragCoord.xy);
  float t = uTime;
  vec2 w = ng_rot(p, uTilt) / uZc + uCc;
  float pe = px() / uZc;
  vec3 col;
  if (w.y > NG_HZ) {
    col = ng_sky(w, pe, t);
  } else {
    // the still black mercury sea: a dark mirror with slow silver ripple lines
    float depth = NG_HZ - w.y;
    float z = 1.0 / (depth + 0.03);
    float rip = sin(z * 2.2 - t * 1.5) * 0.004 * depth + sin(w.x * 30.0 + z * 0.8) * 0.0015 * depth;
    vec2 m = vec2(w.x + rip, 2.0 * NG_HZ - w.y);
    col = ng_sky(m, pe, t) * vec3(0.42, 0.42, 0.50) * (0.55 + 0.45 * exp(-depth * 3.0));
    float rl = ey_lines(z * 0.9 - t * 0.25, fwidth(z * 0.9), 0.5);
    col += vec3(0.55, 0.55, 0.65) * 0.03 * rl * exp(-depth * 2.0);
    col += mix(eyBone, eyVerd, 0.4) * 0.25 * ey_st(depth, pe, 0.6);
  }
  col += mix(eyBone, eyVerd, 0.3) * 0.10 * exp(-abs(w.y - NG_HZ) / (4.0 * pe));
  // ash drifting upward: sparse soft flakes in world space (the push-in flies through them)
  for (int i = 0; i < 2; i++) {
    float fi = float(i), k = 4.0 + fi * 3.0;
    vec2 aq = w * k + vec2(0.0, -t * (0.22 + 0.10 * fi) * k);
    vec2 cell = floor(aq), f = fract(aq) - 0.5;
    vec2 h = hash22(cell + fi * 31.0);
    if (h.x > 0.70) {
      vec2 o = (h - 0.5) * 0.6 + vec2(0.15 * sin(t * 1.1 + h.y * 9.0), 0.0);
      vec2 dd = (f - o) / k;
      float sz = 0.0025 + 0.004 * h.y;
      float flake = exp(-dot(dd, dd) / (sz * sz));
      col += mix(vec3(0.50, 0.40, 0.48), vec3(0.9, 0.35, 0.12), step(0.93, h.x)) * 0.30 * flake * (0.6 + 0.4 * sin(t * 2.3 + h.y * 30.0));
    }
  }
  // the snap: bright anime speed lines and a red shockwave from the Shadow's eyes
  if (uSnap > 0.01) {
    vec2 sp = p - uEyeS;
    float a = atan(sp.y, sp.x), r = length(sp);
    float v = a / TAU * 90.0;
    float h = hash11(floor(v) + floor(uTime * 15.0) * 3.1);
    float sl = smoothstep(0.40, 0.5, abs(fract(v) - 0.5)) * step(0.45, h) * smoothstep(0.35 + 0.4 * h, 0.9 + 0.5 * h, r);
    col += vec3(0.85, 0.75, 1.0) * 0.9 * sl * uSnap;
    float rr = length(sp * vec2(0.75, 1.0));
    float ring = abs(rr - uSnapR) - 0.003 - 0.015 * uSnapR;
    col += vec3(1.0, 0.10, 0.06) * 1.8 * exp(-max(ring, 0.0) / 0.008) * uSnap;
    float ring2 = abs(rr - uSnapR * 0.72) - 0.002;
    col += vec3(1.0, 0.6, 0.8) * 0.8 * exp(-max(ring2, 0.0) / 0.004) * uSnap;
  }
  fragColor = vec4(col * uFade, 1.0);
}`;

  // ------------------------------------------------------------------ shot nigredo.eye
  // NIGREDO.EYE: the great eye opens inside a Providence triangle; the push-in dives into the pupil.
  // Natural length: 5 beats (beats 0-5 of the 30 s piece; the cut lands under the NIGREDO insert).
  // Stretch: the opening (lid twitch and opening, iris ignition, contour lines, glint, triangle:
  //   1.75 s, about 4 beats) is anchored to the cue start at natural speed, sped up when the cue is
  //   too short for it plus the dive. The dive into the pupil is the cue's last beat. The slow push-in
  //   stretches between the two; on a long cue the open eye holds while the iris spins and the flame
  //   aura flickers (and throbs on the kicks with pulse). offsetBeats 2 starts with the eye half open.
  // Params (range (default): what it looks like):
  //   dive       0/1 (1)       the last beat dives into the pupil; 0 holds the open eye to the cut
  //   gold       0..1 (0)      palette: 0 nigredo (bone, violet, verdigris), 1 rubedo (gold, crimson)
  //   sun        0..1 (0)      the pupil: 0 the black sun, 1 a white-hot sun around a black core
  //   triangle   0..2 (1)      the Providence triangle and its glory of rays (0 = the eye alone)
  //   pulse      0..2 (0)      the pupil and the flame aura throb on every kick
  //   zoom       0.3..3 (1)    camera zoom (multiplies the push-in)
  //   x, y       -1..1 (0)     iris screen position (1 = half the frame height)
  //   speed      0..16 (1)     ambient motion rate: iris spin, tremble, flame flicker
  //   seed       any (0)       phase of that motion
  //   offsetBeats 0..5 (0)     start partway into the choreography
  // Coupling: its last frame (the black pupil filling the frame, dark speed lines) cuts into
  //   nigredo.sun's fade from black; both are anchored to that cut, so they match at any lengths.
  // Cost: as in the 30 s piece (one shader; about 60 ms per 640x360 frame on SwiftShader).
  const openAt = (t) => {
    if (t < 0.80) {
      const s = MO.smooth(MO.remap(t, 0.12, 0.80));
      return 0.10 * s + 0.02 * s * Math.sin(t * 53.0) * Math.sin(t * 17.0);
    }
    const u = t - 0.80;
    return 1.0 - 0.90 * Math.exp(-6.5 * u) * Math.cos(10.0 * u);
  };
  MO.shot('nigredo.eye', (cue) => {
    const K = cueClock(cue, 0, 5, 4, 1);
    const dive = K.on('dive', true);
    const gold = K.p('gold', 0, 0, 1), sun = K.p('sun', 0, 0, 1), tri = K.p('triangle', 1, 0, 2), pulse = K.p('pulse', 0, 0, 2);
    const zoom = K.p('zoom', 1, 0.3, 3), ex = K.p('x', 0, -1, 1), ey = K.p('y', 0, -1, 1);
    const T0 = K.S(0);                                        // the shot starts (the gong)
    const T_ENTER = dive ? K.E(4 * BEAT) : cue.to;           // 1.765: the dive starts (kick, orch hit, "Nigredo")
    const T_CUT = dive ? K.E(5 * BEAT) : cue.to + 1;         // 2.206: the cut under the NIGREDO insert
    const T_PC = K.S(0.5);
    const uniforms = (t) => {
      const h = K.H(t), mt = K.M(t);                         // natural head time; ambient-motion time
      const ig = MO.easeOut(MO.remap(h, 0.88, 1.75));
      const trem = MO.remap(h, 0.85, 0.95) * (1 - MO.remap(h, 1.2, 1.5));
      let Z = MO.mix(0.52, 1.12, MO.smooth(MO.remap(t, T0, T_ENTER)));
      const dv = MO.remap(t, T_ENTER, T_CUT);
      Z *= Math.exp(3.4 * Math.pow(dv, 1.7));
      const kp = pulse * MO.env('kick', t, 0.15);
      const u = {
        uOpen: openAt(h), uIgnite: ig, uLines: MO.easeOut(MO.remap(h, 0.0, 1.5)),
        uGlint: MO.remap(h, 1.28, 1.62), uGold: gold, uPal: gold, uSun: sun, uSpin: 0.04 * (mt - T0),
        uPupil: 1.3 - 0.35 * ig + 0.5 * MO.easeIn(dv) + 0.10 * kp,
        uLook: [0.012 * trem * Math.sin(mt * 61.0), 0.008 * trem * Math.sin(mt * 47.0 + 1.0)],
        uAura: 0.6 + 0.4 * MO.env('hits', t, 0.7) + 0.6 * kp, uHi: MO.remap(h, 0.95, 1.2) * ig,
        uZ: Z * zoom, uPC: [ex, MO.mix(-0.03, 0.0, MO.smooth(MO.remap(t, T_PC, T_ENTER))) + ey],
        uTri: MO.remap(h, 0.05, 0.7) * (1 - MO.remap(h, 1.2, 1.75)) * tri, uDive: MO.easeIn(dv),
      };
      if (!K.still) u.uTime = mt;
      return u;
    };
    MO.scene({ id: K.ident ? 'nigredo' : 'nigredo.eye#' + cue.index, fs: N1, uniforms, bloom: 0.45, bloomThreshold: 0.9, vignette: 0.45 });
  });

  // ------------------------------------------------------------------ shot nigredo.sun
  // NIGREDO.SUN: the sol niger over the still black mercury sea, ravens circling; the colossal
  // Shadow rises behind it; a fast push-in on its face, dutch tilt; its eyes snap open.
  // Natural length: 11 beats (beats 5-16 of the 30 s piece).
  // Stretch: the approach out of the dark (fade-in, camera, ravens: about 1.6 beats) and the start of
  //   the rise (the shot's beat 3, or params.rise) are anchored to the cue start; the push-in on the
  //   face (the last 2 beats) and the eyes' snap (the last beat) to the cue end. Between them the
  //   Shadow rises with one lurch on every beat (6 in the 30 s piece, more on a longer cue) over a
  //   slow steady climb, and the camera keeps its steady push and sway; the ravens circle, the kicks
  //   ripple the sky contours and pulse the corona, the hats drive the speed lines throughout. A short
  //   cue speeds the approach up and keeps at least one lurch, still on the beat.
  // Params (range (default): what it looks like):
  //   shadow     0/1 (1)       0: no Shadow and no face push-in; the sun, the sea and the ravens
  //                            with the steady push to the cut
  //   rise       0..64 (3)     beats after the shot start when the Shadow starts to rise
  //   snap       0/1 (1)       the Shadow's eyes snap open a beat before the cut (red shockwave, glow);
  //                            0 keeps them closed (the push-in still lands on the face)
  //   gold       0..1 (0)      palette: corona, sky contours, rims and raven sheen turn rubedo red-gold
  //   ravens     0..1 (1)      raven visibility
  //   zoom       0.3..3 (1)    camera zoom
  //   x, y       -1..1 (0)     camera offset in world units (the push-in still centres the face)
  //   roll       -1..1 (0)     added to the dutch tilt (radians)
  //   speed      0..16 (1)     ambient motion rate: ravens circling, ash, sea ripples, camera sway
  //   seed       any (0)       phase of that motion
  //   offsetBeats 0..11 (0)    start partway (3 = the rise starts on the cut)
  // Coupling: fades in from black (nigredo.eye's dive); ends on the Shadow's face at zoom 6.2 with
  //   its eyes glowing, into albedo.a1's white flash (an fx flash on the next downbeat in the score).
  // Cost: as in the 30 s piece (one shader; about 115-130 ms per 640x360 frame on SwiftShader).
  const S_SCALE = 1.45;
  const R_FINAL = 0.16 - 0.44 * S_SCALE;      // its heart behind the black sun
  const R_START = -0.32 - 0.99 * S_SCALE;     // the crown (body y 0.975) a hair under the horizon: the first lurch lifts it through
  const Z_FACE = 6.2;                         // the push-in lands on this zoom at the cut
  MO.shot('nigredo.sun', (cue) => {
    const K = cueClock(cue, 5, 16, 4.4, 2.7);
    const shadow = K.on('shadow', true), snap = shadow && K.on('snap', true);
    const gold = K.p('gold', 0, 0, 1), ravens = K.p('ravens', 1, 0, 1), zoom = K.p('zoom', 1, 0.3, 3);
    const cx = K.p('x', 0, -1, 1), cy = K.p('y', 0, -1, 1), roll = K.p('roll', 0, -1, 1);
    const T_CUT = K.S(5 * BEAT);                              // 2.206: the shot starts (out of the dive's black)
    let T_RISE = K.S(K.nb(K.p('rise', 3, 0, 256)));          // 3.529: the Shadow starts to rise
    if (K.sq > 1) T_RISE = cue.from + Math.round((T_RISE - cue.from) / BEAT) * BEAT;   // squeezed: keep the lurches on the beat
    const T_END = K.E(16 * BEAT);                             // 7.059: the cut
    const T_PUSH = shadow ? K.E(14 * BEAT) : T_END + 10;     // 6.176: push-in on the face
    const T_EYES = K.E(15 * BEAT);                            // 6.618: the Shadow's eyes snap open
    const T_STEADY = shadow ? T_PUSH : T_END;                 // the steady push reaches 1.25x here
    const A_26 = K.S(2.6), A_265 = K.S(2.65), A_275 = K.S(2.75), A_29 = K.S(2.9), A_BIRD = K.S(5 * BEAT + 0.2);
    // the Shadow rises in lurches, one per beat of the rise, on top of a slow steady climb
    const steps = Math.max(1, Math.round((T_PUSH - T_RISE) / BEAT));
    const riseAt = (t) => {
      const k = MO.clamp((t - T_RISE) / Math.max(0.05, T_PUSH - 0.25 - T_RISE));
      // one lurch per beat, over the first ~0.17 s of the beat
      const kb = (t - T_RISE) / BEAT, n = Math.min(steps, Math.max(0, Math.floor(kb))), f = kb - n;
      const stepped = t < T_RISE ? 0 : n >= steps ? 1 : (n + MO.easeOut(MO.clamp(f * 2.6))) / steps;
      return MO.mix(R_START, R_FINAL, 0.35 * MO.smooth(k) + 0.65 * stepped);
    };
    // the ravens on the ambient-motion clock (mt); the spiral tightens over the first 4.86 s, then holds
    const birds = (mt) => {
      const out = [];
      const tt = mt - T_CUT;
      for (let i = 0; i < 7; i++) {
        const w0 = 0.9 + 0.12 * (i % 3);
        const th = i * 2.399 + w0 * tt;
        const rad = 0.24 * (1.5 + 0.30 * i) * (1 - 0.05 * Math.min(tt, 4.86)) * (1 + 0.08 * Math.sin(0.6 * tt + i));
        const pos = (th2) => [0.0 + rad * Math.cos(th2), 0.16 + rad * 0.42 * Math.sin(th2) + 0.08 * Math.sin(th2 * 2 + i)];
        const p0 = pos(th), p1 = pos(th + 0.01);
        const vx = p1[0] - p0[0], vy = p1[1] - p0[1];
        const behind = Math.sin(th) > 0.15;
        const scale = 0.12 * (1 - 0.30 * Math.sin(th)) * (0.85 + 0.12 * (i % 2));
        const hd = Math.atan2(vy, vx);
        out.push(p0[0], p0[1], scale, hd + (behind ? 10 : 0));
      }
      return out;
    };
    // camera zoom before the face push-in: the approach out of the dark, then a steady push (1.25x by
    // the push-in) that never stalls; the push-in is normalised so it still lands on zoom 6.2 at the cut
    const zBase = (t) => MO.mix(0.32, 0.84, MO.easeOut(MO.remap(t, T_CUT, A_275))) * Math.exp(Math.log(1.25 / 0.84) * Math.max(0, t - A_26) / (T_STEADY - A_26));
    const Z_END = zBase(T_END);
    const T_P3 = (shadow ? T_PUSH : T_END) - 0.3;
    const KX = mono([[T_CUT, 0.0], [A_275, 0.09], [T_RISE + 0.6, -0.05], [T_P3, 0.0]]);
    const KY = mono([[T_CUT, 0.16], [A_275, 0.08], [T_RISE, 0.05], [T_P3, 0.24]]);
    const uniforms = (t) => {
      const mt = K.M(t);
      const lastK = MO.last('kick', t);
      const kt = lastK ? t - lastK.e.t : 10;
      const hats = MO.count('closedHat', t);
      // camera: approach out of the dark, steady push with a lurch on every kick, then the fast push-in on the face
      let Z = zBase(t) * (1 + (MO.reduced ? 0.005 : 0.03) * MO.env('kick', t, 0.1));
      let C = [MO.keys(KX, t) + 0.015 * Math.sin(mt * 0.7) + cx, MO.keys(KY, t) + cy];
      const rise = riseAt(t);
      const faceY = rise + 0.862 * S_SCALE;
      const pk = shadow ? MO.remap(t, T_PUSH, T_END) : 0;
      const tSnap = (T_EYES - T_PUSH) / (T_END - T_PUSH);
      const push = pk < tSnap ? 0.62 * MO.easeInOut(pk / tSnap) : 0.62 + 0.38 * MO.easeIn((pk - tSnap) / (1 - tSnap)) * 0.6 + 0.38 * 0.4 * MO.easeOut((pk - tSnap) / (1 - tSnap));
      Z = Z * Math.exp(Math.log(Z_FACE / Z_END) * push) * zoom;
      C = [MO.mix(C[0], 0.0, push), MO.mix(C[1], faceY, MO.smooth(MO.clamp(pk * 1.4)))];
      const eu = t - T_EYES;
      const eyes = !snap || eu < 0 ? 0 : MO.clamp(1.0 - Math.exp(-40 * eu) * Math.cos(30 * eu) + 0.15 * Math.exp(-8 * eu) * Math.sin(30 * eu), 0, 1.2);
      const claps = MO.env('clap', t, 0.12);
      const tilt = -0.20 * MO.easeInOut(pk) + 0.035 * Math.sin(mt * 0.8 + 1.0) * (1 - pk) + roll;
      const u = {
        uOpen: 0, uIgnite: 0, uLines: 0, uGlint: -1, uGold: 0, uSpin: 0, uPupil: 1, uLook: [0, 0], uAura: 0, uHi: 0, uPal: gold,
        uZc: Z, uCc: C, uTilt: tilt,
        uRise: rise, uSS: S_SCALE, uShA: shadow ? MO.remap(t, T_RISE - 0.2, T_RISE + 0.3) : 0,
        uEyes: eyes, uEyeGlow: snap ? (t > T_EYES ? 0.6 * claps : 0) + 1.6 * MO.easeIn(MO.remap(t, T_EYES + 0.15, T_END)) : 0,
        uKT: kt, uKA: 1, uSunR: 0.24 * (1 + (MO.reduced ? 0.012 : 0.03) * Math.exp(-kt / 0.12)),
        uBird: birds(mt), uBirdA: MO.remap(t, A_BIRD, A_29) * ravens,
        uSpeed: (MO.reduced ? 0.4 : 1) * (MO.remap(t, T_RISE - 0.05, T_RISE + 0.2) * (0.35 + 0.65 * MO.env('closedHat', t, 0.09)) + 0.6 * MO.env('openHat', t, 0.12)),
        uSnap: snap && t > T_EYES ? Math.exp(-(t - T_EYES) / 0.22) * (MO.reduced ? 0.4 : 1) : 0, uSnapR: 0.32 + Math.max(0, t - T_EYES) * 5.0, uEyeS: (() => { const dx = (0 - C[0]) * Z, dy = (faceY - C[1]) * Z, a = -tilt; return [Math.cos(a) * dx - Math.sin(a) * dy, Math.sin(a) * dx + Math.cos(a) * dy]; })(),
        uHN: hats, uFade: MO.easeOut(MO.remap(t, T_CUT, A_265)), uFace: MO.smooth(MO.remap(t, T_PUSH - 0.2, T_PUSH + 0.4)),
      };
      if (!K.still) u.uTime = mt;
      return u;
    };
    MO.scene({ id: K.ident ? 'nigredo-sun' : 'nigredo.sun#' + cue.index, fs: N2, uniforms, bloom: 0.7, bloomThreshold: 0.75, vignette: 0.5 });
  });

  // without a cue list in the score (the 30 s piece) the shots take their 30 s windows themselves
  if (!Array.isArray(MO.S.cues)) {
    MO.runShot(MO.makeCue('nigredo.eye', 0, 5));
    MO.runShot(MO.makeCue('nigredo.sun', 5, 16));
  }
})();
