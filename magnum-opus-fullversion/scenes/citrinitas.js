// CITRINITAS — XIX The Sun. Owner: citrinitas agent. Shot factories (see the cue contract):
//   citrinitas.c1 .. c5, placed by score.js "cues"; without a cue list this file places them at
//   their 30 s windows (beats 32–48, bars 8–11), exactly as the 30 s piece had them.
// The build-up: the luminous body of ALBEDO climbs the Holy Mountain and turns to gold as its
// seven chakras ignite, one every two beats by default, each a sakuga event.
//
// C1  4 beats  THE HOLY MOUNTAIN: frontal stepped golden ziggurat (vermilion / ultramarine
//              friezes), the athanor tower and the eye in the triangle on the summit, the Tarot
//              XIX sun rising behind it. The figure climbs the central stair on the kicks.
//              Root and sacral ignite; each lights its terrace of the mountain.
// C2  4 beats  HENSHIN: closer on the torso, camera rolling; sunburst from the heart, speed
//              lines, light ribbons spiralling up the body. Solar plexus, heart (the cut-in).
// C3a 2 beats  MANGA PANELS: diagonal cut-ins with thick black gutters (the eye with the sun
//              in it, the throat, the mountain). Throat. Speed lines tick with the snare roll.
// C3b 2 beats  the eye strip: the third eye opens, everything accelerates into the crown.
// C4  2 beats  SAHASRARA: arms raised, the seven chakras blaze in a rainbow column, the
//              thousand-petalled lotus opens above the head, the sun goes white-gold,
//              extreme push-in into the lotus, whose light floods the frame in magenta and
//              violet up to the hard cut.
// C5  2 beats  white-gold under the overlay's full-screen RUBEDO insert (the gap).
// Natural lengths, stretch behaviour and params of each factory: see "shots (JS)" below.
//
// Photosensitivity (spec 7.3, 7.5), built into every cue and measured with the flash analyser:
//   rule 1  the speed lines (C2, C3a, C3b, C4) re-roll once a beat and their brightness follows the
//           snare roll's density in the bar, not its hits (per 16th, pulsed on every hit, the dense
//           fans of the build flickered at 4.5-9 Hz); the ignition's burst lines re-roll per 8th; the
//           henshin ribbons (C2) turn at 4 rad/s with a dimmer far side (at 7 they crossed each pixel
//           of the body six times a second)
//   rule 6  the root's red wash ramps up over 0.3 s (72.1 in the build: it floods the frame)
//   rule 7  the build's cuts (72-79) are measured against the orrery's amber void (report numbers)
//   reduced (7.5): burst lines and speed lines frozen (as the 30 s piece), ignitions dimmed, every
//           ignition's colour wash kept within 0.65 of its chakra (under 25 % of the frame)
//
// The luminous body is copied from scenes/albedo.js (prefix alb → cit) so the figure is the
// same being; here the gold rises through it from the feet with the kundalini (ida, pingala
// and sushumna light up to the highest lit chakra; a molten front separates gold from silver).
// SwiftShader cost ~ pixels x code size, so every shot is its own shader with #defines and the
// body is evaluated exactly once per pixel. The variation knobs are uniforms: every cue of a shot
// shares that shot's one program.
(() => {
  const BODY = `
// ===================================================================== THE LUMINOUS BODY
// (from albedo.js, Sacred Mirrors) + the rising gold. Body space: feet y = -1, crown y = +1.
uniform float uChakS;     // chakra mandala size (lit)
uniform float uAuraOcc;   // how much the aura darkens what is behind it (figure-ground)
uniform vec3  uGTint, uGTint2, uGNerve;   // the colour the body turns as the gold rises (palette knob)
struct CitBody {
  vec2  pos;        // scene position of the body origin (body y = 0, the pelvis)
  float scale;      // scene units per body unit
  float arms;       // 0 = hanging, 1 = raised V
  float aura;       // flame aura strength
  float lines;      // contours + skeleton strength
  float nerves;     // nervous system brightness
  float pulse;      // nerve impulse front (< 0: none)
  float eye3;       // CIT_EYE3: third eye open 0..1
  float t;          // time
  float kh;         // the gold front (body y): below it the body is gold (-1.2 = none)
  float gold;       // 0..1 everything gold regardless of the front
  float frontI;     // brightness of the molten front (full while it rises, dimmer at rest)
  vec3  tint, tint2, nerveCol;      // silver (albedo) colours
  vec3  gTint, gTint2, gNerve;      // gold colours
};

CitBody citBodyDefault() {
  CitBody B;
  B.pos = vec2(0.0); B.scale = 0.86; B.arms = 0.0;
  B.aura = 1.0; B.lines = 1.0; B.nerves = 1.0; B.pulse = -1.0;
  B.eye3 = 0.0; B.t = 0.0; B.kh = -1.2; B.gold = 0.0; B.frontI = 1.0;
  B.tint = vec3(0.80, 0.93, 1.0); B.tint2 = vec3(0.50, 0.42, 1.0); B.nerveCol = vec3(0.22, 0.55, 1.7);
  B.gTint = uGTint; B.gTint2 = uGTint2; B.gNerve = uGNerve;   // gold: (1, .76, .34) (1, .34, .05) (1.7, 1, .32)
  return B;
}

struct CitJoints { vec2 sh, el, wr, hd, hip, kn, an, toe; };
CitJoints citJoints(float arms) {
  CitJoints j;
  j.sh  = vec2(0.205, 0.575);
  j.el  = mix(vec2(0.285, 0.29), vec2(0.40, 0.80), arms);
  j.wr  = mix(vec2(0.33, 0.02), vec2(0.52, 1.04), arms);
  j.hd  = mix(vec2(0.35, -0.08), vec2(0.56, 1.13), arms);
  j.hip = vec2(0.095, 0.0);
  j.kn  = vec2(0.105, -0.47);
  j.an  = vec2(0.105, -0.90);
  j.toe = j.an + vec2(0.045, -0.085);
  return j;
}

float citBodySDF(vec2 p, CitJoints j) {
  vec2 q = vec2(abs(p.x), p.y);
  float head   = sdEllipse(p - vec2(0.0, 0.84), vec2(0.105, 0.135));
  float neck   = sdCapsule(q, vec2(0.0, 0.66), vec2(0.0, 0.74), 0.046);
  float chest  = sdEllipse(p - vec2(0.0, 0.47), vec2(0.20, 0.17));
  float waist  = sdEllipse(p - vec2(0.0, 0.22), vec2(0.145, 0.16));
  float pelvis = sdEllipse(p - vec2(0.0, 0.03), vec2(0.17, 0.11));
  float trap   = sdTaper(q, vec2(0.0, 0.665), j.sh + vec2(-0.005, 0.01), 0.06, 0.055);
  float torso  = smin(smin(chest, waist, 0.12), pelvis, 0.10);
  torso = smin(torso, trap, 0.06);
  float upper = sdTaper(q, j.sh, j.el, 0.058, 0.043);
  float fore  = sdTaper(q, j.el, j.wr, 0.043, 0.032);
  float hand  = sdTaper(q, j.wr, j.hd, 0.035, 0.022);
  float arm   = smin(smin(upper, fore, 0.03), hand, 0.02);
  float thigh = sdTaper(q, j.hip, j.kn, 0.085, 0.055);
  float shin  = sdTaper(q, j.kn, j.an, 0.055, 0.034);
  float foot  = sdTaper(q, j.an + vec2(0.0, -0.02), j.toe, 0.032, 0.022);
  float leg   = smin(smin(thigh, shin, 0.03), foot, 0.02);
  float d = smin(torso, neck, 0.04);
  d = smin(d, head, 0.03);
  d = smin(d, arm, 0.04);
  d = smin(d, leg, 0.05);
  return d;
}

// iso-lines of a field (fade out when denser than ~3 px so they never shimmer)
float citIso(float v, float pv, float widthPx) {
  float dd = abs(fract(v + 0.5) - 0.5) / max(pv, 1e-6);
  return (1.0 - smoothstep(0.5 * widthPx - 0.5, 0.5 * widthPx + 0.8, dd)) * smoothstep(2.5, 5.0, 1.0 / max(pv, 1e-6));
}
float citLine(float d, float aa, float widthPx) { return 1.0 - smoothstep(0.5 * widthPx * aa - 0.5 * aa, 0.5 * widthPx * aa + 0.8 * aa, abs(d)); }
float citAtan(float y, float x) {
  float ax = abs(x), ay = abs(y);
  float a = min(ax, ay) / max(max(ax, ay), 1e-9);
  float s = a * a;
  float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  r = ay > ax ? 1.57079637 - r : r;
  r = x < 0.0 ? 3.14159274 - r : r;
  return y < 0.0 ? -r : r;
}
float citNoise3(vec2 p) { return (0.6 * vnoise(p) + 0.4 * vnoise(p * 2.37 + 7.1)); }

float citBones(vec2 q, CitJoints j) {
  vec2 a = vec2(abs(q.x), q.y);
  float d = 1e5;
  vec2 sk = q - vec2(0.0, 0.868);
  d = min(d, sk.y > -0.07 ? abs(sdEllipse(sk, vec2(0.083, 0.10))) : 1e5);
  vec2 jw = q - vec2(0.0, 0.80);
  d = min(d, jw.y < 0.0 ? abs(sdEllipse(jw, vec2(0.066, 0.062))) : 1e5);
  d = min(d, abs(sdEllipse(a - vec2(0.035, 0.838), vec2(0.024, 0.017))));
  const float cell = 0.0275;
  float id = clamp(floor((q.y - 0.06) / cell), 0.0, 24.0);
  d = min(d, abs(sdBox(vec2(a.x, q.y - 0.06 - (id + 0.5) * cell), vec2(mix(0.021, 0.010, id / 24.0), cell * 0.30)) - 0.003));
  float rv = (q.y + 2.2 * a.x * a.x - 0.33) / 0.031;
  vec2 ce = (q - vec2(0.0, 0.47)) / vec2(0.19, 0.165);
  float cage = step(0.016, a.x) * step(dot(ce, ce), 1.0) * step(0.0, rv) * step(rv, 9.6);
  d = min(d, cage > 0.5 ? abs(fract(rv + 0.5) - 0.5) * 0.031 / sqrt(1.0 + 19.36 * a.x * a.x) : 1e5);
  d = min(d, abs(sdCapsule(a, vec2(0.0, 0.57), vec2(0.0, 0.43), 0.011)));
  d = min(d, abs(sdCapsule(a, vec2(0.025, 0.628), j.sh + vec2(-0.02, 0.025), 0.007)));
  d = min(d, abs(sdCapsule(a, j.sh + vec2(-0.012, -0.012), j.el, 0.011)));
  d = min(d, abs(length(a - j.sh - vec2(-0.012, -0.012)) - 0.02));
  d = min(d, abs(sdCapsule(a, j.el, j.wr, 0.011)));
  d = min(d, sdSegment(a, j.wr, j.hd + (j.hd - j.wr) * 0.15));
  vec2 il = a - vec2(0.085, 0.075);
  d = min(d, il.y > -0.03 ? abs(sdEllipse(il, vec2(0.08, 0.06))) : 1e5);
  vec2 pb = q - vec2(0.0, -0.005);
  d = min(d, pb.y < 0.0 ? abs(sdEllipse(pb, vec2(0.062, 0.042))) : 1e5);
  d = min(d, abs(sdCapsule(a, j.hip + vec2(-0.012, -0.015), j.kn, 0.0135)));
  d = min(d, abs(length(a - j.hip - vec2(-0.02, -0.005)) - 0.019));
  d = min(d, abs(length(a - j.kn - vec2(0.0, 0.005)) - 0.016));
  d = min(d, abs(sdCapsule(a, j.kn + vec2(0.0, -0.03), j.an + vec2(0.0, 0.012), 0.011)));
  d = min(d, sdSegment(a, j.an, j.toe));
  return d;
}

float citNerve(vec2 q, vec2 a, vec2 b, float seed, float aa, float s0, float front, inout float imp) {
  vec2 ba = b - a; float L = length(ba); vec2 dir = ba / L, nor = vec2(-dir.y, dir.x);
  vec2 rel = q - a; float u = dot(rel, dir), v = dot(rel, nor);
  v -= 0.005 * sin(u * 37.0 + seed * 7.0);
  float uc = clamp(u, 0.0, L);
  float m = citLine(length(vec2(u - uc, v)), aa, 1.4);
  const float P = 0.04;
  float id = floor(u / P);
  float h1 = hash11(id * 7.13 + seed), h2 = hash11(id * 3.7 + seed * 1.3);
  float uk = (id + 0.08 + 0.25 * h1) * P;
  float side = h2 > 0.5 ? 1.0 : -1.0;
  float k = 0.9 + 0.8 * fract(h2 * 7.0);
  float len = P * (0.55 + 0.4 * h1);
  vec2 b0 = vec2(uk, 0.0), b1 = b0 + len * normalize(vec2(1.0, side * k));
  vec2 mm = mix(b0, b1, 0.5);
  float br = min(sdSegment(vec2(u, v), b0, b1), sdSegment(vec2(u, v), mm, mm + len * 0.55 * normalize(vec2(0.25, side))));
  float bm = citLine(br, aa, 1.0) * 0.55 * step(0.015, uk) * step(uk, L);
  float ds = (s0 + uc - front) * 16.0;
  imp = max(imp, exp(-ds * ds) * max(m, bm * 1.5) * step(0.0, front));
  return max(m, bm);
}

// petal count of each chakra's lotus (crown: many)
float citPetalN(int i) { return i == 0 ? 4.0 : i == 1 ? 6.0 : i == 2 ? 10.0 : i == 3 ? 12.0 : i == 4 ? 16.0 : i == 5 ? 2.0 : 32.0; }

// a ring of np almond (vesica) petals centred on radius rc, half length h: x = signed distance
// to the nearest petal, y = its half width (for nested contours)
vec2 citPetalRing(float r, float a, float np, float rc, float h, float wfac, float off) {
  float cell = TAU / np;
  float x = (fract(a / cell + off) - 0.5) * cell * r;
  float w = min(rc * cell * 0.5 * wfac, h * 0.62);
  return vec2(sdVesica(vec2(x, r - rc), w, h), w);
}

// HDR emission in a chakra's hue. ACES + gamma pull bright near-equal RGB to white and lift the
// secondary channel (orange turns yellow, blue turns cyan-white), so the colour is raised to a
// power first: the energy sits in the dominant channel and the hue survives the tone map.
// = pow(chakraColor(i), 2.6) for i = 0..6, precomputed (it is evaluated per pixel).
const vec3 CIT_HOT[7] = vec3[7](vec3(0.8751, 0.0007, 0.0014), vec3(1.0, 0.0808, 0.0), vec3(1.0, 0.5969, 0.0004),
  vec3(0.0025, 0.7604, 0.0272), vec3(0.0004, 0.1649, 1.0), vec3(0.0437, 0.0040, 1.0), vec3(0.6554, 0.0652, 1.0));
vec3 citHot(float i) { return CIT_HOT[int(clamp(i, 0.0, 6.0) + 0.5)]; }

// a chakra mandala: unlit (silver, small) .. lit (its colour, larger, pointed lotus petals with
// nested contours, turning)
vec3 citChakra(vec2 q, int i, float lit, float aa, float t) {
  vec2 c = chakraPos(i);
  float L = sat(lit);
  float r = (i == 6 ? 0.034 : (i == 5 ? 0.02 : 0.025)) * (1.0 + (uChakS - 1.0) * L);
  vec2 d = q - c; float l = length(d);
  float a = citAtan(d.x, d.y);
  float np = citPetalN(i);
  float pr = r * (1.05 + 0.5 * sqrt(abs(cos(a * np * 0.5))));
  float m = max(citLine(l - r, aa, 1.2), citLine(l - pr, aa, 1.0) * step(r, l));
  m = max(m, citLine(l - r * 0.66, aa, 0.9));
  float ns = i == 0 ? 4.0 : i == 2 ? 3.0 : i == 3 ? 6.0 : i == 4 ? 3.0 : i == 6 ? 8.0 : 48.0;
  float ra = a + (i == 2 || i == 4 ? PI : (i == 0 ? PI / 4.0 : 0.0));
  float s = TAU / ns;
  m = max(m, citLine(cos(floor(0.5 + ra / s) * s - ra) * l - r * 0.42, aa, 0.9));
  m = max(m, fill(l - r * 0.1, aa));
  // lit: an outer ring of pointed lotus petals (three nested outlines each), turning
  float sp = (mod(float(i), 2.0) * 2.0 - 1.0) * t * 0.5;
  vec2 pd = citPetalRing(l, a + sp, np, r * 1.72, r * 0.62, 0.92, 0.0);
  float pet = citLine(pd.x, aa, 1.3) + citIso(pd.x / (pd.y * 0.34), aa / (pd.y * 0.34), 0.9) * step(pd.x, 0.0) * 0.6;
  vec3 cc = chakraColor(float(i)), hc = citHot(float(i));
  vec3 unlit = mix(vec3(0.55, 0.62, 0.85), cc, 0.22) * 0.75;
  vec3 res = m * step(l, r * 2.0) * mix(unlit, hc * 2.8 + 0.25, L);
  res += pet * L * (hc * 2.2 + 0.12) + hc * 0.4 * L * fill(pd.x, aa) * sat(-pd.x / pd.y);
  return res + min(lit, 1.6) * hc * 1.4 * exp(-l / r * 2.2);
}

vec4 citBody(vec2 w, CitBody B, float pxw, float ck[7]) {
  vec2 q = (w - B.pos) / B.scale;
  float aa = pxw / B.scale;
  // nothing (not even the aura) reaches outside this box: skip the work there
  if (abs(q.x) > 1.15 || q.y < -1.45 || q.y > 1.65) return vec4(0.0);
  float t = B.t;
  CitJoints j = citJoints(B.arms);
  float d = citBodySDF(q, j);
  vec2 a = vec2(abs(q.x), q.y);
  // the gold rises from the feet: below the front everything is gold
  float fy = q.y - B.kh - 0.018 * cos(q.x * 11.0 - t * 4.0);
  float gm = max(B.gold, smoothstep(0.035, -0.035, fy));
  float front = exp(-fy * fy / 0.00004) * step(-1.1, B.kh) * step(B.kh, 1.1) * (1.0 - B.gold) * B.frontI;
  vec3 tint = mix(B.tint, B.gTint, gm), tint2 = mix(B.tint2, B.gTint2, gm);
  vec3 nerveCol = mix(B.nerveCol, B.gNerve, gm);
  vec3 col = vec3(0.0); float occ = 0.0;

  // ---- aura: nested flame tongues (taller and hotter where the body is gold)
  {
    float dd = max(d, 0.0);
    float ang = citAtan(a.x, q.y - 0.32);
    float n = citNoise3(vec2(ang * 6.5 + 2.0, t * 1.3 - dd * 3.5));
    float reach = (0.05 + 0.55 * n * n * sqrt(n)) * (1.0 + 0.6 * gm);
    float F = dd / reach;
    float env = (1.0 - smoothstep(0.55, 1.0, F)) * step(0.0, d);
    float fl = citIso(F * 4.0 - 0.5, aa / reach * 4.0, 1.2) * (1.0 - F) * 1.4;
    vec3 auc = mix(tint, tint2, smoothstep(0.1, 0.8, F));
    col += auc * (fl * env + env * 0.02 + 0.22 * exp(-dd / (aa * 5.0)) * step(0.0, d)) * B.aura;
    col += tint * citLine(d - 0.024, aa, 1.0) * 0.30 * B.aura;
    occ = max(occ, uAuraOcc * step(0.0, d) * (1.0 - smoothstep(0.0, 0.10, d)) * 0.9);
  }

  float inside = fill(d, aa);
  {
    float fres = exp(min(d, 0.0) * 30.0);
    vec3 fillL = tint * (0.012 + 0.09 * fres) + mix(vec3(0.0, 0.006, 0.03), vec3(0.05, 0.02, 0.0), gm);
    col += fillL * inside;
    occ = max(occ, inside * 0.86);
    col += tint * 1.7 * citLine(d, aa, 1.4);
    float dep = -d;
    float topo = citIso(dep / 0.019, aa / 0.019, 1.0) * exp(-dep * 9.0) * step(0.006, dep);
    col += tint * 0.28 * topo * B.lines;
#ifdef CIT_BONES
    float bone = citLine(citBones(q, j), aa, 1.0) * inside;
    col += mix(vec3(0.70, 0.76, 1.0), tint, 0.4) * 0.55 * bone * B.lines;
#endif
#ifdef CIT_BRAIN
    vec2 br = q - vec2(0.0, 0.89);
    float brm = (1.0 - smoothstep(-0.005, 0.0, sdEllipse(br, vec2(0.074, 0.07)))) * step(-0.035, br.y);
    float g = 0.8 * vnoise(vec2(a.x, q.y) * 30.0 + 3.0) + 0.1 * sin(a.x * 160.0 + q.y * 90.0);
    col += nerveCol * citIso(g * 8.0, aa * 30.0 * 8.0 * 0.6, 1.0) * brm * 0.45 * B.nerves * smoothstep(0.0003, 0.0008, aa);
#endif
    float imp = 0.0;
    float cord = citLine(a.x - 0.0015 * sin(q.y * 50.0), aa, 1.8) * step(0.02, q.y) * step(q.y, 0.80);
    float dp = (abs(q.y - 0.4) - B.pulse * 0.5) * 14.0;
    imp = max(imp, exp(-dp * dp) * cord * step(0.0, B.pulse));
    float nm = cord;
#ifdef CIT_NERVES
    nm = max(nm, citNerve(a, vec2(0.004, 0.64), j.sh + vec2(0.0, -0.02), 1.0, aa, 0.0, B.pulse, imp));
    nm = max(nm, citNerve(a, j.sh + vec2(0.0, -0.02), j.wr, 2.0, aa, 0.2, B.pulse, imp));
    nm = max(nm, citNerve(a, j.wr, j.hd + (j.hd - j.wr) * 0.1, 4.0, aa, 0.8, B.pulse, imp));
    nm = max(nm, citNerve(a, vec2(0.006, 0.06), j.kn, 5.0, aa, 0.0, B.pulse, imp));
    nm = max(nm, citNerve(a, j.kn, j.an, 7.0, aa, 0.55, B.pulse, imp));
#endif
    col += (nerveCol * nm + mix(vec3(0.9, 0.95, 1.0), vec3(1.0, 0.9, 0.6), gm) * 2.5 * imp) * inside * B.nerves;

    // ---- kundalini: sushumna up the midline, ida (lunar) and pingala (solar) crossing at
    //      every chakra, lit up to the gold front
    {
      float y = q.y;
      float on = step(-0.02, y) * step(y, min(B.kh, 1.0)) * step(-0.95, B.kh);
      float sg = y < 0.10 ? 0.0 : y < 0.25 ? 1.0 : y < 0.44 ? 2.0 : y < 0.665 ? 3.0 : y < 0.865 ? 4.0 : 5.0;
      float y0 = y < 0.10 ? -0.02 : y < 0.25 ? 0.10 : y < 0.44 ? 0.25 : y < 0.665 ? 0.44 : y < 0.865 ? 0.665 : 0.865;
      float y1 = y < 0.10 ? 0.10 : y < 0.25 ? 0.25 : y < 0.44 ? 0.44 : y < 0.665 ? 0.665 : y < 0.865 ? 0.865 : 1.0;
      float s = (y - y0) / (y1 - y0);
      float A = 0.055;
      float xc = A * sin(PI * s);
      float slope = A * PI * cos(PI * s) / (y1 - y0);
      float dch = abs(a.x - xc) / sqrt(1.0 + slope * slope);
      float ch = citLine(dch, aa, 1.7) * on;
      float ping = step(0.0, q.x) == mod(sg, 2.0) ? 1.0 : 0.0;
      vec3 cch = mix(vec3(0.75, 0.85, 1.8), vec3(2.0, 0.55, 0.12), ping);
      float flowI = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(y * 40.0 - t * 14.0), 3.0);
      col += cch * ch * (0.5 + flowI) * inside;
      col += cch * 0.25 * exp(-dch / (aa * 4.0)) * on * inside;
      float su = citLine(q.x, aa, 2.4) * on;
      col += vec3(2.4, 1.9, 1.0) * su * inside;
    }
    // ---- the molten front
    col += vec3(1.9, 1.15, 0.4) * front * inside + vec3(1.0, 0.6, 0.2) * front * 0.3 * step(0.0, d) * exp(-d / 0.04);

    // ---- the nearest chakra
    float cy = q.y;
    int ci = cy < 0.04 ? 0 : cy < 0.175 ? 1 : cy < 0.345 ? 2 : cy < 0.55 ? 3 : cy < 0.765 ? 4 : cy < 0.93 ? 5 : 6;
    float hideC = 1.0;
#ifdef CIT_EYE3
    hideC = ci == 5 ? 1.0 - sat(B.eye3 * 4.0) : 1.0;
#endif
    col += citChakra(q, ci, ck[ci], aa, t) * 0.8 * hideC;
    // serene closed eyes
    vec2 ep = a - vec2(0.037, 0.836);
    col += tint * citLine(ep.y + 0.004 * (1.0 - 1600.0 * ep.x * ep.x), aa, 1.2) * 0.7 * step(abs(ep.x), 0.024) * inside;
#ifdef CIT_EYE3
    vec2 tp = q - vec2(0.0, 0.873);
    float e3 = sdVesica(tp, max(0.012 * B.eye3, 0.001), 0.026);
    float r3 = length(tp), a3 = citAtan(tp.y, tp.x);
    float fib = 0.5 + 0.5 * cos(a3 * 90.0) * (0.6 + 0.4 * cos(a3 * 13.0 + r3 * 400.0));
    float fib2 = 0.5 + 0.5 * cos(a3 * 270.0 + 2.0 * sin(r3 * 900.0));
    vec3 ic = mix(vec3(0.45, 0.30, 1.0), vec3(1.0, 0.85, 0.5), smoothstep(0.009, 0.002, r3));
    float in3 = fill(e3, aa) * step(0.001, B.eye3);
    float iris = in3 * smoothstep(0.0035, 0.0045, r3);
    col = mix(col, vec3(0.01, 0.0, 0.04), in3);
    col += ic * iris * (0.12 + 0.8 * fib * fib2 + 0.7 * citLine(r3 - 0.0062, aa, 1.0) + 0.5 * citLine(r3 - 0.0085, aa, 1.0)) * B.eye3;
    col += vec3(1.0, 0.86, 0.6) * 3.0 * fill(r3 - 0.0032 * B.eye3, aa) * B.eye3;
    col += vec3(1.0, 0.92, 0.75) * citLine(e3, aa, 1.4) * 1.5 * step(0.001, B.eye3);
    col += vec3(0.6, 0.4, 1.0) * exp(-max(r3 - 0.0032, 0.0) / (aa * 6.0)) * 0.8 * B.eye3;
#endif
  }
  return vec4(col, occ);
}
`;

  const SCENE = `
uniform vec4  uCam;       // 2D camera: xy centre, z zoom, w roll
uniform vec4  uBodyP;     // x, y, scale, arms
uniform vec4  uBodyQ;     // gold front (body y), gold, eye3, aura
uniform float uCk[7];     // chakra light (0 unlit .. 1 lit .. >1 igniting)
uniform float uTerr[7];   // mountain terrace glow (chakra colours)
uniform vec4  uIgn;       // latest ignition: index, age (s), screen x, screen y
uniform float uIgnS;      // screen units per body unit at the ignition
uniform vec4  uSun;       // xy (scene), radius, intensity
uniform vec4  uSun2;      // ray rotation, whiteness 0..1, ray length (in radii), halo rings
uniform vec4  uMount;     // xy (scene) of the mountain foot, scale, -
uniform float uDawn;      // sky: night 0 .. day 1
uniform float uKickAge;
uniform float uSpeed;     // speed lines
uniform vec2  uSpeedC;    // their focus (screen)
uniform float uRibbon;    // henshin ribbons
uniform float uFrontI;    // molten front brightness
uniform float uRamp;      // C3b: the light rising into the crown (0..1, accelerating)
uniform vec4  uCam2, uCam3;   // panel cameras (left/top, right/bottom)
uniform vec4  uGut;       // panel gutters: two lines x = a + b y (or y = a + b x for strips)
uniform float uGutW;      // gutter half width
uniform vec4  uEyeP;      // close-up eye: screen centre, scale, roll
uniform float uEyeO;      // its openness
uniform vec4  uFaceP;     // the face strip: centre xy, side-eye scale, side-eye distance
uniform float uRollP;     // snare roll envelope
uniform vec4  uLotusP;    // crown lotus: centre xy, radius, opening
uniform float uColumn;    // rainbow column
uniform float uSunDark;   // 0 = blazing gold disc, 1 = night-blue disc engraved in gold
uniform float uBodyL;     // body knob: 1 the luminous body, ~0.15 a dark silhouette
uniform vec3  uIrA, uIrB; // iris knob: the close-up eye (C3a) or the third eye (C3b), outer and inner colour
uniform vec3  uEyeGlow;   // the third eye's light (C3b)
uniform float uSeed;      // seed knob: scatter of stars, yods and speed lines

const vec3 CIT_VERM  = vec3(0.62, 0.035, 0.008);
const vec3 CIT_ULTRA = vec3(0.004, 0.018, 0.40);
const vec3 CIT_GOLD  = vec3(1.0, 0.64, 0.18);

// ---------------------------------------------------------------- sky: indigo night to amber dawn
float citStars(vec2 p) {
  vec2 sp = p * 70.0; vec2 sid = floor(sp) + uSeed; vec2 so = fract(sp) - 0.5 - (hash22(sid) - 0.5) * 0.6;
  float sh = hash21(sid + 3.1);
  return step(0.90, sh) * exp(-dot(so, so) * 60.0) * (0.6 + 0.4 * sin(uTime * 4.0 + sh * 40.0));
}
vec3 citSky(vec2 p, vec2 w) {
  vec3 top = mix(vec3(0.004, 0.003, 0.028), vec3(0.016, 0.006, 0.05), uDawn);
  vec3 mid = mix(vec3(0.028, 0.008, 0.06), vec3(0.13, 0.022, 0.065), uDawn);
  vec3 low = mix(vec3(0.07, 0.02, 0.03), vec3(0.24, 0.065, 0.012), uDawn);
  float h = p.y;
  vec3 col = mix(low, mid, smoothstep(-0.7, 0.2, h));
  col = mix(col, top, smoothstep(0.1, 1.0, h));
  float r = length(w - uSun.xy) / uSun.z;
  col += vec3(1.0, 0.42, 0.06) * exp(-max(r - 1.0, 0.0) * 1.8) * 0.28 * uSun.w;
#ifdef CIT_YODS
  col += vec3(0.8, 0.85, 1.0) * citStars(p) * smoothstep(0.0, 0.9, p.y) * (1.0 - 0.7 * uDawn) * 0.9;
  // the falling drops (yods) of Tarot XIX, one in each chakra colour, outlined in gold
  {
    const float CS = 0.26;
    vec2 yp = p + vec2(0.0, uTime * 0.16);
    vec2 cid = floor(yp / CS);
    vec2 cs = cid + uSeed;   // (one read of the seed: each uniform read costs in SwiftShader)
    vec2 h = hash22(cs + 7.0);
    vec2 cp = (cid + 0.2 + 0.6 * h) * CS;
    float ys = 0.013 + 0.008 * h.y;
    vec2 dq = (yp - cp) / ys;
    float tear = min(length(dq) - 1.0, sdTaper(dq, vec2(0.0), vec2(0.0, 2.6), 1.0, 0.0));
    float on = step(0.70, hash21(cs + 1.3)) * smoothstep(-0.2, 0.4, abs(p.x) - 0.25 * (1.0 - abs(p.y)));
    float pxl = px() / ys;
    vec3 yc = chakraColor(floor(hash21(cs + 4.1) * 7.0));
    col += (yc * 0.5 * fill(tear, pxl) + vec3(1.0, 0.75, 0.35) * citLine(tear, pxl, 1.2) * 0.8 + yc * 0.10 * exp(-max(tear, 0.0) * 2.5)) * on;
  }
#endif
  return col;
}

// ---------------------------------------------------------------- XIX The Sun (Marseille):
// disc with engraved rings, a circumpunct, alternating straight and wavy rays, fine hairlines
vec4 citSun(vec2 w, float pxw) {
  vec2 d = w - uSun.xy; float R = uSun.z;
  float r = length(d), a = citAtan(d.x, d.y);
  float wh = uSun2.y;
  vec3 gold = mix(vec3(1.0, 0.62, 0.14), vec3(1.0, 0.90, 0.72), wh);
  vec3 col = vec3(0.0);
  float disc = fill(r - R, pxw);
  float core = exp(-r / R * 1.8);
  vec3 dc = mix(vec3(0.80, 0.36, 0.05), vec3(2.2, 1.9, 1.5), wh) * (0.45 + 1.1 * core);
  float rings = citIso(r / (R * 0.055), pxw / (R * 0.055), 1.0);
#ifndef CIT_NIGHT
  dc = mix(dc, dc * vec3(0.35, 0.16, 0.05), rings * 0.85 * uSun2.w);
#else
  // the night sun: ultramarine engraved in gold, a rosette of 32 petals
  vec3 nc = mix(vec3(0.035, 0.012, 0.10), vec3(0.004, 0.006, 0.045), sat(r / R)) + gold * rings * 0.22 * smoothstep(0.30, 0.5, r / R) * uSun2.w;
  {
    vec2 pd = citPetalRing(r, a - uSun2.x * 0.5, 32.0, R * 0.74, R * 0.21, 0.92, 0.5);
    nc += gold * (citLine(pd.x, pxw, 1.3) * 0.75 + citIso(pd.x / (pd.y * 0.34), pxw / (pd.y * 0.34), 0.9) * step(pd.x, 0.0) * 0.3 + fill(pd.x, pxw) * 0.04) * uSun2.w;
    nc += gold * 0.8 * (citLine(r - R * 0.52, pxw, 1.4) + citLine(r - R * 0.49, pxw, 1.0) * 0.5);
  }
  dc = nc;
#endif
  col += disc * dc;
  col += gold * 2.6 * citLine(r - R, pxw, 2.2) + gold * 1.0 * citLine(r - R * 1.055, pxw, 1.0);
  col += gold * 0.9 * citLine(r - R * 1.10, pxw, 1.0);
  // rays: 16 straight (outlined triangles) alternating with 16 wavy flames
  if (r < R * (1.16 + uSun2.z)) {
  const float n = 32.0;
  float sector = (a + uSun2.x) / TAU * n;
  float id = floor(sector), fr = fract(sector) - 0.5;
  float L = uSun2.z;
  float straight = step(mod(id, 2.0), 0.5);
  float rr = (r - R * 1.14) / (R * L * mix(0.72, 1.0, straight));
  float inR = step(0.0, rr) * step(rr, 1.0);
  float arcU = r * TAU / n;
  float ed = (abs(fr) - 0.40 * (1.0 - rr)) * arcU;
  float body = fill(ed, pxw);
  // Marseille colouring: the straight rays alternate vermilion, chrome yellow and ultramarine
  float rk = mod(floor(id * 0.5), 3.0);
  vec3 rf = rk < 0.5 ? vec3(0.62, 0.07, 0.015) : rk < 1.5 ? vec3(0.75, 0.42, 0.05) : vec3(0.03, 0.06, 0.45);
  rf = mix(rf, gold * 0.32, wh);
  vec3 sray = rf * body * (0.04 + 0.42 * (1.0 - rr) * (1.0 - rr)) * (0.55 + 0.45 * (1.0 - 2.0 * abs(fr) / max(0.4 * (1.0 - rr), 1e-3))) + gold * (citLine(ed, pxw, 1.3) * 0.95 + citLine(fr * arcU, pxw, 1.0) * body * 0.45);
  sray += gold * citIso(fr * 7.0 * (1.0 - rr * 0.5), pxw / arcU * 7.0, 0.9) * body * 0.16;
  float wv = (0.13 + 0.06 * rr) * sin(rr * 15.0 - uTime * 6.0 + id);
  float wl = citLine((fr - wv) * arcU, pxw, 1.8) + citLine((abs(fr - wv * 0.7) - 0.12 * (1.0 - rr)) * arcU, pxw, 0.9) * 0.6;
  vec3 wray = mix(gold, vec3(1.0, 0.35, 0.06), 0.4) * wl * (1.1 - rr) * 0.6;
  col += mix(wray, sray, straight) * inR * (1.0 - smoothstep(0.75, 1.0, rr)) * (0.85 + 0.4 * exp(-uKickAge * 8.0));
  }
  // hairlines and halo rings in the sky (fine Alex Grey linework)
  float hl = citIso((a + uSun2.x * 0.5) / TAU * 240.0, pxw / max(r, 1e-3) / TAU * 240.0, 0.8);
  col += gold * hl * 0.07 * exp(-max(r - R, 0.0) / R * 0.9) * step(R * 1.1, r);
  return vec4(col * uSun.w, disc * uSun.w);
}

#ifdef CIT_MOUNTAIN
// ---------------------------------------------------------------- THE HOLY MOUNTAIN
// 7 terraces of gold leaf (one per chakra), each with a frieze of vermilion and ultramarine
// panels (fire triangles, sun circles); a central stair of light; the athanor tower on the
// summit and the eye in the triangle above it. Mountain units: foot at y = 0, summit ~1.53.
const float CIT_TH = 0.30;      // tower height
vec4 citMountain(vec2 w, float pxw) {
  vec2 m = (w - uMount.xy) / uMount.z;
  float pm = pxw / uMount.z;
  float ax = abs(m.x);
  if (m.y > 2.30 || ax > 2.7 || (m.y > 1.53 && ax > 0.2)) return vec4(0.0);
  // terrace table (precomputed): which terrace, its foot y, height, half width (and the one below)
  float s1 = step(0.32000, m.y), s2 = step(0.59200, m.y), s3 = step(0.82320, m.y), s4 = step(1.01972, m.y), s5 = step(1.18676, m.y), s6 = step(1.32875, m.y);
  float k = s1 + s2 + s3 + s4 + s5 + s6;
  float y0 = 0.00000 + s1 * 0.32000 + s2 * 0.27200 + s3 * 0.23120 + s4 * 0.19652 + s5 * 0.16704 + s6 * 0.14199;
  float hk = 0.32000 + s1 * -0.04800 + s2 * -0.04080 + s3 * -0.03468 + s4 * -0.02948 + s5 * -0.02506 + s6 * -0.02130;
  float Wk = 2.40000 + s1 * -0.46407 + s2 * -0.42821 + s3 * -0.38713 + s4 * -0.33811 + s5 * -0.27481 + s6 * -0.16767;
  float Wp = 2.80000 + s1 * -0.40000 + s2 * -0.46407 + s3 * -0.42821 + s4 * -0.38713 + s5 * -0.33811 + s6 * -0.27481;
  const float top = 1.44944;
  if (m.y < 0.0) { k = 0.0; y0 = -0.32; hk = 0.32; Wk = 2.6; }
  float v = (m.y - y0) / hk;
  float pv = pm / hk;
  float inM = step(m.y, top) * (1.0 - smoothstep(Wk - pm, Wk + pm, ax));
  int ki = int(k);
  float lit = uTerr[ki];
  vec3 cc = chakraColor(k);
  vec3 col = vec3(0.0);
  // gold-leaf face, darker at the foot of each riser, fine engraved courses
  float tread = smoothstep(0.86 - pv, 0.86 + pv, v);
  vec3 face = CIT_GOLD * (0.025 + 0.07 * v) * (0.75 + 0.25 * sat(m.y / top)) * (0.35 + 0.65 * smoothstep(0.0, 0.12, v));
  face += CIT_GOLD * 0.16 * citIso(v * 9.0, pv * 9.0, 1.0) * (1.0 - tread);
  // brickwork joints: staggered vertical lines between the courses
  float course = floor(v * 9.0);
  float bj = citIso(m.x / (hk * 0.55) + 0.5 * mod(course, 2.0), pm / (hk * 0.55), 1.0);
  face += CIT_GOLD * 0.07 * bj * (1.0 - tread);
  // the frieze
  float fb = step(0.20, v) * step(v, 0.72);
  float fh = 0.52 * hk;
  float cw = fh * 1.15;
  float cxp = m.x / cw; float cid = floor(cxp + 0.5);
  vec2 cl = vec2((cxp - cid) * cw, (v - 0.46) * hk);
  float alt = mod(cid + k, 2.0);
  vec3 panel = mix(CIT_VERM, CIT_ULTRA, alt) * 0.42;
  float tri = sdTriangle(cl + vec2(0.0, 0.04 * fh), fh * 0.30);
  float ring = length(cl) - fh * 0.30;
  float motif = mix(tri, ring, alt);
  float mfill = fill(motif, pm);
  vec3 mcol = mix(CIT_GOLD * 0.16, cc * 1.3, sat(lit));
  vec3 fcol = panel * (1.0 - mfill) + mcol * mfill;
  fcol += CIT_GOLD * (citLine(motif, pm, 1.4) * 0.9 + citLine(motif + fh * 0.07, pm, 1.0) * 0.4);
  fcol += CIT_GOLD * citLine(length(cl) - fh * 0.05, pm, 1.2) * alt;   // circumpunct dot
  fcol += CIT_GOLD * 0.9 * citLine((fract(cxp + 0.5) - 0.5) * cw - 0.5 * cw * sign(fract(cxp + 0.5) - 0.5), pm, 1.2);
  face = mix(face, fcol, fb);
  face += CIT_GOLD * 0.8 * (citLine((v - 0.20) * hk, pm, 1.4) + citLine((v - 0.72) * hk, pm, 1.4) + citLine((v - 0.17) * hk, pm, 0.9) * 0.5 + citLine((v - 0.75) * hk, pm, 0.9) * 0.5);
  // the tread: a lit top surface catching the sun from behind
  vec3 tc = CIT_GOLD * (0.18 + 0.22 * (v - 0.86) / 0.14) + vec3(0.18, 0.08, 0.01) * citIso(m.x / 0.06, pm / 0.06, 1.0);
  face = mix(face, tc, tread);
  // rim light along the tread edge and the silhouette
  float rim = citLine((v - 1.0) * hk, pm, 1.8) * 2.2 + citLine((v - 0.86) * hk, pm, 1.2) * 0.9 + citLine(ax - Wk, pm, 1.8) * 1.6;
  face += mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.9, 0.7), 0.5) * rim * (0.6 + 0.4 * sat(m.y / top));
  // terrace ignition: its chakra colour flows through the inlay
  face += cc * lit * (0.25 * fb + 0.8 * rim + 0.6 * citLine(motif, pm, 1.4) * fb);
  // the stair of light up the middle
  float sw = 0.17 - 0.10 * sat(m.y / top);
  float inS = 1.0 - smoothstep(sw - pm, sw + pm, ax);
  float sv = m.y / 0.034;
  float stp = fract(sv);
  vec3 sc = vec3(1.0, 0.62, 0.20) * (0.08 + 0.22 * stp) + vec3(1.2, 0.85, 0.45) * citIso(sv, pm / 0.034, 1.2) * 0.75;
  sc *= 0.6 + 0.8 * smoothstep(0.0, top, m.y);
  face = mix(face, sc, inS);
  float bal = citLine(ax - sw, pm, 1.6) + citLine(ax - sw - 0.012, pm, 1.0) * 0.6;
  face += vec3(1.2, 0.85, 0.4) * bal * step(m.y, top);
  col = face * inM;
  float alpha = inM;
#ifdef CIT_BRAZIERS
  {
    vec2 bq = vec2(ax - (Wk + 0.5 * (Wp - Wk)), m.y - y0);
    float sz = hk * 0.9;
    float bowl = max(sdEllipse(bq - vec2(0.0, 0.10 * sz), vec2(0.13, 0.05) * sz), -(bq.y - 0.10 * sz));
    float legs = sdBox(bq - vec2(0.0, 0.05 * sz), vec2(0.03 * sz, 0.05 * sz));
    float br = min(bowl, legs);
    float inB = fill(br, pm) * step(Wk + 0.04, Wp) * step(0.5, k);
    // the flame: a flickering teardrop with nested tongues
    vec2 fq = (bq - vec2(0.0, 0.12 * sz)) / sz;
    float fn = vnoise(vec2(fq.x * 7.0, fq.y * 4.0 - uTime * 5.0 + k * 3.0));
    float fh = 0.42 + 0.12 * fn + 0.18 * exp(-uKickAge * 6.0);
    float fd = length(vec2(fq.x * (1.0 + 2.2 * sat(fq.y / fh)) + 0.05 * sin(fq.y * 14.0 - uTime * 9.0), (fq.y - fh * 0.35) * 0.55)) - 0.13;
    float inFl = fill(fd * sz, pm) * step(0.0, fq.y) * step(Wk + 0.04, Wp) * step(0.5, k);
    vec3 flc = mix(vec3(2.6, 1.6, 0.5), vec3(1.6, 0.25, 0.04), smoothstep(0.0, 0.10, -fd + 0.0) * 0.0 + smoothstep(0.05, fh, fq.y));
    col = mix(col, CIT_GOLD * 0.35 + vec3(1.0, 0.7, 0.3) * citLine(br, pm, 1.2), inB);
    col = mix(col, flc, inFl * 0.9);
    col += vec3(1.0, 0.45, 0.08) * exp(-max(fd, 0.0) * sz / (0.25 * sz)) * 0.18 * step(0.0, fq.y + 0.1) * step(Wk + 0.04, Wp) * step(0.5, k);
    alpha = max(alpha, max(inB, inFl));
  }
#endif
  // ---- the athanor: a banded tower on the summit, fire in its arched window, a dome
  {
    vec2 tq = vec2(m.x, m.y - top);
    float tv = tq.y / CIT_TH;
    float tw = 0.085 * (1.0 - 0.15 * tv);
    float inT = step(0.0, tq.y) * step(tq.y, CIT_TH) * (1.0 - smoothstep(tw - pm, tw + pm, abs(tq.x)));
    float u = tq.x / tw; float nz = sqrt(max(1.0 - u * u, 0.0));
    float band = floor(tv * 6.0);
    vec3 tcol = mix(CIT_VERM, CIT_ULTRA, mod(band, 2.0)) * (0.25 + 0.6 * nz);
    tcol += CIT_GOLD * 1.2 * citIso(tv * 6.0, pm / CIT_TH * 6.0, 1.3);
    tcol += CIT_GOLD * 0.5 * citIso(u * (1.0 + 0.18 * u * u) * 2.6, pm / tw / max(nz, 0.15) * 2.6, 1.0) * nz;
    tcol += CIT_GOLD * 1.4 * citLine(abs(tq.x) - tw, pm, 1.5);
    // arched window with the athanor's fire
    vec2 wq = tq - vec2(0.0, CIT_TH * 0.42);
    float win = min(sdBox(wq + vec2(0.0, 0.01), vec2(0.026, 0.035)), length(wq - vec2(0.0, 0.025)) - 0.026);
    float fire = fill(win, pm);
    float fl = vnoise(vec2(wq.x * 60.0, wq.y * 30.0 - uTime * 6.0));
    tcol = mix(tcol, vec3(2.4, 0.9, 0.18) * (0.6 + 0.8 * fl) * (1.0 + 0.6 * exp(-uKickAge * 6.0)), fire);
    tcol += CIT_GOLD * 1.6 * citLine(win, pm, 1.3);
    col = mix(col, tcol, inT);
    alpha = max(alpha, inT);
    // crenellated parapet and the dome
    vec2 pq = tq - vec2(0.0, CIT_TH);
    float par = sdBox(pq - vec2(0.0, 0.012), vec2(tw * 1.25, 0.012));
    float cren = max(sdBox(pq - vec2(0.0, 0.034), vec2(tw * 1.25, 0.012)), 0.010 - abs(fract(pq.x / 0.04) - 0.5) * 0.04);
    float dome = max(length(pq - vec2(0.0, 0.024)) - tw * 0.85, -(pq.y - 0.024));
    float fin = sdCapsule(pq, vec2(0.0, 0.024 + tw * 0.85), vec2(0.0, 0.024 + tw * 0.85 + 0.08), 0.004);
    float cap = min(min(par, cren), min(dome, fin));
    float inC = fill(cap, pm);
    vec3 ccap = CIT_GOLD * (0.35 + 0.5 * smoothstep(0.0, 0.1, pq.y)) + vec3(1.2, 0.8, 0.3) * citIso((pq.y - 0.024) / 0.012, pm / 0.012, 1.0) * fill(dome, pm) * 0.6;
    col = mix(col, ccap, inC);
    col += vec3(1.3, 0.95, 0.45) * citLine(cap, pm, 1.5);
    alpha = max(alpha, inC);
#ifdef CIT_PROVIDENCE
    // the eye in the triangle (Providence), floating in the sun's heart
    vec2 eq = tq - vec2(0.0, CIT_TH + 0.24);
    float trd = sdTriangle(eq, 0.12);
    float inTr = fill(trd, pm);
    vec3 trc = vec3(0.02, 0.025, 0.14) * inTr;
    trc += vec3(1.4, 1.0, 0.5) * (citLine(trd, pm, 2.2) * 1.4 + citLine(trd + 0.014, pm, 1.0) * 0.8);
    vec2 ee = eq - vec2(0.0, -0.012);
    float lid = sdVesica(vec2(ee.y, ee.x), max(0.026 * (1.0 - 0.9 * smoothstep(0.35, 0.9, uOpenHat) * (1.0 - uReduced)), 0.003), 0.062);
    float er = length(ee);
    float inE = fill(lid, pm);
    trc += inE * (vec3(1.6, 1.4, 1.1) * 0.6 * smoothstep(0.024, 0.026, er) + vec3(1.0, 0.55, 0.1) * (1.0 - smoothstep(0.0235, 0.025, er)) * (0.6 + 0.6 * citIso(citAtan(ee.y, ee.x) / TAU * 40.0, pm / max(er, 1e-3) / TAU * 40.0, 1.0)));
    trc = mix(trc, vec3(0.0), inE * fill(er - 0.010, pm));
    trc += vec3(2.0) * inE * fill(length(ee - vec2(0.006, 0.006)) - 0.004, pm);
    trc += vec3(1.4, 1.0, 0.5) * citLine(lid, pm, 1.5) * 1.2;
    col = col * (1.0 - inTr) + trc;
    alpha = max(alpha, inTr);
#endif
  }
  return vec4(col, alpha);
}
#endif

// ---------------------------------------------------------------- anime speed lines (screen)
// (polar form for callers that already have the radius and angle around c)
float citSpeedRA(float r, float a, float n, float inner, float seed) {
  float sx = a / TAU * n; float sid = floor(sx);
  float h = hash11(sid * 1.37 + seed);
  float wpx = 0.7 + 2.6 * h * h;
  float sw = abs(fract(sx) - 0.5) * TAU * r / n;
  float line = 1.0 - smoothstep(0.0, px() * wpx, sw);
  return line * step(0.58, h) * smoothstep(inner * (0.6 + 0.7 * h), inner * (1.0 + 0.7 * h) + 0.25, r);
}
float citSpeed(vec2 p, vec2 c, float n, float inner, float seed) {
  vec2 d = p - c; return citSpeedRA(length(d), citAtan(d.y, d.x), n, inner, seed);
}

// ---------------------------------------------------------------- a chakra ignites (sakuga)
// Takes the frame and returns it with the ignition on it. Behind the shock front the picture
// takes the chakra's hue (a grade: the light and linework stay, the hue is replaced, so it reads
// as colour, not as a white flash), then lets go. A coloured shock ring with a 1-px white-hot leading edge (wider for each chakra,
// a rainbow for the crown), a lotus bloom, a small white core, sparkles, burst lines. Everything
// escalates from the root (i = 0) to the crown (i = 6).
vec3 citBurst(vec3 col, vec2 p, vec2 c, float age, int i, float S) {
  if (age < 0.0 || age > 1.3) return col;
  float fi = float(i), esc = fi / 6.0;
  vec3 hc = citHot(fi);
  // the root also has to read through the beat-32 gold flash; reduced flashing dims the burst
  float I = (0.8 + 0.4 * esc + (i == 0 ? 0.3 : 0.0)) * (1.0 - 0.45 * uReduced);
  float PX = px();
  vec2 d = p - c; float r = length(d); float a = citAtan(d.y, d.x);
  float R1 = 2.6 * (1.0 - exp(-age * 4.0));
  // 0. the colour sweeps out with the shock front (red lingers past the gold flash)
  {
    float dec = i == 0 ? 0.5 : 0.22 + 0.08 * esc;
    // held for ~2 frames, nearly complete at the core: a partial mix of HDR-white linework still
    // tone-maps to white, so the core of the burst has to be (briefly) all chakra colour
    float gA = (0.80 + 0.12 * esc + (i == 0 ? 0.08 : 0.0)) * exp(-max(age - 0.08, 0.0) / dec) * (1.0 - 0.7 * uReduced);
    // the root's red wash ramps up over 0.3 s (spec 7.3 rule 6: a frame-wide red wash must not
    // step), so the drop from gold to the darker red never stacks on a flash decay either; reduced:
    // it stays under 25 % of the frame (below)
    if (i == 0) gA *= smoothstep(0.0, 0.3, age);
    // (the root floods the whole Mountain: it has to win against the gold flash on the same beat)
    float gm = gA * (1.0 - smoothstep(min(R1 * 0.8 - 0.05, mix(9.0, 0.45, uReduced)), min(R1, mix(9.0, 0.65, uReduced)), r)) * min((i == 0 ? 0.7 : 0.4) + 0.65 * exp(-r * 1.5), 1.0);
    float lb = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, hc * (2.2 * lb + 0.05), gm);
  }
  // 1. the shock ring, broken into sakuga segments. It widens with each chakra; the crown's is
  //    a rainbow band (violet, blue, yellow, red). One ring only: a train of rings sweeps every
  //    pixel several times within a few frames, which strobes. The band and its trail are painted
  //    over the frame (not added), so colours never sum to white; only the 1-px leading edge is added.
  {
    float wd = mix(0.014 + 0.016 * esc, 0.004, sat(age * 2.2));
    float sgi = floor(a / TAU * 11.0 + 5.5);
    float seg = step(0.16 + 0.25 * hash11(sgi + fi * 13.0), fract(a / TAU * 11.0 + 0.3 * hash11(fi)));
    float dr = r - R1;
    float band = 1.0 - smoothstep(wd, wd + 1.5 * PX, abs(dr));
    float edge = 1.0 - smoothstep(0.0, 1.5 * PX, abs(dr - wd));
    float trail = 1.0 - smoothstep(0.0, wd * 2.5 + 3.0 * PX, abs(dr + wd * 2.0));
    vec3 kc = hc;
    if (i == 6) kc = citHot(6.0 - 2.0 * floor(sat((wd - dr) / (2.0 * wd)) * 3.99));
    float fade = exp(-age * 3.2) * I;
    col = mix(col, hc * 1.6, sat(trail * 0.4 * fade));
    col = mix(col, kc * 2.4, sat(band * mix(1.0, seg, 0.6) * fade));
    col += vec3(1.3, 1.25, 1.15) * edge * seg * fade;
  }
  float R2 = 3.2 * (1.0 - exp(-max(age - 0.05, 0.0) * 3.0));
  vec2 dg = d * vec2(1.0, 4.0);
  col += hc * 1.6 * (1.0 - smoothstep(0.0, 0.012 + 3.0 * PX, abs(length(dg) - R2))) * exp(-age * 3.0) * step(0.05, age) * I;
  // 2. the lotus blooms out of the chakra (petal count of the chakra), then fades into it
  float np = citPetalN(i);
  float grow = 1.0 - pow(1.0 - sat(age / 0.22), 3.0);
  float Rl = min(S * 0.42, 0.62) * grow * (1.0 + 0.12 * sin(sat(age / 0.22) * PI));
  float spin = age * 0.8 * (mod(fi, 2.0) * 2.0 - 1.0);
  float L = exp(-max(age - 0.18, 0.0) * 3.5);
  float lot = 0.0, lfill = 0.0;
  Rl *= i == 5 ? 1.5 : 1.0;
  L *= 1.0 - smoothstep(0.45, 0.62, age);
  if (age < 0.62) if (r < Rl * 1.1 && i != 6) for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer) * (i == 5 ? 0.0 : 1.0);
    vec2 pd = citPetalRing(r, a + spin * (1.0 - 2.0 * fl), np, Rl * mix(0.60, 0.42, fl), Rl * mix(0.40, 0.24, fl), 0.95, 0.5 - fl * 0.5);
    lot = max(lot, (citLine(pd.x, PX, 1.6) + citIso(pd.x / (pd.y * 0.3), PX / (pd.y * 0.3), 1.0) * step(pd.x, 0.0) * 0.6) * mix(1.0, 0.7, fl));
    lfill = max(lfill, fill(pd.x, PX) * sat(-pd.x / pd.y) * (1.0 - 0.4 * fl));
  }
  float hub = citLine(r - Rl * 0.22, PX, 2.0) + citLine(r - Rl * 0.16, PX, 1.0) + citLine(r - Rl * 1.06, PX, 1.2) * 0.6;
  col += ((hc * 2.4 + 0.1) * (lot + hub) + hc * lfill * 0.5) * L * I;
  // 3. glow in the chakra's colour around a small white-hot core
  col += hc * (0.25 * exp(-age / 0.22) * (0.1 + 0.6 * exp(-r * 3.0)) + 1.8 * exp(-r / (0.05 + 0.05 * esc)) * exp(-age * 4.0)) * I;
  col += vec3(1.0, 0.92, 0.8) * 1.6 * exp(-r / 0.015) * exp(-age * 7.0) * I;
  // 4. sparkles flying out (one per sector, constant cost)
  if (age < 0.62) {
    float ns = 14.0;
    float sx = (a + 0.3) / TAU * ns; float sid = floor(sx);
    float h = hash11(sid * 3.1 + fi * 7.7);
    float sa = (sid + 0.25 + 0.5 * h) / ns * TAU - 0.3;
    float sr = (0.15 + 1.2 * h) * S * 1.4 * (1.0 - exp(-age * 5.0)) + Rl * 0.3;
    vec2 sp = c + vec2(cos(sa), sin(sa)) * sr;
    float ssz = (0.035 + 0.05 * h) * exp(-age * 2.5) * (0.6 + 0.4 * S) * (0.8 + 0.4 * esc);
    col += mix(vec3(1.0, 0.95, 0.85), hc * 1.6, 0.6) * 1.8 * sparkle(p, sp, ssz) * (1.0 - smoothstep(0.45, 0.62, age)) * I;
  }
  // 5. burst lines: re-rolled once per 8th note (spec 7.3 rule 1: each pixel changes about twice a
  // second; per 16th it was four times), frozen in reduced-flashing mode
  if (age < 0.6) col += mix(hc * 1.6, vec3(1.0, 0.9, 0.7), 0.25) * citSpeedRA(r, a, 120.0, 0.35 + age * 1.5, floor(age * 4.5333333 * (1.0 - uReduced))) * exp(-age * 4.0) * 1.4 * I;
  return col;
}

#ifdef CIT_RIBBONS
// ---------------------------------------------------------------- henshin: three light ribbons
// spiralling up around the body (body units). front = in front of the body, back = behind.
// Spec 7.3 rule 1: each ribbon crosses a point of the body twice a turn (in front, then behind), so
// the turn rate is 4 rad/s (the 30 s piece: 7, six crossings of a pixel a second for the three) and
// the far side is dimmer: the bright front passes a pixel about twice a second.
void citRibbons(vec2 q, float aa, out vec3 back, out vec3 front) {
  back = vec3(0.0); front = vec3(0.0);
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float ph = q.y * 6.0 - uTime * 4.0 + fj * TAU / 3.0;
    float R = 0.34 + 0.05 * sin(q.y * 2.3 + fj * 2.0);
    float xc = R * sin(ph);
    float z = cos(ph);
    float slope = R * 6.0 * z;
    float dist = abs(q.x - xc) / sqrt(1.0 + slope * slope);
    float wid = 0.024 * (0.25 + 0.75 * abs(z)) + 0.003;
    float band = 1.0 - smoothstep(wid - aa, wid + aa, dist);
    float lines = citIso(dist / wid * 2.0, aa / wid * 2.0, 1.0) * band;
    float core = citLine(dist, aa, 1.6);
    float vis = smoothstep(-1.15, -0.8, q.y) * (1.0 - smoothstep(1.0, 1.35, q.y));
    vec3 c = j == 0 ? vec3(1.0, 0.70, 0.22) : j == 1 ? vec3(1.0, 0.88, 0.60) : vec3(1.0, 0.34, 0.06);
    vec3 rc = c * (band * 0.14 + lines * 1.0 + core * 1.8) * vis * (0.5 + 0.5 * abs(z));
    if (z > 0.0) front += rc; else back += rc * 0.3;
  }
}
#endif

#if defined(CIT_EYECU) || defined(CIT_FACE)
// ---------------------------------------------------------------- the awakened eye (manga cut-in):
// an anime eye drawn in the body's linework: lids, ink lash line and lashes, a gold (or violet)
// iris of radial fibres with the Sun and the Mountain reflected in it, contour lines flowing out
// from the lids across the skin. o = openness. Returns colour and coverage (skin = 1 when withSkin).
vec4 citEyeCU(vec2 p, vec2 c, float sc, float ro, float o, vec3 irA, vec3 irB, float withSkin, float PX) {
  vec2 e = (p - c) / sc;
  e = vec2(e.x * cos(ro) - e.y * sin(ro), e.x * sin(ro) + e.y * cos(ro));
  float pe = PX / sc;
  float xx = sat(1.0 - e.x * e.x);
  float yu = 0.50 * pow(xx, 0.62) * o + 0.10 * e.x - 0.03 - 0.10 * xx * (1.0 - o);
  float yl = -0.27 * pow(xx, 0.9) * mix(0.25, 1.0, o) + 0.05 * e.x - 0.04 - 0.10 * xx * (1.0 - o);
  // skin: warm dark gold, contour lines flowing outward from the lids (Alex Grey)
  float mid = 0.5 * (yu + yl);
  float fld = max(e.y > mid ? e.y - yu : yl - e.y, 0.0) * 1.2 + 0.6 * max(abs(e.x) - 0.95, 0.0);
  vec3 col = vec3(0.10, 0.035, 0.006) * (1.25 - 0.5 * sat(fld));
  // (in C3b the flow accelerates with the build, uRamp; at most ~0.25 line spacings per frame)
  col += vec3(1.0, 0.55, 0.15) * citIso(fld / 0.075 - uTime * 1.5 - uRamp * 2.0, pe / 0.075 * 1.2, 1.0) * (0.30 + 0.25 * uRamp) * smoothstep(0.03, 0.12, fld) * (1.0 - smoothstep(0.5, 1.1, fld));
  float cover = withSkin;
  // the brow: fine parallel strokes
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float by = 0.78 + 0.045 * fi - 0.30 * e.x * e.x + 0.10 * e.x;
    col += vec3(1.0, 0.68, 0.28) * citLine(e.y - by, pe, 1.6 - 0.25 * fi) * step(abs(e.x + 0.05), 1.08 - 0.12 * fi) * (0.9 - 0.15 * fi) * withSkin;
  }
  float inE = step(abs(e.x), 1.0) * smoothstep(-pe, pe, yu - e.y) * smoothstep(-pe, pe, e.y - yl) * step(0.02, o);
  // the third eye (no skin) has a deep violet sclera, the physical eyes a warm white
  vec3 ec = mix(vec3(0.80, 0.74, 0.66), vec3(0.09, 0.03, 0.26) + irA * 0.15, 1.0 - withSkin) * (0.35 + 0.65 * smoothstep(yu, yu - 0.28, e.y));
  vec2 di = e - vec2(0.03, -0.03);
  float ir = length(di), ia = citAtan(di.y, di.x);
  const float IR = 0.42;
  float inI = fill(ir - IR, pe);
  float fib = 0.5 + 0.5 * cos(ia * 64.0 + 3.0 * sin(ir * 30.0));
  float fib2 = 0.5 + 0.5 * cos(ia * 150.0 + ir * 40.0);
  vec3 irc = mix(irA, irB, smoothstep(IR, 0.14, ir)) * (0.45 + 0.55 * fib * (0.6 + 0.4 * fib2));
  irc *= 0.35 + 0.65 * smoothstep(yu, yu - 0.32, e.y);
  irc += irB * citLine(ir - 0.23, pe, 1.6) * 0.6 + irB * citLine(ir - 0.30, pe, 1.0) * 0.3;
  irc = mix(irc, vec3(0.03, 0.006, 0.0), smoothstep(IR - 0.07, IR, ir));
  irc = mix(irc, vec3(0.0), fill(ir - 0.14 * (1.15 - 0.3 * uRollP), pe));
  // the Sun of XIX reflected (disc + rays) above a stepped mountain silhouette
  vec2 sr = di - vec2(-0.14, 0.13);
  float srr = length(sr), sra = citAtan(sr.y, sr.x);
  float rayM = pow(abs(cos(sra * 6.0 + uTime)), 6.0);
  irc += vec3(2.6, 2.1, 1.4) * (fill(srr - 0.045, pe) + fill(srr - 0.045 - 0.055 * rayM, pe) * 0.6 + exp(-srr / 0.04) * 0.5);
  vec2 mr = di - vec2(-0.14, 0.035);
  float stepsH = floor((0.11 - abs(mr.x)) / 0.022) * 0.014;
  float mtn = step(0.0, mr.y) * step(mr.y, stepsH) * step(abs(mr.x), 0.11);
  irc = mix(irc, vec3(0.04, 0.01, 0.0), mtn * 0.85);
  irc += vec3(2.2) * fill(length((di - vec2(0.18, 0.16)) * vec2(1.0, 1.35)) - 0.065, pe);
  irc += vec3(1.6) * fill(length(di - vec2(-0.17, -0.21)) - 0.028, pe);
  ec = mix(ec, irc, inI);
  col = mix(col, ec, inE);
  // the ink lash line (flicked at the outer corner), lashes, the lower lid
  float lw = 0.014 + 0.03 * sqrt(xx) * max(o, 0.35) + 0.02 * smoothstep(0.6, 1.0, e.x);
  float lashD = abs(e.y - yu - lw * 0.6) - lw;
  float lashes = 0.0;
  {
    float lx = e.x * 9.0;
    float lt = fract(lx);
    float h = (0.06 + 0.08 * smoothstep(-0.2, 1.0, e.x)) * mix(0.6, 1.0, o);
    float ly = (e.y - yu) * mix(-1.0, 1.0, step(0.3, o));   // closed: lashes hang down
    float dl = abs(lt - 0.5 - (ly / h) * 0.35 * sign(e.x + 0.2)) * (1.0 / 9.0) - 0.006 * (1.0 - ly / h);
    lashes = step(0.0, ly) * step(ly, h) * fill(dl, pe) * step(abs(e.x), 1.02) * smoothstep(-0.2, 0.6, e.x);
  }
  float ink = max(fill(lashD, pe) * step(abs(e.x), 1.04), lashes);
  col = mix(col, vec3(0.012, 0.004, 0.0), ink);
  col += vec3(1.2, 0.7, 0.25) * citLine(lashD - pe * 1.5, pe, 1.0) * 0.5 * step(abs(e.x), 1.04);
  col += vec3(1.0, 0.6, 0.25) * citLine(e.y - yl, pe, 1.6) * step(abs(e.x), 1.0) * 0.8 * step(0.05, o);
  cover = max(cover, max(inE, ink));
  return vec4(col, cover);
}
#endif

#ifdef CIT_LOTUS
// ---------------------------------------------------------------- SAHASRARA: the thousand-
// petalled lotus. Five rings of almond petals (16 .. 48) with nested outlines, a second layer
// peeking between them; the rings open one after another on the 32nd roll (uLotusO).
uniform float uLotusO[5];
uniform vec2  uBlaze;     // the end of the push: x = colour (late), y = brightness (a steady rise to the cut)
uniform vec3  uFlood;     // the crown's light floods the frame: screen centre xy, amount
vec4 citLotus(vec2 w, vec2 c, float RL, float pxw) {
  vec2 d = w - c; float r = length(d) / RL; float a = citAtan(d.x, d.y);
  float pr = pxw / RL;
  const float R0 = 0.07, K = 1.70;                  // band edges R0 * K^m
  float m = clamp(floor(log(max(r, 1e-4) / R0) / log(K)), 0.0, 4.0);
  float e0 = R0 * pow(K, m), e1 = e0 * K;
  int mi = int(m);
  float g = uLotusO[mi];
  float np = 16.0 + 8.0 * m;
  float rc = 0.5 * (e0 + e1), h = 0.5 * (e1 - e0) * 1.04 * g;
  float spin = (mod(m, 2.0) * 2.0 - 1.0) * uTime * 0.12;
  vec2 pa = citPetalRing(r, a + spin, np, rc, max(h, 1e-4), 0.95, 0.0);
  vec2 pb = citPetalRing(r, a + spin, np, rc + 0.08 * h, max(h * 1.12, 1e-4), 0.95, 0.5);
  vec3 rc0 = m < 0.5 ? vec3(1.0, 0.90, 0.70) : m < 1.5 ? vec3(1.0, 0.70, 0.22) : m < 2.5 ? vec3(1.0, 0.32, 0.30) : m < 3.5 ? vec3(0.90, 0.18, 0.75) : vec3(0.42, 0.16, 1.0);
  // blazing: the same palette, saturated (cream -> gold, gold -> orange, coral -> red ...) and glowing
  if (uBlaze.x > 0.0) { vec3 c3 = rc0 * rc0 * rc0; rc0 = mix(rc0, (m < 0.5 ? c3 * c3 : c3) * 1.8, uBlaze.x); }
  float inA = fill(pa.x, pr) * step(0.001, g), inB = fill(pb.x, pr) * step(0.001, g);
  float dA = sat(-pa.x / pa.y), dB = sat(-pb.x / pb.y);
  vec3 col = vec3(0.0);
  // back layer (between the petals): darker
  col += rc0 * (0.03 + 0.18 * dB * dB) * inB + rc0 * 0.8 * citLine(pb.x, pr, 1.2) * step(0.001, g);
  float al = max(inA, inB * 0.9);
  // front petals: luminous along the midrib, nested outlines
  vec3 fa = rc0 * (0.05 + 0.55 * dA * dA) + rc0 * 0.9 * citIso(pa.x / (pa.y * 0.28), pr / (pa.y * 0.28), 1.0) * step(pa.x, 0.0) + rc0 * 0.6 * citLine(pa.x + pa.y * 0.0, pr, 1.0);
  col = mix(col, fa, inA);
  col += mix(rc0, vec3(1.0, 0.9, 0.7), 0.4 - 0.3 * uBlaze.x) * 1.8 * citLine(pa.x, pr, 1.6) * step(0.001, g);
  // the bindu and its rings. The bindu is a point: never more than ~0.05 screen units across,
  // however far the camera pushes in, so the dive ends in the burning lotus, not in a white disc
  float og = uLotusO[0];
  float rb = min(R0 * 0.4, 0.05 * pr / px());
  col += vec3(1.0, 0.85, 0.6) * citLine(r - R0, pr, 1.5) * og;
  col += vec3(2.4, 2.1, 1.6) * (fill(r - rb, pr) + exp(-r / (rb * 0.9)) * 0.6) * og;
  // blazing: a violet halo with fine rings in the seven chakra colours (the column flows into the crown)
  // (uniform branches: SwiftShader skips them while the blaze is off)
  if (uBlaze.x > 0.0) {
    float hr = r / R0 * 8.0 - 0.5;
    col += (citHot(6.0) * (1.3 + 0.6 * uBlaze.x) * exp(-r / (R0 * 0.8)) + citHot(clamp(floor(hr + 0.5) - 1.0, 0.0, 6.0)) * 1.8 * citIso(hr, pr / R0 * 8.0, 1.4) * step(1.0, hr) * step(hr, 7.5)) * uBlaze.x * og;
  }
  al = max(al, fill(r - R0, pr) * og);
  return vec4(col * (1.0 + 0.4 * uBlaze.y), al * step(r, 1.02));
}
#endif

void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float PX = px();
  // ---- panels: each has its own camera onto the same world
  vec4 cam = uCam;
  float pid = 1.0, gut = 0.0, edge = 0.0;
#ifdef CIT_PANELS
  {
#ifdef CIT_STRIPS
    float y1 = uGut.x + uGut.y * p.x, y2 = uGut.z + uGut.w * p.x;
    float d1 = (p.y - y1) / sqrt(1.0 + uGut.y * uGut.y), d2 = (p.y - y2) / sqrt(1.0 + uGut.w * uGut.w);
    pid = d1 > 0.0 ? 0.0 : d2 < 0.0 ? 2.0 : 1.0;
#else
    float x1 = uGut.x + uGut.y * p.y, x2 = uGut.z + uGut.w * p.y;
    float d1 = (p.x - x1) / sqrt(1.0 + uGut.y * uGut.y), d2 = (p.x - x2) / sqrt(1.0 + uGut.w * uGut.w);
    pid = d1 < 0.0 ? 0.0 : d2 > 0.0 ? 2.0 : 1.0;
#endif
    float dg = min(abs(d1), abs(d2));
    gut = 1.0 - smoothstep(uGutW - PX, uGutW + PX, dg);
    edge = citLine(dg - uGutW - 2.5 * PX, PX, 1.5);
    cam = pid < 0.5 ? uCam2 : pid > 1.5 ? uCam3 : uCam;
  }
#endif
  vec2 w = rot(cam.w) * p / cam.z + cam.xy;
  float pxw = PX / cam.z;
  vec3 col = citSky(p, w);
  {
    vec4 sn = citSun(w, pxw);
    col = col * (1.0 - sn.a) + sn.rgb;
  }
#ifdef CIT_MOUNTAIN
  {
    vec4 m = citMountain(w, pxw);
    col = col * (1.0 - m.a) + m.rgb;
  }
#endif
#ifdef CIT_LOTUS
  {
    vec4 lo = citLotus(w, uLotusP.xy, uLotusP.z, pxw);
    col = col * (1.0 - lo.a) + lo.rgb;
  }
#endif
#ifdef CIT_SPEED
  // re-rolled once a beat, frozen in reduced-flashing mode. Anti-strobe (spec 7.3 rule 1): a line is
  // on in at most 42 % of the rolls, so a pixel under one changes at most ~1.1 times a second, 0.04 a
  // frame, where moAntiStrobe leaves full contrast (per 16th it was 4.4 times a second, a strobe; per
  // 8th the dense fan of the C2b cut-in still flickered); their brightness follows the snare roll's
  // density, not its hits (JS)
  if (uSpeed > 0.0) col += vec3(1.0, 0.82, 0.5) * citSpeed(p, uSpeedC, 150.0, 0.85, floor(uBeat * (1.0 - uReduced)) + uSeed * 7.0) * uSpeed * 0.7;
#endif
  float ck[7];
  for (int i = 0; i < 7; i++) ck[i] = uCk[i];
  CitBody B = citBodyDefault();
  B.pos = uBodyP.xy; B.scale = uBodyP.z; B.arms = uBodyP.w;
  B.kh = uBodyQ.x; B.gold = uBodyQ.y; B.eye3 = uBodyQ.z; B.aura = uBodyQ.w;
  B.t = uTime; B.pulse = uKickAge * 3.0; B.frontI = uFrontI;
  vec2 q = (w - B.pos) / B.scale;
  float aq = pxw / B.scale;
#ifdef CIT_RIBBONS
  vec3 rb, rf;
  citRibbons(q, aq, rb, rf);
  col += rb * uRibbon;
#endif
  vec4 b = citBody(w, B, pxw, ck);
  col = col * (1.0 - b.a) + b.rgb * uBodyL;
#ifdef CIT_RIBBONS
  col += rf * uRibbon;
#endif
#ifdef CIT_COLUMN
  {
    // the seven chakras in one vertical rainbow column, on into the lotus
    float hx = abs(q.x);
    vec3 rc = chakraColor(clamp((q.y + 0.02) / 1.02 * 6.0, 0.0, 6.0));
    float span = smoothstep(-1.15, -0.9, q.y) * (1.0 - smoothstep(1.1, 1.3, q.y));
    float rungs = 0.0;
    for (int i = 0; i < 7; i++) { vec2 cp = chakraPos(i); rungs += exp(-length((q - cp) * vec2(1.0, 2.5)) / 0.022); }
    col = col * (1.0 - 0.5 * exp(-hx / 0.06) * span * sat(uColumn)) + (rc * (exp(-hx / 0.012) * 0.65 + exp(-hx / 0.05) * 0.16 + rungs * 0.45) + vec3(1.2, 1.1, 0.95) * citLine(q.x, aq, 1.2) * 0.45) * span * uColumn;
  }
#endif
#ifdef CIT_EYECU
  if (pid < 0.5) col = citEyeCU(p, uEyeP.xy, uEyeP.z, uEyeP.w, uEyeO, uIrA, uIrB, 1.0, PX).rgb;
#endif
#ifdef CIT_FACE
  {
    // the eye strip: two closed eyes (mirrored: one evaluation) and the third eye opening
    vec2 fp = p - uFaceP.xy;
    vec4 se = citEyeCU(vec2(abs(fp.x), fp.y), vec2(uFaceP.w, 0.0), uFaceP.z, 0.0, 0.0, vec3(0.4, 0.1, 0.0), vec3(1.4, 0.8, 0.2), 1.0, PX);
    vec4 te = citEyeCU(fp, vec2(0.0, 0.02), uEyeP.z, 1.5708, uEyeO, uIrA, uIrB, 0.0, PX);
    vec3 fc = mix(se.rgb, te.rgb, te.a);
    fc += uEyeGlow * exp(-length(fp * vec2(1.6, 0.8)) / (0.18 + 0.10 * uRamp)) * (0.5 + 1.3 * uRamp) * uEyeO;
    col = pid > 0.5 && pid < 1.5 ? fc : col;
  }
#endif
#ifdef CIT_PANELS
  col = mix(col, vec3(0.0), gut);
  col += vec3(1.0, 0.72, 0.3) * edge * 0.9;
#endif
  col = citBurst(col, p, uIgn.zw, uIgn.y, int(uIgn.x), uIgnS);
#ifdef CIT_LOTUS
  // The last ~0.3 s of the push run at up to ~1.7x zoom per frame, where the petal linework would
  // change completely every frame (a strobe). The crown's light floods the frame instead, in the
  // Sahasrara's colours (a white point in hot magenta, violet rim), so it blazes in colour up to
  // the hard cut into the gap: no cream wash. (A gold core mixes with the violet halo to peach.)
  if (uFlood.z > 0.0) {
    float fr = length(p - uFlood.xy);
    // energy in the dominant channels (magenta, violet); white only in a small point
    vec3 rad = mix(vec3(2.3, 0.30, 1.10), vec3(1.4, 0.06, 0.80), smoothstep(0.15, 0.85, fr));
    rad = mix(rad, vec3(0.50, 0.03, 1.30), smoothstep(0.8, 1.9, fr));
    col = mix(col, rad + vec3(2.0, 1.8, 1.5) * exp(-fr / 0.045), uFlood.z);
  }
#endif
  fragColor = vec4(col, 1.0);
}
`;

  // C5: the gap, under the overlay's full-screen RUBEDO insert: white-gold radiance (cheap)
  const WHITE = `
uniform mat2 uWRot;             // camera knob: roll / zoom (computed once, in JS)
uniform vec2 uWPan;             // camera knob: centre
uniform vec3 uWTint, uWRay;     // palette knob: the radiance and its rays
void main() {
  vec2 p = uWRot * uvCentered(gl_FragCoord.xy) + uWPan;
  float r = length(p), a = atan(p.y, p.x);
  float rays = pow(0.5 + 0.5 * cos(a * 32.0 + uTime * 0.6), 6.0);
  vec3 col = uWTint * (1.3 + 1.6 * exp(-r * 1.5)) + uWRay * rays * 0.5 * exp(-r * 0.6);
  fragColor = vec4(col, 1.0);
}`;

  // ======================================================================== shots (JS)
  // Every shot is a factory, MO.shot('citrinitas.<name>', (cue) => ...), that a cue of the score
  // (score.js "cues") places anywhere, at any length. Without a cue list the end of this file
  // places them at their 30 s windows, so that edit renders exactly as before.
  //
  // Clocks inside a shot (all relative to its cue):
  //   lt  real seconds since the choreography's start (the cue start minus params.offsetBeats):
  //       one-shot events at the start (ignitions, panel slide-ins, eyes opening, the lotus opening)
  //   pc  progress seconds, lt scaled by params.speed: camera moves and other motion that would run
  //       out. Past its natural end a move settles: it keeps the velocity it had and eases to rest
  //       (velocity-matched exponential, a fraction of the shot's length), never stopping dead
  //   pe  progress counted back from the cue end: builds into the next cut (C3b's ramp, C4's push
  //       and flood) stay anchored to the end, before them the shot holds its opening framing
  //   tm  motion time for continuous animation (uTime, sun rays, ribbons, yods): t at speed 1, seed 0
  // Kicks, the snare roll and the hats are read from the score at absolute t (MO.env / MO.last), so
  // pulses follow whatever the score plays under the cue.
  //
  // Params of every citrinitas shot (all optional, unknown keys ignored; all are uniforms, so every
  // cue of a shot shares one compiled program):
  //   offsetBeats  0..16                 start this far into the choreography (default 0)
  //   speed        0.25..4 | 'fit'       rate of motion and camera moves; 'fit' = natural length /
  //                                      cue length, so the moves span the cue (default 1)
  //   seed         0..99                 shifts animation phases and the scatter of the stars, the
  //                                      falling yods and the speed lines (default 0)
  //   zoom         0.5..2                camera zoom multiplier (default 1)
  //   pan          [x, y] scene units    camera offset; the frame is 2 units tall at zoom 1 (default [0, 0])
  //   roll         -45..45 degrees       camera roll, added (default 0)
  //   palette      'gold' | 'silver' | 'rose' | 'violet': the colour the body turns as the kundalini
  //                rises. gold (default); silver: it stays the moon-white body of ALBEDO under a
  //                whiter sun and a darker sky; rose: red-gold, a foretaste of RUBEDO, warmer sky;
  //                violet: Ajna's indigo, night sky
  //   dawn         -1..1                 added to the sky (0 indigo night .. 1 amber dawn) (default 0)
  //   body         'lit' | 'dark'        the luminous body, or a dark silhouette (default 'lit')
  //   chakraStart  0..7                  the chakra that ignites at the choreography's start; the ones
  //                                      below it are already lit (default: the shot's own, below)
  //   chakraEvery  0.25..16 beats        spacing of the ignitions (default 2)
  //   chakraCount  0..7                  how many ignite from chakraStart on (default: all the rest)
  //   chakras      'score' | [7 beats]   'score': the S.chakras beats inside the cue's score section;
  //                                      or one beat per chakra (root .. crown) from the choreography's
  //                                      start, null = never, negative = lit before the cue
  // A chakra flares when it ignites (a sakuga burst at its place on the body, its Mountain terrace
  // lights) and stays lit; the gold front in the body rises to the highest lit one. The root's red
  // colour wash ramps up over 0.3 s (spec 7.3 rule 6); in reduced mode every wash stays within 0.65
  // of its chakra. Speed lines re-roll once a beat and swell with the roll's density, never per hit.
  // Rule 7 (the build, 72-79, two cuts a bar against orrery.thieves): measured mean luminance (linear,
  // no overlay) of these shots is about 0.21-0.30 at their cuts; the ignition on each cue's first beat
  // lifts the first ~0.2 s, then it settles (see the build report for the per-cut numbers).
  const BEAT = MO.BEAT;
  const bt = (b) => b * BEAT;
  const CHY = [-0.02, 0.10, 0.25, 0.44, 0.665, 0.865, 1.0];
  const EO = MO.easeOut, EI = MO.easeIn, SM = MO.smooth, C = MO.clamp, mix = MO.mix;
  const R = () => (MO.reduced ? 0.3 : 1);
  const backOut = (x) => { x = C(x); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  // scene → screen with a 2D camera (inverse of w = rot(roll) * p / zoom + centre)
  function toScreen(w, cam) {
    const ux = w[0] - cam[0], uy = w[1] - cam[1], c = Math.cos(cam[3]), s = Math.sin(cam[3]);
    return [cam[2] * (c * ux - s * uy), cam[2] * (s * ux + c * uy)];
  }

  // palette presets: the body's gold (tint, aura tint, nerves), sky (dawn) and sun whiteness offsets
  const GOLD = [[1.0, 0.76, 0.34], [1.0, 0.34, 0.05], [1.7, 1.0, 0.32]];
  const PALETTES = {
    gold: { g: GOLD, dawn: 0, white: 0 },
    silver: { g: [[0.80, 0.93, 1.0], [0.50, 0.42, 1.0], [0.22, 0.55, 1.7]], dawn: -0.3, white: 0.5 },
    rose: { g: [[1.0, 0.50, 0.44], [1.0, 0.07, 0.10], [1.8, 0.32, 0.36]], dawn: 0.12, white: 0 },
    violet: { g: [[0.78, 0.62, 1.0], [0.45, 0.10, 1.0], [1.0, 0.45, 1.8]], dawn: -0.4, white: 0.2 },
  };
  // iris presets [outer, inner]: the close-up eye of C3a, the third eye of C3b (and its light)
  const IRIS = {
    gold: [[0.45, 0.10, 0.005], [1.5, 0.85, 0.22]],
    violet: [[0.16, 0.04, 0.55], [0.95, 0.65, 1.6]],
    green: [[0.02, 0.30, 0.06], [0.55, 1.5, 0.35]],
    blue: [[0.02, 0.12, 0.55], [0.40, 1.0, 1.7]],
    red: [[0.50, 0.02, 0.02], [1.7, 0.45, 0.20]],
  };
  const GLOW = { gold: [1.0, 0.62, 0.20], violet: [0.55, 0.30, 1.0], green: [0.30, 1.0, 0.35], blue: [0.25, 0.55, 1.0], red: [1.0, 0.25, 0.15] };

  // the real time of the latest S.chakras entry for chakra i (list position mod 7) inside the score
  // section that holds the cue and before the cue end
  function scoreIgnitions(cue) {
    const sec = MO.section(cue.from + 1e-4);
    const a = sec ? sec.bars[0] * MO.BAR : 0;
    const ign = [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity];
    MO.S.chakras.forEach((c, j) => { const t = bt(c.beat); if (t >= a - 1e-6 && t < cue.to) ign[j % 7] = ign[j % 7] === Infinity ? t : Math.max(ign[j % 7], t); });
    return ign;
  }

  // the roll hits in [t0, t1): the ratchet that steps a push forward on each of them (null: none)
  function ratchetWindow(t0, t1) {
    let n = 0;
    for (const e of MO.events.roll) if (e.t >= t0 - 1e-6 && e.t < t1 - 1e-6) n++;
    const l0 = MO.last('roll', t0 - 1e-4);
    return n > 0 ? { t0, n, i0: l0 ? l0.i : -1 } : null;
  }
  // progress through the window locked to the snare roll: an eased 50 ms step forward on each hit,
  // never back (a back-and-forth throb makes fine linework flicker at 9 Hz)
  const ratchet = (tr, W) => {
    const rl = MO.last('roll', tr);
    if (!rl || rl.e.t < W.t0) return 0;
    return C((rl.i - W.i0 - 1 + EO((tr - rl.e.t) / 0.05)) / W.n);
  };

  // everything a shot needs to know about its cue, computed once per cue
  function cueContext(cue, sh) {
    const P = cue.params || {};
    const natB = sh.nat[1] - sh.nat[0];
    const cueB = cue.beat1 - cue.beat0;
    const speed = P.speed === 'fit' ? C(natB / Math.max(cueB, 1e-3), 0.25, 4) : C(num(P.speed, 1), 0.25, 4);
    const off = C(num(P.offsetBeats, 0), 0, 64);
    const vb0 = cue.beat0 - off;
    const seed = C(num(P.seed, 0), 0, 99);
    const X = {
      P, cue, from: cue.from, to: cue.to, speed, off, vb0, seed,
      L: bt(sh.nat[1]) - bt(sh.nat[0]),      // natural length (s)
      ev: (b) => bt(vb0 + b),                // a start-anchored event b beats into the choreography
    };
    X.pc = (t) => off * BEAT + (t - X.from) * speed;
    X.rt = (x) => X.from + (x - off * BEAT) / speed;
    X.pe = (t) => X.L - (X.to - t) * speed;
    X.tmOn = speed !== 1 || seed !== 0;
    X.tm = (t) => (X.tmOn ? X.from + (t - X.from) * speed + seed * 7.31 : t);
    // camera knob
    const zoom = C(num(P.zoom, 1), 0.5, 2), roll = C(num(P.roll, 0), -45, 45) * Math.PI / 180;
    const pan = Array.isArray(P.pan) ? [num(P.pan[0], 0), num(P.pan[1], 0)] : [0, 0];
    const camOn = zoom !== 1 || roll !== 0 || pan[0] !== 0 || pan[1] !== 0;
    X.cam = (cam, panK = 1) => (camOn ? [cam[0] + pan[0] * panK, cam[1] + pan[1] * panK, cam[2] * zoom, cam[3] + roll] : cam);
    // palette, sky, body, iris
    const pal = PALETTES[P.palette] || PALETTES.gold;
    X.gold = pal.g;
    X.dawn = C(num(P.dawn, 0), -1, 1) + pal.dawn;
    X.white = pal.white;
    X.bodyL = P.body === 'dark' ? 0.15 : 1;
    const iris = IRIS[P.iris] ? P.iris : sh.iris;
    X.iris = IRIS[iris]; X.glow = GLOW[iris];
    // chakra ignitions (absolute seconds; Infinity = never)
    if (P.chakras === 'score') X.ign = scoreIgnitions(cue);
    else if (Array.isArray(P.chakras)) X.ign = [0, 1, 2, 3, 4, 5, 6].map((i) => (typeof P.chakras[i] === 'number' && Number.isFinite(P.chakras[i]) ? bt(vb0 + P.chakras[i]) : Infinity));
    else {
      const s = Math.round(C(num(P.chakraStart, sh.ch0), 0, 7));
      const every = C(num(P.chakraEvery, 2), 0.25, 16);
      const n = Math.round(C(num(P.chakraCount, 7 - s), 0, 7));
      X.ign = [0, 1, 2, 3, 4, 5, 6].map((i) => (i < s + n ? bt(vb0 + (i - s) * every) : Infinity));
    }
    return X;
  }

  // f at progress x; past x1, f keeps the velocity it had just before x1 and eases to rest with time
  // constant tau (s). f(x, tr) gets the real time tr of that progress for its score lookups.
  function settle(f, x, x1, tau, t, X) {
    if (x <= x1) return f(x, t);
    const h = Math.min(0.02, 0.25 * tau, 0.5 * x1);
    const a = f(x1, X.rt(x1)), b = f(x1 - h, X.rt(x1 - h)), e = tau * (1 - Math.exp(-(x - x1) / tau)) / h;
    return a.map((v, i) => v + (v - b[i]) * e);
  }

  // chakras: lit after their ignition, flaring at it, ticking with the kick and the roll
  function chakraState(t, ign, kickE, rollE) {
    let last = -1, recent = -1, rAge = Infinity;
    const ck = [], terr = [];
    for (let i = 0; i < 7; i++) {
      const age = t - ign[i];
      if (age >= 0) { last = i; if (age <= rAge) { rAge = age; recent = i; } }
      ck[i] = age >= 0 ? 1 + 1.0 * Math.exp(-age / 0.22) * R() + 0.35 * kickE + 0.3 * rollE : 0;
      terr[i] = age >= 0 ? 0.55 + 1.4 * Math.exp(-age / 0.3) + 0.25 * kickE : 0;
    }
    let kh = -1.2, frontI = 0.4;
    if (last >= 0) {
      const prev = last > 0 ? CHY[last - 1] + 0.04 : -1.12;
      kh = mix(prev, CHY[last] + 0.04, EO((t - ign[last]) / 0.32));
      // the molten front is bright while it rises to the new chakra, then rests dimmer
      frontI = 0.4 + 0.6 * Math.exp(-(t - ign[last]) / 0.3);
    }
    // the burst belongs to the most recent ignition
    return { ck, terr, last, recent, kh, frontI, ignAge: recent >= 0 ? t - ign[recent] : -1 };
  }

  const baseState = () => ({
    cam: [0, 0, 1, 0], cam2: [0, 0, 1, 0], cam3: [0, 0, 1, 0], igS: 0,
    body: [0, -0.4, 0.4, 0], gold: 0, eye3: 0, aura: 1.0,
    sun: [0, 0.5, 0.3, 1], sun2: [0, 0, 1.6, 1], mount: [0, -1.3, 0.85, 0],
    dawn: 0.5, speed: 0, speedC: [0, 0], ribbon: 0, ramp: 0, blaze: [0, 0], flood: [0, 0, 0],
    gutA: [-9, 0, 9, 0], gutW: 0.03, eyeP: [-1.2, 0, 0.5, 0], eyeO: 0,
    lotus: [0, 1.12, 0.5, 0], column: 0, sunDark: 0, chakS: 1.45, lotusO: [0, 0, 0, 0, 0], auraOcc: 0, faceP: [0, 0, 0.3, 1],
  });

  // ------------------------------------------------------------------ C1: THE HOLY MOUNTAIN
  // citrinitas.c1. Natural length 4 beats (1 bar). Wide on the Mountain; the figure climbs the
  // central stair a step per beat while the camera rises from rest and pushes in, the sun rises,
  // the sky goes from night to amber dawn. Root ignites at the start, sacral 2 beats in.
  // Longer: the climb, the rise, the push, the sun and the dawn settle (ease to rest over ~2 s);
  // flames, falling yods, sun rays, the Providence eye's blink and the kick nudge go on; further
  // chakras ignite every chakraEvery beats (chakraCount: 2 keeps it to root and sacral). Shorter:
  // cut early. speed < 1 slows the climb and the push (still a step per kick at speed 1/2, 1/4).
  // Default chakraStart 0.
  function c1(t, X, st, kickE, rollE) {
    const s = baseState();
    const pc = X.pc(t);
    s.mount = [0, -1.40, 1.0, 0];
    // start from rest (the frame must not scroll under a decaying flash on the cut), then rise and
    // push all the way to the natural end, still moving there
    const f = (x) => {
      const k = x / X.L;
      const mv = 0.5 * SM(k) + 0.5 * k * k;
      const beat = x / BEAT;
      const climb = 0.8 * (Math.floor(beat) + EO(C((beat % 1) * 3.0))) + 0.2 * beat;   // a step per kick + a steady ascent
      return [mix(-0.30, 0.10, mv), 0.95 + 0.10 * mv, -0.62 + 0.10 * climb, 0.08 * SM(k), 0.40 * (1 - 0.5 * k - 0.5 * EO(k)), 0.15 + 0.7 * SM(k)];
    };
    const m = settle(f, pc, X.L, 0.35 * X.L, t, X);
    s.cam = X.cam([0, m[0], m[1] * (1 + 0.01 * kickE * R()), 0]);
    s.body = [0, m[2], 0.40, m[3]];
    const top = s.mount[1] + 1.4494 * s.mount[2];
    const eyeY = top + (0.30 + 0.24) * s.mount[2];
    s.sun = [0, eyeY - m[4], 0.26, 1];
    s.sun2 = [X.tm(t) * 0.10, 0, 1.55 + 0.15 * kickE, 1];
    s.dawn = m[5];
    return s;
  }

  // ------------------------------------------------------------------ C2: HENSHIN
  // citrinitas.c2. Natural length 4 beats. C2a (2 beats): medium on the torso, rolling one way,
  // ribbons spiralling up the body, the solar plexus ignites; C2b: a cut-in on the heart ignition,
  // dutch angle rolling back, slow push, a calmer frame. The internal cut happens on the heart's
  // ignition (2 beats in by default); params.cut: beats from the cue start, or 'a' / 'b' to hold
  // one framing for the whole cue. If the heart is already lit at the start the cue is all C2b, if
  // it never ignites in the cue, all C2a.
  // Longer: each framing's roll and push settle; ribbons, rays and speed lines go on, further
  // chakras ignite. Shorter: cut early (a 2-beat cue is C2a alone). Default chakraStart 2.
  // Own params: ribbons 0..2 (ribbon brightness, default 1), cut (above).
  function c2(t, X, st, kickE, rollE) {
    const s = baseState();
    const pc = X.pc(t);
    const kk = pc / X.L;
    const inA = t < X.cut;
    s.body = [0, -0.45, 1.25, inA ? 0.10 + 0.15 * SM(kk * 2) : 0.08];
    const heart = [0, s.body[1] + 0.44 * s.body[2]];
    if (inA) {
      // C2a: medium, rolling one way, the solar plexus ignites (still moving at the cut)
      const fA = (x) => { const k2 = x / X.LA; const m2 = 0.5 * k2 + 0.5 * SM(k2); return [heart[1] - 0.06 + 0.06 * m2, 1.0 + 0.10 * m2, -0.18 + 0.22 * m2]; };
      const m = settle(fA, pc, X.LA, 0.5 * X.LA, t, X);
      s.cam = X.cam([0, m[0], m[1], m[2] * R()]);
    } else {
      // C2b: cut in on the heart ignition, dutch angle rolling back, slow push
      const fB = (x) => { const k2 = x / X.LB; return [heart[1] + 0.02, 1.45 + 0.25 * (0.5 * k2 + 0.5 * EO(k2)), 0.24 - 0.18 * k2]; };
      const m = settle(fB, (t - X.cut) * X.speed, X.LB, 0.5 * X.LB, t, X);
      s.cam = X.cam([0, m[0], m[1], m[2] * R()]);
    }
    const rosette = inA ? 1 : 0.15;
    // C2b: a calmer frame after the heart ignites, so the chakra column is the brightest thing
    // in it (sun ring, aura and ribbons dimmed, fewer speed lines)
    const calm = inA ? 0 : 1;
    s.sun = [0, heart[1] + 0.15, 0.78, 1 - 0.3 * calm]; s.sunDark = 1;
    s.sun2 = [-X.tm(t) * 0.22, 0, 1.25 + 0.12 * kickE, rosette];
    s.dawn = 0.6;
    s.speed = (0.2 + 0.5 * X.rollS(t) + 0.9 * (st.ignAge >= 0 ? Math.exp(-st.ignAge / 0.3) : 0) + 0.1 * calm) * R();
    s.speedC = toScreen(heart, s.cam);
    s.ribbon = SM((t - X.ev(0)) / 0.3) * (1 - 0.45 * calm) * X.ribbons;
    s.aura = 1.15 - 0.35 * calm;
    return s;
  }

  // ------------------------------------------------------------------ C3a: MANGA PANELS
  // citrinitas.c3a. Natural length 2 beats. A manga triptych over the figure on the summit:
  // left the awakened eye (close-up), centre the throat ignites, right the Mountain. The side
  // panels slide in on the off-beat 8th and the dotted 16th after it (0.5 and 0.875 beats in);
  // every panel pushes in, accelerating, ratcheting forward on each snare-roll hit (smoothly if
  // the score has no roll under the cue, and in reduced-motion mode).
  // Longer: the slide-ins stay at the start; the push settles after its natural length; speed
  // lines, gutter pulse and rays go on. Shorter: cut early. Default chakraStart 4 (throat).
  // Own params: iris 'gold' (default) | 'violet' | 'green' | 'blue' | 'red': the close-up eye's iris.
  function c3a(t, X, st, kickE, rollE) {
    const s = baseState();
    const pc = X.pc(t);
    s.body = [0, 0, 1, 0.3];
    s.mount = [0, -1.0 - 1.4494 * 3.0, 3.0, 0];
    s.sun = [0, 0.95, 1.05, 1]; s.sunDark = 1;
    s.sun2 = [X.tm(t) * 0.2, 0.15, 1.3 + 0.12 * kickE, 1];
    s.dawn = 0.75;
    const f = (x, tr) => {
      const k = x / X.L;
      const P = MO.reduced || !X.ratchet ? k : 0.4 * k + 0.6 * ratchet(tr, X.ratchet);
      return [0.62 + 0.05 * k, 1.75 * Math.exp(0.34 * P * (0.6 + 0.4 * P)), -0.04 - 0.05 * k,
        -2.2 + 0.15 * k + 0.35 * k * k, 0.24 * (1 + 0.30 * EI(P)), 0.03 * k, 0.50 * (1 + 0.12 * P)];
    };
    const m = settle(f, pc, X.L, 0.3 * X.L, t, X);
    s.cam = X.cam([0, m[0], m[1], m[2] * R()]);
    s.cam3 = X.cam([-5.6, m[3], m[4], 0]);
    const tL = X.ev(0.5), tR = X.ev(0.875);
    const inL = backOut((t - tL) / 0.16), inR = backOut((t - tR) / 0.16);
    s.gutA = [mix(-3.2, -0.62, inL), 0.32, mix(3.4, 0.66, inR), 0.26];
    s.gutW = 0.034 * (1 + 0.3 * rollE * R());
    s.eyeP = [mix(-3.0, -1.24, inL) + m[5], 0.02, m[6], -0.10];
    s.eyeO = EO((t - tL - 0.08) / 0.18);
    s.speed = (0.7 + 0.5 * X.rollS(t)) * R();
    s.speedC = toScreen([0, 0.665], s.cam);
    s.aura = 1.2;
    return s;
  }

  // ------------------------------------------------------------------ C3b: THE EYE STRIP
  // citrinitas.c3b. Natural length 2 beats. The face in a strip between two black gutters, the
  // third eye opens; above it the crown and the sun, below the column of lit chakras. Everything
  // accelerates into the crown: the strips push in faster and faster (ratcheting on the roll), the
  // sun whitens, the third eye's light grows, the face trembles with the roll.
  // The strips slide in and the third eye opens at the start; the build (ramp, push, whitening)
  // is anchored to the cue END, so it always peaks on the cut into C4. Longer: the strip holds its
  // opening framing (rays, contour flow, speed lines and the roll tremble go on) until the last
  // 2 beats; speed: 'fit' spreads the build over the whole cue. Shorter: the build starts part-way.
  // Default chakraStart 5 (third eye).
  // Own params: iris 'violet' (default) | 'gold' | 'green' | 'blue' | 'red': the third eye's iris and light.
  function c3b(t, X, st, kickE, rollE) {
    const s = baseState();
    let k = C(X.pe(t) / X.L);
    // a build that starts mid-cue (the cue is longer than the build) starts from rest
    if (X.lateBuild) k = (k < 0.3 ? k * k / 0.6 : k - 0.15) / 0.85;
    s.body = [0, 0, 1, 0.4];
    s.mount = [0, -1.0 - 1.4494 * 3.0, 3.0, 0];
    s.ramp = EI(k);
    const P = EI(MO.reduced || !X.ratchet ? k : 0.4 * k + 0.6 * ratchet(t, X.ratchet));
    s.sun = [0, 1.05, 0.62, 1 + 0.6 * s.ramp]; s.sunDark = 1;
    s.sun2 = [-X.tm(t) * 0.3, 0.3 + 0.5 * s.ramp, 1.4 + 0.15 * kickE + 0.4 * s.ramp, 1];
    s.dawn = 0.85 + 0.15 * s.ramp;
    const rl = MO.last('roll', t), rn = rl ? rl.i : 0;
    const jx = MO.reduced ? 0 : 0.004 * rollE * Math.sin(rn * 2.39), jy = MO.reduced ? 0 : 0.004 * rollE * Math.cos(rn * 1.71);
    s.cam = X.cam([0, 0.86, 6.6 + 0.8 * k, 0.0]);
    s.cam2 = X.cam([0, 0.95 + 0.10 * P, (1.25 + 0.15 * k) * (1 + 0.5 * P), 0.03 + 0.05 * k]);
    s.cam3 = X.cam([0, 0.30 - 0.10 * P, (1.35 + 0.15 * k) * (1 + 0.5 * P), -0.03 - 0.05 * k]);
    const t0 = X.ev(0);
    const sIn = backOut((t - t0) / 0.14);
    s.gutA = [mix(1.6, 0.40, sIn), -0.07, mix(-1.6, -0.44, sIn), -0.07];
    s.gutW = 0.034 * (1 + 0.3 * rollE * R());
    s.eye3 = EO((t - t0) / 0.22);
    const push = 1 + 0.06 * k + 0.5 * P;
    s.faceP = [jx, jy, 0.36 * push, 0.98 * push]; s.igS = 1.5;
    s.eyeP = [0, 0, 0.42 * push, 0];
    s.eyeO = EO((t - t0 - 0.03) / 0.2);
    s.speed = (0.7 + 0.5 * X.rollS(t) + 0.4 * s.ramp) * R();
    s.speedC = toScreen([0, 0.873], s.cam);
    s.aura = 1.25;
    return s;
  }

  // ------------------------------------------------------------------ C4: SAHASRARA
  // citrinitas.c4. Natural length 2 beats. Arms raised, the seven chakras blaze in a rainbow
  // column, the thousand-petalled lotus opens above the head, the sun goes white-gold, then an
  // extreme push into the lotus, whose light floods the frame in magenta and violet up to the hard
  // cut (into the gap / the RUBEDO insert). The 32nd-note roll reads as a steady buzz here.
  // The lotus opening, the column, the sun's whitening and the body turning gold are anchored to
  // the start; the push, the blaze and the flood to the cue END (they always end on the cut).
  // Longer: wide on the figure with the lotus open until the last 2 beats (lotus spin, rays, yods,
  // speed lines go on); speed: 'fit' spreads the push over the cue. Shorter: the push starts
  // part-way. Default chakraStart 6 (crown).
  // Own params: push true (default) | false: no push and no flood, a held tableau (the colour still
  // saturates toward the end).
  function c4(t, X, st, kickE, rollE) {
    const s = baseState();
    const kS = (t - X.ev(0)) / X.L;   // start-anchored (real time)
    const kE = X.pe(t) / X.L;         // end-anchored (speed-scaled)
    s.body = [0, -0.40, 0.62, 1.0];
    const crown = [0, s.body[1] + 1.14 * s.body[2]];
    // a steep ease-in (x^4): the lotus stays readable until ~0.7 of the way and the fastest part
    // of the push happens under the crown's light flood (see main), where it cannot strobe
    const zk = X.push ? Math.pow(C((kE - 0.10) / 0.90), 4) : 0;
    const z = 0.80 * Math.exp(Math.log(24) * zk);
    const pk = C(zk * 1.7);
    s.cam = X.cam([0, mix(0.05, crown[1], pk), z, 0], 1 - pk);
    s.sun = [0, crown[1], 0.92, 1]; s.sunDark = 1;
    s.sun2 = [X.tm(t) * 0.3, 0.55 + 0.45 * C(kS * 2), 2.6, 0];
    s.lotus = [crown[0], crown[1], 1.0, 0];
    const t0 = X.ev(0);
    s.lotusO = [0, 1, 2, 3, 4].map((m) => backOut((t - t0 - 0.03 - m * 0.055) / 0.17));
    // colour saturates late (keeps the lotus as it is until ~0.7); the light rises steadily from
    // ~0.3, so the push trends brighter instead of flickering both ways
    s.blaze = [EI(C((kE - 0.4) / 0.6)), C((kE - 0.3) / 0.7)];
    s.flood = [...toScreen(crown, s.cam), X.push ? 0.85 * SM(C((kE - 0.64) / 0.36)) : 0];
    s.column = SM(kS / 0.12) * (1 + 0.3 * rollE);
    s.chakS = 1.6; s.auraOcc = 0.75;
    s.dawn = 0.3; s.gold = SM(kS / 0.4);
    s.eye3 = 1; s.aura = 1.4;
    s.speed = (0.4 + 0.5 * rollE) * R(); s.speedC = toScreen(crown, s.cam);
    s.speed *= C(1 - s.flood[2] / 0.5);   // the speed lines go under the flood (and their cost with them)
    return s;
  }

  // the snare roll's density in the bar holding t (hits / 16, at most 1) x 0.45, the mean of its
  // per-hit envelope at 16ths: what the speed lines follow (spec 7.3 rule 1: pulsing them on every
  // hit of an 8th or 16th roll flickered the dense fans at 4.5-9 Hz)
  function rollDensity(t) {
    const b0 = Math.floor(t / MO.BAR + 1e-6) * MO.BAR;
    let n = 0;
    for (const e of MO.events.roll) { if (e.t >= b0 + MO.BAR - 1e-6) break; if (e.t >= b0 - 1e-6) n++; }
    return 0.45 * Math.min(1, n / 16);
  }

  // the uniforms of a C1..C4 frame
  function sceneUniforms(t, X, fn) {
    const kick = MO.last('kick', t);
    const kickE = MO.env('kick', t, 0.12);
    // the 32nd-note roll of C4 (18 Hz) would alias at 30 fps into frame-alternating pulses: there
    // it reads as a steady buzz instead of per-hit pulses
    const rollE = X.buzz ? 0.6 : MO.env('roll', t, 0.06);
    const st = chakraState(t, X.ign, kickE, rollE);
    const s = fn(t, X, st, kickE, rollE);
    if (X.dawn !== 0) s.dawn = C(s.dawn + X.dawn);
    if (X.white !== 0) s.sun2[1] = C(s.sun2[1] + X.white);
    const u = {};
    u.uKickAge = kick ? t - kick.e.t : 9;
    u.uRollP = rollE;
    u.uCk = st.ck; u.uTerr = st.terr;
    u.uCam = s.cam; u.uCam2 = s.cam2; u.uCam3 = s.cam3;
    u.uBodyP = s.body; u.uBodyQ = [st.kh, s.gold, s.eye3, s.aura];
    const i = st.recent;
    const ig = i >= 0 ? toScreen([s.body[0], s.body[1] + CHY[i] * s.body[2]], s.cam) : [0, 0];
    u.uIgn = [Math.max(i, 0), st.ignAge, ig[0], ig[1]];
    u.uIgnS = s.igS || s.body[2] * s.cam[2];
    u.uSun = s.sun; u.uSun2 = s.sun2; u.uMount = s.mount; u.uDawn = s.dawn;
    u.uSpeed = s.speed; u.uSpeedC = s.speedC; u.uRibbon = s.ribbon; u.uFrontI = st.frontI; u.uRamp = s.ramp; u.uBlaze = s.blaze; u.uFlood = s.flood;
    u.uGut = s.gutA; u.uGutW = s.gutW; u.uEyeP = s.eyeP; u.uEyeO = s.eyeO;
    u.uLotusP = s.lotus; u.uColumn = s.column; u.uSunDark = s.sunDark; u.uChakS = s.chakS; u.uLotusO = s.lotusO; u.uAuraOcc = s.auraOcc; u.uFaceP = s.faceP;
    // knobs (always set: a program shared by several cues starts each scene from zeroed uniforms)
    u.uGTint = X.gold[0]; u.uGTint2 = X.gold[1]; u.uGNerve = X.gold[2];
    u.uBodyL = X.bodyL; u.uIrA = X.iris[0]; u.uIrB = X.iris[1]; u.uEyeGlow = X.glow; u.uSeed = X.seed;
    if (X.tmOn) u.uTime = X.tm(t);
    return u;
  }

  // ------------------------------------------------------------------ C5: THE GAP
  // citrinitas.c5. Natural length 2 beats. White-gold radiance with slowly turning rays, under the
  // overlay's full-screen RUBEDO insert in the gap (cheap: one short shader). Any length: the rays
  // keep turning. Own params: palette 'gold' (default) | 'white' | 'rose' | 'violet' (the radiance
  // and its rays); speed (ray rotation); seed (ray phase); zoom, pan [x, y] (screen units), roll.
  const WHITE_PAL = {
    gold: [[1.0, 0.86, 0.58], [1.0, 0.7, 0.3]], white: [[1.0, 0.97, 0.92], [1.0, 0.9, 0.75]],
    rose: [[1.0, 0.50, 0.46], [1.0, 0.25, 0.22]], violet: [[0.72, 0.50, 1.0], [0.55, 0.25, 1.0]],
  };
  function whiteUniforms(t, X) {
    const P = X.P;
    const pal = WHITE_PAL[P.palette] || WHITE_PAL.gold;
    const pan = Array.isArray(P.pan) ? [num(P.pan[0], 0), num(P.pan[1], 0)] : [0, 0];
    const z = C(num(P.zoom, 1), 0.5, 2), a = C(num(P.roll, 0), -45, 45) * Math.PI / 180;
    const c = Math.cos(a) / z, s = Math.sin(a) / z;
    // column-major: p = rot(roll) * uv / zoom, as rot() in lib.js
    const u = { uWRot: [c, -s, s, c], uWPan: pan, uWTint: pal[0], uWRay: pal[1] };
    if (X.tmOn) u.uTime = X.tm(t);
    return u;
  }

  // ------------------------------------------------------------------ registry
  // nat: the shot's window in the 30 s piece (beats); ch0: the chakra igniting at its start;
  // cost (SwiftShader, 640x360, frame ms min of runs): see the notes in the inventory
  const SHOTS = {
    c1: { nat: [32, 36], ch0: 0, fn: c1, defs: ['CIT_MOUNTAIN', 'CIT_BRAZIERS', 'CIT_PROVIDENCE', 'CIT_NERVES', 'CIT_YODS'] },
    c2: { nat: [36, 40], ch0: 2, fn: c2, defs: ['CIT_NIGHT', 'CIT_SPEED', 'CIT_RIBBONS', 'CIT_BONES', 'CIT_NERVES', 'CIT_YODS'] },
    c3a: { nat: [40, 42], ch0: 4, fn: c3a, iris: 'gold', defs: ['CIT_NIGHT', 'CIT_PANELS', 'CIT_MOUNTAIN', 'CIT_EYECU', 'CIT_SPEED', 'CIT_BONES', 'CIT_NERVES'] },
    c3b: { nat: [42, 44], ch0: 5, fn: c3b, iris: 'violet', defs: ['CIT_NIGHT', 'CIT_PANELS', 'CIT_STRIPS', 'CIT_FACE', 'CIT_EYE3', 'CIT_SPEED'] },
    c4: { nat: [44, 46], ch0: 6, fn: c4, buzz: true, defs: ['CIT_NIGHT', 'CIT_LOTUS', 'CIT_COLUMN', 'CIT_EYE3', 'CIT_SPEED', 'CIT_YODS'] },
    c5: { nat: [46, 48], ch0: 7 },
  };
  for (const name in SHOTS) {
    const sh = SHOTS[name];
    if (sh.defs) sh.fs = sh.defs.map((d) => `#define ${d}\n`).join('') + BODY + SCENE;
    sh.iris = sh.iris || 'gold';
    MO.shot('citrinitas.' + name, (cue) => {
      const X = cueContext(cue, sh);
      const id = 'citrinitas-' + name + (Array.isArray(MO.S.cues) ? '@' + cue.index : '');
      if (!sh.fn) {
        MO.scene({ id, fs: WHITE, uniforms: (t) => whiteUniforms(t, X), bloom: 0.5, vignette: 0.2 });
        return;
      }
      X.buzz = !!sh.buzz;
      X.rollS = X.buzz ? () => 0.6 : rollDensity;
      X.ribbons = C(num(X.P.ribbons, 1), 0, 2);
      X.push = X.P.push !== false;
      if (name === 'c2') {
        // the cut-in (C2a -> C2b) lands on the heart's ignition
        X.LA = bt(38) - bt(36); X.LB = bt(40) - bt(38);
        const P = X.P, h = X.ign[3];
        X.cut = P.cut === 'a' || P.cut === false ? Infinity : P.cut === 'b' ? X.from
          : typeof P.cut === 'number' ? bt(cue.beat0 + P.cut) : h < X.to ? h : Infinity;
      }
      if (name === 'c3a') X.ratchet = ratchetWindow(X.ev(0), X.ev(0) + X.L / X.speed);
      if (name === 'c3b') { X.ratchet = ratchetWindow(X.to - X.L / X.speed, X.to); X.lateBuild = X.to - X.from > X.L / X.speed + 1e-6; }
      MO.scene({ id, fs: sh.fs, uniforms: (t) => sceneUniforms(t, X, sh.fn), bloom: 0.38, vignette: 0.42 });
    });
  }

  // without a cue list: the 30 s edit (and the regression test of this refactor)
  if (!Array.isArray(MO.S.cues)) for (const name in SHOTS) MO.runShot(MO.makeCue('citrinitas.' + name, SHOTS[name].nat[0], SHOTS[name].nat[1]));
})();
