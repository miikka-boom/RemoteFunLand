/* Bellhaven engine: all city rules and state (SPEC sections 2-7, 9, 11). Pure: no DOM, no clock reads, no unseeded
 * random numbers (tests.cjs greps for them). Time and randomness are injected: the UI passes the wall clock as realNow
 * (integer ms) and frame deltas; every random draw comes from state.rng (mulberry32 stepping, saved) or from a seed
 * stored in the state (person seeds, run seeds, the city rolls). Same seed + same actions -> byte-identical serialize().
 * Classic script: BH.Engine in the browser after data.js, names.js and run.js; module.exports in node (it requires
 * them from its own folder). The engine never touches storage: the UI saves serialize() in try/catch (key
 * 'bellhaven.v1'), copies an unreadable save to 'bellhaven.v1.bad' on status 'corrupt-reset' (load returns it as
 * `bad`), and never overwrites a 'future-version' save. A demo state (state.demo true) is never saved.
 *
 * ==================================================================================================== FUNCTIONS
 *   create({ realNow, tzOffsetMin, seed })   -> state  (3.1 start layout, 2 start amounts, the two starters)
 *            tzOffsetMin = minutes east of UTC (the negated getTimezoneOffset()); seed = uint32 save seed
 *   load(raw | null, realNow, opts?)          -> { state, status: 'new'|'ok'|'migrated'|'corrupt-reset'|'future-version',
 *            notes[], bad? }   opts { tzOffsetMin, seed } for a new state. load settles the state-based rules at the
 *            saved time (a no-op for a clean save) but never credits offline time: call resume(state, realNow) next
 *            (it builds the welcome-back card).
 *   serialize(state) -> string    migrate(obj) -> obj    sanitize(obj, notes?) -> state (drops unknown keys, clamps
 *            numbers, levels <= Tower, repairs ids, overlaps and dangling references; notes[] says what it fixed)
 *   tick(state, realDeltaMs, realNow)         -> events[]  one frame: advance(min(d, 1000) x lab.timeScale) at
 *            source 'frame', d = realNow - state.realLast (integer ms from the wall clock, so frames never drift;
 *            realDeltaMs only when realNow is missing; an act() between frames stamps realLast too, so those few ms
 *            are simply not credited). Frozen while a simulated run is pending. A gap over 5 s is credited through
 *            resume() instead (the events then start with { type: 'offline', ms, welcome }).
 *   resume(state, realNow)                    -> { creditedMs, rollback, events, welcome | null }
 *            credits min(gap, 7 days) at 1x when the gap is over 5 s; a clock that went backwards credits 0
 *            (rollback true) and resets realLast; welcome when the credit is 2 min or more (5.5):
 *            { ms, title: 'WHILE YOU WERE AWAY · 3 h 12 min', rows: [{ kind: 'down'|'expired'|'job'|'bubbles'|'people'|
 *            'inn', text, personId?, graveId?, buildingId?, action?: 'decide' }] (6 at most, most important first), more }
 *   advance(state, ms, ctx)                   -> events[]  event-stepped; ctx { source: 'frame'|'offline'|'run'|'dev' }.
 *            advance(8 h) equals 480 x advance(1 min) byte for byte (integer ms everywhere, closed-form bubbles).
 *   act(state, action, realNow)               -> { ok, err?, events[], data? }  the only way the UI changes state.
 *            Sets state.realLast = realNow first; a failed action changes nothing else. After a successful action
 *            the engine settles state-based rules at the current time (goals, the stranger, the drifter, death unlock).
 *   view(state)                               -> View (derived, read-only; see below). Cheap enough for every frame.
 *   goal(state)                               -> { step, key, text, reward, eta, progress, side, target, done }
 *   info(state, buildingId)                   -> { id, type, title, rows: [{ label, from, to, run }], next, job, opens }
 *            the building sheet (8.4): before -> after rows, RUN-tagged run effects, the Tower's next opens
 *   derived(state, personId, destId)          -> the 4.6 values for this person there (card and handoff), plus
 *            { power, rescue, restMul, weapon, shoveMul, accAdd, hordeMul, roleLine, ttlLine }
 *   price.skip(sec, state?) -> sparks    price.revive(state, personId) -> { cans, sparks, n, stranger }
 *   price.invite(state) -> cans          price.kit(destId) -> { medkit, pills, bomb }
 *   autoKit(state, destId)                    -> { medkit, pills, bomb, total }  (packed in order while it fits)
 *   canPlace(state, kind, gx, gy, ignoreId?)  -> { ok, reason: 'outside'|'gate'|'occupied'|'bad'|null }
 *            kind: a building type (footprint 3 x 3 for the Tower, else 2 x 2), or 'grave' | 'decor' | 'rubble' (1 x 1)
 *   suggestSpot(state, type, nearGx, nearGy)  -> { gx, gy } | null  the valid origin whose footprint centre is nearest
 *            the point (nearGx, nearGy) in grid units (pass the ground point under the clear view's centre; to aim at an
 *            origin, pass origin + w / 2, e.g. the onboarding Cannery: DATA.START.firstSpot + 1 = (14, 14))
 *   graveSpot(state, personId)                -> { gx, gy } | null  6.7 default spot
 *   kpis(state)                               -> telemetry summary (Lab, sim-bot): counters, shares, calibration,
 *            the section-10 targets this save can be judged on
 *   demo({ realNow, tzOffsetMin })            -> a Tower-4 city like the mock for #demo (state.demo true: never save it)
 *   towerOpens(lv) -> [{ kind, id?, type?, text }]   what Tower level lv opens (3.4.1, 3.7)
 *   cost(state, type, lv) -> { res, n }   jobMs(state, type, lv) -> ms   caps(state) -> { bricks, cans }
 *   rates(state) -> { bricks, cans } per hour   cranes(state) -> { total, free }   beds(state)   bubble(state, id)
 *   fmt.compact(n, narrow) · fmt.num(n) · fmt.dur(sec) · fmt.clock(sec) · fmt.pct(x, 'death'?) · fmt.hoursLeft(ms) ·
 *   fmt.iso(ms)
 *
 *
 *   ---------------------------------------------------------------------------------------- people and runs (4, 6, 7)
 *   odds(state, destId, personId, kit?, { rested?, cachedOnly? }?) -> { key, destId, personId, kit, home, death, rescue,
 *            power, margin, startHp, maxHp, falls { streets, hordes, gate } (counts of 400), refs { dmgP10, killsP90,
 *            shovesP90 }, n, wins, fallsHint ('Most falls happen at the gate.' | 'No falls in 400 tries.'), lever { item,
 *            delta, text: 'A noise bomb adds +6%.' } | null (only from kit odds already computed), hint (fallsHint + lever),
 *            safe: 'home' (the Allotments) | 'third' (before the third present person) | null, homeText 'HOME 98%',
 *            deathText ('DEATH 1.2%' | 'DEATH 0% · close to home' | 'DEATH 0% · nobody dies before your third person'),
 *            deathRed (> 5 %), fallCost { cans, sparks, n, text: 'If Down: revive 1,300 cans or 28 ✦' } | null (R15) }
 *            The 400-seed model (Run.mc), about 0.5 ms uncached in node, cached in an LRU of 300 shared by every state.
 *            kit: { medkit, pills, bomb } of 0/1 (noiseBomb also read; locked items dropped); null = autoKit.
 *            death = (1 - home) x (1 - rescue), the Lab's death x applied to (1 - rescue).
 *   oddsKey(state, destId, personId, kit?, { rested? }?) -> string   the cache key (destination + every model input)
 *   oddsCached(state, destId, personId, kit?, o?) -> odds | null  never computes (for the UI's per-frame reads)
 *   oddsTodo(state, destId?) -> [{ destId, personId, kit, key }]  what PLAY and the strip still need, Ready people first;
 *            the UI runs odds() on these in idle frames (<= 8 ms a frame, 6.3.5). destId defaults to the last destination.
 *   kitDeltas(state, destId, personId, kit?, o?) -> { medkit, pills, bomb (Home % with minus without; null if locked),
 *            labels: { medkit: 'Medkit · 75 · +6%', ... }, best: { item, delta, text } | null (unpacked, >= 2 points) }
 *   restedOdds(state, destId, personId, kit?, o?) -> null when not resting, else { home, death (after the rest), now,
 *            nowDeath, restLeftMs, price, confirm, text: '83% now · 95% after a 6:10 rest', label: 'REST NOW · 5 ✦',
 *            labelShort: 'REST NOW · 5 ✦ → 95%' (568) }
 *   strip(state, destId, { compute? }?) -> [{ personId, destId, home | null, death | null, state ('ready'|'tired'|'hurt'|
 *            'recovering'), restLeftMs, hpFrac, key, kit, badge ('good' 85+ | 'ok' 70-84 | 'low' | null), chip ('Rested',
 *            'Tired 6:10', ...), fav, lv, index }] everyone who can go (Down, Out and Fallen are not listed), best Home %
 *            first, ties to the lower level then the lower index. Cached odds only unless compute (null = "…", sorted after).
 *   suggest(state, destId?, { compute? }?) -> { personId, destId, home, death, tired, state, hpFrac, kit, key, known } | null
 *            PLAY (6.2): the Ready person with the best Home % at the last destination used, else the best of the resting.
 *   autoKit(state, destId) -> { medkit, pills, bomb, total }   kitNorm(state, destId, kit) -> { medkit, pills, bomb }
 *   runCard(state, destId, personId, kit?) -> the run sheet's runner card (8.7.1): { name, look, lv, xp, xpFrom, xpTo,
 *            roleLine, ttlLine, traitChip, kit, kitTotal, odds (computed), homeText, deathText, deathRed, fallLine, rest
 *            (restedOdds, cached only), tiredLine, hint, low (< 50 %), go { ok, err, confirm, label: 'GO · EMRE' |
 *            'RUN IT ANYWAY?' }, toggles: [{ item, open, on, price, delta, label, canTurnOn }] }
 *   buildHandoff(state, destId, personId, kit, seed, meta?) -> the 6.8 handoff. Before GO it previews the next night
 *            (seed null); meta { night, runId, realNow (createdAt), source 'sim' | 'game', odds }.
 *   runSim(state) -> the 6.9 result of state.pending (the model on the stored seed and the run input saved at GO, so a
 *            reload replays the same night). Forced outcomes try seeds seed+1..seed+500 (6.3.3, the Lab).
 *   validateResult(res, pending, state?) -> { ok, res (clean, the 6.9 keys in order), errors[], notes[] }: every row of
 *            the 6.9 table; with the state also "Already applied".
 *   reward(state, pending, res, realNow?) -> the 6.5 breakdown, computed on a copy (no mutation): { runId, personId,
 *            destId, night, source, win, outcome 'win'|'hurt'|'down', safe (no suspense), forced, clockMs, bricks, bricksBase,
 *            killBricks, cans, cansLoot, overflow { bricks, cans }, kit { held, packed, used, charged { medkit, pills, bomb,
 *            total }, returned {...}, back }, xp, lvFrom, lvTo, levelUps[], xpNow, xpFrom, xpTo, sparks { firstClear, daily },
 *            restMs, restKind, downUntilMs, rescue, nickname, nickName, rolls { luck, spare, stretcher }, arrival ('sack' |
 *            'stretcher' (Hurt, found by the team, a Clinic built: two medics carry the runner in) | 'limp' | null),
 *            lines { title 'You made it.' | 'Overrun.', sub 'Night 34 · Night Market · Emre', salvage 'kill salvage +29',
 *            kit 'Used: pills −45, noise bomb −60 · Returned: medkit +75', overflow 'Depot full: 120 bricks left behind.',
 *            firstClear 'First clear +6 ✦', daily 'Daily spark +5 ✦', nick 'Everyone calls Emre “Gatecrasher” now. Horde
 *            warning +1 s in Two Thumbs Left.', rest 'Emre rests 16:07', beat 'Did Emre make it home?', fall 'Emre made it
 *            home hurt. Rests 31 min.' | 'Emre limped home. Rests 9 min.' } }   (null fields when they do not apply)
 *   offer(state, personId) -> the revive offer (6.6.2, 8.8) of a Down person: { personId, first, name, look, stranger, n,
 *            title 'EMRE AYDIN IS DOWN', roleLine 'Scout · Lv 4 · 11 nights · 1,021 kills', where ('Overrun at the Night
 *            Market gate · Night 35' | 'Found Down at the gate · Night 3'), leftMs, leftText '23 h left to decide.',
 *            revive { cans, ok, need, restMs, label 'REVIVE · 850', sub 'rests 34 min in the Clinic', needText }, reviveNow
 *            { sparks, ok, need, label 'REVIVE NOW · 24 ✦', sub, needText }, goodbye { label, sub }, revivedText }
 *   memorial(state, graveId) -> the memorial card (8.9): { graveId, personId, gx, gy, waiting, look, first, name,
 *            roleLine 'Scout · Lv 4 · Quick learner', usedToBe, epitaph [2], record '11 nights · 10 home · 1,021 kills ·
 *            3 days in Bellhaven' | null, fellLine 'Fell at the Night Market, Night 35. The odds were 92%.' | 'Found Down
 *            at the gate · Night 3' }
 *   oddsTable(state, { cachedOnly }?) -> the Lab's table: every runner who can go x every open destination
 *   gallery(seed, n = 12) -> n generated people (the Lab's generator gallery; pure)
 *   oddsCacheSize() · oddsCacheClear()
 *   Engine._internal (tests, sim-bot): settle, fall, setDown, addXp, assignHouse, gain, earn, spend, history, epitaph,
 *            genPerson, refreshInn, warpAtGo, runClockMs, restFrac, startHpFrac, restMulOf, welcome, settleRun (6.5 steps on
 *            a state), runInput (the model input of a person there), keyOf, pendingInput, recoverMs, nickFor, DEST, ...
 * ==================================================================================================== STATE (11.2, save v1)
 *   As 11.2, plus: ids { b, j, r, g, d } (id counters: 'b4', 'j12', ...), demo (true only for #demo), grave.houseId
 *   (the House the person slept in, for the default spot), person.kin (the buried person whose family name a traveler
 *   or drifter took, P1), person.arrivedMs (city ms of arrival: "3 days in Bellhaven"), person.fellAt ('streets' |
 *   'hordes' | 'gate': where the run that left the person Down ended), tel.strangerRev (0 none, 1 cans, 2 sparks),
 *   tel.deathShown (the sum of the Death % shown at GO: the expected Downs). Times are integer ms; bubbles are bubbleBase +
 *   bubbleSinceMs. Inn travelers are full person records (state 'ready', no House, no history until invited). Beds:
 *   living people hold their beds, even the stranger Down at the gate with no House; a newcomer while living > beds (a
 *   drifter, a Lab arrival) sleeps on the plaza bench (houseId null) until a bed frees.
 *   pending (11.2, saved at GO before anything animates): { runId 'bh-000034', night, seed, destId, personId, source
 *   'sim' | 'external' (the Lab's "wait for a real result"), kit { medkit, pills, bomb }, held (cans), handoff, refs,
 *   falls, startedCityMs, warpS (5.1; null = no cap), L (the run model's input at GO: P, maxHp, startHp, sw, medkit,
 *   pills, bomb, heal, pillsTemp, weapon, shoveMul, accAdd), dest { hordeMul }, force ('auto' | 'win' | 'loss' | 'down' |
 *   'hurt': a forced first win or the Lab), forcedFirst, odds { home, death, rescue } (as shown at GO; the stretcher
 *   uses this rescue), safe (no Down possible: the Allotments or before the third present person) }.
 *   lastRun: { handoff, result, notes, reward } for the result card and the Lab. Night N = the N-th run ever started.
 *
 * ==================================================================================================== VIEW
 *   { v, cityMs, night, demo, today, realLast,
 *     tower: { id, lv, gx, gy, storeys, gold, hordeWarnS, job, next: { lv, cost, timeS, opens[], ok, err, needTower } | null },
 *     land: { ring, side, lo, hi, gate: { x (the fence line gx = hi), gy: [11, 12], tiles: [[gx, gy] x 2] },
 *             quietCorner: { gx, gy }, next: { ring, side, needTower, cost, timeS, ok, err } | null,
 *             groundKey (changes when the land, the Tower's spot or the plaza change: re-render the ground cache) },
 *     plaza: [[gx, gy], ...] free tiles within 1 of the Tower's footprint (paving, cosmetic),
 *     walkable: string of 576 '0'/'1' (index gy * 24 + gx): free land tiles, gate tiles included,
 *     buildings: [{ id, type, name, lv, gx, gy, w, d, label ('KILN · LV 3'), maxLv, building (lv 0: under construction),
 *                   job: JobView | null, bubble: { res, amount, whole, hold, frac, show, full } | null,
 *                   next: { lv, cost, timeS, ok, err, needTower } | null,
 *                   house: { idx, color, roof, beds, residents[], resting, lit, lantern } (houses),
 *                   clinic: { down: [{ personId, first, leftMs }], recovering[] } (Clinic),
 *                   inn: { travelers } (Inn), tower: { storeys, gold } (Tower) }],
 *     jobs: [JobView { id, kind, buildingId, type, name, toLv, startMs, endMs, leftMs, progress, price, free, confirm, label }],
 *     cranes: { total, free, crane4, buy: { ok, err, price }, list: [{ i, busy, jobId, site: { gx, gy, w, d } | null, park: { x, y } }] },
 *     rubble: [{ id, gx, gy, ring, glint, cost: { res, n }, ok }],
 *     graves: [{ id, personId, gx, gy, waiting, placedMs, ageMs, first, name, initial, ribbon, grassed, flowers,
 *                flowerColors[4], candle, epitaph }],
 *     decor: [{ id, type, gx, gy }],
 *     people: [PersonView] living, roster order (Down, Ready, Resting, Hurt, Recovering, Out),
 *     remembered: [PersonView] the Fallen (with graveId),
 *     inn: { id, lv, travelers: [PersonView], nextRefreshMs, leftMs, price, invitePrice, canInvite: { ok, err } } | null,
 *     res, caps, rates (per hour), chips: { tower, bricks: { n, cap, frac }, cans: { n, cap, frac, over },
 *             sparks, cranes: { free, total }, people: { living, beds, down }, build: { affordable } },
 *     tray: [{ type, name, decor, cost, timeS, built, allowed, max, locked (needs Tower N) | null, full, affordable, ok, err }],
 *     dests: [{ id, n, name, threat, open, lock ('Tower 5' | 'Needs the Clinic') | null, cleared, firstSparks, bricks,
 *               cans, xp, fav, kit }],
 *     goal: goal(state), daily: { claimed }, deathOn, flags, lab: { timeScale, reducedMotion, runScreenS, force, waitReal },
 *     play: suggest(state) (cached odds only) + { first, look, destName, label 'Emre → Night Market', homeText ('98%' |
 *           '…' while not known), deathText, deathRed, hpText 'HP 72%' | null, dailyTag '✦5' | null } | null,
 *     pending: { runId, night, personId, first, destId, destName, source, sim, startedCityMs, warpS, kit, held, force, odds,
 *           handoff, title 'Night 34 · Night Market' } | null,
 *     lastRun: state.lastRun (the result card: handoff, result, notes, reward) | null }
 *   PersonView: { id, index, first, last, name, fullName (with “nickname”), nick, nickName, age, role, roleName,
 *     trade, card ('Used to be a taxi driver. Rates every sunset out of ten.'), trait, traitName, traitLine, habit, look,
 *     lv, xp, xpFrom, xpTo, state, restKind, restLeftMs, restTotalMs, startHpFrac, downLeftMs, houseId, house (color name),
 *     where: 'walk'|'house'|'bench'|'clinic'|'gate'|'out'|'grave', pill ('Rested', 'Tired 6:10', 'Hurt 31:00',
 *     'Recovering 12:00', 'Down · 20 h', 'Out'), stranger, runs, wins, kills, bestKills, revives, history, epitaph,
 *     suggested, graveId, arrivedNight, arrivedHow ('starter'|'inn'|'drifter'|'stranger'|'lab'|'traveler'), fellNight,
 *     fellDest, fellOdds, kin, kinLine ('Says Efua Boateng was family.' | null), canRun (Ready or resting, no run out),
 *     roleChip ('SCOUT · +5 at the Night Market'; a Medic adds '· medkit heals 88 %'), ttlLine ('In Two Thumbs Left:
 *     flashlight 568 · horde warning +0.8 s'), traitChip ('QUICK LEARNER · XP × 1.25'), nickChip ('“GHOST” · speed +5 in
 *     Two Thumbs Left' | null), hpText ('HP 72%' while resting), fellAt, arrivedMs }
 *
 * ==================================================================================================== EVENTS
 *   { type, ... }: jobStarted { jobId, kind, buildingId, toLv } · jobDone { jobId, kind, buildingId, buildingType, lv, name } ·
 *   towerUp { lv, opens, sparks, text } · finale · expanded { ring, side, rubble[], glintId } · bubbleFull { buildingId,
 *   res, at } · collected { buildingId, res, n, overflow } · placed { buildingId | decorId, buildingType, jobId } · moved { kind, id, gx,
 *   gy } · finished { jobId, price } · rubbleCleared { rubbleId, sparks, gx, gy } · craneBought · rested { personId, early, price? } ·
 *   innRefresh { n, travelers[] } · stranger { personId } · drifter { personId } · deathOn · fell { personId, graveId,
 *   why, where } · downExpired { personId, graveId, where } · gravePlaced { graveId, personId, gx, gy } · goal { step,
 *   key, text, reward } · levelUp { personId, lv } · packClaimed { size } · offline { ms, welcome? } · dev { op } ·
 *   runStarted { runId, personId, destId, night, source } · runResolved { runId, personId, destId, outcome, arrival } ·
 *   down { personId, destId } (a run ended Down: the offer opens once) · firstClear { destId, sparks } · daily { sparks,
 *   day } · nickname { personId, nick, name } · invited { personId, price } · revived { personId, pay, price, stranger,
 *   restMs }. fell { why: 'goodbye' | 'expired' } is the grave (the bell tolls once).
 *
 * ==================================================================================================== ACTIONS
 *   collect { id } · place { kind, gx, gy, finishOther? } (kind: a building type or 'tree' | 'bench' | 'lamp') ·
 *   upgrade { id, finishOther? } · expand { finishOther? } · clearRubble { id } · move { target: { kind: 'building' |
 *   'grave' | 'decor', id }, gx, gy } · finish { jobId, confirm? } · restNow { personId, confirm? } · innNow { confirm? } ·
 *   buyCrane · claimPack { size: 100 | 500 | 2500 } · flag { name: 'metPeople' | 'deathCardSeen' | 'finale' } ·
 *   setLastDest { destId } · dev { op, ... } ·
 *   invite { travelerId } -> data { personId, price }   60 + 30 x living cans, a free bed (err beds), a history line.
 *   startRun { destId, personId, kit?, confirmLow? } -> data { runId, handoff }   GO (6.2): kit null = packed
 *            automatically; a packed item must be unlocked (err locked, data { item }) and paid for (err cost); the kit
 *            is held; under 50 % Home it needs confirmLow (err confirm, data { home }); one run at a time (err pending);
 *            Down, Out and Fallen people cannot go (err state). Draws the seed (the Lab may lock it), stamps the run-warp
 *            allowance, takes a forced first win, stores everything in pending and sets the runner Out.
 *   resolveRun { result?, source: 'sim' | 'game' | 'paste' } -> data { reward, outcome, notes, result, offer | null }
 *            result may be an object or a JSON string; source 'sim' without a result runs runSim(). Validated (a
 *            rejection changes nothing: err state, data { errors, notes }), settled (6.5), lastRun written, pending
 *            cleared; the same run twice answers "Already applied". A Down outcome returns the offer.
 *   revive { personId, pay: 'cans' | 'sparks' } -> data { price, restMs }   cans: Recovering in the Clinic for 10 min x L x
 *            Clinic rest; sparks: Ready at once (a sink, never a paid skip). Escalation x 2^min(n, cap), cans clamped at
 *            80 % of the can cap; the stranger's first revive is 50 cans or 5 ✦.
 *   goodbye { personId } -> data { graveId, spot | null }   Fallen, the epitaph and the grave on its default spot in this
 *            one act (R13); housemates remember the fall. LAY TO REST then sends move { target: { kind: 'grave', id } }
 *            only if the ghost was dragged.
 *   finishOther: with every crane busy, pays the skip price of the job with the least time left (no second confirm:
 *   the "Finish the Kiln now · 7 ✦" dialog is the confirmation), finishes it and starts the new job.
 *   Prices of 20 ✦ or more need confirm: true (else err 'confirm', data { price }).
 *
 * ==================================================================================================== ERRORS
 *   noCrane (data { jobId, price, label }) · cost (data { res, need }) · locked (data { needTower }) ·
 *   max · blocked (data { reason }) · beds · busy · notFound · confirm (data { price }) · pending · state
 *
 * ==================================================================================================== DEV OPS (act { type: 'dev', op })
 *   Time:    timeScale { value: 0|1|10|60|600 } · skipAhead { ms } (offline path: data.welcome) · runsAdvanceClock { value }
 *            · runWarp { value: 0 (no cap) | 1-20 }
 *   Grants:  grant { what: 'bricks'|'cans'|'sparks', n? (1,000 / 1,000 / 100) } · fillBubbles · finishAll (jobs, rests,
 *            the Inn; never a Down deadline) · setTower { lv } · clearRubble (all, no sparks)
 *   Runs:    force { value: 'auto'|'win'|'loss'|'down'|'hurt' } · runScreenS { value: 3|8|20 } · lockSeed { value: uint|null }
 *            · forcedWins { value: 0-2 } · waitReal { value } · paste a result: the action resolveRun { result, source:
 *            'paste' } · the odds table: oddsTable(state)
 *   Tuning:  mul { key: cost|time|prod|loot|xp|death|revive|rest|inn, value } (costs and caps scale together; prod
 *            re-bases every bubble first; data.dataRule lists violations) · rescueBase { destId, value } · set { key:
 *            clinicRescue|tiredFloor|escalationCap|downWindowMs|freeSec|skipExp|skipK|reducedMotion, value } · resetLab
 *   People:  addPerson { seed?, lv? } (ignores beds) · kill { personId } (Down now: then offer() opens the Down flow) ·
 *            reviveAll · setLevel { personId, lv } · giveXp { personId, xp } · reroll { seed? } (a new save seed, the Lab
 *            kept) · the generator gallery: gallery(seed)
 *   State:   replayOnboarding · reset { seed? } (export/import: serialize() and load())
 *   Every dev change is tagged dev: Lab sparks and packs never count as income in the telemetry.
 */
(function (root, f) { const api = f(root.BH || {}); if (typeof module === 'object' && module.exports) module.exports = api; else (root.BH = root.BH || {}).Engine = api; })(typeof self !== 'undefined' ? self : this, function (BH) {
  'use strict';
  const DATA = BH.DATA || (typeof require === 'function' ? require('./data.js') : null);
  const Names = BH.Names || (typeof require === 'function' ? require('./names.js') : null);
  const Run = BH.Run || (typeof require === 'function' ? require('./run.js') : null);

  const V = 1, SEC = 1000, MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const B = DATA.BUILDINGS, TYPES = DATA.TYPES, EXP = DATA.EXPAND, RULES = DATA.RULES, TEXT = DATA.TEXT, START = DATA.START;
  const GOALS = DATA.GOALS, XP_AT = DATA.XP_AT, G = START.world;
  const DEST = {}; DATA.DESTS.forEach((d) => { DEST[d.id] = d; });
  const DATA_RULE = DATA.assertData(1);                      // SPEC 3.4: asserted when the engine loads (tests check it is [])
  const MIGRATIONS = { 1: (o) => o };
  const PRODUCERS = { kiln: 'bricks', cannery: 'cans' };
  const STATES = ['ready', 'rest', 'out', 'down', 'fallen'], REST_KINDS = ['tired', 'hurt', 'recovering'];
  const HOWS = ['starter', 'inn', 'traveler', 'drifter', 'stranger', 'lab'];
  const UI_FLAGS = ['metPeople', 'deathCardSeen', 'finale'];
  const PACKS = [100, 500, 2500];
  const BIG = 9e15;                                          // counters never exceed a safe integer

  // ------------------------------------------------------------------ small helpers
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clampInt = (v, lo, hi, d) => Math.round(clamp(fin(v, d), lo, hi));
  const uint = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.floor(Math.abs(v)) >>> 0 : d);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const str = (v, d) => (typeof v === 'string' ? v : d);
  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const idNum = (id) => +String(id).replace(/^\D+/, '') || 0;
  const ordinal = (n) => (n === 1 ? '' : n === 2 ? '2nd ' : n === 3 ? '3rd ' : n + 'th ');
  const joinNames = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

  // ------------------------------------------------------------------ number and time formats (2, 5.5, 6.3.3)
  const dec1 = (x) => { const v = Math.floor(x * 10 + 1e-9) / 10; return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1); };
  function fmtNum(n) { n = Math.floor(fin(n, 0)); const t = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '-' : '') + t; }
  function fmtCompact(n, narrow) {
    n = Math.floor(fin(n, 0)); const a = Math.abs(n), sg = n < 0 ? '-' : '';
    if (a < 1000) return String(n);
    if (a < 10000) return narrow ? sg + dec1(a / 1000) + 'k' : fmtNum(n);
    if (a < 100000) return sg + dec1(a / 1000) + 'k';
    if (a < 1e6) return sg + Math.floor(a / 1000) + 'k';
    return sg + dec1(a / 1e6) + 'M';
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(fin(sec, 0)));
    if (sec < 60) return sec + ' s';
    if (sec < 3600) return Math.floor(sec / 60) + ' min';
    if (sec < 172800) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return m ? h + ' h ' + m + ' min' : h + ' h'; }
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600); return h ? d + ' d ' + h + ' h' : d + ' d';
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(fin(sec, 0) - 1e-9));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
    return h ? h + ':' + pad2(m) + ':' + pad2(x) : m + ':' + pad2(x);
  }
  function fmtPct(x, mode) {
    const p = 100 * fin(x, 0);
    if (mode === 'death') { if (p <= 0) return '0%'; const r = Math.round(p * 10) / 10; return (r < 10 ? r.toFixed(1) : String(Math.round(p))) + '%'; }
    return Math.round(p) + '%';
  }
  function fmtHoursLeft(ms) { const h = Math.floor(Math.max(0, fin(ms, 0)) / HOUR); return h >= 1 ? h + ' h left' : 'under an hour left'; }
  function fmtIso(ms) {                                       // ISO 8601 from epoch ms, pure arithmetic (civil from days)
    ms = Math.floor(fin(ms, 0)); const days = Math.floor(ms / DAY); let rem = ms - days * DAY;
    const z = days + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    let y = yoe + era * 400; const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153), d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp + (mp < 10 ? 3 : -9); if (m <= 2) y++;
    const hh = Math.floor(rem / HOUR); rem -= hh * HOUR; const mm = Math.floor(rem / MIN); rem -= mm * MIN; const ss = Math.floor(rem / SEC);
    return y + '-' + pad2(m) + '-' + pad2(d) + 'T' + pad2(hh) + ':' + pad2(mm) + ':' + pad2(ss) + '.' + String(rem - ss * SEC).padStart(3, '0') + 'Z';
  }
  const fmt = { compact: fmtCompact, num: fmtNum, dur: fmtDur, clock: fmtClock, pct: fmtPct, hoursLeft: fmtHoursLeft, iso: fmtIso };

  // ------------------------------------------------------------------ the city RNG: mulberry32 stepping on state.rng
  function rand(s) {
    let a = s.rng | 0; a = a + 0x6D2B79F5 | 0; s.rng = a >>> 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  const nid = (s, k) => k + (++s.ids[k]);

  // ------------------------------------------------------------------ lookups
  const byId = (s, id) => s.buildings.find((b) => b.id === id) || null;
  const towerB = (s) => s.buildings.find((b) => b.type === 'tower');
  const towerLv = (s) => { const t = towerB(s); return t ? t.lv : 1; };
  const personById = (s, id) => s.people.find((p) => p.id === id) || null;
  const jobFor = (s, bid) => s.jobs.find((j) => j.target === bid) || null;
  const ofType = (s, t) => s.buildings.filter((b) => b.type === t);
  const countBuilt = (s, t) => s.buildings.reduce((n, b) => n + (b.type === t && b.lv >= 1 ? 1 : 0), 0);
  const maxLvOf = (s, t) => s.buildings.reduce((m, b) => (b.type === t && b.lv > m ? b.lv : m), 0);
  const living = (s) => s.people.filter((p) => p.state !== 'fallen');
  const present = (s) => s.people.filter((p) => p.state === 'ready' || p.state === 'rest' || p.state === 'out');
  const innB = (s) => s.buildings.find((b) => b.type === 'inn') || null;
  const clinicLv = (s) => maxLvOf(s, 'clinic');
  const armoryLv = (s) => maxLvOf(s, 'armory');
  function allowedCount(s, t) { let n = 0; const T = towerLv(s); for (const [tw, c] of B[t].count) if (T >= tw) n = c; return n; }
  const maxCount = (t) => B[t].count[B[t].count.length - 1][1];
  function countTower(t, have) { for (const [tw, c] of B[t].count) if (c > have) return tw; return null; }
  function costOf(s, t, lv) { return { res: B[t].cur, n: Math.round(B[t].cost[lv] * s.lab.mul.cost) }; }
  function jobMs(s, t, lv) { return Math.round(B[t].time[lv] * SEC * s.lab.mul.time); }
  const expandCost = (s, ring) => Math.round(EXP.cost[ring] * s.lab.mul.cost);
  const expandMs = (s, ring) => Math.round(EXP.time[ring] * SEC * s.lab.mul.time);
  const clearCost = (s, ring) => Math.round(EXP.clear[ring] * s.lab.mul.cost);
  function capOf(s, res) {
    const m = s.lab.mul.cost, row = res === 'bricks' ? B.depot.capB : B.depot.capC;
    let c = Math.round(DATA.CAP0[res] * m);
    for (const b of s.buildings) if (b.type === 'depot' && b.lv >= 1) c += Math.round(row[b.lv] * m);
    return c;
  }
  const rateLv = (s, t, lv) => B[t].rate[lv] * s.lab.mul.prod;            // per hour, the Lab's multiplier included
  const holdLv = (s, t, lv) => rateLv(s, t, lv) * B[t].hold[lv];
  function rateOf(s, res) { let r = 0; for (const b of s.buildings) if (PRODUCERS[b.type] === res && b.lv >= 1) r += rateLv(s, b.type, b.lv); return r; }
  const cranesTotal = (s) => DATA.TOWER.cranes[towerLv(s)] + (s.crane4 ? 1 : 0);
  const cranesFree = (s) => Math.max(0, cranesTotal(s) - s.jobs.length);
  function bedsOf(s) { let n = 0; for (const b of s.buildings) if (b.type === 'house' && b.lv >= 1) n += B.house.beds[b.lv]; return n; }
  function destOpen(s, d) { return towerLv(s) >= d.tower && (!d.clinic || clinicLv(s) >= 1); }
  function destLock(s, d) { return towerLv(s) < d.tower ? 'Tower ' + d.tower : d.clinic && clinicLv(s) < 1 ? 'Needs the Clinic' : null; }
  const lootMul = (s) => s.lab.mul.loot;
  function skipPrice(sec, s) {
    const L = s && s.lab ? s.lab : DATA.LAB_DEFAULT;
    if (!(sec > L.freeSec)) return 0;
    return Math.ceil(L.skipK * Math.pow(sec / 60, L.skipExp));
  }
  const dayOf = (s, realNow) => Math.floor((fin(realNow, 0) + s.tzOffsetMin * MIN) / DAY);

  // ------------------------------------------------------------------ the grid (3.1-3.3)
  const landLo = (s) => 8 - s.ring, landHi = (s) => 16 + s.ring;
  const inLand = (s, x, y) => x >= landLo(s) && x < landHi(s) && y >= landLo(s) && y < landHi(s);
  const isGate = (s, x, y) => x === 15 + s.ring && (y === START.gateGy[0] || y === START.gateGy[1]);
  const footW = (kind) => (B[kind] ? B[kind].w : 1);
  function occGrid(s, ignoreId) {
    const g = new Array(G * G).fill(null), put = (x, y, w, o) => { for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) { const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < G && Y < G) g[Y * G + X] = o; } };
    for (const b of s.buildings) if (b.id !== ignoreId) put(b.gx, b.gy, B[b.type].w, b.id);
    for (const r of s.rubble) if (r.id !== ignoreId) put(r.gx, r.gy, 1, r.id);
    for (const d of s.decor) if (d.id !== ignoreId) put(d.gx, d.gy, 1, d.id);
    for (const g2 of s.graves) if (g2.id !== ignoreId && g2.gx != null) put(g2.gx, g2.gy, 1, g2.id);
    return g;
  }
  function fitsGrid(s, grid, w, gx, gy) {
    if (!Number.isInteger(gx) || !Number.isInteger(gy)) return 'bad';
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const x = gx + i, y = gy + j;
      if (!inLand(s, x, y)) return 'outside';
      if (isGate(s, x, y)) return 'gate';
      if (grid[y * G + x] != null) return 'occupied';
    }
    return null;
  }
  function canPlace(s, kind, gx, gy, ignoreId) {
    const reason = fitsGrid(s, occGrid(s, ignoreId), footW(kind), gx, gy);
    return { ok: !reason, reason };
  }
  function suggestSpot(s, type, nearGx, nearGy, ignoreId) {
    const w = footW(type), grid = occGrid(s, ignoreId), lo = landLo(s), hi = landHi(s);
    const cx = fin(nearGx, 12), cy = fin(nearGy, 12);
    let best = null, bd = Infinity;
    for (let y = lo; y + w <= hi; y++) for (let x = lo; x + w <= hi; x++) {
      if (fitsGrid(s, grid, w, x, y)) continue;
      const dx = x + w / 2 - cx, dy = y + w / 2 - cy, dd = dx * dx + dy * dy;
      if (dd < bd - 1e-9) { bd = dd; best = { gx: x, gy: y }; }
    }
    return best;
  }
  function spotFrom(s, sx, sy, grid) {                        // 6.7: Chebyshev rings 0, 1, 2, ...; gy then gx ascending
    grid = grid || occGrid(s);
    for (let r = 0; r < G; r++) for (let y = sy - r; y <= sy + r; y++) for (let x = sx - r; x <= sx + r; x++) {
      if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r || x < 0 || y < 0 || x >= G || y >= G) continue;
      if (!fitsGrid(s, grid, 1, x, y)) return { gx: x, gy: y };
    }
    return null;
  }
  function graveStart(s, houseId) {
    const h = houseId ? byId(s, houseId) : null;
    return h && h.type === 'house' ? { gx: h.gx, gy: h.gy + 2, house: h } : { gx: landLo(s), gy: landLo(s), house: null };
  }
  function graveSpot(s, personId) {
    const p = personById(s, personId); if (!p) return null;
    const g = s.graves.find((x) => x.personId === personId);
    const st = graveStart(s, p.state === 'fallen' && g ? g.houseId : p.houseId);
    return spotFrom(s, st.gx, st.gy, occGrid(s, g ? g.id : null));
  }
  function plazaTiles(s, grid) {
    const t = towerB(s); if (!t) return [];
    grid = grid || occGrid(s); const out = [];
    for (let y = t.gy - 1; y <= t.gy + 3; y++) for (let x = t.gx - 1; x <= t.gx + 3; x++) {
      if (x >= t.gx && x < t.gx + 3 && y >= t.gy && y < t.gy + 3) continue;
      if (inLand(s, x, y) && !isGate(s, x, y) && grid[y * G + x] == null) out.push([x, y]);
    }
    return out;
  }

  // ------------------------------------------------------------------ money and telemetry bookkeeping
  function gain(s, res, n, src) {                             // storage gains are cut at the cap (2)
    n = Math.max(0, Math.round(fin(n, 0)));
    const room = Math.max(0, capOf(s, res) - s.res[res]), g = Math.min(room, n);
    s.res[res] += g;
    if (n > g && src !== 'dev') { if (res === 'bricks') s.tel.overflowBricks += n - g; else s.tel.overflowCans += n - g; }
    if (res === 'bricks') { if (src === 'run') s.tel.bricksRun += g; else if (src === 'prod') s.tel.bricksProd += g; else if (src === 'goal') s.tel.bricksGoal += g; }
    else if (src === 'run') s.tel.cansRun += g; else if (src === 'prod') s.tel.cansProd += g;
    return g;
  }
  function earn(s, n, why) {                                  // sparks; dev sources never count as income (9)
    if (!(n > 0)) return 0;
    s.res.sparks += n;
    if (why === 'pack' || why === 'lab') s.tel.devSparks += n; else s.tel.sparksIn[why] = (s.tel.sparksIn[why] || 0) + n;
    return n;
  }
  function spend(s, n, why) {                                 // the sinks: finish, restNow, innNow, revive, crane (19)
    if (!(n > 0)) return 0;
    s.res.sparks -= n; s.tel.sparksOut[why] = (s.tel.sparksOut[why] || 0) + n;
    return n;
  }

  // ------------------------------------------------------------------ bubbles (5.2): closed form, never accumulated
  function bubbleAt(s, b, at) {
    if (!PRODUCERS[b.type]) return 0;
    if (b.lv < 1) return b.bubbleBase || 0;
    const rate = rateLv(s, b.type, b.lv);
    return Math.min(rate * B[b.type].hold[b.lv], b.bubbleBase + rate * Math.max(0, (at == null ? s.cityMs : at) - b.bubbleSinceMs) / HOUR);
  }
  function rebase(s, b, at, left) { b.bubbleBase = left == null ? bubbleAt(s, b, at) : left; b.bubbleSinceMs = at; }
  function fillMs(s, b) {
    if (!PRODUCERS[b.type] || b.lv < 1) return null;
    const rate = rateLv(s, b.type, b.lv), hold = rate * B[b.type].hold[b.lv];
    if (!(rate > 0) || b.bubbleBase >= hold) return null;
    return b.bubbleSinceMs + Math.ceil((hold - b.bubbleBase) / rate * HOUR);
  }
  function bubbleView(s, b) {
    const res = PRODUCERS[b.type]; if (!res || b.lv < 1) return null;
    const amount = bubbleAt(s, b), hold = holdLv(s, b.type, b.lv);
    return { res, amount, whole: Math.floor(amount), hold, frac: hold > 0 ? amount / hold : 0, show: amount >= RULES.bubbleShow * hold && amount >= 1, full: amount >= hold };
  }

  // ------------------------------------------------------------------ people
  function takenNames(s, extra) { const t = []; for (const p of s.people) t.push(p.first); for (const p of s.inn.travelers) t.push(p.first); return extra ? t.concat(extra) : t; }
  const takenHabits = (s) => living(s).map((p) => p.habit);
  function personRecord(g, how, night, atMs) {
    const lv = clamp(g.lv || 1, 1, 10), line = how === 'traveler' ? null : TEXT.arrived[how] || TEXT.arrived.lab;
    return { id: 'p' + g.index, index: g.index, seed: g.seed, first: g.first, last: g.last, nick: null, age: g.age, role: g.role,
      trade: g.trade, trait: g.trait, habit: g.habit, look: { skin: g.look.skin, hairStyle: g.look.hairStyle, hair: g.look.hair, jacket: g.look.jacket, acc: g.look.acc },
      lv, xp: XP_AT[lv], state: 'ready', restKind: null, restFromMs: 0, restUntilMs: 0, downUntilMs: 0, houseId: null,
      revives: 0, runs: 0, wins: 0, hurtCount: 0, kills: 0, bestKills: 0,
      history: line ? [[night, fill(line, { n: night })]] : [], arrivedNight: night, arrivedHow: how, arrivedMs: Math.max(0, Math.round(fin(atMs, 0))),
      fellNight: null, fellDest: null, fellOdds: null, fellAt: null, epitaph: null, kin: null };
  }
  // A new person from the save seed and the next index (4.2): first names unique among the living, the buried and the Inn.
  // Kin (4.11, P1): travelers and drifters may take a buried family name (the generator always draws for it, so the
  // stream never shifts); the record then names that grave's person ("Says Efua Boateng was family.").
  function genPerson(s, o) {
    o = o || {};
    const index = s.nextIndex++, how = o.how || 'lab';
    const seed = o.seed != null ? o.seed >>> 0 : s.saveSeed, idx = o.seed != null ? 0 : index;
    const opts = { taken: takenNames(s, o.extraTaken), takenHabits: takenHabits(s), role: o.role || null, lv: o.lv || 1 };
    const buried = how === 'traveler' || how === 'drifter' ? s.graves.map((gr) => personById(s, gr.personId)).filter(Boolean) : [];
    const g = Names.person(seed, idx, buried.length ? Object.assign({ buried: buried.map((q) => q.last) }, opts) : opts);
    g.index = index;
    const rec = personRecord(g, how, s.night, s.cityMs);
    if (buried.length && g.last !== Names.person(seed, idx, opts).last) { const k = buried.filter((q) => q.last === g.last).pop(); if (k) rec.kin = k.id; }
    return rec;
  }
  function history(s, p, text) {
    p.history.push([s.night, text]);
    while (p.history.length > RULES.maxHistory) p.history.shift();
  }
  function epitaph(s, p) {
    let l1;
    if (p.nick && DATA.NICKNAMES[p.nick]) l1 = fill(TEXT.epitaphNick, { F: p.first, Nick: DATA.NICKNAMES[p.nick].name });
    else if (p.bestKills >= RULES.epitaphKills) l1 = fill(TEXT.epitaphKills, { k: fmtNum(p.bestKills) });
    else if (p.runs === 0) l1 = fill(TEXT.epitaphRuns0, { n: p.arrivedNight });
    else if (p.runs === 1) l1 = TEXT.epitaphRuns1;
    else l1 = fill(TEXT.epitaphRunsN, { k: p.runs });
    return [l1, Names.habitPast(p.habit)];
  }
  function addXp(s, p, xp, ev) {                              // 4.8: people level only by running (and the Lab)
    p.xp = Math.max(0, p.xp + Math.max(0, Math.round(fin(xp, 0))));
    while (p.lv < 10 && p.xp >= XP_AT[p.lv + 1]) {
      p.lv++; s.tel.levelUps++;
      if (TEXT.levelLines.includes(p.lv)) history(s, p, fill(TEXT.level, { n: s.night, L: p.lv }));
      ev.push({ type: 'levelUp', personId: p.id, lv: p.lv });
    }
  }
  function assignHouse(s, p) {                                // 4.10: the lowest-index House with a free bed
    // Living people hold their beds even without a House (the stranger Down at the gate): while living > beds the
    // newcomer (a drifter, a Lab arrival) sleeps on the plaza bench until a bed frees.
    if (s.people.reduce((n, q) => n + (q !== p && q.state !== 'fallen' ? 1 : 0), 0) + 1 > bedsOf(s)) { p.houseId = null; return null; }
    const houses = s.buildings.filter((b) => b.type === 'house' && b.lv >= 1).sort((a, b) => a.houseIdx - b.houseIdx);
    for (const h of houses) {
      const used = s.people.reduce((n, q) => n + (q !== p && q.state !== 'fallen' && q.houseId === h.id ? 1 : 0), 0);
      if (used < B.house.beds[h.lv]) { p.houseId = h.id; return h.id; }
    }
    p.houseId = null; return null;
  }
  function houseName(s, houseId) { const h = houseId ? byId(s, houseId) : null; return h && h.type === 'house' ? DATA.HOUSE_COLORS[h.houseIdx % 3].name : null; }
  function graveWhere(s, grave) {
    if (!grave || grave.gx == null) return 'The grave waits for a place.';
    const c = houseName(s, grave.houseId);
    return c ? 'A grave stands by the ' + c + ' House.' : 'A grave stands in the quiet corner.';
  }
  // Fallen at once, the epitaph written, the grave on its default spot (or waiting for a free tile): 6.6.2, 6.7.
  function fall(s, p, why, ev) {
    const houseId = p.state === 'fallen' ? null : p.houseId;
    const D = p.fellDest ? DEST[p.fellDest] : null;            // 4.13 (P1): each housemate remembers a fall at a destination
    if (houseId && D) for (const q of s.people) if (q !== p && q.state !== 'fallen' && q.houseId === houseId) history(s, q, fill(TEXT.lost, { n: s.night, N: p.first + ' ' + p.last, D: D.theName }));
    p.state = 'fallen'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; p.downUntilMs = 0;
    p.epitaph = epitaph(s, p);
    const st = graveStart(s, houseId), spot = spotFrom(s, st.gx, st.gy);
    const grave = { id: nid(s, 'g'), personId: p.id, gx: spot ? spot.gx : null, gy: spot ? spot.gy : null, placedMs: s.cityMs, houseId: st.house ? st.house.id : null };
    s.graves.push(grave);
    p.houseId = null;                                         // frees the bed
    s.tel.graves++;
    if (why === 'expired') s.tel.expired++; else if (why === 'goodbye') s.tel.goodbyes++;
    if (s.tel.firstGraveMs == null) s.tel.firstGraveMs = s.cityMs;
    const where = graveWhere(s, grave);
    ev.push({ type: 'fell', personId: p.id, graveId: grave.id, why, where });
    if (spot) ev.push({ type: 'gravePlaced', graveId: grave.id, personId: p.id, gx: spot.gx, gy: spot.gy });
    if (why === 'expired') ev.push({ type: 'downExpired', personId: p.id, graveId: grave.id, where });
    return grave;
  }
  function setDown(s, p) { p.state = 'down'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; p.downUntilMs = s.cityMs + Math.round(s.lab.downWindowMs); }
  function restMulOf(s, p) {
    return B.clinic.restMul[clinicLv(s)] * (p.trait === 'light_sleeper' ? DATA.TRAITS.light_sleeper.rest : 1) * (p.nick === 'oldhand' ? DATA.NICKNAMES.oldhand.rest : 1) * s.lab.mul.rest;
  }
  function restFrac(s, p) {                                   // the share of rest done, in 5 % steps (6.2)
    if (p.state !== 'rest') return 1;
    const tot = Math.max(1, p.restUntilMs - p.restFromMs), done = clamp((s.cityMs - p.restFromMs) / tot, 0, 1);
    return Math.floor(done * 20 + 1e-9) / 20;
  }
  function startHpFrac(s, p) { const f = s.lab.tiredFloor; return f + (1 - f) * restFrac(s, p); }

  // 4.6: what this person brings to a run at destId (the card and the handoff). Pure.
  function derived(s, personId, destId) {
    const p = typeof personId === 'object' && personId ? personId : (personById(s, personId) || s.inn.travelers.find((t) => t.id === personId));
    if (!p) return null;
    const d = DEST[destId] || DEST[s.lastDest] || DATA.DESTS[0], L = p.lv, T = towerLv(s), ar = armoryLv(s), cl = clinicLv(s), role = p.role, tr = p.trait, nk = p.nick;
    const maxHp = (tr === 'tough' ? 115 : tr === 'heavy' ? 110 : 100) + (nk === 'lastbreath' ? 5 : 0);
    const hpFrac = startHpFrac(s, p), startHp = Math.round(maxHp * hpFrac);
    const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
    const speed = 200 + (role === 'sprinter' ? 2 * L : 0) + (tr === 'heavy' ? -15 : 0) + (nk === 'ghost' ? 5 : 0);
    const shoveCdMul = r2((role === 'brawler' ? 1 - 0.03 * L : 1) * (nk === 'elbows' ? 0.9 : 1));
    const assist = r2(Math.min(1, 0.5 + (role === 'marksman' ? 0.03 * L : 0) + (tr === 'steady' ? 0.10 : 0)));
    const flashlightR = 520 + (role === 'scout' ? 12 * L : 0) + (tr === 'night_owl' ? 40 : 0);
    const hordeWarnS = r1(Math.min(8, 3 + 0.3 * T + (role === 'scout' ? 0.2 * L : 0) + (nk === 'gatecrasher' ? 1 : 0)));
    const damageMul = r2(B.armory.damage[ar] * (role === 'marksman' ? 1 + 0.01 * L : 1) * (tr === 'reckless' ? 1.1 : 1) * (nk === 'mower' ? 1.05 : 1));
    const medkitHeal = role === 'medic' ? r2(0.8 + 0.02 * L) : 0.8, medkitHealS = role === 'medic' ? r1(3 - 0.1 * L) : 3;
    const pillsTemp = tr === 'iron_stomach' ? 70 : 50, secondWind = B.clinic.sw[cl];
    const tp = DATA.TRAITS[tr] || {}, fav = DATA.ROLE_STATS[role] && DATA.ROLE_STATS[role].fav.includes(d.id);
    const power = 8 + 4 * L + B.armory.power[ar] + (fav ? 5 : 0) + (tp.power || 0) + ((tp.powerAt && tp.powerAt[d.id]) || 0);
    const di = DATA.DEST_IDS.indexOf(d.id), base = s.lab.rescueBase[di];
    let rescue = clamp(base + s.lab.clinicRescue * cl + (tp.rescue || 0) + (nk === 'comeback' ? 0.05 : 0), 0, 0.95);
    if (base >= 1 || !s.flags.deathOn) rescue = 1;            // 6.3.3: the Allotments and before the third present person
    const weapon = B.armory.weapon[ar];
    const roleName = DATA.ROLE_STATS[role] ? DATA.ROLE_STATS[role].name.toUpperCase() : role;
    const roleLine = fav ? roleName + ' · +5 at the ' + d.name : role === 'medic' ? roleName + ' · medkit heals ' + Math.round(medkitHeal * 100) + ' %' : roleName;
    const ttl = role === 'sprinter' ? 'speed ' + speed : role === 'brawler' ? 'shove cooldowns ×' + shoveCdMul.toFixed(2)
      : role === 'marksman' ? 'aim assist ' + assist.toFixed(2) + ' · damage ×' + damageMul.toFixed(2)
      : role === 'medic' ? 'medkit ' + Math.round(medkitHeal * 100) + ' % in ' + medkitHealS + ' s' : 'flashlight ' + flashlightR + ' · horde warning +' + r1(0.2 * L) + ' s';
    return { maxHp, startHp, startHpFrac: hpFrac, secondWind, speed, shoveCdMul, assist, flashlightR, hordeWarnS, damageMul, medkitHeal, medkitHealS,
      pillsTemp, power, rescue, restMul: restMulOf(s, p), weapon, favoured: !!fav, shoveMul: role === 'brawler' ? 1 + 0.03 * L : 1,
      accAdd: (tr === 'steady' ? 6 : 0) + (role === 'marksman' ? L : 0), hordeMul: r2(d.dir.hordeMul * (tr === 'loud' ? DATA.TRAITS.loud.hordeMul : 1)),
      roleLine, ttlLine: 'In Two Thumbs Left: ' + ttl };
  }

  // ------------------------------------------------------------------ prices (5.6, 6.2, 6.6.2)
  const price = {
    skip: (sec, s) => skipPrice(sec, s),
    revive(s, personId) {
      const p = personById(s, personId); if (!p) return null;
      if (p.arrivedHow === 'stranger' && p.revives === 0) return { cans: RULES.strangerCans, sparks: RULES.strangerSparks, n: 0, stranger: true };
      const n = p.revives, esc = Math.pow(2, Math.min(n, s.lab.escalationCap)), m = s.lab.mul.revive;
      const clampC = Math.floor(RULES.reviveCapShare * capOf(s, 'cans') / 10) * 10;
      const cans = Math.min(Math.round((RULES.reviveCansA * p.lv * p.lv + RULES.reviveCansB) * esc * m), clampC);
      return { cans, sparks: Math.round((RULES.reviveSparksA + RULES.reviveSparksB * p.lv) * esc * m), n, stranger: false };
    },
    invite: (s) => RULES.inviteBase + RULES.invitePer * living(s).length,
    kit(destId) { const d = DEST[destId] || DATA.DESTS[0]; return { medkit: DATA.KIT.medkit * d.n, pills: DATA.KIT.pills * d.n, bomb: DATA.KIT.bomb * d.n }; },
  };
  function autoKit(s, destId) {                               // 6.2: medkit, pills, noise bomb while the total fits the cans held
    const pr = price.kit(destId), kit = { medkit: 0, pills: 0, bomb: 0, total: 0 };
    for (const k of DATA.KIT.order) {
      const open = k === 'bomb' ? armoryLv(s) >= 2 : clinicLv(s) >= 1;
      if (open && kit.total + pr[k] <= s.res.cans) { kit[k] = 1; kit.total += pr[k]; }
    }
    return kit;
  }

  // ------------------------------------------------------------------ what a Tower level opens (3.4.1, 3.7)
  function towerOpens(lv) {
    const out = [];
    for (const t of TYPES) {
      if (t === 'tower') continue;
      const cnt = B[t].count; let prev = 0;
      for (const [tw, c] of cnt) { if (tw === lv) for (let k = prev + 1; k <= c; k++) out.push({ kind: 'building', type: t, nth: k, text: ordinal(k) + B[t].name }); prev = c; }
    }
    for (const d of DATA.DESTS) if (d.tower === lv) out.push({ kind: 'dest', id: d.id, text: d.name });
    for (let r = 1; r <= EXP.maxRing; r++) if (EXP.tower[r] === lv) out.push({ kind: 'land', ring: r, text: 'land ' + (8 + 2 * r) + ' × ' + (8 + 2 * r) });
    if (DATA.TOWER.cranes[lv] > DATA.TOWER.cranes[lv - 1]) out.push({ kind: 'crane', text: ordinal(DATA.TOWER.cranes[lv]) + 'crane' });
    if (lv === RULES.crane4Tower) out.push({ kind: 'crane4', text: '4th crane for sale' });
    if (lv === RULES.strangerTower) out.push({ kind: 'stranger', text: 'a stranger at the gate' });
    if (lv === 10) out.push({ kind: 'finale', text: 'the gold bell' });
    return out;
  }

  // ------------------------------------------------------------------ jobs and cranes (5.3)
  function jobName(s, j) { const b = j.target ? byId(s, j.target) : null; return j.kind === 'expand' ? 'land' : b ? B[b.type].name : 'job'; }
  function jobView(s, j) {
    const left = Math.max(0, j.endMs - s.cityMs), dur = Math.max(1, j.endMs - j.startMs), b = j.target ? byId(s, j.target) : null;
    const pr = skipPrice(left / SEC, s), name = jobName(s, j);
    return { id: j.id, kind: j.kind, buildingId: j.target, type: b ? b.type : null, name, toLv: j.toLv, startMs: j.startMs, endMs: j.endMs,
      leftMs: left, progress: clamp(1 - left / dur, 0, 1), price: pr, free: pr === 0, confirm: pr >= DATA.SKIP.confirmAt,
      label: pr ? 'FINISH · ' + pr + ' ✦' : 'FINISH FREE' };
  }
  function soonestJob(s) { let j = null; for (const x of s.jobs) if (!j || x.endMs < j.endMs || (x.endMs === j.endMs && idNum(x.id) < idNum(j.id))) j = x; return j; }
  function startJob(s, kind, target, toLv, durMs, ev) {
    const j = { id: nid(s, 'j'), kind, target, toLv, startMs: s.cityMs, endMs: s.cityMs + Math.max(0, Math.round(durMs)) };
    s.jobs.push(j); s.tel.jobsStarted++;
    ev.push({ type: 'jobStarted', jobId: j.id, kind, buildingId: target, toLv });
    return j;
  }
  function dropRubble(s, ev) {                                // 3.2: the new ring's rubble from the city RNG, one glinting piece
    const lo = landLo(s), hi = landHi(s), tiles = [];
    for (let y = lo; y < hi; y++) for (let x = lo; x < hi; x++) if ((x === lo || y === lo || x === hi - 1 || y === hi - 1) && !isGate(s, x, y)) tiles.push([x, y]);
    const n = EXP.rubble[s.ring], gl = Math.floor(rand(s) * n), ids = [];
    let glintId = null;
    for (let i = 0; i < n && i < tiles.length; i++) {
      const k = i + Math.floor(rand(s) * (tiles.length - i)); const t = tiles[i]; tiles[i] = tiles[k]; tiles[k] = t;
      const r = { id: nid(s, 'r'), gx: tiles[i][0], gy: tiles[i][1], ring: s.ring, glint: i === gl };
      s.rubble.push(r); ids.push(r.id); if (r.glint) glintId = r.id;
    }
    return { ids, glintId };
  }
  function completeJob(s, j, ev) {
    const i = s.jobs.indexOf(j); if (i >= 0) s.jobs.splice(i, 1);
    const at = j.endMs; s.tel.jobsDone++;
    if (j.kind === 'expand') {
      if (s.ring >= EXP.maxRing) return;
      s.ring++;
      const r = dropRubble(s, ev), side = 8 + 2 * s.ring;
      ev.push({ type: 'jobDone', jobId: j.id, kind: 'expand', buildingId: null, buildingType: null, lv: s.ring, name: 'land' });
      ev.push({ type: 'expanded', ring: s.ring, side, rubble: r.ids, glintId: r.glintId });
      return;
    }
    const b = byId(s, j.target); if (!b) return;
    const from = b.lv;
    if (PRODUCERS[b.type]) rebase(s, b, at);                  // a level change re-bases the bubble (a new producer starts empty)
    b.lv = Math.max(b.lv, Math.min(B[b.type].max, j.toLv));
    ev.push({ type: 'jobDone', jobId: j.id, kind: j.kind, buildingId: b.id, buildingType: b.type, lv: b.lv, name: B[b.type].name });
    if (b.type === 'tower') {
      for (let L = from + 1; L <= b.lv; L++) {
        const sp = earn(s, DATA.TOWER.sparks[L], 'tower'), opens = towerOpens(L);
        s.tel.towerAtMs[L] = at;
        ev.push({ type: 'towerUp', lv: L, opens, sparks: sp, text: 'Bell Tower ' + L + (opens.length ? ' · new: ' + opens.map((o) => o.text).join(', ') : '') });
        if (L === 10) ev.push({ type: 'finale' });
      }
    } else if (b.type === 'inn') {
      if (from === 0) refreshInn(s, ev);                      // the first batch arrives when the level-1 job completes
      else if (s.inn.nextRefreshMs != null) s.inn.nextRefreshMs = Math.min(s.inn.nextRefreshMs, s.cityMs + innPeriod(s, b.lv));
    } else if (b.type === 'house') housePresent(s);
  }
  const innPeriod = (s, lv) => Math.round(B.inn.refresh[lv] * SEC * s.lab.mul.inn);
  function refreshInn(s, ev) {                                // each refresh replaces every traveler (3.4.7)
    const inn = innB(s);
    if (!inn || inn.lv < 1) { s.inn.travelers = []; s.inn.nextRefreshMs = null; return; }
    const n = B.inn.travelers[inn.lv], n2 = B.inn.level2[inn.lv];
    s.inn.travelers = [];
    for (let i = 0; i < n; i++) s.inn.travelers.push(genPerson(s, { lv: i < n2 ? 2 : 1, how: 'traveler' }));
    s.inn.nextRefreshMs = s.cityMs + innPeriod(s, inn.lv);
    ev.push({ type: 'innRefresh', n, travelers: s.inn.travelers.map((p) => p.id) });
  }
  function housePresent(s) { for (const p of s.people) if (p.houseId == null && (p.state === 'ready' || p.state === 'rest' || p.state === 'out')) assignHouse(s, p); }
  function fixBeds(s) {                                       // after a House lost a level (the Lab): the extras sleep on the bench
    let moved = 0;
    for (const h of s.buildings) if (h.type === 'house') {
      const res = s.people.filter((p) => p.state !== 'fallen' && p.houseId === h.id), beds = h.lv >= 1 ? B.house.beds[h.lv] : 0;
      for (const p of res.slice(beds)) { p.houseId = null; moved++; }
    }
    if (moved) housePresent(s);
    return moved;
  }
  function finishJob(s, j, pr, ev) {                          // pr sparks already checked
    if (pr > 0) { spend(s, pr, 'finish'); s.flags.paidSkip = true; }
    j.endMs = s.cityMs;
    ev.push({ type: 'finished', jobId: j.id, price: pr });
    completeJob(s, j, ev);
  }
  // A free crane, or with finishOther the job with the least time left finished at its skip price (3.5).
  function needCrane(s, a, ev) {
    if (cranesFree(s) > 0) return null;
    const j = soonestJob(s); if (!j) return { err: 'noCrane' };
    const pr = skipPrice((j.endMs - s.cityMs) / SEC, s);
    if (!a.finishOther) return { err: 'noCrane', data: { jobId: j.id, price: pr, label: 'Finish the ' + jobName(s, j) + ' now · ' + (pr ? pr + ' ✦' : 'free') } };
    if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
    finishJob(s, j, pr, ev);
    return null;
  }
  function hasWork(s) {                                       // anything left to build, upgrade or expand at this Tower level
    const T = towerLv(s), tw = towerB(s);
    if (T < 10 && tw && !jobFor(s, tw.id)) return true;
    if (s.ring < EXP.maxRing && T >= EXP.tower[s.ring + 1] && !s.jobs.some((j) => j.kind === 'expand')) return true;
    for (const t of TYPES) {
      if (t === 'tower') continue;
      if (ofType(s, t).length < allowedCount(s, t)) return true;
      for (const b of s.buildings) if (b.type === t && b.lv >= 1 && b.lv < B[t].max && b.lv + 1 <= T && !jobFor(s, b.id)) return true;
    }
    return false;
  }
  function candidates(s) {                                    // every job that could start now if paid for
    const c = [], T = towerLv(s), tw = towerB(s);
    if (tw && T < 10 && !jobFor(s, tw.id)) c.push(Object.assign({ kind: 'upgrade', type: 'tower', id: tw.id, toLv: T + 1 }, costOf(s, 'tower', T + 1)));
    if (s.ring < EXP.maxRing && T >= EXP.tower[s.ring + 1] && !s.jobs.some((j) => j.kind === 'expand')) c.push({ kind: 'expand', type: null, id: null, toLv: s.ring + 1, res: 'bricks', n: expandCost(s, s.ring + 1) });
    for (const t of TYPES) {
      if (t === 'tower') continue;
      if (ofType(s, t).length < allowedCount(s, t)) c.push(Object.assign({ kind: 'build', type: t, id: null, toLv: 1 }, costOf(s, t, 1)));
      for (const b of s.buildings) if (b.type === t && b.lv >= 1 && b.lv < B[t].max && b.lv + 1 <= T && !jobFor(s, b.id)) c.push(Object.assign({ kind: 'upgrade', type: t, id: b.id, toLv: b.lv + 1 }, costOf(s, t, b.lv + 1)));
    }
    return c;
  }
  function canDoSomething(s) {                                // the "nothing to do" telemetry (9): nobody can go and nothing affordable
    if (!s.pending && s.people.some((p) => p.state === 'ready' || p.state === 'rest')) return true;
    if (cranesFree(s) < 1) return false;
    return candidates(s).some((c) => c.n <= s.res[c.res]);
  }

  // ------------------------------------------------------------------ the city clock (5.1): event-stepped
  function accrue(s, dt, source) {
    if (!(dt > 0)) return;
    const c = cranesTotal(s), busy = Math.min(c, s.jobs.length), work = hasWork(s);
    if (!(towerLv(s) >= 10 && !work && busy === 0)) {
      s.tel.craneMs += c * dt; s.tel.craneBusyMs += busy * dt;
      const idle = (c - busy) * dt;
      if (idle > 0) { if (!work) s.tel.idleGatedMs += idle; else if (source === 'frame') s.tel.idleOnMs += idle; else s.tel.idleOffMs += idle; }
    }
    if (source === 'frame') { s.tel.onlineMs += dt; if (!canDoSomething(s)) s.tel.nothingMs += dt; }
  }
  function placeWaitingGraves(s, ev) {
    for (const g of s.graves) if (g.gx == null) {
      const st = graveStart(s, g.houseId), spot = spotFrom(s, st.gx, st.gy);
      if (!spot) return;
      g.gx = spot.gx; g.gy = spot.gy; g.placedMs = s.cityMs;
      ev.push({ type: 'gravePlaced', graveId: g.id, personId: g.personId, gx: g.gx, gy: g.gy });
    }
  }
  function checkStranger(s, ev) {                             // 6.6.6: the first moment Tower >= 3 and a bed is free
    if (s.flags.strangerDone || towerLv(s) < RULES.strangerTower || living(s).length >= bedsOf(s)) return;
    const p = genPerson(s, { lv: RULES.strangerLv, how: 'stranger' });
    setDown(s, p); p.fellNight = s.night;
    s.people.push(p); s.flags.strangerDone = true; s.tel.strangerAtMs = s.cityMs;
    ev.push({ type: 'stranger', personId: p.id });
  }
  function checkDrifter(s, ev) {                              // 4.11: nobody present -> a free L1 drifter walks in, ignoring beds
    if (present(s).length > 0) return;
    const p = genPerson(s, { lv: 1, how: 'drifter' });
    s.people.push(p); assignHouse(s, p); s.tel.drifters++;
    ev.push({ type: 'drifter', personId: p.id });
  }
  function checkDeathOn(s, ev) { if (!s.flags.deathOn && present(s).length >= 3) { s.flags.deathOn = true; ev.push({ type: 'deathOn' }); } }
  // Everything due at s.cityMs, then the state-based rules. Idempotent: calling it twice at one time changes nothing.
  function settle(s, ev) {
    for (let guard = 0; guard < 1000; guard++) {
      let j = null;
      for (const x of s.jobs) if (x.endMs <= s.cityMs && (!j || x.endMs < j.endMs || (x.endMs === j.endMs && idNum(x.id) < idNum(j.id)))) j = x;
      if (!j) break;
      completeJob(s, j, ev);
    }
    for (const p of s.people.slice()) {
      if (p.state === 'rest' && p.restUntilMs <= s.cityMs) { p.state = 'ready'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; ev.push({ type: 'rested', personId: p.id, early: false }); }
      else if (p.state === 'down' && p.downUntilMs <= s.cityMs) fall(s, p, 'expired', ev);
    }
    if (s.inn.nextRefreshMs != null && s.inn.nextRefreshMs <= s.cityMs) refreshInn(s, ev);
    placeWaitingGraves(s, ev);
    housePresent(s);
    checkStranger(s, ev);
    checkDrifter(s, ev);
    checkDeathOn(s, ev);
    checkGoals(s, ev);
  }
  function nextDue(s, limit) {
    let next = limit;
    for (const j of s.jobs) if (j.endMs < next) next = j.endMs;
    for (const p of s.people) {
      if (p.state === 'rest' && p.restUntilMs < next) next = p.restUntilMs;
      else if (p.state === 'down' && p.downUntilMs < next) next = p.downUntilMs;
    }
    if (s.inn.nextRefreshMs != null && s.inn.nextRefreshMs < next) next = s.inn.nextRefreshMs;
    for (const b of s.buildings) { const f = fillMs(s, b); if (f != null && f > s.cityMs && f < next) next = f; }
    return Math.max(next, s.cityMs);
  }
  function advance(s, ms, ctx) {
    const source = (ctx && ctx.source) || 'dev', ev = [];
    ms = Math.max(0, Math.round(fin(ms, 0)));
    const target = s.cityMs + ms;
    settle(s, ev);                                            // state-based rules first, at the current time
    for (let guard = 0; guard < 2000000; guard++) {
      const next = nextDue(s, target), t0 = s.cityMs;
      accrue(s, next - t0, source);
      s.cityMs = next;
      for (const b of s.buildings) { const f = fillMs(s, b); if (f != null && f > t0 && f <= next) ev.push({ type: 'bubbleFull', buildingId: b.id, res: PRODUCERS[b.type], at: f }); }
      settle(s, ev);
      if (s.cityMs >= target) break;
    }
    return ev;
  }
  function tick(s, realDeltaMs, realNow) {
    let d;
    if (typeof realNow === 'number' && isFinite(realNow)) {
      realNow = Math.round(realNow);
      const gap = realNow - s.realLast;
      if (gap > RULES.offlineMinS * SEC) { const r = resume(s, realNow); return [{ type: 'offline', ms: r.creditedMs, welcome: r.welcome }].concat(r.events); }
      if (gap < 0) { s.realLast = realNow; return []; }
      d = gap; s.realLast = realNow;
    } else d = Math.max(0, Math.round(fin(realDeltaMs, 0)));
    if (s.pending && s.pending.source === 'sim') return [];   // the clock waits for a simulated run's result
    const ms = Math.round(Math.min(d, RULES.frameClampMs) * s.lab.timeScale);
    return ms > 0 ? advance(s, ms, { source: 'frame' }) : [];
  }
  function resume(s, realNow) {
    realNow = Math.round(fin(realNow, s.realLast));
    const gap = realNow - s.realLast;
    if (gap < 0) { s.realLast = realNow; return { creditedMs: 0, rollback: true, events: [], welcome: null }; }
    s.realLast = realNow;
    if (gap <= RULES.offlineMinS * SEC) return { creditedMs: 0, rollback: false, events: [], welcome: null };
    const credit = Math.min(gap, RULES.offlineCapS * SEC);
    const events = advance(s, credit, { source: 'offline' });
    return { creditedMs: credit, rollback: false, events, welcome: credit >= RULES.welcomeMinS * SEC ? welcome(s, events, credit) : null };
  }
  // 5.5: up to 6 rows, most important first, then "and N more". Nothing is collected or decided for the player.
  function welcome(s, events, ms) {
    const rows = [];
    for (const p of s.people) if (p.state === 'down') {
      const left = fmtHoursLeft(p.downUntilMs - s.cityMs);
      rows.push({ kind: 'down', personId: p.id, action: 'decide', text: (p.arrivedHow === 'stranger' && p.revives === 0 ? 'A stranger lies Down at the gate' : p.first + ' is Down') + ' · ' + left + ' to decide' });
    }
    for (const e of events) if (e.type === 'downExpired') { const p = personById(s, e.personId); rows.push({ kind: 'expired', personId: e.personId, graveId: e.graveId, text: (p ? p.first : 'Someone') + '’s day ran out. ' + e.where }); }
    for (const e of events) {
      if (e.type === 'towerUp') rows.push({ kind: 'job', text: e.text });
      else if (e.type === 'jobDone') {
        if (e.kind === 'expand') rows.push({ kind: 'job', text: 'Land ' + (8 + 2 * e.lv) + ' × ' + (8 + 2 * e.lv) + ' is ready' });
        else if (e.buildingId && byId(s, e.buildingId) && byId(s, e.buildingId).type !== 'tower') rows.push({ kind: 'job', buildingId: e.buildingId, text: e.kind === 'build' ? e.name + ' built' : e.name + ' ' + e.lv + ' finished' });
      }
    }
    let wb = 0, wc = 0;
    for (const b of s.buildings) { const v = bubbleView(s, b); if (v) { if (v.res === 'bricks') wb += v.whole; else wc += v.whole; } }
    if (wb + wc > 0) rows.push({ kind: 'bubbles', text: 'Waiting: ' + [wb ? fmtNum(wb) + ' bricks' : '', wc ? fmtNum(wc) + ' cans' : ''].filter(Boolean).join(' · ') });
    const rested = []; for (const e of events) if (e.type === 'rested') { const p = personById(s, e.personId); if (p && p.state === 'ready' && !rested.includes(p.first)) rested.push(p.first); }
    if (rested.length) rows.push({ kind: 'people', text: joinNames(rested) + (rested.length > 1 ? ' are rested.' : ' is rested.') });
    for (const e of events) if (e.type === 'drifter') { const p = personById(s, e.personId); if (p) rows.push({ kind: 'people', personId: p.id, text: p.first + ' drifted in at the gate.' }); }
    let inn = null; for (const e of events) if (e.type === 'innRefresh') inn = e;
    if (inn) rows.push({ kind: 'inn', text: inn.n + ' new traveler' + (inn.n === 1 ? '' : 's') + ' at the Inn.' });
    return { ms, title: 'WHILE YOU WERE AWAY · ' + fmtDur(ms / SEC), rows: rows.slice(0, 6), more: Math.max(0, rows.length - 6) };
  }

  // ------------------------------------------------------------------ goals (7.2)
  function goalDone(s, key) {
    const [k, a, b] = key.split(':');
    if (k === 'build') return maxLvOf(s, a) >= +b;
    if (k === 'count') return countBuilt(s, a) >= +b;
    if (k === 'tower') return towerLv(s) >= +a;
    if (k === 'win') { const i = DATA.DEST_IDS.indexOf(a); return DATA.DEST_IDS.some((id, j) => j >= i && s.dest[id].cleared); }   // C1: there or harder
    if (k === 'people') return living(s).length >= +a;
    if (k === 'expand') return s.ring >= +a;
    if (k === 'skip') return !!s.flags.paidSkip;
    return false;
  }
  function checkGoals(s, ev) {
    while (s.goal < GOALS.length && goalDone(s, GOALS[s.goal][0])) {
      const [key, rw, text] = GOALS[s.goal], paid = {};
      for (const k of Object.keys(rw)) paid[k] = k === 'sparks' ? earn(s, rw[k], 'goals') : gain(s, k, rw[k], 'goal');
      s.goal++;
      ev.push({ type: 'goal', step: s.goal, key, text, reward: paid });
    }
  }
  function bestOpenDest(s) { let d = DATA.DESTS[0]; for (const x of DATA.DESTS) if (destOpen(s, x)) d = x; return d; }
  function depotTarget(s) {                                   // C2: storage is never an invisible wall
    if (ofType(s, 'depot').length < allowedCount(s, 'depot')) return { kind: 'build', type: 'depot' };
    const T = towerLv(s), d = ofType(s, 'depot').filter((b) => b.lv >= 1 && b.lv < B.depot.max && b.lv + 1 <= T).sort((a, b) => a.lv - b.lv)[0];
    if (d) return { kind: 'building', id: d.id };
    const busy = ofType(s, 'depot').find((b) => jobFor(s, b.id));
    return busy ? { kind: 'building', id: busy.id } : allowedCount(s, 'depot') ? { kind: 'building', id: towerB(s).id } : { kind: 'build', type: 'depot' };
  }
  // The ETA of a cost: "ready now", "in 4:12" (production covers it), "≈ 2 runs", "needs a bigger Depot".
  function costEta(s, res, cost, target) {
    const held = s.res[res], progress = cost > 0 ? clamp(held / cost, 0, 1) : 1;
    if (cost > capOf(s, res)) return { eta: 'needs a bigger Depot', mins: Infinity, progress, target: depotTarget(s) };
    if (held >= cost) {
      if (cranesFree(s) > 0) return { eta: 'ready now', mins: 0, progress, target };
      const j = soonestJob(s), left = (j.endMs - s.cityMs) / SEC;
      return { eta: 'in ' + fmtClock(left), mins: left / 60, progress, target };
    }
    const short = cost - held;
    let bub = 0, fullest = null;
    for (const b of s.buildings) if (PRODUCERS[b.type] === res && b.lv >= 1) { const a = Math.floor(bubbleAt(s, b)); bub += a; if (!fullest || a > fullest.a) fullest = { a, id: b.id }; }
    if (bub >= short) return { eta: 'ready now', mins: 0, progress, target: { kind: 'collect', id: fullest.id } };
    const rate = rateOf(s, res) / HOUR, tProd = rate > 0 ? (short - bub) / rate : Infinity;
    const d = bestOpenDest(s), per = (res === 'bricks' ? d.bricks : d.cans) * lootMul(s), runs = Math.ceil((short - bub) / Math.max(1, per));
    if (tProd <= 30 * MIN) return { eta: 'in ' + fmtClock(tProd / SEC), mins: tProd / MIN, progress, target };
    if (runs <= 3) return { eta: '≈ ' + runs + (runs === 1 ? ' run' : ' runs'), mins: 0, progress, target };
    if (!isFinite(tProd)) return { eta: res === 'bricks' ? 'needs a Kiln' : 'needs a Cannery', mins: Infinity, progress, target: { kind: 'build', type: res === 'bricks' ? 'kiln' : 'cannery' } };
    return { eta: 'in ' + fmtClock(tProd / SEC), mins: tProd / MIN, progress, target };
  }
  const jobEta = (s, j, target) => ({ eta: 'in ' + fmtClock((j.endMs - s.cityMs) / SEC), mins: (j.endMs - s.cityMs) / MIN, progress: jobView(s, j).progress, target: target || { kind: 'job', id: j.id } });
  const needTower = (s, n, target) => ({ eta: 'needs Tower ' + n, mins: Infinity, progress: 0, target: target || { kind: 'building', id: towerB(s).id } });
  function sideTask(s, res) {
    const fc = cranesFree(s) > 0, up = fc ? candidates(s).filter((c) => c.kind === 'upgrade' && c.type !== 'tower' && c.n <= s.res[c.res]).sort((a, b) => a.n - b.n || idNum(a.id) - idNum(b.id))[0] : null;
    if (up) return { text: 'Meanwhile: upgrade ' + (B[up.type].name === 'Inn' ? 'the Inn' : 'a ' + B[up.type].name), target: { kind: 'building', id: up.id } };
    const d = bestOpenDest(s), loot = Math.round((res === 'cans' ? d.cans : d.bricks) * lootMul(s));
    return { text: 'Meanwhile: a run at the ' + d.name + ' · ~' + fmtNum(loot) + ' ' + (res === 'cans' ? 'cans' : 'bricks'), target: { kind: 'dest', destId: d.id } };
  }
  function goal(s) {
    if (s.goal >= GOALS.length) {
      const fc = cranesFree(s) > 0, up = fc ? candidates(s).filter((c) => c.kind === 'upgrade' && c.n <= s.res[c.res]).sort((a, b) => a.n - b.n)[0] : null;
      const noNick = living(s).find((p) => !p.nick);
      const side = up ? { text: 'Max a building: upgrade ' + (up.type === 'inn' ? 'the Inn' : 'a ' + B[up.type].name), target: { kind: 'building', id: up.id } }
        : noNick ? { text: 'A nickname for everyone: ' + noNick.first + ' has none yet', target: { kind: 'person', id: noNick.id } }
        : { text: 'A run at the Ferry Terminal', target: { kind: 'dest', destId: 'D6' } };
      return { step: GOALS.length + 1, key: 'done', text: 'Bellhaven is whole.', reward: {}, eta: side.text, progress: 1, side, target: side.target, done: true };
    }
    const [key, reward, text] = GOALS[s.goal], [k, a, b] = key.split(':'), T = towerLv(s);
    let r, res = 'bricks';
    if (k === 'build' || k === 'count') {
      res = B[a].cur;
      const all = ofType(s, a), built = all.filter((x) => x.lv >= 1);
      const buildJob = s.jobs.find((j) => j.kind === 'build' && all.some((x) => x.id === j.target));
      if (k === 'count' || !built.length) {               // a new one is needed (or under way)
        if (buildJob) r = jobEta(s, buildJob, { kind: 'building', id: buildJob.target });
        else if (all.length < allowedCount(s, a)) { const c = costOf(s, a, 1); r = costEta(s, c.res, c.n, { kind: 'build', type: a }); }
        else r = needTower(s, countTower(a, all.length) || T + 1);
      } else {                                            // the highest one goes up a level
        const top = built.slice().sort((x, y) => y.lv - x.lv || idNum(x.id) - idNum(y.id))[0], j = jobFor(s, top.id);
        if (j) r = jobEta(s, j, { kind: 'building', id: top.id });
        else if (top.lv + 1 > T) r = needTower(s, top.lv + 1);
        else { const c = costOf(s, a, top.lv + 1); r = costEta(s, c.res, c.n, { kind: 'building', id: top.id }); }
      }
    } else if (k === 'tower') {
      const tw = towerB(s), j = jobFor(s, tw.id);
      r = j ? jobEta(s, j, { kind: 'building', id: tw.id }) : costEta(s, 'bricks', costOf(s, 'tower', T + 1).n, { kind: 'building', id: tw.id });
    } else if (k === 'expand') {
      const j = s.jobs.find((x) => x.kind === 'expand');
      r = j ? jobEta(s, j, { kind: 'expand' }) : s.ring >= EXP.maxRing ? { eta: 'ready now', mins: 0, progress: 1, target: { kind: 'expand' } }
        : T < EXP.tower[s.ring + 1] ? needTower(s, EXP.tower[s.ring + 1]) : costEta(s, 'bricks', expandCost(s, s.ring + 1), { kind: 'expand' });
    } else if (k === 'win') {
      const d = DEST[a], lock = destLock(s, d);
      if (lock) r = lock.startsWith('Tower') ? needTower(s, d.tower, { kind: 'dest', destId: d.id }) : { eta: 'needs the Clinic', mins: Infinity, progress: 0, target: clinicLv(s) ? { kind: 'dest', destId: d.id } : { kind: 'build', type: 'clinic' } };
      else { const hint = oddsHint(s, d.id); r = { eta: '1 run' + (hint ? ' · HOME ' + fmtPct(hint.home) : ''), mins: 0, progress: 0, target: { kind: 'dest', destId: d.id } }; }
    } else if (k === 'people') {
      res = 'cans';
      const inn = innB(s), L = living(s).length, n = +a;
      if (!inn) r = allowedCount(s, 'inn') ? Object.assign(costEta(s, 'cans', costOf(s, 'inn', 1).n, { kind: 'build', type: 'inn' }), { eta: 'needs the Inn' }) : needTower(s, countTower('inn', 0));
      else if (inn.lv < 1) { const j = jobFor(s, inn.id); r = j ? jobEta(s, j, { kind: 'building', id: inn.id }) : { eta: 'needs the Inn', mins: Infinity, progress: 0, target: { kind: 'building', id: inn.id } }; }
      else if (L >= bedsOf(s)) {
        const h = ofType(s, 'house').find((x) => x.lv >= 1 && x.lv < B.house.max && x.lv + 1 <= T && !jobFor(s, x.id));
        r = { eta: 'needs a free bed', mins: Infinity, progress: L / n, target: ofType(s, 'house').length < allowedCount(s, 'house') ? { kind: 'build', type: 'house' } : h ? { kind: 'building', id: h.id } : { kind: 'building', id: inn.id } };
      } else if (!s.inn.travelers.length) r = { eta: 'in ' + fmtClock((s.inn.nextRefreshMs - s.cityMs) / SEC), mins: (s.inn.nextRefreshMs - s.cityMs) / MIN, progress: L / n, target: { kind: 'building', id: inn.id } };
      else { r = costEta(s, 'cans', price.invite(s), { kind: 'building', id: inn.id }); r.progress = L / n; }
    } else if (k === 'skip') {
      const j = s.jobs.find((x) => x.endMs - s.cityMs > s.lab.freeSec * SEC), p = s.people.find((x) => x.state === 'rest' && x.restUntilMs - s.cityMs > s.lab.freeSec * SEC);
      const inn = innB(s), innT = inn && inn.lv >= 1 && s.inn.nextRefreshMs != null && s.inn.nextRefreshMs - s.cityMs > s.lab.freeSec * SEC;
      r = j ? { eta: 'ready now', mins: 0, progress: 0, target: { kind: 'job', id: j.id } } : p ? { eta: 'ready now', mins: 0, progress: 0, target: { kind: 'person', id: p.id } }
        : innT ? { eta: 'ready now', mins: 0, progress: 0, target: { kind: 'building', id: inn.id } } : { eta: 'start a job longer than a minute', mins: Infinity, progress: 0, target: null };
    } else r = { eta: '', mins: 0, progress: 0, target: null };
    const side = r.mins > 30 && k !== 'skip' ? sideTask(s, res) : null;
    return { step: s.goal + 1, key, text, reward, eta: r.eta, progress: clamp(fin(r.progress, 0), 0, 1), side, target: r.target, done: false };
  }

  // ------------------------------------------------------------------ actions
  function placeDecor(s, a, ev) {
    const D = DATA.DECOR[a.kind];
    if (towerLv(s) < D.tower) return { err: 'locked', data: { needTower: D.tower } };
    const cp = canPlace(s, 'decor', a.gx, a.gy); if (!cp.ok) return { err: 'blocked', data: { reason: cp.reason } };
    const n = Math.round(D.cost * s.lab.mul.cost); if (s.res.bricks < n) return { err: 'cost', data: { res: 'bricks', need: n - s.res.bricks } };
    s.res.bricks -= n;
    const d = { id: nid(s, 'd'), type: a.kind, gx: a.gx, gy: a.gy }; s.decor.push(d);
    ev.push({ type: 'placed', decorId: d.id, buildingType: a.kind });
    return { data: { decorId: d.id } };
  }
  const ACTIONS = {
    collect(s, a, ev) {
      const b = byId(s, a.id); if (!b || !PRODUCERS[b.type]) return { err: 'notFound' };
      if (b.lv < 1) return { err: 'state' };
      const res = PRODUCERS[b.type], amt = bubbleAt(s, b), room = Math.max(0, capOf(s, res) - s.res[res]);
      const take = Math.floor(Math.min(amt, room));
      if (take > 0) { s.res[res] += take; rebase(s, b, s.cityMs, amt - take); if (res === 'bricks') s.tel.bricksProd += take; else s.tel.cansProd += take; }
      const overflow = Math.max(0, Math.floor(amt) - take);
      ev.push({ type: 'collected', buildingId: b.id, res, n: take, overflow: take < Math.floor(amt) ? overflow : 0 });
      return { data: { n: take, overflow } };
    },
    place(s, a, ev) {
      if (DATA.DECOR[a.kind]) return placeDecor(s, a, ev);
      const t = a.kind; if (!B[t] || t === 'tower') return { err: 'notFound' };
      const have = ofType(s, t).length;
      if (have >= allowedCount(s, t)) return have >= maxCount(t) ? { err: 'max' } : { err: 'locked', data: { needTower: countTower(t, have) } };
      const cp = canPlace(s, t, a.gx, a.gy); if (!cp.ok) return { err: 'blocked', data: { reason: cp.reason } };
      const c = costOf(s, t, 1); if (s.res[c.res] < c.n) return { err: 'cost', data: { res: c.res, need: c.n - s.res[c.res] } };
      const cr = needCrane(s, a, ev); if (cr) return cr;
      s.res[c.res] -= c.n;
      const b = { id: nid(s, 'b'), type: t, lv: 0, gx: a.gx, gy: a.gy };
      if (t === 'house') b.houseIdx = ofType(s, 'house').length;
      if (PRODUCERS[t]) { b.bubbleBase = 0; b.bubbleSinceMs = s.cityMs; }
      s.buildings.push(b);
      const j = startJob(s, 'build', b.id, 1, jobMs(s, t, 1), ev);
      ev.push({ type: 'placed', buildingId: b.id, buildingType: t, jobId: j.id });
      return { data: { buildingId: b.id, jobId: j.id } };
    },
    upgrade(s, a, ev) {
      const b = byId(s, a.id); if (!b) return { err: 'notFound' };
      if (b.lv < 1 || jobFor(s, b.id)) return { err: 'busy' };
      if (b.lv >= B[b.type].max) return { err: 'max' };
      if (b.type !== 'tower' && b.lv + 1 > towerLv(s)) return { err: 'locked', data: { needTower: b.lv + 1 } };
      const c = costOf(s, b.type, b.lv + 1); if (s.res[c.res] < c.n) return { err: 'cost', data: { res: c.res, need: c.n - s.res[c.res] } };
      const cr = needCrane(s, a, ev); if (cr) return cr;
      if (jobFor(s, b.id)) return { err: 'busy' };
      s.res[c.res] -= c.n;
      const j = startJob(s, 'upgrade', b.id, b.lv + 1, jobMs(s, b.type, b.lv + 1), ev);
      return { data: { jobId: j.id } };
    },
    expand(s, a, ev) {
      if (s.ring >= EXP.maxRing) return { err: 'max' };
      const r = s.ring + 1;
      if (towerLv(s) < EXP.tower[r]) return { err: 'locked', data: { needTower: EXP.tower[r] } };
      if (s.jobs.some((j) => j.kind === 'expand')) return { err: 'busy' };
      const n = expandCost(s, r); if (s.res.bricks < n) return { err: 'cost', data: { res: 'bricks', need: n - s.res.bricks } };
      const cr = needCrane(s, a, ev); if (cr) return cr;
      if (s.ring + 1 !== r) return { err: 'state' };
      s.res.bricks -= n;
      const j = startJob(s, 'expand', null, r, expandMs(s, r), ev);
      return { data: { jobId: j.id } };
    },
    clearRubble(s, a, ev) {
      const r = s.rubble.find((x) => x.id === a.id); if (!r) return { err: 'notFound' };
      const n = clearCost(s, r.ring); if (s.res.bricks < n) return { err: 'cost', data: { res: 'bricks', need: n - s.res.bricks } };
      s.res.bricks -= n; s.rubble.splice(s.rubble.indexOf(r), 1);
      const sp = r.glint ? earn(s, EXP.glint, 'rubble') : 0;
      ev.push({ type: 'rubbleCleared', rubbleId: r.id, sparks: sp, gx: r.gx, gy: r.gy });
      return { data: { sparks: sp } };
    },
    move(s, a, ev) {
      const t = isObj(a.target) ? a.target : {};
      const list = t.kind === 'building' ? s.buildings : t.kind === 'grave' ? s.graves : t.kind === 'decor' ? s.decor : null;
      if (!list) return { err: 'notFound' };
      const o = list.find((x) => x.id === t.id); if (!o) return { err: 'notFound' };
      const cp = canPlace(s, t.kind === 'building' ? o.type : t.kind, a.gx, a.gy, o.id); if (!cp.ok) return { err: 'blocked', data: { reason: cp.reason } };
      const was = o.gx == null;
      o.gx = a.gx; o.gy = a.gy;
      if (t.kind === 'grave' && was) o.placedMs = s.cityMs;
      ev.push({ type: 'moved', kind: t.kind, id: o.id, gx: o.gx, gy: o.gy });
      return { data: { gx: o.gx, gy: o.gy } };
    },
    finish(s, a, ev) {
      const j = s.jobs.find((x) => x.id === a.jobId); if (!j) return { err: 'notFound' };
      const pr = skipPrice((j.endMs - s.cityMs) / SEC, s);
      if (pr >= DATA.SKIP.confirmAt && !a.confirm) return { err: 'confirm', data: { price: pr } };
      if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
      finishJob(s, j, pr, ev);
      return { data: { price: pr } };
    },
    restNow(s, a, ev) {
      const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
      if (p.state !== 'rest') return { err: 'state' };
      const pr = skipPrice((p.restUntilMs - s.cityMs) / SEC, s);
      if (pr >= DATA.SKIP.confirmAt && !a.confirm) return { err: 'confirm', data: { price: pr } };
      if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
      if (pr > 0) { spend(s, pr, 'restNow'); s.flags.paidSkip = true; }
      p.state = 'ready'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0;
      ev.push({ type: 'rested', personId: p.id, early: true, price: pr });
      return { data: { price: pr } };
    },
    innNow(s, a, ev) {
      const inn = innB(s); if (!inn) return { err: 'notFound' };
      if (inn.lv < 1 || s.inn.nextRefreshMs == null) return { err: 'state' };
      const pr = skipPrice((s.inn.nextRefreshMs - s.cityMs) / SEC, s);
      if (pr >= DATA.SKIP.confirmAt && !a.confirm) return { err: 'confirm', data: { price: pr } };
      if (s.res.sparks < pr) return { err: 'cost', data: { res: 'sparks', need: pr - s.res.sparks } };
      if (pr > 0) { spend(s, pr, 'innNow'); s.flags.paidSkip = true; }
      refreshInn(s, ev);
      return { data: { price: pr } };
    },
    buyCrane(s, a, ev) {
      if (s.crane4) return { err: 'max' };
      if (towerLv(s) < RULES.crane4Tower) return { err: 'locked', data: { needTower: RULES.crane4Tower } };
      if (s.res.sparks < RULES.crane4) return { err: 'cost', data: { res: 'sparks', need: RULES.crane4 - s.res.sparks } };
      spend(s, RULES.crane4, 'crane'); s.crane4 = true;
      ev.push({ type: 'craneBought' });
      return {};
    },
    claimPack(s, a, ev) {                                     // 8.12: a free, clearly labelled prototype test pack (dev-tagged)
      if (!PACKS.includes(a.size)) return { err: 'notFound' };
      earn(s, a.size, 'pack'); s.tel.packs++;
      ev.push({ type: 'packClaimed', size: a.size });
      return {};
    },
    flag(s, a) { if (!UI_FLAGS.includes(a.name)) return { err: 'notFound' }; s.flags[a.name] = a.value !== false; return {}; },
    setLastDest(s, a) { if (!DEST[a.destId]) return { err: 'notFound' }; s.lastDest = a.destId; return {}; },
    dev(s, a, ev) { return devOp(s, a, ev); },
    // invite, startRun, resolveRun, revive, goodbye: RUN_ACTIONS below (the people and runs)
  };

  function act(s, a, realNow) {
    if (typeof realNow === 'number' && isFinite(realNow)) s.realLast = Math.round(realNow);
    const ev = [];
    if (!isObj(a) || typeof a.type !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, a.type)) return { ok: false, err: 'notFound', events: ev };
    const r = ACTIONS[a.type](s, a, ev, realNow) || {};
    if (r.err) return { ok: false, err: r.err, events: ev, data: r.data };
    settle(s, ev);
    return { ok: true, events: ev, data: r.data };
  }

  // ------------------------------------------------------------------ the Lab (9): every control that changes state
  function labRange(key) { return DATA.LAB_RANGE[key]; }
  function devOp(s, a, ev) {
    const L = s.lab, op = a.op, v = a.value;
    const pick = (list) => (list.includes(v) ? v : null);
    ev.push({ type: 'dev', op });
    switch (op) {
      case 'timeScale': { const x = pick(labRange('timeScale')); if (x == null) return { err: 'notFound' }; L.timeScale = x; return {}; }
      case 'skipAhead': {
        const ms = Math.round(clamp(fin(a.ms, 0), 0, RULES.offlineCapS * SEC));
        const e2 = advance(s, ms, { source: 'dev' }); for (const e of e2) ev.push(e);
        return { data: { welcome: welcome(s, e2, ms) } };
      }
      case 'runsAdvanceClock': L.runsAdvanceClock = v !== false; return {};
      case 'runWarp': L.runWarp = v == null || v === false ? 0 : clampInt(v, 0, 20, 6); return {};
      case 'grant': {
        const what = a.what;
        if (what === 'sparks') { earn(s, Math.round(fin(a.n, 100)), 'lab'); return {}; }
        if (what !== 'bricks' && what !== 'cans') return { err: 'notFound' };
        return { data: { n: gain(s, what, fin(a.n, 1000), 'dev') } };
      }
      case 'fillBubbles': for (const b of s.buildings) if (PRODUCERS[b.type] && b.lv >= 1) rebase(s, b, s.cityMs, holdLv(s, b.type, b.lv)); return {};
      case 'finishAll': {
        for (const j of s.jobs.slice().sort((x, y) => x.endMs - y.endMs || idNum(x.id) - idNum(y.id))) { j.endMs = s.cityMs; completeJob(s, j, ev); }
        for (const p of s.people) if (p.state === 'rest') { p.state = 'ready'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; ev.push({ type: 'rested', personId: p.id, early: true }); }
        if (innB(s) && innB(s).lv >= 1) refreshInn(s, ev);
        return {};
      }
      case 'setTower': {
        const lv = clampInt(a.lv, 1, 10, 1), tw = towerB(s);
        for (const j of s.jobs.slice()) {
          const b = j.target ? byId(s, j.target) : null;
          if ((b && b.type === 'tower') || (b && j.toLv > lv) || (j.kind === 'expand' && EXP.tower[j.toLv] > lv)) s.jobs.splice(s.jobs.indexOf(j), 1);
        }
        const from = tw.lv; tw.lv = lv;
        for (const b of s.buildings) if (b.type !== 'tower' && b.lv > lv) { if (PRODUCERS[b.type]) rebase(s, b, s.cityMs); b.lv = lv; }
        fixBeds(s);
        for (let k = from + 1; k <= lv; k++) { if (s.tel.towerAtMs[k] == null) s.tel.towerAtMs[k] = s.cityMs; ev.push({ type: 'towerUp', lv: k, opens: towerOpens(k), sparks: 0, text: 'Bell Tower ' + k }); }
        if (lv === 10 && from < 10) ev.push({ type: 'finale' });
        return {};
      }
      case 'clearRubble': s.rubble = []; return {};
      case 'force': { const x = pick(labRange('force')); if (x == null) return { err: 'notFound' }; L.force = x; return {}; }
      case 'runScreenS': { const x = pick(labRange('runScreenS')); if (x == null) return { err: 'notFound' }; L.runScreenS = x; return {}; }
      case 'lockSeed': L.lockSeed = v == null || v === false ? null : uint(v, null); return {};
      case 'forcedWins': s.forcedWins = clampInt(v, 0, 2, 0); return {};
      case 'waitReal': L.waitReal = !!v; return {};
      case 'mul': {
        const rg = DATA.LAB_RANGE.mul[a.key]; if (!rg) return { err: 'notFound' };
        const x = clamp(fin(v, 1), rg[0], rg[1]);
        if (a.key === 'prod') for (const b of s.buildings) if (PRODUCERS[b.type] && b.lv >= 1) rebase(s, b, s.cityMs);   // 5.2
        L.mul[a.key] = x;
        return { data: { dataRule: a.key === 'cost' ? DATA.assertData(x) : [] } };
      }
      case 'rescueBase': { const i = DATA.DEST_IDS.indexOf(a.destId); if (i < 1) return { err: 'notFound' }; L.rescueBase[i] = clamp(fin(v, L.rescueBase[i]), 0, 1); return {}; }
      case 'set': {
        const k = a.key, rg = DATA.LAB_RANGE[k];
        if (k === 'reducedMotion') { L.reducedMotion = v === true ? true : v === false ? false : null; return {}; }
        if (!rg || !['clinicRescue', 'tiredFloor', 'escalationCap', 'downWindowMs', 'freeSec', 'skipExp', 'skipK'].includes(k)) return { err: 'notFound' };
        let x = clamp(fin(v, L[k]), rg[0], rg[1]); if (k === 'escalationCap' || k === 'downWindowMs' || k === 'freeSec') x = Math.round(x);
        L[k] = x; return {};
      }
      case 'resetLab': { const keep = { timeScale: L.timeScale }; s.lab = clone(DATA.LAB_DEFAULT); s.lab.timeScale = keep.timeScale; for (const b of s.buildings) if (PRODUCERS[b.type] && b.lv >= 1) rebase(s, b, s.cityMs); return {}; }
      case 'addPerson': {
        const p = genPerson(s, { seed: a.seed != null ? uint(a.seed, 0) : null, lv: clampInt(a.lv, 1, 10, 1), how: 'lab' });
        s.people.push(p); assignHouse(s, p);
        return { data: { personId: p.id } };
      }
      case 'kill': {
        const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
        if (p.state === 'fallen' || p.state === 'down') return { err: 'state' };
        if (p.state === 'out') return { err: 'pending' };
        setDown(s, p); if (p.fellNight == null) p.fellNight = s.night;
        return { data: { personId: p.id } };
      }
      case 'reviveAll': for (const p of s.people) if (p.state === 'down') { p.state = 'ready'; p.downUntilMs = 0; if (p.houseId == null) assignHouse(s, p); } return {};
      case 'setLevel': {
        const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
        const lv = clampInt(a.lv, 1, 10, p.lv); p.lv = lv; p.xp = XP_AT[lv]; return {};
      }
      case 'giveXp': { const p = personById(s, a.personId); if (!p) return { err: 'notFound' }; addXp(s, p, fin(a.xp, 0) * s.lab.mul.xp, ev); return {}; }
      case 'reroll': case 'reset': {
        const seed = a.seed != null ? uint(a.seed, 1) : (Math.floor(rand(s) * 4294967296) >>> 0);
        const t = create({ realNow: s.realLast, tzOffsetMin: s.tzOffsetMin, seed });
        const keepLab = op === 'reroll' ? clone(s.lab) : null, sound = s.ui.sound;
        for (const k of Object.keys(s)) delete s[k];
        Object.assign(s, t);
        if (keepLab) s.lab = keepLab;
        s.ui.sound = sound;
        return { data: { seed } };
      }
      case 'replayOnboarding': s.flags.metPeople = false; return {};
      default: return { err: 'notFound' };
    }
  }

  // ------------------------------------------------------------------ the run-warp cap (5.1): used by startRun and resolveRun
  // At GO: pending.warpS = warp x real seconds since the previous simulated GO (null = no cap), then the GO is stamped.
  function warpAtGo(s, realNow) {
    const w = s.lab.runWarp, prev = s.lastSimGoRealMs;
    const warpS = prev == null || !w ? null : w * Math.max(0, realNow - prev) / SEC;
    s.lastSimGoRealMs = Math.round(realNow);
    return warpS;
  }
  // At resolution: how far the city clock moves for this result (ms). Real-game and pasted results add nothing.
  function runClockMs(s, pending, res) {
    if (!pending || pending.source !== 'sim' || (res && res.source && res.source !== 'sim') || !s.lab.runsAdvanceClock) return 0;
    const t = Math.max(0, fin(res && res.time, 0));
    return Math.round(SEC * (pending.warpS == null ? t : Math.min(t, pending.warpS)));
  }

  // ------------------------------------------------------------------ the odds (6.2, 6.3): the 400-seed model, cached
  const KIT_ITEMS = DATA.KIT.order;                          // ['medkit', 'pills', 'bomb']
  const kitOpen = (s, item) => (item === 'bomb' ? armoryLv(s) >= 2 : clinicLv(s) >= 1);
  // A kit as { medkit, pills, bomb } of 0/1 with locked items dropped; null or undefined = packed automatically (6.2).
  function kitNorm(s, destId, kit) {
    if (kit == null || !isObj(kit)) { const a = autoKit(s, destId); return { medkit: a.medkit, pills: a.pills, bomb: a.bomb }; }
    const o = {}; for (const k of KIT_ITEMS) o[k] = (k === 'bomb' ? kit.bomb || kit.noiseBomb : kit[k]) && kitOpen(s, k) ? 1 : 0;
    return o;
  }
  function kitTotal(destId, kit) { const pr = price.kit(destId); let n = 0; for (const k of KIT_ITEMS) if (kit[k]) n += pr[k]; return n; }
  const personOf = (s, id) => personById(s, id) || s.inn.travelers.find((t) => t.id === id) || null;
  const canGo = (p) => p.state === 'ready' || p.state === 'rest';
  // The run model's input for this person there with this kit (4.6, 6.3.1, 6.3.2); full = as if rested.
  function runInput(s, p, d, kit, full) {
    const dv = derived(s, p, d.id);
    return { dv, dest: { T: d.threat, W: d.dir.W, H: d.dir.H, len: d.dir.lengthS, hordeMul: dv.hordeMul },
      L: { P: dv.power, maxHp: dv.maxHp, startHp: full ? dv.maxHp : dv.startHp, sw: dv.secondWind, medkit: kit.medkit, pills: kit.pills, bomb: kit.bomb,
        heal: dv.medkitHeal, pillsTemp: dv.pillsTemp, weapon: dv.weapon, shoveMul: dv.shoveMul, accAdd: dv.accAdd } };
  }
  // 6.3.5: the cache key is the destination plus every model input, so identical inputs share one entry and an entry
  // never goes stale (the destination's threat, W, H and length are fixed tables; hordeMul carries Loud).
  function keyOf(destId, inp) {
    const L = inp.L;
    return destId + '|' + inp.dest.hordeMul + '|' + L.P + '|' + L.maxHp + '|' + L.startHp + '|' + L.sw + '|' + L.medkit + L.pills + L.bomb + '|' +
      L.heal + '|' + L.pillsTemp + '|' + L.weapon + '|' + L.shoveMul + '|' + L.accAdd;
  }
  const CACHE = new Map(), CACHE_MAX = 300;                  // an LRU of 300, shared by every state (results are pure)
  function cacheGet(key) { const v = CACHE.get(key); if (v !== undefined) { CACHE.delete(key); CACHE.set(key, v); } return v; }
  function cachePut(key, v) { CACHE.set(key, v); while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value); return v; }
  function mcOf(key, inp, cachedOnly) { const m = cacheGet(key); return m !== undefined ? m : cachedOnly ? null : cachePut(key, Run.mc(inp.dest, inp.L)); }
  const rescueEff = (s, r) => (r >= 1 ? 1 : 1 - clamp((1 - r) * s.lab.mul.death, 0, 1));   // the Lab's death x on (1 - rescue)
  const safeKind = (s, d) => (s.lab.rescueBase[d.n - 1] >= 1 ? 'home' : !s.flags.deathOn ? 'third' : null);   // 6.3.3: Death 0 %
  const signPct = (x) => (x < 0 ? '−' : '+') + Math.round(Math.abs(x) * 100) + '%';
  function fallCostOf(s, p) { const fc = price.revive(s, p.id); return fc ? { cans: fc.cans, sparks: fc.sparks, n: fc.n, text: fill(TEXT.fallCost, { c: fmtNum(fc.cans), s: fc.sparks }) } : null; }
  function oddsOut(s, p, d, kit, inp, m, key) {
    const dv = inp.dv, rescue = rescueEff(s, dv.rescue), death = (1 - m.home) * (1 - rescue), safe = safeKind(s, d);
    const tot = m.falls.streets + m.falls.hordes + m.falls.gate;
    let top = 'streets'; for (const k of ['hordes', 'gate']) if (m.falls[k] > m.falls[top]) top = k;
    const fallsHint = tot ? TEXT.falls[top] : fill(TEXT.fallsNone, { n: m.n });
    let lever = null;                                         // the best kit item not packed, from odds already computed (6.2)
    for (const item of KIT_ITEMS) {
      if (kit[item] || !kitOpen(s, item)) continue;
      const w = CACHE.get(keyOf(d.id, { dest: inp.dest, L: Object.assign({}, inp.L, { [item]: 1 }) }));
      if (w) { const dl = w.home - m.home; if (dl >= 0.02 - 1e-9 && (!lever || dl > lever.delta)) lever = { item, delta: dl, text: fill(TEXT.lever[item], { p: Math.round(dl * 100) }) }; }
    }
    return { key, destId: d.id, personId: p.id, kit: Object.assign({}, kit), home: m.home, death, rescue, power: dv.power, margin: dv.power - d.threat,
      startHp: inp.L.startHp, maxHp: dv.maxHp, falls: Object.assign({}, m.falls), refs: Object.assign({}, m.refs), n: m.n, wins: m.wins,
      fallsHint, lever, hint: fallsHint + (lever ? ' ' + lever.text : ''), safe,
      homeText: 'HOME ' + fmtPct(m.home), deathText: safe === 'home' ? TEXT.deathHome : safe === 'third' ? TEXT.deathThird : 'DEATH ' + fmtPct(death, 'death'),
      deathRed: death > 0.05, fallCost: death > 0 && personById(s, p.id) ? fallCostOf(s, p) : null };
  }
  // odds(state, destId, personId, kit?, { rested, cachedOnly }?): computes (about 0.5 ms in node) and caches.
  function odds(s, destId, personId, kit, o) {
    const d = DEST[destId], p = personOf(s, personId); if (!d || !p) return null;
    const k = kitNorm(s, d.id, kit), inp = runInput(s, p, d, k, !!(o && o.rested)), key = keyOf(d.id, inp);
    const m = mcOf(key, inp, !!(o && o.cachedOnly)); if (!m) return null;
    return oddsOut(s, p, d, k, inp, m, key);
  }
  const oddsCached = (s, destId, personId, kit, o) => odds(s, destId, personId, kit, Object.assign({}, o, { cachedOnly: true }));
  function oddsKey(s, destId, personId, kit, o) {
    const d = DEST[destId], p = personOf(s, personId); if (!d || !p) return null;
    return keyOf(d.id, runInput(s, p, d, kitNorm(s, d.id, kit), !!(o && o.rested)));
  }
  // Each unlocked item's live effect: Home % with it minus without it, for this kit (6.2's toggles and hint).
  function kitDeltas(s, destId, personId, kit, o) {
    const d = DEST[destId], p = personOf(s, personId); if (!d || !p) return null;
    const k = kitNorm(s, d.id, kit), pr = price.kit(d.id), out = { medkit: null, pills: null, bomb: null, labels: { medkit: null, pills: null, bomb: null }, best: null };
    for (const item of KIT_ITEMS) {
      if (!kitOpen(s, item)) continue;
      const a = odds(s, d.id, p.id, Object.assign({}, k, { [item]: 1 }), o), b = odds(s, d.id, p.id, Object.assign({}, k, { [item]: 0 }), o);
      if (!a || !b) continue;
      const dl = a.home - b.home;
      out[item] = dl; out.labels[item] = TEXT.kitName[item] + ' · ' + pr[item] + ' · ' + signPct(dl);
      if (!k[item] && dl >= 0.02 - 1e-9 && (!out.best || dl > out.best.delta)) out.best = { item, delta: dl, text: fill(TEXT.lever[item], { p: Math.round(dl * 100) }) };
    }
    return out;
  }
  // A tired runner: the odds now, the odds after the rest, the rest left and the REST NOW price (6.2). null if rested.
  function restedOdds(s, destId, personId, kit, o) {
    const d = DEST[destId], p = personById(s, personId); if (!d || !p || p.state !== 'rest') return null;
    const now = odds(s, d.id, p.id, kit, o), full = odds(s, d.id, p.id, kit, Object.assign({}, o, { rested: true }));
    if (!now || !full) return null;
    const left = Math.max(0, p.restUntilMs - s.cityMs), pr = skipPrice(left / SEC, s), lbl = pr ? 'REST NOW · ' + pr + ' ✦' : 'REST NOW · FREE';
    return { home: full.home, death: full.death, now: now.home, nowDeath: now.death, restLeftMs: left, price: pr, confirm: pr >= DATA.SKIP.confirmAt,
      text: fill(TEXT.tired, { now: fmtPct(now.home), after: fmtPct(full.home), t: fmtClock(left / SEC) }), label: lbl, labelShort: lbl + ' → ' + fmtPct(full.home) };
  }
  function pillOf(s, p) {
    const restLeft = p.state === 'rest' ? Math.max(0, p.restUntilMs - s.cityMs) : 0, downLeft = p.state === 'down' ? Math.max(0, p.downUntilMs - s.cityMs) : 0;
    return p.state === 'ready' ? 'Rested' : p.state === 'out' ? 'Out' : p.state === 'fallen' ? 'Fallen'
      : p.state === 'down' ? 'Down · ' + Math.floor(downLeft / HOUR) + ' h'
      : (p.restKind === 'hurt' ? 'Hurt ' : p.restKind === 'recovering' ? 'Recovering ' : 'Tired ') + fmtClock(restLeft / SEC);
  }
  // The runner strip (6.2): everyone who can go (Ready, Resting, Hurt, Recovering), best Home % first, ties to the lower
  // level, then the lower index. Odds come from the cache only, unless { compute: true }: a runner without cached odds
  // has home null (the badge shows "…") and sorts after the known ones (favoured role, Ready, level, index). The UI
  // fills the cache in idle frames (oddsTodo) so a frame never pays for 9 runners at once.
  function strip(s, destId, o) {
    const d = DEST[destId] || DEST[s.lastDest] || DATA.DESTS[0], kit = kitNorm(s, d.id, null), cachedOnly = !(o && o.compute), rows = [];
    for (const p of s.people) {
      if (!canGo(p)) continue;
      const inp = runInput(s, p, d, kit, false), key = keyOf(d.id, inp), m = mcOf(key, inp, cachedOnly);
      const home = m ? m.home : null, death = m ? (1 - m.home) * (1 - rescueEff(s, inp.dv.rescue)) : null;
      rows.push({ personId: p.id, destId: d.id, home, death, state: p.state === 'rest' ? p.restKind || 'tired' : 'ready',
        restLeftMs: p.state === 'rest' ? Math.max(0, p.restUntilMs - s.cityMs) : 0, hpFrac: startHpFrac(s, p), key, kit,
        badge: home == null ? null : home >= 0.85 ? 'good' : home >= 0.7 ? 'ok' : 'low', chip: pillOf(s, p), fav: inp.dv.favoured, lv: p.lv, index: p.index });
    }
    const rdy = (r) => (r.state === 'ready' ? 0 : 1);
    rows.sort((x, y) => ((x.home == null) - (y.home == null)) || (x.home != null ? y.home - x.home : (y.fav - x.fav) || rdy(x) - rdy(y)) || x.lv - y.lv || x.index - y.index);
    return rows;
  }
  // PLAY's suggestion for the last destination used (6.2): the Ready person with the best Home %; if nobody is Ready,
  // the best among Resting, Hurt and Recovering. known = false while some of those odds are still being computed.
  // The last destination used, or the Allotments if the Lab has locked it since (PLAY never points at a locked place).
  const playDest = (s) => (DEST[s.lastDest] && destOpen(s, DEST[s.lastDest]) ? s.lastDest : 'D1');
  function suggest(s, destId, o) {
    const id = DEST[destId] ? destId : playDest(s), rows = strip(s, id, o);
    if (!rows.length) return null;
    const ready = rows.filter((r) => r.state === 'ready'), pool = ready.length ? ready : rows, b = pool[0];
    return { personId: b.personId, destId: id, home: b.home, death: b.death, tired: b.state !== 'ready', state: b.state, hpFrac: b.hpFrac, kit: b.kit, key: b.key,
      known: pool.every((r) => r.home != null) };
  }
  function oddsHint(s, destId) { const sg = suggest(s, destId); return sg && sg.home != null ? sg : null; }
  // What PLAY and the strip still need (uncached), Ready people first: the UI computes these with odds() in idle frames.
  function oddsTodo(s, destId) {
    const d = DEST[destId] || DEST[playDest(s)];
    return strip(s, d.id).filter((r) => r.home == null).sort((a, b) => (a.state === 'ready' ? 0 : 1) - (b.state === 'ready' ? 0 : 1))
      .map((r) => ({ destId: d.id, personId: r.personId, kit: r.kit, key: r.key }));
  }
  // The Lab's odds table (9): every runner who can go x every open destination (cachedOnly: skip the uncomputed ones).
  function oddsTable(s, o) {
    const rows = [];
    for (const d of DATA.DESTS) {
      if (!destOpen(s, d)) continue;
      for (const p of s.people) {
        if (!canGo(p)) continue;
        const x = odds(s, d.id, p.id, null, o);
        rows.push({ destId: d.id, personId: p.id, first: p.first, lv: p.lv, state: p.state === 'rest' ? p.restKind : p.state, computed: !!x,
          home: x ? x.home : null, death: x ? x.death : null, rescue: x ? x.rescue : null, power: x ? x.power : null, margin: x ? x.margin : null,
          refs: x ? x.refs : null, falls: x ? x.falls : null, kit: x ? x.kit : null });
      }
    }
    return rows;
  }

  // ------------------------------------------------------------------ the handoff (6.8)
  const runIdOf = (night) => 'bh-' + String(night).padStart(6, '0');
  const r4 = (x) => Math.round(x * 10000) / 10000;
  // buildHandoff(state, destId, personId, kit, seed, meta?) -> the city -> game JSON. Before GO (the run sheet's
  // "Sent to the game ›") it previews the next night with seed null; startRun builds the real one with the drawn seed.
  // meta: { night, runId, realNow (createdAt), source ('sim' | 'game'), odds }.
  function buildHandoff(s, destId, personId, kit, seed, meta) {
    meta = meta || {};
    const d = DEST[destId], p = personOf(s, personId); if (!d || !p) return null;
    const k = kitNorm(s, d.id, kit), dv = derived(s, p, d.id), o = meta.odds || odds(s, d.id, p.id, k);
    const night = meta.night != null ? meta.night : s.night + 1, nk = p.nick && DATA.NICKNAMES[p.nick] ? DATA.NICKNAMES[p.nick].name : null, dr = d.dir, sp = d.supplies;
    return {
      v: 1, kind: 'bellhaven.handoff', game: 'two-thumbs-left',
      runId: meta.runId || runIdOf(night), night, seed: seed == null ? null : seed >>> 0, createdAt: fmtIso(meta.realNow != null ? meta.realNow : s.realLast),
      source: meta.source || (s.lab.waitReal ? 'game' : 'sim'),
      destination: { id: d.id, name: d.name, threat: d.threat, lengthS: dr.lengthS },
      director: { wanderers: dr.W, hordes: dr.H, hordeMul: dv.hordeMul, zombieCap: dr.zombieCap, firstHordeS: dr.firstHordeS.slice(), hordeGapS: dr.hordeGapS.slice(),
        gateS: dr.gateS, waveEveryS: dr.waveEveryS },
      mapSupplies: { medkit: sp.medkit, pills: sp.pills, noiseBomb: sp.noiseBomb, ammo: sp.ammo, rifleInLot: sp.rifleInLot },
      runner: { id: p.id, name: p.first + ' ' + p.last, nickname: nk, role: p.role, trait: p.trait, level: p.lv,
        look: { skin: p.look.skin, hairStyle: p.look.hairStyle, hair: p.look.hair, jacket: p.look.jacket, acc: p.look.acc } },
      player: { maxHp: dv.maxHp, startHp: dv.startHp, secondWind: dv.secondWind, speed: dv.speed, shoveCdMul: dv.shoveCdMul, assist: dv.assist,
        flashlightR: dv.flashlightR, hordeWarnS: dv.hordeWarnS },
      startRoom: { primary: dv.weapon, damageMul: dv.damageMul, medkit: k.medkit, pills: k.pills, noiseBomb: k.bomb },
      items: { medkitHeal: dv.medkitHeal, medkitHealS: dv.medkitHealS, pillsTemp: dv.pillsTemp, bombLifeS: DATA.KIT.bombLifeS },
      odds: { home: r4(o.home), death: r4(o.death), rescue: r4(o.rescue) },
    };
  }

  // ------------------------------------------------------------------ the simulated run (6.3.2, 6.4)
  // The model input saved at GO (pending.L, pending.hordeMul), checked; rebuilt from the person and the handoff's start
  // HP if a damaged save lost it. The destination's threat, wanderers, hordes and length always come from the tables.
  function pendingInput(s, pe) {
    const d = DEST[pe.destId], L = isObj(pe.L) ? pe.L : null, ok = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
    const hm = isObj(pe.dest) && ok(pe.dest.hordeMul, 0.1, 5) ? pe.dest.hordeMul : d.dir.hordeMul;
    const dest = { T: d.threat, W: d.dir.W, H: d.dir.H, len: d.dir.lengthS, hordeMul: hm };
    if (L && ok(L.P, -1000, 1000) && ok(L.maxHp, 1, 1000) && ok(L.startHp, 1, L.maxHp) && ok(L.sw, 0, 5) && ok(L.heal, 0, 1) && ok(L.pillsTemp, 0, 500) &&
      ok(L.shoveMul, 0.1, 5) && ok(L.accAdd, -100, 100)) {
      return { dest, L: { P: L.P, maxHp: L.maxHp, startHp: L.startHp, sw: Math.round(L.sw), medkit: L.medkit ? 1 : 0, pills: L.pills ? 1 : 0, bomb: L.bomb ? 1 : 0,
        heal: L.heal, pillsTemp: L.pillsTemp, weapon: Run.ACC[L.weapon] ? L.weapon : 'pistol', shoveMul: L.shoveMul, accAdd: L.accAdd } };
    }
    const p = personById(s, pe.personId), inp = runInput(s, p, d, kitNorm(s, d.id, pe.kit || {}), true), h = pe.handoff && pe.handoff.player;
    if (h && ok(h.startHp, 1, inp.L.maxHp)) inp.L.startHp = h.startHp;
    inp.dest = dest;
    return inp;
  }
  // runSim(state) -> the 6.9 result for state.pending: the model on the stored seed, so a reload replays the same night.
  // A forced outcome (the first two runs, or the Lab) tries seeds seed+1 ... seed+500; if none of them gives it, the
  // runner's power is shifted in steps of 10 until it does (dev only: the Lab can force a loss on anyone).
  function runSim(s) {
    const pe = s.pending; if (!pe || !DEST[pe.destId] || !personById(s, pe.personId)) return null;
    const inp = pendingInput(s, pe), seed = uint(pe.seed, 0), mode = ['win', 'loss', 'down', 'hurt'].includes(pe.force) ? pe.force : 'auto';
    let r = Run.simulate(inp.dest, inp.L, seed);
    if (mode !== 'auto') {
      const want = mode === 'win';
      for (let k = 1; r.win !== want && k <= 500; k++) r = Run.simulate(inp.dest, inp.L, (seed + k) >>> 0);
      for (let dp = 10; r.win !== want && dp <= 1000; dp += 10) r = Run.simulate(inp.dest, Object.assign({}, inp.L, { P: inp.L.P + (want ? dp : -dp) }), seed);
    }
    return Run.toResult(r, { runId: pe.runId, seed, source: 'sim', pillsTemp: inp.L.pillsTemp });
  }

  // ------------------------------------------------------------------ the result (6.9): validateResult
  const SOURCES = ['sim', 'game', 'paste'], FELL_AT = ['streets', 'hordes', 'gate'];
  // validateResult(res, pending, state?) -> { ok, res, errors[], notes[] }: every row of the 6.9 table, the same for every
  // source. With the state it also refuses a run that was already applied (idempotent). res comes back clean: the 6.9
  // keys in order, numbers fixed or clamped (each fix noted), events kept for the log (at most 200).
  function validateResult(res, pe, s) {
    const notes = [], no = (m) => ({ ok: false, res: null, errors: [m], notes });
    if (!isObj(res) || res.v !== 1 || res.kind !== 'bellhaven.result') return no('Unknown result format');
    if (s && Array.isArray(s.appliedRunIds) && s.appliedRunIds.includes(res.runId)) return no('Already applied');
    if (!pe || res.runId !== pe.runId) return no('This result is from a different run');
    if (res.result !== 'safe_room' && res.result !== 'overrun') return no('Unknown outcome');
    const h = isObj(pe.handoff) ? pe.handoff : {}, pl = isObj(h.player) ? h.player : {}, sr = isObj(h.startRoom) ? h.startRoom : {}, dr = isObj(h.director) ? h.director : {};
    const win = res.result === 'safe_room', maxHp = Math.max(1, Math.round(fin(pl.maxHp, 100)));
    const source = SOURCES.includes(res.source) ? res.source : 'paste';
    if (source !== res.source) notes.push('unknown source, read as paste');
    const seed = uint(pe.seed, 0);
    if (source === 'sim' && res.seed !== seed) notes.push('seed ignored');
    const num = (k, lo, hi) => {                              // clamp and note
      const v0 = res[k], v = typeof v0 === 'number' && isFinite(v0) ? v0 : NaN;
      if (isNaN(v)) { notes.push(k + ' missing, set to ' + lo); return lo; }
      const r = Math.round(clamp(v, lo, hi));
      if (r !== v) notes.push(k + (v < lo || v > hi ? ' clamped to ' + r : ' rounded to ' + r));
      return r;
    };
    let progress, fellAt, endHp;
    if (win) {
      if (res.progress !== 1) notes.push('progress set to 1');
      progress = 1;
      if (res.fellAt != null) notes.push('fellAt cleared');
      fellAt = null;
      endHp = num('endHp', 1, maxHp);
    } else {
      if (res.endHp !== 0) notes.push('endHp set to 0');
      endHp = 0;
      const pv = typeof res.progress === 'number' && isFinite(res.progress) ? res.progress : NaN;
      progress = isNaN(pv) ? 0 : clamp(pv, 0, 0.99);
      if (progress !== pv) notes.push('progress ' + (isNaN(pv) ? 'missing, set to 0' : 'clamped to ' + progress));
      if (FELL_AT.includes(res.fellAt)) fellAt = res.fellAt;
      else { fellAt = progress < 0.35 ? 'streets' : progress < 0.78 ? 'hordes' : 'gate'; notes.push('fellAt derived: ' + fellAt); }
    }
    const time = num('time', 0, 1800), kills = num('kills', 0, 2000), accuracy = num('accuracy', 0, 100), shoves = num('shoves', 0, 2000);
    const damageTaken = num('damageTaken', 0, 5000);
    const hordes = num('hordes', 0, Math.max(0, Math.round(fin(dr.hordes, 0))) + 1), secondWindUsed = num('secondWindUsed', 0, Math.max(0, Math.round(fin(pl.secondWind, 1))));
    const u = isObj(res.used) ? res.used : {}, used = {};
    for (const [k, kk] of [['medkit', 'medkit'], ['pills', 'pills'], ['noiseBomb', 'noiseBomb']]) {
      const packed = sr[kk] ? 1 : 0, v = u[k] ? 1 : 0;
      used[k] = Math.min(v, packed);
      if (used[k] !== v || (u[k] != null && u[k] !== 0 && u[k] !== 1)) notes.push('used.' + k + ' clamped to ' + used[k] + (packed ? '' : ' (not packed)'));
    }
    if (win && damageTaken < fin(pl.startHp, maxHp) - endHp) notes.push('damageTaken looks low for the health lost');
    const events = Array.isArray(res.events) ? res.events.filter((e) => Array.isArray(e)).slice(0, 200).map((e) => e.slice(0, 3)) : [];
    if (Array.isArray(res.events) && res.events.length > 200) notes.push('events cut to 200');
    const out = { v: 1, kind: 'bellhaven.result', runId: pe.runId, seed: source === 'sim' || res.seed == null || !isFinite(res.seed) ? seed : uint(res.seed, seed),
      source, result: res.result, fellAt, progress, time, kills, accuracy, shoves, damageTaken, endHp, hordes, secondWindUsed, used, events };
    return { ok: true, res: out, errors: [], notes };
  }

  // ------------------------------------------------------------------ settlement (6.5): reward and the fall
  function nickFor(p, res, refs, outcome) {                  // 4.8, checked in this order; the first that triggers
    const win = res.result === 'safe_room';
    if (win && refs && res.damageTaken <= refs.dmgP10) return 'ghost';
    if (refs && res.kills >= refs.killsP90) return 'mower';
    if (refs && res.shoves >= refs.shovesP90) return 'elbows';
    if (win && res.endHp <= DATA.NICKNAMES.gatecrasher.endHpMax) return 'gatecrasher';
    if (win && res.secondWindUsed >= 1) return 'lastbreath';
    if (outcome === 'hurt' && p.hurtCount >= DATA.NICKNAMES.comeback.hurtTimes) return 'comeback';
    if (p.runs >= DATA.NICKNAMES.oldhand.runs) return 'oldhand';
    return null;
  }
  function refsOf(s, pe) {
    const r = pe.refs;
    if (isObj(r) && [r.dmgP10, r.killsP90, r.shovesP90].every((v) => typeof v === 'number' && isFinite(v))) return r;
    const inp = pendingInput(s, pe), key = keyOf(pe.destId, inp);
    return mcOf(key, inp, false).refs;
  }
  // Steps 1-7 of 6.5 on s (the real state from resolveRun, or a copy from reward()). res must be validated.
  function settleRun(s, pe, res, ev, realNow) {
    const d = DEST[pe.destId], p = personById(s, pe.personId), win = res.result === 'safe_room';
    const h = isObj(pe.handoff) ? pe.handoff : {}, pl = isObj(h.player) ? h.player : {}, night = clampInt(pe.night, 0, BIG, s.night);
    const sh = isObj(pe.odds) ? pe.odds : {}, shownHome = clamp(fin(sh.home, 0), 0, 1);
    // 1. the clock: a simulated run moves it by min(result.time, the run-warp allowance) (5.1)
    const clockMs = runClockMs(s, pe, res);
    if (clockMs > 0) for (const e of advance(s, clockMs, { source: 'run' })) ev.push(e);
    const rolls = Run.cityRolls(uint(pe.seed, 0));
    // 2. the kit: every packed item not used comes back, before loot and never cut by the cap
    const pr = price.kit(d.id), packed = isObj(pe.kit) ? pe.kit : {}, held = Math.max(0, Math.round(fin(pe.held, 0)));
    const usedK = { medkit: res.used.medkit, pills: res.used.pills, bomb: res.used.noiseBomb }, charged = { total: 0 }, returned = { total: 0 };
    for (const k of KIT_ITEMS) {
      const on = packed[k] ? 1 : 0, c = on && usedK[k] ? pr[k] : 0, r = on && !usedK[k] ? pr[k] : 0;
      charged[k] = c; returned[k] = r; charged.total += c; returned.total += r;
    }
    const back = clamp(held - charged.total, 0, held);
    s.res.cans += back; s.tel.kitSpent += held - back;
    // 3. loot: the win table, 30 % x progress on a loss, plus a quarter brick per kill always; cut at the cap
    const lm = (p && p.trait === 'loud' ? DATA.TRAITS.loud.loot : 1) * s.lab.mul.loot, base = win ? 1 : RULES.lossLoot * res.progress;
    const bricksBase = Math.round(d.bricks * rolls.luck * lm * base), killBricks = Math.round(RULES.killBricks * res.kills), cansLoot = Math.round(d.cans * rolls.luck * lm * base);
    const gb = gain(s, 'bricks', bricksBase + killBricks, 'run'), gc = gain(s, 'cans', cansLoot, 'run');
    const br = { runId: pe.runId, personId: pe.personId, destId: d.id, night, source: res.source, win, outcome: win ? 'win' : 'hurt', safe: false, forced: pe.force || 'auto',
      clockMs, bricks: gb, bricksBase, killBricks, cans: gc, cansLoot, overflow: { bricks: bricksBase + killBricks - gb, cans: cansLoot - gc },
      kit: { held, packed: { medkit: packed.medkit ? 1 : 0, pills: packed.pills ? 1 : 0, bomb: packed.bomb ? 1 : 0 }, used: usedK, charged, returned, back },
      xp: 0, lvFrom: p ? p.lv : 1, lvTo: p ? p.lv : 1, levelUps: [], xpNow: 0, xpFrom: 0, xpTo: 0, sparks: { firstClear: 0, daily: 0 },
      restMs: 0, restKind: null, downUntilMs: null, rescue: null, nickname: null, nickName: null, rolls, arrival: null, lines: {} };
    if (!p) return br;
    const F = p.first, Dn = d.name, Dt = d.theName;
    p.kills += res.kills; if (res.kills > p.bestKills) p.bestKills = res.kills;
    const rm = restMulOf(s, p), maxHp = Math.max(1, Math.round(fin(pl.maxHp, 100)));
    let rescue = clamp(fin(sh.rescue, 1), 0, 1), safe = !!pe.safe;
    if (win) {
      // 5. a win: the first clear, the daily spark, a rest that grows with the damage taken
      s.tel.wins++; p.wins++;
      if (!s.dest[d.id].cleared) { s.dest[d.id].cleared = true; br.sparks.firstClear = earn(s, d.first, 'firstClear'); ev.push({ type: 'firstClear', destId: d.id, sparks: br.sparks.firstClear }); }
      const day = dayOf(s, typeof realNow === 'number' && isFinite(realNow) ? realNow : s.realLast);
      if (s.daily.lastDay !== day) { s.daily.lastDay = day; br.sparks.daily = earn(s, RULES.daily, 'daily'); ev.push({ type: 'daily', sparks: br.sparks.daily, day }); }
      const rest = Math.round(d.rest * SEC * (0.5 + res.damageTaken / maxHp) * rm);
      p.state = 'rest'; p.restKind = 'tired'; p.restFromMs = s.cityMs; p.restUntilMs = s.cityMs + rest; br.restMs = rest; br.restKind = 'tired';
      history(s, p, res.secondWindUsed >= 1 ? fill(TEXT.winSecondWind, { n: night, D: Dn }) : fill(TEXT.win, { n: night, D: Dn, m: fmtClock(res.time), k: fmtNum(res.kills) }));
      br.arrival = 'sack';
    } else {
      // 6. a loss: the stretcher roll (always found at the Allotments and before the third present person)
      s.tel.losses++;
      const mode = pe.force;
      const hurt = mode === 'down' ? false : mode === 'hurt' ? true : safe || rolls.stretcher < rescue;
      if (mode === 'down' || mode === 'hurt') safe = false;
      br.rescue = rescue; br.safe = safe;
      if (hurt) {
        const rest = Math.round(d.rest * SEC * RULES.hurtMul * rm);
        p.state = 'rest'; p.restKind = 'hurt'; p.restFromMs = s.cityMs; p.restUntilMs = s.cityMs + rest; p.hurtCount++;
        br.outcome = 'hurt'; br.restMs = rest; br.restKind = 'hurt';
        if (!safe) s.tel.rescues++;
        history(s, p, fill(TEXT.hurt, { n: night, D: Dt }));
        br.arrival = !safe && clinicLv(s) >= 1 ? 'stretcher' : 'limp';   // P1: two medics carry the runner in (with a Clinic)
      } else {
        setDown(s, p); p.fellNight = night; p.fellDest = d.id; p.fellOdds = shownHome; p.fellAt = res.fellAt;
        br.outcome = 'down'; br.downUntilMs = p.downUntilMs;
        s.tel.downs++; s.tel.downsByDest[d.id] = (s.tel.downsByDest[d.id] || 0) + 1; s.tel.downsByLv[p.lv] = (s.tel.downsByLv[p.lv] || 0) + 1;
        if (s.tel.firstDownMs == null) s.tel.firstDownMs = s.cityMs;
        history(s, p, fill(TEXT.down, { n: night, D: Dt }));
        ev.push({ type: 'down', personId: p.id, destId: d.id });
      }
    }
    // 4. XP and level-ups (after the run line, so the history reads in order)
    const xp = Math.round(d.xp * (win ? 1 : RULES.lossXp * res.progress) * (p.trait === 'quick_learner' ? DATA.TRAITS.quick_learner.xp : 1) * s.lab.mul.xp);
    br.xp = xp; addXp(s, p, xp, ev);
    for (let L = br.lvFrom + 1; L <= p.lv; L++) br.levelUps.push(L);
    br.lvTo = p.lv; br.xpNow = p.xp; br.xpFrom = XP_AT[p.lv]; br.xpTo = p.lv < 10 ? XP_AT[p.lv + 1] : XP_AT[10];
    // 7. the nickname (4.8): the first that triggers, kept for good; telemetry
    if (!p.nick) {
      const n = nickFor(p, res, refsOf(s, pe), br.outcome);
      if (n) {
        p.nick = n; s.tel.nicknames++; const N = DATA.NICKNAMES[n];
        history(s, p, fill(TEXT.nickname, { n: night, F, Nick: N.name }));
        br.nickname = n; br.nickName = N.name;
        ev.push({ type: 'nickname', personId: p.id, nick: n, name: N.name });
      }
    }
    if (pe.source === 'sim' && res.source === 'sim' && (pe.force || 'auto') === 'auto') {   // calibration (9, P10): natural sim runs only
      const b = Math.min(9, Math.floor(shownHome * 10)); s.tel.calib[b][0]++; s.tel.calib[b][1] += shownHome; if (win) s.tel.calib[b][2]++;
    }
    // the result card's lines (8.7.3, 6.6.1)
    const kitParts = (o, sign) => KIT_ITEMS.filter((k) => o[k]).map((k) => TEXT.kitLower[k] + ' ' + sign + o[k]);
    const used = kitParts(charged, '−'), ret = kitParts(returned, '+');
    const over = [br.overflow.bricks ? fmtNum(br.overflow.bricks) + ' bricks' : '', br.overflow.cans ? fmtNum(br.overflow.cans) + ' cans' : ''].filter(Boolean);
    const t = fmtDur(br.restMs / SEC);
    br.lines = { title: win ? TEXT.resultWin : TEXT.resultLoss, sub: 'Night ' + night + ' · ' + Dn + ' · ' + F,
      salvage: 'kill salvage +' + killBricks,
      kit: used.length || ret.length ? [used.length ? 'Used: ' + used.join(', ') : '', ret.length ? 'Returned: ' + ret.join(', ') : ''].filter(Boolean).join(' · ') : null,
      overflow: over.length ? fill(TEXT.overflow, { x: over.join(' and ') }) : null,
      firstClear: br.sparks.firstClear ? fill(TEXT.firstClear, { s: br.sparks.firstClear }) : null, daily: br.sparks.daily ? fill(TEXT.daily, { s: br.sparks.daily }) : null,
      nick: br.nickname ? fill(TEXT.nickNow, { F, Nick: br.nickName, line: DATA.NICKNAMES[br.nickname].line }) : null,
      rest: win ? fill(TEXT.rests, { F, t: fmtClock(br.restMs / SEC) }) : null,
      beat: !win && !br.safe ? fill(TEXT.beat, { F }) : null,
      fall: br.outcome === 'hurt' ? fill(br.safe ? TEXT.limped : TEXT.madeItHurt, { F, t }) : null };
    return br;
  }
  // reward(state, pending, res) -> the settlement breakdown of 6.5 without touching the state (it settles a copy).
  function reward(s, pe, res, realNow) {
    pe = pe || s.pending; if (!pe) return null;
    const v = validateResult(res, pe, null); if (!v.ok) return null;
    const c = clone(s); c.pending = clone(pe);
    return settleRun(c, c.pending, v.res, [], realNow == null ? s.realLast : realNow);
  }

  // ------------------------------------------------------------------ the revive offer, the memorial, the runner card
  const recoverMs = (s, p) => Math.round(RULES.recoverPerLvS * SEC * p.lv * B.clinic.restMul[clinicLv(s)] * s.lab.mul.rest);   // 10 min x L x Clinic rest
  const nightsText = (n) => fmtNum(n) + (n === 1 ? ' night' : ' nights');
  const fullName = (p) => { const nk = p.nick && DATA.NICKNAMES[p.nick] ? DATA.NICKNAMES[p.nick].name : null; return nk ? p.first + ' “' + nk + '” ' + p.last : p.first + ' ' + p.last; };
  function overrunLine(p) { const D = p.fellDest ? DEST[p.fellDest] : null; return D ? fill(TEXT.overrunAt[p.fellAt] || 'Overrun at {D}', { D: D.theName, N: D.name }) : null; }
  // offer(state, personId) -> the revive offer of 6.6.2 and 8.8 (prices, the recovery time, the time left to decide, every label).
  function offer(s, personId) {
    const p = personById(s, personId); if (!p || p.state !== 'down') return null;
    const pr = price.revive(s, p.id), ms = recoverMs(s, p), left = Math.max(0, p.downUntilMs - s.cityMs), ol = overrunLine(p);
    const where = p.runs === 0 && p.arrivedHow === 'stranger' ? fill(TEXT.foundAtGate, { n: p.arrivedNight }) : ol ? ol + ' · Night ' + p.fellNight
      : fill(TEXT.downSince, { n: p.fellNight != null ? p.fellNight : s.night });
    const needC = Math.max(0, pr.cans - s.res.cans), needS = Math.max(0, pr.sparks - s.res.sparks);
    return { personId: p.id, first: p.first, name: fullName(p), look: p.look, stranger: pr.stranger, n: pr.n,
      title: fill(TEXT.downTitle, { NAME: (p.first + ' ' + p.last).toUpperCase() }),
      roleLine: DATA.ROLE_STATS[p.role].name + ' · Lv ' + p.lv + (p.runs ? ' · ' + nightsText(p.runs) + ' · ' + fmtNum(p.kills) + ' kills' : ''),
      where, leftMs: left, leftText: fill(TEXT.leftToDecide, { t: fmtHoursLeft(left) }),
      revive: { cans: pr.cans, ok: !needC, need: needC, restMs: ms, label: 'REVIVE · ' + fmtNum(pr.cans),
        sub: fill(clinicLv(s) >= 1 ? TEXT.restsIn : TEXT.restsFor, { t: fmtDur(ms / SEC) }), needText: needC ? 'Need ' + fmtNum(needC) + ' more cans' : null },
      reviveNow: { sparks: pr.sparks, ok: !needS, need: needS, label: 'REVIVE NOW · ' + pr.sparks + ' ✦', sub: TEXT.readyAtOnce, needText: needS ? 'Need ' + needS + ' more ✦' : null },
      goodbye: { label: 'SAY GOODBYE', sub: TEXT.aGrave },
      revivedText: p.revives && !pr.stranger ? fill(TEXT.revivedBefore, { n: p.revives, x: Math.pow(2, Math.min(p.revives, s.lab.escalationCap)) }) : null };
  }
  // memorial(state, graveId) -> the memorial card of 8.9.
  function memorial(s, graveId) {
    const g = s.graves.find((x) => x.id === graveId), p = g ? personById(s, g.personId) : null; if (!p) return null;
    const tr = DATA.TRAITS[p.trait] || {}, D = p.fellDest ? DEST[p.fellDest] : null, found = p.runs === 0 && p.arrivedHow === 'stranger';
    const days = Math.floor(Math.max(0, fin(g.placedMs, s.cityMs) - fin(p.arrivedMs, 0)) / DAY);
    const daysText = days < 1 ? 'less than a day in Bellhaven' : days === 1 ? '1 day in Bellhaven' : days + ' days in Bellhaven';
    const fellLine = found ? fill(TEXT.foundAtGate, { n: p.arrivedNight })
      : D ? fill(TEXT.fellAt, { D: D.theName, n: p.fellNight }) + (p.fellOdds != null ? fill(TEXT.oddsWere, { p: fmtPct(p.fellOdds) }) : '')
      : p.fellNight != null ? fill(TEXT.fellOn, { n: p.fellNight }) : null;
    return { graveId: g.id, personId: p.id, gx: g.gx, gy: g.gy, waiting: g.gx == null, look: p.look, first: p.first, name: fullName(p),
      roleLine: DATA.ROLE_STATS[p.role].name + ' · Lv ' + p.lv + ' · ' + (tr.name || p.trait), usedToBe: Names.usedToBe(p.trade), epitaph: p.epitaph || epitaph(s, p),
      record: p.runs ? nightsText(p.runs) + ' · ' + fmtNum(p.wins) + ' home · ' + fmtNum(p.kills) + ' kills · ' + daysText : null, fellLine };
  }
  // runCard(state, destId, personId, kit?) -> the run sheet's runner card (6.2, 8.7.1): this runner's odds (computed),
  // the toggles with their live effects and the tired line (from the cache: null until kitDeltas / restedOdds ran).
  function runCard(s, destId, personId, kit) {
    const d = DEST[destId], p = personById(s, personId); if (!d || !p) return null;
    const k = kitNorm(s, d.id, kit), o = odds(s, d.id, p.id, k), dv = derived(s, p, d.id), pr = price.kit(d.id), total = kitTotal(d.id, k), tr = DATA.TRAITS[p.trait] || {};
    const dl = kitDeltas(s, d.id, p.id, k, { cachedOnly: true }), rest = restedOdds(s, d.id, p.id, k, { cachedOnly: true });
    const err = s.pending ? 'pending' : !destOpen(s, d) ? 'locked' : !canGo(p) ? 'state' : total > s.res.cans ? 'cost' : null;
    return { personId: p.id, destId: d.id, name: fullName(p), first: p.first, look: p.look, lv: p.lv, xp: p.xp, xpFrom: XP_AT[p.lv], xpTo: p.lv < 10 ? XP_AT[p.lv + 1] : XP_AT[10],
      roleLine: dv.roleLine, ttlLine: dv.ttlLine, traitChip: (tr.name || p.trait).toUpperCase() + ' · ' + (tr.effect || ''),
      kit: k, kitTotal: total, odds: o, homeText: o.homeText, deathText: o.deathText, deathRed: o.deathRed, fallLine: o.fallCost ? o.fallCost.text : null,
      rest, tiredLine: rest ? rest.text : null, hint: dl && dl.best ? o.fallsHint + ' ' + dl.best.text : o.hint, low: o.home < 0.5,
      go: { ok: !err, err, confirm: o.home < 0.5, label: o.home < 0.5 ? 'RUN IT ANYWAY?' : 'GO · ' + p.first.toUpperCase() },
      toggles: KIT_ITEMS.map((item) => ({ item, open: kitOpen(s, item), on: !!k[item], price: pr[item], delta: dl ? dl[item] : null,
        label: dl && dl.labels[item] ? dl.labels[item] : TEXT.kitName[item] + ' · ' + pr[item], canTurnOn: !k[item] && kitOpen(s, item) && total + pr[item] <= s.res.cans })) };
  }
  // The Lab's generator gallery (9): n people from a seed, first names unique among them. Pure.
  function gallery(seed, n) {
    const out = [], taken = [];
    for (let i = 0; i < (n || 12); i++) { const g = Names.person(uint(seed, 0), i, { taken }); taken.push(g.first); out.push(g); }
    return out;
  }

  // ------------------------------------------------------------------ actions: people and runs (6, 7.1, 7.3)
  const RUN_ACTIONS = {
    // 3.4.7: a traveler moves in for 60 + 30 x living cans, if a bed is free.
    invite(s, a, ev) {
      const inn = innB(s); if (!inn || inn.lv < 1) return { err: 'notFound' };
      const i = s.inn.travelers.findIndex((t) => t.id === a.travelerId); if (i < 0) return { err: 'notFound' };
      if (living(s).length >= bedsOf(s)) return { err: 'beds' };
      const pr = price.invite(s); if (s.res.cans < pr) return { err: 'cost', data: { res: 'cans', need: pr - s.res.cans } };
      if (pr > RULES.reviveCapShare * capOf(s, 'cans')) s.tel.priceViolations++;
      s.res.cans -= pr;
      const t = s.inn.travelers.splice(i, 1)[0];
      t.state = 'ready'; t.arrivedHow = 'inn'; t.arrivedNight = s.night; t.arrivedMs = s.cityMs; t.history = [[s.night, fill(TEXT.arrived.inn, { n: s.night })]];
      s.people.push(t); assignHouse(s, t); s.tel.invites++;
      ev.push({ type: 'invited', personId: t.id, price: pr });
      return { data: { personId: t.id, price: pr } };
    },
    // 6.2: GO. Draws the seed, builds and stores the handoff, the 400-run refs, the held kit and the run-warp allowance in
    // state.pending, before anything animates (the UI saves after every act). Tired runners may go; kit toggles are
    // opt-outs (a packed item must be unlocked and paid for); under 50 % Home it needs confirmLow.
    startRun(s, a, ev, realNow) {
      if (s.pending) return { err: 'pending' };
      const d = DEST[a.destId], p = personById(s, a.personId);
      if (!d || !p) return { err: 'notFound' };
      if (!destOpen(s, d)) return { err: 'locked', data: { lock: destLock(s, d), needTower: towerLv(s) < d.tower ? d.tower : null } };
      if (!canGo(p)) return { err: 'state' };
      if (isObj(a.kit)) for (const k of KIT_ITEMS) if ((k === 'bomb' ? a.kit.bomb || a.kit.noiseBomb : a.kit[k]) && !kitOpen(s, k)) return { err: 'locked', data: { item: k } };
      const kit = kitNorm(s, d.id, a.kit), held = kitTotal(d.id, kit);
      if (held > s.res.cans) return { err: 'cost', data: { res: 'cans', need: held - s.res.cans } };
      const o = odds(s, d.id, p.id, kit);
      if (o.home < 0.5 && !a.confirmLow) return { err: 'confirm', data: { home: o.home } };
      const now = typeof realNow === 'number' && isFinite(realNow) ? Math.round(realNow) : s.realLast;
      const inp = runInput(s, p, d, kit, false), sim = !s.lab.waitReal;
      let seed = Math.floor(rand(s) * 4294967296) >>> 0;   // drawn even when the Lab locks it, so the stream never shifts
      if (s.lab.lockSeed != null) seed = s.lab.lockSeed >>> 0;
      let force = sim ? s.lab.force : 'auto', forcedFirst = false;
      if (force === 'auto' && sim && s.forcedWins > 0) { force = 'win'; forcedFirst = true; s.forcedWins--; }
      const night = s.night + 1, runId = runIdOf(night);
      const handoff = buildHandoff(s, d.id, p.id, kit, seed, { night, runId, realNow: now, source: sim ? 'sim' : 'game', odds: o });
      if (held > RULES.reviveCapShare * capOf(s, 'cans')) s.tel.priceViolations++;
      s.night = night; s.res.cans -= held; s.lastDest = d.id;
      const warpS = sim ? warpAtGo(s, now) : null;
      p.state = 'out'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0; p.runs++; s.tel.runs++; s.tel.deathShown += o.death;
      s.pending = { runId, night, seed, destId: d.id, personId: p.id, source: sim ? 'sim' : 'external', kit: Object.assign({}, kit), held, handoff,
        refs: Object.assign({}, o.refs), falls: Object.assign({}, o.falls), startedCityMs: s.cityMs, warpS,
        L: inp.L, dest: { hordeMul: inp.dest.hordeMul }, force, forcedFirst, odds: { home: o.home, death: o.death, rescue: o.rescue }, safe: !!o.safe };
      ev.push({ type: 'runStarted', runId, personId: p.id, destId: d.id, night, source: s.pending.source });
      return { data: { runId, handoff } };
    },
    // 6.9 + 6.5: validate the result (any source), settle it, write lastRun. source 'sim' with no result runs runSim().
    // A rejected result changes nothing (data { errors, notes }); applying the same run twice answers "Already applied".
    resolveRun(s, a, ev, realNow) {
      const pe = s.pending, src = SOURCES.includes(a.source) ? a.source : null;
      let res = a.result;
      if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) { return { err: 'state', data: { errors: ['Unknown result format'], notes: [] } }; } }
      if (res == null && !pe) return { err: 'state', data: { errors: ['No run is out'], notes: [] } };
      if (res == null && (src || 'sim') === 'sim') res = runSim(s);
      if (isObj(res) && src) res = Object.assign({}, res, { source: src });
      const v = validateResult(res, pe, s);
      if (!v.ok) return { err: 'state', data: { errors: v.errors, notes: v.notes } };
      const br = settleRun(s, pe, v.res, ev, realNow);
      s.pending = null;
      s.appliedRunIds.push(pe.runId); while (s.appliedRunIds.length > 100) s.appliedRunIds.shift();
      s.lastRun = { handoff: pe.handoff, result: v.res, notes: v.notes, reward: br };
      ev.push({ type: 'runResolved', runId: pe.runId, personId: pe.personId, destId: pe.destId, outcome: br.outcome, arrival: br.arrival });
      return { data: { reward: br, outcome: br.outcome, notes: v.notes, result: v.res, offer: br.outcome === 'down' ? offer(s, pe.personId) : null } };
    },
    // 6.6.2: REVIVE (cans: Recovering in the Clinic for 10 min x L x Clinic rest) or REVIVE NOW (sparks: Ready at once).
    // The price escalates x2 per earlier revive up to the Lab cap and the cans are clamped at 80 % of the can cap. A
    // sparks revive is a sink but never a "paid skip" (7.2 step 14).
    revive(s, a, ev) {
      const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
      if (p.state !== 'down') return { err: 'state' };
      if (a.pay !== 'cans' && a.pay !== 'sparks') return { err: 'notFound' };
      const pr = price.revive(s, p.id);
      let paid, restMs = 0;
      if (a.pay === 'cans') {
        if (s.res.cans < pr.cans) return { err: 'cost', data: { res: 'cans', need: pr.cans - s.res.cans } };
        s.res.cans -= pr.cans; paid = pr.cans; restMs = recoverMs(s, p);
        p.state = 'rest'; p.restKind = 'recovering'; p.restFromMs = s.cityMs; p.restUntilMs = s.cityMs + restMs;
        history(s, p, fill(TEXT.revivedCans, { n: s.night }));
      } else {
        if (s.res.sparks < pr.sparks) return { err: 'cost', data: { res: 'sparks', need: pr.sparks - s.res.sparks } };
        spend(s, pr.sparks, 'revive'); paid = pr.sparks;
        p.state = 'ready'; p.restKind = null; p.restFromMs = 0; p.restUntilMs = 0;
        history(s, p, fill(TEXT.revivedSparks, { n: s.night }));
      }
      p.downUntilMs = 0; p.revives++;
      if (pr.stranger) s.tel.strangerRev = a.pay === 'cans' ? 1 : 2; else if (a.pay === 'cans') s.tel.revivesCans++; else s.tel.revivesSparks++;
      if (p.houseId == null) assignHouse(s, p);
      ev.push({ type: 'revived', personId: p.id, pay: a.pay, price: paid, stranger: pr.stranger, restMs });
      return { data: { price: paid, restMs } };
    },
    // 6.7, R13: SAY GOODBYE makes the person Fallen, writes the epitaph and puts the grave on its default spot in this one
    // act (saved with it); LAY TO REST later only sends move { target: { kind: 'grave', id } } if the ghost was dragged.
    goodbye(s, a, ev) {
      const p = personById(s, a.personId); if (!p) return { err: 'notFound' };
      if (p.state !== 'down') return { err: 'state' };
      const g = fall(s, p, 'goodbye', ev);
      return { data: { graveId: g.id, spot: g.gx == null ? null : { gx: g.gx, gy: g.gy } } };
    },
  };

  Object.assign(ACTIONS, RUN_ACTIONS);

  // ------------------------------------------------------------------ view (read-only, derived)
  const ROSTER = { down: 0, ready: 1, tired: 2, hurt: 3, recovering: 4, out: 5 };
  function kinLine(s, p) { const k = p.kin ? personById(s, p.kin) : null; return k ? 'Says ' + k.first + ' ' + k.last + ' was family.' : null; }
  // The person card's role chip (4.4, 8.6): what changes the odds here ("SCOUT · +5 at the Night Market"; a Medic adds the heal).
  function roleChip(p) {
    const rs = DATA.ROLE_STATS[p.role]; if (!rs) return '';
    const t = rs.name.toUpperCase() + ' · +5 at ' + joinNames(rs.fav.map((id) => DEST[id].theName));
    return p.role === 'medic' ? t + ' · medkit heals ' + Math.round((0.8 + 0.02 * p.lv) * 100) + ' %' : t;
  }
  function personView(s, p, suggestedId) {
    const restLeft = p.state === 'rest' ? Math.max(0, p.restUntilMs - s.cityMs) : 0, downLeft = p.state === 'down' ? Math.max(0, p.downUntilMs - s.cityMs) : 0;
    const clinic = clinicLv(s) >= 1, stranger = p.arrivedHow === 'stranger' && p.revives === 0 && p.houseId == null;
    const where = p.state === 'ready' ? 'walk' : p.state === 'out' ? 'out' : p.state === 'fallen' ? 'grave'
      : p.state === 'down' ? (stranger ? 'gate' : clinic ? 'clinic' : 'house')
      : p.restKind === 'recovering' && clinic ? 'clinic' : p.houseId ? 'house' : 'bench';
    const pill = pillOf(s, p), hpFrac = startHpFrac(s, p);
    const nk = p.nick && DATA.NICKNAMES[p.nick] ? DATA.NICKNAMES[p.nick].name : null, tr = DATA.TRAITS[p.trait] || {};
    const g = p.state === 'fallen' ? s.graves.find((x) => x.personId === p.id) : null, dv = derived(s, p, s.lastDest);
    return { id: p.id, index: p.index, first: p.first, last: p.last, name: p.first + ' ' + p.last, fullName: nk ? p.first + ' “' + nk + '” ' + p.last : p.first + ' ' + p.last,
      canRun: canGo(p) && !s.pending && p.arrivedHow !== 'traveler', roleChip: roleChip(p), ttlLine: dv ? dv.ttlLine : '', traitChip: (tr.name || p.trait).toUpperCase() + ' · ' + (tr.effect || ''),
      nickChip: nk ? '“' + nk.toUpperCase() + '” · ' + DATA.NICKNAMES[p.nick].chip : null, hpText: p.state === 'rest' ? 'HP ' + Math.round(hpFrac * 100) + '%' : null,
      fellAt: p.fellAt, arrivedMs: p.arrivedMs,
      nick: p.nick, nickName: nk, age: p.age, role: p.role, roleName: DATA.ROLE_STATS[p.role] ? DATA.ROLE_STATS[p.role].name : p.role, trade: p.trade,
      card: Names.cardLine(p), trait: p.trait, traitName: tr.name || p.trait, traitLine: tr.line || '', habit: p.habit, look: p.look,
      lv: p.lv, xp: p.xp, xpFrom: XP_AT[p.lv], xpTo: p.lv < 10 ? XP_AT[p.lv + 1] : XP_AT[10], state: p.state, restKind: p.restKind,
      restLeftMs: restLeft, restTotalMs: p.state === 'rest' ? Math.max(0, p.restUntilMs - p.restFromMs) : 0, startHpFrac: hpFrac,
      downLeftMs: downLeft, houseId: p.houseId, house: houseName(s, p.houseId), where, pill, stranger, runs: p.runs, wins: p.wins,
      kills: p.kills, bestKills: p.bestKills, revives: p.revives, history: p.history, epitaph: p.epitaph, suggested: p.id === suggestedId,
      graveId: g ? g.id : null, arrivedNight: p.arrivedNight, arrivedHow: p.arrivedHow, fellNight: p.fellNight, fellDest: p.fellDest, fellOdds: p.fellOdds,
      kin: p.kin, kinLine: kinLine(s, p) };
  }
  // PLAY (8.3): the suggestion with its labels. home is null (shown "…") until the UI has computed those odds.
  function playView(s, sug, claimed) {
    if (!sug) return null;
    const p = personById(s, sug.personId), d = DEST[sug.destId];
    return Object.assign({}, sug, { first: p.first, look: p.look, destName: d.name, label: p.first + ' → ' + d.name,
      homeText: sug.home == null ? '…' : fmtPct(sug.home), deathText: sug.death == null ? null : fmtPct(sug.death, 'death'), deathRed: sug.death > 0.05,
      hpText: sug.tired ? 'HP ' + Math.round(sug.hpFrac * 100) + '%' : null, dailyTag: claimed ? null : '✦' + RULES.daily });
  }
  function pendingView(s) {
    const pe = s.pending; if (!pe) return null;
    const p = personById(s, pe.personId), d = DEST[pe.destId];
    return { runId: pe.runId, night: pe.night, personId: pe.personId, first: p ? p.first : '', destId: pe.destId, destName: d ? d.name : '', source: pe.source,
      sim: pe.source === 'sim', startedCityMs: pe.startedCityMs, warpS: pe.warpS, kit: pe.kit, held: pe.held, force: pe.force || 'auto', odds: pe.odds || null,
      handoff: pe.handoff, title: 'Night ' + pe.night + ' · ' + (d ? d.name : '') };
  }
  function nextUp(s, b) {
    const T = towerLv(s);
    if (b.lv >= B[b.type].max) return null;
    const lv = b.lv + 1, c = costOf(s, b.type, lv), j = jobFor(s, b.id);
    const needT = b.type !== 'tower' && lv > T ? lv : null;
    const err = b.lv < 1 || j ? 'busy' : needT ? 'locked' : s.res[c.res] < c.n ? 'cost' : cranesFree(s) < 1 ? 'noCrane' : null;
    return { lv, cost: c, timeS: jobMs(s, b.type, lv) / SEC, ok: !err, err, needTower: needT, need: err === 'cost' ? c.n - s.res[c.res] : 0 };
  }
  function view(s) {
    const grid = occGrid(s), T = towerLv(s), tw = towerB(s), sug = suggest(s), sugId = sug ? sug.personId : null;
    const jobs = s.jobs.slice().sort((a, b) => a.endMs - b.endMs || idNum(a.id) - idNum(b.id)).map((j) => jobView(s, j));
    const jobOf = {}; for (const j of jobs) if (j.buildingId) jobOf[j.buildingId] = j;
    const buildings = s.buildings.map((b) => {
      const o = { id: b.id, type: b.type, name: B[b.type].name, lv: b.lv, gx: b.gx, gy: b.gy, w: B[b.type].w, d: B[b.type].w,
        label: B[b.type].name.toUpperCase() + ' · LV ' + b.lv, maxLv: B[b.type].max, building: b.lv < 1, job: jobOf[b.id] || null,
        bubble: bubbleView(s, b), next: nextUp(s, b) };
      if (b.type === 'house') {
        const res = s.people.filter((p) => p.state !== 'fallen' && p.houseId === b.id), col = DATA.HOUSE_COLORS[b.houseIdx % 3];
        const resting = res.filter((p) => p.state === 'rest' && p.restKind !== 'recovering').length;
        o.house = { idx: b.houseIdx, color: col.name, roof: col.roof, beds: b.lv >= 1 ? B.house.beds[b.lv] : 0, residents: res.map((p) => p.id), resting, lit: resting > 0, lantern: res.some((p) => p.state === 'down') };
      } else if (b.type === 'clinic') {
        o.clinic = { down: s.people.filter((p) => p.state === 'down' && !(p.arrivedHow === 'stranger' && p.revives === 0 && p.houseId == null)).map((p) => ({ personId: p.id, first: p.first, leftMs: Math.max(0, p.downUntilMs - s.cityMs) })),
          recovering: s.people.filter((p) => p.state === 'rest' && p.restKind === 'recovering').map((p) => p.id) };
      } else if (b.type === 'inn') o.inn = { travelers: s.inn.travelers.length };
      else if (b.type === 'tower') o.tower = { storeys: 1 + Math.ceil(b.lv / 2), gold: b.lv >= 10 };
      return o;
    });
    const total = cranesTotal(s), cranesList = [];
    for (let i = 0; i < Math.max(total, jobs.length); i++) {               // (more jobs than cranes only after the Lab lowered the Tower)
      const j = jobs[i], b = j && j.buildingId ? byId(s, j.buildingId) : null;
      const site = !j ? null : b ? { gx: b.gx, gy: b.gy, w: B[b.type].w, d: B[b.type].w } : { gx: landHi(s) - 1, gy: START.gateGy[0], w: 1, d: 2 };
      cranesList.push({ i, busy: !!j, jobId: j ? j.id : null, site, park: tw ? { x: tw.gx + 3.3, y: tw.gy + 0.4 + 0.8 * (i - (jobs.length)) } : { x: 12, y: 12 } });
    }
    const people = living(s).map((p) => personView(s, p, sugId)).sort((a, b) => ROSTER[a.state === 'rest' ? a.restKind : a.state] - ROSTER[b.state === 'rest' ? b.restKind : b.state] || a.index - b.index);
    const remembered = s.people.filter((p) => p.state === 'fallen').map((p) => personView(s, p, null));
    const graves = s.graves.map((g) => {
      const p = personById(s, g.personId), age = g.gx == null ? 0 : Math.max(0, s.cityMs - g.placedMs), r = Names.mulberry32(((p ? p.seed : 0) ^ 0x0f10e2) >>> 0);
      return { id: g.id, personId: g.personId, gx: g.gx, gy: g.gy, waiting: g.gx == null, placedMs: g.placedMs, ageMs: age, first: p ? p.first : '', name: p ? p.first + ' ' + p.last : '',
        initial: p ? p.first.charAt(0) : '', ribbon: p ? p.look.jacket : '#8a8f98', grassed: age >= DATA.GRAVE.grassMs,
        flowers: age >= DATA.GRAVE.flowers4Ms ? 4 : age >= DATA.GRAVE.flowers2Ms ? 2 : 0, flowerColors: [0, 1, 2, 3].map(() => DATA.FLOWERS[Math.floor(r() * 4)]),
        candle: g.gx != null && age < DATA.GRAVE.candleMs, epitaph: p ? p.epitaph : null };
    });
    const caps = { bricks: capOf(s, 'bricks'), cans: capOf(s, 'cans') }, inn = innB(s);
    const tray = TYPES.map((t) => {
      const have = ofType(s, t).length, allowed = allowedCount(s, t), c = costOf(s, t, 1), full = have >= maxCount(t);
      const locked = !full && have >= allowed ? countTower(t, have) : null;
      const err = full || have >= allowed ? (full ? 'max' : 'locked') : s.res[c.res] < c.n ? 'cost' : cranesFree(s) < 1 ? 'noCrane' : null;
      return { type: t, name: B[t].name, decor: false, cost: c, timeS: jobMs(s, t, 1) / SEC, built: have, allowed, max: maxCount(t), locked, full, affordable: !err || err === 'noCrane', ok: !err, err };
    });
    for (const k of Object.keys(DATA.DECOR)) {
      const D = DATA.DECOR[k], n = Math.round(D.cost * s.lab.mul.cost), locked = T < D.tower ? D.tower : null;
      const err = locked ? 'locked' : s.res.bricks < n ? 'cost' : null;
      tray.push({ type: k, name: D.name, decor: true, cost: { res: 'bricks', n }, timeS: 0, built: s.decor.filter((d) => d.type === k).length, allowed: null, max: null, locked, full: false, affordable: !err, ok: !err, err });
    }
    const lo = landLo(s), hi = landHi(s), plaza = plazaTiles(s, grid);
    let walk = '';
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) walk += inLand(s, x, y) && grid[y * G + x] == null ? '1' : '0';
    const nextRing = s.ring < EXP.maxRing ? s.ring + 1 : null;
    const landNext = nextRing == null ? null : (() => {
      const n = expandCost(s, nextRing), needT = T < EXP.tower[nextRing] ? EXP.tower[nextRing] : null, busy = s.jobs.some((j) => j.kind === 'expand');
      const err = busy ? 'busy' : needT ? 'locked' : s.res.bricks < n ? 'cost' : cranesFree(s) < 1 ? 'noCrane' : null;
      return { ring: nextRing, side: 8 + 2 * nextRing, needTower: needT, cost: { res: 'bricks', n }, timeS: expandMs(s, nextRing) / SEC, ok: !err, err };
    })();
    const tn = tw ? nextUp(s, tw) : null;
    if (tn) tn.opens = towerOpens(tn.lv);
    const today = dayOf(s, s.realLast);
    return {
      v: V, cityMs: s.cityMs, night: s.night, demo: !!s.demo, today, realLast: s.realLast,
      tower: { id: tw.id, lv: T, gx: tw.gx, gy: tw.gy, storeys: 1 + Math.ceil(T / 2), gold: T >= 10, hordeWarnS: DATA.TOWER.hordeWarn[T], job: jobOf[tw.id] || null, next: tn },
      land: { ring: s.ring, side: hi - lo, lo, hi, gate: { x: hi, gy: START.gateGy.slice(), tiles: START.gateGy.map((y) => [hi - 1, y]) },
              quietCorner: { gx: lo, gy: lo }, next: landNext, groundKey: s.ring + '|' + tw.gx + ',' + tw.gy + '|' + plaza.map((t) => t.join(',')).join(';') },
      plaza, walkable: walk, buildings, jobs,
      cranes: { total, free: cranesFree(s), crane4: s.crane4, buy: { ok: !s.crane4 && T >= RULES.crane4Tower && s.res.sparks >= RULES.crane4, err: s.crane4 ? 'max' : T < RULES.crane4Tower ? 'locked' : s.res.sparks < RULES.crane4 ? 'cost' : null, price: RULES.crane4 }, list: cranesList },
      rubble: s.rubble.map((r) => ({ id: r.id, gx: r.gx, gy: r.gy, ring: r.ring, glint: r.glint, cost: { res: 'bricks', n: clearCost(s, r.ring) }, ok: s.res.bricks >= clearCost(s, r.ring) })),
      graves, decor: s.decor.map((d) => ({ id: d.id, type: d.type, gx: d.gx, gy: d.gy })), people, remembered,
      inn: inn ? { id: inn.id, lv: inn.lv, travelers: s.inn.travelers.map((p) => personView(s, p, null)), nextRefreshMs: s.inn.nextRefreshMs,
        leftMs: s.inn.nextRefreshMs != null ? Math.max(0, s.inn.nextRefreshMs - s.cityMs) : null,
        price: s.inn.nextRefreshMs != null ? skipPrice(Math.max(0, s.inn.nextRefreshMs - s.cityMs) / SEC, s) : null, invitePrice: price.invite(s),
        canInvite: living(s).length >= bedsOf(s) ? { ok: false, err: 'beds' } : s.res.cans < price.invite(s) ? { ok: false, err: 'cost' } : { ok: true, err: null } } : null,
      res: { bricks: s.res.bricks, cans: s.res.cans, sparks: s.res.sparks }, caps, rates: { bricks: rateOf(s, 'bricks'), cans: rateOf(s, 'cans') },
      chips: { tower: T, bricks: { n: s.res.bricks, cap: caps.bricks, frac: caps.bricks ? Math.min(1, s.res.bricks / caps.bricks) : 0 },
        cans: { n: s.res.cans, cap: caps.cans, frac: caps.cans ? Math.min(1, s.res.cans / caps.cans) : 0, over: s.res.cans > caps.cans }, sparks: s.res.sparks,
        cranes: { free: cranesFree(s), total }, people: { living: living(s).length, beds: bedsOf(s), down: s.people.some((p) => p.state === 'down') },
        build: { affordable: tray.filter((c) => !c.decor && c.affordable).length } },
      tray,
      dests: DATA.DESTS.map((d) => ({ id: d.id, n: d.n, name: d.name, threat: d.threat, open: destOpen(s, d), lock: destLock(s, d), cleared: s.dest[d.id].cleared,
        firstSparks: d.first, bricks: d.bricks, cans: d.cans, xp: d.xp, fav: d.fav, kit: price.kit(d.id) })),
      goal: goal(s), play: playView(s, sug, s.daily.lastDay === today), daily: { claimed: s.daily.lastDay === today }, deathOn: s.flags.deathOn,
      pending: pendingView(s), lastRun: s.lastRun,
      flags: Object.assign({}, s.flags), lab: { timeScale: s.lab.timeScale, reducedMotion: s.lab.reducedMotion, runScreenS: s.lab.runScreenS, force: s.lab.force, waitReal: s.lab.waitReal },
    };
  }

  // The building sheet (8.4): before -> after rows, RUN-tagged effects, the next level's cost and time.
  function info(s, id) {
    const b = byId(s, id); if (!b) return null;
    const L = b.lv, N = Math.min(B[b.type].max, L + 1), rows = [], row = (label, from, to, run) => rows.push({ label, from, to, run: !!run });
    const pct = (x) => '+' + Math.round(x * 100) + '%', hrs = (h) => h + ' h';
    switch (b.type) {
      case 'tower': row('Cranes', DATA.TOWER.cranes[L], DATA.TOWER.cranes[N]); row('Horde warning', DATA.TOWER.hordeWarn[L] + ' s', DATA.TOWER.hordeWarn[N] + ' s', true); row('Level cap', L, N); break;
      case 'kiln': case 'cannery': row((b.type === 'kiln' ? 'Bricks' : 'Cans') + '/h', fmtNum(rateLv(s, b.type, L)), fmtNum(rateLv(s, b.type, N))); row('Holds', hrs(B[b.type].hold[L]), hrs(B[b.type].hold[N])); break;
      case 'depot': row('Brick cap', '+' + fmtNum(Math.round(B.depot.capB[L] * s.lab.mul.cost)), '+' + fmtNum(Math.round(B.depot.capB[N] * s.lab.mul.cost))); row('Can cap', '+' + fmtNum(Math.round(B.depot.capC[L] * s.lab.mul.cost)), '+' + fmtNum(Math.round(B.depot.capC[N] * s.lab.mul.cost))); break;
      case 'house': row('Beds', B.house.beds[L], B.house.beds[N]); break;
      case 'clinic': row('Stretcher chance', pct(s.lab.clinicRescue * L), pct(s.lab.clinicRescue * N), true); row('Rest ×', B.clinic.restMul[L].toFixed(2), B.clinic.restMul[N].toFixed(2)); row('Second winds', B.clinic.sw[L], B.clinic.sw[N], true); if (L < 1) row('Kit', 'no kit', 'medkit and pills', true); break;
      case 'armory': row('Start weapon', DATA.WEAPON_NAMES[B.armory.weapon[L]], DATA.WEAPON_NAMES[B.armory.weapon[N]], true); row('Damage ×', B.armory.damage[L].toFixed(2), B.armory.damage[N].toFixed(2), true); row('Power', '+' + B.armory.power[L], '+' + B.armory.power[N], true); if (L < 2 && N >= 2) row('Kit', 'no noise bomb', 'noise bomb', true); break;
      case 'inn': row('Travelers', B.inn.travelers[L], B.inn.travelers[N]); row('New travelers every', fmtDur(B.inn.refresh[L]), fmtDur(B.inn.refresh[N])); if (N === 3 && L < 3) row('Level 2 travelers', 0, 1); break;
    }
    const j = jobFor(s, b.id);
    return { id: b.id, type: b.type, title: B[b.type].name.toUpperCase() + ' · LV ' + L, rows, next: nextUp(s, b), job: j ? jobView(s, j) : null,
      opens: b.type === 'tower' && L < 10 ? towerOpens(L + 1) : [] };
  }

  // ------------------------------------------------------------------ telemetry summary (9)
  function kpis(s) {
    const t = s.tel, days = s.cityMs / DAY, hours = s.cityMs / HOUR, sum = (o) => Object.keys(o).reduce((a, k) => a + o[k], 0);
    const calib = t.calib.map((b, i) => ({ bucket: i * 10, runs: b[0], shown: b[0] ? b[1] / b[0] : null, actual: b[0] ? b[2] / b[0] : null }));
    const perWeek = (n) => (days > 0 ? n * 7 / days : 0), earned = sum(t.sparksIn), spent = sum(t.sparksOut);
    const k = { cityMs: s.cityMs, days, runs: t.runs, wins: t.wins, losses: t.losses, winRate: t.runs ? t.wins / t.runs : null,
      runsPerHour: hours > 0 ? t.runs / hours : 0, runsPerDay: days > 0 ? t.runs / days : 0, downs: t.downs, rescues: t.rescues,
      revivesCans: t.revivesCans, revivesSparks: t.revivesSparks, goodbyes: t.goodbyes, expired: t.expired, graves: t.graves, expectedDowns: t.deathShown, strangerRevive: ['none', 'cans', 'sparks'][t.strangerRev] || 'none',
      drifters: t.drifters, invites: t.invites, nicknames: t.nicknames, downsByDest: t.downsByDest, downsByLv: t.downsByLv,
      firstDownMs: t.firstDownMs, firstGraveMs: t.firstGraveMs, strangerAtMs: t.strangerAtMs, sparksIn: t.sparksIn, sparksOut: t.sparksOut,
      sparksEarned: earned, sparksSpent: spent, devSparks: t.devSparks, packs: t.packs,
      craneIdle: t.craneMs ? (t.idleOnMs + t.idleOffMs + t.idleGatedMs) / t.craneMs : 0, craneIdleOnline: t.craneMs ? t.idleOnMs / t.craneMs : 0,
      craneIdleOffline: t.craneMs ? t.idleOffMs / t.craneMs : 0, craneIdleGated: t.craneMs ? t.idleGatedMs / t.craneMs : 0,
      overflowBricks: t.overflowBricks, overflowCans: t.overflowCans, onlineMs: t.onlineMs, nothingShare: t.onlineMs ? t.nothingMs / t.onlineMs : 0,
      towerAtMs: t.towerAtMs, runShareBricks: t.bricksRun + t.bricksProd ? t.bricksRun / (t.bricksRun + t.bricksProd) : 0,
      jobsStarted: t.jobsStarted, jobsDone: t.jobsDone, levelUps: t.levelUps, kitSpent: t.kitSpent, priceViolations: t.priceViolations, calibration: calib };
    // The section-10 targets this one save can be judged on (P1 of 13.1 (b)): per-week rates scaled from its own clock.
    const T10 = t.towerAtMs[10], tg = [];
    const add = (id, label, value, text, ok) => tg.push({ id, label, value, target: text, ok: value == null ? null : ok });
    add('P1', 'Tower 10 (day)', T10 != null ? T10 / DAY : null, '6.0-7.0 for an active player', T10 != null && T10 / DAY >= 6 && T10 / DAY <= 7);
    add('P2', 'Downs per week', days >= 1 ? perWeek(t.downs) : null, '5-11', perWeek(t.downs) >= 5 && perWeek(t.downs) <= 11);
    add('P3', 'Graves per week', days >= 1 ? perWeek(t.graves) : null, 'mean 1.5-4', perWeek(t.graves) >= 1.5 && perWeek(t.graves) <= 4);
    add('P5', 'Nothing-to-do time', t.onlineMs ? k.nothingShare : null, '< 5 %', k.nothingShare < 0.05);
    add('P5', 'Win rate', t.runs >= 10 ? k.winRate : null, '88-96 %', k.winRate >= 0.88 && k.winRate <= 0.96);
    add('P9', 'Sparks earned per week', days >= 1 ? perWeek(earned) : null, '250-300', perWeek(earned) >= 250 && perWeek(earned) <= 300);
    add('P10', 'Calibration buckets', calib.some((b) => b.runs >= 50) ? calib.filter((b) => b.runs >= 50).length : null, 'actual within 3 SE + 1.5 points',
      calib.filter((b) => b.runs >= 50).every((b) => Math.abs(b.actual - b.shown) <= 3 * Math.sqrt(b.shown * (1 - b.shown) / b.runs) + 0.015));
    add('P11', 'Prices above 80 % of the cap', t.priceViolations, '0', t.priceViolations === 0);
    k.targets = tg;
    return k;
  }

  // ------------------------------------------------------------------ save format (11.2)
  function newTel() {
    return { runs: 0, wins: 0, losses: 0, downs: 0, rescues: 0, revivesCans: 0, revivesSparks: 0, goodbyes: 0, expired: 0, graves: 0,
      drifters: 0, invites: 0, nicknames: 0, strangerAtMs: null, downsByDest: {}, downsByLv: {}, firstDownMs: null, firstGraveMs: null,
      sparksIn: {}, sparksOut: {}, devSparks: 0, packs: 0, craneMs: 0, craneBusyMs: 0, idleOnMs: 0, idleOffMs: 0, idleGatedMs: 0,
      overflowBricks: 0, overflowCans: 0, onlineMs: 0, nothingMs: 0, towerAtMs: [null, 0, null, null, null, null, null, null, null, null, null],
      bricksRun: 0, bricksProd: 0, bricksGoal: 0, cansRun: 0, cansProd: 0, kitSpent: 0, priceViolations: 0, jobsStarted: 0, jobsDone: 0, levelUps: 0,
      calib: Array.from({ length: 10 }, () => [0, 0, 0]), strangerRev: 0, deathShown: 0 };
  }
  function create(o) {
    o = o || {};
    const realNow = Math.round(fin(o.realNow, 0));
    const seed = (o.seed != null && isFinite(o.seed) ? Number(o.seed) : Names.hash(realNow >>> 0, Math.floor(realNow / 4294967296) >>> 0)) >>> 0;
    const dest = {}; for (const id of DATA.DEST_IDS) dest[id] = { cleared: false };
    const s = {
      v: V, saveSeed: seed, rng: Names.hash(seed, 0x5eed), cityMs: 0, realLast: realNow, tzOffsetMin: clampInt(o.tzOffsetMin, -840, 840, 0),
      lastSimGoRealMs: null, res: { bricks: START.bricks, cans: START.cans, sparks: START.sparks }, ring: 0,
      buildings: [], jobs: [], crane4: false, rubble: [], decor: [], graves: [], people: [], inn: { travelers: [], nextRefreshMs: null },
      nextIndex: 0, night: 0, lastDest: 'D1', dest, pending: null, lastRun: null, goal: 0,
      flags: { deathOn: false, deathCardSeen: false, strangerDone: false, metPeople: false, finale: false, paidSkip: false },
      daily: { lastDay: null }, forcedWins: RULES.forcedWins, appliedRunIds: [], tel: newTel(), lab: clone(DATA.LAB_DEFAULT), ui: { sound: true },
      ids: { b: 0, j: 0, r: 0, g: 0, d: 0 }, demo: false,
    };
    s.buildings.push({ id: nid(s, 'b'), type: 'tower', lv: 1, gx: START.tower.gx, gy: START.tower.gy });
    s.buildings.push({ id: nid(s, 'b'), type: 'kiln', lv: 1, gx: START.kiln.gx, gy: START.kiln.gy, bubbleBase: START.kilnBubble, bubbleSinceMs: 0 });
    const house = { id: nid(s, 'b'), type: 'house', lv: 1, gx: START.house.gx, gy: START.house.gy, houseIdx: 0 };
    s.buildings.push(house);
    for (const [x, y, g] of START.rubble) s.rubble.push({ id: nid(s, 'r'), gx: x, gy: y, ring: 0, glint: g });
    for (const role of ['sprinter', 'brawler']) { const p = genPerson(s, { role, how: 'starter' }); p.houseId = house.id; s.people.push(p); }
    return s;
  }
  function serialize(s) { return JSON.stringify(s); }
  function migrate(o) {
    let v = Math.max(0, Math.floor(fin(o.v, 0)));
    while (v < V) { v++; o = MIGRATIONS[v](o); o.v = v; }
    return o;
  }
  const isColor = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  function cleanPerson(p, notes) {
    if (!isObj(p) || typeof p.first !== 'string' || typeof p.last !== 'string' || !p.first) return null;
    const lv = clampInt(p.lv, 1, 10, 1), look = isObj(p.look) ? p.look : {};
    const role = Names.ROLES.includes(p.role) ? p.role : 'sprinter', state = STATES.includes(p.state) ? p.state : 'ready';
    const xpHi = lv < 10 ? XP_AT[lv + 1] - 1 : BIG, xp = clampInt(p.xp, XP_AT[lv], xpHi, XP_AT[lv]);
    if (xp !== p.xp || lv !== p.lv) notes.push('person ' + p.first + ': level or XP fixed');
    const q = { id: typeof p.id === 'string' && /^p\d+$/.test(p.id) ? p.id : null, index: clampInt(p.index, 0, BIG, 0), seed: uint(p.seed, 0),
      first: p.first.slice(0, 40), last: p.last.slice(0, 40), nick: DATA.NICKNAMES[p.nick] ? p.nick : null, age: clampInt(p.age, 19, 64, 30),
      role, trade: typeof p.trade === 'string' && Names.TRADES[role].includes(p.trade) ? p.trade : Names.TRADES[role][0],
      trait: DATA.TRAIT_IDS.includes(p.trait) ? p.trait : 'tough', habit: clampInt(p.habit, 0, Names.HABITS.length - 1, 0),
      look: { skin: isColor(look.skin) ? look.skin : Names.SKIN[0], hairStyle: Names.STYLES.includes(look.hairStyle) ? look.hairStyle : 'short',
        hair: isColor(look.hair) ? look.hair : Names.HAIR[0], jacket: isColor(look.jacket) ? look.jacket : Names.JACKETS[0], acc: Names.ACC.includes(look.acc) ? look.acc : 'none' },
      lv, xp, state, restKind: state === 'rest' ? (REST_KINDS.includes(p.restKind) ? p.restKind : 'tired') : null,
      restFromMs: Math.max(0, Math.round(fin(p.restFromMs, 0))), restUntilMs: Math.max(0, Math.round(fin(p.restUntilMs, 0))),
      downUntilMs: Math.max(0, Math.round(fin(p.downUntilMs, 0))), houseId: typeof p.houseId === 'string' ? p.houseId : null,
      revives: clampInt(p.revives, 0, BIG, 0), runs: clampInt(p.runs, 0, BIG, 0), wins: clampInt(p.wins, 0, BIG, 0), hurtCount: clampInt(p.hurtCount, 0, BIG, 0),
      kills: clampInt(p.kills, 0, BIG, 0), bestKills: clampInt(p.bestKills, 0, BIG, 0),
      history: (Array.isArray(p.history) ? p.history : []).filter((h) => Array.isArray(h) && typeof h[1] === 'string').map((h) => [clampInt(h[0], 0, BIG, 0), h[1].slice(0, 120)]).slice(-RULES.maxHistory),
      arrivedNight: clampInt(p.arrivedNight, 0, BIG, 0), arrivedHow: HOWS.includes(p.arrivedHow) ? p.arrivedHow : 'lab', arrivedMs: clampInt(p.arrivedMs, 0, BIG, 0),
      fellNight: p.fellNight == null ? null : clampInt(p.fellNight, 0, BIG, 0), fellDest: DEST[p.fellDest] ? p.fellDest : null,
      fellOdds: p.fellOdds == null ? null : clamp(fin(p.fellOdds, 0), 0, 1), fellAt: ['streets', 'hordes', 'gate'].includes(p.fellAt) ? p.fellAt : null,
      epitaph: Array.isArray(p.epitaph) && p.epitaph.length === 2 && p.epitaph.every((x) => typeof x === 'string') ? p.epitaph.slice() : null,
      kin: typeof p.kin === 'string' && /^p\d+$/.test(p.kin) ? p.kin : null };
    if (q.wins > q.runs) q.wins = q.runs;
    if (q.state === 'rest' && q.restUntilMs < q.restFromMs) { q.restUntilMs = q.restFromMs; notes.push('rest end fixed'); }
    return q;
  }
  function sanitize(o, notes) {
    notes = notes || [];
    const note = (m) => notes.push(m);
    o = isObj(o) ? o : {};
    const seed = uint(o.saveSeed, 20261104);
    const t = create({ realNow: fin(o.realLast, 0), tzOffsetMin: fin(o.tzOffsetMin, 0), seed });
    const s = {};
    s.v = V; s.saveSeed = seed; s.rng = uint(o.rng, t.rng);
    s.cityMs = Math.max(0, Math.round(fin(o.cityMs, 0))); s.realLast = Math.max(0, Math.round(fin(o.realLast, 0)));
    s.tzOffsetMin = clampInt(o.tzOffsetMin, -840, 840, 0);
    s.lastSimGoRealMs = o.lastSimGoRealMs == null ? null : Math.max(0, Math.round(fin(o.lastSimGoRealMs, 0)));
    const r = isObj(o.res) ? o.res : {};
    s.res = {}; for (const k of ['bricks', 'cans', 'sparks']) { const v = Math.max(0, Math.round(fin(r[k], 0))); if (v !== r[k]) note('res.' + k + ' fixed'); s.res[k] = v; }
    s.ring = clampInt(o.ring, 0, EXP.maxRing, 0);
    // buildings: one Tower, known types, levels <= the Tower, unique ids
    const ids = new Set(), bl = [];
    for (const b of Array.isArray(o.buildings) ? o.buildings : []) {
      if (!isObj(b) || !B[b.type]) { note('unknown building dropped'); continue; }
      if (b.type === 'tower' && bl.some((x) => x.type === 'tower')) { note('second Tower dropped'); continue; }
      let id = typeof b.id === 'string' && /^b\d+$/.test(b.id) && !ids.has(b.id) ? b.id : null;
      const q = { id, type: b.type, lv: clampInt(b.lv, b.type === 'tower' ? 1 : 0, B[b.type].max, 1), gx: clampInt(b.gx, 0, G - 1, 0), gy: clampInt(b.gy, 0, G - 1, 0) };
      if (b.type === 'house') q.houseIdx = clampInt(b.houseIdx, 0, 2, 0);
      if (PRODUCERS[b.type]) { q.bubbleBase = Math.max(0, fin(b.bubbleBase, 0)); q.bubbleSinceMs = clampInt(b.bubbleSinceMs, 0, s.cityMs, s.cityMs); }
      if (q.lv !== b.lv) note(b.type + ' level fixed');
      bl.push(q); if (id) ids.add(id);
    }
    if (!bl.some((b) => b.type === 'tower')) { note('Bell Tower restored'); bl.unshift({ id: null, type: 'tower', lv: 1, gx: START.tower.gx, gy: START.tower.gy }); }
    const T = bl.find((b) => b.type === 'tower').lv;
    for (const b of bl) if (b.type !== 'tower' && b.lv > T) { note(b.type + ' above the Tower lowered'); b.lv = T; }
    const hs = bl.filter((b) => b.type === 'house').sort((a, b) => a.houseIdx - b.houseIdx);
    hs.forEach((h, i) => { if (h.houseIdx !== i) { h.houseIdx = i; note('house colour fixed'); } });
    s.buildings = bl;
    const maxNum = (list, k) => list.reduce((m, x) => (x.id && x.id.charAt(0) === k ? Math.max(m, idNum(x.id)) : m), 0);
    const oi = isObj(o.ids) ? o.ids : {};
    s.ids = { b: Math.max(clampInt(oi.b, 0, BIG, 0), maxNum(bl, 'b')) };
    for (const b of bl) if (!b.id) { b.id = 'b' + (++s.ids.b); note('building id repaired'); }
    s.jobs = [];
    const okRing = s.ring;
    for (const j of Array.isArray(o.jobs) ? o.jobs : []) {
      if (!isObj(j) || !['build', 'upgrade', 'expand'].includes(j.kind)) { note('job dropped'); continue; }
      const q = { id: typeof j.id === 'string' && /^j\d+$/.test(j.id) && !s.jobs.some((x) => x.id === j.id) ? j.id : null, kind: j.kind,
        target: j.kind === 'expand' ? null : typeof j.target === 'string' ? j.target : null, toLv: clampInt(j.toLv, 1, 10, 1),
        startMs: Math.max(0, Math.round(fin(j.startMs, s.cityMs))), endMs: Math.max(0, Math.round(fin(j.endMs, s.cityMs))) };
      if (q.endMs < q.startMs) q.endMs = q.startMs;
      if (q.kind === 'expand') { if (q.toLv !== okRing + 1 || okRing >= EXP.maxRing || s.jobs.some((x) => x.kind === 'expand')) { note('expansion job dropped'); continue; } }
      else {
        const b = bl.find((x) => x.id === q.target);
        if (!b || s.jobs.some((x) => x.target === q.target) || q.toLv !== b.lv + 1 || (q.kind === 'build') !== (b.lv === 0) || (b.type !== 'tower' && q.toLv > T)) { note('job dropped'); continue; }
      }
      s.jobs.push(q);
    }
    for (const b of bl) if (b.lv === 0 && !s.jobs.some((j) => j.target === b.id)) { b.lv = 1; note(b.type + ' with no build job finished'); }
    s.crane4 = o.crane4 === true;
    // positions: inside the land, off the gate, no overlaps (moved to the nearest valid spot when needed)
    s.rubble = []; s.decor = []; s.graves = [];
    const tmp = Object.assign({}, t, { ring: s.ring, buildings: [], rubble: s.rubble, decor: s.decor, graves: s.graves });
    for (const b of bl.slice().sort((a, b) => (a.type === 'tower' ? -1 : b.type === 'tower' ? 1 : 0))) {
      const reason = fitsGrid(tmp, occGrid(tmp), B[b.type].w, b.gx, b.gy);
      if (reason) { const sp = suggestSpot(tmp, b.type, b.gx + B[b.type].w / 2, b.gy + B[b.type].w / 2); if (sp) { b.gx = sp.gx; b.gy = sp.gy; note(b.type + ' moved to a free spot'); } else note(b.type + ' has no free spot'); }
      tmp.buildings.push(b);
    }
    s.ids.j = Math.max(clampInt(oi.j, 0, BIG, 0), maxNum(s.jobs, 'j')); for (const j of s.jobs) if (!j.id) j.id = 'j' + (++s.ids.j);
    const rids = new Set();
    for (const x of Array.isArray(o.rubble) ? o.rubble : []) {
      if (!isObj(x)) continue;
      const q = { id: typeof x.id === 'string' && /^r\d+$/.test(x.id) && !rids.has(x.id) ? x.id : null, gx: clampInt(x.gx, 0, G - 1, 0), gy: clampInt(x.gy, 0, G - 1, 0), ring: clampInt(x.ring, 0, EXP.maxRing, 0), glint: x.glint === true };
      if (fitsGrid(tmp, occGrid(tmp), 1, q.gx, q.gy)) { note('rubble dropped'); continue; }
      s.rubble.push(q); if (q.id) rids.add(q.id);
    }
    s.ids.r = Math.max(clampInt(oi.r, 0, BIG, 0), maxNum(s.rubble, 'r')); for (const x of s.rubble) if (!x.id) x.id = 'r' + (++s.ids.r);
    for (const x of Array.isArray(o.decor) ? o.decor : []) {
      if (!isObj(x) || !DATA.DECOR[x.type]) continue;
      const q = { id: typeof x.id === 'string' && /^d\d+$/.test(x.id) && !s.decor.some((y) => y.id === x.id) ? x.id : null, type: x.type, gx: clampInt(x.gx, 0, G - 1, 0), gy: clampInt(x.gy, 0, G - 1, 0) };
      if (fitsGrid(tmp, occGrid(tmp), 1, q.gx, q.gy)) { note('decoration dropped'); continue; }
      s.decor.push(q);
    }
    s.ids.d = Math.max(clampInt(oi.d, 0, BIG, 0), maxNum(s.decor, 'd')); for (const x of s.decor) if (!x.id) x.id = 'd' + (++s.ids.d);
    // people: unique ids, valid houses; graves for the Fallen; travelers
    s.people = [];
    const pids = new Set();
    let maxIndex = -1;
    for (const p of Array.isArray(o.people) ? o.people : []) { const q = cleanPerson(p, notes); if (!q) { note('person dropped'); continue; } s.people.push(q); maxIndex = Math.max(maxIndex, q.index); }
    const travelers = [];
    const ti = isObj(o.inn) ? o.inn : {};
    for (const p of Array.isArray(ti.travelers) ? ti.travelers : []) { const q = cleanPerson(p, notes); if (q) { q.state = 'ready'; q.restKind = null; q.houseId = null; travelers.push(q); maxIndex = Math.max(maxIndex, q.index); } }
    s.nextIndex = Math.max(clampInt(o.nextIndex, 0, BIG, 0), maxIndex + 1);
    for (const q of s.people.concat(travelers)) { if (!q.id || pids.has(q.id)) { q.index = s.nextIndex++; q.id = 'p' + q.index; note('person id repaired'); } pids.add(q.id); }
    for (const g of Array.isArray(o.graves) ? o.graves : []) {
      if (!isObj(g)) continue;
      const p = s.people.find((x) => x.id === g.personId);
      if (!p || s.graves.some((x) => x.personId === p.id)) { note('dangling grave dropped'); continue; }
      if (p.state !== 'fallen') { p.state = 'fallen'; p.restKind = null; note('person with a grave set Fallen'); }
      const q = { id: typeof g.id === 'string' && /^g\d+$/.test(g.id) && !s.graves.some((x) => x.id === g.id) ? g.id : null, personId: p.id,
        gx: g.gx == null ? null : clampInt(g.gx, 0, G - 1, 0), gy: g.gx == null ? null : clampInt(g.gy, 0, G - 1, 0), placedMs: clampInt(g.placedMs, 0, s.cityMs, s.cityMs),
        houseId: typeof g.houseId === 'string' && bl.some((b) => b.id === g.houseId && b.type === 'house') ? g.houseId : null };
      if (q.gx != null && fitsGrid(tmp, occGrid(tmp), 1, q.gx, q.gy)) { q.gx = null; q.gy = null; note('grave waits for a place'); }
      s.graves.push(q);
    }
    s.ids.g = Math.max(clampInt(oi.g, 0, BIG, 0), maxNum(s.graves, 'g')); for (const x of s.graves) if (!x.id) x.id = 'g' + (++s.ids.g);
    for (const p of s.people) if (p.state === 'fallen' && !s.graves.some((g) => g.personId === p.id)) { s.graves.push({ id: 'g' + (++s.ids.g), personId: p.id, gx: null, gy: null, placedMs: s.cityMs, houseId: null }); note('missing grave restored'); }
    for (const p of s.people.concat(travelers)) if (p.kin && !s.people.some((q) => q.id === p.kin && q.state === 'fallen')) { p.kin = null; note('kin reference dropped'); }
    for (const p of s.people) {
      if (p.houseId && !bl.some((b) => b.id === p.houseId && b.type === 'house')) { p.houseId = null; note('house reference repaired'); }
      if (p.state === 'fallen') { p.houseId = null; if (!p.epitaph) p.epitaph = epitaph(s, p); }
    }
    if (fixBeds(Object.assign({}, t, { buildings: bl, people: s.people }))) note('bed overflow repaired');
    s.inn = { travelers, nextRefreshMs: ti.nextRefreshMs == null ? null : Math.max(0, Math.round(fin(ti.nextRefreshMs, s.cityMs))) };
    const innBl = bl.find((b) => b.type === 'inn');
    if (!innBl || innBl.lv < 1) { if (travelers.length || s.inn.nextRefreshMs != null) note('Inn travelers dropped'); s.inn.travelers = []; s.inn.nextRefreshMs = null; }
    else if (s.inn.nextRefreshMs == null) s.inn.nextRefreshMs = s.cityMs;
    s.night = clampInt(o.night, 0, BIG, 0);
    s.lastDest = DEST[o.lastDest] ? o.lastDest : 'D1';
    s.dest = {}; const od = isObj(o.dest) ? o.dest : {};
    for (const id of DATA.DEST_IDS) s.dest[id] = { cleared: isObj(od[id]) && od[id].cleared === true };
    // pending: a broken one is dropped and the runner comes home; its other keys (L, dest, force, odds, ...) are kept
    // as they are and checked where they are used (pendingInput, refsOf, settleRun)
    s.pending = null;
    const pe = o.pending;
    if (isObj(pe)) {
      const p = s.people.find((x) => x.id === pe.personId);
      if (p && p.state === 'out' && DEST[pe.destId] && typeof pe.runId === 'string') {
        s.pending = { runId: pe.runId, night: clampInt(pe.night, 0, BIG, 0), seed: uint(pe.seed, 0), destId: pe.destId, personId: p.id,
          source: pe.source === 'external' ? 'external' : 'sim', kit: isObj(pe.kit) ? { medkit: pe.kit.medkit ? 1 : 0, pills: pe.kit.pills ? 1 : 0, bomb: pe.kit.bomb ? 1 : 0 } : { medkit: 0, pills: 0, bomb: 0 },
          held: clampInt(pe.held, 0, BIG, 0), handoff: isObj(pe.handoff) ? clone(pe.handoff) : null, refs: isObj(pe.refs) ? clone(pe.refs) : null,
          falls: isObj(pe.falls) ? clone(pe.falls) : null, startedCityMs: clampInt(pe.startedCityMs, 0, s.cityMs, s.cityMs),
          warpS: pe.warpS == null ? null : Math.max(0, fin(pe.warpS, 0)) };
        for (const k of Object.keys(pe)) if (!(k in s.pending)) s.pending[k] = clone(pe[k]);   // keys added by later stages survive
      } else note('broken pending run dropped');
    }
    for (const p of s.people) if (p.state === 'out' && (!s.pending || s.pending.personId !== p.id)) { p.state = 'ready'; note('runner without a run came home'); }
    s.lastRun = isObj(o.lastRun) ? clone(o.lastRun) : null;
    s.goal = clampInt(o.goal, 0, GOALS.length, 0);
    const fl = isObj(o.flags) ? o.flags : {};
    s.flags = {}; for (const k of Object.keys(t.flags)) s.flags[k] = fl[k] === true;
    s.daily = { lastDay: isObj(o.daily) && o.daily.lastDay != null ? clampInt(o.daily.lastDay, 0, BIG, 0) : null };
    s.forcedWins = clampInt(o.forcedWins, 0, RULES.forcedWins, RULES.forcedWins);
    s.appliedRunIds = (Array.isArray(o.appliedRunIds) ? o.appliedRunIds : []).filter((x) => typeof x === 'string').slice(-100);
    const ot = isObj(o.tel) ? o.tel : {};
    s.tel = newTel();
    for (const k of Object.keys(s.tel)) {
      const d = s.tel[k], v = ot[k];
      if (v === undefined) continue;
      if (d === null) s.tel[k] = typeof v === 'number' && isFinite(v) ? Math.max(0, v) : null;
      else if (typeof d === 'number') s.tel[k] = typeof v === 'number' && isFinite(v) ? Math.max(0, v) : d;
      else if (k === 'towerAtMs') s.tel[k] = Array.from({ length: 11 }, (_, i) => (Array.isArray(v) && typeof v[i] === 'number' && isFinite(v[i]) ? Math.max(0, v[i]) : d[i]));
      else if (k === 'calib') s.tel[k] = Array.from({ length: 10 }, (_, i) => (Array.isArray(v) && Array.isArray(v[i]) ? [0, 1, 2].map((j) => Math.max(0, fin(v[i][j], 0))) : [0, 0, 0]));
      else if (isObj(d) && isObj(v)) { const m = {}; for (const kk of Object.keys(v)) if (typeof v[kk] === 'number' && isFinite(v[kk])) m[kk] = Math.max(0, v[kk]); s.tel[k] = m; }
    }
    const ol = isObj(o.lab) ? o.lab : {}, LR = DATA.LAB_RANGE;
    s.lab = clone(DATA.LAB_DEFAULT);
    if (LR.timeScale.includes(ol.timeScale)) s.lab.timeScale = ol.timeScale;
    if (typeof ol.runsAdvanceClock === 'boolean') s.lab.runsAdvanceClock = ol.runsAdvanceClock;
    if (ol.runWarp != null) s.lab.runWarp = clampInt(ol.runWarp, 0, 20, 6);
    if (LR.force.includes(ol.force)) s.lab.force = ol.force;
    if (LR.runScreenS.includes(ol.runScreenS)) s.lab.runScreenS = ol.runScreenS;
    s.lab.lockSeed = ol.lockSeed == null ? null : uint(ol.lockSeed, null);
    s.lab.waitReal = ol.waitReal === true;
    if (isObj(ol.mul)) for (const k of Object.keys(s.lab.mul)) s.lab.mul[k] = clamp(fin(ol.mul[k], 1), LR.mul[k][0], LR.mul[k][1]);
    if (Array.isArray(ol.rescueBase)) s.lab.rescueBase = s.lab.rescueBase.map((d, i) => (i === 0 ? 1 : clamp(fin(ol.rescueBase[i], d), 0, 1)));
    for (const k of ['clinicRescue', 'tiredFloor', 'escalationCap', 'downWindowMs', 'freeSec', 'skipExp', 'skipK']) if (ol[k] != null) s.lab[k] = clamp(fin(ol[k], s.lab[k]), LR[k][0], LR[k][1]);
    for (const k of ['escalationCap', 'downWindowMs', 'freeSec']) s.lab[k] = Math.round(s.lab[k]);
    s.lab.reducedMotion = ol.reducedMotion === true ? true : ol.reducedMotion === false ? false : null;
    s.ui = { sound: !(isObj(o.ui) && o.ui.sound === false) };
    s.ids = { b: s.ids.b, j: s.ids.j, r: s.ids.r, g: s.ids.g, d: s.ids.d };
    s.demo = o.demo === true;
    // a house with free beds takes any homeless present person
    for (const p of s.people) if (!p.houseId && (p.state === 'ready' || p.state === 'rest' || p.state === 'out')) assignHouse(s, p);
    // canonical key order (the same as create), so a clean save round-trips byte for byte
    const out = {}; for (const k of Object.keys(t)) out[k] = s[k];
    return out;
  }
  function load(raw, realNow, opts) {
    opts = opts || {};
    const fresh = () => create({ realNow, tzOffsetMin: opts.tzOffsetMin, seed: opts.seed });
    if (raw == null || raw === '') return { state: fresh(), status: 'new', notes: [] };
    let o;
    try { o = typeof raw === 'string' ? JSON.parse(raw) : clone(raw); } catch (e) { return { state: fresh(), status: 'corrupt-reset', notes: ['unreadable save'], bad: raw }; }
    if (!isObj(o)) return { state: fresh(), status: 'corrupt-reset', notes: ['unreadable save'], bad: raw };
    const v = typeof o.v === 'number' ? o.v : null;
    if (v != null && v > V) return { state: fresh(), status: 'future-version', notes: ['this save is from a newer version (v' + v + ')'] };
    const notes = []; let status = 'ok';
    if (v !== V) { o = migrate(o); status = 'migrated'; notes.push('migrated from v' + (v == null ? 0 : v)); }
    const s = sanitize(o, notes);
    settle(s, []);                                            // state-based rules at the saved time (a no-op for a clean save)
    return { state: s, status, notes };
  }

  // ------------------------------------------------------------------ #demo: a Tower-4 city like the mock (never saved)
  function demo(o) {
    o = o || {};
    const s = create({ realNow: o.realNow, tzOffsetMin: o.tzOffsetMin, seed: 20261104 });
    s.demo = true;
    const at = (lv) => ({ bubbleBase: 0, bubbleSinceMs: 0, lv });
    s.ring = 2; s.cityMs = 75 * MIN; s.night = 14; s.goal = 17; s.lastDest = 'D3';
    s.flags = { deathOn: true, deathCardSeen: true, strangerDone: true, metPeople: true, finale: false, paidSkip: true };
    for (const id of ['D1', 'D2', 'D3']) s.dest[id].cleared = true;
    s.forcedWins = 0; s.res = { bricks: 1240, cans: 380, sparks: 48 };
    const tw = s.buildings[0]; tw.lv = 4; tw.gx = 8; tw.gy = 8;
    const k1 = s.buildings[1]; Object.assign(k1, at(3), { gx: 12, gy: 7 });
    const h1 = s.buildings[2]; h1.lv = 2; h1.gx = 9; h1.gy = 15;
    s.ids.b = 3;
    const add = (type, lv, gx, gy, extra) => { const b = Object.assign({ id: 'b' + (++s.ids.b), type, lv, gx, gy }, extra || {}); s.buildings.push(b); return b; };
    const k2 = add('kiln', 2, 6, 12, { bubbleBase: 0, bubbleSinceMs: 0 });
    const cn = add('cannery', 2, 15, 7, { bubbleBase: 0, bubbleSinceMs: 0 });
    add('depot', 2, 15, 10); add('armory', 2, 7, 14); add('clinic', 1, 11, 12);
    add('house', 2, 12, 15, { houseIdx: 1 }); const inn = add('inn', 1, 15, 14);
    rebase(s, k1, s.cityMs, 0.4 * holdLv(s, 'kiln', 3)); rebase(s, k2, s.cityMs, 0.2 * holdLv(s, 'kiln', 2)); rebase(s, cn, s.cityMs, holdLv(s, 'cannery', 2));
    s.rubble = [{ id: 'r1', gx: 17, gy: 6, ring: 2, glint: true }, { id: 'r2', gx: 6, gy: 17, ring: 2, glint: false }, { id: 'r3', gx: 17, gy: 17, ring: 2, glint: false }];
    s.ids.r = 3;
    s.decor = [{ id: 'd1', type: 'tree', gx: 6, gy: 6 }, { id: 'd2', type: 'tree', gx: 11, gy: 6 }, { id: 'd3', type: 'tree', gx: 8, gy: 17 }, { id: 'd4', type: 'tree', gx: 17, gy: 9 }];
    s.ids.d = 4;
    s.jobs = [{ id: 'j1', kind: 'upgrade', target: k2.id, toLv: 3, startMs: s.cityMs - 48 * SEC, endMs: s.cityMs + 252 * SEC }];
    s.ids.j = 1;
    // people in every state the city shows (4.9): Ready walkers, a tired and a Hurt runner in the blue House ("z 2"), one
    // Recovering in the Clinic ("+1"), one Down (the Clinic's red pill, a lantern in the green House) and one grave
    const [efua, ngozi] = s.people;
    efua.lv = 3; efua.xp = 230; efua.runs = 7; efua.wins = 7; efua.kills = 610; efua.bestKills = 121; efua.nick = 'mower';
    efua.history.push([4, 'Night 4. Everyone calls Efua “Mower” now.'], [6, 'Night 6. Level 3.'], [13, 'Night 13. Night Market: home in 5:12, 121 kills.']);
    ngozi.lv = 2; ngozi.xp = 120; ngozi.runs = 4; ngozi.wins = 4; ngozi.kills = 300; ngozi.bestKills = 98;
    ngozi.history.push([12, 'Night 12. Car Wash: home in 4:05, 82 kills.']);
    const more = [];
    for (let i = 0; i < 5; i++) { const p = genPerson(s, { lv: i === 0 ? 2 : 1, how: i === 0 ? 'stranger' : 'inn' }); s.people.push(p); more.push(p); }
    const [burak, thiago, petros, joy, down] = more;
    for (const p of more) { p.arrivedMs = 6 * MIN; p.arrivedNight = 3; p.history = [[3, p.history[0][1].replace(/^Night \d+/, 'Night 3')]]; }
    burak.xp = 90; burak.runs = 2; burak.wins = 1; burak.revives = 1; burak.hurtCount = 1; burak.kills = 150; burak.bestKills = 86;
    burak.history.push([3, 'Night 3. Revived in the Clinic.'], [10, 'Night 10. Overrun at the Car Wash. Carried home.']);
    const h2 = s.buildings.find((b) => b.type === 'house' && b.houseIdx === 1);
    for (const p of [efua, ngozi, burak]) p.houseId = h1.id;
    for (const p of [thiago, petros, down]) p.houseId = h2.id;
    ngozi.state = 'rest'; ngozi.restKind = 'tired'; ngozi.restFromMs = s.cityMs - 4 * MIN; ngozi.restUntilMs = s.cityMs + 6 * MIN;
    burak.state = 'rest'; burak.restKind = 'hurt'; burak.restFromMs = s.cityMs - 9 * MIN; burak.restUntilMs = s.cityMs + 9 * MIN;
    thiago.runs = 1; thiago.wins = 1; thiago.kills = 52; thiago.bestKills = 52; thiago.history.push([8, 'Night 8. Allotments: home in 3:40, 52 kills.']);
    petros.runs = 2; petros.wins = 1; petros.revives = 1; petros.kills = 120; petros.bestKills = 71; petros.state = 'rest'; petros.restKind = 'recovering';
    petros.restFromMs = s.cityMs - 3 * MIN; petros.restUntilMs = s.cityMs + 6 * MIN;
    petros.history.push([12, 'Night 12. Overrun at the Night Market. Down.'], [12, 'Night 12. Revived in the Clinic.']);
    down.runs = 3; down.wins = 2; down.kills = 260; down.bestKills = 104; down.fellNight = 14; down.fellDest = 'D3'; down.fellOdds = 0.88; down.fellAt = 'gate';
    down.state = 'down'; down.downUntilMs = s.cityMs + 20 * HOUR; down.history.push([14, 'Night 14. Overrun at the Night Market. Down.']);
    joy.runs = 2; joy.wins = 1; joy.kills = 140; joy.bestKills = 80; joy.fellNight = 11; joy.fellDest = 'D3'; joy.fellOdds = 0.86; joy.fellAt = 'hordes'; joy.houseId = null;
    joy.history.push([5, 'Night 5. Allotments: home in 3:31, 61 kills.'], [11, 'Night 11. Overrun at the Night Market. Down.']);
    joy.state = 'fallen'; joy.epitaph = epitaph(s, joy);
    s.graves = [{ id: 'g1', personId: joy.id, gx: 7, gy: 17, placedMs: 50 * MIN, houseId: null }]; s.ids.g = 1;
    s.tel.downs = 3; s.tel.rescues = 1; s.tel.revivesCans = 1; s.tel.strangerRev = 1; s.tel.kitSpent = 420; s.tel.nicknames = 1;
    s.tel.graves = 1; s.tel.goodbyes = 1; s.tel.runs = 14; s.tel.wins = 11; s.tel.losses = 3; s.tel.firstGraveMs = 50 * MIN; s.tel.firstDownMs = 48 * MIN;
    s.tel.towerAtMs = [null, 0, 1.5 * MIN, 4 * MIN, 55 * MIN, null, null, null, null, null, null];
    s.tel.sparksIn = { tower: 16, goals: 5, firstClear: 12, daily: 5, rubble: 9 }; s.tel.sparksOut = { finish: 4 };
    inn.lv = 1; refreshInn(s, []); s.inn.nextRefreshMs = s.cityMs + 38 * MIN;
    return s;
  }

  return {
    V, SEC, MIN, HOUR, DAY, DATA_RULE,
    create, load, serialize, migrate, sanitize, tick, resume, advance, act, view, goal, info, derived, kpis, demo,
    odds, oddsKey, oddsCached, oddsTodo, oddsTable, kitDeltas, restedOdds, strip, suggest, autoKit, kitNorm, buildHandoff, runSim, validateResult, reward,
    offer, memorial, runCard, gallery, price, canPlace, suggestSpot, graveSpot, towerOpens, fmt,
    oddsCacheSize: () => CACHE.size, oddsCacheClear: () => CACHE.clear(),
    cost: (s, t, lv) => costOf(s, t, lv), jobMs, caps: (s) => ({ bricks: capOf(s, 'bricks'), cans: capOf(s, 'cans') }),
    rates: (s) => ({ bricks: rateOf(s, 'bricks'), cans: rateOf(s, 'cans') }), cranes: (s) => ({ total: cranesTotal(s), free: cranesFree(s) }),
    beds: bedsOf, bubble: (s, id) => { const b = byId(s, id); return b ? bubbleView(s, b) : null; },
    _internal: { settle, fall, addXp, assignHouse, gain, earn, spend, history, epitaph, genPerson, setDown, warpAtGo, runClockMs,
      restFrac, startHpFrac, restMulOf, welcome, refreshInn, completeJob, living, present, towerLv, capOf, rateOf, destOpen, DEST,
      settleRun, runInput, keyOf, pendingInput, recoverMs, nickFor },
  };
});
