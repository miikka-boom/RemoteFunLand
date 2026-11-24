// NO SURVIVORS: Keep Them Dancing. Shot "hordeWarn" (bars 32-36, the pre-chorus build).
//
// The intersection under a single streetlight. Bar 32.0 (the SOLD OUT stamp): the horde breaks over the rooftops,
// the far fence and the car roofs and pours toward the camera; the band stands back to back in the pool of light.
// Call and response HERE THEY COME! (bars 32, 33) gets camera punches; then tighter cuts every half bar into the
// chorus: the feet ("a thousand feet"), Tiny ("a single drum!"), Granny ("Gerald. Wake up." + she cocks him).
//
//   A  32.0-33.0  wide high: the horde breaks over roofs, fence and cars; band lower left; punches on the gang stabs
//   B  33.0-33.5  Vex close (left third), singing "Here they come," into the megaphone
//   B2 33.5-34.0  the four back to back, triple punch-in on HERE / THEY / COME!
//   C  34.0-34.5  ground level: a thousand feet pounding through the puddles toward the lens
//   D  34.5-35.0  Tiny winds up both bats and drums the car roof on "drum!"
//   E  35.0-36.0  Granny close: "Gerald. Wake up." She snaps Gerald shut; push-ins on the snare build
//
// This file also defines NS._hl, a small helper library shared with scenes/horde.js and scenes/dash.js (same author).
(function () {
  'use strict';
  const NS = window.NS;
  const C = NS.C;
  const { clamp, lerp, smoothstep: sst, fract, TAU } = NS;
  const PI = Math.PI;
  const E = NS.ease;

  // =============================================================================================== shared helpers
  const HL = (NS._hl = NS._hl || {});
  HL.dec = (x, tau) => (x >= 0 && x < 1e6 ? Math.exp(-x / tau) : 0);
  // the sub-shot at S.bar from [[bar, id], ...]; clamps outside the cue (transitions draw us outside it)
  HL.sub = (S, cuts, end) => {
    const b = S.bar;
    let i = 0;
    for (let j = 0; j < cuts.length; j++) if (b >= cuts[j][0] - 1e-9) i = j;
    const b0 = cuts[i][0], b1 = i + 1 < cuts.length ? cuts[i + 1][0] : end;
    return { id: cuts[i][1], i, b0, b1, lb: b - b0, lt: (b - b0) * NS.BAR, k: (b - b0) / (b1 - b0) };
  };
  // seconds since a global bar position (negative before it)
  HL.since = (S, bar) => S.t - bar * NS.BAR;
  // a stepped punch-in: each step adds amt, easing in over 0.05 s
  HL.punches = (S, bars, amt, ease) => {
    let z = 0;
    for (const b of bars) { const d = HL.since(S, b); if (d > 0) z += amt * E.outCubic(clamp(d / (ease || 0.05))); }
    return z;
  };
  // a beat-synced hit pulse: 1 at the hit, decaying
  HL.hitK = (S, lane, tau) => HL.dec(S[lane], tau || 0.12);
  HL.rimSodium = (x, y, lx, ly, k) => ({ color: C.sodium, dir: Math.atan2(ly - y, lx - x), k: k == null ? 1.25 : k });
  HL.rimMoon = (k, dir) => ({ color: '#7fa6ff', dir: dir == null ? -0.35 : dir, k: k == null ? 0.7 : k });
  // pink BLAM! + muzzle flash + smoke; since = seconds since the shot
  HL.blam = (ctx, S, x, y, ang, since, o) => {
    o = o || {};
    if (!(since >= -0.02 && since < 1.2)) return;
    const K = NS.kit, s = o.s || 1;
    const fk = clamp(1 - since / 0.11);
    if (fk > 0) K.muzzleFlash(ctx, x, y, ang, fk, o.seed || 1, { s: 1.1 * s, S });
    if (o.text !== false) {
      const tx = o.tx == null ? x + Math.cos(ang) * 170 * s : o.tx, ty = o.ty == null ? y + Math.sin(ang) * 170 * s - 40 * s : o.ty;
      K.onomatopoeia(ctx, o.word || 'BLAM!', tx, ty, { size: (o.size || 120) * s, color: C.granny, k: clamp(since / 0.8 + 0.001), rot: o.rot == null ? -0.12 : o.rot, seed: o.seed || 3, burstColor: '#fff3f8' });
    }
    if (since > 0) K.smoke(ctx, S, { x: x + Math.cos(ang) * 30 * s, y: y + Math.sin(ang) * 30 * s, w: 30 * s, t0: S.t - since, dur: 0.25, life: 1.1, size: 26 * s, rise: 50 * s, color: '#cfd3dc', k: 0.45, seed: o.seed || 5, rate: 30 });
  };
  // a zombie bonked into the air: ballistic arc, spinning, speed streaks; returns its centre
  HL.flyer = (ctx, S, o) => {
    const K = NS.kit, age = o.age;
    if (!(age >= 0 && age < (o.life || 1.4))) return null;
    const g = o.g == null ? 1400 : o.g, s = o.s || 0.3;
    const x = o.x + o.vx * age, y = o.y + o.vy * age + 0.5 * g * age * age;
    const rot = (o.rot0 || 0) + (o.spin || 9) * age;
    ctx.save();
    if (o.streaks !== false) {
      ctx.strokeStyle = 'rgba(230,240,255,0.35)';
      ctx.lineWidth = 2.2 * s / 0.3;
      ctx.beginPath();
      const vxn = o.vx, vyn = o.vy + g * age, vl = Math.hypot(vxn, vyn) || 1;
      for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 18 * s / 0.3, px = -vyn / vl * off, py = vxn / vl * off, L = (60 + 30 * NS.hash(i, o.seed || 1)) * s / 0.3;
        ctx.moveTo(x + px - vxn / vl * 40 * s / 0.3, y + py - vyn / vl * 40 * s / 0.3);
        ctx.lineTo(x + px - vxn / vl * (40 * s / 0.3 + L), y + py - vyn / vl * (40 * s / 0.3 + L));
      }
      ctx.stroke();
    }
    ctx.translate(x, y); ctx.rotate(rot);
    const P = Object.assign(K.poses.fall(0.35), { fsh: 2.4, nsh: -2.2, fel: 0.3, nel: 0.4, fhip: 0.9, nhip: -0.6, fkn: 0.4, nkn: 0.9, mouth: 1, free: 1, expr: 'scared' });
    K.zombie(ctx, o.seed || 1, P, { x: 0, y: 0, s, face: o.face || 1, pin: 'hip', rim: o.rim, t: S.t, wristband: 1, eyes: 0.9 });
    ctx.restore();
    return [x, y];
  };
  // a building facade as a quad (tl, tr, br, bl), windows mapped bilinearly; static, cheap enough per frame
  HL.facade = (ctx, q, o) => {
    o = o || {};
    const bil = (u, v) => {
      const tx = lerp(q[0][0], q[1][0], u), ty = lerp(q[0][1], q[1][1], u);
      const bx = lerp(q[3][0], q[2][0], u), by = lerp(q[3][1], q[2][1], u);
      return [lerp(tx, bx, v), lerp(ty, by, v)];
    };
    ctx.save();
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
    const gy0 = Math.min(q[0][1], q[1][1]), gy1 = Math.max(q[2][1], q[3][1]);
    const gr = ctx.createLinearGradient(0, gy0, 0, gy1);
    gr.addColorStop(0, o.top || '#141a2a'); gr.addColorStop(1, o.bottom || '#07090f');
    ctx.fillStyle = gr; ctx.fill();
    ctx.clip();
    const nx = o.nx || 6, ny = o.ny || 8, seed = o.seed || 1;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const u0 = (i + 0.22) / nx, u1 = (i + 0.78) / nx, v0 = (j + 0.25) / ny, v1 = (j + 0.75) / ny;
        if (o.skipRows && j >= ny - o.skipRows) continue;
        const h = NS.hash(i * 31 + j, seed);
        const lit = h < (o.lit == null ? 0.16 : o.lit);
        const a = bil(u0, v0), b = bil(u1, v0), c = bil(u1, v1), d = bil(u0, v1);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
        if (lit) {
          ctx.fillStyle = NS.hash(i + j * 7, seed + 9) < 0.7 ? 'rgba(255,186,96,0.78)' : 'rgba(170,205,255,0.6)';
        } else ctx.fillStyle = 'rgba(2,3,6,0.55)';
        ctx.fill();
      }
    }
    // rim along the light edge
    if (o.rim) {
      ctx.strokeStyle = o.rim; ctx.lineWidth = o.rimW || 3; ctx.globalAlpha = o.rimK == null ? 0.7 : o.rimK;
      const e = o.rimEdge || [0, 1];
      ctx.beginPath(); ctx.moveTo(q[e[0]][0], q[e[0]][1]); ctx.lineTo(q[e[1]][0], q[e[1]][1]); ctx.stroke();
    }
    ctx.restore();
  };
  // a simple parapet/roof slab along a line (x0,y0)-(x1,y1), thickness h
  HL.parapet = (ctx, x0, y0, x1, y1, h, col, rim) => {
    ctx.fillStyle = col || '#0b0f19';
    ctx.beginPath(); ctx.moveTo(x0, y0 - h); ctx.lineTo(x1, y1 - h); ctx.lineTo(x1, y1); ctx.lineTo(x0, y0); ctx.closePath(); ctx.fill();
    if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 - h); ctx.lineTo(x1, y1 - h); ctx.stroke(); }
  };
  // vertical gradient fill of a rect (cheap haze)
  HL.vgrad = (ctx, x, y, w, h, stops) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    for (const s of stops) g.addColorStop(s[0], s[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  };
  // a list of placed figures -> kit.horde with a custom place function (positions are pure in S.t)
  HL.crowd = (ctx, S, list, opts) => {
    if (!list.length) return { drawn: 0, phones: [] };
    return NS.kit.horde(ctx, S, Object.assign({ place: (i) => list[i], count: list.length }, opts));
  };
  // camera: world point (cx, cy) to the frame centre, zoom z, roll r, plus a handheld drift and shake offset
  HL.cam = (ctx, S, c, fn) => NS.kit.cam(ctx, c, fn);
  HL.WARM_LOOK = { light: null };

  // =============================================================================================== hordeWarn
  const CUTS = [[32, 'A'], [33, 'B'], [33.5, 'B2'], [34, 'C'], [34.5, 'D'], [35, 'E']];
  const END = 36;
  const P = () => NS.kit.poses;

  // ---- A: wide high, the horde breaks over everything --------------------------------------------------------
  // world = frame units at zoom 1. Band lower left under the lamp; far street fence; right roof; car right.
  const A = {
    lamp: [360, 300], pole: [452, 668],
    band: [270, 655], fenceY: 352, roofR: [[905, 250], [1280, 214]], car: [1000, 560],
  };
  function drawA(ctx, S, sb) {
    const K = NS.kit, t = S.t;
    const tb = HL.since(S, 32);          // seconds since the stamp
    const punch = HL.punches(S, [32.5, 32.625, 32.75], 0.13);
    const z = 1.0 + 0.04 * clamp(sb.lt / 1.6) + punch;
    const hh = K.handheld(S, 5, 11, 0.5);
    const fx = lerp(640, 330, clamp(punch / 0.39)), fy = lerp(360, 470, clamp(punch / 0.39));
    const camc = { x: fx + hh.x, y: fy + hh.y, zoom: z, rot: hh.rot };
    S.post.shake = 7 * HL.dec(HL.since(S, 32), 0.12) + 5 * (HL.dec(HL.since(S, 32.5), 0.08) + HL.dec(HL.since(S, 32.625), 0.08) + HL.dec(HL.since(S, 32.75), 0.1));
    let anchors = null;
    K.cam(ctx, camc, (g) => {
      // sky + far city (parallax: the sky barely moves)
      K.parallax(g, camc, 0.15, (g2) => {
        K.sky(g2, S, { top: '#04060c', bottom: '#22335a', moon: { x: 1090, y: 96, r: 44, k: 0.95 }, clouds: 0.75, glow: 0.55, glowColor: '#5a2e10', wind: 18, x: -400, y: -300, w: 2080, h: 760 });
      });
      K.parallax(g, camc, 0.45, (g2) => {
        K.skyline(g2, S, { seed: 7, y: 360, depth: 0.15, windows: 0.18, x0: -300, x1: 1600, height: 0.9 });
      });
      // street down to the vanishing point
      K.street(g, S, { view: 'ahead', horizonY: 352, bottomY: 760, vx: 640, roadW: 760, wet: 0.85, lamps: [{ x: A.lamp[0], color: C.sodium, k: 0.9 }], haze: '#2a3a5c' });
      // far fence across the street, horde pouring over it
      drawFenceHorde(g, S, tb);
      // left facade (tall) + right building with a roof the horde crests
      HL.facade(g, [[-200, -300], [470, 190], [470, 372], [-200, 760]], { nx: 7, ny: 11, seed: 4, lit: 0.14, top: '#121a2c', bottom: '#05070c', rim: 'rgba(127,166,255,0.55)', rimEdge: [1, 2], rimW: 3 });
      fireEscape(g, S);
      HL.facade(g, [[905, 250], [1500, 180], [1500, 760], [905, 382]], { nx: 6, ny: 9, seed: 9, lit: 0.12, top: '#131b2e', bottom: '#06080e', rim: 'rgba(127,166,255,0.6)', rimEdge: [0, 1] });
      HL.parapet(g, 905, 250, 1500, 180, 12, '#0a0e18', 'rgba(150,180,255,0.5)');
      roofHorde(g, S, tb);
      // main horde: pours from the fence toward the band
      streetHorde(g, S, tb);
      // car with zombies vaulting its roof
      K.wreck(g, A.car[0], A.car[1], 1.0, { seed: 4, kind: 'sedan', color: '#3c2a2a', face: -1, S });
      carHorde(g, S, tb);
      // the lamp and the band
      const L = K.streetlight(g, A.pole[0], A.pole[1], { h: 360, face: -1, S, flicker: 4, groundY: 680 });
      anchors = drawBandA(g, S);
      K.fog(g, S, { y: 330, h: 120, color: '#33456e', k: 0.35, speed: 20, seed: 3 });
      K.rain(g, S, { density: 0.55, x: -200, y: -300, w: 1700, h: 1100, glints: [{ x: L.lamp[0], y: L.lamp[1] + 150, r: 260, color: C.sodium, k: 1 }] });
      if (anchors) for (const w in anchors) S.anchor(w, anchors[w][0], anchors[w][1], g);
    });
  }
  function fireEscape(g, S) {
    // zig-zag landings on the left facade, two zombies scrambling down
    g.save();
    g.strokeStyle = '#05070c'; g.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      const y = 40 + i * 92, x0 = 300 - i * 6, x1 = 440;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y + 22); g.stroke();
      g.lineWidth = 2; g.beginPath();
      for (let k = 0; k < 9; k++) { const u = k / 8; g.moveTo(lerp(x0, x1, u), lerp(y, y + 22, u)); g.lineTo(lerp(x0, x1, u), lerp(y, y + 22, u) - 24); }
      g.moveTo(x0, y - 24); g.lineTo(x1, y - 2); g.stroke(); g.lineWidth = 4;
      g.beginPath(); g.moveTo(i % 2 ? x0 + 20 : x1 - 20, y + 4); g.lineTo(i % 2 ? x1 - 30 : x0 + 30, y + 96); g.stroke();
    }
    g.restore();
  }
  function drawFenceHorde(g, S, tb) {
    const K = NS.kit;
    // the dense mass behind the fence (fogged), visible through the chain link
    const back = [];
    for (let i = 0; i < 70; i++) {
      const r = NS.hash(i, 501), r2 = NS.hash(i, 502);
      back.push({ x: 470 + r * 440, y: A.fenceY - 4 + r2 * 10, s: 0.085 + r2 * 0.02, d: 0.1, face: r < 0.5 ? 1 : -1 });
    }
    HL.crowd(g, S, back, { mode: 'run', view: 'front', seed: 21, fog: { color: '#2b3b62', k: 0.75 }, rate: 0.9 });
    K.fence(g, 470, A.fenceY - 64, 440, 66, { kind: 'chain', damage: 0.5, barbed: true, seed: 6 });
    // climbers on top of the fence from 32.0, dropping over
    const cl = [];
    for (let i = 0; i < 12; i++) {
      const st = 0.02 + NS.hash(i, 511) * 0.9, a = tb - st;
      if (a < 0) continue;
      const x = 480 + NS.hash(i, 512) * 420;
      const y = a < 0.35 ? A.fenceY - 60 + 30 * (1 - E.outCubic(a / 0.35)) : A.fenceY - 60 + 60 * E.inQuad(clamp((a - 0.35) / 0.25));
      if (a > 0.6) continue;
      cl.push({ x, y, s: 0.1, d: 0.2, face: 1 });
    }
    HL.crowd(g, S, cl, { mode: 'climb', view: 'front', seed: 23, fog: { color: '#2b3b62', k: 0.4 } });
  }
  function roofHorde(g, S, tb) {
    // silhouettes pop up over the parapet at 32.0 (staggered), stand, then leap down toward the street
    const list = [];
    for (let i = 0; i < 16; i++) {
      const u = (i + 0.5) / 16, x = lerp(925, 1270, u) + (NS.hash(i, 601) - 0.5) * 14;
      const y0 = lerp(250, 214, (x - 905) / 595) - 12;
      const st = NS.hash(i, 602) * 0.35, a = tb - st;
      if (a < 0) continue;
      const pop = E.outBack(clamp(a / 0.16));
      let y = y0 + 40 * (1 - pop), xx = x;
      const leap = 0.55 + NS.hash(i, 603) * 0.5;
      if (a > leap) { const q = a - leap; xx = x - 120 * q; y = y0 - 140 * q + 900 * q * q; if (y > 760) continue; }
      list.push({ x: xx, y, s: 0.2 + NS.hash(i, 604) * 0.03, d: 0.6, face: -1 });
    }
    HL.crowd(g, S, list, { mode: 'run', view: 'front', seed: 25, rate: 1.1 });
  }
  function streetHorde(g, S, tb) {
    const list = [];
    const n = 150;
    for (let i = 0; i < n; i++) {
      const st = NS.hash(i, 701) * 1.2 - 0.05, a = tb - st;
      if (a < 0) continue;
      const lane = NS.hash(i, 702);
      // from the fence toward the band (lower left), accelerating; spreads out with depth
      const dd = clamp(a * (0.32 + 0.2 * NS.hash(i, 703)));
      const y = lerp(A.fenceY + 4, 700, Math.pow(dd, 1.5));
      const xFar = 500 + lane * 400, xNear = lerp(330, 1100, lane);
      const x = lerp(xFar, xNear, dd) - 160 * dd * dd;
      const s = lerp(0.09, 0.42, (y - A.fenceY) / (700 - A.fenceY));
      if (y > 660 && x < 560) continue;
      list.push({ x, y, s, d: dd, face: x < 640 ? -1 : 1 });
    }
    HL.crowd(g, S, list, { mode: 'run', view: 'front', seed: 27, fog: { color: '#2b3b62', k: 0.7 }, rate: 0.85, sync: 0.15 });
  }
  function carHorde(g, S, tb) {
    const list = [];
    for (let i = 0; i < 6; i++) {
      const st = 0.15 + i * 0.13, a = tb - st;
      if (a < 0 || a > 1.4) continue;
      // run across the roof (right to left) and vault off
      const x = 1180 - a * 420;
      const roofY = A.car[1] - 78;
      let y = x > 1110 ? lerp(A.car[1], roofY, clamp((1180 - x) / 70)) : x > 900 ? roofY - 30 * Math.sin(clamp((1110 - x) / 210) * PI) : roofY + (900 - x) * 0.6;
      if (y > 700) y = 700;
      list.push({ x, y, s: 0.26, d: 0.8, face: -1 });
    }
    HL.crowd(g, S, list, { mode: 'run', view: 'side', seed: 29, rate: 0.9 });
  }
  function drawBandA(g, S) {
    const K = NS.kit, Pz = P(), t = S.t, bt = S.beat;
    const lx = A.lamp[0], ly = A.lamp[1];
    const rimM = HL.rimMoon(0.6, -0.2);
    const shout = HL.since(S, 32.5) > 0 && HL.since(S, 32.5) < 0.6;
    const out = {};
    const bx = A.band[0], by = A.band[1], s = 0.62;
    // back to back: Tiny behind facing right, Vex left facing left, Granny front facing right, Noodle right facing left
    let a = K.survivor(g, 'tiny', Object.assign(Pz.idle(t), { use: 'drum', nsh: 2.3, nel: 0.7, fsh: 1.9, fel: 0.9, turn: 0.55, expr: shout ? 'shout' : 'neutral', mouth: shout ? 0.9 : 0 }),
      { x: bx + 40, y: by - 14, s, face: 1, rim: HL.rimSodium(bx + 40, by - 200, lx, ly), rim2: rimM, lit: 0.32, t });
    out.TINY = a.head;
    a = K.survivor(g, 'vex', Object.assign(Pz.sing(bt), { turn: 0.5, mouth: 0.8 }), { x: bx - 62, y: by - 4, s, face: -1, rim: HL.rimSodium(bx - 62, by - 200, lx, ly), rim2: rimM, lit: 0.32, t });
    out.VEX = a.head;
    a = K.survivor(g, 'noodle', Object.assign(Pz.idle(t), { nsh: 1.4, nel: 1.2, nhand: 'grip', expr: shout ? 'shout' : 'scared', mouth: shout ? 0.9 : 0.2 }), { x: bx + 112, y: by + 8, s, face: -1, rim: HL.rimSodium(bx + 112, by - 200, lx, ly), rim2: rimM, lit: 0.34, t, prop: 'wrench' });
    out.NOODLE = a.head;
    a = K.survivor(g, 'granny', Pz.shoot(0, -0.05), { x: bx - 6, y: by + 16, s, face: 1, rim: HL.rimSodium(bx, by - 150, lx, ly), rim2: rimM, lit: 0.36, t });
    out.GRANNY = a.head;
    return out;
  }

  // ---- B: Vex close, left third ---------------------------------------------------------------------------------
  // soft background: the far street, the horde coming out of the fog (defocused), UV bokeh
  function softStreet(g, S, o) {
    const K = NS.kit;
    K.sky(g, S, { top: '#03050a', bottom: '#1b2846', moon: { x: o.moonX || 1040, y: o.moonY || 90, r: 40, k: 0.7 }, clouds: 0.8, glow: 0.4, glowColor: '#4a2a14', wind: 14, x: -200, y: -200, w: 1680, h: o.horizon + 260 });
    K.skyline(g, S, { seed: 7, y: o.horizon, depth: 0.1, windows: 0.12, x0: -200, x1: 1480, height: o.skyH || 0.8 });
    HL.vgrad(g, -200, o.horizon - 2, 1680, 1000, [[0, '#1c2744'], [0.25, '#0c111e'], [1, '#05070c']]);
  }
  function bokeh(g, S, list, k) {
    const K = NS.kit;
    for (const b of list) K.glow(g, b[0], b[1], b[2], b[3], (b[4] == null ? 1 : b[4]) * k, 'soft');
  }
  function drawB(ctx, S, sb) {
    const K = NS.kit, Pz = P(), t = S.t;
    const z = 1.0 + 0.05 * clamp(sb.lt / 0.8);
    const hh = K.handheld(S, 4, 21, 0.6);
    const camc = { x: 640 + hh.x, y: 360 + hh.y, zoom: z, rot: hh.rot };
    let an = null;
    K.cam(ctx, camc, (g) => {
      K.parallax(g, camc, 0.3, (g2) => softStreet(g2, S, { horizon: 430, moonX: 1100, moonY: 80 }));
      // the horde in the fog behind him (defocused: heavy fog)
      const list = [];
      for (let i = 0; i < 90; i++) {
        const r = NS.hash(i, 801), r2 = NS.hash(i, 802), dd = fract(r2 + HL.since(S, 32) * 0.12);
        const y = lerp(436, 600, dd * dd), s = lerp(0.12, 0.34, dd * dd);
        list.push({ x: 470 + r * 900, y, s, d: dd * 0.6, face: r < 0.5 ? -1 : 1 });
      }
      HL.crowd(g, S, list, { mode: 'run', view: 'front', seed: 31, fog: { color: '#24345a', k: 0.95 }, rate: 0.85 });
      K.fog(g, S, { y: 420, h: 220, color: '#2c3d66', k: 0.6, speed: 30, seed: 5 });
      // the lamp bokeh up left + wristband bokeh
      g.save(); g.globalCompositeOperation = 'lighter';
      bokeh(g, S, [[150, 40, 220, C.sodium, 0.55], [190, 70, 60, '#fff1cc', 0.6]], 1);
      const bk = [];
      for (let i = 0; i < 22; i++) bk.push([560 + NS.hash(i, 811) * 720, 470 + NS.hash(i, 812) * 140, 10 + NS.hash(i, 813) * 16, C.uv, 0.35 + 0.3 * NS.hash(i, 814)]);
      bokeh(g, S, bk, 0.8 + 0.2 * Math.sin(t * 9));
      g.restore();
      // Vex: big, left third, singing at the horde
      const pose = Object.assign(Pz.sing(S.beat), { turn: 0.42, mouth: 0.65 + 0.3 * Math.abs(Math.sin(t * 11)), wind: 0.6, flap: t * 1.3 });
      const a = K.survivor(g, 'vex', pose, { x: 250, y: 1130, s: 1.85, face: 1, rim: HL.rimSodium(250, 700, 140, -100, 1.4), rim2: HL.rimMoon(1.0, -0.1), lit: 0.5, t, accent: 0.8 });
      an = a.head;
      S.anchor('VEX', a.head[0], a.head[1], g);
      K.rain(g, S, { density: 0.5, x: -200, y: -200, w: 1680, h: 1120 });
    });
    S.post.vignette = 0.7; S.post.bloom = 0.8;
  }

  // ---- B2: the four back to back, triple punch-in on HERE / THEY / COME! -------------------------------------
  function drawB2(ctx, S, sb) {
    const K = NS.kit, Pz = P(), t = S.t, bt = S.beat;
    const punch = HL.punches(S, [33.5, 33.625, 33.75], 0.16, 0.04);
    const z = 1.0 + punch + 0.03 * clamp(sb.lt / 0.8);
    const hh = K.handheld(S, 3, 23, 0.7);
    // zoom about the band's chest, held at frame (640, 520)
    const W0 = [640, 520];
    const camc = { x: W0[0] - (640 - 640) / z + hh.x, y: W0[1] - (520 - 360) / z + hh.y, zoom: z, rot: hh.rot };
    S.post.shake = 6 * (HL.dec(HL.since(S, 33.5), 0.07) + HL.dec(HL.since(S, 33.625), 0.07) + HL.dec(HL.since(S, 33.75), 0.09));
    K.cam(ctx, camc, (g) => {
      K.parallax(g, camc, 0.25, (g2) => softStreet(g2, S, { horizon: 470, moonX: 1010, moonY: 120 }));
      // the ring of the horde closing in, three rows
      const list = [];
      for (let i = 0; i < 160; i++) {
        const r = NS.hash(i, 901), r2 = NS.hash(i, 902);
        const dd = clamp(r2 * 0.75 + HL.since(S, 33) * 0.1);
        const y = lerp(478, 640, dd * dd), s = lerp(0.1, 0.36, dd * dd);
        const x = r * 1480 - 100;
        if (Math.abs(x - 640) < 260 && dd > 0.55) continue;
        list.push({ x, y, s, d: dd, face: x < 640 ? 1 : -1 });
      }
      HL.crowd(g, S, list, { mode: 'run', view: 'front', seed: 33, fog: { color: '#273860', k: 0.8 }, rate: 0.9, sync: 0.1 });
      K.fog(g, S, { y: 450, h: 200, color: '#2c3d66', k: 0.45, speed: 26, seed: 7 });
      // lamp overhead: a cone down onto them
      g.save(); g.globalCompositeOperation = 'lighter';
      K.beam(g, 660, -80, PI / 2, 0.42, 820, C.sodium, 0.45, { motes: 18, t, seed: 5 });
      g.save(); g.translate(640, 690); g.scale(1, 0.2); K.glow(g, 0, 0, 420, C.sodium, 0.5, 'flat'); g.restore();
      g.restore();
      const shout = HL.since(S, 33.5) > -0.05;
      const mo = shout ? 0.95 : 0.2;
      const L = [660, -60];
      const rimM = HL.rimMoon(0.75, -0.25);
      const s = 0.86;
      let a = K.survivor(g, 'tiny', Object.assign(Pz.idle(t), { use: 'drum', nsh: 2.6, nel: 0.4, fsh: 2.2, fel: 0.8, turn: 0.62, expr: 'shout', mouth: mo, head: -0.2 }),
        { x: 700, y: 676, s, face: 1, rim: HL.rimSodium(700, 400, L[0], L[1]), rim2: rimM, lit: 0.42, t });
      S.anchor('TINY', a.head[0], a.head[1], g);
      a = K.survivor(g, 'vex', Object.assign(Pz.sing(bt), { turn: 0.55, mouth: mo, expr: 'shout' }), { x: 545, y: 684, s, face: -1, rim: HL.rimSodium(545, 400, L[0], L[1]), rim2: rimM, lit: 0.42, t });
      S.anchor('VEX', a.head[0], a.head[1], g);
      a = K.survivor(g, 'noodle', Object.assign(Pz.idle(t), { nsh: 2.4, nel: 0.5, nhand: 'grip', expr: 'shout', mouth: mo, turn: 0.6, head: -0.15 }), { x: 800, y: 700, s, face: -1, rim: HL.rimSodium(800, 400, L[0], L[1]), rim2: rimM, lit: 0.45, t, prop: 'wrench' });
      S.anchor('NOODLE', a.head[0], a.head[1], g);
      a = K.survivor(g, 'granny', Object.assign(Pz.shoot(0, -0.25), { turn: 0.5 }), { x: 610, y: 712, s, face: 1, rim: HL.rimSodium(610, 450, L[0], L[1]), rim2: rimM, lit: 0.48, t });
      S.anchor('GRANNY', a.head[0], a.head[1], g);
      K.rain(g, S, { density: 0.55, x: -200, y: -200, w: 1680, h: 1120, glints: [{ x: 660, y: 300, r: 300, color: C.sodium, k: 1 }] });
    });
    S.post.vignette = 0.65; S.post.bloom = 0.8;
  }

  // ---- C: ground level, a thousand feet --------------------------------------------------------------------------
  const C_FOOT = 470;    // the near ground line on screen; below it: wet asphalt reflection
  function drawC(ctx, S, sb) {
    const K = NS.kit, t = S.t;
    const kick = HL.hitK(S, 'kick', 0.09);
    const z = 1.0 + 0.06 * clamp(sb.lt / 0.8) + 0.025 * kick;
    const camc = { x: 640, y: 360 - 10 * kick, zoom: z, rot: 0.02 * Math.sin(t * 3) };
    S.post.shake = 5 * kick;
    K.cam(ctx, camc, (g) => {
      const hz = 250;
      K.sky(g, S, { top: '#03050a', bottom: '#22335a', moon: { x: 980, y: 70, r: 34, k: 0.6 }, clouds: 0.8, glow: 0.5, glowColor: '#4a2a14', x: -200, y: -200, w: 1680, h: hz + 200 });
      K.skyline(g, S, { seed: 9, y: hz, depth: 0.2, windows: 0.15, x0: -200, x1: 1480, height: 0.7 });
      // ground: dark asphalt from the horizon, a long wet sheen
      HL.vgrad(g, -200, hz, 1680, 600, [[0, '#20294a'], [0.08, '#0d1220'], [0.5, '#090c15'], [1, '#04050a']]);
      // the far lamp and its reflection streak
      g.save(); g.globalCompositeOperation = 'lighter';
      K.glow(g, 330, 150, 160, C.sodium, 0.5, 'soft'); K.glow(g, 330, 150, 24, '#fff0c8', 0.9, 'hot');
      g.save(); g.translate(330, C_FOOT + 40); g.scale(0.18, 1.6); K.glow(g, 0, 0, 160, C.sodium, 0.35, 'soft'); g.restore();
      g.restore();
      // the horde: far small sprites to near; near ones are vector figures cropped by the frame top
      const far = [];
      const bt = S.beat;
      for (let i = 0; i < 180; i++) {
        const r = NS.hash(i, 1001), r2 = NS.hash(i, 1002);
        const dd = fract(r2 + HL.since(S, 34) * 0.35);
        const y = lerp(hz + 4, C_FOOT + 20, Math.pow(dd, 2.2)), s = lerp(0.06, 0.42, Math.pow(dd, 2.2));
        if (s > 0.4) continue;
        far.push({ x: (r - 0.5) * 1500 * (0.4 + dd) + 640, y, s, d: dd, face: r < 0.5 ? 1 : -1 });
      }
      // reflection first (mirrored about each figure's feet is impossible with sprites; mirror the band about C_FOOT)
      g.save();
      g.translate(0, 2 * C_FOOT + 30); g.scale(1, -1);
      g.globalAlpha = 0.25;
      HL.crowd(g, S, far, { mode: 'run', view: 'front', seed: 35, fog: { color: '#22335a', k: 0.6 }, rate: 1.0, sync: 0.6 });
      g.restore();
      HL.crowd(g, S, far, { mode: 'run', view: 'front', seed: 35, fog: { color: '#22335a', k: 0.6 }, rate: 1.0, sync: 0.6 });
      // near giants: legs stomping on the quarter notes, cropped at the top of the frame
      const near = [[230, 0.95, 3], [520, 1.25, 7], [880, 1.05, 1], [1130, 1.4, 10], [-40, 1.5, 6]];
      near.forEach((n, i) => {
        const ph = fract(bt * 1.0 + i * 0.37);
        const P0 = NS.kit.poses.zrun(ph);
        P0.turn = 0.82; P0.air = 0;
        const y = C_FOOT + 40 + n[1] * 60;
        NS.kit.zombie(g, n[2], P0, { x: n[0], y, s: n[1], face: i % 2 ? -1 : 1, t, lit: 0.12, rim: { color: C.zombieRim, dir: -2.4, k: 1.1 }, rim2: { color: C.sodium, dir: -1.6, k: 0.5 } });
      });
      // splash crowns at the stomp
      if (kick > 0.05) {
        g.save(); g.strokeStyle = 'rgba(200,220,255,' + (0.6 * kick).toFixed(3) + ')'; g.lineWidth = 2;
        near.forEach((n, i) => {
          const y = C_FOOT + 40 + n[1] * 60, r = (30 + 50 * (1 - kick)) * n[1];
          g.beginPath(); g.ellipse(n[0] + (i % 2 ? -20 : 20), y, r, r * 0.18, 0, 0, TAU); g.stroke();
        });
        g.restore();
      }
      HL.vgrad(g, -200, C_FOOT + 60, 1680, 400, [[0, 'rgba(4,5,10,0)'], [0.6, 'rgba(4,5,10,0.55)'], [1, 'rgba(4,5,10,0.8)']]);
      K.rain(g, S, { density: 0.5, x: -200, y: -200, w: 1680, h: 1120, splashes: { y0: C_FOOT + 60, y1: 720 } });
    });
    S.post.vignette = 0.7;
  }

  // ---- D: Tiny winds up and drums the car roof on "drum!" --------------------------------------------------------
  function drawD(ctx, S, sb) {
    const K = NS.kit, Pz = P(), t = S.t;
    const tHit = 34.94;
    const dh = HL.since(S, tHit);
    const k = dh < 0 ? lerp(0.35, 0, E.outCubic(clamp(sb.lt / 0.55))) : clamp(dh / 0.06);
    const z = 1.04 + 0.05 * clamp(sb.lt / 0.8) + 0.05 * HL.dec(dh, 0.08);
    const camc = { x: 640, y: 360, zoom: z, rot: -0.03 };
    S.post.shake = 12 * HL.dec(dh, 0.08);
    K.cam(ctx, camc, (g) => {
      K.parallax(g, camc, 0.3, (g2) => softStreet(g2, S, { horizon: 520, moonX: 260, moonY: 90 }));
      const list = [];
      for (let i = 0; i < 110; i++) {
        const r = NS.hash(i, 1101), r2 = NS.hash(i, 1102), dd = clamp(r2 * 0.8 + HL.since(S, 34.5) * 0.15);
        list.push({ x: r * 1500 - 100, y: lerp(524, 650, dd * dd), s: lerp(0.12, 0.4, dd * dd), d: dd, face: r < 0.5 ? 1 : -1 });
      }
      HL.crowd(g, S, list, { mode: 'run', view: 'front', seed: 37, fog: { color: '#273860', k: 0.85 }, rate: 0.9 });
      K.fog(g, S, { y: 500, h: 200, color: '#2c3d66', k: 0.5, speed: 26, seed: 9 });
      // Tiny, low angle, both bats up then down onto the car roof
      const pose = Object.assign(Pz.smash(k), { expr: 'shout', mouth: dh < 0 ? 0.4 : 1, turn: 0.55, head: -0.15 });
      const a = K.survivor(g, 'tiny', pose, { x: 560, y: 1000, s: 1.55, face: 1, rim: HL.rimSodium(560, 400, 200, -100, 1.3), rim2: HL.rimMoon(0.9, 0), lit: 0.45, t, accent: 0.9 });
      S.anchor('TINY', a.head[0], a.head[1], g);
      // the car roof in the foreground right
      K.wreck(g, 1010, 900, 2.2, { seed: 4, kind: 'sedan', color: '#3c2a2a', face: -1, S });
      if (dh > 0) {
        g.save(); g.globalCompositeOperation = 'lighter';
        K.shockwave(g, 900, 640, 60 + 260 * clamp(dh / 0.2), 1 - clamp(dh / 0.2), { color: '#fff1cc', squash: 0.35 });
        g.restore();
        K.speedLines(g, S, { cx: 900, cy: 620, k: 0.5 * HL.dec(dh, 0.1), color: '#fff3d0', inner: 120, outer: 900, count: 40 });
      }
      K.rain(g, S, { density: 0.5, x: -200, y: -200, w: 1680, h: 1120 });
    });
    S.post.vignette = 0.7;
  }

  // ---- E: Granny close: "Gerald. Wake up." --------------------------------------------------------------------
  function drawE(ctx, S, sb) {
    const K = NS.kit, Pz = P(), t = S.t;
    // she snaps him shut on "Wake up" and levels him at the horde
    const kc = HL.since(S, 35.2);
    let pose;
    if (kc < 0) pose = Object.assign(Pz.reload(0.55), { head: 0.1 });
    else if (kc < 0.3) pose = Pz.reload(lerp(0.55, 1, E.inOutCubic(clamp(kc / 0.3))));
    else pose = Pz.shoot(0, -0.06);
    pose.expr = 'deadpan';
    const roll = [35.75, 35.8125, 35.875, 35.90625, 35.9375, 35.96875];
    const z = 1.0 + 0.12 * E.inQuad(clamp(sb.lt / 1.6)) + HL.punches(S, roll, 0.045, 0.03);
    const hh = K.handheld(S, 3, 27, 0.5);
    const W0 = [470, 330], P0 = [500, 360];
    const camc = { x: W0[0] - (P0[0] - 640) / z + hh.x, y: W0[1] - (P0[1] - 360) / z + hh.y, zoom: z, rot: hh.rot };
    S.post.shake = 3 * HL.dec(S.snare, 0.06) * (S.bar > 35.7 ? 1 : 0);
    K.cam(ctx, camc, (g) => {
      K.parallax(g, camc, 0.3, (g2) => softStreet(g2, S, { horizon: 500, moonX: 1150, moonY: 110 }));
      const list = [];
      for (let i = 0; i < 120; i++) {
        const r = NS.hash(i, 1201), r2 = NS.hash(i, 1202), dd = clamp(r2 * 0.8 + HL.since(S, 35) * 0.12);
        list.push({ x: 560 + r * 900, y: lerp(505, 680, dd * dd), s: lerp(0.13, 0.48, dd * dd), d: dd, face: -1 });
      }
      HL.crowd(g, S, list, { mode: 'run', view: 'front', seed: 39, fog: { color: '#273860', k: 0.85 }, rate: 0.9 });
      K.fog(g, S, { y: 480, h: 220, color: '#2c3d66', k: 0.5, speed: 26, seed: 11 });
      const a = K.survivor(g, 'granny', pose, { x: 420, y: 1110, s: 2.15, face: 1, rim: HL.rimSodium(420, 500, 120, -150, 1.35), rim2: HL.rimMoon(1.0, -0.15), lit: 0.55, t, accent: 0.9 });
      S.anchor('GRANNY', a.head[0], a.head[1], g);
      K.rain(g, S, { density: 0.45, x: -200, y: -200, w: 1680, h: 1120 });
    });
    S.post.vignette = 0.75; S.post.bloom = 0.8;
  }

  // ---- shot dispatch -------------------------------------------------------------------------------------------
  const DRAW = { A: drawA, B: drawB, B2: drawB2, C: drawC, D: drawD, E: drawE };
  // lyric zones alternate so a line pre-shown in place never stacks on the one still singing
  function zoneAt(bar) {
    if (bar < 32.7) return 'top';        // p1g HERE THEY COME! (in at 32.46)
    if (bar < 33.4) return 'bottom';     // p1a2 Here they come, (in at 32.75)
    if (bar < 33.7) return 'top';        // p1g2 HERE THEY COME! (in at 33.46)
    if (bar < 35.9) return 'bottom';     // p1b a thousand feet... (in at 33.75)
    return 'top';                        // c1a KEEP THEM DANCING! (in at 35.96, the horde's aerial)
  }
  NS.shot('hordeWarn', {
    init() {},
    warm() {
      const K = NS.kit;
      if (K && K.horde && K.horde.warm) { K.horde.warm(['run'], { view: 'front' }); K.horde.warm(['run'], { view: 'side' }); K.horde.warm(['climb'], { view: 'front' }); }
    },
    layout(S) {
      const sb = HL.sub(S, CUTS, END);
      const ko = [];
      if (sb.id === 'A') ko.push([120, 380, 360, 340]);
      if (sb.id === 'E') ko.push([250, 120, 420, 600]);
      return { lyricZone: zoneAt(S.bar), keepOut: ko };
    },
    draw(ctx, S) {
      const sb = HL.sub(S, CUTS, END);
      (DRAW[sb.id] || drawA)(ctx, S, sb);
    },
  });
})();
