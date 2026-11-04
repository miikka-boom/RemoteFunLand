/* Survivor Camp lab: the dev and tuning panel (SPEC 9), styled like Two Thumbs Left's feel lab.
 *
 * A right-hand panel opened from LAB (and from the external-run screen and the end card). Sections: Clock, Grant, Runs,
 * Economy, Route lab, Payloads, Feel, Save, Telemetry. Every setting is an Engine.act({ type: 'dev', op }) call, so
 * the engine logs it with dev: true; the panel-only actions (copy, export, import, reset) log 'lab:*' rows with dev
 * too. The controls are built once per opening and kept in step with the state every 400 ms; the telemetry tables
 * re-render about once a second while they are on screen.
 *
 * Loads after ui.js and plugs in through SC.UI.hooks.openLab(section?). Uses SC.UI.api for state, act, cards and the
 * run screen (resolveWith for pasted results, replaceState for imports, resetSave).
 */
(function (root, f) {
  const api = f(root.SC || {});
  if (typeof module === 'object' && module.exports) module.exports = api; else (root.SC = root.SC || {}).Lab = api;
})(typeof self !== 'undefined' ? self : this, function (SC) {
  'use strict';
  if (typeof document === 'undefined' || !SC.UI || !SC.UI.api) return {};
  const E = SC.Engine, D = SC.DATA, A = SC.UI.api, fmt = E.fmt, B = D.BUILDINGS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (x, d) => (x == null || !isFinite(x) ? '–' : (x * 100).toFixed(d || 0) + '%');
  const MIN = 60000, HOUR = 3600000;
  const MULS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const SECTIONS = [['clock', 'Clock'], ['grant', 'Grant'], ['runs', 'Runs'], ['economy', 'Economy'], ['routelab', 'Route lab'],
    ['payloads', 'Payloads'], ['feel', 'Feel'], ['save', 'Save'], ['telemetry', 'Telemetry']];
  const L = { open: false, syncAt: 0, teleAt: 0, resetArm: 0, routeLab: null, routeLabAt: '', paste: { msg: '', errs: [] }, save: { msg: '', errs: [] }, seed: 48206, tick: 0 };
  const CTL = {};                                             // id -> { kind, get, set, fmt, values }
  const S = () => A.state;
  const tz = () => -new Date().getTimezoneOffset() * 60000;

  function dev(op, extra) { return A.act(Object.assign({ type: 'dev', op }, extra || {}), { quiet: false }); }
  function labLog(type, data) { try { E.log(S(), 'lab:' + type, data == null ? null : data, true); } catch (e) { /* telemetry is optional */ } }

  // ------------------------------------------------------------------ control builders
  function seg(id, label, opts, get, set, o) {
    CTL[id] = { kind: 'seg', get, set };
    o = o || {};
    return '<div class="row"><div class="rl"><span>' + esc(label) + '</span>' + (o.out ? '<span class="val" data-out="' + o.out + '"></span>' : '') + '</div>' +
      '<div class="lseg' + (o.wrap ? ' wrap' : '') + '" role="radiogroup" aria-label="' + esc(label) + '">' +
      opts.map(([v, t]) => '<button type="button" role="radio" aria-checked="false" data-ctl="' + id + '" data-v="' + esc(JSON.stringify(v)) + '">' + esc(t) + '</button>').join('') + '</div>' +
      (o.hint ? '<p class="lnote">' + o.hint + '</p>' : '') + '</div>';
  }
  function slider(id, label, min, max, step, get, set, f, o) {
    CTL[id] = { kind: 'range', get, set, fmt: f };
    o = o || {};
    return '<div class="row"><label class="rl" for="lab-' + id + '"><span>' + esc(label) + '</span><output data-out="ctl:' + id + '"></output></label>' +
      '<input id="lab-' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" data-ctl="' + id + '">' +
      (o.hint ? '<p class="lnote">' + o.hint + '</p>' : '') + '</div>';
  }
  function toggle(id, label, get, set, o) {
    CTL[id] = { kind: 'toggle', get, set };
    o = o || {};
    return '<div class="row"><label class="tog"><span>' + esc(label) + '</span><input type="checkbox" data-ctl="' + id + '"><i aria-hidden="true"></i></label>' + (o.hint ? '<p class="lnote">' + o.hint + '</p>' : '') + '</div>';
  }
  const btn = (a, t, cls, extra) => '<button class="lb' + (cls ? ' ' + cls : '') + '" type="button" data-act="' + esc(a) + '"' + (extra || '') + '>' + esc(t) + '</button>';
  const mulSlider = (key, label, hint) => slider('mul:' + key, label, 0, MULS.length - 1, 1,
    () => { const v = S().dev.mul[key]; let bi = 0; MULS.forEach((m, i) => { if (Math.abs(m - v) < Math.abs(MULS[bi] - v)) bi = i; }); return bi; },
    (i) => dev('mul', { key, value: MULS[i] }), (i) => '×' + MULS[i], { hint });

  // ------------------------------------------------------------------ sections
  function build() {
    for (const k of Object.keys(CTL)) delete CTL[k];
    const d = () => S().dev;
    let h = '<p class="lnote" style="margin-top:8px">Dev and tuning. Every change here is logged as dev in the telemetry.</p>';
    h += '<h3 id="lab-clock">Clock</h3>';
    h += seg('timeScale', 'Time scale', [[0, 'Pause'], [1, '1x'], [10, '10x'], [60, '60x'], [600, '600x']], () => d().timeScale, (v) => dev('timeScale', { value: v }), { out: 'clock' });
    h += '<div class="row"><div class="rl"><span>Skip ahead</span><span class="val">offline rules + welcome back</span></div><div class="lbtns five">' +
      [[5 * MIN, '+5 m'], [HOUR, '+1 h'], [8 * HOUR, '+8 h'], [24 * HOUR, '+24 h'], [7 * 24 * HOUR, '+7 d']].map(([ms, t]) => btn('skip:' + ms, t)).join('') + '</div></div>';
    h += toggle('runUsesCampTime', 'Run uses camp time', () => d().runUsesCampTime, (v) => dev('runUsesCampTime', { value: v }), { hint: 'On: a run moves the camp clock by its own length. Off is dev only.' });
    h += '<p class="lnote" data-out="timeline"></p>';

    h += '<h3 id="lab-grant">Grant</h3><div class="lbtns">' +
      btn('grant:scrap', '+1 000 scrap') + btn('grant:food', '+500 food') + btn('grant:meds', '+100 meds') + btn('grant:bp', '+5 BP') +
      btn('grant:survivor', '+1 survivor') + btn('grant:bat', '+100 bat') + btn('fillStorage', 'Fill storage') + btn('finishAll', 'Finish timers') + '</div>';
    h += seg('setCL', 'Set Camp Lv', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, String(n)]), () => S().lv.campfire, (n) => { const r = dev('setCL', { n }); if (r.ok) A.resetUi(); }, { wrap: true, hint: 'Levels above the new Camp Level drop to it; jobs that no longer fit are cancelled.' });

    h += '<h3 id="lab-runs">Runs</h3>';
    h += seg('force', 'Force next outcome', [['auto', 'Auto'], ['win', 'Win'], ['loss', 'Loss'], ['gateLoss', 'Gate loss']], () => d().force, (v) => dev('force', { value: v }), { hint: 'One run only, then back to Auto.' });
    CTL.lockSeed = { kind: 'toggle', get: () => d().lockSeed != null, set: (v) => dev('lockSeed', { value: v ? L.seed : null }) };
    h += '<div class="row"><label class="tog"><span>Lock seed</span><input type="checkbox" data-ctl="lockSeed"><i aria-hidden="true"></i></label>' +
      '<div class="rl"><span class="lnote" style="margin:0">Seed for every run while locked</span><input class="seedin" type="number" inputmode="numeric" min="0" step="1" data-seed aria-label="Locked seed"></div></div>';
    h += seg('forcedWins', 'Forced wins at start', [[0, '0'], [1, '1'], [2, '2']], () => d().forcedWinsSetting, (v) => dev('forcedWins', { value: v }));
    h += slider('skill', 'Skill', -0.2, 0.2, 0.01, () => d().skill, (v) => dev('skill', { value: v }), (v) => (v > 0 ? '+' : '') + v.toFixed(2));
    h += seg('runScreenSec', 'Run screen', [[3, '3 s'], [8, '8 s'], [20, '20 s']], () => d().runScreenSec, (v) => dev('runScreenSec', { value: v }));
    h += slider('lossPayout', 'Loss payout', 0, 0.6, 0.05, () => d().lossPayout, (v) => dev('lossPayout', { value: v }), (v) => pct(v));
    h += slider('injuryMin', 'Injury minutes per danger', 0, 15, 1, () => d().injuryMin, (v) => dev('injuryMin', { value: v }), (v) => v + ' min');
    h += slider('intelG', 'Intel gear per stack', 0, 6, 1, () => d().intelG, (v) => dev('intelG', { value: v }), (v) => '+' + v + ' gear');
    h += '<h4>Sim constants</h4>';
    h += slider('D0', 'D0 (damage scale)', 80, 150, 1, () => d().sim.D0, (v) => dev('sim', { D0: v }), (v) => String(v));
    h += slider('night', 'Night σ', 0.3, 0.8, 0.05, () => d().sim.night, (v) => dev('sim', { night: v }), (v) => v.toFixed(2));
    h += slider('medCalm', 'Medkit calm', 0.4, 1.0, 0.05, () => d().sim.medCalm, (v) => dev('sim', { medCalm: v }), (v) => v.toFixed(2));
    h += '<p class="lnote" data-out="frontier"></p><div class="lbtns">' + btn('defaults:runs', 'Run defaults') + '</div>';

    h += '<h3 id="lab-economy">Economy</h3>';
    h += mulSlider('prod', 'Production') + mulSlider('loot', 'Run loot') + mulSlider('cost', 'Costs', 'Storage caps scale with costs.') +
      mulSlider('time', 'Timers') + mulSlider('bat', 'Battery income') + mulSlider('skip', 'Skip price');
    h += '<div class="row" data-out="rule"></div>';
    h += slider('freeSec', 'Free finish under', 0, 300, 10, () => d().freeSec, (v) => dev('freeSec', { value: v }), (v) => v + ' s');
    h += slider('skipExp', 'Skip exponent', 0.6, 1.0, 0.05, () => d().skipExp, (v) => dev('skipExp', { value: v }), (v) => v.toFixed(2));
    h += slider('momentum', 'Momentum per win', 0, 0.15, 0.01, () => d().momentum, (v) => dev('momentum', { value: v }), (v) => pct(v));
    h += slider('momentumCap', 'Momentum cap', 0, 0.5, 0.05, () => d().momentumCap, (v) => dev('momentumCap', { value: v }), (v) => pct(v));
    h += '<p class="lnote" data-out="prices"></p><div class="lbtns">' + btn('defaults:economy', 'Economy defaults') + '</div>';

    h += '<h3 id="lab-routelab">Route lab</h3><p class="lnote">Each route for the current loadout and runner: 1 000 runs, odds, medians on a win, and value (scrap + 2 food + 10 meds) per attempt and per camp minute of running.</p>';
    h += '<div class="lbtns">' + btn('routelab', 'Run 1 000 per route', 'primary') + '</div><div data-out="routelab"></div>';

    h += '<h3 id="lab-payloads">Payloads</h3>';
    CTL.external = { kind: 'toggle', get: () => !!A.ui.external, set: (v) => { A.ui.external = !!v; labLog('external', { on: !!v }); } };
    h += '<div class="row"><label class="tog"><span>Next run is external</span><input type="checkbox" data-ctl="external"><i aria-hidden="true"></i></label>' +
      '<p class="lnote">START saves the handoff as pending with source "game" and the run screen waits for a result pasted here.</p></div>';
    h += '<p class="lnote" data-out="pending"></p>';
    h += '<textarea id="labPaste" spellcheck="false" placeholder="Paste a result JSON (SPEC 5.10)" aria-label="Paste a result JSON"></textarea>';
    h += '<div class="lbtns two">' + btn('fillSim', 'Fill from the sim') + btn('resolve', 'Resolve the run', 'primary') + '</div><div data-out="pasteMsg"></div>';
    h += '<h4>Last handoff (camp to game)</h4><div class="lbtns">' + btn('copy:handoff', 'Copy handoff') + '</div><pre data-out="handoff"></pre>';
    h += '<h4>Last result (game to camp)</h4><div class="lbtns">' + btn('copy:result', 'Copy result') + '</div><pre data-out="result"></pre>';

    h += '<h3 id="lab-feel">Feel</h3>';
    h += seg('particles', 'Particle density', [[0, '0'], [0.5, '0.5'], [1, '1'], [2, '2']], () => d().particles, (v) => dev('particles', { value: v }));
    h += toggle('reducedMotion', 'Force reduced motion', () => d().reducedMotion, (v) => dev('reducedMotion', { value: v }), { hint: 'Same as the system setting: no flyers, instant camera, light and Camp Level beat.' });
    h += slider('volume', 'Master volume', 0, 1, 0.05, () => d().volume, (v) => { dev('volume', { value: v }); try { SC.Sfx.setVolume(v); } catch (e) { /* no audio */ } }, (v) => pct(v));
    h += '<div class="lbtns">' + btn('replayFtue', 'Replay FTUE') + btn('skipFtue', 'Skip FTUE') + '</div>';

    h += '<h3 id="lab-save">Save</h3><p class="lnote" data-out="saveInfo"></p>';
    h += '<div class="lbtns">' + btn('export', 'Export (copy)') + btn('import', 'Import pasted') + btn('reset', 'Reset save', 'warn') + '</div>';
    h += '<textarea id="labSave" spellcheck="false" placeholder="Export fills this box; paste a save here to import it" aria-label="Save JSON"></textarea><div data-out="saveMsg"></div>';

    h += '<h3 id="lab-telemetry">Telemetry</h3><div class="lbtns">' + btn('copy:log', 'Copy session log') + btn('copy:kpis', 'Copy KPIs') + '</div><div data-out="tele"></div>';
    return h;
  }

  // ------------------------------------------------------------------ open, close, sync
  function open(section) {
    const el = $('lab');
    if (!L.open) {
      $('labJump').innerHTML = SECTIONS.map(([id, t]) => '<button type="button" data-jump="' + id + '">' + esc(t) + '</button>').join('');
      $('labBody').innerHTML = build();
      el.hidden = false; L.open = true;
      el.classList.add('arming'); setTimeout(() => el.classList.remove('arming'), 250);
      L.syncAt = 0; L.teleAt = 0; sync(true);
      labLog('open', { section: section || null });
      try { A.sfx('tap'); } catch (e) { /* optional */ }
    }
    if (section) jumpTo(section);
  }
  function close() { if (!L.open) return; L.open = false; $('lab').hidden = true; $('labBody').innerHTML = ''; labLog('close'); }
  function jumpTo(id) { const t = $('lab-' + id), body = $('labBody'); if (t && body) body.scrollTop += t.getBoundingClientRect().top - body.getBoundingClientRect().top - 4; }

  function setOut(key, html, isText) {
    for (const el of document.querySelectorAll('#labBody [data-out="' + key + '"]')) {
      if (isText) { if (el.textContent !== html) el.textContent = html; } else if (el._h !== html) { el.innerHTML = html; el._h = html; }
    }
  }
  function sync(force) {
    if (!L.open) return;
    const s = S(), v = A.view, act = document.activeElement;
    for (const id of Object.keys(CTL)) {
      const c = CTL[id], val = c.get();
      if (c.kind === 'seg') for (const b of document.querySelectorAll('#labBody [data-ctl="' + id + '"]')) { const on = JSON.stringify(val) === b.dataset.v; if (b.getAttribute('aria-checked') !== String(on)) b.setAttribute('aria-checked', String(on)); }
      else if (c.kind === 'toggle') { const el = document.querySelector('#labBody input[data-ctl="' + id + '"]'); if (el && el.checked !== !!val) el.checked = !!val; }
      else if (c.kind === 'range') {
        const el = document.querySelector('#labBody input[data-ctl="' + id + '"]');
        if (el && (act !== el || force) && +el.value !== val) el.value = val;
        setOut('ctl:' + id, c.fmt(el && act === el ? +el.value : val), true);
      }
    }
    const seed = document.querySelector('#labBody [data-seed]'); if (seed && act !== seed) seed.value = s.dev.lockSeed != null ? s.dev.lockSeed : L.seed;
    // live lines
    setOut('clock', 'camp ' + fmt.dur(s.campNow / 1000) + ' · day ' + (Math.floor(s.campNow / 86400000) + 1), true);
    const tl = E.timeline(s, 4);
    setOut('timeline', tl.length ? 'Next: ' + esc(tl.map((x) => x.label + ' in ' + fmt.clock(x.inMs / 1000)).join(' · ')) : 'Nothing is ticking.');
    const fr = v && v.frontier ? D.ROUTES.find((r) => r.id === v.frontier) : null;
    setOut('frontier', fr ? 'Frontier now: <b>' + esc(fr.name) + ' ' + pct(v.frontierOdds) + '</b> with these settings. Pending forced wins: ' + s.forcedWins + '.' : '');
    const rule = D.assertData(s.dev.mul.cost || 1);
    setOut('rule', rule.length ? '<p class="rule-bad">Data rule: ' + rule.length + ' violation' + (rule.length > 1 ? 's' : '') + '</p><p class="lnote bad">' + esc(rule.slice(0, 4).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' · ')) + '</p>' : '<p class="rule-ok">Data rule: 0 violations at costs ×' + s.dev.mul.cost + '</p>');
    setOut('prices', 'Skip now: ' + [[60, '1 m'], [600, '10 m'], [3600, '1 h'], [8 * 3600, '8 h']].map(([sec, t]) => t + ' <b>' + E.price.skip(sec, s) + '</b>').join(' · ') + ' bat · free under ' + s.dev.freeSec + ' s');
    const p = s.pending;
    setOut('pending', p ? 'Waiting: <b>' + esc(p.handoff.runId) + '</b> on ' + esc(p.handoff.route.name) + ' (' + (p.source === 'game' ? 'external' : 'simulated') + ')' : 'No run is waiting for a result.');
    const pm = L.paste;
    setOut('pasteMsg', (pm.msg ? '<p class="' + (pm.errs.length ? 'errs' : 'okmsg') + '" style="list-style:none;padding:0">' + esc(pm.msg) + '</p>' : '') + (pm.errs.length ? '<ul class="errs">' + pm.errs.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : ''));
    setOut('handoff', s.lastHandoff ? JSON.stringify(s.lastHandoff, null, 1) : 'No run yet.', true);
    setOut('result', s.lastResult ? JSON.stringify(s.lastResult, null, 1) : 'No result yet.', true);
    let size = 0; try { size = E.serialize(s).length; } catch (e) { size = 0; }
    setOut('saveInfo', (!A.store.ok ? '<b class="bad">Storage blocked: progress won\'t be saved.</b> ' : A.isDemo() ? '<b>Demo camp: never saved.</b> ' : 'Saved on this device as <b>' + esc(A.KEY) + '</b>. ') + 'About ' + (size / 1024).toFixed(1) + ' KB · ' + s.seq + ' changes · created ' + esc(new Date(s.createdAt).toLocaleString()));
    const sm = L.save;
    setOut('saveMsg', (sm.msg ? '<p class="' + (sm.errs.length ? 'errs' : 'okmsg') + '" style="list-style:none;padding:0">' + esc(sm.msg) + '</p>' : ''));
    const rb = document.querySelector('#labBody [data-act="reset"]');
    if (rb) { const armed = L.resetArm > performance.now(); rb.textContent = armed ? 'Tap again to reset' : 'Reset save'; rb.classList.toggle('armed', armed); }
    if (L.routeLab) setOut('routelab', L.routeLab);
    teleMaybe(force);
  }
  function teleMaybe(force) {
    const now = performance.now();
    if (!force && now - L.teleAt < 1000) return;
    const box = document.querySelector('#labBody [data-out="tele"]'), body = $('labBody');
    if (!box || !body) return;
    const br = body.getBoundingClientRect(), r = box.getBoundingClientRect();
    if (!force && (r.top > br.bottom + 200 || r.bottom < br.top - 200)) return;    // off screen: skip the work
    L.teleAt = now;
    const keep = Array.from(box.querySelectorAll('.tw')).map((x) => x.scrollLeft);
    setOut('tele', telemetry());
    Array.from(box.querySelectorAll('.tw')).forEach((x, i) => { if (keep[i]) x.scrollLeft = keep[i]; });
  }

  // ------------------------------------------------------------------ telemetry tables (SPEC 9, items 1-7)
  const tbl = (head, rows, numFrom) => '<div class="tw"><table><thead><tr>' + head.map((h, i) => '<th' + (i >= (numFrom || 1) ? ' class="n"' : '') + '>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map((r) => '<tr>' + r.map((c, i) => (typeof c === 'object' && c && c.html != null ? '<td class="' + (c.cls || (i >= (numFrom || 1) ? 'n' : '')) + '">' + c.html + '</td>' : '<td' + (i >= (numFrom || 1) ? ' class="n"' : '') + '>' + esc(c) + '</td>')).join('') + '</tr>').join('') : '<tr><td colspan="' + head.length + '" class="wrap">Nothing yet</td></tr>') + '</tbody></table></div>';
  const mins = (ms) => (ms / MIN).toFixed(ms < 10 * MIN ? 1 : 0) + ' min';
  const judge = (ok) => (ok == null ? '' : ok ? 'good' : 'bad');
  function telemetry() {
    const s = S(), k = E.kpis(s), T = s.tele, hours = Math.max(1 / 60, s.campNow / HOUR);
    let h = '';
    // targets the tester watches
    const fullShare = Math.max(...['scrap', 'food', 'meds'].map((r) => (k.storageFullMs[r] || 0) / Math.max(1, s.campNow)));
    let bucketDev = null;
    for (const b of k.buckets) if (b.n >= 20) { const d = Math.abs(b.wins / b.n - (b.from + 5) / 100); bucketDev = Math.max(bucketDev || 0, d); }
    const enough = k.runs >= 5;
    const tg = [
      ['Crew idle', pct(k.crewIdleShare), '< 20%', k.crewIdleShare < 0.2],
      ['Storage FULL (worst)', pct(fullShare), '< 15%', fullShare < 0.15],
      ['Nothing to do', pct(k.nothingShare), '< 10%', k.nothingShare < 0.1],
      ['Frontier share', enough ? pct(k.frontierShare) : '–', '50-90%', enough ? k.frontierShare >= 0.5 && k.frontierShare <= 0.9 : null],
      ['Loss rate', enough ? pct(k.lossRate) : '–', '10-35%', enough ? k.lossRate >= 0.1 && k.lossRate <= 0.35 : null],
      ['Longest loss streak', String(k.maxLossStreak), '≤ 3', k.maxLossStreak <= 3],
      ['Empty-stock plays (CL3+)', pct(k.emptyStockShare), '< 25%', k.emptyStockShare < 0.25],
      ['Shown vs actual (≥ 20 runs)', bucketDev == null ? '–' : '±' + Math.round(bucketDev * 100) + ' pts', '±5 pts', bucketDev == null ? null : bucketDev <= 0.05],
      ['Run share of scrap', pct(k.runShareScrap), 'active ~30%, idle 10-13%', null],
    ];
    h += '<h4>Targets</h4>' + tbl(['Metric', 'Now', 'Target'], tg.map((r) => [r[0], { html: esc(r[1]), cls: 'n ' + judge(r[3]) }, r[2]]));
    // 2. time to each unlock
    const un = Object.keys(T.unlocks).map((key) => [key, T.unlocks[key]]).sort((a, b) => a[1].camp - b[1].camp);
    h += '<h4>Time to each unlock</h4>' + tbl(['Unlock', 'Camp', 'Real'], un.map(([key, u]) => [key, fmt.dur(u.camp / 1000), u.real != null ? fmt.dur(Math.max(0, u.real - s.createdAt) / 1000) : '–']));
    // 3. income per hour by source
    const inc = (bag, div) => Object.keys(bag || {}).sort().map((src) => [src, ...['scrap', 'food', 'meds'].map((r) => Math.round((bag[src][r] || 0) / div))]);
    h += '<h4>Income per camp hour · whole save</h4>' + tbl(['Source', 'Scrap', 'Food', 'Meds'], inc(k.incomeAll, hours));
    h += '<h4>Income · last full camp hour</h4>' + tbl(['Source', 'Scrap', 'Food', 'Meds'], inc(k.incomeLastHour, 1));
    h += '<p class="lnote">Run scrap per camp hour of running ÷ idle scrap per hour: <b>' + (k.runVsIdleScrapPerHour ? k.runVsIdleScrapPerHour.toFixed(1) + '×' : '–') + '</b> · run share of scrap ' + pct(k.runShareScrap) + '</p>';
    // 4. batteries
    h += '<h4>Batteries earned · ' + k.batEarned + ' (+' + k.batEarnedDev + ' dev)</h4>' + tbl(['Source', 'Batteries'], Object.keys(k.batEarnedBy).sort().map((x) => [x, k.batEarnedBy[x]]));
    h += '<h4>Batteries spent · ' + k.batSpent + '</h4>' + tbl(['Category', 'Batteries'], Object.keys(k.batSpentBy).sort().map((x) => [x, k.batSpentBy[x]]));
    h += '<p class="lnote">Free test packs claimed: <b>' + (['small', 'medium', 'large'].map((x) => (k.packs[x] || 0) + ' ' + x).join(', ')) + '</b> · spent on timers under 5 min in the first hour: <b>' + pct(k.batFirstHourUnder5Share) + '</b></p>';
    // 5. runs
    const byR = T.runs.byRoute || {};
    h += '<h4>Runs · ' + k.runs + ' (' + k.wins + ' won)</h4>' + tbl(['Route', 'Runs', 'Win rate', 'Avg shown'], D.ROUTES.filter((r) => byR[r.id]).map((r) => { const x = byR[r.id]; return [r.id + ' ' + r.name, x.n, pct(x.wins / Math.max(1, x.n)), pct(x.odds / Math.max(1, x.n))]; }));
    h += tbl(['Shown odds', 'Runs', 'Actual', 'Check'], k.buckets.filter((b) => b.n > 0).map((b) => [b.from + '-' + (b.from + 10) + '%', b.n, pct(b.wins / b.n), { html: b.n >= 20 ? (Math.abs(b.wins / b.n - (b.from + 5) / 100) <= 0.05 ? 'ok' : 'off') : 'n < 20', cls: 'n ' + (b.n >= 20 ? judge(Math.abs(b.wins / b.n - (b.from + 5) / 100) <= 0.05) : '') }]));
    const it = k.items, itemRow = (x) => ['medkit', 'pills', 'bomb'].map((i) => (x[i] || 0)).join(' / ');
    h += '<p class="lnote">Frontier share <b>' + pct(k.frontierShare) + '</b> · loss rate <b>' + pct(k.lossRate) + '</b> · longest loss streak <b>' + k.maxLossStreak + '</b> · empty-stock plays <b>' + pct(k.emptyStockShare) + '</b><br>Items (medkit / pills / bomb): crafted ' + itemRow(it.crafted) + ' · used ' + itemRow(it.used) + ' · returned ' + itemRow(it.returned) + '</p>';
    // 6. pacing health
    const K = T.kpi, w = k.waste;
    h += '<h4>Pacing health</h4>' + tbl(['Measure', 'Value'], [
      ['Foreground time', mins(K.fgMs)],
      ['Crew idle (free crew + affordable build)', mins(K.crewIdleMs) + ' · ' + pct(k.crewIdleShare)],
      ['Nothing to do', mins(K.nothingMs) + ' · ' + pct(k.nothingShare)],
      ['Storage full: scrap / food / meds', ['scrap', 'food', 'meds'].map((r) => mins(k.storageFullMs[r] || 0)).join(' / ')],
      ['Waste at full buffers (S / F / M)', [w.salvage, w.garden, w.infirmary].map((x) => Math.round(x || 0)).join(' / ') + (w.generator ? ' · ' + Math.round(w.generator) + ' bat' : '')],
      ['Truck overflow lost (S / F / M)', ['scrap', 'food', 'meds'].map((r) => Math.round((w.truck || {})[r] || 0)).join(' / ')],
      ['Toy taps per minute', 'P1 (no toys built)'],
    ]);
    // 7. injuries
    h += '<h4>Injuries</h4><p class="lnote">Injured person-minutes per camp hour <b>' + k.injuredPersonMinPerHour.toFixed(1) + '</b> · batteries on injuries <b>' + pct(k.injurySkipShare) + '</b> of skip spend</p>';
    // 1. session log
    const log = T.log.slice(-60).reverse();
    h += '<h4>Session log · ' + T.log.length + ' of 500 kept · ' + T.kpi.devRows + ' dev rows</h4>' +
      tbl(['Camp', 'Type', 'Data'], log.map((r) => [fmt.clock(r.camp / 1000), { html: esc(r.type) + (r.dev ? ' <span class="dev">dev</span>' : ''), cls: '' }, { html: esc(r.data == null ? '' : JSON.stringify(r.data).slice(0, 90)), cls: 'wrap' }]), 9);
    return h;
  }

  // ------------------------------------------------------------------ actions
  function copy(text, label) {
    const fallback = () => {
      let ok = false; const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      A.toast(ok ? label + ' copied' : 'Copy is blocked here: select the text instead');
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(() => A.toast(label + ' copied'), fallback); return; } } catch (e) { /* fall back */ }
    fallback();
  }
  function onAct(a, el) {
    const s = S(), [k, x] = a.split(':');
    switch (k) {
      case 'skip': {
        const ms = +x, r = E.act(s, { type: 'dev', op: 'skipAhead', ms });
        if (!r.ok) { A.toast(r.err); return; }
        A.ui.celebrations = 0;
        if (r.welcome && r.welcome.rows.length) A.welcomeCard(r.welcome); else A.toast('Skipped ' + fmt.dur(ms / 1000) + ': nothing new');
        A.handle(r.events, { offline: true });
        A.save();
        return;
      }
      case 'grant': dev('grant', { what: x }); A.toast('Granted'); return;
      case 'fillStorage': dev('fillStorage'); return;
      case 'finishAll': dev('finishAll'); return;
      case 'defaults': {
        if (x === 'economy') { for (const m of Object.keys(s.dev.mul)) dev('mul', { key: m, value: 1 }); dev('freeSec', { value: 30 }); dev('skipExp', { value: 0.8 }); dev('momentum', { value: 0.05 }); dev('momentumCap', { value: 0.25 }); }
        else { dev('force', { value: 'auto' }); dev('lockSeed', { value: null }); dev('skill', { value: 0 }); dev('runScreenSec', { value: 8 }); dev('lossPayout', { value: 0.35 }); dev('injuryMin', { value: 6 }); dev('intelG', { value: 3 }); dev('sim', { D0: 110, night: 0.6, medCalm: 0.6 }); }
        A.toast('Defaults restored'); sync(true); return;
      }
      case 'routelab': {
        const t0 = performance.now(), rows = E.routeLab(s, 1000), ms = performance.now() - t0, v = A.view;
        const lo = E.buildHandoff(s, s.loadout.route, null), items = ['medkit', 'pills', 'bomb'].filter((i) => lo.loadout[i]).join(' + ') || 'no items';
        L.routeLab = '<p class="lnote">' + esc(D.WEAPONS[lo.loadout.primary].name + ' · ' + items + ' · ' + (lo.runner ? lo.runner.name + (lo.runner.hurt ? ' (hurt)' : '') : 'no runner') + ' · gear ' + lo.gear) + ' · ' + ms.toFixed(0) + ' ms</p>' +
          tbl(['Route', 'Odds', 'Kills', 'Time', 'Dmg', 'Value/run', 'Value/min'], rows.map((r) => [{ html: esc(r.id + ' ' + r.name) + (v && r.id === v.frontier ? ' <span class="dev">frontier</span>' : ''), cls: '' }, pct(r.odds), r.kills, fmt.clock(r.time), Math.round(r.damage), Math.round(r.valuePerAttempt), Math.round(r.valuePerCampMin)]));
        labLog('routeLab', { ms: Math.round(ms) }); sync(); return;
      }
      case 'fillSim': {
        if (!s.pending) { L.paste = { msg: 'Start a run first (with "Next run is external" on, START waits for a result).', errs: ['No run is waiting for a result'] }; sync(); return; }
        $('labPaste').value = JSON.stringify(E.runSim(s), null, 1); L.paste = { msg: 'Filled with what the sim would return for ' + s.pending.handoff.runId + '. Edit it or resolve it.', errs: [] };
        labLog('fillSim'); sync(); return;
      }
      case 'resolve': {
        const txt = $('labPaste').value.trim();
        let obj = null;
        try { obj = JSON.parse(txt); } catch (e) { L.paste = { msg: 'Not JSON', errs: [String(e.message || e)] }; sync(); return; }
        const r = A.resolveWith(obj);
        labLog('paste', { ok: !!r.ok });
        if (!r.ok) { L.paste = { msg: 'Rejected', errs: r.errors && r.errors.length ? r.errors : [r.err] }; sync(); return; }
        L.paste = { msg: 'Resolved ' + (obj.runId || '') + ': ' + (r.reward.win ? 'win' : 'loss'), errs: [] };
        $('labPaste').value = ''; close(); return;
      }
      case 'copy': {
        if (x === 'handoff') copy(JSON.stringify(s.lastHandoff, null, 1) || 'null', 'Handoff');
        else if (x === 'result') copy(JSON.stringify(s.lastResult, null, 1) || 'null', 'Result');
        else if (x === 'log') copy(JSON.stringify(s.tele.log), 'Session log');
        else if (x === 'kpis') copy(JSON.stringify(E.kpis(s), null, 1), 'KPIs');
        labLog('copy', { what: x }); return;
      }
      case 'replayFtue': { const r = dev('replayFtue'); if (r.ok) { A.resetUi(); close(); } return; }
      case 'skipFtue': { const r = dev('skipFtue'); if (r.ok) { A.resetUi(); A.toast('FTUE skipped'); } return; }
      case 'export': {
        const raw = E.serialize(s); $('labSave').value = raw; copy(raw, 'Save');
        L.save = { msg: 'Exported ' + (raw.length / 1024).toFixed(1) + ' KB into the box below (and to the clipboard where allowed).', errs: [] };
        labLog('export', { bytes: raw.length }); sync(); return;
      }
      case 'import': {
        const raw = $('labSave').value.trim();
        if (!raw) { L.save = { msg: 'Paste a save into the box first', errs: ['empty'] }; sync(); return; }
        const r = E.load(raw, Date.now(), { tzOffsetMs: tz(), seed: (Math.random() * 4294967296) >>> 0 });
        if (r.status !== 'ok' && r.status !== 'migrated') { L.save = { msg: 'Not imported: ' + (r.status === 'corrupt-reset' ? 'that is not a readable Survivor Camp save' : r.status === 'future-version' ? 'saved by a newer version' : r.status), errs: [r.status] }; labLog('import', { ok: false, status: r.status }); sync(); return; }
        r.state.realSeenAt = Date.now();
        A.replaceState(r.state);
        labLog('import', { ok: true, notes: (r.notes || []).length });
        L.save = { msg: 'Imported' + (r.notes && r.notes.length ? ' (' + r.notes.length + ' fields repaired)' : ''), errs: [] }; sync(true); return;
      }
      case 'reset': {
        if (L.resetArm < performance.now()) { L.resetArm = performance.now() + 3000; sync(); return; }
        L.resetArm = 0; A.resetSave(); close(); A.toast('A fresh camp: tap the fire'); return;
      }
      default: return;
    }
  }
  function onClick(e) {
    const t = e.target;
    const j = t.closest('[data-jump]'); if (j) { jumpTo(j.dataset.jump); return; }
    const c = t.closest('button[data-ctl]');
    if (c) { const ctl = CTL[c.dataset.ctl]; if (ctl) { ctl.set(JSON.parse(c.dataset.v)); sync(); } return; }
    const a = t.closest('[data-act]'); if (a) { onAct(a.dataset.act, a); sync(); }
  }
  function onInput(e) {
    const el = e.target;
    if (el.matches('input[type="range"][data-ctl]')) { const c = CTL[el.dataset.ctl]; if (c) setOut('ctl:' + el.dataset.ctl, c.fmt(+el.value), true); if (e.type === 'change' && c) { c.set(+el.value); sync(); } return; }
    if (el.matches('input[type="checkbox"][data-ctl]')) { if (e.type !== 'change') return; const c = CTL[el.dataset.ctl]; if (c) { c.set(el.checked); sync(); } return; }
    if (el.matches('[data-seed]') && e.type === 'change') { const v = Math.max(0, Math.floor(+el.value || 0)); L.seed = v; if (S().dev.lockSeed != null) dev('lockSeed', { value: v }); sync(); }
  }
  function wire() {
    $('labClose').addEventListener('click', () => { A.gesture(); close(); });
    $('labJump').addEventListener('click', onClick);
    const body = $('labBody');
    body.addEventListener('click', (e) => { A.gesture(); onClick(e); });
    body.addEventListener('input', onInput);
    body.addEventListener('change', onInput);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && L.open && !(A.ui.modal)) { e.stopImmediatePropagation(); close(); } }, true);
    (function loop() { requestAnimationFrame(loop); if (L.open && performance.now() - L.syncAt > 400) { L.syncAt = performance.now(); sync(); } })();
  }

  SC.UI.hooks.openLab = (section) => { if (L.open && !section) close(); else open(section); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  return { open, close, isOpen: () => L.open, telemetry };
});
