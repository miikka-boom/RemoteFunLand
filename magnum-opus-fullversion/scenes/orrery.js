// ORRERY — X The Wheel of Fortune, VII The Chariot. Owner: orrery. One shot factory, orrery.thieves
// (NEW in the full version, spec 5.4): THE SEVEN THIEVES. A vast armillary orrery floats in an
// amber-to-ultramarine void above the athanor's fire: seven tilted concentric gold bands (engraved
// with 72 ticks, 12 sector lines and the roman numerals I-XII) carry seven large chrome spheres in
// Ptolemaic order from the centre: Luna silver, Mercury quicksilver (a rippling mirror), Venus copper,
// Sol (an empty black socket in a gold setting), Mars iron (rust), Jupiter tin, Saturn lead (dull,
// tarnished). In each sphere's chrome stands the thief who keeps that metal: a hooded figure behind the
// viewer wearing its planet's lacquer mask (hood peak, crown, horns, jewel, wings, crescent horns: the
// Persona's masks returning). A glyph medallion circles each sphere (♄ ♃ ♂ ♀ ☿ ☽ ☉; rubedo's glyph set
// plus Saturn and Jupiter). At the centre the athanor: a stepped furnace, the eye in the triangle,
// five flame tongues, its light raying out in Tarot XIX rays (straight and wavy). Behind everything
// the Wheel of Fortune (rims, ticks, eight spokes, T A R O) turns a notch per kick; fine contour lines
// (energy fields, Alex Grey) ring every sphere; the zodiac band crosses the sky.
// Everything is a pure function of time; all projection is done in JS each frame (planets, bands,
// medallion circles, sphere outlines as exact ellipses), and one fragment program serves every cue.
//
// shot orrery.thieves
// State from the score (nothing is carried between frames):
//   clockwork  every kick moves each planet one notch along its band (an eased 0.12 s move, 0.2 s in
//              reduced mode; 2-6 degrees, faster inside), from the score's kick count; open hats glint
//              the band rims.
//   transmute  planet i turns gold at S.chakras[i].beat + 2 (beat 3 of its build bar, her sung metal):
//              molten gold floods the sphere from the top down in 0.6 s (a wavy liquid front with a
//              white-hot edge), its thief burns away along a noisy front, its glyph flares white, and a
//              head of gold light runs once round its band in 1.3 s, leaving the band blazing. Sol
//              (S.chakras[6].beat + 2 = 78.3) ignites from the rim inward into a white-hot sun with a
//              Marseille face and sixteen XIX rays (0.22 s; 0.4 s reduced).
// Cameras (cam / focus):
//   wide | low | high  orbiting round the whole orrery (elevation 22 / 7 / 56 degrees, 0.08 rad/s),
//                      its centre at the upper middle of the frame (6.1 zones); orbit adds degrees.
//   focus <planet>     close on one sphere, about 55 % of the frame height at screen (0.10, 0.10),
//                      the camera riding with the planet so its graduated band slides a notch under it
//                      on each kick; a slow 10 % push. The direction is the first of a ranked list (from
//                      outside, looking in at the athanor's light) from which no band crosses the thief's
//                      face at the cue's start or end (ray-band tests in JS).
//   focus 'all'        every metal gold, Sol ignited, every band blazing (also simply the score's state
//                      after beat 314). Without cam: a fast pull back from Sol to the whole orrery, 3.5x
//                      to 1x over the cue as a dolly of 2x along the line from Sol times a zoom out of
//                      1.75x (2.5x = 1.6 x 1.55 in reduced mode), Sol held on the MATCH point the whole
//                      time: it opens on a telephoto of the sun igniting above the furnace and ends on
//                      the whole orrery with Sol above it. While the frame moves that fast the bands and
//                      the furnace calm to half their contrast (spec 7.3 rule 1). With cam: that camera.
//   eclipseAt b        the camera sits on the line from Sol through Luna (Luna's band tilted 28 degrees
//                      for this cue, so the line rises and the camera looks down at about 20 degrees),
//                      zooms in 1.2x -> 2.1x until b and orbits slowly round Sol's vertical, so the
//                      silver Moon slides across Sol's black socket and covers it on b; a corona (a
//                      thin white ring and streamers) flares round it on b and fades as they part.
//   alignAt b          the syzygy: over the beat before b every band eases into one plane and every
//                      planet swings onto one line through the athanor, across the frame (alternate
//                      sides), landing on b; they hold the line; a beam of light flares along it.
// MATCH CUT 78.5 -> 79.1 (spec 4.1 rule 9): on the last frame of the 'all' pull back Sol's white core
//   sits on MO.MATCH_SOL_TOWER = (0, 0.40) in uvCentered units (frame fractions 0.5, 0.30; pixel
//   (960, 324) at 1080p), where hermit.lantern's strike puts the lightning on the tower's finial.
//   hermit.js owns the constant; this file reads it when the factory runs and falls back to the same
//   numbers (SOL_MATCH).
// Natural length: 8 beats (wide), 2 beats (focus). Stretch: the clockwork, orbits, flames, ripples
//   and the wheel run at any length; the focus push, the eclipse zoom and the pull back span the cue;
//   floods, ignition, eclipse and syzygy are anchored to their beats (the score, or the cue start
//   plus eclipseAt / alignAt), so any cue anywhere shows the right state at every frame.
// Params (range (default): what it looks like):
//   cam         'wide' | 'low' | 'high' ('wide'; with focus <planet>: the focus camera; with focus
//               'all' and no cam: the pull back)
//   focus       'saturn' | 'jupiter' | 'mars' | 'venus' | 'mercury' | 'luna' | 'sol' (or the metals
//               lead, tin, iron, copper, quicksilver, silver, gold) | 'all' (none: an orbit camera)
//   orbit       degrees (0): added to the orbit cameras' azimuth
//   eclipseAt   beats from the cue start (none)
//   alignAt     beats from the cue start (none)
//   transmute   'score' | [7 beats] ('score'): absolute beats of each flood (index 6: Sol's ignition),
//               score order Saturn..Sol; -1 = gold from the start, null = never
//   palette     'amber' | 'crimson' ('amber'): the void, rays, wheel and lines (crimson for Rubedo)
//   zoom        0.5..3 (1): focal length (2.4 frame units) multiplier
//   exposure    0.3..2.5 or keyframes [[u, v], ...] across the cue (1; the focus cues default to the
//               FOCUS_EXPO ramps below: their level at the start, a swell into the next downbeat over
//               the last 40 %, so both sides of every build cut stay within 15 % mean luminance of the
//               citrinitas shots, spec 7.3 rule 7; measured 0.87-1.10 on all 14 cuts of bars 72-79,
//               including 79.0 into hermit.lantern's strike)
//   speed       0..16 (1): the ambient clock (flames, ripples, drift, orbit speed)
//   seed        any (0): phase of that clock and of every planet on its band
//   offsetBeats 0..256 (0): shifts the cue's own events (eclipseAt, alignAt) earlier by that much
//   grade, frame: the engine's post knobs (cue 61 uses grade gain 0.58 under the wheel of trumps)
// Safety (spec 7.3 / 7.5): the floods are travelling fronts on one sphere (< 15 % of the frame); the
//   ignition is a front on one disc; the corona a thin ring; no large area pulses with the kick (only
//   the bands' engraving, +15 %); every repeated line pattern that moves (band ticks, wheel ticks,
//   zodiac ticks, contour lines) fades to its average coverage with moAntiStrobe(features per frame)
//   from the frame's screen motion. uReduced: flood edge x0.45, glyph flares and light heads x0.5,
//   corona and syzygy light x0.5, no open-hat glints, kick lift x0.3, ticks eased over 0.2 s,
//   ignition over 0.4 s, the pull back 2.5x instead of 3.5x.
//   Flash analyser (flash2.py, BLOCK=5, 30 fps 640 clips of every cue window, normal / reduced): each
//   cue alone has at most 2 full-screen large-area transitions in any 1 s window, a flickering
//   fraction <= 0.022 (10-degree windows <= 0.09, at most 6 transitions) and no red transition. The
//   whole build clip 72-79 with the citrinitas shots: at most 3 full-screen transitions per 1 s
//   window (1.5 flashes) and a flickering fraction of 0.110 / 0.126 reduced; its remaining 10-degree
//   misses sit inside citrinitas c2b and at the two-beat cuts.
// Cost (SwiftShader; CPU time of the GPU process, interleaved with albedo.a2 = 95 ms at 640x360): focus
//   cues about 1.2x the reference (~115 ms at 640x360), the eclipse about 1.45x (~138 ms), whole-orrery
//   frames (61, the end of 78.5, 85) about 1.55x (~147 ms). On SwiftShader every instruction runs for
//   every pixel whatever the branches, so the shader evaluates each feature once (one sphere shading,
//   one band shading, one medallion, one athanor per pixel) and its loops run only over what JS found
//   on screen this frame (uN); fine detail too small to read is gated off (uG).
(() => {
  const BEAT = MO.BEAT;
  const S = MO.S;

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
  void mono;

  // ------------------------------------------------------------------ GLSL
  const FS = `
uniform vec3  uRo;        // camera position (world units; the orrery's centre is the origin, y up)
uniform mat3  uCam;       // camera basis: right, up, forward (columns)
uniform float uF;         // focal length in screen units (the frame is 2 units high)
uniform vec4  uPl[7];     // planets: centre xyz, sphere radius. Index = score order: 0 Saturn, 1 Jupiter,
                          //   2 Mars, 3 Venus, 4 Mercury, 5 Luna, 6 Sol
uniform vec4  uPO[7];     // per planet, from JS: uRo - centre (xyz), |uRo - centre|^2
uniform vec4  uPS[7];     // planet state: x gold flood 0..1, y glyph flare, z the thief 1..0 (burns away), w unused
uniform vec4  uRg[7];     // rings (concentric, centred on the origin): unit normal xyz, band half height
uniform float uRR[7];     // ring radii
uniform vec4  uRO[7];     // per ring, from JS: the camera's offset from the ring axis (xyz), its squared length - R^2
uniform float uRH[7];     // per ring, from JS: the camera's height along the ring axis
uniform vec4  uRE[7];     // rings: unit axis e1 (ring angle 0) xyz, w = ring angle where the gold light set out
uniform vec4  uRP[7];     // rings: x gold arc lit so far 0..TAU, y light head 0..1, z open-hat glint, w kick lift
uniform vec4  uMd[7];     // glyph medallions on screen: centre xy, radius, depth (< 0: off)
uniform vec4  uSc[8];     // the spheres' outlines on screen (exact ellipses, from JS): centre xy, semi-axes
                          //   across / along the radial direction; [7] the athanor: centre xy, scale, on
uniform vec4  uSd[7];     // ... the ellipse's radial direction xy, depth along the camera axis, on
// what is on screen this frame (JS culls): the loops run over these lists only. On SwiftShader a loop
// with a uniform trip count is the one construct that really skips work.
uniform vec3  uN;         // how many spheres, rings, medallions are listed
uniform vec4  uG;         // fine detail big enough to read this frame (0/1, loop counts): the thieves in the
                          //   chrome, the band numerals, the medallion glyphs, the sun's face
uniform float uSI[7], uRI[7], uMI[7];   // their planet indices
uniform vec4  uSun;       // x Sol ignited 0..1, y ray spin, z eclipse corona 0..1, w syzygy light 0..1
uniform vec4  uK;         // x palette 0 amber .. 1 crimson, y exposure, z screen motion (frame units / frame), w athanor scale
uniform vec4  uWh;        // the Wheel of Fortune: x radius (frame units), y turn (radians), z strength;
                          //   w: how much the bands and the furnace calm down in the pull back (0..0.5)
uniform vec4  uLine;      // the syzygy's line on screen: two end points (the light runs along it, uSun.w)
// lookup tables, set once from JS (indexed GLSL const arrays get copied per pixel on SwiftShader):
//   TARO strokes (16), glyph strokes (28), glyph circles (7), metal tint + dullness (7), mask lacquer (6),
//   roman numerals: packed chars, length (12), headpieces: two per mask (12)
uniform vec4  uTab[88];
#define OR_T_TARO 0
#define OR_T_GS 16
#define OR_T_GC 44
#define OR_T_TINT 51
#define OR_T_MC 58
#define OR_T_RN 64
#define OR_T_HP 76

// Cost note: on SwiftShader every instruction runs for every pixel, whatever the branches (uniform
// ifs included: they get flattened); only a loop with a uniform trip count skips work. So this shader
// evaluates each feature once, loops only over what JS found on screen (uN), and gates the fine
// detail that would be too small to read (uG) behind one-pass loops.

const vec3 OR_GOLD = vec3(1.00, 0.62, 0.20);
const vec3 OR_HOT  = vec3(1.00, 0.86, 0.62);
const vec3 OR_AU   = vec3(1.25, 0.82, 0.36);     // gold metal tint

float or_sq(float x) { return x * x; }
// compare-swap so that the farther layer (larger depth) comes first
#define OR_CSWAP(ca, za, cb, zb) { bool sw = za < zb; vec4 tc = sw ? ca : cb; ca = sw ? cb : ca; cb = tc; float tz = sw ? za : zb; za = sw ? zb : za; zb = tz; }
float or_ln(float d, float w, float e) { return 1.0 - smoothstep(w - e, w + e, abs(d)); }
float or_fl(float d, float e) { return 1.0 - smoothstep(-e, e, d); }
// acos without the transcendental (Abramowitz-Stegun, |error| < 7e-5)
float or_acos(float x) {
  float a = abs(x);
  float r = sqrt(max(1.0 - a, 0.0)) * (1.5707288 + a * (-0.2121144 + a * (0.0742610 - 0.0187293 * a)));
  return x < 0.0 ? PI - r : r;
}
// iso-lines at the integers of v (fw = |dv| per pixel, w = half width in pixels): fades to the average
// coverage where they get too dense (no moire) or move too fast across the pixels (spec 7.3 rule 1)
float or_iso(float v, float fw, float w, float motPx) {
  fw = max(fw, 1e-5);
  float d = abs(fract(v + 0.5) - 0.5) / fw;
  float l = 1.0 - smoothstep(w - 0.7, w + 0.7, d);
  float avg = min(1.0, 2.0 * w * fw);
  l = mix(l, avg, smoothstep(0.12, 0.32, fw));
  return mix(avg, l, moAntiStrobe(motPx * fw));
}
// flame tongue: local x across, y along (0 base .. L tip)
float or_flameD(vec2 q, float W, float L, float tt, float seed, float wav) {
  float v = q.y / L;
  float sway = (0.35 * W * sin(v * 6.0 - tt * 8.0 + seed * 2.3) + wav * 0.6 * W * sin(v * 11.0 - tt * 11.0 + seed)) * v;
  float wv = W * (1.0 - v) * (0.35 + 1.4 * sqrt(max(v, 0.0)));
  return max((abs(q.x - sway) - wv) * 0.7, max(-q.y, q.y - L));
}

// ---- the void: amber fire below, ultramarine above (crimson in the rubedo palette)
vec3 or_void(vec3 d) {
  vec3 top = mix(vec3(0.006, 0.008, 0.075), vec3(0.020, 0.002, 0.030), uK.x);
  vec3 mid = mix(vec3(0.20, 0.050, 0.020), vec3(0.24, 0.010, 0.030), uK.x);
  vec3 bot = mix(vec3(0.48, 0.13, 0.020), vec3(0.42, 0.030, 0.015), uK.x);
  vec3 c = mix(mid, top, smoothstep(-0.12, 0.60, d.y));
  return mix(c, bot, smoothstep(-0.05, -0.60, d.y));
}
// a cheap stand-in for the void's gradient (dull reflections, the bands)
vec3 or_grad(float y) { return mix(mix(vec3(0.20, 0.050, 0.020), vec3(0.24, 0.010, 0.030), uK.x), mix(vec3(0.006, 0.008, 0.075), vec3(0.020, 0.002, 0.030), uK.x), sat(y * 1.4 + 0.15)) * (1.0 + 1.4 * sat(-y * 1.8)); }
// what the chrome sees: the void, a bright horizon, two studio strips, the athanor's fire, its own ring
vec3 or_env(vec3 r, vec3 c, vec3 ringN) {
  vec3 col = or_void(r) * 1.3;
  vec3 hor = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.25, 0.10), uK.x);
  col += hor * 1.1 * exp(-abs(r.y + 0.02) * 26.0);
  float strip = smoothstep(0.13, 0.07, abs(dot(r, vec3(-0.78, 0.0, 0.62)))) * step(0.0, dot(r, vec3(0.62, 0.0, 0.78))) * smoothstep(0.02, 0.15, r.y) * smoothstep(0.8, 0.55, r.y);
  col += vec3(2.4, 2.2, 2.0) * strip + vec3(0.7, 0.6, 0.5) * smoothstep(0.05, 0.02, abs(r.y - 0.88));
  float fdt = dot(r, normalize(vec3(0.0, 0.1, 0.0) - c));
  float fg = exp((fdt - 1.0) * 2.5);
  col += vec3(2.8, 1.4, 0.35) * fg * fg * fg * fg * fg * fg + vec3(0.7, 0.28, 0.05) * fg;
  col += OR_GOLD * 1.8 * (1.0 - smoothstep(0.010, 0.028, abs(dot(r, ringN))));
  return col;
}

// ---- the thief, seen in the chrome: a hooded figure (head and shoulders) behind the viewer, wearing
// its planet's lacquer mask (q: angle units round the direction behind the camera; k = the planet).
// The headpiece (hood peak, crown, horns, jewel, wings, crescent horns) is one mirrored tapered stroke
// plus a crown band, from the table. burn 0..1 dissolves it from the top along a white-hot front.
vec4 or_mask(vec2 q, int k, float burn, float e) {
  float fig = smin(sdEllipse(q - vec2(0.0, 0.08), vec2(0.58, 0.72)), sdEllipse(q - vec2(0.0, -1.10), vec2(1.35, 0.66)), 0.30);
  float face = sdEllipse(q - vec2(0.0, -0.02), vec2(0.36, 0.48));
  vec2 a = vec2(abs(q.x), q.y);
  vec4 h0 = uTab[OR_T_HP + 2 * k], h1 = uTab[OR_T_HP + 2 * k + 1];
  float hp = sdTaper(a, h0.xy, h0.zw, h1.x, h1.y);
  hp = min(hp, h1.z > 0.5 ? max(sdBox(q - vec2(0.0, 0.50), vec2(0.30, 0.10)), q.y - 0.56 - 0.52 * abs(fract(q.x * 3.3 + 0.5) - 0.5)) : 1e3);
  float mk = min(face, hp);
  float cs = cos(h1.w), sn = sin(h1.w);
  vec2 qe = vec2(a.x - 0.15, q.y - 0.06);
  qe = vec2(cs * qe.x - sn * qe.y, sn * qe.x + cs * qe.y);
  float eye = sdVesica(qe.yx, 0.048, 0.11);
  float holes = min(eye, sdSegment(q, vec2(-0.09, -0.29), vec2(0.09, -0.29)) - 0.013);
  // dissolve from the top
  float s = 0.62 * (0.75 - q.y) / 1.9 + 0.38 * (0.5 + 0.25 * sin(q.x * 9.0 + float(k) * 3.7 + 2.0 * sin(q.y * 6.0)) + 0.25 * sin(q.y * 11.0 - q.x * 5.0));
  float alive = smoothstep(burn - 0.03, burn + 0.03, s);
  float inF = or_fl(fig, e), inM = or_fl(mk, e) * (1.0 - or_fl(holes, e)), inFace = or_fl(face, e);
  vec3 col = vec3(0.010, 0.007, 0.012) + OR_GOLD * 0.9 * or_ln(fig, 0.5 * e, e);
  vec3 lac = uTab[OR_T_MC + k].rgb * (0.55 + 0.6 * smoothstep(-0.45, 0.35, q.y)) + vec3(0.21, 0.17, 0.14) * smoothstep(0.10, 0.0, abs(q.y - 0.24));
  col = mix(col, lac, inM) + OR_GOLD * (1.2 * or_ln(mk, 0.5 * e, e) + 0.8 * or_ln(holes, 0.4 * e, e) * inFace);
  // the thief's eyes glint in the holes
  col += vec3(2.4, 0.55, 0.10) * or_fl(length(vec2(a.x - 0.15, q.y - 0.06)) - 0.026, e) * or_fl(eye, e);
  float burnEdge = smoothstep(0.035, 0.0, abs(s - burn)) * step(0.001, burn) * max(inF, inM);
  return vec4(col + OR_HOT * 2.5 * burnEdge, sat(max(inF, inM) * alive + burnEdge * (1.0 - burn)));
}

// ---- alchemical glyphs (rubedo's glyph set, with Saturn and Jupiter added): k = the planet.
// Each: a circle or half circle (table: centre, radius, kind 0 full / 1 upper half / 2 right half) and
// four segments, plus the moon's crescent, mercury's horns and the sun's dot.
float or_glyph(vec2 p, int k, float e) {
  vec4 c = uTab[OR_T_GC + k];
  vec2 pc = p - c.xy;
  float dc = abs(length(pc) - c.z);
  vec2 ax = c.w == 1.0 ? vec2(c.z, 0.0) : vec2(0.0, c.z);
  float endD = min(length(pc - ax), length(pc + ax));
  dc = (c.w == 1.0 && pc.y < 0.0) || (c.w == 2.0 && pc.x < 0.0) ? endD : dc;
  float d = c.z > 0.0 ? dc : 1e3;
  d = k == 5 ? abs(max(length(p) - 0.58, -(length(p - vec2(0.26, 0.10)) - 0.50))) : d;
  d = k == 6 ? min(d, length(p) - 0.10) : d;
  d = k == 4 ? min(d, abs(length(p - vec2(0.0, 0.62)) - 0.26) + step(0.62, p.y) * 1e3) : d;
  for (int j = 0; j < 4; j++) { vec4 sg = uTab[OR_T_GS + k * 4 + j]; d = min(d, sdSegment(p, sg.xy, sg.zw)); }
  return or_ln(d, 0.06 + 0.5 * e, e);
}

// ---- roman numerals I..XII on the ring bands: chars packed 2 bits each (1 I, 2 V, 3 X), first char high
float or_roman(vec2 q, int n, float e) {
  // q: char-height units (char height 1), centred on the numeral
  int len = int(uTab[OR_T_RN + n].y);
  float w = 0.62;
  float x = q.x + 0.5 * w * float(len);
  int j = int(floor(x / w));
  int code = (int(uTab[OR_T_RN + n].x) >> (2 * max(len - 1 - j, 0))) & 3;
  vec2 c = vec2(x - (float(j) + 0.5) * w, q.y);
  // I: the stem; V: two diagonals from the foot (mirrored); X: four arms from the centre (mirrored twice)
  float d = code == 1 ? sdSegment(c, vec2(0.0, -0.5), vec2(0.0, 0.5))
          : code == 2 ? sdSegment(vec2(abs(c.x), c.y), vec2(0.0, -0.5), vec2(0.24, 0.5))
          : sdSegment(abs(c), vec2(0.0), vec2(0.24, 0.5));
  return or_ln(d, 0.07 + 0.5 * e, e) * step(0.0, x) * step(x, w * float(len));
}

// ---- the athanor: a stepped furnace with the eye in the triangle and five flame tongues (2D, billboard)
vec4 or_athanor(vec2 q, float e, float tt) {
  vec2 qs = vec2(q.x, q.y + 0.27);
  float d = min(sdBox(qs - vec2(0.0, -0.15), vec2(0.34, 0.075)), min(sdBox(qs, vec2(0.25, 0.075)), sdBox(qs - vec2(0.0, 0.15), vec2(0.16, 0.075))));
  float mouth = min(sdBox(q - vec2(0.0, -0.31), vec2(0.06, 0.035)), length(q - vec2(0.0, -0.276)) - 0.06);
  float tri = sdTriangle(q - vec2(0.0, 0.10), 0.15);
  vec3 col = vec3(0.035, 0.016, 0.008);
  // brick courses and the step edges, fine gold linework
  col += OR_GOLD * 0.55 * or_iso(q.y / 0.025, e / 0.025, 0.5, 0.0) * step(d, 0.0);
  col += OR_GOLD * 1.6 * or_ln(d, 0.6 * e, e);
  // fire in the mouth
  col = mix(col, mix(vec3(3.0, 1.4, 0.3), vec3(1.2, 0.2, 0.03), smoothstep(-0.31, -0.24, q.y)), or_fl(mouth, e));
  // triangle with the eye
  float ft = or_fl(tri, e), lt = or_ln(tri, 0.7 * e, e);
  vec2 qe = q - vec2(0.0, 0.085);
  vec3 tc = vec3(0.05, 0.02, 0.01) + OR_HOT * 1.6 * or_ln(sdVesica(qe.yx, 0.035, 0.075), 0.5 * e, e) + vec3(2.5, 1.2, 0.3) * or_fl(length(qe) - 0.018, e);
  col = mix(col, tc, ft) + OR_GOLD * 1.8 * lt;
  // five flame tongues above the triangle: one evaluation, x folded into the nearest tongue's cell
  float fj = clamp(floor(q.x / 0.055 + 0.5), -2.0, 2.0);
  float fd = or_flameD(q - vec2(fj * 0.055, 0.22 - 0.03 * abs(fj)), 0.022, 0.20 - 0.04 * abs(fj), tt, fj, 1.0);
  float ff = or_fl(fd, e);
  col = mix(col, mix(vec3(3.2, 1.8, 0.5), vec3(1.4, 0.25, 0.04), smoothstep(0.2, 0.42, q.y)), ff);
  return vec4(col, max(max(or_fl(d, e), ft), max(ff, lt)));
}

// ---- the medallion: dark ultramarine disc, double gold rim, the glyph (flares at the transmutation)
vec4 or_medal(vec2 q, float e, float flare, float glyph) {
  float r = length(q);
  float disc = or_fl(r - 1.0, e), rim = or_ln(r - 1.0, 0.9 * e, e);
  vec3 col = mix(vec3(0.012, 0.018, 0.14), vec3(0.06, 0.0, 0.03), r) * disc;
  col += OR_GOLD * 1.5 * (rim + 0.7 * or_ln(r - 0.84, 0.6 * e, e));
  col += mix(OR_GOLD * 1.8, OR_HOT * 4.0, flare) * glyph * disc;
  return vec4(col, max(disc, rim));
}

void main() {
  vec2 uv = uvCentered(gl_FragCoord.xy);
  float e = px();
  vec3 rd = normalize(uCam * vec3(uv, uF));
  float pa = e / uF;                       // one pixel, as an angle
  float motPx = uK.z / e;                  // screen motion in pixels per frame (anti-strobe)
  float tt = uTime;
  vec3 amb = mix(vec3(1.0, 0.40, 0.06), vec3(1.0, 0.10, 0.05), uK.x);
  vec3 lineC = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.28, 0.14), uK.x);

  // ======== background: the void and the zodiac band in the sky
  vec3 col = or_void(rd);
  {
    vec3 zn = vec3(0.0, 0.917, 0.398);
    float b = dot(rd, zn);
    float za = atan(rd.z * 0.917 - rd.y * 0.398, rd.x) / TAU;
    float inB = step(abs(b), 0.060);
    float zl = or_ln(abs(b) - 0.075, 0.5 * pa, pa) + 0.6 * or_ln(abs(b) - 0.060, 0.4 * pa, pa)
             + 0.6 * or_iso(za * 72.0, pa / TAU * 72.0, 0.45, motPx) * inB * step(0.035, abs(b))
             + or_iso(za * 12.0, pa / TAU * 12.0, 0.6, motPx) * inB;
    col += mix(OR_GOLD, vec3(1.0, 0.3, 0.15), uK.x) * zl * 0.30;
  }
  // the athanor's light (a glow and the Tarot XIX rays, straight and wavy alternating) and, round the
  // same centre, X THE WHEEL OF FORTUNE: rims, 72 ticks, eight spokes and T A R O, turning a notch per kick
  {
    vec2 d = uv - uSc[7].xy;
    float r = length(d), a0 = atan(d.y, d.x);
    float ra = (a0 + 0.05 * tt) * 24.0 / TAU;
    float id = floor(ra + 0.5), wv = mod(id, 2.0);
    float rx = abs(fract(ra + 0.5) - 0.5 + wv * 0.035 * (abs(fract(r * 1.1 - tt * 0.3) - 0.5) * 4.0 - 1.0));
    float rays = smoothstep(0.16, 0.0, rx) * (0.55 + 0.45 * wv) + 0.25 * smoothstep(0.45, 0.0, rx);
    float g1 = exp(-r * 0.5);
    col += amb * (0.30 * rays * g1 + 0.25 * g1 * g1 * g1 * (1.0 + 2.2 * g1 * g1 * g1)) * uSc[7].w;
    // the wheel
    float rw = r / uWh.x, aw = a0 + uWh.y, ew = e / uWh.x;
    float wl = or_ln(rw - 1.0, 0.6 * ew, ew) + or_ln(rw - 0.955, 0.4 * ew, ew) + 0.8 * or_ln(rw - 0.66, 0.5 * ew, ew) + 0.6 * or_ln(rw - 0.20, 0.5 * ew, ew);
    wl += 0.8 * or_iso(aw / TAU * 72.0, ew / max(rw, 0.05) / TAU * 72.0, 0.45, motPx) * step(0.955, rw) * step(rw, 1.0);
    wl += 0.7 * or_ln(abs(fract(aw / TAU * 8.0 + 0.5) - 0.5) / 8.0 * TAU * rw, 0.5 * ew, ew) * step(0.20, rw) * step(rw, 0.955);
    float sa = aw / TAU * 4.0, sr = floor(sa + 0.5);
    float li = mod(sr, 4.0);
    vec2 lq = vec2((sa - sr) / 4.0 * TAU * 0.81, rw - 0.81) / 0.075;
    float ld = 1e3;
    for (int j = 0; j < 4; j++) { vec4 sg = uTab[OR_T_TARO + int(li) * 4 + j]; ld = min(ld, sdSegment(lq, sg.xy, sg.zw)); }
    ld = li == 3.0 ? abs(length(lq * vec2(1.3, 1.0)) - 0.5) : ld;
    wl += 1.2 * or_ln(ld, 0.09 + 0.5 * ew / 0.075, ew / 0.075) * step(0.70, rw) * step(rw, 0.92);
    col += lineC * wl * uWh.z;
  }
  // Sol: the socket's bezel and claws until it ignites, then sixteen XIX rays; the eclipse corona
  {
    vec2 d = uv - uSc[6].xy;
    float R = max(uSc[6].z, 1e-3), on6 = uSd[6].w;
    float rr = length(d) / R, a = atan(d.y, d.x), er = e / R;
    float ign = uSun.x;
    vec3 bez = OR_GOLD * 1.5 * (or_ln(rr - 1.03, 0.035, er) + 0.6 * or_ln(rr - 1.10, 0.015, er)) * (1.0 - ign);   // the empty setting
    float w = TAU / 16.0, aa = a - uSun.y;
    float idr = floor(aa / w + 0.5), la = aa - idr * w;
    vec2 qp = rr * vec2(la, 1.0 - 0.5 * la * la);          // sin, cos of the small angle la
    float wavy = mod(idr, 2.0), L = mix(1.25, 0.95, wavy);
    float v = (qp.y - 0.95) / L;
    float wob = wavy * 0.10 * (abs(fract(v * 2.2 - tt * 1.5 + idr * 0.37) - 0.5) * 4.0 - 1.0) * v;
    float rf = or_fl(max(abs(qp.x - wob) - mix(0.17, 0.12, wavy) * (1.0 - v) * (0.4 + 1.2 * sqrt(sat(v))), max(-v, v - 1.0) * L) * 0.7, er);
    vec3 rays = mix(vec3(3.0, 1.9, 0.6), mix(vec3(1.7, 0.45, 0.06), vec3(1.4, 0.10, 0.10), wavy), sat((qp.y - 1.0) / L)) * rf;
    rays += vec3(0.96, 0.4, 0.08) * exp(-max(rr - 1.0, 0.0) * 1.6);
    col += (rays * ign * smoothstep(0.98, 1.02, rr) + bez) * on6;
    // eclipse corona: a thin bright ring and streamers round the silhouette
    float st = 0.55 + 0.45 * (hash11(idr + 3.0) * 2.0 - 1.0) * (1.0 - abs(la / w) * 2.0);
    float cor = exp(-max(rr - 1.0, 0.0) / (0.10 + 0.35 * st)) * smoothstep(0.92, 1.0, rr);
    col += (vec3(3.3, 3.15, 3.0) * or_ln(rr - 1.0, 0.04, er) + vec3(1.4, 1.1, 0.8) * cor) * uSun.z * on6;
  }

  // the syzygy: a beam of light along the line of planets, flaring as they land on it
  {
    float ld = sdSegment(uv, uLine.xy, uLine.zw);
    col += (OR_HOT * 2.0 * or_ln(ld, 0.8 * e, e) + amb * 0.9 * exp(-ld / 0.035)) * uSun.w;
  }

  // ======== spheres: their outlines on screen (exact ellipses from JS); the frontmost gets the one
  // shading; the same distances draw the energy fields, fine contour lines round every sphere (Alex Grey)
  float sZ = 1e9, sA = 0.0, dm = 1e3; int si = 0;
  float fwd = max(dot(rd, uCam[2]), 1e-3);
  for (int k = 0; k < int(uN.x); k++) {
    int i = int(uSI[k]);
    vec4 sc = uSc[i], sd = uSd[i];
    vec2 q = uv - sc.xy;
    float d = length(vec2(q.x * sd.y - q.y * sd.x, dot(q, sd.xy)) / sc.zw);
    float cov = sat((1.0 - d) * sc.z / (2.0 * e) + 0.5) * sd.w;
    dm = min(dm, sd.w > 0.0 ? d - 1.0 : 1e3);
    bool front = cov > 0.01 && sd.z < sZ;
    sZ = front ? sd.z : sZ; sA = front ? cov : sA; si = front ? i : si;
  }
  col += lineC * 0.30 * or_iso(dm * 7.0, fwidth(dm) * 7.0, 0.5, motPx) * step(0.0, dm) * exp(-dm * 2.2);
  vec4 po = uPO[si];
  float pb = dot(po.xyz, rd);
  float ts = -pb - sqrt(max(pb * pb - po.w + uPl[si].w * uPl[si].w, 0.0));
  vec3 sC;
  {
    vec3 c = uPl[si].xyz;
    vec3 n = normalize(uRo + rd * ts - c);
    float fl = uPS[si].x;
    // quicksilver ripples (they settle into a slow molten swell once it is gold)
    vec3 pole = vec3(0.285, 0.949, 0.190);
    float cp = dot(n, pole);
    float th = or_acos(cp);
    float rip = sin(th * 26.0 - tt * 6.0) * (1.0 - 0.25 * th) * (si == 4 ? mix(0.06, 0.015, fl) : 0.0);
    vec3 nr = normalize(n - (pole - n * cp) * rip / max(sqrt(max(1.0 - cp * cp, 0.0)), 0.05));
    vec3 r = reflect(rd, nr);
    vec3 env = or_env(r, c, uRg[si].xyz);
    // the thief in the chrome, standing behind the camera
    vec3 m = normalize(normalize(uRo - c) + vec3(0.0, 0.20, 0.0));
    vec3 mr = normalize(uCam[0] - m * dot(uCam[0], m));
    vec2 mq = vec2(dot(r, mr), dot(r, cross(m, mr))) / max(1.0 + dot(r, m), 0.05) * 1.25;
    float mpe = 2.0 * pa * ts / uPl[si].w;
    vec4 mk = vec4(0.0);
    for (int g = 0; g < int(uG.x); g++) mk = or_mask(mq, si < 6 ? si : 0, 1.0 - uPS[si].z, mpe);
    env = mix(env, mk.rgb, mk.a * step(0.001, uPS[si].z) * step(float(si), 5.5));
    // the base metal: tint, dullness (lead, iron), tarnish and rust
    vec4 tn = uTab[OR_T_TINT + si];
    vec3 envD = or_grad(n.y) * 1.2 + vec3(0.45, 0.20, 0.05) * max(-dot(n, c), 0.0) * inversesqrt(dot(c, c));
    vec3 base = mix(env, envD, tn.w) * tn.rgb;
    float nz = vnoise(n.xy * 6.0 + n.z * 2.0 + float(si) * 5.1);
    base *= 1.0 - (si == 0 ? 0.40 : 0.0) * nz;
    base = si == 2 ? mix(base, vec3(0.42, 0.12, 0.03) * (envD + 0.25), smoothstep(0.42, 0.72, nz)) : base;
    // the gold flood from the top: a wavy liquid front with a white-hot edge
    float act = step(0.001, fl) * step(fl, 0.999);
    float fy = mix(-0.15, PI + 0.15, fl);
    float gy = or_acos(n.y) + (0.08 * sin(dot(n.xz, vec2(7.0, 4.0)) + tt * 5.0)) * act;
    float g = smoothstep(gy - 0.035, gy + 0.035, fy);
    float edge = smoothstep(0.09, 0.0, abs(gy - fy)) * act;
    vec3 gold = env * OR_AU * (0.92 + 0.10 * sin(n.y * 16.0 - tt * 2.5));
    vec3 mc = mix(base, gold, g) + OR_HOT * mix(1.6, 0.7, uReduced) * edge;
    float fr = 1.0 - max(dot(-rd, n), 0.0);
    fr *= fr; fr *= fr;
    mc = mix(mc, env * mix(vec3(0.9), OR_AU, g), fr * 0.45);
    float sp = max(dot(r, vec3(-0.40, 0.75, -0.53)), 0.0);
    sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp; sp *= sp;
    mc += vec3(3.2, 2.4, 1.6) * sp;
    // Sol: the empty black socket; ignited, a white-hot sun with a Marseille face
    vec2 dq = vec2(dot(n, uCam[0]), dot(n, uCam[1]));
    float rq = length(dq), ign = uSun.x;
    float front = 1.0 - 1.15 * ign, iact = step(0.001, ign) * step(ign, 0.999);
    vec2 af = vec2(abs(dq.x), dq.y);
    float le = mpe * 0.5;
    float lines = 1e3;
    for (int g = 0; g < int(uG.w); g++) lines = min(abs(sdVesica(vec2(af.y - 0.18, af.x - 0.34), 0.07, 0.17)), abs(length(dq - vec2(0.0, -0.05)) - 0.36) + (step(-0.30, dq.y) + step(0.28, abs(dq.x))) * 1e3);
    vec3 sun = mix(vec3(2.8, 2.4, 1.7), vec3(2.0, 1.0, 0.25), smoothstep(0.2, 1.0, rq));
    sun = mix(sun, vec3(1.3, 0.35, 0.05), or_ln(lines, 0.02 + le, le) * 0.6) + OR_HOT * 4.0 * smoothstep(0.08, 0.0, abs(rq - front)) * iact;
    vec3 sock = vec3(0.004, 0.003, 0.004) + vec3(0.15, 0.07, 0.025) * rq * rq * rq * rq * rq * rq;
    sC = si == 6 ? mix(sock, sun, smoothstep(front - 0.06, front + 0.02, rq) * step(0.001, ign)) : mc;
  }

  // ======== rings: the frontmost band part gets the full shading, the others are drawn flat beneath
  float tr = 1e9, rA = 0.0, rv = 0.0; int ri = 0;
  for (int k = 0; k < int(uN.y); k++) {
    int i = int(uRI[k]);
    vec4 rg = uRg[i], ro = uRO[i];          // normal, band half height k; camera offset from the axis, its |.|^2 - R^2
    float on = uRH[i], dn = dot(rd, rg.xyz);
    float a = max(1.0 - dn * dn, 1e-6), b = dot(ro.xyz, rd);
    float h = b * b - a * ro.w;
    float sh = sqrt(max(h, 0.0)), ia = 1.0 / a;
    float fy2 = 0.5 * inversesqrt(a) * pa;   // half the band height per pixel, per unit of distance
    float tN = (-b - sh) * ia, tF = (-b + sh) * ia;
    float yN = on + tN * dn, yF = on + tF * dn;
    // coverage of the near and the far crossing: a linear ramp a pixel wide across the band's edges
    float cN = sat((rg.w - abs(yN)) / max(tN * fy2 * 2.0, 1e-5) + 0.5) * step(0.0, tN);
    float cF = sat((rg.w - abs(yF)) / max(tF * fy2 * 2.0, 1e-5) + 0.5) * step(0.0, tF);
    cN *= step(0.0, h); cF *= step(0.0, h);
    bool useN = cN > 0.02;
    float t = useN ? tN : tF, cov = useN ? cN : cF;
    bool front = cov > 0.02 && t < tr;
    tr = front ? t : tr; rA = front ? cov : rA; ri = front ? i : ri; rv = front ? (useN ? yN : yF) / rg.w : rv;
  }
  vec3 rC;
  {
    vec3 N = uRg[ri].xyz, E1 = uRE[ri].xyz;
    float R = uRR[ri];
    vec3 p = uRo + rd * min(tr, 1e4);
    float ang = atan(dot(p, cross(N, E1)), dot(p, E1));
    float u = ang / TAU;
    float fu = min(fwidth(u), fwidth(fract(u + 0.5)));
    float fv = max(fwidth(rv), 1e-4);
    vec3 rad = normalize(p - N * dot(p, N));
    vec3 refl = reflect(rd, rad * -sign(dot(rd, rad)));
    float hz = sat(1.0 - abs(refl.y) * 9.0);
    vec3 base = (or_grad(refl.y) * 1.1 + vec3(0.5, 0.26, 0.07) * hz * hz) * OR_AU * 0.7 + OR_GOLD * 0.03;
    base *= 0.45 + 0.55 * rv * rv;                                            // rounded edges, a darker field
    // the gold light that ran round the ring after its planet's transmutation
    vec4 rp = uRP[ri];
    float da = mod(ang - uRE[ri].w, TAU);
    float lit = smoothstep(0.03, 0.0, da - rp.x);
    float head = rp.y * (smoothstep(0.07, 0.0, abs(rp.x - da)) + 0.4 * step(da, rp.x) * smoothstep(rp.x - 1.2, rp.x, da));
    // engraving: 72 ticks, 12 sector lines, roman numerals; band borders
    float av = abs(rv);
    float minor = or_iso(u * 72.0, fu * 72.0, 0.5, motPx) * step(0.45, av) * step(av, 0.80);
    float major = or_iso(u * 12.0, fu * 12.0, 0.6, motPx) * step(av, 0.80);
    float border = or_ln(av - 0.86, 0.5 * fv, fv);
    float kk = uRg[ri].w, chH = 0.62 * kk;
    float cpe = max(fu * TAU * R, fv * kk) / chH;
    float uc = (fract(u * 12.0) - 0.5) / 12.0 * TAU * R;
    float num = 0.0;
    for (int g = 0; g < int(uG.y); g++) num = or_roman(vec2(uc, rv * kk) / chH, int(mod(floor(u * 12.0 + 12.0), 12.0)), cpe)
              * step(cpe, 0.35) * step(av, 0.5) * moAntiStrobe(motPx * fu * TAU * R / chH * 0.5);
    float eng = max(max(minor * 0.7, major), max(border, num));
    vec3 glow = mix(OR_GOLD * 1.2, OR_GOLD * 1.8 + OR_HOT * 0.3, lit) * (1.0 + 0.15 * rp.w);
    rC = base * (1.0 + 0.4 * lit) + OR_GOLD * 0.22 * lit + glow * eng * (0.55 + 0.45 * lit) + OR_HOT * 1.1 * head;
    rC += OR_HOT * 1.2 * rp.z * border * sat(1.0 - abs(fract(u * 3.0 + 0.1 * float(ri)) - 0.5) * 12.0);   // open hats glint the rims
  }

  // ======== glyph medallions: discs facing the camera's axis, exact circles on screen
  float tm = 1e9, mA = 0.0, me = 0.0; int mi = 0; vec2 mqv = vec2(0.0);
  for (int k = 0; k < int(uN.z); k++) {
    int i = int(uMI[k]);
    vec4 ms = uMd[i];
    vec2 q = (uv - ms.xy) / max(ms.z, 1e-4);
    float ep = e / max(ms.z, 1e-4);
    float cov = or_fl(length(q) - 1.0 - ep, ep) * step(0.0, ms.w);
    float t = ms.w / fwd;
    bool front = cov > 0.02 && t < tm;
    tm = front ? t : tm; mA = front ? cov : mA; mi = front ? i : mi; mqv = front ? q : mqv; me = front ? ep : me;
  }
  // the glyph when it is big enough to read, else a bright point
  float gl = or_fl(length(mqv) - 0.30, me) * 0.6;
  for (int g = 0; g < int(uG.z); g++) gl = or_glyph(mqv / 0.68, mi, me / 0.68);
  vec4 mC = or_medal(mqv, me, uPS[mi].y, gl);
  mA *= mC.a;

  // ======== the athanor at the centre (billboard)
  float ta = -dot(uRo, uCam[2]) / fwd;
  vec3 pa3 = uRo + rd * ta;
  vec2 aq = vec2(dot(pa3, uCam[0]), dot(pa3, uCam[1])) / uK.w;
  vec4 aC = or_athanor(aq, max(ta, 1e-3) * pa / uK.w, tt);

  // ======== composite, back to front: the flat rings, then the four layers sorted by depth
  // a five-comparator sorting network, farthest first (plain variables: indexed local arrays are slow)
  // in a fast camera move (the pull back) the bright bands and the furnace sweeping past calm down to
  // about half their contrast, so no pixel flips more than about twice a second (spec 7.3 rule 1)
  float calm = 1.0 - uWh.w;
  vec4 c0 = vec4(sC, sA), c1 = vec4(mix(col, rC, calm), rA), c2 = vec4(mC.rgb, mA), c3 = vec4(mix(col, aC.rgb, calm), aC.a * step(0.0, ta));
  float z0 = ts, z1 = tr, z2 = tm, z3 = ta;
  OR_CSWAP(c0, z0, c1, z1); OR_CSWAP(c2, z2, c3, z3); OR_CSWAP(c0, z0, c2, z2); OR_CSWAP(c1, z1, c3, z3); OR_CSWAP(c1, z1, c2, z2);
  col = mix(col, c0.rgb, sat(c0.a)); col = mix(col, c1.rgb, sat(c1.a)); col = mix(col, c2.rgb, sat(c2.a)); col = mix(col, c3.rgb, sat(c3.a));

  col *= uK.y;
  col += (hash21(gl_FragCoord.xy + fract(tt) * 91.0) - 0.5) / 255.0;    // dither the dark gradients
  fragColor = vec4(max(col, 0.0), 1.0);
}`;

  // GLSL lookup tables (uTab): see the shader's uniform block for the layout
  const G9 = [9, 9, 9, 9];
  const TAB = new Float32Array([
    // T A R O strokes
    -0.38, 0.5, 0.38, 0.5, 0.0, 0.5, 0.0, -0.5, ...G9, ...G9,
    -0.36, -0.5, 0.0, 0.5, 0.0, 0.5, 0.36, -0.5, -0.19, -0.06, 0.19, -0.06, ...G9,
    -0.30, -0.5, -0.30, 0.5, -0.30, 0.5, 0.22, 0.32, 0.22, 0.32, -0.30, 0.02, -0.05, 0.02, 0.32, -0.5,
    ...G9, ...G9, ...G9, ...G9,
    // glyph strokes: Saturn, Jupiter, Mars, Venus, Mercury, Luna, Sol (four each)
    -0.18, 0.78, -0.18, -0.02, -0.42, 0.52, 0.06, 0.52, 0.30, -0.02, 0.14, -0.50, 0.14, -0.50, 0.40, -0.74,
    -0.48, -0.18, 0.52, -0.18, 0.26, 0.30, 0.26, -0.76, -0.14, 0.03, -0.48, -0.18, -0.14, 0.57, -0.36, 0.46,
    0.14, 0.14, 0.55, 0.55, 0.55, 0.55, 0.22, 0.55, 0.55, 0.55, 0.55, 0.22, ...G9,
    0.0, -0.11, 0.0, -0.78, -0.25, -0.45, 0.25, -0.45, ...G9, ...G9,
    0.0, -0.18, 0.0, -0.75, -0.22, -0.48, 0.22, -0.48, ...G9, ...G9,
    ...G9, ...G9, ...G9, ...G9,
    ...G9, ...G9, ...G9, ...G9,
    // glyph circles: centre, radius, kind (0 full, 1 upper half, 2 right half)
    0.06, -0.02, 0.24, 1, -0.14, 0.30, 0.27, 2, -0.12, -0.12, 0.36, 0, 0.0, 0.22, 0.33, 0, 0.0, 0.12, 0.30, 0, 0, 0, 0, 0, 0.0, 0.0, 0.55, 0,
    // metal tint and dullness: lead, tin, iron, copper, quicksilver, silver, the socket
    0.50, 0.52, 0.58, 0.62, 0.88, 0.90, 0.96, 0.20, 0.72, 0.44, 0.34, 0.42, 1.06, 0.58, 0.44, 0.08,
    1.00, 1.00, 1.00, 0.0, 0.95, 0.98, 1.06, 0.03, 0.0, 0.0, 0.0, 0.0,
    // the thieves' lacquer masks
    0.40, 0.42, 0.47, 0, 0.86, 0.80, 0.64, 0, 0.62, 0.10, 0.05, 0, 0.90, 0.48, 0.38, 0, 0.80, 0.85, 0.92, 0, 0.90, 0.92, 0.98, 0,
    // roman numerals I..XII: chars 2 bits each (1 I, 2 V, 3 X), first char high; length
    1, 1, 0, 0, 5, 2, 0, 0, 21, 3, 0, 0, 6, 2, 0, 0, 2, 1, 0, 0, 9, 2, 0, 0, 37, 3, 0, 0, 149, 4, 0, 0,
    7, 2, 0, 0, 3, 1, 0, 0, 13, 2, 0, 0, 53, 3, 0, 0,
    // the masks' headpieces: a mirrored tapered stroke (from x y, to x y), its radii, crown band on/off, eye tilt
    0.12, 0.62, 0.0, 0.92, 0.07, 0.0, 0, -0.18,          // Saturn: the hood's peak
    9.0, 9.0, 9.0, 9.01, 0.0, 0.0, 1, -0.18,             // Jupiter: the crown
    0.22, 0.36, 0.48, 0.80, 0.07, 0.0, 0, -0.35,         // Mars: horns
    0.0, 0.33, 0.0, 0.335, 0.055, 0.055, 0, 0.12,        // Venus: a jewel on the brow
    0.33, 0.22, 0.66, 0.48, 0.06, 0.008, 0, -0.18,       // Mercury: wings
    0.10, 0.46, 0.30, 0.74, 0.05, 0.0, 0, -0.18,         // Luna: the crescent's horns
  ]);
  if (TAB.length !== 88 * 4) console.error('orrery: uTab has ' + TAB.length / 4 + ' entries, expected 88');

  // ------------------------------------------------------------------ JS geometry
  // the seven planets in score order (S.chakras: 0 Saturn .. 6 Sol). Ring radius R, sphere radius r,
  // ring inclination and node (degrees), starting phase (degrees) and the clockwork notch per kick.
  // Ptolemaic order from the centre: Luna, Mercury, Venus, Sol, Mars, Jupiter, Saturn.
  const PL = [
    { id: 'saturn',  R: 2.20, r: 0.150, inc: 16,  node: 200, ph: 30,  notch: 2.0 },
    { id: 'jupiter', R: 1.90, r: 0.160, inc: -24, node: 70,  ph: 150, notch: 2.5 },
    { id: 'mars',    R: 1.62, r: 0.125, inc: 31,  node: 320, ph: 260, notch: 3.0 },
    { id: 'venus',   R: 1.10, r: 0.125, inc: -18, node: 140, ph: 80,  notch: 4.0 },
    { id: 'mercury', R: 0.86, r: 0.105, inc: 26,  node: 20,  ph: 200, notch: 5.0 },
    { id: 'luna',    R: 0.62, r: 0.110, inc: 9,   node: 250, ph: 310, notch: 6.0 },
    { id: 'sol',     R: 1.36, r: 0.170, inc: 6,   node: 100, ph: 0,   notch: 3.5 },
  ];
  const ALIAS = { lead: 'saturn', tin: 'jupiter', iron: 'mars', copper: 'venus', quicksilver: 'mercury', silver: 'luna', moon: 'luna', sun: 'sol', gold: 'sol' };
  const SIDE = [1, -1, 1, -1, 1, -1, 1];   // syzygy: which side of the athanor each planet lines up on
  // MATCH POINT (shared with hermit.lantern, spec 4.1 rule 9): at the end of the 'all' pull back
  // (78.5 -> 79.1) Sol's centre sits on this screen point, where hermit.lantern's strike puts the
  // lightning's white core on the tower's finial. uvCentered units (frame centre (0, 0), y up, the frame
  // 2 high, x within +-16/9): (0, 0.40) = frame fractions (0.5, 0.30) = pixel (960, 324) at 1080p.
  // hermit.js owns the constant (MO.MATCH_SOL_TOWER, read here when the factory runs); these are the
  // same numbers, used if it is absent.
  const SOL_MATCH = [0.0, 0.40];
  const solMatch = () => (Array.isArray(MO.MATCH_SOL_TOWER) && MO.MATCH_SOL_TOWER.length === 2 ? MO.MATCH_SOL_TOWER.map(Number) : SOL_MATCH);

  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.sqrt(dot(a, a));
  const norm = (a) => mul(a, 1 / Math.max(len(a), 1e-9));
  const rotV = (x, k, th) => add(add(mul(x, Math.cos(th)), mul(cross(k, x), Math.sin(th))), mul(k, dot(k, x) * (1 - Math.cos(th))));
  const wrap = (a) => a - TAU * Math.round(a / TAU);
  // camera basis [right, up, forward] whose ray through screen point P (frame units) hits the target
  const camAt = (C, T, P, F) => {
    const f = norm(sub(T, C)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
    const v = norm([P[0], P[1], F]), ax = cross(v, [0, 0, 1]), s = len(ax), c = v[2];
    let cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (s > 1e-7) { const k = mul(ax, 1 / s), th = Math.atan2(s, c); cols = cols.map((w) => rotV(w, k, th)); }
    return cols.map((w) => add(add(mul(r, w[0]), mul(u, w[1])), mul(f, w[2])));
  };
  const project = (cam, X, r) => {
    const d = sub(X, cam.C), z = dot(d, cam.B[2]);
    if (z < 0.05) return [0, 0, 0, 0];
    return [dot(d, cam.B[0]) * cam.F / z, dot(d, cam.B[1]) * cam.F / z, r * cam.F / z, 1];
  };
  // a sphere's outline on screen: the projection of its silhouette circle is an ellipse with one axis
  // along the radial direction from the frame centre. Returns centre xy, semi-axes (across, along),
  // radial direction xy, depth along the camera axis, on.
  const sphereEllipse = (cam, c, r) => {
    const off = [0, 0, 1, 1, 1, 0, 1e9, 0];
    const v = sub(c, cam.C), d = len(v);
    if (d <= r * 1.02 || dot(v, cam.B[2]) < r) return off;
    const pc = project(cam, c, r);
    let er = Math.hypot(pc[0], pc[1]) > 1e-4 ? [pc[0], pc[1]] : [0, 1];
    const el = Math.hypot(er[0], er[1]); er = [er[0] / el, er[1] / el];
    const w = mul(v, 1 / d), u1 = norm(cross(w, Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), u2 = cross(w, u1);
    const sc = sub(c, mul(w, r * r / d)), rho = r * Math.sqrt(1 - (r * r) / (d * d));
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
    for (let k = 0; k < 24; k++) {
      const q = project(cam, add(sc, add(mul(u1, rho * Math.cos(k * TAU / 24)), mul(u2, rho * Math.sin(k * TAU / 24)))), 0);
      if (!q[3]) return off;
      const ra = q[0] * er[0] + q[1] * er[1], ta = q[0] * er[1] - q[1] * er[0];
      a0 = Math.min(a0, ra); a1 = Math.max(a1, ra); b0 = Math.min(b0, ta); b1 = Math.max(b1, ta);
    }
    const ra = 0.5 * (a0 + a1), ta = 0.5 * (b0 + b1);
    return [ra * er[0] + ta * er[1], ra * er[1] - ta * er[0], Math.max(0.5 * (b1 - b0), 1e-4), Math.max(0.5 * (a1 - a0), 1e-4), er[0], er[1], dot(v, cam.B[2]), 1];
  };
  // ring frame for inclination i and node w (radians): normal n, in-plane axes e1 (angle 0), e2
  const frame = (inc, node) => {
    const n = [Math.sin(inc) * Math.sin(node), Math.cos(inc), Math.sin(inc) * Math.cos(node)];
    const e1 = [Math.cos(node), 0, -Math.sin(node)];
    return { n, e1, e2: cross(n, e1) };
  };
  // does a ring's band (normal fr.n, radius R) cross the segment from C to X (short of X)?
  const bandBlocks = (C, X, fr, R) => {
    const k = 0.011 + 0.004 * R, n = fr.n, d = sub(X, C), L = len(d), rd = mul(d, 1 / L);
    const on = dot(C, n), dn = dot(rd, n), o2 = sub(C, mul(n, on));
    const a = Math.max(1 - dn * dn, 1e-6), b = dot(o2, rd), c = dot(o2, o2) - R * R, h = b * b - a * c;
    if (h < 0) return false;
    for (const sg of [-1, 1]) { const t = (-b + sg * Math.sqrt(h)) / a; if (t > 0 && t < L - 0.01 && Math.abs(on + t * dn) < k * 1.6) return true; }
    return false;
  };
  const onRing = (fr, R, ph) => add(mul(fr.e1, R * Math.cos(ph)), mul(fr.e2, R * Math.sin(ph)));
  // the clockwork: one notch per kick, an eased 0.12 s move (0.2 s in reduced mode); continuous
  const kickPhase = (t) => {
    const l = MO.last('kick', t);
    if (!l) return 0;
    return l.i + MO.easeOut(MO.clamp((t - l.e.t) / (MO.reduced ? 0.2 : 0.12)));
  };
  const planetName = (v) => { if (typeof v !== 'string') return null; const s = v.toLowerCase(); return ALIAS[s] || s; };

  // ------------------------------------------------------------------ shot orrery.thieves
  // (documented in the header above: state, cameras, match cut, stretch, params, safety, cost)
  // focus exposure [start, end] (the swell into the next downbeat comes in the last 40 % of the cue)
  const FOCUS_EXPO = { saturn: [1.33, 1.73], jupiter: [1.12, 2.15], mars: [1.18, 1.6], venus: [1.31, 1.6], mercury: [1.0, 0.42], luna: [1.0, 1.47], sol: [1, 1] };

  MO.shot('orrery.thieves', (cue) => {
    const K = cueClock(cue, 1000, 1008, 0, 0);
    const P = K.P;
    const red = () => MO.reduced;
    const focus = planetName(P.focus);
    const fi = PL.findIndex((p) => p.id === focus);
    const isAll = focus === 'all';
    const camName = typeof P.cam === 'string' ? P.cam.toLowerCase() : null;
    const mode = fi >= 0 ? 'focus' : camName && ['wide', 'low', 'high'].includes(camName) ? camName : isAll ? 'pull' : 'wide';
    const orbit = K.p('orbit', 0, -720, 720) * D2R;
    const F = 2.4 * K.p('zoom', 1, 0.5, 3);
    const pal = P.palette === 'crimson' ? 1 : 0;
    // exposure: a number or keyframes [[u, v], ...] across the cue (u 0..1); the focus cues default to a
    // ramp that meets the citrinitas shots on both sides of their cuts (spec 7.3 rule 7)
    const expoK = Array.isArray(P.exposure) && Array.isArray(P.exposure[0]) ? P.exposure.map(([u, v]) => [+u, MO.clamp(+v, 0.3, 2.5)])
      : typeof P.exposure === 'number' ? [[0, MO.clamp(P.exposure, 0.3, 2.5)], [1, MO.clamp(P.exposure, 0.3, 2.5)]]
      : fi >= 0 ? [[0, FOCUS_EXPO[focus][0]], [0.6, FOCUS_EXPO[focus][0]], [1, FOCUS_EXPO[focus][1]]] : [[0, 1], [1, 1]];
    const expo = (t) => MO.keys(expoK, MO.remap(t, cue.from, cue.to), (x) => MO.clamp(x));
    const at = (k) => (typeof P[k] === 'number' && Number.isFinite(P[k]) ? cue.from + (P[k] * BEAT - K.off) : null);
    const Te = at('eclipseAt'), Ta = at('alignAt');
    // transmutation times (absolute seconds), score order; Sol = its ignition
    const TT = PL.map((p, i) => {
      let b;
      if (Array.isArray(P.transmute)) b = P.transmute[i];
      else { const c = (S.chakras || []).find((x) => (x.planet || '').toLowerCase() === p.id) || (S.chakras || [])[i]; b = c ? c.beat + 2 : null; }
      if (b === -1) return -1e9;
      return typeof b === 'number' && Number.isFinite(b) ? b * BEAT : 1e9;
    });
    const seedPh = (i) => K.seed * 2.39996 * (i + 1);

    // ---- the orrery at time t (pure): ring frames, planet phases and centres
    const alignK = (t) => (Ta === null ? 0 : MO.easeInOut(MO.remap(t, Ta - BEAT, Ta)));
    let alignDir = null;   // set once the camera at Ta is known (below)
    const orrery = (t, eclipse) => {
      const m = K.M(t), kp = kickPhase(t), ak = alignK(t);
      const fr = [], ph = [], pos = [];
      for (let i = 0; i < 7; i++) {
        const p = PL[i];
        const inc = p.inc * D2R * (1 - ak), node = p.node * D2R + 0.012 * m;
        const f = eclipse && i === 5 ? eclipse.frL : frame(inc, node);
        let a = p.ph * D2R + seedPh(i) + p.notch * D2R * kp + 0.015 * m;
        if (eclipse && (i === 5 || i === 6)) a = eclipse.ph[i] + eclipse.w[i] * (t - Te);
        if (ak > 0 && alignDir) {
          const u = mul(alignDir, SIDE[i]);
          const tgt = Math.atan2(dot(u, f.e2), dot(u, f.e1));
          a += ak * wrap(tgt - a);
        }
        fr.push(f); ph.push(a); pos.push(onRing(f, p.R, a));
      }
      return { fr, ph, pos };
    };

    // ---- the eclipse geometry (cue-local): Sol at the low point of its ring, Luna 70 degrees round
    let ecl = null;
    if (Te !== null) {
      const o0 = orrery(Te, null);
      const fS = o0.fr[6], fL = o0.fr[5];
      let best = 0, by = 1e9;
      for (let k = 0; k < 360; k++) { const y = onRing(fS, PL[6].R, k * D2R)[1]; if (y < by) { by = y; best = k * D2R; } }
      const S0 = onRing(fS, PL[6].R, best), azS = Math.atan2(S0[2], S0[0]);
      // Luna's ring tilted 28 degrees for this cue, its high point 70 degrees round from Sol: the line
      // from Sol through Luna rises, so the camera on it looks down on the orrery at about 20 degrees
      const A = azS - 70 * D2R, inc = 28 * D2R, node = Math.atan2(-Math.cos(A), -Math.sin(A));
      const frL = frame(inc, node);
      const up = norm(sub([0, 1, 0], mul(frL.n, frL.n[1])));
      const bl = Math.atan2(dot(up, frL.e2), dot(up, frL.e1));
      void fL;
      ecl = { ph: { 5: bl, 6: best }, w: { 5: 0.10, 6: 0.04 }, frL };
    }

    // ---- cameras
    const orbitCam = (t, name) => {
      const E = { wide: 22, low: 7, high: 56 }[name] * D2R, D = { wide: 4.4, low: 3.8, high: 4.8 }[name];
      const az = 35 * D2R + orbit + 0.08 * (K.M(t) - cue.from);
      const C = [D * Math.cos(E) * Math.sin(az), D * Math.sin(E) + (name === 'low' ? 0.25 : 0), D * Math.cos(E) * Math.cos(az)];
      return { C, B: camAt(C, [0, 0, 0], [0, 0.10], F), F };
    };
    let camFn;
    if (mode === 'focus') {
      const o0 = orrery(cue.from, null);
      const c0 = o0.pos[fi], f0 = o0.fr[fi], a0 = o0.ph[fi];
      const radial = norm(c0), tang = norm(add(mul(f0.e1, -Math.sin(a0)), mul(f0.e2, Math.cos(a0))));
      // the camera's direction from the planet: the first of these (richest first: from outside the ring,
      // looking in past the sphere at the athanor's light) from which no ring band crosses the thief's face
      // at the start or the end of the cue; the push and the planet's notches move it along with the planet
      const nUp = mul(f0.n, Math.sign(f0.n[1]) || 1);
      const dist0 = PL[fi].r * F / 0.55;
      const o1 = orrery(cue.to, null);
      const CAND = [[0.70, 0.50, 0.45], [0.70, -0.50, 0.45], [0.45, 0.55, 0.60], [0.45, -0.55, 0.60], [0.22, 0.62, 0.65], [0.22, -0.62, 0.65], [-0.30, 0.60, 0.65], [0.0, 0.40, 0.90]];
      const clear = (dir) => [o0, o1].every((o) => {
        const c = o.pos[fi], C = add(c, mul(dir, dist0));
        const B = camAt(C, c, [0.10, 0.10], F), r = PL[fi].r;
        const pts = [c, add(c, mul(B[1], 0.5 * r)), add(c, mul(B[0], 0.45 * r)), add(c, mul(B[0], -0.45 * r)), add(c, mul(B[1], -0.3 * r))];
        return pts.every((X) => o.fr.every((fr, j) => !bandBlocks(C, X, fr, PL[j].R)));
      });
      const mk = (w) => norm(add(add(mul(radial, w[0]), mul(tang, w[1])), add(mul(nUp, w[2]), [0, 0.10, 0])));
      const dir = (CAND.map(mk).find(clear)) || mk(CAND[0]);
      const Pf = [0.10, 0.10];
      const B = camAt(add(c0, mul(dir, dist0)), c0, Pf, F);
      camFn = (t, o) => {
        const u = MO.smooth(MO.remap(t, cue.from, cue.to));
        const C = add(o.pos[fi], mul(dir, dist0 * MO.mix(1.05, 0.95, u)));
        return { C, B, F };
      };
    } else if (mode === 'pull') {
      const o1 = orrery(cue.to, null);
      const S1 = o1.pos[6], azS = Math.atan2(S1[0], S1[2]) + Math.PI;
      const E = 26 * D2R, D = 4.9;
      const C1 = [D * Math.cos(E) * Math.sin(azS), D * Math.sin(E), D * Math.cos(E) * Math.cos(azS)];
      const dir = norm(sub(C1, S1)), D1 = len(sub(C1, S1));
      // 3.5x -> 1x as a dolly of 2x times a zoom of 1.75x (2.5x = 1.6 x 1.55 reduced): less of the
      // orrery sweeps past the lens (spec 7.3 rule 1), Sol stays on the match point throughout
      camFn = (t, o) => {
        const u = MO.remap(t, cue.from + 0.06, cue.to);
        const k = 1 - Math.pow(1 - u, 2.2);
        const d = D1 * Math.exp(MO.mix(Math.log(1 / (red() ? 1.6 : 2.0)), 0, k));
        const Fz = F * Math.exp(MO.mix(Math.log(red() ? 1.55 : 1.75), 0, k));
        const C = add(o.pos[6], mul(dir, d));
        return { C, B: camAt(C, o.pos[6], solMatch(), Fz), F: Fz };
      };
    } else if (ecl) {
      const oe = orrery(Te, ecl);
      const L = oe.pos[5], Sx = oe.pos[6];
      const dl = norm(sub(L, Sx));
      // the camera on the Sol -> Luna line, far enough that at the eclipse (lens 2.1x) the Moon's disc is
      // 0.17 of the frame height in radius and Sol's a little larger: the corona shows round the Moon
      const Ce = add(L, mul(dl, PL[5].r * F * 2.1 / 0.23));
      camFn = (t, o) => {
        const th = 0.13 * (t - Te);
        const rel = sub(Ce, Sx);
        const C = add(Sx, [rel[0] * Math.cos(th) + rel[2] * Math.sin(th), rel[1], -rel[0] * Math.sin(th) + rel[2] * Math.cos(th)]);
        const Fe = F * MO.mix(1.2, 2.1, MO.easeInOut(MO.remap(t, cue.from, Te + 0.1)));
        return { C, B: camAt(C, o.pos[6], [0.05, 0.24], Fe), F: Fe };
      };
    } else {
      camFn = (t) => orbitCam(t, mode);
    }
    if (Ta !== null) {
      const c = camFn(Ta, orrery(Ta, ecl));
      alignDir = norm([c.B[0][0], 0, c.B[0][2]]);
    }

    const frameAt = (t) => { const o = orrery(t, ecl); return { o, cam: camFn(t, o) }; };

    const uniforms = (t) => {
      const { o, cam } = frameAt(t);
      const nx = frameAt(t + 1 / 30);
      const mt = K.M(t);
      const uPl = [], uPO = [], uPS = [], uRg = [], uRR = [], uRO = [], uRH = [], uRE = [], uRP = [], uMd = [], uSc = [], uSd = [];
      let mot = 0;
      for (let i = 0; i < 7; i++) {
        const p = PL[i], c = o.pos[i];
        uPl.push(c[0], c[1], c[2], p.r);
        const oc = sub(cam.C, c);
        uPO.push(oc[0], oc[1], oc[2], dot(oc, oc));
        const T = TT[i], dt = t - T;
        const flood = i === 6 ? 0 : MO.easeInOut(MO.clamp(dt / 0.6));
        const flare = dt >= 0 ? Math.exp(-dt / 0.45) * (red() ? 0.5 : 1) : 0;
        const mask = i === 6 ? 0 : 1 - MO.clamp((dt - 0.05) / 0.5);
        uPS.push(flood, flare, mask, 0);
        const f = o.fr[i];
        uRg.push(f.n[0], f.n[1], f.n[2], 0.011 + 0.004 * p.R);
        uRR.push(p.R);
        uRH.push(dot(cam.C, f.n));
        const o2 = sub(cam.C, mul(f.n, dot(cam.C, f.n)));
        uRO.push(o2[0], o2[1], o2[2], dot(o2, o2) - p.R * p.R);
        // the gold light sets out from where the planet stood at its transmutation
        const a0 = T > -1e8 && T < 1e8 ? orrery(T, null).ph[i] : 0;
        uRE.push(f.e1[0], f.e1[1], f.e1[2], ((a0 % TAU) + TAU) % TAU);
        const arc = T < -1e8 ? TAU + 0.1 : TAU * MO.easeInOut(MO.clamp(dt / 1.3)) + (dt >= 1.3 ? 0.1 : 0);
        const head = dt >= 0 && dt < 1.6 ? (1 - MO.smooth(MO.remap(dt, 1.1, 1.6))) * (red() ? 0.5 : 1) : 0;
        const glint = red() ? 0 : MO.env('openHat', t, 0.11);
        uRP.push(arc, head, glint, MO.env('kick', t, 0.15) * (red() ? 0.3 : 1));
        // the sphere's outline on screen (an ellipse, exact under perspective)
        const el = sphereEllipse(cam, c, p.r);
        uSc.push(el[0], el[1], el[2], el[3]); uSd.push(el[4], el[5], el[6], el[7]);
        const s = [el[0], el[1], el[2], el[7]];
        // the medallion circles its sphere in the screen plane (a disc facing the camera axis: a circle)
        const ang = 1.1 * i + 0.9 * mt + 0.35 * kickPhase(t);
        const z = dot(sub(c, cam.C), cam.B[2]);
        if (z > 0.05) {
          const sc = project(cam, c, p.r), k = cam.F / z;
          uMd.push(sc[0] + Math.cos(ang) * p.r * 1.8 * k, sc[1] + Math.sin(ang) * p.r * 1.8 * k, p.r * 0.42 * k, z);
        } else uMd.push(0, 0, 1e-3, -1);

        const s2 = project(nx.cam, nx.o.pos[i], p.r);
        if (s[3] && s2[3]) mot = Math.max(mot, Math.hypot(s2[0] - s[0], s2[1] - s[1]));
      }
      // what is on screen: spheres (with their energy fields), rings (any point near the frame, or
      // close to / behind the camera), medallions; listed for the shader's loops
      const AX = 16 / 9 + 0.05, AY = 1.05, SI = [], RI = [], MI = [];
      let bandH = 0;   // the largest band half height on screen (numerals readable above ~0.025)
      for (let i = 0; i < 7; i++) {
        const m = 2.6 * Math.max(uSc[4 * i + 2], uSc[4 * i + 3]);
        if (uSd[4 * i + 3] > 0 && Math.abs(uSc[4 * i]) < AX + m && Math.abs(uSc[4 * i + 1]) < AY + m) SI.push(i);
        const mr = uMd[4 * i + 2];
        if (uMd[4 * i + 3] > 0 && mr > 0.022 && Math.abs(uMd[4 * i]) < AX + mr && Math.abs(uMd[4 * i + 1]) < AY + mr) MI.push(i);
        const fr = o.fr[i], k = 0.011 + 0.004 * PL[i].R;
        let vis = false;
        for (let j = 0; j < 48; j++) {
          const X = onRing(fr, PL[i].R, j * TAU / 48), z = dot(sub(X, cam.C), cam.B[2]);
          if (z < 0.4) { if (z > -PL[i].R * 2) { vis = true; bandH = 1; } continue; }
          const q = project(cam, X, k), mg = q[2] + 0.02;
          if (Math.abs(q[0]) < AX + mg && Math.abs(q[1]) < AY + mg) { vis = true; bandH = Math.max(bandH, q[2]); }
        }
        // the chord between neighbouring samples can cross the frame while both ends lie outside
        for (let j = 0; j < 48 && !vis; j++) {
          const a = project(cam, onRing(fr, PL[i].R, j * TAU / 48), 0), b = project(cam, onRing(fr, PL[i].R, (j + 1) * TAU / 48), 0);
          if (a[3] && b[3]) { const hl = 0.5 * Math.hypot(b[0] - a[0], b[1] - a[1]); vis = Math.abs(0.5 * (a[0] + b[0])) < AX + hl && Math.abs(0.5 * (a[1] + b[1])) < AY + hl; }
        }
        if (vis) RI.push(i);
      }
      const pad = (a) => [...a, ...new Array(7 - a.length).fill(0)];
      const sa = project(cam, [0, 0, 0], 0.3), sa2 = project(nx.cam, [0, 0, 0], 0.3);
      if (sa[3] && sa2[3]) mot = Math.max(mot, Math.hypot(sa2[0] - sa[0], sa2[1] - sa[1]));
      uSc.push(sa[0], sa[1], sa[2], 1);
      // the Wheel of Fortune: a little wider than Saturn's ring as seen from here
      let wr = 0;
      for (let k = 0; k < 24; k++) {
        const q = project(cam, onRing(o.fr[0], PL[0].R, k * TAU / 24), 0);
        if (q[3]) wr = Math.max(wr, Math.hypot(q[0] - sa[0], q[1] - sa[1]));
      }
      const wheelR = MO.clamp(1.12 * (wr || 3), 0.6, 3.2);
      const ign = MO.easeOut(MO.clamp((t - TT[6]) / (red() ? 0.4 : 0.22)));
      let corona = 0;
      if (Te !== null) {
        const sL = project(cam, o.pos[5], PL[5].r), sS = project(cam, o.pos[6], PL[6].r);
        const sep = sL[3] && sS[3] ? Math.hypot(sL[0] - sS[0], sL[1] - sS[1]) / Math.max(sS[2], 1e-3) : 9;
        const flare = t >= Te ? (MO.smooth(MO.remap(t, Te, Te + 0.06)) * (0.35 + 0.65 * Math.exp(-(t - Te) / 0.5))) : 0;
        corona = flare * Math.exp(-sep * sep * 1.5) * (red() ? 0.5 : 1);
      }
      // the syzygy's light: flares as the planets land on the line, then settles to a glow along it
      const sy = Ta === null ? 0 : MO.smooth(MO.remap(t, Ta - 0.08, Ta)) * (0.35 + 0.65 * Math.exp(-Math.max(t - Ta, 0) / 0.4)) * (red() ? 0.5 : 1);
      let uLine = [9, 9, 9, 9];
      if (Ta !== null && alignDir) {
        const l0 = project(cam, mul(alignDir, -2.4), 0), l1 = project(cam, mul(alignDir, 2.4), 0);
        if (l0[3] && l1[3]) uLine = [l0[0], l0[1], l1[0], l1[1]];
      }
      const B = cam.B;
      return {
        uRo: cam.C, uCam: [...B[0], ...B[1], ...B[2]], uF: cam.F,
        uPl, uPO, uPS, uRg, uRR, uRO, uRH, uRE, uRP, uMd, uSc, uSd,
        uSun: [ign, 0.25 * mt, corona, sy],
        uK: [pal, expo(t), mot, 0.62],
        uTab: TAB,
        uLine,
        uN: [SI.length, RI.length, MI.length], uSI: pad(SI), uRI: pad(RI), uMI: pad(MI),
        uG: [
          SI.some((i) => i < 6 && uSc[4 * i + 2] > 0.07) ? 1 : 0,            // the thieves in the chrome
          bandH > 0.025 ? 1 : 0,                                              // band numerals
          MI.some((i) => uMd[4 * i + 2] > 0.03) ? 1 : 0,                      // medallion glyphs
          SI.includes(6) && uSc[26] > 0.09 && ign > 0 ? 1 : 0,               // the sun's face
        ],
        uWh: [wheelR, -TAU / 72 * kickPhase(t) - 0.02 * mt, 0.24, mode === 'pull' ? 0.5 * MO.smooth(MO.remap(mot, 0.06, 0.15)) : 0],
        uTime: mt,
      };
    };
    MO.scene({ id: 'orrery.thieves#' + cue.index, fs: FS, uniforms, bloom: 0.5, bloomThreshold: 0.85, vignette: 0.4 });
  });
})();
