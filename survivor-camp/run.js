// Survivor Camp run model (SPEC section 5.3): the simulated run, its odds and the camp-side haul.
// UMD: browser global SC.Run, or require() in node. Identical behaviour to the spec's reference model.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else (root.SC = root.SC || {}).Run = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const K = { D0: 110, SIG: 0.55, NIGHT: 0.6, MSCALE: 20, MED_CALM: 0.6, SW_REST: 0.6, CACHE_P: 0.7, LOSS_HAUL: 0.35, INTEL_G: 3,
    W: { wander: 0.35, horde: 1, gate: 1.6 } };
  const WEAPON = { pistol: { g: 0, acc: 48, kill: 0.85 }, smg: { g: 8, acc: 38, kill: 1.0 }, shotgun: { g: 9, acc: 62, kill: 0.95 }, rifle: { g: 12, acc: 54, kill: 1.1 } };
  const CACHE = [{ scrap: 20, food: 10, meds: 2 }, { scrap: 30, food: 12, meds: 3 }, { scrap: 45, food: 15, meds: 4 }, { scrap: 70, food: 25, meds: 6 }, { scrap: 100, food: 35, meds: 8 }];

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // L: { primary, gearBase, intel, maxHp, sw, medkit, pills, bomb, hurt, skill, rescue: {chance, guaranteed} | null }
  function gear(L) { return L.gearBase + WEAPON[L.primary].g + K.INTEL_G * (L.intel || 0); }

  function simulate(route, L, seed) {
    const R = mulberry32(seed), U = (a, b) => a + (b - a) * R();
    const LN = (s) => Math.exp(s * Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R()) - s * s / 2);
    const ev = [];
    for (let i = 0; i < route.wander; i++) ev.push({ k: 'wander', f: U(0.05, 0.70) });
    for (let i = 0; i < route.hordes; i++) ev.push({ k: 'horde', f: U(0.18, 0.70) });
    ev.push({ k: 'gate', f: U(0.76, 0.90) });
    ev.sort((a, b) => a.f - b.f);
    const caches = Array.from({ length: route.caches }, () => U(0.08, 0.95));
    const sumW = ev.reduce((s, e) => s + K.W[e.k], 0);
    const m = gear(L) - route.req + (L.skill || 0) * 50;
    const scale = K.D0 / sumW * Math.exp(-m / K.MSCALE) * LN(K.NIGHT);
    const maxHp = Math.min(140, L.maxHp);
    let hp = L.hurt ? Math.round(maxHp * 0.6) : maxHp, temp = 0, sw = L.sw;
    let med = L.medkit, pills = L.pills, bomb = L.bomb;
    const used = { medkit: 0, pills: 0, noiseBomb: 0 }, log = [];
    let dmg = 0, swUsed = 0, kills = 0, hordes = 0, dead = null;
    const W = WEAPON[L.primary];
    for (const e of ev) {
      let d = K.W[e.k] * scale * LN(K.SIG);
      if (bomb && e.k !== 'wander' && (e.k === 'gate' || hp + temp < 0.7 * maxHp)) { bomb = 0; used.noiseBomb = 1; d *= 0.55; log.push([e.f, 'bomb']); }
      d = Math.round(d);
      const kHere = e.k === 'wander' ? U(5, 12) : e.k === 'horde' ? (U(10, 17) + hordes) * route.hordeMul * U(0.75, 1) : 3 * U(10, 24) * route.hordeMul * 0.8;
      const ft = Math.min(temp, d); temp -= ft; hp -= d - ft; dmg += d;
      if (hp <= 0) {
        const over = -hp; dmg -= over;
        if (sw > 0) {
          sw--; swUsed++; hp = 1; temp = 0; log.push([e.f, 'secondWind']);
          const rest = Math.round(over * U(0, K.SW_REST));
          if (pills && rest > 0) { pills = 0; used.pills = 1; temp = Math.min(maxHp - hp, 50); log.push([e.f, 'pills', 50]); }
          const t2 = Math.min(temp, rest); temp -= t2; hp -= rest - t2; dmg += rest;
        }
        if (hp <= 0) { dmg += hp; hp = 0; kills += kHere * U(0.3, 0.7) * W.kill; dead = e; log.push([e.f, 'overrun', e.k]); break; }
      }
      kills += kHere * W.kill; if (e.k !== 'wander') hordes++;
      log.push([e.f, e.k, d, Math.round(kHere * W.kill)]);
      temp = Math.max(0, temp - 10.8);                                  // pills decay between events
      if (pills && hp + temp < 0.5 * maxHp) { pills = 0; used.pills = 1; temp = Math.min(maxHp - hp, temp + 50); log.push([e.f, 'pills', 50]); }
      if (med && hp < 0.4 * maxHp && R() < K.MED_CALM) { med = 0; used.medkit = 1; const heal = Math.round((maxHp - hp) * 0.8); hp += heal; temp = Math.min(temp, maxHp - hp); log.push([e.f, 'medkit', heal]); }
    }
    const win = !dead, progress = win ? 1 : dead.f;
    const time = Math.round(win ? route.len * U(0.90, 1.15) : route.len * progress * U(0.95, 1.05));
    kills += (time / 60) * U(3, 6) * W.kill;                           // stragglers on the walk
    let found = 0;
    for (const c of caches) if (c <= progress && R() < K.CACHE_P) { found++; log.push([c, 'cache']); }
    const accuracy = Math.round(Math.min(90, Math.max(15, W.acc + U(-8, 8) + (L.skill || 0) * 40)));
    const shoves = Math.round(kills * U(0.15, 0.30));
    let rescued = false;
    if (win && L.rescue) rescued = L.rescue.guaranteed || R() < L.rescue.chance;   // last draw: earlier numbers never depend on it
    const pace = time / progress;                                      // seconds per full route
    const events = log.sort((a, b) => a[0] - b[0]).map(([f, k, ...rest]) => [Math.round(f * pace), k, ...rest]);
    events.push([time, win ? 'safe_room' : 'overrun_end']);
    return { win, progress: Math.round(progress * 100) / 100, time, kills: Math.round(kills), accuracy, shoves, damageTaken: Math.round(dmg),
      hordes, secondWindUsed: swUsed, used, cachesFound: found, rescued, endedAt: dead ? dead.k : null, events };
  }

  // odds = share of wins over fixed seeds 1..n (stable while the player looks at it)
  function mc(route, L, n = 400) { let w = 0; for (let i = 1; i <= n; i++) if (simulate(route, L, i).win) w++; return w / n; }

  // haul only: what the camp pays for a valid result (BP, batteries, rescue, intel, injury are applied by the engine)
  function haul(route, res, seed, lossPayout = K.LOSS_HAUL, lootMul = 1) {
    const R = mulberry32(seed ^ 0x9e3779b9); const luck = 0.9 + 0.2 * R();
    const win = res.result === 'safe_room';
    const mult = win ? 1 : lossPayout * res.progress;
    const out = { scrap: 0, food: 0, meds: 0, parts: [] };
    for (const k of ['scrap', 'food', 'meds']) out[k] = Math.round(route.haul[k] * luck * mult * lootMul);
    out.parts.push(['haul', out.scrap, out.food, out.meds]);
    const order = ['scrap', 'food', 'scrap', 'meds'];
    for (let i = 0; i < res.cachesFound; i++) { const k = order[i % 4]; const v = Math.round(CACHE[route.danger - 1][k] * lootMul); out[k] += v; out.parts.push(['cache', k, v]); }
    const salvage = Math.floor(res.kills / 2 * lootMul); out.scrap += salvage; out.parts.push(['salvage', salvage]);
    return out;
  }
  return { K, WEAPON, CACHE, mulberry32, gear, simulate, mc, haul };
});
