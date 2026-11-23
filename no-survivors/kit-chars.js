// NO SURVIVORS: Keep Them Dancing. Character kit (adds to NS.kit): a 3D-projected FK rig, poses, the four survivors,
// zombies (and the same crowd as ordinary people), the Groupie, the Roadie, portraits, cached hordes and the ironbow
// thermal palette. All art is procedural, deterministic (no Math.random / clocks) and pure per frame. Caches are built
// lazily through NS.makeCanvas (tags 'chars' and 'horde'). No ctx.filter / letterSpacing / shadowBlur.
//
// PUBLIC API (coordinates are in the CURRENT user space of the ctx you pass; anchors come back in that same space,
// so pass the ctx on to S.anchor(who, x, y, ctx)). Angles: radians, canvas convention (0 = +x, PI/2 = down).
//
// kit.CAST.vex|granny|tiny|noodle = { name, role, color, height, prop } (+ granny.gun = 'GERALD')
//   height relative to an average adult (vex 1.08, granny 0.8 (+ a tall beehive), tiny 1.35, noodle 0.95).
//   kit.CAST.vex.sign(ctx, x, y, w, color?, alpha?) draws Vex's signature ("Vex" scrawl + star), top-left at (x, y),
//   w wide (about 0.6 w tall). The same scrawl everywhere: VEX WAS HERE, the cast autographs, the contract, the headshot.
//
// kit.poses.*  -> plain pose objects. Phases are in cycles (e.g. run(S.beat * 0.5)); k = 0..1 through an action.
//   idle(t) stand() walk(ph) run(ph) shoot(recoil, aim) reload(k) guitar(ph) bass(ph) drums(ph, seated = 1) sing(ph)
//   headbang(ph, amount) jump(k) climb(ph) hang(ph) crouch(k) point(k) pull(k) throw(k) fall(k) applaud(ph) reach(ph)
//   wave(ph) introVex() introGranny() introTiny() introNoodle()
//   gags: drive(t) sit(k) cradle(t) preen(k) pulse(k) shake(ph) (pill bottle) knock(ph) plug(k) thumbsUp(k) selfie(k)
//   conduct(ph) smash(k) lift(k) climbSolo(ph) (climb + guitar) climbWave(ph) lookUp(k)
//   crowd/specials: shamble(ph) zrun(ph) zstand(ph) phone(ph) stomp(ph) surf(k) down(k) micCheck(k)
//   For guitar/bass/drums/sing pass ph = S.beat (one bob per beat, strums in 8ths). shoot: recoil 0..1, aim 0 = level,
//   negative = up. Poses are editable: Object.assign(kit.poses.run(p), { expr: 'shout', turn: 0.8 }). Keys: turn
//   (0 profile .. 1 facing camera; idle 0.6), hyaw (extra head yaw toward camera, rad), head / neck (pitch, + = down),
//   torso / chest (lean, + = forward), tilt (side lean), rot (whole body), air (lift in units), hx (x shift),
//   mouth 0..1, expr, wind 0..1 (coat, scarf, hair trail), flap (phase of the flapping), use ('gun' | 'instrument' |
//   'sing' | 'drum' | 'hero' | 'preen'), hold (gun: 'aim' | 'shoulder' | 'hip' | 'reload' | 'carry'), prop (pose
//   prop), fhand/nhand ('relax' | 'fist' | 'grip' | 'point' | 'horns' | 'peace' | 'thumb' | 'open' | 'claw' | 'flat'),
//   free 1 (no ground contact: hang/climb, use pin), gnd 1 (any body part may touch the ground: falls), seat + seatK
//   (seatK 1 puts the hip at seat * leg length above the feet line). Arms: f = far arm, n = near arm.
// kit.blendPose(a, b, k) -> pose (numbers lerp; strings switch at k = 0.5)
//
// kit.survivor(ctx, who, pose, opts) -> anchors        who: 'vex' | 'granny' | 'tiny' | 'noodle'
//   opts: x, y (feet on the ground line), s (scale; 1 = 300 units for an average adult), face (1 right, -1 left),
//     rim { color, dir (direction the light comes FROM: 0 = from +x, -PI/2 = from above), k 0..2 } (default cool
//     blue from upper left), rim2 { color, dir, k } (optional second rim, e.g. a cold fill), lit 0..1 (0 = near-black
//     silhouette with rim, 1 = fully lit with mid-tones and face detail; faces appear from ~0.15), accent 0..1 (glow of
//     the signature accent, default 0.5), t (seconds: breathing, hair, coat, scarf, glints), alpha, glow (false: no
//     additive glows), prop ('shotgun' | 'guitar' | 'bass' | 'megaphone' | 'micstand' | 'bats' | 'wrench' |
//     'flashlight' | 'phone' | 'pills' | 'cymbal' | 'mic' | 'none'; default per character and pose.use: vex megaphone
//     (micstand for instrument/gun poses), granny shotgun (guitar for instrument/sing), tiny bats, noodle wrench (bass
//     for instrument)), style ('normal' | 'thermal-cold' | 'thermal-warm' | 'skeleton'), expression ('neutral' |
//     'shout' | 'scared' | 'smug' | 'deadpan'; defaults vex smug, granny deadpan, tiny neutral, noodle scared; or
//     pose.expr), pin ('feet' default | 'hands': (x, y) = the higher hand, for ladders | 'hip' | 'head'),
//     lamp 0..1 (Noodle's headlamp, default 1), zap 0..1 (Noodle: hood down, hair straight up, lamp flicker),
//     smoke 0..1 (Vex: singed smoking pompadour with embers), lanyard true (Vex wears the ALL ACCESS lanyard),
//     kitOnBack true (Tiny: the drum kit strapped to his back).
//   anchors: { head:[x,y] (top of hair/hat: the speech-bubble target), headC, mouth, eyes:[[x,y],[x,y]],
//     hands:[[far],[near]], feet:[x,y], hip, bbox:[x,y,w,h], muzzle:[x,y,angle] (shotgun), lamp:[x,y,angle,toward]
//     (Noodle; toward 0..1 = how much the beam points at the camera, for lens flares), flash:[x,y,angle]
//     (flashlight), phone:[x,y] (screen centre), prop:[x,y,0] (bell / headstock / tip of the held prop) }
// kit.rig(who, pose, opts) -> the same anchors without drawing (no eyes). who: a survivor, 'zombie' (opts.seed,
//   opts.style), 'groupie', 'roadie', or a def object. kit.rig.defs (proportions), kit.rig.solve(def, pose), kit.rig.ik.
//
// kit.zombie(ctx, seed, pose, opts) -> anchors + wrist:[x,y]   (pose null = shamble at opts.t)
//   seed % 12 picks the outfit: 0 punk, 1 metalhead, 2 office, 3 mascot costume, 4 clown, 5 cheerleader, 6 security
//   guard, 7 NO SURVIVORS tour shirt, 8 hoodie, 9 bathrobe, 10 jogger, 11 rocker; the rest of the seed varies build,
//   height, hunch, colours and comic bits (a lost shoe, a bandage). Pale eyes; EVERY one wears a UV wristband.
//   opts as survivor plus style 'normal' | 'human' (no green rim, no pallor: an ordinary fan, same clothes) |
//   'thermal-warm' | 'thermal-cold', wristband 0..1 (UV glow, default 1), eyes 0..1 (pale eye glow, default 0.4),
//   prop 'phone' (with kit.poses.phone(): returns phone:[x,y]; cold white, never UV). Default rim: NS.C.zombieRim
//   (human: warm white).
// kit.groupie(ctx, state, opts) -> anchors + cast:[x,y] (the autograph cast) + wrist (its UV band)
//   state { sob 0..1, startle 0..1 (head snaps up, impossibly wide shriek, white eye-shine), spring 0..1 (springs up
//   off the crate holding the signed cast out at the lens), t } (a pose object is also accepted).
//   opts as survivor + crate (false: no crate), shine 0..1 (eye-shine multiplier). Never UV eyes.
// kit.roadie(ctx, pose, opts) -> anchors + wrist (about 3x height: s = 0.33 makes him ~300 units tall)
//   poses: kit.poses.stomp(ph), surf(k) (lying on his back; use pin: 'hip'; face -1 = head toward +x), down(k)
//   (k = 1 flat on his back), micCheck(k) (mic at the mouth, k = mouth). opts.breath = phase 0..1 of a fogging
//   breath puff (pass a sawtooth per word), opts.dazed = X eyes. Amp stack taped on, ALL ACCESS lanyard, UV band.
// kit.portrait(ctx, who, x, y, size, opts) draws a size x size head-and-shoulders picture, top-left at (x, y).
//   opts { style 'photo' | 'xerox' (photocopied poster) | 'silhouette', age 'now' | '1987' (a faded 1987 print; faces
//   identical in both years), signed (Vex's signature across it), bg (false: transparent) }. Cached (per who, style,
//   age, size bucket 96/192/384/640 device px); returns the cached canvas.
//
// kit.horde(ctx, S, opts) -> { drawn, phones: [[x, y, scale], ...] }   (sprite crowd, back to front, fast)
//   opts { seed, count, area { x0, x1, yFar, yNear, sFar, sNear } (feet y and survivor-style s at the far / near edge)
//     or place(i, rnd) -> { x, y, s, face, d (0 far .. 1 near, for fog) }, density (default 1.25; lower = more
//     figures in the near rows), mode 'shamble' | 'run' | 'headbang' | 'applaud' | 'stand' | 'climb' | 'phone',
//     view 'front' | 'side' (default: side for shamble/run, else front; use view 'front' + run for a charge at the
//     camera), rate (cycles per beat; defaults headbang/applaud 1, run 0.75, shamble/climb 0.5, stand 0.25),
//     sync 0..1 (1 = everyone in phase), drift [dx, dy] px/s (wraps inside the area; dy moves through depth; facing
//     follows dx), light { color, dir } (keep it constant within a shot: each colour + 45-degree direction bucket
//     is its own cache), fog { color, k } (far figures fade to the fog colour), wristGlow 0..1 (default 1, thermal 0),
//     style 'normal' | 'human' | 'thermal-warm' | 'thermal-cold', lit 0..1 (quantised; human default 0.25),
//     t (default S.t; the beat is t / NS.BEAT), lod (default S.lod || 1; figure i drawn if NS.hash(i, seed + 3) < lod),
//     freeze 0..1 (motion stops at freezeAt (default t) and heads snap toward lookAt [x, y] in a quick ripple),
//     phones 0..1 (fraction holding up lit phones; their points come back in .phones), face (force 1 | -1), alpha }
//   Sprites: <= 128 px tall x NS.cacheScale, 12 variants x 8 frames per atlas, built on first use (~15-20 ms each),
//   LRU-capped at 38 MB (tag 'horde'). One composite switch per pass (bodies source-over, then one 'lighter' pass for
//   all wristband / phone glows from one cached sprite each). For figures taller than ~140 px use kit.zombie.
//   kit.horde.warm(modes[], { style, light, lit, view, look }) builds ahead (call from a shot's warm()),
//   kit.horde.release() frees every atlas, kit.horde.mem() -> bytes in use.
// kit.ironbow(v) -> CSS colour for v 0..1 on the ironbow palette (black, indigo, purple, red, orange, yellow, white).
(function () {
  'use strict';
  const NS = window.NS;
  if (!NS) return;
  const kit = (NS.kit = NS.kit || {});
  const TAU = Math.PI * 2, PI = Math.PI;
  const { sin, cos, abs, max, min, hypot, atan2, sqrt, pow, floor } = Math;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const bump = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
  const fract = (x) => x - floor(x);
  const H01 = (n, s) => NS.hash(n, s);

  // ------------------------------------------------------------------------------------------ colour
  const HEX = new Map();
  function hex(h) {
    let c = HEX.get(h);
    if (c) return c;
    const s0 = String(h).trim();
    if (s0.startsWith('rgb')) {
      const n = s0.replace(/[^\d.,]/g, '').split(',').map(Number);
      c = [n[0] || 0, n[1] || 0, n[2] || 0];
    } else {
      let s = s0[0] === '#' ? s0.slice(1) : s0;
      if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
      const n = parseInt(s.slice(0, 6), 16);
      c = isNaN(n) ? [128, 128, 128] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    HEX.set(h, c);
    return c;
  }
  const col = (c) => (Array.isArray(c) ? c : hex(c));
  const mix = (a, b, k) => { a = col(a); b = col(b); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; };
  const b8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  const css = (c, a) => {
    c = col(c);
    return a == null || a >= 1 ? 'rgb(' + b8(c[0]) + ',' + b8(c[1]) + ',' + b8(c[2]) + ')'
      : 'rgba(' + b8(c[0]) + ',' + b8(c[1]) + ',' + b8(c[2]) + ',' + (a <= 0 ? 0 : a.toFixed(3)) + ')';
  };
  const NIGHT = [7, 9, 15], WHITE = [255, 255, 255], INK = [14, 10, 14];
  const PAL = (k, d) => (NS.C && NS.C[k]) || d;

  // ------------------------------------------------------------------------------------------ ironbow
  const IRON_STOPS = [
    [0.00, [0, 0, 6]], [0.10, [14, 12, 78]], [0.22, [46, 16, 132]], [0.34, [104, 16, 142]],
    [0.46, [172, 26, 104]], [0.57, [216, 54, 44]], [0.68, [243, 110, 18]], [0.79, [255, 170, 28]],
    [0.89, [255, 228, 100]], [1.00, [255, 255, 250]]];
  const IRON = [], IRON_CSS = [];
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let j = 0;
    while (j < IRON_STOPS.length - 2 && v > IRON_STOPS[j + 1][0]) j++;
    const a = IRON_STOPS[j], b = IRON_STOPS[j + 1];
    const c = mix(a[1], b[1], clamp((v - a[0]) / (b[0] - a[0])));
    IRON.push(c); IRON_CSS.push(css(c));
  }
  const ironI = (v) => clamp(Math.round((+v || 0) * 255), 0, 255);
  const ironArr = (v) => IRON[ironI(v)];
  const ironbow = (v) => IRON_CSS[ironI(v)];

  // ------------------------------------------------------------------------------------------ glow sprites
  const GLOWS = new Map();
  function glowSprite(color, kind) {
    const key = color + '|' + (kind || 'soft');
    let c = GLOWS.get(key);
    if (c) return c;
    const n = 64;
    c = NS.makeCanvas(n, n, 'chars');
    const g = c.getContext('2d'), cc = col(color);
    const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    if (kind === 'hot') {
      grd.addColorStop(0, css(mix(cc, WHITE, 0.8)));
      grd.addColorStop(0.1, css(mix(cc, WHITE, 0.35), 0.95));
      grd.addColorStop(0.32, css(cc, 0.38));
      grd.addColorStop(0.65, css(cc, 0.08));
      grd.addColorStop(1, css(cc, 0));
    } else if (kind === 'puff') {
      grd.addColorStop(0, css(cc, 0.55));
      grd.addColorStop(0.5, css(cc, 0.3));
      grd.addColorStop(0.8, css(cc, 0.08));
      grd.addColorStop(1, css(cc, 0));
    } else {
      grd.addColorStop(0, css(cc, 0.9));
      grd.addColorStop(0.22, css(cc, 0.45));
      grd.addColorStop(0.55, css(cc, 0.12));
      grd.addColorStop(1, css(cc, 0));
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, n, n);
    GLOWS.set(key, c);
    return c;
  }

  // ------------------------------------------------------------------------------------------ geometry
  function circle(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, max(0.01, r), 0, TAU); p.closePath(); }
  function ell(p, x, y, rx, ry, rot) {
    rx = max(0.01, rx); ry = max(0.01, ry);
    p.moveTo(x + rx * cos(rot), y + rx * sin(rot));
    p.ellipse(x, y, rx, ry, rot, 0, TAU);
    p.closePath();
  }
  // Tapered capsule: circles (a, ar) and (b, br) joined by their outer tangents.
  function capsule(p, ax, ay, ar, bx, by, br) {
    const dx = bx - ax, dy = by - ay, d = hypot(dx, dy);
    if (d <= abs(ar - br) + 0.01) { if (ar >= br) circle(p, ax, ay, ar); else circle(p, bx, by, br); return; }
    const th = atan2(dy, dx), a = Math.acos(clamp((ar - br) / d, -1, 1));
    p.moveTo(ax + ar * cos(th + a), ay + ar * sin(th + a));
    p.arc(ax, ay, max(0.01, ar), th + a, th - a + TAU);
    p.arc(bx, by, max(0.01, br), th - a, th + a);
    p.closePath();
  }
  const cap = (p, A, ar, B, br) => capsule(p, A[0], A[1], ar, B[0], B[1], br);
  // Smooth closed Catmull-Rom curve through flat [x0, y0, x1, y1, ...] (repeat a point for a corner).
  function smoothClosed(p, a) {
    const n = a.length >> 1;
    for (let i = 0; i < n; i++) {
      const i0 = (i - 1 + n) % n, i2 = (i + 1) % n, i3 = (i + 2) % n;
      const x1 = a[2 * i], y1 = a[2 * i + 1], x2 = a[2 * i2], y2 = a[2 * i2 + 1];
      if (i === 0) p.moveTo(x1, y1);
      p.bezierCurveTo(x1 + (x2 - a[2 * i0]) / 6, y1 + (y2 - a[2 * i0 + 1]) / 6,
        x2 - (a[2 * i3] - x1) / 6, y2 - (a[2 * i3 + 1] - y1) / 6, x2, y2);
    }
    p.closePath();
  }
  function smoothOpen(p, a, move = true) {
    const n = a.length >> 1;
    if (move) p.moveTo(a[0], a[1]);
    for (let i = 0; i < n - 1; i++) {
      const i0 = max(0, i - 1), i2 = i + 1, i3 = min(n - 1, i + 2);
      const x1 = a[2 * i], y1 = a[2 * i + 1], x2 = a[2 * i2], y2 = a[2 * i2 + 1];
      p.bezierCurveTo(x1 + (x2 - a[2 * i0]) / 6, y1 + (y2 - a[2 * i0 + 1]) / 6,
        x2 - (a[2 * i3] - x1) / 6, y2 - (a[2 * i3 + 1] - y1) / 6, x2, y2);
    }
  }
  function polyC(p, a) { p.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]); p.closePath(); }
  // A tube along a polyline with a radius per point (tips taper when the radius is 0).
  function tube(p, pts, rads) {
    const n = pts.length >> 1, Lf = [], Rt = [];
    for (let i = 0; i < n; i++) {
      const a = max(0, i - 1), b = min(n - 1, i + 1);
      let tx = pts[2 * b] - pts[2 * a], ty = pts[2 * b + 1] - pts[2 * a + 1];
      const l = hypot(tx, ty) || 1; tx /= l; ty /= l;
      const r = rads[i];
      Lf.push(pts[2 * i] - ty * r, pts[2 * i + 1] + tx * r);
      Rt.push(pts[2 * i] + ty * r, pts[2 * i + 1] - tx * r);
    }
    const out = Lf.slice();
    for (let i = n - 1; i >= 0; i--) out.push(Rt[2 * i], Rt[2 * i + 1]);
    smoothClosed(p, out);
  }
  const add = (A, B, k = 1) => [A[0] + B[0] * k, A[1] + B[1] * k];
  const sub = (A, B) => [A[0] - B[0], A[1] - B[1]];
  const lerp2 = (A, B, k) => [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k];
  const unit = (v) => { const l = hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const perpF = (u) => [-u[1], u[0]];  // for an up-pointing spine vector: the forward (+x) side
  const dirA = (a) => [cos(a), sin(a)];
  const angOf = (A, B) => atan2(B[1] - A[1], B[0] - A[0]);
  const rotV = (v, a) => [v[0] * cos(a) - v[1] * sin(a), v[0] * sin(a) + v[1] * cos(a)];

  // ------------------------------------------------------------------------------------------ materials + paint
  // m = { c: [r,g,b], heat (thermal 0..1), dk (brightness kept in the dark, default 0.1), acc (accent), glow
  //       (self-lit flat colour), rk (rim strength multiplier) }
  const M = (c, o) => Object.assign({ c: col(c), heat: 0.6 }, o || {});
  const DEFAULT_RIM = { color: '#8fb6ff', dir: -2.3, k: 1 };
  // the same material with a quieter rim, for parts that sit inside the silhouette (shirt fronts, coat flaps)
  const inner = (m) => m.inner || (m.inner = Object.assign({}, m, { rk: (m.rk == null ? 1 : m.rk) * 0.42, inner: null }));

  function mkR(ctx, o, s, face) {
    const T = ctx.getTransform();
    const cs = sqrt(abs(T.a * T.d - T.b * T.c)) || 1;
    const ppu = max(1e-4, abs(s) * cs);
    const rim = o.rim || DEFAULT_RIM;
    const dir = rim.dir == null ? DEFAULT_RIM.dir : +rim.dir;
    const style = o.style || 'normal';
    const lit = clamp(o.lit == null ? 0 : +o.lit);
    const R = {
      ctx, style, lit, face, s, ppu, o,
      k: rim.k == null ? 1 : clamp(+rim.k, 0, 2),
      rc: col(rim.color || DEFAULT_RIM.color),
      L: [cos(dir) * face, sin(dir)],
      w1: o.thinRim ? max(0.9, 0.45 / ppu) : max(1.3, 0.5 / ppu),
      w2: o.thinRim ? lerp(max(2, 0.95 / ppu), max(5, 1.6 / ppu), lit) : lerp(max(4.4, 0.95 / ppu), max(10, 2.2 / ppu), lit),
      wS: max(0.5, 8 * lit),
      tw: max(2.4, 1.5 / ppu),
      t: +o.t || 0,
      accent: clamp(o.accent == null ? 0.5 : +o.accent),
      thermal: style === 'thermal-warm' || style === 'thermal-cold',
      skel: style === 'skeleton',
      glows: [],
    };
    R.da = R.thermal ? 0 : sstep(0.03, 0.5, lit);
    R.hot = mix(R.rc, WHITE, 0.4);
    if (o.rim2 && !R.thermal) {
      const r2 = o.rim2, d2 = r2.dir == null ? dir + PI : +r2.dir;
      R.rim2 = { c: col(r2.color || '#4a6aa8'), L: [cos(d2) * face, sin(d2)], k: r2.k == null ? 0.6 : +r2.k };
    }
    return R;
  }

  function baseColor(R, m) {
    const dk = m.dk == null ? 0.1 : m.dk;
    let b = mix(NIGHT, m.c, dk + (1 - dk) * R.lit);
    if (m.acc && R.accent > 0) b = mix(b, m.c, R.accent * 0.32 * (1 - R.lit));
    return b;
  }

  function paint(R, path, m, rule) {
    const ctx = R.ctx;
    rule = rule || 'nonzero';
    if (R.thermal) { paintThermal(R, path, m, rule); return; }
    if (m.glow) { ctx.fillStyle = css(m.c); ctx.fill(path, rule); return; }
    const lit = R.lit, k = clamp(R.k * (m.rk == null ? 1 : m.rk), 0, 1.6);
    const base = baseColor(R, m);
    const rimC = m.acc ? mix(R.rc, m.c, 0.5) : R.rc;
    const hot = mix(base, mix(rimC, WHITE, 0.42), clamp(k * (1 - 0.4 * lit)));
    const mid = mix(mix(base, [base[0] * 1.25 + 12, base[1] * 1.25 + 12, base[2] * 1.25 + 12], lit), rimC, clamp(k * lerp(0.5, 0.16, lit) * lerp(0.6, 1, clamp(R.ppu / 0.5))));
    const Lx = R.L[0], Ly = R.L[1];
    ctx.fillStyle = css(hot);
    ctx.fill(path, rule);
    ctx.save();
    ctx.clip(path, rule);
    ctx.translate(-Lx * R.w1, -Ly * R.w1);
    ctx.fillStyle = css(mid);
    ctx.fill(path, rule);
    const d2 = R.w2 - R.w1;
    ctx.translate(-Lx * d2, -Ly * d2);
    if (lit > 0.04) {
      ctx.fillStyle = css(mix(base, [6, 6, 18], 0.45 * lit));
      ctx.fill(path, rule);
      const a = R.w2 + R.wS;
      ctx.translate(Lx * a, Ly * a);
      ctx.clip(path, rule);
      ctx.translate(-Lx * a, -Ly * a);
    }
    if (R.rim2) {
      ctx.fillStyle = css(mix(base, R.rim2.c, clamp(0.55 * R.rim2.k)));
      ctx.fill(path, rule);
      const a = R.w1 * 1.6, rx = R.rim2.L[0], ry = R.rim2.L[1];
      ctx.translate(-rx * a, -ry * a);
      ctx.clip(path, rule);
      ctx.translate(rx * a, ry * a);
    }
    ctx.fillStyle = css(base);
    ctx.fill(path, rule);
    ctx.restore();
  }

  // Erode a clip region by w (intersection of the shape shifted four ways): bands follow the union outline only.
  function erodeClip(ctx, path, rule, w) {
    ctx.translate(w, 0); ctx.clip(path, rule); ctx.translate(-2 * w, 0); ctx.clip(path, rule);
    ctx.translate(w, w); ctx.clip(path, rule); ctx.translate(0, -2 * w); ctx.clip(path, rule); ctx.translate(0, w);
  }
  function paintThermal(R, path, m, rule) {
    const ctx = R.ctx, h = m.heat == null ? 0.6 : m.heat;
    if (R.style === 'thermal-warm') {
      const core = h < 0.3 ? 0.13 + h * 1.1 : 0.6 + 0.4 * h;
      ctx.fillStyle = ironbow(max(0.12, core - 0.3));
      ctx.fill(path, rule);
      ctx.save();
      erodeClip(ctx, path, rule, R.tw * 0.7);
      ctx.fillStyle = ironbow(core - 0.13);
      ctx.fill(path, rule);
      erodeClip(ctx, path, rule, R.tw * 1.1);
      ctx.fillStyle = ironbow(core);
      ctx.fill(path, rule);
      ctx.restore();
    } else {
      ctx.fillStyle = ironbow(0.2 + 0.06 * h);
      ctx.fill(path, rule);
      ctx.save();
      erodeClip(ctx, path, rule, R.tw * 0.65);
      ctx.fillStyle = ironbow(0.095 + 0.045 * h);
      ctx.fill(path, rule);
      ctx.restore();
    }
  }

  // Lit-only details (faces, prints, seams): drawn with alpha R.da.
  function detail(R, fn) {
    if (R.da <= 0.01) return;
    const ctx = R.ctx;
    ctx.save();
    ctx.globalAlpha *= R.da;
    fn(ctx);
    ctx.restore();
  }
  function fillP(R, path, c, a) { const ctx = R.ctx; ctx.fillStyle = css(c, a); ctx.fill(path); }
  function strokeP(R, path, c, w, a) { const ctx = R.ctx; ctx.strokeStyle = css(c, a); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(path); }
  // Queue an additive glow (body space): drawn after the figure in one 'lighter' pass.
  function glowAt(R, x, y, r, color, a, kind) { if (a > 0.004 && r > 0) R.glows.push([x, y, r, color, a, kind]); }
  function flushGlows(R) {
    if (!R.glows.length || R.o.glow === false) return;
    const ctx = R.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of R.glows) {
      ctx.globalAlpha = clamp(g[4]) * (R.o.alpha == null ? 1 : R.o.alpha);
      ctx.drawImage(glowSprite(g[3], g[5]), g[0] - g[2], g[1] - g[2], g[2] * 2, g[2] * 2);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------------ rig
  // Proportions in units (s = 1: an average adult is about 300 units tall). Joints are solved in 3D (X forward,
  // Y down, Z toward the figure's far side) and projected with the yaw 'turn', so the same pose reads in profile
  // and facing the camera.
  function D(o) {
    return Object.assign({ legSplay: 0.035, armSplay: 0.08, toeOut: 0.3, shFwd: 0, shDrop: 6, headFwd: 0.1,
      headUp: 0.95, pelvis: 10, neckW: 6, armFollow: 1 }, o);
  }
  const DEFS = {
    vex: D({ ankle: 9, shin: 80, thigh: 82, foot: 30, hipW: 9.5, s1: 44, s2: 50, neck: 12, headR: 20.5, shW: 19.5,
      shDrop: 7, pelvis: 12, neckW: 6.5, upper: 60, fore: 56, hand: 6.6,
      r: { thigh: [12.4, 8.6], shin: [8.4, 6.4], upper: [10.6, 9], fore: [9.2, 7.8] },
      X: { hip: [11.5, 13.5, 15], waist: [11, 11.5, 13.5], chest: [15, 12.5, 17.5], sh: [11.5, 11, 21] } }),
    granny: D({ ankle: 7, shin: 52, thigh: 50, foot: 24, hipW: 8.5, s1: 30, s2: 34, neck: 6, headR: 20.5, shW: 15,
      shDrop: 5, pelvis: 10, neckW: 5.5, upper: 42, fore: 38, hand: 5.6, shFwd: 2,
      r: { thigh: [9, 6.2], shin: [5.6, 4.2], upper: [8.2, 7.2], fore: [7.2, 6.3] },
      X: { hip: [13, 16, 16], waist: [12.5, 12, 14], chest: [15.5, 12, 15.5], sh: [11, 11, 16] } }),
    tiny: D({ ankle: 12, shin: 84, thigh: 86, foot: 44, hipW: 21, s1: 72, s2: 72, neck: 6, headR: 30, shW: 47,
      shDrop: 12, pelvis: 18, neckW: 15, upper: 80, fore: 74, hand: 13, armSplay: 0.16, legSplay: 0.04,
      r: { thigh: [27, 19], shin: [18.5, 13.5], upper: [22, 17.5], fore: [17.5, 14.5] },
      X: { hip: [38, 32, 46], waist: [64, 32, 58], chest: [46, 31, 52], sh: [28, 28, 52] } }),
    noodle: D({ ankle: 8, shin: 72, thigh: 74, foot: 31, hipW: 8.5, s1: 40, s2: 44, neck: 9, headR: 21, shW: 17,
      shDrop: 6, pelvis: 28, neckW: 7, upper: 54, fore: 50, hand: 6.2,
      r: { thigh: [9.2, 6.8], shin: [6.6, 5], upper: [11.5, 10.5], fore: [10.5, 10] },
      X: { hip: [16, 16, 19], waist: [16, 15, 19], chest: [16, 14, 20], sh: [12.5, 12, 21] } }),
    zombie: D({ ankle: 9, shin: 74, thigh: 76, foot: 30, hipW: 10, s1: 42, s2: 46, neck: 10, headR: 19.5, shW: 18,
      pelvis: 12, neckW: 7, upper: 56, fore: 52, hand: 7.2,
      r: { thigh: [13, 9.4], shin: [9.4, 7.2], upper: [9.8, 8.4], fore: [8.4, 7.4] },
      X: { hip: [13, 15, 16.5], waist: [13, 13, 15.5], chest: [15, 13, 17.5], sh: [12, 11.5, 20] } }),
    groupie: D({ ankle: 8, shin: 70, thigh: 70, foot: 25, hipW: 9, s1: 38, s2: 42, neck: 10, headR: 19, shW: 15,
      upper: 50, fore: 46, hand: 5.8, neckW: 5.5,
      r: { thigh: [9.5, 6.6], shin: [6.4, 4.8], upper: [6.6, 5.6], fore: [5.8, 5] },
      X: { hip: [12, 14, 15], waist: [10, 10, 12], chest: [13, 10, 14], sh: [9, 9, 16] } }),
    roadie: D({ ankle: 26, shin: 205, thigh: 215, foot: 92, hipW: 36, s1: 165, s2: 185, neck: 16, headR: 56, shW: 118,
      shDrop: 30, pelvis: 40, neckW: 36, upper: 232, fore: 220, hand: 34, armSplay: 0.15, legSplay: 0.05,
      r: { thigh: [66, 48], shin: [46, 35], upper: [50, 40], fore: [41, 36] },
      X: { hip: [82, 82, 100], waist: [112, 80, 118], chest: [100, 78, 126], sh: [72, 72, 136] } }),
  };
  function scaleDef(d, h, w) {
    const o = Object.assign({}, d);
    for (const k of ['ankle', 'shin', 'thigh', 'foot', 's1', 's2', 'neck', 'upper', 'fore', 'pelvis', 'shDrop']) o[k] = d[k] * h;
    for (const k of ['hipW', 'shW', 'hand', 'neckW']) o[k] = d[k] * w;
    o.headR = d.headR * lerp(1, h, 0.4);
    o.r = {}; for (const k in d.r) o.r[k] = [d.r[k][0] * w, d.r[k][1] * w];
    o.X = {}; for (const k in d.X) o.X[k] = d.X[k].map((v) => v * w);
    return o;
  }

  const SIDES = ['f', 'n'];
  function solve(def, P) {
    const psi = clamp(P.turn == null ? 0.45 : P.turn, -0.4, 1.05) * 1.42, cP = cos(psi), sP = sin(psi);
    const J = { def, P, psi, cP, sP, pts: [], vecs: [] };
    const pt = (X, Y, Z) => { const q = [X * cP + Z * sP, Y, X * sP - Z * cP]; J.pts.push(q); return q; };
    J.leg = {};
    for (const sd of SIDES) {
      const sg = sd === 'f' ? 1 : -1;
      const a = P[sd + 'hip'] || 0, kn = P[sd + 'kn'] || 0, b = def.legSplay + (P[sd + 'hs'] || 0);
      const cb = cos(b), zb = sg * sin(b), hz = sg * def.hipW;
      const KX = sin(a) * cb * def.thigh, KY = cos(a) * cb * def.thigh, KZ = hz + zb * def.thigh;
      const a2 = a - kn;
      const AX = KX + sin(a2) * cb * def.shin, AY = KY + cos(a2) * cb * def.shin, AZ = KZ + zb * def.shin;
      const ft = P[sd + 'ft'] || 0, to = def.toeOut + (P[sd + 'to'] || 0);
      const fx = cos(ft), fy = sin(ft), dx = -sin(ft), dy = cos(ft), ct = cos(to), st = sg * sin(to);
      const F = [fx * ct * cP + fx * st * sP, fy], Dn = [dx * ct * cP + dx * st * sP, dy];
      J.vecs.push(F, Dn);
      const j = { sg, hip: pt(0, 0, hz), knee: pt(KX, KY, KZ), ankle: pt(AX, AY, AZ), F, Dn };
      j.z = (j.knee[2] + j.ankle[2]) / 2;
      J.leg[sd] = j;
    }
    const lean = P.torso || 0, tilt = P.tilt || 0, l2 = lean + (P.chest || 0), ct = cos(tilt), stl = sin(tilt);
    const M3 = [sin(lean) * def.s1 * ct, -cos(lean) * def.s1 * ct, stl * def.s1];
    const N3 = [M3[0] + sin(l2) * def.s2 * ct, M3[1] - cos(l2) * def.s2 * ct, M3[2] + stl * def.s2];
    J.hipC = pt(0, 0, 0); J.mid = pt(M3[0], M3[1], M3[2]); J.neckB = pt(N3[0], N3[1], N3[2]);
    J.lean = lean; J.lean2 = l2;
    J.arm = {};
    for (const sd of SIDES) {
      const sg = sd === 'f' ? 1 : -1;
      const SX = N3[0] - sin(l2) * def.shDrop + cos(l2) * def.shFwd,
        SY = N3[1] + cos(l2) * def.shDrop + sin(l2) * def.shFwd + sg * def.shW * stl, SZ = N3[2] + sg * def.shW * ct;
      const aU = (P[sd + 'sh'] || 0) + l2 * def.armFollow, bU = def.armSplay + (P[sd + 'as'] || 0);
      const cbu = cos(bU), zbu = sg * sin(bU);
      const EX = SX + sin(aU) * cbu * def.upper, EY = SY + cos(aU) * cbu * def.upper, EZ = SZ + zbu * def.upper;
      const aF = aU + (P[sd + 'el'] || 0), bF = bU + (P[sd + 'es'] || 0);
      const cbf = cos(bF), zbf = sg * sin(bF);
      const HX = EX + sin(aF) * cbf * def.fore, HY = EY + cos(aF) * cbf * def.fore, HZ = EZ + zbf * def.fore;
      const j = { sg, sh: pt(SX, SY, SZ), el: pt(EX, EY, EZ), ha: pt(HX, HY, HZ), wr: P[sd + 'wr'] || 0,
        shape: P[sd + 'hand'] || 'relax' };
      j.z = (j.el[2] + j.ha[2]) / 2;
      J.arm[sd] = j;
    }
    const l3 = l2 + (P.neck || 0);
    const NT = [N3[0] + sin(l3) * def.neck, N3[1] - cos(l3) * def.neck, N3[2] + stl * def.neck];
    const hp = l3 + (P.head || 0), hu = def.headUp * def.headR, hf = def.headFwd * def.headR;
    J.neckT = pt(NT[0], NT[1], NT[2]);
    J.headC = pt(NT[0] + hf * cos(hp) + hu * sin(hp), NT[1] + hf * sin(hp) - hu * cos(hp), NT[2] + stl * hu);
    J.hyaw = psi + (P.hyaw || 0);
    J.hpitch = hp;
    J.hroll = tilt * 0.5 + (P.hroll || 0);
    // whole-body rotation (falls, crowd-surfing) about the hip, in screen space
    const rot = P.rot || 0;
    J.rot = rot;
    if (rot) {
      const cr = cos(rot), sr = sin(rot);
      for (const q of J.pts) { const x = q[0], y = q[1]; q[0] = x * cr - y * sr; q[1] = x * sr + y * cr; }
      for (const v of J.vecs) { const x = v[0], y = v[1]; v[0] = x * cr - y * sr; v[1] = x * sr + y * cr; }
      J.hroll += rot;
    }
    const legLen = def.thigh + def.shin + def.ankle;
    let dy;
    if ((P.free || 0) > 0.5) dy = -legLen * 0.985;
    else {
      let low = -1e9;
      for (const sd of SIDES) {
        const j = J.leg[sd];
        for (const fd of FOOT_PROBE) {
          const y = j.ankle[1] + fd[0] * def.foot * j.F[1] + fd[1] * def.ankle * j.Dn[1];
          if (y > low) low = y;
        }
      }
      if ((P.gnd || 0) > 0.5) {
        const rr = def.r;
        for (const sd of SIDES) {
          low = max(low, J.leg[sd].knee[1] + rr.thigh[1], J.arm[sd].ha[1] + def.hand, J.arm[sd].el[1] + rr.upper[1]);
        }
        low = max(low, J.headC[1] + def.headR, J.hipC[1] + def.X.hip[1] * 0.8, J.mid[1] + def.X.waist[1], J.neckB[1] + def.X.sh[1]);
      }
      dy = -low;
      const sk = clamp(P.seatK == null ? ((P.seat || 0) > 0 ? 1 : 0) : P.seatK);
      if (sk > 0) dy = lerp(dy, -(P.seat || 0) * legLen, sk);
    }
    dy -= P.air || 0;
    const dx = P.hx || 0;
    for (const q of J.pts) { q[0] += dx; q[1] += dy; }
    return J;
  }
  const FOOT_PROBE = [[-0.25, 1], [0.78, 0.86], [0.3, 1.02]];

  // Two-bone IK in screen space: move the hand to T, elbow on the bend side (1 = elbow down/out).
  function ik(J, sd, T, bend) {
    const j = J.arm[sd], d = J.def, S = j.sh;
    const l1 = d.upper, l2 = d.fore, mx = (l1 + l2) * 0.995, mn = abs(l1 - l2) + 1;
    let dx = T[0] - S[0], dy = T[1] - S[1], dist = hypot(dx, dy) || 1e-6;
    let tx = T[0], ty = T[1];
    if (dist > mx) { tx = S[0] + dx / dist * mx; ty = S[1] + dy / dist * mx; dist = mx; }
    if (dist < mn) { tx = S[0] + dx / dist * mn; ty = S[1] + dy / dist * mn; dist = mn; }
    const a = Math.acos(clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1));
    const th = atan2(ty - S[1], tx - S[0]) + (bend == null ? 1 : bend) * a;
    j.el[0] = S[0] + cos(th) * l1; j.el[1] = S[1] + sin(th) * l1;
    j.ha[0] = tx; j.ha[1] = ty;
    j.ik = true;
  }

  // ------------------------------------------------------------------------------------------ poses
  const BASE = {
    turn: 0.45, hyaw: 0, hroll: 0, rot: 0, air: 0, hx: 0, gnd: 0, seat: 0, seatK: 0, free: 0,
    torso: 0.03, chest: 0, tilt: 0, neck: 0, head: 0,
    fsh: 0.1, fel: 0.22, fwr: 0, fas: 0, fes: 0,
    nsh: -0.06, nel: 0.18, nwr: 0, nas: 0, nes: 0,
    fhip: 0.05, fkn: 0.03, fft: 0, fhs: 0, fto: 0,
    nhip: -0.05, nkn: 0.03, nft: 0, nhs: 0, nto: 0,
    mouth: 0, wind: 0, flap: 0, hairFlip: 0,
    aim: 0, recoil: 0, fret: 0.5, strum: 0, gunOpen: 0, reload: 0, gtilt: 0,
    fhand: 'relax', nhand: 'relax',
  };
  const mk = (o) => Object.assign({}, BASE, o);
  const poses = {};
  poses.stand = () => mk({});
  poses.idle = (t = 0) => {
    const b = sin(t * 1.7), w = sin(t * 0.61 + 1);
    return mk({ turn: 0.6, torso: 0.035 + 0.012 * b, chest: 0.01 * b, head: -0.03 + 0.03 * w, neck: 0.012 * b, fsh: 0.12 + 0.02 * b,
      nsh: -0.07 - 0.02 * b, fel: 0.24 + 0.03 * w, nel: 0.2, hx: 1.2 * w, fhip: 0.08 + 0.012 * w, nhip: -0.07 + 0.012 * w,
      hroll: 0.025 * w });
  };
  poses.walk = (ph = 0) => {
    const a = TAU * ph;
    const leg = (q) => [0.04 + 0.38 * sin(q), 0.08 + 0.8 * pow(max(0, cos(q)), 1.5), 0.15 * max(0, -cos(q + 0.6))];
    const A = leg(a), B = leg(a + PI);
    return mk({ torso: 0.07, head: -0.05 + 0.02 * sin(2 * a), nhip: A[0], nkn: A[1], nft: A[2], fhip: B[0], fkn: B[1], fft: B[2],
      nsh: -0.36 * sin(a) + 0.02, nel: 0.3 + 0.12 * max(0, -sin(a)), fsh: 0.36 * sin(a) + 0.06, fel: 0.3 + 0.12 * max(0, sin(a)),
      wind: 0.25, flap: ph, tilt: 0.02 * sin(a) });
  };
  poses.run = (ph = 0) => {
    const a = TAU * ph;
    const leg = (q) => [0.16 + 0.8 * sin(q), 0.32 + 1.55 * pow(max(0, cos(q - 0.3)), 1.3) + 0.12 * max(0, -sin(q)),
      0.55 * max(0, -sin(q + 0.4)) - 0.1];
    const A = leg(a), B = leg(a + PI);
    return mk({ torso: 0.3, chest: 0.05, neck: -0.08, head: -0.22, nhip: A[0], nkn: A[1], nft: A[2], fhip: B[0], fkn: B[1], fft: B[2],
      air: 5 * abs(sin(2 * a + 0.9)),
      nsh: -0.95 * sin(a) + 0.15, nel: 1.5 - 0.25 * sin(a), fsh: 0.95 * sin(a) + 0.15, fel: 1.5 + 0.25 * sin(a),
      nhand: 'fist', fhand: 'fist', wind: 1, flap: ph, turn: 0.35 });
  };
  poses.shamble = (ph = 0) => {
    const a = TAU * ph;
    const A = [0.06 + 0.32 * sin(a), 0.12 + 0.7 * pow(max(0, cos(a)), 1.4), 0.1];
    const B = [0.02 + 0.18 * sin(a + PI), 0.22 + 0.25 * max(0, cos(a + PI)), 0.32];  // the dragging leg
    return mk({ torso: 0.26 + 0.07 * sin(2 * a), chest: 0.06, neck: 0.12, head: 0.22 + 0.06 * sin(a + 1), hroll: 0.16 * sin(a + 0.6),
      tilt: 0.07 * sin(a), nhip: A[0], nkn: A[1], nft: A[2], fhip: B[0], fkn: B[1], fft: B[2],
      fsh: 1.15 + 0.12 * sin(a), fel: 0.25, nsh: 0.95 + 0.15 * sin(a + 1.2), nel: 0.3, fhand: 'claw', nhand: 'claw',
      mouth: 0.35 + 0.15 * sin(a * 2), turn: 0.4, wind: 0.1, flap: ph });
  };
  poses.zrun = (ph = 0) => {
    const p = poses.run(ph), a = TAU * ph;
    return Object.assign(p, { torso: 0.42, head: -0.05, neck: 0.05, hroll: 0.12 * sin(a), fsh: 1.5 + 0.6 * sin(a), fel: 0.5,
      nsh: 1.2 - 0.6 * sin(a), nel: 0.6, fhand: 'claw', nhand: 'claw', mouth: 0.7, turn: 0.4 });
  };
  poses.zstand = (ph = 0) => {
    const a = TAU * ph;
    return mk({ torso: 0.14 + 0.03 * sin(a), chest: 0.04, neck: 0.1, head: 0.14 + 0.08 * sin(a + 1), hroll: 0.14 * sin(a + 0.4),
      tilt: 0.04 * sin(a), fsh: 0.25 + 0.06 * sin(a), fel: 0.35, nsh: 0.2 + 0.06 * sin(a + 2), nel: 0.3, fhip: 0.1, nhip: -0.08,
      fkn: 0.1, nkn: 0.12, mouth: 0.3, turn: 0.85, fhand: 'claw', nhand: 'relax' });
  };
  poses.shoot = (recoil = 0, aim = 0) => mk({ use: 'gun', hold: 'aim', aim, recoil: clamp(recoil),
    torso: 0.06 - 0.12 * recoil, chest: 0.05, neck: 0.08, head: 0.12, fhip: 0.36, fkn: 0.16, nhip: -0.3, nkn: 0.1, nft: 0.12,
    turn: 0.35, hx: -3 * recoil, nhand: 'grip', fhand: 'grip' });
  poses.reload = (k = 0) => mk({ use: 'gun', hold: 'reload', reload: clamp(k),
    gunOpen: sstep(0, 0.12, k) * (1 - sstep(0.8, 0.94, k)), torso: 0.14, chest: 0.06, neck: 0.12, head: 0.32,
    fhip: 0.22, nhip: -0.16, fkn: 0.1, nkn: 0.08, turn: 0.42, nhand: 'grip', fhand: 'grip' });
  poses.guitar = (ph = 0) => {
    const bob = pow(0.5 + 0.5 * cos(TAU * ph), 2);
    return mk({ use: 'instrument', strum: sin(TAU * ph * 2), fret: 0.42 + 0.14 * sin(TAU * ph / 8),
      torso: -0.07 + 0.06 * bob, chest: 0.03, neck: 0.04, head: 0.05 + 0.16 * bob, fhip: 0.32, fkn: 0.1 + 0.16 * bob,
      nhip: -0.26, nkn: 0.08 + 0.14 * bob, turn: 0.55, nhand: 'grip', fhand: 'grip', mouth: 0 });
  };
  poses.bass = (ph = 0) => {
    const bob = pow(0.5 + 0.5 * cos(TAU * ph), 2);
    return mk({ use: 'instrument', strum: sin(TAU * ph * 2), fret: 0.32 + 0.1 * sin(TAU * ph / 4), gtilt: -0.06,
      torso: 0.1 + 0.05 * bob, chest: 0.08, neck: 0.12, head: 0.2 + 0.1 * bob, fhip: 0.24, fkn: 0.14 + 0.12 * bob,
      nhip: -0.2, nkn: 0.14 + 0.12 * bob, turn: 0.5, nhand: 'grip', fhand: 'grip' });
  };
  poses.drums = (ph = 0, seated = 1) => {
    const a = TAU * ph, hn = pow(0.5 + 0.5 * cos(a), 1.5), hf = pow(0.5 + 0.5 * cos(a + PI), 1.5);
    const o = { use: 'drum', turn: 0.6, torso: 0.12 + 0.04 * hn, chest: 0.04, head: 0.1 + 0.14 * hn, neck: 0.04,
      nsh: 0.35 + 1.0 * (1 - hn), nel: 0.35 + 1.0 * (1 - hn), nwr: -0.4 + 0.5 * hn, fsh: 0.35 + 1.0 * (1 - hf),
      fel: 0.35 + 1.0 * (1 - hf), fwr: -0.4 + 0.5 * hf, nas: 0.1, fas: 0.1, nhand: 'grip', fhand: 'grip' };
    if (seated) Object.assign(o, { seat: 0.5, fhip: 1.32, fkn: 1.42, nhip: 1.38, nkn: 1.5 - 0.1 * hn, nft: -0.15 + 0.25 * hn, fft: -0.1 });
    else Object.assign(o, { fhip: 0.3, fkn: 0.3 + 0.1 * hn, nhip: -0.22, nkn: 0.25 + 0.1 * hn, torso: 0.22 });
    return mk(o);
  };
  poses.sing = (ph = 0) => {
    const a = TAU * ph;
    return mk({ use: 'sing', expr: 'shout', aim: -0.2 - 0.06 * sin(a * 0.5), mouth: 0.55 + 0.45 * abs(sin(a)),
      torso: -0.1 + 0.03 * sin(a), chest: -0.06, head: -0.24, neck: -0.05, fsh: 1.85 + 0.18 * sin(a * 0.5), fel: 0.22, fas: 0.2,
      fhand: 'open', fhip: 0.32, fkn: 0.06, nhip: -0.26, nkn: 0.05, turn: 0.5, nhand: 'grip', wind: 0.15, flap: ph });
  };
  poses.headbang = (ph = 0, amt = 1) => {
    const a = TAU * ph, bang = pow(0.5 + 0.5 * cos(a), 1.6);
    return mk({ torso: 0.06 + amt * 0.32 * bang, chest: amt * 0.1 * bang, neck: amt * 0.25 * bang - 0.1 * amt,
      head: -0.2 * amt + amt * 0.58 * bang, fkn: 0.1 + 0.16 * bang * amt, nkn: 0.1 + 0.16 * bang * amt, fhip: 0.16, nhip: -0.14,
      nsh: 2.5 - 0.4 * bang * amt, nel: 0.5, nas: 0.15, nhand: 'horns', fsh: 0.3 + 0.25 * bang, fel: 0.7, fhand: 'fist',
      hairFlip: bang * amt, mouth: 0.35 * bang, turn: 0.62 });
  };
  poses.jump = (k = 0.5) => {
    const crouch = bump(-0.01, 0.16, 0.2, 0.3, k) + 0.8 * bump(0.8, 0.9, 0.96, 1.01, k);
    const ak = clamp((k - 0.24) / 0.58), air = sin(PI * ak) * 95, tuck = sin(PI * ak);
    const up = sstep(0.18, 0.38, k) * (1 - 0.6 * sstep(0.7, 0.95, k));
    return mk({ air, torso: 0.1 + 0.32 * crouch - 0.12 * tuck, head: -0.12 * tuck,
      fhip: 0.15 + 0.7 * crouch + 0.9 * tuck, fkn: 0.1 + 1.4 * crouch + 1.5 * tuck,
      nhip: -0.05 + 0.5 * crouch + 0.6 * tuck, nkn: 0.1 + 1.4 * crouch + 1.7 * tuck, nft: 0.4 * tuck, fft: 0.3 * tuck,
      fsh: lerp(0.3, 2.7, up), fel: 0.3, nsh: lerp(-0.2, 2.5, up), nel: 0.35, wind: 0.7 * tuck, nhand: 'fist', fhand: 'open', expr: 'shout' });
  };
  poses.climb = (ph = 0) => {
    const s = sin(TAU * ph);
    return mk({ free: 1, turn: 0.22, torso: 0.02, head: -0.3, neck: -0.1, nsh: 2.85 + 0.22 * s, nel: 0.4 - 0.38 * s,
      fsh: 2.85 - 0.22 * s, fel: 0.4 + 0.38 * s, nhip: 0.6 + 0.45 * s, nkn: 0.95 + 0.6 * s, fhip: 0.6 - 0.45 * s,
      fkn: 0.95 - 0.6 * s, nft: 0.35, fft: 0.35, nhand: 'grip', fhand: 'grip' });
  };
  poses.hang = (ph = 0) => {
    const s = sin(TAU * ph);
    return mk({ free: 1, rot: 0.1 * s, turn: 0.4, torso: -0.02, head: -0.15, nsh: 3.0, nel: 0.1, fsh: 3.05, fel: 0.08,
      nhip: 0.2 + 0.2 * s, nkn: 0.35 + 0.1 * s, fhip: -0.05 - 0.15 * s, fkn: 0.25, nft: 0.5, fft: 0.5,
      nhand: 'grip', fhand: 'grip', wind: 0.3, flap: ph, expr: 'scared' });
  };
  poses.crouch = (k = 1) => mk({ fhip: 0.25 + 1.05 * k, fkn: 0.1 + 2.0 * k, nhip: -0.1 + 0.6 * k, nkn: 0.1 + 2.1 * k, nft: 0.25 * k,
    torso: 0.05 + 0.48 * k, chest: 0.05 * k, head: -0.3 * k, fsh: 0.1 + 0.8 * k, fel: 0.3 + 0.5 * k, nsh: 0.4 * k, nel: 0.4 + 0.5 * k });
  poses.point = (k = 1) => mk({ nsh: lerp(-0.05, 1.72, k), nel: lerp(0.2, 0.02, k), nhand: k > 0.3 ? 'point' : 'relax',
    torso: 0.04 + 0.06 * k, head: -0.05 * k, fsh: lerp(0.1, -0.35, k), fel: lerp(0.22, 1.9, k), fhand: 'fist', fhip: 0.18, nhip: -0.12 });
  poses.pull = (k = 0) => {
    const e = NS.ease ? NS.ease.outCubic(clamp(k)) : clamp(k);
    return mk({ torso: lerp(0.62, -0.18, e), chest: lerp(0.1, -0.08, e), head: lerp(0.15, -0.3, e), fhip: lerp(0.7, 0.4, e),
      fkn: lerp(1.2, 0.3, e), nhip: lerp(-0.2, -0.35, e), nkn: lerp(0.9, 0.15, e), nsh: lerp(0.55, -2.4, e),
      nel: lerp(0.15, 0.55, e), fsh: lerp(0.75, 1.2, e), fel: lerp(0.4, 0.2, e), nhand: 'grip', fhand: 'flat',
      turn: lerp(0.45, 0.3, e), mouth: 0.5 * e, expr: 'shout' });
  };
  poses.throw = (k = 0) => {
    const w = sstep(0, 0.45, k), r = sstep(0.45, 0.62, k), f = sstep(0.62, 1, k);
    return mk({ prop: k < 0.55 ? 'cymbal' : 'none', turn: lerp(lerp(0.45, 0.12, w), 0.75, r), torso: 0.05 + 0.12 * w - 0.05 * r + 0.15 * f,
      nsh: lerp(lerp(0.2, 0.55, w), 1.55, r) - 0.15 * f, nel: lerp(lerp(0.3, 2.45, w), 0.05, r), nwr: lerp(0.4, -0.3, r),
      fsh: lerp(0.3, 1.1, w) - 0.9 * r, fel: 0.4, fhip: lerp(0.1, 0.45, r), fkn: 0.15, nhip: -0.2 - 0.2 * r, nkn: 0.2,
      head: -0.05, nhand: r > 0.5 ? 'open' : 'grip', expr: k > 0.5 ? 'shout' : 'neutral' });
  };
  poses.fall = (k = 0) => {
    const e = NS.ease ? NS.ease.inQuad(clamp(k)) : clamp(k);
    return mk({ rot: -1.5 * e, gnd: 1, air: 20 * sin(PI * clamp(k)), torso: -0.1 * e, head: 0.3 * e, nsh: 2.4 * e + 0.2,
      nel: 0.4, fsh: 2.8 * e, fel: 0.6, fhip: 0.9 * e, fkn: 0.5 * e, nhip: 0.4 * e, nkn: 0.9 * e, nhand: 'open', fhand: 'open',
      mouth: 0.8, expr: 'scared', wind: 0.4 * e });
  };
  poses.applaud = (ph = 0) => {
    const o = 0.5 - 0.5 * cos(TAU * ph);
    return mk({ turn: 0.88, torso: 0.04, head: -0.06, fsh: 0.95, fel: 1.1, fas: -0.38 + 0.42 * o, fes: -0.35,
      nsh: 0.95, nel: 1.1, nas: -0.38 + 0.42 * o, nes: -0.35, fhand: 'flat', nhand: 'flat', fhip: 0.06, nhip: -0.06,
      mouth: 0.15 });
  };
  poses.reach = (ph = 0) => {
    const a = TAU * ph;
    return mk({ torso: 0.16 + 0.03 * sin(a), head: 0.05, neck: 0.1, fsh: 1.45 + 0.12 * sin(a), fel: 0.12, nsh: 1.32 + 0.12 * sin(a + 1.3),
      nel: 0.15, fhand: 'claw', nhand: 'claw', fhip: 0.2, nhip: -0.12, mouth: 0.4 });
  };
  poses.wave = (ph = 0) => mk({ nsh: 2.5, nel: 0.5 + 0.35 * sin(TAU * ph), nas: 0.25, nhand: 'open', head: -0.05, hyaw: 0.3 });
  poses.introVex = () => mk({ use: 'hero', megaA: 0.1, expr: 'smug', turn: 0.66, torso: -0.14, chest: -0.1, neck: -0.05, head: -0.26, hyaw: 0.32, hroll: -0.08,
    nsh: 2.55, nel: 0.35, nas: 0.62, nhand: 'grip', fsh: 1.5, fel: 0.2, fas: 0.55, fhand: 'point', fhip: 0.95, fkn: 1.25, fft: -0.1, fhs: 0.1,
    nhip: -0.22, nkn: 0.04, nhs: 0.08, wind: 0.75, flap: 0.3 });
  poses.introGranny = () => mk({ use: 'gun', hold: 'shoulder', expr: 'deadpan', turn: 0.66, torso: -0.02, chest: 0.06, head: 0.04,
    hroll: 0.1, hyaw: 0.18, fsh: 0.05, fas: 0.85, fel: 0.55, fes: -1.75, fhand: 'fist', fhip: 0.08, nhip: -0.05, nhand: 'grip' });
  poses.introTiny = () => mk({ use: 'hero', expr: 'neutral', turn: 0.72, torso: -0.05, head: -0.1, hyaw: 0.18, hroll: 0.06,
    nsh: 0.35, nel: 2.5, nas: 0.15, nwr: 0.9, nhand: 'grip', fsh: 1.75, fel: 0.95, fas: 0.55, fwr: -0.2, fhand: 'grip',
    fhip: 0.06, fhs: 0.14, nhip: -0.06, nhs: 0.14, mouth: 0.1 });
  poses.introNoodle = () => mk({ expr: 'scared', turn: 0.62, hyaw: 0.45, torso: 0.62, chest: 0.12, neck: -0.25, head: -0.45,
    nhip: -1.0, nkn: 1.3, nft: 0.6, fhip: 0.62, fkn: 0.45, nsh: 2.3, nel: 0.4, fsh: 1.5, fel: 0.25, fas: 0.4, nas: 0.3,
    nhand: 'open', fhand: 'open', air: 14, mouth: 0.9, wind: 0.5 });
  poses.drive = (t = 0) => mk({ seat: 0.5, turn: 0.35, torso: 0.1 + 0.01 * sin(t * 3), head: -0.08, fhip: 1.4, fkn: 1.4,
    nhip: 1.35, nkn: 1.3, nsh: 1.2, nel: 0.5, fsh: 1.28, fel: 0.45, nhand: 'grip', fhand: 'grip' });
  poses.sit = (k = 0) => mk({ seat: 0.48, fhip: 1.45, fkn: 1.5, nhip: 1.4, nkn: 1.45, torso: 0.08 + 0.05 * k, head: 0.05,
    nsh: 0.55, nel: 0.7, fsh: 0.6, fel: 0.7 });
  poses.cradle = (t = 0) => mk({ seat: 0.36, turn: 0.5, fhip: 2.0, fkn: 2.3, nhip: 1.95, nkn: 2.35, torso: 0.12 + 0.05 * sin(t * 2.2),
    head: 0.3, hroll: 0.12, nsh: 1.05, nel: 1.15, fsh: 1.1, fel: 1.2, nhand: 'flat', fhand: 'flat' });
  poses.preen = (k = 1) => mk({ use: 'preen', megaAbs: k > 0.5 ? PI + 0.15 : 0.1, expr: 'smug', turn: 0.5, nsh: lerp(0.2, 1.3, k), nel: lerp(0.3, 0.75, k),
    fsh: lerp(0.1, 2.7, k), fel: lerp(0.2, 2.3, k), fhand: 'flat', head: -0.12, hroll: -0.12, nhand: 'grip' });
  poses.pulse = (k = 0) => mk({ expr: 'scared', turn: 0.55, fsh: 0.95, fel: 1.0, fwr: -0.3, fhand: 'flat', nsh: 0.75, nel: 1.45,
    nhand: 'point', head: 0.42 + 0.05 * sin(k * TAU * 2), neck: 0.15, torso: 0.08 });
  poses.shake = (ph = 0) => mk({ prop: 'pills', expr: 'deadpan', nsh: 1.9 + 0.22 * sin(TAU * ph * 2), nel: 1.55 - 0.15 * sin(TAU * ph * 2),
    nhand: 'grip', fsh: -0.3, fel: 1.9, fhand: 'fist', head: 0.02 + 0.04 * sin(TAU * ph), hroll: 0.06 });
  poses.knock = (ph = 0) => { const h = pow(0.5 + 0.5 * cos(TAU * ph), 3); return mk({ nsh: 1.45 + 0.28 * (1 - h), nel: 0.6 + 0.5 * (1 - h),
    nhand: 'fist', torso: 0.06 + 0.03 * h, head: 0.05, expr: 'neutral' }); };
  poses.plug = (k = 0) => mk({ torso: 0.45 - 0.3 * k, head: 0.2 - 0.4 * k, fhip: 0.6, fkn: 0.9, nhip: -0.1, nkn: 0.7,
    nsh: lerp(0.85, 1.8, k), nel: lerp(0.3, 0.1, k), fsh: lerp(0.6, 1.6, k), fel: 0.2, fas: 0.8 * k, nas: 0.6 * k,
    nhand: k > 0.5 ? 'open' : 'grip', fhand: 'open', mouth: 0.8 * k, expr: k > 0.3 ? 'scared' : 'neutral' });
  poses.thumbsUp = (k = 1) => mk({ nsh: lerp(0, 1.1, k), nel: lerp(0.2, 1.5, k), nhand: 'thumb', head: 0.08, hroll: 0.15 * k, expr: 'scared', mouth: 0.15 });
  poses.selfie = (k = 1) => mk({ expr: 'smug', turn: lerp(0.5, 0.88, k), tilt: -0.12 * k, torso: 0.08 * k, hroll: -0.18 * k, hyaw: 0.2 * k,
    nsh: lerp(0, 2.3, k), nel: lerp(0.2, 1.0, k), nas: 0.3, nhand: 'peace', fsh: -0.3, fel: 1.9, fhand: 'fist' });
  poses.conduct = (ph = 0) => { const s = sin(TAU * ph); return mk({ use: 'drum', turn: 0.8, nsh: 1.9 + 0.55 * s, nel: 0.5 + 0.2 * s, nas: 0.25,
    fsh: 1.9 - 0.55 * s, fel: 0.5 - 0.2 * s, fas: 0.25, nhand: 'grip', fhand: 'grip', head: -0.1, torso: 0.02 + 0.04 * abs(s),
    fhip: 0.1, fhs: 0.1, nhs: 0.1, mouth: 0.3 }); };
  poses.smash = (k = 0) => { const e = clamp(k); return mk({ use: 'drum', turn: 0.4, nsh: lerp(3.3, 0.7, e * e), nel: lerp(0.9, 0.1, e),
    fsh: lerp(2.9, 0.5, e * e), fel: lerp(1.0, 0.3, e), torso: lerp(-0.12, 0.42, e), head: lerp(-0.25, 0.2, e), fhip: 0.35, fkn: 0.25,
    nhip: -0.25, nkn: 0.2, nhand: 'grip', fhand: 'grip', expr: 'shout', mouth: 0.6 * e }); };
  poses.lift = (k = 1) => { const e = clamp(k); return mk({ turn: 0.6, nsh: lerp(1.0, 2.9, e), nel: lerp(0.9, 0.55, e), fsh: lerp(1.0, 2.9, e),
    fel: lerp(0.9, 0.55, e), nas: 0.3, fas: 0.3, nhand: 'flat', fhand: 'flat', torso: lerp(0.35, -0.05, e), head: lerp(0.2, -0.25, e),
    fhip: lerp(0.6, 0.15, e), fkn: lerp(0.9, 0.1, e), nhip: lerp(0.2, -0.1, e), nkn: lerp(0.8, 0.1, e) }); };
  poses.climbSolo = (ph = 0) => { const p = poses.climb(ph * 0.25); return Object.assign(p, { use: 'instrument', nogrip: 'f', strum: sin(TAU * ph * 2),
    fret: 0.4, fsh: 2.9, fel: 0.2, turn: 0.45, head: -0.1 }); };
  poses.climbWave = (ph = 0) => { const p = poses.climb(0.25); return Object.assign(p, { nsh: 1.9, nel: 0.95 + 0.35 * sin(TAU * ph), nas: 0.35,
    nhand: 'open', fsh: 2.95, fel: 0.1, turn: 0.55, hyaw: 0.4, head: 0.05, expr: 'smug' }); };
  poses.lookUp = (k = 1) => mk({ head: -0.7 * k, neck: -0.25 * k, hyaw: 0.6 * k, torso: 0.02 - 0.06 * k });
  poses.stomp = (ph = 0) => {
    const a = TAU * ph;
    const leg = (q) => [0.05 + 0.5 * sin(q), 0.1 + 1.1 * pow(max(0, cos(q - 0.2)), 1.6), 0.1];
    const A = leg(a), B = leg(a + PI);
    return mk({ torso: 0.5 + 0.06 * sin(2 * a), chest: 0.12, neck: -0.2, head: -0.25, tilt: 0.06 * sin(a), hroll: -0.04 * sin(a),
      nhip: A[0], nkn: A[1], nft: A[2], fhip: B[0], fkn: B[1], fft: B[2], fsh: 0.1 + 0.35 * sin(a), fel: 0.35,
      nsh: 0.1 - 0.35 * sin(a), nel: 0.35, fhand: 'fist', nhand: 'fist', turn: 0.55, mouth: 0.3, flap: ph });
  };
  poses.surf = (k = 0) => { const s = sin(TAU * k * 2); return mk({ free: 1, rot: -PI / 2 + 0.06 * s, turn: 0.75, torso: 0, head: -0.25,
    fsh: 2.0 + 0.3 * s, fel: 0.3, fas: 0.9, nsh: 2.1 - 0.3 * s, nel: 0.3, nas: 0.9, fhip: 0.45, fkn: 0.4, fhs: 0.3, nhip: 0.35,
    nkn: 0.5, nhs: 0.3, fhand: 'open', nhand: 'horns', mouth: 0.6, expr: 'shout' }); };
  poses.down = (k = 0) => { const e = NS.ease ? NS.ease.inQuad(clamp(k)) : clamp(k); return mk({ rot: -1.52 * e, gnd: 1, torso: 0.4 * (1 - e),
    head: 0.15, nsh: 0.4 + 2.2 * e, nel: 0.5, fsh: 0.6 + 2.0 * e, fel: 0.6, fhip: 0.35 * e + 0.05, fkn: 0.3, nhip: 0.8 * e, nkn: 0.6,
    fhand: 'open', nhand: 'open', mouth: 0.5, turn: 0.5 }); };
  poses.micCheck = (k = 0) => mk({ prop: 'mic', use: 'mic', nwr: -1.2, torso: 0.42, chest: 0.12, neck: -0.25, head: -0.12, nsh: 1.15, nel: 1.55, nwr: -0.6,
    nhand: 'grip', fsh: 0.3, fel: 0.6, fhand: 'fist', mouth: k, turn: 0.55 });
  poses.phone = (ph = 0) => { const s = sin(TAU * ph); return mk({ prop: 'phone', turn: 0.85, nsh: 2.25 + 0.05 * s, nel: 1.0, nas: 0.25, nwr: -1.0,
    nhand: 'grip', fsh: 0.25, fel: 0.4, head: -0.12, torso: 0.02 + 0.02 * s, mouth: 0.1 }); };

  function blendPose(a, b, k) {
    if (!a) return b; if (!b) return a;
    const o = {};
    for (const key in a) {
      const va = a[key], vb = b[key];
      if (typeof va === 'number' && typeof vb === 'number') o[key] = va + (vb - va) * k;
      else o[key] = k < 0.5 ? va : (vb === undefined ? va : vb);
    }
    for (const key in b) if (!(key in o)) o[key] = typeof b[key] === 'number' ? b[key] * k : (k < 0.5 ? undefined : b[key]);
    return o;
  }

  // ------------------------------------------------------------------------------------------ heads and faces
  // A head frame maps head-local 3D points (units of head radius; X forward, Y down, Z far side) to body space.
  function headFrame(J, scale) {
    const r = J.def.headR * (scale || 1), yaw = J.hyaw, pitch = J.hpitch, roll = J.hroll;
    const cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch), cr = cos(roll), sr = sin(roll);
    const X0 = J.headC[0], Y0 = J.headC[1];
    const H = { r, x: X0, y: Y0, cy, sy, rot: pitch * cy + roll, yaw, pitch, roll };
    H.f = (X, Y, Z) => {
      const X1 = X * cp - Y * sp, Y1 = X * sp + Y * cp;
      const x = (X1 * cy + Z * sy) * r, y = Y1 * r;
      return [X0 + x * cr - y * sr, Y0 + x * sr + y * cr, X1 * sy - Z * cy];
    };
    return H;
  }
  function blob(p, H, X, Y, Z, a, b, c, rx) {
    const q = H.f(X, Y, Z);
    ell(p, q[0], q[1], H.r * hypot(a * H.cy, c * H.sy), H.r * b, H.rot + (rx || 0) * (H.cy >= 0 ? 1 : -1));
    return q;
  }
  function blobs(p, H, list) { for (const b of list) blob(p, H, b[0], b[1], b[2], b[3], b[4], b[5], b[6]); }
  const sph = (H, az, el, rr = 1) => { const ce = cos(el); return H.f(rr * ce * cos(az), rr * sin(el), rr * ce * sin(az)); };
  // top-most point of a blob list (for the speech-bubble anchor)
  function blobTop(H, list) {
    let best = null;
    for (const b of list) { const q = H.f(b[0], b[1], b[2]); const y = q[1] - H.r * b[4]; if (!best || y < best[1]) best = [q[0], y]; }
    return best;
  }

  const EXPR = {
    neutral: { eye: 1, lid: 0.1, brow: 0, bt: 0, open: 0, smile: 0.18 },
    shout: { eye: 1.05, lid: 0, brow: -0.25, bt: 0.45, open: 0.85, smile: 0 },
    scared: { eye: 1.45, lid: 0, brow: 0.6, bt: -0.4, open: 0.32, smile: -0.5, white: 1 },
    smug: { eye: 0.85, lid: 0.48, brow: 0.12, bt: 0.18, open: 0, smile: 0.5, smirk: 1 },
    deadpan: { eye: 0.85, lid: 0.55, brow: 0, bt: 0, open: 0, smile: 0 },
  };
  const FACE_INK = [24, 14, 18], EYE_WHITE = [244, 238, 228], MOUTH_IN = [52, 12, 18];
  // F: { expr, mouth, eye: 'dot'|'white'|'none', eyeR, eyeAz, brows (colour), lips (colour), braces, liner,
  //      noMouth }. Returns the two eye points (body space).
  function drawFace(R, H, F) {
    const E = EXPR[F.expr] || EXPR.neutral;
    const ctx = R.ctx, r = H.r, eyes = [];
    const az = F.eyeAz || 0.42, el = F.eyeEl == null ? -0.06 : F.eyeEl;
    for (const sd of [-1, 1]) eyes.push(sph(H, sd * az, el, 0.97));
    if (R.da <= 0.01) return eyes;
    const open = clamp(max(E.open, F.mouth || 0));
    const white = F.eye === 'white' || E.white;
    ctx.save();
    ctx.globalAlpha *= R.da;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const q = eyes[i], vis = q[2];
      if (vis < 0.06 || F.eye === 'none') continue;
      const sq = clamp(vis, 0.2, 1), er = (F.eyeR || 1) * r;
      const lid = clamp(E.lid + (F.lid || 0));
      if (white) {
        const p = new Path2D();
        ell(p, q[0], q[1], 0.17 * er * sq * (E.white ? 1.15 : 1), 0.2 * er * E.eye * (1 - 0.5 * lid), H.rot);
        fillP(R, p, EYE_WHITE);
        const pd = new Path2D();
        const lookX = H.cy * 0.05 * er;
        circle(pd, q[0] + lookX, q[1] + 0.02 * er, 0.07 * er * (E.white ? 0.8 : 1));
        fillP(R, pd, FACE_INK);
        strokeP(R, p, FACE_INK, max(0.6, 0.035 * er));
      } else {
        const p = new Path2D();
        ell(p, q[0], q[1], 0.095 * er * sq, 0.14 * er * E.eye * (1 - 0.55 * lid), H.rot);
        fillP(R, p, FACE_INK);
        const g = new Path2D();
        circle(g, q[0] + 0.03 * er * sq, q[1] - 0.05 * er, 0.03 * er);
        fillP(R, g, EYE_WHITE, 0.85);
        if (lid > 0.2 || F.liner) {
          const l = new Path2D();
          const w = 0.13 * er * sq, yy = q[1] - 0.14 * er * E.eye * (1 - 0.55 * lid);
          l.moveTo(q[0] - w, yy + 0.02 * er); l.quadraticCurveTo(q[0], yy - 0.03 * er, q[0] + w, yy + 0.02 * er);
          strokeP(R, l, FACE_INK, max(0.7, (F.liner ? 0.07 : 0.05) * er));
        }
      }
      if (F.brows !== null) {
        const inner = -(i === 0 ? -1 : 1);
        const sd = i === 0 ? -1 : 1;
        const b0 = sph(H, sd * (az - 0.16), el - 0.3 - E.brow * 0.1 + E.bt * 0.07, 0.99);
        const b1 = sph(H, sd * (az + 0.16), el - 0.3 - E.brow * 0.1 - E.bt * 0.05 * inner * -1, 0.99);
        if (b0[2] > 0 || b1[2] > 0) {
          const bp = new Path2D();
          bp.moveTo(b0[0], b0[1]); bp.lineTo(b1[0], b1[1]);
          strokeP(R, bp, F.browC || FACE_INK, max(0.8, 0.07 * r * (F.browW || 1)));
        }
      }
    }
    if (!F.noMouth) {
      const m = sph(H, 0, F.mouthEl || 0.46, 0.98);
      if (m[2] > -0.05) {
        const sq = clamp(m[2] + 0.15, 0.3, 1), w = 0.3 * r * sq * (F.mouthW || 1);
        const c = cos(H.rot), s = sin(H.rot);
        const pt = (u, v) => [m[0] + c * u - s * v, m[1] + s * u + c * v];
        if (open > 0.08) {
          const p = new Path2D();
          const rx = w * (0.45 + 0.3 * open), ry = r * (0.04 + 0.24 * open);
          ell(p, m[0] - s * ry * 0.4, m[1] + c * ry * 0.4, rx, ry, H.rot);
          fillP(R, p, MOUTH_IN);
          ctx.save(); ctx.clip(p);
          const tp = new Path2D(); const a = pt(-rx, -ry * 0.6), b = pt(rx, -ry * 0.6);
          tp.moveTo(a[0], a[1]); tp.lineTo(b[0], b[1]);
          strokeP(R, tp, EYE_WHITE, ry * 0.55);
          if (F.braces) strokeP(R, tp, [170, 180, 192], max(0.6, ry * 0.12));
          const tg = new Path2D(); const tq = pt(0, ry * 0.8); ell(tg, tq[0], tq[1], rx * 0.6, ry * 0.45, H.rot);
          fillP(R, tg, [190, 70, 84]);
          ctx.restore();
          if (F.lips) strokeP(R, p, F.lips, max(0.6, 0.05 * r));
        } else {
          const p = new Path2D(); const sm = E.smile, sk = E.smirk ? 1 : 0;
          const a = pt(-w * 0.5, -sm * 0.05 * r), b = pt(w * 0.5, -sm * 0.05 * r - sk * 0.09 * r), cc = pt(0, sm * 0.08 * r);
          p.moveTo(a[0], a[1]); p.quadraticCurveTo(cc[0], cc[1], b[0], b[1]);
          strokeP(R, p, F.lips || FACE_INK, max(0.8, (F.lips ? 0.085 : 0.055) * r));
        }
      }
    }
    ctx.restore();
    return eyes;
  }

  // ------------------------------------------------------------------------------------------ hands, limbs, feet
  const handAng = (J, sd) => { const j = J.arm[sd]; return atan2(j.ha[1] - j.el[1], j.ha[0] - j.el[0]) + j.wr; };
  function handPath(J, sd, shape, scale) {
    const j = J.arm[sd], r = J.def.hand * (scale || 1), ang = handAng(J, sd);
    shape = shape || j.shape;
    const c = cos(ang), s = sin(ang), x = j.ha[0] + c * r * 0.55, y = j.ha[1] + s * r * 0.55;
    const p = new Path2D();
    const fing = (a, len, w, bend) => {
      const cc = cos(ang + a), ss = sin(ang + a), x0 = x + cc * r * 0.55, y0 = y + ss * r * 0.55;
      const x1 = x0 + cc * len, y1 = y0 + ss * len;
      capsule(p, x0, y0, w, x1, y1, w * 0.9);
      if (bend) { const b2 = ang + a + bend; capsule(p, x1, y1, w * 0.9, x1 + cos(b2) * len * 0.6, y1 + sin(b2) * len * 0.6, w * 0.75); }
    };
    const thumb = (len) => capsule(p, x + s * r * 0.45, y - c * r * 0.45, r * 0.34, x + s * r * 0.45 + cos(ang - 0.9) * len, y - c * r * 0.45 + sin(ang - 0.9) * len, r * 0.3);
    switch (shape) {
      case 'fist': case 'grip': circle(p, x, y, r * 1.02); circle(p, x + s * r * 0.55, y - c * r * 0.55, r * 0.45); break;
      case 'point': circle(p, x, y, r * 0.95); fing(0, r * 1.5, r * 0.33); break;
      case 'horns': circle(p, x, y, r * 0.95); fing(-0.42, r * 1.45, r * 0.3); fing(0.4, r * 1.3, r * 0.3); break;
      case 'peace': circle(p, x, y, r * 0.95); fing(-0.22, r * 1.5, r * 0.3); fing(0.2, r * 1.45, r * 0.3); break;
      case 'thumb': circle(p, x, y, r); capsule(p, x, y - r * 0.4, r * 0.38, x + 0.1 * r, y - r * 1.85, r * 0.33); break;
      case 'open': ell(p, x + c * r * 0.15, y + s * r * 0.15, r, r * 0.82, ang);
        for (const a of [-0.52, -0.17, 0.17, 0.5]) fing(a, r * 1.05, r * 0.26); thumb(r * 1.1); break;
      case 'claw': ell(p, x, y, r * 0.95, r * 0.8, ang);
        for (const a of [-0.5, -0.17, 0.16, 0.48]) fing(a, r * 0.8, r * 0.26, 0.9); break;
      case 'flat': ell(p, x + c * r * 0.4, y + s * r * 0.4, r * 1.45, r * 0.68, ang); break;
      default: ell(p, x + c * r * 0.2, y + s * r * 0.2, r * 1.15, r * 0.8, ang); circle(p, x + s * r * 0.55, y - c * r * 0.55, r * 0.4);
    }
    return { p, x, y, ang, r };
  }
  function drawHand(R, J, sd, m, shape, scale) {
    if (R.skel && !m.glove) return boneHand(R, J, sd, scale);
    const h = handPath(J, sd, shape, scale);
    paint(R, h.p, m);
    return h;
  }
  function limb(R, A, B, C, r0, r1, r2, m) {
    const p = new Path2D();
    cap(p, A, r0, B, r1); cap(p, B, r1, C, r2);
    paint(R, p, m);
    return p;
  }
  const footPt = (J, sd, fu, du) => {
    const j = J.leg[sd], d = J.def;
    return [j.ankle[0] + fu * d.foot * j.F[0] + du * d.ankle * j.Dn[0], j.ankle[1] + fu * d.foot * j.F[1] + du * d.ankle * j.Dn[1]];
  };
  const SHOES = {
    sneaker: [[-0.2, -0.6], [-0.3, 0.2], [-0.28, 1.05], [0.6, 1.08], [0.86, 0.8], [0.85, 0.35], [0.52, 0.05], [0.14, -0.66]],
    chunky: [[-0.2, -0.8], [-0.34, 0.2], [-0.32, 1.25], [0.62, 1.28], [0.92, 0.95], [0.92, 0.3], [0.55, -0.1], [0.16, -0.85]],
    pointy: [[-0.15, -1.9], [-0.2, 0.15], [-0.22, 1.1], [-0.04, 1.1], [0.1, 0.92], [0.7, 1.0], [1.2, 0.8], [1.2, 0.8], [0.84, 0.42], [0.38, -0.1], [0.14, -1.9]],
    boot: [[-0.22, -1.5], [-0.33, 0.3], [-0.31, 1.12], [0.7, 1.14], [0.94, 0.78], [0.86, 0.15], [0.44, -0.25], [0.17, -1.5]],
    slipper: [[-0.25, 0.3], [-0.28, 1.0], [0.6, 1.02], [0.9, 0.75], [0.7, 0.3], [0.2, 0.25]],
    clown: [[-0.22, -0.4], [-0.3, 0.5], [-0.28, 1.1], [1.1, 1.12], [1.5, 0.75], [1.35, 0.0], [0.8, -0.2], [0.15, -0.5]],
    sock: [[-0.18, -0.9], [-0.28, 0.4], [-0.24, 1.0], [0.55, 1.0], [0.76, 0.72], [0.6, 0.35], [0.2, -0.2], [0.12, -0.9]],
    hightop: [[-0.2, -1.9], [-0.31, 0.2], [-0.29, 1.08], [0.62, 1.1], [0.88, 0.82], [0.86, 0.35], [0.5, 0.02], [0.15, -1.9]],
  };
  function shoe(R, J, sd, style, m, sole) {
    const pts = SHOES[style] || SHOES.sneaker, arr = [];
    for (const q of pts) { const f = footPt(J, sd, q[0], q[1]); arr.push(f[0], f[1]); }
    const p = new Path2D();
    smoothClosed(p, arr);
    paint(R, p, m);
    if (sole) {
      const big = style === 'chunky' ? 1.32 : style === 'clown' ? 1.15 : 1.12;
      const sp = new Path2D(), a = [];
      for (const q of [[-0.3, 0.72], [0.64, 0.74], [0.88, 0.7], [0.62, big], [-0.29, big]]) {
        const f = footPt(J, sd, q[0] * (style === 'chunky' ? 1.04 : 1), q[1]); a.push(f[0], f[1]);
      }
      smoothClosed(sp, a);
      paint(R, sp, sole);
    }
    return p;
  }

  // ------------------------------------------------------------------------------------------ torso
  function torsoGeo(J, X, o) {
    o = o || {};
    const d = J.def, cP = J.cP, sP = J.sP;
    const ext = (e) => [hypot(e[0] * cP, e[2] * sP), hypot(e[1] * cP, e[2] * sP)];
    const Hc = J.hipC, Mc = J.mid, Nc = J.neckB;
    const u1 = unit(sub(Mc, Hc)), u2 = unit(sub(Nc, Mc)), um = unit(add(u1, u2));
    const p1 = perpF(u1), p2 = perpF(u2), pm = perpF(um);
    const eH = ext(X.hip), eW = ext(X.waist), eC = ext(X.chest), eS = ext(X.sh);
    const br = o.breath || 0;
    eC[0] *= 1 + br; eC[1] *= 1 + br * 0.4; eW[0] *= 1 + br * 0.5;
    const L4 = add(Nc, u2, -d.shDrop * 0.85);
    for (const sd of SIDES) {
      const sh = J.arm[sd].sh, o4 = (sh[0] - L4[0]) * p2[0] + (sh[1] - L4[1]) * p2[1], rD = d.r.upper[0] * (o.delt || 0.92);
      eS[0] = max(eS[0], o4 + rD); eS[1] = max(eS[1], -o4 + rD);
      const hp = J.leg[sd].hip, o1 = (hp[0] - Hc[0]) * p1[0] + (hp[1] - Hc[1]) * p1[1], rT = d.r.thigh[0] * 0.92;
      eH[0] = max(eH[0], o1 + rT); eH[1] = max(eH[1], -o1 + rT);
    }
    const g = o.grow || 0;
    if (g) for (const e of [eH, eW, eC, eS]) { e[0] += g; e[1] += g; }
    const drop = o.drop == null ? d.pelvis : o.drop;
    const L0 = add(Hc, u1, -drop), L3 = lerp2(Mc, Nc, 0.55), L5 = add(Nc, u2, 2.5);
    const fl = o.flare || 0;
    const e0 = [eH[0] * (0.84 + fl), eH[1] * (0.84 + fl)];
    const nw = d.neckW + 2 + g * 0.5;
    const pts = [];
    const P_ = (C, p, e) => pts.push(C[0] + p[0] * e, C[1] + p[1] * e);
    P_(L0, p1, e0[0]); P_(Hc, p1, eH[0]); P_(Mc, pm, eW[0]); P_(L3, p2, eC[0]); P_(L4, p2, eS[0]); P_(L5, p2, nw);
    P_(L5, p2, -nw); P_(L4, p2, -eS[1]); P_(L3, p2, -eC[1]); P_(Mc, pm, -eW[1]); P_(Hc, p1, -eH[1]); P_(L0, p1, -e0[1]);
    const path = new Path2D();
    smoothClosed(path, pts);
    return { path, pts, Hc, Mc, Nc, L0, L3, L4, L5, u1, u2, um, p1, p2, pm, eH, eW, eC, eS, e0, drop };
  }
  // The visible centre line of the torso front (front surface at Z = 0): offset along p by front * cos(yaw).
  const frontLine = (T, J, C, p, e) => add(C, p, e * J.cP);
  function stripPath(J, T, w, from, to) {
    // a vertical strip down the torso front from level 'from' (0 neck .. 1 hem) to 'to', w = half width
    const lv = [[T.L5, T.p2, (J.def.neckW + 2) * 0.9], [T.L4, T.p2, T.eS[0] * 0.92], [T.L3, T.p2, T.eC[0]], [T.Mc, T.pm, T.eW[0]], [T.Hc, T.p1, T.eH[0]], [T.L0, T.p1, T.e0[0]]];
    const L = [], Rr = [];
    const n = lv.length - 1;
    for (let i = 0; i <= 12; i++) {
      const k = lerp(from, to, i / 12) * n, a = min(n - 1, floor(k)), f = k - a;
      const C = lerp2(lv[a][0], lv[a + 1][0], f), p = unit(lerp2(lv[a][1], lv[a + 1][1], f));
      const c = add(C, p, lerp(lv[a][2], lv[a + 1][2], f) * J.cP * 0.98);
      const ww = typeof w === 'function' ? w(i / 12) : w;
      L.push(c[0] - p[0] * ww * J.sP, c[1] - p[1] * ww * J.sP); Rr.push(c[0] + p[0] * ww * J.sP, c[1] + p[1] * ww * J.sP);
    }
    const pts = L.slice();
    for (let i = Rr.length - 2; i >= 0; i -= 2) pts.push(Rr[i], Rr[i + 1]);
    const path = new Path2D();
    polyC(path, pts);
    return path;
  }

  // ------------------------------------------------------------------------------------------ bones (skeleton style)
  const BONE = M('#e2d6bc', { dk: 0.36, heat: 0.1, rk: 1.1 });
  const CHAR = M('#2a1e18', { heat: 0.1, dk: 0.08 });
  const SOCKET = [16, 8, 6];
  function boneLimb(R, A, B, C, r) {
    const p = new Path2D();
    capsule(p, A[0], A[1], r * 0.4, B[0], B[1], r * 0.34);
    capsule(p, B[0], B[1], r * 0.32, C[0], C[1], r * 0.28);
    circle(p, B[0], B[1], r * 0.55);
    circle(p, C[0], C[1], r * 0.42);
    circle(p, A[0], A[1], r * 0.5);
    paint(R, p, BONE);
  }
  function boneHand(R, J, sd, scale) {
    const j = J.arm[sd], r = J.def.hand * (scale || 1), ang = handAng(J, sd);
    const p = new Path2D();
    const x = j.ha[0], y = j.ha[1];
    circle(p, x, y, r * 0.45);
    for (const a of [-0.45, -0.12, 0.2, 0.5]) {
      const c = cos(ang + a), s = sin(ang + a);
      capsule(p, x + c * r * 0.3, y + s * r * 0.3, r * 0.17, x + c * r * 1.7, y + s * r * 1.7, r * 0.14);
    }
    capsule(p, x, y, r * 0.17, x + cos(ang - 1.0) * r * 1.2, y + sin(ang - 1.0) * r * 1.2, r * 0.15);
    paint(R, p, BONE);
    return { x, y, ang, r };
  }
  function ribcage(R, J, X, o) {
    o = o || {};
    const d = J.def, cP = J.cP, sP = J.sP;
    const u2 = unit(sub(J.neckB, J.mid)), p2 = perpF(u2), u1 = unit(sub(J.mid, J.hipC)), p1 = perpF(u1);
    const far = new Path2D(), near = new Path2D(), spine = new Path2D();
    {
      const off = (C) => add(C, p2, -X.chest[1] * cP * 0.55);
      const A0 = off(J.hipC), A1 = off(J.mid), A2 = off(J.neckB), rr = d.r.upper[0] * 0.2;
      cap(spine, A0, rr, A1, rr); cap(spine, A1, rr, A2, rr * 0.9);
      for (let i = 0; i <= 8; i++) { const C = lerp2(A0, A2, i / 8); circle(spine, C[0], C[1], rr * 1.45); }
    }
    for (let i = 0; i < 5; i++) {
      const k = 0.28 + i * 0.15, C = lerp2(J.mid, J.neckB, k * 0.95 + 0.02);
      const a = X.chest[0] * (0.82 + 0.25 * sin(PI * k)), b = X.chest[1] * 0.8, c = X.chest[2] * (0.8 + 0.2 * sin(PI * k));
      for (const side of [1, -1]) {
        const pts = [], rads = [];
        for (let s = 0; s <= 6; s++) {
          const ph = -PI + (s / 6) * PI;       // back (-PI) to front (0)
          const Xv = cos(ph) >= 0 ? a * cos(ph) : b * cos(ph);
          const Z = side * c * sin(-ph);
          const drop = (1 + cos(ph)) * 0.5 * (6 + i * 1.5);
          const sx = Xv * cP + Z * sP;
          pts.push(C[0] + p2[0] * sx - u2[0] * drop, C[1] + p2[1] * sx - u2[1] * drop);
          rads.push(d.r.upper[0] * (0.13 + 0.05 * sin(PI * s / 6)));
        }
        const zMid = -side * c * cP;
        tube(zMid < 0 ? far : near, pts, rads);
      }
    }
    // pelvis: two wings and a sacrum
    const pel = new Path2D();
    for (const side of [1, -1]) {
      const Z = side * X.hip[2] * 0.55, sx = Z * sP;
      const q = add(add(J.hipC, p1, sx), u1, 4);
      ell(pel, q[0], q[1], max(3, X.hip[2] * 0.42 * sP + X.hip[0] * 0.42 * cP), X.hip[2] * 0.32, side * 0.5 * sP);
    }
    { const q = add(J.hipC, u1, -2); ell(pel, q[0], q[1], X.hip[2] * 0.22 + 2, X.hip[2] * 0.25, 0); }
    paint(R, far, BONE);
    paint(R, spine, BONE);
    paint(R, pel, BONE);
    paint(R, near, BONE);
  }
  function skullHead(R, H, o) {
    o = o || {};
    const p = new Path2D();
    blobs(p, H, [[0, -0.08, 0, 1, 0.98, 0.92 * (o.wide || 1)], [0.42, 0.42, 0, 0.55, 0.42, 0.62 * (o.wide || 1)],
      [0.55, 0.8 + (o.jaw || 0) * 0.25, 0, 0.42, 0.24, 0.5 * (o.wide || 1)]]);
    paint(R, p, BONE);
    const ctx = R.ctx;
    // sockets, nose and teeth are structure (always drawn)
    const sk = new Path2D();
    for (const sd of [-1, 1]) {
      const q = sph(H, sd * 0.4, -0.02, 0.95);
      if (q[2] > 0.05) ell(sk, q[0], q[1] + 0.03 * H.r, 0.17 * H.r * clamp(q[2], 0.3, 1), 0.2 * H.r, H.rot);
    }
    const n = sph(H, 0, 0.25, 0.98);
    if (n[2] > 0) ell(sk, n[0], n[1], 0.07 * H.r * clamp(n[2], 0.3, 1), 0.1 * H.r, H.rot);
    ctx.fillStyle = css(SOCKET);
    ctx.fill(sk);
    const tq = sph(H, 0, 0.62 + (o.jaw || 0) * 0.12, 1.0);
    if (tq[2] > 0) {
      const tp = new Path2D(), w = 0.3 * H.r * clamp(tq[2], 0.3, 1);
      for (let i = -2; i <= 2; i++) { tp.moveTo(tq[0] + i * w * 0.32, tq[1] - 0.06 * H.r); tp.lineTo(tq[0] + i * w * 0.32, tq[1] + 0.06 * H.r); }
      tp.moveTo(tq[0] - w * 0.75, tq[1]); tp.lineTo(tq[0] + w * 0.75, tq[1]);
      strokeP(R, tp, SOCKET, max(0.5, 0.04 * H.r), 0.8);
    }
    {
      // soot on the bone
      const so = new Path2D();
      blob(so, H, -0.35, -0.5, 0, 0.6, 0.45, 0.7);
      ctx.save(); ctx.clip(p); ctx.fillStyle = css(CHAR, 0.35); ctx.fill(so); ctx.restore();
    }
  }
  // A ragged hem: replaces the polygon edge between a and b with deterministic zigzags.
  function ragged(arr, a, b, n, amp, seed, dirx, diry) {
    const out = [];
    for (let i = 1; i < n; i++) {
      const k = i / n, x = lerp(a[0], b[0], k), y = lerp(a[1], b[1], k), j = (H01(i, seed) - 0.3) * amp * (i % 2 ? 1 : 0.35);
      out.push(x + dirx * j, y + diry * j);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ props
  const PM = {
    gWhite: M('#f2efe8', { dk: 0.44, heat: 0.12 }), gGuard: M('#16141a', { heat: 0.12 }), gNeck: M('#e5d6b4', { dk: 0.3, heat: 0.12 }),
    bassBody: M('#22365e', { dk: 0.17, heat: 0.12, rk: 1.2 }), bassGuard: M('#ddd6c6', { dk: 0.3, heat: 0.12 }),
    tape: M('#bfc2c9', { dk: 0.45, heat: 0.12 }), metal: M('#a3abb6', { dk: 0.24, heat: 0.1, rk: 1.4 }),
    dark: M('#1b1b20', { heat: 0.1 }), wood: M('#7a4524', { dk: 0.13, heat: 0.12 }),
    pink: M(PAL('granny', '#ff6fb5'), { acc: 1, dk: 0.55, heat: 0.2 }), red: M(PAL('vex', '#ff3344'), { acc: 1, dk: 0.6, heat: 0.15, rk: 1.3 }),
    yellow: M(PAL('tiny', '#ffd23f'), { acc: 1, dk: 0.56, heat: 0.15 }), tapeBlack: M('#141416', { heat: 0.1 }),
    phone: M('#18191d', { heat: 0.3 }), screen: M('#e6f3ff', { glow: 1, heat: 0.35 }), brass: M('#d8b04a', { dk: 0.32, heat: 0.1, rk: 1.3 }),
    pill: M('#e8862a', { dk: 0.36, heat: 0.15 }), paperW: M('#f1ede2', { dk: 0.36, heat: 0.15 }),
    lens: M(PAL('lamp', '#cff8ff'), { glow: 1, heat: 0.15 }), shell: M('#c8262e', { dk: 0.3, heat: 0.15 }),
  };
  const frame2 = (o, ang, sc) => { const c = cos(ang) * sc, s = sin(ang) * sc; return (x, y) => [o[0] + c * x - s * y, o[1] + s * x + c * y]; };
  function polyL(p, F, arr, smooth) {
    const out = [];
    for (let i = 0; i < arr.length; i += 2) { const q = F(arr[i], arr[i + 1]); out.push(q[0], q[1]); }
    if (smooth) smoothClosed(p, out); else polyC(p, out);
  }
  const extF = (J, e) => hypot(e[0] * J.cP, e[2] * J.sP);
  const extB = (J, e) => hypot(e[1] * J.cP, e[2] * J.sP);

  const GT_BODY = [16, -8, 4, -12.5, -12, -18, -30, -27, -50, -41, -50, -41, -41, -27, -27, -13, -17, -3, -17, -3, -25, 6, -36, 15,
    -47, 25, -47, 25, -31, 23, -16, 18.5, -11, 12.5, -1, 12.5, 9, 11.5, 16, 8];
  const GT_GUARD = [-3, -9, -15, -12, -13, -4, -20, 6, -8, 9.5, 3, 7.5];
  const BS_BODY = [18, -6, 14, -13, 21, -22, 21, -22, 8, -23, -6, -20, -26, -24, -42, -16, -48, 0, -43, 17, -27, 25, -10, 23, 2, 19, 15, 25, 15, 25, 16, 13, 18, 6];
  const BS_GUARD = [12, -10, 2, -14, -14, -12, -22, 0, -12, 13, 4, 14, 12, 10];

  function placeInstrument(J, P, look, o, bass) {
    const d = J.def, sc = (look.inst || 1) * (bass ? 1 : 1);
    const u1 = unit(sub(J.mid, J.hipC)), p1 = perpF(u1);
    const fe = extF(J, d.X.waist);
    const base = lerp2(J.hipC, J.mid, bass ? 0.08 : 0.24);
    const c = add(base, p1, fe * J.cP * 0.9 + 3 * sc);
    c[0] -= J.sP * d.hipW * 0.75;
    const ang = (bass ? -0.34 : -0.46) + (P.gtilt || 0) + J.lean * 0.45 + J.rot;
    const dir = dirA(ang), nrm = [-dir[1], dir[0]];
    const nl = (bass ? 104 : 80) * sc, ns = 14 * sc;
    const fret = clamp(P.fret == null ? 0.5 : P.fret, 0, 1);
    const gf = add(add(c, dir, ns + nl * (0.12 + 0.7 * fret)), nrm, 1.5 * sc);
    const gn = add(add(c, dir, (bass ? -2 : -6) * sc), nrm, (-2 + 6.5 * (P.strum || 0)) * sc);
    const ng = P.nogrip;
    return { kind: bass ? 'bass' : 'guitar', c, ang, sc, nl, z: 20, grip: { f: ng === 'f' ? null : gf, n: ng === 'n' ? null : gn },
      bend: { f: 1, n: 1 }, tip: add(c, dir, ns + nl + 34 * sc), draw: bass ? drawBass : drawGuitar };
  }
  function strings(R, F, x0, x1, n, sp, a) {
    detail(R, (ctx) => {
      const p = new Path2D();
      for (let i = 0; i < n; i++) { const y = (i - (n - 1) / 2) * sp; const A = F(x0, y), B = F(x1, y * 0.7); p.moveTo(A[0], A[1]); p.lineTo(B[0], B[1]); }
      strokeP(R, p, [230, 228, 220], max(0.35, 0.35 / R.ppu), a || 0.7);
    });
  }
  function drawGuitar(R, J, PR) {
    const F = frame2(PR.c, PR.ang, PR.sc), nl = PR.nl / PR.sc;
    const pn = new Path2D(); const a = F(12, 0), b = F(12 + nl, 0);
    capsule(pn, a[0], a[1], 3.7 * PR.sc, b[0], b[1], 3.1 * PR.sc);
    paint(R, pn, PM.gNeck);
    const ph = new Path2D();
    polyL(ph, F, [nl + 10, -3.6, nl + 18, -6.8, nl + 35, -3.4, nl + 35, -3.4, nl + 30, 1.8, nl + 18, 5.6, nl + 10, 3.6], true);
    paint(R, ph, PM.gWhite);
    const pb = new Path2D(); polyL(pb, F, GT_BODY, true); paint(R, pb, PM.gWhite);
    const pg = new Path2D(); polyL(pg, F, GT_GUARD, true); paint(R, pg, PM.gGuard);
    detail(R, () => {
      const fb = new Path2D(); const f0 = F(16, 0), f1 = F(10 + nl, 0); fb.moveTo(f0[0], f0[1]); fb.lineTo(f1[0], f1[1]);
      strokeP(R, fb, [40, 30, 28], 4.2 * PR.sc);
      const pk = new Path2D();
      for (const x of [-1, -9]) polyL(pk, F, [x, -6, x + 4, -6, x + 4, 6, x, 6]);
      fillP(R, pk, [30, 30, 34]);
      const kn = new Path2D(); for (const q of [[-33, 16], [-39, 20], [-28, 11]]) { const k = F(q[0], q[1]); circle(kn, k[0], k[1], 1.7 * PR.sc); }
      fillP(R, kn, [200, 190, 170]);
      const pg2 = new Path2D(); for (let i = 0; i < 3; i++) { const k1 = F(nl + 15 + i * 6, -6.4 + i * 0.8), k2 = F(nl + 15 + i * 6, 5.2 - i * 0.9); circle(pg2, k1[0], k1[1], 1.3 * PR.sc); circle(pg2, k2[0], k2[1], 1.3 * PR.sc); }
      fillP(R, pg2, [60, 60, 66]);
    });
    strings(R, F, -14, 10 + nl, 4, 1.6);
  }
  function drawBass(R, J, PR) {
    const F = frame2(PR.c, PR.ang, PR.sc), nl = PR.nl / PR.sc;
    const pn = new Path2D(); const a = F(12, 0), b = F(12 + nl, 0);
    capsule(pn, a[0], a[1], 3.9 * PR.sc, b[0], b[1], 3.3 * PR.sc);
    paint(R, pn, PM.gNeck);
    const ph = new Path2D(); polyL(ph, F, [nl + 8, -3.4, nl + 36, -5.2, nl + 39, -1.4, nl + 31, 4.6, nl + 8, 3.5], true); paint(R, ph, PM.gNeck);
    // duct tape round the cracked neck
    for (const k of [0.36, 0.6]) {
      const x = 12 + nl * k, tp = new Path2D();
      polyL(tp, F, [x - 4.5, -5.6, x + 3.5, -5.9, x + 5, 5.6, x - 3.5, 6]);
      paint(R, tp, PM.tape);
    }
    const pb = new Path2D(); polyL(pb, F, BS_BODY, true); paint(R, pb, PM.bassBody);
    const pg = new Path2D(); polyL(pg, F, BS_GUARD, true); paint(R, pg, PM.bassGuard);
    detail(R, () => {
      const pk = new Path2D(); polyL(pk, F, [-6, -7, -1, -7, -1, 0, -6, 0]); polyL(pk, F, [-3, 0, 2, 0, 2, 7, -3, 7]); fillP(R, pk, [26, 26, 30]);
      const pg2 = new Path2D(); for (let i = 0; i < 4; i++) { const k = F(nl + 14 + i * 6.5, -4.6); circle(pg2, k[0], k[1], 1.5 * PR.sc); }
      fillP(R, pg2, [70, 70, 76]);
      const tl = new Path2D(); for (const k of [0.36, 0.6]) { const x = 12 + nl * k; const A = F(x - 2, -5.6), B = F(x - 0.5, 5.8); tl.moveTo(A[0], A[1]); tl.lineTo(B[0], B[1]); }
      strokeP(R, tl, [120, 122, 128], max(0.4, 0.5 / R.ppu), 0.8);
    });
    strings(R, F, -18, 10 + nl, 4, 2.1);
  }

  function pouchPos(J) { const u1 = unit(sub(J.mid, J.hipC)), p1 = perpF(u1); return add(add(J.hipC, p1, extF(J, J.def.X.hip) * 0.6 - J.sP * 6), u1, 4); }
  function placeGun(J, P, look) {
    const sc = look.gunScale || 1, hold = P.hold || (P.use === 'gun' ? 'aim' : 'carry'), shn = J.arm.n.sh;
    let B, ang, gf = null, gn, open = 0, shells = 0;
    if (hold === 'carry') {
      const h = J.arm.n.ha, ha = handAng(J, 'n');
      ang = clamp(ha - 0.35, 0.35, 1.45) + (P.gunA || 0);
      const dir = dirA(ang);
      B = add(add(h, dir, -24 * sc), [-dir[1], dir[0]], -4 * sc);
      const PRc = { kind: 'shotgun', B, ang, sc, open: 0, shells: 0, muzzle: [B[0] + cos(ang) * 96 * sc, B[1] + sin(ang) * 96 * sc, ang], tip: add(B, dir, 96 * sc) };
      PRc.attach = { n: (R) => drawGun(R, J, PRc) };
      return PRc;
    }
    if (hold === 'shoulder') {
      gn = add(shn, [9 * sc, 27 * sc]);
      ang = -1.98 + J.rot;
      B = add(gn, dirA(ang), -24 * sc);
    } else if (hold === 'reload') {
      open = P.gunOpen || 0;
      ang = 0.12 + J.lean * 0.4 + J.rot;
      B = add(J.mid, [-20 * sc, 2 * sc]);
      const dir = dirA(ang), hinge = add(B, dir, 43 * sc), bdir = dirA(ang + open * 0.85);
      gf = add(add(hinge, bdir, 20 * sc), [-bdir[1], bdir[0]], 4 * sc);
      const k = P.reload || 0, grip = add(add(B, dir, 26 * sc), [-dir[1], dir[0]], 5 * sc);
      const pouch = pouchPos(J);
      const toPouch = bump(0.1, 0.24, 0.32, 0.42, k), toBreech = bump(0.36, 0.48, 0.66, 0.8, k);
      gn = lerp2(lerp2(grip, pouch, toPouch), add(hinge, [-2 * sc, -4 * sc]), toBreech);
      shells = max(toPouch * 0.4, toBreech) * (k > 0.25 ? 1 : 0);
    } else if (hold === 'hip') {
      ang = (P.aim || 0) + 0.1 + J.rot;
      B = add(J.mid, [-4 * sc, 6 * sc]);
      const dir = dirA(ang); gn = add(add(B, dir, 26 * sc), [-dir[1], dir[0]], 5 * sc); gf = add(B, dir, 54 * sc);
    } else {
      const rec = P.recoil || 0;
      ang = (P.aim || 0) - rec * 0.42 + J.rot;
      const dir = dirA(ang), nr = [-dir[1], dir[0]];
      B = add(add(shn, [5, 3]), dir, -rec * 8);
      gn = add(add(B, dir, 26 * sc), nr, 5 * sc);
      gf = add(add(B, dir, 55 * sc), nr, 3.5 * sc);
    }
    const dir = dirA(ang), bdir = dirA(ang + open * 0.85), hinge = add(B, dir, 43 * sc);
    const muzzle = add(hinge, bdir, 53 * sc);
    return { kind: 'shotgun', B, ang, sc, open, shells, grip: { f: gf, n: gn }, bend: { f: 1, n: 1 }, z: 20,
      muzzle: [muzzle[0], muzzle[1], ang + open * 0.85], tip: muzzle, draw: drawGun };
  }
  function drawGun(R, J, PR) {
    const F = frame2(PR.B, PR.ang, PR.sc), sc = PR.sc;
    const st = new Path2D(); polyL(st, F, [0, -6, 6, -6.8, 22, -3.4, 30, -2.8, 30, 4.2, 24, 4.2, 18, 5.6, 8, 9.6, 0, 10], true); paint(R, st, PM.wood);
    const rc = new Path2D(); polyL(rc, F, [29, -3.8, 44, -3.6, 44, 3.6, 36, 4.2, 29, 4.2]); paint(R, rc, PM.metal);
    const hinge = F(43, 0), Fb = frame2(hinge, PR.ang + PR.open * 0.85, sc);
    const br = new Path2D(); polyL(br, Fb, [0, -3.7, 53, -3.4, 53, 3.4, 0, 3.7]); paint(R, br, PM.metal);
    const fe = new Path2D(); polyL(fe, Fb, [2, 2.4, 21, 2.6, 23, 5.4, 4, 6.2], true); paint(R, fe, PM.wood);
    // Gerald's pink bow on the wrist of the stock
    const bw = new Path2D(); const k = F(19, -5.5);
    ell(bw, k[0] - 3.4 * sc, k[1] - 1 * sc, 3.6 * sc, 2.4 * sc, PR.ang - 0.5); ell(bw, k[0] + 3.4 * sc, k[1] - 1 * sc, 3.6 * sc, 2.4 * sc, PR.ang + 0.5);
    circle(bw, k[0], k[1], 1.6 * sc);
    const tl = F(17, -4), tr = F(21, -4);
    capsule(bw, k[0], k[1], 0.9 * sc, tl[0] - 2 * sc, tl[1] + 5 * sc, 0.7 * sc); capsule(bw, k[0], k[1], 0.9 * sc, tr[0] + 2 * sc, tr[1] + 5 * sc, 0.7 * sc);
    paint(R, bw, PM.pink);
    detail(R, (ctx) => {
      const dv = new Path2D(); const a = Fb(1, 0), b = Fb(53, 0); dv.moveTo(a[0], a[1]); dv.lineTo(b[0], b[1]);
      strokeP(R, dv, [40, 44, 52], max(0.4, 0.6 * sc));
      const tg = new Path2D(); const g = F(35, 6.5); circle(tg, g[0], g[1], 2.6 * sc); strokeP(R, tg, [60, 64, 70], max(0.4, 0.8 * sc));
      if (R.ppu * 5 * sc > 6) {
        const c = F(13, 4.2);
        ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(PR.ang); if (R.face < 0) ctx.scale(-1, 1);
        ctx.font = NS.font(5.2 * sc, NS.F.hand); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = css(PAL('granny', '#ff6fb5')); ctx.fillText('GERALD', 0, 0); ctx.restore();
      }
    });
    if (PR.shells > 0.05 && J.arm.n) {
      const h = J.arm.n.ha, sp = new Path2D(), a = PR.ang - 1.1;
      for (const o of [-2.6, 2.6]) { const q = add(h, [cos(a + 1.57) * o * sc, sin(a + 1.57) * o * sc]); capsule(sp, q[0], q[1], 2.2 * sc, q[0] + cos(a) * 9 * sc, q[1] + sin(a) * 9 * sc, 2.2 * sc); }
      R.ctx.save(); R.ctx.globalAlpha *= clamp(PR.shells * 1.5); paint(R, sp, PM.shell); R.ctx.restore();
    }
    if (PR.open > 0.3) {
      const q = Fb(1.5, 0);
      detail(R, () => { const p = new Path2D(); circle(p, q[0], q[1] - 1.8 * sc, 1.5 * sc); circle(p, q[0], q[1] + 1.8 * sc, 1.5 * sc); fillP(R, p, [10, 10, 12]); });
    }
  }

  function placeMega(J, P, look) {
    if (P.use === 'sing') {
      const H = headFrame(J);
      const mo = sph(H, 0, 0.42, 1.08);
      const fd = sub(H.f(1, 0, 0), H.f(0, 0, 0)), fl = hypot(fd[0], fd[1]) / H.r;
      const ang = atan2(fd[1], fd[0]) + (P.aim || 0) * (fd[0] >= 0 ? 1 : -1);
      const toward = clamp(H.sy * cos(H.pitch));
      const PR = { kind: 'megaphone', o: mo, ang, lk: clamp(fl, 0.25, 1), toward, sc: 1, z: 20, draw: drawMega };
      const F = frame2(mo, ang, 1);
      PR.grip = { n: F(14 * PR.lk, 17) };
      PR.bend = { n: 1 };
      PR.tip = F(44 * PR.lk, 0);
      return PR;
    }
    const PR = { kind: 'megaphone', attach: { n: (R, J2) => {
      const h = J2.arm.n.ha, ang = J2.P.megaAbs != null ? J2.P.megaAbs + J2.rot : handAng(J2, 'n') + (J2.P.megaA == null ? -1.45 : J2.P.megaA);
      const up = [sin(ang), -cos(ang)];
      const o = add(add(h, up, 15), dirA(ang), -14);
      const pr = { o, ang, lk: 1, toward: 0, sc: 1 };
      drawMega(R, J2, pr);
      PR.tip = frame2(o, ang, 1)(44, 0);
    } } };
    return PR;
  }
  function drawMega(R, J, PR) {
    const F = frame2(PR.o, PR.ang, PR.sc), lk = PR.lk, L = 44 * lk, br = 15, ex = br * sqrt(max(0, 1 - lk * lk));
    const hd = new Path2D(); polyL(hd, F, [L * 0.22, 3, L * 0.36, 3, L * 0.38 + 2, 17, L * 0.26 + 1, 18], true); paint(R, hd, PM.dark);
    const cn = new Path2D(); polyL(cn, F, [0, -4, 5 * lk, -4.6, L, -br, L + ex * 0.2, 0, L, br, 5 * lk, 4.6, 0, 4], false); paint(R, cn, PM.red);
    const bell = new Path2D(); const bc = F(L, 0);
    ell(bell, bc[0], bc[1], max(1.6, ex + 1.6), br + 1.2, PR.ang);
    paint(R, bell, PM.paperW);
    if (ex > 3) {
      const inn = new Path2D(); ell(inn, bc[0], bc[1], ex * 0.8, br * 0.82, PR.ang);
      if (PR.toward > 0) { fillP(R, inn, [16, 10, 12]); const th = new Path2D(); ell(th, bc[0] - cos(PR.ang) * ex * 0.3, bc[1] - sin(PR.ang) * ex * 0.3, ex * 0.25, br * 0.25, PR.ang); fillP(R, th, [60, 30, 30]); }
      else paint(R, inn, PM.red);
    }
    if (R.accent > 0 && !R.thermal) glowAt(R, bc[0], bc[1], 30, PAL('vex', '#ff3344'), R.accent * 0.35);
    detail(R, () => { const sh = new Path2D(); const a = F(6 * lk, -3.5), b = F(L - 2, -br + 3); sh.moveTo(a[0], a[1]); sh.lineTo(b[0], b[1]); strokeP(R, sh, WHITE, max(0.5, 1.2), 0.45); });
  }
  function placeStand(J, P, look) {
    if (P.use === 'sing') {
      const H = headFrame(J), mo = sph(H, 0, 0.45, 1.3);
      const fdx = H.f(1, 0, 0)[0] - H.x >= 0 ? 1 : -1;
      const base = [mo[0] + 22 * fdx, 0], top = [base[0], mo[1] + 26];
      const mic = [mo[0] + 4 * fdx, mo[1] + 2];
      return { kind: 'micstand', mode: 'stand', base, top, mic, grip: { n: add(mic, [3 * fdx, 6]) }, bend: { n: 1 }, z: 20, draw: drawStand, tip: mic };
    }
    const ang = (P.aim || -0.32) + J.rot;
    const dir = dirA(ang), c = add(lerp2(J.mid, J.neckB, 0.3), [6, 4]);
    return { kind: 'micstand', mode: 'spear', ang, c, grip: { n: add(c, dir, -6), f: add(c, dir, 26) }, bend: { n: 1, f: 1 }, z: 20, draw: drawStand, tip: add(c, dir, 80) };
  }
  function drawStand(R, J, PR) {
    if (PR.mode === 'stand') {
      const p = new Path2D(), b = PR.base, t = PR.top, m = PR.mic;
      capsule(p, b[0], b[1] - 4, 1.8, t[0], t[1], 1.6);
      capsule(p, t[0], t[1], 1.6, m[0], m[1] + 6, 1.4);
      for (const dx of [-16, 16, 4]) capsule(p, b[0], b[1] - 14, 1.6, b[0] + dx, b[1] - 1, 1.6);
      paint(R, p, PM.metal);
      const mc = new Path2D(); capsule(mc, m[0], m[1] + 6, 2.6, m[0], m[1] - 2, 3.4); circle(mc, m[0], m[1] - 4, 4.4); paint(R, mc, PM.dark);
      return;
    }
    const F = frame2(PR.c, PR.ang, 1), p = new Path2D();
    const a = F(-70, 0), b = F(78, 0); capsule(p, a[0], a[1], 1.9, b[0], b[1], 1.7); paint(R, p, PM.metal);
    const bs = new Path2D(); const bq = F(-72, 0); ell(bs, bq[0], bq[1], 4, 13, PR.ang); paint(R, bs, PM.dark);
    const mc = new Path2D(); const m0 = F(76, 0), m1 = F(88, 0); capsule(mc, m0[0], m0[1], 2.6, m1[0], m1[1], 3.4); const mt = F(91, 0); circle(mc, mt[0], mt[1], 4.4); paint(R, mc, PM.dark);
  }
  function attachAlong(J, sd, fn) { const h = J.arm[sd].ha, a = handAng(J, sd); return fn(h, a); }
  function drawBat(R, J, sd, len) {
    attachAlong(J, sd, (h, a0) => {
      const a = a0 + (J.P.batA || 0), d = dirA(a), L = len || 118;
      const knob = add(h, d, -10), mid = add(h, d, 14), end = add(h, d, L);
      const p = new Path2D();
      cap(p, knob, 3.2, mid, 3.6); cap(p, mid, 3.6, end, 8.6); circle(p, knob[0], knob[1], 5);
      paint(R, p, PM.yellow);
      const tp = new Path2D(); cap(tp, add(knob, d, 2), 3.9, add(h, d, 9), 3.9); paint(R, tp, PM.tapeBlack);
      if (!R.thermal && R.accent > 0) for (const k of [0.45, 0.75, 0.98]) { const q = add(h, d, L * k); glowAt(R, q[0], q[1], 22, PAL('tiny', '#ffd23f'), R.accent * 0.16); }
      J['tip_' + sd] = end;
    });
  }
  function drawSmall(R, J, sd, kind) {
    attachAlong(J, sd, (h, a) => {
      const F = frame2(h, a, 1), p = new Path2D();
      if (kind === 'wrench') {
        const s0 = F(-6, 0), s1 = F(30, 0); capsule(p, s0[0], s0[1], 2.4, s1[0], s1[1], 2.6);
        polyL(p, F, [28, -5.5, 37, -7, 42, -3.6, 36, -2, 36, 2, 42, 3.6, 37, 7, 28, 5.5], true);
        paint(R, p, PM.metal); J.tip = F(40, 0);
      } else if (kind === 'flashlight') {
        const s0 = F(-6, 0), s1 = F(15, 0), s2 = F(24, 0); capsule(p, s0[0], s0[1], 3.4, s1[0], s1[1], 3.6); capsule(p, s1[0], s1[1], 3.8, s2[0], s2[1], 5.2);
        paint(R, p, PM.dark);
        const ln = new Path2D(); ell(ln, s2[0], s2[1], 1.6, 4.6, a); paint(R, ln, PM.lens);
        if (!R.thermal) glowAt(R, s2[0], s2[1], 14, '#fff3d6', 0.8, 'hot');
        J.flash = [s2[0], s2[1], a]; J.tip = s2;
      } else if (kind === 'phone') {
        const c = add(h, [sin(a) * 3, -cos(a) * 3 - 6]);
        const ph = new Path2D(); const tilt = 0.12 * cos(a);
        ell(ph, c[0], c[1], 0.01, 0.01, 0);
        const Fp = frame2(c, tilt, 1); polyL(ph, Fp, [-5.4, -9, 5.4, -9, 5.4, 9, -5.4, 9]);
        paint(R, ph, PM.phone);
        const sc = new Path2D(); polyL(sc, Fp, [-4.4, -7.6, 4.4, -7.6, 4.4, 7.6, -4.4, 7.6]);
        if (R.thermal) paint(R, sc, PM.phone); else { fillP(R, sc, PM.screen.c); glowAt(R, c[0], c[1], 26, '#dff0ff', 0.55); }
        J.phone = c; J.tip = c;
      } else if (kind === 'pills') {
        const c = add(h, dirA(a), 3), Fp = frame2(c, a - PI / 2, 1);
        polyL(p, Fp, [-4, -6, 4, -6, 4, 6, -4, 6]); paint(R, p, PM.pill);
        const cp = new Path2D(); polyL(cp, Fp, [-4.6, -9, 4.6, -9, 4.6, -6, -4.6, -6]); paint(R, cp, PM.paperW);
        J.tip = c;
      } else if (kind === 'mic') {
        const s0 = F(-4, 0), s1 = F(16, 0); capsule(p, s0[0], s0[1], 2.6, s1[0], s1[1], 3.6); const t = F(20, 0); circle(p, t[0], t[1], 5);
        paint(R, p, PM.dark); J.tip = t;
      } else if (kind === 'cymbal') {
        const c = F(18, 0); ell(p, c[0], c[1], 21, 5.5, a + 0.25); paint(R, p, PM.brass);
        const bl = new Path2D(); ell(bl, c[0], c[1] - 1, 5, 2.4, a + 0.25); paint(R, bl, PM.brass); J.tip = c;
      }
    });
  }
  const ATTACH = { bats: 'both', wrench: 'n', flashlight: 'n', phone: 'n', pills: 'n', mic: 'n', cymbal: 'n' };
  function placeProp(name, J, P, look, o) {
    if (name === 'guitar') return placeInstrument(J, P, look, o, false);
    if (name === 'bass') return placeInstrument(J, P, look, o, true);
    if (name === 'shotgun') return placeGun(J, P, look, o);
    if (name === 'megaphone') return placeMega(J, P, look, o);
    if (name === 'micstand') return placeStand(J, P, look, o);
    if (name === 'mic' && P.use === 'mic') {
      const H = headFrame(J), mo = sph(H, 0, 0.5, 1.15), fd = sub(H.f(1, 0, 0), H.f(0, 0, 0)), fl = hypot(fd[0], fd[1]) || 1;
      const T = add(add(mo, [fd[0] / fl, fd[1] / fl], J.def.headR * 0.25), [0, J.def.headR * 0.55]);
      return { kind: 'mic', grip: { n: T }, bend: { n: 1 }, attach: { n: (R, J2, sd) => drawSmall(R, J2, sd, 'mic') } };
    }
    const at = ATTACH[name];
    if (!at) return null;
    const PR = { kind: name, attach: {} };
    const fn = name === 'bats' ? (R, J2, sd) => drawBat(R, J2, sd, look.batLen) : (R, J2, sd) => drawSmall(R, J2, sd, name);
    if (at === 'both' || at === 'f') PR.attach.f = fn;
    if (at === 'both' || at === 'n') PR.attach.n = fn;
    return PR;
  }
  function resolveProp(look, P, o) {
    if (o.prop) return o.prop === 'none' ? null : o.prop;
    if (P.prop) return P.prop === 'none' ? null : P.prop;
    const pr = look.props || {};
    const v = P.use && Object.prototype.hasOwnProperty.call(pr, P.use) ? pr[P.use] : pr.def;
    return v || null;
  }

  // ------------------------------------------------------------------------------------------ figure renderer
  function limb4(R, A, B, C, r0, r1, r1b, r2, m) {
    const p = new Path2D();
    cap(p, A, r0, B, r1); cap(p, B, r1b, C, r2);
    paint(R, p, m);
    return p;
  }
  const breathK = (R, J) => 0.028 * sin(R.t * TAU / 3.4) * (J.P.breath == null ? 1 : J.P.breath);
  function puffAt(R, x, y, r, color, a) { if (a > 0.004) (R.puffs || (R.puffs = [])).push([x, y, r, color, a]); }
  function flushPuffs(R) {
    if (!R.puffs || R.o.glow === false) return;
    const ctx = R.ctx;
    ctx.save();
    for (const g of R.puffs) { ctx.globalAlpha = clamp(g[4]) * (R.o.alpha == null ? 1 : R.o.alpha); ctx.drawImage(glowSprite(g[3], 'puff'), g[0] - g[2], g[1] - g[2], g[2] * 2, g[2] * 2); }
    ctx.restore();
  }
  function prepFigure(look, pose, o) {
    const def = o.def || look.def;
    let P = pose || poses.stand();
    if (look.adj) P = look.adj(P);
    const J = solve(def, P);
    J.look = look; J.t = +o.t || 0;
    const prop = resolveProp(look, P, o);
    const PR = prop ? placeProp(prop, J, P, look, o) : null;
    if (PR && PR.grip) for (const sd of SIDES) if (PR.grip[sd]) ik(J, sd, PR.grip[sd], PR.bend && PR.bend[sd]);
    let ox = 0, oy = 0;
    if (o.pin === 'hands') { const a = J.arm.f.ha, b = J.arm.n.ha, q = a[1] < b[1] ? a : b; ox = q[0]; oy = q[1]; }
    else if (o.pin === 'hip') { ox = J.hipC[0]; oy = J.hipC[1]; }
    else if (o.pin === 'head') { ox = J.headC[0]; oy = J.headC[1]; }
    return { J, P, PR, ox, oy };
  }
  function renderFigure(ctx, look, pose, o) {
    o = o || {};
    const { J, P, PR, ox, oy } = prepFigure(look, pose, o);
    const def = J.def;
    const s = o.s == null ? 1 : +o.s, face = o.face == null || +o.face >= 0 ? 1 : -1;
    const x = +o.x || 0, y = +o.y || 0;
    ctx.save();
    if (o.alpha != null && o.alpha < 1) ctx.globalAlpha *= clamp(+o.alpha);
    ctx.translate(x, y);
    ctx.scale(face * s, s);
    if (ox || oy) ctx.translate(-ox, -oy);
    const R = mkR(ctx, o, s, face);
    R.J = J; R.look = look; R.PR = PR; R.expr = o.expression || P.expr || look.expr;
    const order = [[-1e9, 'back']];
    const thrA = -0.35 * def.shW, hipF = def.X.hip[0];
    for (const sd of SIDES) {
      const lz = J.leg[sd].z; order.push([lz > 1.6 * hipF ? 500 + lz : -1e5 + lz, 'leg', sd]);
      const az = J.arm[sd].z; order.push([az < thrA ? -1e5 + az : 1e3 + az, 'arm', sd]);
    }
    order.push([0, 'torso'], [10, 'head']);
    if (PR && PR.draw) order.push([PR.z == null ? 20 : PR.z, 'prop']);
    order.sort((a, b) => a[0] - b[0]);
    const drawn = { f: false, n: false };
    for (const it of order) {
      const k = it[1];
      if (k === 'back') { if (look.back) look.back(R, J, o); }
      else if (k === 'leg') look.leg(R, J, it[2], o);
      else if (k === 'arm') {
        const sd = it[2];
        look.arm(R, J, sd, o);
        if (PR && PR.attach && PR.attach[sd]) PR.attach[sd](R, J, sd);
        look.hand(R, J, sd, o);
        drawn[sd] = true;
      } else if (k === 'torso') look.torso(R, J, o);
      else if (k === 'head') look.head(R, J, o);
      else if (k === 'prop') {
        PR.draw(R, J, PR);
        if (PR.grip) for (const sd of SIDES) if (PR.grip[sd] && drawn[sd]) look.hand(R, J, sd, o);
      }
    }
    if (look.after) look.after(R, J, o);
    flushPuffs(R);
    flushGlows(R);
    ctx.restore();
    return anchorsOf(J, look, o, PR, x, y, s, face, ox, oy);
  }
  function anchorsOf(J, look, o, PR, x, y, s, face, ox, oy) {
    const tf = (q) => [x + face * s * (q[0] - ox), y + s * (q[1] - oy)];
    const ta = (a) => (face > 0 ? a : PI - a);
    if (!J.top && look.topOf) J.top = look.topOf(J, o);
    const top = J.top || [J.headC[0], J.headC[1] - J.def.headR * 1.1];
    if (!J.mouth) { const H = headFrame(J); J.mouth = sph(H, 0, 0.46, 1); }
    const A = { head: tf(top), headC: tf(J.headC), mouth: tf(J.mouth), hands: [tf(J.arm.f.ha), tf(J.arm.n.ha)],
      feet: tf([J.hipC[0], 0]), hip: tf(J.hipC) };
    if (J.eyes) A.eyes = J.eyes.map(tf);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of J.pts) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
    y0 = min(y0, top[1]); y1 = max(y1, 0);
    const mg = J.def.r.thigh[0] + J.def.hand;
    const a = tf([x0 - mg, y0]), b = tf([x1 + mg, y1]);
    A.bbox = [min(a[0], b[0]), min(a[1], b[1]), abs(b[0] - a[0]), abs(b[1] - a[1])];
    if (PR && PR.muzzle) { const q = tf(PR.muzzle); A.muzzle = [q[0], q[1], ta(PR.muzzle[2])]; }
    if (J.lamp) { const q = tf(J.lamp); A.lamp = [q[0], q[1], ta(J.lamp[2]), J.lamp[3]]; }
    if (J.flash) { const q = tf(J.flash); A.flash = [q[0], q[1], ta(J.flash[2])]; }
    if (J.phone) A.phone = tf(J.phone);
    if (J.cast) A.cast = tf(J.cast);
    if (J.wrist) A.wrist = tf(J.wrist);
    const tip = (PR && PR.tip) || J.tip || J.tip_n;
    if (tip) { const q = tf(tip); A.prop = [q[0], q[1], 0]; }
    return A;
  }

  // ------------------------------------------------------------------------------------------ shared costume bits
  function scarfTails(R, J, m, specs, front) {
    const P = J.P, t = R.t, w = clamp(P.wind || 0);
    const u2 = unit(sub(J.neckB, J.mid)), p2 = perpF(u2);
    const nw = J.def.neckW + 3;
    const anc = front ? add(add(J.neckB, p2, nw * J.cP * 0.9), u2, 2) : add(add(J.neckB, p2, -nw * (0.35 + 0.6 * J.cP)), u2, 4);
    for (const sp of specs) {
      const len = sp[0], seed = sp[1], wd = sp[2];
      const pts = [anc[0], anc[1]], rads = [wd * 0.85];
      let q = anc, a = front ? PI * 0.5 + J.lean2 * 0.8 + 0.08 : lerp(PI * 0.6, PI * 0.98, w) + J.rot * 0.6;
      for (let i = 1; i <= 6; i++) {
        a += (front ? 0.02 : 0.07 * (1 - w)) + w * 0.26 * sin(t * 8.5 - i * 0.95 + seed) + (1 - w) * 0.05 * sin(t * 1.4 + i * 0.6 + seed);
        q = add(q, dirA(a), len / 6);
        pts.push(q[0], q[1]); rads.push(wd * (1 - i * 0.05));
      }
      const p = new Path2D();
      tube(p, pts, rads);
      paint(R, p, m);
      const e = [pts[pts.length - 2], pts[pts.length - 1]], ea = a;
      detail(R, () => {
        const fp = new Path2D(), n = [-sin(ea), cos(ea)];
        for (let i = -2; i <= 2; i++) { const b0 = add(e, n, i * wd * 0.35); fp.moveTo(b0[0], b0[1]); const b1 = add(b0, dirA(ea), 5); fp.lineTo(b1[0], b1[1]); }
        strokeP(R, fp, mix(m.c, NIGHT, 0.3), 1.1);
      });
      if (!R.thermal && R.accent > 0) glowAt(R, pts[6], pts[7], 26, PAL('vex', '#ff3344'), R.accent * (R.skel ? 0.5 : 0.22), R.skel ? 'hot' : 'soft');
    }
  }
  function coatPanels(R, J, m, X, len, which) {
    const P = J.P, t = R.t, w = clamp(P.wind || 0), cP = J.cP, sP = J.sP;
    const H = J.hipC, u1 = unit(sub(J.mid, H)), p1 = perpF(u1), dn = [-u1[0], -u1[1]];
    const u2 = unit(sub(J.neckB, J.mid)), pm = perpF(unit(add(u1, u2)));
    const ef = extF(J, X.hip) + 3, eb = extB(J, X.hip) + 4;
    const sw = 0.05 * sin(t * 1.9) + w * 0.14 * sin(TAU * (P.flap || 0) * 2 + 0.5);
    const phB = 0.08 + w * 1.0 + sw, phF = 0.01 + w * 0.6 + sw * 0.8;
    const p = new Path2D();
    const seed = which === 'back' ? 3 : 7;
    if (which === 'back') {
      const WB = add(J.mid, pm, -(extB(J, X.waist) + 3)), WF = add(J.mid, pm, extF(J, X.waist) * 0.2);
      const HB = add(H, p1, -eb), HF = add(H, p1, ef * 0.55);
      const hemB = add(HB, rotV(dn, phB), len * 1.03), hemF = add(HF, rotV(dn, phF), len * 0.97);
      const vm = lerp2(hemB, hemF, 0.47), vent = lerp2(vm, H, 0.22);
      let pts = [WF[0], WF[1], WB[0], WB[1], HB[0], HB[1], hemB[0], hemB[1], hemB[0], hemB[1]];
      if (R.skel) pts = pts.concat(ragged(pts, hemB, vent, 6, 9, seed, u1[0], u1[1]));
      pts.push(vent[0], vent[1], vent[0], vent[1]);
      if (R.skel) pts = pts.concat(ragged(pts, vent, hemF, 6, 9, seed + 1, u1[0], u1[1]));
      pts.push(hemF[0], hemF[1], hemF[0], hemF[1], HF[0], HF[1]);
      smoothClosed(p, pts);
      paint(R, p, m);
      return;
    }
    const gap = 2 + 5 * sP;
    const flap = (a, b, side) => {
      const Wc = lerp2(H, J.mid, 0.7);
      const T1 = add(Wc, pm, a), T2 = add(Wc, pm, b), M1 = add(H, p1, a + side * 1), M2 = add(H, p1, b * 1.05);
      const B1 = add(add(H, p1, a + side * 3), rotV(dn, phF + 0.02), len * 0.95), B2 = add(add(H, p1, b * 1.15), rotV(dn, phF + 0.08), len * 0.99);
      let pts = [T1[0], T1[1], T2[0], T2[1], M2[0], M2[1], B2[0], B2[1], B2[0], B2[1]];
      if (R.skel) pts = pts.concat(ragged(pts, B2, B1, 5, 8, seed + side, u1[0], u1[1]));
      pts.push(B1[0], B1[1], B1[0], B1[1], M1[0], M1[1]);
      const fp = new Path2D(); smoothClosed(fp, pts); paint(R, fp, inner(m));
    };
    flap(X.hip[0] * cP - gap, -(X.hip[2] * sP) - 0.3 * X.hip[1] * cP, -1);
    if (sP > 0.45) flap(X.hip[0] * cP + gap, X.hip[2] * sP + 0.3 * X.hip[1] * cP, 1);
  }
  function lanyard(R, J, T, big) {
    const u2 = unit(sub(J.neckB, J.mid)), p2 = perpF(u2);
    const c = add(frontLine(T, J, T.L3, T.p2, T.eC[0] * 0.98), u2, -T.eC[0] * 0.2);
    const nl = add(J.neckB, p2, -J.def.neckW * 0.8), nr = add(J.neckB, p2, J.def.neckW * 0.8 * (J.cP + J.sP));
    const sw = 0.04 * sin(R.t * 2.2);
    const card = add(c, [sw * 20, 0]);
    const st = new Path2D();
    st.moveTo(nl[0], nl[1]); st.quadraticCurveTo(lerp(nl[0], card[0], 0.5) - 3, lerp(nl[1], card[1], 0.6), card[0], card[1] - 8);
    st.moveTo(nr[0], nr[1]); st.quadraticCurveTo(lerp(nr[0], card[0], 0.5) + 3, lerp(nr[1], card[1], 0.6), card[0], card[1] - 8);
    strokeP(R, st, R.thermal ? ironArr(0.2) : [180, 30, 40], max(1, J.def.neckW * 0.22));
    const cw = J.def.neckW * 1.6 * (big ? 1.3 : 1), ch = cw * 1.3;
    const cp = new Path2D(); polyC(cp, [card[0] - cw / 2, card[1] - 8, card[0] + cw / 2, card[1] - 8, card[0] + cw / 2, card[1] - 8 + ch, card[0] - cw / 2, card[1] - 8 + ch]);
    paint(R, cp, PM.paperW);
    if (!R.thermal && R.ppu * ch > 10) {
      const ctx = R.ctx;
      ctx.save(); ctx.translate(card[0], card[1] - 8 + ch * 0.5); if (R.face < 0) ctx.scale(-1, 1);
      ctx.fillStyle = css([200, 20, 30]); ctx.fillRect(-cw / 2, -ch * 0.5, cw, ch * 0.28);
      ctx.fillStyle = css([20, 18, 22]); ctx.font = NS.font(ch * 0.2, NS.F.title); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ALL', 0, ch * 0.02); ctx.fillText('ACCESS', 0, ch * 0.26);
      ctx.restore();
    }
  }
  function smokeFrom(R, q, k) {
    for (let i = 0; i < 6; i++) {
      const ph = fract(R.t * 0.55 + i / 6), x = q[0] + 6 * sin(R.t * 1.7 + i * 2.1) * ph - 10 * ph, y = q[1] - 70 * ph;
      puffAt(R, x, y, 7 + 20 * ph, '#8d8d98', k * 0.55 * (1 - ph) * sstep(0, 0.15, ph));
    }
  }
  function upperRemnant(R, T, m) {
    // keep only the shoulders of a garment (skeleton style): clip the torso path above the chest line
    const ctx = R.ctx, a = add(T.L3, T.p2, 60), b = add(T.L3, T.p2, -60), up = T.u2;
    const cl = new Path2D();
    const r1 = add(add(T.L3, up, -2), T.p2, 0), j = [];
    for (let i = 0; i <= 8; i++) { const k = i / 8; const q = lerp2(b, a, k); j.push(q[0] + up[0] * (H01(i, 5) * 8 - 4), q[1] + up[1] * (H01(i, 5) * 8 - 4)); }
    polyC(cl, j.concat([a[0] + up[0] * 200, a[1] + up[1] * 200, b[0] + up[0] * 200, b[1] + up[1] * 200]));
    ctx.save(); ctx.clip(cl); paint(R, T.path, m); ctx.restore();
    void r1;
  }

  // ------------------------------------------------------------------------------------------ the survivors
  const VXM = {
    skin: M('#e8b9a0', { heat: 1 }), hair: M('#1a1620', { heat: 0.35, rk: 1.25 }), coat: M('#33241f', { heat: 0.42, rk: 1.15 }),
    shirt: M('#1e1c25', { heat: 0.78 }), jeans: M('#2a3662', { heat: 0.66 }), boot: M('#211a1c', { heat: 0.22, rk: 1.3 }),
    scarf: M(PAL('vex', '#ff3344'), { acc: 1, dk: 0.64, heat: 0.62 }), burnt: M('#1d1411', { heat: 0.1 }),
    scorch: M('#8a1c20', { acc: 1, dk: 0.5, heat: 0.1 }), char: M('#120d0c', { heat: 0.1, rk: 1.3 }),
  };
  const VEX_HEAD = [[0, -0.04, 0, 1, 1.02, 0.9], [0.3, 0.5, 0, 0.66, 0.56, 0.62], [0.7, 0.8, 0, 0.27, 0.22, 0.26],
    [0.95, 0.15, 0, 0.22, 0.2, 0.13], [-0.05, 0.12, -0.92, 0.16, 0.25, 0.12], [-0.05, 0.12, 0.92, 0.16, 0.25, 0.12]];
  const VEX_BURNS = [[-0.16, -0.18, -0.86, 0.12, 0.44, 0.1], [-0.16, -0.18, 0.86, 0.12, 0.44, 0.1]];
  const VEX_BACK = [[-0.5, -0.25, 0, 0.62, 0.82, 0.86], [-0.75, 0.25, 0, 0.42, 0.5, 0.7]];
  const vexPomp = (t, w, flip) => [[0.05, -0.72, 0, 1.0, 0.52, 0.95], [0.45 - 0.1 * w, -1.08 - 0.03 * sin(t * 3.1) - 0.1 * flip, 0, 0.78, 0.55, 0.8],
    [1.0 - 0.25 * w, -1.18 + 0.05 * sin(t * 3.1 + 0.6) - 0.15 * flip, 0, 0.55, 0.45, 0.62, -0.35], [1.32 - 0.3 * w, -1.0 + 0.05 * sin(t * 3.1 + 0.9) - 0.12 * flip, 0, 0.3, 0.3, 0.4],
    [-0.15, -1.0, 0, 0.82, 0.48, 0.86]];
  const X_PLUS = (X, g) => { const o = {}; for (const k in X) o[k] = X[k].map((v) => v + g); return o; };

  const LOOK = {};
  LOOK.vex = {
    who: 'vex', def: DEFS.vex, expr: 'smug', m: VXM, X2: X_PLUS(DEFS.vex.X, 2.5),
    props: { def: 'megaphone', sing: 'megaphone', hero: 'megaphone', preen: 'megaphone', instrument: 'micstand', gun: 'micstand', drum: null },
    topOf(J) { const H = headFrame(J); return blobTop(H, vexPomp(J.t, clamp(J.P.wind || 0), J.P.hairFlip || 0)); },
    back(R, J, o) {
      const w = clamp(J.P.wind || 0), m = R.skel ? this.m.scorch : this.m.scarf;
      scarfTails(R, J, m, w > 0.45 ? [[64, 0, 4.6], [54, 2.1, 4.2], [48, 4.0, 3.8]] : [[60, 0.4, 4.6], [48, 2.6, 4.2]]);
      coatPanels(R, J, R.skel ? this.m.burnt : this.m.coat, this.X2, 104, 'back');
    },
    leg(R, J, sd) {
      const j = J.leg[sd], r = this.def.r;
      if (R.skel) { boneLimb(R, j.hip, j.knee, j.ankle, r.thigh[0]); shoe(R, J, sd, 'pointy', this.m.char); return; }
      limb4(R, j.hip, j.knee, j.ankle, r.thigh[0], r.thigh[1], r.shin[0], r.shin[1], this.m.jeans);
      shoe(R, J, sd, 'pointy', this.m.boot);
      detail(R, () => { const tip = footPt(J, sd, 1.16, 0.8), b = footPt(J, sd, 0.9, 0.5); const p = new Path2D(); p.moveTo(b[0], b[1]); p.lineTo(tip[0], tip[1]); strokeP(R, p, [200, 205, 215], 1.6, 0.8); });
    },
    arm(R, J, sd) {
      const j = J.arm[sd], r = this.def.r;
      if (R.skel) {
        boneLimb(R, j.sh, j.el, j.ha, r.upper[0] * 0.9);
        const p = new Path2D(); cap(p, j.sh, r.upper[0] + 1, lerp2(j.sh, j.el, 0.62), r.upper[1]); paint(R, p, this.m.burnt);
        return;
      }
      const cuff = add(j.ha, unit(sub(j.el, j.ha)), 2.5);
      limb4(R, j.sh, j.el, cuff, r.upper[0], r.upper[1], r.fore[0], r.fore[1], this.m.coat);
    },
    hand(R, J, sd) { drawHand(R, J, sd, this.m.skin); },
    torso(R, J, o) {
      const T = torsoGeo(J, this.X2, { breath: breathK(R, J), drop: 14 });
      if (R.skel) { upperRemnant(R, T, this.m.burnt); ribcage(R, J, this.def.X); coatPanels(R, J, this.m.burnt, this.X2, 100, 'front'); return; }
      paint(R, T.path, this.m.coat);
      const ctx = R.ctx;
      ctx.save(); ctx.clip(T.path);
      paint(R, stripPath(J, T, (k) => 5 + 4 * (1 - k), 0, 0.84), inner(this.m.shirt));
      paint(R, stripPath(J, T, (k) => 4.2 * (1 - k), 0, 0.36), inner(this.m.skin));
      ctx.restore();
      coatPanels(R, J, this.m.coat, this.X2, 104, 'front');
      if (o.lanyard) lanyard(R, J, T);
    },
    head(R, J, o) {
      const H = headFrame(J), t = R.t, w = clamp(J.P.wind || 0), flip = J.P.hairFlip || 0;
      const np = new Path2D(); cap(np, J.neckB, this.def.neckW, J.neckT, this.def.neckW * 0.92);
      paint(R, np, R.skel ? BONE : this.m.skin);
      const pomp = vexPomp(t, w, flip);
      const bh = new Path2D(); blobs(bh, H, VEX_BACK); paint(R, bh, R.skel ? this.m.char : this.m.hair);
      if (R.skel) skullHead(R, H, { jaw: 0.3 + 0.4 * (J.P.mouth || 0) });
      else {
        const hp = new Path2D(); blobs(hp, H, VEX_HEAD); paint(R, hp, this.m.skin);
        J.eyes = drawFace(R, H, { expr: R.expr, mouth: J.P.mouth, eye: 'dot', liner: 1, browC: [22, 16, 24] });
      }
      const hr = new Path2D(); blobs(hr, H, pomp); if (!R.skel) blobs(hr, H, VEX_BURNS);
      paint(R, hr, R.skel ? this.m.char : this.m.hair);
      if (!R.skel) detail(R, () => {
        const a = H.f(-0.4, -1.08, 0), b = H.f(0.5, -1.38, 0), c = H.f(1.18, -1.12, 0), p = new Path2D();
        p.moveTo(a[0], a[1]); p.quadraticCurveTo(b[0], b[1], c[0], c[1]);
        strokeP(R, p, [120, 130, 160], max(0.8, 0.07 * H.r), 0.55);
      });
      J.top = blobTop(H, pomp);
      J.mouth = sph(H, 0, 0.46, 1);
      const front = H.f(1.3 - 0.25 * w, -1.05, 0);
      if (R.skel && !R.thermal) for (let i = 0; i < 4; i++) { const q = H.f(0.9 - i * 0.45, -1.2 + i * 0.08 - (i === 0 ? 0 : 0.1), 0); glowAt(R, q[0], q[1], 9, PAL('fire', '#ff5a1f'), 0.35 + 0.25 * sin(t * 5 + i * 2), 'hot'); }
      // scarf: loop round the neck, a front tail when there is no wind
      const sm = R.skel ? this.m.scorch : this.m.scarf;
      if (w < 0.45) scarfTails(R, J, sm, [[50, 1.3, 4.8]], true);
      const u2 = unit(sub(J.neckB, J.mid)), c = add(J.neckB, u2, 4);
      const lp = new Path2D(); ell(lp, c[0], c[1], this.def.neckW + 5 + 3 * J.sP, 7.5, atan2(u2[1], u2[0]) + PI / 2);
      paint(R, lp, sm);
      if (!R.thermal && R.accent > 0) glowAt(R, c[0], c[1], 34, PAL('vex', '#ff3344'), R.accent * 0.3);
      if (o.smoke > 0 && !R.thermal) {
        smokeFrom(R, front, o.smoke);
        for (let i = 0; i < 3; i++) { const q = H.f(1.1 - i * 0.3, -1.25 + i * 0.05, 0); glowAt(R, q[0], q[1], 7, PAL('fire', '#ff5a1f'), o.smoke * (0.5 + 0.4 * sin(t * 7 + i * 2.3)), 'hot'); }
      }
    },
  };

  const GRM = {
    skin: M('#efc9b3', { heat: 1 }), hair: M('#f3f0ea', { dk: 0.46, heat: 0.4 }), cardi: M(PAL('granny', '#ff6fb5'), { acc: 1, dk: 0.4, heat: 0.66 }),
    tee: M('#1a1a20', { heat: 0.8 }), skirt: M('#3f2f4e', { heat: 0.62 }), legs: M('#d6bcae', { heat: 0.85 }), sock: M('#f2efe8', { dk: 0.38, heat: 0.6 }),
    shoe: M(PAL('granny', '#ff6fb5'), { acc: 1, dk: 0.46, heat: 0.25 }), sole: M('#f4f2ee', { dk: 0.46, heat: 0.2 }),
    frame: M(PAL('granny', '#ff6fb5'), { acc: 1, dk: 0.66, heat: 0.2, rk: 1.2 }), pouch: M('#e9609f', { acc: 1, dk: 0.42, heat: 0.3 }),
    burnt: M('#3a1626', { acc: 1, dk: 0.3, heat: 0.1 }), singe: M('#bdb5a8', { dk: 0.42, heat: 0.1 }), skirtB: M('#21181f', { heat: 0.1 }),
  };
  const GR_HEAD = [[0, -0.02, 0, 1, 1, 0.95], [0.22, 0.42, 0, 0.72, 0.58, 0.8], [0.94, 0.16, 0, 0.17, 0.15, 0.12],
    [-0.05, 0.1, -0.95, 0.15, 0.22, 0.12], [-0.05, 0.1, 0.95, 0.15, 0.22, 0.12]];
  const grHive = (t, w, flip) => {
    const sw = 0.04 * sin(t * 2.3) + 0.06 * flip - 0.05 * w;
    return [[-0.1, -0.8, 0, 1.02, 0.56, 1.02], [-0.16 + sw, -1.38, 0, 0.94, 0.86, 0.94], [-0.2 + sw * 2, -2.0, 0, 0.86, 0.9, 0.86],
      [-0.22 + sw * 3, -2.62, 0, 0.7, 0.72, 0.7], [-0.22 + sw * 3.6, -3.05, 0, 0.42, 0.36, 0.42],
      [0.24, -0.58, 0, 0.74, 0.32, 0.88], [0.16, -0.05, -0.9, 0.2, 0.3, 0.16], [0.16, -0.05, 0.9, 0.2, 0.3, 0.16]];
  };
  const GR_NAPE = [[-0.6, -0.12, 0, 0.52, 0.66, 0.86]];
  function catEyes(R, J, H, m, t) {
    const eyes = [sph(H, -0.42, -0.06, 1.02), sph(H, 0.42, -0.06, 1.02)];
    const up = [sin(H.rot), -cos(H.rot)], fr = new Path2D(), gl = new Path2D(), r = H.r;
    const br = H.f(1.02, -0.08, 0);
    const vis = [];
    for (let i = 0; i < 2; i++) {
      const q = eyes[i];
      if (q[2] < -0.15) continue;
      const sq = clamp(q[2] + 0.25, 0.28, 1), rx = 0.27 * r * sq, ry = 0.2 * r;
      let out = sub(q, br); const ol = hypot(out[0], out[1]);
      out = ol > 0.5 ? [out[0] / ol, out[1] / ol] : [(i ? 1 : -1) * (H.sy >= 0 ? 1 : -1), 0];
      if (i === 0 && H.cy > 0.6) out = [-1 * Math.sign(H.cy || 1), 0];
      ell(fr, q[0], q[1], rx + 0.06 * r, ry + 0.05 * r, H.rot);
      const w0 = add(add(q, out, rx * 0.35), up, ry * 0.75), w1 = add(add(q, out, rx * 1.25 + 0.16 * r), up, ry + 0.2 * r), w2 = add(add(q, out, rx * 0.95), up, -ry * 0.05);
      fr.moveTo(w0[0], w0[1]); fr.lineTo(w1[0], w1[1]); fr.lineTo(w2[0], w2[1]); fr.closePath();
      ell(gl, q[0], q[1], rx, ry, H.rot);
      vis.push(q);
    }
    if (vis.length === 2) { const a = vis[0], b = vis[1]; capsule(fr, a[0], a[1] - 0.04 * r, 0.05 * r, b[0], b[1] - 0.04 * r, 0.05 * r); }
    const ear = H.f(-0.1, 0.0, -0.96);
    if (vis.length && H.cy > -0.2) { const a = vis[0]; capsule(fr, a[0], a[1] - 0.05 * r, 0.06 * r, ear[0], ear[1] - 0.05 * r, 0.05 * r); }
    paint(R, fr, m);
    if (!R.thermal) { R.ctx.fillStyle = css([20, 28, 52], 0.72); R.ctx.fill(gl); }
    else paint(R, gl, m);
    // the glint: always on, flaring now and then
    if (vis.length && !R.thermal) {
      const q = vis[vis.length - 1], g = 0.45 + 0.55 * pow(max(0, sin(t * 0.85 + 0.4)), 14);
      const c = add(add(q, up, 0.06 * r), [-0.06 * r, 0]), s = 0.2 * r * (0.6 + 0.6 * g);
      const st = new Path2D();
      st.moveTo(c[0], c[1] - s); st.lineTo(c[0] + s * 0.18, c[1] - s * 0.18); st.lineTo(c[0] + s, c[1]); st.lineTo(c[0] + s * 0.18, c[1] + s * 0.18);
      st.lineTo(c[0], c[1] + s); st.lineTo(c[0] - s * 0.18, c[1] + s * 0.18); st.lineTo(c[0] - s, c[1]); st.lineTo(c[0] - s * 0.18, c[1] - s * 0.18); st.closePath();
      R.ctx.fillStyle = css(WHITE, 0.6 + 0.4 * g); R.ctx.fill(st);
      glowAt(R, c[0], c[1], r * (0.45 + 0.6 * g), '#ffffff', 0.35 + 0.5 * g, 'hot');
    }
    return eyes;
  }
  function skirtPanel(R, J, m, X, lenK) {
    const t = R.t, w = clamp(J.P.wind || 0);
    const H = J.hipC, u1 = unit(sub(J.mid, H)), p1 = perpF(u1), dn = [-u1[0], -u1[1]];
    const top = lerp2(H, J.mid, 0.45), u2 = unit(sub(J.neckB, J.mid)), pm = perpF(unit(add(u1, u2)));
    const tf = extF(J, X.waist) + 1.5, tb = extB(J, X.waist) + 1.5;
    const len = J.def.thigh * (lenK || 1) + 4, hc = add(H, dn, len);
    let hf = extF(J, X.hip) * 1.45 + 4, hb = extB(J, X.hip) * 1.45 + 4;
    for (const sd of SIDES) {
      const k = J.leg[sd].knee, oo = (k[0] - hc[0]) * p1[0] + (k[1] - hc[1]) * p1[1];
      hf = max(hf, oo + J.def.r.thigh[1] + 5); hb = max(hb, -oo + J.def.r.thigh[1] + 5);
    }
    const sway = 2.2 * sin(t * 1.7) - w * 12;
    const F1 = add(add(hc, p1, hf + sway), dn, -3), B1 = add(add(hc, p1, -hb + sway * 1.2), dn, 2);
    const T1 = add(top, pm, tf), T2 = add(top, pm, -tb);
    const MF = add(H, p1, extF(J, X.hip) + 2.5), MB = add(H, p1, -(extB(J, X.hip) + 3));
    let pts = [T1[0], T1[1], MF[0], MF[1], F1[0], F1[1], F1[0], F1[1]];
    if (R.skel) pts = pts.concat(ragged(pts, F1, B1, 7, 10, 11, u1[0], u1[1]));
    else { const hm = add(lerp2(F1, B1, 0.5), dn, 3); pts.push(hm[0], hm[1]); }
    pts.push(B1[0], B1[1], B1[0], B1[1], MB[0], MB[1], T2[0], T2[1]);
    const p = new Path2D(); smoothClosed(p, pts); paint(R, p, m);
    detail(R, () => {
      const pl = new Path2D();
      for (const k of [0.3, 0.55, 0.8]) { const a = lerp2(T2, T1, k), b = lerp2(B1, F1, k); pl.moveTo(a[0], a[1]); pl.lineTo(b[0], b[1]); }
      strokeP(R, pl, mix(m.c, NIGHT, 0.45), 1.1, 0.7);
    });
  }
  LOOK.granny = {
    who: 'granny', def: DEFS.granny, expr: 'deadpan', m: GRM, X2: X_PLUS(DEFS.granny.X, 1.6), inst: 1, gunScale: 1,
    props: { def: 'shotgun', gun: 'shotgun', instrument: 'guitar', sing: 'guitar', hero: 'shotgun', drum: null, preen: null },
    topOf(J) { return blobTop(headFrame(J), grHive(J.t, clamp(J.P.wind || 0), J.P.hairFlip || 0)); },
    leg(R, J, sd) {
      const j = J.leg[sd], r = this.def.r;
      if (R.skel) { boneLimb(R, j.hip, j.knee, j.ankle, r.thigh[0]); shoe(R, J, sd, 'chunky', this.m.burnt, this.m.singe); return; }
      limb4(R, j.hip, j.knee, j.ankle, r.thigh[0], r.thigh[1], r.shin[0], r.shin[1], this.m.legs);
      const sk = new Path2D(); cap(sk, lerp2(j.knee, j.ankle, 0.8), r.shin[1] + 1.3, j.ankle, r.shin[1] + 1.2); paint(R, sk, this.m.sock);
      shoe(R, J, sd, 'chunky', this.m.shoe, this.m.sole);
    },
    arm(R, J, sd) {
      const j = J.arm[sd], r = this.def.r;
      if (R.skel) { boneLimb(R, j.sh, j.el, j.ha, r.upper[0] * 0.8); const p = new Path2D(); cap(p, j.sh, r.upper[0] + 0.5, lerp2(j.sh, j.el, 0.7), r.upper[1]); paint(R, p, this.m.burnt); return; }
      const cuff = add(j.ha, unit(sub(j.el, j.ha)), 2);
      limb4(R, j.sh, j.el, cuff, r.upper[0], r.upper[1], r.fore[0], r.fore[1], this.m.cardi);
    },
    hand(R, J, sd) { drawHand(R, J, sd, this.m.skin); },
    torso(R, J, o) {
      skirtPanel(R, J, R.skel ? this.m.skirtB : this.m.skirt, this.X2);
      const T = torsoGeo(J, this.X2, { breath: breathK(R, J), drop: 4 });
      if (R.skel) { upperRemnant(R, T, this.m.burnt); ribcage(R, J, this.def.X); return; }
      paint(R, T.path, this.m.cardi);
      const ctx = R.ctx;
      ctx.save(); ctx.clip(T.path);
      paint(R, stripPath(J, T, (k) => 6.5 - 1.5 * k, 0, 1), inner(this.m.tee));
      ctx.restore();
      detail(R, () => {
        const c = frontLine(T, J, T.L3, T.p2, T.eC[0]), p = new Path2D();
        circle(p, c[0], c[1] - 1, 2.6); fillP(R, p, [210, 40, 60]);
        const bt = new Path2D();
        for (const k of [0.25, 0.45, 0.65]) { const q = lerp2(T.L4, T.Hc, k), f = add(q, lerp2(T.p2, T.p1, k), extF(J, this.X2.chest) * J.cP * 0.96 - 7.5 * J.sP); circle(bt, f[0], f[1], 1.3); }
        fillP(R, bt, [255, 225, 240]);
      });
      // pearls
      const u2 = unit(sub(J.neckB, J.mid)), p2 = perpF(u2), nw = this.def.neckW + 2.5, pr = new Path2D();
      for (let i = -5; i <= 5; i++) {
        const ph = i * 0.27, X = nw * cos(ph), Z = nw * sin(ph), dep = X * J.sP - Z * J.cP * 0;
        if (dep < -0.5 && J.sP > 0.3) continue;
        const dr = 4.5 * cos(ph);
        const q = add(add(J.neckB, p2, X * J.cP + Z * J.sP), u2, -dr + 1.5);
        circle(pr, q[0], q[1], 1.25);
      }
      paint(R, pr, this.m.sock);
      if (R.PR && R.PR.kind === 'shotgun') {
        const q = pouchPos(J), pp = new Path2D();
        polyC(pp, [q[0] - 5, q[1] - 6, q[0] + 5, q[1] - 6, q[0] + 6, q[1] + 6, q[0] - 6, q[1] + 7]);
        const sh = new Path2D(); for (const dx of [-2.5, 0.5, 3.5]) capsule(sh, q[0] + dx, q[1] - 6, 1.5, q[0] + dx, q[1] - 9, 1.5);
        paint(R, sh, PM.shell); paint(R, pp, this.m.pouch);
        detail(R, () => { const d = new Path2D(); for (let i = 0; i < 6; i++) circle(d, q[0] - 3.5 + (i % 3) * 3.5, q[1] - 2 + floor(i / 3) * 4, 0.8); fillP(R, d, [255, 200, 225], 0.8); });
      }
    },
    head(R, J, o) {
      const H = headFrame(J), t = R.t, w = clamp(J.P.wind || 0);
      const np = new Path2D(); cap(np, J.neckB, this.def.neckW, J.neckT, this.def.neckW * 0.9); paint(R, np, R.skel ? BONE : this.m.skin);
      const nh = new Path2D(); blobs(nh, H, GR_NAPE); paint(R, nh, R.skel ? this.m.singe : this.m.hair);
      if (R.skel) skullHead(R, H, { jaw: 0.15 });
      else {
        const hp = new Path2D(); blobs(hp, H, GR_HEAD); paint(R, hp, this.m.skin);
        J.eyes = drawFace(R, H, { expr: R.expr, mouth: J.P.mouth, eye: 'dot', lips: [212, 80, 128], mouthW: 0.8, browC: [190, 185, 180], eyeR: 0.95 });
        detail(R, () => { const rg = new Path2D(); for (const sd of [-1, 1]) { const q = sph(H, sd * 0.55, 0.3, 0.98); if (q[2] > 0.1) ell(rg, q[0], q[1], 0.16 * H.r * q[2], 0.1 * H.r, H.rot); } fillP(R, rg, [240, 110, 150], 0.35); });
      }
      const hv = grHive(t, w, J.P.hairFlip || 0), hp2 = new Path2D(); blobs(hp2, H, hv);
      paint(R, hp2, R.skel ? this.m.singe : this.m.hair);
      if (!R.thermal) detail(R, () => {
        const sp = new Path2D(), pts = [];
        for (let i = 0; i <= 28; i++) { const a = i * 0.42, rr = 0.75 - i * 0.022; const q = H.f(-0.2 + rr * cos(a) * 0.3, -1.25 - i * 0.055, rr * sin(a) * 0.95); if (q[2] > -0.1) pts.push(q[0], q[1]); else if (pts.length > 2) { smoothOpen(sp, pts); pts.length = 0; } else pts.length = 0; }
        if (pts.length > 2) smoothOpen(sp, pts);
        strokeP(R, sp, [190, 186, 196], max(0.8, 0.055 * H.r), 0.75);
      });
      J.eyes = catEyes(R, J, H, this.m.frame, t) || J.eyes;
      J.top = blobTop(H, hv);
      J.mouth = sph(H, 0, 0.46, 1);
      if (R.accent > 0 && !R.thermal) { const q = sph(H, 0, -0.06, 1.05); glowAt(R, q[0], q[1], H.r * 1.3, PAL('granny', '#ff6fb5'), R.accent * 0.16); }
    },
  };

  const TNM = {
    skin: M('#c48e68', { heat: 1 }), beard: M('#4e2f1f', { heat: 0.55 }), beanie: M('#d39d2c', { dk: 0.22, heat: 0.48 }),
    tank: M('#34414f', { heat: 0.78 }), jeans: M('#2c303b', { heat: 0.66 }), boot: M('#3e2c1e', { heat: 0.24 }),
    burnt: M('#1c1a1c', { heat: 0.1 }), drum: M('#8a1a22', { dk: 0.2, heat: 0.12 }), head: M('#ece6d8', { dk: 0.34, heat: 0.12 }),
  };
  const TN_HEAD = [[0, 0, 0, 1, 0.98, 0.96], [0.2, 0.45, 0, 0.78, 0.6, 0.86], [0.96, 0.2, 0, 0.26, 0.23, 0.18],
    [-0.04, 0.12, -0.97, 0.18, 0.26, 0.14], [-0.04, 0.12, 0.97, 0.18, 0.26, 0.14]];
  const TN_BEARD = [[0.38, 0.6, 0, 0.74, 0.62, 0.84], [0.55, 1.02, 0, 0.52, 0.52, 0.6], [0.02, 0.35, -0.75, 0.35, 0.52, 0.3],
    [0.02, 0.35, 0.75, 0.35, 0.52, 0.3], [0.86, 0.33, 0, 0.26, 0.13, 0.42]];
  const TN_BEANIE = [[-0.1, -0.64, 0, 1.05, 0.7, 1.03], [-0.18, -1.02, 0, 0.8, 0.5, 0.82], [-0.04, -0.42, 0, 1.08, 0.24, 1.05]];
  function drumKitBack(R, J) {
    const u2 = unit(sub(J.neckB, J.mid)), p2 = perpF(u2);
    const c = add(add(J.mid, p2, -(extB(J, J.def.X.chest) + 46)), u2, 26);
    const p = new Path2D(); circle(p, c[0], c[1], 58); paint(R, p, TNM.drum);
    const hd = new Path2D(); ell(hd, c[0] + 8 * J.sP, c[1], 52 * (0.3 + 0.7 * J.sP), 52, 0); paint(R, hd, TNM.head);
    const tm = new Path2D(); const tc = add(c, u2, 66); ell(tm, tc[0], tc[1], 26, 18, 0); paint(R, tm, TNM.drum);
    const cy = new Path2D(); const cc = add(add(c, u2, 96), p2, -20); ell(cy, cc[0], cc[1], 34, 6, -0.25); paint(R, cy, PM.brass);
    const st = new Path2D(); cap(st, add(c, p2, 30), 3, add(J.arm.f.sh, [0, 0]), 3); cap(st, add(c, p2, 30), 3, add(J.mid, [0, 10]), 3); paint(R, st, PM.tapeBlack);
    detail(R, () => {
      if (R.ppu * 18 > 9) {
        const ctx = R.ctx; ctx.save(); ctx.translate(c[0] + 8 * J.sP, c[1]); if (R.face < 0) ctx.scale(-1, 1);
        ctx.font = NS.font(15, NS.F.logo); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = css([30, 20, 24]);
        ctx.fillText('NO', 0, -9); ctx.fillText('SURVIVORS', 0, 9); ctx.restore();
      }
    });
  }
  LOOK.tiny = {
    who: 'tiny', def: DEFS.tiny, expr: 'neutral', m: TNM, X2: X_PLUS(DEFS.tiny.X, 1), batLen: 118,
    adj(P) { const q = Object.assign({}, P); const lean = P.torso || 0; q.nsh = (P.nsh || 0) + 0.3 * clamp(1 - abs(P.nsh || 0) / 1.2); q.fsh = (P.fsh || 0) + 0.22 * clamp(1 - abs(P.fsh || 0) / 1.2); q.nas = (P.nas || 0) + 0.06; void lean; return q; },
    props: { def: 'bats' },
    topOf(J) { return blobTop(headFrame(J), TN_BEANIE); },
    back(R, J, o) { if (o.kitOnBack) drumKitBack(R, J); },
    leg(R, J, sd) {
      const j = J.leg[sd], r = this.def.r;
      if (R.skel) { boneLimb(R, j.hip, j.knee, j.ankle, r.thigh[0] * 0.8); shoe(R, J, sd, 'boot', this.m.burnt); return; }
      limb4(R, j.hip, j.knee, j.ankle, r.thigh[0], r.thigh[1], r.shin[0], r.shin[1], this.m.jeans);
      shoe(R, J, sd, 'boot', this.m.boot);
    },
    arm(R, J, sd) {
      const j = J.arm[sd], r = this.def.r;
      if (R.skel) { boneLimb(R, j.sh, j.el, j.ha, r.upper[0] * 0.75); return; }
      limb4(R, j.sh, j.el, j.ha, r.upper[0], r.upper[1], r.fore[0], r.fore[1], this.m.skin);
      if (sd === 'n') detail(R, () => {
        const q = lerp2(j.sh, j.el, 0.5), p = new Path2D(), s = 5.5;
        p.moveTo(q[0], q[1] + s); p.bezierCurveTo(q[0] - s * 1.6, q[1] - s * 0.2, q[0] - s * 0.6, q[1] - s * 1.3, q[0], q[1] - s * 0.4);
        p.bezierCurveTo(q[0] + s * 0.6, q[1] - s * 1.3, q[0] + s * 1.6, q[1] - s * 0.2, q[0], q[1] + s); fillP(R, p, [40, 70, 110], 0.75);
      });
    },
    hand(R, J, sd) { drawHand(R, J, sd, this.m.skin); },
    torso(R, J) {
      const T = torsoGeo(J, this.X2, { breath: breathK(R, J) * 1.4, drop: 20, delt: 0.6 });
      if (R.skel) { ribcage(R, J, this.def.X); return; }
      paint(R, T.path, this.m.tank);
      detail(R, () => {
        const p = new Path2D(); const c = frontLine(T, J, T.L3, T.p2, T.eC[0]);
        ell(p, c[0] - 6 * J.sP, c[1] + 4, 7, 8, 0); strokeP(R, p, [200, 170, 60], 1.4, 0.6);
        const hm = new Path2D(); const a = add(T.L0, T.p1, T.e0[0] * 0.95), b = add(T.L0, T.p1, -T.e0[1] * 0.95); hm.moveTo(a[0], a[1] - 4); hm.lineTo(b[0], b[1] - 4);
        strokeP(R, hm, [20, 24, 30], 1.6, 0.6);
      });
    },
    head(R, J) {
      const H = headFrame(J);
      const np = new Path2D(); cap(np, J.neckB, this.def.neckW, J.neckT, this.def.neckW * 0.95); paint(R, np, R.skel ? BONE : this.m.skin);
      if (R.skel) skullHead(R, H, { wide: 1.15, jaw: 0.2 });
      else {
        const hp = new Path2D(); blobs(hp, H, TN_HEAD); paint(R, hp, this.m.skin);
        const bd = new Path2D(); blobs(bd, H, TN_BEARD); paint(R, bd, this.m.beard);
        J.eyes = drawFace(R, H, { expr: R.expr, mouth: J.P.mouth, eye: 'dot', eyeR: 1.0, eyeEl: -0.04, eyeAz: 0.38, browC: [70, 42, 26], browW: 1.7, mouthEl: 0.6, mouthW: 0.95 });
      }
      const bn = new Path2D(); blobs(bn, H, TN_BEANIE); paint(R, bn, this.m.beanie);
      detail(R, () => { const p = new Path2D(); for (let i = -4; i <= 4; i++) { const a = sph(H, i * 0.3, -0.44, 1.08), b = sph(H, i * 0.3, -0.72, 1.06); if (a[2] > 0) { p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); } } strokeP(R, p, [120, 80, 20], 1, 0.6); });
      J.top = blobTop(H, TN_BEANIE);
      J.mouth = sph(H, 0, 0.58, 1);
    },
  };

  const NDM = {
    skin: M('#f2caa6', { heat: 1 }), hoodie: M(PAL('noodle', '#ff8a1f'), { acc: 1, dk: 0.42, heat: 0.66 }),
    hood2: M('#d66c1c', { acc: 1, dk: 0.34, heat: 0.55 }), jeans: M('#2e3b5c', { heat: 0.66 }), shoe: M('#ddd7cb', { dk: 0.34, heat: 0.25 }),
    sole: M('#f4f2ee', { dk: 0.42, heat: 0.2 }), hair: M('#5e3d25', { heat: 0.4 }), lamp: M('#26272b', { heat: 0.2, rk: 1.2 }),
    burnt: M('#5a2a10', { acc: 1, dk: 0.28, heat: 0.1 }), soleB: M('#4a443c', { heat: 0.1 }),
  };
  const ND_HEAD = [[0, -0.03, 0, 0.96, 1, 0.88], [0.3, 0.48, 0, 0.6, 0.5, 0.6], [0.94, 0.16, 0, 0.18, 0.16, 0.12],
    [-0.05, 0.1, -0.9, 0.15, 0.24, 0.13], [-0.05, 0.1, 0.9, 0.15, 0.24, 0.13]];
  const ND_HOOD = [[-0.34, -0.1, 0, 1.36, 1.32, 1.28], [-0.82, 0.62, 0, 0.78, 0.82, 1.12], [-0.55, -0.85, 0, 0.82, 0.5, 0.9]];
  const ND_BRIM = [[-0.18, -0.16, 0, 1.3, 1.28, 1.26]];
  const ND_FACE = [0.78, 0.24, 0, 0.96, 1.1, 0.9];
  LOOK.noodle = {
    who: 'noodle', def: DEFS.noodle, expr: 'scared', m: NDM, X2: X_PLUS(DEFS.noodle.X, 1), inst: 1,
    props: { def: 'wrench', instrument: 'bass', sing: 'bass', gun: 'wrench', drum: null, light: 'flashlight' },
    topOf(J, o) { const H = headFrame(J); return blobTop(H, o && o.zap > 0.5 ? [[0, -1.6, 0, 0.6, 0.3, 0.6]] : ND_HOOD); },
    leg(R, J, sd) {
      const j = J.leg[sd], r = this.def.r;
      if (R.skel) { boneLimb(R, j.hip, j.knee, j.ankle, r.thigh[0]); shoe(R, J, sd, 'sneaker', this.m.burnt, this.m.soleB); return; }
      limb4(R, j.hip, j.knee, j.ankle, r.thigh[0], r.thigh[1], r.shin[0], r.shin[1], this.m.jeans);
      shoe(R, J, sd, 'sneaker', this.m.shoe, this.m.sole);
      detail(R, () => { const p = new Path2D(); for (const k of [0.25, 0.42]) { const a = footPt(J, sd, k, -0.1), b = footPt(J, sd, k + 0.12, 0.2); p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]); } strokeP(R, p, PAL('noodle', '#ff8a1f'), 1.5); });
    },
    arm(R, J, sd) {
      const j = J.arm[sd], r = this.def.r;
      if (R.skel) boneLimb(R, j.sh, j.el, j.ha, r.upper[0] * 0.6);
      const cuff = add(j.ha, unit(sub(j.el, j.ha)), R.skel ? 14 : 1);
      const p = new Path2D(); cap(p, j.sh, r.upper[0], j.el, r.upper[1]); cap(p, j.el, r.fore[0], cuff, r.fore[1] * 1.08);
      paint(R, p, R.skel ? this.m.burnt : this.m.hoodie);
    },
    hand(R, J, sd) { drawHand(R, J, sd, this.m.skin, null, 0.95); },
    torso(R, J) {
      const T = torsoGeo(J, this.X2, { breath: breathK(R, J), drop: this.def.pelvis, flare: 0.08 });
      if (R.skel) {
        const ctx = R.ctx, rg = new Path2D(), pts = [];
        const a = add(T.L0, T.p1, T.e0[0] + 2), b = add(T.L0, T.p1, -T.e0[1] - 2);
        for (let i = 0; i <= 8; i++) { const q = lerp2(b, a, i / 8); pts.push(q[0] + T.u1[0] * (H01(i, 9) * 14), q[1] + T.u1[1] * (H01(i, 9) * 14)); }
        polyC(rg, pts.concat([a[0] + T.u1[0] * 300, a[1] + T.u1[1] * 300, b[0] + T.u1[0] * 300, b[1] + T.u1[1] * 300]));
        ctx.save(); ctx.clip(rg); paint(R, T.path, this.m.burnt); ctx.restore();
        return;
      }
      paint(R, T.path, this.m.hoodie);
      detail(R, () => {
        const c = frontLine(T, J, T.Hc, T.p1, T.eH[0]), w = 6 + 9 * J.sP, p = new Path2D();
        p.moveTo(c[0] - w, c[1] - 12); p.lineTo(c[0] + w, c[1] - 12); p.lineTo(c[0] + w * 1.2, c[1] + 8); p.lineTo(c[0] - w * 1.2, c[1] + 8); p.closePath();
        strokeP(R, p, [150, 70, 10], 1.3, 0.8);
        const d = new Path2D(), n = frontLine(T, J, T.L5, T.p2, J.def.neckW + 2);
        for (const sd of [-1, 1]) { const a = add(n, [sd * 3 * J.sP, 2]), b = add(a, [sd * 0.5, 16 + 2 * sin(R.t * 2 + sd)]); d.moveTo(a[0], a[1]); d.lineTo(b[0], b[1]); }
        strokeP(R, d, [240, 230, 210], 1.2, 0.9);
      });
    },
    head(R, J, o) {
      const H = headFrame(J), t = R.t, zap = clamp(o.zap || 0), lampOn = o.lamp == null ? 1 : clamp(o.lamp);
      const hoodUp = zap < 0.5;
      const hm = R.skel ? this.m.burnt : this.m.hoodie;
      if (hoodUp) { const hb = new Path2D(); blobs(hb, H, ND_HOOD); paint(R, hb, R.skel ? this.m.burnt : this.m.hood2); }
      else { const hb = new Path2D(); const q = add(J.neckB, unit(sub(J.mid, J.neckB)), -2); const u2 = unit(sub(J.neckB, J.mid)); ell(hb, q[0] - perpF(u2)[0] * 10, q[1] + 4, 20, 13, 0); paint(R, hb, this.m.hood2); }
      const np = new Path2D(); cap(np, J.neckB, this.def.neckW, J.neckT, this.def.neckW * 0.9); paint(R, np, R.skel ? BONE : this.m.skin);
      if (R.skel) skullHead(R, H, { jaw: 0.25 });
      else {
        const hp = new Path2D(); blobs(hp, H, ND_HEAD); paint(R, hp, this.m.skin);
        J.eyes = drawFace(R, H, { expr: R.expr, mouth: J.P.mouth, eye: 'white', eyeR: 1.05, braces: 1, browC: [80, 52, 32] });
      }
      if (!hoodUp) {
        // ZZZAP: hair straight up
        const hp = new Path2D(), pts = [];
        for (let i = 0; i <= 10; i++) {
          const a = -1.25 + i * 0.25, base = sph(H, 0, a * 0.9 - 0.15 - PI / 2 * 0, 1);
          const b0 = H.f(0.85 * sin(a + 0.15), -0.55 - 0.35 * cos(a), 0);
          const tip = [b0[0] + sin(a) * H.r * 0.25, b0[1] - H.r * (1.0 + 0.25 * H01(i, 3)) * (0.4 + 0.6 * zap)];
          pts.push(b0[0], b0[1], tip[0], tip[1]);
          void base;
        }
        const c0 = H.f(1.0, -0.4, 0), c1 = H.f(-0.95, -0.35, 0);
        polyC(hp, [c1[0], c1[1]].concat(pts).concat([c0[0], c0[1], H.x, H.y - H.r * 0.2]));
        paint(R, hp, this.m.hair);
      } else {
        const fr = new Path2D(); blob(fr, H, 0.6, -0.62, 0, 0.42, 0.28, 0.62); paint(R, fr, R.skel ? this.m.burnt : this.m.hair);
        const ctx = R.ctx, hole = new Path2D();
        hole.rect(H.x - 400, H.y - 400, 800, 800);
        blob(hole, H, ND_FACE[0], ND_FACE[1], ND_FACE[2], ND_FACE[3], ND_FACE[4], ND_FACE[5]);
        const brim = new Path2D(); blobs(brim, H, ND_BRIM);
        ctx.save(); ctx.clip(hole, 'evenodd'); paint(R, brim, hm); ctx.restore();
      }
      // headlamp: strap and lamp on the forehead
      const flick = zap > 0 ? (H01(floor(t * 24), 77) > 0.35 + 0.4 * zap ? 1 : 0.15) : 1;
      const lr = hoodUp ? 1.3 : 1.04;
      const st = new Path2D(); const s0 = sph(H, -1.3, -0.48, lr * 0.99), s1 = sph(H, 0, -0.5, lr), s2 = sph(H, 1.3, -0.48, lr * 0.99);
      st.moveTo(s0[0], s0[1]); st.quadraticCurveTo(2 * s1[0] - 0.5 * (s0[0] + s2[0]), 2 * s1[1] - 0.5 * (s0[1] + s2[1]), s2[0], s2[1]);
      if (!R.thermal) strokeP(R, st, [30, 30, 34], max(1, 0.14 * H.r));
      const L = sph(H, 0, -0.5, lr + 0.06), lp = new Path2D();
      ell(lp, L[0], L[1], 0.24 * H.r * clamp(abs(H.cy) + 0.5, 0.5, 1), 0.2 * H.r, H.rot);
      paint(R, lp, this.m.lamp);
      const fd = sub(H.f(1, -0.5, 0), H.f(0, -0.5, 0)), fa = atan2(fd[1], fd[0]);
      const toward = clamp(H.sy * cos(H.pitch) * 1.05);
      const lens = add(L, unit(fd), 0.12 * H.r * clamp(abs(H.cy), 0, 1));
      const on = lampOn * flick;
      if (!R.thermal) {
        const lz = new Path2D(); ell(lz, lens[0], lens[1], 0.13 * H.r * (0.35 + 0.65 * toward) + 0.05 * H.r, 0.13 * H.r, H.rot);
        R.ctx.fillStyle = css(mix([60, 70, 80], col(PAL('lamp', '#cff8ff')), on)); R.ctx.fill(lz);
        if (on > 0.05) { glowAt(R, lens[0], lens[1], H.r * (0.7 + 0.9 * toward), PAL('lamp', '#cff8ff'), 0.85 * on, 'hot'); glowAt(R, lens[0], lens[1], H.r * (1.6 + 2.5 * toward), PAL('lamp', '#cff8ff'), 0.25 * on); }
      }
      J.lamp = [lens[0], lens[1], fa, toward];
      J.top = blobTop(H, hoodUp ? ND_HOOD : [[0, -1.7, 0, 0.6, 0.3, 0.6]]);
      J.mouth = sph(H, 0, 0.46, 1);
      if (R.accent > 0 && !R.thermal && !R.skel) { const q = add(J.neckB, unit(sub(J.mid, J.neckB)), 30); glowAt(R, q[0], q[1], 60, PAL('noodle', '#ff8a1f'), R.accent * 0.1); }
    },
  };

  // ------------------------------------------------------------------------------------------ zombies (and the same crowd as people)
  const OUTFITS = ['punk', 'metal', 'office', 'mascot', 'clown', 'cheer', 'guard', 'tour', 'hoodie', 'robe', 'jogger', 'rocker'];
  const ZSKIN = ['#7f9868', '#6e8a5a', '#8c9c74', '#758a6c', '#98a888', '#86946a'];
  const HSKIN = ['#f1c8a8', '#e0ad86', '#b97f58', '#8a5a3c', '#f3d2b8', '#c99572', '#6e4630'];
  const ZHAIR = ['#1c1814', '#3a2618', '#5a3a20', '#8a6a3a', '#b8b0a0', '#2a2220'];
  const UVM = () => M(PAL('uv', '#c86bff'), { glow: 1, heat: 0.3 });
  const M_TEE = M('#151418', { heat: 0.78 });
  const ZCACHE = new Map();
  function zombieLook(seed, style) {
    seed = Math.round(+seed || 0);
    const human = style === 'human';
    const key = seed + (human ? 'h' : 'z');
    let L = ZCACHE.get(key);
    if (L) return L;
    const rnd = NS.rng(seed * 7919 + 101);
    const pk = (a) => a[floor(rnd() * a.length) % a.length];
    const outfit = OUTFITS[((seed % 12) + 12) % 12];
    let h = 0.88 + rnd() * 0.26, w = 0.86 + rnd() * 0.42;
    if (outfit === 'mascot') { w = 1.28 + rnd() * 0.18; h = 0.95 + rnd() * 0.1; }
    if (outfit === 'cheer' || outfit === 'rocker' || outfit === 'jogger') w = 0.82 + rnd() * 0.14;
    if (outfit === 'guard') w = 1.12 + rnd() * 0.3;
    if (outfit === 'robe') h = 0.86 + rnd() * 0.1;
    const def = scaleDef(DEFS.zombie, h, w);
    if (outfit === 'cheer' || outfit === 'rocker') { def.X = Object.assign({}, def.X, { waist: def.X.waist.map((v) => v * 0.82), chest: def.X.chest.map((v) => v * 0.95) }); }
    const skinC = human ? pk(HSKIN) : mix(pk(ZSKIN), pk(HSKIN), 0.25 + rnd() * 0.15);
    const C = {
      punk: ['#1d1d24', '#b02436', '#34405a', '#18161a', pk(['#e0206a', '#3fd04a', '#2f86ff', '#f0c020'])],
      metal: ['#151418', '#41557a', '#1c1c22', '#201c1a', pk(ZHAIR)],
      office: ['#d9d8d0', pk(['#b02030', '#203a90', '#2a6a3a']), '#3e3e48', '#18161a', pk(ZHAIR)],
      mascot: [pk(['#2f86c0', '#d6702a', '#3f9a4a', '#c0402e']), '#f0e8d8', '#000000', '#000000', '#000000'],
      clown: [pk(['#d03a3a', '#2a8ad0', '#e0b020', '#2aa070']), '#f4f2ea', pk(['#2a8ad0', '#d03a3a', '#2aa070']), '#d02a2a', pk(['#ff7a1a', '#3fd04a', '#2f86ff'])],
      cheer: [pk(['#c0303a', '#2a50b0', '#2a8a4a', '#e0a020']), '#f2efe6', '#f2efe6', '#f2efe6', pk(['#e8c060', '#6a4020', '#2a1c14', '#c05a2a'])],
      guard: ['#232c42', '#e2c23a', '#1e2230', '#141416', pk(ZHAIR)],
      tour: ['#131216', '#d0242e', pk(['#3a4660', '#1c1c22', '#4a4a50']), '#1e1a1a', pk(ZHAIR)],
      hoodie: [pk(['#6a6e76', '#3c5a3c', '#5a2430', '#2c3e66']), '#d8d4c8', '#2e3448', '#e8e4d8', pk(ZHAIR)],
      robe: [pk(['#8fb0c8', '#c8a0a8', '#a8b890']), '#eeeae0', '#5a6a8a', '#8a6a5a', '#d8d4cc'],
      jogger: [pk(['#2a5ab0', '#b02a3a', '#2a2a30', '#2a8a6a']), '#f2f0ea', pk(['#2a2a30', '#2a5ab0']), '#f2f0ea', pk(ZHAIR)],
      rocker: ['#121114', '#e8e2d6', '#201c22', '#18161a', pk(['#e8c060', '#d0402a', '#1c1814', '#f0e0b0'])],
    }[outfit];
    L = Object.create(ZLOOK);
    Object.assign(L, {
      who: 'zombie', seed, outfit, def, human, expr: 'neutral',
      hunch: human ? rnd() * 0.08 : 0.04 + rnd() * 0.3, tilt: (rnd() - 0.5) * (human ? 0.2 : 0.55), armOff: (rnd() - 0.5) * 0.45,
      jaw: human ? rnd() * 0.25 : 0.25 + rnd() * 0.5, wb: rnd() < 0.5 ? 'f' : 'n', missShoe: rnd() < 0.22 ? (rnd() < 0.5 ? 'f' : 'n') : '',
      bandage: !human && rnd() < 0.18, tornSleeve: !human && rnd() < 0.25 ? (rnd() < 0.5 ? 'f' : 'n') : '', props: { def: null },
      ph: rnd(),
      m: {
        skin: M(outfit === 'clown' && !human ? '#e6e2d8' : skinC, { heat: 1 }), skinRaw: M(skinC, { heat: 1 }),
        top: M(C[0], { heat: 0.75 }), acc: M(C[1], { heat: 0.7, dk: outfit === 'guard' ? 0.3 : 0.12 }), pants: M(C[2], { heat: 0.66 }),
        shoe: M(C[3], { heat: 0.25 }), hair: M(C[4], { heat: 0.4, dk: outfit === 'punk' ? 0.35 : 0.1 }),
        white: M('#f0ece2', { dk: 0.36, heat: 0.4 }), uv: UVM(), fish: M('#1c1a1e', { heat: 0.8 }),
      },
    });
    if (ZCACHE.size > 800) ZCACHE.clear();
    ZCACHE.set(key, L);
    return L;
  }
  function zPose(P, L) {
    const q = Object.assign({}, P);
    q.torso = (P.torso || 0) + L.hunch * 0.5;
    q.head = (P.head || 0) + L.hunch * 0.3 + (L.human ? 0 : 0.05);
    q.hroll = (P.hroll || 0) + L.tilt * 0.45;
    q.fsh = (P.fsh || 0) + L.armOff * 0.4; q.nsh = (P.nsh || 0) - L.armOff * 0.35;
    if (q.mouth == null || q.mouth < L.jaw * 0.6) q.mouth = L.jaw * 0.6;
    if (L.human) { if (q.fhand === 'claw') q.fhand = 'relax'; if (q.nhand === 'claw') q.nhand = 'relax'; }
    return q;
  }
  const ZH_HEAD = (L) => L.human ? [[0, -0.03, 0, 1, 1, 0.92], [0.26, 0.46, 0, 0.66, 0.54, 0.72], [0.94, 0.15, 0, 0.2, 0.18, 0.13],
    [-0.05, 0.1, -0.93, 0.15, 0.24, 0.13], [-0.05, 0.1, 0.93, 0.15, 0.24, 0.13]]
    : [[0, -0.05, 0, 1, 1, 0.9], [0.24, 0.5 + L.jaw * 0.1, 0, 0.64, 0.56 + L.jaw * 0.1, 0.68], [0.94, 0.14, 0, 0.2, 0.18, 0.13],
      [-0.05, 0.1, -0.93, 0.15, 0.24, 0.13], [-0.05, 0.1, 0.93, 0.15, 0.24, 0.13]];
  function zHair(L, t) {
    const o = L.outfit, s = 0.04 * sin(t * 2 + L.ph * 6);
    switch (o) {
      case 'punk': return [[-0.1, -1.0, 0, 0.82, 0.38, 0.16], [0.35, -1.25, 0, 0.32, 0.45, 0.13], [-0.15, -1.38, 0, 0.3, 0.5, 0.13], [-0.6, -1.18, 0, 0.3, 0.42, 0.13]];
      case 'metal': return [[-0.1, -0.62, 0, 1.06, 0.56, 1.02], [0.45, -0.75, 0, 0.55, 0.32, 0.95]];
      case 'office': return [[-0.05, -0.76, 0, 0.95, 0.3, 0.88], [-0.55, -0.2, 0, 0.5, 0.55, 0.92]];
      case 'clown': return [[-0.25, -0.25, -0.95, 0.5, 0.48, 0.38], [-0.25, -0.25, 0.95, 0.5, 0.48, 0.38], [-0.6, -0.5, 0, 0.5, 0.5, 0.8]];
      case 'cheer': return [[-0.05, -0.68, 0, 1.03, 0.46, 0.98], [0.5, -0.65, 0, 0.5, 0.3, 0.9], [-0.7, -1.02, 0, 0.3, 0.26, 0.3]];
      case 'guard': return [[-0.05, -0.62, 0, 1.03, 0.5, 1.0], [0.95, -0.42, 0, 0.62, 0.12, 0.72]];
      case 'tour': return [[-0.1, -0.62, 0, 1.06, 0.55, 1.02], [-0.6, -0.05, 0, 0.55, 0.72, 0.96], [0.5, -0.78, 0, 0.5, 0.3, 0.9]];
      case 'hoodie': return [[-0.05, -0.62, 0, 1.03, 0.5, 1.0], [-0.98, -0.45, 0, 0.6, 0.12, 0.7]];
      case 'robe': return [[-0.3, -0.1, -0.92, 0.36, 0.3, 0.2], [-0.3, -0.1, 0.92, 0.36, 0.3, 0.2], [-0.7, -0.05, 0, 0.36, 0.42, 0.7]];
      case 'jogger': return [[-0.1, -0.64, 0, 0.98, 0.45, 0.95]];
      case 'rocker': return [[-0.1, -0.78 + s, 0, 1.26, 0.8, 1.28], [-0.6, -0.1, 0, 0.82, 0.95, 1.22], [0.32, -0.98 + s, 0, 0.72, 0.5, 1.02]];
      default: return [];
    }
  }
  const ZLOOK = {
    topOf(J) { const H = headFrame(J, this.outfit === 'mascot' ? 1.7 : 1); return blobTop(H, this.outfit === 'mascot' ? [[0, -0.15, 0, 1, 1, 1], [-0.2, -0.95, 0.6, 0.3, 0.3, 0.2]] : (zHair(this, J.t).length ? zHair(this, J.t) : [[0, 0, 0, 1, 1, 1]])); },
    back(R, J) {
      const H0 = headFrame(J);
      if (abs(H0.cy) < 0.35) this.longHair(R, J, H0);
      if (this.outfit === 'robe') coatPanels(R, J, this.m.top, this.def.X, this.def.thigh * 0.95, 'back');
    },
    longHair(R, J, H) {
      const o = this.outfit;
      if (o === 'metal' || o === 'cheer' || o === 'rocker' || o === 'tour') {
        const t = R.t, sw = 0.12 * sin(t * 2.3 + this.ph * 5) + (J.P.hairFlip || 0) * 0.6;
        const pts = [], rads = [];
        const ln = o === 'metal' ? 2.8 : o === 'cheer' ? 2.2 : o === 'rocker' ? 2.0 : 1.4;
        const base = o === 'cheer' ? [-0.75, -1.0] : [-0.7, -0.45];
        for (let i = 0; i <= 5; i++) {
          const k = i / 5, q = H.f(base[0] - 0.3 * k - sw * k * k * 1.5, base[1] + ln * k, 0);
          pts.push(q[0], q[1]); rads.push(H.r * (o === 'cheer' ? 0.28 + 0.12 * sin(PI * k) : 0.62 - 0.25 * k));
        }
        const p = new Path2D(); tube(p, pts, rads); paint(R, p, this.m.hair);
      }
    },
    leg(R, J, sd) {
      const j = J.leg[sd], r = this.def.r, o = this.outfit, m = this.m;
      let lm = m.pants, k = 1, sh = 'sneaker', sm = m.shoe, sole = null;
      if (o === 'cheer') lm = m.skinRaw;
      if (o === 'rocker') lm = m.fish;
      if (o === 'robe') { lm = m.pants; sh = 'slipper'; }
      if (o === 'clown') { k = 1.35; sh = 'clown'; }
      if (o === 'mascot') { lm = m.top; k = 1.3; sh = 'clown'; sm = m.top; }
      if (o === 'punk' || o === 'rocker' || o === 'metal' || o === 'guard') sh = 'boot';
      if (o === 'office' || o === 'tour') sh = 'sneaker';
      if (o === 'jogger' || o === 'hoodie' || o === 'cheer') { sole = m.white; }
      limb4(R, j.hip, j.knee, j.ankle, r.thigh[0] * k, r.thigh[1] * k, r.shin[0] * k, r.shin[1] * k * (o === 'clown' ? 1.2 : 1), lm);
      if (o === 'rocker') { const sk = new Path2D(); cap(sk, j.hip, r.thigh[0] * 1.02, lerp2(j.hip, j.knee, 0.45), r.thigh[0] * 0.98); paint(R, sk, m.top); }
      if (o === 'cheer') { const sk = new Path2D(); cap(sk, lerp2(j.knee, j.ankle, 0.75), r.shin[1] + 1, j.ankle, r.shin[1] + 1); paint(R, sk, m.white); }
      if (this.missShoe === sd) shoe(R, J, sd, 'sock', m.white);
      else shoe(R, J, sd, sh, sm, sole);
    },
    arm(R, J, sd, opts) {
      const j = J.arm[sd], r = this.def.r, o = this.outfit, m = this.m;
      const short = o === 'tour' || o === 'cheer' || o === 'rocker' || o === 'metal' || this.tornSleeve === sd;
      const k = o === 'mascot' ? 1.35 : o === 'clown' ? 1.2 : 1;
      const sleeveM = o === 'metal' ? m.top : o === 'office' ? m.top : m.top;
      if (short) {
        limb4(R, j.sh, j.el, j.ha, r.upper[0], r.upper[1], r.fore[0], r.fore[1], m.skinRaw);
        if (o !== 'rocker') { const p = new Path2D(); cap(p, j.sh, r.upper[0] + 1.5, lerp2(j.sh, j.el, 0.55), r.upper[1] + 1.4); paint(R, p, sleeveM); }
        if (this.tornSleeve === sd && !this.human) { const b = new Path2D(); cap(b, lerp2(j.el, j.ha, 0.25), r.fore[0] + 0.8, lerp2(j.el, j.ha, 0.55), r.fore[1] + 0.8); paint(R, b, m.white); }
      } else {
        const cuff = add(j.ha, unit(sub(j.el, j.ha)), 2);
        limb4(R, j.sh, j.el, cuff, r.upper[0] * k, r.upper[1] * k, r.fore[0] * k, r.fore[1] * k, sleeveM);
        if (o === 'jogger') detail(R, () => { const p = new Path2D(); p.moveTo(j.sh[0], j.sh[1]); p.lineTo(j.el[0], j.el[1]); p.lineTo(cuff[0], cuff[1]); strokeP(R, p, WHITE, 1.6, 0.8); });
      }
      if (this.wb === sd) {
        const d = unit(sub(j.ha, j.el)), a = add(j.ha, d, -8), b = add(j.ha, d, -2.5), p = new Path2D();
        cap(p, a, r.fore[1] * k + 1.6, b, r.fore[1] * k + 1.6);
        paint(R, p, m.uv);
        const c = lerp2(a, b, 0.5);
        J.wrist = c;
        const g = opts && opts.wristband != null ? clamp(+opts.wristband) : 1;
        if (!R.thermal && g > 0) glowAt(R, c[0], c[1], 20, PAL('uv', '#c86bff'), 0.75 * g, 'hot');
      }
    },
    hand(R, J, sd) {
      const o = this.outfit;
      drawHand(R, J, sd, o === 'mascot' ? this.m.top : (o === 'clown' ? this.m.white : this.m.skinRaw), null, o === 'mascot' ? 1.4 : 1);
    },
    torso(R, J) {
      const o = this.outfit, m = this.m, X = this.def.X;
      if (o === 'cheer' || o === 'rocker') skirtPanel(R, J, o === 'cheer' ? m.top : m.pants, X, o === 'cheer' ? 0.62 : 0.42);
      const T = torsoGeo(J, o === 'mascot' ? X_PLUS(X, 5) : o === 'robe' || o === 'hoodie' ? X_PLUS(X, 2.5) : X, { breath: breathK(R, J) * 0.5, drop: o === 'hoodie' ? 20 : o === 'cheer' || o === 'rocker' ? 2 : 12 });
      paint(R, T.path, m.top);
      const ctx = R.ctx;
      if (o === 'punk' || o === 'metal' || o === 'office' || o === 'guard' || o === 'robe') {
        ctx.save(); ctx.clip(T.path);
        const w = o === 'office' ? (k) => 1.8 + 1.4 * k : o === 'robe' ? (k) => 7 * (1 - k) + 1 : (k) => 5 + 1 * k;
        const sm = o === 'office' ? m.acc : o === 'robe' ? m.white : o === 'guard' ? m.top : m.acc;
        if (o === 'metal') paint(R, stripPath(J, T, (k) => 8 - 2 * k, 0, 1), inner(M_TEE));
        else if (o !== 'guard') paint(R, stripPath(J, T, w, o === 'office' ? 0.05 : 0, o === 'robe' ? 0.5 : 0.85), inner(sm));
        ctx.restore();
      }
      if (o === 'robe') coatPanels(R, J, m.top, X, this.def.thigh * 0.95, 'front');
      if (o === 'clown') { const u2 = unit(sub(J.neckB, J.mid)), c = add(J.neckB, u2, 1), p = new Path2D(); for (let i = 0; i < 7; i++) { const a = -PI + i * PI / 6, q = add(c, [cos(a) * (this.def.neckW + 8) * (0.4 + 0.6 * J.sP), sin(a) * 4 + 2]); circle(p, q[0], q[1], 5); } paint(R, p, m.white); }
      detail(R, () => {
        const c = frontLine(T, J, T.L3, T.p2, T.eC[0]);
        if (o === 'tour' && R.ppu * 6 > 5) {
          ctx.save(); ctx.translate(c[0] - 1, c[1] + 3); ctx.rotate(atan2(T.u2[1], T.u2[0]) + PI / 2); if (R.face < 0) ctx.scale(-1, 1);
          ctx.font = NS.font(7.5, NS.F.logo); ctx.textAlign = 'center'; ctx.fillStyle = css(m.acc.c);
          ctx.fillText('NO', 0, -2); ctx.fillText('SURVIVORS', 0, 6); ctx.restore();
        } else if (o === 'cheer') {
          ctx.save(); ctx.translate(c[0], c[1]); if (R.face < 0) ctx.scale(-1, 1); ctx.font = NS.font(13, NS.F.title); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = css(WHITE); ctx.fillText('O', 0, 1); ctx.restore();
        } else if (o === 'guard' && R.ppu * 5 > 5) {
          ctx.save(); ctx.translate(c[0], c[1]); if (R.face < 0) ctx.scale(-1, 1); ctx.font = NS.font(6.5, NS.F.title); ctx.textAlign = 'center';
          ctx.fillStyle = css(m.acc.c); ctx.fillText('SECURITY', 0, 0); ctx.restore();
        } else if (o === 'clown') {
          const p = new Path2D(); for (let i = 0; i < 5; i++) { const q = add(lerp2(T.L4, T.Hc, i / 4), lerp2(T.p2, T.p1, i / 4), (H01(i, this.seed) - 0.5) * 16); circle(p, q[0], q[1], 2.6); }
          fillP(R, p, m.pants.c);
        } else if (o === 'mascot') {
          const p = new Path2D(); const q = frontLine(T, J, T.Mc, T.pm, T.eW[0] * 0.7); ell(p, q[0], q[1], 9 + 10 * J.sP, 15, 0); fillP(R, p, m.acc.c, 0.8);
        } else if (o === 'hoodie') {
          const q = frontLine(T, J, T.Hc, T.p1, T.eH[0]), p = new Path2D(); p.rect(q[0] - 8 - 6 * J.sP, q[1] - 12, 16 + 12 * J.sP, 12); strokeP(R, p, [20, 20, 24], 1.2, 0.6);
        } else if (o === 'punk') {
          const p = new Path2D(); for (const sd of SIDES) { const s = J.arm[sd].sh; for (let i = 0; i < 3; i++) circle(p, s[0] - 3 + i * 3, s[1] - 2, 1); } fillP(R, p, [220, 220, 230]);
        }
      });
      if (o === 'guard') { const p = new Path2D(); const a = frontLine(T, J, T.Mc, T.pm, T.eW[0]); const pp = add(T.Mc, T.pm, -T.eW[1]); cap(p, add(a, T.u1, -2), 2, add(pp, T.u1, -2), 2); paint(R, p, m.acc); }
    },
    head(R, J, o) {
      const L = this, m = this.m, t = R.t;
      const np = new Path2D(); cap(np, J.neckB, this.def.neckW, J.neckT, this.def.neckW * 0.9); paint(R, np, this.outfit === 'mascot' ? m.top : m.skinRaw);
      if (this.outfit === 'mascot') {
        const H = headFrame(J, 1.7), p = new Path2D();
        blobs(p, H, [[0, -0.1, 0, 1, 0.95, 0.98], [-0.25, -0.92, 0.62, 0.3, 0.3, 0.2], [-0.25, -0.92, -0.62, 0.3, 0.3, 0.2], [0.72, 0.22, 0, 0.42, 0.32, 0.45]]);
        paint(R, p, m.top);
        const ey = new Path2D(), pu = new Path2D();
        for (const sd of [-1, 1]) { const q = sph(H, sd * 0.38, -0.22, 0.98); if (q[2] > 0.05) { circle(ey, q[0], q[1], 0.2 * H.r * (0.5 + 0.5 * q[2])); circle(pu, q[0] + 0.05 * H.r * sin(t * 3 + sd), q[1] + 0.05 * H.r, 0.08 * H.r); } }
        paint(R, ey, m.white); fillP(R, pu, [10, 10, 12]);
        const mo = sph(H, 0, 0.32, 1.0);
        if (mo[2] > 0) { const mp = new Path2D(); ell(mp, mo[0], mo[1], 0.32 * H.r * mo[2], 0.12 * H.r, H.rot); fillP(R, mp, [12, 10, 12]); if (!L.human) { const e = new Path2D(); circle(e, mo[0] - 0.08 * H.r, mo[1], 1.4); circle(e, mo[0] + 0.08 * H.r, mo[1], 1.4); fillP(R, e, [230, 250, 200]); } }
        J.top = blobTop(H, [[0, -0.1, 0, 1, 0.95, 1], [-0.25, -0.92, 0.62, 0.3, 0.3, 0.2]]);
        J.mouth = mo;
        return;
      }
      const H = headFrame(J);
      if (abs(H.cy) >= 0.35) this.longHair(R, J, H);
      const hp = new Path2D(); blobs(hp, H, ZH_HEAD(L)); paint(R, hp, m.skin);
      if (this.outfit === 'clown') { const n = new Path2D(); blob(n, H, 1.02, 0.16, 0, 0.24, 0.24, 0.24); paint(R, n, M('#e02a2a', { dk: 0.35, heat: 0.9 })); }
      if (L.human) J.eyes = drawFace(R, H, { expr: J.P.expr || 'neutral', mouth: J.P.mouth, eye: 'dot', browC: m.hair.c });
      else {
        // slack jaw (lit) and the pale eyes (always)
        detail(R, () => { const q = sph(H, 0, 0.55, 0.98); if (q[2] > 0) { const p = new Path2D(); ell(p, q[0], q[1], 0.2 * H.r * q[2], (0.06 + 0.18 * (J.P.mouth || 0)) * H.r, H.rot); fillP(R, p, MOUTH_IN); } });
        const ep = new Path2D(), ey = [];
        for (const sd of [-1, 1]) {
          const q = sph(H, sd * 0.4, -0.05 + (sd > 0 ? 0.04 * L.tilt : 0), 0.97); ey.push(q);
          if (q[2] > 0.08) ell(ep, q[0], q[1], max(0.9, 0.1 * H.r * clamp(q[2], 0.3, 1)) * (sd > 0 ? 1 : 1.1), max(0.9, 0.085 * H.r), H.rot);
        }
        if (R.thermal) { R.ctx.fillStyle = ironbow(R.style === 'thermal-warm' ? 0.95 : 0.22); R.ctx.fill(ep); }
        else { R.ctx.fillStyle = css([228, 246, 196]); R.ctx.fill(ep); const eg = o && o.eyes != null ? +o.eyes : 0.4; if (eg > 0) for (const q of ey) if (q[2] > 0.08) glowAt(R, q[0], q[1], 0.35 * H.r, '#dff7b0', eg * 0.5); }
        J.eyes = ey;
      }
      const hr = zHair(L, t);
      if (hr.length) { const p = new Path2D(); blobs(p, H, hr); paint(R, p, this.outfit === 'guard' || this.outfit === 'hoodie' ? m.top : m.hair); }
      if (this.outfit === 'punk') {
        const p = new Path2D(), a = [];
        for (let i = 0; i <= 6; i++) { const k = i / 6, X = 0.62 - 1.45 * k, Y = -0.95 + 0.3 * k * k; const b = H.f(X, Y, 0); const tp = H.f(X + 0.1, Y - 0.75 + 0.15 * abs(k - 0.4), 0); a.push(b[0], b[1], tp[0], tp[1]); }
        const e = H.f(-0.9, -0.5, 0);
        polyC(p, a.concat([e[0], e[1]])); paint(R, p, m.hair);
      }
      if (this.outfit === 'jogger') { const b = new Path2D(); blob(b, H, 0, -0.42, 0, 1.03, 0.14, 1.0); paint(R, b, m.acc); }
      if (this.outfit === 'cheer') { const b = new Path2D(); blob(b, H, -0.7, -1.08, 0, 0.22, 0.14, 0.35); paint(R, b, m.white); }
      if (this.bandage) { const b = new Path2D(); blob(b, H, 0, -0.5, 0, 1.03, 0.16, 1.0, 0.25); paint(R, b, m.white); }
      J.top = blobTop(H, hr.length ? hr.concat([[0, 0, 0, 1, 1, 1]]) : [[0, 0, 0, 1, 1, 1]]);
      if (this.outfit === 'punk') J.top = [J.top[0], min(J.top[1], H.f(0, -1.7, 0)[1])];
      J.mouth = sph(H, 0, 0.5, 1);
    },
  };
  function zombie(ctx, seed, pose, opts) {
    opts = opts || {};
    const style = opts.style || 'normal';
    const L = zombieLook(seed, style);
    const t = +opts.t || 0;
    const P = zPose(pose || poses.shamble(fract(t * 0.5 + L.ph)), L);
    const o = Object.assign({}, opts, { t: t + L.ph * 7 });
    if (!o.rim) o.rim = { color: style === 'human' ? '#ffe2b8' : PAL('zombieRim', '#8fbf5a'), dir: -2.2, k: 1 };
    if (style === 'human') o.style = 'normal';
    if (o.prop === 'phone') { o.prop = 'phone'; }
    return renderFigure(ctx, L, P, o);
  }

  // ------------------------------------------------------------------------------------------ the Groupie (superfan at the vigil)
  const GPM = {
    skin: M('#ecc4ac', { heat: 1 }), hair: M('#5a2622', { heat: 0.42, dk: 0.14 }), streak: M('#cfcac4', { dk: 0.46, heat: 0.4 }),
    shirt: M('#3a3a42', { heat: 0.78 }), jeans: M('#4a5a7a', { heat: 0.66 }), shoe: M('#e8e4da', { dk: 0.34, heat: 0.25 }),
    cast: M('#efece4', { dk: 0.44, heat: 0.55 }), rag: M('#77757e', { dk: 0.26, heat: 0.6 }), crate: M('#6a4628', { dk: 0.12, heat: 0.15 }),
    uv: UVM(),
  };
  function groupiePose(st) {
    const sob = clamp(st.sob == null ? 1 : st.sob), startle = clamp(st.startle || 0), spring = clamp(st.spring || 0), t = +st.t || 0;
    const shake = sob * (1 - startle) * (0.035 * sin(t * 14) + 0.02 * sin(t * 23));
    const sit = mk({ turn: 0.5, fhip: 1.3, fkn: 1.3, nhip: 1.25, nkn: 1.36, nft: 0.1, fft: 0.12, torso: 0.42 + shake,
      chest: 0.14, neck: 0.25, head: 0.45 + shake * 2, fsh: 0.95, fel: 1.65, nsh: 0.9, nel: 1.72, fhand: 'fist', nhand: 'fist', use: 'clutch' });
    const look = mk({ turn: 0.55, fhip: 1.3, fkn: 1.3, nhip: 1.2, nkn: 1.28, torso: -0.1, chest: -0.05, neck: -0.12, head: -0.32,
      hyaw: 0.45, fsh: -0.5, fel: 0.5, nsh: -0.35, nel: 0.4, fhand: 'open', nhand: 'open', mouth: 1, wind: 0.6 });
    const stand = mk({ turn: 0.78, torso: -0.04, head: -0.22, hyaw: 0.4, nsh: 1.5, nel: 0.08, nas: -0.15, nhand: 'open', fsh: -0.7, fel: 0.6, fas: 0.3,
      fhand: 'open', fhip: 0.5, fkn: 0.55, nhip: -0.3, nkn: 0.12, mouth: 0.95, wind: 0.45 });
    let P = blendPose(sit, look, sstep(0, 1, startle));
    if (spring > 0) P = blendPose(P, stand, sstep(0, 1, spring));
    P.sob = sob; P.startle = startle; P.spring = spring;
    return P;
  }
  let CRATE_TOP = null;
  const crateTop = (def) => {
    if (CRATE_TOP == null) { const J = solve(def, mk({ turn: 0.5, fhip: 1.3, fkn: 1.3, nhip: 1.25, nkn: 1.36, nft: 0.1, fft: 0.12, torso: 0.42 })); CRATE_TOP = J.hipC[1] + def.r.thigh[0] * 0.8; }
    return CRATE_TOP;
  };
  const GP_HEAD = (st) => [[0, -0.03, 0, 0.95, 1, 0.86], [0.26, 0.48 + st * 0.75, 0, 0.58, 0.48 + st * 0.35, 0.6], [0.94, 0.15, 0, 0.17, 0.15, 0.11],
    [-0.05, 0.1, -0.9, 0.14, 0.22, 0.12], [-0.05, 0.1, 0.9, 0.14, 0.22, 0.12]];
  const GP_HAIR = (w) => [[-0.14, -0.86, 0, 1.1, 0.56, 1.08], [0.44 - 0.2 * w, -1.02, 0, 0.62, 0.42, 0.92], [0.2, -0.45, -0.9, 0.3, 0.42, 0.2], [0.2, -0.45, 0.9, 0.3, 0.42, 0.2]];
  const GP_BACK = [[-0.62, -0.05, 0, 0.62, 0.8, 0.98]];
  function ponytail(H, t, w) {
    const pts = [], rads = [];
    const P3 = [[-0.25, -0.6, 0.85], [-0.35 - 0.3 * w, -0.55, 1.35], [-0.45 - 0.5 * w, -0.05, 1.6], [-0.4 - 0.7 * w, 0.55, 1.55], [-0.3 - 0.8 * w, 1.1, 1.38]];
    for (let i = 0; i < P3.length; i++) { const a = P3[i], sw = 0.08 * sin(t * 2.1 + i * 0.7) * i; const q = H.f(a[0] + sw, a[1], a[2]); pts.push(q[0], q[1]); rads.push(H.r * [0.3, 0.42, 0.44, 0.36, 0.16][i]); }
    return [pts, rads];
  }
  const GROUPIE_LOOK = {
    who: 'groupie', def: DEFS.groupie, expr: 'neutral', m: GPM, X2: X_PLUS(DEFS.groupie.X, 1.5), props: { def: null },
    topOf(J) { return blobTop(headFrame(J), GP_HAIR(0)); },
    back(R, J, o) {
      if (o.crate !== false) {
        const top = crateTop(this.def) + 4, x0 = -26, x1 = 34, dpt = 16;
        const p = new Path2D(); polyC(p, [x0, top, x1, top, x1, 0, x0, 0]); paint(R, p, this.m.crate);
        const tp = new Path2D(); polyC(tp, [x0, top, x0 + dpt, top - dpt * 0.5, x1 + dpt, top - dpt * 0.5, x1, top]); paint(R, tp, this.m.crate);
        detail(R, () => { const sl = new Path2D(); for (let i = 1; i < 4; i++) { const y = top + (-top) * i / 4; sl.moveTo(x0 + 2, y); sl.lineTo(x1 - 2, y); } strokeP(R, sl, [30, 18, 10], 1.6, 0.8); });
      }
      const H = headFrame(J), w = clamp(J.P.wind || 0), pt = ponytail(H, R.t, w);
      const p = new Path2D(); tube(p, pt[0], pt[1]); paint(R, p, this.m.hair);
    },
    leg(R, J, sd) {
      const j = J.leg[sd], r = this.def.r;
      limb4(R, j.hip, j.knee, j.ankle, r.thigh[0], r.thigh[1], r.shin[0], r.shin[1], this.m.jeans);
      shoe(R, J, sd, 'hightop', this.m.shoe, GPM.shoe);
    },
    arm(R, J, sd) {
      const j = J.arm[sd], r = this.def.r, P = J.P;
      if (sd === 'n') {
        const big = 1 + 1.3 * (P.spring || 0);
        limb4(R, j.sh, j.el, j.el, r.upper[0], r.upper[1], r.upper[1], r.upper[1], this.m.skin);
        const p = new Path2D(); cap(p, j.el, r.fore[0] * 1.9, j.ha, r.fore[1] * 1.8 * big); paint(R, p, this.m.cast);
        detail(R, () => {
          const d = unit(sub(j.ha, j.el)), n = [-d[1], d[0]], len = hypot(j.ha[0] - j.el[0], j.ha[1] - j.el[1]);
          for (let i = 0; i < 7; i++) {
            const q = add(add(j.el, d, len * (0.15 + 0.11 * i)), n, (H01(i, 41) - 0.5) * r.fore[0] * 1.6 * big);
            CAST.vex.sign(R.ctx, q[0] - 6 * big, q[1] - 2.5 * big, 12 * big, H01(i, 42) < 0.5 ? '#c0202c' : '#1c1c22', 0.85);
          }
        });
        const a = add(j.ha, unit(sub(j.el, j.ha)), 8 + 2 * big), b = add(j.ha, unit(sub(j.el, j.ha)), 5 + 1.2 * big), wp = new Path2D();
        cap(wp, a, r.fore[1] * 1.8 * big + 0.8, b, r.fore[1] * 1.8 * big + 0.8); paint(R, wp, this.m.uv);
        const c = lerp2(a, b, 0.5); J.wrist = c; J.cast = lerp2(j.el, j.ha, 0.55);
        if (!R.thermal) glowAt(R, c[0], c[1], 16 + 6 * big, PAL('uv', '#c86bff'), 0.6, 'hot');
        return;
      }
      limb4(R, j.sh, j.el, j.ha, r.upper[0], r.upper[1], r.fore[0], r.fore[1], this.m.skin);
      const p = new Path2D(); cap(p, j.sh, r.upper[0] + 1.4, lerp2(j.sh, j.el, 0.45), r.upper[1] + 1.2); paint(R, p, this.m.shirt);
    },
    hand(R, J, sd) { drawHand(R, J, sd, sd === 'n' ? this.m.cast : this.m.skin, null, sd === 'n' ? 1.25 * (1 + 1.3 * (J.P.spring || 0)) : 1); },
    torso(R, J) {
      const T = torsoGeo(J, this.X2, { breath: breathK(R, J) * (1 + 2 * (J.P.sob || 0)), drop: 10 });
      paint(R, T.path, this.m.shirt);
      detail(R, (ctx) => {
        const c = frontLine(T, J, T.L3, T.p2, T.eC[0]);
        if (R.ppu * 7 > 5) { ctx.save(); ctx.translate(c[0], c[1] + 2); if (R.face < 0) ctx.scale(-1, 1); ctx.globalAlpha *= 0.55; ctx.font = NS.font(6.5, NS.F.logo); ctx.textAlign = 'center'; ctx.fillStyle = css([200, 190, 180]); ctx.fillText('NO', 0, -3); ctx.fillText('SURVIVORS', 0, 4); ctx.restore(); }
      });
    },
    head(R, J, o) {
      const H = headFrame(J), t = R.t, P = J.P, st = clamp(P.startle || 0), sob = clamp(P.sob || 0) * (1 - st), w = clamp(P.wind || 0);
      const np = new Path2D(); cap(np, J.neckB, this.def.neckW, J.neckT, this.def.neckW * 0.9); paint(R, np, this.m.skin);
      const bh = new Path2D(); blobs(bh, H, GP_BACK); paint(R, bh, this.m.hair);
      const hp = new Path2D(); blobs(hp, H, GP_HEAD(st)); paint(R, hp, this.m.skin);
      // shriek: an impossibly wide mouth (lit or not, the dark hole reads)
      if (st > 0.05) {
        const q = sph(H, 0, 0.62 + 0.35 * st, 0.95), p = new Path2D();
        ell(p, q[0], q[1] + H.r * 0.2 * st, H.r * (0.22 + 0.25 * st) * clamp(q[2] + 0.3, 0.4, 1), H.r * (0.1 + 0.75 * st), H.rot);
        R.ctx.fillStyle = css(MOUTH_IN); R.ctx.fill(p);
        detail(R, () => { const tq = add(q, [0, -H.r * 0.12]); const tp = new Path2D(); tp.moveTo(tq[0] - H.r * 0.3 * st, tq[1] + H.r * 0.15 * (1 - st)); tp.lineTo(tq[0] + H.r * 0.3 * st, tq[1] + H.r * 0.15 * (1 - st)); strokeP(R, tp, EYE_WHITE, H.r * 0.1); });
      }
      J.eyes = drawFace(R, H, { expr: st > 0.3 ? 'shout' : 'deadpan', mouth: 0, noMouth: st > 0.05, eye: 'dot', lips: [150, 40, 60], browC: [60, 24, 20], lid: sob * 0.4 });
      detail(R, () => {
        // face paint (the logo's lightning slash on each cheek) and running mascara
        const fp = new Path2D(), ms = new Path2D();
        for (const sd of [-1, 1]) {
          const q = sph(H, sd * 0.55, 0.28, 0.99);
          if (q[2] > 0.12) {
            const s = H.r * 0.13 * q[2];
            fp.moveTo(q[0] - s, q[1] - s * 1.4); fp.lineTo(q[0] + s * 0.4, q[1] - s * 0.2); fp.lineTo(q[0] - s * 0.3, q[1]); fp.lineTo(q[0] + s, q[1] + s * 1.4);
            const e = J.eyes[sd < 0 ? 0 : 1];
            ms.moveTo(e[0], e[1] + H.r * 0.1); ms.quadraticCurveTo(e[0] + H.r * 0.04, e[1] + H.r * 0.35, e[0] - H.r * 0.02, e[1] + H.r * (0.55 + 0.1 * sob));
          }
        }
        strokeP(R, fp, [205, 30, 45], max(0.8, H.r * 0.07));
        strokeP(R, ms, [20, 14, 26], max(0.6, H.r * 0.05), 0.85);
      });
      // white eye-shine (flashlight): never UV
      const shine = (0.2 + 0.8 * st) * (o.shine == null ? 1 : +o.shine);
      for (const e of J.eyes) if (e[2] > 0.08 && !R.thermal) {
        const p = new Path2D(); circle(p, e[0], e[1], max(0.8, H.r * 0.07)); R.ctx.fillStyle = css(WHITE, clamp(0.4 + shine)); R.ctx.fill(p);
        glowAt(R, e[0], e[1], H.r * (0.3 + 0.4 * shine), '#ffffff', 0.4 * shine + 0.1, 'hot');
      }
      const hr = new Path2D(); blobs(hr, H, GP_HAIR(w)); paint(R, hr, this.m.hair);
      const sk = new Path2D(); blob(sk, H, 0.5 - 0.2 * w, -1.02, -0.2, 0.42, 0.14, 0.3, -0.35); paint(R, sk, this.m.streak);
      if (sob > 0.3) { const hf = new Path2D(); blob(hf, H, 0.82, 0.05, 0, 0.36, 0.72, 0.68, 0.15); R.ctx.save(); R.ctx.globalAlpha *= sstep(0.3, 0.7, sob); paint(R, hf, this.m.hair); R.ctx.restore(); }
      J.top = blobTop(H, GP_HAIR(w));
      J.mouth = sph(H, 0, 0.55 + 0.3 * st, 1);
    },
    after(R, J) {
      const P = J.P, st = clamp(P.startle || 0);
      if (P.use === 'clutch' && st < 0.6) {
        // she sobs into the faded tour shirt held in both hands
        const a = J.arm.f.ha, b = J.arm.n.ha, c = lerp2(a, b, 0.5), p = new Path2D();
        smoothClosed(p, [a[0] - 4, a[1] - 8, c[0], c[1] - 14, b[0] + 4, b[1] - 9, b[0] + 6, b[1] + 8, c[0] + 2, c[1] + 18, a[0] - 6, a[1] + 10]);
        R.ctx.save(); R.ctx.globalAlpha *= 1 - sstep(0.2, 0.6, st); paint(R, p, this.m.rag);
        detail(R, (ctx) => { ctx.save(); ctx.translate(c[0], c[1] + 2); if (R.face < 0) ctx.scale(-1, 1); ctx.font = NS.font(5, NS.F.type); ctx.textAlign = 'center'; ctx.fillStyle = css([190, 180, 170], 0.7); ctx.fillText("OCT '87", 0, 0); ctx.restore(); });
        R.ctx.restore();
      }
    },
  };
  function groupie(ctx, state, opts) {
    opts = opts || {};
    state = state || {};
    const P = state.fhip != null ? state : groupiePose(Object.assign({ t: opts.t }, state));
    const o = Object.assign({ rim: { color: '#d8e4ff', dir: -2.4, k: 1 } }, opts);
    return renderFigure(ctx, GROUPIE_LOOK, P, o);
  }

  // ------------------------------------------------------------------------------------------ the Roadie
  const RDM = {
    skin: M('#7e9468', { heat: 1 }), tee: M('#18181c', { heat: 0.78 }), shorts: M('#7a6a48', { heat: 0.66 }), sock: M('#e6e2d8', { dk: 0.3, heat: 0.6 }),
    boot: M('#22201e', { heat: 0.25 }), tolex: M('#141416', { heat: 0.2, rk: 1.2 }), grille: M('#3a3630', { heat: 0.2 }), metal: PM.metal,
    tape: M('#c6c8cc', { dk: 0.42, heat: 0.3 }), uv: UVM(), plate: M('#d8d0b8', { dk: 0.35, heat: 0.2 }),
  };
  const RD_HEAD = [[0, -0.05, 0, 1, 0.95, 0.92], [0.25, 0.45, 0, 0.8, 0.62, 0.9], [0.92, 0.18, 0, 0.26, 0.24, 0.18], [0.75, -0.42, 0, 0.35, 0.16, 0.62],
    [-0.05, 0.1, -0.95, 0.17, 0.26, 0.14], [-0.05, 0.1, 0.95, 0.17, 0.26, 0.14]];
  const ROADIE_LOOK = {
    who: 'roadie', def: DEFS.roadie, expr: 'neutral', m: RDM, props: { def: null },
    topOf(J) { const H = headFrame(J); return blobTop(H, [[0, -0.05, 0, 1, 0.95, 0.92]]); },
    back(R, J) {
      // two speaker cabinets gaffer-taped to his back (seen side-on in profile, peeking over the shoulders head-on)
      const u2 = unit(sub(J.neckB, J.mid)), p2 = perpF(u2), ang = atan2(u2[1], u2[0]) + PI / 2;
      const hw = 34 * J.cP + 112 * J.sP, hh = 66, eb = extB(J, this.def.X.chest);
      for (let i = 0; i < 2; i++) {
        const c = add(add(J.mid, p2, -(eb * 0.9 + 34 * J.cP)), u2, 30 + i * 134), F = frame2(c, ang, 1);
        const p = new Path2D(); polyL(p, F, [-hw, -hh, hw, -hh, hw, hh, -hw, hh]); paint(R, p, this.m.tolex);
        const cn = new Path2D(); for (const q of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const k = F(q[0] * (hw - 7), q[1] * (hh - 7)); circle(cn, k[0], k[1], 10); } paint(R, cn, this.m.metal);
        const hd = new Path2D(); polyL(hd, F, [-16, -hh + 18, 16, -hh + 18, 16, -hh + 26, -16, -hh + 26]); paint(R, hd, this.m.metal);
        detail(R, () => { const pl = new Path2D(); polyL(pl, F, [-26, 6, 26, 6, 26, 22, -26, 22]); fillP(R, pl, this.m.plate.c, 0.9); });
      }
    },
    leg(R, J, sd) {
      const j = J.leg[sd], r = this.def.r;
      limb4(R, j.hip, j.knee, j.ankle, r.thigh[0] * 0.8, r.thigh[1] * 0.8, r.shin[0], r.shin[1], this.m.skin);
      const sh = new Path2D(); cap(sh, j.hip, r.thigh[0] * 1.08, lerp2(j.hip, j.knee, 0.9), r.thigh[1] * 1.2); paint(R, sh, this.m.shorts);
      const pk = new Path2D(); const pc = lerp2(j.hip, j.knee, 0.55); ell(pk, pc[0] + 4, pc[1], r.thigh[1] * 0.9, r.thigh[1] * 0.75, 0); paint(R, pk, inner(this.m.shorts));
      const so = new Path2D(); cap(so, lerp2(j.knee, j.ankle, 0.55), r.shin[1] * 1.15, j.ankle, r.shin[1] * 1.1); paint(R, so, this.m.sock);
      shoe(R, J, sd, 'boot', this.m.boot);
    },
    arm(R, J, sd, opts) {
      const j = J.arm[sd], r = this.def.r;
      limb4(R, j.sh, j.el, j.ha, r.upper[0], r.upper[1], r.fore[0], r.fore[1], this.m.skin);
      const p = new Path2D(); cap(p, j.sh, r.upper[0] * 1.12, lerp2(j.sh, j.el, 0.42), r.upper[1] * 1.12); paint(R, p, this.m.tee);
      if (sd === 'f') {
        const d = unit(sub(j.ha, j.el)), a = add(j.ha, d, -50), b = add(j.ha, d, -20), wp = new Path2D();
        cap(wp, a, r.fore[1] + 6, b, r.fore[1] + 6); paint(R, wp, this.m.uv);
        const c = lerp2(a, b, 0.5); J.wrist = c;
        const g = opts && opts.wristband != null ? clamp(+opts.wristband) : 1;
        if (!R.thermal && g > 0) glowAt(R, c[0], c[1], 58, PAL('uv', '#c86bff'), 0.6 * g, 'hot');
      }
    },
    hand(R, J, sd) { drawHand(R, J, sd, this.m.skin); },
    torso(R, J, o) {
      const T = torsoGeo(J, this.def.X, { breath: breathK(R, J), drop: 46 });
      paint(R, T.path, this.m.tee);
      // gaffer tape holding the amps on: two straps over the shoulders
      const tp = new Path2D(), w = 13;
      for (const sd of SIDES) { const s = J.arm[sd].sh, e = add(T.Hc, T.p1, (sd === 'f' ? 1 : -1) * 30 * J.sP - 20 * J.cP); cap(tp, add(s, T.u2, 8), w, lerp2(add(s, T.u2, 8), e, 0.55), w); }
      const bl = add(T.Mc, T.pm, -T.eW[1]), br = add(T.Mc, T.pm, T.eW[0]); cap(tp, bl, w, br, w);
      R.ctx.save(); R.ctx.clip(T.path); paint(R, tp, inner(this.m.tape)); R.ctx.restore();
      lanyard(R, J, T, true);
    },
    head(R, J, o) {
      const H = headFrame(J), m = this.m;
      const np = new Path2D(); cap(np, J.neckB, this.def.neckW, J.neckT, this.def.neckW * 0.92); paint(R, np, m.skin);
      const hp = new Path2D(); blobs(hp, H, RD_HEAD); paint(R, hp, m.skin);
      detail(R, () => { const q = sph(H, 0, 0.55, 0.98); if (q[2] > 0) { const p = new Path2D(); ell(p, q[0], q[1], 0.22 * H.r * q[2], (0.05 + 0.2 * (J.P.mouth || 0)) * H.r, H.rot); fillP(R, p, MOUTH_IN); } });
      const ep = new Path2D(), ey = [];
      for (const sd of [-1, 1]) { const q = sph(H, sd * 0.38, -0.12, 0.97); ey.push(q); if (q[2] > 0.08) ell(ep, q[0], q[1], 0.1 * H.r * clamp(q[2], 0.3, 1), 0.075 * H.r, H.rot); }
      if (o.dazed) {
        const xp = new Path2D(); for (const q of ey) if (q[2] > 0.08) { const s = 0.11 * H.r; xp.moveTo(q[0] - s, q[1] - s); xp.lineTo(q[0] + s, q[1] + s); xp.moveTo(q[0] + s, q[1] - s); xp.lineTo(q[0] - s, q[1] + s); }
        strokeP(R, xp, [228, 246, 196], 0.06 * H.r);
      } else if (R.thermal) { R.ctx.fillStyle = ironbow(0.95); R.ctx.fill(ep); }
      else { R.ctx.fillStyle = css([228, 246, 196]); R.ctx.fill(ep); }
      J.eyes = ey;
      J.top = blobTop(H, [[0, -0.05, 0, 1, 0.95, 0.92]]);
      J.mouth = sph(H, 0, 0.55, 1.05);
      if (o.breath != null && !R.thermal) {
        const ph = fract(+o.breath), fd = unit(sub(H.f(1, 0.4, 0), H.f(0, 0.4, 0))), m0 = J.mouth;
        for (let i = 0; i < 4; i++) { const k = clamp(ph * 1.2 - i * 0.08); if (k <= 0 || k >= 1) continue; const q = add(add(m0, fd, 20 + 150 * k + i * 12), [0, -40 * k + i * 6]); puffAt(R, q[0], q[1], 30 + 90 * k, '#dfe6ee', 0.55 * (1 - k) * sstep(0, 0.12, k)); }
      }
    },
  };
  function roadie(ctx, pose, opts) {
    opts = opts || {};
    const o = Object.assign({ rim: { color: PAL('zombieRim', '#8fbf5a'), dir: -2.2, k: 1 } }, opts);
    return renderFigure(ctx, ROADIE_LOOK, pose || poses.stomp(fract((opts.t || 0) * 0.6)), o);
  }

  // ------------------------------------------------------------------------------------------ Vex's signature (one scrawl everywhere)
  const SIG = [
    [0.03, 0.1, 0.08, 0.3, 0.13, 0.47, 0.2, 0.2, 0.27, 0.01, 0.32, -0.05, 0.28, 0.05],
    [0.26, 0.34, 0.33, 0.3, 0.31, 0.24, 0.26, 0.3, 0.29, 0.41, 0.37, 0.37],
    [0.39, 0.26, 0.48, 0.43], [0.48, 0.25, 0.39, 0.43],
    [0.02, 0.57, 0.3, 0.51, 0.56, 0.45, 0.72, 0.36],
  ];
  function signVex(ctx, x, y, w, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w, w);
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color || PAL('vex', '#ff3344');
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 0.045;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = new Path2D();
    for (const s of SIG) { if (s.length > 4) smoothOpen(p, s); else { p.moveTo(s[0], s[1]); p.lineTo(s[2], s[3]); } }
    ctx.stroke(p);
    const st = new Path2D(), cx = 0.86, cy = 0.22;
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.05 : 0.125, a = -PI / 2 + i * PI / 5; const px = cx + cos(a) * r, py = cy + sin(a) * r; if (i) st.lineTo(px, py); else st.moveTo(px, py); }
    st.closePath();
    ctx.fill(st);
    ctx.restore();
  }
  const CAST = {
    vex: { name: 'VEX', role: 'VOCALS', color: PAL('vex', '#ff3344'), height: 1.08, prop: 'megaphone', sign: signVex },
    granny: { name: 'GRANNY GLOOM', role: 'LEAD GUITAR', color: PAL('granny', '#ff6fb5'), height: 0.8, prop: 'shotgun', gun: 'GERALD' },
    tiny: { name: 'TINY', role: 'DRUMS & PYRO', color: PAL('tiny', '#ffd23f'), height: 1.35, prop: 'bats' },
    noodle: { name: 'NOODLE', role: 'BASS', color: PAL('noodle', '#ff8a1f'), height: 0.95, prop: 'wrench' },
  };

  // ------------------------------------------------------------------------------------------ public figure entry points
  function survivor(ctx, who, pose, opts) {
    opts = opts || {};
    const look = LOOK[who] || LOOK.vex;
    return renderFigure(ctx, look, pose || poses.idle(+opts.t || 0), opts);
  }
  function rig(who, pose, opts) {
    opts = opts || {};
    const look = typeof who === 'string' ? (LOOK[who] || (who === 'groupie' ? GROUPIE_LOOK : who === 'roadie' ? ROADIE_LOOK : who === 'zombie' ? zombieLook(opts.seed || 0, opts.style) : LOOK.vex))
      : { def: who, props: {} };
    let P = pose || poses.stand();
    if (look.who === 'zombie') P = zPose(P, look);
    else if (look === GROUPIE_LOOK && P.fhip == null) P = groupiePose(Object.assign({ t: opts.t }, P));
    const { J, PR, ox, oy } = prepFigure(look, P, opts);
    if (look.topOf) J.top = look.topOf(J, opts);
    if (look === LOOK.noodle) {
      const H = headFrame(J), hoodUp = !(opts.zap > 0.5), Lp = sph(H, 0, -0.5, (hoodUp ? 1.3 : 1.04) + 0.06);
      const fd = sub(H.f(1, -0.5, 0), H.f(0, -0.5, 0));
      J.lamp = [Lp[0], Lp[1], atan2(fd[1], fd[0]), clamp(H.sy * cos(H.pitch) * 1.05)];
    }
    const s = opts.s == null ? 1 : +opts.s, face = opts.face == null || +opts.face >= 0 ? 1 : -1;
    return anchorsOf(J, look, opts, PR, +opts.x || 0, +opts.y || 0, s, face, ox, oy);
  }
  rig.defs = DEFS;
  rig.solve = solve;
  rig.ik = ik;

  // ------------------------------------------------------------------------------------------ portraits (cached)
  const PORT = new Map();
  const PORT_FRAME = { vex: { cy: 0.44, hr: 0.18, expr: 'smug' }, granny: { cy: 0.62, hr: 0.15, expr: 'deadpan' },
    tiny: { cy: 0.4, hr: 0.17, expr: 'neutral' }, noodle: { cy: 0.44, hr: 0.17, expr: 'neutral' } };
  function buildPortrait(who, style, age, n, opts) {
    const c = NS.makeCanvas(n, n, 'chars'), g = c.getContext('2d');
    const fr = PORT_FRAME[who] || PORT_FRAME.vex, look = LOOK[who] || LOOK.vex;
    const sil = style === 'silhouette';
    if (opts.bg !== false && !sil) {
      const gr = g.createRadialGradient(n * 0.42, n * 0.38, n * 0.05, n * 0.5, n * 0.5, n * 0.75);
      gr.addColorStop(0, style === 'xerox' ? '#f4f0e6' : '#7d8ba3'); gr.addColorStop(1, style === 'xerox' ? '#d8d2c4' : '#262d3d');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
    }
    const pose = mk({ turn: 0.7, hyaw: 0.14, torso: 0.0, chest: 0, head: 0.03, fsh: 0.04, nsh: -0.04, fel: 0.1, nel: 0.1 });
    const J = solve(look.def, pose);
    const s = (n * fr.hr) / look.def.headR;
    const x = n * 0.5 - J.headC[0] * s, y = n * fr.cy - J.headC[1] * s;
    survivor(g, who, pose, { x, y, s, lit: sil ? 0 : 1, rim: { color: sil ? '#000000' : '#fff0d8', dir: -2.45, k: sil ? 0 : 0.75 },
      rim2: sil ? null : { color: '#6f8fd8', dir: -0.4, k: 0.5 }, t: 0.6, prop: 'none', expression: fr.expr, accent: 0.15, lamp: 0.45 });
    const id = g.getImageData(0, 0, n, n), d = id.data;
    const bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    let lum = null;
    if (style === 'xerox') { lum = new Float32Array(n * n); for (let p = 0, i = 0; p < n * n; p++, i += 4) lum[p] = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255; }
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const px = p % n, py = (p / n) | 0;
      let r = d[i], gg = d[i + 1], b = d[i + 2];
      if (sil) { if (d[i + 3] > 0) { d[i] = 8; d[i + 1] = 8; d[i + 2] = 12; } continue; }
      if (style === 'xerox') {
        const l = lum[p], q = (xx, yy) => lum[clamp(yy, 0, n - 1) * n + clamp(xx, 0, n - 1)];
        const ed = abs(q(px + 1, py) - q(px - 1, py)) + abs(q(px, py + 1) - q(px, py - 1));
        const v = clamp((l - 0.5) * 2.2 + 0.5 - ed * 3.2), th = (bay[(py & 3) * 4 + (px & 3)] + 0.5) / 16;
        const speck = H01(p, 913) < 0.004 ? 1 : 0, streak = H01(px, 77) < 0.02 ? 0.12 : 0;
        const ink = v - streak > th && !speck;
        d[i] = ink ? 232 : 22; d[i + 1] = ink ? 228 : 20; d[i + 2] = ink ? 218 : 22; d[i + 3] = 255;
        continue;
      }
      if (age === '1987') {
        const l = 0.3 * r + 0.59 * gg + 0.11 * b;
        r = lerp(r, l, 0.3) * 0.86 + 34; gg = lerp(gg, l, 0.3) * 0.8 + 24; b = lerp(b, l, 0.35) * 0.66 + 20;
        const vg = 1 - 0.35 * pow(hypot(px / n - 0.5, py / n - 0.5) * 1.5, 2);
        const gn = (H01(p, 1987) - 0.5) * 16;
        d[i] = b8(r * vg + gn); d[i + 1] = b8(gg * vg + gn); d[i + 2] = b8(b * vg + gn);
      } else {
        const gn = (H01(p, 2026) - 0.5) * 6;
        d[i] = b8(r + gn); d[i + 1] = b8(gg + gn); d[i + 2] = b8(b + gn);
      }
    }
    g.putImageData(id, 0, 0);
    if (opts.signed && !sil) signVex(g, n * 0.42, n * 0.7, n * 0.5, style === 'xerox' ? '#141414' : '#101014', 0.92);
    return c;
  }
  function portrait(ctx, who, x, y, size, opts) {
    opts = opts || {};
    const style = opts.style || 'photo', age = opts.age || 'now';
    const T = ctx.getTransform(), cs = sqrt(abs(T.a * T.d - T.b * T.c)) || 1, px = size * cs;
    const n = px <= 96 ? 96 : px <= 192 ? 192 : px <= 384 ? 384 : 640;
    const key = [who, style, age, n, opts.signed ? 1 : 0, opts.bg === false ? 0 : 1].join('|');
    let c = PORT.get(key);
    if (!c) { c = buildPortrait(who, style, age, n, opts); PORT.set(key, c); }
    ctx.drawImage(c, x, y, size, size);
    return c;
  }

  // ------------------------------------------------------------------------------------------ horde (cached sprite crowd)
  const HORDE = { atlases: new Map(), place: new Map(), tick: 0, budget: 38e6 };
  const VSEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const hbPose = (ph, v) => {
    const P = poses.headbang(ph, 1);
    const k = v % 3;
    if (k === 1) Object.assign(P, { fsh: 2.6 - 0.4 * P.hairFlip, fel: 0.4, fas: 0.15, fhand: 'fist', nhand: 'fist' });
    if (k === 2) Object.assign(P, { nsh: 0.3 + 0.3 * P.hairFlip, nel: 0.5, nhand: 'claw', fsh: 0.4, fhand: 'claw' });
    return P;
  };
  const HMODE = {
    shamble: { view: 'side', rate: 0.5, pose: (ph) => poses.shamble(ph) },
    run: { view: 'side', rate: 0.75, pose: (ph) => poses.zrun(ph) },
    headbang: { view: 'front', rate: 1, pose: hbPose },
    applaud: { view: 'front', rate: 1, pose: (ph) => poses.applaud(ph) },
    stand: { view: 'front', rate: 0.25, pose: (ph) => poses.zstand(ph) },
    climb: { view: 'front', rate: 0.5, pose: (ph) => poses.climb(ph) },
    phone: { view: 'front', rate: 0.2, pose: (ph) => poses.phone(ph), prop: 'phone' },
  };
  const LOOK_YAW = [2.45, PI / 2, 0.5, PI / 2];
  function hordeMem() { let b = 0; HORDE.atlases.forEach((A) => { b += A.bytes; }); return b; }
  function evict(need, keep) {
    while (hordeMem() + need > HORDE.budget && HORDE.atlases.size) {
      let old = null;
      HORDE.atlases.forEach((A) => { if (!keep.has(A) && (!old || A.used < old.used)) old = A; });
      if (!old) break;
      NS.freeCanvas(old.cv); old.fog.forEach((f) => NS.freeCanvas(f));
      HORDE.atlases.delete(old.key);
    }
  }
  function hordeAtlas(mode, view, style, light, litQ, look, keep) {
    const thermal = style === 'thermal-warm' || style === 'thermal-cold';
    const M0 = HMODE[mode];
    const lc = thermal ? '' : (light && light.color) || (mode === 'phone' ? '#dfeeff' : style === 'human' ? '#ffe2b8' : PAL('zombieRim', '#8fbf5a'));
    const ld = light && light.dir != null ? +light.dir : (mode === 'phone' ? PI / 2 : -2.2);
    const db = thermal ? 0 : ((Math.round(ld / (PI / 4)) % 8) + 8) % 8;
    const key = [mode, view, style, lc, db, thermal ? 0 : litQ, look ? 'look' : ''].join('|');
    let A = HORDE.atlases.get(key);
    if (A) { A.used = ++HORDE.tick; keep.add(A); return A; }
    const cs = NS.cacheScale || 1, figH = 108 * cs, cw = Math.ceil(84 * cs), ch = Math.ceil(146 * cs), cols = 8, rows = VSEEDS.length;
    const bytes = cw * cols * ch * rows * 4;
    evict(bytes, keep);
    const cv = NS.makeCanvas(cw * cols, ch * rows, 'horde'), g = cv.getContext('2d');
    const s = figH / 300, ox = cw * 0.5, oy = ch - 7 * cs, frames = [];
    const turn = view === 'front' ? 0.88 : 0.38, psi = turn * 1.42;
    for (let v = 0; v < rows; v++) {
      for (let f = 0; f < cols; f++) {
        let P = M0.pose(look ? (f < 4 ? 0.125 : 0.625) : f / cols, v);
        P.turn = turn;
        if (look) { P.hyaw = LOOK_YAW[f % 4] - psi; P.mouth = 0.5; if (f % 4 === 3) { P.head = (P.head || 0) - 0.55; P.neck = (P.neck || 0) - 0.2; } }
        const cx = f * cw + ox, cy = v * ch + oy;
        g.save(); g.beginPath(); g.rect(f * cw, v * ch, cw, ch); g.clip();
        const a = zombie(g, VSEEDS[v], P, { x: cx, y: cy, s, face: 1, rim: { color: lc || '#ffffff', dir: db * PI / 4, k: 1 }, lit: litQ, style,
          t: f * 0.11, glow: false, wristband: 0, prop: M0.prop, eyes: 0, thinRim: true });
        g.restore();
        frames.push({ w: a.wrist ? [a.wrist[0] - cx, a.wrist[1] - cy] : null, p: a.phone ? [a.phone[0] - cx, a.phone[1] - cy] : null });
      }
    }
    A = { key, cv, cw, ch, ox, oy, s, frames, fog: new Map(), bytes, used: ++HORDE.tick };
    HORDE.atlases.set(key, A);
    keep.add(A);
    return A;
  }
  function fogAtlas(A, color, keep) {
    let f = A.fog.get(color);
    if (f) return f;
    const w = Math.ceil(A.cv.width / 2), h = Math.ceil(A.cv.height / 2);
    evict(w * h * 4, keep);
    f = NS.makeCanvas(w, h, 'horde');
    const g = f.getContext('2d');
    g.drawImage(A.cv, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    A.fog.set(color, f);
    A.bytes += w * h * 4;
    return f;
  }
  function invCdf(tab, u) {
    let j = 1;
    while (j < tab.length - 1 && tab[j] < u) j++;
    const a = tab[j - 1], b = tab[j];
    return ((j - 1) + (b > a ? (u - a) / (b - a) : 0)) / (tab.length - 1);
  }
  function hordePlace(opts) {
    const seed = Math.round(+opts.seed || 0), count = max(0, Math.round(opts.count == null ? 200 : +opts.count));
    const ar = opts.area || { x0: 0, x1: 1280, yFar: 380, yNear: 720, sFar: 0.12, sNear: 0.42 };
    const custom = typeof opts.place === 'function' ? opts.place : typeof ar === 'function' ? ar : null;
    const key = custom ? null : [seed, count, ar.x0, ar.x1, ar.yFar, ar.yNear, ar.sFar, ar.sNear, opts.density].join('|');
    if (key && HORDE.place.has(key)) return HORDE.place.get(key);
    const rnd = NS.rng(seed * 131 + 7), pl = [];
    // depth sampling: density per unit of depth ~ 1 / scale^dens (2 = equal packing on screen, lower = denser near rows)
    const dens = opts.density == null ? 1.25 : +opts.density, tab = [0];
    if (!custom) { let acc = 0; for (let j = 1; j <= 64; j++) { const sc = lerp(ar.sFar, ar.sNear, (j - 0.5) / 64); acc += pow(max(1e-3, sc), -dens); tab.push(acc); } for (let j = 0; j <= 64; j++) tab[j] /= acc; }
    for (let i = 0; i < count; i++) {
      let q;
      if (custom) {
        const c = custom(i, rnd) || {};
        q = { x: +c.x || 0, y: +c.y || 0, s: c.s == null ? 0.3 : +c.s, d: c.d == null ? 0.5 : +c.d, face: c.face == null ? (rnd() < 0.5 ? 1 : -1) : (c.face < 0 ? -1 : 1) };
      } else {
        const a = ar.sFar, b = ar.sNear, u = (i + rnd()) / max(1, count);
        const d = invCdf(tab, u);
        q = { x: lerp(ar.x0, ar.x1, rnd()), y: lerp(ar.yFar, ar.yNear, d), s: lerp(a, b, d), d, face: rnd() < 0.5 ? 1 : -1 };
      }
      q.i = i; q.v = floor(rnd() * VSEEDS.length) % VSEEDS.length; q.ph = rnd(); q.ph2 = rnd(); q.lod = NS.hash(i, seed + 3);
      pl.push(q);
    }
    pl.sort((p, q) => p.y - q.y);
    if (key) { if (HORDE.place.size > 48) HORDE.place.clear(); HORDE.place.set(key, pl); }
    return pl;
  }
  function horde(ctx, S, opts) {
    opts = opts || {};
    S = S || {};
    const mode = HMODE[opts.mode] ? opts.mode : 'shamble', M0 = HMODE[mode], view = opts.view || M0.view;
    const style = opts.style || 'normal', thermal = style === 'thermal-warm' || style === 'thermal-cold';
    const t = opts.t == null ? +S.t || 0 : +opts.t;
    const lod = opts.lod == null ? (S.lod || 1) : +opts.lod;
    const seed = Math.round(+opts.seed || 0);
    const litQ = opts.lit == null ? (style === 'human' ? 0.25 : 0) : Math.round(clamp(+opts.lit) * 4) / 4;
    const keep = new Set();
    const A = hordeAtlas(mode, view, style, opts.light, litQ, false, keep);
    const phoneK = mode === 'phone' ? 0 : clamp(+opts.phones || 0);
    const AP = phoneK > 0 ? hordeAtlas('phone', 'front', style, null, litQ, false, keep) : null;
    const freeze = clamp(+opts.freeze || 0);
    const AL = freeze > 0 ? hordeAtlas(mode, view, style, opts.light, litQ, true, keep) : null;
    const tA = freeze > 0 && opts.freezeAt != null ? +opts.freezeAt : t;
    const rate = opts.rate == null ? M0.rate : +opts.rate, sync = clamp(opts.sync == null ? 0.25 : +opts.sync);
    const fogK = opts.fog ? clamp(opts.fog.k == null ? 0.6 : +opts.fog.k) : 0, fogC = opts.fog ? (opts.fog.color || PAL('fog', '#2a3a5c')) : null;
    const pl = hordePlace(opts);
    const ar = opts.area && typeof opts.area === 'object' ? opts.area : null;
    const drift = opts.drift, lookAt = opts.lookAt;
    const wg = opts.wristGlow == null ? (thermal ? 0 : 1) : clamp(+opts.wristGlow);
    const beatS = NS.BEAT || 0.4, items = [];
    for (const p of pl) {
      if (p.lod >= lod) continue;
      let x = p.x, y = p.y, sc = p.s, d = p.d;
      if (drift && ar) {
        const span = ar.x1 - ar.x0 + 160;
        x = ar.x0 - 80 + (((p.x - ar.x0 + 80 + (drift[0] || 0) * t) % span) + span) % span;
        if (drift[1]) { d = fract(p.d + (drift[1] * t) / max(1, ar.yNear - ar.yFar)); y = lerp(ar.yFar, ar.yNear, d); sc = lerp(ar.sFar, ar.sNear, d); }
      }
      const face = opts.face ? (opts.face < 0 ? -1 : 1) : drift && drift[0] ? (drift[0] < 0 ? -1 : 1) : p.face;
      let atlas = A, fi = floor(fract((tA / beatS) * rate + (1 - sync) * p.ph) * 8) & 7;
      if (AP && H01(p.i, seed + 7) < phoneK) atlas = AP;
      if (AL && atlas === A && freeze > 0.03 + 0.55 * p.ph2) {
        let b = 1;
        if (lookAt) {
          const hg = sc * 300, dx = lookAt[0] - x, dy = lookAt[1] - (y - hg * 0.9);
          if (dy < -2.2 * hg && abs(dx) < abs(dy) * 1.2) b = 3; else if (abs(dx) < 1.4 * hg) b = 1; else b = dx < 0 ? 0 : 2;
          if (face < 0 && b !== 1 && b !== 3) b = 2 - b;
        }
        atlas = AL; fi = (fi < 4 ? 0 : 4) + b;
      }
      items.push([x, y, sc, face, atlas, p.v, fi, fogK > 0 ? fogK * pow(1 - clamp(d), 1.3) : 0]);
    }
    if (drift && drift[1]) items.sort((a, b) => a[1] - b[1]);
    const Mx = ctx.getTransform();
    ctx.save();
    const ga = opts.alpha == null ? 1 : clamp(+opts.alpha);
    ctx.globalAlpha = ga;
    const phones = [];
    for (const it of items) {
      const at = it[4], k = it[2] / at.s, fk = it[3] * k;
      ctx.setTransform(Mx.a * fk, Mx.b * fk, Mx.c * k, Mx.d * k, Mx.a * it[0] + Mx.c * it[1] + Mx.e, Mx.b * it[0] + Mx.d * it[1] + Mx.f);
      const sx = it[6] * at.cw, sy = it[5] * at.ch;
      ctx.drawImage(at.cv, sx, sy, at.cw, at.ch, -at.ox, -at.oy, at.cw, at.ch);
      if (it[7] > 0.02) {
        const fa = fogAtlas(at, fogC, keep);
        ctx.globalAlpha = ga * it[7];
        ctx.drawImage(fa, sx / 2, sy / 2, at.cw / 2, at.ch / 2, -at.ox, -at.oy, at.cw, at.ch);
        ctx.globalAlpha = ga;
      }
    }
    ctx.setTransform(Mx);
    if (!thermal) {
      ctx.globalCompositeOperation = 'lighter';
      const uv = glowSprite(PAL('uv', '#c86bff'), 'hot'), ph = glowSprite('#e4f2ff', 'soft');
      for (const it of items) {
        const at = it[4], fr = at.frames[it[5] * 8 + it[6]], k = it[2] / at.s;
        if (wg > 0 && fr.w) {
          const r = 22 * it[2], wx = it[0] + it[3] * k * fr.w[0], wy = it[1] + k * fr.w[1];
          ctx.globalAlpha = ga * wg * 0.85 * (1 - 0.6 * it[7]);
          ctx.drawImage(uv, wx - r, wy - r, r * 2, r * 2);
        }
        if (fr.p) {
          const r = 40 * it[2], px = it[0] + it[3] * k * fr.p[0], py = it[1] + k * fr.p[1];
          ctx.globalAlpha = ga * 0.7 * (1 - 0.5 * it[7]);
          ctx.drawImage(ph, px - r, py - r, r * 2, r * 2);
          phones.push([px, py, it[2]]);
        }
      }
    }
    ctx.restore();
    return { drawn: items.length, phones };
  }
  horde.warm = function (modes, opts) {
    opts = opts || {};
    const keep = new Set();
    for (const m of modes || []) if (HMODE[m]) hordeAtlas(m, opts.view || HMODE[m].view, opts.style || 'normal', opts.light, opts.lit == null ? ((opts.style || '') === 'human' ? 0.25 : 0) : Math.round(clamp(+opts.lit) * 4) / 4, !!opts.look, keep);
  };
  horde.release = function () {
    HORDE.atlases.forEach((A) => { NS.freeCanvas(A.cv); A.fog.forEach((f) => NS.freeCanvas(f)); });
    HORDE.atlases.clear();
  };
  horde.mem = hordeMem;

  Object.assign(kit, { rig, poses, blendPose, survivor, portrait, zombie, groupie, roadie, horde, ironbow, CAST });
})();
