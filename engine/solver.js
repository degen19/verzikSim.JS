// Verz Solver - P1 stage: build a P1 chart (2-5 man) from scratch. Used by the room search (roomsolver.js) and cli/solve.mjs.
//
// The chart is built around the Dawnbringer rotation. A plan lists the Dawn slots in order: who holds each one, and
// whether right after that spec someone transfers spec to the holder (ST, the giver then surges) and/or the holder
// surges. Start specs (95 / 100) are part of the plan. placeRotation() puts every Dawn on the earliest tick the rules
// allow, tracking the whole team's spec energy tick by tick exactly like the sim; buildChart() then fills every other
// tick with the most damage that fits (scythe-first). Plans are searched with a beam search over the slots, scored
// analytically (average P1 end of the fastest 10% of raids), and the best are checked with the real P1 simulation.
//
// Rules (agreed with the chart author):
//  - Dawn specs are at least 4 ticks apart team-wide (one Dawnbringer, passed between players). The holder can keep
//    it for consecutive specs. Hand-off: if A specs on t, B can spec on t+4 at the earliest, and B's last attack
//    before it must start on or before t and finish by t+4 (B picks up and equips it on t+1..t+3).
//  - One surge (P, +25) per player, never if it would reach 100% (that resets the regen timer). A filled Custom Surge
//    Timing means the surge is on cooldown until then: it is charted for them as soon as it is available (first free
//    tick from then on that won't reach 100%), never searched. A spec transfer (ST>n) needs the giver at 100%:
//    giver -> 0%, receiver -> 100%.
//  - 95% start with no R charted: no regen before the first Dawn, a forced regen the tick after it (the sim does this).
//  - Only the SB owner uses Sulphur blades. Scythe-first: other attacks only where a scythe doesn't fit. No dodges (3-5).
import { Player, WEAPONS, P1_HP, roll_attack, run_p1, AUTO_QUEUE_FIRST, AUTO_EVERY, SHADOW_MAGIC, dawn_auto_max } from './sim.js';
import { Rng } from './rng.js';

// Ticks planned = the chart template's P1 columns, so a solved chart copied into a chart plays exactly as it was solved
export const CHART_END = 80;                 // 3-5 man (P1 ends well before this)
export const DUO_END = 140;                  // duos: P1 takes ~115-135 ticks
const endOf = (ctx) => ctx.end || CHART_END;
const DAWN_COST = 35, SURGE = 25, THRALL_EVERY = 4;
const DAWN_MEAN = 112.5, DAWN_VAR = ((150 - 75 + 1) ** 2 - 1) / 12;

// ------------------------------------------------------------------ attack values (exact, with the P1 damage cap)
/** Mean and variance of one hit after the cap: max(1, U{0..m}) with chance ch, then min(that, U{0..cap}).
 *  minOne = false for thralls (a plain 0-3 roll, no accuracy roll). */
function hitMoments(ch, m, cap, minOne = true) {
  let e1 = 0, e2 = 0;
  const n = Math.max(0, m) + 1;
  for (let x0 = 0; x0 < n; x0++) {
    const x = minOne ? Math.max(1, x0) : x0;
    for (let c = 0; c <= cap; c++) { const v = Math.min(x, c); e1 += v; e2 += v * v; }
  }
  const k = n * (cap + 1);
  e1 = e1 / k * ch; e2 = e2 / k * ch;
  return [e1, e2 - e1 * e1];
}
const [THRALL_MEAN, THRALL_VAR] = hitMoments(1, 3, 10, false);

/** {code: {mean, var, speed, delay}} for the attacks this player can use in P1 (D included). */
export function attackTable(p, { sb = false, bp = true, duo = false } = {}) {
  const fake = { random: () => 0, randint: (a) => a };
  const out = {};
  const codes = ['S', 'C'];
  if (duo) codes.push('E');
  if (p.has3 && p.has3 !== 'No') codes.push('H');
  if (sb) codes.push('SB');
  if (bp) codes.push('B');
  for (const code of codes) {
    const key = code === 'H' ? `H_${p.has3}` : code;
    const w = WEAPONS[key]; if (!w) continue;
    const [, ch, mx] = roll_attack(p, key, fake);
    const cap = [0, 1, 2].includes(w.idx) ? 10 : 3;
    const maxes = code === 'S' ? [mx, Math.floor(mx / 2), Math.floor(mx / 4)]
      : code === 'SB' ? [mx - Math.floor(mx / 2), Math.floor(mx / 2)] : [mx];
    let mean = 0, vr = 0;
    for (const m of maxes) { const [a, b] = hitMoments(ch, m, cap); mean += a; vr += b; }
    out[code] = { mean, var: vr, speed: w.speed, delay: w.delay };
  }
  out.D = { mean: DAWN_MEAN, var: DAWN_VAR, speed: 4, delay: 2 };
  if (duo) {                                     // Dawnbringer auto: 0..max, no accuracy roll or cap (as in the sim)
    const mx = dawn_auto_max(p, p.shadow ? SHADOW_MAGIC : p.mag);   // duo shadow player: 112 Magic in P1
    out.A = { mean: mx / 2, var: ((mx + 1) ** 2 - 1) / 12, speed: 4, delay: 2 };
  }
  return out;
}

// ------------------------------------------------------------------ duos: autos and dodges
/** Verzik's P1 auto ticks up to `end`. */
export const autoTicks = (end = CHART_END) => { const out = []; for (let t = AUTO_QUEUE_FIRST; t <= end; t += AUTO_EVERY) out.push(t); return out; };
const MELEE = new Set(['S', 'C', 'SB']);
/** Duo dodge patterns for the non-shadow player (the shadow player - the mage - dodges every auto). */
export const DUO_RANGER_DODGES = {
  all: (end = DUO_END) => autoTicks(end),
  none: () => [],
  even: (end = DUO_END) => autoTicks(end).filter((_, i) => i % 2 === 0),   // dodge the 1st, 3rd, ... auto, tank the others
  odd: (end = DUO_END) => autoTicks(end).filter((_, i) => i % 2 === 1),
};

// ------------------------------------------------------------------ team spec energy (the sim's rules)
class Energy {
  constructor(players, start) {
    // cs = Custom Surge Timing still to come (that player's one surge, taken as soon as it is available)
    this.p = players.map((pl, k) => ({ s: start[k], timer: 0, period: pl.lb ? 25 : 50, autoR: start[k] === 95 ? 'pending' : null,
      cs: pl.customTick ?? null }));
    this.t = 0;
  }
  clone() { const e = Object.create(Energy.prototype); e.p = this.p.map((x) => ({ ...x })); e.t = this.t; return e; }
  /** Regen step of the next tick (as in the sim: before anyone acts). Returns that tick. */
  step() {
    const t = ++this.t;
    for (const x of this.p) {
      if (x.autoR === t) { x.s = Math.min(100, x.s + 10); x.timer = 0; x.autoR = null; }
      else if (x.autoR === 'pending') { /* 95% start: held until the first Dawn */ }
      else if (x.s < 100) { x.timer += 1; if (x.timer >= x.period) { x.timer = 0; x.s = Math.min(100, x.s + 10); } }
      else x.timer = 0;
    }
    return t;
  }
}

/**
 * Place a rotation. plan = {start: [95|100], slots: [{h, st: giver|null, surge: bool}]}. Each Dawn goes on the
 * earliest tick >= previous + 4 the holder can afford. After a slot's Dawn on t: the transfer (giver at 100% -> holder)
 * on t+1 and the giver's surge on t+2; the holder's surge on the first tick after those. A surge that would reach
 * 100% is skipped for a giver and makes the plan invalid for a holder (it was asked for).
 * Returns {ok, why, dawnTicks: [[t, h]], codes: [{tick: 'D'|'P'|'ST>n'} per player], energy}.
 */
export function placeRotation(ctx, plan, { maxTick = endOf(ctx) - 6 } = {}) {
  const n = ctx.players.length, en = new Energy(ctx.players, plan.start);
  const codes = Array.from({ length: n }, () => ({}));
  const actions = new Map();                       // tick -> [{k, code, to?, optional?}]
  const surged = new Array(n).fill(false);
  const dawnTicks = [];
  const add = (t, a) => { if (!actions.has(t)) actions.set(t, []); actions.get(t).push(a); };
  /** Apply tick t's queued actions (P, ST, D in that order) to an energy state. Returns an error or null. */
  const apply = (e, t, commit) => {
    const list = (actions.get(t) || []).slice().sort((a, b) => 'PSD'.indexOf(a.code[0]) - 'PSD'.indexOf(b.code[0]));
    for (const a of list) {
      const x = e.p[a.k];
      if (a.code === 'P') {
        if (x.s + SURGE >= 100) { if (a.optional) continue; return `${ctx.players[a.k].name}'s surge on ${t} would reach 100%`; }
        x.s += SURGE;
      } else if (a.code.startsWith('ST')) {
        if (x.s < 100) return `${ctx.players[a.k].name} needs 100% to transfer on ${t}`;
        x.s = 0; e.p[a.to].s = 100;
      } else if (a.code === 'D') {
        if (x.s < DAWN_COST) return `${ctx.players[a.k].name} can't afford the Dawn on ${t}`;
        x.s -= DAWN_COST; if (x.autoR === 'pending') x.autoR = t + 1;
      }
      if (commit) codes[a.k][t] = a.code;
    }
    // Custom Surge Timing: from that tick on, the first tick the player has nothing else charted and the surge won't
    // reach 100% (charted as P there: a P on the chart replaces the custom timing in the sim)
    e.p.forEach((x, k) => {
      if (x.cs == null || t < x.cs || list.some((a) => a.k === k) || x.s + SURGE >= 100 || ctx.dodge[k].has(t)) return;
      x.s += SURGE; x.cs = null;
      if (commit) codes[k][t] = 'P';
    });
    return null;
  };
  const advanceTo = (t) => { while (en.t < t) { const now = en.step(); const err = apply(en, now, true); if (err) return err; } return null; };
  let prev = null;
  for (const sl of plan.slots) {
    let t = prev == null ? 1 : prev + 4;
    if (sl.at) t = Math.max(t, sl.at);                             // a charted Dawn: not before its charted tick
    for (;; t++) {
      if (t > maxTick) return { ok: false, why: 'ran out of chart' };
      const err = advanceTo(t - 1); if (err) return { ok: false, why: err };
      const probe = en.clone(); probe.step();
      const perr = apply(probe, t, false); if (perr) return { ok: false, why: perr };
      if (probe.p[sl.h].s >= DAWN_COST && !ctx.dodge[sl.h].has(t)) break;   // never on an auto they dodge
    }
    add(t, { k: sl.h, code: 'D' });
    const err = advanceTo(t); if (err) return { ok: false, why: err };
    dawnTicks.push([t, sl.h]); prev = t;
    const free = (k, x) => { while (ctx.dodge[k].has(x)) x++; return x; };   // a P / ST never goes on a dodge
    let next = t + 1;
    if (sl.st != null && sl.st !== sl.h) {
      const ts = free(sl.st, next);
      add(ts, { k: sl.st, code: `ST>${sl.h + 1}`, to: sl.h });
      if (ctx.players[sl.st].canSurge && !surged[sl.st]) { surged[sl.st] = true; add(free(sl.st, ts + 1), { k: sl.st, code: 'P', optional: true }); }
      next = Math.max(next + 1, ts);
    }
    if (sl.surge && ctx.players[sl.h].canSurge && !surged[sl.h]) { surged[sl.h] = true; add(free(sl.h, next), { k: sl.h, code: 'P' }); }
  }
  const err = advanceTo(Math.min(maxTick, (prev ?? 0) + 6)); if (err) return { ok: false, why: err };
  ctx.dodge.forEach((d, k) => { for (const a of d) if (a <= endOf(ctx) && !codes[k][a]) codes[k][a] = 'X'; });
  return { ok: true, dawnTicks, codes, energy: en };
}

// ------------------------------------------------------------------ filling the gaps
/** Best attack sequence for ticks [a, b): starts only at or before lastStart and not on a blocked tick (P / ST),
 *  every attack finished by b. Returns [expected damage, [[tick, code], ...]]. */
function fill(a, b, lastStart, atk, blocked, memo) {
  const key = a * 10007 + b * 101 + (lastStart - a + 200) * 1e7;
  if (memo.has(key)) return memo.get(key);
  let best = [0, []];
  if (a < b) {
    // attacks first, waiting only if it is strictly better: spare ticks go at the end of the window, so every hit
    // lands as early as it can (losing a tick on purpose for an overkill finish is a separate step)
    if (a <= lastStart && !blocked.has(a)) {
      for (const code in atk) {
        if (code === 'D') continue;
        const w = atk[code];
        if (a + w.speed > b) continue;
        const rest = fill(a + w.speed, b, lastStart, atk, blocked, memo);
        const v = w.mean + rest[0];
        if (v > best[0] + 1e-9) best = [v, [[a, code], ...rest[1]]];
      }
    }
    const idle = fill(a + 1, b, lastStart, atk, blocked, memo);
    if (idle[0] > best[0] + 1e-9) best = idle;
  }
  memo.set(key, best);
  return best;
}

/** Full P1 chart for a plan: rotation + fills. Returns {ok, acts: [{tick: code}], dawnTicks, why}.
 *  `r` = an already placed rotation (placeRotation result) to reuse. */
export function buildChart(ctx, plan, r = null) {
  r = r || placeRotation(ctx, plan);
  if (!r.ok) return r;
  if (ctx.duo) return buildDuo(ctx, r);
  const acts = [];
  for (let k = 0; k < ctx.players.length; k++) {
    const atk = ctx.atk[k], memo = new Map(), out = { ...r.codes[k] };
    const blocked = new Set(Object.keys(r.codes[k]).filter((t) => out[t] !== 'D').map(Number));
    const own = r.dawnTicks.map(([t, h], j) => ({ t, h, j })).filter((x) => x.h === k);
    let a = 1;
    for (const d of own) {
      const prev = d.j > 0 ? r.dawnTicks[d.j - 1] : null;
      const holding = prev && prev[1] === k;                         // already holding it: no pick-up
      const lastStart = prev && !holding ? prev[0] : d.t - 1;
      const [, seq] = fill(a, d.t, Math.min(lastStart, d.t - 1), atk, blocked, memo);
      for (const [tt, c] of seq) out[tt] = c;
      a = d.t + 4;
    }
    const [, seq] = fill(a, endOf(ctx), endOf(ctx), atk, blocked, memo);
    for (const [tt, c] of seq) out[tt] = c;
    acts.push(out);
  }
  return { ok: true, acts, dawnTicks: r.dawnTicks };
}

/**
 * Duo fills. Rules (from the chart author): around an auto a player dodges, no melee from a-3 to a+3, the tick before
 * it is Dawnbringer only (spec or auto), and nothing on a itself (the X); Eye of ayak is fine from a+1, the blowpipe from a+2.
 * Dawn autos (A) only for the mage (the ranger has no mage gear), while they hold the staff: from their spec until 4 ticks before the other player's next spec
 * (the staff changes hands while both scythe); the receiver's last attack before their spec starts by then too.
 */
function buildDuo(ctx, r) {
  const acts = [], D = r.dawnTicks;
  for (let k = 0; k < ctx.players.length; k++) {
    const atk = ctx.atk[k], out = { ...r.codes[k] }, dodge = ctx.dodge[k];
    const blocked = new Set(Object.keys(r.codes[k]).filter((t) => out[t] !== 'D').map(Number));
    const melee = new Set([...MELEE, ...(ctx.players[k].p.has3 && ctx.players[k].p.has3 !== 'Ayak' ? ['H'] : [])]);
    // staff windows (Dawn autos) and pick-up windows (no attack starts just before receiving it)
    const staff = [], noStart = new Set();
    D.forEach(([t, h], j) => {
      const nxt = D.slice(j + 1).find(([, h2]) => h2 !== h);
      if (h === k) staff.push([j === 0 ? 1 : t, nxt ? nxt[0] - 4 : endOf(ctx)]);
      else if (j > 0) { /* nothing */ }
      if (h === k && j > 0 && D[j - 1][1] !== k) for (let x = t - 3; x < t; x++) noStart.add(x);
    });
    const hasStaff = (t) => staff.some(([s0, e0]) => t >= s0 && t <= e0);
    const ok = (code, t) => {
      if (blocked.has(t) || noStart.has(t)) return false;
      if (code === 'A' && (k !== ctx.mage || !hasStaff(t))) return false;   // Dawn autos: the mage (mage gear) only
      for (const a of dodge) {
        if (melee.has(code) && Math.abs(t - a) <= 3) return false;
        if (!melee.has(code) && code !== 'A' && t >= a - 3 && t <= a - 1) return false;
        if (code === 'B' && t === a + 1) return false;                // the blowpipe is too far away the tick after; from a+2
      }
      return true;
    };
    const memo = new Map();
    const fillD = (a, b) => {
      const key = a * 1000 + b;
      if (memo.has(key)) return memo.get(key);
      let best = [0, []];
      if (a < b) {
        for (const code in atk) {
          if (code === 'D') continue;
          const w = atk[code];
          if (a + w.speed > b || !ok(code, a)) continue;
          const rest = fillD(a + w.speed, b), v = w.mean + rest[0];
          if (v > best[0] + 1e-9) best = [v, [[a, code], ...rest[1]]];
        }
        const idle = fillD(a + 1, b);
        if (idle[0] > best[0] + 1e-9) best = idle;
      }
      memo.set(key, best);
      return best;
    };
    let a = 1;
    for (const [t, h] of D) {
      if (h !== k) continue;
      for (const [tt, c] of fillD(a, t)[1]) out[tt] = c;
      a = t + 4;
    }
    for (const [tt, c] of fillD(a, endOf(ctx))[1]) out[tt] = c;
    acts.push(out);
  }
  return { ok: true, acts, dawnTicks: r.dawnTicks };
}

/**
 * Duo P1 search: the rotation search for each dodge pattern of the non-shadow player (every auto, every other auto -
 * either start - or none; the mage dodges every auto), plus versions of each chart where the mage, the ranger or both
 * "pull up" on the last auto before the kill (no dodge, attacking through it). Returns the solve() charts of all of them, best analytic score first, each with its dodge sets.
 */
export function solveDuo(cfgs, { beam = 150, slots = 18, sbOwner = null, top = 40 } = {}) {
  const base = makeContext(cfgs, 2, { sbOwner });
  const mage = base.mage, rng = 1 - mage;
  const all = [];
  for (const [name, pat] of Object.entries(DUO_RANGER_DODGES)) {
    const dodge = [[], []]; dodge[mage] = autoTicks(DUO_END); dodge[rng] = pat(DUO_END);
    const ctx = makeContext(cfgs, 2, { sbOwner, dodge });
    for (const f of solve(ctx, { beam, slots }).tops.slice(0, top)) {
      all.push({ ...f, dodge, pattern: name });
      // pulling up: near the end of P1 a player skips the dodge on the last auto before the kill and keeps attacking
      // through it (usually a scythe) - the mage at most that one auto, the ranger too, or both. The sim decides.
      const kill = killTick(ctx, f.built.acts, 0.5).tick;
      const last = autoTicks(DUO_END).filter((x) => x < kill).pop();
      if (last == null) continue;
      for (const who of [[mage], [rng], [mage, rng]]) {
        if (!who.every((k) => dodge[k].includes(last))) continue;
        const d2 = [dodge[0].slice(), dodge[1].slice()];
        for (const k of who) d2[k] = d2[k].filter((x) => x !== last);
        const c2 = makeContext(cfgs, 2, { sbOwner, dodge: d2 });
        const b2 = buildChart(c2, f.plan);
        if (b2.ok) all.push({ plan: f.plan, built: b2, score: killTick(c2, b2.acts).cvar, dodge: d2,
          pattern: `${name}, ${who.length === 2 ? 'both pull' : who[0] === mage ? 'mage pulls' : 'ranger pulls'} up on ${last}` });
      }
    }
  }
  const seen = new Set();
  return all.sort((x, y) => x.score - y.score).filter((x) => {
    const k = JSON.stringify([x.built.acts, x.plan.start]); if (seen.has(k)) return false; seen.add(k); return true;
  });
}

/** Expected damage landed by tick T (Dawns, attacks, thralls). */
export function landedBy(ctx, acts, T) {
  let m = 0;
  acts.forEach((a, k) => {
    let first = Infinity;
    for (const tt in a) {
      const w = ctx.atk[k][a[tt]]; if (!w) continue;
      if (Number(tt) + w.delay <= T) m += w.mean;
      if (Number(tt) < first) first = Number(tt);
    }
    if (first < Infinity) for (const off of [2, 3]) for (let t = first + off; t <= T; t += THRALL_EVERY) m += THRALL_MEAN / 2;
  });
  return m;
}

// ------------------------------------------------------------------ analytic score
function Phi(x) {                                // standard normal CDF
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}
/** Expected damage + variance landing per tick -> {tick: first tick with >= q kill chance, cvar: expected P1 end
 *  (kill + 5) over the fastest q of raids}. cvar keeps improving as more raids move into an earlier kill tick. */
export function killTick(ctx, acts, q = 0.10) {
  const N = endOf(ctx) + 8, mean = new Float64Array(N), vr = new Float64Array(N);
  acts.forEach((a, k) => {
    let first = Infinity;
    for (const tt in a) {
      const w = ctx.atk[k][a[tt]]; if (!w) continue;
      const t = Number(tt) + w.delay; mean[t] += w.mean; vr[t] += w.var;
      if (Number(tt) < first) first = Number(tt);
    }
    // thralls: the first one comes 1 or 2 ticks after the first attack and lands a tick later (half the raids each)
    if (first < Infinity) for (const off of [2, 3]) for (let t = first + off; t < N; t += THRALL_EVERY) { mean[t] += THRALL_MEAN / 2; vr[t] += THRALL_VAR / 2; }
  });
  let m = 0, v = 0, prev = 0, acc = 0;
  for (let t = 0; t < N; t++) {
    m += mean[t]; v += vr[t];
    const pk = v > 0 ? 1 - Phi((ctx.hp - m) / Math.sqrt(v)) : (m >= ctx.hp ? 1 : 0);
    const take = Math.min(Math.max(0, pk - prev), q - Math.min(q, prev));
    if (take > 0) acc += take * (t + 5);
    prev = Math.max(prev, pk);
    if (prev >= q) return { tick: t, cvar: acc / q, mean: m };
  }
  return { tick: Infinity, cvar: Infinity, mean: m };
}

// ------------------------------------------------------------------ context
/** Fixed inputs from the chart: players (gear, Lightbearer, has3Tick, custom surge), SB owner, Verzik HP. */
export function makeContext(cfgs, team, { sbOwner = null, blowpipe = true, transfers = true, dodge = null } = {}) {
  const sb = sbOwner ?? cfgs.findIndex((c) => Object.values(c.actions || {}).includes('SB'));
  const players = cfgs.map((c, i) => {
    const p = new Player(i + 1, c);
    // a filled Custom Surge Timing = their surge is on cooldown until then: it is placed for them, never searched
    return { name: c.name || `P${i + 1}`, lb: !!c.lightbearerOn, canSurge: c.customSurgeTick == null, customTick: c.customSurgeTick ?? null, p,
      key: JSON.stringify([c.helm, c.body, c.legs, c.amulet, c.meleePrayer, !!c.lightbearerOn, c.has3Tick, i === sb, c.customSurgeTick ?? null]) };
  });
  const duo = team === 2;
  // duos: the shadow player is the mage. dodge[k] = the auto ticks player k dodges (X on the chart)
  const mage = duo ? Math.max(0, cfgs.findIndex((c) => c.shadow)) : null;
  const end = duo ? DUO_END : CHART_END;
  const dodges = (dodge || cfgs.map((_, k) => (duo ? (k === mage ? autoTicks(end) : DUO_RANGER_DODGES.even(end)) : []))).map((d) => new Set(d));
  return { team, hp: P1_HP[team], players, sb: sb >= 0 ? sb : null, transfers, duo, mage, dodge: dodges, end,
    atk: players.map((pl, i) => attackTable(pl.p, { sb: i === sb, bp: blowpipe, duo })) };
}

/** Each player's part in a plan so far (start spec once used, Dawn slots held, transfers given, surge), as a string. */
function roleSigs(plan, n) {
  return Array.from({ length: n }, (_, k) => JSON.stringify([
    plan.slots.some((x) => x.h === k) ? plan.start[k] : null,
    plan.slots.map((x, j) => (x.h === k ? j : -1)).filter((j) => j >= 0),
    plan.slots.map((x, j) => (x.st === k ? j : -1)).filter((j) => j >= 0),
    plan.slots.some((x) => x.h === k && x.surge)]));
}

/** What makes two charts the same option, up to tick `upTo`: each player's damage (Dawn ticks and attacks; surges,
 *  transfers and forced regens left out) and start spec, with players of the same setup put in a fixed order. */
export function chartKey(ctx, acts, upTo, start = null) {
  const rows = acts.map((x, k) => [ctx.players[k].key, start ? start[k] : null,
    Object.entries(x).filter(([t, c]) => Number(t) <= upTo && ctx.atk[k][c]).map(([t, c]) => `${t}${c}`).join(' ')]);
  return JSON.stringify(rows.map((r) => JSON.stringify(r)).sort());
}

/** Rough expected kill tick for this team (everyone scything, a Dawn every 4 ticks, thralls): the horizon the beam
 *  ranks partial rotations on. Scales with Verzik's HP, the team's damage and spec (about t52 for 5s). */
export function typicalKill(ctx) {
  const n = ctx.players.length;
  const melee = ctx.atk.reduce((a, t) => a + t.S.mean / t.S.speed, 0) + n * THRALL_MEAN / THRALL_EVERY;
  for (let T = 1; T < endOf(ctx); T++) {
    // Dawns by T: one every 4 ticks, capped by the team's spec (starts + one surge each + regen so far)
    const spec = ctx.players.reduce((a, pl) => a + 100 + (pl.canSurge ? SURGE : 0) + 10 * Math.floor(T / (pl.lb ? 25 : 50)), 0);
    const dawns = Math.min(Math.floor((T - 2) / 4) + 1, Math.floor(spec / DAWN_COST));
    if (melee * T + dawns * (DAWN_MEAN - ctx.atk[0].S.mean * 4 / ctx.atk[0].S.speed) >= ctx.hp) return T + 2;
  }
  return endOf(ctx);
}

// ------------------------------------------------------------------ beam search over the rotation
/**
 * Slot by slot: the next Dawn goes to the current holder (keep it) or anyone else; a player's start spec (95/100) is
 * decided the first time they hold it; per slot, optionally a transfer from another player (who must be at 100%)
 * and/or the holder's surge. Interchangeable players (same gear, Lightbearer, weapons, surge) are only tried in one
 * order. Partial plans are ranked by their last Dawn tick, then team spec left; finished charts by the analytic score.
 */
export function solve(ctx, { slots = 16, beam = 300, keepPerSlot = 40, onProgress = null } = {}) {
  const n = ctx.players.length;
  const groupOf = ctx.players.map((pl) => ctx.players.findIndex((q) => q.key === pl.key));
  const horizon = typicalKill(ctx);
  let states = [{ plan: { start: new Array(n).fill(100), slots: [] }, used: new Array(n).fill(false) }];
  const finals = [];
  let tried = 0;
  for (let s = 0; s < slots; s++) {
    const next = new Map();
    for (const st of states) {
      for (let h = 0; h < n; h++) {
        // symmetry: two players with the same setup are interchangeable while their part in the plan so far is the
        // same too (start spec, Dawns held, transfers given, surge) - then only the lower one is tried
        const sig = roleSigs(st.plan, n);
        const twin = (a) => ctx.players.some((_, j) => j < a && groupOf[j] === groupOf[a] && sig[j] === sig[a]);
        if (twin(h)) continue;
        const starts = st.used[h] ? [st.plan.start[h]] : [95, 100];
        const givers = [null];
        if (ctx.transfers) for (let g = 0; g < n; g++) {
          if (g === h || st.plan.slots.some((x) => x.st === g)) continue;
          if (ctx.players.some((_, j) => j < g && j !== h && groupOf[j] === groupOf[g] && sig[j] === sig[g])) continue;
          givers.push(g);
        }
        const canSurge = ctx.players[h].canSurge && !st.plan.slots.some((x) => x.h === h && x.surge);
        for (const sp of starts) for (const g of givers) for (const surge of canSurge ? [false, true] : [false]) {
          const plan = { start: [...st.plan.start], slots: [...st.plan.slots, { h, st: g, surge }] };
          plan.start[h] = sp;
          tried++;
          const r = placeRotation(ctx, plan);
          if (!r.ok) continue;
          const key = JSON.stringify([plan.slots, plan.start]);
          if (next.has(key)) continue;
          const used = [...st.used]; used[h] = true;
          const last = r.dawnTicks[r.dawnTicks.length - 1][0];
          next.set(key, { plan, used, last, r, spare: r.energy.p.reduce((a, x) => a + x.s, 0) });
        }
      }
    }
    // cadence first; among rotations with the same latest Dawn, the most damage landed by then (fills included);
    // a pre-cut on (tick, spare spec) keeps the fill work bounded
    // (damage is counted up to a typical kill tick, not just to the latest Dawn: a hand-off costs the receiver attack
    // ticks that only show later, and ranking by the latest Dawn alone lets the beam drop the better rotations)
    let cand = [...next.values()].sort((a, b) => a.last - b.last || b.spare - a.spare).slice(0, beam * 6);
    for (const c of cand) c.dmg = landedBy(ctx, buildChart(ctx, c.plan, c.r).acts, Math.max(c.last + 2, horizon)) + 0.15 * c.spare;
    states = cand.sort((a, b) => a.last - b.last || b.dmg - a.dmg).slice(0, beam);
    if (!states.length) break;
    // finalists from every length (the longest are kept below); duos run out of spec well before 12 Dawns
    if (s >= 4) for (const st of states.slice(0, keepPerSlot)) finals.push({ plan: st.plan, len: s + 1 });
    if (onProgress) onProgress(s + 1, slots, states[0].last);
  }
  // finalists: the longest rotations found (more Dawns never slow P1 down; they only matter for slower raids)
  const maxLen = Math.max(...finals.map((f) => f.len));
  const scored = [], seen = new Set();
  for (const { plan } of finals.filter((f) => f.len >= maxLen - 1)) {
    const b = buildChart(ctx, plan); if (!b.ok) continue;
    // two charts that only differ after P1 is (almost always) dead are the same option
    const k = chartKey(ctx, b.acts, horizon + 8, plan.start);
    if (seen.has(k)) continue; seen.add(k);
    const sc = killTick(ctx, b.acts);
    scored.push({ plan, built: b, score: sc.cvar, tick: sc.tick });
  }
  scored.sort((a, b) => a.score - b.score);
  return { tops: scored, tried };
}

// ------------------------------------------------------------------ editing a charted P1 (your chart as a start)
/** The ticks each player dodges on a chart (X): the dodge sets a charted duo P1 is rebuilt with. */
export const chartDodges = (cfgs) => cfgs.map((c) => Object.entries(c.actions || {}).filter(([, a]) => a === 'X').map(([t]) => Number(t)));

/** A charted P1 as a plan: the Dawns in order (who holds each, and its charted tick as the earliest it goes on), each transfer (ST>n) on the receiver's last Dawn before
 *  it, each player's first surge (P) on their last Dawn before it, start specs 95 / 100. Surges and transfers that don't
 *  follow one of that player's Dawns aren't part of a plan (the rebuilt chart places surges after Dawns only). */
export function planFromChart(cfgs) {
  const dawns = [];
  cfgs.forEach((c, k) => { for (const [t, a] of Object.entries(c.actions || {})) if (a === 'D') dawns.push([Number(t), k]); });
  dawns.sort((x, y) => x[0] - y[0]);
  const slots = dawns.map(([t, h]) => ({ h, st: null, surge: false, at: t }));
  const lastDawn = (k, t) => { for (let j = dawns.length - 1; j >= 0; j--) if (dawns[j][1] === k && dawns[j][0] <= t) return j; return -1; };
  cfgs.forEach((c, k) => {
    let surged = false;
    for (const [tt, a] of Object.entries(c.actions || {}).sort((x, y) => x[0] - y[0])) {
      const t = Number(tt);
      if (a === 'P' && !surged) { surged = true; const j = lastDawn(k, t); if (j >= 0 && !slots[j].surge) slots[j].surge = true; }
      const m = /^ST>(\d)$/.exec(a);
      if (m) { const to = Number(m[1]) - 1, j = lastDawn(to, t); if (j >= 0 && to !== k && slots[j].st == null) slots[j].st = k; }
    }
  });
  return { start: cfgs.map((c) => (Number(c.startSpec) === 95 ? 95 : 100)), slots };
}

/** Plans one change away from `plan`: a Dawn to someone else, two Dawns' holders swapped (next to each other), a surge
 *  moved / added / dropped, a transfer added / changed / dropped, a start spec flipped, the last Dawn dropped or another
 *  one added, and every player's whole part handed to another player (all orders - who does what). Invalid ones are
 *  left for placeRotation to reject. */
export function planNeighbors(ctx, plan, { perms = true } = {}) {
  const n = ctx.players.length, S = plan.slots, out = [];
  const mk = (slots, start = plan.start) => ({ start: [...start], slots: slots.map((x) => ({ ...x })) });
  const fix = (q) => { q.slots.forEach((x) => { if (x.st === x.h) x.st = null; }); return q; };
  for (let j = 0; j < S.length; j++) {
    for (let h = 0; h < n; h++) if (h !== S[j].h) { const q = mk(S); q.slots[j].h = h; out.push(fix(q)); }
    if (j + 1 < S.length && S[j].h !== S[j + 1].h) { const q = mk(S); [q.slots[j].h, q.slots[j + 1].h] = [S[j + 1].h, S[j].h]; out.push(fix(q)); }
    // surge: on this Dawn instead of the holder's other one (or added), or dropped
    { const q = mk(S); const h = S[j].h; q.slots.forEach((x, i) => { if (x.h === h) x.surge = i === j ? !S[j].surge : false; }); out.push(q); }
    // transfer onto this Dawn: from each other player (moved from their other one), or dropped
    if (ctx.transfers) {
      for (let g = 0; g < n; g++) {
        if (g === S[j].h || S[j].st === g) continue;
        const q = mk(S); q.slots.forEach((x) => { if (x.st === g) x.st = null; }); q.slots[j].st = g; out.push(q);
      }
      if (S[j].st != null) { const q = mk(S); q.slots[j].st = null; out.push(q); }
    }
  }
  // timing: a Dawn (and every one after it) earlier or later; every Dawn as early as it can go
  for (let j = 0; j < S.length; j++) for (const d of [-4, -2, -1, 1, 2, 4]) {
    if (S[j].at == null) continue;
    const q = mk(S); q.slots.forEach((x, i) => { if (i >= j && x.at != null) x.at = Math.max(1, x.at + d); }); out.push(q);
  }
  if (S.some((x) => x.at != null)) { const q = mk(S); q.slots.forEach((x) => { x.at = null; }); out.push(q); }
  for (let k = 0; k < n; k++) { const st = [...plan.start]; st[k] = st[k] === 95 ? 100 : 95; out.push(mk(S, st)); }
  if (S.length > 1) out.push(mk(S.slice(0, -1)));
  for (let h = 0; h < n; h++) out.push(mk([...S, { h, st: null, surge: false, at: null }]));
  if (perms && n <= 5) {
    const perm = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perm([...arr.slice(0, i), ...arr.slice(i + 1)]).map((r) => [x, ...r])));
    for (const p of perm([...Array(n).keys()])) {
      if (p.every((x, i) => x === i)) continue;
      const start = new Array(n); plan.start.forEach((v, k) => { start[p[k]] = v; });
      out.push(fix({ start, slots: S.map((x) => ({ ...x, h: p[x.h], st: x.st == null ? null : p[x.st] })) }));
    }
  }
  return out;
}

// ------------------------------------------------------------------ verification with the real simulation
/** P1-only sim of a chart (P1 end in ticks; `start` overrides the chart's start specs): 10th percentile, average of the fastest 10% (the ranking), median, and
 *  how many raids end on each tick. */
export function simP1(cfgs, team, acts, runs = 2000, seed = 'solver', start = null) {
  // start = the plan's start specs (95 / 100 per player): part of the solver's answer, so the check runs with them
  const cf = cfgs.map((c, k) => ({ ...c, actions: acts[k], scope: 'p1', ...(start ? { startSpec: start[k] } : {}) }));
  const ends = [];
  for (let i = 0; i < runs; i++) { const r = run_p1(cf, team, new Rng(`${seed}#${i}`)); if (r.end != null) ends.push(r.end); }
  ends.sort((a, b) => a - b);
  const q = (f) => (ends.length ? ends[Math.min(ends.length - 1, Math.floor(ends.length * f))] : Infinity);
  const k10 = Math.max(1, Math.round(runs * 0.10));
  const fast = ends.slice(0, k10), cvar = fast.length === k10 ? fast.reduce((a, b) => a + b, 0) / k10 : Infinity;
  const byTick = {}; ends.forEach((e) => { byTick[e] = (byTick[e] || 0) + 1; });
  return { top10: q(0.10), cvar, median: q(0.5), killed: ends.length / runs, byTick, runs };
}
