/* Hold the Hall: the page. The HUD, the panels, taps on the town, saving, and the loop that runs engine and scene.
 * Only this file touches localStorage and the clock. Save key: hold-the-hall.v1. URL: #demo (a mid-game town, never
 * saved) · ?seed=N (the seed of a new town when there is no save).
 */
(function (root) {
  'use strict';
  const HH = root.HH, D = HH.DATA, E = HH.Engine, Sc = HH.Scene, Sfx = HH.Sfx, Intro = HH.Intro, R = D.RULES;
  const KEY = 'hold-the-hall.v1', DEMO = location.hash === '#demo', $ = (id) => document.getElementById(id);
  let S = null, panel = null, queue = [], guard = 0, lastSave = 0, lastFrame = 0, lastReal = 0, hudAt = 0, lastHandoff = null, denyAt = 0, resetArmed = 0;
  const shown = {};

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => Math.floor(n).toLocaleString('en-US');
  const pct = (x) => (x > 0 && x < 0.005 ? '<1' : Math.round(x * 100)) + '%';
  const dur = (ms) => (ms < 60000 ? Math.round(ms / 1000) + ' s' : ms < 3600000 ? Math.round(ms / 60000) + ' min' : Math.round(ms / 360000) / 10 + ' h');
  const clock = (ms) => Sc.clock(Math.max(0, ms));
  const theN = (name) => 'the ' + (name.indexOf('The ') === 0 ? name.slice(4) : name);
  const wide = () => root.innerWidth >= root.innerHeight;       // landscape: the panel sits at the side

  // ---------------------------------------------------------------- engine calls
  let wiped = false;                                 // RESET SAVE: the page is about to reload and must not save on its way out
  function save() { if (DEMO || !S || wiped) return; lastSave = performance.now(); store.set(KEY, E.save(S, Date.now())); }
  function act(a) {
    const r = E.act(S, a);
    if (r.ok) { handle(r.ev); save(); hudAt = 0; }
    return r;
  }
  function toast(text, cls, ms) {
    const el = document.createElement('div'); el.className = 'toast' + (cls ? ' ' + cls : ''); el.textContent = text;
    const box = $('toasts'); box.appendChild(el); while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, ms || 2300);
  }
  const pop = (id) => { const el = $(id); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); };
  function need(r, what) {                          // a refused action says why
    Sfx.play('deny');
    if (r.err === 'cost') toast('Need ' + num(r.data.need) + ' more ' + (r.data.fuel ? 'fuel' : 'supplies'), 'bad');
    else if (r.err === 'hall') toast('Needs Town Hall level ' + r.data.needHall, 'bad');
    else if (r.err === 'far') toast('Too far. Take a block next to it first.', 'bad');
    else if (r.err === 'busy') toast(what === 'go' ? 'Someone is already out there.' : 'Already building.', 'bad');
    else if (r.err === 'notReady') toast('Not ready to go.', 'bad');
    else if (r.err === 'empty') toast('Nothing to collect yet.', 'bad');
  }

  // what the engine reports: sounds, effects, panels
  function handle(ev) {
    let redraw = false;
    for (const e of ev) {
      if (e.type !== 'shot') redraw = true;
      if (e.type === 'result') {
        const b = S.blocks[e.bid];
        Sc.runEnd(e); Sfx.play(e.win ? 'win' : 'lose'); pop('cSup');
        if (e.taken) { Sc.taken(b); Sfx.play('bell'); Sc.float(Sc.lot(b.bx) + 2, Sc.lot(b.by) + 2, 60, b.type === 'bridge' ? 'THE ROAD IS OPEN' : 'OURS!', '#ffd27a'); } else Sc.fit(false);
        const p = e.down ? { kind: 'offer', pid: e.pid, modal: true, fresh: true } : { kind: 'result', res: e, modal: true }, wait = e.taken ? 900 : 500;
        guard = Math.max(guard, performance.now() + wait + 150);          // the card is on its way: no other panel in between
        setTimeout(() => show(p), wait);
      } else if (e.type === 'built') {
        const b = S.blocks[e.bid]; Sfx.play('build'); Sc.float(Sc.lot(b.bx) + 2, Sc.lot(b.by) + 2, 50, e.lv === 1 ? 'RESTORED' : 'LEVEL ' + e.lv, '#9dffb0'); Sc.burst(Sc.lot(b.bx) + 2, Sc.lot(b.by) + 2, 30, '#ffd27a', 14);
      } else if (e.type === 'newcomer') { Sfx.play('level'); show({ kind: 'newcomer', pid: e.pid, modal: true }); }
      else if (e.type === 'goal') { const g = D.GOALS[e.idx]; Sfx.play('collect'); toast('GOAL DONE  +' + (e.sup ? e.sup + ' supplies' : e.fuel + ' fuel'), 'good', 2800); pop(e.sup ? 'cSup' : 'cFuel'); $('goal').classList.add('done'); setTimeout(() => $('goal').classList.remove('done'), 900); void g; }
      else if (e.type === 'horde') { Sfx.play('horde'); Sc.horde(e.n); Sc.shake(6); toast('A horde heard the bell. Tap them all!', 'bad', 3200); }
      else if (e.type === 'hordeWon') { Sc.hordeOver(true); Sfx.play('win'); toast('Horde beaten  +' + e.sup + ' supplies  +' + e.fuel + ' fuel', 'good', 3000); pop('cFuel'); }
      else if (e.type === 'hordeGone') { Sc.hordeOver(false); toast('The horde moved on.', '', 2200); }
      else if (e.type === 'rested') { const p = E.person(S, e.pid); if (p && !Intro.active) toast(p.name + ' is ready', 'good', 1600); }
      else if (e.type === 'won') { setTimeout(() => { for (let i = 0; i < 8; i++) Sc.burst(8 + Math.random() * 10, 8 + Math.random() * 10, 60, ['#ffd27a', '#ff8a3c', '#9dffb0'][i % 3], 22); Sfx.play('bell'); show({ kind: 'win', modal: true }); }, 1800); }
      else if (e.type === 'collected') { Sfx.play('collect'); pop(e.fuel ? 'cFuel' : 'cSup'); }
      else if (e.type === 'revived') { Sfx.play('level'); const p = E.person(S, e.pid); if (p) toast(p.name + (e.pay === 'fuel' ? ' is back on both feet' : ' is recovering'), 'good'); }
      else if (e.type === 'grave') { Sfx.play('bell'); toast(e.name + ' rests on the hall lawn.', '', 3200); }
      else if (e.type === 'pack') { Sfx.play('collect'); pop('cFuel'); }
    }
    if (redraw && panel) render();
  }

  // ---------------------------------------------------------------- panels
  const head = (title, sub, noX) => '<div class="ph"><h2>' + title + (sub ? '<small>' + sub + '</small>' : '') + '</h2>' + (noX ? '' : '<button class="x" data-do="close" aria-label="Close">×</button>') + '</div>';
  const row = (l, r, cls) => '<div class="row"><span>' + l + '</span><span class="r ' + (cls || '') + '">' + r + '</span></div>';
  const btn = (label, doName, attrs, cls, sub) => '<button class="btn ' + (cls || '') + '" data-do="' + doName + '"' + (attrs || '') + '><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span></button>';
  const dot = (p) => '<i style="background:' + p.look.jacket + '"></i>';
  const pips = (b) => { let s = '<span class="pips">'; for (let i = 0; i < b.hpMax; i++) s += '<i' + (i < b.hp ? '' : ' class="o"') + '></i>'; return s + '</span>'; };
  function stateText(p) {
    if (p.state === 'ok') return 'Ready';
    if (p.state === 'rest') return (p.hurt ? 'Hurt · ' : 'Resting · ') + clock(p.until - S.t);
    return p.state === 'down' ? 'DOWN' : 'Out there';
  }
  function fxText(b, lv) {
    const T = D.TYPES[b.type];
    switch (b.type) {
      case 'hall': return (lv === 1 ? 'Reaches the inner ring' : lv === 2 ? 'Reaches the whole town' : 'Reaches the bridge') + ' · buildings to LV ' + lv;
      case 'home': return lv + (lv > 1 ? ' beds' : ' bed');
      case 'garden': return T.rate[lv - 1] + ' supplies a minute · holds ' + T.cap[lv - 1];
      case 'workshop': return '+' + 20 * lv + '% supplies from runs';
      case 'clinic': return '+' + 10 * lv + '% carried home · rest −' + 15 * lv + '%';
      case 'armory': return '+' + 4 * lv + ' power for everyone';
      case 'tower': return 'Wall shots +' + lv + ' · ammo +' + 2 * lv;
      case 'gas': return '1 fuel every ' + Math.round(1 / T.rate[lv - 1]) + ' min · holds ' + T.cap[lv - 1];
    }
    return '';
  }
  const bestReady = (b) => { let best = null, bw = -1; for (const p of S.people) if (p.state === 'ok') { const w = E.odds(S, p, b).win + E.power(S, p) / 1e4; if (w > bw) { bw = w; best = p; } } return best; };
  const PANELS = {
    target(p) {
      const b = S.blocks[p.bid], T = D.TYPES[b.type], why = E.attackWhy(S, b);
      if (b.owned) return PANELS.block(p);
      let sel = E.person(S, p.pid); if (!sel || sel.state !== 'ok') { sel = bestReady(b); p.pid = sel ? sel.id : null; }
      let h = head(esc(b.name), b.type === 'bridge' ? T.line : 'Becomes ' + T.name + ' · ' + T.line);
      h += row('Nests ' + pips(b), 'Threat ' + b.threat + (sel ? ' <span class="muted">· power ' + E.power(S, sel) + '</span>' : ''));
      if (why === 'far') return h + '<p class="note">Too far. Take a block next to it first.</p>';
      if (why === 'hall') return h + '<p class="note">Out of reach. Needs Town Hall level ' + E.needHall(b) + '.</p>' + btn('TOWN HALL', 'block', ' data-id="12"');
      const mul = (1 + D.TYPES.workshop.loot * E.sumLv(S, 'workshop')) * (sel ? 1 + (D.TRAITS[sel.trait].loot || 0) : 1);
      h += row('Brings home', '~' + Math.round((R.loot0 + R.lootT * b.threat) * mul) + ' supplies' + (b.hp === 1 ? '<br><small class="muted">+' + (R.bonus0 + R.bonusT * b.threat) + ' and ' + (b.type === 'bridge' ? 5 : b.ring) + ' fuel for the block</small>' : ''));
      if (sel) { const ho = E.handoff(S, sel, b, S.night + 1, 0), gun = { pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'Rifle' }[ho.startRoom.primary] || ho.startRoom.primary; h += row('Goes out with', gun + (ho.startRoom.medkit ? ' · medkit' : '') + ' · ' + ho.player.maxHp + ' HP'); }
      h += '<div class="cards">';
      const order = S.people.slice().sort((x, y) => (y.state === 'ok') - (x.state === 'ok') || E.power(S, y) - E.power(S, x));
      for (const pn of order) {
        const o = E.odds(S, pn, b), ready = pn.state === 'ok';
        h += '<button class="card' + (sel && pn.id === sel.id ? ' sel' : '') + (ready ? '' : ' off') + '" data-do="sel" data-id="' + pn.id + '"><div class="nm">' + dot(pn) + esc(pn.name) + '</div><div class="lv">Lv ' + pn.lv + ' · ' + D.TRAITS[pn.trait].name + '</div>' +
          (ready ? '<div class="od">' + pct(o.win) + '<small>WIN</small></div><div class="dt' + (o.death > 0 ? ' risk' : '') + '">DEATH ' + pct(o.death) + '</div>' : '<div class="dt" data-live="st:' + pn.id + '"></div>') + '</button>';
      }
      h += '</div><div class="foot"><div class="btns">';
      if (S.run) h += btn('SOMEONE IS OUT THERE', 'none', '', 'off');
      else if (sel) { const o = E.odds(S, sel, b); h += btn('SEND ' + esc(sel.name), 'go', '', 'go', 'A simulated night · ' + pct(o.win) + ' to win'); }
      else h += btn('NOBODY IS READY', 'panel', ' data-k="people"', 'off');
      if (E.targets(S).length > 1) h += '<button class="btn next" data-do="next" aria-label="Another block">▸</button>';
      return h + '</div></div>';
    },
    block(p) {
      const b = S.blocks[p.bid], T = D.TYPES[b.type], hall = b.type === 'hall', id = ' data-id="' + b.id + '"';
      if (!b.owned) return PANELS.target(p);
      if (b.type === 'bridge') return head('THE BRIDGE', 'The road is open. The town is yours.') + btn('OK', 'close');
      let h = b.lv < 1 ? head(esc(b.name), 'A ruin. Restore it and it becomes ' + T.name + '.') : head(T.name + ' <span class="amber">LV ' + b.lv + '</span>', (hall ? '' : esc(b.name) + ' · ') + T.line), foot = '';
      if (b.lv >= 1) h += row('Now', fxText(b, b.lv));
      if (T.rate && b.lv >= 1) h += row(b.type === 'gas' ? 'Fuel in store' : 'In store', '<span data-live="stock:' + b.id + '"></span><button class="mini" data-do="collect"' + id + '>COLLECT</button>');
      if (b.job) { h += row(b.lv < 1 ? 'Restoring' : 'Upgrading to LV ' + (b.lv + 1), '<span data-live="job:' + b.id + '"></span>'); foot = '<button class="btn fuel" data-do="skipJob"' + id + '><span data-live="jobSkip:' + b.id + '"></span></button>'; }
      else if (b.lv < T.max) {
        const next = b.lv + 1, cost = T.cost[b.lv];
        if (b.lv >= 1) h += row('Level ' + next, fxText(b, next), 'good');
        if (!hall && b.lv >= E.hallLv(S)) h += '<p class="note">Level ' + next + ' needs Town Hall level ' + next + '.</p>';
        else foot = btn(b.lv < 1 ? 'RESTORE' : 'UPGRADE', 'build', id, 'main' + (S.res.sup < cost ? ' off' : ''), num(cost) + ' supplies · ' + dur(T.time[b.lv]));
      } else h += '<p class="note">As good as it gets.</p>';
      if (hall) h += row('Wall', Math.floor(E.ammoCap(S)) + ' ammo · +1 every ' + R.ammoMs / 1000 + ' s') + (S.graves.length ? btn('REMEMBERED · ' + S.graves.length, 'panel', ' data-k="people"') : '');
      return h + (foot ? '<div class="foot">' + foot + '</div>' : '');
    },
    people() {
      let h = head('SURVIVORS', S.people.length + ' of ' + E.beds(S) + ' beds · night ' + S.night);
      for (const pn of S.people) h += '<button class="who" data-do="person" data-id="' + pn.id + '">' + dot(pn) + '<span><b>' + esc(pn.name) + '</b><br><span>Lv ' + pn.lv + ' · ' + D.TRAITS[pn.trait].name + ' · power ' + E.power(S, pn) + '</span></span><span class="r" data-live="st:' + pn.id + '"></span></button>';
      h += '<p class="note">' + (S.people.length < E.beds(S) ? 'A bed is free. Someone will find the gate.' : 'Every bed is taken. Homes add beds.') + (E.deathOn(S) ? '' : ' With fewer than ' + R.deathMin + ' people, nobody is left behind out there.') + '</p>';
      if (S.graves.length) { h += '<div class="row"><b>REMEMBERED</b></div>'; for (const g of S.graves) h += '<button class="who" data-do="grave" data-id="' + g.id + '">' + dot(g) + '<span><b>' + esc(g.name) + '</b><br><span>Lv ' + g.lv + ' · fell on night ' + g.night + '</span></span></button>'; }
      return h;
    },
    person(p) {
      const pn = E.person(S, p.pid); if (!pn) return PANELS.people();
      const tr = D.TRAITS[pn.trait], id = ' data-id="' + pn.id + '"';
      let h = head(esc(pn.name), 'Level ' + pn.lv + ' · ' + tr.name + ' · ' + tr.fx) + '<p class="note" style="margin-top:0">' + tr.line + '</p>';
      h += row('Now', '<span data-live="st:' + pn.id + '"></span>') + row('Power', E.power(S, pn));
      h += row('XP', pn.lv >= R.maxLv ? 'max' : pn.xp + ' / ' + E.need(pn.lv)) + '<div class="bar"><i style="width:' + (pn.lv >= R.maxLv ? 100 : Math.round(100 * pn.xp / E.need(pn.lv))) + '%"></i></div>';
      h += row('Nights out', pn.runs + ' · ' + pn.wins + ' won');
      if (pn.state === 'rest') h += '<button class="btn fuel" data-do="skipRest"' + id + '><span data-live="restSkip:' + pn.id + '"></span></button>';
      if (pn.state === 'down') h += btn('DECIDE', 'offer', id, 'main');
      for (const l of pn.log.slice().reverse()) h += '<div class="row muted">' + esc(l) + '</div>';
      return h + btn('ALL SURVIVORS', 'panel', ' data-k="people"');
    },
    offer(p) {
      const pn = E.person(S, p.pid); if (!pn || pn.state !== 'down') return null;
      const pr = E.revivePrice(S, pn), id = ' data-id="' + pn.id + '"', noS = S.res.sup < pr.sup, noF = S.res.fuel < pr.fuel;
      let h = head(esc(pn.name) + ' IS DOWN', (pn.fell ? 'Overrun at ' + esc(theN(pn.fell.name)) + ' · night ' + pn.fell.night + ' · ' : '') + 'Lv ' + pn.lv + ' ' + D.TRAITS[pn.trait].name, p.fresh);
      h += btn('REVIVE · ' + num(pr.sup) + ' SUPPLIES', 'revive', id + ' data-pay="sup"', 'main' + (noS ? ' off' : ''), noS ? 'Need ' + num(pr.sup - S.res.sup) + ' more' : 'Then rests ' + dur(R.recoverMs * pn.lv));
      h += btn('REVIVE NOW · ' + pr.fuel + ' FUEL', 'revive', id + ' data-pay="fuel"', 'fuel' + (noF ? ' off' : ''), noF ? 'Need ' + (pr.fuel - S.res.fuel) + ' more' : 'Ready at once');
      h += btn('SAY GOODBYE', 'bye', id, 'danger');
      return h + '<p class="note">' + esc(pn.name) + ' waits at the hall until you decide.</p>' + (p.fresh ? btn('DECIDE LATER', 'close') : '');
    },
    bye(p) {
      const pn = E.person(S, p.pid); if (!pn || pn.state !== 'down') return null;
      const id = ' data-id="' + pn.id + '"';
      return head('SAY GOODBYE?', esc(pn.name) + ' gets a grave on the hall lawn. This cannot be undone.', true) + btn('LAY TO REST', 'bye2', id, 'danger') + '<div style="height:58px"></div>' + btn('KEEP WAITING', 'offer', id);
    },
    grave(p) {
      const g = S.graves.find((x) => x.id === p.gid); if (!g) return null;
      return head(esc(g.name), 'Level ' + g.lv + ' · ' + D.TRAITS[g.trait].name) + '<p class="note" style="margin-top:0">Fell at ' + esc(theN(g.where)) + ' on night ' + g.night + '.</p>' + row('Nights out', g.runs + ' · ' + g.wins + ' won') + btn('OK', 'close');
    },
    result(p) {
      const r = p.res, b = S.blocks[r.bid], pn = E.person(S, r.pid), nm = pn ? esc(pn.name) : 'Someone', id = ' data-id="' + b.id + '"';
      let h;
      if (r.win && r.taken) h = head(b.type === 'bridge' ? 'THE BRIDGE IS OPEN' : 'WE HOLD ' + esc(theN(b.name)), 'Night ' + r.night + ' · ' + nm + ' cleared the last nest', true);
      else if (r.win) h = head('PUSHED BACK', nm + ' cleared a nest at ' + esc(theN(b.name)) + ' · ' + r.hpLeft + ' left', true);
      else h = head('CARRIED HOME', nm + ' was overrun at ' + esc(theN(b.name)), true);
      h += row('Supplies', '+' + num(r.sup + r.bonus) + (r.bonus ? ' <span class="muted">(' + r.bonus + ' for the block)</span>' : ''), 'good');
      if (r.fuel) h += row('Fuel', '+' + r.fuel, 'good');
      h += row('XP', '+' + r.xp + (r.lvUp && pn ? ' <span class="amber">LEVEL ' + pn.lv + '!</span>' : ''));
      if (r.restMs) h += row(r.hurt ? 'Hurt, rests' : 'Rests', dur(r.restMs), r.hurt ? 'bad' : '');
      if (r.win && r.taken && b.type !== 'bridge' && b.lv < 1 && !b.job) { const T = D.TYPES[b.type], c = T.cost[0]; return h + btn('RESTORE IT', 'build', id, 'main' + (S.res.sup < c ? ' off' : ''), c + ' supplies · becomes ' + T.name) + btn('LATER', 'close'); }
      if (r.win && !r.taken) return h + btn('SEND SOMEONE AGAIN', 'target', id, 'main') + btn('OK', 'close');
      return h + btn('OK', 'close', '', 'main');
    },
    newcomer(p) {
      const pn = E.person(S, p.pid); if (!pn) return null;
      const tr = D.TRAITS[pn.trait];
      return head(esc(pn.name) + ' MOVED IN', 'Someone at the gate · Level ' + pn.lv + ' · ' + tr.name, true) + '<p class="note" style="margin-top:0">' + tr.line + ' ' + tr.fx.charAt(0).toUpperCase() + tr.fx.slice(1) + '.</p>' + btn('WELCOME', 'close', '', 'main');
    },
    fuel() {
      return head('FUEL', 'Burn it to skip a wait, or to revive at once') + row('In the tank', num(S.res.fuel)) + row('Comes from', 'new blocks, hordes, goals,<br>a Fuel Depot') +
        btn('TEST PACK  +' + R.pack, 'pack', '', 'fuel', 'PROTOTYPE · FREE · NO PAYMENT') + '<p class="note">This prototype has no shop. The pack is free and only here for testing.</p>';
    },
    lab() {
      const sp = S.lab.speed || 1, f = S.lab.force;
      const opt = (label, doName, k, on) => '<button class="btn' + (on ? ' main' : '') + '" data-do="' + doName + '" data-k="' + k + '"><span>' + label + '</span></button>';
      let h = head('LAB', 'Prototype tools. Nothing here is part of the game.');
      if (S.run) h += '<div class="row"><b>Run in progress</b><span class="r muted">what the real game would report</span></div><div class="btns wrap">' + opt('REPORT WIN', 'report', 'win') + opt('REPORT LOSS', 'report', 'loss') + '</div>';
      h += '<div class="row"><b>Time</b></div><div class="btns wrap">' + opt('×1', 'speed', 1, sp === 1) + opt('×10', 'speed', 10, sp === 10) + opt('×60', 'speed', 60, sp === 60) + '</div>';
      h += '<div class="btns wrap">' + opt('+200 SUPPLIES', 'grant', 'sup') + opt('+20 FUEL', 'grant', 'fuel') + '</div>';
      h += '<div class="row"><b>Next run</b></div><div class="btns wrap">' + opt('AUTO', 'force', '', !f) + opt('WIN', 'force', 'win', f === 'win') + opt('HURT', 'force', 'hurt', f === 'hurt') + opt('DOWN', 'force', 'down', f === 'down') + '</div>';
      h += '<div class="btns wrap">' + opt('SOUND ' + (Sfx.isOn() ? 'ON' : 'OFF'), 'sound', '') + opt('HORDE NOW', 'hordeNow', '') + '</div>';
      h += row('Nights', S.night) + row('Runs won / lost', S.stats.wins + ' / ' + S.stats.losses) + row('Walkers shot', S.stats.kills) + row('Down · revived · graves', S.stats.downs + ' · ' + S.stats.revives + ' · ' + S.graves.length);
      const ho = (S.run && S.run.handoff) || lastHandoff;
      if (ho) h += '<div class="row"><b>Last handoff to Two Thumbs Left</b></div><pre class="json">' + esc(JSON.stringify(ho, null, 1)) + '</pre>';
      if (DEMO) return h + btn('LEAVE THE DEMO', 'reset', '', '', 'Back to your own town. The demo is never saved.');
      return h + btn(resetArmed > performance.now() ? 'TAP AGAIN TO RESET' : 'RESET SAVE', 'reset', '', 'danger', 'Starts over from the opening');
    },
    win() {
      return head('THE TOWN IS YOURS', 'Night ' + S.night + ' · ' + S.people.length + ' survivors · ' + S.graves.length + ' remembered', true) + '<p class="note" style="margin-top:0">The bridge is open and every block has lights. That is the whole prototype. The Lab can reset it.</p>' + btn('OK', 'close', '', 'main');
    },
  };
  function live() {                                  // the numbers that change while a panel is open
    if (!panel) return;
    for (const el of $('panel').querySelectorAll('[data-live]')) {
      const [k, id] = el.getAttribute('data-live').split(':'); let v = '';
      if (k === 'st') { const p = E.person(S, id); v = p ? stateText(p) : ''; el.className = (el.className.replace(/ ?(good|bad)/g, '')) + (p && p.state === 'ok' ? ' good' : p && p.state === 'down' ? ' bad' : ''); }
      else if (k === 'stock') { const b = S.blocks[+id]; v = Math.floor(E.stock(S, b)) + ' / ' + D.TYPES[b.type].cap[b.lv - 1]; }
      else if (k === 'job') { const b = S.blocks[+id]; v = b.job ? clock(b.job.t1 - S.t) : 'done'; }
      else if (k === 'jobSkip') { const b = S.blocks[+id], pr = b.job ? E.skipPrice(b.job.t1 - S.t) : 0; v = pr ? 'FINISH NOW · ' + pr + ' FUEL' : 'FINISH NOW · FREE'; }
      else if (k === 'restSkip') { const p = E.person(S, id), pr = p && p.state === 'rest' ? E.skipPrice(p.until - S.t) : 0; v = pr ? 'BACK ON DUTY · ' + pr + ' FUEL' : 'BACK ON DUTY · FREE'; }
      if (el.textContent !== v) el.textContent = v;
    }
  }
  function render() {
    if (!panel) return;
    const html = PANELS[panel.kind](panel);
    if (html == null) { close(); return; }
    const el = $('panel'), top = el.scrollTop;
    el.innerHTML = html; el.hidden = false; el.scrollTop = top; $('hud').classList.add('panel-open'); live(); layout();
  }
  // A panel about a block aims the camera at it once the panel is up, so the block lands in the clear part of the
  // screen. `home` is where the camera goes back to when that panel closes: the overview, or a spot the player chose.
  let home = null;
  const aimAt = (p) => (p.kind === 'block' || p.kind === 'target' ? p.bid : p.kind === 'result' ? p.res.bid : null);
  function aim() {
    const bid = panel ? aimAt(panel) : null; if (bid == null) return;
    if (!home) home = Sc.cam.by === 'user' ? { x: Sc.cam.tx, y: Sc.cam.ty, z: Sc.cam.tz } : 'fit';
    Sc.focus(S.blocks[bid]);
  }
  function open(p) { panel = p; guard = performance.now() + 380; $('panel').scrollTop = 0; render(); if (panel === p) aim(); Sfx.play('tap'); }
  function show(p) { if (Intro.active) { queue.push(p); return; } if (panel && panel.modal) queue.push(p); else open(p); }   // modal panels wait their turn
  function close() {
    panel = null; $('panel').hidden = true; $('hud').classList.remove('panel-open'); guard = performance.now() + 380; layout();
    if (queue.length) { open(queue.shift()); return; }
    if (home) { if (Sc.cam.by !== 'user') { if (home === 'fit') Sc.fit(false); else { Sc.cam.tx = home.x; Sc.cam.ty = home.y; Sc.cam.tz = home.z; } } home = null; }
  }
  function layout() {
    const el = $('panel'), w = wide();
    Sc.setInsets({ t: 60, b: panel && !w ? Math.min(root.innerHeight * 0.66, el.offsetHeight + 16) : 74, l: 0, r: panel && w ? el.offsetWidth + 16 : 0 });
  }
  function openBlock(b) {
    if (b.owned) open({ kind: 'block', bid: b.id });
    else { const s = bestReady(b); open({ kind: 'target', bid: b.id, pid: s ? s.id : null }); }
  }

  // ---------------------------------------------------------------- the main button and the goal chip
  function mainState() {
    if (S.run) return { cls: 'run', big: 'CLEARING', small: 'tap to skip ▸▸', f: () => act({ type: 'runSkip' }) };
    if (S.won) return { cls: 'wait', big: 'THE TOWN', small: 'is yours', f: () => show({ kind: 'win' }) };
    const tg = E.targets(S), h = E.hall(S);
    if (!tg.length) return h.job ? { cls: 'wait', big: 'BUILDING', small: 'Town Hall · ' + clock(h.job.t1 - S.t), f: () => openBlock(h) } : { cls: '', big: 'UPGRADE', small: 'the Town Hall to reach further', f: () => openBlock(h) };
    const ready = S.people.filter((p) => p.state === 'ok');
    if (!ready.length) {
      const rest = S.people.filter((p) => p.state === 'rest').sort((a, b) => a.until - b.until)[0], down = S.people.find((p) => p.state === 'down');
      if (!rest && down) return { cls: '', big: 'DECIDE', small: down.name + ' is down', f: () => open({ kind: 'offer', pid: down.id }) };
      return { cls: 'wait', big: 'RESTING', small: rest ? rest.name + ' ready in ' + clock(rest.until - S.t) : 'nobody is ready', f: () => open({ kind: 'people' }) };
    }
    let best = tg[0], bw = -1; for (const b of tg) { const w = E.odds(S, bestReady(b), b).win - b.threat / 1e4; if (w > bw) { bw = w; best = b; } }
    return { cls: '', big: 'EXPAND', small: best.name + ' · ' + pct(E.odds(S, bestReady(best), best).win), f: () => openBlock(best), pulse: S.goal < D.GOALS.length && D.GOALS[S.goal].k === 'blocks' };
  }
  function goalTap() {
    if (S.goal >= D.GOALS.length) return;
    const g = D.GOALS[S.goal];
    if (g.k === 'kills') toast('Walkers near your wall are in range. Tap them.');
    else if (g.k === 'blocks' || g.k === 'won') mainState().f();
    else if (g.k === 'built') { const b = S.blocks.find((x) => x.owned && x.lv < 1 && x.type !== 'bridge' && !x.job); if (b) openBlock(b); else toast('Take a block first, then restore it.'); }
    else if (g.k === 'hall') openBlock(E.hall(S));
    else if (g.k === 'people') { const b = S.blocks.find((x) => x.owned && x.type === 'home'); if (b) openBlock(b); else open({ kind: 'people' }); }
  }
  function set(id, v) { if (shown[id] !== v) { shown[id] = v; $(id).textContent = v; } }
  function hud(now) {
    if (now - hudAt < 160) return; hudAt = now;
    set('vSup', num(S.res.sup)); set('vFuel', num(S.res.fuel));
    const am = Math.floor(E.ammo(S)); set('vAmmo', String(am)); $('cAmmo').classList.toggle('low', am < 1);
    set('vPeople', S.people.length + '/' + E.beds(S)); $('cPeople').classList.toggle('alert', S.people.some((p) => p.state === 'down'));
    const g = S.goal < D.GOALS.length ? D.GOALS[S.goal] : null, gt = $('goal');
    if (g) { const v = Math.min(g.n, E.goalValue(S, g)); set2(gt, '.gt', g.text); set2(gt, '.gs', (g.n > 1 ? v + ' / ' + g.n + ' · ' : '') + 'reward: ' + (g.sup ? g.sup + ' supplies' : g.fuel + ' fuel')); gt.querySelector('.gb').style.width = Math.round(100 * v / g.n) + '%'; }
    else { set2(gt, '.gt', 'The town is yours.'); set2(gt, '.gs', 'Night ' + S.night); gt.querySelector('.gb').style.width = '100%'; }
    const m = mainState(), ex = $('expand'), txt = m.big + '|' + m.small + '|' + m.cls + '|' + (m.pulse ? 1 : 0);
    if (shown.ex !== txt) { shown.ex = txt; ex.className = m.cls + (m.pulse ? ' pulse' : ''); ex.innerHTML = esc(m.big) + '<small>' + esc(m.small) + '</small>'; }
    const bn = $('banner');
    if (S.horde) { bn.textContent = (panel ? 'HORDE · ' : 'HORDE · TAP THEM ALL · ') + S.horde.left + ' LEFT · ' + clock(S.horde.t1 - S.t); bn.classList.add('on'); } else bn.classList.remove('on');
    $('sndOn').style.display = Sfx.isOn() ? '' : 'none';
    live();
  }
  function set2(parent, sel, v) { const el = parent.querySelector(sel); if (el.textContent !== v) el.textContent = v; }

  // ---------------------------------------------------------------- buttons
  const DO = {
    close() { close(); },
    none() {},
    panel(el) { open({ kind: el.getAttribute('data-k') }); },
    info(el) { toast(el.getAttribute('data-k') === 'sup' ? 'Supplies: from runs, gardens and walkers shot at the wall.' : 'Wall ammo: tap walkers near your wall. One shot comes back every ' + R.ammoMs / 1000 + ' s.', '', 3200); },
    sound() { Sfx.setOn(!Sfx.isOn()); if (S.ui) S.ui.sound = Sfx.isOn(); else S.ui = { sound: Sfx.isOn() }; save(); if (panel && panel.kind === 'lab') render(); hudAt = 0; },
    goal() { goalTap(); },
    expand() { mainState().f(); },
    block(el) { openBlock(S.blocks[+el.getAttribute('data-id')]); },
    target(el) { openBlock(S.blocks[+el.getAttribute('data-id')]); },
    next() { const tg = E.targets(S).sort((a, b) => a.threat - b.threat); if (!tg.length) return; const i = tg.findIndex((b) => b.id === panel.bid); openBlock(tg[(i + 1) % tg.length]); },
    sel(el) { const p = E.person(S, el.getAttribute('data-id')); if (!p) return; if (p.state !== 'ok') { toast(p.name + ': ' + stateText(p), 'bad'); return; } panel.pid = p.id; render(); Sfx.play('tap'); },
    go() {
      const b = S.blocks[panel.bid], r = act({ type: 'go', bid: panel.bid, pid: panel.pid });
      if (!r.ok) { need(r, 'go'); return; }
      lastHandoff = S.run.handoff; Sc.runStart(S.run); close(); Sc.focus(b, 1.4, true); Sfx.play('door');
    },
    build(el) { const b = S.blocks[+el.getAttribute('data-id')], r = act({ type: 'build', bid: b.id }); if (!r.ok) { need(r); return; } Sfx.play('build'); if (panel && panel.kind === 'result') close(); else render(); },
    skipJob(el) { const r = act({ type: 'skip', kind: 'job', bid: +el.getAttribute('data-id') }); if (!r.ok) need(r); else guard = performance.now() + 380; },
    skipRest(el) { const r = act({ type: 'skip', kind: 'rest', pid: el.getAttribute('data-id') }); if (!r.ok) need(r); else guard = performance.now() + 380; },
    collect(el) { const r = act({ type: 'collect', bid: +el.getAttribute('data-id') }); if (!r.ok) need(r); },
    person(el) { open({ kind: 'person', pid: el.getAttribute('data-id') }); },
    grave(el) { open({ kind: 'grave', gid: el.getAttribute('data-id') }); },
    offer(el) { open({ kind: 'offer', pid: el.getAttribute('data-id') }); },
    revive(el) { const mine = panel, r = act({ type: 'revive', pid: el.getAttribute('data-id'), pay: el.getAttribute('data-pay') }); if (!r.ok) need(r); else if (panel === mine) close(); },   // (the offer may have closed itself already and let the next card in)
    bye(el) { open({ kind: 'bye', pid: el.getAttribute('data-id'), modal: true }); },
    bye2(el) { const mine = panel, r = act({ type: 'goodbye', pid: el.getAttribute('data-id') }); if (r.ok && panel === mine) close(); },
    pack() { act({ type: 'pack' }); },
    speed(el) { act({ type: 'lab', op: 'speed', v: +el.getAttribute('data-k') }); },
    grant(el) { const k = el.getAttribute('data-k'); act({ type: 'lab', op: k, n: k === 'sup' ? 200 : 20 }); pop(k === 'sup' ? 'cSup' : 'cFuel'); },
    force(el) { act({ type: 'lab', op: 'force', v: el.getAttribute('data-k') || null }); },
    report(el) { if (S.run) { act({ type: 'lab', op: 'result', win: el.getAttribute('data-k') === 'win', down: false }); close(); } },
    hordeNow() { if (!S.horde && !S.run) { S.hordeAt = S.t; close(); } else toast('Not during a run or another horde.', 'bad'); },
    reset() { if (DEMO) { location.hash = ''; return; } if (resetArmed > performance.now()) { wiped = true; store.del(KEY); location.reload(); } else { resetArmed = performance.now() + 3000; render(); setTimeout(() => { if (panel && panel.kind === 'lab') render(); }, 3100); } },
  };
  function onClick(e) {
    Sfx.unlock();
    const el = e.target.closest('[data-do]'); if (!el) return;
    if (performance.now() < guard) return;            // a second tap right after a screen change is not a choice
    const f = DO[el.getAttribute('data-do')]; if (f) f(el);
  }

  // ---------------------------------------------------------------- taps on the town
  function onTap(hit) {
    Sfx.unlock();
    if (Intro.active) { Intro.tap(hit); return; }
    if (hit.kind === 'marker') {
      if (hit.what === 'collect') { const b = S.blocks[hit.id], r = act({ type: 'collect', bid: hit.id }); if (r.ok) Sc.float(Sc.lot(b.bx) + 2, Sc.lot(b.by) + 2, 50, '+' + r.data.n + (r.data.fuel ? ' fuel' : ''), r.data.fuel ? '#ff9a8a' : '#ffe9a8'); }
      else if (hit.what === 'down') open({ kind: 'offer', pid: hit.id });
      else if (hit.what === 'block' && !(panel && panel.modal) && performance.now() >= guard) openBlock(S.blocks[hit.id]);   // a label over a block
      return;
    }
    if (hit.kind === 'zombie') {
      const z = hit.z;
      if (z.kind === 'horde') { if (S.horde) { const r = act({ type: 'hordeHit' }); if (r.ok) { z.hp = 1; Sc.shootAt(z); Sfx.play('shot'); } } else Sc.killZ(z); return; }
      const r = act({ type: 'shoot' });
      if (r.ok) { z.hp = 1; Sc.shootAt(z); Sfx.play('shot'); if (Math.random() < 0.5) Sfx.play('groan'); Sc.float(z.x, z.y, 34, '+' + r.data.sup); pop('cSup'); }
      else { Sfx.play('deny'); pop('cAmmo'); if (performance.now() - denyAt > 2500) { denyAt = performance.now(); toast('Out of ammo. One shot comes back every ' + R.ammoMs / 1000 + ' s.', 'bad'); } }
      return;
    }
    if (hit.kind === 'far') { if (performance.now() - denyAt > 2500) { denyAt = performance.now(); toast('Too far. Shots only reach walkers near your wall.'); } return; }
    if (panel && panel.modal) return;
    if (performance.now() < guard) return;            // the tail of a double tap on a card must not land on the town under it
    if (hit.kind === 'person') { open({ kind: E.person(S, hit.id) && E.person(S, hit.id).state === 'down' ? 'offer' : 'person', pid: hit.id }); return; }
    if (hit.kind === 'grave') { open({ kind: 'grave', gid: hit.id }); return; }
    if (hit.kind === 'block') { openBlock(hit.b); return; }
    if (panel) close();
  }

  // ---------------------------------------------------------------- the loop
  function loop(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0), real = Date.now(), gap = Math.max(0, real - lastReal);
    lastFrame = now; lastReal = real;
    if (Intro.active) Intro.frame(dt);
    else {
      const away = gap > 3000;                         // the tab was hidden: that time passed too, but no horde starts in it
      const ev = E.tick(S, Math.min(gap, R.offlineMax) * (S.lab.speed || 1), away ? { offline: true } : null);
      if (ev.length) handle(ev);
      if (S.horde) { let n = 0; for (const z of Sc.zs) if (z.kind === 'horde' && z.st !== 'dead') n++; if (n < S.horde.left) Sc.horde(S.horde.left - n); }
    }
    Sc.frame(dt);
    hud(now);
    if (now - lastSave > 5000) save();
    requestAnimationFrame(loop);
  }
  function startIntro() {
    $('hud').classList.add('off');
    Intro.start(S, (wallsUp) => {
      act({ type: 'introDone' }); layout(); if (wallsUp) Sc.rebuild(); else Sc.taken(E.hall(S)); Sc.fit(false); Sfx.play('win');
      guard = performance.now() + 500;                 // a second tap on SKIP must not open what appears in its place
      $('hud').classList.remove('off'); hudAt = 0; save();
      setTimeout(() => toast('The hall is yours. Walkers are coming to the light.', '', 3600), 600);
    });
  }
  function boot() {
    Sc.init($('town'));
    const raw = DEMO ? null : store.get(KEY), loaded = raw ? E.load(raw, Date.now()) : null;
    const q = new URLSearchParams(location.search), seed = q.get('seed') != null && isFinite(+q.get('seed')) ? +q.get('seed') >>> 0 : (Math.random() * 4294967296) >>> 0;
    if (DEMO) S = E.demo(20261111, Date.now()); else if (loaded) S = loaded.s; else { if (raw) store.set(KEY + '.bad', raw); S = E.create(seed, Date.now()); }
    if (S.ui && S.ui.sound === false) Sfx.setOn(false);
    // for check.cjs and the console: advance(ms) moves the game clock and shows what happened, as a frame would
    root.HH.UI = { get state() { return S; }, act, open, close, get panel() { return panel; }, mainState, save, advance: (ms) => handle(E.tick(S, ms)) };
    Sc.setState(S); Sc.onTap = onTap; Sc.onHold = (down) => { Sfx.unlock(); if (Intro.active) Intro.hold(down); }; Sc.onShot = () => Sfx.play('shot');
    lastReal = Date.now(); layout();
    document.addEventListener('click', onClick);
    document.addEventListener('touchend', () => Sfx.unlock(), { passive: true });   // the first finger lifted may start the sound
    root.addEventListener('resize', () => { Sc.resize(); layout(); if (Intro.active) return; if (panel && aimAt(panel) != null) Sc.focus(S.blocks[aimAt(panel)]); else Sc.fit(false); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); Sfx.pause(true); } else Sfx.pause(false); });
    root.addEventListener('hashchange', () => { save(); location.reload(); });      // #demo added or removed by hand
    root.addEventListener('pagehide', save);
    if (!S.intro) startIntro();
    else {
      $('hud').classList.remove('off'); Sc.fit(true);
      if (loaded) { handle(loaded.ev.filter((e) => e.type === 'result' || e.type === 'won')); if (loaded.awayMs > 2 * 60000) setTimeout(() => toast('Away for ' + dur(loaded.awayMs) + '. Gardens grew and timers ran.', '', 3600), 500); }
      if (S.run) Sc.runStart(S.run);
    }
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof self !== 'undefined' ? self : this);
