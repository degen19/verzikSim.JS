# Changelog

Newest first. The same list appears under **What's new** on the page (`engine/version.js`).

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
