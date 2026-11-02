#!/usr/bin/env node
// Render a time-code driven demo (one that exposes window.__capture, like magnum-opus)
// to stills, a contact sheet or an MP4, frame by frame and deterministically.
//
//   node tools/render-video.cjs <slug> --stills 0.5,7.2,21.3 [--out dir]
//   node tools/render-video.cjs <slug> --sheet [--from 0 --to 30 --step 0.5 --cols 6] [--out sheet.jpg]
//   node tools/render-video.cjs <slug> --video out.mp4 [--fps 30 --from 0 --to 30 --audio track.wav --crf 18 --jobs 2]
//
// Common options: --w 1920 --h 1080 (render size; sheets default to 480x270 cells),
//   --reduced (reduced-flashing version), --grain <amount>, --no-overlay (scenes only).
// The page is opened as file://.../<slug>/index.html?capture&w=..&h=.. and must set
// window.__captureReady (or window.__captureError) and expose __capture.frame(t),
// __capture.rgba() and __capture.png().
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const slug = argv[0];
if (!slug || slug.startsWith('--')) {
  console.error('usage: node tools/render-video.cjs <slug> (--stills t,t,... | --sheet | --video out.mp4) [options]');
  process.exit(1);
}
const has = (k) => argv.includes(k);
const opt = (k, d) => { const i = argv.indexOf(k); return i > -1 && i + 1 < argv.length ? argv[i + 1] : d; };
const root = path.resolve(__dirname, '..');
const pageFile = path.join(root, slug, 'index.html');

const mode = has('--video') ? 'video' : has('--sheet') ? 'sheet' : has('--stills') ? 'stills' : null;
if (!mode) { console.error('pick one of --stills, --sheet, --video'); process.exit(1); }

const W = +opt('--w', mode === 'sheet' ? 480 : 1920);
const H = +opt('--h', Math.round(W * 9 / 16));
const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] };

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: Math.max(W, 320), height: Math.max(H, 200) } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver Message|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push(`console.${m.type()}: ${m.text()}`); });
  let q = `capture&w=${W}&h=${H}`;
  if (has('--reduced')) q += '&reduced';
  if (has('--no-overlay')) q += '&nooverlay';
  if (opt('--grain') !== undefined) q += `&grain=${opt('--grain')}`;
  await page.goto('file://' + pageFile + '?' + q);
  await page.waitForFunction(() => window.__captureReady || window.__captureError, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__captureError);
  if (err) { console.error(err); console.error(errors.join('\n')); process.exit(2); }
  return { page, errors };
}

function stats(ms) {
  if (!ms.length) return '';
  const s = [...ms].sort((a, b) => a - b);
  return `frame ms: median ${s[s.length >> 1].toFixed(0)}, max ${s[s.length - 1].toFixed(0)}`;
}

(async () => {
  const t0 = Date.now();
  if (mode === 'stills' || mode === 'sheet') {
    const browser = await chromium.launch(LAUNCH);
    const { page, errors } = await openPage(browser);
    let times;
    if (mode === 'stills') times = opt('--stills').split(',').map(Number);
    else {
      const from = +opt('--from', 0), to = +opt('--to', 30), step = +opt('--step', 0.5);
      times = []; for (let t = from; t < to - 1e-9; t += step) times.push(+t.toFixed(4));
    }
    const out = opt('--out', mode === 'stills' ? path.join(os.tmpdir(), 'stills') : path.join(os.tmpdir(), 'sheet.jpg'));
    const dir = mode === 'stills' ? out : fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));
    fs.mkdirSync(dir, { recursive: true });
    const ms = [], ids = [];
    for (let i = 0; i < times.length; i++) {
      const r = await page.evaluate((t) => window.__capture.frame(t), times[i]);
      ms.push(r.ms); ids.push(r.id);
      const url = await page.evaluate(() => window.__capture.png());
      const name = mode === 'stills' ? `t${times[i].toFixed(2)}.png` : `${String(i).padStart(4, '0')}.png`;
      fs.writeFileSync(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
    }
    if (mode === 'sheet') {
      const cols = +opt('--cols', 6), rows = Math.ceil(times.length / cols);
      const from = +opt('--from', 0), step = +opt('--step', 0.5);
      const T = `(${from}+n*${step})`;
      const label = `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf:fontsize=${Math.max(12, Math.round(H / 14))}:fontcolor=yellow:box=1:boxcolor=black@0.6:x=6:y=6:text='%{eif\\:floor(${T}+0.0001)\\:d}.%{eif\\:mod(floor(${T}*100+0.5)\\,100)\\:d\\:2}s'`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(dir, '%04d.png'), '-vf', `${label},tile=${cols}x${rows}:padding=4:color=0x202020`, '-frames:v', '1', '-q:v', '3', out]);
      fs.rmSync(dir, { recursive: true, force: true });
    }
    console.log(`wrote ${out} (${times.length} frames at ${W}x${H}; scenes ${[...new Set(ids)].join(', ')}; ${stats(ms)}; ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (errors.length) console.log('page errors/warnings:\n' + [...new Set(errors)].join('\n'));
    await browser.close();
    return;
  }

  // ---- video
  const out = path.resolve(opt('--video'));
  const fps = +opt('--fps', 30), from = +opt('--from', 0), to = +opt('--to', 30);
  const jobs = Math.max(1, +opt('--jobs', 1));
  const n = Math.round((to - from) * fps);
  const audio = opt('--audio');
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-'];
  if (audio) ffArgs.push('-ss', String(from), '-t', String(to - from), '-i', audio);
  ffArgs.push('-vf', 'vflip', '-c:v', 'libx264', '-preset', opt('--preset', 'slow'), '-crf', opt('--crf', '18'), '-pix_fmt', 'yuv420p', '-tune', opt('--tune', 'film'));
  if (opt('--maxrate')) ffArgs.push('-maxrate', opt('--maxrate'), '-bufsize', opt('--bufsize', opt('--maxrate')));
  if (audio) ffArgs.push('-c:a', 'aac', '-b:a', opt('--abr', '192k'), '-shortest');
  ffArgs.push('-movflags', '+faststart', out);
  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const write = (buf) => new Promise((res) => { if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res); });

  const workers = [];
  for (let j = 0; j < jobs; j++) { const b = await chromium.launch(LAUNCH); workers.push({ b, ...(await openPage(b)) }); }
  const done = new Map(); let next = 0; const ms = [];
  let flushing = Promise.resolve();
  const flush = () => { flushing = flushing.then(async () => { while (done.has(next)) { const buf = done.get(next); done.delete(next); await write(buf); next++; } }); return flushing; };
  await Promise.all(workers.map(async (w, j) => {
    for (let i = j; i < n; i += jobs) {
      while (i - next > jobs * 4) await new Promise((r) => setTimeout(r, 20));
      const t = from + i / fps;
      const r = await w.page.evaluate((tt) => window.__capture.frame(tt), t);
      ms.push(r.ms);
      const b64 = await w.page.evaluate(() => window.__capture.rgba());
      done.set(i, Buffer.from(b64, 'base64'));
      await flush();
      if (i % 30 === 0) process.stdout.write(`\rframe ${i}/${n}  t=${t.toFixed(2)}  ${r.id}  ${r.ms.toFixed(0)}ms   `);
    }
  }));
  await flush();
  ff.stdin.end();
  await new Promise((res) => ff.on('close', res));
  const errs = [...new Set(workers.flatMap((w) => w.errors))];
  for (const w of workers) await w.b.close();
  const size = fs.statSync(out).size;
  console.log(`\nwrote ${out}: ${n} frames ${W}x${H}@${fps}, ${(size / 1e6).toFixed(2)} MB; ${stats(ms)}; ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (errs.length) console.log('page errors/warnings:\n' + errs.join('\n'));
})();
