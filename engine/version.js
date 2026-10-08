// Sim version and the "What's new" list shown on the page. Newest first. Keep CHANGELOG.md in step with this.
export const VERSION = '1.11.0';
export const CHANGES = [
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
