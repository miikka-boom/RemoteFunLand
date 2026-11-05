/* Bellhaven run model (SPEC 6.3.2, exact): the simulated night for the prototype's Play button. Pure, seeded.
 *
 * Classic script with the shared UMD header: BH.Run in the browser, module.exports in node.
 *
 *   Run.simulate(dest, L, seed) -> { win, progress, time, kills, accuracy, shoves, damageTaken, endHp, maxHp, hordes,
 *                                    secondWindUsed, used: { medkit, pills, noiseBomb }, fellAt, log }
 *     dest: { T: threat, W, H, len: lengthS, hordeMul }   (hordeMul x 1.15 for a Loud runner: the caller applies it)
 *     L:    { P: power, maxHp, startHp, sw: second winds, medkit, pills, bomb (0/1), heal: medkit share, pillsTemp,
 *             weapon, shoveMul: 1 + 0.03L for a Brawler else 1, accAdd: 6 if Steady + L if Marksman }
 *     fellAt: 'streets' | 'hordes' | 'gate' | null.  log: [[f, kind, value?, kills?], ...] in model order, f = 0-1.
 *   Run.mc(dest, L, n = 400) -> { home, wins, n, refs: { dmgP10, killsP90, shovesP90 }, falls: { streets, hordes, gate } }
 *     the shown odds: simulate(dest, L, i * 7919) for i = 1..n (through stats()); falls are counts; dmgP10 is -1 with
 *     no reference wins (so Ghost cannot trigger). Identical inputs give identical outputs: cache freely.
 *   Run.stats(dest, L, seed, out) -> out { win: 0|1, fell: 0 streets | 1 hordes | 2 gate | -1, damageTaken, kills, shoves }
 *     the allocation-free twin of simulate() that mc() uses: the same draws and sums in the same order, no log.
 *   Run.winOnly(dest, L, seed) -> 0 | 1   the lean twin of simulate(): the same draws in the same order up to the
 *     outcome (asserted equal by tests.cjs); Run.homeOdds(dest, L, n = 400) -> wins / n with it (about 3x faster).
 *   Run.events(r, pillsTemp) -> the result's events [[t, kind, value?], ...] with t = round(f x time) (SPEC 6.9):
 *     kinds streets, horde, gate (value: damage), noiseBomb, pills (value: pillsTemp), medkit (value: heal),
 *     secondWind, overrun (value: where), then safe_room | overrun_end at the run's time.
 *   Run.toResult(r, { runId, seed, source, pillsTemp }) -> the 6.9 result object, keys in the spec's order.
 *   Run.cityRolls(seed) -> { luck, spare, stretcher }   SPEC 6.5: mulberry32((seed ^ 0x5bd1e995) >>> 0), in this order.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Run = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const K = { D0: 120, MS: 18, SIG: 0.5, NIGHT: 0.7, W: { wander: 0.3, horde: 1, gate: 1.6 }, TEMP_DECAY: 10, SW_CARRY: 0.5 };
  const ACC = { pistol: 48, smg: 38, shotgun: 62, rifle: 54 };
  const FELL = { wander: 'streets', horde: 'hordes', gate: 'gate' };
  const SEED_STEP = 7919, MC_N = 400;

  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function simulate(dest, L, seed) {
    const R = mulberry32(seed), U = (a, b) => a + (b - a) * R();
    const LN = (s) => Math.exp(s * Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R()) - s * s / 2);
    const ev = [];
    for (let i = 0; i < dest.W; i++) ev.push({ k: 'wander', f: U(0.05, 0.70) });
    for (let i = 0; i < dest.H; i++) ev.push({ k: 'horde', f: U(0.20, 0.72) });
    ev.push({ k: 'gate', f: U(0.78, 0.92) });
    ev.sort((a, b) => a.f - b.f);
    const sumW = ev.reduce((s, e) => s + K.W[e.k], 0);
    const m = L.P - dest.T;
    const scale = K.D0 / sumW * Math.exp(-m / K.MS) * LN(K.NIGHT);
    const maxHp = L.maxHp || 100;
    let hp = Math.min(maxHp, L.startHp || maxHp), temp = 0, sw = L.sw == null ? 1 : L.sw,
        med = L.medkit | 0, pills = L.pills | 0, bomb = L.bomb | 0;
    const used = { medkit: 0, pills: 0, noiseBomb: 0 }, log = [];
    let dmg = 0, swUsed = 0, kills = 0, hordes = 0, dead = null;
    for (const e of ev) {
      let d = K.W[e.k] * scale * LN(K.SIG);
      if (bomb && e.k !== 'wander' && (e.k === 'gate' || hp + temp < 0.7 * maxHp)) { bomb = 0; used.noiseBomb = 1; d *= 0.5; log.push([e.f, 'bomb']); }
      d = Math.round(d);
      const kHere = e.k === 'wander' ? U(5, 12) : e.k === 'horde' ? (U(10, 17) + hordes) * (dest.hordeMul || 1)
                  : 3 * U(10, 24) * (dest.hordeMul || 1) * 0.8;
      const ft = Math.min(temp, d); temp -= ft; hp -= d - ft; dmg += d;
      if (hp <= 0) {
        const over = -hp; dmg -= over; let rest = over, swHere = 0;   // dmg counts the damage down to 0 HP
        while (hp <= 0 && sw > 0) {
          sw--; swUsed++; swHere++; hp = 1; temp = 0; log.push([e.f, 'secondWind']);
          rest = Math.round(rest * U(0, K.SW_CARRY));
          if (pills && rest > 0) { pills = 0; used.pills = 1; temp = Math.min(maxHp - hp, L.pillsTemp || 50); log.push([e.f, 'pills']); }
          const t2 = Math.min(temp, rest); temp -= t2; hp -= rest - t2; dmg += rest;
        }
        if (hp <= 0) { if (swHere) dmg += hp; hp = 0; kills += kHere * U(0.3, 0.7); dead = e; log.push([e.f, 'overrun', e.k]); break; }   // without a second wind the overkill is already out
      }
      kills += kHere; if (e.k !== 'wander') hordes++;
      log.push([e.f, e.k, d, Math.round(kHere)]);
      temp = Math.max(0, temp - K.TEMP_DECAY);
      if (e.k !== 'gate') {   // the gate is always the last fight: nothing is used (or charged) after it
        if (pills && hp + temp < 0.5 * maxHp) { pills = 0; used.pills = 1; temp = Math.min(maxHp - hp, temp + (L.pillsTemp || 50)); log.push([e.f, 'pills']); }
        if (med && hp < 0.4 * maxHp) { med = 0; used.medkit = 1; const heal = Math.round((maxHp - hp) * (L.heal || 0.8)); hp += heal; temp = Math.min(temp, maxHp - hp); log.push([e.f, 'medkit', heal]); }
      }
    }
    const win = !dead, progress = win ? 1 : dead.f;
    const time = Math.round(win ? dest.len * U(0.9, 1.15) : dest.len * progress * U(0.95, 1.05));
    kills += (time / 60) * U(3, 6); kills = Math.round(kills);
    const accuracy = Math.max(15, Math.min(90, Math.round(ACC[L.weapon || 'pistol'] + U(-8, 8) + (L.accAdd || 0))));
    const shoves = Math.round(kills * U(0.15, 0.30) * (L.shoveMul || 1));
    return { win, progress: Math.round(progress * 100) / 100, time, kills, accuracy, shoves, damageTaken: Math.round(dmg),
             endHp: win ? Math.max(1, hp) : 0, maxHp, hordes, secondWindUsed: swUsed, used,
             fellAt: dead ? FELL[dead.k] : null, log };
  }

  // The allocation-free twin of simulate() for the odds: every draw in the same order, every sum in the same order, no
  // log. Fills out = { win: 0|1, fell: 0 streets | 1 hordes | 2 gate | -1, damageTaken, kills, shoves } (the values
  // simulate() returns; asserted equal by tests.cjs over 10,000 random runs). About twice as fast as simulate().
  const SF = new Float64Array(16), SK = new Int8Array(16);
  function stats(dest, L, seed, out) {
    let a = seed;
    const R = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const U = (lo, hi) => lo + (hi - lo) * R();
    const LN = (s) => Math.exp(s * Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R()) - s * s / 2);
    let n = 0;
    for (let i = 0; i < dest.W; i++) { SF[n] = U(0.05, 0.70); SK[n++] = 0; }
    for (let i = 0; i < dest.H; i++) { SF[n] = U(0.20, 0.72); SK[n++] = 1; }
    SF[n] = U(0.78, 0.92); SK[n++] = 2;
    for (let i = 1; i < n; i++) { const f = SF[i], k = SK[i]; let j = i - 1; while (j >= 0 && SF[j] > f) { SF[j + 1] = SF[j]; SK[j + 1] = SK[j]; j--; } SF[j + 1] = f; SK[j + 1] = k; }
    let sumW = 0; for (let i = 0; i < n; i++) sumW = sumW + WK[SK[i]];
    const m = L.P - dest.T, hm = dest.hordeMul || 1;
    const scale = K.D0 / sumW * Math.exp(-m / K.MS) * LN(K.NIGHT);
    const maxHp = L.maxHp || 100, pT = L.pillsTemp || 50, heal0 = L.heal || 0.8;
    let hp = Math.min(maxHp, L.startHp || maxHp), temp = 0, sw = L.sw == null ? 1 : L.sw, med = L.medkit | 0, pills = L.pills | 0, bomb = L.bomb | 0;
    let dmg = 0, kills = 0, hordes = 0, dead = -1, deadF = 0;
    for (let i = 0; i < n; i++) {
      const k = SK[i];
      let d = WK[k] * scale * LN(K.SIG);
      if (bomb && k !== 0 && (k === 2 || hp + temp < 0.7 * maxHp)) { bomb = 0; d *= 0.5; }
      d = Math.round(d);
      const kHere = k === 0 ? U(5, 12) : k === 1 ? (U(10, 17) + hordes) * hm : 3 * U(10, 24) * hm * 0.8;
      const ft = Math.min(temp, d); temp -= ft; hp -= d - ft; dmg += d;
      if (hp <= 0) {
        const over = -hp; dmg -= over; let rest = over, swHere = 0;
        while (hp <= 0 && sw > 0) {
          sw--; swHere++; hp = 1; temp = 0;
          rest = Math.round(rest * U(0, K.SW_CARRY));
          if (pills && rest > 0) { pills = 0; temp = Math.min(maxHp - hp, pT); }
          const t2 = Math.min(temp, rest); temp -= t2; hp -= rest - t2; dmg += rest;
        }
        if (hp <= 0) { if (swHere) dmg += hp; hp = 0; kills += kHere * U(0.3, 0.7); dead = k; deadF = SF[i]; break; }
      }
      kills += kHere; if (k !== 0) hordes++;
      temp = Math.max(0, temp - K.TEMP_DECAY);
      if (k !== 2) {
        if (pills && hp + temp < 0.5 * maxHp) { pills = 0; temp = Math.min(maxHp - hp, temp + pT); }
        if (med && hp < 0.4 * maxHp) { med = 0; const heal = Math.round((maxHp - hp) * heal0); hp += heal; temp = Math.min(temp, maxHp - hp); }
      }
    }
    const win = dead < 0;
    const time = Math.round(win ? dest.len * U(0.9, 1.15) : dest.len * deadF * U(0.95, 1.05));
    kills += (time / 60) * U(3, 6); kills = Math.round(kills);
    R();                                                         // accuracy's draw
    out.win = win ? 1 : 0; out.fell = dead; out.damageTaken = Math.round(dmg); out.kills = kills;
    out.shoves = Math.round(kills * U(0.15, 0.30) * (L.shoveMul || 1));
    return out;
  }

  // The shown odds: n fixed seeds, so a reload never changes them. Also the nickname refs and where the falls happen.
  const FELL_K = ['streets', 'hordes', 'gate'];
  function mc(dest, L, n) {
    n = n || MC_N;
    let wins = 0; const dm = [], ki = new Float64Array(n), sh = new Float64Array(n), falls = { streets: 0, hordes: 0, gate: 0 }, o = {};
    for (let i = 1; i <= n; i++) {
      stats(dest, L, i * SEED_STEP, o);
      if (o.win) { wins++; dm.push(o.damageTaken); } else falls[FELL_K[o.fell]]++;
      ki[i - 1] = o.kills; sh[i - 1] = o.shoves;
    }
    dm.sort((x, y) => x - y); ki.sort(); sh.sort();               // typed arrays sort numerically
    const refs = { dmgP10: dm.length ? dm[Math.floor(0.1 * dm.length)] : -1,
                   killsP90: ki[Math.min(n - 1, Math.floor(0.9 * n))],
                   shovesP90: sh[Math.min(n - 1, Math.floor(0.9 * n))] };
    return { home: wins / n, wins, n, refs, falls };
  }

  // Lean twin of simulate(): the same draws in the same order up to the outcome (from the economy reference).
  const EVF = new Float64Array(16), EVK = new Int8Array(16), WK = [K.W.wander, K.W.horde, K.W.gate];
  function winOnly(dest, L, seed) {
    let a = seed;
    const R = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const LN = (s) => Math.exp(s * Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R()) - s * s / 2);
    let n = 0;
    for (let i = 0; i < dest.W; i++) { EVF[n] = 0.05 + (0.70 - 0.05) * R(); EVK[n++] = 0; }
    for (let i = 0; i < dest.H; i++) { EVF[n] = 0.20 + (0.72 - 0.20) * R(); EVK[n++] = 1; }
    EVF[n] = 0.78 + (0.92 - 0.78) * R(); EVK[n++] = 2;
    for (let i = 1; i < n; i++) { const f = EVF[i], k = EVK[i]; let j = i - 1; while (j >= 0 && EVF[j] > f) { EVF[j + 1] = EVF[j]; EVK[j + 1] = EVK[j]; j--; } EVF[j + 1] = f; EVK[j + 1] = k; }
    let sumW = 0; for (let i = 0; i < n; i++) sumW = sumW + WK[EVK[i]];
    const m = L.P - dest.T;
    const scale = K.D0 / sumW * Math.exp(-m / K.MS) * LN(K.NIGHT);
    const maxHp = L.maxHp || 100, pT = L.pillsTemp || 50, heal0 = L.heal || 0.8;
    let hp = Math.min(maxHp, L.startHp || maxHp), temp = 0, sw = L.sw == null ? 1 : L.sw, med = L.medkit | 0, pills = L.pills | 0, bomb = L.bomb | 0;
    for (let i = 0; i < n; i++) {
      const k = EVK[i];
      let d = WK[k] * scale * LN(K.SIG);
      if (bomb && k !== 0 && (k === 2 || hp + temp < 0.7 * maxHp)) { bomb = 0; d *= 0.5; }
      d = Math.round(d);
      R();                                                       // kHere's draw
      const ft = Math.min(temp, d); temp -= ft; hp -= d - ft;
      if (hp <= 0) {
        let rest = -hp;
        while (hp <= 0 && sw > 0) {
          sw--; hp = 1; temp = 0;
          rest = Math.round(rest * (0 + (K.SW_CARRY - 0) * R()));
          if (pills && rest > 0) { pills = 0; temp = Math.min(maxHp - hp, pT); }
          const t2 = Math.min(temp, rest); temp -= t2; hp -= rest - t2;
        }
        if (hp <= 0) return 0;
      }
      temp = Math.max(0, temp - K.TEMP_DECAY);
      if (k !== 2) {
        if (pills && hp + temp < 0.5 * maxHp) { pills = 0; temp = Math.min(maxHp - hp, temp + pT); }
        if (med && hp < 0.4 * maxHp) { med = 0; const heal = Math.round((maxHp - hp) * heal0); hp += heal; temp = Math.min(temp, maxHp - hp); }
      }
    }
    return 1;
  }
  function homeOdds(dest, L, n) { n = n || MC_N; let w = 0; for (let i = 1; i <= n; i++) w += winOnly(dest, L, i * SEED_STEP); return w / n; }

  // SPEC 6.9: the engine converts log fractions to seconds for the result's events.
  const KIND = { wander: 'streets', horde: 'horde', gate: 'gate', bomb: 'noiseBomb', pills: 'pills', medkit: 'medkit', secondWind: 'secondWind', overrun: 'overrun' };
  function events(r, pillsTemp) {
    const out = [];
    for (const e of r.log) {
      const t = Math.round(e[0] * r.time), k = KIND[e[1]];
      if (k === 'streets' || k === 'horde' || k === 'gate' || k === 'medkit') out.push([t, k, e[2]]);
      else if (k === 'pills') out.push([t, k, pillsTemp || 50]);
      else if (k === 'overrun') out.push([t, k, FELL[e[2]]]);
      else out.push([t, k]);
    }
    out.push([r.time, r.win ? 'safe_room' : 'overrun_end']);
    return out;
  }
  function toResult(r, meta) {
    meta = meta || {};
    return { v: 1, kind: 'bellhaven.result', runId: meta.runId || null, seed: meta.seed == null ? null : meta.seed, source: meta.source || 'sim',
      result: r.win ? 'safe_room' : 'overrun', fellAt: r.fellAt, progress: r.progress, time: r.time, kills: r.kills, accuracy: r.accuracy,
      shoves: r.shoves, damageTaken: r.damageTaken, endHp: r.endHp, hordes: r.hordes, secondWindUsed: r.secondWindUsed,
      used: { medkit: r.used.medkit, pills: r.used.pills, noiseBomb: r.used.noiseBomb }, events: events(r, meta.pillsTemp) };
  }
  function cityRolls(seed) {
    const R = mulberry32((seed ^ 0x5bd1e995) >>> 0), U = (a, b) => a + (b - a) * R();
    const luck = U(0.9, 1.1), spare = R(), stretcher = R();     // drawn in this order even when not needed
    return { luck, spare, stretcher };
  }

  return { K, ACC, FELL, SEED_STEP, MC_N, mulberry32, simulate, stats, mc, winOnly, homeOdds, events, toResult, cityRolls };
});
