# Changelog

Newest first. The same list appears under **What's new** on the page (`engine/version.js`).

## v1.15.0 - 2026-10-08
- **95% start**: with no R on their chart, a player's regen is held until their first Dawn spec and an automatic R lands the tick after it (sim P1 + page spec planner). Charted R unchanged; players without a Dawn spec regen normally. Mechanics & behavior sheet updated. (The spreadsheet's own calc-sheet planner columns still expect the R to be charted.)

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
