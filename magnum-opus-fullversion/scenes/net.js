// NET OF BEING — XVII The Star, XXI The World. Owner: net agent. One shot factory, net.being
// (spec 5.3): Alex Grey's Net of Being made into a eurodance crowd with its arms up. An endless
// lattice of luminous figures, each a simplified Sacred Mirrors body (bone-white outline,
// topographic contour lines inside, a spine of light, a bright heart point, a flame aura of two
// contour lines with a flame tongue over the crown) whose head is an open eye (an almond with a
// fire iris); every crown is tied to its neighbours by threads of light, so the whole space is one
// net. Depth fog runs from the ground colour into the palette's haze; the far field dissolves
// into small silhouettes, eye points and a glow at the vanishing point (the One).
//
// net.being (new in the full version; no 30 s window)
// Geometry: layered planes, no raymarch. Four depth slots (rows of the crowd, or slices of the
// lattice in space) front to back with early exit; each slot evaluates one figure per pixel (the
// nearest node), after a box test; the far slots and the rows behind them are cheap silhouettes.
// The crowd adds analytic planes: the crown plane (threads along each row and zigzagging crown to
// crown to the next row), the floor lattice with pools of light under the feet, and above the
// horizon a vault where the net goes on overhead (threads and star-eyes). Rows are shifted by
// golden-ratio steps, so no column lines up into wedges towards the vanishing point.
// Modes (params.mode):
//   crowd   rows on the lattice floor, camera above the crowns dollying slowly through them
//           (0.35 rows a beat); the horizon (vanishing point) at y 0.12 = 44 % from the top, the
//           crowd in the lower half, the vault above (spec 6.1: the focal point stays upper-middle)
//   reveal  the first frame is one luminous figure filling the frame (a 2D zoom of 4.5x on its chest
//           plus a 2.2-row dolly: about 8x in all), every other figure dark; the camera pulls back
//           (ease-out, the cue's first 4 beats) while the light spreads from that figure through the
//           whole crowd (fully lit by beat 2.2, the 'whole'), ending on the crowd's framing
//   fly     forward travel (0.5 slices a beat) through the lattice in space: three live slices of
//           figures on a grid, the nearest dissolving before it reaches the lens, threads crown to
//           crown across and up every body's channel, a layer of eye points behind
//   rise    the same lattice, the camera rising (half a row a beat): layers stream down past the
//           lens with parallax (all at the same cell rate, about 1.1 cells a second)
// Music (all looked up inside the cue window; a pure function of time):
//   claps   every figure throws its arms up into the World dancer's V and back (0 -> 1 -> 0 over
//           0.35 s), delayed by its distance from the origin (12 ms a cell, at most 0.3 s: a wave
//           from the centre, never a frame-wide step); with wave the delay is its screen x instead
//           (0.55 s across: a stadium wave on every clap). Arms up brighten a figure by 20 % at most.
//   kicks   a pulse runs outward along the threads (a front at 14 units a second, two at a time);
//           a centre-weighted kick pump on the figures (13 %, 22 % in Rubedo/Opus; spec 7.3 rule 5)
//   armsUpAt / jumpAt  hold the arms up from those beats (the same wave), make everyone hop
// Natural length: 8 beats (reveal: 4). Stretch: travel, drift, pulses and the arm waves are
//   continuous at any length; the reveal's pull back takes its first 4 beats (squeezed into a
//   shorter cue) and then drifts on slowly; event beats are counted from the cue start.
// Params (range (default): what it looks like):
//   mode       crowd | reveal | fly | rise (crowd)
//   palette    silver | gold | crimson (gold): silver = moon-white figures, ice and lavender aura;
//              gold = bone-gold figures, flame aura, fire irises; crimson = molten gold on red
//   fog        moon | dawn | crimson (auto: silver -> moon; gold in Citrinitas -> dawn, saffron
//              haze under indigo; in Rubedo / Opus or crimson -> crimson, ultramarine to crimson)
//   armsUpAt   [beats] (none)   arms rise from these beats of the cue and stay up (a wave from the
//                               centre over 0.25 s)
//   jumpAt     [beats] (none)   everyone hops (0.36 s, the same wave)
//   wave       0/1 (0)          the clap arms become a stadium wave sweeping left to right
//   split      0..1 (0)         columns left of the centre turn to ink Shadows (violet rims, red
//                               hearts and irises), right of it to silver Animas (crescent crowns),
//                               the centre column stays the palette's
//   speed      0..1.6 (1)       travel / rise rate (capped: slices cross a pixel at most ~2x a second)
//   roll       -30..30 (0)      camera roll, degrees
//   zoom       0.5..3 (1)       camera zoom (2D, about the frame centre)
//   pump       0..0.25 (auto)   the kick pump amount
//   seed       any (0)          phase of the travel and the flames (seconds of motion = seed * 9.73)
//   offsetBeats 0..256 (0)      start that many beats into the choreography (travel, events, pull)
//   grade, frame                the engine's generic post knobs, as on every cue
// Reduced flashing (MO.reduced / uReduced, spec 7.5): travel x0.7, no arm brightening, kick pump
//   x0.3, thread pulses x0.5. Eyes never blink (more than 40 on screen, spec 7.3 rule 3).
// Couplings: none required; the vanishing point sits where the overlay expects the net's focus.
// Cost (SwiftShader, CPU time paired with albedo.a2 = 1.0, ~95 ms at 640x360): crowd 1.1-1.2,
//   reveal 1.1 (its first ~0.3 s close-up 1.45), fly / rise about 1.45. The code is written for
//   SwiftShader: per-frame values in JS, uniforms copied to registers once (uniform array reads
//   are costly there), no exp / sin / smoothstep in the per-pixel paths.
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

  const FS = `
// ---------------------------------------------------------------- NET OF BEING (prefix nb_)
// Layered planes, no raymarch: NB_NS depth slots (rows of the crowd, or slices of the lattice in
// space), front to back with early exit; each slot evaluates at most one figure per pixel (the
// nearest node). The crowd adds analytic planes (crown threads, the floor, the vault) and one far
// silhouette per pixel for the rows behind the slots. Per-slot constants (depth, fades, fog, detail)
// and every time-only quantity are computed in JS once per frame. Written for SwiftShader: no
// exp / sin / smoothstep in the per-pixel paths (box-filter ramps, rational falloffs instead).
uniform float uNbGeo;     // 0: the crowd on the lattice floor (crowd, reveal); 1: the lattice in space (fly, rise)
uniform vec4  uNbCam;     // camera world x, y; travel (rows / slices, continuous); focal length
uniform vec4  uNbView;    // 2D framing: centre xy (screen units), zoom, roll (radians)
uniform vec4  uNbGeom;    // x: crowd: last slot's row; y: vanishing point y on screen; z: vault amount; w: share of the row behind the last slot
uniform vec4  uNbLit;     // the reveal's light spreading from uNbOrg: lit = 1 - ss(dc * x + y); z: unlit level (1 = all lit)
uniform vec4  uNbSl[4];   // per slot: depth z, global row / slice index, alpha (fades), full-detail weight (0 = silhouette)
uniform vec4  uNbSf[4];   // per slot: fog attenuation, fog mix, detail 0..1, row offset (fraction of a column)
uniform vec4  uNbClap;    // x, y: seconds since the last two claps of the cue (99: none); z: s since the arms-up hold (-99: none); w: s since the jump
uniform vec4  uNbKick;    // the kick pulses on the threads: x, y radii of the last two fronts (world), z, w their strength
uniform vec4  uNbMove;    // x: wave 0 radial / 1 sideways; y: arms-up brightening (0 reduced); z: kick pump now
uniform vec3  uNbOrg;     // world origin of the arm wave, the kick pulse and the light
uniform vec3  uNbGrid;    // lattice spacing of the slots: x columns, y rows (crowd: one row, 1e4), z depth
uniform float uNbSplit;   // 0..1 ink Shadows left, silver Animas right, the centre column gold
uniform float uNbT;       // ambient clock (flames)
uniform float uNbAS;      // anti-strobe contrast of the travelling lattice lines (moAntiStrobe of their crossings per frame)
uniform vec3  uNbPal[12]; // 0 outline, 1 aura in, 2 aura out, 3 heart, 4 iris hot, 5 iris rim, 6 ground, 7 haze,
                          // 8 thread, 9 floor, 10 the One (horizon light), 11 body tint

// the palette and the hot per-frame values, copied once per pixel into registers (SwiftShader
// reloads uniform array elements at every use, which costs ~15 % here)
vec3 gP0, gP1, gP2, gP3, gP4, gP5, gP6, gP7, gP8, gP9, gP10, gP11;
vec4 gClap, gMove, gLit, gKick, gGeom;
vec3 gOrg, gGrid;
float gT, gSplit, gGeo, gAS;

const float NB_CW = 1.5;   // crowd: column spacing (world units = body units; a figure is 2 tall)
const float NB_DZ = 1.8;   // crowd: row spacing
const float NB_YC = 2.02;  // crowd: the crown plane (threads); feet on the floor at y = 0
const float NB_PHI = 0.618034;
const vec3  NB_G = vec3(2.3, 3.3, 2.6);   // space: lattice spacing x, y, depth
const int   NB_NS = 4;     // depth slots

// ---- cheap helpers (SwiftShader: smoothstep, exp, sin cost 3-6 multiply-adds each)
float nb_cl(float x) { return clamp(x, 0.0, 1.0); }
float nb_sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }      // smoothstep of a normalised x
float nb_st(float d, float ip, float w) { return clamp(w + 0.5 - abs(d) * ip, 0.0, 1.0); }   // AA line, half width w px (ip = 1 / pixel)
float nb_fl(float d, float ip) { return clamp(0.5 - d * ip, 0.0, 1.0); }               // AA fill of an SDF
float nb_g(float x2) { return 1.0 / (1.0 + x2); }                                       // soft falloff of a squared distance
float nb_g2(float x2) { float g = 1.0 / (1.0 + x2); return g * g; }                     // tighter falloff
float nb_tw(float x) { return abs(fract(x) - 0.5) * 4.0 - 1.0; }                          // triangle wave -1..1
float nb_atan(float y, float x) {
  float ax = abs(x), ay = abs(y);
  float a = min(ax, ay) / max(max(ax, ay), 1e-9);
  float s = a * a;
  float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  r = ay > ax ? 1.57079637 - r : r;
  r = x < 0.0 ? 3.14159274 - r : r;
  return y < 0.0 ? -r : r;
}
// lines at the integers of w (fw = |dw| per pixel), half width wpx pixels; they fade to their
// average cover where they would be denser than ~3 px, so the far lattice never shimmers
float nb_lines(float w, float fw, float wpx) {
  fw = max(fw, 1e-6);
  float l = clamp(wpx + 0.5 - abs(fract(w + 0.5) - 0.5) / fw, 0.0, 1.0);
  return mix(l, min(1.0, 2.0 * wpx * fw), nb_sm((fw - 0.12) * 4.35));
}
// the kick pulse: two fronts running outward from gOrg along the threads (r in world units)
float nb_pulse(float r) {
  float a = r - gKick.x, b = r - gKick.y;
  a = max(1.0 - a * a * 0.33, 0.0); b = max(1.0 - b * b * 0.33, 0.0);
  return a * a * gKick.z + b * b * gKick.w;
}
// depth: far things dim and drift into the haze colour (sf: the slot's attenuation and mix)
vec3 nb_fog(vec3 c, vec2 sf) { return mix(c, gP7 * dot(c, vec3(0.45, 0.8, 0.2)), sf.y) * sf.x; }
vec3 nb_fogZ(vec3 c, float z) { float k = z * 0.055; return nb_fog(c, vec2(1.0 / (1.0 + k + 0.5 * k * k), 0.8 * k / (1.0 + k))); }
// light spreading from the origin (the reveal): unlit things keep a dim trace
float nb_lit(float dc) { return mix(gLit.z, 1.0, 1.0 - nb_sm(dc * gLit.x + gLit.y)); }
// split: columns left of the centre are ink Shadows, right of it silver Animas, the centre gold
vec2 nb_kind(float c) { return vec2(c < -0.5 ? gSplit : 0.0, c > 0.5 ? gSplit : 0.0); }

// The figure: lib sdBody's joints (feet y = -1, crown +1, arms 0 hanging .. 1 the World dancer's V)
// with fewer primitives (a tapered trunk and shoulders, two tapers per limb): half the cost
float nb_body(vec2 p, float arms) {
  vec2 q = vec2(abs(p.x), p.y);
  float hd = length((p - vec2(0.0, 0.84)) * vec2(1.0, 0.78)) - 0.105;
  float tr = smin(sdTaper(q, vec2(0.0, 0.47), vec2(0.03, 0.05), 0.18, 0.15), sdTaper(q, vec2(0.0, 0.66), vec2(0.20, 0.585), 0.06, 0.055), 0.07);
  vec2 el = mix(vec2(0.285, 0.29), vec2(0.40, 0.80), arms);
  float arm = min(sdTaper(q, vec2(0.205, 0.575), el, 0.058, 0.043), sdTaper(q, el, mix(vec2(0.35, -0.08), vec2(0.56, 1.13), arms), 0.043, 0.024));
  float leg = min(sdTaper(q, vec2(0.095, 0.0), vec2(0.105, -0.47), 0.085, 0.055), sdTaper(q, vec2(0.105, -0.47), vec2(0.125, -0.97), 0.055, 0.028));
  return smin(smin(smin(tr, hd, 0.05), arm, 0.04), leg, 0.05);
}
// a far silhouette's shape: head, trunk, legs, one straight taper per arm
float nb_proxy(vec2 b, float arms) {
  vec2 q = vec2(abs(b.x), b.y);
  return min(min(min(length(b - vec2(0.0, 0.84)) - 0.12, sdTaper(q, vec2(0.0, 0.58), vec2(0.0, 0.02), 0.20, 0.15)),
             sdTaper(q, vec2(0.10, -0.02), vec2(0.11, -0.94), 0.08, 0.035)),
             sdTaper(q, vec2(0.21, 0.57), mix(vec2(0.35, -0.06), vec2(0.55, 1.11), arms), 0.055, 0.03));
}

// one luminous figure. b: body coords, pe: one pixel in body units, arms 0..1, kind: x ink-Shadow
// weight, y silver-Anima weight, det 0..1 detail, br brightness. Returns the emitted light (rgb) and
// how much it hides what is behind (a).
vec4 nb_fig(vec2 b, float pe, float arms, vec2 kind, float det, float br) {
  float d = nb_body(b, arms);
  vec2 cf = (b - vec2(0.0, 1.03)) * vec2(1.0, 0.5);
  float dfl = length(cf) - 0.10;                           // the flame tongue over the crown
  if (min(d, dfl + 0.03) > 0.15 + 2.0 * pe) return vec4(0.0);
  float ip = 1.0 / pe;
  float ink = kind.x, sil = kind.y, gld = 1.0 - ink - sil;
  vec3 cL  = gP0 * gld + vec3(0.40, 0.12, 1.00) * ink + vec3(0.86, 0.93, 1.00) * sil;
  vec3 cA1 = gP1 * gld + vec3(0.32, 0.05, 0.85) * ink + vec3(0.30, 0.62, 1.00) * sil;
  vec3 cA2 = gP2 * gld + vec3(0.16, 0.02, 0.45) * ink + vec3(0.42, 0.32, 1.00) * sil;
  vec3 cH  = gP3 * gld + vec3(0.95, 0.05, 0.08) * ink + vec3(0.90, 0.96, 1.00) * sil;
  float fillA = nb_fl(d, ip);
  // bone-white outline, a rim of light inside it, a topographic line (Alex Grey's body contours)
  // topographic lines inside, every 0.035 (Alex Grey's body contours), brightest near the skin; they
  // fade to their average where they would be denser than ~3 px
  float iv = -d * 28.6, ifw = pe * 28.6;
  float inner = mix(clamp(0.9 - abs(fract(iv + 0.5) - 0.5) / ifw, 0.0, 1.0), min(1.0, 0.8 * ifw), nb_sm((ifw - 0.12) * 4.35)) * step(0.5, iv) * det;
  vec3 col = cL * 0.95 * nb_st(d, ip, 0.15 + 0.35 * det) + (cA1 * (0.30 * inner * nb_g(d * d * 150.0) + 0.08 * nb_g(d * d * 400.0)) + gP11 * 0.02 * (1.0 - ink)) * fillA;
  // flame aura: two contour lines licking upward, the flame tongue over the crown
  float fl = nb_tw(b.y * 3.66 - gT + 0.22 * nb_tw(b.x * 1.75 + gT * 0.27)) * nb_cl(b.y * 0.53 + 0.42);
  float da = min(d - 0.016 * fl, dfl + 0.02 + 0.018 * nb_tw(b.y * 4.9 - gT * 1.43));
  float aura = (nb_st(da - 0.055, ip, 0.05) * (0.48 + 0.18 * fl) + 0.32 * nb_st(da - 0.112, ip, -0.05)) * nb_sm((0.057 * ip - 1.5) * 0.4) * det;
  float dg = max(da, 0.0) / (0.03 + 2.0 * pe);
  col += mix(cA1, cA2, step(0.084, da)) * aura + cA2 * 0.07 * nb_g(dg * dg) * (1.0 - fillA);
  // the central channel: a spine of light from the root to the brow, the bright heart point
  vec2 hp = b - vec2(0.0, 0.44);
  float hr = dot(hp, hp);
  col += cH * (nb_st(b.x, ip, 0.05 + 0.35 * det) * step(-0.02, b.y) * step(b.y, 0.76) * (0.5 + 0.4 * det) * fillA
             + 2.8 * nb_g2(hr / (0.0005 + 2.0 * pe * pe)) + 0.25 * nb_g(hr * 140.0));
  // the head is an open eye: an almond (the lids two parabolas through the corners) with a fire iris
  // of concentric flames; it never blinks (dozens of eyes on screen)
  vec2 e = b - vec2(0.0, 0.845);
  if (abs(e.x) < 0.15 && abs(e.y) < 0.09) {
    float dv = (abs(e.y) - 0.058 * (1.0 - e.x * e.x * 61.0)) * 0.8;
    float inE = nb_fl(dv, ip);
    float r = length(e - vec2(0.0, -0.004));
    vec3 iHot = gP4 * gld + vec3(1.6, 0.20, 0.08) * ink + vec3(1.0, 1.0, 1.0) * sil;
    vec3 iRim = gP5 * gld + vec3(0.9, 0.02, 0.04) * ink + vec3(0.20, 0.50, 1.0) * sil;
    vec3 eye = mix(cL * 0.08 * (1.0 - ink), mix(iHot * 2.2, iRim * 1.1, nb_sm((r - 0.010) * 25.0)) * (0.82 + 0.18 * nb_tw(r * 55.0)), nb_fl(r - 0.048, ip));
    eye = eye * (1.0 - 0.92 * nb_fl(r - 0.016, ip)) + vec3(1.3) * nb_fl(length(e - vec2(-0.016, 0.014)) - 0.006, ip) * (1.0 - ink);
    col = mix(col, eye, inE) + cL * 1.2 * nb_st(dv, ip, 0.15) + cA1 * 0.45 * (nb_st(dv - 0.024, ip, -0.05) + 0.6 * nb_st(dv - 0.046, ip, -0.1)) * nb_cl((0.022 * ip - 2.0) * 0.5) * step(0.0, dv) * det;
    fillA = max(fillA, inE);
  }
  // the Anima's crescent crown
  if (sil > 0.0 && abs(b.y - 1.14) < 0.1) {
    vec2 c = b - vec2(0.0, 1.14);
    float dc = max(length(c) - 0.075, -(length(c - vec2(0.0, 0.032)) - 0.066));
    col += vec3(0.9, 0.95, 1.0) * sil * nb_fl(dc, ip) * 1.5;
  }
  return vec4(col * br, fillA * 0.97);
}

// a far silhouette: an outline, the eye and heart points
vec4 nb_figFar(vec2 b, float pe, float arms, vec2 kind, float br) {
  float d = nb_proxy(b, arms);
  if (d > 0.1 + 2.0 * pe) return vec4(0.0);
  float ip = 1.0 / pe;
  float ink = kind.x, sil = kind.y, gld = 1.0 - ink - sil;
  vec3 cL = gP0 * gld + vec3(0.40, 0.12, 1.00) * ink + vec3(0.86, 0.93, 1.00) * sil;
  vec3 cE = gP4 * gld + vec3(1.6, 0.20, 0.08) * ink + vec3(1.0) * sil;
  float fillA = nb_fl(d, ip);
  vec2 e = b - vec2(0.0, 0.85), h = b - vec2(0.0, 0.44);
  float s2 = 1.0 / (0.0007 + 2.0 * pe * pe);
  vec3 col = cL * 0.75 * nb_st(d, ip, 0.2) + (gP1 * 0.10 * nb_g(d * d * 400.0) + cL * 0.07) * fillA
           + cE * 1.8 * nb_g2(dot(e, e) * s2) + gP3 * 1.4 * nb_g2(dot(h, h) * s2 * 1.4);
  return vec4(col * br, fillA * 0.9);
}

// a figure's arms (0 down .. 1 the World dancer's V) and hop height for its wave delay dl: on every
// clap the arms go up and back (0 -> 1 -> 0 over 0.35 s), from armsUpAt they stay up; jumpAt hops
vec2 nb_move(float dl) {
  vec2 c = gClap.xy - dl;
  float bx = nb_sm(c.x * 9.09) * (1.0 - nb_sm((c.x - 0.17) * 5.56));
  float by = nb_sm(c.y * 9.09) * (1.0 - nb_sm((c.y - 0.17) * 5.56));
  float hu = clamp((gClap.w - dl) * 2.78, 0.0, 1.0);
  return vec2(max(max(bx, by), nb_sm((gClap.z - dl) * 4.55)), 1.28 * hu * (1.0 - hu));
}

// the figure of one slot: b body coords before the hop, dc distance in cells from the origin (the
// wave, the light), xs its screen x (the stadium wave)
vec4 nb_slotFig(vec2 b, float pe, float dc, float xs, vec2 kind, vec4 sl, float det, float pump) {
  float dl = gMove.x > 0.5 ? 0.55 * clamp(xs * 0.2778 + 0.5, 0.0, 1.0) : min(0.3, 0.012 * dc);
  // the arms: up into the World dancer's V and back on every clap (0 -> 1 -> 0 over 0.35 s), held
  // from armsUpAt; the hop from jumpAt
  vec2 mv = nb_move(dl);
  float arms = mv.x;
  b.y -= mv.y;
  float lit = nb_lit(dc);
  float br = (1.0 + gMove.y * arms) * pump * lit;
  float full = sl.w * nb_sm((lit - 0.06) * 5.3);           // unlit figures (the reveal's start) stay silhouettes
  vec4 F = vec4(0.0);
  if (full > 0.001) F = nb_fig(b, pe, arms, kind, det, br);
  if (full < 0.999) F = mix(nb_figFar(b, pe, arms, kind, br), F, full);
  return F;
}

// ---------------------------------------------------------------- the crowd on the lattice floor
// Rows of figures at z = m * NB_DZ; row m is shifted by a golden-ratio step (no column lines up
// with another into wedges towards the vanishing point), so every crown has one neighbour in the
// next row a little to its right: the threads zigzag from row to row.
float nb_off(float m) { return fract(m * NB_PHI); }
// distance (world) from p (crown plane x, z) to the threads joining row m to row m + 1
float nb_zzd(vec2 p, float m) {
  float o = nb_off(m), u = p.x / NB_CW - o, i = floor(u);
  vec2 a = vec2((i + o) * NB_CW, m * NB_DZ), b = vec2((i + o + NB_PHI) * NB_CW, a.y + NB_DZ);
  return min(min(sdSegment(p, a, b), sdSegment(p, b, a + vec2(NB_CW, 0.0))), sdSegment(p, b - vec2(NB_CW, 0.0), a));
}

// the whole picture: the crowd's planes (crown threads, floor, vault) and the far rows, or the space
// lattice's threads, around ONE slot loop shared by both geometries (the figure code exists once)
vec3 nb_render(vec2 s, float pxs, float pump) {
  float f = uNbCam.w, camX = uNbCam.x, camY = uNbCam.y, camZ = uNbCam.z * gGrid.z;
  float crowd = 1.0 - gGeo;
  float r2 = dot(s, s);
  // ---- the crowd's planes on this ray (derivatives taken here, outside the branches): the crown
  // plane below the horizon, the vault above it; the floor
  float up = step(0.0, s.y) * crowd;
  float sy = s.y >= 0.0 ? max(s.y, 1e-5) : min(s.y, -1e-5);
  float sc = 1.0 + up;                                    // the vault's lattice is twice as wide
  float tH = mix(NB_YC - camY, 7.0, up) * f / sy;
  vec2 hw = vec2(camX + s.x * tH / f, camZ + tH) / sc;    // crown-plane coordinates (vault: halved)
  float v = hw.y / NB_DZ;
  float dz = nb_zzd(hw, floor(v));
  float fdz = fwidth(dz);
  float th = nb_lines(v, fwidth(v), 0.55) * 0.8
           + mix(clamp(0.6 - dz / max(fdz, 1e-6), 0.0, 1.0), min(1.0, 1.2 * fdz / (0.5 * NB_CW)), nb_sm((fdz / (0.5 * NB_CW) - 0.08) * 5.9));
  float tF = -camY * f / sy;
  vec2 fw = vec2(camX + s.x * tF / f, camZ + tF);
  float fa = fw.x / (NB_CW * 0.5), fc = fw.y / (NB_DZ * 0.5);
  float flo = nb_lines(fa, fwidth(fa), 0.4) + nb_lines(fc, fwidth(fc), 0.4);
  vec3 col = vec3(0.0);
  if (up > 0.5) {
    // above the horizon: the net goes on overhead, a vault of threads and star-eyes
    float mr = floor(v + 0.5), om = nb_off(mr);
    vec2 nn = vec2((floor(hw.x / NB_CW - om + 0.5) + om) * NB_CW, mr * NB_DZ) * 2.0;
    float zn = max(nn.y - camZ, 0.01);
    vec2 ns = vec2(nn.x - camX, 7.0) * f / zn - s;
    float rs = max(0.05 * f / zn, 1.2 * pxs);
    float star = nb_g2(dot(ns, ns) / (rs * rs)) * nb_cl((NB_CW * 2.0 * f / zn / pxs - 2.0) * 0.25);
    col = nb_fogZ((gP8 * th * (0.14 + 1.1 * nb_pulse(length(hw * 2.0 - gOrg.xz) * 0.5)) * gAS + gP4 * star * 0.8) * gGeom.z, tH * 0.8);
    col += gP6 * (1.0 + 2.0 * nb_g(s.y * s.y * 30.0));
  } else {
    vec3 headL = vec3(0.0), floorL = vec3(0.0);
    if (crowd > 0.5) {
      // the crown plane: threads crown to crown (along the rows, zigzag to the next row)
      vec2 dh = vec2((hw.x - gOrg.x) / NB_CW, (hw.y - gOrg.z) / NB_DZ);
      headL = nb_fogZ(gP8 * th * (0.22 + 1.8 * nb_pulse(length(hw - gOrg.xz))) * gAS * nb_lit(length(dh)), tH);
      // the floor: a fine lattice, pools of light under the feet; the far crowd dissolves into a haze
      float mf = floor(fw.y / NB_DZ + 0.5), of = nb_off(mf);
      vec2 pf = vec2(fw.x - (floor(fw.x / NB_CW - of + 0.5) + of) * NB_CW, fw.y - mf * NB_DZ);
      vec2 df = vec2((fw.x - gOrg.x) / NB_CW, (fw.y - gOrg.z) / NB_DZ);
      float zl = uNbSl[NB_NS - 1].x;
      floorL = nb_fogZ(gP9 * (0.10 * flo * gAS + 0.22 * nb_g2(dot(pf, pf) * 8.0)), tF) * nb_lit(length(df))
             + gP6 + gP7 * 0.10 * nb_sm((tF - zl * 0.8) / (zl * 1.2));
    } else { tH = 1e9; tF = 1e9; }
    // ---- the slots, front to back: rows of the crowd, or slices of the lattice in space
    float T = 1.0, doneH = crowd < 0.5 ? 1.0 : 0.0;
    float pe0 = pxs / f;
    for (int k = 0; k < NB_NS; k++) {
      vec4 sl = uNbSl[k];
      float z = sl.x;
      if (tH < z && doneH < 0.5) { col += T * headL; doneH = 1.0; }
      if (tF < z || T < 0.03) break;                       // past the floor, or hidden: nothing more on this ray
      if (sl.z > 0.001) {
        vec4 sf = uNbSf[k];
        vec2 P = vec2(camX, camY) + s * (z / f);
        // the nearest node: a column of the slot's lattice (offset sf.w columns) and its row (the
        // crowd's single row stands with its centre at y = 1; a space slice is offset by its own fraction)
        float oy = mix(1e-4, nb_off(sl.y * 1.618 + 0.3), gGeo);
        vec2 ci = floor(P / gGrid.xy - vec2(sf.w, oy) + 0.5);
        vec2 nd = (ci + vec2(sf.w, oy)) * gGrid.xy;
        vec2 b = P - nd;
        float pe = pe0 * z;
        vec3 c = vec3(0.0);
        float a = 0.0;
        float dc = length(vec3((nd - gOrg.xy) / gGrid.xy, sl.y - gOrg.z / gGrid.z));
        if (gGeo > 0.5) {
          // space: threads in the plane, crown to crown across and up through every body's channel
          float ip = 1.0 / pe;
          float thr = (nb_st(b.y - 1.0, ip, 0.1) + nb_st(b.x, ip, 0.1) * (abs(b.y) > 0.97 ? 1.0 : 0.3)) * nb_cl((0.3 * ip - 2.0) * 0.33);
          if (thr > 0.002) c = gP8 * thr * (0.35 + 1.6 * nb_pulse(length(vec3(P, sl.y * gGrid.z) - gOrg))) * gAS * nb_lit(dc);
        }
        if (abs(b.x) < 0.75 && b.y > -1.15 && b.y < 1.75) {
          vec2 kind = nb_kind(ci.x - floor(camX / gGrid.x - sf.w + 0.5));
          vec4 F = nb_slotFig(b, pe, dc, (nd.x - camX) * f / z, kind, sl, sf.z, pump);
          c = F.rgb + c * (1.0 - F.a);
          a = F.a;
        }
        col += T * nb_fog(c, sf.xy) * sl.z;
        T *= 1.0 - a * sl.z;
      }
    }
    if (crowd > 0.5) {
      if (doneH < 0.5) col += T * headL;
      // the rows behind the slots: on this ray, the first row past the crown plane and the last slot
      // (its figure hides the ones behind it) as a far silhouette
      float zl = uNbSl[NB_NS - 1].x;
      float m1 = floor((camZ + max(tH, zl + 0.05)) / NB_DZ) + 1.0;
      float z1 = m1 * NB_DZ - camZ;
      if (T > 0.03 && z1 < tF) {
        vec2 w = vec2(camX + s.x * z1 / f, camY + s.y * z1 / f);
        float o1 = nb_off(m1), ci = floor(w.x / NB_CW - o1 + 0.5), cx = (ci + o1) * NB_CW;
        float dc = length(vec2((cx - gOrg.x) / NB_CW, m1 - gOrg.z / NB_DZ));
        vec2 mv = nb_move(gMove.x > 0.5 ? 0.55 * clamp((cx - camX) * f / z1 * 0.2778 + 0.5, 0.0, 1.0) : min(0.3, 0.012 * dc));
        vec4 F = nb_figFar(vec2(w.x - cx, w.y - 1.0 - mv.y), pe0 * z1, mv.x, nb_kind(ci - floor(camX / NB_CW - o1 + 0.5)), nb_lit(dc));
        float a = m1 > gGeom.x + 1.5 ? 1.0 : gGeom.w;  // the row right behind the last slot fades in with it
        col += T * nb_fogZ(F.rgb, z1) * a;
        T *= 1.0 - F.a * a;
      }
      col += T * floorL;
    } else {
      // space: the slices behind as a layer of eye points (the net goes on), then the vanishing point,
      // the One, a haze of countless points
      float zp = uNbSl[2].x + gGrid.z * 1.5;
      vec2 pp = (vec2(camX, camY) + s * (zp / f)) / gGrid.xy + vec2(0.37, 0.61);
      vec2 pd = (fract(pp) - vec2(0.5, 0.80)) * gGrid.xy * f / zp;
      float spp = gGrid.x * f / zp / pxs;
      col += T * (gP6 + gP7 * (0.30 * nb_g2(r2 * 4.5) + 0.06 * nb_g(r2 * 0.8)) + gP10 * 0.5 * nb_g2(r2 * 50.0)
                  + gP4 * 0.9 * nb_g2(dot(pd, pd) / (pxs * pxs * 2.0)) * nb_cl((spp - 4.0) * 0.25) * 0.35);
    }
  }
  // the light of the One where the net meets the horizon
  if (crowd > 0.5) col += gP10 * (0.30 * nb_g2(s.y * s.y * 160.0) * nb_g(s.x * s.x * 0.4) + 0.35 * nb_g2(r2 * 12.0) + 0.05 * nb_g(r2 * 1.5));
  return col;
}

void main() {
  gP0 = uNbPal[0]; gP1 = uNbPal[1]; gP2 = uNbPal[2]; gP3 = uNbPal[3]; gP4 = uNbPal[4]; gP5 = uNbPal[5];
  gP6 = uNbPal[6]; gP7 = uNbPal[7]; gP8 = uNbPal[8]; gP9 = uNbPal[9]; gP10 = uNbPal[10]; gP11 = uNbPal[11];
  gClap = uNbClap; gMove = uNbMove; gLit = uNbLit; gT = uNbT; gSplit = uNbSplit;
  gKick = uNbKick; gGeom = uNbGeom; gOrg = uNbOrg; gGrid = uNbGrid; gGeo = uNbGeo; gAS = uNbAS;
  vec2 p = uvCentered(gl_FragCoord.xy);
  float c = cos(uNbView.w), sn = sin(uNbView.w);
  vec2 q = mat2(c, sn, -sn, c) * p / uNbView.z + uNbView.xy;
  float pxs = px() / uNbView.z;
  vec2 s = q - vec2(0.0, uNbGeom.y);
  // the kick pump: centre-weighted (the rubedo rule), never a frame-wide step
  float pump = 1.0 + gMove.z * nb_g(dot(p, p) * 1.5);
  vec3 col = nb_render(s, pxs, pump);
  // dither against banding in the dark gradients
  col += (hash21(gl_FragCoord.xy + fract(uTime * 7.3) * 61.0) - 0.5) * 0.003;
  fragColor = vec4(max(col, 0.0), 1.0);
}
`;

  // palettes (linear): 0 outline, 1 aura in, 2 aura out, 3 heart, 4 iris hot, 5 iris rim, 6 ground, 7 haze,
  // 8 thread, 9 floor, 10 the One, 11 body tint. 6, 7 and 10 come from the fog preset.
  const PAL = {
    silver: [[0.86, 0.92, 1.00], [0.30, 0.60, 1.00], [0.42, 0.32, 1.00], [0.85, 0.95, 1.00], [1.00, 0.97, 0.90], [0.25, 0.50, 1.00],
      null, null, [0.40, 0.62, 1.00], [0.15, 0.30, 0.95], null, [0.20, 0.35, 1.00]],
    gold: [[1.00, 0.86, 0.62], [1.00, 0.55, 0.10], [0.95, 0.18, 0.04], [1.00, 0.92, 0.70], [1.00, 0.90, 0.50], [1.00, 0.30, 0.02],
      null, null, [1.00, 0.66, 0.22], [0.90, 0.42, 0.06], null, [1.00, 0.55, 0.15]],
    crimson: [[1.00, 0.70, 0.45], [0.95, 0.10, 0.10], [0.80, 0.02, 0.35], [1.00, 0.85, 0.65], [1.00, 0.85, 0.45], [0.90, 0.05, 0.05],
      null, null, [1.00, 0.40, 0.15], [0.80, 0.08, 0.10], null, [0.90, 0.10, 0.10]],
  };
  // fog presets: ground, haze, the One
  const FOG = {
    moon: [[0.002, 0.005, 0.030], [0.10, 0.18, 0.60], [0.50, 0.66, 1.00]],
    dawn: [[0.006, 0.004, 0.025], [0.55, 0.22, 0.03], [1.00, 0.62, 0.22]],
    crimson: [[0.003, 0.005, 0.045], [0.45, 0.02, 0.06], [1.00, 0.36, 0.16]],
  };

  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const beatsList = (v) => (Array.isArray(v) ? v : typeof v === 'number' ? [v] : []).filter((x) => typeof x === 'number' && Number.isFinite(x));

  const NS = 4;                                          // depth slots (NB_NS)
  const NSS = 3;                                         // live slots in space (fly, rise)
  const PHI = 0.618034;
  const CW = 1.5, DZ = 1.8, GD = 2.6, GH = 3.3;          // NB_CW, NB_DZ, NB_G.z, NB_G.y
  const sstep = (a, b, x) => MO.smooth((x - a) / (b - a));
  const frac = (x) => x - Math.floor(x);

  MO.shot('net.being', (cue) => {
    const mode = ['crowd', 'reveal', 'fly', 'rise'].includes(cue.params && cue.params.mode) ? cue.params.mode : 'crowd';
    const NAT = mode === 'reveal' ? 4 : 8;
    const K = cueClock(cue, 0, NAT, 0, 0);
    const P = K.P;
    const palName = PAL[P.palette] ? P.palette : 'gold';
    const sec = MO.section(cue.from + 1e-4) || {};
    const stage = String(sec.stage || '').toLowerCase();
    const late = stage.startsWith('rubedo') || stage.startsWith('opus');
    let fogName = typeof P.fog === 'string' && FOG[P.fog] ? P.fog : null;
    if (!fogName) fogName = palName === 'silver' ? 'moon' : late || palName === 'crimson' ? 'crimson' : 'dawn';
    const pal = PAL[palName].slice();
    [pal[6], pal[7], pal[10]] = FOG[fogName];
    const palFlat = new Float32Array(pal.flat());
    const split = K.p('split', 0, 0, 1), roll = K.p('roll', 0, -30, 30) * Math.PI / 180, zoom = K.p('zoom', 1, 0.5, 3);
    const speed = Math.min(1.6, Math.max(0, K.speed));
    const wave = K.on('wave', false) ? 1 : 0;
    const pumpAmt = K.p('pump', late ? 0.22 : 0.13, 0, 0.25);
    const pulseAmt = MO.reduced ? 0.5 : 1;
    const geo = mode === 'fly' || mode === 'rise' ? 1 : 0;
    const t0 = cue.from - K.off;                           // the choreography's beat 0
    const armsUp = beatsList(P.armsUpAt).map((b) => t0 + b * BEAT).sort((a, b) => a - b);
    const jumps = beatsList(P.jumpAt).map((b) => t0 + b * BEAT).sort((a, b) => a - b);
    const seedPh = K.seed * 9.73;
    const clapsIn = MO.events.clap.filter((e) => e.t >= cue.from - 0.02 && e.t < cue.to).map((e) => e.t);
    // camera presets
    const CROWD = { y: 4.2, f: 1.7, k0: 2 };
    const REVEAL = { y: 4.6, f: 1.6, k0: 2 };
    const SPACE = { f: 1.5, k0: 1 };
    const NF = geo === 0 ? 3 : 2;                          // full-detail slots (the next one cross-fades)
    const travelRate = (mode === 'crowd' ? 0.35 : mode === 'fly' ? 0.5 : mode === 'rise' ? 0.06 : 0.12) / BEAT;   // rows (slices) per second at speed 1
    const riseRate = 0.5 * GH / BEAT;                      // rise: world units per second at speed 1
    const T_PULL = Math.min(cue.to, t0 + NAT * BEAT);      // reveal: the pull back ends here
    const fogA = (z) => Math.exp(-z * 0.055), fogM = (z) => 0.8 - 0.8 * Math.exp(-z * 0.05);
    const uniforms = (t) => {
      const red = MO.reduced ? 0.7 : 1;
      const mt = (t - t0) * speed * red + seedPh;           // motion clock (travel, sway), seconds from the choreography's start
      const at = K.M(t);
      const lastK = (k) => { const l = MO.last('kick', t); if (!l) return null; const e = MO.events.kick[l.i - k]; return e && e.t >= cue.from - 0.02 ? e : null; };
      const k0 = lastK(0), k1 = lastK(1);
      const cl = clapsIn.filter((c) => c <= t + 1e-6);
      const hold = armsUp.length && armsUp[0] <= t + 0.35 ? t - armsUp[0] : -99;
      const jl = jumps.filter((j) => j <= t + 0.35);
      const clap = [cl.length ? t - cl[cl.length - 1] : 99, cl.length > 1 ? t - cl[cl.length - 2] : 99, hold, jl.length ? t - jl[jl.length - 1] : 99];
      let cam, view = [0, 0, zoom, roll], org, geom, lit = [0, -1, 1, 0];
      let cross = 0;                                        // lattice features crossing a pixel per frame
      const sl = new Float32Array(4 * NS), sf = new Float32Array(4 * NS);
      if (geo === 0) {
        const C = mode === 'reveal' ? REVEAL : CROWD;
        let tr = 1.3 + mt * travelRate;
        const camX = 0.25 * Math.sin(at * 0.23 + 1.0);
        cross = travelRate * speed * red / 30;
        let z2 = zoom;
        if (mode === 'reveal') {
          // the pull back: a dolly of 2.2 rows and a 2D zoom 4.5x -> 1x (about 8x in all), easing out; the
          // light spreads from the one figure to the thousands
          const u = MO.easeOut(MO.remap(t, t0, T_PULL));
          tr = 3.0 - 2.2 * u + 0.12 * Math.max(0, t - T_PULL) / BEAT * red;
          const zf = Math.exp(Math.log(4.5) * (1 - u));
          const mF = 6, zF = (mF - tr) * DZ;
          const xF = ((Math.round(0 - (mF * PHI) % 1) + (mF * PHI) % 1)) * CW;
          const xs = (xF - camX) * C.f / zF, ys = 0.12 + (1.35 - C.y) * C.f / zF;
          z2 = zf * zoom;
          view = [xs * (1 - u), ys * (1 - u), z2, roll];
          org = [xF, 2, mF * DZ];
          const R = 0.5 + 60 * MO.easeIn(MO.remap(t, t0 + 0.12, t0 + 2.2 * BEAT)), w = 0.45 + 0.12 * R;
          lit = [1 / (2 * w), -(R - w) / (2 * w), 0.07, 0];
          cross = 2.2 * 3 / (T_PULL - t0) * (1 - u) / 30;
        } else org = [camX, 2, (tr + 5) * DZ];
        cam = [camX, C.y, tr, C.f];
        const fr = tr - Math.floor(tr), fl = Math.floor(tr);
        for (let k = 0; k < NS; k++) {
          const z = (k + C.k0 - fr) * DZ;
          sl.set([z, fl + k + C.k0, k === NS - 1 ? MO.smooth(fr) : 1, k < NF ? 1 : k === NF ? MO.smooth(fr) : 0], 4 * k);
          sf.set([fogA(z), fogM(z), sstep(0.10, 0.30, 2 * C.f / z * z2), ((fl + k + C.k0) * PHI) % 1], 4 * k);
        }
        // the rows behind the last slot are drawn as far silhouettes (cross-faded with it)
        geom = [fl + C.k0 + NS - 1, 0.12, 0.35, 1 - MO.smooth(fr)];
      } else {
        const tr = (mode === 'rise' ? 0.02 : 0.4) + mt * travelRate;
        let cy = GH * 0.5;
        if (mode === 'rise') cy += mt * riseRate;
        cross = (mode === 'rise' ? riseRate / GH : travelRate) * speed * red / 30;
        cam = [0, cy, tr, SPACE.f];
        org = [0, Math.round(cy / GH) * GH, (tr + 2.5) * GD];
        const fr = tr - Math.floor(tr), fl = Math.floor(tr);
        for (let k = 0; k < NS; k++) {
          const z = (k + SPACE.k0 - fr) * GD;
          // three live slices (the fourth is skipped): the farthest fades in, the nearest fades out before it
          // grows past the lens
          sl.set([z, fl + k + SPACE.k0, k >= NSS ? 0 : sstep(0.5, 1.0, z / GD) * (k === NSS - 1 ? MO.smooth(fr) : 1), k < NF ? 1 : k === NF ? MO.smooth(fr) : 0], 4 * k);
          sf.set([Math.exp(-z * 0.075), 0.85 - 0.85 * Math.exp(-z * 0.06), sstep(0.10, 0.30, 2 * SPACE.f / z * zoom), (frac((fl + k + SPACE.k0) * PHI) - 0.5) * 0.5], 4 * k);

        }
        geom = [0, 0.12, 0, 0];
      }
      return {
        uNbGeo: geo, uNbCam: cam, uNbView: view, uNbGeom: geom, uNbLit: lit, uNbSl: sl, uNbSf: sf, uNbClap: clap,
        // the thread pulses: fronts at 14 world units per second from the origin, fading over ~0.55 s
        uNbKick: [k0 ? (t - k0.t) * 14 : 1e3, k1 ? (t - k1.t) * 14 : 1e3, k0 ? Math.exp(-(t - k0.t) * 1.8) * pulseAmt : 0, k1 ? Math.exp(-(t - k1.t) * 1.8) * pulseAmt : 0],
        uNbMove: [wave, MO.reduced ? 0 : 0.2, pumpAmt * (MO.reduced ? 0.3 : 1) * MO.env('kick', t, 0.16), 0],
        uNbOrg: org, uNbGrid: geo === 0 ? [CW, 1e4, DZ] : [2.3, GH, GD], uNbSplit: split, uNbT: at - cue.from, uNbAS: 1 - MO.smooth(MO.remap(cross, 0.07, 0.25)), uNbPal: palFlat,
      };
    };
    MO.scene({ id: 'net.being#' + cue.index, fs: FS, uniforms, bloom: 0.5, bloomThreshold: 0.85, vignette: 0.45 });
  });
})();
