// Full raid: (Nylocas ->) Sotetseg -> Xarpus -> Verzik back to back (Nylocas when the setup has one: its waves + boss), one setup per room (from each room's Solver). Every raid plays
// the three rooms in order on the same random stream (raid i: `${seed}#${i}`, a fork per room), carrying each player's
// surge cooldown (it only ticks inside rooms) and surge doses from room to room. Spec and its regen timing reset each
// room (95 / 100 start, as the room's setup says); stats are re-potted before Sotetseg and Xarpus, and before Verzik
// only melee, magic and HP (each room's own levels - Verzik's ranged is 99).
//
// A raid fails when a room doesn't finish (a Sotetseg wipe, a Verzik fail - 2 down in duos, 1 down in 3-5s).
import { runSote } from './sote.js';
import { runXarpus } from './xarpus.js';
import { runNylo } from './nylo.js';
import { toRedsEnd } from './roomsolver.js';
import { run_p3 } from './p3.js';
import { Rng } from './rng.js';
import { newSoteResult, addSoteRun, addSoteRaids } from './sotereport.js';
import { newXarpusResult, addXarpusRun, addXarpusRaids } from './xarpusreport.js';

export const SURGE_CD = 500;
export const ROOMS = ['sote', 'xarpus', 'verzik'];
/** The rooms a setup plays, in order (Nylocas first when it has one). */
export const roomsOf = (setup) => (setup.nylo ? ['nylo', ...ROOMS] : ROOMS);
/** Nylocas players for a room: their plan's surge only with a dose left; surgeCd carried in. */
const nyloPlayers = (players, cd, doses) => players.map((p, k) => ({ ...p, surgeCd: cd[k], plan: { ...(p.plan || {}), surge: !!(p.plan && p.plan.surge) && doses[k] > 0 } }));

/** Surge cooldown left after a room: from a surge drunk in it, else what was left coming in, minus the room. */
const cdAfter = (cdIn, surgeAt, end) => Math.max(0, surgeAt != null ? surgeAt + SURGE_CD - end : cdIn - end);

/** Verzik players with the surge cooldown carried in: a P on their chart before it's up becomes a custom surge on the
 *  tick it is (taken then); no doses left: no surge at all. */
function verzikCfgs(cfgs, cd, doses) {
  return cfgs.map((c, k) => {
    const acts = { ...(c.actions || {}) }, pTicks = Object.keys(acts).filter((t) => acts[t] === 'P').map(Number);
    let custom = c.customSurgeTick ?? null;
    if (doses[k] <= 0) { for (const t of pTicks) delete acts[t]; custom = null; }
    else if (cd[k] > 0) {
      const early = pTicks.filter((t) => t < cd[k]);
      if (early.length) { for (const t of early) delete acts[t]; custom = cd[k]; }
      else if (custom != null) custom = Math.max(custom, cd[k]);
    }
    return { ...c, actions: acts, customSurgeTick: custom, surgeCdTicks: cd[k] };
  });
}

/**
 * One full raid. setup: {sote: {players, entry, opts}, xarpus: {players, opts}, verzik: {cfgs}}; ctx: {team, surgeCd:
 * [ticks into Sotetseg], doses: [surge doses each]}. Returns {ends: [sote, xarpus, verzik] (room ticks; null = failed
 * or not reached), total (null = failed), failAt}.
 */
export function fullRaid(setup, ctx, i, seed = 'full', acc = null) {
  const { team } = ctx, rng = new Rng(`${seed}#${i}`);
  let cd = ctx.surgeCd.map((x) => Math.max(0, Number(x) || 0)), doses = ctx.doses.map((x) => Math.max(0, Number(x) || 0));
  const N = setup.nylo ? 1 : 0, ends = roomsOf(setup).map(() => null);
  // ---- Nylocas (waves + boss)
  if (N) {
    const np = nyloPlayers(setup.nylo.players, cd, doses);
    if (acc) acc.entry[0].push({ cd: [...cd], doses: [...doses] });
    const rn = runNylo(np, team, rng.fork('nylo'), setup.nylo.opts || {});
    if (rn.roomEnd == null) return { ends, total: null, failAt: 'nylo' };
    ends[0] = rn.roomEnd;
    rn.players.forEach((p, k) => { if (p.surgeAt != null) doses[k]--; cd[k] = cdAfter(cd[k], p.surgeAt, rn.roomEnd); });
  }
  // ---- Sotetseg
  const sp = setup.sote.players.map((p, k) => ({ ...p, surgeCd: cd[k], surge: !!p.surge && doses[k] > 0 }));
  if (acc) acc.entry[N].push({ cd: [...cd], doses: [...doses] });
  const rs = runSote(sp, team, rng.fork('sote'), null, { ...setup.sote.opts, entry: setup.sote.entry });
  if (acc) addSoteRun(acc.sote, rs, i, sp);
  if (rs.end == null || !rs.split) return { ends, total: null, failAt: 'sote' };
  ends[N] = rs.end;
  rs.players.forEach((p, k) => { if (p.surgeAt != null) doses[k]--; cd[k] = cdAfter(cd[k], p.surgeAt, rs.end); });
  // ---- Xarpus
  const xp = setup.xarpus.players.map((p, k) => ({ ...p, surgeCd: cd[k], surge: !!p.surge && doses[k] > 0 }));
  if (acc) acc.entry[N + 1].push({ cd: [...cd], doses: [...doses] });
  const rx = runXarpus(xp, team, rng.fork('xarpus'), null, setup.xarpus.opts);
  if (acc) addXarpusRun(acc.xarpus, rx, team);
  if (rx.end == null) return { ends, total: null, failAt: 'xarpus' };
  ends[N + 1] = rx.end;
  rx.players.forEach((p, k) => { if (p.surgeAt != null) doses[k]--; cd[k] = p.surgeCd; });
  // ---- Verzik
  const cfgs = verzikCfgs(setup.verzik.cfgs, cd, doses), vr = rng.fork('verzik');
  if (acc) acc.entry[N + 2].push({ cd: [...cd], doses: [...doses] });
  const x = toRedsEnd(cfgs, team, vr), va = acc && acc.verzik;
  if (va) { va.runs++; if (x.r1 && x.r1.players.some((p) => p.dead)) va.die_p1++; if (x.r2) { va.depth.push(x.r2.hp / x.r2.max_hp * 100); va.reds.push(x.r2.reds_tick); } }
  if (x.fail || !x.r3.success || (team === 2 && x.r3.players.every((p) => p.dead))) return { ends, total: null, failAt: 'verzik' };
  const r4 = run_p3({ ...x.r3, pid: x.r2.pid }, cfgs, team, vr.fork('p3'));
  if (r4.kill == null) return { ends, total: null, failAt: 'verzik', p3: true };
  ends[N + 2] = r4.end;
  if (va) {
    const { r1, r2, r3 } = x;
    va.total.push(r4.end); va.p1.push(r1.end); va.p2.push(r3.kill - r1.end); va.p3.push(r4.end - r3.kill);
    va.splits.sp1.push(r1.end); va.splits.sproc.push(r2.proc_tick); va.splits.sp2.push(r3.kill); va.splits.sp3.push(r4.end);
    if (r4.below20) va.p20.push(r4.below20 - (r3.kill + 4));
  }
  return { ends, total: ends.reduce((a, x) => a + x, 0), failAt: null, p3: true };
}

/** Each room's own report, from whole raids of one combination: raids [from, to) played as fullRaid plays them, each
 *  room's result accumulated as its room report does (a room's report covers the raids that got to it). Also each
 *  room's entry state (surge cooldown left and doses) per raid. */
export function fullRaidReports(setup, ctx, from, to, seed = 'full', acc = null) {
  acc ||= { sote: newSoteResult(), xarpus: newXarpusResult(),
    verzik: { total: [], p1: [], p2: [], p3: [], depth: [], p20: [], reds: [], runs: 0, die_p1: 0, splits: { sp1: [], sproc: [], sp2: [], sp3: [] } },
    entry: roomsOf(setup).map(() => []) };
  for (let i = from; i < to; i++) fullRaid(setup, ctx, i, seed, acc);
  acc.verzik.succ = acc.verzik.runs ? acc.verzik.total.length / acc.verzik.runs : 0;
  return acc;
}
/** The entry state most raids got to a room with ({cd, doses, share}). */
export function commonEntry(list) {
  const m = new Map();
  for (const e of list) { const k = JSON.stringify([e.cd.map((c) => (c > 0 ? Math.round(c / 25) * 25 : 0)), e.doses]); m.set(k, (m.get(k) || 0) + 1); }
  const [k, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  if (!k) return null;
  const [cdR, doses] = JSON.parse(k), same = list.filter((e) => JSON.stringify([e.cd.map((c) => (c > 0 ? Math.round(c / 25) * 25 : 0)), e.doses]) === k);
  const cd = cdR.map((_, j) => { const v = same.map((e) => e.cd[j]).sort((a, b) => a - b); return v[v.length >> 1]; });
  return { cd, doses, share: n / list.length };
}
export { verzikCfgs };

/** A room's Run report on raids [from, to) (room: 'sote' {players, opts with entry} / 'xarpus' {players, opts}). */
export function roomReport({ room, players, opts = {}, team, from, to, seed }) {
  return room === 'sote' ? addSoteRaids(newSoteResult(), players, team, from, to, { seed, ...opts })
    : addXarpusRaids(newXarpusResult(), players, team, from, to, { seed, ...opts });
}
/** Report parts (raid ranges in order) put back together: counts add up, lists join, counters by name add up. */
export function mergeReports(parts) {
  const merge = (a, b) => {
    if (Array.isArray(a)) return a.concat(b || []);
    if (typeof a === 'number') return a + (Number(b) || 0);
    if (a && typeof a === 'object') { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = k in o ? merge(o[k], v) : v; return o; }
    return a ?? b;
  };
  return parts.reduce((acc, x) => (acc == null ? x : merge(acc, x)), null);
}

/** Play combinations on raids [from, to): per combo {totals (ticks; 99999 = failed), ends: [[sote], [xarpus], [verzik]],
 *  p3 (1: Verzik's P2 went down in reds - the raid got to P3)}. */
export function evalFull(combos, ctx, from, to, seed) {
  return combos.map((setup) => {
    const totals = [], ends = roomsOf(setup).map(() => []), p3 = [];
    for (let i = from; i < to; i++) {
      const r = fullRaid(setup, ctx, i, seed);
      totals.push(r.total ?? 99999); r.ends.forEach((e, j) => ends[j].push(e ?? 99999)); p3.push(r.p3 ? 1 : 0);
    }
    return { totals, ends, p3 };
  });
}

/** Ranking: total mode - the share of raids at or under each total breakpoint (fastest first), then the median total;
 *  per-room mode - the share with every room at or under its own breakpoint, then the median total. Higher is better. */
export function fullScore(r, { mode, total = [], rooms = [], rankBy = 'goal' }) {
  const n = r.totals.length, sorted = r.totals.slice().sort((a, b) => a - b), med = sorted[n >> 1];
  if (rankBy === 'success') return [sorted.filter((x) => x < 99999).length / n, -med];
  if (mode === 'rooms' && rooms.some((b) => b != null)) {
    let k = 0;
    for (let i = 0; i < n; i++) if (r.ends.every((e, j) => rooms[j] == null || e[i] * 0.6 <= rooms[j] + 1e-9)) k++;
    return [k / n, -med];
  }
  const asc = [...total].sort((a, b) => a - b);
  return [...asc.map((b) => sorted.filter((t) => t * 0.6 <= b + 1e-9).length / n), -med];
}
export const fullBetter = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] > b[i] + 1e-12) return true; if (a[i] < b[i] - 1e-12) return false; } return false; };

// ---------------------------------------------------------------- surge plans
// Each player surges in at most one room in time to matter (500 ticks of cooldown is more than a room; a Sotetseg surge
// is still cooling down through Xarpus and Verzik P1), so a surge plan is a room (or none) per player, within their doses.
// Each room's setups come as variants: a setup with some of its surgers taken out (no re-solve) - every subset - and the
// room's setups solved with no surges. The plans are scored from each room's own time distribution (the rooms are
// independent apart from the surge), then the best are played as whole raids with the cooldown carried for real.

/** The players with a surge planned in a room setup (Verzik: a P on the chart or a custom surge timing). */
export function surgersOf(kind, setup) {
  if (kind === 'verzik') return setup.cfgs.map((c, k) => (Object.values(c.actions || {}).includes('P') || c.customSurgeTick != null ? k : -1)).filter((k) => k >= 0);
  if (kind === 'nylo') return setup.players.map((p, k) => (p.plan && p.plan.surge ? k : -1)).filter((k) => k >= 0);
  return setup.players.map((p, k) => (p.surge ? k : -1)).filter((k) => k >= 0);
}
/** The setup with only `keep` (player indexes) of its surgers still surging. */
export function withSurgers(kind, setup, keep) {
  const on = new Set(keep);
  if (kind === 'verzik') return { ...setup, cfgs: setup.cfgs.map((c, k) => (on.has(k) ? c : { ...c, actions: Object.fromEntries(Object.entries(c.actions || {}).filter(([, a]) => a !== 'P')), customSurgeTick: null })) };
  if (kind === 'nylo') return { ...setup, players: setup.players.map((p, k) => (on.has(k) ? p : { ...p, plan: { ...(p.plan || {}), surge: false } })) };
  return { ...setup, players: setup.players.map((p, k) => (on.has(k) ? p : { ...p, surge: false })) };
}
/** Every subset of a list. */
export const subsets = (a) => a.reduce((out, x) => out.concat(out.map((s) => [...s, x])), [[]]);

/** One room on its own (raid i's stream for that room, as in a full raid): its end tick, or null if it failed. */
export function playRoom(kind, setup, team, cd, i, seed) {
  const rng = new Rng(`${seed}#${i}`).fork(kind);
  if (kind === 'nylo') return runNylo(nyloPlayers(setup.players, cd, cd.map(() => 1)), team, rng, setup.opts || {}).roomEnd;
  if (kind === 'sote') {
    const r = runSote(setup.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), team, rng, null, { ...setup.opts, entry: setup.entry });
    return r.end != null && r.split ? r.end : null;
  }
  if (kind === 'xarpus') return runXarpus(setup.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), team, rng, null, setup.opts).end;
  const cfgs = verzikCfgs(setup.cfgs, cd, cd.map(() => 1)), x = toRedsEnd(cfgs, team, rng);
  if (x.fail || !x.r3.success || (team === 2 && x.r3.players.every((p) => p.dead))) return null;
  const r4 = run_p3({ ...x.r3, pid: x.r2.pid }, cfgs, team, rng.fork('p3'));
  return r4.kill == null ? null : r4.end;
}
/** Room variants on raids [from, to): items [{kind, setup, cd}] -> [{ends (ticks; 99999 = failed)}]. */
export function evalRooms(items, team, from, to, seed) {
  return items.map((it) => { const ends = []; for (let i = from; i < to; i++) ends.push(playRoom(it.kind, it.setup, team, it.cd, i, seed) ?? 99999); return { ends }; });
}

/** A room's finished times as a probability per tick (of every attempt) - {lo, p: [], ok}. */
export function distOf(ends) {
  const ok = ends.filter((x) => x < 99999), n = ends.length;
  if (!ok.length) return { lo: 0, p: [], ok: 0 };
  let lo = Infinity, hi = -Infinity; for (const x of ok) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const p = new Float64Array(hi - lo + 1); for (const x of ok) p[x - lo] += 1 / n;
  return { lo, p, ok: ok.length / n };
}
/** Two independent rooms' times added together. */
export function convolve(a, b) {
  if (!a.p.length || !b.p.length) return { lo: 0, p: [], ok: 0 };
  const p = new Float64Array(a.p.length + b.p.length - 1);
  for (let i = 0; i < a.p.length; i++) { const x = a.p[i]; if (!x) continue; for (let j = 0; j < b.p.length; j++) p[i + j] += x * b.p[j]; }
  return { lo: a.lo + b.lo, p, ok: a.ok * b.ok };
}
/** Share of attempts finished by `ticks` (a distribution's cumulative; cached on it). */
const cdf = (d, ticks) => {
  if (!d.cum) { d.cum = new Float64Array(d.p.length); let acc = 0; for (let i = 0; i < d.p.length; i++) { acc += d.p[i]; d.cum[i] = acc; } }
  if (!d.p.length || ticks < d.lo) return 0;
  return d.cum[Math.min(d.p.length - 1, ticks - d.lo)];
};
/** A plan's score from its rooms' distributions (sx: the first two rooms already added together): as fullScore (the
 *  total breakpoints / every room at its own, or success), then the median total (of the finished). Higher is better.
 *  sx: every room but the last already added together. */
export function planScore(ds, { mode, total = [], rooms = [], rankBy = 'goal' }, sx = null) {
  const L = ds.length - 1, ab = sx || ds.slice(1, L).reduce((a, d) => convolve(a, d), ds[0]), v = ds[L];
  const F = (tk) => { let s2 = 0; for (let i = 0; i < v.p.length; i++) if (v.p[i]) s2 += v.p[i] * cdf(ab, tk - v.lo - i); return s2; };
  const ok = ab.ok * v.ok;
  let lo = ab.lo + v.lo, hi = ab.lo + ab.p.length + v.lo + v.p.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (F(m) >= ok / 2) hi = m; else lo = m + 1; }
  const med = ok > 0 ? lo : 1e9;
  if (rankBy === 'success') return [ok, -med];
  if (mode === 'rooms' && rooms.some((b) => b != null)) return [ds.reduce((m, d, j) => m * (rooms[j] == null ? d.ok : cdf(d, Math.floor(rooms[j] / 0.6 + 1e-6))), 1), -med];
  return [...[...total].sort((a, b) => a - b).map((b) => F(Math.floor(b / 0.6 + 1e-6))), -med];
}
