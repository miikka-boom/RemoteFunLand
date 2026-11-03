// RUBEDO — XXI The World: THE DROP. Owner: rubedo agent. Shot factories (see the cue contract):
//   rubedo.mandala  R1  the Mandala of the Self around the World dancer ("Burn me in the fire")
//   rubedo.wedding  R2  the chemical wedding: Sol and Luna orbit a chrome vessel over a checkerboard
//                       floor; the leaden sphere turns to gold ("turn my lead to gold")
//   rubedo.tunnel   R3  fly-through: a tunnel of rings of figures and eyes, lasers ("Magnum Opus")
//   rubedo.bloom    R4  the mandala in full bloom, then a rapid zoom into its heart ("I am whole!")
// placed by score.js "cues"; without a cue list this file places them at their 30 s windows
// (one bar each, bars 12–15, 21.176–28.235 s). Each is its own shader so only one runs per frame;
// natural lengths, stretch behaviour and params: see "shots (JS)" below.
// Everything is a pure function of time. All helpers here use the rb_ prefix.
//
// Photosensitivity (spec 7.3; the 30 s master failed in the tunnel and the dive, 7.1). Built into
// every cue, whatever the score asks, and measured with the flash analyser (flash2, BLOCK 5):
//   rule 1  anything that sweeps across pixels crosses a given pixel at most ~2 times a second or
//           fades to its average: the kick's shock ring (R1, R4), the floor ripple (R2) and the
//           tunnel's hoops fire on beats 1 and 3 only; the tunnel's walls fade their rows of figures
//           and eyes and their ring frames with the travel rate (moAntiStrobe in JS: uWallK) and the
//           tunnel starts again from rest after an impact; the pull-out (R1), the push and the dive
//           (R4) widen the AA footprint with the zoom rate (a radial motion blur, capped at 4 px) and
//           fade the rushing outer field to its average colour (uOutK)
//   rule 2  tunnel lasers: 'beams' (4 in choruses 1-2, 6 in the final chorus), 'laser' brightness
//           (0.6 / 0.8), a fan that sways forward on the beat (<= ~0.31 turns/s with the roll), soft
//           3 px edges, a +18 % kick lift and no on/off; the rainbow set's colours share one luminance
//   rule 3  eye blinks are squints (<= 50 % closure), staggered, and off whenever more than 40 eyes
//           are on screen (counted per frame from the camera: the tunnel and the wedding never blink)
//   rule 4  clap kaleidoscope steps stay; the inversion is ring A only, on the beat-4 clap only,
//           only while ring A covers <= 15 % of the frame (and the wedding's floor on that clap)
//   rule 5  kick pump: centre-weighted, 'pump' 0.15 (choruses 1-2) .. 0.25 (final chorus, default);
//           R4's god rays and zoom nudge no longer pump the whole frame
//   rule 6  the pump lifts only the gold (the crimson ground never pulses with the kick)
//   reduced (7.5): pump x0.3, lasers static on screen, no clap steps, inversions or blinks, the
//           tunnel's travel x0.7 without lifts, impacts off (engine)
(() => {
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
// safety (spec 7.3), each worked out per frame in JS so the shaders read one number:
uniform float uInv;     // rule 4: the clap inversion of ring A (beat-4 clap only, <= 15 % of the frame)
uniform float uRKT;     // rule 1: seconds since the last kick on beat 1 or 3 (shock rings, ripples, hoops)
uniform float uPumpE;   // rule 5: kick pump right now (peak gain over rest x the kick envelope)
uniform float uBlinkK;  // rule 3: eye blinks on (1) / off (0: more than 40 eyes on screen, reduced)
uniform float uOutK;    // rule 1: contrast of the outer field (its rows rush past in the pull-out and the dive)
// variation knobs (cue params); every one is a uniform, so all cues of a shot share one program
uniform vec4  uCamK;    // camera: x zoom multiplier (R3: its inverse), y roll (rad), zw pan (screen units)
uniform float uSeed;    // seed: scatter of the sparkles
uniform vec4  uRingA;   // rings knob: outer bounds of the quaternity, ring A, ring B, ring C blocks
uniform vec3  uRingB;   //   ... of the outer field, R4's great petals, the corona (as drawn: 1e4, 2.05, 1.62;
                        //   a hidden block's bound drops to its inner edge, assembling sweeps it out)

const vec3 RB_CRIM  = vec3(0.80, 0.015, 0.05);
const vec3 RB_VERM  = vec3(1.00, 0.22, 0.035);
const vec3 RB_SCAR  = vec3(1.00, 0.05, 0.03);
const vec3 RB_MAG   = vec3(0.85, 0.02, 0.40);
const vec3 RB_GOLD  = vec3(1.00, 0.62, 0.15);
const vec3 RB_HOT   = vec3(1.00, 0.86, 0.64);
const vec3 RB_ULTRA = vec3(0.05, 0.07, 0.45);
const vec3 RB_OUTAVG = vec3(0.16, 0.05, 0.035);   // the outer field's average colour (measured)

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
// amount (spec 7.3 rules 5 and 6): only the middle of the frame pulses (w = 1 there, ~0 at the
// edges), and only its gold: the crimson ground never pulses with the kick (gl: 0 for crimson,
// scarlet and magenta, 1 for gold and white-hot). uPumpE = 0.95 x the pump knob (+15 % choruses 1-2,
// +25 % the final chorus; x0.3 reduced) x exp(-(time since the kick) / 0.16).
vec3 rb_pump(vec3 col, float w) {
  float gl = smoothstep(0.15, 0.45, col.g / max(col.r, 1e-3));
  return col * (0.95 + uPumpE * w * gl);
}
// eye blink on open hats: closes in 30 ms, open again by 170 ms. Each eye starts up to 0.14 s late
// (delay from its id), so the blink ripples through the rings instead of every white eye in the
// frame shutting on the same frame, and callers only half-close them (squints, <= 50 % closure:
// rb_eye closes 0.94 x this). uBlinkK (spec 7.3 rule 3): 0 whenever more than 40 eyes are on screen,
// and in reduced mode
float rb_blink(float id) {
  float x = uOT - 0.14 * fract(id * 0.6180339);
  return smoothstep(0.0, 0.03, x) * (1.0 - smoothstep(0.06, 0.17, x)) * step(x, 0.3) * uBlinkK;
}

// lead into gold: the crimson mandala transmuted to molten gold, white-hot in the highlights,
// with crimson left only in the deepest shadows (R4's transmutation)
vec3 rb_aurum(vec3 c) {
  float l = dot(c, vec3(0.55, 0.38, 0.07));
  vec3 g = l * mix(vec3(1.30, 0.66, 0.18), vec3(1.05, 0.92, 0.75), smoothstep(0.8, 3.0, l));
  return mix(c, g, 0.85 * smoothstep(0.015, 0.12, l));
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
  // the beat-4 clap inverts the figures of ring A (one ring, <= 15 % of the frame: spec 7.3 rule 4);
  // never on the drop's first clap (uST < 1), during the R4 dive or in reduced mode (JS: uInv)
  float inv = uInv;

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
  vec3 figC = rb_figShade(dB, fbp, fs, fe, tt, fseed, r < 1.2 ? inv : 0.0, 1.0);   // ring A only, never the outer field
  // the eye: ring B or an outer-field eye
  vec3 qb = rb_polar(p, 20.0, -0.10 * sp - cstep * TAU / 40.0);
  bool ringB = r < 1.2;
  float eid = ringB ? qb.z : oid + row * 7.0;
  vec3 eyeC = rb_eye(ringB ? vec2(qb.x, qb.y - 0.912) : cell, ringB ? 0.088 : 0.40, ringB ? 0.046 : 0.22, ringB ? e : ce, (ringB ? 0.53 : 0.45) * rb_blink(eid), eid, tt);
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
  if (r > 0.33 && r < uRingA.x) {
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
  if (r > 0.56 && r < uRingA.y) {
    float bandA = smoothstep(0.585, 0.59, r) * smoothstep(0.835, 0.83, r);
    col = mix(col, vec3(0.003, 0.004, 0.030) + vec3(0.06, 0.0, 0.01) * smoothstep(0.75, 0.59, r), bandA);
    col += figC;
    col += RB_GOLD * 1.4 * (rb_ln(r - 0.835, 0.9 * e, e) + rb_ln(r - 0.848, 0.5 * e, e));
    col += RB_GOLD * 0.9 * rb_ln(r - 0.585, 0.6 * e, e);
  }

  // ---- ring B: 20 almond eyes
  if (r > 0.84 && r < uRingA.z) {
    col = mix(col, vec3(0.05, 0.0, 0.03), smoothstep(0.848, 0.853, r) * smoothstep(0.972, 0.967, r));
    col += eyeC;
    // diamonds between eyes
    vec3 q2 = rb_polar(p, 20.0, -0.10 * sp - cstep * TAU / 40.0 + TAU / 40.0);
    float dd = abs(q2.x) + abs(q2.y - 0.92) * 0.7 - 0.022;
    col = mix(col, RB_GOLD * 1.4, rb_fl(dd, e));
    col += RB_GOLD * 1.4 * (rb_ln(r - 0.985, 0.9 * e, e) + rb_ln(r - 0.972, 0.5 * e, e));
  }

  // ---- ring C: 16 glyph medallions with Holy-Mountain chevrons between
  if (r > 0.97 && r < uRingA.w) {
    vec3 q = qc;
    // chevrons
    float chev = abs(fract((q.y - abs(q.x) * 0.9) * 22.0) - 0.5);
    float band = step(1.0, r) * step(r, 1.145);
    vec3 cc = mix(vec3(0.05, 0.0, 0.012), vec3(0.42, 0.015, 0.02), smoothstep(0.24 + 0.5 * e * 22.0, 0.24 - 0.5 * e * 22.0, chev));
    cc += RB_GOLD * 0.7 * rb_ln(chev - 0.24, 0.5 * e * 22.0, e * 22.0);
    col = mix(col, cc, band);
    col = mix(col, md, mm) + md * (1.0 - mm) * 0.5;
    col += RB_GOLD * 1.5 * (rb_ln(r - 1.150, 0.9 * e, e) + rb_ln(r - 1.0, 0.7 * e, e));
  }

  // ---- outer field: log-polar Net of Being (rows of figures and eyes, endless)
  // (anti-strobe, spec 7.3 rule 1: where its rows rush past faster than ~2 a second, uOutK fades
  // them to their average colour)
  if (r > 1.40 && r < uRingB.x) {
    vec3 add = figRow > 0.5 ? figC : eyeC;
    col += mix(RB_OUTAVG, add, uOutK) * 0.55 * smoothstep(1.40, 1.55, r);
  }

  // ---- full bloom (R4): twelve great magenta lotus petals open behind the corona
  if (bloom > 0.01 && r > 1.08 && r < uRingB.y) {
    vec3 q = rb_polar(p, 12.0, -0.03 * sp + TAU / 24.0);
    float pd = sdVesica(vec2(q.x, q.y - 1.12 - 0.42 * bloom), 0.17 * bloom, 0.42 * bloom + 0.001);
    float pf = rb_fl(pd, e);
    vec3 pc = mix(vec3(0.30, 0.0, 0.14), vec3(0.04, 0.0, 0.03), sat((q.y - 1.12) / (0.84 * bloom)));
    col = mix(col, pc + col * 0.25, pf);
    col += RB_MAG * 1.0 * rb_cont(pd, 0.022, 0.5 * e, e) * pf * smoothstep(-0.12, -0.01, pd);
    col += mix(RB_GOLD * 1.5, RB_MAG * 1.2, sat((q.y - 1.3) / 0.6)) * rb_ln(pd, 0.7 * e, e);
  }

  // ---- ring D: the corona: straight rays (Tarot XIX) alternating with nested flame tongues
  if (r > 1.13 && r < uRingB.z) {
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
  // (on beats 1 and 3 only, uRKT: at every kick it would cross each pixel 2.3 times a second)
  float rk = 0.30 + uRKT * 3.4;
  float kr = exp(-uRKT / 0.22) * step(uRKT, 1.0) * (1.0 - 0.6 * uReduced);
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
  float hn0 = uHN + uSeed * 17.0;
  for (int i = 0; i < 4; i++) {
    float hn = hn0 - float(i);
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
uniform float uImpact;  // 1 during an impact's frames (the post pass keys them to light lines on black)
uniform float uIT;      // seconds since that impact
uniform float uLandT;   // seconds since the impact the mandala lands from (99: none)
uniform float uPT;      // the pull-out's clock: uST scaled by the speed knob
uniform vec2 uPull;     // the pull-out: start zoom, length (s of uPT)
void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  float t = uST, pt = uPT;
  vec2 c = vec2(0.0, 0.12) + uCamK.zw;
  float sl = speedLines(uv, c, 140.0, uTime, 0.55);
  if (uImpact > 0.5) {
    // the impact frames: the black sun of Nigredo returns as an eclipse, a black disc in a ragged
    // corona, plus speed lines. Only the bright parts survive the key. Across the two frames it only
    // dims a little: a change back up would count as one more flash.
    vec2 d = uv - c;
    float rs = length(d), an = atan(d.y, d.x);
    float R = 0.42;
    float ray = hash11(floor(an / TAU * 90.0) + 3.0);
    float corona = exp(-max(rs - R, 0.0) / ((0.02 + 0.07 * ray * ray) * (1.0 - 8.0 * uIT))) * step(R, rs);
    vec3 col = vec3(3.0) * corona + vec3(3.0) * sl * smoothstep(R + 0.15, R + 0.35, rs);
    fragColor = vec4(col, 1.0);
    return;
  }
  float kenv = exp(-uKT / 0.11);
  // pull-out from the dancer to the whole mandala; a quadratic ease (not quartic) keeps the outer
  // field from scrolling past at 10+ rows/s. uPull (JS): x the start zoom, y the pull's length.
  // Spec 7.3 rule 1: from 2.2 over 2 s (the 30 s piece: 3.6 over 1.72 s): every ring of the mandala
  // crosses the pixels it passes, so a shorter, slower pull halves the crossings in its first second
  float pull = 1.0 - pow(1.0 - sat(pt / uPull.y), 2.0);
  // (reduced: a shorter pull from 1.6 and a third of the roll)
  float zoom = mix(uPull.x, 0.80, pull) * (1.0 + 0.015 * kenv * (1.0 - 0.6 * uReduced)) * uCamK.x;
  float roll = (-0.17 * pt - 0.25 * (1.0 - smoothstep(0.0, 1.0, pt))) * (1.0 - 0.65 * uReduced) + uCamK.y;
  vec2 tl = vec2(0.30 * (1.0 - pull) + 0.06 * sin(pt * 1.7), 0.10 * sin(pt * 1.3 + 0.5));
  vec3 vw = rb_view(uv - c, zoom, tl, roll);
  vec2 p = vw.xy;
  // sakuga shock distortion near the kick ring
  float rk = (0.30 + uRKT * 3.4);
  float rr = length(p);
  p *= 1.0 - 0.025 * exp(-uRKT / 0.2) * rb_g((rr - rk) / 0.05);
  float e = vw.z;
  // fully lit from the first frame after the impact: the colour hits on the beat, no slow reveal
  vec3 col = rb_mandala(p, e, uTime, 0.0);
  col = rb_pump(col, exp(-dot(uv - c, uv - c) / 0.30));
  // the colour lands over two frames after the impact (86 % -> 100 %): one rising change, rather
  // than a jump followed by a dip that reads as a second flash. Reduced has no impact: the cut from
  // the cream insert is the one change, and the mandala settles from a little brighter after it.
  col *= mix(mix(0.86, 1.0, sat((uLandT - 0.09) / 0.035)), mix(1.25, 1.0, sat(uLandT / 0.1)), uReduced);
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
uniform vec3 uMetA, uMetB, uMetF;   // metal knob: the stone's colour before / after the front, the front's glow
uniform vec2 uMetK;          // x: how leaden it is (tarnish), y: its warmth (floor glow, highlight), as uGold in the 30 s
uniform vec3 uChkA, uChkB;   // the checkerboard's two colours (floor knob)
uniform float uFloorInv;     // the floor's clap inversion right now (the beat-4 clap; off in reduced mode)
uniform float uFuseAt;       // seconds from the scene start to the fusion
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
  // lead -> gold (the metal knob: uMetA -> uMetB), a front sweeping down the vessel
  float front = mix(1.3, -1.3, uGold);
  float g = smoothstep(front - 0.08, front + 0.08, n.y);
  return mix(uMetA, uMetB, g) + uMetF * rb_g((n.y - front) / 0.05) * step(0.01, uGold) * step(uGold, 0.99);
}
vec3 rb_floorBase(vec3 h, vec2 dx, vec2 dy) {
  vec2 g = h.xz * 0.85;
  vec2 w = max(abs(dx), abs(dy)) * 0.85 + 0.001;
  vec2 i = 2.0 * (abs(fract((g - 0.5 * w) * 0.5) - 0.5) - abs(fract((g + 0.5 * w) * 0.5) - 0.5)) / w;
  float chk = 0.5 - 0.5 * i.x * i.y;
  chk = mix(chk, 1.0 - chk, uFloorInv);
  vec3 base = mix(uChkA, uChkB, chk);   // crimson: (0.004, 0, 0.008) / (0.34, 0, 0.03)
  // kick ripple: a ring of light running out across the floor from under the vessel
  float rr = length(h.xz - RB_SC.xz);
  // (on beats 1 and 3 only: at every kick it would cross each pixel of the floor 2.3 times a second)
  float rk = 1.0 + uRKT * 9.0;
  base += vec3(2.4, 0.9, 0.2) * rb_g((rr - rk) / 0.10) * exp(-uRKT / 0.3);
  // contact shadow and glow under the vessel
  base *= 0.35 + 0.65 * smoothstep(0.2, 1.4, rr);
  base += vec3(1.0, 0.3, 0.05) * exp(-rr * 1.5) * 0.35 * (0.4 + uMetK.y);
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
    col *= 1.0 - 0.35 * (1.0 - uMetK.x) * (0.5 + 0.5 * vnoise(nS.xy * 9.0));   // leaden tarnish
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
  col += vec3(3.0, 2.2, 1.4) * sparkle(uv, hs, 0.10 + 0.06 * exp(-uKT / 0.1)) * (0.5 + uMetK.y);
  col += rb_sparkles(uv, 0.045) * 0.7;
  // the fusion (coniunctio): a starburst of rays and a shock ring from the vessel
  if (uFuse > 0.0) {
    vec3 cv = transpose(cam) * (RB_SC - ro);
    vec2 cs = cv.xy / cv.z * RB_F;
    vec2 d = uv - cs; float rr = length(d); float aa = atan(d.y, d.x);
    float rays = pow(0.5 + 0.5 * cos(aa * 12.0 + uTime * 2.0), 8.0) + 0.6 * pow(0.5 + 0.5 * cos(aa * 28.0 - uTime * 3.0), 16.0);
    float ft = max(uLocal - uFuseAt, 0.0);  // seconds since the fusion
    col += vec3(2.4, 1.2, 0.35) * rays * smoothstep(0.30, 0.5, rr) * exp(-(rr - 0.3) * 1.5) * uFuse;
    float rk = 0.35 + ft * 2.6;
    col += vec3(3.0, 2.0, 1.0) * rb_g((rr - rk) / 0.012) * exp(-ft / 0.25);
  }
  fragColor = vec4(rb_grade(col), 1.0);
}`;

  // ------------------------------------------------------------------ R3: the fly-through
  const R3 = `
uniform float uTravel, uTunRoll, uImpact, uLand;
uniform vec3 uLasA, uLasB, uLasC, uLasD;   // laser colours: beam 0, beam 3, beams 2 and 4, beams 1 and 5
uniform vec2 uLasN;          // x: angle between beams (1.047: six evenly), y: number of beams
uniform vec4 uLasM;          // laser motion (JS): x fan angle, y sway phase, z sway amplitude (rad), w brightness (kick lift)
uniform vec2 uWallK;        // anti-strobe (spec 7.3 rule 1, JS): x the ring frames, y the rows of figures and eyes
uniform vec2 uWalls;         // ring kind: figures where mod(ring, 2) * x < y (1, .5: alternate; 0, .5: figures; 0, -1: eyes)
void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  vec2 vp = vec2(0.06 * sin(uTime * 1.3), 0.10 + 0.04 * sin(uTime * 0.9)) + uCamK.zw;
  vec2 q = rb_rot(uv - vp, uTunRoll) * uCamK.x;    // (uCamK.x = 1 / zoom here)
  float pq = px() * uCamK.x;                        // one pixel in q units
  float r = max(length(q), 1e-3);
  float a = atan(q.y, q.x);
  // tunnel of radius 1: depth z = F / r
  float F = 0.9;
  float z = F / r;
  float zz = z + uTravel;
  float n = 14.0;                                   // figures per ring
  float cw = TAU / n;                               // cell width (tunnel radius 1)
  float ew = pq * z * z / F;                        // pixel footprint on the wall
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
  // anti-strobe (spec 7.3 rule 1): the rows of figures and eyes rush past a pixel at the travel rate,
  // about three features (eye whites, bodies, gaps) a ring; uWallK.y = moAntiStrobe of that per frame
  // fades them toward their average colour, as the far rows already fade with distance (detail)
  float dc = detail * uWallK.y;
  vec3 col = vec3(0.012, 0.004, 0.03);
  // (no clap inversion here: the tunnel already moves the whole frame)
  if (mod(seg, 2.0) * uWalls.x < uWalls.y) {
    float rowRot = seg * 0.5 + uTime * 0.35 * (mod(seg, 4.0) < 1.0 ? 1.0 : -1.0);
    float uu = u + rowRot;
    float id = floor(uu + 0.5);
    vec2 cell = vec2((uu - id) * cw, lz);           // world units on the wall
    vec2 bp = vec2(cell.x, -cell.y) / 0.40;         // heads toward the light
    vec3 fc = rb_figure(bp, 0.40, ew, uTime, id + seg * 7.0, 0.0, 0.10);
    col = fc * dc + (1.0 - dc) * vec3(0.14, 0.005, 0.03);
  } else {
    float uu = u - seg * 0.5 - uTime * 0.25;
    float id = floor(uu + 0.5);
    vec2 cell = vec2((uu - id) * cw, lz);
    // (no blinks: more than 40 eyes are on screen, spec 7.3 rule 3)
    vec3 ec = rb_eye(cell, 0.19, 0.11, ew, 0.0, id + seg, uTime);
    col = mix(vec3(0.06, 0.0, 0.03), vec3(0.0), 0.0) + ec;
    col = col * dc + (1.0 - dc) * vec3(0.16, 0.01, 0.03);
  }
  // gold ring frames between rows, fine lattice lines along the tunnel. Anti-strobe (spec 7.3 rule 1;
  // uWallK.x = moAntiStrobe of the frames passing a pixel per frame, two features each: the dark band
  // and its gold lines): fast, the frames and their beads fade to their (small) average coverage
  float near = smoothstep(0.30, 0.07, ew) * uWallK.x;
  col = mix(col, vec3(0.02, 0.0, 0.01), rb_ln(ringD, 0.045, ew) * near);
  col += RB_GOLD * 1.5 * (rb_ln(ringD - 0.03, 0.006 + 0.5 * ew, ew) + rb_ln(ringD, 0.010 + 0.5 * ew, ew)) * near;
  float bead = length(vec2((fract(u * 4.0 + 0.5) - 0.5) * cw / 4.0, ringD - 0.0)) - 0.016;
  col += RB_HOT * 2.0 * rb_fl(bead, ew) * detail * uWallK.x;
  col += RB_SCAR * 0.6 * rb_ln(latt, 0.004 + 0.4 * ew, ew) * detail;
  col *= fog;
  // the nearest wall (the frame's edges) rushes past dimmed toward its average red: there one ring
  // covers a quarter of the screen, so a ring change there would flash the whole edge
  col = mix(col, vec3(0.09, 0.003, 0.02), 0.7 * smoothstep(0.85, 0.45, z));
  // the light at the end of the tunnel: the Self
  col += RB_HOT * (0.5 * exp(-r * 22.0) + 6.0 * exp(-r * r * 4000.0)) + RB_SCAR * 0.30 * exp(-r * 5.0);
  // kick: a hoop of light flying past, on beats 1 and 3 (uRKT; at every kick it would cross each
  // pixel 2.3 times a second)
  float kz = 6.0 - uRKT * 18.0;
  // (it fades out before it reaches the frame's edge, where it would sweep half the screen per frame)
  col += RB_HOT * 1.8 * rb_g((z - kz) / (0.03 * z * z)) * exp(-uRKT / 0.25) * smoothstep(0.6, 1.6, kz) * (1.0 - 0.8 * uReduced);
  // lasers from the vanishing point (spec 7.3 rule 2). The fan sways on a two-bar cycle that steps
  // forward on every beat (eased out, never back), so a beam crosses a given pixel about once a
  // second; with the tunnel roll a beam turns at most ~0.31 turns per second. Soft 3 px edges; the
  // kick only lifts them +18 % (no on/off). Reduced: they stand still on screen (JS: uLasM).
  // (the uniforms are read once, before the loop: uniform reads inside it cost ~10 % of the frame)
  vec3 lA = uLasA, lB = uLasB, lC = uLasC, lD = uLasD;
  float ls = uLasN.x, nb = uLasN.y;
  vec4 lm = uLasM;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float side = mod(fi, 2.0) * 2.0 - 1.0;
    float ang = fi * ls + lm.x + side * lm.z * sin(lm.y + fi);
    vec2 dir = vec2(cos(ang), sin(ang));
    float along = dot(q, dir);
    float perp = abs(dot(q, vec2(-dir.y, dir.x)));
    float w = 0.0015 + 0.004 * along;
    float beam = (1.0 - smoothstep(w, w + pq * 3.0, perp)) * step(0.0, along);
    vec3 lc = i == 0 ? lA : i == 3 ? lB : (mod(fi, 2.0) < 0.5 ? lC : lD);   // blue, gold, red, magenta
    col += lc * (beam * 1.5 + 0.25 * exp(-perp / (0.02 + 0.03 * max(along, 0.0)))) * lm.w * step(fi + 0.5, nb) * smoothstep(0.02, 0.15, along);
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
void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  float kenv = exp(-uKT / 0.11);
  // (a 1.5 % kick nudge, as R1: at 5 % every fine line breathed across several pixels on each kick)
  float zoom = uZoom * (1.0 + 0.015 * kenv * (1.0 - 0.6 * uReduced) * (1.0 - uDive));
  vec2 c = vec2(0.0, 0.10 * (1.0 - uDive)) + uCamK.zw * (1.0 - uDive);
  vec2 tl = uTilt + vec2(0.05 * sin(uTime * 1.1), 0.035 * cos(uTime * 0.8)) * uTiltA;
  vec3 vw = rb_view(uv - c, zoom, tl, uSpin);
  vec2 p = vw.xy;
  float rk = (0.30 + uRKT * 3.4);
  float rr = length(p);
  p *= 1.0 - 0.02 * exp(-uRKT / 0.2) * rb_g((rr - rk) / 0.05) * (1.0 - uDive);
  vec3 col = rb_mandala(p, vw.z, uTime, uBloomOpen);
  col = rb_pump(col, exp(-dot(uv - c, uv - c) / 0.30) * (1.0 - uDive));
  // god rays from the heart, pumped by the kick (from dive 0.45 on, the frame is all inside r < 0.35
  // where they are zero: a uniform branch, so the deep-dive frames skip them)
  if (uDive < 0.45) {
    float ga = atan(p.y, p.x) - uSpinT * 0.1;
    float gr = pow(0.5 + 0.5 * cos(ga * 12.0), 6.0) + 0.5 * pow(0.5 + 0.5 * cos(ga * 24.0 + 1.0), 12.0);
    // (steady: they fill most of the frame, and only the centre may pump with the kick, rule 5)
    col += vec3(1.0, 0.35, 0.08) * gr * exp(-rr * 1.1) * 0.17 * smoothstep(0.35, 0.6, rr);
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

  // ======================================================================== shots (JS)
  // Every shot is a factory, MO.shot('rubedo.<name>', (cue) => ...), that a cue of the score places
  // anywhere, at any length; without a cue list the end of this file places them at their 30 s
  // windows, so that edit renders exactly as before.
  //
  // Clocks inside a shot (all relative to its cue):
  //   ts    the choreography's start: the cue start minus params.offsetBeats (real time)
  //   drop  the shot's virtual drop: ts minus the shot's natural distance from beat 48 (0, 4, 8, 12
  //         beats). Section-wide state is counted from it, as the 30 s piece counted it from the
  //         drop: the clap kaleidoscope steps, the ring rotation clock and uST (the centre's heat and
  //         the inversion gate need uST >= 1 s outside the mandala shot, which this guarantees)
  //   pc    progress seconds, (t - ts) scaled by params.speed: camera moves, travel, spins
  //   one-shot events: impacts (the score's fx inside the cue window), the gold transmutation (the
  //         score's words "lead" .. "gold" inside the cue), the fusion and the dive (the cue end)
  // Kicks, claps and hats come from the score at absolute t.
  //
  // Params of every rubedo shot (optional, unknown keys ignored; uniforms, so every cue of a shot
  // shares one program):
  //   offsetBeats  0..16                start this far into the choreography (default 0)
  //   speed        0.25..2 | 'fit'      rate of motion: camera moves, ring spin, travel ('fit':
  //                                     natural length / cue length) (default 1; the tunnel caps it
  //                                     at 1.5, faster its rings strobe)
  //   seed         0..99                kaleidoscope phase (which glyph, eye and figure sits where),
  //                                     sparkle scatter, animation phases (default 0)
  //   palette      'crimson' | 'gold' | 'lead' | 'violet' | 'emerald' | 'nigredo': crimson as drawn
  //                (default); gold: a warm gold duotone; lead: cool silver-grey, before the
  //                transmutation; violet: albedo moonlight; emerald: the green lion; nigredo: ink and
  //                violet. These are presets of the engine's generic post grade (scene.grade: zero
  //                cost in the scene shader); an explicit params.grade wins over them
  //   zoom         0.5..2               camera zoom multiplier (default 1)
  //   pan          [x, y] screen units  camera offset (the frame is 2 units tall) (default [0, 0])
  //   roll         -45..45 degrees      camera roll, added (default 0)
  //   spin         -3..3                ring rotation rate and direction (-1 reverses) (default 1)
  //   rings        1..7                 mandala rings drawn, centre outward: 1 the dancer in the
  //                                     mandorla, 2 + the quaternity, 3 + the Net of Being (24
  //                                     figures), 4 + 20 eyes, 5 + 16 glyph medallions, 6 + the
  //                                     corona (and R4's great petals), 7 + the outer field (default 7);
  //                                     fractions cut part-way (a soft radial edge)
  //   assemble     0..8 beats           0: all rings at once; > 0: they grow out from the centre,
  //                                     one ring per that many beats from the cue start, the edge
  //                                     sweeping out over 0.15 s on each beat (default 0)
  //   pump         0..0.25              the kick pump's peak gain over rest at the frame's centre, gold
  //                                     only (spec 7.3 rule 5: 0.15 in choruses 1-2 and elsewhere,
  //                                     0.25 only in the final chorus) (default 0.25, the 30 s drop;
  //                                     x0.3 in reduced mode). The tunnel has no pump.
  const BEAT = MO.BEAT;
  const bt = (b) => b * BEAT;
  const C = MO.clamp;
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  // palette presets: the engine's generic grade (MO.gradeAt: hue, saturation, contrast, gain, lift on
  // the tone-mapped picture). Measured: a colour matrix or a skipped uniform branch in these shaders
  // cost 2-3 % of the frame in SwiftShader; the post grade costs nothing here.
  const PALETTES = {
    gold: { saturation: 0.35, gain: [1.12, 0.86, 0.46], contrast: 1.05 },
    lead: { saturation: 0.08, gain: [0.86, 0.9, 1.0], contrast: 1.04 },
    violet: { hue: -28, saturation: 0.55, gain: [0.78, 0.62, 1.15] },
    emerald: { hue: 118, saturation: 0.9 },
    nigredo: { saturation: 0.22, gain: [0.82, 0.70, 0.98], contrast: 1.15 },
  };
  // the rings knob: each block's outer bound in rb_mandala, inner edge -> natural bound as ring n
  // comes in (blocks: quaternity 2, ring A 3, ring B 4, ring C 5, corona and R4's petals 6, outer
  // field 7). Drawn as in the 30 s piece, the bounds equal the shader's own literals
  const BLOCKS = [[0.33, 0.60, 2], [0.56, 0.86, 3], [0.84, 1.0, 4], [0.97, 1.17, 5], [1.40, 1e4, 7], [1.08, 2.05, 6], [1.13, 1.62, 6]];
  const ringBounds = (n) => BLOCKS.map(([a, b, k]) => (n >= k ? b : n <= k - 1 ? a : MO.mix(a, b === 1e4 ? 2.4 : b, n - (k - 1))));
  const ALL_RINGS = ringBounds(7);

  // the score's impacts inside [a, b), in time order: [{t, dur}]
  const impactsIn = (a, b) => MO.S.fx.filter((f) => f.type === 'impact').map((f) => ({ t: bt(f.beat), dur: f.duration }))
    .filter((f) => f.t >= a - 1e-3 && f.t < b).sort((x, y) => x.t - y.t);
  // words of the score's vocal lines matching re inside [a, b): [t...]
  function wordsIn(re, a, b) {
    const out = [];
    for (const part in MO.S.vocals) for (const line of MO.S.vocals[part]) {
      if (!Array.isArray(line.words)) continue;
      for (const [w, step] of line.words) { const t = MO.barTime(line.bar, 0, step); if (re.test(w) && t >= a - 1e-6 && t < b) out.push(t); }
    }
    return out.sort((x, y) => x - y);
  }

  // ---- safety helpers (spec 7.3)
  // the score's kicks on beats 1 and 3 (shock rings, floor ripples, hoops: at every kick of the
  // four-on-the-floor they would cross each pixel 2.3 times a second, rule 1) and its claps on
  // beat 4 (the one clap a bar that may invert a ring, rule 4); worked out once
  let BEV = null;
  const beatEvents = () => {
    if (BEV) return BEV;
    const on = (e, k, m) => { const b = e.t / BEAT, n = Math.round(b); return Math.abs(b - n) < 0.02 && ((n % m) + m) % m === k; };
    BEV = { ringKicks: MO.events.kick.filter((e) => on(e, 0, 2)), claps4: MO.events.clap.filter((e) => on(e, 3, 4)) };
    return BEV;
  };
  // features crossing a pixel per frame (30 fps) -> contrast (rule 1, as moAntiStrobe in lib.js)
  const antiStrobe = (perFrame) => 1 - MO.smooth((perFrame - 0.07) / 0.18);
  // the last event of a time-sorted list at or before t (binary search), or null
  const lastIn = (ev, t) => {
    let lo = 0, hi = ev.length - 1, b = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (ev[m].t <= t + 1e-6) { b = m; lo = m + 1; } else hi = m - 1; }
    return b < 0 ? null : ev[b];
  };
  // the frame seen from a centre at screen point c (frame: x +-16/9, y +-1): the distance from c to
  // the frame's edge along each of NA directions
  const NA = 96;
  const DIRS = Array.from({ length: NA }, (_, i) => [Math.cos((i + 0.5) * 2 * Math.PI / NA), Math.sin((i + 0.5) * 2 * Math.PI / NA)]);
  const edgeDist = (cx, cy) => DIRS.map(([dx, dy]) => {
    const A = 16 / 9;
    const tx = dx > 1e-9 ? (A - cx) / dx : dx < -1e-9 ? (-A - cx) / dx : 1e9;
    const ty = dy > 1e-9 ? (1 - cy) / dy : dy < -1e-9 ? (-1 - cy) / dy : 1e9;
    return Math.max(0, Math.min(tx, ty));
  });
  // share of the frame covered by the annulus [r0, r1] (screen units) round c
  const annulusShare = (ed, r0, r1) => {
    let a = 0;
    for (const d of ed) { const e = Math.min(d, r1); if (e > r0) a += 0.5 * (e * e - r0 * r0); }
    return a * (2 * Math.PI / NA) / (4 * 16 / 9);
  };
  // share of the circle of radius R (screen units) round c that lies inside the frame
  const circleShare = (ed, R) => { let n = 0; for (const d of ed) if (d > R) n++; return n / NA; };
  // eyes of the mandala on screen at a zoom (screen units per mandala unit) round c: ring B (20 at
  // r 0.912) and the outer field (48 a row, every other row of the log-polar grid from r 1.45), as
  // far as the rings knob draws them
  const OW = 2 * Math.PI / 48;
  const mandalaEyes = (ed, zoom, rb) => {
    let n = rb[2] > 0.9 ? 20 * circleShare(ed, 0.912 * zoom) : 0;
    const far = Math.max(...ed) / zoom;
    if (rb[4] > 1.45) for (let row = 1; ; row += 2) {
      const rc = 1.45 * Math.exp((row + 0.5) * OW);
      if (rc > far || rc > rb[4]) break;
      n += 48 * circleShare(ed, rc * zoom);
    }
    return n;
  };
  // blinks on with at most 40 eyes on screen (rule 3), never in reduced mode
  const blinkK = (eyes) => (MO.reduced ? 0 : C((41 - eyes) / 3));
  // the beat-4 clap's inversion of ring A (r 0.585-0.835): one ring, only while it covers at most
  // 15 % of the frame (rule 4); never in reduced mode, in the first second after the drop or while
  // diving. amt: R4 halves it (its gold figures are brighter)
  const ringInv = (t, X, ed, zoom, amt, dive) => {
    if (MO.reduced || dive > 0 || t - X.drop < 1) return 0;
    const c = lastIn(beatEvents().claps4, t);
    if (!c || t - c.t > 1) return 0;
    return annulusShare(ed, 0.585 * zoom, 0.835 * zoom) <= 0.15 ? amt * Math.exp(-(t - c.t) / 0.13) : 0;
  };

  // R1's pull-out: start zoom and length (s of progress); reduced as the 30 s piece had it
  const PULL = () => (MO.reduced ? [1.6, 1.72] : [2.2, 2.0]);

  // natural windows (beats) and distance from the drop (beat 48)
  const NAT = { mandala: [48, 52], wedding: [52, 56], tunnel: [56, 60], bloom: [60, 64] };
  function cueContext(cue, name) {
    const P = cue.params || {};
    const nat = NAT[name], natB = nat[1] - nat[0];
    const maxSpeed = name === 'tunnel' ? 1.5 : 2;
    const speed = P.speed === 'fit' ? C(natB / Math.max(cue.beat1 - cue.beat0, 1e-3), 0.25, maxSpeed) : C(num(P.speed, 1), 0.25, maxSpeed);
    const off = C(num(P.offsetBeats, 0), 0, 64);
    const vb0 = cue.beat0 - off;
    const seed = C(num(P.seed, 0), 0, 99);
    const X = {
      P, cue, from: cue.from, to: cue.to, speed, off, seed,
      ts: bt(vb0), drop: bt(vb0 - (nat[0] - 48)),
      L: bt(nat[1]) - bt(nat[0]),
      spin: C(num(P.spin, 1), -3, 3),
      impacts: impactsIn(cue.from, cue.to),
    };
    X.pc = (t) => off * BEAT + (t - X.from) * speed;
    // the kick pump's peak gain over rest at the centre (spec 7.3 rule 5: 0.15 in choruses 1-2,
    // 0.25 only in the final chorus), x0.3 in reduced mode
    X.pump = C(num(P.pump, 0.25), 0, 0.25) * (MO.reduced ? 0.3 : 1);
    X.tmOn = speed !== 1 || seed !== 0;
    X.tm = (t) => (X.tmOn ? X.from + (t - X.from) * speed + seed * 7.31 : t);
    X.impactAt = (t) => { let f = null; for (const i of X.impacts) if (i.t <= t + 1e-9) f = i; return f; };
    const zoom = C(num(P.zoom, 1), 0.5, 2), roll = C(num(P.roll, 0), -45, 45) * Math.PI / 180;
    const pan = Array.isArray(P.pan) ? [num(P.pan[0], 0), num(P.pan[1], 0)] : [0, 0];
    X.zoom = zoom; X.roll = roll; X.pan = pan;
    X.camK = [zoom, roll, pan[0], pan[1]];
    // the frame seen from the mandala's centre (screen y cy, plus the pan), memoised per cy
    const edm = {};
    X.edges = (cy) => edm[cy] || (edm[cy] = edgeDist(pan[0], cy + pan[1]));
    // the palette preset goes to the engine's post grade, unless the cue sets params.grade itself
    X.grade = P.grade == null ? PALETTES[P.palette] : undefined;
    const rings = C(num(P.rings, 7), 1, 7), asm = C(num(P.assemble, 0), 0, 8);
    // assemble: a ring per `asm` beats, its edge sweeping out over 0.15 s on the beat
    const still = rings >= 7 ? ALL_RINGS : ringBounds(rings);
    X.rings = asm > 0
      ? (t) => { const b = Math.max(0, t - X.from) / (asm * BEAT); return ringBounds(Math.min(rings, 1 + Math.floor(b) + MO.easeOut((b % 1) * asm * BEAT / 0.15))); }
      : () => still;
    return X;
  }

  // what every rubedo shot sets each frame (a program shared by several cues starts each scene
  // from zeroed uniforms, so the knobs are always set)
  const common = (t, X, spinRate = 1, spinFrom = X.drop) => {
    const since = (n) => { const l = MO.last(n, t); return l ? t - l.e.t : 99; };
    const claps = MO.count('clap', t) - MO.count('clap', X.drop - 0.001);
    const ct = since('clap');
    // (the rings' rate is capped at 1.5x the 30 s drop's: faster, ring A's figures cross a pixel more
    // than twice a second, spec 7.3 rule 1; R4 asked for 2x)
    const r0 = spinRate * X.spin * X.speed;
    const rate = (MO.reduced ? 0.5 : 1) * Math.sign(r0) * Math.min(Math.abs(r0), 1.5);
    const kt = since('kick'), rk = lastIn(beatEvents().ringKicks, t);
    const u = {
      uST: t - X.drop, uKT: kt, uCT: ct, uOT: since('openHat'), uHT: since('closedHat'),
      uHN: MO.count('closedHat', t),
      // each clap turns the rings one kaleidoscope step; not the drop's first clap, which lands
      // with the kick and the "in" pop: together they would flash the whole frame. Reduced: no steps
      uClapStep: MO.reduced ? X.seed : Math.max(0, claps - 2) + (claps > 1 ? MO.easeOut(ct / 0.12) : 0) + X.seed,
      uSpinT: spinFrom + rate * (t - spinFrom), uDive: 0, uInvAmt: 1,   // ring rotation clock (half speed in reduced)
      uCamK: X.camK, uSeed: X.seed,
      // safety (spec 7.3): shock rings on beats 1 and 3, the pump, no blinks / inversion unless a shot
      // works out that they are allowed
      uRKT: rk ? t - rk.t : 99, uPumpE: 0.95 * X.pump * Math.exp(-kt / 0.16), uBlinkK: 0, uInv: 0, uOutK: 1,
    };
    const rb = X.rings(t);
    u.uRingA = [rb[0], rb[1], rb[2], rb[3]]; u.uRingB = [rb[4], rb[5], rb[6]];
    if (X.tmOn) u.uTime = X.tm(t);
    return u;
  };
  const post = { bloom: 0.32, bloomThreshold: 1.2, vignette: 0.5 };
  // match-cut numbers shared with the shots that cut from / to the heart iris (coda.eye,
  // zoomback.set): the iris radius in mandala units (r), its radius on screen at the end of the
  // bloom's dive (screenR, half-heights) and the black pupil's share of it. Whoever loads first
  // defines them; nobody else overrides.
  MO.MATCH = MO.MATCH || {};
  MO.MATCH.heartIris = MO.MATCH.heartIris || { r: 0.02, screenR: 1.36, pupil: 0.24 };
  // a scene of the shot: the common post settings, and the palette preset as the engine's grade
  const scene = (X, def) => MO.scene(Object.assign(X.grade ? { grade: X.grade } : {}, def, post));
  const sceneId = (name, cue) => name + (Array.isArray(MO.S.cues) ? '@' + cue.index : '');

  // ------------------------------------------------------------------ rubedo.mandala (R1)
  // Natural length 4 beats (1 bar), "Burn me in the fire". On an impact at the cue start (the drop:
  // fx impact at beat 48) the black sun of Nigredo returns as an eclipse for the impact frames; the
  // colour lands over two frames after it. Then the Mandala of the Self around the World dancer,
  // fully lit, with a pull-out from the dancer to the whole mandala (1.72 s), drop speed lines,
  // a shock ring on the kicks of beats 1 and 3, kaleidoscope steps on the claps, ring A inverting
  // on the beat-4 clap (while it covers <= 15 % of the frame), squinting eyes on the open hats (only
  // while at most 40 eyes are on screen: until the outer field comes into view). The pull-out
  // motion-blurs its linework and fades the outer field in proportion to its zoom rate, sharpening
  // as it settles (spec 7.3 rule 1). Any impact of the score inside the cue gets the eclipse frames
  // and the landing; without one there is no landing dip. Longer: the pull-out holds (it eases to rest by construction); the
  // roll, tilt, ring spin and every pulse go on. Shorter: cut early. offsetBeats skips into the
  // pull. Own params: rings / assemble (an intro where the mandala builds ring by ring), spin.
  MO.shot('rubedo.mandala', (cue) => {
    const X = cueContext(cue, 'mandala');
    scene(X, {
      id: sceneId('rubedo', cue), fs: RB_LIB + R1,
      uniforms: (t) => {
        const imp = X.impactAt(t);
        const u = Object.assign(common(t, X), {
          uImpact: imp && !MO.reduced && t - imp.t < imp.dur ? 1 : 0,
          uIT: imp ? t - imp.t : 99, uLandT: imp ? t - imp.t : 99, uPT: X.pc(t),
        });
        // the shader's pull-out (zoom: screen units per mandala unit; tilt and kick nudge left out)
        u.uPull = PULL();
        const zoomAt = (pt) => { const k = C(pt / u.uPull[1]); return MO.mix(u.uPull[0], 0.80, 1 - (1 - k) * (1 - k)) * X.zoom; };
        const zoom = zoomAt(u.uPT), ed = X.edges(0.12);
        // the outer field's log-polar rows rush inward with the pull: rows per frame -> contrast
        const dz = Math.abs(Math.log(zoomAt(u.uPT + X.speed / 60) / zoomAt(u.uPT - X.speed / 60)));
        u.uOutK = antiStrobe(dz / OW);
        u.uBlinkK = blinkK(mandalaEyes(ed, zoom, u.uRingA.concat(u.uRingB)));
        u.uInv = ringInv(t, X, ed, zoom, 1, 0);
        return u;
      },
    });
  });

  // ------------------------------------------------------------------ rubedo.wedding (R2)
  // Natural length 4 beats, "turn my lead to gold". A chrome vessel over an endless checkerboard
  // under the mandala-sun (a 1996 CD cover); the camera arcs round it over one bar; Sol and Luna
  // orbit, spiralling in; the leaden sphere turns to gold from the word "lead" to the word "gold"
  // (looked up in the score inside the cue; without them 1 and 2 beats in); half a beat before the
  // cue END they fuse into the vessel (coniunctio: starburst and shock ring), so the fusion always
  // lands on the cut. The floor (and ring A of the mandala-sun) inverts on the beat-4 clap, a ripple
  // runs out on the kicks of beats 1 and 3; no blinks (the mandala-sun shows well over 40 eyes).
  // Longer: the arc settles after one bar (speed: 'fit' spreads it); the orbits keep their angular
  // speed and the spiral stretches to the fusion. Shorter: the spiral is faster (or starts part-way
  // with offsetBeats). Own params:
  //   metal  the stone's colour at the end: 'gold' (default; 'transmute' is the same) | 'silver' |
  //          'ruby' (it passes through gold on the words, then deepens to ruby by 1.5 beats after
  //          "gold", step 14 of the bar) | 'lead' (no change)
  //   from   its colour at the start: 'lead' (default) | 'silver' | 'gold'; equal to metal: no change
  //   fuse   0..4 beats before the cue end (default 0.5) | false: no fusion, Sol and Luna keep
  //          circling on a slowly tightening orbit
  //   floor  'crimson' (default) | 'gold' | 'ivory' (black and white, the classic) | 'violet' | 'teal'
  //   orbit  -180..180 degrees: the camera arc's start angle, added (default 0)
  //   dist   0.6..1.6: camera distance multiplier (default 1); height -0.5..1.5: camera height added
  //   (zoom moves the camera in: distance / zoom; pan and roll are not used here)
  const FLOORS = {
    crimson: [[0.004, 0.0, 0.008], [0.34, 0.0, 0.03]], gold: [[0.006, 0.002, 0.0], [0.42, 0.22, 0.03]],
    ivory: [[0.002, 0.002, 0.004], [0.55, 0.50, 0.44]], violet: [[0.004, 0.0, 0.012], [0.16, 0.03, 0.40]],
    teal: [[0.0, 0.004, 0.006], [0.02, 0.26, 0.26]],
  };
  const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  // the stone's colours (tint of the chrome), the glow of the front that turns it, and how
  // un-leaden a stone of that colour is (1 - tarnish)
  const METALS = { lead: [0.42, 0.45, 0.52], silver: [0.86, 0.90, 1.0], gold: [1.25, 0.80, 0.34], ruby: [1.20, 0.10, 0.16] };
  const METAL_F = { lead: [3.0, 1.6, 0.5], silver: [2.2, 2.5, 3.0], gold: [3.0, 1.6, 0.5], ruby: [3.0, 0.5, 0.4] };
  const METAL_K = { lead: 0, silver: 1, gold: 1, ruby: 1 };
  MO.shot('rubedo.wedding', (cue) => {
    const X = cueContext(cue, 'wedding');
    const P = X.P, B = MO.BAR;
    const orbit0 = C(num(P.orbit, 0), -180, 180) * Math.PI / 180, distK = C(num(P.dist, 1), 0.6, 1.6) / X.zoom, hK = C(num(P.height, 0), -0.5, 1.5);
    // the camera arc over one bar of progress x (s, speed-scaled); it eases to rest at its end
    const camAt = (x) => {
      const k = C(x / B);
      const phi = -0.32 + 0.50 * MO.easeInOut(k) + orbit0;
      const dist = (4.9 - 0.6 * MO.easeInOut(k)) * distK;
      return [dist * Math.sin(phi), 0.78 + 0.12 * Math.sin(k * 3.0) + hK, -dist * Math.cos(phi)];
    };
    // past the arc's end (a cue longer than a bar) the camera keeps its last velocity and eases to rest
    const camArc = (x) => {
      if (x <= B) return camAt(x);
      const h = 0.02, tau = 0.25 * B, a = camAt(B), b = camAt(B - h), e = tau * (1 - Math.exp(-(x - B) / tau)) / h;
      return a.map((v, i) => v + (v - b[i]) * e);
    };
    const c0 = camAt(0);
    const CD = norm([0 - c0[0], 1.6 + 0.35 - c0[1], 0 - c0[2]]);
    // the transmutation: from "lead" to "gold" in the score, else 1 and 2 beats in
    const golds = wordsIn(/^gold/i, X.from, X.to);
    const tGoldB = golds.length ? golds[0] : X.ts + bt(2);
    const leads = wordsIn(/^lead/i, X.from, tGoldB);
    const tGoldA = leads.length ? leads[leads.length - 1] : tGoldB - BEAT;
    // the stone: from -> to on the words (a front sweeping down it), ruby: then gold -> ruby
    const end = P.metal === 'transmute' || !METALS[P.metal] ? 'gold' : P.metal, start = METALS[P.from] ? P.from : 'lead';
    const turns = end !== start;
    const mid = end === 'ruby' ? 'gold' : end;
    const tRuby = tGoldB + bt(1.5);
    const metal = (t) => {
      if (!turns) return { a: METALS[start], b: METALS[start], g: 0, k: [METAL_K[start], METAL_K[start]] };
      const g1 = MO.smooth(MO.remap(t, tGoldA, tGoldB));
      if (end === 'ruby' && t >= tGoldB) {
        const g2 = MO.smooth(MO.remap(t, tGoldB, tRuby));
        return { a: METALS.gold, b: METALS.ruby, g: g2, k: [1, 1], f: METAL_F.ruby };
      }
      // tarnish fades as a leaden stone turns; the warm glow follows the gold (the 30 s piece:
      // lead -> gold, uMetK = (uGold, uGold))
      const lead = start === 'lead' ? g1 : 1, warm = mid === 'gold' ? (start === 'gold' ? 1 : g1) : 0.5 * g1;
      return { a: METALS[start], b: METALS[mid], g: start === mid ? 0 : g1, k: [lead, warm], f: METAL_F[mid] };
    };
    // the fusion, anchored to the cue end
    const fuse = P.fuse !== false;
    const tFuse = fuse ? X.to - bt(C(num(P.fuse, 0.5), 0, 4)) : X.to;
    const NF = bt(55.5) - bt(52);   // the orbit's natural span (s) to the fusion
    const xFuse = X.pc(tFuse);
    const floor = FLOORS[P.floor] || FLOORS.crimson;
    scene(X, {
      id: sceneId('rubedo-wedding', cue), fs: RB_LIB + R2,
      uniforms: (t) => {
        const x = X.pc(t);
        const k = C((t - X.ts) / (tFuse - X.ts));
        // radius spirals in to the fusion; the angle keeps the natural angular speed (speed-scaled)
        const rad = fuse ? 2.15 * (1 - MO.easeIn(k)) : 2.15 * (1 - 0.35 * MO.smooth(k));
        // (the orbit stops where they fuse)
        const ang = 0.9 + 2.2 * ((fuse ? Math.min(x, xFuse) : x) / NF) + (fuse ? 2.6 * k * k * k : 0) + X.seed * 1.7;
        const tilt = 0.38;
        const orb = (a) => {
          const ox = Math.cos(a) * rad, oz = Math.sin(a) * rad;
          return [ox, 1.6 + oz * Math.sin(tilt) * 0.6 + 0.15 * Math.sin(a * 2), oz * Math.cos(tilt)];
        };
        const ro = camArc(x);
        return Object.assign(common(t, X), {
          uRo: ro, uTa: [0, 1.32, 0], uCD: norm(CD.map((v, i) => MO.mix(v, norm([0 - ro[0], 1.95 - ro[1], 0 - ro[2]])[i], 0.75))),
          uSol: orb(ang), uLuna: orb(ang + Math.PI),
          ...((m) => ({ uGold: m.g, uMetA: m.a, uMetB: m.b, uMetK: m.k, uMetF: m.f || METAL_F.gold }))(metal(t)),
          // the fusion ramps in over 5 frames instead of jumping to 0.9: with an impact on the cut and
          // the next shot 0.22 s later it would otherwise be the first of three hard flashes in 0.66 s
          uFuse: fuse ? MO.smooth((t - tFuse) / 0.16) : 0,
          // (the 30 s cut used 1.5441 s; its 18 us bias is kept so that edit renders bit-identically)
          uFuseAt: tFuse - X.from - (bt(55.5) - bt(52) - 1.5441),
          uOrbit: k, uChkA: floor[0], uChkB: floor[1],
          // the beat-4 clap inverts the floor (once a bar; off in reduced mode) and ring A of the
          // mandala-sun (about 7 % of the frame: it sits far off in the sky)
          ...((c) => { const ct = c ? t - c.t : 99; return {
            uFloorInv: MO.reduced ? 0 : MO.smooth(ct / 0.02) * Math.exp(-ct / 0.25),
            uInv: MO.reduced || t - X.drop < 1 ? 0 : Math.exp(-ct / 0.13) }; })(lastIn(beatEvents().claps4, t)),
        });
      },
    });
  });

  // ------------------------------------------------------------------ rubedo.tunnel (R3)
  // Natural length 4 beats, "Magnum Opus". Fly-through a tunnel of rings of figures and eyes, a
  // small lift on every kick, a hoop of light flying past on the kicks of beats 1 and 3, up to six
  // lasers swaying from the vanishing point (stepping forward on each beat), speed lines, sparkles
  // on the hats. Under an impact of the score inside the cue (beat 56 in the 30 s piece, on the cut)
  // the frame holds still and draws the two-tone impact card, lands over three frames, and the
  // travel starts again from rest (full speed after 0.6 s, no lifts meanwhile).
  // Safety (spec 7.3): the walls' rows and ring frames fade toward their average colour as the
  // travel rate rises (about 60 % contrast at speed 1); no eye blinks (far more than 40 eyes);
  // reduced: travel x0.7 without lifts, lasers standing still on screen, hoops at 20 %.
  // Any length: the travel, roll and lasers go on (kept under ~2 rings/s: faster, the figure and
  // eye rings swap places from frame to frame and the tunnel strobes, so speed is capped at 1.5).
  // Own params:
  //   lasers  'mixed' (default: blue, magenta, red, gold) | 'gold' | 'red' | 'blue' | 'white' | 'off' |
  //           'rainbow' (the seven chakra colours: four at a time on the beams, the set stepping
  //           one chakra on each kick)
  //   beams   1..6 (default 6): how many lasers, evenly spread (spec 7.3 rule 2: at most 4 in
  //           choruses 1-2, 6 in the final chorus)
  //   laser   0..1 (default 1, the 30 s brightness): laser brightness (rule 2: 0.6 in choruses 1-2,
  //           0.8 in the final chorus)
  //   walls   'mixed' (default: figure and eye rings alternate) | 'figures' | 'eyes'
  //   (zoom: field of view; pan: vanishing point offset; roll: added to the tunnel roll)
  // [beam 0, beam 3, beams 2 and 4, beams 1 and 5] (the 30 s set: blue, gold, red, magenta). Four
  // slots in the 30 s select chain: per-beam colours cost ~7 % of the tunnel's frame in SwiftShader
  const two = (a, b) => [a, b, a, b];
  const LASERS = {
    mixed: [[0.6, 0.7, 2.6], [2.6, 1.8, 0.5], [2.8, 0.15, 0.10], [2.4, 0.10, 1.2]],
    gold: two([2.6, 1.8, 0.5], [2.8, 1.2, 0.25]), red: two([2.8, 0.15, 0.10], [2.6, 0.05, 0.35]),
    blue: two([0.6, 0.7, 2.6], [0.3, 1.2, 2.4]), white: two([2.2, 2.0, 1.8], [2.2, 2.0, 1.8]), off: two([0, 0, 0], [0, 0, 0]),
  };
  // the chakra colours as laser light (the energy in the dominant channel, like citrinitas' CIT_HOT),
  // all at one luminance (Rec. 709 Y = 1.1): stepping the colours on the kicks changes the hue of a
  // beam, never its brightness (no on/off strobing, spec 7.3 rule 2)
  const RAINBOW = [[2.8, 0.05, 0.08], [2.8, 0.7, 0.03], [2.6, 2.0, 0.1], [0.2, 2.6, 0.4], [0.15, 1.1, 2.8], [0.8, 0.3, 2.8], [2.2, 0.6, 2.8]]
    .map((c) => { const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map((v) => v * 1.1 / y); });

  MO.shot('rubedo.tunnel', (cue) => {
    const X = cueContext(cue, 'tunnel');
    const P = X.P;
    const rainbow = P.lasers === 'rainbow';
    // laser brightness knob (spec 7.3 rule 2: 0.6 in choruses 1-2, 0.8 in the final chorus), folded
    // into the colours
    const laser = C(num(P.laser, 1), 0, 1);
    const set = (LASERS[P.lasers] || LASERS.mixed).map((c) => c.map((v) => v * laser));
    const nb = Math.round(C(num(P.beams, 6), 1, 6));
    const lasS = nb === 6 ? 1.047 : 1.047 * 6 / nb;
    const lasers = (t) => {
      if (!rainbow) return set;
      const k = MO.count('kick', t);
      return [0, 1, 2, 3].map((i) => RAINBOW[(2 * i + k) % 7].map((v) => v * laser));
    };
    const walls = P.walls === 'figures' ? [0, 0.5] : P.walls === 'eyes' ? [0, -1] : [1, 0.5];
    const kicks = MO.events.kick.filter((e) => e.t >= X.from - 1e-6 && e.t < X.to);
    // forward travel (rings) with a lift on every kick; reduced: a steady glide at 0.7x, no lifts
    // (rule 1: lifts of 0.12 rings, at 0.2 the walls passed ~1.9 rings a second at the peak of each)
    // After an impact (the frame holds still under it) the travel starts again from rest, reaching
    // full speed over LAUNCH s with no lift on the kicks meanwhile: the impact's own transitions and a
    // full-speed rush in the same second were more than 3 flashes for half the frame.
    const LAUNCH = 0.6;
    const imp0 = X.impacts.length ? X.impacts[0].t + X.impacts[0].dur : null;
    const ramp = (x) => (x >= 1 ? x - 0.5 : x <= 0 ? 0 : x * x * x - x * x * x * x / 2);   // integral of smoothstep
    const travelAt = (t) => {
      let tr = (MO.reduced ? 0.7 : 1.0) * X.pc(t);
      if (imp0 != null && !MO.reduced) tr -= X.speed * (Math.max(0, t - imp0) - LAUNCH * ramp((t - imp0) / LAUNCH));
      if (!MO.reduced) for (const e of kicks) { if (e.t > t + 1e-6) break; if (imp0 == null || e.t > imp0 + LAUNCH) tr += 0.12 * MO.smooth((t - e.t) / 0.44); }
      return tr;
    };
    // rule 1: rings passing a pixel per frame (30 fps) at the cue's cruising rate (travel plus the
    // lifts), so the walls' contrast holds steady through a launch and never pulses with the lifts;
    // the ring frames are two features a ring, the rows of figures and eyes three
    const vNom = (X.speed * (MO.reduced ? 0.7 : 1) + (MO.reduced ? 0 : 0.12 / MO.BEAT)) / 30;
    const wallK = [antiStrobe(2 * vNom), antiStrobe(3 * vNom)];
    scene(X, {
      id: sceneId('rubedo-tunnel', cue), fs: RB_LIB + R3,
      uniforms: (t0) => {
        // under an impact the frame holds still (the post keys it to a two-tone card), so the two
        // impact frames read as one hit, not two
        const imp = X.impactAt(t0);
        const held = !!(imp && !MO.reduced && t0 - imp.t < imp.dur);
        const t = held ? imp.t + 0.001 : t0;
        const travel = travelAt(t);
        const x = X.pc(t);
        const roll = 0.30 * x + 0.12 * Math.sin(x * 2.1) + X.roll + X.seed * 0.9;
        // the laser fan's sway phase: a two-bar cycle that steps forward on every beat (ease-out,
        // never back); reduced: the beams stand still on screen (the fan turns against the roll)
        const b = t / MO.BEAT, nB = Math.floor(b), fB = b - nB;
        const kt = MO.last('kick', t);
        const lasM = MO.reduced ? [0.3 + roll, 0, 0.4, 0.85]
          : [0.3, Math.PI / 4 * (nB + 1 - (1 - fB) * (1 - fB)), 0.4, 0.85 + 0.15 * (kt ? Math.exp(-(t - kt.e.t) / 0.25) : 0)];
        const u = Object.assign(common(t, X), {
          uTime: X.tm(t), uBeat: b,
          // no hoop until the travel is back to full speed after an impact
          ...(imp0 != null && !MO.reduced && t < imp0 + LAUNCH ? { uRKT: 99 } : {}),
          uImpact: held ? 1.1 - 0.6 * (t0 - imp.t) / imp.dur : 0,   // > 0: impact frame, line width
          uLand: imp && !MO.reduced ? C(1 - (t0 - imp.t - imp.dur) / 0.08) : 0,
          uTravel: travel + X.seed * 0.37, uTunRoll: roll,
          ...((l) => ({ uLasA: l[0], uLasB: l[1], uLasC: l[2], uLasD: l[3] }))(lasers(t)),
          uLasN: [lasS, nb], uLasM: lasM, uWalls: walls,
          uWallK: wallK,
        });
        u.uCamK = [1 / X.zoom, 0, X.pan[0], X.pan[1]];   // the tunnel takes 1 / zoom; roll goes into uTunRoll
        return u;
      },
    });
  });

  // ------------------------------------------------------------------ rubedo.bloom (R4)
  // Natural length 4 beats, "I am whole!". The mandala in full gold bloom, frontal and larger than
  // R1, twelve great magenta petals open behind the corona; a gold front runs out from the heart at
  // the start (the transmutation); the disc precesses gently like a spinning coin. One camera move:
  // a slow push that accelerates on "whole" into a constant-rate dive into the heart, ending on the
  // heart iris at the size the coda opens with (iris radius 1.36 screen units, black pupil 0.24 of
  // it): the cut into coda.eye is a match cut. Safety (spec 7.3): the push and the dive motion-blur
  // the linework in proportion to the zoom rate (capped at 4 px; never the heart iris, so the last
  // frame is unchanged) and fade the outer field; outside the heart the dive dissolves into the
  // radial glow; the god rays are steady and the kick nudges the zoom 1.5 % (no frame-wide pump);
  // ring A inverts at half strength on the beat-4 clap; blinks only with at most 40 eyes on screen.
  // The dive is anchored to the cue END: it starts on the word "whole" if the score sings it in the
  // cue's last 1..4 beats, else 2 beats before the end, and always ends on the iris at the cut.
  // Longer: the slow push gets the extra time, at the natural rate up to a 1.8x zoom gain, slower
  // beyond; the precession and spin go on. Shorter than 2 beats: the dive starts part-way, zoomed
  // in. The roll is anchored to the end too (the last frame is the same at any length).
  // Own params:
  //   dive    'heart' (default) | 'none': no dive, the slow push settles (for a cue not followed by
  //           the coda)
  //   aurum   'front' (default: the gold front at the start) | 'gold' (already gold) | 'crimson' (none)
  //   rings, assemble, spin (as the mandala); zoom/pan/roll fade out during the dive so the last
  //   frame still matches the coda
  MO.shot('rubedo.bloom', (cue) => {
    const X = cueContext(cue, 'bloom');
    const P = X.P;
    const ts = X.ts, te = X.to;
    const Z0 = 1.0, V0 = 0.18;                       // start zoom; slow push in log-zoom per second
    const IRIS = MO.MATCH.heartIris;
    const Z_END = IRIS.screenR / IRIS.r;             // heart iris (radius 0.02) at 1.36 screen units
    const diveOn = P.dive !== 'none' && P.dive !== false;
    const whole = wordsIn(/^whole/i, te - bt(4), te - bt(1));
    const tWhole = whole.length ? whole[whole.length - 1] : te - bt(2);
    const tDive = tWhole + 0.5 * BEAT;
    const RD = tDive - tWhole;
    const ramp = (x) => { x = C(x); return x * x * x - x * x * x * x / 2; };   // integral of smoothstep
    // the slow push before "whole": natural rate, but at most 0.6 in log-zoom however long the cue
    const Vp = Math.min(V0 * X.speed, 0.6 / Math.max(1e-3, (diveOn ? tWhole : te) - ts));
    const VD = Vp + (Math.log(Z_END / Z0) - Vp * (te - ts)) / (0.5 * RD + (te - tDive));  // ~5.2/s = 1.19x per frame
    const logZ = diveOn
      ? (t) => Math.log(Z0) + Vp * (t - ts) + (VD - Vp) * (t < tDive ? RD * ramp((t - tWhole) / RD) : 0.5 * RD + (t - tDive))
      : (t) => Math.log(Z0) + 0.6 * (1 - Math.exp(-V0 * X.speed * (t - ts) / 0.6));   // settles at a 1.8x zoom gain
    const LW = logZ(tWhole), LE = logZ(te);
    const lzK = Math.log(X.zoom);
    const aurum = P.aurum === 'gold' ? () => 9 : P.aurum === 'crimson' ? () => -1 : (t) => 0.15 + 5.0 * (t - ts);
    const NL = bt(64) - bt(60);
    scene(X, {
      id: sceneId('rubedo-bloom', cue), fs: RB_LIB + R4,
      uniforms: (t) => {
        const k = C((t - ts) / ((diveOn ? tWhole : te) - ts));
        const dive = diveOn ? C((logZ(t) - LW) / (LE - LW)) : 0;   // dive progress in log-zoom: keys the fades to what is on screen
        const amp = 0.22 * (1 - 0.4 * MO.smooth(k)) * (1 - MO.smooth(dive / 0.4)), ph = 2.1 + 4.0 * X.speed * (t - ts) + X.seed * 1.3;
        const lz = lzK !== 0 ? logZ(t) + lzK * (1 - dive) : logZ(t);
        const u = Object.assign(common(t, X, 2, ts), {   // the rings spin twice as fast here
          uZoom: Math.exp(lz),
          // the roll is anchored to the end: the last frame is the same at any cue length
          uSpin: 0.28 * (NL - X.speed * (te - t)) + X.roll * (1 - dive),
          uTiltA: 1 - dive,
          // the disc precesses gently like a spinning coin (nearly frontal), flattening for the dive
          uTilt: [amp * Math.cos(ph), 0.8 * amp * Math.sin(ph)],
          uDive: dive, uBloomOpen: 1,
          uLand: C(1 - (t - X.from) / 0.07), uInvAmt: 0.5,
          uAurum: aurum(t),
        });
        // safety (spec 7.3): the camera as the shader has it (zoom: screen units per mandala unit)
        const zoom = u.uZoom, cy = 0.10 * (1 - dive), ed = edgeDist(X.pan[0] * (1 - dive), cy + X.pan[1] * (1 - dive));
        const lzAt = (tt) => (lzK !== 0 ? logZ(tt) + lzK * (1 - dive) : logZ(tt));
        const v = Math.abs(lzAt(t + 1 / 60) - lzAt(t - 1 / 60));   // log-zoom per frame (30 fps)
        u.uBlinkK = blinkK(mandalaEyes(ed, zoom, u.uRingA.concat(u.uRingB)));
        u.uInv = ringInv(t, X, ed, zoom, 0.5, dive);
        u.uOutK = antiStrobe(v / OW);
        return u;
      },
    });
  });

  // without a cue list: the 30 s edit (and the regression test of this refactor)
  if (!Array.isArray(MO.S.cues)) for (const name in NAT) MO.runShot(MO.makeCue('rubedo.' + name, NAT[name][0], NAT[name][1]));
})();
