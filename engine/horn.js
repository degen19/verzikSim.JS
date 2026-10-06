// Port of horn.py.
// Soulflame horn (Entice): 25% spec per other player (default 1), no attack cooldown.
// Caster and one recipient get a guaranteed accuracy pass on their next melee attack
// (first roll for multi-hit weapons; second roll for dragon claws - not used here). Buff lasts 10 ticks.
//
// Recipient: eligible player with the lowest hornPriority (players without a number come after, by PID).
// Not eligible: the caster, anyone already holding a buff, a horn player who still has a horn to use,
// anyone whose next attack is a claw spec.
import { dget, ga, isNum, minBy, rjust, fx } from './util.js';

export const HORN_COST = 25;

// Python bool(x)
const pybool = (x) => {
  if (x == null) return false;
  if (Array.isArray(x)) return x.length > 0;
  if (typeof x === 'number') return x !== 0 && !Number.isNaN(x);
  return Boolean(x);
};

export function init_player(p, cfg) {
  p.horn = pybool(dget(cfg, 'horn', false));
  p.horn_pri = dget(cfg, 'hornPriority');
  p.horn_p2 = p.horn && pybool(dget(cfg, 'hornP2', false));
  p.horn_p3 = p.horn && pybool(dget(cfg, 'hornP3', false));
  p.horn_buff = null;          // name of the caster whose buff this player holds
  p.horn_used_p2 = p.horn_used_p3 = false;
}

// rank: Map(player -> pid index) (Python dict keyed by Player); a plain object also works if keyed by name/index.
const rankOf = (rank, p) => (rank instanceof Map ? rank.get(p) : rank[p]);

export function order_key(p, rank) {
  const pri = (isNum(p.horn_pri) || typeof p.horn_pri === 'boolean') ? Number(p.horn_pri) : 99;
  return [pri, rankOf(rank, p)];
}


export function pending_horn(q, phase) {
  return q.horn && q.spec >= HORN_COST && (phase === 'p2' ? (q.horn_p2 && !q.horn_used_p2) : (q.horn_p3 && !q.horn_used_p3));
}


/** Returns [recipient or null, wait_flag]. wait_flag=true means everyone eligible is about to claw spec. */
export function choose_recipient(caster, players, rank, phase, next_is_claw) {
  const cands = players.filter((q) => q !== caster && !q.dead && q.horn_buff == null && !pending_horn(q, phase));
  if (!cands.length) return [null, false];
  const ok = cands.filter((q) => !next_is_claw(q));
  if (!ok.length) return [null, true];
  return [minBy(ok, (q) => order_key(q, rank)), false];
}


/** Trio rule: a horn can't go off while another caster's buffs are still unused. */
export function outstanding_other_buff(caster, players) {
  return players.filter((q) => !q.dead).some((q) => !(q.horn_buff == null || q.horn_buff === caster.name));
}


export const HORN_TICKS = 10;


/** Is this player's horn buff still usable on tick t? It covers only the first accuracy roll of their first attack
 * within 10 ticks of the horn; it is used up by that attack, or lost once the 10 ticks pass. */
export function active(p, t) {
  if (p.horn_buff == null) return false;
  if (t > ga(p, 'horn_until', 10 ** 9)) {
    p.horn_buff = null;
    return false;
  }
  return true;
}


export function try_horn(caster, players, rank, phase, team, next_is_claw, L, t, tag = '') {
  for (const q of players) active(q, t);           // drop expired buffs
  if (team === 3 && outstanding_other_buff(caster, players)) return false;
  const [rec, wait] = choose_recipient(caster, players, rank, phase, next_is_claw);
  void wait;
  if (rec == null) return false;
  caster.spec -= HORN_COST;
  caster.horn_buff = caster.name;
  rec.horn_buff = caster.name;
  caster.horn_until = rec.horn_until = t + HORN_TICKS;
  if (phase === 'p2') caster.horn_used_p2 = true;
  else caster.horn_used_p3 = true;
  L.on && L(`t${rjust(t, 4)} ${tag}${caster.name}: SOULFLAME HORN (-25% -> ${fx(caster.spec)}%) - guaranteed first hit for ` +
    `${caster.name} and ${rec.name}`);
  return true;
}
