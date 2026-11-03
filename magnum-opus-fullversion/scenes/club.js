// CLUB.STAGE — I The Magician, XV The Devil. Owner: club agent. One shot factory (spec 5.1), new in
// the full version (no 30 s window):
//   club.stage   the club of the black sun: strictly frontal and symmetric, a dark stage over a glossy
//                checkerboard floor, a three-step neon dais (a small ziggurat), a colossal mirror ball
//                hanging behind the dancer's head like a halo (the stage's celestial body: black sun,
//                moon, gold sun or ruby), a ring of 16 truss bulbs, laser beams in smoke, mirror-ball
//                spots crawling over the back wall, two follow spots crossing on the dancer, nested
//                stepped ziggurat contour lines on the wall (the Holy Mountain), the dancer on the dais
//                and three rows of crowd silhouettes in the foreground whose hands go up on the claps.
// One fragment source, every knob a uniform: all cues of the shot share one compiled program.
// Everything is a pure function of time: the music comes from the score's drum events (looked up
// inside the cue window), its chops and the cue's own beat params.
// The factory doc block (length, stretch, params, safety, couplings, cost) sits above MO.shot below.
(() => {
  const BEAT = MO.BEAT, STEP = MO.BEAT / 4, TAU = Math.PI * 2;

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

  // ==================================================================== GLSL (prefix cl_ / uCl)
  // Cost model (SwiftShader, measured): every straight-line instruction runs for every pixel whatever
  // the branches around it say; a loop stops as soon as no pixel of a 2x2 quad still needs it. So the
  // per-pixel work that depends on where the pixel is lives in loops, and code is kept small.
  const U = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('\n');
  const FS = `
// Scene units are uvCentered: y -1..1 bottom to top, x -16/9..16/9. Layers back to front: the back
// wall (contour lines, mirror-ball spots), the corona behind the ball, the laser beams in haze, the
// mirror ball and its truss ring, the floor (a filtered perspective checker that mirrors the wall,
// the beams and the ball), the dais, the dancer, three crowd rows. The camera pushes towards
// uClCam.xy; nearer layers zoom more (parallax).
const vec2  CL_B  = vec2(0.0, 0.47);    // mirror ball centre (~27 % from the top: the 6.1 focal zone)
const float CL_R  = 0.225;              // ball radius
const float CL_RT = 0.325;              // truss ring radius
const float CL_J  = -0.30;              // back wall / floor junction
const float CL_V  = 0.14;               // eye level (the floor's vanishing line)
const vec2  CL_F  = vec2(0.0, -0.066);  // the dancer's feet, on the top step
const float CL_S  = 0.315;              // dancer scale: scene units per body unit (2 body units tall)

uniform vec4  uClCam;        // push focus xy, push zoom, truck x
uniform vec4  uClT;          // motion time (s), 16th count (frozen in reduced mode), ball spin (rad), haze time
uniform vec4  uClBeam[14];   // origin xy, unit direction xy
uniform vec4  uClBeamC[14];  // colour * intensity, core width scale
uniform vec4  uClBeamL[14];  // start, end (along the beam), glow scale, origin flare
uniform float uClBeamN;      // beams in use (0..14)
uniform float uClBeamNF;     // the first uClBeamNF of them reach below the floor line (drawn there unmirrored too)
uniform float uClBeamFront;  // 1: the beams pass in front of the ball (tunnel, fan360)
uniform vec3  uClWallT, uClWallL, uClLineA, uClLineB, uClNeon, uClNeon2, uClFloorA, uClFloorB;
uniform vec3  uClFace, uClAccA, uClAccB, uClHaze, uClBeamA, uClBeamB;
uniform vec4  uClLines;      // wall contour lines: amount, ripple phase (lines), anti-strobe contrast 0..1, -
uniform vec4  uClSpots;      // mirror-ball spots: amount, drift (scene units); follow-spot cones: amount; -
uniform vec4  uClCorG;       // corona glow: amount, falloff, wide glow, -
uniform vec4  uClCorL;       // streamer lines: count, length base (radii), length spread, brightness
uniform vec4  uClCorF;       // fringe: brightness, decay; log rings brightness; fixed rings brightness
uniform vec4  uClCorRg;      // fixed ring radii (radii) x, y; 22-degree halo ring; -
uniform vec4  uClCorX;       // Tarot XIX rays amount, -, -, -
uniform vec3  uClCorC0, uClCorC1, uClCorC2, uClCorC3;   // corona colours: near, mid, far, lines
uniform vec4  uClCorK;       // ray rotation (rad), kick flare, kick sensitivity, -
uniform vec4  uClMatA0, uClMatA1, uClMatA2;   // ball material A: base rgb + glitter density;
uniform vec4  uClMatB0, uClMatB1, uClMatB2;   // rim rgb + maria; inner glow rgb + grout
uniform vec4  uClBallW;      // material wipe: terminator position (1 = all A .. -1 = all B), edge glow
uniform vec4  uClTruss;      // brightest bulb, chase contrast, kick, on
uniform vec4  uClDais;       // neon level (kick pulse included), frieze amount, top glow, -
uniform vec4  uClConv;       // beam convergence glow: xy, amount, -
uniform vec4  uClDan;        // on, lean (rad), bounce (scene units), -
uniform vec4  uClArms;       // left arm, right arm (0 down .. 1 raised V), -, -
uniform vec3  uClLookA, uClLookB;   // look weights (shadow, luminous, gold) before / after the flip
uniform vec4  uClLookW;      // flip front (body y), flip edge glow, eye glow, light (chop flash on the body)
uniform vec4  uClMelt;       // melt 0..1, pool radius, ripple age (s), ripple amount
uniform vec4  uClCrowd;      // on, clap age (s), previous clap age (s), jump (scene units)

const vec3 CL_INK = vec3(0.0016, 0.0010, 0.0030);

// lines at the integers of v (fw = |dv| per pixel, w = half width in pixels); fades to the average
// coverage where they get denser than ~3 px (no moire, no shimmer at 720p)
float cl_lines(float v, float fw, float w) {
  fw = max(fw, 1e-6);
  float d = abs(fract(v + 0.5) - 0.5) / fw;
  float l = 1.0 - smoothstep(w - 0.7, w + 0.7, d);
  return mix(l, min(1.0, 2.0 * w * fw), smoothstep(0.12, 0.32, fw));
}
// anti-aliased stroke of a distance d (half width w in pixels, pe = pixel size in d's units)
float cl_st(float d, float pe, float w) { return 1.0 - smoothstep(w - 0.7, w + 0.7, abs(d) / pe); }
float cl_fill(float d, float pe) { return 1.0 - smoothstep(-pe, pe, d); }
// exp(-x) for glows and decays, x >= 0 (a rational: SwiftShader runs every exp of every branch)
float cl_e(float x) { x = max(x, 0.0); return 1.0 / (1.0 + x * (1.0 + x * (0.5 + x * 0.1667))); }

vec2 cl_cam(vec2 p, float k) {
  float z = 1.0 + (uClCam.z - 1.0) * k;
  return (p - uClCam.xy) / z + uClCam.xy + vec2(uClCam.w * k, 0.0);
}
// smoke: two octaves of value noise drifting up
float cl_haze(vec2 p) {
  vec2 q = p * 3.0 + vec2(0.0, -0.2 * uClT.w);
  q += 0.35 * vec2(sin(q.y * 1.7 + uClT.w * 0.3), sin(q.x * 1.3 - uClT.w * 0.2));
  float n = vnoise(q) * 0.8 + 0.1;
  return sat(0.15 + 1.3 * (n - 0.25));
}

// ---------------------------------------------------------------- the back wall
// nested ziggurats: the gauge of a four-step pyramid standing on (0, 0); level 1 = half width 1, height 1
float cl_zig(vec2 d) {
  float x = abs(d.x);
  float g = max(x, d.y / 0.34);
  g = min(g, max(x / 0.78, d.y / 0.56));
  g = min(g, max(x / 0.56, d.y / 0.78));
  return min(g, max(x / 0.34, d.y));
}
vec3 cl_wall(vec2 q, float pe) {
  vec2 d = q - CL_B;
  float hy = q.y - CL_J;
  vec3 col = mix(uClWallL * 0.55, uClWallT, smoothstep(0.0, 0.9, hy));
  col += uClWallL * 0.60 * cl_e(length(d * vec2(0.75, 1.0)) * 3.5);
  col += uClWallL * 0.35 * cl_e(hy * 5.0) * cl_e(abs(q.x) * 0.6);
  // the stage's aura: nested stepped ziggurats rising from the dais, one line outward per kick
  if (uClLines.x > 0.0) {
    float g = cl_zig(vec2(q.x, hy) / 0.62);
    float u = log(max(g, 1e-3)) * 6.5 - uClLines.y;
    float ln = cl_lines(u, fwidth(u), 0.45);
    ln = mix(min(1.0, 0.9 * fwidth(u)), ln, uClLines.z);      // anti-strobe: fade to the average coverage
    float ui = floor(u + 0.5);
    vec3 lc = mix(uClLineA, uClLineB, step(0.5, fract(ui * 0.5)));
    float fade = smoothstep(0.60, 1.10, g) * cl_e(max(g - 1.3, 0.0) * 0.65);
    col += lc * 0.22 * uClLines.x * ln * fade;
    // a fine second set between them (Alex Grey hatching), dimmer
    float l2 = mix(min(1.0, 2.1 * fwidth(u)), cl_lines(u * 3.0 + 0.5, fwidth(u) * 3.0, 0.35), uClLines.z * uClLines.z);
    col += lc * 0.03 * uClLines.x * l2 * fade;
  }
  // mirror-ball spots crawling over the wall as the ball turns
  if (uClSpots.x > 0.0) {
    const float CS = 0.19;
    vec2 sp = vec2(q.x + uClSpots.y, q.y) / CS;
    vec2 cid = floor(sp), f = fract(sp) - 0.5;
    vec2 h = hash22(cid + 3.7);
    vec2 o = (h - 0.5) * 0.5;
    vec2 dd = (f - o) * CS * vec2(1.0, 1.4);
    float sz = 0.007 + 0.006 * h.y;
    float s = cl_e(dot(dd, dd) / (sz * sz));
    float on = step(0.78, hash21(cid + 9.1)) * smoothstep(0.32, 0.60, length(d)) * smoothstep(-0.05, 0.10, hy);
    col += (mix(uClBeamA, uClBeamB, step(0.5, h.x)) * 0.6 + 0.25) * s * on * uClSpots.x * (0.25 + 0.45 * h.y);
  }
  return col;
}

// ---------------------------------------------------------------- behind the ball: corona, halo, rays
vec3 cl_corona(float r, float a, float pe) {
  float x = r / CL_R - 1.0;
  float out1 = step(0.0, x);
  float kick = uClCorK.y * uClCorK.z;
  // one parametrized corona for every ball (material tables in JS): glow, a set of radial streamer
  // lines with hashed lengths, a fine fringe, log-spaced halo rings, two fixed rings, the 22-degree
  // halo; Tarot XIX's straight and wavy rays on top for the sun
  vec3 col = mix(uClCorC0, uClCorC1, sat(x * 2.0)) * uClCorG.x * 0.8 * cl_e(x * uClCorG.y * 1.2) * (1.0 + 0.6 * kick);
  col += uClCorC1 * uClCorG.z * cl_e(x * 0.8);
  {
    float s3 = 0.5 + 0.5 * cos(a * 3.0 + 0.4), s5 = 0.5 + 0.5 * cos(a * 5.0 - 1.1);
    s5 *= s5 * s5;
    float stream = 0.8 * s3 * s3 * s3 + 0.5 * s5 * s5;
    float n = uClCorL.x;
    float v = (a + 0.05 * x * sin(a * 3.0)) / TAU * n + uClCorK.x * n * 0.02;
    float id = floor(v + 0.5), h = hash11(id * 0.731 + 4.0);
    float L = (uClCorL.y + uClCorL.z * (0.3 * h * h + stream * h)) * (1.0 + 0.4 * kick);
    float ln = cl_lines(v, n / (TAU * max(r, 1e-3)) * pe, 0.5);
    vec3 cc = mix(uClCorC0, uClCorC1, sat(x / 0.35));
    cc = mix(cc, uClCorC2, sat((x - 0.45) / 0.5));
    col += cc * ln * cl_e(x / max(L, 1e-3)) * uClCorL.w * (1.0 + 0.6 * kick) * (0.5 + 0.5 * h) * smoothstep(0.0, 0.015, x);
  }
  // the fine fringe (300 hairlines) hugging the disc
  col += uClCorC3 * uClCorF.x * cl_lines(a / TAU * 300.0, 300.0 / (TAU * max(r, 1e-3)) * pe, 0.4) * cl_e(x / (uClCorF.y + 0.04 * kick));
  // halo rings: log-spaced fine rings, two fixed rings, the 22-degree ring
  {
    float u = log(max(x + 1.0, 1.0)) * 24.0 - uClCorK.x * 0.8;
    col += uClCorC1 * cl_lines(u, 24.0 / max(r / CL_R, 1.0) * pe / CL_R, 0.45) * uClCorF.z * cl_e(x * 1.5) * smoothstep(0.03, 0.08, x);
    col += uClCorC3 * uClCorF.w * (1.6 * cl_st(r - CL_R * uClCorRg.x, pe, 1.0) + 0.7 * cl_st(r - CL_R * uClCorRg.y, pe, 0.6));
    float rh = r - CL_R * 2.15;
    col += uClCorC1 * uClCorRg.z * (0.55 * cl_st(rh, pe, 0.9) + 0.10 * cl_e(abs(rh) / 0.02));
  }
  col *= out1;
  // Tarot XIX: 16 straight rays (outlined, Marseille colours) alternating with 16 wavy flames
  if (uClCorX.x > 0.0) {
    vec3 gold = vec3(1.0, 0.64, 0.16);
    vec3 c = vec3(0.0);
    float n = 32.0;
    float sector = (a + uClCorK.x) / TAU * n;
    float id = floor(sector), fr = fract(sector) - 0.5;
    float straight = step(mod(id, 2.0), 0.5);
    float rr = (r - CL_R * 1.10) / (CL_R * mix(0.75, 1.05, straight));
    float inR = step(0.0, rr) * step(rr, 1.0);
    float arcU = r * TAU / n;
    float ed = (abs(fr) - 0.40 * (1.0 - rr)) * arcU;
    float body = cl_fill(ed, pe);
    float rk = mod(floor(id * 0.5), 3.0);
    vec3 rf = rk < 0.5 ? vec3(0.62, 0.07, 0.015) : rk < 1.5 ? vec3(0.75, 0.42, 0.05) : vec3(0.03, 0.06, 0.45);
    vec3 sray = rf * body * (0.10 + 0.45 * (1.0 - rr) * (1.0 - rr)) + gold * (cl_st(ed, pe, 0.9) * 0.95 + cl_st(fr * arcU, pe, 0.6) * body * 0.4);
    float wv = (0.13 + 0.06 * rr) * sin(rr * 13.0 - uClT.x * 5.0 + id);
    float wl = cl_st((fr - wv) * arcU, pe, 1.3);
    vec3 wray = mix(gold, vec3(1.0, 0.35, 0.06), 0.4) * wl * (1.1 - rr) * 0.7;
    c += mix(wray, sray, straight) * inR * (1.0 - smoothstep(0.75, 1.0, rr)) * (0.85 + 0.35 * kick);
    col += c * out1 * uClCorX.x;
  }
  return col;
}

// ---------------------------------------------------------------- one laser beam
// a 1.2 px core with soft (3 px) edges and a gaussian glow in the haze, fading with length; soft > 1
// widens it (the floor's mirror image)
vec3 cl_beam(vec4 g, vec4 c, vec4 l, vec2 q, float pe, float hz, float soft) {
  vec2 v = q - g.xy;
  float al = dot(v, g.zw);
  float pp = abs(v.x * g.w - v.y * g.z);
  float sg = (0.011 + 0.0045 * max(al, 0.0)) * soft;
  float in1 = sat((al - l.x) / 0.03) * sat((l.y - al) / 0.12);
  float wc = (0.85 * pe * abs(c.w) + 0.0010 * max(al, 0.0)) * soft;
  float x1 = pp / wc, x2 = pp / sg;
  // core and glow profiles: rational bells (no exp)
  float core = 1.0 / (1.0 + x1 * x1 * x1 * x1);
  float glw = 1.0 / (1.0 + 0.6 * x2 * x2);
  // the emitter's flare (l.w = 0 for beams without one)
  float fd = dot(v, v) * 10000.0;
  return c.rgb * ((1.25 * core + 0.36 * glw * hz * l.z) * in1 / (1.0 + 0.25 * max(al, 0.0)) + l.w * 1.4 / (1.0 + fd));
}

// ---------------------------------------------------------------- the mirror ball (rgb, coverage)
// a sphere of 36 x 18 flat mirror facets turning about its axis; each facet mirrors the room (dark above,
// the stage lights below), catches the spotlights as it turns and now and then a laser (re-rolled every
// 16th, frozen in reduced mode) as a small four-point star
vec4 cl_ball(vec2 q, float pe) {
  vec2 bq = (q - CL_B) / CL_R;
  float r2 = dot(bq, bq), r = sqrt(r2);
  float cov = cl_fill((r - 1.0) * CL_R, pe);
  // material wipe: B to the right of a moving terminator (a phase of the moon)
  float tx = bq.x - uClBallW.x * sqrt(max(1.0 - bq.y * bq.y, 0.0));
  float wm = smoothstep(-0.05, 0.05, tx);
  vec4 m0 = mix(uClMatA0, uClMatB0, wm), m1 = mix(uClMatA1, uClMatB1, wm), m2 = mix(uClMatA2, uClMatB2, wm);
  vec3 n = vec3(bq, sqrt(max(1.0 - r2, 0.0)));
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, max(n.z, 1e-4)) + uClT.z;
  const float NLON = 36.0, NLAT = 18.0;
  vec2 f2 = vec2(lon / TAU * NLON, (lat / PI + 0.5) * NLAT);
  vec2 fid = floor(f2);
  float clon = (fid.x + 0.5) / NLON * TAU - uClT.z, clat = ((fid.y + 0.5) / NLAT - 0.5) * PI;
  vec3 fn = vec3(cos(clat) * sin(clon), sin(clat), cos(clat) * cos(clon));
  float h1 = hash21(fid + 0.37), h3 = hash21(fid + 5.3);
  // the view ray mirrored by the facet
  vec3 rv = vec3(2.0 * fn.z * fn.x, 2.0 * fn.z * fn.y, 2.0 * fn.z * fn.z - 1.0);
  float env = smoothstep(0.15, -0.65, rv.y);
  vec3 lc = mix(uClBeamA, uClBeamB, step(0.5, h3));
  float spec = max(dot(rv, vec3(-0.3485, 0.5477, 0.7568)), 0.0);
  spec *= spec; spec *= spec; spec *= spec; spec *= spec; spec *= spec; spec *= spec;   // ^64
  vec3 c = m0.rgb * (0.30 + 0.70 * h1) * (0.45 + 0.55 * max(fn.y * 0.6 + fn.z * 0.6, 0.0));
  c += mix(lc, m1.rgb, 0.4) * env * (0.03 + 0.08 * h1 * h1) * (0.5 + 0.5 * m0.rgb.r + 0.5 * m0.rgb.b);
  // a lit facet glows brightest at its centre (a bevelled mirror tile, not a flat square)
  vec2 fo = abs(fract(f2) - 0.5);
  c += m1.rgb * spec * 0.7 * (1.0 - smoothstep(0.15, 0.5, max(fo.x, fo.y)));
  // moon maria: soft darker continents fixed on the ball
  if (m1.a > 0.0) {
    float mar = 0.5 + 0.25 * sin(lon * 2.3 + 1.0 + 1.3 * sin(lat * 3.1)) + 0.25 * sin(lat * 4.7 - 0.6 + 1.1 * sin(lon * 1.7));
    c *= 1.0 - m1.a * smoothstep(0.42, 0.68, mar);
  }
  // inner glow (ruby), Fresnel rim
  c += m2.rgb * (1.0 - r2) * (0.6 + 0.4 * h1);
  float fz = 1.0 - n.z; fz *= fz;
  c += m1.rgb * fz * fz * 0.35;
  // grout between the facets (fades where the facets crowd at the limb)
  vec2 fw = fwidth(f2);
  float grout = max(cl_lines(f2.x, fw.x, 0.40), cl_lines(f2.y, fw.y, 0.40));
  c *= 1.0 - m2.a * grout;
  // glints: a few facets catch a laser (16th re-roll) and show a small star at their centre
  float h2 = hash21(fid + vec2(uClT.y * 7.13, uClT.y * 3.71));
  float gl = step(1.0 - m0.a, h2) * smoothstep(0.15, 0.5, fn.z);
  // (a point of light well inside its facet, so the facet's edge never clips it)
  vec2 fdq = (q - CL_B - CL_R * fn.xy) / (CL_R * 0.022);
  c += lc * gl * 2.6 / (1.0 + dot(fdq, fdq) * dot(fdq, fdq));
  // the diamond-thin rim and the wipe's bright terminator
  c += m1.rgb * 1.1 * cl_st((r - 1.0) * CL_R, pe, 0.6);
  c += vec3(1.0, 0.95, 0.85) * uClBallW.y * cl_e(abs(tx) / 0.06) * step(r, 1.0);
  // the glint stars spill a little past the limb
  return vec4(c, cov);
}

// ---------------------------------------------------------------- truss ring with 16 chasing bulbs
vec3 cl_truss(vec2 d, float r, float a, float pe, out float occ) {
  float rails = cl_st(r - CL_RT - 0.012, pe, 0.7) + cl_st(r - CL_RT + 0.012, pe, 0.7);
  float zz = abs(fract(a / TAU * 64.0) * 2.0 - 1.0);
  float web = cl_st(r - (CL_RT - 0.012 + 0.024 * zz), pe * 1.6, 0.5) * step(abs(r - CL_RT), 0.012);
  occ = 0.85 * smoothstep(0.013 + pe, 0.013 - pe, abs(r - CL_RT));
  vec3 metal = mix(vec3(0.10, 0.10, 0.12), uClLineA * 0.35, 0.5);
  vec3 col = metal * (rails * 1.4 + web * 0.8) + uClLineA * rails * 0.15 * (1.0 + uClTruss.z);
  float s = a / TAU * 16.0, id = floor(s + 0.5);
  float ba = id / 16.0 * TAU;
  vec2 bc = CL_RT * vec2(cos(ba), sin(ba));
  float db = length(d - bc);
  float k = mod(id - uClTruss.x + 64.0, 16.0);
  float br = 0.40 + uClTruss.y * (cl_e(k * 1.1) + 0.25 * cl_e((16.0 - k) * 2.0)) + 0.25 * uClTruss.z;
  vec3 bulb = mix(vec3(1.0, 0.86, 0.62), uClNeon2, 0.35);
  col += bulb * br * (cl_e(db * db / (0.0065 * 0.0065)) * 1.6 + cl_e(db / 0.022) * 0.16);
  return col * uClTruss.w;
}

// ---------------------------------------------------------------- the dais: three steps of neon
// one step's neon: the top-front edge (bright), the sides and the back edge (dimmer); axis-aligned
// segment distances (cheaper than sdSegment)
vec3 cl_neon(vec4 t, vec3 nc, float ax, float y, float pe) {
  float ox = max(ax - t.w, 0.0);
  float e1 = length(vec2(ox, y - t.y));
  float e2 = length(vec2(ax - t.w, max(max(t.x - y, y - t.z), 0.0)));
  float e3 = length(vec2(ox, y - t.z));
  return nc * (1.7 * cl_st(e1, pe, 1.1) + 0.22 * cl_e(e1 / 0.010) + 0.9 * cl_st(e2, pe, 0.8) + 0.10 * cl_e(e2 / 0.008) + 0.45 * cl_st(e3, pe, 0.6));
}
// steps: front face y0..y1, top band y1..y2, half width hw
vec4 cl_dais(vec2 w, float pe) {
  const vec4 S0 = vec4(-0.500, -0.362, -0.332, 0.74);
  const vec4 S1 = vec4(-0.332, -0.205, -0.182, 0.53);
  const vec4 S2 = vec4(-0.182, -0.078, -0.056, 0.33);
  vec4 s = w.y < S0.z ? S0 : (w.y < S1.z ? S1 : S2);
  float ax = abs(w.x);
  // silhouette (union of the three step boxes)
  float d0 = sdBox(w - vec2(0.0, 0.5 * (S0.x + S0.z)), vec2(S0.w, 0.5 * (S0.z - S0.x)));
  float d1 = sdBox(w - vec2(0.0, 0.5 * (S1.x + S1.z)), vec2(S1.w, 0.5 * (S1.z - S1.x)));
  float d2 = sdBox(w - vec2(0.0, 0.5 * (S2.x + S2.z)), vec2(S2.w, 0.5 * (S2.z - S2.x)));
  float dd = min(d0, min(d1, d2));
  float cov = cl_fill(dd, pe);
  // face of the selected step: polished black stone, darker at the foot, a frieze in the middle
  float fy = (w.y - s.x) / (s.y - s.x);               // 0 foot .. 1 top edge
  float onFace = step(w.y, s.y);
  vec3 col = uClFace * (0.45 + 0.9 * fy) * onFace;
  {
    float fh = (s.y - s.x);
    float band = abs(fy - 0.52) - 0.20;                 // the frieze band
    float cw = fh * 0.40;
    float cx = w.x / cw, cid = floor(cx + 0.5);
    vec2 c = vec2((cx - cid) * cw, (fy - 0.5) * fh);
    float rad = fh * 0.13;
    float circ = min(abs(length(c) - rad), length(c) - rad * 0.12);
    float k4 = mod(cid, 4.0);
    float tri = abs(sdTriangle(vec2(c.x, k4 < 2.0 ? c.y + rad * 0.2 : -c.y + rad * 0.2), rad * 1.05));
    float motif = mod(cid, 2.0) < 0.5 ? circ : tri;
    vec3 mc = mod(cid, 2.0) < 0.5 ? uClAccA : uClAccB;
    float inBand = step(band, 0.0) * step(ax, s.w - 0.012);
    col += mc * 0.40 * cl_st(motif, pe, 0.5) * inBand * uClDais.y * onFace;
    col += uClLineA * 0.30 * cl_st(band, pe, 0.5) * step(ax, s.w - 0.012) * uClDais.y * onFace;
    // fine vertical iso-lines on the stone (a cool sheen)
    col += uClNeon * 0.04 * cl_lines(w.x / 0.022, pe / 0.022, 0.4) * onFace * (1.0 - fy);
  }
  // top band: lit from the stage
  col += (uClFace * 2.4 + uClNeon * 0.05 * uClDais.z) * (1.0 - onFace);
  // neon: the top-front edge of each step (bright), the sides and the back edges (dimmer)
  vec3 neon = vec3(0.0);
  int nn = (ax < 0.80 && w.y > -0.56 && w.y < -0.02) ? 3 : 0;
  for (int k = 0; k < nn; k++) neon += cl_neon(k == 0 ? S0 : (k == 1 ? S1 : S2), k == 1 ? uClNeon2 : uClNeon, ax, w.y, pe);
  col += neon * uClDais.x;
  return vec4(col, cov);
}

// ---------------------------------------------------------------- the dancer (rgb, coverage)
vec3 cl_chrome(vec2 g, float bev) {
  // mercury: a chrome reflection of the stage (bright sky, a dark horizon band, the floor below)
  vec3 n = normalize(vec3(g * bev, 1.0));
  float y = n.y * 0.8 + 0.2 * n.z;
  vec3 sky = mix(vec3(0.85, 0.88, 1.0), uClBeamA * 1.4, 0.3);
  vec3 c = mix(vec3(0.05, 0.05, 0.07), sky, smoothstep(-0.05, 0.6, y));
  c = mix(c, uClFloorB * 2.0 + vec3(0.06), smoothstep(-0.05, -0.45, y));
  return c * (0.75 + 0.5 * pow(1.0 - n.z, 2.0));
}
vec4 cl_dancer(vec2 w, float pe) {
  vec4 res = vec4(0.0);
  float m = uClMelt.x;
  // the mercury pool and the drips (melt)
  if (uClMelt.y > 0.0) {
    // the pool lies on the top step (clipped at its front edge); claps send ripple rings across it
    vec2 pq = w - vec2(0.0, -0.0645);
    float rp = uClMelt.y;
    float pd = max(sdEllipse(pq, vec2(rp, 0.0155)), -0.078 - w.y);
    float pin = cl_fill(pd, pe);
    float e = length(pq / vec2(1.0, 0.0155 / rp)) / rp;
    vec3 pc = mix(vec3(0.04, 0.04, 0.06), vec3(0.80, 0.84, 0.98), smoothstep(-0.9, 0.9, pq.y / 0.0155));
    float sh = 0.5 + 0.5 * sin(pq.x / rp * 7.0 + 1.0); sh *= sh; sh *= sh;
    pc += uClBeamA * 0.35 * sh * sh;
    float rr1 = 0.08 + uClMelt.z * 1.6, rr0 = 0.08 + uClCrowd.z * 1.6;
    float rip = cl_e(abs(e - rr1) / 0.03) * cl_e(uClMelt.z / 0.40) * step(rr1, 1.0)
              + cl_e(abs(e - rr0) / 0.03) * cl_e(uClCrowd.z / 0.40) * step(rr0, 1.0);
    pc += vec3(0.9, 0.95, 1.0) * rip * 0.8 * uClMelt.w;
    pc += vec3(1.0) * 1.1 * cl_st(pd, pe, 0.6);
    res.rgb = mix(res.rgb, pc, pin);
    res.a = max(res.a, pin);
    // mercury pours over the front edge and runs down the steps in streams
    // (seven streams by domain repetition across the pool's width: one capsule per pixel)
    float sw = max(rp * 0.85 / 3.0, 0.004);
    float k7 = clamp(floor(w.x / sw + 0.5), -3.0, 3.0), fk = k7 + 3.0;
    float xc = k7 * sw + 0.010 * sin(fk * 3.1);
    float len = sat(m * 1.25 - 0.10 * fract(fk * 0.618)) * (0.10 + 0.32 * fract(fk * 0.618 + 0.3));
    vec2 sa = vec2(xc, -0.074);
    float dd = min(sdCapsule(w, sa, sa - vec2(0.0, len), 0.0050 + 0.0025 * fract(fk * 0.37)), length(w - sa + vec2(0.0, len)) - 0.0075 * step(0.01, len));
    dd = min(dd, sdBox(w - vec2(0.0, -0.0815), vec2(rp * 0.9, 0.0035 * smoothstep(0.0, 0.3, m))));
    float din = cl_fill(dd, pe) * step(0.02, m);
    float cx = clamp((w.x - xc) / 0.006, -1.0, 1.0);
    vec3 dc = cl_chrome(vec2(cx * 0.8, -0.1), 1.0);
    // a bead of light runs down the streams after each clap
    float bead = cl_e(abs(w.y + 0.08 + uClMelt.z * 0.9) / 0.012) * cl_e(uClMelt.z / 0.5);
    res.rgb = mix(res.rgb, dc + vec3(1.0) * bead * 0.9 * uClMelt.w, din);
    res.a = max(res.a, din);
  }
  // body space: feet at y = -1, crown at y = +1 (lib sdBody); lean about the feet, kick bounce
  vec2 rel = w - CL_F - vec2(0.0, uClDan.z);
  rel = rot(uClDan.y) * rel;
  vec2 bp = rel / CL_S + vec2(0.0, -1.0);
  bp = vec2(bp.x / (1.0 + 0.9 * m), (bp.y + 1.0) / max(1.0 - 0.97 * m, 0.03) - 1.0);
  float sc = CL_S * max(1.0 - 0.97 * m, 0.03);
  float arms = bp.x < 0.0 ? uClArms.x : uClArms.y;
  float bd = sdBody(bp, arms) * sc;                    // scene units
  float pb = pe / sc;                                  // a pixel in body units
  float inside = cl_fill(bd, pe);
  // the look flips from A to B behind a front running from the feet up
  float fm = 1.0 - smoothstep(uClLookW.x - 0.05, uClLookW.x + 0.05, bp.y);
  vec3 lk = mix(uClLookA, uClLookB, fm);
  float bdB = bd / sc;                                 // body units
  vec3 fillC = CL_INK * lk.x + vec3(0.010, 0.016, 0.050) * lk.y
             + mix(vec3(0.10, 0.03, 0.004), vec3(0.42, 0.22, 0.04), sat((bp.y + 1.0) * 0.55)) * (0.7 + 0.3 * smoothstep(-0.12, 0.0, bdB)) * lk.z;
  // inner contour lines: three silver ones (luminous), four molten ones (gold)
  {
    float spI = 0.06 * (lk.x + lk.y) + 0.055 * lk.z;
    float v = -bdB / spI;
    vec3 cI = vec3(0.62, 0.78, 1.0) * 0.85 * lk.y + vec3(1.0, 0.66, 0.18) * 0.75 * lk.z;
    fillC += cI * cl_lines(v, pb / spI, 0.5 + 0.05 * lk.z) * step(0.5, v) * step(v, 3.5 * lk.y + 4.5 * lk.z);
  }
  // luminous: the seven chakras
  if (lk.y > 0.0) {
    int nch = abs(bp.x) < 0.25 ? 7 : 0;
    for (int i = 0; i < nch; i++) {
      float cd = length(bp - chakraPos(i));
      fillC += chakraColor(float(i)) * (cl_fill(cd - 0.028, pb) * 1.6 + cl_e(cd / 0.05) * 0.35) * lk.y;
    }
  }
  // gold: the heart's fire
  if (lk.z > 0.0) {
    float hc = length((bp - vec2(0.0, 0.42)) * vec2(1.0, 0.8));
    fillC += vec3(1.0, 0.55, 0.12) * (cl_e(hc / 0.08) * 0.9 + cl_st(hc - 0.06, pb, 0.6) * 0.6) * lk.z;
  }
  // melting: the body turns to mercury
  if (m > 0.0) {
    vec2 g = vec2(dFdx(bd), dFdy(bd)) / max(pe, 1e-6);
    float bev = 2.5 * cl_e(max(-bd, 0.0) / 0.012);
    fillC = mix(fillC, cl_chrome(g, bev), sat(m * 1.8));
  }
  vec3 col = fillC;
  // rim: violet (shadow), white (luminous, gold)
  vec3 rimC = vec3(0.50, 0.22, 1.0) * 1.9 * lk.x + vec3(1.45, 1.5, 1.7) * lk.y + vec3(1.35, 1.15, 0.80) * lk.z;
  float rimW = 1.0 * lk.x + 0.75 * (lk.y + lk.z);
  col += rimC * cl_st(bd, pe, rimW) * (1.0 - 0.6 * m);
  // the Shadow's eyes: two red-ringed dots
  if (lk.x > 0.0) {
    vec2 eq = vec2(abs(bp.x) - 0.047, bp.y - 0.858);
    float er = length(eq * vec2(0.8, 1.15));
    vec3 ec = vec3(2.6, 0.08, 0.04) * cl_st(er - 0.020, pb, 0.7) + vec3(1.3, 1.2, 1.4) * cl_fill(er - 0.008, pb);
    col += (ec + vec3(0.9, 0.05, 0.08) * 0.20 * cl_e(er / 0.018)) * lk.x * uClLookW.z * (1.0 - m);
  }
  res.rgb = mix(res.rgb, col, inside);
  res.a = max(res.a, inside);
  // outside the body: the Shadow's aura contours, the gold flame contours
  // one set of contour lines outside the body, by look: the Shadow's violet aura (4 lines, slow
  // wobble), the luminous body's blue aura (3 lines), the gold flames (2 lines licking upward)
  float o = bdB;
  {
    float sp = 0.075 * lk.x + 0.08 * lk.y + 0.085 * lk.z;
    float fl = (0.004 * sin(bp.y * 20.0 - uClT.x * 2.0)) * lk.x
             + (0.035 * sin(bp.y * 14.0 - uClT.x * 7.0 + bp.x * 4.0) * sat(bp.y + 0.9) + 0.06 * sat(bp.y - 0.3)) * -0.5 * lk.z;
    float v = (o + fl) / sp;
    float nl = 4.5 * lk.x + 3.5 * lk.y + 2.5 * lk.z;
    float ln = cl_lines(v, pb / sp, 0.5 + 0.1 * lk.z) * step(0.5, v) * step(v, nl) * cl_e(v * (0.45 * lk.x + 0.4 * lk.y));
    vec3 lc = vec3(0.42, 0.18, 0.95) * 0.30 * lk.x * (1.0 - m) + vec3(0.55, 0.70, 1.0) * 0.12 * lk.y
            + mix(vec3(1.0, 0.62, 0.15), vec3(1.0, 0.25, 0.04), step(1.5, v)) * 0.8 * lk.z;
    vec3 gc = vec3(0.32, 0.12, 0.65) * 0.10 * lk.x + vec3(0.55, 0.70, 1.0) * 0.28 * lk.y + vec3(1.0, 0.5, 0.1) * 0.18 * lk.z;
    res.rgb += (lc * ln + gc * cl_e(max(o, 0.0) / (0.05 + 0.01 * lk.z))) * step(0.0, o);
  }
  // the flip's bright front, the chop light
  res.rgb += vec3(1.0, 0.95, 0.85) * uClLookW.y * cl_e(abs(bp.y - uClLookW.x) / 0.05) * (inside + 0.4 * cl_e(max(o, 0.0) / 0.03));
  res.rgb += vec3(1.0, 0.92, 0.75) * uClLookW.w * (inside * 0.10 + 0.22 * cl_e(max(o, 0.0) / 0.04));
  return res;
}

// ---------------------------------------------------------------- crowd silhouettes
// one figure (figure units: shoulders at y = 0, head top ~0.75); h = its hashes, up = hands up 0..1
float cl_fig(vec2 q, vec2 h, float h3, float up) {
  float hs = 0.92 + 0.22 * h.x;
  float head = length((q - vec2(0.03 * (h.y - 0.5), 0.40 * hs)) * vec2(1.0, 0.86)) - 0.185 * hs;
  float body = sdBox(q - vec2(0.0, -1.02), vec2(0.22 + 0.10 * h.y, 0.94)) - 0.24;
  float d = smin(head, body, 0.13);
  // arms: one (h3 < 0.35) or both raised, elbow bent; down they hide inside the shoulders
  vec2 qa = vec2(abs(q.x), q.y);
  float side = q.x * (h3 - 0.5) > 0.0 ? 1.0 : 0.0;
  float u = up * (h3 < 0.35 ? side : 1.0);
  vec2 sh = vec2(0.34, -0.02), el = mix(vec2(0.38, -0.30), vec2(0.52 + 0.10 * h.y, 0.50), u);
  vec2 hd = mix(vec2(0.32, -0.45), vec2(0.44 + 0.14 * h.x, 1.02 + 0.14 * h.y), u);
  float arm = min(sdCapsule(qa, sh, el, 0.085), sdCapsule(qa, el, hd, 0.070));
  arm = min(arm, length(qa - hd) - 0.095);
  return smin(d, arm, 0.05);
}
// one row of figures (domain repetition along x, two neighbours so they overlap); rgb = rim light, a = coverage
// one figure of a row, cell id: its distance (scene units)
float cl_rowFig(vec2 w, float cx, float id, float base, float s, float sp, float seed) {
  vec2 h = hash22(vec2(id, seed * 3.1));
  float h3 = hash21(vec2(id, seed + 2.0));
  float k = s * (0.88 + 0.24 * h.x);
  // hands: up on the clap (60 ms), down over the beat, each figure up to a 16th late; some stay down
  float dl = h.y * 0.11;
  float a1 = uClCrowd.y - dl, a0 = uClCrowd.z - dl;
  float age = a1 >= 0.0 ? a1 : a0;
  float up = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.40, 0.40 + 0.40 * (0.7 + 0.6 * h.x), age));
  up *= step(0.22, hash21(vec2(id, seed + 7.0)));
  float jump = uClCrowd.w * (0.6 + 0.4 * h.y) * s / 0.3;
  vec2 q = vec2((cx - id - 0.5 - (h.y - 0.5) * 0.45) * sp, w.y - base - (fract(h.x * 7.3 + h.y) - 0.5) * 0.30 * s - jump) / k;
  return cl_fig(q, h, h3, up) * k;
}
// one row of figures (domain repetition along x, two neighbours so they overlap); rgb = rim light, a = coverage
vec4 cl_row(vec2 w, float base, float s, float sp, float seed, float pe) {
  float cx = (w.x + seed) / sp, i0 = floor(cx);
  float d = 1e3;
  int nf = w.y < base + s * 1.5 ? 2 : 0;
  for (int j = 0; j < nf; j++) d = min(d, cl_rowFig(w, cx, i0 + float(j), base, s, sp, seed));
  float cov = cl_fill(d, pe);
  vec2 g = vec2(dFdx(d), dFdy(d)) / max(pe, 1e-6);
  float rim = cl_st(d + 0.8 * pe, pe, 0.7) * sat(g.y * 1.1 + 0.15);
  return vec4(rim * (uClBeamA * 0.55 + uClBeamB * 0.25 + 0.15), cov);
}

void main() {
  vec2 p = uvCentered(gl_FragCoord.xy);
  float pe0 = px();
  // Elements are bounded and the layers hidden behind the opaque crowd and dais are skipped: a GPU skips
  // that work; SwiftShader (the MP4 renderer) runs straight-line code whatever its branches say and only
  // stops loops early, so the work that depends on where a pixel is lives in loops (crowd rows, beams,
  // the neon steps, the chakras).
  // crowd: three rows, nearer rows zoom more; a loop, front row first, so a quad above the crowd or
  // behind a solid row stops after one row; composited front to back.
  vec3 crowdRGB = vec3(0.0);
  float crowdT = 1.0;
  int nRows = (uClCrowd.x > 0.0 && cl_cam(p, 1.25).y < -0.45) ? 3 : 0;
  for (int r = 0; r < nRows; r++) {
    float fr = float(r);
    float kz = 1.85 - 0.30 * fr;
    float base = r == 0 ? -1.04 : (r == 1 ? -0.84 : -0.68);
    float sc = r == 0 ? 0.36 : (r == 1 ? 0.22 : 0.14);
    float sp = r == 0 ? 0.30 : (r == 1 ? 0.185 : 0.115);
    float sd = r == 0 ? 5.9 : (r == 1 ? 23.7 : 11.3);
    vec2 c = cl_cam(p, kz);
    if (c.y > base + sc * 1.5) continue;
    vec4 rw = cl_row(c, base, sc, sp, sd, pe0 / (1.0 + (uClCam.z - 1.0) * kz));
    crowdRGB += crowdT * (rw.a * (CL_INK + uClHaze * 0.035 * fr) + rw.rgb * (1.05 - 0.25 * fr));
    crowdT *= 1.0 - rw.a;
    if (crowdT < 0.001) break;
  }
  float crowdC = 1.0 - crowdT, hidden = crowdC;
  // stage layer coordinates; the dais boxes (cheap) tell where the dais is solid
  float zs = uClCam.z;
  vec2 ws = cl_cam(p, 1.0);
  float pes = pe0 / zs;
  {
    float d0 = sdBox(ws - vec2(0.0, -0.416), vec2(0.74, 0.084));
    float d1 = sdBox(ws - vec2(0.0, -0.257), vec2(0.53, 0.075));
    float d2 = sdBox(ws - vec2(0.0, -0.119), vec2(0.33, 0.063));
    if (min(d0, min(d1, d2)) < -2.0 * pes) hidden = 1.0;
  }
  vec3 col = vec3(0.0);
  if (hidden < 0.999) {
    // far layer: wall, beams, ball
    float zf = 1.0 + (uClCam.z - 1.0) * 0.85;
    vec2 w = cl_cam(p, 0.85);
    float pe = pe0 / zf;
    float isF = step(w.y, CL_J);
    // on the floor everything above is seen in its mirror
    vec2 q = vec2(w.x, mix(w.y, 2.0 * CL_J - w.y, isF));
    float hz = cl_haze(w);
    vec2 d0 = q - CL_B;
    float r0 = length(d0), a0 = atan(d0.y, d0.x);
    vec3 back = cl_wall(q, pe) + cl_corona(r0, a0, pe);
    vec3 bq = vec3(0.0), bdir = vec3(0.0);
    float soft = mix(1.0, 2.6, isF);
    // (loops, not unrolled: SwiftShader stops a loop once no pixel of a quad needs it, but runs every
    // straight-line instruction whatever the branches say)
    int nb = int(uClBeamN + 0.5);
    for (int i = 0; i < nb; i++) bq += cl_beam(uClBeam[i], uClBeamC[i], uClBeamL[i], q, pe, hz, soft);
    // two follow spots from the top corners, crossing on the dancer: soft cones lit by the smoke
    {
      // the cones are mirror images: fold x and evaluate one (the far side's cone is the other's mirror)
      vec2 sp = vec2(-1.95, 1.10), dr = normalize(vec2(0.0, 0.10) - sp);
${U(2, (k) => `      { vec2 v = vec2(${k ? '' : '-'}q.x, q.y) - sp;
        float al = dot(v, dr), pp = abs(v.x * dr.y - v.y * dr.x), wdt = 0.03 + al * 0.085;
        bq += uClNeon2 * uClSpots.z * (1.0 - smoothstep(0.35 * wdt, wdt, pp)) * smoothstep(0.2, 1.0, al) * (0.45 + 0.75 * hz) * (1.0 - 0.6 * isF); }`)}
    }
    vec4 ball = vec4(0.0);
    if (r0 < CL_R + 0.03) ball = cl_ball(q, pe);
    vec3 behind = mix(back + bq, ball.rgb, ball.a);
    vec3 front = mix(back, ball.rgb, ball.a) + bq;
    col = mix(behind, front, uClBeamFront);
    if (abs(r0 - CL_RT) < 0.07) {
      float tocc;
      vec3 truss = cl_truss(d0, r0, a0, pe, tocc);
      col = mix(col, truss, tocc) + truss * (1.0 - tocc);
    }
    // the floor: a footprint-filtered perspective checker, glossy; the beams in front of it unmirrored
    if (isF > 0.0) {
      float dz = max(CL_V - w.y, 1e-3);
      vec2 fp = vec2(w.x, 1.0) * (0.42 / dz) / 0.30;
      fp.y += 0.5;
      vec2 fw = fwidth(fp) + 1e-4;
      vec2 i2 = 2.0 * (abs(fract((fp - 0.5 * fw) * 0.5) - 0.5) - abs(fract((fp + 0.5 * fw) * 0.5) - 0.5)) / fw;
      float chk = 0.5 - 0.5 * i2.x * i2.y;
      float near = sat((CL_J - w.y) / 0.7);
      vec3 fb = mix(uClFloorA, uClFloorB, chk) * (0.6 + 0.6 * near);
      float refl = mix(0.55, 0.30, near) * mix(1.0, 0.6, chk);
      col = fb + col * refl;
      col += uClLineA * 0.10 * cl_st(w.y - CL_J, pe, 0.6);
      int nf = int(uClBeamNF + 0.5);
      for (int i = 0; i < nf; i++) bdir += cl_beam(uClBeam[i], uClBeamC[i], uClBeamL[i], w, pe, hz, 1.0);
      col += bdir;
    }
    col += uClHaze * hz * 0.035;
    col += (uClBeamA * 0.04 + uClHaze * 0.10) * cl_e(abs(w.y + 0.52) / 0.10) * (0.6 + 0.4 * hz);
  }
  // stage layer: the dais and the dancer
  if (crowdC < 0.999 && ws.y < -0.02 && ws.y > -0.57 && abs(ws.x) < 0.82) {
    vec4 dais = cl_dais(ws, pes);
    col = mix(col, dais.rgb, dais.a);
  }
  if (uClDan.x > 0.0 && crowdC < 0.999 && abs(ws.x) < 0.32 && ws.y > -0.53 && ws.y < 0.75) {
    vec4 dn = cl_dancer(ws, pes);
    col = mix(col, dn.rgb, dn.a) + dn.rgb * (1.0 - dn.a) * step(dn.a, 0.999);
  }
  // the beams' convergence on the dancer (tunnel)
  if (uClConv.z > 0.0 && length(ws - uClConv.xy) < 0.3) {
    vec2 cd = ws - uClConv.xy;
    float r = length(cd);
    col += uClBeamA * uClConv.z * (cl_e(r / 0.012) * 1.2 + cl_e(r / 0.06) * 0.25);
    col += vec3(1.0) * uClConv.z * 0.5 * sparkle(ws, uClConv.xy, 0.05);
  }
  // the crowd over everything
  col = col * crowdT + crowdRGB;
  fragColor = vec4(col, 1.0);
}`;

  // ==================================================================== palettes (linear colours)
  // per stage: wall top / low, wall line colours, dais neon (2), floor (2), dais face, frieze accents,
  // haze; the beams' colours come from the ball (beams()) so a ball turn turns every laser.
  const PAL = [
    { // nigredo: ink, bruise violet, ultraviolet; verdigris and ember accents
      wallT: [0.003, 0.002, 0.008], wallL: [0.050, 0.012, 0.085], lineA: [0.36, 0.18, 0.85], lineB: [0.08, 0.58, 0.48],
      neon: [0.45, 0.20, 1.0], neon2: [0.10, 0.70, 0.55], floorA: [0.003, 0.002, 0.006], floorB: [0.030, 0.016, 0.050],
      face: [0.010, 0.006, 0.018], accA: [0.90, 0.30, 0.08], accB: [0.36, 0.18, 0.85], haze: [0.12, 0.05, 0.22],
    },
    { // albedo: ultramarine night, moon silver, ice, lavender
      wallT: [0.003, 0.006, 0.040], wallL: [0.040, 0.080, 0.32], lineA: [0.75, 0.85, 1.0], lineB: [0.45, 0.40, 1.0],
      neon: [0.80, 0.90, 1.0], neon2: [0.35, 0.75, 1.0], floorA: [0.004, 0.008, 0.030], floorB: [0.050, 0.070, 0.16],
      face: [0.008, 0.012, 0.040], accA: [0.70, 0.85, 1.0], accB: [0.45, 0.40, 1.0], haze: [0.10, 0.16, 0.35],
    },
    { // citrinitas: indigo upper sky to saffron dawn; gold, lemon; vermilion and ultramarine
      wallT: [0.010, 0.005, 0.040], wallL: [0.30, 0.10, 0.015], lineA: [1.0, 0.64, 0.18], lineB: [0.62, 0.035, 0.008],
      neon: [1.0, 0.70, 0.20], neon2: [1.0, 0.85, 0.40], floorA: [0.020, 0.008, 0.002], floorB: [0.18, 0.08, 0.015],
      face: [0.025, 0.010, 0.004], accA: [0.62, 0.035, 0.008], accB: [0.004, 0.018, 0.40], haze: [0.30, 0.15, 0.04],
    },
    { // rubedo: crimson over deep ultramarine; molten gold, magenta
      wallT: [0.006, 0.004, 0.040], wallL: [0.25, 0.006, 0.020], lineA: [1.0, 0.60, 0.20], lineB: [0.60, 0.010, 0.20],
      neon: [1.0, 0.65, 0.25], neon2: [0.90, 0.05, 0.30], floorA: [0.020, 0.0, 0.004], floorB: [0.25, 0.010, 0.030],
      face: [0.030, 0.002, 0.006], accA: [1.0, 0.60, 0.20], accB: [0.60, 0.010, 0.20], haze: [0.30, 0.04, 0.08],
    },
  ];
  const CHAKRA = [[0.95, 0.06, 0.08], [1.0, 0.38, 0.02], [1.0, 0.82, 0.05], [0.10, 0.90, 0.25], [0.05, 0.50, 1.0], [0.30, 0.12, 1.0], [0.85, 0.35, 1.0]];
  // the beam colours per ball: violet + acid green, white + ice, gold + amber, the seven chakras
  const BEAMS = [
    (i) => (i % 2 ? [0.40, 1.0, 0.12] : [0.55, 0.20, 1.0]),
    (i) => (i % 2 ? [0.30, 0.75, 1.0] : [0.90, 0.95, 1.0]),
    (i) => (i % 2 ? [1.0, 0.42, 0.06] : [1.0, 0.72, 0.20]),
    (i) => CHAKRA[i % 7],
  ];
  const DOM = [[[0.55, 0.20, 1.0], [0.40, 1.0, 0.12]], [[0.90, 0.95, 1.0], [0.30, 0.75, 1.0]], [[1.0, 0.72, 0.20], [1.0, 0.42, 0.06]], [[1.0, 0.25, 0.30], [1.0, 0.70, 0.15]]];
  // ball materials: m0 base rgb + glitter density, m1 rim rgb + maria, m2 inner glow rgb + grout; corona weights
  const MATS = [
    // corona: G glow (amount, falloff, wide), L streamers (count, base, spread, brightness), F (fringe, fringe
    // decay, log rings, fixed rings), Rg (ring radii, 22-degree ring), X (XIX rays), C0..C3 colours, k kick
    { m0: [0.020, 0.010, 0.040, 0.05], m1: [0.95, 0.40, 0.14, 0.0], m2: [0.0, 0.0, 0.0, 0.7],                       // black sun
      G: [0.12, 4.0, 0.0, 0], L: [170, 0.06, 0.70, 1.0], F: [0.45, 0.05, 0.0, 0.0], Rg: [1.05, 1.085, 0.0, 0], X: [0, 0, 0, 0],
      C0: [0.90, 0.30, 0.08], C1: [0.36, 0.18, 0.85], C2: [0.08, 0.58, 0.48], C3: [0.86, 0.62, 0.42], k: 1 },
    { m0: [0.62, 0.68, 0.80, 0.07], m1: [0.80, 0.90, 1.0, 0.42], m2: [0.05, 0.07, 0.11, 0.55],                      // moon
      G: [0.20, 2.2, 0.0, 0], L: [180, 0.9, 0.0, 0.10], F: [0.0, 0.05, 0.42, 0.0], Rg: [1.05, 1.085, 0.55, 0], X: [0, 0, 0, 0],
      C0: [0.72, 0.84, 1.0], C1: [0.72, 0.84, 1.0], C2: [0.60, 0.70, 1.0], C3: [0.75, 0.82, 1.0], k: 0 },
    { m0: [1.00, 0.56, 0.12, 0.07], m1: [1.0, 0.88, 0.55, 0.0], m2: [0.40, 0.14, 0.0, 0.55],                        // gold sun
      G: [0.25, 2.0, 0.10, 0], L: [96, 0.10, 0.20, 0.0], F: [0.0, 0.05, 0.0, 1.0], Rg: [1.05, 1.085, 0.0, 0], X: [1, 0, 0, 0],
      C0: [1.0, 0.64, 0.16], C1: [1.0, 0.40, 0.05], C2: [1.0, 0.40, 0.05], C3: [1.0, 0.64, 0.16], k: 0.6 },
    { m0: [0.22, 0.0, 0.02, 0.07], m1: [1.0, 0.30, 0.35, 0.0], m2: [0.42, 0.005, 0.04, 0.62],                       // ruby
      G: [0.25, 1.9, 0.0, 0], L: [96, 0.55, 0.40, 0.30], F: [0.0, 0.05, 0.0, 0.85], Rg: [1.07, 1.15, 0.0, 0], X: [0, 0, 0, 0],
      C0: [0.55, 0.01, 0.06], C1: [0.90, 0.05, 0.35], C2: [1.0, 0.45, 0.12], C3: [1.0, 0.62, 0.22], k: 0 },
  ];
  const LOOKS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const PAL_ID = { nigredo: 0, albedo: 1, citrinitas: 2, rubedo: 3 };
  const BALL_ID = { blacksun: 0, moon: 1, sun: 2, ruby: 3 };
  const DANCER_ID = { shadow: 0, luminous: 1, gold: 2, none: -1 };
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const lerpN = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  // a fractional stage index blends the tables (tone crossfades, ball turns)
  const palAt = (x) => {
    x = MO.clamp(x, 0, 3);
    const i = Math.min(2, Math.floor(x)), k = x - i, A = PAL[i], B = PAL[i + 1], o = {};
    for (const key in A) o[key] = lerp3(A[key], B[key], k);
    return o;
  };
  const beamCol = (x, i) => {
    x = MO.clamp(x, 0, 3);
    const a = Math.min(2, Math.floor(x)), k = x - a;
    return lerp3(BEAMS[a](i), BEAMS[a + 1](i), k);
  };
  const domAt = (x) => {
    x = MO.clamp(x, 0, 3);
    const a = Math.min(2, Math.floor(x)), k = x - a;
    return [lerp3(DOM[a][0], DOM[a + 1][0], k), lerp3(DOM[a][1], DOM[a + 1][1], k)];
  };

  // ==================================================================== laser patterns (JS)
  // Each returns up to 14 beams {o: [x, y], a: angle, I: intensity, c: colour slot, w: core width, s/e: start
  // / end along the beam, g: glow, f: emitter flare}. st = { lb: beat in the cue's pattern (bar-periodic),
  // mt: motion clock (s), kick: kick swell 0..1, snap: snap 0..1, open: fan360 opening 0..1, n: beam cap,
  // still: 1 in reduced mode (no rotation), step: 16th count }.
  // Rules (spec 7.3 rule 2): at most n beams; turning rates stay under 0.4 turns/s; beams never switch on
  // and off (chase only moves which thin beam is brightest).
  const J = -0.30, BALL = [0, 0.47], R = 0.225, HEAD = [0, 0.585];   // HEAD: just above the crown
  const FLOOR = [-1.5, -1.05, -0.55, 0, 0.55, 1.05, 1.5];
  const pickFloor = (n) => {
    const sets = { 1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [0, 2, 3, 4, 6], 6: [0, 1, 2, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6] };
    return sets[Math.max(1, Math.min(7, n))];
  };
  const PATTERNS = {
    // symmetric fans from the floor emitters, swelling on the kick, snapping open on the chop syllables
    fan(st) {
      const out = [], n = st.n, em = pickFloor(Math.min(n, 7));
      const pairs = n >= 10;   // with room, each emitter throws a V of two beams
      const spread = st.still ? 0.36 : 0.32 + 0.05 * st.kick + 0.13 * st.snap;
      const sway = st.still ? 0 : 0.07 * Math.sin(st.mt * TAU / (8 * BEAT));
      em.forEach((ei, j) => {
        const x = FLOOR[ei];
        const base = Math.PI / 2 - spread * x / 1.5 + sway * (x >= 0 ? 1 : -1) * Math.abs(x) / 1.5;
        const I = 0.85 + 0.25 * st.kick + 0.2 * st.snap;
        if (pairs && out.length + 2 <= n) {
          const v = st.still ? 0.09 : 0.07 + 0.03 * st.kick + 0.05 * st.snap;
          out.push({ o: [x, J], a: base - v, I, c: j, w: 1, s: 0, e: 4, g: 1, f: 1 });
          out.push({ o: [x, J], a: base + v, I, c: j + 1, w: 1, s: 0, e: 4, g: 1, f: 0 });
        } else out.push({ o: [x, J], a: base, I, c: j, w: 1, s: 0, e: 4, g: 1, f: 1 });
      });
      return out.slice(0, n);
    },
    // two banks crossing and swapping on each kick
    scissor(st) {
      const out = [], n = st.n;
      const per = Math.max(1, Math.floor(n / 2));
      const left = [[-1.5], [-1.05, -0.55], [-1.5, -1.05, -0.55], [-1.5, -1.05, -0.55, -0.25]][Math.min(per, 4) - 1];
      // each beam of a bank lags the one outside it a little (a ripple through the bank, so the
      // bank never sweeps a large area in one frame)
      const thAt = (j) => (st.still ? 0.20 : 0.10 + 0.26 * Math.cos(Math.PI * st.lb - 0.30 * j) + 0.07 * st.snap);
      left.forEach((x, j) => {
        const I = 0.85 + 0.2 * st.kick + 0.2 * st.snap, th = thAt(j);
        out.push({ o: [x, J], a: Math.PI / 2 - th - 0.06 * j, I, c: 0, w: 1, s: 0, e: 4, g: 1, f: 1 });
        out.push({ o: [-x, J], a: Math.PI / 2 + th + 0.06 * j, I, c: 1, w: 1, s: 0, e: 4, g: 1, f: 1 });
      });
      if (n % 2 === 1 && out.length < n) out.push({ o: [0, J], a: Math.PI / 2, I: 0.6 + 0.3 * st.kick, c: 2, w: 1.2, s: 0, e: 4, g: 1.2, f: 0 });
      return out.slice(0, n);
    },
    // near-horizontal sheets from the side walls at hand height, tilting on each kick
    sheet(st) {
      const out = [], n = st.n, per = Math.max(1, Math.floor(n / 2));
      const tilt = st.still ? 0.02 : 0.02 + 0.045 * Math.cos(Math.PI * st.lb) + 0.02 * st.snap;
      for (let j = 0; j < per; j++) {
        const da = (j - (per - 1) / 2) * 0.035;
        const I = 0.8 + 0.2 * st.kick;
        out.push({ o: [-2.0, -0.40], a: tilt + da, I, c: j, w: 0.9, s: 0, e: 4.2, g: 1.3, f: 0 });
        out.push({ o: [2.0, -0.43], a: Math.PI - tilt * 0.8 - da, I, c: j + 1, w: 0.9, s: 0, e: 4.2, g: 1.3, f: 0 });
      }
      if (n % 2 === 1 && out.length < n) out.push({ o: [0, J], a: Math.PI / 2, I: 0.5, c: 0, w: 1, s: 0, e: 4, g: 1, f: 0 });
      return out.slice(0, n);
    },
    // every beam converges on the dancer's head; the ring of emitters turns
    tunnel(st) {
      const out = [], n = st.n;
      const ph = (st.still ? 0.3 : 0.28 * st.mt) + 0.09 * st.snapN;
      for (let j = 0; j < n; j++) {
        const f = ph + TAU * j / n;
        const o = [HEAD[0] + 2.35 * Math.cos(f), HEAD[1] + 1.30 * Math.sin(f)];
        const dx = HEAD[0] - o[0], dy = HEAD[1] - o[1], L = Math.hypot(dx, dy);
        // no kick swell here: every beam overlaps at the convergence, so a swell would pulse that whole area
        out.push({ o, a: Math.atan2(dy, dx), I: 0.85 + 0.12 * st.snap, c: j, w: 1, s: 0, e: L + 0.06, g: 1, f: 0 });
      }
      return out;
    },
    // the ball's beams in every direction, turning; they shoot out when the fan opens
    fan360(st) {
      const out = [], n = st.n;
      const ph = (st.still ? 0.2 : 0.5 * st.mt) + Math.PI / 2;
      const L = 0.42 + 4.0 * st.open;
      for (let j = 0; j < n; j++) {
        out.push({ o: BALL, a: ph + TAU * j / n, I: 0.8 + 0.2 * st.kick + 0.25 * st.snap, c: j, w: 1, s: R * 1.03, e: R + L, g: 0.4 + 0.6 * st.open, f: 0 });
      }
      return out;
    },
    // thin beams from the ball; the brightest moves on by one beam every 16th
    chase(st) {
      const out = [], n = st.n;
      const ph = (st.still ? 0.0 : 0.22 * st.mt) - Math.PI / 2;
      for (let j = 0; j < n; j++) {
        const k = ((st.step - j) % n + n) % n;
        const I = st.still ? 0.45 + 0.35 * Math.exp(-k * 1.3) : 0.30 + 0.85 * Math.exp(-k * 1.3);
        out.push({ o: BALL, a: ph + TAU * (j + 0.5) / n, I, c: j, w: 0.75, s: R * 1.03, e: 4.2, g: 0.8, f: 0 });
      }
      return out;
    },
    // floor fans and the ball's beams together
    all(st) {
      const nb = Math.floor(st.n / 2);
      const a = PATTERNS.fan({ ...st, n: st.n - nb });
      const b = PATTERNS.fan360({ ...st, n: nb, open: 1 });
      return a.concat(b).slice(0, st.n);
    },
  };

  // ==================================================================== the shot
  // CLUB.STAGE (spec 5.1): the club of the black sun, the set of the whole video's riffs.
  // Natural length: 1 bar (no 30 s window). Every pattern is bar-periodic or continuous (scissor and
  //   sheet swing once per beat, fan sways over 2 bars, chase steps per 16th, tunnel and fan360 turn),
  //   so any length loops; half-bar cues work as they are. Events are placed in cue beats through the
  //   cue clock (K.S: offsetBeats shifts them): melt, armsUpAt, the ball and dancer turns ('at'); tone
  //   and push run across the whole cue. Everything else is the score inside the cue window: kicks swell
  //   the fans and pulse the dais neon, the corona and the truss; each downbeat steps the wall's
  //   ziggurat lines outward by one line; claps raise the dancer's arms (60 ms up, held a beat, down over
  //   the next, so a clap fill keeps them up) and the crowd's hands (each figure up to a 16th late); the
  //   kicks on beats 1 and 3 pump one arm, alternating; the chop's 'O-' snaps the fans open and makes
  //   the crowd jump; 'whole!' lights the dancer; snaps (the chop's 'O-' and 'whole!', armsUpAt, the
  //   extra claps of a clap fill on 16ths 14-16; in tunnel every clap from 16th 13) step the tunnel's
  //   ring and flare the convergence. If the drums stop inside the cue (63.4) every motion eases to a
  //   halt within 0.2 s and holds, the beams, the ball and the arms and hands raised on the last clap
  //   (a freeze frame).
  // Params (range (default): what it looks like):
  //   palette    nigredo | albedo | citrinitas | rubedo (nigredo): the ground: back wall, its stepped
  //              ziggurat contour lines, floor checker, dais stone, neon and frieze, haze
  //   ball       blacksun | moon | sun | ruby | {from, to, at} (by palette: nigredo blacksun, albedo moon,
  //              citrinitas sun, rubedo ruby): the mirror ball's material and corona (the ember ink
  //              corona, the moon halo with its 22-degree ring, Tarot XIX straight and wavy rays, the
  //              ruby's crimson glow and gold rings). The lasers take the ball's colours: violet + acid
  //              green, white + ice, gold + amber, the seven chakra colours. {from, to, at}: at cue beat
  //              'at' a terminator sweeps over the ball in 0.2 s (a phase of the moon) with a bright
  //              edge, the beams cross-fade in 0.18 s, the corona in 0.3 s
  //   dancer     shadow | luminous | gold | none | {from, to, at} (shadow): shadow = ink body, violet rim,
  //              red-ringed eyes, violet aura contours; luminous = dark body, white rim, three inner
  //              contour lines, the seven chakras; gold = amber body with molten contour lines, the
  //              heart's fire, two flame contours. {from, to, at}: the look flips at cue beat 'at',
  //              a bright front running up the body from the feet in 0.16 s
  //   pattern    fan | scissor | sheet | tunnel | fan360 | chase | all (fan):
  //              fan      one beam per floor emitter (seven along the back of the floor), a symmetric
  //                       sunburst swelling on the kick, snapping open on the snaps, swaying over 2 bars;
  //                       with 10 or more beams each emitter throws a V of two
  //              scissor  two banks from the left and right emitters crossing on the kicks and parting
  //                       between them (a third, centre beam when the cap is odd)
  //              sheet    near-horizontal fans from both side walls at hand height, tilting on each beat
  //              tunnel   every beam converges on the dancer's crown from a turning ring of emitters;
  //                       the beams pass in front of the ball; a star flares at the convergence; the
  //                       Shadow's eyes brighten across the cue (for the push into its face)
  //              fan360   the ball's beams in every direction, turning; short rays until the first snap
  //                       (armsUpAt, a chop; else the cue start), then they shoot out in 0.3 s
  //              chase    thin beams from the ball at fixed angles; the brightest moves on one beam per
  //                       16th (only the brightness moves, never on/off)
  //              all      floor fan and fan360 together, sharing the cap
  //   crowd      0/1 (1): the three rows of silhouettes
  //   melt       [b0, b1] cue beats (off): from b0 to b1 the dancer squashes into a mercury pool on the
  //              top step (y towards the feet, x widened, the body turning to chrome); seven streams pour
  //              over the edge and run down the steps; every clap sends a ripple ring across the pool
  //              and a bead of light down the streams
  //   armsUpAt   [beats] (none): arms up in 60 ms, held 2 beats, down over a beat; also a snap
  //   tone       [t0, t1] (0, 0): palette shift towards the next stage across the cue (nigredo with
  //              [0, 0.5] ends halfway to albedo: violet lasers fading to silver); also shifts the beams
  //   beams      1..14 (4 in chorus1/chorus2, 6 in chorus3/chorus4, 7 elsewhere): the laser cap
  //              (spec 7.3 rule 2); the patterns never light more
  //   laser      0..2 (1): laser brightness
  //   push       [z0, z1] (1, 1.02): the internal camera push across the cue (a slow 2 %), towards the
  //              dancer's chest; nearer layers zoom more (crowd rows 1.25 / 1.55 / 1.85x the push)
  //   speed      0..16 (1), seed (0), offsetBeats 0..256 (0): the cue clock (ambient motion: ball spin,
  //              spots, haze, tunnel and fan360 turning, fan sway; seed shifts its phase)
  //   Framing (low dutch angles, push-ins) through the engine's frame knob; grade through grade.
  // Safety (spec 7.3, 7.5): at most 'beams' lasers; every beam turns slower than 0.4 turns/s (checked
  //   numerically over every cue at 120 Hz); 1.2 px cores with soft 3 px edges; beams never strobe (the
  //   kick swells them +20-25 %, never in tunnel where they all overlap; the chase moves only the
  //   brightness); the dais neon pulses +20 % on the kick (thin lines); the crimson ground never pulses;
  //   the arms hold through clap fills instead of flickering; the wall's lines step once a bar and fade
  //   to their average coverage, and the dais neon and frieze dim to 30 %, while the camera (the
  //   internal push and the engine's frame knob, measured on screen) sweeps them faster than the
  //   lib's moAntiStrobe curve allows at 1.5x (rule 1: the 15-16 push-in). Reduced mode (uReduced / MO.reduced): lasers static (no
  //   rotation, swing or swell), the ball, its spots and glints frozen, the truss chase at half rate, no
  //   arm pumps, kick pulses x0.3, snaps x0.4, sway and haze x0.7.
  // Couplings: the tunnel cue at bars 15-16 ends pushed into the Shadow's face (score frame zoom 2.2):
  //   every cue publishes MO.MATCH.clubFace[bar it ends on] = { x, y, h, look, eyeDx } (uvCentered units
  //   on the final screen after the push and the frame knob: face centre, head height, look id, half eye
  //   distance); [16] = { x 0, y -0.04, h 0.19, shadow } is the face the hall of masks' central figure
  //   matches at 16.1. The ball sits at 27 % from the top (the 6.1 chorus focal zone); the overlay's
  //   lower bands get crowd and floor only.
  // Cost: one program for all 14 cues. SwiftShader runs every straight-line instruction for every
  //   pixel whatever the branches say (measured), so the cost is the code: one parametrized corona for
  //   all four balls, rational exp, the position-dependent work in loops that stop early per 2x2 quad
  //   (crowd rows and figures, beams, dais neon, chakras). Scene pass, interleaved with albedo.a2 in
  //   one page: 1.27-1.54x albedo.a2's (median 1.47 over five cues, 640x360); with the shared post the
  //   whole frame is about 1.34x, ~127 ms per 640x360 frame and ~2.9 s per 1080p frame at the
  //   reference's nominal 95 ms. Fixed per pixel whatever the cue (the program is shared).
  MO.shot('club.stage', (cue) => {
    const K = cueClock(cue, 0, 4, 0, 0);
    const P = K.P, S = MO.S;
    const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const from = cue.from, to = cue.to, len = Math.max(1e-3, to - from);
    const bt = (b) => K.S(b * BEAT);                         // a cue beat param -> seconds
    const palette = PAL_ID[P.palette] ?? 0;
    const morph = (v, table, dflt) => {
      if (typeof v === 'string' && v in table) return { a: table[v], b: table[v], at: Infinity };
      if (v && typeof v === 'object') {
        const a = v.from in table ? table[v.from] : dflt, b = v.to in table ? table[v.to] : a;
        return { a, b, at: bt(num(v.at, 0)) };
      }
      return { a: dflt, b: dflt, at: Infinity };
    };
    const ball = morph(P.ball, BALL_ID, palette);
    const dancer = morph(P.dancer, DANCER_ID, 0);
    const pattern = PATTERNS[P.pattern] ? P.pattern : 'fan';
    const crowd = K.on('crowd', true);
    const tone = Array.isArray(P.tone) ? [num(P.tone[0], 0), num(P.tone[1], 0)] : [0, 0];
    const melt = Array.isArray(P.melt) ? [bt(num(P.melt[0], 0)), bt(Math.max(num(P.melt[1], 1), num(P.melt[0], 0) + 0.25))] : null;
    const armsUp = (Array.isArray(P.armsUpAt) ? P.armsUpAt : typeof P.armsUpAt === 'number' ? [P.armsUpAt] : []).map((b) => bt(num(b, 0)));
    const push = Array.isArray(P.push) ? [num(P.push[0], 1), num(P.push[1], 1.02)] : [1, 1.02];
    // beam cap (spec 7.3 rule 2): 4 in choruses 1-2, 6 in the final chorus; 7 elsewhere
    const secId = (MO.section(from + 1e-4) || {}).id || '';
    const capDefault = /^chorus[12]$/.test(secId) ? 4 : /^chorus[34]$/.test(secId) ? 6 : 7;
    const nBeams = Math.round(K.p('beams', capDefault, 1, 14));
    const laser = K.p('laser', 1, 0, 2);
    // music inside the cue window
    const evIn = (name) => (MO.events[name] || []).filter((e) => e.t >= from - 1e-4 && e.t < to).map((e) => e.t);
    const kicks = evIn('kick'), claps = evIn('clap');
    const allDrums = ['kick', 'clap', 'closedHat', 'openHat', 'roll'].flatMap(evIn).sort((a, b) => a - b);
    const chops = [];
    for (const c of (S.vocals && S.vocals.chops) || []) for (const [syl, step] of c.syllables) {
      const tt = MO.barTime(c.bar, 0, step);
      if (tt >= from - 1e-4 && tt < to) chops.push({ t: tt, syl });
    }
    // snaps: the chop's 'O-' and 'whole!', the cue's armsUpAt, and the extra claps of a clap fill (16ths
    // 14-16 of a bar); tunnel also snaps on the beat-4 clap that starts the fill
    const fill = claps.filter((tc) => { const s = Math.round((tc / STEP) % 16); return s >= 12 && s <= 15 && s !== 12; });
    const snaps = [...chops.filter((c) => c.syl === 'oh' || c.syl === 'whole').map((c) => c.t), ...armsUp,
      ...(pattern === 'tunnel' ? claps.filter((tc) => { const s = Math.round((tc / STEP) % 16); return s >= 12; }) : fill)].sort((a, b) => a - b);
    // the fan360 opening: on the first snap (armsUpAt, a chop) or at the cue start
    const openAt = snaps.length ? snaps[0] : from;
    // the music stops inside the cue (63.4): every motion eases to a halt after the last drum hit
    const lastHit = allDrums.length ? allDrums[allDrums.length - 1] : -Infinity;
    const T_FREEZE = lastHit > -Infinity && to - lastHit > 0.75 * BEAT ? lastHit + STEP : Infinity;
    const frz = (t) => (t <= T_FREEZE ? t : T_FREEZE + 0.18 * (1 - Math.exp(-(t - T_FREEZE) / 0.18)));
    const act = (t) => (t <= T_FREEZE ? 1 : Math.exp(-(t - T_FREEZE) / 0.18));
    const lastIn = (arr, t) => { let r = -Infinity; for (const x of arr) { if (x <= t + 1e-6) r = x; else break; } return r; };
    const prevIn = (arr, t) => { let r = -Infinity, q = -Infinity; for (const x of arr) { if (x <= t + 1e-6) { q = r; r = x; } else break; } return q; };
    const countIn = (arr, t) => { let n = 0; for (const x of arr) { if (x <= t + 1e-6) n++; else break; } return n; };
    // envelopes with a short attack (no single-frame jumps)
    const envA = (age, att, dec) => (age < 0 ? 0 : age < att ? MO.smooth(age / att) : Math.exp(-(age - att) / dec));
    const snapEnv = (t) => { let s = 0; for (const x of snaps) if (t >= x) s = Math.max(s, envA(t - x, 0.16, 0.30)); return s; };
    const snapStep = (t) => { let s = 0; for (const x of snaps) if (t >= x) s += MO.smooth((t - x) / 0.22); return s; };

    // the wall's contour lines step outward by one line on each downbeat (0.57 lines/s, eased over 1.5
    // beats); a push-in also sweeps them (log-spaced lines: 6.5 per e-fold of zoom), so their contrast
    // fades with the crossing rate (spec 7.3 rule 1, the lib's moAntiStrobe curve, applied at 1.5x)
    const downs = kicks.filter((x) => Math.round(x / BEAT) % 4 === 0);
    const ripple = (t) => { const n = countIn(downs, t), l = lastIn(downs, t); return Number.isFinite(l) ? n - 1 + MO.smooth((t - l) / (1.5 * BEAT)) : 0; };
    const fakeSc = { frame: P.frame, cue, from, to };
    const frameOf = (t) => (P.frame && MO.frameAt ? MO.frameAt(fakeSc, MO.clamp(t, from, to), 16 / 9) : null);
    const pushOf = (t) => MO.mix(push[0], push[1], MO.smooth(MO.clamp((t - from) / len)));
    const zoomAt = (t) => { const f = frameOf(t); return pushOf(t) * (f ? f.zoom : 1); };
    // a scene point's final screen position (uvCentered) after the internal push and the frame knob
    const screenOf = (t, x, y) => {
      const z = pushOf(t), A = 16 / 9;
      let sx = x * z, sy = (y - 0.2) * z + 0.2;
      const f = frameOf(t);
      if (f) {
        const l = f.l, dx = 0.5 + sx / (2 * A) - f.c[0], dy = 0.5 + sy / 2 - f.c[1], det = l[0] * l[3] - l[2] * l[1];
        sx = (l[3] * dx - l[2] * dy) / det * 2 * A; sy = (-l[1] * dx + l[0] * dy) / det * 2;
      }
      return [sx, sy];
    };
    // anti-strobe for linework the camera sweeps (spec 7.3 rule 1): lines 'spacing' scene units apart
    // around a scene point cross a pixel (screen speed / screen spacing) times a second
    const sweepContrast = (t, x, y, spacing) => {
      const h = 1 / 60, a = screenOf(t - h, x, y), b = screenOf(t + h, x, y);
      const v = Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * h);
      const perFrame = v / (spacing * zoomAt(t)) / 30 * 1.5;
      return 1 - MO.smooth(MO.remap(perFrame, 0.07, 0.25));
    };
    const lineContrast = (t) => {
      const h = 1 / 60, dz = Math.abs(Math.log(zoomAt(t + h)) - Math.log(zoomAt(t - h))) / (2 * h);
      const dr = Math.abs(ripple(t + h) - ripple(t - h)) / (2 * h);
      const perFrame = (6.5 * dz + dr) / 30 * 1.5;
      return Math.min(1 - MO.smooth(MO.remap(perFrame, 0.07, 0.25)), sweepContrast(t, 0.6, 0.2, 0.10));
    };
    // the dais neon edges and frieze (bright lines ~0.12 apart) dim while a push sweeps them
    const daisContrast = (t) => sweepContrast(t, 0, -0.2, 0.12);
    const uniforms = (t) => {
      const red = MO.reduced;
      const mt = K.M(frz(t)), A = act(t);
      const u01 = MO.clamp((t - from) / len);
      const lb = (t - from) / BEAT + K.off / BEAT;
      const tk = lastIn(kicks, t), tc = lastIn(claps, t);
      const kick = envA(t - tk, 0.05, 0.20) * A, clapA = t - tc;
      const pump = red ? 0.3 : 1;
      const snap = snapEnv(t) * A;
      const step16 = red ? Math.floor(from / STEP) : Math.floor(frz(t) / STEP);
      // palettes: the ground follows the palette (+ tone), the beams follow the ball (+ tone)
      const toneOff = MO.mix(tone[0], tone[1], MO.smooth(u01));
      const pal = palAt(palette + toneOff);
      const bk = ball.at === Infinity ? 0 : MO.smooth((t - ball.at) / 0.18);
      const beamPal = MO.mix(ball.a, ball.b, bk) + toneOff;
      const dom = domAt(beamPal);
      // laser beams
      const st = { lb, mt, kick: kick * pump, snap: red ? snap * 0.4 : snap, snapN: red ? 0 : snapStep(t), n: nBeams, still: red ? 1 : 0, step: step16,
        open: MO.smooth((t - openAt) / 0.30) };
      if (red) st.mt = 0;
      // beams that reach below the floor line come first: the floor pass draws only those unmirrored
      // (the sum does not depend on the order)
      const crosses = (b) => { const e = Math.min(b.e, 4.5), y0 = b.o[1] + Math.sin(b.a) * b.s, y1 = b.o[1] + Math.sin(b.a) * e; return Math.min(y0, y1) < J + 0.02; };
      const beams0 = PATTERNS[pattern](st);
      const beams = beams0.filter(crosses).concat(beams0.filter((b) => !crosses(b)));
      const nCross = beams0.length - beams0.filter((b) => !crosses(b)).length;
      const uB = new Float32Array(56), uC = new Float32Array(56), uL = new Float32Array(56);
      beams.forEach((b, i) => {
        const c = beamCol(beamPal, b.c);
        const I = b.I * laser;
        uB.set([b.o[0], b.o[1], Math.cos(b.a), Math.sin(b.a)], i * 4);
        uC.set([c[0] * I, c[1] * I, c[2] * I, b.w], i * 4);
        uL.set([b.s, b.e, b.g, b.f * (0.6 + 0.4 * kick)], i * 4);
      });
      // ball
      const MA = MATS[ball.a], MB = MATS[ball.b];
      const ck = MO.smooth((t - ball.at) / 0.30), cm = (key) => lerpN(MA[key], MB[key], ck);
      const wipe = ball.at === Infinity ? 1 : 1 - 2 * MO.smooth((t - ball.at) / 0.20);
      const wipeGlow = ball.at === Infinity ? 0 : Math.exp(-Math.abs(t - ball.at - 0.10) / 0.12) * 0.9;
      // dancer
      const dOn = dancer.a >= 0 || dancer.b >= 0;
      const lookA = LOOKS[Math.max(0, dancer.a)], lookB = LOOKS[Math.max(0, dancer.b)];
      const flip = dancer.at === Infinity ? -1.4 : MO.mix(-1.25, 1.3, MO.smooth((t - dancer.at) / 0.16));
      const flipGlow = dancer.at === Infinity ? 0 : Math.exp(-Math.abs(t - dancer.at - 0.08) / 0.10) * 1.2;
      // arms: up in 60 ms on a clap, held a beat, down over the next (a clap fill keeps them up: one
      // rise, not a flicker); the kicks on beats 1 and 3 pump one arm, alternating
      // (on the frozen clock: when the music stops the arms and the crowd's hands freeze where they are)
      const tf = frz(t), cfA = tf - tc;
      const clapEnv = Number.isFinite(tc) ? (cfA < 0.06 ? MO.smooth(cfA / 0.06) : 1 - MO.smooth((cfA - BEAT) / BEAT)) : 0;
      const nk = countIn(kicks, t), kb = Number.isFinite(tk) ? Math.round(tk / BEAT) % 4 : 1;
      const kickArm = red || (kb !== 0 && kb !== 2) ? 0 : envA(tf - tk, 0.08, 0.30) * 0.32;
      let held = 0;
      for (const ta of armsUp) if (t >= ta) held = Math.max(held, MO.smooth((t - ta) / 0.06) * (1 - MO.smooth((t - ta - 2 * BEAT) / BEAT)));
      const armL = Math.max(clapEnv, held, nk % 2 ? kickArm : 0);
      const armR = Math.max(clapEnv, held, nk % 2 ? 0 : kickArm);
      const m = melt ? MO.smooth(MO.remap(t, melt[0], melt[1])) : 0;
      const pool = melt ? 0.035 + 0.20 * MO.easeOut(MO.remap(t, melt[0], melt[1] + 0.25)) : 0;
      const pc = prevIn(claps, t);
      const chopLight = (() => { let s = 0; for (const c of chops) if (c.syl === 'whole' && t >= c.t) s = Math.max(s, envA(t - c.t, 0.08, 0.5)); return s; })();
      const jump = (() => { let s = 0; for (const c of chops) if (c.syl === 'oh' && t >= c.t) s = Math.max(s, envA(t - c.t, 0.08, 0.16)); return s; })();
      // camera: a slow push (2 % by default) towards the dancer's chest
      const zoom = MO.mix(push[0], push[1], MO.smooth(u01));
      const dc = daisContrast(t);
      const u = {
        uClCam: [0, 0.2, zoom, 0],
        uClT: [mt, step16, red ? 0.4 + K.seed : 0.55 * mt, red ? K.M(t) * 0.7 : K.M(t)],
        uClBeam: uB, uClBeamC: uC, uClBeamL: uL, uClBeamN: beams.length, uClBeamNF: nCross,
        uClBeamFront: pattern === 'tunnel' ? 1 : 0,
        uClWallT: pal.wallT, uClWallL: pal.wallL, uClLineA: pal.lineA, uClLineB: pal.lineB, uClNeon: pal.neon, uClNeon2: pal.neon2,
        uClFloorA: pal.floorA, uClFloorB: pal.floorB, uClFace: pal.face, uClAccA: pal.accA, uClAccB: pal.accB, uClHaze: pal.haze,
        uClBeamA: dom[0], uClBeamB: dom[1],
        uClLines: [1, ripple(t), lineContrast(t), 0],
        uClSpots: [0.9, red ? 0.1 : 0.55 * mt * 0.32, 0.075, 0],
        uClCorG: cm('G'), uClCorL: cm('L'), uClCorF: cm('F'), uClCorRg: cm('Rg'), uClCorX: cm('X'),
        uClCorC0: cm('C0'), uClCorC1: cm('C1'), uClCorC2: cm('C2'), uClCorC3: cm('C3'),
        uClCorK: [red ? 0.1 : 0.12 * mt, kick * pump, MO.mix(MA.k, MB.k, ck), 0],
        uClMatA0: MA.m0, uClMatA1: MA.m1, uClMatA2: MA.m2, uClMatB0: MB.m0, uClMatB1: MB.m1, uClMatB2: MB.m2,
        uClBallW: [wipe, wipeGlow, 0, 0],
        uClTruss: [red ? Math.floor(step16 / 2) : step16, red ? 0.5 : 1.1, kick * pump, 1],
        uClDais: [(1 + 0.2 * kick * pump) * MO.mix(0.3, 1, dc), dc, 1, 0],
        uClConv: pattern === 'tunnel' ? [HEAD[0], HEAD[1], 0.35 + 0.15 * snap, 0] : [0, 0, 0, 0],
        uClDan: [dOn ? 1 : 0, 0.07 * Math.sin(Math.PI * lb) * A * (red ? 0.7 : 1), -0.010 * envA(t - tk, 0.03, 0.15) * A, 0],
        uClArms: [armL, armR, 0, 0],
        uClLookA: lookA, uClLookB: lookB,
        uClLookW: [flip, flipGlow, pattern === 'tunnel' ? 1 + 1.2 * MO.smooth(u01) : 1, chopLight],
        uClMelt: [m, pool, Number.isFinite(tc) ? t - tc : 99, melt ? MO.smooth(MO.remap(t, melt[0], melt[0] + BEAT)) : 0],
        uClCrowd: [crowd ? 1 : 0, Number.isFinite(tc) ? tf - tc : 99, Number.isFinite(pc) ? tf - pc : 99, 0.035 * jump],
      };
      return u;
    };
    // match cut (spec 4.1 rule 9): where the dancer's face is on screen on the cue's last frame, after the
    // internal push and the engine's frame knob, keyed by the bar the cue ends on (MO.MATCH.clubFace[16]
    // is the Shadow's face that cuts into persona.masks at 16.1). uv units: y up, 1 = half the frame height.
    {
      const tEnd = to - 1e-3, A = 16 / 9;
      const z = MO.mix(push[0], push[1], 1), F = [0, 0.2];
      const face = [0, -0.066 + 1.858 * 0.315];
      let sx = (face[0] - F[0]) * z + F[0], sy = (face[1] - F[1]) * z + F[1], h = 0.27 * 0.315 * z;
      const fr = P.frame && MO.frameAt ? MO.frameAt({ frame: P.frame, cue, from, to }, tEnd, A) : null;
      if (fr) {
        // post: source = c + L * d (texture units); invert for the screen offset d
        const l = fr.l, dx = 0.5 + sx / (2 * A) - fr.c[0], dy = 0.5 + sy / 2 - fr.c[1];
        const det = l[0] * l[3] - l[2] * l[1];
        const ox = (l[3] * dx - l[2] * dy) / det, oy = (-l[1] * dx + l[0] * dy) / det;
        sx = ox * 2 * A; sy = oy * 2; h *= fr.zoom;
      }
      MO.MATCH = MO.MATCH || {};
      MO.MATCH.clubFace = MO.MATCH.clubFace || {};
      MO.MATCH.clubFace[cue.bar1] = { x: +sx.toFixed(4), y: +sy.toFixed(4), h: +h.toFixed(4), look: dancer.b, eyeDx: +(0.047 * 0.315 * (fr ? fr.zoom : 1) * z).toFixed(4) };
    }
    MO.scene({ id: 'club.stage#' + cue.index, fs: FS, uniforms, bloom: 0.7, bloomThreshold: 0.8, vignette: 0.45 });
  });
})();
