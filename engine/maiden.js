// The Maiden of Sugadinti (room 1). Stats and the room's timing so far; the players' attacks come next.
//  - HP 3500 (5s), scaled down below 5s like the other rooms: 87.5% in 4s (3062), 75% in 3s / duos / solos (2625).
//  - Defence 200, Magic 350. Every defence bonus 0 (stab / slash / crush / ranged / magic). Magic attack bonus 300
//    (her own attacks - not used yet).
//  - Prefires: a Twisted bow can fire on room tick 5 (its longer range), a ZCB on tick 6.
//  - She attacks every 10 ticks from tick 9 (9, 19, 29, ...). Projectile delay and the blood toss come later.
//  - First section: the prefires to her 70s proc - the tick a hit lands that takes her HP below 70% of her max (on that
//    hit, not on her attack cycle). Damage carries over: that hit's full damage comes off, and the 70s phase starts
//    from what's left.
//  To do (the mechanics list):
//   Next:
//   1. "Add attack" per section (start, 70s, 50s, 30s, end) - and how a player's hits change with the procs' timing
//      (the sim's own behaviour, not more settings).
//   2. Fail conditions.
//   3. Maiden targeting (her own: for now one player, the Maiden targets setting).
//   4. DC (Death Charge) - the toggle's kept for it.
//   5. Thralls: a thrall hits its player's last target whenever it's off cooldown - so it hits a crab when the player
//      has just hit one, and Maiden again once the player is back on her.
//   With the crab sim (the rules are below, under the room / crabs notes): crabs spawning, walking, leaking and her
//   heals; her ramping by crabs leaked (MAX_HIT); Dinh's, barrage and chinchompa targeting; freezes and immunity.
//   To work out:
//   6. Scythe hitting several crabs / her (cleave).  7. Obligator the same (its charged 5t Thrust: up to 3 targets in a
//      line - on or behind the main one; best of 2+ damage rolls, +1 per stab / slash defence above crush; +20% on 2-tile
//      targets, +40% on 3 - wiki, confirmation needed). Today it's Smash (3t) only.
//      With these: in-depth scythe arc mechanics (which tiles its swing covers, how the hits split across targets).
//      The community's current best theory of the arc (stacked NPCs): the arc is 1x3, across the line from the player to the
//      primary's centre - $center (the tile in front of them), $left, $right. The primary takes the first hit; then, for up to
//      two more: an NPC on $center (not the primary), then one on $left, then one on $right (each in line of sight of
//      $center; the primary counts again here, which is how a 2x2 takes two). That gives jaggers_0's Maiden split below.
//      Scythe split in general is still debated in the community: leave it as is for now, except the Maiden piece -
//      a crab leaking the tick you hit it: from its north tiles the crab takes 100% + 50% and she takes 25%; from its south
//      tiles the crab takes 100% + 25% and she takes 50% (jaggers_0's chart, with his crab-off-HP thresholds by her
//      Defence for zeal / 2 oath / rancour / treads: no splat on her 26 -> 21, 50% on her 18 -> 15, 25% on her 40 -> 35).
//   Trio Maiden (roles always mage / range / melee; entry and secondary specs configurable, the guide's procedure built
//      in by default): mage S1 > N1 > S2 > N2 (no S1 / N1: ice rush the S2 so it clumps with the 3s and 4s; no S1 / S2 /
//      N1 / N2: 2 ticks to a bow on her, then an Ayak on the rest - or the barrage preload on the clump instead); range /
//      melee hit only what the freezer can't catch, once each; Dinh's after up to 4 / 3 / 2 / 1 scythes on a 12 / 15 / 18
//      / 21s 50s split, its spot by which crabs are out and the loose ones' HP (Death Charge - melee and range - often
//      gives spec back); the ranger's 30s skip: ZCB, claws, or the halberd as the last hit (a setting); after it, balance proccing the 30s to cleave the frozen 50s, else take them to ~25 HP; stay on
//      her within ~3.5% of a proc (the mage expects the scythe to proc it - tune by the sim).
//   8. Spec energy check: before a report runs, flag a player whose hit list has specs their spec energy can't cover
//      (e.g. two 50% specs from a 95% start with no regen in between) - like the missing-gear check. For now a spec
//      they can't afford is just skipped.
//   Later:
//   9. Money-raid Maiden with default decisions (Dinh's positioning, freezes, tbows...).
//  10. Backup Defence specs: when the opening Defence specs miss (e.g. a maul), backups (BGS / Ralos / maul again...)
//      to get her Defence down, as on Xarpus.
//  11. Report (once the room's done): Vengeance damage - average a raid (total).
//  12. Prayer on her attacks: off-prayer Vengeance for now (PRAYING = false: her max 36, not 18) - adjust by scale as
//      needed (goes with her ramping).
//   After Maiden: Xarpus "Crossbow Lb" (details to come).
//   Maiden next (from the phase-plan mock-up): the Phases UI (70s / 50s / 30s / End tabs; per-player spellbook toggles
//      for the whole room; "First tick" / "Second tick" only on the first freeze; Tbow from only with a tbow in that phase;
//      freezes: Ice barrage / blitz / burst / rush, each with or without a sceptre). Then: a specific procedure teams use
//      in 5s; customizable fail conditions; backend reactions to proc timings (rather than more settings).
//      Under 5s (random spawns): a 4 frozen early (before the clump) that didn't spawn - its freeze goes to another 4
//      (id4), but teams might rather use those ticks elsewhere so the method isn't thrown off; decide with the sub-5s work.
//      Later: other Dinh's positions; trios - Dinh's position and timing dynamic on the crab spawns and the proc (4s too,
//      less so).
//   To revisit: healing in the 5s test plan (median ~490 a raid, expected lower) - mostly the 50s 4s and S1 and the 70s
//      N1 / S2 leaking at 20-40 HP; could be a procedural difference (who hits what, when).
//   Down the road:
//  13. "Render Video" on a raid's recap: a 3D replay of that one raid's room, made on request.
//      With it: player deaths (from incoming damage - their attacks/specs stop, room effects follow) and Dawnbringer
//      passing (drop on a tick, the receiver walks to the tile, picks it up, equips, specs).
//      Boss spots: Bloat walks/runs the track around the centre tank (and stops after a while); Nylo boss and Xarpus
//      in the exact centre; Sotetseg at the end opposite the red gate; Verzik P1 on the throne (end centre). P2 comes
//      down the carpet and stands with a 7-tile gap between her edge and the throne; P3 spawns on the same centre with
//      a 5-tile gap (she's 7x7), follows a tank drag pre-webs, and walks back to that spot for webs.
//      Verzik pillars: they fall after P1 or once they've taken enough damage (matters in solos) - not modelled yet.
//      Player movement in the sim (the video fakes it for now): a tile per player per tick, 2-tile runs (1 when
//      walking), attacks only from in range (tbow 10, Ralos/xbow/barrage ~7-10, melee adjacent - diagonal doesn't
//      count), ticks lost when a weapon's out of range or the path is blocked (Maiden's 6x6, the pool edge; crabs
//      don't block players), and where each player stands deciding her target (zones). Moves Sote's maze / Verzik
//      pillars onto the same model, and feeds Xarp/Nylo/Bloat spots and practice mode.
//  14. (After 13) Practice mode: set the other players' behaviour and your own target plan, then play your player
//      live (0.6s ticks, clicks to walk/attack, keys for prayers/spec/swaps) in the rendered room. Graded against your
//      target plan per tick (attacks on time, right target, specs, freezes, prayers): a score plus a timeline of where
//      you drifted and what it cost. Maiden first.
//      Decided: build practice mode on osrs-sdk / InfernoTrainer (GPL-3 - fine to open-source it): its tick loop, input,
//      inventory / prayers / spellbooks, pathing, OSRS interface; port the Maiden rules (crabs, freezes, procs, her
//      targeting) into a Maiden room there, bots run from our plans; host the Maiden models ourselves (GLB via
//      osrscachereader). Keep our own replay as the fast test renderer and the whole-room overview view, and give it a
//      player view (follow a player: their clicks, gear switches, prayers / spells) later.
//      Rendering like Scim.GG (closed source - learn from it, don't copy): the client's own way of drawing - animations
//      by their frame lengths (incl. skeletal), the client's lighting, textures, alpha and face priority, turn speeds,
//      smoothing between ticks. Also its end-of-fight breakdown (damage taken by tick / source / prayer) for scoring.
//      RuneLite plugins to simulate (each a toggle, as in Scim.GG's Plugins panel): Tile Indicators (true tile, hover
//      tile, destination tile; corners only, width), Tile Markers, Line Markers, Tile Grid, NPC Highlights, Attack Timer
//      Metronome (attack bar, cooldown ticks over the head), Tick Counter, Tick Audio Metronome, Boss Health Bar, Status
//      Bars, Prayer (+ flick helper), Inventory Tags, Instant Inventory, Anti Drag, Custom Menu Swaps, DPS Overlay,
//      XP Drops, Compact Orbs, Camera, Stretched Mode, Visual Metronome (a small box counting the ticks 1..N, cycling,
//      anywhere on screen). All of these are needed (the user's call) - Anti Drag and the metronomes especially.
export const MAIDEN_HP = { 5: 3500, 4: 3062, 3: 2625, 2: 2625, 1: 2625 };
export const MAIDEN = {
  def: 200, magic: 350, magicAtk: 300,
  dfn: { stab: 0, slash: 0, crush: 0, light: 0, standard: 0, heavy: 0, magic: 0 },
};
// ---------------------------------------------------------------- the room and her crabs (Nylocas Matomenos)
//  Tiles as Blert draws the room (x east, y south - north at the top): 28 x 24. Maiden 6x6 with her NW tile at (2, 9),
//  so her SW tile is (2, 14). Crabs are 2x2; a spawn is the crab's NW tile.
//  At each proc (70s / 50s / 30s) up to 2 crabs per player spawn (10 in a 5s - every spawn; under 5s, random spawns).
//  A crab walks 1 tile a tick: diagonally (west, and toward her SW tile's row) until its SW tile is on her SW tile's
//  row, then straight west; it leaks when it's next to her, and she heals 2x its HP left on the next tick.
//  Ticks to reach her: N1 / S1 6, N2 / S2 9, N3 / S3 13, N4a / N4b / S4a / S4b 17.
//  Crab stats: HP 100 in 5s, scaled like the bosses (87 in 4s, 75 in 3s / duos / solos); Magic 100, Defence 100,
//  every defence bonus 0. A freeze can't miss when the caster's magic accuracy roll is at least (their base Magic
//  level + 9) * 204 - 22,032 at 99 Magic (the Nylocas Matomenos wiki); below that, the usual roll against their Magic.
//  Crabs don't block each other (or anything): each one paths on its own, and they can stack on the same tiles.
//  Chunks (8x8, from the world grid - they decide the order AoE attacks pick targets in): if her SW tile is world
//  (3162, 4444), chunk lines run at x = 0 / 8 / 16 / 24 and between rows 2|3, 10|11, 18|19 (N4a / N4b and S4a / S4b
//  are in different chunks). To confirm.
//  AoE targets (Dinh's, barrage, chinchompas): the chunks around the centre (Dinh's: the player) are checked in order
//    7 4 1
//    8 5 2      (the centre in chunk 5; the check starts in chunk 1, then 2, ... 9)
//    9 6 3
//  up to the attack's max targets; within a chunk, the NPC that entered it last goes first; NPCs that entered it on the
//  same tick, lowest NPC index first. A target must also be in the attack's area (Dinh's: 11x11 around the player).
//  NPC index: random for now (a new one each spawn).
//  Barrage: the area is the 3x3 centred on the primary target's SW tile; it hits the NPCs whose SW tile is in it (up to
//  the target cap) - a crab one tile off the edge with only its other tiles inside isn't hit.
//  Black chinchompas: the same area (the NPCs whose SW tile is in the 3x3 centred on the target's SW tile), up to 12
//  targets. +80 ranged attack, +30 ranged strength, heavy. Short fuse 4 ticks (+3 effective Ranged), medium 3, long 4.
//  One accuracy roll (the primary target's, against heavy ranged defence) decides every target: all hit or all miss.
//  Accuracy by distance to the target's closest tile - short 100 / 75 / 50%, medium 75 / 100 / 75%, long 50 / 75 / 100%
//  at 0-3 / 4-6 / 7+ tiles. At Maiden: always medium fuse (3 ticks), thrown from 4-5 tiles (100% accuracy), landing 2
//  ticks later.
//  Dinh's bulwark: special attack only. The area is the 11x11 centred on the player's tile; up to 10 hits. The primary
//  target (the one the spec was used on) always takes the first hit, then the other 9 go by the chunk order and NPC
//  index above - so the primary target can be picked again and take 2 of the 10.
//  Stats: +124 crush attack, +38 strength (defence +106 / +109 / +109 / -10 magic / +148 ranged); 5 ticks; Pummel is
//  crush, accurate (+3 Attack). Pummel's strength passive: extra strength = max(0, (stab + slash + crush + ranged
//  defence - 800) / 12 - 38) - nothing extra while the average of those four is under 314.
//  Shield Bash (the spec): 50% energy, +20% accuracy, rolled against the target's crush defence. (The wiki's "the
//  target is always hit twice, up to 10 enemies" is superseded by the rule above: the primary takes the first hit
//  and only takes a second if the chunk order picks it again.) A successful hit also drains the NPC's highest
//  offensive stat by 5% - ignored here (crabs don't attack; Maiden's max hit goes by the crabs).
//  Freezes: Ice Barrage 32 ticks (35 with an ancient sceptre), Burst 16 (17), Blitz 24 (26), Rush 8 (8); then 5 ticks
//  immune - a 32-tick freeze cast on tick L: no steps on L+1..L+32 (a crab that already stepped on L loses 32 steps),
//  immune L+33..L+37, can be frozen again on L+38 (from in-game footage: an Ice rush on S2 has it back in the 4s' barrage).
export const ROOM = { w: 28, h: 24 };
export const CHUNK = { x0: 0, y0: 3, size: 8 };   // a chunk line west of x = 0, 8, 16, 24 and north of y = 3, 11, 19 (see above)
export const MAIDEN_TILE = { x: 2, y: 9, size: 6 };
/** A tile's chunk: [column, row] (row -1 north of y = 3). */
export const chunkXY = (x, y) => [Math.floor((x - CHUNK.x0) / CHUNK.size), Math.floor((y - CHUNK.y0) / CHUNK.size)];
const chunkOf = (x, y) => chunkXY(x, y).join(',');
/** An AoE's chunk order around the centre tile's chunk (1 NE, 2 E, 3 SE, 4 N, 5 centre, 6 S, 7 NW, 8 W, 9 SW; 99 further). */
export const chunkOrder = (cx, cy, x, y) => { const [a, b] = chunkXY(cx, cy), [c, d] = chunkXY(x, y), dc = c - a, dr = d - b; return Math.abs(dc) > 1 || Math.abs(dr) > 1 ? 99 : (1 - dc) * 3 + (dr + 1) + 1; };
export const SPAWNS = { N1: [13, 1], N2: [17, 1], N3: [21, 1], N4a: [25, 1], N4b: [25, 3], S1: [13, 21], S2: [17, 21], S3: [21, 21], S4a: [25, 21], S4b: [25, 19] };
export const CRAB_HP = { 5: 100, 4: 87, 3: 75, 2: 75, 1: 75 };
export const CRAB = { size: 2, magic: 100, def: 100 };
export const FREEZE = { barrage: [32, 35], burst: [16, 17], blitz: [24, 26], rush: [8, 8] };   // [ticks, with an ancient sceptre]
export const FREEZE_IMMUNE = 5;
/** Her death: the room ends 8 ticks after the killing blow lands (in game: a halberd on t93 lands t94, the room ends t102 - 1:01.2). */
export const DEATH_TICKS = 8;
export const DINHS = { range: 11, maxHits: 10, crush: 124, str: 38, speed: 5, specCost: 50, specAcc: 1.2, def: { stab: 106, slash: 109, crush: 109, magic: -10, ranged: 148 } };
/** Pummel's extra strength from the player's total stab + slash + crush + ranged defence. */
export const dinhsStr = (stab, slash, crush, ranged) => Math.max(0, Math.floor((stab + slash + crush + ranged - 800) / 12 - 38));   // 11x11 around the player; primary first, then 9 by chunk order (primary can repeat)
export const CHIN = { atk: 80, rstr: 30, speed: 3, delay: 2, maxTargets: 12 };   // medium fuse, 4-5 tiles away (100%)
/** The magic accuracy roll a caster needs for a freeze that can't miss: (their base Magic level + 9) * 204. */
export const freezeSure = (baseMagic) => (baseMagic + 9) * 204;
/** The first room tick each prefire can go off: running in, 2 tiles a tick, a prefire goes on the tick its drag puts
 *  them in range (9 tiles out on tick 5, 7 on tick 6) - Twisted bow (10) and long range Ralos (9) on 5; ZCB (8) and
 *  Rapid Ralos (7) on 6. Long range's attack takes a tick longer (7 ticks, not 6). */
export const PREFIRE_TICK = { tbow: 5, zcb: 6, ralos: 6, ralosl: 5 };
/** Her attacks: every ATTACK_EVERY ticks from FIRST_ATTACK. */
export const FIRST_ATTACK = 9, ATTACK_EVERY = 10;
export const isAttackTick = (t) => t >= FIRST_ATTACK && (t - FIRST_ATTACK) % ATTACK_EVERY === 0;
/** Her procs: below 70% / 50% / 30% of her max HP (in percent), on the hit that takes her there. */
export const PROCS = [70, 50, 30];
/** Is this HP below the proc? (whole numbers: no rounding at 4s' 2143.4) */
export const belowProc = (team, pct, hp) => hp * 100 < MAIDEN_HP[team] * pct;
/** Has this hit (her HP before -> after) taken her below the proc? */
export const procsOn = (team, pct, before, after) => !belowProc(team, pct, before) && belowProc(team, pct, after);

// ---------------------------------------------------------------- the opening (prefires to the 70s proc)
//  - Each player has a list of attacks for the section (the Start section: the prefires to the 70s proc). The first is
//    their prefire (Twisted bow on tick 5, ZCB on tick 6); then each in turn as soon as their attack timer allows; the
//    last one repeats until the section ends. An attack they can't do (no weapon in the Gear tab, or not enough spec
//    energy) is skipped - the last one, when it's a spec they can't afford, falls back to their scythe (melee) or a
//    rapid Twisted bow (ranged).
//  - Attacks (next attack after / lands after, in ticks):
//     Twisted bow rapid 5 / 4 (from max distance); accurate 6 / 4 (+3 to effective Ranged attack and strength).
//     Blowpipe 2 / 2; Ascension crossbows 2 / 3 (Armour Piercing 5.5%: can't miss, 0-115% of the max).
//     ZCB 5 / 3 (an enchanted ruby proc 6.6%: 22% of her HP when it lands, max 110); ZCB spec (75%) 5 / 3 (2x accuracy;
//     a hit is the ruby: 22% of her HP, max 110).
//     Ralos Spec (50%) 6 / 3: two rolls at 1.5x accuracy, each hit that lands drains her Defence by her Magic / 8 = 43
//     before the next roll.
//     Elder maul spec (50%) 6 / 1: 1.25x accuracy, crush; a hit takes 35% of her Defence. BGS spec (50%) 6 / 1: 2x
//     accuracy, 1.21x max; a hit takes its damage off her Defence. Claw spec (50%) 4 / 1. Scythe 5 / 1 (3 hitsplats -
//     she's large). A Defence spec's drain applies when it's swung (as on Xarpus).
//  - Gear: their ranged gear (elite void) on Rigour at 112 Ranged; melee gear on their prayer (Zeal by default) at 118.
//  - Her attack every 10 ticks from tick 9, landing 5 ticks later: her accuracy (Magic 350, +300 magic attack) against
//    their magic defence in what they're wearing, up to MAX_HIT - off Protect from Magic with Vengeance up (36 with no
//    crabs leaked), on it without (18).
//  - Her targeting: the closest player to her centre tile (her SW tile + 3, 3), by Chebyshev distance - zones: 3 = red
//    (the row above her and the column east of her), 4 = orange, 5 = yellow ...; ties go to the player higher in orb order
//    (the player list, player 1 first). In the sim (behaviour, not settings): the tank (Maiden targets) holds the red
//    zone; the other melee player (the last one in the list with a melee attack - on Heal Other / Vengeance Other)
//    sits in orange. On her attack tick, if the tank has no Vengeance up and that player has, the tank flinches back a
//    zone and it goes to them. Tbows stand at max distance (off attack cooldown to freeze the spawns) - never her
//    target while the melee are in. Later: once the 30s crabs are frozen, the freezers come in and take priority
//    for tanking. Everyone starts with Vengeance cast and its
//    cooldown up: a hit of 1+ sends 75% (rounded down) back at her the same tick, and they recast straight away (no
//    tick lost; 50-tick cooldown).
//  - Spellbook toggles per player (all on by default): Veng - they cast Vengeance themselves (and Vengeance Other on a
//    teammate without it; the caster's 50-tick cooldown); without anyone on Veng, no Vengeance. Ancients (freezing the
//    crabs) and DC (Death Charge) are kept for what comes next. Thralls: their thrall's first hit lands 1-3 ticks after
//    their first attack (random, per player), then every 4 ticks: 0-3 damage, always lands (as in the other rooms).
//  - Stall Veng to prevent troll procs (a team-wide setting, on by default): the player she attacks, with Vengeance up, stalls
//    her attack so it lands on the tick their next scythe lands (not scything: the next scythe anyone lands) - its
//    Vengeance then can't proc her on a tick of its own. Her attack cycle itself doesn't move. From the start to her
//    30s proc (only the Start section so far).
//  - Within a tick: what lands first (in the order sent), then attacks. The 70s proc ends the section on its tick.
//  Later: how a player's list changes with the procs' timing (e.g. barraging the next crabs straight away on a fast
//  proc) is the sim's own behaviour, not more settings.
import { hit_chance } from './sim.js';
import { worn, bonuses } from './loadout.js';
import { tbowMult } from './sote.js';
import { hitMV, scytheMV, constMV, sumMV, halbMV } from './expdmg.js';

/** Her max hit by crabs leaked: on Protect from Magic / off it. */
export const MAX_HIT = { on: [18, 20, 21, 23, 25, 27, 29, 30, 32, 34, 36, 38, 39, 41, 43], off: [36, 40, 43, 47, 50, 54, 58, 61, 65, 68, 72, 76, 79, 83, 86] };
export const MAX_HIT_30 = { on: 72, off: 144 };   // (30 crabs)
/** The attacks: code -> {label, weapon, style, speed (next attack after), delay (lands after), spec (energy), code (Show raid)}. */
export const ATTACKS = {
  tbr: { label: 'Tbow (rapid)', weapon: 'Twisted bow', style: 'range', speed: 5, delay: 4, code: 'TB' },
  tdin2: { label: "Second Dinh's (if worth it)", weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // trio melee after their Dinh's (DC + surge): another on the crabs if it reaches enough of them, else a scythe (the spec saved for a ZCB after the 30s)
  surge: { label: 'Surge potion (+25% spec)', weapon: null, style: null, speed: 0, delay: 0, code: '' },   // a list line: drunk on their way to the next line, no tick lost; once a raid
  tpile: { label: 'Barrage the pile (else a tbow)', weapon: 'Twisted bow', style: 'range', speed: 5, delay: 4, code: 'TB' },   // trio mage after their freezes: pulls up and barrages a healthy pile (any wave's) before it leaks, else tbows her
  tba: { label: 'Tbow (accurate)', weapon: 'Twisted bow', style: 'range', speed: 6, delay: 4, code: 'TB' },
  bp: { label: 'Blowpipe', weapon: 'Toxic blowpipe', style: 'range', speed: 2, delay: 2, code: 'BP' },
  ax: { label: 'Ascension xbows', weapon: 'Ascension crossbows', style: 'range', speed: 2, delay: 3, code: 'AX' },
  zcb: { label: 'ZCB', weapon: 'Zaryte crossbow', style: 'range', speed: 5, delay: 3, code: 'Z' },
  zcbs: { label: 'ZCB spec', weapon: 'Zaryte crossbow', style: 'range', speed: 5, delay: 3, spec: 75, code: 'ZCB' },
  ralos: { label: 'Ralos spec (rapid)', weapon: 'Tonalztics of Ralos', style: 'range', speed: 6, delay: 3, spec: 50, code: 'Ra' },
  ralosl: { label: 'Ralos spec (long range)', weapon: 'Tonalztics of Ralos', style: 'range', speed: 7, delay: 3, spec: 50, code: 'Ra' },   // range 9 (Rapid 7): +1 tick to its attack
  maul: { label: 'Elder maul spec', weapon: 'Elder maul', style: 'melee', speed: 6, delay: 1, spec: 50, code: 'EM' },
  bgs: { label: 'BGS spec', weapon: 'Bandos godsword', style: 'melee', speed: 6, delay: 1, spec: 50, code: 'BGS' },
  claws: { label: 'Claw spec', weapon: 'Dragon claws', style: 'melee', speed: 4, delay: 1, spec: 50, code: 'C' },
  scythe: { label: 'Scythe', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },
  scys: { label: 'Scythe (crab + her)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S', crab: true },   // 'scys:N2@70:N' - a crab leaking the tick it lands: from its north (crab 100% + 50%, her 25%) or south (100% + 25%, her 50%)
  clawc: { label: 'Claw spec (crab)', weapon: 'Dragon claws', style: 'melee', speed: 4, delay: 1, spec: 50, code: 'C', crab: true },   // (trio DPS) a loose crab the mage can't freeze: only the claw player hits it
  aya: { label: 'Eye of ayak', weapon: 'Eye of ayak', style: 'magic', speed: 3, delay: 0, code: 'AY', crab: true },   // (trio mage) its own attack on a frozen 1 (no 3s: between the S2 and the 4s) - max approximated as a blitz's 26
  wait: { label: 'Wait a tick', weapon: null, style: null, speed: 1, delay: 0, code: '' },   // (trio mage) holding for a clump
  lose: { label: 'Lose 1 tick', weapon: null, style: null, speed: 1, delay: 0, code: '' },   // no attack: the next one goes a tick later
  ib: { label: 'Ice barrage', weapon: null, style: 'magic', speed: 5, delay: 0, code: 'IB', crab: true },   // 'ib:N1' - on a crab (Kodai; land delay by distance)
  ibs: { label: 'Ice barrage (sceptre)', weapon: null, style: 'magic', speed: 5, delay: 0, code: 'IBS', crab: true },   // ice ancient sceptre: a 35-tick freeze
  ibl: { label: 'Ice blitz', weapon: null, style: 'magic', speed: 5, delay: 0, code: 'IBL', crab: true },   // Eye of Ayak: one crab, 24 ticks
  ibu: { label: 'Ice burst', weapon: null, style: 'magic', speed: 5, delay: 0, code: 'IBU', crab: true },   // Eye of Ayak: 3x3, 16 ticks
  s1if: { label: 'Scythe (the 70s S1 if she is under X%)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // 's1if:62' (testing)
  fin: { label: 'Scythe, then the halberd as the last hit', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // (testing) scythes until their last swing that lands by the time the next crab reaches her: the forced halberd spec
  challyf: { label: 'Halberd spec (forced)', weapon: 'Crystal halberd', style: 'melee', speed: 7, delay: 1, code: 'HB' },   // (testing) goes off whatever their spec energy - to mirror footage
  chally: { label: 'Halberd spec', weapon: 'Crystal halberd', style: 'melee', speed: 7, delay: 1, spec: 30, code: 'HB' },   // Sweep: two hits on her (the second at 75% accuracy)
  ir: { label: 'Ice rush', weapon: null, style: 'magic', speed: 5, delay: 0, code: 'IR', crab: true },   // 'ir:S2' - one crab, an 8-tick freeze (Kodai; land delay by distance)
  dinhs: { label: "Dinh's spec", weapon: "Dinh's bulwark", style: 'melee', speed: 5, delay: 1, spec: 50, code: 'DB', crab: true },   // 'dinhs:N2@70' - from the crab's south side, west tile
  chin: { label: 'Chinchompa', weapon: 'Black chinchompa', style: 'range', speed: 3, delay: 2, code: 'CH', crab: true },   // at the clump: S3 / a 4 as the primary (the one that also catches S2)
  chin4: { label: 'Chinchompa (4s)', weapon: 'Black chinchompa', style: 'range', speed: 3, delay: 2, code: 'CH', crab: true },   // at the newest 4s (as they converge): the 4 that catches the most of them
  scyk: { label: 'Scythe (crab, to kill)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S', crab: true },   // 'scyk:S1@50' - while it's alive
  scyc: { label: 'Scythe (crab)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S', crab: true },   // 'scyc:S1@70' - only while it's on 20+ HP
  scyf: { label: 'Scythe (fast proc only)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // skipped when the last proc came 25+ ticks after the one before
  zcbg: { label: 'ZCB spec (if safe)', weapon: 'Zaryte crossbow', style: 'range', speed: 5, delay: 3, spec: 75, code: 'ZCB' },   // greedy: goes on a tick the scythes landed without a proc
  qfz: { label: 'Freeze (by spawns and timing)', weapon: null, style: 'magic', speed: 5, delay: 0, code: 'IBS', crab: true },   // 4s freezers (fside 'N' / 'S'): north S1, N2 (+ the clumps), south N1, S2 a tick later; one late: the clumps split
  qs1: { label: 'Scythe the S1 (70s first), else her', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // 4s range after the 50s proc: the 70s / 50s S1 if it's leaking over the line, else her
  qscy: { label: 'Scythe (or their thawed crab walking in)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },
  qchin: { label: 'Chins at the clump (3 or 5)', weapon: 'Black chinchompa', style: 'range', speed: 3, delay: 2, code: 'CH', crab: true },   // 4s range: 5 on rapid at a healthy clump, else 3 (the first on accurate) - back on the melee's tick
  qfin: { label: 'Scythe, the halberd for the last hit', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },
  qspec: { label: 'Best spec on her (ZCB, else claws)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // 4s melee at the 30s: a ZCB if they can (surge), else claws; the halberd is kept for the last hit
  chinp: { label: 'Chinchompa (the clump)', weapon: 'Black chinchompa', style: 'range', speed: 3, delay: 2, code: 'CH', crab: true },
  chinpa: { label: 'Chinchompa (the clump, accurate)', weapon: 'Black chinchompa', style: 'range', speed: 4, delay: 2, code: 'CH', crab: true },
  tfz: { label: 'Freeze (by spawns)', weapon: null, style: 'magic', speed: 5, delay: 0, code: 'IBS', crab: true },   // trio mage: S1 > N1 > S2 > N2, two a wave (all four out: S1, S2); no S1 / N1: ice rush the S2 into the clump
  tdps: { label: 'Scythe (or their crab / a straggler)', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S', crab: true },   // trio range / melee: once each (north first)
  tclean: { label: 'Scythe a high-HP crab', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S', crab: true },   // 'tclean:70:25': the highest-HP crab of that wave over 25, north first
  tdin: { label: "Dinh's (the sim times it)", weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // trio melee: up to 4 / 3 / 2 / 1 scythes after the 50s (12 / 15 / 18 / 21s split), then Dinh's where it hits the most crabs
  finz: { label: 'Scythe, then the ZCB spec last', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },   // trio: the ZCB spec on their last attack that lands before the next crab reaches her
  zcbf: { label: 'ZCB spec (forced)', weapon: 'Zaryte crossbow', style: 'range', speed: 5, delay: 3, code: 'ZCB' },   // (testing) whatever their spec energy
  zcbx: { label: 'ZCB spec (if not done)', weapon: 'Zaryte crossbow', style: 'range', speed: 5, delay: 3, spec: 75, code: 'ZCB' },   // skipped if their greedy ZCB went
};
/** A hit code's attack: 'ib:S2' -> the Ice barrage. */
export const atkOf = (a) => ATTACKS[String(a).split(':')[0]];
export const crabOf = (a) => (String(a).includes(':') ? String(a).split(':')[1].replace(/\+\d+$/, '') : null);   // 'ibs:4s+11': at the 4s, not before 11 ticks after the proc
/** A hit's label in lists: 'Ice barrage → S2'. */
export const hitLabel = (a) => (crabOf(a) ? `${atkOf(a).label} → ${crabOf(a)}` : (atkOf(a) || {}).label || a);
/** The 70s section's hits: everything but the prefires' extras, plus a barrage on each spawn. */
export const S70_HITS = () => [...Object.keys(ATTACKS).filter((a) => a !== 'ib'), ...Object.keys(SPAWNS).map((k) => `ib:${k}`)];
/** Ice Barrage (Kodai wand) in the caster's magic gear (Gear tab, Magic; empty slots fall back to their ranged gear), on
 *  Augury with a saturated heart (99 -> 112 Magic): max 30 x (1 + magic damage % + Augury 4%), accuracy roll
 *  (floor(112 x 1.25) + 9) x (magic attack + 64) against a crab's Magic 100 (no magic defence). The freeze can't miss
 *  while that roll is at least (99 + 9) x 204 (else it rolls too). E.g. Kodai, Elidinis' ward, occult, Confliction,
 *  the rest elite void: max 41, ~85% to hit. (Confliction's re-roll after a miss is left out.) */
export const BARRAGE = { base: 30, magic: 112, augury: [1.25, 4], cap: 9 };
export const RUSH_BASE = 18;   // Ice Rush: base max 18, the same magic damage bonuses
export function barrageOf(gear, weapon = 'Kodai wand', base = BARRAGE.base) {
  const b = bonuses(worn(gear, 'mage', weapon));
  return { max: Math.floor(base * (100 + b.mdmg + BARRAGE.augury[1]) / 100), roll: (Math.floor(BARRAGE.magic * BARRAGE.augury[0]) + 9) * (b.atk[3] + 64) };
}
/** The freeze spells by list code: the spell (FREEZE's row), sceptre (its longer freeze), the weapon cast with, base max, 3x3 or not. */
const SPELL_WEAPON = { IB: 'Kodai wand', IBS: 'Ice ancient sceptre', IBL: 'Eye of ayak', IBU: 'Eye of ayak', IR: 'Kodai wand', AY: 'Eye of ayak' };
const ATTACKS_SPEC = new Set(['ZCB', 'C', 'HB', 'DB', 'EM', 'Ra', 'BGS']);
export const FSPELL = {
  ib: { spell: 'barrage', name: 'Ice barrage', sc: 0, w: 'Kodai wand', base: 30, aoe: true },
  ibs: { spell: 'barrage', name: 'Ice barrage', sc: 1, w: 'Ice ancient sceptre', base: 30, aoe: true },
  ibl: { spell: 'blitz', name: 'Ice blitz', sc: 0, w: 'Eye of ayak', base: 26, aoe: false },
  ibu: { spell: 'burst', name: 'Ice burst', sc: 0, w: 'Eye of ayak', base: 22, aoe: true },
};
/** (Testing rule) a barrage on these crabs waits until this many ticks after the proc, so the crab is frozen where it
 *  clumps: S2 a tick late (with N1 / S1 frozen on the first tick), in the 3x3 of the S3 / N3 and 4s barrages. */
export const CLUMP_AT = { S2: 7, N1: 2 };   // N1: a tick after first tick (frozen a tile closer to N2 - in the Dinh's)
/** The same holds by list hit (testing rules): the barrages above, and an Ice rush on S2 in the N1 barrage's place (+2). */
export const HOLD = { 'ib:S2': 7, 'ib:N1': 2, 'ir:S2': 2 };
const isFreeze = (a) => /^(ib|ibs|ibl|ibu|ir):/.test(String(a)) || a === 'tfz' || a === 'qfz';
/** (Testing rule) once the 50s S1 / N1 is walking (out of its freeze) on more than `hp` HP, this player (index) scythes
 *  it as it walks to her, off their cooldown (it takes the place of their next attack): player 5 south, player 4 north. */
export const CHASE = { hp: 25, 'S1@50': 4, 'N1@50': 3 };
/** (Testing rules) the 50s coming early (under 12s - 20 ticks - after the 70s):
 *  - to stop it: before a scythe of player 5's that lands inside those 20 ticks, if her HP less what's expected to land
 *    by then (everything in flight, plus this tick's scythes) would be under 50%, they scythe the standalone 70s S1 instead;
 *  - if it still comes: the freezers finish their 70s freezes first (the one with some left skips the 50s S1), and
 *    players 4 and 5 scythe the 50s S1 before their 50s lists. */
/** Going for the kill (any scale, mostly 5s): the halberd early when it likely finishes her this tick (with what's in
 *  flight and the other swings landing with it); a freezer skips the 30s 3s / 4s barrage for a scythe or halberd on her
 *  when that likely kills her before those crabs could heal her. "Likely": this chance or more (normal approximation). */
export const KILL = { halberd: 0.5, skip: 0.75 };
export const EARLY50 = { ticks: 20, stopper: 4, s1: [3, 4], z: 0.674 };   // z: "at risk" = a 1 in 4 chance or more (normal approximation)
/** Where the casters stand from the 70s proc (for the barrage land delay): 7 tiles east of her, by caster order. */
export const CASTER_SPOTS = [[14, 10], [14, 13], [14, 7], [14, 16], [14, 4]];
/** Magic land delay (the game's): 1 + floor((1 + distance) / 3) - for the damage only: a barrage's freeze (and who it hits)
 *  goes the moment it's cast (queued). */
export const magicDelay = (d) => 1 + Math.floor((1 + d) / 3);
/** What can be a prefire, and the first tick it can go. */
export const PREFIRES = ['tbr', 'tba', 'zcb', 'zcbs', 'ralos', 'ralosl'];
/** Where a player stands for their tbow shots after the prefire (prefires are always from max range): ticks to land. */
export const TBOW_FROM = [[4, '9–10 tiles · lands in 4t'], [3, '3–8 tiles · lands in 3t'], [2, '1–2 tiles · lands in 2t']];
export const tbowFromOf = (c) => (TBOW_FROM.some(([d]) => d === Number(c.tbowFrom)) ? Number(c.tbowFrom) : 4);
const isTbow = (a) => a === 'tbr' || a === 'tba';
/** A hit's land delay: a tbow / ZCB shot after the prefire lands by where they stand. */
export const delayOf = (a, first, from = 4) => ((isTbow(a) || /^zcb/.test(a)) && !first ? from : ATTACKS[a].delay);   // tbows and ZCBs after the prefire land by where they stand (9-10 tiles 4, 3-8 3, 1-2 2)
const prefireTick = (a) => (a === 'ralos' || a === 'ralosl' ? PREFIRE_TICK[a] : ATTACKS[a].weapon === 'Twisted bow' ? PREFIRE_TICK.tbow : PREFIRE_TICK.zcb);
/** Prayer on her attacks: the player she attacks takes it off Protect from Magic with Vengeance up (so it hits harder -
 *  her max 36 with no crabs leaked, not 18), and prays correctly without it. */
export const PRAYING = false;   // (kept: off prayer with Vengeance up)
export const AUTO_DELAY = 5, VENG_CD = 50, RUBY = 0.066;
/** Spec energy: +10% every 50 ticks (each player's own timer); a surge potion: +25%, once a raid (5-minute cooldown) -
 *  drunk (no tick lost) when a spec in their list is short. */
export const REGEN_EVERY = 50, SURGE = 25;
const RANGED = 112, MELEE = 118, MAGIC_LVL = 99, DEF_LVL = 118;
const PRAY = { Piety: [1.20, 1.23], Zeal: [1.25, 1.28] };
const RIGOUR = [1.20, 1.23];
const PRAY_DEF = { Piety: 1.25, Zeal: 1, Rigour: 1.25 };      // Zeal: no Defence boost (assumed)
const RANGE_SEQ = ['tbr', 'ax', 'ralos', 'tbr'], MELEE_SEQ = ['tbr', 'maul', 'scythe'];
/** The default plan by scale: half the team ranged (tbow, Ascension hit, Ralos spec, tbows), the rest melee (tbow,
 *  Elder maul spec, scythes); 100% spec; her attacks on the last player. */
/** 3s / 4s procedure roles and the specs each can be set to use after each proc (the engine picks when). */
export const PROC_ROLES = { 3: [['mage', 'Mage (freezer)'], ['range', 'Range'], ['melee', 'Melee']], 4: [['north', 'North freezer'], ['south', 'South freezer'], ['range', 'Range'], ['melee', 'Melee']] };
/** 3s / 4s defaults by role: the prefires, then each phase's list - its smart lines (freeze by spawns, Dinh's, scythe
 *  or a straggler, chins 3 / 5, best spec, halberd last hit) and the surge line where their ZCB needs it. */
const F5 = ['tfz', 'tfz', 'tfz', 'tfz', 'tfz'], F4 = ['qfz', 'qfz', 'qfz', 'qfz'];
const FRZ = { ancients: true, veng: false, thralls: false, dc: false }, DPSP = { ancients: false, veng: true, thralls: true, dc: true };
const IBN = ['ib:S1', 'ib:N2', 'ib:3s', 'ib:4s'], IBS4 = ['ib:N1', 'ib:S2'], IBT = ['ibs:S1', 'ibs:S2', 'ibs:N2', 'ibs:3s', 'ibs:4s'], CH5 = ['chinp', 'chinp', 'chinp', 'chinp', 'chinp'];
export const ROLE_DEFAULT = {
  3: { mage: { seq: ['tbr', 'ralos', 'bp', 'tbr'], s70: [...IBT, 'surge', 'zcbs', 'tbr'], s50: [...IBT], s30: [...IBT, 'scythe'], spells: FRZ },
    range: { seq: ['tbr', 'ralos', 'scythe'], s70: ['scythe'], s50: ['scythe', 'surge', 'zcbs', 'scythe'], s30: ['scythe'], spells: DPSP },
    melee: { seq: ['tbr', 'ralos', 'scythe'], s70: ['scythe'], s50: ['dinhs', 'surge', 'dinhs', 'scythe'], s30: ['scythe', 'zcbs', 'scythe'], spells: DPSP } },
  4: { north: { seq: ['tbr', 'ax', 'ralos', 'tbr'], s70: [...IBN, 'tbr'], s50: [...IBN, 'surge', 'zcbs', 'tbr'], s30: [...IBN, 'scythe'], spells: FRZ },
    south: { seq: ['tba', 'ax', 'ralos', 'tbr'], s70: [...IBS4, 'tbr'], s50: [...IBS4, 'tbr', 'tbr', 'surge', 'zcbs', 'tbr'], s30: [...IBS4, 'scythe'], spells: FRZ },
    range: { seq: ['tbr', 'maul', 'scythe'], s70: ['scythe'], s50: ['scyk:S1', ...CH5, 'surge', 'zcbs', 'scythe'], s30: ['scythe'], spells: DPSP },
    melee: { seq: ['tbr', 'maul', 'scythe'], s70: ['scythe'], s50: ['dinhs', 'scythe'], s30: ['surge', 'zcbs', 'scythe', 'chally'], spells: DPSP } },
};
export const PROC_DEFAULT = { 3: ['mage', 'range', 'melee'], 4: ['north', 'south', 'range', 'melee'] };
/** A role's default player (structured copy). */
export const roleDefault = (team, role) => { const d = ROLE_DEFAULT[team][role]; return { role, seq: d.seq.slice(), s70: { seq: d.s70.slice() }, s50: { seq: d.s50.slice() }, s30: { seq: d.s30.slice() }, spells: { ...d.spells }, startSpec: 100 }; };
/** What a role means to the engine (freezer side / DPS slot / where they stand on her). */
export function procedureOf(team, role) {
  if (team === 3) return role === 'range' ? { dps: 0 } : role === 'melee' ? { dps: 1 } : {};
  return { north: { fside: 'N', side: 'N' }, south: { fside: 'S', side: 'S' }, range: { dps: 0, side: 'E' }, melee: { dps: 1, side: 'N' } }[role] || {};
}
/** The smart lines offered in a 3s / 4s phase list (with the plain hits). */
export const PROC_HITS = () => [...['S1', 'N1', 'S2', 'N2', '3s', '4s', 'pile'].flatMap((id) => [`ib:${id}`, `ibs:${id}`]), 'ir:S2', 'scythe', ...['S1', 'N1', 'S2', 'N2'].map((id) => `scyk:${id}`), 'dinhs', 'chinp', 'chinpa', 'zcbs', 'claws', 'chally', 'fin', 'finz', 'surge', 'tbr', 'tba', 'bp', 'ax', 'lose'];
/** The engine options for a 3s / 4s procedure run (spawn-dependent picks; 6 / 8 crabs a proc; full room). */
export const procedureOpts = (team) => (team === 3 ? { plain: true, trio: true, spawnN: 6, standPct: 1.5, to: 0 } : { plain: true, trio: true, quad: true, spawnN: 8, standPct: 1.5, to: 0 });
/** 5s: the stacked procedure (tested Nov 18) - short 70s freezes so those crabs come out of immunity as the 50s sceptre
 *  barrages go out and get frozen again with the new wave. P1 / P2 freeze from the east, P3 freezes then melees north,
 *  P4 (south, the S1 player) bursts the 4s, P5 (north) halberds the 70s N1. */
const FIVE_STACK = [
  { seq: ['tbr', 'bp', 'ralos', 'tbr'], s70: ['ibs:S1', 'ibl:N3', 'tbr', 'tbr', 'zcbs', 'tbr'], s50: ['ibs:N1', 'ibs:N2', 'ibs:3s', 'tbr'], s30: ['ibs:N1', 'ibs:N2', 'ibs:3s', 'scythe', 'chally'] },
  { seq: ['tbr', 'bp', 'ralos', 'tbr'], s70: ['ibl:S2', 'ibl:S3', 'tbr'], s50: ['ibs:S1', 'ibs:S2@70', 'tbr', 'zcbs', 'tbr'], s30: ['ibs:S1', 'ibs:S2', 'ibs:4s', 'scythe', 'chally'] },
  { seq: ['tbr', 'maul', 'bp', 'tbr'], s70: ['ibl:N2', 'scyc:N1@70:25|scythe', 'tbr'], s50: ['tbr', 'tbr', 'ibs:4s+11', 'zcbs', 'scythe'], s30: ['scythe', 'chally'] },
  { side: 'S', seq: ['zcbs', 'scythe'], s70: ['ibu:N4', 'ibu:4s', 'scythe', 's1if:58', 'scythe'], s50: ['chally:S1@70', 'scyc:S1@70:0', 'scythe'], s30: ['scythe', 'chally'] },
  { side: 'N', seq: ['tba', 'scythe'], s70: ['chally:N1@70', 'scythe', 'scythe', 'tbr', 'scythe'], s50: ['scythe', 'scythe', 'scythe', 'zcbs', 'scythe'], s30: ['scythe', 'chally'] },
];
export function defaultMaidenPlan(team) {
  if (team === 5) return { target: 4, players: FIVE_STACK.map((p) => ({ ...(p.side ? { side: p.side } : {}), seq: p.seq.slice(), s70: { seq: p.s70.slice() }, s50: { seq: p.s50.slice() }, s30: { seq: p.s30.slice() }, startSpec: 100 })) };
  const nR = Math.floor(team / 2);
  return { target: team - 1, players: Array.from({ length: team }, (_, k) => ({ seq: (k < nR ? RANGE_SEQ : MELEE_SEQ).slice(), startSpec: 100 })) };
}
/** A player's list from an older saved shape ({role, prefire}) or as saved: the first a prefire, every code known. */
export function seqOf(p, k = 0, team = 4) {
  let s = Array.isArray(p.seq) ? p.seq.filter((a) => ATTACKS[a]) : null;
  if (!s || !s.length) s = (p.role === 'melee' || (p.role == null && k >= Math.floor(team / 2)) ? MELEE_SEQ : RANGE_SEQ).slice();
  if (!Array.isArray(p.seq) && p.prefire === 'accurate') s[0] = 'tba';
  if (!PREFIRES.includes(s[0])) s.unshift('tbr');
  return s;
}
/** When each hit in a player's list goes (the engine's own order: the last repeats, a hit they can't do is skipped):
 *  [{fire, land} | {wait} | {skip}] by list index, plus the repeat's speed. */
export function scheduleOf(c, k = 0, team = 4) {
  const seq = seqOf(c, k, team), from = tbowFromOf(c), out = [];
  let t = prefireTick(seq[0]), spec = Number(c.startSpec ?? 100);
  seq.forEach((a, j) => {
    const A = ATTACKS[a];
    if (a === 'lose') { out.push({ wait: t }); t += 1; return; }
    if (!canDo(c.gear || {}, a) || (A.spec && spec < A.spec)) { out.push({ skip: !canDo(c.gear || {}, a) ? 'not in Gear' : 'not enough spec' }); return; }
    if (A.spec) spec -= A.spec;
    out.push({ fire: t, land: t + delayOf(a, j === 0, from), melee: A.style === 'melee', tbow: isTbow(a) && j > 0 });
    t += A.speed;
  });
  return out;
}
/** A player's spellbook toggles (each defaults on): ancients (freezes - with the crabs), thralls, dc (Death Charge),
 *  veng (cast Vengeance themselves, and Vengeance Other on a teammate who can't). */
export const SPELLS = [['ancients', 'Ancients'], ['thralls', 'Thralls'], ['dc', 'DC'], ['veng', 'Veng']];
export const spellsOf = (c) => Object.fromEntries(SPELLS.map(([k]) => [k, !(c.spells && c.spells[k] === false)]));
const own = (p, w) => (p.gear.weapons || []).includes(w);
/** Can the player do this attack at all (the weapon's in their Gear)? */
export const canDo = (gear, a) => !atkOf(a).weapon || (gear.weapons || []).includes(atkOf(a).weapon);
const dRoll = (d) => (d + 9) * (0 + 64);                      // every defence bonus 0
/** Ranged on Rigour in their ranged gear: [chance, max]. accurate: +3 to both effective levels. */
function ranged(p, weapon, d, { accMult = 1, accurate = false } = {}) {
  const b = bonuses(worn(p.gear, 'range', weapon)), v = b.eliteVoid ? [1.10, 1.125] : [1, 1], st = accurate ? 3 : 0;
  const ea = Math.floor((Math.floor(RANGED * RIGOUR[0]) + st + 8) * v[0]), es = Math.floor((Math.floor(RANGED * RIGOUR[1]) + st + 8) * v[1]);
  let roll = Math.floor(ea * (b.atk[4] + 64) * accMult), mx = Math.floor(0.5 + es * (b.rstr + 64) / 640);
  if (weapon === 'Twisted bow') { const [ma, md] = tbowMult(Math.max(MAIDEN.magic, MAIDEN.magicAtk)); roll = Math.floor(roll * ma); mx = Math.floor(mx * md); }
  return [hit_chance(roll, dRoll(d)), mx];
}
/** Melee in their melee gear (aggressive): [chance, max]. idx 1 slash, 2 crush. */
function melee(p, weapon, idx, d, accMult = 1) {
  const b = bonuses(worn(p.gear, 'melee', weapon)), [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(MELEE * pa) + 8, es = Math.floor(MELEE * ps) + 3 + 8;
  return [hit_chance(Math.floor(ea * (b.atk[idx] + 64) * accMult), dRoll(d)), Math.floor((es * (b.str + 64) + 320) / 640)];
}
/** Her attack's chance to hit a player in this style's gear. */
function autoChance(p, style) {
  if (style === 'magic') style = 'mage';                // barraging: in their magic gear (the Gear tab's Magic)
  const b = bonuses(worn(p.gear, style)), pd = style === 'range' ? PRAY_DEF.Rigour : (PRAY_DEF[p.gear.prayer || 'Zeal'] ?? 1);
  const eff = Math.floor(MAGIC_LVL * 0.7 + Math.floor(DEF_LVL * pd) * 0.3) + 8;
  return hit_chance((MAIDEN.magic + 9) * (MAIDEN.magicAtk + 64), eff * (b.dfn[3] + 64));
}
const roll = (rng, ch, mx) => (rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0);
/** Dragon claws: the four hits (as on Xarpus). */
function clawRolls(ch, mx, rng) {
  for (let k = 0; k < 4; k++) {
    if (rng.random() >= ch) continue;
    if (k === 0) { const x = rng.randint(Math.floor(mx / 2), mx - 1); return [x, Math.floor(x / 2), Math.floor(x / 4), Math.floor(x / 4) + 1]; }
    if (k === 1) { const x = rng.randint(Math.floor(3 * mx / 8), Math.floor(7 * mx / 8)); return [0, x, Math.floor(x / 2), Math.floor(x / 2) + 1]; }
    if (k === 2) { const x = rng.randint(Math.floor(mx / 4), Math.floor(3 * mx / 4)); return [0, 0, x, x + 1]; }
    return [0, 0, 0, rng.randint(Math.floor(mx / 4), Math.floor(5 * mx / 4))];
  }
  return rng.random() < 2 / 3 ? [1, 1, 0, 0] : [0, 0, 0, 0];
}

/**
 * One raid's opening, to the 70s proc. players: [{name, gear, seq, startSpec}]; opts: {target (player index), trace ([] to
 * fill for Show raid), maxTick}. Returns {proc (tick, null if it never came), procBy ('attack': a player's attack or a
 * stalled Vengeance landing with a scythe; 'thrall'; 'veng': a Vengeance on a tick of its own), hp (after the proc's tick), def, specs
 * ({code: [used, landed]}), maulsLanded, vengs, skipped ([{i, a}] attacks skipped), dmg: {kind: total}}.
 */
export function runMaiden(players, team, rng, log = null, { target = team - 1, trace = null, maxTick = 400, hps = null, stall = true, to = 70, room = null, skip = null, sure = false, plain = false, ignore30 = false, ignoreCrabs = null, crabDelay = 0, aoeBox = false, aoe = 'sw', path = 'row', stop50 = null, trio = false, spawnN = null, standPct = 3.5, quad = false, autoSurge = null } = {}) {
  const AUTOSURGE = autoSurge ?? !trio;   // 3s / 4s procedures: a surge only where their list says (the 'surge' line)   // trio: the trio guide's spawn-dependent picks (tfz / tdps / tclean / tdin / finz); spawnN: that many random spawns a wave (trios: 6)   // stop50 (plain): {by: player index, ticks} - that player scythes the standalone 70s S1 once if the 50s risks coming under `ticks` after the 70s   // (testing) aoe: 'sw' SW tile in the 3x3 / 'fp' any tile in it (OpenRune) / 'box'; path: 'row' to her SW row / 'overlap' until its tiles overlap her rows   // crabDelay: extra ticks before a new crab's first step (testing)   // sure: every spec and freeze lands; plain: none of the testing rules (HOLD, CHASE, EARLY50, the S2 clump) - freezers stand for the 70s too   // to: 70 / 50 / 30 - the proc the run ends on, 0 - her death; room: [] for the crabs each tick   // hps: [] for her HP at the end of each tick
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const MAX = MAIDEN_HP[team] || 3500;
  let hp = MAX, def = MAIDEN.def, proc = null;
  const st = { specs: {}, maulsLanded: 0, vengs: 0, dmg: {}, skipped: [], leaks: 0, healed: 0, frozen: {}, proc50: null, procBy50: null, proc30: null, procBy30: null, dead: null, greedy: 0 };
  let phase = 70;                                      // the proc coming next
  const ps = players.map((c, i) => {
    const seq = seqOf(c, i, team);
    const sp = spellsOf(c);
    const s70 = c.s70 || {}, seq70 = (Array.isArray(s70.seq) ? s70.seq.filter((a) => atkOf(a)) : []);
    return { i, name: c.name || `P${i + 1}`, gear: c.gear, seq, spells: sp, spec: Number(c.startSpec ?? 100), tbowFrom: tbowFromOf(c), step: 0, next: prefireTick(seq[0]), style: 'range', veng: false, vengReady: 0,
      stand70: !!c.stand70, standAt: Number(c.standAt) || 70, seq70: seq70.length ? seq70 : [seq[seq.length - 1]], from70: tbowFromOf(s70),
      seq50: (Array.isArray((c.s50 || {}).seq) && c.s50.seq.filter((a) => atkOf(a)).length) ? c.s50.seq.filter((a) => atkOf(a)) : (seq70.length ? seq70 : [seq[seq.length - 1]]), from50: c.s50 ? tbowFromOf(c.s50) : tbowFromOf(s70), regenAt: 0, surged: false, dps: c.dps ?? null, fside: c.fside ?? null, noClaw: !!c.noClaw, noZcb30: !!c.noZcb30, dcLeft: trio ? 2 : 0 };
  });
  for (const p of ps) { const c = players[p.i]; p.seq30 = (Array.isArray((c.s30 || {}).seq) && c.s30.seq.filter((a) => atkOf(a)).length) ? c.s30.seq.filter((a) => atkOf(a)) : [p.seq50[p.seq50.length - 1]]; p.from30 = c.s30 ? tbowFromOf(c.s30) : p.from50; }
  // a list ending in scythes then a Halberd spec (on her): scythe until the halberd's time - the last swing that lands
  // before a crab reaches her, or earlier when it likely kills her (the 'fin' line)
  const lastHit = (L) => { if (L[L.length - 1] !== 'chally') return L; let i = L.length - 1; while (i > 0 && L[i - 1] === 'scythe') i--; return i < L.length - 1 ? [...L.slice(0, i), 'fin'] : L; };
  for (const p of ps) { p.seq70 = lastHit(p.seq70); p.seq50 = lastHit(p.seq50); p.seq30 = lastHit(p.seq30); }
  if (trio) for (const p of ps) {                     // (3s / 4s) the 5s-style lines as the procedure plays them
    const dps = p.dps != null; let din = 0;
    p.fzL = { 70: p.seq70.slice(), 50: p.seq50.slice(), 30: p.seq30.slice() };
    const tr = (L, w) => L.flatMap((a, k) => {
      const id = crabOf(a);
      if (!dps && isFreeze(a) && id) return [id === 'pile' || id === 'old' ? 'tpile' : quad ? 'qfz' : 'tfz'];
      if (dps && a === 'scythe') return [quad ? 'qscy' : 'tdps'];
      if (a === 'dinhs') return [din++ ? 'tdin2' : 'tdin'];
      if (a === 'fin') return ['qfin'];
      if (a === 'finz') return ['finz:5'];
      if (a === 'chinp' || a === 'chinpa') return quad && !['chinp', 'chinpa'].includes(L[k - 1]) ? ['qchin'] : quad ? [] : [a];
      if (quad && dps && a === 'scyk:S1') return ['qs1'];
      if (quad && dps && w === 30 && a === 'zcbs') return ['qspec'];
      return [a];
    });
    p.seq70 = tr(p.seq70, 70); p.seq50 = tr(p.seq50, 50); p.seq30 = tr(p.seq30, 30);
    // the trio freezer's barrage on the leftover pile (50s / 30s) is the sim's call: right after their last freeze
    if (!quad && !dps) for (const k of ['seq50', 'seq30']) { const L = p[k], i = L.reduce((m, a, j) => (a === 'tfz' ? j : m), -1); if (i >= 0 && !L.includes('tpile')) L.splice(i + 1, 0, 'tpile'); }
  }
  for (const p of ps) p.regenAt = rng.randint(1, REGEN_EVERY);
  // where each player stands on her (backend, from their lists): the Dinh's players on her north side (red zone), the
  // other melee on her south side (orange), the freezers on her east side (red - after the 30s, when they come in)
  { const has = (p, k) => [p.seq, p.seq70, p.seq50, p.seq30].some((l) => (l || []).some((a) => String(a).startsWith(k)));
    const N = [[7, 8], [6, 8], [5, 8], [4, 8]], S = [[5, 15], [4, 15], [6, 15], [3, 15]], E = [[8, 11], [8, 12], [8, 10], [8, 13]]; let n = 0, so = 0, e = 0;
    for (const p of ps) { const sd = players[p.i].side; p.spot = sd === 'N' ? N[n++ % 4] : sd === 'S' ? S[so++ % 4] : sd === 'E' ? E[e++ % 4] : has(p, 'ib:') ? E[e++ % 4] : has(p, 'dinhs') ? N[n++ % 4] : S[so++ % 4]; p.pos = [24, 10 + (p.i % 4)]; } }   // side: 'N' / 'S' (a player's own setting) first   // spec energy: +10% every 30s (50 ticks) on each player's own timer
  // Vengeance from the start: their own (Veng ticked), else a teammate's Vengeance Other (anyone with Veng)
  const vengers = ps.filter((p) => p.spells.veng);
  for (const p of ps) p.veng = vengers.length > 0;
  /** Vengeance again after a proc: their own if they have it and it's off cooldown, else Vengeance Other from a teammate
   *  whose cooldown is up (the caster's cooldown). No tick lost either way. */
  const hold = plain ? {} : HOLD;
  const recast = (p, t) => {
    const others = p === tgt && sec && sec.spells.veng ? [sec, ...vengers.filter((q) => q !== sec)] : vengers;   // the tank's: the flincher first (Heal Other / Vengeance Other)
    const by = p.spells.veng && t >= p.vengReady ? p : others.find((q) => q !== p && t >= q.vengReady);
    if (!by) return;
    p.veng = true; by.vengReady = t + VENG_CD;
    L.on && L(`t${t} ${by === p ? `${p.name} recasts Vengeance` : `${by.name} casts Vengeance Other on ${p.name}`}`);
  };
  const tgt = ps[Math.min(ps.length - 1, Math.max(0, Number(target) || 0))];
  // the flincher (backend, not a setting): the other melee player - the last one in the list with a melee attack in it
  const sec = ps.filter((p) => p !== tgt && p.seq.some((a) => ATTACKS[a] && ATTACKS[a].style === 'melee')).pop() || null;
  st.flinches = 0;
  const HC = [MAIDEN_TILE.x + 3, MAIDEN_TILE.y + MAIDEN_TILE.size - 1 - 3];   // her centre: her SW tile + 3 east, 3 north
  const zone = ([x, y]) => Math.max(Math.abs(x - HC[0]), Math.abs(y - HC[1]));   // 3 red, 4 orange, 5 yellow ...
  /** Where a player is for her targeting: on their spot when a melee hit on her is coming within 2 ticks, else where they
   *  last acted from. */
  const posAt = (p, t) => { const nx = atkOf(p.seq[Math.min(p.step, p.seq.length - 1)]) || {}; return nx.style === 'melee' && !nx.crab && p.next - t <= 2 ? p.spot : p.pos; };
  /** Who she attacks: the closest to her centre (zones: 3 red, 4 orange ...), ties by orb order. A flinch is two tiles
   *  (+2 zones), so players without Vengeance (and no way to have it by the time it lands: their own off cooldown by
   *  then, or a teammate's Vengeance Other now) flinch only when that puts a player who has it in front of them all
   *  (closer, or as close and higher in orb order); then it goes to that player. Otherwise nobody flinches and the
   *  closest takes it (praying). */
  const pick = (t) => {
    const land = t + AUTO_DELAY, ahead = (a, b) => a.z < b.z || (a.z === b.z && a.p.i < b.p.i);
    const c = ps.map((p) => ({ p, z: zone(posAt(p, t)), own: p.veng || (p.spells.veng && p.vengReady <= land - 1) })).sort((a, b) => a.z - b.z || a.p.i - b.p.i);
    for (const [k, q] of c.entries()) {
      const vo = q.own ? null : vengers.find((x) => x !== q.p && t >= x.vengReady);
      if (!q.own && !vo) continue;                       // q can't have it either: keep looking past them
      const before = c.slice(0, k);                      // all without Vengeance: they'd have to flinch past q
      if (!before.every((b) => ahead(q, { z: b.z + 2, p: b.p }))) break;   // flinching can't put q in front: nobody flinches
      if (vo) { q.p.veng = true; vo.vengReady = t + VENG_CD; L.on && L(`t${t} ${vo.name} casts Vengeance Other on ${q.p.name}`); }
      for (const b of before) flinch(b.p, t, q.p);
      return q.p;
    }
    return c[0].p;
  };
  const flinch = (q, t, to) => {
    const nx = atkOf(q.seq[Math.min(q.step, q.seq.length - 1)]) || {};
    if (nx.style === 'melee' && q.next <= t) { q.next = t + 1; st.flinchLost = (st.flinchLost || 0) + 1; }   // two tiles out on her attack tick: a melee hit due then waits a tick (back in)
    st.flinches++; L.on && L(`t${t} ${q.name} flinches two tiles (no Vengeance in time; praying Magic) - her attack goes to ${to.name}`); if (trace) trace.push({ t, i: q.i, flinch: true }); };
  const hits = [];                                     // {t, p, a, amt?, tr?, label, ok?}
  let procBy = null;                                   // what procced her: a player's attack (or a stalled Vengeance landing with a scythe) / 'thrall' / 'veng'
  const damage = (t, amt, label, kind, stalled = false) => {
    if (amt <= 0) { L.on && L(`t${t} ${label} 0`); return; }
    if (st.dead != null) return;
    const before = hp; hp -= amt; st.dmg[kind] = (st.dmg[kind] || 0) + amt;
    if (hp <= 0 && st.dead == null) { st.dead = t; st.end = t + DEATH_TICKS; L.on && L(`t${t} ${label} ${amt} -> Maiden 0 *** dead ***`); return; }
    L.on && L(`t${t} ${label} ${amt} -> Maiden ${hp}`);
    const by = kind === 'thrall' || (kind === 'veng' && !stalled) ? kind : 'attack';
    if (phase === 70 && procsOn(team, 70, before, hp)) { proc = t; procBy = by; phase = 50; L.on && L(`t${t} *** 70s proc (below ${(MAX * 0.7).toFixed(1)}) ***`); }
    else if (phase === 50 && proc != null && procsOn(team, 50, before, hp)) { st.proc50 = t; st.procBy50 = by; phase = 30; L.on && L(`t${t} *** 50s proc (below ${(MAX * 0.5).toFixed(1)}) ***`); }
    else if (phase === 30 && st.proc50 != null && procsOn(team, 30, before, hp)) { st.proc30 = t; st.procBy30 = by; phase = 0; L.on && L(`t${t} *** 30s proc (below ${(MAX * 0.3).toFixed(1)}) ***`); }
  };
  const lowerDef = (t, what, by) => { if (by <= 0 || def <= 0) return; def = Math.max(0, def - by); L.on && L(`t${t} ${what} lowers her Defence -> ${def}`); };
  /** The tick a stalled attack lands: the target's next scythe landing (queued, or their next swing if it's a scythe),
   *  else the next scythe anyone has queued; null: none coming. */
  const stallTo = (p, t) => {
    const mine = hits.filter((x) => x.p === p && x.a === 'scythe' && x.t >= t).map((x) => x.t);
    if (mine.length) return Math.min(...mine);
    if (p.seq[Math.min(p.step, p.seq.length - 1)] === 'scythe' && own(p, 'Scythe of vitur')) return Math.max(p.next, t) + 1;
    const any = hits.filter((x) => x.a === 'scythe' && x.t >= t).map((x) => x.t);
    return any.length ? Math.min(...any) : null;
  };
  /** A player's thrall hit landing on tick `at` (0-3 damage, as in the other rooms). */
  const thrall = (p, at) => {
    const d = rng.randint(0, 3), tr = trace ? { t: at - 1, i: p.i, thrall: true, dmg: d, icon: 'Greater_ghost' } : null;
    hits.push({ t: at, p, a: 'thrall', amt: d, tr }); if (tr) trace.push(tr);
  };
  const used = (a, ok) => { const x = (st.specs[a] ||= [0, 0]); x[0]++; if (ok) x[1]++; };
  /** The tick the next crab heals her (it reaches her the tick before), as things stand on tick t; null: none coming. */
  /** The tick crab c would reach her (walking from where it is, after its freeze / first step). */
  const reachOf = (c, t) => { let { x, y } = c, n = 0;
    while (!adjacent({ x, y }) && n < 60) { const sw = y + 1; x -= 1; if (path === 'overlap') { if (y + 1 < MT.y) y += 1; else if (y > my1) y -= 1; } else if (sw < SWROW) y += 1; else if (sw > SWROW) y -= 1; n++; }
    return Math.max(t + 1, c.frozenTo + 1, c.born + crabDelay + 1) + n - 1; };
  const deadline = (t) => {
    let D = null;
    for (const c of crabs) {
      if (!c.alive || c.leaked != null) continue;
      let { x, y } = c, n = 0;
      while (!adjacent({ x, y }) && n < 60) { const sw = y + 1; x -= 1; if (path === 'overlap') { if (y + 1 < MT.y) y += 1; else if (y > my1) y -= 1; } else if (sw < SWROW) y += 1; else if (sw > SWROW) y -= 1; n++; }
      const reach = Math.max(t + 1, c.frozenTo + 1, c.born + crabDelay + 1) + n - 1;
      if (D == null || reach + 1 < D) D = reach + 1;
    }
    return D;
  };
  /** 'fin': a scythe, or the forced halberd spec on their last swing that lands by the deadline. */
  /** The chance she's dead by tick `by` (hits in flight, the others' scythes landing by then, plus `mine`). */
  const killP = (p, t, by, mine) => {
    const due = hits.filter((h) => h.t <= by && h.exp != null);
    let mean = due.reduce((x, h) => x + h.exp, 0) + mine[0], v = due.reduce((x, h) => x + (h.v || 0), 0) + mine[1];
    for (const q of ps) {
      if (q === p || !own(q, 'Scythe of vitur') || !/^(scythe|fin|qfin|tdps|qscy|finz)/.test(String(q.seq[Math.min(q.step, q.seq.length - 1)]))) continue;
      const [ch, mx] = melee(q, 'Scythe of vitur', 1, def), [sm, sv] = scytheMV(ch, mx);
      for (let f = Math.max(q.next, t); f + 1 <= by; f += 5) { mean += sm; v += sv; }
    }
    const z = (mean - hp + 0.5) / Math.sqrt(Math.max(1, v));
    return 1 / (1 + Math.exp(-1.702 * z));
  };
  const halbOf = (p) => { const [c1, mx] = melee(p, 'Crystal halberd', 1, def), [c2] = melee(p, 'Crystal halberd', 1, def, 0.75); return halbMV(c1, c2, mx); };
  const scyOf = (p) => { const [ch, mx] = melee(p, 'Scythe of vitur', 1, def); return scytheMV(ch, mx); };
  const canHalb = (p) => !p.finDone && p.spec >= 30 && own(p, 'Crystal halberd');
  const finPick = (p, t, X = null) => {
    if (p.finDone) return 'scythe';
    if (canHalb(p) && !globalThis.__NOKILL) {   // the halberd now when it likely finishes her (and a scythe likely wouldn't)
      const pH = killP(p, t, t + 1, halbOf(p)), pS = own(p, 'Scythe of vitur') ? killP(p, t, t + 1, scyOf(p)) : 0;
      if (pH >= KILL.halberd && pS < KILL.halberd) { p.finDone = true; ovr(`${p.name}: halberd early for the kill`); L.on && L(`t${t} ${p.name}: halberd early - likely kills her (${Math.round(pH * 100)}%, scythe ${Math.round(pS * 100)}%)`); return 'challyf'; }
    }
    const D = deadline(t);
    if (D != null && t + 1 <= D && t + 6 > D) { p.finDone = true; return 'challyf'; }
    // 'fin:X': the halberd early, as soon as she's at or under X% (a hit or more before the last possible swing)
    if (X != null && hp * 100 <= MAX * X) { p.finDone = true; L.on && L(`t${t} ${p.name}: Maiden at ${(hp * 100 / MAX).toFixed(1)}% (≤ ${X}%) - halberd early`); return 'challyf'; }
    return 'scythe';
  };
  // ---- trio picks (the trio guide's procedure, opt-in): who freezes / hits what depends on which crabs spawned
  const wavePlans = {};
  /** The freezer(s): the trio mage, or (4s) both freezers as one - their freezes this wave merged. */
  const fzMage = () => { if (!quad) return ps.find((x) => x.seq70.some((a) => a === 'tfz' || (isFreeze(a) && crabOf(a)))); const D = {}; for (const f of ps.filter((x) => x.fside)) for (const [w, d] of Object.entries(f.qD || {})) { D[w] ||= new Set(); for (const v of d) D[w].add(v); } return { tfzD: D }; };
  const planOf = (w, t) => {
    if (wavePlans[w]) return wavePlans[w];
    if (quad) { const here = (id) => crabs.some((c) => c.wave === w && c.id === id); return (wavePlans[w] = { fz: ['S1', 'N1', 'S2', 'N2'].filter(here), left: [], rush: !here('N1') && here('S2') }); }   // 4s: the two freezers take every 1 and 2
    const here = (id) => crabs.some((c) => c.wave === w && c.id === id), out = ['S1', 'N1', 'S2', 'N2'].filter(here);
    let fz, rush = false;
    if (out.length === 4) fz = ['S1', 'S2'];                                   // all four: the freezer takes the south pair, the DPS the north
    else if (!here('S1') && !here('N1') && here('S2')) { fz = ['S2', ...(here('N2') ? ['N2'] : [])]; rush = true; }   // ice rush the S2 so it walks into the 3s / 4s
    else { const ones = ['S1', 'N1'].filter(here), twos = ['S2', 'N2'].filter(here); fz = ones.length ? [ones[0], ...twos.slice(0, 1)] : twos; }   // one 1 (S1 > N1: the other's out of reach - the DPS take it), then a 2 (S2 > N2)
    const left = ['N1', 'N2', 'S1', 'S2'].filter((id) => out.includes(id) && !fz.includes(id));
    L.on && L(`t${t} ${w}s plan: freezer ${fz.map((x, k) => (rush && k === 0 ? `${x} (ice rush)` : x)).join(', ') || '-'} · DPS ${left.join(', ') || '-'}`);
    return (wavePlans[w] = { fz, left, rush });
  };
  /** Trio mage, wave by wave: the 1s / 2s (S1 > N1 > S2 > N2, two of them - all four: S1, S2; no S1 / N1: ice rush the S2
   *  so it thaws into the clump), then the 3s once they've clumped, then the 4s once they walk into the frozen 3s (the
   *  4s and 3s are always one clump). Waits a tick at a time for a clump ('wait'). */
  const ofWave = (w, ids) => crabs.filter((c) => c.wave === w && c.alive && c.leaked == null && ids.includes(c.id.replace(/[ab]$/, '')));
  const clumpReady = (w, which, t) => {
    const mine = ofWave(w, [which === '3s' ? 'N3' : 'N4', which === '3s' ? 'S3' : 'S4']);
    if (!mine.length) return null;                                   // none of them: skip
    if (mine.some((c) => reachOf(c, t) <= t + 1)) return true;       // it reaches her next tick: now or never
    if (which === '3s') return mine.length === 1 ? t >= (st.proc30 ?? st.proc50 ?? proc) + 11 : mine.every((c) => mine.every((q) => inArea(c, q)));   // a lone 3: on the usual 3s tick (proc + 11), in the usual spot   // a lone 3: a tile off her row (the 4s still walk into it)
    if (ofWave(w, ['N3', 'S3']).some((c) => t > c.frozenTo && t > c.immuneTo)) return false;   // the 3s first: the 4s walk into them
    if (!crabs.some((c) => c.wave === w && /^[NS]3$/.test(c.id))) { if (w === 30) { const m = fzMage(), d = m && m.tfzD && m.tfzD[w]; return !!d && planOf(w, t).fz.every((id) => d.has(id)); } if (t < (st.proc30 ?? st.proc50 ?? proc) + 16) return false; }   // no 3s: the 4s on their usual tick (proc + 16); the 30s: straight off cooldown (she dies before they matter - start scything sooner)
    const threes = (crabs.some((c) => c.wave === w && /^[NS]3$/.test(c.id)) ? ofWave(w, ['N3', 'S3']) : ofWave(w, ['S2'])).filter((c) => t <= c.frozenTo);   // no 3s: the S2 frozen in their spot
    return threes.length ? mine.some((c) => threes.some((q) => inArea(q, c))) : mine.every((c) => c.y + 1 === SWROW) && mine.every((c) => mine.every((q) => inArea(c, q)));
  };
  /** The trio mage's freezes for the latest wave all gone (what's left of its 'tfz' slots are fillers: they stand for the next proc). */
  /** An older wave's crab the mage's coming 3s / 4s barrage (this wave's, not cast yet) will cleave as that clump walks
   *  past it - landing before it reaches her, freezing it again (or finishing it): the DPS leave it. */
  const clumpCovers = (q, t) => {
    const w = latestWave(), m = fzMage(); if (!m || w == null || q.wave === w) return false;
    const done = m.tfzD && m.tfzD[w], lim = reachOf(q, t);
    for (const which of ['3s', '4s']) { if (done && done.has(which)) continue;
      for (const c of ofWave(w, which === '3s' ? ['N3', 'S3'] : ['N4', 'S4'])) {
        let x = c.x, y = c.y, k = Math.max(t, c.frozenTo, c.born + crabDelay);
        for (let n = 0; n < 60 && !adjacent({ x, y }); n++) {
          if (inArea({ x, y }, q) && k + 2 < lim && ((k > q.frozenTo && k > q.immuneTo) || q.hp <= 25)) return true;
          const sw = y + 1; x -= 1; if (path === 'overlap') { if (y + 1 < MT.y) y += 1; else if (y > my1) y -= 1; } else if (sw < SWROW) y += 1; else if (sw > SWROW) y -= 1; k++;
        }
      } }
    return false;
  };
  /** What a barrage on the pile is worth now (HP kept from healing her, ~20 a crab) - only crabs that reach her before the
   *  next proc's clump barrage could cleave them (her HP to go at the rate since the last proc - at least ~22 a tick, everyone on her - + 12); the barrage's primary too. */
  const pileWorth = (t, horizon = true, id = 'pile') => {
    const c = barragePrim(id, t); if (!c) return { c: null, v: 0 };
    const since = phase === 30 ? st.proc50 : phase === 50 ? proc : null, rate = since != null && t - since >= 5 ? Math.max(22, (MAX * (phase + 20) / 100 - hp) / (t - since)) : 22;   // her HP going down at the rate it has since the last proc
    const eta = phase > 0 ? t + Math.max(0, hp - MAX * phase / 100) / rate + 12 : Infinity;   // the next proc's 3s / 4s barrage: ~11 after it, landing a tick on
    return { c, v: aoe3(c, BARRAGE.cap).filter((q) => q.alive && q.leaked == null && (!horizon || reachOf(q, t) <= eta)).reduce((u, q) => u + Math.min(q.hp, 20), 0) };
  };
  /** A crab that reached her this tick explodes (heals her) on the next - a hit landing then still counts (tick perfect; how the game works). */
  const boom = (c, t) => !globalThis.__NOBOOM && !!c && !c.alive && c.leaked === t && c.died == null;
  /** Pushing her instead: after the 30s, no straggler scythes at all; before it,
   *  a crab in the frozen pile under 50 HP isn't worth a scythe that can't cleave her - the push brings the 30s and its cleave. */
  const pushPast = (q, t) => {
    if (phase === 0 && team >= 3) return true;   // after the 30s (trios and up): everyone on her - killing her is what stops the leaks; the 30s crabs are never touched (the DPS's own unfreezable N1 / N2 aside)
    if (phase === 30 && q.frozenTo > 0 && q.hp < 50 && crabs.some((o) => o !== q && o.alive && o.leaked == null && inArea(o, q))) return true;
    return false;
  };
  /** 4s freezers, wave by wave (the team's procedure): south N1, then S2 (a tick after the north: S2 clumps); north S1, N2,
   *  then the 3s and 4s. A freezer late to its first freeze (north: proc + 1, south: proc + 2): 1 tick - they also take
   *  the 3s, the other the 4s; 2+ ticks - they take the 4s, the other the 3s. No N1 but an S2: the south ice rushes it.
   *  A missing crab: a filler in its slot (the 70s a tbow; the 50s / 30s a barrage on the older pile if it's healthy). */
  const quadPlans = {};
  const quadPlan = (w, t) => {
    if (quadPlans[w]) return quadPlans[w];
    const here = (id) => crabs.some((c) => c.wave === w && c.id === id), pt = Math.min(...crabs.filter((c) => c.wave === w).map((c) => c.born));
    const N = ps.find((x) => x.fside === 'N'), S = ps.find((x) => x.fside === 'S'), start = { N: pt + 1, S: pt + 2 };
    const late = (f, sd) => (f ? Math.max(0, Math.max(f.next, start[sd]) - start[sd]) : 0), lN = late(N, 'N'), lS = late(S, 'S');
    // an ice rush line counts as that crab: it is rushed only when the N1 before it did not spawn, else barraged as usual
    const listed = (f) => (f ? ((f.fzL || {})[w] || []).filter((a) => isFreeze(a) && crabOf(a) && !/^(pile|old)$/.test(crabOf(a))).map((a) => String(crabOf(a))) : []);
    const LN = listed(N), LS = listed(S), byList = LN.length + LS.length > 0;   // their written freeze lines (else the team's standard split)
    const ones = (L, dflt) => { const q = (byList ? L : dflt).filter((x) => /^(rush:)?[NS][12]$/.test(x)); const rushIt = q.includes('N1') && q.includes('S2') && !here('N1') && here('S2');
      return q.map((x) => { const i0 = x.replace('rush:', ''); if (rushIt) return i0 === 'N1' ? 'rush:S2' : i0 === 'S2' ? 'fill' : (here(i0) ? i0 : 'fill'); return here(i0) ? x : 'fill'; }); };
    const out = { start, N: ones(LN, ['S1', 'N2']), S: ones(LS, ['N1', 'S2']) };
    const clN = byList ? LN.filter((x) => /^[34]s$/.test(x)) : ['3s', '4s'], clS = byList ? LS.filter((x) => /^[34]s$/.test(x)) : [], U = [...new Set([...clN, ...clS])];
    let how;
    if ((lN === 0 && lS === 0) || U.length < 2) { out.N.push(...clN); out.S.push(...clS); how = 'on time: the clumps as listed'; }
    else { const lt = lN >= lS ? 'N' : 'S', ot = lt === 'N' ? 'S' : 'N', amt = Math.max(lN, lS); if (amt === 1) { out[lt].push('3s'); out[ot].push('4s'); } else { out[lt].push('4s'); out[ot].push('3s'); }
      ovr(`${lt === 'N' ? 'North' : 'South'} late: the clumps split`);
      how = `${lt === 'N' ? 'north' : 'south'} ${amt} tick${amt > 1 ? 's' : ''} late: ${lt === 'N' ? 'north' : 'south'} the ${amt === 1 ? '3s' : '4s'}, ${ot === 'N' ? 'north' : 'south'} the ${amt === 1 ? '4s' : '3s'}`; }
    L.on && L(`t${t} ${w}s freezes (${how}): north ${out.N.join(', ')} · south ${out.S.join(', ')}`);
    return (quadPlans[w] = out);
  };
  const qfzPick = (p, t) => {
    const w = latestWave(); if (w == null || !p.fside) return null;
    const Q = quadPlan(w, t), list = Q[p.fside], done = ((p.qD ||= {})[w] ||= new Set()), idx = ((p.qI ||= {})[w] ||= new Set()), IB = own(p, 'Ice ancient sceptre') ? 'ibs' : 'ib';   // Kodai: plain barrage
    if (t < Q.start[p.fside] && !idx.size) return 'wait';            // the south's first freeze a tick after the north's
    const lp = st.proc30 ?? st.proc50 ?? proc;
    for (const [k, it] of list.entries()) {
      if (idx.has(k)) continue;
      if (it === 'fill') { idx.add(k); if (w !== 70) { const c = barragePrim('old', t); if (c && aoe3(c, BARRAGE.cap).reduce((u, q) => u + q.hp, 0) >= 100) return `${IB}:old`; } return 'tbr'; }
      if (it === '3s' || it === '4s') {
        const r = clumpReady(w, it, t);
        if (r == null) { idx.add(k); done.add(it); continue; }
        if (r === true) { idx.add(k); done.add(it); return `${IB}:${it}`; }
        const due = lp + (it === '3s' ? 11 : 16);
        if (t + 5 <= due) { if (w !== 70) { const c = barragePrim('old', t); if (c && aoe3(c, BARRAGE.cap).reduce((u, q) => u + q.hp, 0) >= 100) return `${IB}:old`; } return 'tbr'; }
        return 'wait';
      }
      const rushIt = /^rush:/.test(it), id = rushIt ? it.slice(5) : it, c = crabRef(`${id}@${w}`);
      idx.add(k); done.add(id);
      if (!c || !c.alive || c.leaked != null || t <= c.frozenTo) continue;
      return `${rushIt ? 'ir' : IB}:${id}@${w}`;
    }
    return null;
  };
  const qfzSpent = (p, t) => { const w = latestWave(); if (w == null || !quadPlans[w] || !p.fside) return false; return quadPlans[w][p.fside].every((_, k) => p.qI && p.qI[w] && p.qI[w].has(k)); };
  /** 4s range / melee picks. A leaking S1 (of the given waves) over the line: the scythe on it (cleave if it reaches her as it lands). */
  const s1Swing = (p, t, waves) => {
    const red = def < 13 ? 26 : def < 52 ? 25 : def < 92 ? 24 : def < 132 ? 23 : def < 173 ? 22 : 21, blue = def < 53 ? 18 : def < 110 ? 17 : def < 168 ? 16 : 15, mag = def < 13 ? 40 : def < 52 ? 39 : def < 92 ? 38 : def < 133 ? 37 : def < 173 ? 36 : 35;
    for (const c of crabs.filter((q) => q.id === 'S1' && waves.includes(q.wave) && ((q.alive && q.leaked == null) || boom(q, t)))) {
      const r = c.alive ? reachOf(c, t) : t + 1; if (r < t + 1 || r > t + 6 || hits.some((h) => h.t >= t && h.parts && h.parts.some((x) => x.c === c))) continue;
      if (r === t + 1) { if (c.hp >= mag) return `scys:${c.key}:N`; if (c.hp >= blue) return `scys:${c.key}:S`; continue; }
      if (c.hp >= red) return `scyk:${c.key}`;
    }
    return null;
  };
  /** 4s DPS: a thawed (or thawing) 70s / 50s 1 or 2 on their side walking in over jaggers_0's line - the melee (north) the
   *  N1s and N2s, the range the S1s and N2s; one of them a crab (two only over 60 HP). Leaking the tick it lands: the
   *  cleave scythe (crab + her). The 30s crabs are never touched (she's dead first). */
  const qStrag = (p, t) => {
    const mine = p.side === 'N1' ? ['N1'] : p.side === 'N' ? ['N1', 'N2'] : ['S1', 'N2'];
    const red = def < 13 ? 26 : def < 52 ? 25 : def < 92 ? 24 : def < 132 ? 23 : def < 173 ? 22 : 21, blue = def < 53 ? 18 : def < 110 ? 17 : def < 168 ? 16 : 15, mag = def < 13 ? 40 : def < 52 ? 39 : def < 92 ? 38 : def < 133 ? 37 : def < 173 ? 36 : 35;
    const inflight = (q) => hits.some((h) => h.t >= t && h.parts && h.parts.some((x) => x.c === q));
    const cand = crabs.filter((q) => mine.includes(q.id) && q.wave !== 30 && !inflight(q) && !(q.scyBy != null && q.scyBy !== p.i && q.hp <= 60) && q.frozenTo > 0 && ((q.alive && q.leaked == null && q.frozenTo <= t + 5) || boom(q, t)))   // frozen once (the freezers' crabs): thawed or thawing
      .map((q) => ({ q, r: q.alive ? reachOf(q, t) : t + 1 })).filter((x) => x.r >= t + 1 && x.r <= t + 6).sort((u, v) => u.r - v.r || v.q.hp - u.q.hp);
    for (const { q, r } of cand) {
      if (r === t + 1) { if (q.hp >= mag) { q.scyBy ??= p.i; return `scys:${q.key}:N`; } if (q.hp >= blue) { q.scyBy ??= p.i; return `scys:${q.key}:S`; } continue; }
      if (q.hp >= red) { q.scyBy ??= p.i; return `scyk:${q.key}`; }
    }
    return null;
  };
  /** (3s / 4s) a ZCB on their list they didn't get to before the proc: kept - it goes as soon as their freezes are done. */
  const ovr = (x) => { (st.ovr ||= []).push(x); };
  /** (3s / 4s) a 5s-style line as the procedure plays it: a freeze line - the freezer's next freeze (the target can change
   *  with the spawns and their timing); a barrage on the pile - only if it's worth it (else a tbow); a DPS scythe - her or
   *  their crab / a straggler; Dinh's - the sim's timing and target (a 2nd: only if it reaches 4+); the last-hit halberd /
   *  ZCB; a scythe on a 1 / 2 - the oldest one alive (else her); a chinchompa - at the clump (3 or 5 by its HP). */
  const lineOf = (p) => { const a = p.seq[Math.min(p.step, p.seq.length - 1)]; return trio ? procLine(p, a) : a; };
  const procLine = (p, a) => {
    const id = crabOf(a);
    if (isFreeze(a) && id) return id === 'pile' || id === 'old' ? 'tpile' : quad ? 'qfz' : 'tfz';
    if (a === 'scythe' && p.dps != null) return quad ? 'qscy' : 'tdps';
    if (a === 'dinhs') return p.dinDone ? 'tdin2' : 'tdin';
    if (a === 'fin') return 'qfin';
    if (a === 'finz') return 'finz:5';
    if (a === 'chinp' || a === 'chinpa') return 'qchin';
    if (/^scyk:[NS][12]$/.test(String(a))) { const c = [70, 50].map((w) => crabs.find((q) => q.id === id && q.wave === w && q.alive && q.leaked == null)).find(Boolean); return c ? `scyk:${c.key}` : 'scythe'; }
    return a;
  };   // where the sim went off their list (the report counts these)
  const carry = (p, next, t) => {
    if (!trio || !p.seq.slice(p.step).includes('zcbs') || next.includes('zcbs')) return next;
    const at = next.reduce((m, a, i) => (isFreeze(a) || a === 'tfz' || a === 'qfz' ? i : m), -1) + 1, out = next.slice(), sg = p.seq.slice(p.step).includes('surge') && !p.surged ? ['surge'] : [];
    out.splice(at, 0, ...sg, 'zcbs'); ovr(`${p.name}: ZCB kept for after the next proc's freezes`);
    L.on && L(`t${t} ${p.name} keeps their ZCB for after their freezes`); return out;
  };
  /** (3s / 4s) a ZCB on their list without the spec for it (no surge / death charges short): the best spec they can do -
   *  a Dinh's where it reaches 4+ crabs (before the 30s), else claws on her; null: nothing (the halberd is kept for the last hit). */
  const specFallback = (p, a, t) => {
    if (!/^zcbs?$/.test(String(a).split(':')[0]) || p.spec < 50) return null;
    if (phase !== 0 && own(p, "Dinh's bulwark")) { const pk = dinPick(0); if (pk && pk.n >= 4) { p.dinPos = pk.pos; return `dinhs:${pk.key}`; } }
    return own(p, 'Dragon claws') ? 'claws' : null;
  };
  const tfzSpent = (p, t) => { const w = latestWave(); if (w == null) return false; const P = planOf(w, t), done = p.tfzD && p.tfzD[w];
    return !!done && P.fz.every((id) => done.has(id)) && ['3s', '4s'].every((x) => done.has(x) || clumpReady(w, x, t) == null); };
  const tfzPick = (p, t) => {
    const w = latestWave(); if (w == null) return null;
    const P = planOf(w, t), done = ((p.tfzD ||= {})[w] ||= new Set());
    for (const which of ['3s', '4s']) if (!done.has(which) && clumpReady(w, which, t) === true) { done.add(which); return `ibs:${which}`; }   // a clump that's ready goes first
    const spawned = (re) => crabs.some((c) => c.wave === w && re.test(c.id)), no3 = !spawned(/^[NS]3$/), anchorS2 = no3 && !P.rush && spawned(/^S2$/) && spawned(/^[NS]4/);   // by what spawned this wave
    for (const [k, id] of P.fz.entries()) {                          // then the 1s / 2s still out and not frozen, by priority
      if (done.has(id)) continue;
      const c = crabRef(`${id}@${w}`);
      if (id === 'S2' && anchorS2 && c && c.alive && c.leaked == null && Math.abs(c.y + 1 - SWROW) > 1 && reachOf(c, t) > t + 1) return 'wait';   // no 3s: the S2 a tick later, frozen where the 3s would clump (the 4s walk into it)
      done.add(id);
      if (!c || !c.alive || c.leaked != null || t <= c.frozenTo) continue;
      return `${P.rush && k === 0 ? 'ir' : 'ibs'}:${id}@${w}`;
    }
    if (anchorS2 && w !== 30 && done.has('S2') && !done.has('aya')) { done.add('aya'); const loose = crabs.filter((c) => c.alive && c.leaked == null && t > c.frozenTo).sort((u, v) => v.hp - u.hp)[0]; return `aya:${loose ? loose.key : 'maiden'}`; }   // then an Eye of ayak hit on a loose crab (else her), and a tick lost - the 4s on their usual tick
    for (const which of ['3s', '4s']) if (!done.has(which)) {
      if (clumpReady(w, which, t) == null) { done.add(which); continue; }
      // an empty freeze slot (a cast fits before this clump's usual tick): the 70s a tbow on her; the 50s / 30s a barrage on the
      // older pile from right by it, unless it's very low (then the tbow)
      const lp = st.proc30 ?? st.proc50 ?? proc, due = lp + (which === '3s' ? 11 : 16);
      if (w === 70 && !P.fz.length && which === '3s') {   // the 70s with no 1s / 2s: 2 ticks lost so the tbow goes on proc + 3, then an Eye of ayak hit (3 ticks), then the 3s on their tick
        if (!done.has('tb')) { if (t < lp + 3) return 'wait'; done.add('tb'); return 'tbr'; }
        if (!done.has('aya') && t + 3 <= due) { done.add('aya'); const loose = crabs.filter((c) => c.alive && c.leaked == null && t > c.frozenTo && !/^[NS][34]/.test(c.id)).sort((u, v) => v.hp - u.hp)[0]; return `aya:${loose ? loose.key : 'maiden'}`; }
        return 'wait';
      }
      if (t + 5 <= due) { if (w !== 70) { const c = barragePrim('old', t); if (c && aoe3(c, BARRAGE.cap).reduce((u, q) => u + q.hp, 0) >= 100) return 'ibs:old'; } return 'tbr'; }
      return 'wait';   // hold for the clump
    }
    return null;
  };
  /** Trio DPS (the guide): they hit only the 1s / 2s the mage won't freeze this wave ('left' in the wave's plan - range
   *  the first, melee the second), once each: a scythe, or in the 30s a claw spec on that N1 / N2 if they have the energy
   *  (then only they hit it). In the 50s, range then takes the high-HP 70s crabs walking in again (over 25, north first).
   *  Anything else - crabs the mage freezes or clumps - is left alone: they're on her. */
  const dpsSwing = (p, t) => {
    if (quad) return qStrag(p, t) || 'scythe';                       // 4s: on her, or a thawed 1 / 2 of theirs walking in over the line
    const w = latestWave();
    if (w != null && p.dps != null) {
      const P = planOf(w, t), done = ((p.dpsD ||= {})[w] ||= new Set());
      const clawer = (q) => q && !q.noClaw && own(q, 'Dragon claws') && q.spec >= 50, other = ps.find((q) => q.dps != null && q !== p);
      // one crab for them: both DPS scythe it - except a 30s N1 / N2 someone can claw: the claw player's alone (range first)
      if (!('cf' in P)) P.cf = P.left.length === 1 && w === 30 && /^N[12]$/.test(P.left[0]) ? (clawer(p.dps === 0 ? p : other) ? 0 : clawer(p.dps === 0 ? other : p) ? 1 : null) : null;
      const clawFor = P.cf; let id;
      if (P.left.length === 1) id = clawFor == null || p.dps === clawFor ? P.left[0] : null;
      else if (w === 30 || globalThis.__ONEEACH) id = P.left[p.dps];
      else {   // two for them (70s / 50s): both scythe the one reaching her first, then the other
        const rch = (x) => { const c = crabRef(`${x}@${w}`); return c && c.alive && c.leaked == null ? reachOf(c, t) : boom(c, t) ? t + 1 : -1; };
        P.lord ||= [...P.left].sort((a, b) => rch(a) - rch(b));
        // the melee too (their Dinh's timing still decides when it goes instead); range leaves the second only when it's the main target of the Dinh's about to go (it takes two splats)
        const dl = ps.find((d) => d !== p && d.dps != null && ['tdin', 'dinhs'].includes(d.seq[Math.min(d.step, d.seq.length - 1)]) && d.spec >= DINHS.specCost && (d.sw50 || 0) >= 1 && d.next <= t + 1), dk = dl ? dinPick(0) : null;
        id = P.lord.find((x, k) => !done.has(x) && rch(x) >= (k === 0 ? t + 2 : t + 1) && (k === 0 || !(dk && dk.key === `${x}@${w}`))) || null;   // the second: on it as it reaches her too (crab + her cleave)
      }
      if (id && !done.has(id)) {
        const c = crabRef(`${id}@${w}`);
        // their one crab still hittable a swing from now (landing as it reaches her, or as it explodes): her now, the crab then - with the cleave on her
        // (not the Dinh's player in the 50s: their swings there are for the Dinh's timing)
        if (P.left.length === 1 && !(w === 50 && (p.seq50 || []).some((a) => /^tdin/.test(a))) && clawFor !== p.dps && c && c.alive && c.leaked == null && reachOf(c, t) >= t + 5) return 'scythe';
        if (c && ((c.alive && c.leaked == null && reachOf(c, t) === t + 1) || boom(c, t)) && (c.claim == null || c.claim === p.i) && clawFor !== p.dps) {   // reaching her the tick it lands: the cleave scythe (crab + her)
          const mg = def < 13 ? 40 : def < 52 ? 39 : def < 92 ? 38 : def < 133 ? 37 : def < 173 ? 36 : 35, bl = def < 53 ? 18 : def < 110 ? 17 : def < 168 ? 16 : 15;
          if (c.hp >= bl) { done.add(id); return `scys:${c.key}:${c.hp >= mg ? 'N' : 'S'}`; }
        }
        if (c && c.alive && c.leaked == null && (c.claim == null || c.claim === p.i) && reachOf(c, t) > t + 1) {
          done.add(id);
          if (clawFor === p.dps && own(p, 'Dragon claws') && p.spec >= 50) { c.claim = p.i; L.on && L(`t${t} ${p.name} claws the 30s ${id} (the mage can't freeze it)`); return `clawc:${c.key}`; }
          return `scyk:${c.key}`;
        }
      }
      // stragglers about to leak - walking, or frozen in the pile and thawing before their next swing (a pile crab leaks a tick
      // after it thaws, so it has to be hit before) (jaggers_0's chart, by her Defence - zeal / 2 oath / rancour / treads): leaking the tick the
      // hit lands, the scythe cleaves crab + her (north from the magenta line, south from the blue); before that, a full
      // scythe on it over the red line (it would leak before their next swing). Not the mage's planned freezes, and never
      // two of them on one crab.
      const red = def < 13 ? 26 : def < 52 ? 25 : def < 92 ? 24 : def < 132 ? 23 : def < 173 ? 22 : 21, blue = def < 53 ? 18 : def < 110 ? 17 : def < 168 ? 16 : 15, mag = def < 13 ? 40 : def < 52 ? 39 : def < 92 ? 38 : def < 133 ? 37 : def < 173 ? 36 : 35;
      const mage = fzMage(), mdone = mage && mage.tfzD ? mage.tfzD[w] : null, P2 = planOf(w, t);
      const planned = (q) => q.wave === w && t > q.frozenTo && (P2.fz.includes(q.id) ? !(mdone && mdone.has(q.id)) : /^[NS][34]/.test(q.id) ? !(mdone && mdone.has(q.id[1] === '3' ? '3s' : '4s')) : false);
      const taken = (q) => hits.some((h) => h.t >= t && h.parts && h.parts.some((x) => x.c === q));
      const dpl = ps.find((d) => d !== p && d.dps != null && ['tdin', 'dinhs'].includes(d.seq[Math.min(d.step, d.seq.length - 1)]) && d.spec >= DINHS.specCost && (d.sw50 || 0) >= 1), dpk = dpl ? dinPick(0, new Set([...crabs.filter((c) => hits.some((h) => h.t >= t && h.parts && h.parts.some((x) => x.c === c))).map((c) => c.key), ...P2.left.map((id) => `${id}@${w}`)])) : null;   // where their Dinh's will go (the same pick they make: crabs being hit / the DPS's own left out)
      const dinCovers = (q) => !!dpk && dpk.key === q.key && dpl.next <= t + 1 && reachOf(q, t) > dpl.next + 1;   // the main target of the Dinh's going now (two splats on it): leave it to the melee
      const st0 = crabs.filter((q) => q.alive && q.leaked == null && (t > q.frozenTo || q.frozenTo <= t + 5) && !planned(q) && !taken(q) && !clumpCovers(q, t) && !dinCovers(q) && !pushPast(q, t) && !(q.rushed && !(mdone && mdone.has('4s')) && q.wave === w) && !(q.wave === w && P2.left.includes(q.id) && !ps.some((d) => d.dpsD && d.dpsD[w] && d.dpsD[w].has(q.id))) && !(q.claim != null && q.claim !== p.i) && !(q.scyBy != null && q.scyBy !== p.i && q.hp <= 60)).map((q) => ({ q, r: reachOf(q, t) })).concat(crabs.filter((q) => boom(q, t) && !pushPast(q, t) && !taken(q) && !(q.scyBy != null && q.scyBy !== p.i) && !(q.claim != null && q.claim !== p.i)).map((q) => ({ q, r: t + 1 }))).filter((x) => x.r >= t + 1 && x.r <= t + 6).sort((u, v) => (u.r <= t + 5 ? 0 : 1) - (v.r <= t + 5 ? 0 : 1) || v.q.hp - u.q.hp || u.r - v.r);   // the ones leaking before their next swing first, the most HP of those   // the wave's unfreezable 1s / 2s belong to their DPS (the claw player's alone)   // an unfreezable 1 / 2: theirs once, then fair game on its way in; a clawed crab stays the claw player's
      for (const { q, r } of st0) {
        if (r === t + 1) { if (q.hp >= mag) { q.scyBy ??= p.i; return `scys:${q.key}:N`; } if (q.hp >= blue) { q.scyBy ??= p.i; return `scys:${q.key}:S`; } continue; }
        if (q.hp > red) { q.scyBy ??= p.i; return `scyk:${q.key}`; }   // theirs: the other DPS leaves it unless it's still really high HP
      }
    }
    return 'scythe';
  };
  const tdpsPick = (p, t) => (p.dps == null ? null : dpsSwing(p, t));
  let curT = 0;
  const tcleanPick = (a) => { const [, W, th] = String(a).split(':'), thr = th == null || th === '' ? 25 : Number(th);
    const pool = crabs.filter((c) => c.alive && c.leaked == null && String(c.wave) === W && c.hp > thr).sort((u, v) => reachOf(u, curT) - reachOf(v, curT) || (u.id[0] === 'N' ? 0 : 1) - (v.id[0] === 'N' ? 0 : 1) || v.hp - u.hp);   // the next to reach her first
    return pool.length ? `scyc:${pool[0].key}:${thr}` : null; };
  /** Trio Dinh's (the guide): on a crab the cleaving barrages won't reach (one standing on its own - a lone S1, a floating
   *  S2; its double hitsplat is worth the most there), from the side of it (north / south / east / west, either tile) whose
   *  11x11 takes in the most other crabs; that crab low (under 30) or none on its own: Maiden, from the tile next to her
   *  that covers the most crabs. -> {key ('maiden' for her), pos, side} */
  const DIN_LOW = 30;
  const dinPick = (ahead = 0, skip = null) => {
    // ahead: the pick a few ticks from now (the crabs that are walking moved on; nothing else changes); skip: a crab left to a scythe
    const live = crabs.filter((q) => q.alive && q.leaked == null && !(skip && skip.has(q.key) && q.hp <= 30)).map((q) => { if (skip && skip.has(q.key)) q = { ...q, hp: q.hp - 30 }; if (!ahead) return q; const c = { ...q }; for (let k = 1; k <= ahead; k++) { if (curT + k <= c.frozenTo) continue; const sw = c.y + 1; c.x -= 1; if (sw < SWROW) c.y += 1; else if (sw > SWROW) c.y -= 1; } return c; }).filter((q) => !adjacent(q));
    const blocked = (x, y) => x < 0 || y < 0 || x > 27 || y > 23 || (x >= MT.x && x <= mx1 && y >= MT.y && y <= my1);
    // what a Dinh's hitsplat is worth on each: ~21 a splat (capped by its HP left), double on a crab that will leak and
    // that the barrages won't cleave (every HP it keeps heals her two) - one off on its own, walking in or frozen; less on
    // one in the pile (the barrages cleave it); her: one splat at face value
    const mage = fzMage(), clumpDone = (q) => !!(mage && mage.tfzD && mage.tfzD[q.wave] && mage.tfzD[q.wave].has('4s'));
    const md = mage && mage.tfzD ? mage.tfzD : {}, P0 = latestWave() != null ? planOf(latestWave(), curT) : { fz: [] };
    const toFreeze = (q) => q.wave === latestWave() && T > q.frozenTo && ((P0.fz.includes(q.id) && !(md[q.wave] && md[q.wave].has(q.id))) || (/^[NS][34]/.test(q.id) && !(md[q.wave] && md[q.wave].has(q.id[1] === '3' ? '3s' : '4s'))));   // the mage is about to freeze it
    const SPLAT = 21, inPile = (q) => toFreeze(q) || /^[NS][34]/.test(q.id) || (q.rushed && !clumpDone(q)) || live.some((r) => r !== q && /^[NS][34]/.test(r.id) && inArea(r, q));   // an ice-rushed S2 is on its way into the 4s clump
    const T = curT + ahead, DW = globalThis.__DW || {}, w = (q) => (inPile(q) ? (T > q.frozenTo && /^[NS][34]/.test(q.id) ? (q.wave !== latestWave() ? (DW.walk ?? 3) : (DW.walk4 ?? 0.3)) : (DW.pile ?? 0.3)) : T > q.frozenTo ? (DW.walk ?? 3) : q.id === 'S2' ? (DW.s2 ?? 1.2) : (DW.froz ?? 0.3));   // fitted to the team's calls on 40 layouts   // walking in on its own: about to leak; a frozen S2 (no cleave) 2; another frozen 1 / 2 1
    const near = ([x, y], q) => Math.abs(q.x - x) <= 5 && Math.abs(q.y + 1 - y) <= 5;
    const worth = (tgt, pos) => {
      const first = tgt === 'maiden' ? SPLAT * (DW.maiden ?? 1) : w(tgt) * Math.min(tgt.hp, 2 * SPLAT);   // her: it brings the next proc (and its cleaving barrages) sooner
      const rest = live.filter((q) => q !== tgt && near(pos, q)).map((q) => w(q) * Math.min(q.hp, SPLAT) + (DW.per ?? 0)).sort((u, v) => v - u).slice(0, DINHS.maxHits - 1);   // per: a bit for every crab it reaches (as many crabs as possible)
      const n = 1 + live.filter((q) => q !== tgt && near(pos, q)).length;   // crabs (and her) it reaches
      return first + rest.reduce((u, v) => u + v, 0) + (DW.count ?? 0) * Math.min(n, DINHS.maxHits);
    };
    const SIDES = { north: (c) => [[c.x, c.y - 1], [c.x + 1, c.y - 1]], south: (c) => [[c.x, c.y + 2], [c.x + 1, c.y + 2]], west: (c) => [[c.x - 1, c.y], [c.x - 1, c.y + 1]], east: (c) => [[c.x + 2, c.y], [c.x + 2, c.y + 1]] };
    const tiles = (sd) => (sd === 'west' || sd === 'east' ? ['north tile', 'south tile'] : ['west tile', 'east tile']);
    // per target: the tile that reaches the most crabs (then the most value); then the target worth the most
    const under = ([x, y]) => live.some((q) => x >= q.x && x <= q.x + 1 && y >= q.y && y <= q.y + 1);   // not standing under a crab
    const SIDES_OF = (c) => (c.id === 'S2' ? ['west'] : c.id === 'S1' ? ['north', 'west'] : Object.keys(SIDES));   // an S2 from its west, an S1 from its north / west
    const walking = live.filter((q) => /^[NS][12]$/.test(q.id) && T > q.frozenTo && !inPile(q) && reachOf(q, T) <= T + ((globalThis.__DW || {}).reach ?? 4) && q.hp <= ((globalThis.__DW || {}).tierhp ?? 2 * SPLAT));   // about to reach her, and the double hit can finish it
    const pool = live.filter((q) => /^[NS][123]$/.test(q.id)).filter((q) => !(q.rushed && !clumpDone(q)));   // never the ice-rushed crab before the 4s barrage re-freezes it
    const opts = [];
    for (const c of pool) { let o = null; for (const sd of SIDES_OF(c)) SIDES[sd](c).forEach((pos, k) => {
      if (blocked(...pos) || under(pos)) return; const n = live.filter((q) => near(pos, q)).length, sc = worth(c, pos) + (c.wave === latestWave() ? 0.5 : 0);
      if (!o || n > o.n || (n === o.n && sc > o.sc)) o = { key: c.key, pos, n, sc, side: `${sd} side, ${tiles(sd)[k]} (${pos.join(',')})` }; }); if (o) opts.push(o); }
    { let o = null; for (let y = MT.y; y <= my1; y++) { const pos = [mx1 + 1, y]; if (blocked(...pos) || under(pos)) continue;   // her: from her east side
      const n = live.filter((q) => near(pos, q)).length, sc = worth('maiden', pos); if (!o || n > o.n || (n === o.n && sc > o.sc)) o = { key: 'maiden', pos, n, sc, side: `her east side (${pos.join(',')})` }; } if (o) opts.push(o); }
    const maxN = Math.max(0, ...opts.map((o) => o.n)), near1 = opts.filter((o) => o.n >= maxN - ((globalThis.__DW || {}).nslack ?? 1));   // reach first: within a crab of the most it can reach
    let best = null, bs = -1; for (const o of near1) if (o.sc > bs) { bs = o.sc; best = o; }
    if (best) best.value = bs;
    return best;
  };
  const finzPick = (p, t, X, dflt0) => {
    const dflt = dflt0 === 'scythe' ? dpsSwing(p, t) : dflt0;
    if (p.finDone) return dflt;
    const D = deadline(t), del = delayOf('zcbs', false, p.tbowFrom);
    if (!(p.spec >= 75 || (AUTOSURGE && !p.surged && p.spec + SURGE >= 75))) return dflt;   // no spec for it: no ZCB
    if (D != null && t + del <= D && t + 5 + del > D) { p.finDone = true; return 'zcbs'; }
    if (X != null && hp * 100 <= MAX * X) { p.finDone = true; L.on && L(`t${t} ${p.name}: Maiden at ${(hp * 100 / MAX).toFixed(1)}% (≤ ${X}%) - the ZCB spec (skip)`); return 'zcbs'; }
    return dflt;
  };
  /** The player's next attack: their list in turn (the last repeats), skipping what they can't do. */
  const nextAct = (p, t) => {
    if (p.force) { const f = p.force; p.force = null; if (p.step < p.seq.length - 1) p.step++; return f; }   // a preload: takes this slot
    for (;;) {
      const last = p.step >= p.seq.length - 1;
      let a = p.seq[Math.min(p.step, p.seq.length - 1)];
      if (a === 'surge') {                               // their surge line: +25% now (once a raid), then on to the next line
        if (!p.surged && p.spec < 100) { p.spec = Math.min(100, p.spec + SURGE); p.surged = true; L.on && L(`t${t} ${p.name} drinks a surge potion (${p.spec}%)`); }
        if (!last) { p.step++; continue; }
        return own(p, 'Scythe of vitur') && p.dps != null ? 'scythe' : 'tbr';
      }
      // a Dinh's later on their list: earlier than listed when it's clearly worth more now (or it can't wait)
      if (trio && phase === 30 && !p.dinDone && (a === 'scythe' || a === 'qscy' || a === 'tdps') && p.seq.slice(p.step + 1).some((x) => x === 'tdin' || x === 'dinhs') && own(p, "Dinh's bulwark") && p.spec >= DINHS.specCost) {
        const now = dinPick(0), later = dinPick(5), late = proc != null && t + 5 > proc + 44;
        if (now && now.n >= 4 && (late || !later || now.value > later.value * 1.25)) { p.dinDone = true; p.dinPos = now.pos; ovr(`${p.name}: Dinh's earlier than listed`); L.on && L(`t${t} ${p.name}: Dinh's earlier than listed - on ${now.key === 'maiden' ? 'Maiden' : now.key}, from ${now.side}`); if (!last) p.step++; return `dinhs:${now.key}`; }
      }
      // a freezer's 30s 3s / 4s barrage: skipped for a scythe / halberd on her when that likely kills her first
      if (st.proc30 != null && latestWave() === 30 && isFreeze(a) && /^[34]s/.test(String(crabOf(a))) && !globalThis.__NOKILL && (own(p, 'Scythe of vitur') || canHalb(p))) {
        const id = String(crabOf(a)).slice(0, 2), cl = crabs.filter((c) => c.wave === 30 && c.alive && c.leaked == null && t > c.frozenTo && c.id.replace(/[ab]$/, '').endsWith(id[0])), heal = cl.length ? Math.min(...cl.map((c) => reachOf(c, t))) + 1 : Infinity;
        // her chance of dying by the tick those crabs would heal her (a hit landing that tick still counts), the freezer on her
        // from now: a halberd then scythes, or scythes - with what's in flight and everyone else's swings until then
        const by = Number.isFinite(heal) ? heal : t + 1, mineOf = (first) => { let mv = first === 'challyf' ? halbOf(p) : scyOf(p); if (own(p, 'Scythe of vitur')) for (let f = t + (first === 'challyf' ? 7 : 5); f + 1 <= by; f += 5) mv = sumMV(mv, scyOf(p)); return mv; };
        const opt = [canHalb(p) ? 'challyf' : null, own(p, 'Scythe of vitur') ? 'scythe' : null].filter(Boolean).map((k) => [k, killP(p, t, by, mineOf(k))]).sort((x, y) => y[1] - x[1])[0];
        const forced = globalThis.__SKIPONLY ? (globalThis.__SKIPONLY === id ? 'always' : 'never') : globalThis.__SKIP34;   // (testing) 'always' / 'never'
        if (!(st.at34 ||= []).some((x) => x.id === id)) st.at34.push({ id, t, pct: hp * 100 / MAX, p: opt ? opt[1] : 0 });
        if (opt && t + 1 < heal && (forced === 'always' || (forced !== 'never' && opt[1] >= KILL.skip))) {
          ovr(`${p.name}: skipped the 30s ${id} for the kill`); L.on && L(`t${t} ${p.name}: skips the ${id} barrage - ${opt[0] === 'challyf' ? 'halberd' : 'scythe'} on her likely kills her first (${Math.round(opt[1] * 100)}%, at ${(hp * 100 / MAX).toFixed(1)}%)`);
          (st.skip34 ||= []).push({ id, t, pct: hp * 100 / MAX, p: opt[1] });
          if (opt[0] === 'challyf') p.finDone = true; if (!last) p.step++; return opt[0];
        }
      }
      if (trio) {
        const raw = a; a = procLine(p, a);
        // a 4s freezer with a freeze still owed this wave (the clumps split to them) on a line that isn't a freeze: it goes first
        if (quad && p.fside && raw === a && !isFreeze(raw) && raw !== 'zcbs' && !p.seq.slice(p.step).some(isFreeze)) { const w = latestWave(), Q = w != null && quadPlans[w];
          if (Q && Q[p.fside].some((it, k) => it !== 'fill' && !(p.qI && p.qI[w] && p.qI[w].has(k)))) { const r = qfzPick(p, t); if (r) return r; } }
      }
      if (trio && a === 'tdin' && p.dinDone) { if (!last) { p.step++; continue; } return quad ? qStrag(p, t) || 'scythe' : dpsSwing(p, t); }   // went early
      if (trio && a === 'tpile') { const id = phase === 0 ? 'old' : 'pile'; return !globalThis.__X && pileWorth(t, true, id).v * 2 >= 45 ? `ibs:${id}` : phase === 0 ? 'scythe' : 'tbr'; }   // after the 30s: the older piles only (the 30s crabs are never touched), else her   // the slot stays
      if (quad && a === 'qfz') {
        const r = qfzPick(p, t);
        if (r === 'wait' || r === 'tbr' || r === 'ibs:old' || r === 'ib:old') return r;   // holding / a filler: the list slot stays
        if (!r) { if (!last) { p.step++; continue; } return 'tbr'; }
        a = r;
      }
      if (quad && a === 'qs1') { const c = [70, 50].map((w) => crabs.find((q) => q.id === 'S1' && q.wave === w && q.alive && q.leaked == null)).find(Boolean); a = c ? `scyk:${c.key}` : 'scythe'; }   // the S1 (the 70s one first) before the chins, else her
      if (quad && a === 'qscy') a = qStrag(p, t) || 'scythe';
      if (quad && a === 'qchin') {
        const w = latestWave(); p.qch ||= {};
        if (!p.qch[w]) { const c = barragePrim('pile', t), z = c ? aoe3(c, CHIN.maxTargets).filter((q) => q.alive && q.leaked == null) : []; const n = !c ? 0 : z.length >= 4 && z.reduce((u, q) => u + q.hp, 0) >= 150 ? 5 : 3;
          p.qch[w] = { n, k: 0 }; L.on && L(`t${t} ${p.name}: ${n ? `${n} chins at the clump (${z.length} crabs, ${z.reduce((u, q) => u + q.hp, 0)} HP)` : 'no clump to chin'}`); }
        const Q = p.qch[w];
        if (Q.k >= Q.n || !barragePrim('pile', t)) { if (!last) { p.step++; continue; } a = 'scythe'; }
        else { Q.k++; return Q.n === 3 && Q.k === 1 ? 'chinpa' : 'chinp'; }   // the line stays until its chins are thrown
      }
      if (trio && a === 'qfin') { a = !p.qfinDone && p.spec >= 30 && own(p, 'Crystal halberd') && hp * 100 <= MAX * (globalThis.__QFIN ?? 4) ? (p.qfinDone = true, 'challyf') : (quad ? qStrag(p, t) : null) || 'scythe'; }   // the halberd kept for the last hit (her at 4% or under)
      if (quad && a === 'qspec') { a = !p.noZcb30 && (p.spec >= 75 || (AUTOSURGE && !p.surged && p.spec + SURGE >= 75)) ? 'zcbs' : !p.noClaw && p.spec >= 50 && own(p, 'Dragon claws') ? 'claws' : null; if (!a) { if (!last) { p.step++; continue; } a = 'scythe'; } }
      if (trio && (a === 'tfz' || a === 'tdps' || /^tclean:/.test(String(a)))) {
        const r = a === 'tfz' ? tfzPick(p, t) : a === 'tdps' ? tdpsPick(p, t) : tcleanPick(a);
        if (r === 'wait' || r === 'tbr' || r === 'ibs:old' || /^aya:/.test(String(r))) return r;   // holding / a filler: the list slot stays
        if (!r) { if (!last) { p.step++; continue; } return own(p, 'Scythe of vitur') && atkOf(a).style === 'melee' ? 'scythe' : 'tbr'; }
        a = r;
      }
      if (trio && a === 'tdin2') {
        if (!p.dinDone) a = 'tdin';
        else {
          const pk = !p.din2Done && (p.spec >= DINHS.specCost || (AUTOSURGE && !p.surged && p.spec + SURGE >= DINHS.specCost)) ? dinPick(0, new Set(crabs.filter((c) => hits.some((h) => h.t >= t && h.parts && h.parts.some((x) => x.c === c))).map((c) => c.key))) : null;
          if (pk && pk.n >= (globalThis.__D2N ?? 4)) { p.din2Done = true; p.dinPos = pk.pos; L.on && L(`t${t} ${p.name}: a second Dinh's (reaches ${pk.n})`); a = `dinhs:${pk.key}`; }
          else return dpsSwing(p, t);
        }
      }
      if (quad && a === 'tdin' && !p.dinDone && (globalThis.__N1FIRST ?? true)) {   // 4s: an N1 walking in over the line (the stacked 70s / 50s N1s) - scythe it first, the Dinh's a swing later
        const q = qStrag({ ...p, side: 'N1' }, t);
        if (q && !(proc != null && t + 5 > proc + 44)) { L.on && L(`t${t} ${p.name} scythes the N1 first (the Dinh's after)`); const c = crabRef(q.split(':')[1]); if (c) c.scyBy ??= p.i; return q; }
      }
      if (trio && a === 'tdin') {
        const split = st.proc50 != null && proc != null ? st.proc50 - proc : 25, N = Math.max(1, Math.min(4, Math.floor((43 - split) / 5))), late = proc != null && t + 5 > proc + 44;   // as many scythes as fit before the latest Dinh's (27s after the 70s): 12s 4, 15s 3, 18-19.2s 2, 21s 1
        const thaw = crabs.find((c) => c.wave === 70 && c.alive && c.leaked == null && st.frozen[c.key] && t > c.frozenTo);   // a 70s crab walking in again: Dinh's it as it comes
        if ((globalThis.__DW || {}).vt !== 0) {          // value-timed (the team: another scythe first whenever the Dinh's still gets its splash a swing later): the Dinh's goes when a swing later would be worth less (crabs that reach her by then are lost to it)
          if ((p.sw50 || 0) < 1) { p.sw50 = 1; p.dinHeld = (p.dinHeld || 0) + 1; return dpsSwing(p, t); }   // the earliest: after a scythe
          var strag, snap = { cr: crabs.map((c) => [c, c.scyBy, c.claim]), dd: p.dpsD ? Object.fromEntries(Object.entries(p.dpsD).map(([k, v]) => [k, new Set(v)])) : undefined }; const sw0 = dpsSwing(p, t); var swK = /^sc[a-z]+:/.test(sw0) ? sw0.split(':')[1] : null;   // a look at their swing: undone if the Dinh's goes instead (a straggler it 'took' is the other DPS's again)
          strag = new Set([...(/^sc[a-z]+:/.test(sw0) ? [sw0.split(':')[1]] : []), ...crabs.filter((c) => hits.some((h) => h.t >= t && h.parts && h.parts.some((x) => x.c === c))).map((c) => c.key), ...planOf(latestWave(), t).left.map((id) => `${id}@${latestWave()}`)]); const now = dinPick(0, strag), later = dinPick(5, strag), cap = t + 5 > st.proc50 + 30;   // stragglers being scythed (this swing, or a teammate's in flight): compare without them
          if (globalThis.__dinV) globalThis.__dinV.push({ t, now: now && [now.key, Math.round(now.value)], later: later && [later.key, Math.round(later.value)], skip: [...strag] });
          if (!cap && now && later && later.value >= now.value * 0.97) { L.on && L(`t${t} ${p.name} holds the Dinh's (worth ${Math.round(later.value)} a swing later vs ${Math.round(now.value)} now)`); p.sw50 = (p.sw50 || 0) + 1; p.dinHeld = (p.dinHeld || 0) + 1; return sw0; }
          for (const [c, sb, cl] of snap.cr) { c.scyBy = sb; c.claim = cl; } p.dpsD = snap.dd;
        } else
        if (((p.sw50 || 0) < N && !late && !(thaw && (p.sw50 || 0) >= ((globalThis.__DW || {}).thawAfter ?? 2))) || (p.sw50 || 0) < 1) { p.sw50 = (p.sw50 || 0) + 1; return dpsSwing(p, t); }
        if ((globalThis.__DW || {}).vt === 0 && !(globalThis.__DW || {}).nowait && (p.dinWait || 0) < 2 && !crabs.some((c) => c.alive && c.leaked == null && reachOf(c, t) <= t + 6)) {   // nothing reaches her before the next swing: a swing later if the Dinh's is worth more then (more in the clump)
          const now = dinPick(), later = dinPick(5);
          if (now && later && later.value > now.value * 1.1) { p.dinWait = (p.dinWait || 0) + 1; L.on && L(`t${t} ${p.name} holds the Dinh's a swing (worth ${Math.round(later.value)} next swing vs ${Math.round(now.value)} now; nothing reaches her before then)`); p.sw50 = (p.sw50 || 0) + 1; return dpsSwing(p, t); }
        }
        if (typeof strag !== 'undefined' && strag && swK) strag.delete(swK);   // the Dinh's goes instead of that scythe: its crab is fair game for the splash
        if (p.dinHeld) ovr(`${p.name}: Dinh's ${p.dinHeld} swing${p.dinHeld > 1 ? 's' : ''} later than listed`);
        const tg = dinPick(0, typeof strag !== 'undefined' ? strag : null); p.dinDone = true; p.dinPos = tg ? tg.pos : null; a = tg ? `dinhs:${tg.key}` : 'scythe';
        if (tg) L.on && L(`t${t} ${p.name}: Dinh's after ${p.sw50 || 0} scythe(s) (${(split * 0.6).toFixed(1)}s split: up to ${N}${late && (p.sw50 || 0) < N ? '; the latest it can go' : ''}) - on ${tg.key === 'maiden' ? 'Maiden' : tg.key}, from ${tg.side}`);
      }
      if (trio && (a === 'finz' || /^finz:/.test(String(a)))) { const t3 = String(a).split(':')[1]; a = finzPick(p, t, t3 == null || t3 === '' ? null : Number(t3), own(p, 'Scythe of vitur') && p.dps != null ? 'scythe' : 'tbr'); }
      if (a === 'fin' || /^fin:/.test(String(a))) { const t3 = String(a).split(':')[1]; a = finPick(p, t, t3 == null || t3 === '' ? null : Number(t3)); }   // 'fin:12': the halberd early once she's at or under 12%
      if (/^s1if:/.test(String(a))) { const X = Number(String(a).split(':')[1]), s1 = crabRef('S1@70'); a = hp * 100 < MAX * X && s1 && s1.alive ? 'scyk:S1@70' : 'scythe'; if (a !== 'scythe') L.on && L(`t${t} ${p.name}: Maiden under ${X}% - the 70s S1 once`); }   // 's1if:62': the 70s S1 if she's under 62%, else her
      if (String(a).includes('|')) { const [m, alt] = String(a).split('|'); a = invalid(p, m) ? alt : m; if (a === alt) L.on && L(`t${t} ${p.name}: ${hitLabel(m)} not needed - ${hitLabel(alt)} instead`); }   // 'x|y': y when x can't go
      if (a === 'lose' && last) { if (p.lostLast) a = p.seq.slice(0, -1).filter((x) => x !== 'lose').pop() || 'tbr'; else p.lostLast = true; }   // a last "Lose 1 tick" doesn't repeat
      const A = atkOf(a), why = invalid(p, a, t);
      const has = isFreeze(a) ? p.spells.ancients : !A.weapon || own(p, A.weapon), energy = !A.spec || p.spec >= A.spec || (AUTOSURGE && !p.surged && p.spec + SURGE >= A.spec);
      if (has && energy && !why) {
        if (A.spec && p.spec < A.spec) { p.spec = Math.min(100, p.spec + SURGE); p.surged = true; L.on && L(`t${t} ${p.name} drinks a surge potion (${p.spec}%)`); }
        if (!last) p.step++;
        if (trio && st.proc50 != null && !p.dinDone && A.style === 'melee' && /^(scythe|scyk|scyc)/.test(String(a))) p.sw50 = (p.sw50 || 0) + 1;   // scythes since the 50s (before the Dinh's)
        return a;
      }
      if (trio && has && !energy && !why) { const fb = specFallback(p, a, t);
        if (fb) { ovr(`${p.name}: ${fb === 'claws' ? 'claws' : "a Dinh's"} instead of the ZCB (not enough spec)`); L.on && L(`t${t} ${p.name}: not enough spec for the ZCB (${p.spec}%) - ${fb === 'claws' ? 'claws on her' : "a Dinh's"} instead`); if (!last) p.step++; return fb; } }
      if (!last || why) { st.skipped.push({ i: p.i, a }); L.on && L(`t${t} ${p.name} skips ${hitLabel(a)} (${why || (!has ? (isFreeze(a) ? 'Ancients off' : 'no weapon') : 'not enough spec')})`); if (!last) { p.step++; continue; } return A.style === 'melee' && own(p, 'Scythe of vitur') ? 'scythe' : 'tbr'; }
      return A.style === 'melee' && own(p, 'Scythe of vitur') ? 'scythe' : 'tbr';   // the last one, and they can't: scythe / rapid tbow
    }
  };
  // ---- the crabs (from the 70s proc when the run goes on to the 50s)
  const crabs = [], heals = [];                        // crab: {id, x, y (NW tile), hp, frozenTo, immuneTo, alive, leaked}
  const MT = MAIDEN_TILE, mx1 = MT.x + MT.size - 1, my1 = MT.y + MT.size - 1, SWROW = MT.y + MT.size - 1;
  const adjacent = (c) => { const gx = Math.max(MT.x - (c.x + 1), c.x - mx1, 0), gy = Math.max(MT.y - (c.y + 1), c.y - my1, 0); return Math.max(gx, gy) <= 1 && !(gx === 1 && gy === 1); };
  const spawn = (t, wave) => {
    let ids = Object.keys(SPAWNS).filter((id) => !(skip || []).includes(id));
    if (spawnN && spawnN < ids.length) { const pool = ids.slice(), pick = []; while (pick.length < spawnN) pick.push(pool.splice(rng.randint(0, pool.length - 1), 1)[0]); ids = ids.filter((id) => pick.includes(id)); }   // random spawns (scales under 5)
    for (const id of ids) { const [x, y] = SPAWNS[id]; crabs.push({ id, wave, key: `${id}@${wave}`, x, y, hp: CRAB_HP[team] || 100, frozenTo: -1, immuneTo: -1, alive: true, born: t, entered: t, idx: rng.randint(0, 32767) }); }
    L.on && L(`t${t} ${ids.length} crabs spawn: ${ids.join(' ')}`);
  };
  const moveCrabs = (t) => {
    for (const c of crabs) {
      if (!c.alive || t <= c.born + crabDelay || t <= c.frozenTo) continue;
      const sw = c.y + 1;
      const ck = chunkOf(c.x, c.y + 1);
      c.x -= 1;
      if (path === 'overlap') { if (c.y + 1 < MT.y) c.y += 1; else if (c.y > my1) c.y -= 1; }   // until its rows overlap hers
      else if (sw < SWROW) c.y += 1; else if (sw > SWROW) c.y -= 1;
      if (chunkOf(c.x, c.y + 1) !== ck) c.entered = t;
      if (adjacent(c)) { c.alive = false; c.leaked = t; st.leaks++; heals.push({ t: t + 1, amt: 2 * c.hp, id: c.id, key: c.key }); L.on && L(`t${t} ${c.id} leaks (${c.hp} HP left)`); if (trace) trace.push({ t, boss: 'Leak', kind: 'attack', tip: `${c.id} leaks - she heals ${2 * c.hp} next tick`, short: c.id }); }
    }
  };
  /** A crab by its list name: 'N2@70' that wave's, 'N2' the latest wave's. */
  const crabRef = (ref) => (String(ref).includes('@') ? crabs.find((c) => c.key === ref) : crabs.filter((c) => c.id === ref).pop());
  const latestWave = () => (crabs.length ? crabs[crabs.length - 1].wave : null);
  const inArea = (a, b) => (aoeBox || aoe === 'box' ? Math.max(a.x - (b.x + 1), b.x - (a.x + 1)) <= 1 && Math.max(a.y - (b.y + 1), b.y - (a.y + 1)) <= 1
    : aoe === 'fp' ? b.x <= a.x + 1 && b.x + 1 >= a.x - 1 && b.y <= a.y + 2 && b.y + 1 >= a.y   // b's 2x2 (NW b.x, b.y) touches the 3x3 around a's SW tile (a.x, a.y + 1)
    : Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);   // aoeBox (testing): any tile of b within 1 of a's 2x2   // b's SW tile in the 3x3 around a's
  /** The clump's primary (chinchompas; the S2 freeze from the 50s on; N4): the crab of `pool` (this wave, alive) whose 3x3
   *  holds the most of this wave - one that also holds S2 first when `withS2`. */
  const clumpPrim = (pool, withS2) => {
    const w = latestWave(), s2 = crabRef('S2');
    let best = null, bs = -1;
    for (const c of pool.map(crabRef).filter((c) => c && c.alive && c.wave === w)) {
      const n = crabs.filter((q) => q.alive && q.wave === w && inArea(c, q)).length + (withS2 && s2 && s2.alive && s2.wave === w && inArea(c, s2) ? 100 : 0);
      if (n > bs) { bs = n; best = c; }
    }
    return withS2 && bs < 100 ? null : best;
  };
  const CLUMP = ['S3', 'S4a', 'S4b', 'N4a', 'N4b'], FOURS = ['N4a', 'N4b', 'S4a', 'S4b'];
  /** A barrage's / chinchompa's targets: the primary, then the others whose SW tile is in the 3x3 around its SW tile, by
   *  chunk order around it (the NPC that entered its chunk last first, then the lowest index) - up to the cap. */
  const aoe3 = (prim, cap) => [prim, ...crabs.filter((c) => c !== prim && c.alive && inArea(prim, c))
    .map((c) => ({ c, o: chunkOrder(prim.x, prim.y + 1, c.x, c.y + 1) })).sort((u, v) => u.o - v.o || v.c.entered - u.c.entered || u.c.idx - v.c.idx).map((x) => x.c)].slice(0, cap);
  /** A barrage's primary: S2 from the 50s on through a clumped 3 / 4 (so S2 is caught in the clump), N4 the 4 that
   *  catches the most 4s; else the crab itself (this wave). */
  const barragePrim = (id, t = 0) => {
    if (id === 'old' || id === 'pile') {               // the older waves' pile ('pile': any wave's): the crab whose 3x3 holds the most HP (crabs it can freeze again first)
      const w = latestWave(); let best = null, bs = -1;
      for (const c of crabs.filter((q) => q.alive && q.leaked == null && (id === 'pile' || q.wave !== w))) { const n = aoe3(c, BARRAGE.cap), sc = n.filter((q) => t > q.immuneTo && t > q.frozenTo).length * 30 + n.reduce((u, q) => u + q.hp, 0); if (sc > bs) { bs = sc; best = c; } }
      return best;
    }
    if (id === '3s' || id === '4s' || id === 'cl') {   // the 3 / 4 (this wave) whose 3x3 holds the most crabs it can freeze now (any wave), then the most crabs ('cl': any 3 or 4)
      const w = latestWave(); let best = null, bs = -1;
      for (const c of (id === '3s' ? ['N3', 'S3'] : id === 'cl' ? ['N3', 'S3', ...FOURS] : FOURS).map(crabRef).filter((c) => c && c.alive && c.wave === w)) {
        const n = aoe3(c, BARRAGE.cap), sc = n.filter((q) => t > q.immuneTo && t > q.frozenTo).length * 100 + (id === 'cl' ? 60 - Math.min(60, reachOf(c, t) - t) : n.length);   // 'cl': then the one reaching her soonest
        if (sc > bs) { bs = sc; best = c; }
      }
      return best;
    }
    if (id === 'S2' && latestWave() !== 70 && !plain) return clumpPrim(CLUMP, true) || crabRef('S2');
    if (id === 'N4') return clumpPrim(['N4a', 'N4b', 'S4a', 'S4b'], false) || crabRef('N4a');
    return crabRef(id4(id));
  };
  /** A 4 that didn't spawn this wave (scales under 5, or a test): the same side's other 4, then the other side's. */
  const id4 = (id) => {
    if (!/^[NS]4[ab]$/.test(id)) return id;
    const w = latestWave(), here = (x) => crabs.some((c) => c.id === x && c.wave === w);
    if (w == null || here(id)) return id;
    const o = id[0] === 'N' ? 'S' : 'N', alt = [`${id[0]}4${id[2] === 'a' ? 'b' : 'a'}`, `${o}4a`, `${o}4b`].find(here);
    return alt || id;
  };
  /** Why a list hit can't go now (skipped, no tick lost), or null. */
  const invalid = (p, a, t = 0) => {
    const k = String(a).split(':')[0], ref = crabOf(a);
    if (trio && isFreeze(a)) {                         // trio: a freeze with nothing to freeze is skipped (no tick lost)
      const grp = ref === '3s' || ref === '4s' || ref === 'cl' || ref === 'old' || ref === 'pile', c = grp ? barragePrim(ref, t) : crabRef(id4(ref));
      if (!c || !c.alive) return `${ref} gone`;
      if (grp && ref !== 'old' && ref !== 'pile' && !aoe3(c, BARRAGE.cap).some((q) => t > q.immuneTo && t > q.frozenTo)) return 'nothing to freeze';
    }
    if (k === 'dinhs' && ref === 'maiden') return null;
    if (k === 'dinhs' || k === 'scyc' || k === 'scyk' || k === 'scys' || k === 'clawc' || (k === 'chally' && ref)) { const c = crabRef(ref); if (!c || (!c.alive && !boom(c, t))) return `${ref} gone`; const t3 = String(a).split(':')[2], thr = t3 == null || t3 === '' ? 20 : Number(t3); if (k === 'scyc' && c.hp <= thr - (thr === 20 ? 1 : 0)) return `${ref} ${thr === 20 ? 'under 20' : `${thr} or under`} HP`; }   // 'scyc:S1@70' - while it's on 20+; 'scyc:S1@70:25' - only while over 25
    if (k === 'chin' && !clumpPrim(CLUMP, false)) return 'no clump';
    if (k === 'chin4' && !clumpPrim(FOURS, false)) return 'no 4s';
    if (k === 'zcbx' && p.greedyDone) return 'greedy ZCB already went';
    if (k === 'scyf') { const pr = [proc, st.proc50, st.proc30].filter((x) => x != null); if (pr.length >= 2 && pr[pr.length - 1] - pr[pr.length - 2] > 20) return 'slow proc'; }
    return null;
  };
  const casters = ps.filter((p) => p.seq70.some((a) => atkOf(a).crab));
  const spotOf = (p) => CASTER_SPOTS[Math.max(0, casters.indexOf(p)) % CASTER_SPOTS.length];
  const distTo = (p, c) => { const [px, py] = spotOf(p); return Math.max(Math.max(c.x - px, px - (c.x + 1), 0), Math.max(c.y - py, py - (c.y + 1), 0)); };
  /** An Ice barrage cast: the targets (every crab whose SW tile is in the 3x3 around the target's SW tile, up to the cap)
   *  and the freeze go the moment it's cast (queued); the damage waits for it to land. -> the targets, or null (gone). */
  const fzOf = (p, k) => { const F = FSPELL[k]; return ((p.fz ||= {})[k] ||= barrageOf(p.gear, F.w, F.base)); };
  const barrageCast = (t, p, id, k = 'ib') => {
    const prim = barragePrim(id, t), F = FSPELL[k];
    if (!prim || !prim.alive) return null;
    const list = F.aoe ? aoe3(prim, BARRAGE.cap) : [prim];
    const froze = [];
    const B = fzOf(p, k), sureF = sure || B.roll >= freezeSure(99);
    for (const c of list) if (t > c.immuneTo && t > c.frozenTo && (sureF || rng.random() < hit_chance(B.roll, (CRAB.magic + 9) * 64))) { c.frozenTo = t + FREEZE[F.spell][F.sc]; c.immuneTo = c.frozenTo + FREEZE_IMMUNE; st.frozen[c.key] = (st.frozen[c.key] || 0) + 1; froze.push(c.wave === 70 || !crabs.some((q) => q.wave === 50) ? c.id : c.key); }
    L.on && L(`t${t} ${p.name} ${F.name} on ${id}${prim.id !== id ? ` (through ${prim.id})` : ''}: freezes ${froze.length ? froze.join(', ') : 'none (frozen / immune)'}${list.length > froze.length ? ` · also hits ${list.filter((c) => !froze.includes(c.id)).map((c) => c.id).join(', ')}` : ''}`);
    return list;
  };
  const barrageLands = (t, h) => {
    const parts = [];
    for (const c of h.targets) {
      if (!c.alive) { parts.push(`${c.id} gone`); continue; }
      const B = fzOf(h.p, h.k || 'ib'), ok = sure || rng.random() < hit_chance(B.roll, (CRAB.magic + 9) * 64), d = ok ? rng.randint(0, B.max) : 0;
      c.hp -= d; if (c.hp <= 0) { c.alive = false; c.died = t; }
      parts.push(`${c.id} ${d}${c.alive ? '' : ' (dies)'}`);
    }
    const nm = FSPELL[h.k || 'ib'].name;
    L.on && L(`t${t} ${h.p.name} ${nm} on ${h.crab} lands: ${parts.join(', ')}`);
    if (h.tr) Object.assign(h.tr, { dmg: parts.reduce((u, x) => u + (Number(String(x).split(' ')[1]) || 0), 0), crab: true, what: `${nm} → ${h.crab} (froze ${h.froze || 'none'}): ${parts.join(', ')}`, landed: t });
  };
  /** The scythe's arc (the community's best theory): 1x3 tiles across the line from the player to the primary's centre -
   *  $center (the tile in front of them), $left, $right. The primary takes the first hit (100%); then up to two more (50%,
   *  25%): an NPC on $center other than the primary, then one on $left, then one on $right (the primary counts there - a
   *  2x2 takes two); Maiden counts as an NPC on her tiles. Line of sight from $center: open floor here. */
  const scytheArc = (p, prim, [px, py]) => {
    const cx = prim.x, cy = prim.y + 1, dx = Math.sign(cx - px), dy = Math.sign(cy - py);   // its 'centre': the SW tile (gives jaggers_0's Maiden split: from the north she's on $right, from the south on $left)
    const C = [px + dx, py + dy], diag = dx !== 0 && dy !== 0;
    const Lt = diag ? [px + dx, py] : [C[0] + dy, C[1] - dx], Rt = diag ? [px, py + dy] : [C[0] - dy, C[1] + dx];   // y south: facing (dx, dy), left is (dy, -dx)
    const on = (q, [x, y]) => x >= q.x && x <= q.x + 1 && y >= q.y && y <= q.y + 1, onHer = ([x, y]) => x >= MT.x && x <= mx1 && y >= MT.y && y <= my1;
    const at = (tile, notPrim) => { const c = crabs.find((q) => (q.alive || q === prim) && q !== (notPrim ? prim : null) && on(q, tile) && (!notPrim || q !== prim)); return c ? { c } : onHer(tile) ? { maiden: true } : null; };
    const [ch, mx] = melee(p, 'Scythe of vitur', 1, CRAB.def), [chM, mxM] = melee(p, 'Scythe of vitur', 1, def);
    const tg = [{ c: prim }];
    for (const [tile, notPrim] of [[C, true], [Lt, false], [Rt, false]]) { if (tg.length >= 3) break; const x = at(tile, notPrim); if (x) tg.push(x); }
    const parts = tg.map((x, k) => { const m = [1, 2, 4][k], d = x.maiden ? roll(rng, chM, Math.floor(mxM / m)) : roll(rng, ch, Math.floor(mx / m)); return x.maiden ? { maiden: true, d } : { c: x.c, d }; });
    return { parts, text: parts.map((x) => `${x.maiden ? 'Maiden' : x.c === prim ? '' : x.c.key + ' '}${x.d}`).join('/') };
  };
  /** Dinh's spec / a chinchompa / a scythe on a crab: targets and rolls as it goes, the damage when it lands. */
  /** (ignore30) a hit meant for a crab goes on her instead: scythes and claw / halberd specs on her, chinchompas a
   *  scythe (else a tbow); freezes, barrages on a pile and Dinh's (her and the crabs by her) stay as they are. */
  const IGN = new Set((ignoreCrabs || []).map((x) => String(x).replace(/[ab]@/, '@')));   // crabs she has to die before (the fail conditions): nobody leaves her for one
  const ignored = (c) => !!c && IGN.has(c.key.replace(/[ab]@/, '@'));
  const offCrabs = (p, a) => {
    const k = String(a).split(':')[0], c = crabOf(a);
    if (!(ignore30 && st.proc30 != null)) { const q = c && !/^(pile|old|maiden|3s|4s)$/.test(c) ? crabRef(String(c).split(':')[0]) : null; if (!ignored(q)) return a; }
    if (['scyc', 'scyk', 'scys', 'tclean', 'tdps', 'qscy', 'qs1'].includes(k) && (c || k !== 'scys')) return 'scythe';
    if (k === 'clawc') return 'claws';
    if (k === 'chally' && c) return 'chally';
    if (k === 'aya' && c && c !== 'maiden') return 'aya:maiden';
    if (['chin', 'chin4', 'chinp', 'chinpa', 'qchin'].includes(k)) return own(p, 'Scythe of vitur') ? 'scythe' : 'tbr';
    return a;
  };
  const crabHit = (t, p, a, k) => {
    const A = atkOf(a), tr = trace ? { t, i: p.i, code: A.code } : null;
    if (A.spec) { p.spec -= A.spec; L.on && L(`t${t} ${p.name} ${A.label} (${p.spec}% left)`); }
    let parts = [], label = A.label, pos = null, kind = k, aim = null;
    if (k === 'dinhs') {                               // 11x11 around their tile (the crab's south side, west tile): the primary, then 9 by chunk order
      const onHer = crabOf(a) === 'maiden', prim = onHer ? null : crabRef(crabOf(a)); pos = p.dinPos || (prim ? [prim.x, prim.y + 2] : [MT.x + 6, my1]); aim = onHer ? 'maiden' : prim.key; p.dinPos = null;
      const b = bonuses(worn(p.gear, 'melee', "Dinh's bulwark")), [pa, pst] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
      const roll0 = Math.floor((Math.floor(MELEE * pa) + 8 + 3) * (b.atk[2] + 64) * DINHS.specAcc);   // Pummel (accurate) +3
      const mxD = Math.floor(((Math.floor(MELEE * pst) + 8) * (b.str + dinhsStr(b.dfn[0], b.dfn[1], b.dfn[2], b.dfn[4]) + 64) + 320) / 640);
      const near = (x, y) => Math.abs(x - pos[0]) <= 5 && Math.abs(y - pos[1]) <= 5, ord = (x, y) => chunkOrder(pos[0], pos[1], x, y);
      const cands = crabs.filter((c) => c.alive && near(c.x, c.y + 1)).map((c) => ({ c, o: ord(c.x, c.y + 1), e: c.entered, i: c.idx }));
      if (near(MT.x, my1)) cands.push({ maiden: true, o: ord(MT.x, my1), e: -1, i: 0 });
      cands.sort((u, v) => u.o - v.o || v.e - u.e || u.i - v.i);
      for (const x of [onHer ? { maiden: true } : { c: prim }, ...cands.filter((y) => !(onHer && y.maiden))].slice(0, DINHS.maxHits)) {
        const ch = sure ? 1 : hit_chance(roll0, dRoll(x.maiden ? def : CRAB.def)), d = rng.random() < ch ? Math.max(1, rng.randint(0, mxD)) : 0;
        parts.push(x.maiden ? { maiden: true, d } : { c: x.c, d });
      }
      label = `Dinh's spec on ${onHer ? 'Maiden' : prim.key}`;
    } else if (k === 'chinp' || k === 'chinpa') {      // 4s range: chins at the pile (the best 3x3 by HP), one roll for all
      const prim = barragePrim('pile', t); pos = [prim.x + 5, prim.y + 1]; aim = prim.key;
      const [ch, mx] = ranged(p, 'Black chinchompa', CRAB.def), ok = rng.random() < ch;
      for (const c of aoe3(prim, CHIN.maxTargets)) parts.push({ c, d: ok ? Math.max(1, rng.randint(0, mx)) : 0 });
      label = `Chinchompa on the pile (${prim.key})${ok ? '' : ' (misses)'}`;
    } else if (k === 'chin' || k === 'chin4') {        // the clump (or the newest 4s): one roll for all; each target its own damage
      const prim = k === 'chin4' ? clumpPrim(FOURS, false) : clumpPrim(CLUMP, true) || clumpPrim(CLUMP, false); pos = [prim.x + 5, prim.y + 1]; aim = prim.key;
      const [ch, mx] = ranged(p, 'Black chinchompa', CRAB.def), ok = rng.random() < ch;
      for (const c of aoe3(prim, CHIN.maxTargets)) parts.push({ c, d: ok ? Math.max(1, rng.randint(0, mx)) : 0 });
      label = `Chinchompa on ${prim.key}${ok ? '' : ' (misses)'}`;
    } else if (k === 'scys' || k === 'scyc' || k === 'scyk') {   // a scythe on a crab: the arc (the community's theory, see the to-do)
      const prim = crabRef(crabOf(a)), side = k === 'scys' ? String(a).split(':')[2] : null; aim = prim.key;
      pos = side === 'N' ? [prim.x, prim.y - 1] : side === 'S' ? [prim.x, prim.y + 2] : [prim.x + 2, prim.y + 1];   // a leaking crab from its north / south; else from its east
      const r = scytheArc(p, prim, pos);
      parts = r.parts; label = `scythe on ${prim.key}${side ? ` from its ${side === 'N' ? 'north' : 'south'}` : ''} ${r.text}`; kind = 'scythe';
    } else if (k === 'clawc') {                        // claw spec on a crab: the four hits on it
      const prim = crabRef(crabOf(a)); pos = [prim.x + 2, prim.y + 1]; aim = prim.key;
      const [ch, mx] = melee(p, 'Dragon claws', 1, CRAB.def), r = clawRolls(sure ? 1 : ch, mx, rng);
      parts = r.map((d) => ({ c: prim, d })); label = `Claw spec on ${prim.key} ${r.join('/')}`; used('claws', r.some((d) => d > 0));
    } else if (k === 'chally') {                       // halberd spec on a crab (2x2: large): two hits, the second at 75% accuracy
      const prim = crabRef(crabOf(a)); pos = [prim.x + 2, prim.y + 1]; aim = prim.key;
      const [c1, mx] = melee(p, 'Crystal halberd', 1, CRAB.def), ch = sure ? [1, 1] : [c1, melee(p, 'Crystal halberd', 1, CRAB.def, 0.75)[0]];
      const r = ch.map((c) => (rng.random() < c ? Math.max(1, rng.randint(0, mx)) + Math.floor(mx / 10) : 0));
      parts = r.map((d) => ({ c: prim, d })); label = `Halberd spec on ${prim.key} ${r.join('/')}`;
    }
    p.lastTgt = crabRef(aim) || p.lastTgt; p.pos = pos;
    hits.push({ t: t + A.delay, p, a: 'aoe', parts, label, kind, tr });
    if (tr) { Object.assign(tr, { what: label, pos, tgt: aim }); trace.push(tr); }
    p.style = A.style; p.next = t + A.speed;
  };
  /** Could the next proc (pct) come by tick `by`? Hits in flight landing by then plus the scythes due (each melee player's
   *  next swings), at a 1 in 4 chance or more. */
  const procRisk = (t, by, pct) => {
    const due = hits.filter((h) => h.t <= by && h.exp != null);
    let mean = due.reduce((x, h) => x + h.exp, 0), v = due.reduce((x, h) => x + (h.v || 0), 0);
    for (const q of ps) {
      if (q.seq[Math.min(q.step, q.seq.length - 1)] !== 'scythe' || !own(q, 'Scythe of vitur')) continue;
      const [ch, mx] = melee(q, 'Scythe of vitur', 1, def), [sm, sv] = scytheMV(ch, mx);
      for (let f = Math.max(q.next, t); f + 1 <= by; f += 5) { mean += sm; v += sv; }
    }
    return (hp - mean - EARLY50.z * Math.sqrt(v)) * 100 < MAX * pct;
  };
  const ends = () => (to === 0 ? st.dead != null : to === 30 ? st.proc30 != null : to === 50 ? st.proc50 != null : proc != null);
  st.healedBy = [];
  const applyHeals = (t) => { for (const h of heals.filter((x) => x.t === t)) { const b = hp; hp = Math.min(MAX, hp + h.amt); st.healed += hp - b; st.healedBy.push(h.key); if (h.amt > 0 && h.key) (st.leakT ||= {})[h.key] = t; L.on && L(`t${t} she heals ${hp - b} (${h.id}) -> ${hp}`); } };
  for (let t = 0; t <= maxTick && !ends(); t++) {
    // ---- landing
    for (const h of hits.filter((x) => x.t === t)) {
      hits.splice(hits.indexOf(h), 1);
      if (h.a === 'auto') {
        // Stall Veng to prevent troll procs: with Vengeance up, the target stalls her attack so it lands with their next scythe
        // (or, not scything, the next scythe anyone lands) - its Vengeance then lands with a scythe, not on a tick of its own
        const vmax = Math.floor(0.75 * MAX_HIT.off[Math.min(st.leaks, MAX_HIT.off.length - 1)]);   // only near a proc: when its Vengeance alone could proc her
        if (stall && phase > 0 && (hp - vmax) * 100 < MAX * phase && !h.stalled && h.p.veng && h.p.lastScy !== t) {
          const T = stallTo(h.p, t);
          if (T != null && T > t) { h.stalled = t; h.t = T; hits.push(h); L.on && L(`t${t} ${h.p.name} stalls her attack to t${T} (Vengeance up)`); continue; }
        }
        const p = h.p, pray = !p.veng, ch = autoChance(p, p.style), d = rng.random() < ch ? rng.randint(0, MAX_HIT[pray ? 'on' : 'off'][Math.min(st.leaks, MAX_HIT.on.length - 1)]) : 0;   // no Vengeance up: they pray
        L.on && L(`t${t} her attack on ${p.name}${pray ? ' (praying)' : ''}: ${d}`);
        if (h.tr) h.tr.tip = `Her attack on ${p.name}: ${d} (landed t${t}${h.stalled != null ? `, stalled from t${h.stalled}` : ''})${d >= 1 && p.veng ? ' - Vengeance' : ''}`;
        if (d >= 1 && p.veng) {
          const v = Math.floor(d * 0.75); p.veng = false; st.vengs++;
          if (trace) trace.push({ t, i: p.i, veng: v });
          damage(t, v, `${p.name} Vengeance`, 'veng', h.stalled != null);
          recast(p, t);
        }
        continue;
      }
      if (h.a === 'thrall') {                          // a thrall: 0-3, always lands, on its player's last target; the next 4 ticks later
        if (h.tr) h.tr.landed = t;
        const T = h.p.lastTgt;
        if (T && T !== 'maiden') { if (T.alive) { T.hp -= h.amt; if (T.hp <= 0) { T.alive = false; T.died = t; } L.on && L(`t${t} ${h.p.name} thrall on ${T.key} ${h.amt}${T.alive ? '' : ' (dies)'}`); } }
        else damage(t, h.amt, `${h.p.name} thrall`, 'thrall');
        thrall(h.p, t + 4);
        continue;
      }
      if (h.a === 'barrage') { barrageLands(t, h); continue; }
      if (h.a === 'aoe') {                             // Dinh's / chinchompas / a scythe on a crab: each target's hit
        const parts = []; let her = 0;
        for (const x of h.parts) {
          if (x.maiden) { her += x.d; parts.push(`Maiden ${x.d}`); continue; }
          if (!x.c.alive && !globalThis.__NOBOOM && x.c.leaked === t - 1 && x.c.died == null) {   // exploding this tick: the hit lands first - less for her to heal
            x.c.hp -= x.d; const hh = heals.find((q) => q.key === x.c.key && q.t === t); if (hh) hh.amt = 2 * Math.max(0, x.c.hp);
            parts.push(`${x.c.key} ${x.d} (as it explodes)`); continue; }
          if (!x.c.alive) { parts.push(`${x.c.key} gone`); continue; }
          x.c.hp -= x.d; if (x.c.hp <= 0) { x.c.alive = false; x.c.died = t; }
          parts.push(`${x.c.key} ${x.d}${x.c.alive ? '' : ' (dies)'}`);
          if (!x.c.alive && h.p.spells.dc && h.p.dcLeft > 0) { h.p.dcLeft--; h.p.spec = Math.min(100, h.p.spec + 15); L.on && L(`t${t} ${h.p.name} Death Charge: +15% spec (${h.p.spec}%)`); }
        }
        L.on && L(`t${t} ${h.p.name} ${h.label} lands: ${parts.join(', ')}`);
        if (h.tr) Object.assign(h.tr, { dmg: her, what: `${h.label}: ${parts.join(', ')}`, landed: t });
        if (her) damage(t, her, `${h.p.name} ${h.label}`, h.kind);
        continue;
      }
      if (h.tr) h.tr.landed = t;
      if (h.a === 'scythe') { h.p.lastScy = t; st.scyAt = t; }
      if (h.a === 'ralos') {                           // two rolls; a hit (1+) drains before the second
        const parts = [], d0 = def, accs = [], exps = [];
        for (let k = 0; k < 2; k++) {
          const [ch0, mx] = ranged(h.p, 'Tonalztics of Ralos', def, { accMult: 1.5 }), ch = sure ? 1 : ch0, m = Math.floor(mx * 0.75), d = roll(rng, ch, m);
          accs.push(ch); exps.push(hitMV(ch, m)); parts.push(d);
          if (d >= 1) lowerDef(t, `${h.p.name} Ralos Spec hit ${k + 1}`, Math.floor(MAIDEN.magic / 8));
        }
        used('ralos', parts.some((x) => x >= 1));
        const total = parts[0] + parts[1];
        if (h.tr) Object.assign(h.tr, { acc: accs, exp: sumMV(...exps), dmg: total, what: `Ralos Spec ${parts.join('/')} - her Defence ${d0} -> ${def}` });
        damage(t, total, `${h.p.name} Ralos Spec ${parts.join('/')}`, 'ralos');
        continue;
      }
      if (h.ruby) {                                    // a ZCB's ruby: 22% of her HP as it lands, max 110
        const d = Math.min(110, Math.floor(Math.max(0, hp) * 22 / 100));
        if (h.tr) Object.assign(h.tr, { dmg: d, exp: constMV(h.acc ?? 1, d), what: `${h.label}: ruby ${d}` });
        damage(t, d, `${h.p.name} ${h.label} ruby`, h.a);
        continue;
      }
      damage(t, h.amt, `${h.p.name} ${h.label}`, h.a);
    }
    if (ends()) { if (hps) hps.push(hp); break; }
    if (st.dead == null) applyHeals(t);                // a crab that reached her heals her after this tick's hits land (they can kill her first)
    if (proc === t && to !== 70 && !crabs.length) {   // the 70s proc: crabs spawn; everyone on to their 70s list
      spawn(t, 70); st.spawn70 = t;
      for (const p of ps) { p.seq = p.seq70; p.step = 0; p.lostLast = false; p.tbowFrom = p.from70; }
    }
    if (st.proc50 === t && (to === 30 || to === 0) && st.spawn50 == null) {   // the 50s proc: the next crabs; everyone on to their 50s list
      spawn(t, 50); st.spawn50 = t;
      const early = !plain && t - proc < EARLY50.ticks; if (early) { st.early50 = true; L.on && L(`t${t} the 50s came early (${((t - proc) * 0.6).toFixed(1)}s after the 70s)`); }
      for (const p of ps) {
        const left = early ? p.seq.slice(p.step).filter((a) => String(a).startsWith('ib:')).map((a) => `${a}@70`) : [];   // 70s freezes not cast yet
        p.seq = early && EARLY50.s1.includes(p.i) ? ['scyk:S1@50', ...p.seq50] : [...left, ...carry(p, p.seq50, t).filter((a) => !(left.length && a === 'ib:S1'))];
        p.step = 0; p.lostLast = false; p.tbowFrom = p.from50;
      }
    }
    if (st.proc30 === t && to === 0 && st.spawn30 == null) {   // the 30s proc: the last crabs; everyone on to their 30s list
      spawn(t, 30); st.spawn30 = t;
      for (const p of ps) { p.seq = carry(p, p.seq30, t); p.step = 0; p.lostLast = false; p.tbowFrom = p.from30; }
    }
    moveCrabs(t);                                      // after the tick's landings (a freeze landing now holds them), before anyone acts
    // ---- her attack
    if (isAttackTick(t)) {
      const on = pick(t);
      const tr = trace ? { t, boss: 'Attack', kind: 'attack', tip: `Her attack on ${on.name} (lands t${t + AUTO_DELAY})`, short: '' } : null;
      hits.push({ t: t + AUTO_DELAY, p: on, a: 'auto', tr }); if (tr) trace.push(tr);
    }
    // ---- attacks
    const tr0 = trace ? trace.length : 0, spec0 = ps.map((p) => p.spec);   // (the hover text: spec before / after this tick)
    for (const p of ps) {
      if (t >= p.regenAt) { p.spec = Math.min(100, p.spec + 10); p.regenAt += REGEN_EVERY; }
      if (st.dead != null) break;
      if (!p.veng && p.spells.veng && t >= p.vengReady) { p.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} recasts Vengeance`); }
      if (p.spells.thralls && p.prefireT != null && p.thrallAt == null) p.thrallAt = rng.randint(p.prefireT + 1, Math.max(p.prefireT + 1, p.next - 1));   // summoned between their prefire and first melee hit
      if (t === p.thrallAt) { L.on && L(`t${t} ${p.name} summons a thrall`); if (trace) trace.push({ t, i: p.i, summon: true }); thrall(p, t + rng.randint(1, 3)); }
      if (t < p.next) continue;
      if (!plain && !(ignore30 && st.proc30 != null)) { const c = crabs.find((x) => CHASE[x.key] === p.i && !ignored(x) && x.alive && t > x.frozenTo && x.hp > CHASE.hp);   // a walking 50s S1 / N1 (testing rule)
        if (c && own(p, 'Scythe of vitur')) { L.on && L(`t${t} ${p.name} goes after ${c.key} (${c.hp} HP, walking)`); crabHit(t, p, `scyc:${c.key}`, 'scyc'); continue; } }
      if (plain && stop50 && !p.stoppedOnce && phase === 50 && proc != null && p.i === stop50.by && t + 1 < proc + stop50.ticks && lineOf(p) === 'scythe' && own(p, 'Scythe of vitur')) {
        const s1 = crabRef('S1@70');   // the 50s at risk of coming before the 15s mark: everything due by then (in flight + the scythes due), a 1 in 4 chance or more
        if (s1 && s1.alive && !ignored(s1) && procRisk(t, proc + stop50.ticks - 1, 50)) { L.on && L(`t${t} ${p.name} scythes the standalone S1@70 (the 50s at risk of coming under ${(stop50.ticks * 0.6).toFixed(1)}s)`); crabHit(t, p, 'scyc:S1@70', 'scyc'); st.stopped = (st.stopped || 0) + 1; p.stoppedOnce = true; continue; }
      }
      if (!plain && phase === 50 && proc != null && p.i === EARLY50.stopper && t + 1 < proc + EARLY50.ticks && lineOf(p) === 'scythe' && own(p, 'Scythe of vitur')) {
        const s1 = crabRef('S1@70'), [ch, mx] = melee(p, 'Scythe of vitur', 1, def), [sm, sv] = scytheMV(ch, mx);
        const n = 1 + ps.filter((q) => q !== p && q.next <= t && lineOf(q) === 'scythe').length;   // this tick's scythes (theirs too)
        const due0 = hits.filter((h) => h.t <= t + 1 && h.exp != null), vengs = hits.filter((h) => h.a === 'auto' && h.t <= t + 1 && h.p.veng);   // in flight; a stalled Vengeance landing with them
        const mean = due0.reduce((x, h) => x + h.exp, 0) + n * sm + vengs.length * 0.75 * MAX_HIT.off[Math.min(st.leaks, MAX_HIT.off.length - 1)] / 2 * 0.8;
        const sd = Math.sqrt(due0.reduce((x, h) => x + (h.v || 0), 0) + n * sv), due = mean, swing = 0;
        if (s1 && s1.alive && !ignored(s1) && (hp - mean - EARLY50.z * sd) * 100 < MAX * 50) { L.on && L(`t${t} ${p.name} scythes the standalone S1@70 (the 50s at risk of coming early: ~${Math.round(due + swing)} due, ${hp - Math.ceil(MAX / 2)} to go)`); crabHit(t, p, 'scyc:S1@70', 'scyc'); st.stopped = (st.stopped || 0) + 1; continue; }
      }
      // freezers stand for the 50s / 30s proc: no attack that would leave them on cooldown past its first tick, when the proc
      // could come before then (a 1 in 4 chance or more: what's in flight plus the scythes due, normal approximation)
      { const nextList = phase === 70 && plain && to !== 70 ? p.seq70 : phase === 50 && (to === 30 || to === 0) ? p.seq50 : phase === 30 && to === 0 && (!plain || trio) ? p.seq30 : null, cur = p.seq[Math.min(p.step, p.seq.length - 1)];
        if (nextList && isFreeze(nextList[0]) && (!isFreeze(cur) || (trio && procLine(p, cur) === 'tfz' && tfzSpent(p, t)) || (trio && procLine(p, cur) === 'qfz' && qfzSpent(p, t))) && cur !== 'lose' && !(plain && atkOf(cur).style === 'melee')) {   // (plain: the scythers keep scything)
          const due = hold[nextList[0]] ?? 1, S = atkOf(cur).speed, by = t + S - due - 1;   // ready by proc + 1 (the N1 / S2 freezer: proc + 2 - their N1 goes a tick after first tick)
          if (S > 1 && (procRisk(t, by, phase) || (trio && (nextList[0] === 'tfz' || nextList[0] === 'qfz') && (hp * 100 - MAX * phase) <= MAX * (globalThis.__STAND ?? standPct)))) { const dn = Math.min(...ps.filter((q) => q !== p).map((q) => q.next));
            if (trio && t + atkOf('tfz').speed <= dn + 2 && pileWorth(t, false).v >= 15) { L.on && L(`t${t} ${p.name} preloads a barrage on the pile (no proc on those hits: it goes on the clump)`); p.standing = false; p.force = 'ibs:pile'; }
            else { if (!p.standing) L.on && L(`t${t} ${p.name} stands for the ${phase}s proc`); p.standing = true; continue; } }   // trio: the mage stands within ~3.5% of the proc
          p.standing = false;
        } }
      if (p.stand70 && proc == null && hp * 100 <= MAX * p.standAt) continue;   // stands for the 70s proc (to freeze the spawns): at or below standAt% of her HP
      { const nx = p.seq[Math.min(p.step, p.seq.length - 1)];
        const lastProc = st.proc30 ?? st.proc50 ?? proc;
        if (nx === 'zcbg' && !(st.scyAt === t && phase === 30)) continue;   // greedy ZCB: only once a scythe round has landed without the 30s
        if (lastProc === t && atkOf(nx).crab) continue;
        if (lastProc != null && hold[String(nx).split('@')[0]] != null && t < lastProc + hold[String(nx).split('@')[0]]) continue;
        { const m = /\+(\d+)$/.exec(String(nx)); if (m && lastProc != null && t < lastProc + Number(m[1])) continue; }   // holds the S2 barrage for the clump
      }   // the crabs: from the tick after the proc ("first tick" - queued on the proc tick, it goes through the next)
      const first = p.step === 0 && !p.started; p.started = true;
      if (first) p.prefireT = t;
      curT = t;
      let a = nextAct(p, t);
      if ((ignore30 && st.proc30 != null) || IGN.size) a = offCrabs(p, a);   // (option) after the 30s proc nobody goes after a crab walking in - freezes still go
      const A = atkOf(a), k = a.split(':')[0];
      if (a === 'lose') { L.on && L(`t${t} ${p.name} loses a tick`); p.next = t + 1; continue; }
      if (a === 'wait') { p.next = t + 1; continue; }
      if (k === 'dinhs' || k === 'chin' || k === 'chin4' || k === 'chinp' || k === 'chinpa' || k === 'scyc' || k === 'scyk' || k === 'scys' || k === 'clawc' || (k === 'chally' && crabOf(a))) { crabHit(t, p, a, k); continue; }
      if (k === 'ir') {                                // Ice rush: one crab - frozen 8 ticks on the cast (if it can be), the damage when it lands
        const c = crabRef(id4(crabOf(a))), tr = trace ? { t, i: p.i, code: 'IR', what: `Ice rush → ${crabOf(a)}` } : null;
        if (c && c.alive) {
          const B = p.barrage ||= barrageOf(p.gear), fr = t > c.immuneTo && t > c.frozenTo;
          if (fr) { c.frozenTo = t + FREEZE.rush[0]; c.immuneTo = c.frozenTo + FREEZE_IMMUNE; c.rushed = true; st.frozen[c.key] = (st.frozen[c.key] || 0) + 1; }
          L.on && L(`t${t} ${p.name} Ice rush on ${c.id}: ${fr ? `freezes ${c.key}` : 'frozen / immune'}`);
          const mx = Math.floor(RUSH_BASE * B.max / BARRAGE.base), ok = rng.random() < hit_chance(B.roll, (CRAB.magic + 9) * 64), d = ok ? rng.randint(0, mx) : 0;
          hits.push({ t: t + magicDelay(distTo(p, c)), p, a: 'aoe', parts: [{ c, d }], label: `Ice rush on ${c.key}`, kind: 'rush', tr });
          p.lastTgt = c; if (tr) { tr.tgt = c.key; trace.push(tr); }
        } else { L.on && L(`t${t} ${p.name} Ice rush on ${crabOf(a)}: gone`); if (tr) trace.push(tr); }
        p.style = 'magic'; p.next = t + A.speed; continue;
      }
      if (k === 'aya') {                               // Eye of ayak on a crab (its own attack): one hit, no freeze
        const c = crabOf(a) === 'maiden' ? null : crabRef(crabOf(a)), tr = trace ? { t, i: p.i, code: 'AY', what: `Eye of ayak → ${crabOf(a)}`, tgt: c ? crabOf(a) : null } : null;
        if (!c) { const B = ((p.fz ||= {}).aya ||= barrageOf(p.gear, 'Eye of ayak', 26)), ok = rng.random() < hit_chance(B.roll, (MAIDEN.magic + 9) * 64), d = ok ? rng.randint(0, B.max) : 0;   // on her
          hits.push({ t: t + magicDelay(4), p, a: 'ayak', amt: d, label: 'Eye of ayak', tr }); if (tr) { Object.assign(tr, { dmg: d }); trace.push(tr); } p.lastTgt = 'maiden'; }
        else if (c.alive) { const B = ((p.fz ||= {}).aya ||= barrageOf(p.gear, 'Eye of ayak', 26)), ok = sure || rng.random() < hit_chance(B.roll, (CRAB.magic + 9) * 64), d = ok ? rng.randint(0, B.max) : 0;
          hits.push({ t: t + magicDelay(distTo(p, c)), p, a: 'aoe', parts: [{ c, d }], label: `Eye of ayak on ${c.key}`, kind: 'ayak', tr }); p.lastTgt = c; if (tr) trace.push(tr); }
        p.style = 'magic'; p.next = t + A.speed; continue;
      }
      if (A.crab) {                                   // Ice barrage on a crab: lands by distance (30s: S2 / the 3s from right by the clump)
        const c = barragePrim(crabOf(a), t), d = !c ? 7 : (phase === 0 && !plain && ['S2', 'S3', 'N3'].includes(crabOf(a))) || (trio && proc != null && st.proc50 != null && ['S2', '3s', '4s', 'cl', 'old', 'pile'].includes(String(crabOf(a)).split('@')[0])) ? 1 : distTo(p, c), nm = FSPELL[k].name, tr = trace ? { t, i: p.i, code: A.code, what: `${nm} → ${crabOf(a)}` } : null;
        const before = new Map(crabs.map((x) => [x.key, x.frozenTo])), targets = barrageCast(t, p, crabOf(a), k);
        if (targets) { p.lastTgt = targets[0]; if (tr) tr.tgt = targets[0].key; if (d === 1) { p.pos = [targets[0].x + 2, targets[0].y + 1]; if (tr) tr.pos = p.pos; } hits.push({ t: t + magicDelay(d), p, a: 'barrage', k, crab: crabOf(a), targets, froze: targets.filter((x) => x.frozenTo !== before.get(x.key)).map((x) => x.key).join(', '), tr }); if (tr) trace.push(tr); }
        else { L.on && L(`t${t} ${p.name} ${nm} on ${crabOf(a)}: gone`); if (tr) { tr.what = `${nm} → ${crabOf(a)}: gone`; trace.push(tr); } }
        p.style = 'magic'; p.next = t + A.speed; continue;
      }
      const tr = trace ? { t, i: p.i, code: A.code } : null;
      const go = (h) => { hits.push({ t: t + delayOf(k === 'scyf' ? 'scythe' : k === 'zcbg' || k === 'zcbx' ? 'zcbs' : a, first, p.tbowFrom), p, a: k === 'scyf' ? 'scythe' : a === 'ralosl' ? 'ralos' : a, tr, label: A.label, ...h }); if (tr) trace.push(tr); };
      const tag = first ? ' (prefire)' : '';
      p.lastTgt = 'maiden'; p.pos = A.style === 'melee' ? p.spot : [7 + (first ? 10 : p.tbowFrom === 4 ? 10 : p.tbowFrom === 3 ? 7 : 2), 10 + (p.i % 4)];
      if (A.spec) { p.spec -= A.spec; L.on && L(`t${t} ${p.name} ${A.label} (${p.spec}% left)`); }
      if (a === 'tbr' || a === 'tba' || a === 'bp') {
        const [ch, mx] = ranged(p, A.weapon, def, { accurate: a === 'tba' }), d = roll(rng, ch, mx);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `${A.label}${tag} ${d}` });
        go({ amt: d, exp: hitMV(ch, mx)[0], v: hitMV(ch, mx)[1] });
      } else if (a === 'ax') {
        const [ch, mx] = ranged(p, A.weapon, def), ap = rng.random() < 0.055, d = ap ? Math.max(1, rng.randint(0, Math.floor(mx * 1.15))) : roll(rng, ch, mx);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `Ascension crossbows ${d}${ap ? ' (Armour Piercing)' : ''}` });
        go({ amt: d });
      } else if (a === 'zcb') {
        const [ch, mx] = ranged(p, A.weapon, def);
        if (rng.random() < RUBY) { if (tr) tr.acc = 1; go({ ruby: true, acc: 1, label: `ZCB${tag}` }); }
        else { const d = roll(rng, ch, mx); if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `ZCB${tag} ${d}` }); go({ amt: d, label: `ZCB${tag}` }); }
      } else if (a === 'zcbs' || a === 'zcbg' || a === 'zcbx' || a === 'zcbf') {
        if (a === 'zcbg') { p.greedyDone = true; st.greedy++; }
        const [ch0] = ranged(p, A.weapon, def, { accMult: 2 }), ch = sure ? 1 : ch0, ok = rng.random() < ch; used('zcbs', ok);
        if (tr) tr.acc = ch;
        const rb = Math.min(110, Math.floor(Math.max(0, hp) * 22 / 100));   // expected: its accuracy x the ruby (for the proc checks)
        if (ok) go({ ruby: true, acc: ch, label: `ZCB spec${tag}`, exp: ch * rb, v: ch * (1 - ch) * rb * rb });
        else { if (tr) Object.assign(tr, { dmg: 0, exp: [0, 0], what: `ZCB spec${tag} misses` }); go({ amt: 0, label: 'ZCB spec misses', exp: ch * rb, v: ch * (1 - ch) * rb * rb }); }
      } else if (a === 'ralos' || a === 'ralosl') {
        go({});
      } else if (a === 'maul' || a === 'bgs') {
        const [ch0, mx0] = a === 'maul' ? melee(p, A.weapon, 2, def, 1.25) : melee(p, A.weapon, 1, def, 2), ch = sure ? 1 : ch0, mx = a === 'maul' ? mx0 : Math.floor(Math.floor(mx0 * 1.1) * 1.1);
        const ok = rng.random() < ch, d = ok ? Math.max(1, rng.randint(0, mx)) : 0, d0 = def; used(a, ok);
        if (ok) { lowerDef(t, `${p.name} ${A.label}`, a === 'maul' ? Math.floor(def * 0.35) : d); if (a === 'maul') st.maulsLanded++; }
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `${A.label} ${ok ? d : 'misses'} - her Defence ${d0} -> ${def}` });
        go({ amt: d, label: `${A.label}${ok ? '' : ' misses'}` });
      } else if (a === 'chally' || a === 'challyf') {                      // two hits (she's big), the second at 75% accuracy; a landed hit 1..max + max/10 (+10%)
        const [c1, mx] = melee(p, A.weapon, 1, def), ch = sure ? [1, 1] : [c1, melee(p, A.weapon, 1, def, 0.75)[0]];
        const parts = ch.map((c) => (rng.random() < c ? Math.max(1, rng.randint(0, mx)) + Math.floor(mx / 10) : 0)), d = parts[0] + parts[1]; used(a, d > 0);
        if (tr) Object.assign(tr, { dmg: d, acc: ch[0], what: `Halberd spec ${parts.join('/')}` });
        go({ amt: d, label: `Halberd spec ${parts.join('/')}` });
      } else if (a === 'claws') {
        const [ch, mx] = melee(p, A.weapon, 1, def), parts = clawRolls(ch, mx, rng), d = parts.reduce((x, y) => x + y, 0); used(a, d > 0);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, what: `Claw spec ${parts.join('/')}` });
        go({ amt: d, label: `Claw spec ${parts.join('/')}` });
      } else {
        const [ch, mx] = melee(p, A.weapon, 1, def), parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => roll(rng, ch, m)), d = parts[0] + parts[1] + parts[2];
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: scytheMV(ch, mx), what: `scythe ${parts.join('/')}` });
        go({ amt: d, exp: scytheMV(ch, mx)[0], v: scytheMV(ch, mx)[1], label: `scythe ${parts.join('/')}` });
      }
      p.style = A.style; p.next = t + A.speed;
    }
    if (trace) trace.push({ t, hp: Math.max(0, hp), phase: proc == null ? 'to 70s' : st.proc50 == null ? 'to 50s' : 'to 30s' });
    if (trace) for (let k = tr0; k < trace.length; k++) {   // hover text on this tick's attacks, as in the other rooms: gear, target, spec
      const x = trace[k], p = x.i != null && x.code ? ps[x.i] : null; if (!p || x.gear) continue;
      const style = /^(IB|IBS|IBL|IBU|IR|AY)$/.test(x.code) ? 'mage' : /^(S|C|HB|DB|EM|BGS)$/.test(x.code) ? 'melee' : 'range';
      const w = SPELL_WEAPON[x.code] || (Object.values(ATTACKS).find((a) => a.code === x.code && a.weapon) || {}).weapon || null;
      const set = worn(p.gear, style, w || undefined); x.gear = Object.entries(set).filter(([, v]) => v && v !== 'none').map(([, v]) => v).join(', ');
      x.target = x.tgt ? String(x.tgt).replace(/^([NS]\d[ab]?)@(\d+)$/, '$2s $1') : 'Maiden';
      if (spec0[p.i] !== p.spec || ATTACKS_SPEC.has(x.code)) { x.spec = spec0[p.i]; x.specAfter = p.spec; x.regenIn = p.spec >= 100 ? null : Math.max(0, p.regenAt - t); }
    }
    if (hps) hps.push(hp);
    if (room) room.push({ t, hp, crabs: crabs.map((c) => ({ id: c.id, wave: c.wave, key: c.key, x: c.x, y: c.y, hp: c.hp, alive: c.alive, frozen: t <= c.frozenTo, frozenTo: c.frozenTo, immune: t > c.frozenTo && t <= c.immuneTo, leaked: c.leaked, died: c.died })) });
  }
  if (trace && proc != null) { trace.push({ t: proc, hp: Math.max(0, hp), phase: '70s' }); trace.push({ t: proc, mark: '70s' }); if (st.proc50 != null) trace.push({ t: st.proc50, mark: '50s' }); if (st.proc30 != null) trace.push({ t: st.proc30, mark: '30s' }); }
  return { proc, procBy, hp, def, ...st, inFlight: hits.filter((h) => h.a !== 'auto').length };
}
