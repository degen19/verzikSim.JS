# Changelog

Newest first. The same list appears under **What's new** on the page (`engine/version.js`).

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
