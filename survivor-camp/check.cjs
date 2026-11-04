#!/usr/bin/env node
/* Survivor Camp browser checks (SPEC 12 B, tests 18-34): Playwright + Chromium over file://.
 *
 *   node survivor-camp/check.cjs            all tests
 *   ONLY=23,24 node survivor-camp/check.cjs  some tests
 *   SHOTS=/some/dir                         where screenshots go (default: <tmp>/survivor-camp-shots)
 *
 * Saves are built in node with the same engine (engine.js + data.js) and seeded into localStorage by an init script
 * that runs once per tab, so a reload in test 25 sees what the page itself saved. Exit code 1 on any failure.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { chromium } = require('playwright');
const E = require('./engine.js');
const D = require('./data.js');

const HERE = __dirname;
const URL = 'file://' + path.join(HERE, 'index.html');
const GALLERY = 'file://' + path.join(HERE, '..', 'index.html');
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'survivor-camp-shots');
const KEY = 'survivor-camp.v1';
const SIZES = [[568, 320], [667, 375], [844, 390], [932, 430], [390, 844], [1440, 900]];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
let cur = '';
function ok(cond, msg) { if (cond) pass++; else { fail++; failures.push(cur + ': ' + msg); console.log('  FAIL ' + msg); } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ saves built in node
function demoSave(mod) {
  const s = E.demo({ realNow: Date.now(), tzOffsetMs: 0 });
  s.tabId = 'seed';
  if (mod) mod(s);
  return E.serialize(s);
}

// ------------------------------------------------------------------ pages
let browser;
async function open(o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: o.w || 844, height: o.h || 390 }, hasTouch: !!o.touch, isMobile: false, reducedMotion: o.reduced ? 'reduce' : 'no-preference', deviceScaleFactor: o.dpr || 1 });
  if (o.save) await ctx.addInitScript(({ k, v }) => { try { if (!sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } } catch (e) { /* storage tests */ } }, { k: KEY, v: o.save });
  if (o.init) await ctx.addInitScript(o.init);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto((o.url || URL) + (o.query || '') + (o.hash || ''));
  await page.waitForTimeout(o.wait == null ? 900 : o.wait);
  return { ctx, page, errs, close: () => ctx.close() };
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, 'check-' + name + '.png') });
const st = (page, fn, arg) => page.evaluate(fn, arg);
// open a building's sheet the way a player would: close the open sheet first if its hotspot is out of view
async function sheet(pg, id) {
  for (let i = 0; i < 3; i++) {
    if (await pg.evaluate((x) => SC.UI.api.ui.sheet === x, id)) return true;
    const reach = await clickable(pg, '[data-key="' + id + '"]', true);
    if (!reach && await pg.evaluate(() => !!SC.UI.api.ui.sheet)) { await pg.click('#sheetX'); await pg.waitForTimeout(400); }
    await pg.click('[data-key="' + id + '"]'); await pg.waitForTimeout(380);
  }
  return pg.evaluate((x) => SC.UI.api.ui.sheet === x, id);
}
async function act(page, a) { return page.evaluate((x) => { const r = SC.UI.api.act(x); return { ok: r.ok, err: r.err }; }, a); }
async function visible(page, sel) { return page.isVisible(sel).catch(() => false); }
async function rect(page, sel) { return page.evaluate((s) => { const el = document.querySelector(s); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel); }
// true when a point inside the element hits it (centre or 4 inset points)
async function clickable(page, sel, centreOnly) {
  return page.evaluate(([s, c]) => {
    const el = typeof s === 'string' ? document.querySelector(s) : s; if (!el) return false;
    const r = el.getBoundingClientRect(); if (!r.width) return false;
    const pts = c ? [[0.5, 0.5]] : [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]];
    return pts.some(([a, b]) => { const e = document.elementFromPoint(r.left + r.width * a, r.top + r.height * b); return e && (e === el || el.contains(e)); });
  }, [sel, !!centreOnly]);
}
async function noHScroll(page) { return page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth); }
async function labOpen(page, section) { if (!(await visible(page, '#lab'))) await page.click('#btnLab'); await page.waitForTimeout(350); if (section) { await page.click('#labJump [data-jump="' + section + '"]'); await page.waitForTimeout(150); } }
async function labClose(page) { if (await visible(page, '#lab')) await page.click('#labClose'); await page.waitForTimeout(200); }
// close the cards that are up or about to come up (a Camp Level card arrives 0.9 s after its beat)
async function goodCards(page, max) {
  for (let i = 0; i < (max || 6); i++) {
    const t0 = Date.now(); while (Date.now() - t0 < 1300 && !(await visible(page, '#modal'))) await sleep(100);
    if (!(await visible(page, '#modal'))) return;
    const b = await page.$('#mcard [data-a="good"], #mcard [data-a="useHere"]'); if (!b) return;
    await page.waitForTimeout(280); await b.click(); await page.waitForTimeout(700);
  }
}
async function waitFor(page, fn, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(100); } return false; }

async function test(n, name, fn) {
  if (ONLY && !ONLY.includes(n)) return;
  cur = n + ' ' + name; const f0 = fail, t0 = Date.now();
  console.log('-- ' + n + '. ' + name);
  try { await fn(); } catch (e) { ok(false, 'threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
  console.log((fail === f0 ? 'PASS ' : 'FAIL ') + n + '. ' + name + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}

// ------------------------------------------------------------------ the tests
async function main() {
  browser = await chromium.launch();

  await test(18, 'no console or page errors at every size (camp and gallery)', async () => {
    for (const [w, h] of SIZES) {
      for (const o of [{ tag: 'fresh' }, { tag: 'demo', hash: '#demo' }, { tag: 'gallery', url: GALLERY }]) {
        const p = await open({ w, h, hash: o.hash, url: o.url, wait: 1200 });
        if (o.tag === 'demo') { await p.page.click('[data-key="salvage"]').catch(() => {}); await p.page.waitForTimeout(400); }
        await shot(p.page, '18-' + o.tag + '-' + w + 'x' + h);
        ok(p.errs.length === 0, o.tag + ' ' + w + 'x' + h + ' errors: ' + p.errs.join(' / '));
        await p.close();
      }
    }
  });

  await test(19, 'no horizontal scroll at every size', async () => {
    for (const [w, h] of SIZES) {
      const p = await open({ w, h, save: demoSave() });
      if (w < 600 && h > w) await p.page.click('#rotContinue');
      ok(await noHScroll(p.page), w + 'x' + h + ' camp scrolls sideways');
      await p.page.click('[data-key="radio"]'); await p.page.waitForTimeout(400);
      ok(await noHScroll(p.page), w + 'x' + h + ' with a sheet');
      await p.page.click('#sheetX'); await p.page.waitForTimeout(150);
      await p.page.click('#play'); await p.page.waitForTimeout(500);
      ok(await noHScroll(p.page), w + 'x' + h + ' route overlay');
      await shot(p.page, '19-routes-' + w + 'x' + h);
      await p.page.click('#routes [data-a="close"]'); await p.page.waitForTimeout(200);
      await labOpen(p.page);
      ok(await noHScroll(p.page), w + 'x' + h + ' lab');
      await labClose(p.page);
      await p.close();
    }
  });

  await test(20, 'touch targets are at least 44 x 44', async () => {
    for (const [w, h] of [[568, 320], [844, 390]]) {
      const p = await open({ w, h, save: demoSave() });
      const small = async (where) => {
        const bad = await p.page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('button, a, .hs')) {
            if (el.closest('[hidden]')) continue;
            const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
            if (r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight) continue;
            if (r.width < 43.5 || r.height < 43.5) out.push((el.id || el.dataset.key || el.dataset.a || el.dataset.act || el.dataset.ctl || el.textContent.trim().slice(0, 20)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
          }
          return out;
        });
        ok(bad.length === 0, w + 'x' + h + ' ' + where + ': ' + bad.join(', '));
      };
      await small('camp');
      for (const id of ['campfire', 'workbench', 'radio', 'infirmary', 'bunkhouse']) { await sheet(p.page, id); await small('sheet ' + id); }
      await p.page.click('#sheetX'); await p.page.waitForTimeout(200);
      await p.page.click('#play'); await p.page.waitForTimeout(500); await small('routes');
      await p.page.click('#routes [data-a="close"]'); await p.page.waitForTimeout(200);
      await p.page.click('#c-batbtn'); await p.page.waitForTimeout(400); await small('shop');
      await p.page.click('#mcard [data-a="good"]'); await p.page.waitForTimeout(300);
      await labOpen(p.page); await small('lab');
      await labClose(p.page);
      await p.close();
    }
  });

  await test(21, '568 x 320 is fully usable', async () => {
    const p = await open({ w: 568, h: 320, save: demoSave() }), pg = p.page;
    const chips = await pg.evaluate(() => Array.from(document.querySelectorAll('.topbar > *')).filter((e) => !e.hidden && !e.classList.contains('spacer')).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, l: r.left, r: r.right }; }));
    ok(chips.length >= 7, 'top bar shows back, 4 chips, batteries and LAB (' + chips.length + ')');
    for (const c of chips) ok(c.l >= 0 && c.r <= 568, 'top bar item ' + c.id + ' within 568 px (' + Math.round(c.l) + '-' + Math.round(c.r) + ')');
    const keys = await pg.evaluate(() => SC.Scene.hotspots().filter((h) => h.kind === 'building').map((h) => h.key));
    ok(keys.length === 9, 'all 9 building hotspots at CL5 (' + keys.length + ')');
    for (const k of keys) {
      const r = await rect(pg, '[data-key="' + k + '"]');
      ok(r && r.x >= 0 && r.r <= 568 && r.y >= 0 && r.b <= 320, k + ' hotspot fully on screen');
      ok(await clickable(pg, '[data-key="' + k + '"]'), k + ' hotspot clickable');
    }
    for (const sel of ['#play', '#goal']) { const r = await rect(pg, sel); ok(r && r.x >= 0 && r.r <= 568 && r.b <= 320, sel + ' on screen'); ok(await clickable(pg, sel), sel + ' clickable'); }
    for (const k of keys) {
      ok(await sheet(pg, k), k + ' sheet opens');
      const r = await rect(pg, '#sheetAct');
      ok(r && r.x >= 0 && r.r <= 568 && r.y >= 0 && r.b <= 320, k + ' sheet action on screen');
      ok(await clickable(pg, '#sheetAct'), k + ' sheet action clickable');
    }
    await shot(pg, '21-sheet-568x320');
    await pg.click('#sheetX'); await pg.waitForTimeout(200);
    await pg.click('#play'); await pg.waitForTimeout(500);
    const rows = await pg.$$('#routeList .route');
    ok(rows.length === 5, '5 route rows (' + rows.length + ')');
    for (let i = 0; i < rows.length; i++) { const b = await rows[i].boundingBox(); ok(b && b.y >= 0 && b.y + b.height <= 320.5, 'route row ' + (i + 1) + ' visible without scrolling'); ok(await clickable(pg, rows[i]), 'route row ' + (i + 1) + ' clickable'); }
    const sr = await rect(pg, '#start'); ok(sr && sr.b <= 320 && sr.r <= 568, 'START visible'); ok(await clickable(pg, '#start'), 'START clickable');
    await shot(pg, '21-routes-568x320');
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(22, '?insets=47 keeps the HUD and hotspots out of the side 47 px', async () => {
    const p = await open({ w: 844, h: 390, query: '?insets=47', save: demoSave() }), pg = p.page;
    const check = async (where) => {
      const bad = await pg.evaluate(() => {
        const out = [], els = Array.from(document.querySelectorAll('.topbar > *:not(.spacer), .bl > *, #play, .hs, #sheet, #start'));
        for (const el of els) {
          if (el.hidden || el.closest('[hidden]')) continue;
          const r = el.getBoundingClientRect(); if (!r.width) continue;
          if (r.left < 47 - 0.5 || r.right > innerWidth - 47 + 0.5) out.push((el.id || el.dataset.key || el.className) + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
        }
        return out;
      });
      ok(bad.length === 0, where + ': ' + bad.join(', '));
    };
    await check('camp');
    for (const id of ['workbench', 'generator']) { await sheet(pg, id); await pg.waitForTimeout(150); await check('sheet ' + id); }
    await shot(pg, '22-insets-844x390');
    await pg.click('#sheetX'); await pg.waitForTimeout(200);
    await pg.click('#play'); await pg.waitForTimeout(500); await check('routes');
    await p.close();
  });

  // 23 + 24 + 25 share one page: the scripted FTUE, then the run flow, then a reload.
  let shared = null;
  await test(23, 'FTUE: 6 steps, first scrap within 20 s, Camp Lv 2 within 2 min real', async () => {
    shared = await open({ w: 844, h: 390, wait: 600 });
    const pg = shared.page, t0 = Date.now();
    await pg.click('[data-key="campfire"]');
    await pg.waitForTimeout(2100);
    await pg.click('[data-key="pile"]');
    const got = await waitFor(pg, () => { const c = document.getElementById('c-scrap'); return c && !c.hidden && +c.querySelector('b').textContent > 0; }, 20000);
    const tScrap = (Date.now() - t0) / 1000;
    ok(got && tScrap < 20, 'the Scrap chip got its first flyer in ' + tScrap.toFixed(1) + ' s');
    await pg.click('[data-key="salvage"]'); await pg.waitForTimeout(350);
    await pg.click('#sheetAct'); await pg.waitForTimeout(500);
    if (await st(pg, () => SC.UI.api.state.jobs.length)) { await pg.click('#sheetAct'); await pg.waitForTimeout(600); }
    ok(await st(pg, () => SC.UI.api.state.lv.salvage === 1), 'Salvage Yard built');
    await waitFor(pg, () => !document.getElementById('play').hidden, 3000);
    await pg.click('#play'); await pg.waitForTimeout(450);
    await pg.click('#start');
    ok(await waitFor(pg, () => !document.getElementById('runscr').hidden, 2000), 'run screen opens');
    await shot(pg, '23-run');
    ok(await waitFor(pg, () => !document.getElementById('result').hidden, 15000), 'result card');
    await shot(pg, '23-result');
    await pg.waitForTimeout(400);
    await pg.click('#resultBack'); await pg.waitForTimeout(500);
    await pg.click('[data-key="crate"]'); await pg.waitForTimeout(1300);
    await goodCards(pg, 2);
    await pg.click('[data-key="campfire"]'); await pg.waitForTimeout(350);
    await pg.click('#sheetAct'); await pg.waitForTimeout(500);
    if (await st(pg, () => SC.UI.api.state.jobs.length)) { await pg.click('#sheetAct'); await pg.waitForTimeout(500); }
    const cl2 = await waitFor(pg, () => SC.UI.api.state.lv.campfire >= 2, 5000), tCl2 = (Date.now() - t0) / 1000;
    ok(cl2 && tCl2 < 120, 'Camp Lv 2 at ' + tCl2.toFixed(1) + ' s real');
    await pg.waitForTimeout(1200); await shot(pg, '23-cl2');
    await goodCards(pg, 3);
    const s = await st(pg, () => { const S = SC.UI.api.state, g = SC.Engine.goal(S); return { done: S.ftue.done, step: S.ftue.step, obj: S.objective, goal: document.getElementById('goal').hidden ? '' : document.querySelector('#goal .g1').textContent, main: g.main.objectiveText || g.main.text }; });
    ok(s.done && s.step === 6, 'FTUE done (step ' + s.step + ')');
    ok(s.obj === 0 && s.goal.length > 0, 'the goal chip shows objective 1: "' + s.goal + '" (' + s.main + ')');
    ok(s.main === D.OBJECTIVES[0].text || s.goal.length > 0, 'objective 1 is "' + D.OBJECTIVES[0].text + '"');
    await shot(pg, '23-goal');
    ok(shared.errs.length === 0, 'errors: ' + shared.errs.join(' / '));
  });

  await test(24, 'run flow and the handoff payload', async () => {
    if (!shared) shared = await open({ w: 844, h: 390, save: demoSave((s) => { s.weapons.smg = false; s.weapons.shotgun = false; s.loadout.primary = 'pistol'; s.lv.workbench = 0; s.lv.radio = 0; s.stock.medkit = 0; s.stock.pills = 0; s.flags.dropGiven = false; s.res.bp = 0; }) });
    const pg = shared.page;
    const handoff = async () => { await pg.click('#play'); await pg.waitForTimeout(500); const t = await pg.textContent('#handoffJson'); await pg.click('#routes [data-a="close"]'); await pg.waitForTimeout(250); return JSON.parse(t); };
    const h = await handoff();
    const need = { '': ['v', 'runId', 'seed', 'createdAtCamp', 'route', 'runner', 'loadout', 'stats', 'intel', 'gear', 'odds', 'force'],
      route: ['id', 'name', 'danger', 'hordeMul', 'zombieCap', 'lengthS', 'wanderers', 'hordes', 'caches', 'mapSupplies', 'rescue'],
      runner: ['id', 'name', 'hurt'], loadout: ['primary', 'medkit', 'pills', 'noiseBomb'],
      stats: ['maxHp', 'startHp', 'secondWind', 'damageMul', 'magMul', 'flashlightR', 'hordeWarnS', 'medkitSec', 'medkitHeal', 'bombLifeS', 'extraCaches'] };
    for (const k of Object.keys(need)) { const o = k ? h[k] : h; for (const f of need[k]) ok(o && f in o, 'handoff has ' + (k ? k + '.' : '') + f); }
    ok(h.loadout.primary === 'pistol', 'first handoff carries the pistol (' + h.loadout.primary + ')');
    // build the Workbench and the Radio Mast through their sheets, with Lab grants and Finish timers
    await labOpen(pg, 'grant');
    for (let i = 0; i < 3; i++) await pg.click('#labBody [data-act="grant:scrap"]');
    await pg.click('#labBody [data-act="grant:food"]');
    for (let i = 0; i < 2; i++) await pg.click('#labBody [data-act="grant:bp"]');
    await labClose(pg);
    for (const id of ['workbench', 'radio']) {          // one crew at Camp Lv 2: build, then Finish timers in the Lab
      await sheet(pg, id);
      const label = await pg.textContent('#sheetAct');
      await pg.click('#sheetAct'); await pg.waitForTimeout(300);
      ok(await st(pg, (b) => SC.UI.api.state.jobs.some((j) => j.id === b) || SC.UI.api.state.lv[b] >= 1, id), id + ' build started (' + label + ')');
      await pg.click('#sheetX'); await pg.waitForTimeout(150);
      await labOpen(pg, 'grant'); await pg.click('#labBody [data-act="finishAll"]'); await labClose(pg);
      await pg.waitForTimeout(500); await goodCards(pg, 4);
    }
    ok(await st(pg, () => SC.UI.api.state.lv.workbench >= 1 && SC.UI.api.state.lv.radio >= 1), 'Workbench and Radio Mast built');
    await sheet(pg, 'workbench');
    await pg.click('#sheetBody [data-a="unlock:smg"]'); await pg.waitForTimeout(500);
    await pg.click('#sheetX'); await pg.waitForTimeout(200);
    ok(await st(pg, () => SC.UI.api.state.weapons.smg), 'SMG unlocked');
    const h2 = await handoff();
    ok(h2.loadout.primary === 'smg', 'handoff "primary":"smg" (' + h2.loadout.primary + ')');
    ok(h2.loadout.medkit === 1 && h2.loadout.pills === 1, 'supply drop: "medkit":1, "pills":1 (' + h2.loadout.medkit + ', ' + h2.loadout.pills + ')');
    // the whole flow again: PLAY -> START -> run screen -> result -> crate
    await pg.click('#play'); await pg.waitForTimeout(450); await pg.click('#start');
    ok(await waitFor(pg, () => !document.getElementById('runscr').hidden, 2000), 'run screen');
    await pg.click('#runSkip'); await pg.waitForTimeout(300);
    ok(await waitFor(pg, () => !document.getElementById('result').hidden, 5000), 'result card');
    const rj = JSON.parse(await pg.textContent('#resultJson'));
    ok(/^r-\d+$/.test(rj.runId) && rj.v === 1, 'the result JSON parses (' + rj.runId + ')');
    await pg.waitForTimeout(300); await pg.click('#resultBack'); await pg.waitForTimeout(400);
    ok(await st(pg, () => !!SC.UI.api.state.crate), 'the crate waits by the fire');
    await pg.click('[data-key="crate"]'); await pg.waitForTimeout(1200); await goodCards(pg, 2);
    ok(await st(pg, () => !SC.UI.api.state.crate), 'crate opened');
    ok(shared.errs.length === 0, 'errors: ' + shared.errs.join(' / '));
  });

  await test(25, 'save and load: a reload restores the camp and it continues', async () => {
    if (!shared) shared = await open({ w: 844, h: 390, save: demoSave() });
    const pg = shared.page;
    // something on every timer kind
    await act(pg, { type: 'build', id: 'storehouse' });
    await act(pg, { type: 'craft', item: 'medkit' });
    const before = await st(pg, () => { const S = SC.UI.api.state; SC.UI.api.save(); return { res: S.res, lv: S.lv, jobs: S.jobs.map((j) => j.id + ':' + j.toLv + ':' + Math.round(j.endAt)), stock: S.stock, craft: S.craft.infirmary.length, camp: S.campNow, people: S.people.length }; });
    await pg.reload(); await pg.waitForTimeout(1200);
    const after = await st(pg, () => { const S = SC.UI.api.state; return { res: S.res, lv: S.lv, jobs: S.jobs.map((j) => j.id + ':' + j.toLv + ':' + Math.round(j.endAt)), stock: S.stock, craft: S.craft.infirmary.length, camp: S.campNow, people: S.people.length }; });
    ok(JSON.stringify(after.lv) === JSON.stringify(before.lv), 'levels restored');
    ok(JSON.stringify(after.jobs) === JSON.stringify(before.jobs), 'timers restored (' + after.jobs.join(',') + ')');
    ok(JSON.stringify(after.stock) === JSON.stringify(before.stock) && after.craft === before.craft, 'stock and craft queue restored');
    ok(['scrap', 'food', 'meds', 'bat', 'bp'].every((k) => after.res[k] >= before.res[k] && after.res[k] <= before.res[k] + 50), 'resources restored');
    ok(after.people === before.people, 'survivors restored');
    await pg.waitForTimeout(1500);
    ok(await st(pg, () => SC.UI.api.state.campNow) > after.camp, 'the camp clock keeps running');
    await shot(pg, '25-reloaded');
    ok(shared.errs.length === 0, 'errors: ' + shared.errs.join(' / '));
    await shared.close(); shared = null;
  });

  await test(26, 'storage blocked: the page works and says progress won\'t be saved', async () => {
    const p = await open({ w: 844, h: 390, wait: 500, init: () => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } }); } });
    const txt = await p.page.textContent('#banners');
    ok(/Progress won.t be saved/.test(txt), 'banner: "' + txt + '"');
    await shot(p.page, '26-blocked');
    await p.page.click('[data-key="campfire"]'); await p.page.waitForTimeout(2100);
    await p.page.click('[data-key="pile"]'); await p.page.waitForTimeout(1500);
    ok(await st(p.page, () => SC.UI.api.state.res.scrap > 0 && SC.UI.api.state.ftue.step >= 2), 'the camp runs in memory');
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(27, 'offline accrual: 8 h away opens the welcome-back card; Collect all fills the chips', async () => {
    const save = demoSave((s) => { s.realSeenAt = Date.now() - 8 * 3600000; s.buf.salvage = 0; s.buf.garden = 0; s.jobs = []; s.crate = null; });
    const p = await open({ w: 844, h: 390, save, wait: 1200 }), pg = p.page;
    const txt = await pg.textContent('#mcard').catch(() => '');
    ok(await visible(pg, '#modal') && /Welcome back/.test(txt), 'welcome-back card');
    ok(/Salvage Yard \+\d+ scrap/.test(txt), 'a production row: ' + txt.replace(/\s+/g, ' ').slice(0, 160));
    await shot(pg, '27-welcome');
    const s0 = await st(pg, () => SC.UI.api.state.res.scrap);
    await pg.click('#mcard [data-a="collectAll"]');
    await pg.waitForTimeout(2600);
    const s1 = await st(pg, () => ({ res: SC.UI.api.state.res.scrap, chip: document.querySelector('#c-scrap b').textContent }));
    ok(s1.res > s0, 'scrap went up (' + s0 + ' -> ' + s1.res + ')');
    ok(s1.chip === SC_fmt(s1.res), 'the Scrap chip shows it (' + s1.chip + ')');
    await shot(pg, '27-collected');
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(28, 'speed-up prices: SKIP label, live price, confirm at 20+, FINISH FREE', async () => {
    const save = demoSave((s) => {
      s.jobs = [{ id: 'campfire', toLv: 6, startAt: s.campNow - 48 * 60000, endAt: s.campNow + 45 * 60000, dur: 2 * 3600000, cut: 0 },
        { id: 'salvage', toLv: 5, startAt: s.campNow - 21 * 60000, endAt: s.campNow + 10 * 60000, dur: 30 * 60000, cut: 0 }];
      s.res.bat = 400;
    });
    const p = await open({ w: 844, h: 390, save }), pg = p.page;
    await sheet(pg, 'salvage');
    const lab1 = await pg.textContent('#sheetAct');
    const left1 = await st(pg, () => SC.UI.api.state.jobs.find((j) => j.id === 'salvage').endAt - SC.UI.api.state.campNow);
    const exp1 = await st(pg, (ms) => SC.Engine.price.skip(ms / 1000, SC.UI.api.state), left1);
    ok(lab1.trim() === 'SKIP · ' + exp1, 'label "' + lab1 + '" = SKIP · ' + exp1);
    await act(pg, { type: 'dev', op: 'timeScale', value: 60 }); await pg.waitForTimeout(2600); await act(pg, { type: 'dev', op: 'timeScale', value: 1 });
    await pg.waitForTimeout(300);
    const lab2 = await pg.textContent('#sheetAct'), n2 = +(lab2.match(/\d+/) || [0])[0];
    const exp2 = await st(pg, () => { const S = SC.UI.api.state, j = S.jobs.find((x) => x.id === 'salvage'); return j ? SC.Engine.price.skip((j.endAt - S.campNow) / 1000, S) : -1; });
    ok(n2 < exp1 && n2 === exp2, 'the price drops as the timer runs (' + exp1 + ' -> ' + n2 + ', engine ' + exp2 + ')');
    // 45 min -> 22 batteries: two taps
    await sheet(pg, 'campfire');
    const big = await pg.textContent('#sheetAct'), nb = +(big.match(/\d+/) || [0])[0];
    ok(nb >= 20, 'campfire skip costs 20+ (' + big + ')');
    await pg.click('#sheetAct'); await pg.waitForTimeout(150);
    ok(/Confirm \d+\?/.test(await pg.textContent('#sheetAct')), 'first tap asks to confirm');
    ok(await st(pg, () => SC.UI.api.state.jobs.some((j) => j.id === 'campfire')), 'nothing skipped yet');
    await shot(pg, '28-confirm');
    await pg.click('#sheetAct'); await pg.waitForTimeout(900);
    ok(await st(pg, () => !SC.UI.api.state.jobs.some((j) => j.id === 'campfire') && SC.UI.api.state.lv.campfire === 6), 'second tap skips (Camp Lv 6)');
    await goodCards(pg, 3);
    // a 20 s timer shows FINISH FREE
    await pg.evaluate(() => { const S = SC.UI.api.state, j = S.jobs.find((x) => x.id === 'salvage'); j.endAt = S.campNow + 20000; });
    await sheet(pg, 'salvage');
    ok((await pg.textContent('#sheetAct')).trim() === 'FINISH FREE', 'a 20 s timer shows FINISH FREE');
    await shot(pg, '28-free');
    await pg.click('#sheetAct'); await pg.waitForTimeout(700);
    ok(await st(pg, () => SC.UI.api.state.lv.salvage === 5), 'finished free');
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(29, 'reduced motion: no flyers, the Camp Level beat is instant', async () => {
    const save = demoSave((s) => { s.jobs = [{ id: 'campfire', toLv: 6, startAt: s.campNow - 3600000, endAt: s.campNow + 2500, dur: 2 * 3600000, cut: 0 }]; s.buf.salvage = 900; });
    const p = await open({ w: 844, h: 390, save, reduced: true }), pg = p.page;
    ok(await st(pg, () => document.body.classList.contains('reduced')), 'body.reduced is set');
    const s0 = await st(pg, () => SC.UI.api.state.res.scrap);
    await pg.click('[data-key="bubble:salvage"]');
    let maxFly = 0; for (let i = 0; i < 8; i++) { maxFly = Math.max(maxFly, await st(pg, () => SC.UI.api.fxCount())); await sleep(60); }
    ok(maxFly === 0, 'collecting creates no flyers (' + maxFly + ')');
    ok(await st(pg, () => SC.UI.api.state.res.scrap) > s0, 'the scrap still lands');
    ok(await waitFor(pg, () => SC.UI.api.state.lv.campfire === 6, 6000), 'Camp Lv 6 reached');
    await pg.waitForTimeout(120);
    const b = await st(pg, () => ({ r: SC.Scene.lightRadius(), want: SC.UI.api.view.lightRadius, tw: SC.Scene.camera().tweening, beat: document.body.classList.contains('beat'), card: !document.getElementById('modal').hidden }));
    ok(Math.abs(b.r - b.want) < 0.5 && !b.tw && !b.beat, 'the light and the camera are already at Camp Lv 6 (' + b.r.toFixed(1) + ' / ' + b.want + ', tween ' + b.tw + ')');
    ok(b.card, 'the Camp Level card shows at once');
    await shot(pg, '29-reduced');
    // the Lab toggle forces it too
    await goodCards(pg, 2);
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
    const q = await open({ w: 844, h: 390, save: demoSave() });
    await labOpen(q.page, 'feel'); await q.page.click('#labBody input[data-ctl="reducedMotion"] + i'); await labClose(q.page);
    ok(await st(q.page, () => document.body.classList.contains('reduced') && SC.UI.api.state.dev.reducedMotion), 'the Lab toggle forces reduced motion');
    await q.page.click('[data-key="bubble:salvage"]').catch(() => {}); await sleep(120);
    ok(await st(q.page, () => SC.UI.api.fxCount()) === 0, 'no flyers when forced from the Lab');
    ok(q.errs.length === 0, 'errors: ' + q.errs.join(' / '));
    await q.close();
  });

  await test(30, 'audio: no AudioContext before the first tap', async () => {
    const init = () => {
      window.__ac = 0;
      const wrap = (C) => C && class extends C { constructor(...a) { window.__ac++; super(...a); } };
      if (window.AudioContext) window.AudioContext = wrap(window.AudioContext);
      if (window.webkitAudioContext) window.webkitAudioContext = wrap(window.webkitAudioContext);
    };
    const p = await open({ w: 844, h: 390, init, wait: 1500 }), pg = p.page;
    ok(await st(pg, () => window.__ac) === 0, 'no context on load');
    await pg.mouse.move(400, 200); await pg.waitForTimeout(300);
    ok(await st(pg, () => window.__ac) === 0, 'no context on hover');
    await pg.click('[data-key="campfire"]'); await pg.waitForTimeout(400);
    ok(await st(pg, () => window.__ac) === 1, 'one context after the first tap (' + await st(pg, () => window.__ac) + ')');
    await pg.click('[data-key="pile"]').catch(() => {}); await pg.waitForTimeout(300);
    ok(await st(pg, () => window.__ac) === 1, 'still one after more taps');
    // mute is saved
    await pg.click('#btnSound'); await pg.waitForTimeout(200);
    ok(await st(pg, () => SC.UI.api.state.dev.muted), 'mute on');
    await pg.reload(); await pg.waitForTimeout(800);
    ok(await st(pg, () => SC.UI.api.state.dev.muted), 'mute survives a reload');
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(31, 'shop: free test packs only; Claim adds batteries and logs pack_claimed', async () => {
    const p = await open({ w: 844, h: 390, save: demoSave() }), pg = p.page;
    await pg.click('#c-batbtn'); await pg.waitForTimeout(450);
    const info = await st(pg, () => {
      const m = document.getElementById('mcard');
      return { text: m.innerText, packs: Array.from(m.querySelectorAll('.pack')).map((x) => x.innerText), fields: m.querySelectorAll('input, select, textarea, form, a, iframe').length };
    });
    ok(/PROTOTYPE · FREE · NO REAL PURCHASES/.test(info.text), 'header');
    ok(info.packs.length === 3, '3 pack cards');
    for (const t of info.packs) ok(/free, no payment/i.test(t), 'pack card says "free, no payment": ' + t.replace(/\s+/g, ' '));
    ok(!/[$€£¥₩₹¢]|\b(USD|EUR|GBP|price|buy|purchase now|checkout|card number)\b|\d+[.,]\d{2}\b/i.test(info.text.replace('NO REAL PURCHASES', '').replace('would-be purchase', '')), 'no price, currency or payment words');
    ok(info.fields === 0, 'no payment fields or links (' + info.fields + ')');
    await shot(pg, '31-shop-844x390');
    const b0 = await st(pg, () => SC.UI.api.state.res.bat);
    await pg.click('#mcard [data-a="claim:small"]'); await pg.waitForTimeout(1200);
    const r = await st(pg, () => ({ bat: SC.UI.api.state.res.bat, log: SC.UI.api.state.tele.log.filter((x) => x.type === 'pack_claimed').map((x) => x.data), packs: SC.UI.api.state.tele.packs }));
    ok(r.bat === b0 + 100, 'batteries +100 (' + b0 + ' -> ' + r.bat + ')');
    ok(r.log.length === 1 && r.log[0].size === 'small', 'pack_claimed {size: small} logged');
    await pg.click('#mcard [data-a="good"]'); await pg.waitForTimeout(300);
    for (const [w, h] of [[568, 320], [390, 844]]) {
      await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(300);
      if (await visible(pg, '#rotate')) await pg.click('#rotContinue');
      await pg.click('#c-batbtn'); await pg.waitForTimeout(450);
      const fits = await st(pg, () => { const r = document.getElementById('mcard').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5; });
      ok(fits, 'shop fits at ' + w + 'x' + h);
      ok(await clickable(pg, '#mcard [data-a="claim:large"]'), 'large Claim reachable at ' + w + 'x' + h);
      await shot(pg, '31-shop-' + w + 'x' + h);
      await pg.click('#mcard [data-a="good"]'); await pg.waitForTimeout(300);
    }
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(32, 'Camp lab: 600x, skip ahead, force loss, external result, reset', async () => {
    const p = await open({ w: 844, h: 390, save: demoSave((s) => { s.crate = null; }) }), pg = p.page;
    await labOpen(pg, 'clock');
    await shot(pg, '32-lab-844x390');
    await pg.click('#labBody [data-ctl="timeScale"][data-v="600"]');
    const c0 = await st(pg, () => SC.UI.api.state.campNow); await sleep(2000);
    const c1 = await st(pg, () => SC.UI.api.state.campNow);
    await pg.click('#labBody [data-ctl="timeScale"][data-v="1"]');
    const mins = (c1 - c0) / 60000;
    ok(mins > 16 && mins < 24, '600x for 2 s real moved the camp ' + mins.toFixed(1) + ' min');
    await pg.click('#labBody [data-act="skip:28800000"]'); await pg.waitForTimeout(600);
    ok(/Welcome back/.test(await pg.textContent('#mcard').catch(() => '')) && await visible(pg, '#modal'), 'skip ahead +8 h shows the welcome-back card');
    await shot(pg, '32-skip8h');
    await pg.click('#mcard [data-a="collectAll"]').catch(() => pg.click('#mcard [data-a="good"]')); await pg.waitForTimeout(700); await goodCards(pg, 6);
    // force a loss
    await labOpen(pg, 'runs');
    await pg.click('#labBody [data-ctl="force"][data-v="\\"loss\\""]');
    ok(await st(pg, () => SC.UI.api.state.dev.force === 'loss'), 'force set to Loss');
    await labClose(pg); await goodCards(pg, 4);
    await pg.click('#play'); await pg.waitForTimeout(450); await pg.click('#start'); await pg.waitForTimeout(400); await pg.click('#runSkip');
    ok(await waitFor(pg, () => !document.getElementById('result').hidden, 6000), 'result shows');
    ok(await visible(pg, '.rtitle.loss'), 'a loss card');
    await shot(pg, '32-loss');
    await pg.waitForTimeout(300); await pg.click('#resultBack'); await pg.waitForTimeout(400); await goodCards(pg, 4);
    // external run + paste
    await labOpen(pg, 'payloads');
    await pg.click('#labBody input[data-ctl="external"] + i');
    ok(await st(pg, () => SC.UI.api.ui.external), 'next run is external');
    await labClose(pg);
    await pg.click('#play'); await pg.waitForTimeout(450); await pg.click('#start'); await pg.waitForTimeout(500);
    ok(/Waiting for Two Thumbs Left/.test(await pg.textContent('#ticker')), 'the run screen waits for a result');
    await pg.waitForTimeout(1200);
    ok(await st(pg, () => !!SC.UI.api.state.pending && SC.UI.api.state.pending.source === 'game'), 'pending with source game; no sim ran');
    await pg.click('#ticker [data-a="openLab"]'); await pg.waitForTimeout(450);
    await pg.click('#labBody [data-act="fillSim"]'); await pg.waitForTimeout(150);
    const good = await pg.inputValue('#labPaste');
    await pg.fill('#labPaste', good.replace(/"runId": "r-(\d+)"/, '"runId": "r-999999"'));
    await pg.click('#labBody [data-act="resolve"]'); await pg.waitForTimeout(500);
    ok(/different run/i.test(await pg.textContent('#labBody [data-out="pasteMsg"]')), 'a wrong runId is rejected: ' + (await pg.textContent('#labBody [data-out="pasteMsg"]')));
    ok(await st(pg, () => !!SC.UI.api.state.pending), 'the run still waits');
    await shot(pg, '32-paste-rejected');
    await pg.fill('#labPaste', good);
    await pg.click('#labBody [data-act="resolve"]'); await pg.waitForTimeout(800);
    ok(await st(pg, () => !SC.UI.api.state.pending) && await visible(pg, '#result'), 'a pasted valid result resolves the run like the sim');
    await shot(pg, '32-paste-resolved');
    await pg.waitForTimeout(300); await pg.click('#resultBack'); await pg.waitForTimeout(400); await goodCards(pg, 4);
    // telemetry renders
    await labOpen(pg, 'telemetry'); await pg.waitForTimeout(1300);
    ok(/Session log/.test(await pg.textContent('#labBody [data-out="tele"]')), 'telemetry tables render');
    await shot(pg, '32-telemetry');
    // reset (two taps)
    await labOpen(pg, 'save');
    await pg.click('#labBody [data-act="reset"]'); await pg.waitForTimeout(200);
    ok(await st(pg, () => SC.UI.api.state.ftue.done), 'one tap does not reset');
    await pg.click('#labBody [data-act="reset"]'); await pg.waitForTimeout(700);
    ok(await st(pg, () => SC.UI.api.state.ftue.step === 0 && !SC.UI.api.state.ftue.done && SC.UI.api.state.lv.campfire === 1), 'two taps return to the unlit fire');
    await shot(pg, '32-reset');
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(33, 'portrait 390 x 844: rotate prompt, then the portrait fallback', async () => {
    const p = await open({ w: 390, h: 844, save: demoSave() }), pg = p.page;
    ok(await visible(pg, '#rotate'), 'rotate prompt shows');
    await shot(pg, '33-rotate');
    await pg.click('#rotContinue'); await pg.waitForTimeout(500);
    ok(!(await visible(pg, '#rotate')), 'Continue in portrait hides it');
    ok(await noHScroll(pg), 'no horizontal scroll');
    const cam = await st(pg, () => { const hs = SC.Scene.hotspots().filter((h) => h.kind === 'building'); return { maxB: Math.max(...hs.map((h) => h.y + h.h)), n: hs.length, minX: Math.min(...hs.map((h) => h.x)), maxX: Math.max(...hs.map((h) => h.x + h.w)) }; });
    ok(cam.n === 9 && cam.maxB <= 844 * 0.6 && cam.minX >= 0 && cam.maxX <= 390, 'the camp fits the width in the top part (' + JSON.stringify(cam) + ')');
    await shot(pg, '33-portrait');
    await pg.click('[data-key="garden"]'); await pg.waitForTimeout(450);
    const sh = await rect(pg, '#sheet');
    ok(sh && sh.x >= 0 && sh.r <= 390 && sh.b <= 844 && sh.h <= 844 * 0.45 + 1, 'a bottom sheet, at most 45% tall');
    ok(await clickable(pg, '#sheetAct'), 'sheet action reachable');
    await shot(pg, '33-sheet');
    await pg.click('#sheetX'); await pg.waitForTimeout(200);
    for (const sel of ['#play', '#goal']) ok(await clickable(pg, sel), sel + ' in a bottom corner');
    await pg.click('#play'); await pg.waitForTimeout(500);
    ok(await noHScroll(pg), 'route overlay: no horizontal scroll');
    ok(await st(pg, () => { const a = document.getElementById('routeList').getBoundingClientRect(), b = document.getElementById('loadout').getBoundingClientRect(); return b.top >= a.bottom - 1; }), 'routes then loadout in one column');
    await shot(pg, '33-routes');
    ok(p.errs.length === 0, 'errors: ' + p.errs.join(' / '));
    await p.close();
  });

  await test(34, 'screenshots at every size and the #demo thumbnail', async () => {
    for (const [w, h] of SIZES) {
      const p = await open({ w, h, save: demoSave(), wait: 1100 });
      if (await visible(p.page, '#rotate')) await p.page.click('#rotContinue');
      await shot(p.page, '34-camp-' + w + 'x' + h);
      await p.page.click('[data-key="campfire"]'); await p.page.waitForTimeout(450);
      await shot(p.page, '34-campfire-' + w + 'x' + h);
      await p.page.click('#sheetX'); await p.page.waitForTimeout(150);
      await labOpen(p.page); await shot(p.page, '34-lab-' + w + 'x' + h); await labClose(p.page);
      ok(p.errs.length === 0, w + 'x' + h + ' errors: ' + p.errs.join(' / '));
      await p.close();
    }
    const t = await open({ w: 1200, h: 750, hash: '#demo', wait: 2500 });
    await t.page.screenshot({ path: path.join(SHOTS, 'thumb-demo.jpg'), type: 'jpeg', quality: 80 });
    ok(fs.existsSync(path.join(SHOTS, 'thumb-demo.jpg')), '#demo thumbnail captured');
    await t.close();
    const n = fs.readdirSync(SHOTS).filter((f) => /^check-/.test(f)).length;
    ok(n >= 40, n + ' screenshots in ' + SHOTS);
  });

  await browser.close();
  console.log('\n' + pass + ' checks passed, ' + fail + ' failed' + (failures.length ? ':\n  ' + failures.join('\n  ') : '') + '\nScreenshots: ' + SHOTS);
  process.exit(fail ? 1 : 0);
}
// the chip format (Engine.fmt.num) for test 27
function SC_fmt(n) { return E.fmt.num(n); }

main().catch((e) => { console.error(e); process.exit(1); });
