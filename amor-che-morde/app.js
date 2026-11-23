/* L'Amor che Morde: the page. Audio clock, surtitles, controls, roses. */
(function () {
  'use strict';
  const OP = window.OPERA;
  const T = window.Theatre;
  const U = window.OperaUtil;
  const $ = (id) => document.getElementById(id);
  const cv = $('stage');
  T.init(cv);
  if (/[#&]thumb\b/.test(location.hash)) { document.body.classList.add('thumb'); T.setThumb(true); }

  // ------------------------------------------------------------------ prefs
  const store = {
    get(k, d) { try { const v = localStorage.getItem('amor:' + k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('amor:' + k, v); } catch (e) { /* private mode */ } },
  };
  const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  T.setReduced(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => T.setReduced(e.matches));

  // ------------------------------------------------------------------ sizing
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize() { T.resize(window.innerWidth, window.innerHeight, dpr); placeSubs(); }
  let rt = 0;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });
  T.resize(window.innerWidth, window.innerHeight, dpr);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { T.rebuild(); });

  // ------------------------------------------------------------------ audio and the clock
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = 'amor-che-morde.mp3';
  let audioOk = true;
  audio.addEventListener('error', () => { audioOk = false; });
  // a seek before the metadata has arrived can be ignored (Safari): keep it until it can land
  let pendingSeek = null;
  function seekAudio(t) {
    if (!audioOk) return;
    if (audio.readyState < 1) { pendingSeek = t; return; }
    try { audio.currentTime = t; } catch (e) { pendingSeek = t; }
  }
  audio.addEventListener('loadedmetadata', () => {
    if (pendingSeek !== null) { const t = pendingSeek; pendingSeek = null; try { audio.currentTime = t; } catch (e) { /* ignore */ } }
  });
  try {
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'L\u2019Amor che Morde', artist: 'Teatro dei Morti', album: 'Opera in tre atti' });
    }
  } catch (e) { /* not supported */ }
  let actx = null;
  let latency = 0;
  let playing = false;
  let anchor = 0;           // performance time (s) at opera time 0
  let shownT = 0;
  const now = () => performance.now() / 1000;
  const DUR = OP.duration;

  function ensureCtx() {
    if (actx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      latency = Math.min(0.3, Math.max(0, (actx.outputLatency || 0) || (actx.baseLatency || 0)));
    } catch (e) { actx = null; }
  }

  function clockT() {
    if (!playing) return shownT;
    let t = now() - anchor;
    if (audioOk && !audio.paused && audio.readyState >= 2) {
      const drift = audio.currentTime - t;
      if (Math.abs(drift) > 0.25) { anchor = now() - audio.currentTime; t = audio.currentTime; } else anchor -= drift * 0.04;
    }
    return Math.max(0, t - latency);
  }

  let busy = false;
  async function playFrom(t) {
    if (busy) return;
    ensureCtx();
    if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
    t = Math.max(0, Math.min(DUR - 0.5, t));
    shownT = t;
    hideFine();
    if (audioOk) {
      busy = true;
      setBusy(true);
      seekAudio(t);
      try { await audio.play(); } catch (e) { /* blocked or missing: the picture runs on its own clock */ }
      busy = false;
      setBusy(false);
    }
    anchor = now() - (audioOk && !audio.paused ? audio.currentTime : t);
    playing = true;
    setIcon();
    wake();
  }
  function setBusy(on) {
    const go = $('go');
    go.disabled = on;
    go.textContent = on ? 'The orchestra is tuning\u2026' : 'Take your seat';
    document.body.style.cursor = on ? 'progress' : '';
  }
  function pause() {
    shownT = clockT();
    playing = false;
    audio.pause();
    setIcon();
    wake(true);
  }
  function seek(t) {
    t = Math.max(0, Math.min(DUR - 0.2, t));
    shownT = t;
    if (playing) anchor = now() - t;
    seekAudio(t);
    hideFine();
  }
  audio.addEventListener('ended', () => { if (playing) { shownT = DUR; playing = false; setIcon(); showFine(); } });

  // ------------------------------------------------------------------ programme, chapters
  const programme = $('programme');
  const chapters = OP.chapters.map(([t, id, label]) => ({ t, id, label }));
  const CH_LABEL = { top: 'Before the curtain', sinfonia: 'Sinfonia (overture)', act1: 'Act I: The Wedding', act2: 'Act II: The Cemetery', act3: 'Act III: The Hunger', bows: 'Curtain call' };
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const jump = $('jump');
  for (const ch of chapters) {
    if (ch.id === 'top') continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = { sinfonia: 'Overture', act1: 'Act I', act2: 'Act II', act3: 'Act III', bows: 'Bows' }[ch.id] || ch.label;
    b.addEventListener('click', () => begin(ch.t));
    jump.appendChild(b);
  }
  const actsMenu = $('acts');
  for (const ch of chapters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `${CH_LABEL[ch.id] || ch.label}<span>${fmt(ch.t)}</span>`;
    b.addEventListener('click', () => { actsMenu.hidden = true; $('actsbtn').setAttribute('aria-expanded', 'false'); if (!playing) playFrom(ch.t); else seek(ch.t); });
    actsMenu.appendChild(b);
  }
  $('actsbtn').addEventListener('click', (e) => {
    e.stopPropagation();
    actsMenu.hidden = !actsMenu.hidden;
    $('actsbtn').setAttribute('aria-expanded', String(!actsMenu.hidden));
    wake(true);
  });
  document.addEventListener('click', (e) => { if (!actsMenu.hidden && !actsMenu.contains(e.target)) { actsMenu.hidden = true; $('actsbtn').setAttribute('aria-expanded', 'false'); } });

  function begin(t) {
    programme.classList.add('gone');
    $('controls').hidden = false;
    started = true;
    playFrom(t);
  }
  let started = false;
  $('go').addEventListener('click', () => begin(0));

  // ------------------------------------------------------------------ controls
  const controls = $('controls');
  let idleTimer = 0;
  function wake(stay) {
    controls.classList.remove('idle');
    clearTimeout(idleTimer);
    if (!stay && playing) idleTimer = setTimeout(() => { if (playing && actsMenu.hidden) controls.classList.add('idle'); }, 3200);
  }
  function setIcon() {
    $('playicon').setAttribute('d', playing ? 'M3 2h3.5v12H3zM9.5 2H13v12H9.5z' : 'M4 2l10 6-10 6z');
    $('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  $('play').addEventListener('click', (e) => { e.stopPropagation(); if (playing) pause(); else playFrom(shownT >= DUR - 0.5 ? 0 : clockT()); });
  const bar = $('bar');
  for (const ch of chapters) {
    if (ch.t <= 0) continue;
    const d = document.createElement('div');
    d.className = 'tick';
    d.style.left = `${(ch.t / DUR) * 100}%`;
    bar.appendChild(d);
  }
  let dragging = false;
  const barT = (e) => { const r = bar.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * DUR; };
  bar.addEventListener('pointerdown', (e) => { dragging = true; bar.setPointerCapture(e.pointerId); seek(barT(e)); wake(true); e.stopPropagation(); });
  bar.addEventListener('pointermove', (e) => { if (dragging) seek(barT(e)); });
  bar.addEventListener('pointerup', () => { dragging = false; wake(); });
  bar.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { seek(clockT() + 10); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { seek(clockT() - 10); e.preventDefault(); }
  });
  const SUBMODES = ['both', 'en', 'off'];
  let subMode = store.get('subs', 'both');
  if (!SUBMODES.includes(subMode)) subMode = 'both';
  function setSubLabel() { $('subsbtn').textContent = { both: 'IT + EN', en: 'EN', off: 'Surtitles off' }[subMode]; }
  setSubLabel();
  $('subsbtn').addEventListener('click', (e) => { e.stopPropagation(); subMode = SUBMODES[(SUBMODES.indexOf(subMode) + 1) % 3]; store.set('subs', subMode); setSubLabel(); lastSub = null; wake(); });
  document.addEventListener('keydown', (e) => {
    if (!started) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target === bar)) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); if (playing) pause(); else playFrom(clockT()); }
    else if (e.key === 'ArrowRight') seek(clockT() + 10);
    else if (e.key === 'ArrowLeft') seek(clockT() - 10);
    else if (e.key === 's') $('subsbtn').click();
    wake();
  });
  window.addEventListener('pointermove', () => { if (started) wake(); }, { passive: true });

  // ------------------------------------------------------------------ the end
  const fine = $('fine');
  function showFine() { fine.classList.add('on'); controls.classList.remove('idle'); }
  function hideFine() { fine.classList.remove('on'); }
  const finaleT = (OP.numbers.find((n) => n[1] === 'finale') || [DUR - 60])[0];
  $('encore').addEventListener('click', () => playFrom(finaleT - 1));
  $('again').addEventListener('click', () => playFrom(0));

  // ------------------------------------------------------------------ surtitles
  const subsEl = $('subs');
  const itEl = subsEl.querySelector('.it');
  const enEl = subsEl.querySelector('.en');
  let lastSub = null;
  let subPlacement = '';
  function placeSubs() {
    const b = T.boardRect();
    const big = b.h >= 46 && b.w >= 320 && !b.portrait;
    if (big) {
      subPlacement = 'board';
      subsEl.className = subsEl.className.replace(/\b(board|band)\b/g, '').trim() + ' board';
      subsEl.style.top = `${b.y}px`; subsEl.style.height = `${b.h}px`; subsEl.style.width = `${b.w}px`; subsEl.style.left = `${b.x + b.w / 2}px`;
      enEl.style.fontSize = `${Math.max(15, Math.min(28, b.h * 0.34))}px`;
      itEl.style.fontSize = `${Math.max(12, Math.min(19, b.h * 0.23))}px`;
      T.setBoard && T.setBoard(true);
    } else {
      subPlacement = 'band';
      subsEl.className = subsEl.className.replace(/\b(board|band)\b/g, '').trim() + ' band';
      const portrait = window.innerWidth / window.innerHeight < 0.9;
      subsEl.style.top = portrait ? 'calc(max(10px, env(safe-area-inset-top)) + 48px)' : 'calc(max(6px, env(safe-area-inset-top)) + 4px)';
      subsEl.style.height = 'auto';
      subsEl.style.width = portrait ? 'min(94vw, 640px)' : 'min(60vw, 640px)';
      subsEl.style.left = '50%';
      enEl.style.fontSize = ''; itEl.style.fontSize = '';
      T.setBoard && T.setBoard(false);
    }
  }
  function subAt(t) {
    const L = OP.subs;
    const i = U.lastIdx(L, t);
    if (i < 0) return null;
    // a later-starting line wins; fall back to an earlier one still running
    for (let k = i; k >= Math.max(0, i - 3); k--) if (t < L[k][1]) return L[k];
    return null;
  }
  function updateSubs(t) {
    const s = subMode === 'off' ? null : subAt(t);
    if (s === lastSub) return;
    lastSub = s;
    const keep = subsEl.className.match(/\b(board|band)\b/);
    if (!s) { subsEl.className = 'empty ' + (keep ? keep[0] : ''); return; }
    const [, , who, it, en] = s;
    itEl.textContent = subMode === 'both' ? it : '';
    itEl.style.display = subMode === 'both' && it ? '' : 'none';
    enEl.textContent = en;
    let cls = '';
    if (who === 'title') cls = 'title';
    else if (who === 'house' || who === 'bell' || (!it && en.startsWith('['))) cls = 'note';
    subsEl.className = `${cls} ${keep ? keep[0] : ''}`.trim();
  }

  // ------------------------------------------------------------------ roses, and the zombie in front of you
  const hint = $('hint');
  const bowsT = (chapters.find((c) => c.id === 'bows') || { t: DUR }).t;
  let lastShush = -10;
  function sfx(kind) {
    if (!actx) return;
    try {
      const t0 = actx.currentTime;
      const n = Math.floor(actx.sampleRate * (kind === 'shush' ? 0.8 : 0.35));
      const buf = actx.createBuffer(1, n, actx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = actx.createBufferSource(); src.buffer = buf;
      const f = actx.createBiquadFilter(); f.type = 'bandpass';
      const g = actx.createGain();
      if (kind === 'shush') {
        f.frequency.value = 3600; f.Q.value = 0.9;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.08); g.gain.setValueAtTime(0.16, t0 + 0.5); g.gain.linearRampToValueAtTime(0, t0 + 0.78);
      } else {
        f.frequency.setValueAtTime(600, t0); f.frequency.exponentialRampToValueAtTime(2400, t0 + 0.3); f.Q.value = 1.4;
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.06, t0 + 0.12); g.gain.linearRampToValueAtTime(0, t0 + 0.34);
      }
      src.connect(f); f.connect(g); g.connect(actx.destination);
      src.start(t0);
    } catch (e) { /* no sound effects, no matter */ }
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!started) return;
    wake();
    const t = clockT();
    T.throwRose(e.clientX, e.clientY, t);
    sfx('whoosh');
    const music = t > 16 && t < bowsT - 0.5;
    if (playing && music && t - lastShush > 2.2) {
      lastShush = t;
      setTimeout(() => { T.shush(e.clientX, e.clientY, clockT()); sfx('shush'); }, 650);
    }
  });

  // ------------------------------------------------------------------ the loop
  placeSubs();
  let lastFrame = now();
  let slow = 0;
  const label = { cur: '' };
  const hashT = (() => { const m = /[#&]t=([\d.]+)/.exec(location.hash); return m ? parseFloat(m[1]) : null; })();
  if (hashT !== null) {
    programme.classList.add('gone');
    started = true;
    $('controls').hidden = false;
    shownT = Math.min(DUR - 0.1, hashT);
    seekAudio(shownT);
    setIcon();
  }
  function frame() {
    const tn = now();
    const dt = Math.min(0.1, tn - lastFrame);
    lastFrame = tn;
    const t = clockT();
    if (playing && t >= DUR - 0.05 && (!audioOk || audio.paused)) { playing = false; shownT = DUR; setIcon(); showFine(); }
    T.render(t, { dt: hashT !== null && !playing ? 0 : dt });
    updateSubs(t);
    // progress
    const k = Math.min(1, t / DUR);
    $('fill').style.width = `${k * 100}%`;
    $('knob').style.left = `${k * 100}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(k * 100)));
    $('time').textContent = `${fmt(t)} / ${fmt(DUR)}`;
    // the curtain-call hint
    hint.classList.toggle('on', started && t > bowsT + 15 && t < bowsT + 26);
    // describe the current number for screen readers
    const num = OP.numbers[U.lastIdx(OP.numbers, t)];
    const lab = num ? num[2] : 'Before the curtain';
    if (lab !== label.cur) { label.cur = lab; cv.setAttribute('aria-label', `A toy-theatre opera house: ${lab}.`); }
    // keep the board in place as the camera moves
    if ((frame.n = (frame.n || 0) + 1) % 15 === 0) placeSubs();
    // drop the resolution if this device struggles
    if (dt > 0.034 && playing) slow += dt; else slow = Math.max(0, slow - dt * 0.5);
    if (slow > 2.5 && dpr > 1) { dpr = 1; slow = 0; resize(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
