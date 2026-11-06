# Changelog

Newest first. The same list appears under **What's new** on the page (`engine/version.js`).

## v1.34.2 - 2026-11-06
- `index.html`: room tabs in raid order; Maiden and Bloat placeholders (disabled).

## v1.34.1 - 2026-11-06
- `raidview.js` / `img/icons`: Ascension crossbows (AX) and Dragon dart (DD) icons.

## v1.34.0 - 2026-11-06
- `engine/fullraid.js`: rooms per setup (`roomsOf`: Nylocas first when the setup has one), `runNylo` with surge cooldowns / doses carried, `playRoom` / `surgersOf` / `withSurgers` for Nylocas, `planScore` for any number of rooms; `fullraid-pool.js` ends / entries per room.
- `engine/nylo.js`: `surgeCd` (from the room's start - the waves run it down), `wave` / `waveDist`, `roomEnd`, players' `surgeAt`.
- `nylo-ui.js`: `api` (`fullRaidSolve`, `fullRaidShow`, `procedure`, `reportHtml`); report / solver tables without the mean.
- `fullraid-ui.js`: Nylocas block, rooms generalised through the solve and the results.

## v1.33.0 - 2026-11-06
- `engine/sim.js`: `surge_owed` / `swap_due` - Count surge in ring swap (`cfg.surgeInRing`, default on): a pending custom surge by reds r35 lowers the swap point by 25 (with the purple's 15); `CAMP.reds` (estimated in `p2.js`, real in `reds.js`); template column, builder, Optimizer write-back; swap log lines say what's to come.

## v1.32.0 - 2026-11-06
- `engine/nylo.js`: cross praying - `predictForm`, `partialSet` (weapon, then the best n-1 items together), `W` gear lookups with `p.ovr`, `plan.maxSwitches`, `plan.predictFlip`; `parseWaveTimes` / `drawWave` / `fmtWave`.
- `engine/nylosolve.js`: `predictionThresholds`, `predictionText`.
- `nylo-ui.js`: Max switches column, predictions line, Include wave time table, room time in the Report, Predictions by HP in the Solver.

## v1.31.1 - 2026-11-06
- `engine/vtree.js`: `specRules` splits tome specs by tick cluster (a gap over 5 reds ticks).

## v1.31.0 - 2026-11-06
- `nylo-ui.js`: Report charts (`histogramSvg`, `cumulativeSvg` with breakpoints).
- `engine/tome.js`: Scythe first hit after tome - no one-tome sequence before r16 (under 100%); forced tome on r16 with 50%+; no tome r17-r28; no claw that costs the r16 tome.

## v1.30.2 - 2026-11-06
- `engine/tome.js` / `reds.js`: Scythe first hit after tome with a shadow - a shadow on r16 from a distance (no bounce chance), not a scythe; bounced ZCB only without one.

## v1.30.1 - 2026-11-06
- `engine/tome.js`: with Scythe first hit after tome, the tome spec only from r29 (`TOME_SAT_FROM`; r31 on cadence), melee on r16, and no claw before r29 that leaves them under 50% by r31; `reds.js`: bounced -> `zcb_due` (shadow / ZCB, like a scyther).

## v1.30.0 - 2026-11-06
- `verzik_chart_template.xlsx`: 'Scythe first hit after tome' column after Tome Reds (every tab, sets A and B); `chartform.js` / `sim.js` (`cfg.scytheAfterTome`, `p.scythe_after_tome`) / `loadout.js` / `optimize.js` / `builder-ui.js`.
- `engine/tome.js`: with it on, `tome_plan` allows a scythe right after a buffed tome attack; a bounce at r16 sets `tome_lock = 'range'` (still from range next).

## v1.29.0 - 2026-11-06
- `engine/nylo.js`: duos (`plan.healer`: Healer Tech - Heal Other, locator orb + redemption, restore doses, Vengeance Other) and solos (`SOLO_UNDER` / `SOLO_HITS`: under him on ticks 1-4 / 6-9, his one attack a form; orb + redemption when low; Tumeken's shadow under him); `restores` and `offPrayVeng` options; Amulet of blood fury heals; no tome in solos.
- `nylo-ui.js`: solo - 5s; Healer Tech column (duos), Restore doses, Off pray veng if healthy; solos hide the backup BGS and thresholds.
- `img/icons/Nylo_boss_{melee,ranged,magic}.png`: his attack icons by form.

## v1.28.0 - 2026-11-06
- `engine/nylo.js`: Nylocas Vasilias - stats, forms (`formSchedule`), the instance cycle / boss time (`roomEnd`), players' attacks (scythe, Twisted bow + 2-tick hits by plan, Eye of ayak, claws, BGS, halberd, ZCB, tome with buffed autos and tome tick fix), his attacks with veng / prayer / takeoffs / under him / Heal Other / redemption, melee thralls; per-player plans (`normPlan`), backup BGS, Twisted-bows-only thresholds (`rangedStop`), late-Ayak skip option.
- `engine/nylosolve.js` (+ `nylo-solver-pool.js`, `nylo-solver-worker.js`): the Nylocas Solver and `rangedThresholds`.
- `nylo-ui.js`: the Nylocas tab; `app.js` / `index.html` wire it in.
- `gear.js` / `loadout.js`: Ascension crossbows, Diamond ascension bolts (e), Dragon dart.
- `raidview.js`: form tints (`sg` / `sb`), under-the-boss tint (`ub`), AX / DD names.

## v1.27.0 - 2026-11-06
- `reds.js`: `rl()` counts a reds attack and notes it in `p.reds_seq` ([r, code]; tome specs `T`/`Tm`/`Ts`/`Tsm`, autos `Tb`/`za`); `p.r16` 'out' / 'chance' at the bounce check; `tome_out16` true unless their r16 attack is melee.
- `optimize.js`: `redsTimedText` (spec ticks + r16); `runAfterP1` `out.proc` (proc tick, each player's spec / regen timer / period); `branchProfile` keeps `timed` / `btimed` (per counts line: its timed texts) and `samp` ([ticks to 50%, proc, first spec kind, its tick, r16]).
- `vtree.js`: lines shown as their usual timings, folded when they read the same, late claws as a tick range; `specRules` - proc-time (or 50%-by-rN) rules for players whose spec turns on their regen.

## v1.26.3 - 2026-11-05
- `p2.js` `shadow_numbers`: Magic `max(p.mag, 112)`; `verzTrace`: Sh stats at Magic 112.

## v1.26.2 - 2026-11-05
- `reds.js`: a bounced Tome Reds player sets `tome_lock` (next attack from range, by the plan) instead of `zcb_due`.
- `verzraid.js` `verzTrace`: `armour` per style (Sh / Zt: `cfg.mageGear` or the chart's mage columns + ring; others: `Player.pieces` - melee armour, Infernal cape, Avernic treads, Ferocious gloves / Confliction for T, E, Ayak, amulet, ring); Zt stats at Magic 112, duo shadow players start at 112; damage lines go to the attack whose line said `lands tN` (same weapon code) before the last attack; `Lightning rebound` player lines are her event; `(queued before shield)` lines are parsed.

## v1.26.1 - 2026-11-05
- Claw scratch: one hitsplat (`tome_turn`, `tome_values.Cs`, duo `fill_numbers` / `_fill` / set-2 scratches).
- Claw specs only by r39 in `reds.js` (standard and Tome Reds plan) and duo `set2_attack`; dropped the plan's r40 first-two-hitsplats claw value.

## v1.26.0 - 2026-11-05
- New `engine/tome.js`: `tome_numbers` (`tome_attack` at 112 Magic, their mage gear + ring, vs `P2_DEF[3]`; k 0 auto / 1 spec or buffed / 2 spec while buffed), `tome_values` (expected damage per attack), `tome_plan` (memoized DP over reds tick, spec, regen timer, buffed attacks left and the magic-gear lock: scythe, claw spec (first two splats only when the last two would land after r41), claw scratch, shadow, tome spec, tome auto, buffed auto, spec while buffed, wait; an attack counts if it goes off by r40 and lands by r41; ties go to the earlier damage). Tome queued [3, damage]; spec / auto 3 ticks, buffed 2.
- `reds.js`: Tome Reds players (`p.tome_reds` from cfg `tomeReds` and `hasTome`) skip the shadow plan / two-claw skip and play `tome_turn` from the plan; out of the r16 bounce (`tome_out16`) unless `tome_m16` (someone else skips / shadows from a distance / tomes). `duo_reds.js` set 2: the same, after the r40 halberd rule.
- Claw specs: hitsplats 3-4 land at t+2 (reds, duo reds, P3, solo).
- `verzraid.js` / `raidview.js`: TOME lines -> code `Zt` (icon img/icons/Zoryas_tome.png), `tl` S / M / A / a as cell borders; reds lines list tome specs / autos and claw scratches.

## v1.25.14 - 2026-11-05
- Sotetseg: spec `onlyIfNone` (backups only): counts as 'enough' once a maul landed that phase (`maulHits[ph] > 0`), event `backupNone:k:ph`. Spec planner checkbox "Only if 0 mauls landed" (with Backup), procedure text and decision-tree line; Solver neighbour toggles it (and swaps / pruning carry it).

## v1.25.13 - 2026-11-05
- `planner.js` `plan`: End spec (and the duo P2 projection's starting point) at P1's end (the Death tick, or the last charted tick) instead of the player's last charted spec / surge / regen, so regens in between count; the timeline runs to P1's end.

## v1.25.12 - 2026-11-05
- Optimizer: `surge_${i}` options (kind `time`: m:ss values or 'off', parsed with `surge_tick`); applying one sets `customSurgeTick` and drops the player's charted P actions. `cfgsToFields` writes Custom Surge Timing (and the chart without the P when one is set). The Verz Solver already had its Custom surge (m:ss) column.

## v1.25.11 - 2026-11-05
- `raidview.js` average hits: scythe attacks grouped by phase from the trace's P2 / P3 marks (by the tick the attack goes off; P2 includes reds); rows of one weapon kept together. Verzik averages count only scythes / Dawnbringer specs in P1 and only hits on Verzik (no crabs) from P2 on.

## v1.25.10 - 2026-11-05
- `withGearSet`: dropped the Shadow-without-a-shadow note (the builder already shows that box unticked / disabled, so the note contradicted it; the tick was and is ignored).

## v1.25.9 - 2026-11-05
- `verzTrace`: attack lines that mention a bounce (`SHADOW (distance, skips the bounce chance...)`, `SHADOW (bounced...)`) were dropped by the non-attack filter; attack lines are now exempt from it.

## v1.25.8 - 2026-11-03
- Xarpus Run report and the Full raid's Xarpus report: Show raid under the report (`reportRaids` in `xarpus-ui.js`: the report's own raids replayed from its seed, `xBar` / `xPlay` take a seed and raid count).

## v1.25.7 - 2026-11-03
- Xarpus: fix 'tick' ("Lose tick(s)") - the scythe's next attack 6 ticks later 75% of the time, 7 ticks 25% (an RNG draw only when it happens). Show raid: the average hits are a collapsible `<details>` (remembered: `verzikSim.rvSumMin`); 3-tick attacks grouped by the weapon (`x.weapon`); damage compared as rolled - Verzik attack lines' hitsplat lists (`rolledAll`, so hits past the kill count), P1 overkill lines with the roll when uncapped, Sotetseg / Xarpus hits still in the air at the kill.

## v1.25.6 - 2026-11-03
- `engine/expdmg.js`: exact mean / variance of an attack's damage (hitsplats landing with chance ch for max(1, 0..max), P1's counter cap, scythe's 3 splats and horn buff, the claws cascade (horned too), halberd + max/10, Dawn spec 75-150, ruby bolts). Verzik log lines carry `exp mean/variance` (read by `verzTrace`); the Sotetseg / Xarpus traces carry `exp` (Sotetseg also `rolled`: the hitsplats as rolled, damage past a maze threshold or the kill included). `raidview.js`: per-player cumulative damage / expected (`x.cum`), `data-xtip` tooltip block (green / red differences; hidden by the new Expected damage toggle), and the per-weapon average hit with its percentile (normal approximation from the attacks' means and variances) plus the average vengeance hit above the blocks. No RNG change - results unchanged.

## v1.25.5 - 2026-11-03
- Xarpus procedure table (`xarpus-ui.js` `procHtml(r, stats)`): after Show raid's 2,000 raids, "in raids" shares per player (specs from `specLog`, tick fixes from `fixes`); a planned ZCB under 1% of raids is shown as "Claws (ZCB planned - never 75% spec in time)" (or None). The table re-renders in place (`data-xproc`).

## v1.25.4 - 2026-11-03
- Show raid tooltips: "Accuracy: X%" (`acc` on trace attacks; an array for two rolls). Verzik: `acc X%` added to the log lines that lacked it (P1 Dawn spec / auto 100%, P2 last swing before the shield, reds blowpipe on a crab / collision shadow / halberds / bounced ZCB, duo reds crab and Verzik swings / claws / scratches / halberd, P3 scythe / 3-tick / scratch / claws / halberd, solo) and read by `verzTrace`; P3 3-tick attacks now drawn; P1 "lands after kill" lines no longer drawn as attacks. Sotetseg / Xarpus engines put `acc` on their trace entries (prefires and ZCB / Ralos at landing). Results unchanged (no RNG change).

## v1.25.3 - 2026-11-03
- `verzraid.js` `verzTrace`: a sip window's potion slots start at the player's last potion + 3 (they were drawn from the window line's tick, so could land 1-2 ticks after a sip); spec transfer lines -> `{xfer}` (spec tracking: the giver 0%, the target 100%). `raidview.js` timeline: `xfer` entries - `img/icons/Spec_transfer.png`, sharing the cell, tooltip. Xarpus timeline: his row - an attack (`Xarpus.png`) every 4 ticks from the exhumeds' end + 7 until the screech, then a turn (`Xarpus_turn.png`) every 8 ticks from the screech + 8 (one action skipped); Start / Screech marks.

## v1.25.2 - 2026-11-03
- Xarpus Show raid (`xarpus-ui.js`): a setup's 2,000 raids played once (seed `xshow`), Previous / Next through fastest / Top 10% / Top 25% / median / slowest / breakpoints (`raidview.js` timeline, starting at the exhumeds' end - new `from` option), failed raids if any, and the opening mauls landed split with a median example raid each. In the Solver's Procedure rows and the Full raid's Xarpus procedure (`api.procedure`). `runXarpus` trace now in the timeline's format (attacks with codes, landed tick, damage, spec and his Defence; horns, surges, regens, thralls, his HP per tick, exhumeds end / screech / death) and returns `openLanded` / `openMaulers`. Ralos Spec code `Ra` with its icon (`img/icons/Tonalztics_of_ralos.png`).

## v1.25.1 - 2026-11-02
- Reds (`engine/reds.js`, 3-5 man): a shadow plan (claw_first / shadow16) is set on r11 only if the shadow player is under 100% and won't project two claws, and no other player without a shadow plan projects two claws (`project_two_claws(q, r, r + 10)`); a shadow player with no shadow plan can be the r16 two-claw skipper, and never shadows from a distance while skipping. P2 horns in reds count in `reds_line.Hn` ("1 horn" in the line text; not counted as an attack); the decision tree adds each P2 horn's share of raids that reach reds. Full raid: the shown combination's three reports run in the background right after the solve (and when another combination is shown).

## v1.25.0 - 2026-11-02
- Full raid solver (`engine/fullraid.js`, `fullraid-ui.js`, `fullraid-pool.js` / `fullraid-worker.js`): Sotetseg -> Xarpus -> Verzik as one raid on one random stream per raid, surge cooldown (500 ticks, only ticking in rooms) and doses carried between rooms. Each room solved with surges allowed / none (plus re-solves for the best plan's surgers); every surge plan (any rooms per player within their doses, a later surge waiting for the cooldown) scored from the rooms' time distributions, the best played as whole raids. Rank by goal time or success rate; total-time or per-room breakpoints; Quick / Normal / Thorough. Its own per-room supplies; gear from the Gear tab (new Lightbearer tick); Enable trades for Lightbearers / horns. Use my Verzik P1 chart: an editable chart, loadable (as a copy) from Verz A / B / C. Results: Total / Top 25% / Top 10% / breakpoint % of all attempts, Finished, Verzik success (got to P3), room medians, surges by player; per boss Show procedure and Show report (the room's Run report, 20,000 raids, with the cooldowns / doses players come in with); total-time charts. `addSoteRun` / `addXarpusRun` split out of the room reports.

## v1.24.0 - 2026-10-28
- Solo Verzik (`engine/solo.js`, `engine/solosolve.js`, `engine/solomech.js`, `solo-ui.js`, solver pool / worker, CLI `cli/solo.mjs`): no chart - P1 Dawn spec off cooldown / autos on Lightbearer, P2 lightning + locator orb / Redemption, purples, Ayak P2 (Soul Rend magic defence drain), shadow options with deep proc, LB cycles before / in reds, reds sets back to back with Commit % by spec, P3 as duos (no webs tick loss, green ball tick-eat), heart and thrall all room. Report: Reds sets section (Mark reds sets), no '% of all attempts' for solos (deaths not tracked yet). Solver: Commit %, shadow mode, Ayak P2, godbook, LB cycles; target down. Sotetseg: entry instance per set.

## v1.23.0 - 2026-10-28
- Sotetseg (1-5 man): `engine/sote.js` (room sim: her attacks, orbs / prayer / veng, death ball, Heal Other, specs per player and phase, PID, mazes - pneck stall / shark / redemption skips / run), `engine/sotemaze.js` (maze generation + best route, ported from devqhp's trainer), `engine/soteplan.js` (spec planner), `engine/sotereport.js` (report), `engine/sotemech.js` (mechanics). Sotetseg tab (`sote-ui.js`): player settings, first / second maze, specs + spec planner, Report, entry-instance Optimizer. Gear tab: Locator orb, Soulflame horn, Bandos godsword. View mechanics & behavior: boss picker. CLI `cli/sote.mjs`.

## v1.22.0 - 2026-10-28
- Gear / Verzik top-level tabs (Sotetseg, Xarpus, Full raid placeholders), Solo scale (Gear only). Gear tab: per-player melee / ranged / magic slots (none / take off fallbacks), weapons, 3-tick weapon (Obligator > Eye of ayak > tome), Gear sets A/B/C linked per Verzik set (`engine/gearstore.js`, `withGear` after every `parse_chart`), saved teams; gear columns removed from the builder / Solver form; imports seed Gear sets. New items (Twisted bow, Zorya's tome, smoke sceptre / barrage, seeking arrows, Masori, void, Zaryte, ward, book of the dead...). Breaker -> Obligator. bloodFuryHp -> bloodFuryThreshold + 'Blood fury in' (P2 crabs / P2 Verzik / P3; never P1), Blood fury heal in P2 / reds / P3. Shadow settings ignored without a shadow in the Gear set. P3 Verzik ranged / magic max hit from her levels (33 / 32, +5% after a tornado). Page renamed Theater Of Blood Simulator.

## v1.21.0 - 2026-10-12
- Solver P1 rules (team settings, carried on every config as `dawnLimit` / `clawPickup`; solveRoom `o.dawnLimit` / `o.clawPickup`, CLI `--dawnlimit N` / `--clawpickup 1`): `placeRotation` rejects plans with more Dawn transfers (`dawnTransfers`: holder changes between Dawn slots) than the limit, and the beam stops handing the staff on once it is used up; `buildChart` / duo fills turn the receiver's last attack before a handed-over Dawn from SB into C (`clawOnPickup`). Your chart over the limit: run as charted only; editing starts from `fitTransfers` (shortest holder runs merged into a neighbour until it fits).

## v1.20.5 - 2026-10-12
- Optimizer speed: `countBatch` runs raid-major and plays P1 once per raid for setups with the same P1 settings (`p1Key` drops reds DCs, Boak, East bounce tech, deep proc, P2 shadow modes, 4-5 man purple DCs), continuing each from a `cloneGraph` copy with its own Player fields patched (`playerPatch`); results identical. Counts carry a per-raid signature (`sig`); round 1 runs 300 raids, merges setups with identical signatures (keeps the one closest to the chart), drops setups more than 4 standard errors behind the set's leader (looser breakpoint / success when the ranked one has under 30 hits), then finishes round 1 for the rest.

## v1.20.4 - 2026-10-11
- Breakpoint basis: Optimizer `score` / `finalScore(…, ofKills)` + #o-basis (remembered); Solver `ofKills` (score denominator = kills), form select `bpBasis`, columns "(of kills)", warning without a minimum success; CLI `--ofkills 1`.

## v1.20.3 - 2026-10-11
- Report: best value per row bold (splits per column within each split: lowest; Odds: higher better except deaths / depths / ticks / fastest run (lower); fastest run frequency not compared).

## v1.20.2 - 2026-10-11
- Page: Minimize / Show button in the tab bar (`body.tabs-min` hides the tab sections; any tab click shows them; localStorage `verzikSim.tabsMin.v1`).

## v1.20.1 - 2026-10-11
- Page: Minimize chart / Show chart toggle (`body.chart-min` hides #imp and #builder; localStorage `verzikSim.chartMin.v1`).

## v1.20.0 - 2026-10-11
- Verz Solver `shadowSearch` (3-5; every k-slot placement of the team's shadow settings - shadow, 3:1, while LB, camp, deep proc, mage - option pass before the side search, `shadowSrc` for the mage-gear copy) and `bpSearch` / `nBP` (all scales; every nBP-subset of blowpipe holders, P1 candidates per BP x LB assignment). Twin keys per candidate. Core key includes hasBP / shadow / deepProc / shadowSrc. CLI `--shadow 1`, `--bp N`. Form: Has BP column shows "Solver" when searched; Blowpipes count select.
- `makeContext`: no B in the attack table for a player without a blowpipe.
- Optimizer catalog: `lbHolders`, `bpHolders`, `shadowHolders` (same count, every placement); `validCfgs` skips a purple DC without a blowpipe; purple DC choices are every player when some have no blowpipe.
- Builder library: picking a chart loads its Set A into the open set (A, B or C); the other sets are kept.

## v1.19.1 - 2026-10-11
- Verz Solver form: Boak side column shows "Solver" when the side search is on; East pattern editable for every player then.

## v1.19.0 - 2026-10-10
- **East bounce tech** (`eastBounce`, team field 'East bounce tech' 0-3, 3-5 man; template column CW (4/5-man) / CZ (3-man), Sets A/B (C copies B); list validation 0-3; Mechanics row). P2 (p2.js): on a Verzik attack tick, East Boak players in melee mode, off cooldown, not Boak-blocked and not shadowing (camp / while LB / deep proc) attack instead of the +1 tick (3:1 skipped while chancing); 50% one of them is bounced (certain if all alive players chance); bounced: next attack `zcb_bounce` (melee helm/body/legs, Ferocious gloves, treads, ring + quiver +28/+4, rupture +20/+8, ZCB +110 / ruby dragon bolts +122, Rigour, rapid; lands t+3, 6.6% ruby proc 22% of current HP max 110 at landing, costs 10% HP), next attack t+5 (always a ZCB; Bounced ZCB is for reds). First N chancing ticks, max 2 bounces. `r2.east_bounce` stats. Default 0: same-seed results identical (3/4/5-man test charts).
- Optimizer catalog (3-5): `boak` (all W/E splits, at least one each side; moved East -> 0-T if no pattern) and `ebt` (0-3).
- Verz Solver: `ebtSearch` / `sideSearch` (Advanced toggles, CLI `--ebt 1` / `--sides 1`): option passes over eastBounce 0-3 and every W/E split (ring swaps re-run on change); core key includes sides / pattern / eastBounce; chart values write East/West Boak, East Pattern, East bounce tech. Solver form: East Pattern defaults to 0-T for every player.

## v1.18.2 - 2026-10-09
- Builder / Solver: redraws (Shadow and shadow-mode boxes) keep each `.scroll` table's horizontal scroll.

## v1.18.1 - 2026-10-09
- **One breakpoint rule**: `parseBreakpoints` rounds down to a tick; Optimizer `countBatch` and report `under()` count `end <= breakpoint` (were strictly faster). Labels "m:ss or faster". Success rates unchanged; breakpoint shares change where rooms end exactly on the tick.
- Optimizer `runOne` (duos): P1 / P3 wipes (`would_die` on both players) are failed raids, as in the Verz Solver. 3-5 man unchanged.
- Verz Solver: joint check after the reds DCs - for the 6 best core setups, each Lightbearer player's ring swap % +-10 (default -> 90 / 100) on each of its 3 best DC pairs, full raids; identical-outcome variants skipped. Solver form: 3-tick weapon defaults to Ayak (saved settings still at the chart default are moved to Ayak once).

## v1.18.0 - 2026-10-09
- Verz Solver **edits your chart**: `planFromChart` (Dawn order + holders, charted tick as the earliest, transfers / first surge onto the Dawn before them, start specs; duo dodges from the X ticks) and `planNeighbors` (holder change, adjacent holder swap, Dawn timing -4..+4 for a Dawn and the ones after it, all as early as possible, surge moved / added / dropped, transfer added / moved / dropped, start spec flip, last Dawn dropped / one added, all player permutations) in solver.js; `editCandidates` + an "Editing your chart" stage in `solveRoom` (rounds / width per depth: 1/2, 2/3, 3/4; best 3 kept per set, `edited: true`), worker command `edits`.
- 3-5 man **Dawn threshold searched 1-6%** (option pass after the purple re-check; setups start at 3%); removed from the 3-5 Solver form.
- **Diverse P1 candidates** (`p1Diverse`, Standard and Thorough): the 20 fastest + the fastest chart per end-of-P1 spec split (60-raid P1 sim, 10% steps; duos per dodge pattern), within 4 ticks of the fastest. Standard: p1Top 40, keep1 14, keepP2 24. Thorough: p1Top 60, beam 600, keep1 20, keepP2 30.
- Minimum success: 10 points of slack before the final (`succTol`), exact on the final. CLI: `--minbelow N` (your chart's success minus N), `--diverse`, `--succtol`, `--editrounds`, `--editwidth`, `--nomine`.

## v1.17.4 - 2026-10-09
- Verz Solver **Also try my chart** (default on; `seeds` option of `solveRoom`, CLI `--nomine` to leave out): each filled set of the page's chart runs as charted (always listed, outside the merge / minimum-success filters) and goes through the screen, ring / purple / P2 horn / duo passes, reds DCs + P3 horns and the final like the solver's own setups ("from your Set X"). Unset Boak sides take the form's side; a set the sim can't run is skipped with a note. Rows say when the set's settings differ from the form; Copy / Save use the set's own values.
- Claw rule removed (now optional `clawRule`, off): setups where someone misses their reds claw are ranked like any other.
- Solver P1 charts capped at the template's columns (`CHART_END` 80, `DUO_END` 140): Copy to set reproduces the solved chart exactly (checked 2-5 man).

## v1.17.3 - 2026-10-08
- **Dawn autos (A)** for Shadow players: max = floor(Magic/6) x (100 + mage gear mdmg + 4 Augury)/100 (`dawn_auto_max` in sim.js, gear.js ITEMS; mage helm/top/legs/cape from the chart + occult, treads, Confliction) - 23 at 112 in Ancestral + imbued sara cape (was 17). Non-shadow players unchanged (17). Same-seed results unchanged for 3-5 man test charts; duo charts with mage Dawn autos change. Verz Solver uses the same max. Mechanics sheet (codes row) updated.

## v1.17.2 - 2026-10-08
- Verz Solver duo P1: blowpipe not allowed on a+1 after a dodged auto (from a+2); Eye of ayak still on a+1.

## v1.17.1 - 2026-10-08
- Verz Solver: Advanced opens with a **Team supplies** group (Brew / Super combat / Restore sips, Sharks), every scale; template defaults, duos 32 brew sips.

## v1.17.0 - 2026-10-08
- **Verz Solver** tab (`solver-ui.js`, `solver-pool.js`, `solver-worker.js`; engine `engine/solver.js` P1 charts + `engine/roomsolver.js` room search; CLI `cli/solveroom.mjs`, `cli/solve.mjs`). Inputs: gear / prayer / 3-tick / Has BP / Boak side + East pattern (3-5) / custom surge / Shadow (+ modes in 3-5) / mage gear, team thresholds, supplies and the rest from the template's fields; number of Lightbearers and horns; breakpoints, rank by, minimum success %, depth.
- Searched: P1 chart (Dawn rotation, start spec 95/100, surges, spec transfers), Lightbearer assignment, ring swap % (blank or 10-100), purple DC, reds West/East DCs, horns (holder, P2/P3); duos: 2nd purple DC, shadow mode, Dawn / P2 last-hit threshold 1-5%. Everyone claws in reds (hard rule, 95%+ of raids). Same raids for every setup; identical-outcome options merged.
- Results: breakpoints (equal or faster, tick times) + success (+ wipe rate in duos), sortable; See setup with Copy to Set A/B/C and Save as chart (builder `setSet` / `saveChart`).
- Duo P1: dodge windows (no melee a-3..a+3, Dawnbringer only on a-1), Dawn autos mage only, ranger dodge pattern searched, pull-ups on the last auto before the kill.
- Sim: players record the phases they'd have gone below 0 HP in (no behaviour change; same-seed results identical).

## v1.16.1 - 2026-10-08
- 4 Claw Priority note (trio): better for a non-shadow player to push for 100% - give the last Dawn spec to a non-shadow player where possible (builder note + Mechanics sheet). `trio_shadow_alert` flipped: warns when the shadow player has the last Dawn (unless all have Shadow); it used to suggest moving Shadow onto the last-Dawn player. No sim behaviour change.

## v1.16.0 - 2026-10-08
- **Has BP** per player (gear table, all scales, default ticked; template + builder + parser). Without it: B in P1 skipped (chart check ✗), no blowpipe fills / crab blowpipe in reds, can't pop the purple. Purple DC without a blowpipe stops the run with an error. Optimizer purple-DC choices and 4 Claw Priority respect it.

## v1.15.2 - 2026-10-08
- Shadow mode rules: Shadow camp / 3:1 / Shadow while LB / Deep proc need Shadow; Shadow camp excludes 3:1 and Shadow while LB. Builder disables invalid boxes (tooltips), Optimizer skips invalid setups, imported charts get Run-tab notes.
- Builder note + Mechanics sheet: Shadow while LB takes priority over 3:1 (shadow on LB hits, then 3:1 after the swap); full priority Deep proc > camp > while LB > 3:1.
- Fix: 3:1 without Shadow no longer casts shadows (engine now clears shadow modes for non-shadow players).

## v1.15.1 - 2026-10-08
- Chart template calc sheet: the 95% start rule in every scale and set (helper cell per player = first Dawn tick + 1; regen held before it, R on it). Verified against the page planner on recalculated charts (100 player rows, 0 differences).

## v1.15.0 - 2026-10-08
- **95% start**: with no R on their chart, a player's regen is held until their first Dawn spec and an automatic R lands the tick after it (sim P1 + page spec planner). Charted R unchanged; players without a Dawn spec regen normally. Mechanics & behavior sheet updated.

## v1.14.0 - 2026-10-08
- **Multi-set optimize**: Set A / B / C checkboxes in the Optimizer; one sweep is applied to every ticked set (options a set lacks are skipped, duplicate setups dropped), all on the same raids, screened per set.
- Results per set, or **Combine into one ranked list** (Set column); Full report compares a setup with its own set as charted. Set names come from the Run tab labels.

## v1.13.1 - 2026-10-08
- Optimizer: Amulet (Rancour / Blood fury) back as a per-player option.

## v1.13.0 - 2026-10-08
- Optimizer: collapsible player sections (Expand all / Collapse all, "N varied" in each header).
- Mage gear per piece in the Optimizer (helm / top / bottom / cape). New mage helm options **Take off** (no helm) and **None** (keeps the melee helm) in the template's mage helm dropdown, the builder and the Optimizer.
- Optimizer options removed: melee helm / body / legs / amulet, melee prayer, Boak side, Redemption flick, Pass green if death. East Pattern only for East Boak players.

## v1.12.0 - 2026-10-08
- **Set C** (third comparison set): builder tabs A / B / C with copy between any two sets; Run tab Set C label; report, charts, Optimizer set picker and terminal runner (`--labels "A" "B" "C"`) take up to three sets. Saved charts / files include Set C.
- Set C is a page feature: the builder adds it as a copy of Set B's layout (`withSetC`); the chart reader also accepts a `SET C` block in a spreadsheet. The .xlsx template itself still has Sets A and B.

## v1.11.0 - 2026-10-08
- **Phases** on the Run tab and in the Optimizer: Full raid, P1 + P2 (to the end of P2) or P1 only. Report title, splits, odds and breakpoints follow the chosen phase. Terminal: `--phase full|p2|p1`.
- Each raid has its own random stream (`seed#i`), so the three phase modes play identical raids for a seed (results nest). Results for a given seed differ from v1.10.0 (statistically the same).

## v1.10.0 - 2026-10-08
- **4 Claw Priority** (trio, on by default; new team setting in the 3-man tab of the template and the builder): if Verzik's P1 dies in 11 or fewer Dawn specs, the player who didn't use their last Dawn (several: highest spec % out of P1, then closest to their next regen) prioritises 100% spec for reds - takes over the purple DC and camps Lightbearer until Ultor still gets both claws off by r36 (unreachable: until Ultor gives 80% by r40). The others camp Lightbearer until Ultor still gives one claw by r36. All 12 Dawns used / unchecked: rings as charted. Replaces the old shadow-camps-to-100% rule. Mechanics & behavior sheet updated.
- **Crystal halberd spec**: hits that pass accuracy roll 1..max, then +floor(max / 10) (was: roll up to a 10% higher max). Reds r40, duo reds, P3 and the P3 planner.
- Reds-start estimate for the ring guards never assumes a slower P2 than typical.

## v1.9.0 - 2026-10-08
- **Default ring swap** (Lightbearer, no Ring switch % and no Target spec): swap to Ultor the tick the Lightbearer regen in progress at P1's end lands (in the P1 to P2 gap or in P2). Previously they never swapped.
- **Reds guard:** only swap if Ultor still gets them 50% (one claw) by reds r36 (duo: set-2 r11); the reds start is estimated from the P2 pace. Otherwise keep Lightbearer and re-check on each regen.
- Swapping at P1's end when the regen lands after P2 starts was tested and was worse on every chart, so it isn't used (`FLAGS.DEFAULT_SWAP_P1`, off).
- Charts with a Ring switch % or Target spec give identical results to v1.8.1. Mechanics & behavior sheet updated.

## v1.8.1 - 2026-10-08
- Breakpoints are kept **per scale** on the Run tab and in the Optimizer. The Optimizer's breakpoints start blank (blank = rank by success rate); hints say `m:ss, comma-separated`.
- Report charts: **labels no longer overlap** - each label picks a free spot around its point (off other labels, marker dots and, where possible, the lines), with a leader line if it has to move away; labels have a background halo.
- Fixed: **Start search** pressed while the Optimizer was measuring speed hung the search (the speed test shut down the search's workers).

## v1.8.0 - 2026-10-08
- **Chart library** in "Build chart on this page": name a chart and **Save** it in this browser; the **Chart** list loads any saved chart (per scale); **Delete**; **New** starts blank. The bar shows unsaved changes.
- **Default charts**: listed in `defaults/index.json` (a builder .json or a filled .xlsx per entry, see `defaults/README.md`) and shown under "Default charts" in the same list.
- Save to file includes the chart name in the file name.

## v1.7.0 - 2026-10-08
- Report: new **"Finished by this time or faster - % of all attempts"** chart. Failed raids count as attempts, so each line levels off at that set's success rate (dashed). Same counting as the Optimizer.
- Report: Splits table and the existing charts are labelled as **successful runs only**, with kills / attempts per set.
- Run tab: optional **Breakpoints** (`5:21, 5:12, 5:00`): marked on the new chart and added to the Odds table ("Under 5:00 (all attempts)" / "(of kills)"). Terminal: `--bps "5:21, 5:12, 5:00"`.

## v1.6.1 - 2026-10-05
- Builder: **Clear chart** (P1 chart only) and **Lock chart** (locked chart can't be edited and is kept by Reset this set / Copy; per set; saved in the browser and in saved chart files).

## v1.6.0 - 2026-10-05
- Engine ~1.3-1.5x faster per core with bit-for-bit identical results: log text is only built when a log is being kept (`L.on && L(...)`), and P1's "last charted tick" is computed once per raid instead of every tick.
- Default threads: every logical core (max 32); `?threads=N` / `--threads N` to override.
- Report workers are warmed up in the background when a chart loads.
- Optimizer speed estimates reset (stored measurements predate the faster engine).

## v1.5.0 - 2026-10-05
- Multithreading: report runs split into 2,000-raid chunks across a reusable Web Worker pool (cores - 1, max 12). Each chunk has its own seeded random stream, so a given seed gives identical results on any machine / thread count (the simulation logic is unchanged).
- Fixed: merging very large runs (100k+ raids per worker) overflowed the call stack.
- Stop button for report runs; status shows threads and raids/second; main-thread fallback for small runs (< 4,000 raids) or no Web Worker support; `?threads=N` URL override.
- Terminal runner uses the same chunk plan (`--threads N`), so it matches the browser for a given seed.
- `tests/parity.mjs`: identical-across-threads check, comparison with the old single-stream method, and a speed benchmark.

## v1.4.0 - 2026-10-05
- 4 and 5-man reports: "P3 20% on or before tick 72 (before webs, of kills)" - share of successful runs where Verzik drops below 20% in P3 by tick 72 (tick 1 = P3 attackable).

## v1.3.2 - 2026-10-05
- Mechanics & behavior sections are collapsible dropdowns (closed until clicked), with Expand all / Collapse all; a search opens the matching sections. Top toggles restyled as dropdown buttons.

## v1.3.1 - 2026-10-05
- "View mechanics & behavior" at the top of the page shows the template's Mechanics & behavior sheet (read from the template, so it always matches), with search and a scale filter.

## v1.3.0 - 2026-10-05
- Dark mode is the default; a Light mode / Dark mode switch (top right) remembers your choice.
- The page's P1 chart uses the spreadsheet's code colours; Verzik auto-tick columns are tinted; unknown codes turn red.

## v1.2.1 - 2026-10-05
- Video walkthrough added to the top of the page ("Watch the video walkthrough").

## v1.2.0 - 2026-10-05
- **East Pattern** (3-5 man): new dropdown next to East Boak. **A** = the standard East boak pattern (unchanged behaviour). **0-T** = an East Boak player loses no ticks when a purple spawns and keeps attacking at the normal pace. B, C and FLEX are planned.
- Chart template updated with the East Pattern column. Older charts still work - a blank East Pattern counts as A.
- Optimizer (3-5 man): Boak side and East Pattern can be varied per player.

## v1.1.0 - 2026-10-05
- **Build a chart on the page** ("Build chart on this page"): the spreadsheet template's inputs for each scale, Set A / Set B, the spec planner (End spec, Room Time, LB swings, Time of regen - same math as the sheet, without the P1 kill-odds estimate) and the chart checks. Saved in your browser; can be saved to / opened from a file. An imported .xlsx can be copied into the builder.
- **Optimizer** tab: choose which chart inputs to vary (ring swap %, death charges, deep proc, gear, prayers, mage cape/armour, shadow modes, toggles), set your own time breakpoints, see the estimated run time, then search. Setups are compared on identical raids; finalists are confirmed on fresh raids.
- Duo report: **Fastest completed run** and how often it happened.
- Duo report: average **1st and 2nd reds depth** (Verzik HP % at the shield) for the median, top 10%, top 25% and bottom 25% of room times.
- Reports show the sim version they were made with.

## v1.0.0 - 2026-10-05
- First web release: run 2-5 man charts in the browser (all CPU cores) or from the terminal, and download the HTML report.
