// Verz Solver - room stage (3-5 man): P1 chart, Lightbearer, purple DC and ring swaps are searched on runs through
// the end of P2 (reds included); the best of those then get every reds West/East DC pair, on full raids (P3 included,
// played by the built-in rules and each player's own settings), ranked on full-room breakpoints. Duos (2-man) also search
// the 2nd purple DC, the mage's shadow mode and the P1 Dawn / P2 last-hit thresholds (1-5%), and count team wipes.
//
// Searched: who has Lightbearer (given how many rings), the P1 chart (top P1 charts from solver.js for that ring
// assignment), the purple DC owner, each Lightbearer player's Ring switch % (blank = default swap, or 10..100), the
// reds West/East DCs and the Soulflame horns (how many the raid has: who holds each and whether it is used in P2, P3,
// both or not at all - the horn costs 25% spec, so it is weighed against claws and ring timing).
// Fixed from the chart: gear, Boak sides, Dawn threshold, deep proc, everything else.
//
// Every setup in a stage is run on the same raids (raid i always uses the stream `${seed}#${i}`), so differences
// come from the setup, not luck - and two settings that give the same result on every raid are the same option.
// The raids of a batch can be split into ranges and run anywhere (evalRange + mergeCounts): the CLI runs them in this
// process (localEvaluator), the page spreads them over Web Workers (solver-pool.js). Same seed = same answer.
//
// Pruning:
//  - identical players (same setup) are interchangeable for the ring and purple choices: tried in one order
//  - purple DC only for players with a blowpipe
//  - P1 charts where someone can't get to 50% by reds even in the best case are dropped before any full raid
//  - everyone-claws rule (o.clawRule, off by default): only when asked for, setups where a player misses their claw in
//    reds are dropped (relative to the best setup, and a 95% floor on the final). Off, the ranking alone decides.
//  - optional minimum success rate (o.minSuccess): setups under it are dropped - at the end of P2 already (success can
//    only fall from there to the full raid), with the same small tolerance on the short early runs, exactly on the final.
//    If none reach it, the setups with the highest success are shown instead (o.top of them, listed by speed)
//  - ring values that give the same raids as another value are one option; setups where every Lightbearer player is
//    still on Lightbearer at the end of reds (camping it all of reds) are dropped
import { run_p1 } from './sim.js';
import { run_p2 } from './p2.js';
import { run_reds } from './reds.js';
import { run_duo_reds } from './duo_reds.js';
import { run_p3 } from './p3.js';
import { Rng } from './rng.js';
import { makeContext, solve, simP1, solveDuo, killTick, buildChart, chartKey, typicalKill, planFromChart, planNeighbors, chartDodges } from './solver.js';

export const CLAW_TOL = { early: 0.03, final: 0.02 };
export const CLAW_FLOOR = 0.95;   // and never below this: everyone clawing is a hard constraint (else claw scratches)
const clawRate = (c) => c.all50 / c.n;

export const RING_VALUES = [null, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];   // null = blank (default swap)

/** Search depth presets (raids per setup at each stage, setups kept between stages). */
export const ROOM_DEPTHS = {
  quick:    { label: 'Quick',    p1Top: 10, n1: 150, keep1: 6,  n2: 150, keepP2: 10, n3: 150, keep2: 14, nFinal: 1500, editRounds: 1, editWidth: 2 },
  standard: { label: 'Standard', p1Top: 20, n1: 200, keep1: 10, n2: 250, keepP2: 20, n3: 200, keep2: 24, nFinal: 3000, editRounds: 2, editWidth: 3 },
  thorough: { label: 'Thorough', p1Top: 20, n1: 400, keep1: 14, n2: 500, keepP2: 28, n3: 400, keep2: 32, nFinal: 8000, editRounds: 3, editWidth: 4 },
};

// ------------------------------------------------------------------ one raid
/** Duos: the team wipes if both players would have gone below 0 HP in P1 or P3 (the sim keeps them at 1 HP; these
 *  raids still play out, but count as failed). */
const wiped = (players, phases) => players.every((p) => p.dead || (p.would_die && phases.some((ph) => p.would_die.has(ph))));
/** Everyone claws in reds: 3-5 man counts claws in reds, duos the claws of the reds set (claws_done). */
const allClawed = (team, players) => players.filter((p) => !p.dead).every((p) => (team === 2 ? p.claws_done || 0 : p.reds_claws || 0) >= 1);
const twoClaws = (team, players) => players.filter((p) => !p.dead && (team === 2 ? p.claws_done || 0 : p.reds_claws || 0) >= 2).length;
const FAIL = { end: null, all50: false, n100: 0, camp: false, wipe: false };

/** P1 -> P2 -> reds (3-5 man reds, or duo reds). Returns {r1, r2, r3} or {fail} (with wipe set for a P1 wipe). */
function toRedsEnd(cfgs, team, rng) {
  const r1 = run_p1(cfgs, team, rng);
  if (r1.end == null || r1.players.every((p) => p.dead)) return { fail: FAIL };
  if (team === 2 && wiped(r1.players, ['P1'])) return { fail: { ...FAIL, wipe: true } };
  const r2 = run_p2(r1, team, rng);
  if (r2.reds_tick == null || (team === 2 && r2.players.every((p) => p.dead))) return { fail: FAIL };
  const r3 = team === 2 ? run_duo_reds(r2, cfgs, rng) : run_reds(r2, cfgs, team, rng);
  return { r1, r2, r3 };
}

/** One raid through the end of P2 (reds included). end = P2 end tick (null = failed). */
export function raidP2(cfgs, team, i, seed) {
  const x = toRedsEnd(cfgs, team, new Rng(`${seed}#${i}`));
  if (x.fail) return x.fail;
  const { r3 } = x;
  // the 50% rule as it plays out: everyone gets at least one claw in reds (50%), n100 = players with two (100%)
  const all50 = allClawed(team, r3.players), n100 = twoClaws(team, r3.players);
  const lb = cfgs.map((c, k) => (c.lightbearerOn ? k : -1)).filter((k) => k >= 0);
  const camp = lb.length > 0 && lb.every((k) => r3.players[k].ring === 'Lightbearer');
  return { end: r3.success && !(team === 2 && r3.players.every((p) => p.dead)) ? r3.kill : null, all50, n100, camp, wipe: false };
}

/** One full raid (P3 included). Same random stream as raidP2 for the same i/seed. */
export function raidFull(cfgs, team, i, seed) {
  const rng = new Rng(`${seed}#${i}`);
  const x = toRedsEnd(cfgs, team, rng);
  if (x.fail) return x.fail;
  const { r2, r3 } = x;
  const all50 = allClawed(team, r3.players);
  if (!r3.success || (team === 2 && r3.players.every((p) => p.dead))) return { ...FAIL, all50 };
  const r4 = run_p3({ ...r3, pid: r2.pid }, cfgs, team, rng);
  if (team === 2 && wiped(r4.players || r3.players, ['P1', 'P3'])) return { ...FAIL, all50, wipe: true };
  return { end: r4.kill == null ? null : r4.end, all50, n100: 0, camp: false, wipe: false };
}

// ------------------------------------------------------------------ counting raids
/**
 * Raids [from, to) of one setup. kind 'p2' = through the end of P2, 'full' = the whole room. bps = breakpoints in
 * seconds (a raid counts if it is equal or faster - tick times). Returns counts with the per-raid end ticks (-1 = failed).
 */
export function evalRange(kind, cfgs, team, from, to, seed, bps) {
  const n = to - from, ends = new Int16Array(n);
  const c = { n, k: 0, all50: 0, n100: 0, camp: 0, wipe: 0, under: bps.map(() => 0), ends, sum: 0 };
  const raid = kind === 'full' ? raidFull : raidP2;
  for (let i = from; i < to; i++) {
    const r = raid(cfgs, team, i, seed);
    ends[i - from] = r.end ?? -1;
    if (r.all50) c.all50++;
    c.n100 += r.n100;
    if (r.camp) c.camp++;
    if (r.wipe) c.wipe++;
    if (r.end != null) { c.k++; c.sum += r.end; bps.forEach((b, j) => { if (r.end * 0.6 <= b + 1e-9) c.under[j]++; }); }
  }
  return c;
}
/** Counts of consecutive raid ranges (in order) -> counts of the whole range. */
export function mergeCounts(parts) {
  if (parts.length === 1) return parts[0];
  const n = parts.reduce((a, p) => a + p.n, 0), ends = new Int16Array(n);
  let at = 0;
  for (const p of parts) { ends.set(p.ends, at); at += p.n; }
  const sum = (key) => parts.reduce((a, p) => a + p[key], 0);
  return { n, k: sum('k'), all50: sum('all50'), n100: sum('n100'), camp: sum('camp'), wipe: sum('wipe'), sum: sum('sum'), ends,
    under: parts[0].under.map((_, j) => parts.reduce((a, p) => a + p.under[j], 0)) };
}
/** Compatibility helpers for the CLI: raids [0, n) of one setup. */
export const evalSetup = (cfgs, team, n, seed, bps) => evalRange('p2', cfgs, team, 0, n, seed, bps);
export const evalFull = (cfgs, team, n, seed, bps) => evalRange('full', cfgs, team, 0, n, seed, bps);

// ------------------------------------------------------------------ P1 candidates
/** Players that are interchangeable (same gear, weapons, Boak side, reds DCs, surge timing, BP). */
function twinKeys(cfgs) {
  return cfgs.map((c) => JSON.stringify([c.helm, c.body, c.legs, c.amulet, c.meleePrayer, c.has3Tick, c.hasBP !== false,
    c.customSurgeTick ?? null, !!c.eastBoak, !!c.westBoak, c.eastPattern || 'A', !!c.WestDC, !!c.EastDC, !!c.shadow]));
}

/** Who gets the Lightbearers: every set of `rings` players, players with the same setup tried in one order. */
export function lbAssignments(cfgs, rings) {
  const n = cfgs.length, keys = twinKeys(cfgs), out = [], seen = new Set();
  for (let m = 0; m < 1 << n; m++) {
    let bits = 0; for (let k = 0; k < n; k++) if (m >> k & 1) bits++;
    if (bits !== rings) continue;
    const sig = JSON.stringify(keys.map((k, i) => [k, m >> i & 1]).sort());
    if (seen.has(sig)) continue; seen.add(sig);
    out.push(Array.from({ length: n }, (_, k) => !!(m >> k & 1)));
  }
  return out;
}

/** Best case for everyone reaching 50% by reds after this P1 chart: spec at P1 end + every regen until reds start
 *  (on Lightbearer if they have it) + the purple +15 for anyone who could be the purple DC. Share of P1 raids where
 *  someone can't make 50% even then. */
export function cantMake50(cfgs, team, raids, gap, seed = 'p50') {
  let bad = 0, done = 0;
  for (let i = 0; i < raids; i++) {
    const r1 = run_p1(cfgs.map((c) => ({ ...c, scope: 'p1' })), team, new Rng(`${seed}#${i}`));
    if (r1.end == null) continue;
    done++;
    if (r1.players.some((p, k) => p.spec + 10 * Math.floor((gap + p.regen_timer) / p.regen_period())
      + (cfgs[k].hasBP !== false ? 15 : 0) < 50)) bad++;
  }
  return done ? bad / done : 1;
}

const withRings = (cfgs, lb) => cfgs.map((c, k) => ({ ...c, lightbearerOn: lb[k], ringSwitch: null, targetSpec: null }));

/** The top P1 charts for one Lightbearer assignment, as full player configs (P1 chart + start spec filled in);
 *  charts where someone can't reach 50% by reds are dropped. Returns {cands: [cfgs], charts, dropped}. */
export function p1Candidates(base, team, lb, { beam = 150, top = 20, gap = 150, sbOwner = null, clawRule = false, diverse = false } = {}) {
  const cf = withRings(base, lb);
  let charts;
  if (diverse) {
    // the fastest charts (as without it) + the fastest of each spec split
    const fast = team === 2 ? null : solve(makeContext(cf, team, { sbOwner }), { beam, slots: 16 }).tops.slice(0, 20);
    const div = diverseCharts(cf, team, { beam, top, sbOwner });
    charts = fast ? [...fast, ...div] : div;
    if (team === 2) { const all = solveDuo(cf, { beam, sbOwner }); charts = [...all.slice(0, 20), ...div]; }
    const seenC = new Set();
    charts = charts.filter((f) => { const k = JSON.stringify([f.built.acts, f.plan.start]); if (seenC.has(k)) return false; seenC.add(k); return true; });
    const cands = charts.map((f) => cf.map((c, k) => ({ ...c, actions: f.built.acts[k], startSpec: f.plan.start[k] })));
    return { cands, charts: charts.length, dropped: 0 };
  }
  if (team === 2) {
    // duos: the best charts on the fastest raids AND the best on the typical raid (Dawns kept for longer P1s, e.g. a
    // spec transfer mid-P1) - the full raid decides between them
    const all = solveDuo(cf, { beam, sbOwner });
    const half = (f) => killTick(makeContext(cf, 2, { sbOwner, dodge: f.dodge }), f.built.acts, 0.5).cvar;
    const byHalf = all.slice(0, 120).map((f) => [f, half(f)]).sort((x, y) => x[1] - y[1]).map(([f]) => f);
    charts = [...new Set([...all.slice(0, Math.ceil(top / 2)), ...byHalf.slice(0, top)])].slice(0, top);
  } else {
    charts = solve(makeContext(cf, team, { sbOwner }), { beam, slots: 16 }).tops.slice(0, top);
  }
  const cands = [];
  for (const f of charts) {
    const cfg = cf.map((c, k) => ({ ...c, actions: f.built.acts[k], startSpec: f.plan.start[k] }));
    if (!clawRule || cantMake50(cfg, team, 40, gap) <= 0.5) cands.push(cfg);
  }
  return { cands, charts: charts.length, dropped: charts.length - cands.length };
}

/** Your chart's P1, edited: the charts one change away from each plan (planNeighbors), built with the same rules as
 *  the solver's own (the plan's own included). The dodges come from the chart's X ticks (duos). Returns
 *  [{plan, acts, cvar}], one per distinct chart. */
export function editCandidates(cfg, team, plans, { sbOwner = null, perms = true } = {}) {
  const ctx = makeContext(cfg, team, { sbOwner, dodge: team === 2 ? chartDodges(cfg) : null });
  const upTo = ctx.duo ? ctx.end : typicalKill(ctx) + 8, out = [], seen = new Set();
  for (const p of plans) for (const q of [p, ...planNeighbors(ctx, p, { perms })]) {
    const b = buildChart(ctx, q); if (!b.ok) continue;
    const key = chartKey(ctx, b.acts, upTo, q.start); if (seen.has(key)) continue; seen.add(key);
    out.push({ plan: q, acts: b.acts, cvar: killTick(ctx, b.acts).cvar });
  }
  return out;
}

/**
 * P1 charts picked for the room, not just for P1: every chart the rotation search keeps (many more than the top few),
 * within `slack` ticks of the fastest (analytic, fastest 10% of raids), grouped by how the spec ends up split at the end
 * of P1 (each player's average spec over a short P1 sim, in 10% steps; duos: per dodge pattern too) - that decides who claws in reds. The fastest
 * chart of each group goes on, fastest groups first, up to `top`.
 */
export function diverseCharts(cf, team, { beam = 150, top = 40, sbOwner = null, slack = 4, runs = 60, step = 10 } = {}) {
  let all;
  if (team === 2) all = solveDuo(cf, { beam, sbOwner, top: 200 });
  else all = solve(makeContext(cf, team, { sbOwner }), { beam, slots: 16, keepPerSlot: beam }).tops;
  if (!all.length) return [];
  const best = all[0].score;
  const groups = new Map();
  for (const f of all) {
    if (f.score > best + slack) break;
    const cfg = cf.map((c, k) => ({ ...c, actions: f.built.acts[k], startSpec: f.plan.start[k], scope: 'p1' }));
    const spec = cfg.map(() => 0); let n = 0;
    for (let i = 0; i < runs; i++) {
      const r = run_p1(cfg, team, new Rng(`div#${i}`));
      if (r.end == null) continue;
      n++; r.spec_p2.forEach((x, k) => { spec[k] += x; });
    }
    if (!n) continue;
    const sig = `${f.pattern || ''}|${spec.map((x) => Math.round(x / n / step)).join(",")}`;   // duos: per dodge pattern too
    if (!groups.has(sig)) groups.set(sig, f);                     // sorted fastest first: the first is the group's best
  }
  return [...groups.values()].slice(0, top);
}

/** Runs everything in this process (the CLI). The page uses solver-pool.js, which has the same three calls. */
export const localEvaluator = {
  async eval(kind, list, team, n, seed, bps) { return list.map((cfgs) => evalRange(kind, cfgs, team, 0, n, seed, bps)); },
  async p1(base, team, lb, opts) { return p1Candidates(base, team, lb, opts); },
  async edits(cfg, team, plans, opts) { return editCandidates(cfg, team, plans, opts); },
  async p1sim(list, team, runs, seed) {
    return list.map((cfgs) => simP1(cfgs, team, cfgs.map((c) => c.actions), runs, seed, cfgs.map((c) => c.startSpec)));
  },
};

// ------------------------------------------------------------------ the search
/** The settings that make a setup (everything the search chooses but the reds DCs). */
const coreKey = (cfg) => JSON.stringify(cfg.map((c) => [c.lightbearerOn, c.PurpleDC, c.ringSwitch ?? null, c.startSpec, c.actions,
  !!c.horn, !!c.hornP2, !!c.hornP3, !!c.Purple2DC, !!c.shadowCamp, !!c.shadow31, !!c.shadowLB, c.dawnThr ?? null, c.lastHitThr ?? null]));
const withHorn = (cfg, k, p2, p3) => cfg.map((c, j) => (j === k ? { ...c, horn: p2 || p3, hornP2: p2, hornP3: p3 } : c));
const pctl = (ends, fs) => { const e = [...ends].filter((x) => x >= 0).sort((x, y) => x - y); return e.length ? fs.map((f) => e[Math.floor(e.length * f)] * 0.6) : []; };

/**
 * Search. o: {rings, horns, bpsFull (full-room seconds; [] = rank by success), rankBy ('bp' index into bpsFull, or
 *   'success'), minSuccess (0-1), bps (P2-end seconds for the early stages; worked out when not given), sbOwner,
 *   p1Top, p1Beam, n1, keep1, n2, keepP2, n3, keep2, nFinal, top, seed, log(text), progress({stage, raids})}.
 * ev = evaluator (localEvaluator or the page's worker pool).
 * Returns {top: [{cfg, purple, c, p1}], stats, gap, fallback, bps}.
 */
export async function solveRoom(base, team, o, ev = localEvaluator) {
  const log = o.log || (() => {});
  const seed = o.seed ?? 'room';
  const clawRule = !!o.clawRule;                         // everyone-claws rule: off unless asked for
  const stats = { hornP2Tried: 0, hornP2Changed: 0, hornP3Tried: 0, hornP3Changed: 0, dcEquiv: 0, dcTried: 0, dcSame: 0, dcClaw: 0, dcSucc: 0,
    lbSets: 0, p1Charts: 0, p1Dropped50: 0, setups1: 0, cut50: 0, succCut: 0, ringTried: 0, ringSame: 0, ringCamp: 0, ringClaw: 0,
    purpleTried: 0, purpleChanged: 0, finalSame: 0, finalClawCut: 0, finalSuccCut: 0, raids: 0, t: {} };
  const keys = twinKeys(base);
  const T = (k, t0) => { stats.t[k] = (stats.t[k] || 0) + (Date.now() - t0) / 1000; };
  let stage = '';
  const step = (s) => { stage = s; o.progress && o.progress({ stage, raids: stats.raids }); };
  /** Run a batch of setups on the same raids. */
  const run = async (kind, list, n, tag) => {
    if (!list.length) return [];
    const out = await ev.eval(kind, list, team, n, `${seed}:${tag}`, kind === 'full' ? bpsFull : bps);
    stats.raids += n * list.length;
    o.progress && o.progress({ stage, raids: stats.raids });
    return out;
  };

  // full-room breakpoints and what ranks: a breakpoint (moved to the front) or success
  const bpOrder = o.rankBy === 'success' || !(o.bpsFull || []).length ? null : Number(o.rankBy || 0);
  const bpsFull = bpOrder == null ? [...(o.bpsFull || [])] : [o.bpsFull[bpOrder], ...o.bpsFull.filter((_, j) => j !== bpOrder)];
  const bySuccess = bpOrder == null;
  /** Ranking: share at or under the target breakpoint (early stages add small nudges from the other ones, so a rare tight
   *  breakpoint doesn't rank on luck), success as the tie-breaker - or success first when ranking by success. */
  const score = (c, early = false) => {
    if (bySuccess || !c.under.length) return c.k / c.n + (c.under.length ? 1e-3 * c.under[0] / c.n : -1e-6 * c.sum / Math.max(1, c.k));
    let s = c.under[0] / c.n;
    if (early) c.under.forEach((x, j) => { if (j > 0) s += 0.1 * x / c.n; });
    return s + 0.001 * c.k / c.n;
  };

  // gap from P1 end to reds start, for the 50% check (a fast one, so the check stays a best case)
  let t0 = Date.now();
  step('Planning');
  const gaps = [];
  for (let i = 0; i < 60; i++) {
    const rng = new Rng(`gap#${i}`); const r1 = run_p1(base, team, rng);
    if (r1.end == null) continue; const r2 = run_p2(r1, team, rng);
    if (r2.reds_tick != null) gaps.push(r2.reds_tick - r1.end);
  }
  gaps.sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length * 0.9)] : 150;

  // ---- 1. P1 candidates per Lightbearer assignment (in parallel)
  step('P1 charts');
  const lbSets = lbAssignments(base, o.rings);
  stats.lbSets = lbSets.length;
  const p1 = await Promise.all(lbSets.map((lb) => ev.p1(base, team, lb, { beam: o.p1Beam ?? 150, top: o.p1Top, gap, sbOwner: o.sbOwner ?? null, clawRule, diverse: !!o.p1Diverse })));
  const cands = [];
  p1.forEach((r, i) => {
    stats.p1Charts += r.charts; stats.p1Dropped50 += r.dropped;
    for (const cfg of r.cands) cands.push({ lb: lbSets[i], cfg });
    log(`  LB ${lbSets[i].map((x) => (x ? 1 : 0)).join('')}: ${r.charts} P1 charts`);
  });
  T('p1', t0);
  if (!cands.length) return { top: [], stats, gap, fallback: false, bps: [] };

  // P2-end breakpoints for the early stages (10th / 25th / 50th percentile of a first setup), unless given
  let bps = o.bps && o.bps.length ? o.bps : [];
  if (!bps.length) {
    const c0 = cands[0].cfg, bp0 = c0.findIndex((c) => c.hasBP !== false);
    const [r] = await run('p2', [c0.map((c, k) => ({ ...c, PurpleDC: k === bp0 }))], Math.max(400, o.n1 * 2), 'p2bp');
    bps = pctl(r.ends, [0.10, 0.25, 0.50]);
    if (!bps.length) bps = [0];
  }

  // ---- 1b. your charts, edited: from each chart's own P1 plan, every chart one change away (who has which Dawn, its
  // timing, surges, transfers, start specs, who does what) on P2 raids; the best few are edited again (o.editRounds
  // rounds, o.editWidth at a time). The best o.editKeep go on with your chart's own settings, through every stage.
  t0 = Date.now();
  const edited = [];
  const minE = o.minSuccess || 0;
  const erank = (c) => (c.k / c.n >= minE - CLAW_TOL.early - 1e-9 ? 1 : 0) + score(c, true);   // the minimum success first
  for (const sd of (o.editRounds ?? 2) > 0 ? o.seeds || [] : []) {
    step('Editing your chart');
    const lb = sd.cfg.map((c) => !!c.lightbearerOn), purple = Math.max(0, sd.cfg.findIndex((c) => c.PurpleDC));
    const cfgOf = (x) => sd.cfg.map((c, k) => ({ ...c, actions: x.acts[k], startSpec: x.plan.start[k] }));
    const seen = new Set(), done = new Set(), pool = [];
    let frontier = [planFromChart(sd.cfg)];
    for (let r = 0; r < (o.editRounds ?? 2) && frontier.length; r++) {
      frontier.forEach((p) => done.add(JSON.stringify(p)));
      const list = (await ev.edits(sd.cfg, team, frontier, { perms: r === 0 }))
        .filter((x) => { const k = JSON.stringify([x.acts, x.plan.start]); if (seen.has(k)) return false; seen.add(k); return true; });
      (await run('p2', list.map(cfgOf), o.nEdit ?? o.n1, 'edit')).forEach((c, i) => { list[i].c = c; });
      pool.push(...list);
      pool.sort((a, b) => erank(b.c) - erank(a.c));
      frontier = pool.map((x) => x.plan).filter((p) => !done.has(JSON.stringify(p))).slice(0, o.editWidth ?? 3);
      stats.edits = (stats.edits || 0) + list.length;
    }
    for (const x of pool.slice(0, o.editKeep ?? 3)) edited.push({ lb, cfg: cfgOf(x), seedLabel: sd.label, edited: true, purple });
    log(`  ${sd.label} edited: ${pool.length} charts tried`);
  }
  T('edit', t0);

  // ---- 2. screen: every P1 chart x purple owner, default ring swaps
  t0 = Date.now();
  step('Screening');
  const s1all = [];
  for (const cd of cands) {
    const tried = new Set();
    for (let o2 = 0; o2 < team; o2++) {
      if (cd.cfg[o2].hasBP === false) continue;
      const tk = keys[o2] + cd.lb[o2];                                // identical players: one of them
      if (tried.has(tk)) continue; tried.add(tk);
      s1all.push({ ...cd, cfg: cd.cfg.map((c, k) => ({ ...c, PurpleDC: k === o2, Purple2DC: false })), purple: o2 });
    }
  }
  // your own chart(s) (o.seeds: [{cfg, label}]): screened with the rest, always carried through every stage, varied like
  // the solver's own setups, and the as-charted version always runs in the final - so a result is never worse than it
  const seeds = (o.seeds || []).map((sd) => ({ lb: sd.cfg.map((c) => !!c.lightbearerOn), cfg: sd.cfg, seedLabel: sd.label,
    purple: Math.max(0, sd.cfg.findIndex((c) => c.PurpleDC)) }));
  s1all.push(...seeds, ...edited);
  stats.setups1 = s1all.length;
  (await run('p2', s1all.map((x) => x.cfg), o.n1, 'screen')).forEach((c, i) => { s1all[i].c = c; });
  // everyone needs a claw in reds: the best rate sets the bar
  // (relative only here: the fixed floor is applied on the final run, after the ring swaps / purple / horns - the
  // choices that can lift claws - have had their go)
  const bestClaw = Math.max(...s1all.map((x) => clawRate(x.c)));
  const bar = clawRule ? bestClaw - CLAW_TOL.early : -Infinity;
  const ok50 = s1all.filter((x) => clawRate(x.c) >= bar - 1e-9);
  stats.cut50 = s1all.length - ok50.length; stats.clawBar = bestClaw;
  let minS = o.minSuccess || 0;
  const okSucc = (c) => c.k / c.n >= minS - (o.succTol ?? CLAW_TOL.early) - 1e-9;   // early runs: tolerance for noise (and untuned settings)
  stats.succCut = ok50.filter((x) => !okSucc(x.c)).length;
  let s1 = ok50.filter((x) => okSucc(x.c));
  // nothing reaches the minimum success: carry on without it and rank by success first (the next best options)
  let fallback = false;
  if (minS > 0 && !s1.length && ok50.length) { fallback = true; minS = 0; s1 = ok50; stats.succCut = 0; }
  const rank = (c, early) => (fallback ? c.k / c.n + 1e-3 * score(c, early) : score(c, early));
  s1.sort((a, b) => rank(b.c, true) - rank(a.c, true));
  const keep1 = s1.slice(0, o.keep1);
  for (const x of s1all) if (x.seedLabel && !keep1.includes(x)) keep1.push(x);   // your charts always go on
  T('screen', t0);
  log(`  screen: ${stats.setups1} setups x ${o.n1} raids, best everyone-clawed ${(stats.clawBar * 100).toFixed(1)}%, ${stats.cut50} cut (claw rule), kept ${keep1.length}`);

  // ---- 3. ring swap % (one Lightbearer player at a time, the others held), then purple re-checked with those
  // rings, then the rings once more - purple and ring swaps interact (the purple +15 changes when a swap is due)
  t0 = Date.now();
  step('Ring swaps, purple and P2 horns');
  const okClaw = (c) => clawRate(c) >= bar - 1e-9 && okSucc(c);     // claw rule + minimum success
  // a setup that meets the rules always beats one that doesn't; between two that do, the faster one wins
  // while a setup is below the claw floor, more claws come first (then speed); above it, speed decides
  const floorOk = (c) => !clawRule || clawRate(c) >= CLAW_FLOOR - CLAW_TOL.early - 1e-9;
  const better = (c, best) => {
    if (!okClaw(c)) return false;
    if (!okClaw(best)) return true;
    if (floorOk(c) !== floorOk(best)) return floorOk(c);
    if (!floorOk(c) && Math.abs(clawRate(c) - clawRate(best)) > 1e-9) return clawRate(c) > clawRate(best);
    return rank(c, true) > rank(best, true) + 1e-12;
  };
  const ringPass = async (s) => {
    let cur = s.cfg, best = s.c2 || (await run('p2', [cur], o.n2, 'ring'))[0];
    for (const k of cur.map((c, j) => (c.lightbearerOn ? j : -1)).filter((j) => j >= 0)) {
      // every value for this player is tried with the others held (one batch); then they're compared in order
      const vals = RING_VALUES.filter((v) => v !== (cur[k].ringSwitch ?? null));
      const base2 = cur;
      const list = vals.map((v) => base2.map((c, j) => (j === k ? { ...c, ringSwitch: v } : c)));
      const res = await run('p2', list, o.n2, 'ring');
      const seen = new Set([best.ends.join(',')]);
      res.forEach((c, i) => {
        stats.ringTried++;
        const sig = c.ends.join(',');
        if (seen.has(sig)) { stats.ringSame++; return; }              // same raids as another value: same option
        seen.add(sig);
        if (c.camp / c.n > 0.5) { stats.ringCamp++; return; }          // everyone camping Lightbearer through reds
        if (!okClaw(c)) { stats.ringClaw++; return; }                  // someone stops clawing: never traded for speed
        if (better(c, best)) { best = c; cur = list[i]; }
      });
    }
    return { ...s, cfg: cur, c2: best };
  };
  const purplePass = async (s) => {
    const tried = new Set([keys[s.purple] + s.lb[s.purple]]), owners = [];
    for (let o2 = 0; o2 < team; o2++) {
      if (s.cfg[o2].hasBP === false) continue;
      const tk = keys[o2] + s.lb[o2];
      if (tried.has(tk)) continue; tried.add(tk);
      owners.push(o2);
    }
    const list = owners.map((o2) => s.cfg.map((c, k) => ({ ...c, PurpleDC: k === o2, Purple2DC: false })));
    const res = await run('p2', list, o.n2, 'ring');
    stats.purpleTried += res.length;
    let best = s, changed = false;
    res.forEach((c, i) => { if (better(c, best.c2)) { best = { ...s, cfg: list[i], purple: owners[i], c2: c }; changed = true; } });
    if (changed) stats.purpleChanged++;
    return changed ? ringPass(best) : best;
  };
  // P2 horns: up to o.horns holders; each step tries giving a horn (used in P2) to someone without one, or switching a
  // holder's P2 use on/off; the best improvement is kept, and the ring swaps run again if anything changed
  const hornP2Pass = async (s) => {
    let cur = s, changed = false;
    for (let st = 0; st < 2 * (o.horns || 0); st++) {
      const holders = cur.cfg.filter((c) => c.horn).length;
      const ks = [...Array(team).keys()].filter((k) => cur.cfg[k].horn || holders < o.horns);
      const list = ks.map((k) => withHorn(cur.cfg, k, !cur.cfg[k].hornP2, !!cur.cfg[k].hornP3));
      const res = await run('p2', list, o.n2, 'ring');
      stats.hornP2Tried += res.length;
      let best = null;
      res.forEach((c, i) => { if (better(c, (best || cur).c2)) best = { ...cur, cfg: list[i], c2: c }; });
      if (!best) break;
      cur = best; changed = true;
    }
    if (changed) stats.hornP2Changed++;
    return changed ? ringPass(cur) : cur;
  };
  // duos: 2nd purple DC, the mage's shadow mode, and the P1 Dawn / P2 last-hit thresholds (1-5%), one at a time
  const optionPass = async (s, opts) => {
    if (!opts.length) return { s, changed: false };
    const list = opts.map((f) => f(s.cfg));
    const res = await run('p2', list, o.n2, 'ring');
    let best = s, changed = false;
    res.forEach((c, i) => {
      if (c.ends.join(',') === best.c2.ends.join(',')) return;
      if (better(c, best.c2)) { best = { ...s, cfg: list[i], c2: c }; changed = true; }
    });
    return { s: best, changed };
  };
  const mageK = base.findIndex((c) => c.shadow);
  const duoPasses = async (s0) => {
    if (team !== 2) return s0;
    let s = s0, any = false;
    const n2 = Number(base[0].nPurples || 1) === 2;
    const passes = [
      n2 ? [0, 1].filter((k) => s.cfg[k].hasBP !== false).map((k) => (cf) => cf.map((c, j) => ({ ...c, Purple2DC: j === k && !c.PurpleDC }))) : [],
      mageK >= 0 ? [{ shadowCamp: true, shadow31: false, shadowLB: false }, { shadowCamp: false, shadow31: true, shadowLB: false },
        { shadowCamp: false, shadow31: false, shadowLB: true }, { shadowCamp: false, shadow31: true, shadowLB: true }]
        .map((m) => (cf) => cf.map((c, j) => (j === mageK ? { ...c, ...m } : c))) : [],
      [1, 2, 3, 4, 5].map((v) => (cf) => cf.map((c) => ({ ...c, dawnThr: v }))),
      [1, 2, 3, 4, 5].map((v) => (cf) => cf.map((c) => ({ ...c, lastHitThr: v }))),
    ];
    for (const opts of passes) { const r = await optionPass(s, opts); s = r.s; any = any || r.changed; }
    if (any) stats.duoChanged = (stats.duoChanged || 0) + 1;
    return any ? ringPass(s) : s;
  };
  const s2 = (await Promise.all(keep1.map(async (x) => hornP2Pass(await duoPasses(await purplePass(await ringPass(x))))))).map((x) => ({ ...x, c: x.c2 }));
  s2.sort((a, b) => rank(b.c, true) - rank(a.c, true));
  T('rings', t0);
  log(`  ring swaps: ${keep1.length} setups, ${stats.ringTried} values tried, ${stats.ringSame} identical to another, ${stats.ringCamp} camp-LB, ${stats.ringClaw} broke the claw rule`
    + ` | purple re-check: ${stats.purpleTried} tried, ${stats.purpleChanged} changed | P2 horns: ${stats.hornP2Tried} tried, ${stats.hornP2Changed} setups use one`);

  // ---- 4. reds DCs (P3): the best P2 setups get every West x East owner pair, on full raids
  t0 = Date.now();
  step('Reds DCs and P3 horns');
  const top2 = [], fseen = new Set();
  for (const x of s2) {
    if (!okClaw(x.c)) continue;
    const k = coreKey(x.cfg);
    if (fseen.has(k)) continue; fseen.add(k);
    top2.push(x); if (top2.length >= o.keepP2) break;
  }
  for (const x of s2) if (x.seedLabel && !top2.includes(x)) top2.push(x);
  const dcPairs = async (x) => {
    const pairs = [];
    for (let w = 0; w < team; w++) for (let e = 0; e < team; e++) pairs.push([w, e]);
    const list = pairs.map(([w, e]) => x.cfg.map((c, k) => ({ ...c, WestDC: k === w, EastDC: k === e })));
    const res = await run('full', list, o.n3, 'full');
    stats.dcTried += res.length;
    const out = [], seen = new Set();
    res.forEach((c, i) => {
      const sig = c.ends.join(',');
      if (seen.has(sig)) { stats.dcSame++; return; } seen.add(sig);   // same raids as another pair: same option
      out.push({ ...x, cfg: list[i], west: pairs[i][0], east: pairs[i][1], c });
    });
    return out;
  };
  const okClaw3 = (c, ref) => (!clawRule || clawRate(c) >= Math.min(clawRate(ref), CLAW_FLOOR) - CLAW_TOL.early - 1e-9) && okSucc(c);
  // P3 horns (full raids, on the setup's best reds DC pair): switch a holder's P3 use on/off, or give a spare horn to
  // someone for P3 only; if anything changed, every reds DC pair is tried again with the new horns
  const hornP3Pass = async (x) => {
    let cur = x, changed = false;
    for (let st = 0; st < 2 * (o.horns || 0); st++) {
      const holders = cur.cfg.filter((c) => c.horn).length;
      const ks = [...Array(team).keys()].filter((k) => cur.cfg[k].horn || holders < o.horns);
      const list = ks.map((k) => withHorn(cur.cfg, k, !!cur.cfg[k].hornP2, !cur.cfg[k].hornP3));
      const res = await run('full', list, o.n3, 'full');
      stats.hornP3Tried += res.length;
      let best = null;
      res.forEach((c, i) => { if (okClaw3(c, x.c) && rank(c, true) > rank((best || cur).c, true) + 1e-12) best = { ...cur, cfg: list[i], c }; });
      if (!best) break;
      cur = best; changed = true;
    }
    if (!changed) return [];
    stats.hornP3Changed++;
    return dcPairs(cur);
  };
  let s3 = (await Promise.all(top2.map(async (x) => {
    const pairs = (await dcPairs(x)).sort((a, b) => rank(b.c, true) - rank(a.c, true));
    return o.horns && pairs.length ? [...pairs, ...(await hornP3Pass(pairs[0]))] : pairs;
  }))).flat();
  const bar3 = clawRule ? Math.max(...s3.map((x) => clawRate(x.c))) - CLAW_TOL.early : -Infinity;
  stats.dcClaw = s3.filter((x) => clawRate(x.c) < bar3 - 1e-9).length;
  stats.dcSucc = s3.filter((x) => clawRate(x.c) >= bar3 - 1e-9 && !okSucc(x.c)).length;
  s3 = s3.filter((x) => clawRate(x.c) >= bar3 - 1e-9 && okSucc(x.c)).sort((a, b) => rank(b.c, true) - rank(a.c, true));
  T('dc', t0);
  log(`  reds DCs: ${top2.length} P2 setups x ${team * team} West/East pairs, ${stats.dcSame} identical to another, ${stats.dcClaw} cut (claw rule)`
    + (o.horns ? ` | P3 horns: ${stats.hornP3Tried} tried, ${stats.hornP3Changed} setups changed` : ''));

  // ---- 5. final: the best on many fresh full raids. Setups that are effectively the same - same core setup and the
  // reds DCs giving each player the same number of +15s (e.g. West A / East B vs West B / East A) - count once
  t0 = Date.now();
  step('Final check');
  const same = (x) => JSON.stringify([coreKey(x.cfg), x.cfg.map((c) => (c.WestDC ? 1 : 0) + (c.EastDC ? 1 : 0))]);
  const fin = [], effSeen = new Set();
  for (const x of s3) { const k = same(x); if (effSeen.has(k)) { stats.dcEquiv++; continue; } effSeen.add(k); fin.push(x); if (fin.length >= o.keep2) break; }
  // the best version of each of your charts the search found, and each one exactly as charted
  for (const sd of seeds) {
    for (const ed of [false, true]) {
      const best = s3.find((x) => x.seedLabel === sd.seedLabel && !!x.edited === ed);
      if (best && !fin.includes(best)) fin.push(best);
    }
    fin.push({ ...sd, asCharted: true });
  }
  (await run('full', fin.map((x) => x.cfg), o.nFinal, 'final')).forEach((c, i) => { fin[i].c = c; });
  // setups that play out identically on every final raid (e.g. a horn that never goes off): keep the simplest one
  // your charts as charted: kept out of the merging and filters below (they're the reference), ranked with the rest
  const mine = fin.filter((x) => x.asCharted);
  fin.splice(0, fin.length, ...fin.filter((x) => !x.asCharted));
  const uses = (x) => x.cfg.reduce((a, c) => a + (c.hornP2 ? 1 : 0) + (c.hornP3 ? 1 : 0), 0);
  const bySig = new Map();
  for (const x of fin) { const k = x.c.ends.join(','); const y = bySig.get(k); if (!y || uses(x) < uses(y)) bySig.set(k, x); }
  stats.finalSame = fin.length - bySig.size;
  fin.splice(0, fin.length, ...bySig.values());
  const fbar = !clawRule ? -Infinity : fin.length ? Math.max(Math.max(...fin.map((x) => clawRate(x.c))) - CLAW_TOL.final, CLAW_FLOOR) : CLAW_FLOOR;
  stats.finalClawCut = fin.filter((x) => clawRate(x.c) < fbar - 1e-9).length;
  for (let i = fin.length - 1; i >= 0; i--) if (clawRate(fin[i].c) < fbar - 1e-9) fin.splice(i, 1);
  stats.finalSuccCut = fin.filter((x) => x.c.k / x.c.n < minS - 1e-9).length;      // minimum success, exact on the final
  if (minS > 0 && stats.finalSuccCut === fin.length && fin.length) fallback = true;  // none hold up: next best by success
  else for (let i = fin.length - 1; i >= 0; i--) if (fin[i].c.k / fin[i].c.n < minS - 1e-9) fin.splice(i, 1);
  // fallback (nobody reached the minimum success): the o.top setups with the highest success, then listed by speed
  if (fallback) { fin.sort((a, b) => b.c.k - a.c.k || score(b.c) - score(a.c)); fin.splice(o.top); }
  fin.sort((a, b) => score(b.c) - score(a.c) || b.c.k - a.c.k);
  const top = fin.slice(0, o.top);
  top.push(...mine);                                                                // your chart as charted: always shown
  top.sort((a, b) => score(b.c) - score(a.c) || b.c.k - a.c.k);
  (await ev.p1sim(top.map((x) => x.cfg), team, 2000, 'confirm')).forEach((r, i) => { top[i].p1 = r; });
  // breakpoint columns back in the order they were given
  if (bpOrder != null && bpOrder !== 0) for (const x of top) { const u = x.c.under; x.c.under = [...u.slice(1, bpOrder + 1), u[0], ...u.slice(bpOrder + 1)]; }
  T('final', t0);
  step('Done');
  return { top, stats, gap, fallback, bps };
}
