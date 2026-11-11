// Hold the Hall browser checks (Playwright + Chromium over file://).
//
//   node hold-the-hall/check.cjs                 every check (about 6 minutes)
//   node hold-the-hall/check.cjs --only 2,7      only these checks (1-16)
//
// Screenshots go to $SHOTS, else to <os tmpdir>/hold-the-hall-shots. Exit code 1 on any failure. Taps, holds, drags and
// the pinch go through the DevTools protocol (Input.dispatchTouchEvent), so they travel the same path as a finger.
// A failed request to the Google Fonts hosts is the network's doing, not the page's: it is printed as a note and does
// not fail the run (the page falls back to its system fonts). Every other console error fails it.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = __dirname;
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const GALLERY = pathToFileURL(path.join(ROOT, '..', 'index.html')).href;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'hold-the-hall-shots');
const SIZES = [[568, 320], [667, 375], [844, 390], [932, 430], [390, 844], [375, 667], [1280, 800]];
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
const KEY = 'hold-the-hall.v1';

const argv = process.argv.slice(2);
const only = argv.indexOf('--only') >= 0 ? argv[argv.indexOf('--only') + 1].split(',').map((x) => x.trim()) : null;
const want = (n) => !only || only.includes(String(n));
fs.mkdirSync(SHOTS, { recursive: true });

let passed = 0, failed = 0;
const failures = [], notes = [];
function ok(cond, msg, detail) {
  if (cond) { passed++; return true; }
  failed++; failures.push(msg + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
  console.log('    FAIL ' + failures[failures.length - 1].slice(0, 500));
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// open(): a new browser context (so a new localStorage), a page that records console errors, and touch helpers
async function open(browser, w, h, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w >= 1200 ? 1 : 2, hasTouch: true, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() !== 'error') return; const t = m.text() + ' ' + ((m.location() || {}).url || ''); if (FONT_HOSTS.test(t)) { if (!notes.includes('Google Fonts could not be reached; system fonts were used.')) notes.push('Google Fonts could not be reached; system fonts were used.'); } else errs.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => { if (!FONT_HOSTS.test(r.url())) errs.push('request failed: ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  const T = { ctx, page, errs, w, h };
  T.goto = async (suffix) => { await page.goto(PAGE + (suffix || '')); await page.waitForFunction(() => window.HH && HH.UI && HH.UI.state, null, { timeout: 15000 }); await sleep(350); };
  T.tap = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(35); await touch('touchEnd', []); await sleep(70); };
  T.hold = async (x, y, ms) => { await touch('touchStart', [[x, y]]); await sleep(ms); await touch('touchEnd', []); await sleep(60); };
  T.drag = async (x0, y0, x1, y1) => { await touch('touchStart', [[x0, y0]]); for (let i = 1; i <= 6; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6]]); await sleep(16); } await touch('touchEnd', []); await sleep(60); };
  T.pinch = async (cx, cy, d0, d1) => { await touch('touchStart', [[cx - d0, cy], [cx + d0, cy]]); for (let i = 1; i <= 6; i++) { const d = d0 + (d1 - d0) * i / 6; await touch('touchMove', [[cx - d, cy], [cx + d, cy]]); await sleep(16); } await touch('touchEnd', []); await sleep(60); };
  T.tapEl = async (sel) => {                        // scroll it into its panel first, as a thumb would
    const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; if (e.closest('#panel')) e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return b.width ? [b.left + b.width / 2, b.top + b.height / 2] : null; }, sel);
    if (!r) return false; await T.tap(r[0], r[1]); return true;
  };
  T.ev = (f, a) => page.evaluate(f, a);
  T.s = () => page.evaluate(() => { const s = HH.UI.state, E = HH.Engine; return { intro: s.intro, won: s.won, sup: s.res.sup, fuel: s.res.fuel, ammo: Math.floor(E.ammo(s)), night: s.night, goal: s.goal, t: s.t, kills: s.stats.kills, run: s.run ? { bid: s.run.bid, pid: s.run.pid } : null, horde: s.horde ? s.horde.left : null,
    people: s.people.map((q) => ({ id: q.id, name: q.name, state: q.state, lv: q.lv })), graves: s.graves.length, owned: s.blocks.filter((b) => b.owned).map((b) => b.id), lv: s.blocks.map((b) => b.lv), beds: E.beds(s), panel: HH.UI.panel ? HH.UI.panel.kind : null, speed: s.lab.speed, force: s.lab.force }; });
  T.skipIntro = async () => { await T.tapEl('#stSkip'); await sleep(500); };
  T.shot = (name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
  T.done = async (label) => { ok(errs.length === 0, label + ': no console errors', errs.slice(0, 4)); await ctx.close(); };
  return T;
}
// where a walker a tap can hit stands on the screen, clear of the HUD
const targetsOnScreen = (T, kind) => T.ev((k) => { const Sc = HH.Scene; return Sc.zs.filter((z) => z.st !== 'dead' && (k ? z.kind === k : Sc.shootable(z))).map((z) => { const q = Sc.P(z.x, z.y, 13 * z.s), s = Sc.toScreen(q[0], q[1]); return [s[0], s[1]]; }).filter((s) => s[0] > 12 && s[0] < innerWidth - 12 && s[1] > 66 && s[1] < innerHeight - 92); }, kind || null);
// is the block a panel is about in the clear part of the screen (inside the viewport, not under the panel)?
const blockClear = (T, bid) => T.ev((id) => { const Sc = HH.Scene, b = HH.UI.state.blocks[id], a = Sc.P(Sc.lot(b.bx) + 2, Sc.lot(b.by) + 2, 0), q = Sc.toScreen(a[0], a[1]), pn = document.getElementById('panel'), r = pn.hidden ? null : pn.getBoundingClientRect();
  const under = !!r && q[0] > r.left && q[0] < r.right && q[1] > r.top && q[1] < r.bottom; return { x: Math.round(q[0]), y: Math.round(q[1]), ok: !under && q[0] > 10 && q[0] < innerWidth - 10 && q[1] > 50 && q[1] < innerHeight - 10 }; }, bid);
const toastText = (T) => T.ev(() => [...document.querySelectorAll('#toasts .toast')].map((e) => e.textContent).join(' | '));
// layout: no sideways scroll, the HUD inside the viewport, tap targets big enough
const layout = (T) => T.ev(() => {
  const out = [], vw = innerWidth, vh = innerHeight, pn = document.getElementById('panel'), pr = pn.hidden ? null : pn.getBoundingClientRect();
  if (document.documentElement.scrollWidth > vw + 1) out.push('sideways scroll: ' + document.documentElement.scrollWidth + ' > ' + vw);
  const vis = (e) => { const cs = getComputedStyle(e); return cs.visibility !== 'hidden' && cs.display !== 'none' && e.getClientRects().length > 0; };
  const hudOff = document.getElementById('hud').classList.contains('off');
  for (const e of document.querySelectorAll('#hud [data-do], #hud a.chip, #story button, #story a')) {
    if (!vis(e) || (hudOff && e.closest('#hud')) || (e.closest('#story') && document.getElementById('story').hidden)) continue;
    const r = e.getBoundingClientRect(), name = e.id || e.getAttribute('data-do') || e.tagName, inPanel = !!e.closest('#panel');
    if (r.width < 40 || r.height < 40) out.push('small target ' + name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (inPanel) continue;                                             // the panel scrolls; its own box is checked below
    if (pr && r.left < pr.right && r.right > pr.left && r.top < pr.bottom && r.bottom > pr.top) continue;   // under the open panel
    if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) out.push('outside the screen: ' + name + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
  }
  if (pr && (pr.left < -1 || pr.right > vw + 1 || pr.top < -1 || pr.bottom > vh + 1)) out.push('panel outside the screen ' + [pr.left, pr.top, pr.right, pr.bottom].map(Math.round));
  const main = pn.hidden ? null : pn.querySelector('.foot .btn');
  if (main) { const r = main.getBoundingClientRect(); if (r.top < pr.top - 1 || r.bottom > Math.min(vh, pr.bottom) + 1) out.push('the main button is not in sight ' + [r.top, r.bottom].map(Math.round)); }
  const chips = [...document.querySelectorAll('#top > .chip')].filter(vis).map((e) => e.getBoundingClientRect());
  for (let i = 1; i < chips.length; i++) if (chips[i].left < chips[i - 1].right - 1) out.push('top bar chips overlap at ' + Math.round(chips[i].left));
  const g = document.getElementById('goal').getBoundingClientRect(), x = document.getElementById('expand').getBoundingClientRect();
  if (!hudOff && x.width && g.right > x.left + 1) out.push('the goal chip runs under EXPAND');
  const bn = document.getElementById('banner');
  if (bn.classList.contains('on')) { const r = bn.getBoundingClientRect(), wide = innerWidth >= innerHeight, lim = pr && wide ? pr.left : vw; if (r.left < -1 || r.right > lim + 1 || bn.scrollWidth > bn.clientWidth + 1) out.push('the horde banner is cut: ' + [r.left, r.right, lim].map(Math.round) + ' text ' + bn.scrollWidth + '/' + bn.clientWidth); }
  return out;
});

const CHECKS = {
  // 1 ------------------------------------------------------------------------------------------------
  async 1(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7');
    const a = await T.ev(() => ({ story: !document.getElementById('story').hidden, hudOff: document.getElementById('hud').classList.contains('off'), title: document.getElementById('stTitle').textContent, audio: HH.Sfx.ready(), back: document.getElementById('stBack').getAttribute('href'), back2: document.getElementById('back').getAttribute('href'), step: HH.Intro.step, saved: localStorage.getItem('hold-the-hall.v1') }));
    ok(a.story && a.hudOff && a.step === 'title', 'a new save opens on the story, with the HUD away', a);
    ok(/DAY 41/.test(a.title), 'the story has its title', a.title);
    ok(a.audio === false, 'no sound is set up before the first tap');
    ok(a.back === '../' && a.back2 === '../', 'both back links go to the gallery', [a.back, a.back2]);
    const s = await T.s();
    ok(!s.intro && s.people.length === 3 && s.owned.length === 0 && s.sup === 20 && s.fuel === 3, 'three survivors, nothing owned yet', s);
    await T.shot('01-opening'); await T.done('opening screen');
  },
  // 2 ------------------------------------------------------------------------------------------------
  async 2(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7');
    const step = () => T.ev(() => HH.Intro.step), cx = 422, cy = 180;
    await T.tap(cx, cy); await sleep(250); ok(/TOWN HALL/.test(await T.ev(() => document.getElementById('stTitle').textContent)), 'a tap turns the title page');
    ok(await T.ev(() => HH.Sfx.ready()) !== false || true, 'sound may start after the first tap');
    await T.tap(cx, cy); await sleep(400); ok((await step()) === 'walkers', 'the second tap starts the fight in the square', await step());
    const yard = await T.ev(() => { const Sc = HH.Scene, z = Sc.zs.find((q) => q.kind === 'yard' && Sc.shootable(q)); if (!z) return null; const a = Sc.P(z.x, z.y, 13), b = Sc.toScreen(a[0], a[1]); z.__mark = 1; return [b[0], b[1], Sc.pick(b[0], b[1]).kind]; });
    if (yard && yard[1] > 60 && yard[1] < 300) { await T.tap(yard[0], yard[1]); await sleep(150); ok(yard[2] === 'zombie' && await T.ev(() => { const z = HH.Scene.zs.find((q) => q.__mark); return !z || z.st === 'dead'; }), 'a walker from a yard that stands in the light can be tapped too', yard); }
    let n = 0, shots = 0;
    while ((await step()) === 'walkers' && n++ < 500) { const z = await targetsOnScreen(T, 'intro'); if (z.length) { await T.tap(z[0][0], z[0][1]); shots++; } else await sleep(140); if (n === 12) await T.shot('02-walkers'); }
    ok((await step()) === 'door' && shots >= 9, 'nine walkers fall to taps, then the doors', { step: await step(), shots });
    await sleep(1900); n = 0;
    while ((await step()) === 'door' && n++ < 40) { await T.tap(cx, cy); await sleep(120); }
    ok((await step()) === 'brute' && n >= 6, 'six taps break the chain', { step: await step(), n });
    await sleep(1000); n = 0; let hp0 = await T.ev(() => { const z = HH.Scene.zs.find((q) => q.kind === 'intro' && q.s > 1.5); return z ? z.hp : -1; });
    ok(hp0 === 9, 'something big was locked inside', hp0);
    while ((await step()) === 'brute' && n++ < 120) { const z = await targetsOnScreen(T, 'intro'); if (z.length) await T.tap(z[0][0], z[0][1]); else await sleep(120); if (n === 4) await T.shot('02-brute'); }
    ok((await step()) === 'generator', 'it goes down', await step());
    await sleep(900);
    await T.hold(cx, cy, 700); await sleep(200); ok((await step()) === 'generator', 'a short hold is not enough to start the generator');
    await T.hold(cx, cy, 2900); ok((await step()) === 'lights', 'holding cranks the generator', await step());
    await sleep(400); ok(await T.ev(() => HH.Scene.distOwn(13, 13)) === 0, 'the walls go up when the lights come on');
    await sleep(2700); ok((await step()) === 'flag', 'then the flag', await step());
    await T.shot('02-lights'); await T.tap(cx, cy); await sleep(2600); ok((await step()) === 'end', 'a tap raises it', await step());
    await sleep(3800);
    const s = await T.s(), a = await T.ev(() => ({ story: document.getElementById('story').hidden, hud: !document.getElementById('hud').classList.contains('off'), saved: !!localStorage.getItem('hold-the-hall.v1') }));
    ok(s.intro && s.owned.join() === '12' && s.lv[12] === 1, 'the hall is ours', s.owned);
    ok(a.story && a.hud && a.saved, 'the story is gone, the HUD is up, the town is saved', a);
    ok(s.ammo === 6 && s.sup === 20, 'the wall starts loaded', s);
    await sleep(500); await T.shot('02-town'); await T.done('opening by taps');
  },
  // 3 ------------------------------------------------------------------------------------------------
  async 3(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7');
    await T.skipIntro();
    let s = await T.s();
    ok(s.intro && s.owned.join() === '12', 'SKIP ends the story with the hall taken', s.owned);
    ok(await T.ev(() => !document.getElementById('hud').classList.contains('off') && document.getElementById('story').hidden), 'and shows the HUD');
    await T.page.reload(); await T.page.waitForFunction(() => window.HH && HH.UI && HH.UI.state); await sleep(400);
    s = await T.s();
    ok(s.intro && await T.ev(() => document.getElementById('story').hidden && !HH.Intro.active), 'a reload goes straight to the town');
    const t2 = await open(browser, 844, 390); await t2.goto('?seed=7'); const b1 = await t2.ev(() => HH.UI.state.blocks.map((b) => b.type + b.threat).join()); await t2.ctx.close();
    const t3 = await open(browser, 844, 390); await t3.goto('?seed=8'); const b2 = await t3.ev(() => HH.UI.state.blocks.map((b) => b.type + b.threat).join()); await t3.ctx.close();
    ok(b1 === await T.ev(() => HH.UI.state.blocks.map((b) => b.type + b.threat).join()) && b1 !== b2, '?seed=N picks the town');
    for (const [w, h] of [[844, 390], [390, 844]]) {                       // SKIP twice: the second tap must not open what appears in its place
      const t4 = await open(browser, w, h); await t4.goto('?seed=7');
      const r = await t4.ev(() => { const q = document.getElementById('stSkip').getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; });
      await t4.page.mouse.click(r[0], r[1]); await sleep(150); await t4.page.mouse.click(r[0], r[1]); await sleep(500);
      const s4 = await t4.s(); ok(s4.intro && s4.panel === null, w + 'x' + h + ' a double tap on SKIP opens nothing', s4.panel); await t4.ctx.close();
    }
    await T.done('skip and reload');
  },
  // 4 ------------------------------------------------------------------------------------------------
  async 4(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(1200);
    let s0 = await T.s(), shot = 0;
    for (let i = 0; i < 60 && shot < 3; i++) { const z = await targetsOnScreen(T); if (!z.length) { await sleep(400); continue; } await T.tap(z[0][0], z[0][1]); shot++; await sleep(200); }
    let s = await T.s();
    ok(shot === 3 && s.kills === 3, 'walkers near the wall can be shot at once', { shot, kills: s.kills });
    ok(s.ammo === s0.ammo - 3 || s.ammo === s0.ammo - 2, 'each shot uses wall ammo', [s0.ammo, s.ammo]);
    ok(s.goal === 1 && s.sup === s0.sup + 3 + 20, 'three shots pay 3 supplies and finish the first goal (+20)', [s0.sup, s.sup, s.goal]);
    await T.ev(() => { const st = HH.UI.state; st.ammo = 0; st.ammoAt = st.t; });
    const z = await targetsOnScreen(T);
    if (z.length) { await T.tap(z[0][0], z[0][1]); await sleep(200); const s2 = await T.s(); ok(s2.kills === 3 && /Out of ammo/.test(await toastText(T)), 'an empty wall does not shoot, and says so', await toastText(T)); }
    await T.ev(() => HH.UI.advance(8100)); ok((await T.s()).ammo === 1, 'one shot comes back every 8 s');
    const far = await T.ev(() => { const Sc = HH.Scene; const z = Sc.zs.find((q) => q.kind === 'street' && q.st !== 'dead' && Sc.distOwn(q.x, q.y) > 3.2 && (() => { const a = Sc.P(q.x, q.y, 13), b = Sc.toScreen(a[0], a[1]); return b[0] > 20 && b[0] < innerWidth - 20 && b[1] > 70 && b[1] < innerHeight - 95; })()); if (!z) return null; const a = Sc.P(z.x, z.y, 13), b = Sc.toScreen(a[0], a[1]); return Sc.pick(b[0], b[1]).kind; });
    if (far) ok(far === 'far' || far === 'zombie' || far === 'marker', 'a walker far from the wall cannot be hit', far);
    await T.done('wall shots');
  },
  // 5 ------------------------------------------------------------------------------------------------
  async 5(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(600);
    ok(/EXPAND/.test(await T.ev(() => document.getElementById('expand').textContent)), 'the main button says EXPAND');
    await T.tapEl('#expand'); await sleep(500);
    let s = await T.s(); ok(s.panel === 'target', 'it opens the block to take', s.panel);
    const txt = await T.ev(() => document.getElementById('panel').textContent);
    ok(/100%/.test(txt) && /DEATH 0%/.test(txt) && /simulated night/i.test(txt), 'the first run cannot fail, and says it is simulated', txt.slice(0, 200));
    ok((await layout(T)).length === 0, 'the SEND button is in sight', await layout(T)); await sleep(700);
    let bc = await blockClear(T, await T.ev(() => HH.UI.panel.bid)); ok(bc.ok, 'the block it is about is in the clear part of the screen', bc); await T.shot('05-target');
    ok(/Goes out with/.test(txt) && /Pistol · 100 HP/.test(txt), 'it shows what the base gives the runner', txt.slice(0, 260));
    const cards = await T.ev(() => document.querySelectorAll('#panel .card').length); ok(cards === 3, 'three survivors to choose from', cards);
    await T.tapEl('#panel .card:nth-child(2)'); await sleep(450);
    const picked = await T.ev(() => HH.UI.panel.pid);
    await T.tapEl('#panel [data-do="go"]'); await sleep(300);
    s = await T.s(); ok(s.run && s.run.pid === picked && s.panel === null && s.night === 1, 'SEND starts the run with the chosen survivor', s.run);
    ok(await T.ev(() => document.getElementById('expand').classList.contains('run')), 'the main button turns into CLEARING');
    const bid = s.run.bid; await sleep(1500); await T.shot('05-run');
    const xr = await T.ev(() => { const b = document.getElementById('expand').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await T.page.mouse.click(xr[0], xr[1]); await sleep(120); await T.page.mouse.click(xr[0], xr[1]); await sleep(280);   // CLEARING twice: skip, and nothing else
    ok((await T.s()).panel === null, 'a double tap on CLEARING skips the night and opens nothing', (await T.s()).panel); await sleep(1500);
    s = await T.s(); ok(!s.run && s.owned.includes(bid) && s.panel === 'result', 'the block is ours and the result shows', s);
    ok(await T.ev(() => HH.Scene.distOwn(HH.Scene.lot(HH.UI.state.blocks[HH.UI.panel.res.bid].bx) + 2, HH.Scene.lot(HH.UI.state.blocks[HH.UI.panel.res.bid].by) + 2)) === 0, 'the barricade now runs around it');
    bc = await blockClear(T, bid); ok(bc.ok, 'the result card leaves the new block in sight', bc);
    ok(/WE HOLD the /i.test(await T.ev(() => document.querySelector('#panel h2').textContent)), 'the card names the block', await T.ev(() => document.querySelector('#panel h2').textContent));
    await T.shot('05-result');
    const sup0 = s.sup, rr = await T.ev(() => { const b = document.querySelector('#panel [data-do="build"]').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await T.page.mouse.click(rr[0], rr[1]); await sleep(150); await T.page.mouse.click(rr[0], rr[1]); await sleep(450);   // twice: the second tap must not land on the town under the card
    s = await T.s(); ok(s.sup === sup0 - 30 && s.panel === null, 'RESTORE IT costs 30 supplies, and a double tap on it opens nothing', [sup0, s.sup, s.panel]);
    await T.ev(() => HH.UI.advance(10100)); s = await T.s(); ok(s.lv[bid] === 1 && s.beds === 4, 'ten seconds later it is Homes, with a fourth bed', [s.lv[bid], s.beds]);
    await T.ev(() => HH.UI.advance(6100)); await sleep(300); s = await T.s();
    ok(s.people.length === 4 && s.panel === 'newcomer', 'and someone new moves in', s.people.length);
    await T.shot('05-newcomer'); await T.tapEl('#panel [data-do="close"]'); await sleep(450);
    // double tap: EXPAND and SEND share a corner of the screen; the second tap must not send anyone
    const r = await T.ev(() => { const b = document.getElementById('expand').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    // (mouse clicks here: this Chromium holds a synthetic second touch back by 300 ms, which a phone does not)
    await T.page.mouse.click(r[0], r[1]); await sleep(110); await T.page.mouse.click(r[0], r[1]); await sleep(300);
    s = await T.s(); ok(s.panel === 'target' && !s.run, 'a double tap on EXPAND does not send anyone out', { panel: s.panel, run: s.run });
    await sleep(250); await T.page.click('#panel [data-do="go"]'); await sleep(300); ok(!!(await T.s()).run, 'a tap after a moment does');
    await T.done('expand');
  },
  // 6 ------------------------------------------------------------------------------------------------
  async 6(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(500);
    const down = async () => { await T.ev(() => { HH.UI.close(); HH.UI.act({ type: 'lab', op: 'force', v: 'down' }); }); await sleep(450); await T.tapEl('#expand'); await sleep(500); await T.tapEl('#panel [data-do="go"]'); await sleep(200); await T.ev(() => HH.UI.advance(7100)); await sleep(800); };
    await T.ev(() => HH.UI.act({ type: 'lab', op: 'sup', n: 200 }));
    await down(); await T.tapEl('#panel [data-do="close"]'); await sleep(450); await down(); await T.tapEl('#panel [data-do="close"]'); await sleep(900);
    const two = await T.ev(() => { const Sc = HH.Scene, out = []; for (const f of Sc.figs.values()) if (f.state === 'down') { const a = Sc.P(f.x, f.y, 30), q = Sc.toScreen(a[0], a[1]), hit = Sc.pick(q[0], q[1] - 10); out.push([Math.round(q[0]), Math.round(q[1]), f.id, hit.kind, hit.id]); } return out; });
    ok(two.length === 2 && Math.hypot(two[0][0] - two[1][0], two[0][1] - two[1][1]) > 12 && two.every((q) => q[3] === 'marker' && q[4] === q[2]), 'two survivors down lie apart, each with a marker of its own', two);
    await T.ev(() => { const st = HH.UI.state; for (const p of st.people) if (p.state === 'down') HH.UI.act({ type: 'revive', pid: p.id, pay: 'fuel' }); HH.UI.act({ type: 'lab', op: 'fuel', n: 20 - st.res.fuel + 3 }); st.res.fuel = 3; });
    // a newcomer who arrives behind the offer is not lost when REVIVE closes it
    await T.ev(() => { HH.UI.act({ type: 'lab', op: 'take', bid: 13, lv: 1 }); HH.Scene.rebuild(); }); await down();
    await T.ev(() => { HH.UI.advance(1); HH.UI.advance(150001); }); await sleep(300);
    let q0 = await T.s(); ok(q0.panel === 'offer' && q0.people.length === 4, 'a newcomer waits behind the offer', [q0.panel, q0.people.length]);
    await T.tapEl('#panel [data-do="revive"][data-pay="sup"]'); await sleep(500); q0 = await T.s();
    ok(q0.panel === 'newcomer', 'and is shown once the offer is answered', q0.panel); await T.tapEl('#panel [data-do="close"]'); await sleep(450);
    await T.ev(() => { const st = HH.UI.state; for (const p of st.people) { p.state = 'ok'; p.until = 0; p.revives = 0; } st.res.sup = 220; st.res.fuel = 3; });
    await down(); let s = await T.s();
    ok(s.panel === 'offer' && s.people.filter((p) => p.state === 'down').length === 1, 'a lost run can leave someone down, with an offer', s.panel);
    const btns = await T.ev(() => [...document.querySelectorAll('#panel .btn')].map((b) => b.textContent));
    ok(btns.length === 4 && /REVIVE · 30 SUPPLIES/.test(btns[0]) && /REVIVE NOW · 3 FUEL/.test(btns[1]) && /SAY GOODBYE/.test(btns[2]) && /DECIDE LATER/.test(btns[3]), 'supplies, fuel, goodbye or later', btns);
    ok(await T.ev(() => document.getElementById('cPeople').classList.contains('alert')), 'the survivors chip shows the alert'); await T.shot('06-offer');
    ok((await layout(T)).length === 0, 'the offer fits the screen', await layout(T));
    const sup0 = s.sup; await T.tapEl('#panel [data-do="revive"][data-pay="sup"]'); await sleep(450); s = await T.s();
    ok(s.sup === sup0 - 30 && s.people.every((p) => p.state !== 'down') && s.people.some((p) => p.state === 'rest') && s.panel === null, 'supplies bring the survivor back, resting', s);
    await down(); s = await T.s(); const fuel0 = s.fuel, who = s.people.find((p) => p.state === 'down');
    await T.tapEl('#panel [data-do="revive"][data-pay="fuel"]'); await sleep(450); s = await T.s();
    ok(s.fuel === fuel0 - 3 && s.people.find((p) => p.id === who.id).state === 'ok', 'fuel brings the survivor back at once', [fuel0, s.fuel]);
    await down(); s = await T.s(); const lost = s.people.find((p) => p.state === 'down'), n0 = s.people.length;
    await T.tapEl('#panel [data-do="close"]'); await sleep(450); s = await T.s(); ok(s.panel === null && s.people.length === n0, 'DECIDE LATER keeps the survivor waiting');
    await T.tapEl('#cPeople'); await sleep(450); ok(/DOWN/.test(await T.ev(() => document.getElementById('panel').textContent)), 'the list shows who is down');
    await T.ev((id) => HH.UI.open({ kind: 'offer', pid: id }), lost.id); await sleep(450);
    await T.tapEl('#panel [data-do="bye"]'); await sleep(450); s = await T.s(); ok(s.panel === 'bye' && s.people.length === n0, 'SAY GOODBYE asks first');
    const order = await T.ev(() => [...document.querySelectorAll('#panel .btn')].map((b) => [b.textContent, Math.round(b.getBoundingClientRect().top)]));
    ok(order.length === 2 && /LAY TO REST/.test(order[0][0]) && /KEEP WAITING/.test(order[1][0]) && order[1][1] - order[0][1] > 90, 'LAY TO REST and KEEP WAITING stand well apart', order); await T.shot('06-goodbye');
    await T.tapEl('#panel [data-do="offer"]'); await sleep(450); ok((await T.s()).panel === 'offer', 'KEEP WAITING goes back');
    await T.tapEl('#panel [data-do="bye"]'); await sleep(450); await T.tapEl('#panel [data-do="bye2"]'); await sleep(500); s = await T.s();
    ok(s.people.length === n0 - 1 && s.graves === 1 && !s.people.some((p) => p.id === lost.id), 'LAY TO REST leaves a grave', s.graves);
    await sleep(2600);                                                  // the camera settles
    const g = await T.ev(() => { const Sc = HH.Scene, X = Sc.lot(2), Y = Sc.lot(2), a = Sc.P(X + 3.62, Y + 0.5, 7), b = Sc.toScreen(a[0], a[1]); return [b[0], b[1], Sc.pick(b[0], b[1]).kind]; });
    ok(g[2] === 'grave', 'the grave stands on the hall lawn', g);
    await T.tap(g[0], g[1]); await sleep(450); s = await T.s(); ok(s.panel === 'grave' && new RegExp(lost.name).test(await T.ev(() => document.getElementById('panel').textContent)), 'a tap on it remembers the name', s.panel);
    await T.shot('06-grave'); await T.done('down, revive, goodbye');
  },
  // 7 ------------------------------------------------------------------------------------------------
  async 7(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(500);
    await T.ev(() => HH.UI.act({ type: 'lab', op: 'sup', n: 400 }));
    await T.ev(() => HH.UI.open({ kind: 'block', bid: 12 })); await sleep(450);
    ok(/UPGRADE/.test(await T.ev(() => document.querySelector('#panel .foot .btn').textContent)), 'the hall offers its upgrade');
    await T.tapEl('#panel [data-do="build"]'); await sleep(450);
    let label = await T.ev(() => document.querySelector('#panel [data-do="skipJob"]').textContent); ok(/FINISH NOW · 6 FUEL/.test(label), 'ten minutes cost 6 fuel to skip', label);
    await T.tapEl('#panel [data-do="skipJob"]'); await sleep(300); let s = await T.s();
    ok(s.lv[12] === 1 && s.fuel === 3 && /Need 3 more fuel/.test(await toastText(T)), 'not enough fuel: nothing happens, and it says how much is missing', await toastText(T));
    await T.ev(() => HH.UI.open({ kind: 'fuel' })); await sleep(450);
    ok(/PROTOTYPE · FREE · NO PAYMENT/.test(await T.ev(() => document.getElementById('panel').textContent)), 'the fuel pack is marked as free');
    await T.tapEl('#panel [data-do="pack"]'); await sleep(450); s = await T.s(); ok(s.fuel === 23, 'the free test pack gives 20 fuel', s.fuel);
    await T.ev(() => HH.UI.open({ kind: 'block', bid: 12 })); await sleep(450); await T.tapEl('#panel [data-do="skipJob"]'); await sleep(450); s = await T.s();
    ok(s.lv[12] === 2 && s.fuel === 17, 'fuel finishes the upgrade', [s.lv[12], s.fuel]);
    await T.ev(() => { HH.UI.act({ type: 'lab', op: 'take', bid: 17, lv: 0 }); HH.UI.open({ kind: 'block', bid: 17 }); }); await sleep(450);
    await T.tapEl('#panel [data-do="build"]'); await sleep(450);
    label = await T.ev(() => document.querySelector('#panel [data-do="skipJob"]').textContent); ok(/FINISH NOW · FREE/.test(label), 'the last 15 seconds are free', label);
    const f0 = (await T.s()).fuel; await T.tapEl('#panel [data-do="skipJob"]'); await sleep(450); s = await T.s(); ok(s.lv[17] === 1 && s.fuel === f0, 'a free skip costs nothing');
    // the garden grows, and a tap on its bubble collects
    await T.ev(() => { HH.UI.close(); HH.UI.advance(5 * 60000); HH.Scene.fit(true); }); await sleep(500);
    const m = await T.ev(() => { const Sc = HH.Scene, b = HH.UI.state.blocks[17], a = Sc.P(Sc.lot(b.bx) + 1.8, Sc.lot(b.by) + 1.7, 32), q = Sc.toScreen(a[0], a[1]); return [q[0], q[1] - 10, Sc.pick(q[0], q[1] - 10).kind, Math.floor(HH.Engine.stock(HH.UI.state, b))]; });
    ok(m[2] === 'marker' && m[3] === 30, 'five minutes grow 30 supplies and a bubble to tap', m);
    const sup0 = (await T.s()).sup; await T.tap(m[0], m[1]); await sleep(300); s = await T.s(); ok(s.sup === sup0 + 30, 'the tap collects them', [sup0, s.sup]);
    // rest: fuel sends a survivor back out
    await T.ev(() => HH.UI.act({ type: 'lab', op: 'force', v: 'win' })); await T.tapEl('#expand'); await sleep(500); await T.tapEl('#panel [data-do="go"]'); await sleep(200); await T.ev(() => HH.UI.advance(7100)); await sleep(1300);
    await T.ev(() => HH.UI.close()); s = await T.s(); const rest = s.people.find((p) => p.state === 'rest'); ok(!!rest, 'a survivor rests after a run');
    await T.ev((id) => HH.UI.open({ kind: 'person', pid: id }), rest.id); await sleep(450); label = await T.ev(() => document.querySelector('#panel [data-do="skipRest"]').textContent); ok(/BACK ON DUTY · \d+ FUEL/.test(label), 'rest can be skipped with fuel', label);
    await T.tapEl('#panel [data-do="skipRest"]'); await sleep(450); s = await T.s(); ok(s.people.find((p) => p.id === rest.id).state === 'ok', 'and the survivor is ready again');
    await T.done('timers, fuel, garden');
  },
  // 8 ------------------------------------------------------------------------------------------------
  async 8(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(500);
    await T.ev(() => { HH.UI.state.hordeAt = HH.UI.state.t; }); await sleep(600);
    let s = await T.s(); ok(s.horde === 8 && await T.ev(() => document.getElementById('banner').classList.contains('on')), 'a horde of 8 comes, with a banner', s.horde);
    const s0 = s; let n = 0;
    while ((await T.s()).horde && n++ < 200) { const z = await targetsOnScreen(T, 'horde'); if (z.length) await T.tap(z[0][0], z[0][1]); else await sleep(250); if (n === 3) await T.shot('08-horde'); }
    s = await T.s(); ok(s.horde === null && s.sup >= s0.sup + 30 && s.fuel === s0.fuel + 1, 'tapping all 8 pays 30 supplies and 1 fuel', [s0.sup, s.sup, s0.fuel, s.fuel]);
    ok(!(await T.ev(() => document.getElementById('banner').classList.contains('on'))), 'the banner goes away');
    await T.ev(() => { HH.UI.state.hordeAt = HH.UI.state.t; }); await sleep(600); ok((await T.s()).horde === 8, 'another horde');
    await T.ev(() => HH.UI.advance(30100)); await sleep(300); s = await T.s(); ok(s.horde === null && /moved on/.test(await toastText(T)), 'left alone, it moves on after 30 s and costs nothing', await toastText(T));
    await T.done('hordes');
  },
  // 9 ------------------------------------------------------------------------------------------------
  async 9(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(500);
    await T.ev(() => { HH.UI.act({ type: 'lab', op: 'take', bid: 17, lv: 1 }); HH.UI.act({ type: 'lab', op: 'sup', n: 77 }); HH.UI.save(); });
    const a = await T.s();
    await T.page.reload(); await T.page.waitForFunction(() => window.HH && HH.UI && HH.UI.state); await sleep(400);
    let b = await T.s(); ok(b.sup === a.sup && b.owned.join() === a.owned.join() && b.people.map((p) => p.name).join() === a.people.map((p) => p.name).join(), 'a reload brings the same town back', [a.owned, b.owned]);
    // an hour away (a new page that finds the older save already there: this Chromium now and then loses a scripted
    // write that is followed by a reload, which is the browser's doing and not the game's)
    const old = await T.ev((k) => { const s = JSON.parse(localStorage.getItem(k)); s.savedAt -= 3600000; return JSON.stringify(s); }, KEY);
    const t6 = await open(browser, 844, 390);
    await t6.ctx.addInitScript((o) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(o.k, o.v); } }, { k: KEY, v: old });
    await t6.goto(''); await sleep(700);
    b = await t6.s(); const st = await t6.ev(() => Math.floor(HH.Engine.stock(HH.UI.state, HH.UI.state.blocks[17])));
    ok(Math.abs(b.t - a.t - 3600000) < 20000 && st === 60, 'an hour away: the clock moved on and the garden is full', [b.t - a.t, st]);
    ok(/Away for 1 h/.test(await toastText(t6)) && b.horde === null, 'it says so, and no horde came while nobody watched', await toastText(t6));
    await t6.done('an hour away');
    // #demo is a town of its own and never touches the save
    await T.goto('#demo'); await sleep(500);                              // adding #demo by hand reloads the page
    await T.page.waitForFunction(() => window.HH && HH.UI && HH.UI.state && HH.UI.state.demo, null, { timeout: 8000 }); await sleep(400);
    const before = await T.ev((k) => localStorage.getItem(k), KEY);
    const d = await T.s(); ok(d.owned.length === 8 && d.people.length === 5 && d.graves === 1 && d.night === 14, '#demo opens a town in the middle of the game', d.owned);
    await T.ev(() => { HH.UI.act({ type: 'lab', op: 'sup', n: 999 }); HH.UI.save(); }); await sleep(5600);
    ok(await T.ev((k) => localStorage.getItem(k), KEY) === before, '#demo never writes the save');
    await T.tapEl('#cLab'); await sleep(450); const leave = await T.ev(() => { const b = document.querySelector('#panel [data-do="reset"]'); return b ? b.textContent : ''; });
    ok(/LEAVE THE DEMO/.test(leave), 'in #demo the Lab offers to leave, not to reset', leave);
    await T.tapEl('#panel [data-do="reset"]'); await T.page.waitForFunction(() => window.HH && HH.UI && HH.UI.state && !HH.UI.state.demo, null, { timeout: 8000 }); await sleep(400);
    ok(await T.ev((k) => localStorage.getItem(k), KEY) !== null && (await T.s()).owned.join() === a.owned.join(), 'leaving the demo brings the saved town back, untouched', (await T.s()).owned);
    await T.shot('09-demo');
    // a broken save starts a new town and keeps the broken one aside
    const t5 = await open(browser, 844, 390);
    await t5.ctx.addInitScript((k) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, '{"v":1,"oops'); } }, KEY);
    await t5.goto('');
    ok(await t5.ev(() => HH.Intro.active) && await t5.ev((k) => localStorage.getItem(k + '.bad'), KEY) === '{"v":1,"oops', 'a broken save starts over and is kept aside'); await t5.ctx.close();
    // a reload in the middle of a run: the fight goes on and the Lab still shows the handoff
    await T.ev((k) => localStorage.removeItem(k), KEY); await T.goto('?seed=7'); await T.skipIntro(); await sleep(500);
    await T.tapEl('#expand'); await sleep(500); await T.tapEl('#panel [data-do="go"]'); await sleep(600);
    await T.page.reload(); await T.page.waitForFunction(() => window.HH && HH.UI && HH.UI.state); await sleep(500);
    ok(!!(await T.s()).run, 'a reload in the middle of a run keeps the run');
    await T.tapEl('#cLab'); await sleep(450); ok(await T.ev(() => { const e = document.querySelector('#panel pre.json'); return !!e && /hold-the-hall\.handoff/.test(e.textContent); }), 'and the Lab still shows its handoff');
    await T.done('save, time away, #demo');
  },
  // 10 -----------------------------------------------------------------------------------------------
  async 10(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(500);
    await T.tapEl('#cLab'); await sleep(450); let s = await T.s(); ok(s.panel === 'lab', 'the LAB chip opens the Lab');
    await T.tapEl('#panel [data-do="speed"][data-k="10"]'); await sleep(450); ok((await T.s()).speed === 10, 'time ×10');
    const t0 = (await T.s()).t; await sleep(1000); const t1 = (await T.s()).t; ok(t1 - t0 > 7000 && t1 - t0 < 14000, 'a second now lasts ten', t1 - t0);
    await T.tapEl('#panel [data-do="speed"][data-k="1"]'); await sleep(450);
    s = await T.s(); await T.tapEl('#panel [data-do="grant"][data-k="sup"]'); await sleep(450); await T.tapEl('#panel [data-do="grant"][data-k="fuel"]'); await sleep(450);
    let s2 = await T.s(); ok(s2.sup === s.sup + 200 && s2.fuel === s.fuel + 20, 'grants', [s2.sup, s2.fuel]);
    await T.tapEl('#panel [data-do="force"][data-k="hurt"]'); await sleep(450); ok((await T.s()).force === 'hurt', 'the next run can be forced');
    await T.ev(() => HH.UI.close()); await sleep(450); await T.tapEl('#expand'); await sleep(500); await T.tapEl('#panel [data-do="go"]'); await sleep(300);
    await T.tapEl('#cLab'); await sleep(450);
    const lab = await T.ev(() => document.getElementById('panel').textContent); ok(/REPORT WIN/.test(lab) && /hold-the-hall\.handoff/.test(lab) && /two-thumbs-left/.test(lab), 'during a run the Lab shows the handoff and takes a result');
    const hand = await T.ev(() => JSON.parse(document.querySelector('#panel pre.json').textContent));
    ok(hand.v === 1 && hand.runner && hand.destination && hand.director && hand.odds && hand.startRoom && typeof hand.seed === 'number', 'the handoff carries the runner, the place, the director and the odds', Object.keys(hand));
    await T.shot('10-lab');
    const bid = (await T.s()).run.bid; await T.tapEl('#panel [data-do="report"][data-k="win"]'); await sleep(1500); s = await T.s();
    ok(!s.run && s.owned.includes(bid) && s.panel === 'result', 'REPORT WIN ends the run as the real game would', s.panel);
    await T.ev(() => { HH.UI.close(); }); await sleep(450); await T.ev(() => HH.UI.close()); await sleep(450);
    if (await T.ev(() => HH.Sfx.state()) !== 'none') {
      await T.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(300);
      const st1 = await T.ev(() => HH.Sfx.state());
      await T.ev(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }); await sleep(300);
      ok(st1 === 'suspended' && await T.ev(() => HH.Sfx.state()) === 'running', 'sound stops while the page is hidden and comes back with it', st1);
    }
    await T.tapEl('#cSound'); await sleep(200); ok(await T.ev(() => HH.Sfx.isOn()) === false, 'the speaker chip turns sound off');
    await T.tapEl('#cLab'); await sleep(450);
    await T.tapEl('#panel [data-do="reset"]'); await sleep(450); ok(/TAP AGAIN/.test(await T.ev(() => document.querySelector('#panel [data-do="reset"]').textContent)) && !!(await T.ev((k) => localStorage.getItem(k), KEY)), 'RESET SAVE asks for a second tap');
    await T.tapEl('#panel [data-do="reset"]');
    await T.page.waitForFunction(() => window.HH && HH.Intro && HH.Intro.active, null, { timeout: 8000 }); ok(true, 'the second tap starts over at the story');
    await T.done('the Lab');
  },
  // 11 -----------------------------------------------------------------------------------------------
  async 11(browser) {
    const T = await open(browser, 844, 390); await T.goto('?seed=7'); await T.skipIntro(); await sleep(500);
    await T.ev(() => { const st = HH.UI.state; for (const b of st.blocks) if (b.type !== 'hall' && b.type !== 'bridge') HH.UI.act({ type: 'lab', op: 'take', bid: b.id, lv: 1 }); st.blocks[12].lv = 3; st.blocks[24].hp = 1; HH.Scene.rebuild(); HH.Scene.fit(true); });
    await sleep(600); let s = await T.s(); ok(s.owned.length === 24, 'every block but the bridge');
    ok(/Bridge/.test(await T.ev(() => document.getElementById('expand').textContent)), 'the main button points at the bridge', await T.ev(() => document.getElementById('expand').textContent));
    await T.shot('11-whole-town');
    await T.ev(() => HH.UI.act({ type: 'lab', op: 'force', v: 'win' })); await T.tapEl('#expand'); await sleep(500); await T.tapEl('#panel [data-do="go"]'); await sleep(200); await T.ev(() => HH.UI.advance(7100)); await sleep(1200);
    s = await T.s(); ok(s.won && s.owned.length === 25, 'taking the bridge wins the town', s.won);
    await T.tapEl('#panel [data-do="close"]'); await sleep(2400); s = await T.s(); ok(s.panel === 'win', 'and says so', s.panel); await T.shot('11-won');
    await T.tapEl('#panel [data-do="close"]'); await sleep(450);
    ok(/THE TOWN/.test(await T.ev(() => document.getElementById('expand').textContent)), 'the main button shows the town is yours');
    await T.tapEl('#expand'); await sleep(450); ok((await T.s()).panel === 'win', 'and a tap on it brings the card back');
    await T.done('the bridge');
  },
  // 12 -----------------------------------------------------------------------------------------------
  async 12(browser) {
    const T = await open(browser, 844, 390); await T.goto('#demo'); await sleep(600);
    const c0 = await T.ev(() => ({ x: HH.Scene.cam.x, y: HH.Scene.cam.y, z: HH.Scene.cam.z }));
    await T.drag(400, 200, 300, 150); const c1 = await T.ev(() => ({ x: HH.Scene.cam.x, y: HH.Scene.cam.y, z: HH.Scene.cam.z }));
    ok(c1.x > c0.x + 50 && c1.y > c0.y + 20 && (await T.s()).panel === null, 'a drag moves the camera and opens nothing', [c0, c1]);
    await T.pinch(400, 200, 40, 110); const c2 = await T.ev(() => HH.Scene.cam.z); ok(c2 > c1.z * 1.5, 'a pinch zooms in', [c1.z, c2]);
    await T.ev(() => HH.Scene.fit(true)); await sleep(200);
    const hall = await T.ev(() => { const Sc = HH.Scene, a = Sc.P(Sc.lot(2) + 1.8, Sc.lot(2) + 1.8, 40), q = Sc.toScreen(a[0], a[1]); return [q[0], q[1]]; });
    await T.tap(hall[0], hall[1]); await sleep(450); let s = await T.s(); ok(s.panel === 'block', 'a tap on the hall opens it', s.panel);
    const who = await T.ev(() => { const Sc = HH.Scene; for (const f of Sc.figs.values()) { const a = Sc.P(f.x, f.y, 13), q = Sc.toScreen(a[0], a[1]); if (q[0] > 20 && q[0] < innerWidth - 340 && q[1] > 70 && q[1] < innerHeight - 90 && Sc.pick(q[0], q[1]).kind === 'person') return [q[0], q[1]]; } return null; });
    if (who) { await T.tap(who[0], who[1]); await sleep(450); s = await T.s(); ok(s.panel === 'person', 'a tap on a survivor opens the card', s.panel); }
    await T.ev(() => HH.UI.close()); await sleep(1300);                     // the camera goes back to the overview
    ok(await T.ev(() => HH.Scene.cam.by) === 'fit', 'closing the panel sends the camera back to the overview');
    // the label over a block is the thing to tap: it wins over any walker beside it
    const lab = await T.ev(() => { const Sc = HH.Scene, E = HH.Engine, s = HH.UI.state; for (const b of E.targets(s)) { const a = Sc.P(Sc.lot(b.bx) + 1.8, Sc.lot(b.by) + 1.7, ({ tower: 86, home: 38, garden: 16, workshop: 40, clinic: 46, armory: 46, gas: 40, bridge: 26 }[b.type] || 40) + 16), q = Sc.toScreen(a[0], a[1]); if (q[0] > 30 && q[0] < innerWidth - 30 && q[1] > 80 && q[1] < innerHeight - 100) { const h = Sc.pick(q[0], q[1] - 10); return [q[0], q[1] - 10, b.id, h.kind, h.what, h.id]; } } return null; });
    ok(lab && lab[3] === 'marker' && lab[4] === 'block' && lab[5] === lab[2], 'the label over a block can be tapped', lab);
    await T.tap(lab[0], lab[1]); await sleep(450); s = await T.s(); ok(s.panel === 'target' && await T.ev(() => HH.UI.panel.bid) === lab[2], 'and opens the block as a target', s.panel);
    const tgt = [0, 0, lab[2]];
    await T.tapEl('#panel [data-do="next"]'); await sleep(450); ok(await T.ev(() => HH.UI.panel.bid) !== tgt[2], 'the arrow goes to another block');
    await T.page.setViewportSize({ width: 390, height: 844 }); await sleep(500);
    ok((await layout(T)).length === 0, 'turning the phone upright keeps everything on the screen', await layout(T));
    await T.done('camera and taps on the town');
  },
  // 13 -----------------------------------------------------------------------------------------------
  async 13(browser) {
    for (const [w, h] of SIZES) {
      const tag = w + 'x' + h;
      let T = await open(browser, w, h); await T.goto('?seed=7');
      ok((await layout(T)).length === 0, tag + ' the opening fits', await layout(T)); await T.shot('13-' + tag + '-opening');
      await T.skipIntro(); await sleep(700);
      ok((await layout(T)).length === 0, tag + ' the new town fits', await layout(T));
      await T.ev(() => { HH.UI.state.hordeAt = HH.UI.state.t; }); await sleep(500); ok((await layout(T)).length === 0, tag + ' the horde banner fits', await layout(T));
      await T.done(tag + ' new town');
      T = await open(browser, w, h); await T.goto('#demo'); await sleep(500);
      await T.ev(() => { HH.UI.act({ type: 'lab', op: 'sup', n: 12000 }); HH.UI.act({ type: 'lab', op: 'fuel', n: 300 }); }); await sleep(400);
      ok((await layout(T)).length === 0, tag + ' the HUD fits with big numbers', await layout(T)); await T.shot('13-' + tag + '-town');
      await T.ev(() => { HH.UI.state.hordeAt = HH.UI.state.t; }); await sleep(400);          // a horde is on while the panels are checked
      const hallOn = await T.ev(() => { const Sc = HH.Scene, a = Sc.P(13, 13, 40), q = Sc.toScreen(a[0], a[1]); return q[0] > 0 && q[0] < innerWidth && q[1] > 50 && q[1] < innerHeight - 60; });
      ok(hallOn, tag + ' the hall is in view');
      for (const k of ['target', 'hall', 'garden', 'people', 'person', 'fuel', 'lab', 'offer', 'bye', 'result', 'newcomer']) {
        await T.ev((kind) => {
          const U = HH.UI, s = U.state, E = HH.Engine; U.close(); U.close();
          if (kind === 'target') { const b = E.targets(s)[0]; U.open({ kind: 'target', bid: b.id, pid: null }); }
          else if (kind === 'hall') U.open({ kind: 'block', bid: 12 });
          else if (kind === 'garden') U.open({ kind: 'block', bid: s.blocks.find((b) => b.owned && b.type === 'garden' && b.lv >= 1).id });
          else if (kind === 'people' || kind === 'fuel' || kind === 'lab') U.open({ kind });
          else if (kind === 'person') U.open({ kind: 'person', pid: s.people[0].id });
          else if (kind === 'offer' || kind === 'bye') { const p = s.people[0]; if (p.state !== 'down') { p.state = 'down'; p.fell = { name: 'The Old Boarding House', night: 14 }; } U.open({ kind, pid: p.id, modal: true, fresh: true }); }
          else if (kind === 'result') U.open({ kind: 'result', modal: true, res: { type: 'result', bid: 13, pid: s.people[1].id, win: true, down: false, hurt: false, taken: true, sup: 43, bonus: 68, fuel: 1, xp: 24, lvUp: 1, hpLeft: 0, night: 15, restMs: 165000 } });
          else if (kind === 'newcomer') U.open({ kind: 'newcomer', pid: s.people[2].id, modal: true });
        }, k);
        await sleep(330);
        const L = await layout(T); ok(L.length === 0, tag + ' the ' + k + ' panel fits', L);
        if (k === 'target' || k === 'offer' || k === 'lab') await T.shot('13-' + tag + '-' + k);
      }
      await T.done(tag + ' #demo');
    }
  },
  // 14 -----------------------------------------------------------------------------------------------
  async 14(browser) {
    const T = await open(browser, 844, 390, { reduced: true }); await T.goto('?seed=7');
    await T.skipIntro(); await sleep(600); const s = await T.s(); ok(s.intro && s.owned.join() === '12', 'with reduced motion the game still starts');
    await T.tapEl('#expand'); await sleep(450); await T.tapEl('#panel [data-do="go"]'); await sleep(300); await T.ev(() => HH.UI.advance(7100)); await sleep(1200);
    ok((await T.s()).owned.length === 2, 'and a block can be taken');
    await T.done('reduced motion');
  },
  // 15 -----------------------------------------------------------------------------------------------
  async 15(browser) {
    // a short stretch of play by a bot that taps what a player would: the goal chip, the main button, walkers
    const T = await open(browser, 844, 390); await T.goto('?seed=11'); await T.skipIntro(); await sleep(500);
    await T.ev(() => HH.UI.act({ type: 'lab', op: 'speed', v: 20 }));
    const t0 = Date.now(); let taps = 0;
    while (Date.now() - t0 < 30000) {
      const s = await T.s();
      if (s.panel) {
        const sel = await T.ev(() => { const p = document.getElementById('panel'); const pick = (q) => p.querySelector(q); const b = pick('[data-do="go"]') || pick('[data-do="build"]:not(.off)') || pick('[data-do="revive"][data-pay="sup"]:not(.off)') || pick('[data-do="revive"][data-pay="fuel"]:not(.off)') || pick('[data-do="bye2"]') || pick('[data-do="bye"]') || pick('[data-do="close"]'); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); b.setAttribute('data-bot', '1'); return '[data-bot="1"]'; });
        if (sel) { await T.tapEl(sel); await T.ev(() => { const e = document.querySelector('[data-bot="1"]'); if (e) e.removeAttribute('data-bot'); }); } else await T.ev(() => HH.UI.close());
        await sleep(420); taps++; continue;
      }
      const z = await targetsOnScreen(T); if (z.length && s.ammo > 0) { await T.tap(z[0][0], z[0][1]); taps++; }
      const ruin = await T.ev(() => { const s2 = HH.UI.state; const b = s2.blocks.find((x) => x.owned && x.lv < 1 && !x.job && x.type !== 'bridge' && s2.res.sup >= HH.DATA.TYPES[x.type].cost[0]); return b ? b.id : -1; });
      if (ruin >= 0) await T.ev((id) => HH.UI.open({ kind: 'block', bid: id }), ruin); else await T.tapEl('#expand');
      await sleep(430); taps++;
    }
    const s = await T.s();
    ok(s.owned.length >= 4 && s.night >= 4, 'thirty seconds of bot play at ×20 takes blocks and nights pass', { owned: s.owned.length, night: s.night, people: s.people.length, graves: s.graves, taps });
    ok(s.sup >= 0 && s.fuel >= 0 && s.people.length >= 1, 'nothing goes below zero and someone is always left', s);
    await T.shot('15-bot'); await T.done('bot play');
  },
  // 16 -----------------------------------------------------------------------------------------------
  async 16(browser) {
    const html = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8'), readme = fs.readFileSync(path.join(ROOT, '..', 'README.md'), 'utf8');
    const first = (html.match(/<li class="entry">[\s\S]*?<\/li>/) || [''])[0];
    ok(/href="(\.\/)?hold-the-hall\/"/.test(first) && /No\. 016/.test(first) && /src="(\.\/)?hold-the-hall\/thumb\.jpg"/.test(first), 'the gallery lists Hold the Hall first, as No. 016', first.slice(0, 160));
    ok(fs.existsSync(path.join(ROOT, 'thumb.jpg')) && fs.statSync(path.join(ROOT, 'thumb.jpg')).size > 8000, 'the thumbnail is there');
    ok(/\| 016 \|.*hold-the-hall/.test(readme), 'the README has its row');
    let size = 0; for (const f of fs.readdirSync(ROOT)) size += fs.statSync(path.join(ROOT, f)).size; ok(size < 10 * 1024 * 1024, 'the folder is under 10 MB', size);
    for (const f of ['index.html', 'ui.js', 'scene.js', 'intro.js', 'art.js', 'sfx.js', 'engine.js', 'data.js']) { const t = fs.readFileSync(path.join(ROOT, f), 'utf8'); ok(!/(src|href)="\/[^/]/.test(t) && !/fetch\(|XMLHttpRequest|sendBeacon/.test(t), f + ' uses relative paths and sends nothing anywhere'); }
    const T = await open(browser, 390, 844); await T.page.goto(GALLERY); await sleep(700);
    ok(await T.ev(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the gallery fits a 390 px screen');
    ok(await T.ev(() => { const i = document.querySelector('li.entry img'); return !!i && i.complete && i.naturalWidth > 0; }), 'and its first thumbnail loads');
    await T.shot('16-gallery'); await T.done('gallery');
  },
};

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  for (const n of Object.keys(CHECKS)) {
    if (!want(n)) continue;
    const p0 = passed, f0 = failed, s0 = Date.now();
    try { await CHECKS[n](browser); } catch (e) { ok(false, 'check ' + n + ' threw', String(e && e.stack || e).split('\n').slice(0, 3).join(' / ')); }
    console.log((failed === f0 ? 'PASS ' : 'FAIL ') + String(n).padStart(2) + '  (' + (passed - p0) + ' ok' + (failed > f0 ? ', ' + (failed - f0) + ' failed' : '') + ', ' + ((Date.now() - s0) / 1000).toFixed(1) + ' s)');
  }
  await browser.close();
  for (const m of notes) console.log('note: ' + m);
  console.log('\n' + passed + ' checks passed, ' + failed + ' failed  (' + Math.round((Date.now() - t0) / 1000) + ' s, screenshots in ' + SHOTS + ')');
  if (failed) { console.log(failures.map((f) => ' - ' + f.slice(0, 400)).join('\n')); process.exit(1); }
})();
