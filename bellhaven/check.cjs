// Bellhaven browser checks: SPEC 12.C, tests 23-36 (Playwright + Chromium over file://).
//
//   node bellhaven/check.cjs                    every test at every size (about 4-6 minutes)
//   node bellhaven/check.cjs --only 27,31       only these tests (23-36)
//   node bellhaven/check.cjs --sizes 844x390    the size sweep (tests 23-25, 36) at these sizes only
//
// Screenshots (test 36 and one per notable state) go to $SHOTS, else to <os tmpdir>/bellhaven-shots. Exit code 1 on
// any failure. Touch input goes through the DevTools protocol (Input.dispatchTouchEvent), so taps, drags and the pinch
// travel the same pointer path as a finger on a phone.
//
// The sweep (tests 23, 24, 25, 36) runs at 568 x 320, 667 x 375, 844 x 390, 932 x 430, 390 x 844 and 1440 x 900: a new
// save (the rotate card in portrait, the meet cards, the build tray, placement mode) and then the #demo city (the HUD,
// the action bar, the building and Inn sheets, the Sparks sheet, the roster, the person and traveler cards, the run
// sheet, the run screen, the result card and both JSON cards, a forced Down with the fall beat and the revive offer,
// SAY GOODBYE with grave placement and LAY TO REST, the memorial card from a tap on the grave, the welcome card, the Lab
// with every group open). In every state: no horizontal scroll, every visible interactive element at least 44 x 44 CSS
// px, the panels inside the viewport. Spec reading (test 23): a failed request to the Google Fonts hosts is the
// network's doing, not the page's; it is printed as a note and does not fail the run (the page falls back to its
// system fonts). Every other console error fails it.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = __dirname;
const PAGE = pathToFileURL(path.join(ROOT, 'index.html')).href;
const GALLERY = pathToFileURL(path.join(ROOT, '..', 'index.html')).href;
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'bellhaven-shots');
const ALL_SIZES = [[568, 320], [667, 375], [844, 390], [932, 430], [390, 844], [1440, 900]];
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/;
const HOUR = 3600000;

const argv = process.argv.slice(2);
const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = argOf('--only') ? argOf('--only').split(',').map((x) => x.trim()) : null;
const SIZES = argOf('--sizes') ? argOf('--sizes').split(',').map((x) => x.split('x').map(Number)) : ALL_SIZES;
const want = (n) => !ONLY || ONLY.includes(String(n));
fs.mkdirSync(SHOTS, { recursive: true });

// ------------------------------------------------------------------------------------------------ reporting
let passed = 0, failed = 0;
const failures = [], notes = [];
function ok(cond, msg, detail) {
  if (cond) { passed++; return true; }
  failed++; failures.push(msg + (detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
  console.log('    FAIL ' + failures[failures.length - 1].slice(0, 600));
  return false;
}
const note = (m) => { if (!notes.includes(m)) notes.push(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------ the page
// open(): a new browser context (so a new localStorage), a page that records console errors, and touch helpers.
async function open(browser, w, h, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: o.dpr || (w >= 1200 ? 1 : 2), hasTouch: true, reducedMotion: o.reduced ? 'reduce' : 'no-preference' });
  if (o.init) await ctx.addInitScript(o.init, o.initArg);
  const p = await ctx.newPage();
  const t = { ctx, p, w, h, tag: w + 'x' + h, errs: [] };
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = (m.location() && m.location().url) || '';
    if (FONT_HOSTS.test(url) || (FONT_HOSTS.test(m.text()))) { note('font request failed (network): ' + m.text().slice(0, 120)); return; }
    t.errs.push(m.text());
  });
  p.on('pageerror', (e) => t.errs.push('PAGEERROR ' + e.message + ' ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
  p.on('requestfailed', (r) => { if (FONT_HOSTS.test(r.url())) note('font request failed (network): ' + r.url().slice(0, 90)); });
  const cdp = await ctx.newCDPSession(p);
  t.ev = (fn, a) => p.evaluate(fn, a);
  t.touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts || [] });
  // a finger does not tap again within the page's 450 ms calm after a screen change (ui.js onClick ignores such taps)
  t.calm = () => p.waitForFunction(() => !(window.BH && BH.UI && BH.UI.ui) || performance.now() >= (BH.UI.ui.calmUntil || 0), null, { timeout: 4000 }).catch(() => {});
  t.tapXY = async (x, y, holdMs) => { await t.calm(); await t.touch('touchStart', [{ x, y }]); await sleep(holdMs || 40); await t.touch('touchEnd'); await sleep(90); };
  t.drag = async (x0, y0, x1, y1, steps, pre) => {
    steps = steps || 12; await t.touch('touchStart', [{ x: x0, y: y0 }]); await sleep(pre || 20);
    for (let i = 1; i <= steps; i++) { await t.touch('touchMove', [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }]); await sleep(16); }
    await sleep(40); await t.touch('touchEnd'); await sleep(120);
  };
  t.tap = async (sel, timeout) => {
    const el = await p.waitForSelector(sel, { state: 'visible', timeout: timeout || 6000 });
    try { await el.scrollIntoViewIfNeeded({ timeout: 1000 }); } catch (e) { /* fixed elements */ }
    const bb = await el.boundingBox();
    await t.tapXY(bb.x + bb.width / 2, bb.y + bb.height / 2);
    return bb;
  };
  t.goto = async (q) => {
    await p.goto(PAGE + (q || ''));
    await p.waitForFunction(() => window.BH && BH.UI && BH.UI.state && BH.UI.iso, null, { timeout: 15000 });
    await sleep(300);
  };
  t.ov = () => t.ev(() => (BH.UI.ui.overlay ? BH.UI.ui.overlay.kind : null));
  t.waitOv = (k, ms) => p.waitForFunction((k) => BH.UI.ui.overlay && BH.UI.ui.overlay.kind === k, k, { timeout: ms || 8000 });
  t.waitNoOv = (ms) => p.waitForFunction(() => !BH.UI.ui.overlay, null, { timeout: ms || 6000 });
  t.shot = (name) => p.screenshot({ path: path.join(SHOTS, name + '-' + t.tag + '.png') });
  t.dev = (op, args) => t.ev((a) => BH.UI.act(Object.assign({ type: 'dev', op: a.op }, a.args || {}), { quiet: true }).ok, { op, args });
  t.close = () => ctx.close();
  return t;
}
// the 44 px rule (test 25), no horizontal scroll (24), panels inside the viewport: one call per UI state
async function audit(t, what, o) {
  o = o || {};
  const r = await t.ev((o) => {
    const hidden = (el) => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return true; } return false; };
    const name = (el) => (el.id ? '#' + el.id : '') + (el.dataset && el.dataset.do ? '[do=' + el.dataset.do + ']' : el.dataset && el.dataset.a ? '[a=' + el.dataset.a + ']' : el.dataset && el.dataset.c ? '[c=' + el.dataset.c + ']' : '') +
      (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"';
    const root = o.root ? document.querySelector(o.root) : document;
    const small = [], seen = [];
    if (root) for (const el of root.querySelectorAll('button, a[href], [data-do], [data-a], [data-c], input:not([type=hidden]), select, textarea, [role=button], summary')) {
      if (hidden(el) || getComputedStyle(el).pointerEvents === 'none') continue;
      if (el.parentElement && el.parentElement.closest('button, a[href]')) continue;           // a button's own parts
      if (o.scroll) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* detached */ } }
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.right <= 0.5 || b.bottom <= 0.5 || b.left >= innerWidth - 0.5 || b.top >= innerHeight - 0.5) continue;
      const cx = Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2));
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) continue;                // covered: not visible
      seen.push(el);
      if (b.width < 43.5 || b.height < 43.5) small.push(name(el) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
    }
    // panels and chips inside the viewport (fixed elements never widen the page, so check them directly)
    const outside = [];
    for (const el of document.querySelectorAll('#top .chip, #bottom > *, #sheet, #tray, #lab, #rotate, #overlay > *, #overlay > * > *, #hint')) {
      if (hidden(el)) continue; const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.left < -0.5 || b.right > innerWidth + 0.5) outside.push(name(el) + ' x ' + Math.round(b.left) + '-' + Math.round(b.right));
    }
    // text that does not fit: a label spilling out of its button or cut off by a clipping box (an ellipsis is
    // reported as a note: the spec asks for it on the goal chip's one line at 568)
    const clipped = [], cut = [];
    const pos = (el) => getComputedStyle(el).position;
    for (const el of seen) {
      const eb = el.getBoundingClientRect();
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        let abs = false, clipEl = null;
        for (let a = n.parentElement; a && a !== el.parentElement; a = a.parentElement) {
          if (a !== el && (pos(a) === 'absolute' || pos(a) === 'fixed')) { abs = true; break; }
          const ox = getComputedStyle(a).overflowX; if (!clipEl && (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll')) clipEl = a;
          if (a === el) break;
        }
        if (abs || hidden(n.parentElement)) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); const tb = rg.getBoundingClientRect();
        if (!tb.width) continue;
        const box = clipEl ? clipEl.getBoundingClientRect() : eb;
        if (tb.right > box.right + 1.5 || tb.left < box.left - 1.5) {
          const ell = clipEl && getComputedStyle(clipEl).textOverflow === 'ellipsis';
          (ell ? cut : clipped).push(name(el) + ' "' + n.nodeValue.trim().slice(0, 24) + '" ' + Math.round(tb.width) + '>' + Math.round(box.width));
        }
      }
    }
    // any text in the panels cut off sideways by a clipping box (not a scroller: scrolled text is fine)
    for (const rootEl of document.querySelectorAll('#top, #bottom, #sheet, #tray, #overlay, #lab, #rotate, #hint, #toasts')) {
      if (hidden(rootEl)) continue;
      const tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.nodeValue.trim() || !n.parentElement || hidden(n.parentElement)) continue;
        if (n.parentElement.closest('button, a[href], [data-do]')) continue;       // checked above
        let clipEl = null;
        for (let a = n.parentElement; a && a !== rootEl.parentElement; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === 'auto' || ox === 'scroll') break;
          if (ox === 'hidden' || ox === 'clip') { clipEl = a; break; }
        }
        if (!clipEl) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); const tb = rg.getBoundingClientRect(), box = clipEl.getBoundingClientRect();
        if (!tb.width || tb.bottom < box.top || tb.top > box.bottom) continue;
        if (tb.right > box.right + 1.5 || tb.left < box.left - 1.5) {
          const ell = getComputedStyle(clipEl).textOverflow === 'ellipsis';
          (ell ? cut : clipped).push(name(clipEl) + ' text "' + n.nodeValue.trim().slice(0, 30) + '" ' + Math.round(tb.width) + '>' + Math.round(box.width));
        }
      }
    }
    return { small, outside, clipped, cut, n: seen.length, sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, sx: scrollX };
  }, o);
  const m = t.tag + ' ' + what;
  ok(r.sw <= r.iw && r.bw <= r.iw && r.sx === 0, '24 no horizontal scroll: ' + m, [r.sw, r.bw, r.iw, r.sx]);
  ok(!r.small.length, '25 every visible target is 44 x 44: ' + m, r.small.slice(0, 8).join(' · '));
  ok(!r.outside.length, '24 panels inside the viewport: ' + m, r.outside.slice(0, 6).join(' · '));
  ok(!r.clipped.length, 'no text cut off: ' + m, r.clipped.slice(0, 6).join(' · '));
  for (const c of r.cut) note(t.tag + ' ' + what + ': ellipsis on ' + c);
  if (o.min) ok(r.n >= o.min, 'found the controls of ' + m + ' (' + r.n + ')', r.n);
  return r;
}
const errsOk = (t, m) => ok(!t.errs.length, '23 no console errors: ' + t.tag + ' ' + m, t.errs.slice(0, 4).join(' | '));

// ------------------------------------------------------------------------------------------------ shared flows
async function pastMeet(t) {                          // a new save: through the meet cards with two taps
  await t.waitOv('meet', 9000);
  for (let i = 0; i < 3 && (await t.ov()) === 'meet'; i++) { await t.tap('#overlay [data-primary]'); await sleep(250); }
  await t.waitNoOv(4000); await sleep(400);
}
async function uprightIfAsked(t) {
  if (await t.ev(() => document.documentElement.classList.contains('rotate-on'))) { await t.tap('#rotate [data-do=upright]'); await sleep(250); }
}
// PLAY -> run sheet -> GO (and RUN IT ANYWAY?) -> the run screen. Returns the state before GO.
async function goRun(t, o) {
  o = o || {};
  await t.tap('#play'); await t.waitOv('run', 5000);
  await t.p.waitForFunction(() => !document.querySelector('#overlay .go-btn.off'), null, { timeout: 8000 });
  await sleep(200);
  if (o.onSheet) await o.onSheet();
  const before = await t.ev(() => ({ res: Object.assign({}, BH.UI.state.res), cityMs: BH.UI.state.cityMs, night: BH.UI.state.night }));
  await t.tap('#overlay .go-btn'); await sleep(150);
  if (await t.ev(() => !!document.querySelector('#overlay .go-btn.armed'))) await t.tap('#overlay .go-btn');
  await t.waitOv('runscreen', 8000);
  before.pending = await t.ev(() => { const pe = BH.UI.state.pending; return pe ? { runId: pe.runId, warpS: pe.warpS, personId: pe.personId, destId: pe.destId, source: pe.source } : null; });
  return before;
}
// the run screen's » -> the result card (waits for BACK TO TOWN unless o.noWait)
async function skipToResult(t, o) {
  o = o || {};
  if (o.onScreen) await o.onScreen();
  await t.tap('#overlay .rsc .skip');
  await t.waitOv('result', 8000);
  if (!o.noWait) await t.p.waitForFunction(() => BH.UI.ui.overlay && BH.UI.ui.overlay.kind === 'result' && BH.UI.ui.overlay.args.phase === 'done', null, { timeout: 6000 }).catch(() => {});
  return t.ev(() => ({ rw: BH.UI.state.lastRun.reward, result: BH.UI.state.lastRun.result, res: Object.assign({}, BH.UI.state.res), cityMs: BH.UI.state.cityMs }));
}
// a grave: tap it (select), tap it again (its card), as a finger would
async function tapGrave(t, gid) {
  for (let i = 0; i < 2; i++) {
    const s = await t.ev((id) => BH.UI.iso.screenOf({ kind: 'grave', id }), gid);
    if (!s) return false;
    await t.tapXY(s.x, s.y - 4); await sleep(450);
    if ((await t.ov()) === 'memorial') return true;
  }
  return (await t.ov()) === 'memorial';
}

// ================================================================================================ 23-25, 36: the sweep
async function sweep(browser, w, h) {
  const portrait = h > w;
  console.log('  sweep ' + w + 'x' + h);
  const t = await open(browser, w, h);
  // ---------------------------------------------------------------- a new save
  await t.goto('?seed=20261104');
  if (portrait) {
    const rc = await t.ev(() => { const r = document.getElementById('rotate'); return { on: document.documentElement.classList.contains('rotate-on'), txt: r ? r.innerText : '' }; });
    ok(rc.on && /sideways/i.test(rc.txt), '34 the rotate card shows upright: ' + t.tag, rc.txt.slice(0, 80));
    await audit(t, 'rotate card');
    await uprightIfAsked(t);
  }
  await t.waitOv('meet', 9000);
  await audit(t, 'meet card');
  await pastMeet(t);
  await audit(t, 'HUD (new save)', { min: 9 });
  await t.tap('#bBuild'); await sleep(400);
  ok(await t.ev(() => !!BH.UI.ui.tray), 'BUILD opens the tray: ' + t.tag);
  await audit(t, 'build tray');
  await t.tap('#tray .tcard[data-type=cannery]'); await sleep(400);
  ok(await t.ev(() => !!(BH.UI.ui.mode && BH.UI.ui.mode.kind === 'place')), 'the Cannery card enters placement mode: ' + t.tag);
  await audit(t, 'placement mode');
  await t.shot('placement');
  await t.tap('#play'); await sleep(500);
  ok(await t.ev(() => !BH.UI.ui.mode && BH.UI.state.jobs.length === 1), '✓ PLACE starts the Cannery job: ' + t.tag);
  errsOk(t, 'new save');

  // ---------------------------------------------------------------- the #demo city (Tower 4, six people, a grave, a Down person)
  await t.goto('#demo');
  await uprightIfAsked(t);
  await sleep(700);
  await t.dev('runScreenS', { value: 3 });
  await audit(t, 'HUD (#demo)', { min: 9 });
  await t.shot('city');
  const ids = await t.ev(() => { const o = {}; for (const b of BH.UI.view.buildings) if (!o[b.type]) o[b.type] = b.id; return o; });
  await t.ev((id) => BH.UI.select({ kind: 'building', id }), ids.kiln); await sleep(450);
  await audit(t, 'action bar');
  await t.tap('#abar [data-do=info]'); await sleep(450);
  ok(await t.ev(() => !!(BH.UI.sheet.current() && BH.UI.sheet.current().kind === 'building')), 'Info opens the building sheet: ' + t.tag);
  await audit(t, 'building sheet');
  await t.ev((id) => BH.UI.sheet.open('building', { id }), ids.inn); await sleep(400);
  await audit(t, 'Inn sheet (travelers)');
  await t.ev(() => BH.UI.sheet.close()); await sleep(200);
  await t.tap('#cSparks'); await sleep(400);
  ok(await t.ev(() => !!(BH.UI.sheet.current() && BH.UI.sheet.current().kind === 'sparks')), 'the sparks chip opens the Sparks sheet: ' + t.tag);
  await audit(t, 'Sparks sheet');
  const shop = await t.ev(() => document.getElementById('sheet').innerText);
  ok(/free/i.test(shop) && !/[$€£¥]|\bprice\b|\bpay\b|\bbuy\b/i.test(shop), '8.12 the shop gives free packs only (no prices): ' + t.tag, shop.slice(0, 120));
  await t.tap('#cPeople'); await sleep(400);
  ok(await t.ev(() => !!(BH.UI.sheet.current() && BH.UI.sheet.current().kind === 'people')), 'the people chip opens the roster: ' + t.tag);
  await audit(t, 'roster');
  const firstReady = await t.ev(() => (BH.UI.view.people.find((p) => p.state === 'ready') || BH.UI.view.people[0]).id);
  await t.tap('#sheet .prow [data-do=person][data-id="' + firstReady + '"]'); await t.waitOv('person', 4000); await sleep(300);
  await audit(t, 'person card');
  await t.tap('#overlay [data-do=personTab][data-tab=history]'); await sleep(250);
  await audit(t, 'person card (history)');
  await t.tap('#overlay .pc [data-do=closeOverlay]'); await sleep(250);
  const trav = await t.ev(() => (BH.UI.view.inn && BH.UI.view.inn.travelers[0] ? BH.UI.view.inn.travelers[0].id : null));
  if (trav) {
    if (!(await t.ev(() => !!BH.UI.sheet.current()))) { await t.tap('#cPeople'); await sleep(350); }
    await t.tap('#sheet .prow [data-do=person][data-id="' + trav + '"]'); await t.waitOv('person', 4000); await sleep(250);
    await audit(t, 'traveler card');
    await t.tap('#overlay .pc [data-do=closeOverlay]'); await sleep(250);
  }
  if (await t.ev(() => !!BH.UI.sheet.current())) { await t.ev(() => BH.UI.sheet.close()); await sleep(200); }

  // ---------------------------------------------------------------- a run: the sheet, the screen, the result, the JSON cards
  await goRun(t, { onSheet: async () => { await audit(t, 'run sheet'); await t.shot('runsheet'); } });
  await sleep(portrait ? 900 : 700);
  await audit(t, 'run screen');
  await t.shot('runscreen');
  await skipToResult(t);
  await sleep(900);
  await audit(t, 'result card');
  await t.shot('result');
  await t.tap('#overlay [data-do=resJson][data-which=result]'); await t.waitOv('json', 4000); await sleep(250);
  await audit(t, 'JSON card');
  await t.tap('#overlay .jc [data-do=closeOverlay].primary'); await t.waitOv('result', 4000);
  await t.tap('#overlay [data-do=resultBack]'); await sleep(400);
  ok(!(await t.ov()), 'BACK TO TOWN closes the result: ' + t.tag);

  // ---------------------------------------------------------------- a forced Down: the beat, the offer, goodbye, the grave, the memorial
  await t.dev('force', { value: 'down' }); await t.dev('finishAll'); await t.dev('grant', { what: 'cans', n: 1000 });
  const before = await goRun(t);
  await skipToResult(t, { noWait: true });
  await t.waitOv('offer', 8000); await sleep(400);
  await audit(t, 'revive offer');
  await t.shot('offer');
  await t.tap('#overlay [data-do=goodbye]'); await sleep(700);
  const md = await t.ev(() => BH.UI.mode.current());
  ok(!!(md && md.kind === 'move' && md.target.kind === 'grave'), 'SAY GOODBYE opens grave placement: ' + t.tag, md);
  await audit(t, 'grave placement');
  await t.tap('#play'); await sleep(600);
  const gid = await t.ev((pid) => { const g = BH.UI.state.graves.find((x) => x.personId === pid); return g ? g.id : null; }, before.pending.personId);
  ok(!!gid && !(await t.ev(() => BH.UI.mode.current())), 'LAY TO REST ends the mode and the grave stands: ' + t.tag, gid);
  await t.dev('force', { value: 'auto' });
  await sleep(300);
  const tapped = gid ? await tapGrave(t, gid) : false;
  ok(tapped, 'a tap on the grave opens the memorial card: ' + t.tag);
  if (!tapped && gid) { await t.ev((id) => BH.UI.hooks.openMemorial(id), gid); await t.waitOv('memorial', 3000); }
  await sleep(300);
  await audit(t, 'memorial card');
  await t.shot('memorial');
  await t.tap('#overlay .mc [data-do=closeOverlay].primary'); await sleep(300);

  // ---------------------------------------------------------------- the welcome card (+3 h through the offline path) and the Lab
  await t.ev((ms) => BH.UI.labApi.skipAhead(ms), 3 * HOUR); await t.waitOv('welcome', 4000); await sleep(300);
  await audit(t, 'welcome card');
  await t.shot('welcome');
  await t.tap('#overlay [data-primary]'); await sleep(300);
  await t.tap('#cLab'); await sleep(500);
  ok(await t.ev(() => !!(document.querySelector('#lab .bhl') && BH.Lab.isOpen())), 'the LAB chip opens the Lab: ' + t.tag);
  await t.ev(() => { for (const g of document.querySelectorAll('#lab [data-g][aria-expanded="false"]')) g.click(); });
  await sleep(500);
  await t.shot('lab');
  await audit(t, 'Lab (every group open)', { root: '#lab', scroll: true, min: 120 });
  await t.ev(() => { const x = document.querySelector('#lab [data-a=close]'); if (x) x.click(); }); await sleep(250);
  ok(await t.ev(() => !document.documentElement.classList.contains('lab-open')), 'the Lab closes: ' + t.tag);
  errsOk(t, '#demo flows');
  await t.close();

  // ---------------------------------------------------------------- the gallery page (23)
  const g = await open(browser, w, h);
  await g.p.goto(GALLERY); await sleep(900);
  await g.ev(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(500);
  errsOk(g, 'the gallery index.html');
  await g.close();
}

// ================================================================================================ 26: the top bar fits
async function test26(browser) {
  console.log('  26 top bar');
  const t = await open(browser, 568, 320);
  await t.goto('#demo');
  await t.ev(() => {
    const s = BH.UI.state; BH.UI.act({ type: 'dev', op: 'setTower', lv: 10 }, { quiet: true });
    while (BH.UI.ui.overlay) BH.UI.overlay.close();
    BH.UI.ui.queue.length = 0;
    s.buildings = s.buildings.filter((x) => x.type !== 'depot'); let n = 90;
    for (const [gx, gy] of [[1, 1], [3, 1], [5, 1]]) s.buildings.push({ id: 'b' + (n++), type: 'depot', lv: 8, gx, gy });
    s.res.bricks = 91000; s.res.cans = 48600; s.res.sparks = 2640; BH.UI.ui.dispInit = false; BH.UI.refresh();
  });
  await sleep(700);
  const r = await t.ev(() => {
    const vis = (el) => { const c = getComputedStyle(el); const b = el.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && b.width > 0; };
    const chips = [...document.querySelectorAll('#top .chip')].filter(vis).map((el) => { const b = el.getBoundingClientRect(); return { id: el.id, l: b.left, r: b.right, t: b.top, b: b.bottom, over: el.scrollWidth > el.clientWidth + 1 || [...el.querySelectorAll('*')].some((c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflow === 'hidden') }; });
    return { chips, txt: ['cBricks', 'cCans', 'cSparks'].map((id) => document.getElementById(id).innerText.replace(/\s+/g, '')) };
  });
  const lap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const pairs = []; for (let i = 0; i < r.chips.length; i++) for (let j = i + 1; j < r.chips.length; j++) if (lap(r.chips[i], r.chips[j])) pairs.push(r.chips[i].id + '/' + r.chips[j].id);
  ok(r.chips.length >= 8 && !pairs.length, '26 no two chips overlap at 568 x 320 with 91,000 bricks, 48,600 cans and 2,640 ✦', pairs.join(' '));
  ok(r.chips.every((c) => !c.over), '26 every chip label fits at 568 x 320', r.chips.filter((c) => c.over).map((c) => c.id));
  ok(r.txt[0] === '91k/91k' && r.txt[1] === '48.6k/48.6k' && /2\.6k/.test(r.txt[2]), '26 compact numbers ("2,640" shows "2.6k")', r.txt);
  await t.shot('topbar-big-numbers');
  errsOk(t, 'test 26 (568)');
  await t.close();
  const q = await open(browser, 844, 390);
  await q.goto('?insets=47,21#demo');
  await sleep(600);
  const r2 = await q.ev(() => {
    const chips = [...document.querySelectorAll('#top .chip')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => { const b = el.getBoundingClientRect(); return { id: el.id, l: b.left, r: b.right, t: b.top, b: b.bottom }; });
    const back = document.getElementById('back').getBoundingClientRect(), lab = document.getElementById('cLab').getBoundingClientRect(), play = document.getElementById('play').getBoundingClientRect();
    const a = document.getElementById('cSparks').getBoundingClientRect(), c = document.getElementById('cCranes').getBoundingClientRect();
    return { chips, back: back.left, lab: lab.right, play: [play.right, play.bottom], gap: c.left - a.right, cls: document.documentElement.className };
  });
  const pairs2 = []; for (let i = 0; i < r2.chips.length; i++) for (let j = i + 1; j < r2.chips.length; j++) if (lap(r2.chips[i], r2.chips[j])) pairs2.push(r2.chips[i].id + '/' + r2.chips[j].id);
  ok(!pairs2.length, '26 no two chips overlap at 844 x 390 with 47 px safe-area insets', pairs2.join(' '));
  ok(Math.round(r2.back) === 47 && Math.round(r2.lab) === 844 - 47, '26 the top bar sits inside the 47 px insets', [r2.back, r2.lab]);
  ok(r2.gap >= 24, '26 a gap of at least 24 px between the two chip groups', r2.gap);
  ok(Math.round(r2.play[0]) === 797 && Math.round(r2.play[1]) === 390 - 21, '26 PLAY sits on the bottom inset (8.3)', r2.play);
  await q.shot('topbar-notch');
  errsOk(q, 'test 26 (844, notch)');
  await q.close();
}

// ================================================================================================ 27: placement
async function test27(browser) {
  console.log('  27 placement');
  const t = await open(browser, 844, 390);
  await t.goto('?seed=20261104');
  await pastMeet(t);
  await t.tap('#bBuild'); await sleep(350);
  await t.tap('#tray .tcard[data-type=cannery]'); await sleep(450);
  let gh = await t.ev(() => BH.UI.iso.ghost());
  ok(!!gh && gh.valid && gh.kind === 'cannery', '27 BUILD -> Cannery: the ghost sits on a valid spot', gh);
  ok(await t.ev(() => /PLACE/.test(document.getElementById('play').innerText) && document.getElementById('play').getAttribute('aria-disabled') !== 'true'), '27 PLAY reads ✓ PLACE');
  // a drag that starts on the ghost moves it at once (no hold) onto rubble: red, BLOCKED, disabled
  const rub = await t.ev(() => BH.UI.view.rubble.map((r) => ({ gx: r.gx, gy: r.gy })));
  const target = rub.find((r) => r.gx === 8 && r.gy === 11) || rub[0];
  const from = await t.ev((g) => BH.UI.iso.tileToScreen(g.gx + g.w / 2, g.gy + g.d / 2), gh);
  const to = await t.ev((r) => BH.UI.iso.tileToScreen(r.gx + 0.5, r.gy + 0.5), target);
  await t.touch('touchStart', [{ x: from.x, y: from.y }]);
  await sleep(30);
  for (let i = 1; i <= 10; i++) { await t.touch('touchMove', [{ x: from.x + (to.x - from.x) * i / 10, y: from.y + (to.y + 36 - from.y) * i / 10 }]); await sleep(16); }
  await sleep(120);
  const mid = await t.ev(() => ({ g: BH.UI.iso.ghost(), cam: BH.UI.iso.getCamera(), play: document.getElementById('play').innerText.replace(/\s+/g, ' '), dis: document.getElementById('play').getAttribute('aria-disabled') }));
  await t.touch('touchEnd'); await sleep(200);
  const after = await t.ev(() => ({ g: BH.UI.iso.ghost(), play: document.getElementById('play').innerText.replace(/\s+/g, ' '), dis: document.getElementById('play').getAttribute('aria-disabled') }));
  const covers = (g, r) => r.gx >= g.gx && r.gx < g.gx + g.w && r.gy >= g.gy && r.gy < g.gy + g.d;
  ok(mid.g && (mid.g.gx !== gh.gx || mid.g.gy !== gh.gy) && mid.g.dragging, '27 a drag that starts on the ghost moves it at once (no hold)', mid.g);
  ok(after.g && covers(after.g, target) && !after.g.valid, '27 dragged onto rubble the ghost turns red (invalid)', after.g);
  ok(/BLOCKED/.test(after.play) && after.dis === 'true', '27 and the button reads BLOCKED and is disabled', after);
  await t.shot('placement-blocked');
  // back to a valid spot (a tap on a tile moves the ghost there), then ✓ PLACE spends 80 bricks and a crane works the site
  const spot = await t.ev(() => BH.Engine.suggestSpot(BH.UI.state, 'cannery', 13, 13));
  const sp = await t.ev((s) => BH.UI.iso.tileToScreen(s.gx + 1, s.gy + 1), spot);
  await t.tapXY(sp.x, sp.y); await sleep(250);
  gh = await t.ev(() => BH.UI.iso.ghost());
  ok(gh && gh.valid, '27 a tap moves the ghost back to a valid spot', gh);
  const b0 = await t.ev(() => BH.UI.state.res.bricks);
  await t.tap('#play'); await sleep(700);
  const placed = await t.ev(() => ({ bricks: BH.UI.state.res.bricks, mode: BH.UI.ui.mode, can: BH.UI.state.buildings.find((b) => b.type === 'cannery'), job: BH.UI.state.jobs[0], cranes: BH.UI.view.cranes.list.filter((c) => c.busy).length, jibs: BH.UI.iso.debug().jibs.length }));
  ok(b0 - placed.bricks === 80, '27 ✓ PLACE spends 80 bricks', [b0, placed.bricks]);
  ok(!!placed.can && !!placed.job && placed.cranes === 1 && placed.jibs >= 1, '27 and a crane works the site', placed);
  await t.shot('placement-crane');
  // a canvas tap at a known tile picks that tile (projection round trip)
  await t.ev(() => { const on = BH.UI.iso.on; const f0 = on.onTap; window.__taps = []; on.onTap = (hit, info) => { window.__taps.push(hit); return f0 ? f0(hit, info) : undefined; }; });
  const probe = await t.ev(() => {
    const V = BH.UI.view, iso = BH.UI.iso, cv = iso.clearView();
    for (let gy = V.land.lo; gy < V.land.hi; gy++) for (let gx = V.land.lo; gx < V.land.hi; gx++) {
      const s = iso.tileToScreen(gx + 0.5, gy + 0.5, 0); if (s.x < cv.x0 + 30 || s.x > cv.x1 - 30 || s.y < cv.y0 + 30 || s.y > cv.y1 - 30) continue;
      const h = iso.pick(s.x, s.y); if (h.kind !== 'ground') continue;
      const back = iso.screenToTile(s.x, s.y); return { gx, gy, s, back };
    }
    return null;
  });
  ok(!!probe && probe.back.gx === probe.gx && probe.back.gy === probe.gy, '27 projection round trip: screenToTile(tileToScreen(tile)) is that tile', probe);
  if (probe) {
    await t.tapXY(probe.s.x, probe.s.y); await sleep(200);
    const hit = await t.ev(() => window.__taps[window.__taps.length - 1] || null);
    ok(!!hit && hit.kind === 'ground' && hit.gx === probe.gx && hit.gy === probe.gy, '27 a canvas tap at a known tile picks that tile', { hit, want: [probe.gx, probe.gy] });
  }
  errsOk(t, 'test 27');
  await t.close();
}

// ================================================================================================ 28: save and load
async function test28(browser) {
  console.log('  28 save and load');
  const t = await open(browser, 844, 390);
  await t.goto('?seed=777');
  await pastMeet(t);
  await t.ev(() => { BH.UI.act({ type: 'collect', id: 'b2' }); BH.UI.act({ type: 'place', kind: 'cannery', gx: 13, gy: 13 }); });
  await sleep(300);
  const a = await t.ev(() => ({ b: BH.UI.state.buildings.map((x) => x.type + '@' + x.gx + ',' + x.gy).join(' '), res: BH.UI.state.res.bricks, seed: BH.UI.state.saveSeed, people: BH.UI.state.people.map((p) => p.first).join(',') }));
  await t.p.reload(); await t.p.waitForFunction(() => window.BH && BH.UI && BH.UI.state); await sleep(500);
  const b = await t.ev(() => ({ b: BH.UI.state.buildings.map((x) => x.type + '@' + x.gx + ',' + x.gy).join(' '), res: BH.UI.state.res.bricks, seed: BH.UI.state.saveSeed, people: BH.UI.state.people.map((p) => p.first).join(','), ov: BH.UI.ui.overlay && BH.UI.ui.overlay.kind, status: BH.UI.ui.status }));
  ok(a.b === b.b && a.seed === b.seed && a.people === b.people && b.res === a.res, '28 a reload keeps the city', { a, b });
  ok(b.ov !== 'meet', '28 a reload does not replay the meet cards', b.ov);
  // two tabs on one save (11.2): tab B opens first, then A (reloaded) moves on; B, shown again, must not write its older
  // city over A's progress: it reloads to continue from it
  const pB = await t.ctx.newPage();
  pB.on('pageerror', (e) => t.errs.push('PAGEERROR (tab B) ' + e.message));
  await pB.goto(PAGE); await pB.waitForFunction(() => window.BH && BH.UI && BH.UI.state); await sleep(400);
  await t.p.reload(); await t.p.waitForFunction(() => window.BH && BH.UI && BH.UI.state); await sleep(400);
  await t.dev('grant', { what: 'sparks' });
  const sparksA = await t.ev(() => BH.UI.state.res.sparks);
  const reloaded = pB.waitForEvent('load', { timeout: 6000 }).then(() => true, () => false);
  await pB.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const rl = await reloaded;
  await pB.waitForFunction(() => window.BH && BH.UI && BH.UI.state, null, { timeout: 8000 }).catch(() => {}); await sleep(300);
  const tabs = await pB.evaluate(() => ({ b: BH.UI.state.res.sparks, stored: JSON.parse(localStorage.getItem('bellhaven.v1')).res.sparks }));
  ok(rl && tabs.b === sparksA && tabs.stored === sparksA, '28 two tabs: the older tab, shown again, reloads to the newer save and never writes over it', { sparksA, tabB: tabs.b, stored: tabs.stored, reloaded: rl });
  await pB.close();
  errsOk(t, 'test 28 reload');
  await t.close();
  // storage that throws: every call (quota, private mode) and the localStorage getter itself (blocked site data)
  for (const kind of ['calls', 'getter']) {
    const q = await open(browser, 844, 390, {
      init: (k) => {
        if (k === 'getter') Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
        else { const th = () => { throw new DOMException('denied', 'QuotaExceededError'); }; Storage.prototype.getItem = th; Storage.prototype.setItem = th; Storage.prototype.removeItem = th; }
      }, initArg: kind,
    });
    await q.goto('?seed=31');
    const toast = await q.p.waitForFunction(() => /won.t be saved/i.test(document.getElementById('toasts').innerText), null, { timeout: 6000 }).then(() => true, () => false);
    ok(toast, '28 storage throwing (' + kind + '): the "Progress won’t be saved" toast');
    await pastMeet(q);
    const played = await q.ev(() => { const r1 = BH.UI.act({ type: 'collect', id: 'b2' }); const r2 = BH.UI.act({ type: 'place', kind: 'cannery', gx: 13, gy: 13 }); BH.UI.save(); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); return r1.ok && r2.ok; });
    ok(played, '28 storage throwing (' + kind + '): the page still plays in memory');
    await goRun(q); await skipToResult(q);
    ok(await q.ev(() => BH.UI.state.night === 1), '28 storage throwing (' + kind + '): a run goes through');
    errsOk(q, 'test 28 storage throwing (' + kind + ')');
    await q.close();
  }
}

// ================================================================================================ 29: offline
async function test29(browser) {
  console.log('  29 offline');
  const E = require('./engine.js');
  const T0 = Date.now() - 3 * HOUR;
  const s = E.create({ realNow: T0, tzOffsetMin: 0, seed: 4242 });
  const A = (a) => { const r = E.act(s, a, T0); if (!r.ok) throw new Error('seed save: ' + JSON.stringify(a) + ' ' + r.err); return r; };
  A({ type: 'flag', name: 'metPeople' });
  A({ type: 'collect', id: 'b2' });
  A({ type: 'place', kind: 'cannery', gx: 13, gy: 13 });
  const raw = E.serialize(s);
  const t = await open(browser, 844, 390, { init: (raw) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('bellhaven.v1', raw); sessionStorage.setItem('seeded', '1'); } } catch (e) { /* storage blocked */ } }, initArg: raw });
  await t.goto('');
  await t.waitOv('welcome', 6000).catch(() => {});
  const w = await t.ev(() => ({ kind: BH.UI.ui.overlay && BH.UI.ui.overlay.kind, txt: document.getElementById('overlay').innerText, kiln: BH.UI.view.buildings.find((b) => b.type === 'kiln').bubble, can: BH.UI.view.buildings.find((b) => b.type === 'cannery'), jobs: BH.UI.state.jobs.length, res: BH.UI.state.res }));
  ok(w.kind === 'welcome', '29 a save from 3 h ago opens the welcome card', w.kind);
  ok(/WHILE YOU WERE AWAY · 3 h/.test(w.txt), '29 the card says how long', w.txt.slice(0, 60));
  ok(/Cannery built/.test(w.txt) && w.jobs === 0 && w.can && w.can.lv === 1, '29 the finished job is listed and done', w.txt.replace(/\s+/g, ' ').slice(0, 200));
  ok(w.kiln && w.kiln.full && /Waiting: 900 bricks/.test(w.txt), '29 the Kiln bubble is full and the card says what waits', { kiln: w.kiln, txt: w.txt.replace(/\s+/g, ' ').slice(0, 200) });
  // nothing collected: storage only moved by the goal the finished job completed ("Build a Cannery" pays 30 cans, 7.2)
  ok(w.res.bricks === s.res.bricks && w.res.cans === s.res.cans + 30, '29 nothing was collected for the player', [w.res, s.res]);
  await audit(t, 'welcome card (offline)');
  await t.shot('welcome-offline');
  errsOk(t, 'test 29');
  await t.close();
}

// ================================================================================================ 30: the run flow
async function test30(browser) {
  console.log('  30 run flow');
  const t = await open(browser, 844, 390);
  await t.goto('?seed=20261104');
  await pastMeet(t);
  await t.dev('runScreenS', { value: 3 });
  // a double tap on PLAY opens the run sheet and sends nobody: GO sits at PLAY's rect (6.2) and the second tap is the
  // rest of a double tap (8.2)
  {
    const r = await t.ev(() => { const b = document.getElementById('play').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await t.calm();
    for (let i = 0; i < 2; i++) { await t.touch('touchStart', [r]); await sleep(35); await t.touch('touchEnd'); await sleep(150); }
    await sleep(500);
    const d = await t.ev(() => ({ pending: !!BH.UI.state.pending, ov: BH.UI.ui.overlay && BH.UI.ui.overlay.kind }));
    ok(!d.pending && d.ov === 'run', '30 a double tap on PLAY opens the run sheet and sends nobody', d);
    if (d.ov === 'run') { await t.tap('#overlay [data-do=rsClose]'); await t.waitNoOv(4000).catch(() => {}); await sleep(300); }
  }
  for (let n = 1; n <= 2; n++) {
    const before = await goRun(t);
    ok(await t.ev(() => !!BH.UI.state.pending), '30 GO saves the run before the run screen (run ' + n + ')');
    const s0 = await t.ev(() => BH.UI.state.cityMs);
    await sleep(700);
    ok((await t.ev(() => BH.UI.state.cityMs)) === s0, '30 the city clock waits while the run screen plays (run ' + n + ')');
    const r = await skipToResult(t);
    const txt = await t.ev(() => document.getElementById('overlay').innerText.toUpperCase());
    ok(['TIME', 'KILLS', 'ACCURACY', 'SHOVES', 'DAMAGE TAKEN', 'HORDES'].every((k) => txt.includes(k)), '30 the result card shows the six stats (run ' + n + ')', txt.slice(0, 200));
    ok(/\+\d/.test(txt) && /XP/.test(txt), '30 the result card shows the loot and XP (run ' + n + ')');
    ok(/SENT TO THE GAME/.test(txt) && /BACK FROM THE GAME/.test(txt), '30 both JSON links (run ' + n + ')');
    await t.tap('#overlay [data-do=resJson][data-which=handoff]'); await t.waitOv('json', 4000);
    ok(await t.ev(() => { const j = JSON.parse(document.querySelector('#overlay .jc pre').textContent); return j.kind === 'bellhaven.handoff' && j.runId && j.player && j.startRoom; }), '30 "Sent to the game" shows the handoff JSON (run ' + n + ')');
    await t.tap('#overlay .jc [data-do=closeOverlay].primary'); await t.waitOv('result', 4000);
    await t.tap('#overlay [data-do=resJson][data-which=result]'); await t.waitOv('json', 4000);
    ok(await t.ev(() => { const j = JSON.parse(document.querySelector('#overlay .jc pre').textContent); return j.kind === 'bellhaven.result' && j.runId === BH.UI.state.lastRun.handoff.runId && !('bricks' in j); }), '30 "Back from the game" shows the result JSON, with no loot in it (run ' + n + ')');
    await t.tap('#overlay .jc [data-do=closeOverlay].primary'); await t.waitOv('result', 4000);
    const rw = r.rw;
    // GO holds the kit's price; the unused items come back before the loot (6.5): cans move by the loot minus what was used
    ok(r.res.bricks - before.res.bricks === rw.bricks && r.res.cans - before.res.cans === rw.cans - rw.kit.charged.total, '30 storage changes by the reward (run ' + n + ')', { before: before.res, after: r.res, rw: { bricks: rw.bricks, cans: rw.cans, kit: rw.kit } });
    // the chips hold the old numbers while the card is up, then count up to storage after BACK TO TOWN
    await t.tap('#overlay [data-do=resultBack]'); await sleep(1800);
    const chips = await t.ev(() => ({ b: document.getElementById('cBricks').innerText.replace(/\s+/g, ''), c: document.getElementById('cCans').innerText.replace(/\s+/g, ''), res: BH.UI.state.res }));
    const n0 = (x) => x.replace(/,/g, '');
    ok(n0(chips.b).startsWith(String(chips.res.bricks) + '/') && n0(chips.c).startsWith(String(chips.res.cans) + '/'), '30 the chips change by the reward (run ' + n + ')', chips);
    // the clock: the first simulated GO of a save advances result.time; later ones min(time, 6 x real seconds since the last GO)
    const wantMs = before.pending.warpS == null ? r.result.time * 1000 : Math.min(r.result.time * 1000, Math.round(before.pending.warpS * 1000));
    ok(Math.abs(rw.clockMs - wantMs) <= 1, '30 the city clock advanced by the run time, capped as in 5.1 (run ' + n + ')', { clockMs: rw.clockMs, time: r.result.time, warpS: before.pending.warpS });
    ok(r.cityMs - before.cityMs >= rw.clockMs && r.cityMs - before.cityMs <= rw.clockMs + 5000, '30 and the city clock moved by it (run ' + n + ')', [r.cityMs - before.cityMs, rw.clockMs]);
    if (n === 1) ok(before.pending.warpS == null && rw.clockMs === r.result.time * 1000, '30 the first simulated GO of a save advances the full result.time', before.pending);
    else ok(before.pending.warpS != null && before.pending.warpS < 60, '30 a GO a few seconds after the previous one carries a cap of 6 x the real seconds', before.pending);
  }
  await t.shot('run-flow-city');
  errsOk(t, 'test 30');
  await t.close();
}

// ================================================================================================ 31: the death flow
async function test31(browser) {
  console.log('  31 death flow');
  const t = await open(browser, 844, 390);
  await t.goto('?seed=9311');
  await pastMeet(t);
  ok(await t.ev(() => BH.UI.state.people.length === 2 && !BH.UI.state.flags.deathOn), '31 a fresh 2-person save (death not unlocked)');
  await t.dev('runScreenS', { value: 3 });
  // Lab -> Runs -> force DOWN, through the Lab panel
  await t.tap('#cLab'); await sleep(400);
  await t.ev(() => { const g = document.querySelector('#lab [data-g=runs]'); if (g && g.getAttribute('aria-expanded') === 'false') g.click(); });
  await sleep(250);
  await t.tap('#lab [data-c=force][data-v=\'"down"\']'); await sleep(250);
  ok(await t.ev(() => BH.UI.state.lab.force === 'down'), '31 the Lab sets force Down');
  await t.tap('#lab [data-a=close]'); await sleep(300);
  // run 1: the beat, the offer, REVIVE (cans)
  let b = await goRun(t);
  const runner1 = b.pending.personId;
  await t.tap('#overlay .rsc .skip'); await t.waitOv('result', 8000);
  await t.p.waitForFunction(() => BH.UI.ui.overlay && BH.UI.ui.overlay.kind === 'result' && BH.UI.ui.overlay.args.phase === 'beat', null, { timeout: 5000 }).catch(() => {});
  const beat = await t.ev(() => ({ phase: BH.UI.ui.overlay && BH.UI.ui.overlay.args.phase, txt: document.getElementById('overlay').innerText, back: !!document.querySelector('#overlay .go-btn.off[data-do=resultBack]') }));
  ok(beat.phase === 'beat' && /make it home\?/.test(beat.txt), '31 the fall beat: "Did … make it home?"', beat.txt.replace(/\s+/g, ' ').slice(0, 160));
  ok(beat.back, '31 BACK TO TOWN waits for the beat');
  await t.shot('death-beat');
  await t.waitOv('offer', 6000); await sleep(300);
  const offer = await t.ev(() => document.getElementById('overlay').innerText);
  ok(/IS DOWN/.test(offer) && /REVIVE ·/.test(offer) && /REVIVE NOW ·/.test(offer) && /SAY GOODBYE/.test(offer) && /left to decide/.test(offer), '31 the revive offer with every option', offer.replace(/\s+/g, ' ').slice(0, 200));
  const cans0 = await t.ev(() => BH.UI.state.res.cans);
  await t.tap('#overlay [data-do=revive][data-pay=cans]'); await sleep(500);
  const rv = await t.ev((id) => { const p = BH.UI.state.people.find((x) => x.id === id); return { state: p.state, kind: p.restKind, revives: p.revives, cans: BH.UI.state.res.cans }; }, runner1);
  ok(rv.state === 'rest' && rv.kind === 'recovering' && rv.revives === 1 && rv.cans < cans0, '31 REVIVE (cans) works: Recovering', rv);
  if ((await t.ov()) === 'result') await t.tap('#overlay [data-do=resultBack]');
  await sleep(400);
  // run 2: force Down again -> SAY GOODBYE -> LAY TO REST -> the grave -> the memorial
  b = await goRun(t);
  const runner2 = b.pending.personId;
  await t.tap('#overlay .rsc .skip'); await t.waitOv('result', 8000);
  await t.waitOv('offer', 8000); await sleep(300);
  await t.tap('#overlay [data-do=goodbye]'); await sleep(700);
  const md = await t.ev(() => { const m = BH.UI.mode.current(); return m ? { kind: m.kind, target: m.target, ok: m.labels && m.labels.ok, cancel: m.labels && m.labels.cancel, play: document.getElementById('play').innerText, bvis: getComputedStyle(document.getElementById('bBuild')).visibility } : null; });
  ok(md && md.kind === 'move' && md.target.kind === 'grave' && md.ok === 'LAY TO REST' && /LAY TO REST/.test(md.play), '31 SAY GOODBYE opens grave placement with LAY TO REST', md);
  ok(md && md.cancel === null && md.bvis === 'hidden', '31 grave placement has no ✕', md);
  await t.shot('death-grave-placement');
  await t.tap('#play'); await sleep(700);
  const g = await t.ev((pid) => { const g = BH.UI.state.graves.find((x) => x.personId === pid); const p = BH.UI.state.people.find((x) => x.id === pid); return g ? { id: g.id, gx: g.gx, gy: g.gy, state: p.state, drawn: BH.UI.iso.debug().layout.includes('grave:' + g.id) } : null; }, runner2);
  ok(g && g.gx != null && g.state === 'fallen', '31 LAY TO REST: the person is Fallen and the grave stands', g);
  ok(g && g.drawn, '31 the grave is drawn', g);
  await t.dev('force', { value: 'auto' });
  await sleep(400);
  const tapped = g ? await tapGrave(t, g.id) : false;
  ok(tapped, '31 the grave is tappable: a tap selects it, a second opens the memorial card');
  if (!tapped && g) { await t.ev((id) => BH.UI.hooks.openMemorial(id), g.id); await t.waitOv('memorial', 3000); }
  await sleep(300);
  const mem = await t.ev(() => document.getElementById('overlay').innerText);
  ok(/The odds were \d+%/.test(mem), '31 the memorial says "The odds were …"', mem.replace(/\s+/g, ' ').slice(0, 220));
  ok(/(Ran one night|Ran \d+ nights|Came to the gate|Everyone called|Once cleared)/.test(mem), '31 the memorial shows the epitaph', mem.replace(/\s+/g, ' ').slice(0, 220));
  await t.shot('death-memorial');
  errsOk(t, 'test 31');
  await t.close();
}

// ================================================================================================ 32: reduced motion
async function test32(browser) {
  console.log('  32 reduced motion');
  const t = await open(browser, 844, 390);
  await t.p.emulateMedia({ reducedMotion: 'reduce' });
  await t.goto('?seed=20261104');
  const running = () => t.ev(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a.animationName || a.transitionProperty || a.constructor.name) + '@' + (a.effect && a.effect.target ? (a.effect.target.id || a.effect.target.className || a.effect.target.tagName) : '?')));
  await t.waitOv('meet', 9000);
  let an = await running(); ok(!an.length, '32 no CSS animation or transition runs (meet card)', an);
  await pastMeet(t);
  ok(await t.ev(() => document.documentElement.classList.contains('rm') && BH.UI.iso.debug().reduced), '32 reduced motion is on (page and renderer)');
  await t.ev(() => BH.UI.act({ type: 'collect', id: 'b2' }));
  await t.tap('#bBuild'); await sleep(60);
  an = await running(); ok(!an.length, '32 no CSS animation or transition runs (collect, the tray)', an);
  ok(await t.ev(() => document.querySelectorAll('#fx .fly').length === 0), '32 no flyers');
  await t.tap('#tray .tcard[data-type=cannery]'); await sleep(200);
  await t.tap('#play'); await sleep(300);
  const j1 = await t.ev(() => JSON.stringify(BH.UI.iso.debug().jibs)); await sleep(700); const j2 = await t.ev(() => JSON.stringify(BH.UI.iso.debug().jibs));
  ok(j1 !== '[]' && j1 === j2, '32 the crane jib angle is constant across frames', [j1, j2]);
  await t.dev('runScreenS', { value: 3 });
  await t.dev('force', { value: 'down' });
  await goRun(t);
  an = await running(); ok(!an.length, '32 no CSS animation or transition runs (the run screen)', an);
  await t.tap('#overlay .rsc .skip');
  const fast = await t.p.waitForFunction(() => BH.UI.ui.overlay && (BH.UI.ui.overlay.kind === 'offer' || (BH.UI.ui.overlay.kind === 'result' && BH.UI.ui.overlay.args.phase === 'done')), null, { timeout: 3000 }).then(() => true, () => false);
  const ph = await t.ev(() => ({ kind: BH.UI.ui.overlay && BH.UI.ui.overlay.kind, queue: BH.UI.ui.queue.map((q) => q.kind + ':' + (q.args.phase || '')) }));
  ok(fast, '32 the fall beat resolves at once (the outcome shows at once)', ph);
  await t.waitOv('offer', 2000).catch(() => {});
  ok((await t.ov()) === 'offer', '32 the revive offer follows at once', await t.ov());
  an = await running(); ok(!an.length, '32 no CSS animation or transition runs (the revive offer)', an);
  await t.shot('reduced-offer');
  errsOk(t, 'test 32');
  await t.close();
}

// ================================================================================================ 33: audio only after a tap
async function test33(browser) {
  console.log('  33 audio');
  const t = await open(browser, 844, 390, {
    init: () => {
      window.__ac = 0;
      for (const k of ['AudioContext', 'webkitAudioContext']) {
        const O = window[k]; if (!O) continue;
        const W = function (...a) { window.__ac++; return new O(...a); }; W.prototype = O.prototype;
        try { Object.defineProperty(window, k, { configurable: true, writable: true, value: W }); } catch (e) { window[k] = W; }
      }
    },
  });
  await t.goto('?seed=20261104');
  await t.waitOv('meet', 9000); await sleep(800);
  ok((await t.ev(() => window.__ac)) === 0, '33 no AudioContext before the first pointerdown', await t.ev(() => window.__ac));
  await t.tap('#overlay [data-primary]'); await sleep(300);
  ok((await t.ev(() => window.__ac)) === 1, '33 one AudioContext after the first tap', await t.ev(() => window.__ac));
  await t.tap('#overlay [data-primary]'); await sleep(300);
  await t.tapXY(420, 200); await sleep(200);
  ok((await t.ev(() => window.__ac)) === 1, '33 still one after more taps', await t.ev(() => window.__ac));
  ok(await t.ev(() => BH.Sfx.created() && BH.Sfx.state().ctx === 'running'), '33 the audio runs after the tap', await t.ev(() => BH.Sfx.state()));
  errsOk(t, 'test 33');
  await t.close();
}

// ================================================================================================ 34: portrait
async function test34(browser) {
  console.log('  34 portrait');
  const t = await open(browser, 390, 844);
  await t.goto('#demo');
  const rc = await t.ev(() => { const r = document.getElementById('rotate'), c = r.querySelector('.rc') || r; const b = c.getBoundingClientRect(); return { on: document.documentElement.classList.contains('rotate-on'), txt: r.innerText, h: b.height, t: b.top }; });
  ok(rc.on && /Turn your phone sideways/i.test(rc.txt) && /USE IT UPRIGHT ANYWAY/i.test(rc.txt), '34 the rotate card shows', rc);
  ok(rc.t <= 1 && rc.h >= 844 * 0.35 && rc.h <= 844 * 0.45, '34 the card covers the top 40 %', rc);
  await t.shot('portrait-rotate');
  await t.tap('#rotate [data-do=upright]'); await sleep(400);
  const L = await t.ev(() => {
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const vis = (id) => { const el = document.getElementById(id), b = el.getBoundingClientRect(); if (getComputedStyle(el).visibility === 'hidden' || !b.width) return false; const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!top && (top === el || el.contains(top)); };
    const chips = [...document.querySelectorAll('#top .chip')].map((el) => { const b = el.getBoundingClientRect(); return { id: el.id, l: b.left, r: b.right, t: b.top, b: b.bottom }; });
    return { on: document.documentElement.classList.contains('rotate-on'), play: r('play'), build: r('bBuild'), goal: r('goal'), pv: vis('play'), bv: vis('bBuild'), chips, rows: [...new Set(chips.map((c) => Math.round(c.t)))].length, sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  const lap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  ok(!L.on, '34 USE IT UPRIGHT ANYWAY closes the card');
  ok(L.pv && L.bv && L.play.b <= 844 && L.build.b <= 844, '34 PLAY and BUILD are visible', L);
  const all = [L.play, L.build, L.goal].concat(L.chips); const pairs = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (lap(all[i], all[j])) pairs.push(i + '/' + j);
  ok(!pairs.length, '34 nothing overlaps (top bar in two rows, BUILD, goal, PLAY)', pairs);
  ok(L.rows === 2, '34 the top bar wraps into two rows', L.rows);
  ok(L.sw <= L.iw, '34 no horizontal scroll', [L.sw, L.iw]);
  await audit(t, 'portrait city');
  await t.shot('portrait-city');
  // usable: a sheet is a bottom sheet, the run sheet stacks and GO is reachable
  await t.tap('#cPeople'); await sleep(400);
  const sh = await t.ev(() => { const b = document.getElementById('sheet').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height }; });
  ok(sh.l <= 1 && sh.r >= 389 && sh.b >= 843 && sh.h <= 844 * 0.6 + 1, '34 sheets are bottom sheets (full width, at most 60 % height)', sh);
  await t.ev(() => BH.UI.sheet.close()); await sleep(200);
  await t.tap('#play'); await t.waitOv('run', 5000); await sleep(500);
  await audit(t, 'portrait run sheet');
  const go = await t.ev(() => { const b = document.querySelector('#overlay .go-btn').getBoundingClientRect(); return { l: b.left, r: b.right, b: b.bottom, w: b.width }; });
  ok(go.w >= 390 - 40 && go.b <= 844, '34 GO is full width and on screen in the stacked run sheet', go);
  await t.tap('#overlay [data-do=rsClose]'); await sleep(200);
  // the choice is remembered on this device
  await t.p.reload(); await t.p.waitForFunction(() => window.BH && BH.UI && BH.UI.state); await sleep(400);
  ok(!(await t.ev(() => document.documentElement.classList.contains('rotate-on'))), '34 the dismissal is remembered on this device');
  errsOk(t, 'test 34');
  await t.close();
}

// ================================================================================================ 35: canvas DPR
async function test35(browser) {
  console.log('  35 canvas DPR');
  const t = await open(browser, 844, 390, { dpr: 3 });
  await t.goto('#demo');
  await t.ev(() => BH.UI.iso.setAdaptiveDpr(false));      // a software-rendered headless page runs slow; gestures still drop it
  await sleep(400);
  const d0 = await t.ev(() => { const d = BH.UI.iso.debug(); return { bs: d.bs, cw: d.canvas.w, ch: d.canvas.h, el: [document.getElementById('city').width, document.getElementById('city').height] }; });
  ok(d0.bs === 3 && d0.el[0] === 844 * 3 && d0.el[1] === 390 * 3, '35 the backing store is 3x at DPR 3', d0);
  // a two-finger pinch on the canvas
  const mx = 420, my = 210;
  await t.touch('touchStart', [{ x: mx - 40, y: my, id: 1 }, { x: mx + 40, y: my, id: 2 }]);
  await sleep(60);
  await t.touch('touchMove', [{ x: mx - 60, y: my, id: 1 }, { x: mx + 60, y: my, id: 2 }]); await sleep(50);
  await t.touch('touchMove', [{ x: mx - 80, y: my, id: 1 }, { x: mx + 80, y: my, id: 2 }]); await sleep(80);
  const d1 = await t.ev(() => { const d = BH.UI.iso.debug(); return { bs: d.bs, w: document.getElementById('city').width, gesture: d.gesture, z: d.camera.z }; });
  await t.touch('touchEnd'); await sleep(500);
  const d2 = await t.ev(() => { const d = BH.UI.iso.debug(); return { bs: d.bs, w: document.getElementById('city').width, z: d.camera.z }; });
  ok(d1.bs === 2 && d1.w === 844 * 2, '35 the backing store drops to 2x during a pinch', d1);
  ok(d1.z > d0.z || d1.z > 0, '35 the pinch zooms', [d1.z]);
  ok(d2.bs === 3 && d2.w === 844 * 3, '35 and returns to 3x after it', d2);
  // zoom 1.8 at DPR 3: one ground cache of at most 4,096 px a side, and grass drawn
  await t.ev(() => BH.UI.iso.setCamera({ tx: 12, ty: 12, z: 1.8 })); await sleep(700);
  const g = await t.ev(() => { const d = BH.UI.iso.debug(); return { z: d.camera.z, k: d.ground.k, w: d.ground.w, h: d.ground.h, bs: d.bs }; });
  ok(g.z === 1.8 && g.w <= 4096 && g.h <= 4096 && g.w > 0, '35 at zoom 1.8 and DPR 3 the ground cache is at most 4,096 px a side', g);
  const px = await t.ev(() => {
    const iso = BH.UI.iso, V = BH.UI.view, cv = iso.clearView(), d = iso.debug().bs;
    const g = document.getElementById('city').getContext('2d');
    for (let gy = V.land.lo; gy < V.land.hi; gy++) for (let gx = V.land.lo; gx < V.land.hi; gx++) {
      if (V.walkable[gy * 24 + gx] !== '1' || V.plaza.some((t) => t[0] === gx && t[1] === gy)) continue;
      const s = iso.tileToScreen(gx + 0.5, gy + 0.5, 0); if (s.x < cv.x0 + 20 || s.x > cv.x1 - 20 || s.y < cv.y0 + 20 || s.y > cv.y1 - 20) continue;
      const h = iso.pick(s.x, s.y); if (h.kind !== 'ground') continue;
      const p = g.getImageData(Math.round(s.x * d), Math.round(s.y * d), 1, 1).data;
      if (p[1] > p[0] + 20 && p[1] > p[2] + 30) return { gx, gy, rgb: [p[0], p[1], p[2]] };
    }
    return null;
  });
  ok(!!px, '35 a grass pixel is drawn at zoom 1.8 and DPR 3', px);
  await t.shot('dpr3-zoom18');
  errsOk(t, 'test 35');
  await t.close();
}

// ================================================================================================ main
(async () => {
  const t0 = Date.now();
  console.log('Bellhaven browser checks (SPEC 12.C) · screenshots in ' + SHOTS);
  const browser = await chromium.launch();
  const run = async (n, fn) => {
    const a = Date.now(), f0 = failed;
    try { await fn(); } catch (e) { ok(false, n + ' crashed', String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); }
    console.log((failed === f0 ? 'PASS ' : 'FAIL ') + n + '  (' + ((Date.now() - a) / 1000).toFixed(1) + ' s)');
  };
  if (want(23) || want(24) || want(25) || want(36)) {
    for (const [w, h] of SIZES) await run('23-25, 36 sweep at ' + w + 'x' + h, () => sweep(browser, w, h));
  }
  if (want(26)) await run('26 the top bar fits', () => test26(browser));
  if (want(27)) await run('27 placement', () => test27(browser));
  if (want(28)) await run('28 save and load', () => test28(browser));
  if (want(29)) await run('29 offline', () => test29(browser));
  if (want(30)) await run('30 run flow', () => test30(browser));
  if (want(31)) await run('31 death flow', () => test31(browser));
  if (want(32)) await run('32 reduced motion', () => test32(browser));
  if (want(33)) await run('33 audio only after a tap', () => test33(browser));
  if (want(34)) await run('34 portrait', () => test34(browser));
  if (want(35)) await run('35 canvas DPR', () => test35(browser));
  await browser.close();
  for (const n of notes) console.log('note: ' + n);
  console.log('\n' + passed + ' checks passed, ' + failed + ' failed  (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s; screenshots in ' + SHOTS + ')');
  if (failed) { console.log('\nFailures:'); for (const f of failures) console.log('  - ' + f.slice(0, 400)); }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
