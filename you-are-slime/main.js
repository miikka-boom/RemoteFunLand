// You Are Slime: input, sound and the main loop.
'use strict';

const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// ---------- input: keyboard, gamepad, touch stick + jump
const keys = new Set();
const touch = { stickId: null, ox: 0, oy: 0, x: 0, y: 0, jumpIds: new Set() };
let jumpQueued = false;
const STICK_R = 54;
const padPrev = {};   // gamepad jump button last poll, by pad index

addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('button') && (e.code === 'Space' || e.code === 'Enter')) return;
  const k = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  if (!keys.has(k) && (k === 'Space' || k === 'KeyK' || k === 'KeyJ' || k === 'KeyZ')) jumpQueued = true;
  keys.add(k);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); touch.stickId = null; touch.jumpIds.clear(); showStick(false); });

const cv = $('c'), stickEl = $('stick'), knobEl = $('knob'), jumpEl = $('jump');
function showStick(on, x, y) {
  stickEl.classList.toggle('on', on);
  if (on) { stickEl.style.left = x + 'px'; stickEl.style.top = y + 'px'; }
  else { stickEl.style.left = ''; stickEl.style.top = ''; knobEl.style.transform = ''; }
}
cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') document.body.classList.add('touch');
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  startAudio();
  cv.setPointerCapture?.(e.pointerId);
  if (e.clientX < innerWidth * 0.5) {
    if (touch.stickId !== null) return;
    touch.stickId = e.pointerId; touch.ox = e.clientX; touch.oy = e.clientY; touch.x = touch.y = 0;
    showStick(true, e.clientX, e.clientY);
  } else {
    touch.jumpIds.add(e.pointerId);
    jumpQueued = true;
    jumpEl.classList.add('on');
  }
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== touch.stickId) return;
  let dx = e.clientX - touch.ox, dy = e.clientY - touch.oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  touch.x = dx / STICK_R; touch.y = dy / STICK_R;
  knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
});
function endPointer(e) {
  if (e.pointerId === touch.stickId) { touch.stickId = null; touch.x = touch.y = 0; showStick(false); }
  if (touch.jumpIds.delete(e.pointerId) && !touch.jumpIds.size) jumpEl.classList.remove('on');
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('contextmenu', e => e.preventDefault());

function readInput() {
  const p = Sim.player;
  let x = 0, y = 0, held = false;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
  if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
  if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
  if (keys.has('Space') || keys.has('KeyK') || keys.has('KeyJ') || keys.has('KeyZ')) held = true;
  if (touch.stickId !== null) {
    const m = Math.hypot(touch.x, touch.y);
    if (m > 0.18) {
      const k = Math.min(1, (m - 0.18) / 0.7) / m;
      x += touch.x * k; y += touch.y * k;
    }
  }
  if (touch.jumpIds.size) held = true;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (Math.abs(ax) > 0.2) x += ax;
    if (Math.abs(ay) > 0.2) y += ay;
    if (gp.buttons[14]?.pressed) x -= 1;
    if (gp.buttons[15]?.pressed) x += 1;
    if (gp.buttons[12]?.pressed) y -= 1;
    if (gp.buttons[13]?.pressed) y += 1;
    const b = !!(gp.buttons[0]?.pressed || gp.buttons[1]?.pressed);
    if (b && !padPrev[gp.index]) jumpQueued = true;
    padPrev[gp.index] = b;
    if (b) held = true;
  }
  p.inX = clamp(x, -1, 1); p.inY = clamp(y, -1, 1);
  p.jumpHeld = held;
  if (jumpQueued) { p.jumpPressed = true; jumpQueued = false; }
}

// ---------- sound (Web Audio, starts on the first tap or click)
let AC = null, master = null, soundOn = true, noiseBuf = null;
const lastSound = {};
function startAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  master = AC.createGain(); master.gain.value = soundOn ? 0.55 : 0;
  const comp = AC.createDynamicsCompressor();
  master.connect(comp).connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function canPlay(name, gap) {
  if (!AC || !soundOn) return false;
  const t = AC.currentTime;
  if (lastSound[name] && t - lastSound[name] < gap) return false;
  lastSound[name] = t; return true;
}
function tone(type, f0, f1, dur, vol, delay = 0) {
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.03);
}
function noise(dur, freq, q, vol, type = 'bandpass') {
  const t = AC.currentTime;
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
}
const Sfx = {
  jump(size) {
    if (!canPlay('jump', 0.08)) return;
    const k = 1.25 - Math.min(0.55, (size - 40) / 400);
    tone('sine', 170 * k, 520 * k, 0.17, 0.22);
    tone('triangle', 340 * k, 900 * k, 0.09, 0.05);
  },
  land(v, size) {
    if (!canPlay('land', 0.1)) return;
    const vol = Math.min(0.5, (v - 300) / 1600);
    if (vol <= 0.02) return;
    noise(0.16, 380, 0.9, vol * 0.9, 'lowpass');
    tone('sine', 140 - Math.min(60, size / 6), 45, 0.18, vol * 0.8);
  },
  absorb(food) {
    if (!canPlay('absorb', 0.045)) return;
    const f = 520 + Math.random() * 260;
    tone('sine', f, f * 1.6, 0.07, food ? 0.06 : 0.04);
  },
  boing() {
    if (!canPlay('boing', 0.15)) return;
    tone('triangle', 110, 640, 0.32, 0.2);
    tone('sine', 220, 1100, 0.22, 0.07, 0.02);
  },
  splash(v) {
    if (!canPlay('splash', 0.2)) return;
    noise(0.35, 1100, 0.7, Math.min(0.35, v / 2000));
  },
  press(dist) {
    if (!canPlay('press', 0.3)) return;
    const vol = 0.3 * clamp(1 - dist / 1400, 0, 1);
    if (vol < 0.02) return;
    tone('square', 80, 38, 0.22, vol * 0.4);
    noise(0.2, 200, 0.8, vol, 'lowpass');
  },
  split() {
    if (!canPlay('split', 0.12)) return;
    noise(0.12, 1800, 2.5, 0.08);
    tone('sine', 900, 300, 0.1, 0.05);
  },
};

function handleEvents() {
  const p = Sim.player;
  for (const ev of Sim.events) {
    const mine = ev.body === p;
    switch (ev.type) {
      case 'jump':
        if (mine) Sfx.jump(p.ids.length);
        spawnFx(ev.x, ev.y + slimeRadius(ev.body.ids.length) * 0.8, 5, CSS_COL[ev.body.ch], 180);
        break;
      case 'land':
        if (mine) {
          Sfx.land(ev.v, p.ids.length);
          if (!reduceMotion.matches && ev.v > 900) View.shake = Math.min(12, (ev.v - 900) / 80);
        }
        spawnFx(ev.x, ev.y + slimeRadius(ev.body.ids.length) * 0.7, Math.min(14, (ev.v / 120) | 0), CSS_COL[ev.body.ch], ev.v * 0.3);
        break;
      case 'absorb': if (mine) Sfx.absorb(ev.food); break;
      case 'boing': if (mine) Sfx.boing(); break;
      case 'splash':
        if (mine) Sfx.splash(ev.v);
        spawnFx(ev.x, ev.y, 14, 'rgba(160,215,255,0.8)', 260 + ev.v * 0.2);
        break;
      case 'press': Sfx.press(Math.hypot(ev.x - p.cx, ev.y - p.cy)); break;
      case 'split': if (mine) Sfx.split(); break;
    }
  }
  Sim.events.length = 0;
}

// ---------- HUD
const massEl = $('mass'), hintEl = $('hint');
let shownMass = -1;
function updateHud() {
  const n = Sim.player.ids.length;
  if (n !== shownMass) { massEl.textContent = n; shownMass = n; }
}
let hintTimer = 0;
function hint(text, secs = 5) {
  hintEl.textContent = text; hintEl.classList.remove('gone');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl.classList.add('gone'), secs * 1000);
}

$('rain').addEventListener('click', () => {
  startAudio();
  const p = Sim.player;
  const made = gooRain(p.cx, p.cy, 40);
  hint(made ? 'Goo incoming. Touch it to soak it up.' : 'The yard is full of goo already. Eat some first.', 3);
});
$('reset').addEventListener('click', () => { buildWorld(); stepSim(); syncRender(); });
$('snd').addEventListener('click', e => {
  soundOn = !soundOn;
  e.currentTarget.setAttribute('aria-pressed', soundOn);
  e.currentTarget.textContent = soundOn ? 'Sound' : 'Muted';
  startAudio();
  if (master) master.gain.value = soundOn ? 0.55 : 0;
});
$('play').addEventListener('click', () => {
  startAudio();
  $('intro').hidden = true;
  cv.focus?.();
  const t = document.body.classList.contains('touch') || matchMedia('(pointer: coarse)').matches;
  hint(t ? 'Left thumb: stick. Right thumb: jump. Hold the stick down to go gooey.' : 'A/D or ←/→ to crawl, W/S to stretch and squish, Space to jump.', 7);
});
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// ---------- main loop
initView(cv);
resizeView();
addEventListener('resize', resizeView);
function syncRender() {
  for (let i = 0; i < pTop; i++) { lx[i] = px[i]; ly[i] = py[i]; View.rx[i] = px[i]; View.ry[i] = py[i]; }
  View.fx.length = 0;
  updateCamera(true);
}
buildWorld();
stepSim();
syncRender();

let last = performance.now(), acc = 0;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 3) {
    readInput();
    stepSim();
    handleEvents();
    acc -= DT; steps++;
  }
  if (steps === 3) acc = 0;
  render(acc / DT, dt);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// expose a little for testing from the console
window.SLIME = {
  Sim, View, stepSim, buildWorld,
  teleport(x, y) {           // move the player (for testing from the console)
    const p = Sim.player, dx = x - p.cx, dy = y - p.cy;
    for (const i of p.ids) { px[i] += dx; py[i] += dy; ox[i] += dx; oy[i] += dy; lx[i] += dx; ly[i] += dy; vx[i] = vy[i] = 0; }
    p.cx = x; p.cy = y; syncRender();
  },
};
