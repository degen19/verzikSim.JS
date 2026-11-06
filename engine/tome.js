// Zorya's tome in Verzik reds (the chart's Tome Reds): the player's reds attacks are planned for the most expected
// damage on her by the reds' end, from their own numbers - scythe, shadow, claw spec, claw scratch, and the tome.
//
// The tome (magic, from a distance - no push on her attack ticks, out of the r16 bounce):
//   auto: 3 ticks.  Spec (50%): 3 ticks; a hit gives Zorya's Flow - the next 3 tome attacks are buffed (2 ticks each,
//   +150% accuracy / +60% damage).  A spec on a buffed hit (spec while buffed: +300% / +120%) takes that buffed hit's
//   place and, if it hits, adds 3 more (spec > spec(buffed) > 5 buffed hits).  While buffed they keep using the tome.
//   After a buffed (2-tick) tome attack there's no time to switch to melee gear: their next attack is the tome or a shadow -
//   unless 'Scythe first hit after tome' is on: then it can be a scythe in their full melee gear (a full switch).
// Rolled against P2 Verzik's magic Defence, at 112 Magic in their magic gear (Augury).
// Melee can't go on her attack ticks (r12 ... r36) - they'd be pushed a tick; on r16 (the bounce chance) they stay at a
// distance (with them in range, everyone is and she always bounces someone) - unless someone else is out of range anyway
// (a shadow from a distance, 100% for two claws, another tome): then it's a 50% bounce either way and they scythe r16.
// An attack counts when it goes off by r40 and lands by r41 (the crab heal lands after player damage on r41: past that
// she has the crabs' HP back - a hit on r42 / r43 rarely matters).
import { tome_attack } from './gear.js';
import { P2_DEF, scythe_roll, shadow_numbers } from './p2.js';
import { hitMV, scytheMV, clawMV } from './expdmg.js';
import { melee_max_acc, CLAW, VERZ_ATTACKS } from './reds.js';

export const TOME_DELAY = 3;   // queued [3, damage] at Verzik (Nylocas: [2, damage])
export const TOME_LAST_R = 40, TOME_LAND_R = 41;
export const TOME_MAGIC = 112;

const _cache = new Map();
/** Their tome numbers [hit chance, max] for k Flow boosts (0 auto, 1 spec / buffed auto, 2 spec while buffed). */
export function tome_numbers(p, k) {
  const ring = p.ring === 'Lightbearer' ? 'Lightbearer' : 'Ultor ring';
  const gear = [...(p.mage_gear || []), ring].filter(Boolean);
  const key = JSON.stringify([gear, k]);
  if (!_cache.has(key)) { const [, mx, ch] = tome_attack(gear, TOME_MAGIC, { def_roll: P2_DEF[3], k }); _cache.set(key, [ch, mx]); }
  return _cache.get(key);
}

/** Expected damage of each reds attack for this player, right now. */
export function tome_values(p) {
  const [sch, smx] = scythe_roll(p), [cch, cmx] = melee_max_acc(p, CLAW.atk, CLAW.str, P2_DEF[1]);
  const [hch, hmx] = p.shadow ? shadow_numbers(p) : [0, 0];
  const t0 = tome_numbers(p, 0), t1 = tome_numbers(p, 1), t2 = tome_numbers(p, 2);
  const landed = (mx) => hitMV(1, mx)[0];            // a hit's damage, given it hit
  return {
    Sc: scytheMV(sch, smx)[0], Sh: p.shadow ? hitMV(hch, hmx)[0] : null, C: p.has_dc !== false ? clawMV(cch, cmx)[0] : null,
    Cs: p.has_dc !== false ? hitMV(cch, cmx)[0] : null,
    za: hitMV(t0[0], t0[1])[0], Tb: hitMV(t1[0], t1[1])[0],
    T1: [t1[0], landed(t1[1])], T2: [t2[0], landed(t2[1])],
  };
}

let NO_MELEE = null;   // (built on first use: reds.js and this module import each other)

/** The best attack for them on reds tick r: { act, value } - act: 'Sc' scythe, 'Sh' shadow, 'C' claw spec,
 *  'Cs' claw scratch, 'T' tome spec, 'za' tome auto, 'Tb' buffed tome auto, 'Ts' tome spec while buffed, 'wait'.
 *  spec / timer: theirs now (after this tick's regen); buff: buffed tome attacks left. */
export function tome_plan(p, r, spec, timer, buff, ev = tome_values(p), lock = false, m16 = false) {
  NO_MELEE ||= new Set(VERZ_ATTACKS);   // r16 too: they stay out of the bounce chance (in range, it'd be on the whole team)
  const period = p.regen_period(), memo = new Map();
  const adv = (s, tm, from, to) => {
    for (let x = from + 1; x <= to; x++) {
      if (s < 100) { tm += 1; if (tm >= period) { tm = 0; s = Math.min(100, s + 10); } } else tm = 0;
    }
    return [s, tm];
  };
  // lk: their last attack was a buffed tome attack (magic gear on: no melee next) - true; 'range': bounced at r16 (from range next)
  const sat = !!p.scythe_after_tome;
  const V = (r, s, tm, b, lk) => {
    if (r > TOME_LAST_R) return [0, null];
    const key = `${r}|${s}|${tm}|${b}|${lk || 0}`;
    if (memo.has(key)) return memo.get(key);
    let best = [-1, null];
    const fut = (d, s2, b2, lk2 = false) => { const [a, c] = adv(s2, tm, r, r + d); return V(r + d, a, c, b2, lk2)[0]; };
    // ties: the earlier damage (a hair less for each tick later - claw r34 > scythe r38 beats scythe r34 > claw r39)
    const w = 1 - 1e-4 * r;
    const go = (act, val, d, s2 = s, b2 = 0, lk2 = false) => { const v = w * val + fut(d, s2, b2, lk2); if (v > best[0] + 1e-9) best = [v, act]; };
    // a spec that can hit or miss: [chance, damage if it hits]; on a hit buff -> bHit, on a miss -> bMiss
    const go2 = (act, [ch, dmg], d, bHit, bMiss) => {
      const lk2 = act === 'Ts';
      const v = (r + TOME_DELAY <= TOME_LAND_R ? w * ch * dmg : 0) + ch * fut(d, s - 50, bHit, lk2) + (1 - ch) * fut(d, s - 50, bMiss, lk2);
      if (v > best[0] + 1e-9) best = [v, act];
    };
    const mag = r + TOME_DELAY <= TOME_LAND_R;
    if (b > 0) {
      go('Tb', mag ? ev.Tb : 0, 2, s, b - 1, true);
      if (s >= 50) go2('Ts', ev.T2, 2, b - 1 + 3, b - 1);
    } else {
      const melee = (!NO_MELEE.has(r) || (m16 && r === 16)) && !(lk && ev.Sh != null);   // (no shadow: they swap to melee anyway)
      // Scythe first hit after tome: the scythe (full switch) after a buffed tome attack - not after a bounce (from range)
      if (melee || (sat && lk === true && !NO_MELEE.has(r))) go('Sc', ev.Sc, 5);
      // a claw's last two hitsplats land a tick after the first two: r39 is the last claw
      if (melee && ev.C != null && s >= 50 && r + 2 <= TOME_LAND_R) go('C', ev.C, 4, s - 50);
      if (ev.Sh != null) go('Sh', mag ? ev.Sh : 0, 5);
      if (melee && ev.Cs != null) go('Cs', ev.Cs, 4);
      if (s >= 50) go2('T', ev.T1, 3, 3, 0);
      go('za', mag ? ev.za : 0, 3);
      if (!(lk && ev.Sh != null)) go('wait', 0, 1);
    }
    const out = [best[0], best[1]];
    memo.set(key, out);
    return out;
  };
  const [value, act] = V(r, spec, timer, buff, lock);
  return { act, value };
}
