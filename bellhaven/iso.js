/* Bellhaven isometric renderer, camera and picking (BH.Iso). SPEC 8.1 (renderer, fit view, keep-visible, frame budget,
 * hit-testing, DPR), 8.2 (gestures, the canvas side), 8.5 (placement visuals), 3.1-3.3 (grid, land, placement), 4.12
 * (people in the city), 8.16 (in-world juice) and 8.17 (reduced motion).
 *
 * Reads Engine.view() only (never the state) and draws with BH.Art. No game rules, no storage, no clock reads: the
 * caller passes frame timestamps (the rAF time), pointer events carry a timeStamp, and
 * every random choice (where a walker goes next) comes from a seeded generator. Classic script with the shared UMD
 * header: BH.Iso in the browser after art.js; module.exports in node, where only the pure helpers work (no canvas).
 *
 * ========================================================================================================= USAGE
 *   const iso = BH.Iso.create(canvas, { insets, onTap, onSelect, onCollect, onGhostMove, onMoveStart, ... });
 *   iso.setView(Engine.view(state));        after every act()/tick() that changed something (every frame is fine)
 *   requestAnimationFrame(function loop(now) { iso.frame(now); requestAnimationFrame(loop); });
 *   The canvas is sized by CSS (e.g. position: fixed; inset: 0); iso sets its backing store and touch-action: none.
 *
 * ========================================================================================================= CREATE
 * BH.Iso.create(canvas, opts) -> iso.  opts (all optional):
 *   view            the first Engine.view() (or call setView before the first frame)
 *   insets          { top, bottom, left, right, pad } CSS px, see setInsets (defaults: the 844 / 568 layouts of 8.3)
 *   reducedMotion   true | false | null (null: the system's prefers-reduced-motion)
 *   dpr             a fixed devicePixelRatio (tests); default window.devicePixelRatio, capped at 3
 *   width, height   fixed CSS size (tests); default the canvas's client size, followed by a ResizeObserver
 *   input           false: attach no pointer or wheel listeners (drive it through the methods instead)
 *   landmarks       false: no destination landmarks in the ruins (P1, on by default)
 *   canPlace        (kind, gx, gy, ignoreId) -> { ok, reason }: overrides the view-based placement check
 *   callbacks (also settable later as iso.on.<name> = fn):
 *   onTap(hit, info)           every tap, before the default handling; return false to stop it. hit = pick(x, y);
 *                              info { x, y, pointerType, mode: 'city' | 'ghost' }
 *   onCollect(buildingId, at)  a bubble was tapped (no selection change); at = { x, y } its screen centre (the UI
 *                              runs act({ type: 'collect', id }) and flies the amount from there)
 *   onSelect(target, info)     target { kind: 'building'|'grave'|'decor'|'rubble'|'person', id } or null (empty ground);
 *                              info.again = true when the selection itself was tapped again (open its sheet)
 *   onLandmark(destId)         a landmark in the ruins was tapped (open the run sheet on it)
 *   onLift(target)             hold 250 ms on the selected building, grave or decoration: it lifts (haptic tick
 *                              where supported); nothing else happens unless a drag follows
 *   onMoveStart(target, ghost) the lifted object was dragged: move mode is on (show ✓ DONE and ✕)
 *   onGhostMove(ghost)         the ghost moved or its validity changed: { kind, mode, id, gx, gy, w, d, valid,
 *                              reason, dragging, moved }
 *   onTrip(e)                  { personId, kind: 'out'|'in'|'arrive', phase: 'gate'|'done' } (the runner reached the
 *                              gate / finished)
 *   onCamera(cam)              after any camera change (getCamera() shape)
 *   onHover(hit)               mouse hover target changed (null when none)
 *
 * ========================================================================================================= METHODS
 * View and frame
 *   setView(view)                the latest Engine.view(); diffs it against the previous one for the juice (a new
 *                                building drops 6 px with a dust puff, a level-up stretches to 1.08 with confetti, the
 *                                fence slides out over 0.8 s and new rubble pops up, a new bubble pops in) and for
 *                                people (arrivals walk from the Inn or the gate, a runner walks out of the gate and
 *                                back in, a rested person comes out of the House)
 *   frame(now)                   draw one frame; now = a monotonic ms timestamp (rAF's). Returns the frame stats
 *                                { dt, drawn, bs, groundK, groundRendered }
 *   resize()                     re-read the CSS size and devicePixelRatio (also automatic on ResizeObserver)
 *   setReducedMotion(on | null)  null = follow the system. Reduced: still crane jib, no bob, bounce, confetti or
 *                                bell swing, walkers jump between stops with a 150 ms fade, instant camera moves,
 *                                the fence and grass appear at once
 *   setInteractive(on)           false while a full-screen overlay covers the city (input ignored, hover cleared)
 *   setAdaptiveDpr(on)           false keeps the full backing store whatever the frame times (headless checks: a
 *                                software-rendered DPR-3 page runs near 30 fps and would drop to 2x); gestures
 *                                still drop it. Also opts.adaptiveDpr: false
 *   destroy()                    detach listeners and free the ground cache
 * Camera (8.1)
 *   setInsets({ top, bottom, left, right, pad })  the clear view = the canvas minus the top bar (top = its bottom
 *                                edge: 52 at 844 x 390, 50 at 568 x 320), the bottom bar (bottom = canvas height
 *                                minus the bar's top edge: 68 / 58), a right sheet (right = its width plus margin)
 *                                and left safe area. The selection and the ghost are kept visible after a change.
 *   getCamera() -> { tx, ty, z, vx, vy }   the spec's camera: the ground point (tx, ty) under the clear view's
 *                                centre (vx, vy), zoom z
 *   setCamera({ tx, ty, z }, { ease })      put (tx, ty) under the clear view's centre (clamped to the land + 2)
 *   fit({ ease }) -> z           the fit view (FIT CITY, after the first cards): z = clamp(min((W - 2 pad) / (64 side),
 *                                (H - top - 8) / (32 side + 22 storeys + 100)), 0.35, 1.8), the land's centre at the
 *                                screen's horizontal centre and halfway between top and H - 8
 *   focus(target, { ease, margin, zoomOut }) keep it visible: inside the clear view with a 24 px margin, zooming out
 *                                (not below 0.35) when it does not fit. target: { kind: 'building'|'grave'|'decor'|
 *                                'rubble'|'person', id } | { kind: 'tile', gx, gy, w?, d? } | { kind: 'ghost' } |
 *                                { kind: 'gate' } | { kind: 'land' }. Eases over 200 ms (instant with reduced motion).
 *   panBy(dx, dy) · zoomAt(z, sx, sy) · zoomBy(factor, sx?, sy?)   screen px; zoom 0.35-1.8 around the point
 *   key(e) -> handled            arrows pan, + / = and - / _ zoom (the UI forwards its keydown events)
 * Projection and picking (8.1)
 *   tileToScreen(gx, gy, h?) -> { x, y }     CSS px of a grid point (h = px above the ground at zoom 1)
 *   screenToTile(x, y) -> { gx, gy, fx, fy, inLand }   the tile under a screen point (fx, fy fractional)
 *   pick(x, y) -> hit            front to back (reverse draw order): in placement mode the ghost first; bubbles (44 x
 *                                44) and the pills above a building (that building); then exact shapes: building
 *                                silhouettes, people's drawn bounds + 6 px, the tile diamond extended up for graves /
 *                                rubble / decorations; then those small objects' 44 x 44 minimum boxes (the nearest
 *                                centre wins where two overlap); then a person's 22 px circle (only when nothing else
 *                                is under the point); then landmarks; then the ground tile.
 *                                hit = { kind: 'bubble'|'building'|'grave'|'decor'|'rubble'|'person'|'landmark'|
 *                                'ghost'|'ground', id?, gx?, gy?, inLand?, near? (the circle), x, y }
 *   screenOf(target) -> { x, y, box } | null   where a target is drawn (bubble targets give the bubble's centre)
 *   clearView() -> { x0, y0, x1, y1 }
 * Selection and highlights
 *   select(target | null, { focus, bounce })   orange outline (buildings) or ground diamond (1 x 1 objects) or a thick
 *                                ring (people), a 1.08 bounce, kept visible
 *   selected() -> target | null
 *   pulse(target | null, { ms })   the tutorial spotlight: a pulsing orange ring on a building, bubble ({ kind:
 *                                'bubble', id }), tile spot ({ kind: 'tile', gx, gy, w, d }) or person; static
 *                                with reduced motion; ms default Infinity
 *   ringBell(times, { low })     swing the Tower bell +-12 deg once per ring (0.9 s each, 1.6 s when low); the UI
 *                                plays the sound
 * Placement and move mode (8.5): one ghost at a time; gestures switch to placement mode while it exists
 *   ghostStart({ kind, mode: 'place'|'move', id?, gx?, gy?, lv?, art? }) -> ghost
 *                                kind: a building type, 'grave', 'tree', 'bench' or 'lamp'. mode 'move' moves the
 *                                existing object id (hidden while the ghost shows; kind is then read from the view).
 *                                Without gx / gy the ghost starts on the valid origin nearest the clear view's centre.
 *                                art = extra BH.Art options (roof, initial, ribbon, ageDays, seed ...).
 *   ghostMove(gx, gy) -> ghost   ghost() -> ghost | null   ghostValid(gx, gy) -> { ok, reason }
 *   validAt(kind, gx, gy, ignoreId) -> { ok, reason: 'outside'|'gate'|'occupied'|'bad'|null }   3.3 from the view
 *                                (equals Engine.canPlace; opts.canPlace overrides it)
 *   suggestSpot(kind, nearGx, nearGy, ignoreId) -> { gx, gy } | null   Engine.suggestSpot's rule from the view
 *   Gestures in placement mode: a tap moves the ghost (its footprint centred on the tile); a press on the ghost drags
 *   it at once (a finger holds the footprint's centre 36 px above it, a mouse keeps its grab offset); within 48 px of
 *   the clear view's edge the camera scrolls (up to 600 px/s); pinch and other drags pan and zoom.
 *   ghostEnd({ commit }) -> ghost   leave placement mode. commit: true after act(move) succeeded: the object is drawn
 *                                at the ghost's spot (and settles) until the next setView shows it there. Call
 *                                setView(view) before or after; either order is safe.
 * People (4.12)
 *   walkOut(personId, { follow, onGate, onDone }) -> { gateMs, totalMs }   GO: the runner walks to the gate (1.2 s,
 *                                the camera follows) and out onto the road. Started automatically when a person
 *                                turns 'out' in a view; calling it again is harmless (returns the running trip).
 *   walkIn(personId, { style, onDone }) -> { totalMs }   the runner comes back in through the gate: style 'win' (a
 *                                sack), 'hurt' (a red-edged "Hurt" pill; carried on a stretcher by two medics when
 *                                there is a Clinic, else limping), 'limp', 'stretcher' or 'plain'; default from the
 *                                view (rest/tired -> win, rest/hurt -> hurt). Started automatically when a person
 *                                stops being 'out', unless holdArrivals(true).
 *   holdArrivals(on)             while on (the result card is up), homecomings and new arrivals queue; off plays the queue
 *   gather(on)                   the Tower 10 finale (P1): every walker heads for the plaza and stands facing the Tower
 *                                (12 s stops), and the people resting in a House or the Clinic come out for it; until
 *                                gather(false), when those still resting walk back in
 *   figures() -> [{ id, x, y, kind ('walker'|'trip'|'static'|'hidden'), visible, pose, facing, trip, style, carry,
 *                                limp, pill, alpha }]   where people are drawn (x, y in fractional tiles)
 *   extras() -> [{ kind: 'stretcher', x, y }]   medics carrying an empty stretcher back to the Clinic
 * Debug
 *   stats() -> the last frame()'s stats
 *   debug() -> { cam, camera, W, H, bs, bsMax, perfDrop, gesture, jibs (crane jib angles drawn this frame: constant
 *                                under reduced motion), canvas: { w, h } (backing store px), ground: { k, w, h,
 *                                renders, key }, drawn, reduced, insets, figures, fx, confetti, frames, layout
 *                                (the drawn order as 'kind:id') }
 *   _int                         internals for tests only (parkFig, sit, depthSort, ...); not an API
 *
 * Pure helpers (also in node): BH.Iso.fitZoom({ W, H, side, storeys, pad, top }) -> z,
 *   BH.Iso.project({ tx, ty, z, vx, vy }, gx, gy, h) -> [sx, sy] and BH.Iso.unproject(cam, sx, sy) -> [gx, gy]
 *   (the 8.1 formulas), BH.Iso.Z_MIN / Z_MAX / K_MAX, BH.Iso.groundK(z, bs), BH.Iso.fmtClock(sec) (timer pills).
 *
 * ========================================================================================================= NOTES
 * Rendering (8.1): sky, the ground (ONE offscreen canvas for the 24 x 24 world: asphalt, ruins and landmarks behind
 * the land, the land slab, grass, plaza, back fence and the rubble piles) at k = min(zoom x backing scale, 2.6)
 * device px per world px (at most 4,014 x 2,288 px), drawn scaled by zoom x backing / k; it is re-rendered (the same
 * canvas, so one bitmap) when the land, rubble, plaza or a landmark changes, when a zoom ends and the wanted k is more
 * than 5 % off, and when the backing scale is restored to a higher value (a drop just draws the sharper bitmap
 * smaller). During the 0.8 s fence slide the ground is drawn live. Then the objects in depth order (footprints first:
 * an object wholly behind another along gx or gy draws first; else the front-corner key gx + w + gy + d, ties by
 * gx + w, people x + y + 0.5), the crane jibs, the front fence, people outside the land (the road), the front ruins,
 * then the overlay: bubbles, timer and state pills (clamped 8 px inside the clear view, hidden under a right sheet),
 * confetti, the ghost. Backing store min(devicePixelRatio, 3); 2 while a pan or pinch is active and after a second whose
 * frames averaged over 20 ms; restored after 2 s averaging 18 ms or less (doubling to at most 32 s when it keeps
 * dropping right after a restore, so a device too slow for 3x settles at 2x instead of re-rendering the ground cache
 * every few seconds).
 * The view gives no screen positions for people: iso walks the figures itself (BFS over view.walkable, 0.8 tiles/s,
 * legs of 4-10 tiles: House door -> plaza -> beside a Kiln or Cannery -> a bench or a grave, idling 3-8 s; about 1
 * leg in 10 ends at a grave for 3 s, a housemate's first). Where people are, from PersonView.where: 'walk' walks;
 * 'house' / 'clinic' are inside (the House's "z N" pill, the Clinic's "+N" and red "Emre · 23 h" pills; a Down
 * person with no Clinic gets the red pill on the House); 'bench' sits on a bench (or the plaza); 'gate' lies at the
 * gate with the red pill (the stranger); 'out' is beyond the gate. A figure on a trip finishes it before taking a
 * new state. Idle cranes park on free tiles beside the Tower (iso picks the spot with the same rule as the view's
 * cranes.list[].park); a crane rolls between the park and its site in 0.5 s when a job starts or ends. A homecoming
 * takes its style from PersonView.arrival ('sack' | 'stretcher' | 'limp') when the view gives one; a walker's grave
 * stop prefers a housemate's grave (view.graves[].houseId).
 * Time: frame(now) needs a monotonic timestamp; gestures use the pointer events' timeStamp and one 250 ms timer.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Iso = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const Art = BH.Art || (typeof require === 'function' ? require('./art.js') : null);

  // ------------------------------------------------------------------------------------------------ constants
  const G = 24;                                    // the world is 24 x 24 tiles
  const Z_MIN = 0.35, Z_MAX = 1.8, K_MAX = 2.6;    // zoom range; the ground cache's density cap (8.1, R3)
  const EASE_MS = 200, MARGIN = 24, CLAMP = 8;     // camera ease, keep-visible margin, overlay clamp
  const TAP_MOVE = 10, TAP_MS = 500, TAP_SEL_MS = 250, HOLD_MS = 250;
  const GHOST_LIFT = 36, EDGE = 48, EDGE_SPEED = 600;
  const SLOW_MS = 20, SLOW_FOR = 1000, GOOD_FOR = 2000, GOOD_MS = 18;
  const WALK = 0.8, IDLE_MIN = 3, IDLE_MAX = 8, GRAVE_IDLE = 3, FADE = 0.2, RM_FADE = 0.15;
  const SLIDE_MS = 800, POP_MS = 260, DROP_MS = 200, PUFF_MS = 600, STRETCH_MS = 420, BOUNCE_MS = 260, CONFETTI_MS = 1100;
  const LIFT_PX = 12, BELL_SWING = 0.21;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------------------------------------ pure helpers
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function hashStr(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(sec) {                         // the engine's fmt.clock: m:ss or h:mm:ss, rounded up
    sec = Math.max(0, Math.ceil(sec - 1e-9));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(x) : m + ':' + pad2(x);
  }
  function inPoly(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const inBox = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  // 8.1 fit view
  function fitZoom(o) {
    const pad = o.pad == null ? 12 : o.pad, top = o.top == null ? 52 : o.top;
    return clamp(Math.min((o.W - 2 * pad) / (64 * o.side), (o.H - top - 8) / (32 * o.side + 22 * o.storeys + 100)), Z_MIN, Z_MAX);
  }
  // 8.1 projection with the camera target (tx, ty) under the view centre (vx, vy)
  function project(c, gx, gy, h) { return [c.vx + ((gx - c.tx) - (gy - c.ty)) * 32 * c.z, c.vy + ((gx - c.tx) + (gy - c.ty)) * 16 * c.z - (h || 0) * c.z]; }
  function unproject(c, sx, sy) { const a = (sx - c.vx) / (32 * c.z), b = (sy - c.vy) / (16 * c.z); return [c.tx + (a + b) / 2, c.ty + (b - a) / 2]; }
  const groundK = (z, bs) => Math.min(z * bs, K_MAX);
  const FOOT1 = { grave: 1, tree: 1, bench: 1, lamp: 1, rubble: 1, decor: 1 };
  function footOf(kind) { if (FOOT1[kind]) return [1, 1]; const f = Art && Art.FOOT[kind]; return f ? f.slice() : [2, 2]; }

  // ================================================================================================ create
  function create(canvas, opts) {
    opts = opts || {};
    if (!Art) throw new Error('BH.Art is required before BH.Iso');
    const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined';
    const on = Object.assign({}, opts);            // callbacks live here (iso.on.onTap = fn works)
    const g = canvas.getContext('2d');
    let W = 300, H = 150, bsMax = 1, bs = 1, dprFixed = opts.dpr || null;
    let insets = null, insetsUser = !!opts.insets;
    let reducedPref = opts.reducedMotion === undefined ? null : opts.reducedMotion, reduced = false, mql = null;
    let interactive = true, destroyed = false;
    // camera: (X, Y) = the world px (zoom 1, relative to the grid origin's screen point) under the canvas centre
    const cam = { X: 0, Y: 384, z: 1 };
    let camAnim = null, camTouched = false, zoomSettleAt = 0, zoomDirty = false, followId = null;
    // time
    let now = 0, lastNow = null, tSec = 0, frames = 0, perfDrop = false, adaptive = opts.adaptiveDpr !== false;
    let dropAt = 0, restoredAt = null, goodNeed = GOOD_FOR; const ivTs = [], ivV = [];   // frame intervals (DPR policy)
    // view and derived data
    let view = null, prev = null;
    let walkChanged = false, walk = new Uint8Array(G * G), walkStr = '', occ = new Array(G * G).fill(null), lo = 8, hi = 16, gateTiles = [[15, 11], [15, 12]];
    let plazaSet = new Set(), landmarks = null, landmarkKey = '';
    const bById = new Map(), gById = new Map(), dById = new Map(), rById = new Map(), pById = new Map();
    // ground cache: one canvas, re-rendered in place
    const gc = { cv: null, ctx: null, k: 0, key: '', b: null, w: 0, h: 0, renders: 0 };
    let slide = null, liveGround = false;          // { from: [lo, hi], to: [lo, hi], t0 }; the ground drawn live
    const popping = new Map();                     // rubble id -> t0 (pop-in after an expansion)
    // juice
    const fx = [];                                 // { kind, id, t0, dur, ... }
    const craneSeen = new Map(); let craneReturns = [];   // job id -> { t0, from, x, y }; cranes rolling back
    let bell = null, confetti = [];
    const bubbleSeen = new Map();                  // building id -> t0 of the pop-in
    // selection, hover, pulse, ghost
    let sel = null, hover = null, pulseT = null, ghost = null, lifted = null, placedOverride = null;
    // people
    const figs = new Map();                        // person id -> figure
    let extraFigs = [];                            // stretcher medics returning, ... (no person id)
    let hold = false, gathering = false; const heldTrips = [];
    // layout (rebuilt every frame and on demand for pick)
    let layout = null, viewStamp = 0, camStamp = 0, dirtyStamp = 0;   // dirty: the ghost or the selection changed
    // gestures
    const pointers = new Map(); let gest = null, holdTimer = null, hoverQueued = null;
    let lastStats = { dt: 0, drawn: 0, bs: 1, groundK: 0, groundRendered: false };
    let profClock = null, profLast = null;           // tests only: a clock the harness injects (iso reads none itself)
    const dbg = { noGround: false, nearest: false };  // tests only

    // ---------------------------------------------------------------------------------------------- sizing, DPR
    function readDpr() { return Math.min(3, Math.max(1, dprFixed || (hasDom && window.devicePixelRatio) || 1)); }
    function defaultInsets() {
      const wide = W >= 740, wideBottom = W >= 640;
      return { top: wide ? 52 : 50, bottom: wideBottom ? 68 : 58, left: 0, right: 0, pad: W >= 667 ? 12 : 8 };
    }
    function applyBs(b) {
      bs = b;
      const w = Math.max(1, Math.round(W * bs)), h = Math.max(1, Math.round(H * bs));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    function resize() {
      let w = opts.width, h = opts.height;
      if (!w || !h) {
        const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        w = w || (r && r.width) || canvas.clientWidth || W; h = h || (r && r.height) || canvas.clientHeight || H;
      }
      const changed = Math.abs(w - W) > 0.5 || Math.abs(h - H) > 0.5;
      // keep the ground point under the clear view's centre when the size changes (or refit an untouched camera)
      const keep = view && changed && camTouched ? camTarget() : null;
      W = w; H = h;
      if (!insetsUser) insets = defaultInsets();
      bsMax = readDpr();
      applyBs(perfDrop || gestureActive() ? Math.min(bsMax, 2) : bsMax);
      if (keep) setTarget(keep[0], keep[1], cam.z);
      else if (view && !camTouched) { const c = fitCam(); cam.X = c.X; cam.Y = c.Y; cam.z = c.z; }
      camStamp++;
    }
    function gestureActive() { return !!gest && (gest.mode === 'pan' || gest.mode === 'pinch'); }

    // ---------------------------------------------------------------------------------------------- projection
    function sxOf(wx) { return W / 2 + (wx - cam.X) * cam.z; }
    function syOf(wy) { return H / 2 + (wy - cam.Y) * cam.z; }
    function toScreen(gx, gy, h) { return [W / 2 + ((gx - gy) * 32 - cam.X) * cam.z, H / 2 + ((gx + gy) * 16 - (h || 0) - cam.Y) * cam.z]; }
    function toGround(sx, sy) { const X = cam.X + (sx - W / 2) / cam.z, Y = cam.Y + (sy - H / 2) / cam.z; return [(X / 32 + Y / 16) / 2, (Y / 16 - X / 32) / 2]; }
    function clearView() { const i = insets; return { x0: i.left || 0, y0: i.top, x1: W - (i.right || 0), y1: H - i.bottom }; }
    function cvCentre() { const c = clearView(); return [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2]; }
    function camTarget(c) {                         // the ground point under the clear view's centre
      c = c || cam; const [vx, vy] = cvCentre(), X = c.X + (vx - W / 2) / c.z, Y = c.Y + (vy - H / 2) / c.z;
      return [(X / 32 + Y / 16) / 2, (Y / 16 - X / 32) / 2];
    }
    function camFor(tx, ty, z) {                    // the camera that puts (tx, ty) under the clear view's centre
      const [vx, vy] = cvCentre();
      return { X: (tx - ty) * 32 - (vx - W / 2) / z, Y: (tx + ty) * 16 - (vy - H / 2) / z, z };
    }
    function clampCam(c) {
      const m0 = lo - 2, m1 = hi + 2, [tx, ty] = camTarget(c), cx = clamp(tx, m0, m1), cy = clamp(ty, m0, m1);
      if (cx !== tx || cy !== ty) { c.X += ((cx - cy) - (tx - ty)) * 32; c.Y += ((cx + cy) - (tx + ty)) * 16; }
      c.z = clamp(c.z, Z_MIN, Z_MAX);
      return c;
    }
    function setCam(c, ease) {
      clampCam(c);
      const zoomChange = Math.abs(c.z - cam.z) > 1e-9;
      if (ease && !reduced && (Math.abs(c.X - cam.X) * cam.z > 0.5 || Math.abs(c.Y - cam.Y) * cam.z > 0.5 || zoomChange)) {
        camAnim = { from: { X: cam.X, Y: cam.Y, z: cam.z }, to: { X: c.X, Y: c.Y, z: c.z }, t0: now, dur: EASE_MS };
      } else { camAnim = null; cam.X = c.X; cam.Y = c.Y; cam.z = c.z; camChanged(zoomChange); }
    }
    function camChanged(zoomChange) {
      camStamp++; camTouched = true;
      if (zoomChange) { zoomDirty = true; zoomSettleAt = now + 220; }
      if (on.onCamera) on.onCamera(getCamera());
    }
    function setTarget(tx, ty, z, ease) { setCam(camFor(tx, ty, z == null ? cam.z : z), ease); }
    function getCamera() { const [vx, vy] = cvCentre(), [tx, ty] = camTarget(); return { tx, ty, z: cam.z, vx, vy }; }
    function panBy(dx, dy) { camAnim = null; const c = { X: cam.X - dx / cam.z, Y: cam.Y - dy / cam.z, z: cam.z }; setCam(c, false); }
    function zoomAt(z, sx, sy) {
      camAnim = null; z = clamp(z, Z_MIN, Z_MAX);
      if (sx == null) { const c = cvCentre(); sx = c[0]; sy = c[1]; }
      const X = cam.X + (sx - W / 2) / cam.z, Y = cam.Y + (sy - H / 2) / cam.z;
      setCam({ X: X - (sx - W / 2) / z, Y: Y - (sy - H / 2) / z, z }, false);
    }
    function fitCam() {
      if (!view) return { X: cam.X, Y: cam.Y, z: cam.z };
      const side = view.land.side, storeys = (view.tower && view.tower.storeys) || 1;
      const z = fitZoom({ W, H, side, storeys, pad: insets.pad, top: insets.top });
      const c0 = view.land.lo + side / 2;
      return { X: 0, Y: 32 * c0 - ((insets.top + H - 8) / 2 - H / 2) / z, z };
    }
    function fit(o) { o = o || {}; const c = fitCam(); setCam(c, !!o.ease); return c.z; }
    // keep a world box (zoom-1 world px) inside the clear view with a margin; zoom out when it does not fit
    function keepBox(b, o) {
      o = o || {}; const m = o.margin == null ? MARGIN : o.margin, cv = clearView();
      const A = { x0: cv.x0 + m, y0: cv.y0 + m, x1: cv.x1 - m, y1: cv.y1 - m };
      const base = camAnim ? camAnim.to : cam;
      let z = base.z; const bw = b.x1 - b.x0, bh = b.y1 - b.y0, aw = Math.max(20, A.x1 - A.x0), ah = Math.max(20, A.y1 - A.y0);
      if (o.zoomOut !== false && (bw * z > aw || bh * z > ah)) z = Math.max(Z_MIN, Math.min(z, aw / bw, ah / bh));
      if (o.zoom) z = clamp(o.zoom, Z_MIN, Z_MAX);
      // the camera centre that keeps the screen centre fixed at the new zoom, then the smallest pan
      let X = base.X, Y = base.Y;
      const xHi = b.x0 - (A.x0 - W / 2) / z, xLo = b.x1 - (A.x1 - W / 2) / z, yHi = b.y0 - (A.y0 - H / 2) / z, yLo = b.y1 - (A.y1 - H / 2) / z;
      X = xLo > xHi ? (xLo + xHi) / 2 : clamp(X, xLo, xHi);
      Y = yLo > yHi ? (yLo + yHi) / 2 : clamp(Y, yLo, yHi);
      setCam({ X, Y, z }, o.ease !== false);
    }
    function worldBoxOf(target) {
      if (!target) return null;
      const k = target.kind;
      if (k === 'land') { const P = (x, y, h) => [(x - y) * 32, (x + y) * 16 - (h || 0)]; const a = P(lo, lo, 120), b = P(hi, lo), c = P(hi, hi), d = P(lo, hi); return { x0: d[0], y0: a[1], x1: b[0], y1: c[1] }; }
      if (k === 'gate') return tileBox(hi - 1, 11, 2, 2, 60);
      if (k === 'tile') return tileBox(target.gx, target.gy, target.w || 1, target.d || 1, target.h == null ? 40 : target.h);
      if (k === 'ghost') { if (!ghost) return null; return objBox(ghost.kind, ghost.lv, ghost.gx, ghost.gy); }
      if (k === 'building' || k === 'bubble') { const b = bById.get(target.id); if (!b) return null; const p = placedPos(b); const bx = objBox(b.type, Math.max(1, b.lv), p.gx, p.gy); if (b.bubble && b.bubble.show) bx.y0 -= 60; return bx; }
      if (k === 'grave') { const gr = gById.get(target.id); return gr && gr.gx != null ? objBox('grave', 1, gr.gx, gr.gy) : null; }
      if (k === 'decor') { const d = dById.get(target.id); return d ? objBox(d.type, 1, d.gx, d.gy) : null; }
      if (k === 'rubble') { const r = rById.get(target.id); return r ? objBox('rubble', 1, r.gx, r.gy) : null; }
      if (k === 'person') { const f = figs.get(target.id); if (!f) return null; const X = (f.x - f.y) * 32, Y = (f.x + f.y) * 16, pb = Art.personBox(1); return { x0: X + pb.x0, y0: Y + pb.y0 - 24, x1: X + pb.x1, y1: Y + pb.y1 }; }
      return null;
    }
    function tileBox(gx, gy, w, d, h) { return { x0: (gx - gy - d) * 32, y0: (gx + gy) * 16 - h, x1: (gx + w - gy) * 32, y1: (gx + w + gy + d) * 16 }; }
    function objBox(kind, lv, gx, gy) {
      const X = (gx - gy) * 32, Y = (gx + gy) * 16;
      if (Art.TYPES.indexOf(kind) >= 0) { const b = Art.bounds(kind, lv, X, Y, 1); return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; }
      const inf = Art.info(kind, 1); return { x0: X - 32, y0: Y - inf.top - 6, x1: X + 32, y1: Y + 32 };
    }
    function focus(target, o) {
      o = Object.assign({ ease: true }, o || {});
      const b = worldBoxOf(target); if (!b) return false;
      keepBox(b, o); return true;
    }

    // ---------------------------------------------------------------------------------------------- view intake
    function placedPos(b) { if (placedOverride && placedOverride.id === b.id) return placedOverride; return b; }
    function rebuildGrid() {
      lo = view.land.lo; hi = view.land.hi; gateTiles = view.land.gate.tiles.map((t) => t.slice());
      if (view.walkable !== walkStr) { walkStr = view.walkable; for (let i = 0; i < G * G; i++) walk[i] = walkStr.charCodeAt(i) === 49 ? 1 : 0; walkChanged = true; }
      occ.fill(null);
      const put = (gx, gy, w, d, id) => { for (let y = gy; y < gy + d; y++) for (let x = gx; x < gx + w; x++) if (x >= 0 && y >= 0 && x < G && y < G) occ[y * G + x] = id; };
      for (const b of view.buildings) put(b.gx, b.gy, b.w, b.d, b.id);
      for (const r of view.rubble) put(r.gx, r.gy, 1, 1, r.id);
      for (const d of view.decor) put(d.gx, d.gy, 1, 1, d.id);
      for (const gr of view.graves) if (gr.gx != null) put(gr.gx, gr.gy, 1, 1, gr.id);
      plazaSet = new Set(view.plaza.map((t) => t[1] * G + t[0]));
      if (opts.landmarks !== false && view.dests) {
        const lm = {}; for (const d of view.dests) lm[d.id] = d.open ? (d.cleared ? 'cleared' : 'open') : 'locked';
        landmarks = lm; landmarkKey = view.dests.map((d) => lm[d.id][0]).join('');
      } else { landmarks = null; landmarkKey = ''; }
    }
    function setView(v) {
      if (!v || !v.land) return;
      const old = view; view = v; viewStamp++;
      bById.clear(); for (const b of v.buildings) bById.set(b.id, b);
      gById.clear(); for (const x of v.graves) gById.set(x.id, x);
      dById.clear(); for (const x of v.decor) dById.set(x.id, x);
      rById.clear(); for (const x of v.rubble) rById.set(x.id, x);
      pById.clear(); for (const x of v.people) pById.set(x.id, x);
      rebuildGrid();
      if (!camTouched) { const c = fitCam(); cam.X = c.X; cam.Y = c.Y; cam.z = c.z; camStamp++; }
      if (placedOverride && placedOverride.armed) placedOverride = null;   // the next view after the commit is the truth
      diffView(old, v);
      if (walkChanged) { walkChanged = false; unblockWalkers(); }
      if (ghost) refreshGhost(false);
      if (sel && !targetExists(sel)) sel = null;
    }
    function targetExists(t) {
      if (t.kind === 'building') return bById.has(t.id);
      if (t.kind === 'grave') return gById.has(t.id) && gById.get(t.id).gx != null;
      if (t.kind === 'decor') return dById.has(t.id);
      if (t.kind === 'rubble') return rById.has(t.id);
      if (t.kind === 'person') return figs.has(t.id) && figs.get(t.id).visible;
      return true;
    }
    function snapshot(v) {
      return {
        ring: v.land.ring, lo: v.land.lo, hi: v.land.hi,
        b: new Map(v.buildings.map((b) => [b.id, { lv: b.lv, gx: b.gx, gy: b.gy, show: !!(b.bubble && b.bubble.show), job: b.job ? b.job.id : null }])),
        r: new Set(v.rubble.map((r) => r.id)), g: new Set(v.graves.filter((x) => x.gx != null).map((x) => x.id)),
        d: new Set(v.decor.map((x) => x.id)),
        p: new Map(v.people.map((p) => [p.id, { state: p.state, restKind: p.restKind, where: p.where, houseId: p.houseId }])),
        jobs: new Set(v.jobs.map((j) => j.id)),
      };
    }
    function diffView(old, v) {
      const cur = snapshot(v);
      if (!prev) {                                  // the first view: everyone in place, no juice
        for (const p of v.people) placeInitial(p);
        for (const b of v.buildings) if (b.bubble && b.bubble.show) bubbleSeen.set(b.id, -1e9);
        for (const j of v.jobs) craneSeen.set(j.id, { t0: now, from: null, x: null, y: null });
        prev = cur; return;
      }
      // cranes roll in from the park when a job starts and back when it ends (0.5 s)
      for (const j of v.jobs) if (!prev.jobs.has(j.id)) craneSeen.set(j.id, { t0: now, from: reduced ? null : (parkSpots(1)[0] || null), x: null, y: null });
      for (const id of prev.jobs) if (!cur.jobs.has(id)) { const c = craneSeen.get(id); craneSeen.delete(id); if (c && c.x != null && !reduced) craneReturns.push({ id, x: c.x, y: c.y, t0: now }); }
      // land: the fence slides out, grass flows, the new rubble pops up after
      if (cur.ring > prev.ring || cur.lo < prev.lo) {
        if (!reduced) slide = { from: [prev.lo, prev.hi], to: [cur.lo, cur.hi], t0: now };
        for (const id of cur.r) if (!prev.r.has(id)) popping.set(id, reduced ? -1e9 : now + (reduced ? 0 : SLIDE_MS));
      }
      // buildings: placed (drop + dust), level up (stretch + confetti), bubbles popping in
      for (const b of v.buildings) {
        const pb = prev.b.get(b.id);
        if (!pb) { addFx({ kind: 'drop', id: b.id, dur: DROP_MS, w: b.w, d: b.d }); }
        else if (b.lv > pb.lv) { addFx({ kind: 'stretch', id: b.id, dur: STRETCH_MS, amp: 0.08 }); spawnConfetti(b); }
        const show = !!(b.bubble && b.bubble.show);
        if (show && !(pb && pb.show)) bubbleSeen.set(b.id, now); else if (!show) bubbleSeen.delete(b.id);
      }
      for (const id of prev.r) if (!cur.r.has(id)) { const r = old && old.rubble.find((x) => x.id === id); if (r) addFx({ kind: 'puff', gx: r.gx, gy: r.gy, w: 1, d: 1, dur: 450 }); }
      for (const x of v.graves) if (x.gx != null && !prev.g.has(x.id)) addFx({ kind: 'drop', id: x.id, dur: DROP_MS, w: 1, d: 1 });
      for (const x of v.decor) if (!prev.d.has(x.id)) addFx({ kind: 'drop', id: x.id, dur: DROP_MS, w: 1, d: 1 });
      // people
      for (const p of v.people) {
        const pp = prev.p.get(p.id);
        if (!pp) arrive(p); else if (pp.where !== p.where || pp.state !== p.state || pp.restKind !== p.restKind) transition(p, pp);
        else { const f = figs.get(p.id); if (f) f.look = p.look; }
      }
      for (const [id] of prev.p) if (!pById.has(id)) { const f = figs.get(id); if (f && f.visible) fadeAway(f); else figs.delete(id); }
      // figures that sit or lie somewhere fixed (the stranger at the gate, the plaza bench) follow that spot when the
      // land grows or the plaza changes
      for (const f of figs.values()) {
        if (f.mode !== 'static') continue;
        const p = pById.get(f.id), hs = p ? homeSpot(p) : null;
        if (hs && (Math.abs(hs.x - f.x) > 1e-6 || Math.abs(hs.y - f.y) > 1e-6)) { if (reduced) setPos(f, hs.x, hs.y); else { const dur = FADE / 2; fadeOut(f, () => { setPos(f, hs.x, hs.y); fadeIn(f, dur); }, dur); } }
      }
      prev = cur;
    }
    function addFx(e) { if (reduced) return; e.t0 = now; fx.push(e); }
    function fxOf(id) {                             // the per-object juice right now: { lift, stretch }
      let lift = 0, stretch = 1;
      for (const e of fx) {
        if (e.id !== id) continue;
        const k = clamp((now - e.t0) / e.dur, 0, 1);
        if (e.kind === 'drop') lift += 6 * (1 - k * k);
        else if (e.kind === 'stretch') stretch *= 1 + e.amp * (k < 0.3 ? k / 0.3 : Math.max(0, 1 - (k - 0.3) / 0.7) * Math.cos((k - 0.3) / 0.7 * Math.PI * 0.5));
        else if (e.kind === 'settle') lift += e.from * (1 - easeOut(k));
      }
      return { lift, stretch };
    }
    function spawnConfetti(b) {
      if (reduced) return;
      const cols = Art.colors(b.type), inf = Art.info(b.type, b.lv), rnd = mulberry32(hashStr(b.id + ':' + b.lv));
      const cx = b.gx + b.w / 2, cy = b.gy + b.d / 2;
      for (let i = 0; i < 26; i++) {
        const a = rnd() * TAU, sp = 40 + rnd() * 70;
        confetti.push({ X: (cx - cy) * 32 + Math.cos(a) * 10, Y: (cx + cy) * 16 - inf.top * 0.8, vx: Math.cos(a) * sp, vy: -120 - rnd() * 110, rot: rnd() * TAU, vr: (rnd() - 0.5) * 12,
          col: cols[i % cols.length], t0: now, life: CONFETTI_MS * (0.75 + rnd() * 0.25) });
      }
    }

    // ---------------------------------------------------------------------------------------------- placement validity
    function validAt(kind, gx, gy, ignoreId) {
      if (on.canPlace) return on.canPlace(kind, gx, gy, ignoreId);
      if (!view) return { ok: false, reason: 'bad' };
      const [w, d] = footOf(kind);
      if (!Number.isInteger(gx) || !Number.isInteger(gy)) return { ok: false, reason: 'bad' };
      for (let y = gy; y < gy + d; y++) for (let x = gx; x < gx + w; x++) {
        if (x < lo || y < lo || x >= hi || y >= hi) return { ok: false, reason: 'outside' };
        if (gateTiles.some((t) => t[0] === x && t[1] === y)) return { ok: false, reason: 'gate' };
        const o = occ[y * G + x]; if (o != null && o !== ignoreId) return { ok: false, reason: 'occupied' };
      }
      return { ok: true, reason: null };
    }
    function suggestSpot(kind, nx, ny, ignoreId) {   // Engine.suggestSpot's rule: the valid origin whose centre is nearest
      const [w] = footOf(kind); let best = null, bd = Infinity;
      for (let y = lo; y + w <= hi; y++) for (let x = lo; x + w <= hi; x++) {
        if (!validAt(kind, x, y, ignoreId).ok) continue;
        const dx = x + w / 2 - nx, dy = y + w / 2 - ny, dd = dx * dx + dy * dy;
        if (dd < bd - 1e-9) { bd = dd; best = { gx: x, gy: y }; }
      }
      return best;
    }

    // ---------------------------------------------------------------------------------------------- walking: grid, BFS, stops
    const bfsPrev = new Int16Array(G * G), bfsDist = new Int16Array(G * G), bfsQ = new Int16Array(G * G);
    const walkable = (x, y) => x >= 0 && y >= 0 && x < G && y < G && walk[y * G + x] === 1;
    function bfsFrom(sx, sy) {                      // distances from a tile over walkable tiles (the start may be anything)
      bfsDist.fill(-1); bfsPrev.fill(-1);
      if (sx < 0 || sy < 0 || sx >= G || sy >= G) return;
      let h = 0, t = 0; const s = sy * G + sx; bfsDist[s] = 0; bfsQ[t++] = s;
      while (h < t) {
        const c = bfsQ[h++], cx = c % G, cy = (c - cx) / G;
        for (let k = 0; k < 4; k++) {
          const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (!walkable(nx, ny)) continue; const n = ny * G + nx; if (bfsDist[n] >= 0) continue;
          bfsDist[n] = bfsDist[c] + 1; bfsPrev[n] = c; bfsQ[t++] = n;
        }
      }
    }
    function pathTo(tx, ty) {                       // after bfsFrom: tile centres from the start to (tx, ty), or null
      const t = ty * G + tx; if (tx < 0 || ty < 0 || tx >= G || ty >= G || bfsDist[t] < 0) return null;
      const out = []; for (let c = t; c >= 0; c = bfsPrev[c]) { const x = c % G; out.push([x + 0.5, (c - x) / G + 0.5]); }
      return out.reverse();
    }
    function nearestWalkable(tx, ty) {
      for (let r = 0; r < G; r++) for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
        if (walkable(x, y)) return [x, y];
      }
      return null;
    }
    // { tile: a walkable tile at the door, pt: the door on the footprint edge, step: the tile touches the door's face
    // (walk through the doorway) or not (a grave or a building stands in front of it: fade in and out instead) }
    function doorOf(b) {
      const pos = placedPos(b), inf = Art.info(b.type, Math.max(1, b.lv)), w = b.w, d = b.d, u = inf.door[0], v = inf.door[1];
      const front = v >= d - 1e-6, cands = [];
      if (front) for (let i = 0; i < w; i++) cands.push([pos.gx + i, pos.gy + d, Math.abs(i + 0.5 - u)]);
      else for (let j = 0; j < d; j++) cands.push([pos.gx + w, pos.gy + j, Math.abs(j + 0.5 - v)]);
      cands.sort((a, c) => a[2] - c[2]);
      const hit = cands.find((c) => walkable(c[0], c[1]));
      if (hit) return { tile: [hit[0], hit[1]], pt: [pos.gx + u, pos.gy + v], step: true };
      return { tile: nearestWalkable(cands[0][0], cands[0][1]), pt: [pos.gx + u, pos.gy + v], step: false };
    }
    function buildingOf(type) { return view ? view.buildings.find((b) => b.type === type && b.lv >= 1) : null; }
    function gateTile(i) { const t = gateTiles[i == null ? 1 : i]; return t ? [t[0], t[1]] : [hi - 1, 12]; }
    function tileOf(f) { return [Math.floor(f.x), Math.floor(f.y)]; }
    // the stops of 4.12: House door -> plaza -> beside a Kiln or Cannery -> a bench or a grave
    function stopCandidates(f, cat) {
      const out = [];
      if (cat === 'door') {
        const h = f.houseId ? bById.get(f.houseId) : null;
        if (h) { const d = doorOf(h); if (d.tile) out.push({ tile: d.tile, face: 3 }); }
      } else if (cat === 'plaza') {
        for (const t of view.plaza) if (walkable(t[0], t[1])) out.push({ tile: t });
      } else if (cat === 'work') {
        for (const b of view.buildings) {
          if ((b.type !== 'kiln' && b.type !== 'cannery') || b.lv < 1) continue;
          const p = placedPos(b);
          for (let x = p.gx - 1; x <= p.gx + b.w; x++) for (let y = p.gy - 1; y <= p.gy + b.d; y++) {
            const edge = x === p.gx - 1 || x === p.gx + b.w || y === p.gy - 1 || y === p.gy + b.d, corner = (x === p.gx - 1 || x === p.gx + b.w) && (y === p.gy - 1 || y === p.gy + b.d);
            if (edge && !corner && walkable(x, y)) out.push({ tile: [x, y], face: x === p.gx - 1 ? 0 : x === p.gx + b.w ? 2 : y === p.gy - 1 ? 1 : 3 });
          }
        }
      } else if (cat === 'bench') {
        for (const d of view.decor) if (d.type === 'bench' && walkable(d.gx, d.gy + 1)) out.push({ tile: [d.gx, d.gy + 1], sit: [d.gx + 0.5, d.gy + 0.62], face: 1 });
      } else if (cat === 'grave') {
        const mates = view.graves.filter((x) => x.gx != null && ((f.mates && f.mates.indexOf(x.personId) >= 0) || (x.houseId && x.houseId === f.houseId)));
        const list = mates.length ? mates : view.graves.filter((x) => x.gx != null);
        for (const x of list) { const t = walkable(x.gx, x.gy + 1) ? [x.gx, x.gy + 1] : walkable(x.gx + 1, x.gy) ? [x.gx + 1, x.gy] : null; if (t) out.push({ tile: t, face: t[1] > x.gy ? 3 : 2, grave: true }); }
      }
      return out;
    }
    const LEG = ['door', 'plaza', 'work', 'rest'];
    function nextStop(f, fromTile) {
      const from = fromTile || tileOf(f); bfsFrom(from[0], from[1]);
      if (gathering) {                               // the Tower 10 gathering: everyone to the plaza, facing the Tower
        let pl = stopCandidates(f, 'plaza').filter((c) => bfsDist[c.tile[1] * G + c.tile[0]] >= 0);
        const taken = new Set();                     // one person a tile, so nobody stands hidden inside another
        for (const o of figs.values()) if (o !== f && o.visible) { const t = o.stop && o.stop.tile ? o.stop.tile : tileOf(o); taken.add(t[0] + ',' + t[1]); }
        const free = pl.filter((c) => !taken.has(c.tile[0] + ',' + c.tile[1])); if (free.length) pl = free;
        if (pl.length) { const c = pl[Math.floor(f.rng() * pl.length)], tw = view.tower; return { cat: 'plaza', tile: c.tile, face: tw ? Art.facingOf(tw.gx + 1.5 - c.tile[0] - 0.5, tw.gy + 1.5 - c.tile[1] - 0.5) : 1, gather: true }; }
      }
      let cat = LEG[f.leg % LEG.length]; f.leg++;
      if (f.rng() < 0.1 && view.graves.some((x) => x.gx != null)) cat = 'grave';
      if (cat === 'rest') cat = view.decor.some((d) => d.type === 'bench') && f.rng() < 0.6 ? 'bench' : view.graves.some((x) => x.gx != null) ? 'grave' : 'plaza';
      let cands = stopCandidates(f, cat).filter((c) => bfsDist[c.tile[1] * G + c.tile[0]] >= 0);
      if (!cands.length) cands = stopCandidates(f, 'plaza').filter((c) => bfsDist[c.tile[1] * G + c.tile[0]] >= 0);
      if (!cands.length) {                          // anywhere reachable 4-10 tiles away
        for (let i = 0; i < G * G; i++) if (bfsDist[i] >= 4 && bfsDist[i] <= 10) cands.push({ tile: [i % G, Math.floor(i / G)] });
      }
      const ranged = cands.filter((c) => { const d = bfsDist[c.tile[1] * G + c.tile[0]]; return d >= 4 && d <= 10; });
      const pickFrom = ranged.length ? ranged : cands;
      if (!pickFrom.length) return null;
      const c = pickFrom[Math.floor(f.rng() * pickFrom.length)];
      return Object.assign({ cat }, c);
    }

    // ---------------------------------------------------------------------------------------------- figures
    function newFig(p) {
      const seed = hashStr(p.id + ':' + (p.first || ''));
      return { id: p.id, look: p.look, houseId: p.houseId, mates: [], x: 0, y: 0, facing: 1, phase: 0, path: null, pi: 0, speed: WALK,
        idle: 0, pose: 'stand', state: 'ready', restKind: null, carry: null, limp: false, pill: null, alpha: 1, fadeTo: null,
        visible: true, rng: mulberry32(seed), leg: seed % 4, mode: 'walker', trip: null, stop: null, sitAt: null, hurt: false };
    }
    function matesOf(p) { return view.people.filter((q) => q.houseId && q.houseId === p.houseId && q.id !== p.id).map((q) => q.id).concat(view.remembered ? view.remembered.filter((q) => q.houseId === p.houseId).map((q) => q.id) : []); }
    function setPos(f, x, y) { f.x = x; f.y = y; }
    function fadeIn(f, dur, then) { f.alpha = 0; f.fadeTo = { to: 1, rate: 1 / Math.max(0.01, dur == null ? (reduced ? RM_FADE / 2 : FADE) : dur), then: then || null }; f.visible = true; }
    function fadeOut(f, then, dur) { f.fadeTo = { to: 0, rate: 1 / Math.max(0.01, dur == null ? (reduced ? RM_FADE / 2 : FADE) : dur), then }; }
    function fadeAway(f) { f.path = null; fadeOut(f, () => { f.visible = false; figs.delete(f.id); }); }
    function homeSpot(p) {                          // where a figure stands for a given person view ('walk' -> null)
      if (p.where === 'gate') { const t = gateTile(1); return { x: t[0] + 0.5, y: t[1] + 0.5, pose: 'lie', face: 2 }; }
      if (p.where === 'bench') {
        const bench = view.decor.find((d) => d.type === 'bench');
        if (bench) return { x: bench.gx + 0.5, y: bench.gy + 0.62, pose: 'sit', face: 1 };
        const t = view.plaza.length ? view.plaza[view.plaza.length - 1] : nearestWalkable(lo, lo);
        return t ? { x: t[0] + 0.5, y: t[1] + 0.5, pose: 'sit', face: 1 } : null;
      }
      return null;
    }
    function placeInitial(p) {
      const f = newFig(p); f.houseId = p.houseId; f.mates = matesOf(p); figs.set(p.id, f);
      applyStatic(f, p);
      if (p.where === 'walk') {
        // spread the walkers over the stops, mid-idle
        const cands = [].concat(stopCandidates(f, 'plaza'), stopCandidates(f, 'work'), stopCandidates(f, 'door'));
        const free = cands.filter((c) => !Array.from(figs.values()).some((o) => o !== f && o.visible && Math.floor(o.x) === c.tile[0] && Math.floor(o.y) === c.tile[1]));
        const list = free.length ? free : cands;
        const c = list.length ? list[Math.floor(f.rng() * list.length)] : null;
        const t = c ? c.tile : nearestWalkable(Math.floor((lo + hi) / 2), Math.floor((lo + hi) / 2));
        if (t) setPos(f, t[0] + 0.5 + (f.rng() - 0.5) * 0.3, t[1] + 0.5 + (f.rng() - 0.5) * 0.3);
        f.facing = c && c.face != null ? c.face : Math.floor(f.rng() * 4); f.idle = 0.5 + f.rng() * 4;
      }
    }
    function applyStatic(f, p) {                    // a figure that is not walking: lying stranger, bench sitter, hidden
      f.look = p.look; f.state = p.state; f.restKind = p.restKind; f.houseId = p.houseId;
      f.mode = p.where === 'walk' ? 'walker' : p.where === 'gate' || p.where === 'bench' ? 'static' : 'hidden';
      f.visible = f.mode !== 'hidden'; f.path = null; f.trip = null; f.carry = null; f.limp = false; f.pill = null;
      const hs = homeSpot(p);
      if (hs) { setPos(f, hs.x, hs.y); f.pose = hs.pose; f.facing = hs.face; } else f.pose = 'stand';
      if (p.where === 'gate') f.pill = { kind: 'down', text: p.first + ' · ' + downHours(p.downLeftMs) };
    }
    function downHours(ms) { const h = Math.floor(Math.max(0, ms || 0) / 3600000); return h >= 1 ? h + ' h' : '<1 h'; }
    function arrive(p) {
      const f = newFig(p); f.houseId = p.houseId; f.mates = matesOf(p); figs.set(p.id, f);
      if (p.where === 'gate') { applyStatic(f, p); fadeIn(f); return; }
      if (p.where === 'out') { applyStatic(f, p); return; }
      // a new person walks from the Inn (invited) or the gate to the House
      const inn = buildingOf('inn'), fromInn = (p.arrivedHow === 'inn' || p.arrivedHow === 'traveler') && inn;
      const start = fromInn ? doorOf(inn) : null;
      const trip = { kind: 'arrive', from: fromInn ? { door: start } : { gate: true }, p };
      queueTrip(f, trip);
    }
    function transition(p, pp) {
      let f = figs.get(p.id);
      if (!f) { f = newFig(p); figs.set(p.id, f); applyStatic(f, Object.assign({}, p, { where: pp.where })); }
      f.look = p.look; f.houseId = p.houseId; f.mates = matesOf(p);
      if (p.where === 'out') { if (!f.trip || f.trip.kind !== 'out') startOut(f, p, {}); return; }
      // a homecoming, an arrival or a walk inside is under way: it ends by reading the person's state at that moment
      if (f.trip && (f.trip.kind === 'in' || f.trip.kind === 'arrive' || f.trip.kind === 'enter') && f.mode === 'trip') return;
      // a runner left Down never walks home: inside the Clinic (or the House, with no Clinic yet) with the red pill
      if (pp.where === 'out') { if (p.state === 'down') { applyStatic(f, p); return; } queueTrip(f, { kind: 'in', p, style: null }); return; }
      if (p.where === 'walk' && f.gatherGuest) { f.gatherGuest = false; f.state = 'ready'; f.restKind = null; return; }   // rested during the gathering: already out
      if (p.where === 'walk') {
        if (pp.where === 'gate') { f.mode = 'walker'; f.pose = 'stand'; f.pill = null; f.idle = 0.6; f.state = 'ready'; return; }   // the stranger gets up
        if (pp.where === 'bench') { f.mode = 'walker'; f.pose = 'stand'; f.idle = 0.4; f.state = 'ready'; return; }
        // out of the House or the Clinic: through the door
        const b = pp.where === 'clinic' ? buildingOf('clinic') : (p.houseId ? bById.get(p.houseId) : null);
        emerge(f, p, b); return;
      }
      if (p.where === 'house' || p.where === 'clinic') {
        if (f.visible && f.mode !== 'hidden') { const b = p.where === 'clinic' ? buildingOf('clinic') : bById.get(p.houseId); goInside(f, p, b); }
        else applyStatic(f, p);
        return;
      }
      applyStatic(f, p); if (f.visible) fadeIn(f);
    }
    function emerge(f, p, b) {
      f.mode = 'walker'; f.state = 'ready'; f.restKind = null; f.pose = 'stand'; f.pill = null; f.carry = null; f.limp = false; f.trip = null;
      const d = b ? doorOf(b) : null;
      if (d && d.tile && d.step) { setPos(f, d.pt[0], d.pt[1]); f.path = [[d.tile[0] + 0.5, d.tile[1] + 0.5]]; f.pi = 0; f.speed = WALK; f.idle = 0; }
      else if (d && d.tile) { setPos(f, d.tile[0] + 0.5, d.tile[1] + 0.5); f.path = null; f.idle = 0.6; }
      else { const t = nearestWalkable(Math.floor((lo + hi) / 2), Math.floor((lo + hi) / 2)); if (t) setPos(f, t[0] + 0.5, t[1] + 0.5); }
      fadeIn(f);
      if (reduced) { f.path = null; if (d && d.tile) setPos(f, d.tile[0] + 0.5, d.tile[1] + 0.5); }
    }
    // The Tower 10 gathering (P1, 4.12 "everyone gathers on the plaza"): the walkers head for the plaza, and the people
    // resting in a House or the Clinic come out for it (guests); when it ends the guests still resting walk back in.
    // Down, Out and Fallen people do not come.
    function gather(v) {
      gathering = !!v;
      for (const f of figs.values()) if (f.mode === 'walker' && !f.path) f.idle = Math.min(f.idle, gathering ? 0.2 + f.rng() * 0.8 : f.idle);
      for (const f of figs.values()) {
        const p = pById.get(f.id); if (!p) continue;
        const inside = (p.where === 'house' || p.where === 'clinic') && p.state === 'rest';
        const b = p.where === 'clinic' ? buildingOf('clinic') : p.houseId ? bById.get(p.houseId) : null;
        if (gathering && inside && f.mode === 'hidden' && !f.trip) { emerge(f, p, b); f.gatherGuest = true; f.idle = Math.min(f.idle, 0.3 + f.rng() * 0.6); }
        else if (!gathering && f.gatherGuest) { f.gatherGuest = false; if (inside && f.mode === 'walker' && f.visible) goInside(f, p, b); }
      }
    }
    function goInside(f, p, b) {
      const d = b ? doorOf(b) : null;
      f.mode = 'trip'; f.trip = { kind: 'enter' }; f.pill = null; f.pose = 'stand'; f.seatTile = null;
      f.state = p.state === 'rest' ? 'rest' : p.state === 'down' ? 'hurt' : 'ready'; f.restKind = p.state === 'rest' ? p.restKind : null;
      const settle = () => {
        f.trip = null; const cur = pById.get(f.id); if (!cur) { f.visible = false; figs.delete(f.id); return; }
        if (cur.where !== 'walk') { applyStatic(f, cur); return; }
        if (d && d.tile) setPos(f, d.tile[0] + 0.5, d.tile[1] + 0.5);   // Ready again before getting in: back out on the step
        f.mode = 'walker'; f.state = 'ready'; f.restKind = null; fadeIn(f); f.idle = 0.5;
      };
      if (!d || !d.tile || reduced) { fadeOut(f, settle); return; }
      bfsFrom(Math.floor(f.x), Math.floor(f.y));
      const path = pathTo(d.tile[0], d.tile[1]);
      if (!path) { fadeOut(f, settle); return; }
      f.path = d.step ? path.concat([[d.pt[0], d.pt[1]]]) : path; f.pi = 0; f.speed = WALK * 1.4;
      f.trip.onEnd = () => fadeOut(f, settle);
    }
    function queueTrip(f, trip) {
      if (hold && trip.kind !== 'out') { f.mode = 'hidden'; f.visible = false; heldTrips.push({ f, trip }); return; }
      runTrip(f, trip);
    }
    function runTrip(f, trip) { if (trip.kind === 'in') startIn(f, trip.p, trip); else if (trip.kind === 'arrive') startArrive(f, trip.p, trip); }
    function holdArrivals(onFlag) {
      hold = !!onFlag;
      if (!hold) { const list = heldTrips.splice(0); for (const h of list) if (figs.get(h.f.id) === h.f) runTrip(h.f, h.trip); }
    }
    // GO: to the gate in 1.2 s, then out along the road
    function startOut(f, p, o) {
      o = o || {};
      if (!f.visible || f.mode === 'hidden') {        // from the House or the Clinic door
        const b = f.restKind === 'recovering' ? buildingOf('clinic') : (f.houseId ? bById.get(f.houseId) : null);
        const d = b ? doorOf(b) : null;
        if (d && d.tile) setPos(f, d.tile[0] + 0.5, d.tile[1] + 0.5); else { const t = gateTile(0); setPos(f, t[0] - 1.5, t[1] + 0.5); }
        fadeIn(f, 0.12);
      }
      f.mode = 'trip'; f.pose = 'stand'; f.pill = null; f.state = 'out'; f.carry = null; f.limp = false;
      const gi = Math.abs(f.y - (gateTiles[0][1] + 0.5)) <= Math.abs(f.y - (gateTiles[1][1] + 0.5)) ? 0 : 1, gt = gateTile(gi);
      bfsFrom(Math.floor(f.x), Math.floor(f.y));
      let path = pathTo(gt[0], gt[1]) || [[gt[0] + 0.5, gt[1] + 0.5]];
      path = [[f.x, f.y]].concat(path.slice(1));
      const toGate = pathLen(path);
      const road = [[hi + 0.5, gt[1] + 0.5], [hi + 2.5, gt[1] + 0.5], [hi + 4.2, gt[1] + 0.5]];
      const speed = clamp(toGate / 1.2, WALK, 14), roadSpeed = Math.min(speed, 3), gateMs = Math.round(toGate / speed * 1000);
      f.path = path.concat(road); f.pi = 0; f.speed = speed; f.idle = 0;
      f.trip = { kind: 'out', gateAt: path.length - 1, gateMs, totalMs: gateMs + Math.round(3.7 / roadSpeed * 1000) + 350, roadSpeed, o, gateDone: false };
      if (o.follow !== false) followId = f.id;
      if (reduced) {                                 // jump: fade out here, appear at the gate for a moment, fade away
        f.path = null; const half = RM_FADE / 2;
        f.trip.gateMs = Math.round(half * 2000); f.trip.totalMs = Math.round(half * 4000 + 300);
        fadeOut(f, () => {
          setPos(f, gt[0] + 0.5, gt[1] + 0.5); followNow(f);
          fadeIn(f, half, () => { if (!f.trip) return; f.trip.gateDone = true; tripEvent(f, 'gate');
            f.fadeTo = { to: 1, rate: 1, wait: 0.35, then: () => fadeOut(f, () => { f.visible = false; f.mode = 'hidden'; tripEvent(f, 'done'); f.trip = null; if (followId === f.id) followId = null; }, half) };
          });
        }, half);
      }
      return { gateMs: f.trip.gateMs, totalMs: f.trip.totalMs };
    }
    function pathLen(path) { let s = 0; for (let i = 1; i < path.length; i++) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return s; }
    function tripEvent(f, phase) {
      const tr = f.trip; if (!tr) return;
      if (phase === 'gate' && tr.o && tr.o.onGate) tr.o.onGate();
      if (phase === 'done' && tr.o && tr.o.onDone) tr.o.onDone();
      if (on.onTrip) on.onTrip({ personId: f.id, kind: tr.kind, phase });
    }
    // homecoming: from the road through the gate to the House (or the Clinic), with a sack, a Hurt pill, a limp or a stretcher
    function startIn(f, p, trip) {
      const o = trip.o || {};
      const clinic = buildingOf('clinic');
      let style = trip.style || o.style;
      if (!style && p.arrival) style = p.arrival === 'sack' ? 'win' : p.arrival;   // the engine's own word (view PersonView.arrival)
      if (!style) style = p.state === 'rest' && p.restKind === 'hurt' ? 'hurt' : p.state === 'rest' && p.restKind === 'tired' ? 'win' : 'plain';
      if (style === 'hurt') style = clinic ? 'stretcher' : 'limp';
      const dest = p.where === 'clinic' ? clinic : p.where === 'house' ? (p.houseId ? bById.get(p.houseId) : null) : null;
      const gt = gateTile(1);
      f.mode = 'trip'; f.visible = true; f.state = style === 'limp' || style === 'stretcher' ? 'hurt' : 'ready'; f.restKind = null; f.pose = 'stand';
      f.carry = style === 'win' ? 'sack' : null; f.limp = style === 'limp'; f.hurt = style === 'limp' || style === 'stretcher';
      f.pill = f.hurt ? { kind: 'hurt', text: 'Hurt' } : null;
      setPos(f, hi + 4.2, gt[1] + 0.5);
      const road = [[hi + 2.5, gt[1] + 0.5], [hi + 0.5, gt[1] + 0.5], [gt[0] + 0.5, gt[1] + 0.5]];
      let inside = [];
      bfsFrom(gt[0], gt[1]);
      const d = dest ? doorOf(dest) : null;
      if (d && d.tile) { const pth = pathTo(d.tile[0], d.tile[1]); if (pth) inside = pth.slice(1).concat(d.step ? [[d.pt[0], d.pt[1]]] : []); }
      else if (p.where === 'bench') { const hs = homeSpot(p); if (hs) { const t = nearestWalkable(Math.floor(hs.x), Math.floor(hs.y)); const pth = t ? pathTo(t[0], t[1]) : null; if (pth) inside = pth.slice(1); } }
      else if (p.where === 'walk') { const t = nearestWalkable(gt[0] - 2, gt[1]); const pth = t ? pathTo(t[0], t[1]) : null; if (pth) inside = pth.slice(1); }
      f.path = road.concat(inside); f.pi = 0; f.speed = style === 'limp' ? 0.7 : style === 'stretcher' ? 0.9 : 1.15; f.idle = 0;
      f.trip = { kind: 'in', style, o, gateAt: road.length - 1, stretcher: style === 'stretcher', toWhere: p.where, p };
      f.trip.onEnd = () => endIn(f, p);
      fadeIn(f, 0.25);
      const total = Math.round(pathLen([[f.x, f.y]].concat(f.path)) / f.speed * 1000);
      if (reduced) { const end = f.path[f.path.length - 1]; f.path = null; setPos(f, end[0], end[1]); endIn(f, p); return { totalMs: Math.round(RM_FADE * 1000) }; }
      return { totalMs: total };
    }
    function endIn(f, p) {
      const tr = f.trip;
      if (tr && tr.stretcher) {                      // the medics carry the empty stretcher back to the Clinic
        const clinic = buildingOf('clinic'), d = clinic ? doorOf(clinic) : null;
        if (d && d.tile && !reduced) {
          bfsFrom(Math.floor(f.x), Math.floor(f.y)); const pth = pathTo(d.tile[0], d.tile[1]);
          if (pth) extraFigs.push({ kind: 'stretcher', x: f.x, y: f.y, path: pth.slice(1).concat(d.step ? [[d.pt[0], d.pt[1]]] : []), pi: 0, speed: 1.1, facing: f.facing, phase: 0, alpha: 1, fade: null, done: false });
        }
      }
      tripEvent(f, 'done');
      const cur = pById.get(f.id) || p;
      if (cur.where === 'walk') { f.trip = null; f.mode = 'walker'; f.state = 'ready'; f.carry = null; f.limp = false; f.pill = null; f.hurt = false; f.idle = 1; return; }
      if (cur.where === 'bench') { f.trip = null; applyStatic(f, cur); return; }
      fadeOut(f, () => { f.trip = null; applyStatic(f, cur); }, reduced ? RM_FADE / 2 : 0.18);
    }
    function startArrive(f, p, trip) {
      const from = trip.from || {};
      let start;
      if (from.door && from.door.tile) start = from.door; else { const gt = gateTile(1); start = { tile: gt, pt: [hi + 1.2, gt[1] + 0.5] }; }
      f.mode = 'trip'; f.visible = true; f.state = 'ready'; f.pose = 'stand'; f.carry = 'bag'; f.pill = null; f.limp = false;
      setPos(f, start.pt[0], start.pt[1]);
      bfsFrom(start.tile[0], start.tile[1]);
      const cur = pById.get(p.id) || p;
      const dest = cur.where === 'clinic' ? buildingOf('clinic') : cur.houseId ? bById.get(cur.houseId) : null, d = dest ? doorOf(dest) : null;
      let inside = [[start.tile[0] + 0.5, start.tile[1] + 0.5]];
      if (d && d.tile) { const pth = pathTo(d.tile[0], d.tile[1]); if (pth) inside = pth.concat(cur.where === 'walk' || !d.step ? [] : [[d.pt[0], d.pt[1]]]); }
      f.path = inside; f.pi = 0; f.speed = 1.0; f.idle = 0;
      f.trip = { kind: 'arrive', o: trip.o || {} };
      f.trip.onEnd = () => { tripEvent(f, 'done'); const c2 = pById.get(f.id) || cur; if (c2.where === 'walk') { f.trip = null; f.mode = 'walker'; f.carry = null; f.idle = 1.2; } else fadeOut(f, () => { f.trip = null; applyStatic(f, c2); }); };
      fadeIn(f, 0.3);
      if (reduced) { const end = d && d.tile ? [d.tile[0] + 0.5, d.tile[1] + 0.5] : inside[inside.length - 1]; f.path = null; setPos(f, end[0], end[1]); f.trip.onEnd(); }
    }
    function walkOut(personId, o) {
      const f = figs.get(personId) || (() => { const p = pById.get(personId); if (!p) return null; const nf = newFig(p); figs.set(p.id, nf); applyStatic(nf, Object.assign({}, p, { where: 'walk' })); return nf; })();
      if (!f) return null;
      if (f.trip && f.trip.kind === 'out') { if (o) f.trip.o = Object.assign(f.trip.o || {}, o); return { gateMs: f.trip.gateMs, totalMs: f.trip.totalMs }; }
      const p = pById.get(personId) || { look: f.look };
      return startOut(f, p, o || {});
    }
    function walkIn(personId, o) {
      o = o || {};
      let f = figs.get(personId); const p = pById.get(personId);
      if (!p) return null;
      if (!f) { f = newFig(p); figs.set(p.id, f); }
      for (let i = heldTrips.length - 1; i >= 0; i--) if (heldTrips[i].f.id === personId) heldTrips.splice(i, 1);
      return startIn(f, p, { kind: 'in', style: o.style || null, o });
    }
    // per-frame figure update
    function stepFigs(dt) {
      for (const f of figs.values()) stepFig(f, dt);
      for (const e of extraFigs) stepExtra(e, dt);
      extraFigs = extraFigs.filter((e) => !e.done);
    }
    function moveAlong(f, dt) {
      let dist = f.speed * dt, moved = 0;
      while (dist > 1e-9 && f.path && f.pi < f.path.length) {
        const tx = f.path[f.pi][0], ty = f.path[f.pi][1], dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
        if (d > 1e-6) f.facing = Art.facingOf(dx, dy);
        if (d <= dist) { f.x = tx; f.y = ty; dist -= d; moved += d; f.pi++; if (f.trip && f.trip.gateAt != null && f.pi > f.trip.gateAt && !f.trip.gateDone) { f.trip.gateDone = true; tripEvent(f, 'gate'); if (f.trip.kind === 'out') f.speed = f.trip.roadSpeed; } }
        else { f.x += dx / d * dist; f.y += dy / d * dist; moved += dist; dist = 0; }
      }
      f.phase = (f.phase + moved * 2) % 1;
      return moved;
    }
    function stepFig(f, dt) {
      if (f.fadeTo) {                              // fade toward 0 or 1 (then optionally wait some seconds), then call then()
        const ft = f.fadeTo; f.alpha = clamp(f.alpha + Math.sign(ft.to - f.alpha) * Math.min(Math.abs(ft.to - f.alpha), ft.rate * dt), 0, 1);
        const there = (ft.to >= 1 && f.alpha >= 1) || (ft.to <= 0 && f.alpha <= 0);
        if (there && ft.wait > 0) ft.wait -= dt;
        else if (there) { f.fadeTo = null; if (ft.then) ft.then(); }
      }
      if (!f.visible) return;
      if (f.mode === 'trip') {
        if (f.path && f.pi < f.path.length) {
          moveAlong(f, dt);
          if (f.trip && f.trip.kind === 'out' && f.trip.gateDone && f.pi >= f.path.length - 1 && !f.fadeTo) {
            fadeOut(f, () => { f.visible = false; f.mode = 'hidden'; tripEvent(f, 'done'); f.trip = null; if (followId === f.id) followId = null; }, 0.35);
          }
        } else if (f.trip && f.trip.onEnd) { const cb = f.trip.onEnd; f.trip.onEnd = null; cb(); }
        if (followId === f.id) followNow(f);
        return;
      }
      if (f.mode !== 'walker') return;
      if (!f.path && !f.fadeTo && f.pose !== 'sit') {   // never idle on a blocked tile (a door step, a spot just built on)
        const [bx, by] = tileOf(f);
        if (!walkable(bx, by)) { const t = nearestWalkable(bx, by); if (t) { f.stop = null; jump(f, t[0] + 0.5, t[1] + 0.5); return; } }
      }
      if (f.path && f.pi < f.path.length) {
        // the tile ahead became blocked (a building was placed): fade out and in at the target
        const nx = Math.floor(f.path[f.pi][0]), ny = Math.floor(f.path[f.pi][1]);
        if (!walkable(nx, ny) && !(f.stop && f.stop.sit)) { const last = f.path[f.path.length - 1]; jump(f, last[0], last[1]); return; }
        if (reduced) { const last = f.path[f.path.length - 1]; jump(f, last[0], last[1]); return; }
        moveAlong(f, dt);
        if (f.pi >= f.path.length) arriveStop(f);
        return;
      }
      if (f.fadeTo) return;
      f.idle -= dt;
      if (f.idle > 0) return;
      if (f.pose === 'sit') f.pose = 'stand';
      // a seat on a bench is left through the tile in front of it; anyone on a tile that turned unwalkable (a building
      // placed on it) hops to the nearest free tile
      const seat = f.seatTile && walkable(f.seatTile[0], f.seatTile[1]) ? f.seatTile : null; f.seatTile = null;
      const [cx, cy] = seat || tileOf(f);
      if (!walkable(cx, cy)) { const t = nearestWalkable(cx, cy); if (t) jump(f, t[0] + 0.5, t[1] + 0.5); f.idle = 1; return; }
      const st = nextStop(f, [cx, cy]);
      if (!st) { f.idle = 2 + f.rng() * 3; return; }
      f.stop = st;
      const pth = pathTo(st.tile[0], st.tile[1]);
      if (!pth) { jump(f, st.tile[0] + 0.5, st.tile[1] + 0.5); return; }
      f.path = [[f.x, f.y]].concat(seat ? pth : pth.slice(1)).concat(st.sit ? [st.sit] : []);
      f.pi = 1; f.speed = WALK;
      if (f.path.length <= 1) arriveStop(f);
    }
    // the grid changed (something was placed or moved): a walker on a now-blocked tile hops to the nearest free one at
    // once (fade out and in); a path through a blocked tile is dropped and a new leg is chosen
    function unblockWalkers() {
      for (const f of figs.values()) {
        if (f.mode !== 'walker' || !f.visible || f.fadeTo) continue;
        const [cx, cy] = tileOf(f);
        if (f.pose === 'sit') {                      // on a bench that moved away: stand up where the seat was
          const o = occ[cy * G + cx];
          if (o != null && dById.has(o) && dById.get(o).type === 'bench') continue;
          f.pose = 'stand'; f.seatTile = null;
        }
        if (!walkable(cx, cy)) { const t = nearestWalkable(cx, cy); f.stop = null; if (t) jump(f, t[0] + 0.5, t[1] + 0.5); continue; }
        if (f.path) for (let i = f.pi; i < f.path.length; i++) {
          const px = Math.floor(f.path[i][0]), py = Math.floor(f.path[i][1]);
          if (!walkable(px, py) && !(f.stop && f.stop.sit && i === f.path.length - 1)) { f.path = null; f.stop = null; f.idle = 0.2; break; }
        }
      }
    }
    function jump(f, x, y) {                        // fade out, move, fade in (no path, or reduced motion)
      const dur = reduced ? RM_FADE / 2 : FADE / 2;
      f.path = null; const st = f.stop;
      fadeOut(f, () => { setPos(f, x, y); fadeIn(f, dur); if (st) arriveStop(f); else f.idle = 1; }, dur);
    }
    function arriveStop(f) {
      const st = f.stop; f.path = null;
      f.idle = st && st.grave ? GRAVE_IDLE : IDLE_MIN + f.rng() * (IDLE_MAX - IDLE_MIN);
      if (st && st.face != null) f.facing = st.face;
      if (st && st.sit) { f.pose = 'sit'; setPos(f, st.sit[0], st.sit[1]); f.seatTile = st.tile.slice(); }
      if (st && st.gather) f.idle = 6 + f.rng() * 6;
      f.stop = null;
    }
    function stepExtra(e, dt) {
      if (e.kind === 'stretcher') {
        if (e.pi < e.path.length) moveAlong(e, dt);
        else if (!e.fade) e.fade = 1;
        if (e.fade) { e.alpha -= dt / 0.25; if (e.alpha <= 0) e.done = true; }
      }
    }
    function followNow(f) {                         // the camera follows the runner: keep it inside the clear view
      const [sx, sy] = toScreen(f.x, f.y, 20), cv = clearView(), m = 60;
      let dx = 0, dy = 0;
      if (sx < cv.x0 + m) dx = cv.x0 + m - sx; else if (sx > cv.x1 - m) dx = cv.x1 - m - sx;
      if (sy < cv.y0 + m) dy = cv.y0 + m - sy; else if (sy > cv.y1 - m) dy = cv.y1 - m - sy;
      if (dx || dy) { camAnim = null; const c = { X: cam.X - dx / cam.z, Y: cam.Y - dy / cam.z, z: cam.z }; clampCam(c); cam.X = c.X; cam.Y = c.Y; camChanged(false); }
    }

    // ---------------------------------------------------------------------------------------------- ground cache
    function worldOfNow(animLand) {
      const land = animLand || [lo, lo, hi, hi];
      return { size: G, land, gate: [gateTiles[0][1], gateTiles[1][1] + 1], plaza: (x, y) => plazaSet.has(y * G + x), landmarks };
    }
    function groundKeyNow() {
      const rk = view.rubble.filter((r) => !popping.has(r.id)).map((r) => r.id + '@' + r.gx + ',' + r.gy).join(';');
      return view.land.groundKey + '|' + rk + '|' + landmarkKey;
    }
    function renderGround(k) {
      if (!hasDom && typeof OffscreenCanvas === 'undefined') return;
      const world = worldOfNow(), b = Art.groundBounds(world);
      if (!gc.cv) { gc.cv = hasDom ? document.createElement('canvas') : new OffscreenCanvas(1, 1); gc.ctx = null; }
      const w = Math.ceil((b.x1 - b.x0) * k), h = Math.ceil((b.y1 - b.y0) * k);
      gc.cv.width = w; gc.cv.height = h;               // replaces the old bitmap: only one is ever alive
      const c = gc.ctx || (gc.ctx = gc.cv.getContext('2d'));
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
      c.setTransform(k, 0, 0, k, -b.x0 * k, -b.y0 * k);
      Art.ground(c, 0, 0, 1, world);
      // the rubble piles (the glinting star is drawn live on top)
      const rs = view.rubble.filter((r) => !popping.has(r.id)).sort((a, b2) => (a.gx + a.gy) - (b2.gx + b2.gy));
      for (const r of rs) Art.rubble(c, (r.gx - r.gy) * 32, (r.gx + r.gy) * 16, 1, { glint: r.glint, star: false });
      gc.k = k; gc.b = b; gc.w = w; gc.h = h; gc.key = groundKeyNow(); gc.renders++;
    }
    function groundWanted() { return groundK(cam.z, bs); }
    function maybeRenderGround(force) {
      if (!view) return false;
      const key = groundKeyNow(), kw = groundWanted();
      if (!gc.cv || gc.key !== key || force) { renderGround(kw); return true; }
      return false;
    }
    function zoomEnded() {                          // a pinch, wheel or eased zoom settled: re-render when k is > 5 % off
      if (!gc.cv || !view) return false;
      const kw = groundWanted();
      if (Math.abs(kw / gc.k - 1) > 0.05) { renderGround(kw); return true; }
      return false;
    }
    function drawGroundCache() {
      const b = gc.b, k = gc.k, ox = sxOf(0), oy = syOf(0);
      // the destination rect of the whole bitmap, then only its visible part
      const dx0 = ox + b.x0 * cam.z, dy0 = oy + b.y0 * cam.z, s = cam.z / k;
      const vx0 = Math.max(0, dx0), vy0 = Math.max(0, dy0), vx1 = Math.min(W, dx0 + gc.w * s), vy1 = Math.min(H, dy0 + gc.h * s);
      if (vx1 <= vx0 || vy1 <= vy0) return;
      const sx0 = (vx0 - dx0) / s, sy0 = (vy0 - dy0) / s, sw = (vx1 - vx0) / s, sh = (vy1 - vy0) / s;
      if (dbg.noGround) return;
      const up = s * bs > 1.001;                   // the bitmap is upscaled (zoom x backing above 2.6)
      if (up && dbg.nearest) g.imageSmoothingEnabled = false;
      g.drawImage(gc.cv, sx0, sy0, Math.min(sw, gc.w - sx0), Math.min(sh, gc.h - sy0), vx0, vy0, vx1 - vx0, vy1 - vy0);
      if (up && dbg.nearest) g.imageSmoothingEnabled = true;
    }

    // ---------------------------------------------------------------------------------------------- layout (drawables)
    // a drawable: { kind, id, key, k2, x0, y0, x1, y1 (grid footprint), sb: [sx0, sy0, sx1, sy1] (screen), out (outside
    // the land: drawn after the front fence), draw(), hit: { poly } | { box } | null, hitKind }
    function slideLand() {
      if (!slide) return null;
      const k = clamp((now - slide.t0) / SLIDE_MS, 0, 1), e = easeOut(k);
      if (k >= 1) return null;
      const a = lerp(slide.from[0], slide.to[0], e), b = lerp(slide.from[1], slide.to[1], e);
      return [a, a, b, b];
    }
    function buildLayout() {
      const L = { list: [], overlays: [], hits: [], ghostHit: null, personCircles: [] };
      if (!view) return L;
      const z = cam.z, inLandFig = (f) => f.x < hi && f.y < hi;
      const add = (d) => { L.list.push(d); return d; };
      const sbOf = (x0, y0, x1, y1) => [x0, y0, x1, y1];
      const movingId = ghost && ghost.mode === 'move' ? ghost.id : null;
      // buildings
      for (const b of view.buildings) {
        if (b.id === movingId) continue;
        const pos = placedPos(b), [x, y] = toScreen(pos.gx, pos.gy, 0), lv = Math.max(1, b.lv), ef = fxOf(b.id);
        const isSel = sel && sel.kind === 'building' && sel.id === b.id, isHover = !isSel && hover && hover.kind === 'building' && hover.id === b.id;
        const liftNow = (lifted && lifted.kind === 'building' && lifted.id === b.id ? lifted.amount : 0) + ef.lift;
        const bd = Art.bounds(b.type, lv, x, y - liftNow, z);
        const o = { selected: isSel, hover: isHover, lift: liftNow, stretch: ef.stretch * (isSel ? selBounce() : 1) };
        if (b.house) { o.roof = b.house.idx % 3; o.lit = b.house.lit; o.lantern = b.house.lantern; }
        if (b.type === 'tower') o.bell = bellAngle();
        if (b.type === 'inn' && view.inn && view.inn.travelers) o.travelers = view.inn.travelers.slice(0, 3).map((t) => t.look);
        const job = b.job, site = b.lv < 1;
        const d = add({ kind: 'building', id: b.id, key: pos.gx + b.w + pos.gy + b.d, k2: pos.gx + b.w, x0: pos.gx, y0: pos.gy, x1: pos.gx + b.w, y1: pos.gy + b.d, sb: sbOf(bd.x0, bd.y0, bd.x1, bd.y1),
          draw: () => {
            if (site) {
              Art.site(g, b.type, x, y - liftNow, z, job ? job.progress : 0, {});
              if (isSel || isHover) Art.footprint(g, x, y, z, b.w, b.d, isSel ? 'rgba(255,122,47,.16)' : null, isSel ? Art.PAL.accent : 'rgba(255,255,255,.8)', 2);
            } else {
              Art.building(g, b.type, lv, x, y, z, o);
              if (job) Art.scaffold(g, x, y - liftNow, z, b.w, b.d, Art.info(b.type, lv).h + 16);
            }
          },
          hit: { poly: Art.silhouette(b.type, lv, x, y - liftNow, z) } });
        d.b = b;
      }
      // cranes: busy masts at the sites (the jib is drawn after every object), idle ones folded beside the Tower
      L.jibs = [];
      const busy = view.jobs.length, total = view.cranes ? view.cranes.total : 1;
      for (const j of view.jobs) {
        let ax, ay, mast;
        if (j.buildingId) {
          const b = bById.get(j.buildingId); if (!b) continue;
          const pos = movingId === b.id && ghost ? ghost : placedPos(b), inf = Art.info(b.type, Math.max(1, b.lv));
          ax = pos.gx + inf.crane[0]; ay = pos.gy + inf.crane[1]; mast = (b.lv < 1 ? Art.info(b.type, 1).top * 0.85 : inf.top) + 24;
        } else { ax = hi - 0.75; ay = gateTiles[0][1] + 0.15; mast = 64; }   // the expansion crane at the gate
        const roll = craneRoll(j.id, ax, ay);
        const cx = roll ? roll.x : ax, cy = roll ? roll.y : ay, folded = !!roll;
        const jib = reduced ? -0.35 : -0.35 + (hashStr(j.id) % 628) / 100 + 0.15 * tSec;
        const [x, y] = toScreen(cx, cy, 0);
        add({ kind: 'crane', id: j.id, key: cx + cy + 0.24, k2: cx, x0: cx - 0.12, y0: cy - 0.12, x1: cx + 0.12, y1: cy + 0.12, sb: sbOf(x - 40, y - (mast + 30) * z, x + 40, y + 10),
          draw: () => Art.crane(g, x, y, z, folded ? { folded: true } : { mast, jib, part: 'mast' }) });
        if (!folded) { L.jibs.push(() => Art.crane(g, x, y, z, { mast, jib, part: 'jib' })); (L.jibAngles = L.jibAngles || []).push(jib); }
      }
      const idle = Math.max(0, total - busy), parks = parkSpots(idle);
      let pi = 0;
      for (const r of craneReturns) { const sp = parks[pi++]; if (!sp) break; const k = clamp((now - r.t0) / 500, 0, 1), e = easeInOut(k); addFolded(L, lerp(r.x, sp[0], e), lerp(r.y, sp[1], e), 'ret' + r.id); }
      for (; pi < idle; pi++) { const sp = parks[pi]; if (!sp) break; addFolded(L, sp[0], sp[1], 'park' + pi); }
      // graves, decorations, glinting rubble (the piles are in the ground cache; redrawn live where something stands
      // right behind a pile, so the pile still covers the foot of it)
      for (const gr of view.graves) {
        if (gr.gx == null || gr.id === movingId) continue;
        const pos = placedPos(gr), [x, y] = toScreen(pos.gx, pos.gy, 0), ef = fxOf(gr.id), isSel = sel && sel.kind === 'grave' && sel.id === gr.id;
        const isHover = !isSel && hover && hover.kind === 'grave' && hover.id === gr.id;
        const o = { initial: gr.initial, ribbon: gr.ribbon, ageDays: gr.ageMs / 86400000, flowerColors: gr.flowerColors, flowers: gr.flowers, t: tSec };
        add({ kind: 'grave', id: gr.id, key: pos.gx + pos.gy + 2, k2: pos.gx + 1, x0: pos.gx, y0: pos.gy, x1: pos.gx + 1, y1: pos.gy + 1, sb: smallBox('grave', x, y),
          draw: () => { if (isSel || isHover) selDiamond(x, y, isSel); Art.grave(g, x, y - ef.lift - liftOf('grave', gr.id), z, o); }, hit: smallHit('grave', x, y) });
      }
      for (const dc of view.decor) {
        if (dc.id === movingId) continue;
        const pos = placedPos(dc), [x, y] = toScreen(pos.gx, pos.gy, 0), ef = fxOf(dc.id), isSel = sel && sel.kind === 'decor' && sel.id === dc.id;
        const isHover = !isSel && hover && hover.kind === 'decor' && hover.id === dc.id;
        const o = dc.type === 'tree' ? { size: 0.75 + (hashStr(dc.id) % 26) / 100 } : {};
        add({ kind: 'decor', id: dc.id, key: pos.gx + pos.gy + 2, k2: pos.gx + 1, x0: pos.gx, y0: pos.gy, x1: pos.gx + 1, y1: pos.gy + 1, sb: smallBox(dc.type, x, y),
          draw: () => { if (isSel || isHover) selDiamond(x, y, isSel); Art.decor(g, dc.type, x, y - ef.lift - liftOf('decor', dc.id), z, o); }, hit: smallHit(dc.type, x, y) });
      }
      for (const r of view.rubble) {
        const [x, y] = toScreen(r.gx, r.gy, 0), isSel = sel && sel.kind === 'rubble' && sel.id === r.id, isHover = !isSel && hover && hover.kind === 'rubble' && hover.id === r.id;
        const pop = popping.get(r.id), live = liveGround || pop != null || isSel || isHover || behindTaken(r.gx, r.gy);
        if (pop != null && now < pop) continue;    // still sliding: pops up after
        const pk = pop != null ? clamp((now - pop) / POP_MS, 0, 1) : 1;
        add({ kind: 'rubble', id: r.id, key: r.gx + r.gy + 2, k2: r.gx + 1, x0: r.gx, y0: r.gy, x1: r.gx + 1, y1: r.gy + 1, sb: smallBox('rubble', x, y),
          draw: () => {
            if (isSel || isHover) selDiamond(x, y, isSel);
            if (live) { if (pk < 1) { g.save(); const cx = x, cy = y + 16 * z; g.translate(cx, cy); g.scale(0.6 + 0.4 * easeOut(pk), 0.6 + 0.4 * easeOut(pk)); g.translate(-cx, -cy); Art.rubble(g, x, y, z, { glint: r.glint }); g.restore(); } else Art.rubble(g, x, y, z, { glint: r.glint }); }
            else if (r.glint) Art.glint(g, x, y, z, {});
          }, hit: smallHit('rubble', x, y) });
      }
      // people
      for (const f of figs.values()) {
        if (!f.visible || f.alpha <= 0.001) continue;
        const [x, y] = toScreen(f.x, f.y, 0), pb = Art.personBox(z), isSel = sel && sel.kind === 'person' && sel.id === f.id;
        const p = pById.get(f.id), ring = !!(p && p.suggested && f.mode === 'walker');
        const out = !inLandFig(f);
        if (f.trip && f.trip.stretcher && f.path) {          // two medics carry the runner in
          add({ kind: 'person', id: f.id, key: f.x + f.y + 0.5, k2: f.x, x0: f.x - 0.5, y0: f.y - 0.5, x1: f.x + 0.5, y1: f.y + 0.5, out, sb: [x - 50 * z, y - 50 * z, x + 50 * z, y + 30 * z],
            draw: () => { g.save(); g.globalAlpha *= f.alpha; Art.stretcher(g, x, y, z, { patient: f.look, facing: f.facing, phase: f.phase, reduced }); g.restore(); },
            hit: { box: { x: x - 40 * z - 6, y: y - 44 * z - 6, w: 80 * z + 12, h: 64 * z + 12 } }, fig: f });
          if (f.pill) L.overlays.push({ kind: 'pill', text: f.pill.text, pk: f.pill.kind, x, y: y - 46 * z, person: f.id });
          continue;
        }
        const o = { pose: f.pose, facing: f.facing, phase: f.phase, state: f.state, restKind: f.restKind, limp: f.limp, carry: f.carry, ring: ring && !isSel, selected: isSel, alpha: f.alpha, bob: !reduced, reduced };
        if (f.pose === 'walk' || (f.path && f.pi < f.path.length && !reduced)) o.pose = 'walk';
        const lying = f.pose === 'lie';
        const box = lying ? { x: x - 26 * z - 6, y: y - 18 * z - 6, w: 52 * z + 12, h: 26 * z + 12 } : { x: x + pb.x0 - 6, y: y + pb.y0 - 6, w: pb.x1 - pb.x0 + 12, h: pb.y1 - pb.y0 + 12 };
        // someone sitting on a bench sits inside its tile: sort as if just in front of it, so the bench draws first
        const onBench = f.pose === 'sit' && occ[Math.floor(f.y) * G + Math.floor(f.x)] != null && dById.has(occ[Math.floor(f.y) * G + Math.floor(f.x)]);
        const ry0 = onBench ? Math.floor(f.y) + 1 + 1e-3 : f.y - 0.15;
        add({ kind: 'person', id: f.id, key: onBench ? Math.floor(f.x) + Math.floor(f.y) + 2.01 : f.x + f.y + 0.5, k2: f.x, x0: f.x - 0.15, y0: ry0, x1: f.x + 0.15, y1: ry0 + 0.3, out, sb: [box.x, box.y, box.x + box.w, box.y + box.h],
          draw: () => Art.person(g, x, y, z, f.look, o), hit: { box }, fig: f });
        L.personCircles.push({ id: f.id, x: x + (pb.x0 + pb.x1) / 2, y: lying ? y - 6 * z : y + (pb.y0 + pb.y1) / 2 });
        if (f.pill) L.overlays.push({ kind: 'pill', text: f.pill.text, pk: f.pill.kind, x, y: lying ? y - 22 * z : y + pb.y0 - 4, person: f.id });
      }
      for (const e of extraFigs) {
        if (e.kind !== 'stretcher' || e.done) continue;
        const [x, y] = toScreen(e.x, e.y, 0);
        add({ kind: 'medics', id: null, key: e.x + e.y + 0.5, k2: e.x, x0: e.x - 0.5, y0: e.y - 0.5, x1: e.x + 0.5, y1: e.y + 0.5, out: !(e.x < hi && e.y < hi), sb: [x - 50 * z, y - 50 * z, x + 50 * z, y + 30 * z],
          draw: () => { g.save(); g.globalAlpha *= Math.max(0, e.alpha); Art.stretcher(g, x, y, z, { facing: e.facing, phase: e.phase, reduced }); g.restore(); } });
      }
      depthSort(L.list);
      // overlays: bubbles and pills per building, stacked above the building's pill anchor
      for (const b of view.buildings) {
        if (b.id === movingId) continue;
        const pos = placedPos(b), lv = Math.max(1, b.lv), inf = Art.info(b.type, lv), stack = [];
        if (b.job) stack.push({ kind: 'timer', text: fmtClock(b.job.leftMs / 1000), frac: b.job.progress, free: b.job.free });
        if (b.house && b.house.resting > 0) stack.push({ kind: 'pill', text: 'z ' + b.house.resting, pk: 'z' });
        if (b.clinic) {
          for (const dn of b.clinic.down) stack.push({ kind: 'pill', text: dn.first + ' · ' + downHours(dn.leftMs), pk: 'down' });
          if (b.clinic.recovering.length) stack.push({ kind: 'pill', text: '+' + b.clinic.recovering.length, pk: 'plus' });
        }
        if (b.type === 'house' && b.house && b.house.lantern && !buildingOf('clinic')) {
          for (const pid of b.house.residents) { const p = pById.get(pid); if (p && p.state === 'down' && p.where === 'house') stack.push({ kind: 'pill', text: p.first + ' · ' + downHours(p.downLeftMs), pk: 'down' }); }
        }
        const showBubble = b.bubble && b.bubble.show;
        if (!stack.length && !showBubble) continue;
        const ef = fxOf(b.id), liftNow = ef.lift + (lifted && lifted.kind === 'building' && lifted.id === b.id ? lifted.amount : 0);
        // the pill sits above the building (+22 over a job's scaffold); a site is low, so its pill sits just over the scaffold
        const pillH = b.lv < 1 ? (b.type === 'tower' ? 74 : 50) : inf.pill[2] + (b.job ? 22 : 0);
        const [ax, ay0] = toScreen(pos.gx + inf.pill[0], pos.gy + inf.pill[1], pillH);
        const ay = ay0 - liftNow;
        L.overlays.push({ kind: 'stack', b, items: stack, x: ax, y: ay, bubble: showBubble ? { kind: b.bubble.res === 'bricks' ? 'brick' : 'can', full: b.bubble.full, bx: toScreen(pos.gx + inf.bubble[0], pos.gy + inf.bubble[1], inf.bubble[2])[0], by: toScreen(pos.gx + inf.bubble[0], pos.gy + inf.bubble[1], inf.bubble[2])[1] - liftNow } : null });
      }
      // the ghost
      if (ghost) {
        const [x, y] = toScreen(ghost.gx, ghost.gy, 0), kind = ghost.kind;
        const poly = Art.TYPES.indexOf(kind) >= 0 ? Art.silhouette(kind, ghost.lv, x, y, z) : null;
        const fp = footPoly(ghost.gx, ghost.gy, ghost.w, ghost.d);
        L.ghostHit = { poly: poly || fp, foot: fp, box: Art.TYPES.indexOf(kind) >= 0 ? null : hitBox44(kind, x, y) };
      }
      L.stamp = { cam: camStamp, view: viewStamp, dirty: dirtyStamp, frame: frames };
      return L;
    }
    function addFolded(L, cx, cy, id) {
      const [x, y] = toScreen(cx, cy, 0), z = cam.z;
      L.list.push({ kind: 'crane', id, key: cx + cy + 0.24, k2: cx, x0: cx - 0.12, y0: cy - 0.12, x1: cx + 0.12, y1: cy + 0.12, sb: [x - 30 * z, y - 70 * z, x + 30 * z, y + 10 * z],
        draw: () => Art.crane(g, x, y, z, { folded: true }) });
    }
    // cranes roll between the park and the site (0.5 s) when a job starts or ends (see diffView)
    function craneRoll(jobId, ax, ay) {
      let c = craneSeen.get(jobId);
      if (!c) { c = { t0: now, from: null }; craneSeen.set(jobId, c); }
      c.x = ax; c.y = ay;
      if (!c.from) return null;
      const k = clamp((now - c.t0) / 500, 0, 1); if (k >= 1) { c.from = null; return null; }
      const e = easeInOut(k); return { x: lerp(c.from[0], ax, e), y: lerp(c.from[1], ay, e) };
    }
    function gcCranes() { craneReturns = craneReturns.filter((r) => now - r.t0 < 500); }
    let parkCache = { key: '', spots: [] };
    function parkSpots(n) {                         // free tiles beside the Tower (right side first), tile centres
      const tw = view.tower ? bById.get(view.tower.id) : null; if (!tw || n <= 0) return [];
      const key = walkStr + '|' + tw.gx + ',' + tw.gy;
      if (parkCache.key !== key) {
        const out = [], tx = tw.gx, ty = tw.gy, gx = (x, y) => { if (walkable(x, y) && !gateTiles.some((t) => t[0] === x && t[1] === y)) out.push([x + 0.62, y + 0.42]); };
        for (let y = ty; y < ty + 3; y++) gx(tx + 3, y);
        for (let x = tx + 2; x >= tx; x--) gx(x, ty - 1);
        for (let x = tx; x < tx + 3; x++) gx(x, ty + 3);
        for (let y = ty; y < ty + 3; y++) gx(tx - 1, y);
        gx(tx + 3, ty - 1); gx(tx + 3, ty + 3); gx(tx - 1, ty - 1); gx(tx - 1, ty + 3);
        parkCache = { key, spots: out };
      }
      return parkCache.spots.slice(0, n);
    }
    function behindTaken(gx, gy) {                  // something stands right behind this tile (it must cover its foot)
      for (const [x, y] of [[gx - 1, gy], [gx, gy - 1], [gx - 1, gy - 1]]) { if (x < 0 || y < 0) continue; const o = occ[y * G + x]; if (o != null && !rById.has(o)) return true; }
      if (ghost) { if (gx >= ghost.gx - 1 && gx <= ghost.gx + ghost.w && gy >= ghost.gy - 1 && gy <= ghost.gy + ghost.d) return true; }
      return false;
    }
    function smallBox(kind, x, y) { const inf = Art.info(kind, 1), z = cam.z; return [x - 34 * z, y - (inf.top + 30) * z, x + 34 * z, y + 34 * z]; }
    function hitBox44(kind, x, y) {                 // the tile diamond extended up by the object's height, at least 44 x 44
      const z = cam.z, h = Art.info(kind, 1).h;
      let x0 = x - 32 * z, x1 = x + 32 * z, y0 = y - h * z, y1 = y + 32 * z;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (x1 - x0 < 44) { x0 = cx - 22; x1 = cx + 22; }
      if (y1 - y0 < 44) { y0 = cy - 22; y1 = cy + 22; }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    function smallHit(kind, x, y) {                 // the exact shape (tile diamond extended up) and the 44 x 44 minimum
      const z = cam.z, h = Art.info(kind, 1).h;
      return { poly: [[x, y - h * z], [x + 32 * z, y + 16 * z - h * z], [x + 32 * z, y + 16 * z], [x, y + 32 * z], [x - 32 * z, y + 16 * z], [x - 32 * z, y + 16 * z - h * z]],
        grown: hitBox44(kind, x, y), cx: x, cy: y + 16 * z - h * z / 2 };
    }
    function footPoly(gx, gy, w, d) { return [toScreen(gx, gy, 0), toScreen(gx + w, gy, 0), toScreen(gx + w, gy + d, 0), toScreen(gx, gy + d, 0)]; }
    function selDiamond(x, y, isSel) { if (isSel) Art.select(g, x, y, cam.z, 1, 1); else Art.footprint(g, x, y, cam.z, 1, 1, null, 'rgba(255,255,255,.85)', 1.6); }
    function liftOf(kind, id) { return lifted && lifted.kind === kind && lifted.id === id ? lifted.amount : 0; }
    // depth: footprints first (A wholly behind B along gx or gy draws first), else the front-corner key
    function depthSort(list) {
      list.sort((a, b) => a.key - b.key || a.k2 - b.k2);
      const n = list.length; if (n < 2) return;
      const succ = new Array(n), indeg = new Int32Array(n);
      for (let i = 0; i < n; i++) succ[i] = [];
      const E = 1e-6, behind = (a, b) => a.x1 <= b.x0 + E || a.y1 <= b.y0 + E;
      for (let i = 0; i < n; i++) {
        const A = list[i];
        for (let j = i + 1; j < n; j++) {
          const B = list[j];
          if (A.sb[2] <= B.sb[0] || B.sb[2] <= A.sb[0] || A.sb[3] <= B.sb[1] || B.sb[3] <= A.sb[1]) continue;
          const ab = behind(A, B), ba = behind(B, A);
          if (ab && ba) continue;                   // disjoint on screen in practice: any order
          if (ba && !ab) { succ[j].push(i); indeg[i]++; } else { succ[i].push(j); indeg[j]++; }
        }
      }
      const out = [], done = new Uint8Array(n);
      for (let c = 0; c < n; c++) {
        let pick = -1;
        for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0) { pick = i; break; }
        if (pick < 0) for (let i = 0; i < n; i++) if (!done[i]) { pick = i; break; }   // a cycle: break it by key
        done[pick] = 1; out.push(list[pick]);
        for (const s of succ[pick]) indeg[s]--;
      }
      for (let i = 0; i < n; i++) list[i] = out[i];
    }

    // ---------------------------------------------------------------------------------------------- juice helpers
    function selBounce() { if (!sel || !sel.t0 || reduced) return 1; const k = clamp((now - sel.t0) / BOUNCE_MS, 0, 1); return 1 + 0.08 * Math.sin(Math.PI * k) * (1 - k * 0.3); }
    function bellAngle() {
      if (!bell || reduced) return 0;
      const t = (now - bell.t0) / 1000, per = bell.low ? 1.6 : 0.9, n = bell.n;
      if (t > per * (n + 1.2)) { bell = null; return 0; }
      const env = t < per * n ? 1 : Math.max(0, 1 - (t - per * n) / (per * 1.2));
      return BELL_SWING * Math.sin(TAU * t / per) * env;
    }
    function ringBell(times, o) { bell = { t0: now, n: Math.max(1, times | 0), low: !!(o && o.low) }; }

    // ---------------------------------------------------------------------------------------------- draw
    function drawOverlays(L) {
      const cv = clearView(), sheetX = W - (insets.right || 0);
      L.hits = [];
      const clampPt = (x, y, w, h) => [clamp(x, cv.x0 + CLAMP + w / 2, cv.x1 - CLAMP - w / 2), clamp(y, cv.y0 + CLAMP + h, cv.y1 - CLAMP)];
      for (const ov of L.overlays) {
        if (ov.kind === 'pill') {
          if (ov.x > sheetX) continue;
          const box = Art.pill(g, ov.x, ov.y, ov.text, ov.pk);
          if (ov.person) L.hits.push({ kind: 'person', id: ov.person, box });
          continue;
        }
        if (ov.kind !== 'stack') continue;
        if (ov.x > sheetX) continue;               // hidden under a right sheet
        // the pill stack, then the bubble above it (or at its own anchor when there is no pill)
        let y = ov.y;
        const totalH = ov.items.length * 22 + (ov.bubble ? 30 : 0);
        let [x, yy] = clampPt(ov.x, y, 60, totalH);
        y = yy;
        for (const it of ov.items) {
          let box;
          if (it.kind === 'timer') box = Art.timerPill(g, x, y, it.text, it.frac, it.free ? { color: Art.PAL.good } : undefined);
          else box = Art.pill(g, x, y, it.text, it.pk);
          L.hits.push({ kind: 'building', id: ov.b.id, box, pill: true });
          y = box.y - 3;
        }
        if (ov.bubble) {
          let bx = x, by = ov.items.length ? y + 2 : ov.bubble.by;
          if (!ov.items.length) { const c = clampPt(ov.bubble.bx, ov.bubble.by, 44, 44); bx = c[0]; by = c[1]; }
          const t0 = bubbleSeen.get(ov.b.id), pk = t0 == null || reduced ? 1 : clamp((now - t0) / 150, 0, 1);
          const bob = reduced ? 0 : Math.sin(tSec * TAU / 1.6 + (hashStr(ov.b.id) % 7)) * 2;
          Art.bubble(g, bx, by + bob, ov.bubble.kind, { full: ov.bubble.full, scale: 0.85 + 0.15 * pk });
          const hb = Art.bubbleBox(bx, by + bob);
          L.hits.push({ kind: 'bubble', id: ov.b.id, box: { x: hb.x, y: hb.y, w: hb.w, h: hb.h }, cx: bx, cy: by + bob - 22 });
          if (pulseT && pulseT.target.kind === 'bubble' && pulseT.target.id === ov.b.id) pulseRing(bx, by + bob - 22);
        }
      }
    }
    function pulseK() { return reduced ? 0.6 : 0.5 + 0.5 * Math.sin((now - pulseT.t0) / 1000 * TAU / 1.1); }
    function pulseRing(x, y) {                     // the spotlight around a bubble
      const k = pulseK(); g.save(); g.globalAlpha = 0.55 + 0.45 * k;
      g.beginPath(); g.arc(x, y, 24 + 5 * k, 0, TAU); g.strokeStyle = Art.PAL.accent; g.lineWidth = 3; g.stroke(); g.restore();
    }
    function drawPulse() {
      if (!pulseT || !view) return;
      if (pulseT.until != null && now > pulseT.until) { pulseT = null; return; }
      const k = pulseK(), t = pulseT.target, z = cam.z;
      g.save(); g.globalAlpha = 0.55 + 0.45 * k;
      if (t.kind === 'bubble') { /* drawn with its bubble (drawOverlays) */ }
      else if (t.kind === 'person') {
        const f = figs.get(t.id); if (f && f.visible) { const [x, y] = toScreen(f.x, f.y, 0); g.beginPath(); g.ellipse(x, y, (16 + 4 * k) * z * 1.4, (7 + 2 * k) * z * 1.4, 0, 0, TAU); g.strokeStyle = Art.PAL.accent; g.lineWidth = 3; g.stroke(); }
      } else {
        let gx, gy, w, d;
        if (t.kind === 'tile') { gx = t.gx; gy = t.gy; w = t.w || 1; d = t.d || 1; }
        else { const o = t.kind === 'building' ? bById.get(t.id) : t.kind === 'grave' ? gById.get(t.id) : t.kind === 'decor' ? dById.get(t.id) : t.kind === 'rubble' ? rById.get(t.id) : null; if (o && o.gx != null) { gx = o.gx; gy = o.gy; w = o.w || 1; d = o.d || 1; } }
        if (gx != null) { const e = 0.12 + 0.1 * k, [x, y] = toScreen(gx - e, gy - e, 0); Art.footprint(g, x, y, z, w + 2 * e, d + 2 * e, 'rgba(255,122,47,.12)', Art.PAL.accent, 3); }
      }
      g.restore();
    }
    function drawConfetti() {
      if (!confetti.length) return;
      const z = cam.z, keep = [];
      for (const c of confetti) {
        const t = (now - c.t0) / 1000; if (t * 1000 > c.life) continue; keep.push(c);
        const X = c.X + c.vx * t, Y = c.Y + c.vy * t + 210 * t * t, x = sxOf(X), y = syOf(Y), a = 1 - Math.max(0, (t * 1000 - c.life * 0.6) / (c.life * 0.4));
        g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(c.rot + c.vr * t); g.fillStyle = c.col; g.fillRect(-1.6 * Math.max(0.8, z), -2.6 * Math.max(0.8, z), 3.2 * Math.max(0.8, z), 5.2 * Math.max(0.8, z)); g.restore();
      }
      confetti = keep;
    }
    function drawGhost() {
      if (!ghost) return;
      const [x, y] = toScreen(ghost.gx, ghost.gy, 0), lift = ghost.dragging ? 4 : 0;
      const o = Object.assign({}, ghost.art || {});
      Art.ghost(g, ghost.kind, ghost.lv, x, y - lift, cam.z, ghost.valid, o);
    }
    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(bs, 0, 0, bs, 0, 0);
      Art.frame({ t: tSec, reduced, dpr: bs });
      const L = layout, z = cam.z, landNow = slideLand(), pc = profClock, t0 = pc ? pc() : 0;
      let groundRendered = false;
      // the ground: the cache over the sky; while the fence slides (and new rubble pops) the ground is drawn live into
      // the cleared canvas first and the sky goes behind it (its haze tints only what is drawn), else the cache
      let t1 = 0, t2 = 0;
      if (liveGround) {
        Art.ground(g, sxOf(0), syOf(0), z, worldOfNow(landNow)); t1 = pc ? pc() : 0;
        g.globalCompositeOperation = 'destination-over'; Art.sky(g, W, H); g.globalCompositeOperation = 'source-over'; t2 = pc ? pc() : 0;
      } else {
        Art.sky(g, W, H); t1 = pc ? pc() : 0;
        groundRendered = maybeRenderGround(false); if (gc.cv) drawGroundCache(); t2 = pc ? pc() : 0;
      }
      drawPulse();
      for (const p of fx) if (p.kind === 'puff') { const k = (now - p.t0) / p.dur; if (k > 0 && k < 1) { const [x, y] = toScreen(p.gx, p.gy, 0); Art.puff(g, x, y, z, k, p.w, p.d); } }
      let drawn = 0;
      const vis = (d) => d.sb[2] >= -20 && d.sb[0] <= W + 20 && d.sb[3] >= -20 && d.sb[1] <= H + 20;
      for (const d of L.list) if (!d.out && vis(d)) { d.draw(); drawn++; }
      const t3 = pc ? pc() : 0;
      for (const j of L.jibs) j();
      const wNow = worldOfNow(landNow);
      Art.fence(g, sxOf(0), syOf(0), z, wNow, 'front');
      for (const d of L.list) if (d.out && vis(d)) { d.draw(); drawn++; }
      Art.ruins(g, sxOf(0), syOf(0), z, wNow, 'front');
      // dust puffs of placed objects (once landed)
      for (const e of fx) if (e.kind === 'drop' && !e.puffed && now - e.t0 >= e.dur) { e.puffed = true; const o = bById.get(e.id) || gById.get(e.id) || dById.get(e.id); if (o && o.gx != null && !reduced) fx.push({ kind: 'puff', gx: o.gx, gy: o.gy, w: e.w, d: e.d, t0: now, dur: PUFF_MS }); }
      const t4 = pc ? pc() : 0;
      drawConfetti();
      drawOverlays(L);
      drawGhost();
      if (pc) { const t5 = pc(); profLast = { first: t1 - t0, second: t2 - t1, objects: t3 - t2, fenceRuins: t4 - t3, overlays: t5 - t4 }; }
      return { drawn, groundRendered };
    }

    // ---------------------------------------------------------------------------------------------- frame
    function frame(ts) {
      if (destroyed) return lastStats;
      if (typeof ts !== 'number' || !isFinite(ts)) ts = lastNow == null ? 0 : lastNow + 16.7;
      if (hasDom && !dprFixed && Math.min(3, Math.max(1, window.devicePixelRatio || 1)) !== bsMax) resize();
      const interval = lastNow == null ? 0 : ts - lastNow;
      const dt = clamp(interval / 1000, 0, 0.1);
      now = ts; tSec = ts / 1000; lastNow = ts; frames++;
      // backing store: 2 while panning or pinching, and after a second whose frames averaged over 20 ms; back after 2 s
      // averaging 18 ms or less (the wait doubles, up to 32 s, when it drops again within 5 s of a restore)
      if (interval > 0 && interval < 250 && adaptive) {
        ivTs.push(ts); ivV.push(interval);
        const keep = Math.max(SLOW_FOR, goodNeed) + 100; while (ivTs.length && ivTs[0] < ts - keep) { ivTs.shift(); ivV.shift(); }
        const meanSince = (t0) => { let sum = 0, n = 0; for (let i = ivTs.length - 1; i >= 0 && ivTs[i] >= t0; i--) { sum += ivV[i]; n++; } return n ? sum / n : 0; };
        if (!perfDrop) {
          if (ivTs[0] <= ts - SLOW_FOR + 34 && meanSince(ts - SLOW_FOR) > SLOW_MS) {
            perfDrop = true; dropAt = ts;
            if (restoredAt != null && ts - restoredAt < 5000) goodNeed = Math.min(32000, goodNeed * 2);
          }
        } else if (ts - dropAt >= goodNeed && meanSince(ts - goodNeed) <= GOOD_MS) { perfDrop = false; restoredAt = ts; }
      }
      const wantBs = perfDrop || gestureActive() ? Math.min(bsMax, 2) : bsMax;
      if (wantBs !== bs) { const up = wantBs > bs; applyBs(wantBs); if (up) zoomEnded(); }
      // camera easing, edge scroll while dragging the ghost
      if (camAnim) {
        const k = clamp((ts - camAnim.t0) / camAnim.dur, 0, 1), e = easeOut(k), a = camAnim;
        cam.X = lerp(a.from.X, a.to.X, e); cam.Y = lerp(a.from.Y, a.to.Y, e); cam.z = a.from.z * Math.pow(a.to.z / a.from.z, e);
        const zc = Math.abs(a.to.z - a.from.z) > 1e-9; if (k >= 1) camAnim = null; camChanged(zc);
      }
      if (gest && gest.mode === 'ghost' && gest.last) edgeScroll(dt);
      if (zoomDirty && ts >= zoomSettleAt && !(gest && gest.mode === 'pinch')) { zoomDirty = false; zoomEnded(); }
      if (lifted) {
        const k = reduced ? 1 : clamp((ts - lifted.t0) / 120, 0, 1), ks = reduced ? 1 : clamp((ts - lifted.ts) / 160, 0, 1);
        lifted.amount = lifted.settling ? LIFT_PX * (1 - easeOut(ks)) : LIFT_PX * easeOut(k);
        if (lifted.settling && ks >= 1) lifted = null;
      }
      if (slide && now - slide.t0 >= SLIDE_MS) slide = null;
      for (let i = fx.length - 1; i >= 0; i--) if (now - fx[i].t0 > fx[i].dur + 50 && (fx[i].kind !== 'drop' || fx[i].puffed)) fx.splice(i, 1);
      if (view) { gcCranes(); stepFigs(dt); }
      if (popping.size) for (const [id, t] of popping) if (now >= t + POP_MS) popping.delete(id);
      liveGround = !!slideLand() || popping.size > 0;
      layout = buildLayout();
      const r = view ? draw() : { drawn: 0, groundRendered: false };
      if (hoverQueued) { const h = hoverQueued; hoverQueued = null; updateHover(h.x, h.y); }
      lastStats = { dt: interval, drawn: r.drawn, bs, groundK: gc.k, groundRendered: r.groundRendered };
      return lastStats;
    }

    // ---------------------------------------------------------------------------------------------- picking
    const layoutFresh = () => !!layout && layout.stamp.cam === camStamp && layout.stamp.view === viewStamp && layout.stamp.dirty === dirtyStamp;
    function freshLayout() { if (!layoutFresh()) { layout = buildLayout(); layout.hits = layout.hits || []; if (!layout.hitsBuilt) overlayHits(layout); } return layout; }
    function overlayHits(L) {                       // the overlay hit boxes without drawing (pick before the first frame)
      L.hits = [];                                  // approximate pill widths (no text measuring outside a frame)
      const cv = clearView(), sheetX = W - (insets.right || 0);
      for (const ov of L.overlays) {
        if (ov.kind !== 'stack' || ov.x > sheetX) continue;
        let x = clamp(ov.x, cv.x0 + CLAMP + 30, cv.x1 - CLAMP - 30), y = clamp(ov.y, cv.y0 + CLAMP + ov.items.length * 22 + (ov.bubble ? 30 : 0), cv.y1 - CLAMP);
        for (let i = 0; i < ov.items.length; i++) { L.hits.push({ kind: 'building', id: ov.b.id, box: { x: x - 30, y: y - 21, w: 60, h: 21 }, pill: true }); y -= 24; }
        if (ov.bubble) {
          let bx = x, by = ov.items.length ? y + 2 : ov.bubble.by;
          if (!ov.items.length) { bx = clamp(ov.bubble.bx, cv.x0 + CLAMP + 22, cv.x1 - CLAMP - 22); by = clamp(ov.bubble.by, cv.y0 + CLAMP + 44, cv.y1 - CLAMP); }
          const hb = Art.bubbleBox(bx, by); L.hits.push({ kind: 'bubble', id: ov.b.id, box: hb, cx: bx, cy: by - 22 });
        }
      }
      L.hitsBuilt = true;
    }
    function pick(x, y, o) {
      o = o || {};
      if (!view) return { kind: 'none', x, y };
      const L = layoutFresh() ? layout : freshLayout();
      if (ghost && L.ghostHit && o.ghost !== false) {
        const gh = L.ghostHit;
        if (inPoly(gh.foot, x, y) || (gh.poly && inPoly(gh.poly, x, y)) || (gh.box && inBox(gh.box, x, y))) return { kind: 'ghost', x, y };
      }
      if (!ghost) for (let i = L.hits.length - 1; i >= 0; i--) { const h = L.hits[i]; if (inBox(h.box, x, y)) return { kind: h.kind, id: h.id, x, y, pill: !!h.pill }; }
      // front to back (reverse draw order): exact shapes first (building silhouettes, people's drawn bounds + 6 px,
      // small objects' extruded tile diamonds), then the 44 x 44 minimum boxes of small objects (nearest centre wins
      // where two overlap), then a person's 22 px circle
      const order = L.list.filter((d) => d.out).concat(L.list.filter((d) => !d.out));
      const res = (d) => (d.kind === 'person' ? { kind: 'person', id: d.id, x, y } : { kind: d.kind, id: d.id, x, y, gx: d.x0, gy: d.y0 });
      for (let i = order.length - 1; i >= 0; i--) {
        const d = order[i]; if (!d.hit) continue;
        if (d.kind === 'person' && o.people === false) continue;
        const hit = d.hit.poly ? inPoly(d.hit.poly, x, y) : inBox(d.hit.box, x, y);
        if (hit) return res(d);
      }
      let grown = null, gd = Infinity;
      for (const d of order) { if (!d.hit || !d.hit.grown || !inBox(d.hit.grown, x, y)) continue; const dd = (d.hit.cx - x) * (d.hit.cx - x) + (d.hit.cy - y) * (d.hit.cy - y); if (dd < gd) { gd = dd; grown = d; } }
      if (grown) return res(grown);
      if (o.people !== false) {
        let best = null, bd = 22 * 22;
        for (const c of L.personCircles) { const dd = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y); if (dd <= bd) { bd = dd; best = c; } }
        if (best) return { kind: 'person', id: best.id, x, y, near: true };
      }
      if (landmarks) {
        const lms = Art.landmarkList(worldOfNow());
        for (let i = lms.length - 1; i >= 0; i--) {
          const l = lms[i], pts = [toScreen(l.gx, l.gy, l.h), toScreen(l.gx + l.w, l.gy, l.h), toScreen(l.gx + l.w, l.gy, 0), toScreen(l.gx + l.w, l.gy + l.d, 0), toScreen(l.gx, l.gy + l.d, 0), toScreen(l.gx, l.gy + l.d, l.h)];
          if (inPoly(pts, x, y)) return { kind: 'landmark', id: l.id, x, y, state: l.state };
        }
      }
      const [fx2, fy2] = toGround(x, y), gx = Math.floor(fx2), gy = Math.floor(fy2);
      return { kind: 'ground', gx, gy, fx: fx2, fy: fy2, inLand: gx >= lo && gy >= lo && gx < hi && gy < hi, x, y };
    }
    function screenOf(t) {
      if (!t || !view) return null;
      if (t.kind === 'bubble') {
        const L = freshLayout(); const h = (L.hits || []).find((x) => x.kind === 'bubble' && x.id === t.id);
        if (h) return { x: h.cx, y: h.cy, box: h.box };
        const b = bById.get(t.id); if (!b) return null; const inf = Art.info(b.type, Math.max(1, b.lv)); const [x, y] = toScreen(b.gx + inf.bubble[0], b.gy + inf.bubble[1], inf.bubble[2]); return { x, y: y - 22, box: Art.bubbleBox(x, y) };
      }
      const wb = worldBoxOf(t); if (!wb) return null;
      const box = { x: sxOf(wb.x0), y: syOf(wb.y0), w: (wb.x1 - wb.x0) * cam.z, h: (wb.y1 - wb.y0) * cam.z };
      if (t.kind === 'person') { const f = figs.get(t.id); if (!f) return null; const [x, y] = toScreen(f.x, f.y, 14); return { x, y, box }; }
      return { x: box.x + box.w / 2, y: box.y + box.h / 2, box };
    }

    // ---------------------------------------------------------------------------------------------- selection, pulse
    function select(t, o) {
      o = o || {};
      dirtyStamp++;
      if (!t) { sel = null; return null; }
      sel = { kind: t.kind, id: t.id, t0: o.bounce === false || reduced ? null : now };
      if (o.focus !== false) focus(sel);
      return sel;
    }
    function pulse(t, o) { pulseT = t ? { target: t, t0: now, until: o && o.ms != null && isFinite(o.ms) ? now + o.ms : null } : null; }

    // ---------------------------------------------------------------------------------------------- the ghost
    function ghostStart(o) {
      o = o || {};
      let kind = o.kind, id = o.id || null, lv = o.lv || 1, art = Object.assign({}, o.art || {}), targetKind = o.targetKind || null;
      if (o.mode === 'move' && id) {
        const b = bById.get(id), gr = gById.get(id), dc = dById.get(id);
        if (b) { kind = b.type; lv = Math.max(1, b.lv); targetKind = 'building'; if (b.house) { art.roof = b.house.idx % 3; art.lit = b.house.lit; art.lantern = b.house.lantern; } if (b.type === 'tower') art.bell = 0; }
        else if (gr) { kind = 'grave'; targetKind = 'grave'; Object.assign(art, { initial: gr.initial, ribbon: gr.ribbon, ageDays: gr.ageMs / 86400000, flowerColors: gr.flowerColors, flowers: gr.flowers }); }
        else if (dc) { kind = dc.type; targetKind = 'decor'; if (dc.type === 'tree') art.size = 0.75 + (hashStr(dc.id) % 26) / 100; }
        else return null;
      }
      const [w, d] = footOf(kind);
      let gx = o.gx, gy = o.gy;
      if (gx == null || gy == null) {
        const src = o.mode === 'move' && id ? (bById.get(id) || gById.get(id) || dById.get(id)) : null;
        if (src && src.gx != null) { gx = src.gx; gy = src.gy; }
        else { const [cx, cy] = toGround(...cvCentre()), sp = suggestSpot(kind, cx, cy, id); if (sp) { gx = sp.gx; gy = sp.gy; } else { gx = Math.floor(cx - w / 2 + 0.5); gy = Math.floor(cy - d / 2 + 0.5); } }
      }
      ghost = { kind, mode: o.mode || 'place', id, targetKind, lv, w, d, gx, gy, valid: false, reason: null, dragging: false, moved: false, startGx: gx, startGy: gy, art };
      dirtyStamp++;
      refreshGhost(true);
      if (o.focus !== false) focus({ kind: 'ghost' });
      return ghostCopy();
    }
    function ghostCopy() { return ghost ? { kind: ghost.kind, mode: ghost.mode, id: ghost.id, targetKind: ghost.targetKind, gx: ghost.gx, gy: ghost.gy, w: ghost.w, d: ghost.d, lv: ghost.lv, valid: ghost.valid, reason: ghost.reason, dragging: ghost.dragging, moved: ghost.moved } : null; }
    function refreshGhost(emit) {
      if (!ghost) return;
      const v = validAt(ghost.kind, ghost.gx, ghost.gy, ghost.id), changed = v.ok !== ghost.valid || v.reason !== ghost.reason;
      ghost.valid = v.ok; ghost.reason = v.reason;
      if ((emit || changed) && on.onGhostMove) on.onGhostMove(ghostCopy());
    }
    function ghostMove(gx, gy, o) {
      if (!ghost) return null;
      gx = clamp(Math.round(gx), 0, G - ghost.w); gy = clamp(Math.round(gy), 0, G - ghost.d);
      const moved = gx !== ghost.gx || gy !== ghost.gy;
      ghost.gx = gx; ghost.gy = gy; if (moved) ghost.moved = ghost.gx !== ghost.startGx || ghost.gy !== ghost.startGy;
      const v = validAt(ghost.kind, gx, gy, ghost.id); ghost.valid = v.ok; ghost.reason = v.reason;
      if (on.onGhostMove && (moved || (o && o.emit))) on.onGhostMove(ghostCopy());
      dirtyStamp++;
      return ghostCopy();
    }
    function ghostEnd(o) {
      const gh = ghostCopy(); if (!ghost) return null;
      if (o && o.commit && ghost.mode === 'move' && ghost.id) {
        placedOverride = { id: ghost.id, gx: ghost.gx, gy: ghost.gy, t0: now, armed: true };
        if (!reduced) fx.push({ kind: 'settle', id: ghost.id, from: 8, dur: 180, t0: now });
      }
      ghost = null; if (gest && gest.mode === 'ghost') gest = null;
      dirtyStamp++;
      return gh;
    }
    function ghostFromPoint(x, y, pointerType) {    // the footprint centred on the point (36 px above a finger)
      const lift = pointerType === 'touch' ? GHOST_LIFT : 0, [fx2, fy2] = toGround(x, y - lift);
      return [Math.floor(fx2 - ghost.w / 2 + 0.5), Math.floor(fy2 - ghost.d / 2 + 0.5)];
    }
    // while dragging: a finger holds the footprint's centre 36 px above it; a mouse keeps the offset it grabbed with
    function ghostDragOrigin(x, y, type) {
      if (type === 'touch') return ghostFromPoint(x, y, 'touch');
      const c = ghostFromPoint(x, y, 'mouse'), off = gest && gest.off ? gest.off : [0, 0];
      return [c[0] + off[0], c[1] + off[1]];
    }
    function edgeScroll(dt) {
      const p = gest.last, cv = clearView();
      let vx = 0, vy = 0;
      const sp = (dist) => EDGE_SPEED * clamp((EDGE - dist) / EDGE, 0, 1);
      if (p.x < cv.x0 + EDGE) vx = sp(p.x - cv.x0); else if (p.x > cv.x1 - EDGE) vx = -sp(cv.x1 - p.x);
      if (p.y < cv.y0 + EDGE) vy = sp(p.y - cv.y0); else if (p.y > cv.y1 - EDGE) vy = -sp(cv.y1 - p.y);
      if (!vx && !vy) return;
      panBy(vx * dt, vy * dt);
      const [gx, gy] = ghostDragOrigin(p.x, p.y, p.type); ghostMove(gx, gy);
    }

    // ---------------------------------------------------------------------------------------------- gestures (8.2)
    function local(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function pDown(e) {
      if (!interactive || destroyed) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const [x, y] = local(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      pointers.set(e.pointerId, { x, y, x0: x, y0: y, t0: e.timeStamp, type: e.pointerType || 'mouse' });
      if (pointers.size === 2) { startPinch(); return; }
      if (pointers.size > 2) return;
      camAnim = null;
      const h = pick(x, y);
      if (ghost && h.kind === 'ghost') {             // drags the ghost at once (no hold) from the first few px of movement
        const c = ghostFromPoint(x, y, 'mouse');
        gest = { mode: 'ghost', id: e.pointerId, last: null, t0: e.timeStamp, x0: x, y0: y, moved: false, off: [ghost.gx - c[0], ghost.gy - c[1]] };
        return;
      }
      const movable = (t) => t && (t.kind === 'building' || t.kind === 'grave' || t.kind === 'decor');
      if (!ghost && sel && movable(sel) && h.kind === sel.kind && h.id === sel.id) {
        gest = { mode: 'presssel', id: e.pointerId, x0: x, y0: y, t0: e.timeStamp, hit: h };
        clearTimeout(holdTimer); holdTimer = setTimeout(() => liftNow(), HOLD_MS);
        return;
      }
      gest = { mode: 'press', id: e.pointerId, x0: x, y0: y, t0: e.timeStamp, hit: h };
    }
    function liftNow() {
      if (!gest || gest.mode !== 'presssel' || !sel) return;
      gest.mode = 'lift'; lifted = { kind: sel.kind, id: sel.id, t0: now, amount: 0, settling: false };
      try { if (hasDom && navigator.vibrate) navigator.vibrate(10); } catch (err) { /* no haptics */ }
      if (on.onLift) on.onLift({ kind: sel.kind, id: sel.id });
    }
    function pMove(e) {
      if (destroyed) return;
      const [x, y] = local(e);
      const p = pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse' && interactive) hoverQueued = { x, y }; return; }
      const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
      if (!gest || !interactive) return;
      if (gest.mode === 'pinch') { movePinch(); return; }
      if (gest.id !== e.pointerId) return;
      const far = Math.hypot(x - gest.x0, y - gest.y0) >= TAP_MOVE;
      if (gest.mode === 'press' || gest.mode === 'presssel') { if (far) { clearTimeout(holdTimer); gest.mode = 'pan'; panBy(x - gest.x0, y - gest.y0); } return; }
      if (gest.mode === 'lift') {
        if (far && sel) {                          // the drag moves it in move mode
          const tgt = { kind: sel.kind, id: sel.id };
          ghostStart({ mode: 'move', id: sel.id, focus: false });
          lifted = null;
          const c = ghostFromPoint(gest.x0, gest.y0, 'mouse');
          gest = { mode: 'ghost', id: e.pointerId, last: { x, y, type: e.pointerType }, t0: e.timeStamp, x0: x, y0: y, moved: true, off: ghost ? [ghost.gx - c[0], ghost.gy - c[1]] : [0, 0] };
          if (ghost) { ghost.dragging = true; const [gx, gy] = ghostDragOrigin(x, y, e.pointerType); ghostMove(gx, gy, { emit: true }); }
          if (on.onMoveStart) on.onMoveStart(tgt, ghostCopy());
        }
        return;
      }
      if (gest.mode === 'pan') { panBy(dx, dy); return; }
      if (gest.mode === 'ghost' && ghost) {
        if (!gest.last && Math.hypot(x - gest.x0, y - gest.y0) < 4) return;      // a tap on the ghost leaves it where it is
        if (!gest.last) { ghost.dragging = true; if (on.onGhostMove) on.onGhostMove(ghostCopy()); }
        gest.last = { x, y, type: e.pointerType }; if (far) gest.moved = true;
        const [gx, gy] = ghostDragOrigin(x, y, e.pointerType); ghostMove(gx, gy);
      }
    }
    function pUp(e, cancel) {
      if (destroyed) return;
      const p = pointers.get(e.pointerId); if (!p) return;
      pointers.delete(e.pointerId);
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* fine */ }
      if (!gest) return;
      if (gest.mode === 'pinch') {
        if (pointers.size === 1) { const [id, q] = Array.from(pointers.entries())[0]; gest = { mode: 'pan', id, x0: q.x, y0: q.y, t0: e.timeStamp }; }
        else if (pointers.size === 0) { gest = null; zoomSettleAt = now; zoomDirty = true; }
        return;
      }
      if (gest.id !== e.pointerId) return;
      clearTimeout(holdTimer);
      const g0 = gest; gest = null;
      const dtMs = e.timeStamp - g0.t0, [x, y] = [p.x, p.y], far = Math.hypot(x - g0.x0, y - g0.y0) >= TAP_MOVE;
      if (cancel) { if (g0.mode === 'lift' && lifted) { lifted.settling = true; lifted.ts = now; } if (g0.mode === 'ghost' && ghost) ghost.dragging = false; return; }
      if (g0.mode === 'press' && !far && dtMs <= TAP_MS) tap(x, y, e.pointerType, g0.hit);
      else if (g0.mode === 'presssel' && !far && dtMs <= TAP_SEL_MS) tap(x, y, e.pointerType, g0.hit);
      else if (g0.mode === 'lift') { if (lifted) { lifted.settling = true; lifted.ts = now; } }   // released without a drag
      else if (g0.mode === 'ghost' && ghost) { ghost.dragging = false; if (!g0.moved && dtMs <= TAP_MS) { /* a tap on the ghost: stays */ } if (on.onGhostMove) on.onGhostMove(ghostCopy()); }
    }
    function tap(x, y, pointerType, hit0) {
      const h = pick(x, y) || hit0;
      const mode = ghost ? 'ghost' : 'city';
      if (on.onTap && on.onTap(h, { x, y, pointerType, mode }) === false) return;
      if (ghost) {                                   // placement or move mode: the ghost jumps to the tapped tile
        if (h.kind === 'ghost') return;
        const [gx, gy] = ghostFromPoint(x, y, 'mouse'); ghostMove(gx, gy, { emit: true });
        return;
      }
      if (h.kind === 'bubble') { const s = screenOf({ kind: 'bubble', id: h.id }); if (on.onCollect) on.onCollect(h.id, s ? { x: s.x, y: s.y } : { x, y }); return; }
      if (h.kind === 'landmark') { if (on.onLandmark) on.onLandmark(h.id); return; }
      if (h.kind === 'building' || h.kind === 'grave' || h.kind === 'decor' || h.kind === 'rubble' || h.kind === 'person') {
        const again = !!(sel && sel.kind === h.kind && sel.id === h.id);
        if (!again) select({ kind: h.kind, id: h.id }); else if (!reduced) sel.t0 = now;
        if (on.onSelect) on.onSelect({ kind: h.kind, id: h.id }, { again });
        return;
      }
      if (sel) { sel = null; if (on.onSelect) on.onSelect(null, { again: false }); }
      else if (on.onSelect) on.onSelect(null, { again: false });
    }
    function startPinch() {
      clearTimeout(holdTimer);
      if (lifted && !lifted.settling) { lifted.settling = true; lifted.ts = now; }
      if (ghost) ghost.dragging = false;
      const pts = Array.from(pointers.values()).slice(0, 2);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2, d = Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const X = cam.X + (mx - W / 2) / cam.z, Y = cam.Y + (my - H / 2) / cam.z;
      gest = { mode: 'pinch', d0: d, z0: cam.z, X, Y };
      camAnim = null;
      if (bs > Math.min(bsMax, 2)) applyBs(Math.min(bsMax, 2));
    }
    function movePinch() {
      const pts = Array.from(pointers.values()).slice(0, 2); if (pts.length < 2) return;
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2, d = Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const z = clamp(gest.z0 * d / gest.d0, Z_MIN, Z_MAX);
      // the world point that was under the first midpoint follows the current midpoint (pinch + pan)
      setCam({ X: gest.X - (mx - W / 2) / z, Y: gest.Y - (my - H / 2) / z, z }, false);
    }
    function wheel(e) {
      if (!interactive || destroyed) return;
      e.preventDefault();
      const [x, y] = local(e);
      let dy = e.deltaY; if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= H;
      if (e.ctrlKey) dy *= 2.5;                      // trackpad pinch arrives as ctrl + wheel
      zoomAt(cam.z * Math.exp(-dy * 0.0015), x, y);
    }
    function updateHover(x, y) {
      if (!interactive || gest || ghost) { if (hover) { hover = null; if (on.onHover) on.onHover(null); } return; }
      const h = pick(x, y), t = ['building', 'grave', 'decor', 'rubble', 'person', 'bubble', 'landmark'].indexOf(h.kind) >= 0 ? h : null;
      const changed = (t ? t.kind + t.id : '') !== (hover ? hover.kind + hover.id : '');
      hover = t ? { kind: t.kind, id: t.id } : null;
      canvas.style.cursor = t ? 'pointer' : '';
      if (changed && on.onHover) on.onHover(hover);
    }
    function pLeave() { hoverQueued = null; if (hover) { hover = null; canvas.style.cursor = ''; if (on.onHover) on.onHover(null); } }
    function key(e) {
      if (!interactive) return false;
      const k = e.key, step = 80;
      if (k === 'ArrowLeft') panBy(step, 0); else if (k === 'ArrowRight') panBy(-step, 0);
      else if (k === 'ArrowUp') panBy(0, step); else if (k === 'ArrowDown') panBy(0, -step);
      else if (k === '+' || k === '=') zoomBy(1.25); else if (k === '-' || k === '_') zoomBy(1 / 1.25);
      else return false;
      return true;
    }
    function zoomBy(f, sx, sy) { zoomAt(cam.z * f, sx, sy); zoomSettleAt = now + 220; zoomDirty = true; }
    const listeners = [];
    function listen(t, n, fn, o) { t.addEventListener(n, fn, o); listeners.push([t, n, fn, o]); }
    function attach() {
      if (!hasDom || opts.input === false) return;
      canvas.style.touchAction = 'none';
      listen(canvas, 'pointerdown', pDown);
      listen(canvas, 'pointermove', pMove);
      listen(canvas, 'pointerup', (e) => pUp(e, false));
      listen(canvas, 'pointercancel', (e) => pUp(e, true));
      listen(canvas, 'pointerleave', pLeave);
      listen(canvas, 'wheel', wheel, { passive: false });
      listen(canvas, 'contextmenu', (e) => e.preventDefault());
      if (typeof ResizeObserver !== 'undefined' && opts.autoResize !== false && !(opts.width && opts.height)) { ro = new ResizeObserver(() => resize()); ro.observe(canvas); }
      if (typeof window.matchMedia === 'function') {
        mql = window.matchMedia('(prefers-reduced-motion: reduce)');
        const fn = () => applyReduced(); if (mql.addEventListener) { mql.addEventListener('change', fn); listeners.push([mql, 'change', fn]); }
      }
    }
    let ro = null;
    function applyReduced() { reduced = reducedPref == null ? !!(mql && mql.matches) : !!reducedPref; if (reduced) { camAnim = null; confetti = []; slide = null; } }
    function setReducedMotion(v) { reducedPref = v == null ? null : !!v; applyReduced(); }
    function setInsets(i) {
      insets = Object.assign({}, insets || defaultInsets(), i || {}); insetsUser = true; camStamp++;
      if (ghost) focus({ kind: 'ghost' }); else if (sel) focus(sel);
    }
    function setAdaptiveDpr(v) { adaptive = !!v; if (!adaptive) { perfDrop = false; ivTs.length = 0; ivV.length = 0; goodNeed = GOOD_FOR; } }
    function setInteractive(v) { interactive = !!v; if (!interactive) { pointers.clear(); gest = null; clearTimeout(holdTimer); pLeave(); } }
    function destroy() {
      destroyed = true; clearTimeout(holdTimer);
      for (const [t, n, fn, o] of listeners) { try { t.removeEventListener(n, fn, o); } catch (err) { /* gone */ } }
      if (ro) ro.disconnect();
      if (gc.cv) { gc.cv.width = 0; gc.cv.height = 0; gc.cv = null; gc.ctx = null; }
      figs.clear(); fx.length = 0;
    }

    // ---------------------------------------------------------------------------------------------- init + API
    insets = Object.assign(defaultInsets(), opts.insets || {});
    resize();
    if (opts.insets) insets = Object.assign(defaultInsets(), opts.insets);
    attach(); applyReduced();
    if (opts.view) setView(opts.view);
    const api = {
      on, setView, frame, resize, setReducedMotion, setInteractive, setAdaptiveDpr, destroy,
      setInsets, getCamera, setCamera: (c, o) => setTarget(c.tx, c.ty, c.z, !!(o && o.ease)), fit, focus, panBy, zoomAt, zoomBy, key,
      tileToScreen: (gx, gy, h) => { const [x, y] = toScreen(gx, gy, h || 0); return { x, y }; },
      screenToTile: (x, y) => { const [fx2, fy2] = toGround(x, y), gx = Math.floor(fx2), gy = Math.floor(fy2); return { gx, gy, fx: fx2, fy: fy2, inLand: gx >= lo && gy >= lo && gx < hi && gy < hi }; },
      pick, screenOf, clearView,
      select, selected: () => (sel ? { kind: sel.kind, id: sel.id } : null), pulse, ringBell,
      ghostStart, ghostMove, ghost: ghostCopy, ghostEnd, ghostValid: (gx, gy) => (ghost ? validAt(ghost.kind, gx, gy, ghost.id) : { ok: false, reason: 'bad' }),
      validAt, suggestSpot,
      walkOut, walkIn, holdArrivals,
      gather,
      figures: () => Array.from(figs.values()).map((f) => ({ id: f.id, x: f.x, y: f.y, kind: f.mode, visible: f.visible && f.alpha > 0.01, pose: f.pose, facing: f.facing,
        trip: f.trip ? f.trip.kind : null, style: f.trip && f.trip.style ? f.trip.style : null, carry: f.carry, limp: f.limp, pill: f.pill ? f.pill.text : null, alpha: f.alpha })),
      extras: () => extraFigs.map((e) => ({ kind: e.kind, x: e.x, y: e.y, done: e.done })),
      stats: () => lastStats,
      debug: () => ({ cam: { X: cam.X, Y: cam.Y, z: cam.z }, camera: getCamera(), W, H, bs, bsMax, perfDrop, gesture: gest ? gest.mode : null,
        jibs: layout && layout.jibAngles ? layout.jibAngles.slice() : [], canvas: { w: canvas.width, h: canvas.height },
        ground: { k: gc.k, w: gc.w, h: gc.h, renders: gc.renders, key: gc.key }, drawn: lastStats.drawn, reduced, insets: Object.assign({}, insets),
        figures: figs.size, fx: fx.length, confetti: confetti.length, frames, layout: layout ? layout.list.map((d) => d.kind + ':' + d.id) : [] }),
      _int: { toScreen, toGround, depthSort, bfsFrom, pathTo, walkable, startPinch, movePinch, pointers, applyBs, renderGround, gc,
        profile: (clock) => { profClock = clock || null; }, profLast: () => profLast, dbg,
        sit: (id) => { const f = figs.get(id); if (!f) return false; f.pose = 'sit'; f.seatTile = [Math.floor(f.x), Math.floor(f.y) + 1]; return true; },
        parkFig: (id, x, y, idle) => { const f = figs.get(id); if (!f) return false; f.path = null; f.trip = null; f.mode = 'walker'; f.visible = true; f.alpha = 1; f.fadeTo = null; f.x = x; f.y = y; f.idle = idle == null ? 1e9 : idle; f.pose = 'stand'; return true; } },
    };
    return api;
  }

  return { create, fitZoom, project, unproject, groundK, Z_MIN, Z_MAX, K_MAX, fmtClock };
});
