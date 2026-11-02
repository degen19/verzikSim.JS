// Xarpus mechanics & behavior, for the "View mechanics & behavior" section (same layout as Sotetseg's).
const R = (topic, scales, what, input = '') => ({ topic, scales, what, input });

export const XARPUS_MECHANICS = {
  intro: [
    'How the Xarpus sim plays the room, tick by tick (0.6s). Players are set up in the Xarpus tab, gear comes from the Gear tab.',
    'Times in the report: the exhumeds, attackable to the screech, the screech to the kill, and the room.',
  ],
  sections: [
    { title: 'The room', rows: [
      R('HP', 'All', 'Base HP 5000 in 5s; 4375 in 4s; 3750 in trios, duos and solos. Each exhumed heal adds on top (20 / 16 / 12 / 9 / 8 HP solo to 5s): 4s with 9 heals starts on 4375 + 81 = 4456.'),
      R('Stats', 'All', 'Defence 250 (no floor - it can go to 0), Magic 220. Stab / slash / crush defence 0, ranged 160, magic 0.'),
      R('4-tick cycle', 'All', 'Xarpus acts on a 4-tick cycle (i0 = a tick divisible by 4); the exhumeds always end on an i0.'),
      R('Death animation', 'All', 'The room ends 4 ticks after the killing hit, 3 with overkill (another hitsplat landing on the killing tick) - counting the tick it lands as the first of 5 (or 4).'),
      R('Damage to players', 'All', 'Not simulated - it doesn\'t matter in this room. No supplies.'),
    ] },
    { title: 'Exhumeds', rows: [
      R('Length', 'All', 'Interactable on t100 (solo), t92 (duo), t116 (trio), t84 (4s), t96 (5s); everyone\'s first attack the tick after.'),
      R('His HP after', 'All', 'His base HP plus 20 / 16 / 12 / 9 / 8 per heal (a missed tick on an exhumed), solo to 5s.', 'Number of heals (each set)'),
      R('Heals', 'All', 'Default: the Blert average for the scale (5s 1, 4s 7, 3s 4, duos 5, solos 8). Each raid uses the number +- 2 (evenly, never below 0), unless Exact heals is ticked.', 'Number of heals; Exact heals'),
    ] },
    { title: 'Defence', rows: [
      R('Opening specs', 'All', 'One each, or none. An Elder maul goes on their first attack (with no Elder maul, a BGS takes its place and counts as a maul). A BGS / Ralos Spec goes after their first scythe, once the opening mauls (and any re-mauls) are in - skipped if his Defence is already at or below the Defence target.', 'Opening Defence specs'),
      R('Maul again', 'All', 'Once the opening mauls have landed, the players ticked for that many landed maul on their next attack, whether their own maul landed or not - and a player who didn\'t open with a maul can too. Duos 2:2: P1 maul, P2 scythes; P1 mauls again whatever lands, and P2 mauls straight away if P1\'s first missed; backups P2 maul, P2 Ralos, P2 Ralos. 3:1: both open with a maul, P1 mauls again whatever lands; backups P2 maul, P2 Ralos.', 'Maul again if short'),
      R('Backups', 'All', 'In list order, each only while his Defence is above the Defence target (10, 20, 30 or 40). One at a time: each waits for everything before it to land (the others scythe meanwhile). A backup whose best roll can\'t get him to the target from where he is goes together with the next one (and so on). A backup whose player hasn\'t the spec when its turn comes is passed over. A maul backup is skipped once 2 mauls have landed - flat Defence reduction (BGS / Ralos) from there.', 'Backups; Defence target'),
      R('Back up right away', 'All', 'When this many or fewer opening mauls landed, that backup goes as soon as the re-mauls have gone and their own opening spec is done - without waiting on the backups before it. Otherwise it waits for the higher priority backup.', 'Back up right away'),
      R('Defence spec limit', 'All', 'At most 2 Defence specs each (opening, maul again, backups) - 3 in solos. Any past that are skipped.'),
      R('Elder maul', 'All', 'A hit lowers his Defence by 35% as the attack is made (anyone after them that tick rolls against it - random PID each raid); +25% accuracy. Diminishing returns once his Defence is down.'),
      R('BGS', 'All', '2x accuracy, max x1.1 x1.1; a hit lowers his Defence by the damage.'),
      R('Ralos Spec', 'All', 'In their best ranged gear (Rigour, 112 Ranged - Ralos players pot range; everyone else\'s ZCB / blowpipe is on 99): two hits, each 0-75% of their ranged max, +50% accuracy, landing 3 ticks later. Each hit of 1+ lowers his Defence by 27 (1/8 of his Magic, rounded down); the first hit\'s drain counts for the second roll.'),
      R('Soulflame horn', 'All', 'On the interact tick: the caster and the first other opening mauler can\'t miss their next maul / BGS - so it only ever helps the opening mauls.', 'Horn'),
    ] },
    { title: 'Attacks and damage specs', rows: [
      R('Scythe', 'All', 'Every 5 ticks, 3 hitsplats (he\'s a large NPC), landing a tick later.'),
      R('Thralls', 'All', 'Everyone has a thrall: 0-3 every 4 ticks from their first attack.'),
      R('Damage specs', 'All', 'After their own Defence specs, as often as their spec allows: ZCB (75%: double accuracy, a ruby of 22% of his HP, max 110, landing 2 ticks later) - held for the screech (Hold ZCBs: their first attack from it; nobody waits for anyone) or else once the mauls are in; Claws (50%) once no Defence spec is still to come. A Claw spec tick fix goes before a held ZCB.', 'Damage spec; Hold ZCBs for the screech'),
      R('Chally last hit', 'All', 'Off unless ticked. Once his HP is at or below the threshold (3, 5, 7 or 10% of his starting HP), a player who\'d scythe halberds instead: 30%, two hits (the second at 75% accuracy), each landed hit 1..max + max / 10, 7 ticks. A player with a horn left and 25-29% (no halberd in reach) horns instead - no attack delay; their swing and the next other attacker\'s can\'t miss. Mostly worth it in solos and duos.', 'Chally last hit (each set)'),
      R('ZCB → claws', 'All', 'A planned ZCB becomes claws (if they have them) once his HP is below this - the ruby is worth less than a claw spec and the tick it gains by then.', 'ZCB → claws below (each set)'),
      R('Spec regen', 'All', '10% every 50 ticks below 100% (Lightbearer: every 25). A 95% start regens the tick after their first spec - that regen isn\'t a Lightbearer cycle. Lightbearer cycles: regens on Lightbearer, then Ultor.', 'Start spec; Lightbearer cycles'),
      R('Surge', 'All', '+25% straight after their first spec, once its 500-tick cooldown is up - the cooldown carries over from earlier rooms and doesn\'t tick between rooms (full raid); if it isn\'t up yet, as soon as it is (at 75% spec or less). Most scales don\'t surge here.', 'Surge; Surge potions'),
    ] },
    { title: 'The screech', rows: [
      R('When', 'All', 'Once he\'s at or below 33% of his starting HP (base + heals), he screeches on the next i0. It does nothing else in the sim.'),
      R('Tick fix', 'All', 'A player whose scythe (or ZCB) would go off on the i3 before the screech - who could see him under 33% the tick before - tick fixes instead: lose a tick (scythe, next attack 6 ticks later), an Eye of ayak hit (3 ticks; their magic gear), a blowpipe hit (2 ticks; Rigour, ranged cape, gloves and necklace over their melee gear), a claw spec or a claw scratch (4 ticks; a claw spec falls back to a scratch under 50%). Then scythes every 5 ticks again.', 'Tick fix'),
    ] },
    { title: 'Solver', rows: [
      R('What it searches', 'All', 'Each player\'s opening spec, who mauls again for each number of opening mauls landed, the backups (who, which spec, the order, back up right away), the Defence target (10-40), damage spec and holding ZCBs, tick fix, start spec, Lightbearer cycles, surge and horn, and the ZCB → claws HP - within the Surge potions / Lightbearers limits and the gear each player has. Role changes try a player\'s opening spec (or none), damage spec, start spec and Lightbearer cycles together. Setups with no Defence spec at all are knocked out. Ranked by breakpoints (if set), then the median.', 'Solver tab'),
    ] },
  ],
};
