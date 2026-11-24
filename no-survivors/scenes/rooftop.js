// NO SURVIVORS: shot "rooftop" (bars 90-106): the lift, the final chorus in F# minor, the call and response
// and the ending. A battered old charter chopper with Lou's mark on its side hovers over the Orpheum; the band
// climbs its rope ladder still playing; the street below is packed with the dead to the horizon. Bar 105.0 (the
// final hit) freezes into a screen-printed gig poster with the NO SURVIVORS logo, which the engine then burns.
// Pure: every frame is a function of S (seeded noise only). Sub-shots are cut on beats from the table SHOTS.
(function () {
  'use strict';
  const NS = window.NS;
  if (!NS || !NS.shot) return;
  const C = NS.C, F = NS.F, TAU = NS.TAU;
  const clamp = NS.clamp, lerp = NS.lerp, sstep = NS.smoothstep, hash = NS.hash, noise1 = NS.noise1, fract = NS.fract;
  const E = NS.ease;
  const { sin, cos, abs, min, max, pow, floor, PI, exp, hypot, atan2 } = Math;
  const W = 1280, H = 720, BEAT = 0.4;
  const K = () => NS.kit;
  const bt = (b) => b * BEAT;                // global beat -> seconds
  const FW = [375, 383, 391, 398, 399];      // fireworks hit beats

  // ================================================================================================ helpers
  const css = (hex, a) => {
    if (a == null || a >= 1) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a).toFixed(3)})`;
  };
  const pulse = (since, rate) => (since >= 0 && since < 9 ? exp(-since * (rate || 9)) : 0);
  function glow(ctx, x, y, r, col, k, kind) { if (k > 0.004) K().glow(ctx, x, y, r, col, k, kind || 'soft'); }
  // camera: world (x, y) -> frame centre, zoom z, roll rot; plus shake offset
  function camApply(ctx, c) {
    ctx.translate(W / 2 + (c.dx || 0), H / 2 + (c.dy || 0));
    if (c.rot) ctx.rotate(c.rot);
    ctx.scale(c.z, c.z);
    ctx.translate(-c.x, -c.y);
  }
  const camPt = (c, x, y) => {
    const dx = (x - c.x) * c.z, dy = (y - c.y) * c.z, cr = cos(c.rot || 0), sr = sin(c.rot || 0);
    return [W / 2 + (c.dx || 0) + dx * cr - dy * sr, H / 2 + (c.dy || 0) + dx * sr + dy * cr];
  };
  // kick punch: a small zoom on each kick, scaled by the shake setting
  const punch = (S, amt) => 1 + (amt || 0.018) * pulse(S.kick, 11) * (S.shakeK == null ? 1 : S.shakeK);

  // ================================================================================================ sub-shots
  // b0/b1 in global beats. Cuts land on beats; every sub-shot changes the camera within 2 bars.
  const SHOTS = [
    { id: 'hit', b0: 360, b1: 362 },     // band hit + choke; the searchlight stabs down through the roof
    { id: 'hole', b0: 362, b1: 364 },    // looking up through the hole: the chopper, the ladder unrolls
    { id: 'stairs', b0: 364, b1: 366 },  // ENCORE slate; EVERYBODY UP!: the fire escape
    { id: 'hatch', b0: 366, b1: 368 },   // onto the roof into the downdraft
    { id: 'wide', b0: 368, b1: 372 },    // KEEP THEM DANCING: the chopper over the roof
    { id: 'flank', b0: 372, b1: 380 },   // the clue: Lou's mark on the flank; Noodle + Granny lines
    { id: 'solo', b0: 380, b1: 384 },    // Granny one-handed solo, Tiny drumming the kit on his back
    { id: 'ladder', b0: 384, b1: 386 },  // IF THE MUSIC...: the band strung on the ladder
    { id: 'freeze', b0: 386, b1: 392 },  // STOPS: the street freezes and looks up; "There was a LAST night?"
    { id: 'tiny', b0: 392, b1: 396 },    // WE'RE DEAD ON OUR FEET: Tiny with the kit
    { id: 'vex', b0: 396, b1: 400 },     // Vex last, waving like royalty; fireworks
    { id: 'call1', b0: 400, b1: 404 },   // ONE MORE SONG?
    { id: 'resp1', b0: 404, b1: 408 },   // ONE! MORE! SONG! (a sea of fists)
    { id: 'call2', b0: 408, b1: 412 },   // HOW MANY MORE?
    { id: 'resp2', b0: 412, b1: 416 },   // ONE! MORE! SONG! to the horizon
    { id: 'away', b0: 416, b1: 420 },    // tremolo + roll, GOOD NIGHT!: the chopper climbs away
    { id: 'poster', b0: 420, b1: 1e9 },  // the final hit: freeze-frame poster
  ];
  function shotAt(S) {
    const b = S.beat;
    for (let i = SHOTS.length - 1; i >= 0; i--) if (b >= SHOTS[i].b0) return SHOTS[i];
    return SHOTS[0];
  }

  // ================================================================================================ the chopper
  // An old charter/news chopper: faded cream over slate, a red belly stripe, patches, rust, a taped canopy crack,
  // Lou's clock mark big on the cabin side and 1313 on the boom. Design units: nose to +x, the ladder hangs from
  // the open door's sill at (-118, 15). o: x, y (ladder attach point in ctx space), s, face (1 = nose right),
  // tilt, lit 0..1 (paint visible), rimTop/rimBot colours, rot (rotor phase), beam {ang (frame radians), k, len}.
  const CH = { door: [-118, 15], light: [222, 38], hub: [-10, -224], mark: [20, -64], markD: 118, tail: [-628, -150] };
  function chPt(o, p) {
    const s = o.s || 1, f = o.face || 1, a = o.tilt || 0;
    const lx = (p[0] - CH.door[0]) * s * f, ly = (p[1] - CH.door[1]) * s;
    return [o.x + lx * cos(a) - ly * sin(a), o.y + lx * sin(a) + ly * cos(a)];
  }
  function bodyPath(g) {
    g.beginPath();
    g.moveTo(-205, -150); g.lineTo(80, -160);
    g.bezierCurveTo(150, -164, 210, -150, 250, -112);
    g.bezierCurveTo(292, -76, 304, -30, 292, 0);
    g.bezierCurveTo(284, 18, 256, 28, 214, 30);
    g.lineTo(-150, 28);
    g.bezierCurveTo(-185, 26, -205, 2, -210, -30);
    g.lineTo(-215, -122); g.closePath();
  }
  function boomPath(g) {
    g.beginPath(); g.moveTo(-200, -142); g.lineTo(-604, -114); g.lineTo(-606, -88); g.lineTo(-204, -50); g.closePath();
  }
  function finPath(g) {
    g.beginPath(); g.moveTo(-588, -112); g.lineTo(-652, -236); g.lineTo(-618, -240); g.lineTo(-560, -110); g.closePath();
    g.moveTo(-586, -92); g.lineTo(-632, -38); g.lineTo(-612, -34); g.lineTo(-568, -90); g.closePath();
    g.moveTo(-520, -104); g.lineTo(-462, -110); g.lineTo(-460, -96); g.lineTo(-520, -92); g.closePath();
  }
  function humpPath(g) {
    g.beginPath(); g.moveTo(-160, -152);
    g.bezierCurveTo(-150, -192, -110, -200, -50, -200); g.lineTo(60, -198);
    g.bezierCurveTo(84, -196, 96, -176, 98, -158); g.closePath();
  }
  function chopper(ctx, S, o) {
    const s = o.s || 1, face = o.face || 1, t = S.t;
    const lit = o.lit == null ? 0.35 : o.lit;
    const rimTop = o.rimTop || '#bfe6ff', rimBot = o.rimBot || C.fire;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.tilt) ctx.rotate(o.tilt);
    ctx.scale(s * face, s);
    ctx.translate(-CH.door[0], -CH.door[1]);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // --- rotor disc behind? (drawn after, in front, as a translucent blur)
    // --- tail rotor
    {
      const [tx, ty] = CH.tail;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(tx, ty, 4, tx, ty, 54);
      g.addColorStop(0, 'rgba(180,200,230,0.05)'); g.addColorStop(0.8, 'rgba(180,200,230,0.10)'); g.addColorStop(1, 'rgba(180,200,230,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tx, ty, 54, 0, TAU); ctx.fill();
      ctx.restore();
      const a = t * 37;
      ctx.strokeStyle = 'rgba(20,24,32,0.75)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(tx - cos(a) * 50, ty - sin(a) * 50); ctx.lineTo(tx + cos(a) * 50, ty + sin(a) * 50); ctx.stroke();
      ctx.fillStyle = '#2a2f38'; ctx.beginPath(); ctx.arc(tx, ty, 7, 0, TAU); ctx.fill();
    }
    // --- far skid
    ctx.strokeStyle = '#0c0f15'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(-140, 56); ctx.lineTo(214, 56); ctx.quadraticCurveTo(246, 54, 256, 34); ctx.stroke();
    // --- paint: boom, fin, body, hump
    const paint = (pathFn, top, bot) => {
      pathFn(ctx);
      const gr = ctx.createLinearGradient(0, -240, 0, 40);
      gr.addColorStop(0, top); gr.addColorStop(0.55, top); gr.addColorStop(0.62, bot); gr.addColorStop(1, bot);
      ctx.fillStyle = gr; ctx.fill();
    };
    const cream = mixHex('#0d1119', '#c9bd9c', lit), slate = mixHex('#080b12', '#2c3a48', lit), dark = mixHex('#05070b', '#1a222c', lit);
    paint(boomPath, cream, slate);
    finPath(ctx); ctx.fillStyle = slate; ctx.fill();
    paint(bodyPath, cream, slate);
    humpPath(ctx); ctx.fillStyle = mixHex('#0a0d14', '#8d8a7c', lit); ctx.fill();
    // red belly stripe (faded) along body and boom
    ctx.save(); bodyPath(ctx); ctx.clip();
    ctx.fillStyle = mixHex('#14080a', '#8c2a26', lit); ctx.fillRect(-230, 2, 540, 12);
    // panel lines, patches, rust streaks
    ctx.strokeStyle = css('#000000', 0.35); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-40, -158); ctx.lineTo(-40, 26); ctx.moveTo(100, -150); ctx.lineTo(100, 26); ctx.moveTo(-210, -40); ctx.lineTo(300, -40); ctx.stroke();
    ctx.fillStyle = mixHex('#0b0e14', '#a89f84', lit);
    ctx.fillRect(-28, -150, 46, 30); ctx.fillRect(150, -18, 52, 26);
    ctx.fillStyle = css('#000000', 0.5);
    for (const [px, py] of [[-28, -150], [18, -150], [-28, -120], [18, -120], [150, -18], [202, -18], [150, 8], [202, 8]]) { ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 9; i++) {
      const rx = -200 + hash(i, 71) * 480, ry = -150 + hash(i, 72) * 60, rl = 30 + hash(i, 73) * 70;
      const rg = ctx.createLinearGradient(0, ry, 0, ry + rl);
      rg.addColorStop(0, css('#5a2a12', 0.5 * lit)); rg.addColorStop(1, css('#5a2a12', 0));
      ctx.fillStyle = rg; ctx.fillRect(rx, ry, 3 + hash(i, 74) * 4, rl);
    }
    // dents
    ctx.strokeStyle = css('#000000', 0.3); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(160, -120, 18, 0.3, 2.2); ctx.moveTo(-170, 8); ctx.arc(-180, -10, 20, 0.2, 1.6); ctx.stroke();
    ctx.restore();
    // --- the open door: dark cabin with a faint red work light, cargo net
    ctx.save();
    ctx.beginPath(); roundRect(ctx, -176, -130, 116, 146, 10); ctx.fillStyle = '#05060a'; ctx.fill(); ctx.clip();
    const dg = ctx.createRadialGradient(-118, -110, 4, -118, -110, 120);
    dg.addColorStop(0, 'rgba(140,30,30,0.55)'); dg.addColorStop(1, 'rgba(60,10,10,0)');
    ctx.fillStyle = dg; ctx.fillRect(-176, -130, 116, 146);
    ctx.strokeStyle = 'rgba(80,60,50,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { ctx.moveTo(-170 + i * 22, -120); ctx.lineTo(-150 + i * 22, 0); ctx.moveTo(-150 + i * 22, -120); ctx.lineTo(-170 + i * 22, 0); }
    ctx.stroke();
    ctx.restore();
    // door rail + sill
    ctx.fillStyle = '#0a0c10'; ctx.fillRect(-182, 12, 128, 8); ctx.fillRect(-230, -138, 180, 5);
    // --- canopy glass with Lou's silhouette (headset, the mark on the helmet)
    ctx.save();
    ctx.beginPath(); ctx.moveTo(92, -152); ctx.bezierCurveTo(152, -156, 206, -142, 240, -110);
    ctx.bezierCurveTo(276, -76, 290, -38, 284, -8); ctx.lineTo(170, -8); ctx.lineTo(108, -42); ctx.closePath();
    const gg = ctx.createLinearGradient(100, -150, 280, -10);
    gg.addColorStop(0, '#16303a'); gg.addColorStop(1, '#071016');
    ctx.fillStyle = gg; ctx.fill(); ctx.clip();
    // instrument glow from below
    const ig = ctx.createLinearGradient(0, -10, 0, -90);
    ig.addColorStop(0, 'rgba(90,255,190,0.35)'); ig.addColorStop(1, 'rgba(90,255,190,0)');
    ctx.fillStyle = ig; ctx.fillRect(100, -90, 200, 82);
    // Lou: shoulders, helmet, headset cup, mic boom: a black cut-out
    ctx.fillStyle = '#020305';
    ctx.beginPath(); ctx.ellipse(196, -96, 26, 30, -0.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(150, -8); ctx.quadraticCurveTo(160, -64, 196, -66); ctx.quadraticCurveTo(236, -64, 246, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#020305'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(212, -86); ctx.quadraticCurveTo(232, -78, 226, -70); ctx.stroke();
    K().symbol(ctx, 186, -104, 15, NS.WHO.LOU, 0.85, { glow: 0.5 });
    // reflection streaks + taped crack
    ctx.strokeStyle = 'rgba(200,235,255,0.22)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(140, -150); ctx.lineTo(118, -50); ctx.moveTo(170, -150); ctx.lineTo(150, -60); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,230,240,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(250, -100); ctx.lineTo(232, -78); ctx.lineTo(244, -60); ctx.moveTo(232, -78); ctx.lineTo(214, -74); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(236, -80); ctx.rotate(0.6); ctx.fillStyle = mixHex('#1a1a1a', '#9a9a8e', lit);
    ctx.fillRect(-16, -4, 32, 8); ctx.rotate(-1.2); ctx.fillRect(-16, -4, 32, 8); ctx.restore();
    // --- Lou's mark, big, and 1313 on the boom (never mirrored)
    {
      const [mx, my] = CH.mark;
      ctx.save(); ctx.translate(mx, my); ctx.scale(face, 1);
      ctx.fillStyle = mixHex('#05080e', '#1b2a3a', lit); ctx.beginPath(); ctx.arc(0, 0, CH.markD / 2 + 6, 0, TAU); ctx.fill();
      K().symbol(ctx, 0, 0, CH.markD, mixHex('#3a5560', '#c8f4ff', lit), 1, { weight: 0.1, ticks: true, glow: o.markGlow || 0 });
      ctx.restore();
      ctx.save(); ctx.translate(-352, -90); ctx.rotate(0.067); ctx.scale(face, 1);
      ctx.font = NS.font(56, F.title); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = mixHex('#05080e', '#1b2430', lit); ctx.fillText('1313', 0, 2);
      ctx.restore();
    }
    // --- rim light: top edges (searchlight / moon) and belly (fire below)
    ctx.save();
    const rimPass = (pathFn) => {
      pathFn(ctx);
      ctx.save(); ctx.clip();
      const rg = ctx.createLinearGradient(0, -240, 0, 40);
      rg.addColorStop(0, css(rimTop, 0.55 * (o.rimK == null ? 1 : o.rimK))); rg.addColorStop(0.18, css(rimTop, 0));
      rg.addColorStop(0.8, css(rimBot, 0)); rg.addColorStop(1, css(rimBot, 0.6 * (o.rimBotK == null ? 1 : o.rimBotK)));
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rg; ctx.fillRect(-700, -260, 1100, 320);
      ctx.restore();
    };
    rimPass(bodyPath); rimPass(boomPath); rimPass(humpPath);
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = css(rimTop, 0.55); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-600, -114); ctx.lineTo(-200, -142); ctx.moveTo(-205, -150); ctx.lineTo(80, -160); ctx.bezierCurveTo(150, -164, 210, -150, 250, -112); ctx.stroke();
    ctx.restore();
    // --- near skid + struts
    ctx.strokeStyle = '#06080c'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(-110, 24); ctx.lineTo(-124, 66); ctx.moveTo(130, 26); ctx.lineTo(140, 66); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-160, 66); ctx.lineTo(230, 66); ctx.quadraticCurveTo(262, 64, 272, 42); ctx.stroke();
    ctx.strokeStyle = css(rimBot, 0.45); ctx.lineWidth = 2; ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(-160, 71); ctx.lineTo(230, 71); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    // --- searchlight gimbal
    ctx.fillStyle = '#0a0c11'; ctx.beginPath(); ctx.arc(CH.light[0], CH.light[1] - 6, 14, 0, TAU); ctx.fill();
    ctx.fillRect(CH.light[0] - 4, 24, 8, 12);
    // --- mast + rotor disc + blades
    ctx.fillStyle = '#07090d'; ctx.fillRect(-22, -222, 24, 26);
    const [hx, hy] = CH.hub, RX = 600, RY = 34;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg2 = ctx.createRadialGradient(hx, hy, 10, hx, hy, RX);
    rg2.addColorStop(0, 'rgba(160,190,230,0.0)'); rg2.addColorStop(0.75, 'rgba(160,190,230,0.07)'); rg2.addColorStop(0.97, 'rgba(190,215,255,0.14)'); rg2.addColorStop(1, 'rgba(190,215,255,0)');
    ctx.fillStyle = rg2; ctx.beginPath(); ctx.ellipse(hx, hy, RX, RY, 0, 0, TAU); ctx.fill();
    ctx.restore();
    const rot = o.rot == null ? t * 5.3 : o.rot;
    for (let b = 0; b < 2; b++) {
      for (let j = 0; j < 4; j++) {
        const a = rot + b * PI - j * 0.07;
        ctx.strokeStyle = `rgba(8,10,14,${(0.8 - j * 0.18).toFixed(3)})`; ctx.lineWidth = 9 - j * 1.5;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + cos(a) * RX, hy + sin(a) * RY); ctx.stroke();
      }
    }
    ctx.fillStyle = '#0c0f15'; ctx.beginPath(); ctx.ellipse(hx, hy, 26, 9, 0, 0, TAU); ctx.fill();
    // --- nav lights (small): red beacon on the belly (1 Hz), red/green tips, white tail strobe (tiny)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const bk = fract(t * 1.0) < 0.18 ? 1 : 0.15;
    glow(ctx, -40, 30, 30, '#ff2a2a', 0.8 * bk, 'hot');
    glow(ctx, -650, -236, 14, '#ffffff', fract(t * 0.8 + 0.3) < 0.08 ? 0.9 : 0.05, 'hot');
    glow(ctx, 290, -20, 12, face > 0 ? '#39ff7a' : '#ff3030', 0.7, 'hot');
    ctx.restore();
    ctx.restore();
  }
  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function mixHex(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, clamp(k)));
    return '#' + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
  }
  // the searchlight beam from the gimbal (frame-space angle)
  function chopperBeam(ctx, S, o, ang, k, len, spread) {
    const p = chPt(o, CH.light);
    K().beam(ctx, p[0], p[1], ang, spread || 0.16, len || 900, '#e8f6ff', k, { motes: 26, t: S.t, seed: 9 });
    glow(ctx, p[0], p[1], 60 * (o.s || 1) + 20, '#f4fbff', 0.9 * k, 'hot');
  }

  // ================================================================================================ the rope ladder
  // A rope ladder hanging from (x, y), len long, swaying. at(d) -> [x, y] along the centre line.
  function ladder(S, x, y, len, o) {
    o = o || {};
    const t = S.t, sw = o.sway == null ? 1 : o.sway;
    const th = sw * (0.07 * sin(t * 1.9 + 0.4) + 0.03 * noise1(t * 0.7, 5)) + (o.lean || 0);
    const bend = sw * 26 * sin(t * 2.7 + 1.1);
    const at = (d) => {
      const u = clamp(d / len, 0, 1.4);
      return [x + sin(th) * d + bend * u * u * (1 - 0.4 * u) + (o.wind || 0) * u * u, y + d * cos(th)];
    };
    return { x, y, len, at, w: o.w || 40, rung: o.rung || 26, th };
  }
  function drawLadder(ctx, L, o) {
    o = o || {};
    const n = 22, w = L.w, col = o.color || '#2a1d14', rim = o.rim || 'rgba(255,200,150,0.35)';
    const d0 = o.d0 || 0, d1 = o.d1 == null ? L.len : o.d1;
    ctx.save(); ctx.lineCap = 'round';
    // rungs
    ctx.strokeStyle = col; ctx.lineWidth = max(2, w * 0.16);
    ctx.beginPath();
    for (let d = d0 + L.rung * 0.5; d < d1; d += L.rung) {
      const p = L.at(d), q = L.at(d + 4);
      const ax = (q[1] - p[1]), ay = -(q[0] - p[0]), al = hypot(ax, ay) || 1;
      ctx.moveTo(p[0] - ax / al * w / 2, p[1] - ay / al * w / 2); ctx.lineTo(p[0] + ax / al * w / 2, p[1] + ay / al * w / 2);
    }
    ctx.stroke();
    // ropes
    for (const sd of [-1, 1]) {
      ctx.strokeStyle = col; ctx.lineWidth = max(1.5, w * 0.09);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const d = lerp(d0, d1, i / n), p = L.at(d), q = L.at(d + 4);
        const ax = (q[1] - p[1]), ay = -(q[0] - p[0]), al = hypot(ax, ay) || 1;
        const px = p[0] + sd * ax / al * w / 2, py = p[1] + sd * ay / al * w / 2;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.strokeStyle = rim; ctx.lineWidth = max(0.8, w * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================================================ the band
  // Hang the band on a ladder L at scale s. order top -> bottom: tiny, granny, vex, noodle. Returns anchors by who.
  const HANG = { tiny: 0, granny: 1, vex: 2, noodle: 3 };
  function bandPoses(S, mode) {
    const b = S.beat, t = S.t;
    // Tiny still drumming: one hand on the rope, the other swings a bat back to the crash over his shoulder
    const sn = S.drum ? S.drum('snare') : { since: 9 }, kk = S.drum ? S.drum('kick') : { since: 9 };
    const hitk = pulse(min(sn.since, kk.since), 7);
    const tiny = Object.assign(K().poses.climb(b * 0.25), { nsh: 2.2 + 0.9 * hitk, nel: 1.6 - 0.8 * hitk, nas: 0.6, nhand: 'grip', mouth: 0.3, expr: 'neutral', turn: 0.5 });
    const granny = Object.assign(K().poses.climbSolo(b), { expr: 'deadpan' });
    const vex = mode === 'call' ? Object.assign(K().poses.climb(0.25), { nsh: 1.55, nel: 0.2, nas: 0.15, use: 'sing', aim: 0.35, fsh: 2.95, fel: 0.1, turn: 0.55, expr: 'shout', mouth: 0.9, wind: 0.6, flap: b })
      : Object.assign(K().poses.climbWave(b * 0.5), { wind: 0.5, flap: b * 0.5 });
    const noodle = Object.assign(K().poses.hang(b * 0.25 + 0.1), { expr: 'scared', mouth: 0.6 + 0.2 * sin(t * 9) });
    return { tiny, granny, vex, noodle };
  }
  const BAND_H = { tiny: 405, granny: 300, vex: 324, noodle: 285 };
  function bandOnLadder(ctx, S, L, s, o) {
    o = o || {};
    const P = Object.assign(bandPoses(S, o.mode), o.poses || {});
    const order = o.order || ['tiny', 'granny', 'vex', 'noodle'];
    const gaps = o.gaps || { tiny: 40, granny: 470, vex: 860, noodle: 1270 };
    const out = {};
    const rim = o.rim || { color: '#cfeaff', dir: -PI / 2, k: 1.15 }, rim2 = o.rim2 || { color: C.fire, dir: PI / 2 + 0.3, k: 0.7 };
    const list = o.draw || order;
    for (const who of list) {
      const d = gaps[who] * s;
      if (d > L.len + 60 * s) continue;
      const p = L.at(d);
      const face = o.face && o.face[who] != null ? o.face[who] : (who === 'granny' || who === 'noodle' ? -1 : 1);
      out[who] = K().survivor(ctx, who, P[who], {
        x: p[0] + (who === 'tiny' ? -6 : 0) * s, y: p[1], s, face, pin: 'hands', rim, rim2, lit: o.lit == null ? 0.32 : o.lit,
        t: S.t, accent: 0.75, kitOnBack: who === 'tiny', prop: who === 'vex' ? 'megaphone' : undefined,
        lamp: who === 'noodle' ? 1 : undefined,
      });
    }
    return out;
  }

  // ================================================================================================ city + crowd
  function nightSky(ctx, S, o) {
    o = o || {};
    K().sky(ctx, S, Object.assign({ top: '#04050c', bottom: '#2b1a33', clouds: 0.55, stars: 0.4, glow: 0.9, glowColor: '#8a3a26', wind: 10,
      moon: o.moon || null }, o));
  }
  // crowd in a perspective street seen from above. o: vx, vy (vanishing point), f (focal), h (camera height),
  // halfW (street half width incl. sidewalks), zNear, zFar, count, seed, mode, freeze, lookAt, rate, sync
  function streetPlace(o) {
    const vx = o.vx, vy = o.vy, f = o.f, h = o.h, hw = o.halfW, zN = o.zNear, zF = o.zFar;
    return (i, rnd) => {
      const u = rnd(), iz = lerp(1 / zF, 1 / zN, pow(u, o.pow || 0.8)), z = 1 / iz;
      const X = (rnd() * 2 - 1) * hw;
      const s = (o.figS || 1.7) * f / z / 300;
      return { x: vx + f * X / z, y: vy + f * h / z, s, d: clamp((1 / z - 1 / zF) / (1 / zN - 1 / zF)) };
    };
  }
  function streetBuildings(ctx, S, o) {
    // building blocks along both sides of the avenue; the camera is above their roofs
    const vx = o.vx, vy = o.vy, f = o.f, h = o.h, hw = o.halfW;
    const P = (X, Y, Z) => [vx + f * X / Z, vy + f * (h - Y) / Z];
    const rows = [];
    for (const side of [-1, 1]) {
      let z = o.zNear * 0.6, i = 0;
      while (z < o.zFar * 1.3 && i < 40) {
        const len = 18 + hash(i, side > 0 ? 31 : 32) * 26, gap = hash(i, side > 0 ? 33 : 34) < 0.25 ? 14 : 2;
        const bh = (o.bh || 16) * (0.6 + hash(i, side > 0 ? 35 : 36) * 0.9), dep = 30;
        rows.push({ side, z0: z, z1: z + len, bh, dep, i });
        z += len + gap; i++;
      }
    }
    rows.sort((a, b) => b.z0 - a.z0);
    ctx.save();
    for (const r of rows) {
      const X0 = r.side * hw, X1 = r.side * (hw + r.dep);
      const z0 = max(r.z0, 2), z1 = r.z1;
      // facade (inner plane at X0)
      const a = P(X0, 0, z0), b = P(X0, 0, z1), c = P(X0, r.bh, z1), d = P(X0, r.bh, z0);
      const fk = clamp(1 - (z0 - o.zNear) / (o.zFar - o.zNear));
      ctx.fillStyle = mixHex(o.fogCol || '#1c1830', '#0b0c14', 0.35 + 0.65 * fk);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
      // lit windows on the facade
      const nx = max(1, floor((z1 - z0) / 4)), ny = max(1, floor(r.bh / 3.2));
      if (abs(a[0] - b[0]) > 6) {
        for (let jx = 0; jx < nx; jx++) for (let jy = 0; jy < ny; jy++) {
          const hv = hash(jx * 31 + jy * 7 + r.i * 131, r.side > 0 ? 5 : 6);
          if (hv > 0.3) continue;
          const zz = lerp(z0, z1, (jx + 0.3) / nx), zz2 = lerp(z0, z1, (jx + 0.7) / nx), yy = (jy + 0.35) / ny * r.bh, yy2 = (jy + 0.75) / ny * r.bh;
          const p1 = P(X0, yy, zz), p2 = P(X0, yy2, zz2);
          ctx.fillStyle = hv < 0.08 ? css('#ffd9a0', 0.55 * (0.4 + fk * 0.6)) : css('#ff9a3c', 0.28 * (0.4 + fk * 0.6));
          ctx.fillRect(min(p1[0], p2[0]), min(p1[1], p2[1]), max(1, abs(p2[0] - p1[0])), max(1, abs(p2[1] - p1[1])));
        }
      }
      // roof (top face)
      const e = P(X1, r.bh, z0), g2 = P(X1, r.bh, z1);
      ctx.fillStyle = mixHex(o.fogCol || '#1c1830', '#07080d', 0.3 + 0.7 * fk);
      ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(g2[0], g2[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = css('#ff9a5a', 0.18 * fk); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
    ctx.restore();
  }
  function streetGround(ctx, S, o) {
    const vx = o.vx, vy = o.vy, f = o.f, h = o.h, hw = o.halfW;
    const yN = vy + f * h / o.zNear, yF = vy + f * h / (o.zFar * 1.3);
    const g = ctx.createLinearGradient(0, yF, 0, yN);
    g.addColorStop(0, '#2a1a2c'); g.addColorStop(0.4, '#140f1c'); g.addColorStop(1, '#07070c');
    ctx.fillStyle = g;
    const xN = f * hw / o.zNear * 1.6;
    ctx.beginPath(); ctx.moveTo(vx - xN, yN + 400); ctx.lineTo(vx - f * hw / (o.zFar * 1.3), yF); ctx.lineTo(vx + f * hw / (o.zFar * 1.3), yF); ctx.lineTo(vx + xN, yN + 400); ctx.closePath(); ctx.fill();
  }
  function crowdStreet(ctx, S, o) {
    streetGround(ctx, S, o);
    streetBuildings(ctx, S, o);
    // UV haze over the crowd (the sea of wristbands)
    const r = K().horde(ctx, S, {
      place: streetPlace(o), count: o.count || 420, seed: o.seed || 7, mode: o.mode || 'headbang', rate: o.rate, sync: o.sync == null ? 0.85 : o.sync,
      light: { color: C.zombieRim, dir: -PI / 2 }, fog: { color: '#2a1a34', k: 0.75 }, freeze: o.freeze || 0, freezeAt: o.freezeAt, lookAt: o.lookAt,
      wristGlow: 1, t: o.t,
    });
    return r;
  }

  // ================================================================================================ fireworks
  const FWC = [[C.vex, '#ffd9a0'], [C.granny, '#ffffff'], [C.tiny, C.fireHot], [C.noodle, '#ffffff'], [NS.WHO.LOU, '#ffffff']];
  function fireworks(ctx, S, pos) {
    // pos(i) -> [x, y, r] in ctx space for firework i (null = not in this shot)
    for (let i = 0; i < FW.length; i++) {
      const t0 = bt(FW[i]), age = S.t - t0;
      if (age < -0.7 || age > 2.4) continue;
      const p = pos(i);
      if (!p) continue;
      K().fireworks(ctx, S, { x: p[0], y: p[1], t0, seed: 11 + i * 7, colors: FWC[i % FWC.length], r: p[2] || 170, count: 80, k: p[3] == null ? 1 : p[3] });
    }
  }
  // overall firework light (for washing scenes); 0..1
  function fwLight(S) {
    let k = 0;
    for (const b of FW) { const a = S.t - bt(b); if (a >= 0 && a < 1.5) k = max(k, exp(-a * 3.2)); }
    return k;
  }

  // ================================================================================================ shots
  const D = {};

  // ---- 360-362: the band hit on stage, choke; the searchlight stabs down through the roof
  D.hit = function (ctx, S, q) {
    const k = K();
    const choke = S.beat >= 361 ? 1 : 0;
    const ck = sstep(361, 361.15, S.beat);
    const power = lerp(1, 0.22, ck);
    const opts = { cam: 'low', power, lights: lerp(1, 0, ck), colors: ['#ff2b55', '#3a6bff', '#ffd27a', '#ff2bd6'], pattern: 'down', haze: 0.6, scorch: 0.7,
      curtainFire: 0.55, moon: 0.4 * ck, lasers: 0, pyro: 0 };
    ctx.save();
    const z = punch(S, 0.03) * (1 + 0.04 * sstep(361, 362, S.beat));
    ctx.translate(W / 2, H * 0.55); ctx.scale(z, z); ctx.translate(-W / 2, -H * 0.55);
    const info = k.stageSet(ctx, S, Object.assign({ pass: 'back' }, opts));
    // the band: hit pose at 360, then all heads snap up at the beam
    const sp = info.spots, P = k.poses;
    const up = sstep(361.05, 361.4, S.beat);
    const hitJ = clamp((S.beat - 359.6) / 1.2);
    const rim = { color: lerp(0, 1, ck) > 0.5 ? '#e8f6ff' : '#ffd0a0', dir: -PI / 2, k: 1.3 };
    const rim2 = { color: '#ff2b55', dir: 0.4, k: 0.6 * (1 - ck) };
    const an = {};
    const vexP = k.blendPose(Object.assign(k.poses.jump(lerp(0.5, 0.95, hitJ)), { use: 'sing', expr: 'shout' }), k.poses.lookUp(1), up);
    const grP = k.blendPose(k.poses.guitar(S.beat * (1 - ck)), Object.assign(k.poses.guitar(0), k.poses.lookUp(0.9), { use: 'instrument' }), up);
    const noP = k.blendPose(k.poses.bass(S.beat * (1 - ck)), Object.assign(k.poses.bass(0), k.poses.lookUp(1), { use: 'instrument', expr: 'scared' }), up);
    if (info.drums) k.drumKit(ctx, info.drums[0], info.drums[1], info.drums[2] * 0.56, { S, view: 'front' });
    const tiP = k.blendPose(k.poses.drums(choke ? 0.5 : S.beat, 1), Object.assign(k.poses.drums(0.5, 1), k.poses.lookUp(0.8)), up);
    an.tiny = k.survivor(ctx, 'tiny', tiP, { x: sp.tiny[0], y: sp.tiny[1], s: sp.tiny[2], rim, rim2, lit: 0.35, t: S.t });
    an.granny = k.survivor(ctx, 'granny', grP, { x: sp.granny[0], y: sp.granny[1], s: sp.granny[2], face: 1, rim, rim2, lit: 0.35, t: S.t });
    an.noodle = k.survivor(ctx, 'noodle', noP, { x: sp.noodle[0], y: sp.noodle[1], s: sp.noodle[2], face: -1, rim, rim2, lit: 0.35, t: S.t });
    an.vex = k.survivor(ctx, 'vex', vexP, { x: sp.vex[0], y: sp.vex[1], s: sp.vex[2], face: 1, rim, rim2, lit: 0.35, t: S.t });
    k.stageSet(ctx, S, Object.assign({ pass: 'frame' }, opts));
    k.stageSet(ctx, S, Object.assign({ pass: 'fx' }, opts));
    // the searchlight: stabs in on the choke, through the roof, onto Vex
    const bk = sstep(361.0, 361.12, S.beat);
    if (bk > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tx = sp.vex[0] + 60, ty = sp.vex[1];
      const sx = tx + 140 * sin(S.t * 0.9), sy = -60;
      k.beam(ctx, sx, sy, atan2(ty - sy, tx - sx), 0.13, 900, '#e8f6ff', 0.95 * bk, { motes: 40, t: S.t, seed: 4, core: true });
      // pool on the floor
      ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.28); glow(ctx, 0, 0, 260, '#dff2ff', 0.55 * bk, 'soft'); ctx.restore();
      ctx.restore();
      // dust + plaster falling in the beam
      k.debris(ctx, S, { x: sx + (tx - sx) * 0.1, y: 20, t0: bt(361), seed: 5, count: 30, kind: 'rubble', spread: 1.1, angle: PI / 2, speed: 120, gravity: 900, floorY: ty, s: 0.8, color: '#6a6a78', life: 2 });
    }
    ctx.restore();
    // flash on the band hit (warm white, one per beat)
    const hk = pulse(S.t - bt(360), 6);
    if (hk > 0.02 && S.t >= bt(360)) S.post.flash = [1, 0.9, 0.75, 0.35 * hk];
    S.post.bloom = 0.9; S.post.vignette = 0.6;
    return an;
  };

  // ---- 362-364: looking straight up through the torn ceiling: the chopper, the searchlight, the ladder unrolls
  D.hole = function (ctx, S, q) {
    const k = K(), t = S.t;
    const lb = S.beat - 362;
    const c = { x: W / 2, y: H / 2, z: 1 + 0.05 * lb * punch(S, 0.01), rot: -0.08 + 0.03 * lb };
    ctx.save(); camApply(ctx, c);
    // sky through the hole
    nightSky(ctx, S, { x: -200, y: -200, w: W + 400, h: H + 400, clouds: 0.5, glow: 0.2 });
    // the chopper from below (belly, skids, rotor disc), drifting slightly
    const cx = 660 + 30 * sin(t * 0.8), cy = 250 + 10 * sin(t * 1.3);
    ctx.save();
    ctx.translate(cx, cy);
    // rotor disc (seen from below: a circle)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(0, 0, 20, 0, 0, 520);
    rg.addColorStop(0, 'rgba(160,190,230,0.0)'); rg.addColorStop(0.85, 'rgba(160,190,230,0.10)'); rg.addColorStop(0.98, 'rgba(200,225,255,0.18)'); rg.addColorStop(1, 'rgba(200,225,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, 520, 0, TAU); ctx.fill();
    ctx.restore();
    const ra = t * 5.3;
    for (let b = 0; b < 2; b++) for (let j = 0; j < 4; j++) {
      const a = ra + b * PI - j * 0.06;
      ctx.strokeStyle = `rgba(6,8,12,${(0.85 - j * 0.2).toFixed(3)})`; ctx.lineWidth = 22 - j * 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cos(a) * 520, sin(a) * 520); ctx.stroke();
    }
    // belly: an elongated pod + boom, skids
    ctx.rotate(-0.5);
    ctx.fillStyle = '#07090e';
    ctx.beginPath(); ctx.ellipse(0, 0, 210, 95, 0, 0, TAU); ctx.fill();
    ctx.fillRect(-560, -22, 380, 44);
    ctx.beginPath(); ctx.ellipse(-560, 0, 30, 60, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#05070a'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(-170, -120); ctx.lineTo(200, -120); ctx.moveTo(-170, 120); ctx.lineTo(200, 120);
    ctx.moveTo(-100, -120); ctx.lineTo(-90, -60); ctx.moveTo(120, -120); ctx.lineTo(110, -60); ctx.moveTo(-100, 120); ctx.lineTo(-90, 60); ctx.moveTo(120, 120); ctx.lineTo(110, 60); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,230,255,0.4)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 210, 95, 0, PI * 1.05, PI * 1.85); ctx.stroke();
    // belly beacon
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, -30, 0, 40, '#ff2a2a', fract(t) < 0.18 ? 0.9 : 0.15, 'hot');
    ctx.restore();
    // the searchlight straight at the camera: a hot disc + flare
    const lx = cx + 150 * cos(-0.5), ly = cy + 150 * sin(-0.5);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, lx, ly, 420, '#cfeaff', 0.5, 'soft');
    glow(ctx, lx, ly, 120, '#ffffff', 1, 'hot');
    ctx.strokeStyle = 'rgba(200,235,255,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(lx - 700, ly + 40); ctx.lineTo(lx + 700, ly - 40); ctx.stroke();
    ctx.restore();
    // the rope ladder unrolls down at the camera (from the door, foreshortened)
    const drop = E.outCubic(clamp((S.beat - 362.6) / 0.9));
    if (drop > 0) {
      const ax = cx - 40, ay = cy + 40;
      ctx.save(); ctx.strokeStyle = '#1a120c'; ctx.lineCap = 'round';
      const n = 14;
      for (let i = 0; i < n * drop; i++) {
        const u = i / n, u2 = (i + 1) / n;
        const sc = (u) => 1 + 9 * pow(u, 2.2);
        const px = ax + (u * 380 - 60 * sin(t * 2 + u * 3)) , py = ay + u * 520;
        const qx = ax + (u2 * 380 - 60 * sin(t * 2 + u2 * 3)), qy = ay + u2 * 520;
        const w1 = 18 * sc(u), w2 = 18 * sc(u2);
        ctx.lineWidth = 2 + 4 * sc(u) * 0.4;
        ctx.beginPath(); ctx.moveTo(px - w1, py); ctx.lineTo(qx - w2, qy); ctx.moveTo(px + w1, py); ctx.lineTo(qx + w2, qy); ctx.stroke();
        ctx.lineWidth = 3 + 3 * sc(u) * 0.5;
        ctx.beginPath(); ctx.moveTo(qx - w2, qy); ctx.lineTo(qx + w2, qy); ctx.stroke();
      }
      ctx.restore();
    }
    // the ceiling: ornate plaster rings with a ragged hole (drawn as a frame around the hole)
    ctx.save();
    ctx.beginPath(); ctx.rect(-400, -400, W + 800, H + 800);
    const hx = 640, hy = 330;
    const pts = 40;
    for (let i = pts; i >= 0; i--) {
      const a = i / pts * TAU, rr = 330 + 70 * noise1(i * 0.9, 3) + 40 * hash(i, 4) ;
      const px = hx + cos(a) * rr * 1.25, py = hy + sin(a) * rr * 0.92;
      if (i === pts) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const cg = ctx.createRadialGradient(hx, hy, 300, hx, hy, 900);
    cg.addColorStop(0, '#3a2a2a'); cg.addColorStop(0.3, '#1a1316'); cg.addColorStop(1, '#060508');
    ctx.fillStyle = cg; ctx.fill('evenodd');
    ctx.clip('evenodd');
    // coffers / rings (gilt, scorched)
    ctx.strokeStyle = 'rgba(190,150,80,0.35)'; ctx.lineWidth = 10;
    for (const rr of [470, 560, 680]) { ctx.beginPath(); ctx.ellipse(hx, hy, rr * 1.25, rr * 0.92, 0, 0, TAU); ctx.stroke(); }
    ctx.lineWidth = 4;
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; ctx.beginPath(); ctx.moveTo(hx + cos(a) * 470 * 1.25, hy + sin(a) * 470 * 0.92); ctx.lineTo(hx + cos(a) * 680 * 1.25, hy + sin(a) * 680 * 0.92); ctx.stroke(); }
    // light spill from the searchlight on the torn rim
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, lx, ly, 700, '#9fc8ff', 0.25, 'soft');
    ctx.restore();
    // jagged rim highlight + hanging lath
    ctx.save(); ctx.strokeStyle = 'rgba(255,190,120,0.45)'; ctx.lineWidth = 3; ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = i / pts * TAU, rr = 330 + 70 * noise1(i * 0.9, 3) + 40 * hash(i, 4);
      const px = hx + cos(a) * rr * 1.25, py = hy + sin(a) * rr * 0.92;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.restore();
    // embers + plaster dust in the light
    k.embers(ctx, S, { x: 0, y: 0, w: W, h: H, count: 40, seed: 3, color: C.fireHot, k: 0.8, rise: 90 });
    ctx.restore();
    // the band's heads at the bottom edge, looking up (Noodle's lamp beam up into the hole)
    const P = k.poses, an = {};
    const rim = { color: '#dff2ff', dir: -PI / 2, k: 1.4 }, rim2 = { color: C.fire, dir: PI / 2, k: 0.6 };
    const look = (w, extra) => Object.assign(P.lookUp(1), extra || {});
    an.granny = k.survivor(ctx, 'granny', look('granny', { use: 'instrument' }), { x: 250, y: 1080, s: 1.45, face: 1, rim, rim2, lit: 0.2, t: S.t, prop: 'guitar' });
    an.tiny = k.survivor(ctx, 'tiny', look('tiny', { nsh: 0.5 }), { x: 520, y: 1180, s: 1.25, face: 1, rim, rim2, lit: 0.2, t: S.t, kitOnBack: true });
    an.vex = k.survivor(ctx, 'vex', Object.assign(P.point(1), P.lookUp(1), { nsh: 2.6, nel: 0.1 }), { x: 860, y: 1100, s: 1.35, face: -1, rim, rim2, lit: 0.2, t: S.t });
    an.noodle = k.survivor(ctx, 'noodle', look('noodle', { expr: 'scared', mouth: 0.8 }), { x: 1120, y: 1060, s: 1.4, face: -1, rim, rim2, lit: 0.2, t: S.t });
    if (an.noodle && an.noodle.lamp) { const L = an.noodle.lamp; k.beam(ctx, L[0], L[1], -PI / 2 - 0.35, 0.12, 700, C.lamp, 0.6, { motes: 12, t: S.t, seed: 2 }); }
    S.post.bloom = 1.0;
    return an;
  };

  // ---- 364-366: the fire escape (ENCORE slate top-left; EVERYBODY UP!)
  D.stairs = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 364;
    const rise = lb * 260;                 // camera climbs
    const c = { x: 760, y: 420 - rise, z: 0.92 * punch(S, 0.02), rot: 0.06 };
    // sky behind the building edge (right)
    nightSky(ctx, S, { clouds: 0.5, glow: 0.5 });
    ctx.save(); camApply(ctx, c);
    // the Orpheum's side wall (brick), lit orange from the street below and cold from the searchlight above
    k.brickWall(ctx, 200, -1400, 900, 2400, { seed: 21, color: '#3a1e1a', grime: 0.7, damp: 0.4, scorch: 0.4,
      lights: [{ x: 700, y: 900, r: 900, color: '#ff7a3a', k: 0.5 }, { x: 900, y: -900, r: 700, color: '#a8d0ff', k: 0.35 }] });
    // building edge shadow + the roof line glowing with the searchlight
    const g = ctx.createLinearGradient(1000, 0, 1100, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(1000, -1400, 100, 2400);
    ctx.fillStyle = '#07070b'; ctx.fillRect(180, -1420, 940, 40);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 700, -1400, 600, '#cfeaff', 0.5, 'soft'); ctx.restore();
    // the zigzag fire escape: landings every 300 units, stairs between
    const land = [];
    for (let i = 0; i < 8; i++) land.push(800 - i * 300);
    ctx.lineCap = 'round';
    for (let i = 0; i < land.length; i++) {
      const y = land[i], x0 = 380, x1 = 980;
      ctx.fillStyle = '#0a0a0e'; ctx.fillRect(x0, y, x1 - x0, 12);
      ctx.strokeStyle = '#0a0a0e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x0, y - 70); ctx.lineTo(x1, y - 70);
      for (let x = x0; x <= x1; x += 30) { ctx.moveTo(x, y); ctx.lineTo(x, y - 70); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,170,110,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y + 12); ctx.lineTo(x1, y + 12); ctx.stroke();
      // stairs up to the next landing (alternating direction)
      if (i < land.length - 1) {
        const dir = i % 2 ? 1 : -1, sxA = dir > 0 ? 420 : 940, sxB = dir > 0 ? 760 : 600;
        ctx.strokeStyle = '#0b0b10'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(sxA, y); ctx.lineTo(sxB, y - 300); ctx.stroke();
        ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sxA, y - 70); ctx.lineTo(sxB, y - 370); ctx.stroke();
        ctx.lineWidth = 5;
        for (let s2 = 1; s2 < 12; s2++) { const u = s2 / 12; ctx.beginPath(); ctx.moveTo(lerp(sxA, sxB, u) - 18, lerp(y, y - 300, u)); ctx.lineTo(lerp(sxA, sxB, u) + 18, lerp(y, y - 300, u)); ctx.stroke(); }
      }
    }
    // the band running up: positions along the zigzag as a function of time (each on a different flight)
    const an = {}, P = k.poses;
    const rim = { color: '#cfeaff', dir: -PI / 2 - 0.5, k: 1.2 }, rim2 = { color: '#ff8a4a', dir: PI / 2, k: 0.9 };
    const runner = (who, idx, lag, s) => {
      const pos = (lb * 1.6 + 2.2 - lag);       // flights climbed
      const i = floor(pos), u = fract(pos);
      const dir = i % 2 ? 1 : -1, sxA = dir > 0 ? 420 : 940, sxB = dir > 0 ? 760 : 600;
      const y0 = 800 - i * 300;
      const x = lerp(sxA, sxB, u), y = lerp(y0, y0 - 300, u);
      const pose = Object.assign(P.run(t * 2.6 + idx * 0.3), { torso: 0.35, head: -0.25 });
      if (who === 'granny') Object.assign(pose, { use: 'instrument' });
      return k.survivor(ctx, who, pose, { x, y, s, face: dir, rim, rim2, lit: 0.3, t, kitOnBack: who === 'tiny', prop: who === 'granny' ? 'guitar' : who === 'vex' ? 'megaphone' : who === 'noodle' ? 'bass' : undefined });
    };
    an.vex = runner('vex', 0, 0, 0.55);
    an.granny = runner('granny', 1, 0.45, 0.55);
    an.noodle = runner('noodle', 2, 0.9, 0.55);
    an.tiny = runner('tiny', 3, 1.4, 0.55);
    ctx.restore();
    k.speedLines(ctx, S, { cx: 700, cy: -200, k: 0.12, color: '#cfeaff', count: 40, inner: 500, outer: 1400 });
    S.post.bloom = 0.8;
    return an;
  };

  // ---- the Orpheum roof, seen from roof level (shared by hatch and wide)
  function roof(ctx, S, o) {
    const k = K(), t = S.t;
    const hy = o.horizon;
    // far skyline layers
    k.skyline(ctx, S, { seed: 3, y: hy - 10, depth: 0.1, windows: 0.5, height: 0.9, scroll: o.scroll || 0 });
    k.skyline(ctx, S, { seed: 8, y: hy + 6, depth: 0.45, windows: 0.65, height: 0.7, scroll: (o.scroll || 0) * 1.5 });
    // city fire-glow haze at the horizon
    const hg = ctx.createLinearGradient(0, hy - 140, 0, hy + 20);
    hg.addColorStop(0, 'rgba(120,50,40,0)'); hg.addColorStop(1, 'rgba(160,70,50,0.35)');
    ctx.fillStyle = hg; ctx.fillRect(0, hy - 140, W, 160);
    // roof surface (tar + gravel), parapet line at the horizon
    const rg = ctx.createLinearGradient(0, hy, 0, H);
    rg.addColorStop(0, '#1b1620'); rg.addColorStop(0.4, '#100d14'); rg.addColorStop(1, '#060508');
    ctx.fillStyle = rg; ctx.fillRect(0, hy, W, H - hy);
    ctx.fillStyle = '#0b0a10'; ctx.fillRect(0, hy - 14, W, 16);
    ctx.fillStyle = 'rgba(255,150,100,0.25)'; ctx.fillRect(0, hy - 14, W, 2);
    // gravel speckle
    ctx.fillStyle = 'rgba(160,140,150,0.12)';
    for (let i = 0; i < 140; i++) { const u = hash(i, 91), v = pow(hash(i, 92), 0.7); const y = hy + v * (H - hy); ctx.fillRect(u * W, y, 1 + v * 3, 1 + v * 2); }
  }
  // a smoking, glowing hole in the roof (the solo blew it out); x, y centre, w wide (ellipse in perspective)
  function roofHole(ctx, S, x, y, w, o) {
    const k = K(), t = S.t;
    o = o || {};
    ctx.save();
    ctx.beginPath();
    const n = 26;
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU, rr = 1 + 0.22 * noise1(i * 1.3, 8) + 0.1 * hash(i, 9);
      const px = x + cos(a) * w / 2 * rr, py = y + sin(a) * w * 0.16 * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    const fl = 0.8 + 0.2 * noise1(t * 6, 3);
    const g = ctx.createRadialGradient(x, y, 4, x, y, w * 0.6);
    g.addColorStop(0, css('#ffcf7a', 0.95 * fl)); g.addColorStop(0.35, css('#ff6a20', 0.9)); g.addColorStop(1, '#2a0a06');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#0a0708'; ctx.lineWidth = 6; ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y - w * 0.05, w * 0.9, '#ff6a20', 0.45 * fl, 'soft');
    ctx.restore();
    k.smoke(ctx, S, { x: x - w * 0.3, y: y - 10, w: w * 0.6, rate: 4, life: 3.5, rise: 120, size: w * 0.18, grow: 2.2, color: '#2a2026', k: 0.7, wind: (o.wind || 60), seed: 5, lit: '#ff7a3a' });
    k.embers(ctx, S, { x: x - w * 0.5, y: y - 420, w: w, h: 430, count: 26, seed: 6, color: C.fireHot, k: 0.9, rise: 120, swirl: 30 });
  }

  // ---- 366-368: onto the roof, into the downdraft
  D.hatch = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 366;
    nightSky(ctx, S, { clouds: 0.6, glow: 0.8 });
    const c = { x: W / 2, y: H / 2, z: (1.05 - 0.05 * lb) * punch(S, 0.02), rot: -0.03, dx: 0, dy: 0 };
    ctx.save(); camApply(ctx, c);
    roof(ctx, S, { horizon: 470 });
    roofHole(ctx, S, 1060, 600, 360, { wind: -80 });
    // the bulkhead + hatch door (left), door blown open
    ctx.fillStyle = '#0d0b10'; ctx.fillRect(110, 300, 260, 300);
    ctx.fillStyle = '#16121a'; ctx.beginPath(); ctx.moveTo(100, 300); ctx.lineTo(380, 300); ctx.lineTo(360, 280); ctx.lineTo(120, 280); ctx.fill();
    ctx.fillStyle = '#ffb070'; ctx.fillRect(190, 400, 110, 200);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 245, 520, 220, '#ff7a3a', 0.5); ctx.restore();
    ctx.save(); ctx.translate(190, 400); ctx.transform(1, 0.25, 0, 1, 0, 0); ctx.fillStyle = '#2a1416'; ctx.fillRect(-90, 0, 90, 200); ctx.restore();
    // the band bursting out: Vex striding, Granny, Noodle ducking, Tiny squeezing through the door with the kit
    const an = {}, P = k.poses;
    const rim = { color: '#e8f6ff', dir: -PI / 2 + 0.3, k: 1.35 }, rim2 = { color: C.fire, dir: 0.2, k: 0.8 };
    const wind = { wind: 0.95, flap: S.beat * 2 };
    an.vex = k.survivor(ctx, 'vex', Object.assign(P.point(1), P.lookUp(0.6), wind, { nsh: 2.4 }), { x: 640 + 30 * lb, y: 640, s: 0.95, face: 1, rim, rim2, lit: 0.35, t });
    an.granny = k.survivor(ctx, 'granny', Object.assign(P.walk(S.beat * 0.5), P.lookUp(0.4), { use: 'instrument' }, wind), { x: 470 + 20 * lb, y: 650, s: 0.95, face: 1, rim, rim2, lit: 0.35, t, prop: 'guitar' });
    an.noodle = k.survivor(ctx, 'noodle', Object.assign(P.crouch(0.4), P.lookUp(0.9), { expr: 'scared', mouth: 0.9 }, wind), { x: 860, y: 660, s: 0.95, face: -1, rim, rim2, lit: 0.35, t });
    an.tiny = k.survivor(ctx, 'tiny', Object.assign(P.walk(S.beat * 0.5), { torso: 0.2 }, wind), { x: 260, y: 640, s: 0.95, face: 1, rim, rim2, lit: 0.35, t, kitOnBack: true });
    ctx.restore();
    // the downdraft: the searchlight from above + whirling debris
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    k.beam(ctx, 760 + 80 * sin(t * 0.7), -120, PI / 2 + 0.08, 0.3, 980, '#e8f6ff', 0.55, { motes: 40, t, seed: 8 });
    ctx.restore();
    k.debris(ctx, S, { x: 640, y: 520, t0: bt(366), seed: 12, count: 40, kind: 'paper', spread: PI, angle: 0, speed: 420, gravity: -40, s: 1, life: 2.5 });
    k.speedLines(ctx, S, { cx: 640, cy: -300, k: 0.1, color: '#ffffff', count: 30, inner: 700, outer: 1600 });
    S.post.bloom = 0.8; S.post.shake = 3 * (0.5 + 0.5 * sin(t * 30));
    return an;
  };

  // ---- 368-372: the chopper over the Orpheum roof; the band grabs the ladder (KEEP THEM DANCING)
  D.wide = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 368;
    nightSky(ctx, S, { clouds: 0.6, glow: 0.9, moon: { x: 1080, y: 110, r: 46, k: 0.8 } });
    const c = { x: W / 2, y: H / 2 + 20 - lb * 6, z: (1.0 + 0.012 * lb) * punch(S), rot: 0 };
    ctx.save(); camApply(ctx, c);
    roof(ctx, S, { horizon: 500, scroll: lb * 4 });
    // the ORPHEUM blade sign at the roof's front corner (left)
    k.neonBlade(ctx, S, 120, 520, 1.5, 0.9, { text: 'ORPHEUM', dead: [2, 5] });
    roofHole(ctx, S, 1010, 610, 380, { wind: -70 });
    // the chopper hovering, ladder down to the roof
    const lift = 0;
    const co = { x: 600 + 14 * sin(t * 0.9), y: 250 + 8 * sin(t * 1.4) - lift, s: 0.62, face: 1, tilt: -0.04 + 0.02 * sin(t * 0.8), lit: 0.42 };
    const L = ladder(S, co.x, co.y, 360, { w: 22, rung: 16, sway: 0.5 });
    chopper(ctx, S, co);
    // searchlight onto the band
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lp = chPt(co, CH.light);
    k.beam(ctx, lp[0], lp[1], atan2(620 - lp[1], 600 - lp[0]), 0.22, 520, '#e8f6ff', 0.6, { motes: 26, t, seed: 3 });
    ctx.save(); ctx.translate(600, 620); ctx.scale(1, 0.25); glow(ctx, 0, 0, 220, '#dff2ff', 0.4); ctx.restore();
    ctx.restore();
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 0.4, { gaps: { tiny: 30, granny: 230, vex: 420, noodle: 560 }, draw: ['tiny', 'granny'] });
    // Vex and Noodle still on the roof: Vex waving to the street, Noodle hugging the bottom rung
    const P = k.poses, rim = { color: '#e8f6ff', dir: -PI / 2, k: 1.2 }, rim2 = { color: C.fire, dir: 0.3, k: 0.9 };
    an.vex = k.survivor(ctx, 'vex', Object.assign(P.wave(S.beat * 0.5), { wind: 0.7, flap: S.beat }), { x: 520, y: 640, s: 0.42, face: -1, rim, rim2, lit: 0.35, t });
    const bp = L.at(330);
    an.noodle = k.survivor(ctx, 'noodle', Object.assign(P.hang(S.beat * 0.25), { expr: 'scared' }), { x: bp[0], y: bp[1], s: 0.4, face: 1, pin: 'hands', rim, rim2, lit: 0.35, t });
    ctx.restore();
    S.post.bloom = 0.8;
    return an;
  };

  // ---- 372-380: the clue. The chopper's flank with Lou's mark, big and steady; the ladder with the band
  D.flank = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 372;
    nightSky(ctx, S, { clouds: 0.7, glow: 0.6, moon: { x: 1120, y: 90, r: 40, k: 0.7 } });
    // skyline far below (we are in the air beside the chopper)
    k.skyline(ctx, S, { seed: 5, y: 720, depth: 0.2, windows: 0.7, height: 0.8 });
    k.skyline(ctx, S, { seed: 9, y: 760, depth: 0.55, windows: 0.7, height: 0.8 });
    // fireworks behind (375): outside the clue rect
    fireworks(ctx, S, (i) => (i === 0 ? [1120, 520, 150, 0.9] : null));
    // camera: settle by 373.5 (bar 93.5), hold still through 379, then drift down toward Granny
    const settle = E.outCubic(clamp(lb / 1.6));
    const after = E.inOutCubic(clamp((S.beat - 379) / 1.0));
    const c = { x: lerp(680, 640, settle), y: lerp(380, 360, settle) + 40 * after, z: lerp(0.96, 1.0, settle) + 0.06 * after, rot: 0 };
    ctx.save(); camApply(ctx, c);
    const co = { x: 470, y: 330, s: 1.32, face: 1, tilt: -0.02, lit: 0.62, markGlow: 0.2 };
    // tiny drift that stays well under 40 units/s
    co.x += 4 * sin(t * 0.9); co.y += 3 * sin(t * 1.3);
    chopper(ctx, S, co);
    const L = ladder(S, co.x, co.y, 520, { w: 30, rung: 20, sway: 0.35 });
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 0.42, { gaps: { tiny: 30, granny: 230, vex: 420, noodle: 590 } });
    ctx.restore();
    // a soft key light on the flank from the searchlight's bounce (keeps the mark readable)
    S.post.bloom = 0.7;
    return Object.assign(an, { _cam: c, _co: co });
  };

  // ---- 380-384: Granny one-handed solo, Tiny above drumming on the kit strapped to his back
  D.solo = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 380;
    nightSky(ctx, S, { clouds: 0.6, glow: 0.7 });
    k.skyline(ctx, S, { seed: 5, y: 760 + lb * 6, depth: 0.25, windows: 0.7, height: 0.8 });
    fireworks(ctx, S, (i) => (i === 1 ? [300, 260, 190] : null));
    const c = { x: 640, y: 360 - lb * 8, z: 1.0 * punch(S), rot: 0.04 };
    ctx.save(); camApply(ctx, c);
    const L = ladder(S, 700, -260, 1200, { w: 58, rung: 40, sway: 0.6 });
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 1.0, { gaps: { tiny: 40, granny: 560, vex: 1060, noodle: 1500 }, draw: ['tiny', 'granny'] });
    ctx.restore();
    S.post.bloom = 0.8;
    return an;
  };

  // ---- 384-386: IF THE MUSIC... the band strung along the ladder, side-on; the chopper above
  D.ladder = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 384;
    nightSky(ctx, S, { clouds: 0.55, glow: 0.9 });
    k.skyline(ctx, S, { seed: 2, y: 860, depth: 0.3, windows: 0.8, height: 1 });
    const c = { x: 640, y: 380, z: (0.95 + 0.02 * lb) * punch(S), rot: -0.05 };
    ctx.save(); camApply(ctx, c);
    const co = { x: 520, y: 130, s: 0.5, face: 1, tilt: -0.05, lit: 0.35 };
    chopper(ctx, S, co);
    const L = ladder(S, co.x, co.y, 700, { w: 26, rung: 18, sway: 0.8 });
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 0.46, {});
    ctx.restore();
    S.post.bloom = 0.8;
    return an;
  };

  // ---- 386-392: STOPS. Looking down past Noodle: the whole street freezes and looks up; then resumes
  D.freeze = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 386;
    const fz = S.beat >= 386.5 && S.beat < 387.5 ? 1 : 0;
    ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H);
    const st = { vx: 560, vy: -260, f: 900, h: 60, halfW: 14, zNear: 40, zFar: 520, count: 520, seed: 21, figS: 1.7 };
    const c = { x: W / 2, y: H / 2, z: 1 + 0.02 * lb, rot: 0.05 };
    ctx.save(); camApply(ctx, c);
    crowdStreet(ctx, S, Object.assign(st, { freeze: fz, freezeAt: bt(386.5), lookAt: [600, -3000], t: fz ? bt(386.5) : t }));
    // firework light (391) washes over the crowd
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    fireworks(ctx, S, (i) => (i === 2 ? [380, 120, 200] : null));
    ctx.restore();
    ctx.restore();
    // Noodle in the foreground (right), clinging to the bottom of the ladder, looking down then at us
    const L = ladder(S, 1060, -120, 600, { w: 60, rung: 44, sway: 0.4 });
    drawLadder(ctx, L);
    const P = k.poses;
    const an = {};
    an.noodle = k.survivor(ctx, 'noodle', Object.assign(P.hang(S.beat * 0.25), { expr: 'scared', head: 0.5, mouth: fz ? 0.2 : 0.7 }), {
      x: L.at(380)[0], y: L.at(380)[1], s: 1.05, face: -1, pin: 'hands', rim: { color: '#dff2ff', dir: -PI / 2, k: 1.2 }, rim2: { color: C.uv, dir: PI / 2, k: 0.6 }, lit: 0.3, t });
    S.post.bloom = 0.9; S.post.vignette = 0.65;
    return an;
  };

  // ---- 392-396: Tiny climbing with the whole kit on his back, still drumming
  D.tiny = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 392;
    nightSky(ctx, S, { clouds: 0.6, glow: 0.8 });
    k.skyline(ctx, S, { seed: 13, y: 900 + lb * 10, depth: 0.3, windows: 0.8, height: 1.1 });
    const c = { x: 640, y: 380, z: punch(S, 0.03), rot: -0.06 };
    ctx.save(); camApply(ctx, c);
    const L = ladder(S, 560, -300, 1300, { w: 66, rung: 46, sway: 0.5 });
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 1.15, { gaps: { tiny: 300, granny: -200, vex: 1100, noodle: 1500 }, draw: ['tiny'] });
    ctx.restore();
    S.post.bloom = 0.8;
    return an;
  };

  // ---- 396-400: Vex last, waving to the street like royalty; fireworks 398/399 behind him
  D.vex = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 396;
    nightSky(ctx, S, { clouds: 0.6, glow: 0.8 });
    fireworks(ctx, S, (i) => (i === 3 ? [330, 230, 220] : i === 4 ? [1000, 180, 200] : null));
    k.skyline(ctx, S, { seed: 17, y: 940, depth: 0.3, windows: 0.8, height: 1.1 });
    const c = { x: 640, y: 380, z: punch(S, 0.025), rot: 0.04 };
    ctx.save(); camApply(ctx, c);
    const L = ladder(S, 640, -400, 1300, { w: 60, rung: 42, sway: 0.5 });
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 1.0, { gaps: { tiny: -900, granny: -500, vex: 520, noodle: 940 }, draw: ['vex', 'noodle'] });
    ctx.restore();
    S.post.bloom = 0.9;
    return an;
  };

  // ---- call 1 / call 2: Vex with the megaphone; response 1 / 2: the crowd
  D.call1 = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 400;
    nightSky(ctx, S, { clouds: 0.6, glow: 0.6 });
    const c = { x: 640, y: 360, z: (1 + 0.02 * lb) * punch(S, 0.03), rot: 0.05 };
    ctx.save(); camApply(ctx, c);
    const co = { x: 760, y: -40, s: 0.85, face: -1, tilt: 0.05, lit: 0.3 };
    chopper(ctx, S, co);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, chPt(co, CH.light)[0], chPt(co, CH.light)[1], 300, '#dff2ff', 0.6); ctx.restore();
    const L = ladder(S, co.x, co.y, 900, { w: 44, rung: 30, sway: 0.5 });
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 0.75, { mode: 'call', gaps: { tiny: 60, granny: 330, vex: 620, noodle: 980 }, draw: ['granny', 'vex'] });
    ctx.restore();
    S.post.bloom = 0.9;
    return an;
  };
  D.call2 = D.call1;
  D.resp1 = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 404;
    ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H);
    const st = { vx: 640, vy: -200, f: 900, h: 50, halfW: 15, zNear: 34, zFar: 420, count: 540, seed: 31, figS: 1.8, sync: 1 };
    const c = { x: W / 2, y: H / 2, z: punch(S, 0.04), rot: 0 };
    ctx.save(); camApply(ctx, c);
    crowdStreet(ctx, S, st);
    ctx.restore();
    S.post.bloom = 1;
    return {};
  };
  D.resp2 = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 412;
    nightSky(ctx, S, { h: 260, clouds: 0.5, glow: 1 });
    const st = { vx: 640, vy: 200, f: 700, h: 90, halfW: 14, zNear: 60, zFar: 1400, count: 700, seed: 41, figS: 2, sync: 1 };
    const c = { x: W / 2, y: H / 2, z: punch(S, 0.03), rot: 0 };
    ctx.save(); camApply(ctx, c);
    crowdStreet(ctx, S, st);
    ctx.restore();
    S.post.bloom = 1;
    return {};
  };

  // ---- 416-420: the chopper climbs away over the city; GOOD NIGHT!
  D.away = function (ctx, S, q) {
    const k = K(), t = S.t, lb = S.beat - 416;
    nightSky(ctx, S, { clouds: 0.6, glow: 1 });
    k.skyline(ctx, S, { seed: 4, y: 700, depth: 0.2, windows: 0.8, height: 0.9 });
    k.skyline(ctx, S, { seed: 6, y: 760, depth: 0.6, windows: 0.8, height: 0.9 });
    const c = { x: 640, y: 360, z: punch(S, 0.02), rot: 0 };
    ctx.save(); camApply(ctx, c);
    const co = { x: 760, y: 320 - lb * 20, s: 0.48, face: 1, tilt: -0.08, lit: 0.35 };
    chopper(ctx, S, co);
    const L = ladder(S, co.x, co.y, 420, { w: 20, rung: 14, sway: 0.7 });
    drawLadder(ctx, L);
    const an = bandOnLadder(ctx, S, L, 0.26, { gaps: { tiny: 40, granny: 470, vex: 860, noodle: 1270 } });
    ctx.restore();
    S.post.shake = 4 * sstep(416, 420, S.beat) * abs(sin(t * 40));
    S.post.bloom = 0.9;
    return an;
  };

  // ---- 420+: the freeze-frame poster (the logo is the hit)
  D.poster = function (ctx, S, q) {
    const k = K(), t = S.t;
    const age = max(0, S.t - bt(420));
    // paper
    ctx.fillStyle = '#efe3c4'; ctx.fillRect(0, 0, W, H);
    const z = 1.06 - 0.06 * E.outCubic(clamp(age / 0.18)) + 0.012 * age;
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    // red sunburst
    ctx.save(); ctx.translate(640, 250); ctx.fillStyle = '#c8202a';
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cos(a - 0.07) * 1600, sin(a - 0.07) * 1600); ctx.lineTo(cos(a + 0.07) * 1600, sin(a + 0.07) * 1600); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    k.halftone(ctx, 0, 0, W, H, { color: '#7a0f16', k: 0.5, size: 12, mode: 'radial', cx: 0.5, cy: 0.35, min: 0.02, max: 0.5 });
    // city skyline + a sea of fists (black)
    k.skyline(ctx, S, { seed: 4, y: 640, depth: 1, windows: 0, height: 0.8, color: '#0a0606' });
    ctx.fillStyle = '#0a0606'; ctx.fillRect(0, 630, W, 90);
    for (let i = 0; i < 70; i++) {
      const x = i / 70 * W + hash(i, 3) * 18, y = 640 + hash(i, 4) * 40;
      ctx.fillRect(x - 3, y - 50, 7, 50); ctx.beginPath(); ctx.arc(x, y - 52, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = C.uv; ctx.fillRect(x - 4, y - 36, 9, 4); ctx.fillStyle = '#0a0606';
    }
    // the chopper + ladder + band in black silhouette with accent colours
    const co = { x: 520, y: 210, s: 0.6, face: 1, tilt: -0.08, lit: 0, rimTop: '#efe3c4', rimBot: '#efe3c4', rimK: 0.4, rimBotK: 0.2, rot: 0.6 };
    chopper(ctx, { t: bt(420) }, co);
    const SF = Object.assign({}, S, { t: bt(420), beat: 420 });
    const L = ladder(SF, co.x, co.y, 420, { w: 22, rung: 15, sway: 0.4 });
    drawLadder(ctx, L, { color: '#0a0606', rim: 'rgba(0,0,0,0)' });
    bandOnLadder(ctx, SF, L, 0.3, { lit: 0, rim: { color: '#efe3c4', dir: -PI / 2, k: 0.8 }, rim2: { color: '#efe3c4', dir: 0, k: 0.3 } });
    ctx.restore();
    // logo
    if (NS.overlay && NS.overlay.logo) NS.overlay.logo(ctx, 640, 560, 1000, 1);
    // paper grain + border
    ctx.strokeStyle = '#0a0606'; ctx.lineWidth = 18; ctx.strokeRect(9, 9, W - 18, H - 18);
    S.post.bloom = 0.3; S.post.grain = 0.5; S.post.vignette = 0.35;
    // the hit: a warm flash at 420
    const fk = pulse(age, 8);
    if (S.t >= bt(420) && fk > 0.02) S.post.flash = [1, 0.9, 0.75, 0.4 * fk];
    return {};
  };

  // ================================================================================================ registration
  const ANCH = { vex: 'VEX', granny: 'GRANNY', tiny: 'TINY', noodle: 'NOODLE' };
  // the clue rect: Lou's mark + 1313 on the flank, in frame units during the flank shot
  const CLUE_RECT = [300, 110, 600, 300];
  NS.clue('chopper', { shot: 'rooftop', rect: CLUE_RECT });

  function layoutFor(id) {
    switch (id) {
      case 'hit': return { lyricZone: 'top', keepOut: [] };
      case 'hole': return { lyricZone: 'top', keepOut: [] };
      case 'stairs': return { lyricZone: 'top', keepOut: [[300, 260, 700, 460]] };
      case 'hatch': return { lyricZone: 'top', keepOut: [[150, 320, 900, 400]] };
      case 'wide': return { lyricZone: 'bottom', keepOut: [[250, 60, 760, 600]] };
      case 'flank': return { lyricZone: 'bottom', keepOut: [[300, 300, 360, 420]] };
      case 'solo': return { lyricZone: 'top', keepOut: [] };
      case 'ladder': return { lyricZone: 'top', keepOut: [] };
      case 'freeze': return { lyricZone: 'top', keepOut: [[820, 160, 460, 560]] };
      case 'tiny': return { lyricZone: 'top', keepOut: [] };
      case 'vex': return { lyricZone: 'top', keepOut: [] };
      case 'call1': case 'call2': return { lyricZone: 'bottom', keepOut: [] };
      case 'resp1': case 'resp2': return { lyricZone: 'top', keepOut: [] };
      case 'away': return { lyricZone: 'top', keepOut: [] };
      default: return { lyricZone: 'top', keepOut: [] };
    }
  }

  let warmed = false;
  NS.shot('rooftop', {
    init(env) {},
    warm(env) {
      if (warmed) return;
      warmed = true;
      try {
        K().horde.warm(['headbang'], { light: { color: C.zombieRim, dir: -PI / 2 } });
        K().horde.warm(['headbang'], { light: { color: C.zombieRim, dir: -PI / 2 }, look: true });
        if (K().worldWarm) K().worldWarm(['stage', 'sky', 'fx']);
      } catch (e) { /* the kit builds lazily anyway */ }
    },
    release() { warmed = false; },
    layout(S) { return layoutFor(shotAt(S).id); },
    draw(ctx, S) {
      const sh = shotAt(S);
      const q = { lb: S.beat - sh.b0, k: clamp((S.beat - sh.b0) / (sh.b1 - sh.b0)) };
      ctx.save();
      const an = D[sh.id](ctx, S, q) || {};
      ctx.restore();
      for (const w in ANCH) if (an[w] && an[w].head) S.anchor(ANCH[w], an[w].head[0], an[w].head[1]);
    },
  });
})();
