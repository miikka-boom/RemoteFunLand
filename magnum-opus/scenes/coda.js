// CODA — 0 The Fool — 28.235–30.000 s (bar 16). Owner: eye.
// Beat 64: the final hit. ZOOM BACK, CAMERA: we start inside a blazing red-gold mandala that the
// pull-back reveals as the iris of the same great eye that opened the piece (lead turned to gold:
// the black pupil is now a white-hot sun around a black eclipse core). The eye rises into the
// upper part of the frame (the overlay's MAGNUM OPUS logo takes the lower part from beat 65),
// a last glint crosses the cornea, then the eye slowly closes; black by 29.8 s.
// The eye GLSL between the EYE markers is identical in nigredo.js.
(() => {
  const BEAT = MO.BEAT;

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
  // pupil: nigredo = the black sun; rubedo = a white-hot sun around a black eclipse core
  {
    float rpw = rp + 0.008 * sin(a1 * 40.0);
    float pin = 1.0 - smoothstep(-pe, pe, r - rpw);
    float core = r / rp;
    vec3 hot = eyHot * (0.7 + 1.5 * (1.0 - core * core)) * smoothstep(0.30, 0.40, core)
             + eyHot * 2.5 * ey_st(core - 0.35, pe / rp, 0.8);
    col = mix(col, hot * uGold, pin);
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

  const FS = EYE + `
uniform float uZ;      // screen units per eye unit
uniform vec2  uPC;     // screen position of the iris centre
uniform float uFade;   // fade to black at the very end
uniform float uRing;   // shockwave radius from the final hit (screen units)
uniform float uRingA;
uniform float uBgA;    // the blazing red ground (fades as the eye is revealed)
uniform float uLow;    // dims the lower frame for the logo
uniform float uTing;   // a last sparkle as the lids meet

void main() {
  ey_palette(1.0);
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec2 e = (p - uPC) / uZ + EY_IC;
  float pe = px() / uZ;
  float t = uTime;
  // ground: crimson heat with slow Tarot sun rays, continuing the Rubedo mandala; it sinks to black
  vec2 d = p - uPC;
  float r = length(d), a = atan(d.y, d.x);
  float ray = 0.5 + 0.5 * cos(a * 16.0 + 0.25 * t);
  vec3 bg = vec3(0.30, 0.008, 0.02) * (0.45 + 0.55 * ray) * exp(-r * 0.55) * uBgA;
  bg += vec3(0.006, 0.0005, 0.001) + vec3(0.06, 0.004, 0.006) * exp(-dot(e, e) * 0.5) * (1.0 - uBgA);
  vec3 col = ey_eye(bg, e, pe, t);
  // shockwave of the final hit
  if (uRingA > 0.0) {
    float rw = abs(r - uRing) - 0.004 - 0.02 * uRing;
    col += vec3(1.0, 0.7, 0.3) * 1.6 * exp(-max(rw, 0.0) / 0.012) * uRingA;
  }
  col *= mix(1.0, 0.18 + 0.82 * smoothstep(-0.8, -0.05, p.y), uLow);
  if (uTing > 0.0) col += eyHot * 2.2 * sparkle(e, vec2(0.0, 0.0), 0.32 * uTing) * uTing;
  fragColor = vec4(col * uFade, 1.0);
}`;

  const T0 = MO.barTime(16);           // 28.235
  const T_REVEAL = T0 + 2 * BEAT;      // 29.118: the whole eye is in view
  const T_SHUT = T0 + 3.5 * BEAT;      // 29.779: the lids meet
  const uniforms = (t) => {
    const k = MO.clamp((t - T0) / (T_REVEAL - T0));
    const pull = MO.easeInOut(MO.remap(t, T0 + 0.08, T_REVEAL));
    const Z = Math.exp(MO.mix(Math.log(3.4), Math.log(0.80), pull)) * (1 - 0.06 * MO.remap(t, T_REVEAL, 30));
    const close = MO.easeInOut(MO.remap(t, T_REVEAL + 0.05, T_SHUT));
    const settle = 1 + 0.03 * Math.exp(-(t - T0) * 3) * Math.sin((t - T0) * 18);
    return {
      uOpen: (1 - close) * settle, uIgnite: 1, uLines: MO.mix(1, 0.35, MO.easeIn(MO.remap(t, T_REVEAL + 0.2, 29.85))),
      uGlint: MO.remap(t, T_REVEAL - 0.30, T_REVEAL + 0.02), uGold: 1,
      uSpin: 0.9 * (1 - Math.exp(-(t - T0) * 1.5)), uPupil: 1.0 + 0.12 * Math.exp(-(t - T0) / 0.3),
      uLook: [0, 0], uAura: 1.0, uHi: 1 - close,
      uZ: Z, uPC: [0, MO.mix(0.0, 0.30, MO.smooth(k))],
      uFade: 1 - MO.smooth(MO.remap(t, 29.45, 29.80)),
      uRing: 0.15 + (t - T0) * 3.0, uRingA: Math.exp(-(t - T0) / 0.35) * (MO.reduced ? 0.4 : 1),
      uTing: Math.sin(Math.PI * MO.remap(t, T_SHUT - 0.12, T_SHUT + 0.10)), uBgA: 1 - MO.smooth(MO.remap(t, T0 + 0.2, T_REVEAL)), uLow: MO.smooth(MO.remap(t, T0 + BEAT * 0.8, T0 + BEAT * 1.6)),
    };
  };
  MO.scene({ id: 'coda', section: 'coda', from: T0, to: 30.0, fs: FS, uniforms, bloom: 0.4, bloomThreshold: 0.9, vignette: 0.5 });
})();
