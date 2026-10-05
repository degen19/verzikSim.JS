// Sim version and the "What's new" list shown on the page. Newest first. Keep CHANGELOG.md in step with this.
export const VERSION = '1.2.1';
export const CHANGES = [
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
