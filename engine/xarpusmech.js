// Xarpus mechanics & behavior, for the "View mechanics & behavior" section (same layout as Sotetseg's).
const R = (topic, scales, what, input = '') => ({ topic, scales, what, input });

export const XARPUS_MECHANICS = {
  intro: [
    'How the Xarpus sim plays the room, tick by tick (0.6s). Players are set up in the Xarpus tab, gear comes from the Gear tab.',
    'Times in the report: the exhumeds, attackable to 25% (the screech), 25% to the kill, and the room.',
  ],
  sections: [
    { title: 'The room', rows: [
      R('HP', 'All', 'Base HP 5080 in 5s; 4445 in 4s; 3810 in trios, duos and solos. The screech comes at 25% of this.'),
      R('Stats', 'All', 'Defence 250 (no floor - it can go to 0), Magic 220. Stab / slash / crush defence 0, ranged 160, magic 0.'),
      R('4-tick cycle', 'All', 'Xarpus acts on a 4-tick cycle (i0 = a tick divisible by 4); the exhumeds always end on an i0.'),
      R('Death animation', 'All', 'The room ends 5 ticks after the killing hit, 4 with overkill (another hitsplat landing on the killing tick).'),
      R('Damage to players', 'All', 'Not simulated - it doesn\'t matter in this room. No supplies.'),
    ] },
    { title: 'Exhumeds', rows: [
      R('Length', 'All', 'Interactable on t100 (solo), t92 (duo), t116 (trio), t84 (4s), t96 (5s); everyone\'s first attack the tick after.'),
      R('His HP after', 'All', 'He drops to 2928 (solo), 2905 (duo), 2910 (trio), 3560 (4s), 4127 (5s), then heals 20 / 16 / 12 / 9 / 8 per heal (a missed tick on an exhumed).', 'Number of heals (each set)'),
      R('Heals', 'All', 'Default: the Blert average for the scale (5s 1, 4s 7, 3s 4, duos 5, solos 8). Each raid uses the number +- 2 (evenly, never below 0), unless Exact heals is ticked.', 'Number of heals; Exact heals'),
    ] },
    { title: 'Defence', rows: [
      R('Defence slots', 'All', 'Each player has up to 4 Defence specs in order, each an Elder maul, BGS or Ralos Spec that goes Always, If short or as a Backup. A slot that no longer applies is skipped. With no Elder maul, a BGS takes a maul\'s place (and counts as a maul).', 'Defence 1-4'),
      R('Always', 'All', 'A maul goes on their next attack once they have 50% (their first attack, usually). A BGS / Ralos Spec waits until the mauls are settled - no maul hit still on its way, no Always maul still to swing and no If short maul due - then goes if his Defence is above the Defence stop.', 'Defence 1-4'),
      R('If short', 'All', 'Only if the mauls come up short of the Maul target: landed mauls + mauls on their way + Always mauls still to swing is below it. A maul goes straight away; a BGS / Ralos Spec once the mauls are settled. While it can\'t be known yet they scythe and wait; once the mauls are in, it\'s skipped. Duo example: P1 maul, maul; P2 maul if short, maul if short, Ralos, Ralos (backup).', 'Defence 1-4; Maul target'),
      R('Backup', 'All', 'Once every Always / If short Defence spec has gone and landed, if his Defence is still above the Defence stop. They wait for 50% spec if they need it (Lightbearer, a regen or a surge); nobody else waits for them.', 'Defence 1-4; Defence stop'),
      R('Elder maul', 'All', 'A hit lowers his Defence by 35% as the attack is made (anyone after them that tick rolls against it - random PID each raid); +25% accuracy. Diminishing returns once his Defence is down.'),
      R('BGS', 'All', '2x accuracy, max x1.1 x1.1; a hit lowers his Defence by the damage.'),
      R('Ralos Spec', 'All', 'In their best ranged gear (Rigour): two hits, each 0-75% of their ranged max, +50% accuracy, landing 3 ticks later. Each hit of 1+ lowers his Defence by 27 (1/8 of his Magic, rounded down); the first hit\'s drain counts for the second roll.'),
      R('Defence stop', 'All', 'No more BGS / Ralos Specs or backups once his Defence is at or below this (0, 10, 20 or 30) - the spec goes on damage instead. Mauls always go.', 'Defence stop (each set)'),
      R('Soulflame horn', 'All', 'On the interact tick: the caster and the first other player mauling on their first attack can\'t miss their next maul / BGS.', 'Horn'),
    ] },
    { title: 'Attacks and damage specs', rows: [
      R('Scythe', 'All', 'Every 5 ticks, 3 hitsplats (he\'s a large NPC), landing a tick later.'),
      R('Thralls', 'All', 'Everyone has a thrall: 0-3 every 4 ticks from their first attack.'),
      R('Damage specs', 'All', 'After their own Defence specs, as often as their spec allows: ZCB (75%: double accuracy, a ruby of 22% of his HP, max 110, landing 2 ticks later) once the mauls have landed; Claws (50%) once no Defence spec is still to come; Claws at screech (held until the screech - their tick fix, or their first attack from it). A player needn\'t Defence spec at all - e.g. 95% start, ZCB, surge, then claws or Lightbearer cycles for a second ZCB.', 'Damage spec'),
      R('ZCB → claws', 'All', 'A planned ZCB becomes claws (if they have them) once his HP is below this - the ruby is worth less than a claw spec and the tick it gains by then.', 'ZCB → claws below (each set)'),
      R('Spec regen', 'All', '10% every 50 ticks below 100% (Lightbearer: every 25). A 95% start regens the tick after their first spec - that regen isn\'t a Lightbearer cycle. Lightbearer cycles: regens on Lightbearer, then Ultor.', 'Start spec; Lightbearer cycles'),
      R('Surge', 'All', '+25% straight after their first spec, once its 500-tick cooldown is up - the cooldown carries over from earlier rooms and doesn\'t tick between rooms (full raid); if it isn\'t up yet, as soon as it is (at 75% spec or less). Most scales don\'t surge here.', 'Surge; Surge potions'),
    ] },
    { title: 'The screech', rows: [
      R('When', 'All', 'Once he\'s at or below 25% of his base HP, he screeches on the next i0. It does nothing else in the sim.'),
      R('Tick fix', 'All', 'A player whose scythe (or ZCB) would go off on the i3 before the screech - who could see him under 25% the tick before - tick fixes instead: lose a tick (scythe, next attack 6 ticks later), a claw scratch or claw spec (4 ticks; a claw spec falls back to a scratch under 50%), a blowpipe hit (2 ticks; Rigour, ranged cape, gloves and necklace over their melee gear) or an Ayak hit (3 ticks; their magic gear). Then scythes every 5 ticks again.', 'Tick fix'),
    ] },
    { title: 'Solver', rows: [
      R('What it searches', 'All', 'Each player\'s Defence slots (each: maul / BGS / Ralos Spec, Always / If short / Backup, or none), damage spec, tick fix, start spec, Lightbearer cycles, surge and horn, and the set\'s Maul target (1-3), Defence stop (0-30) and ZCB → claws HP - within the Surge potions / Lightbearers limits and the gear each player has. Role changes try a player\'s first Defence spec (or none at all), damage spec, start spec and Lightbearer cycles together. Setups with no Defence spec at all are knocked out. Ranked by breakpoints (if set), then the median.', 'Solver tab'),
    ] },
  ],
};
