#!/usr/bin/env node
// Render a time-code driven demo (one that exposes window.__capture, like magnum-opus)
// to stills, a contact sheet or an MP4, frame by frame and deterministically.
//
//   node tools/render-video.cjs <slug> --stills 0.5,7.2,21.3 [--out dir]
//   node tools/render-video.cjs <slug> --sheet [--from 0 --to <dur> --step 0.5 --cols 6] [--out sheet.jpg]
//   node tools/render-video.cjs <slug> --video out.mp4 [--fps 30 --from 0 --to <dur> --audio track.wav --crf 18 --jobs 2]
//
// <slug> is a folder of this repo, or a path to any folder with an index.html (a sandbox copy).
// --to defaults to the page's own length (MO.DUR, else window.SCORE.duration, else 30).
// Common options: --w 1920 --h 1080 (render size; sheets default to 480x270 cells),
//   --reduced (reduced-flashing version), --grain <amount>, --no-overlay (scenes only).
// Video options: --preset slow --tune film --crf 18 --maxrate/--bufsize, --abr 192k (with --audio),
//   --chunk <seconds>: encode separately written segments, then join them losslessly (stream copy),
//     so a crash loses one segment at most; segments go to <out>.parts/ (or --parts DIR)
//   --resume: with --chunk, keep the segments that are already complete and render the rest
//   --keep-parts: keep the segment files after the join
// Progress: a line at least every 100 frames with the median frame time of the last 100 and the ETA.
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
  console.error('usage: node tools/render-video.cjs <slug|folder> (--stills t,t,... | --sheet | --video out.mp4) [options]');
  process.exit(1);
}
const has = (k) => argv.includes(k);
const opt = (k, d) => { const i = argv.indexOf(k); return i > -1 && i + 1 < argv.length ? argv[i + 1] : d; };
const root = path.resolve(__dirname, '..');
const pageFile = fs.existsSync(path.join(root, slug, 'index.html')) ? path.join(root, slug, 'index.html') : path.join(path.resolve(slug), 'index.html');
if (!fs.existsSync(pageFile)) { console.error(`no page at ${pageFile}`); process.exit(1); }

const mode = has('--video') ? 'video' : has('--sheet') ? 'sheet' : has('--stills') ? 'stills' : null;
if (!mode) { console.error('pick one of --stills, --sheet, --video'); process.exit(1); }

const W = +opt('--w', mode === 'sheet' ? 480 : 1920);
const H = +opt('--h', Math.round(W * 9 / 16));
const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: Math.max(W, 320), height: Math.max(H, 200) } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver Message|ERR_FILE_NOT_FOUND/.test(m.text())) errors.push(`console.${m.type()}: ${m.text()}`); });
  let crashed = false;
  page.on('crash', () => { crashed = true; });
  let q = `capture&w=${W}&h=${H}`;
  if (has('--reduced')) q += '&reduced';
  if (has('--no-overlay')) q += '&nooverlay';
  if (opt('--grain') !== undefined) q += `&grain=${opt('--grain')}`;
  await page.goto('file://' + pageFile + '?' + q);
  await page.waitForFunction(() => window.__captureReady || window.__captureError, null, { timeout: +opt('--compile-timeout', 600) * 1000, polling: 250 });
  const err = await page.evaluate(() => window.__captureError);
  if (err) { console.error(err); console.error(errors.join('\n')); process.exit(2); }
  const dur = await page.evaluate(() => (window.MO && +window.MO.DUR) || (window.SCORE && +window.SCORE.duration) || 30);
  return { page, errors, dur, crashed: () => crashed };
}

function stats(ms) {
  if (!ms.length) return '';
  const s = [...ms].sort((a, b) => a - b);
  return `frame ms: median ${s[s.length >> 1].toFixed(0)}, max ${s[s.length - 1].toFixed(0)}`;
}
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const hms = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`; };

// frames in a file without decoding it (one packet per frame for H.264 in MP4)
function countFrames(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', file]).toString().trim();
    return parseInt(out, 10);
  } catch (e) { return -1; }
}

(async () => {
  const t0 = Date.now();
  if (mode === 'stills' || mode === 'sheet') {
    const browser = await chromium.launch(LAUNCH);
    const { page, errors, dur } = await openPage(browser);
    let times;
    if (mode === 'stills') times = opt('--stills').split(',').map(Number);
    else {
      const from = +opt('--from', 0), to = +opt('--to', dur), step = +opt('--step', 0.5);
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
      // "7.50s" labels as before; m:ss.cc ("2:07.50") when the page is a minute or longer
      const cc = `%{eif\\:mod(floor(${T}*100+0.5)\\,100)\\:d\\:2}`;
      const text = dur >= 60 ? `%{eif\\:floor((${T}+0.0001)/60)\\:d}\\:%{eif\\:mod(floor(${T}+0.0001)\\,60)\\:d\\:2}.${cc}` : `%{eif\\:floor(${T}+0.0001)\\:d}.${cc}s`;
      const label = `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf:fontsize=${Math.max(12, Math.round(H / 14))}:fontcolor=yellow:box=1:boxcolor=black@0.6:x=6:y=6:text='${text}'`;
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
  const fps = +opt('--fps', 30), from = +opt('--from', 0);
  const jobs = Math.max(1, +opt('--jobs', 1));
  const audio = opt('--audio');
  const chunk = opt('--chunk') !== undefined ? +opt('--chunk') : 0;
  const resume = has('--resume');
  if (resume && !chunk) { console.error('--resume needs --chunk'); process.exit(1); }
  if (chunk && !(chunk > 0)) { console.error('--chunk takes a length in seconds'); process.exit(1); }

  let workers = [];
  const launchWorkers = async () => {
    workers = [];
    for (let j = 0; j < jobs; j++) { const b = await chromium.launch(LAUNCH); workers.push({ b, ...(await openPage(b)) }); }
  };
  const closeWorkers = async () => { for (const w of workers) { try { await w.b.close(); } catch (e) { /* already gone */ } } workers = []; };
  const allErrors = new Set();
  const keepErrors = () => { for (const w of workers) for (const e of w.errors) allErrors.add(e); };
  await launchWorkers();
  const to = +opt('--to', workers[0].dur);
  const n = Math.round((to - from) * fps);
  if (!(n > 0)) { console.error(`nothing to render: --from ${from} --to ${to}`); await closeWorkers(); process.exit(1); }

  const encArgs = (file, withAudio, faststart) => {
    const a = ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', '-'];
    if (withAudio) a.push('-ss', String(from), '-t', String(to - from), '-i', audio);
    a.push('-vf', 'vflip', '-c:v', 'libx264', '-preset', opt('--preset', 'slow'), '-crf', opt('--crf', '18'), '-pix_fmt', 'yuv420p', '-tune', opt('--tune', 'film'));
    if (opt('--maxrate')) a.push('-maxrate', opt('--maxrate'), '-bufsize', opt('--bufsize', opt('--maxrate')));
    if (withAudio) a.push('-c:a', 'aac', '-b:a', opt('--abr', '192k'), '-shortest');
    if (faststart) a.push('-movflags', '+faststart');
    a.push('-f', 'mp4', file);
    return a;
  };
  const startEncoder = (file, withAudio, faststart) => {
    const ff = spawn('ffmpeg', encArgs(file, withAudio, faststart), { stdio: ['pipe', 'inherit', 'inherit'] });
    let failed = null;
    ff.stdin.on('error', (e) => { failed = e; });
    const closed = new Promise((res) => ff.on('close', (code) => res(code)));
    const write = (buf) => new Promise((res, rej) => {
      if (failed) { rej(failed); return; }
      if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res);
    });
    const end = async () => { ff.stdin.end(); const code = await closed; if (code !== 0) throw new Error(`ffmpeg exited with ${code} for ${file}`); };
    const kill = () => { try { ff.kill('SIGKILL'); } catch (e) { /* gone */ } };
    return { write, end, kill };
  };

  // progress: a line every 100 frames (a live counter in between on a terminal)
  const ms = [];
  let toRender = n, rendered = 0;
  const recent = [];                 // [wall ms, frame ms] of the last 100 frames
  const tty = process.stdout.isTTY;
  const progress = (i, t, r) => {
    rendered++; ms.push(r.ms);
    recent.push([Date.now(), r.ms]); if (recent.length > 100) recent.shift();
    const span = recent.length > 1 ? (recent[recent.length - 1][0] - recent[0][0]) / (recent.length - 1) : (Date.now() - t0) / rendered;
    const eta = (toRender - rendered) * span / 1000;
    const line = `frame ${i + 1}/${n}  t=${t.toFixed(2)}  ${r.id}  last-100 median ${median(recent.map((x) => x[1])).toFixed(0)} ms/frame  ${(1000 / Math.max(1, span)).toFixed(2)} fps  elapsed ${hms((Date.now() - t0) / 1000)}  ETA ${hms(eta)}`;
    if (rendered % 100 === 0 || rendered === toRender) process.stdout.write((tty ? '\r' : '') + line + '\n');
    else if (tty && rendered % 5 === 0) process.stdout.write('\r' + line + '   ');
  };

  // render global frames [i0, i1) in order into write(); workers take frames round-robin
  async function renderRange(i0, i1, write) {
    const done = new Map(); let next = i0, abort = null;
    let flushing = Promise.resolve();
    const flush = () => { flushing = flushing.then(async () => { while (done.has(next)) { const buf = done.get(next); done.delete(next); await write(buf); next++; } }); return flushing; };
    await Promise.all(workers.map(async (w, j) => {
      try {
        for (let i = i0 + j; i < i1 && !abort; i += jobs) {
          while (i - next > jobs * 4 && !abort) await sleep(10);   // at most a few frames wait in memory
          if (abort) break;
          if (w.crashed()) throw new Error('the page crashed');
          const t = from + i / fps;
          const r = await w.page.evaluate((tt) => window.__capture.frame(tt), t);
          const b64 = await w.page.evaluate(() => window.__capture.rgba());
          done.set(i, Buffer.from(b64, 'base64'));
          progress(i, t, r);
          await flush();
        }
      } catch (e) { abort = abort || e; throw e; }
    }));
    await flush();
    if (next !== i1) throw new Error(`frames ${next}..${i1 - 1} were not written`);
  }

  if (!chunk) {
    // ---- one file, as before
    const enc = startEncoder(out, !!audio, true);
    try { await renderRange(0, n, enc.write); await enc.end(); }
    catch (e) { enc.kill(); keepErrors(); await closeWorkers(); console.error('\n' + (e.stack || e)); process.exit(3); }
  } else {
    // ---- segments, then a lossless join
    const segN = Math.max(1, Math.round(chunk * fps));
    const nSeg = Math.ceil(n / segN);
    const parts = path.resolve(opt('--parts', out + '.parts'));
    const manifest = { page: pageFile, W, H, fps, from, to, n, segN, preset: opt('--preset', 'slow'), crf: opt('--crf', '18'), tune: opt('--tune', 'film'), maxrate: opt('--maxrate') || null, bufsize: opt('--bufsize') || null, reduced: has('--reduced'), noOverlay: has('--no-overlay'), grain: opt('--grain') ?? null };
    const mfile = path.join(parts, 'manifest.json');
    if (resume && fs.existsSync(mfile)) {
      const old = JSON.parse(fs.readFileSync(mfile, 'utf8'));
      if (JSON.stringify(old) !== JSON.stringify(manifest)) {
        console.error(`--resume: ${parts} was rendered with other settings:\n  then ${JSON.stringify(old)}\n  now  ${JSON.stringify(manifest)}\nremove it or match the settings`);
        await closeWorkers(); process.exit(1);
      }
    } else {
      fs.rmSync(parts, { recursive: true, force: true });
    }
    fs.mkdirSync(parts, { recursive: true });
    fs.writeFileSync(mfile, JSON.stringify(manifest));
    const segs = [];
    for (let k = 0; k < nSeg; k++) {
      const i0 = k * segN, i1 = Math.min(n, i0 + segN);
      segs.push({ k, i0, i1, file: path.join(parts, `seg-${String(k).padStart(4, '0')}.mp4`) });
    }
    const complete = (s) => fs.existsSync(s.file) && countFrames(s.file) === s.i1 - s.i0;
    const todo = segs.filter((s) => !(resume && complete(s)));
    toRender = todo.reduce((a, s) => a + s.i1 - s.i0, 0);
    if (resume) console.log(`resume: ${nSeg - todo.length} of ${nSeg} segments already complete, ${toRender} frames to render`);
    for (const s of todo) {
      for (let attempt = 1; ; attempt++) {
        const tmp = s.file.replace(/\.mp4$/, '.partial.mp4');
        fs.rmSync(tmp, { force: true }); fs.rmSync(s.file, { force: true });
        const enc = startEncoder(tmp, false, false);
        const before = rendered;
        try {
          await renderRange(s.i0, s.i1, enc.write);
          await enc.end();
          const got = countFrames(tmp);
          if (got !== s.i1 - s.i0) throw new Error(`segment ${s.k} has ${got} frames, expected ${s.i1 - s.i0}`);
          fs.renameSync(tmp, s.file);
          console.log(`segment ${s.k + 1}/${nSeg}: frames ${s.i0}-${s.i1 - 1} (${(from + s.i0 / fps).toFixed(2)}-${(from + s.i1 / fps).toFixed(2)} s) -> ${path.basename(s.file)}`);
          break;
        } catch (e) {
          enc.kill(); fs.rmSync(tmp, { force: true });
          rendered = before;
          keepErrors();
          console.error(`\nsegment ${s.k} failed (attempt ${attempt}): ${e.message || e}`);
          if (attempt >= 3) { await closeWorkers(); console.error(`giving up; run again with --resume to continue from segment ${s.k}`); process.exit(3); }
          await closeWorkers(); await launchWorkers();   // a crashed or wedged page: start fresh
        }
      }
    }
    // join: stream copy (no re-encode); each entry states its exact length, so the timestamps of
    // segment k start at exactly k * segN frames and nothing is dropped or doubled at a join
    const list = path.join(parts, 'list.txt');
    fs.writeFileSync(list, segs.map((s) => `file '${s.file.replace(/'/g, "'\\''")}'\nduration ${((s.i1 - s.i0) / fps).toFixed(6)}\n`).join(''));
    const cat = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
    if (audio) cat.push('-ss', String(from), '-t', String(to - from), '-i', audio);
    cat.push('-map', '0:v:0');
    if (audio) cat.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', opt('--abr', '192k'), '-shortest');
    cat.push('-c:v', 'copy', '-movflags', '+faststart', '-f', 'mp4', out);
    execFileSync('ffmpeg', cat, { stdio: ['ignore', 'inherit', 'inherit'] });
    if (!has('--keep-parts')) fs.rmSync(parts, { recursive: true, force: true });
  }
  keepErrors();
  await closeWorkers();
  const size = fs.statSync(out).size;
  const got = countFrames(out);
  console.log(`\nwrote ${out}: ${n} frames ${W}x${H}@${fps} (${hms(n / fps)}), ${(size / 1e6).toFixed(2)} MB; ${stats(ms)}; ${hms((Date.now() - t0) / 1000)} wall`);
  if (got !== n) console.log(`WARNING: the file has ${got} video frames, expected ${n}`);
  if (allErrors.size) console.log('page errors/warnings:\n' + [...allErrors].join('\n'));
})();
