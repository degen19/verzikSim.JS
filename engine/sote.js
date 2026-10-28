// Sotetseg - phase 1: room start to the first maze (66.6%). Tick by tick.
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

/**
 * One raid of phase 1. players: [{name, gear (Gear tab player), prefire ('' or a PREFIRE key), startSpec}].
 * Returns {maze, hp, dmg: {prefire, scythe, veng, ruby}, orbs: {taken, prayed, vengd}, melees, players}.
 */
export function runSotePhase1(players, team, rng, log = null) {
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const MAX = SOTE_HP[team] || 4000, stopAt = Math.floor(MAX * MAZE_AT[0]);
  let hp = MAX, defLvl = SOTE.def, drained = false, maze = null;
  const st = { dmg: { prefire: 0, scythe: 0, veng: 0, ruby: 0 }, orbs: { taken: 0, prayed: 0, vengd: 0 }, melees: 0 };
  const ps = players.map((c, i) => ({ i, name: c.name || `P${i + 1}`, gear: c.gear, prefire: c.prefire || '',
    hp: 99, dead: false, veng: true, vengReady: 0, prayOffUntil: 0, lastMelee: -9, next: null, pending: [] }));
  const alive = () => ps.filter((p) => !p.dead);
  const hits = [];                    // [tick, player, amount, label] damage landing on her
  const orbs = [];                    // [tick, player, style, split]
  /** Damage to her, stopped at the maze threshold (the hit that reaches it starts the maze). */
  const damage = (t, amt, label, kind) => {
    if (maze != null || amt <= 0) return;
    const real = Math.min(amt, hp - stopAt);
    hp -= real; st.dmg[kind] += real;
    L.on && L(`t${t} ${label} ${amt}${real < amt ? ` (stops at ${real})` : ''} -> Sotetseg ${hp}`);
    if (hp <= stopAt) { maze = t; L.on && L(`t${t} *** MAZE (66.6%) ***`); }
  };
  // ---- prefires and the first scythe tick (lined up on her attack ticks)
  for (const p of ps) {
    let after = 0;
    if (p.prefire && PREFIRE[p.prefire]) {
      const pf = PREFIRE[p.prefire];
      hits.push([pf.tick + pf.delay, p, null, `prefire ${p.prefire}`, p.prefire]);
      after = pf.tick + 5;
    }
    // first scythe: the first of her attack ticks (from 11) they can make - 11 after any prefire, and 11 without one
    let t = FIRST_ATTACK + ATTACK_EVERY; while (t < after) t += ATTACK_EVERY;
    p.next = t;
  }
  const vengHit = (t, p, dmg, src) => {
    if (!p.veng || dmg <= 0) return;
    p.veng = false;
    const v = Math.floor(dmg * 0.75);
    damage(t, v, `${p.name} veng (${src} ${dmg})`, 'veng');
  };
  for (let t = 1; t <= 400 && maze == null; t++) {
    // ---- veng casts: own first, else on a teammate without one (only if the caster's own is up)
    for (const p of alive()) {
      if (t < p.vengReady) continue;
      if (!p.veng) { p.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} casts veng`); continue; }
      const other = alive().find((q) => q !== p && !q.veng && t < q.vengReady);
      if (other) { other.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} casts veng on ${other.name}`); }
    }
    // ---- damage on her this tick
    for (const h of hits.filter((x) => x[0] === t)) {
      const [, p, , label, kind] = h;
      if (kind && PREFIRE[kind]) {
        const n = prefireNumbers(p, kind, defLvl);
        if (rng.random() < n.ch) {
          let d = Math.max(1, rng.randint(0, n.mx));
          if (n.ruby && (PREFIRE[kind].spec || rng.random() < 0.066)) {      // ruby bolt (e) through the ZCB: 22% of her HP, max 110
            const r = Math.min(110, Math.floor(hp * 0.22)); p.hp -= Math.floor(p.hp / 10);
            damage(t, r, `${p.name} ${label} ruby`, 'ruby'); d = PREFIRE[kind].spec ? 0 : d;
          }
          if (n.drain && !drained) { drained = true; defLvl = Math.max(SOTE.defFloor, Math.floor(defLvl * 0.85)); L.on && L(`t${t} Shadow Barrage drains her Defence -> ${defLvl}`); }
          damage(t, d, `${p.name} ${label}`, 'prefire');
        } else L.on && L(`t${t} ${p.name} ${label} misses`);
      } else damage(t, h[2], `${p.name} ${label}`, 'scythe');
    }
    if (maze != null) break;
    // ---- orbs landing on players
    const landing = orbs.filter((o) => o[0] === t);
    for (const p of alive()) {
      const mine = landing.filter((o) => o[1] === p); if (!mine.length) continue;
      const later = orbs.filter((o) => o[1] === p && o[0] > t && o[0] <= t + PRAYER_OFF).length;
      const off = p.veng && p.hp > ORB_MAX && !later && mine.length === 1;   // take this one off prayer for veng
      const prayStyle = off ? null : mine[mine.length - 1][2];              // otherwise pray against it
      for (const o of mine) {
        const prayed = !off && t >= p.prayOffUntil && o[2] === prayStyle;
        let d = 0;
        if (prayed) st.orbs.prayed++;
        else {
          st.orbs.taken++; if (off) st.orbs.vengd++;
          const roll = (SOTE.mag + 9) * (SOTE.accMagic + 64);
          if (rng.random() < hit_chance(roll, playerDef(p, o[2]))) d = rng.randint(0, ORB_MAX);
          p.hp -= d;
        }
        L.on && L(`t${t} ${o[3] ? 'split ' : ''}${o[2]} orb -> ${p.name}: ${prayed ? 'prayed' : `${d}${off ? ' (off prayer, veng)' : ''}`} (HP ${p.hp})`);
        if (!prayed) vengHit(t, p, d, 'orb');
        if (p.hp <= 0) { p.dead = true; L.on && L(`t${t} ${p.name} dies`); }
      }
      p.prayOffUntil = t + PRAYER_OFF + 1;
      // the first orb on a player splits to up to 2 others (one Ranged, one Magic), landing 7 ticks later
      for (const o of mine.filter((x) => !x[3])) {
        const others = rng.shuffle(alive().filter((q) => q !== p)).slice(0, 2);
        const styles = rng.random() < 0.5 ? ['range', 'mage'] : ['mage', 'range'];
        others.forEach((q, j) => orbs.push([t + ORB_DELAY, q, styles[j], true]));
        if (others.length) L.on && L(`t${t} orb splits -> ${others.map((q, j) => `${q.name} (${styles[j]})`).join(', ')}, landing t${t + ORB_DELAY}`);
      }
    }
    // ---- her attack
    if (t >= FIRST_ATTACK && (t - FIRST_ATTACK) % ATTACK_EVERY === 0 && alive().length) {
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
    // ---- melee hits on players, then player attacks
    for (const p of alive()) {
      for (const [, d] of p.pending.filter((x) => x[0] === t)) { p.hp -= d; vengHit(t, p, d, 'melee'); if (p.hp <= 0) p.dead = true; }
      p.pending = p.pending.filter((x) => x[0] !== t);
      if (p.dead || t !== p.next) continue;
      const [ch, mx] = scythe(p, defLvl);
      const parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => (rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0));
      hits.push([t + 1, p, parts.reduce((a, b) => a + b, 0), `scythe ${parts.join('/')}`, null]);
      p.lastMelee = t; p.next = t + 5;
    }
  }
  return { maze, hp, stopAt, ...st, players: ps.map((p) => ({ name: p.name, hp: p.hp, dead: p.dead })) };
}
