// RUBEDO — XXI The World — 21.176–28.235 s (bars 12–16): THE DROP.
// Four one-bar shots, each its own shader so only one runs per frame:
//   R1 bar 12  the Mandala of the Self assembles around the World dancer ("Burn me in the fire")
//   R2 bar 13  the chemical wedding: Sol and Luna orbit a chrome vessel over a checkerboard
//              floor; the leaden sphere turns to gold ("turn my lead to gold")
//   R3 bar 14  fly-through: a tunnel of rings of figures and eyes, lasers ("Magnum Opus")
//   R4 bar 15  the mandala in full bloom, then a rapid zoom into its heart ("I am whole!")
// Everything is a pure function of time. All helpers here use the rb_ prefix.
(() => {
  const B = MO.BAR;
  const T0 = MO.barTime(12);

  // ------------------------------------------------------------------ shared GLSL
  const RB_LIB = `
uniform float uST;      // seconds since the drop (beat 48)
uniform float uKT;      // seconds since the last kick
uniform float uCT;      // seconds since the last clap
uniform float uOT;      // seconds since the last open hat
uniform float uHT;      // seconds since the last closed hat
uniform float uHN;      // closed hats so far
uniform float uClapStep;// claps in this section, eased (kaleidoscope steps)
uniform float uSpinT;   // ring rotation clock (runs faster in R4)
uniform float uDive;    // 0..1 the final dive into the heart (R4 only)
uniform float uInvAmt;  // strength of the clap inversion (R4 halves it: its gold figures are brighter)

const vec3 RB_CRIM  = vec3(0.80, 0.015, 0.05);
const vec3 RB_VERM  = vec3(1.00, 0.22, 0.035);
const vec3 RB_SCAR  = vec3(1.00, 0.05, 0.03);
const vec3 RB_MAG   = vec3(0.85, 0.02, 0.40);
const vec3 RB_GOLD  = vec3(1.00, 0.62, 0.15);
const vec3 RB_HOT   = vec3(1.00, 0.86, 0.64);
const vec3 RB_ULTRA = vec3(0.05, 0.07, 0.45);

vec2 rb_rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
// anti-aliased line of half-width w around d = 0 (e = one pixel in d's units)
float rb_ln(float d, float w, float e) { return 1.0 - smoothstep(w - e, w + e, abs(d)); }
float rb_fl(float d, float e) { return 1.0 - smoothstep(-e, e, d); }
float rb_g(float x) { return exp(-x * x); }
// contrast toe in linear HDR: deepens the darks, keeps the highlights
vec3 rb_grade(vec3 c) { c = max(c, 0.0); return c * c / (c + 0.07); }
// repeated contour lines of an SDF, spacing s; fades to its average where too dense to resolve
float rb_cont(float d, float s, float w, float e) {
  float f = abs(fract(d / s + 0.5) - 0.5) * s;
  float l = 1.0 - smoothstep(w - e, w + e, f);
  return mix(min(1.0, 2.0 * w / s), l, smoothstep(3.0 * e, 7.0 * e, s));
}
// straight local frame in a polar repetition: x tangential, y radial (distance from centre), z id
vec3 rb_polar(vec2 p, float n, float ang) {
  float w = TAU / n;
  float a = atan(p.y, p.x) - ang;
  float id = floor(a / w + 0.5);
  float la = a - id * w;
  float r = length(p);
  return vec3(r * sin(la), r * cos(la), mod(id, n));
}
// kick pump: light breathes out of the heart on the four-on-the-floor. Partial in space as well as in
// amount: only the middle of the frame pulses (w = 1 there, ~0 at the edges), because at 2.27 kicks/s
// a full-frame pulse alone would use most of the 3 flashes/s budget. Reduced: +4 %.
vec3 rb_pump(vec3 col, float w) {
  return col * (0.95 + mix(0.25, 0.04, uReduced) * exp(-uKT / 0.16) * w);
}
// eye blink on open hats: closes in 30 ms, open again by 170 ms. Each eye starts up to 0.14 s late
// (delay from its id), so the blink ripples through the rings instead of every white eye in the
// frame shutting on the same frame, and callers only half-close them (a squint): at 2.27 per second
// full blinks of every white eye on screen read as a strobe
float rb_blink(float id) {
  float x = uOT - 0.14 * fract(id * 0.6180339);
  return smoothstep(0.0, 0.03, x) * (1.0 - smoothstep(0.06, 0.17, x)) * step(x, 0.3);
}

// almond eye: q local (x along the eye, y across), half width hw, half height hh
vec3 rb_eye(vec2 q, float hw, float hh, float e, float blink, float seed, float tt) {
  float hhb = max(hh * (1.0 - 0.94 * blink), 0.002);
  float dv = sdVesica(vec2(q.y, q.x), hhb, hw);
  vec3 col = vec3(0.0);
  // lid contour lines (many fine parallel lines, Alex Grey)
  float lids = rb_cont(dv, hh * 0.36, 0.5 * e, e) * step(0.0, dv) * exp(-dv / (hh * 0.6));
  col += lids * mix(RB_GOLD, RB_MAG, sat(dv / (hh * 1.2))) * 0.9;
  float inside = rb_fl(dv, e);
  if (inside > 0.0) {
    vec2 ic = vec2(0.12 * hw * sin(tt * 1.3 + seed * 5.0), 0.0);
    float ri = length(q - ic);
    float irisR = hh * 0.78;
    float an = atan(q.y - ic.y, q.x - ic.x);
    vec3 sclera = mix(vec3(0.95, 0.72, 0.62), vec3(0.30, 0.03, 0.08), smoothstep(0.0, hw, abs(q.x)));
    float fib = 0.55 + 0.45 * cos(an * 26.0 + 3.0 * ri / irisR);
    vec3 iris = mix(vec3(2.2, 0.8, 0.12), vec3(0.6, 0.01, 0.04), smoothstep(0.25 * irisR, irisR, ri)) * fib;
    iris = mix(iris, vec3(0.0), rb_fl(ri - irisR * 0.38, e));
    iris += vec3(1.6, 0.6, 0.15) * rb_ln(ri - irisR, 0.6 * e, e);
    vec3 eyeC = mix(sclera, iris, rb_fl(ri - irisR, e));
    eyeC += 3.0 * RB_HOT * rb_fl(length(q - ic - vec2(-0.3, 0.35) * irisR) - irisR * 0.13, e);
    col = mix(col, eyeC, inside);
  }
  col += RB_GOLD * 1.6 * rb_ln(dv, 0.8 * e, e);
  return col;
}

// alchemical glyph line mask in a unit medallion (radius ~1). One parametric pass (a circle,
// a triangle, three segments + the moon/sun/mercury specials) instead of a 12-way branch chain:
// 0 sun, 1 moon, 2 fire, 3 water, 4 air, 5 earth, 6 mercury, 7 sulphur, 8 salt, 9 copper, 10 iron, 11 antimony
const vec3 RB_GC[12] = vec3[12](vec3(0.0, 0.0, 0.55), vec3(0.0, 0.0, 0.58), vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0),
  vec3(0.0, 0.12, 0.30), vec3(0.0), vec3(0.0, 0.0, 0.55), vec3(0.0, 0.22, 0.33), vec3(-0.12, -0.12, 0.36), vec3(0.0, -0.18, 0.38));
// triangle: (direction +1 up / -1 down, size, centre y in the flipped frame)
const vec3 RB_GT[12] = vec3[12](vec3(0.0), vec3(0.0), vec3(1.0, 0.62, -0.08), vec3(-1.0, 0.62, -0.08), vec3(1.0, 0.62, -0.08), vec3(-1.0, 0.62, -0.08),
  vec3(0.0), vec3(1.0, 0.40, 0.25), vec3(0.0), vec3(0.0), vec3(0.0), vec3(0.0));
const vec4 RB_GN = vec4(9.0, 9.0, 9.0, 9.0);
const vec4 RB_GS[36] = vec4[36](
  RB_GN, RB_GN, RB_GN,   RB_GN, RB_GN, RB_GN,   RB_GN, RB_GN, RB_GN,   RB_GN, RB_GN, RB_GN,
  vec4(-0.5, 0.0, 0.5, 0.0), RB_GN, RB_GN,
  vec4(-0.5, 0.0, 0.5, 0.0), RB_GN, RB_GN,
  vec4(0.0, -0.18, 0.0, -0.75), vec4(-0.22, -0.48, 0.22, -0.48), RB_GN,
  vec4(0.0, 0.05, 0.0, -0.75), vec4(-0.28, -0.40, 0.28, -0.40), RB_GN,
  vec4(-0.55, 0.0, 0.55, 0.0), RB_GN, RB_GN,
  vec4(0.0, -0.11, 0.0, -0.78), vec4(-0.25, -0.45, 0.25, -0.45), RB_GN,
  vec4(0.14, 0.14, 0.55, 0.55), vec4(0.55, 0.55, 0.22, 0.55), vec4(0.55, 0.55, 0.55, 0.22),
  vec4(0.0, 0.20, 0.0, 0.78), vec4(-0.22, 0.50, 0.22, 0.50), RB_GN);
float rb_glyph(vec2 p, float id, float e) {
  int k = int(mod(id + 0.5, 12.0));
  vec3 c = RB_GC[k];
  float d = c.z > 0.0 ? abs(length(p - c.xy) - c.z) : 1e3;
  d = k == 1 ? abs(max(length(p) - 0.58, -(length(p - vec2(0.26, 0.10)) - 0.50))) : d;
  d = k == 0 ? min(d, length(p) - 0.10) : d;
  d = k == 6 ? min(d, abs(length(p - vec2(0.0, 0.62)) - 0.26) + step(0.62, p.y) * 1e3) : d;
  vec3 tr = RB_GT[k];
  float dt = abs(sdTriangle(vec2(p.x, p.y * tr.x) - vec2(0.0, tr.z), max(tr.y, 0.1)));
  d = tr.y > 0.0 ? min(d, dt) : d;
  for (int i = 0; i < 3; i++) { vec4 sg = RB_GS[k * 3 + i]; d = min(d, sdSegment(p, sg.xy, sg.zw)); }
  return rb_ln(d, 0.06 + 0.5 * e, e);
}

// medallion: dark ultramarine disc, double gold rim, glyph
vec3 rb_medal(vec2 q, float rad, float id, float e, float glow) {
  float r = length(q);
  vec3 col = vec3(0.0);
  float disc = rb_fl(r - rad, e);
  vec3 ground = mix(vec3(0.015, 0.02, 0.16), vec3(0.08, 0.0, 0.04), r / rad);
  col = ground * disc;
  col += RB_GOLD * 1.4 * (rb_ln(r - rad, 0.9 * e, e) + 0.7 * rb_ln(r - rad * 0.84, 0.6 * e, e));
  col += mix(RB_GOLD * 1.8, RB_HOT * 3.5, glow) * rb_glyph(q / (rad * 0.72), id, e / (rad * 0.72)) * disc;
  col += RB_SCAR * 0.35 * exp(-max(r - rad, 0.0) / (0.2 * rad)) * step(rad, r) * (0.2 + glow);
  return col;
}

// figure with raised arms, in body space (feet y=-1, head y=1), scale s (units per body unit)
vec3 rb_figShade(float d, vec2 bp, float s, float e, float tt, float seed, float inv, float hk) {
  vec3 col = vec3(0.0);
  float wob = 0.12 * s * sin(bp.y * 4.0 - tt * 9.0 + seed * 1.7);
  float da = d + wob * smoothstep(0.0, 0.25 * s, d);
  if (d > 0.0) {
    float aura = rb_cont(da, 0.16 * s, 0.5 * e, e) * exp(-da / (0.30 * s));
    col += aura * mix(RB_GOLD * 0.9, RB_SCAR * 0.6, sat(da / (0.35 * s)));
    col += RB_SCAR * 0.10 * exp(-d / (0.15 * s));
  }
  float inside = rb_fl(d, e);
  if (inside > 0.0) {
    vec3 body = mix(vec3(0.10, 0.0, 0.02), vec3(0.55, 0.02, 0.03), sat(-d / (0.12 * s)));
    body = mix(body, vec3(2.4, 1.5, 0.7) - body * 0.8, inv);
    float anat = rb_cont(d, 0.07 * s, 0.45 * e, e);
    body += anat * vec3(1.0, 0.36, 0.06) * (1.0 - inv);
    float spine = rb_ln(bp.x * s, 0.5 * e, e) * step(-0.05, bp.y) * step(bp.y, 0.75);
    body += spine * RB_GOLD * 1.2;
    float heart = exp(-dot(bp - vec2(0.0, 0.44), bp - vec2(0.0, 0.44)) * 60.0);
    body += heart * RB_HOT * 2.5 * hk;
    col = mix(col, body, inside);
  }
  col += mix(RB_GOLD * 1.6, vec3(0.1, 0.0, 0.0), inv) * rb_ln(d, 0.75 * e, e);
  return col;
}
vec3 rb_figure(vec2 bp, float s, float e, float tt, float seed, float inv, float hk) {
  return rb_figShade(sdBody(bp, 1.0) * s, bp, s, e, tt, seed, inv, hk);
}

// flame tongue, local x across, y along (0 base .. L tip)
float rb_flameD(vec2 q, float W, float L, float tt, float seed, float wav) {
  float v = q.y / L;
  float sway = (0.35 * W * sin(v * 6.0 - tt * 8.0 + seed * 2.3) + wav * 0.6 * W * sin(v * 11.0 - tt * 11.0 + seed)) * v;
  float wv = W * (1.0 - v) * (0.35 + 1.4 * sqrt(max(v, 0.0)));
  float d = (abs(q.x - sway) - wv) * 0.7;
  return max(d, max(-q.y, q.y - L));
}

// ---- the Mandala of the Self -----------------------------------------------------
// p: mandala space (radius 1 ~ half the frame height at zoom 1), e: one pixel in p units,
// tt: time, bloom: 0..1 extra intensity (R4). (The drop no longer reveals it behind a front: the
// colour hits fully lit on the first frame after the impact.)
vec3 rb_ground(vec2 p, float r, float e, float tt) {
  vec3 col = mix(vec3(0.030, 0.001, 0.008), vec3(0.003, 0.003, 0.022), smoothstep(0.3, 2.0, r));
  float a = atan(p.y, p.x);
  // fine concentric linework + 12-fold radials
  col += vec3(0.30, 0.02, 0.05) * rb_cont(r - 0.02 * tt, 0.024, 0.45 * e, e) * 0.35;
  float rad = abs(fract(a * 24.0 / TAU + 0.5) - 0.5) * TAU / 24.0 * r;
  col += vec3(0.6, 0.08, 0.04) * rb_ln(rad, 0.5 * e, e) * 0.25;
  // a slow ray burst behind everything: straight and wavy rays alternating
  float ra = a * 16.0 / TAU + 0.02 * tt;
  float wv = mod(floor(ra + 0.5), 2.0);
  float rx = abs(fract(ra + 0.5) - 0.5 + wv * 0.08 * sin(r * 14.0 - tt * 3.0));
  col += mix(vec3(0.20, 0.01, 0.02), vec3(0.14, 0.0, 0.06), wv) * smoothstep(0.30, 0.0, rx) * smoothstep(0.3, 1.0, r) * exp(-r * 0.6);
  return col;
}

vec3 rb_centre(vec2 p, float e, float tt, float heat, float db, vec2 bp) {
  float r = length(p);
  float dv = sdVesica(p, 0.19, 0.34);
  vec3 col = vec3(0.0);
  float a = atan(p.y, p.x);
  // mandorla interior: deep crimson-magenta with radiant rays and a hot core
  if (dv < 0.004) {
    float rays = 0.5 + 0.5 * cos(a * 32.0 - tt * 3.0);
    vec3 inner = mix(vec3(0.55, 0.03, 0.03), vec3(0.06, 0.0, 0.04), sat(r / 0.30)) * heat;
    inner *= 0.65 + 0.35 * rays;
    inner += RB_VERM * 0.8 * exp(-r * r * 60.0) * heat * heat * (1.0 - uDive);
    inner = mix(inner, vec3(0.08, 0.0, 0.02) + vec3(0.5, 0.02, 0.02) * rays * 0.4, smoothstep(0.15, 0.70, uDive));
    inner += vec3(0.7, 0.04, 0.12) * rb_cont(dv, 0.018, 0.5 * e, e) * 0.5;
    col = inner;
  }
  // the wreath of fire around the mandorla
  float th = atan(p.y / 0.34, p.x / 0.19);
  float N = 30.0;
  float seg = floor(th / TAU * N + 0.5);
  float lx = (th / TAU * N - seg) * 0.058;
  float L = 0.075 + 0.02 * sin(seg * 2.1 + tt * 6.0);
  float fd = rb_flameD(vec2(lx, dv + 0.01), 0.012, L, tt, seg, 0.5);
  float fd2 = rb_flameD(vec2(lx + 0.029 * sign(fract(seg * 0.5) - 0.25), dv + 0.004), 0.008, L * 0.65, tt * 1.2, seg + 7.0, 1.0);
  float fdm = min(fd, fd2);
  float ff = rb_fl(fdm, e);
  vec3 flameC = mix(RB_HOT * 2.2, RB_SCAR * 0.9, sat((dv + 0.01) / L));
  col = mix(col, flameC, ff * step(-0.02, dv));
  col += RB_VERM * 1.0 * rb_cont(fdm, 0.008, 0.45 * e, e) * step(0.0, fdm) * exp(-fdm / 0.012) * step(-0.01, dv);
  col += RB_HOT * 1.8 * rb_ln(dv, 0.9 * e, e) + RB_GOLD * 1.1 * rb_ln(dv + 0.012, 0.6 * e, e);
  col += RB_SCAR * 0.18 * exp(-max(dv, 0.0) / 0.04) * step(0.0, dv);
  // the World dancer, arms raised; heart chakra at the mandala centre
  float s = 0.19;
  float dvis = 1.0 - smoothstep(0.45, 0.80, uDive);   // uDive is dive progress in log-zoom: the dancer crossfades out over ~9 frames
  if (db < 0.06 && dvis > 0.0) {
    vec3 col0 = col;
    float wob = 0.012 * sin(bp.y * 5.0 - tt * 10.0);
    float da = db + wob * smoothstep(0.0, 0.02, db);
    col += step(0.0, db) * rb_cont(da, 0.011, 0.5 * e, e) * exp(-da / 0.03) * mix(RB_GOLD * 1.6, RB_SCAR * 0.8, sat(da / 0.05));
    float inside = rb_fl(db, e);
    vec3 body = mix(vec3(1.1, 0.30, 0.06), vec3(0.30, 0.01, 0.03), sat(-db / 0.018));
    body += vec3(2.0, 1.0, 0.35) * rb_cont(db, 0.0085, 0.45 * e, e);
    // nerves: spine + seven chakras (now all molten, white at the heart)
    body += RB_HOT * 2.0 * rb_ln(bp.x * s, 0.6 * e, e) * step(-0.05, bp.y) * step(bp.y, 0.9);
    float ci = step(0.04, bp.y) + step(0.175, bp.y) + step(0.345, bp.y) + step(0.55, bp.y) + step(0.765, bp.y) + step(0.93, bp.y);
    float dc = length(bp - chakraPos(int(ci))) * s;
    body += mix(chakraColor(ci) * 3.0, RB_HOT * 4.0, 0.35) * exp(-dc * dc / (0.006 * 0.006));
    col = mix(col, body, inside);
    col += RB_HOT * 3.2 * rb_ln(db, 0.9 * e, e);
    col = mix(col0, col, dvis);
  }
  // the heart: a blazing iris (the camera dives into it at the very end; the coda opens in an iris)
  float ir = length(p);
  float irR = 0.02;
  if (ir < irR * 1.8) {
    float an = atan(p.y, p.x);
    float x = ir / irR, le = e / irR;
    vec3 irisC = mix(vec3(0.55, 0.05, 0.02), vec3(0.16, 0.0, 0.03), smoothstep(0.2, 1.0, x));
    irisC += vec3(1.0, 0.25, 0.02) * exp(-max(x - 0.24, 0.0) * 5.0) * 0.8;      // pupillary glow
    // radial filaments, two layers, gently wavy (fade when too dense to resolve)
    float w1 = an * 72.0 / TAU + 0.35 * sin(x * 9.0 + an * 3.0);
    float g1 = abs(fract(w1) - 0.5) * TAU / 72.0 * x;
    float sp1 = TAU / 72.0 * x;
    irisC += mix(vec3(2.4, 1.1, 0.2), vec3(1.2, 0.1, 0.05), x) * rb_ln(g1, 0.6 * le, le) * smoothstep(3.0 * le, 7.0 * le, sp1) * step(0.24, x);
    float w2 = an * 160.0 / TAU - 0.5 * sin(x * 13.0 - an * 5.0);
    float g2 = abs(fract(w2) - 0.5) * TAU / 160.0 * x;
    float sp2 = TAU / 160.0 * x;
    irisC += vec3(1.2, 0.3, 0.05) * rb_ln(g2, 0.45 * le, le) * smoothstep(3.0 * le, 7.0 * le, sp2) * step(0.45, x);
    // crypts: dark almonds around the collarette
    vec3 cq = rb_polar(p / irR, 18.0, 0.2 * tt);
    float crypt = sdVesica(vec2(cq.x, cq.y - 0.62), 0.045, 0.12);
    irisC = mix(irisC, vec3(0.03, 0.0, 0.01), rb_fl(crypt, le) * 0.85);
    irisC += RB_GOLD * 1.2 * rb_ln(crypt, 0.4 * le, le);
    irisC += RB_HOT * 1.8 * rb_ln(x - 0.45 - 0.035 * sin(an * 12.0 + tt), 0.4 * le + 0.004, le);   // collarette
    irisC = mix(irisC, vec3(0.03, 0.0, 0.01), smoothstep(0.88, 1.0, x));                     // limbal ring
    irisC = mix(irisC, vec3(0.0), rb_fl(x - 0.24, le));                                         // pupil
    irisC += RB_HOT * 2.2 * rb_ln(x - 0.24, 0.5 * le + 0.004, le);
    irisC += vec3(2.4, 0.6, 0.08) * rb_ln(x - 1.0, 0.5 * le + 0.004, le);
    float halo = exp(-max(x - 1.0, 0.0) * 4.0) * step(1.0, x);
    col = mix(col, irisC, rb_fl(x - 1.0, le)) + vec3(0.5, 0.06, 0.02) * halo * uDive;
  }
  return col;
}

vec3 rb_mandala(vec2 p, float e, float tt, float bloom) {
  float r = length(p);
  vec3 col = rb_ground(p, r, e, tt);
  float sp = uSpinT;
  float cstep = uClapStep;
  // odd claps invert the figures; never on the drop's first clap (uST < 1) nor during the R4 dive
  float inv = (mod(uClapN, 2.0) > 0.5 ? 1.0 : 0.0) * exp(-uCT / 0.13) * (1.0 - uReduced) * uInvAmt
            * step(1.0, uST) * (1.0 - step(1e-4, uDive));

  // ---- shared primitives: each expensive shape is evaluated ONCE per pixel, its instance chosen
  // by radius (software GL runs every branch, so code size is the cost, not what is taken)
  float ow = TAU / 48.0;                                   // outer field: log-polar cells
  float lr = log(max(r, 1e-3) / 1.45) / ow;
  float row = floor(lr);
  float oa = atan(p.y, p.x) / ow + 0.5 * mod(row, 2.0) + sp * 0.25 * (mod(row, 2.0) * 2.0 - 1.0);
  float oid = floor(oa);
  vec2 cell = vec2(fract(oa) - 0.5, fract(lr) - 0.5);
  float ce = e / (r * ow);
  float figRow = mod(row, 2.0) < 0.5 ? 1.0 : 0.0;
  vec3 qa = rb_polar(p, 24.0, 0.16 * sp + cstep * TAU / 24.0);
  // the figure: the World dancer (centre), ring A (Net of Being), or an outer-field figure
  vec2 fbp = r < 0.45 ? p / 0.19 + vec2(0.0, 0.44) : r < 1.2 ? vec2(qa.x, qa.y - 0.70) / 0.10 : cell * 2.1;
  float fs = r < 0.45 ? 0.19 : r < 1.2 ? 0.10 : 1.0;
  float fe = r < 1.2 ? e : ce;
  float fseed = r < 1.2 ? qa.z : oid;
  float dB = sdBody(fbp, 1.0) * fs;
  vec3 figC = rb_figShade(dB, fbp, fs, fe, tt, fseed, inv, 1.0);
  // the eye: ring B or an outer-field eye
  vec3 qb = rb_polar(p, 20.0, -0.10 * sp - cstep * TAU / 40.0);
  bool ringB = r < 1.2;
  float eid = ringB ? qb.z : oid + row * 7.0;
  vec3 eyeC = rb_eye(ringB ? vec2(qb.x, qb.y - 0.912) : cell, ringB ? 0.088 : 0.40, ringB ? 0.046 : 0.22, ringB ? e : ce, (ringB ? 0.7 : 0.45) * rb_blink(eid), eid, tt);
  // the medallion: a corner creature (quaternity) or one of ring C's glyphs
  vec3 qc = rb_polar(p, 16.0, 0.07 * sp + cstep * TAU / 16.0);
  vec2 ap = abs(p);
  float cid = (p.x > 0.0 ? 0.0 : 1.0) + (p.y > 0.0 ? 0.0 : 2.0);
  float cg = cid < 0.5 ? 2.0 : cid < 1.5 ? 4.0 : cid < 2.5 ? 3.0 : 5.0;
  bool corner = r < 0.8;
  vec2 mq = corner ? vec2(p.x > 0.0 ? 1.0 : -1.0, 1.0) * (ap - vec2(0.362)) * vec2(1.0, sign(p.y)) : vec2(qc.x, qc.y - 1.07);
  float mrad = corner ? 0.072 : 0.064;
  float mglow = corner ? uCrash : uCrash + 0.6 * exp(-uKT / 0.1) * step(mod(qc.z + uKickN, 4.0), 0.5);
  vec3 md = rb_medal(mq, mrad, corner ? cg : qc.z, e, mglow);
  float mm = rb_fl(length(mq) - mrad * (corner ? 1.04 : 1.06), e);

  // ---- centre: World dancer in the mandorla of fire
  if (r < 0.40) col = col * (1.0 - rb_fl(sdVesica(p, 0.19, 0.34), e)) + rb_centre(p, e, tt, smoothstep(0.08, 0.5, uST) + bloom, dB, fbp);

  // ---- circle C0, quaternity square, lotus petals, four medallions
  if (r > 0.33 && r < 0.60) {
    // lotus petals 16 + 16, between the circle C0 and the square's corners
    vec3 q = rb_polar(p, 16.0, 0.05 * sp + cstep * TAU / 32.0);
    float pd = sdVesica(vec2(q.x, q.y - 0.445), 0.040, 0.085);
    vec3 q2 = rb_polar(p, 16.0, 0.05 * sp + TAU / 32.0 + cstep * TAU / 32.0);
    float pd2 = sdVesica(vec2(q2.x, q2.y - 0.425), 0.032, 0.065);
    float pf = rb_fl(pd2, e);
    vec3 petal2 = mix(vec3(0.45, 0.01, 0.16), vec3(0.06, 0.0, 0.04), sat((q2.y - 0.36) / 0.13));
    col = mix(col, petal2, pf * step(0.36, r));
    col += RB_MAG * 1.4 * rb_ln(pd2, 0.6 * e, e) * step(0.36, r);
    float pf1 = rb_fl(pd, e) * step(0.36, r);
    vec3 petal = mix(vec3(0.9, 0.05, 0.04), vec3(0.10, 0.0, 0.03), sat((q.y - 0.36) / 0.17));
    petal += vec3(1.0, 0.18, 0.05) * rb_cont(pd, 0.012, 0.45 * e, e) * 0.45;
    col = mix(col, petal, pf1);
    col += RB_GOLD * 1.5 * rb_ln(pd, 0.7 * e, e) * step(0.36, r);
    // circle C0 (double, beaded)
    col += RB_GOLD * 1.5 * (rb_ln(r - 0.362, 0.9 * e, e) + rb_ln(r - 0.350, 0.5 * e, e));
    vec3 qb = rb_polar(p, 64.0, -0.1 * sp);
    col += RB_HOT * 1.6 * rb_fl(length(qb.xy - vec2(0.0, 0.356)) - 0.0035, e);
    // quaternity: square inscribed in circle C1, circle C0 inscribed in the square
    vec2 sq = rb_rot(p, 0.0);
    float dsq = sdBox(sq, vec2(0.362));
    col += RB_GOLD * 1.7 * rb_ln(dsq, 1.0 * e, e) + RB_VERM * 1.0 * rb_ln(dsq + 0.012, 0.5 * e, e);
    col += RB_GOLD * 1.5 * (rb_ln(r - 0.512, 0.9 * e, e) + rb_ln(r - 0.526, 0.5 * e, e));
    // the four living creatures as element medallions at the corners
    col = mix(col, md, mm) + md * (1.0 - mm);
  }

  // ---- ring A: the Net of Being, 24 figures with raised arms, flame auras
  if (r > 0.56 && r < 0.86) {
    float bandA = smoothstep(0.585, 0.59, r) * smoothstep(0.835, 0.83, r);
    col = mix(col, vec3(0.003, 0.004, 0.030) + vec3(0.06, 0.0, 0.01) * smoothstep(0.75, 0.59, r), bandA);
    col += figC;
    col += RB_GOLD * 1.4 * (rb_ln(r - 0.835, 0.9 * e, e) + rb_ln(r - 0.848, 0.5 * e, e));
    col += RB_GOLD * 0.9 * rb_ln(r - 0.585, 0.6 * e, e);
  }

  // ---- ring B: 20 almond eyes
  if (r > 0.84 && r < 1.0) {
    col = mix(col, vec3(0.05, 0.0, 0.03), smoothstep(0.848, 0.853, r) * smoothstep(0.972, 0.967, r));
    col += eyeC;
    // diamonds between eyes
    vec3 q2 = rb_polar(p, 20.0, -0.10 * sp - cstep * TAU / 40.0 + TAU / 40.0);
    float dd = abs(q2.x) + abs(q2.y - 0.92) * 0.7 - 0.022;
    col = mix(col, mix(RB_GOLD * 1.4, vec3(0.05, 0.0, 0.0), inv), rb_fl(dd, e));
    col += RB_GOLD * 1.4 * (rb_ln(r - 0.985, 0.9 * e, e) + rb_ln(r - 0.972, 0.5 * e, e));
  }

  // ---- ring C: 16 glyph medallions with Holy-Mountain chevrons between
  if (r > 0.97 && r < 1.17) {
    vec3 q = qc;
    // chevrons
    float chev = abs(fract((q.y - abs(q.x) * 0.9) * 22.0) - 0.5);
    float band = step(1.0, r) * step(r, 1.145);
    vec3 cc = mix(vec3(0.05, 0.0, 0.012), vec3(0.42, 0.015, 0.02), smoothstep(0.24 + 0.5 * e * 22.0, 0.24 - 0.5 * e * 22.0, chev));
    cc += RB_GOLD * 0.7 * rb_ln(chev - 0.24, 0.5 * e * 22.0, e * 22.0);
    col = mix(col, mix(cc, vec3(1.1, 0.45, 0.10) - cc, inv), band);
    col = mix(col, md, mm) + md * (1.0 - mm) * 0.5;
    col += RB_GOLD * 1.5 * (rb_ln(r - 1.150, 0.9 * e, e) + rb_ln(r - 1.0, 0.7 * e, e));
  }

  // ---- outer field: log-polar Net of Being (rows of figures and eyes, endless)
  if (r > 1.40) {
    vec3 add = figRow > 0.5 ? figC : eyeC;
    col += add * 0.55 * smoothstep(1.40, 1.55, r);
  }

  // ---- full bloom (R4): twelve great magenta lotus petals open behind the corona
  if (bloom > 0.01 && r > 1.08 && r < 2.05) {
    vec3 q = rb_polar(p, 12.0, -0.03 * sp + TAU / 24.0);
    float pd = sdVesica(vec2(q.x, q.y - 1.12 - 0.42 * bloom), 0.17 * bloom, 0.42 * bloom + 0.001);
    float pf = rb_fl(pd, e);
    vec3 pc = mix(vec3(0.30, 0.0, 0.14), vec3(0.04, 0.0, 0.03), sat((q.y - 1.12) / (0.84 * bloom)));
    col = mix(col, pc + col * 0.25, pf);
    col += RB_MAG * 1.0 * rb_cont(pd, 0.022, 0.5 * e, e) * pf * smoothstep(-0.12, -0.01, pd);
    col += mix(RB_GOLD * 1.5, RB_MAG * 1.2, sat((q.y - 1.3) / 0.6)) * rb_ln(pd, 0.7 * e, e);
  }

  // ---- ring D: the corona: straight rays (Tarot XIX) alternating with nested flame tongues
  if (r > 1.13 && r < 1.62) {
    col += vec3(0.09, 0.0, 0.010) * smoothstep(1.62, 1.16, r) * smoothstep(1.13, 1.17, r);
    vec3 q = rb_polar(p, 36.0, -0.05 * sp);
    float wavy = mod(q.z, 2.0);
    float kick = exp(-uKT / 0.12);
    float y = q.y - 1.158;
    if (wavy < 0.5) {
      float L = 0.40 * (1.0 + 0.10 * kick);
      float W = 0.030;
      float d = max(max((abs(q.x) - W * (1.0 - y / L)) * 0.97, -y), y - L);
      float f = rb_fl(d, e);
      float v = sat(y / L);
      vec3 c = mix(RB_GOLD * 1.2, RB_SCAR * 0.35, smoothstep(0.0, 1.0, v));
      col = mix(col, c * 0.45, f);
      col += mix(RB_HOT * 2.2, RB_SCAR, v) * rb_ln(q.x, 0.5 * e + 0.0025 * (1.0 - v), e) * f;
      col += RB_GOLD * 1.3 * rb_ln(d, 0.6 * e, e) * (1.0 - 0.6 * v);
    } else {
      // wavy ray: a tapering serpentine stroke with two fine companion lines
      float L = 0.34 * (1.0 + 0.06 * kick);
      float v = sat(y / L);
      float amp = 0.014 * smoothstep(0.0, 0.25, v);
      float wx = q.x - amp * sin(y * 46.0 - tt * 7.0 + q.z);
      float wdt = mix(0.011, 0.0015, v);
      float inside = step(0.0, y) * step(y, L);
      float core = rb_ln(wx, wdt + 0.4 * e, e) * inside;
      vec3 c = mix(RB_GOLD * 1.7, RB_SCAR * 0.9, v);
      col = mix(col, c, core);
      col += RB_HOT * 1.2 * rb_ln(wx, 0.4 * e, e) * inside * (1.0 - v);
      float comp = rb_ln(abs(wx) - wdt - 0.010, 0.45 * e, e) * inside * (1.0 - v);
      col += mix(RB_GOLD, RB_MAG, v) * 0.9 * comp;
    }
  }

  // ---- kick: zoom pulse is in the camera; here the expanding ring of light
  float rk = 0.30 + uKT * 3.4;
  float kr = exp(-uKT / 0.22) * step(uKT, 1.0) * (1.0 - 0.6 * uReduced);
  vec3 shock = vec3(rb_g((r - rk - 0.010) / 0.009), rb_g((r - rk) / 0.009), rb_g((r - rk + 0.010) / 0.009));
  // (kept below bloom-flooding brightness: at 4x the bloom turned the ring into a full-frame haze)
  col += kr * (vec3(2.4, 1.6, 1.0) * shock + RB_SCAR * 0.30 * exp(-abs(r - rk) / 0.07) * step(r, rk));

  // central radiance
  col += RB_SCAR * 0.06 * exp(-r * 2.0);
  return col;
}

// perspective view of the mandala plane tilted by (pitch, yaw): xy plane coords, z pixel footprint
vec3 rb_tr(vec3 v, vec2 tl) { v.yz = rb_rot(v.yz, tl.x); v.xz = rb_rot(v.xz, tl.y); return v; }
vec3 rb_view(vec2 uv, float zoom, vec2 tl, float roll) {
  float f = 2.0;
  vec3 rd = normalize(vec3(uv, f));
  vec3 n = rb_tr(vec3(0.0, 0.0, -1.0), tl);
  vec3 P0 = vec3(0.0, 0.0, f);
  float t = dot(P0, n) / min(dot(rd, n), -0.05);
  vec3 h = rd * t - P0;
  vec2 p = vec2(dot(h, rb_tr(vec3(1.0, 0.0, 0.0), tl)), dot(h, rb_tr(vec3(0.0, 1.0, 0.0), tl)));
  p = rb_rot(p, roll) / zoom;
  float e = px() * t / f / zoom / sqrt(max(abs(dot(rd, n)), 0.2));
  return vec3(p, e);
}

// four-point sparkles on the 16th-note hats
vec3 rb_sparkles(vec2 uv, float sc) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float hn = uHN - float(i);
    vec2 h = hash22(vec2(hn * 1.37, float(i) + 3.1));
    vec2 c = (h * 2.0 - 1.0) * vec2(1.6, 0.85);
    float age = uHT + float(i) * 0.110294;
    float a = exp(-age / 0.12);
    col += RB_HOT * 3.0 * a * sparkle(uv, c, sc * (0.6 + 0.8 * h.x));
  }
  return col;
}
`;

  // ------------------------------------------------------------------ R1: the mandala assembles
  const R1 = `
uniform float uImpact;  // 1 during the beat-48 impact frames (the post pass keys them to light lines on black)
void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  float t = uST;
  vec2 c = vec2(0.0, 0.12);
  float sl = speedLines(uv, c, 140.0, uTime, 0.55);
  if (uImpact > 0.5) {
    // the impact frames: the black sun of Nigredo returns as an eclipse, a black disc in a ragged
    // corona, plus speed lines. Only the bright parts survive the key. Across the two frames it only
    // dims a little: a change back up would count as one more flash.
    vec2 d = uv - c;
    float rs = length(d), an = atan(d.y, d.x);
    float R = 0.42;
    float ray = hash11(floor(an / TAU * 90.0) + 3.0);
    float corona = exp(-max(rs - R, 0.0) / ((0.02 + 0.07 * ray * ray) * (1.0 - 8.0 * t))) * step(R, rs);
    vec3 col = vec3(3.0) * corona + vec3(3.0) * sl * smoothstep(R + 0.15, R + 0.35, rs);
    fragColor = vec4(col, 1.0);
    return;
  }
  float kenv = exp(-uKT / 0.11);
  // pull-out from the dancer to the whole mandala; a quadratic ease (not quartic) keeps the outer
  // field from scrolling past at 10+ rows/s
  float pull = 1.0 - pow(1.0 - sat(t / 1.72), 2.0);
  // (reduced: a shorter pull from 1.6 and a third of the roll)
  float zoom = mix(mix(3.6, 1.6, uReduced), 0.80, pull) * (1.0 + 0.015 * kenv * (1.0 - 0.6 * uReduced));
  float roll = (-0.17 * t - 0.25 * (1.0 - smoothstep(0.0, 1.0, t))) * (1.0 - 0.65 * uReduced);
  vec2 tl = vec2(0.30 * (1.0 - pull) + 0.06 * sin(t * 1.7), 0.10 * sin(t * 1.3 + 0.5));
  vec3 vw = rb_view(uv - c, zoom, tl, roll);
  vec2 p = vw.xy;
  // sakuga shock distortion near the kick ring
  float rk = (0.30 + uKT * 3.4);
  float rr = length(p);
  p *= 1.0 - 0.025 * exp(-uKT / 0.2) * rb_g((rr - rk) / 0.05);
  float e = vw.z;
  // fully lit from the first frame after the impact: the colour hits on the beat, no slow reveal
  vec3 col = rb_mandala(p, e, uTime, 0.0);
  col = rb_pump(col, exp(-dot(uv - c, uv - c) / 0.30));
  // the colour lands over two frames after the impact (86 % -> 100 %): one rising change, rather
  // than a jump followed by a dip that reads as a second flash. Reduced has no impact: the cut from
  // the cream insert is the one change, and the mandala settles from a little brighter after it.
  col *= mix(mix(0.86, 1.0, sat((t - 0.09) / 0.035)), mix(1.25, 1.0, sat(t / 0.1)), uReduced);
  // drop speed lines
  col += RB_HOT * 1.2 * sl * exp(-t / 0.4) * (1.0 - 0.7 * uReduced);
  col += rb_sparkles(uv, 0.05);
  fragColor = vec4(rb_grade(col), 1.0);
}`;

  // ------------------------------------------------------------------ R2: the chemical wedding
  // A chrome vessel over an endless checkerboard under the mandala-sun (a 1996 CD cover);
  // Sol and Luna orbit, the leaden sphere turns to gold on "gold", then they fuse into it.
  const R2 = `
uniform vec3 uRo, uTa, uSol, uLuna, uCD;
uniform float uGold, uFuse, uOrbit;
const vec3 RB_SC = vec3(0.0, 1.6, 0.0);
const float RB_SR = 1.0;

const float RB_F = 1.6;

float rb_hitSphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c; float b = dot(oc, rd); float h = b * b - dot(oc, oc) + r * r;
  return h < 0.0 ? -1.0 : -b - sqrt(h);
}
// the sky gradient: ultramarine zenith, magenta, a molten horizon
vec3 rb_skyGrad(vec3 rd) {
  float y = rd.y;
  vec3 col = mix(vec3(0.75, 0.05, 0.05), vec3(0.32, 0.0, 0.16), smoothstep(0.0, 0.35, y));
  col = mix(col, vec3(0.006, 0.008, 0.06), smoothstep(0.12, 0.6, y));
  return col + vec3(1.6, 0.35, 0.08) * exp(-abs(y) * 45.0);
}
// the environment along a direction: sky gradient + the mandala-sun ahead (uCD) or, behind the
// camera, the mandala again (only ever seen in the chrome). ONE mandala evaluation.
vec3 rb_env(vec3 rd, float e) {
  vec3 col = rb_skyGrad(rd);
  vec3 bd = normalize(vec3(-uCD.x, 0.10, -uCD.z));
  float fz = dot(rd, uCD), bz = dot(rd, bd);
  bool front = fz > bz;
  vec3 ax = front ? uCD : bd;
  float sc = front ? 2.3 : 1.25;
  float z = max(front ? fz : bz, 0.05);
  vec3 U = normalize(cross(vec3(0.0, 1.0, 0.0), ax)), V = cross(ax, U);
  vec2 p = vec2(dot(rd, U), dot(rd, V)) / z * sc;
  vec3 m = rb_pump(rb_mandala(p, e * sc / (z * z), uTime, 0.0), exp(-dot(p, p) / 1.2)) * (front ? 0.62 : 1.6);
  float k = front ? smoothstep(2.25, 1.95, length(p)) * smoothstep(0.35, 0.55, fz)
                  : smoothstep(2.0, 1.6, length(p)) * smoothstep(0.25, 0.45, bz);
  return mix(col, m, k) + col * (front ? 0.15 * k : 0.0);
}
vec3 rb_orbs(vec3 ro, vec3 rd) {
  vec3 col = vec3(0.0);
  vec3 s = uSol - ro; float b = dot(s, rd);
  if (b > 0.0) { float d = length(s - rd * b); col += vec3(3.0, 1.6, 0.4) * smoothstep(0.32, 0.26, d) + vec3(1.0, 0.3, 0.05) * exp(-d * 6.0) * 0.6; }
  vec3 l = uLuna - ro; b = dot(l, rd);
  if (b > 0.0) { float d = length(l - rd * b); col += vec3(1.5, 1.6, 2.0) * smoothstep(0.28, 0.22, d) + vec3(0.4, 0.45, 0.9) * exp(-d * 6.0) * 0.5; }
  return col * (1.0 - uFuse);
}
vec3 rb_tint(vec3 n) {
  // lead -> gold, a front sweeping down the vessel
  float front = mix(1.3, -1.3, uGold);
  float g = smoothstep(front - 0.08, front + 0.08, n.y);
  vec3 lead = vec3(0.42, 0.45, 0.52);
  vec3 gold = vec3(1.25, 0.80, 0.34);
  return mix(lead, gold, g) + vec3(3.0, 1.6, 0.5) * rb_g((n.y - front) / 0.05) * step(0.01, uGold) * step(uGold, 0.99);
}
vec3 rb_floorBase(vec3 h, vec2 dx, vec2 dy) {
  vec2 g = h.xz * 0.85;
  vec2 w = max(abs(dx), abs(dy)) * 0.85 + 0.001;
  vec2 i = 2.0 * (abs(fract((g - 0.5 * w) * 0.5) - 0.5) - abs(fract((g + 0.5 * w) * 0.5) - 0.5)) / w;
  float chk = 0.5 - 0.5 * i.x * i.y;
  float inv = (mod(uClapN, 2.0) > 0.5 ? 1.0 : 0.0) * smoothstep(0.0, 0.02, uCT) * exp(-uCT / 0.25) * (1.0 - 0.7 * uReduced);
  chk = mix(chk, 1.0 - chk, inv);
  vec3 base = mix(vec3(0.004, 0.0, 0.008), vec3(0.34, 0.0, 0.03), chk);
  // kick ripple: a ring of light running out across the floor from under the vessel
  float rr = length(h.xz - RB_SC.xz);
  float rk = 1.0 + uKT * 9.0;
  base += vec3(2.4, 0.9, 0.2) * rb_g((rr - rk) / 0.10) * exp(-uKT / 0.3);
  // contact shadow and glow under the vessel
  base *= 0.35 + 0.65 * smoothstep(0.2, 1.4, rr);
  base += vec3(1.0, 0.3, 0.05) * exp(-rr * 1.5) * 0.35 * (0.4 + uGold);
  return base;
}
// billboard sprites: Sol (gold face with straight and wavy rays) and Luna (silver crescent)
vec4 rb_sol(vec2 q, float R, float e, float tt) {
  float r = length(q);
  vec3 col = vec3(0.0); float al = 0.0;
  vec3 qp = rb_polar(q, 16.0, tt * 0.6);
  float wavy = mod(qp.z, 2.0);
  float L = R * mix(0.85, 0.65, wavy);
  float fd = rb_flameD(vec2(qp.x, qp.y - R * 0.92), R * mix(0.17, 0.11, wavy), L, tt, qp.z, wavy * 1.4);
  float rf = rb_fl(fd, e);
  float v = sat((qp.y - R) / L);
  col += mix(vec3(3.0, 1.7, 0.45), mix(vec3(1.6, 0.25, 0.04), vec3(1.2, 0.05, 0.12), wavy), v) * rf * (0.55 + 0.45 * rb_cont(fd, R * 0.05, 0.5 * e, e));
  al = max(al, rf);
  col += vec3(1.0, 0.3, 0.04) * exp(-max(r - R, 0.0) / (0.25 * R)) * 0.5 * (1.0 - rf);
  al = max(al, 0.6 * exp(-max(r - R, 0.0) / (0.3 * R)));
  float disc = rb_fl(r - R, e);
  if (disc > 0.0) {
    vec3 dc = mix(vec3(3.2, 2.0, 0.7), vec3(1.6, 0.55, 0.08), smoothstep(0.0, R, r));
    vec2 f = q / R;
    vec2 af = vec2(abs(f.x), f.y);
    // Marseille sun face: almond eyes, brows, nose, mouth
    float eye = sdVesica(vec2(af.y - 0.18, af.x - 0.34), 0.07, 0.17);
    float brow = abs(length(af - vec2(0.34, 0.02)) - 0.30) + step(af.y, 0.24) * 1e3;
    float nose = sdSegment(f, vec2(0.0, 0.12), vec2(0.07, -0.22));
    float mouth = abs(length(f - vec2(0.0, -0.05)) - 0.36) + step(-0.30, f.y) * 1e3 + step(0.28, abs(f.x)) * 1e3;
    float pupil = length(af - vec2(0.34, 0.18)) - 0.05;
    float lines = min(min(abs(eye), brow), min(nose, mouth));
    float le = e / R;
    dc = mix(dc, vec3(0.35, 0.02, 0.01), rb_ln(lines, 0.022 + 0.5 * le, le));
    dc = mix(dc, vec3(0.05, 0.0, 0.0), rb_fl(pupil, le));
    dc += vec3(1.2, 0.5, 0.1) * rb_cont(r - R, R * 0.09, 0.45 * e, e) * 0.4;
    col = mix(col, dc, disc);
    al = max(al, disc);
  }
  col += vec3(4.0, 2.6, 1.2) * rb_ln(r - R, 0.9 * e, e);
  return vec4(col, al);
}
vec4 rb_luna(vec2 q, float R, float e, float tt) {
  q = rb_rot(q, 0.5);
  float r = length(q);
  float d = max(r - R, -(length(q - vec2(0.42, 0.18) * R) - 0.86 * R));
  float f = rb_fl(d, e);
  vec3 c = mix(vec3(0.75, 0.80, 1.05), vec3(0.12, 0.14, 0.42), smoothstep(-0.3 * R, 0.0, d));
  c += vec3(1.2, 1.3, 1.9) * rb_cont(d, R * 0.09, 0.45 * e, e) * 0.6;
  // a profile face on the inner curve: eye and mouth notches
  vec2 fq = q / R;
  float eye = sdVesica(vec2(fq.y - 0.12, fq.x + 0.02), 0.035, 0.11);
  c = mix(c, vec3(0.06, 0.06, 0.25), rb_fl(eye, e / R) * f);
  vec3 col = c * f + vec3(1.7, 1.9, 2.6) * rb_ln(d, 0.8 * e, e);
  col += vec3(0.25, 0.3, 0.9) * exp(-max(d, 0.0) / (0.25 * R)) * (1.0 - f) * 0.6;
  float al = max(f, 0.5 * exp(-max(d, 0.0) / (0.2 * R)));
  return vec4(col, al);
}
// billboard plane of a sprite at c: local coords in xy, ray distance in z, 0/1 valid in w
vec4 rb_spriteQ(vec3 ro, vec3 rd, vec3 cf, vec3 cu, vec3 cr, vec3 c, float tmax) {
  vec3 n = -cf;
  float t = dot(c - ro, n) / dot(rd, n);
  vec3 h = ro + rd * t - c;
  return vec4(dot(h, cr), dot(h, cu), t, (t > 0.0 && t < tmax) ? 1.0 : 0.0);
}
void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  vec3 ro = uRo;
  mat3 cam = lookAt(ro, uTa, 0.04 * sin(uTime * 0.9));
  vec3 rd = normalize(cam * vec3(uv, RB_F));
  float e1 = px() / RB_F;                       // pixel footprint per unit distance
  float ts = rb_hitSphere(ro, rd, RB_SC, RB_SR);
  float tf = rd.y < 0.0 ? -ro.y / rd.y : 1e4;
  bool hitS = ts > 0.0;
  bool hitF = !hitS && rd.y < 0.0;
  float tmax = hitS ? ts : 1e4;
  // the secondary ray: off the chrome, or the floor's mirror ray, or (sky) the view ray itself
  vec3 hS = ro + rd * max(ts, 0.0);
  vec3 nS = normalize(hS - RB_SC);
  vec3 hF = ro + rd * min(tf, 1e4);
  vec3 o2 = hitS ? hS : hitF ? hF : ro;
  vec3 d2 = hitS ? reflect(rd, nS) : hitF ? vec3(rd.x, -rd.y, rd.z) : rd;
  // ONE floor evaluation: the floor under the view ray, or under the chrome's reflected ray
  float t2 = -o2.y / min(d2.y, -1e-4);
  vec3 hf = hitS ? o2 + d2 * t2 : hF;
  vec2 dx = dFdx(hF.xz), dy = dFdy(hF.xz);
  float er = e1 * 18.0 * t2;
  dx = hitS ? vec2(er) : dx; dy = hitS ? vec2(er) : dy;
  vec3 fb = rb_floorBase(hf, dx, dy);
  // the floor's mirror ray may see the vessel
  float ts2 = hitF ? rb_hitSphere(o2, d2, RB_SC, RB_SR) : -1.0;
  vec3 n2 = normalize(o2 + d2 * max(ts2, 0.0) - RB_SC);
  // ONE environment (mandala) evaluation along the secondary / view ray
  vec3 orbs = rb_orbs(o2, d2) * ((hitS || hitF) ? 1.0 : 0.0);   // Sol and Luna as seen in reflections
  vec3 env = rb_env(d2, hitS ? e1 * 18.0 : e1) + orbs;
  vec3 tint = rb_tint(hitS ? nS : n2);
  vec3 col;
  if (hitS) {
    vec3 envS = d2.y < 0.0 ? mix(fb + rb_skyGrad(vec3(d2.x, -d2.y, d2.z)) * 0.3, vec3(0.5, 0.06, 0.05), 1.0 - exp(-t2 * 0.02)) + orbs : env;
    float fres = pow(1.0 - max(dot(-rd, nS), 0.0), 4.0);
    col = envS * mix(tint, vec3(1.0), fres * 0.6);
    col *= 1.0 - 0.35 * (1.0 - uGold) * (0.5 + 0.5 * vnoise(nS.xy * 9.0));   // leaden tarnish
    col += vec3(2.2, 1.1, 0.35) * uFuse * (0.15 + 0.85 * pow(1.0 - max(dot(-rd, nS), 0.0), 2.0));
    col += vec3(1.0, 0.7, 0.4) * pow(max(dot(d2, normalize(vec3(-0.5, 0.8, -0.4))), 0.0), 60.0) * 6.0;
  } else if (hitF) {
    vec3 r2 = reflect(d2, n2);
    vec3 vessel = (mix(vec3(0.5, 0.05, 0.05), vec3(0.02, 0.02, 0.1), sat(r2.y * 2.0)) + vec3(1.5, 0.4, 0.1) * exp(-abs(r2.y) * 20.0)) * tint * 1.2;
    vec3 refl = ts2 > 0.0 ? vessel : env;
    float fres = 0.18 + 0.82 * pow(1.0 - abs(rd.y), 6.0);
    col = fb + refl * fres * 0.32;
    col = mix(col, vec3(0.9, 0.12, 0.06), 1.0 - exp(-tf * 0.012));
  } else {
    col = env;
  }
  // Sol and Luna: each drawn once, then composited far to near
  vec3 cf = cam[2], cu = cam[1], cr = cam[0];
  float Rsun = 0.48 * (1.0 - 0.5 * uFuse), Rmoon = 0.46 * (1.0 - 0.5 * uFuse);
  vec4 qs = rb_spriteQ(ro, rd, cf, cu, cr, uSol, tmax);
  vec4 ql = rb_spriteQ(ro, rd, cf, cu, cr, uLuna, tmax);
  float fuseVis = 1.0 - smoothstep(0.5, 0.95, uFuse);   // Sol and Luna melt into the vessel (no pop)
  vec4 sS = rb_sol(qs.xy, Rsun, e1 * qs.z, uTime);  sS *= qs.w * fuseVis;
  vec4 sL = rb_luna(ql.xy, Rmoon, e1 * ql.z, uTime); sL *= ql.w * fuseVis;
  bool solFar = dot(uSol - ro, cf) > dot(uLuna - ro, cf);
  vec4 sF = solFar ? sS : sL, sN = solFar ? sL : sS;
  col = mix(col, sF.rgb, sF.a) + sF.rgb * (1.0 - sF.a) * 0.6;
  col = mix(col, sN.rgb, sN.a) + sN.rgb * (1.0 - sN.a) * 0.6;
  // anime twinkle on the vessel's highlight + hats
  vec3 hl = RB_SC + normalize(normalize(vec3(-0.5, 0.8, -0.4)) + normalize(ro - RB_SC)) * RB_SR;
  vec3 hc = cam * vec3(0.0); 
  vec3 hv = transpose(cam) * (hl - ro);
  vec2 hs = hv.xy / hv.z * RB_F;
  col += vec3(3.0, 2.2, 1.4) * sparkle(uv, hs, 0.10 + 0.06 * exp(-uKT / 0.1)) * (0.5 + uGold);
  col += rb_sparkles(uv, 0.045) * 0.7;
  // the fusion (coniunctio): a starburst of rays and a shock ring from the vessel
  if (uFuse > 0.0) {
    vec3 cv = transpose(cam) * (RB_SC - ro);
    vec2 cs = cv.xy / cv.z * RB_F;
    vec2 d = uv - cs; float rr = length(d); float aa = atan(d.y, d.x);
    float rays = pow(0.5 + 0.5 * cos(aa * 12.0 + uTime * 2.0), 8.0) + 0.6 * pow(0.5 + 0.5 * cos(aa * 28.0 - uTime * 3.0), 16.0);
    float ft = max(uLocal - 1.5441, 0.0);   // seconds since the fusion (beat 55.5)
    col += vec3(2.4, 1.2, 0.35) * rays * smoothstep(0.30, 0.5, rr) * exp(-(rr - 0.3) * 1.5) * uFuse;
    float rk = 0.35 + ft * 2.6;
    col += vec3(3.0, 2.0, 1.0) * rb_g((rr - rk) / 0.012) * exp(-ft / 0.25);
  }
  fragColor = vec4(rb_grade(col), 1.0);
}`;

  // ------------------------------------------------------------------ R3: the fly-through
  const R3 = `
uniform float uTravel, uTunRoll, uImpact, uLand;
void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  vec2 vp = vec2(0.06 * sin(uTime * 1.3), 0.10 + 0.04 * sin(uTime * 0.9));
  vec2 q = rb_rot(uv - vp, uTunRoll);
  float r = max(length(q), 1e-3);
  float a = atan(q.y, q.x);
  // tunnel of radius 1: depth z = F / r
  float F = 0.9;
  float z = F / r;
  float zz = z + uTravel;
  float n = 14.0;                                   // figures per ring
  float cw = TAU / n;                               // cell width (tunnel radius 1)
  float ew = px() * z * z / F;                      // pixel footprint on the wall
  float u = a / cw;
  float ringD = abs(fract(zz + 0.5) - 0.5);         // distance to the nearest ring frame (wall units)
  float latt = abs(fract(u + 0.5) - 0.5) * cw;      // distance to the nearest lattice line
  float slT = speedLines(uv, vp, 120.0, uTime, 0.75);
  if (uImpact > 0.0) {
    // the beat-56 impact frames: a bright field with the tunnel's rings, lattice and speed lines drawn
    // dark. The post keys bright to near-black and dark to cream, so the card reads as cream linework
    // on black: one change down from the bright fusion frame, not a cream flash and back down. The
    // field stays under the bloom threshold so the lines survive; uImpact (line width) thins them on
    // the second frame, so that frame only darkens further instead of flickering back up.
    float lw = uImpact;
    float lines = max(rb_ln(ringD, (0.035 + 2.0 * ew) * lw, ew), rb_ln(latt, (0.012 + 1.5 * ew) * lw, ew) * step(0.22, r));
    lines = max(lines, slT);
    fragColor = vec4(vec3(1.0) * (1.0 - lines) * smoothstep(0.03, 0.08, r), 1.0);
    return;
  }
  float seg = floor(zz / 1.0);                      // ring index: even = figures, odd = eyes
  float lz = fract(zz) - 0.5;
  float fog = exp(-z * 0.22);
  float detail = smoothstep(0.08, 0.025, ew);
  vec3 col = vec3(0.012, 0.004, 0.03);
  // (no clap inversion here: the tunnel already moves the whole frame)
  if (mod(seg, 2.0) < 0.5) {
    float rowRot = seg * 0.5 + uTime * 0.35 * (mod(seg, 4.0) < 1.0 ? 1.0 : -1.0);
    float uu = u + rowRot;
    float id = floor(uu + 0.5);
    vec2 cell = vec2((uu - id) * cw, lz);           // world units on the wall
    vec2 bp = vec2(cell.x, -cell.y) / 0.40;         // heads toward the light
    vec3 fc = rb_figure(bp, 0.40, ew, uTime, id + seg * 7.0, 0.0, 0.10);
    col = fc * detail + (1.0 - detail) * vec3(0.14, 0.005, 0.03);
  } else {
    float uu = u - seg * 0.5 - uTime * 0.25;
    float id = floor(uu + 0.5);
    vec2 cell = vec2((uu - id) * cw, lz);
    vec3 ec = rb_eye(cell, 0.19, 0.11, ew, 0.4 * rb_blink(id + seg * 3.0), id + seg, uTime);
    col = mix(vec3(0.06, 0.0, 0.03), vec3(0.0), 0.0) + ec;
    col = col * detail + (1.0 - detail) * vec3(0.16, 0.01, 0.03);
  }
  // gold ring frames between rows, fine lattice lines along the tunnel
  float near = smoothstep(0.30, 0.07, ew);
  col = mix(col, vec3(0.02, 0.0, 0.01), rb_ln(ringD, 0.045, ew) * near);
  col += RB_GOLD * 1.5 * (rb_ln(ringD - 0.03, 0.006 + 0.5 * ew, ew) + rb_ln(ringD, 0.010 + 0.5 * ew, ew)) * near;
  float bead = length(vec2((fract(u * 4.0 + 0.5) - 0.5) * cw / 4.0, ringD - 0.0)) - 0.016;
  col += RB_HOT * 2.0 * rb_fl(bead, ew) * detail;
  col += RB_SCAR * 0.6 * rb_ln(latt, 0.004 + 0.4 * ew, ew) * detail;
  col *= fog;
  // the nearest wall (the frame's edges) rushes past dimmed toward its average red: there one ring
  // covers a quarter of the screen, so a ring change there would flash the whole edge
  col = mix(col, vec3(0.09, 0.003, 0.02), 0.7 * smoothstep(0.85, 0.45, z));
  // the light at the end of the tunnel: the Self
  col += RB_HOT * (0.5 * exp(-r * 22.0) + 6.0 * exp(-r * r * 4000.0)) + RB_SCAR * 0.30 * exp(-r * 5.0);
  // kick: a hoop of light flying past
  float kz = 6.0 - uKT * 18.0;
  // (it fades out before it reaches the frame's edge, where it would sweep half the screen per frame)
  col += RB_HOT * 1.8 * rb_g((z - kz) / (0.03 * z * z)) * exp(-uKT / 0.25) * smoothstep(0.6, 1.6, kz) * (1.0 - 0.8 * uReduced);
  // lasers from the vanishing point, sweeping on the beat: a throw on each beat that eases back.
  // Continuous (0 at both ends of the beat, so the beams never jump) and at most ~0.1 rad per frame
  float bp = fract(uBeat);
  float throwB = 0.22 * sin(PI * (1.0 - (1.0 - bp) * (1.0 - bp))) * (1.0 - uReduced);
  float gate = mix(0.70 + 0.30 * exp(-uKT / 0.25), 0.65, uReduced);   // kick lift, partial (+43 %)
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float side = mod(fi, 2.0) * 2.0 - 1.0;
    float ang = (fi * 1.047 + 0.3) + side * (0.6 * sin(uBeat * PI * 0.5 + fi) + throwB);
    vec2 dir = vec2(cos(ang), sin(ang));
    float along = dot(q, dir);
    float perp = abs(dot(q, vec2(-dir.y, dir.x)));
    float w = 0.0015 + 0.004 * along;
    float beam = (1.0 - smoothstep(w, w + px() * 1.5, perp)) * step(0.0, along);
    vec3 lc = i == 0 ? vec3(0.6, 0.7, 2.6) : i == 3 ? vec3(2.6, 1.8, 0.5) : (mod(fi, 2.0) < 0.5 ? vec3(2.8, 0.15, 0.10) : vec3(2.4, 0.10, 1.2));
    col += lc * (beam * 1.5 + 0.25 * exp(-perp / (0.02 + 0.03 * max(along, 0.0)))) * gate * smoothstep(0.02, 0.15, along);
  }
  col += rb_sparkles(uv, 0.05);
  // speed lines
  col += RB_HOT * 0.75 * slT * (0.6 + 0.4 * exp(-uKT / 0.2)) * (1.0 - 0.7 * uReduced);
  // after the impact card the tunnel lands over three frames (75 -> 90 -> 100 %): one rising change
  col *= 1.0 - 0.35 * uLand;
  fragColor = vec4(rb_grade(col), 1.0);
}`;

  // ------------------------------------------------------------------ R4: full bloom, then the dive
  const R4 = `
uniform float uZoom, uSpin, uTiltA, uBloomOpen, uAurum, uLand;
uniform vec2 uTilt;
// lead into gold: the crimson mandala transmuted to molten gold, white-hot in the highlights,
// with crimson left only in the deepest shadows
vec3 rb_aurum(vec3 c) {
  float l = dot(c, vec3(0.55, 0.38, 0.07));
  vec3 g = l * mix(vec3(1.30, 0.66, 0.18), vec3(1.05, 0.92, 0.75), smoothstep(0.8, 3.0, l));
  return mix(c, g, 0.85 * smoothstep(0.015, 0.12, l));
}
void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  float kenv = exp(-uKT / 0.11);
  float zoom = uZoom * (1.0 + 0.05 * kenv * (1.0 - 0.6 * uReduced) * (1.0 - uDive));
  vec2 c = vec2(0.0, 0.10 * (1.0 - uDive));
  vec2 tl = uTilt + vec2(0.05 * sin(uTime * 1.1), 0.035 * cos(uTime * 0.8)) * uTiltA;
  vec3 vw = rb_view(uv - c, zoom, tl, uSpin);
  vec2 p = vw.xy;
  float rk = (0.30 + uKT * 3.4);
  float rr = length(p);
  p *= 1.0 - 0.02 * exp(-uKT / 0.2) * rb_g((rr - rk) / 0.05) * (1.0 - uDive);
  vec3 col = rb_mandala(p, vw.z, uTime, uBloomOpen);
  col = rb_pump(col, exp(-dot(uv - c, uv - c) / 0.30) * (1.0 - uDive));
  // god rays from the heart, pumped by the kick (from dive 0.45 on, the frame is all inside r < 0.35
  // where they are zero: a uniform branch, so the deep-dive frames skip them)
  if (uDive < 0.45) {
    float ga = atan(p.y, p.x) - uSpinT * 0.1;
    float gr = pow(0.5 + 0.5 * cos(ga * 12.0), 6.0) + 0.5 * pow(0.5 + 0.5 * cos(ga * 24.0 + 1.0), 12.0);
    col += vec3(1.0, 0.35, 0.08) * gr * exp(-rr * 1.1) * (0.12 + 0.20 * kenv) * smoothstep(0.35, 0.6, rr);
  }
  // the transmutation: a gold front runs out from the heart on the first beat (the heart iris
  // itself stays red-gold, it is the eye the coda opens on)
  float aur = smoothstep(uAurum, uAurum - 0.30, rr) * smoothstep(0.026, 0.05, rr);
  col = mix(col, rb_aurum(col), aur);
  col += RB_HOT * 1.6 * rb_g((rr - uAurum) / 0.025) * step(uAurum, 2.6) * (1.0 - 0.6 * uReduced);
  // the dive: at a constant ~1.2x zoom per frame every ring would leap more than its own width per
  // frame and strobe, so outside the heart the fine structure dissolves into a radial glow with
  // speed lines (a cheap stand-in for radial motion blur). The iris fibres are radial, so they hold
  // still under the zoom and stay sharp.
  if (uDive > 0.0) {
    vec2 dc = uv - c;
    float rs = length(dc);
    float keep = max(0.32, 1.15 * 0.02 * zoom);        // the heart iris is 0.02 * zoom on screen
    float blur = 0.88 * smoothstep(keep, keep + 0.55, rs) * smoothstep(0.0, 0.15, uDive);
    // its colour is the mandala's own average at that radius (measured), turning crimson as the
    // heart nears, to meet the coda's red ground
    vec3 glow = mix(vec3(0.68, 0.37, 0.08), mix(vec3(0.30, 0.11, 0.025), vec3(0.34, 0.02, 0.02), smoothstep(0.5, 1.0, uDive)), smoothstep(0.4, 2.0, rs));
    float sa = atan(dc.y, dc.x) + uSpin;               // sunburst rays: radial, so they hold still under the zoom
    glow *= 0.72 + 0.56 * pow(0.5 + 0.5 * cos(sa * 16.0), 3.0);
    glow += RB_HOT * 1.2 * speedLines(uv, c, 110.0, uTime, 0.2) * smoothstep(keep, keep + 0.4, rs) * (1.0 - 0.7 * uReduced);
    col = mix(col, glow, blur);
  }
  if (uDive < 0.3) col += rb_sparkles(uv, 0.05) * (1.0 - uDive / 0.3);
  col *= 1.0 - 0.15 * uLand;   // the cut from the tunnel lands over two frames (one rising change)
  fragColor = vec4(rb_grade(col), 1.0);
}`;

  const common = (t, local, MO) => {
    const since = (n) => { const l = MO.last(n, t); return l ? t - l.e.t : 99; };
    const claps = MO.count('clap', t) - MO.count('clap', T0 - 0.001);
    const ct = since('clap');
    return {
      uST: t - T0, uKT: since('kick'), uCT: ct, uOT: since('openHat'), uHT: since('closedHat'),
      uHN: MO.count('closedHat', t),
      // each clap turns the rings one kaleidoscope step; not the drop's first clap (21.6 s), which
      // lands with the kick and the "in" pop: together they would flash the whole frame
      uClapStep: Math.max(0, claps - 2) + (claps > 1 ? MO.easeOut(ct / 0.12) : 0),
      uSpinT: T0 + (MO.reduced ? 0.5 : 1) * (t - T0), uDive: 0, uInvAmt: 1,   // ring rotation clock (half speed in reduced)
    };
  };

  const T1 = MO.barTime(13), T2 = MO.barTime(14), T3 = MO.barTime(15), T4 = MO.barTime(16);
  const post = { bloom: 0.32, bloomThreshold: 1.2, vignette: 0.5 };
  // the beat-48 impact (score.js fx): R1 draws its black-sun graphic for exactly those frames
  const IMP = MO.S.fx.find((f) => f.type === 'impact' && Math.abs(f.beat * MO.BEAT - T0) < 1e-3);
  const R1u = (t, local) => Object.assign(common(t, local, MO), { uImpact: IMP && !MO.reduced && t - T0 < IMP.duration ? 1 : 0 });
  MO.scene(Object.assign({ id: 'rubedo', section: 'rubedo', from: T0, to: T1, fs: RB_LIB + R1, uniforms: R1u }, post));

  // R2 choreography: camera arc, orbits spiralling in, lead -> gold, fusion
  const tGoldA = MO.barTime(13, 0, 4), tGoldB = MO.barTime(13, 0, 8);
  const tFuse = MO.barTime(13, 3, 2);
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const camAt = (t) => {
    const k = MO.clamp((t - T1) / B);
    const phi = -0.32 + 0.50 * MO.easeInOut(k);
    const dist = 4.9 - 0.6 * MO.easeInOut(k);
    return [dist * Math.sin(phi), 0.78 + 0.12 * Math.sin(k * 3.0), -dist * Math.cos(phi)];
  };
  const CD = norm([0 - camAt(T1)[0], 1.6 + 0.35 - camAt(T1)[1], 0 - camAt(T1)[2]]);
  const R2u = (t, local) => {
    const k = MO.clamp((t - T1) / (tFuse - T1));
    const rad = 2.15 * (1 - MO.easeIn(k));
    const ang = 0.9 + 2.2 * k + 2.6 * k * k * k;
    const tilt = 0.38;
    const orb = (a) => {
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      return [x, 1.6 + z * Math.sin(tilt) * 0.6 + 0.15 * Math.sin(a * 2), z * Math.cos(tilt)];
    };
    return Object.assign(common(t, local, MO), {
      uRo: camAt(t), uTa: [0, 1.32, 0], uCD: norm(CD.map((v, i) => MO.mix(v, norm([0 - camAt(t)[0], 1.95 - camAt(t)[1], 0 - camAt(t)[2]])[i], 0.75))),
      uSol: orb(ang), uLuna: orb(ang + Math.PI),
      uGold: MO.smooth(MO.remap(t, tGoldA, tGoldB)),
      // the fusion ramps in over 5 frames instead of jumping to 0.9: with the beat-56 impact and the
      // tunnel 0.22 s later it would otherwise be the first of three hard flashes in 0.66 s
      uFuse: MO.smooth((t - tFuse) / 0.16),
      uOrbit: k,
    });
  };
  MO.scene(Object.assign({ id: 'rubedo-wedding', section: 'rubedo', from: T1, to: T2, fs: RB_LIB + R2, uniforms: R2u }, post));

  // R3: forward travel with a lift on every kick. Kept under ~2 rings/s (0.07 ring per frame): faster,
  // the dark figure rings and white eye rings swap places from frame to frame and the whole tunnel
  // strobes. The energy comes from the lasers, the hoops and the speed lines instead.
  // Reduced: a steady glide, no lifts.
  const IMP56 = MO.S.fx.find((f) => f.type === 'impact' && Math.abs(f.beat * MO.BEAT - T2) < 1e-3);
  const R3u = (t0, local) => {
    // under the beat-56 impact the frame holds still (the post keys it to a two-tone card), so the
    // two impact frames read as one hit, not two
    const t = IMP56 && !MO.reduced && t0 - T2 < IMP56.duration ? T2 + 0.001 : t0;
    let travel = (MO.reduced ? 0.9 : 1.0) * (t - T2);
    const kicks = MO.reduced ? [] : MO.events.kick.filter((e) => e.t >= T2 - 1e-6 && e.t <= t + 1e-6);
    for (const e of kicks) travel += 0.2 * MO.smooth((t - e.t) / 0.44);
    return Object.assign(common(t, local, MO), {
      uTime: t, uBeat: t / MO.BEAT,
      uImpact: t !== t0 ? 1.1 - 0.6 * (t0 - T2) / IMP56.duration : 0,   // > 0: impact frame, line width
      uLand: IMP56 && !MO.reduced ? MO.clamp(1 - (t0 - T2 - IMP56.duration) / 0.08) : 0,
      uTravel: travel, uTunRoll: 0.30 * (t - T2) + 0.12 * Math.sin((t - T2) * 2.1),
    });
  };
  MO.scene(Object.assign({ id: 'rubedo-tunnel', section: 'rubedo', from: T2, to: T3, fs: RB_LIB + R3, uniforms: R3u }, post));

  // R4 ("I am whole!"): the mandala in full gold bloom, frontal and larger than R1. One camera move:
  // a slow push that accelerates on "whole" (beat 62) into a constant-rate dive into the heart from
  // beat 62.5. It ends on the heart iris at the size the coda opens with (iris radius 1.36 screen
  // units, black pupil 0.24 of it), so the cut on beat 64 is a match cut.
  const tWhole = MO.barTime(15, 2), tDive = MO.barTime(15, 2.5);
  const Z0 = 1.0, V0 = 0.18;                       // start zoom; slow push in log-zoom per second
  const Z_END = 1.36 / 0.02;                       // heart iris (radius 0.02) at 1.36 screen units
  const RD = tDive - tWhole;
  const ramp = (x) => { x = MO.clamp(x); return x * x * x - x * x * x * x / 2; };   // integral of smoothstep
  const VD = V0 + (Math.log(Z_END / Z0) - V0 * (T4 - T3)) / (0.5 * RD + (T4 - tDive));  // ~5.2/s = 1.19x per frame
  const logZ = (t) => Math.log(Z0) + V0 * (t - T3) + (VD - V0) * (t < tDive ? RD * ramp((t - tWhole) / RD) : 0.5 * RD + (t - tDive));
  const LW = logZ(tWhole), LE = logZ(T4);
  const R4u = (t, local) => {
    const k = MO.clamp((t - T3) / (tWhole - T3));
    const dive = MO.clamp((logZ(t) - LW) / (LE - LW));   // dive progress in log-zoom: keys the fades to what is on screen
    const amp = 0.22 * (1 - 0.4 * MO.smooth(k)) * (1 - MO.smooth(dive / 0.4)), ph = 2.1 + 4.0 * (t - T3);
    return Object.assign(common(t, local, MO), {
      uZoom: Math.exp(logZ(t)), uSpin: 0.28 * (t - T3), uTiltA: 1 - dive,
      // the disc precesses gently like a spinning coin (nearly frontal), flattening for the dive
      uTilt: [amp * Math.cos(ph), 0.8 * amp * Math.sin(ph)],
      uSpinT: T3 + (MO.reduced ? 1.0 : 2.0) * (t - T3), uDive: dive, uBloomOpen: 1,
      uLand: MO.clamp(1 - (t - T3) / 0.07), uInvAmt: 0.5,
      uAurum: 0.15 + 5.0 * (t - T3),
    });
  };
  MO.scene(Object.assign({ id: 'rubedo-bloom', section: 'rubedo', from: T3, to: T4, fs: RB_LIB + R4, uniforms: R4u }, post));
})();
