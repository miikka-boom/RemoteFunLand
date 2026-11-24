// NO SURVIVORS: Keep Them Dancing. Shot "stage" (bars 64-72): chorus 2 at the Orpheum.
// The band plays, the pit headbangs in perfect sync, the front row films, grunts HUH! on the line ends and freezes on
// STOPS; two clue inserts (the ADMIT ONE wristband, the setlist); the selfie; the tape stop drains the power to black.
// Shot list (global bars; cuts on downbeats except the insert at 65.5, which starts exactly on the clue hold):
//   64.00 wide      from the pit: the whole show, kick punches; Tiny "They know the words." (64.5)
//   65.00 low       low angle from the barricade, front-row fists in the foreground, the band looming
//   65.50 wrist     insert: a raised front-row fist, ADMIT ONE + Lou's mark (clue hold 65.5-66.75), then it punches away
//   67.00 setlist   insert: the setlist taped by the mic stand (clue hold 67-68.25); hands grip the lip, HUH! (271)
//   68.25 side      side-stage over Granny's shoulder: the selfie; STOPS (274.5-275.5) the pit freezes, heads swivel
//   70.00 drum      Tiny's drummer cam: Vex turns back, "They LOVE me." (70.5); tape stop 286-288 drains it to black
// Everything is a pure function of S (seeded randomness only). Caches: the fist sprites, the bokeh disc, the floor.
(function () {
  'use strict';
  const NS = window.NS;
  if (!NS) return;
  const { clamp, lerp, smoothstep: sstep } = NS;
  const C = NS.C, W = 1280, H = 720, BEAT = NS.BEAT, BAR = NS.BAR, PI = Math.PI, TAU = PI * 2;
  const E = NS.ease;
  const { sin, cos, exp, abs, min, max, floor, pow, hypot } = Math;
  const tb = (b) => b * BAR;
  const K = () => NS.kit;

  // ---------------------------------------------------------------- timeline
  const CUTS = [[64, 'wide'], [65, 'low'], [65.5, 'wrist'], [67, 'setlist'], [68.25, 'side'], [70, 'drum']];
  function shotAt(bar) { let s = CUTS[0]; for (const c of CUTS) if (bar >= c[0] - 1e-6) s = c; return s; }
  const F0 = 274.5 * BEAT, F1 = 275.5 * BEAT;          // STOPS: the band stops dead, the pit freezes
  const T0 = 286 * BEAT, T1 = 288 * BEAT;              // the tape stop
  const HUH = 275 * BEAT;                               // one zombie: huh?
  const WRIST_HOLD = [tb(65.5), tb(66.75)];

  // performance time: holds during STOPS (exactly one beat, so phases stay on the grid afterwards) and winds down
  // with the tape stop (velocity 1 -> 0 over the two beats)
  function perfT(t) {
    if (t < F0) return t;
    if (t < F1) return F0;
    if (t < T0) return t - (F1 - F0);
    const d = min(t - T0, T1 - T0), D = T1 - T0;
    return T0 - (F1 - F0) + d - d * d / (2 * D);
  }
  // a copy of S whose clock is the performance clock (stage lights and drum wobble use S.t / S.beat)
  function perfS(S) {
    const pt = perfT(S.t);
    if (pt === S.t) return S;
    return Object.assign({}, S, { t: pt, beat: pt / BEAT, bar: pt / BAR });
  }
  const tapeK = (t) => sstep(T0, T1, t);              // 0..1 through the tape stop
  const frozen = (t) => t >= F0 && t < F1;

  function kickPunch(S) {
    if (frozen(S.t) || S.t > T0) return 1;
    const k = isFinite(S.kick) ? exp(-S.kick * 13) : 0;
    return 1 + 0.022 * k * S.shakeK;
  }
  const snareK = (S) => (frozen(S.t) || S.t > T0 ? 0 : (isFinite(S.snare) ? exp(-S.snare * 7) : 0));

  // the pit's state: STOPS freeze, the HUH! jerk, the tape-stop sag
  function crowdState(S, lookAt) {
    const t = S.t;
    let freeze = 0, freezeAt = null, jerk = 0;
    if (frozen(t)) { freeze = clamp((t - F0) / 0.16); freezeAt = F0 - 0.05; }
    const h = S.hit('crowdHuh');
    if (h >= 0 && h < 0.6) {
      jerk = (h < 0.05 ? h / 0.05 : 1) * exp(-max(0, h - 0.05) * 7);
      if (h < 0.22 && !freeze) { freeze = 1; freezeAt = t - h; }
    }
    return { freeze, freezeAt, jerk, lookAt, t: perfT(t), sag: tapeK(t) };
  }

  // ---------------------------------------------------------------- clue rects (WHERE; SCORE.clues says WHEN)
  const FIST = { x: 870, wy: 430 };                       // the hero fist's wrist centre in the insert
  const WRIST_RECT = [636, 92, 470, 470];
  const SET = { x: 652, y: 10, w: 600, h: 700, rot: -0.035 };
  const SET_RECT = [632, 0, 640, 720];
  NS.clue('wristband', { shot: 'stage', rect: WRIST_RECT });
  NS.clue('setlist', { shot: 'stage', rect: SET_RECT });

  // ---------------------------------------------------------------- caches
  const CA = { fist: null, fistSil: null, bokeh: null, floor: null, blob: null, env: null };
  let MK = (w, h) => NS.makeCanvas(w, h, 'stage');
  let FREE = (c) => NS.freeCanvas(c);
  const HL = { color: C.zombieRim, dir: -PI / 2 };          // the pit's rim light (constant: one atlas per lit level)
  const FOG = '#140c26';

  // the band text metrics (Anton, cap >= 38 units)
  const BAND = { fs: 54, mark: 48, h: 88 };
  function measureBand() {
    const g = document.createElement('canvas').getContext('2d');
    g.font = NS.font(BAND.fs, NS.F.title);
    const tw = g.measureText(((window.SCORE && SCORE.texts && SCORE.texts.wristband) || 'ADMIT ONE')).width;
    return tw;
  }

  // a raised fist (front view: curled fingers, thumb across, forearm down to the bottom), band on the wrist.
  // mode 'lit' (the insert: mid-tones, key light from the stage) | 'sil' (a near-black silhouette with a rim).
  function buildFist(mode) {
    const tw = measureBand();
    const BW = 22 + BAND.mark + 16 + tw + 18 + 24 + 18;      // visible band width = the wrist width
    const FW = BW * 1.16, cs = NS.cacheScale || 1, R = cs * (mode === 'lit' ? 1.15 : 0.55);
    const w = FW * 1.3, h = BW * 2.9, cx = w / 2, wy = BW * 1.25;
    const c = MK(w * R, h * R), g = c.getContext('2d');
    g.scale(R, R);
    const lit = mode === 'lit';
    // ---- silhouette path (forearm + heel + fist + thumb)
    const body = new Path2D();
    body.moveTo(cx - BW * 0.5, wy + 4);
    body.bezierCurveTo(cx - BW * 0.56, wy + BW * 0.6, cx - BW * 0.66, wy + BW * 1.1, cx - BW * 0.7, h + 10);
    body.lineTo(cx + BW * 0.74, h + 10);
    body.bezierCurveTo(cx + BW * 0.7, wy + BW * 1.0, cx + BW * 0.58, wy + BW * 0.5, cx + BW * 0.5, wy + 4);
    body.closePath();
    const heel = new Path2D();
    heel.moveTo(cx - BW * 0.5, wy + 6); heel.lineTo(cx - FW * 0.5, wy - BW * 0.3); heel.lineTo(cx + FW * 0.5, wy - BW * 0.3); heel.lineTo(cx + BW * 0.5, wy + 6); heel.closePath();
    const fx0 = cx - FW / 2, fy0 = wy - BW * 1.02, fh = BW * 0.92;
    const block = new Path2D(); roundRect(block, fx0, fy0 + BW * 0.06, FW, fh, BW * 0.2);
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const fw = FW / 4, x = fx0 + i * fw, top = fy0 + [0.05, 0, 0.03, 0.1][i] * BW, fhh = BW * [0.56, 0.6, 0.57, 0.5][i];
      const p = new Path2D(); roundRect(p, x + 2, top, fw - 4, fhh, fw * 0.42); fingers.push({ p, x, top, fw, fhh });
    }
    const thumb = new Path2D();
    const ta = [cx - FW * 0.54, wy - BW * 0.34], tb2 = [cx + FW * 0.14, wy - BW * 0.5], tr = BW * 0.15;
    capsule(thumb, ta[0], ta[1], tr * 1.15, tb2[0], tb2[1], tr);
    const all = new Path2D(); all.addPath(body); all.addPath(heel); all.addPath(block); fingers.forEach((f) => all.addPath(f.p)); all.addPath(thumb);
    const skin = lit ? '#7c9466' : '#0f150e', skinHi = lit ? '#c6d6a2' : '#1b2418', skinLo = lit ? '#24301e' : '#070a06';
    const rimC = lit ? '#8fb8ff' : C.zombieRim;
    // ---- body fill with a key light from the upper left (the stage), dark toward the elbow
    g.save(); g.clip(all, 'nonzero');
    const lg = g.createLinearGradient(cx - FW * 0.6, fy0, cx + FW * 0.5, h);
    lg.addColorStop(0, skinHi); lg.addColorStop(0.28, skin); lg.addColorStop(0.75, skinLo); lg.addColorStop(1, '#030403');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    if (lit) {
      // forearm: cylindrical shading + blotches + a stitched scar
      const cg = g.createLinearGradient(cx - BW * 0.7, 0, cx + BW * 0.74, 0);
      cg.addColorStop(0, 'rgba(10,14,8,0.55)'); cg.addColorStop(0.3, 'rgba(10,14,8,0)'); cg.addColorStop(0.7, 'rgba(10,14,8,0.15)'); cg.addColorStop(1, 'rgba(10,14,8,0.7)');
      g.fillStyle = cg; g.fillRect(0, wy, w, h - wy);
      const r = NS.rng(66);
      for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(40,58,30,' + (0.18 + r() * 0.2) + ')'; g.beginPath(); g.ellipse(cx + (r() - 0.5) * BW, wy + BW * 0.3 + r() * BW * 1.4, 12 + r() * 26, 8 + r() * 16, r() * 3, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(30,20,22,0.8)'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - BW * 0.38, wy + BW * 0.95); g.quadraticCurveTo(cx, wy + BW * 0.75, cx + BW * 0.34, wy + BW * 0.98); g.stroke();
      for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6, x = lerp(cx - BW * 0.34, cx + BW * 0.3, u), y = wy + BW * (0.93 - 0.17 * sin(u * PI)); g.beginPath(); g.moveTo(x - 6, y - 12); g.lineTo(x + 6, y + 12); g.stroke(); }
      // veins
      g.strokeStyle = 'rgba(60,90,70,0.35)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(cx - BW * 0.1, wy + BW * 0.15); g.bezierCurveTo(cx - BW * 0.2, wy + BW * 0.6, cx + BW * 0.05, wy + BW * 0.9, cx - BW * 0.15, h); g.stroke();
    }
    g.restore();
    // ---- finger rolls: each its own shading, creases between them
    fingers.forEach((f, i) => {
      g.save(); g.clip(f.p);
      const fg = g.createLinearGradient(f.x, f.top, f.x + f.fw, f.top + f.fhh);
      fg.addColorStop(0, lit ? '#d4e2b0' : '#1d2819'); fg.addColorStop(0.35, skin); fg.addColorStop(1, skinLo);
      g.fillStyle = fg; g.fillRect(f.x, f.top, f.fw, f.fhh);
      if (lit) {
        // knuckle crease + a knuckle highlight
        g.strokeStyle = 'rgba(28,36,22,0.6)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(f.x + f.fw * 0.25, f.top + f.fhh * 0.48); g.quadraticCurveTo(f.x + f.fw * 0.5, f.top + f.fhh * 0.42, f.x + f.fw * 0.78, f.top + f.fhh * 0.5); g.stroke();
        g.fillStyle = 'rgba(240,250,220,0.32)'; g.beginPath(); g.ellipse(f.x + f.fw * 0.42, f.top + f.fhh * 0.2, f.fw * 0.2, f.fhh * 0.08, -0.3, 0, TAU); g.fill();
        // a band-aid on the ring finger
        if (i === 2) { g.fillStyle = '#d8c29a'; g.fillRect(f.x, f.top + f.fhh * 0.6, f.fw, f.fhh * 0.16); g.fillStyle = 'rgba(120,90,60,0.5)'; for (let j = 0; j < 4; j++) g.fillRect(f.x + f.fw * (0.3 + j * 0.12), f.top + f.fhh * 0.64, 3, 3); }
      }
      g.restore();
      g.strokeStyle = lit ? 'rgba(14,18,10,0.85)' : 'rgba(0,0,0,0.9)'; g.lineWidth = 3; g.stroke(f.p);
    });
    // ---- thumb over the fingers
    g.save(); g.clip(thumb);
    const tg = g.createLinearGradient(0, ta[1] - tr, 0, ta[1] + tr);
    tg.addColorStop(0, lit ? '#cfdca8' : '#1b2418'); tg.addColorStop(0.5, skin); tg.addColorStop(1, skinLo);
    g.fillStyle = tg; g.fillRect(ta[0] - tr * 2, tb2[1] - tr * 2, (tb2[0] - ta[0]) + tr * 4, tr * 5);
    g.restore();
    g.strokeStyle = lit ? 'rgba(14,18,10,0.9)' : 'rgba(0,0,0,0.9)'; g.lineWidth = 3; g.stroke(thumb);
    if (lit) { // the thumbnail, cracked and dark
      g.save(); g.translate(tb2[0] - tr * 0.4, tb2[1]); g.rotate(-0.2);
      g.fillStyle = '#3a3a2a'; g.beginPath(); g.ellipse(0, 0, tr * 0.55, tr * 0.62, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(230,240,200,0.4)'; g.beginPath(); g.ellipse(-tr * 0.15, -tr * 0.2, tr * 0.2, tr * 0.12, 0, 0, TAU); g.fill();
      g.restore();
    }
    // ---- rim light (from behind, the right edge) and a dark outline
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.strokeStyle = rimC; g.lineWidth = lit ? 7 : 9; g.globalAlpha = lit ? 0.55 : 0.95;
    g.translate(-4, 0); g.stroke(all); g.restore();
    g.save(); g.clip(all); g.globalCompositeOperation = 'source-atop';
    const rg = g.createLinearGradient(cx - FW * 0.6, 0, cx + FW * 0.6, 0);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.8, 'rgba(0,0,0,0)'); rg.addColorStop(1, lit ? 'rgba(140,180,255,0.35)' : 'rgba(143,191,90,0.3)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h); g.restore();
    // ---- the wristband: black vinyl hugging the wrist, ADMIT ONE + Lou's mark in UV ink, a snap
    const by = wy - BAND.h * 0.12, bh = BAND.h, bx0 = cx - BW * 0.5 - 6, bx1 = cx + BW * 0.5 + 6, bow = BW * 0.035;
    const band = new Path2D();
    band.moveTo(bx0, by); band.quadraticCurveTo(cx, by + bow * 2, bx1, by);
    band.lineTo(bx1, by + bh); band.quadraticCurveTo(cx, by + bh + bow * 2, bx0, by + bh); band.closePath();
    const bgr = g.createLinearGradient(bx0, 0, bx1, 0);
    bgr.addColorStop(0, '#050407'); bgr.addColorStop(0.2, '#1d1824'); bgr.addColorStop(0.55, '#2a2433'); bgr.addColorStop(0.85, '#141019'); bgr.addColorStop(1, '#030205');
    g.fillStyle = bgr; g.fill(band);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(bx0 + 10, by + 6); g.quadraticCurveTo(cx, by + bow * 2 + 6, bx1 - 10, by + 6); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 3; g.stroke(band);
    const ty = by + bh / 2 + bow;
    const mx = bx0 + 22 + BAND.mark / 2;
    const ink = (glow) => {
      g.save();
      if (glow) { g.shadowColor = C.uv; g.shadowBlur = 18; }
      if (K() && K().symbol) K().symbol(g, mx, ty, BAND.mark, glow ? C.uvHot : C.uv, 1, { weight: 0.12, glow: false });
      g.font = NS.font(BAND.fs, NS.F.title); g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = glow ? C.uvHot : C.uv;
      g.fillText(((window.SCORE && SCORE.texts && SCORE.texts.wristband) || 'ADMIT ONE'), mx + BAND.mark / 2 + 16, ty + 2);
      g.restore();
    };
    ink(true); ink(false);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; ink(true); g.restore();
    // snap
    const sx = bx1 - 24;
    g.fillStyle = '#5a5862'; g.beginPath(); g.arc(sx, ty, 12, 0, TAU); g.fill();
    g.fillStyle = '#b4b2bc'; g.beginPath(); g.arc(sx - 3, ty - 3, 4.5, 0, TAU); g.fill();
    return { c, w, h, cx, wy, BW, FW, R, band: [bx0, by, bx1 - bx0, bh], top: fy0 };
  }
  function roundRect(p, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r);
    p.quadraticCurveTo(x + w, y + h, x + w - r, y + h); p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); p.closePath();
  }
  function capsule(p, ax, ay, ar, bx, by, br) {
    const a = Math.atan2(by - ay, bx - ax);
    p.moveTo(ax + cos(a + PI / 2) * ar, ay + sin(a + PI / 2) * ar);
    p.arc(ax, ay, ar, a + PI / 2, a + 3 * PI / 2);
    p.lineTo(bx + cos(a - PI / 2) * br, by + sin(a - PI / 2) * br);
    p.arc(bx, by, br, a - PI / 2, a + PI / 2);
    p.closePath();
  }
  // a soft dark blob (defocused heads and shoulders behind the insert fist)
  function buildBlob() {
    const n = 128, c = MK(n, n), g = c.getContext('2d');
    const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, 'rgba(4,3,8,1)'); gr.addColorStop(0.55, 'rgba(4,3,8,0.95)'); gr.addColorStop(1, 'rgba(4,3,8,0)');
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    return c;
  }
  // the stage floor seen from above (setlist insert): dark boards, scuffs, spike tape, the gilt lip at the left
  function buildFloor() {
    const cs = NS.cacheScale || 1, R = cs * 0.75, c = MK(W * R, H * R), g = c.getContext('2d');
    g.scale(R, R);
    const r = NS.rng(6701);
    g.fillStyle = '#16100c'; g.fillRect(0, 0, W, H);
    // boards run vertically (toward the lip at the left edge of the frame they run horizontally: boards along x)
    for (let y = -10, i = 0; y < H; y += 46, i++) {
      const tone = 20 + r() * 12;
      g.fillStyle = 'rgb(' + (tone + 8) + ',' + (tone - 2) + ',' + (tone - 8) + ')';
      g.fillRect(180, y, W - 180, 44);
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(180, y + 44, W - 180, 2);
      // board joints
      let x = 180 + r() * 300;
      while (x < W) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, 2, 44); x += 240 + r() * 360; }
      // grain
      g.strokeStyle = 'rgba(255,220,180,0.035)'; g.lineWidth = 1.2;
      for (let j = 0; j < 5; j++) { const yy = y + 5 + r() * 34; g.beginPath(); g.moveTo(180, yy); for (let xx = 180; xx <= W; xx += 80) g.lineTo(xx, yy + sin(xx * 0.01 + j + i) * 2.5); g.stroke(); }
    }
    // scuffs and burn marks
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '0,0,0' : '120,100,80') + ',' + (0.06 + r() * 0.1) + ')'; g.beginPath(); g.ellipse(200 + r() * (W - 200), r() * H, 6 + r() * 40, 2 + r() * 6, r() * 3, 0, TAU); g.fill(); }
    // spike tape marks (glow tape + an X for the mic)
    g.fillStyle = 'rgba(220,210,170,0.55)';
    for (const [x, y, a] of [[360, 250, 0.7], [360, 250, -0.7]]) { g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-34, -6, 68, 12); g.restore(); }
    g.fillStyle = 'rgba(150,255,190,0.4)'; g.fillRect(260, 640, 46, 9);
    // the lip: gilt edge and the dark drop into the pit
    g.fillStyle = '#050307'; g.fillRect(0, 0, 176, H);
    const lg = g.createLinearGradient(0, 0, 176, 0); lg.addColorStop(0, 'rgba(30,14,40,0.9)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg; g.fillRect(0, 0, 176, H);
    g.fillStyle = '#6b5222'; g.fillRect(170, 0, 14, H); g.fillStyle = '#e2c26a'; g.fillRect(180, 0, 3, H);
    return c;
  }
  function freeAll() { for (const k of ['fist', 'fistSil']) if (CA[k]) { FREE(CA[k].c); CA[k] = null; } for (const k of ['blob', 'floor']) if (CA[k]) { FREE(CA[k]); CA[k] = null; } }
  function ensure() {
    if (!CA.fist) CA.fist = buildFist('lit');
    if (!CA.fistSil) CA.fistSil = buildFist('sil');
    if (!CA.blob) CA.blob = buildBlob();
    if (!CA.floor) CA.floor = buildFloor();
  }

  // ---------------------------------------------------------------- shared drawing
  const STAGE_COLS = [C.stageMagenta, C.stageBlue, '#ffb347', '#e8f0ff'];
  const TAPE_COLS = ['#ff2a14', '#b8140c', '#ff5a24', '#8a0c06'];
  function stageOpts(S, cam, extra) {
    const tk = tapeK(S.t);
    const power = 0.7 * (1 - tk);
    const lights = (0.82 + 0.18 * snareK(S)) * (1 - tk);
    return Object.assign({ cam, power: max(0.001, power), lights, colors: tk > 0.02 ? TAPE_COLS : STAGE_COLS, pattern: 'sweep', haze: 0.75, kit: false, scorch: 0.5 }, extra || {});
  }
  function rimFor(S) { const b = floor(perfT(S.t) / BAR); return STAGE_COLS[b % 4]; }

  // the band on the stage, forward views. Returns anchors.
  function bandForward(ctx, S, info, o) {
    const kit = K(), pt = perfT(S.t), ph = pt / BEAT, tk = tapeK(S.t);
    const rc = rimFor(S);
    const common = (k) => ({ rim: { color: rc, dir: -PI / 2 - 0.35, k: 1.3 }, rim2: { color: '#ffcf8a', dir: PI / 2 + 0.2, k: 0.55 }, lit: 0.5 * (1 - tk * 0.8), accent: 0.85, t: pt });
    const out = {};
    const sp = (u, f, lift) => info.floor(u, f, lift);
    // Tiny behind the kit
    const tiny = sp(0.5, 0.06, 40);
    const dk = info.drums;
    const tp = sag(kit.poses.drums(ph * 0.5, 1), tk);
    tp.turn = 0.86;
    out.TINY = kit.survivor(ctx, 'tiny', tp, Object.assign(common(), { x: tiny[0], y: tiny[1], s: tiny[2] * 0.96, face: 1 }));
    kit.drumKit(ctx, dk[0], dk[1], dk[2] * 0.56, { S: perfS(S) });
    // Granny (left), Noodle (right), Vex at the lip (off centre so Tiny reads)
    const gr = sp(0.24, 0.62), no = sp(0.77, 0.62), vx = sp(0.4, 0.92);
    const gp = sag(kit.poses.guitar(ph), tk); gp.turn = 0.7;
    out.GRANNY = kit.survivor(ctx, 'granny', gp, Object.assign(common(), { x: gr[0], y: gr[1], s: gr[2], face: 1 }));
    const np = sag(kit.poses.bass(ph), tk); np.turn = 0.66;
    out.NOODLE = kit.survivor(ctx, 'noodle', np, Object.assign(common(), { x: no[0], y: no[1], s: no[2], face: -1, lamp: 0.9 }));
    const vp = sag(kit.poses.sing(ph), tk); vp.turn = 0.72; vp.wind = 0.5;
    out.VEX = kit.survivor(ctx, 'vex', vp, Object.assign(common(), { x: vx[0], y: vx[1], s: vx[2], face: 1 }));
    return out;
  }
  // the tape stop: heads sag, arms drop
  function sag(p, k) {
    if (k <= 0) return p;
    const e = E.inOutQuad(k);
    p.head = lerp(p.head || 0, 0.55, e); p.neck = lerp(p.neck || 0, 0.25, e); p.torso = lerp(p.torso || 0, 0.28, e);
    p.mouth = lerp(p.mouth || 0, 0.15, e);
    for (const sd of ['f', 'n']) { p[sd + 'sh'] = lerp(p[sd + 'sh'] || 0, 0.15, e * 0.85); p[sd + 'el'] = lerp(p[sd + 'el'] || 0, 0.25, e * 0.85); }
    return p;
  }
  // the pit as a sprite horde
  function pit(ctx, S, area, o) {
    const kit = K(), cs = o.cs;
    const sagY = cs.sag * (area.sNear * 300) * 0.06;
    ctx.save();
    ctx.translate(0, -cs.jerk * (o.jerkPx || 12) + sagY);
    const r = kit.horde(ctx, S, {
      area, seed: o.seed || 64, count: o.count || 200, density: o.density, mode: 'headbang', view: 'front', sync: 0.9, rate: 1,
      light: HL, lit: o.lit || 0, fog: { color: FOG, k: o.fog == null ? 0.55 : o.fog }, phones: o.phones == null ? 0.05 : o.phones,
      t: cs.t, freeze: cs.freeze, freezeAt: cs.freezeAt, lookAt: cs.lookAt, wristGlow: 1 - 0.5 * cs.sag,
    });
    ctx.restore();
    return r;
  }
  // additive stage-colour wash over the crowd (cheap colour chase without rebuilding the horde atlas)
  function crowdWash(ctx, S, y0, y1, k) {
    const kit = K(), pt = perfT(S.t), b = floor(pt / BAR), tk = tapeK(S.t);
    const cols = tk > 0.02 ? TAPE_COLS : STAGE_COLS;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = 160 + i * 320 + 120 * sin(pt * 0.9 + i * 1.7);
      ctx.save(); ctx.translate(x, (y0 + y1) / 2); ctx.scale(1.6, (y1 - y0) / 500);
      kit.glow(ctx, 0, 0, 260, cols[(i + b) % 4], 0.16 * k * (1 - tk * 0.6) * (1 + 0.5 * snareK(S)), 'soft');
      ctx.restore();
    }
    ctx.restore();
  }
  function post(S, o) {
    const tk = tapeK(S.t);
    S.post.bloom = (o && o.bloom) || 0.95;
    S.post.grain = 0.32;
    S.post.vignette = lerp(0.6, 0.9, tk);
    S.post.ca = 0.18;
    if (tk > 0) {
      S.post.tint = [1, lerp(1, 0.32, tk), lerp(1, 0.26, tk), min(1, tk * 1.2)];
      S.post.blackout = sstep(T0 + 0.25, T1 - 0.02, S.t);
    }
  }
  function camWrap(ctx, S, z, cx, cy, fn) {
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
    fn();
    ctx.restore();
  }

  // ---------------------------------------------------------------- shot: wide from the pit (64-65)
  function shotWide(ctx, S) {
    const kit = K(), k = clamp((S.t - tb(64)) / BAR);
    const hh = kit.handheld(S, 4, 21, 0.5);
    const cam = { x: 640 + hh.x + lerp(-10, 10, k), y: lerp(330, 344, E.inOutQuad(k)) + hh.y, zoom: lerp(1.0, 1.1, E.inOutQuad(k)), low: 0.08 };
    const PS = perfS(S);
    const o = stageOpts(S, cam, { pattern: 'sweep' });
    camWrap(ctx, S, kickPunch(S), 640, 400, () => {
      const info = kit.stageSet(ctx, PS, Object.assign({ pass: 'back' }, o));
      const an = bandForward(ctx, S, info);
      kit.stageSet(ctx, PS, Object.assign({ pass: 'frame' }, o));
      const cs = crowdState(S, [an.VEX.head[0], an.VEX.head[1]]);
      pit(ctx, S, info.pit, { cs, count: 190, seed: 64, phones: 0.06 });
      crowdWash(ctx, S, info.pit.yFar - 120, H, 1);
      kit.stageSet(ctx, PS, Object.assign({ pass: 'fx' }, o));
      S.anchor('TINY', an.TINY.head[0], an.TINY.head[1], ctx);
      S.anchor('VEX', an.VEX.head[0], an.VEX.head[1], ctx);
    });
    post(S);
  }

  // ---------------------------------------------------------------- shot: low angle from the barricade (65-65.5)
  function shotLow(ctx, S) {
    const kit = K(), k = clamp((S.t - tb(65)) / (BAR * 0.5));
    const hh = kit.handheld(S, 3, 31, 0.6);
    const cam = { x: 640 + hh.x, y: 436 + hh.y - 10 * k, zoom: 1.85 + 0.1 * E.inQuad(k), low: 1 };
    const PS = perfS(S);
    const o = stageOpts(S, cam, { pattern: 'fan' });
    // the push toward the hero fist starts in the last quarter
    const push = E.inCubic(sstep(0.45, 1, k));
    camWrap(ctx, S, kickPunch(S) * (1 + push * 0.55), lerp(640, FIST.x, push), lerp(400, 560, push), () => {
      const info = kit.stageSet(ctx, PS, Object.assign({ pass: 'back' }, o));
      const an = bandForward(ctx, S, info);
      kit.stageSet(ctx, PS, Object.assign({ pass: 'frame' }, o));
      kit.stageSet(ctx, PS, Object.assign({ pass: 'fx' }, o));
      S.anchor('TINY', an.TINY.head[0], an.TINY.head[1], ctx);
      S.anchor('VEX', an.VEX.head[0], an.VEX.head[1], ctx);
      // front-row fists in the foreground (silhouettes from behind), pumping on the beat; the hero fist on the right
      fgFists(ctx, S, 1);
    });
    post(S);
  }
  // foreground fists, pumping in sync (beat), jerking on HUH!; v = visibility
  function fgFists(ctx, S, v) {
    const F = CA.fistSil; if (!F) return;
    const pt = perfT(S.t), ph = pt / BEAT;
    const cs = crowdState(S, null);
    const list = [[150, 650, 0.62, -0.25, 0.0], [380, 700, 0.5, -0.08, 0.3], [FIST.x, 610, 0.72, 0.05, 0.12], [1150, 690, 0.58, 0.22, 0.45]];
    for (const [x, y, s, rot, off] of list) {
      const pump = pow(0.5 + 0.5 * cos(TAU * (ph + off * 0.2)), 2);
      const yy = y + 34 * pump * s - cs.jerk * 26 + cs.sag * 120;
      ctx.save(); ctx.translate(x, yy); ctx.rotate(rot); ctx.scale(s, s);
      ctx.globalAlpha = v;
      ctx.drawImage(F.c, -F.cx, -F.wy, F.w, F.h);
      ctx.restore();
      // the band glows UV
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      K().glow(ctx, x + sin(rot) * 0, yy + F.BW * 0.35 * s, F.BW * 0.5 * s, C.uv, 0.5 * v);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- shot: the wristband insert (65.5-67)
  function shotWrist(ctx, S) {
    const kit = K(), F = CA.fist, pt = perfT(S.t), ph = pt / BEAT;
    const t = S.t, k = clamp((t - tb(65.5)) / (tb(67) - tb(65.5)));
    const out = sstep(WRIST_HOLD[1], tb(67) - 0.06, t);             // the fist punches down and away after the hold
    const settle = 1 - E.outCubic(clamp((t - tb(65.5)) / 0.22));      // arriving from the push
    // background: the house seen from the stage, out of focus
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0614'); bg.addColorStop(0.55, '#140a22'); bg.addColorStop(1, '#05040a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const kick = isFinite(S.kick) && !frozen(t) ? exp(-S.kick * 8) : 0;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = NS.rng(6501);
    const b = floor(pt / BAR);
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = r() * H * 0.8, rad = 30 + r() * 90, col = STAGE_COLS[(i + b) % 4];
      const dx = 40 * sin(pt * 0.3 + i), a = (0.05 + r() * 0.12) * (1 + 0.6 * kick);
      kit.glow(ctx, x + dx, y, rad, col, a, 'flat');
    }
    // out-of-focus wristbands and phones in the crowd
    for (let i = 0; i < 40; i++) {
      const x = r() * W, y = 300 + r() * 420, rad = 10 + r() * 26;
      const bob = 14 * pow(0.5 + 0.5 * cos(TAU * (ph + r() * 0.1)), 2);
      kit.glow(ctx, x, y + bob, rad, r() < 0.85 ? C.uv : '#e8f4ff', 0.25 + r() * 0.25, 'flat');
    }
    // a beam crossing the haze
    kit.beam(ctx, -60, -40, 0.62 + 0.08 * sin(pt * 0.8), 0.16, 1500, STAGE_COLS[b % 4], 0.35, { motes: 18, t: pt, seed: 3 });
    ctx.restore();
    // defocused heads and raised arms (soft dark blobs), headbanging in sync
    const bl = CA.blob;
    const r2 = NS.rng(6502);
    for (let i = 0; i < 9; i++) {
      const x = r2() * 640 + (i > 5 ? 640 : 0), y = 420 + r2() * 220, s = 160 + r2() * 160;
      if (x > WRIST_RECT[0] - 80 && x < WRIST_RECT[0] + WRIST_RECT[2] + 60 && y < WRIST_RECT[1] + WRIST_RECT[3] + 80) continue;   // keep the clue clean
      const bang = pow(0.5 + 0.5 * cos(TAU * (ph + 0.03 * i)), 1.6);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(bl, x - s / 2, y - s * 0.4 + bang * 30, s, s);
      ctx.drawImage(bl, x - s * 0.9, y + s * 0.35 + bang * 12, s * 1.8, s * 1.2);
    }
    ctx.globalAlpha = 1;
    // a second fist, soft, at the left (gives depth, never crosses the clue)
    const SF = CA.fistSil;
    if (SF) {
      for (const [x, y, s, a, rot] of [[260, 520, 0.95, 0.75, -0.18], [500, 640, 0.7, 0.6, 0.1]]) {
        const pump = pow(0.5 + 0.5 * cos(TAU * ph), 2);
        ctx.save(); ctx.translate(x, y + pump * 22); ctx.rotate(rot); ctx.scale(s, s);
        for (const [ox, oy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) { ctx.globalAlpha = a * 0.3; ctx.drawImage(SF.c, -SF.cx + ox, -SF.wy + oy, SF.w, SF.h); }
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; kit.glow(ctx, x, y + pump * 22 + SF.BW * 0.35 * s, SF.BW * 0.7 * s, C.uv, 0.55); ctx.restore();
      }
    }
    // the hero fist: still during the hold (a 1.5-unit pulse), then punches down out of frame
    const pulse = 1.5 * sin(TAU * ph);
    const dy = settle * 60 + out * 900 + pulse, sc = 1 + settle * 0.12 + out * 0.25;
    ctx.save();
    ctx.translate(FIST.x, FIST.wy + dy); ctx.rotate(0.04 - out * 0.3); ctx.scale(sc, sc);
    ctx.drawImage(F.c, -F.cx, -F.wy, F.w, F.h);
    ctx.restore();
    // UV light spilling from the band onto the hand
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    kit.glow(ctx, FIST.x, FIST.wy + dy + F.BW * 0.05, F.BW * 0.9, C.uv, 0.32 * (1 - out));
    ctx.restore();
    // speed streaks as it punches away
    if (out > 0.02 && out < 0.98) kit.speedLines(ctx, S, { cx: FIST.x, cy: 200, k: out, seed: 5, color: '#e8d6ff', count: 18, inner: 260, outer: 900 });
    post(S, { bloom: 0.8 });
    S.post.ca = 0.1;
  }

  // ---------------------------------------------------------------- shot: the setlist insert (67-68.25)
  function shotSetlist(ctx, S) {
    const kit = K(), pt = perfT(S.t), ph = pt / BEAT, t = S.t;
    const cs = crowdState(S, null);
    ctx.drawImage(CA.floor, 0, 0, W, H);
    // the pit below the lip: UV glows and phones bobbing
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const r = NS.rng(6703);
    for (let i = 0; i < 18; i++) {
      const y = r() * H, x = 20 + r() * 120, bob = 10 * pow(0.5 + 0.5 * cos(TAU * (ph + r() * 0.1)), 2);
      kit.glow(ctx, x + bob, y, 16 + r() * 20, r() < 0.8 ? C.uv : '#e8f4ff', 0.35, 'flat');
    }
    // the footlight wash along the lip and a moving beam pool on the left boards
    ctx.save(); ctx.translate(200, H / 2); ctx.scale(0.35, 1.4); kit.glow(ctx, 0, 0, 420, '#ffcf8a', 0.32, 'soft'); ctx.restore();
    const px = 420 + 120 * sin(pt * 1.1), py = 300 + 200 * sin(pt * 0.7 + 1);
    ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.8); kit.glow(ctx, 0, 0, 200, STAGE_COLS[floor(pt / BAR) % 4], 0.22, 'flat'); ctx.restore();
    ctx.restore();
    // hands gripping the lip from the pit, fingers drumming in time; they jerk on HUH!
    lipHands(ctx, S, cs, ph);
    // the mic stand base, its cable
    micBase(ctx, 380, 300, pt);
    // Vex's boots enter from the bottom edge, tapping the beat
    boots(ctx, S, ph);
    // the setlist: still, flat-on, fully lit
    kit.setlist(ctx, SET.x, SET.y, SET.w, SET.h, { rot: SET.rot, seed: 3, char: 1, tape: true, light: 0.45, lightColor: '#fff0d8' });
    // dust jumping on the HUH! (left of the setlist only)
    if (cs.jerk > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const r3 = NS.rng(6704);
      for (let i = 0; i < 40; i++) { const x = 190 + r3() * 420, y = r3() * H; ctx.fillStyle = 'rgba(255,230,200,' + (0.5 * cs.jerk) + ')'; ctx.fillRect(x, y - cs.jerk * 6 * r3(), 2.2, 2.2); }
      ctx.restore();
    }
    post(S, { bloom: 0.6 });
    S.post.ca = 0.08; S.post.vignette = 0.5;
  }
  function lipHands(ctx, S, cs, ph) {
    for (let i = 0; i < 5; i++) {
      const y = 70 + i * 140 + (i % 2) * 18, tap = pow(max(0, cos(TAU * (ph * 2 + i * 0.25))), 6);
      const reach = cs.jerk * 18;
      handTop(ctx, 120 + reach, y, 1 + 0.04 * (i % 3), 0.06 * sin(i * 2.3), tap, i);
    }
  }
  // a zombie hand seen from above, gripping the lip edge (x = the knuckles over the lip)
  function handTop(ctx, x, y, s, rot, tap, seed) {
    const kit = K();
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    // wrist + UV band (in the pit, left)
    ctx.fillStyle = '#0d120b'; ctx.beginPath(); ctx.ellipse(-70, 0, 60, 26, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#16121c'; ctx.fillRect(-86, -27, 22, 54);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; kit.glow(ctx, -75, 0, 46, C.uv, 0.7, 'soft'); ctx.restore();
    ctx.fillStyle = C.uv; ctx.fillRect(-82, -24, 3, 48);
    // back of the hand
    const hg = ctx.createLinearGradient(0, -30, 0, 30); hg.addColorStop(0, '#9fb486'); hg.addColorStop(0.5, '#6e8a5a'); hg.addColorStop(1, '#2d3a24');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(-12, 0, 44, 30, 0, 0, TAU); ctx.fill();
    // fingers over the lip onto the boards
    for (let f = 0; f < 4; f++) {
      const fy = -21 + f * 14, lift = (f === seed % 4 ? tap : tap * 0.3) * 7;
      ctx.save(); ctx.translate(22, fy); ctx.rotate(0.05 * (f - 1.5));
      ctx.fillStyle = '#7d9468'; ctx.beginPath(); ctx.ellipse(18, 0, 26 - lift * 0.5, 6.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2a1e'; ctx.beginPath(); ctx.ellipse(38 - lift * 0.8, 0, 5, 4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // thumb
    ctx.fillStyle = '#6e8a5a'; ctx.beginPath(); ctx.ellipse(6, 30, 22, 7, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(143,191,90,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(-12, 0, 44, 30, 0, PI * 1.1, PI * 1.9); ctx.stroke();
    ctx.restore();
  }
  function micBase(ctx, x, y, pt) {
    ctx.save();
    // cable (snakes off the bottom-left)
    ctx.strokeStyle = '#08080a'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 40, y + 160, x - 160, y + 220, x - 100, y + 330); ctx.bezierCurveTo(x - 60, y + 400, x + 60, y + 380, x + 20, H + 20); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 2); ctx.bezierCurveTo(x + 43, y + 160, x - 157, y + 220, x - 97, y + 330); ctx.stroke();
    // tripod legs
    for (const a of [0.3, 2.4, 4.4]) {
      ctx.strokeStyle = '#121216'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cos(a) * 120, y + sin(a) * 120); ctx.stroke();
      ctx.strokeStyle = 'rgba(220,230,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 2, y - 3); ctx.lineTo(x + cos(a) * 118 + 2, y + sin(a) * 118 - 3); ctx.stroke();
      ctx.fillStyle = '#050506'; ctx.beginPath(); ctx.arc(x + cos(a) * 122, y + sin(a) * 122, 9, 0, TAU); ctx.fill();
    }
    // the shaft rising toward the lens (seen end-on) and the clutch
    ctx.fillStyle = '#1b1b20'; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
    const sg = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, 20); sg.addColorStop(0, '#d8dce6'); sg.addColorStop(0.4, '#5a5e68'); sg.addColorStop(1, '#16161a');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function boots(ctx, S, ph) {
    // two pointy black boots, toes toward the setlist, the right one tapping on every beat
    const tap = pow(max(0, cos(TAU * ph)), 4);
    const drawBoot = (x, y, a, lift) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(8, 10 + lift * 6, 70, 26, 0, 0, TAU); ctx.fill();   // shadow
      ctx.translate(0, -lift * 10); ctx.scale(1 + lift * 0.05, 1 + lift * 0.05);
      const bg = ctx.createLinearGradient(0, -22, 0, 22); bg.addColorStop(0, '#2c2a30'); bg.addColorStop(0.45, '#0b0a0d'); bg.addColorStop(1, '#030304');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(-80, -24); ctx.quadraticCurveTo(10, -26, 70, -6); ctx.quadraticCurveTo(96, 0, 70, 6); ctx.quadraticCurveTo(10, 26, -80, 24); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-60, -14); ctx.quadraticCurveTo(10, -16, 62, -4); ctx.stroke();
      // chrome buckle + red stitching (Vex)
      ctx.fillStyle = '#c8ccd6'; ctx.fillRect(-56, -20, 10, 40);
      ctx.strokeStyle = 'rgba(255,51,68,0.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(-40, 18); ctx.quadraticCurveTo(10, 20, 62, 5); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    };
    drawBoot(470, 676, -0.95, 0);
    drawBoot(585, 690, -1.25, tap);
    // the coat hem's shadow along the bottom edge
    const g = ctx.createLinearGradient(0, H - 70, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g; ctx.fillRect(380, H - 70, 260, 70);
  }

  // ---------------------------------------------------------------- shot: side-stage, over Granny's shoulder (68.25-70)
  function shotSide(ctx, S) {
    const kit = K(), t = S.t, pt = perfT(t), ph = pt / BEAT;
    const k = clamp((t - tb(68.25)) / (tb(70) - tb(68.25)));
    const hh = kit.handheld(S, 5, 41, 0.45);
    const cam = { rev: 1, side: 1, x: 640 + hh.x * 0.5, y: 360 + hh.y * 0.5, zoom: 1 };
    const PS = perfS(S);
    const o = stageOpts(S, cam, { pattern: 'fan' });
    // selfie choreography: the fan lifts the phone (68.25-68.5), Vex leans in and poses (68.4-68.6), the freeze snaps it
    const fanUp = E.outCubic(clamp((t - tb(68.25)) / 0.35));
    const lean = E.inOutQuad(clamp((t - tb(68.3)) / 0.4));
    const z = kickPunch(S) * (frozen(t) ? 1.0 : 1) * lerp(1.0, 1.06, k);
    const slam = (t >= F1 && t < F1 + 0.3) ? exp(-(t - F1) * 12) : 0;
    camWrap(ctx, S, z + 0.04 * slam * S.shakeK, 760, 520, () => {
      const info = kit.stageSet(ctx, PS, Object.assign({ pass: 'back' }, o));
      // crowd: all heads swivel to Vex on the freeze
      const vexHead = [790, 380];
      const cs = crowdState(S, vexHead);
      pit(ctx, S, info.pit, { cs, count: 230, seed: 68, lit: 0.25, phones: 0.08, fog: 0.5, jerkPx: 10 });
      crowdWash(ctx, S, 380, 620, 0.8);
      // the selfie fan at the barricade (a hero zombie), phone up; huh? at 275
      const fanX = 958, fanY = 640, fs = 0.82;
      const fp = kit.poses.phone(0);
      fp.nsh = lerp(1.2, 2.6, fanUp); fp.nel = lerp(1.4, 0.55, fanUp); fp.nas = 0.55; fp.turn = 0.55; fp.head = -0.25; fp.hyaw = -0.2;
      const huh = t >= HUH - 0.05 && t < F1 + 0.1 ? E.outBack(clamp((t - (HUH - 0.05)) / 0.18)) : 0;
      fp.hroll = -0.35 * huh; fp.mouth = frozen(t) ? 0.55 : 0.35; fp.hyaw = lerp(-0.2, 0.25, huh);
      if (!frozen(t)) { const bang = pow(0.5 + 0.5 * cos(TAU * ph), 1.6); fp.head += 0.25 * bang; fp.torso = 0.06 + 0.1 * bang; }
      const fa = kit.zombie(ctx, 7, fp, { x: fanX, y: fanY, s: fs, face: -1, t: pt, rim: { color: C.zombieRim, dir: -PI / 2 - 0.6, k: 1.2 }, rim2: { color: '#cfe6ff', dir: PI, k: 0.6 }, lit: 0.4, prop: 'phone' });
      kit.stageSet(ctx, PS, Object.assign({ pass: 'frame' }, o));
      // the band: Noodle and Tiny further back, Vex leaning to the fan, Granny huge in the foreground
      const tk = 0;
      const nos = kit.poses.bass(ph); nos.turn = 0.5;
      kit.survivor(ctx, 'noodle', nos, { x: 1150, y: 560, s: 0.66, face: 1, t: pt, rim: { color: rimFor(S), dir: -PI / 2 - 0.4, k: 1.2 }, lit: 0.45, accent: 0.8 });
      // Vex: sings, then leans in for the selfie
      const vs = kit.blendPose(kit.poses.sing(ph), kit.poses.selfie(1), lean);
      vs.torso = (vs.torso || 0) + 0.32 * lean; vs.tilt = 0.16 * lean; vs.turn = lerp(0.45, 0.75, lean); vs.hyaw = 0.25 * lean;
      if (lean > 0.5) vs.expr = 'smug';
      const va = kit.survivor(ctx, 'vex', vs, { x: 800, y: 616, s: 0.98, face: 1, t: pt, rim: { color: rimFor(S), dir: -PI / 2 - 0.5, k: 1.3 }, rim2: { color: '#e8f4ff', dir: 0.2, k: 0.7 }, lit: 0.55, accent: 0.9, prop: lean > 0.5 ? 'none' : undefined });
      S.anchor('VEX', va.head[0], va.head[1], ctx);
      // the phone glow lights both faces; the shutter fires on the freeze
      const ph0 = fa.phone || [fanX - 40, fanY - 280];
      const shutter = t >= F0 && t < F0 + 0.12 ? 1 - (t - F0) / 0.12 : 0;
      kit.phoneGlow(ctx, ph0[0], ph0[1], 0.85 + 0.15 * shutter, { s: 1.4, rot: 0.25, face: [ph0[0] - 60, ph0[1] + 30] });
      if (shutter > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; kit.glow(ctx, ph0[0], ph0[1], 90, '#ffffff', 0.6 * shutter * S.flashK, 'hot'); ctx.restore(); }
      // Granny, foreground left, over-the-shoulder
      const gs = kit.poses.guitar(ph); gs.turn = 0.3; gs.hyaw = 0.2;
      const ga = kit.survivor(ctx, 'granny', gs, { x: 260, y: 880, s: 1.75, face: 1, t: pt, rim: { color: rimFor(S), dir: -0.35, k: 1.4 }, rim2: { color: '#ffcf8a', dir: -PI / 2, k: 0.4 }, lit: 0.3, accent: 0.9 });
      kit.stageSet(ctx, PS, Object.assign({ pass: 'fx' }, o));
      // huh? — a tiny pale question in the air over the fan (diegetic onomatopoeia stays small)
      if (huh > 0.05) kit.onomatopoeia(ctx, 'HUH?', fanX + 30, fanY - 340, { size: 46, color: '#d8f0b0', rot: 0.12, k: clamp(0.05 + (t - HUH) / 0.9), burst: false, seed: 4 });
    });
    post(S);
    if (frozen(t)) { S.post.ca = 0.35; S.post.vignette = 0.75; }
  }

  // ---------------------------------------------------------------- shot: Tiny's drummer cam (70-72), the tape stop
  function shotDrum(ctx, S) {
    const kit = K(), t = S.t, pt = perfT(t), ph = pt / BEAT, tk = tapeK(t);
    const k = clamp((t - tb(70)) / (2 * BAR));
    const cam = { rev: 1, x: 640, y: 360, zoom: 1 };
    const PS = perfS(S);
    const o = stageOpts(S, cam, { pattern: 'fan' });
    const z = kickPunch(S) * lerp(1.0, 1.05, E.inOutQuad(k));
    camWrap(ctx, S, z, 700, 420, () => {
      const info = kit.stageSet(ctx, PS, Object.assign({ pass: 'back' }, o));
      const cs = crowdState(S, [640, 330]);
      pit(ctx, S, info.pit, { cs, count: 300, seed: 70, lit: 0.25, phones: 0.12, fog: 0.55, density: 1.1 });
      crowdWash(ctx, S, 400, 640, 0.9);
      kit.stageSet(ctx, PS, Object.assign({ pass: 'frame' }, o));
      // Granny and Noodle at the lip, backs to us (silhouettes, rim from the house wash)
      const rim = { color: rimFor(S), dir: -PI / 2 - 0.2, k: 1.4 * (1 - tk * 0.6) };
      const gp = sag(kit.poses.guitar(ph), tk); gp.turn = 0.08;
      kit.survivor(ctx, 'granny', gp, { x: 330, y: 652, s: 1.02, face: -1, t: pt, rim, lit: 0.12, accent: 0.8 });
      const np = sag(kit.poses.bass(ph), tk); np.turn = 0.08;
      kit.survivor(ctx, 'noodle', np, { x: 980, y: 652, s: 1.02, face: 1, t: pt, rim, lit: 0.12, accent: 0.8, lamp: 0.7 });
      // Vex: sings to the house, then turns back to the band to brag (70.25-70.5), smug
      const turnK = E.inOutCubic(clamp((t - tb(70.25)) / 0.32)) * (1 - 0.0 * tk);
      const vp = kit.blendPose(kit.poses.sing(ph), Object.assign(kit.poses.point(0.6), { expr: 'smug', mouth: 0.3 }), turnK);
      vp.turn = lerp(0.12, 0.82, turnK); vp.hyaw = 0.35 * turnK; vp.head = lerp(vp.head || 0, -0.12, turnK);
      vp.nsh = lerp(vp.nsh || 0, -1.25, turnK); vp.nel = lerp(vp.nel || 0, 1.6, turnK); vp.nhand = turnK > 0.5 ? 'thumb' : vp.nhand;   // thumb over the shoulder at the crowd
      sag(vp, tk);
      const va = kit.survivor(ctx, 'vex', vp, { x: 650, y: 612, s: 0.98, face: -1, t: pt, rim, rim2: { color: '#ffd9b0', dir: PI / 2 + 0.3, k: 0.6 * (1 - tk) }, lit: lerp(0.12, 0.62, turnK) * (1 - tk * 0.7), accent: 0.9, expression: turnK > 0.5 ? 'smug' : undefined });
      S.anchor('VEX', va.head[0], va.head[1], ctx);
      // Tiny, foreground left, profile toward the house; the kit (back view) around him
      const dk = kit.drumKit(ctx, 300, 790, 1.05, { view: 'back', S: PS });
      const tp = sag(kit.poses.drums(ph * 0.5, 1), tk); tp.turn = 0.05;
      const ta = kit.survivor(ctx, 'tiny', tp, { x: 170, y: 900, s: 1.45, face: 1, t: pt, rim: { color: rimFor(S), dir: -0.3, k: 1.3 * (1 - tk * 0.5) }, rim2: { color: '#ffcf8a', dir: -PI / 2, k: 0.4 }, lit: 0.2, accent: 0.9 });
      S.anchor('TINY', ta.head[0], ta.head[1], ctx);
      kit.stageSet(ctx, PS, Object.assign({ pass: 'fx' }, o));
    });
    post(S);
  }

  // ---------------------------------------------------------------- layout (pure, cheap)
  function layout(S) {
    const sh = shotAt(S.bar)[1];
    switch (sh) {
      case 'wide': return { lyricZone: 'top', keepOut: [[420, 200, 500, 300]] };
      case 'low': return { lyricZone: 'top', keepOut: [[440, 160, 420, 360]] };
      case 'wrist': return { lyricZone: 'top', keepOut: [] };
      case 'setlist': return { lyricZone: 'top', keepOut: [[360, 560, 280, 160]] };
      case 'side': return { lyricZone: 'top', keepOut: [[700, 300, 360, 340]] };
      case 'drum': return { lyricZone: 'top', keepOut: [[520, 260, 260, 360]] };
    }
    return { lyricZone: 'top', keepOut: [] };
  }

  // ---------------------------------------------------------------- the shot
  NS.shot('stage', {
    init(env) {
      if (env && env.makeCanvas) { MK = (w, h) => env.makeCanvas(w, h, 'stage'); FREE = env.freeCanvas || FREE; }
    },
    warm(env) {
      if (env && env.makeCanvas) { MK = (w, h) => env.makeCanvas(w, h, 'stage'); FREE = env.freeCanvas || FREE; }
      ensure();
      const kit = K();
      if (kit.worldWarm) kit.worldWarm(['stage', 'house', 'fx']);
      if (kit.horde && kit.horde.warm) {
        kit.horde.warm(['headbang'], { light: HL, lit: 0, view: 'front' });
        kit.horde.warm(['headbang'], { light: HL, lit: 0, view: 'front', look: true });
        kit.horde.warm(['headbang'], { light: HL, lit: 0.25, view: 'front' });
        kit.horde.warm(['headbang'], { light: HL, lit: 0.25, view: 'front', look: true });
      }
    },
    // free only this shot's own canvases: the stage/house world caches and horde atlases are shared with the blackout
    // and generator shots that follow (kit.horde.release() / worldRelease('stage:') would make them rebuild mid-cue)
    release() { freeAll(); },
    layout,
    draw(ctx, S) {
      ensure();
      const sh = shotAt(S.bar)[1];
      if (sh === 'wide') shotWide(ctx, S);
      else if (sh === 'low') shotLow(ctx, S);
      else if (sh === 'wrist') shotWrist(ctx, S);
      else if (sh === 'setlist') shotSetlist(ctx, S);
      else if (sh === 'side') shotSide(ctx, S);
      else shotDrum(ctx, S);
    },
  });
})();
