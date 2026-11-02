// CITRINITAS — XIX The Sun — 14.118–21.176 s (bars 8–11, beats 32–48). Owner: citrinitas agent.
// The build-up: the luminous body of ALBEDO climbs the Holy Mountain and turns to gold as its
// seven chakras ignite, one every two beats (score.js → chakras), each a sakuga event.
//
// C1  beats 32–36  THE HOLY MOUNTAIN: frontal stepped golden ziggurat (vermilion / ultramarine
//                  friezes), the athanor tower and the eye in the triangle on the summit, the Tarot
//                  XIX sun rising behind it. The figure climbs the central stair on the kicks.
//                  Root (32) and sacral (34) ignite; each lights its terrace of the mountain.
// C2  beats 36–40  HENSHIN: closer on the torso, camera rolling; sunburst from the heart, speed
//                  lines, light ribbons spiralling up the body. Solar plexus (36), heart (38).
// C3  beats 40–44  MANGA PANELS: diagonal cut-ins with thick black gutters (the eye with the sun
//                  in it, the throat, the mountain), then the eye strip: the third eye opens.
//                  Throat (40), third eye (42). Speed lines tick with the 16th / 32nd roll.
// C4  beats 44–46  SAHASRARA: arms raised, the seven chakras blaze in a rainbow column, the
//                  thousand-petalled lotus opens above the head, the sun goes white-gold,
//                  extreme push-in into the lotus.
// C5  beats 46–48  white-gold under the overlay's full-screen RUBEDO insert.
//
// The luminous body is copied from scenes/albedo.js (prefix alb → cit) so the figure is the
// same being; here the gold rises through it from the feet with the kundalini (ida, pingala
// and sushumna light up to the highest lit chakra; a molten front separates gold from silver).
// SwiftShader cost ~ pixels x code size, so every shot is its own shader with #defines and the
// body is evaluated exactly once per pixel.
(() => {
  const BODY = `
// ===================================================================== THE LUMINOUS BODY
// (from albedo.js, Sacred Mirrors) + the rising gold. Body space: feet y = -1, crown y = +1.
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
  vec3  tint, tint2, nerveCol;      // silver (albedo) colours
  vec3  gTint, gTint2, gNerve;      // gold colours
};

CitBody citBodyDefault() {
  CitBody B;
  B.pos = vec2(0.0); B.scale = 0.86; B.arms = 0.0;
  B.aura = 1.0; B.lines = 1.0; B.nerves = 1.0; B.pulse = -1.0;
  B.eye3 = 0.0; B.t = 0.0; B.kh = -1.2; B.gold = 0.0;
  B.tint = vec3(0.80, 0.93, 1.0); B.tint2 = vec3(0.50, 0.42, 1.0); B.nerveCol = vec3(0.22, 0.55, 1.7);
  B.gTint = vec3(1.0, 0.76, 0.34); B.gTint2 = vec3(1.0, 0.34, 0.05); B.gNerve = vec3(1.7, 1.0, 0.32);
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

// a chakra mandala: unlit (silver, small) .. lit (its colour, larger, pointed lotus petals with
// nested contours, turning)
vec3 citChakra(vec2 q, int i, float lit, float aa, float t) {
  vec2 c = chakraPos(i);
  float L = sat(lit);
  float r = (i == 6 ? 0.034 : (i == 5 ? 0.02 : 0.025)) * (1.0 + 0.45 * L);
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
  float fa = abs(fract((a + sp) / TAU * np + 0.5) - 0.5) * 2.0;          // 0 petal axis .. 1 gap
  float rr = (l - r * 1.1) / (r * 1.25);                                  // 0 base .. 1 tip
  float wdt = pow(max(sin(PI * sat(rr)), 0.0), 0.7) * step(0.0, rr) * step(rr, 1.0);
  float F = fa / max(wdt, 1e-3);
  float pv = aa / max(l * TAU / np * 0.5 * max(wdt, 0.05), 1e-5);
  float pet = (citIso(F * 3.0, pv * 3.0, 1.0) * step(F, 1.02)) * step(0.0, rr) * step(rr, 1.0);
  vec3 cc = chakraColor(float(i));
  vec3 unlit = mix(vec3(0.55, 0.62, 0.85), cc, 0.22) * 0.75;
  vec3 res = m * step(l, r * 2.0) * mix(unlit, cc * 3.0 + 0.5, L);
  res += pet * L * (cc * 2.2 + 0.3) + cc * 0.25 * L * step(F, 1.0) * wdt;
  return res + lit * cc * 1.6 * exp(-l / r * 1.8);
}

vec4 citBody(vec2 w, CitBody B, float pxw, float ck[7]) {
  vec2 q = (w - B.pos) / B.scale;
  float aa = pxw / B.scale;
  float t = B.t;
  CitJoints j = citJoints(B.arms);
  float d = citBodySDF(q, j);
  vec2 a = vec2(abs(q.x), q.y);
  // the gold rises from the feet: below the front everything is gold
  float fy = q.y - B.kh - 0.018 * cos(q.x * 11.0 - t * 4.0);
  float gm = max(B.gold, smoothstep(0.035, -0.035, fy));
  float front = exp(-fy * fy / 0.0004) * step(-1.1, B.kh) * step(B.kh, 1.1) * (1.0 - B.gold);
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
    float bone = citLine(citBones(q, j), aa, 1.0) * inside;
    col += mix(vec3(0.70, 0.76, 1.0), tint, 0.4) * 0.55 * bone * B.lines;
    vec2 br = q - vec2(0.0, 0.89);
    float brm = (1.0 - smoothstep(-0.005, 0.0, sdEllipse(br, vec2(0.074, 0.07)))) * step(-0.035, br.y);
    float g = 0.8 * vnoise(vec2(a.x, q.y) * 30.0 + 3.0) + 0.1 * sin(a.x * 160.0 + q.y * 90.0);
    col += nerveCol * citIso(g * 8.0, aa * 30.0 * 8.0 * 0.6, 1.0) * brm * 0.45 * B.nerves * smoothstep(0.0003, 0.0008, aa);
    float imp = 0.0;
    float cord = citLine(a.x - 0.0015 * sin(q.y * 50.0), aa, 1.8) * step(0.02, q.y) * step(q.y, 0.80);
    float dp = (abs(q.y - 0.4) - B.pulse * 0.5) * 14.0;
    imp = max(imp, exp(-dp * dp) * cord * step(0.0, B.pulse));
    float nm = cord;
    nm = max(nm, citNerve(a, vec2(0.004, 0.64), j.sh + vec2(0.0, -0.02), 1.0, aa, 0.0, B.pulse, imp));
    nm = max(nm, citNerve(a, j.sh + vec2(0.0, -0.02), j.wr, 2.0, aa, 0.2, B.pulse, imp));
    nm = max(nm, citNerve(a, j.wr, j.hd + (j.hd - j.wr) * 0.1, 4.0, aa, 0.8, B.pulse, imp));
    nm = max(nm, citNerve(a, vec2(0.006, 0.06), j.kn, 5.0, aa, 0.0, B.pulse, imp));
    nm = max(nm, citNerve(a, j.kn, j.an, 7.0, aa, 0.55, B.pulse, imp));
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
    col += vec3(2.4, 1.5, 0.55) * front * inside + vec3(1.0, 0.6, 0.2) * front * 0.4 * step(0.0, d) * exp(-d / 0.05);

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
uniform float uWash;      // overall gold wash
uniform vec4  uCam2, uCam3;   // panel cameras (left/top, right/bottom)
uniform vec4  uGut;       // panel gutters: two lines x = a + b y (or y = a + b x for strips)
uniform float uGutW;      // gutter half width
uniform vec4  uEyeP;      // close-up eye: screen centre, scale, roll
uniform float uEyeO;      // its openness
uniform float uRollP;     // snare roll envelope
uniform vec4  uLotusP;    // crown lotus: centre xy, radius, opening
uniform float uColumn;    // rainbow column
uniform float uSunDark;   // 0 = blazing gold disc, 1 = night-blue disc engraved in gold

const vec3 CIT_VERM  = vec3(0.62, 0.035, 0.008);
const vec3 CIT_ULTRA = vec3(0.004, 0.018, 0.40);
const vec3 CIT_GOLD  = vec3(1.0, 0.64, 0.18);

// ---------------------------------------------------------------- sky: indigo night to amber dawn
vec3 citSky(vec2 p, vec2 w) {
  vec3 top = mix(vec3(0.004, 0.003, 0.028), vec3(0.016, 0.006, 0.05), uDawn);
  vec3 mid = mix(vec3(0.028, 0.008, 0.06), vec3(0.13, 0.022, 0.065), uDawn);
  vec3 low = mix(vec3(0.07, 0.02, 0.03), vec3(0.24, 0.065, 0.012), uDawn);
  float h = p.y;
  vec3 col = mix(low, mid, smoothstep(-0.7, 0.2, h));
  col = mix(col, top, smoothstep(0.1, 1.0, h));
  float r = length(w - uSun.xy) / uSun.z;
  col += vec3(1.0, 0.42, 0.06) * exp(-max(r - 1.0, 0.0) * 1.8) * 0.28 * uSun.w;
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
  dc = mix(dc, dc * vec3(0.35, 0.16, 0.05), rings * 0.85 * uSun2.w);
  // the night sun: ultramarine engraved in gold, a rosette of 32 petals
  vec3 nc = mix(vec3(0.035, 0.012, 0.10), vec3(0.004, 0.006, 0.045), sat(r / R)) + gold * rings * 0.22 * smoothstep(0.30, 0.5, r / R);
  {
    float fa = abs(fract((a - uSun2.x * 0.5) / TAU * 32.0) - 0.5) * 2.0;
    float rr = (r / R - 0.52) / 0.44;
    float wdt = pow(max(sin(PI * sat(rr)), 0.0), 0.6) * step(0.0, rr) * step(rr, 1.0);
    float F = fa / max(wdt, 1e-3);
    float pv = pxw * 64.0 / (max(r, 1e-4) * TAU * max(wdt, 0.05));
    nc += gold * (citIso(F * 2.0, pv * 2.0, 1.2) * step(F, 1.02) * 0.75 + step(F, 1.0) * wdt * 0.05) * step(0.0, rr) * step(rr, 1.0);
    nc += gold * 0.8 * (citLine(r - R * 0.52, pxw, 1.4) + citLine(r - R * 0.49, pxw, 1.0) * 0.5);
  }
  dc = mix(dc, nc, uSunDark);
  col += disc * dc;
  col += gold * 2.6 * citLine(r - R, pxw, 2.2) + gold * 1.0 * citLine(r - R * 1.055, pxw, 1.0);
  col += gold * 0.9 * citLine(r - R * 1.10, pxw, 1.0);
  // rays: 16 straight (outlined triangles) alternating with 16 wavy flames
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
  rf = mix(rf, gold * 0.8, wh);
  vec3 sray = rf * body * (0.14 + 0.30 * (1.0 - rr) * (1.0 - rr)) + gold * (citLine(ed, pxw, 1.3) * 0.95 + citLine(fr * arcU, pxw, 1.0) * body * 0.45);
  sray += gold * citIso(fr * 7.0 * (1.0 - rr * 0.5), pxw / arcU * 7.0, 0.9) * body * 0.16;
  float wv = (0.13 + 0.06 * rr) * sin(rr * 15.0 - uTime * 6.0 + id);
  float wl = citLine((fr - wv) * arcU, pxw, 1.8) + citLine((fr - wv * 0.7 - 0.12 * (1.0 - rr)) * arcU, pxw, 0.9) * 0.6 + citLine((fr - wv * 0.7 + 0.12 * (1.0 - rr)) * arcU, pxw, 0.9) * 0.6;
  vec3 wray = mix(gold, vec3(1.0, 0.35, 0.06), 0.4) * wl * (1.1 - rr) * 0.6;
  col += mix(wray, sray, straight) * inR * (1.0 - smoothstep(0.75, 1.0, rr)) * (0.85 + 0.4 * exp(-uKickAge * 8.0));
  // hairlines and halo rings in the sky (fine Alex Grey linework)
  float hl = citIso((a + uSun2.x * 0.5) / TAU * 240.0, pxw / max(r, 1e-3) / TAU * 240.0, 0.8);
  col += gold * hl * 0.07 * exp(-max(r - R, 0.0) / R * 0.9) * step(R * 1.1, r);
  float halo = citIso(log(max(r / R, 1.0)) * 7.0 + 0.18 * sin(a * 16.0 + uSun2.x * 16.0 + log(max(r / R, 1.0)) * 6.0), pxw / max(r, 1e-3) * 7.0, 0.9) * step(R * 1.2, r);
  col += gold * halo * 0.08 * uSun2.w * exp(-max(r - R, 0.0) / R * 0.6);
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
  float yy = 0.0, k = 0.0, y0 = 0.0, hk = 0.32, Wk = 2.4;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float h = 0.32 * pow(0.85, fi);
    float W = 0.34 + 2.06 * pow((6.0 - fi) / 6.0, 1.4);
    bool here = m.y >= yy && m.y < yy + h;
    k = here ? fi : k; y0 = here ? yy : y0; hk = here ? h : hk; Wk = here ? W : Wk;
    yy += h;
  }
  float top = yy;
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
  vec3 face = CIT_GOLD * (0.025 + 0.07 * v) * (0.75 + 0.25 * sat(m.y / top));
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
    tcol += CIT_GOLD * 0.5 * citIso(asin(clamp(u, -1.0, 1.0)) / PI * 8.0, pm / tw / max(nz, 0.15) / PI * 8.0, 1.0) * nz;
    tcol += CIT_GOLD * 1.4 * citLine(abs(tq.x) - tw, pm, 1.5);
    // arched window with the athanor's fire
    vec2 wq = tq - vec2(0.0, CIT_TH * 0.42);
    float win = min(sdBox(wq + vec2(0.0, 0.01), vec2(0.026, 0.035)), length(wq - vec2(0.0, 0.025)) - 0.026);
    float fire = fill(win, pm);
    float fl = citNoise3(vec2(wq.x * 60.0, wq.y * 30.0 - uTime * 6.0));
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
    // the eye in the triangle (Providence), floating in the sun's heart
    vec2 eq = tq - vec2(0.0, CIT_TH + 0.24);
    float trd = sdTriangle(eq, 0.12);
    float inTr = fill(trd, pm);
    vec3 trc = vec3(0.02, 0.025, 0.14) * inTr;
    trc += vec3(1.4, 1.0, 0.5) * (citLine(trd, pm, 2.2) * 1.4 + citLine(trd + 0.014, pm, 1.0) * 0.8);
    vec2 ee = eq - vec2(0.0, -0.012);
    float lid = sdVesica(vec2(ee.y, ee.x), 0.026 * (1.0 - 0.9 * smoothstep(0.0, 0.5, sin(uTime * 0.0))), 0.062);
    float er = length(ee);
    float inE = fill(lid, pm);
    trc += inE * (vec3(1.6, 1.4, 1.1) * 0.6 * smoothstep(0.024, 0.026, er) + vec3(1.0, 0.55, 0.1) * (1.0 - smoothstep(0.0235, 0.025, er)) * (0.6 + 0.6 * citIso(citAtan(ee.y, ee.x) / TAU * 40.0, pm / max(er, 1e-3) / TAU * 40.0, 1.0)));
    trc = mix(trc, vec3(0.0), inE * fill(er - 0.010, pm));
    trc += vec3(2.0) * inE * fill(length(ee - vec2(0.006, 0.006)) - 0.004, pm);
    trc += vec3(1.4, 1.0, 0.5) * citLine(lid, pm, 1.5) * 1.2;
    col = col * (1.0 - inTr) + trc;
    alpha = max(alpha, inTr);
  }
  return vec4(col, alpha);
}
#endif

// ---------------------------------------------------------------- anime speed lines (screen)
float citSpeed(vec2 p, vec2 c, float n, float inner, float seed) {
  vec2 d = p - c; float r = length(d); float a = citAtan(d.y, d.x);
  float sx = a / TAU * n; float sid = floor(sx);
  float h = hash11(sid * 1.37 + seed);
  float wpx = 0.7 + 2.6 * h * h;
  float sw = abs(fract(sx) - 0.5) * TAU * r / n;
  float line = 1.0 - smoothstep(0.0, px() * wpx, sw);
  return line * step(0.58, h) * smoothstep(inner * (0.6 + 0.7 * h), inner * (1.0 + 0.7 * h) + 0.25, r);
}

// ---------------------------------------------------------------- a chakra ignites (sakuga)
// shockwave rings, a lotus bloom with nested petal outlines, colour wash, sparkles, burst lines
vec3 citBurst(vec2 p, vec2 c, float age, int i, float S) {
  if (age < 0.0) return vec3(0.0);
  vec3 cc = chakraColor(float(i));
  float I = 0.6 + 0.5 * float(i) / 6.0;
  float PX = px();
  vec2 d = p - c; float r = length(d); float a = citAtan(d.y, d.x);
  vec3 col = vec3(0.0);
  // 1. shockwave: thick white-hot ring thinning out, broken into sakuga segments; a flat ground ring
  float R1 = 2.6 * (1.0 - exp(-age * 4.0));
  float wd = mix(0.05, 0.003, sat(age * 1.6));
  float sgi = floor(a / TAU * 11.0 + 5.5);
  float seg = step(0.16 + 0.25 * hash11(sgi + float(i) * 13.0), fract(a / TAU * 11.0 + 0.3 * hash11(float(i))));
  float ring = 1.0 - smoothstep(wd, wd + 1.5 * PX, abs(r - R1));
  float ringE = 1.0 - smoothstep(0.0, wd * 2.5 + 3.0 * PX, abs(r - R1 + wd * 1.5));
  col += (vec3(2.6, 2.4, 2.0) * ring * mix(1.0, seg, 0.7) + cc * 2.2 * ringE) * exp(-age * 3.2) * I;
  float R2 = 3.2 * (1.0 - exp(-max(age - 0.05, 0.0) * 3.0));
  vec2 dg = d * vec2(1.0, 4.0);
  col += cc * 1.6 * (1.0 - smoothstep(0.0, 0.012 + 3.0 * PX, abs(length(dg) - R2))) * exp(-age * 3.0) * step(0.05, age) * I;
  // 2. the lotus blooms out of the chakra (petal count of the chakra), then fades into it
  float np = citPetalN(i);
  float grow = 1.0 - pow(1.0 - sat(age / 0.22), 3.0);
  float Rl = S * 0.42 * grow * (1.0 + 0.12 * sin(sat(age / 0.22) * PI));
  float spin = age * 0.8 * (mod(float(i), 2.0) * 2.0 - 1.0);
  float L = exp(-max(age - 0.18, 0.0) * 3.5);
  float lot = 0.0, lfill = 0.0;
  for (int layer = 0; layer < 2; layer++) {
    float fl = float(layer);
    float off = fl * 0.5;
    float Rr = Rl * (1.0 - 0.28 * fl);
    float fa = abs(fract((a + spin * (1.0 - 2.0 * fl)) / TAU * np + 0.5 + off) - 0.5) * 2.0;
    float rr = (r - Rr * 0.22) / (Rr * 0.78);
    float wdt = pow(max(sin(PI * sat(rr)), 0.0), 0.65) * step(0.0, rr) * step(rr, 1.0) * mix(1.0, 0.85, fl);
    float F = fa / max(wdt, 1e-3);
    float pv = PX / max(r * TAU / np * 0.5 * max(wdt, 0.05), 1e-5);
    float inP = step(F, 1.0) * step(0.0, rr) * step(rr, 1.0);
    lot = max(lot, citIso(F * 3.0, pv * 3.0, 1.2) * step(F, 1.03) * step(0.0, rr) * step(rr, 1.0) * mix(1.0, 0.6, fl));
    lfill = max(lfill, inP * wdt * (1.0 - 0.5 * fl));
  }
  float hub = citLine(r - Rl * 0.22, PX, 2.0) + citLine(r - Rl * 0.16, PX, 1.0) + citLine(r - Rl * 1.06, PX, 1.2) * 0.6;
  col += (cc * 2.4 + 0.6) * (lot + hub) * L * I + cc * lfill * 0.35 * L * I;
  // 3. colour wash (partial: a tint, never a full-screen strobe)
  float wash = 0.38 * exp(-age / 0.22) * I * (1.0 - 0.6 * uReduced);
  col += cc * wash * (0.12 + 1.2 * exp(-r * 2.0));
  col += vec3(1.0, 0.9, 0.7) * 2.0 * exp(-r / min(S * 0.06, 0.04)) * exp(-age * 6.0);
  // 4. sparkles flying out (one per sector, constant cost)
  {
    float ns = 14.0;
    float sx = (a + 0.3) / TAU * ns; float sid = floor(sx);
    float h = hash11(sid * 3.1 + float(i) * 7.7);
    float sa = (sid + 0.25 + 0.5 * h) / ns * TAU - 0.3;
    float sr = (0.15 + 1.2 * h) * S * 1.4 * (1.0 - exp(-age * 5.0)) + Rl * 0.3;
    vec2 sp = c + vec2(cos(sa), sin(sa)) * sr;
    float ssz = (0.035 + 0.05 * h) * exp(-age * 2.5) * (0.6 + 0.4 * S);
    col += mix(vec3(1.0, 0.95, 0.85), cc + 0.3, 0.4) * 2.0 * sparkle(p, sp, ssz) * step(age, 0.9);
  }
  // 5. burst lines
  col += mix(cc, vec3(1.0, 0.9, 0.7), 0.5) * citSpeed(p, c, 120.0, 0.35 + age * 1.5, floor(age * 20.0)) * exp(-age * 4.0) * 1.6 * I;
  return col;
}

#ifdef CIT_RIBBONS
// ---------------------------------------------------------------- henshin: three light ribbons
// spiralling up around the body (body units). front = in front of the body, back = behind.
void citRibbons(vec2 q, float aa, out vec3 back, out vec3 front) {
  back = vec3(0.0); front = vec3(0.0);
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float ph = q.y * 6.0 - uTime * 7.0 + fj * TAU / 3.0;
    float R = 0.34 + 0.05 * sin(q.y * 2.3 + fj * 2.0);
    float xc = R * sin(ph);
    float z = cos(ph);
    float slope = R * 6.0 * z;
    float dist = abs(q.x - xc) / sqrt(1.0 + slope * slope);
    float wid = 0.030 * (0.25 + 0.75 * abs(z)) + 0.004;
    float band = 1.0 - smoothstep(wid - aa, wid + aa, dist);
    float lines = citIso(dist / wid * 2.0, aa / wid * 2.0, 1.0) * band;
    float core = citLine(dist, aa, 1.6);
    float vis = smoothstep(-1.15, -0.8, q.y) * (1.0 - smoothstep(1.0, 1.35, q.y));
    vec3 c = j == 0 ? vec3(1.0, 0.78, 0.30) : j == 1 ? vec3(1.0, 0.95, 0.85) : vec3(1.0, 0.40, 0.10);
    vec3 rc = c * (band * 0.25 + lines * 1.2 + core * 1.6) * vis * (0.6 + 0.4 * abs(z));
    if (z > 0.0) front += rc; else back += rc * 0.6;
  }
}
#endif

#ifdef CIT_EYECU
// ---------------------------------------------------------------- the awakened eye (manga cut-in):
// extreme close-up, the Sun and the Mountain reflected in a gold iris of radial fibres
vec3 citEyeCU(vec2 p, float PX) {
  vec2 e = (p - uEyeP.xy) / uEyeP.z;
  e = vec2(e.x * cos(uEyeP.w) - e.y * sin(uEyeP.w), e.x * sin(uEyeP.w) + e.y * cos(uEyeP.w));
  float pe = PX / uEyeP.z;
  float o = uEyeO;
  float xx = sat(1.0 - e.x * e.x);
  float yu = 0.50 * pow(xx, 0.62) * o + 0.10 * e.x - 0.03;
  float yl = -0.27 * pow(xx, 0.9) * mix(0.25, 1.0, o) + 0.05 * e.x - 0.04;
  // luminous gold skin with topographic contours (as on the body)
  float sk = length(e * vec2(0.60, 1.25));
  vec3 col = vec3(0.13, 0.045, 0.008) * (1.3 - 0.6 * sat(sk));
  col += vec3(1.0, 0.55, 0.15) * citIso(sk * 8.0 - uTime * 0.7, pe * 8.0 * 1.3, 1.0) * 0.25 * smoothstep(0.5, 0.85, sk);
  // the brow: fine parallel strokes
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float by = 0.78 + 0.045 * fi - 0.30 * e.x * e.x + 0.10 * e.x;
    col += vec3(1.0, 0.68, 0.28) * citLine(e.y - by, pe, 1.6 - 0.25 * fi) * step(abs(e.x + 0.05), 1.08 - 0.12 * fi) * (0.9 - 0.15 * fi);
  }
  float inE = step(abs(e.x), 1.0) * smoothstep(-pe, pe, yu - e.y) * smoothstep(-pe, pe, e.y - yl);
  vec3 ec = vec3(0.80, 0.74, 0.66) * (0.35 + 0.65 * smoothstep(yu, yu - 0.28, e.y));
  vec2 di = e - vec2(0.03, -0.03);
  float ir = length(di), ia = citAtan(di.y, di.x);
  const float IR = 0.42;
  float inI = fill(ir - IR, pe);
  float fib = 0.5 + 0.5 * cos(ia * 64.0 + 3.0 * sin(ir * 30.0));
  float fib2 = 0.5 + 0.5 * cos(ia * 150.0 + ir * 40.0);
  vec3 irc = mix(vec3(0.45, 0.10, 0.005), vec3(1.5, 0.85, 0.22), smoothstep(IR, 0.14, ir)) * (0.45 + 0.55 * fib * (0.6 + 0.4 * fib2));
  irc *= 0.35 + 0.65 * smoothstep(yu, yu - 0.32, e.y);
  irc += vec3(1.6, 1.0, 0.35) * citLine(ir - 0.23, pe, 1.6) * 0.8 + vec3(1.0, 0.6, 0.2) * citLine(ir - 0.30, pe, 1.0) * 0.4;
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
  // anime highlights
  irc += vec3(2.2) * fill(length((di - vec2(0.18, 0.16)) * vec2(1.0, 1.35)) - 0.065, pe);
  irc += vec3(1.6) * fill(length(di - vec2(-0.17, -0.21)) - 0.028, pe);
  ec = mix(ec, irc, inI);
  col = mix(col, ec, inE);
  // the upper lash line (thick ink, flicked at the outer corner), lashes, the lower lid
  float lw = 0.012 + 0.03 * pow(xx, 0.5) * o + 0.02 * smoothstep(0.6, 1.0, e.x);
  float lashD = abs(e.y - yu - lw * 0.6) - lw;
  float lashes = 0.0;
  {
    float lx = e.x * 9.0; float li = floor(lx);
    float lt = fract(lx);
    float h = 0.06 + 0.08 * smoothstep(-0.2, 1.0, e.x);
    float ly = e.y - yu;
    float dl = abs(lt - 0.5 - (ly / h) * 0.35 * sign(e.x + 0.2)) * (1.0 / 9.0) - 0.006 * (1.0 - ly / h);
    lashes = step(0.0, ly) * step(ly, h) * fill(dl, pe) * step(abs(e.x), 1.02) * step(0.001, o);
  }
  float ink = max(fill(lashD, pe) * step(abs(e.x), 1.04), lashes);
  col = mix(col, vec3(0.012, 0.004, 0.0), ink);
  col += vec3(1.2, 0.7, 0.25) * citLine(lashD - pe * 1.5, pe, 1.0) * 0.5 * step(abs(e.x), 1.04);
  col += vec3(1.0, 0.6, 0.25) * citLine(e.y - yl, pe, 1.6) * step(abs(e.x), 1.0) * 0.8;
  return col;
}
#endif

#ifdef CIT_LOTUS
// ---------------------------------------------------------------- SAHASRARA: the thousand-
// petalled lotus. Five rings of pointed petals (16 .. 104), opening from the centre outward.
vec4 citLotus(vec2 w, vec2 c, float RL, float open, float pxw) {
  vec2 d = w - c; float r = length(d) / RL; float a = citAtan(d.x, d.y);
  float pr = pxw / RL;
  const float R0 = 0.06;
  float lr = log(max(r, 1e-4) / R0) / log(1.0 / R0) * 5.0;
  float m = floor(lr), rr = fract(lr);
  float n = m < 0.5 ? 16.0 : m < 1.5 ? 24.0 : m < 2.5 ? 40.0 : m < 3.5 ? 64.0 : 104.0;
  float grow = sat(open * 5.5 - m);
  float spin = (mod(m, 2.0) * 2.0 - 1.0) * uTime * 0.18;
  float fa = abs(fract((a + spin) / TAU * n + 0.5 * mod(m, 2.0)) - 0.5) * 2.0;
  float u = rr / max(grow, 1e-3);
  float wdt = pow(max(sin(PI * sat(u)), 0.0), 0.55) * step(u, 1.0);
  float F = fa / max(wdt, 1e-3);
  float pv = pr * 2.0 * n / (max(r, 1e-4) * TAU * max(wdt, 0.05));
  float inP = step(F, 1.0) * wdt * step(0.0, m) * step(m, 4.0);
  float ln = citIso(F * 3.0, pv * 3.0, 1.2) * step(F, 1.03) * step(0.0, m) * step(m, 4.0) * step(u, 1.0);
  vec3 rc = m < 0.5 ? vec3(1.0, 0.92, 0.75) : m < 1.5 ? vec3(1.0, 0.72, 0.22) : m < 2.5 ? vec3(1.0, 0.30, 0.55) : m < 3.5 ? vec3(0.80, 0.32, 1.0) : vec3(0.48, 0.25, 1.0);
  float al = inP * grow * 0.9;
  vec3 col = rc * (inP * (0.03 + 0.30 * (1.0 - u) * (1.0 - u)) + ln * 1.8) * grow;
  // ring rims and the bindu
  col += vec3(1.0, 0.85, 0.6) * citIso(lr, pr / max(r, 1e-4) / log(1.0 / R0) * 5.0, 1.2) * step(0.0, lr) * step(lr, 5.02) * sat(open * 5.5 - lr) * 0.8;
  col += vec3(3.0, 2.6, 2.0) * (fill(r - R0 * 0.55, pr) + exp(-r / (R0 * 0.6)) * 0.8) * sat(open * 4.0);
  return vec4(col, al);
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
    vec4 lo = citLotus(w, uLotusP.xy, uLotusP.z, uLotusP.w, pxw);
    col = col * (1.0 - lo.a) + lo.rgb;
  }
#endif
#ifdef CIT_SPEED
  col += vec3(1.0, 0.82, 0.5) * citSpeed(p, uSpeedC, 150.0, 0.85, floor(uTime * 15.0)) * uSpeed * 0.7;
#endif
  float ck[7];
  for (int i = 0; i < 7; i++) ck[i] = uCk[i];
  CitBody B = citBodyDefault();
  B.pos = uBodyP.xy; B.scale = uBodyP.z; B.arms = uBodyP.w;
  B.kh = uBodyQ.x; B.gold = uBodyQ.y; B.eye3 = uBodyQ.z; B.aura = uBodyQ.w;
  B.t = uTime; B.pulse = uKickAge * 3.0;
  vec2 q = (w - B.pos) / B.scale;
  float aq = pxw / B.scale;
#ifdef CIT_COLUMN
  {
    // the seven chakras in one vertical rainbow column, beyond the crown into the sky
    float hx = abs(q.x);
    vec3 rc = chakraColor(clamp((q.y + 0.02) / 1.02 * 6.0, 0.0, 6.0));
    float span = smoothstep(-1.2, -0.95, q.y);
    col += (rc * (exp(-hx / 0.025) * 1.2 + exp(-hx / 0.10) * 0.35) + vec3(1.5, 1.4, 1.2) * citLine(q.x, aq, 2.0)) * span * uColumn;
  }
#endif
#ifdef CIT_RIBBONS
  vec3 rb, rf;
  citRibbons(q, aq, rb, rf);
  col += rb * uRibbon;
#endif
  vec4 b = citBody(w, B, pxw, ck);
  col = col * (1.0 - b.a) + b.rgb;
#ifdef CIT_RIBBONS
  col += rf * uRibbon;
#endif
#ifdef CIT_EYECU
  col = pid < 0.5 ? citEyeCU(p, PX) : col;
#endif
#ifdef CIT_PANELS
  col = mix(col, vec3(0.0), gut);
  col += vec3(1.0, 0.72, 0.3) * edge * 0.9;
#endif
  col += citBurst(p, uIgn.zw, uIgn.y, int(uIgn.x), uIgnS);
  col = mix(col, vec3(1.0, 0.82, 0.45) * 1.6, uWash);
  fragColor = vec4(col, 1.0);
}
`;

  // C5: the gap, under the overlay's full-screen RUBEDO insert: white-gold radiance (cheap)
  const WHITE = `
uniform float uKickAge;
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float r = length(p), a = atan(p.y, p.x);
  float rays = pow(0.5 + 0.5 * cos(a * 32.0 + uTime * 0.6), 6.0);
  vec3 col = vec3(1.0, 0.86, 0.58) * (1.3 + 1.6 * exp(-r * 1.5)) + vec3(1.0, 0.7, 0.3) * rays * 0.5 * exp(-r * 0.6);
  fragColor = vec4(col, 1.0);
}`;

  // ======================================================================== timeline (JS)
  const BEAT = MO.BEAT;
  const bt = (b) => b * BEAT;
  const T0 = bt(32), T1 = bt(36), T2 = bt(40), T2b = bt(42), T3 = bt(44), T4 = bt(46), T5 = bt(48);
  const IGN = [0, 1, 2, 3, 4, 5, 6].map((i) => bt(32 + 2 * i));
  const CHY = [-0.02, 0.10, 0.25, 0.44, 0.665, 0.865, 1.0];
  const E = MO.easeInOut, EO = MO.easeOut, EI = MO.easeIn, SM = MO.smooth, C = MO.clamp, mix = MO.mix;
  const R = () => (MO.reduced ? 0.3 : 1);
  const backOut = (x) => { x = C(x); const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  // scene → screen with a 2D camera (inverse of w = rot(roll) * p / zoom + centre)
  function toScreen(w, cam) {
    const ux = w[0] - cam[0], uy = w[1] - cam[1], c = Math.cos(cam[3]), s = Math.sin(cam[3]);
    return [cam[2] * (c * ux - s * uy), cam[2] * (s * ux + c * uy)];
  }

  function uniforms(t) {
    const u = {};
    const kick = MO.last('kick', t);
    u.uKickAge = kick ? t - kick.e.t : 9;
    const kickE = MO.env('kick', t, 0.12), rollE = MO.env('roll', t, 0.06);
    u.uRollP = rollE;
    // chakras: lit after their ignition, flaring at it, ticking with the roll
    let last = -1;
    const ck = [], terr = [];
    for (let i = 0; i < 7; i++) {
      const age = t - IGN[i];
      if (age >= 0) last = i;
      ck[i] = age >= 0 ? 1 + 1.6 * Math.exp(-age / 0.22) + 0.35 * kickE + 0.3 * rollE : 0;
      terr[i] = age >= 0 ? 0.55 + 1.4 * Math.exp(-age / 0.3) + 0.25 * kickE : 0;
    }
    u.uCk = ck; u.uTerr = terr;
    let kh = -1.2;
    if (last >= 0) {
      const prev = last > 0 ? CHY[last - 1] + 0.04 : -1.12;
      kh = mix(prev, CHY[last] + 0.04, EO((t - IGN[last]) / 0.32));
    }
    const ignAge = last >= 0 ? t - IGN[last] : -1;

    let cam = [0, 0, 1, 0], cam2 = [0, 0, 1, 0], cam3 = [0, 0, 1, 0], igCam = null;
    let body = [0, -0.4, 0.4, 0];
    let gold = 0, eye3 = 0, aura = 1.0;
    let sun = [0, 0.5, 0.3, 1], sun2 = [t * 0.12, 0, 1.6, 1];
    let mount = [0, -1.3, 0.85, 0];
    let dawn = 0.5, speed = 0, speedC = [0, 0], ribbon = 0, wash = 0;
    let gutA = [-9, 0, 9, 0], gutW = 0.03, eyeP = [-1.2, 0, 0.5, 0], eyeO = 0;
    let lotus = [0, 1.12, 0.5, 0], column = 0, sunDark = 0;

    if (t < T1) {
      // C1: wide on the Holy Mountain; the figure climbs the stair a step per kick
      const k = (t - T0) / (T1 - T0);
      mount = [0, -1.40, 1.0, 0];
      cam = [0, mix(-0.30, 0.10, E(k)), 0.95 + 0.10 * SM(k), 0];
      const beat = (t - T0) / BEAT;
      const climb = Math.floor(beat) + EO(C((beat % 1) * 3.0));
      body = [0, -0.62 + 0.10 * climb, 0.40, 0.08 * SM(k)];
      const top = mount[1] + 1.531 * mount[2];
      const eyeY = top + (0.30 + 0.24) * mount[2];
      sun = [0, eyeY - 0.40 * (1 - EO(k)), 0.26, 1];
      sun2 = [t * 0.10, 0, 1.55 + 0.15 * kickE, 1];
      dawn = 0.15 + 0.7 * SM(k);
    } else if (t < T2) {
      // C2: henshin — closer on the torso, the camera rolls, ribbons spiral up the body
      const k = (t - T1) / (T2 - T1);
      body = [0, -0.45, 1.25, 0.12 + 0.25 * SM(k)];
      const heart = [0, body[1] + 0.44 * body[2]];
      cam = [0, heart[1] - 0.05 + 0.12 * SM(k), 1.0 + 0.14 * SM(k), (-0.16 + 0.32 * E(k)) * R()];
      sun = [0, heart[1] + 0.15, 0.78, 1]; sunDark = 1;
      sun2 = [-t * 0.22, 0, 1.25 + 0.12 * kickE, 1];
      dawn = 0.6;
      speed = (0.12 + 0.35 * rollE + 0.4 * Math.exp(-ignAge / 0.3)) * R();
      speedC = toScreen(heart, cam);
      ribbon = SM((t - T1) / 0.4);
      aura = 1.15;
    } else if (t < T2b) {
      // C3a: manga triptych. World: the figure stands on the summit of the Mountain.
      //   left: the awakened eye (close-up), centre: the throat ignites, right: the Mountain
      const k = (t - T2) / (T2b - T2);
      body = [0, 0, 1, 0.3];
      mount = [0, -1.0 - 1.531 * 3.0, 3.0, 0];
      sun = [0, 0.95, 1.05, 1]; sunDark = 1;
      sun2 = [t * 0.2, 0.15, 1.3 + 0.12 * kickE, 1];
      dawn = 0.75;
      cam = [0, 0.62 + 0.04 * k, 1.75 + 0.12 * k, -0.04 * R()];
      cam3 = [-5.6, -2.2 + 0.3 * k, 0.24, 0];
      const inL = backOut((t - bt(40.5)) / 0.16), inR = backOut((t - bt(41)) / 0.16);
      gutA = [mix(-3.2, -0.62, inL), 0.32, mix(3.4, 0.66, inR), 0.26];
      gutW = 0.034;
      eyeP = [mix(-3.0, -1.24, inL) + 0.03 * k, 0.02, 0.50, -0.10];
      eyeO = EO((t - bt(40.5) - 0.08) / 0.18);
      speed = (0.3 + 0.7 * rollE) * R();
      speedC = toScreen([0, 0.665], cam);
      aura = 1.2;
    } else if (t < T3) {
      // C3b: the eye strip — the face between two black gutters, the third eye opens;
      //   above: the crown and the sun, below: the column of lit chakras
      const k = (t - T2b) / (T3 - T2b);
      body = [0, 0, 1, 0.4];
      mount = [0, -1.0 - 1.531 * 3.0, 3.0, 0];
      sun = [0, 1.05, 0.62, 1]; sunDark = 1;
      sun2 = [-t * 0.3, 0.3, 1.4 + 0.15 * kickE, 1];
      dawn = 0.85;
      const shake = MO.reduced ? 0 : 0.004 * rollE;
      cam = [shake, 0.86, 6.6 + 0.8 * k, 0.0];
      cam2 = [0, 1.08, 1.6 + 0.2 * k, 0.03];
      cam3 = [0, 0.18, 1.55 + 0.2 * k, -0.03];
      const sIn = backOut((t - T2b) / 0.14);
      gutA = [mix(1.6, 0.40, sIn), -0.07, mix(-1.6, -0.44, sIn), -0.07];
      gutW = 0.034;
      eye3 = EO((t - T2b) / 0.22);
      speed = (0.35 + 0.8 * rollE) * R();
      speedC = toScreen([0, 0.873], cam);
      aura = 1.25;
    } else if (t < T4) {
      // C4: SAHASRARA. Arms raised, rainbow column, the lotus opens, extreme push-in
      const k = (t - T3) / (T4 - T3);
      body = [0, -0.1, 0.62, 1.0];
      const crown = [0, body[1] + 1.16 * body[2]];
      const zk = EI(C((k - 0.12) / 0.88));
      const z = 0.85 * Math.exp(Math.log(16) * zk);
      cam = [0, mix(0.0, crown[1], C(zk * 1.4)), z, 0];
      sun = [0, crown[1], 0.75, 1]; sunDark = 1;
      sun2 = [t * 0.4, C(k * 1.5), 2.2, 1];
      lotus = [crown[0], crown[1], 0.62 * body[2] * 1.6, EO(k / 0.55)];
      column = SM(k / 0.15) * (1 + 0.3 * rollE);
      dawn = 1; gold = SM(k / 0.4);
      eye3 = 1; aura = 1.4;
      speed = (0.5 + 0.5 * rollE) * R(); speedC = toScreen(crown, cam);
      wash = SM((k - 0.72) / 0.28) * 0.9;
    }

    u.uCam = cam; u.uCam2 = cam2; u.uCam3 = cam3;
    u.uBodyP = body; u.uBodyQ = [kh, gold, eye3, aura];
    const ig = last >= 0 ? toScreen([body[0], body[1] + CHY[last] * body[2]], igCam || cam) : [0, 0];
    u.uIgn = [Math.max(last, 0), ignAge, ig[0], ig[1]];
    u.uIgnS = body[2] * (igCam || cam)[2];
    u.uSun = sun; u.uSun2 = sun2; u.uMount = mount; u.uDawn = dawn;
    u.uSpeed = speed; u.uSpeedC = speedC; u.uRibbon = ribbon; u.uWash = wash;
    u.uGut = gutA; u.uGutW = gutW; u.uEyeP = eyeP; u.uEyeO = eyeO;
    u.uLotusP = lotus; u.uColumn = column; u.uSunDark = sunDark;
    return u;
  }

  const shot = (id, from, to, defs, extra = {}) => MO.scene(Object.assign({
    id, section: 'citrinitas', from, to,
    fs: defs.map((d) => `#define ${d}\n`).join('') + BODY + SCENE,
    uniforms: (t) => uniforms(t),
    bloom: 0.38,
    vignette: 0.42,
  }, extra));
  shot('citrinitas-c1', T0, T1, ['CIT_MOUNTAIN']);
  shot('citrinitas-c2', T1, T2, ['CIT_SPEED', 'CIT_RIBBONS']);
  shot('citrinitas-c3a', T2, T2b, ['CIT_PANELS', 'CIT_MOUNTAIN', 'CIT_EYECU', 'CIT_SPEED']);
  shot('citrinitas-c3b', T2b, T3, ['CIT_PANELS', 'CIT_STRIPS', 'CIT_EYE3', 'CIT_SPEED']);
  shot('citrinitas-c4', T3, T4, ['CIT_LOTUS', 'CIT_COLUMN', 'CIT_EYE3', 'CIT_SPEED']);
  MO.scene({ id: 'citrinitas-c5', section: 'citrinitas', from: T4, to: T5, fs: WHITE, uniforms: (t) => uniforms(t), bloom: 0.5, vignette: 0.2 });
})();
