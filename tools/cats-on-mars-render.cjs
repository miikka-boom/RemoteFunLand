#!/usr/bin/env node
// Render No. 016 Cats on Mars to an MP4 with the same code the page runs (song.js, synth.js,
// gfx.js): the audio is synthesized once, then every frame is drawn at its exact time and piped
// into ffmpeg, which scales the 320x180 picture up with nearest-neighbour pixels.
//
// Usage:
//   node tools/cats-on-mars-render.cjs [--out cats-on-mars.mp4] [--fps 30] [--size 640x360] [--crf 20]
//   node tools/cats-on-mars-render.cjs --stills 12.5,44,90 --outdir stills   (PNG frames)
//   node tools/cats-on-mars-render.cjs --sheet 0:160:24 --out sheet.png      (contact sheet: from:to:count)
//   add --wav song.wav to also keep the soundtrack as a WAV file
//   --start/--end <seconds> render only part of it; --levels <n> sets the dither palette (8 = RGB333)
//
// Needs Node 18+ and ffmpeg (with libx264) on the PATH.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
for (const f of ['song.js', 'synth.js', 'gfx.js']) require(path.join(root, 'cats-on-mars', f));
const CM = globalThis.CM;
const { W, H } = CM.gfx;
const SR = CM.song.SR;

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : def; };
const has = name => args.includes(name);

function wavBuffer(L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  return buf;
}

function renderAudio() {
  const t = Date.now();
  const job = CM.createAudioJob();
  job.step();
  CM.audio = { L: job.L, R: job.R, mouth: job.mouth };
  console.log(`audio: ${(job.N / SR).toFixed(1)} s synthesized in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return job;
}

function frameBytes(t) {
  const fb = CM.gfx.frame(t);
  return Buffer.from(new Uint8Array(fb.buffer, fb.byteOffset, fb.byteLength));
}

function stills(times, outdir, size) {
  fs.mkdirSync(outdir, { recursive: true });
  for (const t of times) {
    const file = path.join(outdir, `frame_${t.toFixed(2).padStart(7, '0')}.png`);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', 'pipe:0',
      '-vf', `scale=${size}:flags=neighbor`, file], { input: frameBytes(t) });
    if (r.status !== 0) throw new Error(r.stderr.toString());
    console.log('wrote', file);
  }
}

function sheet(spec, out) {
  const [a, b, n] = spec.split(':').map(Number);
  const times = [];
  for (let i = 0; i < n; i++) times.push(a + (b - a) * i / Math.max(1, n - 1));
  const cols = 4, rows = Math.ceil(n / cols);
  const bufs = times.map(frameBytes);
  while (bufs.length < cols * rows) bufs.push(Buffer.alloc(W * H * 4));
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', 'pipe:0',
    '-vf', `tile=${cols}x${rows}:padding=4:color=0x202020`, '-frames:v', '1', out], { input: Buffer.concat(bufs), maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  console.log('wrote', out, 'times', times.map(x => x.toFixed(1)).join(' '));
}

async function video(out, fps, size, crf, wavKeep) {
  const job = renderAudio();
  const start = Number(opt('--start', 0)), end = Math.min(CM.song.DURATION, Number(opt('--end', CM.song.DURATION)));
  const wav = wavKeep || path.join(os.tmpdir(), `cats-on-mars-${process.pid}.wav`);
  const s0 = Math.floor(start * SR), s1 = Math.floor(end * SR);
  fs.writeFileSync(wav, wavBuffer(job.L.subarray(s0, s1), job.R.subarray(s0, s1)));
  const frames = Math.ceil((end - start) * fps);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0',
    '-i', wav,
    '-vf', `scale=${size}:flags=neighbor`,
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg exited with ' + code)))));
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const ok = ff.stdin.write(Buffer.from(frameBytes(start + f / fps)));
    if (!ok) await new Promise(r => ff.stdin.once('drain', r));
    if (f % (fps * 10) === 0) process.stdout.write(`\rframes ${f}/${frames}`);
  }
  ff.stdin.end();
  await done;
  if (!wavKeep) fs.unlinkSync(wav);
  console.log(`\rframes ${frames}/${frames} in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}

(async () => {
  if (has('--levels')) CM.gfx.OPT.levels = Number(opt('--levels'));
  if (has('--no-dither')) CM.gfx.OPT.dither = false;
  if (has('--stills')) {
    renderAudio();
    stills(opt('--stills').split(',').map(Number), opt('--outdir', 'stills'), opt('--size', '640x360').replace('x', ':'));
  } else if (has('--sheet')) {
    renderAudio();
    sheet(opt('--sheet'), opt('--out', 'sheet.png'));
  } else {
    await video(opt('--out', 'cats-on-mars.mp4'), Number(opt('--fps', 30)), opt('--size', '640x360').replace('x', ':'), Number(opt('--crf', 20)), opt('--wav'));
  }
})().catch(e => { console.error(e); process.exit(1); });
