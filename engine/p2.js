// Port of p2.py - Phase 2 up to the red crab proc. Continues from the P1 state produced by sim.run_p1.
import * as supplies from './supplies.js';
import {
  auto_surge, custom_surge, lb_swap_ok, swap_due, WEAPONS, ARMOUR, FIXED, AMULETS, RINGS, CONFLICTION, PRAYERS,
  hit_chance, fmt,
} from './sim.js';
import * as _sim from './sim.js';
import { shadow_attack } from './gear.js';
import { floordiv, pymod, ga, dget, has, sum, all, sorted, rjust, fx, truthy } from './util.js';

export const P2_HP = { 5: 3500, 4: 3062, 3: 2625, 2: 2625 };
export const P2_REDS = { 5: 1225, 4: 1071, 3: 918, 2: 918 };
export const P2_DEF = { 0: 34276, 1: 25916, 2: 34276, 3: 28006, 4: 65626 };
export const CRAB_DEF = 3136;
export const SCYTHE = WEAPONS['S'];
export const BLOWPIPE = WEAPONS['B'];
export const BP_DELAY = 2;                     // assumed, same as P1
export const PURPLE_CD_ATTACKS = 20;
export const CD_ADD = [[0, 0.50], [3, 0.25], [1, 0.25]];   // purple spawn: per-player cooldown add

export function scythe_roll(p) {
  const gear = p.pieces('S');
  const atk_b = SCYTHE['atk'][1] + sum(gear.map((g) => g['atk'][1]));
  const str_b = SCYTHE['str'] + sum(gear.map((g) => g['str']));
  const [pa, pd] = PRAYERS[p.prayer];
  const eff_a = Math.floor(p.atk * pa) + 8;
  const eff_s = Math.floor(p.str * pd) + 3 + 8;
  const mx = floordiv(eff_s * (str_b + 64) + 320, 640);
  const ch = hit_chance(eff_a * (atk_b + 64), P2_DEF[1]);
  return [ch, mx];
}

export function blowpipe_chance(p) {
  // blowpipe + confliction + Rigour, everything else melee gear
  const gear = [ARMOUR[p.helm], ARMOUR[p.body], ARMOUR[p.legs], FIXED['Infernal cape'],
    FIXED['Avernic treads'], AMULETS[p.amulet], RINGS[p.ring], CONFLICTION];
  const atk_b = BLOWPIPE['atk'][4] + sum(gear.map((g) => g['atk'][4]));
  const eff = Math.floor(p.rng * 1.20) + 8;            // Rigour, rapid
  return [hit_chance(eff * (atk_b + 64), CRAB_DEF), atk_b];
}

export const SHADOW_DELAY_NEAR = 4;          // distance 2-4, +1 tick
export const SHADOW_DELAY_DEEP = 6;          // max distance (10), +1 tick
export const _shadow_cache = {};

/** [use shadow?, hit delay, reason] for a P2 attack outside reds. */
export function shadow_choice(p, hp, mx_hp) {
  if (!truthy(ga(p, 'shadow', false))) {
    return [false, 0, ''];
  }
  if (truthy(p.deep_proc) && hp <= mx_hp * p.deep_thr / 100) {
    return [true, SHADOW_DELAY_DEEP, 'deep proc'];
  }
  if (truthy(ga(p, 'shadow_camp', false))) {
    return [true, SHADOW_DELAY_NEAR, 'camp'];
  }
  if (truthy(p.shadow_lb) && p.ring === 'Lightbearer') {
    return [true, SHADOW_DELAY_NEAR, 'while LB'];
  }
  return [false, 0, ''];
}

export function shadow_numbers(p) {
  const ring = p.ring === 'Lightbearer' ? 'Lightbearer' : 'Ultor ring';
  const key = JSON.stringify([[...p.mage_gear], ring, p.mag]);   // shadow uses their current Magic level (112 when boosted)
  if (!has(_shadow_cache, key)) {
    const [, mx, ch] = shadow_attack([...p.mage_gear, ring], p.mag, { def_roll: P2_DEF[3] });
    _shadow_cache[key] = [ch, mx];
  }
  return _shadow_cache[key];
}

// Purple spawn movement (3-5 man), ticks counted from the Verzik attack that spawns the purple (= 0).
// From the boak chart: ticks the player can't attack, the last of them, and the purple DC's first blowpipe tick.
export const LAST_SWING = true;                // swing that lines up with the shield cycle start still counts
export const PURPLE_FIRST_HEAL = 8;            // purple heals from this many ticks after spawning
export const BOAK = {
  West: { block: new Set([0, 3, 4, 5, 8, 9, 10]), bp: 11 },
  East: { block: new Set([0, 4, 7, 8, 9, 12, 13, 14]), bp: 16 },
};

export const EAST_PATTERNS = ['A', '0-T'];   // B, C and FLEX: not added yet

export function boak_side(p) {
  const e = ga(p, 'east_boak', null), w = ga(p, 'west_boak', null);
  if (e == null || w == null || e === w) {
    throw new Error(`${p.name}: set East Boak / West Boak (one TRUE, the other FALSE)`);
  }
  if (truthy(e) && !EAST_PATTERNS.includes(ga(p, 'east_pattern', 'A'))) {
    throw new Error(`${p.name}: East Pattern ${p.east_pattern} isn't available yet (use A or 0-T)`);
  }
  return truthy(e) ? 'East' : 'West';
}

export function pick_add(rng) {
  const r = rng.random();
  let acc = 0;
  for (const [v, pr] of CD_ADD) {
    acc += pr;
    if (r < acc) {
      return v;
    }
  }
  return CD_ADD[CD_ADD.length - 1][0];
}

const hkey = (h) => [h[0], h[1], h[2]];

export function run_p2(p1, team, rng, log = null) {
  for (const _p of p1['players']) {
    _p.pool.phase = 'P2'; _p.pool.scb_res = 0; _p.sc_at = null;
  }
  const L = log != null ? ((s) => { log.push(s); }) : ((s) => {});
  const players = p1['players'], pid = p1['pid'];
  const rank = new Map(pid.map((p, k) => [p, k]));
  const K = p1['end'] + 14;
  let hp = P2_HP[team];
  const mx_hp = P2_HP[team], reds_at = P2_REDS[team];
  const flags = [];
  let vq = [];                       // [land, rank, sub, label, dmg, player]
  L(`\n=== PHASE 2 === K = t${K} (first player attacks queued). Verzik HP ${hp}, reds below ${reds_at}`);
  for (const p of players) {
    p.next_attack = K;
    p.thrall_next = null;
    p.p2_dmg = 0;
    p.mode = 'melee';          // melee | purple_scythe | blowpipe
    p.bp_shots = 0;
    p.ring_swapped_at = null;
    p.fallback_on = false;
    p.purple_pending = Boolean(truthy(p.purple) || truthy(ga(p, 'purple2nd', false)));   // still owed a purple-pop +15
    p.boak_block = new Set();   // absolute ticks they can't attack while moving for the purple (3-5 man)
    p.bp_from = null;           // purple DC: first tick they may start blowpiping
    if (team !== 2) {
      p.boak = boak_side(p);
    }
  }
  // trio rule: P1 died with a Dawn spec to spare (e.g. 11 of 12) -> the shadow player camps LB to 100%
  if (team === 3) {
    let planned = 0;
    for (const p of players) for (const a of Object.values(p.actions)) if (a === 'D') planned += 1;
    const used = sum(players.map((p) => p.dawns_used));
    const sp = players.find((p) => truthy(p.shadow) && !p.dead) ?? null;
    if (sp && used < planned) {
      sp.fallback_on = true;
      sp.target_spec = 100;
      sp.ring = 'Lightbearer';
      L(`t${rjust(K, 4)} P1 died after ${used} of ${planned} Dawn specs - ${sp.name} (shadow) camps Lightbearer to 100% in P2`
        + (truthy(sp.shadow_lb) ? ', shadowing while on LB' : ''));
    }
  }
  let regular = 0;
  let attacks_since_purple = PURPLE_CD_ATTACKS;
  let crab = null;                   // {spawn, alive, heals, popped_tick, pop_dmg_tick}
  const crab_stats = { spawned: 0, bp_shots: 0, healed: 0, dmg: 0, spawn_tick: null, pop_tick: null, spawns: [] };
  let purple_dc = players.find((p) => truthy(p.purple) && !p.dead) ?? null;
  let reds_tick = null;
  let hp_cross = null, hp_tick = null;
  let proc_tick = null, shield_tick = null;
  const shadow_stats = { casts: 0, dmg: 0, late_dmg: 0, deep_casts: 0 };
  let t = K;
  Object.assign(_sim.CAMP, { duo: (team === 2), dc_paid: [] });

  const pay_in_flight = () => {
    crab['spec_paid'] = true;                    // blowpipe hit still in flight at the shield: +15 now
    const old = purple_dc.spec;
    purple_dc.spec = Math.min(100, purple_dc.spec + 15); purple_dc.gain_src = 'other'; purple_dc.purple_pending = false; purple_dc.purple_owed = false;
    L(`t${rjust(t, 4)} purple crab pop (in flight) -> ${purple_dc.name} spec ${fx(old)}% -> ${fx(purple_dc.spec)}%`);
  };
  const flush_queued = () => {
    // everything queued before the shield still lands as damage
    const pend = sorted(vq, hkey);
    if (crab && truthy(dget(crab, 'pop_dmg_tick')) && team !== 2) {
      pend.push([crab['pop_dmg_tick'], -1, 0, 'Purple crab explosion', rng.randint(65, 75), null]);
    }
    for (const h of pend) {
      hp -= h[4];
      if (h[5] != null) {
        h[5].p2_dmg += h[4];
      }
      if (h[3] === 'Purple crab explosion') {
        crab_stats['dmg'] += h[4];
      }
      if (h[3].startsWith('Shadow')) {
        shadow_stats['late_dmg'] += h[4];
      }
      L(`t${rjust(h[0], 4)} (queued before shield) ${h[5] ? (h[5].name + ': ') : ''}${h[3]} ${h[4]} -> Verzik ${hp}`);
    }
    L(`     Proc depth: crossing hit ${hp_cross} (${fx(hp_cross / mx_hp * 100, 1)}%), at shield start ${hp_tick} ` +
      `(${fx(hp_tick / mx_hp * 100, 1)}%), after queued damage ${hp} (${fx(hp / mx_hp * 100, 1)}%)`);
  };

  while (t < K + 600) {
    if (_sim.FLAGS.LB_CAMP && team === 2) {             // estimated set-2 r11 from the pace so far (camp-LB test mode)
      const done = mx_hp - hp;
      const rate = (t - K >= 20 && done > 0) ? done / (t - K) : 12.0;
      const est_reds = t + Math.max(0, hp - reds_at) / Math.max(rate, 1.0) + 2;
      Object.assign(_sim.CAMP, { now: t, eta: Math.trunc(est_reds) + 55 });
    }
    if (all(players.map((q) => q.dead))) {
      L(`t${rjust(t, 4)} WIPE - everyone dead in P2`); break;
    }
    const verz_attack = (t - (K + 1)) >= 0 && pymod(t - (K + 1), 4) === 0;
    // ---- Verzik step: cycle-start crab effects, then queue (damage lands), then attack
    if (verz_attack && crab) {
      if (crab['alive'] && t >= crab['first_heal']) {
        const h = rng.randint(9, 11);
        const old = hp;
        hp = Math.min(mx_hp, hp + h);
        crab_stats['healed'] += hp - old;
        L(`t${rjust(t, 4)} PURPLE CRAB heals Verzik ${hp - old} -> ${hp}`);
      }
      if (dget(crab, 'pop_dmg_tick') === t) {
        const d = rng.randint(65, 75);
        vq.push([t, -1, 0, 'Purple crab explosion', d, null]);
        crab['pop_dmg_tick'] = null;
      }
    }
    if (shield_tick != null && t === shield_tick && crab && truthy(dget(crab, 'pop_at')) && !truthy(dget(crab, 'spec_paid'))) {
      pay_in_flight();
    }
    if (shield_tick != null && t === shield_tick) {
      reds_tick = t;
      hp_tick = hp;
      L(`t${rjust(t, 4)} HEALING PHASE STARTS (start of her cycle after the proc on t${proc_tick}). Verzik ${hp}`);
      // the proc was already queued, so anyone whose attack lines up with this cycle start still swings once more
      // (their hit is queued before the healing starts in her turn)
      for (const p of (LAST_SWING ? pid : [])) {
        if (p.dead || t < p.next_attack || !['melee', 'purple_scythe'].includes(p.mode) || p.boak_block.has(t)) {
          continue;
        }
        let [sh, sh_delay, sh_why] = shadow_choice(p, hp, mx_hp);
        if (!sh && truthy(ga(p, 'shadow31', false))) {
          [sh, sh_delay, sh_why] = [true, SHADOW_DELAY_NEAR, '3:1'];
        }
        if (sh) {
          const [ch, mx] = shadow_numbers(p);
          const d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
          vq.push([t + sh_delay, rank.get(p), 0, `Shadow (${sh_why})`, d, p]);
          shadow_stats['casts'] += 1; shadow_stats['dmg'] += d;
          L(`t${rjust(t, 4)} ${p.name}: last swing before the shield - SHADOW [${sh_why}] -> ${d}`);
        } else {
          const [ch, mx] = scythe_roll(p);
          const sp = [];
          [mx, floordiv(mx, 2), floordiv(mx, 4)].forEach((m, k) => {
            const d = rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0;
            sp.push(d);
            vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, d, p]);
          });
          L(`t${rjust(t, 4)} ${p.name}: last swing before the shield - Scythe -> [${sp.join(', ')}]`);
        }
        p.next_attack = t + 5;
        p.last_swing = true;
      }
      flush_queued();
      break;
    }
    const landing = sorted(vq.filter((h) => h[0] === t), (h) => [h[1], h[2]]);
    vq = vq.filter((h) => h[0] !== t);
    for (const h of landing) {
      const [, , , label, dmg, p] = h;
      hp -= dmg;
      if (p != null) {
        p.p2_dmg += dmg;
      }
      if (label === 'Purple crab explosion') {
        crab_stats['dmg'] += dmg;
      }
      L(`t${rjust(t, 4)} ${p ? p.name + ': ' : ''}${label} ${dmg} -> Verzik ${hp}`);
      if (hp <= reds_at && proc_tick == null) {
        proc_tick = t;
        hp_cross = hp;
        shield_tick = t + pymod(-(t - (K + 1)), 4);          // start of her next cycle (this tick if it is one)
        L(`t${rjust(t, 4)} AT/BELOW 35% on this hit: Verzik ${hp} (${fx(hp / mx_hp * 100, 1)}%). ` +
          `Healing phase starts at her next cycle, t${shield_tick}.`);
      }
    }
    if (shield_tick != null && t === shield_tick && crab && truthy(dget(crab, 'pop_at')) && !truthy(dget(crab, 'spec_paid'))) {
      pay_in_flight();
    }
    if (shield_tick != null && t === shield_tick) {
      reds_tick = t;
      hp_tick = hp;
      L(`t${rjust(t, 4)} HEALING PHASE STARTS this tick (proc landed on the start of her cycle). Verzik ${hp}`);
      flush_queued();
      break;
    }
    if (verz_attack) {
      const n_att = floordiv(t - (K + 1), 4) + 1;
      if ((regular + 1) % 5 === 0) {
        regular += 1;
        attacks_since_purple += 1;
        const victim = rng.choice(players.filter((p) => !p.dead));
        const vd = rng.random() >= 1 / team ? 5 : 8;
        const dmg = rng.randint(20, 25);
        vq.push([t + vd, -1, 1, 'Lightning rebound', dmg, null]);
        victim.pending_hits = [...ga(victim, 'pending_hits', []), [t + 2, 7]];
        L(`t${rjust(t, 4)} VERZIK attack #${n_att}: LIGHTNING -> ${victim.name} (7 on t${t + 2}); ` +
          `rebound ${dmg} on Verzik t${t + vd}`);
      } else if ((crab == null || (!crab['alive'] && !truthy(dget(crab, 'pop_dmg_tick'))))
          && attacks_since_purple >= PURPLE_CD_ATTACKS && rng.random() < 1 / 3) {
        attacks_since_purple = 0;
        crab = { spawn: t, alive: true, first_heal: t + PURPLE_FIRST_HEAL, ignored: false };
        crab_stats['spawned'] += 1;
        crab_stats['spawn_tick'] = t;
        crab_stats['spawns'].push(hp / mx_hp * 100);
        if (team === 2) {
          // duo: 1st Purple DC pops the 1st purple; 2nd Purple DC (if set) pops the 2nd, else the 1st DC again
          const first = players.find((q) => truthy(q.purple) && !q.dead) ?? null;
          const second = (players.find((q) => truthy(ga(q, 'purple2nd', false)) && !q.dead) ?? null) || first;
          purple_dc = crab_stats['spawned'] === 1 ? first : second;
        }
        if (purple_dc && (team !== 2 || crab_stats['spawned'] >= 2) && hp <= mx_hp * purple_dc.purple2_thr / 100) {
          crab['ignored'] = true;               // this low (duo: 2nd purple only) it's left until the reds shield
        }
        const adds = [];
        for (const p of players) {
          if (p.dead || team === 2) {                    // duos: nobody loses ticks to the purple spawn
            continue;
          }
          const B_ = BOAK[p.boak];
          if (p === purple_dc && !crab['ignored']) {
            p.bp_from = t + B_['bp'];
          }
          if (p === purple_dc && truthy(p.shadow)) {
            adds.push(`${p.name} none (purple DC with shadow)`);
          } else if (p.mode === 'melee' && shadow_choice(p, hp, mx_hp)[0]) {
            adds.push(`${p.name} none (shadowing)`);       // shadowing at the spawn: no lost ticks
          } else if (p.boak === 'East' && p.east_pattern === '0-T') {
            adds.push(`${p.name} none (East 0-T)`);        // East pattern 0-T: keeps attacking, no lost ticks
          } else {
            p.boak_block = new Set([...B_['block']].map((d) => t + d));
            adds.push(`${p.name} ${p.boak} boak`);
          }
        }
        L(`t${rjust(t, 4)} VERZIK attack #${n_att}: PURPLE CRAB spawns. Movement: ${adds.join(', ')}`
          + ((purple_dc && team !== 2) ? `; ${purple_dc.name} blowpipes from t${purple_dc.bp_from}` : '')
          + `; first heal t${t + 8}`);
        if (purple_dc && !crab['ignored'] && team === 2) {
          purple_dc.mode = 'purple_scythe';
        } else if (crab['ignored']) {
          L(`t${rjust(t, 4)} purple #${crab_stats['spawned']} at ${fx(hp / mx_hp * 100, 1)}% (<= ${purple_dc.purple2_thr}%): left until the reds shield`);
        }
      } else {
        regular += 1;
        attacks_since_purple += 1;
        L(`t${rjust(t, 4)} VERZIK attack #${n_att}: regular`);
      }
    }
    // ---- players
    for (const p of pid) {
      if (p.dead) {
        continue;
      }
      for (const [lt, d] of ga(p, 'pending_hits', []).filter((x) => x[0] === t)) {
        p.hp -= d;
        supplies.check_death(p, 'P2', L, t);
        L(`t${rjust(t, 4)} ${p.name}: lightning hits for ${d} -> ${p.hp} HP`);
      }
      p.pending_hits = ga(p, 'pending_hits', []).filter((x) => x[0] !== t);
      // spec regen
      if (p.spec < 100) {
        p.regen_timer += 1;
        if (p.regen_timer >= p.regen_period()) {
          p.regen_timer = 0;
          const old = p.spec;
          p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
          L(`t${rjust(t, 4)} ${p.name}: regen ${fx(old)}% -> ${fx(p.spec)}%`);
        }
      } else {
        p.regen_timer = 0;
      }
      // ring swap (P2 only, one-way)
      if (swap_due(p)) {
        p.ring = 'Ultor';
        p.regen_timer = 0;
        p.ring_swapped_at = t;
        L(`t${rjust(t, 4)} ${p.name}: spec ${fx(p.spec)}% >= target ${fx(Number(p.target_spec))}% -> swaps to Ultor ` +
          `(regen timer reset, now 50t)`);
      }
      custom_surge(p, t, L); auto_surge(p, t, L);
      // supplies: under 90 HP, brew between swings and super combat before the next one (never attack drained)
      if (ga(p, 'sc_at', null) === t) {
        p.sc_at = null;
        p.pool.scb_res -= 1;
        if (p.pool.take('scb')) {
          supplies.drink_scb(p, t, 'P2 brew'); p.sip_ready = t + 3;
        }
      } else if (t >= p.sip_ready && p.hp < 90 && p.next_attack - t >= 3 && supplies.scb_ok(p, players, (q) => 90)
          && !(team === 2 && truthy(p.shadow))
          && p.pool.take('brew')) {
        p.pool.scb_res += 1;
        const old = p.hp;
        supplies.drink_brew(p);
        p.sip_ready = t + 3; p.sc_at = t + 3;
        L(`t${rjust(t, 4)} ${p.name}: brew ${old} -> ${p.hp} (super combat t${t + 3})`);
      }
      supplies.catchup(p, t, L);                      // failsafe: still below max after a window - pot while attacking
      // attack
      if (t >= p.next_attack && p.boak_block.has(t)) {
        p.next_attack = t + 1;                          // moving for the purple (boak): can't attack this tick
        L(`t${rjust(t, 4)} ${p.name}: ${p.boak} boak, can't attack -> +1t`);
      } else if (t >= p.next_attack && p.bp_from != null && t >= p.bp_from && crab && crab['alive']
          && !truthy(dget(crab, 'pop_at')) && p.mode !== 'blowpipe') {
        p.mode = 'blowpipe';                            // purple DC: blowpipe tick reached, off cooldown
        p.bp_from = null;
      }
      if (t >= p.next_attack) {
        const [sh, sh_delay, sh_why] = shadow_choice(p, hp, mx_hp);
        if (p.mode === 'melee' && sh) {
          const [ch, mx] = shadow_numbers(p);
          const d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
          vq.push([t + sh_delay, rank.get(p), 0, `Shadow (${sh_why})`, d, p]);
          p.next_attack = t + 5;
          shadow_stats['casts'] += 1; shadow_stats['dmg'] += d;
          shadow_stats['deep_casts'] += (sh_why === 'deep proc') ? 1 : 0;
          if (p.ring === 'Lightbearer') {
            p.lb_p2 = ga(p, 'lb_p2', 0) + 1;
          }
          L(`t${rjust(t, 4)} ${p.name}: SHADOW [${sh_why}] (acc ${fx(ch * 100, 1)}%, max ${mx}, lands t${t + sh_delay}) -> ${d}`);
          if (p.thrall_next == null) {
            p.thrall_next = t + rng.randint(1, 2);
          }
        } else if (verz_attack && p.mode === 'melee' && truthy(ga(p, 'shadow31', false))) {
          // 3:1 - the attack that would collide with Verzik becomes a shadow (no lost tick)
          const [ch, mx] = shadow_numbers(p);
          const d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
          vq.push([t + SHADOW_DELAY_NEAR, rank.get(p), 0, 'Shadow (3:1)', d, p]);
          p.next_attack = t + 5;
          shadow_stats['casts'] += 1; shadow_stats['dmg'] += d;
          L(`t${rjust(t, 4)} ${p.name}: SHADOW [3:1] (acc ${fx(ch * 100, 1)}%, max ${mx}, lands t${t + SHADOW_DELAY_NEAR}) -> ${d}`);
          if (p.thrall_next == null) {
            p.thrall_next = t + rng.randint(1, 2);
          }
        } else if (verz_attack && p.mode !== 'blowpipe') {
          p.next_attack = t + 1;
          L(`t${rjust(t, 4)} ${p.name}: attack lines up with Verzik's attack -> +1t`);
        } else if (p.mode === 'blowpipe') {
          const [ch] = blowpipe_chance(p);
          p.bp_shots += 1;
          crab_stats['bp_shots'] += 1;
          const ok = rng.random() < ch;
          L(`t${rjust(t, 4)} ${p.name}: blowpipe at purple crab #${p.bp_shots} (acc ${fx(ch * 100, 1)}%) -> `
            + (ok ? `PASSES, pops on t${t + BP_DELAY}` : 'miss'));
          p.next_attack = t + 2;
          if (ok) {
            // a passing poison hit QUEUED is enough: no more heals, explosion on her next cycle start
            p.mode = 'melee';
            crab['pop_at'] = t + BP_DELAY; p.purple_owed = true;
            crab['alive'] = false;
            let nxt = t + 1;
            while (pymod(nxt - (K + 1), 4) !== 0) {
              nxt += 1;
            }
            crab['pop_dmg_tick'] = nxt; crab['expl_t'] = nxt;
            crab_stats['pop_tick'] = t;
            L(`t${rjust(t, 4)} purple crab won't heal again; explosion on her next cycle, t${nxt}`);
          }
        } else {
          const [ch, mx] = scythe_roll(p);
          const splats = [];
          [mx, floordiv(mx, 2), floordiv(mx, 4)].forEach((m, k) => {
            const d = rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0;
            splats.push(d);
            vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, d, p]);
          });
          p.next_attack = t + 5;
          L(`t${rjust(t, 4)} ${p.name}: Scythe (acc ${fx(ch * 100, 1)}%, max ${mx}, ring ${p.ring}) -> [${splats.join(', ')}]`);
          if (p.ring === 'Lightbearer') {
            p.lb_p2 = ga(p, 'lb_p2', 0) + 1;
          }
          if (p.thrall_next == null) {
            p.thrall_next = t + rng.randint(1, 2);
          }
          if (p.mode === 'purple_scythe') {
            p.mode = 'blowpipe';
            L(`t${rjust(t, 4)} ${p.name}: last scythe before blowpiping the crab (blowpipe from t${p.next_attack})`);
          }
        }
      }
      if (p.thrall_next != null && t === p.thrall_next) {
        vq.push([t + 1, rank.get(p), 9, 'Thrall', rng.randint(0, 3), p]);
        p.thrall_next = t + 4;
      }
    }
    // crab pop resolution
    if (crab && dget(crab, 'pop_at') === t && !truthy(dget(crab, 'spec_paid'))) {
      crab['spec_paid'] = true;
      const nxt = dget(crab, 'expl_t', t);
      const old = purple_dc.spec;
      purple_dc.spec = Math.min(100, purple_dc.spec + 15); purple_dc.gain_src = 'other'; purple_dc.purple_pending = false; purple_dc.purple_owed = false;
      L(`t${rjust(t, 4)} PURPLE CRAB POPS after ${purple_dc.bp_shots} blowpipe shot(s). Explosion t${nxt}. ` +
        `${purple_dc.name} spec ${fx(old)}% -> ${fx(purple_dc.spec)}%`);
    }
    t += 1;
  }
  return {
    pid, K, proc_tick, shadow: shadow_stats, reds_tick, hp, hp_cross, hp_tick, max_hp: mx_hp, crab: crab_stats, flags, players,
    spec_reds: players.map((p) => p.spec), rings: players.map((p) => p.ring),
    fallback: players.map((p) => p.fallback_on), purple: crab, regular, purple_dc,
  };
}
