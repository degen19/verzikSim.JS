// Xarpus mechanics & behavior, for the "View mechanics & behavior" section (same layout as Sotetseg's).
const R = (topic, scales, what, input = '') => ({ topic, scales, what, input });

export const XARPUS_MECHANICS = {
  intro: [
    'How the Xarpus sim plays the room, tick by tick (0.6s). Players are set up in the Xarpus tab, gear comes from the Gear tab.',
    'Times in the report: the exhumeds, attackable to 25% (the screech), 25% to the kill, and the room (it ends on the killing hit).',
  ],
  sections: [
    { title: 'The room', rows: [
      R('HP', 'All', 'Base HP 5080 in 5s; 4445 in 4s; 3810 in trios, duos and solos. The screech comes at 25% of this.'),
      R('Stats', 'All', 'Defence 250 (no floor - it can go to 0), Magic 220. Stab / slash / crush defence 0, ranged 160, magic 0.'),
      R('4-tick cycle', 'All', 'Xarpus acts on a 4-tick cycle (i0 = a tick divisible by 4); the exhumeds always end on an i0.'),
      R('Damage to players', 'All', 'Not simulated - it doesn\'t matter in this room. No supplies.'),
    ] },
    { title: 'Exhumeds', rows: [
      R('Length', 'All', 'Interactable on t100 (solo), t92 (duo), t116 (trio), t84 (4s), t96 (5s); everyone\'s first attack the tick after.'),
      R('His HP after', 'All', 'He drops to 2928 (solo), 2905 (duo), 2910 (trio), 3560 (4s), 4127 (5s), then heals 20 / 16 / 12 / 9 / 8 per heal (a missed tick on an exhumed).', 'Number of heals (each set)'),
      R('Heals', 'All', 'Default: the Blert average for the scale (5s 1, 4s 7, 3s 4, duos 5, solos 8). Each raid uses the number +- 2 (evenly, never below 0), unless Exact heals is ticked.', 'Number of heals; Exact heals'),
    ] },
    { title: 'Defence', rows: [
      R('Elder maul', 'All', 'Planned mauls go on their first attack. A hit lowers his Defence by 35% as the attack is made (anyone after them that tick rolls against it - random PID each raid); +25% accuracy.', 'Defence spec'),
      R('BGS', 'All', 'After the mauls have landed: 2x accuracy, max x1.1 x1.1; a hit lowers his Defence by the damage.', 'Defence spec'),
      R('Ralos Spec', 'All', 'After the mauls have landed, in their best ranged gear (Rigour): two hits, each 0-75% of their ranged max, +50% accuracy, landing 3 ticks later. Each hit of 1+ lowers his Defence by 27 (1/8 of his Magic, rounded down); the first hit\'s drain counts for the second roll.', 'Defence spec'),
      R('Mauls come up short', 'All', 'If fewer than 2 mauls hit (1 if only one was planned) and a backup maul is coming, the backup mauls go first and the BGS / Ralos players wait for them to land.', 'Backup'),
      R('Backups', 'All', 'Once the planned Defence specs have landed, each player with a backup specs it (once) while his Defence is above the Defence stop.', 'Backup; Defence stop'),
      R('Defence stop', 'All', 'No more BGS / Ralos Specs or backups once his Defence is at or below this - the spec goes on damage instead. Mauls always go.', 'Defence stop (each set)'),
      R('Soulflame horn', 'All', 'On the interact tick: the caster and the first other mauler can\'t miss their next maul / BGS.', 'Horn'),
    ] },
    { title: 'Attacks and damage specs', rows: [
      R('Scythe', 'All', 'Every 5 ticks, 3 hitsplats (he\'s a large NPC), landing a tick later.'),
      R('Thralls', 'All', 'Everyone has a thrall: 0-3 every 4 ticks from their first attack.'),
      R('Damage specs', 'All', 'Once no Defence spec is still to come, as often as their spec allows: Claws (50%); Claws at screech (held until the screech - their tick fix, or their first attack from it); ZCB (75%: double accuracy, a ruby of 22% of his HP, max 110, landing 2 ticks later).', 'Damage spec'),
      R('ZCB → claws', 'All', 'A planned ZCB becomes claws (if they have them) once his HP is below this - the ruby is worth less than a claw spec and the tick it gains by then.', 'ZCB → claws below (each set)'),
      R('Spec regen', 'All', '10% every 50 ticks below 100% (Lightbearer: every 25). A 95% start regens the tick after their first spec - that regen isn\'t a Lightbearer cycle. Lightbearer cycles: regens on Lightbearer, then Ultor.', 'Start spec; Lightbearer cycles'),
      R('Surge', 'All', '+25% straight after their first spec. Most scales don\'t surge here.', 'Surge; Surge potions'),
    ] },
    { title: 'The screech', rows: [
      R('When', 'All', 'Once he\'s at or below 25% of his base HP, he screeches on the next i0. It does nothing else in the sim.'),
      R('Tick fix', 'All', 'A player whose scythe (or ZCB) would go off on the i3 before the screech - who could see him under 25% the tick before - tick fixes instead: lose a tick (scythe, next attack 6 ticks later), a claw scratch or claw spec (4 ticks; a claw spec falls back to a scratch under 50%), a blowpipe hit (2 ticks; Rigour, ranged cape, gloves and necklace over their melee gear) or an Ayak hit (3 ticks; their magic gear). Then scythes every 5 ticks again.', 'Tick fix'),
    ] },
    { title: 'Solver', rows: [
      R('What it searches', 'All', 'Each player\'s Defence spec, backup, damage spec, tick fix, start spec, Lightbearer cycles, surge and horn, and the set\'s Defence stop and ZCB → claws HP - within the Surge potions / Lightbearers limits and the gear each player has. Ranked by breakpoints (if set), then the median.', 'Solver tab'),
    ] },
  ],
};
