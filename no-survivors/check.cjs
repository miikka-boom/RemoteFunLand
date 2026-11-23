#!/usr/bin/env node
// NO SURVIVORS: Playwright checks for the page, the engine and every scene.
//
//   node no-survivors/check.cjs <command> [args] [options]
//
// Times: plain numbers are seconds; "b24" is bar 24, "b24:2" bar 24 beat 2, "b24.5" half way through bar 24,
// "b8:-0.25" a quarter beat before bar 8.
// Ranges: [from to] positional, or --shot <name> (that cue's bars), or --bars 24-32.
// Every page is pinned to ?night=14269&now=2026-11-23T20:00. Chromium runs with
// --use-angle=swiftshader --enable-unsafe-swiftshader --autoplay-policy=no-user-gesture-required.
// Output defaults to /tmp/claude-0/-home-user-RemoteFunLand/3d9fb946-e398-5257-b59a-5b2bd905fe4d/scratchpad/ns/shots/
//
// Commands
//   stills <t1,t2,...> [--out dir] [--w 1280] [--overlay 0|1] [--reduced] [--gl 1|0|both] [--phone] [--witching]
//                      [--trans 0|1] [--q 1|0.75|0.5] [--dev]
//       PNGs of exact frames (?still: the live view, GL or 2D post, overlay on top), one browser, one page load
//       (default --gl 1; --gl both writes _gl1 and _gl0 files). Prints each file with m:ss, bar:beat, shot, draw ms.
//       Files: <out>/still_b<bar>[_gl0][_phone][_reduced].png. --phone renders the 390 x 844 layout (frame + shelf).
//   sheet <from> <to> <stepSec> [--out file.png] [--cols 6] [--cell 320] [--w 1280] [--overlay 0|1] [--reduced]
//                      [--gl 1|0] [--phone] [--witching]
//       A labelled contact sheet (bar:beat, m:ss, shot) of stills from..to every stepSec (b-notation works too).
//   errors [from to] [--shot name] [--step <bars, default 0.5>] [--gate]
//       Full range (or --gate): loads the gate, presses Play (muted), arrows / N / Space, then ?end. Always: steps
//       through every half bar in still mode with ?dev purity traps on ?gl=1 and (every bar) ?gl=0, plus both
//       sides of every transition window, a 390 x 844 phone pass (shelf) and renderStill polaroids. Collects
//       console errors + page errors (an error report names the scene file:line); exit 1 if any. ~25 s in full.
//   phone
//       390 x 844 (mobile, touch): no horizontal overflow on the gate and while playing, the stage fits
//       (width <= 390, frame + shelf <= 330 px). Screenshots: phone_gate.png, phone_page.png, phone_playing.png.
//   fps [seconds] [--t from | --shot name] [--gl 1|0] [--phone] [--q x]
//       Plays muted (?autoplay&mute) and reports frame intervals plus engine draw / post / overlay ms, per cue.
//   board
//       Opens ?end at 1280 x 800 and 390 x 844 and screenshots the board (board_desktop.png, board_phone.png).
//   flashscan [from to] [--shot name] [--reduced] [--fps 30]
//       SPEC 10.6: every frame at 30 fps via NS.renderStill (160 x 90, overlay on); relative luminance on an 8 x 8
//       grid; a transition = a change >= 0.10 where the darker state < 0.80; general when >= 7 of 64 cells change
//       together, red when the cells are saturated red; 2 transitions = 1 flash. Fails if any 1 s window has > 3
//       flashes (> 1 with --reduced); failing windows are merged into ranges. --verbose lists every transition.
//   purity [--shot name]
//       Renders every cue at t0 + 0.3, mid and t1 - 0.3 twice (in order, then in reverse after unrelated frames)
//       with ?dev traps, hashing scene-only and scene+overlay renders; exit 1 on any mismatch or impure call.
//   clues [--out file.png]
//       One labelled sheet: for every SCORE.clues entry the 390-px-wide phone frame (with overlay and shelf) at its
//       bar with the clue rect outlined, plus the board's polaroid crop (renderStill with rect).
//   fonts
//       Each of the six families is really loaded (document.fonts.check and a fallback-width test).
//   data
//       Pure-data pass over SCORE for the SPEC 10.5 text rules (one read at a time, reading budgets, max 7 words,
//       no Lou captions, chapter/warning cards, card-display lines, nothing over clue holds); offenders by bar:beat.
//   mem [from to] [--shot name]
//       Steps through every bar with the live warm/release policy and reports NS.mem() peaks (total and per tag)
//       and the worst frame time per cue. Exit 1 over budget (120 MB total, 40 MB 'horde').
//   help
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');

const DEMO = __dirname;
const INDEX = 'file://' + path.join(DEMO, 'index.html');
const MP3 = path.join(DEMO, 'keep-them-dancing.mp3');
const SCR = '/tmp/claude-0/-home-user-RemoteFunLand/3d9fb946-e398-5257-b59a-5b2bd905fe4d/scratchpad/ns';
const OUT_DEFAULT = path.join(SCR, 'shots');
const PIN = { night: '14269', now: '2026-11-23T20:00' };
const LAUNCH = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const BAR = 1.6, BEAT = 0.4;

// ---- score (read in Node for ranges and labels) ------------------------------------------------------------
const SCORE = (() => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(DEMO, 'score.js'), 'utf8'), ctx);
  return ctx.window.SCORE;
})();
const END = SCORE.end || 179.2;
const CUES = SCORE.cues.map((c) => ({ shot: c.shot, t0: c.bars[0] * BAR, t1: c.bars[1] * BAR, bars: c.bars, trans: c.trans || { type: 'cut' } }));
const cueAt = (t) => { let r = CUES[0]; for (const c of CUES) if (c.t0 <= t + 1e-7) r = c; return r; };

// ---- arguments ------------------------------------------------------------------------------------------------
const BOOL = new Set(['reduced', 'phone', 'witching', 'verbose', 'gate']);
const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';
const pos = [], opt = {};
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2), nx = argv[i + 1];
    if (!BOOL.has(k) && nx !== undefined && !/^--/.test(nx)) { opt[k] = nx; i++; } else opt[k] = true;
  } else pos.push(a);
}
function parseT(s) {
  const str = String(s).trim();
  const m = /^b(-?[\d.]+)(?::(-?[\d.]+))?$/i.exec(str);
  const v = m ? +m[1] * BAR + (m[2] ? +m[2] * BEAT : 0) : +str.replace(/s$/, '');
  if (!isFinite(v)) die('cannot read the time "' + str + '" (use seconds like 38.4, or bars like b24, b24:2, b24.5, b8:-0.25)');
  return v;
}
function range(defFrom = 0, defTo = END) {
  if (opt.shot) {
    const c = CUES.find((x) => x.shot.toLowerCase() === String(opt.shot).toLowerCase());
    if (!c) die('no cue for shot ' + opt.shot + ' (shots: ' + CUES.map((x) => x.shot).join(', ') + ')');
    return [c.t0, Math.min(END, c.t1)];
  }
  if (opt.bars) { const [a, b] = String(opt.bars).split('-').map(Number); return [a * BAR, Math.min(END, b * BAR)]; }
  if (pos.length >= 2) return [parseT(pos[0]), Math.min(END, parseT(pos[1]))];
  return [defFrom, defTo];
}
const barLabel = (t) => { const b = Math.floor(t / BAR + 1e-6), bt = (t - b * BAR) / BEAT; return 'b' + b + ':' + (Math.abs(bt - Math.round(bt)) < 1e-3 ? Math.round(bt) : bt.toFixed(2)); };
const clock = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + s.toFixed(2).padStart(5, '0'); };
const fileTag = (t) => 'b' + (t / BAR).toFixed(2).padStart(6, '0');
function die(msg) { console.error('check.cjs: ' + msg); process.exit(2); }
function outDir() { const d = typeof opt.out === 'string' && !/\.png$/i.test(opt.out) ? path.resolve(opt.out) : OUT_DEFAULT; fs.mkdirSync(d, { recursive: true }); return d; }
function outFile(def) { const f = typeof opt.out === 'string' && /\.png$/i.test(opt.out) ? path.resolve(opt.out) : path.join(OUT_DEFAULT, def); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; }

// ---- browser --------------------------------------------------------------------------------------------------
let browser = null;
const notes = new Set();
async function launch() { browser = await chromium.launch({ args: LAUNCH }); return browser; }
function url(params) {
  const q = Object.assign({}, PIN, params || {});
  return INDEX + '?' + Object.keys(q).filter((k) => q[k] !== false && q[k] != null).map((k) => (q[k] === true || q[k] === '' ? k : k + '=' + encodeURIComponent(q[k]))).join('&');
}
async function newPage(vp, o = {}, sink, label) {
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: !!o.mobile, hasTouch: !!o.mobile });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  if (sink) watch(page, sink, label || '');
  return page;
}
function watch(page, sink, label) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location() || {};
    const txt = m.text();
    if (/keep-them-dancing\.mp3/.test(loc.url || '') && !fs.existsSync(MP3)) { notes.add('keep-them-dancing.mp3 is not built yet: its load error was ignored'); return; }
    sink.push((label ? label + ' ' : '') + 'console.error: ' + txt + (loc.url && !/index\.html$/.test(loc.url) ? '  (' + path.basename(loc.url) + ':' + (loc.lineNumber || 0) + ')' : ''));
  });
  page.on('pageerror', (e) => sink.push((label ? label + ' ' : '') + 'pageerror: ' + e.message));
}
async function openStill(page, t, params) {
  await page.goto(url(Object.assign({ still: true, t: (+t).toFixed(4) }, params || {})));
  await page.waitForFunction('window.NS_READY === true', null, { timeout: 90000 });
}
function viewport() { if (opt.phone) return { width: 390, height: 844 }; const w = +opt.w || 1280; return { width: w, height: Math.round(w * 9 / 16) }; }
function stillParams(gl) {
  const p = {};
  if (gl != null) p.gl = gl;
  if (opt.reduced) p.reduced = true;
  if (opt.witching) p.witching = true;
  if (opt.q) p.q = opt.q;
  if (opt.dev) p.dev = opt.dev === true ? '1' : opt.dev;
  return p;
}
async function capture(page, t, o) {
  const r = await page.evaluate(async (a) => {
    const timing = await NS.engine.still(a.t, { overlay: a.overlay, trans: a.trans });
    const c = NS.engine.snapshot({ overlay: a.overlay });
    return { url: c.toDataURL('image/png'), timing };
  }, { t, overlay: o.overlay !== false, trans: o.trans !== false });
  return { buf: Buffer.from(r.url.split(',')[1], 'base64'), timing: r.timing };
}
const glList = () => (opt.gl === 'both' ? ['1', '0'] : [opt.gl != null && opt.gl !== true ? String(opt.gl) : '1']);
const overlayOpt = () => !(opt.overlay === '0' || opt.overlay === 'false');

// ---- commands -------------------------------------------------------------------------------------------------
const COMMANDS = {};

COMMANDS.stills = async () => {
  if (!pos[0]) die('usage: stills <t1,t2,...>  (seconds or b24 / b24:2)');
  const times = pos[0].split(',').filter(Boolean).map(parseT).map((t) => Math.max(0, Math.min(END, t)));
  const dir = outDir();
  const errs = [];
  for (const gl of glList()) {
    const page = await newPage(viewport(), { mobile: !!opt.phone }, errs, 'gl' + gl);
    await openStill(page, times[0], stillParams(gl));
    for (const t of times) {
      const { buf, timing } = await capture(page, t, { overlay: overlayOpt(), trans: opt.trans !== '0' });
      const suffix = (glList().length > 1 || gl === '0' ? '_gl' + gl : '') + (opt.phone ? '_phone' : '') + (opt.reduced ? '_reduced' : '') + (opt.witching ? '_witching' : '') + (overlayOpt() ? '' : '_noov');
      const f = path.join(dir, 'still_' + fileTag(t) + suffix + '.png');
      fs.writeFileSync(f, buf);
      console.log(f + '   ' + clock(t) + ' ' + barLabel(t) + ' ' + (timing.cue || '') + '  draw ' + timing.draw.toFixed(1) + ' ms');
    }
    await page.context().close();
  }
  return report(errs);
};

COMMANDS.sheet = async () => {
  if (pos.length < 3) die('usage: sheet <from> <to> <stepSec> [--cols 6] [--cell 320]');
  const from = parseT(pos[0]), to = Math.min(END, parseT(pos[1])), step = parseT(pos[2]);
  if (!(step > 0)) die('step must be > 0');
  const times = [];
  for (let i = 0; from + i * step <= to + 1e-6 && i < 600; i++) times.push(Math.min(END, from + i * step));
  const cols = Math.max(1, +opt.cols || 6), cell = Math.max(80, +opt.cell || 320);
  const errs = [];
  const gl = glList()[0];
  const page = await newPage(viewport(), { mobile: !!opt.phone }, errs, 'gl' + gl);
  await openStill(page, times[0], stillParams(gl));
  const labelH = Math.max(18, Math.round(cell * 0.07));
  await page.evaluate((a) => {
    const fw = NS.engine.snapshot({ overlay: false });
    const ch = Math.round(a.cell * fw.height / fw.width);
    const rows = Math.ceil(a.n / a.cols);
    const c = document.createElement('canvas');
    c.width = a.cols * a.cell + (a.cols + 1) * 6; c.height = rows * (ch + a.labelH) + (rows + 1) * 6;
    const g = c.getContext('2d'); g.fillStyle = '#05070d'; g.fillRect(0, 0, c.width, c.height);
    window.__sheet = { c, g, ch };
  }, { n: times.length, cols, cell, labelH });
  for (let i = 0; i < times.length; i++) {
    const t = times[i], c = cueAt(t);
    await page.evaluate(async (a) => {
      await NS.engine.still(a.t, { overlay: a.overlay });
      const snap = NS.engine.snapshot({ overlay: a.overlay });
      const S = window.__sheet, x = 6 + (a.i % a.cols) * (a.cell + 6), y = 6 + Math.floor(a.i / a.cols) * (S.ch + a.labelH + 6);
      S.g.imageSmoothingQuality = 'high';
      S.g.drawImage(snap, x, y, a.cell, S.ch);
      S.g.fillStyle = '#e9e2cf'; S.g.font = Math.round(a.labelH * 0.72) + "px 'Share Tech Mono', monospace"; S.g.textBaseline = 'middle';
      S.g.fillText(a.label, x + 2, y + S.ch + a.labelH / 2);
      S.g.textAlign = 'right'; S.g.fillStyle = '#ff9a3c'; S.g.fillText(a.shot, x + a.cell - 2, y + S.ch + a.labelH / 2); S.g.textAlign = 'left';
    }, { t, i, cols, cell, labelH, overlay: overlayOpt(), label: barLabel(t) + '  ' + clock(t), shot: c.shot });
  }
  const dataUrl = await page.evaluate(() => window.__sheet.c.toDataURL('image/png'));
  const f = outFile('sheet_' + fileTag(from) + '-' + fileTag(to) + (opt.phone ? '_phone' : '') + (gl === '0' ? '_gl0' : '') + '.png');
  fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(f + '   ' + times.length + ' frames, ' + clock(from) + ' .. ' + clock(to) + ' every ' + step + ' s');
  return report(errs);
};

COMMANDS.errors = async () => {
  const [from, to] = range();
  const stepBars = +opt.step || 0.5;
  const errs = [];
  const full = from <= 0 && to >= END - 1e-6;
  // 1) the gate, then Play (muted), a couple of seconds of live playback, pause
  if (full || opt.gate) {
    const page = await newPage({ width: 1280, height: 800 }, {}, errs, '[gate]');
    await page.goto(url({ mute: true, t: from.toFixed(3) }));
    await page.waitForFunction('window.NS_READY === true', null, { timeout: 60000 });
    await page.click('#gate-play');
    await page.waitForTimeout(2500);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('n');
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');
    await page.context().close();
    // 2) ?end (the board, or the engine's fallback card)
    const pe = await newPage({ width: 1280, height: 800 }, {}, errs, '[end]');
    await pe.goto(url({ end: true }));
    await pe.waitForTimeout(2500);
    await pe.context().close();
  }
  // 3) still mode, every half bar, both post paths, purity traps on
  const times = [];
  for (let b = from / BAR; b < to / BAR - 1e-6; b += stepBars) times.push(Math.min(END, b * BAR + 0.013));
  for (const c of CUES) {   // every transition window
    if (!c.trans || c.trans.type === 'cut') continue;
    const d = (c.trans.beats || 0.5) * BEAT;
    [-0.3, 0.3].forEach((k) => { const t = c.t0 + k * d; if (t >= from && t <= to) times.push(t); });
  }
  times.sort((a, b) => a - b);
  for (const gl of ['1', '0']) {
    const page = await newPage({ width: 1280, height: 720 }, {}, errs, '[still gl' + gl + ']');
    await openStill(page, times[0] || from, { gl, dev: '1' });
    const list = gl === '1' ? times : times.filter((t, i) => i % 2 === 0);
    for (const t of list) {
      const before = errs.length;
      await page.evaluate((tt) => NS.engine.still(tt), t);
      for (let i = before; i < errs.length; i++) errs[i] += '   at ' + clock(t) + ' ' + barLabel(t) + ' ' + cueAt(t).shot;
    }
    if (gl === '1') {   // polaroids (the board path)
      await page.evaluate((a) => { for (const t of a) { const c = NS.renderStill(t, { w: 320, h: 180, overlay: true }); NS.freeCanvas(c); } }, times.filter((t, i) => i % 8 === 0));
    }
    await page.context().close();
  }
  // 4) phone portrait (shelf on)
  const pp = await newPage({ width: 390, height: 844 }, { mobile: true }, errs, '[still phone]');
  await openStill(pp, times[0] || from, { gl: '1', dev: '1' });
  for (const t of times.filter((t, i) => i % 4 === 0)) {
    const before = errs.length;
    await pp.evaluate((tt) => NS.engine.still(tt), t);
    for (let i = before; i < errs.length; i++) errs[i] += '   at ' + clock(t) + ' ' + barLabel(t) + ' ' + cueAt(t).shot;
  }
  await pp.context().close();
  console.log('errors: ' + clock(from) + ' .. ' + clock(to) + ', ' + times.length + ' still frames x 2 post paths + phone + polaroids' + (full ? ' + gate/play + ?end' : ''));
  return report(errs);
};

COMMANDS.phone = async () => {
  const errs = [];
  const dir = outDir();
  const page = await newPage({ width: 390, height: 844 }, { mobile: true }, errs, '[phone]');
  await page.goto(url({ mute: true }));
  await page.waitForFunction('window.NS_READY === true', null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const overflow = () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
    const bad = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[hidden]')) return;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5)) {
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) { const s = getComputedStyle(p); if (/hidden|clip/.test(s.overflowX)) { clipped = true; break; } p = p.parentElement; }
        if (!clipped) bad.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '') + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
      }
    });
    return { vw, sw, bad: bad.slice(0, 12) };
  });
  const rows = [];
  const ok = (name, pass, detail) => { rows.push((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); if (!pass) errs.push('phone: ' + name + ' ' + (detail || '')); };
  let o = await overflow();
  ok('gate: no horizontal overflow', o.sw <= o.vw && !o.bad.length, 'scrollWidth ' + o.sw + ' / ' + o.vw + (o.bad.length ? ' offenders: ' + o.bad.join(', ') : ''));
  await page.screenshot({ path: path.join(dir, 'phone_gate.png') });
  await page.screenshot({ path: path.join(dir, 'phone_page.png'), fullPage: true });
  await page.click('#gate-play');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { NS.engine.seek(60.2); NS.engine.pause(); });
  await page.waitForTimeout(400);
  o = await overflow();
  ok('playing: no horizontal overflow', o.sw <= o.vw && !o.bad.length, 'scrollWidth ' + o.sw + ' / ' + o.vw + (o.bad.length ? ' offenders: ' + o.bad.join(', ') : ''));
  const st = await page.evaluate(() => {
    const b = document.getElementById('box').getBoundingClientRect(), f = document.getElementById('frame').getBoundingClientRect(), s = document.getElementById('shelf').getBoundingClientRect();
    const tp = document.getElementById('transport').getBoundingClientRect();
    return { bw: b.width, bh: b.height, bl: b.left, fh: f.height, sh: s.height, tpBottom: tp.bottom, ih: innerHeight };
  });
  ok('stage width <= 390', st.bw <= 390.5 && st.bl >= -0.5, 'box ' + st.bw.toFixed(1) + ' px at x ' + st.bl.toFixed(1));
  ok('frame + shelf <= 330 px tall', st.bh <= 330.5, 'frame ' + st.fh.toFixed(1) + ' + shelf ' + st.sh.toFixed(1) + ' = ' + st.bh.toFixed(1));
  ok('shelf present (0.30 x frame)', Math.abs(st.sh - st.fh * 0.3) < 2, st.sh.toFixed(1) + ' px');
  ok('transport on screen', st.tpBottom <= st.ih + 0.5, 'bottom ' + st.tpBottom.toFixed(0) + ' / ' + st.ih);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(dir, 'phone_playing.png') });
  await page.context().close();
  // landscape phone: the frame must fit the height
  const pl = await newPage({ width: 844, height: 390 }, { mobile: true }, errs, '[phone landscape]');
  await pl.goto(url({ mute: true }));
  await pl.waitForFunction('window.NS_READY === true', null, { timeout: 60000 });
  await pl.click('#gate-play');
  await pl.waitForTimeout(800);
  const l = await pl.evaluate(() => { const b = document.getElementById('box').getBoundingClientRect(); return { w: b.width, h: b.height, sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }; });
  ok('landscape 844 x 390: no overflow', l.sw <= l.vw, 'scrollWidth ' + l.sw);
  ok('landscape: frame fits the height', l.h <= 390, l.w.toFixed(0) + ' x ' + l.h.toFixed(0));
  await pl.screenshot({ path: path.join(dir, 'phone_landscape.png') });
  await pl.context().close();
  rows.forEach((r) => console.log(r));
  console.log('screenshots: ' + ['phone_gate.png', 'phone_page.png', 'phone_playing.png', 'phone_landscape.png'].map((f) => path.join(dir, f)).join('\n             '));
  return report(errs);
};

COMMANDS.fps = async () => {
  const secs = +pos[0] || 10;
  const from = opt.t != null ? parseT(opt.t) : range(0)[0];
  const errs = [];
  const gl = glList()[0];
  const page = await newPage(opt.phone ? { width: 390, height: 844 } : { width: 1280, height: 720 }, { mobile: !!opt.phone }, errs, '[fps]');
  const p = { autoplay: true, mute: true, t: from.toFixed(3), gl };
  if (opt.q) p.q = opt.q;
  if (opt.reduced) p.reduced = true;
  await page.goto(url(p));
  await page.waitForFunction('window.NS_READY === true && NS.engine.playing', null, { timeout: 60000 });
  await page.evaluate(() => NS.engine.record(true));
  await page.waitForTimeout(secs * 1000);
  const rec = await page.evaluate(() => { const r = NS.engine.records(); NS.engine.pause(); return { r, q: NS.engine.q, gl: NS.engine.gl, cues: NS.engine.cues.map((c) => c.shot) }; });
  await page.context().close();
  const R = rec.r.filter((x) => x[1] > 0);
  if (R.length < 3) { console.log('fps: too few frames recorded (' + R.length + ')'); return report(errs.concat(['fps: no frames'])); }
  const dts = []; for (let i = 1; i < R.length; i++) dts.push(R[i][1] - R[i - 1][1]);
  const pct = (a, q) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const span = (R[R.length - 1][1] - R[0][1]) / 1000;
  console.log('fps: ' + secs + ' s from ' + clock(from) + ' (' + barLabel(from) + '), ' + (rec.gl ? 'WebGL2' : '2D') + ' post, q ' + rec.q + (opt.phone ? ', phone' : ''));
  console.log('  frames ' + R.length + ' in ' + span.toFixed(2) + ' s = ' + (R.length / span).toFixed(1) + ' fps');
  console.log('  interval ms  avg ' + avg(dts).toFixed(1) + '  p50 ' + pct(dts, 0.5).toFixed(1) + '  p95 ' + pct(dts, 0.95).toFixed(1) + '  max ' + Math.max(...dts).toFixed(1));
  const col = (i) => R.map((x) => x[i]);
  [['draw (scenes)', 2], ['post', 3], ['overlay', 4]].forEach(([n, i]) => console.log('  ' + n.padEnd(14) + ' avg ' + avg(col(i)).toFixed(2) + '  p95 ' + pct(col(i), 0.95).toFixed(2) + '  max ' + Math.max(...col(i)).toFixed(2) + ' ms'));
  const by = {};
  R.forEach((x) => { const k = rec.cues[x[5]] || '?'; (by[k] || (by[k] = [])).push(x); });
  console.log('  per cue (draw ms avg / max, frames):');
  Object.keys(by).forEach((k) => { const a = by[k].map((x) => x[2]); console.log('    ' + k.padEnd(12) + avg(a).toFixed(2).padStart(7) + ' / ' + Math.max(...a).toFixed(2).padStart(7) + '   ' + a.length); });
  const worst = R.map((x, i) => [i ? x[1] - R[i - 1][1] : 0, x]).sort((a, b) => b[0] - a[0]).slice(0, 5);
  console.log('  worst intervals: ' + worst.map(([d, x]) => d.toFixed(0) + ' ms @ ' + clock(x[0]) + ' ' + rec.cues[x[5]]).join(', '));
  notes.add('headless Chromium renders WebGL with SwiftShader (CPU): frame times are pessimistic; compare draw ms between runs');
  return report(errs);
};

COMMANDS.board = async () => {
  const errs = [];
  const dir = outDir();
  const shots = [];
  for (const [vp, name, mobile] of [[{ width: 1280, height: 800 }, 'board_desktop.png', false], [{ width: 390, height: 844 }, 'board_phone.png', true]]) {
    const page = await newPage(vp, { mobile }, errs, '[board ' + vp.width + ']');
    await page.goto(url({ end: true }));
    await page.waitForTimeout(3500);
    const st = await page.evaluate(() => ({ board: !!(window.NS && NS.board), open: !!(window.NS && NS.board && NS.board.isOpen), fallback: !document.getElementById('endcard').hidden }));
    if (!st.board) notes.add('end.js has no NS.board yet: the engine shows its fallback end card');
    const f = path.join(dir, name);
    await page.screenshot({ path: f, fullPage: true });
    shots.push(f + '   board ' + (st.open ? 'open' : st.fallback ? 'fallback card' : 'not shown'));
    await page.context().close();
  }
  shots.forEach((s) => console.log(s));
  return report(errs);
};

COMMANDS.flashscan = async () => {
  const [from, to] = range();
  const fps = +opt.fps || 30;
  const errs = [];
  const page = await newPage({ width: 640, height: 360 }, {}, errs, '[flashscan]');
  await openStill(page, from, Object.assign({ gl: '0' }, opt.reduced ? { reduced: true } : {}));
  const N = Math.max(1, Math.floor((to - from) * fps + 1e-6) + 1);
  const L = new Float32Array(N * 64), Rd = new Uint8Array(N * 64);
  const CH = 90;
  for (let s = 0; s < N; s += CH) {
    const ts = []; for (let i = s; i < Math.min(N, s + CH); i++) ts.push(from + i / fps);
    const res = await page.evaluate((a) => {
      const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
      const out = [];
      for (const t of a.ts) {
        const c = NS.renderStill(t, { w: 160, h: 90, overlay: true, trans: true });
        const d = c.getContext('2d').getImageData(0, 0, 160, 90).data;
        NS.freeCanvas(c);
        const lum = new Array(64).fill(0), r = new Array(64).fill(0), g = new Array(64).fill(0), b = new Array(64).fill(0);
        for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
          const p = (y * 160 + x) * 4, cell = Math.min(7, Math.floor(y / 11.25)) * 8 + Math.floor(x / 20);
          const R = lin[d[p]], G = lin[d[p + 1]], B = lin[d[p + 2]];
          lum[cell] += 0.2126 * R + 0.7152 * G + 0.0722 * B; r[cell] += R; g[cell] += G; b[cell] += B;
        }
        const n = 20 * 11.25;
        out.push({ l: lum.map((v) => v / n), red: r.map((v, i) => (v / Math.max(1e-6, v + g[i] + b[i]) >= 0.8 && v / n > 0.05 ? 1 : 0)) });
      }
      return out;
    }, { ts });
    res.forEach((f, j) => { for (let c = 0; c < 64; c++) { L[(s + j) * 64 + c] = f.l[c]; Rd[(s + j) * 64 + c] = f.red[c]; } });
    process.stdout.write('\rflashscan: ' + Math.min(N, s + CH) + ' / ' + N + ' frames');
  }
  process.stdout.write('\n');
  await page.context().close();
  // transitions per cell: a change >= 0.10 from the last extreme, opposite to the previous one, darker state < 0.80
  const genAt = new Int32Array(N), redAt = new Int32Array(N);
  for (let c = 0; c < 64; c++) {
    let lo = L[c], hi = L[c], loR = Rd[c], hiR = Rd[c], last = 0;
    for (let f = 1; f < N; f++) {
      const v = L[f * 64 + c], rv = Rd[f * 64 + c];
      if (last !== 1 && v - lo >= 0.1 && lo < 0.8) { genAt[f]++; if (rv || loR) redAt[f]++; last = 1; lo = hi = v; loR = hiR = rv; continue; }
      if (last !== -1 && hi - v >= 0.1 && v < 0.8) { genAt[f]++; if (rv || hiR) redAt[f]++; last = -1; lo = hi = v; loR = hiR = rv; continue; }
      if (v < lo) { lo = v; loR = rv; }
      if (v > hi) { hi = v; hiR = rv; }
    }
  }
  // a frame (with its neighbour) where >= 7 cells transition is one general (or red) transition; 2 transitions = 1 flash
  const events = (arr) => {
    const ev = [];
    for (let f = 1; f < N; f++) if (arr[f] > 0 && arr[f] + (ev[ev.length - 1] === f - 1 ? 0 : arr[f - 1]) >= 7 && ev[ev.length - 1] !== f - 1) ev.push(f);
    return ev;
  };
  const gEv = events(genAt), rEv = events(redAt);
  const limit = opt.reduced ? 1 : 3;
  const windows = (ev) => { let worst = 0, at = 0; const bad = []; for (let i = 0; i < ev.length; i++) { let j = i; while (j + 1 < ev.length && ev[j + 1] - ev[i] < fps) j++; const flashes = (j - i + 1) / 2; if (flashes > worst) { worst = flashes; at = ev[i]; } if (flashes > limit) bad.push([ev[i], flashes]); } return { worst, at, bad }; };
  const g = windows(gEv), r = windows(rEv);
  const tf = (f) => from + f / fps;
  console.log('flashscan ' + clock(from) + ' .. ' + clock(to) + ' @ ' + fps + ' fps (' + N + ' frames)' + (opt.reduced ? ', Reduce flashing' : '') + ', limit ' + limit + ' flashes in any 1 s');
  console.log('  general transitions ' + gEv.length + ', worst 1 s window ' + g.worst + ' flashes' + (g.worst ? ' at ' + clock(tf(g.at)) + ' ' + barLabel(tf(g.at)) + ' ' + cueAt(tf(g.at)).shot : ''));
  console.log('  red transitions     ' + rEv.length + ', worst 1 s window ' + r.worst + ' flashes' + (r.worst ? ' at ' + clock(tf(r.at)) + ' ' + barLabel(tf(r.at)) + ' ' + cueAt(tf(r.at)).shot : ''));
  const errs2 = errs.slice();
  [[g.bad, ''], [r.bad, ' red']].forEach(([bad, kind]) => {   // merge overlapping failing windows into ranges
    let cur = null;
    const flush = () => { if (!cur) return; const a = tf(cur.f0), b = tf(cur.f1) + 1; const shots = Array.from(new Set([cueAt(a).shot, cueAt(Math.min(END, b)).shot])).join('/'); errs2.push('flash: up to ' + cur.n + kind + ' flashes in 1 s between ' + clock(a) + ' ' + barLabel(a) + ' and ' + clock(Math.min(END, b)) + ' ' + barLabel(Math.min(END, b)) + ' (' + shots + ')'); cur = null; };
    bad.forEach(([f, n]) => { if (cur && f - cur.f1 <= fps) { cur.f1 = f; cur.n = Math.max(cur.n, n); } else { flush(); cur = { f0: f, f1: f, n }; } });
    flush();
  });
  const ev = gEv.slice(0, 400).map((f) => barLabel(tf(f))).join(' ');
  if (opt.verbose && ev) console.log('  general transitions at: ' + ev);
  return report(errs2);
};

COMMANDS.purity = async () => {
  const [from, to] = range();
  const errs = [];
  const page = await newPage({ width: 640, height: 360 }, {}, errs, '[purity]');
  await openStill(page, from, { gl: '0', dev: '1' });
  const times = [];
  CUES.forEach((c) => {
    if (c.t1 <= from || c.t0 >= to) return;
    const t1 = Math.min(c.t1, END);
    [c.t0 + 0.3, (c.t0 + t1) / 2, t1 - 0.3].forEach((t) => times.push([c.shot, Math.max(0, Math.min(END, t))]));
  });
  const res = await page.evaluate((a) => {
    const hash = (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 2166136261 >>> 0; for (let i = 0; i < d.length; i += 4) { h ^= d[i] | (d[i + 1] << 8) | (d[i + 2] << 16); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
    const one = (t, ov) => { const c = NS.renderStill(t, { w: 320, h: 180, overlay: ov }); const h = hash(c); NS.freeCanvas(c); return h; };
    const A = a.map(([s, t]) => [one(t, false), one(t, true)]);
    const B = new Array(a.length);
    for (let i = a.length - 1; i >= 0; i--) {
      const other = (a[i][1] * 7.31 + 53.7) % 179.2;
      NS.renderStill(other, { w: 320, h: 180, overlay: true });
      NS.renderStill(Math.max(0, a[i][1] - 0.7), { w: 160, h: 90, overlay: false });
      B[i] = [one(a[i][1], false), one(a[i][1], true)];
    }
    return { A, B, errors: NS.engine.errors.slice() };
  }, times);
  const bad = [];
  times.forEach(([shot, t], i) => {
    if (res.A[i][0] !== res.B[i][0]) bad.push('impure scene: ' + shot + ' renders differently at ' + clock(t) + ' ' + barLabel(t) + ' the second time');
    else if (res.A[i][1] !== res.B[i][1]) bad.push('impure overlay: different text layer at ' + clock(t) + ' ' + barLabel(t) + ' (' + shot + ')');
  });
  console.log('purity: ' + times.length + ' frames over ' + new Set(times.map((x) => x[0])).size + ' cues, each rendered twice (scene-only and with overlay), ?dev traps on');
  return report(errs.concat(bad));
};

COMMANDS.clues = async () => {
  const errs = [];
  const page = await newPage({ width: 390, height: 844 }, { mobile: true }, errs, '[clues]');
  await openStill(page, SCORE.clues[0] ? SCORE.clues[0].bar * BAR : 0, { gl: '1' });
  const list = SCORE.clues.map((c) => ({ id: c.id, title: c.title, bar: c.bar, hold: c.hold, shot: c.shot, witching: !!c.witching, t: c.bar * BAR }));
  const dataUrl = await page.evaluate(async (list) => {
    const cols = 2, cellW = 390 + 16 + 300, pad = 14, labelH = 46;
    const frames = [];
    for (const c of list) {
      const saveW = NS.witching;
      if (c.witching) NS.witching = true;
      await NS.engine.still(c.t, { overlay: true });
      const snap = NS.engine.snapshot({ overlay: true });
      const f = document.createElement('canvas'); f.width = snap.width; f.height = snap.height; f.getContext('2d').drawImage(snap, 0, 0);
      NS.witching = saveW;
      const reg = NS.clues[c.id];
      let rect = reg && reg.rect, rectOk = false;
      if (typeof rect === 'function') { const lay = NS.engine.layoutAt(c.t); const cr = lay.clueRects.find((x) => x.id === c.id); rect = cr && cr.rect; }
      rectOk = Array.isArray(rect) && rect.length >= 4;
      const pol = NS.renderStill(c.t, { rect: rectOk ? rect : undefined, w: 300, overlay: false, witching: c.witching || undefined });
      frames.push({ c, f, pol, rect: rectOk ? rect : null, reg: !!reg });
    }
    const rowH = Math.max(...frames.map((x) => Math.max(x.f.height * 390 / x.f.width, x.pol.height))) + labelH;
    const rows = Math.ceil(frames.length / cols);
    const S = document.createElement('canvas'); S.width = cols * cellW + (cols + 1) * pad; S.height = rows * rowH + (rows + 1) * pad + 40;
    const g = S.getContext('2d'); g.fillStyle = '#05070d'; g.fillRect(0, 0, S.width, S.height);
    g.fillStyle = '#e9e2cf'; g.font = "20px 'Share Tech Mono', monospace"; g.textBaseline = 'middle';
    g.fillText('CLUES · 390 px phone frame with overlay (rect outlined) · board polaroid crop', pad, 22);
    frames.forEach((x, i) => {
      const cx = pad + (i % cols) * (cellW + pad), cy = 40 + pad + Math.floor(i / cols) * (rowH + pad);
      const fh = x.f.height * 390 / x.f.width;
      g.drawImage(x.f, cx, cy, 390, fh);
      if (x.rect) { const s = 390 / 1280; g.strokeStyle = '#ff9a3c'; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(cx + x.rect[0] * s, cy + x.rect[1] * s, x.rect[2] * s, x.rect[3] * s); g.setLineDash([]); }
      g.drawImage(x.pol, cx + 390 + 16, cy);
      g.fillStyle = '#ff9a3c'; g.font = "18px 'Share Tech Mono', monospace";
      g.fillText(x.c.id.toUpperCase() + (x.c.witching ? ' (witching)' : '') + ' · ' + x.c.title, cx, cy + rowH - labelH + 14);
      g.fillStyle = x.rect ? '#8e93a6' : '#ff3344'; g.font = "14px 'Share Tech Mono', monospace";
      g.fillText('bar ' + x.c.bar + ' · hold ' + x.c.hold.join('–') + ' · ' + x.c.shot + ' · ' + (x.rect ? 'rect [' + x.rect.map((v) => Math.round(v)).join(', ') + ']' : (x.reg ? 'rect invalid' : 'rect NOT REGISTERED')), cx, cy + rowH - labelH + 34);
      NS.freeCanvas(x.pol);
    });
    return S.toDataURL('image/png');
  }, list);
  const f = outFile('clues.png');
  fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(f + '   ' + list.length + ' clues');
  return report(errs);
};

COMMANDS.fonts = async () => {
  const errs = [];
  const page = await newPage({ width: 1280, height: 800 }, {}, errs, '[fonts]');
  await page.goto(url({}));
  await page.waitForFunction('window.NS_READY === true', null, { timeout: 60000 });
  const res = await page.evaluate(() => {
    const fams = ['Metal Mania', 'Anton', 'Bangers', 'Permanent Marker', 'Share Tech Mono', 'Special Elite'];
    const c = document.createElement('canvas').getContext('2d');
    const s = 'Hamburgefonstiv 0123 NO SURVIVORS';
    return fams.map((f) => {
      c.font = "40px '" + f + "', monospace"; const a = c.measureText(s).width;
      c.font = "40px '" + f + "', serif"; const b = c.measureText(s).width;
      const faces = []; document.fonts.forEach((ff) => { if (ff.family.replace(/["']/g, '') === f) faces.push(ff.status); });
      return { f, check: document.fonts.check("40px '" + f + "'"), real: Math.abs(a - b) < 0.5, status: faces.join(',') || 'no @font-face', width: Math.round(a) };
    });
  });
  res.forEach((r) => {
    const ok = r.check && r.real;
    console.log((ok ? 'PASS ' : 'FAIL ') + r.f.padEnd(18) + ' check ' + r.check + '  rendered ' + r.real + '  faces ' + r.status + '  width ' + r.width);
    if (!ok) errs.push('font not loaded: ' + r.f);
  });
  await page.context().close();
  return report(errs);
};

COMMANDS.data = async () => {
  const errs = [];
  const page = await newPage({ width: 640, height: 360 }, {}, errs, '[data]');
  await openStill(page, 0, { gl: '0' });
  const res = await page.evaluate(() => {
    const SC = window.SCORE, BAR = 1.6, BEAT = 0.4;
    const tb = (bar, beat) => bar * BAR + (beat || 0) * BEAT;
    const lab = (t) => { const b = Math.floor(t / BAR + 1e-6); const bt = (t - b * BAR) / BEAT; return 'b' + b + ':' + (Math.abs(bt - Math.round(bt)) < 1e-3 ? Math.round(bt) : bt.toFixed(2)); };
    const E = [], Wn = [], I = [];
    const words = (s) => String(s).trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
    const reads = [];
    (SC.captions || []).forEach((c, i) => { const t0 = tb(c.bar, c.beat); reads.push({ kind: 'caption', who: c.who, text: c.text, t0, t1: t0 + c.beats * BEAT, ref: c }); });
    (SC.cards || []).forEach((c) => { const t0 = tb(c.bar, c.beat); reads.push({ kind: 'card', type: c.type, text: c.name || c.text || c.n || c.band || (c.lines && c.lines[0]) || c.type, t0, t1: t0 + (c.beats || 4) * BEAT, ref: c }); });
    reads.sort((a, b) => a.t0 - b.t0);
    const nm = (r) => r.kind === 'caption' ? 'caption ' + r.who + ' "' + r.text + '"' : 'card ' + r.type + ' "' + r.text + '"';
    // R1: one read at a time
    for (let i = 0; i < reads.length; i++) for (let j = i + 1; j < reads.length; j++) {
      const a = reads[i], b = reads[j];
      if (b.t0 >= a.t1) break;
      const ov = Math.min(a.t1, b.t1) - b.t0;
      if (ov > 0.25 * BEAT + 1e-6) E.push([b.t0, 'one read: ' + nm(b) + ' starts ' + (ov / BEAT).toFixed(2) + ' beats before ' + nm(a) + ' (' + lab(a.t0) + ') ends']);
    }
    // lyric spans
    const lines = ((SC.vocals && SC.vocals.lines) || []).map((l) => {
      const ws = l.words || [];
      const first = ws.length ? ws[0][1] : 0, lastW = ws.length ? ws[ws.length - 1][1] : 0;
      let endStep = lastW + 4;
      if (Array.isArray(l.notes) && l.notes.length) endStep = Math.max(...l.notes.map((n) => n[1] + n[2]));
      return { l, t0: tb(l.bar) + first * 0.1, tLast: tb(l.bar) + lastW * 0.1, t1: tb(l.bar) + endStep * 0.1, card: l.display === 'card' };
    });
    lines.forEach((L) => {
      if (L.card) {
        const ok = (SC.cards || []).some((c) => c.type === 'intro' && c.bar === L.l.bar);
        if (!ok) Wn.push([L.t0, 'line ' + L.l.id + ' has display "card" but no intro card at bar ' + L.l.bar]);
        return;
      }
      reads.forEach((r) => {
        if (Math.min(r.t1, L.t1) - Math.max(r.t0, L.t0) <= 0.25 * BEAT + 1e-6) return;
        if (r.kind === 'caption' && r.t0 < L.tLast - 0.25 * BEAT - 1e-6) E.push([r.t0, 'lyric + caption: ' + nm(r) + ' starts before the last word of lyric ' + L.l.id + ' "' + L.l.text + '" (' + lab(L.tLast) + ')']);
        if (r.kind === 'card' && !/^(warning|chapter)$/.test(r.type) && !(r.type === 'intro')) E.push([r.t0, 'lyric + card: ' + nm(r) + ' overlaps lyric ' + L.l.id + ' "' + L.l.text + '"']);
      });
    });
    // R2: caption budgets and length; no Lou captions
    reads.filter((r) => r.kind === 'caption').forEach((r) => {
      const n = words(r.text), need = Math.max(3, n / 1.25);
      if (r.ref.beats + 1e-6 < need) (/(—|-|\.\.\.|…)$/.test(String(r.text).trim()) ? Wn : E).push([r.t0, 'budget: ' + nm(r) + ' has ' + r.ref.beats + ' beats, needs ' + need.toFixed(2) + (/(—|-|\.\.\.|…)$/.test(String(r.text).trim()) ? ' (a cut-off line: warning only)' : '')]);
      if (n > 7) E.push([r.t0, 'length: ' + nm(r) + ' has ' + n + ' words (max 7)']);
      if (String(r.who).toUpperCase() === 'LOU') E.push([r.t0, 'Lou speaks only on the radio (vocals.spoken), never in captions: ' + nm(r)]);
      if (!NS.WHO[String(r.who).toUpperCase()]) Wn.push([r.t0, 'unknown speaker ' + r.who + ' in ' + nm(r)]);
    });
    // chapter and warning cards
    reads.filter((r) => r.kind === 'card').forEach((r) => {
      const c = r.ref;
      if (c.type === 'chapter') {
        if (c.beats !== 4) E.push([r.t0, 'chapter slate must hold 4 beats: ' + nm(r)]);
        if (!/^(ACT ONE|INTERMISSION|ACT TWO|ENCORE)$/.test(c.n)) E.push([r.t0, 'chapter title "' + c.n + '" not in ACT ONE / INTERMISSION / ACT TWO / ENCORE']);
      }
      if (c.type === 'warning' && (c.text !== 'SOLD OUT' || c.bar !== 32 || (c.beat || 0) !== 0)) Wn.push([r.t0, 'warning card should be the SOLD OUT stamp on the bar-32 downbeat']);
    });
    // R3: clue holds: fixed-layout cards over registered rects, lyric bands, captions
    const inter = (a, b) => { const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])), y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])); return x * y; };
    const ZONES = { title: [240, 180, 800, 360], chapter: [40, 30, 480, 140], warning: [340, 200, 600, 320], special: [0, 520, 1280, 200], end: [240, 220, 800, 280] };
    const BANDS = [[0, 40, 1280, 160], [0, 260, 1280, 200], [0, 520, 1280, 170]];
    (SC.clues || []).forEach((c) => {
      const h0 = tb(c.hold[0]), h1 = tb(c.hold[1]);
      const reg = NS.clues[c.id];
      let rect = reg && reg.rect;
      if (typeof rect === 'function') { const lay = NS.engine.layoutAt((h0 + h1) / 2); const cr = lay.clueRects.find((x) => x.id === c.id); rect = cr && cr.rect; }
      if (!Array.isArray(rect)) Wn.push([h0, 'clue ' + c.id + ': rect not registered yet (scene ' + c.shot + ')']);
      if (!(c.bar * BAR >= h0 - 1e-6 && c.bar * BAR < h1)) E.push([h0, 'clue ' + c.id + ': its polaroid bar ' + c.bar + ' is outside its hold ' + c.hold.join('-')]);
      reads.forEach((r) => {
        if (r.t1 <= h0 || r.t0 >= h1) return;
        if (r.kind === 'card') {
          const z = r.type === 'intro' ? (r.ref.side === 'left' ? [0, 0, 640, 720] : [640, 0, 640, 720]) : ZONES[r.type];
          if (Array.isArray(rect) && z && inter(z, rect) > 0.1 * rect[2] * rect[3]) E.push([Math.max(r.t0, h0), 'clue ' + c.id + ' hold: ' + nm(r) + ' covers the clue rect']);
          else I.push([Math.max(r.t0, h0), 'clue ' + c.id + ' hold: ' + nm(r) + ' on screen (clear of the rect)']);
        } else Wn.push([Math.max(r.t0, h0), 'clue ' + c.id + ' hold: ' + nm(r) + ' on screen; the overlay must place it clear of the rect (phone: shelf)']);
      });
      lines.forEach((L) => {
        if (L.card || L.t1 <= h0 || L.t0 >= h1) return;
        if (Array.isArray(rect) && BANDS.every((b) => inter(b, rect) > 0.1 * rect[2] * rect[3])) E.push([Math.max(L.t0, h0), 'clue ' + c.id + ' hold: lyric ' + L.l.id + ' has no free lyric band (the rect touches top, centre and bottom)']);
        else I.push([Math.max(L.t0, h0), 'clue ' + c.id + ' hold: lyric ' + L.l.id + ' "' + L.l.text + '" on screen']);
      });
    });
    const fmt = (a) => a.sort((x, y) => x[0] - y[0]).map(([t, m]) => lab(t).padEnd(9) + m);
    return { errors: fmt(E), warnings: fmt(Wn), info: fmt(I), counts: { captions: (SC.captions || []).length, cards: (SC.cards || []).length, lines: lines.length, clues: (SC.clues || []).length, registered: Object.keys(NS.clues).length } };
  });
  await page.context().close();
  const c = res.counts;
  console.log('data: ' + c.captions + ' captions, ' + c.cards + ' cards, ' + c.lines + ' lyric lines, ' + c.clues + ' clues (' + c.registered + ' rects registered)');
  res.errors.forEach((m) => console.log('ERROR ' + m));
  res.warnings.forEach((m) => console.log('WARN  ' + m));
  if (opt.verbose) res.info.forEach((m) => console.log('info  ' + m));
  console.log('data: ' + res.errors.length + ' errors, ' + res.warnings.length + ' warnings' + (opt.verbose ? '' : ', ' + res.info.length + ' info lines (--verbose)'));
  return report(errs.concat(res.errors.map((m) => 'data: ' + m)), true);
};

COMMANDS.mem = async () => {
  const [from, to] = range();
  const errs = [];
  const page = await newPage({ width: 1280, height: 720 }, {}, errs, '[mem]');
  await openStill(page, from, { gl: '1' });
  const rows = await page.evaluate(async (a) => {
    const out = [];
    for (let b = Math.floor(a.from / 1.6); b * 1.6 < a.to - 1e-6; b++) {
      for (const off of [0.05, 0.85]) {
        const t = Math.min(179.19, b * 1.6 + off);
        const tm = await NS.engine.still(t);
        const m = NS.mem();
        out.push({ t, cue: tm.cue, draw: tm.draw, total: tm.total, mem: m.total, byTag: m.byTag });
      }
    }
    return out;
  }, { from, to });
  await page.context().close();
  const MB = (b) => (b / 1048576).toFixed(1) + ' MB';
  let peak = rows[0], tagPeak = {};
  rows.forEach((r) => { if (r.mem > peak.mem) peak = r; Object.keys(r.byTag).forEach((k) => { if (!tagPeak[k] || r.byTag[k] > tagPeak[k][0]) tagPeak[k] = [r.byTag[k], r.t]; }); });
  console.log('mem: ' + rows.length + ' frames ' + clock(from) + ' .. ' + clock(to) + ' with the live warm/release policy');
  console.log('  peak total ' + MB(peak.mem) + ' at ' + clock(peak.t) + ' ' + barLabel(peak.t) + ' (' + peak.cue + ')  budget 120 MB');
  Object.keys(tagPeak).sort((x, y) => tagPeak[y][0] - tagPeak[x][0]).forEach((k) => console.log('    ' + k.padEnd(14) + MB(tagPeak[k][0]).padStart(9) + '  at ' + barLabel(tagPeak[k][1])));
  const by = {};
  rows.forEach((r) => { const k = r.cue || '?'; if (!by[k] || r.draw > by[k].draw) by[k] = r; });
  console.log('  worst frame per cue (draw ms, incl. first-use cache builds):');
  Object.keys(by).forEach((k) => console.log('    ' + k.padEnd(12) + by[k].draw.toFixed(1).padStart(8) + ' ms  at ' + barLabel(by[k].t)));
  if (peak.mem > 120 * 1048576) errs.push('mem: total ' + MB(peak.mem) + ' over the 120 MB budget');
  if (tagPeak.horde && tagPeak.horde[0] > 40 * 1048576) errs.push('mem: horde ' + MB(tagPeak.horde[0]) + ' over the 40 MB budget');
  return report(errs);
};

COMMANDS.help = async () => {
  const src = fs.readFileSync(__filename, 'utf8').split('\n');
  const end = src.findIndex((l) => l.startsWith("'use strict'"));
  console.log(src.slice(1, end).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  return 0;
};

function report(errs, quietOk) {
  const counts = new Map();
  errs.forEach((e) => counts.set(e, (counts.get(e) || 0) + 1));
  if (notes.size) notes.forEach((n) => console.log('note: ' + n));
  if (!counts.size) { if (!quietOk) console.log('OK: no errors'); return 0; }
  console.log('FAIL: ' + errs.length + ' problem(s)' + (counts.size < errs.length ? ' (' + counts.size + ' distinct)' : ''));
  Array.from(counts.entries()).slice(0, 80).forEach(([e, n]) => console.log('  ' + (n > 1 ? n + 'x ' : '') + e));
  return 1;
}

(async () => {
  const fn = COMMANDS[cmd];
  if (!fn) { console.error('unknown command ' + cmd + '; try: node no-survivors/check.cjs help'); process.exit(2); }
  let code = 0;
  try {
    if (cmd !== 'help') await launch();
    code = await fn();
  } catch (e) {
    console.error('check.cjs ' + cmd + ' crashed: ' + (e && e.stack || e));
    code = 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  process.exit(code);
})();
