// NO SURVIVORS: Keep Them Dancing. World kit (adds to NS.kit): cameras, sky and weather, the city street, the band's van,
// posters and in-world print, the Orpheum stage set (forward, reverse, ruin, thermal), stage lights, light and FX, and
// Lou's mark. Procedural, deterministic in time (seeded; no Math.random), cached in offscreen canvases (NS.makeCanvas,
// tag 'world'), no ctx.filter / letterSpacing; shadowBlur only while building caches. All brightness of flashes,
// lightning, pyro, lasers, strobes and muzzle flashes is multiplied by S.flashK (or 0.3 when NS.reduced and no S).
//
// CONVENTIONS: coordinates are in the CURRENT user space of the ctx you pass (frame units 1280 x 720 unless you are
// inside a camera). `S` is the engine's frame state (S.t, S.beat, S.flashK, S.hit, drum lanes); helpers that only
// need time accept {t} or {S}. k = 0..1 intensity. Colours are CSS hex strings. Functions draw and return info.
//
// CAMERA
//   kit.cam(ctx, {x, y, zoom, rot}, fn)      world point (x, y) lands on the frame centre (640, 360), scaled by zoom
//   kit.camPoint(cam, x, y) -> [sx, sy]      world -> frame;   kit.camInv(cam, sx, sy) -> [x, y]
//   kit.parallaxCam(cam, d) -> cam            the camera seen by a layer at depth d (0 = fixed/infinitely far, 1 = full)
//   kit.parallax(ctx, cam, d, fn)             kit.cam with parallaxCam(cam, d)
//   kit.handheld(S, amp = 6, seed, rate) -> {x, y, rot}   smooth deterministic hand-held drift to add to a camera
//
// SKY AND WEATHER
//   kit.sky(ctx, S, {top, bottom, moon: {x, y, r, k}, clouds 0..1 (0.7), lightning 0..1 (x flashK, lights the clouds
//       from inside around lightningX), lightningX, stars 0..1, glow 0..1 (city glow at the horizon), glowColor,
//       scroll (px, parallax 0.08/0.16), wind (px/s), x, y, w, h})          fills the region (default full frame)
//   kit.lightningK(S, {type: 'thunder', dur: 0.9}) -> 0..1   strike + one re-strike after the latest hit (Reduce
//       flashing: one soft swell). Feed it to sky.lightning / lightningBolt.k (they apply flashK).
//   kit.lightningBolt(ctx, S, {x, y0, y1, x1, k, seed, color, width, branches 3})   additive jagged bolt + glow
//   kit.skyline(ctx, S, {seed, y (baseline), depth 0 far..1 near, color, fogColor, windows 0..1, scroll (px), height
//       (scale), x0, x1, sign: {x, k, s, h, text, dead}})   tiling 2048-unit strip of buildings (water towers,
//       antennas with blinking red lights, billboards, fire escapes on near layers, lit/flickering windows). Near
//       layers are darker, far layers hazier. sign = a vertical ORPHEUM neon blade (dead letters) at strip x.
//   kit.neonBlade(ctx, S, x, y, s, k, {text 'ORPHEUM', dead: [2, 5]})   that blade sign alone (base at x, y; s 1 = 150 tall)
//   kit.rain(ctx, S, {density 0..1 (0.6), angle (rad from vertical, 0.12), speed (1), color, k, len, seed, x, y, w, h,
//       layers [0, 1, 2], splashes: groundY | {y0, y1}, glints: [{x, y, r, color, k}]})   3 parallax streak layers;
//       glints = drops lit inside lamp/flashlight radii; splashes = crowns on the ground band
//   kit.fog(ctx, S, {y, h, color, k, scroll, speed (px/s), seed, x0, x1})   two drifting soft fog bands (tiling)
//
// STREET AND CITY
//   kit.street(ctx, S, {view 'side' | 'ahead', horizonY (520), bottomY (720), farScale (0.42), scroll (world units
//       at the near plane), wet 0..1, lamps: [{x, color, k, w}], lines 'double' | 'dash' | 'none', curbs: [far, near]
//       (band fractions), sidewalk (true), puddles (7), seed, asphalt, concrete; ahead: vx, roadW, haze})
//       -> {sAt(y) (perspective scale), xAt(u, y), yAt(f), curbFar, curbNear, horizonY}
//       'side' = tracking shot past a street (perspective asphalt strips, curbs, lane lines, puddles with rain
//       ripples, wet reflection streaks under each lamp); 'ahead' = down the road to a vanishing point (vx, horizonY).
//   kit.brickWall(ctx, x, y, w, h, {seed, color, mortar, brick (row height 24), grime, damp, scorch, damage,
//       lights: [{x, y, r, color, k}]})   cached; lights = additive pools clipped to the wall
//   kit.lightPools(ctx, x, y, w, h, lights)   additive pools clipped to a rect
//   kit.streetlight(ctx, x, y, {h (320), color (sodium), k, style 'cobra' | 'lantern', face 1|-1, flicker (seed: uses
//       kit.flicker), t | S, cone (true), pool (true), groundY, motes}) -> {lamp: [x, y], ground: [x, y], k}
//   kit.fence(ctx, x, y, w, h, {kind 'chain' | 'wood' | 'bars', seed, color, damage 0..1 (holes, sag, lean), barbed})
//       (x, y) = top-left
//   kit.wreck(ctx, x, y, s, {seed, kind 'sedan'|'hatch'|'pickup', color, face, flipped, burning 0..1, t | S})
//       (x, y) = ground centre, s 1 = 300 long; burning adds flames, glow and a ground pool (add kit.smoke yourself)
//   kit.fire(ctx, S, x, y, w, h, k, seed)     flickering flame tongues, base centre (x, y)
//   kit.dumpster(ctx, x, y, s, {seed, lid 0..1, color, face, bags})   (x, y) = ground centre, s 1 = 240 wide
//   kit.sign(ctx, x, y, text, {kind 'guide' | 'street' | 'warning', h (post height 150), w, arrow 'up'|'left'|'right',
//       rot, damage 0..1, lit 0..1 (retroreflective glow in headlights), seed, posts})   (x, y) = ground under the sign;
//       '\n' splits lines; a last line starting with a digit ("2 MI") is right-aligned with the arrow at its left.
//       e.g. kit.sign(ctx, 900, 600, 'THE ORPHEUM\n2 MI', {arrow: 'up'}) -> {w, h, top}
//   kit.van(ctx, x, y, s, {face 1|-1, wheel (radians), spin 0..1 (wheel blur), damage 0..1 (dents, scrapes, cracked
//       glass, splats, missing hubcap; 1 = crumpled front), crashed (crushed nose, tilt, steam, flickering lamp),
//       headlights 0..1, beams (true), motes, taillights 0..1, bounce (body lift), tilt, crew (Granny's beehive at the
//       wheel + Vex's pompadour), dash 0..1, smoke, t | S})   (x, y) = ground centre, s 1 = 470 long, 330 tall.
//       The band's tour van: boxy, oxblood + bone two-tone, primer-grey rear panel, roof rack with tarp and bass
//       case, rear ladder, the NO SURVIVORS logo (always reads left to right).
//       -> {headlight: [x, y], tail: [x, y], wheels: [[x, y], [x, y]], driver: [x, y] (front window), roof, bbox}
//   kit.poster(ctx, kind, x, y, w, h, {seed, torn 0..1 (ragged bites, a torn peeling corner), weather 0..1 (stains,
//       creases, grime runs), fade 0..1 (sun-faded), tape (true), rot, alpha, res (1.5), lines (override), k (admit glow)})
//       (x, y) = top-left. Texts come from SCORE.texts. Kinds:
//       'gig'       LAST CALL LOU PRESENTS / NO SURVIVORS / THE ORPHEUM / FRI 30 OCT 1987 · ONE NIGHT ONLY / LIVE ON
//                   1313 AM; Lou's mark large on a red sunburst; screen-print on yellowed paper (aspect ~0.7)
//       'missing'   MISSING / SINCE 1987 / the four faces (kit.portrait 'xerox' '1987'; Vex a taped glossy signed
//                   headshot) with names / LAST SEEN: THE ORPHEUM (aspect ~0.7)
//       'condemned' red CONDEMNED header, FIRE · 31 OCT 1987 · 3:00 AM, UNSAFE STRUCTURE · CAPACITY 1,204 · NO
//                   ADMITTANCE (wrapped), BY ORDER OF THE CITY, seal and signature (Special Elite; aspect ~0.75)
//       'admit'     the black-stock ticket in UV ink: ADMIT ONE, No. 1,205 on the stub with Lou's mark, NO SURVIVORS ·
//                   THE ORPHEUM, NIGHT {next} · DOORS 3:00 AM (SCORE.ticket; landscape ~2.3:1)
//       -> {rect: [x, y, w, h], minCap}.  kit.poster.minCap(kind, w): the smallest clue-text cap height when drawn w
//       wide (0.076 w gig/missing, 0.072 w condemned): for the 36-unit rule frame the poster >= ~480 wide (or zoom).
//   kit.wristband(ctx, x, y, s, k, {rot, text}) black vinyl band, UV-purple ADMIT ONE + Lou's mark + snap, glowing k.
//       (x, y) = centre, s = band height; printed cap height = 0.5 s (>= 14 units at s >= 28; 36 at s = 72); ~5.4 s long
//       -> {w, h, cap}
//
// THE ORPHEUM STAGE SET
//   kit.stageSet(ctx, S, opts) -> info. Inside of an old scorched 1920s theatre. opts:
//       cam: 'wide' | 'pit' | 'low' | 'drummer' | 'side' | {x, y, zoom, low 0..1} (forward custom) | {rev: 1, side}
//         wide = proscenium, boxes and crooked chandelier from the back of the pit; pit = closer, valance at the top;
//         low = from the photo pit at the barricade looking up (floor collapses, no crowd in front: info.pit.none);
//         drummer = REVERSE view from behind the kit into the house (balconies, exit signs, chandelier, the pit);
//         side = reverse view from the wing (curtain leg + amp stack in the near foreground, house skewed)
//       pass: 'all' | 'back' | 'frame' | 'fx' (draw in info.order, see below), power 0..1 (0 blackout: only exit signs
//       and moonlight; 0.3 dim amber work light; 1 full show), lights 0..1 (stage beams; default = power), colors
//       [4 css], pattern 'sweep'|'fan'|'chase'|'down'|'strobe'|'wash', haze 0..1, scorch 0..1 (0.6), curtainFire 0..1
//       (a small flame climbing the STAGE-LEFT curtain = audience/frame right, with char + embers), pyro (k or [k x4]
//       at info.pyro), lasers 0..1, moon 0..1 (moonlight shafts through roof holes; default (1 - power) * 0.5),
//       kit (draw the drum kit in the back pass, default true: pass false and draw kit.drumKit after Tiny),
//       micstand (true), barricade (true), ruin 0..1 (> 0.5: the cold roofless burnt-out ruin under a live night sky,
//       fallen truss and chandelier, rubble, no curtains), thermal (cold indigo grade for the thermal coda), sky (kit.sky
//       opts for the ruin).
//     Pass order: forward views info.order = ['back', 'band', 'frame', 'crowd', 'fx']; reverse views (drummer, side)
//       ['back', 'crowd', 'frame', 'band', 'fx']. Call stageSet once per pass with the same opts; 'band' and 'crowd'
//       are yours (survivors at info.spots, kit.horde with area: info.pit). 'frame' also draws footlights, the
//       curtain fire and pyro jets (behind the crowd); 'fx' draws beams, backwash, haze, lasers, moonlight (additive).
//     Darkening for power < 1 is baked per pass (a frame-sized work canvas), so characters you draw are not darkened:
//       light them yourself. For flashlight scenes draw the set at power ~0.35-0.5 and put kit.darkness over it.
//     info = {angle, cam, order, spots: {vex, granny, noodle, tiny: [x, y, s]} (feet point + survivor scale s),
//       drums: [x, y, s] (kit.drumKit(ctx, x, y, s * 0.56) for the forward view), mic: [x, y, s], amps: [[x, y, s] x4],
//       pit: {x0, x1, yFar, yNear, sFar, sNear, none?} (kit.horde area), pyro: [[x, y, s] x4] (forward) | x2 (reverse),
//       fixtures: [[x, y], ...] (truss lights), lipY, curtainL: [x, y] (base of the stage-left curtain), rev (reverse),
//       floor(u, f, lift) -> [x, y, s] (forward: u 0..1 across the stage from audience left, f 0 back wall..1 lip)}
//   kit.stageLights(ctx, S, {k, colors, pattern, from: [[x, y], ...], target: {y, x0, x1}, haze, info})  additive
//       beams + pools + a colour backwash (colours step once per bar; chase/strobe at most once per beat; x flashK)
//   kit.lasers(ctx, S, {k, count 9, color (laser green), origin: [x, y], y (target line), spread 1.3, pattern
//       'fan'|'sweep'|'cross'})   additive beams with glow, x flashK
//   kit.pyroK(S, type = 'pyro', dur = 1.2) -> 0..1 flame envelope after the latest hit of that type
//   kit.pyro(ctx, S, x, y, k, {s (1 = 420 tall at k 1), seed})   a flame jet column rising from (x, y), x flashK
//   kit.amp(ctx, x, y, s, {kind 'stack'|'combo'|'cab'|'head', on 0..1 (jewel light + glow), face, scorch, seed})
//       (x, y) = bottom centre; s 1 = stack 312 tall, 160 wide -> {top: [x, y], w, h}
//   kit.drumKit(ctx, x, y, s, {view 'front'|'back', S (cymbals wobble on S.crash/S.hat, kick head pulses on S.kick), t,
//       logo, shell})  (x, y) = floor under the bass drum; s 1 = ~400 wide, 340 tall
//       -> {seat, snare, kick, crash, ride, hat, floorTom: [x, y]}
//   kit.roadCase(ctx, x, y, s, {label (SCORE.band), sub, seed, face})  flight case; bottom centre; s 1 = 170 x 110
//   kit.pyroButton(ctx, x, y, s, pressed (bool | 0..1), {k (armed LED/glow), label 'PYRO'}) hazard box + red mushroom
//       button; bottom centre; s 1 = 130 wide -> {button: [x, y]}
//   kit.setlist(ctx, x, y, w, h, {rot, seed, tape (gaffer), char 0..1 (charred bottom), light, lightColor, alpha, res})
//       SCORE.setlist: header, the six songs, then the encore underlined twice, all in Vex's hand (Permanent Marker),
//       uniform (the acrostic is never highlighted). (x, y) = top-left -> {rect, cap}. kit.setlist.minCap(w, h) = the
//       song cap height (aim w:h ~ 0.85; 600 x 700 gives ~37 units).
//
// LIGHT AND FX
//   kit.darkness(ctx, k, lights, {color, x, y, w, h, res 0.5}) a darkness layer (alpha k) with soft cut-outs, in frame
//       units: lights = [{type: 'cone', x, y, angle, spread (half-angle), len, k}, {type: 'radial', x, y, r, k, soft}]
//   kit.beam(ctx, x, y, angle, spread (half-angle rad), len, color, k, {motes 22, t, seed, core}) additive volumetric
//       cone with drifting dust motes
//   kit.glow(ctx, x, y, r, color, k, kind 'soft'|'hot'|'flat'|'ring')   additive cached radial glow
//   kit.flicker(t, seed, amount = 1) -> 0..1   bulb brightness: steady wobble, faint buzz, short sputters (~1 per 2 s,
//       dips <= 0.5 x amount: safe for a room light)
//   kit.muzzleFlash(ctx, x, y, angle, k, seed, {s (1 = 230 long), S})   petal flash + glow (additive, x flashK)
//   kit.sparks(ctx, S, {x, y, t0 (global s), seed, count 26, spread, angle (-PI/2 up), speed, gravity, life, color,
//       floorY (bounce), len, s})   ballistic spark streaks after t0
//   kit.smoke(ctx, S, {x, y, w, rate, life, rise, size, grow, color, k, wind, seed, t0, dur, lit})  rising puffs
//   kit.embers(ctx, S, {x, y, w, h (rising region, top-left), count, seed, color, k, rise, swirl, size})
//   kit.splat(ctx, x, y, s, seed, color ('#18240f'), {k (grow-in 0..1), rot, alpha})  comic ink splat (s 1 ~ 220 across)
//   kit.debris(ctx, S, {x, y, t0, seed, count, kind 'rubble'|'glass'|'paper'|'shells'|'wood', spread, angle, speed,
//       gravity, floorY, s, color, life})
//   kit.fireworks(ctx, S, {x, y (burst), t0 (burst time; a trail rises in the 0.7 s before), seed, color | colors, r,
//       count, k, trail})
//   kit.speedLines(ctx, S, {cx, cy, k, seed, color, count, inner, outer, width, rate})  comic radial lines
//   kit.halftone(ctx, x, y, w, h, {color, k, angle, size (cell 11), mode 'linear'|'radial'|'flat', dir, cx, cy, min, max})
//   kit.shockwave(ctx, x, y, r, k, {color, squash})
//   kit.phoneGlow(ctx, x, y, k, {s (1 = 30 tall), rot, face: [x, y] | false, rec})  cold-white screen + face light
//   kit.burn(ctx, S, k, seed, {mode 'cut' | 'black', x, y, w, h})  film burn: a noise-edged hole grows from the centre
//       (k 0 intact .. 1 gone), charred band, curling orange rim. 'cut' punches the hole with destination-out (draw the
//       outgoing frame on its own layer, burn it, then draw that layer over the incoming); Reduce flashing: thin dim rim.
//
// IN-WORLD TEXT AND MARKS
//   kit.symbol(ctx, x, y, size, color (WHO.LOU), k, {weight, ticks, glow (true | color | k), bg, fill, rot})  Lou's
//       mark: a clock face at 3:00 (minute hand up, hour hand right) reading as an L. size = diameter, (x, y) = centre.
//   kit.clock(ctx, x, y, r, {style 'wall'|'dash', digital, text ('3:00'), color, k, crack, grime, rot})  always stopped at
//       3:00 (second hand on 12). digital: LED readout in Share Tech Mono (r = digit height) -> {w, h}
//   kit.graffiti(ctx, text | {text, who, struck, signature}, x, y, {size (64, font px), color (or WHO[who]), rot, font
//       'hand'|'stencil'|'spray', drip 0..1, k (reveal left to right), seed, align 'left'|'center', struck, strikeColor
//       (Vex red), signature (Vex's scrawl from kit.CAST.vex.sign replaces a trailing ★), alpha, res}) -> {w, h}
//       (x, y) = baseline start (or centre with align 'center'). NS.fill tokens are filled ({prev} etc). ★ ♥ → — drawn
//       as shapes. Pass a SCORE.texts.graffiti entry directly for the author's colour.
//   kit.tallyMarks(ctx, x, y, w, h, {count (fill), seed, color | colors [..], size (26), k (reveal by rows), alpha})
//       -> {count}   hand-drawn groups of five; the whole block is cached (thousands of marks cost one blit)
//   kit.onomatopoeia(ctx, text, x, y, {size 110, color, rot, k (life 0..1: pop in by 0.12, fade after 0.75), burst,
//       burstColor, outline, seed})  Bangers with outline, gradient fill and a jagged burst
//   kit.textWorld(ctx, text, x, y, {size, font (NS.F key or family), color, align, persp -1..1, rot, skew, glow, k,
//       outline, outlineW, w (max width)})  sign text with optional trapezoid perspective; (x, y) = text middle
//
// CACHES
//   kit.worldWarm(['stage', 'ruin', 'house', 'street', 'sky', 'van', 'fx']) pre-builds the heavy caches (from warm())
//   kit.worldRelease(prefix?) frees world caches ('stage:', 'sky:', 'st:', 'van:', 'poster', 'graf', 'tally', ...)
//   kit.worldMem() -> bytes held by world caches (LRU-evicted above ~72 MB x cacheScale^2)
(function () {
  'use strict';
  const NS = window.NS;
  if (!NS) return;
  const kit = (NS.kit = NS.kit || {});
  const W = NS.W || 1280, H = NS.H || 720;
  const TAU = Math.PI * 2, PI = Math.PI;
  const { sin, cos, abs, min, max, floor, ceil, sqrt, pow, atan2, hypot, round, exp, tan } = Math;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const bump = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
  const fract = (x) => x - floor(x);
  const hash = (n, s) => NS.hash(n, s || 0);
  const noise1 = (x, s) => NS.noise1(x, s || 0);
  const hs = (a, b) => NS.hash(a * 7919 + b * 104729 + 13, 991);   // 2-int hash
  const F = NS.F, C = NS.C;
  const CS = () => NS.cacheScale || 1;
  const fk = (S) => (S && S.flashK != null ? S.flashK : (NS.reduced ? 0.3 : 1));
  const tOf = (S) => (S && S.t != null ? S.t : 0);

  // ------------------------------------------------------------------------------------------ colour
  const COLS = new Map();
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let v = COLS.get(c);
    if (v) return v;
    const s = String(c || '#000').trim();
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
      v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    } else {
      const m = s.match(/[\d.]+/g) || [0, 0, 0];
      v = [+m[0], +m[1], +m[2]];
    }
    COLS.set(c, v);
    return v;
  }
  function css(c, a) {
    const v = rgb(c);
    if (a == null || a >= 1) return `rgb(${v[0] | 0},${v[1] | 0},${v[2] | 0})`;
    return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${max(0, a).toFixed(3)})`;
  }
  const mix = (a, b, k) => { const A = rgb(a), B = rgb(b); return [lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]; };
  const shade = (c, k) => (k < 0 ? mix(c, [0, 0, 0], -k) : mix(c, [255, 255, 255], k));
  const lum = (c) => { const v = rgb(c); return (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255; };
  // a palette remap hook (stageSet thermal mode routes every colour through it)
  let PAL = null;
  const P = (c, a) => (PAL ? PAL(c, a) : css(c, a));

  // ------------------------------------------------------------------------------------------ fonts
  const FAMS = ['Metal Mania', 'Anton', 'Bangers', 'Permanent Marker', 'Share Tech Mono', 'Special Elite'];
  let FOK = false;
  function fontsOk() {
    if (FOK) return true;
    try {
      if (!document.fonts || !document.fonts.check) return (FOK = true);
      FOK = FAMS.every((f) => document.fonts.check(`20px '${f}'`));
    } catch (e) { FOK = true; }
    return FOK;
  }
  let MCTX = null;
  function mctx() { if (!MCTX) MCTX = NS.makeCanvas(4, 4, 'world').getContext('2d'); return MCTX; }
  const CAPS = new Map();
  // cap height of family as a fraction of the font size (measured on 'H')
  function capRatio(fam) {
    let r = CAPS.get(fam);
    if (r) return r;
    const g = mctx();
    g.font = NS.font(100, fam);
    const m = g.measureText('H');
    r = (m.actualBoundingBoxAscent || 72) / 100;
    if (fontsOk()) CAPS.set(fam, r);
    return r;
  }
  // font size whose cap height is `cap` units
  const sizeForCap = (cap, fam) => cap / capRatio(fam);
  function measure(g, text, size, fam) { g.font = NS.font(size, fam); return g.measureText(text).width; }
  // the largest size <= size at which text fits maxW
  function fitSize(g, text, fam, size, maxW) {
    const w = measure(g, text, size, fam);
    return w > maxW ? size * maxW / w : size;
  }
  // wrap a ' · ' separated line greedily into lines that fit maxW at size
  function wrapDots(g, text, fam, size, maxW, sep) {
    sep = sep || ' · ';
    const parts = String(text).split(sep);
    const out = [];
    let cur = '';
    g.font = NS.font(size, fam);
    for (const p of parts) {
      const cand = cur ? cur + sep + p : p;
      if (!cur || g.measureText(cand).width <= maxW) cur = cand;
      else { out.push(cur); cur = p; }
    }
    if (cur) out.push(cur);
    return out;
  }
  function wrapWords(g, text, fam, size, maxW) {
    const words = String(text).split(' ');
    const out = [];
    let cur = '';
    g.font = NS.font(size, fam);
    for (const w of words) {
      const cand = cur ? cur + ' ' + w : w;
      if (!cur || g.measureText(cand).width <= maxW) cur = cand;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  }
  const T = () => (window.SCORE && window.SCORE.texts) || {};

  // ------------------------------------------------------------------------------------------ caches
  // Every cache canvas is allocated with NS.makeCanvas(w, h, 'world'); LRU-evicted above a soft budget.
  const CACHE = new Map();
  let TICK = 0, BYTES = 0;
  const BUDGET = () => 72e6 * CS() * CS();
  function cached(key, w, h, build, fonts) {
    let e = CACHE.get(key);
    if (e && (!e.fonts || e.fok || !fontsOk())) { e.used = ++TICK; return e.c; }
    if (e) { BYTES -= e.bytes; NS.freeCanvas(e.c); CACHE.delete(key); }
    const c = NS.makeCanvas(max(1, w), max(1, h), 'world');
    const g = c.getContext('2d');
    const prevPal = PAL;
    try { build(g, c); } finally { PAL = prevPal; g.shadowBlur = 0; g.shadowColor = 'rgba(0,0,0,0)'; }
    e = { c, fonts: !!fonts, fok: fonts ? fontsOk() : true, used: ++TICK, bytes: c.width * c.height * 4, meta: c.meta };
    CACHE.set(key, e);
    BYTES += e.bytes;
    if (BYTES > BUDGET()) evict(key);
    return c;
  }
  function evict(keep) {
    const list = [...CACHE.entries()].filter(([k]) => k !== keep).sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of list) {
      if (BYTES <= BUDGET() * 0.8) break;
      if (TICK - e.used < 40) continue;   // used very recently (this frame): keep
      BYTES -= e.bytes; NS.freeCanvas(e.c); CACHE.delete(k);
    }
  }
  function release(prefix) {
    for (const [k, e] of [...CACHE.entries()]) {
      if (!prefix || k.startsWith(prefix)) { BYTES -= e.bytes; NS.freeCanvas(e.c); CACHE.delete(k); }
    }
  }
  // scratch canvases (reused, frame-sized or smaller)
  const SCR = {};
  function scratch(name, w, h) {
    let s = SCR[name];
    w = max(1, round(w)); h = max(1, round(h));
    if (!s || s.width !== w || s.height !== h) {
      if (s) NS.freeCanvas(s);
      s = SCR[name] = NS.makeCanvas(w, h, 'world');
    }
    return s;
  }

  // ------------------------------------------------------------------------------------------ noise
  const PERM = new Uint8Array(512);
  (function () { const r = NS.rng(9137); const p = []; for (let i = 0; i < 256; i++) p.push(i); for (let i = 255; i > 0; i--) { const j = floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; })();
  function vn2(x, y) {
    const xi = floor(x), yi = floor(y), xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = PERM[PERM[X] + Y], b = PERM[PERM[X + 1] + Y], c = PERM[PERM[X] + Y + 1], d = PERM[PERM[X + 1] + Y + 1];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (lerp(lerp(a, b, u), lerp(c, d, u), v)) / 255;   // 0..1
  }
  function fbm2(x, y, oct) { let v = 0, a = 0.5, n = 0; for (let o = 0; o < (oct || 4); o++) { v += a * vn2(x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 - 9.7; a *= 0.5; } return v / n; }
  // periodic in x with period px (for tileable textures)
  function vn2p(x, y, px) {
    const xi = floor(x), yi = floor(y), xf = x - xi, yf = y - yi;
    const X0 = ((xi % px) + px) % px, X1 = (X0 + 1) % px, Y = yi & 255;
    const a = PERM[PERM[X0 & 255] + Y], b = PERM[PERM[X1 & 255] + Y], c = PERM[PERM[X0 & 255] + Y + 1], d = PERM[PERM[X1 & 255] + Y + 1];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return (lerp(lerp(a, b, u), lerp(c, d, u), v)) / 255;
  }
  function fbm2p(x, y, px, oct) { let v = 0, a = 0.5, n = 0, f = 1; for (let o = 0; o < (oct || 4); o++) { v += a * vn2p(x * f, y * f + o * 13.7, px * f); n += a; f *= 2; a *= 0.5; } return v / n; }

  // ------------------------------------------------------------------------------------------ sprites
  // glow sprite: radial gradient, 128 px. kinds: soft | hot (white core) | flat (solid core, soft edge) | ring
  function glowSpr(color, kind) {
    kind = kind || 'soft';
    return cached('spr:glow:' + kind + ':' + color, 128, 128, (g) => {
      const cc = rgb(color), n = 64;
      const grd = g.createRadialGradient(n, n, 0, n, n, n);
      const st = (o, col, a) => grd.addColorStop(o, css(col, a));
      if (kind === 'hot') { st(0, mix(cc, [255, 255, 255], 0.85), 1); st(0.08, mix(cc, [255, 255, 255], 0.45), 0.9); st(0.25, cc, 0.42); st(0.55, cc, 0.1); st(1, cc, 0); }
      else if (kind === 'flat') { st(0, cc, 1); st(0.45, cc, 0.95); st(0.75, cc, 0.45); st(1, cc, 0); }
      else if (kind === 'ring') { st(0, cc, 0); st(0.55, cc, 0); st(0.78, cc, 0.9); st(0.9, cc, 0.3); st(1, cc, 0); }
      else { st(0, cc, 0.95); st(0.12, cc, 0.6); st(0.3, cc, 0.26); st(0.6, cc, 0.07); st(1, cc, 0); }
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    });
  }
  function drawGlow(ctx, x, y, r, color, a, kind) {
    if (a <= 0.003 || r <= 0) return;
    const s = glowSpr(color, kind);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * min(1, a);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
  }
  // cone sprite: apex at the left middle, opening to the full height at the right edge (256 x 128).
  // kind 'beam' (volumetric, fades with distance) | 'cut' (a flashlight pool for darkness cut-outs)
  function coneSpr(color, kind) {
    kind = kind || 'beam';
    return cached('spr:cone:' + kind + ':' + color, 256, 128, (g) => {
      const cw = 256, ch = 128, img = g.createImageData(cw, ch), d = img.data, cc = rgb(color);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const a = (x + 0.5) / cw, b = abs((y + 0.5) - ch / 2) / (ch / 2) / max(a, 0.004);
          let al;
          if (kind === 'cut') {
            const edge = 1 - sstep(0.62, 1.0, b);
            al = edge * (1 - pow(a, 3.2)) * sstep(0, 0.04, a);
          } else {
            const edge = 1 - sstep(0.35, 1.0, b);
            al = edge * pow(1 - a, 1.35) * (0.55 + 0.45 * pow(1 - min(1, b), 2)) * sstep(0, 0.02, a);
          }
          const i = (y * cw + x) * 4;
          d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2]; d[i + 3] = clamp(al) * 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
  }
  // draw a cone sprite from (x, y) along angle, half-angle spread (radians), length len
  function drawCone(ctx, spr, x, y, ang, spread, len, a) {
    if (a <= 0.003 || len <= 0) return;
    const hw = len * tan(min(1.35, max(0.01, spread)));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.globalAlpha *= min(1, a);
    ctx.drawImage(spr, 0, -hw, len, hw * 2);
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------------ paths
  // a wobbly polyline/polygon helper: jitter points along segments (deterministic)
  function roughPoly(g, pts, amp, seed, step, close) {
    step = step || 18;
    const r = NS.rng(seed || 1);
    g.moveTo(pts[0][0], pts[0][1]);
    const n = close ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = hypot(b[0] - a[0], b[1] - a[1]), m = max(1, floor(L / step));
      const nx = -(b[1] - a[1]) / (L || 1), ny = (b[0] - a[0]) / (L || 1);
      for (let j = 1; j <= m; j++) {
        const k = j / m, o = j === m ? 0 : (r() - 0.5) * 2 * amp;
        g.lineTo(lerp(a[0], b[0], k) + nx * o, lerp(a[1], b[1], k) + ny * o);
      }
    }
    if (close) g.closePath();
  }
  // a torn/ragged rectangle path (paper): amp = edge roughness, tear = 0..1 (bites, a torn corner)
  function raggedRect(g, w, h, seed, amp, tear) {
    const r = NS.rng(seed || 3);
    const pts = [];
    const edge = (x0, y0, x1, y1, nx, ny, side) => {
      const L = hypot(x1 - x0, y1 - y0), m = max(2, floor(L / 9));
      for (let j = 0; j < m; j++) {
        const k = j / m;
        let o = (r() - 0.5) * amp + (r() < 0.08 ? -r() * amp * 2 : 0);
        if (tear > 0) {
          const bite = bump(0.0, 0.08, 0.16, 0.26, fract(k * (1.3 + side * 0.37) + side * 0.21 + seed * 0.13));
          o -= bite * tear * (6 + 14 * hash(side + j * 0.01, seed)) * (side === 2 ? 1.6 : 1);
        }
        pts.push([lerp(x0, x1, k) + nx * o, lerp(y0, y1, k) + ny * o]);
      }
    };
    const cut = tear > 0.35 ? min(w, h) * (0.12 + 0.22 * tear) : 0;   // a torn-off corner (bottom right)
    edge(0, 0, w, 0, 0, -1, 0);
    edge(w, 0, w, h - cut, 1, 0, 1);
    if (cut) { const m = 7; for (let j = 0; j < m; j++) { const k = j / m; pts.push([w - cut * k + (r() - 0.5) * 5, h - cut + cut * k + (r() - 0.5) * 5]); } }
    edge(w - cut, h, 0, h, 0, 1, 2);
    edge(0, h, 0, 0, -1, 0, 3);
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    return cut;
  }
  function roundRect(g, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  // a five-pointed star path
  function starPath(g, x, y, r, rIn, rot, n) {
    n = n || 5; rIn = rIn || r * 0.45; rot = rot || -PI / 2;
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * PI / n, rr = i % 2 ? rIn : r;
      if (i) g.lineTo(x + cos(a) * rr, y + sin(a) * rr); else g.moveTo(x + cos(a) * rr, y + sin(a) * rr);
    }
    g.closePath();
  }
  // paper texture: base fill + fibres + speckle + edge darkening, inside the current path/clip
  function paperFill(g, w, h, base, seed, o) {
    o = o || {};
    const r = NS.rng(seed || 5);
    g.fillStyle = css(base); g.fillRect(-20, -20, w + 40, h + 40);
    // blotchy tone
    const n = floor(w * h / 2600) + 8;
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rr = 20 + r() * 70;
      const grd = g.createRadialGradient(x, y, 0, x, y, rr);
      const dark = r() < 0.55;
      grd.addColorStop(0, css(dark ? shade(base, -0.25) : shade(base, 0.2), 0.12 * (o.blotch == null ? 1 : o.blotch)));
      grd.addColorStop(1, css(base, 0));
      g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // speckle
    const sp = floor(w * h / 90);
    for (let i = 0; i < sp; i++) {
      g.fillStyle = css(r() < 0.6 ? shade(base, -0.35) : shade(base, 0.3), 0.08 + r() * 0.12);
      g.fillRect(r() * w, r() * h, 1 + r() * 1.2, 1 + r() * 1.2);
    }
    // fibres
    g.lineWidth = 0.6;
    for (let i = 0; i < floor(w * h / 1400); i++) {
      const x = r() * w, y = r() * h, a = r() * TAU, L = 3 + r() * 9;
      g.strokeStyle = css(shade(base, -0.3), 0.08);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + cos(a) * L, y + sin(a) * L); g.stroke();
    }
    // edge darkening (aged)
    const age = o.age == null ? 0.5 : o.age;
    if (age > 0) {
      const e = min(w, h) * 0.22;
      const sides = [[0, 0, w, e, 0, 0, 0, e], [0, h - e, w, e, 0, h, 0, h - e], [0, 0, e, h, 0, 0, e, 0], [w - e, 0, e, h, w, 0, w - e, 0]];
      for (const sd of sides) {
        const grd = g.createLinearGradient(sd[4], sd[5], sd[6], sd[7]);
        grd.addColorStop(0, css(shade(base, -0.45), 0.35 * age)); grd.addColorStop(1, css(base, 0));
        g.fillStyle = grd; g.fillRect(sd[0], sd[1], sd[2], sd[3]);
      }
    }
  }
  // creases: light/dark line pairs
  function creases(g, w, h, seed, n, a) {
    const r = NS.rng(seed || 8);
    for (let i = 0; i < n; i++) {
      const vert = r() < 0.5;
      const p = (0.25 + r() * 0.5) * (vert ? w : h);
      const j = (r() - 0.5) * 12;
      g.lineWidth = 1.2;
      g.strokeStyle = `rgba(0,0,0,${0.16 * a})`;
      g.beginPath();
      if (vert) { g.moveTo(p, -5); g.lineTo(p + j, h + 5); } else { g.moveTo(-5, p); g.lineTo(w + 5, p + j); }
      g.stroke();
      g.strokeStyle = `rgba(255,255,255,${0.22 * a})`;
      g.beginPath();
      if (vert) { g.moveTo(p + 1.4, -5); g.lineTo(p + j + 1.4, h + 5); } else { g.moveTo(-5, p + 1.4); g.lineTo(w + 5, p + j + 1.4); }
      g.stroke();
    }
  }
  // water stains: brownish tide-mark rings
  function stains(g, w, h, seed, n, a) {
    const r = NS.rng(seed || 9);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = h * (0.3 + r() * 0.8), rr = 30 + r() * min(w, h) * 0.35;
      for (let j = 0; j < 4; j++) {
        const ox = (r() - 0.5) * rr * 0.5, oy = (r() - 0.5) * rr * 0.4, r2 = rr * (0.5 + r() * 0.5);
        const grd = g.createRadialGradient(x + ox, y + oy, r2 * 0.5, x + ox, y + oy, r2);
        grd.addColorStop(0, `rgba(120,85,40,${0.03 * a})`);
        grd.addColorStop(0.85, `rgba(110,70,30,${0.07 * a})`);
        grd.addColorStop(0.95, `rgba(90,55,20,${0.1 * a})`);
        grd.addColorStop(1, 'rgba(90,55,20,0)');
        g.fillStyle = grd; g.beginPath(); g.ellipse(x + ox, y + oy, r2, r2 * (0.7 + r() * 0.4), r() * 3, 0, TAU); g.fill();
      }
    }
  }
  // drip runs from y downward (grime / paint)
  function drips(g, x0, x1, y, n, len, color, a, seed, wid) {
    const r = NS.rng(seed || 11);
    for (let i = 0; i < n; i++) {
      const x = lerp(x0, x1, r()), L = len * (0.3 + r() * 0.9), w = (wid || 2) * (0.6 + r() * 0.8);
      const grd = g.createLinearGradient(x, y, x, y + L);
      grd.addColorStop(0, css(color, a)); grd.addColorStop(0.8, css(color, a * 0.6)); grd.addColorStop(1, css(color, 0));
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y); g.lineTo(x + w * 0.35, y + L); g.arc(x, y + L, w * 0.42, 0, PI); g.closePath(); g.fill();
    }
  }

  // ================================================================================================ camera
  function camOf(c) {
    c = c || {};
    return { x: c.x == null ? W / 2 : c.x, y: c.y == null ? H / 2 : c.y, zoom: c.zoom == null ? 1 : c.zoom, rot: c.rot || 0 };
  }
  // kit.cam(ctx, {x, y, zoom, rot}, fn): the world point (x, y) lands on the frame centre, scaled by zoom
  function cam(ctx, c, fn) {
    const q = camOf(c);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    if (q.rot) ctx.rotate(q.rot);
    ctx.scale(q.zoom, q.zoom);
    ctx.translate(-q.x, -q.y);
    try { fn(ctx); } finally { ctx.restore(); }
  }
  // world -> frame point under a camera, and back
  function camPoint(c, x, y) {
    const q = camOf(c), dx = (x - q.x) * q.zoom, dy = (y - q.y) * q.zoom, cr = cos(q.rot), sr = sin(q.rot);
    return [W / 2 + dx * cr - dy * sr, H / 2 + dx * sr + dy * cr];
  }
  function camInv(c, sx, sy) {
    const q = camOf(c), dx = sx - W / 2, dy = sy - H / 2, cr = cos(-q.rot), sr = sin(-q.rot);
    return [q.x + (dx * cr - dy * sr) / q.zoom, q.y + (dx * sr + dy * cr) / q.zoom];
  }
  // the camera as seen by a layer at depth d (0 = infinitely far: does not move, 1 = moves with the camera)
  function parallaxCam(c, d) {
    const q = camOf(c);
    return { x: W / 2 + (q.x - W / 2) * d, y: H / 2 + (q.y - H / 2) * d, zoom: 1 + (q.zoom - 1) * d, rot: q.rot * d };
  }
  function parallax(ctx, c, d, fn) { cam(ctx, parallaxCam(c, d), fn); }
  // deterministic hand-held drift: returns {x, y, rot} offsets (add to a camera); amp in units
  function handheld(S, amp, seed, rate) {
    const t = tOf(S), r = rate || 0.35, a = amp == null ? 6 : amp, s = seed || 1;
    return {
      x: (noise1(t * r, s) * 0.7 + noise1(t * r * 2.3, s + 1) * 0.3) * a,
      y: (noise1(t * r * 0.9, s + 2) * 0.7 + noise1(t * r * 2.1, s + 3) * 0.3) * a * 0.7,
      rot: noise1(t * r * 0.6, s + 4) * a * 0.0012,
    };
  }

  // ================================================================================================ sky
  function moonSpr() {
    return cached('sky:moon', 256, 256, (g) => {
      const n = 128, R = 120;
      g.save();
      g.beginPath(); g.arc(n, n, R, 0, TAU); g.clip();
      const grd = g.createRadialGradient(n - 30, n - 34, 10, n, n, R);
      grd.addColorStop(0, '#f6f8ff'); grd.addColorStop(0.65, '#dfe6f7'); grd.addColorStop(1, '#9fb0d4');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      const r = NS.rng(77);
      // maria
      for (let i = 0; i < 9; i++) {
        const x = n + (r() - 0.45) * R * 1.3, y = n + (r() - 0.55) * R * 1.2, rr = 18 + r() * 38;
        const m = g.createRadialGradient(x, y, 0, x, y, rr);
        m.addColorStop(0, 'rgba(120,135,170,0.42)'); m.addColorStop(0.7, 'rgba(130,145,180,0.25)'); m.addColorStop(1, 'rgba(130,145,180,0)');
        g.fillStyle = m; g.beginPath(); g.ellipse(x, y, rr, rr * (0.7 + r() * 0.5), r() * 3, 0, TAU); g.fill();
      }
      // craters
      for (let i = 0; i < 26; i++) {
        const x = n + (r() - 0.5) * R * 1.8, y = n + (r() - 0.5) * R * 1.8, rr = 2 + pow(r(), 2) * 12;
        g.fillStyle = 'rgba(110,120,150,0.35)'; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(x + 0.8, y + 0.8, rr, PI * 0.1, PI * 0.9); g.stroke();
      }
      // limb darkening
      const lg = g.createRadialGradient(n, n, R * 0.6, n, n, R);
      lg.addColorStop(0, 'rgba(40,50,90,0)'); lg.addColorStop(1, 'rgba(40,50,90,0.45)');
      g.fillStyle = lg; g.fillRect(0, 0, 256, 256);
      g.restore();
    });
  }
  // cloud band texture (tileable in x): 1024 x 200 px drawn at 2048 x 400 units
  function cloudTex(layer, top, bottom, lit) {
    const key = 'sky:cloud:' + layer + ':' + top + ':' + bottom + ':' + (lit ? 1 : 0);
    return cached(key, 1024, 200, (g) => {
      const r = NS.rng(layer ? 4411 : 2207);
      const mid = mix(top, bottom, 0.45);
      const body = lit ? [150, 165, 235] : shade(mid, layer ? -0.05 : 0.04);
      const rim = lit ? [235, 240, 255] : mix(shade(mid, 0.22), [150, 170, 220], 0.35);
      const n = layer ? 70 : 95;
      const blob = (x, y, rr, a, col, sq) => {
        for (const ox of [0, -1024, 1024]) {
          if (x + ox + rr < 0 || x + ox - rr > 1024) continue;
          const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, rr);
          grd.addColorStop(0, css(col, a)); grd.addColorStop(0.6, css(col, a * 0.8)); grd.addColorStop(1, css(col, 0));
          g.fillStyle = grd; g.beginPath(); g.ellipse(x + ox, y, rr, rr * sq, 0, 0, TAU); g.fill();
        }
      };
      const bl = [];
      for (let i = 0; i < n; i++) {
        const x = r() * 1024, band = layer ? 0.4 : 0.55;
        const y = 200 * (band + (r() + r() + r() - 1.5) * 0.2);
        const rr = (layer ? 26 : 18) + pow(r(), 1.6) * (layer ? 85 : 60);
        bl.push([x, y, rr, 0.5 + r() * 0.5, 0.42 + r() * 0.2]);
      }
      bl.sort((a, b) => a[1] - b[1]);
      for (const b of bl) {
        blob(b[0], b[1] - b[2] * (0.1 + 0.1 * b[3]), b[2], (lit ? 0.3 : 0.38) * b[3], rim, b[4]);    // moonlit top edge
        blob(b[0], b[1] + b[2] * 0.06, b[2] * 0.96, (lit ? 0.3 : 0.8) * b[3], body, b[4]);
      }
      g.globalCompositeOperation = 'source-atop';
      const lg = g.createLinearGradient(0, 0, 0, 200);
      if (lit) { lg.addColorStop(0, 'rgba(255,255,255,0.3)'); lg.addColorStop(1, 'rgba(120,140,255,0.15)'); }
      else { lg.addColorStop(0, 'rgba(150,170,220,0.12)'); lg.addColorStop(0.5, 'rgba(40,50,80,0.05)'); lg.addColorStop(0.85, 'rgba(120,70,60,0.16)'); lg.addColorStop(1, 'rgba(170,90,60,0.28)'); }
      g.fillStyle = lg; g.fillRect(0, 0, 1024, 200);
      g.globalCompositeOperation = 'source-over';
    });
  }
  function tileX(ctx, img, off, y, tw, th, x0, x1) {
    let x = x0 + (((off % tw) + tw) % tw) - tw;
    for (; x < x1; x += tw) ctx.drawImage(img, x, y, tw, th);
  }
  // kit.sky(ctx, S, {top, bottom, moon: {x, y, r, k}, clouds, lightning, lightningX, stars, glow, glowColor, scroll, wind, x, y, w, h})
  function sky(ctx, S, o) {
    o = o || {};
    const x = o.x || 0, y = o.y || 0, w = o.w || W, h = o.h || H;
    const t = tOf(S), K = fk(S);
    const top = o.top || C.night0, bottom = o.bottom || C.night2;
    ctx.save();
    const grd = ctx.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, css(top)); grd.addColorStop(0.6, css(mix(top, bottom, 0.6))); grd.addColorStop(1, css(bottom));
    ctx.fillStyle = grd; ctx.fillRect(x, y, w, h);
    const gl = o.glow == null ? 0.5 : o.glow;
    if (gl > 0) {
      const g2 = ctx.createLinearGradient(0, y + h, 0, y + h * 0.35);
      const gc = o.glowColor || '#5a3a46';
      g2.addColorStop(0, css(gc, 0.55 * gl)); g2.addColorStop(0.5, css(gc, 0.18 * gl)); g2.addColorStop(1, css(gc, 0));
      ctx.fillStyle = g2; ctx.fillRect(x, y + h * 0.35, w, h * 0.65);
    }
    const st = o.stars == null ? 0.35 : o.stars;
    if (st > 0) {
      const n = floor(110 * st);
      for (let i = 0; i < n; i++) {
        const sx = x + hash(i, 51) * w, sy = y + pow(hash(i, 52), 1.7) * h * 0.62;
        const tw = 0.6 + 0.4 * noise1(t * 1.3 + i * 3.1, 3);
        ctx.fillStyle = css('#dfe8ff', st * (0.2 + 0.7 * pow(hash(i, 53), 3)) * tw);
        const s = hash(i, 54) < 0.12 ? 2 : 1.2;
        ctx.fillRect(sx, sy, s, s);
      }
    }
    const ck = o.clouds == null ? 0.7 : o.clouds;
    const scroll = o.scroll || 0, wind = o.wind == null ? 6 : o.wind;
    const lk = clamp(o.lightning || 0) * K;
    // far clouds (behind the moon)
    if (ck > 0) {
      ctx.globalAlpha = ck * 0.85;
      tileX(ctx, cloudTex(0, top, bottom, false), -(scroll * 0.08 + t * wind * 0.5), y + h * 0.02, 2048, 400 * (h / H), x, x + w);
      ctx.globalAlpha = 1;
    }
    if (o.moon) {
      const m = o.moon, mr = m.r || 38, mk = m.k == null ? 1 : m.k;
      const mx = m.x == null ? x + w * 0.78 : m.x, my = m.y == null ? y + h * 0.2 : m.y;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, mx, my, mr * 9, '#6f84c0', 0.35 * mk);
      drawGlow(ctx, mx, my, mr * 2.6, '#c8d6ff', 0.45 * mk);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = mk;
      ctx.drawImage(moonSpr(), mx - mr * 1.067, my - mr * 1.067, mr * 2.133, mr * 2.133);
      ctx.globalAlpha = 1;
    }
    if (lk > 0.003) {
      const lx = o.lightningX == null ? x + w * 0.68 : o.lightningX;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, lx, y + h * 0.22, w * 0.55, '#6d82c8', lk * 0.55);
      drawGlow(ctx, lx, y + h * 0.18, w * 0.22, '#c9d5ff', lk * 0.45);
      ctx.globalCompositeOperation = 'source-over';
    }
    // near clouds (cross the moon)
    if (ck > 0) {
      const off = -(scroll * 0.16 + t * wind);
      ctx.globalAlpha = ck;
      tileX(ctx, cloudTex(1, top, bottom, false), off, y - h * 0.06, 2048, 400 * (h / H), x, x + w);
      ctx.globalAlpha = 1;
      if (lk > 0.003) {
        // light the clouds from inside around the strike: lit layers masked by a radial falloff
        const lx = o.lightningX == null ? x + w * 0.68 : o.lightningX;
        const sw = 640, sh = 360, sx = sw / w, sy = sh / h;
        const sc = scratch('skyLit', sw, sh), g = sc.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, sw, sh);
        g.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
        tileX(g, cloudTex(1, top, bottom, true), off, y - h * 0.06, 2048, 400 * (h / H), x, x + w);
        g.globalAlpha = 0.7;
        tileX(g, cloudTex(0, top, bottom, true), -(scroll * 0.08 + t * wind * 0.5), y + h * 0.02, 2048, 400 * (h / H), x, x + w);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'destination-in';
        const rg = g.createRadialGradient(lx, y + h * 0.15, 0, lx, y + h * 0.15, w * 0.5);
        rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.35, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0.06)');
        g.fillStyle = rg; g.fillRect(x, y, w, h);
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = lk;
        ctx.drawImage(sc, x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }
  // kit.lightningK(S, {type: 'thunder', dur}) -> 0..1 envelope after the latest hit of that type (a strike + one
  // re-strike; with Reduce flashing a single soft swell). Not yet multiplied by flashK (kit.sky does that).
  function lightningK(S, o) {
    o = o || {};
    if (!S || !S.hit) return 0;
    const a = S.hit(o.type || 'thunder');
    if (!(a >= 0) || a > (o.dur || 0.9)) return 0;
    if (S.reduced) return sstep(0, 0.12, a) * (1 - sstep(0.15, 0.85, a));
    const s1 = a < 0.02 ? a / 0.02 : exp(-(a - 0.02) / 0.06);
    const s2 = a > 0.16 ? 0.7 * (a < 0.18 ? (a - 0.16) / 0.02 : exp(-(a - 0.18) / 0.14)) : 0;
    return clamp(max(s1, s2));
  }

  // ================================================================================================ skyline
  function skylineStrip(seed, dq, color, fog) {
    const sc = lerp(0.5, 1.25, dq), SW = 2048, SH = round(560 * sc), R = CS();
    const key = 'sky:line:' + seed + ':' + dq + ':' + color + ':' + fog;
    let meta = null;
    const body = cached(key, SW * R, SH * R, (g, cv) => {
      g.scale(R, R);
      const r = NS.rng(seed * 31 + round(dq * 8) * 7 + 1);
      const ants = [], flick = [], wins = [];
      const moon = '#9fb4e8';
      let x = -20;
      const items = [];
      while (x < SW) {
        const bw = (70 + r() * 170) * sc;
        let bh = (80 + pow(r(), 1.35) * 300) * sc;
        if (r() < 0.12) bh *= 1.45;
        bh = min(bh, SH - 70 * sc);
        const types = ['flat', 'flat', 'setback', 'gable', 'tank', 'billboard', 'dome', 'flat'];
        items.push({ x, bw, bh, type: NS.pick(types, r()), tone: (r() - 0.5) * 0.14, r1: r(), r2: r(), r3: r() });
        x += bw + (r() < 0.25 ? r() * 24 * sc : -r() * 8 * sc);
      }
      for (const b of items) {
        for (const ox of b.x + b.bw > SW ? [0, -SW] : [0]) {
          const bx = b.x + ox, top = SH - b.bh, bw = b.bw;
          const col = shade(color, b.tone);
          g.fillStyle = css(col);
          g.beginPath();
          if (b.type === 'setback') {
            const t1 = top + b.bh * 0.28, t2 = top + b.bh * 0.12;
            g.rect(bx, t1, bw, SH - t1);
            g.rect(bx + bw * 0.14, t2, bw * 0.72, t1 - t2 + 1);
            g.rect(bx + bw * 0.3, top, bw * 0.4, t2 - top + 1);
            if (b.r1 < 0.5) { g.moveTo(bx + bw * 0.46, top); g.lineTo(bx + bw * 0.5, top - 60 * sc); g.lineTo(bx + bw * 0.54, top); }
          } else if (b.type === 'gable') {
            g.rect(bx, top, bw, SH - top);
            g.moveTo(bx - 3 * sc, top); g.lineTo(bx + bw / 2, top - bw * 0.32); g.lineTo(bx + bw + 3 * sc, top);
          } else if (b.type === 'dome') {
            g.rect(bx, top, bw, SH - top);
            g.moveTo(bx + bw * 0.2, top); g.arc(bx + bw / 2, top, bw * 0.3, PI, 0);
          } else {
            g.rect(bx, top, bw, SH - top);
            g.rect(bx - 3 * sc, top - 5 * sc, bw + 6 * sc, 6 * sc);   // parapet
          }
          g.fill();
          // rooftop furniture
          g.strokeStyle = css(col); g.lineWidth = 2 * sc;
          if (b.type === 'tank') {
            const tx = bx + bw * (0.25 + b.r2 * 0.4), tw = 26 * sc, th = 30 * sc, ty = top - 5 * sc - 16 * sc;
            g.beginPath();
            g.moveTo(tx + 3 * sc, top - 5 * sc); g.lineTo(tx + 5 * sc, ty); g.moveTo(tx + tw - 3 * sc, top - 5 * sc); g.lineTo(tx + tw - 5 * sc, ty);
            g.moveTo(tx + 3 * sc, top - 5 * sc); g.lineTo(tx + tw - 5 * sc, ty); g.stroke();
            g.beginPath(); g.rect(tx, ty - th, tw, th);
            g.moveTo(tx - 2 * sc, ty - th); g.lineTo(tx + tw / 2, ty - th - 12 * sc); g.lineTo(tx + tw + 2 * sc, ty - th); g.fill();
            g.strokeStyle = css(shade(col, 0.15), 0.5); g.lineWidth = 1 * sc;
            g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(tx, ty - th * k / 4); g.lineTo(tx + tw, ty - th * k / 4); } g.stroke();
          } else if (b.type === 'billboard') {
            const bbx = bx + bw * 0.1, bbw = bw * 0.8, bbh = 40 * sc, bby = top - 5 * sc - 18 * sc - bbh;
            g.beginPath(); g.moveTo(bbx + bbw * 0.2, top); g.lineTo(bbx + bbw * 0.2, bby + bbh); g.moveTo(bbx + bbw * 0.8, top); g.lineTo(bbx + bbw * 0.8, bby + bbh); g.stroke();
            g.fillRect(bbx, bby, bbw, bbh);
            g.strokeStyle = css(shade(col, 0.12)); g.lineWidth = 1.2 * sc;
            g.beginPath(); for (let k = 0; k < 4; k++) { g.moveTo(bbx + bbw * k / 3, bby + bbh); g.lineTo(bbx + bbw * k / 3, top); } g.stroke();
          } else if (b.r3 < 0.45) {
            // AC boxes / stair hut
            g.fillRect(bx + bw * (0.1 + b.r2 * 0.5), top - 18 * sc, 22 * sc, 18 * sc);
            if (b.r1 < 0.3) g.fillRect(bx + bw * 0.7, top - 11 * sc, 14 * sc, 11 * sc);
          }
          if (b.r1 > 0.72 || (b.bh > 300 * sc && b.r1 > 0.4)) {
            const ax = bx + bw * (0.3 + b.r3 * 0.4), ah = (30 + b.r2 * 70) * sc, at = top - (b.type === 'setback' ? 0 : 5 * sc);
            g.strokeStyle = css(col); g.lineWidth = 1.6 * sc;
            g.beginPath(); g.moveTo(ax, at); g.lineTo(ax, at - ah); g.moveTo(ax - 6 * sc, at - ah * 0.6); g.lineTo(ax + 6 * sc, at - ah * 0.6); g.stroke();
            if (ox === 0) ants.push([ax, at - ah, b.r2]);
          }
          // rim light: moon from the upper left
          g.strokeStyle = css(mix(col, moon, 0.35), 0.75); g.lineWidth = 1.5 * sc;
          g.beginPath(); g.moveTo(bx, SH); g.lineTo(bx, top); g.lineTo(bx + bw * 0.6, top); g.stroke();
          // window grid (unlit, faint) + lit windows list
          const cw = (11 + b.r2 * 6) * sc, rh = (15 + b.r3 * 6) * sc, ww = cw * 0.5, wh = rh * 0.55;
          const y0 = top + (b.type === 'setback' ? b.bh * 0.3 : 12 * sc);
          g.fillStyle = css(shade(col, 0.05 + 0.05 * (1 - dq)), 0.55);
          for (let wy = y0; wy < SH - 10 * sc; wy += rh) {
            for (let wx = bx + 8 * sc; wx < bx + bw - 8 * sc - ww; wx += cw) {
              g.fillRect(wx, wy, ww, wh);
              const hv = hs(round(wx * 3.1), round(wy * 1.7) + seed);
              if (hv < 0.13 - dq * 0.05 && ox === 0) wins.push([wx, wy, ww, wh, hv / (0.13 - dq * 0.05) * 0.13]);
            }
          }
          // fire escapes on the near layers
          if (dq >= 0.6 && b.r1 < 0.5 && b.bh > 200 * sc) {
            const fx = bx + bw * 0.55, fw = bw * 0.35;
            g.strokeStyle = css(shade(col, -0.35)); g.lineWidth = 1.5 * sc;
            g.beginPath();
            for (let fy = top + 40 * sc, i = 0; fy < SH - 30 * sc; fy += 44 * sc, i++) {
              g.moveTo(fx, fy); g.lineTo(fx + fw, fy);
              g.moveTo(i % 2 ? fx : fx + fw, fy); g.lineTo(i % 2 ? fx + fw : fx, fy + 44 * sc);
              for (let k = 0; k <= 6; k++) { g.moveTo(fx + fw * k / 6, fy); g.lineTo(fx + fw * k / 6, fy - 8 * sc); }
              g.moveTo(fx, fy - 8 * sc); g.lineTo(fx + fw, fy - 8 * sc);
            }
            g.stroke();
          }
        }
      }
      // depth haze toward the base
      g.globalCompositeOperation = 'source-atop';
      const hz = g.createLinearGradient(0, 0, 0, SH);
      hz.addColorStop(0, css(fog, 0.05)); hz.addColorStop(0.6, css(fog, 0.25 * (1 - dq * 0.5))); hz.addColorStop(1, css(fog, 0.75 * (1 - dq * 0.4)));
      g.fillStyle = hz; g.fillRect(0, 0, SW, SH);
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 6 && wins.length; i++) flick.push(wins[floor(r() * wins.length)]);
      cv.meta = { ants, flick, wins };
    });
    const e = CACHE.get(key);
    meta = (e && e.c.meta) || { ants: [], flick: [], wins: [] };
    const win = cached(key + ':win', SW * R, SH * R, (g) => {
      g.scale(R, R);
      for (const w of meta.wins) {
        const warm = w[4] < 0.1;
        const c = warm ? (w[4] < 0.05 ? '#ffcf7a' : '#ff9a3c') : '#a9c8ff';
        g.fillStyle = css(c, 0.12); g.fillRect(w[0] - w[2] * 0.5, w[1] - w[3] * 0.35, w[2] * 2, w[3] * 1.7);
        g.fillStyle = css(c, 0.55 + 0.35 * hash(w[0] + w[1], 8));
        const blind = hash(w[0], 3) < 0.4 ? w[3] * (0.3 + hash(w[1], 4) * 0.4) : 0;
        g.fillRect(w[0], w[1] + blind, w[2], w[3] - blind);
      }
    });
    return { body, win, meta, SW, SH, sc };
  }
  // kit.skyline(ctx, S, {seed, y, depth, color, fogColor, windows, scroll, height, x0, x1, sign: {x, k}})
  function skyline(ctx, S, o) {
    o = o || {};
    const dq = round(clamp(o.depth == null ? 0.5 : o.depth) * 4) / 4;
    const seed = o.seed == null ? 1 : o.seed;
    const color = o.color || css(mix(mix(C.night2, C.fog, 0.35), C.night0, 0.15 + dq * 0.72));
    const fog = o.fogColor || C.fog;
    const st = skylineStrip(seed, dq, color, fog);
    const hk = o.height || 1, y = o.y == null ? H * 0.72 : o.y;
    const SW = st.SW, SH = st.SH * hk, wk = o.windows == null ? 0.6 : o.windows;
    const x0 = o.x0 == null ? 0 : o.x0, x1 = o.x1 == null ? W : o.x1, scroll = o.scroll || 0;
    const t = tOf(S);
    ctx.save();
    // body + lit windows pre-composited per window level (one blit per tile)
    const wq = round(clamp(wk) * 4) / 4;
    const combo = wq <= 0 ? st.body : cached('sky:line:combo:' + seed + ':' + dq + ':' + color + ':' + fog + ':' + wq, st.body.width, st.body.height, (g) => {
      g.drawImage(st.body, 0, 0); g.globalAlpha = wq; g.drawImage(st.win, 0, 0); g.globalAlpha = 1;
    });
    tileX(ctx, combo, -scroll, y - SH, SW, SH, x0, x1);
    // live details: blinking aviation lights, a few flickering windows
    const off = (((-scroll) % SW) + SW) % SW - SW;
    ctx.globalCompositeOperation = 'lighter';
    for (let base = x0 + off; base < x1; base += SW) {
      for (const a of st.meta.ants) {
        const on = fract(t * 0.5 + a[2]) < 0.5;
        if (!on) continue;
        const ax = base + a[0], ay = y - SH + a[1] * hk;
        if (ax < x0 - 20 || ax > x1 + 20) continue;
        drawGlow(ctx, ax, ay, 9 * st.sc + 4, '#ff3030', 0.9);
      }
      if (wk > 0) {
        for (let i = 0; i < st.meta.flick.length; i++) {
          const w = st.meta.flick[i], fx = base + w[0];
          if (fx < x0 - 20 || fx > x1 + 20) continue;
          const tv = 0.5 + 0.5 * noise1(t * 7 + i * 13, 9);
          ctx.fillStyle = css(i % 2 ? '#7fb0ff' : '#ffd9a0', 0.5 * wk * tv);
          ctx.fillRect(fx, y - SH + w[1] * hk, w[2], w[3] * hk);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (o.sign) neonBlade(ctx, S, o.sign.x - scroll, y - (o.sign.h || 0.55) * SH, st.sc * (o.sign.s || 1), o.sign.k == null ? 1 : o.sign.k, o.sign);
    ctx.restore();
  }
  // a vertical ORPHEUM blade sign (dead letters), base at (x, y) on a rooftop; s scale (1 = 150 units tall)
  function neonBlade(ctx, S, x, y, s, k, o) {
    o = o || {};
    const t = tOf(S), word = o.text || 'ORPHEUM', dead = o.dead || [2, 5];
    const bw = 30 * s, bh = 150 * s, top = y - bh;
    ctx.save();
    ctx.fillStyle = '#0a0d16'; ctx.fillRect(x - bw / 2, top, bw, bh);
    ctx.fillRect(x - 2 * s, y, 4 * s, 22 * s);
    ctx.strokeStyle = css('#3a2230'); ctx.lineWidth = 1.5 * s; ctx.strokeRect(x - bw / 2, top, bw, bh);
    const lh = bh / word.length;
    ctx.font = NS.font(lh * 0.86, F.title); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < word.length; i++) {
      const isDead = dead.indexOf(i) >= 0;
      const buzz = isDead ? (hash(floor(t * 9), i + 3) < 0.04 ? 0.5 : 0) : (0.85 + 0.15 * noise1(t * 11 + i, 5));
      const ly = top + lh * (i + 0.5);
      if (buzz > 0.05) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, x, ly, lh * 1.3, '#ff2b55', 0.5 * k * buzz);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = css(mix('#ff4d6d', '#ffe0e8', 0.35), k * buzz);
      } else ctx.fillStyle = 'rgba(70,30,40,0.9)';
      ctx.fillText(word[i], x, ly + lh * 0.04);
    }
    ctx.restore();
  }

  // ================================================================================================ rain
  // kit.rain(ctx, S, {density, angle, speed, color, k, len, splashes: groundY | {y0, y1}, glints: [{x, y, r, color, k}],
  //   x, y, w, h, seed, layers: [0, 1, 2] (far/mid/near)})
  function rain(ctx, S, o) {
    o = o || {};
    const t = tOf(S), dens = o.density == null ? 0.6 : o.density, ang = o.angle == null ? 0.12 : o.angle;
    const sp = o.speed == null ? 1 : o.speed, col = o.color || '#9fb4d8', k = o.k == null ? 1 : o.k;
    const rx = o.x || 0, ry = o.y || 0, rw = o.w || W, rh = o.h || H, seed = o.seed || 7;
    const L = [
      { n: 300, len: 12, v: 760, w: 1, a: 0.2 },
      { n: 170, len: 22, v: 1080, w: 1.3, a: 0.32 },
      { n: 55, len: 46, v: 1600, w: 2.2, a: 0.42 },
    ];
    const layers = o.layers || [0, 1, 2];
    const ta = tan(ang), glints = o.glints || [];
    ctx.save();
    ctx.lineCap = 'round';
    for (const li of layers) {
      const l = L[li];
      const n = floor(l.n * dens), len = l.len * (o.len || 1), span = rh + len, slant = rh * abs(ta) + 40;
      const xs = [], ys = [];
      for (let i = 0; i < n; i++) {
        const ph = hash(i, seed + li * 17), x0 = hash(i, seed + li * 17 + 5) * (rw + slant) - (ta > 0 ? slant : 0);
        const vv = l.v * sp * (0.85 + 0.3 * hash(i, seed + li * 3 + 9));
        const yy = fract(ph + t * vv / span) * span - len;
        xs.push(rx + x0 + (yy + len) * ta); ys.push(ry + yy);
      }
      ctx.strokeStyle = css(col, l.a * k);
      ctx.lineWidth = l.w;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { ctx.moveTo(xs[i] - len * ta, ys[i]); ctx.lineTo(xs[i], ys[i] + len); }
      ctx.stroke();
      if (li > 0 && glints.length) {
        ctx.globalCompositeOperation = 'lighter';
        for (const gl of glints) {
          ctx.strokeStyle = css(gl.color || C.sodium, 0.55 * k * (gl.k == null ? 1 : gl.k));
          ctx.lineWidth = l.w * 1.1;
          ctx.beginPath();
          const r2 = gl.r * gl.r;
          for (let i = 0; i < n; i++) {
            const dx = xs[i] - gl.x, dy = ys[i] + len / 2 - gl.y;
            if (dx * dx + dy * dy < r2 * (hash(i, 3 + li) * 0.6 + 0.4)) { ctx.moveTo(xs[i] - len * ta, ys[i]); ctx.lineTo(xs[i], ys[i] + len); }
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // splashes
    if (o.splashes != null) {
      const g0 = typeof o.splashes === 'number' ? { y0: o.splashes, y1: o.splashes } : o.splashes;
      const n = floor(90 * dens);
      ctx.strokeStyle = css(mix(col, '#ffffff', 0.3), 0.5 * k);
      ctx.lineWidth = 1;
      ctx.beginPath();
      const drops = [];
      for (let i = 0; i < n; i++) {
        const per = 0.3 + hash(i, seed + 61) * 0.45, ph = hash(i, seed + 62);
        const cyc = floor(t / per + ph);
        const age = (t / per + ph - cyc) * per;
        if (age > 0.16) continue;
        const sx = rx + hash(i * 31 + cyc, seed + 63) * rw, d = hash(i * 17 + cyc, seed + 64);
        const sy = lerp(g0.y0, g0.y1, d), sc = 0.5 + d * 0.9;
        const q = age / 0.16, rr = (3 + 9 * q) * sc;
        ctx.moveTo(sx + rr, sy); ctx.ellipse(sx, sy, rr, rr * 0.28, 0, 0, TAU);
        if (q < 0.6) drops.push([sx, sy, sc, q]);
      }
      ctx.stroke();
      ctx.fillStyle = css(mix(col, '#ffffff', 0.4), 0.6 * k);
      for (const d of drops) {
        const hgt = sin(d[3] / 0.6 * PI) * 9 * d[2];
        ctx.fillRect(d[0] - 4 * d[2], d[1] - hgt, 1.4, 1.4); ctx.fillRect(d[0] + 3 * d[2], d[1] - hgt * 0.8, 1.4, 1.4); ctx.fillRect(d[0], d[1] - hgt * 1.2, 1.4, 1.6);
      }
    }
    ctx.restore();
  }

  // ================================================================================================ fog
  function fogTex(color, seed) {
    return cached('fog:' + color + ':' + seed, 512, 128, (g) => {
      const r = NS.rng(seed * 13 + 5), cc = rgb(color);
      for (let i = 0; i < 70; i++) {
        const x = r() * 512, y = 64 + (r() + r() - 1) * 34, rr = 18 + r() * 46;
        for (const ox of [0, -512, 512]) {
          if (x + ox + rr * 1.6 < 0 || x + ox - rr * 1.6 > 512) continue;
          const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, rr * 1.6);
          grd.addColorStop(0, css(cc, 0.22)); grd.addColorStop(0.5, css(cc, 0.1)); grd.addColorStop(1, css(cc, 0));
          g.fillStyle = grd; g.beginPath(); g.ellipse(x + ox, y, rr * 1.6, rr * 0.7, 0, 0, TAU); g.fill();
        }
      }
      g.globalCompositeOperation = 'destination-in';
      const v = g.createLinearGradient(0, 0, 0, 128);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.35, 'rgba(0,0,0,1)'); v.addColorStop(0.7, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = v; g.fillRect(0, 0, 512, 128);
    });
  }
  // kit.fog(ctx, S, {y, h, color, k, scroll, speed, seed, x0, x1})
  function fog(ctx, S, o) {
    o = o || {};
    const t = tOf(S), y = o.y == null ? H * 0.6 : o.y, h = o.h || 200, k = o.k == null ? 0.6 : o.k;
    const col = o.color || C.fog, sc = o.scroll || 0, spd = o.speed == null ? 14 : o.speed, seed = o.seed || 1;
    const x0 = o.x0 == null ? 0 : o.x0, x1 = o.x1 == null ? W : o.x1;
    const tex = fogTex(col, seed), tw = h * 4;
    ctx.save();
    ctx.globalAlpha = clamp(k);
    tileX(ctx, tex, -(sc * 0.7 + t * spd), y, tw, h, x0, x1);
    ctx.globalAlpha = clamp(k) * 0.7;
    tileX(ctx, tex, -(sc + t * spd * 1.7) + tw * 0.37, y + h * 0.18, tw * 1.3, h * 0.9, x0, x1);
    ctx.restore();
  }

  // ================================================================================================ lightning bolt
  function boltPts(x0, y0, x1, y1, rough, r, depth) {
    let pts = [[x0, y0], [x1, y1]];
    let disp = hypot(x1 - x0, y1 - y0) * rough;
    for (let d = 0; d < depth; d++) {
      const np = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], L = hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, o = (r() - 0.5) * disp;
        np.push([(a[0] + b[0]) / 2 + nx * o, (a[1] + b[1]) / 2 + ny * o], b);
      }
      pts = np; disp *= 0.55;
    }
    return pts;
  }
  // kit.lightningBolt(ctx, S, {x, y0, y1, x1, k, seed, color, width, branches})
  function lightningBolt(ctx, S, o) {
    o = o || {};
    const k = clamp(o.k == null ? 1 : o.k) * fk(S);
    if (k <= 0.003) return;
    const r = NS.rng((o.seed || 1) * 97 + 3);
    const x = o.x == null ? W * 0.68 : o.x, y0 = o.y0 == null ? -10 : o.y0, y1 = o.y1 == null ? H * 0.62 : o.y1;
    const x1 = o.x1 == null ? x + (r() - 0.5) * 220 : o.x1;
    const main = boltPts(x, y0, x1, y1, 0.32, r, 7);
    const paths = [[main, 1]];
    const nb = o.branches == null ? 3 : o.branches;
    for (let b = 0; b < nb; b++) {
      const i = floor((0.15 + r() * 0.55) * main.length), p = main[i];
      const L = (y1 - y0) * (0.18 + r() * 0.28), dir = r() < 0.5 ? -1 : 1;
      paths.push([boltPts(p[0], p[1], p[0] + dir * L * (0.4 + r() * 0.5), p[1] + L * (0.6 + r() * 0.4), 0.35, r, 5), 0.55]);
    }
    const col = o.color || '#dfe6ff', wd = o.width || 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const passes = [[18, 0.05, '#6d7fd8'], [8, 0.14, '#8fa0ff'], [3.2, 0.55, col], [1.4, 1, '#ffffff']];
    for (const [pts, pa] of paths) {
      for (const [lw, a, c] of passes) {
        ctx.strokeStyle = css(c, a * k * pa); ctx.lineWidth = lw * wd * (pa < 1 ? 0.6 : 1);
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    }
    drawGlow(ctx, x, max(0, y0), 160, '#8fa0ff', 0.4 * k);
    ctx.restore();
  }

  // ================================================================================================ street
  // asphalt texture tile (tileable in x): 1024 x 256 px
  function asphaltTex(base, seed) {
    return cached('st:asph:' + base + ':' + seed, 1024, 256, (g) => {
      const img = g.createImageData(1024, 256), d = img.data, b = rgb(base);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 1024; x++) {
          const n = fbm2p(x / 64, y / 32 + seed * 7, 16, 4);
          const n2 = vn2p(x / 3, y / 2.2 + seed * 3, 342);
          let v = 0.82 + (n - 0.5) * 0.5 + (n2 > 0.86 ? 0.35 : n2 < 0.1 ? -0.18 : 0);
          const i = (y * 1024 + x) * 4;
          d[i] = b[0] * v; d[i + 1] = b[1] * v; d[i + 2] = b[2] * v * 1.04; d[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      const r = NS.rng(seed * 5 + 1);
      // patches
      for (let i = 0; i < 6; i++) {
        const x = r() * 900, y = r() * 220, w = 60 + r() * 160, h = 20 + r() * 40;
        g.fillStyle = css(shade(b, r() < 0.5 ? -0.25 : 0.12), 0.45);
        for (const ox of [0, -1024]) g.fillRect(x + ox, y, w, h);
      }
      // tar snakes (crack sealant)
      g.strokeStyle = css(shade(b, -0.6), 0.75); g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        let x = r() * 1024, y = r() * 256, a = r() * TAU;
        g.lineWidth = 1.5 + r() * 2.5;
        g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 14; j++) { a += (r() - 0.5) * 1.2; x += cos(a) * 9; y += sin(a) * 4; g.lineTo(x, y); }
        g.stroke();
      }
      // oil blots
      for (let i = 0; i < 7; i++) {
        const x = r() * 1024, y = 40 + r() * 180, rr = 14 + r() * 40;
        const grd = g.createRadialGradient(x, y, 0, x, y, rr);
        grd.addColorStop(0, 'rgba(5,6,10,0.5)'); grd.addColorStop(1, 'rgba(5,6,10,0)');
        g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, rr * 1.6, rr * 0.5, 0, 0, TAU); g.fill();
      }
    });
  }
  function concreteTex(base, seed) {
    return cached('st:conc:' + base + ':' + seed, 512, 64, (g) => {
      const img = g.createImageData(512, 64), d = img.data, b = rgb(base);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 512; x++) {
        const v = 0.85 + (fbm2p(x / 40, y / 16 + seed, 13, 3) - 0.5) * 0.4 + (vn2p(x / 2, y / 2, 256) > 0.9 ? 0.15 : 0);
        const i = (y * 512 + x) * 4; d[i] = b[0] * v; d[i + 1] = b[1] * v; d[i + 2] = b[2] * v; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.strokeStyle = css(shade(b, -0.5), 0.8); g.lineWidth = 2;
      for (let x = 0; x < 512; x += 128) { g.beginPath(); g.moveTo(x + 1, 0); g.lineTo(x + 1, 64); g.stroke(); }
      const r = NS.rng(seed + 3);
      g.lineWidth = 1; g.strokeStyle = css(shade(b, -0.45), 0.6);
      for (let i = 0; i < 5; i++) { let x = r() * 512, y = r() * 64; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (r() - 0.3) * 18; y += (r() - 0.5) * 10; g.lineTo(x, y); } g.stroke(); }
    });
  }
  // draw a texture band [y0, y1] in perspective strips: row scale s(y), world u scrolled by `scroll`
  function groundStrips(ctx, tex, y0, y1, sAt, cx, scroll, n, vy0, vy1) {
    const tw = tex.width, th = tex.height;
    const sy0 = vy0 == null ? 0 : vy0, sy1 = vy1 == null ? th : vy1;
    for (let i = 0; i < n; i++) {
      const a = y0 + (y1 - y0) * i / n, b = y0 + (y1 - y0) * (i + 1) / n + 0.6;
      const s = sAt((a + b) / 2), tws = tw * s;
      const v0 = lerp(sy0, sy1, i / n), v1 = lerp(sy0, sy1, (i + 1) / n);
      let x = cx + (-scroll) * s;
      x = x - ceil((x + 1) / tws) * tws;
      for (; x < W + 1; x += tws) ctx.drawImage(tex, 0, v0, tw, max(0.5, v1 - v0), x, a, tws + 0.6, b - a);
    }
  }
  // kit.street(ctx, S, {view 'side'|'ahead', horizonY, bottomY, farScale, scroll, wet, lamps: [{x, color, k, w}],
  //   asphalt, curbs: [far, near] (fractions of the band, side view), sidewalk, lines 'double'|'dash'|'none',
  //   puddles, vx, roadW})  -> {sAt(y), yAt(frac), xAt(u, y)}
  function street(ctx, S, o) {
    o = o || {};
    if (o.view === 'ahead') return streetAhead(ctx, S, o);
    const t = tOf(S), hy = o.horizonY == null ? 520 : o.horizonY, by = o.bottomY == null ? H : o.bottomY;
    const far = o.farScale == null ? 0.42 : o.farScale, scroll = o.scroll || 0, wet = o.wet == null ? 0.7 : o.wet;
    const yv = hy - (by - hy) * far / (1 - far), sAt = (y) => (y - yv) / (by - yv);
    const cx = W / 2, band = by - hy;
    const cf = o.curbs ? o.curbs[0] : 0.16, cn = o.curbs ? o.curbs[1] : 0.93;
    const yF = hy + band * cf, yN = hy + band * cn;
    const asph = asphaltTex(o.asphalt || '#20232c', o.seed || 1);
    const conc = concreteTex(o.concrete || '#34363d', 2);
    const xAt = (u, y) => cx + (u - scroll) * sAt(y);
    ctx.save();
    // far sidewalk + curb face
    if (o.sidewalk !== false) {
      groundStrips(ctx, conc, hy, yF - 6, sAt, cx, scroll, 8, 0, 64);
      ctx.fillStyle = 'rgba(8,10,16,0.35)'; ctx.fillRect(0, hy, W, (yF - hy) * 0.25);
    }
    groundStrips(ctx, asph, yF, yN, sAt, cx, scroll, 26, 0, 256);
    // curb
    ctx.fillStyle = '#4a4c52'; ctx.fillRect(0, yF - 6 * sAt(yF), W, 6 * sAt(yF));
    ctx.fillStyle = '#16181e'; ctx.fillRect(0, yF, W, 9 * sAt(yF));
    ctx.fillStyle = 'rgba(150,160,180,0.25)'; ctx.fillRect(0, yF - 6 * sAt(yF), W, 1.2);
    // gutter darkness along the far curb
    let gg = ctx.createLinearGradient(0, yF, 0, yF + band * 0.08);
    gg.addColorStop(0, 'rgba(4,5,9,0.65)'); gg.addColorStop(1, 'rgba(4,5,9,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, yF, W, band * 0.08);
    // lane lines
    const lines = o.lines || 'double';
    if (lines !== 'none') {
      const yc = lerp(yF, yN, 0.46), s = sAt(yc);
      if (lines === 'double') {
        ctx.fillStyle = 'rgba(214,170,60,0.55)';
        ctx.fillRect(0, yc - 4 * s, W, 2.6 * s); ctx.fillRect(0, yc + 1.5 * s, W, 2.6 * s);
        // worn gaps
        ctx.fillStyle = css('#20232c', 0.6);
        for (let k = -2; k < 30; k++) {
          const u = k * 173 + floor(scroll / 173) * 173, x = xAt(u + hash(k + floor(scroll / 173), 4) * 120, yc);
          ctx.fillRect(x, yc - 5 * s, 18 * s * hash(k, 5), 10 * s);
        }
      } else {
        ctx.fillStyle = 'rgba(220,220,210,0.6)';
        const per = 300;
        for (let k = floor(scroll / per) - 6; k < floor(scroll / per) + 12; k++) {
          const x = xAt(k * per, yc);
          if (x > W + 50) break;
          ctx.fillRect(x, yc - 2.5 * s, 130 * s, 5 * s);
        }
      }
    }
    // near curb + sidewalk
    if (cn < 1) {
      ctx.fillStyle = '#0d0f14'; ctx.fillRect(0, yN, W, 14 * sAt(yN));
      ctx.fillStyle = '#55575d'; ctx.fillRect(0, yN - 3, W, 4);
      if (o.sidewalk !== false) groundStrips(ctx, conc, yN + 14 * sAt(yN), by, sAt, cx, scroll, 4, 0, 64);
    }
    // depth darkening toward the horizon + near
    gg = ctx.createLinearGradient(0, hy, 0, by);
    gg.addColorStop(0, 'rgba(10,14,28,0.55)'); gg.addColorStop(0.5, 'rgba(10,14,28,0.15)'); gg.addColorStop(1, 'rgba(4,5,10,0.45)');
    ctx.fillStyle = gg; ctx.fillRect(0, hy, W, band);
    // wet: sky sheen + lamp streaks + puddles
    const lamps = o.lamps || [];
    if (wet > 0) {
      ctx.globalCompositeOperation = 'lighter';
      gg = ctx.createLinearGradient(0, yF, 0, yN);
      gg.addColorStop(0, css('#3a4a78', 0.22 * wet)); gg.addColorStop(1, css('#3a4a78', 0.04 * wet));
      ctx.fillStyle = gg; ctx.fillRect(0, yF, W, yN - yF);
      for (const L of lamps) streak(ctx, t, L, yF, yN, sAt, 0.55 * wet);
      ctx.globalCompositeOperation = 'source-over';
    }
    const np = o.puddles == null ? 7 : o.puddles;
    if (np > 0 && wet > 0) {
      const per = 2600 / np;
      for (let k = floor(scroll / per) - 3; k < floor(scroll / per) + np + 4; k++) {
        const v = 0.12 + hash(k, 21) * 0.8, y = lerp(yF, yN, v), s = sAt(y);
        const u = k * per + hash(k, 22) * per * 0.6, x = xAt(u, y);
        const rx = (60 + hash(k, 23) * 110) * s, ry = rx * (0.12 + 0.1 * v);
        if (x + rx < -10 || x - rx > W + 10) continue;
        ctx.save();
        ctx.beginPath();
        // a lumpy puddle: three overlapping ellipses
        ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
        ctx.ellipse(x + rx * 0.5, y + ry * 0.3, rx * 0.6, ry * 0.8, 0, 0, TAU);
        ctx.ellipse(x - rx * 0.55, y - ry * 0.2, rx * 0.5, ry * 0.7, 0, 0, TAU);
        ctx.fillStyle = css('#0b1222', 0.75 * wet);
        ctx.fill('nonzero');
        ctx.clip('nonzero');
        const pg = ctx.createLinearGradient(0, y - ry, 0, y + ry);
        pg.addColorStop(0, css('#2e3c66', 0.7 * wet)); pg.addColorStop(1, css('#0b1222', 0.2));
        ctx.fillStyle = pg; ctx.fillRect(x - rx * 1.2, y - ry * 1.2, rx * 2.4, ry * 2.4);
        ctx.globalCompositeOperation = 'lighter';
        for (const L of lamps) {
          const lw = (L.w || 46) * s * 1.6;
          if (abs(L.x - x) > rx + lw) continue;
          const lg = ctx.createLinearGradient(L.x - lw, 0, L.x + lw, 0), lc = L.color || C.sodium, lk = (L.k == null ? 1 : L.k) * wet * (1 - (y - yF) / (yN - yF + 1)) * 0.9;
          lg.addColorStop(0, css(lc, 0)); lg.addColorStop(0.5, css(lc, lk)); lg.addColorStop(1, css(lc, 0));
          ctx.fillStyle = lg; ctx.fillRect(L.x - lw, y - ry * 1.3, lw * 2, ry * 2.6);
        }
        // rain ripples
        ctx.strokeStyle = css('#9fb4d8', 0.35 * wet); ctx.lineWidth = 1;
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
          const per2 = 0.5 + hash(j + k * 5, 31) * 0.5, ph = fract(t / per2 + hash(j + k * 5, 32));
          const cyc = floor(t / per2 + hash(j + k * 5, 32));
          const px = x + (hash(cyc * 3 + j, k + 33) - 0.5) * rx * 1.4, py = y + (hash(cyc * 5 + j, k + 34) - 0.5) * ry;
          const rr = 2 + ph * 16 * s;
          ctx.moveTo(px + rr, py); ctx.ellipse(px, py, rr, rr * 0.3, 0, 0, TAU);
        }
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = css('#7f93c0', 0.25 * wet); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, PI * 1.05, PI * 1.95); ctx.stroke();
      }
    }
    ctx.restore();
    return { sAt, xAt, yAt: (f) => lerp(hy, by, f), curbFar: yF, curbNear: yN, horizonY: hy };
  }
  // a vertical wet-road reflection streak under a light: a cached streak sprite drawn in rippling slices
  function streakSpr(color) {
    return cached('st:streak:' + color, 64, 256, (g) => {
      const img = g.createImageData(64, 256), d = img.data, c = rgb(color);
      for (let y = 0; y < 256; y++) {
        const v = y / 255, rip = 0.78 + 0.22 * sin(v * 70) * sin(v * 23 + 1);
        for (let x = 0; x < 64; x++) {
          const u = (x - 31.5) / 13, a = exp(-u * u) * pow(1 - v, 1.1) * rip;
          const i = (y * 64 + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = clamp(a) * 255;
        }
      }
      g.putImageData(img, 0, 0);
    });
  }
  function streak(ctx, t, L, yF, yN, sAt, a) {
    const k = (L.k == null ? 1 : L.k) * a;
    if (k <= 0.003) return;
    const col = L.color || C.sodium, y0 = L.y0 == null ? yF : L.y0, y1 = L.y1 == null ? yN : L.y1;
    const spr = streakSpr(col), wid = (L.w || 46), n = 12;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * min(1, k * 1.6);
    for (let i = 0; i < n; i++) {
      const ya = lerp(y0, y1, i / n), yb = lerp(y0, y1, (i + 1) / n), s = sAt((ya + yb) / 2);
      const wob = noise1(t * 2.2 + i * (L.smooth ? 0.25 : 0.7) + L.x * 0.01, 12) * 6 * s;
      const ww = wid * s * (0.8 + 0.6 * (i / n)) * 2.4;
      ctx.drawImage(spr, 0, i * 256 / n, 64, 256 / n, L.x + wob - ww / 2, ya, ww, yb - ya + 0.6);
    }
    ctx.globalAlpha = ga;
  }
  // looking down the road: vanishing point (vx, horizonY), centre dashes rushing at the camera
  function streetAhead(ctx, S, o) {
    const t = tOf(S), hy = o.horizonY == null ? 380 : o.horizonY, by = o.bottomY == null ? H : o.bottomY;
    const vx = o.vx == null ? W / 2 : o.vx, roadW = o.roadW || 620, scroll = o.scroll || 0, wet = o.wet == null ? 0.7 : o.wet;
    const sAt = (y) => (y - hy) / (by - hy);
    const asph = asphaltTex(o.asphalt || '#20232c', o.seed || 1);
    ctx.save();
    ctx.fillStyle = o.shoulder || '#101318'; ctx.fillRect(0, hy, W, by - hy);
    // road surface rows: texture across = u, along = distance
    ctx.save();
    ctx.beginPath(); ctx.moveTo(vx, hy); ctx.lineTo(vx + roadW * 1.15, by); ctx.lineTo(vx - roadW * 1.15, by); ctx.closePath(); ctx.clip();
    const n = 70, Dn = 12, dist = (y) => Dn / max(0.004, sAt(y));
    for (let i = 0; i < n; i++) {
      const a = hy + 1 + (by - hy) * pow(i / n, 1.7), b = hy + 1 + (by - hy) * pow((i + 1) / n, 1.7) + 0.7;
      const s = max(0.004, sAt((a + b) / 2)), tws = 1024 * s * 1.3;
      let v0 = ((dist(b) + scroll * 0.05) * 9) % 256, v1 = v0 + max(1, (dist(a) - dist(b)) * 9);
      v0 = (v0 + 256) % 256; const vh = min(255 - v0, v1 - v0);
      ctx.drawImage(asph, 0, v0, 1024, max(1, vh), vx - tws, a, tws, b - a);
      ctx.drawImage(asph, 0, (v0 + 97) % 200, 1024, max(1, vh), vx, a, tws, b - a);
    }
    ctx.restore();
    // edge lines + centre dashes
    ctx.fillStyle = 'rgba(220,220,210,0.55)';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(vx, hy); ctx.lineTo(vx + side * roadW * 1.02, by); ctx.lineTo(vx + side * roadW * 0.99, by); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(214,170,60,0.75)';
    const per = 16, dl = 7, sh0 = (scroll * 0.05) % per;
    for (let k = 0; k < 80; k++) {
      const d0 = Dn * 0.5 + k * per - sh0, d1 = d0 + dl;
      if (d1 <= 1) continue;
      const s0 = min(1.4, Dn / max(0.5, d0)), s1 = Dn / d1;
      if (s1 < 0.012) break;
      const y0 = hy + (by - hy) * s0, y1 = hy + (by - hy) * s1, w0 = 9 * s0, w1 = 9 * s1;
      ctx.beginPath(); ctx.moveTo(vx - w0, y0); ctx.lineTo(vx + w0, y0); ctx.lineTo(vx + w1, y1); ctx.lineTo(vx - w1, y1); ctx.closePath(); ctx.fill();
    }
    const gg = ctx.createLinearGradient(0, hy, 0, by);
    gg.addColorStop(0, css(o.haze || '#2a3a5c', 0.9)); gg.addColorStop(0.12, 'rgba(14,18,32,0.6)'); gg.addColorStop(0.4, 'rgba(10,14,28,0.2)'); gg.addColorStop(1, 'rgba(4,5,10,0.35)');
    ctx.fillStyle = gg; ctx.fillRect(0, hy, W, by - hy);
    if (wet > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (const L of o.lamps || []) streak(ctx, t, Object.assign({ y0: L.y == null ? hy : L.y, y1: by, w: 26, smooth: 1 }, L), hy, by, (y) => 0.3 + sAt(y) * 1.6, 0.6 * wet);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    return { sAt, xAt: (u, y) => vx + u * sAt(y), horizonY: hy };
  }

  // ================================================================================================ brick wall
  // kit.brickWall(ctx, x, y, w, h, {seed, color, mortar, brick (row height), grime, damp, scorch, damage, lights: [{x, y, r, color, k}]})
  function brickWall(ctx, x, y, w, h, o) {
    o = o || {};
    const seed = o.seed || 1, col = o.color || '#46241f', mort = o.mortar || '#1e1b1a', bh = o.brick || 24;
    const grime = o.grime == null ? 0.6 : o.grime, scorch = o.scorch || 0, dmg = o.damage || 0, damp = o.damp == null ? 0.5 : o.damp;
    const R = CS(), cw = round(w), chh = round(h);
    const key = ['bw', cw, chh, seed, col, mort, bh, grime, scorch, dmg, damp].join(':');
    const img = cached(key, cw * R, chh * R, (g) => {
      g.scale(R, R);
      const r = NS.rng(seed * 17 + 3);
      g.fillStyle = mort; g.fillRect(0, 0, cw, chh);
      const bl = bh * 2.9, mg = max(2, bh * 0.14), b = rgb(col);
      for (let row = 0, yy = 0; yy < chh; row++, yy += bh) {
        const off = row % 2 ? -bl / 2 : 0;
        for (let xx = off; xx < cw; xx += bl) {
          const v = (r() - 0.5) * 0.22, burnt = r() < 0.08;
          let c = shade(b, v + (burnt ? -0.35 : 0));
          if (r() < 0.1) c = mix(c, [120, 70, 50], 0.3);
          if (dmg > 0 && r() < dmg * 0.06) {   // missing brick: dark recess
            g.fillStyle = '#0a0808'; g.fillRect(xx + mg * 0.5, yy + mg * 0.5, bl - mg, bh - mg);
            continue;
          }
          const bx = xx + mg / 2, by2 = yy + mg / 2, bw2 = bl - mg, bh2 = bh - mg;
          g.fillStyle = css(c); g.fillRect(bx, by2, bw2, bh2);
          g.fillStyle = css(shade(c, 0.18), 0.6); g.fillRect(bx, by2, bw2, 1.2);
          g.fillStyle = css(shade(c, -0.35), 0.6); g.fillRect(bx, by2 + bh2 - 1.4, bw2, 1.4);
          // speckle + chips
          for (let k = 0; k < 4; k++) { g.fillStyle = css(shade(c, (r() - 0.5) * 0.5), 0.5); g.fillRect(bx + r() * bw2, by2 + r() * bh2, 2, 1.5); }
          if (r() < 0.15) { g.fillStyle = mort; g.beginPath(); g.arc(bx + (r() < 0.5 ? 0 : bw2), by2 + r() * bh2, 2 + r() * 3, 0, TAU); g.fill(); }
        }
      }
      // grime: streaks running down from the top and from window ledges
      if (grime > 0) {
        for (let i = 0; i < floor(cw / 40); i++) {
          const gx = r() * cw, L = chh * (0.2 + r() * 0.6), gw = 8 + r() * 30;
          const gr = g.createLinearGradient(0, 0, 0, L);
          gr.addColorStop(0, `rgba(10,12,8,${0.35 * grime})`); gr.addColorStop(1, 'rgba(10,12,8,0)');
          g.fillStyle = gr; g.fillRect(gx, 0, gw, L);
        }
        const gr2 = g.createRadialGradient(cw / 2, chh / 2, min(cw, chh) * 0.2, cw / 2, chh / 2, max(cw, chh) * 0.75);
        gr2.addColorStop(0, 'rgba(0,0,0,0)'); gr2.addColorStop(1, `rgba(0,0,0,${0.35 * grime})`);
        g.fillStyle = gr2; g.fillRect(0, 0, cw, chh);
      }
      if (damp > 0) {
        const gr = g.createLinearGradient(0, chh, 0, chh * 0.7);
        gr.addColorStop(0, `rgba(5,8,14,${0.55 * damp})`); gr.addColorStop(1, 'rgba(5,8,14,0)');
        g.fillStyle = gr; g.fillRect(0, chh * 0.7, cw, chh * 0.3);
      }
      if (scorch > 0) {
        for (let i = 0; i < 5; i++) {
          const sx = r() * cw, sy = chh * (0.1 + r() * 0.5), rr = 80 + r() * 200;
          const gr = g.createRadialGradient(sx, sy + rr * 0.6, 0, sx, sy, rr);
          gr.addColorStop(0, `rgba(8,6,6,${0.75 * scorch})`); gr.addColorStop(0.6, `rgba(12,8,8,${0.4 * scorch})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(sx, sy, rr * 0.6, rr, 0, 0, TAU); g.fill();
        }
      }
    });
    ctx.drawImage(img, x, y, w, h);
    if (o.lights) lightPools(ctx, x, y, w, h, o.lights);
  }
  // additive light pools clipped to a rect (lights relative to the frame)
  function lightPools(ctx, x, y, w, h, lights) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) drawGlow(ctx, L.x, L.y, L.r || 200, L.color || C.sodium, (L.k == null ? 1 : L.k) * 0.45, 'soft');
    ctx.restore();
  }

  // ================================================================================================ streetlight
  // kit.streetlight(ctx, x, y, {h, color, k, style 'cobra'|'lantern', face, flicker (seed), t | S, cone, pool, groundY, beam})
  //  -> {lamp: [x, y], ground: [x, y]}
  function streetlight(ctx, x, y, o) {
    o = o || {};
    const h = o.h || 320, s = h / 320, face = o.face || 1, col = o.color || C.sodium, style = o.style || 'cobra';
    const t = o.t != null ? o.t : tOf(o.S);
    let k = o.k == null ? 1 : o.k;
    if (o.flicker != null && o.flicker !== false) k *= flicker(t, typeof o.flicker === 'number' ? o.flicker : 3);
    const gy = o.groundY == null ? y : o.groundY;
    ctx.save();
    // pole
    const pw = 9 * s;
    ctx.fillStyle = '#0a0d13';
    ctx.beginPath(); ctx.moveTo(x - pw * 0.9, y); ctx.lineTo(x - pw * 0.45, y - h); ctx.lineTo(x + pw * 0.45, y - h); ctx.lineTo(x + pw * 0.9, y); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - pw * 1.6, y - 26 * s, pw * 3.2, 26 * s);
    ctx.fillStyle = css(col, 0.22 * k + 0.05);
    ctx.fillRect(x + face * pw * 0.2, y - h, pw * 0.3 * face, h - 26 * s);
    let lx, ly;
    if (style === 'lantern') {
      lx = x; ly = y - h - 30 * s;
      ctx.fillStyle = '#0a0d13';
      ctx.beginPath(); ctx.moveTo(x - 20 * s, ly - 26 * s); ctx.lineTo(x, ly - 44 * s); ctx.lineTo(x + 20 * s, ly - 26 * s); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - 14 * s, ly + 20 * s, 28 * s, 6 * s);
      ctx.fillStyle = css(mix(col, '#fff6d8', 0.5), 0.35 + 0.6 * k);
      ctx.beginPath(); ctx.moveTo(x - 16 * s, ly - 24 * s); ctx.lineTo(x + 16 * s, ly - 24 * s); ctx.lineTo(x + 12 * s, ly + 20 * s); ctx.lineTo(x - 12 * s, ly + 20 * s); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0a0d13'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath(); ctx.moveTo(x, ly - 24 * s); ctx.lineTo(x, ly + 20 * s); ctx.stroke();
    } else {
      // cobra head arm
      ctx.strokeStyle = '#0a0d13'; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y - h + 8 * s); ctx.quadraticCurveTo(x, y - h - 26 * s, x + face * 50 * s, y - h - 26 * s); ctx.lineTo(x + face * 74 * s, y - h - 22 * s); ctx.stroke();
      lx = x + face * 92 * s; ly = y - h - 14 * s;
      ctx.fillStyle = '#10141c';
      ctx.beginPath(); ctx.ellipse(lx, ly - 6 * s, 30 * s, 11 * s, face * 0.06, 0, TAU); ctx.fill();
      ctx.fillStyle = css(mix(col, '#fff3d0', 0.55), 0.25 + 0.75 * k);
      ctx.beginPath(); ctx.ellipse(lx, ly + 1 * s, 22 * s, 5 * s, 0, 0, PI); ctx.fill();
      ctx.strokeStyle = css(col, 0.3 * k); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(lx, ly - 6 * s, 30 * s, 11 * s, face * 0.06, PI * 1.1, PI * 1.6); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    if (k > 0.01) {
      if (o.cone !== false) beamRaw(ctx, lx, ly + 4 * s, PI / 2, 0.62, (gy - ly) * 1.08, col, 0.4 * k, { motes: o.motes == null ? 14 : o.motes, t, seed: round(x) });
      drawGlow(ctx, lx, ly + 2 * s, 26 * s, '#fff1cc', 0.9 * k, 'hot');
      drawGlow(ctx, lx, ly, 120 * s, col, 0.42 * k);
      drawGlow(ctx, lx, ly, 300 * s, col, 0.12 * k);
      if (o.pool !== false) {
        ctx.save(); ctx.translate(lx, gy); ctx.scale(1, 0.22);
        drawGlow(ctx, 0, 0, 230 * s, col, 0.42 * k, 'flat');
        ctx.restore();
      }
    }
    ctx.restore();
    return { lamp: [lx, ly], ground: [lx, gy], k };
  }

  // ================================================================================================ fence
  // kit.fence(ctx, x, y, w, h, {kind 'chain'|'wood'|'bars', seed, color, damage, barbed, light}) (x, y = top-left)
  function fence(ctx, x, y, w, h, o) {
    o = o || {};
    const kind = o.kind || 'chain', seed = o.seed || 1, dmg = o.damage || 0;
    const R = CS(), cw = round(w), chh = round(h);
    const col = o.color || (kind === 'wood' ? '#3a2e26' : kind === 'bars' ? '#14161c' : '#8a93a6');
    const key = ['fence', kind, cw, chh, seed, col, dmg, o.barbed ? 1 : 0].join(':');
    const img = cached(key, cw * R, (chh + 40) * R, (g) => {
      g.scale(R, R); g.translate(0, 40);
      const r = NS.rng(seed * 7 + 2);
      if (kind === 'wood') {
        let px = 0;
        while (px < cw) {
          const pw = 26 + r() * 10, top = r() * 14 + (r() < dmg * 0.3 ? r() * chh * 0.4 : 0);
          const c = shade(col, (r() - 0.5) * 0.25);
          g.fillStyle = css(c); g.fillRect(px, top, pw - 3, chh - top);
          g.fillStyle = css(shade(c, -0.4), 0.7); g.fillRect(px + pw - 6, top, 3, chh - top);
          g.strokeStyle = css(shade(c, -0.3), 0.5); g.lineWidth = 1;
          for (let k = 0; k < 3; k++) { const gx = px + 4 + r() * (pw - 10); g.beginPath(); g.moveTo(gx, top + 4); g.bezierCurveTo(gx + 3, top + chh * 0.3, gx - 3, top + chh * 0.6, gx + 1, chh); g.stroke(); }
          g.fillStyle = '#0c0c0c'; g.fillRect(px + pw / 2 - 2, top + 16, 3, 3); g.fillRect(px + pw / 2 - 2, chh - 30, 3, 3);
          // pointed top
          g.fillStyle = css(c); g.beginPath(); g.moveTo(px, top); g.lineTo(px + (pw - 3) / 2, top - 10); g.lineTo(px + pw - 3, top); g.fill();
          px += pw;
        }
        g.fillStyle = css(shade(col, -0.3)); g.fillRect(0, chh * 0.2, cw, 10); g.fillRect(0, chh * 0.75, cw, 10);
      } else if (kind === 'bars') {
        g.fillStyle = col;
        g.fillRect(0, 10, cw, 6); g.fillRect(0, chh - 24, cw, 6);
        for (let bx = 6; bx < cw; bx += 22) {
          const bend = r() < dmg * 0.4 ? (r() - 0.5) * 18 : 0;
          g.beginPath(); g.moveTo(bx - 2, chh); g.quadraticCurveTo(bx + bend, chh * 0.5, bx - 2, 0); g.lineTo(bx + 2, 0); g.quadraticCurveTo(bx + bend + 4, chh * 0.5, bx + 2, chh); g.fill();
          g.beginPath(); g.moveTo(bx - 6, 0); g.lineTo(bx, -14); g.lineTo(bx + 6, 0); g.fill();
        }
      } else {
        // chain link: posts, top rail, diamond mesh with a sag and torn holes
        const posts = [];
        for (let px = 0; px <= cw; px += 150) posts.push(px);
        const sag = (xx) => { let best = 0; for (let i = 0; i < posts.length - 1; i++) if (xx >= posts[i] && xx <= posts[i + 1]) { const k = (xx - posts[i]) / (posts[i + 1] - posts[i]); best = sin(k * PI) * (6 + dmg * 26) * (0.6 + hash(i, seed) * 0.8); } return best; };
        g.save();
        const holes = [];
        for (let i = 0; i < floor(dmg * 4); i++) holes.push([r() * cw, chh * (0.4 + r() * 0.5), 30 + r() * 50]);
        g.beginPath(); g.rect(0, 0, cw, chh);
        for (const ho of holes) { g.moveTo(ho[0] + ho[2], ho[1]); for (let a = 0; a <= TAU + 0.01; a += 0.5) g.lineTo(ho[0] + cos(a) * ho[2] * (0.6 + r() * 0.5), ho[1] + sin(a) * ho[2] * 0.8 * (0.6 + r() * 0.5)); }
        g.clip('evenodd');
        g.strokeStyle = css(col, 0.55); g.lineWidth = 1.1;
        const sp = 13;
        g.beginPath();
        for (let d = -chh; d < cw + chh; d += sp) {
          for (let yy = 8; yy < chh; yy += 6) {
            const x1 = d + yy, x2 = d - yy;
            if (x1 >= 0 && x1 <= cw) { if (yy === 8) g.moveTo(x1, yy + sag(x1)); else g.lineTo(x1, yy + sag(x1) * (yy / chh)); }
          }
        }
        for (let d = -chh; d < cw + chh; d += sp) {
          let first = true;
          for (let yy = 8; yy < chh; yy += 6) {
            const x2 = d + chh - yy;
            if (x2 >= 0 && x2 <= cw) { if (first) { g.moveTo(x2, yy + sag(x2) * (yy / chh)); first = false; } else g.lineTo(x2, yy + sag(x2) * (yy / chh)); }
          }
        }
        g.stroke();
        g.restore();
        // ragged wire ends at the holes
        g.strokeStyle = css(col, 0.7); g.lineWidth = 1;
        for (const ho of holes) for (let a = 0; a < TAU; a += 0.4) { g.beginPath(); g.moveTo(ho[0] + cos(a) * ho[2] * 0.75, ho[1] + sin(a) * ho[2] * 0.6); g.lineTo(ho[0] + cos(a) * ho[2] * 0.55, ho[1] + sin(a) * ho[2] * 0.45 + 4); g.stroke(); }
        g.fillStyle = css(shade(col, -0.45));
        g.fillRect(0, 4, cw, 5);
        for (const px of posts) {
          const lean = (hash(px, seed) - 0.5) * dmg * 14;
          g.beginPath(); g.moveTo(px - 4, chh); g.lineTo(px - 3 + lean, 0); g.lineTo(px + 3 + lean, 0); g.lineTo(px + 4, chh); g.fill();
          g.fillStyle = css(shade(col, 0.1), 0.5); g.fillRect(px - 3 + lean, 0, 1.5, chh); g.fillStyle = css(shade(col, -0.45));
        }
        if (o.barbed) {
          g.strokeStyle = css(shade(col, -0.2), 0.8); g.lineWidth = 1.2;
          g.beginPath();
          for (let bx = 0; bx < cw; bx += 9) { g.moveTo(bx, -6); g.arc(bx + 4.5, -14, 9, PI * 0.5, PI * 2.4); }
          g.stroke();
        }
      }
    });
    ctx.drawImage(img, x, y - 40, w, h + 40);
  }

  // ================================================================================================ wreck
  const WRECK_COLS = ['#34405a', '#5e2520', '#6e6450', '#26392e', '#7c7c78', '#8e7220', '#2c2c34', '#46385a'];
  // kit.wreck(ctx, x, y, s, {seed, burning 0..1, face, flipped, t | S, kind 'sedan'|'hatch'|'pickup', color}) (x, y = ground centre; s 1 = 300 units long)
  function wreck(ctx, x, y, s, o) {
    o = o || {};
    const seed = o.seed || 1, face = o.face || (hash(seed, 3) < 0.5 ? 1 : -1);
    const kinds = ['sedan', 'hatch', 'pickup', 'sedan'];
    const kind = o.kind || kinds[floor(hash(seed, 4) * 4)];
    const color = o.color || WRECK_COLS[floor(hash(seed, 5) * WRECK_COLS.length)];
    const R = CS() * min(2, max(0.5, s));
    const key = ['wreck', seed, kind, color, o.flipped ? 1 : 0].join(':');
    const img = cached(key, 340 * R, 170 * R, (g) => {
      g.scale(R, R); g.translate(170, 150);
      drawCarBody(g, kind, color, seed, !!o.flipped);
    });
    ctx.save();
    ctx.translate(x, y); ctx.scale(s * face, s);
    ctx.drawImage(img, -170, -150, 340, 170);
    ctx.restore();
    const bk = o.burning || 0;
    if (bk > 0) {
      const t = o.t != null ? o.t : tOf(o.S);
      const fx = x + face * 92 * s, fy = y - 64 * s;
      fire(ctx, t, fx, fy, 90 * s, 170 * s * bk, bk, seed);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, fx, fy, 260 * s, C.fire, 0.35 * bk * (0.85 + 0.15 * noise1(t * 9, seed)));
      ctx.translate(fx, y); ctx.scale(1, 0.25); drawGlow(ctx, 0, 0, 280 * s, C.fire, 0.4 * bk, 'flat');
      ctx.restore();
    }
  }
  // a smashed car body, facing right, ground at y = 0, ~300 long
  function drawCarBody(g, kind, color, seed, flipped) {
    const r = NS.rng(seed * 13 + 7), c = rgb(color);
    if (flipped) { g.translate(0, -70); g.scale(1, -1); g.translate(0, -60); }
    const dark = shade(c, -0.55);
    // body silhouette
    const bp = new Path2D();
    const pts = kind === 'pickup'
      ? [[-150, -22], [-150, -62], [-40, -62], [-30, -66], [-20, -108], [48, -106], [80, -66], [138, -60], [146, -44], [150, -22]]
      : kind === 'hatch'
        ? [[-132, -24], [-134, -66], [-112, -112], [20, -114], [66, -72], [128, -62], [138, -44], [138, -24]]
        : [[-150, -24], [-152, -58], [-96, -64], [-64, -108], [34, -110], [70, -68], [140, -62], [150, -44], [150, -24]];
    bp.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) bp.lineTo(q[0], q[1]); bp.closePath();
    const bodyG = g.createLinearGradient(0, -115, 0, -20);
    bodyG.addColorStop(0, css(shade(c, 0.05))); bodyG.addColorStop(0.42, css(c)); bodyG.addColorStop(0.5, css(shade(c, -0.3))); bodyG.addColorStop(1, css(shade(c, -0.6)));
    g.fillStyle = bodyG; g.fill(bp);
    // moonlit rim along the roof and shoulders (inner edge highlight, upper half only)
    g.save(); g.clip(bp);
    g.beginPath(); g.rect(-170, -130, 340, 72); g.clip();
    g.strokeStyle = 'rgba(165,190,240,0.6)'; g.lineWidth = 4; g.stroke(bp);
    g.restore();
    // crumpled front: dark crush with folds, hood popped
    g.save(); g.clip(bp);
    g.fillStyle = css(dark, 0.9);
    g.beginPath(); g.moveTo(112, -70); g.lineTo(122, -50); g.lineTo(116, -38); g.lineTo(130, -26); g.lineTo(160, -26); g.lineTo(160, -70); g.closePath(); g.fill();
    g.strokeStyle = css(shade(c, 0.3), 0.6); g.lineWidth = 1.5;
    g.beginPath(); for (let i = 0; i < 6; i++) { g.moveTo(104 + i * 7, -66 + r() * 6); g.lineTo(112 + i * 6, -30 - r() * 8); } g.stroke();
    // rust & grime
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${90 + r() * 40},${40 + r() * 20},20,${0.15 + r() * 0.2})`; g.beginPath(); g.ellipse(-140 + r() * 280, -30 - r() * 30, 6 + r() * 16, 3 + r() * 8, 0, 0, TAU); g.fill(); }
    const dg = g.createLinearGradient(0, -40, 0, -20); dg.addColorStop(0, 'rgba(20,18,16,0)'); dg.addColorStop(1, 'rgba(20,18,16,0.6)');
    g.fillStyle = dg; g.fillRect(-160, -40, 320, 20);
    g.restore();
    // windows: shattered
    g.beginPath();
    if (kind === 'pickup') { g.moveTo(-14, -100); g.lineTo(44, -99); g.lineTo(70, -68); g.lineTo(-24, -68); }
    else if (kind === 'hatch') { g.moveTo(-122, -70); g.lineTo(-104, -106); g.lineTo(16, -108); g.lineTo(54, -72); }
    else { g.moveTo(-88, -66); g.lineTo(-60, -102); g.lineTo(30, -104); g.lineTo(60, -70); }
    g.closePath();
    g.fillStyle = '#0a0e16'; g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(200,215,240,0.45)'; g.lineWidth = 0.9;
    const ix = -10 + r() * 30, iy = -88;
    for (let a = 0; a < TAU; a += 0.5 + r() * 0.4) { g.beginPath(); g.moveTo(ix, iy); let px = ix, py = iy; for (let j = 0; j < 4; j++) { px += cos(a + (r() - 0.5) * 0.4) * 14; py += sin(a + (r() - 0.5) * 0.4) * 14; g.lineTo(px, py); } g.stroke(); }
    for (let rr = 8; rr < 40; rr += 10) { g.beginPath(); g.arc(ix, iy, rr, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(160,180,220,0.12)'; g.beginPath(); g.moveTo(-60, -102); g.lineTo(-30, -102); g.lineTo(-70, -66); g.lineTo(-88, -66); g.fill();
    g.restore();
    // pillars / doors
    g.strokeStyle = css(shade(c, -0.6)); g.lineWidth = 2;
    g.beginPath(); g.moveTo(-14, -104); g.lineTo(-14, -26); g.moveTo(-90, -62); g.lineTo(-92, -26); g.moveTo(66, -68); g.lineTo(64, -26); g.stroke();
    g.fillStyle = css(shade(c, 0.4), 0.5); g.fillRect(-6, -60, 14, 3); g.fillRect(-84, -60, 14, 3);
    // dents
    for (let i = 0; i < 4; i++) { const dx = -120 + r() * 220, dy = -50 - r() * 10; const dgr = g.createRadialGradient(dx, dy, 0, dx, dy, 18); dgr.addColorStop(0, 'rgba(0,0,0,0.35)'); dgr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = dgr; g.beginPath(); g.arc(dx, dy, 18, 0, TAU); g.fill(); }
    // highlight along the shoulder line
    g.strokeStyle = css(shade(c, 0.5), 0.5); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-148, -58); g.lineTo(-96, -63); g.moveTo(70, -67); g.lineTo(138, -61); g.stroke();
    // bumpers, lights
    g.fillStyle = '#16181c'; g.fillRect(-156, -36, 14, 12); g.save(); g.translate(150, -30); g.rotate(0.5); g.fillRect(-6, -6, 26, 8); g.restore();
    g.fillStyle = '#5a1010'; g.fillRect(-152, -56, 6, 10);
    g.fillStyle = '#2a2e36'; g.fillRect(138, -56, 8, 8);
    // hood popped up at the front
    g.fillStyle = css(shade(c, -0.15));
    g.beginPath(); g.moveTo(68, -70); g.lineTo(112, -96); g.lineTo(118, -88); g.lineTo(76, -64); g.closePath(); g.fill();
    // wheels (one flat)
    const wheel = (wx, flat) => {
      g.fillStyle = '#08090b'; g.beginPath(); g.ellipse(wx, -20 + (flat ? 4 : 0), 24, flat ? 18 : 24, 0, 0, TAU); g.fill();
      g.fillStyle = '#3a3d44'; g.beginPath(); g.arc(wx, -20 + (flat ? 6 : 0), 11, 0, TAU); g.fill();
      g.fillStyle = '#5a5e66'; g.beginPath(); g.arc(wx - 2, -22 + (flat ? 6 : 0), 4, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.ellipse(wx, 0, 30, 4, 0, 0, TAU); g.fill();
    };
    g.fillStyle = '#050608';
    g.beginPath(); g.arc(-96, -22, 28, PI, 0); g.arc(92, -22, 28, PI, 0); g.fill();
    wheel(-96, r() < 0.5); wheel(92, true);
    // underside shadow
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(0, 0, 160, 7, 0, 0, TAU); g.fill();
  }
  // flame tongue sprites (64 x 160, base at the bottom centre): 4 shapes x {normal, hot}
  function tongueSpr(v, hot) {
    return cached('fx:tongue:' + v + ':' + (hot ? 1 : 0), 96, 176, (g) => {
      g.translate(16, 8);
      const r = NS.rng(v * 7 + 3);
      const bend = (r() - 0.5) * 20, bend2 = (r() - 0.5) * 14, wd = 19 + r() * 5;
      g.shadowColor = hot ? 'rgba(255,240,200,0.9)' : 'rgba(255,90,20,0.9)'; g.shadowBlur = 10;
      g.beginPath();
      g.moveTo(32 - wd, 148);
      g.bezierCurveTo(32 - wd * 1.15, 110, 32 - wd * 0.5 + bend2, 70, 32 + bend, 14);
      g.bezierCurveTo(32 + wd * 0.55 + bend2, 72, 32 + wd * 1.1, 108, 32 + wd, 148);
      g.quadraticCurveTo(32, 160, 32 - wd, 148);
      g.closePath();
      const lg = g.createLinearGradient(0, 160, 0, 10);
      if (hot) { lg.addColorStop(0, 'rgba(255,255,240,0)'); lg.addColorStop(0.1, 'rgba(255,255,240,1)'); lg.addColorStop(0.4, 'rgba(255,235,160,0.95)'); lg.addColorStop(0.8, 'rgba(255,180,70,0.6)'); lg.addColorStop(1, 'rgba(255,140,40,0.1)'); }
      else { lg.addColorStop(0, 'rgba(255,210,100,0)'); lg.addColorStop(0.1, 'rgba(255,210,100,1)'); lg.addColorStop(0.35, 'rgba(255,130,35,0.95)'); lg.addColorStop(0.75, 'rgba(235,70,18,0.75)'); lg.addColorStop(1, 'rgba(170,30,8,0.15)'); }
      g.fillStyle = lg; g.fill();
    });
  }
  // procedural fire: flickering flame tongues (additive), base centre (x, y), width w, height h
  function fire(ctx, t, x, y, w, h, k, seed) {
    if (k <= 0.01 || h <= 1) return;
    seed = seed || 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, x, y - h * 0.25, max(w, h) * 0.9, C.fire, k * 0.35);
    const n = 6 + min(10, floor(w / 18));
    for (let pass = 0; pass < 2; pass++) {
      const hot = pass === 1;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, prof = 1 - pow(u * 2 - 1, 2) * 0.65;
        const fl = 0.72 + 0.28 * sin(t * (7 + hash(i, seed) * 6) + hash(i, seed + 1) * 9) + 0.12 * noise1(t * 5 + i * 3, seed);
        const th = h * prof * fl * (0.6 + 0.4 * hash(i, seed + 2)) * (hot ? 0.55 : 1);
        const tw = w * (hot ? 0.26 : 0.4) * (0.7 + 0.3 * hash(i, seed + 3));
        const tx = x + (u - 0.5) * w * 0.85;
        const sway = noise1(t * 2.2 + i * 1.3, seed + 4) * 0.35;
        ctx.save();
        ctx.translate(tx, y + hash(i, seed + 5) * h * 0.08 * (1 - prof * 0.5));
        ctx.transform(1, 0, -sway, 1, 0, 0);
        ctx.globalAlpha = k * (hot ? 0.85 : 0.75);
        ctx.drawImage(tongueSpr((i + seed) % 4, hot), -tw * 0.75, -th * 1.05, tw * 1.5, th * 1.1);
        ctx.restore();
      }
    }
    // licks that break off and rise
    for (let i = 0; i < 4; i++) {
      const per = 0.5 + hash(i, seed + 6) * 0.4, q = fract(t / per + hash(i, seed + 7));
      const lx = x + (hash(i + floor(t / per + hash(i, seed + 7)), seed + 8) - 0.5) * w * 0.6;
      const ly = y - h * (0.55 + q * 0.6), lw = w * 0.16 * (1 - q), lh = h * 0.3 * (1 - q);
      ctx.globalAlpha = k * (1 - q) * 0.8;
      ctx.drawImage(tongueSpr(i % 4, false), lx - lw * 0.75, ly - lh * 1.05, lw * 1.5, lh * 1.1);
    }
    ctx.globalAlpha = 1;
    drawGlow(ctx, x, y - h * 0.08, w * 0.5, C.fireHot, k * 0.55, 'hot');
    ctx.restore();
  }

  // ================================================================================================ dumpster
  // kit.dumpster(ctx, x, y, s, {seed, lid 0..1 (open), color, face, bags}) (x, y = ground centre; s 1 = 240 wide)
  function dumpster(ctx, x, y, s, o) {
    o = o || {};
    const seed = o.seed || 1, col = o.color || '#22382d', lid = clamp(o.lid == null ? 0.25 : o.lid), face = o.face || 1;
    const lq = round(lid * 8) / 8, R = CS() * min(2, max(0.5, s));
    const key = ['dump', seed, col, lq, o.bags === false ? 0 : 1].join(':');
    const img = cached(key, 300 * R, 260 * R, (g) => {
      g.scale(R, R); g.translate(150, 240);
      const r = NS.rng(seed * 3 + 1), c = rgb(col);
      // bags poking out
      if (o.bags !== false) {
        for (let i = 0; i < 4; i++) {
          const bx = -90 + i * 55 + r() * 20, by = -150 - r() * 20;
          g.fillStyle = css(shade([20, 22, 26], r() * 0.2)); g.beginPath(); g.ellipse(bx, by, 34, 26, r() - 0.5, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(160,170,190,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.arc(bx - 8, by - 6, 14, PI * 1.1, PI * 1.6); g.stroke();
        }
      }
      // body (slanted front)
      g.beginPath(); g.moveTo(-120, -150); g.lineTo(120, -150); g.lineTo(110, -18); g.lineTo(-110, -18); g.closePath();
      const bg = g.createLinearGradient(0, -150, 0, -18); bg.addColorStop(0, css(shade(c, 0.15))); bg.addColorStop(1, css(shade(c, -0.45)));
      g.fillStyle = bg; g.fill();
      g.save(); g.clip();
      g.strokeStyle = css(shade(c, -0.4), 0.8); g.lineWidth = 3;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 44, -150); g.lineTo(i * 41, -18); g.stroke(); }
      g.strokeStyle = css(shade(c, 0.3), 0.4); g.lineWidth = 1.2;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 44 + 3, -150); g.lineTo(i * 41 + 3, -18); g.stroke(); }
      for (let i = 0; i < 20; i++) { g.fillStyle = `rgba(${100 + r() * 50},${50 + r() * 20},20,${0.2 + r() * 0.3})`; g.beginPath(); g.ellipse(-110 + r() * 220, -30 - r() * 110, 3 + r() * 12, 2 + r() * 6, 0, 0, TAU); g.fill(); }
      drips(g, -110, 110, -148, 10, 70, '#1a2016', 0.5, seed + 3, 3);
      // a sticker
      g.fillStyle = '#d8d0b8'; g.save(); g.translate(40, -100); g.rotate(-0.12); g.fillRect(-20, -12, 40, 24); g.fillStyle = '#1a1a1a'; g.fillRect(-15, -6, 30, 3); g.fillRect(-15, 1, 22, 3); g.restore();
      g.restore();
      g.fillStyle = css(shade(c, -0.3)); g.fillRect(-124, -156, 248, 10);
      // lid
      g.save(); g.translate(-124, -156); g.rotate(-lq * 1.2);
      g.fillStyle = '#16181c'; g.fillRect(0, -8, 248, 10);
      g.fillStyle = 'rgba(120,130,150,0.3)'; g.fillRect(0, -8, 248, 2);
      g.restore();
      // wheels
      g.fillStyle = '#0a0a0c'; for (const wx of [-90, 90]) { g.beginPath(); g.arc(wx, -10, 10, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(0, 0, 130, 6, 0, 0, TAU); g.fill();
    });
    ctx.save(); ctx.translate(x, y); ctx.scale(s * face, s); ctx.drawImage(img, -150, -240, 300, 260); ctx.restore();
  }

  // ================================================================================================ road sign
  // kit.sign(ctx, x, y, text, {kind 'guide'|'street'|'warning', h (post height), w (board width), arrow 'up'|'left'|'right',
  //   rot, damage 0..1, lit 0..1 (retroreflective glow in headlights), seed, posts}) (x, y = ground point under the sign)
  function sign(ctx, x, y, text, o) {
    o = o || {};
    const kind = o.kind || 'guide', seed = o.seed || 1, dmg = o.damage == null ? 0.4 : o.damage;
    const lines = String(text).split('\n');
    const bg = kind === 'warning' ? '#d8a21c' : kind === 'street' ? '#1f5a36' : '#155a38';
    const fg = kind === 'warning' ? '#111111' : '#f2f2ea';
    const fs = 44, g0 = mctx();
    let tw = 0; for (const l of lines) tw = max(tw, measure(g0, l, fs, F.title));
    const arrowW = o.arrow && !(lines.length > 1 && /^\d/.test(lines[lines.length - 1])) ? 70 : 0;
    const bw = o.w || round(tw + arrowW + 60), bh = round(lines.length * fs * 1.15 + 34);
    const key = ['sign', kind, text, bw, o.arrow || '', dmg, seed].join(':');
    const R = CS();
    const board = (lit) => cached(key + (lit ? ':lit' : ''), (bw + 8) * R, (bh + 8) * R, (g) => {
      g.scale(R, R); g.translate(4, 4);
      const r = NS.rng(seed * 11 + 5);
      if (!lit) {
        g.fillStyle = bg; g.beginPath(); roundRect(g, 0, 0, bw, bh, 12); g.fill();
        // weathering
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.15})`; g.beginPath(); g.ellipse(r() * bw, r() * bh, 4 + r() * 20, 2 + r() * 8, r() * 3, 0, TAU); g.fill(); }
        const sh = g.createLinearGradient(0, 0, 0, bh); sh.addColorStop(0, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
        g.fillStyle = sh; g.beginPath(); roundRect(g, 0, 0, bw, bh, 12); g.fill();
      }
      g.strokeStyle = lit ? '#ffffff' : fg; g.lineWidth = 4; g.beginPath(); roundRect(g, 7, 7, bw - 14, bh - 14, 8); g.stroke();
      g.fillStyle = lit ? '#ffffff' : fg; g.font = NS.font(fs, F.title); g.textBaseline = 'alphabetic';
      const hasDist = lines.length > 1 && /^\d/.test(lines[lines.length - 1]);
      lines.forEach((l, i) => {
        const isDist = hasDist && i === lines.length - 1;
        g.textAlign = isDist ? 'right' : 'left';
        g.fillText(l, isDist ? bw - 26 : 26 + (o.arrow && !hasDist ? 0 : 0), 17 + fs * (i + 1) * 1.1 - 4);
      });
      if (o.arrow) {
        const ax = hasDist ? 26 + 30 : bw - 26 - arrowW / 2, ay = hasDist ? 17 + fs * lines.length * 1.1 - 4 - fs * 0.36 : bh / 2;
        g.save(); g.translate(ax, ay); g.rotate(o.arrow === 'up' ? -PI / 2 : o.arrow === 'left' ? PI : 0);
        g.beginPath(); g.moveTo(-22, -6); g.lineTo(4, -6); g.lineTo(4, -17); g.lineTo(23, 0); g.lineTo(4, 17); g.lineTo(4, 6); g.lineTo(-22, 6); g.closePath(); g.fill();
        g.restore();
      }
      if (!lit && dmg > 0) {
        // bullet holes with chipped rings, a bent corner
        for (let i = 0; i < floor(dmg * 7); i++) {
          const hx = 20 + r() * (bw - 40), hy = 14 + r() * (bh - 28);
          g.fillStyle = 'rgba(220,220,220,0.75)'; g.beginPath(); g.arc(hx, hy, 6, 0, TAU); g.fill();
          g.fillStyle = '#0b0c0e'; g.beginPath(); g.arc(hx, hy, 3, 0, TAU); g.fill();
        }
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.moveTo(bw, bh - 40 * dmg); g.lineTo(bw, bh); g.lineTo(bw - 50 * dmg, bh); g.closePath(); g.fill();
        g.fillStyle = 'rgba(140,60,20,0.35)';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(r() * bw, bh - r() * 20, 6 + r() * 12, 3, 0, 0, TAU); g.fill(); }
      }
    }, true);
    const ph = o.h == null ? 150 : o.h;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rot || 0);
    // posts
    if (o.posts !== false) {
      ctx.fillStyle = '#1a1d22';
      for (const px of [-bw * 0.3, bw * 0.3]) { ctx.fillRect(px - 5, -ph - bh / 2, 10, ph + bh / 2); ctx.fillStyle = 'rgba(160,170,190,0.25)'; ctx.fillRect(px - 5, -ph - bh / 2, 2, ph + bh / 2); ctx.fillStyle = '#1a1d22'; }
    }
    ctx.drawImage(board(false), -bw / 2 - 4, -ph - bh - 4, bw + 8, bh + 8);
    const lit = o.lit || 0;
    if (lit > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(lit);
      ctx.drawImage(board(true), -bw / 2 - 4, -ph - bh - 4, bw + 8, bh + 8);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    return { w: bw, h: bh, top: y - ph - bh };
  }

  // ================================================================================================ the van
  // Side view, facing right, ground at y = 0, ~470 units long at s = 1. Body cached per damage step.
  const VAN = { ox: 260, oy: 330, w: 520, h: 360 };
  function vanBody(dq, crashed) {
    const R = CS() * 1.25;
    const key = 'van:body:' + dq + ':' + (crashed ? 1 : 0);
    return cached(key, VAN.w * R, VAN.h * R, (g) => {
      g.scale(R, R); g.translate(VAN.ox, VAN.oy);
      const r = NS.rng(1987);
      const ox = '#561820', bone = '#a69878', trim = '#aeb2ba', dark = '#0c0d10';
      const nose = crashed ? 196 : 232;     // crushed front
      // ---- roof rack load (behind the body outline)
      g.fillStyle = '#16181c';
      g.fillRect(-206, -268, 300, 6);
      for (const px of [-196, -110, -20, 70]) g.fillRect(px, -268, 5, 18);
      // tarp bundle
      g.fillStyle = '#25332a';
      g.beginPath(); g.moveTo(-196, -268); g.bezierCurveTo(-190, -318, -90, -322, -60, -300); g.bezierCurveTo(-40, -322, 20, -312, 26, -268); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(160,190,170,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-180, -290); g.bezierCurveTo(-140, -312, -100, -308, -70, -296); g.stroke();
      g.strokeStyle = '#0b0c0e'; g.lineWidth = 4; g.beginPath(); g.moveTo(-150, -270); g.lineTo(-146, -312); g.moveTo(-30, -270); g.lineTo(-26, -306); g.stroke();
      // bass case strapped on top
      g.fillStyle = '#0e0f12';
      g.beginPath(); g.moveTo(30, -268); g.lineTo(34, -284); g.bezierCurveTo(60, -296, 80, -276, 100, -286); g.lineTo(150, -288); g.quadraticCurveTo(160, -280, 152, -270); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(200,200,210,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(40, -284); g.bezierCurveTo(62, -294, 82, -276, 100, -284); g.lineTo(150, -286); g.stroke();
      // ---- body outline
      const bp = new Path2D();
      bp.moveTo(-232, -44); bp.lineTo(-232, -236); bp.quadraticCurveTo(-232, -252, -216, -252);
      bp.lineTo(110, -252); bp.quadraticCurveTo(124, -252, 130, -240);
      bp.lineTo(crashed ? 160 : 172, -164);
      bp.lineTo(nose - 8, crashed ? -150 : -154); bp.quadraticCurveTo(nose, -150, nose, -134);
      bp.lineTo(nose + 2, -60); bp.lineTo(nose - 6, -44);
      // wheel arches
      bp.lineTo(198, -44); bp.arc(146, -44, 52, 0, PI, true);
      bp.lineTo(-90, -44); bp.arc(-142, -44, 52, 0, PI, true);
      bp.closePath();
      // lower: oxblood, upper: bone, split at the belt line y = -156
      g.save(); g.clip(bp);
      let lg = g.createLinearGradient(0, -156, 0, -40);
      lg.addColorStop(0, css(shade(ox, 0.12))); lg.addColorStop(0.5, ox); lg.addColorStop(1, css(shade(ox, -0.45)));
      g.fillStyle = lg; g.fillRect(-250, -160, 520, 140);
      lg = g.createLinearGradient(0, -256, 0, -156);
      lg.addColorStop(0, css(shade(bone, 0.15))); lg.addColorStop(0.15, bone); lg.addColorStop(1, css(shade(bone, -0.25)));
      g.fillStyle = lg; g.fillRect(-250, -260, 520, 104);
      // primer-grey replacement panel (rear quarter)
      g.fillStyle = '#55544f'; g.fillRect(-232, -156, 82, 108);
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let i = 0; i < 30; i++) g.fillRect(-232 + r() * 82, -156 + r() * 108, 2 + r() * 6, 1 + r() * 2);
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(-232, -156, 82, 3);
      // panel seams / door lines
      g.strokeStyle = 'rgba(10,8,8,0.7)'; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-60, -246); g.lineTo(-60, -156); g.moveTo(36, -246); g.lineTo(36, -156);
      g.moveTo(-60, -150); g.lineTo(-60, -60); g.moveTo(36, -150); g.lineTo(36, -60);
      g.moveTo(130, -240); g.lineTo(132, -44);
      g.moveTo(-150, -156); g.lineTo(-150, -48);
      g.stroke();
      // rust around the arches + mud along the sills
      for (let i = 0; i < 26; i++) {
        const side = r() < 0.5 ? -142 : 146, a = PI * 1.05 + r() * PI * 0.9, d = 54 + r() * 6;
        const rx = side + cos(a) * d, ry = -44 + sin(a) * d;
        const rg = g.createLinearGradient(rx, ry, rx, ry + 10 + r() * 22);
        rg.addColorStop(0, `rgba(${100 + r() * 30},${45 + r() * 15},18,${0.35 + r() * 0.25})`); rg.addColorStop(1, 'rgba(90,40,15,0)');
        g.fillStyle = rg; g.fillRect(rx - 1.5, ry, 2 + r() * 3, 12 + r() * 20);
      }
      for (let i = 0; i < 120; i++) {
        g.fillStyle = `rgba(${40 + r() * 20},${30 + r() * 15},20,${0.25 + r() * 0.4})`;
        const mx = -232 + r() * 470, my = -44 - pow(r(), 2.5) * 50;
        g.beginPath(); g.ellipse(mx, my, 1 + r() * 4, 1 + r() * 2.5, 0, 0, TAU); g.fill();
      }
      // dents (all levels have a couple; more with damage)
      const nd = 2 + floor(dq * 10);
      for (let i = 0; i < nd; i++) {
        const dx = lerp(-200, nose - 30, dq > 0.4 && i % 2 ? 0.7 + r() * 0.3 : r()), dy = -70 - r() * 160, rr = 10 + r() * 22;
        const dg = g.createRadialGradient(dx - rr * 0.3, dy - rr * 0.3, 0, dx, dy, rr);
        dg.addColorStop(0, 'rgba(0,0,0,0.45)'); dg.addColorStop(0.7, 'rgba(0,0,0,0.12)'); dg.addColorStop(1, 'rgba(255,255,255,0.08)');
        g.fillStyle = dg; g.beginPath(); g.ellipse(dx, dy, rr, rr * 0.8, r(), 0, TAU); g.fill();
      }
      // scrapes
      if (dq > 0) {
        g.strokeStyle = `rgba(220,210,190,${0.25 + dq * 0.3})`; g.lineWidth = 1;
        for (let i = 0; i < floor(dq * 18); i++) { const sx = -200 + r() * 360, sy = -60 - r() * 90; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 40 + r() * 90, sy + (r() - 0.5) * 8); g.stroke(); }
      }
      // crushed front
      if (crashed || dq >= 0.75) {
        g.fillStyle = 'rgba(10,8,8,0.75)';
        g.beginPath(); g.moveTo(nose - 50, -160); g.lineTo(nose - 28, -120); g.lineTo(nose - 40, -90); g.lineTo(nose - 20, -60); g.lineTo(nose + 10, -40); g.lineTo(nose + 10, -170); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(230,200,190,0.35)'; g.lineWidth = 1.5;
        g.beginPath(); for (let i = 0; i < 7; i++) { g.moveTo(nose - 54 + i * 7, -150 + r() * 10); g.lineTo(nose - 44 + i * 6, -64 - r() * 10); } g.stroke();
      }
      // rim light: moon along the roof and the rear corner
      g.restore();
      g.save(); g.clip(bp);
      g.strokeStyle = 'rgba(190,210,255,0.55)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(-232, -120); g.lineTo(-232, -236); g.quadraticCurveTo(-232, -252, -216, -252); g.lineTo(110, -252); g.quadraticCurveTo(124, -252, 130, -240); g.stroke();
      g.restore();
      // belt-line chrome trim
      g.fillStyle = trim; g.fillRect(-232, -158, nose - 10 + 232, 3);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-232, -158, nose - 10 + 232, 1);
      // ---- windows
      const win = (pts) => { const p = new Path2D(); p.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) p.lineTo(q[0], q[1]); p.closePath(); return p; };
      const wins = [
        win([[-206, -236], [-122, -236], [-122, -172], [-206, -172]]),
        win([[-112, -236], [-66, -236], [-66, -172], [-112, -172]]),
        win([[-52, -236], [28, -236], [28, -172], [-52, -172]]),
        win([[44, -238], [118, -238], [crashed ? 142 : 154, -170], [44, -170]]),
      ];
      wins.forEach((p, i) => {
        g.fillStyle = '#0a0f1a'; g.fill(p);
        g.save(); g.clip(p);
        const wg = g.createLinearGradient(0, -240, 0, -170);
        wg.addColorStop(0, 'rgba(70,90,130,0.35)'); wg.addColorStop(1, 'rgba(20,26,40,0)');
        g.fillStyle = wg; g.fillRect(-220, -240, 400, 70);
        g.fillStyle = 'rgba(200,215,240,0.12)';
        g.beginPath(); g.moveTo(-220 + i * 30, -240); g.lineTo(-180 + i * 30, -240); g.lineTo(-240 + i * 30 + 120, -170); g.lineTo(-280 + i * 30 + 120, -170); g.fill();
        g.fillStyle = 'rgba(200,215,240,0.07)';
        g.beginPath(); g.moveTo(-150 + i * 40, -240); g.lineTo(-140 + i * 40, -240); g.lineTo(-100 + i * 40, -170); g.lineTo(-110 + i * 40, -170); g.fill();
        // cracks with damage
        if ((dq >= 0.5 && (i === 2 || i === 3)) || (dq >= 1 && i === 1) || (crashed && i === 3)) {
          g.strokeStyle = 'rgba(210,225,255,0.5)'; g.lineWidth = 0.9;
          const cx = i === 3 ? 100 : -10 - (i === 1 ? 80 : 0), cy = -206;
          for (let a = 0; a < TAU; a += 0.55 + r() * 0.5) { g.beginPath(); g.moveTo(cx, cy); let px = cx, py = cy; for (let j = 0; j < 4; j++) { px += cos(a + (r() - 0.5) * 0.5) * 14; py += sin(a + (r() - 0.5) * 0.5) * 12; g.lineTo(px, py); } g.stroke(); }
          g.beginPath(); g.arc(cx, cy, 9, 0, TAU); g.stroke();
        }
        g.restore();
        g.strokeStyle = '#0c0c0f'; g.lineWidth = 4; g.stroke(p);
      });
      // side mirror, handles, fuel cap
      g.fillStyle = dark;
      g.fillRect(120, -196, 6, 20); g.beginPath(); roundRect(g, 124, -214, 22, 30, 4); g.fill();
      g.fillStyle = 'rgba(160,180,220,0.4)'; g.fillRect(128, -210, 3, 22);
      g.fillStyle = '#1a1b1f'; g.fillRect(96, -146, 20, 5); g.fillRect(-40, -146, 20, 5);
      g.beginPath(); g.arc(-200, -120, 9, 0, TAU); g.fill();
      // rear ladder
      g.strokeStyle = '#121317'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-238, -60); g.lineTo(-238, -262); g.moveTo(-246, -60); g.lineTo(-246, -262);
      for (let ly = -80; ly > -262; ly -= 22) { g.moveTo(-246, ly); g.lineTo(-238, ly); }
      g.stroke();
      // bumpers, grille, lamps
      g.fillStyle = '#9aa0aa'; g.beginPath(); roundRect(g, nose - 22, -66, 34, 18, 4); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(nose - 20, -64, 30, 2);
      g.fillStyle = '#2a2c30'; g.beginPath(); roundRect(g, -246, -66, 26, 18, 4); g.fill();
      g.fillStyle = '#0d0e11'; g.fillRect(nose - 8, -118, 10, 46);
      g.strokeStyle = '#4a4d55'; g.lineWidth = 1.5; g.beginPath(); for (let gy2 = -114; gy2 < -74; gy2 += 7) { g.moveTo(nose - 8, gy2); g.lineTo(nose + 2, gy2); } g.stroke();
      g.fillStyle = '#d8dce6'; g.beginPath(); g.arc(nose - 6, -134, 11, 0, TAU); g.fill();      // headlight bezel
      g.fillStyle = crashed || dq >= 1 ? '#262a33' : '#fff6dc'; g.beginPath(); g.arc(nose - 6, -134, 8, 0, TAU); g.fill();
      g.fillStyle = '#d98a1a'; g.fillRect(nose - 12, -148, 10, 6);
      g.fillStyle = '#6a0c10'; g.fillRect(-236, -118, 8, 26);
      // bumper stickers on the rear corner
      const st = ['#d8cfb0', '#e8262e', '#ffd23f', '#16223d'];
      st.forEach((c, i) => { g.fillStyle = c; g.save(); g.translate(-226 + i * 3, -100 + i * 12); g.fillRect(0, 0, 4, 10); g.restore(); });
      // zombie splats on the front with damage
      if (dq >= 0.5) {
        for (let i = 0; i < 1 + floor(dq * 2); i++) {
          const sx = nose - 30 - r() * 90, sy = -90 - r() * 80, ss = 0.2 + r() * 0.12;
          g.save(); g.translate(sx, sy); g.rotate(r() * TAU);
          g.drawImage(splatSpr(i % 6, '#18240f'), -128 * ss, -128 * ss, 256 * ss, 256 * ss);
          g.restore();
        }
      }
      // undercarriage shadow
      g.fillStyle = '#060607'; g.fillRect(-200, -46, 400, 8);
    });
  }
  // the band logo: "NO SURVIVORS" in Metal Mania, bone on oxblood with a red drop and black outline
  function vanLogo(g, x, y, w) {
    const fs = fitSize(g, 'SURVIVORS', F.logo, 64, w);
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = NS.font(fs * 0.62, F.logo);
    g.lineJoin = 'round';
    const lines = [['NO', y - fs * 0.78, fs * 0.62], ['SURVIVORS', y, fs]];
    for (const [tx, ty, sz] of lines) {
      g.font = NS.font(sz, F.logo);
      g.fillStyle = '#e8262e'; g.fillText(tx, x + 3, ty + 3);
      g.strokeStyle = '#08070a'; g.lineWidth = sz * 0.1; g.strokeText(tx, x, ty);
      g.fillStyle = '#efe6cf'; g.fillText(tx, x, ty);
    }
    g.restore();
  }
  function vanLogoSpr() {
    return cached('van:logo', 520, 200, (g) => {
      g.translate(260, 100);
      vanLogo(g, 0, 40, 440);
      // a slash of white paint drips under the logo
      drips(g, -200, 200, 50, 12, 40, '#efe6cf', 0.6, 4, 3);
    }, true);
  }
  function wheelDraw(ctx, x, y, rot, spin, s, hubcap) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#08090b'; ctx.beginPath(); ctx.arc(0, 0, 41, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,130,150,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 37, PI * 1.05, PI * 1.6); ctx.stroke();
    // tread notches rotating
    ctx.strokeStyle = 'rgba(40,42,48,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 18; i++) { const a = rot + i * TAU / 18; ctx.moveTo(cos(a) * 34, sin(a) * 34); ctx.lineTo(cos(a) * 40, sin(a) * 40); }
    ctx.stroke();
    ctx.fillStyle = hubcap ? '#5d626c' : '#2c2e33'; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill();
    ctx.fillStyle = hubcap ? '#8a909a' : '#43464d'; ctx.beginPath(); ctx.arc(-3, -3, 20, 0, TAU); ctx.fill();
    const blur = clamp(spin);
    ctx.fillStyle = css('#2a2c32', 1 - blur * 0.7);
    for (let i = 0; i < 5; i++) { const a = rot + i * TAU / 5; ctx.beginPath(); ctx.arc(cos(a) * 13, sin(a) * 13, 4.5, 0, TAU); ctx.fill(); }
    if (blur > 0.05) { ctx.strokeStyle = css('#2a2c32', blur * 0.5); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#1a1b1f'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // kit.van(ctx, x, y, s, {face, wheel (radians), spin 0..1 (motion blur), damage 0..1, crashed, headlights 0..1, beams,
  //   taillights, bounce (body lift, units), tilt (radians), crew (silhouettes in the windows), smoke, t | S, flicker})
  //   -> {headlight: [x, y], tail: [x, y], wheels: [[x, y], [x, y]], driver: [x, y], roof: [x, y], bbox}
  function van(ctx, x, y, s, o) {
    o = o || {};
    s = s || 1;
    const face = o.face || 1, dmg = clamp(o.damage || 0), crashed = !!o.crashed;
    const dq = round(dmg * 4) / 4;
    const t = o.t != null ? o.t : tOf(o.S), rot = o.wheel || 0, bounce = o.bounce || 0, tilt = o.tilt == null ? (crashed ? -0.05 : 0) : o.tilt;
    const hl = o.headlights == null ? 1 : o.headlights;
    const nose = crashed ? 196 : 232;
    const pt = (px, py) => { const cx2 = px, cy2 = py - bounce; const rx = cx2 * cos(tilt) - cy2 * sin(tilt), ry = cx2 * sin(tilt) + cy2 * cos(tilt); return [x + rx * s * face, y + ry * s]; };
    const res = { headlight: pt(nose - 6, -134), tail: pt(-232, -105), wheels: [[x - 142 * s * face, y - 40 * s], [x + 146 * s * face, y - 40 * s]], driver: pt(84, -204), roof: pt(-60, -270), bbox: [x - 250 * s, y - 330 * s, 500 * s, 330 * s] };
    ctx.save();
    // ground shadow + headlight pool first
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.ellipse(x, y + 2 * s, 250 * s, 10 * s, 0, 0, TAU); ctx.fill();
    // wheels (behind the body's arches)
    const spin = o.spin || 0;
    for (const [i, wx] of [[0, -142], [1, 146]]) {
      ctx.save(); ctx.translate(x + wx * s * face, y - 40 * s + (crashed && i === 1 ? 6 * s : 0)); ctx.scale(s * face, s);
      wheelDraw(ctx, 0, 0, rot * face, spin, s, !(dmg >= 0.5 && i === 0));
      ctx.restore();
    }
    // body
    ctx.save();
    ctx.translate(x, y); ctx.scale(s * face, s); ctx.rotate(tilt * face); ctx.translate(0, -bounce);
    ctx.drawImage(vanBody(dq, crashed), -VAN.ox, -VAN.oy, VAN.w, VAN.h);
    // logo (font-dependent: separate cache), flipped back so it always reads left to right
    ctx.save();
    ctx.translate(-20, -104); if (face < 0) ctx.scale(-1, 1);
    ctx.drawImage(vanLogoSpr(), -170, -66, 340, 131);
    ctx.restore();
    // crew silhouettes in the windows (driver: Granny's beehive; shotgun: Vex's pompadour)
    if (o.crew) {
      ctx.save();
      ctx.fillStyle = '#05060a';
      const hx = 84, hy = -186;
      ctx.beginPath(); ctx.ellipse(hx, hy, 13, 15, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx - 2, hy - 28, 13, 22, -0.08, 0, TAU); ctx.fill();      // beehive
      ctx.fillRect(hx - 18, hy + 10, 36, 20);
      ctx.fillStyle = css(C.granny, 0.9); ctx.fillRect(hx + 4, hy - 4, 9, 3);              // glasses glint
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#05060a';
      ctx.beginPath(); ctx.ellipse(-12, -190, 12, 14, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-6, -206, 15, 8, 0.4, 0, TAU); ctx.fill();               // pompadour
      ctx.restore();
    }
    // interior dash glow
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 120, -176, 40, '#9fe8ff', 0.25 * (o.dash == null ? 1 : o.dash));
    // lamps
    let hk = hl;
    if (crashed || dmg >= 1) hk *= o.flicker === false ? 0.6 : 0.5 * (hash(floor(t * 10), 7) < 0.7 ? 1 : 0.1);
    if (hk > 0.01) {
      drawGlow(ctx, nose - 6, -134, 26, '#fff6dc', hk, 'hot');
      drawGlow(ctx, nose - 6, -134, 90, '#ffe6b0', 0.35 * hk);
    }
    if (o.taillights !== false) drawGlow(ctx, -232, -105, 40, '#ff2020', 0.55 * (o.taillights == null ? 1 : o.taillights));
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // beams (world space so they are not flipped twice)
    if (hk > 0.01 && o.beams !== false) {
      ctx.globalCompositeOperation = 'lighter';
      const [bx, by] = res.headlight, ang = face > 0 ? 0.07 + tilt : PI - 0.07 + tilt;
      beamRaw(ctx, bx, by, ang + face * 0.02, 0.34, 820 * s, '#fff1d0', 0.55 * hk, { motes: o.motes || 0, t, seed: 3 });
      beamRaw(ctx, bx, by, ang + face * 0.04, 0.6, 520 * s, '#ffe2b0', 0.12 * hk, { motes: 0 });
      // pool on the road ahead
      ctx.save(); ctx.translate(bx + face * 420 * s, y); ctx.scale(1, 0.12); drawGlow(ctx, 0, 0, 360 * s, '#ffe6b0', 0.4 * hk, 'flat'); ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
    // smoke / steam from the hood when wrecked
    if (o.smoke || crashed || dmg >= 0.75) {
      const sp = pt(nose - 40, -160);
      smoke(ctx, { t }, { x: sp[0], y: sp[1], size: 34 * s, rise: 50 * s, k: crashed ? 0.55 : 0.4, color: '#6a6e78', seed: 5, w: 30 * s, wind: 12 });
    }
    ctx.restore();
    return res;
  }

  // ================================================================================================ Lou's mark
  // kit.symbol(ctx, x, y, size, color, k, {weight, ticks, glow, bg, fill, rot}) a clock face at 3:00 whose hands make an L.
  //   (x, y) = centre, size = diameter. fill: a solid disc with the hands knocked out in `bg` (stamps, pins).
  function symbol(ctx, x, y, size, color, k, o) {
    o = o || {};
    k = k == null ? 1 : k;
    if (k <= 0.003) return;
    color = color || NS.WHO.LOU;
    const r = size / 2, lw = max(0.8, size * (o.weight || 0.085));
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.globalAlpha *= k;
    if (o.glow) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, r * 2.2, typeof o.glow === 'string' ? o.glow : color, 0.45 * (typeof o.glow === 'number' ? o.glow : 1));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'miter';
    if (o.fill) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = o.bg || '#000'; ctx.lineWidth = lw * 1.25;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.lineTo(0, 0); ctx.lineTo(r * 0.47, 0); ctx.stroke();
      ctx.lineWidth = lw * 0.55; ctx.beginPath(); ctx.arc(0, 0, r - lw * 1.1, 0, TAU); ctx.stroke();
    } else {
      if (o.bg) { ctx.fillStyle = o.bg; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(0, 0, r - lw / 2, 0, TAU); ctx.stroke();
      if (o.ticks) {
        ctx.lineWidth = lw * 0.55;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) { if (i % 3) continue; const a = i * TAU / 12 - PI / 2; if (i === 0 || i === 3) continue; ctx.moveTo(cos(a) * r * 0.66, sin(a) * r * 0.66); ctx.lineTo(cos(a) * r * 0.8, sin(a) * r * 0.8); }
        ctx.stroke();
      }
      ctx.lineWidth = lw * 1.2;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.lineTo(0, 0); ctx.lineTo(r * 0.47, 0); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================================================ clocks
  // kit.clock(ctx, x, y, r, {style 'wall'|'dash'|'station', digital, text, color, k (backlight/glow), crack, grime, rot, sec})
  //   Always stopped at 3:00 (minute hand up, hour hand right). digital: an LED readout ("3:00" or opts.text).
  function clock(ctx, x, y, r, o) {
    o = o || {};
    if (o.digital) return clockDigital(ctx, x, y, r, o);
    const style = o.style || 'wall', k = o.k == null ? 0.6 : o.k;
    const rq = max(8, round(r / 4) * 4), R = CS() * 1.25;
    const key = ['clock', style, rq, o.crack ? 1 : 0, o.grime == null ? 1 : o.grime, o.color || ''].join(':');
    const n = ceil(rq * 2.3);
    const img = cached(key, n * R, n * R, (g) => {
      g.scale(R, R); g.translate(n / 2, n / 2);
      const rr = rq;
      const dash = style === 'dash';
      // bezel
      const bz = g.createLinearGradient(-rr, -rr, rr, rr);
      bz.addColorStop(0, dash ? '#d8dde6' : '#3a3d44'); bz.addColorStop(0.5, dash ? '#6a707a' : '#15171b'); bz.addColorStop(1, dash ? '#aab0ba' : '#2a2d33');
      g.fillStyle = bz; g.beginPath(); g.arc(0, 0, rr * 1.1, 0, TAU); g.fill();
      // face
      const face = dash ? '#0c0e12' : (o.color || '#ece6d6');
      const fg = g.createRadialGradient(-rr * 0.3, -rr * 0.3, 0, 0, 0, rr);
      fg.addColorStop(0, css(shade(face, 0.08))); fg.addColorStop(1, css(shade(face, dash ? -0.2 : -0.18)));
      g.fillStyle = fg; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
      const ink = dash ? '#e8f4ea' : '#141414';
      // ticks + numerals
      g.strokeStyle = ink; g.fillStyle = ink;
      for (let i = 0; i < 60; i++) {
        const a = i * TAU / 60 - PI / 2, big = i % 5 === 0;
        g.lineWidth = rr * (big ? 0.045 : 0.018);
        g.beginPath(); g.moveTo(cos(a) * rr * (big ? 0.8 : 0.87), sin(a) * rr * (big ? 0.8 : 0.87)); g.lineTo(cos(a) * rr * 0.93, sin(a) * rr * 0.93); g.stroke();
      }
      g.font = NS.font(rr * (dash ? 0.26 : 0.24), dash ? F.hud : F.title); g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) {
        if (dash && i % 3) continue;
        const a = i * TAU / 12 - PI / 2;
        g.fillText(String(i), cos(a) * rr * 0.64, sin(a) * rr * 0.64 + rr * 0.01);
      }
      // hands: 3:00 exactly (hour right, minute up), second hand stuck at 12
      g.lineCap = 'round';
      g.strokeStyle = ink;
      g.lineWidth = rr * 0.075; g.beginPath(); g.moveTo(-rr * 0.08, 0); g.lineTo(rr * 0.48, 0); g.stroke();
      g.lineWidth = rr * 0.05; g.beginPath(); g.moveTo(0, rr * 0.1); g.lineTo(0, -rr * 0.76); g.stroke();
      g.strokeStyle = dash ? '#ff8a1f' : '#c8202a'; g.lineWidth = rr * 0.018;
      g.beginPath(); g.moveTo(0, rr * 0.2); g.lineTo(0, -rr * 0.84); g.stroke();
      g.fillStyle = dash ? '#ff8a1f' : '#c8202a'; g.beginPath(); g.arc(0, 0, rr * 0.05, 0, TAU); g.fill();
      // grime + glass
      const gr = o.grime == null ? 1 : o.grime;
      if (gr > 0 && !dash) {
        const gg = g.createRadialGradient(0, 0, rr * 0.4, 0, 0, rr);
        gg.addColorStop(0, 'rgba(60,50,30,0)'); gg.addColorStop(1, `rgba(60,50,30,${0.35 * gr})`);
        g.fillStyle = gg; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.beginPath(); g.ellipse(-rr * 0.3, -rr * 0.42, rr * 0.55, rr * 0.22, -0.6, 0, TAU); g.fill();
      if (o.crack) {
        const r2 = NS.rng(rq + 5);
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = max(0.7, rr * 0.012);
        const cx = rr * 0.35, cy = rr * 0.25;
        for (let a = 0; a < TAU; a += 0.7 + r2() * 0.5) { g.beginPath(); g.moveTo(cx, cy); let px = cx, py = cy; for (let j = 0; j < 3; j++) { px += cos(a + (r2() - 0.5) * 0.6) * rr * 0.22; py += sin(a + (r2() - 0.5) * 0.6) * rr * 0.22; g.lineTo(px, py); } g.stroke(); }
      }
    }, true);
    ctx.save();
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
    ctx.drawImage(img, -n / 2 * r / rq, -n / 2 * r / rq, n * r / rq, n * r / rq);
    if (style === 'dash' && k > 0) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, 0, r * 1.3, '#7dffb0', 0.18 * k); }
    ctx.restore();
  }
  function clockDigital(ctx, x, y, r, o) {
    const text = o.text || '3:00', col = o.color || '#ff3b2f', k = o.k == null ? 1 : o.k;
    const h = r, fs = h * 1.25;
    const g0 = mctx();
    const tw = measure(g0, text.replace(/[0-9]/g, '8'), fs, F.hud);
    const bw = tw + h * 0.7, bh = h * 1.6;
    const key = ['dclock', text, round(h), col].join(':'), R = CS() * 1.25;
    const img = cached(key, (bw + 20) * R, (bh + 20) * R, (g) => {
      g.scale(R, R); g.translate(10, 10);
      g.fillStyle = '#070709'; g.beginPath(); roundRect(g, 0, 0, bw, bh, h * 0.15); g.fill();
      g.strokeStyle = '#2a2c32'; g.lineWidth = 2; g.stroke();
      g.font = NS.font(fs, F.hud); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = css(col, 0.08); g.fillText(text.replace(/[0-9]/g, '8'), bw / 2, bh / 2 + h * 0.05);
      g.shadowColor = css(col, 0.9); g.shadowBlur = h * 0.3;
      g.fillStyle = css(mix(col, '#ffffff', 0.25)); g.fillText(text, bw / 2, bh / 2 + h * 0.05);
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(2, 2, bw - 4, bh * 0.35);
    }, true);
    ctx.save();
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
    ctx.drawImage(img, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20);
    if (k > 0) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, 0, bw * 0.75, col, 0.25 * k); }
    ctx.restore();
    return { w: bw, h: bh };
  }

  // ================================================================================================ posters
  const INK = '#1a1614', RED = '#c3242c';
  // shared: cached poster sprites with a margin for tape / shadow
  function posterSprite(kind, w, h, o, fn) {
    const R = CS() * (o.res || 1.5), M = 24;
    const key = ['poster', kind, round(w), round(h), o.seed || 1, o.torn || 0, o.weather == null ? 0.5 : o.weather, o.fade || 0, o.tape === false ? 0 : 1, o.lines ? o.lines.join('|') : '', o.night || NS.night].join(':');
    return { c: cached(key, (w + M * 2) * R, (h + M * 2) * R, (g) => {
      g.scale(R, R); g.translate(M, M);
      const seed = o.seed || 1, torn = o.torn || 0, wea = o.weather == null ? 0.5 : o.weather;
      // soft drop shadow (cache-time blur only)
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 14; g.shadowOffsetX = 3; g.shadowOffsetY = 6;
      g.beginPath(); const cut = raggedRect(g, w, h, seed, 2.5, torn); g.fillStyle = '#000'; g.fill();
      g.restore();
      g.save();
      g.beginPath(); raggedRect(g, w, h, seed, 2.5, torn); g.clip();
      fn(g, w, h, seed);
      // fade (sun) + weather
      if (o.fade) { g.fillStyle = css('#efe3c4', 0.45 * o.fade); g.fillRect(0, 0, w, h); }
      if (wea > 0) {
        stains(g, w, h, seed + 4, 2 + floor(wea * 3), wea);
        creases(g, w, h, seed + 5, 2 + floor(wea * 2), 0.5 + wea * 0.5);
        const vg = g.createRadialGradient(w / 2, h / 2, min(w, h) * 0.3, w / 2, h / 2, max(w, h) * 0.75);
        vg.addColorStop(0, 'rgba(40,30,10,0)'); vg.addColorStop(1, `rgba(40,30,10,${0.35 * wea})`);
        g.fillStyle = vg; g.fillRect(0, 0, w, h);
        drips(g, 0, w, 0, floor(wea * 6), h * 0.5, '#3a2a10', 0.12 * wea, seed + 6, 10);
      }
      g.restore();
      // peeling corner flap
      if (cut > 0) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath(); g.moveTo(w - cut, h); g.lineTo(w, h - cut); g.lineTo(w - cut * 0.55, h - cut * 0.55 + 6); g.closePath(); g.fill();
        g.fillStyle = '#d8ceb4';
        g.beginPath(); g.moveTo(w - cut, h); g.lineTo(w, h - cut); g.lineTo(w - cut * 0.62, h - cut * 0.62); g.closePath(); g.fill();
      }
      // tape strips
      if (o.tape !== false) {
        const r = NS.rng(seed * 3 + 1);
        const tapes = [[0, 0, -0.7], [w, 0, 0.7], [0, h, 0.7], [w - (cut ? cut : 0), h, -0.7]];
        tapes.forEach(([tx, ty, a], i) => {
          if (r() < 0.25 && i > 1) return;
          g.save(); g.translate(tx, ty); g.rotate(a + (r() - 0.5) * 0.3);
          g.fillStyle = 'rgba(214,200,160,0.82)'; g.fillRect(-26, -10, 52, 20);
          g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(-26, -10, 52, 4);
          g.restore();
        });
      }
    }, true), M };
  }
  // fill text centred at (cx, baseline y), fitting width maxW; returns the cap height used
  function textLine(g, text, fam, cap, cx, y, maxW, color, o) {
    o = o || {};
    let sz = sizeForCap(cap, fam);
    sz = fitSize(g, text, fam, sz, maxW);
    g.font = NS.font(sz, fam); g.textAlign = o.align || 'center'; g.textBaseline = 'alphabetic';
    if (o.shadow) { g.fillStyle = o.shadow; g.fillText(text, cx + sz * 0.05, y + sz * 0.05); }
    if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = sz * (o.strokeW || 0.08); g.lineJoin = 'round'; g.strokeText(text, cx, y); }
    g.fillStyle = color; g.fillText(text, cx, y);
    return sz * capRatio(fam);
  }
  // misregistered two-ink print: draw fn twice (offset ink) for a screen-print look
  function poster(ctx, kind, x, y, w, h, o) {
    o = o || {};
    const tx = T();
    let sp;
    if (kind === 'gig') sp = posterSprite('gig', w, h, o, (g, w, h, seed) => {
      const L = o.lines || tx.gigPoster || ['LAST CALL LOU PRESENTS', 'NO SURVIVORS', 'THE ORPHEUM', 'FRI 30 OCT 1987 · ONE NIGHT ONLY', 'LIVE ON 1313 AM'];
      const paper = '#e6d7ae', cap = w * 0.076, mw = w * 0.88, cx = w / 2;
      paperFill(g, w, h, paper, seed, { age: 0.7 });
      // vertical budget (in cap units): top 2 lines, mark, band name, venue, date lines, bottom band
      const top = wrapWords(g, L[0], F.type, sizeForCap(cap, F.type), mw);
      const dl = wrapDots(g, L[3], F.title, sizeForCap(cap, F.title), mw);
      const bh = cap * 1.9, topH = h * 0.03 + top.length * cap * 1.45 + cap * 0.55;
      const lowH = cap * (2.25 + 1.95 + dl.length * 1.5 + 0.9);
      const free = h - topH - lowH - bh;
      const mr = clamp(free / 2.75, w * 0.1, w * 0.21), my = topH + free / 2;
      // sunburst rays (red ink) only in the band around the mark
      g.save();
      g.beginPath(); g.rect(0, topH - cap * 0.2, w, free + cap * 0.4); g.clip();
      g.translate(cx, my);
      g.fillStyle = css(RED, 0.85);
      for (let i = 0; i < 24; i++) { const a = i * TAU / 24; g.beginPath(); g.moveTo(cos(a - 0.05) * mr * 1.15, sin(a - 0.05) * mr * 1.15); g.lineTo(cos(a) * w, sin(a) * w); g.lineTo(cos(a + 0.07) * w, sin(a + 0.07) * w); g.closePath(); g.fill(); }
      g.restore();
      g.fillStyle = INK; g.fillRect(w * 0.05, topH - cap * 0.25, w * 0.9, 2); g.fillRect(w * 0.05, topH + free + cap * 0.2, w * 0.9, 2);
      g.fillStyle = css(paper); g.beginPath(); g.arc(cx, my, mr * 1.18, 0, TAU); g.fill();
      symbol(g, cx, my, mr * 2, INK, 1, { weight: 0.07 });
      let yy = h * 0.03;
      for (const t of top) { yy += cap * 1.45; textLine(g, t, F.type, cap, cx, yy, mw, INK); }
      yy = topH + free + cap * 2.25;
      textLine(g, L[1], F.logo, cap * 1.3, cx, yy, w * 0.92, INK, { shadow: RED });
      yy += cap * 1.95; textLine(g, L[2], F.title, cap * 1.2, cx, yy, mw, RED);
      for (const t of dl) { yy += cap * 1.5; textLine(g, t, F.title, cap, cx, yy, mw, INK); }
      // bottom band: LIVE ON 1313 AM
      g.fillStyle = INK; g.fillRect(0, h - bh, w, bh);
      textLine(g, L[4], F.type, cap, cx, h - bh / 2 + cap / 2, mw, paper);
      // print grain: misregistration speckle
      const r = NS.rng(seed + 77);
      for (let i = 0; i < w * h / 300; i++) { g.fillStyle = `rgba(230,215,174,${r() * 0.35})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    });
    else if (kind === 'missing') sp = posterSprite('missing', w, h, o, (g, w, h, seed) => {
      const L = o.lines || tx.missing || ['MISSING', 'SINCE 1987', 'LAST SEEN: THE ORPHEUM'];
      const paper = '#e9e8e1', cap = w * 0.076, mw = w * 0.9, cx = w / 2;
      paperFill(g, w, h, paper, seed, { age: 0.4, blotch: 0.6 });
      let yy = h * 0.03 + cap * 2.2;
      textLine(g, L[0], F.title, cap * 2.15, cx, yy, w * 0.94, INK);
      yy += cap * 1.62; textLine(g, L[1], F.title, cap, cx, yy, mw, RED);
      // the four faces, 2 x 2
      const who = ['vex', 'granny', 'tiny', 'noodle'];
      const names = who.map((k) => (kit.CAST && kit.CAST[k] && kit.CAST[k].name) || k.toUpperCase());
      const l2 = String(L[2]), ci = l2.indexOf(': '), lastLines = ci >= 0 ? [l2.slice(0, ci + 1), l2.slice(ci + 2)] : [l2];
      const bottom = h - h * 0.03 - lastLines.length * cap * 1.5;
      const gy0 = yy + cap * 0.7, cell = min((w * 0.86) / 2, (bottom - gy0 - cap * 1.3) / 2 - cap * 0.7), gx0 = cx - cell - w * 0.02;
      who.forEach((k, i) => {
        const px = gx0 + (i % 2) * (cell + w * 0.04), py = gy0 + floor(i / 2) * (cell + cap * 0.95);
        const isVex = k === 'vex';
        g.save();
        if (isVex) { g.translate(px + cell / 2, py + cell / 2); g.rotate(-0.04); g.translate(-px - cell / 2, -py - cell / 2); }
        g.fillStyle = isVex ? '#f5f3ee' : '#cfcdc6'; g.fillRect(px - 4, py - 4, cell + 8, cell + 8);
        if (kit.portrait) {
          try { kit.portrait(g, k, px, py, cell, isVex ? { style: 'photo', age: '1987', signed: true } : { style: 'xerox', age: '1987' }); }
          catch (e) { silhouette(g, k, px, py, cell); }
        } else silhouette(g, k, px, py, cell);
        if (isVex) {   // a glossy headshot taped on top
          g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(px, py); g.lineTo(px + cell * 0.5, py); g.lineTo(px, py + cell * 0.5); g.fill();
          g.fillStyle = 'rgba(214,200,160,0.8)'; g.save(); g.translate(px + cell / 2, py - 2); g.rotate(0.05); g.fillRect(-20, -7, 40, 14); g.restore();
        }
        g.restore();
        textLine(g, names[i], F.type, cap * 0.42, px + cell / 2, py + cell + cap * 0.62, cell, INK);
      });
      let ly = bottom;
      for (const t of lastLines) { ly += cap * 1.45; textLine(g, t, F.title, cap, cx, ly, mw, INK); }
      // photocopy toner noise + streak
      const r = NS.rng(seed + 9);
      for (let i = 0; i < w * h / 120; i++) { g.fillStyle = `rgba(20,20,20,${r() * 0.18})`; g.fillRect(r() * w, r() * h, 1.2, 1.2); }
      g.fillStyle = 'rgba(20,20,20,0.06)'; g.fillRect(w * (0.2 + r() * 0.6), 0, 3 + r() * 5, h);
    });
    else if (kind === 'condemned') sp = posterSprite('condemned', w, h, o, (g, w, h, seed) => {
      const L = o.lines || tx.condemned || ['CONDEMNED', 'FIRE · 31 OCT 1987 · 3:00 AM', 'UNSAFE STRUCTURE · CAPACITY 1,204 · NO ADMITTANCE', 'BY ORDER OF THE CITY'];
      const paper = '#f0ead8', cap = w * 0.072, mw = w * 0.86, cx = w / 2;
      paperFill(g, w, h, paper, seed, { age: 0.5 });
      // red header band
      const hb = cap * 2.9;
      g.fillStyle = RED; g.fillRect(0, 0, w, hb);
      textLine(g, L[0], F.title, cap * 1.75, cx, hb / 2 + cap * 0.88, w * 0.9, '#fbf4e4');
      g.fillStyle = INK; g.fillRect(w * 0.06, hb + cap * 0.35, w * 0.88, 3);
      let yy = hb + cap * 0.6;
      for (const t of wrapDots(g, L[1], F.type, sizeForCap(cap, F.type), mw)) { yy += cap * 1.6; textLine(g, t, F.type, cap, cx, yy, mw, INK); }
      yy += cap * 0.5;
      g.fillStyle = INK; g.fillRect(w * 0.3, yy, w * 0.4, 2);
      for (const t of wrapDots(g, L[2], F.type, sizeForCap(cap, F.type), mw)) { yy += cap * 1.6; textLine(g, t, F.type, cap, cx, yy, mw, t.indexOf('NO ') === 0 ? RED : INK); }
      // small print + seal + signature
      yy += cap * 1.5; textLine(g, L[3], F.type, cap * 0.62, cx, yy, mw, INK);
      const sy = min(h - cap * 2.2, yy + cap * 2.4);
      g.strokeStyle = css(RED, 0.8); g.lineWidth = 2.5;
      g.beginPath(); g.arc(w * 0.2, sy, cap * 1.35, 0, TAU); g.stroke();
      g.beginPath(); g.arc(w * 0.2, sy, cap * 1.05, 0, TAU); g.stroke();
      starPath(g, w * 0.2, sy, cap * 0.6, cap * 0.25); g.fillStyle = css(RED, 0.8); g.fill();
      g.strokeStyle = INK; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(w * 0.5, sy + cap * 0.3); g.bezierCurveTo(w * 0.56, sy - cap * 0.8, w * 0.6, sy + cap * 0.6, w * 0.66, sy - cap * 0.3); g.bezierCurveTo(w * 0.7, sy - cap * 0.6, w * 0.74, sy + cap * 0.4, w * 0.86, sy); g.stroke();
      g.fillRect(w * 0.48, sy + cap * 0.6, w * 0.42, 1.5);
      // soot from the fire at the bottom
      const sg = g.createLinearGradient(0, h, 0, h * 0.75);
      sg.addColorStop(0, 'rgba(20,14,10,0.55)'); sg.addColorStop(1, 'rgba(20,14,10,0)');
      g.fillStyle = sg; g.fillRect(0, h * 0.75, w, h * 0.25);
    });
    else if (kind === 'admit') sp = posterSprite('admit', w, h, Object.assign({ tape: false, weather: 0.15 }, o), (g, w, h, seed) => {
      const tk = (window.SCORE && window.SCORE.ticket && window.SCORE.ticket.lines) || ['ADMIT ONE · No. 1,205', 'NO SURVIVORS · THE ORPHEUM', 'NIGHT {next} · DOORS 3:00 AM'];
      const L = o.lines || tk.slice(0, 3).map((s2) => NS.fill(s2));
      const first = String(L[0]).split(' · ');
      g.fillStyle = '#131017'; g.fillRect(0, 0, w, h);
      const r = NS.rng(seed + 3);
      for (let i = 0; i < w * h / 80; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.04})`; g.fillRect(r() * w, r() * h, 1, 1); }
      const stub = w * 0.24, ink = C.uv;
      g.save();
      g.shadowColor = css(C.uv, 0.9); g.shadowBlur = h * 0.06;
      // perforation
      g.fillStyle = '#05040a';
      for (let py = 4; py < h; py += 9) { g.beginPath(); g.arc(stub, py, 2.2, 0, TAU); g.fill(); }
      symbol(g, stub / 2, h * 0.42, min(stub * 0.62, h * 0.5), ink, 1, { weight: 0.09 });
      const capS = h * 0.085;
      if (first[1]) textLine(g, first[1], F.type, capS, stub / 2, h * 0.86, stub * 0.88, ink);
      const cap = h * 0.2, bx = stub + (w - stub) / 2, mw = (w - stub) * 0.86;
      textLine(g, first[0], F.title, cap, bx, h * 0.38, mw, ink);
      textLine(g, L[1], F.type, h * 0.085, bx, h * 0.62, mw, ink);
      textLine(g, L[2], F.type, h * 0.085, bx, h * 0.82, mw, ink);
      g.restore();
      g.strokeStyle = css(C.uv, 0.6); g.lineWidth = 2; g.strokeRect(stub + 8, 8, w - stub - 16, h - 16);
    });
    else return null;
    const M = sp.M;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (o.rot) ctx.rotate(o.rot);
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx.drawImage(sp.c, -w / 2 - M, -h / 2 - M, w + M * 2, h + M * 2);
    if (kind === 'admit' && (o.k == null || o.k > 0)) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, w * 0.6, C.uv, 0.12 * (o.k == null ? 1 : o.k));
    }
    ctx.restore();
    return { rect: [x, y, w, h], minCap: posterMinCap(kind, w) };
  }
  // the smallest clue-text cap height on a poster drawn w wide (frame units, before any camera zoom)
  function posterMinCap(kind, w) { return w * (kind === 'admit' ? 0.04 : kind === 'condemned' ? 0.072 : 0.076); }
  poster.minCap = posterMinCap;
  // simple head-and-shoulders silhouettes (fallback when kit.portrait is missing)
  function silhouette(g, who, x, y, s) {
    g.fillStyle = '#bdbab2'; g.fillRect(x, y, s, s);
    g.fillStyle = '#2a2826';
    g.beginPath(); g.ellipse(x + s / 2, y + s * 1.02, s * 0.42, s * 0.3, 0, PI, 0); g.fill();
    g.beginPath(); g.ellipse(x + s / 2, y + s * 0.48, s * 0.2, s * 0.24, 0, 0, TAU); g.fill();
    if (who === 'granny') { g.beginPath(); g.ellipse(x + s / 2, y + s * 0.18, s * 0.17, s * 0.2, 0, 0, TAU); g.fill(); }
    if (who === 'vex') { g.beginPath(); g.ellipse(x + s * 0.54, y + s * 0.27, s * 0.2, s * 0.1, 0.3, 0, TAU); g.fill(); }
    if (who === 'tiny') { g.fillRect(x + s * 0.28, y + s * 0.22, s * 0.44, s * 0.12); }
    if (who === 'noodle') { g.beginPath(); g.arc(x + s / 2, y + s * 0.44, s * 0.27, PI, 0); g.fill(); }
  }

  // ================================================================================================ wristband
  // kit.wristband(ctx, x, y, s, k, {rot, curve, text}) a black vinyl band with UV-purple ADMIT ONE + Lou's mark, glowing.
  //   (x, y) = centre; s = band height (units); the printed cap height is 0.5 s (legible >= 14 units at s >= 28).
  function wristband(ctx, x, y, s, k, o) {
    o = o || {};
    k = k == null ? 1 : k;
    const text = o.text || (T().wristband) || 'ADMIT ONE';
    const sq = max(8, round(s / 4) * 4), R = CS() * (sq < 40 ? 2 : 1.25);
    const L = sq * 5.4, key = 'wb:' + sq + ':' + text;
    const build = (glow) => cached(key + (glow ? ':g' : ''), (L + sq) * R, (sq * 2.2) * R, (g) => {
      g.scale(R, R); g.translate((L + sq) / 2, sq * 1.1);
      const band = new Path2D();
      band.moveTo(-L / 2, -sq * 0.5); band.quadraticCurveTo(0, -sq * 0.62, L / 2, -sq * 0.5);
      band.lineTo(L / 2, sq * 0.5); band.quadraticCurveTo(0, sq * 0.38, -L / 2, sq * 0.5); band.closePath();
      if (!glow) {
        const bg = g.createLinearGradient(0, -sq / 2, 0, sq / 2);
        bg.addColorStop(0, '#2a2433'); bg.addColorStop(0.4, '#16121c'); bg.addColorStop(1, '#0a080d');
        g.fillStyle = bg; g.fill(band);
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = max(1, sq * 0.04);
        g.beginPath(); g.moveTo(-L / 2, -sq * 0.45); g.quadraticCurveTo(0, -sq * 0.57, L / 2, -sq * 0.45); g.stroke();
        // snap
        g.fillStyle = '#5a5862'; g.beginPath(); g.arc(L / 2 - sq * 0.45, 0, sq * 0.2, 0, TAU); g.fill();
        g.fillStyle = '#9a98a4'; g.beginPath(); g.arc(L / 2 - sq * 0.48, -sq * 0.04, sq * 0.08, 0, TAU); g.fill();
      } else { g.shadowColor = css(C.uv, 1); g.shadowBlur = sq * 0.35; }
      symbol(g, -L / 2 + sq * 0.62, 0, sq * 0.68, glow ? C.uvHot : C.uv, 1, { weight: 0.11 });
      const cap = sq * 0.5;
      textLine(g, text, F.title, cap, sq * 0.12, cap / 2, L - sq * 2.2, glow ? C.uvHot : C.uv);
    }, true);
    const base = build(false);
    ctx.save();
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
    const sc = s / sq;
    ctx.drawImage(base, -(L + sq) / 2 * sc, -sq * 1.1 * sc, (L + sq) * sc, sq * 2.2 * sc);
    if (k > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= clamp(k);
      ctx.drawImage(build(true), -(L + sq) / 2 * sc, -sq * 1.1 * sc, (L + sq) * sc, sq * 2.2 * sc);
      drawGlow(ctx, 0, 0, L * 0.55 * sc, C.uv, 0.3 * k);
    }
    ctx.restore();
    return { w: L * sc, h: s, cap: s * 0.5 };
  }

  // ================================================================================================ setlist
  // kit.setlist(ctx, x, y, w, h, {rot, seed, tape, char 0..1, light, alpha}) taped paper; header, songs, the encore
  //   underlined twice, in Vex's hand (Permanent Marker); charred bottom edge. Song cap height = setlist.minCap(w, h).
  function setlistLayout(w, h) {
    const sl = (window.SCORE && window.SCORE.setlist) || { header: 'NO SURVIVORS · THE ORPHEUM', songs: [], encore: '' };
    const g = mctx();
    const lh = h * 0.088, sz0 = lh * 0.92;
    let sz = sz0;
    for (const t of sl.songs.concat([sl.encore])) sz = min(sz, fitSize(g, t, F.hand, sz0, w * 0.88));
    return { sl, lh, sz, cap: sz * capRatio(F.hand) };
  }
  function setlist(ctx, x, y, w, h, o) {
    o = o || {};
    const seed = o.seed || 3, ch = o.char == null ? 1 : o.char, R = CS() * (o.res || 1.5), M = 30;
    const key = ['setlist', round(w), round(h), seed, ch, o.tape === false ? 0 : 1].join(':');
    const img = cached(key, (w + M * 2) * R, (h + M * 2) * R, (g) => {
      g.scale(R, R); g.translate(M, M);
      const { sl, lh, sz } = setlistLayout(w, h);
      const r = NS.rng(seed * 5 + 2);
      // paper with a charred bottom edge
      const paper = new Path2D();
      paper.moveTo(0, 0); paper.lineTo(w, 0);
      const burnY = h * (1 - 0.1 * ch);
      paper.lineTo(w, burnY);
      for (let i = 60; i >= 0; i--) paper.lineTo(w * i / 60, burnY + (noise1(i * 0.35, seed + 4) * 0.7 + noise1(i * 1.3, seed + 5) * 0.3) * h * 0.035 * ch + (r() < 0.12 ? -r() * h * 0.03 * ch : 0));
      paper.closePath();
      g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 10; g.shadowOffsetY = 5; g.fillStyle = '#000'; g.fill(paper); g.restore();
      g.save(); g.clip(paper);
      paperFill(g, w, h, '#efede6', seed, { age: 0.25, blotch: 0.5 });
      creases(g, w, h, seed + 2, 3, 0.8);
      // header (smaller), then songs, then the encore underlined twice
      const hsz = sz * 0.6;
      g.fillStyle = '#16151a'; g.font = NS.font(hsz, F.hand); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      let yy = h * 0.05;
      for (const t of wrapDots(g, sl.header, F.hand, hsz, w * 0.86)) { yy += hsz * 1.25; g.fillText(t, w * 0.07, yy); }
      g.fillRect(w * 0.07, yy + hsz * 0.35, w * 0.5, max(1.5, hsz * 0.06));
      yy += lh * 0.35;
      const hand = (t, yy2, i) => {
        g.save();
        g.translate(w * 0.08 + (r() - 0.5) * w * 0.02, yy2);
        g.rotate(-0.025 + (r() - 0.5) * 0.02);
        g.transform(1, 0, -0.08, 1, 0, 0);
        g.font = NS.font(sz, F.hand); g.fillStyle = '#121116';
        g.fillText(t, 0, 0);
        const tw = g.measureText(t).width;
        g.restore();
        return tw;
      };
      sl.songs.forEach((t, i) => { yy += lh; hand(t, yy, i); });
      yy += lh * 1.25;
      const ew = hand(sl.encore, yy, 9);
      g.strokeStyle = '#121116'; g.lineWidth = max(2, sz * 0.07); g.lineCap = 'round';
      for (const dy of [sz * 0.2, sz * 0.36]) {
        g.beginPath(); g.moveTo(w * 0.07, yy + dy); g.bezierCurveTo(w * 0.07 + ew * 0.3, yy + dy + 3, w * 0.07 + ew * 0.7, yy + dy - 3, w * 0.09 + ew, yy + dy + 1); g.stroke();
      }
      // char gradient along the burnt edge
      const cg = g.createLinearGradient(0, burnY + h * 0.03, 0, burnY - h * 0.12);
      cg.addColorStop(0, 'rgba(18,8,4,0.98)'); cg.addColorStop(0.25, 'rgba(70,32,10,0.7)'); cg.addColorStop(0.6, 'rgba(140,90,40,0.25)'); cg.addColorStop(1, 'rgba(140,90,40,0)');
      g.fillStyle = cg; g.fillRect(0, burnY - h * 0.12, w, h * 0.2);
      g.restore();
      g.strokeStyle = 'rgba(255,120,40,0.35)'; g.lineWidth = 1.2; g.stroke(paper);
      // gaffer tape
      if (o.tape !== false) {
        for (const [tx, a] of [[w * 0.12, -0.12], [w * 0.88, 0.1]]) {
          g.save(); g.translate(tx, 2); g.rotate(a);
          g.fillStyle = '#26272c'; g.fillRect(-w * 0.13, -h * 0.03, w * 0.26, h * 0.06);
          g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(-w * 0.13, -h * 0.03, w * 0.26, h * 0.012);
          g.restore();
        }
      }
    }, true);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); if (o.rot) ctx.rotate(o.rot);
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx.drawImage(img, -w / 2 - M, -h / 2 - M, w + M * 2, h + M * 2);
    if (o.light) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, 0, 0, max(w, h) * 0.7, o.lightColor || '#fff1d0', 0.2 * o.light); }
    ctx.restore();
    return { rect: [x, y, w, h], cap: setlistLayout(w, h).cap };
  }
  setlist.minCap = (w, h) => setlistLayout(w, h).cap;

  // ================================================================================================ graffiti
  const SYM = /([★♥→—])/;
  function symShape(g, ch, x, y, sz, color) {
    g.save(); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = sz * 0.1; g.lineCap = 'round'; g.lineJoin = 'round';
    const c = sz * 0.36;
    if (ch === '★') { starPath(g, x + c, y - c, c * 1.05, c * 0.45, -PI / 2 + 0.1); g.fill(); }
    else if (ch === '♥') { g.beginPath(); g.moveTo(x + c, y - c * 0.1); g.bezierCurveTo(x - c * 0.4, y - c * 1.2, x + c * 0.3, y - c * 2.2, x + c, y - c * 1.4); g.bezierCurveTo(x + c * 1.7, y - c * 2.2, x + c * 2.4, y - c * 1.2, x + c, y - c * 0.1); g.fill(); }
    else if (ch === '→') { g.beginPath(); g.moveTo(x, y - c); g.lineTo(x + c * 2.2, y - c); g.moveTo(x + c * 1.5, y - c * 1.6); g.lineTo(x + c * 2.3, y - c); g.lineTo(x + c * 1.5, y - c * 0.4); g.stroke(); }
    else if (ch === '—') { g.beginPath(); g.moveTo(x + c * 0.2, y - c * 0.9); g.lineTo(x + c * 2, y - c); g.stroke(); }
    g.restore();
    return ch === '★' ? c * 2.3 : ch === '♥' ? c * 2.2 : c * 2.5;
  }
  // kit.graffiti(ctx, text | {text, who, struck, signature}, x, y, {size, color, rot, font 'hand'|'stencil'|'spray', drip 0..1,
  //   k (reveal 0..1, left to right), seed, align 'left'|'center', struck, strikeColor, signature, alpha, maxW})
  //   size = font size (cap height is about 0.72 size for 'hand'). Returns {w, h} of the text block.
  function graffiti(ctx, text, x, y, o) {
    o = Object.assign({}, o || {});
    if (text && typeof text === 'object') {
      const e = text;
      text = e.text; if (o.color == null && e.who) o.color = NS.WHO[e.who];
      if (o.struck == null) o.struck = e.struck; if (o.signature == null) o.signature = e.signature;
    }
    text = NS.fill(String(text || ''));
    if (o.signature) text = text.replace(/\s*★\s*$/, '');
    const size = o.size || 64, col = o.color || '#e8e2d0', font = o.font || 'hand', seed = o.seed == null ? 1 : o.seed;
    const drip = o.drip == null ? (font === 'hand' ? 0.25 : 0.5) : o.drip;
    const fam = font === 'stencil' ? F.title : F.hand;
    const g0 = mctx();
    // measure with symbols
    const parts = text.split(SYM).filter((p) => p !== '');
    let tw = 0;
    for (const p of parts) tw += SYM.test(p) && p.length === 1 ? size * 0.36 * (p === '★' ? 2.3 : p === '♥' ? 2.2 : 2.5) : measure(g0, p, size, fam);
    const sigW = o.signature ? size * 2.2 : 0;
    const bw = tw + sigW + size * 0.6, bh = size * 2.4, R = CS() * (o.res || 1.25);
    const key = ['graf', text, round(size), col, font, seed, round(drip * 10), o.struck ? 1 : 0, o.strikeColor || '', o.signature ? 1 : 0].join(':');
    const img = cached(key, bw * R, bh * R, (g) => {
      g.scale(R, R);
      const bx = size * 0.3, by = size * 1.05;
      const r = NS.rng(seed * 13 + text.length);
      const drawText = (color, alpha, dx, dy, jitter) => {
        let cx = bx + dx;
        const rr = NS.rng(seed * 7 + 1);
        g.fillStyle = css(color, alpha);
        for (const p of parts) {
          if (SYM.test(p) && p.length === 1) { cx += symShape(g, p, cx, by + dy, size, css(color, alpha)); continue; }
          g.font = NS.font(size, fam); g.textBaseline = 'alphabetic'; g.textAlign = 'left';
          if (jitter) {
            for (const chr of p) {
              const cw = g.measureText(chr).width;
              g.save(); g.translate(cx + cw / 2, by + dy + (rr() - 0.5) * size * 0.06); g.rotate((rr() - 0.5) * 0.08);
              g.fillText(chr, -cw / 2, 0); g.restore();
              cx += cw;
            }
          } else { g.fillText(p, cx, by + dy); cx += g.measureText(p).width; }
        }
      };
      if (font === 'spray' || font === 'stencil') {
        g.shadowColor = css(col, 0.7); g.shadowBlur = size * 0.12;
        drawText(col, 0.55, 0, 0, false);
        g.shadowBlur = 0;
        // overspray speckle
        for (let i = 0; i < tw * 1.2; i++) { g.fillStyle = css(col, r() * 0.35); g.fillRect(bx + r() * tw, by - size * (0.9 + r() * 0.2) + r() * size * 1.1, 1.3, 1.3); }
      }
      drawText(col, 0.95, 0, 0, font === 'hand');
      if (font === 'stencil') {
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        g.fillRect(bx - 4, by - size * 0.4, tw + 8, max(1.5, size * 0.05));
        g.globalCompositeOperation = 'source-over';
      }
      // marker texture: lighter streaks inside the strokes
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < tw / 6; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.08})`; g.fillRect(bx + r() * tw, by - size * 0.8 + r() * size * 0.8, 6 + r() * 14, 1.5); }
      g.globalCompositeOperation = 'source-over';
      // drips
      const nd = floor(text.length * drip * 0.7);
      for (let i = 0; i < nd; i++) {
        const dx = bx + r() * tw, L = size * (0.25 + r() * (font === 'hand' ? 0.6 : 1.0)), dw = size * (font === 'hand' ? 0.05 : 0.07) * (0.6 + r() * 0.6);
        const dg = g.createLinearGradient(0, by - size * 0.1, 0, by + L);
        dg.addColorStop(0, css(col, 0.9)); dg.addColorStop(0.85, css(col, 0.75)); dg.addColorStop(1, css(col, 0.4));
        g.fillStyle = dg;
        g.beginPath(); g.moveTo(dx - dw / 2, by - size * 0.12); g.lineTo(dx + dw / 2, by - size * 0.12); g.lineTo(dx + dw * 0.4, by + L); g.arc(dx, by + L, dw * 0.55, 0, PI); g.closePath(); g.fill();
      }
      if (o.signature && kit.CAST && kit.CAST.vex && kit.CAST.vex.sign) kit.CAST.vex.sign(g, bx + tw + size * 0.25, by - size * 1.0, size * 1.9, col, 1);
      if (o.struck) {
        const sc = o.strikeColor || NS.WHO.VEX;
        g.strokeStyle = css(sc, 0.95); g.lineWidth = size * 0.11; g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx - size * 0.1, by - size * 0.32);
        for (let i = 1; i <= 6; i++) g.lineTo(bx + tw * i / 6, by - size * 0.32 + (i % 2 ? -1 : 1) * size * 0.12);
        g.stroke();
      }
    }, true);
    const k = o.k == null ? 1 : clamp(o.k);
    if (k <= 0) return { w: tw + sigW, h: size };
    ctx.save();
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    const ox = o.align === 'center' ? -(tw + sigW) / 2 : 0;
    // (x, y) is the text baseline start (or centre with align: 'center')
    const sx = -size * 0.3 + ox, sy = -size * 1.05;
    if (k < 1) { ctx.beginPath(); ctx.rect(sx, sy, size * 0.3 + (tw + sigW) * k, bh); ctx.clip(); }
    ctx.drawImage(img, sx, sy, bw, bh);
    ctx.restore();
    return { w: tw + sigW, h: size };
  }

  // ================================================================================================ tally marks
  // kit.tallyMarks(ctx, x, y, w, h, {count, seed, color, colors: [...], size, k (reveal 0..1 by rows), alpha}) -> {count}
  //   groups of five (four strokes + a slash), hand-drawn rows; the whole block is cached, so thousands draw fast.
  function tallyMarks(ctx, x, y, w, h, o) {
    o = o || {};
    const seed = o.seed || 1, size = o.size || 26, cols = o.colors || [o.color || '#d8d2c0'];
    const cw = round(w), chh = round(h), R = CS();
    const key = ['tally', cw, chh, seed, size, cols.join(','), o.count || 0].join(':');
    let total = 0;
    const img = cached(key, cw * R, chh * R, (g, cv) => {
      g.scale(R, R);
      const r = NS.rng(seed * 11 + 5);
      g.lineCap = 'round';
      const rowH = size * 1.45, gw = size * 0.95, gap = size * 0.55;
      let n = 0;
      const limit = o.count || 1e9;
      for (let ry = size * 0.2; ry + size < chh && n < limit; ry += rowH) {
        const slant = (r() - 0.5) * 0.05;
        let rx = r() * size * 0.5;
        const hand = floor(r() * cols.length);
        while (rx + gw < cw && n < limit) {
          const c = cols[(hand + (r() < 0.15 ? 1 : 0)) % cols.length];
          g.strokeStyle = css(c, 0.72 + r() * 0.25);
          g.lineWidth = size * (0.075 + r() * 0.03);
          const by = ry + (rx * slant) + (r() - 0.5) * 3;
          const m = min(5, limit - n);
          g.beginPath();
          for (let i = 0; i < min(4, m); i++) {
            const mx = rx + i * gw / 4 + (r() - 0.5) * 2.5, tilt = (r() - 0.5) * size * 0.12;
            g.moveTo(mx + tilt, by + (r() - 0.5) * 3); g.lineTo(mx - tilt * 0.5, by + size + (r() - 0.5) * 4);
          }
          if (m === 5) { g.moveTo(rx - gw * 0.12, by + size * (0.7 + r() * 0.2)); g.lineTo(rx + gw * 0.95, by + size * (0.15 + r() * 0.2)); }
          g.stroke();
          n += m;
          rx += gw + gap * (0.8 + r() * 0.5);
        }
      }
      cv.meta = { count: n };
    });
    const e = CACHE.get(key); total = (e && e.c.meta && e.c.meta.count) || 0;
    const k = o.k == null ? 1 : clamp(o.k);
    ctx.save();
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    if (k < 1) { ctx.beginPath(); ctx.rect(x, y, w, h * k); ctx.clip(); }
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return { count: total };
  }

  // ================================================================================================ onomatopoeia
  function burstPath(g, rx, ry, seed, n) {
    const r = NS.rng(seed * 5 + 3);
    n = n || 16;
    g.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = i / (n * 2) * TAU + (r() - 0.5) * 0.12, out = i % 2 === 0;
      const rr = out ? 1 + r() * 0.28 : 0.68 + r() * 0.08;
      const px = cos(a) * rx * rr, py = sin(a) * ry * rr;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
  }
  // kit.onomatopoeia(ctx, text, x, y, {size, color, rot, k (0..1 life: pop in, hold, fade), burst, burstColor, outline, seed})
  function onomatopoeia(ctx, text, x, y, o) {
    o = o || {};
    const k = o.k == null ? 0.5 : o.k;
    if (k <= 0 || k >= 1) return;
    const size = o.size || 110, col = o.color || C.tiny, seed = o.seed || 1, sq = round(size / 10) * 10;
    const burst = o.burst !== false, bcol = o.burstColor || '#fff7e0', out = o.outline || '#0c0a0e';
    const g0 = mctx(), tw = measure(g0, text, sq, F.comic);
    const bw = tw + sq * 1.6, bh = sq * 2.1, R = CS() * 1.25;
    const key = ['ono', text, sq, col, burst ? bcol : 0, out, seed].join(':');
    const img = cached(key, bw * R, bh * R, (g) => {
      g.scale(R, R); g.translate(bw / 2, bh / 2);
      if (burst) {
        burstPath(g, bw * 0.47, bh * 0.44, seed, 14);
        g.fillStyle = bcol; g.fill(); g.strokeStyle = out; g.lineWidth = sq * 0.06; g.lineJoin = 'round'; g.stroke();
      }
      g.font = NS.font(sq, F.comic); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.fillStyle = out; g.fillText(text, sq * 0.06, sq * 0.1);
      g.strokeStyle = out; g.lineWidth = sq * 0.16; g.strokeText(text, 0, sq * 0.04);
      const tg = g.createLinearGradient(0, -sq * 0.4, 0, sq * 0.45);
      tg.addColorStop(0, css(shade(col, 0.45))); tg.addColorStop(0.45, col); tg.addColorStop(1, css(shade(col, -0.25)));
      g.fillStyle = tg; g.fillText(text, 0, sq * 0.04);
    }, true);
    const pop = k < 0.12 ? NS.ease.outBack(k / 0.12) : 1;
    const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    const sc = size / sq * pop * (1 + (k > 0.12 ? (k - 0.12) * 0.12 : 0));
    ctx.save();
    ctx.translate(x, y); ctx.rotate((o.rot == null ? -0.08 : o.rot) + (k < 0.12 ? (1 - k / 0.12) * 0.2 : 0));
    ctx.scale(sc, sc);
    ctx.globalAlpha *= fade;
    ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  // ================================================================================================ text in the world
  // kit.textWorld(ctx, text, x, y, {size, font (an NS.F key or family), color, align, persp (-1..1: right side smaller
  //   when > 0), rot, skew, glow (color), k (alpha), outline, outlineW, w (max width)})  x, y = anchor at the text middle
  function textWorld(ctx, text, x, y, o) {
    o = o || {};
    const size = o.size || 60, fam = F[o.font] || o.font || F.title, col = o.color || '#efe6cf';
    const g0 = mctx();
    let sz = size;
    if (o.w) sz = fitSize(g0, text, fam, size, o.w);
    const sq = max(8, round(sz / 4) * 4), tw = measure(g0, text, sq, fam), bw = tw + sq * 0.8, bh = sq * 1.7, R = CS() * 1.25;
    const pk = !!o.persp, key = ['tw', text, sq, fam, col, o.outline || '', pk ? '' : (o.glow || '')].join(':');
    const img = cached(key, bw * R, bh * R, (g) => {
      g.scale(R, R);
      g.font = NS.font(sq, fam); g.textAlign = 'center'; g.textBaseline = 'middle';
      if (o.glow && !pk) { g.shadowColor = o.glow; g.shadowBlur = sq * 0.3; }
      if (o.outline) { g.strokeStyle = o.outline; g.lineWidth = sq * (o.outlineW || 0.1); g.lineJoin = 'round'; g.strokeText(text, bw / 2, bh / 2); }
      g.fillStyle = col; g.fillText(text, bw / 2, bh / 2);
    }, true);
    const sc = sz / sq, k = o.k == null ? 1 : o.k;
    ctx.save();
    ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
    if (o.skew) ctx.transform(1, 0, o.skew, 1, 0, 0);
    ctx.globalAlpha *= k;
    const p = o.persp || 0, wd = bw * sc, ht = bh * sc;
    const ax = o.align === 'left' ? 0 : o.align === 'right' ? -wd : -wd / 2;
    if (!p) ctx.drawImage(img, ax, -ht / 2, wd, ht);
    else {
      if (o.glow) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.translate(ax + wd / 2, 0); ctx.scale(wd / ht * 0.62, 1 - abs(p) * 0.25);
        drawGlow(ctx, 0, 0, ht * 0.75, o.glow, 0.55, 'soft');
        ctx.restore();
      }
      const n = 28, sw = img.width / n;
      let px = ax;
      const tot = (() => { let s = 0; for (let i = 0; i < n; i++) s += 1 - abs(p) * 0.5 * (p > 0 ? (i + 0.5) / n : 1 - (i + 0.5) / n); return s; })();
      const unit = wd / tot;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, f = 1 - abs(p) * 0.5 * (p > 0 ? u : 1 - u);
        const cw = unit * f;
        ctx.drawImage(img, i * sw, 0, sw, img.height, px, -ht / 2 * f, cw + 0.35, ht * f);
        px += cw;
      }
    }
    ctx.restore();
  }

  // ================================================================================================ light
  // additive volumetric beam (assumes the caller set 'lighter'); dust motes drift along it
  function beamRaw(ctx, x, y, ang, spread, len, color, k, o) {
    o = o || {};
    if (k <= 0.003) return;
    const spr = coneSpr(color, 'beam');
    drawCone(ctx, spr, x, y, ang, spread, len, k * (o.core === false ? 1.25 : 1));
    if (o.core !== false) drawCone(ctx, spr, x, y, ang, spread * 0.6, len * 0.8, k * 0.3);
    const n = o.motes == null ? 22 : o.motes;
    if (n > 0) {
      const t = o.t || 0, seed = o.seed || 1, ts = tan(min(1.3, spread));
      const mc = css(mix(color, '#ffffff', 0.55));
      ctx.fillStyle = mc;
      const ga = ctx.globalAlpha;
      for (let i = 0; i < n; i++) {
        const a = 0.06 + 0.9 * fract(hash(i, seed) + t * 0.025 * (0.4 + hash(i, seed + 1)));
        const ac = (hash(i, seed + 2) * 2 - 1) * 0.85 + noise1(t * 0.4 + i, seed) * 0.12;
        const dist = a * len, off = ac * ts * dist;
        const px = x + cos(ang) * dist - sin(ang) * off, py = y + sin(ang) * dist + cos(ang) * off;
        const tw = 0.5 + 0.5 * sin(t * 2.6 + i * 1.7);
        const al = k * (1 - a) * (1 - abs(ac)) * tw * 1.4;
        if (al < 0.02) continue;
        ctx.globalAlpha = ga * min(1, al);
        const sz = 1.2 + hash(i, seed + 3) * 1.8;
        ctx.fillRect(px, py, sz, sz);
      }
      ctx.globalAlpha = ga;
    }
  }
  // kit.beam(ctx, x, y, angle, spread, len, color, k, {motes, t, seed})
  function beam(ctx, x, y, ang, spread, len, color, k, o) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    beamRaw(ctx, x, y, ang, spread, len, color || '#fff4dc', k == null ? 1 : k, o);
    ctx.restore();
  }
  // kit.darkness(ctx, k, lights, {color, x, y, w, h, res}): a darkness layer (alpha k) with soft cut-outs.
  //   lights: [{type: 'cone', x, y, angle, spread, len, k}, {type: 'radial', x, y, r, k, soft}]  (frame units)
  function darkness(ctx, k, lights, o) {
    o = o || {};
    const x = o.x || 0, y = o.y || 0, w = o.w || W, h = o.h || H, res = o.res || 0.5;
    const sw = max(8, round(w * res * CS())), sh = max(8, round(h * res * CS()));
    const c = scratch('dark', sw, sh), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, sw, sh);
    g.fillStyle = css(o.color || '#020308', clamp(k)); g.fillRect(0, 0, sw, sh);
    g.setTransform(sw / w, 0, 0, sh / h, -x * sw / w, -y * sh / h);
    g.globalCompositeOperation = 'destination-out';
    const cut = coneSpr('#ffffff', 'cut');
    for (const L of lights || []) {
      const lk = L.k == null ? 1 : L.k;
      if (lk <= 0.01) continue;
      if (L.type === 'cone') {
        drawCone(g, cut, L.x, L.y, L.angle || 0, L.spread || 0.32, L.len || 520, lk);
        drawGlow(g, L.x, L.y, (L.len || 520) * 0.08, '#ffffff', lk * 0.8, 'flat');
      } else drawGlow(g, L.x, L.y, L.r || 120, '#ffffff', lk, L.soft ? 'soft' : 'flat');
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
    ctx.drawImage(c, x, y, w, h);
  }
  // kit.flicker(t, seed, amount) -> 0..1 bulb brightness: steady with a slow wobble, a faint buzz and short
  //   sputters (about one every 2 s, dips <= 0.5 x amount; flash-safe for a room light)
  function flicker(t, seed, amount) {
    seed = seed || 1; const am = amount == null ? 1 : amount;
    let v = 0.9 + 0.07 * noise1(t * 1.7, seed) + 0.03 * noise1(t * 13, seed + 1);
    const slot = floor(t * 4), hv = hash(slot, seed + 2), ph = t * 4 - slot;
    if (hv < 0.13) v -= am * 0.5 * bump(0.05, 0.15, 0.55, 0.8, ph) * (0.75 + 0.25 * sin(t * 47 + seed));
    return clamp(v);
  }

  // ================================================================================================ flashes & particles
  function flashSpr(v) {
    return cached('fx:muzzle:' + v, 256, 128, (g) => {
      const r = NS.rng(v * 19 + 4);
      g.translate(20, 64);
      const petals = [[0, 1, 0.34]];
      const np = 4 + floor(r() * 3);
      for (let i = 0; i < np; i++) petals.push([(r() - 0.5) * 1.9, 0.3 + r() * 0.45, 0.16 + r() * 0.12]);
      const layer = (col, sc, a) => {
        g.fillStyle = css(col, a);
        for (const [ang, L, wd] of petals) {
          const len = 220 * L * sc, ww = 60 * wd * sc;
          g.save(); g.rotate(ang);
          g.beginPath(); g.moveTo(0, -ww * 0.5); g.quadraticCurveTo(len * 0.45, -ww, len, 0); g.quadraticCurveTo(len * 0.45, ww, 0, ww * 0.5); g.closePath(); g.fill();
          g.restore();
        }
      };
      layer('#ff7a1a', 1, 0.8); layer('#ffc04a', 0.72, 0.95); layer('#fff6d8', 0.45, 1);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 40); grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, 'rgba(255,230,180,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.fill();
    });
  }
  // kit.muzzleFlash(ctx, x, y, angle, k, seed, {s (1 = 230 units long), S}) (additive; k multiplied by flashK)
  function muzzleFlash(ctx, x, y, angle, k, seed, o) {
    o = o || {};
    const kk = clamp(k == null ? 1 : k) * (o.S ? fk(o.S) : (NS.reduced ? 0.5 : 1));
    if (kk <= 0.01) return;
    const s = (o.s || 1) * (0.8 + 0.2 * kk);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, x, y, 170 * s, '#ffb060', 0.55 * kk);
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.globalAlpha = kk;
    ctx.drawImage(flashSpr(floor(abs(seed || 0)) % 4), -20 * s, -64 * s, 256 * s, 128 * s);
    ctx.restore();
  }
  // kit.sparks(ctx, S, {x, y, t0, seed, count, spread, angle, speed, gravity, life, color, floorY, len, s})
  function sparks(ctx, S, o) {
    o = o || {};
    const t = tOf(S), age0 = t - (o.t0 == null ? 0 : o.t0), life = o.life || 0.7;
    if (age0 < 0 || age0 > life * 1.4) return;
    const n = o.count || 26, seed = o.seed || 1, sp = o.spread == null ? 1.1 : o.spread, ang = o.angle == null ? -PI / 2 : o.angle;
    const v0 = o.speed || 520, gr = o.gravity == null ? 1100 : o.gravity, col = o.color || C.fireHot, s = o.s || 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    if (age0 < 0.1) drawGlow(ctx, o.x, o.y, 70 * s, col, (1 - age0 / 0.1) * 0.8 * fk(S), 'hot');
    for (let i = 0; i < n; i++) {
      const li = life * (0.45 + 0.55 * hash(i, seed + 1));
      if (age0 > li) continue;
      const v = v0 * (0.35 + 0.65 * hash(i, seed + 2)) * s, a = ang + (hash(i, seed + 3) - 0.5) * 2 * sp;
      const vx = cos(a) * v, vy = sin(a) * v;
      let px = o.x + vx * age0, py = o.y + vy * age0 + 0.5 * gr * s * age0 * age0;
      let qx = vx, qy = vy + gr * s * age0;
      if (o.floorY != null && py > o.floorY) { py = o.floorY - (py - o.floorY) * 0.25; qy = -qy * 0.3; }
      const L = (o.len || 0.035);
      const fade = 1 - age0 / li;
      ctx.strokeStyle = css(i % 3 ? col : '#ffffff', fade);
      ctx.lineWidth = (2 + hash(i, seed + 4) * 2.2) * s;
      ctx.beginPath(); ctx.moveTo(px - qx * L * 1.4, py - qy * L * 1.4); ctx.lineTo(px, py); ctx.stroke();
      if (i % 2 === 0) drawGlow(ctx, px, py, 9 * s, col, fade * 0.7, 'hot');
    }
    ctx.restore();
  }
  function puffSpr(color) {
    return cached('fx:puff:' + color, 96, 96, (g) => {
      const r = NS.rng(5), cc = rgb(color);
      for (let i = 0; i < 7; i++) {
        const x = 48 + (r() - 0.5) * 30, y = 48 + (r() - 0.5) * 30, rr = 18 + r() * 22;
        const grd = g.createRadialGradient(x, y, 0, x, y, rr);
        grd.addColorStop(0, css(shade(cc, (r() - 0.5) * 0.25), 0.5)); grd.addColorStop(0.6, css(cc, 0.3)); grd.addColorStop(1, css(cc, 0));
        g.fillStyle = grd; g.fillRect(0, 0, 96, 96);
      }
    });
  }
  // kit.smoke(ctx, S, {x, y, w, rate, life, rise, size, grow, color, k, wind, seed, t0, dur, lit: color})
  function smoke(ctx, S, o) {
    o = o || {};
    const t = tOf(S), rate = o.rate || 5, life = o.life || 3, rise = o.rise == null ? 60 : o.rise, size = o.size || 40;
    const col = o.color || '#3a3d48', k = o.k == null ? 0.6 : o.k, wind = o.wind == null ? 18 : o.wind, seed = o.seed || 1;
    const t0 = o.t0 == null ? -1e9 : o.t0, t1 = o.dur == null ? 1e9 : t0 + o.dur, w = o.w || 20, grow = o.grow == null ? 2.2 : o.grow;
    const spr = puffSpr(col);
    ctx.save();
    const i0 = floor(max(t0, t - life) * rate), i1 = floor(min(t, t1) * rate);
    for (let i = i0; i <= i1; i++) {
      const te = (i + hash(i, seed) * 0.8) / rate, age = t - te;
      if (age < 0 || age > life || te < t0 || te > t1) continue;
      const q = age / life;
      const px = o.x + (hash(i, seed + 1) - 0.5) * w + wind * age + noise1(age * 0.8 + i, seed) * size * 0.5;
      const py = o.y - rise * age * (1 - q * 0.3);
      const rr = size * (0.5 + q * grow) * (0.7 + hash(i, seed + 2) * 0.6);
      ctx.globalAlpha = k * pow(sin(PI * min(1, q * 1.4 + 0.02)), 0.7) * (1 - q * 0.4);
      ctx.save(); ctx.translate(px, py); ctx.rotate(hash(i, seed + 3) * TAU + age * 0.3);
      ctx.drawImage(spr, -rr, -rr, rr * 2, rr * 2);
      ctx.restore();
    }
    if (o.lit) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1;
      drawGlow(ctx, o.x, o.y - size, size * 3, o.lit, 0.2 * k);
    }
    ctx.restore();
  }
  // kit.embers(ctx, S, {x, y, w, h, count, seed, color, k, rise, swirl, size})  (x, y = top-left of the rising region)
  function embers(ctx, S, o) {
    o = o || {};
    const t = tOf(S), n = o.count || 40, seed = o.seed || 1, col = o.color || C.fireHot, k = o.k == null ? 1 : o.k;
    const x = o.x || 0, y = o.y || 0, w = o.w || W, h = o.h || H, rise = o.rise || 70, sw = o.swirl == null ? 30 : o.swirl, sz = o.size || 1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const per = h / rise * (0.7 + 0.6 * hash(i, seed));
      const q = fract(t / per + hash(i, seed + 1));
      const ex = x + hash(i, seed + 2) * w + sin(t * (0.8 + hash(i, seed + 3)) + i) * sw * q + q * sw;
      const ey = y + h - q * h;
      const fl = 0.55 + 0.45 * sin(t * (9 + hash(i, seed + 4) * 8) + i * 2.1);
      const a = k * (1 - q) * sstep(0, 0.08, q) * fl;
      if (a < 0.02) continue;
      const r = (2 + hash(i, seed + 5) * 3) * sz;
      drawGlow(ctx, ex, ey, r * 4, col, a * 0.6, 'hot');
      ctx.fillStyle = css('#fff1c0', a); ctx.fillRect(ex - 0.8 * sz, ey - 0.8 * sz, 1.6 * sz, 1.6 * sz);
    }
    ctx.restore();
  }
  // comic ink splat sprite (256 px), sickly green-black with a thin bile rim: a lobed blob, round droplets, teardrops
  function splatSpr(v, color) {
    return cached('fx:splat:' + v + ':' + color, 256, 256, (g) => {
      const c = rgb(color);
      const shapes = (grow) => {
        const rr = NS.rng(v * 31 + 9), p = new Path2D(), R = 46 * grow, lobes = 5 + floor(rr() * 3), ph = rr() * TAU;
        const n = 72;
        for (let i = 0; i <= n; i++) {
          const a = i / n * TAU;
          const k = 1 + 0.22 * sin(a * lobes + ph) + 0.08 * sin(a * (lobes + 2) + ph * 1.7);
          const px = 128 + cos(a) * R * k, py = 128 + sin(a) * R * k;
          if (i) p.lineTo(px, py); else p.moveTo(px, py);
        }
        p.closePath();
        for (let i = 0; i < 7; i++) {
          const a = rr() * TAU, d = R * (1.25 + rr() * 0.75), dr = R * (0.08 + rr() * 0.14) * grow;
          p.moveTo(128 + cos(a) * d + dr, 128 + sin(a) * d); p.arc(128 + cos(a) * d, 128 + sin(a) * d, dr, 0, TAU);
        }
        for (let i = 0; i < 4; i++) {   // teardrops flung outward
          const a = rr() * TAU, d0 = R * 0.8, d1 = R * (1.5 + rr() * 0.6), w = R * (0.09 + rr() * 0.06) * grow;
          const ex = 128 + cos(a) * d1, ey = 128 + sin(a) * d1, nx = -sin(a), ny = cos(a);
          p.moveTo(128 + cos(a) * d0 + nx * w * 0.5, 128 + sin(a) * d0 + ny * w * 0.5);
          p.lineTo(ex + nx * w, ey + ny * w); p.arc(ex, ey, w, a + PI / 2, a - PI / 2, true);
          p.lineTo(128 + cos(a) * d0 - nx * w * 0.5, 128 + sin(a) * d0 - ny * w * 0.5); p.closePath();
        }
        return p;
      };
      g.fillStyle = css(mix(c, '#c9e04a', 0.42)); g.save(); g.translate(-1.5, -2); g.fill(shapes(1.04)); g.restore();
      g.fillStyle = css(c); g.fill(shapes(1));
      g.fillStyle = 'rgba(210,235,150,0.32)'; g.beginPath(); g.ellipse(112, 108, 15, 7, -0.6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(106, 104, 3.2, 0, TAU); g.fill();
    });
  }
  // kit.splat(ctx, x, y, s, seed, color, {k (grow 0..1), rot, alpha}) (s 1 = about 220 units across)
  function splat(ctx, x, y, s, seed, color, o) {
    o = o || {};
    const k = o.k == null ? 1 : clamp(o.k);
    if (k <= 0) return;
    const sc = s * NS.ease.outBack(min(1, k)) * 0.86;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(o.rot == null ? hash(seed || 0, 4) * TAU : o.rot);
    ctx.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx.drawImage(splatSpr(floor(abs(seed || 0)) % 6, color || '#18240f'), -128 * sc, -128 * sc, 256 * sc, 256 * sc);
    ctx.restore();
  }
  // kit.debris(ctx, S, {x, y, t0, seed, count, kind 'rubble'|'glass'|'paper'|'shells'|'wood', spread, angle, speed, gravity, floorY, s, color})
  function debris(ctx, S, o) {
    o = o || {};
    const t = tOf(S), age = t - (o.t0 == null ? 0 : o.t0);
    if (age < 0 || age > (o.life || 4)) return;
    const n = o.count || 14, seed = o.seed || 1, kind = o.kind || 'rubble', s = o.s || 1;
    const sp = o.spread == null ? 0.9 : o.spread, ang = o.angle == null ? -PI / 2 : o.angle, v0 = (o.speed || 520) * s;
    const paper = kind === 'paper';
    const gr = (o.gravity == null ? (paper ? 160 : 1300) : o.gravity) * s;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const v = v0 * (0.3 + 0.7 * hash(i, seed + 1)), a = ang + (hash(i, seed + 2) - 0.5) * 2 * sp;
      let vx = cos(a) * v, vy = sin(a) * v;
      if (paper) { vx *= 0.5; vy *= 0.5; }
      const drag = paper ? 1.6 : 0.1;
      const ea = (1 - exp(-drag * age)) / drag;
      let px = o.x + vx * ea + (paper ? sin(age * 3 + i) * 30 * s : 0);
      let py = o.y + vy * ea + 0.5 * gr * age * age * (paper ? 0.4 : 1);
      let rot = hash(i, seed + 3) * TAU + age * (hash(i, seed + 4) - 0.5) * 16;
      if (o.floorY != null && py > o.floorY) { py = o.floorY; rot = hash(i, seed + 3) * TAU; }
      const sz = (4 + hash(i, seed + 5) * 10) * s;
      ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
      if (kind === 'glass') {
        ctx.fillStyle = 'rgba(190,215,255,0.45)'; ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.3); ctx.lineTo(sz * 0.8, -sz * 0.6); ctx.lineTo(sz * 0.2, sz * 0.7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = css('#ffffff', 0.4 + 0.6 * max(0, sin(age * 20 + i))); ctx.fillRect(-1, -1, 2, 2);
      } else if (paper) {
        const fl = cos(age * 6 + i * 2);
        ctx.scale(1, abs(fl) * 0.8 + 0.2);
        ctx.fillStyle = o.color || '#e4dcc6'; ctx.fillRect(-sz * 1.4, -sz, sz * 2.8, sz * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-sz, -sz * 0.5, sz * 2, 1.5); ctx.fillRect(-sz, 0, sz * 1.5, 1.5);
      } else if (kind === 'shells') {
        ctx.fillStyle = o.color || '#c8202e'; ctx.fillRect(-sz * 0.4, -sz, sz * 0.8, sz * 1.5);
        ctx.fillStyle = '#d4a640'; ctx.fillRect(-sz * 0.45, sz * 0.5, sz * 0.9, sz * 0.5);
      } else if (kind === 'wood') {
        ctx.fillStyle = o.color || '#4a3424'; ctx.fillRect(-sz * 2, -sz * 0.3, sz * 4, sz * 0.6);
      } else {
        ctx.fillStyle = o.color || '#3a3a40';
        ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.6); ctx.lineTo(sz * 0.7, -sz); ctx.lineTo(sz, sz * 0.5); ctx.lineTo(-sz * 0.3, sz * 0.8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-sz * 0.6, -sz * 0.6, sz, 2);
      }
      ctx.restore();
    }
    ctx.restore();
  }
  // kit.fireworks(ctx, S, {x, y, t0 (burst time), seed, color | colors, r, count, k, trail (rise from y + 500 before t0)})
  function fireworks(ctx, S, o) {
    o = o || {};
    const t = tOf(S), t0 = o.t0 == null ? 0 : o.t0, age = t - t0, seed = o.seed || 1, k = (o.k == null ? 1 : o.k);
    const R = o.r || 170, n = o.count || 90;
    const cols = o.colors || [o.color || NS.pick([C.vex, C.granny, C.tiny, C.noodle, '#9fe8ff', '#ffffff'], hash(seed, 2))];
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    if (o.trail !== false && age < 0 && age > -0.7) {
      const q = 1 + age / 0.7, sy = o.y + 520 * (1 - NS.ease.outCubic(q));
      drawGlow(ctx, o.x, sy, 16, '#ffe0a0', 0.9);
      ctx.strokeStyle = 'rgba(255,200,120,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(o.x, sy); ctx.lineTo(o.x + sin(age * 30) * 3, sy + 60); ctx.stroke();
    }
    if (age >= 0 && age < 2.4) {
      const K = fk(S);
      if (age < 0.25) drawGlow(ctx, o.x, o.y, R * 1.5, '#ffe6c0', (1 - age / 0.25) * 0.45 * K * k, 'soft');
      drawGlow(ctx, o.x, o.y + 20 * age * age, R * 1.3, cols[0], max(0, 1 - age / 1.6) * 0.25 * k);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + hash(i, seed) * 0.4, sp = i % 3 === 0 ? 0.3 + 0.4 * hash(i, seed + 1) : 0.78 + 0.22 * hash(i, seed + 1);
        const d = R * sp * (1 - exp(-age * 3.2)), d2 = R * sp * (1 - exp(-max(0, age - 0.07) * 3.2));
        const sag = 40 * age * age;
        const px = o.x + cos(a) * d, py = o.y + sin(a) * d + sag, qx = o.x + cos(a) * d2, qy = o.y + sin(a) * d2 + sag * 0.9;
        const fade = (1 - age / 2.4) * (age > 1 ? (hash(i + floor(t * 24), seed + 3) < 0.6 ? 1 : 0.2) : 1);
        const col = cols[i % cols.length];
        ctx.strokeStyle = css(col, fade * k * 0.8); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
        ctx.strokeStyle = css('#ffffff', fade * k * 0.7); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(lerp(qx, px, 0.6), lerp(qy, py, 0.6)); ctx.lineTo(px, py); ctx.stroke();
        if (i % 3 === 0) drawGlow(ctx, px, py, 14, col, fade * k * 0.9, 'hot');
      }
    }
    ctx.restore();
  }
  // kit.speedLines(ctx, S, {cx, cy, k, seed, color, count, inner, outer, width, rate})
  function speedLines(ctx, S, o) {
    o = o || {};
    const k = o.k == null ? 1 : o.k;
    if (k <= 0.01) return;
    const t = tOf(S), step = floor(t * (o.rate || 12)), seed = (o.seed || 1) + step * 13;
    const cx = o.cx == null ? W / 2 : o.cx, cy = o.cy == null ? H / 2 : o.cy, n = o.count || 56;
    const inner = o.inner || 260, outer = o.outer || 1100, wd = o.width || 0.022;
    ctx.save();
    ctx.fillStyle = css(o.color || '#ffffff', clamp(k));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i + hash(i, seed) * 0.8) / n * TAU, ri = inner * (0.85 + hash(i, seed + 1) * 0.7), w = wd * (0.4 + hash(i, seed + 2) * 1.2);
      ctx.moveTo(cx + cos(a) * ri, cy + sin(a) * ri);
      ctx.lineTo(cx + cos(a - w) * outer, cy + sin(a - w) * outer);
      ctx.lineTo(cx + cos(a + w) * outer, cy + sin(a + w) * outer);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }
  // kit.halftone(ctx, x, y, w, h, {color, k, angle, size, mode 'linear'|'radial'|'flat', dir, cx, cy, min, max})
  function halftone(ctx, x, y, w, h, o) {
    o = o || {};
    const col = o.color || '#000000', k = o.k == null ? 1 : o.k, ang = o.angle == null ? 0.42 : o.angle, size = o.size || 11;
    const mode = o.mode || 'linear', dir = o.dir == null ? PI / 4 : o.dir, mn = o.min == null ? 0.05 : o.min, mx = o.max == null ? 0.62 : o.max;
    const cw = round(w), chh = round(h), R = min(1, CS());
    const cxf = o.cx == null ? 0.5 : o.cx, cyf = o.cy == null ? 0.5 : o.cy;
    const key = ['ht', cw, chh, col, round(ang * 100), size, mode, round(dir * 100), mn, mx, cxf, cyf].join(':');
    const img = cached(key, cw * R, chh * R, (g) => {
      g.scale(R, R);
      g.fillStyle = col;
      const ca = cos(ang), sa = sin(ang), dx = cos(dir), dy = sin(dir);
      const ext = hypot(cw, chh), ccx = cw / 2, ccy = chh / 2;
      const pmin = -(abs(dx) * cw + abs(dy) * chh) / 2, pmax = -pmin;
      g.beginPath();
      for (let v = -ext / 2; v < ext / 2; v += size) {
        for (let u = -ext / 2; u < ext / 2; u += size) {
          const px = ccx + u * ca - v * sa, py = ccy + u * sa + v * ca;
          if (px < -size || py < -size || px > cw + size || py > chh + size) continue;
          let q;
          if (mode === 'radial') q = clamp(hypot(px - cw * cxf, py - chh * cyf) / (ext * 0.55));
          else if (mode === 'flat') q = 1;
          else q = clamp(((px - ccx) * dx + (py - ccy) * dy - pmin) / (pmax - pmin));
          const rr = lerp(mn, mx, q) * size;
          if (rr < 0.3) continue;
          g.moveTo(px + rr, py); g.arc(px, py, rr, 0, TAU);
        }
      }
      g.fill();
    });
    ctx.save(); ctx.globalAlpha *= clamp(k); ctx.drawImage(img, x, y, w, h); ctx.restore();
  }
  // kit.shockwave(ctx, x, y, r, k, {color, squash})
  function shockwave(ctx, x, y, r, k, o) {
    o = o || {};
    if (k <= 0.01 || r <= 1) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, o.squash || 1);
    ctx.strokeStyle = `rgba(0,0,0,${0.25 * k})`; ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, 0, r * 1.08, o.color || '#ffe6c0', k * 0.8, 'ring');
    ctx.strokeStyle = css(o.color || '#ffe6c0', k * 0.9); ctx.lineWidth = max(1, r * 0.015);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // kit.phoneGlow(ctx, x, y, k, {s (1 = 30 units tall), rot, face: [x, y] | false, rec}) cold-white screen + face light
  function phoneGlow(ctx, x, y, k, o) {
    o = o || {};
    k = k == null ? 1 : k;
    const s = o.s || 1, rot = o.rot || 0;
    ctx.save();
    if (k > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const f = o.face === false ? null : (o.face || [x, y - 34 * s]);
      if (f) drawGlow(ctx, f[0], f[1], 46 * s, '#cfe6ff', 0.32 * k);
      drawGlow(ctx, x, y, 26 * s, '#e8f4ff', 0.5 * k);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#07080b'; ctx.beginPath(); roundRect(ctx, -9 * s, -15 * s, 18 * s, 30 * s, 3 * s); ctx.fill();
    ctx.fillStyle = css(mix('#2a3444', '#eaf6ff', k)); ctx.fillRect(-7.5 * s, -13 * s, 15 * s, 26 * s);
    if (o.rec !== false && k > 0.3 && s > 0.6) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(4 * s, -10 * s, 1.4 * s, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // ================================================================================================ film burn
  const BURN = { w: 320, h: 180, f: null, lo: 0, hi: 1, hole: null, chr: null, rim: null };
  function burnInit() {
    if (BURN.f) return;
    const bw = BURN.w, bh = BURN.h, f = new Float32Array(bw * bh);
    let lo = 1e9, hi = -1e9;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const nx = (x / bw - 0.5) * 1.778, ny = y / bh - 0.5;
      const v = hypot(nx, ny) * 0.8 + 0.26 * fbm2(x * 0.03 + 4.1, y * 0.03 - 2.3, 4) + 0.04 * vn2(atan2(ny, nx) * 3 + 9, 1.5);
      f[y * bw + x] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    BURN.f = f; BURN.lo = lo; BURN.hi = hi;
    BURN.hole = NS.makeCanvas(bw, bh, 'world'); BURN.chr = NS.makeCanvas(bw, bh, 'world'); BURN.rim = NS.makeCanvas(bw, bh, 'world');
  }
  // kit.burn(ctx, S, k, seed, {mode 'cut'|'black', x, y, w, h}): a film-burn hole grows from the centre (k 0..1:
  //   0 intact, 1 gone) with a charred band and a curling orange rim. 'cut' punches the hole (destination-out) so
  //   whatever is under this layer shows; 'black' fills it black. Reduced flashing: thin dim rim.
  function burn(ctx, S, k, seed, o) {
    o = o || {};
    burnInit();
    const bw = BURN.w, bh = BURN.h, f = BURN.f, red = !!(S && S.reduced);
    k = clamp(k);
    const th = lerp(BURN.lo - 0.03, BURN.hi + 0.06, NS.ease.inQuad(k));
    const off = ((seed || 0) * 0.017) % 0.05;
    const hc = BURN.hole.getContext('2d'), cc = BURN.chr.getContext('2d'), rc = BURN.rim.getContext('2d');
    const hI = hc.createImageData(bw, bh), cI = cc.createImageData(bw, bh), rI = rc.createImageData(bw, bh);
    const hd = hI.data, cd = cI.data, rd = rI.data, soft = 0.006, rimW = red ? 0.01 : 0.026, charW = 0.06;
    for (let i = 0, p = 0; i < f.length; i++, p += 4) {
      const d = f[i] + off - th;
      const keep = d <= 0 ? 0 : d >= soft ? 1 : d / soft;
      hd[p + 3] = (1 - keep) * 255;
      const ch = d > 0 && d < rimW + charW ? 1 - clamp((d - rimW) / charW) : 0;
      cd[p] = 26; cd[p + 1] = 12; cd[p + 2] = 6; cd[p + 3] = ch * 235;
      let gl = 0;
      if (d > -0.004 && d < rimW) gl = clamp(1 - abs(d - rimW * 0.3) / (rimW * 0.9));
      const hot = gl * gl;
      rd[p] = 255; rd[p + 1] = 70 + 150 * hot; rd[p + 2] = 10 + 80 * hot * hot; rd[p + 3] = gl * (red ? 140 : 255);
    }
    hc.putImageData(hI, 0, 0); cc.putImageData(cI, 0, 0); rc.putImageData(rI, 0, 0);
    const x = o.x || 0, y = o.y || 0, w = o.w || W, h = o.h || H;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(BURN.chr, x, y, w, h);
    if ((o.mode || 'cut') === 'cut') { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(BURN.hole, x, y, w, h); }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(BURN.hole, x, y, w, h); }   // hole pixels are opaque black
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(BURN.rim, x, y, w, h);
    if (!red) { ctx.globalAlpha = 0.35; ctx.drawImage(BURN.rim, x - w * 0.004, y - h * 0.004, w * 1.008, h * 1.008); }
    ctx.restore();
  }

  // ================================================================================================ stage props
  // kit.amp(ctx, x, y, s, {kind 'stack'|'combo'|'cab'|'head', on 0..1 (jewel light + glow), face, scorch, seed})
  //   (x, y) = bottom centre; s 1 = a full stack 300 units tall, 150 wide. Original design: black tolex, silver weave
  //   grille, cream piping, a chrome bolt badge. Returns {top: [x, y], w, h}.
  function amp(ctx, x, y, s, o) {
    o = o || {};
    const kind = o.kind || 'stack', sc = o.scorch || 0, R = CS() * min(2.5, max(0.6, s * 1.4));
    const key = ['amp', kind, round(sc * 4), o.seed || 1].join(':');
    const dims = { stack: [160, 312], combo: [150, 130], cab: [150, 150], head: [150, 62] }[kind] || [160, 312];
    const img = cached(key, dims[0] * R, dims[1] * R, (g) => {
      g.scale(R, R);
      const r = NS.rng((o.seed || 1) * 7 + 3);
      const box = (bx, by, bw, bh, grille) => {
        g.fillStyle = '#121214'; g.beginPath(); roundRect(g, bx, by, bw, bh, 6); g.fill();
        g.strokeStyle = 'rgba(210,200,170,0.55)'; g.lineWidth = 2; g.beginPath(); roundRect(g, bx + 4, by + 4, bw - 8, bh - 8, 4); g.stroke();
        if (grille) {
          const gx = bx + 10, gy = by + 10, gw = bw - 20, gh = bh - 20;
          g.fillStyle = '#2a2b30'; g.fillRect(gx, gy, gw, gh);
          g.save(); g.beginPath(); g.rect(gx, gy, gw, gh); g.clip();
          g.strokeStyle = 'rgba(160,165,175,0.25)'; g.lineWidth = 1;
          g.beginPath();
          for (let d = -gh; d < gw + gh; d += 4) { g.moveTo(gx + d, gy); g.lineTo(gx + d - gh, gy + gh); g.moveTo(gx + d - gh, gy); g.lineTo(gx + d, gy + gh); }
          g.stroke();
          // speaker shadows behind the cloth
          const n = grille === 4 ? 2 : 1;
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const cx = gx + gw * (n === 1 ? 0.5 : 0.27 + i * 0.46), cy = gy + gh * (n === 1 ? 0.5 : 0.27 + j * 0.46), rr = min(gw, gh) * (n === 1 ? 0.36 : 0.2);
            const sg = g.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
            sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(0.8, 'rgba(0,0,0,0.2)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
          }
          const sh = g.createLinearGradient(0, gy, 0, gy + gh); sh.addColorStop(0, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(0,0,0,0.25)');
          g.fillStyle = sh; g.fillRect(gx, gy, gw, gh);
          g.restore();
          // the badge: a chrome bolt in a circle
          g.fillStyle = '#c8ccd4'; g.beginPath(); g.arc(bx + bw - 22, by + 22, 8, 0, TAU); g.fill();
          g.fillStyle = '#121214'; g.beginPath(); g.moveTo(bx + bw - 21, by + 15); g.lineTo(bx + bw - 26, by + 23); g.lineTo(bx + bw - 22, by + 23); g.lineTo(bx + bw - 24, by + 29); g.lineTo(bx + bw - 18, by + 20); g.lineTo(bx + bw - 22, by + 20); g.closePath(); g.fill();
        }
        // corners
        g.fillStyle = '#8a8e96';
        for (const [cx, cy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) { g.beginPath(); g.arc(cx + (cx > bx ? -5 : 5), cy + (cy > by ? -5 : 5), 5, 0, TAU); g.fill(); }
        // scuffs
        for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(120,120,130,${r() * 0.2})`; g.fillRect(bx + r() * bw, by + r() * bh, 6 + r() * 14, 1.5); }
      };
      const head = (bx, by, bw, bh) => {
        g.fillStyle = '#141416'; g.beginPath(); roundRect(g, bx, by, bw, bh, 6); g.fill();
        g.fillStyle = '#c9b98a'; g.fillRect(bx + 8, by + bh * 0.5, bw - 16, bh * 0.36);
        g.fillStyle = '#1a1a1c';
        for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(bx + 26 + i * (bw - 52) / 6, by + bh * 0.68, 4.5, 0, TAU); g.fill(); }
        g.fillStyle = '#d8dce4';
        for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(bx + 25 + i * (bw - 52) / 6, by + bh * 0.66, 1.6, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 2;
        g.beginPath(); for (let i = 0; i < 9; i++) { g.moveTo(bx + 16 + i * 14, by + 8); g.lineTo(bx + 16 + i * 14, by + bh * 0.4); } g.stroke();
        g.fillStyle = '#5a0a0a'; g.beginPath(); g.arc(bx + 16, by + bh * 0.68, 5, 0, TAU); g.fill();
        g.strokeStyle = '#3a3a40'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx + bw * 0.35, by); g.quadraticCurveTo(bx + bw / 2, by - 10, bx + bw * 0.65, by); g.stroke();
      };
      const W0 = dims[0], H0 = dims[1];
      if (kind === 'stack') { head(5, 8, W0 - 10, 62); box(0, 72, W0, 118, 4); box(0, 192, W0, 118, 4); }
      else if (kind === 'combo') { g.translate(0, 0); box(0, 50, W0, 80, 1); head(0, 0, W0, 54); }
      else if (kind === 'head') head(0, 2, W0, 58);
      else box(0, 0, W0, H0, 4);
      if (sc > 0) {
        for (let i = 0; i < 4; i++) {
          const sx = r() * W0, sy = H0 * (0.2 + r() * 0.8), rr = 30 + r() * 60;
          const gr = g.createRadialGradient(sx, sy, 0, sx, sy, rr);
          gr.addColorStop(0, `rgba(10,6,4,${0.7 * sc})`); gr.addColorStop(1, 'rgba(10,6,4,0)');
          g.fillStyle = gr; g.fillRect(0, 0, W0, H0);
        }
      }
    });
    const w = dims[0] * s, h = dims[1] * s;
    ctx.save();
    ctx.translate(x, y); if (o.face === -1) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h, w, h);
    const on = o.on == null ? 0 : o.on;
    if (on > 0.01 && kind !== 'cab') {
      const hy = kind === 'stack' ? -h + (8 + 62 * 0.68) * s : kind === 'combo' ? -h + 54 * 0.68 * s : -h + (2 + 58 * 0.68) * s;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, -w / 2 + 16 * s + (kind === 'stack' ? 5 * s : 0), hy, 16 * s, '#ff3020', on, 'hot');
      drawGlow(ctx, 0, hy - 6 * s, w * 0.6, '#ffb060', 0.12 * on);
    }
    ctx.restore();
    return { top: [x, y - h], w, h };
  }

  // kit.drumKit(ctx, x, y, s, {view 'front'|'back', S (drum lanes wobble the cymbals and pulse the kick), t, logo, shell})
  //   (x, y) = floor centre under the bass drum; s 1 = about 400 wide. Returns {seat, snare, kick, crash, ride, hat, floorTom}
  function drumKit(ctx, x, y, s, o) {
    o = o || {};
    const S = o.S, t = o.t != null ? o.t : tOf(S), view = o.view || 'front', shell = o.shell || '#7a1018';
    const since = (lane) => (S && S[lane] != null && isFinite(S[lane]) ? S[lane] : 9);
    const wob = (lane, amp) => { const a = since(lane); return a < 1.2 ? sin(a * 26) * exp(-a * 4) * amp : 0; };
    const kickP = since('kick') < 0.12 ? 1 - since('kick') / 0.12 : 0;
    const P = (px, py) => [x + px * s, y + py * s];
    const res = { seat: P(0, -190), snare: P(-92, -150), kick: P(0, -88), crash: P(-150, -300), ride: P(160, -255), hat: P(-178, -205), floorTom: P(128, -120) };
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    const cym = (cx, cy, r, tilt, w) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt + w);
      ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 400); ctx.stroke();
      const cg = ctx.createLinearGradient(-r, 0, r, 0);
      cg.addColorStop(0, '#6a4a18'); cg.addColorStop(0.35, '#e0b050'); cg.addColorStop(0.5, '#fff0b0'); cg.addColorStop(0.65, '#c8963a'); cg.addColorStop(1, '#5a3a10');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a3410'; ctx.beginPath(); ctx.ellipse(0, -1, r * 0.14, r * 0.05, 0, 0, TAU); ctx.fill();
      ctx.restore();
    };
    const drum = (cx, cy, rw, rh, depth, col) => {
      const sg = ctx.createLinearGradient(cx - rw, 0, cx + rw, 0);
      sg.addColorStop(0, css(shade(col, -0.5))); sg.addColorStop(0.35, css(shade(col, 0.15))); sg.addColorStop(0.55, css(shade(col, 0.35))); sg.addColorStop(1, css(shade(col, -0.55)));
      ctx.fillStyle = sg; ctx.fillRect(cx - rw, cy, rw * 2, depth);
      ctx.fillStyle = '#c8ccd4'; ctx.fillRect(cx - rw, cy - 2, rw * 2, 4); ctx.fillRect(cx - rw, cy + depth - 2, rw * 2, 4);
      ctx.fillStyle = '#e8e2d0'; ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9aa0aa'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#9aa0aa'; for (let i = 0; i < 5; i++) ctx.fillRect(cx - rw + 8 + i * (rw * 2 - 16) / 4, cy + 4, 3, depth - 8);
    };
    if (view === 'back') {
      cym(-150, -300, 74, -0.12, wob('crash', 0.12));
      cym(160, -255, 82, 0.08, wob('crash', 0.05));
      cym(-178, -205, 56, 0, wob('hat', 0.04));
      drum(-60, -232, 52, 16, 40, shell); drum(60, -232, 52, 16, 40, shell);
      // bass drum batter side + throne
      ctx.fillStyle = css(shade(shell, -0.3)); ctx.beginPath(); ctx.ellipse(0, -100, 112, 104, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d8d2c0'; ctx.beginPath(); ctx.ellipse(0, -100, 96, 90, 0, 0, TAU); ctx.fill();
      drum(-92, -150, 58, 18, 34, '#c8ccd4'); drum(128, -126, 64, 20, 90, shell);
      ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.ellipse(0, -66, 58, 18, 0, 0, TAU); ctx.fill(); ctx.fillRect(-8, -66, 16, 66);
    } else {
      cym(-178, -205, 56, 0.05, wob('hat', 0.05));
      ctx.save(); ctx.translate(0, -214); ctx.fillStyle = css(shade(shell, -0.2)); ctx.restore();
      drum(-60, -246, 50, 14, 46, shell); drum(60, -246, 50, 14, 46, shell);
      drum(128, -132, 64, 18, 116, shell);
      drum(-92, -160, 58, 16, 30, '#b8bcc6');
      cym(-150, -300, 74, -0.15, wob('crash', 0.14));
      cym(160, -255, 82, 0.1, wob('crash', 0.06));
      // bass drum with the logo head (pulses on the kick)
      const kr = 112 * (1 + kickP * 0.025);
      ctx.fillStyle = css(shade(shell, -0.35)); ctx.beginPath(); ctx.ellipse(0, -112, kr, kr, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0c0b0e'; ctx.beginPath(); ctx.ellipse(0, -112, kr * 0.86, kr * 0.86, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(0, -112, kr * 0.9, kr * 0.9, 0, 0, TAU); ctx.stroke();
      if (o.logo !== false) ctx.drawImage(kickLogo(), -kr * 0.8, -112 - kr * 0.8, kr * 1.6, kr * 1.6);
      ctx.fillStyle = '#9aa0aa'; ctx.fillRect(-120, -14, 22, 14); ctx.fillRect(98, -14, 22, 14);
    }
    ctx.restore();
    if (kickP > 0 && view === 'front') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, x, y - 112 * s, 130 * s, C.vex, 0.25 * kickP); ctx.restore(); }
    return res;
  }
  function kickLogo() {
    return cached('kicklogo', 256, 256, (g) => {
      g.translate(128, 128);
      g.strokeStyle = 'rgba(232,38,46,0.9)'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 112, 0, TAU); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = NS.font(40, F.logo); g.fillStyle = '#efe6cf'; g.fillText('NO', 0, -44);
      g.font = NS.font(fitSize(g, 'SURVIVORS', F.logo, 60, 200), F.logo);
      g.fillStyle = '#e8262e'; g.fillText('SURVIVORS', 3, 13); g.fillStyle = '#efe6cf'; g.fillText('SURVIVORS', 0, 10);
      drips(g, -90, 90, 30, 9, 50, '#efe6cf', 0.8, 3, 3);
    }, true);
  }
  // kit.roadCase(ctx, x, y, s, {label, sub, seed, face, open}) flight case; (x, y) = bottom centre; s 1 = 170 x 110
  function roadCase(ctx, x, y, s, o) {
    o = o || {};
    const label = o.label || String((window.SCORE && window.SCORE.band) || 'No Survivors').toUpperCase();
    const sub = o.sub == null ? '' : o.sub, seed = o.seed || 1, R = CS() * min(2.5, max(0.6, s * 1.4));
    const img = cached(['rcase', label, sub, seed].join(':'), 190 * R, 130 * R, (g) => {
      g.scale(R, R); g.translate(10, 10);
      const r = NS.rng(seed * 3 + 7), cw = 170, ch = 110;
      g.fillStyle = '#18181b'; g.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * cw, r() * ch, 8 + r() * 20, 1); }
      g.fillStyle = '#9aa0aa';
      g.fillRect(0, 0, cw, 6); g.fillRect(0, ch - 6, cw, 6); g.fillRect(0, 0, 6, ch); g.fillRect(cw - 6, 0, 6, ch); g.fillRect(0, ch * 0.36, cw, 4);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, cw, 2);
      for (const [cx, cy] of [[0, 0], [cw, 0], [0, ch], [cw, ch]]) { g.fillStyle = '#c8ccd4'; g.beginPath(); g.arc(cx, cy, 9, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(cx - 2, cy - 2, 3, 0, TAU); g.fill(); }
      g.fillStyle = '#b0b4bc'; g.fillRect(cw * 0.2, ch * 0.3, 18, 14); g.fillRect(cw * 0.8 - 18, ch * 0.3, 18, 14);
      g.fillStyle = '#e8e2d0'; g.font = NS.font(fitSize(g, label, F.title, 20, cw * 0.8), F.title); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, cw / 2, ch * 0.62);
      if (sub) { g.font = NS.font(13, F.type); g.fillText(sub, cw / 2, ch * 0.82); }
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(cw * 0.1, ch * 0.6, cw * 0.8, 1.2); g.globalCompositeOperation = 'source-over';
      // gaffer tape
      g.fillStyle = 'rgba(200,200,190,0.7)'; g.save(); g.translate(cw * 0.25, ch * 0.85); g.rotate(-0.15); g.fillRect(-20, -5, 40, 10); g.restore();
    }, true);
    ctx.save(); ctx.translate(x, y); if (o.face === -1) ctx.scale(-1, 1);
    ctx.drawImage(img, -95 * s, -120 * s, 190 * s, 130 * s);
    ctx.restore();
    return { top: [x, y - 110 * s], w: 170 * s, h: 110 * s };
  }
  // kit.pyroButton(ctx, x, y, s, pressed, {k (armed glow), label}) a hazard-striped box with a big red mushroom button
  //   (x, y) = bottom centre; s 1 = 130 wide. Returns {button: [x, y]}
  function pyroButton(ctx, x, y, s, pressed, o) {
    o = o || {};
    const label = o.label || 'PYRO', k = o.k == null ? 1 : o.k, pr = pressed === true ? 1 : clamp(+pressed || 0);
    const img = cached('pyrobtn:' + label, 160 * CS() * 1.5, 110 * CS() * 1.5, (g) => {
      g.scale(CS() * 1.5, CS() * 1.5); g.translate(15, 30);
      g.fillStyle = '#1a1a1c'; g.beginPath(); roundRect(g, 0, 0, 130, 74, 6); g.fill();
      g.save(); g.beginPath(); g.rect(4, 44, 122, 26); g.clip();
      g.fillStyle = '#f2c230'; g.fillRect(4, 44, 122, 26);
      g.fillStyle = '#111'; for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(i * 16, 70); g.lineTo(i * 16 + 10, 70); g.lineTo(i * 16 + 26, 44); g.lineTo(i * 16 + 16, 44); g.fill(); }
      g.restore();
      g.fillStyle = '#d8d2c0'; g.fillRect(28, 12, 74, 24);
      g.fillStyle = '#111'; g.font = NS.font(22, F.title); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 65, 25);
      g.fillStyle = '#5a5c62'; g.beginPath(); g.arc(14, 14, 5, 0, TAU); g.fill();
    }, true);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.drawImage(img, -80, -104, 160, 110);
    // the mushroom button on top
    const by = -78 + pr * 6;
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(-22, -80, 44, 6);
    ctx.fillStyle = '#6a0a0e'; ctx.beginPath(); ctx.ellipse(0, by, 30, 10, 0, 0, TAU); ctx.fill();
    const bg = ctx.createRadialGradient(-8, by - 14, 2, 0, by - 6, 32);
    bg.addColorStop(0, pr ? '#ffb0a0' : '#ff6a60'); bg.addColorStop(0.5, '#e01a20'); bg.addColorStop(1, '#7a0a0e');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, by - 6, 30, 18 - pr * 4, 0, PI, 0); ctx.ellipse(0, by - 6, 30, 7, 0, 0, PI); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, -40, -90, 10, '#3aff6a', 0.8 * k, 'hot');
    if (pr > 0) drawGlow(ctx, 0, by - 8, 70, '#ff4020', 0.5 * pr * k);
    ctx.restore();
    return { button: [x, y + (by - 8) * s] };
  }

  // ================================================================================================ the Orpheum stage set
  // Forward view (from the pit looking at the stage). Set space = the 'wide' frame. Layers: back wall + backdrop + truss
  // (depth .62), the stage floor (perspective strips .62 -> 1), props on the floor (per depth), the proscenium frame,
  // house and pit (1), the chandelier (1.12). Reverse views ('drummer', 'side') look from the stage into the house.
  const SET = { yB: 398, yL: 472, x0B: 262, x1B: 1018, x0L: 205, x1L: 1075, pitY: 560, dB: 0.62, dC: 1.12 };
  const ANGLES = {
    wide: { x: 640, y: 338, zoom: 1, low: 0 },
    pit: { x: 640, y: 384, zoom: 1.38, low: 0.3 },
    low: { x: 640, y: 432, zoom: 1.85, low: 1 },
    drummer: { x: 640, y: 360, zoom: 1, rev: 1 },
    side: { x: 640, y: 360, zoom: 1, rev: 1, side: 1 },
  };
  const GOLD = '#9c7a34', GOLD_HI = '#e2c26a', GOLD_LO = '#3e2a10', VELVET = '#6a0f18';
  const DEF_FIX = []; for (let i = 0; i < 9; i++) DEF_FIX.push([280 + i * 90, 182 - 338 + 360]);

  // ---------------------------------------------------------------- cached layers (forward)
  const BK = { x: 150, y: 40, w: 980, h: 372 };
  function stageBackLayer(sc, ruin) {
    const R = CS() * 1.5, key = 'stage:back:' + sc + ':' + (ruin ? 1 : 0);
    return cached(key, BK.w * R, BK.h * R, (g) => {
      g.scale(R, R); g.translate(-BK.x, -BK.y);
      const r = NS.rng(611);
      // back wall: dark brick
      g.fillStyle = '#140f10'; g.fillRect(BK.x, BK.y, BK.w, BK.h);
      for (let y = BK.y; y < BK.y + BK.h; y += 16) {
        const off = ((y / 16) % 2) * 22;
        for (let x = BK.x - off; x < BK.x + BK.w; x += 44) { g.fillStyle = css(shade('#2a1a18', (r() - 0.5) * 0.4), 0.8); g.fillRect(x + 1, y + 1, 42, 14); }
      }
      const vg = g.createLinearGradient(0, BK.y, 0, BK.y + BK.h);
      vg.addColorStop(0, 'rgba(8,6,8,0.75)'); vg.addColorStop(0.6, 'rgba(8,6,8,0.25)'); vg.addColorStop(1, 'rgba(8,6,8,0.55)');
      g.fillStyle = vg; g.fillRect(BK.x, BK.y, BK.w, BK.h);
      // fly lines + sandbags
      g.strokeStyle = 'rgba(150,130,100,0.35)'; g.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) { const x = 200 + r() * 880; g.beginPath(); g.moveTo(x, BK.y); g.lineTo(x + (r() - 0.5) * 6, 120 + r() * 200); g.stroke(); }
      if (!ruin) {
        // the backdrop banner
        const bx0 = 300, bx1 = 980, by0 = 150, by1 = 384;
        const ban = new Path2D();
        ban.moveTo(bx0, by0); for (let i = 1; i <= 12; i++) ban.lineTo(lerp(bx0, bx1, i / 12), by0 + (i % 2 ? 4 : 0));
        ban.lineTo(bx1 + 4, by1 - 10);
        for (let i = 24; i >= 0; i--) ban.lineTo(lerp(bx0, bx1, i / 24), by1 + (r() - 0.5) * 8 - (sc > 0 && i > 15 ? r() * 30 * sc : 0));
        ban.closePath();
        g.save(); g.clip(ban);
        g.fillStyle = '#0d0c10'; g.fillRect(bx0 - 10, by0 - 10, bx1 - bx0 + 20, by1 - by0 + 30);
        // folds
        for (let i = 0; i < 18; i++) {
          const fx = lerp(bx0, bx1, (i + 0.5) / 18);
          const fg = g.createLinearGradient(fx - 20, 0, fx + 20, 0);
          fg.addColorStop(0, 'rgba(255,255,255,0)'); fg.addColorStop(0.5, `rgba(255,255,255,${0.03 + r() * 0.04})`); fg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = fg; g.fillRect(fx - 20, by0, 40, by1 - by0);
        }
        symbol(g, 640, 196, 62, css('#c3242c', 0.85), 1, { weight: 0.09 });
        const fs = fitSize(g, 'NO SURVIVORS', F.logo, 80, 500);
        g.font = NS.font(fs, F.logo); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillStyle = '#7a1018'; g.fillText('NO SURVIVORS', 643, 296 + 3);
        g.fillStyle = '#d9cfb6'; g.fillText('NO SURVIVORS', 640, 296);
        drips(g, 400, 880, 290, 14, 40, '#d9cfb6', 0.65, 6, 3);
        // scorch + burn holes
        if (sc > 0) {
          for (let i = 0; i < 6; i++) {
            const hx = lerp(bx0, bx1, r()), hy = lerp(by0 + 60, by1, r()), rr = 10 + r() * 34 * sc;
            const hg = g.createRadialGradient(hx, hy, 0, hx, hy, rr * 2.2);
            hg.addColorStop(0, 'rgba(5,3,3,0.95)'); hg.addColorStop(0.45, 'rgba(5,3,3,0.9)'); hg.addColorStop(0.55, 'rgba(60,25,8,0.6)'); hg.addColorStop(1, 'rgba(30,10,4,0)');
            g.fillStyle = hg; g.beginPath(); g.arc(hx, hy, rr * 2.2, 0, TAU); g.fill();
          }
          const bgr = g.createLinearGradient(0, by1, 0, by1 - 90);
          bgr.addColorStop(0, `rgba(10,5,3,${0.9 * sc})`); bgr.addColorStop(1, 'rgba(10,5,3,0)');
          g.fillStyle = bgr; g.fillRect(bx0, by1 - 90, bx1 - bx0, 100);
        }
        g.restore();
        g.fillStyle = '#2a2a2e'; g.fillRect(bx0 - 20, by0 - 6, bx1 - bx0 + 40, 6);
        g.fillStyle = '#9aa0aa'; for (let i = 0; i <= 12; i++) { g.beginPath(); g.arc(lerp(bx0 + 6, bx1 - 6, i / 12), by0 + 5, 2.5, 0, TAU); g.fill(); }
      } else {
        // ruin: the pipe and a few charred strips; holes in the back wall to the night
        g.fillStyle = '#1a1a1e'; g.fillRect(300, 144, 680, 6);
        for (let i = 0; i < 9; i++) {
          const sx = 310 + r() * 650, L = 30 + r() * 120;
          g.fillStyle = '#0a0808'; g.beginPath(); g.moveTo(sx, 150); g.lineTo(sx + 18 + r() * 20, 150); g.lineTo(sx + 10 + r() * 10, 150 + L); g.lineTo(sx + 2, 150 + L * 0.8); g.closePath(); g.fill();
        }
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        g.beginPath(); g.moveTo(BK.x, BK.y);
        for (let x = BK.x; x <= BK.x + BK.w; x += 24) g.lineTo(x, 70 + 70 * sin((x - BK.x) / 260) + r() * 40 + (x > 640 ? 50 : 0));
        g.lineTo(BK.x + BK.w, BK.y); g.closePath(); g.fill();
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = 'rgba(140,160,210,0.3)'; g.lineWidth = 2; g.beginPath();
        for (let x = BK.x; x <= BK.x + BK.w; x += 24) g.lineTo(x, 72 + 70 * sin((x - BK.x) / 260) + (x > 640 ? 50 : 0));
        g.stroke();
      }
      // masking legs and border (black velvet; burnt away in the ruin)
      g.fillStyle = '#060507';
      if (!ruin) { g.fillRect(BK.x, BK.y, 112, BK.h); g.fillRect(BK.x + BK.w - 112, BK.y, 112, BK.h); g.fillRect(BK.x, BK.y, BK.w, 62); }
      else { g.fillRect(BK.x, 200, 60, BK.h); g.fillRect(BK.x + BK.w - 70, 240, 70, BK.h); }
      for (let i = 0; i < (ruin ? 0 : 6); i++) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; g.fillRect(BK.x + 10 + i * 18, BK.y, 6, BK.h); g.fillRect(BK.x + BK.w - 108 + i * 18, BK.y, 6, BK.h); }
      // truss (horizontal) + towers
      const truss = (x0, y0, x1, y1) => {
        const horiz = abs(x1 - x0) > abs(y1 - y0), L = hypot(x1 - x0, y1 - y0), n = floor(L / 22);
        g.save(); g.translate(x0, y0); g.rotate(atan2(y1 - y0, x1 - x0));
        g.strokeStyle = '#3c3f46'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.moveTo(0, 26); g.lineTo(L, 26); g.stroke();
        g.lineWidth = 1.8; g.beginPath();
        for (let i = 0; i < n; i++) { g.moveTo(i * 22, 0); g.lineTo(i * 22 + 11, 26); g.lineTo(i * 22 + 22, 0); }
        g.stroke();
        g.strokeStyle = 'rgba(200,210,230,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -1.5); g.lineTo(L, -1.5); g.stroke();
        g.restore();
        return horiz;
      };
      if (!ruin) { truss(186, 118, 1094, 118); truss(246, 144, 246, 398); truss(1060, 144, 1060, 398); }
      else { truss(186, 118, 520, 118); g.save(); g.translate(520, 118); g.rotate(0.5); truss(0, 0, 420, 0); g.restore(); truss(246, 144, 246, 398); }
      // fixtures under the truss
      for (let i = 0; i < 9; i++) {
        const fx = 280 + i * 90, fy = 150;
        if (ruin && i > 3) continue;
        g.fillStyle = '#1c1d21';
        if (i % 2) { g.fillRect(fx - 12, fy, 24, 30); g.fillStyle = '#2c2e33'; g.beginPath(); g.ellipse(fx, fy + 30, 12, 5, 0, 0, TAU); g.fill(); }
        else { g.fillRect(fx - 3, fy, 6, 8); g.beginPath(); roundRect(g, fx - 16, fy + 8, 32, 26, 6); g.fill(); g.strokeStyle = '#2c2e33'; g.lineWidth = 3; g.beginPath(); g.moveTo(fx - 18, fy + 6); g.lineTo(fx - 18, fy + 24); g.moveTo(fx + 18, fy + 6); g.lineTo(fx + 18, fy + 24); g.stroke(); }
      }
    });
  }
  // the stage floor (set-space rows yB..yL), drawn in perspective strips
  const FL = { x: 180, y: SET.yB - 2, w: 920, h: SET.yL - SET.yB + 4 };
  function stageFloorTex(ruin) {
    const R = CS() * 1.5;
    return cached('stage:floor:' + (ruin ? 1 : 0), FL.w * R, FL.h * R, (g) => {
      g.scale(R, R); g.translate(-FL.x, -FL.y);
      const r = NS.rng(733);
      const fg = g.createLinearGradient(0, SET.yB, 0, SET.yL);
      fg.addColorStop(0, '#16120f'); fg.addColorStop(1, '#2a221c');
      g.fillStyle = fg; g.fillRect(FL.x, FL.y, FL.w, FL.h);
      // boards converging toward the back
      for (let i = 0; i <= 40; i++) {
        const u = i / 40, xb = lerp(SET.x0B - 60, SET.x1B + 60, u), xl = lerp(SET.x0L - 80, SET.x1L + 80, u);
        g.strokeStyle = `rgba(0,0,0,${0.5 + r() * 0.3})`; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(xb, SET.yB); g.lineTo(xl, SET.yL); g.stroke();
        g.strokeStyle = 'rgba(255,230,200,0.05)'; g.beginPath(); g.moveTo(xb + 1.5, SET.yB); g.lineTo(xl + 2, SET.yL); g.stroke();
      }
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${200 + r() * 55},${180 + r() * 50},150,${r() * 0.06})`; g.fillRect(FL.x + r() * FL.w, SET.yB + r() * (SET.yL - SET.yB), 6 + r() * 30, 1); }
      // spike tape marks
      const tapes = ['#ff3344', '#ffd23f', '#39ffb0', '#ff8a1f'];
      for (let i = 0; i < 7; i++) { g.fillStyle = css(tapes[i % 4], 0.7); const tx = 320 + r() * 640, ty = SET.yB + 10 + r() * 60; g.fillRect(tx, ty, 14, 2.5); g.fillRect(tx + 6, ty - 3, 2.5, 8); }
      if (ruin) {
        for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.4})`; g.beginPath(); g.ellipse(FL.x + r() * FL.w, SET.yB + r() * 74, 20 + r() * 60, 4 + r() * 8, 0, 0, TAU); g.fill(); }
      }
    });
  }
  // the proscenium frame, house walls, boxes, apron and pit floor
  const FR = { x: -320, y: -230, w: 1920, h: 1180 };
  function archY(x) {   // the arch's lower edge (opening top) at set x
    const u = (x - 640) / 435;
    return 200 - 105 * sqrt(max(0, 1 - u * u));
  }
  function stageFrameLayer(sc, ruin, barricade) {
    const R = CS() * 1.0, key = 'stage:frame:' + sc + ':' + (ruin ? 1 : 0) + ':' + (barricade ? 1 : 0);
    return cached(key, FR.w * R, FR.h * R, (g) => {
      g.scale(R, R); g.translate(-FR.x, -FR.y);
      const r = NS.rng(919);
      const goldG = (x0, y0, x1, y1) => { const gg = g.createLinearGradient(x0, y0, x1, y1); gg.addColorStop(0, GOLD_HI); gg.addColorStop(0.35, GOLD); gg.addColorStop(0.7, GOLD_LO); gg.addColorStop(1, GOLD); return gg; };
      // ---- house: walls with faded damask, ceiling coffers
      g.fillStyle = '#160d10'; g.fillRect(FR.x, FR.y, FR.w, FR.h);
      g.fillStyle = 'rgba(120,40,50,0.08)';
      for (let y = FR.y; y < 620; y += 46) for (let x = FR.x + ((y / 46) % 2) * 23; x < FR.x + FR.w; x += 46) { g.beginPath(); g.ellipse(x, y, 8, 14, 0, 0, TAU); g.fill(); }
      // ceiling band with coffers
      const cg = g.createLinearGradient(0, FR.y, 0, 20);
      cg.addColorStop(0, '#0a0708'); cg.addColorStop(1, '#22161a');
      g.fillStyle = cg; g.fillRect(FR.x, FR.y, FR.w, 20 - FR.y);
      for (let row = 0; row < 3; row++) {
        const y0 = FR.y + 30 + row * 72, ch = 54 - row * 6;
        for (let x = FR.x + 20; x < FR.x + FR.w; x += 110) {
          g.fillStyle = '#0c090a'; g.fillRect(x, y0, 96, ch);
          g.strokeStyle = css(GOLD, 0.35); g.lineWidth = 2; g.strokeRect(x + 4, y0 + 4, 88, ch - 8);
          g.fillStyle = css(GOLD, 0.4); g.beginPath(); g.arc(x + 48, y0 + ch / 2, 7, 0, TAU); g.fill();
        }
      }
      // ---- opera boxes (two tiers each side)
      const box = (x0, x1, yTop, yFront, side) => {
        g.fillStyle = '#070506'; g.fillRect(x0, yTop, x1 - x0, yFront - yTop + 10);
        // drapes
        g.fillStyle = css(VELVET, 0.9);
        g.beginPath(); g.moveTo(x0, yTop); g.quadraticCurveTo(x0 + 40, yTop + 30, x0 + 18, yFront); g.lineTo(x0, yFront); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(x1, yTop); g.quadraticCurveTo(x1 - 40, yTop + 30, x1 - 18, yFront); g.lineTo(x1, yFront); g.closePath(); g.fill();
        g.fillStyle = css(VELVET, 0.7); g.beginPath(); g.moveTo(x0, yTop); for (let i = 0; i <= 6; i++) g.quadraticCurveTo(lerp(x0, x1, (i - 0.5) / 6), yTop + 22, lerp(x0, x1, i / 6), yTop); g.closePath(); g.fill();
        // curved front: gilt band + balusters
        const fy = yFront, fh = 46;
        g.fillStyle = goldG(0, fy, 0, fy + fh);
        g.beginPath(); g.moveTo(x0, fy); g.quadraticCurveTo((x0 + x1) / 2, fy + 16, x1, fy); g.lineTo(x1, fy + fh); g.quadraticCurveTo((x0 + x1) / 2, fy + fh + 16, x0, fy + fh); g.closePath(); g.fill();
        g.fillStyle = 'rgba(30,18,6,0.7)';
        for (let x = x0 + 10; x < x1 - 6; x += 14) { const yy = fy + 8 + 16 * (1 - pow((x - (x0 + x1) / 2) / ((x1 - x0) / 2), 2)) * 0.5; g.fillRect(x, yy + 4, 6, 26); }
        g.strokeStyle = css(GOLD_HI, 0.6); g.lineWidth = 2;
        g.beginPath(); g.moveTo(x0, fy + 2); g.quadraticCurveTo((x0 + x1) / 2, fy + 18, x1, fy + 2); g.stroke();
        // dark soffit below the box
        g.fillStyle = '#0a0607'; g.beginPath(); g.moveTo(x0, fy + fh); g.quadraticCurveTo((x0 + x1) / 2, fy + fh + 16, x1, fy + fh); g.lineTo(x1, fy + fh + 30); g.lineTo(x0, fy + fh + 30); g.fill();
      };
      box(-300, -40, 70, 170, -1); box(-30, 120, 80, 180, -1);
      box(-300, -40, 300, 390, -1); box(-30, 120, 305, 395, -1);
      box(1160, 1310, 80, 180, 1); box(1320, 1580, 70, 170, 1);
      box(1160, 1310, 305, 395, 1); box(1320, 1580, 300, 390, 1);
      // exit signs (the glow is drawn live)
      for (const ex of [-170, 1450]) {
        g.fillStyle = '#1a0a0a'; g.fillRect(ex - 34, 470, 68, 26);
        g.fillStyle = '#ff4030'; g.font = NS.font(20, F.title); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', ex, 484);
        g.fillStyle = '#0c0708'; g.fillRect(ex - 50, 500, 100, 160);
      }
      // ---- the proscenium: dark oxblood plaster, gilt mouldings
      const ox0 = 128, ox1 = 1152, ix0 = SET.x0L, ix1 = SET.x1L;
      const opening = new Path2D();
      opening.moveTo(ix0, SET.yL + 1); opening.lineTo(ix0, archY(ix0)); for (let x = ix0; x <= ix1; x += 6) opening.lineTo(x, archY(x)); opening.lineTo(ix1, SET.yL + 1); opening.closePath();
      const body = new Path2D();
      body.rect(ox0, 8, ox1 - ox0, SET.pitY - 8);
      g.save();
      g.beginPath(); g.rect(ox0, 8, ox1 - ox0, SET.pitY - 8); g.clip();
      const pl = g.createLinearGradient(0, 8, 0, SET.pitY);
      pl.addColorStop(0, '#2c1712'); pl.addColorStop(0.5, '#231310'); pl.addColorStop(1, '#170c0a');
      g.fillStyle = pl; g.fillRect(ox0, 8, ox1 - ox0, SET.pitY - 8);
      // recessed panels on the spandrels with a faint relief pattern
      g.strokeStyle = css(GOLD, 0.25); g.lineWidth = 1.5;
      for (let i = 0; i < 26; i++) { const px = ox0 + 30 + r() * (ox1 - ox0 - 60), py = 30 + r() * 60; if (py > archY(px) - 70) continue; g.beginPath(); g.arc(px, py, 4 + r() * 6, 0, TAU); g.stroke(); }
      g.restore();
      // archivolt mouldings following the arch
      const archBand = (off, wd, col, dash) => {
        g.strokeStyle = col; g.lineWidth = wd;
        if (dash) g.setLineDash(dash);
        g.beginPath(); g.moveTo(ix0 - off, SET.yL);
        g.lineTo(ix0 - off, archY(ix0));
        for (let x = ix0; x <= ix1; x += 6) { const u = (x - 640) / 435, k = sqrt(max(0, 1 - u * u)); g.lineTo(x + (x < 640 ? -off : off) * (1 - k), archY(x) - off * (0.4 + k * 0.6)); }
        g.lineTo(ix1 + off, archY(ix1)); g.lineTo(ix1 + off, SET.yL);
        g.stroke(); g.setLineDash([]);
      };
      archBand(5, 10, GOLD_LO, null);
      archBand(6, 4, GOLD, null);
      archBand(16, 9, GOLD, [9, 5]);
      archBand(15, 2, GOLD_HI, [9, 5]);
      archBand(29, 12, '#1a0e0b', null);
      archBand(29, 5, css(GOLD, 0.8), [2.5, 6]);
      archBand(43, 7, GOLD_LO, null);
      archBand(42, 2.5, GOLD_HI, null);
      archBand(56, 3, css(GOLD, 0.6), null);
      // pilasters: dark shafts with gilt flutes, capitals and bases
      for (const [px0, px1] of [[ox0 + 6, ix0 - 64], [ix1 + 64, ox1 - 6]]) {
        const pw = px1 - px0;
        const sg = g.createLinearGradient(px0, 0, px1, 0); sg.addColorStop(0, '#120a08'); sg.addColorStop(0.5, '#2e1a12'); sg.addColorStop(1, '#100807');
        g.fillStyle = sg; g.fillRect(px0, 206, pw, 296);
        for (let i = 1; i < 4; i++) { const fx = px0 + i * pw / 4; g.fillStyle = css(GOLD_LO, 0.9); g.fillRect(fx - 2.5, 224, 5, 262); g.fillStyle = css(GOLD_HI, 0.55); g.fillRect(fx - 2.5, 224, 1.5, 262); }
        const cap = g.createLinearGradient(0, 186, 0, 210); cap.addColorStop(0, GOLD_HI); cap.addColorStop(1, GOLD_LO);
        g.fillStyle = cap; g.fillRect(px0 - 8, 188, pw + 16, 18); g.fillRect(px0 - 10, 500, pw + 20, 20);
        g.strokeStyle = GOLD_HI; g.lineWidth = 3; g.beginPath(); g.arc(px0 + 6, 178, 9, 0, TAU * 0.8); g.stroke(); g.beginPath(); g.arc(px1 - 6, 178, 9, PI * 0.2, PI * 2); g.stroke();
      }
      // outer frame moulding + entablature
      g.strokeStyle = GOLD; g.lineWidth = 6; g.strokeRect(ox0 + 3, 11, ox1 - ox0 - 6, SET.pitY - 14);
      g.strokeStyle = css(GOLD_HI, 0.6); g.lineWidth = 1.5; g.strokeRect(ox0 + 1, 9, ox1 - ox0 - 2, SET.pitY - 10);
      const en = g.createLinearGradient(0, 6, 0, 26); en.addColorStop(0, GOLD_HI); en.addColorStop(1, GOLD_LO);
      g.fillStyle = en; g.fillRect(ox0 - 12, 4, ox1 - ox0 + 24, 18);
      g.fillStyle = 'rgba(60,40,10,0.7)'; for (let x = ox0; x < ox1; x += 16) g.fillRect(x, 24, 8, 7);
      // cartouche with a lyre at the keystone
      g.save(); g.translate(640, 62);
      const cgr = g.createRadialGradient(-14, -16, 4, 0, 0, 64); cgr.addColorStop(0, GOLD_HI); cgr.addColorStop(0.6, GOLD); cgr.addColorStop(1, GOLD_LO);
      g.fillStyle = cgr; g.beginPath(); g.ellipse(0, 0, 60, 44, 0, 0, TAU); g.fill();
      g.fillStyle = '#1e100c'; g.beginPath(); g.ellipse(0, 0, 47, 33, 0, 0, TAU); g.fill();
      g.strokeStyle = GOLD_HI; g.lineWidth = 3.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-16, 20); g.bezierCurveTo(-32, 0, -28, -18, -14, -24); g.moveTo(16, 20); g.bezierCurveTo(32, 0, 28, -18, 14, -24); g.moveTo(-19, -16); g.lineTo(19, -16); g.moveTo(-15, 20); g.lineTo(15, 20); g.stroke();
      g.lineWidth = 1.2; g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(i * 5, -16); g.lineTo(i * 4, 20); } g.stroke();
      g.restore();
      // spandrel scrolls
      g.strokeStyle = css(GOLD, 0.7); g.lineWidth = 3;
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(640 + sx * 76, 62); g.bezierCurveTo(640 + sx * 200, 26, 640 + sx * 320, 92, 640 + sx * 430, 48); g.stroke(); g.beginPath(); g.arc(640 + sx * 430, 60, 12, 0, TAU * 0.85); g.stroke(); g.beginPath(); g.arc(640 + sx * 250, 52, 7, 0, TAU); g.stroke(); }
      // ---- apron face + footlight shells, the pit floor
      g.fillStyle = '#120c0a'; g.fillRect(ix0, SET.yL, ix1 - ix0, SET.pitY - SET.yL);
      g.fillStyle = 'rgba(255,220,170,0.05)'; for (let x = ix0 + 30; x < ix1; x += 90) g.fillRect(x, SET.yL + 18, 60, 58);
      g.strokeStyle = css(GOLD, 0.45); g.lineWidth = 2; for (let x = ix0 + 30; x < ix1; x += 90) g.strokeRect(x, SET.yL + 18, 60, 58);
      g.fillStyle = goldG(0, SET.yL - 2, 0, SET.yL + 10); g.fillRect(ix0, SET.yL - 2, ix1 - ix0, 12);
      for (let i = 0; i < 11; i++) { const fx = lerp(ix0 + 50, ix1 - 50, i / 10); g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(fx, SET.yL + 3, 16, 7, 0, PI, 0); g.fill(); }
      const pg = g.createLinearGradient(0, SET.pitY, 0, FR.y + FR.h);
      pg.addColorStop(0, '#0e0a0a'); pg.addColorStop(1, '#050405');
      g.fillStyle = pg; g.fillRect(FR.x, SET.pitY, FR.w, FR.y + FR.h - SET.pitY);
      for (let i = 0; i < 40; i++) { const lx = FR.x + 200 + r() * (FR.w - 400), ly = SET.pitY + 10 + pow(r(), 1.5) * 300; g.fillStyle = r() < 0.5 ? 'rgba(220,210,190,0.12)' : 'rgba(200,40,40,0.12)'; g.save(); g.translate(lx, ly); g.rotate(r() * 3); g.fillRect(-8, -4, 16, 8); g.restore(); }
      if (barricade) {
        const by = SET.pitY + 8;
        g.fillStyle = '#2a2c31';
        g.fillRect(ix0 - 60, by - 64, ix1 - ix0 + 120, 7); g.fillRect(ix0 - 60, by - 4, ix1 - ix0 + 120, 6);
        for (let x = ix0 - 60; x < ix1 + 60; x += 12) g.fillRect(x, by - 60, 3, 58);
        g.fillStyle = 'rgba(200,210,230,0.3)'; g.fillRect(ix0 - 60, by - 64, ix1 - ix0 + 120, 2);
        for (let x = ix0 - 60; x < ix1 + 60; x += 130) { g.fillStyle = '#1a1b1f'; g.fillRect(x, by - 68, 7, 70); }
      }
      // ---- scorch: soot plumes up the arch and walls
      if (sc > 0) {
        for (let i = 0; i < 9; i++) {
          const sx = [ix0 - 20, ix1 + 20, 360, 920, 640, 150, 1130, 470, 810][i], sy = [300, 300, 120, 120, 60, 250, 250, 90, 90][i], rr = (120 + r() * 140) * (0.6 + sc * 0.6);
          const sg = g.createRadialGradient(sx, sy + rr * 0.5, 0, sx, sy, rr);
          sg.addColorStop(0, `rgba(10,6,4,${0.75 * sc})`); sg.addColorStop(0.55, `rgba(14,8,6,${0.45 * sc})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = sg; g.beginPath(); g.ellipse(sx, sy, rr * 0.7, rr, 0, 0, TAU); g.fill();
        }
        for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(10,6,4,${0.3 * sc})`; g.lineWidth = 1 + r() * 3; const sx = 130 + r() * 1020; g.beginPath(); g.moveTo(sx, 20 + r() * 60); g.lineTo(sx + (r() - 0.5) * 10, 60 + r() * 200); g.stroke(); }
      }
      // the opening is see-through (the back layer shows behind it)
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(opening); g.globalCompositeOperation = 'source-over';
      // ---- the opening's dressing: valance (border) and the gathered main curtains
      g.save();
      g.clip(opening);
      if (!ruin) {
        curtainGather(g, ix0 - 10, ix0 + 120, 90, SET.yL + 4, ix0 + 26, 300, -1, sc, r);
        curtainGather(g, ix1 + 10, ix1 - 120, 90, SET.yL + 4, ix1 - 26, 300, 1, sc, r);
        valance(g, ix0, ix1, 96, 176, sc, r);
      } else {
        for (let i = 0; i < 10; i++) {
          const sx = i < 5 ? ix0 + r() * 60 : ix1 - r() * 60, L = 40 + r() * 160;
          g.fillStyle = '#120607'; g.beginPath(); g.moveTo(sx - 10, 90); g.lineTo(sx + 10, 90); g.lineTo(sx + 4 + r() * 8, 90 + L); g.lineTo(sx - 6, 90 + L * 0.7); g.closePath(); g.fill();
        }
      }
      g.restore();
      if (ruin) {
        // char everything first, then open the roof and knock a hole through the arch's upper right
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(6,5,6,0.55)'; g.fillRect(FR.x, FR.y, FR.w, FR.h);
        for (let i = 0; i < 18; i++) {
          const sx = FR.x + r() * FR.w, sy = FR.y + r() * 700, rr = 80 + r() * 220;
          const sg = g.createRadialGradient(sx, sy, 0, sx, sy, rr);
          sg.addColorStop(0, 'rgba(4,3,3,0.7)'); sg.addColorStop(1, 'rgba(4,3,3,0)');
          g.fillStyle = sg; g.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
        }
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        g.beginPath(); g.moveTo(FR.x, FR.y);
        for (let x = FR.x; x <= FR.x + FR.w; x += 30) {
          let y = 40 + r() * 40;
          if (x > 760 && x < 1180) y = 120 + sin((x - 760) / 420 * PI) * 70 + r() * 30;
          if (x > 1180 && x < 1500) y = 60 + r() * 50;
          g.lineTo(x, y);
        }
        g.lineTo(FR.x + FR.w, FR.y); g.closePath(); g.fill();
        // ragged holes in the house walls
        for (const [hx, hy, hr] of [[-180, 200, 90], [1420, 240, 110], [40, 120, 50]]) { g.beginPath(); for (let a2 = 0; a2 < TAU; a2 += 0.4) g.lineTo(hx + cos(a2) * hr * (0.6 + r() * 0.5), hy + sin(a2) * hr * (0.6 + r() * 0.5)); g.closePath(); g.fill(); }
        g.globalCompositeOperation = 'source-over';
        // broken ends: exposed brick + burnt joists along the break line
        g.strokeStyle = '#0a0706'; g.lineWidth = 9;
        for (let i = 0; i < 9; i++) { const jx = 780 + i * 46 + r() * 20, jy = 150 + sin((jx - 760) / 420 * PI) * 70; g.beginPath(); g.moveTo(jx, jy + 20); g.lineTo(jx + (r() - 0.5) * 40, jy - 40 - r() * 40); g.stroke(); }
        g.strokeStyle = 'rgba(150,170,220,0.35)'; g.lineWidth = 2;
        g.beginPath(); for (let x = 760; x < 1180; x += 30) g.lineTo(x, 122 + sin((x - 760) / 420 * PI) * 70 + r() * 20); g.stroke();
        // rubble along the pit edge + fallen beams
        for (let i = 0; i < 110; i++) {
          const rx = ix0 - 160 + r() * (ix1 - ix0 + 320), ry = SET.pitY - 18 + pow(r(), 0.7) * 80, rs = 6 + r() * 20;
          g.fillStyle = css(shade('#191514', (r() - 0.5) * 0.5));
          g.beginPath(); g.moveTo(rx - rs, ry); g.lineTo(rx - rs * 0.4, ry - rs * (0.5 + r() * 0.5)); g.lineTo(rx + rs * 0.6, ry - rs * (0.3 + r() * 0.5)); g.lineTo(rx + rs, ry); g.closePath(); g.fill();
          g.fillStyle = 'rgba(140,160,210,0.12)'; g.fillRect(rx - rs * 0.4, ry - rs * 0.55, rs * 0.9, 1.5);
        }
        g.fillStyle = '#0c0908'; g.save(); g.translate(300, 470); g.rotate(-0.35); g.fillRect(0, -10, 380, 20); g.restore();
        g.save(); g.translate(1000, 440); g.rotate(0.6); g.fillRect(-200, -9, 300, 18); g.restore();
        g.strokeStyle = 'rgba(150,170,220,0.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(300, 460); g.lineTo(657, 335); g.stroke();
      }
    }, true);
  }
  // a gathered velvet curtain: top span [xa, xb] at yTop, tied at (tx, ty), flaring to the floor at yBot
  function curtainGather(g, xa, xb, yTop, yBot, tx, ty, side, sc, r) {
    const n = 22;
    const bx0 = xa, bx1 = lerp(xa, xb, 0.72);
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const P = (u) => ({ top: lerp(xa, xb, u), tie: tx + (u - 0.5) * 34 * -side * -1, bot: lerp(bx0, bx1, u) });
      const a = P(u0), b = P(u1);
      const shadeK = 0.5 + 0.5 * sin(i * 1.7 + 0.5);
      const col = mix(shade(VELVET, -0.55), shade(VELVET, 0.25), shadeK);
      g.fillStyle = css(col);
      g.beginPath();
      g.moveTo(a.top, yTop); g.quadraticCurveTo(lerp(a.top, a.tie, 0.5), lerp(yTop, ty, 0.6), a.tie, ty); g.quadraticCurveTo(a.tie, lerp(ty, yBot, 0.4), a.bot, yBot);
      g.lineTo(b.bot, yBot); g.quadraticCurveTo(b.tie, lerp(ty, yBot, 0.4), b.tie, ty); g.quadraticCurveTo(lerp(b.top, b.tie, 0.5), lerp(yTop, ty, 0.6), b.top, yTop);
      g.closePath(); g.fill();
    }
    // vertical shading: darker at the top and the floor
    const vg = g.createLinearGradient(0, yTop, 0, yBot);
    vg.addColorStop(0, 'rgba(0,0,0,0.55)'); vg.addColorStop(0.45, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg; g.fillRect(min(xa, xb) - 40, yTop, abs(xb - xa) + 80, yBot - yTop);
    // tie-back rope
    g.strokeStyle = GOLD_HI; g.lineWidth = 5; g.beginPath(); g.moveTo(tx - 22, ty - 4); g.quadraticCurveTo(tx, ty + 10, tx + 22, ty - 4); g.stroke();
    g.fillStyle = GOLD; g.beginPath(); g.moveTo(tx - 4 * side, ty + 4); g.lineTo(tx - 10 * side, ty + 40); g.lineTo(tx + 4 * side, ty + 40); g.closePath(); g.fill();
    // burnt hem: char gradient + ragged holes
    if (sc > 0) {
      const ch = g.createLinearGradient(0, yBot, 0, yBot - 150 * sc);
      ch.addColorStop(0, `rgba(8,4,3,${0.95 * sc})`); ch.addColorStop(0.4, `rgba(30,10,6,${0.6 * sc})`); ch.addColorStop(1, 'rgba(30,10,6,0)');
      g.fillStyle = ch; g.fillRect(min(xa, xb) - 60, yBot - 150 * sc, abs(xb - xa) + 120, 150 * sc + 4);
      g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      g.beginPath(); g.moveTo(min(bx0, bx1) - 30, yBot + 5);
      for (let x = min(bx0, bx1) - 30; x < max(bx0, bx1) + 30; x += 10) g.lineTo(x, yBot - r() * 40 * sc - (r() < 0.2 ? r() * 60 * sc : 0));
      g.lineTo(max(bx0, bx1) + 30, yBot + 5); g.closePath(); g.fill();
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(lerp(xa, tx, 0.5 + r() * 0.5), ty + 60 + r() * 80, 4 + r() * 8 * sc, 6 + r() * 12 * sc, r(), 0, TAU); g.fill(); }
      g.restore();
    }
  }
  function valance(g, x0, x1, y0, y1, sc, r) {
    const n = 7, w = (x1 - x0) / n;
    g.fillStyle = css(shade(VELVET, -0.4)); g.fillRect(x0, y0 - 30, x1 - x0, 40);
    for (let i = 0; i < n; i++) {
      const a = x0 + i * w, b = a + w, sag = y1 - y0;
      const grd = g.createLinearGradient(0, y0, 0, y0 + sag + 20);
      grd.addColorStop(0, css(shade(VELVET, -0.45))); grd.addColorStop(0.6, css(shade(VELVET, 0.2))); grd.addColorStop(1, css(shade(VELVET, -0.3)));
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(a - 6, y0); g.quadraticCurveTo((a + b) / 2, y0 + sag * 1.5, b + 6, y0); g.closePath(); g.fill();
      g.strokeStyle = css(shade(VELVET, -0.6), 0.6); g.lineWidth = 2;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(a + k * 3, y0 + 4); g.quadraticCurveTo((a + b) / 2, y0 + sag * (0.4 + k * 0.28), b - k * 3, y0 + 4); g.stroke(); }
      // gold fringe along the swag
      g.strokeStyle = css(GOLD_HI, 0.75); g.lineWidth = 1.4;
      for (let t2 = 0; t2 <= 1; t2 += 0.04) {
        const px = lerp(lerp(a - 6, (a + b) / 2, t2), lerp((a + b) / 2, b + 6, t2), t2), py = lerp(lerp(y0, y0 + sag * 1.5, t2), lerp(y0 + sag * 1.5, y0, t2), t2);
        if (sc > 0 && hash(i * 31 + floor(t2 * 25), 4) < sc * 0.35) continue;
        g.beginPath(); g.moveTo(px, py - 2); g.lineTo(px, py + 9); g.stroke();
      }
      g.fillStyle = GOLD; g.beginPath(); g.moveTo(b - 4, y0); g.lineTo(b + 4, y0); g.lineTo(b + 1, y0 + 46); g.lineTo(b - 2, y0 + 46); g.fill();
    }
    if (sc > 0) {
      const ch = g.createLinearGradient(0, y0 - 30, 0, y1 + 30);
      ch.addColorStop(0, `rgba(10,5,3,${0.6 * sc})`); ch.addColorStop(1, 'rgba(10,5,3,0)');
      g.fillStyle = ch; g.fillRect(x0, y0 - 30, (x1 - x0) * 0.6, y1 - y0 + 60);
    }
  }
  // crooked chandelier sprite (300 x 340), hanging point at (150, 0)
  function chandelierSpr(ruin) {
    const R = CS() * 1.5;
    return cached('stage:chand:' + (ruin ? 1 : 0), 300 * R, 340 * R, (g) => {
      g.scale(R, R); g.translate(150, 0);
      const r = NS.rng(271);
      g.strokeStyle = '#2a2418'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 130); g.stroke();
      const gold = g.createLinearGradient(-120, 0, 120, 0); gold.addColorStop(0, GOLD_LO); gold.addColorStop(0.45, GOLD_HI); gold.addColorStop(1, GOLD_LO);
      g.fillStyle = gold; g.strokeStyle = gold;
      // body
      g.beginPath(); g.ellipse(0, 140, 18, 10, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-10, 145); g.quadraticCurveTo(-26, 210, 0, 250); g.quadraticCurveTo(26, 210, 10, 145); g.closePath(); g.fill();
      // arms on two tiers
      g.lineWidth = 4; g.lineCap = 'round';
      const arms = [];
      for (const [ty, rad, n] of [[175, 110, 7], [215, 74, 5]]) {
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n * 2 - 1, ax = u * rad, broken = ty === 175 && i === n - 2;
          g.beginPath(); g.moveTo(0, ty); g.quadraticCurveTo(ax * 0.6, ty + 30, ax, ty - 8 + (broken ? 60 : 0)); g.stroke();
          arms.push([ax, ty - 14 + (broken ? 60 : 0), broken]);
          g.fillRect(ax - 7, ty - 12 + (broken ? 60 : 0), 14, 5);
        }
      }
      // crystal drops (strings)
      for (let i = 0; i < 26; i++) {
        const u = r() * 2 - 1, sx = u * 104, sy = 180 + abs(u) * -6, L = 30 + r() * 70;
        g.strokeStyle = 'rgba(200,210,230,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 2, sy + L); g.stroke();
        g.fillStyle = 'rgba(220,230,255,0.6)'; g.beginPath(); g.moveTo(sx + 2, sy + L - 4); g.lineTo(sx + 6, sy + L + 6); g.lineTo(sx + 2, sy + L + 14); g.lineTo(sx - 2, sy + L + 6); g.closePath(); g.fill();
      }
      // candle sleeves
      g.fillStyle = '#d8d0b8';
      for (const a of arms) g.fillRect(a[0] - 3, a[1] - 14, 6, 14);
      // soot (the ruin's fallen one is charred black)
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = ruin ? 'rgba(8,6,6,0.82)' : 'rgba(10,6,4,0.45)'; g.fillRect(-150, 0, 300, 340);
      g.globalCompositeOperation = 'source-over';
      g.canvas.meta = arms;
    });
  }

  // ---------------------------------------------------------------- reverse view (from the stage into the house)
  const RV = { x: -260, y: -160, w: 1800, h: 900 };
  function houseLayer(sc) {
    const R = CS() * 1.0, key = 'stage:house:' + sc;
    return cached(key, RV.w * R, RV.h * R, (g) => {
      g.scale(R, R); g.translate(-RV.x, -RV.y);
      const r = NS.rng(1313);
      g.fillStyle = '#120b0e'; g.fillRect(RV.x, RV.y, RV.w, RV.h);
      // dome ceiling with ribs
      g.save();
      const dg = g.createRadialGradient(640, -160, 50, 640, -160, 900);
      dg.addColorStop(0, '#2a1c1a'); dg.addColorStop(1, '#0a0607');
      g.fillStyle = dg; g.beginPath(); g.ellipse(640, -120, 1000, 260, 0, 0, TAU); g.fill();
      g.strokeStyle = css(GOLD, 0.35); g.lineWidth = 3;
      for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(640 + i * 30, -160); g.quadraticCurveTo(640 + i * 110, -20, 640 + i * 190, 120); g.stroke(); }
      g.strokeStyle = css(GOLD_HI, 0.45); g.lineWidth = 5; g.beginPath(); g.ellipse(640, -160, 160, 50, 0, 0, TAU); g.stroke();
      g.restore();
      // balconies: U-shaped fronts (far centre high, near sides low)
      const tier = (yc, ye, fh, seatsUp) => {
        const curve = (x) => { const u = (x - 640) / 900; return yc + (ye - yc) * u * u; };
        // seat rows behind the front
        g.fillStyle = '#0a0607';
        g.beginPath(); g.moveTo(RV.x, curve(RV.x) - seatsUp); for (let x = RV.x; x <= RV.x + RV.w; x += 20) g.lineTo(x, curve(x) - seatsUp); g.lineTo(RV.x + RV.w, curve(RV.x + RV.w)); for (let x = RV.x + RV.w; x >= RV.x; x -= 20) g.lineTo(x, curve(x)); g.closePath(); g.fill();
        for (let row = 1; row < 5; row++) {
          g.strokeStyle = `rgba(90,30,36,${0.5 - row * 0.08})`; g.lineWidth = 6 - row;
          g.beginPath(); for (let x = RV.x; x <= RV.x + RV.w; x += 20) { const y = curve(x) - seatsUp * row / 5; if (x === RV.x) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
          g.fillStyle = `rgba(70,20,26,${0.45 - row * 0.06})`;
          for (let x = RV.x + (row % 2) * 9; x <= RV.x + RV.w; x += 18) g.fillRect(x, curve(x) - seatsUp * row / 5 - 8 + row, 12, 8 - row);
        }
        // gilt front
        const gg = g.createLinearGradient(0, yc - 10, 0, yc + fh + 30);
        gg.addColorStop(0, GOLD_HI); gg.addColorStop(0.4, GOLD); gg.addColorStop(1, GOLD_LO);
        g.fillStyle = gg;
        g.beginPath(); for (let x = RV.x; x <= RV.x + RV.w; x += 16) g.lineTo(x, curve(x)); for (let x = RV.x + RV.w; x >= RV.x; x -= 16) { const u = (x - 640) / 900; g.lineTo(x, curve(x) + fh * (1 + u * u * 1.4)); } g.closePath(); g.fill();
        g.fillStyle = 'rgba(40,24,6,0.6)';
        for (let x = RV.x + 10; x <= RV.x + RV.w; x += 34) { const u = (x - 640) / 900; g.beginPath(); g.ellipse(x, curve(x) + fh * 0.5 * (1 + u * u * 1.4), 8 * (1 + u * u), 5 * (1 + u * u * 1.4), 0, 0, TAU); g.fill(); }
        // soffit shadow below
        g.fillStyle = 'rgba(4,2,3,0.85)';
        g.beginPath(); for (let x = RV.x; x <= RV.x + RV.w; x += 16) { const u = (x - 640) / 900; g.lineTo(x, curve(x) + fh * (1 + u * u * 1.4)); } for (let x = RV.x + RV.w; x >= RV.x; x -= 16) { const u = (x - 640) / 900; g.lineTo(x, curve(x) + fh * (1 + u * u * 1.4) + 26 * (1 + u * u)); } g.closePath(); g.fill();
      };
      tier(118, 300, 24, 70);
      tier(262, 430, 30, 60);
      // rear stalls wall under the lower balcony: doors + exit signs
      g.fillStyle = '#0b0708'; g.fillRect(RV.x, 300, RV.w, 160);
      for (const ex of [330, 950]) {
        g.fillStyle = '#05040a'; g.fillRect(ex - 34, 340, 68, 96);
        g.fillStyle = '#1a0a0a'; g.fillRect(ex - 28, 318, 56, 18);
        g.fillStyle = '#ff4030'; g.font = NS.font(14, F.title); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', ex, 327);
      }
      // side boxes near the proscenium (close: big)
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? RV.x : 1180, x1 = side < 0 ? 100 : RV.x + RV.w;
        for (const [yt, yf] of [[-40, 120], [170, 330]]) {
          g.fillStyle = '#070506'; g.fillRect(x0, yt, x1 - x0, yf - yt);
          g.fillStyle = css(VELVET, 0.85); g.fillRect(side < 0 ? x1 - 40 : x0, yt, 40, yf - yt);
          const gg = g.createLinearGradient(0, yf, 0, yf + 60); gg.addColorStop(0, GOLD_HI); gg.addColorStop(0.5, GOLD); gg.addColorStop(1, GOLD_LO);
          g.fillStyle = gg; g.fillRect(x0, yf, x1 - x0, 60);
          g.fillStyle = 'rgba(30,18,6,0.7)'; for (let x = x0 + 8; x < x1; x += 18) g.fillRect(x, yf + 12, 8, 36);
        }
      }
      // the pit floor (where the crowd stands)
      const pf = g.createLinearGradient(0, 440, 0, 740);
      pf.addColorStop(0, '#0a0708'); pf.addColorStop(1, '#16100e');
      g.fillStyle = pf; g.fillRect(RV.x, 440, RV.w, 300);
      if (sc > 0) {
        for (let i = 0; i < 8; i++) {
          const sx = RV.x + r() * RV.w, sy = r() * 300, rr = 120 + r() * 200;
          const sg = g.createRadialGradient(sx, sy + rr * 0.4, 0, sx, sy, rr);
          sg.addColorStop(0, `rgba(8,5,4,${0.6 * sc})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = sg; g.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
        }
      }
    }, true);
  }
  // near stage floor for the reverse view (boards toward the house), 1280 x 260 below the lip at y 470
  function revFloorTex() {
    const R = CS();
    return cached('stage:revfloor', 1600 * R, 300 * R, (g) => {
      g.scale(R, R);
      const r = NS.rng(42);
      const fg = g.createLinearGradient(0, 0, 0, 300);
      fg.addColorStop(0, '#1c1612'); fg.addColorStop(1, '#0c0908');
      g.fillStyle = fg; g.fillRect(0, 0, 1600, 300);
      for (let i = -40; i <= 40; i++) { g.strokeStyle = `rgba(0,0,0,${0.5 + r() * 0.3})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(800 + i * 22, 0); g.lineTo(800 + i * 60, 300); g.stroke(); }
      for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(230,210,180,${r() * 0.05})`; g.fillRect(r() * 1600, r() * 300, 10 + r() * 40, 1.2); }
      // cables
      g.strokeStyle = '#050505'; g.lineWidth = 6; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(r() * 1600, 300); g.bezierCurveTo(r() * 1600, 200, r() * 1600, 100, 500 + r() * 600, 0); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(r() * 1600, 300); g.bezierCurveTo(r() * 1600, 200, r() * 1600, 100, 500 + r() * 600, 0); g.stroke(); }
      // the lip edge (gilt) at the top
      g.fillStyle = GOLD; g.fillRect(0, 0, 1600, 5); g.fillStyle = GOLD_HI; g.fillRect(0, 0, 1600, 1.5);
    });
  }

  // ---------------------------------------------------------------- helpers
  function ambient(power) {
    // darkening overlay (source-atop on the work canvas): returns [color, alpha]
    const p = clamp(power);
    if (p < 0.3) return [mix('#03050b', '#120c08', p / 0.3), lerp(0.88, 0.62, p / 0.3)];
    if (p < 0.75) return [mix('#120c08', '#0a0812', (p - 0.3) / 0.45), lerp(0.62, 0.22, (p - 0.3) / 0.45)];
    return [[10, 8, 18], lerp(0.22, 0, (p - 0.75) / 0.25)];
  }
  // draw straight into ctx when nothing needs darkening (full power), else into a frame-sized work canvas
  function workFor(ctx, power, o) {
    if (!o.thermal && !((o.ruin || 0) > 0.5) && ambient(power)[1] < 0.004) return { direct: true, g: ctx };
    return workCanvas();
  }
  function workCanvas() {
    const sw = round(W * CS()), sh = round(H * CS());
    const c = scratch('stageWork', sw, sh), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, sw, sh);
    g.setTransform(CS(), 0, 0, CS(), 0, 0);
    return { c, g };
  }
  function flushWork(ctx, wk, power, o) {
    if (wk.direct) return;
    const g = wk.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if ((o.ruin || 0) > 0.5 && !o.thermal) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(8,14,30,0.5)'; g.fillRect(0, 0, wk.c.width, wk.c.height);
      g.fillStyle = 'rgba(70,95,150,0.12)'; g.fillRect(0, 0, wk.c.width, wk.c.height);
    } else if (o.thermal) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(6,2,16,0.72)'; g.fillRect(0, 0, wk.c.width, wk.c.height);
      g.fillStyle = 'rgba(60,24,130,0.3)'; g.fillRect(0, 0, wk.c.width, wk.c.height);
    } else {
      const [ac, aa] = ambient(power);
      if (aa > 0.004) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = css(ac, aa); g.fillRect(0, 0, wk.c.width, wk.c.height); }
    }
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(wk.c, 0, 0, W, H);
  }
  // camera for a layer at depth d (with the 'low' floor squash: far layers drop toward the lip)
  function layerCam(cam, d, low) {
    const pc = parallaxCam(cam, d);
    return pc;
  }
  function withCam(g, cam, d, dy, fn) {
    const pc = parallaxCam(cam, d);
    g.save();
    g.translate(W / 2, H / 2); if (pc.rot) g.rotate(pc.rot); g.scale(pc.zoom, pc.zoom); g.translate(-pc.x, -pc.y + (dy || 0));
    fn(g);
    g.restore();
  }
  function projF(cam, d, dy, x, y) { return camPoint(parallaxCam(cam, d), x, y + (dy || 0)); }

  // ---------------------------------------------------------------- kit.stageSet
  // kit.stageSet(ctx, S, {cam: 'wide'|'pit'|'low'|'drummer'|'side' | {x, y, zoom, low}, pass 'all'|'back'|'frame'|'fx',
  //   power 0..1, lights 0..1, colors, pattern, haze 0..1, scorch 0..1, ruin 0..1, curtainFire 0..1, pyro (k or [k x4]),
  //   lasers 0..1, moon 0..1, kit (draw the drum kit in the back pass, default true), micstand, barricade, thermal, sky})
  //   -> info {angle, cam, spots: {vex, granny, tiny, noodle: [x, y, s]}, drums: [x, y, s], mic, amps, pit: {x0, x1, yFar,
  //      yNear, sFar, sNear}, pyro: [[x, y, s] x4], fixtures: [[x, y], ...], lipY, curtainL: [x, y], floor(u, f) -> [x, y, s]}
  function stageSet(ctx, S, o) {
    o = o || {};
    const ang = typeof o.cam === 'string' ? o.cam : (o.cam && o.cam.rev ? (o.cam.side ? 'side' : 'drummer') : (o.cam ? 'custom' : 'wide'));
    const base = ANGLES[ang] || ANGLES.wide;
    const cam = Object.assign({}, base, typeof o.cam === 'object' ? o.cam : {});
    if (cam.rev) return stageReverse(ctx, S, o, cam, ang);
    const t = tOf(S), pass = o.pass || 'all', power = o.power == null ? 1 : o.power;
    const ruin = (o.ruin || 0) > 0.5, sc = round(clamp(o.scorch == null ? 0.6 : o.scorch) * 2) / 2;
    const low = cam.low || 0, sq = 1 - low * 0.85, dyB = (SET.yL - SET.yB) * (1 - sq);
    const dB = SET.dB;
    // floor mapping: u across (0 = audience left), f depth (0 = back wall, 1 = lip)
    const floorPt = (u, f, lift) => {
      const sy = SET.yL - (SET.yL - lerp(SET.yB, SET.yL, f)) * sq;
      const x = lerp(lerp(SET.x0B, SET.x0L, f), lerp(SET.x1B, SET.x1L, f), u);
      const d = lerp(dB, 1, f), pc = parallaxCam(cam, d);
      const p = camPoint(pc, x, sy - (lift || 0) * lerp(0.86, 1, f));
      return [p[0], p[1], pc.zoom * lerp(0.55, 0.66, f)];
    };
    const info = { angle: ang, cam, floor: floorPt };
    info.spots = { vex: floorPt(0.5, 0.9), granny: floorPt(0.25, 0.66), noodle: floorPt(0.75, 0.66), tiny: floorPt(0.5, 0.06, 40) };
    info.drums = floorPt(0.5, 0.14, 36);
    info.mic = floorPt(0.56, 0.95);
    info.amps = [floorPt(0.06, 0.03), floorPt(0.17, 0.03), floorPt(0.83, 0.03), floorPt(0.94, 0.03)];
    info.pyro = [floorPt(0.02, 0.985), floorPt(0.3, 0.995), floorPt(0.7, 0.995), floorPt(0.98, 0.985)];
    info.fixtures = []; for (let i = 0; i < 9; i++) info.fixtures.push(projF(cam, dB, dyB, 280 + i * 90, 182));
    const lip = camPoint(cam, 640, SET.yL);
    info.lipY = lip[1];
    info.curtainL = camPoint(cam, SET.x1L - 40, SET.yL);
    const pz = cam.zoom;
    const pitTop = camPoint(cam, 640, SET.pitY + 14)[1];
    info.pit = { x0: camPoint(cam, 60, 0)[0], x1: camPoint(cam, 1220, 0)[0], yFar: pitTop, yNear: pitTop + 260 * pz, sFar: 0.62 * pz, sNear: 1.0 * pz };
    if (low > 0.7) Object.assign(info.pit, { yFar: H + 60, yNear: H + 200, none: true });   // the photo pit: nobody in front
    info.order = ['back', 'band', 'frame', 'crowd', 'fx'];

    if (pass === 'all' || pass === 'back') {
      if (ruin) {
        if (o.thermal) { const tg = ctx.createLinearGradient(0, 0, 0, H); tg.addColorStop(0, '#05020c'); tg.addColorStop(1, '#120830'); ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H); }
        else sky(ctx, S, Object.assign({ moon: { x: 940, y: 80, r: 30 }, clouds: 0.7, stars: 0.6 }, o.sky || {}));
      }
      const wk = workFor(ctx, power, o), g = wk.g;
      withCam(g, cam, dB, dyB, (gg) => gg.drawImage(stageBackLayer(sc, ruin), BK.x, BK.y, BK.w, BK.h));
      // floor strips (back -> lip)
      const ft = stageFloorTex(ruin), n = 14, ftR = ft.width / FL.w;
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n, d = lerp(dB, 1, (f0 + f1) / 2);
        const sy0 = lerp(SET.yB, SET.yL, f0), sy1 = lerp(SET.yB, SET.yL, f1);
        const ty0 = SET.yL - (SET.yL - sy0) * sq, ty1 = SET.yL - (SET.yL - sy1) * sq;
        withCam(g, cam, d, 0, (gg) => gg.drawImage(ft, 0, (sy0 - FL.y) * ftR, ft.width, max(1, (sy1 - sy0) * ftR), FL.x, ty0, FL.w, ty1 - ty0 + 0.8));
      }
      // props on the floor
      const ampOn = clamp(power * 1.4);
      for (const a of info.amps) amp(g, a[0], a[1], a[2] * 0.56, { on: ampOn, scorch: ruin ? 1 : sc * 0.4 });
      // drum riser
      const rl = floorPt(0.36, 0.0), rr = floorPt(0.64, 0.0), fl = floorPt(0.36, 0.24), fr = floorPt(0.64, 0.24);
      const rh = 36 * fl[2] / 0.5;
      g.fillStyle = '#0c0b0e';
      g.beginPath(); g.moveTo(rl[0], rl[1] - rh); g.lineTo(rr[0], rr[1] - rh); g.lineTo(fr[0], fr[1] - rh); g.lineTo(fl[0], fl[1] - rh); g.closePath(); g.fill();
      g.fillStyle = '#16151a'; g.fillRect(fl[0], fl[1] - rh, fr[0] - fl[0], rh);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(fl[0], fl[1] - rh, fr[0] - fl[0], 1.5);
      if (power > 0.05) { g.fillStyle = css(C.stageMagenta, 0.5 * power); for (let x = fl[0] + 6; x < fr[0] - 4; x += 10) g.fillRect(x, fl[1] - rh * 0.5, 4, 2); }
      // monitors (wedges) and cables
      for (const u of [0.3, 0.7]) {
        const m = floorPt(u, 0.97), s2 = m[2];
        g.fillStyle = '#111114'; g.beginPath(); g.moveTo(m[0] - 46 * s2, m[1]); g.lineTo(m[0] + 46 * s2, m[1]); g.lineTo(m[0] + 40 * s2, m[1] - 38 * s2); g.lineTo(m[0] - 40 * s2, m[1] - 28 * s2); g.closePath(); g.fill();
        g.fillStyle = '#26272c'; g.fillRect(m[0] - 34 * s2, m[1] - 28 * s2, 68 * s2, 22 * s2);
      }
      if (o.micstand !== false && !ruin) {
        const m = info.mic, s2 = m[2];
        g.strokeStyle = '#1a1b1f'; g.lineWidth = 4 * s2;
        g.beginPath(); g.moveTo(m[0], m[1]); g.lineTo(m[0], m[1] - 190 * s2); g.lineTo(m[0] - 30 * s2, m[1] - 214 * s2); g.stroke();
        g.beginPath(); g.moveTo(m[0] - 28 * s2, m[1]); g.lineTo(m[0], m[1] - 14 * s2); g.lineTo(m[0] + 28 * s2, m[1]); g.stroke();
        // the setlist taped by the stand (tiny here; use kit.setlist for the insert)
        g.save(); g.translate(m[0] + 26 * s2, m[1] - 2 * s2); g.scale(1, 0.38); g.rotate(0.2);
        g.fillStyle = '#e8e6de'; g.fillRect(-20 * s2, -28 * s2, 40 * s2, 52 * s2);
        g.fillStyle = 'rgba(20,20,24,0.6)'; for (let i = 0; i < 7; i++) g.fillRect(-15 * s2, (-20 + i * 6) * s2, (20 + hash(i, 3) * 10) * s2, 2.4 * s2);
        g.fillStyle = 'rgba(20,10,5,0.8)'; g.fillRect(-20 * s2, 18 * s2, 40 * s2, 6 * s2);
        g.restore();
      }
      if (o.kit !== false && !ruin) drumKit(g, info.drums[0], info.drums[1], info.drums[2] * 0.56, { S });
      flushWork(ctx, wk, power, o);
    }
    if (pass === 'all' || pass === 'frame') {
      const wk = workFor(ctx, power, o), g = wk.g;
      withCam(g, cam, 1, 0, (gg) => gg.drawImage(stageFrameLayer(sc, ruin, o.barricade !== false && !ruin), FR.x, FR.y, FR.w, FR.h));
      // chandelier (sways; crooked)
      if (!ruin) {
        const sw = 0.13 + 0.015 * sin(t * 0.6) + 0.006 * sin(t * 1.7);
        withCam(g, cam, SET.dC, 0, (gg) => { gg.save(); gg.translate(430, -170); gg.rotate(sw); gg.drawImage(chandelierSpr(false), -150, 0, 300, 340); gg.restore(); });
      } else {
        withCam(g, cam, 0.9, 0, (gg) => { gg.save(); gg.translate(560, 452); gg.rotate(-1.35); gg.scale(0.62, 0.62); gg.drawImage(chandelierSpr(true), -150, -170, 300, 340); gg.restore(); });
      }
      flushWork(ctx, wk, power, o);
      // emissive: exit signs, chandelier bulbs, marquee bulbs
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const ex of [-170, 1450]) { const p = camPoint(cam, ex, 484); drawGlow(ctx, p[0], p[1], 70 * cam.zoom, '#ff3020', o.thermal ? 0 : 0.5); }
      if (!ruin && power > 0.02 && !o.thermal) {
        const sw = 0.13 + 0.015 * sin(t * 0.6) + 0.006 * sin(t * 1.7);
        const arms = (CACHE.get('stage:chand:0') || {}).c;
        const list = arms && arms.meta ? arms.meta : [];
        const pc = parallaxCam(cam, SET.dC);
        list.forEach((a, i) => {
          if (a[2]) return;
          const on = hash(i, 5) < 0.55 ? flicker(t, i + 3, 0.6) : 0;
          if (on <= 0) return;
          const lx = 430 + (a[0] * cos(sw) - (a[1] - 14) * sin(sw)), ly = -170 + (a[0] * sin(sw) + (a[1] - 14) * cos(sw));
          const p = camPoint(pc, lx, ly);
          drawGlow(ctx, p[0], p[1], 26 * pc.zoom, '#ffd8a0', 0.8 * on * clamp(power * 2));
        });
        // bulbs around the arch (chase: one step per beat)
        if (power > 0.55) {
          const step = floor((S && S.beat != null ? S.beat : t / 0.4)), bk = (power - 0.55) / 0.45;
          for (let i = 0; i <= 40; i++) {
            const x = lerp(SET.x0L - 40, SET.x1L + 40, i / 40), u = (x - 640) / 435, k = sqrt(max(0, 1 - u * u));
            const p = camPoint(cam, x + (x < 640 ? -40 : 40) * (1 - k), archY(min(SET.x1L, max(SET.x0L, x))) - 50 * (0.4 + k * 0.6));
            const on = (i + step) % 3 === 0 ? 1 : 0.35;
            drawGlow(ctx, p[0], p[1], 14 * cam.zoom, '#ffcf7a', on * bk * 0.9, 'hot');
          }
        }
      }
      ctx.restore();
      stageFrameFx(ctx, S, o, info, cam, power, ruin);
    }
    if (pass === 'all' || pass === 'fx') stageFx(ctx, S, o, info, cam, power, ruin);
    return info;
  }
  // footlights, the curtain fire and pyro jets: at the lip, behind the crowd (drawn with the frame pass)
  function stageFrameFx(ctx, S, o, info, cam, power, ruin) {
    const t = tOf(S);
    ctx.save();
    // footlights
    if (power > 0.4 && !ruin && !o.thermal) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 11; i++) { const p = camPoint(cam, lerp(SET.x0L + 50, SET.x1L - 50, i / 10), SET.yL - 2); drawGlow(ctx, p[0], p[1], 40 * cam.zoom, '#ffcf8a', 0.4 * (power - 0.4) / 0.6); }
    }
    // the curtain fire (stage left = audience right curtain)
    const cf = o.curtainFire || 0;
    if (cf > 0.01 && !ruin) {
      const p = camPoint(cam, SET.x1L - 50, SET.yL - 4), z = cam.zoom;
      ctx.globalCompositeOperation = 'source-over';
      const ch = (60 + 240 * cf) * z;
      ctx.save(); ctx.translate(p[0] - 8 * z, p[1]); ctx.scale(1, ch * 1.25 / (55 * z));
      const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 55 * z);
      cg.addColorStop(0, 'rgba(8,3,2,0.9)'); cg.addColorStop(0.6, 'rgba(14,5,3,0.55)'); cg.addColorStop(1, 'rgba(14,5,3,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, 55 * z, PI, TAU); ctx.fill(); ctx.restore();
      fire(ctx, t, p[0] - 6 * z, p[1] - ch * 0.15, (24 + 30 * cf) * z, ch * 0.75, min(1, cf * 3), 86);
      embers(ctx, S, { x: p[0] - 40 * z, y: p[1] - ch * 1.6, w: 70 * z, h: ch * 1.4, count: floor(6 + cf * 14), k: min(1, cf * 2), seed: 9 });
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, p[0], p[1] - ch * 0.4, 160 * z * (0.6 + cf), C.fire, 0.3 * min(1, cf * 2));
    }
    // pyro jets
    if (o.pyro && !ruin) {
      const ks = Array.isArray(o.pyro) ? o.pyro : [o.pyro, o.pyro, o.pyro, o.pyro];
      info.pyro.forEach((p, i) => { if (ks[i] > 0.01) pyro(ctx, S, p[0], p[1], ks[i], { s: p[2] * 1.6, seed: i + 1 }); });
    }
    ctx.restore();
  }
  function stageFx(ctx, S, o, info, cam, power, ruin) {
    const t = tOf(S), K = fk(S);
    const lk = (o.lights == null ? power : o.lights) * (o.thermal ? 0 : 1);
    ctx.save();
    if (lk > 0.01 && !ruin) stageLights(ctx, S, { k: lk, colors: o.colors, pattern: o.pattern, from: info.fixtures, haze: o.haze, info });
    if ((o.lasers || 0) > 0 && !ruin) lasers(ctx, S, { k: o.lasers, origin: camPoint(parallaxCam(cam, SET.dB), 640, 300), y: info.pit.yNear });
    // moonlight shafts through the roof holes
    const mk = o.moon == null ? (ruin ? 0.8 : (1 - power) * 0.5) : o.moon;
    if (mk > 0.01 && !o.thermal) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [mx, ma] of [[360, 0.32], [880, 0.22], [1040, 0.28]]) {
        const p = camPoint(cam, mx, -40);
        beamRaw(ctx, p[0], p[1], PI / 2 + ma * 0.4, 0.09, 700 * cam.zoom, '#8fa6e8', 0.35 * mk, { motes: 12, t, seed: mx });
      }
    }
    ctx.restore();
  }

  // reverse view: the house from the stage ('drummer': centred behind the kit; 'side': from the wing, over a shoulder)
  function stageReverse(ctx, S, o, cam, ang) {
    const t = tOf(S), pass = o.pass || 'all', power = o.power == null ? 1 : o.power;
    const sc = round(clamp(o.scorch == null ? 0.6 : o.scorch) * 2) / 2, side = ang === 'side' || cam.side;
    const sk = side ? -0.14 : 0, sx = side ? 180 : 0;
    const hp = (x, y, d) => { const pc = parallaxCam(cam, d || 0.7); const p = camPoint(pc, x - sx * (d || 0.7), y); return [p[0], p[1] + sk * (p[0] - 640)]; };
    const info = { angle: ang, cam, rev: true };
    if (!side) {
      info.spots = { vex: [640, 610, 0.95], granny: [320, 650, 1.05], noodle: [965, 650, 1.05], tiny: [640, 830, 1.5] };
      info.drums = [640, 815, 1.1];
      info.pit = { x0: -80, x1: 1360, yFar: 440, yNear: 610, sFar: 0.26, sNear: 0.6 };
    } else {
      info.spots = { granny: [300, 860, 1.7], vex: [760, 620, 0.95], noodle: [1060, 590, 0.85], tiny: [520, 560, 0.7] };
      info.drums = [520, 575, 0.55];
      info.pit = { x0: 520, x1: 1420, yFar: 420, yNear: 600, sFar: 0.26, sNear: 0.62 };
    }
    info.lipY = side ? 530 : 520;
    info.order = ['back', 'crowd', 'frame', 'band', 'fx'];
    info.floor = (u, f) => [lerp(-100, 1380, u), lerp(info.lipY, 760, f), lerp(0.6, 1.4, f)];
    info.fixtures = []; for (let i = 0; i < 7; i++) info.fixtures.push([140 + i * 167, -30]);
    info.pyro = [[120, info.lipY + 10, 1], [1160, info.lipY + 10, 1]];
    if (pass === 'all' || pass === 'back') {
      const wk = workFor(ctx, power, o), g = wk.g;
      g.save();
      if (side) { g.translate(0, 0); g.transform(1, sk, 0, 1, 0, -sk * 640); }
      withCam(g, cam, 0.7, 0, (gg) => { gg.translate(-sx * 0.7, 0); gg.drawImage(houseLayer(sc), RV.x, RV.y, RV.w, RV.h); });
      // chandelier over the house
      const sw = -0.1 + 0.015 * sin(t * 0.6);
      withCam(g, cam, 0.8, 0, (gg) => { gg.translate(640 - sx * 0.8, -150); gg.rotate(sw); gg.drawImage(chandelierSpr(false), -150 * 0.9, 0, 270, 306); });
      g.restore();
      flushWork(ctx, wk, power, o);
      // exit glows
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const ex of [330, 950]) { const p = hp(ex, 327, 0.7); drawGlow(ctx, p[0], p[1], 50, '#ff3020', 0.5); }
      ctx.restore();
    }
    if (pass === 'all' || pass === 'frame') {
      const wk = workFor(ctx, power, o), g = wk.g;
      // near stage floor below the lip
      const ft = revFloorTex();
      g.save();
      if (side) { g.translate(640, info.lipY); g.rotate(-0.12); g.translate(-640, -info.lipY); }
      g.drawImage(ft, -160, info.lipY, 1600, 300);
      // monitor backs at the lip
      for (const mx of side ? [700, 1000] : [420, 860]) { g.fillStyle = '#0d0d10'; g.beginPath(); g.moveTo(mx - 50, info.lipY + 40); g.lineTo(mx + 50, info.lipY + 40); g.lineTo(mx + 40, info.lipY + 4); g.lineTo(mx - 40, info.lipY + 10); g.closePath(); g.fill(); }
      g.restore();
      // proscenium from behind: dark frame at the edges + curtain linings
      g.fillStyle = '#0a0607';
      if (!side) {
        g.beginPath(); g.moveTo(0, 0); g.lineTo(1280, 0); g.lineTo(1280, 60); for (let x = 1280; x >= 0; x -= 20) g.lineTo(x, 40 + 30 * pow((x - 640) / 640, 2)); g.closePath(); g.fill();
        for (const s2 of [-1, 1]) {
          const x0 = s2 < 0 ? 0 : 1280;
          g.fillStyle = '#0a0607'; g.fillRect(s2 < 0 ? 0 : 1220, 0, 60, 720);
          for (let i = 0; i < 8; i++) { g.fillStyle = css(mix('#1a0608', VELVET, 0.3 + 0.3 * sin(i * 1.9)), 1); g.beginPath(); g.moveTo(x0 + s2 * -(40 + i * 9), 40); g.quadraticCurveTo(x0 + s2 * -(70 + i * 5), 300, x0 + s2 * -(50 + i * 12), 720); g.lineTo(x0 + s2 * -(60 + i * 12), 720); g.quadraticCurveTo(x0 + s2 * -(80 + i * 5), 300, x0 + s2 * -(48 + i * 9), 40); g.closePath(); g.fill(); }
        }
      } else {
        // a black curtain leg in the near foreground (left) + an amp stack
        g.fillStyle = '#050405'; g.beginPath(); g.moveTo(0, 0); g.lineTo(170, 0); g.quadraticCurveTo(150, 360, 190, 720); g.lineTo(0, 720); g.closePath(); g.fill();
        for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.beginPath(); g.moveTo(20 + i * 26, 0); g.quadraticCurveTo(10 + i * 26, 360, 26 + i * 28, 720); g.lineTo(34 + i * 28, 720); g.quadraticCurveTo(18 + i * 26, 360, 28 + i * 26, 0); g.closePath(); g.fill(); }
        g.fillStyle = '#0a0607'; g.fillRect(0, 0, 1280, 26);
        amp(g, 330, 700, 1.25, { on: clamp(power * 1.4) });
      }
      flushWork(ctx, wk, power, o);
    }
    if (pass === 'all' || pass === 'fx') {
      const lk = (o.lights == null ? power : o.lights);
      ctx.save();
      if (lk > 0.01) {
        // backlight from the truss above/behind the camera into the house
        stageLights(ctx, S, { k: lk, colors: o.colors, pattern: o.pattern || 'fan', from: info.fixtures, haze: o.haze, info, target: { y: 470, x0: -100, x1: 1380 } });
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, 640, -60, 700, '#fff0d0', 0.12 * lk * fk(S));
      }
      if ((o.lasers || 0) > 0) lasers(ctx, S, { k: o.lasers, origin: [side ? 300 : 640, 760], y: 140, spread: 1.0 });
      if (o.pyro) { const ks = Array.isArray(o.pyro) ? o.pyro : [o.pyro, o.pyro]; info.pyro.forEach((p, i) => { if (ks[i] > 0.01) pyro(ctx, S, p[0], p[1], ks[i], { s: 1.6, seed: i + 4 }); }); }
      ctx.restore();
    }
    return info;
  }

  // kit.worldWarm(list) builds heavy caches ahead (call from a shot's warm()): 'stage', 'ruin', 'house', 'street', 'sky',
  //   'van', 'fx'. Safe to call any time; returns the world cache bytes.
  function worldWarm(list) {
    for (const k of list || []) {
      if (k === 'stage') { stageBackLayer(0.5, false); stageFloorTex(false); stageFrameLayer(0.5, false, true); chandelierSpr(false); kickLogo(); }
      else if (k === 'ruin') { stageBackLayer(0.5, true); stageFloorTex(true); stageFrameLayer(0.5, true, false); chandelierSpr(true); }
      else if (k === 'house') { houseLayer(0.5); revFloorTex(); chandelierSpr(false); }
      else if (k === 'street') { asphaltTex('#20232c', 1); concreteTex('#34363d', 2); streakSpr(C.sodium); }
      else if (k === 'sky') { moonSpr(); cloudTex(0, C.night0, C.night2, false); cloudTex(1, C.night0, C.night2, false); }
      else if (k === 'van') { vanBody(0, false); vanLogoSpr(); }
      else if (k === 'fx') { for (let i = 0; i < 4; i++) { flashSpr(i); tongueSpr(i, false); tongueSpr(i, true); } coneSpr('#ffffff', 'cut'); }
    }
    return BYTES;
  }
  // ---------------------------------------------------------------- stage lights, lasers, pyro
  // kit.stageLights(ctx, S, {k, colors, pattern 'sweep'|'fan'|'chase'|'down'|'strobe'|'wash', from: [[x, y], ...], target:
  //   {y, x0, x1}, haze, info}) additive beams from fixtures; colours change at most once per beat; strobe at most 1/beat.
  function stageLights(ctx, S, o) {
    o = o || {};
    const t = tOf(S), k = clamp(o.k == null ? 1 : o.k), K = fk(S);
    if (k <= 0.005) return;
    const beat = S && S.beat != null ? S.beat : t / 0.4, bi = floor(beat), bar = floor(beat / 4);
    const cols = o.colors || [C.stageBlue, C.stageMagenta, '#ffb347', '#e8f0ff'];
    const from = o.from || (o.info && o.info.fixtures) || DEF_FIX;
    const tg = o.target || { y: (o.info && o.info.lipY) || 494, x0: 200, x1: 1080 };
    const pat = o.pattern || 'sweep';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = from.length;
    from.forEach((f, i) => {
      let tx, a = 1;
      const u = n > 1 ? i / (n - 1) : 0.5;
      if (pat === 'sweep') tx = lerp(tg.x0, tg.x1, 0.5 + 0.5 * sin(beat * PI * 0.25 + i * 0.7));
      else if (pat === 'fan') tx = lerp(tg.x0, tg.x1, u) + (u - 0.5) * 300 * sin(beat * PI * 0.125);
      else if (pat === 'chase') { tx = lerp(tg.x0, tg.x1, u); a = (i + bi) % 3 === 0 ? 1 : 0.15; }
      else if (pat === 'strobe') { tx = lerp(tg.x0, tg.x1, u); const since = beat - bi; a = since < 0.12 ? 1 : 0.08; a = lerp(0.08, a, K); }
      else tx = f[0] + (u - 0.5) * 60;   // down / wash
      const col = cols[(i + bar) % cols.length];
      const dx = tx - f[0], dy = tg.y - f[1], len = hypot(dx, dy) * 1.05, angle = atan2(dy, dx);
      beamRaw(ctx, f[0], f[1], angle, pat === 'wash' ? 0.32 : 0.14, len, col, 0.42 * k * a, { motes: 10, t, seed: i * 7 + 1, core: false });
      drawGlow(ctx, f[0], f[1], 22, '#ffffff', 0.7 * k * a, 'hot');
      drawGlow(ctx, f[0], f[1], 60, col, 0.35 * k * a);
      // pool where it lands
      ctx.save(); ctx.translate(tx, tg.y); ctx.scale(1, 0.25); drawGlow(ctx, 0, 0, 120, col, 0.3 * k * a, 'flat'); ctx.restore();
    });
    // a colour backwash behind the band (changes per bar)
    if (o.info && !o.info.rev) {
      const bc = cols[bar % cols.length], bp = camPoint(o.info.cam, 640, 280);
      drawGlow(ctx, bp[0], bp[1], 420 * o.info.cam.zoom, bc, 0.28 * k);
    }
    // haze lit by the wash colour of this bar
    const hz = o.haze == null ? 0.6 : o.haze;
    if (hz > 0) {
      const hc = cols[bar % cols.length];
      ctx.globalAlpha = 1;
      const y0 = from[0] ? from[0][1] : 150;
      ctx.globalCompositeOperation = 'lighter';
      const tex = fogTex(hc, 3), th = (tg.y - y0) * 0.9, tw = th * 4;
      ctx.globalAlpha = 0.25 * hz * k;
      tileX(ctx, tex, -t * 12, y0 + th * 0.3, tw, th, -50, W + 50);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  // kit.lasers(ctx, S, {k, count, color, origin: [x, y], y (target line), spread (radians), pattern 'fan'|'sweep'|'cross'})
  function lasers(ctx, S, o) {
    o = o || {};
    const t = tOf(S), k = clamp(o.k == null ? 1 : o.k) * fk(S);
    if (k <= 0.005) return;
    const beat = S && S.beat != null ? S.beat : t / 0.4;
    const n = o.count || 9, col = o.color || C.laser, org = o.origin || [W / 2, H * 0.4], ty = o.y == null ? H + 40 : o.y;
    const spread = o.spread || 1.3, pat = o.pattern || 'fan';
    const base = atan2(ty - org[1], 0.0001);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) - 0.5 : 0;
      let a = base + u * spread;
      if (pat === 'sweep') a += sin(beat * PI * 0.25) * 0.35;
      else if (pat === 'cross') a += (i % 2 ? 1 : -1) * sin(beat * PI * 0.25) * 0.4;
      else a += sin(beat * PI * 0.125 + i) * 0.08;
      const L = 1800, ex = org[0] + cos(a) * L, ey = org[1] + sin(a) * L;
      for (const [lw, al, c] of [[9, 0.07, col], [3.5, 0.25, col], [1.2, 0.9, '#eafff6']]) {
        ctx.strokeStyle = css(c, al * k); ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(org[0], org[1]); ctx.lineTo(ex, ey); ctx.stroke();
      }
    }
    drawGlow(ctx, org[0], org[1], 50, col, 0.8 * k, 'hot');
    ctx.restore();
  }
  // kit.pyroK(S, type, dur) -> 0..1 flame envelope after the latest hit of that type (default 'pyro', 1.2 s)
  function pyroK(S, type, dur) {
    if (!S || !S.hit) return 0;
    const a = S.hit(type || 'pyro'), d = dur || 1.2;
    if (!(a >= 0) || a > d) return 0;
    return a < 0.06 ? a / 0.06 : a < 0.45 ? 1 : 1 - (a - 0.45) / (d - 0.45);
  }
  // kit.pyro(ctx, S, x, y, k, {s (1 = 420 units tall at k 1), seed}) a stage flame jet rising from (x, y): a narrow hot
  //   column that billows wider toward its rolling top. Brightness x flashK.
  function pyro(ctx, S, x, y, k, o) {
    o = o || {};
    k = clamp(k);
    if (k <= 0.01) return;
    const t = tOf(S), s = o.s || 1, K = fk(S), seed = o.seed || 1, a = 0.55 + 0.45 * K;
    const h = 420 * s * (0.3 + 0.7 * k);
    ctx.save();
    ctx.fillStyle = '#1a1a1e'; ctx.fillRect(x - 14 * s, y - 12 * s, 28 * s, 12 * s);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, x, y - h * 0.45, h * 0.6, C.fire, 0.4 * k * K);
    const lv = 9;
    for (let j = 0; j < lv; j++) {
      const q = j / (lv - 1), yy = y - 8 * s - q * h * 0.5 + sin(t * 9 + j * 1.3) * 6 * s;
      const wd = (30 + 110 * pow(q, 1.25)) * s, hh = h * (0.5 - q * 0.08);
      for (let i = 0; i < (j < 3 ? 3 : 2); i++) {
        const fl = 0.75 + 0.25 * sin(t * (11 + i * 3 + j) + seed * 3 + i * 2);
        const tw = wd * (0.55 + 0.2 * i) * fl, th = hh * fl;
        const sway = noise1(t * 3 + j * 1.7 + i, seed) * 0.35;
        ctx.save(); ctx.translate(x + (i - 1) * wd * 0.22 + noise1(t * 4 + j, seed + 9) * 6 * s, yy); ctx.transform(1, 0, -sway, 1, 0, 0);
        ctx.globalAlpha = k * a * (j < 3 ? 0.8 : 0.62 - q * 0.25);
        ctx.drawImage(tongueSpr((i + j + seed) % 4, j < 3), -tw * 0.75, -th * 1.05, tw * 1.5, th * 1.1);
        ctx.restore();
      }
    }
    // rolling fireball cap
    const capY = y - h * 0.86, capR = 70 * s * (0.6 + 0.4 * k);
    for (let i = 0; i < 4; i++) {
      const aa = t * 3 + i * TAU / 4, px = x + cos(aa) * capR * 0.5, py = capY + sin(aa) * capR * 0.25;
      drawGlow(ctx, px, py, capR * (0.9 + 0.2 * sin(t * 7 + i)), i % 2 ? C.fire : '#ff8a30', 0.45 * k * a);
    }
    ctx.globalAlpha = 1;
    drawGlow(ctx, x, y - 30 * s, 70 * s, '#fff4d0', 0.75 * k * K, 'hot');
    for (let i = 0; i < 14; i++) {
      const q = fract(t * 1.3 + hash(i, seed));
      const px = x + (hash(i, seed + 1) - 0.5) * 160 * s * q + sin(t * 3 + i) * 10 * s, py = y - q * h * 1.25;
      drawGlow(ctx, px, py, 6 * s, C.fireHot, k * (1 - q) * 0.9, 'hot');
    }
    ctx.restore();
  }


  // ================================================================================================ export
  const worldMem = () => BYTES;
  Object.assign(kit, {
    cam, camPoint, camInv, parallax, parallaxCam, handheld,
    sky, lightningK, skyline, neonBlade, rain, fog, lightningBolt,
    van, street, brickWall, lightPools, streetlight, fence, wreck, dumpster, sign, fire: (ctx, S, x, y, w, h, k, seed) => fire(ctx, tOf(S), x, y, w, h, k == null ? 1 : k, seed || 1),
    symbol, clock, poster, wristband, setlist, graffiti, tallyMarks, onomatopoeia, textWorld,
    amp, drumKit, roadCase, pyroButton, stageSet, stageLights, lasers, pyro, pyroK,
    beam, darkness, flicker, muzzleFlash, sparks, smoke, embers, splat, debris, fireworks, speedLines, halftone, shockwave, phoneGlow, burn,
    glow: (ctx, x, y, r, color, k, kind) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, x, y, r, color || '#ffffff', k == null ? 1 : k, kind); ctx.restore(); },
    worldMem, worldRelease: release, worldWarm,
  });
})();
