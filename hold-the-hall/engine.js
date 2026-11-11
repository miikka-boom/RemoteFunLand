/* Hold the Hall: the engine. Pure rules: no DOM, no clock and no unseeded randomness (tests.cjs checks this).
 * Classic script: HH.Engine in the browser, module.exports in node.
 *
 * State (plain JSON, saved as is):
 *   { v, seed, rng, t (game ms), savedAt (wall ms), intro, won, res: { sup, fuel }, ammo, ammoAt,
 *     blocks: [{ id, bx, by, ring, type, name, threat, hp, hpMax, owned, lv (0 = ruin), job: { t0, t1 } | null, stock, stockAt }],
 *     people: [{ id, name, trait, lv, xp, state: 'ok' | 'rest' | 'out' | 'down', until, hurt, revives, runs, wins, look, log, fell }],
 *     graves: [{ id, name, lv, trait, look, where, night, runs, wins }], run: { bid, pid, win, down, sup, t0, t1, night, ... } | null,
 *     last (the last run's result), night, horde: { n, left, t1 } | null, hordeAt, arriveAt, goal, stats, lab }
 *
 * create(seed, now) -> state            demo(seed, now) -> a mid-game state for #demo (state.demo: never save it)
 * tick(state, dtMs, { offline }) -> events     act(state, { type, ... }) -> { ok, err, data, ev }
 * save(state, now) -> string            load(string, now) -> { s, awayMs, ev } | null (advances the time away, capped)
 * Actions: introDone · shoot · hordeHit · go { bid, pid } · runSkip · build { bid } · skip { kind: 'job' | 'rest', bid | pid }
 *   · collect { bid } · revive { pid, pay: 'sup' | 'fuel' } · goodbye { pid } · pack · lab { op, ... }
 */
(function (root, f) {
  const node = typeof module === 'object' && module.exports;
  const api = f(node ? require('./data.js') : root.HH.DATA);
  if (node) module.exports = api; else root.HH.Engine = api;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const { MIN, N, C, TYPES, HALL, TRAITS } = D, R = D.RULES;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ok = (ev, data) => ({ ok: true, err: null, data: data || null, ev: ev || [] });
  const err = (e, data) => ({ ok: false, err: e, data: data || null, ev: [] });

  // ---------------------------------------------------------------- seeded randomness (mulberry32, state in s.rng)
  function rnd(s) {
    let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pick = (s, arr) => arr[Math.floor(rnd(s) * arr.length)];
  function shuffle(s, arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)), x = arr[i]; arr[i] = arr[j]; arr[j] = x; } return arr; }

  // ---------------------------------------------------------------- a new town
  function create(seed, now) {
    const s = { v: 1, seed: seed >>> 0, rng: (seed ^ 0x9e3779b9) | 0, t: 0, savedAt: now || 0, intro: false, won: false,
      res: { sup: R.start.sup, fuel: R.start.fuel }, ammo: HALL.ammo[0], ammoAt: 0, blocks: [], people: [], graves: [], ids: 0,
      run: null, last: null, night: 0, horde: null, hordeAt: 0, arriveAt: 0, goal: 0,
      stats: { kills: 0, wins: 0, losses: 0, downs: 0, revives: 0, goodbyes: 0, collected: 0, hordes: 0, packs: 0, skips: 0 },
      lab: { speed: 1, force: null } };
    buildTown(s);
    for (let i = 0; i < R.beds0; i++) addPerson(s, 1);
    return s;
  }
  function buildTown(s) {
    const ring1 = shuffle(s, ['workshop', 'clinic', 'armory', 'tower', 'garden', 'tower']);
    const sideT = shuffle(s, [10, 11]), cornT = shuffle(s, [12, 13, 14, 16]);
    const ring2 = shuffle(s, ['home', 'home', 'home', 'garden', 'garden', 'garden', 'workshop', 'workshop', 'clinic', 'clinic', 'armory', 'armory', 'tower', 'tower', 'gas']);
    const t2 = shuffle(s, [24, 26, 28, 30, 32, 34, 36, 38, 40, 43, 46, 49, 52, 56, 60]);
    const names = {}; for (const k in TYPES) names[k] = shuffle(s, TYPES[k].ruins.slice());
    let i1 = 0, i2 = 0;
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      const dx = bx - C, dy = by - C, ring = Math.max(Math.abs(dx), Math.abs(dy));
      let type, threat, hp;
      if (ring === 0) { type = 'hall'; threat = 0; hp = 0; }
      else if (ring === 1) {
        if (dx === 1 && dy === 0) { type = 'home'; threat = 6; hp = 1; }              // the two blocks the goals teach with
        else if (dx === 0 && dy === 1) { type = 'garden'; threat = 8; hp = 1; }
        else { type = ring1[i1++]; threat = dx === 0 || dy === 0 ? sideT.pop() : cornT.pop(); hp = 2; }
      } else if (bx === N - 1 && by === N - 1) { type = 'bridge'; threat = 66; hp = 5; }
      else { type = ring2[i2]; threat = t2[i2++]; hp = threat < 40 ? 3 : 4; }
      const pool = names[type];
      s.blocks.push({ id: by * N + bx, bx, by, ring, type, name: pool.length ? pool.shift() : TYPES[type].ruins[0], threat, hp, hpMax: hp,
        owned: false, lv: 0, job: null, stock: 0, stockAt: 0 });
    }
  }
  function addPerson(s, lv) {
    const used = new Set(s.people.map((p) => p.name).concat(s.graves.map((g) => g.name)));
    const free = D.NAMES.filter((n) => !used.has(n)), L = D.LOOKS;
    const name = free.length ? pick(s, free) : pick(s, D.NAMES) + ' ' + (s.ids + 1);
    const worn = new Set(s.people.map((p) => p.look.jacket)), jackets = L.jacket.filter((j) => !worn.has(j));
    const p = { id: 'p' + (++s.ids), name, trait: pick(s, Object.keys(TRAITS)), lv: lv || 1, xp: 0, state: 'ok', until: 0, hurt: false, revives: 0, runs: 0, wins: 0,
      look: { skin: pick(s, L.skin), hair: pick(s, L.hair), jacket: pick(s, jackets.length ? jackets : L.jacket), style: Math.floor(rnd(s) * L.styles) }, log: [], fell: null };
    s.people.push(p);
    return p;
  }

  // ---------------------------------------------------------------- reading the state
  const hall = (s) => s.blocks[C * N + C];
  const hallLv = (s) => (hall(s).owned ? hall(s).lv : 0);
  const sumLv = (s, type) => { let n = 0; for (const b of s.blocks) if (b.owned && b.type === type) n += b.lv; return n; };
  const owned = (s) => s.blocks.filter((b) => b.owned).length;
  const built = (s) => s.blocks.filter((b) => b.owned && b.type !== 'hall' && b.lv >= 1).length;
  const beds = (s) => R.beds0 + sumLv(s, 'home');
  const person = (s, id) => s.people.find((p) => p.id === id) || null;
  const blockAt = (s, bx, by) => (bx < 0 || by < 0 || bx >= N || by >= N ? null : s.blocks[by * N + bx]);
  const neighbours = (s, b) => [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => blockAt(s, b.bx + dx, b.by + dy)).filter(Boolean);
  const theName = (b) => 'the ' + (b.name.indexOf('The ') === 0 ? b.name.slice(4) : b.name);
  const needHall = (b) => (b.type === 'bridge' ? HALL.bridge : HALL.reach.findIndex((r) => r >= b.ring) + 1);
  // why a block cannot be attacked now: 'bad' (owned, or the hall is not taken yet), 'far' (no owned block beside it), 'hall' (needs a higher hall)
  function attackWhy(s, b) {
    if (!s.intro || b.owned) return 'bad';
    if (!neighbours(s, b).some((n) => n.owned)) return 'far';
    return hallLv(s) < needHall(b) ? 'hall' : null;
  }
  const targets = (s) => s.blocks.filter((b) => !attackWhy(s, b));
  const need = (lv) => R.xpNeed * lv;
  function power(s, p) { return R.power0 + R.powerLv * p.lv + TYPES.armory.power * sumLv(s, 'armory') + (TRAITS[p.trait].power || 0); }
  const deathOn = (s) => s.night >= R.forcedWins && s.people.length >= R.deathMin;
  function odds(s, p, b) {
    const pw = power(s, p), forced = s.night < R.forcedWins;
    const win = forced ? 1 : clamp(1 / (1 + Math.exp(-(pw - b.threat) / R.spread)), R.winMin, R.winMax);
    const rescue = clamp(R.rescue0 + TYPES.clinic.rescue * sumLv(s, 'clinic') + (TRAITS[p.trait].rescue || 0), 0.1, 0.95);
    return { power: pw, threat: b.threat, win, rescue, death: deathOn(s) ? (1 - win) * (1 - rescue) : 0, forced };
  }
  function restMs(s, p, b, hurt) {
    return Math.round((R.rest0 + R.restT * b.threat) * R.restRing[b.ring] * (hurt ? R.hurtMul : 1) * Math.max(R.restMin, 1 - TYPES.clinic.rest * sumLv(s, 'clinic')) * (TRAITS[p.trait].rest || 1));
  }
  function stockT(b, t) { const T = TYPES[b.type]; if (!T.rate || b.lv < 1) return 0; return Math.min(T.cap[b.lv - 1], b.stock + T.rate[b.lv - 1] * Math.max(0, t - b.stockAt) / MIN); }
  const stock = (s, b) => stockT(b, s.t);
  const ammoCap = (s) => HALL.ammo[Math.max(1, hallLv(s)) - 1] + TYPES.tower.ammo * sumLv(s, 'tower');
  const ammo = (s) => Math.min(ammoCap(s), s.ammo + Math.max(0, s.t - s.ammoAt) / R.ammoMs);
  const shotPay = (s) => 1 + TYPES.tower.tap * sumLv(s, 'tower');
  const skipPrice = (ms) => (ms <= R.freeSkipMs ? 0 : Math.max(1, Math.ceil(Math.pow(ms / MIN, R.skipExp))));
  function revivePrice(s, p) {
    const sup = R.reviveSup * p.lv * Math.pow(R.reviveEsc, Math.min(p.revives, 2)) * Math.max(0.5, 1 - 0.1 * sumLv(s, 'clinic'));
    return { sup: Math.round(sup / 5) * 5, fuel: R.reviveFuel + p.lv };
  }
  function goalValue(s, g) {
    switch (g.k) {
      case 'kills': return s.stats.kills; case 'blocks': return owned(s); case 'built': return built(s);
      case 'hall': return hallLv(s); case 'people': return s.people.length; case 'won': return s.won ? 1 : 0;
    }
    return 0;
  }
  // What the town hands to Two Thumbs Left for this run, and what it expects back: { win: true | false }
  function handoff(s, p, b, night, seed) {
    const o = odds(s, p, b), arm = sumLv(s, 'armory'), cl = sumLv(s, 'clinic'), r4 = (x) => Math.round(x * 1e4) / 1e4;
    return { v: 1, kind: 'hold-the-hall.handoff', game: 'two-thumbs-left', runId: 'night-' + night, night, seed,
      destination: { id: 'block-' + b.id, name: b.name, threat: b.threat, nestsLeft: b.hp },
      director: D.director(b.threat),
      runner: { id: p.id, name: p.name, trait: p.trait, level: p.lv, look: p.look },
      player: { maxHp: 100 + 5 * (p.lv - 1) + (p.trait === 'tough' ? 15 : 0), speed: 200 + (p.trait === 'quick' ? 12 : 0), secondWind: cl > 0 ? 1 : 0 },
      startRoom: { primary: ['pistol', 'pistol', 'smg', 'shotgun', 'rifle'][Math.min(4, arm)], damageMul: Math.round((1 + 0.04 * (p.lv - 1)) * 100) / 100, medkit: cl > 0 ? 1 : 0 },
      odds: { home: r4(o.win), death: r4(o.death) } };
  }

  // ---------------------------------------------------------------- time
  function log(p, text) { p.log.push(text); if (p.log.length > 6) p.log.shift(); }
  function addXp(p, xp) { let ups = 0; p.xp += xp; while (p.lv < R.maxLv && p.xp >= need(p.lv)) { p.xp -= need(p.lv); p.lv++; ups++; } if (p.lv >= R.maxLv) p.xp = 0; return ups; }
  function finishJob(s, b, ev) {
    const at = b.job.t1;
    b.stock = stockT(b, at); b.stockAt = at; b.lv++; b.job = null;
    ev.push({ type: 'built', bid: b.id, lv: b.lv });
    if (b.type === 'home') s.arriveAt = s.arriveAt ? Math.min(s.arriveAt, at + R.moveInMs) : at + R.moveInMs;
  }
  function finishRun(s, ev) {
    const r = s.run, b = s.blocks[r.bid], p = person(s, r.pid);
    s.run = null;
    if (!p) return;
    const out = { type: 'result', bid: b.id, pid: p.id, win: r.win, down: false, hurt: false, taken: false, sup: 0, bonus: 0, fuel: 0, xp: 0, lvUp: 0, hpLeft: b.hp, night: r.night, restMs: 0 };
    p.runs++;
    if (r.win) {
      s.stats.wins++; p.wins++; b.hp = Math.max(0, b.hp - 1); out.hpLeft = b.hp; out.sup = r.sup;
      if (b.hp === 0) {
        b.owned = true; b.lv = 0; b.stock = 0; b.stockAt = r.t1; out.taken = true;
        out.bonus = R.bonus0 + R.bonusT * b.threat; out.fuel = b.type === 'bridge' ? 5 : b.ring;
        if (b.type === 'bridge') s.won = true;
      }
      out.restMs = restMs(s, p, b, false); p.state = 'rest'; p.hurt = false; p.until = r.t1 + out.restMs;
      log(p, 'Night ' + r.night + ' · ' + (out.taken ? 'took ' : 'pushed into ') + theName(b));
    } else {
      s.stats.losses++; out.sup = Math.round(r.sup * R.lossLoot);
      if (r.down) {
        p.state = 'down'; p.until = 0; p.hurt = true; p.fell = { name: b.name, night: r.night }; s.stats.downs++; out.down = true;
        log(p, 'Night ' + r.night + ' · went down at ' + theName(b));
      } else {
        out.hurt = true; out.restMs = restMs(s, p, b, true); p.state = 'rest'; p.hurt = true; p.until = r.t1 + out.restMs;
        log(p, 'Night ' + r.night + ' · carried home from ' + theName(b));
      }
    }
    s.res.sup += out.sup + out.bonus; s.res.fuel += out.fuel;
    out.xp = Math.round((R.xp0 + b.threat) * (r.win ? 1 : R.lossXp) * (1 + (TRAITS[p.trait].xp || 0)));
    out.lvUp = addXp(p, out.xp);
    s.last = out; ev.push(out);
    if (s.won && out.taken && b.type === 'bridge') ev.push({ type: 'won', night: r.night });
  }
  function goals(s, ev) {
    while (s.goal < D.GOALS.length) {
      const g = D.GOALS[s.goal];
      if (goalValue(s, g) < g.n) break;
      s.res.sup += g.sup || 0; s.res.fuel += g.fuel || 0;
      ev.push({ type: 'goal', idx: s.goal, sup: g.sup || 0, fuel: g.fuel || 0 });
      s.goal++;
    }
  }
  const hordeGap = (s) => R.hordeGap[0] + Math.floor(rnd(s) * (R.hordeGap[1] - R.hordeGap[0]));
  function tick(s, dt, o) {
    const ev = [], offline = !!(o && o.offline);
    s.t += Math.max(0, dt || 0);
    for (const b of s.blocks) if (b.job && s.t >= b.job.t1) finishJob(s, b, ev);
    if (s.run && s.t >= s.run.t1) finishRun(s, ev);
    for (const p of s.people) if (p.state === 'rest' && s.t >= p.until) { p.state = 'ok'; p.hurt = false; ev.push({ type: 'rested', pid: p.id }); }
    if (s.intro) {
      if (s.people.length < beds(s)) {
        if (!s.arriveAt) s.arriveAt = s.t + R.arriveMs;
        else if (s.t >= s.arriveAt) {
          const lvs = s.people.map((p) => p.lv), avg = lvs.length ? lvs.reduce((a, b) => a + b, 0) / lvs.length : 1;
          const p = addPerson(s, Math.max(1, Math.round(avg) - 1));
          s.arriveAt = 0; ev.push({ type: 'newcomer', pid: p.id });
        }
      } else s.arriveAt = 0;
      if (s.horde) {
        if (s.t >= s.horde.t1) { ev.push({ type: 'hordeGone', left: s.horde.left }); s.horde = null; s.hordeAt = s.t + hordeGap(s); }
      } else if (s.t >= s.hordeAt && !s.won) {
        if (offline) s.hordeAt = s.t + MIN;                                        // hordes only come while someone is watching
        else if (!s.run) { const n = R.hordeN + 2 * (hallLv(s) - 1); s.horde = { n, left: n, t1: s.t + R.hordeMs }; ev.push({ type: 'horde', n }); }
      }
    }
    goals(s, ev);
    return ev;
  }

  // ---------------------------------------------------------------- actions
  const ACT = {
    introDone(s) {
      if (s.intro) return err('bad');
      const h = hall(s); h.owned = true; h.lv = 1; s.intro = true; s.ammo = ammoCap(s); s.ammoAt = s.t; s.hordeAt = s.t + R.hordeFirst;
      return ok([{ type: 'intro' }]);
    },
    shoot(s) {
      if (!s.intro) return err('bad');
      const a = ammo(s); if (a < 1) return err('ammo');
      const pay = shotPay(s); s.ammo = a - 1; s.ammoAt = s.t; s.res.sup += pay; s.stats.kills++;
      return ok([{ type: 'shot', sup: pay }], { sup: pay });
    },
    hordeHit(s) {
      if (!s.horde) return err('bad');
      s.horde.left--; s.stats.kills++;
      if (s.horde.left > 0) return ok([]);
      const sup = R.hordeSup * hallLv(s), fuel = R.hordeFuel;
      s.res.sup += sup; s.res.fuel += fuel; s.stats.hordes++; s.horde = null; s.hordeAt = s.t + hordeGap(s);
      return ok([{ type: 'hordeWon', sup, fuel }]);
    },
    go(s, a) {
      const b = s.blocks[a.bid], p = person(s, a.pid);
      if (!b || !p) return err('bad');
      if (s.run) return err('busy');
      const why = attackWhy(s, b); if (why) return err(why, { needHall: needHall(b) });
      if (p.state !== 'ok') return err('notReady');
      const o = odds(s, p, b), force = s.lab.force; s.lab.force = null;
      const r1 = rnd(s), r2 = rnd(s), r3 = rnd(s), seed = Math.floor(rnd(s) * 4294967296) >>> 0;
      let win = o.forced || r1 < o.win, rescued = r2 < o.rescue, down;
      if (force === 'win') win = true; else if (force === 'hurt') { win = false; rescued = true; } else if (force === 'down') { win = false; rescued = false; }
      down = !win && !rescued && (deathOn(s) || force === 'down');
      const mul = (1 + TYPES.workshop.loot * sumLv(s, 'workshop')) * (1 + (TRAITS[p.trait].loot || 0));
      const sup = Math.round((R.loot0 + R.lootT * b.threat) * mul * (0.85 + 0.3 * r3));
      s.night++; p.state = 'out';
      s.run = { bid: b.id, pid: p.id, win, down, sup, t0: s.t, t1: s.t + R.runMs, night: s.night, pWin: o.win, pDeath: o.death, handoff: handoff(s, p, b, s.night, seed) };
      return ok([{ type: 'go', bid: b.id, pid: p.id, night: s.night }]);
    },
    runSkip(s) { if (!s.run) return err('bad'); s.run.t1 = s.t; return ok([]); },
    build(s, a) {
      const b = s.blocks[a.bid]; if (!b || !b.owned || b.type === 'bridge') return err('bad');
      const T = TYPES[b.type];
      if (b.job) return err('busy');
      if (b.lv >= T.max) return err('max');
      if (b.type !== 'hall' && b.lv >= hallLv(s)) return err('hall', { needHall: b.lv + 1 });
      const cost = T.cost[b.lv]; if (s.res.sup < cost) return err('cost', { need: cost - s.res.sup });
      s.res.sup -= cost; b.job = { t0: s.t, t1: s.t + T.time[b.lv] };
      return ok([{ type: 'jobStart', bid: b.id }]);
    },
    skip(s, a) {
      let left, done;
      if (a.kind === 'job') {
        const b = s.blocks[a.bid]; if (!b || !b.job) return err('bad');
        left = b.job.t1 - s.t; done = (ev) => { b.job.t1 = s.t; finishJob(s, b, ev); };
      } else if (a.kind === 'rest') {
        const p = person(s, a.pid); if (!p || p.state !== 'rest') return err('bad');
        left = p.until - s.t; done = (ev) => { p.state = 'ok'; p.hurt = false; p.until = 0; ev.push({ type: 'rested', pid: p.id }); };
      } else return err('bad');
      const price = skipPrice(left); if (s.res.fuel < price) return err('cost', { need: price - s.res.fuel, fuel: true });
      const ev = []; s.res.fuel -= price; if (price) s.stats.skips++; done(ev);
      return ok(ev, { price });
    },
    collect(s, a) {
      const b = s.blocks[a.bid]; if (!b || !b.owned || !TYPES[b.type].rate) return err('bad');
      const have = stock(s, b), n = Math.floor(have); if (n < 1) return err('empty');
      b.stock = have - n; b.stockAt = s.t; s.stats.collected += n;
      const fuel = b.type === 'gas'; if (fuel) s.res.fuel += n; else s.res.sup += n;
      return ok([{ type: 'collected', bid: b.id, n, fuel }], { n, fuel });
    },
    revive(s, a) {
      const p = person(s, a.pid); if (!p || p.state !== 'down') return err('bad');
      const pr = revivePrice(s, p);
      if (a.pay === 'fuel') { if (s.res.fuel < pr.fuel) return err('cost', { need: pr.fuel - s.res.fuel, fuel: true }); s.res.fuel -= pr.fuel; p.state = 'ok'; p.hurt = false; p.until = 0; }
      else if (a.pay === 'sup') { if (s.res.sup < pr.sup) return err('cost', { need: pr.sup - s.res.sup }); s.res.sup -= pr.sup; p.state = 'rest'; p.hurt = true; p.until = s.t + R.recoverMs * p.lv; }
      else return err('bad');
      p.revives++; p.fell = null; s.stats.revives++; log(p, 'Night ' + s.night + ' · brought back');
      return ok([{ type: 'revived', pid: p.id, pay: a.pay }]);
    },
    goodbye(s, a) {
      const p = person(s, a.pid); if (!p || p.state !== 'down') return err('bad');
      const g = { id: 'g' + (++s.ids), name: p.name, lv: p.lv, trait: p.trait, look: p.look, where: p.fell ? p.fell.name : 'the dark', night: p.fell ? p.fell.night : s.night, runs: p.runs, wins: p.wins };
      s.people.splice(s.people.indexOf(p), 1); s.graves.push(g); s.stats.goodbyes++;
      return ok([{ type: 'grave', gid: g.id, name: g.name }]);
    },
    pack(s) { s.res.fuel += R.pack; s.stats.packs++; return ok([{ type: 'pack', fuel: R.pack }]); },
    // the Lab: grants, a forced outcome for the next run, a result pasted from the real game, a block taken at once
    lab(s, a) {
      if (a.op === 'sup') s.res.sup += a.n | 0;
      else if (a.op === 'fuel') s.res.fuel += a.n | 0;
      else if (a.op === 'speed') s.lab.speed = clamp(+a.v || 1, 0, 600);
      else if (a.op === 'force') s.lab.force = ['win', 'hurt', 'down'].indexOf(a.v) >= 0 ? a.v : null;
      else if (a.op === 'result') { if (!s.run) return err('bad'); s.run.win = !!a.win; s.run.down = !a.win && !!a.down; s.run.t1 = s.t; }
      else if (a.op === 'take') {
        const b = s.blocks[a.bid]; if (!b || b.type === 'hall') return err('bad');
        b.owned = true; b.hp = 0; b.lv = Math.min(TYPES[b.type].max, a.lv | 0); b.job = null; b.stock = 0; b.stockAt = s.t; if (b.type === 'bridge') s.won = true;
      } else if (a.op === 'level') { const p = person(s, a.pid); if (!p) return err('bad'); p.lv = clamp(a.lv | 0, 1, R.maxLv); p.xp = 0; }
      else return err('bad');
      return ok([{ type: 'lab' }]);
    },
  };
  function act(s, a) {
    const f = a && ACT[a.type]; if (!f) return err('bad');
    const r = f(s, a);
    if (r.ok) goals(s, r.ev);
    return r;
  }

  // ---------------------------------------------------------------- save, load, #demo
  function save(s, now) { s.savedAt = now; return JSON.stringify(s); }
  function load(str, now) {
    let s; try { s = JSON.parse(str); } catch (e) { return null; }
    if (!s || s.v !== 1 || !Array.isArray(s.blocks) || s.blocks.length !== N * N || !Array.isArray(s.people) || !s.res || typeof s.t !== 'number') return null;
    const awayMs = clamp(now - (s.savedAt || now), 0, R.offlineMax);
    const before = { sup: s.res.sup, people: s.people.length };
    const ev = tick(s, awayMs, { offline: true });
    let grown = 0; for (const b of s.blocks) if (b.owned && b.type === 'garden') grown += Math.floor(stock(s, b));
    s.savedAt = now;
    return { s, awayMs, ev, grown, before };
  }
  function demo(seed, now) {
    const s = create(seed, now); s.demo = true;
    act(s, { type: 'introDone' });
    const lv = { 13: 2, 17: 2, 11: 1, 7: 1, 18: 1, 8: 0, 16: 1 };                 // ring 1 but one corner, at mixed levels
    for (const id in lv) act(s, { type: 'lab', op: 'take', bid: +id, lv: lv[id] });
    hall(s).lv = 2; s.night = 14; s.res.sup = 380; s.res.fuel = 12; s.goal = 7; s.stats.kills = 41;
    for (let i = 0; i < 3; i++) addPerson(s, 2 + i);
    s.people[0].lv = 4; s.people[1].lv = 3; s.people[2].lv = 3;
    s.people.forEach((p, i) => { p.runs = [6, 4, 3, 1, 0, 0][i] || 0; p.wins = [5, 3, 2, 1, 0, 0][i] || 0; });
    s.people[1].state = 'rest'; s.people[1].until = s.t + 95000;
    const lost = s.people.pop();
    s.graves.push({ id: 'g' + (++s.ids), name: lost.name, lv: 3, trait: lost.trait, look: lost.look, where: s.blocks[6].name, night: 11, runs: 7, wins: 5 });
    for (const b of s.blocks) if (b.owned && TYPES[b.type].rate) { b.stock = TYPES[b.type].cap[Math.max(0, b.lv - 1)] * 0.7; b.stockAt = s.t; }
    s.blocks[6].hp = 1; s.hordeAt = s.t + 3600000;
    return s;
  }

  return { create, demo, tick, act, save, load, rnd, hall, hallLv, sumLv, owned, built, beds, person, blockAt, neighbours, theName, needHall, attackWhy, targets,
    need, power, deathOn, odds, restMs, stock, ammo, ammoCap, shotPay, skipPrice, revivePrice, goalValue, handoff };
});
