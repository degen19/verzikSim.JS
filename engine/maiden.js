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
//   1. Her ramping when crabs leak (MAX_HIT by crabs leaked).
//   2. Dinh's targeting (chunks?).  3. Barrage targeting.  4. Chinchompa AoE hits.
//   5. Freeze timing with / without a sceptre, for each spell (Ancients toggle).
//   6. Crab distance to her on spawn, and to clumping with other crabs.
//   7. Scythe hitting several crabs / her (cleave).  8. Obligator the same.
//   9. "Add attack" per section (start, 70s, 50s, 30s, end) - and how a player's hits change with the procs' timing
//      (the sim's own behaviour, not more settings).
//  10. Fail conditions.  11. Prefire options (ZCB auto / spec in; more to come).  12. Stalling her auto on the proc
//      thresholds.  13. Money-raid Maiden with default decisions (Dinh's positioning, freezes, tbows...).
//  14. Maiden targeting (her own: for now one player, the Maiden targets setting).
//  15. Thralls change target when their player hits a crab (they follow their player's target).
//  16. DC (Death Charge) - the toggle's kept for it.
//  17. Stall Veng to prevent troll procs stops after her 30s proc (once the later sections are in).
//  18. Check that players have the spec energy their hits need (like the missing-gear check before a report runs) -
//      for now a spec they can't afford is just skipped.
//  19. Backup Defence specs: when the opening Defence specs miss (e.g. a maul), backups (BGS / Ralos / maul again...)
//      to get her Defence down, as on Xarpus.
//  20. Report: Vengeance damage - average a raid (total).
//  21. Prayer on her attacks: off-prayer Vengeance for now (PRAYING = false: her max 36, not 18) - when players pray
//      or tank off prayer to change with the fight (crabs leaked, HP, the phase).
//  22. (Down the road) "Render Video" on a raid's recap: a 3D replay of that one raid's room, made on request.
//      With it: player deaths (from incoming damage - their attacks/specs stop, room effects follow) and Dawnbringer
//      passing (drop on a tick, the receiver walks to the tile, picks it up, equips, specs).
//      Boss spots: Bloat walks/runs the track around the centre tank (and stops after a while); Nylo boss and Xarpus
//      in the exact centre; Sotetseg at the end opposite the red gate; Verzik P1 on the throne (end centre); P3
//      spawns in the centre, follows a tank drag pre-webs, and walks back to the centre for webs.
//      Verzik pillars: they fall after P1 or once they've taken enough damage (matters in solos) - not modelled yet.
//  23. (Down the road, after 22) Practice mode: set the other players' behaviour and your own target plan, then
//      play your player live (0.6s ticks, clicks to walk/attack, keys for prayers/spec/swaps) in the rendered room.
//      Graded against your target plan per tick (attacks on time, right target, specs, freezes, prayers): a score
//      plus a timeline of where you drifted and what it cost. Maiden first.
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
//  immune - a 32-tick freeze: frozen ticks 1-32, immune 33-37, can be frozen again on 38.
export const ROOM = { w: 28, h: 24 };
export const CHUNK = { x0: 0, y0: 3, size: 8 };   // a chunk line west of x = 0, 8, 16, 24 and north of y = 3, 11, 19 (see above)
export const MAIDEN_TILE = { x: 2, y: 9, size: 6 };
export const SPAWNS = { N1: [13, 1], N2: [17, 1], N3: [21, 1], N4a: [25, 1], N4b: [25, 3], S1: [13, 21], S2: [17, 21], S3: [21, 21], S4a: [25, 21], S4b: [25, 19] };
export const CRAB_HP = { 5: 100, 4: 87, 3: 75, 2: 75, 1: 75 };
export const CRAB = { size: 2, magic: 100, def: 100 };
export const FREEZE = { barrage: [32, 35], burst: [16, 17], blitz: [24, 26], rush: [8, 8] };   // [ticks, with an ancient sceptre]
export const FREEZE_IMMUNE = 5;
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
//  - Her attack every 10 ticks from tick 9, on one player (the Maiden targets setting: player 4 in a 4s for now),
//    landing 5 ticks later: her accuracy (Magic 350, +300 magic attack) against their magic defence in what they're
//    wearing, up to MAX_HIT off Protect from Magic (36 with no crabs leaked - an off-prayer Vengeance; PRAYING). Everyone starts with Vengeance cast and its
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
import { hitMV, scytheMV, constMV, sumMV } from './expdmg.js';

/** Her max hit by crabs leaked: on Protect from Magic / off it. */
export const MAX_HIT = { on: [18, 20, 21, 23, 25, 27, 29, 30, 32, 34, 36, 38, 39, 41, 43], off: [36, 40, 43, 47, 50, 54, 58, 61, 65, 68, 72, 76, 79, 83, 86] };
export const MAX_HIT_30 = { on: 72, off: 144 };   // (30 crabs)
/** The attacks: code -> {label, weapon, style, speed (next attack after), delay (lands after), spec (energy), code (Show raid)}. */
export const ATTACKS = {
  tbr: { label: 'Tbow (rapid)', weapon: 'Twisted bow', style: 'range', speed: 5, delay: 4, code: 'TB' },
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
};
/** What can be a prefire, and the first tick it can go. */
export const PREFIRES = ['tbr', 'tba', 'zcb', 'zcbs', 'ralos', 'ralosl'];
const prefireTick = (a) => (a === 'ralos' || a === 'ralosl' ? PREFIRE_TICK[a] : ATTACKS[a].weapon === 'Twisted bow' ? PREFIRE_TICK.tbow : PREFIRE_TICK.zcb);
/** The player she attacks prays Protect from Magic? Not for now: off prayer, so the Vengeance hits harder (her max
 *  36 with no crabs leaked, not 18). */
export const PRAYING = false;
export const AUTO_DELAY = 5, VENG_CD = 50, RUBY = 0.066;
const RANGED = 112, MELEE = 118, MAGIC_LVL = 99, DEF_LVL = 118;
const PRAY = { Piety: [1.20, 1.23], Zeal: [1.25, 1.28] };
const RIGOUR = [1.20, 1.23];
const PRAY_DEF = { Piety: 1.25, Zeal: 1, Rigour: 1.25 };      // Zeal: no Defence boost (assumed)
const RANGE_SEQ = ['tbr', 'ax', 'ralos', 'tbr'], MELEE_SEQ = ['tbr', 'maul', 'scythe'];
/** The default plan by scale: half the team ranged (tbow, Ascension hit, Ralos spec, tbows), the rest melee (tbow,
 *  Elder maul spec, scythes); 100% spec; her attacks on the last player. */
export function defaultMaidenPlan(team) {
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
/** A player's spellbook toggles (each defaults on): ancients (freezes - with the crabs), thralls, dc (Death Charge),
 *  veng (cast Vengeance themselves, and Vengeance Other on a teammate who can't). */
export const SPELLS = [['ancients', 'Ancients'], ['thralls', 'Thralls'], ['dc', 'DC'], ['veng', 'Veng']];
export const spellsOf = (c) => Object.fromEntries(SPELLS.map(([k]) => [k, !(c.spells && c.spells[k] === false)]));
const own = (p, w) => (p.gear.weapons || []).includes(w);
/** Can the player do this attack at all (the weapon's in their Gear)? */
export const canDo = (gear, a) => (gear.weapons || []).includes(ATTACKS[a].weapon);
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
export function runMaiden(players, team, rng, log = null, { target = team - 1, trace = null, maxTick = 200, hps = null, stall = true } = {}) {   // hps: [] for her HP at the end of each tick
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const MAX = MAIDEN_HP[team] || 3500;
  let hp = MAX, def = MAIDEN.def, proc = null;
  const st = { specs: {}, maulsLanded: 0, vengs: 0, dmg: {}, skipped: [] };
  const ps = players.map((c, i) => {
    const seq = seqOf(c, i, team);
    const sp = spellsOf(c);
    return { i, name: c.name || `P${i + 1}`, gear: c.gear, seq, spells: sp, spec: Number(c.startSpec ?? 100), step: 0, next: prefireTick(seq[0]), style: 'range', veng: false, vengReady: 0 };
  });
  // Vengeance from the start: their own (Veng ticked), else a teammate's Vengeance Other (anyone with Veng)
  const vengers = ps.filter((p) => p.spells.veng);
  for (const p of ps) p.veng = vengers.length > 0;
  /** Vengeance again after a proc: their own if they have it and it's off cooldown, else Vengeance Other from a teammate
   *  whose cooldown is up (the caster's cooldown). No tick lost either way. */
  const recast = (p, t) => {
    const by = p.spells.veng && t >= p.vengReady ? p : vengers.find((q) => q !== p && t >= q.vengReady);
    if (!by) return;
    p.veng = true; by.vengReady = t + VENG_CD;
    L.on && L(`t${t} ${by === p ? `${p.name} recasts Vengeance` : `${by.name} casts Vengeance Other on ${p.name}`}`);
  };
  const tgt = ps[Math.min(ps.length - 1, Math.max(0, Number(target) || 0))];
  const hits = [];                                     // {t, p, a, amt?, tr?, label, ok?}
  let procBy = null;                                   // what procced her: a player's attack (or a stalled Vengeance landing with a scythe) / 'thrall' / 'veng'
  const damage = (t, amt, label, kind, stalled = false) => {
    if (amt <= 0) { L.on && L(`t${t} ${label} 0`); return; }
    const before = hp; hp -= amt; st.dmg[kind] = (st.dmg[kind] || 0) + amt;
    L.on && L(`t${t} ${label} ${amt} -> Maiden ${hp}`);
    if (proc == null && procsOn(team, 70, before, hp)) { proc = t; procBy = kind === 'thrall' || (kind === 'veng' && !stalled) ? kind : 'attack'; L.on && L(`t${t} *** 70s proc (below ${(MAX * 0.7).toFixed(1)}) ***`); }
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
  /** The player's next attack: their list in turn (the last repeats), skipping what they can't do. */
  const nextAct = (p) => {
    for (;;) {
      const last = p.step >= p.seq.length - 1, a = p.seq[Math.min(p.step, p.seq.length - 1)], A = ATTACKS[a];
      const ok = own(p, A.weapon) && (!A.spec || p.spec >= A.spec);
      if (ok) { if (!last) p.step++; return a; }
      if (!last) { st.skipped.push({ i: p.i, a }); L.on && L(`${p.name} skips ${A.label} (${own(p, A.weapon) ? 'not enough spec' : 'no weapon'})`); p.step++; continue; }
      return A.style === 'melee' && own(p, 'Scythe of vitur') ? 'scythe' : 'tbr';   // the last one, and they can't: scythe / rapid tbow
    }
  };
  for (let t = 0; t <= maxTick && proc == null; t++) {
    // ---- landing
    for (const h of hits.filter((x) => x.t === t)) {
      hits.splice(hits.indexOf(h), 1);
      if (h.a === 'auto') {
        // Stall Veng to prevent troll procs: with Vengeance up, the target stalls her attack so it lands with their next scythe
        // (or, not scything, the next scythe anyone lands) - its Vengeance then lands with a scythe, not on a tick of its own
        if (stall && !h.stalled && h.p.veng && h.p.lastScy !== t) {
          const T = stallTo(h.p, t);
          if (T != null && T > t) { h.stalled = t; h.t = T; hits.push(h); L.on && L(`t${t} ${h.p.name} stalls her attack to t${T} (Vengeance up)`); continue; }
        }
        const p = h.p, ch = autoChance(p, p.style), d = rng.random() < ch ? rng.randint(0, MAX_HIT[PRAYING ? 'on' : 'off'][0]) : 0;
        L.on && L(`t${t} her attack on ${p.name}: ${d}`);
        if (h.tr) h.tr.tip = `Her attack on ${p.name}: ${d} (landed t${t}${h.stalled != null ? `, stalled from t${h.stalled}` : ''})${d >= 1 && p.veng ? ' - Vengeance' : ''}`;
        if (d >= 1 && p.veng) {
          const v = Math.floor(d * 0.75); p.veng = false; st.vengs++;
          if (trace) trace.push({ t, i: p.i, veng: v });
          damage(t, v, `${p.name} Vengeance`, 'veng', h.stalled != null);
          recast(p, t);
        }
        continue;
      }
      if (h.a === 'thrall') {                          // a thrall: 0-3, always lands; the next 4 ticks later
        if (h.tr) h.tr.landed = t;
        damage(t, h.amt, `${h.p.name} thrall`, 'thrall');
        thrall(h.p, t + 4);
        continue;
      }
      if (h.tr) h.tr.landed = t;
      if (h.a === 'scythe') h.p.lastScy = t;
      if (h.a === 'ralos') {                           // two rolls; a hit (1+) drains before the second
        const parts = [], d0 = def, accs = [], exps = [];
        for (let k = 0; k < 2; k++) {
          const [ch, mx] = ranged(h.p, 'Tonalztics of Ralos', def, { accMult: 1.5 }), m = Math.floor(mx * 0.75), d = roll(rng, ch, m);
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
    if (proc != null) { if (hps) hps.push(hp); break; }
    // ---- her attack
    if (isAttackTick(t)) {
      const tr = trace ? { t, boss: 'Attack', kind: 'attack', tip: `Her attack on ${tgt.name} (lands t${t + AUTO_DELAY})`, short: '' } : null;
      hits.push({ t: t + AUTO_DELAY, p: tgt, a: 'auto', tr }); if (tr) trace.push(tr);
    }
    // ---- attacks
    for (const p of ps) {
      if (t < p.next) continue;
      const first = p.step === 0 && !p.started; p.started = true;
      if (first && p.spells.thralls) thrall(p, t + rng.randint(1, 3));   // their thrall's first hit: 1-3 ticks after their first attack
      const a = nextAct(p), A = ATTACKS[a], tr = trace ? { t, i: p.i, code: A.code } : null;
      const go = (h) => { hits.push({ t: t + A.delay, p, a: a === 'ralosl' ? 'ralos' : a, tr, label: A.label, ...h }); if (tr) trace.push(tr); };
      const tag = first ? ' (prefire)' : '';
      if (A.spec) { p.spec -= A.spec; L.on && L(`t${t} ${p.name} ${A.label} (${p.spec}% left)`); }
      if (a === 'tbr' || a === 'tba' || a === 'bp') {
        const [ch, mx] = ranged(p, A.weapon, def, { accurate: a === 'tba' }), d = roll(rng, ch, mx);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `${A.label}${tag} ${d}` });
        go({ amt: d });
      } else if (a === 'ax') {
        const [ch, mx] = ranged(p, A.weapon, def), ap = rng.random() < 0.055, d = ap ? Math.max(1, rng.randint(0, Math.floor(mx * 1.15))) : roll(rng, ch, mx);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `Ascension crossbows ${d}${ap ? ' (Armour Piercing)' : ''}` });
        go({ amt: d });
      } else if (a === 'zcb') {
        const [ch, mx] = ranged(p, A.weapon, def);
        if (rng.random() < RUBY) { if (tr) tr.acc = 1; go({ ruby: true, acc: 1, label: `ZCB${tag}` }); }
        else { const d = roll(rng, ch, mx); if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `ZCB${tag} ${d}` }); go({ amt: d, label: `ZCB${tag}` }); }
      } else if (a === 'zcbs') {
        const [ch] = ranged(p, A.weapon, def, { accMult: 2 }), ok = rng.random() < ch; used(a, ok);
        if (tr) tr.acc = ch;
        if (ok) go({ ruby: true, acc: ch, label: `ZCB spec${tag}` });
        else { if (tr) Object.assign(tr, { dmg: 0, exp: [0, 0], what: `ZCB spec${tag} misses` }); go({ amt: 0, label: 'ZCB spec misses' }); }
      } else if (a === 'ralos' || a === 'ralosl') {
        go({});
      } else if (a === 'maul' || a === 'bgs') {
        const [ch, mx0] = a === 'maul' ? melee(p, A.weapon, 2, def, 1.25) : melee(p, A.weapon, 1, def, 2), mx = a === 'maul' ? mx0 : Math.floor(Math.floor(mx0 * 1.1) * 1.1);
        const ok = rng.random() < ch, d = ok ? Math.max(1, rng.randint(0, mx)) : 0, d0 = def; used(a, ok);
        if (ok) { lowerDef(t, `${p.name} ${A.label}`, a === 'maul' ? Math.floor(def * 0.35) : d); if (a === 'maul') st.maulsLanded++; }
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `${A.label} ${ok ? d : 'misses'} - her Defence ${d0} -> ${def}` });
        go({ amt: d, label: `${A.label}${ok ? '' : ' misses'}` });
      } else if (a === 'claws') {
        const [ch, mx] = melee(p, A.weapon, 1, def), parts = clawRolls(ch, mx, rng), d = parts.reduce((x, y) => x + y, 0); used(a, d > 0);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, what: `Claw spec ${parts.join('/')}` });
        go({ amt: d, label: `Claw spec ${parts.join('/')}` });
      } else {
        const [ch, mx] = melee(p, A.weapon, 1, def), parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => roll(rng, ch, m)), d = parts[0] + parts[1] + parts[2];
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: scytheMV(ch, mx), what: `scythe ${parts.join('/')}` });
        go({ amt: d, label: `scythe ${parts.join('/')}` });
      }
      p.style = A.style; p.next = t + A.speed;
    }
    if (trace) trace.push({ t, hp: Math.max(0, hp), phase: 'to 70s' });
    if (hps) hps.push(hp);
  }
  if (trace && proc != null) { trace.push({ t: proc, hp: Math.max(0, hp), phase: '70s' }); trace.push({ t: proc, mark: '70s' }); }
  return { proc, procBy, hp, def, ...st, inFlight: hits.filter((h) => h.a !== 'auto').length };
}
