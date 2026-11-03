// ZOOMBACK — "Pull back, camera!" (0 The Fool, I The Magician). Owner: zoomback. One shot factory,
// zoomback.set, new in the full version (it has no 30 s window, so without a cue list in the score
// this file registers no scene). The reality break: on the director's shout the frame freezes on
// rubedo.bloom's heart iris and greys; then one continuous pull-back through five nested pictures,
// each the window of the next one out (a log-zoom Droste), easing into each reveal on its downbeat:
//   L0  the frozen heart iris; from the pupil outward the great eye ignites in it (the EYE block)
//   L1  the eye is the picture on card 0 · LE MAT: cream paper, a stencilled frame, the 0 above, the
//       name below, the eye over a strip of yellow ground
//   L2  the card is the hub of a wheel of the other 21 trumps (I..XXI, each its numeral and a
//       stencilled emblem), embroidered in gold on ultramarine velvet with a star weave, between four
//       candles that lean away from the lens as tall things do in a wide angle; the ring ticks round
//   L3  the table stands on the summit of a plywood Holy Mountain set: five painted steps with pale
//       plywood edges and screws, cables down the front, four fresnels on stands (the two in front
//       throw beams through the haze), a camera crane with a lattice arm whose camera (red tally
//       light) hangs over the cards, a backdrop painted with coarse mandala rings, tape marks on the
//       studio floor. A real 3D view (analytic boxes and planes; the thin things are projected by the
//       factory into the picture plane and depth-tested): the flat zoom hands over to a crane move
//       that starts straight above the table at the same scale and runs on into the outer eye
//   L4  the whole set is the reflection in the pupil of the great eye; the iris closes in round it and
//       the pull-back settles at coda.eye's first-frame scale, so 99.4 -> 100.1 is a match cut
// The EYE GLSL between the EYE markers is identical in nigredo.js and coda.js; the CUE CLOCK block is
// identical in nigredo.js, albedo.js and coda.js.
//
// Natural length: 16 beats (the full score's bars 96-100, beats 384-400): the freeze ('freeze' beats
//   from the cut), the ignition (to beat 2.4), then the reveals: the great eye on beat 2 (96.3, the
//   band returns through the monitor), the card on 4 (97.1), the wheel on 8 (98.1), the set on 12
//   (99.1), the outer eye on 14 (99.3); the cut on 16 (100.1).
// Stretch: the head (the freeze, the ignition, the great eye's reveal on beat 2) is anchored to the
//   cue start (CUE CLOCK: offsetBeats starts partway; a cue too short for it plays it faster). The
//   card, wheel, set and outer-eye reveals are anchored to the cue end at 'pace' beats per layer
//   (auto: (cue beats - 4) / 3, i.e. 4 at the natural 16), so the last frame always lands on
//   coda.eye's first frame. A longer cue holds the living eye longer before the card and stretches
//   every hold with the pace; a shorter one compresses the pace (and, under 4.5 beats, the head too).
//   Every settle keeps drifting slowly back, so the camera never stops.
// Params (range (default): what it looks like):
//   freeze      0..4 (0.5)    beats the frame holds frozen on the heart iris before the eye ignites
//   layers      0..31 (31)    bitmask of the pictures. 1 L0 the frozen heart (off: start on the lit
//                             great eye; no bloom match), 2 L1 the card frame (off: the eye's painted
//                             ground fills the hub), 4 L2 the wheel (off: the card alone on velvet, no
//                             candles), 8 L3 the set (off, the spec's cut-down: the outer pupil reflects
//                             the table top flat; the wheel holds until the outer eye), 16 L4 the outer
//                             eye (off: the crane move runs to the cut; no coda match)
//   pace        0.5..8 (auto) beats per layer for the end-anchored reveals
//   gold        0..1 (1)      the eye's palette (1 rubedo gold and crimson, 0 nigredo bone, violet and
//                             verdigris) and how much of the bloom's gold grade the cut starts from
//   speed       0..16 (1)     ambient motion rate: the iris spin, flames, candle flicker, the ring's turn
//   seed        any (0)       phase of that motion
//   offsetBeats 0..16 (0)     start partway into the head
//   The shot sets its own grade and post (params.grade / params.frame are not used): the bloom's
//   gold palette at the cut, 30 % less saturation on the shout (3 frames; reduced: 0.5 s), released
//   to neutral as the eye ignites; bloom / threshold / vignette go from the bloom's to coda.eye's.
// Music: the reveals land on the downbeats (the kick returns on 96.3); every kick ticks the ring of
//   trumps one notch and breathes in the candles and lamps; the eye's flame aura flickers on the
//   ambient clock. A pure function of time: everything is looked up from the cue and the score.
// Match cuts (numbers in MO.MATCH: heartIris from rubedo.js; bloomEnd and codaEye defined here when
//   absent, the same object for every reader): first frame = rubedo.bloom's last (the heart iris at
//   1.36 screen units, black pupil 0.24 of it, the bloom's roll 0.494 rad, frozen at its clock at the
//   cut, its gold grade and post 0.32 / 1.2 / 0.5); last frame = coda.eye's first (zoom 3.4, pupil
//   0.73, iris centred, spin 0, ignite 1, sun 0, blaze and ground 1, post 0.28 / 0.9 / 0.5). Mean
//   luminance on both cuts within 10 %.
// Overlay: the 6.1 zones are kept: the focus is the frame centre throughout. Each scene def carries
//   view(t) -> { phase: 'heart'|'eye'|'card'|'wheel'|'set', card: [half w, half h] of the card on
//   screen (screen units, half frame height = 1) } for the viewfinder's brackets.
// Safety (7.3, 7.5): the reveals start fast and settle; every repeated pattern that sweeps fades
//   with moAntiStrobe as the log zoom speeds up: the eye's contour lines, the paper grain, the star
//   weave and the embroidered rim to their average coverage; under the crane move the set's painted
//   bands keep their hue but take one luminance, its lighting goes flat and its edges, cables and
//   boards fade (flicker is a luminance measure); the outer iris's concentric rings are drawn at their
//   band averages while its zoom is fast (the radial fibres stay) and the EYE block eases in as it
//   settles. The beams fade in late; nothing flashes or strobes; the shout's greying is a saturation
//   drop (no luminance step). Reduced: the greying over 0.5 s, the kick's breath x0.3, the ring's
//   ticks and turn halved, a stronger anti-strobe.
// Cost: SwiftShader runs every line of a program on every pixel, branches or not (measured: code in
//   an if costs the same whether the condition is uniform or per pixel, taken or not), so the cue is
//   cut into phase scenes, each its own program holding only what its window can show, some with a
//   #define baked into its fixed source (every cue shares each program): heart, ignite, eye, card
//   (hub only), cardWheel, wheel, setNear (no lamp heads, beams or backdrop yet), setFar (the cheap
//   table), outer (the iris at its band averages), outer2 (the EYE block easing in; a lite set and the
//   table's average colour in the small pupil); set (full table with the full set) and outerFlat (no
//   L3) serve other cues. Measured at 320x180 in the same page as albedo.a2, each frame timed between
//   two reference frames, median ratio of 13-25 passes (1.0 = albedo.a2, about 95 ms per 640x360
//   frame): heart 0.3, ignite 0.8, eye 0.6-0.8, card 0.9-1.1, cardWheel 1.2-1.3, wheel 0.7-0.9, setNear
//   1.3-1.4, setFar 0.9-1.0, outer 0.9-1.0, outer2 1.2 (coda.eye 0.6-0.7 in the same runs): at most
//   about 130 ms per 640x360 frame (about 3 s per 1080p frame) in setNear, the crane's first half second.
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

  // ==== EYE GLSL BEGIN (identical in nigredo.js and coda.js) ====
  const EYE = `
// THE GREAT EYE. Eye space: the corners at x = -1 and x = +1, y up; the iris (radius EY_R)
// sits at EY_IC. Everything is fine luminous line art on black.
uniform float uOpen;    // lid opening: 0 closed, 1 open (overshoots a little)
uniform float uIgnite;  // iris ignition 0..1, the fibres light from the pupil outward
uniform float uLines;   // contour-line reveal 0..1, a front travelling outward from the eye
uniform float uGlint;   // travelling cornea glint 0..1 (outside 0..1 = off)
uniform float uGold;    // palette: 0 nigredo (bone, violet, verdigris), 1 rubedo (gold, crimson)
uniform float uSpin;    // iris ring rotation (kaleidoscope)
uniform float uPupil;   // pupil size factor
uniform vec2  uLook;    // iris offset (gaze, tremble)
uniform float uAura;    // flame aura strength
uniform float uHi;      // anime cornea highlights 0..1
uniform float uSun;     // pupil fire 0..1: 0 the black sun, 1 the white-hot sun (unset = 0 in nigredo)
uniform vec3  uAS;      // anti-strobe (spec 7.3 rule 1), the eye's motion per 1/30 s: x = |d ln zoom| (zoom about
                        // EY_IC), y = |drift| in eye units (camera + gaze), z = |d spin| (radians). Linework that
                        // would cross a pixel faster fades to its average coverage (moAntiStrobe). 0 = still.

const vec2  EY_IC = vec2(0.0, 0.03);
const float EY_R  = 0.40;
const float EY_SU = 0.60;   // the socket (first contour line) above
const float EY_SL = 0.46;   // and below

vec3 eyBone, eyVio, eyVerd, eyEmber, eyDeep, eyHot;
void ey_palette(float g) {
  eyBone  = mix(vec3(0.82, 0.80, 0.74), vec3(1.00, 0.62, 0.20), g);
  eyVio   = mix(vec3(0.36, 0.18, 0.85), vec3(0.85, 0.04, 0.03), g);
  eyVerd  = mix(vec3(0.08, 0.58, 0.48), vec3(1.00, 0.40, 0.04), g);
  eyEmber = mix(vec3(0.90, 0.30, 0.08), vec3(0.90, 0.02, 0.16), g);
  eyDeep  = mix(vec3(0.010, 0.005, 0.022), vec3(0.040, 0.002, 0.004), g);
  eyHot   = mix(vec3(0.75, 0.80, 0.92), vec3(1.00, 0.86, 0.60), g);
}

// anti-aliased stroke of an SDF value d (half width w in pixels; pe = pixel size in d's units)
float ey_st(float d, float pe, float w) { return 1.0 - smoothstep(w - 0.7, w + 0.7, abs(d) / pe); }
float ey_gl(float d, float pe, float g) { return exp(-abs(d) / (g * pe)); }
// lines at the integers of v (fw = |dv| per pixel, w = half width in pixels); fades to the
// average coverage where the lines get too dense to resolve (no moire)
float ey_lines(float v, float fw, float w) {
  fw = max(fw, 1e-6);
  float d = abs(fract(v + 0.5) - 0.5) / fw;
  float l = 1.0 - smoothstep(w - 0.7, w + 0.7, d);
  return mix(l, min(1.0, 2.0 * w * fw), smoothstep(0.12, 0.32, fw));
}

float ey_lidU(float x, float o) { float k = max(1.0 - x * x, 0.0); return o * 0.50 * k * (1.0 + 0.35 * k) / 1.35 * (1.0 - 0.07 * x); }
float ey_lidL(float x, float o) { float k = max(1.0 - x * x, 0.0); return -o * 0.36 * k * (1.0 + 0.20 * k) / 1.20 * (1.0 + 0.10 * x); }
// distance to the upper / lower lid (> 0 outside the opening), slope-corrected
float ey_dU(vec2 e, float o) {
  if (abs(e.x) >= 1.0) return length(e - vec2(sign(e.x), 0.0));
  float s = (ey_lidU(e.x + 0.003, o) - ey_lidU(e.x - 0.003, o)) / 0.006;
  return (e.y - ey_lidU(e.x, o)) / sqrt(1.0 + s * s);
}
float ey_dL(vec2 e, float o) {
  if (abs(e.x) >= 1.0) return length(e - vec2(sign(e.x), 0.0));
  float s = (ey_lidL(e.x + 0.003, o) - ey_lidL(e.x - 0.003, o)) / 0.006;
  return (ey_lidL(e.x, o) - e.y) / sqrt(1.0 + s * s);
}
// almond gauge: 1 on the socket line, growing outward; the far contours get rounder
float ey_lam(vec2 e) {
  float H = e.y > 0.0 ? EY_SU : EY_SL;
  float y = abs(e.y), xx = e.x * e.x;
  float l = (y + sqrt(y * y + 4.0 * H * H * xx)) / (2.0 * H);
  H *= 1.0 + 0.32 * max(l - 1.0, 0.0);
  return (y + sqrt(y * y + 4.0 * H * H * xx)) / (2.0 * H);
}

// the iris mandala; q in iris units (radius 1), pe = pixel size in iris units
vec3 ey_iris(vec2 q, float pe) {
  float r = length(q), rr = max(r, 0.03);
  float a = atan(q.y, q.x);
  // anti-strobe: fibres crossing this pixel per 1/30 s. The zoom slides the wavy fibres sideways (bounds of
  // their slope along r), the drift and the spin carry them across; fast fibres fade to their average.
  float mzr = r * uAS.x, mdr = 2.5 * uAS.y / rr;
  float as1 = moAntiStrobe(3.2 * mzr + 14.3 * (mdr + uAS.z));
  float as2 = moAntiStrobe(15.5 * mzr + 23.9 * (mdr + 0.7 * uAS.z));
  float as3 = moAntiStrobe(6.4 * mzr + 5.7 * (mdr + 0.7 * uAS.z));
  float rp = 0.33 * uPupil;
  float front = mix(rp - 0.02, 1.35, uIgnite);
  float lit = smoothstep(front + 0.01, front - 0.20, r);
  float edge = exp(-abs(r - front) / 0.035) * step(0.001, uIgnite) * (1.0 - smoothstep(0.7, 1.0, uIgnite));
  float a1 = a + uSpin, a2 = a - 0.7 * uSpin;
  // collarette: the wavy ring between the pupillary and the ciliary zone
  float rc = 0.56 + 0.026 * sin(a1 * 12.0) + 0.010 * sin(a1 * 36.0 + 1.0);
  float drc = (0.312 * cos(a1 * 12.0) + 0.36 * cos(a1 * 36.0 + 1.0)) / rr;
  float inner = smoothstep(rc + 0.012, rc - 0.012, r);
  vec3 col = eyDeep * 2.0 + mix(eyVio * 0.06, eyVerd * 0.09, inner) * (0.3 + 0.7 * lit)
           + uGold * mix(eyVio * 0.22, eyVerd * 0.30, inner) * lit * (0.75 + 0.25 * sin(r * 30.0 - uSpin * 8.0));

  // pupillary zone: dense straight fibres (a corona around the pupil)
  float v1 = a1 / TAU * 90.0 + 0.20 * sin(r * 16.0 + a1 * 6.0);
  float fw1 = 90.0 / (TAU * rr) * pe, m1 = inner * smoothstep(rp, rp + 0.05, r);
  float f1 = ey_lines(v1, fw1, 0.6) * inner * smoothstep(rp, rp + 0.05, r) * as1;
  float h1 = hash11(floor(v1 + 0.5) + 11.0);
  col += mix(eyVerd, eyBone, 0.15 * h1) * f1 * (0.30 + 0.55 * h1) * lit;
  col += mix(eyVerd, eyBone, 0.075) * 0.575 * min(1.0, 1.2 * fw1) * m1 * (1.0 - as1) * lit;
  // ciliary zone: fine wavy fibres in beaded segments
  float ci = (1.0 - inner) * smoothstep(0.995, 0.93, r);
  float v2 = (a2 + 0.06 * sin(a2 * 8.0 + r * 10.0) + 0.05 * (r - rc)) / TAU * 150.0;
  float fw2 = 150.0 / (TAU * rr) * pe;
  float f2 = ey_lines(v2, fw2, 0.55) * ci * as2;
  float h2 = hash11(floor(v2 + 0.5) + 3.0);
  float seg = 0.55 + 0.45 * sin(r * 34.0 + h2 * TAU);
  col += mix(eyVio, eyBone, 0.10 * h2) * f2 * (0.25 + 0.45 * h2) * seg * lit;
  // bold trabeculae
  float v3 = (a2 + 0.16 * sin(r * 7.0 + a2 * 3.0)) / TAU * 36.0;
  float fw3 = 36.0 / (TAU * rr) * pe;
  float f3 = ey_lines(v3, fw3, 1.1) * ci * as3;
  col += mix(eyVio, eyVerd, 0.5) * f3 * 0.55 * lit;
  col += (mix(eyVio, eyBone, 0.05) * 0.26 * min(1.0, 1.1 * fw2) * (1.0 - as2) + mix(eyVio, eyVerd, 0.5) * 0.55 * min(1.0, 2.2 * fw3) * (1.0 - as3)) * ci * lit;

  // crypts: dark lenses with bright outlines
  {
    float n = 22.0, ca = a2 / TAU * n, id = floor(ca), h = hash11(id + 5.3);
    vec2 cq = vec2((fract(ca) - 0.5) * TAU / n * r, r - (0.68 + 0.05 * (h - 0.5)));
    float cd = sdVesica(cq, 0.020 + 0.010 * h, 0.055 + 0.025 * h);
    col *= 1.0 - 0.8 * (1.0 - smoothstep(-pe, pe, cd));
    col += eyBone * 0.55 * ey_st(cd, pe, 0.55) * lit;
  }
  // a ring of tiny eyes (eyes within the eye)
  {
    float n = 16.0, ea = (a2 + 0.5 * uSpin) / TAU * n;
    vec2 eq = vec2((fract(ea) - 0.5) * TAU / n * r, r - 0.835);
    float ed = sdVesica(eq.yx, 0.030, 0.068);
    col = mix(col, eyDeep * 2.0, 0.9 * (1.0 - smoothstep(-pe, pe, ed)));
    col += eyBone * 0.95 * ey_st(ed, pe, 0.6) * lit;
    float pd = length(eq) - 0.017;
    col += mix(eyEmber, eyHot, 0.3 * uGold) * 1.6 * (1.0 - smoothstep(-pe, pe, pd)) * lit;
  }
  // contraction furrows: broken concentric arcs
  {
    float fu = min(abs(r - 0.765), abs(r - 0.915));
    float brk = step(0.32, fract(a2 / TAU * 11.0 + 0.3 * sin(a2 * 3.0)));
    col += eyVio * 0.5 * ey_st(fu, pe, 0.5) * brk * lit;
  }
  // sacred geometry: twelve circles through the centre (the rosette), thin ember lines
  {
    vec2 k = kaleido(rot(0.5 * uSpin) * q, 12.0);
    float d = 1e3;
    for (int i = -2; i <= 2; i++) {
      float ph = float(i) * TAU / 12.0;
      d = min(d, abs(length(k - 0.5 * vec2(cos(ph), sin(ph))) - 0.5));
    }
    col += eyEmber * 0.40 * ey_st(d, pe, 0.45) * lit * smoothstep(rp + 0.02, rp + 0.08, r) * smoothstep(1.0, 0.94, r);
  }
  // collarette line
  {
    float dc = (r - rc) / sqrt(1.0 + drc * drc);
    col += eyBone * (1.3 * ey_st(dc, pe, 0.9) + 0.25 * ey_gl(dc, pe, 5.0)) * lit;
  }
  // limbal ring
  col *= 0.45 + 0.55 * smoothstep(1.0, 0.88, r);
  col += eyVio * (1.1 * ey_st(r - 1.0, pe, 0.8) + 0.25 * ey_gl(r - 1.0, pe, 6.0)) * (0.3 + 0.7 * lit);
  // pupil: nigredo = the black sun; rubedo = a white-hot sun around a black eclipse core.
  // uSun ignites it on screen (lead to gold): a front of fire runs from the rim in to the core.
  {
    float rpw = rp + 0.008 * sin(a1 * 40.0);
    float pin = 1.0 - smoothstep(-pe, pe, r - rpw);
    float core = r / rp;
    float fr = 1.0 - 0.75 * uSun;
    vec3 hot = eyHot * (0.7 + 1.5 * (1.0 - core * core)) * smoothstep(0.30, 0.40, core)
             + eyHot * 2.5 * ey_st(core - 0.35, pe / rp, 0.8);
    hot = hot * uSun * smoothstep(fr - 0.15, fr, core) + eyHot * 1.8 * exp(-abs(core - fr) / 0.05) * uSun * (1.0 - uSun) * 4.0;
    col = mix(col, hot, pin);
    col += mix(eyEmber, eyVerd, 0.5 + 0.5 * sin(a * 20.0)) * 1.4 * ey_st(r - rpw, pe, 0.8) * (0.4 + 0.6 * lit);
  }
  col += edge * mix(eyVerd, eyBone, 0.5) * 1.6;
  return col;
}

// the whole eye over the background bg; e in eye space, pe = pixel size in eye units
vec3 ey_eye(vec3 bg, vec2 e, float pe, float t) {
  float o = uOpen;
  float ax = abs(e.x);
  vec3 col = bg;
  float dU = ey_dU(e, o), dL = ey_dL(e, o);
  float inEye = ax < 1.0 ? 1.0 - smoothstep(-pe, pe, max(dU, dL)) : 0.0;
  float lam = ey_lam(e);

  // ---- contour lines and the flame aura (outside the socket)
  if (lam > 0.96) {
    float th = atan(ax, e.y);                       // 0 straight up, PI straight down, mirror symmetric
    float up = smoothstep(2.5, 0.9, th);
    // flame tongues: pointed bulges that curl outward as they rise and flicker one by one
    float ph = th * 2.6 - 0.22 * (lam - 1.0);
    float tid = floor(ph + 0.5);
    float tri = 1.0 - 2.0 * abs(fract(ph + 0.5) - 0.5);
    float tng = pow(tri, 2.2) * (0.7 + 0.3 * sin(t * 3.1 + tid * 2.3));
    float fl = tng * up * smoothstep(1.06, 1.9, lam);
    float u = log(lam) * 22.0 - log(1.0 + 0.55 * fl) * 22.0;
    u += 0.18 * sin(e.x * 7.0 + lam * 5.0 - t * 0.7) * smoothstep(1.05, 1.8, lam);
    float fw = fwidth(u);
    float ln = ey_lines(u, fw, 0.55);
    float idx = floor(u + 0.5);
    float major = mod(idx, 4.0) < 0.5 ? 0.75 : 0.20;
    // anti-strobe: lines crossing this pixel per 1/30 s (zoom about the eye, drift); the fine lines fade to
    // their average coverage, the major ones (every 4th line, crossing 4x less often) at 4x the speed
    float cr = fw * (length(e - EY_IC) * uAS.x + uAS.y) / pe;
    float asc = moAntiStrobe(major > 0.5 ? 0.25 * cr : cr);
    ln = ln * asc + min(1.0, 1.1 * fw) * (1.0 - asc);
    major = major * asc + 0.3375 * (1.0 - asc);
    float lf = mix(1.0, 5.5, uLines);
    float reveal = smoothstep(lf, lf - 0.25, lam);
    float lead = ey_st(lam - lf + 0.1, fwidth(lam), 0.8) * step(0.001, uLines) * (1.0 - uLines);
    float fall = exp(-(lam - 1.0) * 1.5);
    vec3 lc = mix(eyBone, eyVio, sat((lam - 1.0) * 2.0));
    lc = mix(lc, eyVerd, sat((lam - 1.8) * 0.9) * 0.7);
    lc = mix(lc, eyEmber, sat(fl * 1.3));
    col += lc * ln * major * fall * reveal;
    col += mix(eyVio, eyEmber, sat(fl * 1.5)) * (0.015 + 0.10 * fl) * exp(-(lam - 1.1) * 1.1) * uAura * reveal;
    col += eyBone * lead * 0.5;
  }
  // ---- lid folds between the lids and the socket
  if (lam < 1.02 && ax < 1.0) {
    float k = 1.0 - e.x * e.x;
    float yU = ey_lidU(e.x, o), yL = ey_lidL(e.x, o);
    if (e.y > yU) {
      float g = EY_SU * k - yU;
      float f = (e.y - yU) / max(g, 1e-4);
      col += eyBone * 0.55 * ey_st((f - 0.40) * g, pe, 0.6);
      col += eyVio * 0.50 * ey_st((f - 0.72) * g, pe, 0.5);
    } else if (e.y < yL) {
      float g = yL + EY_SL * k;
      float f = (yL - e.y) / max(g, 1e-4);
      col += eyVio * 0.45 * ey_st((f - 0.52) * g, pe, 0.5);
    }
  }
  // ---- inside: the eyeball
  if (inEye > 0.0) {
    vec2 c = EY_IC + uLook;
    vec2 q = (e - c) / EY_R;
    float rq = length(q);
    float sph = sat(1.0 - length((e - c) * vec2(0.85, 1.5)));
    float vein = pow(ridge(e * vec2(5.0, 9.0) + 3.7), 14.0) * smoothstep(0.25, 0.9, ax);
    vec3 ins = eyDeep * 1.3 + eyBone * 0.03 * sph * sph + eyEmber * 0.08 * vein;
    if (rq < 1.15) {
      float pq = pe / EY_R;
      vec3 ir = ey_iris(q, pq);
      ins = mix(ins, ir, 1.0 - smoothstep(1.0 - pq, 1.0 + pq, rq));
    }
    ins *= mix(0.15, 1.0, smoothstep(0.0, 0.17, -dU)) * mix(0.45, 1.0, smoothstep(0.0, 0.05, -dL));
    // light leaking through the slit while the lids are nearly shut
    ins += eyHot * 1.6 * (1.0 - smoothstep(0.04, 0.32, o)) * (1.0 - ax * ax) * step(0.003, o);
    // anime highlights: a rounded lozenge up-left, a small dot down-right
    float pq = pe / EY_R;
    float hl = sdEllipse(rot(-0.6) * (q - vec2(-0.42, 0.42)), vec2(0.12, 0.06));
    float hd = length(q - vec2(0.40, -0.32)) - 0.04;
    ins += eyHot * 2.0 * (1.0 - smoothstep(-pq, pq, min(hl, hd))) * uHi;
    // the travelling glint
    if (uGlint > 0.0 && uGlint < 1.0) {
      float gd = dot(q, normalize(vec2(1.0, 0.45))) - mix(-1.4, 1.4, uGlint);
      float band = exp(-gd * gd / 0.0005) + 0.15 * exp(-gd * gd / 0.012);
      ins += eyHot * 1.4 * band * smoothstep(1.0, 0.85, rq) * sin(PI * uGlint);
    }
    col = mix(col, ins, inEye);
  }
  // ---- the lids, the waterline and the lashes
  {
    float lw = ax < 1.0 ? 1.0 : 0.0;
    col += eyBone * (1.3 * ey_st(dU, pe, 1.0) + 0.18 * ey_gl(dU, pe, 6.0));
    col += eyBone * (0.9 * ey_st(dL, pe, 0.8) + 0.12 * ey_gl(dL, pe, 5.0));
    col += eyVio * 0.5 * ey_st(dL + 0.012 * o, pe, 0.5) * lw;
    if (dU > 0.0 && dU < 0.22 && ax < 0.97) {
      // lashes fan outward and curl like small flames
      float v = dU, g = 1.0 + 2.2 * v + 11.0 * v * v;
      float x0 = e.x / g, n = 12.0, id = floor(x0 * n + 0.5), h = hash11(id * 3.17 + 1.0);
      float L = (0.08 + 0.10 * h) * sqrt(max(1.0 - (id / n) * (id / n), 0.0)) * (0.5 + 0.5 * sat(o));
      float dx = abs(x0 * n - id) / n * g;
      float wl = mix(0.0065, 0.0005, sat(v / L));
      col += eyBone * 0.75 * (1.0 - smoothstep(wl, wl + pe, dx)) * smoothstep(L, L * 0.5, v);
    }
    if (dL > 0.0 && dL < 0.07 && ax < 0.9) {
      float v = dL, g = 1.0 + 0.7 * v;
      float x0 = e.x / g, n = 18.0, id = floor(x0 * n + 0.5), h = hash11(id * 5.1 + 2.0);
      float L = (0.025 + 0.025 * h) * sqrt(max(1.0 - (id / n) * (id / n), 0.0)) * sat(o * 2.0);
      float dx = abs(x0 * n - id) / n * g;
      float wl = mix(0.0035, 0.0006, sat(v / max(L, 1e-3)));
      col += eyVio * 0.45 * (1.0 - smoothstep(wl, wl + pe, dx)) * smoothstep(L, L * 0.6, v) * step(0.5, h);
    }
  }
  // glint sparkle at the edge of the cornea
  if (uGlint > 0.0 && uGlint < 1.0) {
    vec2 dir = normalize(vec2(1.0, 0.45));
    float gp = mix(-1.4, 1.4, uGlint);
    vec2 sp = EY_IC + uLook + EY_R * (dir * gp + vec2(-dir.y, dir.x) * sqrt(max(1.0 - gp * gp, 0.0)) * 0.92);
    col += eyHot * 2.2 * sparkle(e, sp, 0.22 * sin(PI * uGlint));
  }
  return col;
}
`;
  // ==== EYE GLSL END ====

  // ==== ZOOMBACK GLSL (zb_) ====
  // Five nested pictures, each the window of the next one out (a Droste chain): L0 the heart iris /
  // the great eye; L1 the Fool card (its picture panel shows L0); L2 the wheel of trumps on velvet
  // (its hub card is L1); L3 the plywood Holy Mountain set (its table top shows L2, through a 3D
  // camera); L4 the great eye again (its pupil reflects L3). A picture too small to read is drawn
  // in a cheap form, so the recursion is finite. SwiftShader runs every line of a program on every
  // pixel, branches or not, so the cue is cut into phases (heart, ignite, eye, card, wheel, set,
  // setFar, outer), each its own program holding only the pictures its window can show; every cue
  // shares each program. The blocks below are joined per phase (see PROGRAMS).
  const ZB_COMMON = `
uniform vec3  uZbCam2;    // the flat camera: zoom (screen units per wheel unit), roll cos, sin
uniform vec4  uZbOn;      // contents on (the layers knob): x the card, y the wheel, z the set, w the heart
uniform float uZbAS;      // log-zoom change per frame (anti-strobe of everything that sweeps)
uniform float uZbMT;      // ambient-motion clock
uniform float uZbWheel;   // the ring of trumps' rotation (radians)
uniform float uZbFlame;   // candle and lamp brightness (the kick breathes in it)
uniform float uZbDim;     // the painted eye: how far it reads as ink printed on the card
uniform vec4  uZbFlick;   // the four candles' flicker (x: -x-y ... w: +x+y)
uniform vec2  uZbNad;     // the camera's nadir on the table (wheel units): tall things lean away from it
uniform float uZbHgt;     // the camera's height above the table top (wheel units)

const float ZB_SE = 0.5;               // card units per eye unit (the eye painted in the panel)
const float ZB_SC = 0.2778;            // wheel units per card unit (the hub card: 0.278 x 0.5)
const float ZB_SW = 0.12;              // metres per wheel unit (the cloth on the table top)
const vec2  ZB_CARD = vec2(1.0, 1.8);  // card half-size (card units)
const vec2  ZB_PANEL = vec2(0.80, 1.30);
const float ZB_RMID = 2.45;            // the ring of 21 trumps: card centres (wheel units)
const vec2  ZB_TABLE = vec2(6.6, 3.8); // table top half-size (wheel units)
const float ZB_TY = 3.5;               // table top height (metres)
const vec3  ZB_INK = vec3(0.030, 0.024, 0.030);
const vec3  ZB_RED = vec3(0.72, 0.10, 0.05);
const vec3  ZB_BLUE = vec3(0.07, 0.17, 0.52);
const vec3  ZB_YEL = vec3(0.90, 0.64, 0.12);
const vec3  ZB_FLESH = vec3(0.90, 0.60, 0.42);
const vec3  ZB_GRN = vec3(0.12, 0.40, 0.26);
const vec3  ZB_WARM = vec3(1.0, 0.74, 0.42);

vec2 zb_r2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
float zb_ln(float d, float w, float e) { return 1.0 - smoothstep(w - e, w + e, abs(d)); }
float zb_fl(float d, float e) { return 1.0 - smoothstep(-e, e, d); }
// cheap atan2 (|error| < 0.005 rad): the builtin is slow on SwiftShader
float zb_atan(float y, float x) {
  float ax = abs(x), ay = abs(y);
  float a = min(ax, ay) / max(max(ax, ay), 1e-9);
  float s = a * a;
  float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  r = ay > ax ? 1.57079637 - r : r;
  r = x < 0.0 ? 3.14159265 - r : r;
  return y < 0.0 ? -r : r;
}
// a fine texture's contrast under the pull-back: features crossing a pixel per frame at screen
// radius rs, for a pattern of spacing sp (in the units of pe, one pixel there)
float zb_as(float rs, float sp, float pe) { return moAntiStrobe(rs * uZbAS * pe / (px() * max(sp, 1e-5))); }
// a star of n points (tip radius r, valley radius 1.2 r / m), approximately signed: one point up
float zb_star(vec2 p, float r, float n, float m) {
  float tri = 1.0 - 2.0 * abs(fract(zb_atan(p.x, p.y) * n / TAU + 0.5) - 0.5);
  return (length(p) - mix(1.2 * r / m, r, tri)) * 0.6;
}
// the flat camera: screen -> wheel units
vec2 zb_flat(vec2 q) { return mat2(uZbCam2.y, uZbCam2.z, -uZbCam2.z, uZbCam2.y) * q / uZbCam2.x; }
`;

  // ---------------------------------------------------------------- L0a: the frozen heart iris
  // rubedo.bloom's last frame redrawn with its numbers (its R4 shader at uDive = 1, tilt 0): P in
  // the bloom's screen units (the heart iris at the origin), its clock frozen at the cut
  const ZB_HEART = `
uniform float uZbHT;      // the heart's frozen clock (the bloom's uTime at the cut)
uniform float uZbFront;   // ignition front (iris units): inside it the great eye replaces the heart
uniform float uZbHRoll;   // MO.MATCH.bloomEnd.roll: the bloom's roll at the end of its dive (0.494)
uniform float uZbHZ;      // its zoom there: MO.MATCH.heartIris screenR / r (1.36 / 0.02 = 68)
uniform float uZbHK;      // the heart's picture units per eye unit: screenR / EY_R (3.4)
uniform float uZbHR;      // the heart iris radius in the bloom's mandala units (MO.MATCH.heartIris.r, 0.02)
float zb_cont(float d, float s, float w, float e) {
  float f = abs(fract(d / s + 0.5) - 0.5) * s;
  float l = 1.0 - smoothstep(w - e, w + e, f);
  return mix(min(1.0, 2.0 * w / s), l, smoothstep(3.0 * e, 7.0 * e, s));
}
vec3 zb_aurum(vec3 c) {
  float l = dot(c, vec3(0.55, 0.38, 0.07));
  vec3 g = l * mix(vec3(1.30, 0.66, 0.18), vec3(1.05, 0.92, 0.75), smoothstep(0.8, 3.0, l));
  return mix(c, g, 0.85 * smoothstep(0.015, 0.12, l));
}
vec3 zb_heart(vec2 P, float peP, float tt) {
  float len = length(vec3(P, 2.0));
  vec2 p = zb_r2(P, uZbHRoll) / uZbHZ;
  float e = peP * pow(len * 0.5, 1.5) / uZbHZ;
  float r = length(p), a = atan(p.y, p.x);
  // the mandorla's interior at the end of the dive
  vec3 col = vec3(0.08, 0.0, 0.02) + vec3(0.5, 0.02, 0.02) * (0.5 + 0.5 * cos(a * 32.0 - tt * 3.0)) * 0.4;
  col += vec3(0.7, 0.04, 0.12) * zb_cont(sdVesica(p, 0.19, 0.34), 0.018, 0.5 * e, e) * 0.5;
  // the heart: a blazing iris
  float hr = uZbHR, x = r / hr, le = e / hr;
  vec3 ic = mix(vec3(0.55, 0.05, 0.02), vec3(0.16, 0.0, 0.03), smoothstep(0.2, 1.0, x));
  ic += vec3(1.0, 0.25, 0.02) * exp(-max(x - 0.24, 0.0) * 5.0) * 0.8;
  float w1 = a * 72.0 / TAU + 0.35 * sin(x * 9.0 + a * 3.0);
  float sp1 = TAU / 72.0 * x;
  ic += mix(vec3(2.4, 1.1, 0.2), vec3(1.2, 0.1, 0.05), x) * zb_ln(abs(fract(w1) - 0.5) * sp1, 0.6 * le, le) * smoothstep(3.0 * le, 7.0 * le, sp1) * step(0.24, x);
  float w2 = a * 160.0 / TAU - 0.5 * sin(x * 13.0 - a * 5.0);
  float sp2 = TAU / 160.0 * x;
  ic += vec3(1.2, 0.3, 0.05) * zb_ln(abs(fract(w2) - 0.5) * sp2, 0.45 * le, le) * smoothstep(3.0 * le, 7.0 * le, sp2) * step(0.45, x);
  float wq = TAU / 18.0, aa = a - 0.2 * tt, la = aa - floor(aa / wq + 0.5) * wq;
  float crypt = sdVesica(vec2(x * sin(la), x * cos(la) - 0.62), 0.045, 0.12);
  ic = mix(ic, vec3(0.03, 0.0, 0.01), zb_fl(crypt, le) * 0.85);
  ic += vec3(1.0, 0.62, 0.15) * 1.2 * zb_ln(crypt, 0.4 * le, le);
  ic += vec3(1.0, 0.86, 0.64) * 1.8 * zb_ln(x - 0.45 - 0.035 * sin(a * 12.0 + tt), 0.4 * le + 0.004, le);
  ic = mix(ic, vec3(0.03, 0.0, 0.01), smoothstep(0.88, 1.0, x));
  ic = mix(ic, vec3(0.0), zb_fl(x - 0.24, le));
  ic += vec3(1.0, 0.86, 0.64) * 2.2 * zb_ln(x - 0.24, 0.5 * le + 0.004, le);
  ic += vec3(2.4, 0.6, 0.08) * zb_ln(x - 1.0, 0.5 * le + 0.004, le);
  col = mix(col, ic, zb_fl(x - 1.0, le)) + vec3(0.5, 0.06, 0.02) * exp(-max(x - 1.0, 0.0) * 4.0) * step(1.0, x);
  col += vec3(0.06, 0.003, 0.0018) * exp(-r * 2.0);
  col *= 0.95;
  col = mix(col, zb_aurum(col), smoothstep(0.026, 0.05, r));
  // the dive's radial glow and speed lines in the corners of the frame
  float rs = length(P);
  float keep = max(0.32, 1.15 * uZbHR * uZbHZ);
  float blur = 0.88 * smoothstep(keep, keep + 0.55, rs);
  vec3 glow = mix(vec3(0.68, 0.37, 0.08), vec3(0.34, 0.02, 0.02), smoothstep(0.4, 2.0, rs));
  glow *= 0.72 + 0.56 * pow(0.5 + 0.5 * cos((atan(P.y, P.x) + uZbHRoll) * 16.0), 3.0);
  glow += vec3(1.0, 0.86, 0.64) * 1.2 * speedLines(P, vec2(0.0), 110.0, tt, 0.2) * smoothstep(keep, keep + 0.4, rs) * (1.0 - 0.7 * uReduced);
  col = max(mix(col, glow, blur), 0.0);
  return col * col / (col + 0.07);
}
`;

  // ---------------------------------------------------------------- L0b: the painted great eye
  const ZB_PAINT = `
uniform float uZbCont;    // the eye's contour lines and aura: reveal 0..1
// the panel's painted ground: deep night, crimson heat round the eye
vec3 zb_ground(vec2 e) {
  float r2 = dot(e, e);
  return vec3(0.006, 0.0008, 0.003) + vec3(0.075, 0.006, 0.010) * exp(-r2 * 0.5) + vec3(0.003, 0.006, 0.022) * smoothstep(1.0, 6.0, r2);
}
// printed on the card: as the camera pulls back the picture reads as ink on warm paper
vec3 zb_print(vec3 c) { return mix(c, c * vec3(1.0, 0.92, 0.80) + vec3(0.020, 0.014, 0.008), uZbDim); }
// the EYE block's contour lines and flame aura, drawn here so they fade to their average under the
// fast pull-back (22 lines per unit of log zoom sweep across every pixel); the block itself runs
// with uLines 0
vec3 zb_contours(vec2 e, float pe, float t) {
  float lam = ey_lam(e);
  float ax = abs(e.x);
  float th = atan(ax, e.y);
  float up = smoothstep(2.5, 0.9, th);
  float ph = th * 2.6 - 0.22 * (lam - 1.0);
  float tri = 1.0 - 2.0 * abs(fract(ph + 0.5) - 0.5);
  float tng = pow(tri, 2.2) * (0.7 + 0.3 * sin(t * 3.1 + floor(ph + 0.5) * 2.3));
  float fl = tng * up * smoothstep(1.06, 1.9, lam);
  float u = log(max(lam, 1e-3)) * 22.0 - log(1.0 + 0.55 * fl) * 22.0;
  u += 0.18 * sin(e.x * 7.0 + lam * 5.0 - t * 0.7) * smoothstep(1.05, 1.8, lam);
  float fw = fwidth(u);
  float ln = ey_lines(u, fw, 0.55);
  float avg = min(1.0, 1.1 * fw);
  float maj = mod(floor(u + 0.5), 4.0) < 0.5 ? 1.0 : 0.0;
  float k = 0.20 * mix(avg, ln, moAntiStrobe(22.0 * uZbAS)) + 0.55 * mix(0.25 * avg, ln * maj, moAntiStrobe(5.5 * uZbAS));
  float lf = mix(1.0, 5.5, uZbCont);
  float reveal = smoothstep(lf, lf - 0.25, lam) * step(0.96, lam);
  vec3 lc = mix(eyBone, eyVio, sat((lam - 1.0) * 2.0));
  lc = mix(lc, eyVerd, sat((lam - 1.8) * 0.9) * 0.7);
  lc = mix(lc, eyEmber, sat(fl * 1.3));
  vec3 col = lc * k * exp(-(lam - 1.0) * 1.5) * reveal;
  col += mix(eyVio, eyEmber, sat(fl * 1.5)) * (0.015 + 0.10 * fl) * exp(-(lam - 1.1) * 1.1) * uAura * reveal;
  col += eyBone * 0.5 * ey_st(lam - lf + 0.1, fwidth(lam), 0.8) * step(0.001, uZbCont) * (1.0 - uZbCont) * step(0.96, lam);
  return col;
}
// the painted eye a few dozen pixels wide (the hub card seen from the wheel and beyond)
vec3 zb_miniEye(vec2 e, float pe) {
  vec3 col = zb_ground(e);
  float dU = ey_dU(e, 1.0), dL = ey_dL(e, 1.0);
  float inEye = zb_fl(max(dU, dL), pe) * step(abs(e.x), 1.0);
  float r = length(e - EY_IC) / EY_R, pr = pe / EY_R;
  vec3 iris = mix(eyBone * 1.1, eyVio * 0.7, smoothstep(0.35, 0.95, r)) * (1.0 - zb_fl(r - 0.24, pr));
  col = mix(col, mix(eyDeep * 2.0, iris, zb_fl(r - 1.0, pr)), inEye);
  col += eyBone * 1.1 * (zb_ln(dU, 0.7 * pe, pe) + zb_ln(dL, 0.6 * pe, pe)) * step(abs(e.x), 1.0);
  float lam = ey_lam(e);
  col += mix(eyVio, eyEmber, 0.5) * 0.16 * exp(-max(lam - 1.0, 0.0) * 1.6) * step(1.0, lam);
  return col;
}
`;

  // ---------------------------------------------------------------- L1 / L2: the cards and the table
  const ZB_CARDS = `
float zb_seg(vec2 p, vec4 s) { return sdSegment(p, s.xy, s.zw); }
// Roman numeral glyph at position i: 0 none, 1 I, 2 V, 3 X; and the glyph count
float zb_romanG(float n, float i) {
  float tens = floor(n / 10.0), r = n - tens * 10.0, j = i - tens;
  float g = r < 0.5 ? 0.0 : r < 3.5 ? (j < r ? 1.0 : 0.0) : r < 4.5 ? (j < 0.5 ? 1.0 : 2.0) : r < 5.5 ? 2.0
          : r < 8.5 ? (j < 0.5 ? 2.0 : 1.0) : (j < 0.5 ? 1.0 : 3.0);
  return i < tens ? 3.0 : g;
}
float zb_romanN(float n) {
  float tens = floor(n / 10.0), r = n - tens * 10.0;
  return tens + (r < 0.5 ? 0.0 : r < 3.5 ? r : r < 4.5 ? 2.0 : r < 5.5 ? 1.0 : r < 8.5 ? r - 4.0 : 2.0);
}
// the numeral in the top cartouche (q: cap height 1, centred); 0 is an oval
float zb_numeral(vec2 q, float n) {
  float cnt = max(zb_romanN(n), 1.0), adv = 0.62;
  float x = q.x + 0.5 * cnt * adv;
  float i = clamp(floor(x / adv), 0.0, cnt - 1.0);
  vec2 g = vec2(x - (i + 0.5) * adv, q.y);
  float t = zb_romanG(n, i);
  vec2 ga = vec2(abs(g.x), g.y);
  float dI = min(abs(g.x) + max(abs(g.y) - 0.5, 0.0), sdSegment(vec2(ga.x, abs(g.y)), vec2(0.0, 0.5), vec2(0.14, 0.5)));
  float dV = sdSegment(ga, vec2(0.26, 0.5), vec2(0.0, -0.5));
  float dX = min(sdSegment(g, vec2(-0.26, -0.5), vec2(0.26, 0.5)), sdSegment(g, vec2(0.26, -0.5), vec2(-0.26, 0.5)));
  float d = t < 1.5 ? dI : t < 2.5 ? dV : dX;
  float zero = abs(length(q / vec2(0.34, 0.5)) - 1.0) * 0.36;
  return n < 0.5 ? zero : d;
}
// LE MAT in the bottom cartouche: four strokes per letter (unused ones far away)
const vec4 ZB_FAR = vec4(9.0);
const vec4 ZB_LM[20] = vec4[20](
  vec4(0.0, -0.5, 0.0, 0.5), vec4(0.0, -0.5, 0.48, -0.5), ZB_FAR, ZB_FAR,                                       // L
  vec4(0.0, -0.5, 0.0, 0.5), vec4(0.0, 0.5, 0.46, 0.5), vec4(0.0, 0.0, 0.36, 0.0), vec4(0.0, -0.5, 0.48, -0.5),   // E
  vec4(0.0, -0.5, 0.0, 0.5), vec4(0.0, 0.5, 0.33, -0.2), vec4(0.33, -0.2, 0.66, 0.5), vec4(0.66, 0.5, 0.66, -0.5), // M
  vec4(0.0, -0.5, 0.30, 0.5), vec4(0.30, 0.5, 0.60, -0.5), vec4(0.11, -0.12, 0.49, -0.12), ZB_FAR,               // A
  vec4(-0.02, 0.5, 0.58, 0.5), vec4(0.28, 0.5, 0.28, -0.5), ZB_FAR, ZB_FAR);                                    // T
float zb_leMat(vec2 q) {
  float x = q.x + 2.05;
  float li = x < 0.66 ? 0.0 : x < 1.55 ? 1.0 : x < 2.95 ? 2.0 : x < 3.62 ? 3.0 : 4.0;
  float x0 = li < 0.5 ? 0.0 : li < 1.5 ? 0.74 : li < 2.5 ? 1.90 : li < 3.5 ? 2.80 : 3.56;
  vec2 g = vec2(x - x0, q.y);
  int b = int(li) * 4;
  return min(min(zb_seg(g, ZB_LM[b]), zb_seg(g, ZB_LM[b + 1])), min(zb_seg(g, ZB_LM[b + 2]), zb_seg(g, ZB_LM[b + 3])));
}
// the emblems of the trumps I..XXI in panel units (panel half-width 1), drawn box, star, circle:
//   ZB_EB box (half x, half y, centre y, cross 0/1); ZB_ES star (radius, points (negative:
//   inverted), sharpness, centre y); ZB_EC circle (kind 1 disc 2 ring 3 crescent 4 pair 5 wreath,
//   radius, centre x (pair: half spacing), centre y); ZB_ECOL colours (box, star, circle, ground):
//   0 red 1 blue 2 yellow 3 flesh 4 green 5 ink
const vec4 ZB_EB[21] = vec4[21](
  vec4(0.06, 0.55, -0.25, 0.0), vec4(0.30, 0.18, -0.70, 0.0), vec4(0.07, 0.36, -0.35, 1.0), vec4(0.34, 0.32, -0.10, 0.0),
  vec4(0.08, 0.62, 0.0, 1.0),   vec4(0.0),                    vec4(0.44, 0.28, 0.12, 0.0),  vec4(0.52, 0.045, 0.32, 0.0),
  vec4(0.28, 0.34, 0.12, 0.0),  vec4(0.0),                    vec4(0.0),                    vec4(0.08, 0.62, 0.05, 1.0),
  vec4(0.05, 0.62, -0.20, 0.0), vec4(0.30, 0.035, 0.08, 0.0), vec4(0.0),                    vec4(0.22, 0.58, -0.12, 0.0),
  vec4(0.0),                    vec4(0.55, 0.04, -0.78, 0.0), vec4(0.0),                    vec4(0.46, 0.06, 0.52, 0.0),
  vec4(0.0));
const vec4 ZB_ES[21] = vec4[21](
  vec4(0.0), vec4(0.0), vec4(0.0), vec4(0.24, 5.0, 2.4, 0.62),
  vec4(0.0), vec4(0.16, 8.0, 3.0, 0.78), vec4(0.0), vec4(0.0),
  vec4(0.24, 6.0, 2.6, 0.12), vec4(0.44, 8.0, 5.0, 0.10), vec4(0.52, 12.0, 3.4, 0.10), vec4(0.0),
  vec4(0.0), vec4(0.0), vec4(0.46, -5.0, 2.6, 0.05), vec4(0.30, 3.0, 4.0, 0.74),
  vec4(0.50, 8.0, 3.2, 0.10), vec4(0.0), vec4(0.56, 16.0, 4.2, 0.10), vec4(0.0),
  vec4(0.16, 5.0, 2.4, 0.05));
const vec4 ZB_EC[21] = vec4[21](
  vec4(2.0, 0.26, 0.0, 0.48),  vec4(3.0, 0.42, 0.10, 0.18), vec4(2.0, 0.28, 0.0, 0.36),  vec4(0.0),
  vec4(1.0, 0.17, 0.0, -0.78), vec4(4.0, 0.25, 0.22, 0.05), vec4(4.0, 0.17, 0.32, -0.42), vec4(4.0, 0.15, 0.46, 0.05),
  vec4(0.0),                   vec4(2.0, 0.46, 0.0, 0.10),  vec4(1.0, 0.30, 0.0, 0.10),  vec4(1.0, 0.15, 0.0, -0.50),
  vec4(3.0, 0.42, 0.12, 0.40), vec4(4.0, 0.17, 0.32, -0.05), vec4(0.0),                  vec4(0.0),
  vec4(1.0, 0.07, 0.0, 0.10),  vec4(3.0, 0.46, 0.08, 0.15), vec4(1.0, 0.30, 0.0, 0.10),  vec4(2.0, 0.24, 0.0, -0.25),
  vec4(5.0, 0.62, 0.0, 0.05));
const vec4 ZB_ECOL[21] = vec4[21](
  vec4(0, 2, 2, 4), vec4(0, 2, 1, 1), vec4(2, 2, 2, 4), vec4(0, 2, 2, 4), vec4(2, 2, 1, 0), vec4(0, 2, 0, 4), vec4(1, 2, 2, 4),
  vec4(2, 2, 2, 0), vec4(1, 2, 2, 4), vec4(0, 2, 2, 2), vec4(0, 0, 2, 4), vec4(0, 2, 3, 4), vec4(3, 2, 5, 5), vec4(1, 2, 1, 4),
  vec4(0, 0, 2, 5), vec4(3, 2, 2, 2), vec4(0, 2, 2, 1), vec4(1, 2, 1, 1), vec4(0, 0, 2, 2), vec4(2, 2, 3, 1), vec4(0, 3, 4, 1));
vec3 zb_pal(float i) {
  return i < 0.5 ? ZB_RED : i < 1.5 ? ZB_BLUE : i < 2.5 ? ZB_YEL : i < 3.5 ? ZB_FLESH : i < 4.5 ? ZB_GRN : ZB_INK;
}
// the light that falls on the table top (wheel units): the four candles and the lamps above
const vec2 ZB_CANDLE = vec2(4.25, 2.35);
vec3 zb_light(vec2 w) {
  vec2 a = abs(w) - ZB_CANDLE, b = vec2(abs(w.x) + ZB_CANDLE.x, abs(w.y) - ZB_CANDLE.y), c = vec2(abs(w.x) - ZB_CANDLE.x, abs(w.y) + ZB_CANDLE.y);
  float s = 1.0 / (1.0 + dot(a, a) * 0.35) + 0.5 / (1.0 + dot(b, b) * 0.35) + 0.5 / (1.0 + dot(c, c) * 0.35);
  return vec3(0.62, 0.58, 0.56) + ZB_WARM * 0.75 * uZbFlame * s;
}
// a card (c: card units, pe one pixel there). n = 0 the Fool: its picture panel shows pic; n = 1..21
// a trump with its emblem. lt: the light on it; fine: the paper texture's anti-strobe contrast
vec3 zb_card(vec2 c, float pe, float n, vec3 pic, vec3 lt, float fine) {
  float g = vnoise(c * 17.0 + n * 7.31);
  vec3 paper = vec3(0.80, 0.69, 0.50) * (0.93 + 0.12 * mix(0.5, g, fine));
  float dc = sdBox(c, ZB_CARD - 0.07) - 0.07;
  paper *= 0.86 + 0.14 * smoothstep(0.0, -0.22, dc);
  float blot = 0.85 + 0.15 * mix(0.5, g, fine);
  float dO = sdBox(c, ZB_CARD - 0.085), dI = sdBox(c, ZB_CARD - 0.155), dP = sdBox(c, ZB_PANEL);
  vec3 col = mix(paper, ZB_YEL * blot, 0.85 * zb_fl(dO, pe) * (1.0 - zb_fl(dI, pe)));
  // the trump's emblem on cream, its ground strip below (the hub-only programs leave it out)
  vec2 q = c / ZB_PANEL.x;
  float qe = pe / ZB_PANEL.x, lw = max(0.022, 0.5 * qe);
  vec3 emb = paper * vec3(0.98, 0.95, 0.88);
  float gy = q.y + 1.15 + 0.04 * sin(q.x * 7.0 + n);
#ifndef ZB_HUBONLY
  int k = int(clamp(n, 1.0, 21.0)) - 1;
  vec4 eb = ZB_EB[k], es = ZB_ES[k], ec = ZB_EC[k], ci = ZB_ECOL[k];
  emb = mix(emb, zb_pal(ci.w) * blot, 0.9 * zb_fl(gy, qe));
  emb = mix(emb, ZB_INK, 0.5 * zb_ln(gy, lw, qe));
  vec2 bq = q - vec2(0.0, eb.z);
  float db = min(sdBox(bq, eb.xy), mix(1e3, sdBox(bq - vec2(0.0, 0.28 * eb.y), vec2(0.55 * eb.y, eb.x)), eb.w));
  db = eb.x > 0.0 ? db : 1e3;
  float ds = es.x > 0.0 ? zb_star((q - vec2(0.0, es.w)) * vec2(1.0, sign(es.y)), es.x, abs(es.y), es.z) : 1e3;
  vec2 cq = q - vec2(ec.z, ec.w);
  cq.x = ec.x > 3.5 && ec.x < 4.5 ? abs(q.x) - ec.z : cq.x;
  float d1 = length(cq) - ec.y;
  float dcr = max(d1, -(length(cq - vec2(0.42, 0.18) * ec.y) - 0.86 * ec.y));
  float dcc = ec.x < 1.5 ? d1 : ec.x < 2.5 ? abs(d1) - 0.07 : ec.x < 3.5 ? dcr : ec.x < 4.5 ? d1 : abs(length(cq / vec2(0.62, 1.0)) - ec.y) * 0.62 - 0.06;
  dcc = ec.x > 0.5 ? dcc : 1e3;
  emb = mix(emb, zb_pal(ci.x) * blot, zb_fl(db, qe));
  emb = mix(emb, ZB_INK, zb_ln(db, lw, qe));
  emb = mix(emb, zb_pal(ci.y) * blot, zb_fl(ds, qe));
  emb = mix(emb, ZB_INK, zb_ln(ds, lw, qe));
  emb = mix(emb, zb_pal(ci.z) * blot, zb_fl(dcc, qe));
  emb = mix(emb, ZB_INK, zb_ln(dcc, lw, qe));
#endif
  bool fool = n < 0.5;
  // the Fool's picture: the eye over a strip of yellow ground (printed in the same stencil colours)
  vec3 fp = mix(pic, mix(ZB_YEL * vec3(0.85, 0.72, 0.55), ZB_GRN, 0.15 + 0.15 * sin(q.x * 3.0)) * blot * 0.75, 0.94 * zb_fl(gy + 0.05, qe));
  float hatch = zb_ln(fract((q.x + q.y * 0.6) * 9.0 + 0.5) - 0.5, 0.09, qe * 9.0) * smoothstep(0.30, 0.10, -(gy + 0.05)) * zb_fl(gy + 0.05, qe);
  fp = mix(fp, ZB_INK, 0.45 * hatch * smoothstep(2.0, 5.0, 1.0 / (9.0 * qe)));
  fp = mix(fp, ZB_INK, 0.6 * zb_ln(gy + 0.05, lw, qe));
  col = mix(col, fool ? fp : emb, zb_fl(dP, pe));
  // the numeral above the picture, the name below it (LE MAT; a trump's name greeked)
  float hgt = 0.17;
  float yN = 0.5 * (ZB_CARD.y - 0.155 + ZB_PANEL.y + 0.035);
  vec2 qn = (c - vec2(0.0, yN)) / hgt;
  col = mix(col, ZB_INK, zb_ln(zb_numeral(qn, n) * hgt, max(0.024, 0.55 * pe), pe) * step(0.0, c.y));
  vec2 qm = (c + vec2(0.0, yN)) / hgt;
#ifdef ZB_HUBONLY
  float dm = zb_leMat(qm) * hgt;
#else
  float kx = floor(qm.x / 0.32);
  float gk = (abs(qm.x) < 0.9 + 0.6 * hash11(n * 3.1) && hash11(kx + n * 7.7) > 0.25) ? max(abs(qm.y) - 0.42, abs(fract(qm.x / 0.32) - 0.5) * 0.32 - 0.07) : 1e3;
  float dm = (fool ? zb_leMat(qm) : gk) * hgt;
#endif
  col = mix(col, ZB_INK, zb_ln(dm, max(0.022, 0.55 * pe), pe) * step(c.y, 0.0));
  // the compartments' ink, the outer frame, a red rule inside the picture
  vec2 cq2 = vec2(c.x, abs(c.y) - 0.5 * (ZB_CARD.y - 0.155 + ZB_PANEL.y + 0.035));
  float dCart = sdBox(cq2, vec2(ZB_CARD.x - 0.155, 0.5 * (ZB_CARD.y - 0.155 - ZB_PANEL.y - 0.035)));
  float ink = zb_ln(dO, max(0.016, 0.5 * pe), pe) + zb_ln(dI, max(0.012, 0.45 * pe), pe) + zb_ln(dP, max(0.020, 0.55 * pe), pe) + zb_ln(dCart, max(0.014, 0.5 * pe), pe);
  col = mix(col, ZB_RED * blot, 0.8 * zb_ln(dP + 0.045, max(0.010, 0.45 * pe), pe));
  col = mix(col, ZB_INK, sat(ink) * (0.9 + 0.1 * mix(0.5, g, fine)));
  // the Fool's picture glows: it is not lit by the candles
  float lum = fool ? zb_fl(dP + 0.03, pe) : 0.0;
  return mix(col * lt, col, lum);
}
// a candle at b (wheel units): it leans away from the camera's nadir as tall things do in a wide
// lens; wax body, a molten pool round the wick, the flame and its glow
vec3 zb_candle(vec2 w, float pe, vec2 b, vec3 col) {
  vec2 d = b - uZbNad;
  vec2 top = b + d * (0.75 / max(uZbHgt - 0.75, 1.0));
  vec2 tip = b + d * (1.35 / max(uZbHgt - 1.35, 1.0));
  float rad = 0.24;
  float body = sdSegment(w, b, top) - rad;
  float topD = length(w - top) - rad * 0.97;
  float fl = uZbFlame * (b.y < 0.0 ? (b.x < 0.0 ? uZbFlick.x : uZbFlick.y) : (b.x < 0.0 ? uZbFlick.z : uZbFlick.w));
  col *= 1.0 - 0.45 * smoothstep(0.25, -0.12, sdSegment(w, b, b + vec2(0.28, -0.36)) - rad);
  float side = sat(0.5 + 0.5 * dot(w - b, vec2(-0.6, 0.8)) / rad);
  float along = dot(w - b, normalize(top - b + vec2(1e-4)));
  vec3 wax = vec3(0.66, 0.62, 0.54) * (0.08 + 0.24 * side) * (0.75 + 0.25 * sin(along * 30.0 + side * 3.0)) + vec3(0.30, 0.12, 0.03) * 0.35 * fl * smoothstep(0.7 * rad, 0.0, length(w - top));
  col = mix(col, wax, zb_fl(body, pe));
  float pr = length(w - top) / rad;
  vec3 pool = mix(vec3(0.95, 0.62, 0.30) * (0.6 + 0.3 * fl), vec3(0.50, 0.40, 0.29), smoothstep(0.15, 0.95, pr));
  col = mix(col, pool, zb_fl(topD, pe));
  col = mix(col, vec3(0.42, 0.34, 0.25), zb_ln(topD, 0.6 * pe, pe) * 0.7);
  col = mix(col, vec3(0.03), zb_fl(length(w - top) - 0.03, pe));
  vec2 ax = tip - top;
  float L = max(length(ax), 0.12);
  vec2 dir = ax / L;
  vec2 fq = vec2(dot(w - top, vec2(-dir.y, dir.x)), dot(w - top, dir));
  float fw = 0.085 * (1.0 - smoothstep(0.0, L + 0.10, fq.y)) * smoothstep(-0.10, 0.03, fq.y) + 0.03;
  float fd = max(abs(fq.x) - fw, max(-fq.y - 0.07, fq.y - L - 0.12));
  col += vec3(1.0, 0.45, 0.12) * 2.2 * fl * zb_fl(fd, pe + 0.02);
  col += vec3(1.0, 0.86, 0.62) * 3.0 * fl * zb_fl(fd + 0.035, pe + 0.01);
  col += vec3(1.0, 0.48, 0.16) * 0.35 * fl * exp(-length(w - top - 0.4 * ax) * 1.6);
  return col;
}
// the cloth: ultramarine velvet with a fine gold star weave, the wheel embroidered in gold thread
vec3 zb_cloth(vec2 w, float pe, float rr, float ang, float rs) {
  float n1 = vnoise(w * 1.3 + 3.1);
  vec3 col = vec3(0.010, 0.020, 0.150) * (0.62 + 0.50 * n1);
  // the weave: a diamond lattice of small four-point gold stars
  const float SP = 0.15;
  vec2 sw = vec2(w.x + w.y, w.y - w.x) * (0.7071 / SP);
  vec2 cell = floor(sw + 0.5), f = sw - cell;
  vec2 fq = vec2(f.x - f.y, f.x + f.y) * (0.7071 * SP);
  float h = hash21(cell);
  float as = zb_as(rs, SP, pe) * smoothstep(2.5 * pe, 6.0 * pe, SP);
  vec2 aq = abs(fq);
  float star = zb_fl(min(0.3 * aq.x + aq.y, aq.x + 0.3 * aq.y) - 0.3 * (0.022 + 0.014 * h), pe * 0.6) * (0.45 + 0.55 * h);
  float thr = (zb_ln(f.x, 0.025, pe / SP * 0.7071) + zb_ln(f.y, 0.025, pe / SP * 0.7071)) * 0.10;
  col += vec3(1.0, 0.68, 0.24) * mix(0.02, 1.0 * star + thr, as);
  // the wheel: rings, a zigzag rim, a spoke between every two trumps; satin stitches up close
  float lw = max(0.010, 0.5 * pe);
  float zz = rr - 3.23 - 0.09 * (4.0 * abs(fract((ang - uZbWheel) * 63.0 / TAU) - 0.5) - 1.0);
  float sa = (ang - uZbWheel - PI * 0.5) / (TAU / 21.0) + 0.5;
  float spd = abs(fract(sa) - 0.5) * (TAU / 21.0) * rr;
  float as2 = zb_as(rs, 0.25, pe);
  float rim = zb_ln(rr - 3.12, lw, pe) + zb_ln(rr - 3.34, lw, pe) + zb_ln(zz, lw * 0.8, pe) * as2 + 0.4 * zb_ln(rr - 0.86, lw, pe)
            + zb_ln(rr - 1.82, lw, pe) + zb_ln(spd, lw * 0.8, pe) * step(0.86, rr) * step(rr, 1.82) * as2;
  float stitch = mix(1.0, 0.70 + 0.30 * step(0.5, fract((rr + ang * rr) * 60.0)), smoothstep(4.0, 9.0, lw / pe) * as2);
  col = mix(col, vec3(0.95, 0.66, 0.22) * 0.8 * stitch, sat(rim) * 0.85 * uZbOn.y);
  return col;
}
// the table top seen from above (w: wheel units): the cloth, the wheel, the ring of trumps, the
// nearest candle, and the hub card, whose picture panel shows pic
vec3 zb_tableTop(vec2 w, float pe, vec3 pic, float rs) {
  vec3 lt = zb_light(w);
  float rr = length(w), ang = zb_atan(w.y, w.x);
  vec3 col = zb_cloth(w, pe, rr, ang, rs) * lt;
  // the card under this point: the hub, or the ring's slot (its top facing out)
#ifdef ZB_HUBONLY
  bool hub = true;
  vec2 cl = w / ZB_SC;
  float n = 0.0, on = 1.0;
#else
  float slot = TAU / 21.0;
  float ra = ang - uZbWheel - PI * 0.5;
  float sid = floor(ra / slot + 0.5), la = ra - sid * slot;
  bool hub = rr < 1.3;
  vec2 cl = hub ? w / ZB_SC : vec2(-rr * sin(la), rr * cos(la) - ZB_RMID) / ZB_SC;
  float n = hub ? 0.0 : mod(-sid, 21.0) + 1.0;
  float on = hub ? 1.0 : uZbOn.y;
#endif
  float pc = pe / ZB_SC;
  float dcard = sdBox(cl, ZB_CARD - 0.07) - 0.07;
  col *= 1.0 - 0.5 * on * smoothstep(0.9, -0.2, sdBox(cl + vec2(-0.10, 0.22), ZB_CARD - 0.07) - 0.07);
  vec3 cc = zb_card(cl, pc, n, pic, lt, zb_as(rs, 0.3 * ZB_SC, pe));
  cc = hub && uZbOn.x < 0.5 ? pic : cc;
  col = mix(col, cc, zb_fl(dcard, pc) * on);
  // the nearest candle
  vec2 b = vec2(w.x < 0.0 ? -ZB_CANDLE.x : ZB_CANDLE.x, w.y < 0.0 ? -ZB_CANDLE.y : ZB_CANDLE.y);
  vec3 cd = zb_candle(w, pe, b, col);
  return mix(col, cd, uZbOn.y);
}
// the table top a few dozen pixels wide: the cloth and its embroidered wheel, the cards as framed
// cream tiles with their ground strips, the hub with its glowing picture, the candles
vec3 zb_tableCheap(vec2 w, float pe) {
  vec3 lt = zb_light(w);
  float rr = length(w), ang = zb_atan(w.y, w.x);
  vec3 col = vec3(0.010, 0.020, 0.150) * (0.62 + 0.50 * vnoise(w * 1.3 + 3.1)) + vec3(0.020, 0.0136, 0.0048);
  float lw = max(0.02, 0.5 * pe);
  float sa = (ang - uZbWheel - PI * 0.5) / (TAU / 21.0) + 0.5;
  float spd = abs(fract(sa) - 0.5) * (TAU / 21.0) * rr;
  float rim = zb_ln(rr - 3.23, max(0.07, 0.5 * pe), pe) * 0.6 + zb_ln(rr - 1.82, lw, pe) + 0.4 * zb_ln(rr - 0.86, lw, pe) + 0.25 * zb_ln(spd, lw * 0.6, pe) * step(0.86, rr) * step(rr, 1.82);
  col = mix(col, vec3(0.95, 0.66, 0.22) * 0.8, sat(rim) * 0.85 * uZbOn.y);
  float slot = TAU / 21.0, ra = ang - uZbWheel - PI * 0.5, la = ra - floor(ra / slot + 0.5) * slot;
  vec2 rl = vec2(-rr * sin(la), rr * cos(la) - ZB_RMID);
  vec2 hs = ZB_CARD * ZB_SC;
  float dr = sdBox(rl, hs - 0.02) - 0.02;
  vec3 tile = mix(vec3(0.66, 0.55, 0.36), vec3(0.50, 0.42, 0.28), zb_fl(sdBox(rl, hs * vec2(0.8, 0.72)), pe));
  tile = mix(tile, vec3(0.40, 0.38, 0.20), step(rl.y, -0.40 * hs.y) * step(-0.72 * hs.y, rl.y));
  tile = mix(tile, vec3(0.30, 0.10, 0.06), zb_fl(length(rl) - 0.28 * hs.x, pe) * 0.7);
  tile = mix(tile, vec3(0.12, 0.10, 0.10), zb_fl(abs(rl.y - 0.80 * hs.y) - 0.05 * hs.y, pe) * step(abs(rl.x), 0.3 * hs.x));
  tile = mix(tile, ZB_INK, zb_ln(sdBox(rl, hs - 0.04), max(0.012, 0.5 * pe), pe) * 0.9);
  col = mix(col, tile, zb_fl(dr, pe) * uZbOn.y);
  float dh = sdBox(w, hs - 0.02) - 0.02;
  col = mix(col, vec3(0.70, 0.60, 0.42), zb_fl(dh, pe));
  col *= lt;
  col = mix(col, vec3(0.30, 0.06, 0.02) + vec3(0.6, 0.25, 0.04) * exp(-dot(w, w) * 40.0), zb_fl(sdBox(w, ZB_PANEL * ZB_SC), pe));
  vec2 b = vec2(w.x < 0.0 ? -ZB_CANDLE.x : ZB_CANDLE.x, w.y < 0.0 ? -ZB_CANDLE.y : ZB_CANDLE.y);
  vec2 d = b - uZbNad;
  vec2 top = b + d * (0.75 / max(uZbHgt - 0.75, 1.0));
  col = mix(col, vec3(0.66, 0.62, 0.54) * 0.14 + vec3(0.30, 0.12, 0.03) * 0.25, zb_fl(sdSegment(w, b, top) - 0.24, pe) * uZbOn.y);
  col += (vec3(1.0, 0.70, 0.36) * 2.6 * zb_fl(length(w - top - 0.15 * d / max(length(d), 1e-3)) - 0.09, pe)
       + vec3(1.0, 0.48, 0.16) * 0.35 * exp(-length(w - top) * 1.6)) * uZbFlame * uZbOn.y;
  return col;
}
`;

  // ---------------------------------------------------------------- L3: the plywood Holy Mountain set
  // metres, y up, the set faces +z. Analytic boxes and planes (no marching): a five-step mountain,
  // the table on its summit, four fresnels on stands aimed at the table, a camera crane, cables down
  // the steps, a painted backdrop of coarse mandala rings; the thin things come projected (uZbSA..).
  const ZB_SET = `
uniform vec3  uZbCamP;    // set camera position (metres)
uniform mat3  uZbCamM;    // set camera basis: right, up, forward
uniform float uZbCamF;    // set camera focal length (screen units)
uniform float uZbHaze;    // the lamps' beams in the haze (they fade in as the crane leaves the table)
uniform vec4  uZbSA[9];  // thin things projected into the picture plane: endpoints a.xy, b.xy (picture units)
uniform vec4  uZbSB[9];  //   their depths at a and b along the camera's axis, radii at a and b (metres)
uniform vec4  uZbLH[4];   // lamp heads: centre (picture units), picture units per metre, depth along the axis
uniform vec4  uZbLD[4];   //   the aim projected (unit 2D), how much it points along the view axis 0..1, lens facing us 0/1
const vec4 ZB_TIER[5] = vec4[5](vec4(4.6, 0.55, 3.8, 0.0), vec4(3.75, 1.1, 3.05, 1.0), vec4(2.9, 1.65, 2.3, 2.0), vec4(2.05, 2.2, 1.6, 3.0), vec4(1.25, 2.75, 1.0, 4.0));
const vec3 ZB_TBL = vec3(0.792, 0.456, 2.75);    // table: half x, half z, bottom (its top is ZB_TY)
const vec3 ZB_LAMP[4] = vec3[4](vec3(-5.2000, 4.8000, 3.4000), vec3(5.2000, 4.8000, 3.4000), vec3(-5.8000, 5.5000, -2.9000), vec3(5.8000, 5.5000, -2.9000));
const vec3 ZB_AIM[4] = vec3[4](vec3(0.8192, -0.2048, -0.5356), vec3(-0.8192, -0.2048, -0.5356), vec3(0.8547, -0.2947, 0.4273), vec3(-0.8547, -0.2947, 0.4273));   // each lamp's aim (at the table) and frame
const vec3 ZB_LRT[4] = vec3[4](vec3(0.5472, -0.0000, 0.8370), vec3(0.5472, 0.0000, -0.8370), vec3(-0.4472, 0.0000, 0.8944), vec3(-0.4472, 0.0000, -0.8944));
const vec3 ZB_LUP[4] = vec3[4](vec3(0.1714, 0.9788, -0.1121), vec3(-0.1714, 0.9788, -0.1121), vec3(0.2636, 0.9556, 0.1318), vec3(-0.2636, 0.9556, 0.1318));
const vec3 ZB_TGT = vec3(0.0, 3.5, 0.0);
const vec3 ZB_PIV = vec3(-6.6, 4.0, -1.3);       // the crane's pivot; its arm runs to the camera
const vec3 ZB_TIP = vec3(0.12, 5.45, -0.62);
const vec3 ZB_CW = vec3(-8.6160, 3.5650, -1.5040); // the counterweight: the pivot + 0.3 (pivot - tip)
const vec3 ZB_RCAM = vec3(0.12, 5.17, -0.62);    // the crane camera, looking down at the cards
vec2 zb_box(vec3 ro, vec3 ird, vec3 bmin, vec3 bmax) {
  vec3 t0 = (bmin - ro) * ird, t1 = (bmax - ro) * ird;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  return vec2(max(max(tn.x, tn.y), tn.z), min(min(tf.x, tf.y), tf.z));
}
// closest approach of a ray to the segment ab: (distance, ray parameter)
vec2 zb_raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b) {
  vec3 ba = b - a, oa = ro - a;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa);
  float s = clamp((baoa - rdoa * bard) / max(baba - bard * bard, 1e-6), 0.0, 1.0);
  float t = max(s * bard - rdoa, 0.0);
  return vec2(length(oa + t * rd - s * ba), t);
}
// a thin rod: its coverage along the ray (radius rad metres, never under ~0.6 px), behind tH = 0
float zb_rod(vec3 ro, vec3 rd, vec3 a, vec3 b, float rad, float pw0, float tH) {
  vec2 s = zb_raySeg(ro, rd, a, b);
  float pl = pw0 * s.y;
  return zb_fl(s.x - max(rad, 0.6 * pl), pl) * step(s.y, tH);
}
// under fast motion a colour keeps its hue but takes one common luminance (flicker is luminance)
vec3 zb_eqLum(vec3 c, float k) { return mix(c * (0.20 / max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.02)), c, k); }
vec3 zb_tierCol(float k) { return k < 0.5 ? ZB_RED : k < 1.5 ? ZB_YEL : k < 2.5 ? ZB_BLUE : k < 3.5 ? ZB_FLESH : ZB_GRN; }
// lamp light at a point (n: normal): the four fresnels aimed at the table, and a soft fill
// (the four fresnels' combined key: mostly from above and in front, pooled round the summit)
vec3 zb_lit(vec3 h, vec3 n) {
  vec2 r = h.xz - vec2(0.0, 0.3);
  float pool = exp(-dot(r, r) * 0.045) * (0.55 + 0.45 * smoothstep(0.0, 3.5, h.y));
  float key = 0.80 * n.y + 0.42 * max(n.z, 0.0) + 0.22 * abs(n.x) + 0.10 * max(-n.z, 0.0);
  return vec3(0.20, 0.19, 0.22) * (0.6 + 0.4 * n.y) + ZB_WARM * 1.25 * uZbFlame * key * pool;
}
// the set along a ray; tab: the table top's picture (the cloth), aT its coverage, tTab its distance
vec3 zb_set(vec3 ro, vec3 rd, float pw0, vec3 tab, float aT, float tTab, vec2 q, float peQ) {
  vec3 ird = 1.0 / rd;
  float tH = 1e4, kind = -1.0; vec3 bH = vec3(1.0);
  for (int i = 0; i < 5; i++) {
    vec4 T = ZB_TIER[i];
    vec2 tb = zb_box(ro, ird, vec3(-T.x, 0.0, -T.z), T.xyz);
    if (tb.x < tb.y && tb.x > 0.0 && tb.x < tH) { tH = tb.x; kind = T.w; bH = T.xyz; }
  }
  vec2 tb = zb_box(ro, ird, vec3(-ZB_TBL.x, ZB_TBL.z, -ZB_TBL.y), vec3(ZB_TBL.x, ZB_TY, ZB_TBL.y));
  if (tb.x < tb.y && tb.x > 0.0 && tb.x < tH) { tH = tb.x; kind = 5.0; bH = vec3(ZB_TBL.x, ZB_TY, ZB_TBL.y); }
  float tF = -ro.y / min(rd.y, -1e-5);
  if (tF > 0.0 && tF < tH) { tH = tF; kind = 8.0; }
  float tB = (-7.6 - ro.z) / min(rd.z, -1e-5);
  vec3 hb = ro + rd * tB;
  if (tB > 0.0 && tB < tH && abs(hb.x) < 12.5 && hb.y < 9.4) { tH = tB; kind = 9.0; }

  vec3 h = ro + rd * tH;
  float pw = pw0 * tH;                              // one pixel in metres at the hit
  // anti-strobe: under the fast crane move the painted bands, edges, cables and boards sweep across
  // the frame (about five bands per unit of log distance): they fade to their mean as it speeds up
  float msk = moAntiStrobe(uZbAS * 3.0);
  // the hit's normal (a box face, the floor, the backdrop)
  float dx = bH.x - abs(h.x), dz = bH.z - abs(h.z), dy = bH.y - h.y;
  vec3 n = dy < min(dx, dz) ? vec3(0.0, 1.0, 0.0) : (dx < dz ? vec3(sign(h.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(h.z)));
  n = kind > 7.5 ? (kind < 8.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0)) : kind > 5.5 ? vec3(0.0, 0.7, 0.7) : n;
  float top = n.y > 0.9 ? 1.0 : 0.0;
  float grain = vnoise(kind > 8.5 ? h.xy * 3.0 : h.xz * 4.0 + h.y * 3.0);
  // a tier: painted risers, lighter treads, a pale plywood edge round each face, screws, cables
  float yLow = ZB_TIER[int(clamp(kind - 1.0, 0.0, 4.0))].y * step(0.5, kind);
  vec3 c = zb_eqLum(mix(zb_tierCol(kind), vec3(0.62, 0.47, 0.30), 0.35 * top) * (0.80 + 0.06 * top), msk) * (0.88 + 0.12 * grain);
  float ed = top > 0.5 ? min(dx, dz) : min(min(dy, h.y - yLow), n.x != 0.0 ? dz : dx);
  float ew = max(0.03, 1.2 * pw);
  c = mix(c, vec3(0.80, 0.66, 0.46), zb_fl(ed - ew, pw) * mix(0.3, 1.0, msk));
  c = mix(c, c * 0.45, zb_ln(ed - ew - 0.012, 0.006, pw) * msk);
  float along = dx < dz ? h.z : h.x;
  c = mix(c, ZB_INK, zb_fl(length(vec2((fract(along / 0.35 + 0.5) - 0.5) * 0.35, ed - 0.09)) - 0.016, pw) * 0.7 * top);
  float cw = 0.10 * sin(h.z * 1.7 + h.y * 2.0);
  float cab = min(min(abs(h.x + 0.55 - cw), abs(h.x - 0.07 + cw)), abs(h.x - 0.69 - 0.6 * cw)) - 0.024;
  c = mix(c, vec3(0.012), zb_fl(cab, pw) * step(-0.5, h.z) * step(0.5, n.z + n.y) * mix(0.3, 1.0, msk));
  // the table's skirt: velvet folds under a gold braid
  vec3 cSkirt = vec3(0.017, 0.031, 0.22) * (0.80 + 0.20 * msk * sin((n.x != 0.0 ? h.z : h.x) * 22.0 + 1.5 * sin((n.x != 0.0 ? h.z : h.x) * 7.0))) * (0.6 + 0.4 * smoothstep(ZB_TBL.z, ZB_TY, h.y));
  cSkirt = mix(cSkirt, vec3(0.9, 0.62, 0.2), zb_ln(ZB_TY - h.y - 0.035, 0.008, pw) * 0.8);
  // the studio floor: dark boards, tape marks
  vec2 f = h.xz;
  vec3 cf = vec3(0.030, 0.030, 0.036) * (0.85 + 0.15 * grain);
  cf = mix(cf, cf * 0.5, zb_ln(fract(f.x / 0.9 + 0.5) - 0.5, 0.004, pw / 0.9) * 0.8 * msk);
  vec2 m = vec2(abs(f.x) - 5.0, f.y - 3.4);
  cf = mix(cf, vec3(0.45, 0.37, 0.12), zb_fl(min(abs(m.x - m.y), abs(m.x + m.y)) - 0.03, pw) * step(max(abs(m.x), abs(m.y)), 0.22));
#ifdef ZB_SET_NEAR
  vec3 cb = vec3(0.3);
#else
  // the backdrop: a flat painted with coarse mandala rings, plywood seams
  vec2 bq = vec2(h.x, h.y - 4.4);
  float br = length(bq), ba = zb_atan(bq.y, bq.x);
  float ring = floor(br / 1.15);
  float pet = br - (ring + 0.5) * 1.15 - 0.22 * abs(sin(ba * (6.0 + 2.0 * ring)));
  vec3 cb = mix(zb_tierCol(mod(ring + 2.0, 5.0)), vec3(0.75, 0.66, 0.50), 0.25);
  cb = mix(cb, mix(zb_tierCol(mod(ring + 3.0, 5.0)), vec3(0.8, 0.7, 0.5), 0.15), step(0.0, pet) * 0.85);
  cb = mix(cb, ZB_INK, zb_ln(fract(br / 1.15 + 0.5) - 0.5, 0.012, pw / 1.15) * 0.8 + zb_ln(pet, 0.02, pw) * 0.5);
  cb = mix(cb * (0.8 + 0.2 * grain), ZB_INK, zb_ln(fract(h.x / 2.44 + 0.5) - 0.5, 0.004, pw / 2.44) * 0.7);
  cb = zb_eqLum(cb, msk) * (0.30 + 0.40 * exp(-br * br * 0.025));
#endif
  vec3 alb = kind < 4.5 ? c : kind < 5.5 ? cSkirt : kind < 7.5 ? vec3(0.06, 0.06, 0.07) : kind < 8.5 ? cf : cb;
  vec3 col = alb * mix(vec3(0.95, 0.88, 0.82), zb_lit(h, n), msk);   // fast: flat light, no tread / riser alternation
  col += kind > 7.5 && kind < 8.5 ? vec3(0.05, 0.035, 0.02) * exp(-dot(f, f) * 0.02) : vec3(0.0);
  col = kind < -0.5 ? vec3(0.004, 0.004, 0.008) + vec3(0.018, 0.013, 0.010) * exp(-abs(rd.y - 0.15) * 5.0) : col;
  // the table top shows the cloth
  float onTab = aT * step(tTab, tH + 0.02);
  col = mix(col, tab, onTab);
  tH = mix(tH, tTab, onTab);
  // thin things, projected by the factory into this picture's plane (q): the lamp stands, the
  // crane's column, arm (a lattice truss) and hanger, the beams in the haze; then the lamp heads.
  // Each is depth-tested against the surface the ray hit (zH: its depth along the camera's axis)
  float zH = tH * dot(rd, uZbCamM[2]);
  // the crane: its column, its arm (a lattice truss), the camera hanging from the tip (red tally light)
  for (int i = 4; i < 7; i++) {
    vec4 A = uZbSA[i], Z = uZbSB[i];
    vec2 pa = q - A.xy, ba = A.zw - A.xy;
    float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float d = length(pa - ba * hh);
    float z = mix(Z.x, Z.y, hh), w = mix(Z.z, Z.w, hh) * uZbCamF / max(z, 0.05);
    float truss = 0.45 + 0.55 * step(0.5, fract(hh * 34.0 + 6.0 * d / max(w, 1e-4)));
    vec3 rc = i == 6 ? vec3(0.03) + vec3(1.0, 0.05, 0.03) * 3.0 * step(length(pa - ba * 0.7), 0.35 * w) : vec3(0.05, 0.05, 0.06) * (i == 5 ? 1.5 * truss : 1.0);
    col = mix(col, rc, zb_fl(d - max(w, 0.6 * peQ), peQ) * step(z, zH) * step(0.05, z));
  }
#ifndef ZB_SET_LITE
  // the lamp stands
  for (int i = 0; i < 4; i++) {
    vec4 A = uZbSA[i], Z = uZbSB[i];
    vec2 pa = q - A.xy, ba = A.zw - A.xy;
    float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float z = mix(Z.x, Z.y, hh), w = Z.z * uZbCamF / max(z, 0.05);
    col = mix(col, vec3(0.05, 0.05, 0.06), zb_fl(length(pa - ba * hh) - max(w, 0.6 * peQ), peQ) * step(z, zH) * step(0.05, z));
  }
#endif
#if !defined(ZB_SET_LITE) && !defined(ZB_SET_NEAR)
  // the front lamps' beams in the haze
  for (int i = 7; i < 9; i++) {
    vec4 A = uZbSA[i], Z = uZbSB[i];
    vec2 pa = q - A.xy, ba = A.zw - A.xy;
    float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    vec2 dd = pa - ba * hh;
    float z = mix(Z.x, Z.y, hh), w = mix(Z.z, Z.w, hh) * uZbCamF / max(z, 0.05);
    col += ZB_WARM * 0.10 * uZbFlame * uZbHaze * (0.3 + 0.7 * msk) * exp(-dot(dd, dd) / max(w * w, 1e-8)) * (1.0 - hh) * step(z, zH) * step(0.05, z);
  }
  for (int i = 0; i < 4; i++) {
    vec4 H = uZbLH[i], Hd = uZbLD[i];
    vec2 o = (q - H.xy) / max(H.z, 1e-4);                    // metres, in the head's picture frame
    vec2 lq = vec2(dot(o, Hd.xy), dot(o, vec2(-Hd.y, Hd.x)));   // x along the projected aim
    float pm = peQ / max(H.z, 1e-4);
    float side = 1.0 - Hd.z;                                 // 1 seen from the side, 0 along the aim
    float hous = sdBox(lq, vec2(0.29 * side + 0.21 * Hd.z, 0.21)) - 0.02;
    float lens = length((lq - vec2(0.29 * side, 0.0)) / vec2(0.15 * Hd.z + 0.02, 0.15)) - 1.0;
    float vis = step(H.w, zH) * step(0.05, H.w);
    vec3 hc = vec3(0.05, 0.05, 0.055);
    hc = mix(hc, ZB_WARM * 5.0 * uZbFlame * (0.85 + 0.15 * step(0.5, fract(length(lq - vec2(0.29 * side, 0.0)) * 20.0))), zb_fl(lens * 0.15, pm) * Hd.w);
    col = mix(col, hc, zb_fl(hous, pm) * vis);
  }
#endif
#ifdef ZB_SET_LITE
  for (int i = 0; i < 4; i++) {
    vec4 H = uZbLH[i];
    vec2 o = q - H.xy;
    col += ZB_WARM * 2.5 * uZbFlame * uZbLD[i].w * exp(-dot(o, o) / max(0.0225 * H.z * H.z, 1e-8)) * step(H.w, zH) * step(0.05, H.w);
  }
#endif
  return col;
}
// the 3D camera's ray for a picture point q; the table top's wheel coordinates, coverage, distance
void zb_ray(vec2 q, float peQ, out vec3 ro, out vec3 rd, out float pw0, out vec2 w, out float peW, out float aT, out float tTab) {
  ro = uZbCamP;
  rd = normalize(uZbCamM * vec3(q, uZbCamF));
  pw0 = peQ / uZbCamF;
  tTab = (ZB_TY - ro.y) / min(rd.y, -1e-4);
  vec3 ht = ro + rd * tTab;
  w = vec2(ht.x, -ht.z) / ZB_SW;
  peW = min(max(length(dFdx(w)), length(dFdy(w))), 50.0);
  vec2 dt = abs(w) - ZB_TABLE;
  aT = zb_fl(max(dt.x, dt.y), peW) * step(0.0, tTab);
}
`;

  // ---------------------------------------------------------------- L4: the outer eye (coda.eye's)
  const ZB_OUTER = `
uniform float uZbZ4;      // outer eye: screen units per eye unit
uniform float uZbQK;      // pupil -> set picture: picture units per eye unit (eases from the hand-off zoom)
uniform float uZbFish;    // the reflection's convex-mirror bulge
uniform float uZbRefl;    // the reflection's brightness in the black pupil
uniform float uZbBlaze;   // coda.eye's crimson blaze and ground round the iris
// coda.eye's ground and blaze at the numbers of its first frame (its shockwave not yet out: uRing 0.15)
vec3 zb_codaGround(vec2 p, vec2 e, float t, out vec3 blaze) {
  float r = length(p), a = atan(p.y, p.x);
  float ray = 0.5 + 0.5 * cos(a * 16.0 + 0.25 * t);
  float swept = smoothstep(0.10, 0.45, r);
  float rI = r / (EY_R * uZbZ4);
  float near = exp(-max(rI - 1.0, 0.0) * 1.2);
  vec3 bz = mix(vec3(0.62, 0.035, 0.02), vec3(0.95, 0.30, 0.05), 0.35 * ray * near) * (0.30 + 0.70 * ray) * (0.55 + 0.45 * near);
  blaze = bz * uZbBlaze * smoothstep(1.0, 1.05, rI) * swept;
  vec3 bg = vec3(0.30, 0.008, 0.02) * (0.45 + 0.55 * ray) * exp(-r * 0.55) * uZbBlaze * swept;
  return bg + vec3(0.006, 0.0005, 0.001) + vec3(0.06, 0.004, 0.006) * exp(-dot(e, e) * 0.5) * (1.0 - uZbBlaze * swept);
}
// the gold EYE's iris (uIgnite 1, uSun 0) as the fast zoom sees it: each concentric feature (the
// collarette, the crypts, the ring of small eyes, the furrows, the limbal ring) at its average over
// its band, which is what the anti-strobe asks for; the radial fibres hold still under a zoom, so
// they stay. ri: radius in iris units, a: angle + spin, pq: one pixel in iris units
vec3 zb_irisAvg(float ri, float a, float pq) {
  float inner = smoothstep(0.585, 0.535, ri);
  float soft = smoothstep(0.80, 0.36, ri);       // the zones blend wide: the sweep stays gentle
  vec3 c = eyDeep * 2.0 + mix(eyVio * 0.09, eyVerd * 0.08, soft) + mix(eyVio * 0.32, eyVerd * 0.25, soft) * 0.75;
  float rr = max(ri, 0.03);
  float f1 = ey_lines(a / TAU * 90.0, 90.0 / (TAU * rr) * pq, 0.6) * inner * smoothstep(0.24, 0.29, ri);
  c += eyVerd * 0.55 * f1;
  float f3 = ey_lines((a + 0.16 * sin(ri * 7.0 + a * 3.0)) / TAU * 36.0, 36.0 / (TAU * rr) * pq, 1.1) * (1.0 - inner) * smoothstep(0.995, 0.93, ri);
  c += mix(eyVio, eyVerd, 0.5) * 0.55 * f3 + eyVio * 0.22 * (1.0 - inner) * smoothstep(0.995, 0.93, ri);
  c *= 1.0 - 0.12 * exp(-pow((ri - 0.68) / 0.08, 2.0));                       // the crypts
  c += eyBone * 0.08 * exp(-pow((ri - 0.835) / 0.06, 2.0));                    // the small eyes
  c += eyBone * 0.16 * exp(-pow((ri - 0.56) / 0.06, 2.0));                     // the collarette
  c *= 0.62 + 0.38 * smoothstep(1.02, 0.80, ri);
  c += eyVio * (0.3 * exp(-pow((ri - 1.0) / 0.02, 2.0)) + 0.12 * exp(-abs(ri - 1.0) / 0.04));
  float pin = 1.0 - smoothstep(-pq, pq, ri - 0.33 * uPupil);
  c = mix(c, vec3(0.0), pin) + mix(eyEmber, eyVerd, 0.5) * 1.1 * exp(-pow((ri - 0.33 * uPupil) / max(0.012, 1.5 * pq), 2.0));
  return mix(eyDeep * 1.3, c, smoothstep(1.06, 0.99, ri));
}
// the outer eye's pupil (coverage), and the picture point q it reflects
float zb_pupil(vec2 p, out vec2 e4, out vec2 q, out float peQ) {
  e4 = p / uZbZ4 + EY_IC;
  float pe4 = px() / uZbZ4;
  vec2 qi = (e4 - EY_IC - uLook) / EY_R;
  float ri = length(qi);
  float rpw = 0.33 * uPupil + 0.008 * sin((atan(qi.y, qi.x) + uSpin) * 40.0);
  float rho = ri / max(rpw, 1e-3);
  q = (e4 - EY_IC) * uZbQK * (1.0 + uZbFish * rho * rho);
  peQ = pe4 * uZbQK * (1.0 + 3.0 * uZbFish * rho * rho);
  return 1.0 - smoothstep(-pe4 / EY_R, pe4 / EY_R, ri - rpw);
}
`;

  // ---------------------------------------------------------------- the phase programs' main()s
  const MAIN = {
    // the freeze: the heart alone
    heart: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float k = uZbHK / (uZbCam2.x * ZB_SC * ZB_SE);
  fragColor = vec4(zb_heart(p * k, px() * k, uZbHT), 1.0);
}`,
    // the ignition: the great eye replaces the heart from the pupil outward
    ignite: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float t = uZbMT;
  vec2 e = zb_flat(p) / (ZB_SC * ZB_SE) + EY_IC;
  float peE = px() / (uZbCam2.x * ZB_SC * ZB_SE);
  ey_palette(uGold);
  vec3 col = ey_eye(zb_ground(e), e, peE, t) + zb_contours(e, peE, t);
  float m = smoothstep(uZbFront + 0.05, uZbFront - 0.05, length(e - EY_IC) / EY_R);
  fragColor = vec4(mix(zb_heart((e - EY_IC) * uZbHK, peE * uZbHK, uZbHT), col, m), 1.0);
}`,
    // the great eye alone (its panel's edges not yet in frame)
    eye: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float t = uZbMT;
  vec2 e = zb_flat(p) / (ZB_SC * ZB_SE) + EY_IC;
  float peE = px() / (uZbCam2.x * ZB_SC * ZB_SE);
  ey_palette(uGold);
  fragColor = vec4(zb_print(ey_eye(zb_ground(e), e, peE, t) + zb_contours(e, peE, t)), 1.0);
}`,
    // the card, then the wheel: the great eye in the hub card's panel
    card: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float t = uZbMT;
  vec2 w = zb_flat(p);
  float peW = px() / uZbCam2.x;
  vec2 e = w / (ZB_SC * ZB_SE) + EY_IC;
  float peE = peW / (ZB_SC * ZB_SE);
  ey_palette(uGold);
  vec3 pic = zb_print(ey_eye(zb_ground(e), e, peE, t) + zb_contours(e, peE, t));
  fragColor = vec4(zb_tableTop(w, peW, pic, length(p)), 1.0);
}`,
    // the wheel's reveal: the great eye still large in the hub, its contour lines left out
    cardWheel: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float t = uZbMT;
  vec2 w = zb_flat(p);
  float peW = px() / uZbCam2.x;
  vec2 e = w / (ZB_SC * ZB_SE) + EY_IC;
  float peE = peW / (ZB_SC * ZB_SE);
  ey_palette(uGold);
  vec3 pic = zb_print(ey_eye(zb_ground(e), e, peE, t));
  fragColor = vec4(zb_tableTop(w, peW, pic, length(p)), 1.0);
}`,
    // the wheel: the eye in the hub a few dozen pixels wide
    wheel: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec2 w = zb_flat(p);
  float peW = px() / uZbCam2.x;
  vec2 e = w / (ZB_SC * ZB_SE) + EY_IC;
  ey_palette(uGold);
  vec3 pic = zb_print(zb_miniEye(e, peW / (ZB_SC * ZB_SE)));
  fragColor = vec4(zb_tableTop(w, peW, pic, length(p)), 1.0);
}`,
    // the crane lifts off the table: nothing thin or far in frame yet
    setNear: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec3 ro, rd; float pw0, peW, aT, tTab; vec2 w;
  zb_ray(p, px(), ro, rd, pw0, w, peW, aT, tTab);
  vec2 e = w / (ZB_SC * ZB_SE) + EY_IC;
  ey_palette(uGold);
  vec3 pic = zb_print(zb_miniEye(e, peW / (ZB_SC * ZB_SE)));
  vec3 tab = zb_tableTop(w, peW, pic, length(p));
  fragColor = vec4(zb_set(ro, rd, pw0, tab, aT, tTab, p, px()), 1.0);
}`,
    // the set: the crane pulls back from the table
    set: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec3 ro, rd; float pw0, peW, aT, tTab; vec2 w;
  zb_ray(p, px(), ro, rd, pw0, w, peW, aT, tTab);
  vec2 e = w / (ZB_SC * ZB_SE) + EY_IC;
  ey_palette(uGold);
  vec3 pic = zb_print(zb_miniEye(e, peW / (ZB_SC * ZB_SE)));
  vec3 tab = zb_tableTop(w, peW, pic, length(p));
  fragColor = vec4(zb_set(ro, rd, pw0, tab, aT, tTab, p, px()), 1.0);
}`,
    // the set, the table now small
    setFar: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec3 ro, rd; float pw0, peW, aT, tTab; vec2 w;
  zb_ray(p, px(), ro, rd, pw0, w, peW, aT, tTab);
  fragColor = vec4(zb_set(ro, rd, pw0, zb_tableCheap(w, peW), aT, tTab, p, px()), 1.0);
}`,
    // the outer eye while its zoom is fast: the iris at its band averages; its pupil reflects the set
    outer: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  vec2 e4, q; float peQ;
  float a4 = zb_pupil(p, e4, q, peQ);
  vec3 ro, rd; float pw0, peW, aT, tTab; vec2 w;
  zb_ray(q, peQ, ro, rd, pw0, w, peW, aT, tTab);
  vec3 refl = zb_set(ro, rd, pw0, zb_tableCheap(w, peW), aT, tTab, q, peQ);
  ey_palette(uGold);
  vec2 qi = (e4 - EY_IC) / EY_R;
  vec3 col = zb_irisAvg(length(qi), atan(qi.y, qi.x) + uSpin, px() / (uZbZ4 * EY_R));
  fragColor = vec4(col + refl * uZbRefl * a4, 1.0);
}`,
    // the outer eye settling: the EYE block comes in through the anti-strobe; the set in the pupil
    // is small now (its beams and lamp heads become glowing points)
    outer2: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float t = uZbMT;
  vec2 e4, q; float peQ;
  float a4 = zb_pupil(p, e4, q, peQ);
  vec3 ro, rd; float pw0, peW, aT, tTab; vec2 w;
  zb_ray(q, peQ, ro, rd, pw0, w, peW, aT, tTab);
  // the table is a few pixels wide in the small pupil now: its average colour
  vec3 tav = (vec3(0.045, 0.040, 0.13) + vec3(0.10, 0.07, 0.02) * zb_fl(abs(length(w) - 2.6) - 0.7, peW)) * zb_light(w);
  vec3 refl = zb_set(ro, rd, pw0, tav, aT, tTab, q, peQ);
  ey_palette(uGold);
  vec3 blaze;
  vec3 col = ey_eye(zb_codaGround(p, e4, t, blaze), e4, px() / uZbZ4, t) + blaze;
  vec2 qi = (e4 - EY_IC) / EY_R;
  float ri = length(qi);
  vec3 avg = zb_irisAvg(ri, atan(qi.y, qi.x) + uSpin, px() / (uZbZ4 * EY_R));
  col = mix(col, avg, smoothstep(1.12, 1.04, ri) * (1.0 - moAntiStrobe(uZbAS * 5.0)));
  fragColor = vec4(col + refl * uZbRefl * a4, 1.0);
}`,
    // the outer eye without the set (layers without L3): its pupil reflects the wheel
    outerFlat: `
void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float t = uZbMT;
  vec2 e4, q; float peQ;
  float a4 = zb_pupil(p, e4, q, peQ);
  vec2 w = zb_flat(q);
  float peW = peQ / uZbCam2.x;
  ey_palette(uGold);
  vec3 refl = zb_tableTop(w, peW, zb_print(zb_miniEye(w / (ZB_SC * ZB_SE) + EY_IC, peW / (ZB_SC * ZB_SE))), length(p));
  vec3 blaze;
  vec3 col = ey_eye(zb_codaGround(p, e4, t, blaze), e4, px() / uZbZ4, t) + blaze;
  fragColor = vec4(col + refl * uZbRefl * a4, 1.0);
}`,
  };
  const PROGRAMS = {};
  for (const k in MAIN) {
    const defs = { card: 'ZB_HUBONLY', setNear: 'ZB_SET_NEAR', outer2: 'ZB_SET_LITE' };
    const parts = [defs[k] ? '#define ' + defs[k] + '\n' : '', EYE, ZB_COMMON];
    if (k === 'heart' || k === 'ignite') parts.push(ZB_HEART);
    parts.push(ZB_PAINT, ZB_CARDS);
    if (/^(setNear|set|setFar|outer|outer2)$/.test(k)) parts.push(ZB_SET);   // (outerFlat reflects the flat table)
    if (/^outer/.test(k)) parts.push(ZB_OUTER);
    PROGRAMS[k] = parts.join('') + MAIN[k];
  }

  // ==== MATCH ====
  // The numbers of the two match cuts, shared with the shots on either side through MO.MATCH
  // (whoever loads first defines them; nobody overrides). rubedo.js defines heartIris.
  MO.MATCH = MO.MATCH || {};
  MO.MATCH.heartIris = MO.MATCH.heartIris || { r: 0.02, screenR: 1.36, pupil: 0.24 };
  // rubedo.bloom's last frame beyond the iris itself: its roll at the end of the dive (0.28 rad/s
  // over one bar), its 'gold' palette preset (the post grade) and its post settings
  MO.MATCH.bloomEnd = MO.MATCH.bloomEnd || {
    roll: 0.28 * 4 * BEAT, grade: { saturation: 0.35, gain: [1.12, 0.86, 0.46], contrast: 1.05 },
    bloom: 0.32, bloomThreshold: 1.2, vignette: 0.5,
  };
  // coda.eye's first frame: the great eye at zoom 3.4 (screen units per eye unit: the iris, 0.40,
  // at 1.36), pupil factor 0.73 (0.33 * 0.73 = 0.24 of the iris), iris centred, spin 0, the crimson
  // blaze and ground at full strength, its post settings
  MO.MATCH.codaEye = MO.MATCH.codaEye || { zoom: 3.4, pupil: 0.73, pc: [0, 0], spin: 0, blaze: 1, bloom: 0.28, bloomThreshold: 0.9, vignette: 0.5 };
  const M_HEART = MO.MATCH.heartIris, M_BLOOM = MO.MATCH.bloomEnd, M_CODA = MO.MATCH.codaEye;

  const SE = 0.5, SC = 0.2778, SW = 0.12, FOC = 2.0;         // as ZB_SE, ZB_SC, ZB_SW in the GLSL
  // framings (log of the zoom in screen units per inner-eye unit) the pull-back settles on
  const FR_EYE = Math.log(1.24);                  // the whole eye; the panel's edges just off screen
  const FR_CARD = Math.log(0.511 * SE);           // the card's height fills 92 % of the frame
  const FR_WHEEL = Math.log(0.303 * SC * SE);     // the wheel's rim at 97 % of the half height
  const Z4_HAND = 2.15 / (0.33 * M_CODA.pupil * 0.40);   // the outer eye's pupil just covers the frame
  const SET_D = 15.0, SET_EL = 0.36, SET_AZ = 0.21, TY = 3.5;   // TY: the table top (ZB_TY)      // the set's framing: distance, elevation, azimuth
  // eases built from a velocity profile v(x) = x^a (1 - x)^b (normalised): a small a is a fast attack
  const makeEase = (a, b, attack = 0) => {
    const N = 512, cum = new Float64Array(N + 1);
    const v = (x) => (attack > 0 ? Math.min(x / attack, 1) : Math.pow(x, a)) * Math.pow(1 - x, b);
    for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + (v((i - 1) / N) + v(i / N)) / 2;
    for (let i = 0; i <= N; i++) cum[i] /= cum[N];
    return (x) => { x = MO.clamp(x) * N; const i = Math.min(N - 1, Math.floor(x)), f = x - i; return cum[i] + (cum[i + 1] - cum[i]) * f; };
  };
  const REVEAL = makeEase(0, 2, 0.05);     // the flat reveals: a kick on the downbeat, a long settle
  const CRANE = makeEase(0.9, 1.7);        // the crane move off the table: a swell, then a settle
  const SETTLE = makeEase(0.45, 2.2);      // into the outer eye: quick, then easing to rest on the cut
  // the set's thin things (as in ZB_SET): the lamps, the crane, the beams' axes, in metres
  const LAMPS = [[-5.2, 4.8, 3.4], [5.2, 4.8, 3.4], [-5.8, 5.5, -2.9], [5.8, 5.5, -2.9]];
  const TGT = [0, 3.5, 0], PIV = [-6.6, 4.0, -1.3], TIP = [0.12, 5.45, -0.62], RCAM = [0.12, 5.17, -0.62];
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const add3 = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const RODS = [];        // [a, b, radius a, radius b]
  for (const lp of LAMPS) RODS.push([[lp[0], 0, lp[2]], add3(lp, [0, -0.2, 0]), 0.03, 0.03]);
  RODS.push([[-6.6, 0.5, -1.3], PIV, 0.08, 0.08]);
  const CW = add3(PIV, sub3(PIV, TIP), 0.3);
  RODS.push([CW, TIP, 0.07, 0.07]);
  RODS.push([add3(TIP, [0, -0.08, 0]), add3(RCAM, [0, -0.10, 0]), 0.14, 0.14]);   // the crane camera hanging from the tip
  for (const lp of LAMPS.slice(0, 2)) { const aim = norm3(sub3(TGT, lp)); RODS.push([add3(lp, aim, 0.3), TGT, 0.10, 0.60]); }   // the front lamps' beams
  // project into the picture plane of camera c ({pos, m}); a segment is clipped to the near plane
  const NEAR = 0.06;
  const project = (c) => {
    const R = c.m.slice(0, 3), U = c.m.slice(3, 6), Fw = c.m.slice(6, 9);
    const cam = (P) => { const d = sub3(P, c.pos); return [dot3(d, R), dot3(d, U), dot3(d, Fw)]; };
    const SA = [], SB = [];
    for (const [a, b, ra, rb] of RODS) {
      let A = cam(a), Bc = cam(b), r0 = ra, r1 = rb;
      if (A[2] < NEAR && Bc[2] < NEAR) { SA.push(9, 9, 9, 9); SB.push(-1, -1, 0, 0); continue; }
      if (A[2] < NEAR || Bc[2] < NEAR) {
        const k = (NEAR - A[2]) / (Bc[2] - A[2]), C = [A[0] + k * (Bc[0] - A[0]), A[1] + k * (Bc[1] - A[1]), NEAR], rc = r0 + k * (r1 - r0);
        if (A[2] < NEAR) { A = C; r0 = rc; } else { Bc = C; r1 = rc; }
      }
      SA.push(FOC * A[0] / A[2], FOC * A[1] / A[2], FOC * Bc[0] / Bc[2], FOC * Bc[1] / Bc[2]);
      SB.push(A[2], Bc[2], r0, r1);
    }
    const LH = [], LD = [];
    for (const lp of LAMPS) {
      const P = cam(lp), aim = norm3(sub3(TGT, lp));
      const a = [dot3(aim, R), dot3(aim, U), dot3(aim, Fw)];
      const l2 = Math.hypot(a[0], a[1]) || 1;
      if (P[2] < NEAR) { LH.push(9, 9, 1, -1); LD.push(1, 0, 0, 0); continue; }
      LH.push(FOC * P[0] / P[2], FOC * P[1] / P[2], FOC / P[2], P[2]);
      LD.push(a[0] / l2, a[1] / l2, Math.abs(a[2]), a[2] < 0 ? 1 : 0);
    }
    return { uZbSA: SA, uZbSB: SB, uZbLH: LH, uZbLD: LD };
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  MO.shot('zoomback.set', (cue) => {
    const P = cue.params || {};
    const B = (cue.to - cue.from) / BEAT;
    const lay = Math.round(MO.clamp(typeof P.layers === 'number' ? P.layers : 31, 0, 31));
    const has = (k) => ((lay >> k) & 1) === 1;
    let pace = typeof P.pace === 'number' && Number.isFinite(P.pace) ? MO.clamp(P.pace, 0.5, 8) : MO.clamp((B - 4) / 3, 0.5, 8);
    pace = Math.min(pace, Math.max(0.25, (B - 0.5) / 3));
    const K = cueClock(cue, 0, 16, 4, 3 * pace);
    const freeze = K.p('freeze', 0.5, 0, 4), gold = K.p('gold', 1, 0, 1);
    const T0 = cue.from, T1 = cue.to;
    const tail = (n) => T1 - (16 - n) * BEAT * pace / 4;
    const tCard = tail(4), tWheel = tail(8), tSet = tail(12), tOuter = has(4) ? tail(14) : T1 + 1;
    const tEye = Math.min(K.S(2 * BEAT), tCard - 0.25 * BEAT * pace);
    const tF = Math.min(K.S(freeze * BEAT), tEye);
    const tIgn = tEye + 0.4 * BEAT;                // the ignition front has crossed the frame
    const heartOn = has(0);

    // ---- the flat camera: log zoom per inner-eye unit, piecewise from reveal to reveal
    const L0 = Math.log(M_HEART.screenR / 0.40);   // the inner eye's iris at the heart iris's size
    const marks = [[tEye, FR_EYE, 2.0]];
    if (has(1)) marks.push([tCard, FR_CARD, 1.7]);
    if (has(2)) marks.push([tWheel, FR_WHEEL, 1.7]);
    const t2End = has(3) ? tSet : has(4) ? tOuter : T1;
    const segs = [];
    let lam = L0 - 0.16;                            // the creep before the band returns
    marks.forEach(([ta, target, rb], i) => {
      const tb = i + 1 < marks.length ? marks[i + 1][0] : t2End;
      const dur = Math.max(tb - ta, 1e-3);
      const xr = MO.clamp(rb * BEAT * pace / 4 / dur, 0.05, 1);
      const drift = 0.08 * dur;
      segs.push({ ta, tb, from: lam, to: target, xr, drift });
      lam = target - drift;
    });
    const lamAt = (t) => {
      if (t <= tF) return L0;
      if (t < tEye) return L0 - 0.16 * MO.easeIn((t - tF) / Math.max(tEye - tF, 1e-3));
      let s = segs[0];
      for (const g of segs) if (t >= g.ta) s = g;
      const x = MO.clamp((t - s.ta) / (s.tb - s.ta));
      return s.from + (s.to - s.from) * REVEAL(x / s.xr) - s.drift * x;
    };
    const zW2 = (t) => Math.exp(lamAt(Math.min(t, t2End))) / (SC * SE) * (t > t2End ? Math.exp(-0.05 * (t - t2End)) : 1);
    // ---- the 3D camera over the set: from straight above the table (matching the flat camera) to
    // a high three-quarter view of the whole set; it keeps drifting back inside the outer pupil
    const h0 = FOC * SW / zW2(tSet);
    const t3End = has(4) ? tOuter : T1;
    // the move itself runs on into the outer eye (60 % of its time), so its peak speed stays lower
    const t3Move = has(4) ? t3End + 0.6 * (T1 - t3End) : T1;
    const cam3 = (t) => {
      const r = CRANE((t - tSet) / Math.max(t3Move - tSet, 1e-3)), k = MO.smooth(MO.remap(r, 0.08, 1));
      const after = MO.clamp((t - t3Move) / Math.max(T1 - t3Move, 1e-3));
      const d = Math.exp(MO.mix(Math.log(h0), Math.log(SET_D), r)) * (1 + 0.10 * after);
      const el = MO.mix(Math.PI / 2, SET_EL, k) - 0.04 * after, az = MO.mix(0, SET_AZ, k) + 0.06 * after;
      const tgt = [0, MO.mix(TY, 2.3, k), MO.mix(0, 0.3, k)];
      const ce = Math.cos(el), se = Math.sin(el), ca = Math.cos(az), sa = Math.sin(az);
      const dir = [sa * ce, se, ca * ce];
      const pos = [tgt[0] + d * dir[0], tgt[1] + d * dir[1], tgt[2] + d * dir[2]];
      const fwd = [-dir[0], -dir[1], -dir[2]], right = [ca, 0, -sa], up = cross(right, fwd);
      return { pos, m: [right[0], right[1], right[2], up[0], up[1], up[2], fwd[0], fwd[1], fwd[2]], d, haze: MO.smooth(MO.remap(r, 0.45, 0.80)) };
    };
    // ---- the outer eye
    const z4At = (t) => Math.exp(MO.mix(Math.log(Z4_HAND), Math.log(M_CODA.zoom), SETTLE((t - tOuter) / Math.max(T1 - tOuter, 1e-3))));
    // the speed of the pull-back (log zoom per frame), for the anti-strobe
    const logScale = (t) => (has(4) && t >= tOuter ? Math.log(z4At(t)) - Math.log(Z4_HAND)
      : has(3) && t >= tSet ? -Math.log(cam3(t).d / h0) + lamAt(tSet) : lamAt(t));
    const speedAt = (t) => Math.abs(logScale(t + 1 / 60) - logScale(t - 1 / 60));

    const kickTick = (t) => {
      const n = MO.count('kick', t) - MO.count('kick', T0 - 1e-3);
      const l = MO.last('kick', t);
      return Math.max(0, n - 1) + (n > 0 && l ? MO.easeOut((t - l.e.t) / 0.12) : 0);
    };
    const rp = 0.33 * M_CODA.pupil;
    const uniforms = (t) => {
      const mt = K.M(t);
      const ph4 = has(4) && t >= tOuter, ph3 = has(3) && t >= tSet;
      const x4 = ph4 ? MO.clamp((t - tOuter) / (T1 - tOuter)) : 0;
      const lamE = lamAt(t), zE = Math.exp(lamE);
      // the ignition: the great eye replaces the frozen heart from the pupil outward
      const fs = MO.mix(M_HEART.screenR * (rp - 0.03), 2.3, MO.smooth((t - tF) / Math.max(tIgn - tF, 1e-3)));   // screen units
      const front = !heartOn ? 9 : t <= tF ? -1 : fs / (0.40 * zE);
      const u = {
        uZbZ4: ph4 ? z4At(t) : 1, uZbQK: ph4 ? Math.exp(MO.mix(Math.log(Z4_HAND), Math.log(9.0), SETTLE(x4))) : Z4_HAND, uZbFish: 0.30 * MO.smooth(x4),
        uZbRefl: MO.mix(1, 0.42, MO.smooth(x4)), uZbBlaze: ph4 ? MO.smooth(MO.remap(x4, 0.45, 1.0)) * M_CODA.blaze : 0,
        uZbCamF: FOC,
        uZbOn: [has(1) ? 1 : 0, has(2) ? 1 : 0, has(3) ? 1 : 0, heartOn ? 1 : 0],
        uZbFront: front, uZbHT: T0, uZbHRoll: M_BLOOM.roll, uZbHZ: M_HEART.screenR / M_HEART.r, uZbHK: M_HEART.screenR / 0.40, uZbHR: M_HEART.r,
        uZbCont: MO.smooth(MO.remap(t, tEye + 0.35 * (tCard - tEye), tCard + 0.2 * BEAT)),
        uZbAS: (MO.reduced ? 1.4 : 1) * speedAt(t), uZbMT: mt,
        uZbWheel: (MO.reduced ? 0.5 : 1) * (0.05 * (mt - T0) + 0.022 * kickTick(t)),
        uZbFlame: 1 + (MO.reduced ? 0.04 : 0.14) * MO.env('kick', t, 0.12),
        uZbFlick: [0, 1, 2, 3].map((i) => 0.88 + 0.12 * Math.sin(mt * (7.1 + i * 1.3) + i * 2.1) * Math.sin(mt * (3.3 + i * 0.7) + i)),
        uZbDim: MO.smooth(MO.remap(t, tCard, tCard + BEAT)),
        // the EYE block: the painted eye, or the outer eye at coda.eye's first-frame numbers
        uOpen: 1, uIgnite: ph4 ? 1 : MO.clamp((front - (rp - 0.02)) / (1.35 - rp + 0.02)), uLines: ph4 ? 1 : 0,
        uGlint: ph4 ? 0 : MO.remap(t, tCard + 1.3 * BEAT * pace / 4, tCard + 2.3 * BEAT * pace / 4), uGold: gold,
        uSpin: ph4 ? M_CODA.spin - 0.25 * (T1 - t) : 0.15 * (mt - T0), uPupil: M_CODA.pupil, uLook: [0, 0],
        uAura: ph4 ? 1 : 0.9, uHi: ph4 ? 0 : MO.smooth(MO.remap(t, tEye, tEye + 0.6 * BEAT)), uSun: 0,
      };
      // the EYE block's anti-strobe input: the zoom, drift and spin per 1/30 s (0 = still)
      u.uAS = [speedAt(t), 0, Math.abs(ph4 ? 0.25 : 0.15 * K.speed) / 30];
      // the flat camera (and the table's camera height for the candles' lean)
      const zW = zW2(t);
      if (ph3) {
        const c = cam3(t);
        u.uZbCamP = c.pos; u.uZbCamM = c.m; u.uZbHaze = c.haze;
        Object.assign(u, project(c));
        u.uZbNad = [c.pos[0] / SW, -c.pos[2] / SW]; u.uZbHgt = (c.pos[1] - TY) / SW;
        u.uZbCam2 = [zW, 1, 0];
      } else {
        u.uZbCamP = [0, TY + FOC * SW / zW, 0]; u.uZbCamM = [1, 0, 0, 0, 0, -1, 0, -1, 0]; u.uZbHaze = 0;
        u.uZbNad = [0, 0]; u.uZbHgt = FOC / zW;
        u.uZbCam2 = [zW, 1, 0];
      }
      if (!K.still) u.uTime = mt;
      return u;
    };
    // the grade: rubedo.bloom's gold palette at the cut; on the shout the frame greys to 70 % of its
    // saturation (over three frames; reduced: 0.5 s); the colour returns with the great eye
    const G = M_BLOOM.grade, gg = (a, i) => MO.mix(1, a[i], gold);
    const grade = (t) => {
      const kD = MO.smooth(MO.remap(t, T0, T0 + (MO.reduced ? 0.5 : 0.1)));
      const kO = MO.smooth(MO.remap(t, tF, tIgn + BEAT));
      if (kO >= 1) return null;
      const s0 = MO.mix(1, G.saturation, gold) * (1 - 0.3 * kD);
      return { saturation: MO.mix(s0, 1, kO), contrast: MO.mix(MO.mix(1, G.contrast, gold), 1, kO),
        gain: [MO.mix(gg(G.gain, 0), 1, kO), MO.mix(gg(G.gain, 1), 1, kO), MO.mix(gg(G.gain, 2), 1, kO)] };
    };
    const postK = (t) => MO.smooth(MO.remap(t, tF, tIgn + BEAT));
    const endK = (t) => (has(4) ? MO.smooth(MO.remap(t, tOuter, T1)) : 0);
    // ---- the phase scenes: each its own program with only what its window can show
    const scan = (from, to, ok) => { for (let t = from; t < to; t += 1 / 120) if (ok(t)) return t; return to; };
    const tPost = Math.min(has(1) ? tCard : has(2) ? tWheel : t2End, scan(tEye, t2End, (t) => Math.exp(lamAt(t)) / SE * 0.74 < 16 / 9 + 0.02));
    const tMini = scan(Math.max(tPost, T0), t2End, (t) => Math.exp(lamAt(t)) < 0.05);
    const tFar = has(3) ? scan(tSet, t3Move, (t) => cam3(t).d > 0.79 * FOC / 0.33) : T1;   // the table under 0.33 of the half height
    // (MAIN.set, the full table with the full set, stays available for a cue whose crane move frames
    // the set before the table is small; with these numbers it is never needed)
    const phases = [];
    if (heartOn) phases.push(['heart', T0], ['ignite', tF]);
    phases.push(['eye', heartOn ? tIgn : T0], ['card', tPost]);
    if (has(2)) phases.push(['cardWheel', Math.max(tPost, tWheel)]);
    phases.push(['wheel', Math.max(tPost, tMini)]);
    // the near program (no lamp heads, beams or backdrop) until one of those could be in frame
    const inFrame = (c) => {
      const P = project(c);
      for (let i = 0; i < 4; i++) if (P.uZbLH[4 * i + 3] > 0 && Math.abs(P.uZbLH[4 * i]) < 2.1 && Math.abs(P.uZbLH[4 * i + 1]) < 1.3) return true;
      const R = c.m.slice(0, 3), U = c.m.slice(3, 6), Fw = c.m.slice(6, 9);
      for (const B of [[-12, 0, -7.6], [12, 0, -7.6], [0, 0, -7.6], [-12, 9.4, -7.6], [12, 9.4, -7.6], [0, 9.4, -7.6]]) {
        const d = sub3(B, c.pos), z = dot3(d, Fw);
        if (z > NEAR && Math.abs(FOC * dot3(d, R) / z) < 2.0 && Math.abs(FOC * dot3(d, U) / z) < 1.2) return true;
      }
      return c.haze > 0.02;
    };
    const tNear = has(3) ? scan(tSet, tFar, (t) => inFrame(cam3(t))) : tSet;
    // the outer eye's settle: the EYE block once the iris rim nears the frame (the zoom slowing)
    const tO2 = has(4) ? scan(tOuter, T1, (t) => z4At(t) < 6.0) : T1;
    // (the full table and the full set never share a frame: the cheap table takes over first)
    if (has(3)) phases.push(['setNear', tSet], ['setFar', Math.min(tNear, tFar)]);
    if (has(4)) phases.push(has(3) ? ['outer', tOuter] : ['outerFlat', tOuter]);
    if (has(4) && has(3)) phases.push(['outer2', tO2]);
    const view = (t) => {
      const phase = has(4) && t >= tOuter ? 'eye' : has(3) && t >= tSet ? 'set' : has(2) && t >= tWheel ? 'wheel' : has(1) && t >= tCard ? 'card' : t >= tF ? 'eye' : 'heart';
      const zC = Math.exp(lamAt(t)) / SE;
      return { phase, card: [zC * 1.0, zC * 1.8] };
    };
    const post = {
      bloom: (t) => MO.mix(MO.mix(M_BLOOM.bloom, 0.36, postK(t)), M_CODA.bloom, endK(t)),
      bloomThreshold: (t) => MO.mix(MO.mix(M_BLOOM.bloomThreshold, 1.0, postK(t)), M_CODA.bloomThreshold, endK(t)),
      vignette: (t) => MO.mix(MO.mix(M_BLOOM.vignette, 0.45, postK(t)), M_CODA.vignette, endK(t)),
    };
    phases.forEach(([name, from], i) => {
      const to = Math.min(T1, i + 1 < phases.length ? phases[i + 1][1] : T1);
      const fr = Math.max(T0, from);
      if (to - fr < 1e-4) return;
      MO.scene(Object.assign({ id: 'zoomback.set#' + cue.index + '.' + name, fs: PROGRAMS[name], from: fr, to, uniforms, grade, view }, post));
    });
  });
})();
