// P2 red crab phase: shield, crab swings, 7 Verzik attacks, bounce on her 2nd attack, claws, crab heal, fail at r44.
// Line-by-line port of verzik_sim/reds.py
import * as supplies from './supplies.js';
import { auto_surge, custom_surge, lb_swap_ok, swap_due, ARMOUR, FIXED, AMULETS, RINGS, PRAYERS, hit_chance, fmt } from './sim.js';
import * as horn from './horn.js';
import { scythe_roll, P2_DEF, P2_HP, shadow_numbers, SHADOW_DELAY_NEAR, blowpipe_chance, BP_DELAY } from './p2.js';
import { bp_vs } from './duo_reds.js';
import * as p3 from './p3.js';
import { floordiv, pymod, truthy, ga, dget, sum, sorted, rjust, fx } from './util.js';

export const CRAB_BASE_HP = 200;
export const CRAB_DEF_ROLL = (100 + 9) * (0 + 64);          // 6,976
export const CLAW = { atk: 57, str: 56 };
export const ZCB = { atk: 110, rstr: 122 };
export const SHIELD = 11;                                    // r0..r10
export const VERZ_ATTACKS = [12, 16, 20, 24, 28, 32, 36];
export const CRAB_HEAL_R = 41;                               // crabs pop r40, heal lands r41 after the queue step
export const FAIL_R = 44;
export const LAST_HIT_THR = 2.0;       // chart 'P2 Scythe last hit threshold': under this % of P2 HP an r40 halberd becomes a scythe

/** For any r40 halberd option in 3-5 man reds: False when her HP is under the last-hit threshold. */
export function r40_halberd_ok(hp, team, cfgs) {
  const thr = truthy(cfgs) ? dget(cfgs[0], 'lastHitThr', LAST_HIT_THR) : LAST_HIT_THR;
  return hp >= P2_HP[team] * thr / 100;
}
export const BOUNCE_R = 16;
export const DEFAULT_CRABS = {
  5: ['West', 'West', 'East', 'East', 'West'], 4: ['West', 'West', 'East', 'East'],
  3: ['West', 'West', 'East'],
};

const pylist = (a) => '[' + a.map((x) => (typeof x === 'string' ? `'${x}'` : String(x))).join(', ') + ']';

export function melee_max_acc(p, w_atk, w_str, def_roll) {
  const gear = p.pieces('S');
  const atk_b = w_atk + sum(gear.map((g) => g['atk'][1]));
  const str_b = w_str + sum(gear.map((g) => g['str']));
  const [pa, pd] = PRAYERS[p.prayer];
  const eff_a = Math.floor(p.atk * pa) + 8;
  const eff_s = Math.floor(p.str * pd) + 3 + 8;
  return [hit_chance(eff_a * (atk_b + 64), def_roll), floordiv(eff_s * (str_b + 64) + 320, 640)];
}

export function claw_spec(p, rng) {
  const [ch, mx] = melee_max_acc(p, CLAW['atk'], CLAW['str'], P2_DEF[1]);
  for (let k = 0; k < 4; k++) {
    if (rng.random() < ch) {
      if (k === 0) {
        const x = rng.randint(floordiv(mx, 2), mx - 1); return [[x, floordiv(x, 2), floordiv(x, 4), floordiv(x, 4) + 1], ch, mx];
      }
      if (k === 1) {
        const x = rng.randint(floordiv(3 * mx, 8), floordiv(7 * mx, 8)); return [[0, x, floordiv(x, 2), floordiv(x, 2) + 1], ch, mx];
      }
      if (k === 2) {
        const x = rng.randint(floordiv(mx, 4), floordiv(3 * mx, 4)); return [[0, 0, x, x + 1], ch, mx];
      }
      const x = rng.randint(floordiv(mx, 4), floordiv(5 * mx, 4)); return [[0, 0, 0, x], ch, mx];
    }
  }
  return [(rng.random() < 2 / 3 ? [1, 1, 0, 0] : [0, 0, 0, 0]), ch, mx];
}

export function zcb_auto(p) {
  const gear = [ARMOUR[p.helm], ARMOUR[p.body], ARMOUR[p.legs], FIXED['Infernal cape'], FIXED['Avernic treads'],
    FIXED['Ferocious gloves'], AMULETS[p.amulet], RINGS[p.ring]];
  const atk_b = ZCB['atk'] + sum(gear.map((g) => g['atk'][4]));
  const rs = ZCB['rstr'] + sum(gear.map((g) => dget(g, 'rstr', 0)));
  const eff = p.rng + 8;                              // rapid, no ranged prayer (on melee prayer)
  const mx = Math.floor(0.5 + eff * (rs + 64) / 640);
  return [hit_chance(eff * (atk_b + 64), P2_DEF[4]), mx];
}

/** Spec projection: would this player get 2 claw specs in reds attacks 3-6? */
export function project_two_claws(p, r_now, first_tick_r) {
  let spec = p.spec, timer = p.regen_timer;
  const period = p.regen_period();
  let r = r_now;
  let nxt = first_tick_r;
  let claws = 0;
  for (let n = 3; n < 7; n++) {
    while (r < nxt) {
      r += 1;
      if (spec < 100) {
        timer += 1;
        if (timer >= period) {
          timer = 0;
          spec = Math.min(100, spec + 10);
        }
      }
    }
    if (spec >= 50) {
      spec -= 50; claws += 1; nxt = r + 4;
    } else {
      nxt = r + 5;
    }
  }
  return claws >= 2;
}

export function shield_sips(p, t, r, L) {
  supplies.window(p, Math.max(1, floordiv(SHIELD - 1 - r, 3) + 1), L, t, `r${r} shield `, { sharks: true });
}

export function run_reds(p2, cfgs, team, rng, log = null) {
  for (const _p of p2['players']) {
    _p.pool.phase = 'reds'; _p.pool.scb_res = 0; _p.sc_at = null;
  }
  const L = log != null ? ((s) => log.push(s)) : ((s) => null); L.on = log != null;   // log text is only built when a log is kept
  const players = p2['players'], pid = p2['pid'], P = p2['reds_tick'];
  const rank = new Map(pid.map((p, k) => [p, k]));
  let hp = p2['hp'];
  const mx_hp = P2_HP[team];
  const crab_hp0 = floordiv(CRAB_BASE_HP * P2_HP[team], 3500);
  const crabs = { West: crab_hp0, East: crab_hp0 };
  const st = {
    bounce: false, bounced: null, chancers: [], skippers: [], zcb: 0, ruby: 0, ruby_dmg: 0, zcb_dmg: 0,
    blood_heals: 0, blood_total: 0, shadow: 0, shadow_dmg: 0, horns: 0, horn_hits: 0, crab_heal: 0, claws: 0, claw_dmg: 0, crab_left: null,
  };
  L.on && L(`\n=== RED CRABS === proc t${P} (r0). Verzik ${hp} (${fx(hp / mx_hp * 100, 1)}%). Shield r0-r10, `
    + `her attacks r12-r36, crab heal r40, fail r44 (t${P + FAIL_R}). Crabs ${crab_hp0} HP each`);
  players.forEach((p, i) => {
    p.red_crab = dget(cfgs[i], 'redCrab') || dget(DEFAULT_CRABS, team, Array(team).fill('West'))[i];
    p.bzcb = dget(cfgs[i], 'bouncedZCB', true);
    p.crab_done = p.red_crab === 'None' || truthy(p.purple);     // the purple DC never swings at a red crab
    p.reds_n = 0;
    p.zcb_due = false;
    p.skip16 = false;
    p.dist16 = false;
    p.horn_buff = null;
    p.thrall_next = null;
    p.reds_dmg = 0;
    p.sh_plan = null;          // shadow player under 100% on r11: 'claw_first' (50%+) or 'shadow16' (under 50%)
    p.reds_claws = 0;
    p.sh_col_done = false;
    p.purple_pending = false;             // no purple to come once the reds start
    p.reds_bp = false;
    if (p.next_attack < P) {
      p.next_attack = P;
    }
  });
  // purple crab still alive at the shield: its DC blowpipes it from r0 until it pops (no red crab swing), then hits
  // Verzik on the first tick they can (normally r11). It neither heals nor explodes during the shield; from r12, on
  // her cycle, it heals if still alive or its explosion lands if popped.
  let pc = null;
  const pdc = dget(p2, 'purple_dc');
  const pur = dget(p2, 'purple');
  // reds shield is invulnerable: heal up under 90 HP (sharks only if under 70 with a super combat left -
  // then they blowpipe their red crab instead of the scythe so the shark doesn't cost the r11 swing)
  for (const p of supplies.by_hp(players)) {
    p.crab_bp = false;
    if (p.dead || p.hp >= 90) {
      continue;
    }
    if (p.hp < 70 && p.pool.left['scb'] > 0 && p.pool.left['shark'] > 0 && !p.crab_done) {
      p.crab_bp = true;                                 // sips after the blowpipe
    } else {
      supplies.window(p, 4, L, P, 'reds shield ', { sharks: false });
    }
  }
  if (truthy(pur) && truthy(dget(pur, 'alive')) && truthy(pdc) && !pdc.dead) {
    const pend = (truthy(dget(pur, 'pop_at')) && pur['pop_at'] >= P) ? dget(pur, 'pop_at') : null;
    pc = { alive: true, expl_due: false, pop_at: pend };
    pdc.crab_done = true;
    pdc.reds_bp = pend == null;
    st['purple_in_reds'] = true;
    L.on && L(`     PURPLE CRAB alive at the shield: ${pdc.name} `
      + (truthy(pend) ? `already blowpiped it (pops t${pend})` : 'blowpipes it from r0 (skips the red crab swing)'));
  }
  let pop_spec_at = pc ? pc['pop_at'] : null;
  let since_ltg = pymod(dget(p2, 'regular', 0), 5);         // plain attacks since her last lightning (carried from P2)
  let vq = [];      // [land, rank, sub, label, amount, player, kind]  kind: dmg | crab:<side>
  let kill = null;
  for (let r = 0; r < FAIL_R; r++) {
    const t = P + r;
    // ---- Verzik step
    const landing = sorted(vq.filter((h) => h[0] === t), (h) => [h[1], h[2]]);
    vq = vq.filter((h) => h[0] !== t);
    for (const h of landing) {
      let [, , , label, amt, p, kind] = h;
      if (kind.startsWith('crab:')) {
        const side = kind.slice(5);
        crabs[side] = Math.max(0, crabs[side] - amt);
        L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: ${label} on ${side} crab ${amt} -> crab ${crabs[side]}`);
        continue;
      }
      if (kind === 'ruby') {
        amt = Math.min(110, floordiv(hp * 22, 100));
        st['ruby_dmg'] += amt;
      }
      hp -= amt;
      if (kind !== 'ltg') {
        p.reds_dmg += amt;
      }
      if (label.startsWith('Claw')) {
        st['claw_dmg'] += amt;
      }
      if (label.startsWith('ZCB')) {
        st['zcb_dmg'] += amt;
      }
      L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: ${label} ${amt} -> Verzik ${hp}`);
      if (hp <= 0 && kill == null) {
        kill = t;
      }
    }
    if (r === CRAB_HEAL_R && kill == null) {
      const heal = crabs['West'] + crabs['East'];
      const old = hp;
      hp = Math.min(mx_hp, hp + heal);
      st['crab_heal'] = hp - old;
      st['crab_left'] = { ...crabs };
      L.on && L(`t${rjust(t, 4)} r${r} crabs popped on r40, heal lands after player damage: by crabs' HP (West ${crabs['West']}, East ${crabs['East']}) `
        + `+${hp - old} -> ${hp}`);
    }
    if (pop_spec_at != null && pop_spec_at === t) {
      pop_spec_at = null;
      const old = pdc.spec; pdc.spec = Math.min(100, pdc.spec + 15); pdc.gain_src = 'other'; pdc.purple_pending = false;
      L.on && L(`t${rjust(t, 4)} r${r} PURPLE CRAB POPS -> ${pdc.name} spec ${fx(old)}% -> ${fx(pdc.spec)}% (explosion on her next cycle)`);
    }
    if (pc && r >= 12 && (r - 12) % 4 === 0 && kill == null) {
      if (pc['expl_due']) {
        const d = rng.randint(65, 75); hp -= d; st['purple_expl'] = d;
        L.on && L(`t${rjust(t, 4)} r${r} purple crab explosion ${d} -> Verzik ${hp}`);
        pc = null;
        if (hp <= 0) {
          kill = t;
        }
      } else if (pc['alive']) {
        const h_ = rng.randint(9, 11); const old = hp; hp = Math.min(mx_hp, hp + h_);
        st['purple_heal'] = dget(st, 'purple_heal', 0) + hp - old;
        L.on && L(`t${rjust(t, 4)} r${r} purple crab heals Verzik ${hp - old} -> ${hp}`);
      }
    }
    if (kill != null) {
      L.on && L(`t${rjust(kill, 4)} r${kill - P} VERZIK P2 HP 0 (success, ${P + FAIL_R - kill - 1} ticks to spare)`);
      break;
    }
    const verz = VERZ_ATTACKS.includes(r);
    if (verz) {
      const n_att = VERZ_ATTACKS.indexOf(r) + 1;
      let bounced = null;
      if (r === BOUNCE_R) {
        const alive = players.filter((p) => !p.dead);
        for (const p of alive) {
          if (p.reds_n === 1 && p.next_attack <= t && !ga(p, 'shadow', false)
              && project_two_claws(p, r, r + 5)) {     // a shadow player is never the two-claw skipper
            p.skip16 = true;
          }
        }
        for (const p of alive) {
          // nobody has 100% for two claws: shadow players hit from a distance instead of chancing it;
          // a shadow player under 50% on r11 always does (scythe > shadow > scythe ...)
          if (ga(p, 'shadow', false) && p.reds_n === 1 && p.next_attack <= t
              && (p.sh_plan === 'shadow16' || !alive.some((q) => q.skip16))) {
            p.dist16 = true;
          }
        }
        st['chancers'] = alive.filter((p) => !(p.skip16 || p.dist16)).map((p) => p.name);
        st['skippers'] = alive.filter((p) => p.skip16 || p.dist16).map((p) => p.name + (p.dist16 ? ' (shadow, distance)' : ' (2 claws)'));
        const at_risk = alive.filter((p) => !(p.skip16 || p.dist16));
        if (at_risk.length && (at_risk.length === alive.length || rng.random() < 0.5)) {
          bounced = rng.choice(at_risk);
        }
        L.on && L(`t${rjust(t, 4)} r${r} VERZIK attack #2 (bounce chance): in range ${st['chancers'].length ? pylist(st['chancers']) : 'nobody'}`
          + (st['skippers'].length ? `, out ${pylist(st['skippers'])}` : '') + ' -> '
          + (bounced ? `BOUNCES ${bounced.name}` : 'no bounce'));
      }
      if (bounced) {
        st['bounce'] = true;
        st['bounced'] = bounced.name;
        bounced.was_bounced = true;
      } else {
        if (rng.random() < 0.75) {
          const rr = rng.randint(0, 47);
          const h = floordiv(floordiv(rr, 2), 2);
          const old = hp;
          hp = Math.min(mx_hp, hp + h);
          st['blood_heals'] += 1;
          st['blood_total'] += hp - old;
          L.on && L(`t${rjust(t, 4)} r${r} VERZIK attack #${n_att}: blood heal +${hp - old} -> ${hp}`);
        } else if (since_ltg < 4) {
          since_ltg += 1;                                   // plain attack: counts toward her lightning
          L.on && L(`t${rjust(t, 4)} r${r} VERZIK attack #${n_att}: plain attack`);
        } else {                                            // 5th plain attack since the last: lightning
          since_ltg = 0;
          const vd = rng.random() < 1 / team ? 8 : 5;
          const d = rng.randint(20, 25);
          vq.push([t + vd, -1, 1, 'Lightning rebound', d, players[0], 'ltg']);
          st['lightning'] = dget(st, 'lightning', 0) + 1;
          L.on && L(`t${rjust(t, 4)} r${r} VERZIK attack #${n_att}: LIGHTNING (rebound ${d} lands t${t + vd})`);
        }
      }
    }
    // ---- players
    for (const p of pid) {
      if (p.dead) {
        continue;
      }
      supplies.catchup(p, t, L, `r${r} `);
      if (p.spec < 100) {
        p.regen_timer += 1;
        if (p.regen_timer >= p.regen_period()) {
          p.regen_timer = 0;
          const old = p.spec;
          p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: regen ${fx(old)}% -> ${fx(p.spec)}%`);
        }
      } else {
        p.regen_timer = 0;
      }
      custom_surge(p, t, L, `r${r} `); auto_surge(p, t, L, `r${r} `);
      if (swap_due(p)) {
        p.ring = 'Ultor'; p.regen_timer = 0; p.ring_swapped_at = t;
        L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: spec ${fx(p.spec)}% >= target -> swaps to Ultor`);
      }
      if (pc && p === pdc && ga(p, 'reds_bp', false)) {
        if (t >= p.next_attack) {
          const [ch] = blowpipe_chance(p);
          const ok = rng.random() < ch;
          p.next_attack = t + 2;
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: blowpipe at purple crab (acc ${fx(ch * 100, 1)}%) -> `
            + (ok ? `PASSES, pops t${t + BP_DELAY}` : 'miss'));
          if (ok) {
            p.reds_bp = false; pc['pop_at'] = t + BP_DELAY; pop_spec_at = t + BP_DELAY;
            pc['alive'] = false; pc['expl_due'] = true;     // queued poison hit: explodes on her next cycle
          }
        }
        continue;
      }
      if (r < SHIELD) {
        // one crab swing during the shield, as long as they can still make r11
        if (!p.crab_done && r >= 1 && t >= p.next_attack) {
          if (ga(p, 'crab_bp', false)) {
            // under 70: blowpipe the crab, shark + brew, super combat
            const [ch, mx] = bp_vs(p, CRAB_DEF_ROLL);
            const d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
            vq.push([t + 2, rank.get(p), 0, 'Blowpipe', d, p, 'crab:' + p.red_crab]);
            p.next_attack = t + 2;
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: Blowpipe on ${p.red_crab} crab -> ${d}`);
            shield_sips(p, t, r, L);
          } else if (r <= SHIELD - 5) {
            const [ch, mx] = melee_max_acc(p, 125, 75, CRAB_DEF_ROLL);
            [mx, floordiv(mx, 2)].forEach((m, k) => {        // 2x2: two scythe hits
              const d = rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0;
              vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, d, p, 'crab:' + p.red_crab]);
            });
            p.next_attack = t + 5;
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: Scythe on ${p.red_crab} crab (acc ${fx(ch * 100, 1)}%, max ${mx})`);
          } else {
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: too late for a crab swing`);
          }
          p.crab_done = true;
        }
        continue;
      }
      if (p.thrall_next != null && t === p.thrall_next) {
        vq.push([t + 1, rank.get(p), 9, 'Thrall', rng.randint(0, 3), p, 'dmg']);
        p.thrall_next = t + 4;
      }
      if (r === 11) {
        p.next_attack = p === pdc ? Math.max(t, p.next_attack) : t;                           // everyone hits Verzik on the first tick
        if (ga(p, 'shadow', false) && p.spec < 100) {
          p.sh_plan = p.spec >= 50 ? 'claw_first' : 'shadow16';
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: shadow player on ${fx(p.spec)}% -> `
            + (p.sh_plan === 'claw_first' ? 'claw > scythe > shadow > scythes' : 'scythe > shadow (r16) > scythes, one claw by r31'));
        }
      }
      if (ga(p, 'horn_p2', false) && !p.horn_used_p2 && p.reds_n >= 2 && 25 <= p.spec && p.spec < 50
          && !(p.reds_n + 1 >= 3 && p.spec >= 50)) {
        const nic = (q) => q.reds_n + 1 >= 3 && q.spec >= 50 && !q.zcb_due;
        if (horn.try_horn(p, players, rank, 'p2', team, nic, L, t, `r${r} `)) {
          st['horns'] += 1;
        }
      }
      if (t < p.next_attack) {
        // pass
      } else {
        const n = p.reds_n + 1;
        if (r === BOUNCE_R && n === 2 && p.dist16) {
          // shadow from a distance, no bounce risk, no lost tick
        } else if (r === BOUNCE_R && n === 2) {
          if (p.skip16) {
            p.next_attack = t + 1;
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: has spec for 2 claws in attacks 3-6 -> skips the bounce chance (+1t)`);
            continue;
          }
        } else if (verz && !p.zcb_due && p.sh_plan === 'claw_first' && !p.sh_col_done && p.reds_claws >= 1) {
          p.sh_col_done = true;                        // the collision tick after their claw becomes the shadow
          const [ch, mx] = shadow_numbers(p);
          const d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
          vq.push([t + SHADOW_DELAY_NEAR, rank.get(p), 0, 'Shadow', d, p, 'dmg']);
          st['shadow'] += 1; st['shadow_dmg'] += d;
          p.next_attack = t + 5; p.reds_n = n;
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: SHADOW on the collision tick (claw > scythe > shadow) -> ${d}`);
          if (p.thrall_next == null) {
            p.thrall_next = t + rng.randint(1, 2);
          }
          continue;
        } else if (verz && !p.zcb_due) {
          p.next_attack = t + 1;
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: attack lines up with Verzik's attack -> +1t`);
          continue;
        }
        if ((p.zcb_due && ga(p, 'shadow', false)) || (r === BOUNCE_R && n === 2 && p.dist16)) {
          const why = p.zcb_due ? 'bounced' : 'distance, skips the bounce chance';
          p.zcb_due = false;
          const [ch, mx] = shadow_numbers(p);
          const d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
          vq.push([t + SHADOW_DELAY_NEAR, rank.get(p), 0, 'Shadow', d, p, 'dmg']);
          st['shadow'] += 1; st['shadow_dmg'] += d;
          p.next_attack = t + 5;
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: SHADOW (${why}, acc ${fx(ch * 100, 1)}%, max ${mx}, lands t${t + SHADOW_DELAY_NEAR}) -> ${d}`);
        } else if (p.zcb_due) {
          const [ch, mx] = zcb_auto(p);
          p.zcb_due = false;
          st['zcb'] += 1;
          if (rng.random() < 0.066) {
            st['ruby'] += 1;
            p.hp -= floordiv(p.hp, 10);
            supplies.check_death(p, 'reds', L, t);
            vq.push([t + 3, rank.get(p), 0, 'ZCB ruby proc', 0, p, 'ruby']);
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: ZCB auto (bounced) -> RUBY PROC (22% of current HP, cap 110)`);
          } else {
            const d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
            vq.push([t + 3, rank.get(p), 0, 'ZCB auto', d, p, 'dmg']);
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: ZCB auto (bounced, acc ${fx(ch * 100, 1)}%) -> ${d}`);
          }
          p.next_attack = t + 5;
        } else if (p.spec >= 50 && (
          (p.sh_plan == null && n >= 3)
          || (p.sh_plan === 'claw_first' && n === 1 && p.reds_claws === 0)
          || (p.sh_plan === 'shadow16' && n >= 3 && p.reds_claws === 0 && r <= 31))) {   // last claw r31 -> scythe r35 -> last hit r40
          p.reds_claws += 1;
          const old = p.spec;
          p.spec -= 50;
          const [hits, ch, mx] = claw_spec(p, rng);
          st['claws'] += 1;
          hits.forEach((d, k) => {
            vq.push([t + 1, rank.get(p), k, `Claw spec hit ${k + 1}`, d, p, 'dmg']);
          });
          p.next_attack = t + 4;
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: CLAW SPEC #${n} (spec ${fx(old)}% -> ${fx(p.spec)}%, acc ${fx(ch * 100, 1)}%, `
            + `max ${mx}) -> ${pylist(hits)}`);
        } else if (r === 40 && p.spec >= 30 && !ga(p, 'horn_p2', false) && r40_halberd_ok(hp, team, cfgs)) {
          const old = p.spec; p.spec -= 30;
          let [ch1, m] = p3.melee(p, p3.HALB, P2_DEF[1]); const [ch2] = p3.melee(p, p3.HALB, P2_DEF[1], 0.75);
          m = floordiv(m * 110, 100);
          const hits = [ch1, ch2].map((c) => (rng.random() < c ? Math.max(1, rng.randint(0, m)) : 0));
          hits.forEach((d, k) => {
            vq.push([t + 1, rank.get(p), k, `Halberd spec hit ${k + 1}`, d, p, 'dmg']);
          });
          p.next_attack = t + 7;
          st['halb'] = dget(st, 'halb', 0) + 1;
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: HALBERD SPEC on r40 (spec ${fx(old)}% -> ${fx(p.spec)}%) -> ${pylist(hits)}`);
        } else {
          const [ch, mx] = scythe_roll(p);
          const splats = [];
          const buffed = horn.active(p, t);
          [mx, floordiv(mx, 2), floordiv(mx, 4)].forEach((m, k) => {
            const d = ((k === 0 && buffed) || rng.random() < ch) ? Math.max(1, rng.randint(0, m)) : 0;
            splats.push(d);
            vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, d, p, 'dmg']);
          });
          p.next_attack = t + 5;
          if (buffed) {
            st['horn_hits'] += 1; p.horn_buff = null;
          }
          L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: Scythe #${n} (acc ${fx(ch * 100, 1)}%, max ${mx}`
            + `${buffed ? ', HORN: 1st hit guaranteed' : ''}) -> ${pylist(splats)}`);
        }
        p.reds_n = n;
        if (r === BOUNCE_R && ga(p, 'was_bounced', false) && n === 2) {
          if (ga(p, 'shadow', false)) {
            p.zcb_due = true;
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: bounced - shadow next (t${p.next_attack})`);
          } else if (p.bzcb) {
            p.zcb_due = true;
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: bounced - ZCB auto next (t${p.next_attack})`);
          } else {
            p.next_attack += 4;
            L.on && L(`t${rjust(t, 4)} r${r} ${p.name}: bounced - +4t, back on t${p.next_attack}`);
          }
        }
        if (p.thrall_next == null) {
          p.thrall_next = t + rng.randint(1, 2);
        }
      }
    }
  }
  for (const p of players) {
    p.was_bounced = false;
  }
  if (st['crab_left'] == null) {
    st['crab_left'] = { ...crabs };
  }
  return {
    P, kill, success: kill != null, hp, st, players,
    spec_end: players.map((p) => p.spec),
  };
}
