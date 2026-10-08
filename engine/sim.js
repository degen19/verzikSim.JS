// Port of sim.py - Verzik (ToB Normal Mode) tick simulator - Phase 1 stage.
// (main() / CLI / csv / report printing not ported.)
import {
  floordiv, pymod, ga, dget, has, intKeys, blockRows, isStr, isNum, sum, sorted, maxBy, rjust, ljust, fx, range,
} from './util.js';
import * as supplies from './supplies.js';
import * as horn from './horn.js';

export const TICK = 0.6;

// ---------------------------------------------------------------- gear
// attack: stab, slash, crush, magic, ranged ; str ; rng_str ; magic dmg %
export const ARMOUR = {
  'Torva full helm':  { atk: [0, 0, 0, -5, -5], str: 8 },
  'Torva platebody':  { atk: [0, 0, 0, -18, -14], str: 6 },
  'Torva platelegs':  { atk: [0, 0, 0, -24, -11], str: 4 },
  'Oathplate helm':   { atk: [0, 10, 0, -2, -7], str: 6 },
  'Oathplate chest':  { atk: [0, 16, 0, -16, -18], str: 4 },
  'Oathplate legs':   { atk: [0, 12, 0, -12, -14], str: 2 },
};
export const FIXED = {
  'Ferocious gloves': { atk: [16, 16, 16, -16, -16], str: 14 },
  'Infernal cape':    { atk: [4, 4, 4, 1, 1], str: 8 },
  'Avernic treads':   { atk: [5, 5, 5, 11, 15], str: 6, rstr: 3, mdmg: 2 },
};
export const AMULETS = {
  'Rancour':     { atk: [25, 25, 25, -6, -8], str: 12 },
  'Blood fury':  { atk: [10, 10, 10, 10, 10], str: 8 },
};
export const RINGS = { 'Ultor': { atk: [0, 0, 0, 0, 0], str: 12 }, 'Lightbearer': { atk: [0, 0, 0, 0, 0], str: 0 } };
export const CONFLICTION = { atk: [0, 0, 0, 20, -4], str: 0, mdmg: 7 };

// weapons: style index (0 stab 1 slash 2 crush 3 magic 4 ranged), atk tuple, str, speed
export const WEAPONS = {
  'S': { name: 'Scythe', idx: 1, atk: [70, 125, 30, -6, 0], str: 75, speed: 5, delay: 1 },
  'C': { name: 'Claw scratch', idx: 1, atk: [41, 57, -4, 0, 0], str: 56, speed: 4, delay: 1 },
  'H': { name: 'Swift blade', idx: 1, atk: [0, 0, 0, 0, 0], str: 0, speed: 3, delay: 1 },
  'H_Swift blade': { name: 'Swift blade', idx: 1, atk: [0, 0, 0, 0, 0], str: 0, speed: 3, delay: 1 },
  'H_Breaker': { name: 'Breaker', idx: 2, atk: [0, 0, 120, 0, 0], str: 40, speed: 3, delay: 1 },
  'H_Ayak': { name: 'Eye of ayak', idx: 3, atk: [0, 0, 0, 30, 0], speed: 3, delay: 2, base_minus: 6 },
  'E': { name: 'Eye of ayak', idx: 3, atk: [0, 0, 0, 30, 0], speed: 3, delay: 2, base_minus: 6 },
  'SB': { name: 'Sulphur blades', idx: 1, atk: [11, 72, 0, 0, 0], str: 64, speed: 4, delay: 1 },   // 2 hits, max split
  'B': { name: 'Blowpipe', idx: 4, atk: [0, 0, 0, 0, 30], rstr: 55, speed: 2, delay: 2 },
  'T': { name: 'Sang', idx: 3, atk: [0, 0, 0, 25, 0], speed: 4, delay: 3 },
  'D': { name: 'Dawn spec', speed: 4, delay: 2 },
  'A': { name: 'Dawn auto', speed: 4, delay: 2 },
};

export const P1_HP = { 5: 2000, 4: 1750, 3: 1500, 2: 1500, 1: 1500 };
export const P1_DEF_ROLL = (20 + 9) * (20 + 64);  // 2436, all styles
export const AUTO_QUEUE_FIRST = 19, AUTO_EVERY = 14, AUTO_DELAY = 2;
export const SHADOW_MAGIC = 112;              // duo shadow player's boosted Magic (the P2 shadow is always worked out at 112)
export const TANK_HP = 70;                    // P1 autos hit 0-69: at 70+ HP a player survives any auto
export const PREP_HP = 34;                    // duo range: from 34 HP a shark + brew (+20 +16) on the Ayak tick gets them to 70
export const PREP_EXIT = 35;                  // duo range under 34 HP: brew until back over 34 (35+), then hold
export const HOLD_RESTORE_BELOW = 67;         // duo range holding (not brewing): a super restore whenever melee stats are below this


/** Duo non-shadow player's P1 plan until the next auto that will hit them.
 * 70+: 'none' (no brews). 50-69: 'shark' on the Ayak tick. 34-49: 'shark+brew' on the Ayak tick (one restore allowed
 * before it if melee stats are low). Under 34: 'prep' - brew until 35+, then hold for the Ayak shark + brew.
 * No Ayak tick (or no sharks) before that auto: null = brew as normal. */
export function range_plan(hp, ayak_left, sharks, brews, cur = null) {
  if (hp >= TANK_HP) return 'none';
  if (!ayak_left || sharks <= 0) return null;
  if (cur === 'prep' && hp < PREP_EXIT) return 'prep';
  if (hp + 20 >= TANK_HP) return 'shark';
  if (hp >= PREP_HP) return brews > 0 ? 'shark+brew' : 'shark';
  return 'prep';
}


/** Queue tick of the first P1 auto after tick t. */
export function next_auto(t) {
  if (t < AUTO_QUEUE_FIRST) return AUTO_QUEUE_FIRST;
  return AUTO_QUEUE_FIRST + AUTO_EVERY * (floordiv(t - AUTO_QUEUE_FIRST, AUTO_EVERY) + 1);
}
export const BREW_BELOW = 90;
export const DUO_P1_BREW_BELOW = 85;          // duo P1: brew only below 85 HP; a shark (+ brew) replaces an Ayak hit at <= 70
export const PRAYERS = { 'Piety': [1.20, 1.23], 'Zeal': [1.25, 1.28] };


export const SURGE_CD = 500;                  // surge potion cooldown (ticks)
export const SURGE_AT = 70;                   // after P1: re-surge when off cooldown and at or below this spec %


/** Duos (and later solos) only. From P2 on: surge again (+25%) once its 500-tick cooldown is up, if spec <= 70% and off potion delay. */
export function auto_surge(p, t, L, tag = '') {
  if (!p.auto_surge_on || p.dead || t < p.surge_ready || p.spec > SURGE_AT || t < p.sip_ready) return false;
  const old = p.spec;
  p.spec = Math.min(100, p.spec + 25); p.gain_src = 'other';
  p.surge_ready = t + SURGE_CD;
  p.sip_ready = t + 3;
  L.on && L(`t${rjust(t, 4)} ${tag}${p.name}: surge (cooldown up) ${fx(old)}% -> ${fx(p.spec)}%`);
  return true;
}


/** 'Custom Surge Timing' (player has no P on their P1 chart): drink the surge on that room tick, or as soon as
 * the potion delay allows after it. */
export function custom_surge(p, t, L, tag = '') {
  if (p.custom_tick == null || p.custom_done || p.dead || t < p.custom_tick || t < p.sip_ready) return false;
  p.custom_done = true;
  const old = p.spec;
  p.spec = Math.min(100, p.spec + 25); p.gain_src = 'other';
  p.surge_ready = t + SURGE_CD;
  p.sip_ready = t + 3;
  L.on && L(`t${rjust(t, 4)} ${tag}${p.name}: surge (custom timing ${fmt(p.custom_tick)}) ${fx(old)}% -> ${fx(p.spec)}%`);
  return true;
}


/** On Lightbearer at/over the swap %: swap now unless that last bit of spec came from a surge / purple / DC -
 * then finish the regen in progress first (or swap at 100%). */
export function lb_swap_ok(p) {
  return p.gain_src === 'regen' || p.spec >= 100;
}


// Mutable module globals other modules / scripts read or set: read through FLAGS.X.
//  PURPLE_EARLY_SWAP: purple popper still owed their +15: swap at (ring switch % - 15), no regen finish
//  LB_CAMP: duo test mode: camp Lightbearer until 100% (two claws) on set-2 r11 is assured
//  LB_RULE: 'ticks' (current) | 'old' (finish the regen after a surge/purple/DC gain)
//  LB_KEEP_TICKS: at the swap %: keep Lightbearer only if the next regen is this close
export const FLAGS = {
  PURPLE_EARLY_SWAP: false,
  LB_CAMP: false,
  LB_RULE: 'ticks',
  LB_KEEP_TICKS: 10,
  DEFAULT_SWAP_P1: false,   // no Ring switch % / Target spec: true = if the LB regen in progress won't land by P2 start, swap at P1's end
};
// initial values, exported individually for convenience (read FLAGS.X for the live value)
export const PURPLE_EARLY_SWAP = false;
export const LB_CAMP = false;
export const LB_RULE = 'ticks';
export const LB_KEEP_TICKS = 10;

export const CAMP = { duo: false, now: null, eta: null, dc_paid: [], claw_by: null };   // filled in by p2 / reds / duo_reds each tick

// Default ring swap guard: everyone needs at least one claw (50%) in reds. CAMP.claw_by = the tick that claw must be
// ready by: reds r36 (duo: set-2 r11), estimated from the P2 pace until the reds actually start.
export const CLAW_NEED = 50;
export const CLAW_BY_R = { 2: 55, 3: 36, 4: 36, 5: 36 };    // ticks after the reds proc
export const P2_PACE0 = { 2: 13, 3: 18, 4: 26, 5: 31 };    // Verzik HP / tick in P2 before the real pace is known
const P2_DROP = { 2: 2625 - 918, 3: 2625 - 918, 4: 3062 - 1071, 5: 3500 - 1225 };   // p2.js P2_HP - P2_REDS (no import: p2.js needs sim.js first)
/** Estimated tick the first reds claw must be ready by, at P2 start `K` (before any P2 pace is known). */
export const claw_by_at_start = (team, K) => K + Math.round(P2_DROP[team] / P2_PACE0[team]) + CLAW_BY_R[team];
/** Spec they'd have by tick `by` if they swapped to Ultor at `now` (the timer restarts; a popped purple's +15 counts). */
export function ultor_spec_by(p, now, by) {
  const owed = ga(p, 'purple_owed', false) ? 15 : 0;
  return Math.min(100, p.spec + owed + 10 * floordiv(Math.max(0, by - now), 50));
}
/** Spec they'd have by tick `by` staying on Lightbearer (the regen in progress keeps its timer). */
export function lb_spec_by(p, now, by) {
  const owed = ga(p, 'purple_owed', false) ? 15 : 0;
  const ticks = Math.max(0, by - now), first = 25 - (p.ring === 'Lightbearer' ? p.regen_timer : 0);
  const regens = ticks >= first ? 1 + floordiv(ticks - first, 25) : 0;
  return Math.min(100, p.spec + owed + 10 * regens);
}
/** Would they still have 50% by `claw_by` if they swapped to Ultor at `now`? */
export function ultor_claw_ok(p, now, claw_by) {
  if (now == null || claw_by == null) return true;
  return ultor_spec_by(p, now, claw_by) >= CLAW_NEED;
}

/**
 * Trio 4 Claw Priority (on by default; chart toggle "4 Claw Priority"). If Verzik's P1 dies before every charted
 * Dawn spec is used, the player who didn't use their last Dawn is the priority player (several: highest spec coming
 * out of P1, then closest to their next regen). They take over the purple DC and camp Lightbearer until Ultor still
 * gives them 100% - both claws, the 2nd by reds r36; if that can't be reached even on Lightbearer, until Ultor gives
 * 80% by r40. The other two camp Lightbearer until Ultor still gives 50% (one claw) by r36. All Dawns used: as charted.
 */
export function claw_priority_setup(players, L, t) {
  const planned = (p) => Object.values(p.actions).filter((a) => a === 'D').length;
  const total = sum(players.map(planned)), used = sum(players.map((p) => p.dawns_used));
  if (used >= total) return;
  const cand = players.filter((p) => !p.dead && p.dawns_used < planned(p));
  if (!cand.length) return;
  const next_regen = (p) => (p.spec >= 100 ? 0 : p.regen_period() - p.regen_timer);
  cand.sort((a, b) => b.spec - a.spec || next_regen(a) - next_regen(b));
  const pri = cand[0];
  const pdc = players.find((p) => p.purple === true || pybool(p.purple)) ?? null;
  L.on && L(`t${rjust(t, 4)} 4 CLAW PRIORITY: P1 died after ${used} of ${total} Dawn specs - ${pri.name} (${fx(pri.spec)}%) `
    + `aims for both claws by reds r36, the others for one claw by r36`);
  if (pdc && pdc !== pri && pri.has_bp) {                     // the purple needs a blowpipe to pop
    pdc.purple = false; pri.purple = true;
    L.on && L(`t${rjust(t, 4)} 4 CLAW PRIORITY: ${pri.name} takes the purple DC from ${pdc.name}`);
  }
  for (const p of players) { p.claw_goal = p === pri ? 'two' : 'one'; p.claw_fallback = false; }
}

/** Lightbearer -> Ultor for a 4 Claw Priority player: swap once Ultor still meets their goal (see claw_priority_setup). */
function claw_goal_swap(p) {
  if (p.spec >= 100) return true;
  const now = CAMP.now, by = CAMP.claw_by;
  if (now == null || by == null) return false;
  if (p.claw_goal === 'two' && !p.claw_fallback && lb_spec_by(p, now, by) < 100) p.claw_fallback = true;   // out of reach even on LB
  const [need, at] = p.claw_goal === 'one' ? [CLAW_NEED, by] : p.claw_fallback ? [80, by + 4] : [100, by];
  if (ultor_spec_by(p, now, at) < need) return false;
  return p.gain_src === 'regen' || p.regen_period() - p.regen_timer > FLAGS.LB_KEEP_TICKS;   // finish a regen that's <= 10t away
}


/** Spec on set-2 r11 if they swap to Ultor now: Ultor regens (timer restarts) + DC / purple spec still to come. */
export function camp_projection(p) {
  const ticks = Math.max(0, CAMP.eta - CAMP.now);
  const dc = (p.west ? 1 : 0) + (p.east ? 1 : 0) - CAMP.dc_paid.filter((n) => n === p.name).length;
  // purple +15 only once that purple has actually been popped (owed); unspawned purples and re-surges aren't counted
  const owed = ga(p, 'purple_owed', false) ? 15 : 0;
  return p.spec + 10 * floordiv(ticks, 50) + 15 * Math.max(0, dc) + owed;
}


/** Lightbearer -> Ultor check, used in P2, reds and duo reds. */
export function swap_due(p) {
  if (p.ring !== 'Lightbearer') return false;
  if (p.claw_goal) return claw_goal_swap(p);
  if (FLAGS.LB_CAMP && CAMP.duo && CAMP.eta != null && CAMP.now < CAMP.eta) {
    // camp mode: ignore the Ring switch %; stay on Lightbearer (into reds if needed) until 100% by set-2 r11 is assured
    return p.spec >= 100 || camp_projection(p) >= 100;
  }
  if (p.target_spec == null) {
    // no Ring switch % and no Target spec: swap once the Lightbearer regen in progress at P1's end has landed
    // + guard: only if they'd still have a claw's 50% by the reds deadline on Ultor - otherwise keep camping LB and
    // check again on each Lightbearer regen
    if (ga(p, 'default_wait', false) !== true) return false;
    if (p.spec >= 100) return true;
    return p.gain_src === 'regen' && p.regen_timer === 0 && ultor_claw_ok(p, CAMP.now, CAMP.claw_by);
  }
  const tgt = Number(p.target_spec);
  if (FLAGS.PURPLE_EARLY_SWAP && ga(p, 'purple_pending', false)) return p.spec >= tgt - 15;
  return p.spec >= tgt && (FLAGS.LB_RULE === 'ticks' ? lb_keep_ok(p) : lb_swap_ok(p));
}


/**
 * Default ring swap (Lightbearer, no Ring switch % and no Target spec), over the P1 -> P2 gap of `gap` ticks from
 * P1's kill tick t0: swap to Ultor the tick the Lightbearer regen in progress lands. If it lands during the gap they
 * swap then; if it won't land by P2 start they keep Lightbearer and swap in P2 when it lands (swap_due), or - with
 * FLAGS.DEFAULT_SWAP_P1 - swap at P1's end and start the Ultor timer straight away.
 */
export function default_transition(p, t0, gap, L, claw_by = null) {
  const toUltor = (at, why) => {
    p.ring = 'Ultor'; p.regen_timer = 0; p.ring_swapped_at = at; p.default_wait = false;
    L.on && L(`t${rjust(at, 4)} ${p.name}: ${why} -> swaps to Ultor (default: no ring swap % set)`);
  };
  if (p.spec >= 100) { toUltor(t0, 'already 100% at P1 end'); return; }
  const left = p.regen_period() - p.regen_timer;        // ticks until the Lightbearer regen in progress lands
  if (left <= gap) {
    p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
    if (p.spec >= 100 || ultor_claw_ok(p, t0 + left, claw_by)) {
      toUltor(t0 + left, `Lightbearer regen lands in the P1->P2 gap (${fx(p.spec)}%)`);
      p.regen_timer = p.spec < 100 ? gap - left : 0;    // the rest of the gap counts on Ultor (< 50 ticks: no regen)
      return;
    }
    // Ultor from here wouldn't give them a claw's 50% by the reds deadline: keep Lightbearer, check on each regen
    let timer = gap - left;
    while (timer >= p.regen_period() && p.spec < 100) { timer -= p.regen_period(); p.spec = Math.min(100, p.spec + 10); }
    p.regen_timer = p.spec < 100 ? timer : 0;
    p.default_wait = true; p.gain_src = 'wait';
    L.on && L(`t${rjust(t0 + left, 4)} ${p.name}: Lightbearer regen lands (${fx(p.spec)}%) but Ultor wouldn't reach ${CLAW_NEED}% for a reds claw - keeps Lightbearer`);
  } else if (FLAGS.DEFAULT_SWAP_P1) {
    toUltor(t0, `Lightbearer regen still ${left}t away at P1 end (lands after P2 starts)`);
    p.regen_timer = gap;
  } else {
    p.regen_timer += gap;                                // lands in P2; swap_due swaps them that tick
    p.default_wait = true; p.gain_src = 'wait';
    L.on && L(`t${rjust(t0, 4)} ${p.name}: Lightbearer regen ${left}t away - keeps Lightbearer into P2, swaps when it lands`);
  }
}


/** True = swap now. Over the swap %, they stay on Lightbearer only to finish a regen that's <= 10 ticks away. */
export function lb_keep_ok(p) {
  return p.gain_src === 'regen' || p.spec >= 100 || p.regen_period() - p.regen_timer > FLAGS.LB_KEEP_TICKS;
}


export function hit_chance(a, d) {
  return a > d ? 1 - (d + 2) / (2 * (a + 1)) : a / (2 * (d + 1));
}


// Python str() of a cell/config value (bools print as True/False, null as None)
function pystr(v) {
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (v == null) return 'None';
  return String(v);
}
// Python isinstance(v, (int, float)) - bool counts as int in Python
const isPyNum = (v) => isNum(v) || typeof v === 'boolean';
// Python int(x) for numbers / numeric strings / bools
function pyint(v) {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v);
  if (v == null || (isStr(v) && !v.trim()) || Number.isNaN(n)) throw new Error(`ValueError: int(${v})`);
  return Math.trunc(n);
}
// Python bool(x)
function pybool(x) {
  if (x == null) return false;
  if (Array.isArray(x) || isStr(x)) return x.length > 0;
  if (typeof x === 'number') return x !== 0 && !Number.isNaN(x);
  if (typeof x === 'object') return Object.keys(x).length > 0;
  return Boolean(x);
}
// Python str.capitalize() / str.title()
const capitalize = (s) => (s.length ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
const title = (s) => s.toLowerCase().replace(/(^|[^A-Za-z])([a-z])/g, (m, a, b) => a + b.toUpperCase());


export class Player {
  constructor(i, cfg) {
    this.i = i;
    this.name = pystr(dget(cfg, 'name', `P${i}`));
    this.helm = dget(cfg, 'helm', 'Torva full helm');
    this.body = dget(cfg, 'body', 'Oathplate chest');
    this.legs = dget(cfg, 'legs', 'Oathplate legs');
    this.amulet_mode = dget(cfg, 'amulet', 'Rancour');
    this.amulet = this.amulet_mode === 'Blood fury' ? 'Blood fury' : 'Rancour';
    this.bf_hp = dget(cfg, 'bloodFuryHp');
    this.prayer = dget(cfg, 'meleePrayer', 'Piety');
    this.lb = dget(cfg, 'lightbearerOn', false);
    this.ring = this.lb ? 'Lightbearer' : 'Ultor';
    const rs = dget(cfg, 'ringSwitch');
    this.target_spec = !(rs == null || rs === '') ? rs : dget(cfg, 'targetSpec');
    if (this.target_spec === '') this.target_spec = null;
    this.default_swap = this.lb && this.target_spec == null;   // neither % set: default Ultor swap (default_transition)
    this.default_wait = false;
    this.purple = dget(cfg, 'PurpleDC', false);
    this.has_bp = dget(cfg, 'hasBP', true) !== false;   // no blowpipe: no B in P1, no blowpipe fills, can't pop the purple
    this.purple2nd = dget(cfg, 'Purple2DC', false);
    this.has3 = dget(cfg, 'has3Tick') || false;
    this.shadow = dget(cfg, 'shadow', false);
    this.shadow_lb = dget(cfg, 'shadowLB', false);
    this.east_boak = dget(cfg, 'eastBoak');        // 3-5 man purple movement side (null = not filled in)
    this.west_boak = dget(cfg, 'westBoak');
    this.east_pattern = dget(cfg, 'eastPattern', null) || 'A';   // East Boak pattern: A (standard) or 0-T (no ticks lost)
    this.shadow_camp = dget(cfg, 'shadowCamp', false);   // duo: shadow every P2 attack until reds
    this.shadow31 = dget(cfg, 'shadow31', false);
    this.purple2_thr = dget(cfg, 'purple2Thr', 40);       // duo 3:1: shadow only on the attack that lines up with Verzik
    this.deep_proc = dget(cfg, 'deepProc', false);
    this.deep_thr = dget(cfg, 'deepThr', 42);
    this.dawns_used = 0;
    this.dawn_thr = dget(cfg, 'dawnThr');            // P1 HP % at/below which a Dawn spec becomes a scythe
    horn.init_player(this, cfg);
    const mg = dget(cfg, 'mage', {});
    // mage helm 'off' = takes the melee helm off and wears nothing; 'melee' = keeps the melee helm on
    const mhelm = dget(mg, 'helm', 'Ancestral hat');
    this.mage_gear = [mhelm === 'off' ? null : mhelm === 'melee' ? this.helm : mhelm, dget(mg, 'body', 'Ancestral robe top'),
      dget(mg, 'legs', 'Ancestral robe bottom'), dget(mg, 'cape', 'Imbued saradomin cape'),
      'Occult necklace', 'Avernic treads (max)', 'Confliction gauntlets'].filter(Boolean);
    this.west = dget(cfg, 'WestDC', false);
    this.east = dget(cfg, 'EastDC', false);
    this.spec = Number(dget(cfg, 'startSpec', 100));
    this.regen_timer = 0;
    this.hp = 99; this.base = 99;
    // divine super combat pre-room
    this.atk = this.str = this.dfn = 118;
    this.rng = this.mag = 99;
    this.sip_ready = 0;
    this.surge_ready = 0;
    this.surge_pending = null;
    this.gain_src = 'regen';                  // where their last spec gain came from: 'regen' or 'other'
    this.custom_tick = dget(cfg, 'customSurgeTick');
    this.custom_done = false;
    this.next_attack = 0;      // weapon cooldown, for flagging only
    this.thrall_next = null;
    this.dead = false;
    this.dmg_done = 0;
    this.actions = {};
  }

  // gear sums for melee / other setups
  pieces(weapon_code) {
    const p = [ARMOUR[this.helm], ARMOUR[this.body], ARMOUR[this.legs],
      FIXED['Infernal cape'], FIXED['Avernic treads'],
      AMULETS[this.amulet], RINGS[this.ring]];
    if (['T', 'H_Ayak', 'E'].includes(weapon_code)) p.push(CONFLICTION);
    else p.push(FIXED['Ferocious gloves']);
    return p;
  }

  regen_period() {
    return this.ring === 'Lightbearer' ? 25 : 50;
  }

  snapshot() {
    return (`  ${ljust(this.name, 10)} HP ${rjust(this.hp, 3)}  Atk ${rjust(this.atk, 3)} Str ${rjust(this.str, 3)} Def ${rjust(this.dfn, 3)} ` +
      `Rng ${rjust(this.rng, 3)} Mag ${rjust(this.mag, 3)}  Spec ${rjust(fx(this.spec, 1), 5)}%  ` +
      `regen timer ${rjust(this.regen_timer, 2)}/${this.regen_period()}  ring ${this.ring}  amulet ${this.amulet}` +
      (this.dead ? '  DEAD' : ''));
  }
}


/** Return list of [damage_before_counter, counter_cap] hitsplats; cap null = no counter-roll.
 * ('D' / 'A' return just the list; other codes return [list, chance, max] like Python.) */
export function roll_attack(p, code, rng) {
  const w = WEAPONS[code];
  if (code === 'D') return [[rng.randint(75, 150), null]];
  if (code === 'A') {
    let mx = floordiv(floordiv(112, 3) - 2, 2);
    mx = floordiv(mx * (100 + 2), 100);           // treads magic dmg
    return [[rng.randint(0, mx), null]];
  }
  const gear = p.pieces(code);
  const idx = w.idx;
  const atk_bonus = w.atk[idx] + sum(gear.map((g) => g.atk[idx]));
  const [pa, pd] = PRAYERS[p.prayer];
  let eff_a, eff_s, mx, cap;
  if ([0, 1, 2].includes(idx)) {
    eff_a = Math.floor(p.atk * pa) + 0 + 8;           // aggressive: +3 str
    eff_s = Math.floor(p.str * pd) + 3 + 8;
    const sb = w.str + sum(gear.map((g) => g.str));
    mx = floordiv(eff_s * (sb + 64) + 320, 640);
    cap = 10;
  } else if (idx === 4) {                              // rapid, no ranged prayer (on melee prayer)
    eff_a = p.rng + 8;
    eff_s = p.rng + 8;
    const rs = w.rstr + sum(gear.map((g) => dget(g, 'rstr', 0)));
    mx = Math.floor(0.5 + eff_s * (rs + 64) / 640);
    cap = 3;
  } else {                                             // sang / eye of ayak, no magic prayer
    eff_a = p.mag + 9;
    const base = floordiv(p.mag, 3) - dget(w, 'base_minus', 0);
    const mdmg = sum(gear.map((g) => dget(g, 'mdmg', 0)));
    mx = floordiv(base * (100 + mdmg), 100);
    cap = 3;
  }
  const a_roll = eff_a * (atk_bonus + 64);
  const chance = hit_chance(a_roll, P1_DEF_ROLL);
  let maxes;
  if (code === 'S') maxes = [mx, floordiv(mx, 2), floordiv(mx, 4)];
  else if (code === 'SB') maxes = [mx - floordiv(mx, 2), floordiv(mx, 2)];   // two independently rolled hits; odd max: one rounds up
  else maxes = [mx];
  const out = [];
  for (const m of maxes) {
    if (rng.random() < chance) out.push([Math.max(1, rng.randint(0, Math.max(0, m))), cap]);   // a drained stat can push a max below 0
    else out.push([0, cap]);
  }
  return [out, chance, mx];
}


/** 'Custom Surge Timing' (m:ss.s, or seconds) -> room tick, rounded down to a whole tick (0.6s). */
export function surge_tick(v) {
  if (v == null || (isStr(v) && !v.trim())) return null;
  let sec;
  const pyfloat = (s) => {      // Python float(): rejects '', junk
    const x = isStr(s) ? s.trim() : s;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (x === '' || x == null) throw new Error('ValueError');
    const n = Number(x);
    if (Number.isNaN(n)) throw new Error('ValueError');
    return n;
  };
  try {
    if (isStr(v)) {
      v = v.trim();
      if (v.includes(':')) {
        const k = v.indexOf(':');
        const mm = v.slice(0, k), ss = v.slice(k + 1);
        let mi = 0;
        if (mm) { if (!/^\s*[+-]?\d+\s*$/.test(mm)) throw new Error('ValueError'); mi = parseInt(mm, 10); }
        sec = mi * 60 + pyfloat(ss);
      } else {
        sec = pyfloat(v);
      }
    } else if (isNum(v) && v > 0 && v < 1) {
      // openpyxl hands a time-formatted cell over as a time value (read as minutes:seconds); xlsx.js gives the
      // raw day fraction - convert it the same way (hour*60 + minute + second/60)
      const total = Math.round(v * 86400 * 1e6) / 1e6;
      const hour = Math.floor(total / 3600), minute = Math.floor((total % 3600) / 60), second = Math.floor(total % 60);
      sec = hour * 60 + minute + second / 60;
    } else {
      sec = pyfloat(v);
    }
  } catch (e) {
    return null;
  }
  return Math.trunc(sec / 0.6 + 1e-9);
}


export async function parse_chart(wb, team, tab = null, block = 'A') {
  const ws = await wb.load(tab || `${team}-man`);
  const [lo_r, hi_r] = blockRows(ws, block);
  const yes = (v) => ['yes', 'y', 'true', '1'].includes(pystr(v).trim().toLowerCase());
  const find_row = (label) => {
    for (let r = lo_r; r < hi_r + 1; r++) {
      for (let c = 1; c < 4; c++) {
        const v = ws.cell(r, c).value;
        if (isStr(v) && v.trim().toLowerCase() === label.toLowerCase()) return [r, c];
      }
    }
    return [null, null];
  };
  const header_cols = (row) => {
    const cols = {};
    for (let c = 1; c < ws.max_column + 1; c++) {
      const v = ws.cell(row, c).value;
      if (isStr(v) && v.trim() && !has(cols, v.trim())) cols[v.trim()] = c;
    }
    return cols;
  };
  const [sr] = find_row('Player');                      // first 'Player' header = setup table
  const sc = header_cols(sr);
  const cfgs = [];
  const get_n1 = () => (has(sc, 'Number of Purples') ? ws.cell(sr + 1, sc['Number of Purples']).value : null);
  for (let k = 0; k < team; k++) {
    const r = sr + 1 + k;
    const get = (h) => (has(sc, h) ? ws.cell(r, sc[h]).value : null);
    let nm = get('Name');
    if (isNum(nm) && Number.isInteger(nm)) nm = Math.trunc(nm);
    cfgs.push({
      name: nm != null ? pystr(nm) : `P${k + 1}`,
      startSpec: get('startSpec (%)') != null ? get('startSpec (%)') : 100,
      lightbearerOn: yes(get('lightbearerOn')),
      targetSpec: get('targetSpec (%)') != null ? get('targetSpec (%)') : get('Target spec'),
      p3Target: get('P3 target spec'), ringSwitch: get('Ring switch %'),
      meleePrayer: get('meleePrayer') || 'Piety',
      PurpleDC: yes(get('PurpleDC') || get('1st Purple DC')), WestDC: yes(get('WestDC')), EastDC: yes(get('EastDC')),
      Purple2DC: yes(get('2nd Purple DC')), customSurgeTick: surge_tick(get('Custom Surge Timing')),
      nPurples: get('Number of Purples') != null ? get('Number of Purples') : get_n1(),
    });
  }
  let gr = null;
  for (let r = sr + 1; r < hi_r + 1; r++) {
    if (range(1, 4).some((c) => isStr(ws.cell(r, c).value) && ws.cell(r, c).value.trim() === 'helm')) { gr = r; break; }
  }
  if (gr) {
    const gc = header_cols(gr);
    for (let k = 0; k < team; k++) {
      const r = gr + 1 + k;
      const get = (h) => (has(gc, h) ? ws.cell(r, gc[h]).value : null);
      for (const key of ['helm', 'body', 'legs', 'amulet']) {
        if (pybool(get(key))) cfgs[k][key] = get(key);
      }
      if (get('bloodFuryHp') != null) cfgs[k].bloodFuryHp = pyint(get('bloodFuryHp'));
      if (pybool(get('redCrab'))) cfgs[k].redCrab = title(pystr(get('redCrab')).trim());
      if (get('bouncedZCB') != null) cfgs[k].bouncedZCB = yes(get('bouncedZCB'));
      if (get('offPrayer') != null) cfgs[k].offPrayer = pyint(get('offPrayer'));
      let v9 = get('has3Tick');
      if (v9 != null) {
        v9 = capitalize(pystr(v9).trim());
        v9 = dget({ 'Breaker': 'Breaker', 'Ayak': 'Ayak', 'Swift blade': 'Swift blade', 'Yes': 'Breaker' }, v9, false);
        cfgs[k].has3Tick = v9;
      }
      if (isPyNum(get('Phoenix necklaces'))) cfgs[k].pneck = pyint(get('Phoenix necklaces'));
      if (isPyNum(get('hornPriority'))) cfgs[k].hornPriority = pyint(get('hornPriority'));
      if (get('East Pattern') != null && pystr(get('East Pattern')).trim() !== '') cfgs[k].eastPattern = pystr(get('East Pattern')).trim().toUpperCase();
      for (const [key, h] of [['shadow', 'Shadow'], ['shadowLB', 'Shadow while LB'], ['deepProc', 'Deep proc'],
        ['shadowCamp', 'Shadow camp'], ['shadow31', '3:1'],
        ['horn', 'Horn'], ['hornP2', 'P2 horn'], ['hornP3', 'P3 horn'],
        ['eastBoak', 'East Boak'], ['westBoak', 'West Boak'], ['redemptionFlick', 'Redemption flick'], ['pneckP1', 'Pneck on P1'], ['passGreen', 'Pass green if death'],
        ['hasBP', 'Has BP']]) {
        if (get(h) != null && pystr(get(h)).trim() !== '') cfgs[k][key] = yes(get(h));
      }
      // Has BP (blank / no column = has one): popping the purple crab needs a blowpipe
      if (cfgs[k].hasBP === false && (cfgs[k].PurpleDC || cfgs[k].Purple2DC)) {
        const nm = cfgs[k].name || `P${k + 1}`;
        throw new Error(`A blowpipe is required to pop the purple crab. Either change the player who DC's purple, or add a blowpipe to ${nm}`);
      }
      // shadow modes need Shadow; Shadow camp takes over 3:1 / Shadow while LB. cfgs.notes tells the page what was ignored.
      const c = cfgs[k], nm = c.name || `P${k + 1}`, modes = [['shadowLB', 'Shadow while LB'], ['deepProc', 'Deep proc'], ['shadowCamp', 'Shadow camp'], ['shadow31', '3:1']];
      cfgs.notes = cfgs.notes || [];
      if (!c.shadow) {
        const on = modes.filter(([key]) => c[key]).map(([, h]) => h);
        if (on.length) cfgs.notes.push(`${nm}: ${on.join(', ')} ticked without Shadow - ignored.`);
        for (const [key] of modes) c[key] = false;
      } else if (c.shadowCamp && (c.shadow31 || c.shadowLB)) {
        cfgs.notes.push(`${nm}: Shadow camp is ticked with ${[c.shadow31 && '3:1', c.shadowLB && 'Shadow while LB'].filter(Boolean).join(' and ')} - camp takes over, so ${c.shadow31 && c.shadowLB ? 'those are' : 'that is'} never used.`);
      }
    }
  }
  // mage gear table (rows used only with Shadow)
  let mr = null;
  for (let r = sr + 1; r < hi_r + 1; r++) {
    if (range(1, 4).some((c) => isStr(ws.cell(r, c).value) && ws.cell(r, c).value.trim() === 'mage helm')) { mr = r; break; }
  }
  if (mr) {
    const mc = header_cols(mr);
    const names = {
      'Ancestral': ['Ancestral hat', 'Ancestral robe top', 'Ancestral robe bottom'],
      'Virtus': ['Virtus mask', 'Virtus robe top', 'Virtus robe bottom'],
    };
    for (let k = 0; k < team; k++) {
      const r = mr + 1 + k;
      const v = (h) => (has(mc, h) ? ws.cell(r, mc[h]).value : null);
      const mg = {};
      ['mage helm', 'mage body', 'mage legs'].forEach((h, i) => {
        const x = v(h), xs = pystr(x).trim().toLowerCase();
        if (i === 0 && (xs === 'take off' || xs === 'none')) { mg.helm = xs === 'take off' ? 'off' : 'melee'; return; }   // no helm / keep the melee helm
        if (pybool(x)) mg[h.split(' ')[1]] = names[pystr(x).includes('irtus') ? 'Virtus' : 'Ancestral'][i];
      });
      const x = v('mage cape');
      if (pybool(x)) mg.cape = pystr(x).includes('nfernal') ? 'Infernal cape' : 'Imbued saradomin cape';
      cfgs[k].mage = mg;
    }
  }
  // deep proc threshold (team-wide)
  const TEAM_KEYS = {
    'Crab HP threshold': 'crabHp', 'Second purple %': 'purple2Thr', 'Ducktank': 'ducktank', 'Perfect 1st set': 'perfectSet1', 'Deep proc HP %': 'deepThr', 'P3 halberd HP %': 'challyThr', 'Dawn threshold %': 'dawnThr', 'Purple HP %': 'purple2Thr', 'Tornado hit %': 'tornadoPct', 'P2 Scythe last hit threshold': 'lastHitThr',
    'Brew sips': 'brewSips', 'SCB sips': 'scbSips', 'Restore sips': 'restoreSips', 'Sharks': 'sharks',
    '4 Claw Priority': 'clawPriority4',
  };
  for (let c = 1; c < ws.max_column + 1; c++) {
    const hv = ws.cell(sr, c).value;
    const key = isStr(hv) ? dget(TEAM_KEYS, hv.trim(), null) : null;
    if (key) {
      const v = ws.cell(sr + 1, c).value;
      if (key === 'ducktank' || key === 'perfectSet1') {
        for (const cf of cfgs) cf[key] = yes(v);
      } else if (key === 'clawPriority4') {
        for (const cf of cfgs) cf[key] = v == null || pystr(v).trim() === '' ? true : yes(v);   // on unless unticked
      } else if (isPyNum(v)) {
        for (const cf of cfgs) cf[key] = Number(v);
      }
    }
  }
  const [hdr] = find_row('Tick');
  const tick_cols = [];          // [[col, tick], ...] in column order (Python dict insertion order)
  for (let c = 2; c < ws.max_column + 1; c++) {
    const v = ws.cell(hdr, c).value;
    if (isPyNum(v)) tick_cols.push([c, Math.trunc(Number(v))]);
  }
  const charts = [];
  for (let k = 0; k < team; k++) {
    const r = hdr + 1 + k;
    const acts = {};
    for (const [c, t] of tick_cols) {
      const v = ws.cell(r, c).value;
      if (v != null && pystr(v).trim()) acts[t] = pystr(v).trim().toUpperCase();
    }
    charts.push(acts);
  }
  for (let k = 0; k < Math.min(cfgs.length, charts.length); k++) cfgs[k].actions = charts[k];
  return cfgs;
}


export function fmt(t) {
  const s = t * TICK;
  return `${Math.trunc(floordiv(s, 60))}:${fx(pymod(s, 60), 1).padStart(4, '0')}`;
}


/** Trios: the last Dawn spec in the chart is the one that goes unused when P1 dies early, and its player then pushes
 * for 100% in reds (4 Claw Priority). That is better done by a non-shadow player, so this warns when the shadow player
 * has the last Dawn (unless every player has Shadow). */
export function trio_shadow_alert(cfgs) {
  if (cfgs.length !== 3) return null;
  const sh = cfgs.filter((c) => pybool(dget(c, 'shadow')));
  if (!sh.length || sh.length === cfgs.length) return null;
  const cands = [];
  for (const c of cfgs) for (const t of intKeys(c.actions)) if (c.actions[t] === 'D') cands.push([t, c]);
  const last = cands.length ? maxBy(cands, (x) => x[0]) : null;
  if (last == null || !sh.includes(last[1])) return null;
  return (`ALERT (trios): ${last[1].name} has Shadow and the last Dawn spec (tick ${last[0]}) - the one most likely to go ` +
    'unused, whose player pushes for 100% in reds. It is better for a non-shadow player to push for 100%: ' +
    'suggest giving the last Dawn spec to a non-shadow player.');
}


export function run_p1(cfgs, team, rng, log = null) {
  const L = log != null ? ((s) => log.push(s)) : ((s) => null); L.on = log != null;   // log text is only built when a log is kept
  const players = cfgs.map((c, i) => new Player(i + 1, c));
  const brew_below = team === 2 ? DUO_P1_BREW_BELOW : BREW_BELOW;     // P1 brew threshold (duo: 75)
  const pool = new supplies.Pool(cfgs, team);
  for (let i = 0; i < Math.min(players.length, cfgs.length); i++) {
    const p = players[i], c = cfgs[i];
    supplies.init_player(p, c, pool);
    if (team === 2 && p.shadow) p.mag = SHADOW_MAGIC;   // duo shadow player: boosted 112 Magic, kept through P2 (no brews before P3)
    p.wants_heart = team > 2 && pybool(p.shadow);         // 3-5 shadow player: boosts to 112 once Magic is restored to 99 after P1
    p.last_atk_t = null;
    p.actions = c.actions;
    p.auto_surge_on = team <= 2;           // surge re-use after its cooldown: duos/solos only
    if (Object.values(p.actions).includes('P')) p.custom_tick = null;   // a P on the chart takes priority over the custom timing
    // 95% start, a Dawn spec on the chart and no R: no regen before their first spec, then a forced regen the tick after it
    const acts = Object.values(p.actions);
    p.auto_r = Number(p.spec) === 95 && acts.includes('D') && !acts.includes('R') ? 'pending' : null;
  }
  const pid = players.slice();
  rng.shuffle(pid);
  let hp = P1_HP[team];
  let vq = [];      // hits on Verzik: [land_tick, pid_rank, player, dmg, cap, label, sub]
  let pq = [];      // hits on players: [land_tick, player, dmg]
  const flags = [];
  const snaps = {};
  snaps['Before P1'] = players.map((p) => p.snapshot());
  L.on && L(`PID order this raid: ${pid.map((p) => p.name).join(', ')}`);
  L.on && L(`Verzik P1 HP ${hp}`);
  const rank = new Map(pid.map((p, k) => [p, k]));
  let t = 0;
  let kill_tick = null;
  let anim = 5;                     // P1 death animation: 5 ticks, 4 on overkill
  const act_at = (p, tt) => dget(p.actions, tt, null);
  while (t < 400) {
    // ---- Verzik: queue step (damage lands, PID order)
    const landing = sorted(vq.filter((h) => h[0] === t), (h) => [h[1], h[6]]);
    vq = vq.filter((h) => h[0] !== t);
    for (const h of landing) {
      const [, , p, dmg, cap, label] = h;
      if (kill_tick != null) {
        anim = 4;
        L.on && L(`t${rjust(t, 3)} ${p.name}: ${label} lands after kill (overkill)`);
        break;
      }
      let ctr = null;
      let final = dmg;
      if (cap != null) {
        ctr = rng.randint(0, cap);
        final = Math.min(dmg, ctr);
      }
      hp -= final;
      p.dmg_done += final;
      if (p.amulet === 'Blood fury' && ['Scythe', 'Claw', 'Swift'].includes(label.split(/\s+/)[0]) && final > 0
          && rng.random() < 0.20) {
        const heal = floordiv(final * 30, 100);
        if (heal && p.hp < p.base) {
          const old = p.hp;
          p.hp = Math.min(p.base, p.hp + heal);
          L.on && L(`t${rjust(t, 3)} ${p.name}: blood fury heals ${p.hp - old} -> ${p.hp} HP`);
        }
      }
      L.on && L(`t${rjust(t, 3)} ${p.name}: ${label} lands ${final}` + (cap != null ? ` (roll ${dmg}, counter ${ctr})` : '')
        + ` -> Verzik ${Math.max(hp, 0)}`);
      if (hp <= 0) kill_tick = t;
    }
    if (kill_tick != null) break;
    // ---- Verzik attacks
    if (t >= AUTO_QUEUE_FIRST && (t - AUTO_QUEUE_FIRST) % AUTO_EVERY === 0) {
      const n = floordiv(t - AUTO_QUEUE_FIRST, AUTO_EVERY) + 1;
      const parts = [];
      for (const p of players) {
        if (p.dead) continue;
        if (act_at(p, t) === 'X') {
          parts.push(`${p.name} dodges`);
          continue;
        }
        if (has(ga(p, 'avoid', []), t)) {
          parts.push(`${p.name} avoids it (running)`);
          continue;
        }
        const d = rng.randint(0, 69);
        pq.push([t + AUTO_DELAY, p, d]);
        parts.push(`${p.name} ${d}`);
      }
      L.on && L(`t${rjust(t, 3)} VERZIK auto #${n} queued (lands t${t + AUTO_DELAY}): ` + parts.join(', '));
    }
    // ---- players, PID order
    for (const p of pid) {
      if (p.dead) continue;
      for (const h of pq.filter((h) => h[0] === t && h[1] === p)) {
        const before = p.hp;
        p.hp -= h[2];
        L.on && L(`t${rjust(t, 3)} ${p.name}: takes ${h[2]} from Verzik -> ${p.hp} HP`);
        // phoenix necklace flicked on for the landing tick when at 70-88 HP (procs at 1-19: +29); no Heal Other in P1
        const flick = 70 <= before && before <= 88 && (ga(p, 'pneck_p1', false) || team !== 2);   // duo: only with 'Pneck on P1' ticked
        if (p.pneck > 0 && flick && 0 < p.hp && p.hp <= supplies.PNECK_AT) {
          p.pneck -= 1; p.hp += supplies.PNECK_HEAL;
          p.pool.pneck_procs += 1; p.pool.pneck_p1 = ga(p.pool, 'pneck_p1', 0) + 1;
          L.on && L(`t${rjust(t, 3)} ${p.name}: phoenix necklace (flicked on at ${before} HP) procs -> ${p.hp} HP (${p.pneck} left)`);
        }
        if (team === 2 && p.hp > 0) {
          let na = next_auto(t);
          while (act_at(p, na) === 'X') na += AUTO_EVERY;      // skip autos they already dodge on the chart
          if (p.shadow) {
            // duo shadow player: never brews in P1 (keeps Magic for the shadow). Can't tank another auto ->
            // runs from the next one: no attacks from 3 ticks before it to 3 ticks after (sharks allowed)
            if (p.hp < TANK_HP) {
              p.avoid = new Set([...ga(p, 'avoid', new Set()), na]);
              p.blocked = new Set([...ga(p, 'blocked', new Set()), ...range(na - 3, na + 4)]);
              L.on && L(`t${rjust(t, 3)} ${p.name}: ${p.hp} HP can't tank the next auto - runs from it (no attacks t${na - 3}-t${na + 3})`);
            }
          } else {
            // duo non-shadow player, with an Ayak tick before the next auto (and sharks left):
            //  70+ HP: no brews (can tank it). 34+ HP: hold brews, shark (+ brew if needed) instead of the Ayak
            //  hit gets them to 70+. Under 34: 'prep' - one restore first if melee stats are 67 or lower, then brew
            //  only up to 34 (never in the way of the Ayak shark + brew), then hold as above.
            // No Ayak tick before the next auto: brew as normal until it hits.
            const ayak = range(t + 1, na).filter((e) => act_at(p, e) === 'E');
            p.hold_restored = false;
            const plan = range_plan(p.hp, ayak.length > 0, p.pool.left['shark'], p.pool.left['brew']);
            p.hold = plan ? [na + AUTO_DELAY, plan] : null;
            if (p.hold) {
              const at = ayak.length ? ayak[0] : '?';
              const msg = {
                'none': 'no brews until the next auto (can tank it)',
                'prep': `brews up to 35+, then holds for the shark + brew on the Ayak tick t${at}`,
              };
              L.on && L(`t${rjust(t, 3)} ${p.name}: ${p.hp} HP - ` + dget(msg, p.hold[1], `holds brews until the next auto ` +
                `(plan: ${p.hold[1]} on the Ayak tick t${at})`));
            }
          }
        }
      }
      pq = pq.filter((h) => !(h[0] === t && h[1] === p));
      if (p.amulet_mode === 'Both' && p.amulet === 'Rancour' && p.bf_hp && p.hp < p.bf_hp) {
        p.amulet = 'Blood fury';
        L.on && L(`t${rjust(t, 3)} ${p.name}: HP ${p.hp} < ${p.bf_hp}, swaps to blood fury`);
      }
      supplies.check_death(p, 'P1', L, t);
      // timers: spec regen (95% start: held until their first Dawn spec, then the automatic R the tick after it)
      if (p.auto_r === t) {
        const old = p.spec;
        p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen'; p.regen_timer = 0; p.auto_r = null;
        L.on && L(`t${rjust(t, 3)} ${p.name}: regen the tick after their first spec (95% start, no R charted) ${fx(old)}% -> ${fx(p.spec)}%`);
      } else if (p.auto_r === 'pending') {
        // no natural regen before their first spec
      } else if (p.spec < 100) {
        p.regen_timer += 1;
        if (p.regen_timer >= p.regen_period()) {
          p.regen_timer = 0;
          const old = p.spec;
          p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
          L.on && L(`t${rjust(t, 3)} ${p.name}: natural regen ${fx(old)}% -> ${fx(p.spec)}%`);
        }
      } else {
        p.regen_timer = 0;
      }
      if (p.thrall_next != null && t === p.thrall_next) {
        const d = rng.randint(0, 3);
        vq.push([t + 1, rank.get(p), p, d, 10, 'Thrall', 9]);
        p.thrall_next = t + 4;
      }
      let act = act_at(p, t);
      if (p.last_action_tick === undefined) {                 // chart never changes during a raid: find its last tick once
        const akeys = intKeys(p.actions);
        p.last_action_tick = akeys.length ? Math.max(...akeys) : null;
      }
      if (act == null && p.last_action_tick !== null && t > p.last_action_tick && t >= p.next_attack) {
        act = 'S';   // chart finished: keep scything off cooldown
      }
      if (team === 2 && has(ga(p, 'blocked', []), t)) {
        if (act != null && !['P', 'X'].includes(act)) L.on && L(`t${rjust(t, 3)} ${p.name}: running from the auto - skips ${act}`);
        act = null;
        if (p.hp + 20 <= 99 && t >= ga(p, 'food_ready', 0) && p.pool.take('shark')) {
          const old = p.hp; p.hp = Math.min(p.base, p.hp + 20); p.food_ready = t + 3;
          L.on && L(`t${rjust(t, 3)} ${p.name}: shark while running ${old} -> ${p.hp} HP`);
        }
      }
      let hold = ga(p, 'hold', null);
      if (hold && t > hold[0]) p.hold = hold = null;
      if (team === 2 && act === 'E' && p.hp <= 70 && t >= ga(p, 'food_ready', 0) && p.pool.take('shark')) {
        // duo: shark (+ brew combo if still under the brew line) instead of the Ayak hit, at or below 70.
        // Shadow player: never a brew. Holding for the next auto: brew only if the shark alone won't reach 70
        const old = p.hp;
        p.hp = Math.min(p.base, p.hp + 20);
        p.food_ready = t + 3;
        let combo = '';
        const want_brew = hold ? (p.hp < TANK_HP) : (p.hp < brew_below);
        if (!p.shadow && want_brew && t >= p.sip_ready && p.pool.take('brew')) {
          supplies.drink_brew(p); p.sip_ready = t + 3; combo = ' + brew';
        }
        L.on && L(`t${rjust(t, 3)} ${p.name}: ${old} HP on an Ayak tick - shark${combo} instead -> ${p.hp} (Atk ${p.atk} Str ${p.str})`);
        act = null;
      }
      if (has(WEAPONS, act) && act !== 'S' && p.dawn_thr && hp <= P1_HP[team] * p.dawn_thr / 100) {
        L.on && L(`t${rjust(t, 3)} ${p.name}: Verzik at ${hp} HP (<= ${p.dawn_thr}%) - scythe instead of ${act}`);
        act = 'S';                                       // at/below the Dawn threshold every attack is a scythe
      }
      // (no Heal Other in P1 - only the phoenix necklace flick on autos at 70-88 HP)
      // potions: chart surge first, then supplies
      if (act === 'P') p.surge_pending = t;
      if (p.custom_tick != null && !p.custom_done && t === p.custom_tick) {
        p.surge_pending = t; p.custom_done = true;       // custom surge timing that falls inside P1
      }
      if (p.surge_pending != null && t >= p.sip_ready && !(p.hp < 70 && p.hp < brew_below)) {
        if (t < p.surge_ready) {
          flags.push(`t${t}: ${p.name} surge on cooldown`);
          p.surge_pending = null;
        } else {
          const old = p.spec;
          p.spec = Math.min(100, p.spec + 25); p.gain_src = 'other';
          p.sip_ready = t + 3;
          p.surge_ready = t + 500;
          const late = t - p.surge_pending;
          if (late) flags.push(`t${t}: ${p.name} surge ${late}t late (chart t${p.surge_pending})`);
          p.surge_pending = null;
          L.on && L(`t${rjust(t, 3)} ${p.name}: surge ${fx(old)}% -> ${fx(p.spec)}%` + (late ? ` (${late}t late)` : ''));
        }
      }
      const surge_soon = p.surge_pending != null || [1, 2].some((k) => act_at(p, t + k) === 'P' && t + k >= p.surge_ready);
      if (hold && team === 2 && !p.shadow) {
        // re-check the plan every tick (HP can change: a spec transfer, the Ayak shark itself, brews in 'prep')
        const na_q = hold[0] - AUTO_DELAY;
        const ayak_left = range(t, na_q).some((e) => act_at(p, e) === 'E') && p.pool.left['shark'] > 0;
        const nw = range_plan(p.hp, ayak_left, p.pool.left['shark'], p.pool.left['brew'], hold[1]);
        if (nw !== hold[1]) L.on && L(`t${rjust(t, 3)} ${p.name}: ${p.hp} HP - plan now ${nw || 'brew as normal'} until the next auto`);
        p.hold = hold = nw ? [hold[0], nw] : null;
      }
      const ayak_soon = [1, 2].some((k) => act_at(p, t + k) === 'E');
      const no_brew = team === 2 && (p.shadow || (hold != null && hold[1] !== 'prep' && p.hp > 0));
      if (t >= p.sip_ready && no_brew && p.hp < brew_below) {
        // duo P1: shadow player never brews; holding player waits for the Ayak shark (+ brew). While holding, a
        // restore whenever melee stats are below 67 - never in the way of the Ayak shark + brew
        if (hold && hold[1] !== 'prep'
            && Math.min(p.atk, p.str) < HOLD_RESTORE_BELOW && !ayak_soon && p.pool.take('restore')) {
          p.hold_restored = true;
          supplies.drink_restore(p);
          p.sip_ready = t + 3; p.food_ready = Math.max(ga(p, 'food_ready', 0), t + 3);
          L.on && L(`t${rjust(t, 3)} ${p.name}: ${p.hp} HP, holding - super restore for low stats (Atk ${p.atk} Str ${p.str})`);
        }
      } else if (t >= p.sip_ready) {
        if (p.hp < brew_below && surge_soon && p.hp >= 70) {
          L.on && L(`t${rjust(t, 3)} ${p.name}: brew held for surge (HP ${p.hp})`);
        } else if (p.hp < brew_below && team === 2 && p.hp <= 70 && p.pool.left['shark'] > 0
            && [1, 2].some((k) => act_at(p, t + k) === 'E')) {
          // a brew now would put food on cooldown over the coming Ayak tick: save it for the shark + brew there
          L.on && L(`t${rjust(t, 3)} ${p.name}: brew held for the shark + brew on the Ayak tick (HP ${p.hp})`);
        } else if (p.hp < brew_below && p.pool.take('brew')) {          // P1: brew under 90 (duo 85), no super combat until the transition
          const old = p.hp;
          supplies.drink_brew(p);
          p.sip_ready = t + 3;
          p.food_ready = Math.max(ga(p, 'food_ready', 0), t + 3);   // potions put food on cooldown too
          L.on && L(`t${rjust(t, 3)} ${p.name}: brew ${old} -> ${p.hp} HP (Atk ${p.atk} Str ${p.str} Def ${p.dfn})`);
        } else if (p.hp > 90 && Math.min(p.atk, p.str) < 99 && p.pool.take('restore')) {
          supplies.drink_restore(p);
          p.sip_ready = t + 3;
          L.on && L(`t${rjust(t, 3)} ${p.name}: super restore (Atk ${p.atk} Str ${p.str} Def ${p.dfn})`);
        }
      }
      if (act == null || act === 'P' || act === 'X') {
        // pass
      } else if (act === 'R') {
        const old = p.spec;
        p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
        p.regen_timer = 0;
        L.on && L(`t${rjust(t, 3)} ${p.name}: R forced regen ${fx(old)}% -> ${fx(p.spec)}% (timer restarted, ${p.regen_period()}t)`);
      } else if (act.startsWith('ST')) {
        // Python int() raises on junk after '>'; here junk just gives "no valid target"
        const tgt_i = act.includes('>') ? Math.trunc(Number(act.split('>')[1])) : null;
        const tgt = (tgt_i && 1 <= tgt_i && tgt_i <= players.length) ? players[tgt_i - 1] : null;
        if (tgt == null) {
          flags.push(`t${t}: ${p.name} ${act} has no valid target`);
        } else if (p.spec < 100) {
          flags.push(`t${t}: ${p.name} ${act} needs 100% spec, has ${fx(p.spec)}%`);
        } else {
          p.spec = 0;
          p.hp -= 10;
          supplies.check_death(p, 'P1', L, t);
          tgt.spec = 100;
          L.on && L(`t${rjust(t, 3)} ${p.name}: spec transfer -> ${tgt.name} (now 100%); ${p.name} 0%, -10 HP`);
        }
      } else if (act === 'B' && !p.has_bp) {
        flags.push(`t${t}: ${p.name} B (blowpipe) without Has BP - skipped`);
      } else if (act === 'H' && !p.has3) {
        flags.push(`t${t}: ${p.name} H (3-tick) with no has3Tick weapon - skipped`);
      } else if (has(WEAPONS, act)) {
        if (act === 'H') act = 'H_' + p.has3;
        if (act === 'D' && p.spec < 35) {
          flags.push(`t${t}: ${p.name} Dawn spec with only ${fx(p.spec)}% - skipped`);
          L.on && L(`t${rjust(t, 3)} ${p.name}: DAWN SPEC SKIPPED (spec ${fx(p.spec)}%)`);
          continue;
        }
        if (t < p.next_attack) {
          flags.push(`t${t}: ${p.name} ${WEAPONS[act].name} queued ${p.next_attack - t}t before weapon cooldown is up`);
        }
        const w = WEAPONS[act];
        let splats, info;
        if (act === 'D') {
          const old = p.spec;
          p.spec -= 35;
          p.dawns_used += 1;
          if (p.auto_r === 'pending') p.auto_r = t + 1;
          splats = [[rng.randint(75, 150), null]];
          info = `spec ${fx(old)}% -> ${fx(p.spec)}%`;
        } else if (act === 'A') {
          splats = roll_attack(p, act, rng);
          info = '';
        } else {
          let ch, mx;
          [splats, ch, mx] = roll_attack(p, act, rng);
          info = `acc ${fx(ch * 100, 1)}%, max ${mx}`;
        }
        p.next_attack = t + w.speed;
        p.last_atk_t = t;
        splats.forEach(([d, cap], k) => {
          const lbl = w.name + (splats.length > 1 ? ` hit ${k + 1}` : '');
          vq.push([t + w.delay, rank.get(p), p, d, cap, lbl, k]);
        });
        L.on && L(`t${rjust(t, 3)} ${p.name}: ${w.name} queued, lands t${t + w.delay}` + (info ? ` (${info})` : ''));
        if (p.thrall_next == null) p.thrall_next = t + rng.randint(1, 2);
      } else {
        flags.push(`t${t}: ${p.name} unknown code '${act}'`);
      }
    }
    t += 1;
  }
  const end = kill_tick != null ? kill_tick + anim : null;
  let spec_end;
  if (kill_tick != null) {
    L.on && L(`t${rjust(kill_tick, 3)} VERZIK P1 HP 0. Death animation ${anim} ticks -> ends t${end}`);
    snaps['End of P1 (HP 0)'] = players.map((p) => p.snapshot());
    spec_end = players.map((p) => p.spec);
    // 14-tick gap supplies
    if (team === 3 && dget(cfgs[0], 'clawPriority4', true) !== false) claw_priority_setup(players, L, kill_tick);
    for (const p of players) if (p.auto_r != null) p.auto_r = null;   // never specced (or R due after the kill): regen as normal from here
    for (const p of supplies.by_hp(players)) {
      if (p.dead) continue;
      // P1 -> P2 transition (death animation + 14 ticks, invulnerable): heal up, restore, super combat
      supplies.window(p, floordiv(anim + 14 - 1, 3) + 1, L, kill_tick, 'P1->P2 ',
        { hp_target: 115, brews: !(team === 2 && p.shadow) });   // duo shadow player: sharks only (keeps 112 Magic)
      const gap = end + 14 - kill_tick;
      if (p.default_swap && !p.claw_goal && p.ring === 'Lightbearer') default_transition(p, kill_tick, gap, L, claw_by_at_start(team, kill_tick + gap));
      else if (p.spec < 100) {
        p.regen_timer += gap;
        while (p.regen_timer >= p.regen_period() && p.spec < 100) {
          p.regen_timer -= p.regen_period();
          p.spec = Math.min(100, p.spec + 10); p.gain_src = 'regen';
        }
      }
    }
    snaps[`Start of P2 (after 14-tick gap, t${end + 14})`] = players.map((p) => p.snapshot());
  }
  if (kill_tick == null) spec_end = players.map((p) => p.spec);
  return {
    pid, spec_end, spec_p2: players.map((p) => p.spec), kill_tick, end, anim, flags, snaps, players,
    deaths: players.filter((p) => p.dead).length,
  };
}
