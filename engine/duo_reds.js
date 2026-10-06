// Port of duo_reds.py - Duo reds: a planned 2-down. Two sets of red crabs back to back.
// See the Python module docstring for the full rules.
import { floordiv, pymod, pyround, ga, truthy, range, sum, any, sorted, dget, has, rjust, fx, maxBy } from './util.js';
import * as supplies from './supplies.js';
import * as _sim from './sim.js';
import { auto_surge, custom_surge, lb_swap_ok, swap_due, ARMOUR, FIXED, AMULETS, RINGS, CONFLICTION, PRAYERS, hit_chance } from './sim.js';
import { scythe_roll, P2_DEF, P2_HP, shadow_numbers, SHADOW_DELAY_NEAR, blowpipe_chance, BP_DELAY } from './p2.js';
import {
  CRAB_BASE_HP, CRAB_DEF_ROLL, CLAW, SHIELD, VERZ_ATTACKS, CRAB_HEAL_R, melee_max_acc, claw_spec,
  project_two_claws,
} from './reds.js';
import * as p3 from './p3.js';

export const LAST_CRAB_R = 40;            // last tick an attack on a crab can be queued (lands before the r41 heal)
export const LAST_R = 44;                 // last tick players attack in set 1
export let CRAB_HP = 35;                  // default; the chart's 'Crab HP threshold' overrides
export const CRAB_BIAS = 1.0;             // set 1: hit the crab only if its value beats Verzik's by this factor
export const ADAPT_CUT = null;            // set 1: Verzik HP + both crabs' HP (% of max) above which players go all-in on Verzik
export const SET1_CLAW = false;           // shadow player claws in set 1 when they would still have SET1_CLAW_NEED% on set-2 r11
export const SET1_CLAW_NEED = 100;
export const ADAPT_DIR = 'behind';        // 'behind': all-in on Verzik while above the cut; 'ahead': while at/below it
export const SET2_ULTOR = true;           // set 2: shadow player who can't reach a 2nd claw by r31 on LB swaps to Ultor
export const FILL_FROM = 36;              // set 1: blowpipe / ayak / scratch tick fills only from r36
export let LAST_HIT_THR = 2.0;            // set-2 r40: under this % of P2 HP, scythe instead of the halberd (chart overrides)
export const CYCLE0 = 12;                 // Verzik's 4-tick cycle in reds: r12, r16, ...

const plist = (a) => `[${a.join(', ')}]`;

// ---------------------------------------------------------------- weapon numbers
export function ayak_vs(p, def_roll) {
  const gear = p.pieces('E');
  const atk_b = 30 + sum(gear.map((g) => g['atk'][3]));
  const mdmg = sum(gear.map((g) => dget(g, 'mdmg', 0)));
  const mx = floordiv((floordiv(p.mag, 3) - 6) * (100 + mdmg), 100);
  return [hit_chance((p.mag + 9) * (atk_b + 64), def_roll), mx];
}

export function bp_vs(p, def_roll) {
  const gear = [ARMOUR[p.helm], ARMOUR[p.body], ARMOUR[p.legs], FIXED['Infernal cape'], FIXED['Avernic treads'],
    AMULETS[p.amulet], RINGS[p.ring], CONFLICTION];
  const atk_b = 30 + sum(gear.map((g) => g['atk'][4]));
  const rs = 55 + sum(gear.map((g) => dget(g, 'rstr', 0)));
  const eff = Math.floor(p.rng * 1.20) + 8;                          // Rigour switch
  const mx = Math.floor(0.5 + (Math.floor(p.rng * 1.23) + 8) * (rs + 64) / 640);
  return [hit_chance(eff * (atk_b + 64), def_roll), mx];
}

const _exp_capped_memo = new Map();
/** E[min(sum of hits, cap)]: each hit lands with prob ch for max(1, U(0, m)). (lru_cache in Python) */
export function _exp_capped(ch, maxes, cap) {
  const key = JSON.stringify([ch, maxes, cap]);
  if (_exp_capped_memo.has(key)) return _exp_capped_memo.get(key);
  let dist = new Map([[0, 1.0]]);
  for (const m of maxes) {
    const hit = new Map();
    for (const v of range(0, m + 1)) {
      const kk = Math.max(1, v);
      hit.set(kk, (hit.has(kk) ? hit.get(kk) : 0) + ch / (m + 1));
    }
    hit.set(0, (hit.has(0) ? hit.get(0) : 0) + (1 - ch));
    const nd = new Map();
    for (const [a, pa] of dist) {
      for (const [b, pb] of hit) {
        const s = Math.min(a + b, cap);
        nd.set(s, (nd.has(s) ? nd.get(s) : 0) + pa * pb);
      }
    }
    dist = nd;
  }
  let out = 0;
  for (const [v, pr] of dist) out += v * pr;
  if (_exp_capped_memo.size >= 200000) _exp_capped_memo.clear();
  _exp_capped_memo.set(key, out);
  return out;
}

export function crab_scythe_exp(p, crab_hp) {
  const [ch, mx] = melee_max_acc(p, 125, 75, CRAB_DEF_ROLL);
  return _exp_capped(pyround(ch, 3), [mx, floordiv(mx, 2)], Math.max(0, crab_hp));
}

export function verzik_scythe_exp(p) {
  const [ch, mx] = scythe_roll(p);
  return _exp_capped(pyround(ch, 3), [mx, floordiv(mx, 2), floordiv(mx, 4)], 10 ** 6);
}

export function roll(rng, ch, m) {
  return rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0;
}

// ---------------------------------------------------------------- schedule projection (set 1)
/** Last attack tick <= r44 if every attack from tick a goes to Verzik (collision = wait 1). */
export function project_last(a) {
  let last = null;
  while (a <= LAST_R) {
    if (has(VERZ_ATTACKS, a)) {
      a += 1;
      continue;
    }
    last = a;
    a += 5;
  }
  return last;
}

/** True when none of their remaining swings (scything every 5 from tick a) can line up with her attacks. */
export function no_collision_ahead(a) {
  while (a <= LAST_R) {
    if (has(VERZ_ATTACKS, a)) return false;
    a += 5;
  }
  return true;
}

/** Collision-tick swings from tick a (exclusive) up to r37, scything every 5 ticks. */
export function collisions_ahead(a, crab_hits_on_collisions = true) {
  let k = 0;
  a += 5;
  while (a <= LAST_CRAB_R) {
    if (has(VERZ_ATTACKS, a)) k += 1;
    a += 5;
  }
  return k;
}

// ---------------------------------------------------------------- the two sets
export function run_duo_reds(p2r, cfgs, rng, log = null) {
  for (const _p of p2r['players']) {
    _p.pool.phase = 'reds'; _p.pool.scb_res = 0; _p.sc_at = null;
  }
  const L = log != null ? ((s) => log.push(s)) : ((s) => null); L.on = log != null;   // log text is only built when a log is kept
  const players = p2r['players'], pid = p2r['pid'];
  const rank = new Map(pid.map((p, k) => [p, k]));
  const team = 2;
  let hp = p2r['hp'];
  const mx_hp = P2_HP[team];
  const crab_hp0 = floordiv(CRAB_BASE_HP * P2_HP[team], 3500);
  const st = {
    crab_heal1: 0, crab_heal2: 0, crab_left1: null, dc1: [], fills: [], crab_swings: 0, waits: 0, claws: 0,
    shadow: 0, halb: 0, scratch: 0, purple_in_reds: false, purple_popped_r: null, purple_heal: 0, blood_total: 0,
    kill_set: null, kill_r: null, hp_after1: null, bounce: false, bounced: null, ruby: 0, crab_left: null,
  };
  const purple_dc = dget(p2r, 'purple_dc') || (players.find((p) => p.purple && !p.dead) ?? null);
  const purple = dget(p2r, 'purple');
  let pc = null;
  if (truthy(purple) && purple_dc && (purple['alive'] || dget(purple, 'pop_dmg_tick'))) {
    pc = { alive: purple['alive'], expl_due: Boolean(dget(purple, 'pop_dmg_tick')), next_cycle: null };
    st['purple_in_reds'] = true;
    if (purple['alive']) {
      purple_dc.mode = 'purple_bp';
      L.on && L(`     PURPLE CRAB carried into reds (${dget(purple, 'ignored') ? 'ignored 2nd purple' : 'still alive'}): `
        + `${purple_dc.name} blowpipes it from the shield`);
    } else {
      L.on && L('     Purple crab explosion held until r12');
    }
  }
  let vq = [];                       // [land_t, rank, sub, label, amount, player, kind]
  let kill = null;

  if (truthy(cfgs) && dget(cfgs[0], 'crabHp') != null) CRAB_HP = cfgs[0]['crabHp'];
  if (truthy(cfgs) && dget(cfgs[0], 'lastHitThr') != null) LAST_HIT_THR = cfgs[0]['lastHitThr'];
  const perfect1 = truthy(cfgs) ? dget(cfgs[0], 'perfectSet1', true) : true;
  players.forEach((p, i) => {
    p.perfect1 = perfect1;
    p.purple_pending = Boolean(pc && pc['alive'] && p === purple_dc);   // only a purple carried in still pays +15
    p.red_crab = dget(cfgs[i], 'redCrab') || ['West', 'East'][i];
    p.thrall_next = null;
    p.reds_dmg = 0;
    if (ga(p, 'mode', 'melee') !== 'purple_bp') p.mode = 'melee';
  });

  if (SET2_ULTOR) {
    // decided at the first reds proc: a shadow player on LB who can't have a 2nd set-2 claw by r31 even on LB
    // goes to Ultor now and plays claw > shadow > scythes (halberd on r40) in set 2
    const P0 = p2r['reds_tick'];
    for (const p of players) {
      if (ga(p, 'shadow', false) && p.ring === 'Lightbearer' && !p.dead) {
        const owner = Number(truthy(p.west)) + Number(truthy(p.east));
        const ok = two_claws_on_lb(p, P0, owner, ga(p, 'purple_pending', false));
        st['lb_projection'] = dget(st, 'lb_projection', {}); st['lb_projection'][p.name] = ok;
        if (!ok) {
          p.ring = 'Ultor'; p.regen_timer = 0;
          st['set2_ultor'] = dget(st, 'set2_ultor', 0) + 1;
          L.on && L(`t${rjust(P0, 4)} ${p.name}: on ${fx(p.spec)}% - no 2nd set-2 claw by r31 even on Lightbearer -> `
            + 'swaps to Ultor at the first reds proc');
        }
      }
    }
  }
  let P, P1, crabs;
  for (const s of [1, 2]) {
    P = s === 1 ? p2r['reds_tick'] : P1 + LAST_R;
    if (s === 1) P1 = P;
    crabs = { West: crab_hp0, East: crab_hp0 };
    for (const p of players) {
      p.crab_n = 0;                     // set 1: crab hits so far (opening two)
      p.reds_n = 0;
      p.first_col_done = false;
      p.scratch_done = false;
      p.claws_done = 0;
      p.plan = null;
      p.dc_swing_done = (s === 1) || p.red_crab === 'None';
      p.filled = false;                 // set-1 tick fill used
      p.thrall_next = null;             // thralls stop with the shield; restart once they hit Verzik again
      if (p.next_attack < P + (s === 2 ? 1 : 0)) p.next_attack = P + (s === 2 ? 1 : 0);
    }
    // the shield is invulnerable: heal up under 90 HP (sharks only in set 2, under 70 with a super combat left,
    // blowpiping their crab instead of the death charge scythe; set 1 crabs need real damage)
    for (const p of supplies.by_hp(players)) {
      p.crab_bp = false;
      if (p.dead || p.hp >= 90) continue;
      if (s === 2 && p.hp < 70 && p.pool.left['scb'] > 0 && p.pool.left['shark'] > 0 && !p.dc_swing_done) {
        p.crab_bp = true;
      } else {
        supplies.window(p, 4, L, P, `s${s} shield `, { sharks: false, brews: !p.shadow });   // shadow: no brews before P3
      }
    }
    L.on && L(`\n=== DUO REDS SET ${s} === r0 = t${P}. Verzik ${hp} (${fx(hp / mx_hp * 100, 1)}%). Crabs ${crab_hp0} HP each`);
    const r_start = s === 1 ? 0 : 1;
    const r_end = s === 1 ? LAST_R : CRAB_HEAL_R;
    for (const r of range(r_start, r_end + 1)) {
      const t = P + r;
      Object.assign(_sim.CAMP, { duo: true, now: t, eta: P1 + LAST_R + 11, dc_paid: [...st['dc1']] });
      // ---- damage lands
      const landing = sorted(vq.filter((h) => h[0] === t), (h) => [h[1], h[2]]);
      vq = vq.filter((h) => h[0] !== t);
      for (const h of landing) {
        const [, , , label, amt, p, kind] = h;
        if (kind.startsWith('crab:')) {
          const side = kind.slice(5);
          if (crabs[side] <= 0) continue;
          crabs[side] = Math.max(0, crabs[side] - amt);
          L.on && L(`t${rjust(t, 4)} s${s} r${r} ${p.name}: ${label} on ${side} crab ${amt} -> crab ${crabs[side]}`);
          if (crabs[side] === 0 && s === 1) {
            const owner = players.find((q) => truthy(side === 'West' ? q.west : q.east)) ?? null;
            if (owner) {
              const old = owner.spec; owner.spec = Math.min(100, owner.spec + 15); owner.gain_src = 'other';
              st['dc1'].push(owner.name);
              L.on && L(`t${rjust(t, 4)} s${s} r${r} ${side} crab dies -> ${owner.name} DC spec ${fx(old)}% -> ${fx(owner.spec)}%`);
            }
          }
          continue;
        }
        if (kind === 'purple') {
          const old = purple_dc.spec; purple_dc.spec = Math.min(100, purple_dc.spec + 15); purple_dc.gain_src = 'other'; purple_dc.purple_pending = false; purple_dc.purple_owed = false;
          st['purple_popped_r'] = [s, r];
          L.on && L(`t${rjust(t, 4)} s${s} r${r} PURPLE CRAB POPS -> ${purple_dc.name} spec ${fx(old)}% -> ${fx(purple_dc.spec)}%`);
          continue;
        }
        hp -= amt;
        p.reds_dmg += amt;
        L.on && L(`t${rjust(t, 4)} s${s} r${r} ${p.name}: ${label} ${amt} -> Verzik ${hp}`);
        if (hp <= 0 && kill == null) kill = t;
      }
      // ---- purple crab: nothing during the shield; from r12 on her cycle: heal if alive, explode if popped
      if (pc && s === 1 && r >= CYCLE0 && pymod(r - CYCLE0, 4) === 0 && kill == null) {
        if (pc['expl_due']) {
          const d = rng.randint(65, 75);
          hp -= d;
          pc['expl_due'] = false;
          L.on && L(`t${rjust(t, 4)} s${s} r${r} purple crab explosion ${d} -> Verzik ${hp}`);
          if (hp <= 0) kill = t;
          pc = !pc['alive'] ? null : pc;
        } else if (pc['alive']) {
          const h_ = rng.randint(9, 11);
          const old = hp; hp = Math.min(mx_hp, hp + h_);
          st['purple_heal'] += hp - old;
          L.on && L(`t${rjust(t, 4)} s${s} r${r} purple crab heals Verzik ${hp - old} -> ${hp}`);
        }
      }
      // ---- crabs heal on r41
      if (r === CRAB_HEAL_R && kill == null && s === 1) {
        // a crab that heals Verzik still counts as dying: its side's DC holder gets the +15
        for (const side of ['West', 'East']) {
          if (crabs[side] > 0) {
            const owner = players.find((q) => truthy(side === 'West' ? q.west : q.east)) ?? null;
            if (owner) {
              const old = owner.spec; owner.spec = Math.min(100, owner.spec + 15); owner.gain_src = 'other';
              st['dc1'].push(owner.name);
              L.on && L(`t${rjust(t, 4)} s1 r${r} ${side} crab heals Verzik (dies) -> ${owner.name} DC spec ${fx(old)}% -> ${fx(owner.spec)}%`);
            }
          }
        }
      }
      if (r === CRAB_HEAL_R && kill == null) {
        const heal = crabs['West'] + crabs['East'];
        const old = hp; hp = Math.min(mx_hp, hp + heal);
        st[`crab_heal${s}`] = hp - old;
        if (s === 1) st['crab_left1'] = { ...crabs };
        else st['crab_left'] = { ...crabs };
        L.on && L(`t${rjust(t, 4)} s${s} r${r} crabs heal Verzik +${hp - old} -> ${hp}`);
      }
      if (kill != null) {
        st['kill_set'] = s; st['kill_r'] = kill - P;
        L.on && L(`t${rjust(kill, 4)} s${s} r${kill - P} VERZIK P2 HP 0 (success)`);
        break;
      }
      if (s === 2 && r === CRAB_HEAL_R) break;
      // ---- Verzik's attacks (nobody is ever in range for a bounce)
      const verz = has(VERZ_ATTACKS, r);
      if (verz) {
        if (!has(st, 'since_ltg')) st['since_ltg'] = pymod(dget(p2r, 'regular', 0), 5);   // plain attacks since her last lightning
        if (rng.random() < 0.75) {                    // blood attacks don't move the lightning timer
          const h_ = floordiv(floordiv(rng.randint(0, 47), 2), 2);
          const old = hp; hp = Math.min(mx_hp, hp + h_);
          st['blood_total'] += hp - old;
          L.on && L(`t${rjust(t, 4)} s${s} r${r} VERZIK attack: blood heal +${hp - old} -> ${hp}`);
        } else if (st['since_ltg'] < 4) {
          st['since_ltg'] += 1;                       // plain attack
        } else {                                      // 5th plain attack: lightning
          st['since_ltg'] = 0;
          const vd = rng.random() >= 0.5 ? 5 : 8;
          vq.push([t + vd, -1, 1, 'Lightning rebound', rng.randint(20, 25), players[0], 'dmg']);
          st['lightning'] = dget(st, 'lightning', 0) + 1;
          L.on && L(`t${rjust(t, 4)} s${s} r${r} VERZIK attack: LIGHTNING (rebound lands t${t + vd})`);
        }
      }
      st['hp_now'] = hp; st['crabs_now'] = crabs['West'] + crabs['East'];
      // ---- players
      for (const p of pid) {
        if (p.dead) continue;
        supplies.catchup(p, t, L, `s${s} r${r} `);
        if (p.spec < 100) {
          p.regen_timer += 1;
          if (p.regen_timer >= p.regen_period()) {
            p.regen_timer = 0;
            const old = p.spec; p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
            L.on && L(`t${rjust(t, 4)} s${s} r${r} ${p.name}: regen ${fx(old)}% -> ${fx(p.spec)}%`);
          }
        } else {
          p.regen_timer = 0;
        }
        custom_surge(p, t, L, `r${r} `); auto_surge(p, t, L, `r${r} `);
        if (swap_due(p)) {
          p.ring = 'Ultor'; p.regen_timer = 0;
          L.on && L(`t${rjust(t, 4)} s${s} r${r} ${p.name}: spec ${fx(p.spec)}% >= target -> swaps to Ultor`);
        }
        if (p.thrall_next != null && t === p.thrall_next && r >= SHIELD) {
          vq.push([t + 1, rank.get(p), 9, 'Thrall', rng.randint(0, 3), p, 'dmg']);
          p.thrall_next = t + 4;
        }
        if (t < p.next_attack) continue;
        // purple crab duty (set 1)
        if (p.mode === 'purple_bp' && pc && pc['alive']) {
          const [ch] = blowpipe_chance(p);
          const ok = rng.random() < ch;
          p.next_attack = t + 2;
          L.on && L(`t${rjust(t, 4)} s${s} r${r} ${p.name}: blowpipe at purple crab (acc ${fx(ch * 100, 1)}%) -> ${ok ? 'PASSES' : 'miss'}`);
          if (ok) {
            p.mode = 'melee';
            pc['alive'] = false; pc['expl_due'] = true;      // queued poison hit: no more heals, explodes next cycle
            vq.push([t + BP_DELAY, -1, 0, 'pop', 0, p, 'purple']);
          }
          continue;
        }
        const ring_before = p.ring;
        const nq = vq.length;
        if (s === 1) set1_attack(p, r, t, verz, crabs, vq, rank, rng, L, st);
        else set2_attack(p, r, t, verz, crabs, vq, rank, rng, L, st);
        if (ring_before === 'Lightbearer' && p.next_attack - t >= 2) {      // an attack (not a wait) on LB
          if (!has(st, 'lb_reds')) st['lb_reds'] = {};
          st['lb_reds'][p.name] = dget(st['lb_reds'], p.name, 0) + 1;
        }
        if (p.thrall_next == null && r >= SHIELD && vq.slice(nq).some((h) => h[5] === p && h[6] === 'dmg')) {
          p.thrall_next = t + rng.randint(1, 2);
        }
      }
    }
    if (kill != null) break;
    if (s === 1) {
      st['hp_after1'] = hp;                                   // = Verzik HP when the 2nd shield goes up
      st['heal1'] = st['blood_total'] + st['crab_heal1'] + st['purple_heal'];   // all healing during set 1
    }
  }
  if (st['crab_left'] == null) st['crab_left'] = { ...crabs };
  const P_out = P;
  return {
    P: P_out, P1, kill, success: kill != null, hp, st, players,
    spec_end: players.map((p) => p.spec),
  };
}

export function _hit_crab_scythe(p, t, r, vq, rank, rng, L, st, why) {
  const [ch, mx] = melee_max_acc(p, 125, 75, CRAB_DEF_ROLL);
  [mx, floordiv(mx, 2)].forEach((m, k) => {
    vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, roll(rng, ch, m), p, 'crab:' + p.red_crab]);
  });
  p.next_attack = t + 5;
  st['crab_swings'] += 1;
  L.on && L(`t${rjust(t, 4)} s1 r${r} ${p.name}: Scythe on ${p.red_crab} crab (${why})`);
}

export function _scythe_verzik(p, t, r, vq, rank, rng, L, s, tag = '') {
  const [ch, mx] = scythe_roll(p);
  const sp = [];
  [mx, floordiv(mx, 2), floordiv(mx, 4)].forEach((m, k) => {
    const d = roll(rng, ch, m); sp.push(d);
    vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, d, p, 'dmg']);
  });
  p.next_attack = t + 5;
  p.reds_n += 1;
  L.on && L(`t${rjust(t, 4)} s${s} r${r} ${p.name}: Scythe${tag} -> ${plist(sp)}`);
}

/** [accuracy, maxes, hit delay, speed] for a fill attack on the crab or on Verzik. */
export function fill_numbers(p, kind, target) {
  if (kind === 'ayak') {
    const [ch, mx] = ayak_vs(p, target === 'crab' ? CRAB_DEF_ROLL : P2_DEF[3]); return [ch, [mx], 2, 3];
  }
  if (kind === 'bp') {
    const [ch, mx] = bp_vs(p, target === 'crab' ? CRAB_DEF_ROLL : P2_DEF[4]); return [ch, [mx], 2, 2];
  }
  const [ch, mx] = melee_max_acc(p, CLAW['atk'], CLAW['str'], target === 'crab' ? CRAB_DEF_ROLL : P2_DEF[1]);
  return [ch, [mx, floordiv(mx, 2)], 1, 4];
}

/** Crab or Verzik, whichever the fill is worth more on (crab hit must land by r41; no melee on Verzik on a
 * collision tick). */
export function fill_target(p, r, kind, verz, crab_ok, crabs) {
  const opts = {};
  let [ch, maxes, dl] = fill_numbers(p, kind, 'crab');
  if (crab_ok && r + dl <= CRAB_HEAL_R) opts['crab'] = _exp_capped(pyround(ch, 3), maxes, crabs[p.red_crab]);
  if (!(verz && kind === 'scratch')) {
    [ch, maxes, dl] = fill_numbers(p, kind, 'verzik');
    opts['verzik'] = _exp_capped(pyround(ch, 3), maxes, 10 ** 6);
  }
  const keys = Object.keys(opts);
  return keys.length ? maxBy(keys, (k) => opts[k]) : null;
}

/** kind: ayak | bp | scratch; target: crab | verzik */
export function _fill(p, t, r, kind, target, vq, rank, rng, L, st) {
  const def_roll = target === 'crab'
    ? { ayak: CRAB_DEF_ROLL, bp: CRAB_DEF_ROLL, scratch: CRAB_DEF_ROLL }
    : { ayak: P2_DEF[3], bp: P2_DEF[4], scratch: P2_DEF[1] };
  let ch, mx, spd, dl, maxes;
  if (kind === 'ayak') {
    [ch, mx] = ayak_vs(p, def_roll['ayak']); spd = 3; dl = 2; maxes = [mx];
  } else if (kind === 'bp') {
    [ch, mx] = bp_vs(p, def_roll['bp']); spd = 2; dl = 2; maxes = [mx];
  } else {
    [ch, mx] = melee_max_acc(p, CLAW['atk'], CLAW['str'], def_roll['scratch']); spd = 4; dl = 1; maxes = [mx, floordiv(mx, 2)];
  }
  const k_ = target === 'crab' ? 'crab:' + p.red_crab : 'dmg';
  const ds = [];
  maxes.forEach((m, k) => {
    const d = roll(rng, ch, m); ds.push(d);
    vq.push([t + dl, rank.get(p), k, { ayak: 'Ayak', bp: 'Blowpipe', scratch: 'Claw scratch' }[kind], d, p, k_]);
  });
  p.next_attack = t + spd;
  st['fills'].push(kind);
  L.on && L(`t${rjust(t, 4)} s1 r${r} ${p.name}: TICK FILL ${kind} on ${target === 'crab' ? 'their ' + p.red_crab + ' crab' : 'Verzik'} -> ${plist(ds)}`);
}

export function set1_attack(p, r, t, verz, crabs, vq, rank, rng, L, st) {
  const crab_ok = dget(crabs, p.red_crab, 0) > 0 && 2 <= r && r <= LAST_CRAB_R && p.red_crab !== 'None';
  // opening: two hits on their crab (from r2)
  if (p.crab_n < 2 && crab_ok) {
    _hit_crab_scythe(p, t, r, vq, rank, rng, L, st, `opening hit ${p.crab_n + 1}`);
    p.crab_n += 1;
    return;
  }
  if (r < 2) {
    p.next_attack = t + 1;                              // crabs not attackable yet
    return;
  }
  if (r < SHIELD && !crab_ok) {
    p.next_attack = P_of(t, r) + SHIELD;                // wait for the shield to drop
    return;
  }
  if (r < SHIELD) {
    _hit_crab_scythe(p, t, r, vq, rank, rng, L, st, 'shield up');
    return;
  }
  // tick fill toward a last swing on r44, only from r36 on
  const last = project_last(r);
  const gap = last != null ? LAST_R - last : 0;
  if ([2, 3, 4].includes(gap) && r >= FILL_FROM) {
    let kind, tgt;
    if (verz) {                                         // on her r36 attack: ayak (2 short) or a scratch on the crab (3 short)
      kind = dget({ 3: 'scratch', 2: 'ayak' }, gap);
    } else {
      kind = dget({ 3: 'ayak', 2: 'bp', 4: 'scratch' }, gap);
      if (kind === 'scratch' && r !== 40) kind = null;  // a 4-tick fill is only the r40 claw scratch (-> scythe on r44)
    }
    if ((kind === 'ayak' || kind === 'bp') && !ga(p, 'perfect1', true)) {
      kind = null;                                      // 'Perfect 1st set' unticked: no Ayak / blowpipe tick fixing
    }
    if (kind) {
      const [ch_c, mx_c, dl] = fill_numbers(p, kind, 'crab');
      const crab_ok_fill = crab_ok && r + dl <= CRAB_HEAL_R;
      if (kind === 'scratch' && verz) {
        tgt = crab_ok_fill ? 'crab' : null;             // never a melee hit on Verzik on her attack tick
      } else if (kind === 'scratch') {
        const crab_v = crab_ok_fill ? _exp_capped(pyround(ch_c, 3), mx_c, crabs[p.red_crab]) : -1;
        const [ch_v, mx_v] = fill_numbers(p, kind, 'verzik');
        tgt = crab_v > _exp_capped(pyround(ch_v, 3), mx_v, 10 ** 6) ? 'crab' : 'verzik';
      } else {
        tgt = crab_ok_fill ? 'crab' : 'verzik';
      }
      if (tgt == null) kind = null;
    }
    if (kind) {
      if (tgt === 'verzik' && kind === 'scratch' && !ga(p, 'shadow', false) && p.spec >= 50) {
        // non-shadow player: the r40 scratch on Verzik becomes a claw spec
        const old = p.spec; p.spec -= 50;
        const [hits] = claw_spec(p, rng);
        hits.forEach((dd, k) => {
          vq.push([t + 1, rank.get(p), k, `Claw spec hit ${k + 1}`, dd, p, 'dmg']);
        });
        p.next_attack = t + 4; p.reds_n += 1; p.set1_r40_claw = true;
        st['set1_r40_claw'] = dget(st, 'set1_r40_claw', 0) + 1;
        L.on && L(`t${rjust(t, 4)} s1 r${r} ${p.name}: CLAW SPEC on r40 instead of the scratch (spec ${fx(old)}% -> ${fx(p.spec)}%) -> ${plist(hits)}`);
        return;
      }
      _fill(p, t, r, kind, tgt, vq, rank, rng, L, st);
      return;
    }
  }
  let bias = CRAB_BIAS;
  if (ADAPT_CUT != null) {
    const eff = (st['hp_now'] + st['crabs_now']) / P2_HP[2] * 100;
    if ((eff > ADAPT_CUT) === (ADAPT_DIR === 'behind')) bias = 99.0;   // all-in on Verzik
  }
  if (CRAB_HP != null) {
    if (verz) {
      if (crab_ok) {
        _hit_crab_scythe(p, t, r, vq, rank, rng, L, st, 'collision tick');
      } else {
        p.next_attack = t + 1; st['waits'] += 1;
        L.on && L(`t${rjust(t, 4)} s1 r${r} ${p.name}: lines up with Verzik's attack -> waits 1t`);
      }
      return;
    }
    if (crab_ok && crabs[p.red_crab] > CRAB_HP && collisions_ahead(r) === 0) {
      _hit_crab_scythe(p, t, r, vq, rank, rng, L, st, `crab above ${CRAB_HP} HP, no collision tick left`);
      return;
    }
    _scythe_verzik(p, t, r, vq, rank, rng, L, 1);
    return;
  }
  if (verz) {
    if (crab_ok && crab_scythe_exp(p, crabs[p.red_crab]) > bias * verzik_scythe_exp(p)) {
      _hit_crab_scythe(p, t, r, vq, rank, rng, L, st, 'collision tick, crab worth more');
    } else {
      p.next_attack = t + 1;
      st['waits'] += 1;
      L.on && L(`t${rjust(t, 4)} s1 r${r} ${p.name}: lines up with Verzik's attack -> waits 1t`);
    }
    return;
  }
  if (crab_ok) {
    // keep what the upcoming collision-tick swings should remove for them; hit the crab now only if the rest
    // is still worth more than a scythe on Verzik
    const [ch, mx] = melee_max_acc(p, 125, 75, CRAB_DEF_ROLL);
    const full = _exp_capped(pyround(ch, 3), [mx, floordiv(mx, 2)], 10 ** 6);
    const spare = crabs[p.red_crab] - collisions_ahead(r) * full;
    if (spare > 0 && _exp_capped(pyround(ch, 3), [mx, floordiv(mx, 2)], Math.trunc(spare)) > bias * verzik_scythe_exp(p)) {
      _hit_crab_scythe(p, t, r, vq, rank, rng, L, st, `crab still high (${crabs[p.red_crab]})`);
      return;
    }
  }
  if (SET1_CLAW && ga(p, 'shadow', false) && !ga(p, 'set1_claw', false) && p.spec >= 50
      && spec_at_set2(p, r, st, 50) >= SET1_CLAW_NEED) {
    // shadow player with spec to spare: claw now, still has 50%+ for the set-2 claw (then shadow)
    const old = p.spec;
    p.spec -= 50;
    const [hits] = claw_spec(p, rng);
    hits.forEach((dd, k) => {
      vq.push([t + 1, rank.get(p), k, `Claw spec hit ${k + 1}`, dd, p, 'dmg']);
    });
    p.next_attack = t + 4; p.reds_n += 1; p.set1_claw = true;
    st['set1_claws'] = dget(st, 'set1_claws', 0) + 1;
    L.on && L(`t${rjust(t, 4)} s1 r${r} ${p.name}: CLAW SPEC in set 1 (spec ${fx(old)}% -> ${fx(p.spec)}%, still 50%+ by set 2) -> ${plist(hits)}`);
    return;
  }
  _scythe_verzik(p, t, r, vq, rank, rng, L, 1);
}

/** Projected spec on set-2 r11 if they spend `spend` now: regen at their current ring's rate + the set-1 DC. */
export function spec_at_set2(p, r, st, spend = 0) {
  let spec = p.spec - spend;
  const per = p.regen_period();
  let timer = p.regen_timer;
  const ticks = (LAST_R - r) + SHIELD;
  for (let i = 0; i < ticks; i++) {
    if (spec < 100) {
      timer += 1;
      if (timer >= per) {
        timer = 0; spec = Math.min(100, spec + 10);
      }
    } else {
      timer = 0;
    }
  }
  if ((truthy(p.west) || truthy(p.east)) && !st['dc1'].includes(p.name) && r < CRAB_HEAL_R) {
    spec = Math.min(100, spec + 15 * (Number(truthy(p.west)) + Number(truthy(p.east))));
  }
  return spec;
}

/** From the first reds proc (set-1 r0 = tick P): staying on Lightbearer and spending nothing in set 1, will they
 * have their 2nd claw by set-2 r31? */
export function two_claws_on_lb(p, P, st_dc_owner, purple_owed) {
  let spec = p.spec, timer = p.regen_timer;
  let bonus = 15 * st_dc_owner + (purple_owed ? 15 : 0);
  let surge_t = ga(p, 'auto_surge_on', false) ? Math.max(p.surge_ready, P) : null;
  const r11 = LAST_R + SHIELD, r31 = LAST_R + 31;
  let regens_after = 0;
  for (let k = 1; k <= r31; k++) {
    if (k === CRAB_HEAL_R) {
      spec = Math.min(100, spec + bonus); bonus = 0;
    }
    if (surge_t != null && P + k >= surge_t && spec <= 70) {
      spec = Math.min(100, spec + 25); surge_t = null;
    }
    if (spec < 100 || k > r11) {
      timer += 1;
      if (timer >= 25) {
        timer = 0;
        if (k <= r11) spec = Math.min(100, spec + 10);
        else regens_after += 1;
      }
    } else {
      timer = 0;
    }
  }
  spec = Math.min(100, spec + bonus);
  return spec >= 100 || (spec >= 50 && spec + 10 * regens_after >= 100);
}

export function P_of(t, r) {
  return t - r;
}

export function set2_attack(p, r, t, verz, crabs, vq, rank, rng, L, st) {
  if (r < SHIELD) {
    if (!p.dc_swing_done && r >= 1) {
      if (ga(p, 'crab_bp', false)) {
        const [ch, mx] = bp_vs(p, CRAB_DEF_ROLL);                // under 70: blowpipe the crab, then shark + brew + super combat
        vq.push([t + 2, rank.get(p), 0, 'Blowpipe', roll(rng, ch, mx), p, 'crab:' + p.red_crab]);
        L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: Blowpipe on ${p.red_crab} crab (death charge swing)`);
        supplies.window(p, Math.max(1, floordiv(SHIELD - 1 - r, 3) + 1), L, t, `s2 r${r} shield `, { sharks: true, brews: !p.shadow });
      } else if (r <= SHIELD - 5) {
        const [ch, mx] = melee_max_acc(p, 125, 75, CRAB_DEF_ROLL);
        [mx, floordiv(mx, 2)].forEach((m, k) => {
          vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, roll(rng, ch, m), p, 'crab:' + p.red_crab]);
        });
        L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: Scythe on ${p.red_crab} crab (death charge swing)`);
      }
      p.dc_swing_done = true;
    }
    p.next_attack = P_of(t, r) + SHIELD;
    return;
  }
  if (p.plan == null) {                                     // decide the set-2 spec plan when the shield drops
    const per = p.regen_period(), first = p.regen_period() - p.regen_timer;
    const regens = first > 20 ? 0 : 1 + floordiv(20 - first, per);   // regens by r31
    if (ga(p, 'set1_r40_claw', false)) {
      p.plan = 'r40claw';                                    // clawed on set-1 r40: scratch/claw r11, claw by r36
    } else if (p.spec >= 100 || (p.spec >= 50 && p.spec + 10 * regens >= 100)) {   // has or will have 100% this set
      p.plan = 'two_claws';
    } else if (p.spec >= 50 && ga(p, 'shadow', false)) {
      p.plan = 'shadow_claw';
      if (SET2_ULTOR && p.ring === 'Lightbearer') {
        p.ring = 'Ultor'; p.regen_timer = 0;                 // LB can't get them a 2nd claw by r31: Ultor for the swings
        st['set2_ultor'] = dget(st, 'set2_ultor', 0) + 1;
        L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: no 2nd claw by r31 even on Lightbearer -> swaps to Ultor`);
      }
    } else if (p.spec >= 50) {
      p.plan = 'scratch_claw';
    } else {
      p.plan = 'scythe';
    }
    L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: spec ${fx(p.spec)}% -> plan ${p.plan}`);
  }
  const n = p.reds_n + 1;
  if (verz) {
    if (ga(p, 'shadow', false) && !p.first_col_done && (
      p.plan === 'shadow_claw' || (p.plan === 'two_claws' && p.claws_done < 2))) {
      // shadow player: the collision tick becomes the shadow (keeps all 7 attacks before r41)
      p.first_col_done = true;
      const [ch, mx] = shadow_numbers(p);
      const d = roll(rng, ch, mx);
      vq.push([t + SHADOW_DELAY_NEAR, rank.get(p), 0, 'Shadow', d, p, 'dmg']);
      p.next_attack = t + 5; p.reds_n = n;
      st['shadow'] += 1;
      L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: SHADOW on the collision tick -> ${d}`);
      return;
    }
    p.next_attack = t + 1;
    st['waits'] += 1;
    L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: lines up with Verzik's attack -> waits 1t`);
    return;
  }
  if (r === 40 && p.spec >= 30 && dget(st, 'hp_now', 10 ** 6) < P2_HP[2] * LAST_HIT_THR / 100) {
    // under the scythe last-hit threshold: scythe, not halberd
  } else if (r === 40 && p.spec >= 30) {
    p.spec -= 30;
    let [ch1, m] = p3.melee(p, p3.HALB, P2_DEF[1]);
    const [ch2] = p3.melee(p, p3.HALB, P2_DEF[1], 0.75);
    m = floordiv(m * 110, 100);
    const hits = [roll(rng, ch1, m), roll(rng, ch2, m)];
    hits.forEach((d, k) => {
      vq.push([t + 1, rank.get(p), k, `Halberd spec hit ${k + 1}`, d, p, 'dmg']);
    });
    p.next_attack = t + 7; p.reds_n = n;
    st['halb'] += 1;
    L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: HALBERD SPEC on r40 -> ${plist(hits)}`);
    return;
  }
  if (p.plan === 'r40claw') {
    if (p.claws_done === 0 && p.spec >= 50 && r <= 36) {
      const old = p.spec; p.spec -= 50;
      const [hits] = claw_spec(p, rng);
      hits.forEach((d, k) => {
        vq.push([t + 1, rank.get(p), k, `Claw spec hit ${k + 1}`, d, p, 'dmg']);
      });
      p.next_attack = t + 4; p.reds_n = n; p.claws_done += 1; st['claws'] += 1;
      L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: CLAW SPEC (spec ${fx(old)}% -> ${fx(p.spec)}%) -> ${plist(hits)}`);
      return;
    }
    if (p.reds_n === 0 && !p.scratch_done) {
      const [ch, mx] = melee_max_acc(p, CLAW['atk'], CLAW['str'], P2_DEF[1]);
      const ds = [];
      [mx, floordiv(mx, 2)].forEach((m, k) => {
        const d = roll(rng, ch, m); ds.push(d);
        vq.push([t + 1, rank.get(p), k, 'Claw scratch', d, p, 'dmg']);
      });
      p.next_attack = t + 4; p.reds_n = n; p.scratch_done = true; st['scratch'] += 1;
      L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: claw scratch r11 (no claw yet) -> ${plist(ds)}`);
      return;
    }
    _scythe_verzik(p, t, r, vq, rank, rng, L, 2);
    return;
  }
  const want_claw = p.spec >= 50 && (                       // specs go first, from r11
    (p.plan === 'two_claws' && p.claws_done < 2)
    || ((p.plan === 'shadow_claw' || p.plan === 'scratch_claw') && p.claws_done < 1));
  if (p.plan === 'scratch_claw' && p.claws_done === 1 && !p.scratch_done) {
    const [ch, mx] = melee_max_acc(p, CLAW['atk'], CLAW['str'], P2_DEF[1]);
    const ds = [];
    [mx, floordiv(mx, 2)].forEach((m, k) => {
      const d = roll(rng, ch, m); ds.push(d);
      vq.push([t + 1, rank.get(p), k, 'Claw scratch', d, p, 'dmg']);
    });
    p.next_attack = t + 4; p.reds_n = n; p.scratch_done = true;
    st['scratch'] += 1;
    L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: claw scratch -> ${plist(ds)}`);
    return;
  }
  if (want_claw) {
    const old = p.spec;
    p.spec -= 50;
    const [hits] = claw_spec(p, rng);
    hits.forEach((d, k) => {
      vq.push([t + 1, rank.get(p), k, `Claw spec hit ${k + 1}`, d, p, 'dmg']);
    });
    p.next_attack = t + 4; p.reds_n = n; p.claws_done += 1;
    st['claws'] += 1;
    L.on && L(`t${rjust(t, 4)} s2 r${r} ${p.name}: CLAW SPEC (spec ${fx(old)}% -> ${fx(p.spec)}%) -> ${plist(hits)}`);
    return;
  }
  _scythe_verzik(p, t, r, vq, rank, rng, L, 2);
}
