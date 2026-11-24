// NO SURVIVORS: shot "blackout" (bars 72-74, beats 288-296). Silence: the moment the illusion slips.
//   288-293  the house from upstage, black; 289 Noodle "Who unplugged the-" (subtitle); 290 / 291 two flashlight
//            clicks: Granny's torch and Noodle's headlamp snap on and sweep a pit of ORDINARY people (style 'human'),
//            standing still, staring; 292.5 (groan "one...", hit phonesUp) hundreds of phones light up, filming.
//   293-295  the wings: a dressing-room mirror ringed with dead bulbs; the band in front, backs to the glass; Noodle
//            glances back, his lamp finds the glass: four charred skeletons in the band's exact silhouettes (clue
//            "mirror", hold 293.5-295.0); 294.25 the 1987 flashback flares orange behind them.
//   295-296  "more...": the lamp jerks away; the front rows snap their heads to the stage and stare into the lens.
(function () {
  'use strict';
  const NS = window.NS;
  if (!NS) return;
  const { clamp, lerp, smoothstep: sstep } = NS;
  const TAU = Math.PI * 2, PI = Math.PI;
  const K = () => NS.kit;
  const C = NS.C;

  // ---- timing (global beats) --------------------------------------------------------------------------------
  const B_CLICK1 = 290, B_CLICK2 = 291, B_PHONES = 292.5, B_MIRROR = 293, B_HOLD0 = 293.5, B_FLASH = 294.25, B_MORE = 295;

  // ---- the mirror (frame units) -----------------------------------------------------------------------------
  const MIR = { x: 286, y: 70, w: 708, h: 560, glassPad: 34 };
  const GLASS = { x: MIR.x + MIR.glassPad, y: MIR.y + MIR.glassPad, w: MIR.w - MIR.glassPad * 2, h: MIR.h - MIR.glassPad * 2 };
  const CLUE_RECT = [312, 96, 656, 372];
  NS.clue('mirror', { shot: 'blackout', rect: CLUE_RECT });

  // the band's order, left to right (skeletons in the glass sit straight above their owners)
  const BAND = [
    { who: 'vex', x: 430, sk: 0.6, s: 1.02, y: 852 },
    { who: 'granny', x: 572, sk: 0.6, s: 1.02, y: 846 },
    { who: 'tiny', x: 728, sk: 0.6, s: 0.98, y: 900 },
    { who: 'noodle', x: 878, sk: 0.6, s: 1.02, y: 846 },
  ];
  const SK_FEET = 470;

  const LIGHT_H = { color: '#eef3ff', dir: -PI / 2 };   // horde light for the whole shot (constant: one atlas)

  // ---- caches -------------------------------------------------------------------------------------------------
  let CACHE = null;
  function mk(env, w, h) { return (env && env.makeCanvas ? env.makeCanvas(w, h, 'blackout') : NS.makeCanvas(w, h, 'blackout')); }
  function build(env) {
    if (CACHE) return CACHE;
    const cs = (env && env.cacheScale) || NS.cacheScale || 1;
    CACHE = { cs };
    CACHE.frame = buildMirrorFrame(env, cs);
    CACHE.wing = buildWing(env, cs);
    return CACHE;
  }
  function free() {
    if (!CACHE) return;
    for (const k in CACHE) if (CACHE[k] && CACHE[k].getContext) NS.freeCanvas(CACHE[k]);
    CACHE = null;
  }

  // the dressing-room mirror's frame with its ring of dead bulbs (transparent glass hole)
  function buildMirrorFrame(env, cs) {
    const R = 1.25 * cs, c = mk(env, (MIR.w + 40) * R, (MIR.h + 40) * R), g = c.getContext('2d');
    g.scale(R, R); g.translate(20, 20);
    const w = MIR.w, h = MIR.h, p = MIR.glassPad;
    // wooden frame
    const wg = g.createLinearGradient(0, 0, w, h);
    wg.addColorStop(0, '#2c2019'); wg.addColorStop(0.5, '#3a2a1f'); wg.addColorStop(1, '#1e1611');
    g.fillStyle = wg;
    g.beginPath(); g.rect(0, 0, w, h); g.rect(p, p, w - p * 2, h - p * 2); g.fill('evenodd');
    // bevel lines
    g.strokeStyle = 'rgba(255,220,180,0.10)'; g.lineWidth = 2; g.strokeRect(3, 3, w - 6, h - 6);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 4; g.strokeRect(p - 2, p - 2, w - p * 2 + 4, h - p * 2 + 4);
    // wood grain
    const r = NS.rng(73);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const top = r() < 0.5, y = top ? r() * p : h - r() * p;
      g.beginPath(); g.moveTo(r() * w, y); g.lineTo(r() * w, y + (r() - 0.5) * 3); g.stroke();
    }
    // chipped paint, scorch at the bottom corner
    const sg = g.createRadialGradient(w * 0.86, h, 0, w * 0.86, h, 160);
    sg.addColorStop(0, 'rgba(8,4,2,0.85)'); sg.addColorStop(1, 'rgba(8,4,2,0)');
    g.fillStyle = sg; g.fillRect(w * 0.6, h - 200, w * 0.4, 200);
    // bulbs (dead): along the top and down both sides
    const bulb = (bx, by) => {
      g.fillStyle = '#141110'; g.beginPath(); g.arc(bx, by, 13, 0, TAU); g.fill();
      const bg = g.createRadialGradient(bx - 4, by - 5, 1, bx, by, 11);
      bg.addColorStop(0, 'rgba(210,214,220,0.55)'); bg.addColorStop(0.5, 'rgba(90,92,100,0.5)'); bg.addColorStop(1, 'rgba(30,30,34,0.9)');
      g.fillStyle = bg; g.beginPath(); g.arc(bx, by, 10.5, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(60,50,40,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx - 3, by + 2); g.lineTo(bx - 1, by - 3); g.lineTo(bx + 1, by + 1); g.lineTo(bx + 3, by - 3); g.stroke();
    };
    const nTop = 9;
    for (let i = 0; i < nTop; i++) bulb(p * 0.5 + (w - p) * i / (nTop - 1), p * 0.5);
    for (let j = 1; j < 7; j++) { bulb(p * 0.5, p * 0.5 + (h - p) * j / 7); bulb(w - p * 0.5, p * 0.5 + (h - p) * j / 7); }
    // one broken socket
    g.fillStyle = '#0a0807'; g.beginPath(); g.arc(w - p * 0.5, p * 0.5 + (h - p) * 3 / 7, 11, 0, TAU); g.fill();
    // a photo tucked into the corner and a strip of gaffer tape
    g.save(); g.translate(p + 8, h - p - 8); g.rotate(-0.12);
    g.fillStyle = '#d8cdb0'; g.fillRect(0, -66, 52, 66); g.fillStyle = '#2a2622'; g.fillRect(5, -61, 42, 44);
    g.restore();
    g.fillStyle = 'rgba(190,186,170,0.75)'; g.save(); g.translate(w - 40, 22); g.rotate(0.5); g.fillRect(-26, -7, 52, 14); g.restore();
    return c;
  }

  // the wing behind the mirror: black flats, rope lines, a dead work light
  function buildWing(env, cs) {
    const R = 0.75 * cs, c = mk(env, 1280 * R, 720 * R), g = c.getContext('2d');
    g.scale(R, R);
    const bg = g.createLinearGradient(0, 0, 0, 720);
    bg.addColorStop(0, '#07080c'); bg.addColorStop(1, '#0d0e14');
    g.fillStyle = bg; g.fillRect(0, 0, 1280, 720);
    // painted brick back wall
    const r = NS.rng(274);
    for (let y = 0; y < 720; y += 26) {
      const off = ((y / 26) % 2) * 40;
      for (let x = -80 + off; x < 1280; x += 80) {
        const v = 12 + r() * 8;
        g.fillStyle = `rgb(${v},${v},${v + 4})`;
        g.fillRect(x + 2, y + 2, 76, 22);
      }
    }
    // rope lines from the fly rail at the left and right edges
    g.strokeStyle = 'rgba(120,100,80,0.35)'; g.lineWidth = 3;
    for (const rx of [70, 96, 120, 1160, 1186, 1212]) { g.beginPath(); g.moveTo(rx, 0); g.lineTo(rx + 2, 720); g.stroke(); }
    // sandbags
    for (const [sx, sy] of [[96, 420], [1186, 360]]) {
      g.fillStyle = '#2a2219'; g.beginPath(); g.ellipse(sx, sy, 22, 34, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,230,190,0.08)'; g.beginPath(); g.ellipse(sx - 6, sy - 8, 8, 16, 0, 0, TAU); g.fill();
    }
    return c;
  }

  // ---- crowd in the house shot -------------------------------------------------------------------------------
  function phonesK(B) { return 0.62 * sstep(B_PHONES, B_PHONES + 0.9, B); }

  // ---- shots --------------------------------------------------------------------------------------------------
  function drawHouse(ctx, S, B) {
    const kit = K(), t = S.t;
    const push = 1 + 0.07 * sstep(B_CLICK1, B_MIRROR, B);
    ctx.save();
    ctx.translate(640, 420); ctx.scale(push, push); ctx.translate(-640, -420);
    const info = kit.stageSet(ctx, S, { cam: 'drummer', pass: 'back', power: 0 });
    const area = { x0: -60, x1: 1340, yFar: 430, yNear: 600, sFar: 0.24, sNear: 0.56 };
    const res = kit.horde(ctx, S, { seed: 288, count: 420, area, mode: 'stand', style: 'human', lit: 0.5, light: LIGHT_H,
      rate: 0.1, sync: 0.15, phones: phonesK(B), density: 1.1 });
    kit.stageSet(ctx, S, { cam: 'drummer', pass: 'frame', power: 0 });

    // the band, from behind: Granny (torch) left, Noodle (headlamp) right
    const on1 = B >= B_CLICK1 ? 1 : 0, on2 = B >= B_CLICK2 ? 1 : 0;
    const tg1 = [lerp(300, 820, sstep(B_CLICK1, B_MIRROR + 0.4, B)), 500 + 20 * Math.sin(B * 0.9)];
    const tg2 = [lerp(1060, 560, sstep(B_CLICK2, B_MIRROR + 0.6, B)), 505 + 18 * Math.sin(B * 0.7 + 1)];
    const gp = Object.assign(kit.poses.point(1), { turn: 0.05, head: 0.05 });
    const go = { x: 210, y: 790, s: 1.08, face: 1, lit: 0, rim: { color: '#9fb4ff', dir: -PI / 2 - 0.4, k: 0.55 }, t, prop: 'flashlight', accent: 0.6 };
    const np = Object.assign(kit.poses.idle(t), { turn: 0.15, head: 0.15 });
    const no = { x: 1075, y: 800, s: 1.08, face: -1, lit: 0, rim: { color: '#9fb4ff', dir: -PI / 2 + 0.4, k: 0.55 }, t, lamp: on2, accent: 0.6 };
    const ga = kit.rig('granny', gp, go), na = kit.rig('noodle', np, no);
    const src1 = ga.flash || ga.hands[1], src2 = na.lamp || na.head;
    const ang1 = Math.atan2(tg1[1] - src1[1], tg1[0] - src1[0]), len1 = Math.hypot(tg1[0] - src1[0], tg1[1] - src1[1]) * 1.15;
    const ang2 = Math.atan2(tg2[1] - src2[1], tg2[0] - src2[0]), len2 = Math.hypot(tg2[0] - src2[0], tg2[1] - src2[1]) * 1.15;
    const flick = (b0) => (B < b0 ? 0 : B < b0 + 0.06 ? 0.6 : 1);
    const k1 = flick(B_CLICK1) * on1, k2 = flick(B_CLICK2) * on2;

    const lights = [];
    if (k1 > 0) lights.push({ type: 'cone', x: src1[0], y: src1[1], angle: ang1, spread: 0.2, len: len1 * 1.25, k: k1 });
    if (k2 > 0) lights.push({ type: 'cone', x: src2[0], y: src2[1], angle: ang2, spread: 0.22, len: len2 * 1.25, k: k2 });
    for (const p of res.phones) lights.push({ type: 'radial', x: p[0], y: p[1] - 12 * p[2], r: 70 * p[2] + 6, k: 0.55 });
    kit.darkness(ctx, 0.93, lights);

    // the lights that died with the power: filaments cooling at the top of frame
    const cool = Math.exp(-Math.max(0, S.t - NS.tb(72)) * 2.4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const fx = 140 + i * 167, fy = 26;
      kit.glow(ctx, fx, fy, 46, '#ff7a2a', 0.55 * cool, 'soft');
      kit.glow(ctx, fx, fy, 10, '#ffc27a', 0.9 * cool, 'hot');
    }
    // phone screens: small cold points, each lighting its owner's face from below
    for (const p of res.phones) {
      kit.glow(ctx, p[0], p[1], 7 * p[2] + 2.5, '#f4faff', 0.95, 'hot');
      kit.glow(ctx, p[0], p[1] - 22 * p[2], 34 * p[2] + 4, '#cfe4ff', 0.22, 'soft');
    }
    ctx.restore();

    kit.survivor(ctx, 'granny', gp, go);
    kit.survivor(ctx, 'noodle', np, no);
    if (k1 > 0) kit.beam(ctx, src1[0], src1[1], ang1, 0.2, len1, '#fff4dc', 0.55 * k1, { t, seed: 3, motes: 26 });
    if (k2 > 0) kit.beam(ctx, src2[0], src2[1], ang2, 0.22, len2, C.lamp, 0.5 * k2, { t, seed: 5, motes: 26 });
    ctx.restore();
  }

  function drawMirror(ctx, S, B) {
    const kit = K(), t = S.t, cc = build();
    ctx.drawImage(cc.wing, 0, 0, 1280, 720);
    // the glass: the reflected house behind the band (a sea of tiny phone lights), the skeletons
    const reveal = sstep(B_MIRROR + 0.25, B_HOLD0, B) * (B < B_MORE ? 1 : 0);
    ctx.save();
    ctx.beginPath(); ctx.rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h); ctx.clip();
    const gg = ctx.createLinearGradient(0, GLASS.y, 0, GLASS.y + GLASS.h);
    gg.addColorStop(0, '#05070c'); gg.addColorStop(1, '#0a0d16');
    ctx.fillStyle = gg; ctx.fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h);
    if (reveal > 0) {
      // reflected pit phones
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const r = NS.rng(2931);
      for (let i = 0; i < 140; i++) {
        const px = GLASS.x + r() * GLASS.w, py = GLASS.y + 250 + Math.pow(r(), 1.6) * 210, s = 0.4 + (py - GLASS.y - 250) / 210 * 0.6;
        kit.glow(ctx, px, py, 4 * s + 1.5, '#e6f2ff', 0.8 * reveal, 'hot');
      }
      ctx.restore();
      const fl = B >= B_FLASH && B < B_MORE ? sstep(B_FLASH, B_FLASH + 0.15, B) * (1 - 0.35 * sstep(B_FLASH + 0.3, B_MORE, B)) : 0;
      if (fl > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        kit.glow(ctx, 640, GLASS.y + GLASS.h, 520, C.fire, 0.75 * fl * S.flashK, 'soft');
        kit.glow(ctx, 640, GLASS.y + GLASS.h - 40, 300, C.fireHot, 0.4 * fl * S.flashK, 'soft');
        ctx.restore();
      }
      const sk = { style: 'skeleton', rim: { color: C.lamp, dir: -0.6, k: 1.1 }, rim2: { color: '#8fa6ff', dir: PI + 0.5, k: 0.5 }, lit: 0.3, t: 2, accent: 1, alpha: reveal };
      for (const m of BAND) {
        const P = Object.assign(kit.poses.idle(1 + m.x * 0.01), { turn: 0.88 });
        kit.survivor(ctx, m.who, P, Object.assign({ x: m.x, y: SK_FEET, s: m.sk, prop: 'none', lamp: 1 }, sk));
      }
    }
    ctx.restore();
    ctx.drawImage(cc.frame, MIR.x - 20, MIR.y - 20, MIR.w + 40, MIR.h + 40);

    // the real band in front, backs to the glass
    const look = sstep(B_MIRROR, B_MIRROR + 0.45, B) * (1 - sstep(B_MORE, B_MORE + 0.12, B));
    for (const m of BAND) {
      let P = Object.assign(kit.poses.idle(t + m.x), { turn: 0.85 });
      const o = { x: m.x, y: m.y, s: m.s, lit: 0.06, t, rim: { color: '#bcd4ff', dir: -PI / 2, k: 0.8 * (0.3 + reveal) }, rim2: { color: '#cfe4ff', dir: PI / 2, k: 0.35 }, accent: 0.7 };
      if (m.who === 'noodle') { P.hyaw = -1.9 * look; P.head = -0.1 * look; o.lamp = 1; }
      const a = kit.survivor(ctx, m.who, P, o);
      if (m.who === 'noodle' && a.lamp) {
        const gx = lerp(1040, 900, sstep(B_MIRROR, B_HOLD0, B)), gy = 440;
        const ang = Math.atan2(gy - a.lamp[1], gx - a.lamp[0]), len = Math.hypot(gx - a.lamp[0], gy - a.lamp[1]);
        if (look > 0.05) kit.beam(ctx, a.lamp[0], a.lamp[1], ang, 0.2, len, C.lamp, 0.45 * look, { t, seed: 9, motes: 14 });
      }
    }
  }

  function drawTurn(ctx, S, B) {
    const kit = K(), t = S.t;
    const info = kit.stageSet(ctx, S, { cam: 'drummer', pass: 'back', power: 0 });
    const snap = sstep(B_MORE, B_MORE + 0.35, B);
    const area = { x0: -60, x1: 1340, yFar: 300, yNear: 760, sFar: 0.35, sNear: 1.2 };
    const res = kit.horde(ctx, S, { seed: 295, count: 160, area, mode: 'stand', style: 'human', lit: 0.5, light: LIGHT_H, rate: 0.1,
      phones: 0.5, freeze: snap, freezeAt: NS.tb(0, B_MORE), lookAt: [640, 300] });
    const lights = [];
    for (const p of res.phones) lights.push({ type: 'radial', x: p[0], y: p[1] - 20 * p[2], r: 90 * p[2] + 6, k: 0.6 });
    kit.darkness(ctx, 0.9, lights);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of res.phones) kit.glow(ctx, p[0], p[1], 7 * p[2] + 2.5, '#f4faff', 0.95, 'hot');
    ctx.restore();
  }

  NS.shot('blackout', {
    init(env) {},
    warm(env) {
      build(env);
      const kit = K();
      if (kit && kit.horde) kit.horde.warm(['stand', 'phone'], { style: 'human', light: LIGHT_H, lit: 0.5 });
      if (kit && kit.worldWarm) kit.worldWarm(['house']);
    },
    release() { free(); },
    layout(S) {
      const B = S.beat;
      if (B >= B_MIRROR && B < B_MORE) return { lyricZone: 'bottom', keepOut: [] };
      return { lyricZone: 'top', keepOut: [] };
    },
    draw(ctx, S) {
      build();
      const B = S.beat;
      if (B < B_MIRROR) drawHouse(ctx, S, B);
      else if (B < B_MORE) drawMirror(ctx, S, B);
      else drawTurn(ctx, S, B);
      S.post.vignette = 0.75; S.post.grain = 0.45; S.post.bloom = 0.8;
    },
  });
})();
