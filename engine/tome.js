// Zorya's tome in Verzik reds (the chart's Tome Reds): the player's reds attacks are planned for the most expected
// damage on her by the reds' end, from their own numbers - scythe, shadow, claw spec, claw scratch, and the tome.
//
// The tome (magic, from a distance - no push on her attack ticks, out of the r16 bounce):
//   auto: 3 ticks.  Spec (50%): 3 ticks; a hit gives Zorya's Flow - the next 3 tome attacks are buffed (2 ticks each,
//   +150% accuracy / +60% damage).  A spec on a buffed hit (spec while buffed: +300% / +120%) takes that buffed hit's
//   place and, if it hits, adds 3 more (spec > spec(buffed) > 5 buffed hits).  While buffed they keep using the tome.
//   After a buffed (2-tick) tome attack there's no time to switch to melee gear: their next attack is the tome or a shadow -
//   unless 'Scythe first hit after tome' is on: then it can be a scythe in their full melee gear (a full switch).
// With 'Scythe first hit after tome' on, only these sequences (nothing on r11 but a scythe; no claws, plain tome autos or
//   specs while buffed):
//   - 50% on r16: tome r16 - hit: buffed r19 / 21 / 23, scythe r25 / 30 / 35 / 40; miss: scythe r19, r25 (r24 is hers) ...
//   - 100% on r16, a second tome: after a hit on r25 (once the 3 buffed attacks are done), after a miss on r19 - or, with
//     a delay, scythe r25 and the second tome on r30. Each tome hit: 3 buffed attacks, then the scythe.
//   - under 50% on r16: scythe r11 / 16 (in range for the bounce; bounced: a ZCB auto r21) / 21 / 26, tome r31 (r29+
//     off-cadence) - hit: buffed r34 / 36 / 38, scythe r40; miss: scythe r34, r39. With a shadow: a shadow on r16 from a
//     distance (no bounce chance) instead of the scythe.
//   Which of those (delay or not) is the most expected damage from their numbers.
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
export const TOME_SAT_R = 31, TOME_SAT_FROM = 29;   // Scythe first hit after tome: the tome spec from r29 (r31 on cadence)

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
export function tome_plan(p, r, spec, timer, buff, ev = tome_values(p), lock = false, m16 = false, used = p.tome_used || 0, first = p.tome_first ?? null) {
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
  // u: tome specs used; f: how the first went when it was on r16 (1 hit, 0 miss; 'x' not on r16 - no second)
  const V = (r, s, tm, b, lk, u, f) => {
    if (r > TOME_LAST_R) return [0, null];
    const key = `${r}|${s}|${tm}|${b}|${lk || 0}|${u}|${f}`;
    if (memo.has(key)) return memo.get(key);
    let best = [-1, null];
    const fut = (d, s2, b2, lk2 = false, u2 = u, f2 = f) => { const [a, c] = adv(s2, tm, r, r + d); return V(r + d, a, c, b2, lk2, u2, f2)[0]; };
    // ties: the earlier damage (a hair less for each tick later - claw r34 > scythe r38 beats scythe r34 > claw r39)
    const w = 1 - 1e-4 * r;
    const go = (act, val, d, s2 = s, b2 = 0, lk2 = false) => { const v = w * val + fut(d, s2, b2, lk2); if (v > best[0] + 1e-9) best = [v, act]; };
    // a spec that can hit or miss: [chance, damage if it hits]; on a hit buff -> bHit, on a miss -> bMiss
    const go2 = (act, [ch, dmg], d, bHit, bMiss) => {
      const lk2 = act === 'Ts', u2 = act === 'T' ? u + 1 : u;
      const fH = act === 'T' && u === 0 ? (r === 16 ? 1 : 'x') : f, fM = act === 'T' && u === 0 ? (r === 16 ? 0 : 'x') : f;
      const v = (r + TOME_DELAY <= TOME_LAND_R ? w * ch * dmg : 0) + ch * fut(d, s - 50, bHit, lk2, u2, fH) + (1 - ch) * fut(d, s - 50, bMiss, lk2, u2, fM);
      if (v > best[0] + 1e-9) best = [v, act];
    };
    const mag = r + TOME_DELAY <= TOME_LAND_R;
    if (b > 0) {
      go('Tb', mag ? ev.Tb : 0, 2, s, b - 1, true);
      if (s >= 50 && !sat) go2('Ts', ev.T2, 2, b - 1 + 3, b - 1);   // (Scythe first hit after tome: no spec while buffed)
    } else {
      const melee = (!NO_MELEE.has(r) || ((m16 || (sat && ev.Sh == null)) && r === 16)) && !(lk && ev.Sh != null);   // (no shadow: they swap to melee anyway)
      // Scythe first hit after tome: a one-tome sequence never starts on r11 (its 3rd buffed auto puts a shadow on r20 - a shadow
      // hit is worse than a scythe hit): the first tome goes on r16 when they have 50% by then and are free on r16, else r31
      // (r29+). Under 100% before r16, no tome; a two-tome sequence (100%) can still start early.
      // Scythe first hit after tome: the first tome on r16 or (held) r29+; a second one (first on r16) on r19 after a miss,
      // r25 after a hit, or r30 with a delay; never a third
      const tomeOk = !sat || (u === 0 ? r === 16 || r >= TOME_SAT_FROM : u === 1 && (f === 0 || f === 1) && (r === 30 || r === (f === 0 ? 19 : 25)));
      if (sat && r === 16 && s >= 50) { go2('T', ev.T1, 3, 3, 0); const out = [best[0], best[1]]; memo.set(key, out); return out; }
      const sat16 = sat && r === 16 && ev.Sh != null;   // ... with a shadow and no tome yet: shadow r16 from a distance
      // Scythe first hit after tome: the scythe (full switch) after a buffed tome attack - not after a bounce (from range)
      if (melee || (sat && lk === true && !NO_MELEE.has(r))) go('Sc', ev.Sc, 5);
      // a claw's last two hitsplats land a tick after the first two: r39 is the last claw
      // (Scythe first hit after tome: no claw that costs them the r16 tome, or before r29 the r31 one)
      const keeps = (to) => adv(s, tm, r, to)[0] < 50 || adv(s - 50, tm, r, to)[0] >= 50;
      const clawOk = !sat || ((r >= 16 || keeps(16)) && (r >= TOME_SAT_FROM || keeps(TOME_SAT_R)));
      if (!sat && melee && clawOk && ev.C != null && s >= 50 && r + 2 <= TOME_LAND_R) go('C', ev.C, 4, s - 50);   // (Scythe first hit after tome: no claws)
      if (ev.Sh != null) go('Sh', mag ? ev.Sh : 0, 5);
      if (sat16) { const out = [best[0], best[1]]; memo.set(key, out); return out; }
      if (!sat && melee && ev.Cs != null) go('Cs', ev.Cs, 4);
      if (s >= 50 && tomeOk) go2('T', ev.T1, 3, 3, 0);
      if (!sat) go('za', mag ? ev.za : 0, 3);   // (Scythe first hit after tome: no plain tome autos)
      if (!(lk && ev.Sh != null)) go('wait', 0, 1);
    }
    const out = [best[0], best[1]];
    memo.set(key, out);
    return out;
  };
  const [value, act] = V(r, spec, timer, buff, lock, used, first);
  return { act, value };
}
