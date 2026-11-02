// You Are Slime: physics.
// Every slime, crate, ball and drop of goo is made of small circular particles stepped with
// position-based dynamics (4 substeps a frame). A slime is a cluster held together by
// shape matching with a rest shape that creeps toward whatever it is squeezed into
// (plasticity) while its overall ellipse is pulled back toward round (or tall, or flat,
// depending on the stick). Particles that get pinched off become loose goo; touching loose
// goo absorbs it. Crates and the ball are the same solver with stiffness 1.
'use strict';

const R = 9;                 // particle radius, world units
const G = 1800;              // gravity
const SUB = 4;
const DT = 1 / 60;
const H = DT / SUB;
const MAXP = 760;
const WORLD_W = 3200;
const LINK = 3.2 * R;        // connectivity range for splitting
const COH = 2.7 * R;         // cohesion range
const CELL = LINK;
const SPACING = 1.8 * R;     // rest spacing used for a slime's target size
const MAX_PLAYER = 300, MAX_NPC = 110, FOOD_CAP = 90;
const CH_FOOD = 3;

// ---------- particles (structure of arrays)
const px = new Float64Array(MAXP), py = new Float64Array(MAXP);
const ox = new Float64Array(MAXP), oy = new Float64Array(MAXP);
const vx = new Float64Array(MAXP), vy = new Float64Array(MAXP);
const lx = new Float64Array(MAXP), ly = new Float64Array(MAXP);   // previous frame, for render interpolation
const im = new Float32Array(MAXP);       // inverse mass
const pfr = new Float32Array(MAXP);      // friction factor
const cool = new Float32Array(MAXP);     // seconds until loose goo can be absorbed
const alive = new Uint8Array(MAXP);
const pb = new Int16Array(MAXP);         // body index, -1 = loose
const pch = new Int8Array(MAXP);         // render channel: 0 player, 1 pink, 2 blue, 3 food, -1 none
const cf = new Uint8Array(MAXP);         // contact flags this frame: 1 ground, 2 wall at left, 4 wall at right, 8 ceiling, 16 water
const cb = new Float32Array(MAXP);       // bounce pad speed touched this frame
let pTop = 0;
const freeList = [];

function addP(x, y, ch, body, invMass, fr) {
  let i;
  if (freeList.length) i = freeList.pop();
  else if (pTop < MAXP) i = pTop++;
  else return -1;
  px[i] = ox[i] = lx[i] = x; py[i] = oy[i] = ly[i] = y;
  vx[i] = vy[i] = 0;
  im[i] = invMass; pfr[i] = fr; cool[i] = 0; alive[i] = 1; pb[i] = body; pch[i] = ch; cf[i] = 0; cb[i] = 0;
  return i;
}
function killP(i) { if (!alive[i]) return; alive[i] = 0; pb[i] = -1; pch[i] = -1; freeList.push(i); }
function particlesFree() { return MAXP - pTop + freeList.length; }

// ---------- world state
const Sim = {
  t: 0, frame: 0,
  statics: [], waters: [], bodies: [], taps: [], player: null, npcs: [],
  press: null, wheel: null, events: [], absorbQ: [],
  foodCount: 0,
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function rect(x0, y0, x1, y1, o = {}) {
  const s = { t: 0, x0, y0, x1, y1, fr: o.fr ?? 0.9, bounce: o.bounce || 0, draw: o.draw || 'stone', vy: 0 };
  s.bx0 = x0; s.by0 = y0; s.bx1 = x1; s.by1 = y1;
  Sim.statics.push(s); return s;
}
function seg(ax, ay, bx, by, th, o = {}) {
  const s = { t: 1, ax, ay, bx, by, th, fr: o.fr ?? 0.9, bounce: 0, draw: o.draw || 'ramp', w: 0, cx: 0, cy: 0 };
  segBounds(s); Sim.statics.push(s); return s;
}
function segBounds(s) {
  s.bx0 = Math.min(s.ax, s.bx) - s.th; s.bx1 = Math.max(s.ax, s.bx) + s.th;
  s.by0 = Math.min(s.ay, s.by) - s.th; s.by1 = Math.max(s.ay, s.by) + s.th;
}
function circ(x, y, r, o = {}) {
  const s = { t: 2, cx: x, cy: y, r, fr: o.fr ?? 0.9, bounce: 0, draw: o.draw || 'none', w: o.w || 0 };
  s.bx0 = x - r; s.bx1 = x + r; s.by0 = y - r; s.by1 = y + r;
  Sim.statics.push(s); return s;
}

// ---------- bodies
function hexDisc(n, s) {
  const pts = [];
  const rows = Math.ceil(Math.sqrt(n)) + 3;
  for (let j = -rows; j <= rows; j++) for (let i = -rows; i <= rows; i++) {
    const x = (i + (j & 1) * 0.5) * s, y = j * s * 0.866;
    pts.push([x, y, x * x + y * y + (i * 0.013 + j * 0.007)]);
  }
  pts.sort((a, b) => a[2] - b[2]);
  const out = pts.slice(0, n);
  let mx = 0, my = 0; for (const p of out) { mx += p[0]; my += p[1]; }
  mx /= n; my /= n;
  return out.map(p => [p[0] - mx, p[1] - my]);
}

function slimeRadius(n) { return Math.sqrt(n * 0.866 * SPACING * SPACING / Math.PI); }

function makeSlime(x, y, n, ch, name, isPlayer) {
  const bi = Sim.bodies.length;
  const b = {
    kind: 'slime', ch, name, player: !!isPlayer, ids: [], qx: [], qy: [],
    cx: x, cy: y, c: 1, s: 0, iq00: 0, iq01: 0, iq11: 0,
    alpha: 0.1, beta: 0.5, creep: 0.04, restore: 0.05, coh: 1, sx: 1, sy: 1, climbing: false,
    inX: 0, inY: 0, jumpHeld: false, jumpPressed: false, jumpBuf: 0, jumpCool: 0, rising: false,
    groundT: 1, wallT: 1, wallSide: 0, airT: 0, maxFall: 0, stretchT: 0, bounceCool: 0,
    avx: 0, avy: 0, face: 1, faceT: 1, blink: 0, nextBlink: 2 + Math.random() * 3,
    ex: x, ey: y, max: isPlayer ? MAX_PLAYER : MAX_NPC,
    ai: { t: 0, tx: x, ty: y, stuck: 0, moodT: 0, mood: 0, holdT: 0 },
  };
  for (const p of hexDisc(n, 1.75 * R)) {
    const id = addP(x + p[0], y + p[1], ch, bi, 1, 0.45);
    if (id < 0) break;
    b.ids.push(id); b.qx.push(p[0]); b.qy.push(p[1]);
  }
  Sim.bodies.push(b);
  computeAqq(b);
  return b;
}

function makeRigid(pts, x, y, shape, invMass, fr, extra = {}) {
  const bi = Sim.bodies.length;
  const b = Object.assign({ kind: 'rigid', shape, ids: [], qx: [], qy: [], cx: x, cy: y, c: 1, s: 0, alpha: 1, beta: 0, bounceCool: 0 }, extra);
  for (const p of pts) {
    const id = addP(x + p[0], y + p[1], -1, bi, invMass, fr);
    b.ids.push(id); b.qx.push(p[0]); b.qy.push(p[1]);
  }
  Sim.bodies.push(b);
  return b;
}
function makeCrate(x, y, nx, ny) {
  const pts = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([(i - (nx - 1) / 2) * 2 * R, (j - (ny - 1) / 2) * 2 * R]);
  return makeRigid(pts, x, y, 'crate', 0.6, 0.8, { w: nx * 2 * R, h: ny * 2 * R });
}
function makeBall(x, y) {
  return makeRigid(hexDisc(19, 2 * R), x, y, 'ball', 0.9, 0.9, { r: 4 * R + R * 0.9 });
}

function computeAqq(b) {
  let a = 0, c = 0, d = 0;
  const n = b.ids.length;
  for (let k = 0; k < n; k++) { const x = b.qx[k], y = b.qy[k]; a += x * x; c += x * y; d += y * y; }
  const det = a * d - c * c;
  if (det > 1e-6) { b.iq00 = d / det; b.iq01 = -c / det; b.iq11 = a / det; }
  else { b.iq00 = b.iq11 = 0; b.iq01 = 0; }
}

// ---------- world layout (world units, y down; street level is y = 900)
const STREET = 900;
const WATER = { x0: 820, x1: 2860, y: 1172, y1: 1240 };

function buildWorld() {
  pTop = 0; freeList.length = 0; alive.fill(0); pb.fill(-1); pch.fill(-1);
  Sim.statics = []; Sim.bodies = []; Sim.taps = []; Sim.npcs = []; Sim.events = []; Sim.absorbQ = [];
  Sim.t = 0; Sim.frame = 0;
  Sim.waters = [WATER];

  // outer walls and bedrock
  rect(-300, -1400, 0, 1600, { draw: 'none' });
  rect(WORLD_W, -1400, WORLD_W + 300, 1600, { draw: 'none' });
  rect(-300, 1240, WORLD_W + 300, 1600, { draw: 'sewerfloor' });

  // street slab, with two shafts and a floor grate down into the sewer
  rect(0, STREET, 640, 980);
  rect(740, STREET, 1500, 980);
  rect(1680, STREET, 2920, 980);
  rect(3020, STREET, WORLD_W, 980);
  for (let x = 1500; x < 1680; x += 34) rect(x, STREET, x + 10, STREET + 16, { draw: 'grate', fr: 0.7 });
  // earth either side of the sewer
  rect(0, 980, 560, 1240, { draw: 'earth' });
  rect(3100, 980, WORLD_W, 1240, { draw: 'earth' });
  // sewer walkways and the springs that throw you back up the shafts
  rect(560, 1160, 820, 1240);
  rect(2860, 1160, 3100, 1240);
  rect(655, 1148, 725, 1160, { draw: 'pad', bounce: 1080 });
  rect(2935, 1148, 3005, 1160, { draw: 'pad', bounce: 1080 });

  // overpass on the left with a ramp down to the street
  rect(140, 600, 860, 632, { draw: 'deck' });
  rect(826, 632, 860, STREET, { draw: 'column' });         // climb it, or take the spring
  rect(900, 888, 980, STREET, { draw: 'pad', bounce: 1120 });
  // the parked truck (solid, you can climb it)
  rect(160, 800, 445, 884, { draw: 'none', fr: 0.8 });
  rect(330, 758, 430, 800, { draw: 'none', fr: 0.8 });
  circ(212, 874, 26, { draw: 'none' });
  circ(392, 874, 26, { draw: 'none' });
  // the crawl duct: squish under it or jump on top
  rect(1230, 760, 1440, 846, { draw: 'duct', fr: 0.7 });
  // bounce pad next to the loading dock
  rect(2185, 888, 2270, STREET, { draw: 'pad', bounce: 1100 });
  // loading dock
  rect(2300, 720, 2860, STREET, { draw: 'dock' });
  // dumpster
  rect(3060, 826, 3190, STREET, { draw: 'none', fr: 0.8 });

  // hydraulic press over the street
  Sim.press = rect(1950, 584, 2110, 640, { draw: 'press', fr: 1 });
  // paddle wheel in the sewer
  Sim.wheel = { cx: 1150, cy: 1100, len: 108, ang: 0, w: 0.7, blades: [] };
  for (let k = 0; k < 4; k++) {
    const s = seg(0, 0, 0, 0, 7, { draw: 'none', fr: 1 });
    s.cx = Sim.wheel.cx; s.cy = Sim.wheel.cy; s.w = Sim.wheel.w;
    Sim.wheel.blades.push(s);
  }
  circ(Sim.wheel.cx, Sim.wheel.cy, 16, { draw: 'none', w: Sim.wheel.w });
  updateKinematics(0);

  // goo taps
  Sim.taps.push({ x: 2826, y: 628, t: 0, every: 0.45 });
  Sim.taps.push({ x: 1720, y: 1000, t: 0.2, every: 0.6 });
  Sim.taps.push({ x: 300, y: 470, t: 0.4, every: 0.9 });

  // props
  makeCrate(1770, 873, 3, 3);
  makeCrate(1770, 819, 3, 3);
  makeCrate(1840, 873, 3, 3);
  makeCrate(2640, 720 - 9 - 27, 4, 4);
  makeCrate(2470, 720 - 9 - 18, 3, 3);
  makeCrate(1650, 1120, 3, 3);
  makeBall(420, 600 - 9 - 36);

  // slimes
  Sim.player = makeSlime(1080, 840, 40, 0, 'P1', true);
  Sim.npcs.push(makeSlime(1335, 690, 34, 1, 'P2', false));
  Sim.npcs.push(makeSlime(2560, 650, 30, 2, 'P3', false));

  // goo to eat, in little puddles
  const puddles = [
    [360, 585, 5], [620, 585, 4], [800, 885, 4], [1110, 885, 3], [1330, 744, 5],
    [1900, 885, 4], [2380, 704, 4], [2740, 704, 5], [3120, 885, 4], [700, 1145, 4],
    [2980, 1145, 4], [1400, 1160, 5], [2200, 1160, 5], [2600, 1160, 4], [2100, 885, 3],
  ];
  for (const [x, y, n] of puddles) spawnGoo(x, y, n);
}

function spawnGoo(x, y, n, spread = 0) {
  let made = 0;
  for (const p of hexDisc(n, 1.9 * R)) {
    if (particlesFree() < 40) break;
    const i = addP(x + p[0] + (Math.random() - 0.5) * spread, y + p[1] - (Math.random() * spread), CH_FOOD, -1, 1, 0.7);
    if (i < 0) break;
    made++;
  }
  return made;
}

function updateKinematics(t) {
  // press: hold up, slam, hold down, rise
  const p = Sim.press;
  const cyc = t % 4.6;
  const top = 640, bot = 868;
  let y;
  if (cyc < 1.2) y = top;
  else if (cyc < 1.42) { const u = (cyc - 1.2) / 0.22; y = top + (bot - top) * u * u; }
  else if (cyc < 2.6) y = bot;
  else { const u = (cyc - 2.6) / 2.0; y = bot + (top - bot) * (u * u * (3 - 2 * u)); }
  const prev = p.y1;
  p.y1 = y; p.y0 = y - 56; p.by0 = p.y0; p.by1 = p.y1;
  p.vy = t > 0 ? (y - prev) / H : 0;
  if (p.lastCyc !== undefined && p.lastCyc < 1.42 && cyc >= 1.42) Sim.events.push({ type: 'press', x: (p.x0 + p.x1) / 2, y: bot });
  p.lastCyc = cyc;

  const w = Sim.wheel;
  w.ang = t * w.w;
  for (let k = 0; k < 4; k++) {
    const a = w.ang + k * Math.PI / 2, s = w.blades[k];
    s.ax = w.cx + Math.cos(a) * 18; s.ay = w.cy + Math.sin(a) * 18;
    s.bx = w.cx + Math.cos(a) * w.len; s.by = w.cy + Math.sin(a) * w.len;
    segBounds(s);
  }
}

// ---------- spatial grid (dense; the world is bounded)
const GX0 = -300, GY0 = -1400;
const GW = Math.ceil((WORLD_W + 600) / CELL), GH = Math.ceil(3000 / CELL);
const cellHead = new Int32Array(GW * GH);
const cellNext = new Int32Array(MAXP);
const pCell = new Int32Array(MAXP);
function buildGrid() {
  cellHead.fill(-1);
  for (let i = 0; i < pTop; i++) {
    if (!alive[i]) continue;
    const cx = clamp(((px[i] - GX0) / CELL) | 0, 0, GW - 1);
    const cy = clamp(((py[i] - GY0) / CELL) | 0, 0, GH - 1);
    const c = cy * GW + cx;
    pCell[i] = c;
    cellNext[i] = cellHead[c]; cellHead[c] = i;
  }
}
function forNeighbours(i, fn) {
  const c = pCell[i], cx = c % GW, cy = (c / GW) | 0;
  for (let dy = -1; dy <= 1; dy++) {
    const yy = cy + dy; if (yy < 0 || yy >= GH) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const xx = cx + dx; if (xx < 0 || xx >= GW) continue;
      for (let j = cellHead[yy * GW + xx]; j !== -1; j = cellNext[j]) if (j > i) fn(j);
    }
  }
}

// ---------- particle pairs: collision, friction, cohesion, absorption
const COH2 = COH * COH;
function solvePairs() {
  const bodies = Sim.bodies;
  for (let i = 0; i < pTop; i++) {
    if (!alive[i]) continue;
    const c = pCell[i], cx = c % GW, cy = (c / GW) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy; if (yy < 0 || yy >= GH) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx; if (xx < 0 || xx >= GW) continue;
        for (let j = cellHead[yy * GW + xx]; j !== -1; j = cellNext[j]) {
          if (j <= i) continue;
          let ddx = px[j] - px[i], ddy = py[j] - py[i];
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > COH2 || d2 < 1e-10) continue;
          const bi = pb[i], bj = pb[j];
          const same = bi === bj && bi >= 0;
          if (same && bodies[bi].kind !== 'slime') continue;
          const looseSame = bi < 0 && bj < 0 && pch[i] === pch[j] && pch[i] >= 0;
          const minD = same ? 1.6 * R : looseSame ? 1.7 * R : 2 * R;
          const wi = im[i], wj = im[j], ws = wi + wj;
          if (ws === 0) continue;
          const d = Math.sqrt(d2), nx = ddx / d, ny = ddy / d;
          if (d < minD) {
            const corr = (minD - d) / ws;
            px[i] -= nx * corr * wi; py[i] -= ny * corr * wi;
            px[j] += nx * corr * wj; py[j] += ny * corr * wj;
            if (!same) {
              // friction between different things
              const rdx = (px[i] - ox[i]) - (px[j] - ox[j]), rdy = (py[i] - oy[i]) - (py[j] - oy[j]);
              const rn = rdx * nx + rdy * ny;
              const tx = rdx - rn * nx, ty = rdy - rn * ny;
              const mu = looseSame ? 0.05 : 0.35 * Math.min(pfr[i], pfr[j]) / 0.45;
              const f = Math.min(0.5, mu) / ws;
              px[i] -= tx * f * wi; py[i] -= ty * f * wi;
              px[j] += tx * f * wj; py[j] += ty * f * wj;
              // contact flags: normal pointing to i is (-nx,-ny), to j is (nx,ny)
              // only solid things (crates, other slimes) count as floor or wall, not loose goo
              // and only crates and the ball count as walls to climb
              if (bi !== bj && bi >= 0 && bj >= 0) {
                const ri = bodies[bj].kind === 'rigid', rj = bodies[bi].kind === 'rigid';
                if (-ny < -0.55) cf[i] |= 1; else if (ri && -nx > 0.7) cf[i] |= 2; else if (ri && -nx < -0.7) cf[i] |= 4;
                if (ny < -0.55) cf[j] |= 1; else if (rj && nx > 0.7) cf[j] |= 2; else if (rj && nx < -0.7) cf[j] |= 4;
              }
            }
          } else if (same || looseSame || (bi >= 0) !== (bj >= 0)) {
            let k = 0;
            if (same) k = 0.05 * bodies[bi].coh;
            else if (looseSame) k = 0.12;
            else {
              // loose goo next to a slime of its own colour drifts back to it
              const body = bodies[bi >= 0 ? bi : bj], loose = bi >= 0 ? j : i;
              if (body.kind === 'slime' && pch[loose] === body.ch && cool[loose] <= 0) k = 0.1;
            }
            if (k) {
              const corr = k * (d - minD) / ws;
              px[i] += nx * corr * wi; py[i] += ny * corr * wi;
              px[j] -= nx * corr * wj; py[j] -= ny * corr * wj;
            }
          }
          if (d < 2.25 * R && !same) {
            if (bi >= 0 && bj < 0 && pch[j] >= 0 && cool[j] <= 0 && bodies[bi].kind === 'slime') Sim.absorbQ.push(j, bi);
            else if (bj >= 0 && bi < 0 && pch[i] >= 0 && cool[i] <= 0 && bodies[bj].kind === 'slime') Sim.absorbQ.push(i, bj);
          }
        }
      }
    }
  }
}

// ---------- shape matching
function shapeMatch(b) {
  const ids = b.ids, n = ids.length;
  if (!n) return;
  const qx = b.qx, qy = b.qy;
  let cx = 0, cy = 0;
  for (let k = 0; k < n; k++) { cx += px[ids[k]]; cy += py[ids[k]]; }
  cx /= n; cy /= n;
  let a00 = 0, a01 = 0, a10 = 0, a11 = 0;
  for (let k = 0; k < n; k++) {
    const i = ids[k], dx = px[i] - cx, dy = py[i] - cy;
    a00 += dx * qx[k]; a01 += dx * qy[k]; a10 += dy * qx[k]; a11 += dy * qy[k];
  }
  const th = Math.atan2(a10 - a01, a00 + a11);
  const c = Math.cos(th), s = Math.sin(th);
  let m00 = c, m01 = -s, m10 = s, m11 = c;
  if (b.beta > 0 && n > 4 && b.iq00) {
    let l00 = a00 * b.iq00 + a01 * b.iq01, l01 = a00 * b.iq01 + a01 * b.iq11;
    let l10 = a10 * b.iq00 + a11 * b.iq01, l11 = a10 * b.iq01 + a11 * b.iq11;
    const det = l00 * l11 - l01 * l10;
    if (det > 1e-4) {
      const sc = 1 / Math.sqrt(det);
      const be = b.beta, ib = 1 - be;
      m00 = be * l00 * sc + ib * c; m01 = be * l01 * sc - ib * s;
      m10 = be * l10 * sc + ib * s; m11 = be * l11 * sc + ib * c;
    }
  }
  b.cx = cx; b.cy = cy; b.c = c; b.s = s;
  const a = b.alpha;
  for (let k = 0; k < n; k++) {
    const i = ids[k];
    const gx = cx + m00 * qx[k] + m01 * qy[k], gy = cy + m10 * qx[k] + m11 * qy[k];
    px[i] += (gx - px[i]) * a; py[i] += (gy - py[i]) * a;
  }
}

// once a frame: the rest shape creeps toward the current one, then its ellipse is pulled toward the target
function slimeRest(b) {
  const ids = b.ids, n = ids.length, qx = b.qx, qy = b.qy;
  if (n < 3) return;
  let cx = 0, cy = 0;
  for (let k = 0; k < n; k++) { cx += px[ids[k]]; cy += py[ids[k]]; }
  cx /= n; cy /= n;
  let a00 = 0, a01 = 0, a10 = 0, a11 = 0;
  for (let k = 0; k < n; k++) {
    const i = ids[k], dx = px[i] - cx, dy = py[i] - cy;
    a00 += dx * qx[k]; a01 += dx * qy[k]; a10 += dy * qx[k]; a11 += dy * qy[k];
  }
  const th = Math.atan2(a10 - a01, a00 + a11), c = Math.cos(th), s = Math.sin(th);
  b.cx = cx; b.cy = cy; b.c = c; b.s = s;

  const cr = b.creep;
  let mx = 0, my = 0;
  for (let k = 0; k < n; k++) {
    const i = ids[k], dx = px[i] - cx, dy = py[i] - cy;
    const lx_ = c * dx + s * dy, ly_ = -s * dx + c * dy;
    qx[k] += (lx_ - qx[k]) * cr; qy[k] += (ly_ - qy[k]) * cr;
    mx += qx[k]; my += qy[k];
  }
  mx /= n; my /= n;
  let c00 = 0, c01 = 0, c11 = 0;
  for (let k = 0; k < n; k++) {
    qx[k] -= mx; qy[k] -= my;
    c00 += qx[k] * qx[k]; c01 += qx[k] * qy[k]; c11 += qy[k] * qy[k];
  }
  c00 /= n; c01 /= n; c11 /= n;
  // covariance in world orientation
  const w00 = c * c * c00 - 2 * c * s * c01 + s * s * c11;
  const w01 = c * s * c00 + (c * c - s * s) * c01 - c * s * c11;
  const w11 = s * s * c00 + 2 * c * s * c01 + c * c * c11;
  const det = w00 * w11 - w01 * w01;
  if (det > 1e-6) {
    const rb = slimeRadius(n), v = rb * rb / 4;
    const tx = Math.sqrt(v) * b.sx, ty = Math.sqrt(v) * b.sy;
    const sd = Math.sqrt(det), t = Math.sqrt(w00 + w11 + 2 * sd);
    const s00 = (w00 + sd) / t, s01 = w01 / t, s11 = (w11 + sd) / t;
    const sdet = s00 * s11 - s01 * s01;
    const i00 = s11 / sdet, i01 = -s01 / sdet, i11 = s00 / sdet;
    // A_w = diag(tx,ty) * S^-1, then into the rest frame: A_r = R^T A_w R
    const m00 = tx * i00, m01 = tx * i01, m10 = ty * i01, m11 = ty * i11;
    const t00 = m00 * c + m01 * s, t01 = -m00 * s + m01 * c;
    const t10 = m10 * c + m11 * s, t11 = -m10 * s + m11 * c;
    const r00 = c * t00 + s * t10, r01 = c * t01 + s * t11;
    const r10 = -s * t00 + c * t10, r11 = -s * t01 + c * t11;
    const rate = b.restore * 0.5;
    for (let k = 0; k < n; k++) {
      const x = qx[k], y = qy[k];
      qx[k] = x + (r00 * x + r01 * y - x) * rate;
      qy[k] = y + (r10 * x + r11 * y - y) * rate;
    }
  }
  roundOff(b, th);
  computeAqq(b);
}

// Pull each angular sector of the rest shape out or in toward the target ellipse, so lumps
// and horns melt back into a blob without particles having to swap places.
const BINS = 12;
const binSum = new Float64Array(BINS), binCnt = new Float64Array(BINS), binScale = new Float64Array(BINS);
function roundOff(b, th) {
  const n = b.ids.length, qx = b.qx, qy = b.qy;
  const rb = slimeRadius(n), ea = rb * b.sx, eb = rb * b.sy;
  binSum.fill(0); binCnt.fill(0);
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(qy[k], qx[k]);
    const bi = ((((a / (2 * Math.PI)) + 1) % 1) * BINS) | 0;
    binSum[bi] += qx[k] * qx[k] + qy[k] * qy[k]; binCnt[bi]++;
  }
  for (let k = 0; k < BINS; k++) {
    if (!binCnt[k]) { binScale[k] = 1; continue; }
    const phi = (k + 0.5) / BINS * 2 * Math.PI + th;   // sector direction in world space
    const c = Math.cos(phi), s = Math.sin(phi);
    const rho = 1 / Math.sqrt(c * c / (ea * ea) + s * s / (eb * eb));
    // a full sector of a uniform disc has mean r^2 = rho^2 / 2; a thin one, less
    const est = Math.sqrt(2 * binSum[k] / binCnt[k]);
    binScale[k] = clamp(rho / Math.max(est, R), 0.6, 1.6);
  }
  const rate = b.restore * 0.8, clip = 0.06 + b.restore;
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(qy[k], qx[k]);
    const f = (((a / (2 * Math.PI)) + 1) % 1) * BINS - 0.5;
    const i0 = Math.floor(f), u = f - i0;
    const s0 = binScale[(i0 + BINS) % BINS], s1 = binScale[(i0 + 1) % BINS];
    let sc = 1 + ((s0 + (s1 - s0) * u) - 1) * rate;
    // anything poking out past the outline (a horn, a fresh blob of goo) is drawn back in
    const phi = a + th, c = Math.cos(phi), s = Math.sin(phi);
    const rho = 1 / Math.sqrt(c * c / (ea * ea) + s * s / (eb * eb)) - R * 0.5;
    const r = Math.hypot(qx[k], qy[k]) * sc;
    if (r > rho) sc *= 1 + (rho / r - 1) * clip;
    qx[k] *= sc; qy[k] *= sc;
  }
}

// ---------- static geometry
function collideStatic(i) {
  let x = px[i], y = py[i];
  const st = Sim.statics;
  for (let k = 0; k < st.length; k++) {
    const s = st[k];
    if (x < s.bx0 - R || x > s.bx1 + R || y < s.by0 - R || y > s.by1 + R) continue;
    let nx, ny, pen;
    if (s.t === 0) {
      const qx = x < s.x0 ? s.x0 : x > s.x1 ? s.x1 : x;
      const qy = y < s.y0 ? s.y0 : y > s.y1 ? s.y1 : y;
      const dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
      if (d2 > 1e-12) {
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = R - d;
      } else {
        const l = x - s.x0, r = s.x1 - x, t = y - s.y0, bt = s.y1 - y;
        const m = Math.min(l, r, t, bt);
        if (m === t) { nx = 0; ny = -1; pen = t + R; }
        else if (m === bt) { nx = 0; ny = 1; pen = bt + R; }
        else if (m === l) { nx = -1; ny = 0; pen = l + R; }
        else { nx = 1; ny = 0; pen = r + R; }
      }
    } else if (s.t === 1) {
      const ex = s.bx - s.ax, ey = s.by - s.ay;
      let u = ((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey);
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const dx = x - (s.ax + ex * u), dy = y - (s.ay + ey * u), d2 = dx * dx + dy * dy, rr = R + s.th;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) { nx = 0; ny = -1; } else { nx = dx / d; ny = dy / d; }
      pen = rr - d;
    } else {
      const dx = x - s.cx, dy = y - s.cy, d2 = dx * dx + dy * dy, rr = R + s.r;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) { nx = 0; ny = -1; } else { nx = dx / d; ny = dy / d; }
      pen = rr - d;
    }
    x += nx * pen; y += ny * pen;
    // friction against the surface, which may be moving (press, wheel)
    let svx = 0, svy = 0;
    if (s.t === 0) svy = s.vy || 0;
    else if (s.w) { svx = -s.w * (y - s.cy); svy = s.w * (x - s.cx); }
    const dx = x - ox[i] - svx * H, dy = y - oy[i] - svy * H;
    const dn = dx * nx + dy * ny;
    const f = Math.min(1, s.fr * pfr[i]);
    x -= (dx - dn * nx) * f; y -= (dy - dn * ny) * f;
    if (ny < -0.55) cf[i] |= 1;
    else if (nx > 0.7) cf[i] |= 2;
    else if (nx < -0.7) cf[i] |= 4;
    else if (ny > 0.6) cf[i] |= 8;
    if (s.bounce && ny < -0.5 && s.bounce > cb[i]) cb[i] = s.bounce;
  }
  px[i] = x; py[i] = y;
}

// ---------- slime control (player and NPCs share it)
function controlSlime(b, dt) {
  const ids = b.ids, n = ids.length;
  if (!n) return;
  let g = 0, wl = 0, wr = 0, ce = 0, wet = 0, avx = 0, avy = 0, pad = 0;
  let cx = 0, cy = 0;
  for (let k = 0; k < n; k++) {
    const i = ids[k], f = cf[i];
    avx += vx[i]; avy += vy[i]; cx += px[i]; cy += py[i];
    if (f & 1) g++;
    if (f & 2) wl++;
    if (f & 4) wr++;
    if (f & 8) ce++;
    if (f & 16) wet++;
    if (cb[i] > pad) pad = cb[i];
  }
  avx /= n; avy /= n; cx /= n; cy /= n;
  b.avx = avx; b.avy = avy;
  const wasAir = b.groundT > 0.12;
  const grounded = g > 0 || wet > n * 0.25;
  if (grounded) {
    if (wasAir && b.maxFall > 380) Sim.events.push({ type: 'land', body: b, v: b.maxFall, x: cx, y: cy });
    b.groundT = 0; b.maxFall = 0; b.rising = false;
  } else {
    b.groundT += dt;
    if (avy > b.maxFall) b.maxFall = avy;
  }
  if (wet > n * 0.25 && !b.wet && avy > 150) Sim.events.push({ type: 'splash', body: b, v: avy, x: cx, y: WATER.y });
  b.wet = wet > n * 0.25;

  const inX = b.inX, inY = b.inY;
  const size = n;
  const heavy = clamp((size - 40) / 200, 0, 1);

  // molding: up = tall and firm, down = flat and runny
  b.stretchT = Math.max(0, b.stretchT - dt);
  let sy = inY < 0 ? 1 + 0.6 * -inY : 1 - 0.5 * inY;
  if (b.stretchT > 0) sy = Math.max(sy, 1.25);
  if (!grounded && !b.wet && inY > 0.4) sy = Math.min(sy, 0.6);
  b.sy += (sy - b.sy) * 0.25; b.sx = 1 / b.sy;
  const down = Math.max(0, inY), up = Math.max(0, -inY);
  b.alpha = 0.1 - 0.075 * down + 0.06 * up;
  b.creep = 0.02 + 0.18 * down;
  b.restore = 0.05 + 0.03 * Math.abs(inY);
  b.coh = 1 - 0.85 * down;

  // crawl
  const maxS = 390 - 110 * heavy;
  const air = !grounded && b.wallT > 0.1;
  const acc = air ? 1000 : 2600;
  let dv = 0;
  if (Math.abs(inX) > 0.05) dv = clamp(inX * maxS - avx, -acc * dt, acc * dt);
  else if (!air) dv = clamp(-avx, -900 * dt, 900 * dt);
  if (b.wet && Math.abs(inX) > 0.05) dv *= 0.7;
  // a little roll helps it crawl over bumps
  const spin = inX * 2.2 * dt * (air ? 0.3 : 1);
  for (let k = 0; k < n; k++) {
    const i = ids[k];
    vx[i] += dv - spin * (py[i] - cy);
    vy[i] += spin * (px[i] - cx);
  }

  // climbing: push into a wall and the slime sticks to it and creeps up
  const intoWall = (inX < -0.3 && wl > 0) || (inX > 0.3 && wr > 0);
  if (intoWall) { b.wallT = 0; b.wallSide = inX < 0 ? -1 : 1; } else b.wallT += dt;
  const climbing = b.wallT < 0.12 && !(g > 0 && inY > 0.3);
  if (climbing !== b.climbing) {
    b.climbing = climbing;
    for (let k = 0; k < n; k++) pfr[ids[k]] = climbing ? 0.08 : 0.45;   // slide up the wall instead of tearing
  }
  if (climbing) {
    let climb = -(150 + 120 * Math.abs(inX) + 120 * up) * (1 - 0.4 * heavy) * (inY > 0.5 ? -0.3 : 1);
    if (cy < 300) climb = 60;   // above the rooftops the walls get slippery
    for (let k = 0; k < n; k++) {
      const i = ids[k];
      vy[i] += -G * dt * 0.97 + clamp(climb - avy, -1600 * dt, 1600 * dt);
      vx[i] += b.wallSide * 120 * dt;
    }
  }
  // ceiling crawl: hold up against a ceiling
  if (ce > 0 && up > 0.4 && b.wallT >= 0.12) {
    for (let k = 0; k < n; k++) vy[ids[k]] += -G * dt * 1.05;
  }
  // squish: lean your weight down into whatever is underneath (grates, gaps)
  if (g > 0 && down > 0.5) for (let k = 0; k < n; k++) vy[ids[k]] += G * 0.8 * down * dt;
  // fast fall
  if (air && down > 0.6 && !b.wet) for (let k = 0; k < n; k++) vy[ids[k]] += G * 0.9 * dt;

  // jump
  b.jumpCool = Math.max(0, b.jumpCool - dt);
  b.bounceCool = Math.max(0, b.bounceCool - dt);
  if (b.jumpPressed) { b.jumpBuf = 0.15; b.jumpPressed = false; }
  else b.jumpBuf = Math.max(0, b.jumpBuf - dt);
  if (b.jumpBuf > 0 && b.jumpCool <= 0) {
    const J = 880 - 160 * heavy;
    if (b.groundT < 0.1) {
      for (let k = 0; k < n; k++) { const i = ids[k]; vy[i] = Math.min(vy[i] * 0.3, 0) - J; vx[i] += inX * 60; }
      b.jumpBuf = 0; b.jumpCool = 0.2; b.stretchT = 0.22; b.rising = true; b.groundT = 1;
      Sim.events.push({ type: 'jump', body: b, x: cx, y: cy });
    } else if (b.wallT < 0.16) {
      for (let k = 0; k < n; k++) { const i = ids[k]; vy[i] = -J * 0.92; vx[i] = -b.wallSide * 420; }
      b.jumpBuf = 0; b.jumpCool = 0.25; b.stretchT = 0.2; b.rising = true; b.wallT = 1;
      Sim.events.push({ type: 'jump', body: b, x: cx, y: cy });
    }
  }
  // short hop if you let go early
  if (b.rising && avy < 0 && !b.jumpHeld) for (let k = 0; k < n; k++) vy[ids[k]] += G * 0.9 * dt;
  if (avy >= 0) b.rising = false;

  // springs launch the whole slime
  if (pad > 0 && b.bounceCool <= 0) {
    for (let k = 0; k < n; k++) { const i = ids[k]; vy[i] = -pad; vx[i] *= 0.8; }
    b.bounceCool = 0.4; b.stretchT = 0.3; b.rising = true; b.groundT = 1;
    Sim.events.push({ type: 'boing', body: b, x: cx, y: cy });
  }
  if (Math.abs(inX) > 0.15) b.faceT = Math.sign(inX);
  else if (Math.abs(avx) > 60) b.faceT = Math.sign(avx);
}

function rigidFrame(b) {
  let pad = 0;
  for (const i of b.ids) if (cb[i] > pad) pad = cb[i];
  b.bounceCool = Math.max(0, b.bounceCool - DT);
  if (pad > 0 && b.bounceCool <= 0) {
    for (const i of b.ids) vy[i] = -pad * 0.9;
    b.bounceCool = 0.4;
  }
}

// ---------- NPC brains: chase goo, visit the player, get unstuck by jumping
function aiSlime(b, dt) {
  const a = b.ai;
  a.t -= dt;
  if (a.t <= 0) {
    a.t = 0.8 + Math.random() * 1.6;
    const r = Math.random();
    let best = null, bd = 1e12;
    if (r < 0.65) {
      for (let k = 0; k < 40; k++) {
        const i = (Math.random() * pTop) | 0;
        if (!alive[i] || pb[i] >= 0 || pch[i] < 0) continue;
        const d = Math.abs(px[i] - b.cx) + Math.abs(py[i] - b.cy) * 1.6;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best !== null && bd < 1400) { a.tx = px[best]; a.ty = py[best]; }
    else if (r < 0.85 && Sim.player) { a.tx = Sim.player.cx + (Math.random() - 0.5) * 200; a.ty = Sim.player.cy; }
    else { a.tx = 100 + Math.random() * (WORLD_W - 200); a.ty = b.cy; }
    a.mood = Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    a.moodT = 0.4 + Math.random() * 0.8;
  }
  const dx = a.tx - b.cx;
  b.inX = Math.abs(dx) > 30 ? Math.sign(dx) * 0.85 : 0;
  a.moodT -= dt;
  b.inY = a.moodT > 0 ? a.mood * 0.8 : 0;
  // stuck against something? jump, and sometimes give up on the target
  if (Math.abs(b.inX) > 0 && Math.abs(b.avx) < 30) a.stuck += dt; else a.stuck = Math.max(0, a.stuck - dt);
  let wantJump = false;
  if (a.stuck > 0.5) { wantJump = true; a.stuck = 0; if (Math.random() < 0.3) a.t = 0; }
  if (a.ty < b.cy - 120 && Math.abs(dx) < 260 && Math.random() < 0.04) wantJump = true;
  if (Math.random() < 0.003) wantJump = true;
  if (wantJump && b.groundT < 0.1) { b.jumpPressed = true; a.holdT = 0.2 + Math.random() * 0.4; }
  a.holdT -= dt;
  b.jumpHeld = a.holdT > 0;
}

// ---------- absorb loose goo, split off pinched pieces
function processAbsorb() {
  const q = Sim.absorbQ;
  for (let k = 0; k < q.length; k += 2) {
    const i = q[k], b = Sim.bodies[q[k + 1]];
    if (!alive[i] || pb[i] >= 0 || b.ids.length >= b.max) continue;
    const dx = px[i] - b.cx, dy = py[i] - b.cy;
    const lx_ = b.c * dx + b.s * dy, ly_ = -b.s * dx + b.c * dy;
    const was = pch[i];
    pb[i] = Sim.bodies.indexOf(b); pch[i] = b.ch; pfr[i] = b.climbing ? 0.08 : 0.45;
    b.ids.push(i); b.qx.push(lx_); b.qy.push(ly_);
    Sim.events.push({ type: 'absorb', body: b, food: was === CH_FOOD, x: px[i], y: py[i] });
  }
  q.length = 0;
}

const uf = new Int32Array(MAXP);
function ufFind(a) { while (uf[a] !== a) { uf[a] = uf[uf[a]]; a = uf[a]; } return a; }
function splitCheck() {
  const bodies = Sim.bodies;
  for (const b of bodies) if (b.kind === 'slime') for (const i of b.ids) uf[i] = i;
  const L2 = LINK * LINK;
  for (const b of bodies) {
    if (b.kind !== 'slime') continue;
    for (const i of b.ids) {
      forNeighbours(i, j => {
        if (pb[j] !== pb[i]) return;
        const dx = px[j] - px[i], dy = py[j] - py[i];
        if (dx * dx + dy * dy < L2) { const a = ufFind(i), c = ufFind(j); if (a !== c) uf[a] = c; }
      });
    }
  }
  for (let bi = 0; bi < bodies.length; bi++) {
    const b = bodies[bi];
    if (b.kind !== 'slime' || b.ids.length < 6) continue;
    const count = new Map();
    for (const i of b.ids) { const r = ufFind(i); count.set(r, (count.get(r) || 0) + 1); }
    if (count.size < 2) continue;
    let main = -1, mc = 0;
    for (const [r, c] of count) if (c > mc) { mc = c; main = r; }
    const ids = [], qx = [], qy = [];
    let lost = 0;
    for (let k = 0; k < b.ids.length; k++) {
      const i = b.ids[k];
      if (ufFind(i) === main) { ids.push(i); qx.push(b.qx[k]); qy.push(b.qy[k]); }
      else { pb[i] = -1; cool[i] = 0.7; pfr[i] = 0.7; lost++; }
    }
    b.ids = ids; b.qx = qx; b.qy = qy;
    computeAqq(b);
    if (lost) Sim.events.push({ type: 'split', body: b, n: lost });
  }
}

// ---------- the step
function stepSim() {
  Sim.frame++;
  for (let i = 0; i < pTop; i++) { lx[i] = px[i]; ly[i] = py[i]; }
  for (const b of Sim.bodies) if (b.kind === 'slime' && !b.player) aiSlime(b, DT);
  for (const b of Sim.bodies) {
    if (b.kind === 'slime') controlSlime(b, DT); else rigidFrame(b);
  }
  // goo taps
  let food = 0;
  for (let i = 0; i < pTop; i++) if (alive[i] && pb[i] < 0 && pch[i] === CH_FOOD) food++;
  Sim.foodCount = food;
  for (const tp of Sim.taps) {
    tp.t += DT;
    if (tp.t >= tp.every) {
      tp.t = 0;
      if (food < FOOD_CAP && particlesFree() > 60) {
        const i = addP(tp.x + (Math.random() - 0.5) * 4, tp.y, CH_FOOD, -1, 1, 0.7);
        if (i >= 0) { vy[i] = 60; food++; }
      }
    }
  }
  for (let i = 0; i < pTop; i++) { cf[i] = 0; cb[i] = 0; if (cool[i] > 0) cool[i] -= DT; }

  for (let s = 0; s < SUB; s++) {
    Sim.t += H;
    updateKinematics(Sim.t);
    // integrate
    for (let i = 0; i < pTop; i++) {
      if (!alive[i]) continue;
      let gy = G;
      if (py[i] > WATER.y && px[i] > WATER.x0 && px[i] < WATER.x1) {
        gy = -G * 0.32;
        vx[i] *= 0.994; vy[i] *= 0.985;
        cf[i] |= 16;
      }
      vy[i] += gy * H;
      ox[i] = px[i]; oy[i] = py[i];
      px[i] += vx[i] * H; py[i] += vy[i] * H;
    }
    buildGrid();
    solvePairs();
    for (const b of Sim.bodies) shapeMatch(b);
    for (let i = 0; i < pTop; i++) if (alive[i]) collideStatic(i);
    for (let i = 0; i < pTop; i++) {
      if (!alive[i]) continue;
      let x = (px[i] - ox[i]) / H, y = (py[i] - oy[i]) / H;
      const sp = x * x + y * y;
      if (sp > 2400 * 2400) { const f = 2400 / Math.sqrt(sp); x *= f; y *= f; }
      vx[i] = x; vy[i] = y;
    }
  }

  processAbsorb();
  for (const b of Sim.bodies) if (b.kind === 'slime') slimeRest(b);
  if (Sim.frame % 6 === 0) { buildGrid(); splitCheck(); }

  // anything that escapes the world goes home
  for (let i = 0; i < pTop; i++) {
    if (!alive[i]) continue;
    if (py[i] > 1500 || px[i] < -100 || px[i] > WORLD_W + 100 || py[i] < -1300) {
      if (pb[i] < 0) killP(i);
      else { px[i] = ox[i] = 1080; py[i] = oy[i] = 820; vx[i] = vy[i] = 0; }
    }
  }
}

// rain goo over a point (the "Goo rain" button)
function gooRain(x, y, n) {
  let made = 0;
  for (let k = 0; k < n; k++) {
    if (particlesFree() < 30) break;
    const i = addP(x + (Math.random() - 0.5) * 260, y - 120 - Math.random() * 260, CH_FOOD, -1, 1, 0.7);
    if (i < 0) break;
    vy[i] = Math.random() * 100; made++;
  }
  return made;
}
