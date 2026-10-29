// Xarpus Solver: searches each player's Defence spec (maul / BGS / Ralos Spec / none), backup, damage spec (claws /
// claws at the screech / ZCB / none), tick fix, start spec, Lightbearer cycles, surge and horn, and the set's Defence
// stop and ZCB -> claws HP, for the best room times.
// Search (as the Sotetseg Solver): from the setup given, each round every single change (with Swaps: also two players'
// Defence specs swapped, a Lightbearer / surge moved) is played on a few raids, the best on more, the best of those on
// many (the same raids for each), and the best is kept if it beats the current setup. Repeat until nothing improves.
// The best setups seen are then played on more raids and ranked: with breakpoints by the share finished at the fastest
// one (then the next), otherwise by the median, then the top 10%.
import { runXarpus, canDo, DEF_SPECS, DPS_SPECS, FIXES } from './xarpus.js';
import { Rng } from './rng.js';

export const DEF_STOPS = [0, 10, 15, 20, 25, 30, 40, 50, 75];
export const ZCB_BELOWS = [0, 300, 400, 450, 500, 600, 800];

/** Play setups on raids [from, to) (seeds `<seed>#i`). cfg: {players: [plan], defStop, zcbBelow}; base: [{name, gear}];
 *  opts: {heals, exactHeals}. Returns per setup {totals, split: {toScreech, kill}, defEnd}. */
export function evalXarpus(configs, base, team, from, to, seed, opts = {}) {
  return configs.map((cfg) => {
    const players = base.map((b, k) => ({ ...b, ...cfg.players[k] }));
    const totals = [], split = { toScreech: [], kill: [] }, defEnd = [];
    for (let i = from; i < to; i++) {
      const r = runXarpus(players, team, new Rng(`${seed}#${i}`), null, { ...opts, defStop: cfg.defStop, zcbBelow: cfg.zcbBelow });
      if (r.end == null) { totals.push(99999); continue; }
      totals.push(r.end); defEnd.push(r.defEnd);
      const drop = r.dropAt ?? r.end; split.toScreech.push(drop); split.kill.push(r.end - drop);
    }
    return { totals, split, defEnd };
  });
}

const sorted = (a) => a.slice().sort((x, y) => x - y);
const med = (v) => v[Math.floor(v.length / 2)];
const q10 = (v) => v[Math.max(0, Math.floor(v.length * 0.1) - 1)];
export function scoreOf(totals, bps = []) {
  const v = sorted(totals), asc = [...bps].sort((a, b) => a - b);
  return [...asc.map((b) => -v.filter((t) => t * 0.6 <= b + 1e-9).length / v.length), med(v), q10(v)];
}
export const better = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i] - 1e-12) return true; if (a[i] > b[i] + 1e-12) return false; } return false; };
export const keyOf = (cfg) => JSON.stringify([cfg.players, cfg.defStop, cfg.zcbBelow]);

/** The changes the ticked options allow. ctx: {gear: [gear], allow: {def, backup, dps, fix, start, lb, surge, horn,
 *  defStop, zcbBelow}, surgeLimit, lbRings, swaps}. */
export function neighbours(cfg, ctx) {
  const out = [], P = cfg.players, seen = new Set([keyOf(cfg)]);
  const add = (patches, setPatch, what) => {
    const c = { ...cfg, ...setPatch, players: P.map((p, j) => (patches[j] ? { ...p, ...patches[j] } : p)), what };
    const k = keyOf(c); if (!seen.has(k)) { seen.add(k); out.push(c); }
  };
  const ok = (k, v) => canDo(ctx.gear[k], v) || (v === 'maul' && canDo(ctx.gear[k], 'bgs'));
  const surges = P.filter((p) => p.surge).length, lbs = P.filter((p) => p.lbCycles > 0).length;
  P.forEach((p, k) => {
    const N = `P${k + 1}`;
    if (ctx.allow.def) for (const [v, l] of DEF_SPECS) if (v !== p.def && ok(k, v)) add({ [k]: { def: v } }, null, `${N} Defence spec ${l}`);
    if (ctx.allow.backup) for (const [v, l] of DEF_SPECS) if (v !== p.backup && ok(k, v)) add({ [k]: { backup: v } }, null, `${N} backup ${l}`);
    if (ctx.allow.dps) for (const [v, l] of DPS_SPECS) if (v !== p.dps && ok(k, v)) add({ [k]: { dps: v } }, null, `${N} damage spec ${l}`);
    if (ctx.allow.fix) for (const [v, l] of FIXES) if (v !== p.fix && ok(k, v)) add({ [k]: { fix: v } }, null, `${N} tick fix ${l}`);
    if (ctx.allow.start) add({ [k]: { startSpec: p.startSpec === 95 ? 100 : 95 } }, null, `${N} start ${p.startSpec === 95 ? 100 : 95}%`);
    if (ctx.allow.lb) for (let c = 0; c <= 5; c++) if (c !== (p.lbCycles || 0) && (c === 0 || p.lbCycles > 0 || lbs < ctx.lbRings)) add({ [k]: { lbCycles: c } }, null, `${N} Lightbearer ${c}`);
    if (ctx.allow.surge && (p.surge || surges < ctx.surgeLimit)) add({ [k]: { surge: !p.surge } }, null, `${N} ${p.surge ? 'no surge' : 'surge'}`);
    if (ctx.allow.horn && ctx.gear[k].horn) add({ [k]: { horn: !p.horn } }, null, `${N} ${p.horn ? 'no horn' : 'horn'}`);
  });
  if (ctx.allow.defStop) for (const v of DEF_STOPS) if (v !== cfg.defStop) add({}, { defStop: v }, `Defence stop ${v}`);
  if (ctx.allow.zcbBelow) for (const v of ZCB_BELOWS) if (v !== cfg.zcbBelow) add({}, { zcbBelow: v }, `ZCB -> claws below ${v}`);
  if (ctx.swaps) P.forEach((a, i) => P.forEach((b, j) => {
    if (i >= j) return;
    if (ctx.allow.def && a.def !== b.def && ok(i, b.def) && ok(j, a.def)) add({ [i]: { def: b.def }, [j]: { def: a.def } }, null, `Defence specs P${i + 1} <-> P${j + 1}`);
    if (ctx.allow.dps && a.dps !== b.dps && ok(i, b.dps) && ok(j, a.dps)) add({ [i]: { dps: b.dps }, [j]: { dps: a.dps } }, null, `damage specs P${i + 1} <-> P${j + 1}`);
    if (ctx.allow.lb && (a.lbCycles || 0) !== (b.lbCycles || 0)) add({ [i]: { lbCycles: b.lbCycles || 0 }, [j]: { lbCycles: a.lbCycles || 0 } }, null, `Lightbearer P${i + 1} <-> P${j + 1}`);
    if (ctx.allow.surge && a.surge !== b.surge) add({ [i]: { surge: b.surge }, [j]: { surge: a.surge } }, null, `surge P${i + 1} <-> P${j + 1}`);
  }));
  return out;
}

/** ctx: {start: cfg, gear, allow, surgeLimit, lbRings, swaps, restarts: [cfg], bps, rounds, stages, finalRaids, top}.
 *  run(configs, from, to, seed) -> Promise<[{totals, split}]>. Returns [{cfg, score, totals, split}] best first. */
export async function solveXarpus(ctx, run, progress = () => {}, stopped = () => false) {
  const { bps = [], stages = [[60, 0.2], [240, 4], [1000, 1]], rounds = 8, finalRaids = 2000, top = 10 } = ctx;
  const seen = new Map();
  const note = (cfg, score, raids) => { const k = keyOf(cfg), o = seen.get(k); if (!o || raids >= o.raids) seen.set(k, { cfg, score, raids }); };
  const bigN = stages[stages.length - 1][0];
  const starts = [ctx.start, ...(ctx.restarts || [])];
  for (const [si0, st0] of starts.entries()) {
    if (stopped()) break;
    let cur = st0;
    if (si0) progress(`Restart ${si0}: from another starting setup`, 0);
    for (let round = 1; round <= rounds && !stopped(); round++) {
      let pool = neighbours(cur, ctx);
      const seed = `xround${round}`;
      for (let si = 0; si < stages.length && pool.length && !stopped(); si++) {
        const [n, keep] = stages[si];
        progress(`Round ${round}: trying ${pool.length} change${pool.length === 1 ? '' : 's'} on ${n.toLocaleString()} raids each`, (round - 1 + si / stages.length) / rounds);
        const res = await run(pool, 0, n, seed);
        const scored = pool.map((c, i) => ({ c, s: scoreOf(res[i].totals, bps) })).sort((a, b) => (better(a.s, b.s) ? -1 : better(b.s, a.s) ? 1 : 0));
        if (si === stages.length - 1) { scored.forEach((x) => note(x.c, x.s, n)); pool = scored.map((x) => x.c); break; }
        pool = scored.slice(0, keep < 1 ? Math.max(6, Math.ceil(pool.length * keep)) : keep).map((x) => x.c);
      }
      if (stopped() || !pool.length) break;
      const [cr] = await run([cur], 0, bigN, seed), cs = scoreOf(cr.totals, bps);
      note(cur, cs, bigN);
      const best = pool[0], bs = seen.get(keyOf(best)).score;
      if (!better(bs, cs)) { progress(`Round ${round}: no change beats the current setup - done`, 1); break; }
      cur = { ...best, what: undefined };
      progress(`Round ${round}: kept "${best.what}"`, round / rounds);
    }
  }
  const ranked = [...seen.values()].sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0)).slice(0, top);
  if (stopped() || !ranked.length) return [];
  progress(`Playing the top ${ranked.length} setups on ${finalRaids.toLocaleString()} raids each...`, 1);
  const res = await run(ranked.map((x) => x.cfg), 0, finalRaids, 'xfinal');
  return ranked.map((x, i) => ({ cfg: x.cfg, score: scoreOf(res[i].totals, bps), totals: res[i].totals, split: res[i].split, defEnd: res[i].defEnd }))
    .sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
}
