/* Survivor Camp UI: the DOM side of the page (SPEC 5.8, 7, 8, 11.4).
 *
 * Owns: save/load (every localStorage access in try/catch), the frame loop (Engine.tick + Scene.draw), the HUD with
 * progressive reveal, hotspot <button>s, the building side sheet, the run flow (route + loadout overlay, simulated run
 * screen, result and loss cards, crate), the 6-step FTUE coach, the objective chip, cards and banners, and flyers on
 * the #fx canvas, the free prototype shop, the welcome-back, Camp Level, end and two-tab cards, the portrait fallback,
 * reduced motion and sound cues (SC.Sfx, created on the first tap). Every state change goes through Engine.act.
 *
 * The Camp lab lives in lab.js and plugs in through SC.UI.hooks.openLab; SC.UI.api exposes what it needs (state,
 * act, handle, cards, banners, flyers, the run screen, resolveWith for pasted results, reset and replace).
 */
(function (root, f) {
  const api = f(root.SC || {});
  if (typeof module === 'object' && module.exports) module.exports = api; else (root.SC = root.SC || {}).UI = api;
})(typeof self !== 'undefined' ? self : this, function (SC) {
  'use strict';
  if (typeof document === 'undefined') return {};
  const E = SC.Engine, D = SC.DATA, B = D.BUILDINGS, Scene = SC.Scene, fmt = E.fmt, Run = SC.Run;
  const KEY = 'survivor-camp.v1';
  const TAU = Math.PI * 2;
  const RES = ['scrap', 'food', 'meds'];
  const ITEMS = ['medkit', 'pills', 'bomb'];
  const ITEM_NAME = { medkit: 'Medkit', pills: 'Pills', bomb: 'Noise bomb' };
  const RES_NAME = { scrap: 'scrap', food: 'food', meds: 'meds', bat: 'batteries' };
  const RES_COL = { scrap: '#c9cdd2', food: '#a6d86e', meds: '#ff7b7b', bat: '#ffd84a' };
  const DESC = {
    campfire: 'Camp Level. More light, more room: every building can go one level higher.',
    storehouse: 'Holds your scrap, food and meds. Loot that does not fit waits in the truck.',
    bunkhouse: 'Beds. Every survivor works, runs, and counts toward the next Camp Level.',
    salvage: 'Workers strip scrap from the wrecks. Each worker adds 50%.',
    garden: 'Food for building and recruiting. Each worker adds 50%.',
    radio: 'Opens routes, recruits survivors and sends scavenging parties.',
    workbench: 'Weapons and damage for the run. Noise bombs from Lv 3.',
    infirmary: 'Meds, medkits and pills. More max HP on the run and faster healing.',
    generator: 'Charges batteries slowly. A brighter flashlight on the run.',
  };
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (name, cls) => '<svg class="i' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const pct = (x) => Math.round((x || 0) * 100) + '%';
  const now = () => performance.now();

  // ------------------------------------------------------------------ storage (every access in try/catch)
  const store = {
    ok: true, warned: false,
    get(k) { try { return localStorage.getItem(k); } catch (e) { this.ok = false; return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { this.ok = false; return false; } },
  };

  let S = null, V = null, G = null, demo = false, noSave = false, paused = false;
  const myTab = 't' + Math.floor(Math.random() * 2176782336).toString(36);
  const ui = {
    sheet: null, side: 'right', sheetHtml: '', sheetAt: 0, confirm: null,
    overlay: null, modal: null, modalQ: [], bannerQ: [], bannerUntil: 0, celebrations: 0,
    held: { scrap: 0, food: 0, meds: 0, bat: 0 }, disp: {}, roll: {}, rev: {}, shownChips: {},
    lastInput: 0, handFor: '', handKey: '', coachAfter: 0, doneAway: new Set(), gestured: false,
    last: 0, lastSave: 0, goalAt: 0, reduced: false, payloadOpen: false, resultPayloadOpen: false, routesHtml: '',
    external: false, portrait: false, portraitOk: false, particles: 1, spendRoll: {}, endShown: false, beatT: 0,
  };
  const hooks = {
    openLab() { toast('The camp lab is not loaded'); },
    openShop() { openShop(); },
  };

  // ------------------------------------------------------------------ sound (sfx.js; the AudioContext is created on the first tap)
  function sfx(name, o) { try { if (SC.Sfx && SC.Sfx.play && S && !S.dev.muted) SC.Sfx.play(name, o || {}); } catch (e) { /* sound is optional */ } }
  function gesture() {
    ui.lastInput = now();
    try { if (SC.Sfx && SC.Sfx.unlock && SC.Sfx.unlock(S ? S.dev : null) && !ui.gestured) { ui.gestured = true; syncAmb(); } } catch (e) { /* no audio */ }
  }
  function syncAmb() {
    try { if (SC.Sfx && SC.Sfx.ambience && S) SC.Sfx.ambience(!document.hidden && !paused && (S.ftue.step > 0 || S.ftue.done)); } catch (e) { /* optional */ }
  }

  // ------------------------------------------------------------------ act and events
  function act(a, o) {
    o = o || {};
    const isSkip = a.type === 'skip' || a.type === 'finishFree';
    const snap = isSkip && a.target ? timerFor(a.target.kind, a.target.id) : null;
    const r = E.act(S, a);
    if (!r.ok) {
      if (!o.quiet) { toast(r.err); sfx('deny'); if (r.reason === 'bat') shake($('c-bat')); }
      return r;
    }
    const ctx = Object.assign({ act: a }, o);
    if (isSkip) {
      // the skip beat (SPEC 8.7): the timer ring spins to zero (400 ms), a green arc for a paid skip, the zip, then
      // the completion beat with its banner
      const bid = skipBuilding(a.target);
      Scene.fx.spin(bid, snap ? { progress: snap.progress || 0, clock: snap.clock || '' } : null);
      if (r.price > 0) Scene.fx.arc(bid);
      sfx('zip');
      const rest = r.events.filter((e) => e.type !== 'skipped');
      if (ui.reduced) handle(rest, ctx);
      else setTimeout(() => { handle(rest, ctx); ui.sheetHtml = ''; }, 420);
    } else handle(r.events, ctx);
    if ((r.price || 0) > 0 || a.type === 'buyCrew') { ui.spendRoll.bat = true; if (a.type !== 'skip') sfx('spend'); }
    ui.sheetHtml = ''; ui.routesHtml = '';
    save();
    return r;
  }
  function skipBuilding(t) {
    if (!t) return 'campfire';
    if (t.kind === 'job' || t.kind === 'craft') return t.id;
    if (t.kind === 'recruit' || t.kind === 'party') return 'radio';
    return S.lv.infirmary > 0 ? 'infirmary' : 'bunkhouse';
  }
  function handle(ev, ctx) {
    ctx = ctx || {};
    const off = !!ctx.offline;
    for (const e of ev) {
      switch (e.type) {
        case 'collected': onCollected(e, ctx); break;
        case 'crateOpened': onCrate(e); break;
        case 'jobStarted': spendFx(e.cost, e.id); break;
        case 'craftStarted': spendFx(e.cost, e.building); break;
        case 'recruitStarted': spendFx({ food: e.food }, 'radio'); break;
        case 'partySent': toast(e.name + ' heads out: ' + D.PARTIES.kinds[e.kind].name.toLowerCase() + ', back in ' + fmt.dur(e.dur / 1000)); break;
        case 'jobDone': onJobDone(e, off); break;
        case 'clUp': onClUp(e, off); break;
        case 'craftDone': if (!off) { const a = Scene.anchor(e.building); floatText(a.x, a.y - 10, '+1 ' + ITEM_NAME[e.item].toLowerCase(), '#ffc66b'); } break;
        case 'partyBack': if (!off) banner(e.text, 'info'); break;
        case 'recruitDone': case 'arrived': if (!off) banner(e.text, 'info'); break;
        case 'healed': if (!off) toast(e.text); break;
        case 'objectiveDone': onObjective(e); break;
        case 'supplyDrop': {
          banner('Supply drop', 'done', 'Medkit + pills + ' + e.scrap + ' scrap at the Radio Mast');
          if (e.stored && e.stored.scrap) fly('scrap', e.stored.scrap, Scene.anchor('radio'), { delay: 300 });
          break;
        }
        case 'truckOverflow': banner(e.text, 'warn'); break;
        case 'dayRollover': if (!off) toast('A new camp day: 3 daily wins are ready'); break;
        case 'weapon': banner(e.name + ' unlocked', 'done', 'Equipped for the next run'); sfx('build'); break;
        case 'crew': if (!off) banner(e.crews === 2 ? 'Second crew' : 'Third crew hired', 'done', 'Two builds at once' + (e.crews === 3 ? ', now three' : '')); break;
        case 'fireLit': ui.coachAfter = now() + 1800; Scene.fx.flare(); sfx('whoomp'); syncAmb(); break;
        case 'packClaimed': fly('bat', e.bat, ctx.from || centre($('c-batbtn'))); break;
        case 'ftue': if (e.step === 3) setTimeout(closeSheet, 700); break;
        case 'runResolved': ui.held.bat += e.reward.batTotal || 0; break;
        default: break;
      }
    }
  }
  function onCollected(e, ctx) {
    const id = e.id, from = Scene.anchor(e.id === 'pile' ? 'pile' : e.id === 'truck' ? 'truck' : 'bubble:' + id) || Scene.anchor(id);
    const amt = e.stored || e.amounts || {};
    if (id !== 'pile' && id !== 'truck') Scene.fx.ghost('bubble:' + id);
    let i = 0;
    for (const k of ['scrap', 'food', 'meds', 'bat']) { const n = (k === 'bat' ? (e.amounts || {}).bat : amt[k]) || 0; if (n > 0) fly(k, n, from, { delay: i++ * 90 }); }
    sfx('collect');
  }
  function onCrate(e) {
    const from = Scene.anchor('crate'), amt = e.stored || e.amounts, total = RES.reduce((a, k) => a + (amt[k] || 0), 0);
    let delay = 0;
    for (const k of RES) {
      const n = amt[k] || 0; if (!n) continue;
      fly(k, n, from, { n: clamp(Math.round(30 * n / Math.max(1, total)), 3, 18), delay }); delay += 120;
    }
    sfx('crate');
    if (e.person) setTimeout(() => personCard(e.person), 900);
  }
  function levelSummary(id, lv) {
    const b = B[id];
    switch (id) {
      case 'salvage': return { main: 'scrap/h ' + b.rate[lv] };
      case 'garden': return { main: 'food/h ' + b.rate[lv] };
      case 'infirmary': return { main: 'meds/h ' + b.rate[lv], run: 'Max HP ' + b.maxHp[lv] + (b.secondWind[lv] > 1 ? ' · Second wind ×2' : '') };
      case 'storehouse': return { main: 'holds ' + fmt.num(B.storehouse.caps.scrap[lv]) + ' scrap' };
      case 'bunkhouse': return { main: b.beds[lv] + ' beds' };
      case 'radio': {
        const r = D.ROUTES.find((x) => x.radio === lv);
        return { main: r ? r.name + ' open' : lv === 2 ? 'scavenging parties' : 'party loot ×' + b.partyMul[lv].toFixed(2), run: 'horde warning ' + b.hordeWarnS[lv].toFixed(1) + ' s · +' + (b.gear[lv] - b.gear[lv - 1]) + ' gear' };
      }
      case 'workbench': return { main: lv === 3 ? 'noise bombs' : 'weapons', run: 'damage ×' + b.damageMul[lv].toFixed(2) + (b.magMul[lv] !== b.magMul[lv - 1] ? ' · magazine ×' + b.magMul[lv].toFixed(1) : '') + ' · +' + (b.gear[lv] - b.gear[lv - 1]) + ' gear' };
      case 'generator': return { main: '1 battery every ' + b.intervalH[lv] + ' h', run: 'flashlight ' + b.flashlightR[lv] + ' · +1 gear' };
      default: return { main: '' };
    }
  }
  function onJobDone(e, off) {
    Scene.fx.spring(e.id);
    if (e.id === 'campfire') return;                        // the CL beat has its own card
    if (off) { ui.doneAway.add(e.id); if (ui.celebrations++ < 3) { const s = levelSummary(e.id, e.lv); banner(B[e.id].name + ' Lv ' + e.lv, 'done', s.main, s.run); } return; }
    const s = levelSummary(e.id, e.lv);
    banner(B[e.id].name + ' Lv ' + e.lv, 'done', s.main, s.run);
    sfx('build');
  }
  // The Camp Level beat (SPEC 8.7): the HUD dims to 30%, the fire flares, the light and the camera ease to the new
  // radius and framing over 1.2 s (scene.js), new plots draw in, then the card. Reduced motion: instant, then the card.
  function beat() {
    if (ui.reduced) return;
    document.body.classList.add('beat'); clearTimeout(ui.beatT);
    ui.beatT = setTimeout(() => document.body.classList.remove('beat'), 1400);
  }
  function onClUp(e, off) {
    Scene.fx.flare(); Scene.fx.spring('campfire');
    ui.held.bat += e.bat || 0;
    if (off && ui.celebrations++ >= 3) { ui.held.bat -= e.bat || 0; banner('Camp Lv ' + e.cl, 'done', '+' + e.bat + ' batteries'); if (e.final) endCard(); return; }
    if (!off) beat();
    const news = (e.news || []).length ? 'New: ' + e.news.join(', ') : '';
    const extra = e.cl === D.CREW.freeAtCL ? 'A second build crew joins (free)' : e.crew3ForSale ? 'Build crew 3 for sale (250 batteries)' : '';
    const unl = D.ROUTES.filter((r) => r.radio && B.radio.cost[r.radio] && D.reqCL('radio', r.radio) === e.cl).map((r) => r.name);
    const card = {
      kind: 'cl', top: true,
      html: '<p class="kick">The fire grows</p><h2 class="cl">Camp Lv ' + e.cl + '</h2>' +
        '<p>' + esc([news, extra, 'Every building to Lv ' + e.cl + (unl.length ? ', ' + unl.join(', ') + ' with the Radio Mast' : '')].filter(Boolean).join(' · ')) + '</p>' +
        '<div class="btns clrow"><b class="c-bat" id="clBat">+' + e.bat + ' batteries</b><button class="btn primary" type="button" data-a="good">Good</button></div>',
      onClose() { const el = $('clBat'); fly('bat', e.bat, el ? centre(el) : { x: innerWidth / 2, y: 80 }, { preHeld: true }); },
    };
    if (off || ui.reduced) queueCard(card); else setTimeout(() => queueCard(card), 1250);   // after the 1.2 s light and camera tween
    sfx('clup');
    if (e.final) setTimeout(endCard, off || ui.reduced ? 0 : 1300);
  }
  function onObjective(e) {
    const rw = e.reward || {}, from = $('goal').hidden ? { x: innerWidth / 2, y: innerHeight - 40 } : centre($('goal'));
    const parts = [];
    let d = 300;
    for (const k of ['scrap', 'food', 'meds', 'bat']) if (rw[k]) { parts.push('+' + rw[k] + ' ' + RES_NAME[k]); fly(k, rw[k], from, { delay: d }); d += 120; }
    banner('Done: ' + e.text, 'done', parts.join(' · ') || (e.n === 4 ? 'The supply drop is in' : ''));
    $('goal').classList.add('done'); setTimeout(() => $('goal').classList.remove('done'), 900);
    if (e.end) setTimeout(endCard, 1200);
  }

  // ------------------------------------------------------------------ flyers and float texts (#fx canvas)
  let fxCv = null, fxc = null, fxDpr = 1;
  const flyers = [], floats = [], icons = {};
  function loadIcons() {
    for (const sym of document.querySelectorAll('symbol[id^="i-"]')) {
      const d = Array.from(sym.querySelectorAll('path')).map((p) => p.getAttribute('d')).join(' ');
      try { icons[sym.id.slice(2)] = new Path2D(d); } catch (e) { /* skip */ }
    }
  }
  function centre(el) { if (!el) return { x: innerWidth / 2, y: innerHeight / 2 }; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function chipEl(res) { return res === 'bat' ? $('c-bat') : $('c-' + res); }
  function fly(res, amount, from, o) {
    amount = Math.floor(amount || 0); o = o || {};
    if (!(amount > 0) || !from) { if (o.preHeld) ui.held[res] = Math.max(0, ui.held[res] - (amount || 0)); return; }
    ui.rev[res] = true;
    if (!o.preHeld) ui.held[res] += amount;
    if (ui.reduced || !(ui.particles > 0)) {        // reduced motion: no flight; the chip pulses, the number steps, "+38" fades in place
      ui.held[res] = Math.max(0, ui.held[res] - amount); pulse(chipEl(res)); floatText(from.x, from.y, '+' + amount, RES_COL[res], true);
      sfx(res === 'bat' ? 'battery' : 'chunk'); return;
    }
    const n = clamp(Math.round((o.n || clamp(Math.round(Math.sqrt(amount)), 3, 12)) * ui.particles), 1, 30), t = now() + (o.delay || 0);
    const group = { res, total: amount, left: Math.min(n, amount) };
    let left = amount;
    for (let i = 0; i < group.left; i++) {
      const part = i === group.left - 1 ? left : Math.floor(amount / group.left); left -= part;
      const a = Math.random() * TAU, r = 30 + Math.random() * 30;
      flyers.push({ res, part, group, x0: from.x, y0: from.y, bx: from.x + Math.cos(a) * r, by: from.y + Math.sin(a) * r * 0.7, t0: t + i * 35, dur: 450 + Math.random() * 200, lift: 80 + Math.random() * 60, step: i });
    }
  }
  function spendFx(cost, toKey) {
    if (!cost) return;
    sfx('spend');
    if (ui.reduced) return;
    const to = Scene.anchor(toKey);
    for (const k of RES) {
      const c = cost[k] || 0, el = chipEl(k); if (!c || !el || el.hidden) continue;
      ui.spendRoll[k] = true;                         // the chip counts down (350 ms) while 3-6 icons fly to the building
      if (!(ui.particles > 0)) continue;
      const from = centre(el), n = clamp(Math.round(Math.sqrt(c) / 3 * Math.min(1.5, ui.particles)), 1, 6);
      for (let i = 0; i < n; i++) flyers.push({ res: k, spend: true, x0: from.x, y0: from.y, bx: from.x, by: from.y, tx: to.x + (Math.random() - 0.5) * 20, ty: to.y, t0: now() + i * 40, dur: 350, lift: 40 + Math.random() * 40, step: i });
    }
  }
  function floatText(x, y, text, col, still) { floats.push({ x, y, text, col: col || '#ece8df', t0: now(), still: !!still }); }
  function arrive(f) {
    ui.held[f.res] = Math.max(0, ui.held[f.res] - f.part);
    gulp(chipEl(f.res)); sfx('tick', { step: Math.min(7, f.step) });
    if (--f.group.left <= 0) { const c = centre(chipEl(f.res)); floatText(c.x, c.y + 18, '+' + f.group.total, RES_COL[f.res]); sfx(f.res === 'bat' ? 'battery' : 'chunk'); }
  }
  function drawFx(t) {
    const w = innerWidth, h = innerHeight;
    if (fxCv.width !== Math.round(w * fxDpr) || fxCv.height !== Math.round(h * fxDpr)) { fxCv.width = Math.round(w * fxDpr); fxCv.height = Math.round(h * fxDpr); }
    fxc.setTransform(fxDpr, 0, 0, fxDpr, 0, 0); fxc.clearRect(0, 0, w, h);
    if (!flyers.length && !floats.length) { for (const k of Object.keys(ui.held)) if (ui.held[k] < 0) ui.held[k] = 0; return; }
    const chipC = {};
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i], dt = t - f.t0; if (dt < 0) continue;
      let x, y, sz = 18;
      if (f.spend) {
        const k = Math.min(1, dt / f.dur), cx = (f.x0 + f.tx) / 2, cy = Math.min(f.y0, f.ty) - f.lift;
        x = (1 - k) * (1 - k) * f.x0 + 2 * (1 - k) * k * cx + k * k * f.tx; y = (1 - k) * (1 - k) * f.y0 + 2 * (1 - k) * k * cy + k * k * f.ty; sz = 14;
        if (k >= 1) { flyers.splice(i, 1); continue; }
      } else if (dt < 120) { const k = 1 - Math.pow(1 - dt / 120, 2); x = f.x0 + (f.bx - f.x0) * k; y = f.y0 + (f.by - f.y0) * k; }
      else {
        const c = chipC[f.res] || (chipC[f.res] = centre(chipEl(f.res)));
        const k = Math.min(1, (dt - 120) / f.dur), e = k * k * (3 - 2 * k), mx = (f.bx + c.x) / 2, my = Math.min(f.by, c.y) - f.lift;
        x = (1 - e) * (1 - e) * f.bx + 2 * (1 - e) * e * mx + e * e * c.x; y = (1 - e) * (1 - e) * f.by + 2 * (1 - e) * e * my + e * e * c.y;
        if (k >= 1) { flyers.splice(i, 1); arrive(f); continue; }
      }
      const p = icons[f.res === 'bat' ? 'bat' : f.res];
      if (p) { fxc.save(); fxc.translate(x - sz / 2, y - sz / 2); fxc.scale(sz / 24, sz / 24); fxc.fillStyle = 'rgba(0,0,0,.55)'; fxc.translate(1, 1.5); fxc.fill(p, 'evenodd'); fxc.translate(-1, -1.5); fxc.fillStyle = RES_COL[f.res]; fxc.fill(p, 'evenodd'); fxc.restore(); }
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i], k = (t - f.t0) / 700; if (k >= 1) { floats.splice(i, 1); continue; }
      fxc.globalAlpha = 1 - k; fxc.font = '800 17px "Barlow Condensed", sans-serif'; fxc.textAlign = 'center'; fxc.textBaseline = 'middle';
      const dy = f.still ? 0 : k * 24;
      fxc.fillStyle = 'rgba(0,0,0,.6)'; fxc.fillText(f.text, f.x + 1, f.y - dy + 1.5); fxc.fillStyle = f.col; fxc.fillText(f.text, f.x, f.y - dy); fxc.globalAlpha = 1;
    }
  }
  function gulp(el) { if (!el) return; el.classList.add('gulp'); clearTimeout(el._g); el._g = setTimeout(() => el.classList.remove('gulp'), 120); }
  function pulse(el) { if (!el) return; el.classList.add('pulse'); clearTimeout(el._p); el._p = setTimeout(() => el.classList.remove('pulse'), 300); }
  function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake', 'flashred'); clearTimeout(el._s); el._s = setTimeout(() => el.classList.remove('shake', 'flashred'), 420); }

  // ------------------------------------------------------------------ banners, toasts
  function banner(text, kind, sub, run) { ui.bannerQ.push({ text, kind: kind || 'info', sub, run }); }
  function pumpBanners(t) {
    if (t < ui.bannerUntil || !ui.bannerQ.length || ui.overlay || ui.modal) return;
    const b = ui.bannerQ.shift(), box = $('banners');
    // centred in the part of the screen no panel covers (side sheet or the Lab)
    let a = 0, z = innerWidth;
    if (ui.sheet && ui.side !== 'bottom') { const sr = $('sheet').getBoundingClientRect(); if (ui.side === 'right') z = Math.min(z, sr.left); else a = Math.max(a, sr.right); }
    if (!$('lab').hidden) z = Math.min(z, $('lab').getBoundingClientRect().left);
    if (z - a < 200) { a = 0; z = innerWidth; }
    box.style.left = Math.round((a + z) / 2) + 'px'; box.style.maxWidth = Math.round(Math.min(560, (z - a) * 0.94)) + 'px';
    box.innerHTML = '<div class="banner ' + b.kind + '">' + esc(b.text) + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '') + (b.run ? '<small class="runl">RUN · ' + esc(b.run) + '</small>' : '') + '</div>';
    const dur = b.kind === 'warn' ? 4200 : ui.bannerQ.length > 2 ? 1300 : 2300;
    ui.bannerUntil = t + dur;
    clearTimeout(box._t); box._t = setTimeout(() => { if (now() >= ui.bannerUntil - 5) box.innerHTML = ''; }, dur);
  }
  function toast(text) {
    const el = $('toast'); el.textContent = text; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1900);
  }

  // ------------------------------------------------------------------ cards (CL beat, person, welcome back, other tab)
  function queueCard(c) { if (c.front) ui.modalQ.unshift(c); else ui.modalQ.push(c); pumpCards(); }
  function pumpCards() {
    if (ui.modal || ui.overlay || !ui.modalQ.length) return;
    if (now() < ui.cardHold) { clearTimeout(ui.cardT); ui.cardT = setTimeout(pumpCards, ui.cardHold - now() + 20); return; }
    showCard(ui.modalQ.shift());
  }
  function showCard(c) {
    ui.modal = c;
    const m = $('modal'), card = $('mcard'); m.className = 'modal' + (c.top ? ' top' : ''); card.className = 'mcard' + (c.cls ? ' ' + c.cls : ''); card.style.maxWidth = ''; card.innerHTML = c.html; m.hidden = false; arm(m);
    if (c.top) {
      // top-centre, but never over the fire: on short screens the card moves to the top-left corner beside it
      const flame = Scene.toScreen(640, 392), bottom = card.offsetTop + card.offsetHeight;
      if (bottom > flame.y - 4) { m.classList.add('side'); card.style.maxWidth = Math.max(220, Math.round(flame.x - 30 - card.offsetLeft)) + 'px'; }
    }
    if (c.onShow) c.onShow();
    document.body.classList.add('modal-open');
    E.log(S, 'screen', { name: 'card:' + c.kind });
    const b = $('mcard').querySelector('button'); if (b) setTimeout(() => { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 260);
  }
  function closeCard() {
    const c = ui.modal; if (!c) return;
    $('modal').hidden = true; ui.modal = null; document.body.classList.remove('modal-open');
    if (c.onClose) c.onClose();
    setTimeout(pumpCards, 600);
  }
  function personCard(name) {
    const p = V && V.people.find((x) => x.name === name), rw = S.lastReward;
    const line = rw && rw.rescue && rw.rescue.name === name ? (rw.rescue.where === 'bed' ? D.ARRIVAL_LINES.rescue : D.ARRIVAL_LINES[rw.rescue.where]).replace('{name}', name).replace('{place}', rw.rescue.place) : D.ARRIVAL_LINES.recruit.replace('{name}', name);
    queueCard({ kind: 'person', html: '<p class="kick">Someone new</p>' + personHtml(name, line, p) + '<div class="btns"><button class="btn primary" type="button" data-a="good">Welcome</button></div>' });
  }
  function worksText(p) {
    if (!p) return 'Waits at the gate for a free bed';
    if (p.state === 'injured') return 'Resting: hurt';
    if (p.state === 'party') return 'Out on a party';
    return p.worksAt && p.worksAt !== 'fire' ? 'Works the ' + B[p.worksAt].name : 'Sits by the fire, ready to run or go on a party';
  }
  function personHtml(name, line, p) {
    return '<div class="person"><span class="av">' + esc(name[0]) + '</span><div><b>' + esc(name) + '</b><p>' + esc(line) + '</p><span class="works">' + esc(worksText(p)) + '</span></div></div>';
  }
  // Welcome back (SPEC 4.9): one row per source, staggered 80 ms; Collect all sends every bubble's flyers. It is queued
  // before the celebrations from the same gap, so those play after it closes, 600 ms apart.
  const ROW_IC = { job: ['check', 'ok'], cl: ['flag', 'c-bat'], party: ['crate', ''], healed: ['surv', 'ok'], recruit: ['surv', ''], generator: ['bat', 'c-bat'], truck: ['crate', ''] };
  function welcomeCard(w) {
    if (!w || !w.rows || !w.rows.length) return;
    const rows = w.rows.map((r, i) => {
      const icn = r.kind === 'bubble' ? [r.res, 'c-' + r.res] : r.kind === 'craft' ? [r.id === 'workbench' ? 'bomb' : 'medkit', 'c-meds'] : ROW_IC[r.kind] || ['check', ''];
      return '<div style="animation-delay:' + (i * 80) + 'ms">' + ic(icn[0], icn[1]) + '<span>' + esc(r.text) + '</span></div>';
    }).join('');
    const any = w.rows.some((r) => r.kind === 'bubble' || r.kind === 'generator' || r.kind === 'party' || r.kind === 'truck');
    queueCard({
      kind: 'welcome', front: true, cls: 'welcome',
      html: '<p class="kick">While you were away · ' + esc(fmt.dur(w.ms / 1000)) + '</p><h2>Welcome back</h2><div class="rows">' + rows + '</div>' +
        '<div class="btns"><button class="btn" type="button" data-a="good">' + (any ? 'Later' : 'Good') + '</button>' + (any ? '<button class="btn primary" type="button" data-a="collectAll">Collect all</button>' : '') + '</div>',
    });
  }
  // End card (SPEC 8.6): Camp Lv 10 lights the signal fire; a short telemetry summary; the camp keeps running.
  function endCard() {
    if (ui.endShown) return; ui.endShown = true;
    const k = E.kpis(S), packs = Object.keys(k.packs).reduce((a, x) => a + k.packs[x], 0);
    let track = '';
    for (let L = 2; L <= 10; L++) { const u = k.clTimes[L]; track += '<span>CL' + L + '<b>' + (u ? esc(fmt.dur(u.camp / 1000)) : '–') + '</b></span>'; }
    const rows = [['Camp time', fmt.dur(S.campNow / 1000)], ['Runs', k.runs + ' (' + k.wins + ' won)'], ['Win rate', pct(k.winRate)], ['Batteries earned', fmt.num(k.batEarned)],
      ['Batteries spent', fmt.num(k.batSpent)], ['Free test packs claimed', String(packs)]];
    queueCard({
      kind: 'end',
      html: '<p class="kick">Camp Lv 10 · prototype complete</p><h2 class="cl">Signal fire lit. Dawn.</h2><p class="desc enddesc">Time to each Camp Level (camp clock)</p><div class="cltrack">' + track + '</div>' +
        '<div class="endgrid">' + rows.map((r) => '<span><i>' + esc(r[0]) + '</i><b>' + esc(r[1]) + '</b></span>').join('') + '</div>' +
        '<div class="btns"><button class="btn" type="button" data-a="lab">Telemetry</button><button class="btn primary" type="button" data-a="good">Keep playing</button></div>',
    });
  }
  // Free prototype shop (SPEC 4.11): three free test packs. No prices, no currency, no payment UI, no links.
  function openShop() {
    if (ui.modal && ui.modal.kind === 'shop') return;
    const packs = ['small', 'medium', 'large'].map((k) => '<div class="pack"><span class="lbl">PROTOTYPE TEST PACK: free, no payment</span>' +
      '<span class="amt">' + ic('bat') + '+' + String(D.PACKS[k]).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '</span><span class="sz">' + k + '</span>' +
      '<button class="btn go" type="button" data-a="claim:' + k + '" aria-label="Claim the free ' + k + ' test pack: ' + D.PACKS[k] + ' batteries">Claim</button></div>').join('');
    const card = {
      kind: 'shop', cls: 'shop',
      html: '<div class="shead" style="border:0;padding:0"><div style="min-width:0"><p class="warnhead">PROTOTYPE · FREE · NO REAL PURCHASES</p><h2>Battery test packs</h2></div>' +
        '<button class="iconbtn x" type="button" data-a="good" aria-label="Close the shop"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-close"/></svg></button></div>' +
        '<p class="desc shopdesc">Batteries for trying the speed-ups. Nothing is sold: a claim adds the batteries and is logged as a would-be purchase.</p>' +
        '<div class="packs">' + packs + '</div><p class="desc" id="shopGot"></p>',
      onShow() { shopGot(); },
    };
    if (ui.modal) { ui.modalQ.unshift(card); return; }
    showCard(card);
    E.log(S, 'screen', { name: 'shop' });
  }
  function shopGot() {
    const el = $('shopGot'); if (!el) return;
    const p = S.tele.packs, n = Object.keys(p).reduce((a, k) => a + p[k], 0);
    el.textContent = n ? 'Claimed in this save: ' + ['small', 'medium', 'large'].filter((k) => p[k]).map((k) => p[k] + ' ' + k).join(', ') : '';
  }
  function modalClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return;
    gesture();
    const [a, x] = b.dataset.a.split(':');
    if (a === 'good') { sfx('tap'); closeCard(); }
    else if (a === 'collectAll') { ui.cardHold = now() + 1400; closeCard(); act({ type: 'collectAll' }); }   // let the flyers land before the next card
    else if (a === 'useHere') useHere();
    else if (a === 'claim') { const r = act({ type: 'claimPack', size: x }, { from: centre(b) }); if (r.ok) { shopGot(); b.textContent = 'Claimed +' + D.PACKS[x]; setTimeout(() => { b.textContent = 'Claim'; }, 1200); } }
    else if (a === 'lab') { closeCard(); hooks.openLab('telemetry'); }
  }

  // ------------------------------------------------------------------ HUD
  function revealed() {
    const f = S.ftue, done = f.done;
    const afterRun = done || !!S.lastResult || S.runSeq >= 2 || (S.runSeq >= 1 && !S.pending);
    return {
      scrap: done || f.step >= 2 || S.pile === 0 || !!ui.rev.scrap,
      food: afterRun || !!ui.rev.food, surv: afterRun, bat: afterRun || !!ui.rev.bat,
      meds: S.res.meds > 0 || S.lv.infirmary > 0 || S.lv.campfire >= 3 || !!ui.rev.meds,
      play: done || f.step >= 3, goal: done,
    };
  }
  // Chip numbers: jumps of 1 000 or more roll over 600 ms; a spend counts down over 350 ms; flyer arrivals step.
  function shownVal(k, target, t) {
    const d = ui.disp[k];
    if (d == null || ui.reduced) { ui.disp[k] = target; delete ui.roll[k]; ui.spendRoll[k] = false; return target; }
    let r = ui.roll[k];
    if (r && r.to !== target) r = ui.roll[k] = { from: r.cur, to: target, t0: t, cur: r.cur, dur: r.dur };
    if (!r && target !== d && (Math.abs(target - d) >= 1000 || (ui.spendRoll[k] && target < d))) r = ui.roll[k] = { from: d, to: target, t0: t, cur: d, dur: Math.abs(target - d) >= 1000 ? 600 : 350 };
    ui.spendRoll[k] = false;
    if (!r) { ui.disp[k] = target; return target; }
    const q = clamp((t - r.t0) / r.dur, 0, 1); r.cur = Math.round(r.from + (r.to - r.from) * (1 - (1 - q) * (1 - q)));
    if (q >= 1) { delete ui.roll[k]; r.cur = target; }
    ui.disp[k] = r.cur;
    return r.cur;
  }
  function setText(el, txt) { if (el._txt !== txt) { el.textContent = txt; el._txt = txt; } }
  function setHidden(el, hide) { if (el.hidden !== hide) el.hidden = hide; }
  function updateHud(t) {
    const rv = revealed();
    for (const k of ['scrap', 'food', 'meds']) {
      const el = $('c-' + k);
      showChip(el, rv[k], k);
      if (!rv[k]) continue;
      const v = shownVal(k, Math.max(0, S.res[k] - ui.held[k]), t);
      setText(el.querySelector('b'), fmt.num(v));
      const cap = V.caps[k], full = S.res[k] >= cap;
      if (el._full !== full) { el.classList.toggle('full', full); el._full = full; }
      const sc = (Math.min(1, S.res[k] / Math.max(1, cap))).toFixed(3);
      const ci = el.querySelector('.cap i'); if (ci._sc !== sc) { ci.style.transform = 'scaleX(' + sc + ')'; ci._sc = sc; }
      const lab = (k[0].toUpperCase() + k.slice(1)) + ' ' + S.res[k] + ' of ' + cap; if (el._lab !== lab) { el.setAttribute('aria-label', lab); el._lab = lab; }
    }
    const sv = $('c-surv'); showChip(sv, rv.surv, 'surv');
    if (rv.surv) { setText(sv.querySelector('b'), V.survivors + '/' + V.beds); const lab = 'Survivors ' + V.survivors + ' of ' + V.beds + ' beds'; if (sv._lab !== lab) { sv.setAttribute('aria-label', lab); sv._lab = lab; } }
    const bb = $('c-batbtn'); showChip(bb, rv.bat, 'bat');
    if (rv.bat) setText($('c-bat').querySelector('b'), fmt.num(shownVal('bat', Math.max(0, S.res.bat - ui.held.bat), t)));
    // sound toggle
    const muted = !!S.dev.muted, sb = $('btnSound');
    if (sb._m !== muted) { sb._m = muted; sb.querySelector('use').setAttribute('href', muted ? '#i-snd-off' : '#i-snd'); sb.setAttribute('aria-label', muted ? 'Sound is off: tap to unmute' : 'Sound is on: tap to mute'); }
    // goal chip
    const g = $('goal');
    setHidden(g, !rv.goal);
    if (rv.goal && G) {
      const m = G.main, eta = m.eta && m.eta !== '' ? m.eta : '';
      setText(g.querySelector('.g1'), m.text + (eta ? ' · ' + eta : ''));
      setText(g.querySelector('.g2'), G.side ? 'Meanwhile: ' + G.side.text : m.blocked && m.parent ? 'For: ' + m.parent : '');
      const pr = goalProgress(m).toFixed(3), bi = g.querySelector('.bar i'); if (bi._p !== pr) { bi.style.transform = 'scaleX(' + pr + ')'; bi._p = pr; }
      const lab = 'Goal: ' + m.text + (eta ? ', ' + eta : '') + (G.side ? '. Meanwhile: ' + G.side.text : ''); if (g._lab !== lab) { g.setAttribute('aria-label', lab); g._lab = lab; }
      const col = ui.sheet && ui.side === 'left'; if (g._col !== col) { g.classList.toggle('collapsed', col); g._col = col; }
    }
    // PLAY
    const p = $('play'), hideP = !rv.play || (ui.sheet && ui.side !== 'left') || !!ui.overlay;
    if (p._shown === undefined) p._shown = !p.hidden;
    if (!hideP && !p._shown && rv.play) { p.classList.add('rise'); setTimeout(() => p.classList.remove('rise'), 500); }
    setHidden(p, hideP); p._shown = !hideP;
    if (!hideP) {
      const o = V.frontierOdds != null ? ' · ' + pct(V.frontierOdds) : '';
      setText(p.querySelector('.pl1'), (innerWidth < 640 ? 'RUN' : 'GO ON A RUN') + o);
      setText(p.querySelector('.pl2'), 'Daily ' + '●'.repeat(Math.min(V.daily.max, V.daily.wins)) + '○'.repeat(Math.max(0, V.daily.max - V.daily.wins)));
      const pul = !S.ftue.done && S.ftue.step === 3; if (p._pul !== pul) { p.classList.toggle('pulse', pul); p._pul = pul; }
      const lab = 'Go on a run: ' + (V.frontierOdds != null ? pct(V.frontierOdds) + ' on ' + D.ROUTES.find((r) => r.id === V.frontier).name : ''); if (p._lab !== lab) { p.setAttribute('aria-label', lab); p._lab = lab; }
    }
  }
  function showChip(el, show, k) {
    if (show && el.hidden) { el.hidden = false; ui.needLayout = ui.portrait; if (ui.shownChips[k]) return; ui.shownChips[k] = true; const v = el.classList.contains('batbtn') ? $('c-bat') : el; v.classList.add('reveal'); setTimeout(() => v.classList.remove('reveal'), 500); }
    else if (!show && !el.hidden) el.hidden = true;
    if (show) ui.shownChips[k] = true;
  }
  function goalProgress(m) {
    if (m.kind === 'timer' || m.kind === 'crews') { const j = V.jobs.find((x) => x.id === m.target); if (j) return j.progress; }
    if (m.kind === 'resources' && m.missing) { let p = 1; for (const k of RES) if (m.missing[k]) p = Math.min(p, S.res[k] / (S.res[k] + m.missing[k])); return p; }
    return m.eta === 'ready now' ? 1 : 0;
  }
  function tapGoal() {
    gesture(); sfx('tap');
    const m = G && G.main; if (!m) return;
    const t = m.target;
    if (t === 'play') return openRoutes(m.route);
    if (B[t]) return openSheet(t);
    if (t === 'crate' && S.crate) return act({ type: 'openCrate' });
  }

  // ------------------------------------------------------------------ hotspots
  const hsEls = {};
  function hotLabel(h) {
    if (h.kind === 'building') return h.id === 'campfire' && !S.ftue.done && S.ftue.step === 0 ? V.hotspots.fire.label : V.hotspots[h.id].label;
    if (h.kind === 'bubble') {
      const hs = V.hotspots[h.id], b = hs.bubble;
      if (h.id === 'generator') return 'Collect ' + b.stored + ' batter' + (b.stored > 1 ? 'ies' : 'y') + ' from the Generator';
      if (h.id === 'radio') return 'Open the party crate at the Radio Mast';
      return 'Collect ' + b.stored + ' ' + { salvage: 'scrap', garden: 'food', infirmary: 'meds' }[h.id] + ' from the ' + B[h.id].name + (b.full ? ' (full)' : '');
    }
    return (V.hotspots[h.kind] && V.hotspots[h.kind].label) || h.kind;
  }
  function syncHot() {
    const list = Scene.hotspots(), seen = {};
    for (const h of list) {
      let el = hsEls[h.key];
      if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'hs'; el.dataset.key = h.key; el.addEventListener('click', onHotClick); $('hot').appendChild(el); hsEls[h.key] = el; el._st = {}; }
      seen[h.key] = 1;
      const st = el._st, x = Math.round(h.x), y = Math.round(h.y), w = Math.round(h.w), hh = Math.round(h.h);
      if (st.x !== x || st.y !== y) { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; st.x = x; st.y = y; }
      if (st.w !== w || st.h !== hh) { el.style.width = w + 'px'; el.style.height = hh + 'px'; st.w = w; st.h = hh; }
      if (st.z !== h.z) { el.style.zIndex = h.z; st.z = h.z; }
      const lab = hotLabel(h); if (st.lab !== lab) { el.setAttribute('aria-label', lab); st.lab = lab; }
      if (el.hidden) el.hidden = false;
    }
    for (const k of Object.keys(hsEls)) if (!seen[k] && !hsEls[k].hidden) hsEls[k].hidden = true;
  }
  function onHotClick(e) { tapHot(e.currentTarget.dataset.key); }
  function tapHot(key) {
    gesture();
    if (paused) return;
    if (key === 'pile') return act({ type: 'takePile' });
    if (key === 'crate') return act({ type: 'openCrate' });
    if (key === 'truck') return act({ type: 'unloadTruck' });
    if (key.indexOf('bubble:') === 0) {
      const r = act({ type: 'collect', id: key.slice(7) }, { quiet: true });
      if (!r.ok) { toast(r.err); sfx('deny'); const k = { salvage: 'scrap', garden: 'food', infirmary: 'meds' }[key.slice(7)]; if (k) shake($('c-' + k)); }
      return;
    }
    if (key === 'campfire' && !S.ftue.done && S.ftue.step === 0) return act({ type: 'tapFire' });
    sfx('tap');
    if (ui.sheet === key) return closeSheet();
    openSheet(key);
  }

  // ------------------------------------------------------------------ side sheet
  function openSheet(id) {
    if (!B[id]) return;
    const swap = !!ui.sheet && ui.sheet !== id;
    ui.sheetHtml = ''; ui.confirm = null;
    ui.doneAway.delete(id);
    const el = placeSheet(id, swap);
    if (!swap) arm(el);
    renderSheet(now(), true);
    E.log(S, 'screen', { name: 'sheet:' + id });
  }
  // Docked opposite the building in landscape; a bottom sheet in the portrait fallback.
  function placeSheet(id, swap) {
    const a = Scene.anchor(id), side = ui.portrait ? 'bottom' : a.x < innerWidth / 2 ? 'right' : 'left';
    ui.sheet = id; ui.side = side;
    const el = $('sheet'); el.className = 'sheet ' + side; el.hidden = false;
    if (swap) { void el.offsetWidth; el.classList.add('swap'); }
    document.body.classList.toggle('sheet-left', side === 'left');
    document.body.classList.toggle('sheet-bottom', side === 'bottom');
    Scene.focus({ id, side, w: side === 'bottom' ? 0 : el.getBoundingClientRect().width || 260 });
    return el;
  }
  function closeSheet() {
    if (!ui.sheet) return;
    ui.sheet = null; $('sheet').hidden = true; Scene.focus(null); ui.confirm = null;
    document.body.classList.remove('sheet-left', 'sheet-bottom');
  }
  function jump(id) { if (id === 'play') { closeSheet(); openRoutes(); } else openSheet(id); }
  const arrow = (a, b) => (b == null || String(a) === String(b) ? esc(a) : esc(a) + ' → <em>' + esc(b) + '</em>');
  const erow = (label, a, b, live) => '<div class="erow"><span>' + esc(label) + '</span><b' + (live ? ' data-live="' + live + '"' : '') + '>' + (live ? '' : arrow(a, b)) + '</b></div>';
  const gearOf = (id, L) => (id === 'workbench' ? B.workbench.gear[L] : id === 'radio' ? B.radio.gear[L] : id === 'generator' ? B.generator.gear[L] : 0);
  function sheetLevels(id) {
    const L = S.lv[id], job = S.jobs.find((j) => j.id === id), max = B[id].max;
    const N = job ? job.toLv : L < max ? L + 1 : null;
    return { L, N, job, max };
  }
  function effects(id, L, N) {
    const b = B[id], rows = [], runParts = [];
    const pm = S.dev.mul.prod || 1;
    switch (id) {
      case 'campfire': {
        const lr = (c) => (D.SCENE.lightBase + D.SCENE.lightPerCL * (c - 1)) + ' u';
        rows.push(['Camp Level', L, N]); rows.push(['Light', lr(L), N && lr(N)]); rows.push(['Buildings up to', 'Lv ' + L, N && 'Lv ' + N]);
        if (N) rows.push(['Survivors needed', S.people.length + ' / ' + b.survivors[N], null]);
        break;
      }
      case 'storehouse': for (const k of RES) rows.push([k[0].toUpperCase() + k.slice(1) + ' cap', fmt.num(E.caps(Object.assign({}, S, { lv: Object.assign({}, S.lv, { storehouse: L }) }))[k]), N && fmt.num(E.caps(Object.assign({}, S, { lv: Object.assign({}, S.lv, { storehouse: N }) }))[k])]); break;
      case 'bunkhouse': rows.push(['Beds', b.beds[L], N && b.beds[N]]); rows.push(['Survivors', S.people.length + (S.gate.length ? ' + ' + S.gate.length + ' at the gate' : ''), null]); break;
      case 'salvage': case 'garden': case 'infirmary': {
        const w = V.workers[id] || 0, rt = (lv) => Math.round(b.rate[lv] * (1 + 0.5 * w) * pm), res = { salvage: 'Scrap', garden: 'Food', infirmary: 'Meds' }[id];
        rows.push([res + '/h', L ? rt(L) : 0, N && rt(N)]); rows.push(['Holds', (L ? b.holds[L] : 0) + ' h', N && b.holds[N] + ' h']);
        if (L) rows.push(['Full in', '', null, 'fullin:' + id]);
        rows.push(['Workers', w + ' / 2', null]);
        if (id === 'infirmary') {
          const cut = (lv) => (b.injuryCut[lv] ? '−' + Math.round(b.injuryCut[lv] * 100) + '%' : '0%');
          rows.push(['Injury time', cut(L), N && cut(N)]);
          if (N && b.maxHp[N] !== b.maxHp[L]) runParts.push('max HP ' + b.maxHp[L] + ' → ' + b.maxHp[N]);
          if (N && b.secondWind[N] !== b.secondWind[L]) runParts.push('second wind ×' + b.secondWind[L] + ' → ×' + b.secondWind[N]);
        }
        break;
      }
      case 'radio': {
        rows.push(['Party slots', b.partySlots[L], N && b.partySlots[N]]);
        rows.push(['Party loot', L >= 2 ? '×' + b.partyMul[L].toFixed(2) : '–', N && N >= 2 ? '×' + b.partyMul[N].toFixed(2) : null]);
        const nr = N && D.ROUTES.find((r) => r.radio === N); if (nr) rows.push(['New route', '', nr.name]);
        if (N && b.hordeWarnS[N] !== b.hordeWarnS[L]) runParts.push('horde warning ' + b.hordeWarnS[L].toFixed(1) + ' s → ' + b.hordeWarnS[N].toFixed(1) + ' s');
        break;
      }
      case 'workbench': {
        rows.push(['Damage', '×' + b.damageMul[L].toFixed(2), N && '×' + b.damageMul[N].toFixed(2)]);
        rows.push(['Magazine', '×' + b.magMul[L].toFixed(1), N && '×' + b.magMul[N].toFixed(1)]);
        if (N && b.damageMul[N] !== b.damageMul[L]) runParts.push('damage ×' + b.damageMul[L].toFixed(2) + ' → ×' + b.damageMul[N].toFixed(2));
        if (N && b.magMul[N] !== b.magMul[L]) runParts.push('magazine ×' + b.magMul[N].toFixed(1));
        if (N === 1) runParts.push('unlocks weapons for Blueprints');
        break;
      }
      case 'generator': {
        rows.push(['1 battery every', L ? b.intervalH[L] + ' h' : '–', N && b.intervalH[N] + ' h']); rows.push(['Holds', L ? b.holds[L] : 0, N && b.holds[N]]);
        if (N) runParts.push('flashlight ' + b.flashlightR[L] + ' → ' + b.flashlightR[N]);
        break;
      }
      default: break;
    }
    const gd = N ? gearOf(id, N) - gearOf(id, L) : 0;
    if (gd > 0) runParts.push('+' + gd + ' gear');
    return { rows, run: runParts.length ? 'RUN · ' + runParts.join(' · ') : '' };
  }
  function costHtml(c) {
    if (!c) return '';
    const parts = [];
    for (const k of RES) if (c[k]) parts.push('<span class="cost ' + (S.res[k] >= c[k] ? 'ok' : 'no') + '" data-res="' + k + '">' + ic(k) + fmt.num(c[k]) + '</span>');
    if (c.bp) parts.push('<span class="cost ' + (S.res.bp >= c.bp ? 'ok' : 'no') + '" data-res="bp">' + ic('bp') + c.bp + ' BP</span>');
    return parts.length ? '<div class="costs">' + parts.join('') + '</div>' : '';
  }
  const skipBtn = (kind, id) => '<button class="mini bat" type="button" data-a="skip:' + kind + ':' + id + '" data-live="skipbtn:' + kind + ':' + id + '"></button>';
  function panel(id) {
    let h = '';
    const L = S.lv[id];
    if (id === 'campfire') {
      const lg = G.long;
      h += '<h3>Road to dawn</h3><div class="track">';
      for (let c = 1; c <= 10; c++) h += '<i class="' + (c <= V.cl ? 'on' : c === V.cl + 1 ? 'next' : '') + '">' + c + '</i>';
      h += '</div>';
      if (!lg.done) {
        h += '<h3>Camp Lv ' + lg.cl + ' needs</h3><div class="check">';
        for (const it of lg.items) {
          const v = it.key === 'storehouse' ? (it.ok ? 'Lv ' + it.have : 'Lv ' + it.need + ' (now ' + it.have + ')') : fmt.num(it.have) + ' / ' + fmt.num(it.need);
          h += '<span class="' + (it.ok ? 'green' : '') + '">' + esc(it.label) + ' <b>' + esc(v) + '</b>' + (it.ok ? ' ✓' : '') + '</span>';
        }
        h += '</div>';
        const news = lg.news.slice(); if (lg.cl === D.CREW.freeAtCL) news.push('2nd crew (free)'); if (lg.cl === D.CREW.thirdFromCL) news.push('crew 3 for sale');
        h += '<p class="note">New at Camp Lv ' + lg.cl + ': ' + esc(news.concat(['every building to Lv ' + lg.cl]).join(', ')) + '</p>';
        if (lg.nextRoute) h += '<p class="desc">Next route: ' + esc(lg.nextRoute.name) + ' (' + esc(lg.nextRoute.req) + ')' + (lg.nextWeapon ? ' · Next weapon: ' + esc(lg.nextWeapon.name) + ' (' + esc(lg.nextWeapon.req) + ')' : '') + '</p>';
      }
      h += '<h3>Build crews · ' + V.crewsFree + ' of ' + V.crews + ' free</h3>';
      const c3 = V.crew3;
      if (c3.owned) h += '<div class="li"><span class="grow"><span class="t">Three crews</span><span class="s">All hired</span></span></div>';
      else if (c3.visible) h += '<div class="li"><span class="grow"><span class="t">' + esc(c3.label) + '</span><span class="s">' + (c3.available ? 'Three builds at once' : 'Save batteries for it') + '</span></span>' + (c3.available ? '<button class="mini bat" type="button" data-a="buyCrew">Hire · 250</button>' : ic('lock')) + '</div>';
      h += '<div class="li"><span class="grow"><span class="t">Collect everything</span><span class="s">Bubbles, party crates and the truck</span></span><button class="mini primary" type="button" data-a="collectAll">Collect all</button></div>';
    } else if (id === 'storehouse') {
      const t = V.truck, any = t.scrap + t.food + t.meds > 0;
      h += '<h3>Truck at the gate</h3><div class="li"><span class="grow"><span class="t">' + (any ? RES.filter((k) => t[k]).map((k) => t[k] + ' ' + k).join(' · ') : 'Empty') + '</span><span class="s">Overflow from runs and parties waits here</span></span>' + (any ? '<button class="mini" type="button" data-a="unload">Unload</button>' : '') + '</div>';
    } else if (id === 'bunkhouse') {
      h += '<h3>Survivors · ' + V.survivors + ' / ' + V.beds + ' beds</h3>';
      for (const p of V.people) {
        let s = worksText(p), extra = '';
        if (p.state === 'injured') { s = 'Hurt · back in <span data-live="clock:injury:' + p.id + '"></span>'; extra = skipBtn('injury', p.id); }
        else if (p.state === 'party') { const pa = V.parties.find((x) => x.who === p.id && !x.back); s = 'Out on a party' + (pa ? ' · <span data-live="clock:party:' + pa.id + '"></span>' : ''); }
        h += '<div class="li"><span class="grow"><span class="t">' + esc(p.name) + (p.id === S.loadout.runner ? ' · runner' : '') + '</span><span class="s' + (p.state === 'injured' ? ' red' : '') + '">' + (p.state === 'injured' || p.state === 'party' ? s : esc(s)) + ' · runs ' + p.runs + ', wins ' + p.wins + '</span></span>' + extra + '</div>';
      }
      for (const g of V.gate) h += '<div class="li"><span class="grow"><span class="t">' + esc(g.name) + '</span><span class="s">Waits at the gate for a free bed</span></span></div>';
    } else if (id === 'salvage' || id === 'garden') {
      if (L) {
        const names = V.assign[id] || [];
        h += '<h3>Workers</h3><p class="desc">' + (names.length ? esc(names.join(', ')) : 'Nobody yet') + '</p>';
        if (V.slotNotes[id]) h += '<p class="note">' + esc(V.slotNotes[id]) + '</p>';
        h += '<div class="li"><span class="grow"><span class="t">Ready: <span data-live="stored:' + id + '"></span></span><span class="s">Tap the bubble or collect here</span></span><button class="mini primary" type="button" data-a="collect:' + id + '">Collect</button></div>';
      }
    } else if (id === 'infirmary') {
      if (L) {
        h += '<div class="li"><span class="grow"><span class="t">Meds ready: <span data-live="stored:infirmary"></span></span>' + (V.slotNotes.infirmary ? '<span class="s">' + esc(V.slotNotes.infirmary) + '</span>' : '') + '</span><button class="mini primary" type="button" data-a="collect:infirmary">Collect</button></div>';
        h += craftPanel('infirmary', ['medkit', 'pills']);
      } else h += '<p class="desc">Crafts medkits and pills for the run once built. The previous owner left a stash of 20 meds.</p>';
    } else if (id === 'workbench') {
      h += '<h3>Weapons · ' + S.res.bp + ' Blueprints</h3>';
      for (const w of ['smg', 'shotgun', 'rifle']) {
        const W = D.WEAPONS[w], own = S.weapons[w], g = Run.WEAPON[w].g;
        let right = '', s = '+' + g + ' gear on the run';
        if (own) right = '<span class="s green">Unlocked</span>';
        else if (L < W.wb) { right = ic('lock'); s = 'Needs Workbench Lv ' + W.wb + ' · ' + W.bp + ' BP'; }
        else if (S.res.bp < W.bp) { right = '<span class="s">' + S.res.bp + ' / ' + W.bp + ' BP</span>'; s = 'Blueprints come from winning runs'; }
        else right = '<button class="mini primary" type="button" data-a="unlock:' + w + '">Unlock · ' + W.bp + ' BP</button>';
        h += '<div class="li">' + '<svg class="i" style="width:34px;height:17px" aria-hidden="true"><use href="#i-' + w + '"/></svg><span class="grow"><span class="t">' + esc(W.name) + '</span><span class="s">' + esc(s) + '</span></span>' + right + '</div>';
      }
      if (L >= 3) h += craftPanel('workbench', ['bomb']);
      else h += '<p class="desc">Noise bombs from Workbench Lv 3.</p>';
    } else if (id === 'radio') {
      if (L >= 1) {
        h += '<h3>Recruit</h3>';
        if (V.recruit) h += '<div class="li"><span class="grow"><span class="t">' + esc(V.recruit.name) + ' is on the way</span><span class="s">Arrives in <span data-live="clock:recruit:recruit"></span></span></span>' + skipBtn('recruit', 'recruit') + '</div>';
        else if (V.recruitOffer) {
          const o = V.recruitOffer;
          h += '<div class="li"><span class="grow"><span class="t">Call for a survivor</span><span class="s' + (o.bed ? '' : ' red') + '">' + (o.bed ? o.food + ' food · ' + fmt.dur(o.sec) : 'No free bed: Bunkhouse to ' + (S.lv.bunkhouse + 1)) + '</span></span>' + (o.bed ? '<button class="mini primary" type="button" data-a="recruit">Recruit</button>' : '<button class="mini" type="button" data-a="jump:bunkhouse">Bunks</button>') + '</div>';
        }
        h += '<h3>Scavenging parties</h3>';
        if (L < D.PARTIES.minRadio) h += '<p class="desc">Parties from Radio Mast Lv 2: one survivor goes out, no risk, loot waits here.</p>';
        else {
          for (const pa of V.parties) {
            const who = V.people.find((p) => p.id === pa.who), nm = (who ? who.name + ': ' : '') + D.PARTIES.kinds[pa.kind].name;
            if (pa.back) h += '<div class="li"><span class="grow"><span class="t">' + esc(nm) + '</span><span class="s green">Back · ' + RES.filter((k) => pa.loot[k]).map((k) => pa.loot[k] + ' ' + k).join(' · ') + '</span></span><button class="mini primary" type="button" data-a="collect:radio">Open</button></div>';
            else h += '<div class="li"><span class="grow"><span class="t">' + esc(nm) + '</span><span class="s">Back in <span data-live="clock:party:' + pa.id + '"></span></span></span>' + skipBtn('party', pa.id) + '</div>';
          }
          const free = V.partySlots - V.partiesActive, fit = V.people.filter((p) => p.state === 'home');
          const who = fit.length >= 2 ? fit[fit.length - 1].name : null;
          h += '<p class="desc">Slots: ' + V.partiesActive + ' of ' + V.partySlots + ' out' + (who ? ' · ' + esc(who) + ' would go' : ' · someone has to stay at camp') + '</p>';
          if (free > 0 && who) for (const k of D.PARTIES.order) {
            const kd = D.PARTIES.kinds[k], m = B.radio.partyMul[L];
            h += '<div class="li"><span class="grow"><span class="t">' + esc(kd.name) + ' · ' + fmt.dur(kd.sec * (S.dev.mul.time || 1)) + '</span><span class="s">' + RES.filter((r) => kd.loot[r]).map((r) => Math.round(kd.loot[r] * m) + ' ' + r).join(' · ') + '</span></span><button class="mini" type="button" data-a="send:' + k + '">Send</button></div>';
          }
        }
      }
      h += '<h3>Routes</h3>';
      for (const r of V.routes) h += '<div class="li"><span class="grow"><span class="t">' + esc(r.name) + '</span><span class="s">' + (r.unlocked ? 'Open' + (r.odds != null ? ' · ' + pct(r.odds) + ' for you' : '') : 'Radio Mast Lv ' + D.ROUTES.find((x) => x.id === r.id).radio) + '</span></span>' + (r.unlocked ? '' : ic('lock')) + '</div>';
    } else if (id === 'generator') {
      if (L) h += '<div class="li"><span class="grow"><span class="t">Charge ' + V.generator.charges + ' / ' + V.generator.holds + '</span><span class="s">Next battery in <span data-live="gen"></span></span></span>' + (V.generator.charges ? '<button class="mini primary" type="button" data-a="collect:generator">Collect</button>' : '') + '</div>';
    }
    return h ? '<div class="panel">' + h + '</div>' : '';
  }
  function craftPanel(b, items) {
    let h = '<h3>Craft</h3>';
    const q = S.craft[b];
    for (const it of items) {
      const d = D.CRAFTS[it], queued = q.filter((c) => c.item === it).length, full = S.stock[it] + queued >= D.STOCK_MAX;
      const cost = RES.filter((k) => d.cost[k]).map((k) => d.cost[k] + ' ' + k).join(' + ');
      h += '<div class="li">' + ic(it) + '<span class="grow"><span class="t">' + esc(ITEM_NAME[it]) + ' · stock ' + S.stock[it] + ' / 3</span><span class="s">' + esc(cost) + ' · ' + fmt.dur(d.time * (S.dev.mul.time || 1)) + '</span></span>' +
        '<button class="mini' + (full || q.length >= D.QUEUE_MAX ? ' off' : ' primary') + '" type="button" data-a="craft:' + it + '">Craft</button></div>';
    }
    if (q.length) {
      h += '<h3>Queue · ' + q.length + ' / ' + D.QUEUE_MAX + '</h3>';
      q.forEach((c, i) => {
        h += '<div class="li">' + ic(c.item) + '<span class="grow"><span class="t">' + esc(ITEM_NAME[c.item]) + '</span><span class="s">' + (i === 0 ? 'Ready in <span data-live="clock:craft:' + b + '"></span>' : 'Waiting') + '</span></span>' + (i === 0 ? skipBtn('craft', b) : '') + '</div>';
      });
    }
    return h;
  }
  function sheetHtml(id) {
    const { L, N, job } = sheetLevels(id), hs = V.hotspots[id];
    const locked = hs.state === 'locked';
    let h = '<p class="desc">' + esc(DESC[id]) + '</p>';
    if (locked) {
      h += '<p class="note">Opens at Camp Lv ' + B[id].unlockCL + '. Upgrade the Campfire to get there.</p>';
    } else {
      const ef = effects(id, L, N);
      for (const r of ef.rows) h += erow(r[0], r[1], r[2], r[3]);
      if (ef.run) h += '<div class="runrow">' + esc(ef.run) + '</div>';
      if (!job && N) h += costHtml(V.next[id].cost);
      if (V.next[id].reason === 'resources' && !job) { const nx = V.next[id]; if (nx.shortfall) h += '<p class="desc">Or wait: ' + esc(nx.shortfall.parts.map((p) => fmt.dur(p.sec) + ' of ' + p.res).join(', ')) + ' at the current rate.</p>'; }
    }
    h += panel(id);
    return h;
  }
  function sheetHead(id) {
    const { L, N, job, max } = sheetLevels(id), hs = V.hotspots[id];
    const lv = hs.state === 'locked' ? 'LOCKED' : !L && !job ? 'NEW · LV 1' : N ? 'LV ' + L + ' → ' + N : 'LV ' + max + ' · MAX';
    return { name: B[id].name, lv };
  }
  function renderSheet(t, force) {
    if (!ui.sheet) return;
    const id = ui.sheet;
    if (force || !ui.sheetHtml || t - ui.sheetAt > 250) {
      ui.sheetAt = t;
      const hd = sheetHead(id), html = sheetHtml(id);
      setText($('sheetName'), hd.name); setText($('sheetLv'), hd.lv);
      if (html !== ui.sheetHtml) { const body = $('sheetBody'), sc = body.scrollTop; body.innerHTML = html; body.scrollTop = sc; ui.sheetHtml = html; }
    }
    liveUpdate($('sheetBody'));
    const a = sheetAction(id), btn = $('sheetAct');
    setText(btn, a.label);
    const cls = 'act ' + (a.cls || ''); if (btn.className !== cls) btn.className = cls;
    btn._fn = a.fn;
    if (btn._lab !== a.label) { btn.setAttribute('aria-label', a.label); btn._lab = a.label; }
  }
  function timerFor(kind, id) {
    if (kind === 'job') return V.jobs.find((j) => j.id === id) || null;
    if (kind === 'craft') { const c = V.crafts[id] && V.crafts[id][0]; return c ? c.timer : null; }
    if (kind === 'recruit') return V.recruit;
    if (kind === 'party') return V.parties.find((p) => p.id === id && !p.back) || null;
    if (kind === 'injury') {
      const p = V.people.find((x) => x.id === id && x.state === 'injured'); if (!p) return null;
      const sec = p.leftMs / 1000, price = E.price.skip(sec, S);
      return { leftSec: sec, price, free: price === 0, confirm: price >= D.SKIP.confirmAt, clock: fmt.clock(sec), progress: 0 };
    }
    return null;
  }
  function timerAction(target, t) {
    const key = target.kind + ':' + target.id;
    if (t.free) return { label: 'FINISH FREE', cls: 'go', fn: () => act({ type: 'finishFree', target }) };
    const conf = ui.confirm && ui.confirm.key === key && now() < ui.confirm.until;
    return { label: conf ? 'Confirm ' + t.price + '?' : 'SKIP · ' + t.price, cls: conf ? 'confirm' : 'bat', fn: () => skip(target, t.price) };
  }
  function skip(target, price) {
    const key = target.kind + ':' + target.id;
    if (price >= D.SKIP.confirmAt && !(ui.confirm && ui.confirm.key === key && now() < ui.confirm.until)) { ui.confirm = { key, until: now() + 3000 }; sfx('tap'); return; }
    ui.confirm = null;
    if (S.res.bat < price) { toast('Not enough batteries: ' + price + ' needed'); shake($('c-bat')); sfx('deny'); return; }
    act({ type: 'skip', target, confirm: true });
  }
  function sheetAction(id) {
    const hs = V.hotspots[id], nx = V.next[id];
    if (hs.state === 'locked') return { label: 'Needs Camp Lv ' + B[id].unlockCL, cls: 'blocked', fn: () => jump('campfire') };
    const job = V.jobs.find((j) => j.id === id);
    if (job) return timerAction({ kind: 'job', id }, job);
    if (nx.ok) return { label: nx.label, cls: 'primary', fn: () => act({ type: 'build', id }) };
    switch (nx.reason) {
      case 'max': return { label: 'MAX LEVEL', cls: 'blocked', fn: null };
      case 'cl': return { label: nx.label, cls: 'blocked', fn: () => jump('campfire') };
      case 'storage': return { label: nx.label, cls: 'blocked', fn: () => jump('storehouse') };
      case 'survivors': return { label: nx.label, cls: 'blocked', fn: () => jump(S.lv.radio >= 1 && V.freeBeds >= 1 ? 'radio' : V.freeBeds >= 1 ? 'play' : 'bunkhouse') };
      case 'bp': return { label: nx.label, cls: 'blocked', fn: () => jump('play') };
      case 'crews': { const j = V.jobs.slice().sort((a, b) => a.left - b.left)[0]; return { label: 'Crews busy · next free in ' + (j ? j.clock : ''), cls: 'blocked', fn: () => j && jump(j.id) }; }
      case 'resources': {
        if (nx.shortfall) {
          const key = 'buildNow:' + id, p = nx.shortfall.price, conf = ui.confirm && ui.confirm.key === key && now() < ui.confirm.until;
          return { label: conf ? 'Confirm ' + p + '?' : nx.shortfall.label, cls: (conf ? 'confirm' : 'bat') + ' short', fn: () => buildNow(id, p) };
        }
        return { label: nx.label, cls: 'blocked', fn: () => cantAfford(nx) };
      }
      default: return { label: nx.label || '', cls: 'blocked', fn: null };
    }
  }
  function buildNow(id, price) {
    const key = 'buildNow:' + id;
    if (price >= D.SKIP.confirmAt && !(ui.confirm && ui.confirm.key === key && now() < ui.confirm.until)) { ui.confirm = { key, until: now() + 3000 }; sfx('tap'); return; }
    ui.confirm = null;
    if (S.res.bat < price) { cantAfford(V.next[id]); shake($('c-bat')); toast('Not enough batteries: ' + price + ' needed'); return; }
    act({ type: 'buildNow', id });
  }
  function cantAfford(nx) {
    sfx('deny');
    const miss = (nx && nx.missing) || {};
    const keys = Object.keys(miss).length ? Object.keys(miss) : RES.filter((k) => nx && nx.cost && S.res[k] < nx.cost[k]);
    for (const k of keys) { shake($('c-' + k)); const c = $('sheetBody').querySelector('.cost[data-res="' + k + '"]'); if (c) shake(c); }
    if (nx && nx.label) toast(nx.label);
  }
  function liveText(key) {
    const p = key.split(':');
    if (p[0] === 'clock') { const t = timerFor(p[1], p[2]); return t ? t.clock : '–'; }
    if (p[0] === 'skipbtn') { const t = timerFor(p[1], p[2]); if (!t) return { t: '–', c: 'mini off' }; const a = timerAction({ kind: p[1], id: p[2] }, t); return { t: a.label, c: 'mini ' + a.cls }; }
    if (p[0] === 'stored') { const b = V.buffers[p[1]]; return b ? b.stored + ' / ' + Math.floor(b.cap) : '0'; }
    if (p[0] === 'fullin') { const b = V.buffers[p[1]]; return !b || !b.rate ? '–' : b.full ? 'FULL' : fmt.clock(b.fullInMs / 1000); }
    if (p[0] === 'gen') return V.generator.charges >= V.generator.holds ? 'full' : V.generator.nextInMs != null ? fmt.clock(V.generator.nextInMs / 1000) : '–';
    return '';
  }
  function liveUpdate(rootEl) {
    for (const el of rootEl.querySelectorAll('[data-live]')) {
      const v = liveText(el.dataset.live);
      if (typeof v === 'string') setText(el, v);
      else { setText(el, v.t); if (el.className !== v.c) el.className = v.c; }
    }
  }
  function sheetClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return;
    gesture();
    const [a, x, y] = b.dataset.a.split(':');
    switch (a) {
      case 'craft': act({ type: 'craft', item: x }); break;
      case 'collect': act({ type: 'collect', id: x }); break;
      case 'collectAll': act({ type: 'collectAll' }); break;
      case 'unload': act({ type: 'unloadTruck' }); break;
      case 'unlock': act({ type: 'unlockWeapon', weapon: x }); break;
      case 'recruit': act({ type: 'recruit' }); break;
      case 'send': act({ type: 'sendParty', kind: x }); break;
      case 'buyCrew': { const k = 'crew'; if (!(ui.confirm && ui.confirm.key === k && now() < ui.confirm.until)) { ui.confirm = { key: k, until: now() + 3000 }; b.textContent = 'Confirm 250?'; return; } ui.confirm = null; act({ type: 'buyCrew' }); break; }
      case 'jump': jump(x); break;
      case 'skip': { const t = timerFor(x, y); if (!t) return; if (t.free) act({ type: 'finishFree', target: { kind: x, id: y } }); else skip({ kind: x, id: y }, t.price); break; }
      default: break;
    }
  }

  // ------------------------------------------------------------------ route + loadout overlay
  function openRoutes(routeId) {
    if (S.pending) { beginRunScreen(); return; }
    closeSheet();
    if (routeId && routeId !== S.loadout.route && E.routeUnlocked(S, routeId)) act({ type: 'setLoadout', patch: { route: routeId } }, { quiet: true });
    if (!E.routeUnlocked(S, S.loadout.route)) act({ type: 'setLoadout', patch: { route: 'R1' } }, { quiet: true });
    ui.overlay = 'routes'; ui.routesHtml = '';
    const el = $('routes'); el.hidden = false; arm(el);
    $('start').hidden = false; arm($('start'));
    renderRoutes(true);
    E.log(S, 'screen', { name: 'routes' });
    sfx('tap');
  }
  function closeRoutes() { ui.overlay = null; $('routes').hidden = true; $('start').hidden = true; setTimeout(pumpCards, 300); }
  function renderRoutes(force) {
    const sel = S.loadout.route, o = E.odds(S, sel), h = E.buildHandoff(S, sel, null);
    let L = '<div class="ohead"><button class="iconbtn" type="button" data-a="close" aria-label="Back to camp"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-back"/></svg></button><h2>Choose a run</h2></div>';
    for (const r of V.routes) {
      const R = D.ROUTES.find((x) => x.id === r.id), isSel = r.id === sel;
      const danger = '<span class="danger" aria-hidden="true">' + [1, 2, 3, 4, 5].map((i) => '<i class="' + (i <= R.danger ? 'on' : '') + '"></i>').join('') + '</span>';
      const haul = '<span class="haul">' + RES.filter((k) => R.haul[k]).map((k) => ic(k, 'c-' + k)).join('') + '</span>';
      const meta = danger + haul + '<span>rescue ' + pct(R.rescue) + '</span>' + (r.intel > 0 ? '<span class="c-bat">Intel +' + r.intel * (S.dev.intelG || 3) + ' gear</span>' : '');
      const desc = R.haul.scrap + ' scrap · ' + R.haul.food + ' food' + (R.haul.meds ? ' · ' + R.haul.meds + ' meds' : '') + ' on a win' + (R.bp ? ' · BP ' + pct(R.bp) : '') + (r.firstWin ? '' : ' · first win +' + R.firstBat + ' bat, +2 BP');
      const right = r.unlocked ? '<span class="odds">' + pct(r.odds) + (r.id === V.frontier ? '<small>FRONTIER</small>' : '') + '</span>' : '<span class="odds" style="font-size:13px;color:var(--ink-soft)">' + ic('lock') + ' ' + esc(r.req) + '</span>';
      L += '<button class="route' + (isSel ? ' sel' : '') + (r.unlocked ? '' : ' locked') + '" type="button" data-route="' + r.id + '" aria-pressed="' + isSel + '" aria-label="' + esc(R.name + ', danger ' + R.danger + (r.unlocked ? ', ' + pct(r.odds) + ' odds' : ', locked: ' + r.req)) + '"><span style="min-width:0;display:grid"><span class="rn">' + esc(R.name) + '</span><span class="rm">' + meta + '</span><span class="rd">' + esc(desc) + '</span></span>' + right + '</button>';
    }
    let Rt = '<div class="seg" role="radiogroup" aria-label="Primary weapon">';
    for (const w of D.WEAPON_ORDER) if (V.weapons[w]) Rt += '<button type="button" role="radio" aria-checked="' + (h.loadout.primary === w) + '" data-a="weapon:' + w + '" aria-label="' + D.WEAPONS[w].name + '"><svg viewBox="0 0 32 16" aria-hidden="true"><use href="#i-' + w + '"/></svg>' + esc(D.WEAPONS[w].name) + '</button>';
    Rt += '</div><div class="items">';
    for (const k of ITEMS) {
      const st = S.stock[k], on = st > 0 && S.loadout.use[k], dl = o.deltas[k];
      Rt += '<button class="item' + (st > 0 ? '' : ' none') + '" type="button" aria-pressed="' + !!on + '" data-a="item:' + k + '" aria-label="' + esc(ITEM_NAME[k] + ': ' + st + ' in stock' + (dl != null ? ', ' + (dl >= 0 ? '+' : '') + Math.round(dl * 100) + '% odds' : '')) + '">' + ic(k) + '<span class="it"><b>' + esc(k === 'bomb' ? 'Bomb' : ITEM_NAME[k]) + '</b><small>' + (dl != null ? (dl >= 0 ? '+' : '') + Math.round(dl * 100) + '%' : 'none') + '</small></span><span class="n">' + st + '</span></button>';
    }
    Rt += '</div>';
    const rn = V.runner;
    Rt += '<button class="runner" type="button" data-a="runner" aria-label="Runner: ' + esc(rn ? rn.name : 'nobody') + (rn && rn.hurt ? ', hurt' : '') + '. Tap for the next person">' + ic('surv') + '<b>' + esc(rn ? rn.name : '–') + '</b><span class="s' + (rn && rn.hurt ? ' red' : '') + '">' + (rn && rn.hurt ? 'hurt 60%' : 'fit') + '</span><span class="cyc">RUNNER ›</span></button>';
    Rt += '<div class="summary">Max HP ' + h.stats.maxHp + ' · Second wind ×' + h.stats.secondWind + ' · Warning ' + h.stats.hordeWarnS.toFixed(1) + ' s · Light ' + h.stats.flashlightR + '</div>';
    Rt += '<div class="bigodds"><b>' + pct(o.odds) + '</b><span>gear ' + o.gear + '<br>' + (V.forcedRun ? '<span class="tut">Tutorial run: you\'ll make it</span>' : esc(D.ROUTES.find((x) => x.id === sel).name)) + '</span></div>';
    Rt += '<details class="payload" id="payloadBox"' + (ui.payloadOpen ? ' open' : '') + '><summary>Sent to Two Thumbs Left (prototype)</summary><pre id="handoffJson"></pre><p class="pnote">Camp mode: the start room holds only the ammo box; the map spawns route.mapSupplies. The seed is drawn at START.</p></details>';
    const html = L + '|' + Rt;
    if (force || html !== ui.routesHtml) {         // structure only: the JSON below is text and never re-renders a button
      ui.routesHtml = html;
      const ls = $('loadout').scrollTop;
      $('routeList').innerHTML = L; $('loadout').innerHTML = Rt; $('loadout').scrollTop = ls;
      const pb = $('payloadBox'); if (pb) pb.addEventListener('toggle', () => { ui.payloadOpen = pb.open; });
    }
    setText($('handoffJson'), JSON.stringify(h, null, 1));
    $('start').setAttribute('aria-label', 'Start the simulated run on ' + D.ROUTES.find((x) => x.id === sel).name + ', ' + pct(o.odds));
  }
  function routesClick(e) {
    const r = e.target.closest('[data-route]');
    gesture();
    if (r) {
      const id = r.dataset.route;
      if (!E.routeUnlocked(S, id)) { toast(D.ROUTES.find((x) => x.id === id).name + ' needs Radio Mast Lv ' + D.ROUTES.find((x) => x.id === id).radio); sfx('deny'); return; }
      act({ type: 'setLoadout', patch: { route: id } }); sfx('tap'); renderRoutes(true); return;
    }
    const b = e.target.closest('[data-a]'); if (!b) return;
    const [a, x] = b.dataset.a.split(':');
    if (a === 'close') { closeRoutes(); return; }
    if (a === 'weapon') act({ type: 'setLoadout', patch: { primary: x } });
    else if (a === 'item') {
      if (!(S.stock[x] > 0)) { toast(x === 'bomb' ? 'No noise bombs: craft them at the Workbench (Lv 3)' : 'No ' + ITEM_NAME[x].toLowerCase() + ' in stock: craft at the Infirmary'); sfx('deny'); return; }
      act({ type: 'setLoadout', patch: { use: { [x]: !S.loadout.use[x] } } });
    } else if (a === 'runner') {
      const ppl = S.people.filter((p) => p.state !== 'party'); if (ppl.length < 2) { toast('Nobody else can run'); return; }
      const cur = V.runner ? ppl.findIndex((p) => p.id === V.runner.id) : -1, nx = ppl[(cur + 1) % ppl.length];
      act({ type: 'setLoadout', patch: { runner: nx.id } });
    }
    sfx('tap'); renderRoutes(true);
  }
  function startRun() {
    gesture();
    if (ui.overlay !== 'routes') return;
    const r = act({ type: 'startRun', routeId: S.loadout.route, external: !!ui.external });
    if (!r.ok) return;
    ui.overlay = null; $('routes').hidden = true; $('start').hidden = true;
    sfx('radio');
    beginRunScreen();
  }

  // ------------------------------------------------------------------ run screen
  let run = null;
  const fmtT = (s) => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  function beginRunScreen() {
    const p = S.pending; if (!p) return;
    closeSheet();
    ui.overlay = 'run';
    const el = $('runscr'); el.hidden = false; arm(el);
    $('runName').textContent = p.handoff.route.name;
    $('ticker').innerHTML = ''; $('stripMarks').innerHTML = '';
    $('runDot').className = 'dot'; $('runDot').style.left = '0%'; $('stripDone').style.transform = 'scaleX(0)';
    E.log(S, 'screen', { name: 'run' });
    if (p.source !== 'sim') {
      run = { waiting: true };
      $('ticker').innerHTML = '<p>Waiting for Two Thumbs Left · paste the result in the Lab</p><p><button class="mini primary" type="button" data-a="openLab">Open the Lab</button> <button class="mini" type="button" data-a="cancelRun">Cancel this run</button></p>';
      setHp(p.handoff.stats.startHp, 0, p.handoff.stats.maxHp);
      return;
    }
    const res = E.runSim(S), h = p.handoff;
    run = { res, h, t0: now(), dur: (S.dev.runScreenSec || 8) * 1000, idx: 0, hp: h.stats.startHp, max: h.stats.maxHp, temp: 0, caches: 0, gateAt: null, gateOpen: false, rescue: false, ended: false, endAt: 0, resolved: false };
    const marks = res.events.filter((e) => e[1] === 'wander' || e[1] === 'horde' || e[1] === 'cache').map((e) => '<i class="mk ' + e[1] + '" style="left:' + (100 * e[0] * res.progress / Math.max(1, res.time)).toFixed(2) + '%"></i>').join('');
    $('stripMarks').innerHTML = marks;
    setHp(run.hp, 0, run.max);
    tick('00:00 Out of the safe room. ' + (h.runner ? h.runner.name : '') + (h.runner && h.runner.hurt ? ' is hurt.' : ' is fit.'), '');
  }
  function tick(text, cls) {
    const box = $('ticker');
    for (const p of box.querySelectorAll('p')) p.classList.add('old');
    const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls; box.appendChild(p);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    sfx('tickline');
  }
  function setHp(hp, temp, max) {
    const f = $('hpFill'), tp = $('hpTemp');
    f.style.transform = 'scaleX(' + clamp(hp / max, 0, 1).toFixed(3) + ')'; f.classList.toggle('low', hp / max < 0.35);
    tp.style.transform = 'scaleX(' + clamp((hp + temp) / max, 0, 1).toFixed(3) + ')';
    $('hpNum').textContent = Math.max(0, Math.round(hp)); $('hpTag').textContent = temp > 0 ? '+' + Math.round(temp) : '';
  }
  function runEvent(e) {
    const [t, k] = e, h = run.h, ts = fmtT(t);
    if (k === 'wander' || k === 'horde' || k === 'gate') {
      let d = e[2] || 0; const ft = Math.min(run.temp, d); run.temp -= ft; run.hp = Math.max(1, run.hp - (d - ft));
      if (k === 'wander') tick(ts + ' Wanderers. ' + (e[3] || 0) + ' down.', '');
      else if (k === 'horde') { tick(ts + ' HORDE! Warned ' + h.stats.hordeWarnS.toFixed(1) + ' s early. ' + (e[3] || 0) + ' down.', 'horde'); sfx('horde'); }
      else { tick(ts + ' Gate switch. Alarm!', 'horde'); run.gateAt = t; sfx('horde'); }
      run.temp = Math.max(0, run.temp - 10.8);
    } else if (k === 'pills') { run.temp = Math.min(run.max - run.hp, run.temp + 50); tick('Pills. +50.', 'good'); }
    else if (k === 'medkit') { run.hp = Math.min(run.max, run.hp + (e[2] || 0)); tick('Medkit. Patched up.', 'good'); }
    else if (k === 'bomb') tick('Noise bomb out. The horde turns.', '');
    else if (k === 'secondWind') { run.hp = 1; run.temp = 0; tick('SECOND WIND.', 'sw'); const el = $('runscr'); el.classList.remove('flashred-bg'); void el.offsetWidth; el.classList.add('flashred-bg'); sfx('secondWind'); }
    else if (k === 'cache') {
      const order = ['scrap', 'food', 'scrap', 'meds'], kk = order[run.caches % 4], v = Run.CACHE[h.route.danger - 1][kk];
      run.caches++; tick('Supply cache: +' + v + ' ' + kk + '.', 'good');
    } else if (k === 'overrun') { run.hp = 0; run.temp = 0; }
    setHp(run.hp, run.temp, run.max);
  }
  function updateRun(t) {
    if (!run || run.waiting || ui.overlay !== 'run') return;
    const r = run.res, k = clamp((t - run.t0) / run.dur, 0, 1), tau = k * r.time;
    const ev = r.events;
    while (run.idx < ev.length && ev[run.idx][0] <= tau && ev[run.idx][1] !== 'safe_room' && ev[run.idx][1] !== 'overrun_end') { run.lastT = ev[run.idx][0]; runEvent(ev[run.idx++]); }
    if (r.result === 'safe_room' && run.gateAt != null && !run.gateOpen && tau >= 0.92 * r.time) { run.gateOpen = true; tick('Gate open. RUN!', 'horde'); }
    if (r.rescued && !run.rescue && tau >= r.time - 10 && run.h.route.rescue) {
      run.rescue = true; tick(run.h.route.rescue.name + ' was hiding ' + D.ROUTE_PLACE[run.h.route.id] + '. Coming with you.', 'good');
    }
    const x = ((ui.reduced && k < 1 ? run.lastT || 0 : tau) / Math.max(1, r.time)) * r.progress * 100;   // reduced motion: the dot jumps between events
    $('runDot').style.left = x.toFixed(2) + '%'; $('stripDone').style.transform = 'scaleX(' + (x / 100).toFixed(3) + ')';
    if (k >= 1 && !run.ended) {
      run.ended = true; run.endAt = t;
      while (run.idx < ev.length) { const e = ev[run.idx++]; if (e[1] !== 'safe_room' && e[1] !== 'overrun_end') runEvent(e); }
      const win = r.result === 'safe_room';
      if (!win) $('runDot').classList.add('dead');
      tick(win ? 'You made it.' : 'Overrun.', 'end ' + (win ? 'good' : 'sw'));
      sfx(win ? 'win' : 'loss');
    }
    if (run.ended && !run.resolved && t - run.endAt > 1100) finishRun();
  }
  function skipRun() { gesture(); if (run && !run.waiting && !run.ended) run.t0 = now() - run.dur - 1; else if (run && run.ended && !run.resolved) finishRun(); }
  function finishRun() {
    if (!run || run.resolved) return;
    run.resolved = true;
    const r = act({ type: 'resolveRun', result: run.res });
    $('runscr').hidden = true; ui.overlay = null;
    if (!r.ok) { setTimeout(pumpCards, 200); return; }
    showResult(r.reward, r.result);
  }
  // A result from outside the sim (the Lab's paste box, or one day the real game): validated against the pending
  // handoff by the engine and then shown exactly like a simulated run.
  function resolveWith(result) {
    if (!S.pending) return { ok: false, err: 'No run is waiting for a result', errors: ['No run is waiting for a result'] };
    const r = act({ type: 'resolveRun', result }, { quiet: true });
    if (!r.ok) return Object.assign({ errors: r.errors || [r.err] }, r);
    if (run) run.resolved = true;
    run = null; $('runscr').hidden = true; if (ui.overlay === 'run') ui.overlay = null;
    sfx(r.reward && r.reward.win ? 'win' : 'loss');
    showResult(r.reward, r.result);
    return r;
  }

  // ------------------------------------------------------------------ result and loss cards
  function showResult(rw, res) {
    ui.overlay = 'result';
    const h = S.lastHandoff, win = rw.win, route = D.ROUTES.find((r) => r.id === rw.route);
    let L = '<p class="kick">' + esc(route.name) + ' · simulated</p><h2 class="rtitle ' + (win ? 'win' : 'loss') + '">' + (win ? 'You made it.' : 'Overrun.') + '</h2>';
    if (!win) L += '<p class="where">' + esc(({ gate: 'at the gate', horde: 'in a horde', wander: 'by wanderers' }[res.endedAt] || 'on the road') + ', ' + fmt.clock(res.time) + ', ' + pct(res.progress) + ' of the way') + '</p>';
    const st = [['Time', fmt.clock(res.time)], ['Kills', res.kills], ['Accuracy', res.accuracy + '%'], ['Shoves', res.shoves], ['Damage taken', res.damageTaken], ['Hordes', res.hordes]];
    L += '<dl class="stats">' + st.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>').join('') + '</dl>';
    const box = '<details class="payload" id="resultBox"' + (ui.resultPayloadOpen ? ' open' : '') + '><summary>Received from the run</summary><pre id="resultJson">' + esc(JSON.stringify(res, null, 1)) + '</pre><p class="pnote">The result carries no loot: the camp pays from these stats.</p></details>';
    let R = '';
    const hv = rw.haul, cnt = (k, n) => '<span class="c-' + k + '">' + ic(k) + '+<b data-count="' + n + '">0</b></span>';
    const row = (k, inner, cls) => '<div class="lrow' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span><span class="v">' + inner + '</span></div>';
    if (win) {
      const cache = { scrap: 0, food: 0, meds: 0 }; let nc = 0;
      for (const p of hv.parts) {
        if (p[0] === 'haul') R += row('Haul', RES.map((k, i) => (p[i + 1] ? cnt(k, p[i + 1]) : '')).join(''));
        else if (p[0] === 'cache') { cache[p[1]] += p[2]; nc++; }
        else if (p[0] === 'salvage' && p[1]) R += row('Salvage', cnt('scrap', p[1]));
      }
      if (nc) R += row(nc > 1 ? nc + ' caches' : 'Cache', RES.map((k) => (cache[k] ? cnt(k, cache[k]) : '')).join(''));
      if (rw.bp.total) R += row('Blueprints', '<span class="c-bp">' + ic('bp') + '+' + rw.bp.total + '</span><span style="font-weight:600;color:var(--ink-soft)">' + esc([rw.bp.first ? 'first win' : '', rw.bp.drop ? (rw.bp.pity ? 'pity drop' : 'drop') : ''].filter(Boolean).join(' + ') + ' · ' + S.res.bp + ' BP') + '</span>');
      if (rw.bat.length) R += row('Batteries', '<span class="c-bat" id="resBat">' + ic('bat') + '+' + rw.batTotal + '</span><span style="font-weight:600;color:var(--ink-soft)">' + esc(rw.bat.map((b) => ({ firstWin: 'first win', dailyWin: 'daily win', drop: 'drop' }[b.src] || b.src) + ' ' + b.n).join(' · ')) + '</span>');
      if (rw.momentum && rw.momentum.length) R += '<div class="lrow mom">Crews pushed: ' + esc(rw.momentum.map((m) => m.text).join(', ')) + '</div>';
      if (rw.injury) R += '<div class="lrow warn">' + esc((h.runner ? h.runner.name : 'The runner') + ' used second wind: hurt for ' + fmt.dur(rw.injury.min * 60)) + '</div>';
      if (rw.rescue) {
        const r = rw.rescue, p = E.view(S, { odds: false }).people.find((x) => x.name === r.name);
        const line = (r.where === 'bed' ? D.ARRIVAL_LINES.rescue : D.ARRIVAL_LINES[r.where]).replace('{name}', r.name).replace('{place}', r.place);
        L += personHtml(r.name, line, r.where === 'bed' ? p : null);
      }
      R += '<p class="where">The loot is in the crate by the fire.</p>';
    } else {
      R += row('Kept', RES.map((k) => (hv[k] ? cnt(k, hv[k]) : '')).join('') || 'nothing');
      const used = ITEMS.filter((k) => rw.items.used[k]).map((k) => ITEM_NAME[k].toLowerCase());
      const back = ITEMS.filter((k) => rw.items.returned[k]).map((k) => ITEM_NAME[k].toLowerCase());
      R += row('Used', esc(used.length ? used.join(', ') : 'nothing') + (back.length ? '<span style="font-weight:600;color:var(--ink-soft)">' + esc(back.join(', ')) + ' came home</span>' : ''));
      if (rw.injury && h.runner) {
        R += '<div class="hurt"><span class="red">' + esc(h.runner.name + ' is hurt, back in ' + fmt.dur(rw.injury.min * 60)) + '</span><button class="mini" type="button" data-a="rest">Rest</button>' + skipBtn('injury', h.runner.id) + '</div>';
      }
      const lh = E.lossHint(S, rw.route);
      R += row('Intel', '<span style="font-weight:700">' + esc(lh.intel.text) + '</span>', 'wrap');
      R += '<button class="hint' + (lh.target || lh.kind === 'equip' || lh.kind === 'route' ? ' tap' : '') + '" type="button" data-a="hint:' + (lh.target || lh.route || '') + ':' + lh.kind + '">' + esc(lh.text) + '</button>';
    }
    $('resLeft').innerHTML = L + box; $('resRight').innerHTML = R;
    const rb = $('resultBox'); if (rb) rb.addEventListener('toggle', () => { ui.resultPayloadOpen = rb.open; });
    const el = $('result'); el.hidden = false; el.scrollTop = 0; arm(el);
    $('resultBack').hidden = false; arm($('resultBack'));
    E.log(S, 'screen', { name: win ? 'result' : 'loss' });
    // count-ups and the battery flight
    const t0 = now();
    const counts = Array.from(el.querySelectorAll('[data-count]'));
    const stepCount = () => {
      const k = clamp((now() - t0) / 600, 0, 1);
      for (const c of counts) c.textContent = Math.round(+c.dataset.count * (ui.reduced ? 1 : k));
      if (k < 1 && !el.hidden) requestAnimationFrame(stepCount);
    };
    stepCount();
    if (rw.batTotal) setTimeout(() => { const b = $('resBat'); fly('bat', rw.batTotal, b ? centre(b) : { x: innerWidth / 2, y: innerHeight / 2 }, { preHeld: true }); }, 650);
    else ui.held.bat = Math.max(0, ui.held.bat - (rw.batTotal || 0));
  }
  function resultClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return;
    gesture();
    const [a, x, y] = b.dataset.a.split(':');
    if (a === 'rest') { b.textContent = 'Resting'; b.classList.add('off'); }
    else if (a === 'skip') { const t = timerFor(x, y); if (!t) return; if (t.free) act({ type: 'finishFree', target: { kind: x, id: y } }); else skip({ kind: x, id: y }, t.price); }
    else if (a === 'hint') {
      closeResult();
      if (y === 'equip') openRoutes();
      else if (y === 'route' && x) openRoutes(x);
      else if (x && B[x]) openSheet(x);
    }
  }
  function closeResult() {
    $('result').hidden = true; $('resultBack').hidden = true; ui.overlay = null;
    setTimeout(pumpCards, 400);
  }

  // ------------------------------------------------------------------ FTUE coach and the idle hand
  function hotRect(key) {
    const h = Scene.hotspots().find((x) => x.key === key); if (!h) return null;
    return { left: h.x, top: h.y, width: h.w, height: h.h, right: h.x + h.w, bottom: h.y + h.h };
  }
  function elRect(el) { if (!el || el.hidden || el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return null; const r = el.getBoundingClientRect(); return r.width ? r : null; }
  function coachTarget(t) {
    if (ui.modal || paused) return null;
    if (!S.ftue.done) {
      const f = D.FTUE[Math.min(5, S.ftue.step)];
      if (t < ui.coachAfter) return { rect: hotRect('campfire'), line: D.FTUE[0].after, noHand: true, spot: true };
      if (ui.overlay === 'run') return null;
      if (ui.overlay === 'result') return { rect: elRect($('resultBack')), line: null };
      if (ui.overlay === 'routes') return { rect: elRect($('start')), line: f.line };
      switch (f.target) {
        case 'fire': return { rect: hotRect('campfire'), line: f.line, spot: true };
        case 'pile': return { rect: hotRect('pile'), line: f.line, spot: true };
        case 'salvage': return ui.sheet === 'salvage' ? { rect: elRect($('sheetAct')), line: f.line, inSheet: true } : { rect: hotRect('salvage'), line: f.line, spot: true };
        case 'play': return { rect: elRect($('play')), line: f.line };
        case 'crate': return S.crate ? { rect: hotRect('crate'), line: f.line, spot: true } : null;
        case 'campfire': return ui.sheet === 'campfire' ? { rect: elRect($('sheetAct')), line: f.line, inSheet: true } : { rect: hotRect('campfire'), line: f.line, spot: true };
        default: return null;
      }
    }
    if (ui.overlay || !G) return null;
    const m = G.main, key = m.text;
    if (ui.handKey !== key) { ui.handKey = key; }
    const doable = !m.blocked && m.etaSec === 0 && m.kind !== 'done';
    if (!doable || t - ui.lastInput < 12000 || ui.handFor === key) return null;
    let rect = null;
    if (m.target === 'play') rect = elRect($('play'));
    else if (ui.sheet === m.target) { rect = elRect($('sheetAct')); }
    else if (B[m.target]) rect = hotRect(m.target);
    if (!rect) return null;
    ui.handShowing = key;
    return { rect, line: null };
  }
  function updateCoach(t) {
    const c = coachTarget(t), co = $('coach'), hand = $('hand'), spot = $('spot');
    if (!c || !c.rect) { setHidden(co, true); setHidden(hand, true); setHidden(spot, true); return; }
    const r = c.rect, cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (c.line) {
      setText($('coachLine'), c.line); setHidden(co, false);
      const bw = co.offsetWidth || 180, bh = co.offsetHeight || 50, W = innerWidth, top = Scene.camera ? 0 : 0;
      let x = clamp(cx - bw / 2, 8, W - bw - 8), y = r.top - bh - 14;
      if (y < 50 + top) y = r.bottom + 14;
      if (y + bh > innerHeight - 4) y = Math.max(50, r.top - bh - 14);
      if (r.left > W * 0.62 && r.top > innerHeight * 0.6) { x = clamp(r.left - bw - 12, 8, W - bw - 8); y = clamp(cy - bh / 2 - 30, 50, innerHeight - bh - 8); }
      if (c.inSheet) { const sr = $('sheet').getBoundingClientRect(); x = ui.side === 'right' ? sr.left - bw - 10 : sr.right + 10; x = clamp(x, 8, W - bw - 8); y = clamp(cy - bh / 2, 50, innerHeight - bh - 8); }
      co.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    } else setHidden(co, true);
    if (!c.noHand) { setHidden(hand, false); hand.style.transform = 'translate(' + Math.round(cx - 14) + 'px,' + Math.round(cy - 2) + 'px)'; } else setHidden(hand, true);
    if (c.spot && !ui.overlay) {
      setHidden(spot, false);
      const rad = Math.max(r.width, r.height) / 2 + 16, bg = 'radial-gradient(circle at ' + Math.round(cx) + 'px ' + Math.round(cy) + 'px, rgba(3,4,7,0) ' + Math.round(rad) + 'px, rgba(3,4,7,.5) ' + Math.round(rad + 40) + 'px)';
      if (spot._bg !== bg) { spot.style.background = bg; spot._bg = bg; }
    } else setHidden(spot, true);
  }

  // ------------------------------------------------------------------ save, load, tabs, visibility
  function save() {
    ui.lastSave = now();
    if (demo || noSave || paused || !S) return;
    S.tabId = myTab;
    let raw; try { raw = E.serialize(S); } catch (e) { return; }
    const ok = store.set(KEY, raw);
    if (!ok && !store.warned) { store.warned = true; banner('Progress won\'t be saved', 'warn', 'This browser blocks storage: the camp runs in memory'); }
  }
  function boot() {
    const qs = new URLSearchParams(location.search);
    const ins = qs.get('insets');
    if (ins != null && isFinite(+ins)) { const v = Math.max(0, +ins) + 'px'; document.documentElement.style.setProperty('--safe-l', v); document.documentElement.style.setProperty('--safe-r', v); }
    demo = location.hash === '#demo';
    fxCv = $('fx'); fxc = fxCv.getContext('2d'); fxDpr = Math.min(2, devicePixelRatio || 1);
    loadIcons();
    Scene.init($('scene'));
    const realNow = Date.now(), tz = -new Date().getTimezoneOffset() * 60000;
    let welcome = null, offlineEv = [];
    if (demo) {
      S = E.demo({ realNow, tzOffsetMs: tz });
    } else {
      const raw = store.get(KEY);
      const r = E.load(raw, realNow, { tzOffsetMs: tz, seed: (Math.random() * 4294967296) >>> 0 });
      S = r.state;
      if (r.status === 'corrupt-reset' && raw) store.set(KEY + '.bad', raw);
      if (r.status === 'future-version') { noSave = true; banner('Saved by a newer version', 'warn', 'This page runs a fresh camp in memory and leaves that save alone'); }
      if (!store.ok) { store.warned = true; banner('Progress won\'t be saved', 'warn', 'This browser blocks storage: the camp runs in memory'); }
      S.tabId = myTab;
      if (r.status === 'ok' || r.status === 'migrated') { const res = E.resume(S, realNow); offlineEv = res.events; welcome = res.welcome; }
    }
    layout();
    V = E.view(S); G = E.goal(S);
    ui.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || !!S.dev.reducedMotion;
    Scene.setReduced(ui.reduced);
    wire();
    if (welcome) welcomeCard(welcome);
    if (offlineEv.length) handle(offlineEv, { offline: true });
    if (S.pending) beginRunScreen();
    save();
    checkPortrait();
    requestAnimationFrame(frame);
  }
  function layout() {
    const pr = getComputedStyle($('probe'));
    const safeL = parseFloat(pr.paddingLeft) || 0, safeR = parseFloat(pr.paddingRight) || 0, safeB = parseFloat(pr.paddingBottom) || 0;
    const cs = getComputedStyle(document.documentElement);
    const playH = parseFloat(cs.getPropertyValue('--play-h')) || 56;
    const top = $('top').getBoundingClientRect().height || 44;
    const playW = parseFloat(cs.getPropertyValue('--play-w')) || 112, goalW = parseFloat(cs.getPropertyValue('--goal-w')) || 190;
    ui.portrait = PORTRAIT.matches;
    ui.topH = Math.round(top);
    // portrait fallback (SPEC 8.6): the camp fits the width in the top 55%; sheets come up from the bottom
    const bottom = ui.portrait ? Math.max(playH + Math.max(8, safeB), Math.round(innerHeight * 0.45)) : playH + Math.max(8, safeB);
    Scene.setLayout({ W: innerWidth, H: innerHeight, top, bottom, safeL, safeR, padL: Math.max(8, safeL), padR: Math.max(8, safeR), playW, blW: 44 + 6 + goalW });
    if (ui.sheet) placeSheet(ui.sheet, false);
    checkPortrait();
  }
  const PORTRAIT = matchMedia('(orientation: portrait) and (max-width: 599px)');
  function checkPortrait() {
    let ok = ui.portraitOk;
    if (!ok) { try { ok = sessionStorage.getItem('survivor-camp.portrait') === '1'; } catch (e) { ok = false; } ui.portraitOk = ok; }
    const show = PORTRAIT.matches && !ok && !demo;
    const el = $('rotate');
    if (el.hidden === show) { el.hidden = !show; if (show) { arm(el); E.log(S, 'screen', { name: 'rotate' }); } }
  }
  function continuePortrait() {
    gesture(); ui.portraitOk = true;
    try { sessionStorage.setItem('survivor-camp.portrait', '1'); } catch (e) { /* per-tab convenience only */ }
    $('rotate').hidden = true; E.log(S, 'portrait', null);
  }
  function useHere() {
    const r = E.load(store.get(KEY), Date.now(), { tzOffsetMs: -new Date().getTimezoneOffset() * 60000 });
    if (r.status === 'ok' || r.status === 'migrated') { S = r.state; E.resume(S, Date.now()); }
    S.tabId = myTab; paused = false; syncAmb();
    $('modal').hidden = true; ui.modal = null; document.body.classList.remove('modal-open');
    for (const id of ['routes', 'runscr', 'result', 'start', 'resultBack']) $(id).hidden = true;
    ui.overlay = null; closeSheet(); run = null;
    V = E.view(S); G = E.goal(S);
    save();
    if (S.pending) beginRunScreen();
  }
  // Close every screen and forget what the HUD had revealed: after reset, import, replay FTUE or set Camp Level.
  function resetUi() {
    $('modal').hidden = true; ui.modal = null; document.body.classList.remove('modal-open'); ui.modalQ = []; ui.bannerQ = []; $('banners').innerHTML = '';
    for (const id of ['routes', 'runscr', 'result', 'start', 'resultBack']) $(id).hidden = true;
    ui.overlay = null; closeSheet(); run = null;
    ui.rev = {}; ui.shownChips = {}; ui.disp = {}; ui.roll = {}; ui.spendRoll = {}; ui.doneAway.clear();
    for (const k of Object.keys(ui.held)) ui.held[k] = 0;
    flyers.length = 0; floats.length = 0; ui.endShown = false; ui.handFor = ''; ui.coachAfter = 0;
    document.body.classList.remove('beat');
    V = E.view(S); G = E.goal(S); ui.sheetHtml = ''; ui.routesHtml = '';
    ui.needLayout = true;
    syncAmb();
    if (S.pending) beginRunScreen();
  }
  // Replace the whole camp (Lab import, or a fresh camp on reset). The old save is overwritten on the next save().
  function replaceState(next) {
    S = next; S.tabId = myTab; resetUi(); save();
  }
  function resetSave() {
    const fresh = E.create({ realNow: Date.now(), tzOffsetMs: -new Date().getTimezoneOffset() * 60000, seed: (Math.random() * 4294967296) >>> 0 });
    replaceState(fresh);
    E.log(S, 'dev:resetSave', null, true);
  }
  function arm(el) { el.classList.add('arming'); clearTimeout(el._arm); el._arm = setTimeout(() => el.classList.remove('arming'), 250); }
  function wire() {
    $('sheetBody').addEventListener('click', sheetClick);
    $('sheetX').addEventListener('click', () => { gesture(); closeSheet(); });
    $('sheetAct').addEventListener('click', (e) => { gesture(); const fn = e.currentTarget._fn; if (fn) fn(); });
    $('scene').addEventListener('click', () => { gesture(); closeSheet(); });
    $('play').addEventListener('click', () => { gesture(); openRoutes(); });
    $('goal').addEventListener('click', tapGoal);
    $('btnSound').addEventListener('click', () => { gesture(); act({ type: 'dev', op: 'muted', value: !S.dev.muted }); try { if (SC.Sfx && SC.Sfx.setMuted) SC.Sfx.setMuted(S.dev.muted); } catch (e) { /* optional */ } });
    $('btnLab').addEventListener('click', () => { gesture(); hooks.openLab(); });
    $('c-batbtn').addEventListener('click', () => { gesture(); hooks.openShop(); });
    $('routes').addEventListener('click', routesClick);
    $('start').addEventListener('click', startRun);
    $('runSkip').addEventListener('click', skipRun);
    $('ticker').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      gesture();
      if (b.dataset.a === 'openLab') hooks.openLab('payloads');
      else if (b.dataset.a === 'cancelRun') { act({ type: 'dev', op: 'cancelRun' }); $('runscr').hidden = true; ui.overlay = null; run = null; }
    });
    $('rotContinue').addEventListener('click', continuePortrait);
    $('result').addEventListener('click', resultClick);
    $('resultBack').addEventListener('click', () => { gesture(); sfx('tap'); closeResult(); });
    $('modal').addEventListener('click', modalClick);
    document.addEventListener('pointerdown', () => { gesture(); if (ui.handShowing) { ui.handFor = ui.handShowing; ui.handShowing = ''; } }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (ui.modal && ui.modal.kind !== 'tab') closeCard();
      else if (ui.overlay === 'routes') closeRoutes();
      else if (ui.overlay === 'result') closeResult();
      else closeSheet();
    });
    addEventListener('resize', layout);
    addEventListener('orientationchange', () => setTimeout(layout, 120));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { save(); try { if (SC.Sfx) SC.Sfx.suspend(); } catch (e) { /* optional */ } return; }
      if (paused || demo) return;
      const r = E.resume(S, Date.now()); ui.last = 0; ui.celebrations = 0;
      if (r.welcome) welcomeCard(r.welcome);
      if (r.events.length) handle(r.events, { offline: true });
      try { if (SC.Sfx) SC.Sfx.resume(); } catch (e) { /* optional */ }
      syncAmb();
      save();
    });
    addEventListener('pagehide', save);
    addEventListener('storage', (e) => {
      if (e.key !== KEY || !e.newValue || demo || paused) return;
      let other = null; try { other = JSON.parse(e.newValue).tabId; } catch (x) { return; }
      if (other && other !== myTab) {
        paused = true; syncAmb();
        showCard({ kind: 'tab', html: '<h2>Camp open in another tab</h2><p>This tab is paused so the two tabs don\'t overwrite each other.</p><div class="btns"><button class="btn primary" type="button" data-a="useHere">Use here</button></div>' });
      }
    });
  }

  // ------------------------------------------------------------------ frame loop
  function frame(t) {
    requestAnimationFrame(frame);
    const dt = ui.last ? t - ui.last : 0; ui.last = t;
    if (!paused) { const ev = E.tick(S, dt, Date.now()); if (ev.length) { handle(ev, { tick: true }); ui.sheetHtml = ''; } }
    V = E.view(S);
    if (!G || t - ui.goalAt > 250) { G = E.goal(S); ui.goalAt = t; }
    const red = ui.reduced; ui.reduced = RM.matches || !!S.dev.reducedMotion;
    if (red !== ui.reduced || ui.reducedCls !== ui.reduced) { Scene.setReduced(ui.reduced); document.body.classList.toggle('reduced', ui.reduced); ui.reducedCls = ui.reduced; }
    if (ui.particles !== S.dev.particles) { ui.particles = S.dev.particles; Scene.setParticles(ui.particles); }
    if (ui.needLayout) { ui.needLayout = false; layout(); }
    Scene.draw(S, V, t, { doneAway: ui.doneAway });
    syncHot();
    updateHud(t);
    renderSheet(t);
    if (ui.overlay === 'routes' && t - (ui.routesAt || 0) > 500) { ui.routesAt = t; V = E.view(S); renderRoutes(false); }
    if (ui.overlay === 'result') liveUpdate($('resRight'));
    updateRun(t);
    updateCoach(t);
    pumpBanners(t);
    if (!ui.modal && !ui.overlay && ui.modalQ.length) pumpCards();
    drawFx(t);
    if (t - ui.lastSave > 5000) save();
  }

  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  return {
    hooks,
    api: {
      get state() { return S; }, get view() { return V; }, get ui() { return ui; }, act, handle, save, banner, toast, queueCard, closeCard, fly, openSheet, closeSheet,
      openRoutes, beginRunScreen, showResult, welcomeCard, openShop, resolveWith, resetUi, replaceState, resetSave, store, KEY,
      isDemo: () => demo, isPaused: () => paused, fxCount: () => flyers.length, gesture, sfx,
    },
  };
});
