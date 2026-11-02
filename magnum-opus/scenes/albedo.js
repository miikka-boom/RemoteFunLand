// ALBEDO — XVIII The Moon — 7.059–14.118 s (bars 4–7, beats 16–32). Owner: albedo agent.
//
// A1 "Shadow on the left,"      the luminous body (Sacred Mirrors) in the Universal Mind
//                               Lattice, moon halo; ink floods its left half, the Shadow's eye opens.
// A2 "Anima on the right,"      the mirror: the Shadow steps out to the left, the Anima to the
//                               right, framed by the High Priestess pillars B and J, moon between.
// A3 "climb the Holy Mountain"  they step back into the mirror and become one (the Rebis), the
//                               corridor falls away, the floor stacks into a stepped mountain,
//                               the figure is carried up to the summit under the moon.
// A4 "to the Self, the light!"  cut in close, push into the third eye, all lines converge,
//                               white-gold light.
//
// The luminous body is a self-contained GLSL block (BODY below, exported as
// window.ALBEDO_BODY_GLSL) so the citrinitas scene can reuse it: build an AlbBody with
// albBodyDefault(), set its fields and call albedoBody(). See the comments in the block.
//
// Performance: on SwiftShader (the MP4 renderer) every instruction of a shader runs for every
// pixel whatever its branches do, so the frame cost is pixels x total code size. Hence one
// shader per shot (each with only the features it needs, chosen with #defines) and a single
// albedoBody() evaluation per pixel even when two figures are on screen (the mirror selects
// the parameters per pixel).
(() => {
  const BODY = `
// =====================================================================================
// THE LUMINOUS BODY (after Alex Grey's Sacred Mirrors) — reusable, self-contained.
// Body space: feet at y = -1, crown at y = +1, x = 0 is the midline (same frame as lib's
// sdBody). Layers: flame aura (fine contour lines licking outward), skin line, topographic
// body lines (iso-lines of the body SDF), x-ray skeleton, nervous system with impulses,
// seven chakra mandalas (unlit .. lit), eyes.
// Optional features, enabled by #define before this block:
//   ALB_SHADOW  the ink Shadow (B.shadow / B.shadowEdge) and its glowing red-ringed eyes
//   ALB_HAIR    the Anima's long hair and crescent crown (B.hair)
//   ALB_EYE3    the third eye on the brow (B.eye3)
// Usage:
//   AlbBody B = albBodyDefault();          // luminous male figure, arms hanging
//   B.pos = vec2(0.0, 0.02); B.scale = 0.86; B.t = uTime;
//   float ck[7]; for (int i = 0; i < 7; i++) ck[i] = 0.0;   // chakra intensities 0..1
//   vec4 b = albedoBody(p, B, px(), ck);   // p in scene units, px() = one pixel there
//   col = col * (1.0 - b.a) + b.rgb;       // b.a = how much the body hides what is behind
// Cost: ~1 body evaluation per pixel; call it once per pixel (select parameters per pixel if
// several figures share the screen), never once per figure.
// =====================================================================================
struct AlbBody {
  vec2  pos;        // scene position of the body origin (body y = 0, the pelvis)
  float scale;      // scene units per body unit (the figure is 2 body units tall)
  float arms;       // 0 = arms hanging, palms forward; 1 = raised V (0.7 = orans, raised)
  float fem;        // 0 = male proportions, 1 = female (the Anima)
  float shadow;     // ALB_SHADOW: 0..1 Shadow amount (ink body, violet rim, red-ringed eyes) ...
  float shadowEdge; // ... applied where body x < shadowEdge (9 = whole body, 0 = left half)
  float aura;       // flame aura strength (0..2)
  float lines;      // inner linework strength: contours, skeleton (0..1.5)
  float nerves;     // nervous system brightness (0..2)
  float pulse;      // nerve impulse front, distance from the spine in body units (< 0: none)
  float eyes;       // eyes open 0..1 (the Shadow's / the Anima's; the luminous body keeps them closed)
  float eye3;       // ALB_EYE3: third eye open 0..1
  float hair;       // ALB_HAIR: hair + crescent crown 0..1
  float reveal;     // 0..1 draw-on, growing out from the heart (1 = fully drawn)
  float t;          // time in seconds (flames, hair)
  vec3  tint;       // main light colour (skin line, contours, inner aura)
  vec3  tint2;      // outer aura colour
  vec3  nerveCol;   // nerve colour
};

AlbBody albBodyDefault() {
  AlbBody B;
  B.pos = vec2(0.0); B.scale = 0.86; B.arms = 0.0; B.fem = 0.0;
  B.shadow = 0.0; B.shadowEdge = 9.0;
  B.aura = 1.0; B.lines = 1.0; B.nerves = 1.0; B.pulse = -1.0;
  B.eyes = 0.0; B.eye3 = 0.0; B.hair = 0.0; B.reveal = 1.0; B.t = 0.0;
  B.tint = vec3(0.80, 0.93, 1.0); B.tint2 = vec3(0.50, 0.42, 1.0); B.nerveCol = vec3(0.22, 0.55, 1.7);
  return B;
}

// joints of the right half (x > 0); the body is mirror symmetric
struct AlbJoints { vec2 sh, el, wr, hd, hip, kn, an, toe; };
AlbJoints albJoints(float arms, float fem) {
  AlbJoints j;
  j.sh  = mix(vec2(0.205, 0.575), vec2(0.172, 0.582), fem);
  j.el  = mix(vec2(0.285, 0.29), vec2(0.40, 0.80), arms) - vec2(0.022 * fem, 0.0);
  j.wr  = mix(vec2(0.33, 0.02), vec2(0.52, 1.04), arms) - vec2(0.03 * fem, 0.0);
  j.hd  = mix(vec2(0.35, -0.08), vec2(0.56, 1.13), arms) - vec2(0.03 * fem, 0.0);
  j.hip = mix(vec2(0.095, 0.0), vec2(0.108, 0.0), fem);
  j.kn  = mix(vec2(0.105, -0.47), vec2(0.092, -0.47), fem);
  j.an  = mix(vec2(0.105, -0.90), vec2(0.088, -0.90), fem);
  j.toe = j.an + vec2(0.045, -0.085);
  return j;
}

// signed distance to the figure (body units)
float albBodySDF(vec2 p, float fem, AlbJoints j) {
  vec2 q = vec2(abs(p.x), p.y);
  float head   = sdEllipse(p - vec2(0.0, 0.84), mix(vec2(0.105, 0.135), vec2(0.097, 0.128), fem));
  float neck   = sdCapsule(q, vec2(0.0, 0.66), vec2(0.0, 0.74), mix(0.046, 0.037, fem));
  float chest  = sdEllipse(p - vec2(0.0, 0.47), mix(vec2(0.20, 0.17), vec2(0.165, 0.16), fem));
  float waist  = sdEllipse(p - vec2(0.0, 0.22), mix(vec2(0.145, 0.16), vec2(0.108, 0.15), fem));
  float pelvis = sdEllipse(p - vec2(0.0, 0.03), mix(vec2(0.17, 0.11), vec2(0.205, 0.13), fem));
  float trap   = sdTaper(q, vec2(0.0, 0.665), j.sh + vec2(-0.005, 0.01), mix(0.06, 0.048, fem), 0.055);
  float torso  = smin(smin(chest, waist, 0.12), pelvis, 0.10);
  float breast = sdEllipse(q - vec2(0.07, 0.425), vec2(0.068, 0.058));
  torso = mix(torso, smin(torso, breast, 0.04), fem);
  torso = smin(torso, trap, 0.06);
  float upper = sdTaper(q, j.sh, j.el, mix(0.058, 0.05, fem), mix(0.043, 0.037, fem));
  float fore  = sdTaper(q, j.el, j.wr, mix(0.043, 0.037, fem), mix(0.032, 0.027, fem));
  float hand  = sdTaper(q, j.wr, j.hd, mix(0.035, 0.03, fem), 0.022);
  float arm   = smin(smin(upper, fore, 0.03), hand, 0.02);
  float thigh = sdTaper(q, j.hip, j.kn, mix(0.085, 0.09, fem), mix(0.055, 0.05, fem));
  float shin  = sdTaper(q, j.kn, j.an, mix(0.055, 0.05, fem), mix(0.034, 0.03, fem));
  float foot  = sdTaper(q, j.an + vec2(0.0, -0.02), j.toe, 0.032, 0.022);
  float leg   = smin(smin(thigh, shin, 0.03), foot, 0.02);
  float d = smin(torso, neck, 0.04);
  d = smin(d, head, 0.03);
  d = smin(d, arm, 0.04);
  d = smin(d, leg, 0.05);
  return d;
}

// iso-lines of a field: v = field / spacing, pv = one pixel in those units; fades out when
// the lines get denser than ~3 px so they never shimmer
float albIso(float v, float pv, float widthPx) {
  float dd = abs(fract(v + 0.5) - 0.5) / max(pv, 1e-6);
  return (1.0 - smoothstep(0.5 * widthPx - 0.5, 0.5 * widthPx + 0.8, dd)) * smoothstep(2.5, 5.0, 1.0 / max(pv, 1e-6));
}
// an anti-aliased line along an SDF's zero set, widthPx pixels wide (aa = one pixel)
float albLine(float d, float aa, float widthPx) { return 1.0 - smoothstep(0.5 * widthPx * aa - 0.5 * aa, 0.5 * widthPx * aa + 0.8 * aa, abs(d)); }
// cheap atan2 (|error| < 0.005 rad): the builtin is slow on SwiftShader
float albAtan(float y, float x) {
  float ax = abs(x), ay = abs(y);
  float a = min(ax, ay) / max(max(ax, ay), 1e-9);
  float s = a * a;
  float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  r = ay > ax ? 1.57079637 - r : r;
  r = x < 0.0 ? 3.14159274 - r : r;
  return y < 0.0 ? -r : r;
}
float albNoise3(vec2 p) { return (0.6 * vnoise(p) + 0.4 * vnoise(p * 2.37 + 7.1)); }

// skeleton as fine x-ray outlines: returns the distance to the nearest bone outline
float albBones(vec2 q, AlbJoints j) {
  vec2 a = vec2(abs(q.x), q.y);
  float d = 1e5;
  // skull, jaw, orbits
  vec2 sk = q - vec2(0.0, 0.868);
  d = min(d, sk.y > -0.07 ? abs(sdEllipse(sk, vec2(0.083, 0.10))) : 1e5);
  vec2 jw = q - vec2(0.0, 0.80);
  d = min(d, jw.y < 0.0 ? abs(sdEllipse(jw, vec2(0.066, 0.062))) : 1e5);
  d = min(d, abs(sdEllipse(a - vec2(0.035, 0.838), vec2(0.024, 0.017))));
  // vertebrae (domain repetition), sacrum to skull
  const float cell = 0.0275;
  float id = clamp(floor((q.y - 0.06) / cell), 0.0, 24.0);
  d = min(d, abs(sdBox(vec2(a.x, q.y - 0.06 - (id + 0.5) * cell), vec2(mix(0.021, 0.010, id / 24.0), cell * 0.30)) - 0.003));
  // ribcage: nested arches (iso-lines of a parabolic field), open at the sternum
  float rv = (q.y + 2.2 * a.x * a.x - 0.33) / 0.031;
  vec2 ce = (q - vec2(0.0, 0.47)) / vec2(0.19, 0.165);
  float cage = step(0.016, a.x) * step(dot(ce, ce), 1.0) * step(0.0, rv) * step(rv, 9.6);
  d = min(d, cage > 0.5 ? abs(fract(rv + 0.5) - 0.5) * 0.031 / sqrt(1.0 + 19.36 * a.x * a.x) : 1e5);
  d = min(d, abs(sdCapsule(a, vec2(0.0, 0.57), vec2(0.0, 0.43), 0.011)));            // sternum
  d = min(d, abs(sdCapsule(a, vec2(0.025, 0.628), j.sh + vec2(-0.02, 0.025), 0.007))); // clavicle
  // arm: humerus + head, radius/ulna pair, hand
  d = min(d, abs(sdCapsule(a, j.sh + vec2(-0.012, -0.012), j.el, 0.011)));
  d = min(d, abs(length(a - j.sh - vec2(-0.012, -0.012)) - 0.02));
  d = min(d, abs(sdCapsule(a, j.el, j.wr, 0.011)));
  d = min(d, sdSegment(a, j.wr, j.hd + (j.hd - j.wr) * 0.15));
  // pelvis: ilium wings, sacrum, pubic arch, obturator foramina
  vec2 il = a - vec2(0.085, 0.075);
  d = min(d, il.y > -0.03 ? abs(sdEllipse(il, vec2(0.08, 0.06))) : 1e5);
  vec2 pb = q - vec2(0.0, -0.005);
  d = min(d, pb.y < 0.0 ? abs(sdEllipse(pb, vec2(0.062, 0.042))) : 1e5);
  // leg: femur + head, patella, tibia/fibula pair, foot
  d = min(d, abs(sdCapsule(a, j.hip + vec2(-0.012, -0.015), j.kn, 0.0135)));
  d = min(d, abs(length(a - j.hip - vec2(-0.02, -0.005)) - 0.019));
  d = min(d, abs(length(a - j.kn - vec2(0.0, 0.005)) - 0.016));
  d = min(d, abs(sdCapsule(a, j.kn + vec2(0.0, -0.03), j.an + vec2(0.0, 0.012), 0.011)));
  d = min(d, sdSegment(a, j.an, j.toe));
  return d;
}

// one nerve: a slightly wavy trunk a->b with forking side branches (one per cell). Returns the
// line mask; imp collects a travelling impulse (front = path length from the spine).
float albNerve(vec2 q, vec2 a, vec2 b, float seed, float aa, float s0, float front, inout float imp) {
  vec2 ba = b - a; float L = length(ba); vec2 dir = ba / L, nor = vec2(-dir.y, dir.x);
  vec2 rel = q - a; float u = dot(rel, dir), v = dot(rel, nor);
  v -= 0.005 * sin(u * 37.0 + seed * 7.0);
  float uc = clamp(u, 0.0, L);
  float m = albLine(length(vec2(u - uc, v)), aa, 1.4);
  const float P = 0.04;
  float id = floor(u / P);
  float h1 = hash11(id * 7.13 + seed), h2 = hash11(id * 3.7 + seed * 1.3);
  float uk = (id + 0.08 + 0.25 * h1) * P;
  float side = h2 > 0.5 ? 1.0 : -1.0;
  float k = 0.9 + 0.8 * fract(h2 * 7.0);                 // branch slope (across / along)
  float len = P * (0.55 + 0.4 * h1);
  vec2 b0 = vec2(uk, 0.0), b1 = b0 + len * normalize(vec2(1.0, side * k));
  vec2 mm = mix(b0, b1, 0.5);
  float br = min(sdSegment(vec2(u, v), b0, b1), sdSegment(vec2(u, v), mm, mm + len * 0.55 * normalize(vec2(0.25, side))));
  float bm = albLine(br, aa, 1.0) * 0.55 * step(0.015, uk) * step(uk, L);
  float ds = (s0 + uc - front) * 16.0;
  imp = max(imp, exp(-ds * ds) * max(m, bm * 1.5) * step(0.0, front));
  return max(m, bm);
}

// a small chakra mandala (petal ring, inner yantra polygon), unlit (silver) to lit (colour)
vec3 albChakra(vec2 q, int i, float lit, float aa) {
  vec2 c = chakraPos(i);
  float r = i == 6 ? 0.034 : (i == 5 ? 0.02 : 0.025);
  vec2 d = q - c; float l = length(d);
  float a = albAtan(d.x, d.y);
  float np = i == 0 ? 4.0 : i == 1 ? 6.0 : i == 2 ? 10.0 : i == 3 ? 12.0 : i == 4 ? 16.0 : i == 5 ? 2.0 : 24.0;
  float pr = r * (1.05 + 0.5 * sqrt(abs(cos(a * np * 0.5))));
  float m = max(albLine(l - r, aa, 1.2), albLine(l - pr, aa, 1.0) * step(r, l));
  m = max(m, albLine(l - r * 0.66, aa, 0.9));
  float ns = i == 0 ? 4.0 : i == 2 ? 3.0 : i == 3 ? 6.0 : i == 4 ? 3.0 : i == 6 ? 8.0 : 48.0;
  float ra = a + (i == 2 || i == 4 ? PI : (i == 0 ? PI / 4.0 : 0.0));
  float s = TAU / ns;
  m = max(m, albLine(cos(floor(0.5 + ra / s) * s - ra) * l - r * 0.42, aa, 0.9));
  m = max(m, fill(l - r * 0.1, aa));
  vec3 cc = chakraColor(float(i));
  vec3 unlit = mix(vec3(0.55, 0.62, 0.85), cc, 0.22) * 0.75;
  return m * step(l, r * 2.0) * mix(unlit, cc * 3.0 + 0.5, lit) + lit * cc * 1.6 * exp(-l / r * 1.8);
}

vec4 albedoBody(vec2 w, AlbBody B, float pxw, float ck[7]) {
  vec2 q = (w - B.pos) / B.scale;
  float aa = pxw / B.scale;            // one pixel in body units
  float t = B.t;
  AlbJoints j = albJoints(B.arms, B.fem);
  float d = albBodySDF(q, B.fem, j);
  vec2 a = vec2(abs(q.x), q.y);
  const vec3 VIOLET = vec3(0.40, 0.12, 0.80);     // the Shadow's rim light (kept under the bloom threshold)
#ifdef ALB_SHADOW
  float edge = B.shadowEdge + 0.05 * sin(q.y * 13.0 + t * 1.7) + 0.015 * sin(q.y * 37.0 - t * 4.0);
  float sh = B.shadow * (1.0 - smoothstep(edge - 2.0 * aa, edge + 2.0 * aa, q.x));
#else
  const float sh = 0.0;
#endif
  vec3 tint = B.tint, tint2 = B.tint2;
  vec3 nerveCol = mix(B.nerveCol, vec3(0.55, 0.04, 0.32), sh);
  // draw-on reveal growing out from the heart
  float rv = B.reveal >= 1.0 ? 1.0 : 1.0 - smoothstep(B.reveal * 1.7 - 0.15, B.reveal * 1.7, length(q - vec2(0.0, 0.44)));

  vec3 col = vec3(0.0); float occ = 0.0;

#ifdef ALB_HAIR
  // ---- Anima: long hair falling from the crown behind the shoulders, crescent crown
  {
    float yy = q.y;
    float W = 0.118 + 0.17 * smoothstep(0.93, 0.50, yy) + 0.035 * smoothstep(0.55, 0.30, yy) + 0.018 * sin(yy * 8.0 - t * 2.0);
    float s = a.x / W;                                     // 0 at the parting .. 1 at the outer edge
    float tips = smoothstep(0.0, 0.10, yy - (0.20 + 0.16 * s * s));
    float inHair = (1.0 - smoothstep(0.9, 1.0, s)) * tips * (1.0 - smoothstep(0.965, 0.99, yy + 0.05 * s * s));
    float vis = max(smoothstep(-0.004, 0.006, d), step(0.90, yy) * 0.8);
    float strand = s * 11.0 + 0.8 * sin(yy * 7.0 - t * 1.6 + s * 3.0) * smoothstep(0.95, 0.6, yy) + 0.25 * sin(yy * 19.0 + s * 7.0 - t * 2.7);
    float hl = albIso(strand, aa * 11.0 / W * 1.4, 1.2);
    vec3 hc = mix(vec3(1.0, 0.94, 0.97), vec3(0.72, 0.62, 1.0), s);
    col += hc * (hl * 0.8 + 0.035) * inHair * vis * B.hair;
    occ = max(occ, 0.55 * inHair * vis * B.hair);
    vec2 cp = q - vec2(0.0, 1.055);
    float cres = max(sdCircle(cp, 0.07), -sdCircle(cp - vec2(0.0, 0.04), 0.064));
    col += vec3(1.0, 0.97, 1.0) * (fill(cres, aa) * 2.2 + 0.35 * glowExp(cres, 60.0)) * B.hair;
    col += vec3(0.8, 0.9, 1.0) * sparkle(q, vec2(0.0, 1.075), 0.03 + 0.03 * uOpenHat) * B.hair * (1.0 + 1.5 * uOpenHat);
    occ = max(occ, fill(cres, aa) * B.hair);
  }
#endif

  // ---- aura: nested flame tongues licking outward from the skin (iso-lines of the distance
  //      divided by a flickering tongue length, so every contour is a scaled flame outline)
  {
    float dd = max(d, 0.0);
    float ang = albAtan(a.x, q.y - 0.32);
    float n = albNoise3(vec2(ang * 6.5 + 2.0, t * 1.3 - dd * 3.5));
    float reach = 0.05 + 0.55 * n * n * sqrt(n);
    float F = dd / reach;                                   // 0 at the skin .. 1 at a tongue's tip
    float env = (1.0 - smoothstep(0.55, 1.0, F)) * step(0.0, d);
    float fl = albIso(F * 4.0 - 0.5, aa / reach * 4.0, 1.2) * (1.0 - F) * 1.4;
    vec3 auc = mix(tint, tint2, smoothstep(0.1, 0.8, F));
    vec3 lumA = auc * (fl * 1.0 * env + env * 0.02 + 0.22 * exp(-dd / (aa * 5.0)) * step(0.0, d));
    vec3 shA = VIOLET * (fl * 0.45 * env + 0.15 * exp(-dd / (aa * 5.0)) * step(0.0, d));
    col += mix(lumA, shA, sh) * B.aura * rv;
    col += mix(tint, VIOLET, sh) * albLine(d - 0.024, aa, 1.0) * 0.30 * B.aura * rv;   // second skin
    occ = max(occ, sh * env * 0.65 * rv);
  }

  // ---- the body itself
  float inside = fill(d, aa);
  {
    // translucent fill: brighter towards the skin (fresnel); the Shadow is ink
    float fres = exp(min(d, 0.0) * 30.0);
    vec3 fillL = tint * (0.012 + 0.09 * fres) + vec3(0.0, 0.006, 0.03);
    vec3 fillS = vec3(0.002, 0.0, 0.006) + VIOLET * 0.07 * fres;
    col += mix(fillL, fillS, sh) * inside * rv;
    occ = max(occ, inside * mix(0.86, 0.99, sh) * rv);
    // skin outline
    col += mix(tint * 1.7, VIOLET, sh) * albLine(d, aa, 1.4) * rv;
    // topographic body lines: iso-lines of the body field
    float dep = -d;
    float topo = albIso(dep / 0.019, aa / 0.019, 1.0) * exp(-dep * 9.0) * step(0.006, dep);
    col += mix(tint * 0.28, VIOLET * 0.10, sh) * topo * B.lines * rv;
    // skeleton
    float bone = albLine(albBones(q, j), aa, 1.0) * inside;
    col += mix(mix(vec3(0.70, 0.76, 1.0), tint, 0.4) * 0.55, VIOLET * 0.09, sh) * bone * B.lines * rv;
    // brain: gyri as wrinkled iso-lines inside the cranium
    vec2 br = q - vec2(0.0, 0.89);
    float brm = (1.0 - smoothstep(-0.005, 0.0, sdEllipse(br, vec2(0.074, 0.07)))) * step(-0.035, br.y);
    float g = 0.8 * vnoise(vec2(a.x, q.y) * 30.0 + 3.0) + 0.1 * sin(a.x * 160.0 + q.y * 90.0);
    col += nerveCol * albIso(g * 8.0, aa * 30.0 * 8.0 * 0.6, 1.0) * brm * 0.45 * B.nerves * rv * smoothstep(0.0003, 0.0008, aa);
    // nervous system: spinal cord + mirrored plexus and limb nerves, impulses on the beat
    float imp = 0.0;
    float cord = albLine(a.x - 0.0015 * sin(q.y * 50.0), aa, 1.8) * step(0.02, q.y) * step(q.y, 0.80);
    float dp = (abs(q.y - 0.4) - B.pulse * 0.5) * 14.0;
    imp = max(imp, exp(-dp * dp) * cord * step(0.0, B.pulse));
    float nm = cord;
    nm = max(nm, albNerve(a, vec2(0.004, 0.64), j.sh + vec2(0.0, -0.02), 1.0, aa, 0.0, B.pulse, imp));
    nm = max(nm, albNerve(a, j.sh + vec2(0.0, -0.02), j.wr, 2.0, aa, 0.2, B.pulse, imp));
    nm = max(nm, albNerve(a, j.wr, j.hd + (j.hd - j.wr) * 0.1, 4.0, aa, 0.8, B.pulse, imp));
    nm = max(nm, albNerve(a, vec2(0.006, 0.06), j.kn, 5.0, aa, 0.0, B.pulse, imp));
    nm = max(nm, albNerve(a, j.kn, j.an, 7.0, aa, 0.55, B.pulse, imp));
    col += (nerveCol * nm * mix(1.0, 0.3, sh) + mix(vec3(0.9, 0.95, 1.0) * 2.5, vec3(1.0, 0.15, 0.3) * 0.9, sh) * imp) * inside * B.nerves * rv;
    // the nearest chakra on the midline (unlit unless ck[i] > 0)
    float cy = q.y;
    int ci = cy < 0.04 ? 0 : cy < 0.175 ? 1 : cy < 0.345 ? 2 : cy < 0.55 ? 3 : cy < 0.765 ? 4 : cy < 0.93 ? 5 : 6;
    float hideC = 1.0;
#ifdef ALB_EYE3
    hideC = ci == 5 ? 1.0 - sat(B.eye3 * 4.0) : 1.0;
#endif
    col += albChakra(q, ci, ck[ci], aa) * mix(0.8, 0.15, sh) * rv * hideC;
    // eyes: serene closed lids for the luminous body; open for the Shadow (white, red ring)
    vec2 ep = a - vec2(0.037, 0.836);
    float open = B.eyes * max(sh, B.fem);
    col += mix(tint, VIOLET, sh) * albLine(ep.y + 0.004 * (1.0 - 1600.0 * ep.x * ep.x), aa, 1.2) * 0.7 * (1.0 - open) * step(abs(ep.x), 0.024) * inside;
    float lid = sdVesica(vec2(ep.y, ep.x), max(0.0105 * open, 0.0012), 0.025);
    float inE = fill(lid, aa) * step(0.001, open);
    float er = length(ep);
    vec3 ec = mix(vec3(0.75, 0.88, 1.0) * 1.6, vec3(2.6), sh);
    float ringW = max(0.0022, aa * 2.5);
    vec3 ring = mix(vec3(0.3, 0.6, 1.0) * 2.0, vec3(1.0, 0.04, 0.03) * 4.0, sh) * (1.0 - smoothstep(ringW - aa, ringW + aa, abs(er - 0.0085)));
    col += (ec * (1.0 - 0.8 * smoothstep(0.006, 0.0075, er)) + ring) * inE * open + mix(vec3(0.3, 0.6, 1.0) * 0.3, vec3(1.0, 0.06, 0.08) * 0.8, sh) * exp(-max(lid, 0.0) / (aa * 6.0)) * open;
#ifdef ALB_EYE3
    // third eye: a vertical almond on the brow, an iris of radial fibres, light in the pupil
    vec2 tp = q - vec2(0.0, 0.873);
    float e3 = sdVesica(tp, max(0.011 * B.eye3, 0.001), 0.024);
    float r3 = length(tp), a3 = albAtan(tp.y, tp.x);
    float fib = 0.5 + 0.5 * cos(a3 * 90.0) * (0.6 + 0.4 * cos(a3 * 13.0 + r3 * 400.0));
    float fib2 = 0.5 + 0.5 * cos(a3 * 270.0 + 2.0 * sin(r3 * 900.0));
    vec3 ic = mix(vec3(0.45, 0.75, 1.0), vec3(1.0, 0.85, 0.5), smoothstep(0.009, 0.002, r3));
    float in3 = fill(e3, aa) * step(0.001, B.eye3);
    float iris = in3 * smoothstep(0.0035, 0.0045, r3);
    col = mix(col, vec3(0.0, 0.01, 0.04), in3);
    col += ic * iris * (0.12 + 0.8 * fib * fib2 + 0.7 * albLine(r3 - 0.0062, aa, 1.0) + 0.5 * albLine(r3 - 0.0085, aa, 1.0)) * B.eye3;
    col += vec3(1.0, 0.86, 0.6) * 3.0 * fill(r3 - 0.0032 * B.eye3, aa) * B.eye3;
    col += vec3(0.9, 0.95, 1.0) * albLine(e3, aa, 1.4) * 1.5 * step(0.001, B.eye3);
    col += vec3(1.0, 0.8, 0.5) * exp(-max(r3 - 0.0032, 0.0) / (aa * 6.0)) * 0.8 * B.eye3;
#endif
  }
  return vec4(col, occ * rv);
}
`;

  const SCENE = `
uniform vec2  uVP;        // screen position of the lattice vanishing point (lens shift)
uniform vec3  uRo, uTa;   // 3D camera for the lattice and the mountain
uniform vec4  uCam;       // 2D camera for bodies / moon / pillars: xy centre, z zoom, w roll
uniform float uFlow;      // lattice flow (depth offset)
uniform float uWalls;     // 1 = corridor (walls + ceiling), 0 = open floor under the sky
uniform float uLatI;      // lattice brightness
uniform float uHatN;      // open-hat count (alternating eye blinks)
uniform float uKickAge;   // seconds since the last kick
uniform float uSplit;     // 0..1 the left half of the world turns to the Shadow's palette
uniform vec4  uMoon;      // xy, radius, intensity (2D scene units)
uniform float uPhase;     // crescent width (0.2 thin .. 0.45 wide)
uniform vec4  uBodyA;     // x, y, scale, arms      (the luminous body / the Shadow, left)
uniform vec4  uBodyA2;    // fem, shadow, shadowEdge, -
uniform vec4  uBodyA3;    // aura, eyes, eye3, reveal
uniform vec4  uBodyB;     // x, y, scale, arms      (the Anima, right; scale 0 = absent)
uniform vec4  uBodyB2;    // fem, hair, shadow, eyes
uniform float uPillars;   // 0..1 the pillars B and J rise
uniform float uPillarX;   // their distance from the centre
uniform float uMirror;    // brightness of the mirror line at x = 0
uniform float uRipple;    // clap ripple envelope
uniform float uRippleAge; // seconds since that clap
uniform float uSteps[7];  // each mountain step's rise 0..1
uniform float uBurst;     // 0..1 light of the Self (A4)
uniform float uConverge;  // 0..1 converging speed lines (A4)
uniform vec2  uFocus;     // screen point the lines converge to
uniform float uShock;     // merge shockwave age (s), < 0 = none
uniform float uFlashS;    // scene-level flash (merge)
uniform vec3  uRings;     // ages of the three fill claps (light rings), < 0 = none
uniform float uMandorla;  // 0..1 the mandorla behind the body (A1)

const float FOC = 1.75;
const float MZ = 8.0;       // mountain centre depth
const float FLOOR = -1.15;
const float CELL = 0.5;

vec3 albCamRay(vec2 p) {
  vec3 f = normalize(uTa - uRo);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);
  vec2 s = p - uVP;
  return normalize(r * s.x + u * s.y + f * FOC);
}

// The Universal Mind Lattice: an endless corridor of fine glowing grid lines receding to the
// vanishing point, an almond eye in every cell inside a toroidal ring. With walls = 0 the
// corridor opens to a floor under the night sky (ALB_MOUNTAIN: the floor's cells stack into a
// stepped mountain).
vec3 albLattice(vec2 p, float walls) {
  vec3 ro = uRo, rd = albCamRay(p);
  const float WX = 2.5, CEIL = 2.3;
  float tx = walls > 0.5 ? (sign(rd.x) * WX - ro.x) / rd.x : 1e9;
  float tc = (rd.y > 0.0 && walls > 0.5) ? (CEIL - ro.y) / rd.y : 1e9;
  float tf = rd.y < -1e-4 ? (FLOOR - ro.y) / rd.y : 1e9;
  float tt = min(tx, min(tc, tf));
  float face = tx < min(tc, tf) ? 0.0 : 1.0;
  vec3 P = ro + rd * min(tt, 400.0);
  vec2 uv = face < 0.5 ? vec2(P.y - FLOOR, P.z + uFlow) : vec2(P.x, P.z + uFlow);
#ifdef ALB_MOUNTAIN
  // the mountain: 7 stacked boxes on the floor, nearest hit wins
  {
    float base = FLOOR, mT = 1e9; vec3 mP = vec3(0.0), mN = vec3(0.0);
    vec3 m = 1.0 / rd, am = abs(m), mro = m * ro;
    for (int k = 0; k < 7; k++) {
      float fk = float(k);
      float h = 0.55 * uSteps[k];
      vec3 bc = vec3(0.0, base + h * 0.5, MZ);
      vec3 bh = vec3(6.0 - fk * 0.6, h * 0.5, 3.2 - fk * 0.42);
      vec3 n = mro - m * bc, kk = am * bh;
      vec3 t1 = -n - kk, t2 = -n + kk;
      float tN = max(max(t1.x, t1.y), t1.z), tF = min(min(t2.x, t2.y), t2.z);
      if (h > 0.002 && tN < tF && tF > 0.0 && tN < mT) {
        mT = tN;
        mN = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
        mP = ro + rd * tN;
      }
      base += h;
    }
    if (mT < tt) {
      tt = mT; P = mP;
      face = abs(mN.z) > 0.5 ? 2.0 : abs(mN.y) > 0.5 ? 3.0 : 4.0;
      uv = face == 2.0 ? vec2(P.x, (P.y - FLOOR) / 1.1) : face == 3.0 ? vec2(P.x, P.z) : vec2(P.z, (P.y - FLOOR) / 1.1);
    }
  }
#endif
  float isSky = step(1e8, tt);
  vec2 c = uv / CELL + vec2(0.5, 0.0);
  vec2 fw = fwidth(c);
  float pxc = max(fw.x, fw.y);
  vec2 bd = (0.5 - abs(fract(c) - 0.5)) / max(fw, vec2(1e-5));    // distance to the cell border in px
  float ln = max(1.0 - smoothstep(0.15, 1.1, bd.x), 1.0 - smoothstep(0.15, 1.1, bd.y));
  float fade = smoothstep(0.40, 0.12, pxc);
  float fog = exp(-tt * 0.085);
  // kick pulse: a bright square ring racing away down the corridor
  float ringZ = P.z - (1.2 + uKickAge * 13.0);
  float ring = exp(-ringZ * ringZ * 2.0) * exp(-uKickAge * 2.5) * step(face, 1.5) * walls;
  float side = smoothstep(0.06, -0.06, p.x) * uSplit;          // the Shadow's half of the world
  vec3 lineCol = mix(vec3(0.16, 0.36, 1.0), vec3(0.55, 0.78, 1.0), 0.25 + 0.4 * uKick);
  lineCol = mix(lineCol, vec3(0.30, 0.05, 0.62), side);
  float isMount = step(1.5, face);
  float lineI = mix(0.26, 1.0, isMount) * (0.7 + 0.8 * uKick) + 2.0 * ring;
  vec3 col = lineCol * ln * fade * fog * lineI;
  // an eye in every cell (walls, floor, mountain risers), inside a ring
  vec2 f = fract(c) - 0.5;
  vec2 cid = floor(c);
  float hasEye = max(step(hash21(cid + vec2(face * 17.0, 3.0)), 0.38), isMount);
  float eyeFade = smoothstep(0.07, 0.035, pxc) * smoothstep(0.009, 0.016, pxc) * fog * (1.0 - step(2.5, face)) * hasEye;
  vec2 e = face == 0.0 ? vec2(f.y, f.x) : f;                   // (along, across) in the plane
  float blink = mod(cid.x + cid.y + uHatN, 2.0) < 0.5 ? smoothstep(0.0, 0.45, uOpenHat) : 0.0;
  float open = 1.0 - 0.92 * blink * (1.0 - uReduced * 0.7);
  float lidS = sdVesica(vec2(e.y, e.x), max(0.10 * open, 0.004), 0.23);
  float er = length(e);
  float inEye = fill(lidS, pxc);
  float iris = (albLine(er - 0.07, pxc, 1.1) + fill(er - 0.028, pxc)) * inEye;
  float torus = albLine(er - 0.36, pxc, 1.0) * 0.45 + albLine(er - 0.405, pxc, 0.8) * 0.2;
  vec3 eyeCol = mix(vec3(0.50, 0.80, 1.0), vec3(0.75, 0.08, 0.30), side);
  col += (eyeCol * (albLine(lidS, pxc, 1.2) * 0.4 + iris * 0.75 + inEye * 0.025) + lineCol * torus * 0.45) * eyeFade * (0.5 + 0.6 * uKick + 0.6 * isMount);
  // mountain faces: dark lacquer, the treads lit by the moon
  col += vec3(0.03, 0.05, 0.15) * (face == 3.0 ? 1.0 : face == 2.0 ? 0.12 : face == 4.0 ? 0.06 : 0.0) * fog;
  // fog towards the vanishing point
  col += mix(vec3(0.004, 0.006, 0.03), vec3(0.008, 0.016, 0.065), exp(-tt * 0.02)) * (1.0 - fog) * (1.0 - isSky);
  col *= 1.0 - isSky;
#ifdef ALB_MOUNTAIN
  // night sky with stars (once the corridor opens)
  vec2 sp = vec2(rd.x / max(rd.z, 0.2), rd.y) * 60.0;
  vec2 sid = floor(sp); vec2 so = fract(sp) - 0.5 - (hash22(sid) - 0.5) * 0.6;
  float sh = hash21(sid + 3.1);
  float star = step(0.86, sh) * exp(-dot(so, so) * 90.0) * (0.6 + 0.4 * sin(uTime * 5.0 + sh * 40.0));
  col += isSky * (vec3(0.010, 0.016, 0.07) * (1.0 - sat(rd.y * 2.0)) + vec3(0.75, 0.85, 1.0) * star * 1.2);
#endif
  return col * uLatI;
}

// the moon of Tarot XVIII: a disc with a waxing crescent, fine halo rings, Marseille rays
// (straight and wavy alternating) and falling yods
vec3 albMoon(vec2 w, float pxw) {
  vec2 d = w - uMoon.xy; float R = uMoon.z;
  float r = length(d), a = albAtan(d.x, d.y);
  vec3 col = vec3(0.0);
  float disc = fill(r - R, pxw);
  float shadowC = length(d - vec2(-R * uPhase, R * 0.10)) - R * 0.92;
  float cres = fill(max(r - R, -shadowC), pxw);
  float maria = 0.5 + 0.25 * sin(d.x / R * 7.0 + 1.0) * sin(d.y / R * 5.0 - 0.5);
  col += vec3(0.02, 0.035, 0.12) * disc * (0.7 + 0.6 * maria);
  col += vec3(0.92, 0.95, 1.0) * cres * (0.65 + 0.4 * maria);
  col += vec3(0.95, 0.97, 1.0) * albLine(shadowC, pxw, 1.2) * disc * (1.0 - cres) * 0.6;
  float rings = albIso(r / (R * 0.07), pxw / (R * 0.07), 1.0) * disc * (1.0 - cres);
  col += vec3(0.40, 0.58, 1.0) * rings * 0.28;
  col += vec3(0.9, 0.95, 1.0) * albLine(r - R, pxw, 1.8) * 1.5;
  col += vec3(0.55, 0.7, 1.0) * albLine(r - R * 1.07, pxw, 1.0) * 0.6;
  // rays: alternating straight (outlined) and wavy (a single flowing line)
  const float n = 16.0;
  float sector = (a + uTime * 0.12) / TAU * n;
  float id = floor(sector), fr = fract(sector) - 0.5;
  float rr = (r - R * 1.13) / (R * 1.15);
  float inRay = step(0.0, rr) * step(rr, 1.0) * (1.0 - rr);
  float arcU = r * TAU / n;
  float kickB = 0.75 + 0.5 * uKick;
  float straight = step(mod(id, 2.0), 0.5);
  float ed = (abs(fr) - 0.30 * (1.0 - rr)) * arcU;
  float wv = 0.14 * sin(rr * 13.0 - uTime * 4.0) * (1.0 - 0.5 * rr);
  col += straight * vec3(0.85, 0.92, 1.0) * (albLine(ed, pxw, 1.1) * 0.75 + fill(ed, pxw) * 0.06) * inRay * kickB;
  col += (1.0 - straight) * vec3(0.55, 0.62, 1.0) * albLine((fr - wv) * arcU, pxw, 1.3) * inRay * 0.8 * kickB;
  // soft halo
  col += vec3(0.30, 0.45, 1.0) * exp(-max(r - R, 0.0) / R * 3.0) * 0.12 * (1.0 - disc);
  // yods: tear drops drifting down around the moon
  float ya = albAtan(d.y, d.x) + TAU / 24.0;
  float yid = floor(ya / (TAU / 12.0));
  float yl = mod(ya, TAU / 12.0) - TAU / 24.0;
  float fall = fract(uTime * 0.2 + hash11(yid * 5.1));
  vec2 yp = vec2(r * sin(yl), -(r * cos(yl) - R * (1.4 + 1.3 * fall)));
  float tear = min(sdCircle(yp, R * 0.04), sdTaper(yp, vec2(0.0), vec2(0.0, R * 0.13), R * 0.04, 0.0));
  col += vec3(0.85, 0.9, 1.0) * (albLine(tear, pxw, 1.2) * 1.1 + fill(tear, pxw) * 0.2) * sin(fall * PI);
  return col * uMoon.w;
}

#ifdef ALB_PILLARS
// letters B and J (stroke distance; h = half the letter height)
float albLetterB(vec2 p, float h) {
  float d = sdSegment(p, vec2(-0.5 * h, -h), vec2(-0.5 * h, h));
  vec2 q1 = p - vec2(-0.05 * h, 0.5 * h);
  float b1 = q1.x > 0.0 ? abs(length(q1) - 0.5 * h) : abs(abs(q1.y) - 0.5 * h) + max(-q1.x - 0.45 * h, 0.0);
  vec2 q2 = p - vec2(0.0, -0.5 * h);
  float b2 = q2.x > 0.0 ? abs(length(q2 / vec2(1.15, 1.0)) - 0.5 * h) : abs(abs(q2.y) - 0.5 * h) + max(-q2.x - 0.5 * h, 0.0);
  return min(d, min(b1, b2));
}
float albLetterJ(vec2 p, float h) {
  float d = sdSegment(p, vec2(-0.3 * h, h), vec2(0.75 * h, h));
  d = min(d, sdSegment(p, vec2(0.3 * h, h), vec2(0.3 * h, -0.45 * h)));
  vec2 q = p - vec2(-0.15 * h, -0.45 * h);
  return min(d, q.y < 0.0 ? abs(length(q) - 0.45 * h) : 1e5);
}
// the High Priestess pillars: black B on the left, white J on the right, lotus capitals.
// One evaluation per pixel: the side of the screen picks the pillar.
vec4 albPillar(vec2 w, float pxw) {
  float white = step(0.0, w.x);
  float cx = (white * 2.0 - 1.0) * uPillarX;
  float hw = 0.15;
  float top = mix(-1.9, 0.50, easeOut(uPillars));
  vec2 l = w - vec2(cx, 0.0);
  vec3 base  = mix(vec3(0.006, 0.004, 0.012), vec3(0.34, 0.37, 0.48), white);
  vec3 lineC = mix(vec3(0.40, 0.14, 0.90), vec3(0.06, 0.08, 0.25), white);
  vec3 rimC  = mix(vec3(0.55, 0.20, 1.15), vec3(0.95, 0.97, 1.0), white);
  float toMoon = -sign(cx);
  vec3 col = vec3(0.0);
  // shaft: a fluted cylinder
  float u = l.x / hw;
  float inShaft = step(abs(u), 1.0) * step(l.y, top);
  float nz = sqrt(max(1.0 - u * u, 0.0));
  float fl = albIso(asin(clamp(u, -1.0, 1.0)) / PI * 16.0, pxw / hw / max(nz, 0.12) / PI * 16.0, 1.0);
  float light = 0.25 + 0.75 * nz * (0.55 + 0.45 * u * toMoon);
  col += (base * light + lineC * fl * nz * 0.9 + rimC * smoothstep(0.8, 1.0, u * toMoon) * mix(0.8, 0.5, white)) * inShaft;
  float band = min(abs(l.y - (top - 0.06)), abs(l.y - (top - 0.085)));
  col += rimC * albLine(band, pxw, 1.2) * 0.6 * nz * inShaft;
  col += rimC * albLine(abs(l.x) - hw, pxw, 1.4) * step(l.y, top) * 0.9;
  float occ = inShaft;
  // capital: astragal ring, flaring lotus bell with petals, abacus slab
  vec2 cp = l - vec2(0.0, top);
  float k = sat(cp.y / 0.22);
  float bw = hw * (1.0 + 0.85 * pow(k, 1.7));
  float petal = cp.x / bw * 3.5;
  float scallop = 0.22 - 0.035 * (1.0 - abs(fract(petal + 0.5) - 0.5) * 2.0);
  float bell = max(abs(cp.x) - bw, max(-cp.y, cp.y - scallop));
  float capD = min(min(bell, sdBox(cp, vec2(hw * 1.12, 0.016))), sdBox(cp - vec2(0.0, 0.265), vec2(hw * 1.95, 0.028)));
  float inCap = fill(capD, pxw);
  float pl = albIso(petal, pxw / bw * 3.5, 1.0) * fill(bell, pxw) * smoothstep(0.0, 0.05, cp.y);
  col = mix(col, base * (0.4 + 0.6 * (1.0 - abs(cp.x / max(bw, 1e-3)))), inCap);
  col += lineC * pl * 1.2 + rimC * albLine(capD, pxw, 1.3) * 1.1;
  occ = max(occ, inCap);
  // the letter, engraved
  vec2 lp = l - vec2(0.0, top - 0.24);
  float letter = white > 0.5 ? albLetterJ(lp, 0.07) : albLetterB(lp, 0.07);
  col = mix(col, mix(vec3(0.92, 0.94, 1.0) * 1.8, vec3(0.004, 0.006, 0.03), white), albLine(letter, pxw, 0.016 / pxw) * inShaft);
  return vec4(col, occ);
}
#endif

void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float PX = px();
#ifdef ALB_RIPPLE
  // the clap ripples the mirror: a water-like wave leaving the central axis
  float rippleCrest = 0.0;
  {
    float fr = abs(p.x) - uRippleAge * 2.4;
    float env = exp(-fr * fr * 18.0) * uRipple * (1.0 - 0.7 * uReduced);
    p.x += sin(fr * 30.0) * env * 0.022 * sign(p.x);
    rippleCrest = env * (0.5 + 0.5 * sin(fr * 30.0 + 1.2));
  }
#endif
  // background: night gradient + the lattice
  vec3 col = mix(vec3(0.002, 0.003, 0.016), vec3(0.008, 0.012, 0.05), sat(0.5 - 0.4 * p.y));
  col += albLattice(p, uWalls);

  // 2D scene coordinates (bodies, moon, pillars)
  vec2 w = rot(uCam.w) * p / uCam.z + uCam.xy;
  float pxw = PX / uCam.z;

#ifdef ALB_MIRROR
  // the mirror line (behind the moon)
  col += vec3(0.85, 0.92, 1.0) * (albLine(w.x, pxw, 1.6) * 2.0 + exp(-abs(w.x) / (pxw * 10.0)) * 0.35) * uMirror * smoothstep(-1.2, -0.5, w.y);
#endif
#ifdef ALB_MANDORLA
  // a mandorla (vesica) of quiet darkness behind the figure, rimmed with light
  {
    vec2 mq = (w - uBodyA.xy - vec2(0.0, 0.02 * uBodyA.z)) / uBodyA.z;
    float vz = sdVesica(mq, 0.56, 1.27);
    float pv = pxw / uBodyA.z;
    col *= 1.0 - 0.65 * fill(vz, pv) * uMandorla;
    col += vec3(0.75, 0.88, 1.0) * (albLine(vz, pv, 1.6) * 1.0 + albLine(vz - 0.025, pv, 1.0) * 0.4 + exp(-abs(vz) / 0.03) * 0.07) * uMandorla;
  }
#endif
  // the moon
  {
    vec3 mc = albMoon(w, pxw);
    float disc = fill(length(w - uMoon.xy) - uMoon.z, pxw) * uMoon.w;
    col = col * (1.0 - disc) + mc;
  }
#ifdef ALB_PILLARS
  {
    vec4 pl = albPillar(w, pxw);
    col = col * (1.0 - pl.a) + pl.rgb;
  }
#endif

  float ck[7];
  for (int i = 0; i < 7; i++) ck[i] = 0.0;
  // one body evaluation: left of the mirror the luminous body / the Shadow (A), right of it
  // the Anima (B) when she is present
  {
    AlbBody B = albBodyDefault();
    bool useB = uBodyB.z > 0.0 && w.x > 0.0;
    B.pos = useB ? uBodyB.xy : uBodyA.xy;
    B.scale = useB ? uBodyB.z : uBodyA.z;
    B.arms = useB ? uBodyB.w : uBodyA.w;
    B.fem = useB ? uBodyB2.x : uBodyA2.x;
    B.shadow = useB ? uBodyB2.z : uBodyA2.y;
    B.shadowEdge = uBodyA2.z;
    B.hair = useB ? uBodyB2.y : 0.0;
    B.eyes = useB ? uBodyB2.w : uBodyA3.y;
    B.aura = uBodyA3.x * (1.0 + 0.18 * uHat * (1.0 - 0.7 * uReduced)); B.eye3 = uBodyA3.z; B.reveal = uBodyA3.w;
    B.tint = useB ? vec3(1.0, 0.92, 0.96) : vec3(0.80, 0.93, 1.0);
    B.tint2 = useB ? vec3(0.72, 0.55, 1.0) : vec3(0.50, 0.42, 1.0);
    B.nerveCol = useB ? vec3(0.50, 0.55, 1.7) : vec3(0.22, 0.55, 1.7);
    B.t = uTime;
    B.pulse = uKickAge * 3.0;
    vec4 b = albedoBody(w, B, pxw, ck);
    col = col * (1.0 - b.a) + b.rgb;
  }

#ifdef ALB_SHOCK
  // the merge: a sakuga shockwave ring and a short flash
  {
    float sw = albLine(length((p - vec2(0.0, 0.05)) * vec2(1.0, 1.4)) - uShock * 3.0, PX, 2.0 + 14.0 * uShock);
    col += vec3(0.9, 0.95, 1.0) * sw * 1.4 * exp(-uShock * 2.5) * step(0.0, uShock);
    float fr0 = length((p - vec2(0.0, 0.1)) * vec2(0.8, 1.0));
    col += vec3(0.9, 0.95, 1.1) * uFlashS * (4.0 * exp(-fr0 * 2.2) + 0.25);
  }
#endif
#ifdef ALB_BURST
  // A4: converging speed lines, light rings on the fill claps, the white-gold light of the Self
  vec2 fd = p - uFocus; float fr = length(fd); float fa = albAtan(fd.y, fd.x);
  {
    float sx = fa / TAU * 150.0;
    float sid = floor(sx);
    float hh = hash11(sid + floor(uTime * 12.0) * 7.31);
    float sw = abs(fract(sx) - 0.5) * TAU * fr / 150.0;               // distance to the line centre
    float sl = (1.0 - smoothstep(0.0, PX * (0.6 + 1.6 * hh), sw)) * step(0.55, hh) * smoothstep(0.35 * (0.6 + 0.6 * hh), 0.35 * (0.9 + 0.6 * hh) + 0.3, fr);
    col += vec3(0.75, 0.88, 1.0) * sl * uConverge * 0.9;
  }
  for (int i = 0; i < 3; i++) {
    float ra = uRings[i];
    col += vec3(1.0, 0.82, 0.5) * albLine(fr - ra * 4.0, PX, 3.0 + 30.0 * ra) * 3.0 * exp(-ra * 3.0) * step(0.0, ra);
  }
  float rc = 0.5 + 0.5 * cos(fa * 24.0 + 0.4 * sin(fa * 5.0 + uTime * 2.0));
  float rays = rc * rc; rays *= rays; rays *= rays;
  float rays2 = 0.5 + 0.5 * cos(fa * 72.0 - uTime * 1.5);
  vec3 gold = vec3(1.0, 0.70, 0.30);
  col += gold * (exp(-fr * mix(10.0, 1.2, uBurst)) * 2.5 + rays * exp(-fr * mix(5.0, 0.7, uBurst)) * 1.6) * uBurst;
  float wash = smoothstep(0.65, 1.0, uBurst);
  col = mix(col, gold * (1.3 + 0.9 * exp(-fr * 1.5)) + vec3(1.0, 0.85, 0.6) * (rays * 1.2 + rays2 * 0.25) * exp(-fr * 0.8), wash * 0.92);
#endif
#ifdef ALB_RIPPLE
  col += vec3(0.6, 0.75, 1.0) * rippleCrest * 0.22;
#endif
  fragColor = vec4(col, 1.0);
}
`;

  window.ALBEDO_BODY_GLSL = BODY;

  const BEAT = MO.BEAT;
  const bt = (b) => b * BEAT;
  const T0 = bt(16), T1 = bt(20), T2 = bt(24), T3 = bt(28), T4 = bt(32);
  const TM = bt(25);                   // the merge (A3), on the clap
  const E = MO.easeInOut, EO = MO.easeOut, EI = MO.easeIn, SM = MO.smooth, C = MO.clamp, mix = MO.mix;
  const MZ = 8.0, FLOOR = -1.15;
  // A3 end camera: high, looking slightly down at the summit; the lens shift puts the summit at y = -0.2
  const RO_END = [0, 2.5, -2.5], TA_END = [0, 1.7, 8.0];
  let VP_END = 0;

  // project a 3D point with the scene camera (same maths as albCamRay)
  function project(P, ro, ta, vp) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const f = nrm(sub(ta, ro)), r = nrm(cross([0, 1, 0], f)), u = cross(f, r);
    const d = sub(P, ro), z = dot(d, f);
    return [dot(d, r) / z * 1.75 + vp[0], dot(d, u) / z * 1.75 + vp[1], z];
  }
  const mixv = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  VP_END = -0.2 - project([0, FLOOR + 7 * 0.55, MZ - 0.5], RO_END, TA_END, [0, 0])[1];

  function uniforms(t) {
    const kick = MO.last('kick', t), kickAge = kick ? t - kick.e.t : 9;
    const clap = MO.last('clap', t), clapAge = clap ? t - clap.e.t : 9;
    const u = {};
    u.uKickAge = kickAge;
    u.uHatN = MO.count('openHat', t);
    // lattice flow: half a cell per beat, surging forward on each kick
    const beat = t / BEAT;
    let flow = (Math.floor(beat) + EO(C((beat % 1) * 2.2))) * 0.5;

    let cam = [0, 0, 1, 0];
    let ro = [0, 0, 0], ta = [0, 0, 1], vp = [0, 0.62];
    let walls = 1, latI = 1;
    let A = [0, 0.02, 0.86, 0], A2 = [0, 0, -9, 0], A3 = [1, 0, 0, 1];
    let Bb = [0, 0, 0, 0], B2 = [1, 1, 0, 0];
    let moon = [0, 0.72, 0.30, 0.65], phase = 0.2;
    let pillars = 0, pillarX = 1.42, mirror = 0, split = 0;
    const steps = [0, 0, 0, 0, 0, 0, 0];
    let burst = 0, converge = 0, focus = [0, 0], shock = -1, flashS = 0;
    const rings = [-1, -1, -1];

    if (t < T1) {
      // A1: the luminous body; ink floods its left half by "left" (beat 18)
      const k = (t - T0) / (T1 - T0);
      cam = [0, 0.02 + 0.03 * k, 0.94 + 0.08 * SM(k), 0.0];
      A3[3] = 0.15 + 0.85 * EO((t - T0) / 0.38);                  // draw-on behind the flash
      A3[0] = 0.4 + 0.6 * EO((t - T0) / 0.5);
      const ink = E((t - bt(17) + 0.12) / (bt(18) - bt(17) + 0.12));
      A2 = [0, 1, mix(-0.75, 0.0, ink), 0];
      A3[1] = EO((t - bt(18)) / 0.12);                            // the Shadow opens its eye on "left"
      split = ink;
      mirror = 0.3 * ink;
      u.uMandorla = EO((t - T0) / 0.3);
    } else if (t < T2) {
      // A2: the syzygy. Out of the mirror: the Shadow to the left, the Anima to the right.
      const k = (t - T1) / (T2 - T1);
      const s = EO((t - T1) / 0.42);
      cam = [0, 0.03 * SM(k), 1.0 + 0.09 * SM(k), 0.012 * Math.sin(k * Math.PI) * (MO.reduced ? 0.3 : 1)];
      const x = 0.66 * s, sc = mix(0.86, 0.72, s), y = mix(0.02, -0.12, s);
      const breathe = 0.012 * Math.sin((t - T1) * 2.4) * s;
      A = [-x, y + breathe, sc, 0.04 * s * (0.5 + 0.5 * Math.sin((t - T1) * 2.4))];
      A2 = [0, 1, 9, 0];
      A3 = [1 + 0.35 * MO.env('kick', t, 0.15), 1, 0, 1];
      Bb = [x, y - breathe, sc, 0.04 * s * (0.5 - 0.5 * Math.sin((t - T1) * 2.4))];
      B2 = [C(s * 1.4), C(s * 1.5), 0, 0.6];
      moon = [0, mix(0.72, 0.40, s), mix(0.30, 0.28, s), mix(0.65, 1, s)];
      phase = mix(0.2, 0.4, s);
      pillars = C((t - T1) / 0.55);
      split = 1;
      mirror = 0.7 - 0.45 * s + 0.8 * MO.env('clap', t, 0.15);
    } else if (t < T3) {
      // A3: back into the mirror, the Rebis; washed white, carried up the rising mountain
      if (t < TM) {
        const s = 1 - EI((t - T2) / (TM - T2));
        const x = 0.66 * s;
        A = [-x, -0.12, 0.72, 0];
        A2 = [0, 1, 9, 0];
        A3 = [1, 1, 0, 1];
        Bb = [x, -0.12, 0.72, 0];
        B2 = [1, 1, 0, 0.6];
        moon = [0, 0.40, 0.28, 1]; phase = 0.4;
        pillars = 1; split = 1; mirror = 0.6 + 0.6 * EI((t - T2) / (TM - T2));
      } else {
        const after = t - TM;
        const wash = SM(after / 0.8);
        const camK = E(C(after / 1.2));
        walls = after < 0.05 ? 1 : 0;                              // the corridor falls away in the flash
        flashS = C(1 - after / 0.07) * (MO.reduced ? 0.3 : 1);                // two frames
        for (let i = 0; i < 7; i++) steps[i] = EO(C((t - bt(25 + i * 0.42)) / 0.2));
        flow = (Math.floor(TM / BEAT) + 1) * 0.5;
        ro = mixv([0, 0, 0], RO_END, camK);
        ta = mixv([0, 0, 1], TA_END, camK);
        vp = [0, mix(0.62, VP_END, camK)];
        let top = FLOOR; for (let i = 0; i < 7; i++) top += 0.55 * steps[i];
        const sp = project([0, top, MZ - 0.5], ro, ta, vp);
        const climb = E(C((after - 0.05) / 1.05));
        const sc = mix(0.72, 0.36, climb);
        const feet = mix(-0.84, sp[1], climb);
        A = [0, feet + sc, sc, 0.7 * SM(after / 1.0)];
        A2 = [0.5 * wash, 1 - wash, 9, 0];
        A3 = [1 + 0.4 * wash, 1 - wash, 0, 1];
        if (after < 0.8) { Bb = [0, A[1], sc, A[3]]; B2 = [1 - 0.5 * wash, 1 - wash, 0, 0]; }
        moon = [0, mix(0.40, feet + sc * 1.45, climb), mix(0.28, 0.52, climb), 1]; phase = mix(0.4, 0.3, climb);
        pillars = 1; pillarX = mix(1.42, 2.6, E(C(after / 0.6)));
        split = 1 - wash;
        mirror = Math.max(0, 0.6 - after * 3);
        shock = after;
      }
    } else {
      // A4: cut in close; push into the third eye; all lines converge; the light of the Self
      const body = [0, -0.62, 1.0];
      const eye = [0, body[1] + 0.873 * body[2]];
      const tSelf = bt(29), tLight = bt(30.5);
      let center, zoom;
      if (t < tSelf) {
        const k = (t - T3) / (tSelf - T3);
        center = mixv([0, -0.06], [0, -0.02], k); zoom = mix(1.12, 1.28, k);
      } else {
        const k = E(C((t - tSelf) / 0.22));
        center = mixv([0, -0.02], eye, k);
        zoom = Math.exp(MO.keys([[tSelf, Math.log(1.28)], [tSelf + 0.22, Math.log(2.6)], [tLight, Math.log(8)], [bt(31.6), Math.log(140)]], t, (x) => x));
      }
      cam = [center[0], center[1], zoom, 0.035 * Math.sin(t * 3.0) * (1 - C((t - tSelf) / 0.4))];
      focus = [(eye[0] - center[0]) * zoom, (eye[1] - center[1]) * zoom];
      vp = focus;
      flow += 16 * EI(C((t - T3) / (T4 - T3)));
      A = [body[0], body[1], body[2], 0.7];
      A2 = [0.5, 0, 9, 0];
      A3 = [1.4, 0, EO((t - tSelf) / 0.3), 1];
      moon = [0, body[1] + 0.86, 0.40, 0.55 * C(1 - (zoom - 1.3) / 0.6)]; phase = 0.22;
      converge = SM((t - tSelf) / 0.4) * (1 - SM((t - bt(31.2)) / 0.3));
      burst = Math.max(SM((t - tLight) / (bt(31.7) - tLight)) * 0.8, SM((t - bt(31.55)) / 0.3));
      [12, 14, 15].forEach((s, i) => { const ts = MO.barTime(7, 0, s); rings[i] = t >= ts ? t - ts : -1; });
      latI = 1 - 0.5 * burst;
    }

    // gentle kick zoom pulse on the 2D camera
    cam[2] *= 1 + 0.006 * MO.env('kick', t, 0.1) * (MO.reduced ? 0.3 : 1);
    u.uFlow = flow; u.uWalls = walls; u.uLatI = latI;
    u.uCam = cam; u.uRo = ro; u.uTa = ta; u.uVP = vp;
    u.uBodyA = A; u.uBodyA2 = A2; u.uBodyA3 = A3; u.uBodyB = Bb; u.uBodyB2 = B2;
    u.uMoon = moon; u.uPhase = phase; u.uPillars = pillars; u.uPillarX = pillarX; u.uMirror = mirror; u.uSplit = split;
    u.uSteps = steps;
    u.uBurst = burst; u.uConverge = converge; u.uFocus = focus; u.uShock = shock; u.uFlashS = flashS; u.uRings = rings;
    // the clap ripples the mirror (A2)
    u.uRipple = t >= T1 && t < T2 ? MO.env('clap', t, 0.35) : 0;
    u.uRippleAge = clapAge;
    return u;
  }

  // one shader per shot, each with only the features it needs
  const shot = (id, from, to, defs) => MO.scene({
    id, section: 'albedo', from, to,
    fs: defs.map((d) => `#define ${d}\n`).join('') + BODY + SCENE,
    uniforms: (t) => uniforms(t),
    bloom: 0.45,
    vignette: 0.4,
  });
  shot('albedo-a1', T0, T1, ['ALB_SHADOW', 'ALB_MIRROR', 'ALB_MANDORLA']);
  shot('albedo-a2', T1, T2, ['ALB_SHADOW', 'ALB_HAIR', 'ALB_MIRROR', 'ALB_PILLARS', 'ALB_RIPPLE']);
  shot('albedo-a3', T2, TM, ['ALB_SHADOW', 'ALB_HAIR', 'ALB_MIRROR', 'ALB_PILLARS']);
  shot('albedo-a3b', TM, T3, ['ALB_SHADOW', 'ALB_HAIR', 'ALB_MIRROR', 'ALB_MOUNTAIN', 'ALB_SHOCK']);
  shot('albedo-a4', T3, T4, ['ALB_EYE3', 'ALB_BURST']);
})();
