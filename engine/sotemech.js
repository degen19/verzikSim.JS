// Sotetseg mechanics & behavior, for the "View mechanics & behavior" section (same layout as the Verzik chart
// template's sheet: sections of {topic, scales, what the sim does, where it's set}).
const R = (topic, scales, what, input = '') => ({ topic, scales, what, input });

export const SOTE_MECHANICS = {
  intro: [
    'How the Sotetseg sim plays the room, tick by tick (0.6s). Players are set up in the Sotetseg tab, gear comes from the Gear tab.',
    'Times in the report: P1 (to the first maze proc), first maze (proc to the end of the last cycle before she can be hit again), P2, second maze, P3 (to the kill), and the room.',
  ],
  sections: [
    { title: 'The room', rows: [
      R('HP', 'All', 'Solo / duo / trio 3000, 4-man 3500, 5-man 4000.'),
      R('Defence', 'All', 'Defence 200, floor 100; back to 200 after each maze. Melee defence +70, magic +30, ranged +150. Magic and Ranged 250.'),
      R('Mazes', 'All', 'At 66.6% and 33.3%. The hit that reaches the threshold stops there (she can\'t be damaged past it) and starts the maze; hits and attacks still on their way are dropped.'),
      R('Death animation', 'All', 'The room ends 5 ticks after the killing hit, 4 with overkill (another hitsplat landing on the killing tick).'),
      R('Entry instance', 'All', 'Her 4-tick instance cycle (i0-i3) depends on the tick the room is entered on; it decides how many ticks each maze loses. The entry optimizer tries all four.', 'Report: Entry instance; Optimizer - entry instance'),
    ] },
    { title: 'Her attacks', rows: [
      R('Attack timing', 'All', 'First attack on tick 6, then every 5 ticks, at a random living player.'),
      R('Melee', 'All', 'Only at a player who attacked the tick before: 50% melee (lands next tick, max 45, cut by 40% on Protect from Melee). Players line their attacks up so this never happens (the flinch).'),
      R('Magic orb', 'All', 'Otherwise a magic orb: lands 7 ticks later (max 50, 0 if prayed), then splits to up to two other players (one Ranged, one Magic, random), landing 7 ticks after that. Splits don\'t split again; solos have none.'),
      R('Prayer off', 'All', 'An orb that hits a player unprayed (prayed wrong, or taken for veng) turns their prayer off - back on 5 ticks later. A prayed orb doesn\'t.'),
      R('Death ball', 'All', 'Every 11th magic attack (after 10 magic orbs; melees and splits don\'t count, and the count carries through the mazes) is a ball at a random player. She skips her next attack, attacks as normal after that, and the ball lands on the tick of what would be her third attack. A maze proc first: it does nothing. Veng doesn\'t reflect it.'),
      R('Death ball damage', 'All', 'Shared by the players standing on it, by players alive / sharing: 5 alive 14 / 21 / 38 / 87 / 350 (5 to 1 sharing); 4 alive 17 / 31 / 70 / 280; 3 alive 23 / 52 / 210; 2 alive 35 / 140; solo 70.'),
      R('Splitting the ball', '3-5', 'If everyone can take an even share they all share it; otherwise the target takes it alone. Duos and solos never split.', 'Split DD if healthy'),
      R('Tick-eating the ball', 'All', 'Taken alone, the hit takes them to 0 and food that tick lands before the death check: a Guthix rest (to 5 HP, no attack delay), else a shark (to 20 HP, no attack for 3 ticks). With neither: tick-healed - a 3-tick stall while the lowest-HP teammate Heal Others them. Before tick-eating, the target Heal Others their HP away (P1-P2: lowest HP, not a redemption skipper, not into a stall-death HP; P3: closest below 50).', 'Guthix rest sips, Sharks, Stall tick-eat'),
      R('Stall tick-eat', 'All', 'When on: after any Guthix rest, a tick-heal comes before a shark - the shark may be worth more for a maze.', 'Stall tick-eat'),
      R('Solos and the ball', 'Solo', 'Purple sweets (1-3 HP, as many as needed) instead of sharks. Solos never bring Guthix rests.'),
    ] },
    { title: 'Players', rows: [
      R('Stats', 'All', 'Super combats always on (118 Attack / Strength / Defence), Zeal or Piety (+25% Defence either way); prefires and ZCB specs range potted (112 Ranged) on Rigour, magic on Augury.', 'Gear tab: prayer, gear'),
      R('Gear', 'All', 'Melee from the Gear tab (Amulet of rancour on every scythe); prefires and ZCB specs in their best ranged / magic gear, slot by slot.', 'Gear set'),
      R('Flinch', '3-5', 'Every attack is lined up so it\'s never on the tick before one of hers - she can\'t melee them.'),
      R('Flinch (duos / solos)', 'Solo, Duo', 'They don\'t flinch (more melees, fewer magic attacks - fewer death balls) unless a melee through prayer (max 27) could kill them.'),
      R('PID', 'All', 'Players act in a random order each raid. A maul / BGS that hits lowers her Defence as the attack is made, so anyone later that tick rolls against it. Nobody can see PID, so a ZCB / claws reacts to the maul landing.'),
      R('Prefire', 'All', 'Twisted bow on t5 (lands t8), ZCB auto / spec on t6, Shadow Barrage / Tumeken\'s shadow on t5; first scythe on t11, lined up on her attacks. Shadow Barrage drains 15% of her Defence (once until the next maze). A thrall is summoned after the prefire: 0-3 every 4 ticks, not during mazes.', 'Prefire'),
    ] },
    { title: 'Prayer, veng and food', rows: [
      R('Praying', 'All', 'Every orb is prayed, except one taken off prayer for veng.'),
      R('Veng orbs', 'All', 'With veng up, above 50 HP, and no other orb landing on them in the next 4 ticks, they take the orb off prayer for veng (75% back to her, through the maze threshold rule).'),
      R('Casting veng', 'All', 'Everyone starts with veng up and off cooldown; recast (or cast on a teammate without one) as soon as the 50-tick cooldown allows. Not during a stall.'),
      R('Chance veng threshold', 'All', 'Off by default (0). When set: after the second maze, at or below that share of her HP, they take orbs for veng at any HP.'),
      R('Sharks', '2-5', 'Only around the mazes: one after the teleport if the stall would kill them, one with a phoenix necklace proc if they have more sharks than mazes left. Shark skips, maze runs, the player under and death balls eat as described there.', 'Sharks'),
    ] },
    { title: 'Heal Other', rows: [
      R('When', 'All', '75% of the caster\'s HP to the target (capped at their missing HP), no attack delay, only in an attack phase (never between a proc and the stall). The player under not until after their first swing.'),
      R('Who casts', 'All', 'Not a player who can veng safely themselves (veng up, above 50) - except to heal a shark skipper.'),
      R('Who gets it', 'All', 'Lowest HP first, only for a gain: a veng\'d player with an orb coming lifted above 50; a player taken out of a stall-death HP before a maze; a player with orbs coming they can\'t pray lifted above what those can hit.'),
      R('Caster limits', 'All', 'Not to 50 or less with orbs coming at them they can\'t pray; before the second maze not below 17 or into a stall-death HP. A player healed out of stall danger keeps that HP.'),
      R('Shark skipper first', '2-5', 'Between the mazes, healing a shark skipper to 51+ comes before anything else (so their second skip takes 2 sharks): anyone casts, heals can add up, and the caster may drop low if a shark before their stall still gets them through it.'),
      R('Redemption skippers', '1-4', 'Never healed while they still have a redemption skip to come (they want 1 HP), and never heal another redemption skipper.'),
    ] },
    { title: 'Specs', rows: [
      R('Spec options', 'All', 'Per player, per phase: None, Maul, BGS, Claws or ZCB, plus Backup and Horn. Defaults: 5s - P1 horns and mauls P1 / mauls P2, P2 mauls P1 / P3, P3-P4 ZCB in P1 and back up in P3, P5 mauls P2 / P3; 4s the same without P4; 3s A P1+P2, B P1+P3, C P2+P3.', 'Specs'),
      R('Mauls and BGS', 'All', 'Planned mauls go off as early as possible: P1 on the first hit after the prefire, P2-P3 on their first attack off the maze. Elder maul: +25% accuracy, -35% Defence on a hit. BGS: 2x accuracy (vs slash), max x1.1 x1.1, Defence lowered by the damage. Set to Maul with only a BGS (or the other way round), they use what they have.', 'Specs'),
      R('ZCB spec', 'All', 'Their next attack after the phase\'s mauls land: double accuracy, a guaranteed ruby (22% of her HP, max 110), lands 2 ticks later. Never late in P1 / P2 when the ruby would be cut short by the maze - it moves to the start of the next phase (as does one they never had the spec for).', 'Specs'),
      R('Claws', 'All', 'Their next attack after the mauls land. In P3, a planned ZCB becomes claws once she\'s below the set HP.', 'P3 ZCB -> claws below (HP)'),
      R('Backup', 'All', 'Scythe first; once the phase\'s mauls (and earlier backups, if she isn\'t at the floor yet) have landed: maul if her Defence isn\'t at the floor, otherwise their spec (a ZCB may wait for a regen).', 'Specs: Backup'),
      R('Horn', 'All', 'Soulflame horn (25%): the caster and the other player mauling that phase can\'t miss their next hit (10 ticks). P1 on t8 (after the prefire, running in); P2-P3 after their first scythe off the maze. Needs a Soulflame horn in the Gear tab.', 'Specs: Horn'),
      R('Duo standard', 'Duo', 'Both maul in P1; A mauls P2, B P3. Both P1 mauls miss: A backs up; that misses too: B mauls P2 and A camps Lightbearer to maul P3. One or more hit: no backup.', 'Specs: Backup if both miss'),
      R('Solo standard', 'Solo', 'A maul landed each phase: another while they have the spec, until one hits.'),
      R('Spec energy', 'All', 'Spec starts at 100 or 95 (a 95% start gets its first regen the tick after their first spec). +10% every 50 ticks below 100; on Lightbearer every 25 ticks for the set number of cycles (at 100% with cycles left they wear Ultor and finish them after their next spec), then Ultor - Lightbearer costs the Ultor ring\'s +12 strength. A surge (+25%) straight after their first spec.', 'Start spec, Surge, Lightbearer cycles'),
      R('Spec planner', 'All', 'A fixed projection of when each planned spec can go off and how much spec they have, on typical phase times for the scale or the last report\'s medians.', 'Specs: spec planner'),
    ] },
    { title: 'Mazes', rows: [
      R('The proc', 'All', 'Everyone is teleported for 5 ticks; first move on the 6th. One random player goes under: no maze damage, first swing 19 ticks after the proc. She\'s attackable again on the instance after the others come off.'),
      R('Player under', '2-5', 'Eats a shark whenever below 85 HP (one every 3 ticks), keeping one back when the others skip.'),
      R('Pneck (stall)', '2-5', 'The others click on the first i3 from 4 ticks after the proc, step on the i0 after and stall on the maze for 7 ticks: a maze hit each tick plus, on the first, a splash from each other runner - all worked out from their HP on stepping on, queued, and taken coming off. A phoenix necklace procs on the first hit that leaves them on 1-19 (heals 29, clears the rest). Off on the i0, attacking on the i2.', 'First maze / Second maze: Pneck; Phoenix necklaces'),
      R('Shark skip', '2-5', 'One player at most skips away from the others (no splash), with no phoenix necklace: 7 maze hits one a tick, each from their HP then and capped at it, food that tick before the death check (tick-eat). What they eat goes by their HP at the proc (sharks / Guthix rests on set ticks); below 29, a shark + rest on the proc. They veng and attack with the stallers; before their skip they don\'t take veng orbs.', 'Shark; Sharks; Guthix rest sips'),
      R('Redemption skip', '1-4', 'Needs a locator orb. They stall at 1 HP with Redemption instead of a necklace: their queue is never cleared, so they take a maze hit and a splash from each other runner every tick, each capped at 1 - from 1 HP they come off on 18 (solo / duo), 11 (trio) or 4 (4s); not possible in 5s. A restore sip after, swinging a tick late. Before the skip: 1-2 vengs, Heal Other, then orb down to 1 (regardless within 9% of the maze).', 'Redemption; Restore sips; Gear tab: Locator orb'),
      R('Locator heals', '1-4', 'After the second maze (duos: every phase), at 1 HP the locator orb procs Redemption (to 25, a restore sip) and they Heal Other the veng player closest below 50 (duos: their partner at 50 or less) - keeping a sip for each redemption skip left.', 'Restore sips'),
      R('Run', 'All', 'If anyone runs a maze, everyone does: a real maze is rolled (devqhp\'s trainer rules and best route). The player under reaches the first tile, the runners follow the route behind them, wait on the second-to-last row and click off on the next i3. No maze damage; a shark whenever below 85 HP. Usually 4-12 ticks slower than a skip.', 'Run'),
      R('Solos', 'Solo', 'Always redemption skip both mazes. They are picked as the under first and skip the maze as the runner after it: each maze takes 14 ticks longer.'),
    ] },
  ],
};
