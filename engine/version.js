// Sim version and the "What's new" list shown on the page. Newest first. Keep CHANGELOG.md in step with this.
export const VERSION = '1.18.2';
export const CHANGES = [
  { version: '1.18.2', date: '2026-10-09', items: [
    'Chart builder and Verz Solver: ticking Shadow or a shadow mode (far right of the gear table) no longer scrolls the table back to the left.',
  ] },
  { version: '1.18.1', date: '2026-10-09', items: [
    'Breakpoints work the same everywhere: times are rounded down to a tick (0.6s) and a raid counts if it finishes at that time or faster - in the Run report, the Optimizer and the Verz Solver. (The report and the Optimizer used to count only raids strictly faster than the time typed, so a room ending exactly on the breakpoint tick didn\'t count.) Labels now read "2:48.6 or faster".',
    'Optimizer (duos): a raid where both players die in P1 or P3 counts as a failed raid, like in the Verz Solver.',
    'Verz Solver: for the best setups, each Lightbearer player\'s ring swap % is tried 10 higher and 10 lower together with the setup\'s best reds DC pairs (a DC\'s +15 can change which ring swap % works best). Players\' 3-tick weapon now defaults to Eye of ayak.',
  ] },
  { version: '1.18.0', date: '2026-10-09', items: [
    'Verz Solver: your chart is now also edited. From each filled set\'s own Dawn rotation, the solver tries every chart one change away - who has each Dawn, Dawns earlier or later, surges, spec transfers, start specs, and players swapping whole roles - keeps the best and edits those again (Quick 1 round, Standard 2, Thorough 3). The best few go through the full search with your chart\'s settings ("edited from your Set A").',
    'Verz Solver (3-5 man): the Dawn threshold is now picked by the solver (1-6%) instead of being a form input - it decides how much spec is saved at the end of P1 for the claws in reds. See setup shows it, and Copy to set / Save as chart write it into the chart.',
    'Verz Solver: a wider P1 search on Standard and Thorough. Besides the fastest P1 charts, the fastest chart for each way the spec ends up split between players at the end of P1 goes into the room search (who has the spec for the claws in reds decides a lot of raids). Thorough also searches more Dawn rotations and keeps more setups through each stage. Searches take longer than before.',
    'Verz Solver: the minimum success % is applied on the final run only (the early stages allow 10 points under it), so setups aren\'t cut before their ring swaps, thresholds and horns have been tuned.',
  ] },
  { version: '1.17.4', date: '2026-10-09', items: [
    'Verz Solver: new "Also try my chart" option (on by default). Every filled set (A, B, C) of the chart on this page - imported or built - is run exactly as charted and always listed ("Your Set A"), and also goes through the same search (ring swap %, purple, reds DCs, horns; duos: 2nd purple, shadow mode, thresholds) - those rows say "from your Set A". So the results are never worse than your own chart. If your set\'s settings differ from the Solver form (gear, prayer...), the results say which, since those rows use your chart\'s own settings. Copy to set / Save as chart on those rows keep your chart\'s settings.',
    'Verz Solver: setups where a player misses their claw in reds are no longer left out - the setups are ranked on breakpoints and success like any other.',
    'Verz Solver: the solved P1 chart is kept within the chart\'s columns (80 ticks in 3-5 man, 140 in duos), so Copy to set always plays exactly like the solved setup.',
  ] },
  { version: '1.17.3', date: '2026-10-08', items: [
    'Dawnbringer autos (A) for Shadow players now use their mage gear and Augury: max hit = Magic / 6 (rounded down) x (100 + the magic damage of their mage helm, top, legs and cape + occult 5 + Avernic treads 2 + Confliction gauntlets 7 + Augury 4)%. A duo mage at their boosted 112 Magic in Ancestral with an imbued saradomin cape hits up to 23 (it was 17). Other players\' Dawn autos are unchanged (17).',
    'This changes results for charts where a Shadow player uses Dawn autos (mostly duos); every other chart gives the same results as before with the same seed. The Verz Solver now weighs the mage\'s Dawn autos against scythes the same way.',
  ] },
  { version: '1.17.2', date: '2026-10-08', items: [
    'Verz Solver (duos): no blowpipe on the tick after a Verzik auto you dodge - it\'s too far away; it can fire from the tick after that. Eye of ayak still goes on the tick after.',
  ] },
  { version: '1.17.1', date: '2026-10-08', items: [
    'Verz Solver: the team\'s supplies have their own group at the top of Advanced - Brew sips, Super combat sips, Restore sips and Sharks - editable in every scale (defaults as in the chart template; duos start at 32 brew sips).',
  ] },
  { version: '1.17.0', date: '2026-10-08', items: [
    'New: the Verz Solver tab (next to Optimizer), every scale. Set the team\'s gear and settings (Team, Players and Advanced sections, saved per scale in this browser) - you don\'t chart anything. The solver writes the P1 chart and picks the start specs, who wears Lightbearer (from how many rings the team has), each Lightbearer player\'s ring swap %, the purple DC and the reds West/East DCs. 3-5 man: also who holds each Soulflame horn (2 in 5s, 1 otherwise by default) and whether it\'s used in P2, P3 or both. Duos: also the 2nd purple DC, the mage\'s shadow mode (Shadow camp, 3:1, Shadow while LB, or 3:1 + Shadow while LB) and the P1 Dawn and P2 last-hit thresholds (1-5%).',
    'Everyone has to claw in reds: setups where a player misses their claw are never suggested. Custom surge timing: blank lets the solver place the surge in P1; filled, the surge is on cooldown until that room time.',
    'Results like the Optimizer: breakpoints (a raid counts if it is equal or faster - times round down to a tick) and raid success, ranked by the breakpoint you pick or by success; click a column to sort it. Optional minimum success %: if no setup reaches it, the setups with the highest success are shown instead. Duos also show the wipe rate (both players die in P1 or P3), which counts as a failed raid.',
    'See setup: the P1 chart and every choice the solver made. Copy to Set A, B or C puts it into Build chart on this page (to run reports or optimize it), and Save as chart keeps it, named, in your chart library.',
    'Duo P1 charts follow the duo rules: no melee from 3 ticks before to 3 ticks after an auto you dodge, only the Dawnbringer the tick before it, Dawn autos for the mage, and pulling up on the last auto before the kill when it helps.',
    'The search uses every core of your computer. Search depth: Quick, Standard or Thorough.',
  ] },
  { version: '1.16.1', date: '2026-10-08', items: [
    '4 Claw Priority note (trios): it\'s better for a non-shadow player to push for 100% spec in reds, so where you can, give the last Dawn spec (the one most likely to go unused) to a non-shadow player. Added to the chart builder and Mechanics & behavior. The trio shadow alert now warns when the shadow player has the last Dawn spec (it used to suggest the opposite). No change to results.',
  ] },
  { version: '1.16.0', date: '2026-10-08', items: [
    'Has BP: a new checkbox per player in the gear table (every scale; ticked by default, and older charts count as ticked). Unticked: no blowpipe in P1 (B is flagged in the chart checks), no blowpipe tick fills or crab blowpipe in reds, and the player can\'t pop the purple crab.',
    'If the purple DC (1st or 2nd purple in duos) has no blowpipe the sim won\'t run: "A blowpipe is required to pop the purple crab. Either change the player who DC\'s purple, or add a blowpipe to [player]". The Optimizer only offers blowpipe owners as the purple DC, and 4 Claw Priority only hands the purple DC to a player with a blowpipe.',
  ] },
  { version: '1.15.2', date: '2026-10-08', items: [
    'Shadow modes: Shadow camp, 3:1, Shadow while LB and Deep proc can only be ticked for a player with Shadow ticked, and Shadow camp can\'t be combined with 3:1 or Shadow while LB (the chart builder greys these out and says why; the Optimizer skips such setups).',
    'Note on the chart builder and in Mechanics & behavior: Shadow while LB takes priority over 3:1 - with both ticked, they shadow on Lightbearer hits, then 3:1 after the ring swap.',
    'Fixed: 3:1 ticked for a player without Shadow made them cast shadows in P2. Imported charts with these combinations now run with a note saying what was ignored.',
  ] },
  { version: '1.15.1', date: '2026-10-08', items: [
    'Chart template: the spreadsheet\'s own End spec / Room Time / LB swings / Time of regen columns now follow the 95% start rule too (no R charted: regen held until the first Dawn spec, forced regen the tick after). Download the template again to get it.',
  ] },
  { version: '1.15.0', date: '2026-10-08', items: [
    'Players starting at 95%: if their chart has no R, they get no regen before their first Dawn spec, then a forced regen (as if R) on the tick after it - so a regen can never take them from 95% to 100% before they spec. Applies to the sim and the page\'s spec planner; a charted R works as before.',
  ] },
  { version: '1.14.0', date: '2026-10-08', items: [
    'Optimizer: optimize several sets at once. Tick Set A, B and/or C (sets with a filled P1 chart), choose the inputs to vary once, and every ticked set is searched with them on the same raids. Options a set doesn\'t have are skipped for that set.',
    'Results: one ranked table per set, or tick "Combine into one ranked list" for a single ranking across all sets (with a Set column). Switching views doesn\'t re-run anything. Sets are named with the Run tab\'s set labels.',
  ] },
  { version: '1.13.1', date: '2026-10-08', items: ['Optimizer: Amulet (Rancour / Blood fury) is back as a per-player option.'] },
  { version: '1.13.0', date: '2026-10-08', items: [
    'Optimizer: each player\'s options sit in a collapsible section (closed by default, with Expand all / Collapse all; the header shows how many options you\'re varying).',
    'Optimizer: mage gear is chosen per piece - Mage helm, Mage top, Mage bottom (plus Mage cape) - instead of a whole Ancestral / Virtus set.',
    'New mage helm options, in the chart (template and builder) and the Optimizer: Take off (no helm at all while shadowing) and None (keeps the melee helm on).',
    'Optimizer: removed melee gear (helm, body, legs, amulet), melee prayer, Boak side, Redemption flick and Pass green if death. East Pattern is only offered for East Boak players.',
  ] },
  { version: '1.12.0', date: '2026-10-08', items: [
    'Set C: a third setup to compare. "Build chart on this page" has Set A / Set B / Set C tabs (copy any set to any other), the Run tab has a Set C label, and the report, charts and Optimizer handle all three. Saved charts and chart files include Set C.',
    'Set C lives on the page: the spreadsheet template still has Sets A and B (an imported chart can be copied to the page with "Edit this chart on the page" and given a Set C there).',
  ] },
  { version: '1.11.0', date: '2026-10-08', items: [
    'Phases: the Run tab and the Optimizer can simulate the Full raid, P1 + P2 (stops when P2 dies) or P1 only. Times, splits, success and breakpoints then refer to the end of that phase. P1 only runs about 3x faster than a full raid.',
    'Every raid now has its own random stream, so with the same seed P1 only, P1 + P2 and Full raid play the very same raids (success always nests: Full <= P1 + P2 <= P1). Same seed still gives the same result on any computer or thread count.',
  ] },
  { version: '1.10.0', date: '2026-10-08', items: [
    '4 Claw Priority (trio, on by default - new checkbox in the 3-man team settings, and in the chart template). If Verzik\'s P1 dies in 11 or fewer Dawn specs, the player who didn\'t use their last Dawn (if several: highest spec % out of P1, then closest to their next regen) prioritises 100% spec for reds. They take over the purple DC and camp Lightbearer until Ultor still gets both claws off by r36 - or, if that can\'t be reached, until Ultor gives 80% by r40. The others camp Lightbearer until Ultor still gives one claw by r36. All 12 Dawns used, or unchecked: rings follow the chart. This replaces the old "shadow player camps Lightbearer to 100%" rule.',
    'Crystal halberd spec damage corrected: each hit that passes accuracy rolls 1 to your normal max hit, then adds 10% of that max (rounded down). It used to roll up to a 10% higher max instead. Applies to reds r40, duo reds and P3.',
    'The reds-start estimate used by the ring-swap guards never assumes a slower P2 than typical, so nobody swaps to Ultor too early.',
  ] },
  { version: '1.9.0', date: '2026-10-08', items: [
    'Default ring swap: a Lightbearer player with no Ring switch % and no Target spec now swaps to Ultor the tick the Lightbearer regen in progress at the end of P1 lands (during the P1 to P2 gap, or early in P2). Before, they stayed on Lightbearer for the whole room.',
    'Reds guard: they only swap if they would still reach 50% (one claw) by reds r36 on Ultor (duo: set-2 r11), using the P2 pace to estimate when reds start. Otherwise they keep Lightbearer and check again on each regen.',
    'A filled Ring switch % or Target spec works exactly as before (results are identical).',
  ] },
  { version: '1.8.1', date: '2026-10-08', items: [
    'Breakpoints are kept per scale (Run tab and Optimizer), so duo times don\'t follow you to 4-man. The Optimizer\'s breakpoints start blank: leave them blank to rank by success rate.',
    'Report charts: labels are placed so they never overlap each other or the marker dots, and stay off the lines where possible (with a thin pointer line when a label has to move away).',
    'Fixed: pressing Start search while the Optimizer was still measuring this computer\'s speed could make the search hang with no progress.',
  ] },
  { version: '1.8.0', date: '2026-10-08', items: [
    'Chart library (Build chart on this page): give a chart a name and Save it in this browser. Pick any saved chart from the Chart list to load it, and Delete it from the same bar. The bar shows when the page has unsaved changes.',
    'Default charts: ready-made charts appear in the same Chart list (under "Default charts") for the selected scale. Loading one gives you a copy - save it under your own name to keep changes.',
    'New starts a blank chart. Save to file now uses the chart\'s name in the file name.',
  ] },
  { version: '1.7.0', date: '2026-10-08', items: [
    'Report: new chart "Finished by this time or faster - % of all attempts". Failed raids count as attempts, so each line levels off at the set\'s success rate (dashed line). This is your odds per attempt, the same way the Optimizer counts.',
    'Report: the Splits table and the existing charts now say clearly that they use successful runs only, with the number of kills out of all attempts for each set.',
    'Run tab: optional Breakpoints (e.g. 5:21, 5:12, 5:00). They are marked on the new chart and added to the Odds table as "Under 5:00 (all attempts)" and "(of kills)". Remembered in your browser.',
  ] },
  { version: '1.6.1', date: '2026-10-05', items: [
    'Chart builder: "Clear chart" empties just the P1 chart (everything else stays).',
    'Chart builder: "Lock chart" protects the P1 chart - its cells can\'t be edited, and "Reset this set" / "Copy" leave it alone while resetting or copying everything else. Each set has its own lock, saved with the chart.',
  ] },
  { version: '1.6.0', date: '2026-10-05', items: [
    'Faster: the simulator runs about 1.3-1.5x faster per core (the detailed raid log is no longer built when nobody is reading it, and a per-tick chart lookup now happens once per raid). Results are exactly the same as before.',
    'Uses every logical core by default (was cores minus one). Add ?threads=N to the address to use fewer.',
    'Workers warm up in the background as soon as a chart is loaded, so the first run starts at full speed.',
    'Optimizer run-time estimates re-measured for the faster engine.',
  ] },
  { version: '1.5.0', date: '2026-10-05', items: [
    'Multithreading reworked: report runs are split into 2,000-raid chunks shared across reusable Web Workers (cores minus one, up to 12). The same seed now gives exactly the same results on any computer and any number of threads.',
    'Very large runs (hundreds of thousands to millions of raids) no longer fail when the results are combined.',
    'Stop button for report runs. The status line shows threads used and raids per second. Small runs and browsers without Web Workers run on the main thread with identical results.',
    'Add ?threads=N to the page address to choose the thread count (also used by the Optimizer).',
  ] },
  { version: '1.4.0', date: '2026-10-05', items: ['4 and 5-man reports: new row "P3 20% on or before tick 72 (before webs, of kills)" - how often Verzik drops below 20% in P3 by tick 72 (tick 1 = P3 attackable), as a share of successful runs.'] },
  { version: '1.3.2', date: '2026-10-05', items: ['Mechanics & behavior: each section is its own dropdown (collapsed until clicked), with Expand all / Collapse all; searching opens the matching sections. The top toggles look like dropdown buttons.'] },
  { version: '1.3.1', date: '2026-10-05', items: ['"View mechanics & behavior" at the top of the page: the full Mechanics & behavior sheet from the chart template, with search and a scale filter.'] },
  { version: '1.3.0', date: '2026-10-05', items: [
    'Dark mode (the default): a Light mode / Dark mode switch at the top right remembers your choice.',
    'P1 chart on the page uses the same code colours as the spreadsheet (Dawn spec purple, Scythe green, surge pink, X dark grey, spec transfers green...), auto-tick columns are tinted, and unknown codes turn red.',
  ] },
  { version: '1.2.1', date: '2026-10-05', items: ['Video walkthrough: "Watch the video walkthrough" under the intro at the top of the page.'] },
  {
    version: '1.2.0', date: '2026-10-05',
    items: [
      'East Pattern (3-5 man): a dropdown next to East Boak. A = the standard East boak pattern (no change from before). 0-T = an East Boak player loses no ticks to the purple spawn and keeps attacking at the normal pace. B, C and FLEX are coming later.',
      'Chart template updated with the East Pattern column (download it again from the link at the top). Older charts still work: a blank East Pattern counts as A.',
      'Optimizer (3-5 man): can now vary each player\'s Boak side and East Pattern.',
    ],
  },
  {
    version: '1.1.0', date: '2026-10-05',
    items: [
      'Build a chart right on the page ("Build chart on this page"), with the same inputs as the spreadsheet template, the spec planner (End spec, Room Time, LB swings, Time of regen) and chart checks. Saved in your browser; can be saved to / opened from a file.',
      'Optimizer tab: pick which chart inputs to vary (ring swap %, death charges, deep proc, gear, prayers, shadow modes, toggles), set your own time breakpoints, and the page searches for the setups that beat them most often. Shows an estimated run time first.',
      'Duo report: "Fastest completed run" and how often it happened.',
      'Duo report: average 1st and 2nd reds depth (Verzik HP % at the shield) for the median, top 10%, top 25% and bottom 25% of room times.',
      'Reports show the sim version they were made with.',
    ],
  },
  {
    version: '1.0.0', date: '2026-10-05',
    items: ['First web release: run 2-5 man charts in the browser and download the report.'],
  },
];
