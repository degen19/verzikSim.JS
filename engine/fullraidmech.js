// Full raid solver briefing, for the "View mechanics & behavior" section (same layout as the bosses').
// Keep in step with fullraid-ui.js (the search) and engine/fullraid.js.
const R = (topic, scales, what, input = '') => ({ topic, scales, what, input });

export const FULLRAID_MECHANICS = {
  intro: [
    'The Full raid solver picks each room\'s setup and who drinks a surge in which room, for the rooms you tick, and plays the plans as whole raids: surge cooldowns, doses and Lightbearers / horns carry from room to room.',
    'Two searches: Normal (fast, screens plans on rooms played on their own) and Exhaustive (every surge plan, each room solved for exactly that plan). Effort sets how hard the room solvers search and how many raids each step plays.',
  ],
  sections: [
    { title: 'What it takes', rows: [
      R('Rooms', 'All', 'Nylocas, Sotetseg, Xarpus, Verzik - any run of them in raid order, with no gaps.', 'Room tickboxes'),
      R('Goal', 'All', 'A total time (or several) for the rooms ticked, or a breakpoint for each room. Rank by Goal time: the share of attempts under the goal. Rank by Success rate: the share that finish, then the median time.', 'Goal time / specific breakpoints; Rank by'),
      R('Min. success %', 'All', 'Plans that finish less often than this go to the bottom however fast they are - your team\'s risk tolerance.', 'Min. success %'),
      R('Surges', 'All', 'Each player\'s surge cooldown at the first room and how many doses they bring. A surge runs down its cooldown through the rooms (the Nylocas wave time included); a player out of doses doesn\'t surge.', 'Surge cooldown; doses'),
      R('Use my P1 chart', 'All', 'Verzik keeps your P1 chart. When a player\'s chart needs their surge - a P on it, or Dawn specs / spec transfers they can\'t afford without one - by the latest tick a surge still keeps every one of their chart\'s specs (a P can often go later; Verzik is also solved with those surges moved there and keeps the better) - plans that surge them in an earlier room are left out if that surge would still be on cooldown then (5 ticks of margin, at the rooms\' median times). A chart that needs a surge from a player with no doses is an error.', 'Use my Verzik P1 chart'),
      R('Room settings', 'All', 'Each room\'s own inputs live here too (Nylocas: wave times - required - max switches, Healer Tech, restores; Xarpus: heals; Verzik: supplies, horn and Lightbearer trading, Use my P1 chart). Gear comes from the Gear tab.', 'Per-room rows'),
    ] },
    { title: 'Normal search', rows: [
      R('1. Rooms solved twice', 'All', 'Each room is solved with surges allowed (everyone with a dose) and with none, in raid order; each room\'s cooldowns in are what\'s left after the rooms before at their median times.'),
      R('2. Surge choices', 'All', 'Every solved setup is also tried with each subset of its surgers dropped (not re-solved) - one room on its own, on the screening raids.'),
      R('3. Plans scored', 'All', 'Every combination of room choices - each player\'s doses all used, in whichever rooms (a later surge waits for the cooldown) - is scored from the rooms\' time spreads put together.'),
      R('4. Refine', 'All', 'Normal / Thorough effort: the best plan\'s rooms are re-solved for exactly its surgers, where that\'s a new choice, and the plans scored again.'),
      R('5. Whole raids', 'All', 'The best plans (12 / 20 / 30 by effort) are played as whole raids with the surge cooldowns carried for real, all on the same raids.'),
      R('Accuracy', 'All', 'Good, not exact: a plan has to make the top 12-30 on the room-by-room screen to be played as a whole raid, and most rooms use setups solved for "everyone surges" or "no surges" with surgers taken out rather than solved for that exact plan. Best when one plan is clearly ahead; close calls can come out in either order.'),
    ] },
    { title: 'Exhaustive search', rows: [
      R('Every plan', 'All', 'Every surge plan - who surges in which room, each player\'s doses all used, in whichever rooms. Each plan is played literally: its surges forced, each room solved for exactly that plan and the cooldowns it brings (cooldowns rounded to 10 ticks; a solve is reused by every plan with the same case).', 'Exhaustive surge plans'),
      R('Bounds', 'All', 'Before solving every plan, Verzik is played with every planned surge ready (the most it can give) and with only the fresh ones (the least). A plan whose best case is below the best plan\'s worst case (with a noise margin, or 5 points / 10 ticks clearly worse) is dropped - the closest 20 dropped plans are listed.'),
      R('Whole raids', 'All', 'The plans left are played as whole raids on the same raids and ranked; plans with identical results are shown once.'),
      R('Accuracy', 'All', 'The most accurate: no plan is missed by screening and every room is solved for its plan. What\'s left is the room solvers\' own search (set by Effort) and raid-to-raid noise.'),
    ] },
    { title: 'Effort, accuracy and time', rows: [
      R('Raids per plan', 'All', 'Whole raids per plan: Quick 500, Normal 1,000, Thorough 3,000. Room screening (Normal search): 200 / 300 / 600 raids per choice.', 'Effort'),
      R('Noise', 'All', 'A goal or success share near 50% is within about ±4.5 points at Quick, ±3.2 at Normal, ±1.8 at Thorough (95%; smaller near 0% or 100%). Every plan is played on the same raids, so the gaps between plans are firmer than that.'),
      R('Room solvers', 'All', 'Effort also sets each room solver\'s search (rounds and raids per test) - the bigger part of the time. Higher effort finds slightly better setups per room; it matters most for Verzik.'),
      R('Time', 'All', 'Measured on a 2-core test machine, 4-man, all four rooms: Normal search at Quick effort took 16 min; Exhaustive at Quick took 1 h 53 min (256 plans, 60 played exactly after bounds, 108 room solves). Normal / Thorough effort take longer (more raids per test and per plan). More cores is proportionally faster; Use my P1 chart cuts Verzik\'s solves a lot.'),
      R('Which to use', 'All', 'Normal search to try ideas and when one plan clearly leads. Exhaustive (Quick or Normal effort) for the final answer, or when the top plans are close or the team is weighing risk against speed.'),
      R('Pause', 'All', 'Pause holds a run where it is - the pieces already running finish, then it waits using no CPU - and Resume carries on with the inputs it started with. Reloading the page ends a run.'),
    ] },
  ],
};
