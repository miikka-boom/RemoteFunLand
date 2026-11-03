// CODA — 0 The Fool. Owner: eye. One shot factory, coda.eye (30 s piece: beats 64–68, the final
// bar): ZOOM BACK, CAMERA. We start inside a blazing red-gold mandala that the pull-back reveals as
// the iris of the same great eye that opened the piece. The first frame matches rubedo's dive (a
// red-gold iris with a black pupil in a crimson blaze); the hit's shockwave sweeps the blaze away and
// the pupil ignites on screen into a white-hot sun around a black eclipse core (lead turned to gold).
// The eye rises into the upper part of the frame (the overlay's MAGNUM OPUS logo takes the lower
// part from the second beat), a last glint crosses the cornea, then the eye slowly closes and the
// picture fades to black just before the end. Every knob is a uniform, so one program serves every
// cue. Without a cue list in the score the file places the shot at its 30 s window (end of file).
// The eye GLSL between the EYE markers is identical in nigredo.js (and zoomback.js; see nigredo.js for
// its anti-strobe input uAS).
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
uniform vec3  uAS;      // anti-strobe (spec 7.3 rule 1), the eye's motion per 1/30 s: x = |d ln zoom| (zoom about
                        // EY_IC), y = |drift| in eye units (camera + gaze), z = |d spin| (radians). Linework that
                        // would cross a pixel faster fades to its average coverage (moAntiStrobe). 0 = still.

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
  // anti-strobe: fibres crossing this pixel per 1/30 s. The zoom slides the wavy fibres sideways (bounds of
  // their slope along r), the drift and the spin carry them across; fast fibres fade to their average.
  float mzr = r * uAS.x, mdr = 2.5 * uAS.y / rr;
  float as1 = moAntiStrobe(3.2 * mzr + 14.3 * (mdr + uAS.z));
  float as2 = moAntiStrobe(15.5 * mzr + 23.9 * (mdr + 0.7 * uAS.z));
  float as3 = moAntiStrobe(6.4 * mzr + 5.7 * (mdr + 0.7 * uAS.z));
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
  float fw1 = 90.0 / (TAU * rr) * pe, m1 = inner * smoothstep(rp, rp + 0.05, r);
  float f1 = ey_lines(v1, fw1, 0.6) * inner * smoothstep(rp, rp + 0.05, r) * as1;
  float h1 = hash11(floor(v1 + 0.5) + 11.0);
  col += mix(eyVerd, eyBone, 0.15 * h1) * f1 * (0.30 + 0.55 * h1) * lit;
  col += mix(eyVerd, eyBone, 0.075) * 0.575 * min(1.0, 1.2 * fw1) * m1 * (1.0 - as1) * lit;
  // ciliary zone: fine wavy fibres in beaded segments
  float ci = (1.0 - inner) * smoothstep(0.995, 0.93, r);
  float v2 = (a2 + 0.06 * sin(a2 * 8.0 + r * 10.0) + 0.05 * (r - rc)) / TAU * 150.0;
  float fw2 = 150.0 / (TAU * rr) * pe;
  float f2 = ey_lines(v2, fw2, 0.55) * ci * as2;
  float h2 = hash11(floor(v2 + 0.5) + 3.0);
  float seg = 0.55 + 0.45 * sin(r * 34.0 + h2 * TAU);
  col += mix(eyVio, eyBone, 0.10 * h2) * f2 * (0.25 + 0.45 * h2) * seg * lit;
  // bold trabeculae
  float v3 = (a2 + 0.16 * sin(r * 7.0 + a2 * 3.0)) / TAU * 36.0;
  float fw3 = 36.0 / (TAU * rr) * pe;
  float f3 = ey_lines(v3, fw3, 1.1) * ci * as3;
  col += mix(eyVio, eyVerd, 0.5) * f3 * 0.55 * lit;
  col += (mix(eyVio, eyBone, 0.05) * 0.26 * min(1.0, 1.1 * fw2) * (1.0 - as2) + mix(eyVio, eyVerd, 0.5) * 0.55 * min(1.0, 2.2 * fw3) * (1.0 - as3)) * ci * lit;

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
    // anti-strobe: lines crossing this pixel per 1/30 s (zoom about the eye, drift); the fine lines fade to
    // their average coverage, the major ones (every 4th line, crossing 4x less often) at 4x the speed
    float cr = fw * (length(e - EY_IC) * uAS.x + uAS.y) / pe;
    float asc = moAntiStrobe(major > 0.5 ? 0.25 * cr : cr);
    ln = ln * asc + min(1.0, 1.1 * fw) * (1.0 - asc);
    major = major * asc + 0.3375 * (1.0 - asc);
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

  const FS = EYE + `
uniform float uZ;      // screen units per eye unit
uniform vec2  uPC;     // screen position of the iris centre
uniform float uFade;   // fade to black at the very end
uniform float uRing;   // shockwave radius from the final hit (screen units)
uniform float uRingA;
uniform float uBgA;    // the crimson ground (sinks to black as the eye is revealed)
uniform float uBlaze;  // the Rubedo blaze around the iris at the cut (the shockwave sweeps it out)
uniform float uLow;    // dims the lower frame for the logo
uniform float uTing;   // a last sparkle as the lids meet
uniform float uColdK;  // palette knob (1 - params.gold): 0 rubedo .. 1 the nigredo grade
uniform vec2  uRC;     // the ground's and the blaze's ray centre: held where the hit lands, so the 16 rays do
                       // not sweep across the crimson frame as the eye rises (spec 7.3 rules 1 and 6)
// the palette knob's grade: a colour matrix fitted (for hue, scaled up for brightness) so the rubedo
// palette lands on the nigredo one: crimson -> violet, amber -> teal, gold -> pale verdigris. Column-major.
const mat3 EY_COLD = mat3(0.430, 0.264, 0.613,  -0.381, 1.032, 0.296,  1.826, -0.419, -0.120);

void main() {
  ey_palette(1.0);
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec2 e = (p - uPC) / uZ + EY_IC;
  float pe = px() / uZ;
  float t = uTime;
  // ground: crimson heat with slow Tarot sun rays, continuing the Rubedo mandala; it sinks to black
  vec2 d = p - uPC;
  float r = length(d);
  vec2 dr = p - uRC;
  float ray = 0.5 + 0.5 * cos(atan(dr.y, dr.x) * 16.0 + 0.25 * t);
  // the final hit's shockwave sweeps the heat outward: ahead of it (swept = 1) the field still
  // burns, behind it the ground is already dark (no red coming back after the sweep)
  float swept = smoothstep(uRing - 0.05, uRing + 0.30, r);
  vec3 bg = vec3(0.30, 0.008, 0.02) * (0.45 + 0.55 * ray) * exp(-r * 0.55) * uBgA * swept;
  bg += vec3(0.006, 0.0005, 0.001) + vec3(0.06, 0.004, 0.006) * exp(-dot(e, e) * 0.5) * (1.0 - uBgA * swept);
  vec3 col = ey_eye(bg, e, pe, t);
  // the blaze: at the cut everything around the iris still burns red-gold, continuing the Rubedo
  // mandala (R4's ground); it rides ahead of the shockwave, uncovering the dark eye behind it
  if (uBlaze > 0.0) {
    float rI = r / (EY_R * uZ);
    float near = exp(-max(rI - 1.0, 0.0) * 1.2);
    vec3 bz = mix(vec3(0.62, 0.035, 0.02), vec3(0.95, 0.30, 0.05), 0.35 * ray * near) * (0.30 + 0.70 * ray) * (0.55 + 0.45 * near);
    col += bz * uBlaze * smoothstep(1.0, 1.05, rI) * swept;
  }
  // shockwave of the final hit
  if (uRingA > 0.0) {
    float rw = abs(r - uRing) - 0.004 - 0.02 * uRing;
    // it bursts through the gold inner iris and dies before the red crypt band and the crimson ground:
    // passing over the saturated red it dipped and restored the red over a third of the frame (a red flash)
    col += vec3(1.0, 0.7, 0.3) * 1.6 * exp(-max(rw, 0.0) / 0.012) * uRingA * (1.0 - smoothstep(0.42, 0.6, r / (EY_R * uZ)));
  }
  col *= mix(1.0, 0.18 + 0.82 * smoothstep(-0.8, -0.05, p.y), uLow);
  if (uTing > 0.0) col += eyHot * 2.2 * sparkle(e, vec2(0.0, 0.0), 0.32 * uTing) * uTing;
  // the palette knob: a uniform branch, free when off (the palette itself stays a constant: a
  // uniform there costs ~10-20% on SwiftShader, which can no longer fold it into every line)
  if (uColdK > 0.0) col = mix(col, max(EY_COLD * col, 0.0), uColdK);
  fragColor = vec4(col * uFade, 1.0);
}`;

  // ------------------------------------------------------------------ shot coda.eye
  // CODA.EYE: zoom back out of the blazing iris into the whole great eye; the pupil ignites into a
  // white-hot sun; a last glint; the eye closes; fade to black.
  // Natural length: 4 beats (beats 64-68 of the 30 s piece, the final bar; it ends the piece).
  // Stretch: the pull-back, the shockwave, the blaze sweep and the ignition (2 beats) are anchored
  //   to the final hit: the first hit or fx flash / impact of the score in the cue (from a 16th
  //   before its start to 3.9 beats before its end), else the cue start; until a later hit the first
  //   frame holds (the blaze burning, its rays turning). The close (about 0.53 s), the last sparkle
  //   and the fade to black are anchored to the cue end. Between the two the revealed eye holds open:
  //   the iris settles (and keeps turning with spin), the flames flicker, the contour lines slowly
  //   fade and the camera keeps drifting back.
  // Params (range (default): what it looks like):
  //   gold       0..1 (1)      palette: 1 rubedo (gold, crimson), 0 the nigredo grade (violet, teal,
  //                            pale verdigris; a colour matrix) without the iris's gold fill
  //   ignite     0..1 (1)      the pupil's fire after the hit: 1 the white-hot sun, 0 it stays the black sun
  //   blaze      0..1 (1)      the crimson blaze and ground at the start (rubedo's dive); 0 starts on black
  //   close      0/1 (1)       the eye closes and the picture fades to black at the end; 0 holds it open
  //   low        0..1 (1)      dims the lower frame (for the overlay's logo or titles)
  //   spin       -2..2 (0)     keeps the iris rings turning (radians per second; above ~0.1 the fine
  //                            fibres stay soft, see Safety)
  //   zoom       0.3..3 (1)    camera zoom
  //   x, y       -1..1 (0)     eye screen position (added to its rise into the upper frame)
  //   speed      0..16 (1)     ambient motion rate (flame flicker, line wobble, the ground's rays)
  //   seed       any (0)       phase of that motion
  //   offsetBeats 0..4 (0)     start partway (2 = the eye already revealed)
  // Coupling: its first frame matches rubedo's last (the dive into a red-gold iris with a black pupil
  //   in a crimson blaze: zoom 3.4, pupil 0.73) and, in the full version, zoomback.set's last: the numbers
  //   live in MO.MATCH.codaEye (defined here or by zoomback.js, whichever loads first) and this shot reads
  //   them; the overlay's logo sits in the dimmed lower frame from the second beat; with close it ends on
  //   black.
  // Safety (7.3 rule 1): the iris settles from 0.7 rad/s after the hit (the 30 s piece: 1.35 rad/s, which
  //   swept the 22 crypts and the rosette across a pixel 3-6 times a second); the crimson ground's and the
  //   blaze's 16 rays stay centred where the hit lands (uRC) instead of sliding with the rising eye, which
  //   flickered the saturated red field (rule 6). uAS carries the pull-back (x4.25 in 2 beats), the eye's
  //   rise and the iris's spin (plus params.spin) per 1/30 s, measured one frame back, so the first frame is
  //   still and matches the shot before. Reduced mode draws no shockwave ring (passing over the saturated
  //   crimson field it dips and restores the red: a red flash).
  // Red (rule 6, measured with zoomback.set before it): the score's warm flash on the hit over the crimson
  //   frame is a red flash by itself (amount 0.45; at 0.11 it is not); the sweep that clears the crimson
  //   blaze off the eye is one more red transition, so the second after the hit holds 1.5-2 red flashes in
  //   normal mode and 0-0.5 in reduced. While they move fast the contour lines and the iris fibres
  //   fade to their average glow and sharpen again as the eye settles (about 1.2 s after the hit). spin
  //   above about 0.1 rad/s keeps the fine ciliary fibres partly soft for the whole hold. The shockwave ring
  //   is x0.4 in reduced mode; the lids close once, slowly (0.35 s): not a blink.
  // Cost: as in the 30 s piece (one shader; about 60 ms per 640x360 frame on SwiftShader).
  // coda.eye's first frame, shared through MO.MATCH with zoomback.set, whose pull-back settles on it (spec
  // 4.1 rule 9: the cut 99.4 -> 100.1). Whoever loads first defines it; nobody overrides it. zoom: screen
  // units per eye unit (the iris, 0.40, at 1.36: rubedo's heart iris, MO.MATCH.heartIris); pupil: the pupil
  // factor (0.33 x 0.73 = 0.24 of the iris); pc: the iris centre; spin 0; the blaze and the crimson ground
  // at full strength; its post settings.
  MO.MATCH = MO.MATCH || {};
  MO.MATCH.codaEye = MO.MATCH.codaEye || { zoom: 3.4, pupil: 0.73, pc: [0, 0], spin: 0, blaze: 1, bloom: 0.28, bloomThreshold: 0.9, vignette: 0.5 };
  const M = MO.MATCH.codaEye;
  const N_T0 = MO.barTime(16);                // 28.235: the final hit in the 30 s piece
  const N_REVEAL = N_T0 + 2 * BEAT;           // 29.118: the whole eye is in view
  // the first hit or fx flash / impact of the score in [a, b], or null
  const firstHit = (a, b) => {
    let best = null;
    for (const h of MO.events.hits || []) if (h.t >= a && h.t <= b && (best === null || h.t < best)) best = h.t;
    for (const f of MO.S.fx || []) {
      const ft = f.beat * BEAT;
      if ((f.type === 'flash' || f.type === 'impact') && ft >= a && ft <= b && (best === null || ft < best)) best = ft;
    }
    return best;
  };
  MO.shot('coda.eye', (cue) => {
    const K = cueClock(cue, 64, 68, 2.1, 1.9);
    const gold = K.p('gold', 1, 0, 1), ignite = K.p('ignite', 1, 0, 1), blaze = K.p('blaze', 1, 0, 1), low = K.p('low', 1, 0, 1);
    const closeOn = K.on('close', true), spin = K.p('spin', 0, -2, 2), zoom = K.p('zoom', 1, 0.3, 3), ex = K.p('x', 0, -1, 1), ey = K.p('y', 0, -1, 1);
    // the final hit: in the score inside the cue, else the cue start
    let T0 = K.S(N_T0);
    if (!K.off) { const hit = firstHit(cue.from - MO.STEP, cue.to - 3.9 * BEAT); if (hit !== null && K.d(hit - T0) !== 0) T0 = hit; }
    const sq = K.sq, th = sq === 1 ? (t) => t : (t) => T0 + (t - T0) * sq;   // head time (sped up on a squeezed cue)
    const T_REVEAL = T0 + 2 * BEAT;           // head time: the whole eye is in view
    const R_REVEAL = T0 + 2 * BEAT / sq;      // and its real time
    const T_CLOSED = K.E(29.70);              // the lids meet, so the closed eye and the logo hold while the fade (29.45-29.80) ends
    // the slow close: smoothstep on the lid opening, so the visible travel (uOpen 0.9 -> 0.1, below
    // which the slit already reads as shut) spans about 0.35 s instead of 5 frames
    const C_FROM = Math.min(Math.max(R_REVEAL + 0.05, K.E(N_REVEAL + 0.05)), T_CLOSED - 0.25);
    const F0 = K.E(29.45), F1 = K.E(29.80), L1 = K.E(29.85), Z1 = K.E(30);
    // the camera (zoom, the eye's rise) and the iris spin at time t
    const cam = (t) => {
      const h = th(t), mt = K.M(t), a = Math.max(0, h - T0);
      const k = MO.clamp((h - T0) / (T_REVEAL - T0));
      const pull = MO.easeInOut(MO.remap(h, T0 + 0.08, T_REVEAL));
      const Z = Math.exp(MO.mix(Math.log(M.zoom), Math.log(0.80), pull)) * (1 - 0.06 * MO.remap(t, R_REVEAL, Z1)) * zoom;
      return { Z, y: MO.mix(M.pc[1], 0.30, MO.smooth(k)) + ey, spin: 0.9 * (1 - Math.exp(-a * 0.78)) + spin * (mt - T0) };   // settles from 0.7 rad/s (7.3 rule 1: the crypts and the rosette)
    };
    const uniforms = (t) => {
      const h = th(t), mt = K.M(t), a = Math.max(0, h - T0);
      const c = cam(t), c0 = cam(t - 1 / 30), Z = c.Z, c0y = cam(T0).y;
      // lead to gold: at the cut the pupil is rubedo's black disc (0.24 of the iris radius); during
      // the pull-back it ignites from the rim inward and swells into the white-hot sun
      const sun = MO.smooth(MO.remap(h, T0 + 0.12, T0 + 0.72));
      const close = closeOn ? MO.smooth(MO.remap(t, C_FROM, T_CLOSED)) : 0;
      const settle = 1 + 0.03 * Math.exp(-a * 3) * Math.sin(a * 18);
      const u = {
        uOpen: (1 - close) * settle, uIgnite: 1, uLines: MO.mix(1, 0.35, MO.easeIn(MO.remap(t, R_REVEAL + 0.2, L1))),
        uGlint: MO.remap(h, T_REVEAL - 0.30, T_REVEAL + 0.02), uGold: gold, uColdK: 1 - gold, uSun: sun * ignite,
        uSpin: c.spin, uPupil: MO.mix(M.pupil, 1.0, sun),
        // the cornea highlights arrive with the eye, not on rubedo's iris at the cut
        uLook: [0, 0], uAura: 1.0, uHi: (1 - close) * MO.smooth(MO.remap(h, T0 + 0.25, T0 + 0.7)),
        uZ: Z, uPC: [M.pc[0] + ex, c.y], uRC: [M.pc[0] + ex, c0y],
        // anti-strobe (7.3 rule 1): the pull back, the rise and the spin per 1/30 s (the first frame is still)
        uAS: [Math.abs(Math.log(c.Z / c0.Z)), Math.abs(c.y - c0.y) / Z, Math.abs(c.spin - c0.spin)],
        uFade: closeOn ? 1 - MO.smooth(MO.remap(t, F0, F1)) : 1,
        uRing: 0.15 + (h - T0) * 3.0, uRingA: h < T0 || MO.reduced ? 0 : Math.exp(-(h - T0) / 0.35),   // reduced: no ring (it dips the crimson field's red: a red flash)
        uBlaze: (1 - MO.smooth(MO.remap(h, T0 + 0.5, T0 + 0.9))) * blaze,
        uTing: closeOn ? Math.sin(Math.PI * MO.remap(t, T_CLOSED - 0.14, T_CLOSED + 0.06)) : 0,
        uBgA: (1 - MO.smooth(MO.remap(h, T0 + 0.2, T_REVEAL))) * blaze,
        uLow: MO.smooth(MO.remap(h, T0 + BEAT * 0.8, T0 + BEAT * 1.6)) * low,
      };
      if (!K.still) u.uTime = mt;
      return u;
    };
    // bloom eases in with the pupil's fire so the first frames keep rubedo's contrast
    const bloom = (t) => M.bloom + 0.12 * MO.smooth(MO.remap(th(t), T0 + 0.2, T0 + 0.7));
    MO.scene({ id: K.ident ? 'coda' : 'coda.eye#' + cue.index, fs: FS, uniforms, bloom, bloomThreshold: M.bloomThreshold, vignette: M.vignette });
  });

  // without a cue list in the score (the 30 s piece) the shot takes its 30 s window itself
  if (!Array.isArray(MO.S.cues)) MO.runShot(MO.makeCue('coda.eye', 64, 68));
})();
