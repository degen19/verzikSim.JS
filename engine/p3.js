// Phase 3: from P2 HP 0 to the end of the P3 death animation. (Port of p3.py)
import * as supplies from './supplies.js';
import * as horn from './horn.js';
import { auto_surge, custom_surge, hit_chance, PRAYERS } from './sim.js';
import { Rng } from './rng.js';
import { floordiv, pymod, pyround, ga, truthy, range, sum, any, all, maxBy, sorted, dget, has, fx, rjust } from './util.js';

export const P3_HP = { 5: 3500, 4: 3062, 3: 2625, 2: 2625 };
export const P3_20 = { 5: 700, 4: 612, 3: 525, 2: 525 };
export const P3_DEF_LVL = 150, P3_SLASH = 30;
export const P3_DEF = { 1: (P3_DEF_LVL + 9) * (P3_SLASH + 64) };   // slash 14,946 (15,604 once a tornado hit boosts her stats 5%)
export const VERZ_ATK_LVL = 300, VERZ_ATK_BONUS = 80;
export const AUTO_DELAY = 2;                                  // assumed, same as P1
export const N_AUTOS = 9;
export const MAX_ATTACKS = 10;                                // 9 autos + one last attack (62 + 7 = 69, or 5 after a 20% proc)
export const TORNADO_HIT_CHANCE_PER_PLAYER = 0.02;
export const CHALLY_THRESHOLD = 0.07;
export const EAT_AT = 22;
// defence bonuses (stab, slash, crush, magic, ranged)
export const DEF = {
  'Torva full helm': [59, 60, 62, -2, 57], 'Torva platebody': [117, 111, 117, -11, 142],
  'Torva platelegs': [87, 78, 79, -9, 102], 'Oathplate helm': [50, 72, 45, 0, 50],
  'Oathplate chest': [105, 128, 100, -5, 112], 'Oathplate legs': [75, 100, 73, -3, 81],
  'Ferocious gloves': [0, 0, 0, 0, 0], 'Infernal cape': [12, 12, 12, 12, 12],
  'Avernic treads': [21, 25, 25, 10, 10], 'Rancour': [0, 0, 0, 0, 0], 'Blood fury': [15, 15, 15, 15, 15],
  'Scythe': [-2, 8, 10, -2, 0],
};
export const SCY = { atk: 125, str: 75 };
export const CLAW = { atk: 57, str: 56 };
export const HALB = { atk: 110, str: 118 };
export const THREE = { atk: 120, str: 40 };                   // has3Tick weapon: crush
export let P3_CRUSH = (150 + 9) * (70 + 64);                  // 21,306
export let P3_MAGIC = (150 + 9) * (100 + 64);                 // 26,076 (magic uses her Defence level)
export const AYAK_DELAY = 2;                                  // queues as [2, damage]


/** Eye of ayak: +30 magic atk, 3t, max floor(magic/3)-6; swaps staff + confliction gauntlets only, no magic prayer. */
export function ayak(p) {
  const gear = p.pieces('T');                                 // melee armour + confliction instead of ferocious
  const atk_b = 30 + sum(gear.map((g) => g['atk'][3]));
  const mdmg = sum(gear.map((g) => dget(g, 'mdmg', 0)));
  const eff = p.mag + 9;
  const mx = floordiv((floordiv(p.mag, 3) - 6) * (100 + mdmg), 100);
  return [hit_chance(eff * (atk_b + 64), P3_MAGIC), mx];
}


export function melee(p, w, def_roll, acc_mult = 1.0, idx = 1) {
  const gear = p.pieces('S');
  const atk_b = w['atk'] + sum(gear.map((g) => g['atk'][idx]));
  const str_b = w['str'] + sum(gear.map((g) => g['str']));
  const [pa, pd] = truthy(ga(p, 'prayer_down', false)) ? [1.0, 1.0] : PRAYERS[p.prayer];   // prayer at 0: no Piety/Zeal either
  const eff_a = Math.floor(p.atk * pa) + 8;
  const eff_s = Math.floor(p.str * pd) + 3 + 8;
  const roll = Math.floor(eff_a * (atk_b + 64) * acc_mult);
  return [hit_chance(roll, def_roll), floordiv(eff_s * (str_b + 64) + 320, 640)];
}


export function player_def_roll(p, style) {
  const pieces = [p.helm, p.body, p.legs, 'Ferocious gloves', 'Infernal cape', 'Avernic treads', p.amulet, 'Scythe'];
  const i = style === 'magic' ? 3 : 4;
  const bonus = sum(pieces.map((x) => DEF[x][i]));
  const dlvl = Math.floor(p.dfn * 1.25);                     // Piety / Zeal +25% defence
  let eff;
  if (style === 'magic') {
    eff = Math.floor(p.mag * 0.7 + dlvl * 0.3) + 8;
  } else {
    eff = dlvl + 8;
  }
  return eff * (bonus + 64);
}


// ---------------------------------------------------------------- Verzik's P3 rotation (every scale)
// 9 autos > move to webs (drag) > webs (31t) > 4 attacks > yellows (14t invulnerable) > 4 autos > green ball (12t cd)
// > 9 attacks > move to webs > ...   Cooldown 7, or 5 once below 20%.
export const DUO_DEFAULT_3T = 'Ayak';
export const P3_BREW_BELOW = 40;
export const P3_BREW_AT_PRE_GREEN = 59;   // after yellows until the green ball lands: brew at <= 59 (-> 75+, survives 74 into redemption)
export const SCRATCH_W = 0.75;            // planner weight on claw scratches so a scythe wins any near-tie
export const WEBS_LEN = 31;               // webs ticks (e.g. 72-102)
export const POST_WEBS_GAP = 8;           // first attack after webs = last web tick + 8 (20% on the last web hit: proc + 5)
export const YELLOW_LEN = 14;             // invulnerable ticks; players queue on the 15th, it lands on the 16th
export const POST_YELLOW_GAP = 22;        // her first attack after yellows: 22nd tick counting the first invulnerable tick as 1
export const GREEN_CD = 12;               // cooldown after the green ball
export const GREEN_DMG = 74, GREEN_DELAY = 8;   // green ball: 74 to a random player 8 ticks after launch (no vengeance)
export const GREEN_PASS_DMG = 7;          // passing the green ball: the passer takes 7, the new target takes the ball 8 ticks later
export const HORN_WEBS_HIT = { 5: 5, 4: 6, 3: 8 };   // P3 horn player: horn after the crab spawn if no halberd by this webs swing


export function _avg(m) {
  return m > 0 ? (m + 1) / 2 : 0;
}


/** Expected damage per action for one player (cached per call). */
export class Plan {
  constructor(p, rng) {
    let ch, m, ch1, ch2;
    [ch, m] = melee(p, SCY, P3_DEF[1]); this.S = ch * (_avg(m) + _avg(floordiv(m, 2)) + _avg(floordiv(m, 4)));
    [ch, m] = melee(p, CLAW, P3_DEF[1]); this.scratch = ch * (_avg(m) + _avg(floordiv(m, 2)));
    this.C = _claw_exp(pyround(ch, 3), m);
    [ch1, m] = melee(p, HALB, P3_DEF[1]); [ch2] = melee(p, HALB, P3_DEF[1], 0.75); m = floordiv(m * 110, 100);
    this.H = (ch1 + ch2) * _avg(m);
    if (p.has3 === 'Ayak') {
      [ch, m] = ayak(p);
    } else if (p.has3 === 'Swift blade') {
      [ch, m] = melee(p, { atk: 0, str: 0 }, P3_DEF[1]);
    } else if (truthy(p.has3)) {
      [ch, m] = melee(p, THREE, P3_CRUSH, 1.0, 2);
    } else {
      [ch, m] = [0, 0];
    }
    this.T3 = ch * _avg(m);
  }
}


export const _claw_cache = new Map();


export function _claw_exp(ch, m) {
  const key = JSON.stringify([ch, m]);
  if (!_claw_cache.has(key)) {
    const g = new Rng(1);
    let s = 0;
    for (let i = 0; i < 4000; i++) s += sum(claw_hits(ch, m, g));
    _claw_cache.set(key, s / 4000);
  }
  return _claw_cache.get(key);
}


/** Spec they'll have on tick t (regen only, no spending). */
export function spec_at(p, t_now, t) {
  let s = p.spec, timer = p.regen_timer;
  const per = p.regen_period();
  const n = Math.max(0, t - t_now);
  for (let i = 0; i < n; i++) {
    if (s >= 100) break;
    timer += 1;
    if (timer >= per) {
      timer = 0; s = Math.min(100, s + 10);
    }
  }
  return s;
}


/** Best first action from tick t so the last swing starts by `end` (the tick before invulnerability).
 * Actions: S 5t, C claw 4t (50%), 3 = 3-tick weapon, X claw scratch 4t, H halberd 7t (30%, only as the last swing
 * or once chally_ok), W wait 1. Blocked ticks (collisions) force a wait. Returns [action, value]. */
export function plan_first(p, t, end, blocked, pl, allow_claw, chally_ok) {
  const gains = new Map();
  const avail = (a, spent) => {
    if (!gains.has(a)) gains.set(a, spec_at(p, t, a));
    return gains.get(a) - spent;
  };
  const memo = new Map();
  const f = (a, spent) => {
    if (a > end) return [0.0, null];
    const key = `${a},${spent}`;
    if (memo.has(key)) return memo.get(key);
    if (has(blocked, a)) {
      const r = [f(a + 1, spent)[0], 'W'];
      memo.set(key, r); return r;
    }
    let best = null;
    const opts = [['S', pl.S, 5, 0]];
    if (allow_claw && avail(a, spent) >= 50) opts.push(['C', pl.C, 4, 50]);
    if (truthy(p.has3)) opts.push(['3', pl.T3, 3, 0]);
    opts.push(['X', pl.scratch * SCRATCH_W, 4, 0]);   // claw scratch: last resort (claw > scythe > halberd > scratch)
    if (avail(a, spent) >= 30 && (a + 7 > end || chally_ok)) opts.push(['H', pl.H, 7, 30]);
    opts.push(['W', 0.0, 1, 0]);                      // waiting only wins when it's strictly better
    for (const [code, val, ln, cost] of opts) {
      const v = val + f(a + ln, spent + cost)[0];
      if (best === null || v > best[0] + 1e-9) best = [v, code];
    }
    memo.set(key, best);
    return best;
  };
  const [v, code] = f(t, 0);
  return [code || 'S', v];
}


export function p3_phase(pool) {
  if (truthy(ga(pool, 'green_landed', false))) return 'P3 after green ball';
  if (truthy(ga(pool, 'yellows_started', false))) return 'P3 after yellows, before green';
  return 'P3 before yellows';
}


/** Iteration order of a CPython set of small non-negative ints built by adding `values` in order
 * (needed where Python takes max(set, key=...) and ties fall to set order). */
export function _py_int_set_order(values) {
  let mask = 7, table = new Array(8).fill(null), fill = 0;
  const ins = (tbl, msk, x, check) => {
    let i = x & msk, perturb = x;
    for (;;) {
      let probes = (i + 9 <= msk) ? 9 : 0;
      let j = i;
      do {
        if (tbl[j] === null) { tbl[j] = x; return true; }
        if (check && tbl[j] === x) return false;
        j++;
      } while (probes-- > 0);
      perturb = Math.floor(perturb / 32);
      i = (i * 5 + 1 + perturb) & msk;
    }
  };
  for (const x of values) {
    if (ins(table, mask, x, true)) {
      fill++;
      if (!(fill * 5 < mask * 3)) {
        let ns = 8;
        while (ns <= fill * 4) ns <<= 1;
        const nt = new Array(ns).fill(null);
        for (const y of table) if (y !== null) ins(nt, ns - 1, y, false);
        table = nt; mask = ns - 1;
      }
    }
  }
  return table.filter((y) => y !== null);
}


export function run_p3(r_reds, cfgs, team, rng, log = null) {
  const L = log != null ? (s) => log.push(s) : (s) => {};
  const players = r_reds['players'], pid = r_reds['pid'], Kp = r_reds['kill'];
  const rank = new Map(pid.map((p, k) => [p, k]));
  const duo = team === 2;
  let hp = P3_HP[team];
  const mx = hp;
  const mark20 = P3_20[team];
  const tornado_pct = duo ? 0 : dget(cfgs[0], 'tornadoPct', TORNADO_HIT_CHANCE_PER_PLAYER * 100);   // duos: never hit
  P3_DEF[1] = (P3_DEF_LVL + 9) * (P3_SLASH + 64);  // reset (a previous raid's tornado boost)
  P3_CRUSH = (P3_DEF_LVL + 9) * (70 + 64); P3_MAGIC = (P3_DEF_LVL + 9) * (100 + 64);
  const chally_hp = Math.floor(mx * (dget(cfgs[0], 'challyThr', CHALLY_THRESHOLD * 100) / 100));
  const ducktank = true;                               // every scale (duos always Ducktank - it's better)
  let atk_lvl = VERZ_ATK_LVL;
  let boosted = false;
  if (!duo) {                                          // duo: the crab DCs were paid out during the reds sets
    for (const p of players) {
      const gain = 15 * (p.west + p.east);
      if (gain) {
        const old = p.spec;
        p.spec = Math.min(100, p.spec + gain);
        L(`t${rjust(Kp, 4)} ${p.name}: West/East DC +${gain}% -> ${fx(old)}% -> ${fx(p.spec)}%`);
      }
    }
  }
  const alive = players.filter((p) => !p.dead);
  const tank = rng.choice(alive);
  const others = alive.filter((p) => p !== tank);
  const st = {
    tank: tank.name, below20: null, below20_auto: null, below20_attacker: null, below20_round: null,
    autos_before20: null, tornado_hits: 0, veng_dmg: 0, vengs: 0, kill: null, end: null,
    snap9: null, start_snap: null, chally: 0, claws: 0, tank_early_chally: false, eats: 0, horns: 0, horn_hits: 0,
    webs_start: null, webs_end: null, yellow: null, yellow_skip: null, drag: null, green: 0, scratches: 0, t3: 0,
  };
  players.forEach((p, i) => {
    p.next_attack = Kp + 6;
    const h3 = dget(cfgs[i], 'has3Tick', false);
    p.has3 = ['Breaker', 'Ayak', 'Swift blade'].includes(h3) ? h3 : (h3 === true ? 'Breaker' : false);
    if (!truthy(p.has3)) {
      p.has3 = DUO_DEFAULT_3T;                         // every scale: Eye of ayak unless the chart says otherwise
    }
    p.p3_n = 0;
    p.thrall_next = null;
    p.veng_active = true;
    p.veng_cast = -(10 ** 6);
    p.off_prayer = Math.trunc(Number(dget(cfgs[i], 'offPrayer', null) || 0));
    p.off_used = 0;
    p.horn_buff = null;
    p.pending = [];
    p.halb_done = false;
    p.special_done = false;
    p.resync_after = false;
    p.last_atk_t = null;
    p.sc_at = null;
    p.need_restore = false; p.prayer_down = false;
    p.rflick = truthy(dget(cfgs[i], 'redemptionFlick', null));
    p.pass_green = truthy(dget(cfgs[i], 'passGreen', true));   // default on
    p.pl = new Plan(p, rng);
  });
  const pools = [...new Set(players.map((p) => p.pool))];
  for (const pl_ of pools) {
    pl_.scb_res = 0; pl_.kp = Kp + 4; pl_.phase = 'P2->P3';
  }
  for (const p of supplies.by_hp(players)) {           // P2 -> P3 transition: too short for more than shark + brew + super combat
    supplies.window(p, 2, L, Kp, 'P2->P3 ', { sharks: true });
  }
  for (const pl_ of pools) {
    pl_.phase = p3_phase(pl_);
  }
  const brew_at = (q) => {
    const ph = p3_phase(q.pool);
    return ph === 'P3 after yellows, before green' ? P3_BREW_AT_PRE_GREEN : P3_BREW_BELOW - 1;
  };
  st['start_snap'] = players.map((p) => p.snapshot());
  L(`\n=== PHASE 3 === P2 died t${Kp}. Verzik ${hp}, 20% mark below ${mark20}, chally at <= ${chally_hp}. ` +
    `Tank: ${tank.name}${ducktank ? ' (Ducktank)' : ' (standard tank)'}. P3 tick 1 = t${Kp + 5}; first attacks t${Kp + 6}, ` +
    `autos from t${Kp + 10} every 7`);
  const tick = (t) => t - Kp - 4;                      // chart tick
  // ---- Verzik's schedule
  const V = {
    cd: 7, ev: 'auto', at: Kp + 10, n: 0, block: 9, cycle: 1, a9: null, proc: null, drag3: false,
    blocked: new Set(), invuln: null, y5: null, webs: null, first_post: null,
  };
  const atk_ticks = [];                                // her attack ticks so far (collisions)
  let vq = [];
  const tl = [];
  let autos = 0;
  let kill = null;
  let anim = 9;
  const first_auto = Kp + 10;

  /** Called after one of her attacks on tick t: line up the next event. */
  const schedule_after_attack = (t) => {
    const ev = V['ev'];
    if (['auto', 'post', 'autoY', 'auto9'].includes(ev)) {
      V['n'] += 1;
      if (V['n'] >= V['block']) {
        if (ev === 'auto' || ev === 'auto9') {
          V['a9'] = t; V['ev'] = 'move'; V['at'] = t + V['cd'];
        } else if (ev === 'post') {
          V['ev'] = 'yellow'; V['at'] = t + V['cd']; V['y5'] = V['at'];
        } else {                                        // 4 autos after yellows -> green ball
          V['ev'] = 'green'; V['at'] = t + V['cd'];
        }
      } else {
        V['at'] = t + V['cd'];
      }
    } else if (ev === 'green') {
      V['ev'] = 'auto9'; V['n'] = 0; V['block'] = 9; V['at'] = t + GREEN_CD;
    }
  };

  /** Projected 'would-be 5th attack' tick (last swing tick before yellows), or null before webs start. */
  const est_y5 = (t) => {
    if (V['ev'] === 'yellow') return V['at'];
    if (V['ev'] === 'post') return V['at'] + (V['block'] - V['n']) * V['cd'];
    if (V['ev'] === 'webs') {
      const first = V['webs'][1] + POST_WEBS_GAP;
      return first + 4 * V['cd'];
    }
    return null;
  };

  /** Her projected attack ticks in (t, end]: post-webs attacks before yellows. */
  const her_ticks = (t, end) => {
    const out = new Set();
    if (V['ev'] === 'post') {
      let a = V['at'], n = V['n'];
      while (n < V['block'] && a <= end) {
        out.add(a); a += V['cd']; n += 1;
      }
    } else if (V['ev'] === 'webs') {
      let a = V['webs'][1] + POST_WEBS_GAP;
      for (let i = 0; i < 4; i++) {
        if (a <= end) out.add(a);
        a += V['cd'];
      }
    }
    return out;
  };

  const on_proc = (t) => {
    V['cd'] = 5;
    V['proc'] = t;
    const ev = V['ev'];
    if (ev === 'webs') {
      if (t === V['webs'][1]) V['first_post'] = t + 5;
      return;
    }
    if (ev === 'yellow' && t === V['at']) return;     // proc on the would-be 5th: no delay
    if (ev === 'autoY' && V['n'] === 0) return;       // first attack after yellows is fixed (22nd tick), pre or post 20%
    if (V['at'] != null && V['at'] > t && ev !== 'invuln') {
      V['at'] = t + 5;
      if (ev === 'yellow') V['y5'] = V['at'];
    }
    L(`t${rjust(t, 4)} Verzik's cooldown -> 5; next ${ev} t${(V['at'] && V['at'] > t) ? V['at'] : t + 5}`);
  };

  let t = Kp + 1;
  while (t < Kp + 1000) {
    // ---- Verzik queue step (damage lands)
    const landing = sorted(vq.filter((h) => h[0] === t), (h) => [h[1], h[2]]);
    vq = vq.filter((h) => h[0] !== t);
    for (const h of landing) {
      const label = h[3], amt = h[4], p = h[5];
      if (kill !== null) {
        anim = 8;
        L(`t${rjust(t, 4)} ${p.name}: ${label} ${amt} lands after the kill (overkill)`);
        break;
      }
      hp -= amt;
      L(`t${rjust(t, 4)} ${p.name}: ${label} ${amt} -> Verzik ${hp}`);
      if (hp < mark20 && st['below20'] === null) {
        st['below20'] = t; st['below20_auto'] = autos; st['below20_attacker'] = p.name;
        st['below20_round'] = p.p3_n;
        L(`t${rjust(t, 4)} *** BELOW 20% *** (${hp}) after ${autos} attacks; crossing hit from ${p.name} #${p.p3_n} (chart tick ${tick(t)})`);
        tl.push([t, 'V', '20%']);
        on_proc(t);
        for (const q of players) {
          if (!q.dead && rng.random() < tornado_pct / 100) {
            q.pending.push([t + rng.randint(1, 3), 'tornado']);
          }
        }
      }
      if (hp <= 0) kill = t;
    }
    if (kill !== null) break;
    // ---- Verzik step
    const y5_pre = est_y5(t);
    let verz_now = false;
    if (V['at'] != null && t === V['at']) {
      const ev = V['ev'];
      if (ev === 'move') {
        let d;
        if (V['cycle'] === 1 && duo && V['drag3']) {
          d = 3;
        } else if (V['proc'] != null && V['proc'] <= V['a9'] + 1) {
          d = 0;
        } else {
          d = 1;
        }
        const ws = t + d + 2;
        V['blocked'] = new Set(range(t + 1, ws));
        V['webs'] = [ws, ws + WEBS_LEN - 1];
        V['ev'] = 'webs'; V['at'] = ws + WEBS_LEN - 1;
        // everyone swings on the same ticks during webs: anyone off the team's tick loses ticks to join it
        const live = players.filter((q) => !q.dead);
        let refs = live.filter((q) => q !== tank);
        if (!refs.length) refs = live;
        let ref;
        if (duo) {
          ref = Math.max(...refs.map((q) => Math.max(q.next_attack, ws)));
        } else {
          const cand = _py_int_set_order(refs.map((q) => Math.max(q.next_attack, ws)));
          ref = maxBy(cand, (x) => refs.filter((q) => pymod(Math.max(q.next_attack, ws), 5) === pymod(x, 5)).length);
        }
        for (const q of live) {
          const na = Math.max(q.next_attack, ws);
          if (pymod(na - ref, 5)) {
            q.next_attack = na + pymod(ref - na, 5);
            L(`t${rjust(t, 4)} ${q.name}: off the team's tick for webs -> next swing t${q.next_attack} (chart ${tick(q.next_attack)})`);
          }
        }
        if (V['cycle'] === 1) {
          st['webs_start'] = ws; st['webs_end'] = ws + WEBS_LEN - 1; st['drag'] = d;
        }
        L(`t${rjust(t, 4)} Verzik moves to webs (drag ${d}): webs t${ws}-t${ws + WEBS_LEN - 1} (chart ${tick(ws)}-${tick(ws + WEBS_LEN - 1)})`);
        tl.push([t, 'V', 'move']);
      } else if (ev === 'webs') {                     // last web tick
        const first = V['first_post'] || (t + POST_WEBS_GAP);
        V['ev'] = 'post'; V['n'] = 0; V['block'] = 4; V['at'] = first; V['first_post'] = null;
        L(`t${rjust(t, 4)} webs end; her first attack after webs t${first}`);
      } else if (ev === 'yellow') {
        V['invuln'] = [t + 1, t + YELLOW_LEN];
        if (st['yellow'] === null) {
          st['yellow'] = t + 1;
          for (const q of pid) {
            q.pool.yellows_started = true; q.pool.phase = p3_phase(q.pool);
          }
          st['hp_yellow'] = hp - sum(vq.filter((h) => h[0] === t + 1).map((h) => h[4]));   // incl. hits already in the air
          st['yellow_skip'] = false;
        }
        V['ev'] = 'autoY'; V['n'] = 0; V['block'] = 4; V['at'] = t + POST_YELLOW_GAP;
        V['cycle'] += 1;
        for (const q of supplies.by_hp(players)) {     // 14 invulnerable ticks: heal up, restore, super combat
          supplies.window(q, floordiv(YELLOW_LEN - 1, 3) + 1, L, t + 1, 'yellows ', { sharks: true, hp_target: 115 });
        }
        L(`t${rjust(t, 4)} YELLOWS: invulnerable t${t + 1}-t${t + YELLOW_LEN} (chart ${tick(t + 1)}-${tick(t + YELLOW_LEN)}); ` +
          `next attack t${t + POST_YELLOW_GAP}`);
        tl.push([t + 1, 'V', 'Y']);
      } else {                                        // an attack: auto / post / autoY / green / auto9
        verz_now = true;
        autos += 1;
        atk_ticks.push(t);
        if (ev === 'auto' && V['cycle'] === 1 && V['n'] + 1 === 5 && dget(st, 'crab_t', null) == null) {
          st['crab_t'] = t;                           // her 5th attack: technically the crab spawn
        }
        tl.push([t, 'V', ev === 'green' ? 'G' : 'A']);
        if (ev === 'green') {
          const alive_now = players.filter((q) => !q.dead);
          const tgt = rng.choice(alive_now);
          tgt.pending.push([t + GREEN_DELAY, 'green', { chain: [tgt], passes: alive_now.length }]);
          st['green'] += 1;
          L(`t${rjust(t, 4)} VERZIK GREEN BALL -> ${tgt.name} takes ${GREEN_DMG} on t${t + GREEN_DELAY}; next attack t${t + GREEN_CD}`);
        } else {
          const style = rng.random() < 0.5 ? 'magic' : 'ranged';
          const parts = [];
          const a_roll = (atk_lvl + 9) * (VERZ_ATK_BONUS + 64);
          for (const p of players) {
            if (p.dead) continue;
            const due = sum(p.pending.filter((x) => typeof x[1] === 'number' && x[0] <= t + AUTO_DELAY).map((x) => x[1]));
            const off = p.veng_active && p.off_used < p.off_prayer && p.hp - due > 34;
            if (off) p.off_used += 1;
            const mxh = (off || truthy(p.prayer_down)) ? 34 : 17;
            const ch = hit_chance(a_roll, player_def_roll(p, style));
            const d = rng.random() < ch ? rng.randint(0, mxh) : 0;
            p.pending.push([t + AUTO_DELAY, d]);
            parts.push(`${p.name} ${d}${off ? ' (off prayer)' : ''}`);
          }
          L(`t${rjust(t, 4)} VERZIK ${ev} #${V['n'] + 1} (${style}, chart ${tick(t)}) lands t${t + AUTO_DELAY}: ` + parts.join(', '));
        }
        schedule_after_attack(t);
        if (ev === 'auto' && V['ev'] === 'move') st['after9'] = t;
      }
    }
    if (V['invuln'] && t > V['invuln'][1]) V['invuln'] = null;
    const inv = V['invuln'] !== null && V['invuln'][0] <= t && t <= V['invuln'][1];
    // ---- players
    const y5 = y5_pre !== null ? y5_pre : est_y5(t);
    const tank_on = !tank.dead && tank.next_attack <= t;          // tank swings (or collides) this tick
    // before 20%: the non-tank drops a tick to stay on the tank's tick when the tank collides, unless the tank
    // will claw on its very next swing (the claw wins the tick back right away)
    const nt_sync = duo && tank_on && st['below20'] === null &&
      (truthy(dget(st, 'post_col_seen', null)) || spec_at(tank, t, t + 1) < 50);   // the claw only ever catches up on that 4th swing
    for (const p of pid) {
      if (p.dead) continue;
      for (const item of p.pending.filter((x) => x[0] === t)) {
        if (item[1] === 'tornado') {
          const lost = floordiv(p.hp, 2);
          p.hp -= lost;
          supplies.check_death(p, p3_phase(p.pool), L, t);
          const old = hp;
          hp = Math.min(mx, hp + 3 * lost);
          st['tornado_hits'] += 1;
          L(`t${rjust(t, 4)} ${p.name}: TORNADO hit, loses ${lost} HP -> ${p.hp}; Verzik heals ${hp - old} -> ${hp}`);
          if (!boosted) {
            boosted = true;
            atk_lvl = Math.floor(atk_lvl * 1.05);              // combat stats +5% (rounded down), not HP
            const dl = Math.floor(P3_DEF_LVL * 1.05);
            P3_DEF[1] = (dl + 9) * (P3_SLASH + 64);
            P3_CRUSH = (dl + 9) * (70 + 64); P3_MAGIC = (dl + 9) * (100 + 64);
            st['tornado_boost'] = t;
            L(`t${rjust(t, 4)} Verzik's combat stats +5% from the tornado: attack ${atk_lvl}, defence ${Math.floor(P3_DEF_LVL * 1.05)}`);
          }
          continue;
        }
        if (item[1] === 'green') {
          const meta = item.length > 2 ? item[2] : { chain: [p], passes: 0 };
          const chain = meta['chain'];
          const mates = players.filter((q) => q !== p && !q.dead && q.hp > 0);
          const pingpong = chain.length >= 3 && chain[chain.length - 3] === p;   // A B A: the second A can't pass it on
          if (p.pass_green && 0 < p.hp && p.hp <= GREEN_DMG && meta['passes'] > 0 && mates.length && !pingpong) {
            const nxt = rng.choice(mates);
            p.hp -= GREEN_PASS_DMG;
            st['green_passes'] = dget(st, 'green_passes', 0) + 1;
            p.pool.green_passes = ga(p.pool, 'green_passes', 0) + 1;
            L(`t${rjust(t, 4)} ${p.name}: PASSES the green ball (would die) - takes ${GREEN_PASS_DMG} -> ${p.hp} HP; ` +
              `${nxt.name} takes it t${t + GREEN_DELAY} (${chain.concat([nxt]).map((q) => q.name).join(' > ')})`);
            if (p.pool.left['restore'] > 0) supplies.redemption(p, L, t, 'green ball pass');
            supplies.check_death(p, 'P3 green ball hit', L, t);
            nxt.pending.push([t + GREEN_DELAY, 'green', { chain: chain.concat([nxt]), passes: meta['passes'] - 1 }]);
            continue;
          }
          if (0 < p.hp && p.hp <= GREEN_DMG) {
            const pl_ = p.pool;
            const why = pl_.left['brew'] <= 0 ? 'out of brews' : (pl_.scb_free() <= 0 ? 'out of super combats' :
              (p.hp >= 60 ? 'HP 60-74 (above the 59 brew line)' : 'HP <= 59, no brew in time'));
            pl_.green_why = ga(pl_, 'green_why', []).concat([why]);
          }
          p.hp -= GREEN_DMG;
          if (!has(st, 'green_74')) st['green_74'] = t;   // first time the green ball's 74 actually lands
          L(`t${rjust(t, 4)} ${p.name}: green ball ${GREEN_DMG} -> ${p.hp} HP (no vengeance)`);
          if (p.pool.left['restore'] > 0) {              // prayed only under 84 HP (the only time it can proc), and only
            supplies.redemption(p, L, t, 'green ball');  // with a restore left - otherwise Piety/Zeal would be lost
          }
          supplies.check_death(p, 'P3 green ball hit', L, t); p.pool.green_landed = true; p.pool.phase = p3_phase(p.pool);
          for (const q of players) q.pool.phase = p3_phase(q.pool);
          continue;
        }
        const d = item[1];
        p.hp -= d;
        let msg = `t${rjust(t, 4)} ${p.name}: takes ${d} -> ${p.hp} HP`;
        const pool_ = p.pool;
        if (p.rflick && !truthy(p.prayer_down) && pool_.left['restore'] > 0 &&
            (pool_.left['brew'] <= 0 || pool_.scb_free() <= 0)) {
          supplies.redemption(p, L, t, 'flicked on the auto');
        }
        supplies.check_death(p, p3_phase(p.pool), L, t);
        if (d > 0 && p.veng_active && !inv) {
          const v = floordiv(d * 75, 100);
          hp -= v;
          st['veng_dmg'] += v; st['vengs'] += 1;
          p.veng_active = false;
          msg += `; VENG ${v} -> Verzik ${hp}`;
          if (hp < mark20 && st['below20'] === null) {
            st['below20'] = t; st['below20_auto'] = autos; st['below20_attacker'] = p.name + ' (veng)';
            st['below20_round'] = p.p3_n;
            tl.push([t, 'V', '20%']);
            on_proc(t);
          }
          if (hp <= 0 && kill === null) kill = t;
        }
        L(msg);
      }
      p.pending = p.pending.filter((x) => x[0] !== t);
      if (!p.veng_active && t - p.veng_cast >= 50) {
        p.veng_active = true;
        p.veng_cast = t;
      }
      // the tick after their attack: Heal Other + phoenix necklace first, else brew under 40 (only with a super
      // combat left for before the next swing; a shark combo-eaten if it won't delay that swing)
      if (truthy(supplies.prayer_restore(p, t, L)) && p.sc_at === t) {   // priority: protection prayers back after redemption
        p.sc_at = t + 3;
      }
      supplies.catchup(p, t, L);                      // failsafe after a heal-up window (never delays a swing)
      if (ga(p, 'last_atk_t', null) === t - 1 && !inv && !truthy(p.need_restore)) {
        if (truthy(supplies.heal_other(p, players, t, L, (q) => { q.pending.length = 0; }))) {
          st['heal_others'] = dget(st, 'heal_others', 0) + 1;
        } else if (p.hp <= brew_at(p) && t >= p.sip_ready && truthy(supplies.scb_ok(p, players, brew_at)) && truthy(p.pool.take('brew'))) {
          p.pool.scb_res += 1;
          const old = p.hp;
          const ate = p.next_attack - t >= 3 && p.hp + supplies.SHARK_HEAL <= supplies.MAX_HP && truthy(p.pool.take('shark'));
          if (ate) supplies.eat_shark(p);
          supplies.drink_brew(p);
          p.sip_ready = t + 3; p.sc_at = t + 3;
          st['eats'] += 1;
          L(`t${rjust(t, 4)} ${p.name}: ${ate ? 'shark + ' : ''}brew ${old} -> ${p.hp} HP (super combat t${t + 3})`);
        }
      }
      if (ga(p, 'sc_at', null) === t) {
        p.sc_at = null;
        p.pool.scb_res -= 1;
        if (truthy(p.pool.take('scb'))) {
          supplies.drink_scb(p, t, p3_phase(p.pool) + ` (brew at <= ${brew_at(p)})`); p.sip_ready = t + 3;
        }
      }
      // last resort: no super combat to follow a normal brew, but brews left - brew only as much as it takes to
      // survive the next Verzik auto (max 17 on prayer, 34 with prayers down); restoring prayer after redemption first
      if (!truthy(p.need_restore) && t >= p.sip_ready && p.sc_at == null && p.pool.left['brew'] > 0 &&
          !truthy(supplies.scb_ok(p, players, brew_at))) {
        const mxh_ = truthy(p.prayer_down) ? 34 : 17;
        if (0 < p.hp && p.hp <= mxh_ && truthy(p.pool.take('brew'))) {
          const old = p.hp;
          supplies.drink_brew(p); p.sip_ready = t + 3;
          p.pool.emergency_brews = ga(p.pool, 'emergency_brews', 0) + 1;
          L(`t${rjust(t, 4)} ${p.name}: EMERGENCY brew (no super combat to follow) ${old} -> ${p.hp} HP, stats drop to Atk ${p.atk} Str ${p.str}`);
        }
      }
      if (p.spec < 100) {
        p.regen_timer += 1;
        if (p.regen_timer >= p.regen_period()) {
          p.regen_timer = 0;
          p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
        }
      }
      custom_surge(p, t, L); auto_surge(p, t, L);
      if (kill !== null) continue;
      // 3-5 man P3 horn player: if they won't have a halberd (30%) by their Nth swing from the start of webs
      // (5s: 5th, 4s: 6th, trio: 8th = first after webs), horn as soon as possible after the crab spawn (her 5th attack)
      if (!duo && truthy(ga(p, 'horn_p3', false)) && !truthy(p.horn_used_p3) && p.spec >= horn.HORN_COST &&
          dget(st, 'crab_t', null) != null && t > st['crab_t'] && !inv) {
        const nth = dget(HORN_WEBS_HIT, team, 5);
        let ws;
        if (V['webs']) {
          ws = V['webs'][0];
        } else {
          const a9 = V['a9'] || (st['crab_t'] + 4 * V['cd']);
          ws = a9 + V['cd'] + 3;                      // her move + drag + one interactable tick (estimate)
        }
        const target = ws + 5 * (nth - 1);
        if (t <= target && spec_at(p, t, target) < 30) {
          const nic = (q) => q.spec >= 50;
          if (truthy(horn.try_horn(p, players, rank, 'p3', team, nic, L, t))) {
            st['horns'] += 1; st['webs_horn'] = dget(st, 'webs_horn', 0) + 1;
            L(`t${rjust(t, 4)} ${p.name}: no halberd by their webs hit #${nth} -> horned after the crab spawn`);
          }
        }
      }
      if (p.thrall_next !== null && t === p.thrall_next) {
        if (!inv && !V['blocked'].has(t)) {
          vq.push([t + 1, rank.get(p), 9, 'Thrall', rng.randint(0, 3), p]);
        }
        p.thrall_next = t + 4;
      }
      if (t < p.next_attack) continue;
      // ---- can't attack: dragging / not yet interactable / invulnerable
      if (V['blocked'].has(t)) {
        p.next_attack = Math.max(...V['blocked']) + 1;
        continue;
      }
      if (inv) {
        p.next_attack = V['invuln'][1] + 1;           // queue on the 15th tick, lands on the 16th
        continue;
      }
      const in_window = y5 !== null && t <= y5;
      // ---- collisions (her attack ticks; never her first auto)
      if (verz_now && t !== first_auto) {
        if (p === tank) {
          p.next_attack = t + 1;
          L(`t${rjust(t, 4)} ${p.name} (tank): lines up with her attack -> +1t`);
          continue;
        }
        if (in_window && nt_sync) {
          p.next_attack = t + 1;                      // stay on the tank's tick (cheaper than a later scratch fix)
          L(`t${rjust(t, 4)} ${p.name}: drops this tick to stay on the tank's tick`);
          continue;
        }
      }
      const n = p.p3_n + 1;
      let use = 'S';
      // ---- duo: halberd on chart tick 67 (her move to webs comes next) -> 3-tick drag
      if (duo && p !== tank && V['cycle'] === 1 && V['ev'] === 'move' && st['below20'] === null &&
          V['cd'] === 7 && t === V['at'] - 2 && p.spec >= 30) {
        use = 'H'; V['drag3'] = true;
        L(`t${rjust(t, 4)} ${p.name}: 30%+ before webs -> halberd, Verzik will drag 3 ticks`);
      // ---- tank's 13th swing: get back on the team's rhythm
      } else if (p === tank && !p.special_done && n === 13 && (V['ev'] === 'auto' || V['ev'] === 'move')) {
        p.special_done = true;
        const nt_h = duo && others.length > 0 && st['below20'] === null && V['cd'] === 7 &&
          spec_at(others[0], t, V['ev'] === 'auto' ? (V['a9'] || V['at']) + 5 : V['at'] - 2) >= 30;
        if (nt_h) {
          use = 'S';                                  // duo drag path: the drag lines them up
        } else if (p.spec >= 30 && (duo || p.has3 !== 'Breaker')) {
          use = 'H'; st['tank_early_chally'] = true; p.resync_after = true;
        } else if (duo && p.has3 !== 'Breaker' && p.hp < 40 && truthy(p.pool.take('shark'))) {
          use = 'F'; p.resync_after = true;           // duo: under 40 HP, a shark in those 3 ticks instead
        } else {
          use = '3'; p.resync_after = true;           // 3-tick weapon (Eye of ayak unless set)
        }
      } else if (in_window) {
        // ---- up to yellows: plan the swings so the last one lands on the tick before invulnerability
        const chally_ok = hp <= chally_hp;
        if (!duo && chally_ok && p.spec >= 50) {
          use = 'C';
        } else {
          const blocked = new Set(V['blocked']);
          if (p === tank || nt_sync) {
            for (const x of her_ticks(t, y5)) if (x > t) blocked.add(x);
          }
          const behind = p === tank && any(others.map((q) => q.last_atk_t === t - 1));
          const first_col = behind && !truthy(dget(st, 'post_col_seen', null));
          if (first_col) {
            st['post_col_seen'] = true;               // the tank's 4th swing (first knock-back after webs)
          }
          use = window_choice(p, t, y5, blocked, duo, V['webs'] ? V['webs'][1] : null, chally_ok,
            p === tank, behind, st['below20'] !== null,
            st['below20'] !== null && V['webs'] !== null && st['below20'] <= V['webs'][1],
            first_col);
        }
      } else if (hp <= chally_hp) {
        if (p.spec >= 50) {
          use = 'C';
        } else if (p.spec >= 30 && !p.halb_done) {
          use = 'H';
        } else if (truthy(ga(p, 'horn_p3', false)) && !truthy(p.horn_used_p3) && p.spec >= 25) {
          const nic = (q) => q.spec >= 50;
          if (truthy(horn.try_horn(p, players, rank, 'p3', team, nic, L, t))) {
            st['horns'] += 1;
          }
        }
      }
      // ---- do it
      if (use === 'F') {
        const old = p.hp; supplies.eat_shark(p); st['eats'] += 1;
        p.next_attack = t + 3;
        L(`t${rjust(t, 4)} ${p.name} (tank): shark instead of the 3-tick hit ${old} -> ${p.hp} HP`);
      } else if (use === '3') {
        st['t3'] += 1;
        let ch, m, d;
        if (p.has3 === 'Ayak') {
          [ch, m] = ayak(p); d = rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0;
          vq.push([t + AYAK_DELAY, rank.get(p), 0, 'Eye of ayak', d, p]);
        } else if (p.has3 === 'Swift blade') {
          [ch, m] = melee(p, { atk: 0, str: 0 }, P3_DEF[1]); d = rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0;
          vq.push([t + 1, rank.get(p), 0, 'Swift blade', d, p]);
        } else {
          [ch, m] = melee(p, THREE, P3_CRUSH, 1.0, 2);
          const hb = horn.active(p, t);
          if (truthy(hb)) {
            st['horn_hits'] += 1; p.horn_buff = null;
          }
          d = (truthy(hb) || rng.random() < ch) ? Math.max(1, rng.randint(0, m)) : 0;
          vq.push([t + 1, rank.get(p), 0, '3-tick hit', d, p]);
        }
        p.next_attack = t + 3;
        L(`t${rjust(t, 4)} ${p.name}: 3-TICK (${p.has3}) #${n} -> ${d}`);
      } else if (use === 'S') {
        const [ch, m] = melee(p, SCY, P3_DEF[1]);
        const sp = [];
        const buffed = truthy(horn.active(p, t));
        if (buffed) {
          st['horn_hits'] += 1; p.horn_buff = null;
        }
        [m, floordiv(m, 2), floordiv(m, 4)].forEach((mm, k) => {
          const d = ((k === 0 && buffed) || rng.random() < ch) ? Math.max(1, rng.randint(0, mm)) : 0;
          sp.push(d);
          vq.push([t + 1, rank.get(p), k, `Scythe hit ${k + 1}`, d, p]);
        });
        p.next_attack = t + 5;
        L(`t${rjust(t, 4)} ${p.name}: Scythe #${n} (chart ${tick(t)}) -> [${sp.join(', ')}]`);
      } else if (use === 'X') {
        const [ch, m] = melee(p, CLAW, P3_DEF[1]);
        const ds = [];
        [m, floordiv(m, 2)].forEach((mm, k) => {
          const d = rng.random() < ch ? Math.max(1, rng.randint(0, mm)) : 0;
          ds.push(d); vq.push([t + 1, rank.get(p), k, 'Claw scratch', d, p]);
        });
        p.next_attack = t + 4;
        st['scratches'] += 1;
        L(`t${rjust(t, 4)} ${p.name}: claw scratch #${n} -> [${ds.join(', ')}]`);
      } else if (use === 'C') {
        p.spec -= 50;
        st['claws'] += 1;
        const [ch, m] = melee(p, CLAW, P3_DEF[1]);
        const hits = claw_hits(ch, m, rng);
        hits.forEach((d, k) => {
          vq.push([t + 1, rank.get(p), k, `Claw spec hit ${k + 1}`, d, p]);
        });
        p.next_attack = t + 4;
        L(`t${rjust(t, 4)} ${p.name}: CLAW SPEC #${n} (chart ${tick(t)}) -> [${hits.join(', ')}]`);
      } else {
        p.spec -= 30;
        p.halb_done = true;
        st['chally'] += 1;
        let [ch1, m] = melee(p, HALB, P3_DEF[1]);
        const [ch2] = melee(p, HALB, P3_DEF[1], 0.75);
        m = floordiv(m * 110, 100);
        const hits = [];
        const hb = truthy(horn.active(p, t));
        if (hb) {
          st['horn_hits'] += 1; p.horn_buff = null;
        }
        [ch1, ch2].forEach((c, k) => {
          const d = ((k === 0 && hb) || rng.random() < c) ? Math.max(1, rng.randint(0, m)) : 0;
          hits.push(d);
          vq.push([t + 1, rank.get(p), k, `Halberd spec hit ${k + 1}`, d, p]);
        });
        p.next_attack = t + 7;
        L(`t${rjust(t, 4)} ${p.name}: HALBERD SPEC #${n} (chart ${tick(t)}) -> [${hits.join(', ')}]`);
      }
      if (p.resync_after) {
        p.resync_after = false;
        p.next_attack = sync(p.next_attack, Kp);
        L(`t${rjust(t, 4)} ${p.name} (tank): back on the team's rhythm on t${p.next_attack} (chart ${tick(p.next_attack)})`);
      }
      p.p3_n = n;
      p.last_atk_t = t;
      tl.push([t, p.name, use]);
      if (p === tank && n === 9 && ducktank) {
        p.next_attack += 1;
        L(`t${rjust(t, 4)} ${p.name} (tank): 9th swing -> +1t (Ducktank)`);
      }
      if (p.thrall_next === null) {
        p.thrall_next = t + rng.randint(1, 2);
      }
    }
    if (dget(st, 'after9', null) === t && st['snap9'] === null) {
      st['snap9'] = players.map((p) => p.snapshot());
    }
    if (kill !== null) break;
    if (all(players.map((q) => q.dead))) {
      st['wipe'] = t;
      L(duo ? `t${rjust(t, 4)} WIPE - both players dead` : `t${rjust(t, 4)} WIPE - everyone dead`);
      break;
    }
    t += 1;
  }
  st['kill'] = kill;
  if (st['yellow_skip'] === null) {
    st['yellow_skip'] = kill !== null;               // killed before the first yellows
  }
  st['timeline'] = tl;
  st['Kp'] = Kp;
  st['end'] = kill !== null ? kill + anim : null;
  st['anim'] = anim;
  if (st['snap9'] === null) {
    st['snap9'] = players.map((p) => p.snapshot());
  }
  return st;
}


/** Swings up to yellows, per the charted rules (no free optimising):
 * - scythe on rhythm; a swing that would land on a blocked tick (tank collision / sync drop) waits a tick
 * - duo: claw spec on the last web hit if they have 50%
 * - one correction at the end: if their last on-rhythm scythe would leave a 3 or 4 tick gap before the last tick
 *   (the tick before invulnerability), that swing becomes a 3-tick hit (gap 3) or a 4-tick action (gap 4: claw
 *   spec with 50% in duo, else a claw scratch) and the last swing goes on the last tick
 * - the last swing before yellows: halberd spec with 30%, else a scythe */
export function window_choice(p, t, y5, blocked, duo, webs_last, chally_ok, is_tank = false, behind = false, procced = false,
  procced_by_webs = false, first_col = false) {
  const swings = [];
  let a = t;
  while (a <= y5) {
    while (has(blocked, a)) a += 1;
    if (a > y5) break;
    swings.push(a); a += 5;
  }
  if (!swings.length || swings[0] !== t) return 'S';
  const last = swings.length === 1;
  const gap = y5 - swings[swings.length - 1];
  if (duo && is_tank && p.spec >= 50 && !last && behind && !procced && first_col) {
    return 'C';                                       // duo tank knocked a tick behind: claw straight away to catch up
  }
  if (duo && p.spec >= 50 && swings.length === 2) {
    // 2nd-to-last swing before yellows with a claw they didn't use earlier: claw + last swing if that beats
    // scythe + last swing (last swing = halberd with 30% left, else scythe)
    const keep = p.pl.S + (p.spec >= 30 ? p.pl.H : p.pl.S);
    const use_c = p.pl.C + (p.spec - 50 >= 30 ? p.pl.H : p.pl.S);
    if (use_c > keep) return 'C';
  }
  if (last) {
    if (gap === 4 && duo) {
      // duo never scratches before yellows: a 4-tick gap is a claw + one more scythe if that beats the
      // halberd (or scythe) they'd otherwise finish with, else they just finish
      const fin = p.spec >= 30 ? p.pl.H : p.pl.S;
      if (p.spec >= 50 && p.pl.C + p.pl.S > fin) return 'C';
      return p.spec >= 30 ? 'H' : 'S';
    }
    if (gap === 4) return 'X';
    if (gap === 3 && truthy(p.has3)) return '3';
    return p.spec >= 30 ? 'H' : 'S';
  }
  if (chally_ok && p.spec >= 30 && !duo) return 'H';
  return 'S';
}


/** Duo sync rule: will the tank have a claw spec for its correction near the end (last ~15 ticks before yellows)? */
export function tank_claw_soon(tank, t, y5) {
  return y5 != null && spec_at(tank, t, Math.max(t, y5 - 5)) >= 50;
}


/** First team-rhythm tick (P3 tick 2 + 5k) at or after `earliest`. */
export function sync(earliest, Kp) {
  const base = Kp + 6;
  return earliest + pymod(-(earliest - base), 5);
}


export function claw_hits(ch, mx, rng) {
  for (let k = 0; k < 4; k++) {
    if (rng.random() < ch) {
      let x;
      if (k === 0) {
        x = rng.randint(floordiv(mx, 2), mx - 1); return [x, floordiv(x, 2), floordiv(x, 4), floordiv(x, 4) + 1];
      }
      if (k === 1) {
        x = rng.randint(floordiv(3 * mx, 8), floordiv(7 * mx, 8)); return [0, x, floordiv(x, 2), floordiv(x, 2) + 1];
      }
      if (k === 2) {
        x = rng.randint(floordiv(mx, 4), floordiv(3 * mx, 4)); return [0, 0, x, x + 1];
      }
      x = rng.randint(floordiv(mx, 4), floordiv(5 * mx, 4)); return [0, 0, 0, x];
    }
  }
  return rng.random() < 2 / 3 ? [1, 1, 0, 0] : [0, 0, 0, 0];
}
