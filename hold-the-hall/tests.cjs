#!/usr/bin/env node
// Hold the Hall: engine tests. Run: node hold-the-hall/tests.cjs   (add --pace to print the pacing table)
'use strict';
const fs = require('fs'), path = require('path');
const D = require('./data.js'), E = require('./engine.js');
const { SEC, MIN } = D, R = D.RULES;
let pass = 0, fail = 0; const fails = [];
let cur = '';
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(cur + ': ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const test = (name, f) => { cur = name; const f0 = fail; try { f(); } catch (e) { fail++; fails.push(name + ': threw ' + (e && e.stack || e)); } console.log((fail === f0 ? 'PASS ' : 'FAIL ') + name); };
const must = (s, a) => { const r = E.act(s, a); if (!r.ok) throw new Error('act ' + JSON.stringify(a) + ' failed: ' + r.err); return r; };
const town = (seed) => { const s = E.create(seed == null ? 7 : seed, 0); must(s, { type: 'introDone' }); return s; };
const B = (s, bx, by) => E.blockAt(s, bx, by);
const run = (s, bid, pid, force) => { if (force) must(s, { type: 'lab', op: 'force', v: force }); must(s, { type: 'go', bid, pid }); return E.tick(s, R.runMs).find((e) => e.type === 'result'); };
const rested = (s) => { for (const p of s.people) if (p.state === 'rest') { p.state = 'ok'; p.until = 0; p.hurt = false; } };

test('1 a new town: 25 blocks, the hall in the middle, the same seed gives the same town', () => {
  const a = E.create(42, 0), b = E.create(42, 0), c = E.create(43, 0);
  eq(JSON.stringify(a), JSON.stringify(b), 'same seed, same state');
  ok(JSON.stringify(a.blocks) !== JSON.stringify(c.blocks), 'another seed, another town');
  eq([a.blocks.length, a.blocks[12].type, a.people.length, a.res], [25, 'hall', 3, { sup: 20, fuel: 3 }], 'blocks, hall, starters, start resources');
  const count = {}; for (const bl of a.blocks) count[bl.type] = (count[bl.type] || 0) + 1;
  eq(Object.keys(count).sort().map((k) => k + ' ' + count[k]), ['armory 3', 'bridge 1', 'clinic 3', 'garden 5', 'gas 1', 'hall 1', 'home 4', 'tower 4', 'workshop 3'], 'building types');
  eq([B(a, 3, 2).type, B(a, 3, 2).threat, B(a, 3, 2).hp, B(a, 2, 3).type, B(a, 2, 3).threat, B(a, 4, 4).type, B(a, 4, 4).hp], ['home', 6, 1, 'garden', 8, 'bridge', 5], 'the two teaching blocks and the bridge');
  for (let seed = 1; seed <= 40; seed++) {
    const s = E.create(seed, 0), names = s.blocks.map((x) => x.name);
    ok(new Set(names).size === 25, 'place names are unique (seed ' + seed + ')');
    ok(s.blocks.every((x) => x.ring !== 1 || (x.threat >= 6 && x.threat <= 16)) && s.blocks.every((x) => x.ring !== 2 || x.threat >= 24), 'threat grows with the ring');
    ok(s.blocks.filter((x) => x.ring === 1 && x.type === 'home').length === 1, 'one house in the inner ring (seed ' + seed + ')');
    ok(new Set(s.people.map((p) => p.name)).size === 3 && new Set(s.people.map((p) => p.look.jacket)).size === 3, 'three starters with their own names and jackets');
    ok(s.people.every((p) => D.TRAITS[p.trait] && p.lv === 1 && p.state === 'ok'), 'starters are level 1 and ready');
  }
});

test('2 nothing can be attacked before the hall is taken; then the four blocks beside it', () => {
  const s = E.create(7, 0);
  eq(E.targets(s).length, 0, 'no targets during the intro');
  eq(E.act(s, { type: 'go', bid: 13, pid: s.people[0].id }).err, 'bad', 'go is refused');
  eq(E.act(s, { type: 'shoot' }).err, 'bad', 'the wall does not shoot yet');
  must(s, { type: 'introDone' });
  eq([E.hallLv(s), E.owned(s), E.act(s, { type: 'introDone' }).err], [1, 1, 'bad'], 'the hall is ours, once');
  eq(E.targets(s).map((b) => b.id).sort((a, b) => a - b), [7, 11, 13, 17], 'north, west, east and south');
  eq([E.attackWhy(s, s.blocks[6]), E.attackWhy(s, s.blocks[2]), E.attackWhy(s, s.blocks[12])], ['far', 'far', 'bad'], 'corners and the outer ring are too far');
});

test('3 the first two runs always win; a won block joins the town', () => {
  const s = town(), p = s.people[0];
  eq([E.odds(s, p, s.blocks[13]).win, E.odds(s, p, s.blocks[13]).death], [1, 0], 'the first run shows 100 %');
  const r = E.act(s, { type: 'go', bid: 13, pid: p.id });
  ok(r.ok && s.run && p.state === 'out' && s.night === 1, 'out on night 1');
  eq(E.act(s, { type: 'go', bid: 17, pid: s.people[1].id }).err, 'busy', 'one run at a time');
  eq(E.tick(s, R.runMs - 1).filter((e) => e.type === 'result').length, 0, 'not back yet');
  const res = E.tick(s, 1).find((e) => e.type === 'result');
  ok(res && res.win && res.taken && s.blocks[13].owned && s.blocks[13].lv === 0, 'the block is taken, as a ruin');
  eq([res.bonus, res.fuel, res.hpLeft], [44, 1, 0], 'the taking bonus: 20 + 4 x threat, and a fuel');
  eq(s.res.sup, 20 + res.sup + res.bonus, 'supplies paid');
  ok(p.state === 'rest' && p.until === R.runMs + E.restMs(s, p, s.blocks[13], false), 'the runner rests');
  ok(E.targets(s).some((b) => b.id === 8) && E.targets(s).some((b) => b.id === 18), 'the corners beside it can be attacked now');
  eq(E.attackWhy(s, s.blocks[14]), 'hall', 'but the outer ring needs a bigger hall');
  const r2 = run(s, 17, s.people[1].id);
  ok(r2.win && r2.taken, 'the second run wins too');
  ok(E.odds(s, s.people[2], s.blocks[11]).win < 1, 'the third run shows real odds');
});

test('4 odds: bounded, better with power, death only from four people on', () => {
  const s = town(); s.night = 5;
  const p = s.people[0], o = E.odds(s, p, s.blocks[11]);
  ok(o.win >= R.winMin && o.win <= R.winMax && o.death === 0, 'three people: nobody is left behind');
  let last = -1; for (let lv = 1; lv <= 10; lv++) { p.lv = lv; const w = E.odds(s, p, s.blocks[0]).win; ok(w >= last, 'win grows with level'); last = w; }
  p.lv = 1; s.people.push(Object.assign({}, p, { id: 'px', name: 'Extra' }));
  const o4 = E.odds(s, p, s.blocks[11]);
  ok(o4.death > 0 && Math.abs(o4.death - (1 - o4.win) * (1 - o4.rescue)) < 1e-12, 'four people: death = lose x not carried home');
  s.blocks[7].owned = true; s.blocks[7].type = 'armory'; s.blocks[7].lv = 2;
  eq(E.power(s, p) - (R.power0 + R.powerLv + (D.TRAITS[p.trait].power || 0)), 8, 'an armory adds 4 power per level');
  for (let seed = 1; seed <= 30; seed++) {
    const t = town(seed); t.night = 9; let downs = 0;
    for (let i = 0; i < 30; i++) { rested(t); const q = t.people[i % 3], tg = E.targets(t)[0]; if (!tg) break; const x = run(t, tg.id, q.id); if (x.down) downs++; }
    ok(downs === 0, 'no one goes down while three live here (seed ' + seed + ')');
  }
});

test('5 a loss: carried home hurt, or down; revive with supplies or fuel, or a grave', () => {
  const s = town(); s.night = 5;
  const p = s.people[0], b = s.blocks[11];
  const hurt = run(s, b.id, p.id, 'hurt');
  ok(!hurt.win && hurt.hurt && !hurt.down && p.state === 'rest' && p.hurt, 'carried home');
  eq(hurt.restMs, E.restMs(s, p, b, true), 'a hurt rest is three times as long');
  ok(hurt.sup > 0 && hurt.sup < 60 && b.hp === b.hpMax, 'a little loot, the block stands');
  rested(s);
  const down = run(s, b.id, p.id, 'down');
  ok(down.down && p.state === 'down' && p.fell.name === b.name && s.stats.downs === 1, 'down at the block');
  eq(E.act(s, { type: 'go', bid: b.id, pid: p.id }).err, 'notReady', 'a Down person cannot go');
  const pr = E.revivePrice(s, p);
  eq([pr.sup, pr.fuel], [30, 3], 'level 1 revive: 30 supplies or 3 fuel');
  s.res.sup = 10; eq(E.act(s, { type: 'revive', pid: p.id, pay: 'sup' }).data, { need: 20 }, 'short of supplies');
  s.res.sup = 100; must(s, { type: 'revive', pid: p.id, pay: 'sup' });
  ok(p.state === 'rest' && p.until === s.t + R.recoverMs && s.res.sup === 70 && p.revives === 1, 'supplies: recovering for a minute');
  eq(E.revivePrice(s, Object.assign({}, p)).sup, 60, 'the next revive of the same person costs double');
  rested(s);
  run(s, b.id, p.id, 'down'); s.res.fuel = 10; must(s, { type: 'revive', pid: p.id, pay: 'fuel' });
  ok(p.state === 'ok' && s.res.fuel === 7, 'fuel: ready at once');
  run(s, b.id, p.id, 'down');
  const n0 = s.people.length; must(s, { type: 'goodbye', pid: p.id });
  ok(s.people.length === n0 - 1 && s.graves.length === 1 && s.graves[0].name === p.name && s.graves[0].where === b.name, 'goodbye: a grave with the name and the place');
  eq(E.act(s, { type: 'goodbye', pid: p.id }).err, 'bad', 'only once');
  E.tick(s, 0); E.tick(s, R.arriveMs - 1); ok(s.people.length === n0 - 1, 'not at once');
  const nc = E.tick(s, 1).find((e) => e.type === 'newcomer');
  ok(nc && s.people.length === n0, 'a free bed brings someone new after two and a half minutes');
  ok(!s.people.some((q) => q.name === s.graves[0].name), 'a name is never used twice');
});

test('6 restore, upgrade, timers and fuel skips', () => {
  const s = town(); run(s, 13, s.people[0].id);
  const b = s.blocks[13];
  s.res.sup = 0; eq(E.act(s, { type: 'build', bid: 13 }).data, { need: 30 }, 'restoring costs 30');
  s.res.sup = 500; must(s, { type: 'build', bid: 13 });
  ok(b.job && s.res.sup === 470 && b.lv === 0, 'a job runs');
  eq(E.act(s, { type: 'build', bid: 13 }).err, 'busy', 'one job per building');
  E.tick(s, 10 * SEC);
  ok(b.lv === 1 && !b.job, 'restored after 10 s');
  E.tick(s, R.moveInMs); E.tick(s, 1);
  ok(s.people.length === 4 && E.beds(s) === 4, 'someone moves into the new bed');
  eq(E.act(s, { type: 'build', bid: 13 }).err, 'hall', 'level 2 needs a level 2 hall');
  must(s, { type: 'build', bid: 12 });
  ok(s.res.sup === 220 && s.blocks[12].job.t1 - s.t === 10 * MIN, 'the hall: 250 supplies, 10 minutes');
  eq([E.skipPrice(10 * MIN), E.skipPrice(15 * SEC), E.skipPrice(16 * SEC), E.skipPrice(120 * MIN)], [6, 0, 1, 37], 'skip prices');
  s.res.fuel = 3; eq(E.act(s, { type: 'skip', kind: 'job', bid: 12 }).data, { need: 3, fuel: true }, 'short of fuel');
  s.res.fuel = 10; must(s, { type: 'skip', kind: 'job', bid: 12 });
  ok(E.hallLv(s) === 2 && s.res.fuel === 4, 'the hall is level 2 at once');
  ok(E.targets(s).some((x) => x.ring === 2), 'the outer ring opens');
  s.res.sup = 500; must(s, { type: 'build', bid: 13 }); eq(b.job.t1 - s.t, 10 * MIN, 'homes level 2: 10 minutes');
  E.tick(s, 10 * MIN); eq([b.lv, E.act(s, { type: 'build', bid: 13 }).err], [2, 'max'], 'homes stop at level 2');
  const p = s.people[0]; p.state = 'rest'; p.until = s.t + 10 * SEC;
  must(s, { type: 'skip', kind: 'rest', pid: p.id }); ok(p.state === 'ok' && s.res.fuel === 4, 'a short rest skips free');
  eq(E.act(s, { type: 'build', bid: 24 }).err, 'bad', 'nothing to build on a block that is not ours');
});

test('7 gardens grow to their cap, also while away', () => {
  const s = town(); run(s, 13, s.people[0].id); run(s, 17, s.people[1].id);
  s.res.sup = 100; must(s, { type: 'build', bid: 17 }); E.tick(s, 15 * SEC);
  const g = s.blocks[17];
  ok(g.lv === 1 && E.stock(s, g) === 0, 'an empty garden');
  eq(E.act(s, { type: 'collect', bid: 17 }).err, 'empty', 'nothing to collect yet');
  E.tick(s, 5 * MIN); ok(Math.abs(E.stock(s, g) - 30) < 1e-9, '6 a minute');
  const before = s.res.sup; must(s, { type: 'collect', bid: 17 }); eq(s.res.sup - before, 30, 'collected');
  E.tick(s, 60 * MIN); eq(E.stock(s, g), 60, 'capped at 60');
  const str = E.save(s, 1000), l = E.load(str, 1000 + 3 * 60 * MIN);
  ok(l && l.awayMs === 3 * 60 * MIN && E.stock(l.s, l.s.blocks[17]) === 60, 'three hours away: still the cap');
  const l2 = E.load(str, 1000 + 100 * 60 * MIN); eq(l2.awayMs, R.offlineMax, 'time away is capped at 12 hours');
  eq(E.load('{oops', 0), null, 'a broken save loads as nothing');
  eq(E.load(JSON.stringify({ v: 9 }), 0), null, 'so does an unknown version');
});

test('8 the wall: ammo, shots, a watchtower', () => {
  const s = town();
  eq([E.ammo(s), E.ammoCap(s), E.shotPay(s)], [6, 6, 1], 'six shots, one supply each');
  for (let i = 0; i < 6; i++) must(s, { type: 'shoot' });
  eq([E.act(s, { type: 'shoot' }).err, s.res.sup, s.stats.kills], ['ammo', 26 + D.GOALS[0].sup, 6], 'empty after six; the first goal paid');
  E.tick(s, R.ammoMs); ok(Math.abs(E.ammo(s) - 1) < 1e-9, 'one shot back after 8 s');
  E.tick(s, 10 * MIN); eq(E.ammo(s), 6, 'never over the cap');
  must(s, { type: 'lab', op: 'take', bid: 7, lv: 2 }); s.blocks[7].type = 'tower';
  eq([E.ammoCap(s), E.shotPay(s)], [10, 3], 'a level 2 watchtower: +4 ammo, +2 a shot');
});

test('9 hordes come only while someone watches; clearing one pays', () => {
  const s = town();
  eq(E.tick(s, R.hordeFirst - SEC).filter((e) => e.type === 'horde').length, 0, 'not before its time');
  const h = E.tick(s, SEC).find((e) => e.type === 'horde');
  ok(h && s.horde && s.horde.left === R.hordeN, 'a horde of 8');
  for (let i = 0; i < R.hordeN - 1; i++) must(s, { type: 'hordeHit' });
  const sup0 = s.res.sup, fuel0 = s.res.fuel, w = must(s, { type: 'hordeHit' }).ev.find((e) => e.type === 'hordeWon');
  ok(w && !s.horde && s.res.sup - sup0 === R.hordeSup && s.res.fuel - fuel0 === 1 && s.stats.hordes === 1, 'cleared: 30 supplies and a fuel');
  ok(s.hordeAt - s.t >= R.hordeGap[0] && s.hordeAt - s.t < R.hordeGap[1], 'the next one in 3.5 to 5 minutes');
  E.tick(s, s.hordeAt - s.t); ok(s.horde, 'the second horde');
  const gone = E.tick(s, R.hordeMs).find((e) => e.type === 'hordeGone'); ok(gone && !s.horde, 'ignored, it moves on with no penalty');
  const t = town(); const l = E.load(E.save(t, 0), 10 * 60 * MIN);
  ok(!l.s.horde && !l.ev.some((e) => e.type === 'horde'), 'no horde while away');
  const u = town(); must(u, { type: 'go', bid: 13, pid: u.people[0].id }); u.hordeAt = u.t;
  ok(!E.tick(u, SEC).some((e) => e.type === 'horde'), 'and none during a run');
});

test('10 the hall gates the rings and the bridge; taking the bridge wins', () => {
  const s = town(); for (let i = 0; i < 3; i++) must(s, { type: 'shoot' });
  for (const id of [13, 17, 11, 7, 6, 8, 16, 18]) must(s, { type: 'lab', op: 'take', bid: id, lv: 1 });
  eq([E.owned(s), E.built(s)], [9, 8], 'the whole inner ring');
  ok(E.targets(s).length === 0 && E.attackWhy(s, s.blocks[14]) === 'hall' && E.needHall(s.blocks[14]) === 2, 'the outer ring waits for hall 2');
  s.blocks[12].lv = 2; ok(E.targets(s).length === 12, 'hall 2: the twelve outer blocks that touch the town');
  for (const b of s.blocks) if (b.ring === 2 && b.type !== 'bridge') must(s, { type: 'lab', op: 'take', bid: b.id, lv: 0 });
  eq([E.attackWhy(s, s.blocks[24]), E.needHall(s.blocks[24])], ['hall', 3], 'the bridge waits for hall 3');
  s.blocks[12].lv = 3; s.night = 50;
  for (const p of s.people) p.lv = 10;
  let res; for (let i = 0; i < 5; i++) { rested(s); res = run(s, 24, s.people[i % 3].id, 'win'); }
  ok(res.taken && s.won && res.fuel === 5, 'five wins take the bridge');
  eq(D.GOALS[s.goal].k, 'people', 'the chain waits for people');
  for (const b of s.blocks) if (b.type === 'home') b.lv = 2;
  E.tick(s, 30 * MIN); for (let i = 0; i < 12; i++) { E.tick(s, R.arriveMs); E.tick(s, 1); }
  ok(s.people.length >= 6 && s.goal === D.GOALS.length, 'with the beds filled, every goal is done (' + s.goal + ', ' + s.people.length + ' people)');
});

test('11 goals pay in order', () => {
  const s = town();
  eq([s.goal, E.goalValue(s, D.GOALS[0])], [0, 0], 'the first goal');
  for (let i = 0; i < 3; i++) must(s, { type: 'shoot' });
  ok(s.goal === 1 && s.res.sup === 20 + 3 + 20, 'three walkers: +20 supplies');
  const ev = []; must(s, { type: 'go', bid: 13, pid: s.people[0].id }); ev.push(...E.tick(s, R.runMs));
  ok(ev.some((e) => e.type === 'goal' && e.idx === 1 && e.fuel === 1) && s.goal === 2, 'a second block: +1 fuel');
});

test('12 save and load keep everything; the same actions give the same town', () => {
  const play = (seed) => {
    const s = town(seed); let n = 0;
    for (let i = 0; i < 400; i++) {
      E.tick(s, 3 * SEC);
      const x = E.rnd(s);
      if (x < 0.3) E.act(s, { type: 'shoot' });
      else if (x < 0.6 && !s.run) { const tg = E.targets(s), p = s.people.find((q) => q.state === 'ok'); if (tg.length && p) { E.act(s, { type: 'go', bid: tg[n++ % tg.length].id, pid: p.id }); } }
      else if (x < 0.8) for (const b of s.blocks) if (b.owned) E.act(s, { type: 'build', bid: b.id });
      else for (const p of s.people) if (p.state === 'down') E.act(s, { type: 'revive', pid: p.id, pay: 'sup' });
    }
    return s;
  };
  const a = play(5), b = play(5);
  eq(JSON.stringify(a), JSON.stringify(b), 'deterministic');
  const str = E.save(a, 123), l = E.load(str, 123);
  eq(JSON.stringify(l.s), str, 'a round trip changes nothing');
  ok(a.run === null || typeof a.run.handoff === 'object', 'a pending run carries its handoff');
});

test('13 the handoff for Two Thumbs Left', () => {
  const s = town(); must(s, { type: 'go', bid: 13, pid: s.people[0].id });
  const h = s.run.handoff;
  eq([h.kind, h.game, h.night, h.destination.name, h.destination.threat, h.runner.name, h.odds.home], ['hold-the-hall.handoff', 'two-thumbs-left', 1, s.blocks[13].name, 6, s.people[0].name, 1], 'who goes where');
  ok(h.director.zombieCap === 36 && h.director.lengthS === 210 && h.player.maxHp >= 100 && h.startRoom.primary === 'pistol', 'the block sets the director, the town sets the runner');
  must(s, { type: 'lab', op: 'result', win: false });
  const r = E.tick(s, 0).find((e) => e.type === 'result'); ok(r && !r.win && !r.down, 'a result from the real game resolves the run');
});

test('14 random play never breaks the state or gets stuck', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = town(seed); let bad = null;
    for (let i = 0; i < 1500 && !bad; i++) {
      E.tick(s, Math.floor(E.rnd(s) * 20 * SEC));
      const x = E.rnd(s), tg = E.targets(s);
      if (x < 0.25) E.act(s, { type: 'shoot' });
      else if (x < 0.5) { const p = s.people[Math.floor(E.rnd(s) * s.people.length)]; if (tg.length && p) E.act(s, { type: 'go', bid: tg[Math.floor(E.rnd(s) * tg.length)].id, pid: p.id }); }
      else if (x < 0.65) E.act(s, { type: 'build', bid: Math.floor(E.rnd(s) * 25) });
      else if (x < 0.75) E.act(s, { type: 'collect', bid: Math.floor(E.rnd(s) * 25) });
      else if (x < 0.85) { const p = s.people.find((q) => q.state === 'down'); if (p) E.act(s, { type: E.rnd(s) < 0.3 ? 'goodbye' : 'revive', pid: p.id, pay: E.rnd(s) < 0.5 ? 'sup' : 'fuel' }); }
      else if (x < 0.9) E.act(s, { type: 'skip', kind: E.rnd(s) < 0.5 ? 'job' : 'rest', bid: Math.floor(E.rnd(s) * 25), pid: 'p' + Math.floor(E.rnd(s) * 9) });
      else if (x < 0.95 && s.horde) E.act(s, { type: 'hordeHit' });
      else E.act(s, { type: 'runSkip' });
      if (!(s.res.sup >= 0 && s.res.fuel >= 0) || !isFinite(s.res.sup) || !isFinite(E.ammo(s))) bad = 'resources ' + JSON.stringify(s.res);
      if (s.people.length > Math.max(3, E.beds(s))) bad = 'more people than beds';
      if (s.people.some((p) => p.lv < 1 || p.lv > 10 || !isFinite(p.xp))) bad = 'a level out of range';
      if (s.blocks.some((b) => b.hp < 0 || b.lv > D.TYPES[b.type].max || (b.owned && b.hp > 0 && b.type !== 'hall'))) bad = 'a block out of range';
      if (JSON.stringify(s).indexOf('null,"t1"') >= 0 || /NaN|Infinity/.test(JSON.stringify(s))) bad = 'not JSON-safe';
    }
    ok(!bad, 'seed ' + seed + ': ' + bad);
    // never stuck: with everyone Down and nothing in hand, the wall still earns supplies, and a revive is reachable
    for (const p of s.people) { p.state = 'down'; p.fell = { name: 'x', night: 1 }; }
    s.res.sup = 0; s.res.fuel = 0; s.run = null;
    let out = false;
    for (let i = 0; i < 4000 && !out; i++) { E.tick(s, R.ammoMs); E.act(s, { type: 'shoot' }); for (const b of s.blocks) E.act(s, { type: 'collect', bid: b.id }); const p = s.people[0]; if (!p || E.act(s, { type: 'revive', pid: p.id, pay: 'sup' }).ok) out = true; }
    ok(out, 'seed ' + seed + ': the wall pays for a revive in the end');
  }
});

test('15 engine source: no DOM, clock or unseeded randomness', () => {
  const src = fs.readFileSync(path.join(__dirname, 'engine.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const word of ['Math.random', 'Date.now', 'new Date', 'document', 'window', 'localStorage', 'performance', 'setTimeout']) ok(src.indexOf(word) < 0, 'no ' + word);
  const d = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8');
  ok(!/\b(he|she|him|her|his|hers|they|them|their)\b/i.test(Object.values(D.TRAITS).map((t) => t.line + ' ' + t.fx).join(' ') + D.GOALS.map((g) => g.text).join(' ')), 'no pronouns for people in the texts');
  ok(d.length > 0 && E.demo(1, 0).demo === true && E.demo(1, 0).graves.length === 1, 'the #demo town has a grave');
});

// ---------------------------------------------------------------- pacing: a player who never stops tapping
function pace(seed, hours) {
  const s = town(seed), marks = {}, mark = (k) => { if (marks[k] == null) marks[k] = s.t / MIN; };
  const end = hours * 60 * MIN; let downs = 0, runs = 0;
  while (s.t < end && !s.won) {
    for (const e of E.tick(s, SEC)) { if (e.type === 'result') { runs++; if (e.down) downs++; } }
    while (E.ammo(s) >= 1) E.act(s, { type: 'shoot' });
    while (s.horde) E.act(s, { type: 'hordeHit' });
    for (const b of s.blocks) if (b.owned && D.TYPES[b.type].rate && E.stock(s, b) >= 10) E.act(s, { type: 'collect', bid: b.id });
    for (const p of s.people) if (p.state === 'down') { if (!E.act(s, { type: 'revive', pid: p.id, pay: 'sup' }).ok) E.act(s, { type: 'revive', pid: p.id, pay: 'fuel' }); }
    for (const b of s.blocks) if (b.owned && b.lv === 0) E.act(s, { type: 'build', bid: b.id });
    if (!E.targets(s).length || s.res.sup > 600) E.act(s, { type: 'build', bid: 12 });
    for (const b of s.blocks) if (b.owned && b.lv >= 1 && b.type !== 'hall' && s.res.sup > 2 * (D.TYPES[b.type].cost[b.lv] || 1e9)) E.act(s, { type: 'build', bid: b.id });
    if (!s.run) {
      const ready = s.people.filter((p) => p.state === 'ok').sort((a, b) => E.power(s, b) - E.power(s, a))[0];
      const tg = E.targets(s).sort((a, b) => a.threat - b.threat)[0];
      if (ready && tg && (E.odds(s, ready, tg).win >= 0.3 || s.people.every((p) => p.state !== 'rest'))) E.act(s, { type: 'go', bid: tg.id, pid: ready.id });
    }
    if (E.owned(s) >= 2) mark('first block'); if (E.owned(s) >= 9) mark('inner ring'); if (E.hallLv(s) >= 2) mark('hall 2');
    if (E.owned(s) >= 15) mark('15 blocks'); if (E.hallLv(s) >= 3) mark('hall 3'); if (s.won) mark('won');
  }
  return { marks, downs, runs, people: s.people.length, night: s.night, sup: s.res.sup, fuel: s.res.fuel, graves: s.graves.length };
}
test('16 pacing: an always-tapping player takes the inner ring in minutes and the town in hours', () => {
  const rows = []; for (let seed = 1; seed <= 12; seed++) rows.push(pace(seed, 30));
  const med = (k) => { const v = rows.map((r) => (r.marks[k] == null ? Infinity : r.marks[k])).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const m = { first: med('first block'), ring: med('inner ring'), hall2: med('hall 2'), b15: med('15 blocks'), hall3: med('hall 3'), won: med('won') };
  if (process.argv.includes('--pace')) {
    console.log('  medians (minutes): ' + JSON.stringify(m));
    for (const r of rows) console.log('  ' + JSON.stringify(r));
  }
  ok(m.first < 1, 'the first block inside a minute (' + m.first + ')');
  ok(m.ring > 7 && m.ring < 30, 'the inner ring in 7 to 30 minutes of non-stop play (' + m.ring + ')');
  ok(m.won > 2 * 60 && m.won < 12 * 60, 'the whole town in 2 to 12 hours of non-stop play (' + m.won + ')');
  ok(rows.every((r) => r.marks.won != null), 'every seed can be won');
  const downs = rows.reduce((a, r) => a + r.downs, 0) / rows.length;
  ok(downs >= 2 && downs <= 40, 'people go down now and then: ' + downs.toFixed(1) + ' a town');
});

console.log('\n' + pass + ' checks passed, ' + fail + ' failed');
if (fail) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
