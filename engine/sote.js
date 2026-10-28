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
//    (250+9) x (-10+64); 0 if prayed against; any orb turns their prayer off for 2 ticks. Split orbs don't split again.
//  - Players pray against every orb, except: with veng up, above 50 HP and no other orb on them within the next 2 ticks,
//    they take the earliest orb off prayer (veng). Veng: 75% of the hit back to her; everyone starts with it up and off
//    cooldown; recast (or cast on a teammate without one, if the caster's own is up) as soon as the 50-tick cooldown
//    allows. Veng damage obeys the maze threshold too.
//  - Players: prefire (Twisted bow / ZCB auto / ZCB spec / Shadow Barrage / Tumeken's shadow, in their best gear for it),
//    then (specs - to come) scythes every 5 ticks, lined up on her attack ticks so she never melees (the "flinch").
//    Shadow Barrage drains 15% of her Defence (once until the next maze, floor 100).
//
// Assumptions to confirm (constants below): prefire attack ticks / hit delays, player stats (super combat 118 Atk /
// Str / Def, 99 Ranged / Magic, Piety or Zeal for melee, Rigour / Augury for prefires).
import { hit_chance } from './sim.js';
import { ITEMS } from './gear.js';
import { worn, bonuses, bestWorn } from './loadout.js';

export const SOTE_HP = { 5: 4000, 4: 3500, 3: 3000, 2: 3000, 1: 3000 };
export const SOTE = { def: 200, defFloor: 100, mag: 250, rng: 250, atk: 250, str: 250,
  defMelee: 70, defMagic: 30, defRanged: 150, accMelee: 0, accMagic: -10, accRanged: -10 };
export const FIRST_ATTACK = 6, ATTACK_EVERY = 5, ORB_DELAY = 7, PRAYER_OFF = 2;
export const MELEE_MAX = 45, ORB_MAX = 50, VENG_CD = 50;
export const MAZE_AT = [2 / 3, 1 / 3];
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
function scythe(p, defLvl) {
  const b = bonuses(worn(p.gear, 'melee', 'Scythe of vitur'));
  const [pa, ps] = PRAY[p.gear.prayer || 'Piety'] || PRAY.Piety;
  const ea = Math.floor(118 * pa) + 8, es = Math.floor(118 * ps) + 3 + 8;
  const mx = Math.floor((es * (b.str + 64) + 320) / 640);
  return [hit_chance(ea * (b.atk[1] + 64), defRoll(defLvl, 'melee')), mx];
}

/** A player's melee numbers with a weapon against her Defence: [chance, max]. idx 1 slash / 2 crush; acc multiplier. */
function melee(p, weapon, idx, defLvl, accMult = 1) {
  const b = bonuses(worn(p.gear, 'melee', weapon));
  const [pa, ps] = PRAY[p.gear.prayer || 'Piety'] || PRAY.Piety;
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
// Spec plan by player (A-E = players 1-5): planned Elder mauls per phase (0 = before the first maze, 1 = between, 2 =
// after the second), backups (up to two mauls in their phase, once the planned ones have landed and her Defence still
// isn't at the floor), and in phase 3 the backups use spare spec: maul if she isn't fully reduced, otherwise claws.
export const SPEC_PLAN = { A: { maul: [0, 1] }, B: { maul: [1, 2] }, C: { maul: [0, 2] }, D: { backup: 0 }, E: { backup: 1 } };
const ROLES = ['A', 'B', 'C', 'D', 'E'];

/** A prefire's numbers: {ch, mx, kind}. Ranged on Rigour (+20% acc, +23% str), magic on Augury (+25% acc, +4% dmg). */
export function prefireNumbers(p, kind, defLvl) {
  const pf = PREFIRE[kind];
  const { set } = bestWorn(p.gear, pf.style, pf.weapon), b = bonuses(set);
  if (pf.style === 'range') {
    const v = b.eliteVoid ? [1.10, 1.125] : [1, 1];
    const ea = Math.floor((Math.floor(99 * 1.20) + 8) * v[0]), es = Math.floor((Math.floor(99 * 1.23) + 8) * v[1]);
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
export const SHARK_HEAL = 20;

/**
 * One raid of Sotetseg with maze skips. players: [{name, gear (Gear tab player), prefire ('' or a PREFIRE key),
 * pnecks, sharks}]. opts: {upTo: 1 = stop at the first maze, 2 = the second, 3 = the kill (default); entry: room entry
 * instance 0-3 (default 0); chanceAt: chance veng threshold - after the second maze, at or below this share of her HP
 * players take orbs off prayer for veng whatever their HP (default 0.02)}.
 *
 * Mazes (skip / stall): the hit that reaches 66.6% / 33.3% (tick T) teleports everyone (T..T+4). One random player goes
 * under: no maze damage, first swing on T+19 (lands T+20). The others click on the first i3 from T+4, move on the i4
 * after (m), land on the maze on m+1 and stall 7 ticks (no veng casts), taking the stall damage (stallSkip) as they
 * come out on m+8 (i4). She's attackable on m+9 (i1); the runners attack on m+10 (i2, landing m+11) and her attacks
 * restart then, every 5 ticks. Her Defence resets (and can be drained again). Hits and her attacks still on the way at
 * the proc are dropped (assumed).
 * Returns {end, kill, mazes: [T, T], hp, dmg, orbs, melees, players}.
 */
export function runSote(players, team, rng, log = null, { upTo = 3, entry = 0, chanceAt = 0.02 } = {}) {
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const MAX = SOTE_HP[team] || 4000;
  const marks = [Math.floor(MAX * MAZE_AT[0]), Math.floor(MAX * MAZE_AT[1]), 0];
  let hp = MAX, defLvl = SOTE.def, drained = false, phase = 0, stopAt = marks[0];
  let blocked = false;                          // she can't be damaged (maze) until `attackable`
  let attackable = 1, nextAttack = FIRST_ATTACK, kill = null, anim = DEATH_ANIM, end = null;
  const mazes = [];
  const st = { dmg: { prefire: 0, scythe: 0, maul: 0, claw: 0, thrall: 0, veng: 0, ruby: 0 }, specs: { maul: 0, maulHit: 0, claw: 0 }, orbs: { taken: 0, prayed: 0, vengd: 0 }, melees: 0, sharks: 0, stalls: [] };
  const ps = players.map((c, i) => ({ i, name: c.name || `P${i + 1}`, gear: c.gear, prefire: c.prefire || '',
    pnecks: Number(c.pnecks ?? 0), sharks: Number(c.sharks ?? 0), spec: Number(c.startSpec ?? 100), regen: 0,
    role: c.role || ROLES[i], mauled: [0, 0, 0], thrallNext: null, hp: 99, dead: false, veng: true, vengReady: 0, noVengUntil: 0, prayOffUntil: 0,
    lastMelee: -9, next: null, pending: [] }));
  const alive = () => ps.filter((p) => !p.dead);
  let hits = [];                      // [tick, player, amount, label, kind] damage landing on her
  let orbs = [];                      // [tick, player, style, split]
  /** Her attack ticks from `from`: the first one at or after tick t. */
  const herTickFrom = (t) => { let x = nextAttack; while (x < t) x += ATTACK_EVERY; return x; };
  const isHerTick = (x) => x >= nextAttack && (x - nextAttack) % ATTACK_EVERY === 0;
  /** Their next attack after one on tick t with this speed: on time, but never the tick before her attack (the flinch:
   *  she can only melee a player who attacked the tick before) - then a tick later. */
  const nextAfter = (t, speed) => (isHerTick(t + speed + 1) ? t + speed + 1 : t + speed);
  const startMaze = (t) => {
    mazes.push(t);
    L.on && L(`t${t} *** MAZE ${mazes.length} (${mazes.length === 1 ? '66.6' : '33.3'}%) ***`);
    blocked = true; hits = []; orbs = []; for (const p of ps) { p.pending = []; p.thrallNext = null; }   // thralls stop until they attack again
    defLvl = SOTE.def; drained = false;
    let m = t + 5; while (instanceOf(m, entry) !== 0) m++;           // runners: click on the first i3 from T+4, move on the i0 after
    attackable = m + 9; nextAttack = m + 10;
    const live = alive(), under = live.length > 1 ? rng.choice(live) : null;
    const runners = live.filter((p) => p !== under);
    for (const p of runners) {
      p.noVengUntil = m + 8;                                         // no veng casts while stalling
      p.stallAt = m + 8; p.next = m + 10; p.thrallBack = true;
      // in a danger zone for the skip: one shark at most, after the teleport and before stepping on (no eating in the stall)
      if (p.sharks > 0 && stallSkip(p.hp, team, p.pnecks > 0, true, runners.length).dead) {
        const old = p.hp; p.hp = Math.min(99, p.hp + SHARK_HEAL); p.sharks--; st.sharks++;
        L.on && L(`t${t} ${p.name} eats a shark before the stall: ${old} -> ${p.hp} (${p.sharks} left)`);
      }
    }
    if (under) { under.next = t + 19; under.healFrom = t + 20; under.thrallBack = true; L.on && L(`t${t} ${under.name} goes under (first swing t${t + 19}); runners stall t${m + 1}-${m + 7}, off t${m + 8}`); }
    pendingStall = { at: m + 8, runners };
  };
  let pendingStall = null;
  /** Would this player die on the skip at this HP? */
  const stallDead = (h, p, runners) => stallSkip(h, team, p.pnecks > 0, true, runners).dead;
  const damage = (t, amt, label, kind) => {
    if (blocked || kill != null || amt <= 0) return;
    const real = Math.min(amt, hp - stopAt);
    hp -= real; st.dmg[kind] += real;
    L.on && L(`t${t} ${label} ${amt}${real < amt ? ` (stops at ${real})` : ''} -> Sotetseg ${hp}`);
    if (hp > stopAt) return;
    if (phase < 2) {
      phase++; stopAt = marks[phase];
      if (mazes.length + 1 >= upTo) { mazes.push(t); blocked = true; return; }   // stopping here (upTo)
      startMaze(t); return;
    }
    kill = t; L.on && L(`t${t} *** SOTETSEG DIES ***`);
  };
  // ---- prefires; first scythes on 11 (lined up on her attack ticks)
  for (const p of ps) {
    let after = 0;
    if (p.prefire && PREFIRE[p.prefire]) {
      const pf = PREFIRE[p.prefire];
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
    p.veng = false;
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
  /** Which of the orbs heading at a player (landing from tick `from`) they pray against: prayer has to be on, and a prayed
   *  orb turns it off for 2 ticks - so of orbs 2 ticks apart or less only one can be prayed. They pray the most they can,
   *  the later ones first (of a close pair: the last). Two on the same tick: one prayed. Returns {ticks, unprayed}. */
  const prayPlan = (p, from, offUntil) => {
    const mine = orbs.filter((o) => o[1] === p && o[0] >= from), xs = [...new Set(mine.map((o) => o[0]))].sort((a, b) => b - a);
    const ticks = new Set(); let last = Infinity;
    for (const x of xs) if (x + PRAYER_OFF < last && x >= offUntil) { ticks.add(x); last = x; }
    return { ticks, unprayed: mine.length - ticks.size };
  };
  for (let t = 1; t <= 1000 && !(mazes.length >= upTo) && kill == null; t++) {
    if (blocked && t >= attackable) blocked = false;
    // ---- coming out of a stall: the stall damage, in order (a phoenix necklace clears the rest)
    if (pendingStall && t === pendingStall.at) {
      for (const p of pendingStall.runners.filter((q) => !q.dead)) {
        const before = p.hp, r = stallSkip(p.hp, team, p.pnecks > 0, true, pendingStall.runners.filter((q) => !q.dead).length);
        p.hp = r.hp; if (r.pneck) p.pnecks--;
        if (r.dead) p.dead = true;
        st.stalls.push({ hp: before, after: r.hp, pneck: r.pneck, dead: r.dead });
        L.on && L(`t${t} ${p.name} out of the stall: ${before} -> ${r.dead ? 'DEAD' : r.hp}${r.pneck ? ' (phoenix necklace)' : ''}`);
        if (r.pneck) afterPneck(t, p);
      }
      pendingStall = null;
    }
    // ---- veng casts: own first, else on a teammate without one (only if the caster's own is up)
    for (const p of alive()) {
      if (t < p.vengReady || t < p.noVengUntil) continue;
      if (!p.veng) { p.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} casts veng`); continue; }
      const other = alive().find((q) => q !== p && !q.veng && t < q.vengReady && t >= q.noVengUntil);
      if (other) { other.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} casts veng on ${other.name}`); }
    }
    // ---- Heal Other (75% of the caster's HP, capped at the target's missing HP; no attack delay): only in an attack phase
    // (never between a proc and the stall); the under player not until after their first swing after the maze.
    // Caster: not one who can veng safely themselves (veng up and above 50). Target (lowest HP first), only if the heal:
    //  - lifts a teammate with veng up from 50 or less to above 50 (so they can veng safely) - one with an orb heading at
    //    them, or
    //  - with a maze still to come, takes a teammate out of a stall-danger HP, or
    //  - lifts a teammate with orbs coming they can't pray (a close pair) above what those can hit.
    // The caster won't go to 50 or less with orbs coming at them they can't pray; before the second maze not below 17, or
    // into a stall-danger HP.
    if (!blocked) {
      const after2 = mazes.length >= 2, targeted = new Set(orbs.filter((o) => o[0] >= t).map((o) => o[1]));
      const runnersNext = alive().length - 1;
      for (const c of alive()) {
        if ((c.veng && c.hp > ORB_MAX) || t < (c.healFrom || 0)) continue;
        const cUnprayed = prayPlan(c, t, c.prayOffUntil).unprayed;
        const pairNeed = (q) => ORB_MAX * prayPlan(q, t, q.prayOffUntil).unprayed;   // HP an unprayable pair can take
        const cands = alive().filter((q) => q !== c && (
          (q.veng && q.hp <= ORB_MAX && targeted.has(q)) || (!after2 && stallDead(q.hp, q, runnersNext)) || q.hp <= pairNeed(q)))
          .sort((a, b) => a.hp - b.hp);
        for (const q of cands) {
          const give = Math.min(Math.floor(c.hp * 0.75), 99 - q.hp), left = c.hp - give;
          if (give <= 0 || left <= 0) continue;
          const vengGain = q.veng && q.hp <= ORB_MAX && targeted.has(q) && q.hp + give > ORB_MAX;
          const mazeGain = !after2 && stallDead(q.hp, q, runnersNext) && !stallDead(q.hp + give, q, runnersNext);
          const pairGain = q.hp <= pairNeed(q) && q.hp + give > pairNeed(q);
          if (!vengGain && !mazeGain && !pairGain) continue;           // no gain
          if (cUnprayed && left <= ORB_MAX * cUnprayed) continue;      // orbs coming at them they can't pray
          if (!after2 && (left < 17 || stallDead(left, c, runnersNext))) continue;
          c.hp = left; q.hp += give;
          L.on && L(`t${t} ${c.name} heals other ${q.name} (+${give}): ${c.name} ${c.hp}, ${q.name} ${q.hp}`);
          break;
        }
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
          if (n.drain && !drained) { drained = true; defLvl = Math.max(SOTE.defFloor, defLvl - Math.floor(defLvl * 0.15)); L.on && L(`t${t} Shadow Barrage drains her Defence -> ${defLvl}`); }
          damage(t, d, `${p.name} ${label}`, 'prefire');
        } else L.on && L(`t${t} ${p.name} ${label} misses`);
      } else if (kind === 'maul') {
        if (h[5] && defLvl > SOTE.defFloor) { defLvl = Math.max(SOTE.defFloor, defLvl - Math.floor(defLvl * 0.35)); L.on && L(`t${t} Elder maul lowers her Defence -> ${defLvl}`); }
        damage(t, h[2], `${p.name} ${label}`, 'maul');
      } else damage(t, h[2], `${p.name} ${label}`, kind || 'scythe');
    }
    if (mazes.length >= upTo) continue;
    // ---- orbs landing on players
    const now = orbs.filter((o) => o[0] === t);
    for (const p of alive()) {
      const mine = now.filter((o) => o[1] === p); if (!mine.length) continue;
      const plan = prayPlan(p, t, p.prayOffUntil);
      // take this one off prayer for veng: safe (above 50, no other orb within 2 ticks) - or chanced, once she's within the
      // chance veng threshold after the second maze (her last ~2%: she may die to the veng)
      const chance = mazes.length >= 2 && hp <= MAX * chanceAt;
      // another orb on them within 2 ticks: they take this one unprayed (praying it would turn their prayer off for the
      // next) and pray against the last one
      // a veng (orb taken off prayer) also needs no close pair (2 ticks apart or less) already heading at them: one of a
      // pair can't be prayed, so they keep their HP above 50 for it
      const pairAhead = prayPlan(p, t + 1, p.prayOffUntil).unprayed > 0;
      const off = !plan.ticks.has(t) || (p.veng && mine.length === 1 && (chance || (p.hp > ORB_MAX && !pairAhead)));
      const prayStyle = off ? null : mine[mine.length - 1][2];
      let prayedHere = false;
      for (const o of mine) {
        if (p.dead) break;
        const prayed = !off && t >= p.prayOffUntil && o[2] === prayStyle;
        let d = 0;
        if (prayed) { st.orbs.prayed++; prayedHere = true; }
        else {
          st.orbs.taken++; if (off) st.orbs.vengd++;
          if (rng.random() < hit_chance((SOTE.mag + 9) * (SOTE.accMagic + 64), playerDef(p, o[2]))) d = rng.randint(0, ORB_MAX);
        }
        L.on && L(`t${t} ${o[3] ? 'split ' : ''}${o[2]} orb -> ${p.name}: ${prayed ? 'prayed' : `${d}${off ? (p.veng ? ' (off prayer, veng)' : ' (off prayer)') : ''}`} (HP ${p.hp - d})`);
        if (!prayed && d > 0) { hurt(t, p, d); vengHit(t, p, d, 'orb'); }
      }
      if (prayedHere) p.prayOffUntil = t + PRAYER_OFF + 1;              // an orb turns their prayer off (only if it was on)
      for (const o of mine.filter((x) => !x[3])) {                    // the first orb on a player splits
        const others = rng.shuffle(alive().filter((q) => q !== p)).slice(0, 2);
        const styles = rng.random() < 0.5 ? ['range', 'mage'] : ['mage', 'range'];
        others.forEach((q, j) => orbs.push([t + ORB_DELAY, q, styles[j], true]));
        if (others.length) L.on && L(`t${t} orb splits -> ${others.map((q, j) => `${q.name} (${styles[j]})`).join(', ')}, landing t${t + ORB_DELAY}`);
      }
    }
    orbs = orbs.filter((o) => o[0] !== t);
    // ---- her attack
    if (!blocked && t === nextAttack && alive().length) {
      nextAttack += ATTACK_EVERY;
      const tgt = rng.choice(alive());
      if (tgt.lastMelee === t - 1 && rng.random() < 0.5) {
        st.melees++;
        const ch = hit_chance((SOTE.atk + 9) * (SOTE.accMelee + 64), playerDef(tgt, 'crush'));
        const d = rng.random() < ch ? rng.randint(0, Math.floor(MELEE_MAX * 0.6)) : 0;   // prayed: max -40%
        tgt.pending.push([t + 1, d]);
        L.on && L(`t${t} SOTETSEG melees ${tgt.name} (lands t${t + 1}: ${d})`);
      } else {
        orbs.push([t + ORB_DELAY, tgt, 'mage', false]);
        L.on && L(`t${t} SOTETSEG magic orb -> ${tgt.name}, lands t${t + ORB_DELAY}`);
      }
    }
    // ---- spec regen (10% per 50 ticks below 100) and thralls (0-3 every 4 ticks, landing a tick later; not in a maze)
    for (const p of alive()) {
      if (p.spec < 100) { if (++p.regen >= 50) { p.regen = 0; p.spec = Math.min(100, p.spec + 10); } } else p.regen = 0;
      if (!blocked && p.thrallNext === t) { hits.push([t + 1, p, rng.randint(0, 3), 'thrall', 'thrall']); p.thrallNext = t + 4; }
    }
    // ---- melee hits on players, then player attacks
    const floored = () => defLvl <= SOTE.defFloor;
    const maulPending = () => hits.some((h) => h[4] === 'maul');
    const plannedLeft = (ph) => alive().some((q) => (SPEC_PLAN[q.role]?.maul || []).includes(ph) && !q.mauled[ph] && q.spec >= 50);
    for (const p of alive()) {
      for (const [, d] of p.pending.filter((x) => x[0] === t)) { if (d > 0) { hurt(t, p, d); vengHit(t, p, d, 'melee'); } }
      p.pending = p.pending.filter((x) => x[0] !== t);
      if (p.dead || t !== p.next) continue;
      if (p.thrallBack) { p.thrallBack = false; p.thrallNext = t + rng.randint(1, 2); }   // thrall back with their first attack
      // what to hit with: a planned maul, a backup maul, phase-3 spare spec (maul, else claws), or the scythe
      const plan = SPEC_PLAN[p.role] || {}, ph = phase, has = (w) => (p.gear.weapons || []).includes(w);
      let act = 'scythe';
      if (p.spec >= 50 && has('Elder maul') && !floored()) {
        if ((plan.maul || []).includes(ph) && !p.mauled[ph]) act = 'maul';
        else if ((plan.backup === ph || (ph === 2 && plan.backup != null)) && p.mauled[ph] < 2 && !plannedLeft(ph) && !maulPending()) act = 'maul';
      }
      if (act === 'scythe' && ph === 2 && plan.backup != null && p.spec >= 50 && floored() && has('Dragon claws')) act = 'claw';
      if (act === 'maul') {
        p.spec -= 50; p.mauled[ph]++; st.specs.maul++;
        const [ch, mx] = melee(p, 'Elder maul', 2, defLvl, 1.25);
        const hit = rng.random() < ch, d = hit ? Math.max(1, rng.randint(0, mx)) : 0;
        if (hit) st.specs.maulHit++;
        hits.push([t + 1, p, d, `Elder maul spec ${hit ? d : 'misses'}`, 'maul', hit]);
        L.on && L(`t${t} ${p.name} Elder maul spec (${p.spec}% left)`);
        p.lastMelee = t; p.next = nextAfter(t, 6);
      } else if (act === 'claw') {
        p.spec -= 50; st.specs.claw++;
        const parts = clawSpec(p, defLvl, rng);
        hits.push([t + 1, p, parts.reduce((a, b) => a + b, 0), `claw spec ${parts.join('/')}`, 'claw']);
        p.lastMelee = t; p.next = nextAfter(t, 4);
      } else {
        const [ch, mx] = scythe(p, defLvl);
        const parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => (rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0));
        hits.push([t + 1, p, parts.reduce((a, b) => a + b, 0), `scythe ${parts.join('/')}`, null]);
        p.lastMelee = t; p.next = nextAfter(t, 5);
      }
    }
  }
  if (kill != null) end = kill + anim;
  return { end, kill, anim, mazes, lost: mazes.map((x) => ticksLost(x, entry)), hp, ...st, players: ps.map((p) => ({ name: p.name, hp: p.hp, dead: p.dead, pnecks: p.pnecks, sharks: p.sharks })) };
}

/** Phase 1 only (start to the first maze): runSote stopped there. */
export function runSotePhase1(players, team, rng, log = null) {
  const r = runSote(players, team, rng, log, { upTo: 1 });
  return { ...r, maze: r.mazes[0] ?? null };
}
