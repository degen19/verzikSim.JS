# Changelog

Newest first. The same list appears under **What's new** on the page (`engine/version.js`).

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
