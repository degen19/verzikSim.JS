// Sotetseg - the whole room, tick by tick: phase 1, maze (skip), phase 2, maze (skip), the kill.
//
// Rules (agreed with the chart author):
//  - HP 4000 (5s), 3500 (4s), 3000 (3s and duos). Defence 200, floor 100; reset after each maze. Magic 250, Ranged 250.
//    Defence bonuses: melee +70 (stab / slash / crush), magic +30, ranged +150. She can't be damaged below a maze
//    threshold: the hit that reaches 66.6% (or 33.3%) stops there and starts the maze.
//  - Her attacks: on tick 6, then every 5 ticks. She picks a random target; if that player meleed her the tick before,
//    50% melee (lands next tick: crush, accuracy (250+9) x (0+64), max 45, protect melee cuts the max by 40%),
//    otherwise a magic orb: lands on the target 7 ticks later, then splits to up to 2 other players (one Ranged, one
//    Magic orb, random which; duo: one orb 50/50; solo: none) landing 7 ticks after that. Orbs: max 50, accuracy
//    (250+9) x (-10+64); 0 if prayed against; an orb that hits them unprayed (prayed wrong, or taken for veng) turns their prayer off - back up 5 ticks later (unprayed on t16: up again on t21); a prayed one doesn't. Split orbs don't split again.
//  - Players pray against every orb, except: with veng up, above 50 HP and no other orb on them in the next 4 ticks,
//    they take the earliest orb off prayer (veng). Veng: 75% of the hit back to her; everyone starts with it up and off
//    cooldown; recast (or cast on a teammate without one, if the caster's own is up) as soon as the 50-tick cooldown
//    allows. Veng damage obeys the maze threshold too.
//  - Players: prefire (Twisted bow / ZCB auto / ZCB spec / Shadow Barrage / Tumeken's shadow, in their best gear for it),
//    then (specs - to come) scythes every 5 ticks, lined up on her attack ticks so she never melees (the "flinch").
//    Shadow Barrage drains 15% of her Defence (once until the next maze, floor 100).
//
// Solver (to come), every scale: prefires, Lightbearer (who, and for how many cycles, 1-5 - no more players than the
// Lightbearers in the raid), surges (no more than the room's surge limit), 95 / 100 start spec (95: first regen the
// tick after their first spec), horn (phase 1: on t8 as now; phase 2: horn + mauls after the players' first scythe
// swing off the maze - not in the stall), mauls / claws / ZCB specs, Shadow Barrage prefire in place of a maul,
// skipping a maul once one lands, who specs in which phase - and the room entry instance. Output: top 10 (as Verzik),
// each with the entry instance tick, a phase-by-phase breakdown of the procedure, and the times (median / top 10%):
// P1, first maze, P2, second maze, total. Spec resets each room; the surge cooldown carries over (the full raid solver
// weighs Sotetseg against Verzik). Off-grid idea to test: delaying the phase 2 mauls 2-3 ticks off the maze so the
// horn goes off first and they're guaranteed.
//
// Assumptions to confirm (constants below): prefire attack ticks / hit delays, player stats (super combat 118 Atk /
// Str / Def, range potted 112 Ranged, 99 Magic, Piety or Zeal for melee, Rigour / Augury for prefires).
import { hit_chance } from './sim.js';
import { ITEMS } from './gear.js';
import { worn, bonuses, bestWorn } from './loadout.js';
import { REDEMPTION_HEAL } from './supplies.js';
import { rollMaze, underToStart, runnersToStart } from './sotemaze.js';

export const SOTE_HP = { 5: 4000, 4: 3500, 3: 3000, 2: 3000, 1: 3000 };
export const SOTE = { def: 200, defFloor: 100, mag: 250, rng: 250, atk: 250, str: 250,
  defMelee: 70, defMagic: 30, defRanged: 150, accMelee: 0, accMagic: -10, accRanged: -10 };
export const FIRST_ATTACK = 6, ATTACK_EVERY = 5, ORB_DELAY = 7, PRAYER_OFF = 4;   // an orb that hits them unprayed on t: prayer off t+1 - t+4, back up on t+5
export const MELEE_MAX = 45, ORB_MAX = 50, VENG_CD = 50;
export const MAZE_AT = [2 / 3, 1 / 3];
export const SOLO_UNDER = 14;                    // solos are picked as the under first: the skip after it is 14 ticks later
// her death (after the second maze): the room ends 5 ticks after the killing hit, 4 with overkill - as in Verzik P3,
// overkill = another hitsplat lands on the killing tick after the killing hit
export const DEATH_ANIM = 5, DEATH_ANIM_OVERKILL = 4;

// ---- maze damage (worked out on the tick a player steps on a wrong tile from their HP then; lands the next tick,
// the splash to every player within 5x5 of them the tick after)
/** Damage to a player on a wrong maze tile, by their HP. */
export function mazeDmg(hp) {
  return hp >= 106 ? 22 : hp >= 90 ? 21 : hp >= 75 ? 20 : hp >= 60 ? 19 : hp >= 45 ? 18 : hp >= 30 ? 17 : 16;
}
// phoenix necklace: a hit that leaves them on 1-19 HP heals 29 and clears every hit still queued
export const PNECK_AT = 19, PNECK_HEAL = 29, STALL_TICKS = 7;
/**
 * A maze skip (stall) for one player: 7 dangerous ticks, every hit worked out from their HP on entering - the first tick
 * a maze hit plus a splash from each other maze runner (team - 2: the player under isn't on the tiles), then a maze hit
 * on each of the other 6 ticks - all queued and taken in order when they come out. A phoenix necklace procs on the
 * first hit that leaves them on 1-19 (heals 29, clears the rest). Returns {hp, pneck: used one, dead}.
 */
export function stallSkip(hp, team, hasPneck = true, splash = true, runners = team - 1) {
  const q = [mazeDmg(hp), ...(splash ? Array(Math.max(0, runners - 1)).fill(splashDmg(hp)) : [])];   // a splash from each other runner
  for (let i = 1; i < STALL_TICKS; i++) q.push(mazeDmg(hp));
  let cur = hp;
  for (const d of q) {
    cur -= d;
    if (cur <= 0) return { hp: cur, pneck: false, dead: true };
    if (hasPneck && cur <= PNECK_AT) return { hp: cur + PNECK_HEAL, pneck: true, dead: false };
  }
  return { hp: cur, pneck: false, dead: false };
}
/** Splash damage bounced to a nearby player, by HP. */
export function splashDmg(hp) {
  return hp >= 120 ? 16 : hp >= 100 ? 15 : hp >= 80 ? 14 : hp >= 60 ? 13 : hp >= 40 ? 12 : hp >= 20 ? 11 : 10;
}
// prefires: the tick they attack on, ticks until it lands, attack speed (their next attack is lined up on her
// attack ticks anyway). ZCB: one tile less range, so it goes off a tick later.
export const PREFIRE = {
  'Twisted bow':      { weapon: 'Twisted bow', style: 'range', tick: 5, delay: 3 },
  'ZCB auto':         { weapon: 'Zaryte crossbow', style: 'range', tick: 6, delay: 3 },
  'ZCB spec':         { weapon: 'Zaryte crossbow', style: 'range', tick: 6, delay: 3, spec: 75 },
  'Shadow Barrage':   { weapon: 'Shadow ancient sceptre', style: 'mage', tick: 5, delay: 4 },
  "Tumeken's shadow": { weapon: "Tumeken's shadow", style: 'mage', tick: 5, delay: 4 },
};
const RANGED = 112;                                             // range potted (99 + ranging potion) for prefires / ZCB
const PRAY = { Piety: [1.20, 1.23], Zeal: [1.25, 1.28] };     // melee accuracy / strength

/** Her defence roll for a style at her current Defence level. */
const defRoll = (lvl, style) => (style === 'mage' ? (SOTE.mag + 9) * (SOTE.defMagic + 64)
  : (lvl + 9) * ((style === 'range' ? SOTE.defRanged : SOTE.defMelee) + 64));

/** Twisted bow multipliers against a Magic level (raid cap 250): [accuracy, damage] as fractions. */
export function tbowMult(m) {
  const M = Math.min(250, m);
  const acc = Math.min(140, 140 + Math.floor((3 * M - 10) / 100) - Math.floor((3 * M / 10 - 100) ** 2 / 100));
  const dmg = Math.min(250, 250 + Math.floor((3 * M - 14) / 100) - Math.floor((3 * M / 10 - 140) ** 2 / 100));
  return [acc / 100, dmg / 100];
}

/** A player's scythe numbers against her Defence level: [chance per hitsplat, max hit]. */
const ringOn = (set, p) => (p.lb ? { ...set, ring: 'Lightbearer' } : set);   // on Lightbearer: no Ultor ring
function scythe(p, defLvl) {
  const b = bonuses(ringOn(worn(p.gear, 'melee', 'Scythe of vitur'), p));
  const [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(118 * pa) + 8, es = Math.floor(118 * ps) + 3 + 8;
  const mx = Math.floor((es * (b.str + 64) + 320) / 640);
  return [hit_chance(ea * (b.atk[1] + 64), defRoll(defLvl, 'melee')), mx];
}

/** A player's melee numbers with a weapon against her Defence: [chance, max]. idx 1 slash / 2 crush; acc multiplier. */
function melee(p, weapon, idx, defLvl, accMult = 1) {
  const b = bonuses(ringOn(worn(p.gear, 'melee', weapon), p));
  const [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(118 * pa) + 8, es = Math.floor(118 * ps) + 3 + 8;
  const mx = Math.floor((es * (b.str + 64) + 320) / 640);
  return [hit_chance(Math.floor(ea * (b.atk[idx] + 64) * accMult), defRoll(defLvl, 'melee')), mx];
}
/** Dragon claws (Slice and Dice): the four hits. */
function clawSpec(p, defLvl, rng) {
  const [ch, mx] = melee(p, 'Dragon claws', 1, defLvl);
  for (let k = 0; k < 4; k++) {
    if (rng.random() >= ch) continue;
    if (k === 0) { const x = rng.randint(Math.floor(mx / 2), mx - 1); return [x, Math.floor(x / 2), Math.floor(x / 4), Math.floor(x / 4) + 1]; }
    if (k === 1) { const x = rng.randint(Math.floor(3 * mx / 8), Math.floor(7 * mx / 8)); return [0, x, Math.floor(x / 2), Math.floor(x / 2) + 1]; }
    if (k === 2) { const x = rng.randint(Math.floor(mx / 4), Math.floor(3 * mx / 4)); return [0, 0, x, x + 1]; }
    return [0, 0, 0, rng.randint(Math.floor(mx / 4), Math.floor(5 * mx / 4))];
  }
  return rng.random() < 2 / 3 ? [1, 1, 0, 0] : [0, 0, 0, 0];
}
// ---- specs: what each player specs in each phase (P1, P2, P3) - {spec: 'none' | 'maul' | 'bgs' | 'claws' | 'zcb', backup,
// horn}. BGS (Bandos godsword) works as a maul (a Defence spec); a player set to Maul with a BGS but no maul uses the BGS.
// ifBarrage (P1 maul / BGS only): 'zcb' | 'claws' | 'none' - a Shadow Barrage prefire that landed turns it into a
// first backup: scythe first; once the mauls land, maul if none hit, else this spec (see the Barrage rule in chooseAct).
// Planned (not backup) specs go off as early as possible: mauls on their first attack of the phase, ZCB specs
// and claws on their next attack after the phase's mauls have landed (players react to the hit, they can't see PID). A spec they can't afford
// yet waits for a regen. Backup: scythe first; once the phase's mauls (and any earlier player's backup) have landed:
// maul if her Defence isn't at the floor, otherwise their spec (a ZCB may wait for a regen; maul / none: nothing).
// Horn (Soulflame horn, 25%, no attack delay): the caster and the first other player with a planned maul that phase
// can't miss their next melee hit (10 ticks). Phase 1: on t8 (after the prefire, running in). Phases 2-3: after their
// first scythe off the maze (not in the stall) - the caster and that player then maul.
export const SPECS = [['none', 'None'], ['maul', 'Maul'], ['bgs', 'BGS'], ['claws', 'Claws'], ['zcb', 'ZCB']];
export const SPEC_COST = { maul: 50, bgs: 50, claws: 50, zcb: 75, horn: 25 };
const S_ = (spec, o = {}) => ({ spec, backup: false, horn: false, ...o });
/** The default specs (players 1-5), by scale: 5s - P1 horns and mauls P1, mauls P2; P2 mauls P1 and P3; P3 / P4 ZCB
 *  in P1 and back up in P3 (ZCB, or a maul if needed); P5 mauls P2 and P3. 4s: the same without P4. 3s: P1 mauls P1
 *  and P2, P2 P1 and P3, P3 P2 and P3. Duos: both maul in P1; A mauls P2, B P3 - if both P1 mauls miss, A backs up
 *  (duoBackup); if that misses too, they swap: B mauls P2, A camps Lightbearer to maul P3. Solos: a maul landed each
 *  phase - another while they have the spec, until one hits (untilHit). */
export function defaultSpecs(team) {
  const A = [S_('maul', { horn: true }), S_('maul'), S_('none')], B = [S_('maul'), S_('none'), S_('maul')];
  const C = [S_('zcb'), S_('none'), S_('zcb', { backup: true })], E = [S_('none'), S_('maul'), S_('maul')];
  if (team >= 5) return [A, B, C, C, E];
  if (team === 4) return [A, B, C, E];
  if (team === 2) return [[S_('maul', { duoBackup: true }), S_('maul'), S_('none')], [S_('maul'), S_('none'), S_('maul')]];
  if (team === 1) return [[S_('maul', { untilHit: true }), S_('maul', { untilHit: true }), S_('maul', { untilHit: true })]];   // solos: a maul landed each phase
  return [[S_('maul'), S_('maul'), S_('none')], [S_('maul'), S_('none'), S_('maul')], [S_('none'), S_('maul'), S_('maul')]].slice(0, team);
}
/** The default setup that goes with them (prefire, start spec, surge): 5s / 4s - P1 and P2 Twisted bow, the rest a ZCB
 *  (lines them up for the flinch); the ZCB players in P1 start on 95; P1 and those two surge. 3s: Twisted bows. */
export function defaultSetup(team) {
  const specs = defaultSpecs(team);
  return specs.map((sp, i) => {
    if (team < 4) return { prefire: 'Twisted bow', startSpec: 100, surge: false };
    const zcb1 = sp[0].spec === 'zcb';
    return { prefire: i < 2 ? 'Twisted bow' : 'ZCB auto', startSpec: zcb1 ? 95 : 100, surge: i === 0 || zcb1 };
  });
}
const ROLES = ['A', 'B', 'C', 'D', 'E'];
export const HORN_TICK = 8;                                       // a phase 1 horn: after the prefire, while running in
export const ORB_DOWN_AT = 0.09;  // a redemption skipper orbs down regardless once she's within 9% (of her HP) of the maze
export const ZCB_MARGIN = 100;    // P1 / P2: no ZCB unless its ruby (+ this for the team's hits as it flies) fits before the maze
// ---- the death ball: every 11th magic attack (after 10 magic orbs - melees and splits don't count) is a ball at a
// random player instead. She skips her next attack, attacks as normal after that, and the ball lands on the tick of what
// would be her third attack after it. Its damage is shared by the players standing on it (by players alive / sharing):
export const BALL = { 5: { 5: 14, 4: 21, 3: 38, 2: 87, 1: 350 }, 4: { 4: 17, 3: 31, 2: 70, 1: 280 }, 3: { 3: 23, 2: 52, 1: 210 }, 2: { 2: 35, 1: 140 }, 1: { 1: 70 } };
export const BALL_EVERY = 10, BALL_LANDS = 15;
export const CLAW_BELOW = 450;   // P3: a planned ZCB becomes claws once she's below this HP (the ruby's 22% is small by then)
export const HORN_COST = 25, HORN_TICKS = 10, SURGE = 25, ZCB_SPEC = 75, ZCB_DELAY = 2;
// ZCB spec (75%): double accuracy, guaranteed ruby bolt (22% of her HP, max 110), lands 2 ticks later (assumed), 5-tick
// attack; not a melee (no melee from her off it). Surge: +25% spec, straight after their first spec (once).

/** A prefire's numbers: {ch, mx, kind}. Ranged on Rigour (+20% acc, +23% str), magic on Augury (+25% acc, +4% dmg). */
export function prefireNumbers(p, kind, defLvl) {
  const pf = PREFIRE[kind];
  const { set } = bestWorn(p.gear, pf.style, pf.weapon), b = bonuses(set);
  if (pf.style === 'range') {
    const v = b.eliteVoid ? [1.10, 1.125] : [1, 1];
    const ea = Math.floor((Math.floor(RANGED * 1.20) + 8) * v[0]), es = Math.floor((Math.floor(RANGED * 1.23) + 8) * v[1]);
    let roll = ea * (b.atk[4] + 64), mx = Math.floor(0.5 + es * (b.rstr + 64) / 640);
    if (pf.weapon === 'Twisted bow') { const [a, d] = tbowMult(SOTE.mag); roll = Math.floor(roll * a); mx = Math.floor(mx * d); }
    if (pf.spec) roll *= 2;                                           // ZCB spec: double accuracy
    return { ch: hit_chance(roll, defRoll(defLvl, 'range')), mx, style: 'range', ruby: pf.weapon === 'Zaryte crossbow' };
  }
  const ea = Math.floor(99 * 1.25) + 8;
  if (pf.weapon === "Tumeken's shadow") {
    const a = b.atk[3] * 3 + (ITEMS["Tumeken's shadow"].atk[3]) * 0;   // worn magic attack (staff included) x3
    const d = Math.min(100, b.mdmg * 3);
    const mx = Math.floor((Math.floor(99 / 3) + 1) * (100 + d + 4) / 100);
    return { ch: hit_chance(ea * (a + 64), defRoll(defLvl, 'mage')), mx, style: 'mage' };
  }
  const mx = Math.floor(28 * (100 + b.mdmg + 4) / 100);             // Shadow Barrage, base 28
  return { ch: hit_chance(ea * (b.atk[3] + 64), defRoll(defLvl, 'mage')), mx, style: 'mage', drain: true };
}

/** Player defence roll against her attack style (Piety / Zeal +25% Defence; magic defence 70% Magic + 30% Defence). */
function playerDef(p, style) {
  const set = worn(p.gear, 'melee', 'Scythe of vitur'), b = bonuses(set);
  const d = Math.floor(118 * 1.25);
  if (style === 'mage') return (Math.floor(99 * 0.7 + d * 0.3) + 8) * (b.dfn[3] + 64);
  return (d + 8) * (b.dfn[style === 'range' ? 4 : 2] + 64);
}

/** Her 4-tick instance (0-3) on room tick t for a room entered on instance `entry` (0-3): entering on i0, tick 27
 *  (16.2s) is i0 and tick 38 (22.8s) is i3. Only shifts the maze cycle. A maze proc on i3 loses no ticks; on i2 1, i1 2,
 *  i0 3 (the runners wait for the i0 to move). */
export const instanceOf = (t, entry = 0) => (t + entry + 1) % 4;
/** Ticks lost at a maze proc on tick t. */
export const ticksLost = (t, entry = 0) => (3 - instanceOf(t, entry) + 4) % 4;
export const SHARK_HEAL = 20, REST_HEAL = 5, UNDER_EAT_BELOW = 85;   // under / running the maze: a shark below 85 HP
// ---- shark skip (one player at most): a player short of phoenix necklaces skips the maze away from the others (no splash either way),
// eating through it. The maze hits land one a tick on m+2..m+8, each sized from their HP then (mazeDmg) and capped at
// it; a shark / Guthix rest eaten on a tick lands before the death check, so a hit that takes them to 0 that tick is
// tick-eaten. What they eat (by their HP at the proc; offsets from m, the i0 they move on): S shark, G Guthix rest.
export const SHARK_SKIP = [[92, { 7: 'S' }], [71, { 6: 'S', 8: 'G' }], [68, { 4: 'S', 7: 'S' }],
  [51, { 0: 'S', 6: 'S', 8: 'G' }], [48, { 0: 'S', 4: 'S', 7: 'S' }], [29, { 0: 'S', 3: 'S', 6: 'S', 8: 'G' }]];
export const SHARK_SKIP_MIN = 29;                                   // below this: a shark + rest on the proc tick (+25)
// ---- redemption skip: with a locator orb they orb themselves down to 1 HP (2 or 3 also work; 1 is best) and stall like
// the others, with Redemption instead of a phoenix necklace: every queued hit is capped at that HP and Redemption heals
// 24 once. Nothing clears their queue, so they take all 7 ticks of it - a maze hit plus a splash from each other player
// on the maze, every tick: 1 HP -> 18 (duo), 11 (trio), 4 (4s); 5s would kill them (not done there). Then a restore
// sip for their prayer (one a maze), so they swing a tick later than the stallers (m+11).
export const REDEMPTION_HP = 1;
export function redemptionSkip(hp, team, runners = team - 1) {
  const n = STALL_TICKS * Math.max(1, runners);                       // each tick: their maze hit + a splash from each other runner
  const end = hp + REDEMPTION_HEAL - n * hp;
  return { hp: end, dead: end <= 0 };
}
/** Default way across each maze, by phoenix necklaces: 2+ both on a necklace; 1 - with a locator orb (1-4s) a necklace
 *  then a redemption skip (vengs the first phase freely), else a shark skip then the necklace; none - redemption skips
 *  with a locator orb, else shark skips. Solos: a necklace before a redemption skip. */
export function defaultMazes(pnecks, locator, team) {
  if (team === 1) return ['redemption', 'redemption'];   // solos always redemption skip
  const red = locator && team <= 4;
  if (pnecks >= 2) return ['pneck', 'pneck'];
  if (pnecks === 1) return red ? ['pneck', 'redemption'] : ['shark', 'pneck'];
  return red ? ['redemption', 'redemption'] : ['shark', 'shark'];
}
export const MAZE_HOW = [['pneck', 'Pneck'], ['redemption', 'Redemption'], ['shark', 'Shark'], ['run', 'Run']];
export const sharkSkipEats = (hp) => (SHARK_SKIP.find(([lo]) => hp >= lo) || [0, null])[1];

/**
 * One raid of Sotetseg with maze skips. players: [{name, gear (Gear tab player), prefire ('' or a PREFIRE key),
 * pnecks, sharks, rests?, restores?, prefire?, surge?, startSpec?, specs? ([P1, P2, P3] - see SPECS; default
 * defaultSpecs()), lbCycles? (spec regens on Lightbearer, then Ultor), mazes? (how they
 * cross each maze: ['pneck' | 'redemption' | 'shark' | 'run', ...]; default defaultMazes())}]. opts: {upTo: 1 = stop at the first maze, 2 = the second, 3 = the kill (default); entry: room entry
 * instance 0-3 (default 0); splitBall: everyone shares the death ball when they all can take it, otherwise the target
 * tick-eats it alone (default true; false: always the target alone; duos never split it); stallTick: a target with no Guthix rest is tick-healed
 * (3-tick stall, a teammate's Heal Other) before using a shark (default false); clawBelow: P3 HP below which a planned ZCB becomes claws (default 450); chanceAt: chance veng threshold - after the second maze, at or below this share of her HP
 * players take orbs off prayer for veng whatever their HP (default 0: never)}.
 *
 * Mazes (skip / stall): the hit that reaches 66.6% / 33.3% (tick T) teleports everyone (T..T+4). One random player goes
 * under: no maze damage, first swing on T+19 (lands T+20). The others click on the first i3 from T+4, move on the i4
 * after (m), land on the maze on m+1 and stall 7 ticks (no veng casts), taking the stall damage (stallSkip) as they
 * come out on m+8 (i4). She's attackable on m+9 (i1); the runners attack on m+10 (i2, landing m+11) and her attacks
 * restart then, every 5 ticks. Her Defence resets (and can be drained again). Hits and her attacks still on the way at
 * the proc are dropped (assumed).
 * Returns {end, kill, mazes: [T, T], hp, dmg, orbs, melees, players}.
 */
export function runSote(players, team, rng, log = null, { upTo = 3, entry = 0, chanceAt = 0, clawBelow = CLAW_BELOW, splitBall = true, stallTick = false } = {}) {
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const specsDefault = defaultSpecs(team);
  const MAX = SOTE_HP[team] || 4000;
  const marks = [Math.floor(MAX * MAZE_AT[0]), Math.floor(MAX * MAZE_AT[1]), 0];
  let hp = MAX, defLvl = SOTE.def, drained = false, phase = 0, stopAt = marks[0];
  let blocked = false;                          // she can't be damaged (maze) until `attackable`
  let attackable = 1, nextAttack = FIRST_ATTACK, kill = null, anim = DEATH_ANIM, end = null;
  const back = [];                              // the tick she's interactable again after each maze
  const mazes = [];
  const ev = new Set(), mark = (k) => ev.add(k);   // what happened this raid (the Solver's Adjustments counts)
  const st = { specLog: [], specMissed: [], dmg: { prefire: 0, scythe: 0, maul: 0, bgs: 0, claw: 0, zcb: 0, thrall: 0, veng: 0, ruby: 0 }, specs: { maul: 0, maulHit: 0, bgs: 0, bgsHit: 0, claw: 0, zcb: 0, horn: 0, surge: 0 }, orbs: { taken: 0, prayed: 0, vengd: 0 }, melees: 0, balls: 0, ballSplit: 0, ballEat: 0, ballHeal: 0, sharks: 0, rests: 0, restores: 0, locator: 0, lateOrb: 0, runs: [], stalls: [], sharkSkips: [] };
  const ps = players.map((c, i) => ({ i, name: c.name || `P${i + 1}`, gear: c.gear,
    prefire: c.prefire || '', pnecks: Number(c.pnecks ?? 0), sharks: Number(c.sharks ?? 0), spec: Number(c.startSpec ?? 100),
    surgePlan: !!c.surge, regen: 0, specs: [0, 1, 2].map((k) => ({ ...S_('none'), ...((c.specs || specsDefault[i] || [])[k] || {}) })), hornDone: [false, false, false],
    hornUntil: -1, surged: false, surgeAt: null, zcbCarry: -1, vengPops: [0, 0, 0], orbedDown: -1, rests: Number(c.rests ?? 0), restores: Number(c.restores ?? 3), sharkMazes: [], redeemNow: false, cycleAfter: 0, lb: false, lbLeft: Number(c.lbCycles || 0), lbOffAt: null, specDone: [0, 0, 0], swings: [0, 0, 0],
    role: c.role || ROLES[i], mauled: [0, 0, 0], thrallNext: null, hp: 99, dead: false, veng: true, vengReady: 0, noVengUntil: 0, prayOffUntil: 0,
    lastMelee: -9, next: null, pending: [] }));
  for (const p of ps) p.regenHold = p.spec < 100;
  // how each player crosses each maze (redemption: 1-4s with a locator orb, else a stall)
  ps.forEach((p, i) => {
    if (team === 1) { p.gear = { ...p.gear, locator: true }; p.how = ['redemption', 'redemption']; p.sharkMazes = []; p.rests = 0; return; }   // solos always redemption skip; no Guthix rests
    p.how = (players[i].mazes || defaultMazes(p.pnecks, !!p.gear.locator, team)).slice(0, 2)
      .map((h) => (h === 'redemption' && !(p.gear.locator && team <= 4) ? 'pneck' : h));
    p.sharkMazes = [0, 1].filter((k) => p.how[k] === 'shark');
  });
  /** Shark skipping the next maze (they keep their HP for it: no veng orbs, Heal Other to above 50). */
  const sharkNext = (p) => p.sharkMazes.includes(mazes.length);
  /** A redemption skip still to come (they want 1 HP anyway: no Heal Other to them). */
  const redeemAhead = (p) => p.how.slice(mazes.length).includes('redemption');                    // under 100 at the start: first regen the tick after their first spec
  const alive = () => ps.filter((p) => !p.dead);
  // PID: the order players act in each tick (random each raid) - a maul / BGS that hits lowers her Defence as the attack
  // is made, so anyone after them that tick rolls against it, anyone before them doesn't
  const pid = rng.shuffle(ps.slice());
  const spend = (p, n, t) => {
    p.spec -= n; if (p.regenHold) { p.regenHold = false; p.regen = 49; }
    if (p.surgePlan && !p.surged) {                                  // surge straight after their first spec
      const o = p.spec; p.spec = Math.min(100, p.spec + SURGE); p.surged = true; p.surgeAt = t; st.specs.surge++;
      L.on && L(`t${t} ${p.name} surge ${o}% -> ${p.spec}%`);
    }
  };
  let hits = [];                      // [tick, player, amount, label, kind] damage landing on her
  let orbs = [];                      // [tick, player, style, split]
  /** Her attack ticks from `from`: the first one at or after tick t. */
  const herTickFrom = (t) => { let x = nextAttack; while (x < t) x += ATTACK_EVERY; return x; };
  const isHerTick = (x) => x >= nextAttack && (x - nextAttack) % ATTACK_EVERY === 0;
  /** Their next attack after one on tick t with this speed: on time, but never the tick before her attack (the flinch:
   *  she can only melee a player who attacked the tick before) - then a tick later. */
  // duos and solos don't flinch (more melees, fewer magic attacks - fewer death balls) unless a melee through prayer
  // (max 27) could kill them
  const flinches = (p) => team > 2 || !p || p.hp <= Math.floor(MELEE_MAX * 0.6);
  const nextAfter = (t, speed, p) => (flinches(p) && isHerTick(t + speed + 1) ? t + speed + 1 : t + speed);
  const startMaze = (t) => {
    mazes.push(t);
    L.on && L(`t${t} *** MAZE ${mazes.length} (${mazes.length === 1 ? '66.6' : '33.3'}%) ***`);
    blocked = true; hits = []; orbs = []; ball = null; skipAt = -1;   // a death ball on its way is gone too for (const p of ps) { p.pending = []; p.thrallNext = null; }   // thralls stop until they attack again
    defLvl = SOTE.def; drained = false;
    let m = t + 5; while (instanceOf(m, entry) !== 0) m++;           // runners: click on the first i3 from T+4, move on the i0 after
    if (team === 1) m += SOLO_UNDER;                                 // solos: under first, then skip the maze as the runner
    attackable = m + 9; nextAttack = m + 10; back.push(attackable);
    const live = alive(), under = live.length > 1 ? rng.choice(live) : null;
    if (live.some((p) => p.how[mazes.length - 1] === 'run')) { runMaze(t, m, live, under); return; }   // anyone runs: all run
    const runners = live.filter((p) => p !== under);
    const skippers = runners.filter((p) => p.sharkMazes.includes(mazes.length - 1));
    const stallers = runners.filter((p) => !skippers.includes(p));
    for (const p of skippers) {                                       // shark skip: not stalled - veng, attack with the stallers
      p.next = m + 10; p.thrallBack = true;
      if (p.hp < SHARK_SKIP_MIN && p.sharks > 0 && p.rests > 0) {    // a shark + rest on the proc tick
        const old = p.hp; p.hp = Math.min(99, p.hp + SHARK_HEAL + REST_HEAL); p.sharks--; p.rests--; st.sharks++; st.rests++;
        L.on && L(`t${t} ${p.name} eats a shark + Guthix rest for the shark skip: ${old} -> ${p.hp}`);
      }
      const eats = sharkSkipEats(p.hp) || SHARK_SKIP[SHARK_SKIP.length - 1][1];
      pendingSharks.push({ p, m, eats, from: p.hp });
      L.on && L(`t${t} ${p.name} shark skips (HP ${p.hp}): ${Object.entries(eats).map(([o, x]) => `${x === 'S' ? 'shark' : 'rest'} t${m + Number(o)}`).join(', ')}`);
    }
    for (const p of stallers) {
      p.noVengUntil = m + 8;                                         // no veng casts while stalling
      p.stallAt = m + 8; p.next = m + 10; p.thrallBack = true;
      p.redeemNow = p.how[mazes.length - 1] === 'redemption' && p.restores >= 1;   // no restore sip left: a normal stall
      if (p.redeemNow) {                                                 // redemption skip at 1 HP; prayers back a tick late
        if (p.hp > REDEMPTION_HP) { st.lateOrb++; L.on && L(`t${t} ${p.name} wasn't down to ${REDEMPTION_HP} HP at the proc (${p.hp}) - orbs down late`); }
        p.hp = REDEMPTION_HP; p.next = m + 11; continue;
      }
      // in a danger zone for the skip: one shark at most, after the teleport and before stepping on (no eating in the stall)
      if (p.sharks > 0 && stallSkip(p.hp, team, p.pnecks > 0, true, stallers.length).dead) {
        const old = p.hp; p.hp = Math.min(99, p.hp + SHARK_HEAL); p.sharks--; st.sharks++;
        L.on && L(`t${t} ${p.name} eats a shark before the stall: ${old} -> ${p.hp} (${p.sharks} left)`);
      }
    }
    if (under) { under.mazeEatTill = t + 19; under.eatKeep = 1; under.next = t + 19; under.healFrom = t + 20; under.thrallBack = true; L.on && L(`t${t} ${under.name} goes under (first swing t${t + 19}); runners stall t${m + 1}-${m + 7}, off t${m + 8}`); }
    pendingStall = { at: m + 8, runners: stallers };
  };
  let pendingStall = null, pendingSharks = [];
  let magicCount = 0, ball = null, skipAt = -1;
  const maulHits = [0, 0, 0];                       // mauls that hit, by phase     // the death ball: magic attacks since the last one, the ball in flight, her skipped attack
  /** Running the maze (everyone, if anyone picked Run): a real maze is rolled. Everyone's first move is on T+5. The
   *  player under (teleported to column 6, two south of row A) reaches the first tile in 1-3 ticks by its column - a
   *  light shows there - and runs the best route from the next tick (a tick later on columns 12-13, so the runners are
   *  no more than 3 ticks behind). Runners: south of 3A on T+5, south of 5A on T+6, then from the tick after the light
   *  to the first tile (1-4 ticks by column) and along the same route; on row N they wait and click off on the next i3,
   *  are off on the i0, she's attackable on the i1 and everyone swings on the i2. No maze damage; veng allowed; a shark
   *  whenever below 85 HP. */
  const runMaze = (t, mSkip, live, under) => {
    const mz = rollMaze(rng), u = underToStart(mz.start), r = runnersToStart(mz.start);
    const light = t + 4 + u, leave = Math.max(t + 7, light + 1), onFirst = leave + r - 1;
    const go = light + 1 + (r > 3 ? 1 : 0), onN = onFirst + mz.toN;
    let c = onN; while (instanceOf(c, entry) !== 3) c++;
    attackable = c + 2; nextAttack = c + 3; back[back.length - 1] = attackable;
    for (const p of live) { p.next = c + 3; p.thrallBack = true; p.mazeEatTill = c + 3; p.eatKeep = 0; p.noVengUntil = 0; }
    if (under) under.healFrom = c + 3;
    const lost = (c + 1) - (mSkip + 8);
    st.runs.push({ start: mz.start, ticks: mz.ticks, off: c + 1, lost });
    L.on && L(`t${t} maze ${mazes.length} RUN: first tile column ${mz.start}, best route ${mz.ticks} ticks (seed ${mz.seed.join(' ')}); ${under ? `${under.name} on the first tile t${light}, runs t${go}-t${go + mz.ticks - 1}; ` : ''}runners on the first tile t${onFirst}, row N t${onN}, click off t${c} (i3), off t${c + 1}, swing t${c + 3} - ${lost} ticks after a skip`);
  };
  /** Would this player die on the skip at this HP? */
  const stallDead = (h, p, runners) => stallSkip(h, team, p.pnecks > 0, true, runners).dead;
  const damage = (t, amt, label, kind) => {
    if (blocked || kill != null || amt <= 0) return;
    const real = Math.min(amt, hp - stopAt);
    hp -= real; st.dmg[kind] += real;
    L.on && L(`t${t} ${label} ${amt}${real < amt ? ` (stops at ${real})` : ''} -> Sotetseg ${hp}`);
    if (hp > stopAt) return;
    if (phase < 2) {
      closePhase(phase); phase++; stopAt = marks[phase];
      if (mazes.length + 1 >= upTo) { mazes.push(t); blocked = true; return; }   // stopping here (upTo)
      startMaze(t); return;
    }
    kill = t; closePhase(2); L.on && L(`t${t} *** SOTETSEG DIES ***`);
  };
  // ---- prefires; first scythes on 11 (lined up on her attack ticks)
  for (const p of ps) {
    let after = 0;
    if (p.prefire === 'ZCB spec' && p.spec < PREFIRE['ZCB spec'].spec) p.prefire = 'ZCB auto';   // not enough spec for it
    if (p.prefire && PREFIRE[p.prefire]) {
      const pf = PREFIRE[p.prefire];
      if (pf.spec) { spend(p, pf.spec, pf.tick); st.specs.zcb++; }   // a ZCB spec prefire costs its 75% (a surge after it, as any first spec)
      hits.push([pf.tick + pf.delay, p, null, `prefire ${p.prefire}`, p.prefire]);
      after = pf.tick + 5;
      p.thrallNext = pf.tick + 1 + rng.randint(1, 2);             // thrall summoned after the prefire
    }
    let t = FIRST_ATTACK + ATTACK_EVERY; while (t < after) t += ATTACK_EVERY;
    p.next = t;
    if (p.thrallNext == null) p.thrallBack = true;                  // no prefire: thrall with their first attack
  }
  const vengHit = (t, p, dmg, src) => {
    if (!p.veng || dmg <= 0) return;
    p.veng = false; p.vengPops[mazes.length]++;
    damage(t, Math.floor(dmg * 0.75), `${p.name} veng (${src} ${dmg})`, 'veng');
  };
  /** A phoenix necklace just procced: with more sharks than mazes still to come, they eat one the same tick (+20);
   *  otherwise the sharks are kept for a dangerous stall. */
  const afterPneck = (t, p) => {
    if (p.sharks > 2 - mazes.length) {
      const old = p.hp; p.hp = Math.min(99, p.hp + SHARK_HEAL); p.sharks--; st.sharks++;
      L.on && L(`t${t} ${p.name} eats a shark with the phoenix necklace: ${old} -> ${p.hp} (${p.sharks} left)`);
    }
  };
  /** Damage to a player outside a stall (phoenix necklaces are only worn for the stalls - they're needed to cross the maze). */
  const hurt = (t, p, d) => {
    p.hp -= d;
    if (p.hp <= 0) { p.dead = true; L.on && L(`t${t} ${p.name} dies`); }
  };
  /** Which of the orbs heading at a player (landing from tick `from`) they can pray against: prayer has to be on - an orb
   *  that hits them unprayed turns it off until 5 ticks later; a prayed one doesn't.
   *  Returns {ticks, unprayed}. */
  const prayPlan = (p, from, offUntil) => {
    const xs = orbs.filter((o) => o[1] === p && o[0] >= from).map((o) => o[0]).sort((a, b) => a - b);
    const ticks = new Set(); let unprayed = 0, off = offUntil;
    for (const x of xs) {
      if (x >= off && !ticks.has(x)) ticks.add(x);
      else { unprayed++; off = Math.max(off, x + PRAYER_OFF + 1); }
    }
    return { ticks, unprayed };
  };
  // ---- specs (see SPECS): what a player does on their attack tick
  const specHitPending = (q) => hits.some((h) => h[1] === q && (h[4] === 'maul' || h[4] === 'zcb' || h[4] === 'claw'));
  const anyMaulPending = () => hits.some((h) => h[4] === 'maul');
  const isDef = (x) => x === 'maul' || x === 'bgs';                  // a Defence spec (Elder maul / Bandos godsword)
  const condMaul = (q, ph) => ph === 0 && !!q.specs[0].ifBarrage && isDef(q.specs[0].spec) && !q.specs[0].backup;
  const anyCond = ps.some((q) => condMaul(q, 0));
  const plannedMaul = (q, ph) => isDef(q.specs[ph].spec) && !q.specs[ph].backup && !(condMaul(q, ph) && drained);   // a Barrage that landed: a conditional maul waits
  /** The Defence spec they'd use: the one picked if they have it, else the other one. */
  const defAct = (q, want) => { const own = (w) => (q.gear.weapons || []).includes(w); return want === 'bgs' ? (own('Bandos godsword') ? 'bgs' : own('Elder maul') ? 'maul' : null) : (own('Elder maul') ? 'maul' : own('Bandos godsword') ? 'bgs' : null); };
  const hornRecipient = (c, ph) => alive().find((q) => q !== c && plannedMaul(q, ph));
  const castHorn = (c, t, ph) => {
    const rec = hornRecipient(c, ph);
    L.on && L(`t${t} ${c.name} Soulflame horn (${c.spec - HORN_COST}% left): ${c.name}${rec ? ` and ${rec.name}` : ''} can't miss their next hit (to t${t + HORN_TICKS})`);
    spend(c, HORN_COST, t); st.specs.horn++; c.hornDone[ph] = true; st.specLog.push({ i: c.i, ph, kind: 'horn', t });
    c.hornUntil = t + HORN_TICKS; if (rec) rec.hornUntil = t + HORN_TICKS;
  };
  /** Waiting on a phase 2 / 3 horn (theirs, or one that buffs them): they scythe until it's up. */
  const hornWait = (p, ph) => ph > 0 && alive().some((c) => c.specs[ph].horn && !c.hornDone[ph] && c.spec >= HORN_COST && (c === p || hornRecipient(c, ph) === p));
  const chooseAct = (p, t, ph, has) => {
    let sp = p.specs[ph]; const floorNow = defLvl <= SOTE.defFloor;
    // a Barrage that landed + a maul that landed: her Defence is low enough - backups stand down (only with a conditional maul set)
    const enough = floorNow || (ph === 0 && anyCond && drained && maulHits[0] > 0);
    if (ph === 2 && sp.spec === 'zcb' && hp < clawBelow && has('Dragon claws')) { sp = { ...sp, spec: 'claws' }; if (!p.specDone[2]) mark(`clawsForZcb:${p.i}`); }   // late P3: claws over a ZCB
    // a phase 2 / 3 horn: after their first scythe off the maze, free (then the maul)
    if (ph > 0 && sp.horn && !p.hornDone[ph] && p.swings[ph] >= 1 && p.spec >= HORN_COST) castHorn(p, t, ph);
    const mauls = (q) => plannedMaul(q, ph) && !q.mauled[ph] && q.spec >= 50 && !!defAct(q, q.specs[ph].spec);
    // P1 / P2: a ZCB's ruby (22% of her HP, max 110) would be cut short by the maze - wasted. They keep it for the start of
    // the next phase instead (after its mauls).
    const zcbWasted = ph < 2 && hp - stopAt < Math.min(110, Math.floor(hp * 0.22)) + ZCB_MARGIN;
    if (p.zcbCarry === ph && !alive().some(mauls) && p.spec >= ZCB_SPEC && has('Zaryte crossbow') && !zcbWasted) { p.zcbCarry = -1; return 'zcbCarry'; }
    if (condMaul(p, ph) && drained) {
      // the Barrage landed: scythe first, wait on the mauls; none hit -> maul (first backup), one hit -> their damage spec
      if (p.specDone[0] || !p.swings[0] || alive().some(mauls) || anyMaulPending()) return 'scythe';
      if (!maulHits[0]) { const a = defAct(p, sp.spec); if (p.spec >= 50 && a) { mark(`cond:${p.i}:maul2`); return a; } p.specDone[0]++; return 'scythe'; }
      const alt = sp.ifBarrage;
      if (alt === 'zcb' && has('Zaryte crossbow')) { if (zcbWasted) { p.specDone[0]++; return 'scythe'; } if (p.spec < ZCB_SPEC) return 'scythe'; mark(`cond:${p.i}:zcb`); return 'zcb'; }
      if (alt === 'claws' && has('Dragon claws')) { if (p.spec < 50) return 'scythe'; mark(`cond:${p.i}:claws`); return 'claw'; }
      mark(`cond:${p.i}:none`); p.specDone[0]++; return 'scythe';
    }
    if (!sp.backup) {
      if (condMaul(p, ph) && !p.mauled[0] && p.spec >= 50 && defAct(p, sp.spec)) mark(`cond:${p.i}:maul1`);   // the Barrage missed (or none): maul first hit
      if (isDef(sp.spec) && !p.mauled[ph] && defAct(p, sp.spec)) return p.spec >= 50 && !hornWait(p, ph) ? defAct(p, sp.spec) : 'scythe';
      // until one lands (solos): another maul once the last has landed and missed
      if (sp.untilHit && isDef(sp.spec) && p.mauled[ph] >= 1 && !maulHits[ph] && !anyMaulPending() && p.spec >= 50 && defAct(p, sp.spec)) return defAct(p, sp.spec);
      // duos: both P1 mauls missed - one backup maul once they've landed
      if (sp.duoBackup && p.mauled[ph] === 1 && !alive().some(mauls) && !anyMaulPending() && !maulHits[ph] && p.spec >= 50 && defAct(p, sp.spec)) { p.duoBackingUp = true; return defAct(p, sp.spec); }
      if (p.specDone[ph] || sp.spec === 'none') return 'scythe';
      if (sp.spec === 'zcb') {
        if (alive().some(mauls) || anyMaulPending() || p.spec < ZCB_SPEC || !has('Zaryte crossbow')) return 'scythe';   // their next attack after the mauls land (they react - nobody sees PID)
        if (zcbWasted) { p.specDone[ph]++; p.zcbCarry = ph + 1; mark(`zcbCarry:${p.i}:${ph}`); L.on && L(`t${t} ${p.name} keeps their ZCB spec for the start of P${ph + 2} (P${ph + 1} too close to the maze)`); return 'scythe'; }
        return 'zcb';
      }
      if (sp.spec === 'claws') return !alive().some(mauls) && !anyMaulPending() && p.spec >= 50 && has('Dragon claws') ? 'claw' : 'scythe';
      return 'scythe';
    }
    // backup: scythe first; once the mauls (and earlier backups, if she still isn't at the floor) have landed
    if (p.specDone[ph] || !p.swings[ph] || alive().some(mauls) || anyMaulPending()) return 'scythe';
    if (!enough && alive().some((q) => condMaul(q, ph) && drained && !q.specDone[0])) return 'scythe';   // the first backup (conditional maul) goes first
    if (!enough && alive().some((q) => q.i < p.i && q.specs[ph].backup && (!q.specDone[ph] || specHitPending(q)))) return 'scythe';
    if (!enough) { const a = defAct(p, sp.spec === 'bgs' ? 'bgs' : 'maul'); if (p.spec >= 50 && a) { mark(`backup:${p.i}:${ph}:maul`); return a; } p.specDone[ph]++; return 'scythe'; }
    if (sp.spec !== 'none' && sp.spec !== 'maul' && sp.spec !== 'bgs') mark(`backup:${p.i}:${ph}:spec`);
    if (sp.spec === 'zcb' && has('Zaryte crossbow')) { if (zcbWasted) { p.specDone[ph]++; return 'scythe'; } return p.spec >= ZCB_SPEC ? 'zcb' : 'scythe'; }   // a ZCB may wait for a regen
    if (sp.spec === 'claws' && has('Dragon claws')) return p.spec >= 50 ? 'claw' : 'scythe';
    p.specDone[ph]++; return 'scythe';                               // at the floor, nothing else planned
  };
  /** Could she melee them this tick or the next (they attack the tick before one of her attacks), or is a melee hit on
   *  its way? Nobody drops to low HP then. */
  const meleeable = (p, t) => p.pending.length > 0 || (p.lastMelee === t - 1 && isHerTick(t)) || (p.next === t && isHerTick(t + 1));   // incl. a melee on its way
  /** A maul / BGS hit lowers her Defence (floor 100). */
  const lowerDef = (t, what, by) => {
    if (defLvl <= SOTE.defFloor) return;
    defLvl = Math.max(SOTE.defFloor, defLvl - by);
    L.on && L(`t${t} ${what} lowers her Defence -> ${defLvl}`);
  };
  /** A phase ends: planned specs (and horns) that never went off. */
  const closePhase = (ph) => {
    for (const q of alive()) {
      const sp = q.specs[ph];
      if (sp.spec === 'zcb' && !sp.backup && !q.specDone[ph] && ph < 2) {    // a P1 / P2 ZCB that never went off: start of the next phase
        q.zcbCarry = ph + 1; L.on && L(`${q.name}'s P${ph + 1} ZCB spec moves to the start of P${ph + 2}`); continue;
      }
      if (ph === 2 && q.zcbCarry === 2) st.specMissed.push({ i: q.i, ph: 1, kind: 'zcb' });
      if (sp.spec !== 'none' && !sp.backup && !q.specDone[ph]) st.specMissed.push({ i: q.i, ph, kind: sp.spec });
      if (sp.horn && !q.hornDone[ph]) st.specMissed.push({ i: q.i, ph, kind: 'horn' });
    }
  };
  for (let t = 1; t <= 1000 && !(mazes.length >= upTo) && kill == null; t++) {
    if (blocked && t >= attackable) blocked = false;
    // ---- coming out of a stall: the stall damage, in order (a phoenix necklace clears the rest)
    // ---- in the maze, the player under (and everyone, running it) eats: a shark whenever below 85 HP (one every 3 ticks,
    // none that would push their first swing back); under while the others skip, they keep one shark back just in case
    for (const p of alive()) {
      if (!(p.mazeEatTill > t) || t + 3 > p.mazeEatTill || t < (p.eatReady || 0) || p.hp >= UNDER_EAT_BELOW || p.sharks <= (p.eatKeep || 0)) continue;
      const old = p.hp; p.hp = Math.min(99, p.hp + SHARK_HEAL); p.sharks--; st.sharks++; p.eatReady = t + 3;
      L.on && L(`t${t} ${p.name} eats a shark in the maze: ${old} -> ${p.hp} (${p.sharks} left)`);
    }
    // ---- shark skips: a maze hit a tick on m+2..m+8 (sized from their HP, capped at it), food after it (tick eat)
    for (const sk of pendingSharks) {
      const { p, m, eats } = sk, o = t - m;
      if (p.dead || o < 0 || o > 8) continue;
      if (o >= 2) { const d = Math.min(mazeDmg(p.hp), p.hp); p.hp -= d; L.on && L(`t${t} ${p.name} maze hit ${d} (HP ${p.hp})`); }
      const x = eats[o];
      if (x === 'S' && p.sharks > 0) { p.sharks--; st.sharks++; p.hp = Math.min(99, p.hp + SHARK_HEAL); L.on && L(`t${t} ${p.name} eats a shark (HP ${p.hp}, ${p.sharks} left)`); }
      if (x === 'G' && p.rests > 0) { p.rests--; st.rests++; p.hp = Math.min(99, p.hp + REST_HEAL); L.on && L(`t${t} ${p.name} sips a Guthix rest (HP ${p.hp})`); }
      if (p.hp <= 0) { p.dead = true; L.on && L(`t${t} ${p.name} dies on the shark skip`); }
      if (o === 8 || p.dead) st.sharkSkips.push({ hp: sk.from, after: p.hp, dead: p.dead });
    }
    pendingSharks = pendingSharks.filter((sk) => !sk.p.dead && t - sk.m < 8);
    if (pendingStall && t === pendingStall.at) {
      for (const p of pendingStall.runners.filter((q) => !q.dead)) {
        const nRun = pendingStall.runners.filter((q) => !q.dead).length;
        if (p.redeemNow) {                                            // redemption skip: no phoenix necklace
          const before = p.hp, r = redemptionSkip(p.hp, team, nRun);
          p.hp = r.hp; if (r.dead) p.dead = true; else { p.restores--; st.restores++; p.sipReady = t + 3; }
          p.redeemNow = false;
          st.stalls.push({ hp: before, after: r.hp, pneck: false, dead: r.dead, redemption: true });
          L.on && L(`t${t} ${p.name} out of the stall (Redemption): ${before} -> ${r.dead ? 'DEAD' : r.hp}, sips a restore (${p.restores} left)`);
          continue;
        }
        const before = p.hp, r = stallSkip(p.hp, team, p.pnecks > 0, true, nRun);
        p.hp = r.hp; if (r.pneck) p.pnecks--;
        if (r.dead) p.dead = true;
        st.stalls.push({ hp: before, after: r.hp, pneck: r.pneck, dead: r.dead });
        L.on && L(`t${t} ${p.name} out of the stall: ${before} -> ${r.dead ? 'DEAD' : r.hp}${r.pneck ? ' (phoenix necklace)' : ''}`);
        if (r.pneck) afterPneck(t, p);
      }
      pendingStall = null;
    }
    // ---- phase 1 horns on t8 (after the prefire, while running in)
    if (t === HORN_TICK) for (const c of alive()) if (c.specs[0].horn && c.spec >= HORN_COST) castHorn(c, t, 0);
    // ---- veng casts: own first, else on a teammate without one (only if the caster's own is up)
    for (const p of alive()) {
      if (t < p.vengReady || t < p.noVengUntil) continue;
      if (!p.veng) { p.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} casts veng`); continue; }
      const other = alive().find((q) => q !== p && !q.veng && t < q.vengReady && t >= q.noVengUntil);
      if (other) { other.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} casts veng on ${other.name}`); }
    }
    // ---- Heal Other (75% of the caster's HP, capped at the target's missing HP; no attack delay): only in an attack phase
    // (never between a proc and the stall); the under player not until after their first swing after the maze.
    // Between the mazes, a shark skipper below 51 before their second skip comes first (so the second skip takes 2 sharks, not 3): anyone heals
    // them, even a player who could veng safely, and heals can add up; the caster may go below 17 / into stall danger if
    // they still have a shark for the stall that gets them through it. Otherwise -
    // Caster: not one who can veng safely themselves (veng up and above 50). Target (lowest HP first), only if the heal:
    //  - lifts a teammate with veng up from 50 or less to above 50 (so they can veng safely) - one with an orb heading at
    //    them, or
    //  - with a maze still to come, takes a teammate out of a stall-danger HP (a shark skipper: to above 50), or
    //  - lifts a teammate with orbs coming they can't pray (a close pair) above what those can hit.
    // The caster won't go to 50 or less with orbs coming at them they can't pray; before the second maze not below 17, or
    // into a stall-danger HP.
    if (!blocked) {
      const after2 = mazes.length >= 2, targeted = new Set(orbs.filter((o) => o[0] >= t).map((o) => o[1]));
      const runnersNext = alive().length - 1;
      for (const c of alive()) {
        if (t < (c.healFrom || 0)) continue;
        const vengSafe = c.veng && c.hp > ORB_MAX;                      // can veng safely: only heals a shark skipper back up
        if (c.keptForMaze === mazes.length) continue;                  // healed out of stall danger: they keep that HP
        const cUnprayed = prayPlan(c, t, c.prayOffUntil).unprayed;
        const pairNeed = (q) => ORB_MAX * prayPlan(q, t, q.prayOffUntil).unprayed;   // HP an unprayable pair can take
        // maze danger: a staller who'd die on the stall; a shark skipper at 50 or less (more than 2 sharks for the skip)
        const mazeDanger = (q, h) => (q.how[mazes.length] === 'redemption' ? false : sharkNext(q) ? h <= ORB_MAX : stallDead(h, q, runnersNext));   // a redemption skipper orbs down anyway
        const skipUp = (q) => (mazes.length === 1 && sharkNext(q) && q.hp <= ORB_MAX ? 1 : 0);   // between the mazes: a shark skipper still to reach 51+
        const cands = alive().filter((q) => q !== c && !redeemAhead(q) && (   // a redemption skipper wants 1 HP
          (q.veng && q.hp <= ORB_MAX && targeted.has(q)) || (!after2 && mazeDanger(q, q.hp)) || q.hp <= pairNeed(q)))
          .sort((a, b) => (skipUp(b) - skipUp(a)) || a.hp - b.hp);      // a shark skipper first, then lowest HP
        for (const q of cands) {
          const give = Math.min(Math.floor(c.hp * 0.75), 99 - q.hp), left = c.hp - give;
          if (give <= 0 || left <= 0) continue;
          const vengGain = q.veng && q.hp <= ORB_MAX && targeted.has(q) && q.hp + give > ORB_MAX;
          const mazeGain = !after2 && mazeDanger(q, q.hp) && !mazeDanger(q, q.hp + give);
          const pairGain = q.hp <= pairNeed(q) && q.hp + give > pairNeed(q);
          const skipGain = skipUp(q) === 1;                            // any heal toward 51 (more casters can finish it)
          if (!vengGain && !mazeGain && !pairGain && !skipGain) continue;   // no gain
          if (vengSafe && !skipGain) continue;
          if (cUnprayed && left <= ORB_MAX * cUnprayed) continue;      // orbs coming at them they can't pray
          // healing the shark skipper: the caster can drop low if a shark before their stall still gets them through it
          const shark = skipGain && c.sharks > 0 && !mazeDanger(c, Math.min(99, left + SHARK_HEAL));
          if (!after2 && !shark && (left < 17 || mazeDanger(c, left))) continue;
          c.hp = left; q.hp += give;
          if (mazeGain) q.keptForMaze = mazes.length;
          L.on && L(`t${t} ${c.name} heals other ${q.name} (+${give}): ${c.name} ${c.hp}, ${q.name} ${q.hp}`);
          break;
        }
      }
    }
    // ---- before a redemption skip: there's no time to orb down after the proc, so in the phase before it they pop 1-2
    // vengs (1 if the first left them on 50 or less), Heal Other someone with what they have, then locator orb down to
    // 1 HP. The heal: lowest HP first, never to another redemption skipper, never to an HP that dies on the stall.
    // Close to the proc (her last 9% before the maze) they do it anyway. Not with their prayer off (an unprayed orb).
    if (!blocked && mazes.length < 2 && kill == null) {
      const ph = mazes.length, near = hp - stopAt <= MAX * ORB_DOWN_AT;
      for (const p of alive()) {
        if (p.how[ph] !== 'redemption' || p.hp <= REDEMPTION_HP || p.restores < 1 || t < p.prayOffUntil || t < (p.healFrom || 0) || meleeable(p, t)) continue;
        if (p.orbedDown === ph) { p.hp = REDEMPTION_HP; L.on && L(`t${t} ${p.name} locator orbs back down to ${REDEMPTION_HP} HP`); continue; }   // pushed back up (a heal, a tick-eat): down again
        const done = p.vengPops[ph] >= 2 || (p.vengPops[ph] >= 1 && p.hp <= ORB_MAX) || p.hp <= ORB_MAX;
        if (!done && !near) continue;
        const nRun = alive().length - 1;
        for (const q of alive().filter((x) => x !== p && !redeemAhead(x)).sort((a, b) => a.hp - b.hp)) {
          const give = Math.min(Math.floor(p.hp * 0.75), 99 - q.hp);
          if (give <= 0 || stallDead(q.hp + give, q, nRun)) continue;
          p.hp -= give; q.hp += give;
          L.on && L(`t${t} ${p.name} heals other ${q.name} (+${give}) before orbing down: ${p.name} ${p.hp}, ${q.name} ${q.hp}`);
          break;
        }
        L.on && L(`t${t} ${p.name} locator orbs down to ${REDEMPTION_HP} HP for the redemption skip (from ${p.hp}; ${p.vengPops[ph]} veng${p.vengPops[ph] === 1 ? '' : 's'})`);
        p.hp = REDEMPTION_HP; p.orbedDown = ph;
      }
    }
    // ---- locator orb (redemption skippers - after the second maze; in duos, every phase): at 1 HP with Redemption up,
    // the orb hits them for 0 -> Redemption heals them to 25 (a restore sip for their prayer), and they Heal Other the
    // player with veng up below, but closest to, 50 (duos: their partner at 50 or less, so they can veng). Between swings
    // (not on their attack tick, once a swing), only with no orb landing on them in the next 3 ticks, keeping a restore
    // sip for each redemption skip still to come (after their first swing of the phase; sips 3 ticks apart). With a
    // redemption skip next, they orb straight back down to 1 HP.
    if (!blocked && (mazes.length >= 2 || team === 2) && kill == null) {
      const ph = Math.min(mazes.length, 2), keep = (q) => q.how.slice(mazes.length).filter((h) => h === 'redemption').length;
      for (const p of alive().filter((q) => q.gear.locator && q.how.includes('redemption') && q.restores >= 1 + keep(q) && q.hp < REDEMPTION_HP + REDEMPTION_HEAL)) {
        if (t === p.next || meleeable(p, t) || t < p.cycleAfter || t < (p.sipReady || 0) || !p.swings[ph] || t < (p.healFrom || 0) || t < p.noVengUntil) continue;
        if (orbs.some((o) => o[1] === p && o[0] >= t && o[0] <= t + 3)) continue;
        const q = team === 2 ? alive().find((x) => x !== p && x.hp <= ORB_MAX && !redeemAhead(x)) : alive().filter((x) => x !== p && x.veng && x.hp < ORB_MAX).sort((a, b) => b.hp - a.hp)[0];
        if (!q) continue;
        const old = p.hp; p.hp = REDEMPTION_HP + REDEMPTION_HEAL; p.restores--; st.restores++; st.locator++; p.sipReady = t + 3;
        const give = Math.min(Math.floor(p.hp * 0.75), 99 - q.hp); p.hp -= give; q.hp += give;
        p.cycleAfter = p.next + 1;                                      // once between swings
        L.on && L(`t${t} ${p.name} locator orb -> Redemption (${old} -> 25, restore: ${p.restores} left), heals other ${q.name} (+${give}): ${p.name} ${p.hp}, ${q.name} ${q.hp}`);
        if (p.how[mazes.length] === 'redemption' && mazes.length < 2) { p.hp = REDEMPTION_HP; p.orbedDown = mazes.length; }   // straight back down for the skip
      }
    }
    // ---- damage on her this tick
    const landing = hits.filter((x) => x[0] === t); hits = hits.filter((x) => x[0] !== t);
    for (const h of landing) {
      if (kill != null) { if (kill === t) { anim = DEATH_ANIM_OVERKILL; L.on && L(`t${t} ${h[1].name} ${h[3]} lands after the kill (overkill)`); } break; }
      const [, p, , label, kind] = h;
      if (kind && PREFIRE[kind]) {
        const n = prefireNumbers(p, kind, defLvl);
        if (rng.random() < n.ch) {
          let d = Math.max(1, rng.randint(0, n.mx));
          if (n.ruby && (PREFIRE[kind].spec || rng.random() < 0.066)) {      // ruby bolt (e) through the ZCB: 22% of her HP, max 110
            const r = Math.min(110, Math.floor(hp * 0.22)); p.hp -= Math.floor(p.hp / 10);
            damage(t, r, `${p.name} ${label} ruby`, 'ruby'); d = PREFIRE[kind].spec ? 0 : d;
          }
          if (n.drain && phase === 0) mark('barrage:landed');
          if (n.drain && !drained) { drained = true; defLvl = Math.max(SOTE.defFloor, defLvl - Math.floor(defLvl * 0.15)); L.on && L(`t${t} Shadow Barrage drains her Defence -> ${defLvl}`); }
          damage(t, d, `${p.name} ${label}`, 'prefire');
        } else L.on && L(`t${t} ${p.name} ${label} misses`);
      } else if (kind === 'zcb') {
        const n = prefireNumbers(p, 'ZCB spec', defLvl);
        if (rng.random() < n.ch) {
          const r = Math.min(110, Math.floor(hp * 0.22)); p.hp -= Math.floor(p.hp / 10);
          damage(t, r, `${p.name} ZCB spec ruby`, 'zcb');
        } else L.on && L(`t${t} ${p.name} ZCB spec misses`);
      } else if (kind === 'maul') {
        if (h[5]) maulHits[phase]++;

        if (p.duoBackingUp && phase === 0) {                          // duos: the backup landed
          p.duoBackingUp = false;
          if (!maulHits[0]) {                                          // missed again: B mauls P2, A camps Lightbearer for P3
            const b = ps.find((q) => q !== p && !q.dead);
            if (b) { b.specs[1] = { ...S_('maul') }; b.specs[2] = { ...S_('none') }; }
            p.specs[1] = { ...S_('none') }; p.specs[2] = { ...S_('maul') };
            const need = Math.max(0, Math.ceil((50 - p.spec) / 10));
            if (need) { p.lb = true; p.lbLeft = need; }
            L.on && L(`t${t} ${p.name}'s backup missed too: ${b ? b.name : '-'} mauls P2, ${p.name} camps Lightbearer (${need} regens) to maul P3`);
          }
        }
        damage(t, h[2], `${p.name} ${label}`, h[6] === 'bgs' ? 'bgs' : 'maul');
      } else damage(t, h[2], `${p.name} ${label}`, kind || 'scythe');
    }
    if (mazes.length >= upTo) continue;
    // ---- orbs landing on players
    const now = kill != null ? [] : orbs.filter((o) => o[0] === t), mz0 = mazes.length;   // she's dead: no more orbs
    for (const p of alive()) {
      if (mazes.length !== mz0) break;                              // a veng procced the maze: the rest of the orbs are gone
      const mine = now.filter((o) => o[1] === p); if (!mine.length) continue;
      const pp = prayPlan(p, t, p.prayOffUntil);
      // take this one off prayer for veng: safe (above 50, no other orb on them in the next 4 ticks) - or chanced, once she's within the
      // chance veng threshold after the second maze (her last ~2%: she may die to the veng)
      const chance = chanceAt > 0 && mazes.length >= 2 && hp <= MAX * chanceAt;
      // taking it unprayed turns their prayer off until 5 ticks later: not with another orb landing on them before then
      const pairAhead = prayPlan(p, t + 1, t + PRAYER_OFF + 1).unprayed > 0;
      const off = !pp.ticks.has(t) || (p.veng && mine.length === 1 && !sharkNext(p) && (chance || (p.hp > ORB_MAX && !pairAhead)));   // shark skipping next: no veng orbs
      const prayStyle = off ? null : mine[mine.length - 1][2];
      let hitHere = false;
      for (const o of mine) {
        if (p.dead) break;
        const prayed = !off && t >= p.prayOffUntil && o[2] === prayStyle;
        let d = 0;
        if (prayed) st.orbs.prayed++;
        else {
          hitHere = true;
          st.orbs.taken++; if (off) st.orbs.vengd++;
          if (rng.random() < hit_chance((SOTE.mag + 9) * (SOTE.accMagic + 64), playerDef(p, o[2]))) d = rng.randint(0, ORB_MAX);
        }
        L.on && L(`t${t} ${o[3] ? 'split ' : ''}${o[2]} orb -> ${p.name}: ${prayed ? 'prayed' : `${d}${off ? (p.veng ? ' (off prayer, veng)' : ' (off prayer)') : ''}`} (HP ${p.hp - d})`);
        if (!prayed && d > 0) { hurt(t, p, d); vengHit(t, p, d, 'orb'); }
      }
      if (hitHere) p.prayOffUntil = t + PRAYER_OFF + 1;                 // an orb that hit them unprayed turns their prayer off
      if (mazes.length !== mz0) break;                              // that veng procced the maze: no split
      for (const o of mine.filter((x) => !x[3])) {                    // the first orb on a player splits
        const others = rng.shuffle(alive().filter((q) => q !== p)).slice(0, 2);
        const styles = rng.random() < 0.5 ? ['range', 'mage'] : ['mage', 'range'];
        others.forEach((q, j) => orbs.push([t + ORB_DELAY, q, styles[j], true]));
        if (others.length) L.on && L(`t${t} orb splits -> ${others.map((q, j) => `${q.name} (${styles[j]})`).join(', ')}, landing t${t + ORB_DELAY}`);
      }
    }
    orbs = orbs.filter((o) => o[0] !== t);
    // ---- the death ball lands: shared if everyone can take their share (splitBall), else the target tick-eats it - the
    // hit takes them to 0 and food that tick lands before the death check: a Guthix rest if they have one (to 5 HP, no
    // attack delay - it's a potion), else a shark (to 20 HP, no attack for 3 ticks); with neither, tick-healed (a 3-tick
    // stall; the lowest-HP teammate Heal Others them before it ends - the least goes to waste). Solos tick-eat with purple
    // sweets (1-3 HP, unlimited); they never bring Guthix rests. A maze proc first: it does nothing. Veng doesn't
    // reflect it. The count of magic attacks carries over through the mazes.
    // the tick before: a target who'll tick-eat it (they end up on 5 / 20 HP anyway) Heal Others their HP away first -
    // P1 / P2 to the lowest-HP teammate who isn't redemption skipping and won't be left at an HP that dies on the maze;
    // P3 to whoever is closest to taking a veng safely (the highest HP at 50 or less, else the lowest)
    if (ball && t === ball.at - 1 && kill == null && !ball.tgt.dead && !blocked) {
      const live = alive(), n = live.length, tb = BALL[Math.min(5, n)] || BALL[1], share = tb[n] ?? tb[1], tg = ball.tgt;
      const willEat = !(splitBall && team > 2 && n > 1 && live.every((q) => q.hp > share)) && (tg.rests > 0 || tg.sharks > 0 || stallTick);
      if (willEat && tg.hp > 1 && !meleeable(tg, t)) {
        const nRun = n - 1, others = live.filter((q) => q !== tg);
        let order;
        if (mazes.length < 2) order = others.filter((q) => !redeemAhead(q)).sort((a, b) => a.hp - b.hp);
        else { const low = others.filter((q) => q.hp <= ORB_MAX).sort((a, b) => b.hp - a.hp); order = low.length ? low : others.sort((a, b) => a.hp - b.hp); }
        for (const q of order) {
          const give = Math.min(Math.floor(tg.hp * 0.75), 99 - q.hp);
          if (give <= 0 || (mazes.length < 2 && !q.how.slice(mazes.length).includes('redemption') && stallDead(q.hp + give, q, nRun))) continue;
          tg.hp -= give; q.hp += give;
          L.on && L(`t${t} ${tg.name} heals other ${q.name} (+${give}) before tick-eating the death ball: ${tg.name} ${tg.hp}, ${q.name} ${q.hp}`);
          break;
        }
      }
    }
    if (ball && t === ball.at && kill == null) {
      const live = alive(), n = live.length, tb = BALL[Math.min(5, n)] || BALL[1], share = tb[n] ?? tb[1];
      const tgt = ball.tgt.dead ? null : ball.tgt; ball = null;
      if (splitBall && team > 2 && n > 1 && live.every((q) => q.hp > share)) {
        for (const q of live) q.hp -= share;
        st.ballSplit++; L.on && L(`t${t} death ball shared by ${n}: ${share} each`);
      } else if (tgt) {
        const full = tb[1];
        // tick-heal: a 3-tick stall; the lowest-HP teammate (least wasted) Heal Others them before it ends
        const c = live.filter((q) => q !== tgt && q.hp > 1 && !meleeable(q, t)).sort((a, b) => a.hp - b.hp)[0];
        const give = c ? Math.min(Math.floor(c.hp * 0.75), 99) : 0;
        const tickHeal = () => {
          const old = tgt.hp; c.hp -= give; tgt.hp = give; st.ballEat++; st.ballHeal++;
          if (tgt.next < t + 3) { tgt.next = t + 3; if (flinches(tgt) && isHerTick(tgt.next + 1)) tgt.next++; }
          L.on && L(`t${t} death ball on ${tgt.name} alone (${full}): tick-healed (stall) - ${old} -> 0, ${c.name} heals other +${give} (${c.name} ${c.hp})`);
        };
        if (tgt.rests > 0) {                                           // a Guthix rest first (no attack delay)
          const old = tgt.hp; tgt.hp = REST_HEAL; tgt.rests--; st.rests++; st.ballEat++;
          L.on && L(`t${t} death ball on ${tgt.name} alone (${full}): tick-eats it with a Guthix rest, ${old} -> 0 -> ${tgt.hp} (${tgt.rests} sips left)`);
        } else if (team === 1) {                                       // solos: purple sweets (1-3, as many as they like)
          const old = tgt.hp; tgt.hp = rng.randint(1, 3); st.ballEat++; tgt.eatReady = t + 3;
          if (tgt.next < t + 3) { tgt.next = t + 3; if (flinches(tgt) && isHerTick(tgt.next + 1)) tgt.next++; }
          L.on && L(`t${t} death ball on ${tgt.name} (${full}): tick-eats it with purple sweets, ${old} -> 0 -> ${tgt.hp}`);
        } else if (stallTick && give > 0) tickHeal();                  // Stall tick-eat: keep the shark for the mazes
        else if (tgt.sharks > 0) {
          const old = tgt.hp; tgt.hp = SHARK_HEAL; tgt.sharks--; st.sharks++; st.ballEat++; tgt.eatReady = t + 3;
          if (tgt.next < t + 3) { tgt.next = t + 3; if (flinches(tgt) && isHerTick(tgt.next + 1)) tgt.next++; }
          L.on && L(`t${t} death ball on ${tgt.name} alone (${full}): tick-eats it with a shark, ${old} -> 0 -> ${tgt.hp} (${tgt.sharks} left)`);
        } else if (give > 0) tickHeal();
        else { hurt(t, tgt, full); L.on && L(`t${t} death ball on ${tgt.name} alone (${full}), no food and nobody to heal them`); }
      }
    }
    // ---- her attack
    if (!blocked && t === nextAttack && alive().length && t === skipAt) { nextAttack += ATTACK_EVERY; L.on && L(`t${t} SOTETSEG skips her attack (death ball)`); }
    else if (!blocked && t === nextAttack && alive().length) {
      nextAttack += ATTACK_EVERY;
      const tgt = rng.choice(alive());
      if (magicCount >= BALL_EVERY) {                                  // the death ball
        magicCount = 0; st.balls++; ball = { at: t + BALL_LANDS, tgt }; skipAt = t + ATTACK_EVERY;
        L.on && L(`t${t} SOTETSEG death ball -> ${tgt.name}, lands t${t + BALL_LANDS}`);
      } else if (tgt.lastMelee === t - 1 && rng.random() < 0.5) {
        st.melees++;
        const ch = hit_chance((SOTE.atk + 9) * (SOTE.accMelee + 64), playerDef(tgt, 'crush'));
        const d = rng.random() < ch ? rng.randint(0, Math.floor(MELEE_MAX * 0.6)) : 0;   // prayed: max -40%
        tgt.pending.push([t + 1, d]);
        L.on && L(`t${t} SOTETSEG melees ${tgt.name} (lands t${t + 1}: ${d})`);
      } else {
        orbs.push([t + ORB_DELAY, tgt, 'mage', false]); magicCount++;
        L.on && L(`t${t} SOTETSEG magic orb -> ${tgt.name}, lands t${t + ORB_DELAY}`);
      }
    }
    // ---- spec regen (10% per 50 ticks below 100) and thralls (0-3 every 4 ticks, landing a tick later; not in a maze)
    for (const p of alive()) {
      // Lightbearer only while it's doing something: at 100% (or waiting on a 95% start's first spec) they wear Ultor and
      // go back on Lightbearer for the cycles left once their spec is below 100 again
      const wantLb = p.lbLeft > 0 && p.spec < 100 && !p.regenHold;
      if (wantLb !== p.lb) { p.lb = wantLb; if (p.lbLeft > 0 && p.lbStarted) L.on && L(`t${t} ${p.name} ${wantLb ? `back on Lightbearer (${p.lbLeft} cycles left)` : `at 100% - Ultor until they spec (${p.lbLeft} Lightbearer cycles left)`}`); if (wantLb) p.lbStarted = true; }
      if (p.regenHold) { /* waiting for their first spec */ } else if (p.spec < 100) {
        if (++p.regen >= (p.lb ? 25 : 50)) {                             // Lightbearer: a regen every 25 ticks
          p.regen = 0; p.spec = Math.min(100, p.spec + 10);
          if (p.lb && --p.lbLeft <= 0) { p.lb = false; p.lbOffAt = t; L.on && L(`t${t} ${p.name} Lightbearer cycles done (${p.spec}%) - swaps to Ultor`); }
        }
      } else p.regen = 0;
      if (!blocked && p.thrallNext === t) { hits.push([t + 1, p, rng.randint(0, 3), 'thrall', 'thrall']); p.thrallNext = t + 4; }
    }
    // ---- melee hits on players, then player attacks
    const floored = () => defLvl <= SOTE.defFloor;
    for (const p of pid.filter((q) => !q.dead)) {                    // in PID order (random each raid)
      for (const [, d] of p.pending.filter((x) => x[0] === t)) { if (d > 0) { hurt(t, p, d); vengHit(t, p, d, 'melee'); } }
      p.pending = p.pending.filter((x) => x[0] !== t);
      if (p.dead || t !== p.next) continue;
      if (p.thrallBack) { p.thrallBack = false; p.thrallNext = t + rng.randint(1, 2); }   // thrall back with their first attack
      // what to hit with: a planned maul, a backup maul, phase-3 spare spec (maul, else claws), or the scythe
      const ph = phase, has = (w) => (p.gear.weapons || []).includes(w);
      const act = chooseAct(p, t, ph, has);
      p.swings[ph]++;
      if (act !== 'scythe') st.specLog.push({ i: p.i, ph, kind: act === 'claw' ? 'claws' : act === 'zcbCarry' ? 'zcb' : act, t, carried: act === 'zcbCarry' });
      if (act === 'zcb' || act === 'zcbCarry') {
        spend(p, ZCB_SPEC, t); if (act === 'zcb') p.specDone[ph]++; st.specs.zcb++;
        hits.push([t + ZCB_DELAY, p, 0, 'ZCB spec', 'zcb']);
        L.on && L(`t${t} ${p.name} ZCB spec (${p.spec}% left)`);
        p.next = nextAfter(t, 5, p);
      } else if (act === 'maul') {
        spend(p, 50, t); p.mauled[ph]++; p.specDone[ph]++; st.specs.maul++;
        const [ch, mx] = melee(p, 'Elder maul', 2, defLvl, 1.25);
        const horned = t <= p.hornUntil; if (horned) p.hornUntil = -1;   // Soulflame horn: this hit can't miss
        const hit = horned || rng.random() < ch, d = hit ? Math.max(1, rng.randint(0, mx)) : 0;
        if (hit) st.specs.maulHit++;
        if (hit) lowerDef(t, 'Elder maul', Math.floor(defLvl * 0.35));   // as the attack is made (PID)
        hits.push([t + 1, p, d, `Elder maul spec ${hit ? d : 'misses'}`, 'maul', hit]);
        L.on && L(`t${t} ${p.name} Elder maul spec${horned ? ' (horned)' : ''} (${p.spec}% left)`);
        p.lastMelee = t; p.next = nextAfter(t, 6, p);
      } else if (act === 'bgs') {                                      // Warstrike: 2x accuracy vs slash, max x1.1 x1.1
        spend(p, 50, t); p.mauled[ph]++; p.specDone[ph]++; st.specs.bgs++;
        const [ch, mx0] = melee(p, 'Bandos godsword', 1, defLvl, 2), mx = Math.floor(Math.floor(mx0 * 1.1) * 1.1);
        const horned = t <= p.hornUntil; if (horned) p.hornUntil = -1;
        const hit = horned || rng.random() < ch, d = hit ? Math.max(1, rng.randint(0, mx)) : 0;
        if (hit) st.specs.bgsHit++;
        if (hit) lowerDef(t, 'BGS', d);
        hits.push([t + 1, p, d, `BGS spec ${hit ? d : 'misses'}`, 'maul', hit, 'bgs']);
        L.on && L(`t${t} ${p.name} BGS spec${horned ? ' (horned)' : ''} (${p.spec}% left)`);
        p.lastMelee = t; p.next = nextAfter(t, 6, p);
      } else if (act === 'claw') {
        spend(p, 50, t); p.specDone[ph]++; st.specs.claw++;
        const parts = clawSpec(p, defLvl, rng);
        hits.push([t + 1, p, parts.reduce((a, b) => a + b, 0), `claw spec ${parts.join('/')}`, 'claw']);
        p.lastMelee = t; p.next = nextAfter(t, 4, p);
      } else {
        const [ch, mx] = scythe(p, defLvl);
        const parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => (rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0));
        hits.push([t + 1, p, parts.reduce((a, b) => a + b, 0), `scythe ${parts.join('/')}`, null]);
        p.lastMelee = t; p.next = nextAfter(t, 5, p);
      }
    }
  }
  if (kill != null) end = kill + anim;
  // report split: P1 (to the first proc), first maze (proc to the end of the last cycle before she's interactable),
  // P2 (interactable to the second proc), second maze, P3 (to the end of the room)
  const split = mazes.length >= 2 && back.length >= 2 && end != null
    ? { p1: mazes[0], maze1: back[0] - mazes[0], p2: mazes[1] - back[0], maze2: back[1] - mazes[1], p3: end - back[1], total: end } : null;
  if (phase >= 0 && ps.some((q) => q.prefire === 'Shadow Barrage') && !ev.has('barrage:landed')) mark('barrage:missed');
  return { events: [...ev], end, kill, anim, mazes, split, lost: mazes.map((x) => ticksLost(x, entry)), hp, ...st, players: ps.map((p) => ({ name: p.name, role: p.role, hp: p.hp, dead: p.dead, pnecks: p.pnecks, sharks: p.sharks, spec: p.spec, surgeAt: p.surgeAt, lbOffAt: p.lbOffAt })) };
}

/** Phase 1 only (start to the first maze): runSote stopped there. */
export function runSotePhase1(players, team, rng, log = null) {
  const r = runSote(players, team, rng, log, { upTo: 1 });
  return { ...r, maze: r.mazes[0] ?? null };
}
