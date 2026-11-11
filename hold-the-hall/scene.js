/* Hold the Hall: the scene. Draws the town from the engine's state and owns everything that is only for show:
 * the camera, the barricades, the night (a lightmap multiplied over the picture), fog, wrecks, walkers on the streets,
 * survivors in the yards, the fight of a run, particles, and the markers you tap.
 *
 * HH.Scene: init(canvas) · setState(s) · resize() · frame(dtSec) · fit(snap) · focus(block) · setInsets({ t, b, l, r })
 *   onTap(hit, x, y) / onHold(down, x, y): set by the UI. hit.kind: 'marker' (collect | down | job) · 'zombie' · 'person'
 *   · 'grave' · 'block' · 'none'
 *   shootAt(z, fromWall) · taken(block) · runStart(run) · runEnd(result) · float(x, y, text, col) · burst · shake
 *   intro: the object intro.js drives while the hall is being taken (see intro.js)
 */
(function (root) {
  'use strict';
  const HH = root.HH, D = HH.DATA, E = HH.Engine, A = HH.Art, P = A.P;
  const { N, LOT, P: PITCH, WORLD, C } = D, TAU = Math.PI * 2;
  const lot = (b) => 1 + b * PITCH;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const GK = 1.5, PAD = 200, RANGE = 2.3, FONT = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const HGT = { hall: 100, tower: 86, home: 38, garden: 16, workshop: 40, clinic: 46, armory: 46, gas: 40, bridge: 26 };

  let cv, g, W = 0, H = 0, dpr = 1, S = null, T = 0, reduced = false, seedKey = null;
  const cam = { x: 0, y: 416, z: 0.7, tx: 0, ty: 416, tz: 0.7 };
  const inset = { t: 60, b: 70, l: 0, r: 0 };
  let groundCv = null, groundKey = '', lightCv = null, lg = null;
  let walls = [], wallTiles = [], props = [];
  const zs = [], figs = new Map(), fx = [], floats = [], tracers = [], smoke = [];
  let hits = [], em = [], shakeAmt = 0, flashAmt = 0, fight = null, hordeOn = false;
  const born = {};
  const api = { onTap: null, onHold: null, intro: null, zs, figs };

  // ---------------------------------------------------------------- the territory
  const hallLit = () => !!(api.intro && api.intro.hall.restored);    // the story has the lights on: the hall is ours from here
  const own = (bx, by) => { if (bx < 0 || by < 0 || bx >= N || by >= N) return false; const b = S.blocks[by * N + bx]; return b.owned || (b.type === 'hall' && hallLit()); };
  function inside(tx, ty) {                          // is this tile inside the barricades?
    const sx = tx % PITCH === 0, sy = ty % PITCH === 0, bx = Math.floor((tx - 1) / PITCH), by = Math.floor((ty - 1) / PITCH);
    if (!sx && !sy) return own(bx, by);
    if (sx && !sy) return own(tx / PITCH - 1, by) && own(tx / PITCH, by);
    if (!sx && sy) return own(bx, ty / PITCH - 1) && own(bx, ty / PITCH);
    const kx = tx / PITCH, ky = ty / PITCH; return own(kx - 1, ky - 1) && own(kx, ky - 1) && own(kx - 1, ky) && own(kx, ky);
  }
  function distOwn(x, y, hallToo) {
    let best = 99; const h = hallToo || hallLit();
    for (const b of S.blocks) if (b.owned || (h && b.type === 'hall')) { const X = lot(b.bx), Y = lot(b.by), dx = Math.max(X - x, 0, x - X - LOT), dy = Math.max(Y - y, 0, y - Y - LOT), d = Math.hypot(dx, dy); if (d < best) best = d; }
    return best;
  }
  // street tiles outside the walls (and, during the opening, away from the hall: the story owns that square)
  const streetOk = (tx, ty) => tx >= 0 && ty >= 0 && tx < WORLD && ty < WORLD && (tx % PITCH === 0 || ty % PITCH === 0) && !inside(tx, ty) && !(api.intro && Math.abs(tx - 13) < 6 && Math.abs(ty - 13) < 6);
  const ownedKey = () => S.blocks.map((b) => (b.owned ? 1 : 0)).join('') + (hallLit() ? 'h' : '');

  function rebuildTerritory() {
    walls = []; wallTiles = [];
    const add = (x0, y0, x1, y1, bid, gate, ox, oy) => {
      const n = 2, ax = y0 === y1;                                   // half-tile pieces, so walkers sort around them
      for (let i = 0; i < n; i++) {
        const u0 = i / n, u1 = (i + 1) / n, a = [lerp(x0, x1, u0), lerp(y0, y1, u0)], b = [lerp(x0, x1, u1), lerp(y0, y1, u1)];
        walls.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], bid, kind: gate ? 2 : ((x0 * 7 + y0 * 13 + (ax ? 1 : 0)) % 5 === 0 ? 1 : 0), key: a[0] + a[1] + 0.25, seed: ((x0 * 3 + y0 * 5) | 0) + i });
      }
      if (ox != null) { const tx = Math.floor((x0 + x1) / 2 + ox * 0.5), ty = Math.floor((y0 + y1) / 2 + oy * 0.5); if (streetOk(tx, ty)) wallTiles.push({ tx, ty, x: (x0 + x1) / 2 + ox * 0.5, y: (y0 + y1) / 2 + oy * 0.5 }); }
    };
    for (const b of S.blocks) if (own(b.bx, b.by)) {
      const X = lot(b.bx), Y = lot(b.by), bx = b.bx, by = b.by;
      for (let i = 0; i < LOT; i++) {
        if (!own(bx, by - 1)) add(X + i, Y, X + i + 1, Y, b.id, false, 0, -1);
        if (!own(bx - 1, by)) add(X, Y + i, X, Y + i + 1, b.id, false, -1, 0);
        if (!own(bx, by + 1)) add(X + i, Y + LOT, X + i + 1, Y + LOT, b.id, i === 2, 0, 1);
        if (!own(bx + 1, by)) add(X + LOT, Y + i, X + LOT, Y + i + 1, b.id, i === 2, 1, 0);
      }
      if (own(bx + 1, by)) {                                         // the street between us and the block to the east: gates at its ends
        if (!(own(bx, by - 1) && own(bx + 1, by - 1))) add(X + LOT, Y, X + LOT + 1, Y, b.id, true);
        if (!(own(bx, by + 1) && own(bx + 1, by + 1))) add(X + LOT, Y + LOT, X + LOT + 1, Y + LOT, b.id, true);
      }
      if (own(bx, by + 1)) {
        if (!(own(bx - 1, by) && own(bx - 1, by + 1))) add(X, Y + LOT, X, Y + LOT + 1, b.id, true);
        if (!(own(bx + 1, by) && own(bx + 1, by + 1))) add(X + LOT, Y + LOT, X + LOT, Y + LOT + 1, b.id, true);
      }
    }
  }

  // ---------------------------------------------------------------- wrecks, fires and litter (the same for a seed)
  function buildProps() {
    const r = A.rnd(S.seed * 131 + 5), cols = ['#7a4a44', '#5d6b7a', '#6f7355', '#8a8372', '#4d5560', '#7d6a55'];
    props = [];
    for (let ty = 0; ty < WORLD; ty++) for (let tx = 0; tx < WORLD; tx++) {
      const sx = tx % PITCH === 0, sy = ty % PITCH === 0;
      if (sx && sy) { props.push({ k: 'lamp', x: tx + 0.14, y: ty + 0.14, tx, ty, flick: r() < 0.16, broken: r() < 0.45 }); if (r() < 0.2) props.push({ k: 'barrel', x: tx + 0.72, y: ty + 0.7, tx, ty, fire: true, seed: (r() * 99) | 0 }); continue; }
      if (!sx && !sy) continue;
      const near = Math.abs(tx - 13) + Math.abs(ty - 13) < 5, v = r();
      if (v < (near ? 0.03 : 0.085)) props.push({ k: 'car', x: tx + (sx ? 0.1 + r() * 0.3 : r() * 0.2), y: ty + (sx ? r() * 0.2 : 0.1 + r() * 0.3), tx, ty, along: sx ? 1 : 0, col: cols[(r() * 6) | 0], burnt: r() < 0.3 });
      else if (v < 0.19) props.push({ k: 'debris', x: tx + 0.3 + r() * 0.4, y: ty + 0.3 + r() * 0.4, tx, ty, seed: (r() * 999) | 0 });
      else if (v < 0.215) props.push({ k: 'barricade', x: tx + 0.1, y: ty + 0.1, tx, ty, along: sx ? 0 : 1 });
    }
    for (const b of S.blocks) {                                       // what lies in the yard of a block that is not ours
      const X = lot(b.bx), Y = lot(b.by), n = b.type === 'hall' ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const front = r() < 0.5, u = 0.3 + r() * 2.8, x = front ? X + u : X + 3.55, y = front ? Y + 3.55 : Y + u, v = r();
        props.push({ k: v < 0.35 ? 'debris' : v < 0.6 ? 'dtree' : v < 0.8 ? 'barrel' : 'crate', x, y, lot: b.id, seed: (r() * 999) | 0, fire: v > 0.74 });
      }
    }
  }

  // ---------------------------------------------------------------- walkers
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const prev = new Int16Array(WORLD * WORLD);
  function path(fx0, fy0, tx0, ty0) {                // over street tiles outside the walls
    const s = fy0 * WORLD + fx0, e = ty0 * WORLD + tx0; if (s === e) return [];
    prev.fill(-1); prev[s] = s; const q = [s];
    for (let h = 0; h < q.length; h++) {
      const c = q[h]; if (c === e) break;
      const cx = c % WORLD, cy = (c - cx) / WORLD;
      for (const d of DIRS) { const nx = cx + d[0], ny = cy + d[1]; if (!streetOk(nx, ny)) continue; const n = ny * WORLD + nx; if (prev[n] >= 0) continue; prev[n] = c; q.push(n); }
    }
    if (prev[e] < 0) return null;
    const out = []; for (let c = e; c !== s; c = prev[c]) out.push([c % WORLD + 0.5, Math.floor(c / WORLD) + 0.5]);
    return out.reverse();
  }
  function spawnZ(o) {
    const z = Object.assign({ x: 0, y: 0, path: null, sp: rand(0.2, 0.36), st: 'idle', wait: rand(0, 3), t: rand(0, 10), face: 1, seed: (Math.random() * 1e6) | 0, hp: 1, s: 1, fall: 0, hit: 0, kind: 'street', jx: rand(-0.28, 0.28), jy: rand(-0.28, 0.28) }, o);
    zs.push(z); return z;
  }
  function seedWalkers() {
    zs.length = 0;
    for (let i = 0, tries = 0; i < 26 && tries < 900; tries++) {
      const tx = (Math.random() * WORLD) | 0, ty = (Math.random() * WORLD) | 0;
      if (!streetOk(tx, ty) || distOwn(tx + 0.5, ty + 0.5) < 2.2) continue;
      spawnZ({ x: tx + 0.5, y: ty + 0.5 }); i++;
    }
    for (const b of S.blocks) if (!b.owned && b.type !== 'hall') for (let i = 0; i < (b.ring === 1 ? 2 : 1 + (b.id % 2)); i++) spawnZ({ kind: 'yard', lot: b.id, u: rand(0, 6.2), sp: rand(0.12, 0.22) });
  }
  const yardPt = (b, u) => { const X = lot(b.bx), Y = lot(b.by); return u <= 3.1 ? [X + 0.45 + u, Y + 3.62] : [X + 3.62, Y + 3.62 - (u - 3.1)]; };
  function edgeTile() {
    for (let k = 0; k < 40; k++) { const u = (Math.random() * WORLD) | 0, side = (Math.random() * 4) | 0, tx = side === 0 ? 0 : side === 1 ? WORLD - 1 : u, ty = side === 2 ? 0 : side === 3 ? WORLD - 1 : u; if (streetOk(tx, ty) && distOwn(tx + 0.5, ty + 0.5) > 3) return [tx, ty]; }
    return null;
  }
  function killZ(z, quiet) { if (z.st === 'dead') return; z.st = 'dead'; z.fall = 0.01; z.path = null; if (!quiet) burst(z.x, z.y, 14, '#b9c7a8', 5); }
  function stepWalkers(dt) {
    let bangers = 0, street = 0;
    for (const z of zs) { if (z.st === 'bang' || z.bang) bangers++; if (z.kind === 'street' && z.st !== 'dead') street++; }
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i]; z.t += dt; if (z.hit > 0) z.hit -= dt * 7;
      if (z.st === 'dead') { z.fall += dt / 0.5; if (z.fall >= 1) zs.splice(i, 1); continue; }
      if (z.kind === 'yard') {
        const b = S.blocks[z.lot]; if (b.owned) { killZ(z); continue; }
        if (z.pull) { const dx = z.pull[0] - z.x, dy = z.pull[1] - z.y, d = Math.hypot(dx, dy); if (d > 0.25) { z.x += dx / d * 0.7 * dt; z.y += dy / d * 0.7 * dt; z.face = dx - dy >= 0 ? 1 : -1; z.walk = true; } continue; }
        if (z.tu == null || Math.abs(z.tu - z.u) < 0.05) { z.wait -= dt; z.walk = false; if (z.wait <= 0) { z.tu = rand(0, 6.2); z.wait = rand(1, 5); } }
        else { const d = Math.sign(z.tu - z.u); z.u += d * z.sp * dt; z.walk = true; }
        const p0 = yardPt(b, z.u); z.x = p0[0]; z.y = p0[1]; if (z.walk) z.face = z.tu >= z.u ? 1 : -1;   // more u is always further right on screen
        continue;
      }
      if (z.kind === 'intro' || z.kind === 'fight') {                 // straight at a point
        const dx = z.gx - z.x, dy = z.gy - z.y, d = Math.hypot(dx, dy);
        if (d > (z.stop || 0.3)) { z.x += dx / d * z.sp * dt; z.y += dy / d * z.sp * dt; z.walk = true; z.face = dx - dy >= 0 ? 1 : -1; z.bang = false; }
        else { z.walk = false; z.bang = true; if (z.onReach) { const f = z.onReach; z.onReach = null; f(z); } }
        continue;
      }
      if (inside(Math.floor(z.x), Math.floor(z.y))) { killZ(z); continue; }
      if (z.st === 'idle' || z.st === 'bang') {
        z.wait -= dt; z.walk = false;
        if (z.wait <= 0) {
          z.bang = false; z.st = 'idle';
          const cx = Math.floor(z.x), cy = Math.floor(z.y), near = distOwn(z.x, z.y);
          let goal = null, toWall = false;
          if (z.kind === 'horde' || (wallTiles.length && near < 9 && bangers < 9 && Math.random() < 0.45)) {
            let best = null, bd = 1e9; for (let k = 0; k < 5; k++) { const w = wallTiles[(Math.random() * wallTiles.length) | 0], dd = Math.abs(w.tx - cx) + Math.abs(w.ty - cy) + Math.random() * 3; if (dd < bd) { bd = dd; best = w; } }
            if (best) { goal = best; toWall = true; }
          }
          if (!goal) for (let k = 0; k < 6 && !goal; k++) { const tx = cx + ((Math.random() * 11) | 0) - 5, ty = cy + ((Math.random() * 11) | 0) - 5; if (streetOk(tx, ty)) goal = { tx, ty, x: tx + 0.5, y: ty + 0.5 }; }
          const pth = goal && streetOk(cx, cy) ? path(cx, cy, goal.tx, goal.ty) : null;
          if (pth) { z.path = pth; z.st = 'walk'; z.toWall = toWall ? goal : null; if (toWall) bangers++; }
          else { z.wait = rand(0.5, 2); if (!streetOk(cx, cy)) { const e0 = edgeTile(); if (e0) { z.x = e0[0] + 0.5; z.y = e0[1] + 0.5; } } }
        }
        continue;
      }
      // walking along a path
      const last = !z.path.length, tgt = last ? (z.toWall ? [z.toWall.x, z.toWall.y] : null) : [z.path[0][0] + z.jx, z.path[0][1] + z.jy];
      if (!tgt) { z.st = 'idle'; z.wait = rand(1, 5); continue; }
      const dx = tgt[0] - z.x, dy = tgt[1] - z.y, d = Math.hypot(dx, dy), sp = z.kind === 'horde' ? 1.25 : z.sp;
      if (d < 0.12) { if (last) { z.st = z.toWall ? 'bang' : 'idle'; z.bang = !!z.toWall; z.wait = z.kind === 'horde' ? 99 : rand(3, 8); z.toWall = null; } else z.path.shift(); continue; }
      z.x += dx / d * sp * dt; z.y += dy / d * sp * dt; z.walk = true; z.face = dx - dy >= 0 ? 1 : -1;
    }
    if (!api.intro && street < 24 && Math.random() < dt * 0.5) { const e0 = edgeTile(); if (e0) spawnZ({ x: e0[0] + 0.5, y: e0[1] + 0.5 }); }
  }
  const shootable = (z) => z.st !== 'dead' && (z.kind === 'intro' || z.kind === 'horde' || (z.kind === 'street' && distOwn(z.x, z.y) <= RANGE));

  // ---------------------------------------------------------------- survivors
  function homeLots() { const out = S.blocks.filter((b) => b.owned && b.type !== 'bridge'); out.sort((a, b) => (a.type === 'hall' ? -1 : b.type === 'hall' ? 1 : a.id - b.id)); return out; }
  function stepPeople(dt) {
    const lots = homeLots(); if (!lots.length) return;
    const seen = new Set(), clinic = S.blocks.find((b) => b.owned && b.type === 'clinic' && b.lv >= 1) || lots[0];
    S.people.forEach((p, i) => {
      seen.add(p.id);
      let f = figs.get(p.id);
      const home = p.state === 'down' ? clinic : lots[i % lots.length], hallLot = home.type === 'hall';
      if (!f) { f = { id: p.id, u: rand(0.2, 2.8), tu: null, wait: rand(0, 3), t: rand(0, 9), face: 1, alpha: 0, lot: home.id, x: 0, y: 0 }; figs.set(p.id, f); }
      if (f.lot !== home.id) { f.lot = home.id; f.u = rand(0.3, 2.8); f.alpha = 0; }
      f.t += dt; f.alpha = Math.min(1, f.alpha + dt * 2.5); f.look = p.look; f.state = p.state; f.walk = false;
      const max = hallLot ? 2.9 : 6.1;
      if (p.state === 'out' && fight && fight.pid === p.id) { f.x = fight.x + Math.sin(f.t * 1.7) * 0.35; f.y = fight.y + Math.cos(f.t * 1.3) * 0.3; f.pose = fight.fell ? 'down' : 'aim'; f.face = fight.face; return; }
      if (p.state === 'rest') { f.pose = 'sit'; f.u = hallLot ? 0.35 + (i % 4) * 0.42 : clamp(f.u, 0.2, max); }
      else if (p.state === 'down') { f.pose = 'down'; f.u = hallLot ? 2.4 : 1.2 + (i % 3) * 0.5; }
      else {
        f.pose = 'stand';
        if (f.tu == null || Math.abs(f.tu - f.u) < 0.06) { f.wait -= dt; if (f.wait <= 0) { f.tu = rand(0.15, max); f.wait = rand(1.5, 6); } }
        else { const d = Math.sign(f.tu - f.u); f.u = clamp(f.u + d * 0.55 * dt, 0, max); f.walk = true; f.face = d >= 0 ? 1 : -1; }
      }
      const q = yardPt(home, f.u); f.x = q[0] - 0.07; f.y = q[1] - 0.12;
    });
    for (const id of figs.keys()) if (!seen.has(id)) figs.delete(id);
  }

  // ---------------------------------------------------------------- effects
  function burst(x, y, z, col, n) { if (reduced) n = Math.ceil(n / 3); const a = P(x, y, z); for (let i = 0; i < n; i++) fx.push({ x: a[0], y: a[1], vx: rand(-60, 60), vy: rand(-110, -20), g: 260, life: rand(0.3, 0.7), t: 0, col, s: rand(1.5, 3.2) }); }
  function float(x, y, z, text, col) { const a = P(x, y, z); floats.push({ x: a[0], y: a[1], text, col: col || '#ffe9a8', t: 0 }); }
  function shake(n) { if (!reduced) shakeAmt = Math.max(shakeAmt, n); }
  function tracer(x0, y0, z0, x1, y1, z1) { tracers.push({ a: P(x0, y0, z0), b: P(x1, y1, z1), t: 0 }); }
  function wallPointNear(x, y) {                     // where a shot from the wall comes from
    let best = null, bd = 1e9; for (const w of walls) { const mx = (w.x0 + w.x1) / 2, my = (w.y0 + w.y1) / 2, d = (mx - x) * (mx - x) + (my - y) * (my - y); if (d < bd) { bd = d; best = [mx, my]; } }
    return best || [lot(C) + 2, lot(C) + 2];
  }
  function shootAt(z, from) {
    const f = from || wallPointNear(z.x, z.y);
    tracer(f[0], f[1], from ? 16 : 22, z.x, z.y, 16); em.push({ k: 'dot', x: P(f[0], f[1], 20)[0], y: P(f[0], f[1], 20)[1], r: 26, col: 'rgba(255,230,170,.9)' });
    flashes.push({ x: f[0], y: f[1], t: 0 });
    z.hp--; z.hit = 1;
    if (z.hp <= 0) killZ(z); else burst(z.x, z.y, 18, '#c9d4b8', 3);
    return z.hp <= 0;
  }
  const flashes = [];
  function taken(b) {
    born[b.id] = T; rebuildTerritory(); groundKey = '';
    const X = lot(b.bx) + 2, Y = lot(b.by) + 2;
    for (const z of zs) if (z.kind === 'fight' || (z.kind === 'yard' && z.lot === b.id) || inside(Math.floor(z.x), Math.floor(z.y))) killZ(z);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { const u = k + 0.5; burst(i === 0 ? lot(b.bx) + u : i === 1 ? lot(b.bx) + 4 : i === 2 ? lot(b.bx) + u : lot(b.bx), i === 0 ? lot(b.by) : i === 1 ? lot(b.by) + u : i === 2 ? lot(b.by) + 4 : lot(b.by) + u, 4, '#d8c9a0', 5); }
    shake(5); flashAmt = 0.35; fit(false);
  }
  function runStart(run) {
    const b = S.blocks[run.bid], from = E.neighbours(S, b).find((n) => n.owned) || E.hall(S);
    const X = lot(b.bx), Y = lot(b.by);
    let x, y; if (b.bx > from.bx) { x = X - 0.5; y = Y + 2; } else if (b.bx < from.bx) { x = X + 4.5; y = Y + 2; } else if (b.by > from.by) { x = X + 2; y = Y - 0.5; } else { x = X + 2; y = Y + 4.5; }
    fight = { bid: b.id, pid: run.pid, x, y, next: 0.5, face: b.bx - b.by >= from.bx - from.by ? 1 : -1, cx: X + 2, cy: Y + 2, fell: false };
    for (const z of zs) if (z.kind === 'yard' && z.lot === b.id) z.pull = [x + rand(-0.9, 0.9), y + rand(-0.9, 0.9)];
  }
  function runEnd(res) {
    if (!fight) return;
    const f = fight;
    if (res.win) { for (const z of zs) if (z.kind === 'fight') killZ(z); float(f.x, f.y, 40, res.taken ? 'TAKEN!' : 'PUSHED BACK', '#9dffb0'); }
    else { f.fell = true; float(f.x, f.y, 40, res.down ? 'DOWN!' : 'CARRIED HOME', '#ff8a7a'); shake(6); for (const z of zs) if (z.kind === 'fight') { z.kind = 'street'; z.st = 'idle'; z.wait = 1; } }
    for (const z of zs) if (z.kind === 'yard') z.pull = null;
    setTimeout(() => { if (fight === f) fight = null; }, res.win ? 50 : 900);
  }
  function stepFight(dt) {
    if (!fight || fight.fell) return;
    fight.next -= dt;
    if (fight.next <= 0) {
      fight.next = rand(0.35, 0.75);
      const tg = zs.filter((z) => z.st !== 'dead' && (z.kind === 'fight' || (z.kind === 'yard' && z.lot === fight.bid)) && Math.hypot(z.x - fight.x, z.y - fight.y) < 2.2)[0];
      if (tg && tg.kind === 'fight') { fight.face = tg.x - tg.y >= fight.x - fight.y ? 1 : -1; shootAt(tg, [fight.x, fight.y]); if (api.onShot) api.onShot(); }
      const a = Math.random() * TAU; spawnZ({ kind: 'fight', x: fight.cx + Math.cos(a) * 1.9, y: fight.cy + Math.sin(a) * 1.9, gx: fight.x, gy: fight.y, stop: 0.55, sp: rand(0.7, 1.1) });
    }
  }

  // ---------------------------------------------------------------- camera
  const toScreen = (wx, wy) => [(wx - cam.x) * cam.z + W / 2, (wy - cam.y) * cam.z + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y];
  const toTile = (sx, sy) => { const w = toWorld(sx, sy); return [(w[0] / 32 + w[1] / 16) / 2, (w[1] / 16 - w[0] / 32) / 2]; };
  function view(x0, y0, x1, y1, snap, zmax, zmin) {   // show a world box in the clear part of the screen
    const cw = Math.max(80, W - inset.l - inset.r), ch = Math.max(80, H - inset.t - inset.b);
    const z = clamp(Math.min(cw / (x1 - x0), ch / (y1 - y0)), zmin || 0.34, zmax || 1.5);
    cam.tz = z; cam.tx = (x0 + x1) / 2 - (inset.l + cw / 2 - W / 2) / z; cam.ty = (y0 + y1) / 2 - (inset.t + ch / 2 - H / 2) / z;
    if (snap) { cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; }
  }
  function boxOf(blocks, padX, padY) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const b of blocks) { const X = lot(b.bx), Y = lot(b.by); for (const q of [P(X, Y, HGT[b.type] || 40), P(X + 4, Y), P(X + 4, Y + 4), P(X, Y + 4)]) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } }
    if (padY == null) padY = padX;
    return [x0 - padX, y0 - padY, x1 + padX, y1 + padY];
  }
  function fit(snap) {
    if (!S) return;
    const mine = S.blocks.filter((b) => b.owned);
    const bx = boxOf(mine.length ? mine : [E.hall(S)], 170, 62);          // ours, and the near side of each block beside it
    view(bx[0], bx[1], bx[2], bx[3], snap, 1.5, 0.5);
  }
  function focus(b, zmax) { const bx = boxOf([b].concat(E.neighbours(S, b).filter((n) => n.owned)), 40); view(bx[0], bx[1], bx[2], bx[3], false, zmax || 1.25); }

  // ---------------------------------------------------------------- input: tap, drag, pinch, wheel
  const ptr = new Map(); let gest = null;
  function bind() {
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptr.size === 1) { gest = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, cx: cam.x, cy: cam.y }; if (api.onHold) api.onHold(true, e.clientX, e.clientY); }
      else if (ptr.size === 2) { const a = [...ptr.values()]; gest = { pinch: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), z0: cam.z, moved: true }; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ptr.get(e.pointerId); if (!p || !gest) return; p.x = e.clientX; p.y = e.clientY;
      if (gest.pinch && ptr.size >= 2) { const a = [...ptr.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (!api.intro) { cam.z = cam.tz = clamp(gest.z0 * d / gest.pinch, 0.34, 2.2); } return; }
      const dx = e.clientX - gest.x0, dy = e.clientY - gest.y0;
      if (!gest.moved && Math.hypot(dx, dy) > 9) gest.moved = true;
      if (gest.moved && !gest.pinch && !api.intro) { cam.x = cam.tx = gest.cx - dx / cam.z; cam.y = cam.ty = gest.cy - dy / cam.z; clampCam(); }
    });
    const up = (e) => {
      const had = ptr.delete(e.pointerId); if (!had) return;
      if (api.onHold && ptr.size === 0) api.onHold(false, e.clientX, e.clientY);
      if (gest && !gest.moved && !gest.pinch && e.type === 'pointerup' && performance.now() - gest.t0 < 600 && api.onTap) api.onTap(pick(e.clientX, e.clientY), e.clientX, e.clientY);
      if (ptr.size === 0) gest = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); if (api.intro) return; const k = Math.exp(-e.deltaY * 0.0015), w0 = toWorld(e.clientX, e.clientY); cam.z = cam.tz = clamp(cam.z * k, 0.34, 2.2); const w1 = toWorld(e.clientX, e.clientY); cam.x = cam.tx = cam.x + w0[0] - w1[0]; cam.y = cam.ty = cam.y + w0[1] - w1[1]; clampCam(); }, { passive: false });
  }
  function clampCam() { cam.x = cam.tx = clamp(cam.x, -900, 900); cam.y = cam.ty = clamp(cam.y, -80, 920); }
  function inPoly(pts, x, y) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function pick(sx, sy) {
    let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(h.x - sx, h.y - sy); if (d < Math.max(26, h.r) && d < bd) { bd = d; best = h; } }
    if (best) return { kind: 'marker', what: best.what, id: best.id };
    const w = toWorld(sx, sy);
    bd = 30 / cam.z;
    for (const z of zs) { if (!shootable(z)) continue; const q = P(z.x, z.y, 13 * z.s), d = Math.hypot(q[0] - w[0], q[1] - w[1]) - (z.s > 1.5 ? 14 : 0); if (d < bd) { bd = d; best = z; } }
    if (best) return { kind: 'zombie', z: best };
    bd = 24 / cam.z;
    for (const f of figs.values()) { const q = P(f.x, f.y, 13), d = Math.hypot(q[0] - w[0], q[1] - w[1]); if (d < bd) { bd = d; best = f; } }
    if (best) return { kind: 'person', id: best.id };
    if (S.graves.length) { bd = 18 / cam.z; S.graves.forEach((gr, i) => { const q = graveAt(i), a = P(q[0], q[1], 7), d = Math.hypot(a[0] - w[0], a[1] - w[1]); if (d < bd) { bd = d; best = gr; } }); if (best) return { kind: 'grave', id: best.id }; }
    const order = S.blocks.slice().sort((a, b) => b.bx + b.by - a.bx - a.by);
    for (const b of order) { const X = lot(b.bx), Y = lot(b.by), h = HGT[b.type] || 40; if (inPoly([P(X + 0.5, Y + 3.0), P(X + 3.1, Y + 3.0), P(X + 3.1, Y + 0.5), P(X + 3.1, Y + 0.5, h), P(X + 0.5, Y + 0.5, h), P(X + 0.5, Y + 3.0, h)], w[0], w[1])) return { kind: 'block', b }; }
    const t = toTile(sx, sy), tx = Math.floor(t[0]), ty = Math.floor(t[1]);
    if (tx >= 0 && ty >= 0 && tx < WORLD && ty < WORLD && tx % PITCH && ty % PITCH) return { kind: 'block', b: S.blocks[Math.floor((ty - 1) / PITCH) * N + Math.floor((tx - 1) / PITCH)] };
    return { kind: 'none', tx: t[0], ty: t[1] };
  }
  const graveAt = (i) => { const X = lot(C), Y = lot(C); return [X + 3.62, Y + 0.5 + (i % 6) * 0.5 + Math.floor(i / 6) * 0.08]; };

  // ---------------------------------------------------------------- drawing
  function drawGround() {
    const key = S.seed + ':' + ownedKey();
    if (key === groundKey && groundCv) return;
    groundKey = key;
    if (!groundCv) { groundCv = document.createElement('canvas'); groundCv.width = Math.round((1664 + PAD * 2) * GK); groundCv.height = Math.round((832 + PAD * 2) * GK); }
    const c = groundCv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#141a18'; c.fillRect(0, 0, groundCv.width, groundCv.height);
    c.setTransform(GK, 0, 0, GK, (832 + PAD) * GK, PAD * GK);
    A.ground(c, D, S.seed, own, inside);
  }
  function bornK(id) { const t0 = born[id]; if (t0 == null) return 1; const k = clamp((T - t0) / 1.1, 0, 1); return 1 - (1 - k) * (1 - k); }
  function drawBlock(b) {
    const X = lot(b.bx), Y = lot(b.by), I = api.intro, isHall = b.type === 'hall';
    const ruin = !b.owned || b.lv < 1;
    if (isHall) { A.B.hall(g, X, Y, I ? !I.hall.restored : ruin, Math.max(1, b.lv), T, em, b.id, I ? I.hall : null); if (!I || I.hall.restored) A.campfire(g, X + 0.5, Y + 3.3, em, 4); if (!I) for (let i = 0; i < S.graves.length; i++) { const q = graveAt(i); A.grave(g, q[0], q[1], S.graves[i].look.jacket); } }
    else A.B[b.type](g, X, Y, ruin, Math.max(1, b.lv), T, em, b.id + 3);
    if (b.owned && !isHall && b.lv < 1 && !b.job) A.poly(g, [P(X + 2.0, Y + 3.5, 0), P(X + 2.0, Y + 3.5, 30)], null, '#c9c4b8', 1.6), A.poly(g, [P(X + 2.0, Y + 3.5, 30), [P(X + 2.0, Y + 3.5, 30)[0] + 14, P(X + 2.0, Y + 3.5, 26)[1]], P(X + 2.0, Y + 3.5, 21)], '#ff8a3c');
    if (b.job) A.scaffold(g, X, Y, 0);
    if (b.owned && b.lv >= 1 && b.type === 'workshop' && Math.random() < 0.05) { const q = P(X + 2.4, Y + 1.2, 44); smoke.push({ x: q[0], y: q[1], t: 0, life: 3.2, s: 5, vx: rand(4, 9) }); }
  }
  function drawProp(p) {
    if (p.lot != null) { if (S.blocks[p.lot].owned) return; }
    else if (p.k !== 'lamp' && inside(p.tx, p.ty)) return;
    if (p.k === 'car') { A.car(g, p.x, p.y, p.along, p.col, p.burnt, T, em); if (p.burnt && Math.random() < 0.06) { const q = P(p.x + 0.4, p.y + 0.3, 20); smoke.push({ x: q[0], y: q[1], t: 0, life: 4.5, s: 7, vx: rand(5, 12) }); } }
    else if (p.k === 'barrel') A.barrel(g, p.x, p.y, p.fire, em, p.seed);
    else if (p.k === 'debris') A.debris(g, p.x, p.y, p.seed);
    else if (p.k === 'barricade') A.barricade(g, p.x, p.y, p.along);
    else if (p.k === 'dtree') A.deadTree(g, p.x, p.y, 0.9, p.seed);
    else if (p.k === 'crate') A.crates(g, p.x, p.y, 2);
    else if (p.k === 'lamp') { const lit = distOwn(p.x, p.y) < 1.2; A.lamp(g, p.x, p.y, lit || (p.flick && Math.sin(T * 9 + p.tx) + Math.sin(T * 23 + p.ty) > 1.2), em, !lit && p.broken); }
  }
  function lights() {
    const L = [], I = api.intro;
    if (I) { for (const l of I.lights) L.push(l); }
    for (const b of S.blocks) {
      const X = lot(b.bx) + 2, Y = lot(b.by) + 2;
      if (b.owned || (I && b.type === 'hall' && I.hall.restored)) L.push([X, Y, 215 * bornK(b.id), 1, 0]);
      else if (!I && !E.attackWhy(S, b)) L.push([X, Y, 150, 0.4, 1]);
    }
    for (const p of props) {
      if (p.k === 'barrel' && p.fire && !(p.lot != null ? S.blocks[p.lot].owned : inside(p.tx, p.ty))) L.push([p.x, p.y, 78 + Math.sin(T * 11 + p.seed) * 7, 0.75, 0]);
      else if (p.k === 'car' && p.burnt && !inside(p.tx, p.ty)) L.push([p.x + 0.4, p.y + 0.3, 90 + Math.sin(T * 9 + p.tx) * 8, 0.7, 0]);
      else if (p.k === 'lamp' && distOwn(p.x, p.y) < 1.2) L.push([p.x, p.y, 70, 0.6, 0]);
    }
    for (const b of S.blocks) if (b.owned && b.type === 'tower' && b.lv >= 1 && !I) {   // a watchtower sweeps the streets
      const a = T * 0.5 + b.id, x = lot(b.bx) + 1.9 + Math.cos(a) * 4.2, y = lot(b.by) + 1.8 + Math.sin(a) * 4.2;
      L.push([x, y, 85, 0.6, 0]);
    }
    if (fight) L.push([fight.x, fight.y, 105, 0.85, 0]);
    for (const f of flashes) L.push([f.x, f.y, 110 * (1 - f.t / 0.12), 0.9, 0]);
    return L;
  }
  function drawLight(L) {
    const lw = lightCv.width, lh = lightCv.height, I = api.intro, amb = I ? I.ambient : '#3a4670';
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.fillStyle = amb; lg.fillRect(0, 0, lw, lh);
    lg.globalCompositeOperation = 'lighter';
    const k = dpr / 2, ox = W / 2 * k - cam.x * cam.z * k + offX * k, oy = H / 2 * k - cam.y * cam.z * k + offY * k;
    lg.setTransform(cam.z * k, 0, 0, cam.z * k, ox, oy);
    for (const l of L) {
      if (l[2] <= 1) continue;
      const a = P(l[0], l[1], 0), r = l[2];
      lg.save(); lg.translate(a[0], a[1]); lg.scale(1, 0.6);
      const gr = lg.createRadialGradient(0, 0, 0, 0, 0, r), c = l[4] ? '150,175,235' : '255,236,200';
      gr.addColorStop(0, 'rgba(' + c + ',' + l[3] + ')'); gr.addColorStop(0.55, 'rgba(' + c + ',' + l[3] * 0.8 + ')'); gr.addColorStop(1, 'rgba(' + c + ',0)');
      lg.fillStyle = gr; lg.fillRect(-r, -r, r * 2, r * 2); lg.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'multiply'; g.drawImage(lightCv, 0, 0, cv.width, cv.height); g.globalCompositeOperation = 'source-over';
  }
  let offX = 0, offY = 0, puff = null;
  function soft() {                                   // one soft round blob, reused for smoke and fog
    if (puff) return puff;
    puff = document.createElement('canvas'); puff.width = puff.height = 64;
    const c = puff.getContext('2d'), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    return puff;
  }
  const FOG = []; for (let i = 0; i < 22; i++) FOG.push({ x: Math.random() * 30 - 2, y: Math.random() * 30 - 2, r: 190 + Math.random() * 170, p: Math.random() * 9, s: 0.4 + Math.random() * 0.6 });
  function pill(x, y, text, bg, fg, sub) {
    g.font = '700 13px ' + FONT; const w = Math.max(30, g.measureText(text).width + 18), h = sub ? 30 : 22;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.roundRect(x - w / 2, y - h + 2, w, h, 11); g.fill();
    g.fillStyle = bg; g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, 11); g.fill();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, x, y - h + 11.5);
    return { w, h };
  }
  function drawMarkers() {
    hits = [];
    if (api.intro || !S.intro) return;
    let nTargets = 0, topTarget = -1, topWin = -1;                    // with many targets, only the best one says EXPAND
    for (const b of S.blocks) if (!b.owned && !E.attackWhy(S, b)) { nTargets++; const w = bestOdds(b); if (w != null && w > topWin) { topWin = w; topTarget = b.id; } }
    for (const b of S.blocks) {
      const X = lot(b.bx), Y = lot(b.by), top = P(X + 1.8, Y + 1.7, (HGT[b.type] || 40) + 16), s = toScreen(top[0], top[1]);
      if (s[0] < -60 || s[0] > W + 60 || s[1] < -40 || s[1] > H + 80) continue;
      const why = b.owned ? 'own' : E.attackWhy(S, b);
      if (!b.owned && why === null) {
        const busy = S.run && S.run.bid === b.id, best = bestOdds(b), col = busy ? '#ffd27a' : best == null ? '#c9ccd2' : best >= 0.7 ? '#8dffa6' : best >= 0.45 ? '#ffd27a' : '#ff9a8a';
        const bob = reduced ? 0 : Math.sin(T * 3 + b.id) * 2.5, y = s[1] + bob, wide = nTargets <= 4 || b.id === topTarget;
        if (busy) { const k = clamp((S.t - S.run.t0) / Math.max(1, S.run.t1 - S.run.t0), 0, 1); pill(s[0], y, 'CLEARING', '#20252e', '#ffd27a'); g.fillStyle = '#ffd27a'; g.fillRect(s[0] - 32, y + 2, 64 * k, 3); }
        else {
          pill(s[0], y, best == null ? (wide ? 'EXPAND' : '···') : (wide ? 'EXPAND ' : '') + Math.round(best * 100) + '%', wide ? '#ff8a3c' : 'rgba(32,37,46,.9)', wide ? '#191310' : col);
          for (let i = 0; i < b.hpMax; i++) { g.fillStyle = i < b.hp ? '#ff5a4a' : 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(s[0] - (b.hpMax - 1) * 5 + i * 10, y + 7, 3.2, 0, TAU); g.fill(); }
          if (wide) { g.fillStyle = '#ff8a3c'; g.beginPath(); g.moveTo(s[0] - 5, y + 13); g.lineTo(s[0] + 5, y + 13); g.lineTo(s[0], y + 19); g.fill(); }
        }
      } else if (!b.owned && why === 'hall' && E.neighbours(S, b).some((n) => n.owned)) pill(s[0], s[1], 'HALL ' + E.needHall(b), 'rgba(32,37,46,.85)', '#9aa3b2');
      else if (b.owned && b.job) {
        const left = Math.max(0, b.job.t1 - S.t), k = clamp((S.t - b.job.t0) / Math.max(1, b.job.t1 - b.job.t0), 0, 1);
        pill(s[0], s[1], clock(left), '#20252e', '#ffe9a8'); g.fillStyle = '#ffd27a'; g.fillRect(s[0] - 20, s[1] + 2, 40 * k, 3);
      } else if (b.owned && b.lv < 1 && b.type !== 'bridge') { pill(s[0], s[1] + (reduced ? 0 : Math.sin(T * 3 + b.id) * 2), 'RESTORE ' + D.TYPES[b.type].cost[0], '#ffd27a', '#191310'); }
      else if (b.owned && D.TYPES[b.type].rate) {
        const st = E.stock(S, b), cap = D.TYPES[b.type].cap[b.lv - 1], n = Math.floor(st);
        if (n >= 1 && (b.type === 'gas' || st >= Math.min(12, cap * 0.2))) {
          const y = s[1] + (reduced ? 0 : Math.sin(T * 2.4 + b.id) * 3), full = st >= cap - 0.01, fuel = b.type === 'gas';
          g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(s[0], y - 10, 18, 0, TAU); g.fill();
          g.fillStyle = full ? '#ffb347' : '#f4efe2'; g.beginPath(); g.arc(s[0], y - 12, 18, 0, TAU); g.fill(); g.beginPath(); g.moveTo(s[0] - 6, y + 3); g.lineTo(s[0] + 6, y + 3); g.lineTo(s[0], y + 11); g.fill();
          g.fillStyle = fuel ? '#d9534f' : '#8a6a3f'; g.fillRect(s[0] - 7, y - 21, 14, 10); g.fillStyle = fuel ? '#b33f3b' : '#6f5330'; g.fillRect(s[0] - 7, y - 16.5, 14, 1.6);
          g.fillStyle = '#191310'; g.font = '700 12px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), s[0], y - 4);
          hits.push({ what: 'collect', id: b.id, x: s[0], y: y - 10, r: 26 });
        }
      }
    }
    for (const f of figs.values()) {
      if (f.state !== 'down') continue;
      const a = P(f.x, f.y, 30), s = toScreen(a[0], a[1]), y = s[1] + (reduced ? 0 : Math.sin(T * 4) * 2);
      g.fillStyle = '#e5484d'; g.beginPath(); g.arc(s[0], y - 10, 13, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.fillRect(s[0] - 2, y - 17, 4, 14); g.fillRect(s[0] - 7, y - 12, 14, 4);
      hits.push({ what: 'down', id: f.id, x: s[0], y: y - 10, r: 24 });
    }
  }
  function bestOdds(b) { let best = null; for (const p of S.people) if (p.state === 'ok') { const w = E.odds(S, p, b).win; if (best == null || w > best) best = w; } return best; }
  const clock = (ms) => { const s = Math.ceil(ms / 1000), m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); };

  function frame(dt) {
    if (!S || !cv) return;
    dt = Math.min(dt, 0.1); T += dt;
    const key = ownedKey(); if (key !== frame.key) { frame.key = key; rebuildTerritory(); }
    // camera
    const e = 1 - Math.exp(-dt * 5); cam.x = lerp(cam.x, cam.tx, e); cam.y = lerp(cam.y, cam.ty, e); cam.z = lerp(cam.z, cam.tz, e);
    shakeAmt *= Math.exp(-dt * 9); offX = (Math.random() - 0.5) * shakeAmt; offY = (Math.random() - 0.5) * shakeAmt;
    stepWalkers(dt); stepPeople(dt); stepFight(dt);
    for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; p.t += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t >= p.life) fx.splice(i, 1); }
    for (let i = floats.length - 1; i >= 0; i--) { floats[i].t += dt; if (floats[i].t > 1.3) floats.splice(i, 1); }
    for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t += dt; if (tracers[i].t > 0.09) tracers.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > 0.12) flashes.splice(i, 1); }
    for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.t += dt; s.y -= 16 * dt; s.x += s.vx * dt; if (s.t >= s.life) smoke.splice(i, 1); }
    if (smoke.length > 160) smoke.splice(0, smoke.length - 160);

    // the world
    drawGround();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0c1014'; g.fillRect(0, 0, W, H);
    const tf = () => g.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (W / 2 - cam.x * cam.z + offX) * dpr, (H / 2 - cam.y * cam.z + offY) * dpr);
    tf();
    g.drawImage(groundCv, -832 - PAD, -PAD, 1664 + PAD * 2, 832 + PAD * 2);
    const I = api.intro; em = [];
    if (!I && S.intro) for (const b of S.blocks) if (!b.owned && !E.attackWhy(S, b) && !(S.run && S.run.bid === b.id)) {   // "tap here": a breathing outline
      const X = lot(b.bx), Y = lot(b.by), k = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(T * 3 + b.id);
      g.globalAlpha = 0.35 + 0.5 * k; A.poly(g, [P(X + 0.08, Y + 0.08), P(X + 3.92, Y + 0.08), P(X + 3.92, Y + 3.92), P(X + 0.08, Y + 3.92)], 'rgba(255,138,60,.10)', '#ff8a3c', 2.5); g.globalAlpha = 1;
    }
    if (I && I.ring) { const q = P(I.ring.x, I.ring.y, I.ring.z || 0), k = 0.5 + 0.5 * Math.sin(T * 6); g.strokeStyle = 'rgba(255,170,80,' + (0.5 + 0.5 * k) + ')'; g.lineWidth = 3; g.beginPath(); g.ellipse(q[0], q[1], (I.ring.r || 22) + k * 5, ((I.ring.r || 22) + k * 5) * 0.62, 0, 0, TAU); g.stroke(); }
    const list = [];
    for (const b of S.blocks) list.push({ key: lot(b.bx) + lot(b.by) + 3.5, f: () => drawBlock(b) });
    for (const p of props) list.push({ key: p.x + p.y, f: () => drawProp(p) });
    for (const w of walls) list.push({ key: w.key, f: () => A.wall(g, w.x0, w.y0, w.x1, w.y1, 21 * bornK(w.bid), w.kind, em, T, w.seed) });
    for (const z of zs) list.push({ key: z.x + z.y, f: () => { const q = P(z.x, z.y, 0); A.zombie(g, q[0], q[1], z); } });
    if (I) for (const f of I.group) list.push({ key: f.x + f.y, f: () => { const q = P(f.x, f.y, 0); A.person(g, q[0], q[1], f); } });
    else for (const f of figs.values()) list.push({ key: f.x + f.y, f: () => { const q = P(f.x, f.y, 0); A.person(g, q[0], q[1], f); } });
    if (I && I.extra) for (const x of I.extra) list.push(x);
    list.sort((a, b) => a.key - b.key);
    for (const d of list) d.f();
    for (const p of fx) { g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.col; g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); } g.globalAlpha = 1;

    // the night, then everything that glows
    drawLight(lights());
    tf(); g.globalCompositeOperation = 'lighter';
    for (const e2 of em) A.glow(g, e2, T);
    for (const z of zs) if (z.st !== 'dead' && !z.hit) { const q = P(z.x, z.y, 24.6 * z.s); g.fillStyle = 'rgba(214,255,150,.85)'; g.fillRect(q[0] + (z.face > 0 ? 1.2 : -3.6) * z.s, q[1] - 0.6, 1.3 * z.s, 1.3 * z.s); g.fillRect(q[0] + (z.face > 0 ? 3.6 : -1.4) * z.s, q[1] - 0.2, 1.3 * z.s, 1.3 * z.s); }
    for (const t of tracers) { g.strokeStyle = 'rgba(255,240,190,' + (1 - t.t / 0.09) + ')'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(t.a[0], t.a[1]); g.lineTo(t.b[0], t.b[1]); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    const sp = soft();
    for (const s of smoke) { const k = s.t / s.life, r = (s.s + k * 20) * 1.6; g.globalAlpha = 0.16 * (1 - k); g.drawImage(sp, s.x - r, s.y - r, r * 2, r * 2); }
    g.globalCompositeOperation = 'screen';
    for (const f of FOG) {                           // mist that keeps away from the lights
      const fx0 = f.x + (reduced ? 0 : Math.sin(T * 0.05 * f.s + f.p) * 2.5), fy0 = f.y + (reduced ? 0 : Math.cos(T * 0.04 * f.s + f.p) * 2.5), d = distOwn(fx0, fy0, true), a = clamp((d - 2.2) / 4, 0, 1) * 0.17;
      if (a <= 0.005) continue;
      const q = P(fx0, fy0, 0); g.globalAlpha = a; g.drawImage(sp, q[0] - f.r, q[1] - f.r * 0.6, f.r * 2, f.r * 1.2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // screen space: vignette, markers, floating text
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (flashAmt > 0.01) { g.fillStyle = 'rgba(255,240,210,' + flashAmt + ')'; g.fillRect(0, 0, W, H); flashAmt *= Math.exp(-dt * 6); }
    drawMarkers();
    if (I && I.draw) I.draw(g, toScreen);
    for (const f of floats) { const s = toScreen(f.x, f.y), k = f.t / 1.3; g.globalAlpha = 1 - k * k; g.font = '800 ' + (f.big ? 22 : 16) + 'px ' + FONT; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(f.text, s[0], s[1] - k * 34); g.fillStyle = f.col; g.fillText(f.text, s[0], s[1] - k * 34); }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- set-up
  function resize() {
    if (!cv) return;
    W = cv.clientWidth || root.innerWidth; H = cv.clientHeight || root.innerHeight; dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (!lightCv) { lightCv = document.createElement('canvas'); lg = lightCv.getContext('2d'); }
    lightCv.width = Math.ceil(cv.width / 2); lightCv.height = Math.ceil(cv.height / 2);
  }
  function setState(s) {
    S = s;
    if (seedKey !== s.seed + ':' + (s.demo ? 'd' : '')) { seedKey = s.seed + ':' + (s.demo ? 'd' : ''); buildProps(); for (const k in born) delete born[k]; figs.clear(); fight = null; rebuildTerritory(); seedWalkers(); groundKey = ''; frame.key = ownedKey(); }
  }
  function init(canvas) {
    cv = canvas; g = cv.getContext('2d');
    if (!g.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
    reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    bind(); resize();
  }
  function horde(n) {                                  // a horde runs in from the edge of town
    for (let i = 0; i < n; i++) { const e0 = edgeTile(); if (e0) spawnZ({ kind: 'horde', x: e0[0] + 0.5, y: e0[1] + 0.5, st: 'idle', wait: i * 0.25 }); }
  }
  function hordeOver(won) { for (const z of zs) if (z.kind === 'horde') { if (won) killZ(z); else { z.kind = 'street'; z.st = 'idle'; z.wait = rand(0.5, 3); z.bang = false; } } }

  Object.assign(api, { init, setState, resize, frame, fit, focus, view, boxOf, pick, toScreen, toTile, P, lot, cam, inset, setInsets: (o) => Object.assign(inset, o),
    shootAt, killZ, spawnZ, taken, runStart, runEnd, float, burst, shake, tracer, horde, hordeOver, shootable, distOwn, clock,
    setReduced: (v) => { reduced = !!v; }, flash: (a) => { flashAmt = a; }, smokeAt: (x, y, z) => { const q = P(x, y, z); smoke.push({ x: q[0], y: q[1], t: 0, life: 2.5, s: 5, vx: rand(-4, 8) }); },
    rebuild: () => { rebuildTerritory(); groundKey = ''; }, time: () => T, ctx: () => g, size: () => [W, H] });
  HH.Scene = api;
})(typeof self !== 'undefined' ? self : this);
