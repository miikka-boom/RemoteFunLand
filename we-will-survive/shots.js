/* We Will Survive. Right? — the shots.
   Each shot draws one stretch of the score for time t (seconds) and bar (t / BAR), and returns the
   post effects it wants: { flash: [r, g, b, a], fade, vig, grain }. World units: people are about
   175 tall, the ground of the action plane is y = 0 and up is negative. */
(function () {
'use strict';
const S = WWS.score, G = WWS.G;
const { BAR, BEAT, q } = S;
const { clamp, lerp, smooth, easeOut, easeIn, easeInOut, inv, hash, noise, TAU } = G;
const T = (bar) => bar * BAR;
const INK = G.INK;
const shots = (WWS.shots = {});

/* ---------------- shared ---------------- */
const SHOT_T = S.GUNSHOTS.map((g) => T(g[0]));
const gunsIn = (a, b) => S.GUNSHOTS.filter((g) => g[0] >= a && g[0] < b);
// flash strength from the shots fired so far
const flashK = (t, list, tau = 0.075) => G.pulse(t, list.map((g) => T(g[0])), tau, 1.4);
// the pump: 0 → 1 → 0 an eighth after each shot
function pumpAt(t, list) {
  let p = 0;
  for (const g of list) { const d = t - (T(g[0]) + BEAT / 2); if (d >= 0 && d < 0.28) p = Math.max(p, Math.sin(d / 0.28 * Math.PI)); }
  return p;
}
function recoilAt(t, list) { let r = 0; for (const g of list) { const d = t - T(g[0]); if (d >= 0 && d < 0.5) r = Math.max(r, Math.exp(-d / 0.09)); } return r; }
// a rim of moonlight (or fire) on a silhouette: an offset copy, a couple of pixels whatever the zoom
const rim = (col, dx = 2.5, dy = -1.5) => {
  const v = G.cur, px = v ? Math.max(1.3, 2.4 * Math.min(v.W, v.H) / 1080) / v.s : 1, n = Math.hypot(dx, dy) || 1;
  return [col, dx / n * px, dy / n * px];
};
// world-space ground fog, stars etc. take a layer rect `r`
function dark(ctx, v, a) { if (a <= 0.003) return; G.screen(ctx); ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`; ctx.fillRect(0, 0, v.W, v.H); }
function tint(ctx, v, col, a, op = 'source-over') { if (a <= 0.003) return; G.screen(ctx); const pc = ctx.globalCompositeOperation; ctx.globalCompositeOperation = op; ctx.fillStyle = G.rgba(col, a); ctx.fillRect(0, 0, v.W, v.H); ctx.globalCompositeOperation = pc; }
// the friend holding the shotgun: pose helper. aim: angle (local, 0 = forward, negative = up)
function friendGun(base, aim, pump, recoil) {
  const P = Object.assign({}, base);
  const ang = aim - recoil * 0.32;
  P.lean = (P.lean || 0.05) - recoil * 0.1;
  P.hands = G.gunHands(P, ang, pump);
  P.gun = { ang, pump };
  return P;
}
// your flashlight: the hand reaches along `ang` (local)
function youLight(base, ang, reach = 46) {
  const P = Object.assign({}, base), sh = G.shoulder(P);
  P.hands = [P.hands ? P.hands[0] : [sh[0] - 4, sh[1] + 52], [sh[0] + Math.cos(ang) * reach, sh[1] + Math.sin(ang) * reach]];
  P.light = ang;
  return P;
}
// a world-space beam from a figure's light hand, ang in world terms (face applied)
function lightBeam(ctx, info, face, ang, len, a, col = [255, 238, 200]) {
  const wa = face > 0 ? ang : Math.PI - ang;
  const x = info.hand[0] + Math.cos(wa) * 16, y = info.hand[1] + Math.sin(wa) * 16;
  G.beam(ctx, x, y, wa, len, 0.26, col, a);
}
// zombies rising from graves: emergence over ~2.6 s after `t0`
function risen(ctx, z, t, groundY, col, rimC) {
  const d = t - z.t0;
  if (d < 0) return;
  const s = z.s || 1;
  let bury, pose;
  if (d < 0.9) {   // a hand, then an arm
    const u = d / 0.9;
    bury = lerp(250, 150, easeOut(u));
    pose = { pel: 86, lean: 0.1, head: 0.2, feet: [[6, 0], [-6, 0]], hands: [[0, -50], [8 + Math.sin(d * 18) * 6, -226 + Math.sin(d * 13) * 8]] };
  } else if (d < 2.4) {   // head and shoulders, clawing out
    const u = (d - 0.9) / 1.5;
    bury = lerp(150, 0, easeInOut(u));
    pose = { pel: lerp(70, 84, u), lean: lerp(0.55, 0.35, u), head: 0.4, feet: [[10, 0], [-10, 0]], hands: [[lerp(50, 44, u), lerp(-100, -112, u) + Math.sin(d * 9) * 10], [lerp(60, 50, u), lerp(-70, -118, u)]] };
  } else {
    bury = 0;
    const ph = (d - 2.4) * 0.55 + (z.seed || 0);
    pose = G.pose.shamble(ph, z.seed || 0);
    pose.feet = pose.feet.map((f) => [f[0] * 0.4, f[1] * 0.4]);
  }
  const x = z.x + (d > 2.4 ? -z.face * Math.min(z.walk || 0, (d - 2.4) * 22) : 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 400 * s, groundY - 600 * s, 800 * s, 600 * s + 2); ctx.clip();
  G.human(ctx, Object.assign({ x, y: groundY + bury * s, s, face: z.face, kind: 'zombie', col, rim: rimC }, pose));
  ctx.restore();
  // the dirt
  G.sparks(ctx, z.x + 8 * z.face * s, groundY - 4, d, 26, z.seed * 13 + 1, { life: 0.9, g: 900, speed: 420 * s, dir: -Math.PI / 2, spread: 1.5, col: [30, 26, 24], add: false, size: 5 * s });
}

/* ---------------- the night: shared backgrounds ---------------- */
const SKY_NIGHT = [[-1500, '#020309'], [-800, '#060a1b'], [-260, '#121937'], [-40, '#1c2447'], [200, '#1c2447']];
function graveyardBG(ctx, v, t, o = {}) {
  let r = G.layer(ctx, v, 0.04, 0.12);
  G.sky(ctx, r, o.sky || SKY_NIGHT);
  G.stars(ctx, r, t, -1500, -150, 0.85, 3600);
  r = G.layer(ctx, v, 0.06, 0.14);
  G.moon(ctx, o.moonX === undefined ? -520 : o.moonX, o.moonY === undefined ? -640 : o.moonY, 62, [232, 230, 214], 1);
  G.clouds(ctx, r, t, -920, -480, [8, 11, 26], 0.75, 12, 3);
  r = G.layer(ctx, v, 0.2, 0.3);
  const fh = G.hills(11, -90, 120, 0.0014);
  G.land(ctx, r, fh, [17, 22, 46]);
  // the chapel, far away (St. Agatha's)
  ctx.fillStyle = G.rgb([17, 22, 46]);
  ctx.save(); ctx.translate(1350, fh(1350) + 6); ctx.scale(0.35, 0.35); chapelShape(ctx, false); ctx.restore();
  r = G.layer(ctx, v, 0.34, 0.42);
  const ph = G.hills(12, -40, 50, 0.002);
  G.treeRow(ctx, r, ph, 'pine', [12, 16, 34], 110, 210, 60, 5);
  G.land(ctx, r, ph, [12, 16, 34]);
  // far tombstones
  r = G.layer(ctx, v, 0.55, 0.65);
  const gy = (x) => -26 + 10 * Math.sin(x * 0.003);
  G.land(ctx, r, gy, [14, 18, 38]);
  for (let i = Math.floor(r.x0 / 70); i < r.x1 / 70; i++) { if (hash(i * 3.3) < 0.35) continue; const x = i * 70 + hash(i) * 40; G.stone(ctx, x, gy(x) + 4, 34 + hash(i * 5) * 26, (i * 7) % 5, (hash(i * 9) - 0.5) * 0.2, [14, 18, 38]); }
  r = G.layer(ctx, v, 0.75, 0.82);
  const my = (x) => -12 + 8 * Math.sin(x * 0.004 + 1);
  G.fog(ctx, r, -120, -20, [52, 66, 110], 0.3, t, 14, 7);
  G.land(ctx, r, my, [9, 12, 27]);
  for (let i = Math.floor(r.x0 / 120); i < r.x1 / 120; i++) { if (hash(i * 4.4 + 1) < 0.3) continue; const x = i * 120 + hash(i + 3) * 60; G.stone(ctx, x, my(x) + 6, 60 + hash(i * 6) * 40, (i * 3) % 5, (hash(i * 2) - 0.5) * 0.25, [9, 12, 27]); }
  // the big dead tree
  r = G.layer(ctx, v, 0.92, 0.95);
  G.drawPath(ctx, G.bareTree(31, 1.15), o.treeX === undefined ? -760 : o.treeX, 10, 820, [5, 6, 13]);
  return r;
}
function graveyardFront(ctx, v, t, clear) {
  const r = G.layer(ctx, v, 1);
  const gy = (x) => 8 * Math.sin(x * 0.0021);
  G.land(ctx, r, gy, INK);
  for (let i = Math.floor(r.x0 / 260); i < r.x1 / 260; i++) {
    if (hash(i * 5.7 + 2) < 0.55) continue;
    const x = i * 260 + hash(i + 9) * 90;
    if (clear && x > clear[0] && x < clear[1]) continue;
    G.stone(ctx, x, gy(x) + 30, 120 + hash(i * 6) * 30, (i * 5 + 1) % 5, (hash(i * 3) - 0.5) * 0.18, INK);
  }
  G.fog(ctx, r, -60, 30, [60, 76, 124], 0.22, t, 22, 9);
  return r;
}
function chapelShape(ctx, windows) {
  ctx.beginPath();
  ctx.moveTo(-260, 0); ctx.lineTo(-260, -190); ctx.lineTo(-90, -330); ctx.lineTo(80, -190); ctx.lineTo(80, 0); ctx.closePath();
  ctx.rect(60, -330, 110, 330);
  ctx.moveTo(50, -330); ctx.lineTo(115, -520); ctx.lineTo(180, -330); ctx.closePath();
  ctx.moveTo(112, -520); ctx.lineTo(112, -590); ctx.lineTo(118, -590); ctx.lineTo(118, -520);
  ctx.rect(96, -575, 38, 7);
  ctx.fill();
}

/* =====================================================================
   1. The road (bars 0-8): walking to the cemetery gate
   ===================================================================== */
const GATE_X = 1240;
function gate(ctx, x, y, open, col) {
  ctx.fillStyle = G.rgb(col); ctx.strokeStyle = G.rgb(col);
  for (const px of [-120, 82]) { ctx.fillRect(x + px, y - 230, 38, 230); ctx.fillRect(x + px - 6, y - 244, 50, 16); ctx.beginPath(); ctx.arc(x + px + 19, y - 258, 15, 0, TAU); ctx.fill(); }
  // the iron arch and its letters
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 82, y - 214); ctx.quadraticCurveTo(x, y - 330, x + 82, y - 214); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 82, y - 196); ctx.quadraticCurveTo(x, y - 300, x + 82, y - 196); ctx.stroke();
  ctx.font = '600 24px "Special Elite", "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('CEMETERY', x, y - 262);
  // the leaves: bars with spear tops, swinging open (they foreshorten towards the posts)
  const leaf = (x0, dir) => {
    const w = 80 * Math.cos(open * 1.25), n = 6;
    ctx.lineWidth = 3.2; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const bx = x0 + dir * w * i / n; ctx.moveTo(bx, y - 2); ctx.lineTo(bx, y - 196 + Math.abs(i - n / 2) * 4); }
    ctx.moveTo(x0, y - 40); ctx.lineTo(x0 + dir * w, y - 40); ctx.moveTo(x0, y - 150); ctx.lineTo(x0 + dir * w, y - 150);
    ctx.stroke();
  };
  leaf(x - 82, 1); leaf(x + 82, -1);
}
shots.road = function (ctx, W, H, t, bar, env) {
  const stopT = T(4);
  const walkT = Math.min(t, stopT);
  const fX = 80 + walkT * 140, yX = -20 + walkT * 140;
  const ph = t / (2 * BEAT);
  // camera: track the pair, then settle on the gate and crane up over the wall
  const track = { x: (fX + yX) / 2 + 160, y: -270, w: lerp(1500, 1300, clamp(bar / 4)) };
  const gateCam = G.camPath([[3, GATE_X - 40, -280, 1300], [6, GATE_X, -300, 1200], [7.2, GATE_X, -330, 1180], [8, GATE_X + 20, -470, 1320]], bar);
  const k = smooth((bar - 2.6) / 1.6);
  const cam = { x: lerp(track.x, gateCam.x, k), y: lerp(track.y, gateCam.y, k), w: lerp(track.w, gateCam.w, k), wmin: 0.6 };
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.04, 0.12);
  G.sky(ctx, r, SKY_NIGHT);
  G.stars(ctx, r, t, -1500, -150, 0.9, 3600);
  r = G.layer(ctx, v, 0.07, 0.14);
  const cloudOver = 0.35 + 0.35 * Math.sin(t * 0.18 + 1);
  G.moon(ctx, 430, -560, 72, [234, 231, 214], 1, 0);
  G.clouds(ctx, r, t, -920, -470, [8, 11, 26], 0.7 * cloudOver + 0.25, 16, 4);
  r = G.layer(ctx, v, 0.2, 0.3);
  const fh = G.hills(3, -110, 140, 0.0016);
  G.land(ctx, r, fh, [16, 22, 46]);
  r = G.layer(ctx, v, 0.36, 0.45);
  const ph2 = G.hills(4, -50, 60, 0.002);
  G.treeRow(ctx, r, ph2, 'pine', [11, 15, 33], 120, 230, 66, 5);
  G.land(ctx, r, ph2, [11, 15, 33]);
  r = G.layer(ctx, v, 0.62, 0.7);
  G.treeRow(ctx, r, () => -20, 'bare', [8, 10, 22], 260, 430, 250, 7);
  G.land(ctx, r, () => -20, [8, 10, 22]);
  // the action plane
  r = G.layer(ctx, v, 1);
  G.fog(ctx, r, -110, -30, [56, 70, 116], 0.2, t, 16, 3);
  // the cemetery wall with stones peeking over it, then the gate
  const wallY = -44;
  ctx.fillStyle = G.rgb([10, 12, 24]);
  for (let i = 0; i < 30; i++) { const x = GATE_X + 230 + i * 95 + hash(i) * 40; G.stone(ctx, x, wallY - 60, 70 + hash(i * 3) * 40, i % 5, (hash(i * 5) - 0.5) * 0.25, [10, 12, 24]); }
  for (let i = 0; i < 26; i++) { const x = GATE_X - 260 - i * 110 - hash(i * 7) * 50; G.stone(ctx, x, wallY - 60, 60 + hash(i * 4) * 40, (i + 2) % 5, (hash(i * 6) - 0.5) * 0.25, [10, 12, 24]); }
  ctx.fillStyle = G.rgb([9, 11, 22]);
  ctx.fillRect(r.x0, wallY - 72, GATE_X - 120 - r.x0, 72); ctx.fillRect(GATE_X + 120, wallY - 72, r.x1 - GATE_X, 72);
  ctx.fillRect(r.x0, wallY - 80, GATE_X - 116 - r.x0, 10); ctx.fillRect(GATE_X + 116, wallY - 80, r.x1 - GATE_X, 10);
  const openK = smooth((bar - 4.15) / 0.6);
  // through the gate: the path and fog beyond
  G.fog(ctx, r, wallY - 90, wallY - 10, [70, 86, 140], 0.25 + openK * 0.15, t, 10, 8, 0.6);
  // walkers
  const youCol = INK, rimC = rim([56, 72, 128], 2.4, -1.6);
  const figs = [];
  // before the gate: side view walking; after bar 4.5: back view walking into the gate
  const intoK = (b0) => clamp((bar - b0) / 3);
  const fIn = intoK(4.6), yIn = intoK(5.1);
  const drawWalker = (who, x, phase, inK) => {
    if (inK <= 0) {
      const moving = t < stopT;
      const base = moving ? G.pose.walk(phase) : G.pose.stand(t, who === 'friend' ? 1 : 2);
      let P = Object.assign({ x, y: 0, s: who === 'friend' ? 1.04 : 0.96, face: 1, kind: who, rim: rimC, col: youCol }, base);
      if (who === 'friend') P = friendGun(P, 0.75, 0, 0);
      else P = youLight(P, 0.42 + Math.sin(t * 1.3) * 0.06);
      if (who === 'friend' && bar >= 4 && bar < 4.7) { // reach for the gate
        const u = smooth((bar - 4) / 0.4);
        P = friendGun(P, lerp(0.75, 1.2, u), 0, 0);
      }
      const info = G.human(ctx, P);
      if (who === 'you') lightBeam(ctx, info, 1, 0.42 + Math.sin(t * 1.3) * 0.06, 560, 0.2);
    } else {
      const e = easeInOut(inK), sc = lerp(1, 0.72, e) * (who === 'friend' ? 1.04 : 0.96);
      const bx = lerp(x, GATE_X + (who === 'friend' ? 22 : -26), e), by = lerp(0, wallY - 70, e);
      const stepPh = (t / BEAT) * Math.PI;
      G.backView(ctx, bx, by, sc, who, { col: INK, sway: Math.sin(stepPh) * 2.2, walk: 1, step: stepPh });
      if (who === 'you') G.beam(ctx, bx + 28 * sc, by - 92 * sc, -Math.PI / 2 + 0.05, 420 * sc, 0.25, [255, 238, 200], 0.14 * (1 - e * 0.5));
    }
  };
  const behind = (k) => k > 0.42;
  if (behind(fIn)) drawWalker('friend', fX, ph + 0.25, fIn);
  if (behind(yIn)) drawWalker('you', yX, ph, yIn);
  gate(ctx, GATE_X, wallY, openK, [8, 9, 18]);
  if (!behind(yIn)) drawWalker('you', yX, ph, yIn);
  if (!behind(fIn)) drawWalker('friend', fX, ph + 0.25, fIn);
  // the road and fence posts
  G.land(ctx, r, (x) => 6 + 3 * Math.sin(x * 0.01), [6, 7, 13]);
  ctx.fillStyle = 'rgba(40,46,66,0.35)';
  ctx.fillRect(r.x0, 6, r.x1 - r.x0, 4);
  ctx.fillStyle = G.rgb(INK);
  for (let i = Math.floor(r.x0 / 230); i < Math.min(r.x1, GATE_X - 160) / 230; i++) { const x = i * 230 + hash(i) * 40; ctx.save(); ctx.translate(x, 8); ctx.rotate((hash(i * 3) - 0.5) * 0.15); ctx.fillRect(-6, -96, 12, 104); ctx.restore(); }
  // the sign
  ctx.save(); ctx.translate(420, 30); ctx.rotate(-0.06); ctx.fillStyle = G.rgb(INK); ctx.fillRect(-5, -200, 10, 200);
  ctx.fillRect(-70, -205, 140, 44); ctx.fillStyle = 'rgba(70,82,120,0.55)'; ctx.font = '600 22px "Special Elite", monospace'; ctx.textAlign = 'center'; ctx.fillText('QUARRY RD', 0, -176); ctx.restore();
  // the foreground: grass
  r = G.layer(ctx, v, 1.3, 1.1);
  G.grass(ctx, r, () => 150, INK, 90, 16, 3, t, 0.08);
  return { vig: 1 };
};

/* =====================================================================
   2. The graveyard (bars 8-16): something under the ground
   ===================================================================== */
const RISERS = [
  { t0: T(q(10, 1)), x: 230, face: -1, s: 1.02, seed: 1, walk: 60 },
  { t0: T(q(11, 1)), x: -640, face: 1, s: 0.98, seed: 2, walk: 40 },
  { t0: T(q(11, 3)), x: 560, face: -1, s: 1.05, seed: 3, walk: 50 },
  { t0: T(q(12, 1)), x: -330, face: 1, s: 0.8, seed: 4, layer: 1 },
  { t0: T(q(12, 3.5)), x: 820, face: -1, s: 1.0, seed: 5, walk: 40 },
  { t0: T(q(13, 1)), x: -930, face: 1, s: 1.0, seed: 6, walk: 50 },
  { t0: T(q(13, 2.5)), x: 380, face: -1, s: 0.78, seed: 7, layer: 1 },
  { t0: T(q(13, 4)), x: -520, face: 1, s: 0.8, seed: 8, layer: 1 },
];
shots.graveyard = function (ctx, W, H, t, bar, env) {
  // the friends: walk in, stop, startle, back away
  const walkU = clamp((bar - 8) / 1.6);
  const back = smooth((bar - 12) / 2) * 60;
  const fX = lerp(-820, -170, easeOut(walkU)) - back, yX = lerp(-920, -270, easeOut(walkU)) - back;
  const moving = bar < 9.6;
  const ph = t / (2 * BEAT) * 0.8;
  const close = bar >= 14;   // the medium shot of the friend
  const punch = Math.exp(-Math.max(0, t - T(10)) / 0.35) * (t >= T(10) ? 1 : 0);
  let cam;
  if (!close) {
    cam = G.camPath([[8, -480, -260, 1500], [9.8, -150, -250, 1400], [10, -60, -250, 1350], [12, 0, -270, 1650], [14, 0, -300, 2050]], bar);
    cam.w *= 1 - punch * 0.12; cam.x += punch * 40;
  } else {
    cam = { x: fX + 60, y: -120, w: lerp(640, 560, smooth((bar - 14) / 1.5)) };
  }
  cam.wmin = 0.62;
  const sh = G.shake(t, [[T(10), 0.5], [T(q(11, 1)), 0.2], [T(q(12, 1)), 0.15], [T(q(13, 1)), 0.2]], env.still);
  Object.assign(cam, sh);
  const v = G.view(W, H, cam);
  graveyardBG(ctx, v, t);
  // zombies in the middle distance rise behind
  let r = G.layer(ctx, v, 0.9, 0.93);
  for (const z of RISERS) if (z.layer) risen(ctx, Object.assign({}, z, { x: z.x }), t, -8, [8, 10, 22], rim([40, 56, 86], 2, -1));
  r = G.layer(ctx, v, 1);
  const rimC = rim([60, 76, 130], 2.6, -1.6);
  // the friends
  const lightOn = !(bar >= 15.5) ;
  const startle = bar >= 10;
  const aimT = smooth((bar - 10) / 0.3);
  const pumpK = (() => { const d = t - T(q(14, 3)); return d >= 0 && d < 0.32 ? Math.sin(d / 0.32 * Math.PI) : 0; })();
  let fP = Object.assign({ x: fX, y: 0, s: 1.04, face: 1, kind: 'friend', rim: rimC }, moving ? G.pose.walk(ph) : G.pose.stand(t, 1));
  if (bar >= 8.6 && bar < 10) fP.head = -0.25 * smooth((bar - 8.6) / 0.3);
  fP = friendGun(fP, lerp(0.8, -0.05 + Math.sin(t * 2) * 0.03, aimT), close ? pumpK : 0, 0);
  if (bar >= 12) fP.face = Math.sin(t * 0.9) > 0.6 ? -1 : 1;   // glancing back at the ones behind
  let yP = Object.assign({ x: yX, y: 0, s: 0.96, face: 1, kind: 'you', rim: rimC }, moving ? G.pose.walk(ph + 0.25) : G.pose.stand(t, 2));
  const sweep = bar < 10 ? 0.35 + Math.sin(t * 1.1) * 0.25 : lerp(0.35, 0.05, aimT) + Math.sin(t * 7) * 0.02;
  yP = youLight(yP, sweep);
  if (bar >= 12.5) yP.face = Math.sin(t * 0.7 + 1) > 0.3 ? -1 : 1;
  const yInfo = G.human(ctx, yP);
  if (lightOn) lightBeam(ctx, yInfo, yP.face, sweep, 640, 0.22);
  G.human(ctx, fP);
  // the zombies in front
  for (const z of RISERS) if (!z.layer) risen(ctx, z, t, 4, INK, rim([46, 64, 100], 2.2, -1.4));
  graveyardFront(ctx, v, t);
  // the flashlight dies: 15:3, flicker, 15:3.5 out
  const flick = bar >= 15.5 ? (bar < 15.56 ? 0.95 : bar < 15.62 ? 0.4 : 0.97) : 0;
  dark(ctx, v, flick);
  return { vig: 1, flash: punch > 0.01 ? [140, 150, 190, punch * 0.12] : null };
};

/* =====================================================================
   3. The fight (bars 16-24): back to back
   ===================================================================== */
const FIGHT_Z = [
  { tag: 'r1', side: 1, x0: 560, v: 46, s: 1.02, seed: 1 },
  { tag: 'r2', side: 1, x0: 820, v: 50, s: 0.98, seed: 2 },
  { tag: 'r3', side: 1, x0: 1100, v: 52, s: 1.06, seed: 3 },
  { tag: 'r4', side: 1, x0: 1400, v: 60, s: 0.96, seed: 4 },
  { tag: 'l1', side: -1, x0: -470, v: 44, s: 1.0, seed: 5 },
  { tag: 'l2', side: -1, x0: -720, v: 50, s: 1.04, seed: 6 },
  { tag: 'l3', side: -1, x0: -980, v: 56, s: 0.97, seed: 7 },
  { tag: 'l4', side: -1, x0: -1300, v: 60, s: 1.0, seed: 8 },
];
for (const z of FIGHT_Z) {
  z.hits = [];
  for (const g of S.GUNSHOTS) if (g[2] === z.tag) z.hits.push([T(g[0]), 'shot']);
  for (const w of S.WHACKS) if (w[1] === z.tag) z.hits.push([T(w[0]), 'whack']);
  z.hits.sort((a, b) => a[0] - b[0]);
}
// where a brawler is and how it stands at time t (relative to the shot's start)
function brawler(z, t, t0) {
  const minD = 92, walk = (x, dt) => { const nx = x - z.side * z.v * dt; return z.side > 0 ? Math.max(minD, nx) : Math.min(-minD, nx); };
  let x = z.x0, cur = t0, last = null, pre = x;
  for (const [th, kind] of z.hits) {
    if (th > t) break;
    if (th > cur) x = walk(x, th - cur);
    pre = x; last = [th, kind];
    x += z.side * (kind === 'shot' ? 190 : 70);
    cur = Math.max(cur, th + (kind === 'shot' ? 2.3 : 0.45));
  }
  let tilt = 0, mode = 'walk';
  if (last) {
    const d = t - last[0];
    if (d < 0.3) x = pre + z.side * (last[1] === 'shot' ? 190 : 70) * easeOut(d / 0.3);
    if (last[1] === 'shot') {
      if (d < 0.35) { tilt = 1.5 * easeOut(d / 0.35); mode = 'fly'; } else if (d < 1.7) { tilt = 1.52 + Math.sin(d * 20) * 0.01 * (d < 1 ? 1 : 0); mode = 'down'; } else if (d < 2.3) { tilt = 1.52 * (1 - easeInOut((d - 1.7) / 0.6)); mode = 'rise'; }
    } else if (d < 0.45) { tilt = 0.4 * Math.sin(d / 0.45 * Math.PI); mode = 'stagger'; }
  }
  if (t > cur) x = walk(x, t - cur);
  return { x, tilt, mode };
}
shots.fight = function (ctx, W, H, t, bar, env) {
  const t0 = T(16), guns = gunsIn(16, 24);
  const fk = flashK(t, guns, 0.11) * (env.reduce ? 0.5 : 1), rec = recoilAt(t, guns), pmp = pumpAt(t, guns);
  // which way the friend faces: towards the next or current target
  let dir = 1;
  for (const g of guns) { const d = T(g[0]) - t; if (d < 0.18 && d > -0.35) dir = g[1]; }
  const pull = smooth((bar - 23) / 1);
  const cam = { x: 46 * Math.sin(t * 0.45) - pull * 30, y: lerp(-150, -230, pull), w: lerp(1060, 1800, pull) * (1 - 0.04 * Math.min(1, fk)), wmin: 0.7 };
  Object.assign(cam, G.shake(t, guns.map((g) => [T(g[0]), 0.32]).concat(S.WHACKS.filter((w) => w[0] < 24 && w[0] >= 16).map((w) => [T(w[0]), 0.15])), env.still));
  const v = G.view(W, H, cam);
  graveyardBG(ctx, v, t, { treeX: -980, moonX: 300, moonY: -330 });
  let r = G.layer(ctx, v, 0.86, 0.9);
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1, h = hash(i * 3.9 + 2), x = side * (1500 + h * 900 - (t - t0) * (26 + h * 20)), s = 0.62 + hash(i) * 0.12;
    G.human(ctx, Object.assign({ x, y: -14, s, face: -side, kind: 'zombie', col: [9, 11, 24], rim: rim([40, 52, 90], 2, -1.4) }, G.pose.shamble(t * 0.5 + i * 0.7, i)));
  }
  r = G.layer(ctx, v, 1);
  // more of them, a few steps behind the front row
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, h = hash(i * 5.3 + 7), x = side * (720 + h * 520 - (t - t0) * (30 + h * 18)), s = 0.9 + hash(i * 2) * 0.15;
    G.human(ctx, Object.assign({ x, y: -6, s, face: -side, kind: 'zombie', col: [7, 9, 19], rim: rim([46, 60, 100], 2, -1.4) }, G.pose.shamble(t * 0.5 + i * 0.9, i + 3)));
  }
  // zombies: lit orange by the muzzle flash, nearer = brighter
  const muzzleSide = dir;
  const lit = (x) => clamp(fk * (1 - Math.abs(x - muzzleSide * 140) / 900));
  const zcol = (x) => G.mixc(INK, [96, 44, 20], lit(x) * 0.8);
  for (const z of FIGHT_Z) {
    const st = brawler(z, t, t0);
    const P = Object.assign({ x: st.x, y: 0, s: z.s, face: -z.side, kind: 'zombie', col: zcol(st.x), rim: rim([50, 66, 104], 2.2, -1.4) }, G.pose.shamble(t * 0.5 + z.seed * 0.37, z.seed));
    P.tilt = -st.tilt;
    if (st.mode === 'fly' || st.mode === 'down') { P.hands = [[30, -150], [-10, -160]]; P.feet = [[20, 0], [-14, 0]]; }
    if (st.mode === 'rise') { P.hands = [[40, -120], [48, -124]]; P.feet = [[6, 0], [-6, 0]]; P.lean = 0.05; }
    G.human(ctx, P);
    // blood-black spatter on a hit
    for (const [th, kind] of z.hits) { const d = t - th; if (kind === 'shot' && d >= 0 && d < 0.6) G.sparks(ctx, st.x - z.side * 20, -120 * z.s, d, 22, th * 7, { life: 0.6, g: 1200, speed: 520, dir: z.side > 0 ? -0.4 : Math.PI + 0.4, spread: 1.2, col: [20, 4, 6], add: false, size: 6 }); }
  }
  // the friends, back to back
  const rimC = rim([70, 86, 140], 2.6, -1.6);
  const flashRim = fk > 0.05 ? rim([255, 150, 70], dir * 3, -1) : rimC;
  let fP = Object.assign({ x: 26 * dir, y: 0, s: 1.04, face: dir, kind: 'friend', rim: flashRim }, G.pose.stand(t, 1));
  fP.feet = [[16, 0], [-14, 0]]; fP.pel = 82; fP.lean = 0.1;
  // out of shells: 19:4 dry fire, 20:1 shells arrive, 20:3-20:4 load and pump
  const reload = bar >= q(19, 4) && bar < q(21, 1);
  const loadPump = (() => { const d = t - T(q(20, 4)); return d >= 0 && d < 0.3 ? Math.sin(d / 0.3 * Math.PI) : 0; })();
  fP = friendGun(fP, reload ? 0.55 : -0.06, reload ? loadPump : pmp, rec);
  const fInfo = G.human(ctx, fP);
  // you: flashlight left, bat in the other hand
  const wh = S.WHACKS.filter((w) => w[0] >= 16 && w[0] < 24).map((w) => T(w[0]));
  let swing = -2.3;
  for (const c of wh) { const d = t - c; if (d > -0.25 && d < 0.35) swing = d < 0 ? lerp(-2.3, -2.7, (d + 0.25) / 0.25) : lerp(-2.7, 0.5, easeOut(d / 0.12)) - (d > 0.12 ? (d - 0.12) * 4 : 0); }
  const lightOn = bar >= q(16, 3);
  let yP = Object.assign({ x: -34, y: 0, s: 0.96, face: -1, kind: 'you', rim: rimC }, G.pose.stand(t, 2));
  yP.feet = [[18, 0], [-12, 0]]; yP.pel = 82; yP.lean = 0.12;
  const lAng = 0.16 + Math.sin(t * 1.7) * 0.08;
  yP = youLight(yP, lAng);
  const shY = G.shoulder(yP);
  yP.hands[0] = [shY[0] + Math.cos(swing) * 44, shY[1] + Math.sin(swing) * 44];
  yP.bat = swing;
  // the shells toss
  const tossT = t - T(q(20, 1));
  const yInfo = G.human(ctx, yP);
  if (lightOn) lightBeam(ctx, yInfo, -1, lAng, 720, 0.24);
  if (tossT >= 0 && tossT < 0.24) {
    const u = tossT / 0.24, bx = lerp(yInfo.hand0[0], fInfo.hand[0], u), by = lerp(yInfo.hand0[1], fInfo.hand[1], u) - Math.sin(u * Math.PI) * 120;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(u * 8); ctx.fillStyle = G.rgb([60, 30, 24]); ctx.fillRect(-12, -8, 24, 16); ctx.restore();
  }
  // muzzle flash and its light
  if (fk > 0.01 && fInfo.muzzle) {
    const g = guns.filter((x) => T(x[0]) <= t).pop();
    G.muzzle(ctx, fInfo.muzzle[0], fInfo.muzzle[1], dir > 0 ? -rec * 0.3 : Math.PI + rec * 0.3, Math.min(1, fk), g ? g[0] * 10 : 0);
  }
  graveyardFront(ctx, v, t, [-320, 320]);
  // before the flashlight comes back on, only the gunfire lights the dark
  const before = bar < q(16, 3) ? 0.9 * (1 - Math.min(1, fk * 1.4)) : 0;
  dark(ctx, v, before);
  return { flash: [255, 170, 100, Math.min(0.32, fk * 0.3)], vig: 1 };
};

/* =====================================================================
   4. The horde (bars 24-28): lightning shows how many
   ===================================================================== */
const HORDE = (() => { const R = G.rng(404), a = []; for (let i = 0; i < 300; i++) a.push({ gx: (R() * 2 - 1) * 2600, gz: 2.2 + R() * 11, ph: R() * 10, s: 0.9 + R() * 0.25, sp: 0.18 + R() * 0.12 }); return a; })();
let zSprites = null;
function zombieSprites() {
  if (zSprites) return zSprites;
  zSprites = [];
  for (let k = 0; k < 6; k++) {
    const c = G.canvas(200, 300), x = c.getContext('2d');
    x.translate(100, 290); x.scale(1.5, 1.5);
    G.human(x, Object.assign({ x: 0, y: 0, s: 1, face: k % 2 ? 1 : -1, kind: 'zombie', col: [0, 0, 0] }, G.pose.shamble(k / 6, k)));
    zSprites.push(c);
  }
  return zSprites;
}
shots.horde = function (ctx, W, H, t, bar, env) {
  const lt = t - T(24);
  const bolts = S.LIGHTNING.filter((b) => b >= 24 && b < 28).map(T);
  let L = 0;
  for (const c of bolts) { const d = t - c; if (d >= 0 && d < 1) L += Math.exp(-d / 0.16); }   // one flash per bolt, no flicker
  L = Math.min(1.2, L) * (env.reduce ? 0.35 : 1);
  const guns = gunsIn(24, 28), fk = flashK(t, guns) * (env.reduce ? 0.5 : 1), rec = recoilAt(t, guns);
  const cam = { x: 0, y: -120, w: lerp(1650, 1450, lt / T(4)), wmin: 0.62 };
  Object.assign(cam, G.shake(t, bolts.map((c) => [c, 0.35]).concat(guns.map((g) => [T(g[0]), 0.4])), env.still));
  const v = G.view(W, H, cam);
  // the sky: near black, white-violet in a flash
  let r = G.layer(ctx, v, 0.05, 0.1);
  const skyC = (base, flash) => G.mixc(base, flash, Math.min(1, L));
  G.sky(ctx, r, [[-1400, skyC([3, 4, 9], [60, 64, 110])], [-500, skyC([7, 9, 20], [110, 112, 170])], [-300, skyC([12, 14, 28], [160, 156, 200])], [400, skyC([12, 14, 28], [160, 156, 200])]]);
  G.clouds(ctx, r, t, -1000, -500, skyC([10, 12, 24], [90, 96, 140]), 0.9, 30, 6, 9);
  for (const c of bolts) { const d = t - c; if (d >= 0 && d < 0.25) G.bolt(ctx, -800 + hash(c) * 1600, -1100, -500 + hash(c * 3) * 1000, -330, Math.floor(c * 100), 4, [235, 235, 255], (1 - d / 0.25)); }
  // the hill
  r = G.layer(ctx, v, 0.3, 0.4);
  const hill = (x) => -330 - 60 * Math.exp(-(((x + 200) / 900) ** 2)) + 20 * Math.sin(x * 0.004);
  G.land(ctx, r, hill, G.mixc([16, 18, 34], [62, 64, 100], Math.min(1, L)));
  // the horde: walking down towards you
  r = G.layer(ctx, v, 1);
  const spr = zombieSprites();
  const zs = HORDE.map((z) => { const gz = Math.max(0.55, z.gz - (lt + 3) * z.sp); return [z, gz]; }).sort((a, b) => b[1] - a[1]);
  const visible = 0.38 + 0.62 * Math.min(1, L) + Math.min(1, fk) * 0.4;
  for (const [z, gz] of zs) {
    const X = z.gx / gz * 0.6, Y = -330 + 380 / gz, sc = 1.35 / gz * z.s;
    if (X < r.x0 - 200 || X > r.x1 + 200) continue;
    const near = clamp(1 - (gz - 0.6) / 3);
    const a = clamp(visible + near * 0.3 * (1 - L));
    if (a < 0.02) continue;
    if (sc > 0.7) {
      G.human(ctx, Object.assign({ x: X, y: Y, s: sc, face: z.gx > 0 ? -1 : 1, kind: 'zombie', col: G.mixc(INK, [80, 36, 18], fk * near) }, G.pose.shamble(t * 0.5 + z.ph, z.ph)));
    } else {
      const k = Math.floor((t * 1.3 + z.ph) * 2) % 6, w = 200 * sc / 1.5, h = 300 * sc / 1.5;
      ctx.globalAlpha = a; ctx.drawImage(spr[k], X - w / 2, Y - h * 0.967, w, h); ctx.globalAlpha = 1;
    }
  }
  // the near slope and the two of you, from behind
  G.land(ctx, r, (x) => 230 + 30 * Math.sin(x * 0.003), INK);
  const fInfoX = 96, yInfoX = -92;
  const yLight = () => G.beam(ctx, yInfoX + 40, 30, -Math.PI / 2 + 0.25 + Math.sin(t * 2.2) * 0.05, 430, 0.34, [255, 238, 200], 0.22);
  yLight();
  const bRim = [G.mixc([70, 84, 140], [220, 224, 255], Math.min(1, L + fk * 0.6)), 0, -2.5];
  G.backView(ctx, yInfoX, 420, 2.0, 'you', { col: INK, arms: [[-30, -86], [26, -120]], rim: bRim });
  G.backView(ctx, fInfoX, 430, 2.08, 'friend', { col: INK, sway: -rec * 4, arms: [[-34, -96], [34, -110]], rim: bRim, extra: (c) => { c.fillRect(22, -175 - rec * 10, 9, 70); c.fillRect(24, -235 - rec * 12, 4, 64); } });
  if (fk > 0.01) G.muzzle(ctx, fInfoX + 56, 430 - 2.08 * 235, -Math.PI / 2 - 0.1, Math.min(1, fk) * 1.3, 7);
  G.rain(ctx, v, t, 0.18 + L * 0.2);
  return { flash: [210, 210, 255, L * 0.1 + fk * 0.16], vig: 1 };
};

/* =====================================================================
   5. The woods (bars 28-32): run
   ===================================================================== */
shots.forest = function (ctx, W, H, t, bar, env) {
  const lt = t - T(28), SP = 380;
  const fX = 200 + lt * SP, yX = fX - 120;
  const guns = gunsIn(28, 32), fk = flashK(t, guns), rec = recoilAt(t, guns);
  const whackT = T(q(29, 4.5));
  const cam = { x: fX + 40, y: -210, w: 1320, wmin: 0.64 };
  Object.assign(cam, G.shake(t, guns.map((g) => [T(g[0]), 0.35]).concat([[whackT, 0.45]]), env.still));
  cam.sy += env.still ? 0 : Math.sin(t * 13.6) * 4;
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.03, 0.1);
  G.sky(ctx, r, [[-1400, '#02040b'], [-600, '#081026'], [-100, '#18224a'], [200, '#18224a']]);
  G.stars(ctx, r, t, -1400, -300, 0.6, 4000);
  r = G.layer(ctx, v, 0.05, 0.1);
  G.moon(ctx, cam.x * 0.05 + 330, -700, 52, [230, 232, 222], 0.9);
  // far forest
  r = G.layer(ctx, v, 0.25, 0.35);
  G.treeRow(ctx, r, () => -30, 'pine', [13, 18, 40], 260, 420, 70, 21);
  G.land(ctx, r, () => -30, [13, 18, 40]);
  // middle trunks
  r = G.layer(ctx, v, 0.55, 0.65);
  ctx.fillStyle = G.rgb([8, 11, 25]);
  for (let i = Math.floor(r.x0 / 150); i < r.x1 / 150 + 1; i++) { if (hash(i * 2.2) < 0.25) continue; const x = i * 150 + hash(i) * 80, w = 26 + hash(i * 3) * 30; ctx.fillRect(x - w / 2, r.y0, w, -r.y0 - 10); }
  G.land(ctx, r, () => -12, [8, 11, 25]);
  // moonbeams through the canopy
  r = G.layer(ctx, v, 0.7, 0.75);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = Math.floor(r.x0 / 420); i < r.x1 / 420 + 1; i++) {
    const x = i * 420 + hash(i * 5) * 200, a = 0.05 + 0.05 * Math.sin(t * 0.7 + i);
    const gr = ctx.createLinearGradient(x, -900, x - 300, 0); gr.addColorStop(0, `rgba(150,170,255,${a})`); gr.addColorStop(1, 'rgba(150,170,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 30, -900); ctx.lineTo(x + 50, -900); ctx.lineTo(x - 260, 0); ctx.lineTo(x - 420, 0); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  G.fog(ctx, r, -90, -10, [60, 74, 120], 0.24, t, -30, 4);
  // the action plane
  r = G.layer(ctx, v, 1);
  const rimC = rim([66, 84, 150], 2.5, -1.6);
  // chasers: fast, and they do not stay down
  const chasers = [{ tag: 'chaser', off: -400, s: 1.02, seed: 1 }, { tag: 'chaser2', off: -580, s: 0.97, seed: 2 }, { tag: 'x', off: -760, s: 1.05, seed: 3 }];
  for (const c of chasers) {
    const g = S.GUNSHOTS.find((x) => x[2] === c.tag);
    let x = fX + c.off + Math.sin(t * 1.3 + c.seed) * 30, tilt = 0, P;
    if (g && t >= T(g[0])) {
      const d = t - T(g[0]);
      const lost = d < 1.4 ? 120 * easeOut(d / 0.3) + SP * d : Math.max(0, 120 + SP * 1.4 - (d - 1.4) * 140);
      x -= lost;
      if (d < 1.4) tilt = 1.5 * easeOut(d / 0.35);
      else if (d < 1.9) tilt = 1.5 * (1 - easeInOut((d - 1.4) / 0.5));
    }
    P = Object.assign({ x, y: 0, s: c.s, face: 1, kind: 'zombie', rim: rim([50, 64, 110], 2.5, -1.6) }, G.pose.run(t * 1.9 + c.seed * 0.3, 0.9));
    P.hands = [[56, -128], [64, -136]]; P.head = 0.3; P.tilt = -tilt;
    G.human(ctx, P);
  }
  // the jumper steps out from behind a tree as the friend passes; you swing
  const jx = 200 + (whackT - T(28)) * SP - 120 + 70;
  if (t > T(29.25)) {
    const d = t - whackT;
    let x = jx, y = 0, tilt = 0;
    if (d > 0) { x += d * 700; y = -d * 900 + d * d * 1600; tilt = d * 9; }
    if (d < 1.2) {
      const P = Object.assign({ x, y, s: 1.0, face: -1, kind: 'zombie', rim: rim([50, 64, 110], 2.5, -1.6) }, G.pose.stand(t, 3));
      P.hands = [[50, -140], [58, -150]]; P.lean = 0.3; P.head = 0.3; P.tilt = tilt;
      G.human(ctx, P);
    }
  }
  // the friend: runs, turns to fire back
  const turn = guns.some((g) => t > T(g[0]) - 0.15 && t < T(g[0]) + 0.3);
  let fP = Object.assign({ x: fX, y: 0, s: 1.04, face: turn ? -1 : 1, kind: 'friend', rim: rimC }, G.pose.run(lt / (2 * BEAT) * 2));
  if (turn) { fP.lean = 0.02; fP = friendGun(fP, -0.08, 0, rec); } else fP = friendGun(fP, 0.9, 0, 0);
  const fInfo = G.human(ctx, fP);
  if (fk > 0.01 && fInfo.muzzle) G.muzzle(ctx, fInfo.muzzle[0], fInfo.muzzle[1], Math.PI - rec * 0.3, Math.min(1, fk), 3);
  // you: flashlight forward, bat ready; the swing at the jumper
  let yP = Object.assign({ x: yX, y: 0, s: 0.96, face: 1, kind: 'you', rim: rimC }, G.pose.run(lt / (2 * BEAT) * 2 + 0.5));
  yP = youLight(yP, 0.2 + Math.sin(t * 13.6) * 0.08);
  const dW = t - whackT;
  const sw = dW > -0.3 && dW < 0.4 ? (dW < 0 ? lerp(-2.0, -2.8, (dW + 0.3) / 0.3) : lerp(-2.8, 0.4, easeOut(dW / 0.12))) : -2.0;
  const shY = G.shoulder(yP); yP.hands[0] = [shY[0] + Math.cos(sw) * 44, shY[1] + Math.sin(sw) * 44]; yP.bat = sw;
  const yInfo = G.human(ctx, yP);
  lightBeam(ctx, yInfo, 1, 0.2 + Math.sin(t * 13.6) * 0.08, 620, 0.2);
  if (dW >= 0 && dW < 0.5) G.sparks(ctx, jx + 10, -130, dW, 18, 5, { life: 0.5, g: 800, speed: 500, dir: -0.6, spread: 1.4, col: [255, 240, 200], size: 3 });
  // the ground, roots
  G.land(ctx, r, (x) => 6 + 6 * Math.sin(x * 0.013) + 4 * Math.sin(x * 0.031), INK);
  // foreground trunks whipping past
  r = G.layer(ctx, v, 1.75, 1.2);
  ctx.fillStyle = 'rgba(2,2,5,0.93)';
  for (let i = Math.floor(r.x0 / 1500); i < r.x1 / 1500 + 1; i++) {
    if (hash(i * 7.7) < 0.35) continue;
    const x = i * 1500 + hash(i) * 600, w = 50 + hash(i * 3) * 40, lean = (hash(i * 5) - 0.5) * 80;
    ctx.beginPath(); ctx.moveTo(x - w * 0.6 + lean, r.y0 - 60); ctx.lineTo(x + w * 0.6 + lean, r.y0 - 60); ctx.lineTo(x + w, r.y1 + 60); ctx.lineTo(x - w, r.y1 + 60); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + lean * 0.5, -300 + hash(i * 9) * 200); ctx.lineTo(x + 240 + lean, -420 + hash(i * 2) * 120); ctx.lineTo(x + 230 + lean, -404 + hash(i * 2) * 120); ctx.lineTo(x + lean * 0.5, -270 + hash(i * 9) * 200); ctx.fill();
  }
  // out into the clearing: light ahead
  const out = smooth((bar - 31.55) / 0.45);
  tint(ctx, v, [190, 200, 255], out * 0.45, 'lighter');
  return { flash: [255, 170, 100, Math.min(0.28, fk * 0.28)], vig: 1 };
};

/* =====================================================================
   6. The clearing (bars 32-40): the werewolf
   ===================================================================== */
const ROCK = [[430, 10], [500, -96], [560, -138], [640, -128], [700, -70], [740, 10]];
shots.werewolf = function (ctx, W, H, t, bar, env) {
  const guns = gunsIn(32, 40), fk = flashK(t, guns), rec = recoilAt(t, guns), pmp = pumpAt(t, guns);
  const cam = G.camPath([[32, -230, -300, 1700], [33.2, -200, -340, 1950], [34.3, 120, -300, 1700], [36.6, 80, -270, 1480], [37.3, -140, -290, 1750], [39.2, -120, -320, 1850], [40, -120, -340, 1950]], bar);
  cam.wmin = 0.66;
  Object.assign(cam, G.shake(t, guns.map((g) => [T(g[0]), 0.3]).concat([[T(34), 0.5], [T(q(37, 3)), 0.7], [T(38), 0.9]]), env.still));
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.04, 0.1);
  G.sky(ctx, r, [[-1500, '#02040c'], [-700, '#0a1430'], [-200, '#1f2c5c'], [100, '#25336a']]);
  G.stars(ctx, r, t, -1500, -300, 0.7, 4000);
  // the huge moon sits in the action plane so the leap crosses it exactly
  r = G.layer(ctx, v, 1);
  G.moon(ctx, -250, -330, 370, [244, 236, 206], 1.1);
  G.clouds(ctx, r, t, -900, -250, [14, 20, 46], 0.35, 10, 12, 5);
  // the far forest edge
  const hz = (x) => -40 - 30 * Math.sin(x * 0.0021 + 1) - 18 * Math.sin(x * 0.007);
  G.treeRow(ctx, r, (x) => hz(x) + 20, 'pine', [9, 13, 30], 150, 300, 80, 33);
  G.land(ctx, r, hz, [9, 13, 30]);
  // the crest
  const gy = (x) => 10 - 26 * Math.exp(-((x / 900) ** 2));
  const rimC = rim([150, 160, 200], -2, -1.8);
  // the dead tree: it breaks when the wolf hits it
  const TX = -430, breakT = T(q(37, 3)), fallT = T(38);
  ctx.fillStyle = G.rgb(INK);
  ctx.beginPath(); ctx.moveTo(TX - 24, gy(TX) + 6); ctx.lineTo(TX - 15, -200); ctx.lineTo(TX + 15, -200); ctx.lineTo(TX + 26, gy(TX) + 6); ctx.fill();
  const fallA = t < breakT ? 0 : -1.45 * easeIn(clamp((t - breakT) / (fallT - breakT + 0.25))) - (t > fallT + 0.25 ? 0.02 * Math.sin((t - fallT) * 30) * Math.exp(-(t - fallT) * 6) : 0);
  ctx.save(); ctx.translate(TX, -196); ctx.rotate(fallA); G.drawPath(ctx, G.bareTree(55, 1.05), 0, 0, 420, INK); ctx.restore();
  // the rock
  ctx.fillStyle = G.rgb(INK); ctx.beginPath(); ctx.moveTo(ROCK[0][0], ROCK[0][1]); for (const p of ROCK) ctx.lineTo(p[0], p[1]); ctx.fill();
  // the wolf
  let W0 = { x: -1200, y: -150, s: 1.0, face: 1, mode: 'leap', eyes: 0, t, rim: rim([170, 176, 210], -2, -1.6) };
  if (bar < 33) W0 = null;
  else if (bar < 34) {
    const u = bar - 33, x = lerp(-1150, 590, u), y = lerp(-140, -138, u) - Math.sin(u * Math.PI) * 400;
    Object.assign(W0, { x, y, tilt: lerp(-0.5, 0.5, u) });
  } else if (bar < 37) {
    const up = smooth((bar - 34.3) / 0.45), crouchBack = smooth((bar - 36.4) / 0.5);
    Object.assign(W0, { x: 590, y: -136, mode: up < 0.5 || crouchBack > 0.5 ? 'crouch' : 'stand', eyes: smooth((bar - 34.2) / 0.3), jaw: bar > 35.4 && bar < 36.3 ? 0.8 : 0, face: -1 });
  } else if (bar < 37.5) {
    const u = (bar - 37) / 0.5, x = lerp(590, TX + 70, u), y = lerp(-136, -150, u) - Math.sin(u * Math.PI) * 240;
    Object.assign(W0, { x, y, face: -1, mode: 'leap', eyes: 1, tilt: lerp(-0.3, 0.4, u) });
  } else if (bar < 38.7) {
    Object.assign(W0, { x: TX + 60, y: gy(TX), face: -1, mode: 'fall', eyes: 0.6, tilt: 1.35 });
  } else if (bar < 39.3) {
    Object.assign(W0, { x: lerp(TX + 60, -200, smooth((bar - 38.7) / 0.6)), y: gy(-200), face: 1, mode: bar < 39 ? 'crouch' : 'stand', eyes: 1 });
  } else {
    Object.assign(W0, { x: -200, y: gy(-200) - 4, face: 1, mode: 'howl', eyes: 1, jaw: 0.6 });
  }
  if (W0) {
    const info = G.wolf(ctx, W0);
    for (const g of guns) { const d = t - T(g[0]); if (d >= 0 && d < 0.5) { G.sparks(ctx, info.chest[0], info.chest[1], d, 16, g[0] * 9, { life: 0.5, g: 700, speed: 520, dir: Math.PI, spread: 2.2, col: [255, 220, 150], size: 4 }); G.glow(ctx, info.chest[0], info.chest[1], 60, [255, 200, 120], (1 - d / 0.2) * 0.8); } }
  }
  // the two of you: arrive, look up, fire, dive, run
  const arrive = easeOut(clamp((bar - 32) / 0.55));
  let fX = lerp(-820, -230, arrive), yX = lerp(-920, -330, arrive);
  const dive = clamp((bar - 37) / 0.35), runK = clamp((bar - 38.25) / 1.3);
  fX += easeOut(dive) * 260 + easeIn(runK) * 1500; yX -= easeOut(dive) * 230 - easeIn(runK) * 1700;
  const pant = bar > 32.5 && bar < 33.3;
  const look = smooth((bar - 32.6) / 0.3) * (1 - smooth((bar - 34) / 0.4));
  let fP = Object.assign({ x: fX, y: gy(fX), s: 1.04, face: 1, kind: 'friend', rim: rimC }, bar < 32.55 ? G.pose.run(t * 2.2) : runK > 0 ? G.pose.run(t * 2.2) : G.pose.stand(t, 1));
  if (pant) { fP.lean = 0.5; fP.pel = 78; }
  fP.head = (fP.head || 0) - look * 0.7;
  const aim = bar > 34 && bar < 37 ? -0.32 : 0.8;
  fP = friendGun(fP, aim, pmp, rec);
  if (dive > 0 && dive < 1) { fP.tilt = Math.sin(dive * Math.PI) * 1.2; fP.pel = 70; }
  const fInfo = G.human(ctx, fP);
  if (fk > 0.01 && fInfo.muzzle) G.muzzle(ctx, fInfo.muzzle[0], fInfo.muzzle[1], -0.32 - rec * 0.3, Math.min(1, fk), 4);
  let yP = Object.assign({ x: yX, y: gy(yX), s: 0.96, face: dive > 0 && runK <= 0 ? -1 : 1, kind: 'you', rim: rimC }, bar < 32.55 || runK > 0 ? G.pose.run(t * 2.2 + 0.5) : G.pose.stand(t, 2));
  if (pant) { yP.lean = 0.55; yP.pel = 76; }
  yP.head = (yP.head || 0) - look * 0.8;
  const la = lerp(0.3, -0.6, look) + (bar > 34 && bar < 37 ? -0.1 : 0);
  yP = youLight(yP, la);
  // the spoon
  if (bar > 35.6 && bar < 36.9) { const sh2 = G.shoulder(yP); yP.hands[0] = [sh2[0] + 30, sh2[1] - 40]; yP.prop = (c, sh, h) => { c.save(); c.translate(h[0][0], h[0][1]); c.rotate(-1.2); c.fillRect(-2, -26, 4, 26); c.beginPath(); c.ellipse(0, -30, 5, 8, 0, 0, TAU); c.fill(); c.restore(); }; }
  if (dive > 0 && dive < 1) { yP.tilt = Math.sin(dive * Math.PI) * 1.1; yP.pel = 70; }
  const yInfo = G.human(ctx, yP);
  lightBeam(ctx, yInfo, yP.face, la, 700, 0.18);
  // the falling tree's dust
  G.sparks(ctx, TX - 300, -10, t - fallT - 0.25, 40, 3, { life: 1.2, g: -40, speed: 220, dir: -Math.PI / 2, spread: 2.6, col: [60, 64, 90], add: false, size: 14, alpha: 0.5 });
  // the near ground
  G.land(ctx, r, gy, INK);
  r = G.layer(ctx, v, 1.25, 1.1);
  G.grass(ctx, r, () => 170, INK, 110, 18, 6, t, 0.06);
  return { flash: [255, 180, 110, Math.min(0.25, fk * 0.25)], vig: 1 };
};

/* =====================================================================
   7. St. Agatha's (bars 40-48): bats, a vampire, garlic bread
   ===================================================================== */
const CHAPEL_X = 150, CHAPEL_S = 1.3, BELFRY = [CHAPEL_X + 115 * CHAPEL_S, -300 * CHAPEL_S], VAMP = [70, -6], CAR7 = 960;
const BATS = (() => { const a = []; for (let i = 0; i < 260; i++) a.push([hash(i * 1.1), hash(i * 2.3), hash(i * 3.7), hash(i * 4.9), hash(i * 6.1), hash(i * 7.3)]); return a; })();
function batPos(b, t) {
  const [h1, h2, h3, h4, h5, h6] = b, tA = T(40.5) + h1 * 0.6, tB = T(41.5), tC = T(42), tD = T(42.4), tE = T(45.5);
  const A = (tl) => { const ang = h2 * TAU + tl * (2.3 + h3 * 1.5), rad = 30 + tl * (180 + h4 * 170); return [BELFRY[0] - tl * 70 + Math.cos(ang) * rad, BELFRY[1] - tl * (130 + h5 * 90) + Math.sin(ang) * rad * 0.45]; };
  if (t < tA) return null;
  if (t < tB) return A(t - tA);
  const aEnd = A(tB - tA), sweep = [-520 + (h1 - 0.5) * 520, -150 + h2 * 200];
  if (t < tC) { const u = easeIn((t - tB) / (tC - tB)); return [lerp(aEnd[0], sweep[0], u), lerp(aEnd[1], sweep[1], u) - Math.sin(u * Math.PI) * 60]; }
  if (t < tD) { const u = easeInOut((t - tC) / (tD - tC)); return [lerp(sweep[0], VAMP[0] + (h3 - 0.5) * 60, u), lerp(sweep[1], VAMP[1] - 180 + (h4 - 0.5) * 120, u)]; }
  if (t < tE) return null;
  const d = t - tE, ang = h2 * TAU, sp = 380 + h3 * 420;
  let x = VAMP[0] + Math.cos(ang) * sp * d, y = VAMP[1] - 180 + Math.sin(ang) * sp * d * 0.6 - d * 60;
  const toCar = smooth((t - T(46.4)) / 2);
  if (toCar > 0) { const a2 = h5 * TAU + t * (1.5 + h6); x = lerp(x, CAR7 + Math.cos(a2) * (120 + h4 * 200), toCar); y = lerp(y, -240 + Math.sin(a2) * (60 + h1 * 90), toCar); }
  return [x, y];
}
shots.chapel = function (ctx, W, H, t, bar, env) {
  const cam = G.camPath([[40, -150, -340, 1750], [41.4, -60, -400, 2000], [42.4, -170, -260, 1420], [45.4, -150, -260, 1460], [46.6, 260, -290, 1750], [48, 600, -270, 1600]], bar);
  cam.wmin = 0.64;
  Object.assign(cam, G.shake(t, [[T(q(43, 3)), 0.25], [T(q(45, 2)), 0.4], [T(q(47, 3)), 0.25], [T(q(47, 4)), 0.25]], env.still));
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.04, 0.1);
  G.sky(ctx, r, [[-1500, '#06030f'], [-800, '#1a0a2a'], [-300, '#3d1236'], [-60, '#5c1a32'], [200, '#5c1a32']]);
  G.stars(ctx, r, t, -1500, -500, 0.5, 4000);
  r = G.layer(ctx, v, 0.08, 0.12);
  G.moon(ctx, -430, -640, 92, [255, 120, 96], 1.1);
  G.clouds(ctx, r, t, -900, -420, [22, 8, 26], 0.75, 14, 17, 8);
  r = G.layer(ctx, v, 0.3, 0.4);
  G.land(ctx, r, G.hills(17, -60, 100, 0.0016), [30, 10, 34]);
  r = G.layer(ctx, v, 0.6, 0.7);
  G.treeRow(ctx, r, () => -24, 'bare', [18, 6, 22], 240, 380, 300, 19);
  G.land(ctx, r, () => -24, [18, 6, 22]);
  r = G.layer(ctx, v, 1);
  // the chapel, its red windows and the bell
  ctx.save(); ctx.translate(CHAPEL_X, 6); ctx.scale(CHAPEL_S, CHAPEL_S);
  ctx.fillStyle = G.rgb([6, 3, 8]); chapelShape(ctx, true);
  const flick = 0.75 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
  ctx.fillStyle = `rgba(190,30,30,${0.55 * flick})`;
  for (const wx of [-210, -130, -50]) { ctx.beginPath(); ctx.moveTo(wx - 14, -60); ctx.lineTo(wx - 14, -130); ctx.quadraticCurveTo(wx, -156, wx + 14, -130); ctx.lineTo(wx + 14, -60); ctx.fill(); }
  // belfry opening
  ctx.fillStyle = 'rgba(60,14,30,1)'; ctx.beginPath(); ctx.moveTo(90, -270); ctx.lineTo(90, -318); ctx.quadraticCurveTo(115, -348, 140, -318); ctx.lineTo(140, -270); ctx.fill();
  const swing = Math.sin((t - T(40)) * 3.4) * 0.5 * Math.exp(-Math.max(0, t - T(41)) * 0.6) * (t > T(40) ? 1 : 0);
  ctx.save(); ctx.translate(115, -326); ctx.rotate(swing); ctx.fillStyle = G.rgb([6, 3, 8]); ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-16, 34); ctx.lineTo(16, 34); ctx.lineTo(4, 0); ctx.fill(); ctx.restore();
  // the open door, lit from inside
  const dx = (VAMP[0] - CHAPEL_X) / CHAPEL_S, door = ctx.createLinearGradient(0, -250, 0, 0);
  door.addColorStop(0, `rgba(150,30,24,${0.9 * flick})`); door.addColorStop(1, `rgba(255,120,60,${0.95 * flick})`);
  ctx.fillStyle = door; ctx.beginPath(); ctx.moveTo(dx - 70, 0); ctx.lineTo(dx - 70, -170); ctx.quadraticCurveTo(dx, -262, dx + 70, -170); ctx.lineTo(dx + 70, 0); ctx.fill();
  ctx.restore();
  G.glow(ctx, VAMP[0], -90, 260, [255, 70, 40], 0.35 * flick);
  for (const wx of [-210, -130, -50]) G.glow(ctx, CHAPEL_X + wx * CHAPEL_S, 6 - 100 * CHAPEL_S, 90, [200, 30, 30], 0.25 * flick);
  // graves and a fence
  for (let i = -8; i < 8; i++) { const x = CHAPEL_X - 600 + i * 120 + hash(i + 40) * 50; if (Math.abs(x - VAMP[0]) < 140) continue; G.stone(ctx, x, 8, 70 + hash(i * 3 + 40) * 30, (i + 9) % 5, (hash(i * 7) - 0.5) * 0.2, [6, 3, 8]); }
  // the car, waiting
  const doorSlam = [T(q(47, 3)), T(q(47, 4))];
  const carRock = G.pulse(t, doorSlam, 0.08) * 3;
  G.car(ctx, { x: CAR7, y: 8, s: 1.0, face: -1, wheel: 0, bounce: carRock, rim: rim([150, 60, 90], 2, -1.5), heads: t > doorSlam[1] ? 1 : null, lights: 0, tail: 0.15 });
  // the vampire
  const vIn = smooth((bar - 42) / 0.4), vOut = smooth((bar - 45.5) / 0.15);
  const rec2 = smooth((bar - 45.2) / 0.2);
  if (vIn > 0 && vOut < 1) {
    const flare = Math.exp(-Math.max(0, t - T(q(43, 3))) / 0.3) * (t > T(q(43, 3)) ? 1 : 0);
    ctx.save(); ctx.globalAlpha = vIn * (1 - vOut);
    G.vampire(ctx, { x: VAMP[0], y: VAMP[1], s: lerp(0.7, 1.15, vIn), open: lerp(1, 0.55, smooth((bar - 42.4) / 0.6)) + flare * 0.45 - rec2 * 0.4, recoil: rec2, hover: Math.sin(t * 1.6) * 8 - 10, eyes: vIn });
    ctx.restore();
  }
  // the two of you
  const rimC = rim([200, 70, 110], 2.4, -1.6);
  const arrive = easeOut(clamp((bar - 40) / 0.6)), run = clamp((bar - 46) / 1.5);
  const duck = smooth((bar - 41.55) / 0.15) * (1 - smooth((bar - 42.0) / 0.2));
  let fX = lerp(-1000, -470, arrive) + easeIn(run) * (CAR7 + 100 - -470), yX = lerp(-1100, -570, arrive) + easeIn(clamp((bar - 46.1) / 1.4)) * (CAR7 - 30 - -570);
  const inCar = (x) => x > CAR7 - 180;
  const moving = bar < 40.6 || run > 0;
  if (!inCar(fX) || bar < 46) {
    let fP = Object.assign({ x: fX, y: 6, s: 1.04, face: 1, kind: 'friend', rim: rimC }, moving ? G.pose.run(t * 2.2) : G.pose.stand(t, 1));
    if (duck > 0) { fP.lean = 0.6 * duck; fP.pel = 86 - 16 * duck; }
    fP = friendGun(fP, bar > 42 && bar < 46 ? -0.05 : 0.8, 0, 0);
    G.human(ctx, fP);
  }
  if (!inCar(yX) || bar < 46) {
    let yP = Object.assign({ x: yX, y: 6, s: 0.96, face: 1, kind: 'you', rim: rimC }, moving ? G.pose.run(t * 2.2 + 0.5) : G.pose.stand(t, 2));
    if (duck > 0) { yP.lean = 0.7 * duck; yP.pel = 86 - 18 * duck; }
    const cross = bar >= 42.1 && bar < 44.6;
    const breathe = smooth((bar - 44.7) / 0.12) * (1 - smooth((bar - 45.5) / 0.3));
    yP = youLight(yP, cross ? 0.5 : 0.1);
    if (cross) {
      const sh2 = G.shoulder(yP), snapped = t > T(q(43, 3));
      yP.hands[1] = [sh2[0] + 50, sh2[1] - 8]; yP.light = null;
      yP.prop = (c, sh, h) => { c.save(); c.translate(h[1][0] + 4, h[1][1]); c.fillRect(-3, -62, 6, 66); if (!snapped) c.fillRect(-22, -46, 44, 6); c.restore(); };
    }
    if (breathe > 0) { yP.lean = 0.3 * breathe; yP.head = 0.25 * breathe; }
    const yInfo = G.human(ctx, yP);
    if (!cross) lightBeam(ctx, yInfo, 1, 0.1, 560, 0.16);
    // the snapped half spins away; the garlic breath rolls out
    const ds = t - T(q(43, 3));
    if (ds > 0 && ds < 1.2) { ctx.save(); ctx.translate(yInfo.hand[0] + ds * 260, yInfo.hand[1] - 46 - ds * 300 + ds * ds * 500); ctx.rotate(ds * 14); ctx.fillStyle = G.rgb(INK); ctx.fillRect(-22, -3, 44, 6); ctx.restore(); }
    const db = t - T(q(44, 4));
    if (db > 0 && db < 1.6) {
      const spr = G.fogSprite([120, 210, 90]);
      for (let i = 0; i < 9; i++) { const u = clamp(db / 0.8 - i * 0.05), x = lerp(yInfo.head[0] + 20, VAMP[0] - 40, u), y = yInfo.head[1] + Math.sin(i * 2.1) * 30 * u - 10 - u * 60, sz = 60 + u * 200; ctx.globalAlpha = 0.5 * (1 - db / 1.6) * (u > 0 ? 1 : 0); ctx.drawImage(spr, x - sz, y - sz / 2, sz * 2, sz); }
      ctx.globalAlpha = 1;
    }
  }
  // bats
  const pts = [];
  for (let i = 0; i < BATS.length; i++) { const p = batPos(BATS[i], t); if (p) pts.push([p[0], p[1], 0.9 + BATS[i][3] * 0.9, BATS[i][0] * 50]); }
  G.bats(ctx, pts, t, [4, 2, 6]);
  G.land(ctx, r, (x) => 8 + 4 * Math.sin(x * 0.01), [4, 2, 6]);
  G.fog(ctx, r, -50, 20, [110, 40, 80], 0.18, t, 18, 21);
  return { vig: 1 };
};

/* =====================================================================
   8. The fog (bars 48-56): inside the car, don't move
   ===================================================================== */
// the inside of the car seen from the back seat (design frame 1600 x 900 around 0, 0)
function carInside(ctx, r, o) {
  const ink = G.rgb(INK);
  ctx.fillStyle = ink;
  // roof, pillars, door frames
  ctx.beginPath(); ctx.moveTo(r.x0 - 50, r.y0 - 50); ctx.lineTo(r.x1 + 50, r.y0 - 50); ctx.lineTo(r.x1 + 50, -300); ctx.quadraticCurveTo(0, -380 + (o.dent || 0) * 70, r.x0 - 50, -300); ctx.closePath(); ctx.fill();
  if (o.dent) { ctx.beginPath(); ctx.ellipse(-120, -330, 260, 40 + o.dent * 60, 0, 0, TAU); ctx.fill(); }
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(sd * 560, -340); ctx.lineTo(sd * 660, -340); ctx.lineTo(sd * 600, 60); ctx.lineTo(sd * 500, 60); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sd * 640, -80); ctx.lineTo(sd * 3000, -80); ctx.lineTo(sd * 3000, 2000); ctx.lineTo(sd * 600, 2000); ctx.closePath(); ctx.fill();
    ctx.fillRect(sd > 0 ? 1020 : -3000, -400, 1980, 2400);
  }
  // dashboard
  ctx.beginPath(); ctx.moveTo(r.x0 - 50, 80); ctx.quadraticCurveTo(-300, 30, 0, 50); ctx.quadraticCurveTo(300, 60, r.x1 + 50, 70); ctx.lineTo(r.x1 + 50, r.y1 + 50); ctx.lineTo(r.x0 - 50, r.y1 + 50); ctx.closePath(); ctx.fill();
  // the mirror
  ctx.fillRect(-6, -360, 12, 60); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-90, -310, 180, 48, 12) : ctx.rect(-90, -310, 180, 48); ctx.fill();
  if (o.clock) { ctx.font = '600 26px "Special Elite", monospace'; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(90,255,170,${o.clock})`; ctx.fillText('3:13', 0, 118); G.glow(ctx, 0, 110, 50, [90, 255, 170], 0.25 * o.clock); ctx.fillStyle = ink; }
  // steering wheel
  ctx.strokeStyle = ink; ctx.lineWidth = 36; ctx.beginPath(); ctx.arc(-330, 330, 230, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  // seats, heads, the shotgun
  const head = (x, who, turn) => {
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 190, 40, 380, 900, 70) : ctx.rect(x - 190, 40, 380, 900); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, 60, 210, 70, 0, Math.PI, TAU); ctx.fill();
    const hx = x + (turn || 0) * 22, hy = -40;
    ctx.beginPath(); ctx.arc(hx, hy, who === 'you' ? 62 : 56, 0, TAU); ctx.fill();
    ctx.fillRect(hx - 36, hy + 20, 72, 70);
    if (who === 'friend') { ctx.beginPath(); ctx.arc(hx, hy - 6, 59, Math.PI, TAU); ctx.fill(); if (turn) { ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(hx + turn * 30, hy - 14); ctx.lineTo(hx + turn * 92, hy - 6); ctx.stroke(); } }
    else { ctx.beginPath(); ctx.moveTo(hx - 64, hy + 14); ctx.quadraticCurveTo(hx, hy - 100, hx + 64, hy + 14); ctx.fill(); }
  };
  head(-330, 'you', o.turnY); head(330, 'friend', o.turnF);
  if (o.gun !== false) { ctx.fillRect(500, -200, 13, 700); ctx.fillRect(494, -40, 25, 160); }
}
const GHOSTS = [[48.6, 3.2, -80, 1.1, 1], [49.9, 3.6, -40, 0.8, 2], [51.2, 2.6, -160, 1.5, 3], [52.0, 1.3, -60, 2.6, 4], [53.2, 3.4, -110, 0.9, 5], [54.2, 2.8, -20, 1.2, 6]];
shots.fog = function (ctx, W, H, t, bar, env) {
  const slamT = T(q(55, 3)), dS = t - slamT;
  const cam = { x: 0, y: -40, w: 1600 * lerp(1, 0.94, smooth((bar - 48) / 7.5)), wmin: 0.58, lift: 0 };
  Object.assign(cam, G.shake(t, [[slamT, 1.2]], env.still));
  const v = G.view(W, H, cam);
  // outside: fog
  let r = G.layer(ctx, v, 0.6, 0.6);
  G.sky(ctx, r, [[-700, '#1b2133'], [-150, '#3a4458'], [80, '#2c3446'], [600, '#1b2133']]);
  ctx.fillStyle = 'rgba(20,24,36,0.6)';
  for (let i = -4; i < 5; i++) G.drawPath(ctx, G.bareTree(60 + i, 1), i * 340 + 60, 60, 420 + hash(i) * 200, [34, 40, 56]);
  r = G.layer(ctx, v, 0.8, 0.8);
  G.fog(ctx, r, -400, 100, [150, 160, 182], 0.28, t, -24, 31, 1.2);
  // ghosts drifting past
  for (const [b0, dur, y, s, seed] of GHOSTS) {
    const u = (t - T(b0)) / dur; if (u < 0 || u > 1) continue;
    const near = s > 2;
    const x = near ? lerp(-200, -1100, easeIn(u)) : lerp(900, -900, u), a = Math.sin(u * Math.PI) * (near ? 0.85 : 0.6);
    G.ghost(ctx, x, y + Math.sin(t * 1.3 + seed) * 20, s * 0.9, t, a, seed, -1);
  }
  G.fog(ctx, r, -200, 60, [170, 180, 200], 0.18, t, -40, 37, 0.8);
  // the breath fog on the windscreen and the handprint
  r = G.layer(ctx, v, 1);
  const breath = smooth((bar - 49) / 4) * (1 - smooth((bar - 54) / 1.5));
  if (breath > 0.01) { const gr = ctx.createLinearGradient(0, -100, 0, 60); gr.addColorStop(0, 'rgba(200,210,225,0)'); gr.addColorStop(1, `rgba(200,210,225,${0.22 * breath})`); ctx.fillStyle = gr; ctx.fillRect(-560, -100, 1120, 160); }
  const hp = smooth((t - T(q(52, 3))) / 0.35) * (1 - smooth((bar - 54.5) / 1));
  if (hp > 0.01) {
    ctx.fillStyle = `rgba(215,225,240,${0.4 * hp})`;
    ctx.save(); ctx.translate(-820, -190); ctx.rotate(-0.15);
    ctx.beginPath(); ctx.ellipse(0, 20, 36, 44, 0, 0, TAU); ctx.fill();
    for (let k = 0; k < 5; k++) { const a = -2.4 + k * 0.32; ctx.save(); ctx.rotate(a + Math.PI / 2); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-8, 30, 16, k === 0 ? 40 : 58, 8) : ctx.rect(-8, 30, 16, 58); ctx.fill(); ctx.restore(); }
    ctx.restore();
  }
  // the slam: a face and two hands on the windscreen, cracks
  if (dS >= 0) {
    const k = easeOut(dS / 0.08);
    ctx.save(); ctx.translate(30, -150); ctx.scale(lerp(1.3, 1, k), lerp(1.3, 1, k));
    ctx.fillStyle = G.rgb([10, 12, 16]);
    ctx.beginPath(); ctx.ellipse(0, 0, 120, 150, 0, 0, TAU); ctx.fill();
    ctx.fillRect(-150, 110, 300, 300);
    for (const sd of [-1, 1]) { ctx.save(); ctx.translate(sd * 260, -40 + sd * 20); ctx.rotate(sd * 0.2); ctx.beginPath(); ctx.ellipse(0, 0, 56, 66, 0, 0, TAU); ctx.fill(); for (let f = 0; f < 5; f++) { ctx.save(); ctx.rotate(-0.9 + f * 0.42); ctx.fillRect(-9, -130, 18, 80); ctx.restore(); } ctx.restore(); }
    ctx.fillStyle = 'rgba(40,0,0,0.9)'; ctx.beginPath(); ctx.ellipse(-40, -20, 18, 12, 0, 0, TAU); ctx.ellipse(40, -20, 18, 12, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 60, 40, 28 + Math.sin(t * 20) * 6, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = `rgba(220,230,245,${0.7})`; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i < 14; i++) { let x = 30, y = -150, a = i / 14 * TAU + hash(i) * 0.3; ctx.moveTo(x, y); for (let j = 0; j < 5; j++) { x += Math.cos(a) * (50 + hash(i * 5 + j) * 60) * k; y += Math.sin(a) * (50 + hash(i * 3 + j) * 60) * k; a += (hash(i * 7 + j) - 0.5) * 0.7; ctx.lineTo(x, y); } }
    ctx.stroke();
  }
  // the car around us
  r = G.layer(ctx, v, 1);
  const turn = smooth((bar - 53.4) / 0.4) * (1 - smooth((bar - 55.4) / 0.1));
  carInside(ctx, r, { clock: 0.85, turnY: turn * 0.8, turnF: -turn * 0.8 });
  return { vig: 1, flash: dS >= 0 && dS < 0.4 ? [200, 210, 230, 0.3 * (1 - dS / 0.4)] : null, grain: 0.09 };
};

/* =====================================================================
   9. The lake (bars 56-64): the Thing
   ===================================================================== */
const EYE_CUES = [q(57, 1), q(57, 2), q(57, 3), q(57, 4), q(58, 3), q(59, 1), q(59, 2), q(59, 3)];
function thingEyes(t, extra = 0) {
  return EYE_CUES.map((b, i) => { const d = t - T(b); if (d < 0) return 0; let o = easeOut(d / 0.35); const bl = (t * (0.23 + i * 0.03) + i * 0.37) % 1; if (bl < 0.02 && d > 1) o *= 0.1; return o; });
}
shots.thing = function (ctx, W, H, t, bar, env) {
  const cam = G.camPath([[56, 0, -400, 2500], [60, -150, -360, 2300], [64, -520, -230, 1500]], bar);
  cam.wmin = 0.62;
  const braams = S.HITS.filter((h) => h[1] === 'braam').map((h) => [T(h[0]), 0.5]);
  Object.assign(cam, G.shake(t, braams, env.still));
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.04, 0.08);
  G.sky(ctx, r, [[-1700, '#010207'], [-800, '#060a1c'], [-200, '#11183a'], [0, '#1a2248'], [300, '#1a2248']]);
  G.stars(ctx, r, t, -1700, -200, 1, 5000);
  r = G.layer(ctx, v, 0.08, 0.12);
  G.moon(ctx, 620, -900, 58, [236, 232, 214], 1);
  // far mountains
  r = G.layer(ctx, v, 0.25, 0.3);
  G.land(ctx, r, G.hills(41, -30, 220, 0.0011), [12, 16, 36]);
  // the Thing rises from the lake
  r = G.layer(ctx, v, 0.6, 0.7);
  const rise = easeOut(clamp((bar - 56) / 4)) * 0.85 + 0.15 * smooth((bar - 60) / 4);
  const eyes = thingEyes(t);
  G.thing(ctx, 120, -20, 0.82, t, rise, eyes, { look: Math.sin(t * 0.4) * 0.5 - 0.4 });
  // the lake: dark water with the eyes and the moon in it
  r = G.layer(ctx, v, 0.85, 0.9);
  const gr = ctx.createLinearGradient(0, -24, 0, 200); gr.addColorStop(0, '#141c3c'); gr.addColorStop(1, '#05070f');
  ctx.fillStyle = gr; ctx.fillRect(r.x0, -24, r.x1 - r.x0, 400);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < G.THING_EYES.length; i++) {
    const o = eyes[i]; if (o < 0.05) continue;
    const [ex, , er] = G.THING_EYES[i], X = 120 + ex * 0.82 + v.cx * 0.25, w = er * 0.82 * 1.3;
    for (let k = 0; k < 9; k++) { const y = -10 + k * 18, wob = Math.sin(t * 3 + k * 1.7 + i) * 8; ctx.fillStyle = `rgba(255,170,60,${0.22 * o * (1 - k / 9)})`; ctx.fillRect(X - w + wob, y, w * 2, 5); }
  }
  ctx.globalCompositeOperation = 'source-over';
  // ripples around the rising mass
  ctx.strokeStyle = 'rgba(120,140,200,0.18)'; ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) { const ph = ((t * 0.4 + k / 5) % 1); ctx.beginPath(); ctx.ellipse(120 + v.cx * 0.25, -16, 300 + ph * 900, 10 + ph * 30, 0, 0, TAU); ctx.globalAlpha = 1 - ph; ctx.stroke(); }
  ctx.globalAlpha = 1;
  // the near shore: road, car
  r = G.layer(ctx, v, 1);
  const shore = (x) => 120 + 20 * Math.sin(x * 0.002) + (x < -900 ? (-900 - x) * -0.35 : 0);
  // horrors converging: zombies down the left hill, the wolf on the ridge, bats
  const conv = clamp((bar - 60) / 4);
  for (let i = 0; i < 26; i++) {
    const h = hash(i * 3.7 + 1), st = 60 + h * 2;
    if (bar < st) continue;
    const u = clamp((bar - st) / 3.5), x = lerp(-1900 - h * 400, -900 - h * 120, u), y = shore(x) - 4, s = 0.45 + hash(i) * 0.15;
    G.human(ctx, Object.assign({ x, y, s, face: 1, kind: 'zombie', col: INK }, G.pose.shamble(t * 0.6 + i, i)));
  }
  if (bar > 60.6) G.wolf(ctx, { x: -1380, y: shore(-1380) - 160 - 30, s: 0.4, face: 1, mode: bar > 61 && bar < 62.2 ? 'howl' : 'stand', eyes: 1, t });
  G.land(ctx, r, shore, INK);
  G.car(ctx, { x: -650, y: shore(-650) + 4, s: 0.62, face: 1, heads: 1, lights: 0, tail: 0.12 * (0.5 + 0.5 * Math.sin(t * 2)), rim: rim([60, 70, 110], 1.5, -1) });
  const bpts = [];
  if (bar > 61.4) for (let i = 0; i < 120; i++) { const h = hash(i * 5.5), u = clamp((t - T(61.5) - h * 0.8) / 2.5); if (u <= 0) continue; const a = h * TAU + t * (1 + hash(i * 2)); bpts.push([lerp(1400, -300, u) + Math.cos(a) * 160, -520 + u * 200 + Math.sin(a) * 90, 0.55 + hash(i) * 0.4, i]); }
  G.bats(ctx, bpts, t);
  for (let i = 0; i < 3; i++) { const u = clamp((bar - 59 - i) / 4); if (u > 0 && u < 1) G.ghost(ctx, lerp(900, -300, u) - i * 300, -120 - i * 30, 0.6, t, Math.sin(u * Math.PI) * 0.4, i + 9, -1); }
  G.fog(ctx, r, -10, 120, [60, 74, 120], 0.2, t, 16, 44);
  return { vig: 1, flash: braams.some((b) => t - b[0] >= 0 && t - b[0] < 0.4) ? [255, 150, 60, 0.06] : null };
};

/* =====================================================================
   10. It won't start (bars 64-72)
   ===================================================================== */
const CRANK_T = S.CRANKS.map(T), SLAP_T = S.SLAPS.map(T);
function crankEnv(t) {   // 0..1 inside each crank of the starter
  for (const c of CRANK_T) { const d = t - c; if (d >= 0 && d < BEAT / 2) return Math.sin(d / (BEAT / 2) * Math.PI); }
  return 0;
}
// the dashboard view from the driver's seat (design frame 1600 x 900 around 0, 0)
function dash(ctx, v, t, bar, cracked) {
  const ck = crankEnv(t), glowK = bar >= 71.75 ? 0 : 0.35 + 0.65 * (1 - ck * 0.7);
  // outside: night; the walkers coming; the Thing's eyes far off
  let r = G.layer(ctx, v, 0.2, 0.2);
  G.sky(ctx, r, [[-800, '#02030a'], [-200, '#0c1230'], [100, '#141a3a']]);
  G.stars(ctx, r, t, -900, -150, 0.6, 2000);
  for (let i = 0; i < 6; i++) { const [ex, ey] = [-500 + i * 190, -420 + Math.sin(i * 2.1) * 60]; G.glow(ctx, ex, ey, 26, [255, 170, 40], 0.5 * (0.6 + 0.4 * Math.sin(t * 0.5 + i))); }
  r = G.layer(ctx, v, 1);
  const comeIn = clamp((bar - 64) / 2.2);
  for (let i = 0; i < 7; i++) {
    const h = hash(i * 9.1), z = lerp(3.2, 0.55, clamp(comeIn * (0.7 + h * 0.6) + (bar >= 70 ? 1 : 0))), x = (h - 0.5) * 1300 / z * 0.55, y = -30 + 170 / z, s = 1.25 / z;
    if (s > 2.6) continue;
    G.human(ctx, Object.assign({ x, y, s, face: x > 0 ? -1 : 1, kind: 'zombie', col: [3, 4, 8] }, G.pose.shamble(t * 0.6 + i, i)));
  }
  // hands on the windscreen near the end
  if (bar >= 70) { ctx.fillStyle = G.rgb([3, 4, 8]); for (const [hx, hy, a] of [[-260, -160, -0.3], [200, -200, 0.2], [420, -120, 0.5]]) { ctx.save(); ctx.translate(hx, hy); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 40, 48, 0, 0, TAU); ctx.fill(); for (let f = 0; f < 5; f++) { ctx.save(); ctx.rotate(-0.9 + f * 0.42); ctx.fillRect(-7, -100, 14, 64); ctx.restore(); } ctx.restore(); } }
  if (cracked > 0) {
    ctx.strokeStyle = `rgba(210,220,240,${0.6 * cracked})`; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 12; i++) { let x = -120, y = -220, a = i / 12 * TAU; ctx.moveTo(x, y); for (let j = 0; j < 6; j++) { x += Math.cos(a) * 60 * cracked; y += Math.sin(a) * 60 * cracked; a += (hash(i * 5 + j) - 0.5) * 0.8; ctx.lineTo(x, y); } }
    ctx.stroke();
  }
  // the hood, the dashboard, the gauges, the wheel, the key and your hand
  ctx.fillStyle = G.rgb([3, 3, 6]);
  ctx.beginPath(); ctx.moveTo(-2000, 60); ctx.quadraticCurveTo(0, 0, 2000, 60); ctx.lineTo(2000, 3000); ctx.lineTo(-2000, 3000); ctx.fill();
  ctx.fillStyle = G.rgb(INK);
  ctx.beginPath(); ctx.moveTo(-2000, 150); ctx.quadraticCurveTo(-400, 90, 0, 130); ctx.quadraticCurveTo(400, 150, 2000, 150); ctx.lineTo(2000, 3000); ctx.lineTo(-2000, 3000); ctx.fill();
  for (const [gx, val] of [[-470, 0.1 + ck * 0.25], [-250, 0.05]]) {
    ctx.fillStyle = G.rgba([20, 60, 58], 0.9 * glowK); ctx.beginPath(); ctx.arc(gx, 260, 86, 0, TAU); ctx.fill();
    G.glow(ctx, gx, 260, 120, [60, 220, 190], 0.18 * glowK);
    ctx.strokeStyle = G.rgba([140, 255, 230], 0.6 * glowK); ctx.lineWidth = 3; ctx.beginPath();
    for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 + k / 10 * Math.PI * 1.5; ctx.moveTo(gx + Math.cos(a) * 70, 260 + Math.sin(a) * 70); ctx.lineTo(gx + Math.cos(a) * 80, 260 + Math.sin(a) * 80); }
    ctx.stroke();
    const na = Math.PI * 0.75 + val * Math.PI * 1.5;
    ctx.strokeStyle = G.rgba([255, 70, 50], 0.95 * Math.max(0.4, glowK)); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(gx, 260); ctx.lineTo(gx + Math.cos(na) * 66, 260 + Math.sin(na) * 66); ctx.stroke();
  }
  [[-400, 370, [255, 40, 30]], [-350, 370, [255, 170, 30]], [-300, 370, [255, 170, 30]]].forEach(([x, y, c], i) => { const a = (0.5 + 0.5 * Math.sin(t * 9 + i)) * glowK; G.glow(ctx, x, y, 22, c, a); ctx.fillStyle = G.rgba(c, a); ctx.fillRect(x - 8, y - 6, 16, 12); });
  ctx.strokeStyle = G.rgb([2, 2, 4]); ctx.lineWidth = 56; ctx.beginPath(); ctx.arc(-360, 560, 360, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.fillStyle = G.rgb([2, 2, 4]); ctx.beginPath(); ctx.arc(-360, 560, 110, 0, TAU); ctx.fill();
  const kx = 30, ky = 330, twist = 0.15 + ck * 0.45;
  G.glow(ctx, kx, ky, 40, [255, 170, 30], 0.3 * glowK);
  ctx.save(); ctx.translate(kx, ky); ctx.rotate(twist); ctx.fillStyle = G.rgb([2, 2, 4]);
  ctx.fillRect(-6, -40, 12, 44); ctx.beginPath(); ctx.ellipse(0, -48, 22, 16, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10, -30, 70, 54, 0.4, 0, TAU); ctx.fill(); ctx.fillRect(40, -40, 400, 90);
  ctx.restore();
  G.layer(ctx, v, 1);
  return glowK;
}
shots.crank = function (ctx, W, H, t, bar, env) {
  const part = bar < 66 ? 'dash' : bar < 68 ? 'in' : bar < 70 ? 'out' : bar < 71.75 ? 'dash' : 'black';
  if (part === 'black') return { fade: 1 };
  const ck = crankEnv(t);
  const slaps = SLAP_T.filter((s) => t - s >= 0 && t - s < 3);
  if (part === 'dash') {
    const cam = { x: 0, y: 0, w: 1600 * lerp(1, 0.9, (bar % 2) / 2), wmin: 0.6, lift: 0.1 };
    Object.assign(cam, G.shake(t, CRANK_T.map((c) => [c, 0.05]).concat(SLAP_T.map((s) => [s, 0.15])).concat([[T(q(70, 3)), 0.8]]), env.still));
    const v = G.view(W, H, cam);
    const glowK = dash(ctx, v, t, bar, bar >= q(70, 3) ? easeOut((t - T(q(70, 3))) / 0.12) : 0);
    return { vig: 1, grain: 0.09 };
  }
  if (part === 'in') {
    const cam = { x: 0, y: -40, w: 1550, wmin: 0.58, lift: 0 };
    const thuds = [T(67), T(q(67, 3))];
    Object.assign(cam, G.shake(t, thuds.map((x) => [x, 0.9]).concat(SLAP_T.map((s) => [s, 0.2])), env.still));
    const v = G.view(W, H, cam);
    let r = G.layer(ctx, v, 0.6, 0.6);
    G.sky(ctx, r, [[-700, '#05070f'], [-100, '#141a32'], [400, '#0b0e1c']]);
    r = G.layer(ctx, v, 1);
    // faces and hands pressed on every window
    ctx.fillStyle = G.rgb([2, 3, 6]);
    for (let i = 0; i < 9; i++) {
      const x = -900 + i * 230 + hash(i) * 60, y = -180 + hash(i * 3) * 120, s = 0.9 + hash(i * 5) * 0.4, jit = Math.sin(t * 6 + i) * 6;
      ctx.beginPath(); ctx.ellipse(x + jit, y, 70 * s, 90 * s, 0, 0, TAU); ctx.fill(); ctx.fillRect(x - 90 * s + jit, y + 60 * s, 180 * s, 400);
    }
    slaps.forEach((s0, i) => { const d = t - s0, x = (i % 2 ? 1 : -1) * (380 + hash(i) * 400), y = -200 + hash(i * 3) * 160, k = easeOut(d / 0.06); ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.beginPath(); ctx.ellipse(0, 0, 50, 58, 0, 0, TAU); ctx.fill(); for (let f = 0; f < 5; f++) { ctx.save(); ctx.rotate(-0.9 + f * 0.42); ctx.fillRect(-9, -116, 18, 76); ctx.restore(); } ctx.restore(); });
    const dent = smooth((t - T(67)) / 0.05) * 0.6 + smooth((t - T(q(67, 3))) / 0.05) * 0.4;
    carInside(ctx, r, { clock: 0, dent, turnF: 1.2, gun: false });
    // the friend turned round, aiming at the back window: the barrel comes at us
    ctx.fillStyle = G.rgb(INK); ctx.save(); ctx.translate(380, -60); ctx.rotate(0.5 + Math.sin(t * 2) * 0.05); ctx.fillRect(-14, 0, 28, 520); ctx.restore();
    return { vig: 1, grain: 0.09, flash: thuds.some((x) => t - x >= 0 && t - x < 0.2) ? [180, 190, 220, 0.12] : null };
  }
  // outside: surrounded
  const cam = { x: 0, y: -180, w: 1650, wmin: 0.7 };
  Object.assign(cam, G.shake(t, SLAP_T.map((s) => [s, 0.1]), env.still));
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.04, 0.1);
  G.sky(ctx, r, SKY_NIGHT);
  G.stars(ctx, r, t, -1500, -200, 0.8, 3000);
  r = G.layer(ctx, v, 0.15, 0.2);
  const eyes = thingEyes(t).map((e) => e * 0.9);
  G.thing(ctx, 200, 120, 0.42, t, 1, eyes, { col: [8, 10, 22] });
  r = G.layer(ctx, v, 0.5, 0.6);
  G.land(ctx, r, G.hills(52, -30, 70, 0.002), [10, 13, 28]);
  r = G.layer(ctx, v, 1);
  const rock = Math.sin(t * 5.5) * 0.02 + ck * 0.006;
  const carInfo = G.car(ctx, { x: 0, y: 4, s: 1.15, face: 1, tilt: rock, heads: 1, lights: 0.25 + ck * 0.3, tail: 0.25, rim: rim([60, 76, 130], 2, -1.5) });
  G.beam(ctx, carInfo.head[0] + 10, carInfo.head[1], 0.06, 520, 0.2, [255, 240, 200], 0.06 + ck * 0.1);
  // the wolf on the roof
  G.wolf(ctx, { x: -30, y: -128, s: 0.62, face: 1, mode: 'crouch', eyes: 1, t, jaw: Math.sin(t * 3) > 0.5 ? 0.6 : 0 });
  // the crowd, pressing in
  for (let i = 0; i < 26; i++) {
    const h = hash(i * 2.7 + 3), side = i % 2 ? 1 : -1, row = Math.floor(i / 2) % 4;
    const x = side * (300 + row * 90 + h * 140) + Math.sin(t * 2 + i) * 10, s = 0.95 + hash(i) * 0.2;
    const P = Object.assign({ x, y: 6 + row * 4, s, face: -side, kind: 'zombie', rim: rim([50, 66, 110], 2, -1.4) }, G.pose.shamble(t * 0.7 + i, i));
    P.hands = [[60, -126 + Math.sin(t * 6 + i) * 10], [70, -140 + Math.cos(t * 5 + i) * 10]]; P.lean = 0.45;
    G.human(ctx, P);
  }
  const bpts = []; for (let i = 0; i < 90; i++) { const a = hash(i) * TAU + t * (1.2 + hash(i * 2)); bpts.push([Math.cos(a) * (300 + hash(i * 3) * 500), -520 + Math.sin(a * 1.3) * 120, 0.7 + hash(i * 4) * 0.5, i]); }
  G.bats(ctx, bpts, t);
  G.land(ctx, r, (x) => 8, INK);
  return { vig: 1 };
};

/* =====================================================================
   11. The road (bars 72-78): go go go
   ===================================================================== */
const carX = (t) => { const d = Math.max(0, t - T(72)); return d < 1 ? 500 * d * d : 500 + 1000 * (d - 1); };
const EDGE = carX(T(78)), GAP = 1500;
const ROADKILL = [380, 760, 2650, 4500];
shots.chase = function (ctx, W, H, t, bar, env) {
  const cx = carX(t), lt = t - T(72);
  const guns = gunsIn(72, 78), fk = flashK(t, guns), rec = recoilAt(t, guns);
  const ahead = smooth((bar - 75.6) / 1.6);
  const cam = { x: cx + 220 + ahead * 520, y: -230 - ahead * 40, w: 1500 + ahead * 700, wmin: 0.7 };
  Object.assign(cam, G.shake(t, [[T(72), 0.9]].concat(guns.map((g) => [T(g[0]), 0.3])).concat(ROADKILL.map((x) => [T(72) + 1, 0])), env.still));
  cam.sy += env.still ? 0 : Math.sin(t * 31) * 2.5;
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.02, 0.1);
  G.sky(ctx, r, SKY_NIGHT);
  G.stars(ctx, r, t, -1500, -200, 0.8, 9000 + cx * 0.02);
  r = G.layer(ctx, v, 0.03, 0.1);
  G.moon(ctx, v.cx * 0.03 - 420, -650, 60, [236, 232, 214], 1);
  r = G.layer(ctx, v, 0.06, 0.12);
  G.thing(ctx, v.cx * 0.06 - 900 - lt * 6, 160, 0.4, t, 1, thingEyes(t), { col: [10, 13, 30] });
  r = G.layer(ctx, v, 0.18, 0.25);
  G.land(ctx, r, G.hills(61, -50, 120, 0.0015), [14, 18, 40]);
  r = G.layer(ctx, v, 0.38, 0.45);
  G.treeRow(ctx, r, () => -20, 'pine', [10, 13, 30], 160, 300, 70, 62);
  G.land(ctx, r, () => -20, [10, 13, 30]);
  r = G.layer(ctx, v, 0.7, 0.75);
  G.treeRow(ctx, r, () => -8, 'bare', [6, 8, 18], 280, 460, 280, 63);
  r = G.layer(ctx, v, 1);
  const rimC = rim([66, 84, 150], 2.4, -1.5);
  // the werewolf: off the roof, then running you down, leaping, shot off the side
  const shotWolf = T(q(75, 2));
  let wx = cx - 560, wy = 0, wmode = 'run', wtilt = 0;
  if (t < T(72.35)) { const d = t - T(72); wx = cx - 40 - d * 900; wy = -125 + d * d * 2600; wmode = 'fall'; wtilt = d * 4; if (wy > 0) wy = 0; }
  else {
    const gain = smooth((bar - 72.6) / 1.4) * 330 + smooth((bar - 74.6) / 0.4) * 180;
    wx = cx - 600 + gain;
    if (bar >= 74.8 && t < shotWolf) { wmode = 'leap'; wy = -Math.sin(clamp((bar - 74.8) / 0.45) * Math.PI / 2) * 120; }
    if (t >= shotWolf) { const d = t - shotWolf; wx -= 520 * easeOut(d / 0.6) - Math.max(0, d - 1.2) * 120; wy = d < 0.8 ? -120 + d * d * 300 : 0; wmode = d < 0.8 ? 'fall' : 'run'; wtilt = d < 0.8 ? d * 5 : 0; }
  }
  G.wolf(ctx, { x: wx, y: Math.min(0, wy), s: 0.78, face: 1, mode: wmode, ph: t * 2.6, eyes: 1, t, tilt: wtilt, rim: rim([90, 100, 160], 2, -1.5) });
  // zombies in the road: hit and thrown
  for (const zx of ROADKILL) {
    const hitT = (() => { let lo = T(72), hi = T(78); for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (carX(m) + 200 < zx) lo = m; else hi = m; } return hi; })();
    const d = t - hitT;
    let x = zx, y = 0, tilt = 0;
    if (d > 0) { x += d * 900; y = -d * 1100 + d * d * 1500; tilt = d * 11; }
    if (d > 1.6) continue;
    const lit = zx - cx < 900 && zx > cx ? 1 : 0;
    G.human(ctx, Object.assign({ x, y: Math.min(y, 0), s: 1.0, face: -1, kind: 'zombie', col: bar < 72.5 && lit ? [150, 150, 140] : INK, tilt }, G.pose.shamble(t * 0.6, zx)));
  }
  // the bridge and the gap
  const deck0 = EDGE - 1000;
  const ground = (x) => (x < deck0 ? 8 : x < EDGE ? 8 : x < EDGE + GAP ? 4000 : 8);
  if (deck0 < r.x1) {
    ctx.fillStyle = G.rgb([3, 4, 8]);
    const gx0 = Math.max(r.x0, deck0 - 40), gx1 = Math.min(r.x1, EDGE + GAP + 60);
    if (gx1 > gx0) { const gr = ctx.createLinearGradient(0, 0, 0, 900); gr.addColorStop(0, '#0b0f22'); gr.addColorStop(1, '#000'); ctx.fillStyle = gr; ctx.fillRect(gx0, 10, gx1 - gx0, 2000); }
    ctx.fillStyle = G.rgb(INK);
    ctx.fillRect(deck0, 0, EDGE - deck0, 22);
    for (let x = deck0; x < EDGE - 20; x += 90) { ctx.fillRect(x, -70, 8, 70); }
    ctx.fillRect(deck0, -72, EDGE - deck0 - 30, 7);
    for (let k = 0; k < 4; k++) { ctx.save(); ctx.translate(EDGE - 10 + k * 12, 10); ctx.rotate(0.6 + k * 0.25); ctx.fillRect(0, -4, 60 - k * 8, 8); ctx.restore(); }
    // the far side
    ctx.beginPath(); ctx.moveTo(EDGE + GAP, 8); ctx.lineTo(EDGE + GAP + 40, 300); ctx.lineTo(EDGE + GAP + 5000, 300); ctx.lineTo(EDGE + GAP + 5000, 8); ctx.fill();
  }
  // the car
  const wheel = cx / 26;
  const kick = bar < 72.3 ? Math.sin((bar - 72) / 0.3 * Math.PI) * 6 : 0;
  const carInfo = G.car(ctx, { x: cx, y: 8, s: 1, face: 1, wheel, heads: 1, lights: 1, tail: 0.9, bounce: kick + Math.abs(Math.sin(t * 23)) * 1.5, tilt: -kick * 0.004, rim: rimC });
  // the friend leaning out of the window, firing back
  const lean = smooth((bar - 73.8) / 0.3) * (1 - smooth((bar - 76.6) / 0.3));
  if (lean > 0) {
    const wx2 = carInfo.window[0] - 10, wy2 = carInfo.window[1] - 4;
    ctx.fillStyle = G.rgb(INK);
    ctx.beginPath(); ctx.arc(wx2 - 20 * lean, wy2 - 30 * lean, 12, 0, TAU); ctx.fill();
    ctx.fillRect(wx2 - 34 * lean, wy2 - 28 * lean, 30, 40);
    ctx.save(); ctx.translate(wx2 - 30 * lean, wy2 - 18 * lean); ctx.rotate(Math.PI - 0.05 - rec * 0.3); ctx.fillRect(0, -3, 96, 6); ctx.restore();
    if (fk > 0.01) G.muzzle(ctx, wx2 - 30 * lean - 96, wy2 - 18 * lean + 5, Math.PI - rec * 0.3, Math.min(1, fk), 11);
  }
  // headlights: blasting on at the start
  const on = smooth((bar - 72) / 0.06);
  G.beam(ctx, carInfo.head[0] + 6, carInfo.head[1], 0.05, 1100, 0.2, [255, 246, 220], 0.32 * on);
  // bats behind
  const bpts = []; for (let i = 0; i < 70; i++) { const a = hash(i) * TAU + t * (2 + hash(i * 2)); bpts.push([cx - 800 - hash(i * 3) * 600 + Math.cos(a) * 120, -300 + Math.sin(a) * 90 - hash(i * 7) * 160, 0.7 + hash(i * 4) * 0.4, i]); }
  if (bar > 72.6) G.bats(ctx, bpts, t);
  G.land(ctx, r, (x) => (x > deck0 && x < EDGE + GAP ? 2000 : 8), INK);
  // speed: streaks and bushes
  r = G.layer(ctx, v, 1.5, 1.1);
  G.grass(ctx, r, () => 190, INK, 120, 26, 12, t, 0.1);
  G.screen(ctx);
  ctx.strokeStyle = 'rgba(160,180,255,0.08)'; ctx.lineWidth = Math.max(1, W / 900);
  ctx.beginPath(); for (let i = 0; i < 26; i++) { const y = hash(i * 4.1) * H, x = (((hash(i) * 3 - (t * 2.6 + hash(i * 2))) % 1) + 1) % 1 * W * 1.4 - W * 0.2; ctx.moveTo(x, y); ctx.lineTo(x + W * 0.25, y); } ctx.stroke();
  return { vig: 1, flash: [255, 220, 180, (bar < 72.15 ? 0.25 * (1 - (bar - 72) / 0.15) : 0) + Math.min(0.22, fk * 0.22)] };
};

/* =====================================================================
   12. The bridge (bars 78-80): fly
   ===================================================================== */
const PLANKS = [[0.1, -720, 0.6], [0.25, -700, -0.4], [0.35, -740, 1.2], [0.5, -690, -1.0], [0.62, -760, 0.3]];
shots.jump = function (ctx, W, H, t, bar, env) {
  const u = clamp((bar - 78) / 2);
  const cam = { x: 0, y: -250, w: lerp(1850, 1650, u), wmin: 0.7 };
  Object.assign(cam, G.shake(t, [[T(78), 0.6]], env.still));
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.04, 0.1);
  G.sky(ctx, r, [[-1500, '#02040c'], [-700, '#0b1534'], [-150, '#24316a'], [200, '#24316a']]);
  G.stars(ctx, r, t, -1500, -300, 0.8, 4000);
  r = G.layer(ctx, v, 1);
  G.moon(ctx, 0, -340, 330, [246, 238, 210], 1.15);
  G.clouds(ctx, r, t, -900, -120, [16, 22, 50], 0.3, 6, 71, 5);
  // the gorge: far canyon walls fading into the dark, cliffs either side
  const deep = ctx.createLinearGradient(0, -10, 0, 700); deep.addColorStop(0, '#141c40'); deep.addColorStop(0.35, '#080b1c'); deep.addColorStop(1, '#000');
  ctx.fillStyle = deep; ctx.fillRect(r.x0, -10, r.x1 - r.x0, r.y1 + 10);
  for (const [k, base, col] of [[0, 30, [18, 24, 54]], [1, 110, [11, 14, 34]], [2, 220, [6, 8, 20]]]) {
    ctx.fillStyle = G.rgb(col); ctx.beginPath(); ctx.moveTo(r.x0, r.y1 + 10);
    for (let x = r.x0; x <= r.x1 + 40; x += 40) ctx.lineTo(x, base + 40 * G.fbm(x * 0.004, 70 + k) + Math.abs(x) * (0.05 + k * 0.04));
    ctx.lineTo(r.x1 + 40, r.y1 + 10); ctx.fill();
  }
  ctx.fillStyle = 'rgba(140,160,230,0.25)'; ctx.fillRect(-140, 520, 300, 3);
  ctx.fillStyle = G.rgb(INK);
  ctx.beginPath(); ctx.moveTo(r.x0 - 10, -20); ctx.lineTo(-760, -20); ctx.lineTo(-700, 60); ctx.lineTo(-800, 260); ctx.lineTo(-640, 700); ctx.lineTo(r.x0 - 10, 900); ctx.fill();
  ctx.beginPath(); ctx.moveTo(r.x1 + 10, -20); ctx.lineTo(760, -20); ctx.lineTo(720, 80); ctx.lineTo(820, 300); ctx.lineTo(680, 700); ctx.lineTo(r.x1 + 10, 900); ctx.fill();
  ctx.fillRect(-1100, -26, 340, 14);   // the broken deck
  for (let x = -1100; x < -770; x += 90) ctx.fillRect(x, -96, 8, 72);
  for (const [d0, x0, rot] of PLANKS) { const d = (t - T(78)) * 0.5 - d0; if (d < 0) continue; ctx.save(); ctx.translate(x0 + d * 60, -14 + d * d * 900); ctx.rotate(rot + d * 3); ctx.fillRect(-30, -4, 60, 8); ctx.restore(); }
  // the wolf leaps after you, and falls
  const wd = (bar - 78.5) / 1.5;
  if (wd > 0) { const x = lerp(-760, -150, wd), y = -40 - Math.sin(Math.min(wd, 0.5) * Math.PI) * 260 + Math.max(0, wd - 0.5) ** 2 * 2600; G.wolf(ctx, { x, y, s: 0.7, face: 1, mode: wd < 0.4 ? 'leap' : 'fall', tilt: wd > 0.4 ? (wd - 0.4) * 5 : -0.3, eyes: 1, t }); }
  // the car across the moon, in slow motion
  const x = lerp(-820, 820, u), y = -36 - Math.sin(u * Math.PI) * 370, tilt = lerp(-0.18, 0.2, u);
  const info = G.car(ctx, { x, y, s: 0.95, face: 1, wheel: t * 3, heads: 1, lights: 1, tail: 0.8, tilt });
  G.beam(ctx, info.head[0] + 6, info.head[1], tilt + 0.05, 700, 0.18, [255, 246, 220], 0.22);
  // the dust and splinters at take-off
  G.sparks(ctx, -760, -30, (t - T(78)) * 0.6, 30, 78, { life: 1, g: 400, speed: 300, dir: -1.2, spread: 1.4, col: [40, 44, 70], add: false, size: 6 });
  return { vig: 1 };
};

/* =====================================================================
   13. The far side (bars 80-88): landing, and the light comes
   ===================================================================== */
function dawnSky(k) {   // 0 night → 1 full dawn, sun on the right
  const c = (a, b) => G.mixc(a, b, k);
  return [[-1500, c([2, 3, 9], [34, 38, 92])], [-800, c([6, 10, 27], [96, 74, 140])], [-350, c([18, 25, 55], [222, 116, 120])], [-100, c([28, 36, 72], [255, 170, 110])], [100, c([28, 36, 72], [255, 214, 140])]];
}
shots.dawn = function (ctx, W, H, t, bar, env) {
  const landT = T(80), dL = t - landT;
  const sky = smooth((bar - 82) / 5.5);
  const cam = G.camPath([[80, 0, -220, 1250], [81.3, -330, -250, 1600], [82.5, -660, -280, 1800], [84, 40, -230, 1350], [88, 200, -230, 1180]], bar);
  cam.wmin = 0.68;
  Object.assign(cam, G.shake(t, [[landT, 1.6]], env.still));
  const v = G.view(W, H, cam);
  let r = G.layer(ctx, v, 0.04, 0.1);
  G.sky(ctx, r, dawnSky(sky));
  G.stars(ctx, r, t, -1500, -200, 0.8 * (1 - sky), 4000);
  r = G.layer(ctx, v, 0.08, 0.12);
  G.glow(ctx, v.cx * 0.08 + 900, -40, 900, [255, 160, 80], 0.6 * sky);
  r = G.layer(ctx, v, 0.2, 0.3);
  G.land(ctx, r, G.hills(81, -60, 150, 0.0014), G.mixc([12, 16, 36], [70, 40, 80], sky));
  r = G.layer(ctx, v, 0.45, 0.5);
  G.treeRow(ctx, r, () => -20, 'pine', G.mixc([8, 11, 26], [40, 22, 50], sky), 150, 280, 80, 82);
  G.land(ctx, r, () => -20, G.mixc([8, 11, 26], [40, 22, 50], sky));
  r = G.layer(ctx, v, 1);
  const warm = rim(G.mixc([60, 76, 130], [255, 170, 90], sky), 2.6, -1);
  // the gorge on the left; the horrors gather on the far edge, then run from the light
  const GL = -1000, GR = -560;
  const flee = smooth((bar - 82.3) / 1.2);
  for (let i = 0; i < 12; i++) {
    const arr = clamp((bar - 80.6 - hash(i) * 0.8) / 0.9);
    if (arr <= 0) continue;
    let x = lerp(-1900, GL - 40 - hash(i * 3) * 380, easeOut(arr)) - flee * (300 + hash(i * 5) * 900) * 1.4;
    const fleeing = flee > 0.05;
    G.human(ctx, Object.assign({ x, y: 6, s: 0.92 + hash(i) * 0.15, face: fleeing ? -1 : 1, kind: 'zombie', rim: warm }, fleeing ? G.pose.run(t * 2 + i, 0.8) : G.pose.shamble(t * 0.6 + i, i)));
  }
  const vk = clamp((bar - 81) / 0.5) * (1 - smooth((bar - 82.6) / 0.35));
  if (vk > 0.01) { ctx.save(); ctx.globalAlpha = vk; G.vampire(ctx, { x: GL - 200, y: 6, s: 0.8, open: 0.4 + flee, recoil: flee, eyes: 1 }); ctx.restore(); }
  const bpts = []; for (let i = 0; i < 80; i++) { const h = hash(i * 3.3), d = Math.max(0, t - T(82.5)), a = h * TAU; const x = GL - 300 + Math.cos(a) * (120 + d * 500 * (0.5 + h)) - d * 200, y = -260 + Math.sin(a) * 80 - d * 260 * h; if (t > T(81)) bpts.push([x, y, 0.7 + h * 0.4, i]); }
  if (bar < 86) G.bats(ctx, bpts, t);
  ctx.fillStyle = G.rgb(INK);
  ctx.beginPath(); ctx.moveTo(r.x0 - 10, 8); ctx.lineTo(GL, 8); ctx.lineTo(GL + 40, 120); ctx.lineTo(GL - 30, 400); ctx.lineTo(GL + 20, 2000); ctx.lineTo(r.x0 - 10, 2000); ctx.fill();
  ctx.beginPath(); ctx.moveTo(r.x1 + 10, 8); ctx.lineTo(GR, 8); ctx.lineTo(GR - 30, 140); ctx.lineTo(GR + 30, 420); ctx.lineTo(GR - 10, 2000); ctx.lineTo(r.x1 + 10, 2000); ctx.fill();
  // the car: lands, skids, steams
  const stop = clamp((bar - 80) / 1.5), cx = lerp(-260, 220, 1 - Math.pow(1 - stop, 2));
  const bounce = dL >= 0 && dL < 1.2 ? -Math.sin(dL * 16) * 16 * Math.exp(-dL * 4) : 0;
  const carInfo = G.car(ctx, { x: cx, y: 8, s: 1, face: 1, wheel: cx / 26, bounce, heads: bar < 84 ? 1 : null, lights: 0.6 * (1 - sky), tail: 0.4, hubcap: dL < 0.25, rim: warm });
  G.sparks(ctx, cx, 6, dL, 40, 80, { life: 0.8, g: 900, speed: 600, dir: Math.PI + 0.3, spread: 1.2, col: [255, 190, 100], size: 3 });
  // steam from the hood
  const spr = G.fogSprite([200, 200, 210]);
  for (let i = 0; i < 6; i++) { const d = ((t * 0.5 + i / 6) % 1), x = cx + 170 + d * 30, y = -80 - d * 200; ctx.globalAlpha = 0.25 * (1 - d) * clamp(dL); ctx.drawImage(spr, x - 60 - d * 60, y - 30, 120 + d * 120, 60 + d * 60); }
  ctx.globalAlpha = 1;
  // the hubcap rolls away
  const dh = t - T(q(80, 3));
  if (dh >= 0) {
    const roll = Math.min(dh, 1.8), hx = cx + 130 + 300 * roll - 70 * roll * roll, wob = Math.max(0, 1 - roll / 1.8);
    ctx.save(); ctx.translate(hx, -10 + (dh > 1.8 ? 6 : 0)); ctx.scale(dh > 1.8 ? 1 : Math.max(0.2, Math.abs(Math.cos(roll * (6 + roll * 8)))) * 1, dh > 1.8 ? 0.25 : 1);
    ctx.fillStyle = G.rgb([120, 124, 140]); ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.restore();
    void wob;
  }
  // the two of you, out of the car, into the light
  const out = smooth((bar - 84) / 0.5);
  if (out > 0) {
    const jump = (() => { const d = t - T(85.5); return d >= 0 && d < 0.5 ? Math.sin(d / 0.5 * Math.PI) * 44 : 0; })();
    const yP = Object.assign({ x: cx - 120 - out * 170, y: 34 - jump, s: 1.0, face: 1, kind: 'you', rim: warm }, G.pose.stand(t, 2));
    const fP = Object.assign({ x: cx - 60 - out * 50, y: 36 - jump, s: 1.08, face: 1, kind: 'friend', rim: warm }, G.pose.stand(t, 1));
    if (jump > 0) { const s1 = G.shoulder(yP), s2 = G.shoulder(fP); yP.hands = [[s1[0] - 10, s1[1] - 56], [s1[0] + 12, s1[1] - 58]]; fP.hands = [[s2[0] - 14, s2[1] - 55], [s2[0] + 10, s2[1] - 58]]; }
    else { fP.gun = { ang: -1.9, pump: 0 }; fP.hands = G.gunHands(fP, -1.9); }
    ctx.globalAlpha = out; G.human(ctx, yP); G.human(ctx, fP); ctx.globalAlpha = 1;
  }
  G.fog(ctx, r, -60, 40, G.mixc([60, 70, 120], [255, 180, 150], sky), 0.2, t, 10, 88);
  return { vig: 1, flash: dL >= 0 && dL < 0.3 ? [255, 210, 160, 0.25 * (1 - dL / 0.3)] : null };
};

/* =====================================================================
   14. Sunrise (bars 88-96): we will survive. Right?
   ===================================================================== */
shots.sunrise = function (ctx, W, H, t, bar, env) {
  if (bar >= 94) return { fade: 1 };
  const cam = G.camPath([[88, 0, -70, 1750], [92, 0, -150, 1150], [94, 0, -170, 1040]], bar);
  cam.wmin = 0.72;
  Object.assign(cam, G.shake(t, [[T(92), 0.35]], env.still));
  const v = G.view(W, H, cam);
  const blinkA = T(92), blinkB = T(93);
  const eyeK = smooth((t - blinkA - 0.25) / 0.4);   // how much the sun has become an eye
  const dim = eyeK * 0.4;
  let r = G.layer(ctx, v, 0.05, 0.1);
  const sky = [[-1400, [40, 46, 104]], [-700, [130, 84, 146]], [-300, [246, 140, 116]], [-60, [255, 196, 132]], [200, [255, 214, 150]]].map(([y, c]) => [y, G.mixc(c, [110, 24, 36], dim)]);
  G.sky(ctx, r, sky);
  // the sun, rising (in the action plane, so the framing holds it)
  r = G.layer(ctx, v, 1);
  const sunY = lerp(-20, -300, easeOut(clamp((bar - 88) / 3.6))), SR = 150, SX = 0;
  G.glow(ctx, SX, sunY, SR * 7, G.mixc([255, 170, 90], [255, 50, 40], eyeK), 0.55);
  G.glow(ctx, SX, sunY, SR * 2.6, G.mixc([255, 220, 150], [255, 120, 80], eyeK), 0.6);
  const lids = (() => {   // 0 open, 1 shut
    const b = (c, dur) => { const d = t - c; return d < 0 || d > dur ? 0 : Math.sin(d / dur * Math.PI); };
    return Math.max(b(blinkA, 0.42), b(blinkB, 0.6));
  })();
  ctx.save(); ctx.beginPath(); ctx.arc(SX, sunY, SR, 0, TAU); ctx.clip();
  const gr = ctx.createRadialGradient(SX, sunY, 0, SX, sunY, SR);
  gr.addColorStop(0, 'rgb(255,250,226)'); gr.addColorStop(0.7, G.rgb(G.mixc([255, 226, 160], [255, 170, 60], eyeK))); gr.addColorStop(1, G.rgb(G.mixc([255, 190, 120], [200, 70, 30], eyeK)));
  ctx.fillStyle = gr; ctx.fillRect(SX - SR, sunY - SR, SR * 2, SR * 2);
  if (eyeK > 0) {
    ctx.strokeStyle = `rgba(140,40,10,${0.5 * eyeK})`; ctx.lineWidth = 2;
    ctx.beginPath(); for (let i = 0; i < 40; i++) { const a = i / 40 * TAU + hash(i) * 0.1, k = 0.7 + hash(i * 3) * 0.3; ctx.moveTo(SX + Math.cos(a) * SR * 0.25, sunY + Math.sin(a) * SR * 0.25); ctx.lineTo(SX + Math.cos(a) * SR * k, sunY + Math.sin(a) * SR * k); } ctx.stroke();
    const look = smooth((bar - 92.4) / 0.6) * 0.24, pw = SR * 0.16 * eyeK * (1 + 0.15 * Math.sin(t * 2));
    ctx.fillStyle = 'rgb(8,2,2)'; ctx.beginPath(); ctx.ellipse(SX, sunY + SR * look, pw, SR * 0.84, 0, 0, TAU); ctx.fill();
  }
  if (lids > 0) {
    ctx.fillStyle = G.rgb([46, 10, 14]);
    ctx.beginPath(); ctx.ellipse(SX, sunY - SR, SR * 1.05, SR * 2 * lids, 0, 0, Math.PI); ctx.fill();
    ctx.beginPath(); ctx.ellipse(SX, sunY + SR, SR * 1.05, SR * 2 * lids, 0, Math.PI, TAU); ctx.fill();
  }
  ctx.restore();
  // birds crossing the sun; gone when it blinks
  if (bar > 88.8 && bar < 92.05) {
    const u = (bar - 88.8) / 3.2, pts = [];
    for (let i = 0; i < 9; i++) { const row = Math.ceil(i / 2), sd = i % 2 ? 1 : -1; pts.push([lerp(-1100, 900, u) - row * 40, sunY - 40 + row * 20 * sd + Math.sin(t * 2 + i) * 4, 1.0, i]); }
    G.birds(ctx, pts, t, [26, 12, 22]);
  }
  // distant hills in the mist
  [[0.45, 10, 70, [150, 86, 130]], [0.62, 70, 90, [110, 60, 104]], [0.8, 130, 110, [70, 38, 80]]].forEach(([p, base, amp, col], i) => {
    r = G.layer(ctx, v, p, p);
    G.land(ctx, r, G.hills(90 + i, base, amp, 0.0016 + i * 0.0004), G.mixc(col, [40, 10, 20], dim));
    G.fog(ctx, r, base - 30, base + 30, G.mixc([255, 200, 170], [180, 80, 80], dim), 0.25, t, 6 + i * 3, 91 + i);
  });
  // the car's roof, and the two of you on it, from behind
  r = G.layer(ctx, v, 1);
  ctx.fillStyle = G.rgb([10, 6, 10]);
  ctx.beginPath(); ctx.moveTo(-520, 900); ctx.lineTo(-470, 290); ctx.quadraticCurveTo(-440, 240, -370, 238); ctx.lineTo(370, 238); ctx.quadraticCurveTo(440, 240, 470, 290); ctx.lineTo(520, 900); ctx.fill();
  const turn = smooth((bar - 93.2) / 0.3);
  const warm = G.mixc([255, 170, 110], [255, 60, 50], eyeK);
  for (const [x, who, s, tr] of [[-88, 'you', 1.5, 1], [88, 'friend', 1.56, -1]]) {
    ctx.save(); ctx.translate(-2 * tr, -2.5); G.backView(ctx, x, 244, s, who, { sit: 1, col: warm, turn: tr * turn }); ctx.restore();
    G.backView(ctx, x, 244, s, who, { sit: 1, col: [10, 6, 10], turn: tr * turn, arms: [[-34, -6], [34, -8]] });
  }
  return { vig: 0.9, flash: lids > 0.6 && t < blinkA + 0.5 ? [80, 0, 0, 0.12] : null, grain: 0.06 };
};

window.WWS.shots = shots;
})();
