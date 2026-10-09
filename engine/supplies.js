// Port of supplies.py - team supplies across the whole Verzik room (brews / super combats / restores / sharks
// from one team pool; phoenix necklaces per player). See the Python module docstring for the rules.
import { floordiv, ga, dget, truthy, range, any, sorted, rjust } from './util.js';

export const MAX_HP = 99;
export const BREW_HEAL = floordiv(MAX_HP * 15, 100) + 2;          // 16
export const SHARK_HEAL = 20;
export const PNECK_AT = floordiv(MAX_HP * 20, 100);               // 19: procs at or below this
export const PNECK_HEAL = floordiv(MAX_HP * 30, 100);             // 29
export const HO_MAX = floordiv(MAX_HP * 75, 100);                 // 74
export const HO_MIN_HP = floordiv(MAX_HP * 11, 100);              // 10
export const HO_MAGIC = 92;
export const HO_BELOW = 30;
export const PER_PLAYER = { brew: 12, scb: 2, restore: 6, shark: 3 };
export const DUO_SCB = 4;                                         // duos: 4 super combat doses per player

const pyint = (v) => Math.trunc(Number(v));

export class Pool {
  constructor(cfgs, team) {
    const c0 = truthy(cfgs) ? cfgs[0] : {};
    const per = { ...PER_PLAYER, scb: team === 2 ? DUO_SCB : PER_PLAYER['scb'] };
    this.left = {};
    for (const [k, v] of Object.entries(per)) {
      this.left[k] = dget(c0, k + 'Sips') != null ? pyint(dget(c0, k + 'Sips')) : v * team;
    }
    if (dget(c0, 'sharks') != null) {
      this.left['shark'] = pyint(dget(c0, 'sharks'));
    }
    this.start = { ...this.left };
    this.used = {};
    for (const k of Object.keys(this.left)) this.used[k] = 0;
    this.pneck_procs = 0;
    this.heal_others = 0;
    this.deaths = {};                         // phase -> count (players keep attacking for now)
    this.deaths_no_scb = {};                  // of those: team already out of super combats (no brewing)
    this.potential_deaths = {};               // phase -> count of HP <= 0 after P1 (troubleshooting only)
    this.scb_res = 0;                         // super combats promised to players who just brewed mid-fight
    this.last_scb = null;                     // [where, tick, player, HP] of the team's last super combat dose
    this.phase = 'P1'; this.kp = null;        // current phase label / P3 tick-1 offset (for the log above)
    this.yellows_started = false; this.green_landed = false;
  }

  scb_free() {
    return this.left['scb'] - this.scb_res;
  }

  take(k) {
    if (this.left[k] <= 0) {
      return false;
    }
    this.left[k] -= 1; this.used[k] += 1;
    return true;
  }
}

export function init_player(p, cfg, pool) {
  p.pool = pool;
  p.pneck = pyint(dget(cfg, 'pneck') || 0);
  p.pneck_p1 = truthy(dget(cfg, 'pneckP1'));          // duo: flick the necklace on P1 autos too
}

export function drink_brew(p) {
  p.hp = Math.min(115, p.hp + BREW_HEAL);
  p.dfn = Math.max(p.dfn, Math.min(p.dfn + 21, 120));
  for (const s of ['atk', 'str', 'rng', 'mag']) {
    const v = p[s]; p[s] = v - (floordiv(v, 10) + 2);
  }
}

export function drink_restore(p) {
  for (const s of ['atk', 'str', 'dfn', 'rng', 'mag']) {
    const v = p[s];
    if (v < 99) {
      p[s] = Math.min(99, v + 32);
    }
  }
}

export function drink_scb(p, t = null, where = null) {
  if (p.pool.left['scb'] === 0 && p.pool.last_scb == null) {      // that was the team's last dose
    p.pool.last_scb = [where || p.pool.phase, t, p.name, p.hp];
  }
  for (const s of ['atk', 'str', 'dfn']) {
    const v = p[s];
    if (v < 118) {
      p[s] = Math.min(118, v + 19);
    }
  }
}

export function eat_shark(p) {
  p.hp = Math.max(p.hp, Math.min(MAX_HP, p.hp + SHARK_HEAL));
}

export function restores_needed(a) {
  let n = 0;
  while (a < 99) {
    a += 32; n += 1;
  }
  return n;
}

export const HEART_MAGIC = 112;           // shadow players' boosted Magic (saturated heart: no potion timer, once per raid)

/** 3-5 man shadow player who still needs their Magic boost to 112 (after restoring it to 99). */
export function heart_pending(p) {
  return truthy(ga(p, 'wants_heart', false)) && !truthy(ga(p, 'heart_used', false)) && p.mag < HEART_MAGIC;
}

export function try_heart(p, t = null, L = null, tag = '') {
  if (heart_pending(p) && p.mag >= 99) {
    p.mag = HEART_MAGIC; p.heart_used = true;
    if (L) {
      L.on && L(`t${rjust(t, 4)} ${tag}${p.name}: Magic boosted to ${HEART_MAGIC}`);
    }
    return true;
  }
  return false;
}

/** Lowest stat a restore is still needed for (Magic too while a shadow player's boost is pending). */
export function low_stat(p) {
  return heart_pending(p) ? Math.min(p.atk, p.str, p.mag) : Math.min(p.atk, p.str);
}

export function all_set(p) {
  return maxed(p) && !heart_pending(p);
}

export function maxed(p) {
  return p.atk >= 118 && p.str >= 118;
}

/** Invulnerable window with `slots` potion ticks. opts = { sharks = true, hp_target = MAX_HP, brews = true }. */
export function window(p, slots, L, t, tag, opts = {}) {
  const sharks = opts.sharks === undefined ? true : opts.sharks;
  const hp_target = opts.hp_target === undefined ? MAX_HP : opts.hp_target;
  let brews = opts.brews === undefined ? true : opts.brews;
  const pool = p.pool;
  if (p.dead || slots <= 0) {
    return;
  }
  const start = Math.max(t, ga(p, 'sip_ready', 0));
  slots -= -floordiv(-(start - t), 3);                  // potion cooldown carried over from before the window
  if (slots <= 0) {
    _after_window(p, start, 0, L, tag); return;
  }
  // how many brews fit while still leaving room for the restore / super combat they'd need
  let best = 0;
  for (const b of range(0, truthy(brews) ? 5 : 1)) {   // brews=False: sharks only (duo shadow player, P1>P2)
    if (b > pool.left['brew']) {
      break;
    }
    let a = Math.min(p.atk, p.str), m = p.mag;
    for (let _ = 0; _ < b; _++) {
      a -= floordiv(a, 10) + 2; m -= floordiv(m, 10) + 2;
    }
    const nres = Math.max(restores_needed(a), heart_pending(p) ? restores_needed(m) : 0);
    const need = nres + (a < 118 ? 1 : 0);
    if (need && pool.scb_free() <= 0) {
      break;
    }
    if (nres > pool.left['restore']) {
      break;
    }
    if (b + need > slots) {
      break;
    }
    best = b;
  }
  const done = []; let used = 0; brews = 0;
  for (let i = 0; i < slots; i++) {
    const tick = [];
    const more_brews = brews < best && p.hp < hp_target && pool.left['brew'] > 0;
    if (truthy(sharks) && pool.left['shark'] > 0 && p.hp < Math.min(MAX_HP, hp_target) &&
        (p.hp + SHARK_HEAL <= MAX_HP || !more_brews) && pool.take('shark')) {
      eat_shark(p); tick.push('shark');
    }
    if (brews < best && p.hp < hp_target && pool.take('brew')) {
      drink_brew(p); brews += 1; tick.push('brew');
    } else if (low_stat(p) < 99 && pool.take('restore')) {
      drink_restore(p); tick.push('restore');
    } else if (!maxed(p) && pool.scb_free() > 0 && pool.take('scb')) {
      drink_scb(p, t, tag.trim()); tick.push('super combat');
    }
    if (!tick.length) {
      break;
    }
    if (tick[tick.length - 1] !== 'shark') {
      used = i + 1;
    }
    done.push(tick.join('+'));
  }
  if (done.length && L) {
    L.on && L(`t${rjust(t, 4)} ${tag}${p.name}: ${done.join(' | ')} -> ${p.hp} HP, Atk ${p.atk} Str ${p.str} Def ${p.dfn}`);
  }
  try_heart(p, t, L, tag);                        // shadow player back at 99 Magic: boost to 112 (no potion slot)
  _after_window(p, start, used, L, tag);
}

/** Failsafe: if the window ran out of sip ticks before max stats, keep potting afterwards. */
export function _after_window(p, t, used, L, tag) {
  p.sip_ready = Math.max(ga(p, 'sip_ready', 0), t + 3 * used);
  if (!all_set(p) && (p.pool.left['restore'] > 0 || p.pool.scb_free() > 0)) {
    p.catchup = true;
    p.pool.catchups = ga(p.pool, 'catchups', 0) + 1;
    if (L) {
      L.on && L(`t${rjust(t, 4)} ${tag}${p.name}: window over before max stats (Atk ${p.atk} Str ${p.str}) - keeps potting while attacking`);
    }
  }
}

/** Per-tick failsafe after a heal-up window: restore to 99, then super combat; never delays an attack. */
export function catchup(p, t, L = null, tag = '') {
  if (!truthy(ga(p, 'catchup', false)) || p.dead || ga(p, 'sc_at', null) != null) {
    return;
  }
  try_heart(p, t, L, tag);
  if (all_set(p)) {
    p.catchup = false; return;
  }
  if (t < ga(p, 'sip_ready', 0)) {
    return;
  }
  let what;
  if (low_stat(p) < 99 && p.pool.take('restore')) {
    drink_restore(p); what = 'restore';
    try_heart(p, t, L, tag);
  } else if (!maxed(p) && Math.min(p.atk, p.str) >= 99 && p.pool.scb_free() > 0 && p.pool.take('scb')) {
    drink_scb(p, t, (tag || p.pool.phase).trim() + ' catch-up'); what = 'super combat';
  } else {
    p.catchup = false; return;
  }
  p.sip_ready = t + 3;
  if (L) {
    L.on && L(`t${rjust(t, 4)} ${tag}${p.name}: catch-up ${what} -> Atk ${p.atk} Str ${p.str}`);
  }
}

/** Mid-fight brew needs a super combat to follow. With only one dose left, only the lowest-HP player who
 *  wants to brew gets it. */
export function scb_ok(p, team, below) {
  const free = p.pool.scb_free();
  if (free <= 0) {
    return false;
  }
  if (free === 1) {
    return !any(team.map((q) => q !== p && !q.dead && q.hp < p.hp && q.hp < below(q)));
  }
  return true;
}

/** Heal-up windows run lowest HP first, so the lowest player gets the last super combat. */
export function by_hp(players) {
  return sorted(players, (q) => q.hp);
}

/** Under 30 HP, phoenix necklace left, magic >= 92: Heal Other onto the next-lowest teammate if it will proc
 *  their own necklace. `clear(p)` empties the caster's incoming damage queue. Returns true if cast. */
export function heal_other(p, team_players, t, L, clear) {
  if (p.dead || p.pneck <= 0 || p.hp >= HO_BELOW || p.mag < HO_MAGIC || p.hp < HO_MIN_HP) {
    return false;
  }
  const mates = sorted(team_players.filter((q) => q !== p && !q.dead && q.hp < MAX_HP), (q) => q.hp);
  if (!mates.length) {
    return false;
  }
  const tgt = mates[0];
  const amt = Math.min(HO_MAX, MAX_HP - tgt.hp, p.hp - 1);
  if (p.hp - amt > PNECK_AT) {
    return false;                                  // wouldn't proc the necklace: don't cast
  }
  p.hp -= amt; tgt.hp += amt;
  p.pneck -= 1;
  p.hp = Math.min(MAX_HP, p.hp + PNECK_HEAL);
  clear(p);
  p.pool.heal_others += 1; p.pool.pneck_procs += 1;
  if (L) {
    L.on && L(`t${rjust(t, 4)} ${p.name}: HEAL OTHER ${amt} -> ${tgt.name} (${tgt.hp} HP); phoenix necklace procs -> ${p.hp} HP, ` +
      `incoming damage cleared (${p.pneck} left)`);
  }
  return true;
}

export const REDEMPTION_AT = floordiv(MAX_HP, 10);                // procs at 1..9 HP
export const REDEMPTION_HEAL = floordiv(99 * 25, 100);            // 24 (25% of 99 prayer); doesn't drain stats

/** After a hit: redemption procs if they're left at 1..9 HP (+24 HP, prayer to 0). */
export function redemption(p, L = null, t = null, why = '') {
  if (0 < p.hp && p.hp <= REDEMPTION_AT) {
    const old = p.hp;
    p.hp += REDEMPTION_HEAL;
    p.need_restore = true; p.prayer_down = true;
    p.pool.redemptions = ga(p.pool, 'redemptions', 0) + 1;
    const rw = ga(p.pool, 'redemption_why', {}); rw[why] = dget(rw, why, 0) + 1; p.pool.redemption_why = rw;
    if (L) {
      L.on && L(`t${rjust(t, 4)} ${p.name}: REDEMPTION procs${why ? (' (' + why + ')') : ''} ${old} -> ${p.hp} HP, prayer 0 - restore next`);
    }
    return true;
  }
  return false;
}

/** Priority sip after a redemption proc. */
export function prayer_restore(p, t, L = null) {
  if (!truthy(ga(p, 'need_restore', false)) || t < ga(p, 'sip_ready', 0)) {
    return false;
  }
  p.need_restore = false;
  if (p.pool.take('restore')) {
    drink_restore(p); p.prayer_down = false; p.sip_ready = t + 3;
    if (L) {
      L.on && L(`t${rjust(t, 4)} ${p.name}: restore after redemption - protection prayers back`);
    }
    return true;
  }
  if (L) {
    L.on && L(`t${rjust(t, 4)} ${p.name}: no restores left after redemption - no protection prayers`);
  }
  return false;
}

// troubleshooting: only P1 deaths are real; later ones are logged as "potential deaths"
export const FLAGS = { DEATHS_ONLY_P1: true, DEATHS: false };   // DEATHS false: nobody dies - HP stops at 1 (logged)

/** HP at 0 or below. In P1 the player dies. After P1 (DEATHS_ONLY_P1) it's only logged as a potential death. */
export function check_death(p, phase, L = null, t = null) {
  if (!FLAGS.DEATHS && p.hp <= 0) {
    const pd = p.pool.potential_deaths;
    pd[phase] = dget(pd, phase, 0) + 1;
    (p.would_die ||= new Set()).add(String(phase).startsWith('P3') ? 'P3' : phase);   // tracking only (Verz Solver wipes)
    if (L) L.on && L(`t${rjust(t, 4)} ${p.name}: would be at ${p.hp} HP (${phase}) - kept at 1 HP`);
    p.hp = 1;
    return;
  }
  if (p.hp <= 0 && !truthy(ga(p, 'below0', false))) {
    p.below0 = true;
    if (FLAGS.DEATHS_ONLY_P1 && phase !== 'P1') {
      const pd = p.pool.potential_deaths;
      pd[phase] = dget(pd, phase, 0) + 1;
      if (L) {
        L.on && L(`t${rjust(t, 4)} ${p.name}: POTENTIAL DEATH (${p.hp} HP, ${phase}) - logged only, keeps going`);
      }
      return;
    }
    p.dead = true; p.died_at = t; p.died_phase = phase;
    const d = p.pool.deaths;
    d[phase] = dget(d, phase, 0) + 1;
    const no_scb = p.pool.left['scb'] <= 0;           // team out of super combats -> nobody could brew
    if (no_scb) {
      p.pool.deaths_no_scb[phase] = dget(p.pool.deaths_no_scb, phase, 0) + 1;
    }
    if (L) {
      L.on && L(`t${rjust(t, 4)} ${p.name}: DIES (${p.hp} HP)${no_scb ? ' - team out of super combats, so no brewing' : ''}`);
    }
  } else if (p.hp > 0) {
    p.below0 = false;
  }
}
