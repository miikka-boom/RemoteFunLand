/* Hold the Hall: the opening. A short tap-action story played on the town itself: the three starters reach the Town
 * Hall at night, drop the walkers in the square, break the chained doors, bring down what was locked inside, crank
 * the generator and raise the flag. Nothing here can be lost; it only teaches the tap. SKIP ends it at once.
 *
 * HH.Intro: start(state, onDone) · frame(dt) · tap(hit, x, y) · hold(down) · skip() · active
 * While it runs it owns HH.Scene.intro = { hall: { restored, chained, flicker, lights, flag, open }, group: [figures],
 *   lights: [[x, y, r, alpha, cold]], ambient, ring: { x, y, z, r } | null, extra: [drawables], draw(g, toScreen) }
 */
(function (root) {
  'use strict';
  const HH = root.HH, Sc = HH.Scene, Sfx = HH.Sfx, A = HH.Art, P = A.P;
  const X = 11, Y = 11, TAU = Math.PI * 2, GX = X + 1.9, GY = 15.68;
  const $ = (id) => document.getElementById(id);
  const F = (c) => ({ t: A.tone(c, 1.1), l: A.tone(c, 0.93), r: A.tone(c, 0.7) });
  const ease = (k) => { k = Math.max(0, Math.min(1, k)); return 1 - (1 - k) * (1 - k); };
  const HOME = [[X + 1.25, 15.6], [X + 1.9, 15.82], [X + 2.55, 15.58]], DOOR = [[X + 1.3, Y + 3.5], [X + 1.85, Y + 3.7], [X + 2.4, Y + 3.5]];
  let I = null, S = null, done = null, step = '', t = 0, page = 0, wave = 0, queue = [], knocks = 0, brute = null, holding = false, prog = 0, crankT = 0, raising = -1, lightK = 0, shooter = 0, fear = 0;

  const cap = (html, hint) => { $('stCap').innerHTML = html ? html + (hint ? '<small>' + hint + '</small>' : '') : ''; };
  const title = (big, sub) => { $('stTitle').innerHTML = big || sub ? (big ? '<b>' + big + '</b>' : '') + (sub ? '<span>' + sub + '</span>' : '') : ''; };
  const alive = () => Sc.zs.filter((z) => z.kind === 'intro' && z.st !== 'dead');
  const walkTo = (pts) => I.group.forEach((m, i) => { m.tx = pts[i][0]; m.ty = pts[i][1]; });
  // what the camera frames, as boxes in world pixels: the hall is the diamond (-128..128, 352..480) and 100 high
  const VIEW = { far: [-420, 150, 420, 620], hall: [-200, 232, 200, 506], square: [-250, 268, 110, 540], close: [-170, 296, 100, 492] };
  function look(name, snap, k) {                      // k < 1 blends from the far view towards the named one
    let v = VIEW[name]; if (k != null && k < 1) v = v.map((q, i) => VIEW.far[i] + (q - VIEW.far[i]) * k);
    Sc.view(v[0], v[1], v[2], v[3], snap, 1.8, 0.4);
  }
  function walker(x, y, sp, big) {
    const z = Sc.spawnZ({ kind: 'intro', x, y, gx: GX, gy: GY, stop: big ? 0.95 : 0.7, sp, s: big ? 1.9 : 1, hp: big ? 9 : 1 });
    const reach = (w) => {                             // it got to the group: a shove back, never a loss
      const dx = w.x - GX, dy = w.y - GY, d = Math.hypot(dx, dy) || 1, k = big ? 1.2 : 1.5;
      w.x += dx / d * k; w.y += dy / d * k; fear = 1; Sc.shake(big ? 11 : 7); Sfx.play('hit'); w.onReach = reach;
    };
    z.onReach = reach;
    return z;
  }
  function go(name) {
    step = name; t = 0; I.ring = null;
    if (name === 'title') { page = 0; title('DAY 41', 'Three of you left. No food. No walls.'); cap('', ''); $('stCap').innerHTML = '<small>TAP TO GO ON</small>'; }
    else if (name === 'walkers') {
      title('', ''); wave = 1;
      queue = [[0.2, X - 0.7, 15.45, 0.3], [0.9, X + 4.7, 15.5, 0.3], [1.8, X + 0.7, Y + 3.45, 0.24], [2.9, X + 3.2, Y + 3.55, 0.24], [4.2, X + 1.9, 17.6, 0.3]];
      count();
    } else if (name === 'door') { walkTo(DOOR); cap('The doors are chained shut.'); knocks = 0; }
    else if (name === 'brute') { walkTo(HOME.map((p) => [p[0], p[1] + 0.25])); cap('Something was locked inside! <b>Tap it fast!</b>'); brute = null; }
    else if (name === 'generator') {
      walkTo([[X + 3.62, Y + 3.0], DOOR[1], DOOR[2]]); prog = 0; holding = false; look('close');
      cap('The generator still has fuel. <b>Hold to crank it.</b>'); I.ring = { x: X + 3.56, y: Y + 2.3, z: 8, r: 24 };
    } else if (name === 'lights') {
      I.hall.restored = true; I.hall.flicker = false; I.hall.chained = false; I.hall.open = false;
      Sc.taken(HH.Engine.hall(S)); Sc.flash(0.5); Sfx.play('power'); cap('Lights. Walls. A door that locks.'); walkTo(DOOR); look('hall');
    }
    else if (name === 'flag') { cap('Make it ours. <b>Tap to raise the flag!</b>'); I.ring = { x: X + 1.8, y: Y + 1.7, z: 116, r: 22 }; raising = -1; }
    else if (name === 'end') { cap('', ''); title('HOLD THE HALL', 'Now take back the town.'); }
  }
  const count = () => cap(wave === 1 ? 'Walkers in the square. <b>Tap them!</b>' : 'More of them. <b>Keep tapping!</b>', 'WALKERS LEFT: ' + (alive().length + queue.length));

  function start(state, onDone) {
    S = state; done = onDone;
    const pe = S.people;
    I = Sc.intro = { hall: { restored: false, chained: true, flicker: true, lights: 0, flag: 0, open: false }, group: [], lights: [], ambient: '#161c30', ring: null, extra: [], draw };
    for (let i = 0; i < 3; i++) { const p = pe[i % pe.length]; I.group.push({ x: HOME[i][0], y: HOME[i][1] + 2.2, tx: HOME[i][0], ty: HOME[i][1], look: p.look, name: p.name, face: 1, pose: 'stand', t: i * 1.7, walk: false, aim: 0 }); }
    for (let i = Sc.zs.length - 1; i >= 0; i--) { const z = Sc.zs[i]; if (z.kind === 'street' && Math.abs(z.x - 13) < 6.5 && Math.abs(z.y - 13) < 6.5) Sc.zs.splice(i, 1); }
    I.extra.push({ key: X + 3.56 + Y + 2.3, f: () => {                // the generator beside the hall
      const g = Sc.ctx(); A.box(g, X + 3.34, Y + 2.05, X + 3.78, Y + 2.55, 0, 13, F(I.hall.restored ? '#4f8a5b' : '#4a5a4e')); A.box(g, X + 3.42, Y + 2.12, X + 3.58, Y + 2.28, 13, 19, F('#3a3f45'));
      const q = P(X + 3.78, Y + 2.3, 8), a = prog * 14; A.line(g, q, [q[0] + Math.cos(a) * 6, q[1] + Math.sin(a) * 4], '#c9c4b8', 2);
    } });
    $('story').hidden = false; $('stSkip').onclick = (e) => { e.stopPropagation(); skip(); };
    Sc.setInsets({ t: 12, b: 88, l: 0, r: 0 }); look('far', true);
    go('title');
  }
  function frame(dt) {
    if (!I) return;
    t += dt; fear = Math.max(0, fear - dt * 2.5);
    for (const m of I.group) {                         // the three walk to where the story needs them
      const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy); m.t += dt; m.aim = Math.max(0, m.aim - dt);
      if (d > 0.05) { const v = Math.min(d, 1.5 * dt); m.x += dx / d * v; m.y += dy / d * v; m.walk = true; m.face = dx - dy >= 0 ? 1 : -1; m.pose = 'stand'; }
      else { m.walk = false; m.pose = m.aim > 0 ? 'aim' : 'stand'; }
    }
    const L = I.lights = [];
    for (const m of I.group) L.push([m.x, m.y, 108, 0.9, 0]);
    if (I.hall.flicker && Math.sin(Sc.time() * 13) + Math.sin(Sc.time() * 7.3) > 0.4) L.push([X + 2.6, Y + 3.0, 46, 0.5, 0]);

    if (step === 'title') look('hall', false, page ? 0.4 + 0.6 * ease(t / 2.2) : 0.4 * ease(t / 7));   // a slow push in
    else if (step === 'walkers') {
      look('square');
      for (let i = queue.length - 1; i >= 0; i--) if (t >= queue[i][0]) { const q = queue.splice(i, 1)[0]; walker(q[1], q[2], q[3]); count(); }
      if (!queue.length && !alive().length && t > 1) {
        if (wave === 1) { wave = 2; t = 0; queue = [[0.3, X - 1.0, 15.6, 0.42], [0.8, X + 5.0, 15.4, 0.42], [1.5, X + 1.0, 17.9, 0.4], [2.1, X + 2.9, 18.0, 0.4]]; count(); }
        else go('door');
      }
    } else if (step === 'door') {
      const there = I.group.every((m) => Math.hypot(m.tx - m.x, m.ty - m.y) < 0.06);
      if (there && !I.ring && knocks < 6) { look('close'); I.ring = { x: X + 1.81, y: Y + 2.92, z: 14, r: 26 }; cap('The doors are chained shut. <b>Tap them!</b>', dots()); }
    } else if (step === 'brute') {
      if (!brute && t > 0.7) { brute = walker(X + 1.8, Y + 3.05, 0.2, true); look('square'); }
      if (brute && brute.st !== 'dead') L.push([brute.x, brute.y, 62, 0.55, 1]);       // a cold rim of light, so it reads in the dark
      if (brute && brute.st === 'dead' && t > 1.2) { if (brute.fall >= 0.95) go('generator'); }
    } else if (step === 'generator') {
      if (holding) { prog = Math.min(1, prog + dt / 2.3); crankT -= dt; if (crankT <= 0) { crankT = 0.11; Sfx.play('crank'); } I.hall.lights = Math.random() < prog * 0.5 ? prog * 0.3 : 0; L.push([X + 3.56, Y + 2.3, 40 + prog * 40, 0.6, 0]); }
      else { prog = Math.max(0, prog - dt / 4); I.hall.lights = 0; }
      if (prog >= 1) go('lights');
    } else if (step === 'lights' || step === 'flag' || step === 'end') {
      if (step === 'lights') { lightK = ease(t / 1.8); I.hall.lights = Math.min(1, t / 1.4); I.ambient = A.mix('#161c30', '#3a4670', lightK); if (t > 2.7) go('flag'); }
      if (step === 'flag' && raising >= 0) { raising += dt; I.hall.flag = Math.min(1, raising / 1.3); if (raising > 2.3) go('end'); }
      if (step === 'end' && t > 3.4) finish();
    }
  }
  const dots = () => { let s = ''; for (let i = 0; i < 6; i++) s += i < knocks ? '●' : '○'; return s; };
  function nearest(z) { let b = I.group[0], bd = 1e9; for (const m of I.group) { const d = Math.hypot(m.x - z.x, m.y - z.y); if (d < bd) { bd = d; b = m; } } return b; }
  function tap(hit) {
    if (!I) return;
    if (step === 'title') { page++; if (page === 1) { t = 0; title('THE TOWN HALL', 'The radio said its generator still runs.<br>Get inside.'); } else go('walkers'); Sfx.play('tap'); return; }
    if ((step === 'walkers' || step === 'brute') && hit && hit.kind === 'zombie' && hit.z.kind === 'intro') {
      const z = hit.z, m = step === 'brute' ? I.group[shooter++ % 3] : nearest(z);
      m.aim = 0.35; m.face = z.x - z.y >= m.x - m.y ? 1 : -1;
      const dead = Sc.shootAt(z, [m.x, m.y]); Sfx.play('shot');
      if (z.s > 1.5) { const dx = z.x - GX, dy = z.y - GY, d = Math.hypot(dx, dy) || 1; z.x += dx / d * 0.12; z.y += dy / d * 0.12; if (dead) { Sfx.play('thud'); Sc.shake(13); Sc.burst(z.x, z.y, 20, '#9fb08c', 16); cap('It is down.'); } else Sfx.play('hit'); }
      else if (dead) { Sfx.play('groan'); if (step === 'walkers') count(); }
      return;
    }
    if (step === 'door' && I.ring) {
      knocks++; Sc.shake(5); Sfx.play('clang'); Sc.burst(X + 1.81, Y + 2.95, 14, '#ffd27a', 7); I.group[1].aim = 0.2;
      if (knocks >= 6) { I.hall.chained = false; I.hall.open = true; I.ring = null; Sfx.play('door'); Sc.shake(10); go('brute'); }
      else cap('The doors are chained shut. <b>Tap them!</b>', dots());
      return;
    }
    if (step === 'flag' && raising < 0) { raising = 0; I.ring = null; cap('', ''); Sfx.play('bell'); setTimeout(() => Sfx.play('bell'), 900); setTimeout(() => Sfx.play('bell'), 1800); return; }
    if (step === 'end' && t > 0.8) finish();
  }
  function draw(g, toScreen) {
    const T = Sc.time();
    if (fear > 0) { g.fillStyle = 'rgba(200,30,30,' + fear * 0.22 + ')'; g.fillRect(0, 0, 4000, 4000); }
    if (step === 'walkers' && wave === 1 && t < 6) {   // who the three are
      g.globalAlpha = Math.min(1, (6 - t) / 1.5); g.font = '700 14px "Barlow Condensed", "Arial Narrow", sans-serif'; g.textAlign = 'center';
      for (const m of I.group) { const q = P(m.x, m.y, 38), s = toScreen(q[0], q[1]); g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 3; g.strokeText(m.name, s[0], s[1]); g.fillStyle = '#fff'; g.fillText(m.name, s[0], s[1]); }
      g.globalAlpha = 1;
    }
    if (brute && brute.st !== 'dead') { const q = P(brute.x, brute.y, 60), s = toScreen(q[0], q[1]); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(s[0] - 31, s[1] - 5, 62, 9); g.fillStyle = '#e5484d'; g.fillRect(s[0] - 29, s[1] - 3, 58 * Math.max(0, brute.hp) / 9, 5); }
    if (step === 'generator') { const q = P(X + 3.56, Y + 2.3, 8), s = toScreen(q[0], q[1]); g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 7; g.beginPath(); g.arc(s[0], s[1], 30, 0, TAU); g.stroke(); g.strokeStyle = '#ffd27a'; g.lineWidth = 5; g.beginPath(); g.arc(s[0], s[1], 30, -Math.PI / 2, -Math.PI / 2 + TAU * prog); g.stroke(); }
  }
  function finish() {
    if (!I) return;
    for (let i = Sc.zs.length - 1; i >= 0; i--) if (Sc.zs[i].kind === 'intro') Sc.zs.splice(i, 1);
    const lit = I.hall.restored;
    I = Sc.intro = null; brute = null; lightK = 0; raising = -1;
    title('', ''); cap('', ''); $('story').hidden = true;
    const f = done; done = null; if (f) f(lit);                 // lit: the walls are already up
  }
  function skip() { finish(); }
  HH.Intro = { start, frame, tap, hold: (down) => { holding = !!down && step === 'generator'; }, skip, get active() { return !!I; }, get step() { return step; } };
})(typeof self !== 'undefined' ? self : this);
