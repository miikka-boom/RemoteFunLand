/* Bellhaven art (BH.Art): every drawing recipe of the city. SPEC 8.1 (renderer), 8.15 (art direction), 3.1-3.6 (land,
 * buildings, extras), 4.1 and 4.3 (looks), 4.9 (visible states), 6.7 (graves), 8.16-8.17 (juice, reduced motion).
 *
 * Pure drawing. No game rules, no state, no clock, no storage and no unseeded randomness: callers pass the context, a
 * screen anchor, the zoom and options, and animated parts take a time t in seconds. Classic script with the shared UMD
 * header: BH.Art in the browser, module.exports in node (it loads without a DOM; drawing needs a 2D context).
 *
 * ---------------------------------------------------------------------------------------------------------- units
 * g        a CanvasRenderingContext2D, drawn in its current units (the renderer keeps its DPR transform on it).
 * x, y     the screen anchor in those units.   z  the zoom (0.35-1.8; 1 = a 64 x 32 px tile).
 * Footprint anchor: the screen point of the footprint's BACK corner (gx, gy) at ground level, i.e. the renderer's
 *          toScreen(gx, gy, 0). Inside a recipe, u runs along +gx, v along +gy (tiles) and h up (px at zoom 1):
 *          screen = (x + (u - v) * 32z, y + (u + v) * 16z - h z). Art.P(x, y, z, u, v, h) does that sum.
 * Person anchor: the feet, i.e. toScreen(px, py, 0) of the fractional position.
 * Overlay anchor (bubble, pills, labels): the point the overlay sits on; overlays keep a constant screen size.
 * Depth (renderer, 8.1): footprint objects by gx + w + gy + d (ties: larger gx + w later); people x + y + 0.5; a
 *          crane's mast like a 0.24 x 0.24 object at its spot; a stretcher like a person at its centre. That key alone
 *          draws a walker standing just in front of a 2 x 2 or 3 x 3 building's left or right face (x >= gx + w or
 *          y >= gy + d) before the building; compare footprints first (A wholly behind B along x or y goes first).
 * Scale: everything scales with z. The Bellhaven mock was drawn at zoom 0.68 with some sizes in fixed screen px (bell,
 *          clock, fire mouth, cans, walkers x 1.22, graves x 1.3, line widths); here those are world px = mock px /
 *          0.68, so every recipe matches the mock at its zoom and keeps its proportions from 0.35 to 1.8.
 *
 * ---------------------------------------------------------------------------------------------------------- frame
 * Art.frame({ t, reduced, dpr, cache })   once per frame: defaults for every call. t = seconds; reduced =
 *     prefers-reduced-motion or the Lab toggle (static smoke, glint and candle, no light sweep, walkers stand, no
 *     bob); dpr = the backing scale, sizes cached sprites (without it the context transform is read); cache = false
 *     draws every building live. Each option object below also accepts { t, reduced } for one call.
 *
 * ---------------------------------------------------------------------------------------------------------- buildings
 * Types: tower 3 x 3 (L1-10), kiln, cannery, depot (L1-8), house (L1-2), clinic (L1-6), armory (L1-8), inn (L1-3),
 * all 2 x 2. Art.FOOT[type] = [w, d] (also grave, rubble, tree, bench, lamp: [1, 1]); Art.MAX_LV; Art.TYPES (the 8).
 * Art.building(g, type, lv, x, y, z, o)   one building at its footprint anchor: the ground shadow (live), the body
 *     from a cached sprite (per type, level, variant and zoom bucket of 2^(1/4); drawn live above 4 device px per
 *     world px or with o.cache false; LRU of about 14 MP), then the animated parts (Kiln smoke, Tower 10 light sweep,
 *     travelers at the Inn door).
 *     o: { roof: 0-2 House colour (blue, green, plum; the House's houseIdx), lit: warm House windows (someone home),
 *          lantern: a Down person's lantern in the House window, bell: Tower bell swing in radians (0 = still; a
 *          swinging bell is drawn live; swing it +-12 deg = 0.21 rad), travelers: [look, ...] 0-3 tiny travelers with
 *          bags at the Inn door, selected: 2 px orange outline (#ff7a2f), hover: light outline, alpha 0-1, lift:
 *          screen px the body floats above its shadow (move drag, the 6 px placement drop), stretch: vertical scale
 *          around the footprint centre (the 1.08 bounce), shadow: false, smoke: false, cache: false, t, reduced }
 *     Each level adds a prop or grows: Tower storeys 1 + ceil(L/2), L2 pennant, L4 clock, L6 balcony, L8 gold trim,
 *     L10 gold roof; Kiln chimney +9 px a level, L3 bricks, L5 dome, L7 chimney; Cannery more cans every level, L4
 *     conveyor, L6 second bay, L8 water tank; Depot crates per level, L6 lean-to; House L2 storey and chimney; Clinic
 *     L2 roof unit, L3 canopy, L4 wing, L5 second cross, L6 roof garden; Armory L2 target, L3 rack, L4 sandbags, L5
 *     range lane, L6 ammo crates, L7 searchlight, L8 radio mast; Inn L2 upper floor, L3 string lights and terrace.
 * Art.info(type, lv) -> { w, d, h, top, bubble: [u, v, h], pill: [u, v, h], door: [u, v], crane: [u, v], colors }
 *     h = silhouette height for picking (px at zoom 1), top = tallest solid point, bubble = where a bubble's tail tip
 *     points, pill = where a timer / "z N" / "+N" / Down pill sits (stack a bubble above a pill when both show),
 *     door = the ground point at the door on the footprint edge, crane = the mast spot for a job, colors = confetti.
 *     Also for grave, rubble, tree, bench and lamp (h = how far their tile diamond extends up for picking).
 * Art.silhouette(type, lv, x, y, z) -> [[sx, sy] x 6]   the footprint diamond extruded to h (8.1 hit-testing).
 * Art.bounds(type, lv, x, y, z) -> { x0, y0, x1, y1 }   screen box of the body and its shadow, for culling.
 * Art.site(g, type, x, y, z, progress, o)   a new building's site: foundation, walls rising with progress 0-1, a
 *     brick pallet and the scaffold (draw a crane beside it).
 * Art.scaffold(g, x, y, z, w, d, h)          scaffold on the two front faces, h px high (draw after the building).
 * Art.crane(g, x, y, z, o)   anchor = the mast foot (info().crane of the job's building). o: { mast: px at zoom 1
 *     (info().top + 24), jib: angle in radians on the ground plane (0 = +gx; turn it 0.15 rad/s; constant under
 *     reduced motion), load: false, folded: true (parked beside the Tower), part: 'all' | 'mast' | 'jib' }. Draw the
 *     mast in depth order and the jib after the objects (or 'all' in depth order).
 * Art.thumb(type, lv, w, h, o) -> canvas   the building fitted into a w x h CSS px card (tray, sheets);
 *     Art.thumbURL(...) -> data URL (cached).
 * Art.ghost(g, type, lv, x, y, z, valid, o)   placement ghost: the footprint filled green #3bd16f / red #ff4b2f at
 *     35 % and the object at 70 % opacity (one bitmap, no seams). type may also be 'grave', 'tree', 'bench' or 'lamp'
 *     (o as for those).
 * Art.footprint(g, x, y, z, w, d, fill, stroke, lw)   a ground diamond (lw in screen px).
 * Art.select(g, x, y, z, w, d)   the orange selection diamond for 1 x 1 objects (graves, rubble, decorations).
 * Art.iso(g, x, y, z, (p) => { ... })   the iso primitives at a footprint anchor in local units: p.box(u, v, w, d,
 *     h0, h1, [top, left, right]), p.tile(u, v, w, d, c), p.gableX / p.gableY(u, v, w, d, h, rise, [slope, end],
 *     over), p.pyramid(u, v, w, d, h, rise, [front, side], over), p.cylinder(u, v, r, h0, h1, [top, left, right]),
 *     p.shadow(w, d, len), p.winL / p.winR(u, v, w, d, f, h, ww, wh, c), p.quad, p.tri, p.faceL, p.faceR, p.band,
 *     p.poly([[u, v, h], ...], c), p.P(u, v, h) -> local [x, y]. Art.tile(g, x, y, z, w, d, c) fills a diamond.
 *
 * ---------------------------------------------------------------------------------------------------------- ground
 * world = { size: 24, land: [x0, y0, x1, y1] (fractional while the fence slides out), gate: [11, 13] (gy range of the
 *           2-tile gap in the fence line gx = x1), plaza: (gx, gy) => bool }
 * Art.groundBounds(world) -> { x0, y0, x1, y1 }   world px at zoom 1 around the grid origin (0, 0): the cache size.
 * Art.ground(g, ox, oy, z, world)   the cached layer: the world block's edge, asphalt checker, cracks, the road from
 *     the gate with kerbs and stripes, the ruins behind the land, the haze, the land's 7 px soil slab, grass checker,
 *     plaza and gate paving, the faint grid and the back fence. (ox, oy) = the screen point of grid (0, 0). Draw it
 *     into a cleared, transparent canvas: the haze uses source-atop so it only tints what is drawn.
 * Art.fence(g, ox, oy, z, world, 'back' | 'front')   pickets every 0.5 tile and a rail; 'front' (after the objects)
 *     has the gate posts. The back part is inside ground().
 * Art.ruins(g, ox, oy, z, world, 'front')   the ruins in front of the land (cut to 38 %) and the Ferry Terminal
 *     landmark, faded by the haze; draw after the front fence.
 * Art.ruinList(world) -> [{ gx, gy, w, d, h, front, kind: 'ruin' | 'car' }]   the cosmetic layout (fixed seed; ruins
 *     within a tile of the land vanish as it grows; nothing stands on the road).
 * world.landmarks = { D1: 'locked' | 'open' | 'cleared', ... D6 } (P1, SPEC 6.1) adds the six destination landmarks:
 *     Allotments (back-left), Car Wash (right), Night Market (left), Rail Yard (back), Hospital Hill (back-right),
 *     Ferry Terminal (front-left); greyed while locked, muted when open, full colour with a warm lamp once cleared.
 *     Ruins step aside for them. Re-render the ground cache when a destination opens or is first cleared.
 * Art.landmarkList(world) -> [{ id, name, gx, gy, w, d, h, front, state }]   for picking (tap opens the run sheet on
 *     it; the box is the footprint diamond extruded to h). Art.landmark(g, id, x, y, z, state) draws one at its
 *     footprint anchor (Art.LANDMARKS holds the spots).
 * Art.sky(g, w, h)   the sky gradient over a w x h screen.
 * Art.rubble(g, x, y, z, o)   a 1 x 1 rubble pile at its footprint anchor. o: { glint: true (pays sparks), star:
 *     false (leave the twinkling star out, e.g. to cache the pile and draw Art.glint on top), t, reduced }.
 * Art.glint(g, x, y, z, o)   only the twinkling 4-point star (#4fd8ff, white core) of a glinting pile.
 *
 * ---------------------------------------------------------------------------------------------------------- people
 * look = { skin, hairStyle: buzz|short|bob|bun|ponytail|curls|bald, hair, jacket, acc: none|beanie|cap|glasses|scarf|
 *          headband } (names.js). Beanie, cap, scarf and headband take an accent colour from the jacket (Art.accent).
 * Art.person(g, x, y, z, look, o)   a walker at its feet (about 40 px to the top of the head at zoom 1: the mock's figure
 *     x 1.22 at its zoom 0.68, scaled with z). o: { pose: 'stand' |
 *     'walk' | 'sit' (on a bench) | 'lie' (along the facing; the stranger Down at the gate), facing: 0 +gx, 1 +gy,
 *     2 -gx, 3 -gy (Art.facingOf(dx, dy)), phase: 0-1 walk cycle (two stride poses, a 1 px bob on the passing
 *     steps), state: the engine's words: 'ready' | 'out' | 'rest' with restKind | 'tired' | 'resting' (slumped) |
 *     'hurt' (head bandage) | 'recovering' (arm sling) | 'down' (lies unless a pose is given), limp: true (uneven
 *     gait that dips on the bad leg), carry: 'sack' (#c9a46a, coming home) | 'bag', ring: true (the orange ring of
 *     the runner suggested by PLAY), selected: true (a thicker ring), grey: true, alpha, bob: false, reduced }
 * Art.stretcher(g, x, y, z, o)   two white-coated medics carry a stretcher with the patient on it; anchor = the
 *     stretcher's centre on the ground. o: { patient: look, medics: [look, look] (optional), facing, phase, reduced }.
 * Art.personBox(z) -> { x0, y0, x1, y1 }   a walker's drawn bounds relative to the feet (8.1: hit with + 6 px).
 * Art.portrait(g, cx, cy, size, look, o)   head and shoulders in a circle of diameter size (28-96): a 60 % tint of
 *     the jacket over #f3efe6, shoulders (right third darker), neck, oval head, hair, brows, eyes, mouth, accessory,
 *     a 2 px light ring. o: { grey: true (Down or Fallen, luma), ring: false }.
 * Art.portraitCanvas(look, size, o) -> canvas (cached per look, size, grey, ring and dpr; about 6 MP LRU);
 *     Art.portraitURL(look, size, o) -> data URL for an <img>.
 *
 * ---------------------------------------------------------------------------------------------------------- graves, extras
 * Art.grave(g, x, y, z, o)   a 1 x 1 grave at its footprint anchor: soil mound #8b7356 (grassed over after a day),
 *     rounded headstone with the carved initial (Barlow Condensed 700), a ribbon in the jacket colour, flowers (2
 *     from day 3, 4 from day 7, colours from the seed), a candle with a warm glow for the first 24 h (flickers unless
 *     reduced). o: { initial: 'E', ribbon: jacket hex, ageDays: city days since placement, seed: person seed,
 *     flowerColors: [4 hex] (the engine's view.graves[].flowerColors; overrides the seed), flowers: 0-4 (the view's count,
 *     housemates' flowers included; overrides the age rule), t }
 * Art.decor(g, kind, x, y, z, o)   P1 decorations, 1 x 1: 'tree' (o.size) | 'bench' | 'lamp'.
 *
 * ---------------------------------------------------------------------------------------------------------- overlays
 * Art.bubble(g, x, y, kind, o)   kind 'brick' | 'can' | 'spark'; anchor = the tail tip; a 30 x 26 px body above it
 *     (cached sprite with a soft shadow). o: { full: true (orange), scale (0.85 -> 1 pop-in), alpha }.
 *     Art.bubbleBox(x, y) -> its 44 x 44 hit box.
 * Art.timerPill(g, x, y, text, frac, o)   anchor = the pill's bottom centre; a dark pill with a progress ring in
 *     #f5c25a (o.color) and Barlow Condensed 700 12.5 px text. Returns its box { x, y, w, h }.
 * Art.pill(g, x, y, text, kind)   anchor = bottom centre. kind: 'z' ("z 2", resting in a House), 'plus' (white "+N"
 *     on the Clinic), 'down' (red "Emre · 23 h"), 'hurt' (red-edged "Hurt"), 'dark', 'good'. Returns its box.
 * Art.ring(g, x, y, r, frac, color, lw)   a timer ring (track and an arc from 12 o'clock).
 * Art.label(g, x, y, text, o)   a small dark label (bottom centre anchor; o.kind as for pill).
 * Art.puff(g, x, y, z, k, w, d)   the dust puff of a placed footprint, k 0 -> 1 over its life.
 * Art.colors(type) -> confetti colours of a building.
 *
 * ---------------------------------------------------------------------------------------------------------- icons
 * Art.icon(g, name, x, y, size, o)   centred at (x, y). o: { color: one colour for every layer (mono), alpha }.
 * Art.iconSVG(name, size, o) -> '<svg ...>' for the DOM (o.color mono; 'currentColor' works).
 * Art.ICONS: brick, can, spark, crane, people, tower, flag, medkit, pills, bomb (noise bomb), sprinter, brawler,
 *     marksman, medic, scout (the 5 roles), hammer, grave, heart, clock, lock, flask, bell, sack, check, close, plus,
 *     back, info, up, move, finish, sound, mute, house, star. Multi-colour: brick, can, spark, medkit, pills, bomb,
 *     sack (o.color turns them one colour with layered opacity); the rest are one colour (o.color, default #f3efe6).
 *
 * ---------------------------------------------------------------------------------------------------------- misc
 * Art.PAL (the palette tokens of 8.15), Art.CSS (the same as CSS custom properties), Art.HOUSE_ROOFS, Art.FLOWERS,
 * Art.shade(hex, f), Art.mix(a, b, t), Art.grey(hex), Art.rgba(hex, a), Art.accent(jacket), Art.PERSON_SCALE,
 * Art.cache.clear() / .stats().
 * Performance: recipes are paths and flat fills with memoised colours; gradients, blurred shadows and text only go
 * into cached bitmaps (building sprites, bubbles, portraits) or a few small draws per frame (grave initials, pills).
 * No filters. The mock scene (10 buildings, 6 walkers, crane, fence, ruins, overlays) costs about 0.7 ms of script
 * per frame at 844 x 390 x DPR 3 in headless Chromium, cached or live.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Art = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';

  const TAU = Math.PI * 2;
  const K = 1 / 0.68;                              // world px per mock px for sizes the mock drew unscaled
  const PK = 1.22 * K;                             // walker figure units -> world px at zoom 1
  const COND = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';

  // ------------------------------------------------------------------------------------------------ colour helpers
  const memo = new Map();
  function rgbOf(c) {
    if (c[0] === '#') { const n = parseInt(c.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
    const m = c.match(/[\d.]+/g) || ['0', '0', '0']; return [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]];
  }
  const c255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  function hexOf(r, gg, b) { return '#' + ((1 << 24) | (c255(r) << 16) | (c255(gg) << 8) | c255(b)).toString(16).slice(1); }
  function outCol(r, gg, b, a) { return a < 1 ? 'rgba(' + c255(r) + ',' + c255(gg) + ',' + c255(b) + ',' + a + ')' : hexOf(r, gg, b); }
  // f < 0 darkens toward black by |f|; f > 0 lightens toward white by f (the mock's shade()).
  function shade(c, f) {
    const k = 's' + c + f; let r = memo.get(k);
    if (r === undefined) { const a = rgbOf(c), s = (v) => (f < 0 ? v * (1 + f) : v + (255 - v) * f); r = outCol(s(a[0]), s(a[1]), s(a[2]), a[3]); memo.set(k, r); }
    return r;
  }
  function mix(c1, c2, t) {
    const k = 'm' + c1 + c2 + t; let r = memo.get(k);
    if (r === undefined) { const a = rgbOf(c1), b = rgbOf(c2); r = outCol(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t); memo.set(k, r); }
    return r;
  }
  function grey(c) {
    const k = 'g' + c; let r = memo.get(k);
    if (r === undefined) { const a = rgbOf(c), l = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]; r = outCol(l, l, l, a[3]); memo.set(k, r); }
    return r;
  }
  function rgba(c, al) { const k = 'a' + c + al; let r = memo.get(k); if (r === undefined) { const a = rgbOf(c); r = outCol(a[0], a[1], a[2], al); memo.set(k, r); } return r; }

  // ------------------------------------------------------------------------------------------------ palette (8.15)
  const PAL = {
    skyTop: '#dce6e4', skyBot: '#bfcac8', haze: 'rgba(214,222,220,.72)',
    asphaltA: '#b4babc', asphaltB: '#adb3b6', crack: '#9aa1a4', roadStripe: '#ece6d2',
    ruinTop: '#c9cfd1', ruinLeft: '#b2b9bc', ruinRight: '#9ea5a9', ruinWindow: '#8e959a',
    rubbleTop: '#b0b5b8', rubbleLeft: '#959b9f', rubbleRight: '#7d8387',
    grassA: '#a7d07f', grassB: '#9dc876', grid: 'rgba(60,90,40,.10)',
    soilLeft: '#8b6a4c', soilRight: '#735740', plazaA: '#ece2cb', plazaB: '#e4d8be',
    fence: '#f7f2e8', fenceShadow: '#d8cfbf', gatePost: '#fbf7ee', shadow: 'rgba(29,42,32,.13)',
    windowLit: '#ffd98a', windowLitSide: '#f2c472', windowDark: '#6d7f91', windowDarkSide: '#5d6e7f',
    door: '#8a5a3c', smoke: 'rgba(246,243,236,.85)',
    panel: 'rgba(18,22,28,.86)', panelSolid: '#12161c', line: 'rgba(255,255,255,.09)',
    ink: '#f3efe6', inkSoft: '#a9aeb3', accent: '#ff7a2f', accentDark: '#d95f1c',
    good: '#3bd16f', bad: '#ff4b2f', spark: '#4fd8ff', timer: '#f5c25a',
    brickTop: '#e0745a', brickLeft: '#c4553b', brickRight: '#a8452f', can: '#c9d2d8', canLabel: '#6fae5a',
    night: '#07090d', nightPanel: '#10141b', lantern: '#ffc56b',
  };
  const CSS = {
    '--sky-top': PAL.skyTop, '--sky-bot': PAL.skyBot, '--haze': PAL.haze, '--asphalt-a': PAL.asphaltA, '--asphalt-b': PAL.asphaltB,
    '--crack': PAL.crack, '--road-stripe': PAL.roadStripe, '--ruin-top': PAL.ruinTop, '--ruin-left': PAL.ruinLeft, '--ruin-right': PAL.ruinRight,
    '--ruin-window': PAL.ruinWindow, '--rubble-top': PAL.rubbleTop, '--rubble-left': PAL.rubbleLeft, '--rubble-right': PAL.rubbleRight,
    '--grass-a': PAL.grassA, '--grass-b': PAL.grassB, '--grid': PAL.grid, '--soil-left': PAL.soilLeft, '--soil-right': PAL.soilRight,
    '--plaza-a': PAL.plazaA, '--plaza-b': PAL.plazaB, '--fence': PAL.fence, '--fence-shadow': PAL.fenceShadow, '--gate-post': PAL.gatePost,
    '--shadow': PAL.shadow, '--window-lit': PAL.windowLit, '--window-lit-side': PAL.windowLitSide, '--window-dark': PAL.windowDark,
    '--window-dark-side': PAL.windowDarkSide, '--door': PAL.door, '--smoke': PAL.smoke, '--panel': PAL.panel, '--panel-solid': PAL.panelSolid,
    '--line': PAL.line, '--ink': PAL.ink, '--ink-soft': PAL.inkSoft, '--accent': PAL.accent, '--accent-dark': PAL.accentDark, '--good': PAL.good,
    '--bad': PAL.bad, '--spark': PAL.spark, '--timer': PAL.timer, '--brick-top': PAL.brickTop, '--brick-left': PAL.brickLeft,
    '--brick-right': PAL.brickRight, '--can': PAL.can, '--can-label': PAL.canLabel, '--night': PAL.night, '--night-panel': PAL.nightPanel,
    '--lantern': PAL.lantern,
  };
  // building colours: [top, left, right] for boxes, [slope, end] for roofs
  const C = {
    plinth: ['#e6d9bf', '#d2c3a6', '#bcac8f'], shaft: ['#f3e9d4', '#ddd0b5', '#c6b89c'], band: ['#e3d4b6', '#bfa983', '#a8936e'],
    towerRoof: ['#d0643c', '#a94f2d'], gold: ['#f2c14e', '#d9a43a'], bell: '#f2c14e', bellRim: '#d9a43a', clapper: '#b8862b',
    clockFace: '#fbf7ee', clockInk: '#8a5a3c', pole: '#5b4a3c',
    kilnBase: ['#ddcdb4', '#c8b79c', '#b2a185'], dome: '#c9583e', domeShade: '#ad4934', domeRing: 'rgba(120,40,25,.35)',
    mouth: '#5a2a1e', glow: '#ffb347', chimney: ['#8a4733', '#7a3f2e', '#653426'], chimCap: ['#9b543d', '#7a3f2e', '#653426'],
    bricks: ['#e0745a', '#c4553b', '#a8452f'],
    shed: ['#93b6d1', '#7aa0bd', '#668aa8'], shedRoof: ['#eef2f4', '#d3dbe1'], label: '#6fae5a', labelR: '#5b9549', shedWin: '#4d6f8c',
    can: '#c9d2d8', canTop: '#e6ecef', canShade: '#a9b4bb', conveyor: ['#9aa0a8', '#8a8f98', '#6f747c'], tank: ['#d9dfe3', '#b9c3ca', '#98a3ab'],
    crate: ['#d2ad6e', '#b8935a', '#9c7b47'], tarp: ['#4f8f8a', '#3f7672', '#336360'], strap: 'rgba(80,55,25,.45)',
    cottage: ['#f6eedf', '#e5d9c4', '#cfc1a7'], chimneyH: ['#b0a089', '#9a8a73', '#857560'],
    clinic: ['#fbfbf7', '#e8e8e1', '#d1d1c8'], clinicRoof: ['#dfe9e7', '#c4d3d0', '#aebfbb'], teal: '#2f9e8f', tealDark: '#26837a',
    clinicWin: '#9fd3cb', clinicDoor: '#5f8f88', unit: ['#e9ece9', '#cfd5d2', '#b5bdb9'], garden: '#7fb069', gardenSide: '#6a9a57',
    bunker: ['#6a7684', '#56616e', '#454e59'], lip: ['#7c8896', '#5f6a77', '#4d5661'], mustard: '#d9a441', mustardR: '#bf8f37',
    bunkerDoor: '#2c333b', target: '#f6f1e7', targetRed: '#c9503c', lane: '#9fb57e', laneSide: '#86a067', wood: ['#a5774f', '#8a5a3c', '#6f4830'],
    sandbag: ['#cdbb94', '#b3a07a', '#988664'], steel: ['#7a828c', '#5f6770', '#4b525a'], cone: 'rgba(255,240,200,.25)',
    timber: ['#c58b5c', '#ab744b', '#8f5f3d'], innRoof: ['#7a4b32', '#643d29'], awningA: '#e5534b', awningB: '#f6eedf', sign: '#f2c14e',
    innDoor: '#5a3a26', table: ['#e9dcc3', '#c9b693', '#a8957a'],
    crane: ['#f5c25a', '#e0a83f', '#c48f30'], lattice: 'rgba(150,100,30,.6)', counter: '#5f6b78', cable: '#333333', cab: '#3a4048',
    scaffold: 'rgba(141,107,79,.95)', slab: ['#ddd7ca', '#c6bfb0', '#aca596'],
    mound: '#8b7356', moundDark: '#76604a', moundGrass: '#9dc876', moundGrassDark: '#8bb866', stone: '#d8d3c6', stoneSide: '#bdb7a9',
    carve: '#9a9486', stem: '#5d8f4a', candle: '#f6f1e7', flame: '#ffb347',
    trunk: '#7a5a3e', leaves: ['#64a258', '#4f8a47', '#79b86a', '#86c477'],
  };
  const HOUSE_ROOFS = ['#5b7fb8', '#5d9b6b', '#9a70b0'];
  const FLOWERS = ['#f2c14e', '#e5534b', '#f7f2e8', '#9a70b0'];
  // accent colour for beanie, cap, scarf and headband: a contrasting partner of the jacket (looks never carry one)
  const ACCENT = { '#3f6fb5': '#d9a441', '#c9503c': '#2f8f8f', '#4f8f5a': '#d9a441', '#d9a441': '#3f6fb5', '#7a5ca8': '#d9a441',
    '#2f8f8f': '#e5534b', '#8a8f98': '#c9503c', '#e07aa0': '#2f8f8f', '#f1efe8': '#2f9e8f' };
  const accent = (j) => ACCENT[j] || shade(j, -0.35);

  // ------------------------------------------------------------------------------------------------ frame defaults
  const FR = { t: 0, reduced: false, dpr: 0, cache: true, frame: 0 };
  function frame(o) {
    if (!o) return FR;
    if (o.t !== undefined) FR.t = +o.t || 0;
    if (o.reduced !== undefined) FR.reduced = !!o.reduced;
    if (o.dpr !== undefined) FR.dpr = +o.dpr || 0;
    if (o.cache !== undefined) FR.cache = !!o.cache;
    FR.frame++;
    return FR;
  }
  const tOf = (o) => (o && o.t !== undefined ? o.t : FR.t);
  const redOf = (o) => (o && o.reduced !== undefined ? !!o.reduced : FR.reduced);

  // ------------------------------------------------------------------------------------------------ context + primitives
  // Recipes draw in local world px at zoom 1 with the anchor at (0, 0); public functions set the transform.
  let g = null;
  const SX = (u, v) => (u - v) * 32;
  const SY = (u, v, h) => (u + v) * 16 - h;
  function mv(u, v, h) { g.moveTo((u - v) * 32, (u + v) * 16 - h); }
  function ln(u, v, h) { g.lineTo((u - v) * 32, (u + v) * 16 - h); }
  function fillC(c) { g.fillStyle = c; g.fill(); }
  function strokeC(c, lw) { g.strokeStyle = c; g.lineWidth = lw; g.stroke(); }
  function quad(u0, v0, h0, u1, v1, h1, u2, v2, h2, u3, v3, h3, c) {
    g.beginPath(); mv(u0, v0, h0); ln(u1, v1, h1); ln(u2, v2, h2); ln(u3, v3, h3); g.closePath(); g.fillStyle = c; g.fill();
  }
  function tri(u0, v0, h0, u1, v1, h1, u2, v2, h2, c) { g.beginPath(); mv(u0, v0, h0); ln(u1, v1, h1); ln(u2, v2, h2); g.closePath(); g.fillStyle = c; g.fill(); }
  // a rectangle on a +v-facing plane (the "left" face) and on a +u-facing plane (the "right" face)
  function faceL(u0, u1, v, h0, h1, c) { quad(u0, v, h0, u1, v, h0, u1, v, h1, u0, v, h1, c); }
  function faceR(u, v0, v1, h0, h1, c) { quad(u, v0, h0, u, v1, h0, u, v1, h1, u, v0, h1, c); }
  function topQ(u, v, w, d, h, c) { quad(u, v, h, u + w, v, h, u + w, v + d, h, u, v + d, h, c); }
  // box(u, v, w, d, h0, h1, [top, left, right]): the left face, the right face, then the top (8.15)
  function box(u, v, w, d, h0, h1, c) { faceL(u, u + w, v + d, h0, h1, c[1]); faceR(u + w, v + d, v, h0, h1, c[2]); topQ(u, v, w, d, h1, c[0]); }
  // an outset band around a box (storey bands): the two front faces and the visible rim of its top only, so the
  // hidden back of the band never paints over the faces above it
  function band(u, v, w, d, h0, h1, e, c) {
    faceL(u - e, u + w + e, v + d + e, h0, h1, c[1]); faceR(u + w + e, v + d + e, v - e, h0, h1, c[2]);
    quad(u - e, v + d + e, h1, u + w + e, v + d + e, h1, u + w, v + d, h1, u, v + d, h1, c[0]);
    quad(u + w + e, v + d + e, h1, u + w + e, v - e, h1, u + w, v, h1, u + w, v + d, h1, c[0]);
  }
  // window / panel on the left face (faces +v) at fraction f along u; ww in tiles, z and wh in px
  function winL(u, v, w, d, f, z, ww, wh, c) { const a = u + f * w; faceL(a, a + ww, v + d, z, z + wh, c); }
  function winR(u, v, w, d, f, z, ww, wh, c) { const a = v + f * d; faceR(u + w, a, a + ww, z, z + wh, c); }
  function gableX(u, v, w, d, z, rise, c, over) {      // ridge along u: the front slope (faces +v) and the +u gable end
    if (over === undefined) over = 0.12;
    const x0 = u - over, x1 = u + w + over, y0 = v - over, y1 = v + d + over, ym = v + d / 2;
    quad(x0, y0, z, x1, y0, z, x1, ym, z + rise, x0, ym, z + rise, shade(c[0], -0.06));   // the back slope peeks over the ridge
    quad(x0, ym, z + rise, x1, ym, z + rise, x1, y1, z, x0, y1, z, c[0]);
    tri(x1, y0, z, x1, ym, z + rise, x1, y1, z, c[1]);
  }
  function gableY(u, v, w, d, z, rise, c, over) {      // ridge along v: the right slope (faces +u) and the +v gable end
    if (over === undefined) over = 0.12;
    const x0 = u - over, x1 = u + w + over, y0 = v - over, y1 = v + d + over, xm = u + w / 2;
    quad(x0, y0, z, xm, y0, z + rise, xm, y1, z + rise, x0, y1, z, shade(c[0], 0.1));     // the sunlit left slope
    quad(xm, y0, z + rise, xm, y1, z + rise, x1, y1, z, x1, y0, z, c[0]);
    tri(x0, y1, z, xm, y1, z + rise, x1, y1, z, c[1]);
  }
  function pyramid(u, v, w, d, z, rise, c, over) {
    if (over === undefined) over = 0.1;
    const x0 = u - over, x1 = u + w + over, y0 = v - over, y1 = v + d + over, au = u + w / 2, av = v + d / 2, ah = z + rise;
    tri(x0, y0, z, x0, y1, z, au, av, ah, shade(c[0], 0.1)); tri(x0, y0, z, x1, y0, z, au, av, ah, c[0]);   // back faces (slivers)
    tri(x0, y1, z, x1, y1, z, au, av, ah, c[0]); tri(x1, y1, z, x1, y0, z, au, av, ah, c[1]);
  }
  function shadowPoly(w, d, len, c) {
    g.beginPath(); mv(w, 0, 0); ln(w + len, len * 0.6, 0); ln(w + len, d + len, 0); ln(len * 0.4, d + len, 0); ln(0, d, 0); g.closePath();
    g.fillStyle = c || PAL.shadow; g.fill();
  }
  // a vertical cylinder at (u, v) with radius r tiles: the body (left tone), its right third (right tone), the top
  function cyl(u, v, r, h0, h1, c) {
    const x = SX(u, v), y0 = SY(u, v, h0), y1 = SY(u, v, h1), rx = r * 45.25, ry = r * 22.63;
    g.beginPath(); g.moveTo(x - rx, y1); g.lineTo(x - rx, y0); g.ellipse(x, y0, rx, ry, 0, Math.PI, 0, true); g.lineTo(x + rx, y1); g.closePath(); fillC(c[1]);
    g.beginPath(); g.moveTo(x + rx * 0.35, y1 + ry * 0.94); g.lineTo(x + rx * 0.35, y0 + ry * 0.94); g.ellipse(x, y0, rx, ry, 0, Math.acos(0.35), 0, true); g.lineTo(x + rx, y1); g.ellipse(x, y1, rx, ry, 0, 0, Math.acos(0.35), false); g.closePath(); fillC(c[2]);
    g.beginPath(); g.ellipse(x, y1, rx, ry, 0, 0, TAU); fillC(c[0]);
  }
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function rr4(x, y, w, h, tl, tr, br, bl) {
    g.moveTo(x + tl, y); g.lineTo(x + w - tr, y); if (tr) g.arcTo(x + w, y, x + w, y + tr, tr); else g.lineTo(x + w, y);
    g.lineTo(x + w, y + h - br); if (br) g.arcTo(x + w, y + h, x + w - br, y + h, br); else g.lineTo(x + w, y + h);
    g.lineTo(x + bl, y + h); if (bl) g.arcTo(x, y + h, x, y + h - bl, bl); else g.lineTo(x, y + h);
    g.lineTo(x, y + tl); if (tl) g.arcTo(x, y, x + tl, y, tl); else g.lineTo(x, y); g.closePath();
  }
  function disc(x, y, r, c) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = c; g.fill(); }
  function ell(x, y, rx, ry, rot, c) { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, TAU); g.fillStyle = c; g.fill(); }
  function star4(x, y, r, c, core) {
    g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? r * 0.38 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath(); g.fillStyle = c; g.fill(); if (core !== false) disc(x, y, r * 0.22, '#ffffff');
  }
  function line(x0, y0, x1, y1, c, lw) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokeStyle = c; g.lineWidth = lw; g.stroke(); }
  // run fn with ctx as the current context at a footprint anchor and zoom
  function withAt(ctx, x, y, z, fn) {
    const pg = g; g = ctx; ctx.save(); ctx.translate(x, y); if (z !== 1) ctx.scale(z, z);
    try { fn(); } finally { ctx.restore(); g = pg; }
  }

  function mkCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    return null;
  }
  function devScale(ctx) {
    if (FR.dpr) return FR.dpr;
    if (ctx && ctx.getTransform) { const m = ctx.getTransform(); const s = Math.hypot(m.a, m.b); if (s > 0) return s; }
    return (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
  }

  // ------------------------------------------------------------------------------------------------ buildings
  const TYPES = ['tower', 'kiln', 'cannery', 'depot', 'house', 'clinic', 'armory', 'inn'];
  const FOOT = { tower: [3, 3], kiln: [2, 2], cannery: [2, 2], depot: [2, 2], house: [2, 2], clinic: [2, 2], armory: [2, 2], inn: [2, 2],
    grave: [1, 1], rubble: [1, 1], tree: [1, 1], bench: [1, 1], lamp: [1, 1] };
  const MAX_LV = { tower: 10, kiln: 8, cannery: 8, depot: 8, house: 2, clinic: 6, armory: 8, inn: 3 };
  const SHADOW_LEN = { tower: 0.9, kiln: 0.6, cannery: 0.6, depot: 0.5, house: 0.6, clinic: 0.6, armory: 0.5, inn: 0.6 };
  const clampLv = (type, lv) => Math.max(1, Math.min(MAX_LV[type] || 1, Math.round(lv) || 1));
  const storeys = (lv) => 1 + Math.ceil(lv / 2);

  // ---- Bell Tower (3 x 3): plinth, shaft of S = 1 + ceil(L/2) storeys of 22 px, open belfry with the gold bell
  function bellShape(x, y, ang) {                    // y = the bell's mouth line; pivot at the crown
    const s = K, cy = y - 14 * s;
    if (ang) { g.save(); g.translate(x, cy); g.rotate(ang); g.translate(-x, -cy); }
    g.beginPath(); g.moveTo(x - 8 * s, y + 2 * s); g.quadraticCurveTo(x - 7 * s, y - 13 * s, x, y - 14 * s); g.quadraticCurveTo(x + 7 * s, y - 13 * s, x + 8 * s, y + 2 * s); g.closePath(); fillC(C.bell);
    g.beginPath(); g.moveTo(x + 2.5 * s, y - 12 * s); g.quadraticCurveTo(x + 6.5 * s, y - 11 * s, x + 7.6 * s, y + 1 * s); g.lineTo(x + 3.5 * s, y + 1 * s); g.quadraticCurveTo(x + 4 * s, y - 8 * s, x + 2.5 * s, y - 12 * s); fillC(C.bellRim);
    g.beginPath(); rr(x - 8.6 * s, y, 17.2 * s, 3 * s, 1.2 * s); fillC(C.bellRim);
    disc(x, y + 4.2 * s, 2 * s, C.clapper);
    if (ang) g.restore();
  }
  function towerBody(lv, o) {
    const S = storeys(lv), b0 = 0.65, bw = 1.7, bz = 8 + 22 * S, gold = lv >= 10;
    box(0, 0, 3, 3, 0, 8, C.plinth);
    // two steps up to the door
    box(1.05, 2.35, 0.75, 0.3, 0, 3, C.plinth);
    box(b0, b0, bw, bw, 8, bz, C.shaft);
    for (let k = 1; k < S; k++) band(b0, b0, bw, bw, 8 + 22 * k - 1.5, 8 + 22 * k + 1.5, 0.05, C.band);
    for (let k = 0; k < S; k++) {
      const z = 8 + 22 * k + 5;
      if (k > 0) winL(b0, b0, bw, bw, 0.36, z, 0.45, 12, PAL.windowDark);
      if (!(lv >= 4 && k === S - 1)) winR(b0, b0, bw, bw, 0.36, z, 0.45, 12, PAL.windowDarkSide);
    }
    winL(b0, b0, bw, bw, 0.3, 8, 0.55, 15.5, PAL.door);
    if (lv >= 4) {                                   // L4 a clock face on the right face of the top storey
      const x = SX(b0 + bw + 0.02, b0 + bw / 2), y = SY(b0 + bw + 0.02, b0 + bw / 2, 8 + 22 * (S - 1) + 10.5);
      g.beginPath(); g.ellipse(x, y, 5.6 * K, 6.8 * K, -0.45, 0, TAU); fillC(C.clockFace); strokeC(C.clockInk, 1.3 * K);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.7 * K, y - 4.4 * K); g.moveTo(x, y); g.lineTo(x + 3.1 * K, y + 1.3 * K); g.lineCap = 'round'; strokeC(C.clockInk, 1.3 * K); g.lineCap = 'butt';
    }
    if (lv >= 6) {                                   // L6 a balcony ledge under the belfry, with a rail
      box(b0 - 0.2, b0 - 0.2, bw + 0.4, bw + 0.4, bz - 3, bz, C.band);
      g.beginPath();
      for (let i = 0; i <= 4; i++) { const u = b0 - 0.17 + (bw + 0.34) * i / 4; mv(u, b0 + bw + 0.17, bz); ln(u, b0 + bw + 0.17, bz + 7); mv(b0 + bw + 0.17, u, bz); ln(b0 + bw + 0.17, u, bz + 7); }
      mv(b0 - 0.17, b0 + bw + 0.17, bz + 7); ln(b0 + bw + 0.17, b0 + bw + 0.17, bz + 7); ln(b0 + bw + 0.17, b0 - 0.17, bz + 7);
      strokeC(C.band[2], 1.1 * K);
    }
    // belfry: the back post, the bell, the other three posts, the cap and the roof
    // The bell hangs just inside the left (+v) opening: hung at the belfry's centre, as in the mock, the cap's front
    // edge hides it completely in this projection (a ray from the centre meets the cap), so nobody would see it ring.
    const q0 = b0 + 0.05, q1 = b0 + bw - 0.22, bv = b0 + bw - 0.14;
    box(q0, q0, 0.17, 0.17, bz, bz + 26, C.shaft); box(q1, q0, 0.17, 0.17, bz, bz + 26, C.shaft);
    g.lineCap = 'round'; line(SX(1.12, bv), SY(1.12, bv, bz + 25), SX(1.88, bv), SY(1.88, bv, bz + 25), '#8a6a3a', 2.2 * K); g.lineCap = 'butt';
    bellShape(SX(1.5, bv), SY(1.5, bv, bz + 3.5), o.bell || 0);
    box(q0, q1, 0.17, 0.17, bz, bz + 26, C.shaft); box(q1, q1, 0.17, 0.17, bz, bz + 26, C.shaft);
    box(b0 - 0.08, b0 - 0.08, bw + 0.16, bw + 0.16, bz + 26, bz + 30, C.band);
    const rc = gold ? C.gold : C.towerRoof;
    pyramid(b0 - 0.08, b0 - 0.08, bw + 0.16, bw + 0.16, bz + 30, 28, rc, 0.08);
    if (lv >= 8) {                                   // L8 a 2 px gold trim on the roof edge
      const e0 = b0 - 0.16, e1 = b0 + bw + 0.16;
      g.beginPath(); mv(e0, e1, bz + 30); ln(e1, e1, bz + 30); ln(e1, e0, bz + 30); g.lineJoin = 'round'; strokeC(gold ? '#e8b23f' : C.gold[0], 2 * K); g.lineJoin = 'miter';
    }
    if (lv >= 2) {                                   // L2 an orange pennant on a pole
      const fx = SX(1.5, 1.5), fy = SY(1.5, 1.5, bz + 58);
      line(fx, fy + 1, fx, fy - 15 * K, C.pole, 1.5 * K);
      g.beginPath(); g.moveTo(fx, fy - 15 * K); g.lineTo(fx + 13 * K, fy - 11.5 * K); g.lineTo(fx, fy - 8 * K); g.closePath(); fillC(PAL.accent);
    }
  }
  function towerLive(lv, o) {                        // L10: a slow light sweep over the gold roof every 6 s
    if (lv < 10 || redOf(o)) return;
    const S = storeys(lv), b0 = 0.65, bw = 1.7, bz = 8 + 22 * S, t = tOf(o) % 6;
    if (t > 1.4) return;
    const k = t / 1.4, e0 = b0 - 0.16, e1 = b0 + bw + 0.16;
    g.save(); g.beginPath(); mv(e0, e1, bz + 30); ln(e1, e1, bz + 30); ln(e1, e0, bz + 30); ln(1.5, 1.5, bz + 58); g.closePath();
    mv(b0, b0 + bw, bz); ln(b0 + bw, b0 + bw, bz); ln(b0 + bw, b0, bz); ln(b0 + bw, b0, bz + 26); ln(b0 + bw, b0 + bw, bz + 26); ln(b0, b0 + bw, bz + 26); g.closePath();
    g.clip();
    const cx = SX(1.5, 1.5) - 70 + 140 * k, cy = SY(1.5, 1.5, bz + 30);
    g.globalAlpha = Math.sin(Math.PI * k) * 0.55;
    g.beginPath(); g.moveTo(cx - 8, cy - 80); g.lineTo(cx + 6, cy - 80); g.lineTo(cx + 18, cy + 40); g.lineTo(cx + 4, cy + 40); g.closePath(); fillC('#fffbe8');
    g.restore();
  }

  // ---- Kiln: sand base, beehive dome, fire mouth, chimney (+9 px a level), smoke
  function domeAt(u, v, h, r, body, sh, rings) {
    const x = SX(u, v), y = SY(u, v, h);
    g.save(); g.beginPath(); g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI); g.lineTo(x - r, y); g.ellipse(x, y, r, r * 1.05, 0, Math.PI, TAU); g.closePath();
    fillC(body); g.clip();
    g.beginPath(); g.ellipse(x + r * 0.35, y - 2 * K * r / 30, r * 0.66, r * 0.98, 0, -Math.PI / 2, Math.PI / 2); g.closePath(); fillC(sh);
    if (rings) { g.beginPath(); for (let k = 1; k < 4; k++) { g.moveTo(x - r, y); g.ellipse(x, y, r, r * 1.05 * k / 4 + 2 * K * r / 30, 0, Math.PI, TAU); } strokeC(C.domeRing, 1 * K); }
    g.restore();
    return [x, y];
  }
  function kilnBody(lv) {
    const ch = 36 + 9 * lv;
    box(0.15, 0.15, 1.7, 1.7, 0, 6, C.kilnBase);
    if (lv >= 7) { const c2 = ch - 16; box(0.32, 0.62, 0.3, 0.3, 6, c2, C.chimney); box(0.28, 0.58, 0.38, 0.38, c2, c2 + 4, C.chimCap); }
    const [x, y] = domeAt(1.05, 1.05, 6, 30, C.dome, C.domeShade, true);
    // fire mouth at the dome's front-left, standing on the base
    const mx = x - 7 * K, my = y + 0.5 * 30 * Math.sqrt(1 - Math.pow(7 * K / 30, 2)) - 1.5;
    g.beginPath(); g.ellipse(mx, my, 6.6 * K, 7 * K, 0, Math.PI, TAU); g.closePath(); fillC(C.mouth);
    g.beginPath(); g.ellipse(mx, my, 4.2 * K, 4.4 * K, 0, Math.PI, TAU); g.closePath(); fillC(C.glow);
    box(1.35, 0.3, 0.35, 0.35, 6, ch, C.chimney); box(1.3, 0.25, 0.45, 0.45, ch, ch + 4, C.chimCap);
    if (lv >= 5) domeAt(1.62, 1.12, 6, 18, C.dome, C.domeShade, true);       // L5 a second small dome
    if (lv >= 3) { box(0.1, 1.45, 0.55, 0.4, 0, 8, C.bricks); box(0.15, 1.5, 0.45, 0.3, 8, 13, C.bricks); }   // L3 a brick stack
  }
  function smokeFrom(x, y, lv, t, red, seed) {
    g.fillStyle = PAL.smoke;
    if (red) { [[0, -6, 5], [5, -15, 6.5], [11, -26, 8]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(x + dx * K, y + dy * K, r * K, 0, TAU); g.fill(); }); return; }
    const sp = 0.22 + 0.035 * lv;
    for (let i = 0; i < 4; i++) {
      const a = ((t * sp + i / 4 + seed) % 1 + 1) % 1, r = (4 + 6 * a) * K;
      g.globalAlpha = 0.95 * (1 - a) * Math.min(1, a * 6);
      g.beginPath(); g.arc(x + (3 + 14 * a + Math.sin((t + i) * 1.3) * 1.5) * K, y - (4 + 34 * a) * K, r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  function kilnLive(lv, o) {
    if (o.smoke === false) return;
    const ch = 36 + 9 * lv, t = tOf(o), red = redOf(o);
    smokeFrom(SX(1.52, 0.47), SY(1.52, 0.47, ch + 6), lv, t, red, 0);
    if (lv >= 7) { const c2 = ch - 16; smokeFrom(SX(0.47, 0.77), SY(0.47, 0.77, c2 + 6), lv, t + 1.7, red, 0.37); }
  }

  // ---- Cannery: blue shed, white gable roof, green label band, silver cans in front
  function canAt(u, v, h) {                          // a can: 11.8 x 13.2 px, label band, top
    const x = SX(u, v), y = SY(u, v, h), w = 4 * K, ht = 9 * K;
    g.beginPath(); g.moveTo(x - w, y - ht); g.lineTo(x - w, y); g.ellipse(x, y, w, 1.8 * K, 0, Math.PI, 0, true); g.lineTo(x + w, y - ht); g.closePath(); fillC(C.can);
    g.beginPath(); g.rect(x + 1 * K, y - ht, 3 * K, ht + 1.4 * K); fillC(C.canShade);
    g.beginPath(); g.rect(x - w, y - 6 * K, 2 * w, 3 * K); fillC(C.label);
    g.beginPath(); g.rect(x + 1 * K, y - 6 * K, 3 * K, 3 * K); fillC(C.labelR);
    ell(x, y - ht, w, 1.8 * K, 0, C.canTop);
  }
  const CAN_SLOTS = [[0.45, 1.78, 0], [0.75, 1.78, 0], [0.6, 1.78, 13.2], [1.5, 1.8, 0], [1.8, 1.75, 0], [1.65, 1.78, 13.2],
    [1.05, 1.84, 0], [0.3, 1.92, 0], [1.3, 1.93, 0], [0.9, 1.8, 13.2], [1.12, 1.82, 13.2]];
  const CAN_COUNT = [0, 3, 5, 6, 7, 8, 9, 10, 11];
  function canneryBody(lv) {
    const wc = C.shed, u = 0.1, v = 0.2, w = 1.8, d = 1.3;
    if (lv >= 8) {                                   // L8 a rooftop water tank on legs (behind the ridge)
      g.beginPath(); for (const [a, b] of [[0.88, 0.32], [1.22, 0.32], [0.88, 0.62], [1.22, 0.62]]) { mv(a, b, 30); ln(a, b, 60); }
      mv(0.88, 0.62, 52); ln(1.22, 0.62, 58); mv(1.22, 0.62, 52); ln(1.22, 0.32, 58); strokeC('#6f747c', 1.6 * K);
      cyl(1.05, 0.47, 0.2, 60, 76, C.tank); ell(SX(1.05, 0.47), SY(1.05, 0.47, 76), 3.6 * K, 1.8 * K, 0, '#c6cfd5');
    }
    box(u, v, w, d, 0, 30, wc);
    if (lv >= 6) { gableY(u, v, w / 2, d, 30, 14, C.shedRoof); gableY(u + w / 2, v, w / 2, d, 30, 14, C.shedRoof); }   // L6 a second bay
    else gableX(u, v, w, d, 30, 16, C.shedRoof);
    winL(u, v, w, d, 0.12, 8, 0.45, 15, C.shedWin);
    winL(u, v, w, d, 0.62, 12, 0.3, 9, PAL.windowLit);
    winR(u, v, w, d, 0.25, 12, 0.35, 9, lv >= 7 ? PAL.windowLitSide : C.shedWin);
    if (lv >= 7) winR(u, v, w, d, 0.62, 12, 0.25, 9, C.shedWin);
    faceL(u, u + w, v + d, 22, 26, C.label); faceR(u + w, v + d, v, 22, 26, C.labelR);
    if (lv >= 4) {                                   // L4 a conveyor arm along the right side, down to the cans
      const a0 = 1.84, a1 = 2.0;
      quad(a0, 0.62, 21, a1, 0.62, 21, a1, 1.9, 7, a0, 1.9, 7, C.conveyor[0]);
      quad(a1, 0.62, 21, a1, 1.9, 7, a1, 1.9, 4.5, a1, 0.62, 18.5, C.conveyor[2]);
      g.beginPath(); for (let i = 1; i < 6; i++) { const vv = 0.62 + 1.28 * i / 6, hh = 21 - 14 * i / 6; mv(a0, vv, hh); ln(a1, vv, hh); } strokeC(C.conveyor[2], 0.8 * K);
      g.beginPath(); mv(1.96, 1.25, 0); ln(1.96, 1.25, 12); mv(1.96, 1.82, 0); ln(1.96, 1.82, 6); strokeC(C.conveyor[2], 1.4 * K);
      canAt(1.95, 1.0, 20.5 - (1.0 - 0.62) / 1.28 * 14 + 1);
    }
    const n = CAN_COUNT[lv] || 3, slots = CAN_SLOTS.slice(0, n).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[2] - b[2]);
    for (const s of slots) canAt(s[0], s[1], s[2]);
  }

  // ---- Depot: crates in layers (4, min(L, 4), max(0, L - 4)), a teal tarp; L6 a lean-to roof
  function crate(u, v, w, d, h0, h1) {
    box(u, v, w, d, h0, h1, C.crate);
    g.beginPath(); const hm = (h0 + h1) / 2; mv(u + 0.04, v + d, hm); ln(u + w - 0.04, v + d, hm); mv(u + w, v + d - 0.04, hm); ln(u + w, v + 0.04, hm);
    strokeC(C.strap, 1 * K);
  }
  function depotBody(lv) {
    const L1 = [[0.15, 0.15, 0.8, 0.8], [1.0, 0.15, 0.85, 0.8], [0.15, 1.0, 0.8, 0.85], [1.0, 1.0, 0.85, 0.85]];
    const L2 = [[0.2, 0.2, 0.75, 0.75], [1.05, 0.2, 0.75, 0.75], [0.2, 1.05, 0.75, 0.75], [1.05, 1.05, 0.75, 0.75]];
    const L3 = [[0.25, 0.25, 0.68, 0.68], [1.08, 0.25, 0.68, 0.68], [0.25, 1.08, 0.68, 0.68], [1.08, 1.08, 0.68, 0.68]];
    const n2 = Math.min(lv, 4), n3 = Math.max(0, lv - 4), lean = lv >= 6;
    if (lean) {                                      // the back posts of the lean-to
      g.beginPath(); mv(0.06, 0.06, 0); ln(0.06, 0.06, 66); mv(1.94, 0.06, 0); ln(1.94, 0.06, 66); strokeC(C.wood[2], 1.8 * K);
    }
    for (const c of L1) crate(c[0], c[1], c[2], c[3], 0, 16);
    for (let i = 0; i < n2; i++) crate(L2[i][0], L2[i][1], L2[i][2], L2[i][3], 16, 31);
    for (let i = 0; i < n3; i++) crate(L3[i][0], L3[i][1], L3[i][2], L3[i][3], 31, 46);
    if (!lean) {
      const t = n3 ? L3[0] : L2[0], h = n3 ? 46 : 31;
      box(t[0] - 0.08, t[1] - 0.08, t[2] + 0.16, t[3] + 0.16, h, h + 3, C.tarp);
      faceL(t[0] - 0.08, t[0] + t[2] + 0.08, t[1] + t[3] + 0.08, h - 6, h, C.tarp[1]);
    } else {                                         // L6 the tarp becomes a lean-to roof on four posts
      g.beginPath(); mv(0.06, 1.94, 0); ln(0.06, 1.94, 54); mv(1.94, 1.94, 0); ln(1.94, 1.94, 54); strokeC(C.wood[1], 1.8 * K);
      quad(0.0, 0.0, 68, 2.0, 0.0, 68, 2.0, 2.0, 54, 0.0, 2.0, 54, C.tarp[0]);
      faceL(0.0, 2.0, 2.0, 51, 54, C.tarp[1]);
      quad(2.0, 2.0, 51, 2.0, 0.0, 65, 2.0, 0.0, 68, 2.0, 2.0, 54, C.tarp[2]);
    }
  }

  // ---- House: cottage, gable roof in the House's colour; L2 a second storey and a chimney
  const roofCols = (i) => { const c = HOUSE_ROOFS[((i | 0) % 3 + 3) % 3]; return [c, shade(c, -0.18)]; };
  function houseBody(lv, o) {
    const u = 0.2, v = 0.25, w = 1.6, d = 1.5, h = lv >= 2 ? 46 : 28, lit = !!o.lit;
    const wl = lit ? PAL.windowLit : PAL.windowDark, wr = lit ? PAL.windowLitSide : PAL.windowDarkSide;
    box(u, v, w, d, 0, h, C.cottage);
    gableY(u, v, w, d, h, 22, roofCols(o.roof));
    winL(u, v, w, d, 0.15, 0, 0.32, 17, PAL.door);
    winL(u, v, w, d, 0.62, 9, 0.32, 10, wl);
    winR(u, v, w, d, 0.3, 9, 0.36, 10, wr);
    if (lv >= 2) {
      winL(u, v, w, d, 0.15, 28, 0.32, 10, wl); winL(u, v, w, d, 0.62, 28, 0.32, 10, wl); winR(u, v, w, d, 0.3, 28, 0.36, 10, wr);
      box(1.4, 0.55, 0.28, 0.28, h + 4, h + 24, C.chimneyH);
    }
    if (o.lantern) {                                 // a lantern in the window of a Down person's House
      const x = SX(u + 0.62 * w + 0.16, v + d), y = SY(u + 0.62 * w + 0.16, v + d, 13);
      const gr = g.createRadialGradient(x, y, 0, x, y, 16 * K);
      gr.addColorStop(0, 'rgba(255,197,107,.75)'); gr.addColorStop(1, 'rgba(255,197,107,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 16 * K, 0, TAU); g.fill();
      g.beginPath(); rr(x - 2.2 * K, y - 3.2 * K, 4.4 * K, 5.4 * K, 1.2 * K); fillC(PAL.lantern);
      line(x, y - 3.2 * K, x, y - 5.4 * K, '#6b4a2e', 0.8 * K);
    }
  }

  // ---- Clinic: white block, roof slab, teal crosses (never a red cross), roof disc
  function crossL(uc, v, zc, s, c) {                 // a teal cross painted on a +v face, centred at u = uc, z = zc
    faceL(uc - 0.19 * s, uc + 0.19 * s, v, zc - 2.6 * s, zc + 2.6 * s, c); faceL(uc - 0.065 * s, uc + 0.065 * s, v, zc - 7.6 * s, zc + 7.6 * s, c);
  }
  function crossR(u, vc, zc, s, c) {
    faceR(u, vc + 0.19 * s, vc - 0.19 * s, zc - 2.6 * s, zc + 2.6 * s, c); faceR(u, vc + 0.065 * s, vc - 0.065 * s, zc - 7.6 * s, zc + 7.6 * s, c);
  }
  function roofDisc(u, v, h) {
    const x = SX(u, v), y = SY(u, v, h);
    ell(x, y, 12 * K, 6 * K, 0, C.teal);
    g.fillStyle = C.clinic[0]; g.fillRect(x - 5 * K, y - 1.3 * K, 10 * K, 2.6 * K); g.fillRect(x - 1.6 * K, y - 3.5 * K, 3.2 * K, 7 * K);
  }
  function clinicBody(lv) {
    const u = 0.15, v = 0.15, w = 1.7, d = 1.7;
    box(u, v, w, d, 0, 30, C.clinic);
    box(0.1, 0.1, 1.8, 1.8, 30, 34, C.clinicRoof);
    crossL(1.12, v + d, 17, 1, C.teal);
    winR(u, v, w, d, 0.25, 12, 0.4, 10, C.clinicWin); winR(u, v, w, d, 0.68, 12, 0.25, 10, C.clinicWin);
    winL(u, v, w, d, 0.42, 12, 0.18, 10, C.clinicWin);
    winL(u, v, w, d, 0.08, 0, 0.32, 16, C.clinicDoor);
    if (lv >= 3) {                                   // L3 a teal canopy over the door
      quad(0.24, 1.85, 18.5, 0.84, 1.85, 18.5, 0.84, 2.0, 15.5, 0.24, 2.0, 15.5, C.teal);
      faceL(0.24, 0.84, 2.0, 14, 15.5, C.tealDark);
    }
    if (lv >= 5) crossR(u + w, 0.98, 21, 0.8, C.teal);   // L5 a second cross on the right face
    if (lv >= 2) box(0.25, 0.3, 0.6, 0.5, 34, 44, C.unit);   // L2 a roof unit
    if (lv >= 6) {                                   // L6 a rooftop garden with three flowers
      box(0.3, 1.0, 0.75, 0.7, 34, 37, [C.garden, C.gardenSide, shade(C.gardenSide, -0.1)]);
      [[0.5, 1.2, '#f2c14e'], [0.8, 1.35, '#e5534b'], [0.55, 1.5, '#f7f2e8']].forEach(([a, b, c]) => disc(SX(a, b), SY(a, b, 39), 2 * K, c));
    }
    if (lv >= 4) {                                   // L4 a second wing (22 px) on the back right, the disc on its roof
      box(1.0, 0.2, 0.82, 0.9, 34, 56, C.clinic);
      box(0.97, 0.17, 0.88, 0.96, 56, 59, C.clinicRoof);
      winL(1.0, 0.2, 0.82, 0.9, 0.2, 41, 0.22, 9, C.clinicWin); winL(1.0, 0.2, 0.82, 0.9, 0.58, 41, 0.22, 9, C.clinicWin);
      winR(1.0, 0.2, 0.82, 0.9, 0.3, 41, 0.3, 9, C.clinicWin);
      roofDisc(1.41, 0.65, 59);
    } else roofDisc(1.0, 1.0, 34);
  }

  // ---- Armory: grey bunker, roof lip, mustard stripe
  function armoryBody(lv) {
    const u = 0.15, v = 0.2, w = 1.7, d = 1.6;
    if (lv >= 8) {                                   // L8 a radio mast at the back
      g.beginPath(); mv(0.42, 0.42, 28); ln(0.42, 0.42, 92); mv(0.42, 0.42, 80); ln(0.6, 0.42, 72); mv(0.42, 0.42, 80); ln(0.42, 0.6, 72); strokeC('#4b525a', 1.6 * K);
      disc(SX(0.42, 0.42), SY(0.42, 0.42, 93), 2 * K, '#ffb347');
    }
    box(u, v, w, d, 0, 24, C.bunker);
    box(0.1, 0.15, 1.8, 1.7, 24, 28, C.lip);
    faceL(u, u + w, v + d, 15, 19, C.mustard); faceR(u + w, v + d, v, 15, 19, C.mustardR);
    winL(u, v, w, d, 0.35, 0, 0.55, 13, C.bunkerDoor);
    winR(u, v, w, d, 0.3, 9, 0.4, 3, '#2c333b'); winR(u, v, w, d, 0.3, 9, 0.4, 1.2, '#59636e');
    if (lv >= 2) {                                   // L2 a roof target disc
      const x = SX(1.0, 1.0), y = SY(1.0, 1.0, 28);
      ell(x, y, 10 * K, 5 * K, 0, C.target); ell(x, y, 6 * K, 3 * K, 0, C.targetRed); ell(x, y, 2.5 * K, 1.2 * K, 0, C.target);
    }
    if (lv >= 7) {                                   // L7 a searchlight with a static cone
      box(1.55, 0.3, 0.2, 0.2, 28, 34, C.steel);
      const x = SX(1.65, 0.4), y = SY(1.65, 0.4, 38);
      g.beginPath(); g.moveTo(x - 2 * K, y); g.lineTo(x - 52 * K, y - 52 * K); g.lineTo(x - 28 * K, y - 66 * K); g.closePath(); fillC(C.cone);
      ell(x, y, 3.6 * K, 2.6 * K, -0.7, '#e9edf0'); ell(x - 0.8 * K, y - 0.8 * K, 2.2 * K, 1.5 * K, -0.7, '#fff6d8');
    }
    if (lv >= 6) {                                   // L6 ammo crates by the right wall
      box(1.86, 0.3, 0.13, 0.32, 0, 7, C.steel); box(1.86, 0.66, 0.13, 0.32, 0, 7, C.steel); box(1.86, 0.48, 0.13, 0.32, 7, 13, C.steel);
    }
    if (lv >= 5) {                                   // L5 a range lane strip with a tiny target
      quad(0.12, 1.84, 0.3, 1.9, 1.84, 0.3, 1.9, 1.99, 0.3, 0.12, 1.99, 0.3, C.lane);
      faceL(0.12, 1.9, 1.99, -0.5, 0.3, C.laneSide);
      g.beginPath(); mv(1.82, 1.9, 0); ln(1.82, 1.9, 9); strokeC(C.wood[1], 1.2 * K);
      const x = SX(1.82, 1.9), y = SY(1.82, 1.9, 11);
      ell(x, y, 2.8 * K, 3.2 * K, 0, C.target); ell(x, y, 1.5 * K, 1.8 * K, 0, C.targetRed);
    }
    if (lv >= 4) {                                   // L4 sandbags beside the door
      for (const [a, z] of [[0.28, 0], [0.5, 0], [0.39, 4.5]]) box(a, 1.83, 0.22, 0.15, z, z + 4.5, C.sandbag);
    }
    if (lv >= 3) {                                   // L3 a weapon rack outside
      const a0 = 1.3, a1 = 1.78, vv = 1.92;
      g.beginPath(); mv(a0, vv, 0); ln(a0, vv, 14); mv(a1, vv, 0); ln(a1, vv, 14); mv(a0, vv, 12); ln(a1, vv, 12); mv(a0, vv, 3); ln(a1, vv, 3); strokeC(C.wood[1], 1.3 * K);
      g.beginPath(); for (let i = 0; i < 3; i++) { const a = a0 + 0.1 + i * 0.13; mv(a, vv + 0.02, 1); ln(a + 0.05, vv + 0.02, 16); } strokeC('#2c333b', 1.6 * K);
    }
  }

  // ---- Inn: timber house, dark gable roof, striped awning, hanging sign, warm windows
  function innBody(lv) {
    const u = 0.15, v = 0.2, w = 1.7, d = 1.55, h = lv >= 2 ? 48 : 32;
    box(u, v, w, d, 0, h, C.timber);
    gableX(u, v, w, d, h, 18, C.innRoof);
    winL(u, v, w, d, 0.18, 0, 0.3, 13, C.innDoor); winL(u, v, w, d, 0.6, 4, 0.3, 9, PAL.windowLit);
    winR(u, v, w, d, 0.3, 12, 0.35, 10, PAL.windowLitSide);
    if (lv >= 2) { winL(u, v, w, d, 0.2, 32, 0.28, 9, PAL.windowLit); winL(u, v, w, d, 0.62, 32, 0.28, 9, PAL.windowLit); winR(u, v, w, d, 0.3, 32, 0.35, 9, PAL.windowLitSide); }
    if (lv >= 3) {                                   // L3 a terrace with two tables
      quad(0.15, 1.78, 0.6, 1.85, 1.78, 0.6, 1.85, 2.0, 0.6, 0.15, 2.0, 0.6, '#d9c49f');
      for (const a of [0.95, 1.45]) { g.beginPath(); mv(a, 1.9, 0); ln(a, 1.9, 6); strokeC(C.table[2], 1.2 * K); ell(SX(a, 1.9), SY(a, 1.9, 6.5), 5 * K, 2.4 * K, 0, C.table[0]); }
    }
    for (let k = 0; k < 6; k++) {                    // a 6-stripe awning on the left face
      const u0 = u + k * w / 6, u1 = u0 + w / 6;
      quad(u0, v + d, 20, u1, v + d, 20, u1, 1.99, 14.5, u0, 1.99, 14.5, k % 2 ? C.awningB : C.awningA);
    }
    faceL(u, u + w, 1.99, 13.2, 14.5, shade(C.awningA, -0.25));
    if (lv >= 3) {                                   // six string lights along the awning
      g.beginPath(); mv(u, 1.99, 14); for (let k = 1; k <= 12; k++) { const a = u + k * w / 12; ln(a, 1.99, 14 - (k % 2 ? 2.6 : 0)); } strokeC('#5a3a26', 0.8 * K);
      for (let k = 0; k < 6; k++) { const a = u + (k * 2 + 1) * w / 12; disc(SX(a, 1.99), SY(a, 1.99, 11.4 - 0.4), 1.9 * K, PAL.windowLit); }
    }
    // a hanging sign on the right corner
    const x = SX(u + w, 1.2), y = SY(u + w, 1.2, 26);
    line(x, y, x + 9 * K, y + 4 * K, C.innDoor, 1.3 * K);
    line(x + 7 * K, y + 3 * K, x + 7 * K, y + 5.5 * K, C.innDoor, 0.9 * K);
    g.fillStyle = C.sign; g.fillRect(x + 4.5 * K, y + 5 * K, 8 * K, 7 * K);
    g.fillStyle = shade(C.sign, -0.2); g.fillRect(x + 4.5 * K, y + 10.5 * K, 8 * K, 1.5 * K);
  }
  function innLive(lv, o) {                          // 1-3 tiny travelers with bags at the door
    const tr = o.travelers; if (!tr || !tr.length) return;
    const spots = [[0.3, 1.93], [0.66, 1.97], [1.0, 1.95]];
    const order = tr.slice(0, 3).map((lk, i) => [lk, spots[i]]).sort((a, b) => (a[1][0] + a[1][1]) - (b[1][0] + b[1][1]));
    for (const [lk, s] of order) {
      g.save(); g.translate(SX(s[0], s[1]), SY(s[0], s[1], 0)); g.scale(PK * 0.82, PK * 0.82);
      walker(lk, { facing: 1, pose: 'stand', carry: 'bag' });
      g.restore();
    }
  }

  const RECIPES = {
    tower: { body: towerBody, live: towerLive },
    kiln: { body: kilnBody, live: kilnLive },
    cannery: { body: canneryBody },
    depot: { body: depotBody },
    house: { body: houseBody },
    clinic: { body: clinicBody },
    armory: { body: armoryBody },
    inn: { body: innBody, live: innLive },
  };

  // drawn height (top) and picking height (h) per type and level, px at zoom 1
  function topOf(type, lv) {
    switch (type) {
      case 'tower': { const bz = 8 + 22 * storeys(lv); return bz + 58 + (lv >= 2 ? 15 * K + 2 : 0); }
      case 'kiln': return 40 + 9 * lv;
      case 'cannery': return lv >= 8 ? 80 : 46;
      case 'depot': return lv >= 6 ? 68 : (lv > 4 ? 49 : 34);
      case 'house': return lv >= 2 ? 70 : 50;
      case 'clinic': return lv >= 4 ? 59 : lv >= 2 ? 44 : 34;
      case 'armory': return lv >= 8 ? 96 : lv >= 7 ? 74 : 28;
      case 'inn': return lv >= 2 ? 66 : 50;
    }
    return 40;
  }
  function hitOf(type, lv) {
    switch (type) {
      case 'tower': return 8 + 22 * storeys(lv) + 58;
      case 'kiln': return 38;
      case 'cannery': return 46;
      case 'depot': return lv >= 6 ? 66 : (lv > 4 ? 49 : 34);
      case 'house': return lv >= 2 ? 68 : 50;
      case 'clinic': return lv >= 4 ? 59 : 34;
      case 'armory': return 28;
      case 'inn': return lv >= 2 ? 66 : 50;
    }
    return 40;
  }
  // picking heights of the 1 x 1 objects (the tile diamond extended up by this much, 8.1)
  const SMALL_H = { grave: Math.round(31 * 1.3 * K), rubble: 10, tree: 62, bench: 15, lamp: 58 };
  const DOOR = { tower: [1.5, 3], kiln: [0.62, 2], cannery: [1.0, 2], depot: [1.0, 2], house: [0.6, 2], clinic: [0.48, 2], armory: [1.02, 2], inn: [0.6, 2] };
  const CONFETTI = {
    tower: ['#f3e9d4', '#d0643c', '#f2c14e'], kiln: ['#c9583e', '#e0745a', '#ddcdb4'], cannery: ['#93b6d1', '#6fae5a', '#c9d2d8'],
    depot: ['#d2ad6e', '#4f8f8a', '#b8935a'], house: ['#f6eedf', '#5b7fb8', '#ffd98a'], clinic: ['#fbfbf7', '#2f9e8f', '#9fd3cb'],
    armory: ['#6a7684', '#d9a441', '#f6f1e7'], inn: ['#c58b5c', '#e5534b', '#f2c14e'],
  };
  function info(type, lv) {
    const f = FOOT[type] || [1, 1], w = f[0], d = f[1];
    if (!RECIPES[type]) {
      const h = SMALL_H[type] || 30;
      return { w, d, h, top: h + (type === 'rubble' ? 14 : 4), bubble: [w / 2, d / 2, h + 18], pill: [w / 2, d / 2, h + 8], door: [w / 2, d], crane: [w - 0.2, 0.2], colors: ['#f3efe6', '#d8d3c6'] };
    }
    lv = clampLv(type, lv);
    const top = topOf(type, lv);
    return { w, d, h: hitOf(type, lv), top, bubble: [w / 2, d / 2, top + 6], pill: [w / 2, d / 2, top + 4], door: DOOR[type].slice(),
      crane: [w - 0.2, 0.2], colors: (CONFETTI[type] || []).slice() };
  }
  // local bounds (world px around the anchor) of a building's body; generous on purpose
  function localBounds(type, lv) {
    const f = FOOT[type], w = f[0], d = f[1], top = topOf(type, lv);
    let x0 = -d * 32 - 6, x1 = w * 32 + 6, y0 = -top - 10, y1 = (w + d) * 16 + 6;
    if (type === 'armory' && lv >= 7) { x0 = Math.min(x0, SX(1.65, 0.4) - 56 * K); y0 = Math.min(y0, SY(1.65, 0.4, 38) - 70 * K); }
    if (type === 'inn') x1 = Math.max(x1, SX(1.85, 1.2) + 14 * K);
    if (type === 'tower') x1 = Math.max(x1, 16 * K + 4);
    if (type === 'cannery' && lv >= 4) x1 = Math.max(x1, SX(2.0, 0.62) + 8);
    return { x0, y0, x1, y1 };
  }

  // ---- the sprite cache: one bitmap per (type, level, variant, density bucket); LRU by pixel area
  const RHO_MAX = 4.01;                              // above 4 device px per world px buildings are drawn live
  const SPR = new Map(); let sprArea = 0; const SPR_BUDGET = 14e6;
  function rhoFor(zd) { return Math.pow(2, Math.ceil(Math.log2(Math.max(0.05, zd)) * 4 - 1e-9) / 4); }
  function variantKey(type, o) { return type === 'house' ? ((o.roof | 0) % 3) + (o.lit ? 'L' : '') + (o.lantern ? 'N' : '') : ''; }
  function sprite(type, lv, rho, o) {
    const key = type + lv + '|' + rho + '|' + variantKey(type, o);
    let s = SPR.get(key);
    if (s) { SPR.delete(key); SPR.set(key, s); return s; }
    const b = localBounds(type, lv), cw = Math.ceil((b.x1 - b.x0) * rho) + 2, ch = Math.ceil((b.y1 - b.y0) * rho) + 2;
    const cv = mkCanvas(cw, ch); if (!cv) return null;
    const c = cv.getContext('2d'); c.setTransform(rho, 0, 0, rho, (-b.x0) * rho + 1, (-b.y0) * rho + 1);
    const pg = g; g = c;
    try { RECIPES[type].body(lv, Object.assign({}, o, { bell: 0 })); } finally { g = pg; }
    s = { cv, ox: b.x0 - 1 / rho, oy: b.y0 - 1 / rho, w: cw / rho, h: ch / rho, rho, area: cw * ch, mask: {} };
    SPR.set(key, s); sprArea += s.area;
    for (const [k, v] of SPR) { if (sprArea <= SPR_BUDGET || SPR.size <= 1) break; if (v === s) continue; SPR.delete(k); sprArea -= v.area; }
    return s;
  }
  function spriteMask(s, col) {
    let m = s.mask[col]; if (m) return m;
    m = mkCanvas(s.cv.width, s.cv.height); const c = m.getContext('2d');
    c.drawImage(s.cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = col; c.fillRect(0, 0, m.width, m.height);
    s.mask[col] = m; return m;
  }
  const RING8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.71, 0.71], [-0.71, 0.71], [0.71, -0.71], [-0.71, -0.71]];

  function building(ctx, type, lv, x, y, z, o) {
    o = o || {}; const R = RECIPES[type]; if (!R || !ctx) return;
    lv = clampLv(type, lv);
    const f = FOOT[type], lift = (o.lift || 0), st = o.stretch || 1, alpha = o.alpha === undefined ? 1 : o.alpha;
    const dpr = devScale(ctx), rho = rhoFor(z * dpr);
    const live = o.cache === false || (o.cache === undefined && !FR.cache) || rho > RHO_MAX || (type === 'tower' && o.bell);
    // shadow on the ground (grows a little while lifted)
    if (o.shadow !== false) withAt(ctx, x, y, z, () => {
      if (alpha < 1) g.globalAlpha = alpha;
      shadowPoly(f[0], f[1], SHADOW_LEN[type] * (1 + Math.min(lift, 40) / (40 * z) * 0.35), lift ? 'rgba(29,42,32,.17)' : PAL.shadow);
    });
    const by = y - lift;
    const px = x + SX(f[0] / 2, f[1] / 2) * z, py = by + SY(f[0] / 2, f[1] / 2, 0) * z;
    ctx.save();
    if (st !== 1) { ctx.translate(px, py); ctx.scale(1 - (st - 1) * 0.5, st); ctx.translate(-px, -py); }
    if (alpha < 1) ctx.globalAlpha *= alpha;
    let s = null;
    if (!live) s = sprite(type, lv, rho, o);
    if (s) {
      if (o.selected || o.hover) {                   // a 2 px outline: the sprite's silhouette stamped around it
        const m = spriteMask(s, o.selected ? PAL.accent : '#ffffff'), r = o.selected ? 2.2 : 1.6, a0 = ctx.globalAlpha;
        if (!o.selected) ctx.globalAlpha = a0 * 0.8;
        for (const [ax, ay] of RING8) ctx.drawImage(m, x + s.ox * z + ax * r, by + s.oy * z + ay * r, s.w * z, s.h * z);
        ctx.globalAlpha = a0;
      }
      ctx.drawImage(s.cv, x + s.ox * z, by + s.oy * z, s.w * z, s.h * z);
    } else {
      if (o.selected || o.hover) withAt(ctx, x, by, z, () => {   // live path: an outline of the extruded footprint
        const hh = hitOf(type, lv);
        g.beginPath(); mv(0, 0, hh); ln(f[0], 0, hh); ln(f[0], 0, 0); ln(f[0], f[1], 0); ln(0, f[1], 0); ln(0, f[1], hh); g.closePath();
        g.lineJoin = 'round'; strokeC(o.selected ? PAL.accent : 'rgba(255,255,255,.8)', 2.4 / z); g.lineJoin = 'miter';
      });
      withAt(ctx, x, by, z, () => R.body(lv, o));
    }
    if (R.live) withAt(ctx, x, by, z, () => R.live(lv, o));
    ctx.restore();
  }
  function silhouette(type, lv, x, y, z) {
    const f = FOOT[type] || [1, 1], h = RECIPES[type] ? hitOf(type, clampLv(type, lv)) : 30, w = f[0], d = f[1];
    const p = (u, v, hh) => [x + SX(u, v) * z, y + SY(u, v, hh) * z];
    return [p(0, 0, h), p(w, 0, h), p(w, 0, 0), p(w, d, 0), p(0, d, 0), p(0, d, h)];
  }
  function bounds(type, lv, x, y, z) {                // the body plus its ground shadow
    let b = RECIPES[type] ? localBounds(type, clampLv(type, lv)) : { x0: -40, y0: -70, x1: 40, y1: 36 };
    if (RECIPES[type]) {
      const f = FOOT[type], L = SHADOW_LEN[type];
      b = { x0: Math.min(b.x0, (-f[1] - 0.6 * L) * 32 - 1), y0: b.y0, x1: Math.max(b.x1, (f[0] + 0.4 * L) * 32 + 1), y1: Math.max(b.y1, (f[0] + f[1] + 2 * L) * 16 + 1) };
    }
    return { x0: x + b.x0 * z, y0: y + b.y0 * z, x1: x + b.x1 * z, y1: y + b.y1 * z };
  }

  // ---- construction: site, scaffold, crane
  const SITE = { tower: [0.65, 0.65, 1.7, 1.7, 52, C.shaft], kiln: [0.15, 0.15, 1.7, 1.7, 30, C.kilnBase], cannery: [0.1, 0.2, 1.8, 1.3, 30, C.shed],
    depot: [0.15, 0.15, 1.7, 1.7, 16, C.crate], house: [0.2, 0.25, 1.6, 1.5, 28, C.cottage], clinic: [0.15, 0.15, 1.7, 1.7, 30, C.clinic],
    armory: [0.15, 0.2, 1.7, 1.6, 24, C.bunker], inn: [0.15, 0.2, 1.7, 1.55, 32, C.timber] };
  function scaffoldLines(w, d, h) {
    g.beginPath();
    for (const [a, b] of [[0, d], [w, d], [w, 0], [w / 2, d], [w, d / 2]]) { mv(a, b, 0); ln(a, b, h); }
    for (const zz of [h * 0.35, h * 0.7, h]) { mv(0, d, zz); ln(w, d, zz); ln(w, 0, zz); }
    mv(0, d, 0); ln(w / 2, d, h * 0.7); mv(w, 0, 0); ln(w, d / 2, h * 0.7);
    strokeC(C.scaffold, 1.2 * K);
  }
  function scaffold(ctx, x, y, z, w, d, h) { withAt(ctx, x, y, z, () => scaffoldLines(w, d, h)); }
  function site(ctx, type, x, y, z, progress, o) {
    const f = FOOT[type] || [2, 2], s = SITE[type] || SITE.house, p = Math.max(0, Math.min(1, progress || 0));
    withAt(ctx, x, y, z, () => {
      shadowPoly(f[0], f[1], 0.35);
      box(0.06, 0.06, f[0] - 0.12, f[1] - 0.12, 0, 3, C.slab);
      const hh = 3 + (s[4] - 3) * (0.12 + 0.88 * p), wc = [mix(s[5][0], '#ffffff', 0.25), mix(s[5][1], '#ffffff', 0.18), mix(s[5][2], '#ffffff', 0.12)];
      box(s[0], s[1], s[2], s[3], 3, hh, wc);
      // a pallet of bricks on the slab
      box(0.12, f[1] - 0.42, 0.34, 0.26, 3, 8, C.bricks); box(0.16, f[1] - 0.4, 0.26, 0.2, 8, 12, C.bricks);
      scaffoldLines(f[0], f[1], Math.max(hh + 8, s[4] * 0.8));
    });
  }
  function craneDraw(o) {
    const mh = o.folded ? 34 : Math.max(30, o.mast || 80), ang = o.jib || 0, part = o.part || 'all';
    const cs = Math.cos(ang), sn = Math.sin(ang);
    if (part !== 'jib') {
      box(-0.2, -0.2, 0.4, 0.4, 0, 4, [C.counter, '#4d5763', '#3f4851']);
      box(-0.12, -0.12, 0.24, 0.24, 4, mh, C.crane);
      g.beginPath(); for (let zz = 10; zz < mh - 4; zz += 9) { mv(-0.12, 0.12, zz); ln(0.12, 0.12, zz + 9); mv(0.12, 0.12, zz); ln(0.12, -0.12, zz + 9); }
      strokeC(C.lattice, 0.8 * K);
      topQ(-0.13, -0.13, 0.27, 0.27, mh, C.cab);
    }
    if (part === 'mast') return;
    if (o.folded) {                                  // parked: the jib folded down along the mast
      const tx = SX(0, 0), ty = SY(0, 0, mh + 6);
      g.lineCap = 'round';
      line(tx, ty, SX(0.55, -0.3), SY(0.55, -0.3, 10), C.crane[1], 3 * K);
      line(tx, ty, SX(-0.25, 0.12), SY(-0.25, 0.12, mh - 10), C.crane[2], 3 * K);
      g.lineCap = 'butt';
      g.fillStyle = C.counter; const bx = SX(-0.25, 0.12), byy = SY(-0.25, 0.12, mh - 10); g.fillRect(bx - 4 * K, byy - 2 * K, 8 * K, 6 * K);
      return;
    }
    const jz = mh + 4;
    const tipX = SX(cs * 2.4, sn * 2.4), tipY = SY(cs * 2.4, sn * 2.4, jz), bkX = SX(-cs * 0.9, -sn * 0.9), bkY = SY(-cs * 0.9, -sn * 0.9, jz);
    const topX = SX(0, 0), topY = SY(0, 0, mh + 16);
    g.lineCap = 'round'; line(bkX, bkY, tipX, tipY, C.crane[1], 3 * K); g.lineCap = 'butt';
    g.beginPath(); g.moveTo(tipX, tipY); g.lineTo(topX, topY); g.lineTo(bkX, bkY); strokeC('#7a6a55', 0.8 * K);
    g.fillStyle = C.counter; g.fillRect(bkX - 4 * K, bkY - 2 * K, 8 * K, 6 * K);
    const hu = cs * 2.0, hv = sn * 2.0, lh = Math.max(14, mh * 0.62);
    line(SX(hu, hv), SY(hu, hv, jz), SX(hu, hv), SY(hu, hv, lh + 6), C.cable, 0.8 * K);
    if (o.load !== false) { box(hu - 0.09, hv - 0.07, 0.18, 0.14, lh, lh + 5, C.bricks); box(hu - 0.07, hv - 0.05, 0.13, 0.1, lh + 5, lh + 8, C.bricks); }
  }
  function crane(ctx, x, y, z, o) { withAt(ctx, x, y, z, () => craneDraw(o || {})); }

  // ---- rubble and its glint
  function rubbleBody() {
    box(0.15, 0.2, 0.45, 0.4, 0, 7, [PAL.rubbleTop, PAL.rubbleLeft, PAL.rubbleRight]);
    box(0.5, 0.45, 0.35, 0.35, 0, 5, [PAL.rubbleTop, PAL.rubbleLeft, PAL.rubbleRight]);
    box(0.3, 0.55, 0.25, 0.25, 5, 10, [PAL.rubbleTop, PAL.rubbleLeft, PAL.rubbleRight]);
    box(0.62, 0.22, 0.18, 0.16, 0, 3.5, [PAL.rubbleTop, PAL.rubbleLeft, PAL.rubbleRight]);
  }
  function glintStar(o) {
    const t = tOf(o), red = redOf(o), x = SX(0.55, 0.55), y = SY(0.55, 0.55, 18);
    const k = red ? 1 : 0.78 + 0.22 * Math.sin(t * 4.2), r = 4.5 * K * k;
    if (!red) { g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 4.2 + 1); disc(x, y, r * 1.1, 'rgba(79,216,255,.35)'); g.globalAlpha = 1; }
    star4(x, y, r, PAL.spark);
  }
  function rubble(ctx, x, y, z, o) { o = o || {}; withAt(ctx, x, y, z, () => { rubbleBody(); if (o.glint && o.star !== false) glintStar(o); }); }
  function glint(ctx, x, y, z, o) { withAt(ctx, x, y, z, () => glintStar(o || {})); }

  // ------------------------------------------------------------------------------------------------ graves (6.7)
  function hash32(a) { a = (a | 0) ^ 0x5bd1e995; a = Math.imul(a ^ (a >>> 15), 0x2c1b3c6d); a = Math.imul(a ^ (a >>> 12), 0x297a2d39); return (a ^ (a >>> 15)) >>> 0; }
  function graveBody(o) {
    const age = o.ageDays || 0, t = tOf(o), red = redOf(o), S = 1.3 * K;
    const x0 = SX(0.5, 0.5), y0 = SY(0.5, 0.5, 0);
    g.save(); g.translate(x0, y0); g.scale(S, S);
    // mound: fresh soil, grassed over after a day
    const grassed = age >= 1;
    ell(0, 2, 13, 6, 0, grassed ? C.moundGrassDark : C.moundDark);
    ell(-0.5, 1.2, 12, 5, 0, grassed ? C.moundGrass : C.mound);
    if (!grassed) ell(-2, 1, 8, 3.2, 0, shade(C.mound, 0.12));
    // headstone: side then front, a rounded slab
    g.beginPath(); g.moveTo(-3, -2); g.lineTo(8, -6); g.lineTo(8, -24); g.quadraticCurveTo(4, -31, -3, -24); g.closePath(); fillC(C.stoneSide);
    g.beginPath(); g.moveTo(-11, -6); g.lineTo(-3, -2); g.lineTo(-3, -24); g.quadraticCurveTo(-7, -31, -11, -25); g.closePath(); fillC(C.stone);
    // carved initial (Barlow Condensed 700), skewed onto the front face
    g.save(); g.transform(1, 0.45, 0, 1, -7, -12); g.fillStyle = C.carve; g.font = '700 9px ' + COND; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(o.initial || '').slice(0, 1).toUpperCase(), 0, -1); g.restore();
    // a ribbon in the jacket colour
    const rib = o.ribbon || '#8a8f98';
    g.beginPath(); g.moveTo(-11, -20.4); g.lineTo(-3, -16.8); g.lineTo(-3, -14.6); g.lineTo(-11, -18.2); g.closePath(); fillC(rib);
    g.beginPath(); g.moveTo(-3.6, -16.2); g.lineTo(-1.2, -10.5); g.lineTo(-2.8, -10.8); g.lineTo(-4.6, -15); g.closePath(); fillC(shade(rib, -0.15));
    // flowers: 2 from day 3, 4 from day 7, colours from the person seed; o.flowers (0-4) overrides the count (the
    // engine's view.graves[].flowers, where housemates add theirs)
    const nF = o.flowers != null ? Math.max(0, Math.min(4, o.flowers | 0)) : age >= 7 ? 4 : age >= 3 ? 2 : 0;
    if (nF) {
      const h = hash32(o.seed || 7), spots = [[-12, 3], [9, 4], [-8, 6], [12, 1]];
      for (let i = 0; i < nF; i++) {
        const c = o.flowerColors && o.flowerColors.length ? o.flowerColors[i % o.flowerColors.length] : FLOWERS[(h >>> (i * 3)) % 4], [dx, dy] = spots[i];
        g.fillStyle = C.stem; g.fillRect(dx - 0.5, dy - 5, 1, 5); disc(dx, dy - 6, 2.2, c); disc(dx, dy - 6, 0.8, '#f8e7a8');
      }
    }
    // a candle with a warm glow for the first 24 h
    if (age < 1) {
      const fl = red ? 1 : 0.86 + 0.14 * Math.sin(t * 13 + Math.sin(t * 5.3) * 2);
      g.fillStyle = C.candle; g.fillRect(3, -3, 2.4, 5);
      g.globalAlpha = 0.45 * fl; disc(4.2, -5, 4.5 * fl, 'rgb(255,200,90)'); g.globalAlpha = 1;
      disc(4.2, -5, 1.4, C.flame);
    }
    g.restore();
  }
  function grave(ctx, x, y, z, o) { withAt(ctx, x, y, z, () => graveBody(o || {})); }

  // ---- P1 decorations
  function decorBody(kind, o) {
    if (kind === 'tree') {
      const s = o.size || 1, x = SX(0.5, 0.5), y = SY(0.5, 0.5, 0);
      ell(x + 4 * K * s * 0.68, y + 1, 14 * s, 6 * s, 0, 'rgba(29,42,32,.15)');
      g.fillStyle = C.trunk; g.fillRect(x - 1.5 * K, y - 14 * K * s, 3 * K, 14 * K * s);
      [[0, -30, 15, 0], [-5, -26, 10, 1], [5, -34, 11, 2], [-2, -40, 8, 3]].forEach(([dx, dy, r, i]) => disc(x + dx * s * K, y + dy * s * 1.35, r * s, C.leaves[i]));
    } else if (kind === 'bench') {
      shadowPoly(1, 1, 0.25);
      box(0.15, 0.45, 0.7, 0.18, 6, 8, C.wood); box(0.15, 0.38, 0.7, 0.06, 8, 15, C.wood);
      g.beginPath(); for (const a of [0.2, 0.8]) { mv(a, 0.62, 0); ln(a, 0.62, 6); mv(a, 0.45, 0); ln(a, 0.45, 6); } strokeC('#4b525a', 1.4 * K);
    } else if (kind === 'lamp') {
      ell(SX(0.5, 0.5), SY(0.5, 0.5, 0), 6, 3, 0, 'rgba(29,42,32,.15)');
      box(0.44, 0.44, 0.12, 0.12, 0, 46, ['#5f6b78', '#4b525a', '#3f4851']);
      box(0.38, 0.38, 0.24, 0.24, 46, 52, ['#f6f1e7', '#ffd98a', '#f2c472']);
      pyramid(0.36, 0.36, 0.28, 0.28, 52, 6, ['#4b525a', '#3f4851'], 0.02);
    }
  }
  function decor(ctx, kind, x, y, z, o) { withAt(ctx, x, y, z, () => decorBody(kind, o || {})); }

  // ------------------------------------------------------------------------------------------------ people (4.3, 4.9)
  // FACE[i] = [screen x sign of the facing, sees the face, screen unit vector of the walk]
  const FACE = [[1, 1, 0.894, 0.447], [-1, 1, -0.894, 0.447], [-1, 0, -0.894, -0.447], [1, 0, 0.894, -0.447]];
  const GRID = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function facingOf(dx, dy) { return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3); }
  const IDC = (c) => c;
  let CF = IDC;                                      // colour filter while drawing a person (grey for Down / Fallen)
  const BANDAGE = '#f7f4ec', LEGS = '#3a3a44';
  // hair cap on a head circle at (hx, hy) radius r: the part of a circle grown by e above the hairline (hl above centre)
  function capCircle(hx, hy, r, e, hl) {
    const R = r + e, a = Math.asin(Math.max(-1, Math.min(1, hl / R)));
    g.beginPath(); g.arc(hx, hy, R, Math.PI + a, TAU - a); g.closePath();
  }
  function headWalker(look, hx, hy, dir, front, o) {
    const skin = CF(look.skin), hair = CF(look.hair), st = look.hairStyle, acc = look.acc, ac = CF(accent(look.jacket));
    const buzzC = CF(mix(look.hair, look.skin, 0.3));
    // behind the head
    if (front && st === 'ponytail') ell(hx - dir * 3.2, hy + 1.6, 1.4, 2.8, -dir * 0.3, hair);
    if (st === 'bob') { g.beginPath(); rr(hx - 4.3, hy - 2.2, 8.6, 5.6, 2.2); fillC(hair); }
    disc(hx, hy, 3.6, skin);
    if (front) {
      if (st === 'buzz') { capCircle(hx, hy, 3.6, 0.15, 1.5); fillC(buzzC); }
      else if (st === 'short') { capCircle(hx, hy, 3.6, 0.35, 0.5); fillC(hair); }
      else if (st === 'bob' || st === 'bun' || st === 'ponytail') { capCircle(hx, hy, 3.6, 0.3, 0.8); fillC(hair); }
      else if (st === 'curls') { capCircle(hx, hy, 3.6, 0.3, 0.4); fillC(hair); disc(hx - 2.3, hy - 2.7, 1.7, hair); disc(hx, hy - 3.7, 1.9, hair); disc(hx + 2.3, hy - 2.7, 1.7, hair); }
    } else if (st !== 'bald') {
      disc(hx, hy - 0.1, 3.75, st === 'buzz' ? buzzC : hair);
      if (st === 'curls') { disc(hx - 2.3, hy - 2.7, 1.7, hair); disc(hx, hy - 3.7, 1.9, hair); disc(hx + 2.3, hy - 2.7, 1.7, hair); }
      if (st === 'ponytail') ell(hx, hy + 3.4, 1.3, 2.8, 0, hair);
    }
    if (st === 'bun') disc(hx + dir * 0.4, hy - 4.3, 1.9, hair);
    // accessory
    if (acc === 'beanie') { capCircle(hx, hy - 0.4, 3.6, 0.6, 0.2); fillC(ac); g.beginPath(); rr(hx - 4.1, hy - 1.6, 8.2, 1.6, 0.8); fillC(CF(shade(accent(look.jacket), -0.2))); }
    else if (acc === 'cap') { capCircle(hx, hy - 0.4, 3.6, 0.35, 0.3); fillC(ac); g.beginPath(); rr(dir > 0 ? hx - 0.5 : hx - 5.5, hy - 1.6, 6, 1.6, 0.8); fillC(CF(shade(accent(look.jacket), -0.2))); }
    else if (acc === 'headband') { g.save(); g.beginPath(); g.arc(hx, hy, 3.85, 0, TAU); g.clip(); g.fillStyle = ac; g.fillRect(hx - 4, hy - 2.3, 8, 1.5); g.restore(); }
    else if (acc === 'glasses' && front) { g.fillStyle = CF('#1d1a1a'); g.fillRect(hx - 2.9 + dir * 0.6, hy - 0.2, 5.8, 0.6); disc(hx - 1.4 + dir * 0.7, hy + 0.1, 1.05, CF('#1d1a1a')); disc(hx + 1.6 + dir * 0.7, hy + 0.1, 1.05, CF('#1d1a1a')); }
    if (o.state === 'hurt') { g.beginPath(); rr(hx - 3.9, hy - 2.4, 7.8, 1.7, 0.8); fillC(CF(BANDAGE)); g.beginPath(); g.moveTo(hx - dir * 3.6, hy - 1.8); g.lineTo(hx - dir * 5.6, hy - 0.4); g.lineTo(hx - dir * 5, hy + 0.6); g.closePath(); fillC(CF('#e6e1d6')); }
  }
  // a walker in figure units with the feet at (0, 0); the public person() sets the scale
  // o.state accepts the engine's words: 'ready' | 'out' (plain), 'rest' + o.restKind, 'tired' | 'resting' (slumped),
  // 'hurt' (head bandage), 'recovering' (arm sling), 'down' (lying unless a pose is given)
  function stateLook(o) {
    let st = o.state || 'ready';
    if (st === 'rest') st = o.restKind || 'tired';
    if (st === 'resting') st = 'tired';
    return st;
  }
  function walker(look, o) {
    const fi = (((o.facing | 0) % 4) + 4) % 4, FF = FACE[fi], dir = FF[0], front = !!FF[1], mx = FF[2], my = FF[3];
    const st = stateLook(o), pose = o.pose || (st === 'down' ? 'lie' : 'stand');
    if (st !== o.state) o = Object.assign({}, o, { state: st });
    if (pose === 'lie') { lying(look, fi, o); return; }
    const walking = pose === 'walk' && !redOf(o), ph = walking ? (((o.phase || 0) % 1) + 1) % 1 : 0, step = walking ? Math.floor(ph * 4) : -1;
    let sw = 0, bob = 0, dip = 0, lean = 0;
    if (walking) { sw = [1, 0, -1, 0][step]; bob = [0, 1, 0, 1][step]; if (o.limp) { if (step === 2) { sw = -0.45; dip = 1; lean = 0.8; } else if (step === 3) bob = 0; } }
    if (o.bob === false) bob = 0;
    const sit = pose === 'sit', tired = st === 'tired', by = -bob * 0.8 + dip * 0.9 + (sit ? 1.5 : 0) + (tired ? 0.4 : 0);
    if (o.ring || o.selected) { g.beginPath(); g.ellipse(0, 0, 9, 4, 0, 0, TAU); strokeC(PAL.accent, o.selected ? 2.4 : 1.6); }
    ell(0, 0, 6, 2.6, 0, 'rgba(29,42,32,.2)');
    // legs
    g.beginPath(); g.lineCap = 'round';
    if (sit) { for (const s of [-1, 1]) { const hx = s * 1.5; g.moveTo(hx, -5); g.lineTo(hx + dir * 3.2, -4.6); g.lineTo(hx + dir * 3.5, -0.6); } }
    else { const fx = sw * 1.5 * mx, fy = sw * 1.5 * my; g.moveTo(-1.6 + lean * dir * 0.3, -6 + by); g.lineTo(-1.6 + fx, -0.5 + fy); g.moveTo(1.6 + lean * dir * 0.3, -6 + by); g.lineTo(1.6 - fx, -0.5 - fy); }
    g.strokeStyle = CF(LEGS); g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke(); g.lineCap = 'butt'; g.lineJoin = 'miter';
    const bx = lean * dir * 0.6, jy = -15 + by + (sit ? 0.2 : 0), jh = 10 - (tired ? 0.4 : 0);
    // a bag on the back (travelers) goes behind the body when facing the viewer
    if (o.carry === 'bag' && front) { g.beginPath(); rr(bx - dir * 5.4 - 2.4, jy + 1.5, 4.8, 6.2, 1.6); fillC(CF('#8a6a4a')); }
    // body: a rounded jacket, the right 3.4 px 22 % darker
    const jk = CF(look.jacket);
    g.beginPath(); rr(bx - 4.4, jy, 8.8, jh, 3); fillC(jk);
    g.beginPath(); rr4(bx + 1, jy, 3.4, jh, 0, 3, 3, 0); fillC(CF(shade(look.jacket, -0.22)));
    if (look.acc === 'scarf') { g.beginPath(); rr(bx - 4.6, jy - 0.4, 9.2, 2.6, 1.3); fillC(CF(accent(look.jacket))); g.beginPath(); rr(bx + dir * 1.6 - 0.9, jy + 1.4, 1.9, 4.2, 0.8); fillC(CF(shade(accent(look.jacket), -0.15))); }
    if (st === 'recovering') {                       // an arm sling across the jacket
      g.beginPath(); g.moveTo(bx - 3.6, jy + 0.6); g.lineTo(bx + 3.4, jy + 5.6); g.lineTo(bx + 2.2, jy + 6.6); g.lineTo(bx - 3.9, jy + 2.2); g.closePath(); fillC(CF(BANDAGE));
      g.beginPath(); rr(bx - 2.6, jy + 4.6, 5.8, 3, 1.4); fillC(CF(BANDAGE));
    }
    if (o.carry === 'sack') {                        // the loot sack at the trailing side
      const sx = bx - dir * 5.6, sy = jy + 3.5;
      disc(sx, sy, 3.7, CF('#c9a46a')); disc(sx + 1.1, sy + 0.6, 2.4, CF('#b8935a'));
      g.fillStyle = CF('#9c7b47'); g.fillRect(sx - 1, sy - 5, 2, 2.4);
    }
    if (o.carry === 'bag' && !front) { g.beginPath(); rr(bx - 2.6, jy + 1.2, 5.2, 6.6, 1.6); fillC(CF('#8a6a4a')); }
    const hx = bx + (tired ? dir * 0.5 : 0) + lean * dir * 0.4, hy = jy - 4 + (tired ? 0.6 : 0);
    headWalker(look, hx, hy, dir, front, o);
  }
  // lying along the facing direction, head first (the stranger at the gate; the stretcher's patient)
  function lying(look, fi, o) {
    const ang = [0.4636, Math.PI - 0.4636, Math.PI + 0.4636, -0.4636][fi], ax = Math.cos(ang), ay = Math.sin(ang);
    const lift = o.lift || 0;
    if (!lift) ell(0, 0.4, 11.5, 3.6, ang, 'rgba(29,42,32,.2)');
    const P = (k, up) => [ax * k, ay * k - 1.6 - lift - (up || 0)];
    g.lineCap = 'round';
    let a = P(-8.5), b = P(-2.5);
    line(a[0] - 1.1 * ay, a[1] + 1.1 * ax * 0.5, b[0], b[1], CF(LEGS), 2.3); line(a[0] + 1.1 * ay, a[1] - 0.6, b[0], b[1], CF(LEGS), 2.3);
    a = P(-3); b = P(4.2);
    line(a[0], a[1] + 1, b[0], b[1] + 1, CF(shade(look.jacket, -0.22)), 7);
    line(a[0], a[1], b[0], b[1], CF(look.jacket), 6.4);
    g.lineCap = 'butt';
    const h = P(8, 0.4);
    disc(h[0], h[1], 3.4, CF(look.skin));
    if (look.hairStyle !== 'bald') { g.beginPath(); g.arc(h[0], h[1], 3.6, ang - 1.5, ang + 1.5); g.closePath(); fillC(CF(look.hairStyle === 'buzz' ? mix(look.hair, look.skin, 0.3) : look.hair)); }
    if (look.hairStyle === 'bun' || look.hairStyle === 'ponytail') disc(h[0] + ax * 3.6, h[1] + ay * 3.6, 1.7, CF(look.hair));
    if (o.state === 'hurt') { g.beginPath(); g.arc(h[0], h[1], 2.9, ang - 1.25, ang + 1.25); strokeC(CF(BANDAGE), 1.6); }
  }
  function person(ctx, x, y, z, look, o) {
    if (!ctx || !look) return; o = o || {};
    const pg = g, pcf = CF; g = ctx; CF = o.grey ? grey : IDC;
    ctx.save(); ctx.translate(x, y); const s = PK * z; ctx.scale(s, s); if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha *= o.alpha;
    try { walker(look, o); } finally { ctx.restore(); g = pg; CF = pcf; }
  }
  // drawn bounds of a walker (any look, pose but 'lie', state, carry, ring) relative to the feet
  function personBox(z) { const s = PK * z; return { x0: -10.6 * s, y0: -26.6 * s, x1: 10.6 * s, y1: 5.4 * s }; }
  const MEDICS = [{ skin: '#c68e6a', hairStyle: 'short', hair: '#3b2a20', jacket: '#f1efe8', acc: 'cap' },
    { skin: '#e0b392', hairStyle: 'bun', hair: '#7a4b2a', jacket: '#f1efe8', acc: 'none' }];
  function stretcher(ctx, x, y, z, o) {
    if (!ctx) return; o = o || {};
    const fi = (((o.facing | 0) % 4) + 4) % 4, gd = GRID[fi], half = 0.46, hz = 8.5 * PK;
    const medics = o.medics && o.medics.length >= 2 ? o.medics : MEDICS, ph = o.phase || 0;
    const A = [-gd[0] * half, -gd[1] * half], B = [gd[0] * half, gd[1] * half];
    const pu = -gd[1] * 0.12, pv = gd[0] * 0.12;
    const items = [[A, medics[0], ph + 0.5], [B, medics[1], ph]].sort((p, q) => (p[0][0] + p[0][1]) - (q[0][0] + q[0][1]));
    const drawMedic = (it) => person(ctx, x + SX(it[0][0], it[0][1]) * z, y + SY(it[0][0], it[0][1], 0) * z, z, it[1], { pose: 'walk', facing: fi, phase: it[2], reduced: o.reduced });
    drawMedic(items[0]);
    withAt(ctx, x, y, z, () => {
      const e0 = [A[0] * 0.78, A[1] * 0.78], e1 = [B[0] * 0.78, B[1] * 0.78];
      quad(e0[0] + pu, e0[1] + pv, hz, e1[0] + pu, e1[1] + pv, hz, e1[0] - pu, e1[1] - pv, hz, e0[0] - pu, e0[1] - pv, hz, '#e9e4d8');
      g.beginPath(); mv(A[0] * 0.92 + pu, A[1] * 0.92 + pv, hz); ln(B[0] * 0.92 + pu, B[1] * 0.92 + pv, hz); mv(A[0] * 0.92 - pu, A[1] * 0.92 - pv, hz); ln(B[0] * 0.92 - pu, B[1] * 0.92 - pv, hz);
      strokeC('#8a5a3c', 1.3 * K);
      if (o.patient) {
        const pg = g, pcf = CF; CF = o.patientGrey ? grey : IDC;
        g.save(); g.translate(0, -hz + 2); g.scale(PK, PK); lying(o.patient, fi, { lift: 0.0001, state: 'hurt' }); g.restore();
        g = pg; CF = pcf;
      }
    });
    drawMedic(items[1]);
  }

  // ------------------------------------------------------------------------------------------------ portraits (8.15)
  function capEll(cx, cy, rx, ry, e, hl) {
    const R = ry + e, a = Math.asin(Math.max(-1, Math.min(1, hl / R)));
    g.beginPath(); g.ellipse(cx, cy, rx + e, R, 0, Math.PI + a, TAU - a); g.closePath();
  }
  function portraitUnit(look, o) {                   // unit circle (r = 1) at (0, 0)
    const P = o.grey ? grey : (c) => c;
    const jk = look.jacket, skin = look.skin, hair = look.hair, st = look.hairStyle, acc = look.acc, ac = accent(jk);
    g.save(); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.clip();
    g.fillStyle = P(mix(jk, '#f3efe6', 0.6)); g.fillRect(-1, -1, 2, 2);
    // ponytail / bob behind the head
    if (st === 'ponytail') { g.save(); g.translate(0.36, 0.14); g.rotate(-0.35); ell(0, 0, 0.11, 0.27, 0, P(hair)); g.restore(); }
    if (st === 'bob') { g.save(); g.beginPath(); g.rect(-1, -1, 2, 1.24); g.clip(); ell(0, -0.04, 0.45, 0.47, 0, P(hair)); g.restore(); }
    // shoulders, the right third darker
    ell(0, 0.95, 0.85, 0.55, 0, P(jk));
    g.save(); g.beginPath(); g.rect(0.3, 0, 1, 2); g.clip(); ell(0, 0.95, 0.85, 0.55, 0, P(shade(jk, -0.22))); g.restore();
    // neck, ears, head
    g.fillStyle = P(shade(skin, -0.1)); g.fillRect(-0.16, 0.15, 0.32, 0.3);
    ell(-0.355, 0.0, 0.07, 0.1, 0, P(shade(skin, -0.05))); ell(0.355, 0.0, 0.07, 0.1, 0, P(shade(skin, -0.12)));
    ell(0, -0.05, 0.36, 0.42, 0, P(skin));
    // hair
    const hc = P(hair);
    if (st === 'buzz') { capEll(0, -0.05, 0.36, 0.42, 0.012, 0.2); fillC(P(mix(hair, skin, 0.3))); }
    else if (st === 'short') { capEll(0, -0.05, 0.36, 0.42, 0.04, 0.12); fillC(hc); g.beginPath(); g.ellipse(-0.12, -0.18, 0.2, 0.07, -0.25, 0, TAU); fillC(hc); }
    else if (st === 'bob') { capEll(0, -0.05, 0.36, 0.42, 0.05, 0.1); fillC(hc); g.beginPath(); rr(-0.43, -0.2, 0.13, 0.42, 0.06); rr(0.3, -0.2, 0.13, 0.42, 0.06); fillC(hc); }
    else if (st === 'bun') { capEll(0, -0.05, 0.36, 0.42, 0.04, 0.12); fillC(hc); disc(0.02, -0.58, 0.16, hc); }
    else if (st === 'ponytail') { capEll(0, -0.05, 0.36, 0.42, 0.04, 0.12); fillC(hc); g.beginPath(); g.ellipse(0.12, -0.2, 0.2, 0.07, 0.3, 0, TAU); fillC(hc); }
    else if (st === 'curls') { capEll(0, -0.05, 0.36, 0.42, 0.05, 0.06); fillC(hc); for (const [a, b, r] of [[-0.29, -0.3, 0.14], [-0.13, -0.44, 0.16], [0.08, -0.46, 0.16], [0.27, -0.33, 0.14], [-0.36, -0.12, 0.1], [0.36, -0.14, 0.1]]) disc(a, b, r, hc); }
    else if (st === 'bald') { g.beginPath(); g.ellipse(-0.1, -0.33, 0.12, 0.05, -0.3, 0, TAU); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill(); }
    // brows, eyes, mouth
    const ink = P('#1d1a1a');
    if (st !== 'bald' || true) { g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.2, -0.13); g.lineTo(-0.08, -0.145); g.moveTo(0.08, -0.145); g.lineTo(0.2, -0.13); strokeC(P(st === 'bald' ? shade(skin, -0.35) : shade(hair, 0.05)), 0.035); }
    disc(-0.14, -0.02, 0.045, ink); disc(0.14, -0.02, 0.045, ink);
    g.beginPath(); g.moveTo(-0.08, 0.17); g.quadraticCurveTo(0, 0.215, 0.08, 0.17); strokeC(P(shade(skin, -0.45)), 0.03); g.lineCap = 'butt';
    // accessory
    const acp = P(ac), acd = P(shade(ac, -0.2));
    if (acc === 'beanie') { capEll(0, -0.08, 0.36, 0.42, 0.06, 0.13); fillC(acp); g.beginPath(); rr(-0.43, -0.25, 0.86, 0.1, 0.05); fillC(acd); }
    else if (acc === 'cap') { capEll(0, -0.08, 0.36, 0.42, 0.05, 0.16); fillC(acp); g.beginPath(); g.ellipse(0.06, -0.24, 0.34, 0.065, 0, 0, TAU); fillC(acd); }
    else if (acc === 'glasses') { g.beginPath(); g.arc(-0.14, -0.02, 0.085, 0, TAU); g.moveTo(0.225, -0.02); g.arc(0.14, -0.02, 0.085, 0, TAU); g.moveTo(-0.055, -0.03); g.lineTo(0.055, -0.03); strokeC(ink, 0.03); }
    else if (acc === 'scarf') { g.beginPath(); rr(-0.3, 0.32, 0.6, 0.15, 0.07); fillC(acp); g.beginPath(); rr(0.08, 0.4, 0.12, 0.28, 0.05); fillC(acd); }
    else if (acc === 'headband') { g.save(); g.beginPath(); g.ellipse(0, -0.05, 0.37, 0.43, 0, 0, TAU); g.clip(); g.fillStyle = acp; g.fillRect(-0.5, -0.29, 1, 0.085); g.restore(); }
    g.restore();
  }
  function portrait(ctx, cx, cy, size, look, o) {
    if (!ctx || !look) return; o = o || {};
    const r = size / 2, pg = g; g = ctx; ctx.save(); ctx.translate(cx, cy); ctx.scale(r, r);
    try { portraitUnit(look, o); } finally { ctx.restore(); g = pg; }
    if (o.ring !== false) { ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, TAU); ctx.strokeStyle = o.grey ? grey(PAL.ink) : PAL.ink; ctx.lineWidth = 2; ctx.stroke(); }
  }
  const PORT = new Map(); let portArea = 0; const PORT_BUDGET = 6e6;
  function lookKey(l) { return [l.skin, l.hairStyle, l.hair, l.jacket, l.acc].join(','); }
  function portraitCanvas(look, size, o) {
    o = o || {}; const dpr = Math.min(3, Math.max(1, (o.dpr || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)) || 1));
    const key = lookKey(look) + '|' + size + '|' + (o.grey ? 1 : 0) + (o.ring === false ? 0 : 1) + '|' + dpr;
    let c = PORT.get(key); if (c) { PORT.delete(key); PORT.set(key, c); return c; }
    c = mkCanvas(size * dpr, size * dpr); if (!c) return null;
    const x = c.getContext('2d'); x.scale(dpr, dpr); portrait(x, size / 2, size / 2, size, look, o);
    if (c.style) { c.style.width = size + 'px'; c.style.height = size + 'px'; }
    portArea += c.width * c.height;
    for (const [k, v] of PORT) { if (portArea <= PORT_BUDGET) break; PORT.delete(k); portArea -= v.width * v.height; }
    PORT.set(key, c); return c;
  }
  const PURL = new Map();
  function portraitURL(look, size, o) {
    o = o || {}; const key = lookKey(look) + '|' + size + '|' + (o.grey ? 1 : 0) + (o.ring === false ? 0 : 1) + '|' + (o.dpr || 0);
    let u = PURL.get(key); if (u) return u;
    const c = portraitCanvas(look, size, o); if (!c || !c.toDataURL) return '';
    u = c.toDataURL('image/png'); if (PURL.size > 160) PURL.delete(PURL.keys().next().value); PURL.set(key, u); return u;
  }

  // ------------------------------------------------------------------------------------------------ overlays
  const TW = new Map();
  function textW(ctx, font, s) { const k = font + '|' + s; let w = TW.get(k); if (w === undefined) { ctx.font = font; w = ctx.measureText(s).width; if (TW.size > 500) TW.clear(); TW.set(k, w); } return w; }
  const BUB = new Map();
  function bubbleSprite(kind, full, dpr) {
    const key = kind + (full ? 'F' : '') + dpr; let s = BUB.get(key); if (s) return s;
    const W = 46, H = 50, c = mkCanvas(W * dpr, H * dpr); if (!c) return null;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    const cx = W / 2, tipY = H - 9;                   // tip of the tail
    x.save(); x.shadowColor = 'rgba(20,30,25,.35)'; x.shadowBlur = 5 * dpr; x.shadowOffsetY = 1.5 * dpr;
    x.fillStyle = full ? PAL.accent : '#ffffff';
    const pg = g; g = x; g.beginPath(); rr(cx - 15, tipY - 32, 30, 26, 13); g.fill();
    g.beginPath(); g.moveTo(cx - 5, tipY - 7); g.lineTo(cx, tipY); g.lineTo(cx + 5, tipY - 7); g.closePath(); g.fill(); g = pg;
    x.restore();
    icon(x, kind, cx, tipY - 19, 19);
    s = { c, W, H, cx, tipY }; BUB.set(key, s); return s;
  }
  function bubble(ctx, x, y, kind, o) {
    o = o || {}; const s = bubbleSprite(kind, !!o.full, Math.min(4, Math.ceil(devScale(ctx) * 2) / 2)); if (!s) return;
    const k = o.scale || 1;
    ctx.save(); if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(s.c, x - s.cx * k, y - s.tipY * k, s.W * k, s.H * k); ctx.restore();
  }
  function bubbleBox(x, y) { return { x: x - 22, y: y - 47, w: 44, h: 44 }; }
  function ring(ctx, x, y, r, frac, color, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = lw || 2.4; ctx.stroke();
    if (frac > 0) { ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, frac)); ctx.strokeStyle = color || PAL.timer; ctx.stroke(); }
  }
  function timerPill(ctx, x, y, text, frac, o) {
    o = o || {}; const font = '700 12.5px ' + COND, tw = textW(ctx, font, text), w = Math.max(52, Math.round(tw + 34)), h = 21;
    const x0 = x - w / 2, y0 = y - h;
    const pg = g; g = ctx; g.beginPath(); rr(x0, y0, w, h, h / 2); fillC('rgba(18,22,28,.88)'); g = pg;
    ring(ctx, x0 + 11, y0 + h / 2, 5.5, frac, o.color || PAL.timer, 2.4);
    ctx.fillStyle = PAL.ink; ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + 20, y0 + h / 2 + 0.5); ctx.textBaseline = 'alphabetic';
    return { x: x0, y: y0, w, h };
  }
  const PILL = { z: ['rgba(18,22,28,.82)', '#c9d6ff', null, 800, 11], plus: ['#ffffff', '#12161c', null, 800, 11.5], down: [PAL.bad, '#ffffff', null, 700, 11.5],
    hurt: ['rgba(18,22,28,.86)', PAL.ink, PAL.bad, 700, 11.5], dark: ['rgba(18,22,28,.86)', PAL.ink, null, 700, 11.5], good: [PAL.good, '#0d1a12', null, 800, 11.5] };
  function pill(ctx, x, y, text, kind) {
    const p = PILL[kind] || PILL.dark, font = p[3] + ' ' + p[4] + 'px ' + COND, tw = textW(ctx, font, text), h = 19, w = Math.max(30, Math.round(tw + 16));
    const x0 = x - w / 2, y0 = y - h, pg = g; g = ctx;
    g.beginPath(); rr(x0, y0, w, h, h / 2); fillC(p[0]);
    if (p[2]) { g.beginPath(); rr(x0 + 0.75, y0 + 0.75, w - 1.5, h - 1.5, h / 2 - 0.75); strokeC(p[2], 1.5); }
    g = pg;
    ctx.fillStyle = p[1]; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y0 + h / 2 + 0.5); ctx.textBaseline = 'alphabetic';
    return { x: x0, y: y0, w, h };
  }
  function label(ctx, x, y, text, o) { o = o || {}; return pill(ctx, x, y, text, o.kind || 'dark'); }
  function puff(ctx, x, y, z, k, w, d) {             // dust puff around a placed footprint, k 0 -> 1
    if (k <= 0 || k >= 1) return; w = w || 2; d = d || 2;
    withAt(ctx, x, y, z, () => {
      g.globalAlpha = 0.55 * (1 - k);
      const pts = [[0, d], [w / 2, d + 0.1], [w, d], [w + 0.1, d / 2], [w, 0], [-0.05, d / 2]];
      for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], r = (5 + 9 * k) * K * (0.8 + 0.1 * (i % 3)); disc(SX(a, b) + (i % 2 ? 6 : -6) * k * K, SY(a, b, 2 + 8 * k), r, '#efe8da'); }
      g.globalAlpha = 1;
    });
  }
  function colors(type) { return (CONFETTI[type] || ['#f3efe6', '#ff7a2f', '#3bd16f']).slice(); }

  // ------------------------------------------------------------------------------------------------ ghost, footprint, select
  function footprintPath(w, d) { g.beginPath(); mv(0, 0, 0); ln(w, 0, 0); ln(w, d, 0); ln(0, d, 0); g.closePath(); }
  function footprint(ctx, x, y, z, w, d, fill, stroke, lw) {
    withAt(ctx, x, y, z, () => { footprintPath(w, d); if (fill) fillC(fill); if (stroke) { g.lineJoin = 'round'; strokeC(stroke, (lw || 2) / z); g.lineJoin = 'miter'; } });
  }
  function select(ctx, x, y, z, w, d) { footprint(ctx, x, y, z, w || 1, d || 1, 'rgba(255,122,47,.18)', PAL.accent, 2); }
  const SCR = new Map();
  function scratchSprite(key, b, rho, fn) {          // small cached bitmap for ghosts of graves and decorations
    let s = SCR.get(key); if (s) return s;
    const cw = Math.ceil((b.x1 - b.x0) * rho) + 2, ch = Math.ceil((b.y1 - b.y0) * rho) + 2, cv = mkCanvas(cw, ch); if (!cv) return null;
    const c = cv.getContext('2d'); c.setTransform(rho, 0, 0, rho, -b.x0 * rho + 1, -b.y0 * rho + 1);
    const pg = g; g = c; try { fn(); } finally { g = pg; }
    s = { cv, ox: b.x0 - 1 / rho, oy: b.y0 - 1 / rho, w: cw / rho, h: ch / rho };
    if (SCR.size > 40) SCR.delete(SCR.keys().next().value); SCR.set(key, s); return s;
  }
  function ghost(ctx, type, lv, x, y, z, valid, o) {
    o = o || {}; const f = FOOT[type] || [1, 1];
    footprint(ctx, x, y, z, f[0], f[1], valid ? 'rgba(59,209,111,.35)' : 'rgba(255,75,47,.35)', valid ? 'rgba(59,209,111,.9)' : 'rgba(255,75,47,.9)', 1.6);
    if (RECIPES[type]) { building(ctx, type, lv, x, y, z, Object.assign({}, o, { alpha: 0.7, shadow: false, smoke: false, travelers: null })); return; }
    const rho = rhoFor(z * devScale(ctx));
    const b = { x0: -48, y0: -80, x1: 48, y1: 40 };
    const s = scratchSprite(type + '|' + rho + '|' + JSON.stringify([o.initial, o.ribbon, o.ageDays >= 7 ? 7 : o.ageDays >= 3 ? 3 : o.ageDays >= 1 ? 1 : 0, o.seed, o.flowerColors, o.size, o.flowers]), b, rho,
      () => (type === 'grave' ? graveBody(Object.assign({}, o, { reduced: true })) : decorBody(type, o)));
    if (!s) return;
    ctx.save(); ctx.globalAlpha *= 0.7; ctx.drawImage(s.cv, x + s.ox * z, y + s.oy * z, s.w * z, s.h * z); ctx.restore();
  }
  function thumb(type, lv, w, h, o) {
    o = o || {}; const dpr = Math.min(3, Math.max(1, o.dpr || (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)));
    const c = mkCanvas(w * dpr, h * dpr); if (!c || !RECIPES[type]) return c;
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    lv = clampLv(type, lv); const b = localBounds(type, lv), pad = o.pad === undefined ? 4 : o.pad;
    const z = Math.min((w - 2 * pad) / (b.x1 - b.x0), (h - 2 * pad) / (b.y1 - b.y0));
    const ax = w / 2 - (b.x0 + b.x1) / 2 * z, ay = h / 2 - (b.y0 + b.y1) / 2 * z;
    building(x, type, lv, ax, ay, z, Object.assign({ cache: false, smoke: false, t: 0, reduced: true }, o));
    if (c.style) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
    return c;
  }
  const THU = new Map();
  function thumbURL(type, lv, w, h, o) {
    const key = type + lv + '|' + w + 'x' + h + '|' + JSON.stringify(o || {}); let u = THU.get(key); if (u) return u;
    const c = thumb(type, lv, w, h, o); u = c && c.toDataURL ? c.toDataURL('image/png') : ''; if (THU.size > 64) THU.delete(THU.keys().next().value); THU.set(key, u); return u;
  }

  // ------------------------------------------------------------------------------------------------ ground, fence, ruins
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const RUIN_CACHE = new Map();
  function ruinCandidates(N) {
    let c = RUIN_CACHE.get(N); if (c) return c;
    const r = mulberry32(0xbe11 + N), out = [];
    for (let cy = 0; cy < N; cy += 3) for (let cx = 0; cx < N; cx += 3) {
      if (r() < 0.2) continue;
      const w = 1.2 + Math.floor(r() * 4) * 0.4, d = 1.2 + Math.floor(r() * 4) * 0.4;
      const gx = cx + 0.2 + r() * Math.max(0, 2.6 - w), gy = cy + 0.2 + r() * Math.max(0, 2.6 - d);
      out.push({ kind: 'ruin', gx: +gx.toFixed(2), gy: +gy.toFixed(2), w, d, h: Math.round(26 + r() * 30), br: Math.floor(r() * 4), seed: Math.floor(r() * 1e9) });
    }
    // two wrecked cars on the road beyond the gate and one in a side street
    out.push({ kind: 'car', gx: N - 2.6, gy: 12.35, w: 1.3, d: 0.65, h: 15, br: 0, seed: 1, road: true });
    out.push({ kind: 'car', gx: 3.1, gy: 5.2, w: 0.65, d: 1.3, h: 15, br: 1, seed: 2 });
    out.push({ kind: 'car', gx: 19.6, gy: 2.4, w: 1.3, d: 0.65, h: 15, br: 2, seed: 3 });
    RUIN_CACHE.set(N, out); return out;
  }
  function worldOf(W) {
    const N = W.size || 24, land = W.land || [8, 8, 16, 16], gate = W.gate || [11, 13];
    return { N, x0: land[0], y0: land[1], x1: land[2], y1: land[3], g0: gate[0], g1: gate[1], plaza: W.plaza || (() => false) };
  }
  function ruinList(W) {
    const w = worldOf(W), m = 1, out = [];
    for (const r of ruinCandidates(w.N)) {
      if (r.gx < 0 || r.gy < 0 || r.gx + r.w > w.N || r.gy + r.d > w.N) continue;
      const inLand = r.gx < w.x1 + m && r.gx + r.w > w.x0 - m && r.gy < w.y1 + m && r.gy + r.d > w.y0 - m;
      if (inLand) continue;
      const onRoad = r.gx + r.w > w.x1 && r.gy < w.g1 + 0.5 && r.gy + r.d > w.g0 - 0.5;
      if (onRoad && !r.road) continue;
      if (r.road && r.gx < w.x1 + 1.5) continue;
      if (W.landmarks && Object.keys(LANDMARKS).some((id) => { const L = LANDMARKS[id]; return r.gx < L.gx + L.w + 0.3 && r.gx + r.w > L.gx - 0.3 && r.gy < L.gy + L.d + 0.3 && r.gy + r.d > L.gy - 0.3; })) continue;
      const front = (r.gx >= w.x1 && r.gy + r.d > w.y0) || (r.gy >= w.y1 && r.gx + r.w > w.x0);
      out.push(Object.assign({ front }, r));
    }
    return out.sort((a, b) => (a.gx + a.w + a.gy + a.d) - (b.gx + b.w + b.gy + b.d));
  }
  function hazeAt(w, sx, sy) {                       // 0..0.72: the haze over a world px point (relative to the grid origin)
    const cx = SX((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2), cy = SY((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, 0) + 14;
    const r0 = (w.x1 - w.x0) * 32 * 0.86, r1 = r0 + 600, dd = Math.hypot(sx - cx, sy - cy);
    return Math.max(0, Math.min(1, (dd - r0) / (r1 - r0))) * 0.72;
  }
  function ruinBody(r, cut, fade) {
    const u = r.gx, v = r.gy, w = r.w, d = r.d, f = fade || 0, H = '#d6dedc';
    const col = (c) => (f > 0 ? mix(c, H, f) : c);
    const cs = [col(PAL.ruinTop), col(PAL.ruinLeft), col(PAL.ruinRight)];
    if (r.kind === 'car') {
      const h = r.h * (cut || 1);
      box(u, v, w, d, 2, Math.max(4, 11 * (cut || 1)), [col('#9c8a7d'), col('#7f6f63'), col('#6a5c52')]);
      if (!cut || cut > 0.6) box(u + w * 0.22, v + d * 0.1, w * 0.55, d * 0.8, 11, h + 2, [col('#a9b4bb'), col('#808b92'), col('#6d777d')]);
      return;
    }
    const h = r.h * (cut || 1);
    box(u, v, w, d, 0, h, cs);
    // roofless: a darker floor inside the wall tops
    const e = 0.09; quad(u + e, v + e, h, u + w - e, v + e, h, u + w - e, v + d - e, h, u + e, v + d - e, h, col('#b9c0c3'));
    if (!cut) {
      const br = r.br;                               // one broken corner: a stub wall and a missing chunk
      if (br === 0 || br === 2) box(u, v, w * 0.45, d * 0.5, h, h + h * 0.35, cs);
      else box(u, v + d * 0.4, w * 0.4, d * 0.6, h, h + h * 0.28, cs);
      tri(u + w * 0.55, v + d, h, u + w, v + d, h, u + w, v + d * 0.45, h, col('#aab1b4'));
      faceL(u + w * 0.62, u + w, v + d, h - 7, h, col('#bcc3c6'));
    }
    const nl = Math.max(1, Math.round(w / 0.55)), nr = Math.max(1, Math.round(d / 0.6)), wh = Math.min(10, h * 0.3);
    if (h > 12) {
      for (let k = 0; k < nl; k++) winL(u, v, w, d, (k + 0.3) / nl, h * 0.38, Math.min(0.16, w / nl * 0.45), wh, col(PAL.ruinWindow));
      for (let k = 0; k < nr; k++) winR(u, v, w, d, (k + 0.3) / nr, h * 0.38, Math.min(0.17, d / nr * 0.45), wh, col('#858c90'));
    }
  }
  // ---- destination landmarks (P1, SPEC 6.1): ruined silhouettes outside the fence, one per destination, in its own
  // direction; greyed while locked, muted when open, full colour with a warm lamp once cleared. All sit in the outer
  // 3-tile band, so they never meet the land (16 x 16 at most) or the road.
  const LANDMARKS = {
    D1: { name: 'Allotments', gx: 0.35, gy: 8.6, w: 2.4, d: 2.8, h: 26 },       // back-left: sheds and bean poles
    D2: { name: 'Car Wash', gx: 20.9, gy: 0.5, w: 2.7, d: 2.0, h: 35 },         // right: a long low canopy, two brush rollers
    D3: { name: 'Night Market', gx: 0.5, gy: 20.9, w: 2.0, d: 2.7, h: 26 },     // left: a row of stall awnings
    D4: { name: 'Rail Yard', gx: 0.3, gy: 0.4, w: 2.8, d: 2.2, h: 22 },         // back: three freight cars
    D5: { name: 'Hospital Hill', gx: 9.4, gy: 0.4, w: 2.6, d: 2.4, h: 74 },     // back-right: a tall block, a roof helipad
    D6: { name: 'Ferry Terminal', gx: 8.6, gy: 21.2, w: 2.8, d: 2.4, h: 36 },   // front-left: a terminal shed, a gangway crane
  };
  let LC = IDC;                                      // colour filter of the landmark being drawn (state and haze)
  const lb = (u, v, w, d, h0, h1, c) => box(u, v, w, d, h0, h1, [LC(c), LC(shade(c, -0.14)), LC(shade(c, -0.28))]);
  function lamp(u, v) {                              // the warm lamp of a cleared landmark
    g.beginPath(); mv(u, v, 0); ln(u, v, 26); strokeC('#3f4851', 1.6 * K);
    const x = SX(u, v), y = SY(u, v, 28);
    g.globalAlpha = 0.28; disc(x, y, 13 * K, PAL.lantern); g.globalAlpha = 0.5; disc(x, y, 6.5 * K, PAL.lantern); g.globalAlpha = 1;
    disc(x, y, 2.6 * K, '#fff3d6');
  }
  const LM_BODY = {
    D1(st) {
      lb(0.2, 0.25, 0.8, 0.7, 0, 16, '#8f6e4c');
      quad(0.12, 0.17, 21, 1.08, 0.17, 21, 1.08, 1.03, 15, 0.12, 1.03, 15, LC('#6f5a44'));
      for (let i = 0; i < 3; i++) { const v = 0.3 + i * 0.85; lb(1.25, v, 0.95, 0.55, 0, 3, '#7a5a3e'); for (let k = 0; k < 2; k++) quad(1.32, v + 0.12 + k * 0.22, 3.2, 2.13, v + 0.12 + k * 0.22, 3.2, 2.13, v + 0.2 + k * 0.22, 3.2, 1.32, v + 0.2 + k * 0.22, 3.2, LC('#6f9a4f')); }
      g.beginPath(); for (let j = 0; j < 2; j++) { const v = 1.45 + j * 0.65; for (const [a, b] of [[0.3, v - 0.12], [0.62, v - 0.12], [0.46, v + 0.16]]) { mv(a, b, 0); ln(0.46, v, 24); } } strokeC(LC('#8a6a3a'), 1.2 * K);
      if (st === 'cleared') lamp(0.12, 2.6);
    },
    D2(st) {
      quad(0.05, 0.1, 0.3, 2.65, 0.1, 0.3, 2.65, 1.9, 0.3, 0.05, 1.9, 0.3, LC('#c2c8ca'));
      // the canopy stands high enough that the two brush rollers at its open front show under it
      g.beginPath(); for (const [a, b] of [[0.15, 0.2], [2.5, 0.2], [0.15, 1.75], [2.5, 1.75]]) { mv(a, b, 0); ln(a, b, 30); } strokeC(LC('#7d8387'), 2 * K);
      box(0.05, 0.1, 2.6, 1.8, 30, 34, [LC('#e3e6e2'), LC('#c9cec9'), LC('#b3b8b3')]);
      faceL(0.05, 2.65, 1.9, 30.5, 33.5, LC('#3f6fb5')); faceR(2.65, 1.9, 0.1, 30.5, 33.5, LC('#2f5690'));
      g.beginPath(); mv(0.7, 1.72, 26); ln(2.0, 1.72, 26); strokeC(LC('#5f6b78'), 1.6 * K);
      cyl(0.95, 1.72, 0.15, 3, 22, [LC('#7fa2d6'), LC('#3f6fb5'), LC('#2f5690')]); cyl(1.75, 1.72, 0.15, 3, 22, [LC('#8fd0d6'), LC('#4fa3c7'), LC('#3a7f9c')]);
      if (st === 'cleared') lamp(2.62, 1.92);
    },
    D3(st) {
      const cols = ['#e5534b', '#d9a441', '#2f8f8f'];
      for (let j = 0; j < 3; j++) {
        const v0 = 0.2 + j * 0.85;
        lb(0.3, v0, 1.2, 0.55, 0, 9, '#9a7350');
        g.beginPath(); mv(0.3, v0 + 0.62, 0); ln(0.3, v0 + 0.62, 19); mv(1.5, v0 + 0.62, 0); ln(1.5, v0 + 0.62, 19); strokeC(LC('#5a3a26'), 1.2 * K);
        for (let k = 0; k < 4; k++) { const a = 0.22 + k * 0.34; quad(a, v0 - 0.05, 24, a + 0.34, v0 - 0.05, 24, a + 0.34, v0 + 0.7, 18, a, v0 + 0.7, 18, LC(k % 2 ? '#f6eedf' : cols[j])); }
      }
      if (st === 'cleared') {
        g.beginPath(); mv(1.62, 0.15, 21); for (let k = 1; k <= 8; k++) ln(1.62, 0.15 + k * 0.3, 21 - (k % 2 ? 2.5 : 0)); strokeC('#5a3a26', 0.8 * K);
        for (let k = 0; k < 4; k++) disc(SX(1.62, 0.45 + k * 0.6), SY(1.62, 0.45 + k * 0.6, 18.3), 1.8 * K, PAL.windowLit);
        lamp(1.85, 2.55);
      }
    },
    D4(st) {
      g.beginPath(); for (const v of [1.08, 1.42]) { mv(0, v, 0.5); ln(2.8, v, 0.5); } for (let k = 0; k <= 11; k++) { mv(0.1 + k * 0.24, 1.0, 0.4); ln(0.1 + k * 0.24, 1.5, 0.4); } strokeC(LC('#6b6f73'), 1.1 * K);
      const cars = ['#9c4a36', '#b8893e', '#3f7672'];
      for (let i = 0; i < 3; i++) {
        const u0 = 0.05 + i * 0.92;
        disc(SX(u0 + 0.18, 1.55), SY(u0 + 0.18, 1.55, 2.5), 2.4 * K, LC('#3a3f45')); disc(SX(u0 + 0.66, 1.55), SY(u0 + 0.66, 1.55, 2.5), 2.4 * K, LC('#3a3f45'));
        lb(u0, 0.95, 0.85, 0.6, 3.5, i === 1 ? 17 : 20, cars[i]);
        faceL(u0 + 0.3, u0 + 0.55, 1.55, 6, 15, LC(shade(cars[i], -0.35)));
      }
      if (st === 'cleared') lamp(2.68, 2.05);
    },
    D5(st) {
      lb(0.3, 0.3, 2.0, 1.8, 0, 72, '#e4e6e2');
      tri(1.55, 2.1, 72, 2.3, 2.1, 72, 2.3, 1.35, 72, LC('#c9cdc9'));          // the broken corner
      faceL(1.7, 2.3, 2.1, 64, 72, LC('#d8dbd7'));
      for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) {
        const lit = st === 'cleared' && r === 1 && k === 2;
        winL(0.3, 0.3, 2.0, 1.8, 0.08 + k * 0.23, 8 + r * 12.5, 0.16, 7, lit ? PAL.windowLit : LC(r === 3 && k === 1 ? '#4a525a' : '#7d8a96'));
        if (k < 3) winR(0.3, 0.3, 2.0, 1.8, 0.1 + k * 0.3, 8 + r * 12.5, 0.17, 7, LC('#6c7884'));
      }
      quad(0.75, 0.65, 72.2, 1.85, 0.65, 72.2, 1.85, 1.75, 72.2, 0.75, 1.75, 72.2, LC('#7d8387'));
      const x = SX(1.3, 1.2), y = SY(1.3, 1.2, 72.4);
      g.beginPath(); g.ellipse(x, y, 13 * K, 6.5 * K, 0, 0, TAU); strokeC(LC('#f3efe6'), 1.4 * K);
      g.fillStyle = LC('#f3efe6'); g.fillRect(x - 4.5 * K, y - 3.4 * K, 1.8 * K, 6.8 * K); g.fillRect(x + 2.7 * K, y - 3.4 * K, 1.8 * K, 6.8 * K); g.fillRect(x - 4.5 * K, y - 0.8 * K, 9 * K, 1.6 * K);
      if (st === 'cleared') lamp(2.42, 2.25);
    },
    D6(st) {
      lb(0.2, 0.3, 1.7, 1.2, 0, 18, '#9fb2c2');
      gableX(0.2, 0.3, 1.7, 1.2, 18, 6, [LC('#c7d2da'), LC('#a8b6c1')], 0.06);
      faceL(0.3, 1.8, 1.5, 9, 13, LC('#5d7286'));
      g.beginPath(); mv(2.1, 0.6, 0); ln(2.35, 0.6, 34); ln(2.6, 0.6, 0); mv(2.35, 0.6, 34); ln(2.35, 2.05, 30); mv(2.35, 1.5, 30); ln(2.35, 1.5, 22); strokeC(LC('#c8a24a'), 2 * K);
      quad(2.22, 1.5, 22, 2.48, 1.5, 22, 2.48, 2.25, 4, 2.22, 2.25, 4, LC('#9aa0a8'));
      if (st === 'cleared') lamp(0.12, 2.2);
    },
  };
  function landmarkList(W) {
    if (!W || !W.landmarks) return [];
    const w = worldOf(W), out = [];
    for (const id of Object.keys(LANDMARKS)) {
      const st = W.landmarks[id]; if (!st) continue;
      const L = LANDMARKS[id], front = (L.gx >= w.x1 && L.gy + L.d > w.y0) || (L.gy >= w.y1 && L.gx + L.w > w.x0);
      out.push({ kind: 'landmark', id, name: L.name, gx: L.gx, gy: L.gy, w: L.w, d: L.d, h: L.h, front, state: st });
    }
    return out;
  }
  function landmarkBody(id, st, fade) {
    const f = fade || 0, H = '#d6dedc';
    const base = st === 'locked' ? (c) => mix(grey(c), '#c9cfd1', 0.35) : st === 'open' ? (c) => mix(c, grey(c), 0.4) : IDC;
    const plc = LC; LC = f > 0 ? (c) => mix(base(c), H, f) : base;
    try { LM_BODY[id](st); } finally { LC = plc; }
  }
  function landmark(ctx, id, x, y, z, state, o) { if (LM_BODY[id]) withAt(ctx, x, y, z, () => landmarkBody(id, state || 'open', (o && o.fade) || 0)); }
  // ruins, cars and landmarks of one layer in depth order, each faded by the haze at its place
  const DEAD = new Map();                            // the layer's items and haze per world layout (front runs every frame)
  function deadCity(W, front) {
    const w = worldOf(W), lm = W.landmarks || {};
    const key = [w.N, w.x0, w.y0, w.x1, w.y1, w.g0, w.g1, lm.D1, lm.D2, lm.D3, lm.D4, lm.D5, lm.D6, W.landmarks ? 1 : 0, front ? 1 : 0].join();
    let items = DEAD.get(key);
    if (!items) {
      items = ruinList(W).filter((r) => r.front === front).concat(landmarkList(W).filter((l) => l.front === front));
      items.sort((a, b) => (a.gx + a.w + a.gy + a.d) - (b.gx + b.w + b.gy + b.d));
      for (const r of items) r.hf = Math.round(hazeAt(w, SX(r.gx + r.w / 2, r.gy + r.d / 2), SY(r.gx + r.w / 2, r.gy + r.d / 2, (r.h || 20) * 0.3)) * 50) / 50;
      if (DEAD.size > 24) DEAD.clear();
      DEAD.set(key, items);
    }
    for (const r of items) {
      if (r.kind === 'landmark') { g.save(); g.translate(SX(r.gx, r.gy), SY(r.gx, r.gy, 0)); landmarkBody(r.id, r.state, r.hf * 0.35); g.restore(); }
      else ruinBody(r, front ? 0.38 : 0, r.hf);
    }
  }
  function cracksOf(N) {
    const r = mulberry32(0xc4ac + N), out = [];
    for (let i = 0; i < N * 2; i++) { const a = r() * N, b = r() * N, l = 0.8 + r() * 1.6, an = r() * TAU; out.push([a, b, a + Math.cos(an) * l, b + Math.sin(an) * l, (r() - 0.5) * 0.6]); }
    return out;
  }
  function groundBounds(W) { const N = (W && W.size) || 24; return { x0: -N * 32 - 4, y0: -96, x1: N * 32 + 4, y1: N * 32 + 16 }; }
  function groundDraw(W) {
    const w = worldOf(W), N = w.N;
    // the world slab edge (a diorama base) and the asphalt checker
    quad(0, N, 0, N, N, 0, N, N, -10, 0, N, -10, '#959c9f'); quad(N, N, 0, N, 0, 0, N, 0, -10, N, N, -10, '#80878b');
    for (const par of [1, 0]) {
      g.beginPath();
      for (let gx = 0; gx < N; gx++) for (let gy = 0; gy < N; gy++) if (((gx + gy) & 1) === par) { mv(gx, gy, 0); ln(gx + 1, gy, 0); ln(gx + 1, gy + 1, 0); ln(gx, gy + 1, 0); g.closePath(); }
      fillC(par ? PAL.asphaltA : PAL.asphaltB);
    }
    g.beginPath();
    for (const [a, b, c2, d, j] of cracksOf(N)) { mv(a, b, 0); ln((a + c2) / 2 + j, (b + d) / 2 - j, 0); ln(c2, d, 0); }
    strokeC(PAL.crack, 1);
    // the road from the gate: kerbs and pale stripes
    const rx0 = Math.ceil(w.x1), gm = (w.g0 + w.g1) / 2;
    if (rx0 < N) {
      quad(w.x1, w.g0, 0, N, w.g0, 0, N, w.g1, 0, w.x1, w.g1, 0, '#a9afb2');
      g.beginPath(); mv(w.x1, w.g0, 0); ln(N, w.g0, 0); mv(w.x1, w.g1, 0); ln(N, w.g1, 0); strokeC('#c4c9cb', 1.5);
      for (let x = w.x1 + 0.6; x + 0.5 <= N; x += 1.1) quad(x, gm - 0.15, 0, x + 0.5, gm - 0.15, 0, x + 0.5, gm + 0.15, 0, x, gm + 0.15, 0, PAL.roadStripe);
    }
    // the haze (world space, centred on the land) over the asphalt: only over what is drawn (source-atop in a
    // transparent cache) and inside the world block, so it never paints a box over the sky when the world is in view
    {
      const cx = SX((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2), cy = SY((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, 0) + 14, r0 = (w.x1 - w.x0) * 32 * 0.86;
      const hz = g.createRadialGradient(cx, cy, r0, cx, cy, r0 + 600); hz.addColorStop(0, 'rgba(214,222,220,0)'); hz.addColorStop(1, 'rgba(214,222,220,.72)');
      g.save(); g.beginPath(); mv(0, 0, 90); ln(N, 0, 90); ln(N, 0, -10); ln(N, N, -10); ln(0, N, -10); ln(0, N, 90); g.closePath(); g.clip();
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = hz; const b = groundBounds(W); g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      g.restore();
    }
    // the ruins and landmarks behind the land, each faded by the haze at its place (landmarks less, so they read)
    deadCity(W, false);
    // the land: a 7 px soil slab, grass checker, plaza, gate paving, grid
    quad(w.x0, w.y1, 0, w.x1, w.y1, 0, w.x1, w.y1, -7, w.x0, w.y1, -7, PAL.soilLeft);
    quad(w.x1, w.y1, 0, w.x1, w.y0, 0, w.x1, w.y0, -7, w.x1, w.y1, -7, PAL.soilRight);
    g.save(); g.beginPath(); mv(w.x0, w.y0, 0); ln(w.x1, w.y0, 0); ln(w.x1, w.y1, 0); ln(w.x0, w.y1, 0); g.closePath(); g.clip();
    const ix0 = Math.floor(w.x0), ix1 = Math.ceil(w.x1), iy0 = Math.floor(w.y0), iy1 = Math.ceil(w.y1), gx1 = Math.floor(w.x1 - 1e-6);
    const isGate = (gx, gy) => gx === gx1 && gy >= w.g0 && gy < w.g1;
    const groups = [[1, 0, PAL.grassA], [0, 0, PAL.grassB], [1, 1, PAL.plazaA], [0, 1, PAL.plazaB]];
    for (const [par, pz, col] of groups) {
      g.beginPath();
      for (let gx = ix0; gx < ix1; gx++) for (let gy = iy0; gy < iy1; gy++) {
        if (((gx + gy) & 1) !== par) continue;
        const paved = w.plaza(gx, gy) || isGate(gx, gy);
        if (!!paved !== !!pz) continue;
        mv(gx, gy, 0); ln(gx + 1, gy, 0); ln(gx + 1, gy + 1, 0); ln(gx, gy + 1, 0); g.closePath();
      }
      fillC(col);
    }
    g.beginPath();
    for (let k = ix0; k <= ix1; k++) { mv(k, w.y0, 0); ln(k, w.y1, 0); }
    for (let k = iy0; k <= iy1; k++) { mv(w.x0, k, 0); ln(w.x1, k, 0); }
    strokeC(PAL.grid, 1 * K);
    g.restore();
    fenceDraw(W, 'back');
  }
  function ground(ctx, ox, oy, z, W) { withAt(ctx, ox, oy, z, () => groundDraw(W || {})); }
  function fenceDraw(W, part) {
    const w = worldOf(W), h = 9, posts = [], step = 0.5;
    const along = (a0, a1, f) => { const n = Math.max(1, Math.round((a1 - a0) / step)); for (let i = 0; i <= n; i++) f(a0 + (a1 - a0) * i / n); };
    g.beginPath();
    if (part === 'back') {
      mv(w.x0, w.y0, 6); ln(w.x1, w.y0, 6); mv(w.x0, w.y0, 6); ln(w.x0, w.y1, 6);
      along(w.x0, w.x1, (x) => posts.push([x, w.y0])); along(w.y0, w.y1, (y) => { if (y > w.y0 + 1e-6) posts.push([w.x0, y]); });
    } else {
      mv(w.x0, w.y1, 6); ln(w.x1, w.y1, 6); mv(w.x1, w.y0, 6); ln(w.x1, w.g0, 6); mv(w.x1, w.g1, 6); ln(w.x1, w.y1, 6);
      along(w.x0, w.x1, (x) => { if (x > w.x0 + 1e-6) posts.push([x, w.y1]); });
      along(w.y0, w.y1, (y) => { if (y > w.y0 + 1e-6 && y < w.y1 - 1e-6 && (y < w.g0 - 1e-6 || y > w.g1 + 1e-6)) posts.push([w.x1, y]); });
    }
    strokeC(PAL.fenceShadow, 1.6 * K);
    g.beginPath(); for (const [x, y] of posts) { mv(x, y, 0); ln(x, y, h); } g.lineCap = 'butt'; strokeC(PAL.fence, 2.2 * K);
    if (part !== 'back') for (const y of [w.g0, w.g1]) box(w.x1 - 0.12, y - 0.12, 0.24, 0.24, 0, 16, [PAL.gatePost, '#e9e1d2', '#d3c9b8']);
  }
  function fence(ctx, ox, oy, z, W, part) { withAt(ctx, ox, oy, z, () => fenceDraw(W || {}, part || 'front')); }
  function ruins(ctx, ox, oy, z, W, part) { withAt(ctx, ox, oy, z, () => deadCity(W || {}, part !== 'back')); }
  let SKY = null, SKYH = 0;
  function sky(ctx, w, h) {
    if (!SKY || SKYH !== h) { SKY = ctx.createLinearGradient(0, 0, 0, h); SKY.addColorStop(0, PAL.skyTop); SKY.addColorStop(1, PAL.skyBot); SKYH = h; }
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, w, h);
  }

  // ------------------------------------------------------------------------------------------------ icons
  // 24 x 24 layers: [path, colour or null (= the mono colour), mono opacity, extra]; extra: { rule: 'evenodd', rot,
  // stroke: width }. ICON_MONO holds one-colour versions where the coloured one relies on a second colour (holes).
  const f2 = (v) => +v.toFixed(2);
  const rt = (x, y, w, h, r) => 'M' + x + ' ' + f2(y + h) + 'V' + f2(y + r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + '-' + r + 'h' + f2(w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'V' + f2(y + h) + 'z';
  const FIST = rt(5.4, 5.8, 2.9, 6.6, 1.45) + rt(8.9, 4.8, 2.9, 7.6, 1.45) + rt(12.4, 4.8, 2.9, 7.6, 1.45) + rt(15.9, 5.6, 2.9, 6.8, 1.45) +
    'M5.4 13h13.4v2.4a3.2 3.2 0 0 1-3.2 3.2H8.6a3.2 3.2 0 0 1-3.2-3.2zM8.2 19.2h8v3h-8z' + rt(2.4, 9.2, 2.4, 6, 1.2);
  const ICON_DEF = {
    brick: [['M2 11h15v8H2z', '#c4553b', 1], ['M2 11l4-4h15l-4 4z', '#e0745a', 0.75], ['M17 11l4-4v8l-4 4z', '#a8452f', 0.55]],
    can: [['M5 6v13.2a7 2.4 0 0 0 14 0V6z', '#c9d2d8', 1], ['M15 6v15.4a7 2.4 0 0 0 4-2.2V6z', '#a9b4bb', 0.7], ['M5 10.5h14v5H5z', '#6fae5a', 0.55], ['M15 10.5h4v5h-4z', '#5b9549', 0.45], ['M5 6a7 2.4 0 1 0 14 0a7 2.4 0 1 0-14 0z', '#eef2f4', 0.8]],
    spark: [['M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z', '#4fd8ff', 1], ['M12 9.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4z', '#ffffff', 0]],
    crane: [['M6.6 21.5V5.4h2.6v16.1z', null, 1], ['M2.5 3.6h19v2.6h-19z', null, 1], ['M2.5 6.2h3.6v3.4H2.5z', null, 1], ['M17.4 6.2h1.1v6.3h-1.1z', null, 1], ['M15.4 12.5h5.1v3.6h-5.1z', null, 1], ['M3.6 20.4h8.6v2.1H3.6z', null, 1]],
    people: [['M9 3.4a3.6 3.6 0 1 0 0 7.2a3.6 3.6 0 1 0 0-7.2z', null, 1], ['M2.2 20.6v-2.4a6.8 6.8 0 0 1 13.6 0v2.4z', null, 1], ['M17.2 5.8a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', null, 1], ['M17 20.6v-2.4a8 8 0 0 0-1.6-4.7a5.6 5.6 0 0 1 7.4 5.3v1.8z', null, 1]],
    tower: [['M5.5 8.6L12 2.4l6.5 6.2z', null, 1], ['M6.8 8.6h2.1v5.6H6.8zM15.1 8.6h2.1v5.6h-2.1z', null, 1], ['M12 9.6c-1.7 0-2.4 1.3-2.4 2.8v1.4h4.8v-1.4c0-1.5-.7-2.8-2.4-2.8z', null, 1], ['M6.2 14.2h11.6v7.6H6.2zM10.6 21.8v-3.6a1.4 1.4 0 0 1 2.8 0v3.6z', null, 1, { rule: 'evenodd' }]],
    flag: [['M4.8 2.5h2.2v19.5H4.8z', null, 1], ['M7 3.4l13 4.4L7 12.2z', null, 1]],
    medkit: [['M8.4 7.2V5.4c0-.9.7-1.6 1.6-1.6h4c.9 0 1.6.7 1.6 1.6v1.8h-2V5.8h-3.2v1.4z', '#f3efe6', 1], ['M3.4 7.2h17.2c1 0 1.8.8 1.8 1.8v10c0 1-.8 1.8-1.8 1.8H3.4c-1 0-1.8-.8-1.8-1.8V9c0-1 .8-1.8 1.8-1.8z', '#f3efe6', 1], ['M10.6 9.8h2.8v2.8h2.8v2.8h-2.8v2.8h-2.8v-2.8H7.8v-2.8h2.8z', '#2f9e8f', 0]],
    pills: [['M14.69 14.69L9.74 19.64A3.8 3.8 0 0 1 4.36 14.26L9.31 9.31z', '#f3efe6', 0.55], ['M9.31 9.31L14.26 4.36A3.8 3.8 0 0 1 19.64 9.74L14.69 14.69z', '#e5534b', 1]],
    bomb: [['M9.5 7.4a7.3 7.3 0 1 0 0.01 0z', '#3a4048', 1], ['M12.6 6.6l2.3-2.3 2.6 2.6-2.3 2.3z', '#5f6b78', 1], ['M8.6 12a1.6 1.6 0 1 0 0 3.2a1.6 1.6 0 1 0 0-3.2z', '#3bd16f', 0], ['M17.6 2l.7 1.6 1.7.2-1.3 1.1.4 1.7-1.5-.9-1.5.9.4-1.7-1.3-1.1 1.7-.2z', '#ffb347', 1], ['M19.2 11.4a5.4 5.4 0 0 1 0 6.4M21.4 9.4a8.6 8.6 0 0 1 0 10.4', '#f3efe6', 1, { stroke: 1.6 }]],
    sprinter: [['M2.6 15.8c2.8 0 4.6-1.1 6-3.7l1.3-2.4 3.4 1.7c1.9 1 4 1.4 6.1 1.4 1.6 0 2.9 1.3 2.9 2.9v2.4H2.6z', null, 1], ['M2.6 19.2h19.8v2H2.6z', null, 1], ['M1.2 8.4h6.4v1.8H1.2zM3 5.2h5.6V7H3z', null, 0.8]],
    brawler: [[FIST, null, 1]],
    marksman: [['M12 3a9 9 0 1 0 .01 0zM12 5.6a6.4 6.4 0 1 1-.01 0z', null, 1, { rule: 'evenodd' }], ['M10.9 1h2.2v7.2h-2.2zM10.9 15.8h2.2V23h-2.2zM1 10.9h7.2v2.2H1zM15.8 10.9H23v2.2h-7.2z', null, 1], ['M12 10.3a1.7 1.7 0 1 0 0 3.4a1.7 1.7 0 1 0 0-3.4z', null, 1]],
    medic: [['M6.2 14.9L14.9 6.2a3.3 3.3 0 0 1 4.7 4.7L10.9 19.6a3.3 3.3 0 0 1-4.7-4.7zM9.3 11.8l2.9 2.9 2.5-2.5-2.9-2.9z', null, 1, { rule: 'evenodd' }]],
    scout: [['M3.6 9.4c0-1.6 1.3-2.9 2.9-2.9h1.6c1.6 0 2.9 1.3 2.9 2.9v8.4a3.7 3.7 0 0 1-7.4 0z', null, 1], ['M13 9.4c0-1.6 1.3-2.9 2.9-2.9h1.6c1.6 0 2.9 1.3 2.9 2.9v8.4a3.7 3.7 0 0 1-7.4 0z', null, 1], ['M9.8 10.4h4.4v4.2H9.8z', null, 1], ['M5 3.6h4.2v2.4H5zM14.8 3.6H19v2.4h-4.2z', null, 1]],
    hammer: [['M10.9 9h2.4v13h-2.4z', null, 1, { rot: 38 }], ['M5 3h10.4l3.6 2.8-3.6 2.8H5z', null, 1, { rot: 38 }]],
    grave: [['M6 21V10a6 6 0 0 1 12 0v11z', null, 1], ['M3.6 20.6h16.8v2H3.6z', null, 1]],
    heart: [['M12 21.2l-1.4-1.3C5.4 15.2 2 12.1 2 8.3 2 5.2 4.4 2.8 7.4 2.8c1.7 0 3.4.8 4.6 2.1 1.2-1.3 2.9-2.1 4.6-2.1 3 0 5.4 2.4 5.4 5.5 0 3.8-3.4 6.9-8.6 11.6z', null, 1]],
    clock: [['M12 2.2a9.8 9.8 0 1 0 .01 0zM12 4.6a7.4 7.4 0 1 1-.01 0z', null, 1, { rule: 'evenodd' }], ['M10.9 6.4h2.2v6.4h-2.2zM10.9 10.8h5.6V13h-5.6z', null, 1]],
    lock: [['M7 10.4V7.6a5 5 0 0 1 10 0v2.8h-2.5V7.6a2.5 2.5 0 0 0-5 0v2.8z', null, 1], ['M4.8 10.4h14.4v11H4.8zM12 13.6a1.8 1.8 0 0 0-1 3.3V19h2v-2.1a1.8 1.8 0 0 0-1-3.3z', null, 1, { rule: 'evenodd' }]],
    flask: [['M8.6 2.4h6.8v2h-1.2v4.5l5.7 9.6c.9 1.6-.2 3.5-2 3.5H6.1c-1.8 0-2.9-1.9-2-3.5l5.7-9.6V4.4H8.6zM8.1 15.2l-1.9 3.3h11.6l-1.9-3.3z', null, 1, { rule: 'evenodd' }]],
    bell: [['M12 2.4a1.5 1.5 0 0 1 1.5 1.5v.7a6 6 0 0 1 4.5 5.8v4.8l2 2.4v1.2H4v-1.2l2-2.4v-4.8a6 6 0 0 1 4.5-5.8v-.7A1.5 1.5 0 0 1 12 2.4z', null, 1], ['M9.8 19.6h4.4a2.2 2.2 0 0 1-4.4 0z', null, 1]],
    sack: [['M9 2.8h6l-1.5 3.6c3.8 1.4 6.5 5.4 6.5 9.5 0 3.4-2 5.7-8 5.7s-8-2.3-8-5.7c0-4.1 2.7-8.1 6.5-9.5z', '#c9a46a', 1], ['M9.2 6.3h5.6v1.8H9.2z', '#9c7b47', 0.6]],
    check: [['M3.6 12.6l2-2 4.4 4.4 8.4-8.4 2 2L10 19z', null, 1]],
    close: [['M5.6 4l6.4 6.4L18.4 4 20 5.6 13.6 12l6.4 6.4-1.6 1.6-6.4-6.4L5.6 20 4 18.4l6.4-6.4L4 5.6z', null, 1]],
    plus: [['M10.7 3.6h2.6v7.1h7.1v2.6h-7.1v7.1h-2.6v-7.1H3.6v-2.6h7.1z', null, 1]],
    back: [['M15.6 3.2L6.8 12l8.8 8.8 1.9-1.9L10.6 12l6.9-6.9z', null, 1]],
    info: [['M12 2.2a9.8 9.8 0 1 0 .01 0zM12 4.6a7.4 7.4 0 1 1-.01 0z', null, 1, { rule: 'evenodd' }], ['M10.8 10.4h2.4v7.4h-2.4zM12 6.2a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z', null, 1]],
    up: [['M12 2.8l7.6 8h-4.8v10.4H9.2V10.8H4.4z', null, 1]],
    move: [['M12 1.6l3.6 3.8h-2.4v5.4h5.4V8.4L22.4 12l-3.8 3.6v-2.4h-5.4v5.4h2.4L12 22.4l-3.6-3.8h2.4v-5.4H5.4v2.4L1.6 12l3.8-3.6v2.4h5.4V5.4H8.4z', null, 1]],
    finish: [['M2.8 5l8.4 7-8.4 7zM12 5l8.4 7L12 19z', null, 1]],
    sound: [['M3 9h4l5-4.2v14.4L7 15H3z', null, 1], ['M15 8.6a4.6 4.6 0 0 1 0 6.8M17.6 6a8.2 8.2 0 0 1 0 12', null, 1, { stroke: 2 }]],
    mute: [['M3 9h4l5-4.2v14.4L7 15H3z', null, 1], ['M15.4 9.2l5.6 5.6M21 9.2l-5.6 5.6', null, 1, { stroke: 2 }]],
    house: [['M12 3l9.2 8.2h-2.6v9.6h-4.8v-5.6H10.2v5.6H5.4v-9.6H2.8z', null, 1]],
    star: [['M12 2.4l2.9 6.2 6.7.8-5 4.6 1.4 6.7-6-3.4-6 3.4 1.4-6.7-5-4.6 6.7-.8z', null, 1]],
  };
  const ICON_MONO = {
    medkit: [['M8.4 7.2V5.4c0-.9.7-1.6 1.6-1.6h4c.9 0 1.6.7 1.6 1.6v1.8h-2V5.8h-3.2v1.4z', null, 1],
      ['M3.4 7.2h17.2c1 0 1.8.8 1.8 1.8v10c0 1-.8 1.8-1.8 1.8H3.4c-1 0-1.8-.8-1.8-1.8V9c0-1 .8-1.8 1.8-1.8zM10.6 9.8v2.8H7.8v2.8h2.8v2.8h2.8v-2.8h2.8v-2.8h-2.8V9.8z', null, 1, { rule: 'evenodd' }]],
  };
  const ICONS = Object.keys(ICON_DEF);
  const P2D = new Map();
  function path2d(d) { let p = P2D.get(d); if (!p && typeof Path2D !== 'undefined') { p = new Path2D(d); P2D.set(d, p); } return p; }
  function icon(ctx, name, x, y, size, o) {
    o = o || {}; const mono = o.color, L = (mono && ICON_MONO[name]) || ICON_DEF[name];
    if (!L || !ctx || typeof Path2D === 'undefined') return;
    const s = size / 24;
    ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(s, s); if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    for (const [d, col, mo, ex] of L) {
      const e = ex || {};
      if (mono && !mo) continue;
      const c = mono ? mono : (col || o.ink || PAL.ink);
      const p = path2d(d); if (!p) continue;
      ctx.save();
      if (e.rot) { ctx.translate(12, 12); ctx.rotate(e.rot * Math.PI / 180); ctx.translate(-12, -12); }
      if (mono && mo < 1) ctx.globalAlpha *= mo;
      if (e.stroke) { ctx.strokeStyle = c; ctx.lineWidth = e.stroke; ctx.lineCap = 'round'; ctx.stroke(p); }
      else { ctx.fillStyle = c; ctx.fill(p, e.rule || 'nonzero'); }
      ctx.restore();
    }
    ctx.restore();
  }
  function iconSVG(name, size, o) {
    o = o || {}; const mono = o.color, L = (mono && ICON_MONO[name]) || ICON_DEF[name]; if (!L) return '';
    const sz = size || 20;
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" aria-hidden="true" focusable="false">';
    for (const [d, col, mo, ex] of L) {
      const e = ex || {};
      if (mono && !mo) continue;
      const c = mono ? mono : (col || o.ink || PAL.ink);
      const op = mono && mo < 1 ? ' opacity="' + mo + '"' : '';
      const tr = e.rot ? ' transform="rotate(' + e.rot + ' 12 12)"' : '';
      if (e.stroke) s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + e.stroke + '" stroke-linecap="round"' + op + tr + '/>';
      else s += '<path d="' + d + '" fill="' + c + '"' + (e.rule ? ' fill-rule="' + e.rule + '"' : '') + op + tr + '/>';
    }
    return s + '</svg>';
  }

  // the iso primitives for the renderer's own shapes (highlights, debug, landmarks): local units at a footprint anchor
  const PRIM = {
    P: (u, v, h) => [SX(u, v), SY(u, v, h || 0)], quad, tri, faceL, faceR, top: topQ, box, band, winL, winR, gableX, gableY, pyramid, cylinder: cyl,
    shadow: shadowPoly, tile: (u, v, w, d, c) => quad(u, v, 0, u + w, v, 0, u + w, v + d, 0, u, v + d, 0, c),
    poly(pts, c) { g.beginPath(); pts.forEach((p, i) => (i ? ln(p[0], p[1], p[2] || 0) : mv(p[0], p[1], p[2] || 0))); g.closePath(); fillC(c); },
    ctx: () => g,
  };
  function iso(ctx, x, y, z, fn) { withAt(ctx, x, y, z, () => fn(PRIM)); }
  function tile(ctx, x, y, z, w, d, c) { withAt(ctx, x, y, z, () => PRIM.tile(0, 0, w, d, c)); }

  // ------------------------------------------------------------------------------------------------ export
  const P = (x, y, z, u, v, h) => [x + (u - v) * 32 * z, y + ((u + v) * 16 - (h || 0)) * z];
  const cache = {
    clear() { SPR.clear(); sprArea = 0; BUB.clear(); PORT.clear(); portArea = 0; PURL.clear(); SCR.clear(); THU.clear(); },
    stats() { return { sprites: SPR.size, spriteMP: +(sprArea / 1e6).toFixed(2), bubbles: BUB.size, portraits: PORT.size, portraitMP: +(portArea / 1e6).toFixed(2) }; },
  };
  return {
    PAL, CSS, C, TYPES, FOOT, MAX_LV, HOUSE_ROOFS, FLOWERS, ICONS, PERSON_SCALE: PK, MOCK_ZOOM: 0.68,
    frame, P, iso, tile, info, silhouette, bounds, building, site, scaffold, crane, thumb, thumbURL, ghost, footprint, select,
    groundBounds, ground, fence, ruins, ruinList, landmarkList, landmark, LANDMARKS, sky, rubble, glint, grave, decor,
    person, stretcher, personBox, facingOf, portrait, portraitCanvas, portraitURL,
    bubble, bubbleBox, timerPill, pill, ring, label, puff, colors, icon, iconSVG,
    shade, mix, grey, rgba, accent, cache,
  };
});
