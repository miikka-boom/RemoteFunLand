// HERMIT.LANTERN — IX The Hermit, XVI The Tower. Owner: hermit agent. One shot factory of the full
// version (spec 5.5); it has no 30 s window, so it exists only in a cue list.
// Night on the Holy Mountain, a frontal tableau: the Hermit (the Wise Old Man) in a hooded cloak of
// fine contour lines, a beard of luminous threads, a staff wound with a two-strand serpent, raising
// a lantern in which a six-pointed star burns inside a glass flask; behind him the seven dark
// terraces and the alchemist's tower. Five modes of one world (a mode is a camera): wide; lantern (the
// same lantern seen ~27x closer: the vas hermeticum, the star, the homunculus); close (the hood; the
// eyes open); tower (tilt up to the summit, the storm gathers); strike (XVI: the bolt, the crown
// blown off, fire, two falling figures). The doc block above MO.shot has the modes and every param.
// One fragment source for every cue (all knobs are uniforms), so all cues share one compiled
// program. Everything is a pure function of time.
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

  // ---------------------------------------------------------------- the world (world units = the
  // wide shot's uvCentered units: y -1..1, x -16/9..16/9; camera identity in mode wide)
  const TOWER_BASE = [0.0, 0.58];       // the athanor's foot on the summit terrace
  const TOWER_H = 0.24;                 // its banded body
  const DOME_TOP = [0.0, 0.58 + 0.24 + 0.022 + 0.066 * 0.9 * 0.82 + 0.034];   // the finial's orb (where the bolt strikes)
  const LAMP_LOW = [0.262, -0.118];     // lantern centre, held low (before the lift)
  const LAMP_HIGH = [0.292, 0.212];     // lantern centre, raised ("Hold the lantern high")
  // THE MATCH CUT 78.5-79 -> 79.1 (spec 4.1 rule 9): orrery.thieves' ignited Sol on its last frame and
  // this shot's lightning core (where the bolt meets the dome) sit on the same screen point.
  // Screen units: uvCentered, y up, 1 = half the frame height, x 1 = half the frame height to the
  // right (x in -1.778..1.778). In frame fractions (x from the left, y from the top): (0.5, 0.30).
  // Published as MO.MATCH_SOL_TOWER (scene files load before MO.init runs the factories, so
  // orrery.js can read it in its factory); a strike cue can move the point with strikeX / strikeY.
  const MATCH_SOL_TOWER = [0.0, 0.40];
  MO.MATCH_SOL_TOWER = MATCH_SOL_TOWER;

  const FS = `
// ---------------------------------------------------------------- uniforms
uniform float uMode;      // 0 wide, 1 lantern (macro), 2 close, 3 tower, 4 strike
uniform vec4  uCam;       // world camera: centre xy (world), zoom, roll (radians, + = counter-clockwise)
uniform float uMT;        // ambient-motion clock (seconds)
uniform vec4  uLamp;      // lantern: centre xy (world), brightness, lift 0 (low) .. 1 (raised)
uniform vec2  uHand;      // the hand that holds the lantern ring (world)
uniform float uEyes;      // the Hermit's eyes: 0 closed .. 1 open
uniform vec3  uStorm;     // storm amount 0..1, inner-glow strength, cloud drift (world units)
uniform float uWin;       // the tower window's brightness (heartbeat)
uniform float uSpk;       // falling-spark density (0 = none)
uniform vec4  uBoltE;     // bolt: envelope 0..1, core 0/1, seconds since the strike (< 0 before), sky light
uniform vec2  uBolt[12];  // the bolt's main polyline (world), top of frame -> dome
uniform vec2  uBr[8];     // two branches, 4 points each (world)
uniform vec4  uCrown;     // the crown (parapet + dome): offset xy (world), rotation, 0/1 broken
uniform vec4  uMac;       // the lantern: turn (radians), word pulse, macro weight 0..1, homunculus breath
uniform float uFigs;      // aftermath clock: seconds since the strike (< 0 = none)
uniform float uLat;       // the lamp's lattice strength
uniform vec2  uHer;       // the Hermit layer: visible 0/1, vertical offset (world)
uniform vec4  uN;        // .y: the lantern's front bars per turn (3); a uniform count keeps the loop a loop
uniform float uTowerOn;   // the tower is in frame (0 in close: a uniform branch saves its cost)

const vec3 HL_AMBER = vec3(1.00, 0.56, 0.18);
const vec3 HL_GOLD  = vec3(1.00, 0.78, 0.40);
const vec3 HL_ULTRA = vec3(0.16, 0.30, 1.20);
const vec3 HL_OCHRE = vec3(0.95, 0.62, 0.12);
const vec3 HL_SILV  = vec3(0.55, 0.65, 1.00);
const vec3 HL_VIO   = vec3(0.45, 0.25, 1.00);
const vec2 HL_TB = vec2(${TOWER_BASE[0].toFixed(4)}, ${TOWER_BASE[1].toFixed(4)});
const float HL_TH = ${TOWER_H.toFixed(4)};
const float HL_TW = 0.066;

// iso-lines of a field: v = field / spacing, pv = one pixel in those units; fades out when the
// lines get denser than ~3 px so they never shimmer (the albedo iso-line fade)
float hl_iso(float v, float pv, float widthPx) {
  float dd = abs(fract(v + 0.5) - 0.5) / max(pv, 1e-6);
  return (1.0 - smoothstep(0.5 * widthPx - 0.5, 0.5 * widthPx + 0.8, dd)) * smoothstep(2.5, 5.0, 1.0 / max(pv, 1e-6));
}
// an anti-aliased line along an SDF's zero set, widthPx pixels wide (aa = one pixel in d's units)
float hl_line(float d, float aa, float widthPx) { return 1.0 - smoothstep(0.5 * widthPx * aa - 0.5 * aa, 0.5 * widthPx * aa + 0.8 * aa, abs(d)); }
float hl_fill(float d, float aa) { return 1.0 - smoothstep(-aa, aa, d); }
// cheap atan2 (|error| < 0.005 rad)
float hl_atan(float y, float x) {
  float ax = abs(x), ay = abs(y);
  float a = min(ax, ay) / max(max(ax, ay), 1e-9);
  float s = a * a;
  float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  r = ay > ax ? 1.57079637 - r : r;
  r = x < 0.0 ? 3.14159274 - r : r;
  return y < 0.0 ? -r : r;
}
vec2 hl_rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// ---------------------------------------------------------------- sky: indigo night, fine stars
// (a few with an anime sparkle)
vec3 hl_sky(vec2 s, float ps) {
  vec3 col = mix(vec3(0.018, 0.012, 0.050), vec3(0.002, 0.002, 0.009), smoothstep(-0.7, 1.0, s.y));
  col += vec3(0.026, 0.010, 0.044) * exp(-abs(s.y + 0.10) * 2.4);
  float dim = 1.0 - 0.85 * uStorm.x;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float dens = 16.0 + 18.0 * fk;
    vec2 g = s * dens + fk * 17.3;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float h = hash21(id + fk * 31.0);
    vec2 o = (hash22(id + 7.0) - 0.5) * 0.6;
    vec2 dv = (f - o) / dens;
    float r2 = dot(dv, dv);
    float sz = mix(0.85, 0.62, fk) * ps * (0.8 + 0.5 * fract(h * 7.0));
    float tw = 0.70 + 0.30 * sin(uMT * (0.6 + 1.1 * h) + h * 40.0);
    float on = step(0.90 + 0.04 * fk, h);
    vec3 sc = mix(vec3(0.70, 0.78, 1.0), vec3(1.0, 0.84, 0.62), step(0.97, h));
    col += sc * exp(-r2 / (sz * sz)) * (1.0 - 0.45 * fk) * on * tw * dim;
    // the brightest few carry a four-point sparkle (kept inside their cell)
    vec2 ad = abs(dv) / ps;
    float spk = step(0.992, h) * (1.0 - fk) * step(max(ad.x, ad.y), 0.45 / dens / ps);
    col += sc * spk * tw * dim * 0.30 * (max(0.0, 1.0 - ad.y * 0.8 - ad.x * 0.12) + max(0.0, 1.0 - ad.x * 0.8 - ad.y * 0.12));
  }
  return col;
}
// the scintillae: sparse sparks falling slowly through the sky, three parallax layers
vec3 hl_sparks(vec2 s, float ps, float dens) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float sc = 2.6 + 1.9 * fk;
    float sp = 0.045 + 0.028 * fk;
    vec2 g = s * sc + vec2(0.37 * fk, uMT * sp * sc);
    vec2 id = floor(g), f = fract(g);
    float h = hash21(id + 11.0 * fk);
    vec2 o = 0.2 + 0.6 * hash22(id + 3.1 * fk);
    o.x += 0.04 * sin(uMT * (0.5 + 0.4 * h) + h * 30.0);
    vec2 d = (f - o) / sc;
    float len = 0.014 + 0.018 * h;
    float along = clamp(d.y / len, 0.0, 1.0);
    float dist = length(vec2(d.x, d.y - along * len));
    float w = ps * (0.70 + 0.25 * fk);
    float v = exp(-dist * dist / (w * w)) * (1.0 - along) * (1.0 - along);
    float on = step(1.0 - 0.11 * dens, h);
    float tw = 0.65 + 0.35 * sin(uMT * 2.3 + h * 60.0);
    acc += mix(HL_GOLD, vec3(1.0, 0.92, 0.80), 0.35 * fk) * v * on * tw * (0.6 + 0.4 * fk);
  }
  return acc;
}

// ---------------------------------------------------------------- the storm: three octaves of
// banded noise, dark slate violet, lit from inside (slow inner glows; the bolt)
vec3 hl_storm(vec3 col, vec2 s, vec2 boltAt) {
  float amt = uStorm.x;
  vec2 q = vec2(s.x * 1.25 + uStorm.z, s.y * 2.6 - 0.3 * uStorm.z);
  float n = vnoise(q) * 0.56 + vnoise(q * 2.13 + vec2(3.7, 1.1)) * 0.29 + vnoise(q * 4.41 + vec2(9.1, 4.3)) * 0.15;
  float band = 0.5 + 0.5 * sin(s.y * 5.0 + n * 3.4);
  float nn = n * (0.78 + 0.32 * band);
  float th = 0.80 - 0.36 * amt;
  float cl = smoothstep(th - 0.10, th + 0.14, nn) * amt;
  vec3 cc = mix(vec3(0.006, 0.005, 0.014), vec3(0.030, 0.020, 0.056), smoothstep(th, th + 0.3, nn));
  // inner glows: two soft lights drifting inside the clouds (slow, no flicker)
  vec2 g1 = vec2(-0.60 + 0.25 * sin(uMT * 0.21), 0.55 + 0.10 * sin(uMT * 0.29));
  vec2 g2 = vec2(0.75 + 0.20 * sin(uMT * 0.17 + 2.0), 0.35 + 0.12 * sin(uMT * 0.25 + 1.0));
  float gl = exp(-dot(s - g1, s - g1) * 2.6) * (0.65 + 0.35 * sin(uMT * 0.8)) + exp(-dot(s - g2, s - g2) * 3.5) * (0.65 + 0.35 * sin(uMT * 0.6 + 2.0));
  cc += vec3(0.10, 0.05, 0.22) * gl * uStorm.y * smoothstep(th, th + 0.35, nn);
  // silver linings along the cloud edges
  cc += vec3(0.20, 0.18, 0.40) * exp(-abs(nn - th - 0.02) / 0.018) * 0.30;
  // the bolt lights the clouds from inside, most near the bolt (one envelope with the bolt)
  float bl = uBoltE.x * uBoltE.w;
  cc += vec3(0.40, 0.34, 0.80) * bl * exp(-length(s - boltAt) * 1.8) * (0.3 + 0.7 * smoothstep(th, th + 0.3, nn));
  return mix(col, cc, cl) + vec3(0.10, 0.08, 0.22) * bl * exp(-length(s - boltAt) * 1.2) * (1.0 - cl);
}

// ---------------------------------------------------------------- the Holy Mountain at night:
// seven dark terraces (one per chakra) drawn as luminous linework: moonlit tread edges, faint
// engraved courses and friezes, a few lit windows. lam = the lantern's light (reveals the rock).
vec4 hl_mount(vec2 w, float pe, float lam, float lat) {
  float ax = abs(w.x);
  float y = w.y;
  float s1 = step(-0.36, y), s2 = step(-0.16, y), s3 = step(0.025, y), s4 = step(0.19, y), s5 = step(0.335, y), s6 = step(0.465, y);
  float k = s1 + s2 + s3 + s4 + s5 + s6;
  float y0 = -0.58 + s1 * 0.22 + s2 * 0.20 + s3 * 0.185 + s4 * 0.165 + s5 * 0.145 + s6 * 0.13;
  float hk = 0.22 - s1 * 0.02 - s2 * 0.015 - s3 * 0.02 - s4 * 0.02 - s5 * 0.015 - s6 * 0.015;
  float Wk = 2.0 - s1 * 0.36 - s2 * 0.33 - s3 * 0.29 - s4 * 0.26 - s5 * 0.23 - s6 * 0.21;
  float v = (y - y0) / hk, pv = pe / hk;
  float inM = (1.0 - smoothstep(Wk - pe, Wk + pe, ax)) * step(y, 0.58) * step(-0.62, y);
  float far = sat((y + 0.58) / 1.16);
  // umber rock in the dark, its structure drawn in faint engraved lines
  vec3 face = vec3(0.0045, 0.0030, 0.0030) * (0.7 + 0.6 * v);
  float riser = 1.0 - smoothstep(0.80, 0.86, v);
  float course = hl_iso(v * 6.0, pv * 6.0, 1.0) * riser;
  vec3 ln = vec3(0.016, 0.016, 0.040) * course;
  // the frieze: a fire triangle or a sun circle per panel, engraved lines only
  float fb = step(0.24, v) * step(v, 0.68);
  float fh = 0.44 * hk, cw = fh * 1.25;
  float cxp = w.x / cw, cid = floor(cxp + 0.5);
  vec2 cl = vec2((cxp - cid) * cw, (v - 0.46) * hk);
  float alt = mod(cid + k, 2.0);
  float motif = mix((abs(cl.x) + abs(cl.y)) * 0.7071 - fh * 0.24, length(cl) - fh * 0.28, alt);
  ln += mix(vec3(0.07, 0.020, 0.018), vec3(0.025, 0.030, 0.090), alt) * hl_line(motif, pe, 1.0) * fb;
  ln += vec3(0.030, 0.032, 0.075) * (hl_line((v - 0.24) * hk, pe, 1.0) + hl_line((v - 0.68) * hk, pe, 1.0));
  // a few lit windows (warm points, slow breathing)
  float wh = hash21(vec2(cid, k) + 4.0);
  float win = step(0.88, wh) * hl_fill(sdBox(cl, vec2(0.06, 0.10) * fh), pe) * fb;
  ln += HL_AMBER * 0.8 * win * (0.75 + 0.25 * sin(uMT * (0.4 + wh) + wh * 20.0));
  // the tread and the moonlit edges
  float tread = smoothstep(0.86 - pv, 0.86 + pv, v);
  face = mix(face, vec3(0.008, 0.008, 0.020) + vec3(0.010, 0.012, 0.030) * (v - 0.86) / 0.14, tread);
  float rim = hl_line((v - 1.0) * hk, pe, 1.3) + hl_line((v - 0.86) * hk, pe, 0.9) * 0.35 + hl_line(ax - Wk, pe, 1.3) * 0.7;
  ln += HL_SILV * 0.20 * rim * (0.45 + 0.55 * far);
  // the lantern reveals the structure inside the rock: courses, joints and the lattice flare amber
  vec3 col = face + ln * (1.0 + 6.0 * lam) + HL_AMBER * lam * (0.02 + 0.30 * course + 0.25 * rim + 0.45 * lat);
  // haze: the far terraces sink into the indigo
  col = mix(col, vec3(0.009, 0.008, 0.030), 0.30 * far);
  return vec4(col, inM);
}

// the lantern's lattice: a corridor of perspective lines inside the rock that converges on the
// lamp (two families: lines toward the vanishing point, rings of equal depth)
float hl_lattice(vec2 w, vec2 L, float pe) {
  vec2 d = w - L;
  vec2 ad = abs(d);
  float m = max(ad.x, ad.y);
  float u = ad.y > ad.x ? d.x / ad.y : d.y / ad.x;
  float pu = pe * sqrt(1.0 + u * u) / max(m, 1e-3);
  float l1 = hl_iso(u * 4.0, pu * 4.0, 1.0);
  // rings at m = 0.36 / k: the outermost lies beyond the lamp's light, so no ring edge shows
  float z = 0.12 / max(m, 1e-3);
  float l2 = hl_iso(z * 3.0, z / max(m, 1e-3) * pe * 3.0, 1.0);
  return (l1 * 0.8 + l2) * smoothstep(0.04, 0.10, m) * (1.0 - smoothstep(0.26, 0.36, m));
}

// ---------------------------------------------------------------- flames: a few tongues rising
// from a base (q: base at y = 0, units of the flame width), returns colour (alpha in .a)
vec4 hl_flame(vec2 q, float h, float seed) {
  if (q.y < -0.3 || q.y > h * 1.6 || abs(q.x) > 1.6) return vec4(0.0);
  float f = sat(q.y / h);
  float n1 = vnoise(vec2(q.x * 2.2 + seed, q.y * 1.6 - uMT * 3.4));
  float n2 = 0.5 + 0.5 * sin(q.x * 9.0 - seed + q.y * 5.0 - uMT * 7.0 + n1 * 4.0);
  float x = q.x + (n1 - 0.5) * 0.9 * f;
  float tongues = 0.55 + 0.45 * sin(x * 6.5 + seed + n2 * 2.0);
  float wdt = (1.0 - f) * (0.65 + 0.55 * tongues) - 0.10 * n2;
  float inF = smoothstep(0.0, 0.10, wdt - abs(x) * (0.9 + 0.5 * f)) * smoothstep(-0.3, 0.0, q.y);
  vec3 c = mix(vec3(3.2, 2.4, 1.1), vec3(2.4, 0.85, 0.12), smoothstep(0.05, 0.45, f + 0.25 * abs(x)));
  c = mix(c, vec3(0.9, 0.12, 0.03), smoothstep(0.45, 0.95, f));
  return vec4(c, inF * (1.0 - 0.4 * f));
}

// ---------------------------------------------------------------- the athanor tower: banded
// cylinder, an arched window (fire), the crown (parapet, crenels, dome, finial). In strike mode
// the crown is blown off (uCrown) and the broken top burns.
vec4 hl_tower(vec2 w, float pe) {
  vec2 q = w - HL_TB;
  if (abs(q.x) > 0.55 || q.y < -0.01 || q.y > 0.95) return vec4(0.0);
  vec3 col = vec3(0.0); float a = 0.0;
  float tv = q.y / HL_TH;
  float tw = HL_TW * (1.0 - 0.10 * tv);
  // broken top: a jagged line under the parapet once struck
  float jag = HL_TH - uCrown.w * (0.020 + 0.010 * sin(q.x * 150.0) + 0.007 * sin(q.x * 380.0 + 1.0) + 0.012 * sat(q.x / tw));
  float inT = step(0.0, q.y) * (1.0 - smoothstep(jag - pe, jag + pe, q.y)) * (1.0 - smoothstep(tw - pe, tw + pe, abs(q.x)));
  if (inT > 0.0) {
    float u = q.x / tw, nz = sqrt(max(1.0 - u * u, 0.0));
    float band = floor(tv * 6.0);
    vec3 tc = mix(vec3(0.030, 0.007, 0.006), vec3(0.004, 0.008, 0.040), mod(band, 2.0)) * (0.30 + 0.70 * nz);
    tc += HL_SILV * 0.05 * smoothstep(0.2, -0.9, u) * nz;
    float bl = hl_iso(tv * 6.0, pe / HL_TH * 6.0, 1.3);
    // brick courses and staggered joints, foreshortened on the cylinder
    float bc = hl_iso(tv * 36.0, pe / HL_TH * 36.0, 0.9);
    vec3 lc = vec3(0.10, 0.10, 0.24) * bl + vec3(0.030, 0.030, 0.065) * bc;
    // the arched window and its fire
    vec2 wq = q - vec2(0.0, HL_TH * 0.46);
    float win = min(sdBox(wq + vec2(0.0, 0.010), vec2(0.016, 0.024)), length(wq - vec2(0.0, 0.014)) - 0.016);
    float fl = vnoise(vec2(wq.x * 80.0 + q.y * 30.0, wq.y * 40.0 - uMT * 6.0));
    float lit = uWin * exp(-max(win, 0.0) / 0.04);
    tc += lc * (1.0 + 2.5 * lit);
    vec3 fire = vec3(2.6, 1.05, 0.22) * (0.55 + 0.7 * fl) * uWin;
    tc = mix(tc, fire, hl_fill(win, pe));
    tc += HL_GOLD * 0.9 * hl_line(win, pe, 1.2) * (0.5 + 0.5 * uWin) + HL_AMBER * 0.25 * lit * nz;
    tc += HL_SILV * 0.40 * hl_line(abs(q.x) - tw, pe, 1.3) * (0.5 + 0.5 * step(q.x, 0.0));
    // the broken top glows with fire once struck
    tc += vec3(2.2, 0.75, 0.12) * uCrown.w * exp(-max(jag - q.y, 0.0) / 0.010) * (0.6 + 0.4 * fl);
    col = tc; a = inT;
  }
  // the crown: parapet, crenels, dome, finial; it turns about the parapet's centre
  vec2 pq = q - vec2(0.0, HL_TH) - uCrown.xy;
  pq = hl_rot(pq - vec2(0.0, 0.03), -uCrown.z) + vec2(0.0, 0.03);
  if (abs(pq.x) < 0.12 && pq.y > -0.05 && pq.y < 0.14) {
    float twt = HL_TW * 0.90;
    float par = sdBox(pq - vec2(0.0, 0.011), vec2(twt * 1.22, 0.011));
    float cren = max(sdBox(pq - vec2(0.0, 0.031), vec2(twt * 1.22, 0.010)), 0.0090 - abs(fract(pq.x / 0.036 + 0.5) - 0.5) * 0.036);
    float dome = max(length(pq - vec2(0.0, 0.022)) - twt * 0.82, -(pq.y - 0.022));
    float fin = sdCapsule(pq, vec2(0.0, 0.022 + twt * 0.82), vec2(0.0, 0.022 + twt * 0.82 + 0.030), 0.0030);
    float orb = length(pq - vec2(0.0, 0.022 + twt * 0.82 + 0.034)) - 0.0065;
    float cap = min(min(par, cren), min(min(dome, fin), orb));
    float inC = hl_fill(cap, pe);
    vec3 ccap = vec3(0.010, 0.010, 0.030) + HL_SILV * 0.07 * smoothstep(0.0, -0.05, pq.x);
    float du = clamp(pq.x / (twt * 0.82), -1.0, 1.0);
    ccap += HL_GOLD * 0.16 * hl_iso(asin(du) / 0.30, pe / (twt * 0.82) / max(sqrt(1.0 - du * du), 0.25) / 0.30, 1.0) * hl_fill(dome, pe);
    ccap += HL_GOLD * 0.05 * (1.0 - abs(du)) * hl_fill(dome, pe);
    // the underside burns once blown off
    ccap += vec3(2.0, 0.7, 0.12) * uCrown.w * smoothstep(0.012, 0.0, pq.y) * hl_fill(par, pe);
    col = mix(col, ccap, inC);
    col += HL_SILV * 0.55 * hl_line(cap, pe, 1.3) + HL_GOLD * 0.5 * hl_line(orb, pe, 1.2);
    a = max(a, inC);
  }
  return vec4(col, a);
}

// ---------------------------------------------------------------- the Hermit
// Hood apex y 0.535, face opening around (0, 0.30), shoulders ~0.14, hem -0.865. The cloak is
// ultramarine with an ochre lining over a red robe (the Marseille Hermit), drawn in contour lines.
float hl_robeSDF(vec2 p, out float sleeve, out float hood) {
  float cowl = sdEllipse(p - vec2(0.0, 0.330), vec2(0.112, 0.150));
  float peak = sdTaper(p, vec2(-0.012, 0.395), vec2(-0.082, 0.528), 0.068, 0.006);
  hood = smin(cowl, peak, 0.05);
  float hem = p.y + 0.865 - 0.012 * sin(p.x * 11.0 + 0.6);
  float cloak = max(sdTaper(p, vec2(0.0, 0.040), vec2(0.0, -0.72), 0.170, 0.41), -hem);
  vec2 shR = vec2(0.105, 0.135), shL = vec2(-0.110, 0.130);
  float sR = sdTaper(p, shR, uHand + vec2(-0.004, -0.032), 0.052, 0.062);
  float sL = sdTaper(p, shL, vec2(-0.262, 0.012), 0.052, 0.060);
  sleeve = min(sR, sL);
  float d = smin(cloak, hood, 0.05);
  return smin(d, sleeve, 0.035);
}

// the eyes in the hood's darkness: calm closed lids, or silver irises with a soft glow
vec3 hl_eye(vec2 q, float pe, float open) {
  // q in eye units (half width 1), mirrored so +x points outward
  vec3 col = vec3(0.0);
  float k = max(1.0 - q.x * q.x, 0.0);
  float ins = step(abs(q.x), 1.0);
  // closed: a downward-bowed lid line with fine lashes
  float yc = -0.20 * k + 0.02 - 0.04 * q.x;
  float dc = (q.y - yc) / sqrt(1.0 + 0.2025 * q.x * q.x);
  float lash = hl_iso(q.x * 5.0, pe * 5.0, 0.8) * smoothstep(0.0, -0.18, dc) * smoothstep(-0.30, -0.05, dc) * smoothstep(0.95, 0.4, abs(q.x));
  col += vec3(0.50, 0.56, 0.80) * (0.60 * hl_line(dc, pe, 1.2) + 0.25 * lash + 0.06 * exp(-abs(dc) / (pe * 3.0))) * (1.0 - open) * ins;
  if (open > 0.001) {
    float o = open * 0.75;    // calm: never wide
    float yU = o * 0.46 * k + 0.02 - 0.05 * q.x;
    float yL = -o * 0.28 * k + 0.02 - 0.03 * q.x;
    float inside = ins * hl_fill(max(q.y - yU, yL - q.y), pe);
    vec2 iq = q - vec2(-0.08, 0.02);
    float ir = length(iq);
    vec3 e = vec3(0.07, 0.075, 0.11);
    vec3 iris = mix(vec3(1.10, 1.18, 1.45), vec3(0.30, 0.36, 0.62), smoothstep(0.10, 0.42, ir));
    iris += vec3(0.6, 0.7, 1.0) * 0.45 * hl_iso(hl_atan(iq.y, iq.x) / TAU * 30.0, pe / max(ir, 0.05) / TAU * 30.0, 1.0) * smoothstep(0.14, 0.22, ir);
    iris += vec3(0.5, 0.6, 1.0) * 0.5 * hl_line(ir - 0.44, pe, 1.2);
    e = mix(e, iris, hl_fill(ir - 0.45, pe));
    e = mix(e, vec3(0.008), hl_fill(ir - 0.15, pe));
    e += vec3(1.8) * hl_fill(length(q - vec2(0.04, 0.12)) - 0.065, pe);
    col = mix(col, e, inside);
    float edge = min(abs(q.y - yU), abs(q.y - yL));
    col += vec3(0.65, 0.70, 0.95) * hl_line(edge, pe, 1.1) * open * ins * step(yL - pe, q.y) * step(q.y, yU + pe * 2.0);
    col += vec3(0.30, 0.38, 0.75) * 0.22 * exp(-length(q * vec2(0.8, 1.6)) * 1.6) * open;
  }
  return col;
}

// the beard: 28 luminous threads from the chin, fanning out and swaying; where they crowd closer
// than the pixels can show, they fade toward their average (no white blob, no shimmer)
vec3 hl_beard(vec2 p, float pe, float lam, out float cov) {
  const float YT = 0.255;
  float acc = 0.0, tot = 0.0;
  float fan = 1.0 + 2.4 * (YT - p.y);
  float sw = 0.6 * uMT;
  float sp = 0.0060 * fan;
  float spPx = sp / pe;
  float wpx = 0.40 + 0.15 * sat(spPx / 8.0);
  float am = 0.45 * sp * smoothstep(0.0, 0.12, YT - p.y);
  // the sway is under half a spacing: the nearest thread is among the 3 around the unswayed one
  float i0 = floor(p.x / sp + 13.5 + 0.5);
  for (int k = -1; k <= 1; k++) {
    float fi = i0 + float(k);
    float inRange = step(-0.5, fi) * step(fi, 27.5);
    float hb = fract(sin(fi * 12.9898) * 43758.5453);
    float yb = -0.10 - 0.17 * hb + 0.07 * abs(fi - 13.5) / 13.5;    // where this thread ends
    float ph = 9.0 * p.y + 1.7 * fi + sw;
    float x = (fi - 13.5) * sp + am * sin(ph);
    float slope = -0.0060 * 2.4 * (fi - 13.5) + am * 9.0 * cos(ph);
    float d = abs(p.x - x) / sqrt(1.0 + slope * slope);
    float ln = 1.0 - smoothstep(wpx * pe, (wpx + 0.9) * pe, d);
    float along = (YT - p.y) / (YT - yb);
    float vis = smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.70, 1.0, along)) * inRange;
    acc += ln * vis * (0.55 + 0.45 * hb);
    tot = max(tot, ln * vis);
  }
  float norm = clamp(spPx / 3.0, 0.22, 1.0);
  cov = sat(tot) * (0.4 + 0.6 * norm);
  // a soft luminous body under the threads, so the beard reads as light at any size
  float bw = 0.0060 * 14.0 * fan + am;
  float body = (1.0 - smoothstep(bw * 0.6, bw * 1.05, abs(p.x))) * smoothstep(YT + 0.005, YT - 0.03, p.y) * (1.0 - smoothstep(-0.30, -0.10, -p.y - 0.0) * 0.0) * smoothstep(-0.30, -0.12, p.y);
  vec3 c = mix(vec3(0.80, 0.85, 1.0), vec3(1.15, 0.84, 0.48), sat(lam * 1.4));
  return c * (acc * norm * (0.62 + 1.1 * lam) + body * 0.05 * (1.0 + 2.0 * lam));
}

// the staff: wood, a crescent at the top, wound with a two-strand serpent
vec4 hl_staff(vec2 p, float pe, float lam) {
  if (p.x < -0.40 || p.x > -0.18 || p.y > 0.76 || p.y < -0.90) return vec4(0.0);
  vec2 a = vec2(-0.272, -0.868), b = vec2(-0.292, 0.640);
  float ds = sdSegment(p, a, b) - 0.0070;
  vec3 col = vec3(0.0); float al = 0.0;
  float inS = hl_fill(ds, pe);
  vec3 wood = vec3(0.022, 0.013, 0.008) + HL_SILV * 0.22 * hl_line(ds, pe, 1.1) + HL_AMBER * lam * 0.5 * hl_line(ds, pe, 1.4);
  col = mix(col, wood, inS); al = inS;
  // the serpent: two strands winding round the staff (over / under by the winding phase)
  float sx = mix(a.x, b.x, (p.y - a.y) / (b.y - a.y));
  float yOn = smoothstep(-0.62, -0.57, p.y) * (1.0 - smoothstep(0.50, 0.53, p.y));
  for (int j = 0; j < 2; j++) {
    float pj = p.y * 38.0 + 3.14159 * float(j);
    float amp = 0.016 * (1.0 - 0.3 * sat((p.y + 0.55) / 1.05));
    float x = sx + amp * sin(pj);
    float slope = amp * 38.0 * cos(pj);
    float d = abs(p.x - x) / sqrt(1.0 + slope * slope) - 0.0028;
    float front = smoothstep(-0.2, 0.2, cos(pj));
    float inV = hl_fill(d, pe) * yOn;
    vec3 sc = mix(vec3(0.006, 0.020, 0.012), vec3(0.02, 0.07, 0.035), front);
    sc += vec3(0.45, 0.75, 0.30) * 0.30 * hl_line(d, pe, 1.0) * (0.35 + 0.65 * front);
    sc += vec3(0.55, 0.70, 0.25) * 0.14 * hl_iso(pj / 0.8, pe * 38.0 / 0.8, 0.8) * inV;
    sc += HL_AMBER * lam * 0.5 * inV;
    float over = max(front, 1.0 - inS);
    col = mix(col, sc, inV * over);
    al = max(al, inV * over);
  }
  // the serpent's heads at the top, facing each other under the crescent
  float hd = min(length((p - vec2(-0.272, 0.546)) * vec2(1.0, 1.6)) - 0.009, length((p - vec2(-0.312, 0.554)) * vec2(1.0, 1.6)) - 0.009);
  float inH = hl_fill(hd, pe);
  col = mix(col, vec3(0.02, 0.06, 0.03) + vec3(0.3, 0.95, 0.55) * 0.5 * hl_line(hd, pe, 1.0), inH);
  al = max(al, inH);
  // the crescent
  vec2 cq = p - vec2(-0.292, 0.690);
  float cres = max(length(cq) - 0.044, -(length(cq - vec2(0.0, 0.019)) - 0.040));
  float inCr = hl_fill(cres, pe);
  col = mix(col, HL_SILV * 0.40, inCr);
  col += HL_SILV * 0.9 * hl_line(cres, pe, 1.2) + HL_SILV * 0.07 * exp(-max(cres, 0.0) / 0.025);
  al = max(al, inCr);
  return vec4(col, al);
}

// the lantern: a hexagonal iron lantern turning slowly on its ring, amber panes; inside, the vas
// hermeticum (a pear-shaped flask) in which a six-pointed star burns, and curled in the star's
// heart the homunculus. The inner drawing fades where it is smaller than the pixels; the macro
// (mode lantern) is this same drawing seen from about 20x closer.
// Returns the lantern (rgb, alpha) and its light in glowC. Lantern units q: 1 = 1.25 world.
vec4 hl_lantern(vec2 p, float pe, out vec3 glowC) {
  vec2 L = uLamp.xy;
  vec2 q = (p - L) / 1.25;
  float pq = pe / 1.25;
  float br = uLamp.z * (1.0 + 0.08 * uMac.y);
  vec3 col = vec3(0.0); float al = 0.0;
  // the light: a warm halo and slow rays leaking through the frame
  float r = length(p - L);
  glowC = HL_AMBER * br * (0.40 * exp(-r / 0.035) + 0.20 * exp(-r / 0.11) + 0.06 * exp(-r / 0.40)) * (1.0 - 0.75 * uMac.z);
  vec2 sq = q - vec2(0.0, -0.009);              // the flask's bulb centre
  float rs = length(sq);
  float sa = hl_atan(sq.y, sq.x);
  float ang = sa;
  float rays = hl_iso((ang + uMT * 0.04) / TAU * 16.0, pe / max(r, 1e-3) / TAU * 16.0, 1.3) * (0.55 + 0.45 * sin(ang * 5.0 + uMT * 0.35));
  glowC += HL_GOLD * rays * br * 0.28 * exp(-r / 0.32) * smoothstep(0.06, 0.11, r) * (1.0 - 0.6 * uMac.z);
  // ---- the body: amber hammered glass
  float body = sdBox(q - vec2(0.0, -0.004), vec2(0.032, 0.040));
  float inB = hl_fill(body, pq);
  float vis = smoothstep(2.5, 6.0, 0.0165 / pq);  // the flask and the star resolve (close, macro)
  float ham = vnoise(q * 380.0 + 7.0);
  vec3 g = vec3(0.50, 0.20, 0.045) * br * (0.30 + 0.70 * exp(-rs / 0.020)) * (0.80 + 0.40 * ham * vis) * (1.0 - 0.62 * vis);
  // behind the flask, a 12-fold mandala of rays and rings in the glass
  float mand = hl_iso(sa / TAU * 24.0 + 0.25, pq / max(rs, 1e-3) / TAU * 24.0, 0.9) * smoothstep(0.016, 0.020, rs) * exp(-rs / 0.022)
             + 0.6 * hl_iso(rs / 0.0042, pq / 0.0042, 0.8) * smoothstep(0.017, 0.021, rs) * exp(-rs / 0.016);
  g += HL_GOLD * 0.55 * br * mand * vis;
  // the flask: a round bulb and a neck, thin glass lines and a highlight
  float fl = smin(rs - 0.0165, sdTaper(sq, vec2(0.0, 0.010), vec2(0.0, 0.036), 0.0058, 0.0036), 0.006);
  g = mix(g, g * 0.75, hl_fill(fl, pq) * vis);
  g += vec3(1.3, 1.05, 0.70) * br * (hl_line(fl, pq, 1.4) + 0.4 * hl_line(fl + 0.0011, pq, 0.9)) * vis;
  g += vec3(1.3, 1.2, 1.0) * 0.5 * br * hl_line(abs(length(sq - vec2(0.0018, 0.0)) - 0.0136) - 0.0002, pq, 1.4) * smoothstep(0.0, -0.008, sq.x) * smoothstep(-0.012, 0.004, sq.y) * vis;
  // the star: two interlaced triangles, a deep fire inside, white-gold edges
  float rst = 0.0108 * (1.0 + 0.05 * uMac.y);
  float t1 = sdTriangle(sq, rst), t2 = sdTriangle(vec2(sq.x, -sq.y), rst);
  float st = min(t1, t2);
  vec3 sc = mix(vec3(2.4, 1.6, 0.8), mix(vec3(1.3, 0.62, 0.16), vec3(0.40, 0.15, 0.04), smoothstep(-0.0003, -0.0016, st)), vis);
  sc += vec3(0.9, 0.5, 0.15) * 0.5 * exp(-rs / 0.0035) * vis;
  g = mix(g, sc * br, hl_fill(st, pq));
  float ov = step(0.0, sin(sa * 3.0));
  g += vec3(2.4, 1.8, 0.95) * br * (hl_line(t1, pq, 1.3) * mix(1.0, 0.55, ov * vis) + hl_line(t2, pq, 1.3) * mix(0.55, 1.0, ov * vis));
  g += vec3(1.6, 1.1, 0.5) * 0.5 * br * (hl_line(t1 - 0.0010, pq, 0.9) + hl_line(t2 - 0.0010, pq, 0.9)) * vis;
  // the homunculus: a tiny luminous figure curled (fetal) in the star's heart
  {
    vec2 hq = hl_rot(sq - vec2(0.0004, 0.0005), -0.35) / 0.0058;
    float breath = 1.0 + 0.03 * uMac.w;
    float head = length(hq - vec2(-0.20, 0.42)) - 0.30 * breath;
    float back = sdTaper(hq, vec2(-0.05, 0.12), vec2(0.18, -0.42), 0.27, 0.22);
    float thigh = sdTaper(hq, vec2(0.12, -0.40), vec2(-0.30, -0.18), 0.17, 0.12);
    float shin = sdTaper(hq, vec2(-0.30, -0.18), vec2(0.00, -0.62), 0.11, 0.07);
    float hb = smin(smin(head, back, 0.10), smin(thigh, shin, 0.06), 0.08) * 0.0058;
    float hv = smoothstep(4.0, 9.0, 0.0058 / pq);
    g += vec3(1.0, 0.80, 0.45) * 0.30 * exp(-max(hb, 0.0) / 0.0009) * hv;
    g = mix(g, vec3(0.75, 0.55, 0.32) + vec3(0.9, 0.65, 0.35) * hl_iso(hb / 0.00026, pq / 0.00026, 0.8), hl_fill(hb, pq) * 0.92 * hv);
    g += vec3(2.6, 2.4, 2.2) * hl_line(hb, pq, 1.3) * hv + vec3(1.6, 1.3, 1.0) * 0.6 * hl_line(thigh * 0.0058, pq, 0.9) * step(0.0, -hb) * hv;
  }
  // sparks circling the flask on a tilted ring (behind the glass when behind)
  {
    vec2 eq = hl_rot(sq, -0.22) / vec2(0.023, 0.0055);
    float ph = hl_atan(eq.y, eq.x) - uMT * 0.55;
    float th = (floor(ph / 1.0471976 + 0.5)) * 1.0471976 + uMT * 0.55;
    vec2 sp = hl_rot(vec2(0.023 * cos(th), 0.0055 * sin(th)), 0.22);
    float dd = length(sq - sp) / pq;
    g += HL_GOLD * br * (1.4 * exp(-dd * dd / 4.0) + 0.15 * exp(-dd / 6.0)) * (0.45 + 0.55 * sin(th)) * vis;
  }
  // iron frame: the hexagon's front edges turning with the lantern, top and bottom rails
  float bars = min(abs(q.y + 0.044), abs(q.y - 0.036));
  int n3 = int(uN.y);
  for (int i = 0; i < n3; i++) {
    float th = float(i) * 1.0471976 - 1.0471976 + 0.5235988 + mod(uMac.x, 1.0471976);
    bars = min(bars, abs(q.x - 0.032 * sin(th)) + step(cos(th), 0.0));
  }
  bars = min(bars, abs(abs(q.x) - 0.032));
  float inBar = (1.0 - smoothstep(0.0020 - pq, 0.0020 + pq, bars)) * (1.0 - hl_fill(st + 0.0015, pq));
  g = mix(g, vec3(0.022, 0.012, 0.007) + HL_AMBER * 0.30 * br * (0.6 + 0.4 * ham) * (1.0 - 0.6 * vis), inBar * (1.0 - 0.45 * uMac.z));
  g += HL_GOLD * 0.35 * br * hl_line(bars - 0.0020, pq, 0.8) * vis;
  col = mix(col, g, inB); al = inB;
  // the pointed roof, the base and a finial
  vec2 rq = q - vec2(0.0, 0.050);
  float roof = max(sdTriangle(rq * vec2(1.0, 1.25) - vec2(0.0, 0.004), 0.033), -(rq.y + 0.012));
  float base = sdBox(q - vec2(0.0, -0.050), vec2(0.038, 0.0055));
  float fin = sdCapsule(q, vec2(0.0, 0.080), vec2(0.0, 0.066), 0.0018);
  float iron = min(min(roof, base), fin);
  float inI = hl_fill(iron, pq);
  col = mix(col, vec3(0.03, 0.018, 0.010) + HL_AMBER * 0.22 * br * smoothstep(0.02, -0.03, q.y) + HL_GOLD * 0.10 * br * hl_iso(q.y / 0.004, pq / 0.004, 0.8), inI);
  col += HL_GOLD * 0.6 * br * hl_line(iron, pq, 1.2);
  al = max(al, inI);
  // the ring to the hand
  float ring = abs(length(q - vec2(0.0, 0.082)) - 0.012) - 0.0020;
  float inR = hl_fill(ring, pq) * step(0.068, q.y);
  col = mix(col, vec3(0.04, 0.025, 0.012) + HL_GOLD * 0.5 * br, inR);
  al = max(al, inR);
  return vec4(col, al);
}

// the whole Hermit over the background bg
vec3 hl_hermit(vec3 bg, vec2 p, float pe) {
  vec3 col = bg;
  vec2 L = uLamp.xy;
  float lam = uLamp.z * exp(-length(p - L) / 0.24);
  float sleeve, hood;
  float dr = hl_robeSDF(p, sleeve, hood);
  vec3 lineC = mix(HL_ULTRA, vec3(1.15, 0.66, 0.26), sat(lam * 1.3));
  // aura: contour lines of the figure radiating into the night (Alex Grey), fading outward
  if (dr > 0.0 && dr < 0.16) {
    float au = hl_iso(dr / 0.017, pe / 0.017, 1.0) * exp(-dr / 0.045) * smoothstep(0.004, 0.012, dr);
    col += mix(HL_VIO * 0.30, HL_AMBER * 0.55, sat(lam * 1.6)) * au;
  }
  float inR = hl_fill(dr, pe);
  if (dr < 0.004) {
    // ---- the cloak: dark ultramarine, drapery folds falling from the shoulders, contour lines
    vec3 rc = vec3(0.003, 0.006, 0.026);
    float hw = mix(0.16, 0.41, sat((0.10 - p.y) / 0.95));
    float fx = p.x / hw;
    float fold = fx * 9.0 + 0.40 * sin(p.y * 5.0 + fx * 2.0) + 0.18 * sin(p.y * 13.0 - fx * 4.0);
    float body = smoothstep(0.13, -0.02, p.y) * step(0.0, hood);
    float shade = 0.5 + 0.5 * cos(fold * 3.14159 + 0.6);
    rc *= 0.5 + 1.0 * shade;
    float fl = hl_iso(fold, pe / hw * 9.0 * 1.4, 1.0) * body;
    float iso = hl_iso(-dr / 0.0090, pe / 0.0090, 1.0) * exp(dr * 26.0);
    // hood folds: rings around the face opening
    float hf = hl_iso(-hood / 0.0075, pe / 0.0075, 1.0) * step(hood, 0.0) * exp(hood * 40.0);
    vec2 hq = p - vec2(0.0, 0.215);
    float ha = hl_atan(hq.x, hq.y);
    float hr = length(hq);
    float hfold = hl_iso(ha / 0.075 + 0.6 * sin(hr * 30.0), pe / max(hr, 0.05) / 0.075 * 1.4, 0.9) * step(hood, 0.0) * smoothstep(0.08, 0.13, hr);
    hf += 0.6 * hfold * (1.0 - exp(hood * 40.0));
    rc += lineC * (0.40 * iso + (0.18 + 0.20 * shade) * fl + 0.36 * hf) * (0.55 + 1.3 * lam);
    // the front opening: the red inner robe between ochre lining edges
    float ow = mix(0.004, 0.108, sat((0.19 - p.y) / 1.06));
    float dOpen = abs(p.x - 0.008 * sin(p.y * 5.0)) - ow;
    float notSl = 1.0 - step(sleeve, 0.0);
    float inO = hl_fill(dOpen, pe) * step(p.y, 0.19) * notSl;
    vec3 inner = vec3(0.030, 0.006, 0.004) + vec3(0.55, 0.10, 0.04) * 0.30 * hl_iso(p.x / 0.013 + 0.2 * sin(p.y * 9.0), pe / 0.013, 0.9) * (0.6 + 1.2 * lam);
    rc = mix(rc, inner, inO);
    rc += HL_OCHRE * (0.55 + 1.2 * lam) * hl_line(dOpen, pe, 1.6) * step(p.y, 0.19) * notSl;
    rc += HL_OCHRE * 0.25 * (0.55 + lam) * hl_line(dOpen - 0.006, pe, 1.0) * step(p.y, 0.19) * notSl * step(0.0, dOpen);
    // the hood's ochre lining around the face, and the face's darkness
    float face = sdEllipse(p - vec2(0.0, 0.300), vec2(0.064, 0.086));
    rc += HL_OCHRE * (0.30 + 0.8 * lam) * hl_line(face - 0.005, pe, 1.2) + HL_OCHRE * 0.06 * (0.5 + lam) * hl_fill(face - 0.010, pe) * (1.0 - hl_fill(face, pe));
    if (face < 0.004) {
      vec3 fc = vec3(0.0020, 0.0014, 0.0025);
      // the face in the hood's shadow, drawn as the contour lines of its relief (a height field:
      // a dome, the brow, the nose, the cheekbones, the eye sockets), lit by the lantern on the right
      vec2 fq = (p - vec2(0.0, 0.300)) / vec2(0.064, 0.086);
      float dome = sqrt(max(1.0 - dot(fq, fq), 0.0));
      float nose = 0.30 * exp(-fq.x * fq.x / 0.010) * smoothstep(-0.55, -0.15, fq.y) * (1.0 - smoothstep(0.05, 0.30, fq.y));
      float by = (fq.y - 0.36) * 10.0, ax = abs(fq.x);
      float brow = 0.10 * exp(-by * by) * (1.0 - smoothstep(0.55, 0.85, ax));
      vec2 ch = vec2(ax - 0.48, fq.y + 0.20), so = vec2(ax - 0.45, (fq.y - 0.20) * 1.265);
      float cheek = 0.08 * exp(-dot(ch, ch) * 25.0);
      float sock = -0.16 * exp(-dot(so, so) * 33.3);
      float hgt = 0.7 * dome + nose + brow + cheek + sock;
      float relief = hl_iso(hgt * 11.0, max(fwidth(hgt * 11.0), pe / 0.064 * 6.0), 0.9);
      float light = sat(0.30 + 0.8 * fq.x + 0.6 * nose) * (0.45 + 1.6 * lam);
      fc += vec3(0.95, 0.52, 0.18) * 0.50 * relief * light * smoothstep(1.0, 0.75, length(fq));
      fc += vec3(0.95, 0.52, 0.18) * 0.07 * light * hgt * hgt;
      vec2 eq = vec2(abs(p.x) - 0.029, p.y - 0.318) / 0.021;
      fc += hl_eye(eq, pe / 0.021, uEyes);
      rc = mix(rc, fc, hl_fill(face, pe));
    }
    // the hem: a gold border with a row of small marks (sun, moon, mercury: circles and crescents)
    float hy = p.y + 0.865 - 0.012 * sin(p.x * 11.0 + 0.6);
    float hb1 = hl_line(hy - 0.030, pe, 1.0) + hl_line(hy - 0.006, pe, 1.0);
    vec2 mq = vec2((fract(p.x / 0.026 + 0.5) - 0.5) * 0.026, hy - 0.018);
    float mk = abs(length(mq) - 0.0055) - 0.0001;
    rc += HL_GOLD * (0.30 * hb1 + 0.22 * hl_line(mk, pe, 0.9) * step(hy, 0.03)) * (0.6 + 1.2 * lam) * step(-0.01, hy) * (1.0 - inO);
    // sleeve edges
    rc += lineC * 0.55 * hl_line(sleeve, pe, 1.1);
    col = mix(col, rc, inR);
  }
  // the silhouette: moonlight from the left, the lamp's warmth on the right
  col += mix(HL_SILV * 0.50, HL_AMBER * 1.3, sat(lam * 2.0)) * hl_line(dr, pe, 1.5);
  // ---- the staff (in front of the cloak, under the left hand)
  vec4 st = hl_staff(p, pe, lam);
  col = mix(col, st.rgb, st.a);
  // ---- hands
  vec2 hpR = p - uHand, hpL = p - vec2(-0.274, 0.014);
  float hR = sdBox(hpR, vec2(0.0115, 0.0085)) - 0.006;
  float hL = sdBox(hpL, vec2(0.0115, 0.0085)) - 0.006;
  float hd = min(hR, hL);
  vec2 hk = hR < hL ? hpR : hpL;
  float knuck = hl_iso(hk.y / 0.0060 + 0.5, pe / 0.0060, 0.8) * step(abs(hk.x), 0.012) * step(abs(hk.y), 0.010);
  vec3 skin = vec3(0.030, 0.016, 0.010) + vec3(0.30, 0.16, 0.07) * knuck * (0.3 + lam) + HL_AMBER * 0.35 * lam * smoothstep(-0.01, 0.015, hk.x);
  col = mix(col, skin, hl_fill(hd, pe));
  col += mix(HL_SILV * 0.30, HL_AMBER * 0.9, sat(lam * 2.0)) * hl_line(hd, pe, 1.0);
  // ---- the beard of light
  float bcov;
  vec3 bc = hl_beard(p, pe, lam, bcov);
  float inBeard = step(p.y, 0.262) * step(-0.34, p.y) * step(abs(p.x), 0.21);
  col = mix(col, mix(col, col * 0.3, bcov * 0.5) + bc * 0.75, inBeard);
  // ---- the lantern
  vec3 glowC;
  vec4 ln = hl_lantern(p, pe, glowC);
  col *= 1.0 - 0.80 * uMac.z;
  col = mix(col, ln.rgb, ln.a);
  col += glowC;
  return col;
}

// ---------------------------------------------------------------- the bolt (strike mode)
float hl_boltDist(vec2 p, out float dBr) {
  float d = 1e3;
  for (int i = 0; i < 11; i++) d = min(d, sdSegment(p, uBolt[i], uBolt[i + 1]));
  dBr = 1e3;
  for (int i = 0; i < 3; i++) { dBr = min(dBr, sdSegment(p, uBr[i], uBr[i + 1])); dBr = min(dBr, sdSegment(p, uBr[4 + i], uBr[5 + i])); }
  return d;
}

// fire, debris and two falling figures (strike mode, after the strike)
vec3 hl_aftermath(vec3 col, vec2 w, float pe) {
  float ts = uFigs;
  if (ts <= 0.0) return col;
  vec2 top = HL_TB + vec2(0.0, HL_TH - 0.012);
  float rise = smoothstep(0.0, 0.35, ts);
  // fire bursting from the broken top
  vec4 f1 = hl_flame((w - top) / 0.050, 1.2 + 1.6 * rise, 1.0);
  col = mix(col, f1.rgb, f1.a * rise);
  col += vec3(1.0, 0.35, 0.06) * 0.22 * rise * exp(-length((w - top - vec2(0.0, 0.04)) * vec2(1.0, 0.7)) / 0.06);
  // fire from the window, licking up the face of the tower
  vec4 f2 = hl_flame((w - (HL_TB + vec2(0.0, HL_TH * 0.46 - 0.012))) / 0.022, 1.6 + 0.8 * rise, 4.0);
  col = mix(col, f2.rgb, f2.a * rise * 0.9);
  // debris: four pairs of blocks flung out on mirrored ballistic paths (one evaluation per pair)
  vec2 mw = vec2(HL_TB.x + abs(w.x - HL_TB.x), w.y);
  float side = sign(w.x - HL_TB.x);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 h = vec2(fract(sin(fi * 78.233 + 1.0) * 43758.5453), fract(sin(fi * 12.989 + 3.0) * 24634.6345));
    float hs = mix(h.x, h.y, step(side, 0.0));
    vec2 v0 = vec2(0.05 + 0.20 * hs, 0.08 + 0.24 * h.y);
    vec2 c = top + vec2(0.02 + 0.03 * h.x, 0.02) + v0 * ts + vec2(0.0, -0.22) * ts * ts;
    vec2 bq = hl_rot(mw - c, -(h.y - 0.5 + 0.3 * side) * 10.0 * ts);
    float bd = sdBox(bq, vec2(0.0050 + 0.0045 * hs, 0.0032 + 0.0025 * h.x));
    col = mix(col, vec3(0.012, 0.010, 0.025) + vec3(1.6, 0.6, 0.1) * 0.5 * smoothstep(0.0, -0.005, bq.y), hl_fill(bd, pe));
    col += vec3(1.3, 0.55, 0.12) * 0.55 * hl_line(bd, pe, 1.0);
  }
  // two figures fall from the tower, head first, arms flung out (mirror images: one sdBody)
  {
    vec2 c = top + vec2(HL_TW + 0.018 + 0.07 * ts, 0.005 + 0.05 * ts - 0.32 * ts * ts);
    vec2 bq = hl_rot(mw - c, -(2.2 + 1.4 * ts)) / 0.026;
    vec2 bx = vec2(abs(bq.x), bq.y);
    float bd = length(bq - vec2(0.0, 0.80)) - 0.17;
    bd = min(bd, sdTaper(bq, vec2(0.0, 0.55), vec2(0.0, -0.05), 0.15, 0.12));
    bd = min(bd, sdTaper(bx, vec2(0.10, 0.45), vec2(0.55, 0.95), 0.07, 0.045));
    bd = min(bd, sdTaper(bx, vec2(0.08, -0.05), vec2(0.42, -0.80), 0.09, 0.05));
    bd *= 0.026;
    col = mix(col, vec3(0.10, 0.030, 0.012) + vec3(0.5, 0.18, 0.04) * smoothstep(0.4, -0.8, bq.y), hl_fill(bd, pe));
    col += vec3(1.8, 0.75, 0.18) * hl_line(bd, pe, 1.1) + vec3(0.9, 0.35, 0.08) * 0.20 * exp(-max(bd, 0.0) / 0.006);
  }
  return col;
}

void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  vec3 col;
  {
    float Z = uCam.z;
    vec2 w = uCam.xy + hl_rot(uv / Z, uCam.w);
    float pe = px() / Z;
    // the sky lies far behind: it moves and zooms at a fraction of the camera
    float Zs = 1.0 + (Z - 1.0) * 0.18;
    vec2 s = uCam.xy * 0.22 + hl_rot(uv / Zs, uCam.w);
    float ps = px() / Zs;
    col = hl_sky(s, ps);
    if (uStorm.x > 0.001) {
      vec2 boltS = uCam.xy * 0.22 + (uBolt[11] - uCam.xy) * Z / Zs;
      col = hl_storm(col, s, boltS);
    }
    if (uSpk > 0.0) col += hl_sparks(s, ps, uSpk);
    // the lantern's light (the lattice shows only inside it)
    float lamR = 0.16 + 0.14 * uLamp.w;
    float lam = uLamp.z * exp(-length(w - uLamp.xy) / lamR) * uLat * uHer.x;
    float lat = hl_lattice(w, uLamp.xy, pe);
    // the mountain and its tower
    vec4 mt = hl_mount(w, pe, lam, lat);
    col = mix(col, mt.rgb, mt.a);
    if (uTowerOn > 0.5) {
      vec4 tw = hl_tower(w, pe);
      col = mix(col, tw.rgb, tw.a);
    }
    // the bolt (strike): a white-violet core and a violet glow, then debris, fire, figures
    if (uMode > 3.5) {
      if (uBoltE.x > 0.0) {
        float dBr;
        float db = hl_boltDist(w, dBr);
        float a = uBoltE.x;
        float core = (1.0 - smoothstep(0.50 * pe, 1.25 * pe, db)) * uBoltE.y;
        float coreB = (1.0 - smoothstep(0.30 * pe, 0.95 * pe, dBr)) * uBoltE.y;
        vec3 bc = vec3(6.0, 5.6, 8.0) * (core + 0.6 * coreB);
        bc += vec3(0.50, 0.32, 1.25) * (exp(-db / (pe * 3.5)) * 1.1 + exp(-db / 0.022) * 0.30 + exp(-dBr / (pe * 2.5)) * 0.55);
        // the impact: a white-hot star where the bolt meets the dome
        float di = length(w - uBolt[11]);
        bc += vec3(5.0, 4.6, 6.0) * exp(-di / (0.008 + 4.0 * pe)) * uBoltE.y + vec3(0.8, 0.5, 1.5) * exp(-di / 0.035);
        col += bc * a;
      }
      col = hl_aftermath(col, w, pe);
    }
    if (uHer.x > 0.5) {
      // a sea of mist at the mountain's foot, drifting slowly
      float mz = vnoise(vec2(w.x * 1.6 - uMT * 0.04, w.y * 5.0)) * 0.75 + 0.25 * (0.5 + 0.5 * sin(w.x * 9.0 + uMT * 0.3 + w.y * 20.0));
      float my = w.y + 0.47 + 0.07 * (mz - 0.5) + 0.03 * sin(w.x * 1.7 + 0.5);
      float mist = smoothstep(0.16, -0.02, my) * (0.75 + 0.45 * mz) * (0.6 + 0.4 * smoothstep(-0.45, -0.02, my));
      col = mix(col, vec3(0.030, 0.022, 0.070) + vec3(0.010, 0.006, 0.020) * mz, sat(mist)) + vec3(0.016, 0.010, 0.036) * mist * smoothstep(0.10, 0.0, abs(my - 0.04)) + HL_AMBER * 0.10 * lam * mist;
      vec2 wh = w - vec2(0.0, uHer.y);
      // the ledge in the foreground
      float ledge = wh.y - (-0.862 + 0.022 * sin(wh.x * 3.3 + 0.4) + 0.006 * sin(wh.x * 23.0 + 1.3) + 0.004 * sin(wh.x * 51.0) - 0.10 * smoothstep(0.6, 1.8, abs(wh.x)));
      if (ledge < 0.01) {
        float inL = hl_fill(ledge, pe);
        vec3 lc = vec3(0.003, 0.003, 0.009) + vec3(0.016, 0.016, 0.040) * hl_iso(ledge / 0.016, pe / 0.016, 1.0) * exp(ledge * 9.0);
        lc += HL_AMBER * 0.40 * lam * lat;
        col = mix(col, lc, inL);
      }
      col += mix(HL_SILV * 0.30, HL_AMBER, sat(lam * 2.0)) * hl_line(ledge, pe, 1.3);
      col = hl_hermit(col, wh, pe);
    }
  }
  // dither: the night gradients never band
  col += (hash21(gl_FragCoord.xy + fract(uMT) * 91.0) - 0.5) * (1.0 / 255.0);
  fragColor = vec4(max(col, 0.0), 1.0);
}
`;


  // ------------------------------------------------------------------ shot hermit.lantern
  // HERMIT.LANTERN (IX The Hermit, XVI The Tower): night on the Holy Mountain, one world in 2D layers
  // (sky and stars, the scintillae falling, the storm, the seven terraces and the athanor tower, a sea
  // of mist, the ledge, the Hermit with staff, serpent and lantern, the bolt and its aftermath). A mode
  // picks the camera; the layers a mode cannot see are switched off by uniforms.
  // Natural length: 4 bars (16 beats, the breakdown's long take). No 30 s window: cue lists only.
  // Stretch: every mode holds indefinitely and nothing loops. Anchored to the cue start (in beats,
  //   after offsetBeats): the lift (liftAt), the eyes (eyesAt), the strike (strikeAt). Stretched over
  //   the cue (u = 0..1 across it): the lantern macro's 6 % push, the close's 4 % push, the tower's
  //   tilt (upper terraces -> the tower) and the storm ramp storm[0] -> storm[1]. After a strike the
  //   crown keeps rising out of frame, the figures and the debris fall out of it, the fires burn on.
  //   Ambient motion (sparks, beard sway, lantern swing and turn, flames, clouds, twinkle) runs on the
  //   ambient clock K.M (absolute time at speed 1, seed 0), so consecutive wide cues join without a
  //   seam: 64-65 (under the eyecatch) and 65-68 are one long take.
  // Modes (params.mode):
  //   wide     the frontal tableau (camera identity): the Hermit centred on his ledge above the mist,
  //            the terraces and the tower behind his hood; the lantern held low until liftAt; inside
  //            the lantern's light the rock shows its lattice (a perspective corridor on the lamp).
  //   lantern  ~27x on the lantern: through the hammered amber glass the pear-shaped flask (vas
  //            hermeticum), the six-pointed star burning in it, the homunculus curled in the star's
  //            heart, a 12-fold mandala, six sparks circling; the lantern turns slowly (the orbit:
  //            its front bars slide past), and the star swells on every sung word in the cue.
  //   close    hood and beard fill the frame (3.2x, 4 % push); the face in the hood's shadow is the
  //            contour lines of its relief, lit by the lantern in frame on the right; the eyes open
  //            calmly at eyesAt (silver irises, a soft glow, never more than 3/4 open, no snap).
  //   tower    a tilt up the terraces to the athanor on the summit (3x); the storm gathers (storm),
  //            lit from inside by two slow glows; the window pulses on the kicks (the heartbeat).
  //   strike   XVI: the tower big, frontal, from below (5x). At strikeAt one bolt from the top of the
  //            frame to the finial (a 12-point polyline and 2 branches, JS-built, seeded): full for 3
  //            frames, then a 0.25 s decay, no re-strike, lighting the clouds on the same envelope.
  //            The crown (parapet, dome, finial) is blown off and tumbles up, fire bursts from the
  //            broken top and the window, three pairs of blocks fly, two figures fall head first.
  // Params (range (default): what it looks like):
  //   mode        wide | lantern | close | tower | strike (wide)
  //   liftAt      beats (none)       the lantern rises from the hip to above the shoulder in 1.5
  //                                  beats, a quarter beat early so it is moving on the word
  //   lift        0..1 (0; 1 in lantern and close)  the lantern's height before any liftAt
  //   eyesAt      beats (none: shut) the eyes open over 0.75 s
  //   strikeAt    -64..256 beats (0; strike only)   the bolt (a negative value starts after it)
  //   storm       [s0, s1] or s, 0..1 (tower [0.2, 1], strike 1, else 0)  the storm across the cue
  //   strikeX, strikeY  screen units (0, 0.40 = MATCH_SOL_TOWER)  where the finial sits in strike
  //   sparks      0..3 (1)           density of the falling sparks (0 = none)
  //   zoom        0.25..4 (1)        multiplies the mode's zoom
  //   pan         [x, y] or x (0)    camera offset in world units (1 = half the wide frame height)
  //   roll        -30..30 (0)        camera roll, degrees
  //   speed       0..16 (1)          ambient motion rate;  seed (0): its phase
  //   offsetBeats 0..256 (0)         moves liftAt, eyesAt and strikeAt that many beats earlier
  //   grade, frame                   the engine's knobs (the 65-68 rise to the lantern is a frame move)
  // Couplings and match cuts:
  //   - MO.hermitLantern(t) -> { x, y, r } (frame fractions, y from the top; frame knob included) or
  //     null: the eyecatch's iris-in (64.4-65.1) centres on it.
  //   - MO.MATCH_SOL_TOWER (screen (0, 0.40) = frame (0.5, 0.30)): orrery.thieves' ignited Sol on its
  //     last frame (79.0) and this strike's bolt core and finial (79.1) share the point.
  //   - the strike starts on the score's thunder, flash and shake (beat 316): the post flash and the
  //     bolt are one luminance event; keep the RUBEDO insert at least 0.8 s later (it is 0.88 s).
  // Safety (spec 7.3-7.5): the bolt as above, in reduced mode at 30 % with no core (the clouds follow);
  //   the window's heartbeat pulse is +60 % of a small area (+20 % reduced); the lift, the eyes and the
  //   word swell are small and slow; the storm's inner glows drift at 0.2 Hz; no pattern travels fast
  //   enough to strobe (sparks and stars move < 1 px per frame at 1080p).
  // Cost: one program for every mode, and on SwiftShader the whole program counts, branch taken or
  //   not (measured: removing code from an untaken uniform branch made the other modes faster), so
  //   the modes share one world instead of separate drawings (the macro is the lantern itself, 27x).
  //   CPU time per 640x360 frame, interleaved with albedo.a2 in one browser: wide, lantern, close and
  //   tower 1.19-1.26x (about 113-120 ms at its nominal 95 ms); strike 1.24x, its 10 bolt frames
  //   1.39x (~132 ms). 1920x1080: 1.24-1.39x (about 2.7-3.0 s). The beard tests the 3 nearest of its
  //   28 threads; the two falling figures and the debris pairs are mirror images (one evaluation).
  const MODES = { wide: 0, lantern: 1, close: 2, tower: 3, strike: 4 };
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  // deterministic PRNG for the bolt's zigzag
  const rng = (seed) => { let s = (Math.floor(seed * 1000) ^ 0x9e3779b9) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

  MO.shot('hermit.lantern', (cue) => {
    const K = cueClock(cue, 0, 16, 0, 0);
    const P = K.P;
    const mode = MODES[P.mode] ?? 0;
    const zoomK = K.p('zoom', 1, 0.25, 4);
    const rollK = K.p('roll', 0, -30, 30) * Math.PI / 180;
    const pan = Array.isArray(P.pan) ? [num(P.pan[0], 0), num(P.pan[1], 0)] : [num(P.pan, 0), 0];
    const sparks = K.p('sparks', 1, 0, 3);
    const lift0 = K.p('lift', mode === 1 || mode === 2 ? 1 : 0, 0, 1);
    const T = (b) => K.S(b * BEAT);                       // cue-relative beats -> seconds
    const liftAt = typeof P.liftAt === 'number' ? T(P.liftAt) : null;
    const eyesAt = typeof P.eyesAt === 'number' ? T(P.eyesAt) : null;
    const strikeAt = mode === 4 ? T(K.p('strikeAt', 0, -64, 256)) : null;
    let storm = mode === 3 ? [0.2, 1.0] : mode === 4 ? [1.0, 1.0] : [0, 0];
    if (Array.isArray(P.storm)) storm = [num(P.storm[0], storm[0]), num(P.storm[1], num(P.storm[0], storm[1]))];
    else if (typeof P.storm === 'number') storm = [P.storm, P.storm];
    storm = storm.map((x) => MO.clamp(x, 0, 1));
    const strikeP = [K.p('strikeX', MATCH_SOL_TOWER[0], -1.7, 1.7), K.p('strikeY', MATCH_SOL_TOWER[1], -0.9, 0.95)];
    const dur = cue.to - cue.from;
    // words sung in the cue (the macro's star swells on each)
    const words = MO.words('sung').filter((w) => w.t >= cue.from - 1e-6 && w.t < cue.to);

    // ---- camera per mode (world camera: centre, zoom, roll)
    const camAt = (u, L) => {
      let C, Z;
      if (mode === 1) { C = [L[0], L[1] - 0.0112]; Z = 27 * (1 + 0.06 * MO.smooth(u)); }
      else if (mode === 2) { C = [0.03, 0.262]; Z = 3.2 * (1 + 0.04 * MO.smooth(u)); }
      else if (mode === 3) { C = [0.0, MO.mix(0.40, 0.745, MO.easeInOut(u))]; Z = 3.0 * (1 + 0.03 * u); }
      else if (mode === 4) { Z = 5.0; C = null; }
      else { C = [0, 0]; Z = 1; }
      Z *= zoomK;
      if (mode === 4) {
        // the strike point (the finial's orb) lands on the match point: w = C + R(roll) uv / Z
        const c = Math.cos(rollK), s = Math.sin(rollK);
        const sx = strikeP[0] / Z, sy = strikeP[1] / Z;
        C = [DOME_TOP[0] - (c * sx - s * sy), DOME_TOP[1] - (s * sx + c * sy)];
      }
      return [C[0] + pan[0], C[1] + pan[1], Z, rollK];
    };
    const toWorld = (cam, x, y) => { const c = Math.cos(cam[3]), s = Math.sin(cam[3]); return [cam[0] + (c * x - s * y) / cam[2], cam[1] + (s * x + c * y) / cam[2]]; };
    const toScreen = (cam, wx, wy) => { const c = Math.cos(cam[3]), s = Math.sin(cam[3]); const dx = (wx - cam[0]) * cam[2], dy = (wy - cam[1]) * cam[2]; return [c * dx + s * dy, -s * dx + c * dy]; };

    // ---- the bolt: a 12-point polyline from the top of the frame to the dome, two branches
    const cam0 = camAt(0, LAMP_HIGH);
    const R = rng(K.seed + cue.index * 0.37 + 1.7);
    const A = toWorld(cam0, strikeP[0] + 0.55, 1.10), D = DOME_TOP;
    const bolt = [];
    const dx = D[0] - A[0], dy = D[1] - A[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    for (let i = 0; i < 12; i++) {
      const f = i / 11, j = i === 0 || i === 11 ? 0 : (R() - 0.5) * 2 * 0.07 * len * Math.pow(Math.sin(Math.PI * f), 0.6);
      bolt.push(A[0] + dx * f + nx * j, A[1] + dy * f + ny * j);
    }
    const branch = (i0, dir) => {
      const out = [bolt[2 * i0], bolt[2 * i0 + 1]];
      let x = out[0], y = out[1];
      for (let k = 1; k < 4; k++) {
        x += dir * (0.06 + 0.04 * R()) * len * 0.5 + (R() - 0.5) * 0.03 * len;
        y -= (0.06 + 0.03 * R()) * len;
        out.push(x, y);
      }
      return out;
    };
    const br = [...branch(3, -1), ...branch(6, 1)];

    // ---- the lantern: lifted on liftAt (it starts a quarter beat early, so the move is under way
    // on the word), swinging a little; its screen position is published for the overlay
    const lift = (t) => (liftAt === null ? lift0 : lift0 + (1 - lift0) * MO.easeInOut(MO.remap(t, liftAt - 0.25 * BEAT, liftAt + 1.25 * BEAT)));
    const lampAt = (t, mt) => {
      const l = lift(t);
      const arc = Math.sin(Math.PI * l) * 0.035;
      return [MO.mix(LAMP_LOW[0], LAMP_HIGH[0], l) + arc + 0.003 * Math.sin(mt * 1.3), MO.mix(LAMP_LOW[1], LAMP_HIGH[1], l) + 0.002 * Math.sin(mt * 1.9 + 1.0)];
    };

    const uniforms = (t) => {
      const mt = K.M(t);
      const u = MO.clamp((t - cue.from) / Math.max(dur, 1e-3));
      const l = lift(t);
      const L = lampAt(t, mt);
      const cam = camAt(u, L);
      const flick = 0.95 + 0.03 * Math.sin(mt * 7.3) * Math.sin(mt * 3.1 + 1.0) + 0.02 * Math.sin(mt * 5.7);
      const bright = (0.80 + 0.30 * l) * flick;
      const eyes = eyesAt === null ? 0 : MO.easeInOut(MO.remap(t, eyesAt, eyesAt + 0.75));
      const st = MO.mix(storm[0], storm[1], MO.smooth(u));
      const kick = MO.env('kick', t, 0.16);
      const win = mode >= 3 ? 1.0 + (MO.reduced ? 0.2 : 0.6) * kick : 0.9;
      // the strike: 3 frames full, then a 0.25 s decay; no re-strike
      let boltA = 0, ts = -1;
      if (strikeAt !== null) {
        ts = t - strikeAt;
        boltA = ts < 0 ? 0 : ts < 0.1 ? 1 : 1 - MO.smooth((ts - 0.1) / 0.25);
        if (MO.reduced) boltA *= 0.3;
      }
      const struck = ts >= 0 ? 1 : 0;
      const tsc = Math.max(ts, 0);
      // the crown: a fast kick that eases into a steady climb (it leaves the frame on a long cue)
      const crown = struck ? [-0.050 * tsc, 0.07 * tsc + 0.10 * (1 - Math.exp(-3 * tsc)), 1.5 * tsc, 1] : [0, 0, 0, 0];
      let wp = 0;
      for (const w of words) wp += t >= w.t ? Math.exp(-(t - w.t) / 0.35) : 0;
      return {
        uMode: mode, uCam: cam, uMT: mt,
        uLamp: [L[0], L[1], bright, l], uHand: [L[0] - 0.002, L[1] + 0.088 * 1.25 - 0.01],
        uEyes: eyes, uStorm: [st, 0.6 + 0.4 * st, 0.02 * mt], uWin: win, uSpk: sparks,
        uBoltE: [boltA, MO.reduced ? 0 : 1, ts, 1], uBolt: bolt, uBr: br,
        uCrown: crown, uFigs: struck ? tsc : -1,
        uMac: [0.12 * mt, Math.min(1, wp), mode === 1 ? 1 : 0, Math.sin(mt * 1.1)],
        uLat: mode === 0 ? 1 : mode === 2 ? 0.2 : 0.3,
        uHer: [mode <= 2 ? 1 : 0, 0], uTowerOn: mode === 2 || mode === 1 ? 0 : 1, uN: [6, 3, 0, 0],
      };
    };
    const scene = { id: 'hermit.lantern#' + cue.index, fs: FS, uniforms, bloom: 0.55, bloomThreshold: 0.8, vignette: 0.45, hermit: true };
    // the lantern's screen position for the overlay: { x, y } frame fractions (x from the left, y from
    // the top), r its glow radius in frame heights; the engine's frame knob is taken into account
    scene.lanternAt = (t) => {
      if (mode >= 3) return null;
      const mt = K.M(t), u = MO.clamp((t - cue.from) / Math.max(dur, 1e-3));
      const L = lampAt(t, mt), cam = camAt(u, L);
      const [sx, sy] = toScreen(cam, L[0], L[1]);
      let fx = 0.5 + sx / (2 * 16 / 9), fy = 0.5 + sy / 2;       // 0..1, y up
      const f = scene.frame ? MO.frameAt(scene, t, 16 / 9) : null;
      if (f) {
        // invert su = c + l (uv - 0.5); l is column-major [l0 l2; l1 l3]
        const [a, b, c2, d] = f.l, det = a * d - c2 * b, ex = fx - f.c[0], ey = fy - f.c[1];
        fx = 0.5 + (d * ex - c2 * ey) / det; fy = 0.5 + (-b * ex + a * ey) / det;
      }
      return { x: fx, y: 1 - fy, r: 0.035 * cam[2] * (f ? f.zoom : 1) };
    };
    MO.scene(scene);
  });
  // the lantern's screen position at t, or null when no hermit.lantern cue shows it:
  // { x, y } in frame fractions (x from the left, y from the top), r its glow radius (frame heights)
  MO.hermitLantern = (t) => { const sc = MO.sceneAt(t); return sc && sc.hermit && sc.lanternAt ? sc.lanternAt(t) : null; };
})();
