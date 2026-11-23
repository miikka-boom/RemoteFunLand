/* We Will Survive. Right? — the player.
   One clock (the audio's, when there is sound) drives the picture: shots.js draws the scene for
   time t, this file adds the words, the grain and the vignette, and runs the gate, the HUD and
   the end card. ?capture&w=..&h=.. exposes window.__capture for tools/render-video.cjs. */
(function () {
'use strict';
const S = WWS.score, G = WWS.G;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const env = { reduce: reduceMotion || params.has('reduced'), still: reduceMotion, captions: true, quality: 1 };
WWS.env = env;

/* ---------------- size ---------------- */
let W = 0, H = 0, DPR = 1;
function resize() {
  if (CAPTURE) {
    const w = +params.get('w') || 1920, h = +params.get('h') || 1080;
    if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; DPR = Math.max(1, Math.min(W, H) / 540); postCache = null; }
    return;
  }
  const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * env.quality;
  let w = Math.round(cw * dpr), h = Math.round(ch * dpr);
  const k = Math.min(1, Math.sqrt(2300000 / (w * h)));
  w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
  DPR = w / cw;
  if (w !== W || h !== H) { W = canvas.width = w; H = canvas.height = h; postCache = null; }
}

/* ---------------- fonts ---------------- */
const FONTS = [['Anton', 'fonts/anton-latin.woff2'], ['Special Elite', 'fonts/special-elite-latin.woff2']];
const fontsReady = Promise.all(FONTS.map(([fam, url]) => {
  try { const f = new FontFace(fam, `url(${url}) format("woff2")`); document.fonts.add(f); return f.load().catch(() => null); } catch (e) { return Promise.resolve(null); }
}));
const F_SLAM = '"Anton", Impact, "Arial Narrow Bold", sans-serif';
const F_TYPE = '"Special Elite", "Courier New", monospace';
const F_SUB = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/* ---------------- post: vignette and grain ---------------- */
let postCache = null;
function buildPost() {
  const vg = G.canvas(W, H), x = vg.getContext('2d');
  const gr = x.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.65, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)');
  x.fillStyle = gr; x.fillRect(0, 0, W, H);
  const tiles = [];
  for (let k = 0; k < 4; k++) {
    const c = G.canvas(256, 256), y = c.getContext('2d'), img = y.createImageData(256, 256), R = G.rng(91 + k);
    for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (R() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    y.putImageData(img, 0, 0); tiles.push(c);
  }
  postCache = { vg, tiles, pats: tiles.map((c) => ctx.createPattern(c, 'repeat')) };
}
function post(fx, t) {
  if (!postCache) buildPost();
  G.screen(ctx);
  // flashes, capped (and dimmed further when flashes are reduced)
  if (fx.flash && fx.flash[3] > 0.003) {
    const cap = env.reduce ? 0.1 : 0.42;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = G.rgba(fx.flash, Math.min(cap, fx.flash[3]));
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = fx.vig === undefined ? 1 : fx.vig;
  ctx.drawImage(postCache.vg, 0, 0);
  ctx.globalAlpha = 1;
  // grain
  const k = Math.floor(t * 24) % 4, pat = postCache.pats[k];
  if (pat) {
    const sc = Math.max(1, Math.round(DPR));
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = fx.grain === undefined ? 0.07 : fx.grain;
    ctx.translate(-((Math.floor(t * 24) * 73) % 256), -((Math.floor(t * 24) * 151) % 256)); ctx.scale(sc, sc);
    ctx.fillStyle = pat; ctx.fillRect(0, 0, W / sc + 512, H / sc + 512);
    ctx.restore();
  }
  // fades: the opening, and whatever the shot asks for
  let fade = Math.max(fx.fade || 0, 1 - G.smooth(t / 2.2));
  if (fade > 0.002) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; ctx.fillRect(0, 0, W, H); }
}

/* ---------------- words ---------------- */
const LINE_COL = { friend: [255, 196, 92], you: [176, 224, 255], whisper: [255, 214, 150] };
const LINE_TAG = { friend: 'YOUR FRIEND', you: 'YOU', whisper: 'YOUR FRIEND, QUIETLY' };
function wrap(text, maxW) {
  const words = text.split(' '), lines = []; let cur = '';
  for (const w of words) { const tryL = cur ? cur + ' ' + w : w; if (ctx.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL; }
  if (cur) lines.push(cur); return lines;
}
function words(t, bar) {
  G.screen(ctx);
  const u = Math.min(W, H * 1.6) / 100, port = W < H;
  ctx.textBaseline = 'alphabetic';
  for (const [a, b, who, text] of S.LINES) {
    if (bar < a || bar >= b) continue;
    const ta = (bar - a) * S.BAR, tb = (b - bar) * S.BAR, inA = G.smooth(ta / 0.18), outA = G.smooth(tb / 0.2), al = Math.min(inA, outA);
    if (who === 'slam') slam(text, ta, tb, u);
    else if (who === 'stamp') stamp(text, ta, al, u, port);
    else if (who === 'narr') narr(text, ta, al, u);
    else if (env.captions) dialogue(who, text, al, ta, u, port);
  }
}
function dialogue(who, text, al, ta, u, port) {
  const size = Math.round(Math.max(2.15 * u, 16 * DPR)), tagSize = Math.round(size * 0.52);
  ctx.font = `${who === 'whisper' ? 'italic ' : ''}600 ${size}px ${F_SUB}`;
  const maxW = W * (port ? 0.86 : 0.62), lines = wrap(text, maxW), lh = size * 1.22;
  const bottom = H - Math.max(H * 0.075, 58 * DPR), y0 = bottom - (lines.length - 1) * lh, rise = (1 - G.smooth(ta / 0.25)) * size * 0.25;
  ctx.textAlign = 'center';
  // a soft dark band behind the words
  let mw = 0; for (const l of lines) mw = Math.max(mw, ctx.measureText(l).width);
  const bx = W / 2 - mw / 2 - size * 0.7, by = y0 - size * 1.05 - tagSize * 1.5, bw = mw + size * 1.4, bh = (lines.length - 1) * lh + size * 1.45 + tagSize * 1.5;
  const gr = ctx.createLinearGradient(0, by, 0, by + bh);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, `rgba(0,0,0,${0.42 * al})`); gr.addColorStop(1, `rgba(0,0,0,${0.5 * al})`);
  ctx.fillStyle = gr; ctx.fillRect(bx, by + rise, bw, bh);
  const col = LINE_COL[who] || [255, 255, 255];
  ctx.font = `700 ${tagSize}px ${F_SUB}`;
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${tagSize * 0.14}px`;
  ctx.fillStyle = G.rgba(col, 0.9 * al);
  ctx.fillText(LINE_TAG[who] || '', W / 2, y0 - size * 1.02 + rise);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  ctx.font = `${who === 'whisper' ? 'italic ' : ''}600 ${size}px ${F_SUB}`;
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = size * 0.3; ctx.shadowOffsetY = size * 0.06;
  ctx.fillStyle = who === 'whisper' ? `rgba(235,228,215,${0.85 * al})` : `rgba(250,248,242,${al})`;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh + rise));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}
function stamp(text, ta, al, u, port) {
  const size = Math.round(Math.max(1.45 * u, 12.5 * DPR));
  ctx.font = `${size}px ${F_TYPE}`; ctx.textAlign = 'left';
  const n = Math.min(text.length, Math.floor(ta / 0.035)), shown = text.slice(0, n);
  const x = Math.max(W * 0.045, 18 * DPR), y = port ? Math.max(H * 0.1, 74 * DPR) : Math.max(H * 0.12, 66 * DPR);
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = size * 0.4;
  ctx.fillStyle = `rgba(232,226,210,${0.92 * al})`;
  ctx.fillText(shown, x, y);
  if (n < text.length || Math.floor(ta * 2.5) % 2 === 0) { const cw = ctx.measureText(shown).width; ctx.fillRect(x + cw + size * 0.1, y - size * 0.8, size * 0.5, size * 0.9); }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
}
function narr(text, ta, al, u) {
  const size = Math.round(Math.max(3.4 * u, 26 * DPR));
  ctx.font = `${size}px ${F_TYPE}`; ctx.textAlign = 'center';
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = `${size * 0.08}px`;
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = `rgba(226,232,240,${0.9 * al})`;
  ctx.fillText(text, W / 2, H * 0.42 + (1 - G.smooth(ta / 1.2)) * size * 0.2);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
}
function slam(text, ta, tb, u) {
  const lines = text.split('|');
  const punch = 1 + 0.5 * Math.exp(-ta / 0.07), al = Math.min(1, ta / 0.04) * G.smooth(tb / 0.35);
  if (al <= 0.01) return;
  let size = Math.min(W * (lines.length > 1 ? 0.2 : 0.26), H * (lines.length > 1 ? 0.24 : 0.36));
  ctx.font = `${size}px ${F_SLAM}`;
  let mw = 0; for (const l of lines) mw = Math.max(mw, ctx.measureText(l).width);
  if (mw > W * 0.86) { size *= W * 0.86 / mw; ctx.font = `${size}px ${F_SLAM}`; }
  const lh = size * 0.98, total = lh * lines.length;
  const jit = env.still ? 0 : Math.exp(-ta / 0.25) * size * 0.03;
  ctx.save();
  ctx.translate(W / 2 + G.noise(ta * 40, 5) * jit, H * 0.5 + G.noise(ta * 37, 6) * jit);
  ctx.scale(punch, punch);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const red = text.indexOf('RIGHT') >= 0;
  lines.forEach((l, i) => {
    const y = -total / 2 + lh * (i + 0.5);
    ctx.globalCompositeOperation = 'lighter';
    const ca = env.still ? 0 : size * 0.035 * Math.exp(-ta / 0.4);
    ctx.fillStyle = `rgba(255,30,30,${0.55 * al})`; ctx.fillText(l, -ca, y);
    ctx.fillStyle = `rgba(30,200,255,${0.35 * al})`; ctx.fillText(l, ca, y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = red ? 'rgba(255,0,0,0.75)' : 'rgba(255,60,40,0.55)'; ctx.shadowBlur = size * 0.25;
    ctx.fillStyle = red ? `rgba(230,22,30,${al})` : `rgba(248,240,226,${al})`;
    ctx.fillText(l, 0, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  });
  ctx.restore();
}

/* ---------------- one frame ---------------- */
function shotAt(bar) { for (const s of S.SHOTS) if (bar < s.to) return s; return S.SHOTS[S.SHOTS.length - 1]; }
let lastShot = '';
function frame(t, quiet) {
  resize();
  const bar = t / S.BAR, shot = shotAt(Math.max(0, bar));
  G.screen(ctx);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  let fx = {};
  try { fx = WWS.shots[shot.id](ctx, W, H, t, bar, env) || {}; } catch (e) { console.error(e); }
  G.screen(ctx);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  post(fx, t);
  if (!quiet) words(t, bar);
  lastShot = shot.id;
  return shot.id;
}
WWS.frame = frame;

/* ---------------- capture mode ---------------- */
if (CAPTURE) {
  document.documentElement.classList.add('capture');
  fontsReady.then(() => {
    window.__capture = {
      frame(t) { const t0 = performance.now(); const id = frame(t, params.has('nooverlay')); return { ms: performance.now() - t0, id }; },
      rgba() {
        const d = ctx.getImageData(0, 0, W, H).data, rows = new Uint8Array(d.length), rl = W * 4;
        for (let y = 0; y < H; y++) rows.set(d.subarray((H - 1 - y) * rl, (H - y) * rl), y * rl);   // bottom-up: the tool flips
        let s = ''; for (let i = 0; i < rows.length; i += 0x8000) s += String.fromCharCode.apply(null, rows.subarray(i, i + 0x8000));
        return btoa(s);
      },
      png() { return canvas.toDataURL('image/png'); },
    };
    window.SCORE = { duration: S.DUR };
    window.__captureReady = true;
  });
  return;
}

/* ---------------- the player ---------------- */
const $ = (id) => document.getElementById(id);
const gate = $('gate'), endCard = $('end'), hud = $('hud'), progress = $('progress'), bar$ = $('bar'), timeEl = $('time');
const playBtn = $('play'), pauseBtn = $('pause'), ccBtn = $('cc'), fxBtn = $('fx'), flashOpt = $('flashOpt'), live = $('live');
let audio = null, bank = null, playing = false, started = false, pausedAt = 0, clockAnchor = 0, clockT = 0, raf = 0, lastLine = '';
const DUR = S.DUR;
if (env.reduce && flashOpt) flashOpt.checked = true;
WWS.Audio.prepare().then((b) => { bank = b; }).catch(() => { bank = null; });

function fmt(s) { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
// the picture's clock: the audio's output position when there is sound, else the wall clock
function now() {
  if (!playing) return pausedAt;
  if (audio && audio.state() === 'running') {
    const c = audio.ctx;
    if (c.getOutputTimestamp) {
      const ts = c.getOutputTimestamp();
      if (ts.contextTime > 0 && ts.performanceTime > 0) return audio.engine.timeline(ts.contextTime + (performance.now() - ts.performanceTime) / 1000);
    }
    return audio.time() - audio.latency();
  }
  return clockT + (performance.now() - clockAnchor) / 1000;
}
let shown = -1;
function loop() {
  raf = requestAnimationFrame(loop);
  let t = now();
  if (t < shown && playing && t > shown - 0.25) t = shown;   // never step back by a hair
  shown = t;
  const t0 = performance.now();
  frame(Math.max(0, Math.min(DUR, t)));
  adapt(performance.now() - t0);
  progress.style.transform = `scaleX(${Math.min(1, t / DUR)})`;
  timeEl.textContent = `${fmt(t)} / ${fmt(S.BARS * S.BAR)}`;
  announce(t / S.BAR);
  if (playing && t >= DUR) finish();
}
// keep the frame rate: drop resolution if frames take too long
let slow = 0, fast = 0;
function adapt(ms) {
  if (ms > 24) { slow++; fast = 0; } else if (ms < 9) { fast++; slow = 0; } else { slow = Math.max(0, slow - 1); }
  if (slow > 20 && env.quality > 0.5) { env.quality = Math.max(0.5, env.quality - 0.15); slow = 0; }
  if (fast > 240 && env.quality < 1) { env.quality = Math.min(1, env.quality + 0.1); fast = 0; }
}
function announce(bar) {
  if (!live) return;
  let txt = '';
  for (const [a, b, who, text] of S.LINES) if (bar >= a && bar < b && who !== 'stamp') txt = (who === 'friend' || who === 'whisper' ? 'Your friend: ' : who === 'you' ? 'You: ' : '') + text.replace('|', ' ');
  if (txt && txt !== lastLine) { live.textContent = txt; lastLine = txt; }
}
async function start(from) {
  from = from || 0;
  gate.hidden = true; endCard.hidden = true; hud.classList.add('on');
  document.documentElement.classList.add('playing');
  env.reduce = !!(flashOpt && flashOpt.checked) || reduceMotion;
  fxBtn.setAttribute('aria-pressed', String(!env.reduce));
  if (!audio) {
    try {
      if (!bank) bank = await WWS.Audio.prepare();
      audio = WWS.Audio.Live(bank);
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ } }
    } catch (e) { console.warn('no sound', e); audio = null; }
  }
  playing = true; started = true;
  clockT = from; clockAnchor = performance.now();
  if (audio) await audio.play(from);
  setPauseLabel();
  if (!raf) loop();
}
function pause() {
  if (!playing) return;
  pausedAt = now(); playing = false;
  if (audio) audio.pause();
  setPauseLabel();
}
async function resume() {
  if (playing || !started) return;
  playing = true; clockT = pausedAt; clockAnchor = performance.now();
  if (audio) { await audio.resume(); if (Math.abs(audio.time() - pausedAt) > 0.3) await audio.play(pausedAt); }
  setPauseLabel();
}
async function seek(t) {
  t = Math.max(0, Math.min(S.BARS * S.BAR - 0.5, t));
  shown = -1;
  if (!playing) { pausedAt = t; return; }
  clockT = t; clockAnchor = performance.now();
  if (audio) await audio.play(t);
}
function finish() {
  playing = false; pausedAt = DUR;
  if (audio) audio.stop();
  hud.classList.remove('on'); endCard.hidden = false;
  document.documentElement.classList.remove('playing');
  setPauseLabel();
  const b = $('replay'); if (b) b.focus();
}
function setPauseLabel() { pauseBtn.textContent = playing ? 'Pause' : 'Play'; pauseBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play'); }

playBtn.addEventListener('click', () => start(params.has('t') ? +params.get('t') || 0 : 0));
$('replay').addEventListener('click', () => start(0));
pauseBtn.addEventListener('click', () => (playing ? pause() : resume()));
ccBtn.addEventListener('click', () => { env.captions = !env.captions; ccBtn.setAttribute('aria-pressed', String(env.captions)); });
fxBtn.addEventListener('click', () => { env.reduce = !env.reduce || reduceMotion; fxBtn.setAttribute('aria-pressed', String(!env.reduce)); });
bar$.addEventListener('click', (e) => { const r = bar$.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * S.BARS * S.BAR); });
bar$.addEventListener('keydown', (e) => {
  const t = now();
  if (e.key === 'ArrowRight') { seek(t + 5); e.preventDefault(); } else if (e.key === 'ArrowLeft') { seek(t - 5); e.preventDefault(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, button, a, [role="slider"]')) return;
  if (e.key === ' ' && started) { e.preventDefault(); playing ? pause() : resume(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playing && !audio) pause(); });
window.addEventListener('resize', () => { if (!playing) frame(started ? pausedAt : POSTER, !started); });

// the poster behind the gate: a still from the werewolf's leap across the moon
const POSTER = S.sec(33.45);
fontsReady.then(() => { if (!started) frame(POSTER, true); });
frame(POSTER, true);
})();
