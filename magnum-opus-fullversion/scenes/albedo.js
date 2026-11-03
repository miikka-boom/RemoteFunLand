// ALBEDO — XVIII The Moon. Owner: albedo agent. Five shot factories (30 s piece: beats 16–32,
// bars 4–7); the comment block above each shot() call documents its length, stretch and params.
//
// albedo.a1  "Shadow on the left,"      the luminous body (Sacred Mirrors) in the Universal Mind
//                                       Lattice, moon halo; ink floods its left half, the Shadow's eye opens.
// albedo.a2  "Anima on the right,"      the mirror: the Shadow steps out to the left, the Anima to the
//                                       right, framed by the High Priestess pillars B and J, moon between.
// albedo.a3  "climb ..."                they step back into the mirror (1 beat, into the merge) ...
// albedo.a3b "... the Holy Mountain"    ... and become one (the Rebis), the corridor falls away, the
//                                       floor stacks into a stepped mountain, the figure is carried
//                                       up to the summit under the moon.
// albedo.a4  "to the Self, the light!"  cut in close, push into the third eye, all lines converge,
//                                       white-gold light; on the last clap it inhales into the eye.
// Without a cue list in the score the file places the five shots at their 30 s windows (end of file).
//
// Safety (spec 7.3, 7.5):
// - rule 1 (anti-strobe), measured per 1/30 s: the body's repeated linework (albIso: topographic lines,
//   flame contours, hair, brain, moon rings, pillar flutes; the ribs and vertebrae) fades to its average
//   cover where the picture moves fast (uMoveV: the 2D camera's zoom, roll and pan without the kick
//   pulse, the bodies' travel and scale); the lattice fades the same way when its whole image slides
//   (uLatV: a4's lens shift, a3b's dolly) and its rungs blur when the flow races (uFlowV). Still = no-op.
// - rule 3: the lattice's eyes never blink (hundreds are on screen; the 30 s piece closed half of them on
//   every open hat).
// - rule 5: the lattice's kick pulse is +15 % of its rest brightness (+25 % from the key change, the final
//   chorus; x0.3 reduced), down from +114 %; its colour shift scales with it.
// - reduced: a4's speed lines freeze; the nerves' kick impulses are off; a4's corridor is dimmer; the merge's
//   flash, the clap ripple, the hat aura swell, a2's sway and the kick zoom pulse are smaller.
//
// The luminous body is a self-contained GLSL block (BODY below, exported as
// window.ALBEDO_BODY_GLSL) so the citrinitas scene can reuse it: build an AlbBody with
// albBodyDefault(), set its fields and call albedoBody(). See the comments in the block.
//
// Performance: on SwiftShader (the MP4 renderer) every instruction of a shader runs for every
// pixel whatever its per-pixel branches do, so the frame cost is pixels x total code size (uniform
// branches are skipped, hence the knobs are uniforms). Hence one
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
// Optional features, enabled by #define before this block (the scene below also has ALB_MOUNTAIN,
// ALB_PILLARS, ALB_MIRROR, ALB_MANDORLA, ALB_RIPPLE, ALB_SHOCK, ALB_BURST and ALB_BURN):
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

// anti-strobe input: the picture's speed at the pixel being drawn, in pixels per 1/30 s (the scene sets it
// before albedoBody; 0 = still, and then every line below renders exactly as without it)
float albSpd = 0.0, albDim = 1.0;   // albDim: the motion-blur dimming of a ~1.4 px line at that speed
// iso-lines of a field: v = field / spacing, pv = one pixel in those units; fades out when
// the lines get denser than ~3 px so they never shimmer
// the shimmer in time as well (spec 7.3 rule 1): albSpd (above) is the picture's speed at the pixel being
// drawn; lines that would cross a pixel more than ~2 times a second fade to their average coverage
float albIso(float v, float pv, float widthPx) {
  float dd = abs(fract(v + 0.5) - 0.5) / max(pv, 1e-6);
  float sp = smoothstep(2.5, 5.0, 1.0 / max(pv, 1e-6)), as = moAntiStrobe(pv * albSpd);
  return (1.0 - smoothstep(0.5 * widthPx - 0.5, 0.5 * widthPx + 0.8, dd)) * sp * as + min(1.0, (widthPx + 0.3) * pv) * sp * (1.0 - as);
}
// an anti-aliased line along an SDF's zero set, widthPx pixels wide (aa = one pixel). Faster than 2 px per
// 1/30 s it dims like a motion-blurred line (albDim: its width over the distance it travels), so the
// outlines of a figure rushing past do not flash pixel by pixel (spec 7.3 rule 1); exact no-op when slow.
float albLine(float d, float aa, float widthPx) { return (1.0 - smoothstep(0.5 * widthPx * aa - 0.5 * aa, 0.5 * widthPx * aa + 0.8 * aa, abs(d))) * albDim; }
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
    float asB = moAntiStrobe(aa / 0.031 * albSpd);                 // the ribs and vertebrae repeat every ~0.03
    float bone = albLine(albBones(q, j), aa, 1.0) * inside * asB;
    col += mix(mix(vec3(0.70, 0.76, 1.0), tint, 0.4) * 0.55, VIOLET * 0.09, sh) * bone * B.lines * rv;
    col += mix(mix(vec3(0.70, 0.76, 1.0), tint, 0.4) * 0.55, VIOLET * 0.09, sh) * min(1.0, 0.7 * aa / 0.031) * inside * (1.0 - asB) * B.lines * rv;
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
uniform vec3  uRings;     // ages of the fill claps on steps 12 and 14 (light rings), < 0 = none; z unused
uniform float uMandorla;  // 0..1 the mandorla behind the body (A1)
uniform float uPush;      // whole-picture zoom about the centre (A3b: the residual camera push)
uniform float uFlowV;     // lattice flow speed in cells per 1/30 s (blurs the moving rungs)
uniform float uLatR;      // A1: the lattice is lit out to this depth (the reveal wave racing away)
uniform float uClimb;     // A3b: how many steps the figure's feet have passed (0..7)
uniform float uInhale;    // A4: 0..1 the light pulls back into the third eye before beat 32
uniform vec2  uTurn;      // knob: whole-frame roll as (cos, sin) of the angle (sin 0 = off)
uniform float uPalOn;     // knob: 1 = apply the palette matrix uPalM (0 = the moon palette as is)
uniform mat3  uPalM;      // knob: palette colour matrix
uniform float uSeedL;     // knob: reshuffles which lattice cells hold an eye
uniform float uLatV;      // anti-strobe: how far the lattice image slides per 1/30 s (lens shift, dolly; units of p)
uniform float uKickL;     // the lattice's kick pulse (spec 7.3 rule 5: +15 % of its rest brightness, +25 % in the
                          // final chorus, x0.3 reduced; the 30 s piece pulsed it +114 %)
uniform vec2  uMoveV;     // anti-strobe: the 2D picture's motion per 1/30 s: x = |d ln zoom| + |d roll| (+ the
                          // bodies' scale) about the centre, y = its pan and the bodies' travel (units of p)
#ifdef ALB_BURN
uniform vec4  uBurn;      // a1 burn knob: x = the burn front in body units (ink above it; -9 = off), y = the
                          // world split's front in screen y (the Shadow's half recedes above it; -9 = off),
                          // z = the embers' clock (s), w = the embers and the front's glow (0 = off)
#endif

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
  float mK = 0.0, mTop = 0.0, mFront = 0.0, mHalf = 0.0;     // the hit step: index, top, front, half width
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
        mK = fk; mTop = base + h; mFront = MZ - bh.z; mHalf = bh.x;
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
  // The rails (c.x lines) stay put; the rungs (c.y lines) travel with the flow. Moving more than
  // ~1/3 of a cell per frame they would strobe (wagon wheel), so they blur into their average cover.
  float mb = smoothstep(0.2, 0.55, uFlowV);
  float ln = max(1.0 - smoothstep(0.15, 1.1, bd.x), mix(1.0 - smoothstep(0.15, 1.1, bd.y), min(1.25 * fw.y, 1.0), mb));
  // anti-strobe (7.3 rule 1): when the whole lattice image slides (uLatV), lines that would cross a pixel
  // more than ~2 times a second fade to their average cover; the cell eyes (finer) fade out sooner
  float slide = pxc * uLatV / (px() / uPush), asL = moAntiStrobe(slide), asE = moAntiStrobe(3.0 * slide);
  ln = ln * asL + min(1.0, 1.25 * (fw.x + fw.y)) * (1.0 - asL);
  float fade = smoothstep(0.40, 0.12, pxc);
  float fog = exp(-tt * 0.085);
  // kick pulse: a bright square ring racing away down the corridor
  float ringZ = P.z - (1.2 + uKickAge * 13.0);
  float ring = exp(-ringZ * ringZ * 2.0) * exp(-uKickAge * 2.5) * step(face, 1.5) * walls;
  float side = smoothstep(0.06, -0.06, p.x) * uSplit;          // the Shadow's half of the world
#ifdef ALB_BURN
  side *= smoothstep(uBurn.y - 0.15, uBurn.y + 0.15, p.y);       // burn: it recedes upward with the front
#endif
  vec3 lineCol = mix(vec3(0.16, 0.36, 1.0), vec3(0.55, 0.78, 1.0), 0.25 + 0.5 * uKickL * uKick);
  lineCol = mix(lineCol, vec3(0.30, 0.05, 0.62), side);
  float isMount = step(1.5, face);
  float lineI = mix(0.26, 1.0, isMount) * (0.7 + uKickL * uKick) + 2.0 * ring;
  vec3 col = lineCol * ln * fade * fog * lineI;
  // an eye in every cell (walls, floor, mountain risers), inside a ring
  vec2 f = fract(c) - 0.5;
  vec2 cid = floor(c);
  float hasEye = max(step(hash21(cid + vec2(face * 17.0, 3.0 + uSeedL)), 0.38), isMount);
  float eyeFade = smoothstep(0.07, 0.035, pxc) * smoothstep(0.009, 0.016, pxc) * fog * (1.0 - step(2.5, face)) * hasEye * (1.0 - 0.7 * mb);
  vec2 e = face == 0.0 ? vec2(f.y, f.x) : f;                   // (along, across) in the plane
  // the lattice eyes stay open: hundreds are on screen, so by spec 7.3 rule 3 they never blink (the
  // 30 s piece closed half of them on every open hat)
  float lidS = sdVesica(vec2(e.y, e.x), 0.10, 0.23);
  float er = length(e);
  float inEye = fill(lidS, pxc);
  float iris = (albLine(er - 0.07, pxc, 1.1) + fill(er - 0.028, pxc)) * inEye;
  float torus = albLine(er - 0.36, pxc, 1.0) * 0.45 + albLine(er - 0.405, pxc, 0.8) * 0.2;
  vec3 eyeCol = mix(vec3(0.50, 0.80, 1.0), vec3(0.75, 0.08, 0.30), side);
  col += (eyeCol * (albLine(lidS, pxc, 1.2) * 0.4 + iris * 0.75 + inEye * 0.025) + lineCol * torus * 0.45) * eyeFade * asE * (0.5 + 0.75 * uKickL * uKick + 0.6 * isMount);
  // A1: the lattice lights up behind a wave racing away from the camera (dark ground for the reveal)
  col *= 1.0 - 0.9 * smoothstep(uLatR - 3.0, uLatR, P.z);
  // mountain faces: dark lacquer, the treads lit by the moon
  col += vec3(0.03, 0.05, 0.15) * (face == 3.0 ? 1.0 : face == 2.0 ? 0.12 : face == 4.0 ? 0.06 : 0.0) * fog;
#ifdef ALB_MOUNTAIN
  // moonlit rims on the step edges; every step lights up as the figure climbs past it and the
  // one under its feet flares
  {
    vec3 ed = vec3(mTop - P.y, P.z - mFront, mHalf - abs(P.x));   // to the hit step's top, front, side edge
    float e = face == 2.0 ? min(ed.x, ed.z) : face == 3.0 ? min(ed.y, ed.z) : min(ed.x, ed.y);
    float aaE = min(fwidth(e), tt * px() * 3.0 / FOC);              // capped: e jumps between steps
    float k = uClimb - mK;                                          // >= 1: the feet are on or above it
    float lit = sat(k), under = exp(-(k - 1.0) * (k - 1.0) * 3.0);
    float rim = albLine(e, aaE, 1.7) * (0.9 + 0.7 * lit + 1.0 * under) + exp(-max(e, 0.0) / 0.05) * (0.06 + 0.1 * lit + 0.15 * under);
    col += vec3(0.70, 0.82, 1.0) * rim * isMount * fog;
    col += vec3(0.04, 0.07, 0.20) * (0.5 * lit + 0.6 * under) * (face == 3.0 ? 1.0 : 0.3) * isMount * fog;
  }
#endif
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
  vec2 p = uvCentered(gl_FragCoord.xy) / uPush;
  if (uTurn.y != 0.0) p = mat2(uTurn.x, -uTurn.y, uTurn.y, uTurn.x) * p;   // roll knob = rot(angle) * p; a uniform branch, free when off
  float PX = px() / uPush;
  albSpd = (length(p) * uMoveV.x + uMoveV.y) / PX;   // the picture's speed here in px per 1/30 s (anti-strobe)
  albDim = 2.4 / (2.4 + max(albSpd - 2.0, 0.0));
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
  float walls = uWalls;
#ifdef ALB_SHOCK
  // the merge's shockwave blows the corridor away: the walls survive only outside its ring
  float shR = length((p - vec2(0.0, 0.05)) * vec2(1.0, 1.4));
  float shRing = uShock * (3.0 + 3.5 * uShock);                  // accelerating: off screen by ~0.5 s
  if (uShock >= 0.0) walls *= step(shRing, shR);
#endif
  col += albLattice(p, walls);

  // 2D scene coordinates (bodies, moon, pillars)
  vec2 w = rot(uCam.w) * p / uCam.z + uCam.xy;
  float pxw = PX / uCam.z;

#ifdef ALB_MIRROR
  // the mirror line (behind the moon; a uniform branch, skipped once it has faded)
  if (uMirror > 0.0) col += vec3(0.85, 0.92, 1.0) * (albLine(w.x, pxw, 1.6) * 2.0 + exp(-abs(w.x) / (pxw * 10.0)) * 0.35) * uMirror * smoothstep(-1.2, -0.5, w.y);
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
  // the moon (a branch on a uniform, so it costs nothing once it has faded out in the A4 push)
  if (uMoon.w > 0.0) {
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
#ifdef ALB_BURN
    // burn: the ink burns off from the feet up behind a ragged, flickering flame front (ink above it); the
    // embers shed behind the front drift up and die out. One uniform branch, skipped when burn is off.
    vec3 burnC = vec3(0.0), burnE = vec3(0.0);
    if (uBurn.w > 0.0) {
      vec2 bq = (w - B.pos) / B.scale;
      float fy = uBurn.x + 0.035 * sin(bq.x * 31.0 + uTime * 9.0) + 0.02 * sin(bq.x * 67.0 - uTime * 13.0);
      B.shadow *= smoothstep(fy - 0.02, fy + 0.03, bq.y);
      float lh = smoothstep(0.08, -0.04, bq.x) * step(abs(bq.x), 0.5) * uBurn.w;   // the Shadow's (left) half
      vec2 eg = vec2(bq.x, bq.y - 0.55 * uBurn.z) * 18.0;
      vec2 ec = floor(eg), eh = hash22(ec + 7.0);
      vec2 eo = (eh - 0.5) * 0.7 + vec2(0.12 * sin(uBurn.z * 3.0 + eh.y * 20.0), 0.0);
      vec2 ed = (fract(eg) - 0.5 - eo) / 18.0;
      float below = uBurn.x - bq.y;
      float life = exp(-max(below, 0.0) / 0.35) * step(0.0, below) * step(0.62, eh.x) * step(-1.05, bq.y);
      burnC = vec3(1.0, 0.78, 0.5) * 1.8 * exp(-dot(ed, ed) / 0.00005) * life * (0.6 + 0.4 * eh.y) * lh;
      burnE = vec3(1.0, 0.62, 0.30) * 1.2 * exp(-abs(bq.y - fy) / 0.025) * lh;   // the burning edge (x the body's cover)
    }
#endif
    B.shadowEdge = uBodyA2.z;
    B.hair = useB ? uBodyB2.y : 0.0;
    B.eyes = useB ? uBodyB2.w : uBodyA3.y;
    B.aura = uBodyA3.x * (1.0 + 0.18 * uHat * (1.0 - 0.7 * uReduced)); B.eye3 = uBodyA3.z; B.reveal = uBodyA3.w;
    B.tint = useB ? vec3(1.0, 0.92, 0.96) : vec3(0.80, 0.93, 1.0);
    B.tint2 = useB ? vec3(0.72, 0.55, 1.0) : vec3(0.50, 0.42, 1.0);
    B.nerveCol = useB ? vec3(0.50, 0.55, 1.7) : vec3(0.22, 0.55, 1.7);
    B.t = uTime;
    B.pulse = uReduced > 0.5 ? -1.0 : uKickAge * 3.0;   // the nerves' kick impulse; off in reduced mode (7.5: kick pump)
    vec4 b = albedoBody(w, B, pxw, ck);
    col = col * (1.0 - b.a) + b.rgb;
#ifdef ALB_BURN
    col += burnC + burnE * b.a;
#endif
  }

#ifdef ALB_SHOCK
  // the merge: a sakuga shockwave ring (it sweeps the corridor away) and a short glow at the
  // centre; no full-screen white, so the union itself stays visible
  {
    float sw = albLine(shR - shRing, PX, 2.0 + 14.0 * uShock);
    col += vec3(0.9, 0.95, 1.0) * sw * 2.0 * exp(-uShock * 2.0) * step(0.0, uShock);
    float fr0 = length((p - vec2(0.0, 0.1)) * vec2(0.8, 1.0));
    col += vec3(0.9, 0.95, 1.1) * uFlashS * 1.5 * exp(-fr0 * 2.2);
  }
#endif
#ifdef ALB_BURST
  // A4: light rings on the fill claps, the white-gold light of the Self, the inhale, and the
  // converging speed lines on top
  vec2 fd = p - uFocus; float fr = length(fd); float fa = albAtan(fd.y, fd.x);
  for (int i = 0; i < 2; i++) {
    float ra = uRings[i];
    col += vec3(1.0, 0.82, 0.5) * albLine(fr - ra * 4.0, PX, 3.0 + 30.0 * ra) * 3.0 * exp(-ra * 3.0) * step(0.0, ra);
  }
  float rc = 0.5 + 0.5 * cos(fa * 24.0 + 0.4 * sin(fa * 5.0 + uTime * 2.0));
  float rays = rc * rc; rays *= rays; rays *= rays;
  vec3 gold = vec3(1.0, 0.70, 0.30);
  col += gold * (exp(-fr * mix(10.0, 1.2, uBurst)) * 2.5 + rays * exp(-fr * mix(5.0, 0.7, uBurst)) * 1.6) * uBurst;
  // the inhale (from the accented last clap to beat 32): a ring implodes onto the third eye and
  // the dark closes in behind it, so the light gathers into the eye just before the cut
  float ri = 1.6 * (1.0 - uInhale * uInhale);
  col *= 1.0 - 0.97 * smoothstep(0.0, 0.15, uInhale) * smoothstep(ri - 0.05, ri + 0.25, fr);
  col += vec3(1.0, 0.86, 0.6) * albLine(fr - ri, PX, 4.0 + 4.0 * uInhale) * (2.0 + 3.0 * uInhale) * step(1e-3, uInhale);
  {
    // 150 radial lines, re-rolled once per 16th note (frozen in reduced mode). A line keeps its
    // 1080p width as a fraction of the frame, but is never drawn thinner than a pixel; it is dimmed
    // instead, so its energy is the same at any resolution. Where the lines crowd closer than
    // ~2 px they turn into their average glow. Together: no shimmer at the phone's render scale.
    float sx = fa / TAU * 150.0;
    float hh = hash11(floor(sx) + floor(uBeat * 4.0 * (1.0 - uReduced)) * 7.31);
    float spc = TAU * fr / 150.0;                                     // line spacing
    float sw = abs(fract(sx) - 0.5) * spc;                            // distance to the line centre
    float w = (0.6 + 1.6 * hh) * (2.0 / 1080.0), fw = max(w, PX);
    float sl = (w / fw) * (1.0 - smoothstep(0.0, fw, sw)) * step(0.55, hh);
    sl = mix(0.45 * 1.84 * (2.0 / 1080.0) / max(spc, 1e-5), sl, smoothstep(1.5, 3.0, spc / PX));
    float inner = 0.35 * (1.0 - 0.75 * uInhale);                      // the inhale draws them in
    sl *= smoothstep(inner * (0.6 + 0.6 * hh), inner * (0.9 + 0.6 * hh) + 0.3 * (1.0 - 0.7 * uInhale), fr);
    col += vec3(0.75, 0.88, 1.0) * sl * uConverge * 0.9;
  }
#endif
#ifdef ALB_RIPPLE
  col += vec3(0.6, 0.75, 1.0) * rippleCrest * 0.22;
#endif
  if (uPalOn > 0.5) col = max(uPalM * col, 0.0);   // palette knob: a uniform branch, free when off
  fragColor = vec4(col, 1.0);
}
`;

  window.ALBEDO_BODY_GLSL = BODY;

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

  const bt = (b) => b * BEAT;
  const E = MO.easeInOut, EO = MO.easeOut, EI = MO.easeIn, SM = MO.smooth, C = MO.clamp, mix = MO.mix;
  const MZ = 8.0, FLOOR = -1.15;
  // A3b end camera: high, looking slightly down at the summit; the lens shift puts the summit at y = -0.2
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

  // lattice flow (depth offset): half a cell per beat (times params.flow), surging forward on each
  // kick of the beat grid. a1 adds a steady drift that is zero at its cut, so the lattice runs on
  // unbroken into the next shot; a3b holds it at its value on the merge (the mountain stands on the
  // floor); a4 races down the corridor.
  function flowAt(t, X) {
    const beat = t / BEAT;
    const f = (Math.floor(beat) + EO(C((beat % 1) * 2.2))) * 0.5 * X.flowK;
    if (X.id === 'a1') return f + 0.35 * (beat - X.b1);
    if (X.id === 'a3b') return X.flow0;
    if (X.id === 'a4') return f + 16 * EI(C((t - X.T3) / (X.T4 - X.T3)));
    return f;
  }
  // A4's inhale: 0..1 from the accented last clap to the cut
  const inhaleAt = (t, X) => (X.inhaleOn ? C((t - X.tInhale) / (X.T4 - X.tInhale)) : 0);

  // score lookups. The vocal lines of every part (with bar + words), absolute times, in time order:
  let LINES = null;
  const vocalLines = () => LINES || (LINES = Object.values(MO.S.vocals || {}).filter(Array.isArray).flat()
    .filter((l) => l && typeof l.bar === 'number' && Array.isArray(l.words) && l.words.length)
    .map((l) => ({ t: MO.barTime(l.bar), words: l.words.map(([w, s]) => ({ text: w, t: MO.barTime(l.bar, 0, s) })) }))
    .sort((a, b) => a.t - b.t));
  const firstLine = (a, b) => vocalLines().find((l) => l.t >= a - 1e-6 && l.t < b - 1e-6) || null;
  const clapsIn = (a, b) => (MO.events.clap || []).filter((e) => e.t >= a - 1e-6 && e.t < b - 1e-6);

  // palette knob: a colour matrix (rows) over the whole shot; 'moon' is the 30 s look (no matrix).
  // Each keeps whites near white (they draw on the red channel) and turns the blue lattice, the
  // moon's rays and the Shadow's violet: sun = amber and warm white, blood = crimson and salmon,
  // verdigris = sea green and mint, violet = violet and lilac, silver = monochrome.
  const PALETTES = {
    moon: null,
    sun: [0.20, 0.10, 0.85, 0.50, 0.40, 0.15, 0.60, 0.10, 0.00],
    blood: [0.15, 0.10, 0.95, 0.30, 0.25, 0.00, 0.35, 0.05, 0.10],
    verdigris: [0.50, 0.10, 0.00, 0.30, 0.20, 0.75, 0.30, 0.30, 0.45],
    violet: [0.30, 0.10, 0.55, 0.60, 0.30, 0.00, 0.10, 0.10, 0.90],
    silver: [0.30, 0.45, 0.25, 0.30, 0.45, 0.25, 0.32, 0.47, 0.30],
  };
  // the knobs every albedo shot has
  function knobs(K) {
    const pal = K.P.palette;
    const M = Array.isArray(pal) && pal.length === 9 && pal.every(Number.isFinite) ? pal : (typeof pal === 'string' && PALETTES[pal]) || null;
    return {
      zoom: K.p('zoom', 1, 0.3, 3), roll: K.p('roll', 0, -Math.PI, Math.PI), flowK: K.p('flow', 1, 0, 8),
      palOn: M ? 1 : 0, palM: M ? [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]] : [1, 0, 0, 0, 1, 0, 0, 0, 1],
      seedL: K.seed * 13.17, moonK: K.p('moon', 1, 0, 2),
      spread: K.p('spread', 1, 0.3, 1.5), pillarsK: K.p('pillars', 1, 0, 1), pillarX: K.p('pillarX', 1.42, 0.9, 2.6),
    };
  }

  // the uniforms of one albedo shot at time t; X holds its cue's anchors (real times) and knobs
  const LAT_REF = [[0, FLOOR, 4], [0, FLOOR, 20], [2.5, 0.6, 8], [-2.5, 0.6, 8]];
  // the uniforms at t, plus the picture's motion over the last 1/30 s for the anti-strobe (uMoveV: the 2D
  // camera without its kick pulse, and the bodies)
  function uniforms(t, X) {
    const u = state(t, X), v = state(t - 1 / 30, X);
    const a = u._cam, b = v._cam, za = a[2] * u.uPush, zb = b[2] * v.uPush;
    const A = u.uBodyA, Ab = v.uBodyA, Bn = u.uBodyB, Bb = v.uBodyB;
    const dB = Bn[2] > 0 && Bb[2] > 0 ? Math.hypot(Bn[0] - Bb[0], Bn[1] - Bb[1]) : 0;
    u.uMoveV = [Math.abs(Math.log(za / zb)) + Math.abs(a[3] - b[3]) + Math.abs(Math.log(A[2] / Ab[2])),
      za * (Math.hypot(a[0] - b[0], a[1] - b[1]) + Math.max(Math.hypot(A[0] - Ab[0], A[1] - Ab[1]), dB)) / u.uPush];
    // the lattice image's slide: the lens shift and the 3D camera, measured on a few reference points
    let lat = 0;
    for (const P of LAT_REF) {
      const q0 = project(P, u.uRo, u.uTa, u.uVP), q1 = project(P, v.uRo, v.uTa, v.uVP);
      if (q0[2] > 0.5 && q1[2] > 0.5) lat = Math.max(lat, Math.hypot(q0[0] - q1[0], q0[1] - q1[1]));
    }
    u.uLatV = lat;
    delete u._cam;
    return u;
  }
  function state(t, X) {
    const K = X.K, id = X.id;
    const kick = MO.last('kick', t), kickAge = kick ? t - kick.e.t : 9;
    const clap = MO.last('clap', t), clapAge = clap ? t - clap.e.t : 9;
    const u = {};
    u.uKickAge = kickAge;
    u.uKickL = X.kickL * (MO.reduced ? 0.3 : 1);
    const flow = flowAt(t, X);
    // its speed in cells per 1/30 s: fast rungs are blurred in the shader instead of strobing
    u.uFlowV = Math.abs(flow - flowAt(t - 1 / 30, X)) / 0.5;
    const mt = K.M(t);                       // ambient-motion time
    let push = 1, kickPush = 0.006, latR = 1e4, climbN = 0, inhale = 0;

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

    if (id === 'a1') {
      // A1: the luminous body; ink floods its left half by "left", the Shadow opens its eye on it
      const T0 = X.T0, k = (t - T0) / (X.T1 - T0);
      cam = [0, 0.02 + 0.03 * k, 0.94 + 0.04 * k + 0.07 * k * k, 0.0];   // accelerating into the cut
      kickPush = 0.015;
      latR = 1.2 + (t - T0) * 13;     // the lattice lights up behind the first kick's ring (same speed)
      A3[3] = 0.15 + 0.85 * EO((t - T0) / 0.38);                  // draw-on behind the flash
      A3[0] = 0.4 + 0.6 * EO((t - T0) / 0.5);
      const ink = E((t - X.tInk + 0.12) / (X.tEye - X.tInk + 0.12)) * X.inkK;
      A2 = [0, 1, mix(-0.75, 0.0, ink), 0];
      A3[1] = EO((t - X.tEye) / 0.12);                            // the Shadow opens its eye on "left"
      split = ink;
      mirror = 0.3 * ink;
      u.uMandorla = EO((t - T0) / 0.3) * X.mandorla;
      let burn = [-9, -9, 0, 0];
      if (X.burn) {
        // burn: the 30 s end state (the left half ink, the Shadow's eye open, the world's left half violet)
        // burns off from the feet up; the front reaches the crown on X.tFire, the world's violet half recedes
        // upward with it (a travelling front, never a full-frame step), the embers die out after it
        const kb = C((t - X.tBurn0) / (X.tFire - X.tBurn0)), f = 0.35 * kb + 0.65 * SM(kb);
        A2 = [0, kb < 1 ? X.inkK : 0, 0, 0]; A3[1] = 1; split = X.inkK; mirror = 0.3 * X.inkK * (1 - kb);   // no ink once burnt
        burn = [mix(-1.12, 1.18, f), mix(-1.3, 1.35, f), mt - T0, X.inkK * (1 - SM((t - X.tFire) / 0.6))];
      }
      u.uBurn = burn;
    } else if (id === 'a2') {
      // A2: the syzygy. Out of the mirror: the Shadow to the left, the Anima to the right.
      const T1 = X.T1, k = (t - T1) / (X.T2 - T1);
      const s = EO((t - T1) / 0.42);
      cam = [0, 0.03 * SM(k), 1.0 + 0.09 * SM(k), 0.012 * Math.sin(k * Math.PI) * (MO.reduced ? 0.3 : 1)];
      const x = 0.66 * s * X.spread, sc = mix(0.86, 0.72, s), y = mix(0.02, -0.12, s);
      const bph = (mt - T1) * 2.4;                                // breathing, on the ambient clock
      const breathe = 0.012 * Math.sin(bph) * s;
      A = [-x, y + breathe, sc, 0.04 * s * (0.5 + 0.5 * Math.sin(bph))];
      A2 = [0, 1, 9, 0];
      A3 = [1 + 0.35 * MO.env('kick', t, 0.15), 1, 0, 1];
      Bb = [x, y - breathe, sc, 0.04 * s * (0.5 - 0.5 * Math.sin(bph))];
      B2 = [C(s * 1.4), C(s * 1.5), 0, 0.6];
      moon = [0, mix(0.72, 0.40, s), mix(0.30, 0.28, s), mix(0.65, 1, s) * X.moonK];
      phase = mix(0.2, 0.4, s);
      pillars = C((t - T1) / 0.55) * X.pillarsK; pillarX = X.pillarX;
      split = 1;
      mirror = 0.7 - 0.45 * s + 0.8 * MO.env('clap', t, 0.15);
    } else if (id === 'a3') {
      // A3: back into the mirror, accelerating into the merge on the cut
      const T2 = X.T2, TM = X.TM;
      const s = 1 - EI((t - T2) / (TM - T2));
      const x = 0.66 * s * X.spread;
      A = [-x, -0.12, 0.72, 0];
      A2 = [0, 1, 9, 0];
      A3 = [1, 1, 0, 1];
      Bb = [x, -0.12, 0.72, 0];
      B2 = [1, 1, 0, 0.6];
      moon = [0, 0.40, 0.28, 1 * X.moonK]; phase = 0.4;
      pillars = 1 * X.pillarsK; pillarX = X.pillarX; split = 1; mirror = 0.6 + 0.6 * EI((t - T2) / (TM - T2));
    } else if (id === 'a3b') {
      // A3b: the Rebis; washed white, carried up the rising mountain
      const after = (t - X.TM) * X.sq;
      const wash = SM(after / 0.8);
      const camK = E(C(after / 1.2));
      walls = after < 0.55 ? 1 : 0;             // swept away by the shock ring (per pixel in the shader)
      flashS = C(1 - after / 0.07) * (MO.reduced ? 0.3 : 1);                // two frames
      for (let i = 0; i < 7; i++) steps[i] = EO(C((t - X.stepT[i]) / 0.2));
      // after the dolly settles the picture keeps creeping in, so the shot cuts on motion; on a long
      // cue the creep eases out to a 1.25x hold (identical to the linear creep for the first second)
      const cx = Math.max(0, after - 0.4);
      push = 1 + 0.1 * (cx <= 1 ? cx : 1 + 1.5 * (1 - Math.exp(-(cx - 1) / 1.5)));
      ro = mixv([0, 0, 0], RO_END, camK);
      ta = mixv([0, 0, 1], TA_END, camK);
      vp = [0, mix(0.62, VP_END, camK)];
      let top = FLOOR; for (let i = 0; i < 7; i++) top += 0.55 * steps[i];
      const sp = project([0, top, MZ - 0.5], ro, ta, vp);
      const climb = E(C((after - 0.05) / 1.05));
      const sc = mix(0.72, 0.36, climb);
      const feet = mix(-0.84, sp[1], climb);
      // which step the feet have reached: compare them with each step's projected top front edge
      let base = FLOOR, yPrev = project([0, FLOOR, MZ - 3.2], ro, ta, vp)[1];
      for (let i = 0; i < 7; i++) {
        base += 0.55 * steps[i];
        const y = project([0, base, MZ - (3.2 - i * 0.42)], ro, ta, vp)[1];
        if (feet >= y) climbN = i + 1;
        else { if (feet > yPrev && y > yPrev) climbN = i + (feet - yPrev) / (y - yPrev); break; }
        yPrev = y;
      }
      A = [0, feet + sc, sc, 0.7 * SM(after / 1.0)];
      A2 = [0.5 * wash, 1 - wash, 9, 0];
      A3 = [1 + 0.4 * wash, 1 - wash, 0, 1];
      if (after < 0.8) { Bb = [0, A[1], sc, A[3]]; B2 = [1 - 0.5 * wash, 1 - wash, 0, 0]; }
      moon = [0, mix(0.40, feet + sc * 1.45, climb), mix(0.28, 0.52, climb), 1 * X.moonK]; phase = mix(0.4, 0.3, climb);
      pillars = 1; pillarX = mix(X.pillarX, 2.6, E(C(after / 0.6)));
      split = 1 - wash;
      mirror = Math.max(0, 0.6 - after * 3);
      shock = after;
    } else {
      // A4: cut in close; push into the third eye; all lines converge; the light of the Self
      const body = [0, -0.62, 1.0];
      const eye = [0, body[1] + 0.873 * body[2]];
      const T3 = X.T3, tSelf = X.tSelf, tLight = X.tLight;
      let center, zoom;
      if (t < tSelf) {
        const k = (t - T3) / (tSelf - T3);
        center = mixv([0, -0.06], [0, -0.02], k); zoom = mix(1.12, 1.28, k);
      } else {
        const k = E(C((t - tSelf) / 0.22));
        center = mixv([0, -0.02], eye, k);
        // exponential push; it keeps creeping in after the light, then recoils in the inhale (the
        // whole picture contracts into the eye, faster and faster into the cut)
        const x = inhaleAt(t, X);
        zoom = Math.exp(MO.keys(X.zk, t, (v) => v) + Math.log(105 / 158) * x * x);
      }
      cam = [center[0], center[1], zoom, 0.035 * Math.sin(mt * 3.0) * (1 - C((t - tSelf) / 0.4))];
      focus = [(eye[0] - center[0]) * zoom, (eye[1] - center[1]) * zoom];
      vp = focus;
      A = [body[0], body[1], body[2], 0.7];
      A2 = [0.5, 0, 9, 0];
      A3 = [1.4, 0, EO((t - tSelf) / 0.3), 1];
      moon = [0, body[1] + 0.86, 0.40, 0.55 * C(1 - (zoom - 1.3) / 0.6) * X.moonK]; phase = 0.22;
      // The light builds to 0.72 by the last ring clap and holds there (no white-out), so the rings of
      // the fill claps read against it. On the accented last clap the inhale begins: the light pulls
      // back into the third eye, an imploding ring lands on it on the cut, and the cut, the crash and
      // the next shot's flash then all expand outward.
      inhale = inhaleAt(t, X);
      converge = Math.max(SM((t - tSelf) / 0.4) * (1 - SM((t - X.t312) / 0.3)), 0.8 * SM(inhale * 2.5)) * X.raysK;
      burst = 0.72 * SM((t - tLight) / (X.tBurst - tLight)) * (1 - 0.45 * SM(inhale)) * X.lightK;
      X.ringT.forEach((ts, i) => { rings[i] = t >= ts ? t - ts : -1; });
      latI = (1 - 0.5 * burst) * (1 - 0.5 * inhale) * (MO.reduced ? 0.55 : 1);   // reduced: the corridor dimmer under the rush
    }

    u._cam = cam.slice();
    // kick zoom pulse on the 2D camera only: on the fine lattice lines it would flicker
    cam[2] *= 1 + kickPush * MO.env('kick', t, 0.1) * (MO.reduced ? 0.3 : 1);
    u.uPush = push * X.zoom;
    u.uLatR = latR; u.uClimb = climbN; u.uInhale = inhale;
    u.uFlow = flow; u.uWalls = walls; u.uLatI = latI;
    u.uCam = cam; u.uRo = ro; u.uTa = ta; u.uVP = vp;
    u.uBodyA = A; u.uBodyA2 = A2; u.uBodyA3 = A3; u.uBodyB = Bb; u.uBodyB2 = B2;
    u.uMoon = moon; u.uPhase = phase; u.uPillars = pillars; u.uPillarX = pillarX; u.uMirror = mirror; u.uSplit = split;
    u.uSteps = steps;
    u.uBurst = burst; u.uConverge = converge; u.uFocus = focus; u.uShock = shock; u.uFlashS = flashS; u.uRings = rings;
    // the clap ripples the mirror (A2)
    u.uRipple = id === 'a2' ? MO.env('clap', t, 0.35) : 0;
    u.uRippleAge = clapAge;
    // knobs
    u.uTurn = [Math.cos(X.roll), Math.sin(X.roll)]; u.uPalOn = X.palOn; u.uPalM = X.palM; u.uSeedL = X.seedL;
    if (!K.still) u.uTime = mt;
    return u;
  }

  // One shader per shot, each with only the features it needs (all its cues share the program).
  // shot(name, 30 s id, natural window in beats, head and tail beats for the cue clock, #defines,
  // setup(X, cue, K) that fills the cue's anchors and shot knobs, bloom)
  const shot = (name, legacy, nb0, nb1, headBeats, tailBeats, defs, setup, bloom = 0.45) => {
    const fs = defs.map((d) => `#define ${d}\n`).join('') + BODY + SCENE;
    MO.shot('albedo.' + name, (cue) => {
      const K = cueClock(cue, nb0, nb1, headBeats, tailBeats);
      const X = Object.assign({ id: name, K, b0: cue.beat0, b1: cue.beat1 }, knobs(K));
      const kc = MO.S.keyChange;
      X.kickL = kc && typeof kc.bar === 'number' && cue.bar0 >= kc.bar ? 0.175 : 0.105;   // rule 5: +25 % in the final chorus
      setup(X, cue, K);
      MO.scene({
        id: K.ident ? legacy : `albedo.${name}#${cue.index}`, fs,
        uniforms: (t) => uniforms(t, X),
        bloom: typeof bloom === 'function' ? (t) => bloom(t, X) : bloom,
        vignette: 0.4,
      });
    });
  };

  // Params of every albedo shot (range (default): what it looks like):
  //   palette    moon | sun | blood | verdigris | violet | silver | 9 numbers (moon): a colour matrix
  //              over the shot (rows); see PALETTES
  //   zoom       0.3..3 (1)     whole-picture zoom about the centre
  //   roll       -3.14..3.14 (0) whole-picture roll (radians)
  //   flow       0..8 (1)       lattice flow rate (a1, a2, a3, a4; a3b holds the lattice still)
  //   moon       0..2 (1)       the moon's brightness (0 = no moon)
  //   speed      0..16 (1)      ambient motion rate: flames, hair, moon rays, yods, stars, breathing
  //   seed       any (0)        phase of that motion, and which lattice cells hold an eye
  //   offsetBeats 0.. (0)       start partway into the shot's choreography
  // Cost: as in the 30 s piece (about 80-110 ms per 640x360 frame on SwiftShader, a2 and a3b the
  // heaviest); the knobs are uniform branches or exact no-ops at their defaults.

  // ALBEDO.A1 "Shadow on the left,": the luminous body (Sacred Mirrors) in the Universal Mind Lattice
  // with its mandorla and the moon halo; ink floods its left half, the Shadow's eye opens.
  // Natural length: 4 beats (beats 16-20). Stretch: the draw-on, the lattice's light wave and the
  //   mandorla (the first 0.5 s, behind the downbeat's flash) are anchored to the cue start; the ink
  //   floods in over the beat before the Shadow's eye opens, which lands on the last word of the first
  //   vocal line in the cue ("left"), else 2 beats in; the accelerating camera push stretches over
  //   the cue; the lattice keeps flowing with the beat, the nerves pulse on the kicks.
  // Params: ink 0..1 (1) how far the ink floods (0 = the body stays luminous, no Shadow);
  //   eyeBeats 0.. (from the vocals) beats after the cue start when the Shadow opens its eye;
  //   mandorla 0..1 (1) the vesica of darkness behind the figure;
  //   burn 0/1 (0) the reverse of the 30 s flood (ALBEDO arrives): the cue starts on the flood's end state
  //     (the left half ink, the Shadow's red-ringed eye open, the world's left half violet) and the ink burns
  //     off from the feet up behind a ragged flickering flame front with a burning edge, shedding embers that
  //     drift up and die out; the front reaches the crown on the first long word (the last word of the first
  //     vocal line in the cue, "fire"; else 2 beats in), and the world's violet half recedes upward with it
  //     (a travelling front, never a full-frame step); the Shadow's eye closes as the front passes it; the
  //     embers fade over 0.6 s after the word. ink scales the starting ink. Stretch: the burn spans the cue
  //     start to the word; the creep, the lattice and the nerves run on to the cut.
  //   fireBeats 0.. (from the vocals) with burn: beats after the cue start when the front reaches the crown.
  // Coupling: the lattice drift is zero on the cut, so the lattice runs on into albedo.a2 unbroken.
  // Cost: burn lives in one uniform branch of a1's program only (skipped when off: the 30 s a1 renders
  //   bit-identically); on, it adds one ember lookup per pixel (a hash, no loop).
  shot('a1', 'albedo-a1', 16, 20, 2.3, 0, ['ALB_SHADOW', 'ALB_MIRROR', 'ALB_MANDORLA', 'ALB_BURN'], (X, cue, K) => {
    X.T0 = K.S(bt(16)); X.T1 = K.E(bt(20));
    let tEye = K.S(bt(18));
    if (typeof K.P.eyeBeats === 'number') tEye = cue.from + K.P.eyeBeats * BEAT;
    else {
      const l = firstLine(cue.from, cue.to), w = l && l.words[l.words.length - 1].t;
      if (w && w > X.T0 + 0.25 && w < X.T1 - 0.1) tEye = w;
    }
    const dL = K.d(tEye - bt(18));
    X.tInk = bt(17) + dL; X.tEye = bt(18) + dL;
    X.inkK = K.p('ink', 1, 0, 1); X.mandorla = K.p('mandorla', 1, 0, 1);
    X.burn = K.p('burn', 0, 0, 1) > 0;
    if (X.burn) {
      // the first long word: params.fireBeats, else the last word of the first vocal line in the cue
      // ("fire"), else 2 beats in
      let tF = K.S(bt(18));
      if (typeof K.P.fireBeats === 'number') tF = cue.from + K.P.fireBeats * BEAT;
      else {
        const l = firstLine(cue.from, cue.to), w = l && l.words[l.words.length - 1].t;
        if (w && w > cue.from + 0.3 && w < cue.to - 0.05) tF = w;
      }
      X.tBurn0 = cue.from; X.tFire = Math.max(tF, cue.from + 0.2);
    }
  });

  // ALBEDO.A2 "Anima on the right,": the mirror; the Shadow steps out to the left, the Anima to the
  // right, framed by the High Priestess pillars B and J, the moon between them.
  // Natural length: 4 beats (beats 20-24). Stretch: the step out of the mirror (0.42 s), the pillars
  //   rising (0.55 s) and the moon's descent are anchored to the cue start; the slow camera rise and
  //   sway stretch over the cue; the figures breathe, the claps flash and ripple the mirror, the kicks
  //   swell the aura throughout.
  // Params: spread 0.3..1.5 (1) how far apart the two figures stand; pillars 0..1 (1);
  //   pillarX 0.9..2.6 (1.42) the pillars' distance from the centre.
  shot('a2', 'albedo-a2', 20, 24, 1.3, 0, ['ALB_SHADOW', 'ALB_HAIR', 'ALB_MIRROR', 'ALB_PILLARS', 'ALB_RIPPLE'], (X, cue, K) => {
    X.T1 = K.S(bt(20)); X.T2 = K.E(bt(24));
  });

  // ALBEDO.A3 "climb": they step back into the mirror, accelerating into the merge on the cut.
  // Natural length: 1 beat (beats 24-25). Stretch: the walk spans the whole cue (ease-in, so the
  //   figures meet exactly on the cut); on a long cue it starts slowly from albedo.a2's pose.
  // Params: spread, pillars, pillarX as albedo.a2 (start from the same values to match its pose).
  // Coupling: ends on the merge that albedo.a3b starts with; place them adjacent.
  shot('a3', 'albedo-a3', 24, 25, 0, 1, ['ALB_SHADOW', 'ALB_HAIR', 'ALB_MIRROR', 'ALB_PILLARS'], (X, cue, K) => {
    X.T2 = K.S(bt(24)); X.TM = K.E(bt(25));
  });

  // ALBEDO.A3B "the Holy Mountain": the merge (the Rebis) on the cut; a shockwave blows the corridor
  // away, the floor stacks into a stepped mountain and the figure is carried up to the summit under
  // the moon.
  // Natural length: 3 beats (beats 25-28). Stretch: the whole move (merge, shock, wash, the seven
  //   steps rising every 0.42 beats, the dolly up, the climb: about 2.5 beats) is anchored to the cue
  //   start; afterwards the figure stands on the summit, the picture's slow creep eases out to a
  //   1.25x hold, the stars twinkle and the aura flickers. A cue shorter than 2.7 beats plays it faster.
  // Params: moon, pillarX (the pillars slide out from it) as above; the lattice holds still (flow
  //   only sets the value it freezes at: give a3 and a3b the same flow).
  // Coupling: starts on albedo.a3's merge (the lattice frozen at the value it had on the cut).
  shot('a3b', 'albedo-a3b', 25, 28, 2.7, 0, ['ALB_SHADOW', 'ALB_HAIR', 'ALB_MIRROR', 'ALB_MOUNTAIN', 'ALB_SHOCK'], (X, cue, K) => {
    X.TM = K.S(bt(25)); X.sq = K.sq;
    X.stepT = [0, 1, 2, 3, 4, 5, 6].map((i) => K.S(bt(25 + i * 0.42)));
    X.flow0 = Math.round(cue.beat0) * 0.5 * X.flowK;
  });

  // ALBEDO.A4 "to the Self, the light!": cut in close, push into the third eye, all lines converge,
  // white-gold light, light rings on the fill claps; on the last accented clap it inhales into the eye.
  // Natural length: 4 beats (beats 28-32). Stretch: the push into the third eye starts on the first
  //   word on or after beat 1 of the first vocal line in the cue ("Self"), the light arrives on its
  //   last word ("light"); without a line 1 and 2.5 beats in. The long exponential push stretches from
  //   the light to the end; the speed lines fade 0.8 beats before the cut; light rings flash on the
  //   last two claps between the light and the inhale; the inhale runs from the last accented clap in
  //   the final beat (else a 16th before the cut) to the cut.
  // Params: light 0..1.5 (1) the light of the Self; rays 0..1.5 (1) the converging speed lines;
  //   inhale 0/1 (1) 0 = no inhale, the light and the push hold to the cut.
  // Coupling: the inhale lands on the cut into citrinitas.c1's gold flash (score fx on the downbeat).
  shot('a4', 'albedo-a4', 28, 32, 2.5, 0.8, ['ALB_EYE3', 'ALB_BURST'], (X, cue, K) => {
    const T3 = X.T3 = K.S(bt(28)), T4 = X.T4 = K.E(bt(32));
    let tSelf = K.S(bt(29)), tLight = K.S(bt(30.5));
    const l = firstLine(cue.from, cue.to);
    if (l) {
      const wS = l.words.find((w) => w.t >= l.t + BEAT - 1e-6), wL = l.words[l.words.length - 1];
      if (wS && wL.t > wS.t) { tSelf = wS.t; tLight = wL.t; }
    }
    X.tSelf = tSelf = Math.min(Math.max(tSelf, T3 + 0.05), K.E(bt(29)));
    X.tLight = tLight = Math.min(Math.max(tLight, tSelf + 0.3), K.E(bt(30.5)));
    X.t312 = K.E(bt(31.2));
    X.inhaleOn = K.on('inhale', true);
    let tIn = K.E(MO.barTime(7, 0, 15));
    const acc = clapsIn(T4 - BEAT, T4).filter((e) => e.v >= 1);
    if (acc.length) tIn = acc[acc.length - 1].t;
    X.tInhale = X.inhaleOn ? tIn : T4;
    const rc = clapsIn(tLight, X.tInhale).slice(-2).map((e) => e.t);
    X.ringT = [rc[0] ?? Infinity, rc[1] ?? Infinity];
    X.tBurst = rc.length ? rc[rc.length - 1] : K.E(MO.barTime(7, 0, 14));
    if (!(X.tBurst > tLight + 0.1)) X.tBurst = tLight + 0.5;
    X.zk = mono([[tSelf, Math.log(1.28)], [tSelf + 0.22, Math.log(2.6)], [tLight, Math.log(8)], [K.E(bt(31.6)), Math.log(140)], [X.tInhale, Math.log(158)]]);
    X.lightK = K.p('light', 1, 0, 1.5); X.raysK = K.p('rays', 1, 0, 1.5);
  }, (t, X) => 0.45 * (1 - 0.75 * inhaleAt(t, X)));   // the bloom halo shrinks with the inhale, or it would grey the dark that closes in

  // without a cue list in the score (the 30 s piece) the shots take their 30 s windows themselves
  if (!Array.isArray(MO.S.cues)) {
    [['a1', 16, 20], ['a2', 20, 24], ['a3', 24, 25], ['a3b', 25, 28], ['a4', 28, 32]].forEach(([n, a, b]) => MO.runShot(MO.makeCue('albedo.' + n, a, b)));
  }
})();
