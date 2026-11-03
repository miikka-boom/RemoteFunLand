// PERSONA — IV The Emperor, V The Hierophant. Owner: persona agent. One shot factory (spec 5.2):
//   persona.masks  THE HALL OF MASKS: a stepped amphitheatre of identical porcelain masks on hooded
//                  figures behind gold-coped parapets, rising on both sides of an aisle of steps to a
//                  glowing stepped doorway; at the front centre the luminous figure in a gilded chrome
//                  mask (the Persona). Close on the mask it cracks from the right brow and shatters into
//                  36 shards in anime slow motion; behind it the Shadow's ink face, its red-ringed eyes
//                  snapping open. In Albedo the masks melt into faces of light, then all become the
//                  Anima's face.
// New in the full version (no 30 s window): only score.js "cues" place it. GLSL prefix pm_.
// Everything is a pure function of time; music sync comes from MO.last / MO.count / MO.env, the rap's
// word steps (MO.words) and the score's fx inside the cue window.
(() => {
  const BEAT = MO.BEAT, STEP = MO.BEAT / 4;

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

  // One pipeline for every mode (on SwiftShader every non-loop block runs for every pixel, uniform
  // branches included, so the cost is the total code: the close-up is the same scene with the figure
  // scaled up until its mask fills the frame, not a second scene; each cue compiles out with #defines
  // the parts its params cannot show, see Cost below):
  //   1. the hall: tiers of masked figures behind parapets, the aisle of steps, the back wall and the
  //      vanishing point's glow (soft and defocused behind the close-up)
  //   2. the figure: the luminous body, its head (the Shadow's ink face behind the mask)
  //   3. the gilded chrome mask on its face: whole (and cracking), or in shards
  const FS = `
uniform vec4  uView;      // camera on the whole picture: zoom, roll (rad), zoom centre xy (screen units)
uniform vec4  uHall;      // rows: yv (vanishing point height), B (mask centres at y = yv + B / Z), Z0, D (row k at depth Z0 + D k)
uniform vec4  uHall2;     // vpx, hm (mask half-height, world), Wc (column spacing), Aw (aisle half-width)
uniform vec4  uHall3;     // travel (rows marched toward the camera), defocus (mask units), Znear, fog density
uniform vec4  uHall4;     // background scale (close-up parallax), near fade (depth over which the nearest rows fade in), rake R (tiers rise R per unit depth), anti-strobe (rows per frame, instantaneous)
uniform vec4  uEv;        // eye-holes lit 0..1, Anima pupils look 0..1, Anima 0..1, masksBack 0..1
uniform vec4  uFlip;      // flipping row (own index), flip angle (rad), glinting row, glint position (columns)
uniform vec4  uEv2;       // glint amount, row seed, ambient clock (s), rush speed lines
uniform vec4  uTrans;     // transmute: front height (hall space), band, on 0/1, hall-wide amount
uniform vec4  uFig;       // the figure: body origin xy, scale (units per body unit), visibility
uniform vec4  uFig2;      // crown 0..1, crown drop (mask units), gold-edge flare, figure transmute 0..1
uniform vec4  uFig3;      // aura contour spacing (body units), body y-scale (the crown's landing squash), crown dust ring 0..1 (< 0 none), hat light sweep 0..1
uniform vec4  uFig4;      // aura travel (spacings), heart pulse 0..1 (kick), breathing scale, -
uniform vec4  uCrack;     // crack: growth radius (mask units), fresh-crack light, kick flash; shatter spread g(tau)
uniform vec4  uShat;      // shatter: tau (s; < 0 = whole), fall clock (s), fade (reduced), the Shadow's eyes open
uniform vec4  uSnap;      // the eyes' snap: amount, ring radius (screen), impact frame 0/1 (the scene keeps only its lines), -
uniform vec3  uInkA; uniform vec3 uRimA; uniform vec3 uBoneA; uniform vec3 uLeafA; uniform vec3 uGlowA; uniform vec3 uChromeA;
uniform vec3  uInkB; uniform vec3 uRimB; uniform vec3 uBoneB; uniform vec3 uLeafB; uniform vec3 uGlowB; uniform vec3 uChromeB;

vec3 pInk, pRim, pBone, pLeaf, pGlow, pChrome;
vec3 pmLines;              // the light lines kept on the impact frame
void pm_pal(float k) {
  pInk = mix(uInkA, uInkB, k); pRim = mix(uRimA, uRimB, k); pBone = mix(uBoneA, uBoneB, k);
  pLeaf = mix(uLeafA, uLeafB, k); pGlow = mix(uGlowA, uGlowB, k); pChrome = mix(uChromeA, uChromeB, k);
}

// ---------------------------------------------------------------- helpers
vec2 pm_rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
// anti-aliased stroke of an SDF value d: half width w in pixels, pe = one pixel in d's units
float pm_st(float d, float pe, float w) { return 1.0 - smoothstep(w - 0.7, w + 0.7, abs(d) / pe); }
float pm_gl(float d, float pe, float g) { return exp(-abs(d) / (g * pe)); }
// lines at the integers of v (fw = |dv| per pixel, w = half width in pixels); they fade to their
// average coverage where they get too dense to resolve (no moire, no shimmer)
float pm_lines(float v, float fw, float w) {
  fw = max(fw, 1e-6);
  float d = abs(fract(v + 0.5) - 0.5) / fw;
  float l = 1.0 - smoothstep(w - 0.7, w + 0.7, d);
  return mix(l, min(1.0, 2.0 * w * fw), smoothstep(0.12, 0.32, fw));
}
// cheap atan2 (|error| < 0.005 rad)
float pm_atan(float y, float x) {
  float ax = abs(x), ay = abs(y);
  float a = min(ax, ay) / max(max(ax, ay), 1e-9);
  float s = a * a;
  float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  r = ay > ax ? 1.57079637 - r : r;
  r = x < 0.0 ? 3.14159274 - r : r;
  return y < 0.0 ? -r : r;
}
// piecewise-linear hashed noise (straight segments: cracks, jagged edges), period K
float pm_jag(float x, float K, float s) { float i = floor(x); return mix(hash11(mod(i, K) + s), hash11(mod(i + 1.0, K) + s), fract(x)); }
// a smooth compact bump (cheaper than exp): 1 at 0, 0 beyond |x| = 1
float pm_bump(float x2) { float k = max(1.0 - x2, 0.0); return k * k; }

// ---------------------------------------------------------------- the mask's shape
// Mask space: half-height 1, y up, the eye-holes at y = 0.13. Strictly symmetric.
float pm_faceD(vec2 q) { float k = 1.0 + 0.11 * q.y; return sdEllipse(vec2(q.x / k, q.y + 0.02 * q.x * q.x), vec2(0.74, 1.0)); }
float pm_eyeD(vec2 q) {
  vec2 e = vec2(abs(q.x) - 0.285, q.y - 0.13);
  e.y -= 0.16 * e.x;                       // outer corners lifted
  return sdVesica(e.yx, 0.068, 0.165);
}
float pm_mouthD(vec2 q) { float x = clamp(q.x, -0.17, 0.17); return length(vec2(q.x - x, q.y + 0.50 - 0.85 * x * x)); }
float pm_browD(vec2 q) { float ax = abs(q.x), x = clamp(ax, 0.10, 0.50), u = (x - 0.30) / 0.21; return length(vec2(ax - x, q.y - 0.31 - 0.085 * (1.0 - u * u))); }
// relief of the mask (for the chrome's normals): a dome, the nose ridge, brows, sockets, cheekbones, lips
float pmNose = 0.08, pmSock = -0.05;     // the nose's and the sockets' relief (set per use)
float pm_height(vec2 q) {
  float ax = abs(q.x);
  float dome = sqrt(max(1.0 - q.x * q.x * 1.5 - q.y * q.y * 0.85, 0.0));
  float nose = pm_bump(q.x * q.x * 90.0) * smoothstep(-0.38, -0.08, q.y) * smoothstep(0.30, 0.02, q.y);
  float brow = pm_bump((q.y - 0.29) * (q.y - 0.29) * 90.0) * smoothstep(0.58, 0.18, ax);
  float sock = pm_bump((ax - 0.285) * (ax - 0.285) * 18.0 + (q.y - 0.12) * (q.y - 0.12) * 45.0);
  float cheek = pm_bump((ax - 0.36) * (ax - 0.36) * 16.0 + (q.y + 0.17) * (q.y + 0.17) * 26.0);
  float lips = pm_bump(q.x * q.x * 20.0 + (q.y + 0.50) * (q.y + 0.50) * 240.0);
  return 0.42 * dome + pmNose * nose + 0.045 * brow + pmSock * sock + 0.035 * cheek + 0.02 * lips;
}
vec3 pm_normal(vec2 q, float e) {
  float h0 = pm_height(q);
  return normalize(vec3(h0 - pm_height(q + vec2(e, 0.0)), h0 - pm_height(q + vec2(0.0, e)), e));
}

// a trump headdress above a hall mask, in flat Marseille colours with a black outline.
// v: 0 IV five-point crown, 1 V triple tiara, 2 III star diadem, 3 I lemniscate brim
const vec3 PM_VERM = vec3(0.60, 0.05, 0.02), PM_ULTRA = vec3(0.02, 0.05, 0.36), PM_OCHRE = vec3(0.72, 0.42, 0.03), PM_CREAM = vec3(0.70, 0.62, 0.44);
float pm_hatD(vec2 q, float v) {
  // IV: a band and five points
  float a = clamp(floor(q.x / 0.24 + 0.5), -2.0, 2.0);
  vec2 t = vec2(q.x - a * 0.24, q.y - 1.10);
  float d4 = min(sdBox(q - vec2(0.0, 1.04), vec2(0.56, 0.08)), max(abs(t.x) * 2.4 + t.y - 0.42 + 0.08 * abs(a), -t.y) * 0.4);
  // V: a rounded cone in three tiers, a knob
  vec2 b = q - vec2(0.0, 0.90);
  float d5 = min(max(abs(b.x) - 0.50 + 0.22 * b.y, max(-b.y, b.y - 0.74)), length(b - vec2(0.0, 0.80)) - 0.07);
  // III: a thin band, an eight-point star on the brow
  vec2 s = q - vec2(0.0, 1.17);
  float sa = pm_atan(s.y, s.x) / TAU * 8.0;
  float d3 = min(sdBox(q - vec2(0.0, 0.95), vec2(0.52, 0.045)), (length(s) - 0.20 * (0.55 + 0.45 * abs(fract(sa) - 0.5) * 2.0)) * 0.8);
  // I: the lemniscate brim of the Magician's hat
  vec2 l = (q - vec2(0.0, 1.10)) / vec2(0.95, 0.42);
  float r2 = dot(l, l);
  float d1 = max((r2 * r2 - (l.x * l.x - l.y * l.y)) * 0.32, 0.86 - q.y);
  return v < 0.5 ? d4 : v < 1.5 ? d5 : v < 2.5 ? d3 : d1;
}
vec3 pm_hatCol(vec2 q, float v, float d, float pm) {
  float t = (q.y - 0.92) / 0.31;
  vec3 c4 = mix(PM_OCHRE, PM_VERM, step(q.y, 1.10) * step(0.97, q.y) * step(0.5, fract(q.x * 4.0 + 0.25)));
  vec3 c5 = mix(mod(floor(t), 2.0) < 0.5 ? PM_CREAM : PM_OCHRE, PM_VERM, pm_st(fract(t) - 0.5, pm / 0.31, 1.0) * step(0.0, t));
  vec3 c3 = q.y > 1.0 ? PM_OCHRE : PM_ULTRA;
  vec3 c1 = mix(PM_VERM, PM_ULTRA, step(0.0, q.x));
  vec3 c = v < 0.5 ? c4 : v < 1.5 ? c5 : v < 2.5 ? c3 : c1;
  c *= 0.75 + 0.35 * smoothstep(0.8, 1.6, q.y);
  return c * (1.0 - pm_st(d, pm, 1.3) * 0.92);          // the Marseille black outline
}
// hood silhouette behind a hall mask (mask units); the Anima's crescent crown
float pm_hoodD(vec2 q) { return sdEllipse(q - vec2(0.0, 0.08), vec2(1.0, 1.34)); }
float pm_cresD(vec2 q) { vec2 cp = q - vec2(0.0, 1.16); return max(length(cp) - 0.22, -(length(cp - vec2(0.0, 0.09)) - 0.20)); }
// a mask's headdress: every fourth mask (not the Anima's), its variant
float pm_hasHat(float ci, float n) { return (mod(ci + 2.0 * n, 4.0) < 0.5 && uEv.z < 0.5) ? 1.0 : 0.0; }
float pm_hatV(float ci, float n) { return floor(hash11(n * 3.1 + ci * 0.37 + 7.0 + uEv2.y) * 4.0); }

// ---------------------------------------------------------------- one mask of the hall, fully shaded
// q mask space, pm one pixel in mask units (defocus included), n the row's own index, ci column,
// side +1 when the aisle (the light) is on the mask's right, lit 0..1 the aisle light reaching it, tr transmute
vec3 pm_hallMask(vec2 q, float pm, float n, float ci, float side, float lit, float tr) {
  float lod = 1.0 / pm;                       // mask half-height in pixels
  float det = smoothstep(7.0, 14.0, lod);
  float hh = hash21(vec2(ci * 1.37 + 0.5, n * 0.73 + uEv2.y));
  float hasHat = pm_hasHat(ci, n);
  float hv = pm_hatV(ci, n);
  float ld = 0.05 + 0.95 * lit;
  // the hood: ink, a violet rim toward the aisle, fine contour lines (or the Anima's hair)
  float hd = pm_hoodD(q);
  float rimSide = smoothstep(-0.3, 0.9, q.x * side);
  vec3 col = mix(pInk * 0.35, pInk * 0.5 + mix(pBone, pRim, 0.4) * 0.10 * ld, uEv.z) + pRim * 0.06 * rimSide * exp(hd * 3.0) * ld;
  col += pRim * 0.45 * pm_st(hd, pm, 0.6) * (0.05 + 0.95 * rimSide) * ld;
  col += pRim * 0.10 * pm_lines(-hd / 0.10, pm / 0.10, 0.45) * step(hd, -0.05) * step(-0.45, q.y) * det * ld * (1.0 - uEv.z);
#if PM_ANIMA
  {
    // the Anima: pearl hair falling from the crown, a crescent crown
    float s = abs(q.x) / (0.66 + 0.36 * smoothstep(1.0, -0.6, q.y));
    float strand = s * 13.0 + 0.9 * sin(q.y * 2.6 - uEv2.z * 1.2 + s * 4.0 + hh * 6.0) + 0.3 * sin(q.y * 7.0 + s * 9.0);
    float hairM = step(hd, 0.0) * smoothstep(0.62, 0.80, s + 0.1 * q.y);
    col += mix(pBone, pRim, 0.35) * 0.65 * pm_lines(strand, pm * 12.0, 0.4) * hairM * ld * (0.4 + 0.6 * smoothstep(-1.0, 1.0, q.y)) * uEv.z;
    col = mix(col, pBone * 1.5 * ld + pRim * 0.2, fill(pm_cresD(q), pm) * uEv.z);
  }
#endif
  // the mask: porcelain, or (flipping past 90 degrees, or masksBack) its black back with violet veins
  float flip = (abs(n - uFlip.x) < 0.5 ? uFlip.y : 0.0) + step(hash21(vec2(ci + 3.0, n + 11.0)), uEv.w) * PI;
  float cw = cos(flip);
  vec2 fq = vec2(q.x / max(abs(cw), 0.03), q.y);
#if PM_HATS
  // headdress (it turns with its mask and is gone while the back shows)
  float hd2 = pm_hatD(fq, hv) * max(abs(cw), 0.03);
  col = mix(col, pm_hatCol(fq, hv, hd2, pm) * (0.35 + 0.65 * ld), fill(hd2, pm) * hasHat * step(0.0, cw));
#endif
  float fd = pm_faceD(fq) * max(abs(cw), 0.03);
  float face = fill(fd, pm);
  float ed = pm_eyeD(fq);
  // porcelain: a soft dome lit from above and the aisle
  pmNose = mix(0.04, 0.02, uEv.z); pmSock = -0.05;
  vec3 nrm = pm_normal(fq, max(0.02, pm * 1.5));
  nrm = normalize(vec3(nrm.x * cw, nrm.y, nrm.z));
  float key = max(dot(nrm, vec3(-0.12, 0.55, 0.83)), 0.0);
  float rim = (1.0 - nrm.z) * (1.0 - nrm.z) * max(nrm.x * side + 0.25, 0.0);
  float sock = pm_bump(max(ed, 0.0) * 9.0);
  float k15 = key * sqrt(key);
  vec3 bone = pBone * (0.04 + 0.85 * k15) * (1.0 - 0.40 * sock) * ld;
  vec3 irid = mix(vec3(1.0, 0.82, 0.92), vec3(0.72, 0.95, 1.0), nrm.x * 0.5 + 0.5);
  bone += irid * 0.5 * (1.0 - nrm.z) * ld * uEv.z;                    // the Anima's pearl: an iridescent rim
  vec3 mc = bone + pRim * 0.85 * rim * ld;
  mc += pBone * 0.12 * pm_lines(-fd / 0.12, pm / 0.12, 0.45) * step(fd, -0.04) * step(-fd, 0.30) * det * ld;   // contour lines
  mc = mix(mc, pLeaf * 1.4 * (0.75 + 0.45 * key) * ld, pm_st(pm_browD(fq), pm, 0.6 + 0.022 / pm) * det);         // gold-leaf brow
  mc = mix(mc, mix(pInk, vec3(0.55, 0.20, 0.28) * ld, uEv.z), pm_st(pm_mouthD(fq), pm, 0.5 + 0.007 / pm) * det); // closed smile / lips
  // the eye-holes: dark (a gold rim), lit white on cue; the Anima's eyes with ice-blue pupils sliding in
  vec2 ip = vec2(abs(fq.x) - 0.285 + 0.16 * (1.0 - uEv.y), fq.y - 0.13);
  float ir = length(ip);
  vec3 eye = mix(pBone * (0.25 + 0.75 * ld), vec3(0.35, 0.78, 1.0) * 2.0 * (0.6 + 0.4 * ld), smoothstep(0.10 + pm, 0.10 - pm, ir));
  eye += vec3(0.30, 0.65, 1.0) * 0.9 * exp(-ir / 0.06) * uEv.z;                                  // ice-blue glow
  eye = mix(eye, vec3(0.005, 0.01, 0.03), smoothstep(0.035 + pm, 0.035 - pm, ir));
  eye = mix(eye, vec3(2.4), smoothstep(0.02 + pm, 0.02 - pm, length(ip - vec2(0.02, 0.02))));    // the catch-light
  vec3 inEye = mix(pInk * 0.1, eye, uEv.z) + vec3(1.7, 1.6, 1.5) * uEv.x * (1.0 - uEv.z);
  mc = mix(mc, inEye, fill(ed, pm));
  mc += pLeaf * 1.4 * pm_st(ed, pm, 0.55) * det * ld;
  float g = abs(n - uFlip.z) < 0.5 ? uEv2.x * exp(-abs(ci - uFlip.w) * 1.5) : 0.0;           // the hat's glint
  mc += vec3(1.5, 1.4, 1.2) * g * pm_st(ed, pm, 0.9);
  // the back
  float vein = pm_lines(ridge(fq * 3.5 + hh * 9.0) * 5.0, pm * 9.0, 0.5);
  vec3 back = pInk * 0.6 + pRim * 0.10 * smoothstep(-0.6, 0.0, fd) * ld + pRim * 0.9 * vein * smoothstep(0.0, -0.1, fd) * ld + pLeaf * 0.8 * pm_st(fd, pm, 0.8) * ld;
  mc = cw < 0.0 ? back : mc * (0.4 + 0.6 * abs(cw));
  col = mix(col, mc, face);
  col += vec3(1.0, 0.95, 0.9) * 0.30 * uEv.x * (1.0 - uEv.z) * pm_bump(max(ed, 0.0) * 6.0) * step(0.0, cw) * (1.0 - face * fill(ed, pm));
#if PM_TRANS
  // transmuted: the porcelain melts from the brow down into a pearl face of light
  float melt = 1.15 - 2.5 * tr + 0.10 * sin(q.x * 23.0 + hh * 7.0) + 0.25 * tr * (1.0 - tr) * hash11(floor(q.x * 9.0) + hh * 13.0);
  float gone = smoothstep(melt - 0.03, melt + 0.03, q.y) * step(0.001, tr);
  float dd = pm_faceD(q);
  float glowIn = sat(1.0 + dd * 1.6);
  vec3 light = pInk * 0.3 + pBone * (0.05 + 0.30 * glowIn * glowIn) * (0.4 + 0.6 * ld) + pBone * 0.8 * pm_st(dd, pm, 0.7) + pBone * 0.12 * pm_gl(dd, pm, 5.0);
  light += pBone * 0.30 * pm_st(dd + 0.16, pm, 0.5) * det;                                          // one inner contour
  vec2 ep = vec2(abs(q.x) - 0.285, q.y - 0.12);
  light += pBone * 1.0 * pm_st(ep.y + 2.2 * ep.x * ep.x - 0.02, pm, 0.7) * step(abs(ep.x), 0.15);   // closed lids
  light += pBone * 0.5 * pm_st(q.x, pm, 0.5) * step(-0.30, q.y) * step(q.y, 0.05) * det;            // the nose
  light += pBone * 0.7 * pm_st(pm_mouthD(q), pm, 0.5) * det;
  light += pLeaf * 0.7 * pm_st(pm_browD(q), pm, 0.6);
  vec3 tcol = mix(pInk * 0.3 + pBone * 0.18 * pm_bump(max(dd, 0.0) * 2.5) * (0.4 + 0.6 * ld), light, fill(dd, pm));  // a halo where the hood was
  col = mix(col, tcol, gone);
  col += pBone * 1.4 * pm_st(q.y - melt, pm, 1.0) * fill(dd, pm) * tr * (1.0 - tr) * 4.0;               // the melting edge
#endif
  return col;
}

// ---------------------------------------------------------------- the hall
// the back wall above the tiers: ink, a glory of fine rays from the vanishing point, contour rings
vec3 pm_backWall(vec2 v, float pe) {
  float r = length(v), a = pm_atan(v.y, v.x);
  vec3 col = pInk + pRim * 0.07 * exp(-r * 1.6);
  float rays = pm_lines(a / TAU * 96.0, 96.0 / (TAU * max(r, 0.02)) * pe, 0.45);
  col += pRim * 0.09 * rays * exp(-r * 1.3) * smoothstep(0.03, 0.2, r);
  float rings = pm_lines(log(max(r, 1e-3)) * 9.0 - uEv2.z * 0.30, 9.0 / max(r, 1e-3) * pe, 0.45);
  col += pGlow * 0.045 * rings * exp(-r * 1.4) * smoothstep(0.05, 0.25, r);
  return col;
}
// the vanishing point's light: a doorway of nested stepped outlines (a small ziggurat of light), a halo
vec3 pm_vpGlow(vec2 v, float pe) {
  float r = length(v * vec2(1.0, 1.5));
  vec3 col = pGlow * (0.30 * exp(-r * 7.0) + 0.025 * exp(-r * 1.8) + 1.6 * pm_bump(r * r * 1200.0));
  col += pGlow * 0.12 * exp(-abs(v.x) * 9.0 / max(0.15 - v.y, 0.05)) * step(v.y, 0.0) * exp(v.y * 2.0);   // the light pouring down the aisle
  float ga = pm_atan(v.x, -v.y);
  float beams = pm_bump((fract(ga * 3.2 + 0.5) - 0.5) * (fract(ga * 3.2 + 0.5) - 0.5) * 30.0) * (0.6 + 0.4 * sin(ga * 7.0 + uEv2.z * 0.3));
  col += pGlow * 0.035 * beams * step(v.y, 0.0) * smoothstep(0.0, 0.25, -v.y) * exp(v.y * 0.9) * smoothstep(1.4, 0.2, abs(ga));
  // the doorway: a stepped portal (a ziggurat of light, 5 steps) in nested stepped outlines, glory rays
  vec2 a = abs(v);
  float st = max(a.x - 0.075 + floor(max(v.y, 0.0) / 0.030) * 0.013, max(-v.y - 0.004, v.y - 0.15));
  col += pGlow * (0.55 * pm_lines(st / 0.024, pe / 0.024, 0.5) * exp(-max(st, 0.0) * 9.0) * step(-0.004, st)
                + 0.30 * smoothstep(pe, -pe, st) * (0.6 + 0.4 * smoothstep(0.15, 0.0, v.y)));
  float gr = pm_atan(v.x, v.y - 0.02) * 1.9099;                                  // 12 rays per half turn
  col += pGlow * 0.07 * pm_bump((fract(gr + 0.5) - 0.5) * (fract(gr + 0.5) - 0.5) * 40.0) * step(0.0, v.y) * smoothstep(0.0, 0.10, st) * exp(-r * 2.2);
  return col;
}

// the rows of masked figures behind their parapets, the aisle; v = hall position relative to the vanishing point.
// Raked: the row at depth Z stands R (Z - Z0) higher, which is a flat hall whose horizon is R higher (B' = B - R Z0):
// the tiers rise to y = yv + R, the aisle's stairs climb to the doorway there.
vec3 pm_rows(vec2 v, float pe) {
  float R = uHall4.z, Z0 = uHall.z, D = uHall.w;
  float B = uHall.y - R * Z0;
  v.y -= R;
  float hm = uHall2.y, Wc = uHall2.z, Aw = uHall2.w;
  float trv = uHall3.x, blur = uHall3.y;
  float dy = min(v.y, -2e-4);
  const float dP = -0.92, dH = 1.80, dF = -1.55;     // parapet top, hood/headdress tops, aisle floor (mask units)
  float Zp = (B + dP * hm) / dy;
  float np = max(ceil((Zp - Z0) / D + trv - 1e-4), ceil((uHall3.z - Z0) / D + trv));
  float Zh = max((B + dH * hm) / dy, uHall3.z);
  float nh = ceil((Zh - Z0) / D + trv - 1e-4);
  float sel = np, hit = 0.0, Zs = Z0 + D * (np - trv), cs = 0.0, side = 1.0;
  vec2 qs = vec2(0.0);
  for (int i = 0; i < PM_NROWS; i++) {
    float n = nh + float(i);
    if (n >= np) break;
    float Z = Z0 + D * (n - trv);
    float X = v.x * Z, ax = abs(X);
    float ci = floor((ax - Aw) / Wc);
    vec2 lq = vec2(ax - Aw - (ci + 0.5) * Wc, dy * Z - B) / hm;
    // the real silhouettes: hood, headdress (turning with a flipping row), crescent
    float sd = pm_hoodD(lq);
#if PM_HATS
    float fc = cos(abs(n - uFlip.x) < 0.5 ? uFlip.y : 0.0), fa = max(abs(fc), 0.03);
    sd = min(sd, pm_hasHat(ci, n) > 0.5 && fc > 0.0 ? pm_hatD(vec2(lq.x / fa, lq.y), pm_hatV(ci, n)) * fa : 9.0);
#endif
#if PM_ANIMA
    sd = min(sd, pm_cresD(lq));
#endif
    if (sd < 0.0 && ax > Aw) { sel = n; hit = 1.0; Zs = Z; qs = vec2(lq.x * sign(X), lq.y); cs = ci; side = -sign(X); break; }
  }
  float fogK = 1.0 - exp(-uHall3.w * max(Zs - Z0, 0.0));
  float pmw = pe * Zs;                                   // one pixel in world units at this depth
  float X = v.x * Zs, ax = abs(X);
  float lit = exp(-max(ax - Aw, 0.0) / 1.25) * (0.55 + 0.45 * exp(-max(Zs - Z0, 0.0) * 0.25));   // the aisle's light reaching this column
  float tr = uTrans.z > 0.5 ? smoothstep(0.0, uTrans.y, uTrans.x - (uHall.x + R + B / Zs)) : 0.0;
  pm_pal(uTrans.z > 0.5 ? tr : 0.0);
  // a mask (with its hood)
  vec3 mcol = pm_hallMask(qs, max(pmw / hm, blur), sel, cs, side, lit, tr);
  // the aisle: stairs (three steps per tier) rising to the vanishing point, a runner of light
  float Zf = (B + dF * hm) / dy, Xf = v.x * Zf;
  float kf = ((Zf - Z0) / D + trv) * 3.0;
  float dk = 3.0 / D * abs(B + dF * hm) / (dy * dy) * pe;
  float run = exp(-abs(Xf) / (Aw * 0.5));
  float aFog = 1.0 - exp(-uHall3.w * max(Zf - Z0, 0.0));
  vec3 acol = pInk * 0.8 + pRim * (0.04 + 0.45 * run) + pGlow * (0.06 * run + 0.40 * pm_lines(kf, dk, 0.55) * (0.25 + 0.75 * run));
  acol += pLeaf * 0.45 * pm_st(abs(Xf) - Aw * 0.93, pe * Zf, 0.6);
  // the bank's side wall (the parapets' ends), lit by the aisle
  float Zw = Aw / max(abs(v.x), 1e-4);
  float hw = (dy * Zw - B) / hm;
  vec3 wcol = pInk * 0.6 + pRim * 0.22 * exp(-max(dP - hw, 0.0) * 0.5) + pRim * 0.10 * pm_lines(hw / 0.5, pe * Zw / hm / 0.5, 0.45);
  float wFog = 1.0 - exp(-uHall3.w * max(Zw - Z0, 0.0));
  // a parapet face: ink stone, gold-leaf coping, a violet line, a band of small Marseille lozenges
  float hgt = (dy * Zs - B) / hm;
  float pmh = max(pmw / hm, blur);
  float rowPx = (abs(B + dP * hm) * D / (Zs * Zs)) / pe;
  float fade = smoothstep(2.5, 6.0, rowPx);
  vec3 pcol = pInk * (0.7 + 0.4 * smoothstep(dP - 0.7, dP, hgt)) + pRim * 0.10 * lit;
  pcol += pLeaf * mix(0.10, 0.85 * pm_st(hgt - dP + 0.04, pmh, 0.8), fade) * (0.3 + 0.7 * lit);
  pcol += pRim * mix(0.04, 0.45 * pm_st(hgt - dP + 0.22, pmh, 0.45), fade) * (0.3 + 0.7 * lit);
  vec2 lz = vec2((fract((ax - Aw) / Wc) - 0.5) * Wc / hm, hgt - dP + 0.55);
  pcol += mix(pLeaf, pRim, 0.5) * 0.40 * pm_st(abs(lz.x) + abs(lz.y) * 1.6 - 0.16, pmh, 0.5) * smoothstep(5.0, 10.0, rowPx) * lit;
  // pick
  vec3 col = pcol;
  float fk = fogK;
  if (ax < Aw && hit < 0.5) {
    bool floorHit = abs(Xf) < Aw;
    col = floorHit ? acol : wcol;
    fk = floorHit ? aFog : wFog;
  }
  float mlod = hm / pmw;                                  // mask half-height in pixels
  col = hit > 0.5 ? mix(pInk * 0.45 + pBone * 0.10 * lit, mcol, smoothstep(1.5, 4.0, mlod)) : col;
  // motion: the near rows (big on screen) fade toward their average while they step (anti-strobe, spec 7.3 rule 1)
  col = mix(pInk * 0.6 + pBone * 0.15 * lit, col, mix(moAntiStrobe(uHall4.w), 1.0, smoothstep(Z0 + 2.0 * D, Z0 + 4.0 * D, Zs)));
  // the nearest rows (the rush passes them fast at the frame's edges) sink into the dark
  col *= uHall4.y > 0.0 ? smoothstep(uHall3.z, uHall3.z + uHall4.y, Zs) : 1.0;
  // fog: the far rows dissolve into the dark toward the glow; behind a close-up (defocused) the hall recedes
  col = mix(col, pInk, fk) * (1.0 - 0.9 * blur);
  return col;
}

// ---------------------------------------------------------------- the chrome mask
// the hall as the chrome reflects it: R = reflection direction (z toward the viewer)
vec3 pm_env(vec3 R) {
  float y = R.y;
  // (whole mask: crisp; on the tumbling shards everything soft, so nothing glitters)
  float wh = 1.0 - step(0.0, uShat.x);
  vec3 c = mix(pInk * 2.0 + pRim * 0.04, pInk * 1.2, wh);                                // the floor
  c += pGlow * 0.9 * exp(-y * y * 90.0) + pGlow * 0.25 * exp(-y * y * 8.0) + pGlow * 2.5 * wh * exp(-y * y * 900.0);   // the vanishing point's light, a sharp horizon
  c = mix(c, pInk * 1.5, smoothstep(0.05, 0.40, y));                                     // the dark vault
  // two hard-edged studio strips up-left and up-right
  c += pBone * wh * (3.0 * smoothstep(0.01, 0.0, max(abs(R.x + 0.42) - 0.16, abs(y - 0.55) - 0.12))
                   + 1.8 * smoothstep(0.01, 0.0, max(abs(R.x - 0.55) - 0.09, abs(y - 0.42) - 0.08)));
  c += pBone * 0.8 * (1.0 - wh) * (2.2 * pm_bump(((R.x + 0.42) * (R.x + 0.42) * 14.0 + (y - 0.55) * (y - 0.55) * 22.0))
                                + 1.2 * pm_bump(((R.x - 0.55) * (R.x - 0.55) * 30.0 + (y - 0.42) * (y - 0.42) * 40.0)));
  // the tiers of masks behind the camera, curved by the chrome over cheeks and brow: rows toward the horizon,
  // their eye-holes lit on cue (they all look at you); coarse on the shards
  float u = mix(0.16, 0.8, wh) / max(-y + 0.03, 0.03);
  float rowF = fract(u), cx = fract(R.x * u * 2.6);
  float band = smoothstep(-0.06, -0.16, y) * smoothstep(-0.80, -0.64, y);
  float m = pm_bump(((cx - 0.5) * (cx - 0.5) * 9.0 + (rowF - 0.55) * (rowF - 0.55) * 6.0)) * band;
  c += pBone * mix(0.22, 0.6, wh) * m;
  float eyes = pm_bump(((abs(cx - 0.5) - 0.14) * (abs(cx - 0.5) - 0.14) * 220.0 + (rowF - 0.58) * (rowF - 0.58) * 70.0));
  c = mix(c, pInk, 0.8 * eyes * band) + vec3(6.0) * eyes * uEv.x * band;     // dark eye-holes, lit white on cue
  return c;
}

vec3 pm_shadowEye(vec2 q, float pe, float open) {
  vec3 col = vec3(0.0);
  float k = max(1.0 - q.x * q.x, 0.0);
  float yc = -0.30 * k + 0.05;
  float dc = (q.y - yc) / sqrt(1.0 + 0.36 * q.x * q.x);
  col += vec3(0.55, 0.30, 1.0) * (0.9 * pm_st(dc, pe, 0.7) + 0.15 * pm_gl(dc, pe, 2.5)) * (1.0 - open) * step(abs(q.x), 1.0);
  float yU = open * 0.30 * k * (1.0 + 0.75 * q.x) + 0.06 * q.x;
  float yL = -open * 0.15 * k * (1.0 - 0.3 * q.x) + 0.06 * q.x;
  float inside = step(abs(q.x), 1.0) * (1.0 - smoothstep(-pe, pe, max(q.y - yU, yL - q.y)));
  vec2 iq = q - vec2(0.02, 0.02);
  float ir = length(iq);
  vec3 w = vec3(1.25, 1.2, 1.4);
  w = mix(w, vec3(0.35, 0.0, 0.02), 1.0 - smoothstep(-pe, pe, ir - 0.27));
  w = mix(w, vec3(3.0, 0.10, 0.05), 1.0 - smoothstep(-pe, pe, abs(ir - 0.34) - 0.075));
  w = mix(w, vec3(0.0), 1.0 - smoothstep(-pe, pe, sdVesica(iq, 0.045, 0.28)));
  col = mix(col, w, inside * open * step(0.01, open));
  col += vec3(1.0, 0.85, 0.95) * 1.5 * pm_st(min(abs(q.y - yU), abs(q.y - yL)), pe, 1.0) * open * step(abs(q.x), 1.0);
  return col;
}

// the crack: rings and radial lines around the right brow (also the shards' outlines)
const vec2 PM_IMP = vec2(0.30, 0.36);
const vec2 PM_C0 = vec2(0.0, 0.10);       // the burst's centre, between the eyes
float pm_ringR(float i, float a) { float K = 9.0 + 5.0 * i; return (i < 0.5 ? 0.20 : i < 1.5 ? 0.52 : 0.92) * (1.0 + 0.42 * (pm_jag(a * K, K, i * 13.1 + 1.0) - 0.5)); }
float pm_ringN(float ring) { return ring < 0.5 ? 5.0 : ring < 1.5 ? 8.0 : ring < 2.5 ? 11.0 : 12.0; }
float pm_secOff(float ring, float j, float r, float n) { float jj = mod(j, n); return 0.34 * (hash11(jj * 1.91 + ring * 17.3) - 0.5) + 0.22 * (pm_jag(r * 9.0 + jj * 3.7, 997.0, ring * 5.0 + jj) - 0.5); }
// the shard (ring, sector) holding x (rest mask space); e = distance to its sector lines, to its rings
vec2 pm_cell(vec2 x, out vec2 e) {
  vec2 d = x - PM_IMP;
  float r = length(d);
  float a = pm_atan(d.y, d.x) / TAU + 0.5;
  float ring = 0.0, eR = 1e3;
  for (int i = 0; i < 3; i++) { float Ri = pm_ringR(float(i), a); ring += step(Ri, r); eR = min(eR, abs(r - Ri)); }
  float n = pm_ringN(ring);
  float u = a * n + ring * 0.37;
  float j0 = floor(u);
  float b0 = j0 + pm_secOff(ring, j0, r, n), b1 = j0 + 1.0 + pm_secOff(ring, j0 + 1.0, r, n);
  float j = u < b0 ? j0 - 1.0 : (u >= b1 ? j0 + 1.0 : j0);
  e = vec2(min(abs(u - b0), abs(u - b1)) / n * TAU * r, eR);
  return vec2(ring, mod(j, n));
}
// the shards' flight, computed per frame in JS: slot ring * 12 + sector
uniform vec4 uShA[48];    // position xy, the inverse rotation-and-scale as (cos, sin) / scale
uniform vec4 uShB[48];    // rest centre xy, tumble angle, tilt direction (rad)

// the figure, its head (the Shadow's face behind the mask), the gilded chrome mask: whole, cracked or in shards
vec3 pm_figure(vec3 col, vec2 h, float pe) {
  vec2 b = (h - uFig.xy) / uFig.z;
  b.y /= uFig3.y;                                   // the crown's landing squashes the body
  b /= uFig4.z;                                     // breathing
  float pb = pe / uFig.z;
  float sp = uFig3.x;
  float d = sdBody(b, 0.0);
  float vis = uFig.w;
  vec3 bone = mix(vec3(0.92, 0.88, 0.80), vec3(0.85, 0.93, 1.0), uFig2.w);
  // aura: three contour lines outside, fading, a violet glow
  float ao = d / sp;
  col += mix(pRim, bone, 0.30) * 0.50 * pm_lines(ao - uFig4.x, pb / sp, 0.5) * smoothstep(0.3, 0.9, ao) * smoothstep(3.6, 2.6, ao) * (1.0 - ao / 4.0) * vis;
  col += pRim * 0.20 * exp(-max(d, 0.0) / (sp * 1.6)) * step(0.0, d) * vis;
  // body: dark translucent, topographic lines inside, the skin line; the head is the Shadow's ink
  float inside = fill(d, pb);
  vec3 body = pInk * 0.30 + bone * 0.03 * exp(min(d, 0.0) / sp) + pRim * 0.025;
  body += bone * 0.16 * pm_lines(-d / sp, pb / sp, 0.45) * step(d, -sp * 0.5) * step(-d, sp * 3.5) * (1.0 + d / (sp * 4.0));
  // mask space
  vec2 q = (b - vec2(0.0, 0.835)) / 0.125;
  float pm = pb / 0.125;
  // the Shadow's face (seen through the eye-holes, then between the shards): violet contours, its eyes
  vec2 eq = vec2(abs(q.x) - 0.285, q.y - 0.13) / 0.17;
  float lam = length(eq * vec2(0.55, 1.0));
  vec3 sface = pInk * 0.15 + pRim * 0.30 * pm_lines(log(max(lam, 0.4)) * 7.0, 7.0 / max(lam, 0.4) * pm / 0.17, 0.45) * smoothstep(1.0, 1.3, lam) * exp(-(lam - 1.0) * 0.8) * step(0.0, uShat.x);
  sface += pm_shadowEye(vec2(eq.x * sign(q.x), eq.y), pm / 0.17, uShat.w);
  float shat = step(0.0, uShat.x);
  float headM = smoothstep(0.55, 0.70, b.y) * max(shat, fill(pm_eyeD(q) - 0.04, pm));
  body = mix(body, sface, headM);
  {
    float cy = clamp(floor((b.y + 0.02) / 0.17 + 0.5), 0.0, 6.0);
    vec2 ck = vec2(b.x, b.y - (cy * 0.17 - 0.02 + 0.0));
    float ckd = length(ck) - 0.018;
    body += bone * (0.5 * pm_st(ckd, pb, 0.6) + 0.22 * exp(-max(ckd, 0.0) / 0.03)) * (1.0 - shat * headM) * step(b.y, 1.0);   // the chakras, unlit: pale rings in the body's light
    body += bone * 0.22 * pm_st(b.x, pb, 0.5) * step(0.0, b.y) * step(b.y, 0.70) * (1.0 - headM);
    body += mix(bone, pGlow, 0.5) * 0.10 * (1.0 + 0.25 * uFig4.y) * exp(-length((b - vec2(0.0, 0.44)) * vec2(1.0, 0.8)) / 0.12);
  }
  col = mix(col, body, inside * 0.96 * vis);
  float skin = pm_st(d, pb, 0.8);
  col += bone * 1.3 * skin * vis + bone * 0.16 * pm_gl(d, pb, 3.0) * vis;
  pmLines += bone * 1.2 * skin * vis;
  // the eyes' glow when they snap open
  vec2 g1 = vec2(abs(q.x) - 0.285, q.y - 0.13);
  col += vec3(1.0, 0.25, 0.45) * exp(-length(g1 * vec2(0.6, 2.0)) / 0.05) * uShat.w * 0.45 * vis;
  col += vec3(0.9, 0.7, 1.0) * exp(-abs(g1.y) / 0.008) * exp(-abs(g1.x) / 0.5) * uShat.w * 0.3 * (1.0 + uSnap.x) * vis;
  // ---- the mask: rest-space point mq (the pixel itself, or its position on a flying shard)
  vec2 mq = q; float on = 1.0, msc = 1.0, tum = 0.0; vec3 sh = vec3(0.5);
#if PM_CRACK
  if (uShat.x >= 0.0) {
    float g = uCrack.w;
    vec2 dq = q - PM_C0;
    float rq = length(dq);
    vec2 guess = PM_C0 + dq / max(rq, 1e-4) * max(rq - 1.05 * g, 0.0) / (1.0 + 1.55 * g);
    vec2 e0;
    vec2 gid = pm_cell(guess, e0);
    vec2 dg = guess - PM_IMP;
    float ag = pm_atan(dg.y, dg.x) / TAU + 0.5;
    on = 0.0;
    for (int k = 0; k < 5; k++) {
      vec2 cid = gid;
      if (k == 1) cid.y -= 1.0; else if (k == 2) cid.y += 1.0;
      else if (k >= 3) {
        float rr = clamp(gid.x + (k == 3 ? 1.0 : -1.0), 0.0, 3.0);
        cid = vec2(rr, floor(ag * pm_ringN(rr) + rr * 0.37));
      }
      cid.y = mod(cid.y, pm_ringN(cid.x));
      int slot = int(cid.x * 12.0 + cid.y + 0.5);
      vec4 A = uShA[slot], Bs = uShB[slot];
      vec2 dq2 = q - A.xy;
      vec2 x = Bs.xy + vec2(A.z * dq2.x - A.w * dq2.y, A.w * dq2.x + A.z * dq2.y);
      vec2 ex;
      vec2 xid = pm_cell(x, ex);
      if (abs(xid.x - cid.x) + abs(xid.y - cid.y) < 0.5 && pm_faceD(x) < 0.0) { mq = x; on = 1.0; msc = 1.0 / length(A.zw); tum = Bs.z; sh = vec3(0.0, Bs.w / TAU, 0.0); break; }
    }
  }
#endif
  float mpe = pm / msc;
  float fd = pm_faceD(mq);
  float ed = pm_eyeD(mq);
  pmNose = 0.08; pmSock = -0.02;
  vec3 nrm = pm_normal(mq, 0.012);
  nrm.xy += normalize(mq + 1e-4) * 0.8 * smoothstep(-0.08, 0.0, fd);                  // the bevelled rim
  nrm = normalize(nrm + vec3(cos(sh.y * TAU), sin(sh.y * TAU), 0.0) * 0.45 * sin(tum));  // shards tumble
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), nrm);
  vec3 cm = pm_env(R) * pChrome * (0.55 + 0.45 * (1.0 - nrm.z) * (1.0 - nrm.z) * 2.0) * 1.2;
  cm *= 0.9 + 0.15 * sin(tum + 1.0);
  cm = mix(cm, pLeaf * 2.0, pm_st(pm_browD(mq), mpe, 0.7 + 0.018 / mpe));             // gold-leaf brow
  cm = mix(cm, pChrome * 0.10, pm_st(pm_mouthD(mq), mpe, 0.5 + 0.006 / mpe));          // the closed smile
  cm += pChrome * 1.1 * pm_st(ed - 0.012, mpe, 0.7) * (0.6 + 0.4 * uFig2.z);            // bevelled eye-holes
  cm += pChrome * (0.7 + 2.5 * uFig2.z) * pm_st(fd + 0.015, mpe, 0.9);                   // the rim, flaring on the words
  // a light sweeping across the chrome on the open hats
  float sw = mq.x * 0.8 + mq.y * 0.5 - mix(-1.7, 1.7, uFig3.w);
  cm += pChrome * 0.6 * exp(-sw * sw * 30.0) * smoothstep(0.0, 0.1, uFig3.w) * smoothstep(1.0, 0.85, uFig3.w) * step(uShat.x, 0.0);
  float crL = 0.0;
#if PM_CRACK
  vec2 ce;
  vec2 cid = pm_cell(mq, ce);
  float cedge = min(ce.x, ce.y);
  // the crack (whole mask): lines from the right brow, lit violet-white from inside
  vec2 dI = mq - PM_IMP;
  float rI = length(dI), aI = pm_atan(dI.y, dI.x) / TAU + 0.5;
  float reach = uCrack.x * (0.50 + 0.50 * pm_jag(aI * 9.0, 9.0, 3.0)) + 0.5 * uCrack.x * pm_bump((aI - 0.63) * (aI - 0.63) * 120.0);
  float grow = smoothstep(reach, reach - 0.05, rI) * step(uShat.x, 0.0);
  float crk = min(ce.x, ce.y + max(0.0, 0.25 - (reach - rI)));   // the rings crack once the radial lines are past them
  float cw = 0.45 + 0.35 * exp(-rI * 3.0);
  cm *= 1.0 - 0.6 * pm_st(crk, mpe, 2.2) * grow;
  crL = pm_st(crk, mpe, cw) * grow;
  cm += mix(pRim, vec3(1.0, 0.95, 1.1), 0.6) * 2.5 * (0.7 + 0.7 * uCrack.y + 0.25 * uCrack.z) * crL;
  cm += pRim * 0.5 * pm_gl(crk, mpe, 3.0) * grow * (0.5 + 0.25 * uCrack.z);
  // the shards' edges
  cm += (pChrome * 2.0 * pm_st(cedge, mpe, 0.9) + pBone * 0.6 * pm_st(fd, mpe, 0.7)) * step(0.0, uShat.x);
#endif
  // the crown of lead with Saturn's sign (hall)
  float mcov = fill(fd, mpe) * (1.0 - fill(ed, mpe)) * on * (1.0 - uShat.z);
  col = mix(col, cm, mcov * vis);
  pmLines += vec3(1.0, 0.95, 1.05) * max(crL, pm_st(fd, mpe, 1.0)) * mcov * vis;
#if PM_CROWN
  {
    // dust: a grey ring spreading on the head where the crown lands
    vec2 dq = (q - vec2(0.0, 1.05)) * vec2(1.0, 3.2);
    float dr = mix(0.3, 1.2, sqrt(max(uFig3.z, 0.0)));
    col += vec3(0.55, 0.55, 0.60) * 0.4 * (1.0 - uFig3.z) * step(0.0, uFig3.z) * exp(-abs(length(dq) - dr) / (0.05 + 2.0 * pm)) * vis;
    const float CK = 1.45;                           // the crown's scale
    vec2 c = (q - vec2(0.0, 1.02 + uFig2.y)) / CK;
    float pc = pm / CK;
    c.y -= 0.06 * c.x * c.x;
    float band = sdBox(c - vec2(0.0, 0.10), vec2(0.70, 0.11));
    float a = clamp(floor(c.x / 0.30 + 0.5), -2.0, 2.0);
    vec2 tp = vec2(c.x - a * 0.30, c.y - 0.20);
    float pts = max(abs(tp.x) * 1.2 - 0.13 + tp.y * 0.35, max(-tp.y, tp.y - 0.27 + 0.05 * abs(a)));
    pts = min(pts, length(tp - vec2(0.0, 0.27 - 0.05 * abs(a))) - 0.05);
    float cd = min(band, pts);
    vec3 lead = vec3(0.17, 0.18, 0.21) * (0.75 + 0.45 * smoothstep(-0.1, 0.5, c.y)) + vec3(0.12, 0.13, 0.15) * pm_bump((c.x + 0.25) * (c.x + 0.25) * 8.0);
    vec2 s = (c - vec2(0.0, 0.11)) / 0.125;          // Saturn's sign: a cross over a sickle, gold leaf on the band
    float sg = min(sdSegment(s, vec2(-0.30, 0.95), vec2(-0.30, -0.10)), sdSegment(s, vec2(-0.62, 0.62), vec2(0.02, 0.62)));
    sg = min(sg, abs(length(s - vec2(0.10, -0.10)) - 0.40) + step(0.2, s.y));
    sg = min(sg, sdSegment(s, vec2(0.50, -0.10), vec2(0.18, -0.85)));
    lead = mix(lead, pLeaf * 1.6, pm_st(sg * 0.125 - 0.012, pc, 0.7));
    lead += vec3(0.55, 0.58, 0.65) * pm_st(cd, pc, 0.6);
    col = mix(col, lead, fill(cd, pc) * uFig2.x * vis);
  }
#endif
  return col;
}

void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  pmLines = vec3(0.0);
  vec2 h = pm_rot(p - uView.zw, -uView.y) / uView.x + uView.zw;
  float pe = px() / uView.x;
  // 1. the hall (in the close-up: further, softer, with a little parallax)
  vec2 hb = h / uHall4.x;
  float peb = pe / uHall4.x;
  vec2 v = hb - vec2(uHall2.x, uHall.x);
  vec2 vr = v - vec2(0.0, uHall4.z);                // relative to the tiers' horizon (raised by the rake)
  pm_pal(uTrans.w);
  vec3 col = pm_backWall(vr, peb);
  vec3 rows = pm_rows(v, peb);
  col = vr.y < 0.0 ? rows : col;
  pm_pal(uTrans.w);
  col += pm_vpGlow(vr, peb);
#if PM_RUSH
  // rush: speed lines streaming out of the vanishing point
  float a = pm_atan(v.y, v.x), r = length(v);
  float vv = a / TAU * 120.0;
  float hs = hash11(floor(vv) + floor(uEv2.z * 9.0666667 * (1.0 - uReduced)) * 7.31);
  col += pBone * 0.16 * smoothstep(0.42, 0.5, abs(fract(vv) - 0.5)) * step(0.6, hs) * smoothstep(0.3 + 0.4 * hs, 1.0 + 0.6 * hs, r) * uEv2.w;
#endif
#if PM_FIG
  // 2-3. the figure and its mask
  pm_pal(uFig2.w);
  col = pm_figure(col, h, pe);
#endif
#if PM_CRACK
  // the snap: a red shockwave and bright speed lines from the Shadow's eyes
  vec2 sp = h - (uFig.xy + vec2(0.0, 0.835 + 0.13 * 0.125) * uFig.z);
  float sa = pm_atan(sp.y, sp.x), sr = length(sp);
  float sv = sa / TAU * 90.0, sh = hash11(floor(sv) + 3.1);
  col += vec3(0.85, 0.75, 1.0) * 0.30 * smoothstep(0.42, 0.5, abs(fract(sv) - 0.5)) * step(0.55, sh) * smoothstep(0.35 + 0.4 * sh, 0.9 + 0.5 * sh, sr) * uSnap.x;
  float ring = abs(length(sp * vec2(0.75, 1.0)) - uSnap.y) - 0.003 - 0.012 * uSnap.y;
  col += vec3(1.0, 0.10, 0.06) * 1.5 * exp(-max(ring, 0.0) / 0.008) * uSnap.x;
#endif
  // the score's impact frame: everything but the light lines drops to black under the engine's two-tone key
  col = mix(col, col * 0.08 + pmLines, uSnap.z);
  // dither against banding in the dark gradients
  col += (hash21(gl_FragCoord.xy + fract(uTime * 7.13) * 91.0) - 0.5) * 0.004;
  fragColor = vec4(max(col, 0.0), 1.0);
}`;

  // ------------------------------------------------------------------ palettes
  // ink (the hall's dark), rim (rim light from the aisle), bone (porcelain), leaf (gold leaf),
  // glow (the vanishing point), chrome (the figure's mask)
  const PAL = {
    nigredo: { ink: [0.008, 0.005, 0.017], rim: [0.36, 0.16, 0.80], bone: [0.92, 0.88, 0.80], leaf: [0.95, 0.60, 0.16], glow: [0.70, 0.50, 1.00], chrome: [1.00, 0.72, 0.30] },
    silver: { ink: [0.004, 0.010, 0.030], rim: [0.28, 0.50, 1.00], bone: [0.95, 0.96, 1.00], leaf: [0.80, 0.88, 1.00], glow: [0.70, 0.85, 1.00], chrome: [0.85, 0.92, 1.05] },
    gold: { ink: [0.018, 0.008, 0.003], rim: [0.95, 0.40, 0.08], bone: [0.90, 0.78, 0.55], leaf: [1.00, 0.70, 0.20], glow: [1.00, 0.76, 0.32], chrome: [1.00, 0.74, 0.30] },
  };
  const palU = (a, b) => ({
    uInkA: a.ink, uRimA: a.rim, uBoneA: a.bone, uLeafA: a.leaf, uGlowA: a.glow, uChromeA: a.chrome,
    uInkB: b.ink, uRimB: b.rim, uBoneB: b.bone, uLeafB: b.leaf, uGlowB: b.glow, uChromeB: b.chrome,
  });

  // the shards (spec 5.2 shatter): the rings and sectors of the crack pattern around the right brow
  // (pm_cell in the GLSL); each flies from the burst centre with its velocity decaying over 0.6 s,
  // grows 1 + 0.9 tau (toward the camera), turns, tumbles; after the clap fill it falls
  const IMP = [0.30, 0.36], C0 = [0.0, 0.10], RING_N = [5, 8, 11, 12], RING_M = [0.11, 0.36, 0.72, 1.20];
  const h1 = (n) => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const SHARDS = [];
  for (let r = 0; r < 4; r++) for (let j = 0; j < 12; j++) {
    const n = RING_N[r], a = ((Math.min(j, n - 1) + 0.5 - r * 0.37) / n - 0.5) * 2 * Math.PI;
    const c = [IMP[0] + RING_M[r] * Math.cos(a), IMP[1] + RING_M[r] * Math.sin(a)];
    const k = r * 12 + j;
    SHARDS.push({ c, v0: 0.85 + 0.45 * h1(k + 0.1), v1: 1.2 + 0.7 * h1(k + 0.2), w: (h1(k + 0.3) - 0.5) * (r === 3 ? 1.4 : 2.4), fall: 0.6 + 0.8 * h1(k + 0.4), tum: 1.5 + 2.5 * h1(k + 0.5), tilt: h1(k + 0.6) * 2 * Math.PI });
  }
  // fall[r]: seconds since ring r was released (one clap of the fill per ring, outermost first)
  const shardTable = (tau, fall, still) => {
    const A = new Float32Array(192), B = new Float32Array(192);
    const g = still ? 0 : 0.6 * (1 - Math.exp(-tau / 0.6));
    SHARDS.forEach((s, i) => {
      const f = still ? 0 : Math.max(0, fall[Math.floor(i / 12)] || 0);
      const dc = [s.c[0] - C0[0], s.c[1] - C0[1]], L = Math.hypot(dc[0], dc[1]) || 1;
      const pos = [C0[0] + dc[0] * (1 + s.v1 * g) + dc[0] / L * s.v0 * g, C0[1] + dc[1] * (1 + s.v1 * g) + dc[1] / L * s.v0 * g - 4.0 * f * f * (0.6 + 0.4 * s.fall)];
      const ang = still ? 0 : s.w * tau + 3 * f * Math.sign(s.w || 1), sc = 1 + (still ? 0.1 : 0.9) * tau;
      A.set([pos[0], pos[1], Math.cos(-ang) / sc, Math.sin(-ang) / sc], i * 4);
      B.set([s.c[0], s.c[1], still ? 0 : tau * s.tum, s.tilt], i * 4);
    });
    return { A, B, g };
  };
  const SHARD0 = shardTable(0, [0, 0, 0, 0], true);

  // the first rap word in [from, to) matching re
  const wordAt = (re, from, to) => {
    let rx; try { rx = new RegExp(re, 'i'); } catch (e) { return null; }
    const w = MO.words('rap').find((x) => x.t >= from - 1e-6 && x.t < to && rx.test(x.text));
    return w ? w.t : null;
  };

  // ------------------------------------------------------------------ shot persona.masks
  // PERSONA.MASKS
  // Natural length: 8 beats (2 bars; the verse-1 cues). Nothing depends on the length: the march,
  //   the flips and the glints run on the score's kicks, claps and open hats at any length; crown,
  //   eyes, crack, shatter and transmute are anchored to their params (beats from the cue start);
  //   the camera moves (hall push 1.0x to 1.12x, close dutch drift, the close push to the shatter)
  //   stretch over the cue. A cue shorter than a param's beat simply never reaches it.
  // The hall is a raked amphitheatre: each tier stands higher than the one before it, so the tiers
  //   fill the frame up to a horizon high in the frame where the aisle's stairs climb to a monumental
  //   stepped doorway (nested ziggurat outlines, glory rays). The masks are white porcelain with
  //   gold-leaf brows and eye rims. The luminous figure breathes, its aura rings travel outward one
  //   spacing per beat and its heart swells on the kick; its chakras are pale, unlit rings.
  // Modes (params.cam):
  //   hall   frontal, symmetric: the figure at about 55 % of the frame height, its mask's eyes at
  //          y = 36 % from the top (spec 6.1); the tiers march one row toward the camera on the kicks of
  //          beats 1 and 3 (an eased 0.25 s step, integer at rest); a clap flips one tier (tiers 3-8,
  //          clap count mod 6) to the masks' dark backs (violet veins, a gold rim; the headdresses turn
  //          with them), back on the next beat; an open hat runs a glint along
  //          one row's eye-hole rims; every fourth mask wears a trump headdress in flat Marseille
  //          colours (IV five-point crown, V triple tiara, III star diadem, I lemniscate brim)
  //   close  the same scene with the figure scaled up until its gilded chrome mask fills 70 % of the
  //          height, the hall a soft, dimmer field of glowing ovals behind it (drifting, no march), and
  //          reflected in the chrome: the studio strips, a sharp horizon, curved tiers of masks over the
  //          cheeks (soft on the flying shards); a 4 deg dutch drift and a micro-jolt per kick; a light sweeps the
  //          chrome on the bar's last open hat. With shatter: an accelerating push 1.0x to 1.6x into
  //          the shatter, still for 0.12 s, then a slow pull back to 1.28x by the cut
  //   rush   no figure: the camera flies up the aisle just above the heads (a flat hall), 0.8 tiers per
  //          beat, surging on the kick (0.7 per beat and smooth in reduced mode), speed lines from the doorway
  // Params (range (default): what it looks like):
  //   cam          hall | close | rush (hall)
  //   palette      nigredo | silver | gold (nigredo): bone masks, ink hall, violet rim, gold leaf /
  //                pearl, navy, ice-blue, silver / warm gold
  //   anima        0/1 (1 when palette is silver, else 0): every mask is the Anima's face (pearl,
  //                crescent crown, pearl hair); "eyes" then slides glowing ice-blue pupils (a white
  //                catch-light) into the eye-holes. The hall camera sits closer (her faces stay legible)
  //   eyes         beats or "word:<re>" (none): every eye-hole in the hall lights white at once (close:
  //                the eye-holes of the tiers curved in the chrome light white, and the defocused hall's);
  //                with anima the pupils snap to the camera instead (0.3 s, overshooting), the march holds
  //                from 0.1 s before to 0.5 s after and the camera pushes 1.0x to 1.3x over the turn
  //   crown        beats (none): a dull lead crown (1.45x the mask's width, a cold rim) with Saturn's sign
  //                in gold leaf drops onto the figure's head (0.25 s, a small bounce); from 2 beats before
  //                the landing the camera pushes in to 2.4x on the eye line (1.5 beats) and holds; the
  //                landing squashes the body for 0.12 s and raises a grey ring of dust, and the march holds
  //                for that one kick. Negative = already on. Hall only
  //   crack        beats (none): a hairline crack runs from the right brow (0.35 s), lit violet-white
  //                from inside; negative = already cracked
  //   crackPerKick 0/1 (0): each kick drives the crack further (one ring of the pattern per kick)
  //   shatter      beats or "word:<re>" (none; the first rap word in the cue matching re): the mask
  //                bursts into 36 shards (the crack pattern's rings and sectors) flying from between
  //                the eyes with a 0.6 s velocity decay, growing 1 + 0.9 tau, turning and tumbling;
  //                each clap of the fill after it releases one ring to fall (outermost first, spinning).
  //                Behind: the Shadow's ink face, its eyes
  //                snap open 0.2 s later (red ring, shockwave). A score impact (fx) inside the cue drops
  //                the scene to its light lines for the impact frame (the anime impact). Close only
  //   transmute    beats (none): a silver front sweeps from the front tier past the tiers' horizon in 1.5
  //                beats (eased out); the back wall turns silver as it arrives; behind it each mask melts from the brow down into a
  //                pearl face of light; the hall and the figure's mask turn silver
  //   masksBack    0..1 (0): the fraction of masks showing their black backs
  //   figure       0/1 (1 in hall and close, 0 in rush): the luminous figure (hall without it: the
  //                camera zooms about a point just under the doorway, which stays in frame)
  //   zoom         0.5..3 (1): multiplies the camera's zoom; roll -30..30 (0): degrees added
  //   speed        0..16 (1): ambient motion (the back wall's rings, hair, beams); seed (0): reshuffles
  //                the rows, headdresses and that motion's phase; offsetBeats 0.. (0): the numeric event
  //                params happen that many beats earlier ("word:" events are not shifted)
  // Couplings: the club's Shadow dancer (15.4) cuts to the figure at the hall's centre (16.1); cue 23.3's
  //   impact frame covers the shatter's spawn; the transmuted silver hall (32) is the Albedo payoff
  //   of the nigredo hall (16).
  // Safety (spec 7.3, 7.5): the march crosses a pixel 1.13 times per second (two steps a bar) and the
  //   rush 1.8 (spec 7.3 rule 1: at most 2); while a step moves the near rows (big on screen) fade
  //   toward their average (anti-strobe input = the march's instantaneous rows per frame); no blinks
  //   (eyes only light once per cue); flips darken one tier further back (< 8 % of the frame); the snap
  //   is a ring, not a field; the chrome's reflection is soft on the tumbling shards. Reduced: the march
  //   steps on beats 1 and 3 over 0.5 s, softer flips, rush 0.7 tiers/beat without the surge, shards fade in place instead of flying, snap
  //   x0.4, glints x0.5, jolts and crack flashes x0.3, frozen speed lines, eyes light over 0.3 s, no
  //   impact-frame drop (the engine has no impacts there).
  // Cost (SwiftShader runs every line of a program for every pixel, uniform branches included, so
  //   each cue compiles only the parts its params can show: #defines PM_ANIMA, PM_HATS, PM_TRANS,
  //   PM_CRACK, PM_CROWN, PM_RUSH, PM_FIG; PM_NROWS: the close-up's blurred hall tests 3 row candidates
  //   instead of 6; cues with the same switches share a program, the score's 7 cues make 7). CPU time per 640x360 frame interleaved with albedo.a2 (t=149):
  //   hall 0.95-1.06x, Anima 0.97x, transmute 1.06x, rush 0.85x, close 1.06-1.15x, shatter 1.31x
  //   (the shard search is a loop of up to 5 candidates, skipped while the mask is whole).
  MO.shot('persona.masks', (cue) => {
    const K = cueClock(cue, 0, 8, 0, 0);
    const P = K.P;
    const cam = ['hall', 'close', 'rush'].includes(P.cam) ? P.cam : 'hall';
    const mode = cam === 'hall' ? 0 : cam === 'close' ? 1 : 2;
    const palName = PAL[P.palette] ? P.palette : 'nigredo';
    const pal = PAL[palName];
    const anima = K.on('anima', palName === 'silver');
    // event params: beats from the cue start (shifted by offsetBeats), negative = already happened,
    // or "word:<re>" = the first rap word in the cue matching it
    const evAt = (k) => {
      const v = P[k];
      if (typeof v === 'string' && v.startsWith('word:')) return wordAt(v.slice(5), cue.from, cue.to);
      if (typeof v === 'number' && Number.isFinite(v)) return v < 0 ? -Infinity : K.S(v * BEAT);
      return null;
    };
    const T_EYES = evAt('eyes'), T_CROWN = evAt('crown'), T_CRACK = evAt('crack'), T_SHAT = evAt('shatter'), T_TRANS = evAt('transmute');
    const crackPerKick = K.on('crackPerKick', false);
    const masksBack = K.p('masksBack', 0, 0, 1), zoomK = K.p('zoom', 1, 0.5, 3), rollK = K.p('roll', 0, -30, 30) * Math.PI / 180;
    const figureOn = K.on('figure', mode !== 2);
    const L = cue.to - cue.from;
    const kicksBefore = MO.count('kick', cue.from - 1e-4);
    const red = () => MO.reduced;
    // the hall's march holds still for the crown's landing kick and for the Anima's turn
    const holds = [];
    if (mode === 0 && T_CROWN != null && T_CROWN > cue.from) holds.push([T_CROWN - 0.06, T_CROWN + 0.06]);
    if (mode === 0 && anima && T_EYES != null && T_EYES > cue.from) holds.push([T_EYES - 0.1, T_EYES + 0.5]);
    // the march's steps: every kick (reduced: beats 1 and 3 of the bar only), minus the holds
    const stepCache = {};
    const marchSteps = () => {
      const key = red() ? 'r' : 'n';
      if (!stepCache[key]) {
        let ts;
        if (red()) { ts = []; for (let k = Math.ceil((cue.from - 1e-4) / (2 * BEAT)); k * 2 * BEAT < cue.to; k++) ts.push(k * 2 * BEAT); }
        else ts = (MO.events.kick || []).map((e) => e.t).filter((x) => x >= cue.from - 1e-4 && x < cue.to && Math.round(x / BEAT) % 2 === 0);
        stepCache[key] = ts.filter((x) => !holds.some((h) => x >= h[0] && x <= h[1]));
      }
      return stepCache[key];
    };
    // the march: one row per step (the kicks on beats 1 and 3: 1.13 rows/s, under spec 7.3 rule 1's 2/s),
    // eased (integer at rest); rush: one row per beat, surging on the kick
    const travelAt = (t) => {
      if (mode === 1) return (t - cue.from) * 0.12;             // close: the defocused hall only drifts
      if (mode === 2) {
        const nk = MO.count('kick', t) - kicksBefore;
        const lk = MO.last('kick', t);
        const beats = (t - cue.from) / BEAT;
        if (red()) return beats * 0.7;
        const surge = nk > 0 ? MO.easeOut((t - lk.e.t) / (BEAT * 0.9)) : 0;
        return 0.5 * beats + 0.3 * Math.max(0, nk - 1 + surge);      // 0.8 rows per beat: 1.8 rows/s
      }
      const st = marchSteps();
      let nk = 0;
      while (nk < st.length && st[nk] <= t) nk++;
      if (nk <= 0) return 0;
      return nk - 1 + MO.easeInOut((t - st[nk - 1]) / (red() ? 0.5 : 0.25));
    };
    const backOut = (x) => { x = MO.clamp(x); const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
    // claps flip one tier (clap count mod 6), back on the next beat
    const flipAt = (t) => {
      const lc = MO.last('clap', t);
      if (!lc || lc.e.t < cue.from - 1e-4) return [1e9, 0];
      const tc = lc.e.t;
      const row = Math.round(travelAt(tc + 0.3)) + 3 + (lc.i % 6);      // tiers 3-8: never the big front rows
      const up = MO.easeInOut((t - tc) / (red() ? 0.35 : 0.2)), down = MO.easeInOut((t - tc - BEAT) / (red() ? 0.35 : 0.2));
      return [row, Math.PI * (up + down)];
    };
    // open hats: a glint runs along one row's eye-hole rims, from the aisle outward
    const glintAt = (t) => {
      const lo = MO.last('openHat', t);
      if (!lo || lo.e.t < cue.from - 1e-4) return [1e9, 0, 0];
      const u = (t - lo.e.t) / (BEAT * 0.5);
      return [Math.round(travelAt(lo.e.t + 0.2)) + 2 + (lo.i % 3), u * 9 - 1, u < 1 ? Math.sin(Math.PI * MO.clamp(u)) : 0];
    };
    // close: a light sweeps across the chrome on the bar's last open hat (once a bar: no strobing)
    const sweepAt = (t) => {
      const ev = MO.events.openHat;
      const l = MO.last('openHat', t);
      for (let i = l ? l.i : -1; i >= 0 && ev[i].t >= cue.from - 1e-4 && t - ev[i].t < BEAT * 0.6; i--) {
        if (Math.round(ev[i].t / STEP) % 16 === 14) return MO.clamp((t - ev[i].t) / (BEAT * 0.55));
      }
      return 0;
    };
    const IMPACTS = MO.S.fx.filter((f) => f.type === 'impact' && f.beat * BEAT >= cue.from - 1e-6 && f.beat * BEAT < cue.to).map((f) => ({ t: f.beat * BEAT, d: f.duration || 0.06 }));
    const FLARE = MO.words('rap').filter((w) => w.t >= cue.from - 1e-6 && w.t < cue.to && /mask|crown|face|lead|gold/i.test(w.text)).map((w) => w.t);
    const flareAt = (t) => FLARE.reduce((f, w) => (t >= w ? Math.max(f, Math.exp(-(t - w) / 0.35)) : f), 0);
    // the hall's geometry (hall space = the screen before the camera's push and roll)
    // R: the rake (hall: the tiers rise toward a horizon R above the vanishing point, the amphitheatre)
    const HALL = mode === 2
      ? { yv: 0.42, B: -0.55, Z0: 0.9, D: 0.42, hm: 0.16, Wc: 0.42, Aw: 0.30, Zn: 0.22, fog: 0.16, R: 0 }
      : mode === 1
        ? { yv: 0.50, B: -1.3, Z0: 1.3, D: 0.55, hm: 0.16, Wc: 0.46, Aw: 0.33, Zn: 0.5, fog: 0.11, R: 0 }
        : anima
          ? { yv: 0.56, B: -1.9, Z0: 1.15, D: 0.42, hm: 0.16, Wc: 0.44, Aw: 0.36, Zn: 0.5, fog: 0.10, R: 0.2 }    // closer: her faces legible
          : { yv: 0.56, B: -2.6, Z0: 1.6, D: 0.46, hm: 0.16, Wc: 0.42, Aw: 0.33, Zn: 0.6, fog: 0.085, R: 0.2 };
    const EYE_Y = 0.28;                                   // the figure's eye-holes at 36 % from the top
    const FIG_S = mode === 1 ? 0.70 / 0.125 : 0.53;       // close: the mask fills 70 % of the height
    const FIG_Y = EYE_Y - (0.835 + 0.13 * 0.125) * FIG_S;
    // the camera zooms on the figure's eye line, or (hall without the figure) just under the doorway, so it stays in frame
    const ZC = mode === 0 && !figureOn ? HALL.yv + HALL.R - 0.05 : EYE_Y;
    const uniforms = (t) => {
      const mt = K.M(t);
      const u = (t - cue.from) / Math.max(L, 1e-3);
      const travel = travelAt(t);
      const fl = flipAt(t), gl = glintAt(t);
      const eyes = T_EYES == null ? 0 : MO.easeOut((t - T_EYES) / (red() ? 0.3 : 0.1));
      const look = T_EYES == null ? 0 : backOut((t - T_EYES) / 0.3);
      const seedRows = Math.round(K.seed * 7) * 3;
      let zoom = zoomK, roll = rollK;
      const lo = MO.last('openHat', t);
      const out = {
        uHall: [HALL.yv, HALL.B, HALL.Z0, HALL.D], uHall2: [0, HALL.hm, HALL.Wc, HALL.Aw],
        uHall3: [travel + seedRows, mode === 1 ? 0.35 : 0, HALL.Zn, HALL.fog], uHall4: [1, 0, HALL.R, 0],
        uEv: [anima ? 0 : eyes, anima ? look : 0, anima ? 1 : 0, masksBack],
        uFlip: [fl[0] + seedRows, fl[1], gl[0] + seedRows, gl[1]],
        uEv2: [gl[2] * (red() ? 0.5 : 1), Math.round(K.seed * 17) % 97, mt - cue.from, mode === 2 ? 1 : 0],
        uTrans: [-9, 0.12, 0, 0],
        uFig: [0, FIG_Y, FIG_S, figureOn ? 1 : 0], uFig2: [0, 0, flareAt(t), 0],
        uFig3: [mode === 1 ? 0.014 : 0.035, 1, -1, mode === 1 ? sweepAt(t) : 0],
        // the figure lives: its aura rings travel outward one spacing per beat, the heart swells on the kick, it breathes
        uFig4: [(t - cue.from) / BEAT, MO.env('kick', t, 0.15) * (red() ? 0.3 : 1), 1 + 0.01 * Math.sin(Math.PI * (t - cue.from) / BEAT), 0],
        uCrack: [0, 0, 0, 0], uShat: [-1, 0, 0, 0], uSnap: [0, 0, 0, 0], uShA: SHARD0.A, uShB: SHARD0.B,
      };
      Object.assign(out, palU(pal, T_TRANS != null ? PAL.silver : pal));
      if (mode !== 1) {
        // hall: a slow push toward the figure's mask; rush: steady
        if (mode === 0) zoom *= MO.mix(1.0, 1.12, MO.smooth(u));
        // anti-strobe input: the march's instantaneous speed in rows per frame (the step peaks, not the beat average)
        out.uHall4[3] = Math.abs(travelAt(t + 1 / 60) - travelAt(t - 1 / 60));
        out.uHall4[1] = mode === 2 ? 1.6 : 0;
        if (T_CROWN != null && mode === 0) {
          const c = MO.clamp((t - T_CROWN + 0.25) / 0.25);
          out.uFig2[0] = c;
          out.uFig2[1] = T_CROWN === -Infinity ? 0 : t < T_CROWN ? 1.6 * Math.pow(1 - c, 2) : 0.05 * Math.exp(-(t - T_CROWN) / 0.08) * Math.sin((t - T_CROWN) * 40);
          if (T_CROWN > cue.from) {
            // the camera pushes in on the head (beats -2 .. -0.5 before the landing) and holds; the landing
            // squashes the body for 0.12 s and raises a ring of dust
            zoom *= MO.mix(1, 2.4 / 1.12, MO.easeInOut(MO.remap(t, T_CROWN - 2 * BEAT, T_CROWN - 0.5 * BEAT)));
            const tl = t - T_CROWN;
            if (tl >= 0 && tl < 0.12) out.uFig3[1] = 1 - 0.03 * Math.sin(Math.PI * tl / 0.12);
            if (tl >= 0 && tl < 0.25) out.uFig3[2] = tl / 0.25;
          }
        }
        if (anima && T_EYES != null && mode === 0) zoom *= MO.mix(1, 1.3, MO.easeInOut((t - T_EYES) / 0.3));   // closer on the turn
        if (T_TRANS != null) {
          const tt = t - T_TRANS;
          // the front rises from the bottom of the frame past the tiers' horizon in 1.5 beats; the back wall
          // turns silver as the front reaches it
          const top = HALL.yv + HALL.R + 0.08;
          const front = tt < 0 ? -9 : MO.mix(-1.1, top, MO.easeOut(tt / (1.5 * BEAT)));
          out.uTrans = [front, 0.12, 1, MO.smooth(MO.remap(front, top - 0.33, top))];
          out.uFig2[3] = MO.smooth(tt / 0.15);
        }
      } else {
        // close: the mask fills 70 % of the height; a dutch drift, a micro-jolt on the kick
        const kick = MO.env('kick', t, 0.08) * (red() ? 0.3 : 1);
        let push;
        if (T_SHAT != null && T_SHAT > cue.from) {
          const us = MO.clamp((t - cue.from) / (T_SHAT - cue.from));
          push = t < T_SHAT ? 1 + 0.6 * MO.easeIn(us) : 1.6 - 0.32 * MO.easeInOut((t - T_SHAT - 0.12) / Math.max(cue.to - T_SHAT - 0.12, 0.1));
        } else push = MO.mix(1.0, 1.08, MO.smooth(u));
        zoom *= push * (1 + 0.012 * kick);
        roll += (4 * Math.PI / 180) * MO.smooth(u) * (T_SHAT != null ? 0.5 : 1);
        out.uHall4 = [1.0 + 0.25 * (zoom - 1) / zoom, 0, 0, 0];
        // the crack
        if (T_CRACK != null) {
          const tc = t - (T_CRACK === -Infinity ? cue.from - 10 : T_CRACK);
          let cr = tc < 0 ? 0 : 0.42 * MO.easeOut(tc / 0.35) + 0.03 * MO.clamp(tc / 3);
          let ck = 0;
          if (crackPerKick) {
            const tk = T_SHAT != null ? Math.min(t, T_SHAT - 1e-3) : t;
            const nk = MO.count('kick', tk) - kicksBefore, lk = MO.last('kick', tk);
            if (nk > 0) cr += 0.20 * (nk - 1) + 0.20 * MO.easeOut((tk - lk.e.t) / 0.1);
            ck = MO.env('kick', tk, 0.15);
          }
          out.uCrack = [cr, MO.clamp(1 - Math.max(tc, 0) / 0.6), ck * (red() ? 0.3 : 1), 0];
        }
        if (T_SHAT === -Infinity) {
          // shattered before the cue: the shards are gone, the Shadow's face looks out
          out.uShat = [5, 0, 1, 1];
          const tb = shardTable(0, 0, true);
          out.uShA = tb.A; out.uShB = tb.B;
        } else if (T_SHAT != null && t >= T_SHAT) {
          const tau = t - T_SHAT;
          // the fill: each clap after the burst releases one ring of shards, outermost first
          const fcs = MO.events.clap.filter((e) => e.t > T_SHAT + 0.05 && e.t < cue.to + 1).map((e) => e.t);
          const fall = [0, 1, 2, 3].map((r) => (fcs.length ? t - fcs[Math.min(3 - r, fcs.length - 1)] : 0));
          const te = tau - 0.2;
          const eo = te < 0 ? 0 : MO.clamp(1.0 - Math.exp(-40 * te) * Math.cos(30 * te) + 0.15 * Math.exp(-8 * te) * Math.sin(30 * te), 0, 1.2);
          out.uShat = [tau, 0, red() ? MO.smooth(tau / 0.5) : 0, eo];
          const tb = shardTable(tau, red() ? 0 : fall, red());
          out.uShA = tb.A; out.uShB = tb.B; out.uCrack[3] = tb.g;
          out.uSnap = [te > 0 ? Math.exp(-te / 0.22) * (red() ? 0.4 : 1) : 0, 0.25 + Math.max(0, te) * 4.5, 0, 0];
        }
        out.uEv[0] = eyes;
      }
      // the score's impact frames in this cue: the scene keeps only its light lines (not in reduced mode: no impacts there)
      out.uSnap[2] = !red() && IMPACTS.some((f) => t >= f.t && t < f.t + f.d) ? 1 : 0;
      out.uView = [zoom, roll, 0, ZC];
      if (!K.still) out.uTime = mt;
      return out;
    };
    // Each cue compiles only what it can show (on SwiftShader every line of a program costs, branch taken
    // or not): the Anima's hair and crescents, the headdresses (hall), the melt, the crack and shards,
    // the crown, the rush's speed lines, the figure. Cues with the same switches share one program.
    const D = (k, on) => `#define ${k} ${on ? 1 : 0}\n`;
    const defs = D('PM_ANIMA', anima) + D('PM_HATS', !anima && mode === 0) + D('PM_TRANS', T_TRANS != null) +
      D('PM_CRACK', mode === 1 && (T_CRACK != null || T_SHAT != null)) + D('PM_CROWN', mode === 0 && T_CROWN != null) +
      D('PM_RUSH', mode === 2) + D('PM_FIG', figureOn) + `#define PM_NROWS ${mode === 1 ? 3 : 6}\n`;
    MO.scene({ id: 'persona.masks#' + cue.index, fs: defs + FS, uniforms, bloom: 0.6, bloomThreshold: 0.85, vignette: 0.45 });
  });
})();
