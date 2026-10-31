// Sotetseg Solver: searches each player's prefire, start spec (95 / 100), surge, Lightbearer cycles and specs per phase
// (None / Maul / Claws / ZCB, Backup, Horn), and the room entry instance, for the best room times.
//
// Search: start from the setup given. Each round, every single change to one player is a "neighbour"; neighbours are
// played on a few raids, the best on more, the best of those on many (successive halving, the same raids for each so
// they compare fairly), and the best is kept if it beats the current setup on those raids. Repeat until nothing
// improves (or the round limit). The best setups seen are then played at every entry instance and ranked.
// Ranking: with breakpoints, the share of raids finished by the fastest breakpoint (then the next ...), then the
// median; without, the median, then the top 25%, the top 10% and the mean.
import { runSote, hornN } from './sote.js';
import { Rng } from './rng.js';

export const SOLVE_PREFIRES = [['', null], ['Twisted bow', 'Twisted bow'], ['ZCB auto', 'Zaryte crossbow'], ['ZCB spec', 'Zaryte crossbow'],
  ['Shadow Barrage', 'Shadow ancient sceptre'], ["Tumeken's shadow", "Tumeken's shadow"]];
const SPEC_OPTS = ['none', 'maul', 'bgs', 'claws', 'zcb'];
const SPEC_NEEDS = { maul: ['Elder maul', 'Bandos godsword'], bgs: ['Bandos godsword'], claws: ['Dragon claws'], zcb: ['Zaryte crossbow'] };
/** What a P1 maul becomes if a Shadow Barrage prefire landed (see sote.js ifBarrage). */
export const IF_BARRAGE = ['zcb', 'claws', 'none'];

/** The players for a run: the fixed parts (gear, supplies, mazes) from `base`, the searched parts from `cfg`. */
export function playersOf(base, cfg) {
  return base.map((b, k) => ({ ...b, ...cfg.players[k], specs: cfg.players[k].specs.map((x) => ({ ...x })) }));
}

/** Play `configs` on raids [from, to) (seeds `<seed>#i`) entered on `entry`. Returns per config {totals, split}. */
export function evalConfigs(configs, base, team, from, to, seed, entry, opts = {}) {
  return configs.map((cfg) => {
    const players = playersOf(base, cfg), totals = [], split = { p1: [], maze1: [], p2: [], maze2: [], p3: [] }, events = {};
    for (let i = from; i < to; i++) {
      const r = runSote(players, team, new Rng(`${seed}#${i}`), null, { ...opts, entry });
      const ev = new Set(r.events || []);
      for (const x of r.specLog || []) { ev.add(`fired:${x.i}:${x.carried ? x.ph - 1 : x.ph}:${x.kind}`); if (x.carried) ev.add(`carried:${x.i}:${x.ph - 1}`); }   // the specs that went off (a carried ZCB: its planned phase, + carried)
      for (const e of ev) events[e] = (events[e] || 0) + 1;   // raids it happened in (the Adjustments counts)
      if (r.end == null || !r.split) { totals.push(9999); continue; }       // a wipe counts as very slow
      totals.push(r.end);
      for (const k of Object.keys(split)) split[k].push(r.split[k]);
    }
    return { totals, split, events };
  });
}

const sorted = (a) => a.slice().sort((x, y) => x - y);
const med = (v) => v[Math.floor(v.length / 2)];
const q10 = (v) => v[Math.max(0, Math.floor(v.length * 0.1) - 1)];
const q25 = (v) => v[Math.max(0, Math.floor(v.length * 0.25) - 1)];
/** Score (lower is better, compared item by item). bps: seconds. */
export function scoreOf(totals, bps = []) {
  const v = sorted(totals), asc = [...bps].sort((a, b) => a - b);
  // last: the mean (to 0.05 ticks), so a tie on median / top 25% / top 10% (0.6s steps) goes to the faster setup on average
  const mean = v.reduce((s, t) => s + t, 0) / (v.length || 1);
  return [...asc.map((b) => -v.filter((t) => t * 0.6 <= b + 1e-9).length / v.length), med(v), q25(v), q10(v), Math.round(mean * 20) / 20];
}
export const better = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i] - 1e-12) return true; if (a[i] > b[i] + 1e-12) return false; } return false; };
export const keyOf = (cfg) => JSON.stringify(cfg.players);

/** The changes the settings allow. ctx: {team, gear: [gear], allow: {prefire, start, surge, lb, specs}, surgeLimit,
 *  lbRings, swaps, pairs}. Always: every single change to one player. swaps: move a surge / Lightbearer from one player to
 *  another, and swap two players' specs in a phase. pairs: two players' specs in a phase changed together. */
export function neighbours(cfg, ctx) {
  const out = [], P = cfg.players, seen = new Set([keyOf(cfg)]);
  const own = (k, w) => (ctx.gear[k].weapons || []).includes(w);
  /** The spec choices a player can make (BGS as its own choice only if they also have a maul - otherwise Maul is it). */
  const specOk = (k, s) => s === 'none' || (s === 'bgs' ? own(k, 'Bandos godsword') && own(k, 'Elder maul') : (SPEC_NEEDS[s] || []).some((w) => own(k, w)));
  const many = (patches, what) => {                                  // patches: {player index: patch}
    const players = P.map((p, j) => (patches[j] ? { ...p, ...patches[j], specs: (patches[j].specs || p.specs).map((x) => ({ ...x })) } : p));
    const c = { entry: cfg.entry, players, what }, k = keyOf(c);
    if (!seen.has(k)) { seen.add(k); out.push(c); }
  };
  const push = (k, patch, what) => many({ [k]: patch }, what);
  const withSpec = (p, ph, o) => p.specs.map((x, j) => (j === ph ? { ...x, ...o } : x));
  const surges = P.filter((p) => p.surge).length, lbs = P.filter((p) => p.lbCycles > 0).length;
  const barrager = (k) => own(k, 'Shadow ancient sceptre') && ctx.allow.prefire;
  const barragePossible = P.some((q, k) => q.prefire === 'Shadow Barrage' || barrager(k));
  const altOk = (k, alt) => alt === 'none' || own(k, alt === 'zcb' ? 'Zaryte crossbow' : 'Dragon claws');
  P.forEach((p, k) => {
    if (ctx.allow.prefire) for (const [v, need] of SOLVE_PREFIRES) if (v !== p.prefire && (!need || own(k, need))) push(k, { prefire: v }, `P${k + 1} prefire ${v || 'none'}`);
    if (ctx.allow.start) push(k, { startSpec: p.startSpec === 95 ? 100 : 95 }, `P${k + 1} start ${p.startSpec === 95 ? 100 : 95}%`);
    if (ctx.allow.surge && (p.surge || surges < ctx.surgeLimit)) push(k, { surge: !p.surge }, `P${k + 1} ${p.surge ? 'no surge' : 'surge'}`);
    if (ctx.allow.lb) for (let c = 0; c <= 5; c++) if (c !== p.lbCycles && (c === 0 || p.lbCycles > 0 || lbs < ctx.lbRings)) push(k, { lbCycles: c }, `P${k + 1} Lightbearer ${c}`);
    if (ctx.allow.specs) for (let ph = 0; ph < 3; ph++) {
      const cur = p.specs[ph];
      for (const s of SPEC_OPTS) for (const backup of [false, true]) {
        if (!specOk(k, s)) continue;
        if (s === 'none' && backup && !SPEC_NEEDS.maul.some((w) => own(k, w))) continue;
        if (s === cur.spec && backup === !!cur.backup) continue;
        const specs = p.specs.map((x, j) => (j === ph ? { ...x, spec: s, backup, ifBarrage: undefined, ...(backup ? {} : { backups: undefined }) } : x));
        push(k, { specs }, `P${k + 1} P${ph + 1} ${backup ? 'backup ' : ''}${s}`);
      }
      // P1 maul -> 'maul, or a damage spec if the Barrage landed' (only with a Shadow Barrage in the team, or one possible)
      if (ph === 0 && barragePossible && (cur.spec === 'maul' || cur.spec === 'bgs') && !cur.backup) {
        for (const alt of IF_BARRAGE) if (alt !== cur.ifBarrage && altOk(k, alt)) push(k, { specs: withSpec(p, 0, { ifBarrage: alt }) }, `P${k + 1} P1 ${cur.spec}, ${alt === 'none' ? 'no spec' : alt} if the Barrage lands`);
        if (cur.ifBarrage) push(k, { specs: withSpec(p, 0, { ifBarrage: undefined }) }, `P${k + 1} P1 ${cur.spec} always`);
      }
      if (cur.backup) push(k, { specs: withSpec(p, ph, { backups: Number(cur.backups) === 2 ? undefined : 2 }) }, `P${k + 1} P${ph + 1} backup ${Number(cur.backups) === 2 ? '1 try' : 'up to 2 tries'}`);
      if (ctx.gear[k].horn) for (const n of [0, 1, 2]) if (n !== hornN(cur)) push(k, { specs: withSpec(p, ph, { horn: n === 2 ? 2 : n === 1 }) }, `P${k + 1} P${ph + 1} ${n ? `horn ${n} maul${n > 1 ? 's' : ''}` : 'no horn'}`);
    }
  });
  // a Shadow Barrage prefire and another player's P1 maul turning conditional, together (neither pays off alone)
  if (ctx.allow.prefire && ctx.allow.specs) P.forEach((a, k) => {
    if (!barrager(k) || a.prefire === 'Shadow Barrage') return;
    P.forEach((b, j) => {
      const x = b.specs[0];
      if (j === k || !(x.spec === 'maul' || x.spec === 'bgs') || x.backup || x.ifBarrage) return;
      for (const alt of IF_BARRAGE) if (altOk(j, alt)) many({ [k]: { prefire: 'Shadow Barrage' }, [j]: { specs: withSpec(b, 0, { ifBarrage: alt }) } }, `P${k + 1} prefire Shadow Barrage + P${j + 1} P1 ${x.spec}, ${alt === 'none' ? 'no spec' : alt} if it lands`);
    });
  });
  // the other way: drop the Barrage prefire and every maul waiting on it, together
  if (ctx.allow.prefire && P.some((q) => q.specs[0].ifBarrage)) P.forEach((a, k) => {
    if (a.prefire !== 'Shadow Barrage') return;
    for (const [v, need] of SOLVE_PREFIRES) {
      if (v === 'Shadow Barrage' || (need && !own(k, need))) continue;
      const patches = {}; P.forEach((q, j) => { if (q.specs[0].ifBarrage) patches[j] = { specs: withSpec(q, 0, { ifBarrage: undefined }) }; });
      patches[k] = { ...(patches[k] || {}), prefire: v };
      many(patches, `P${k + 1} prefire ${v || 'none'} (no Barrage) + every P1 maul always`);
    }
  });
  // a surge + a spec it pays for (+ Lightbearer cycles for more regen), together: none of them pays off alone
  if (ctx.allow.surge && ctx.allow.specs && surges < ctx.surgeLimit) P.forEach((p, k) => {
    if (p.surge) return;
    const lbOpts = [p.lbCycles, ...(ctx.allow.lb && (p.lbCycles > 0 || lbs < ctx.lbRings) ? [2, 3] : [])].filter((c, i, a) => a.indexOf(c) === i);
    for (let ph = 0; ph < 3; ph++) {
      if (p.specs[ph].spec !== 'none' || p.specs[ph].backup) continue;
      for (const s of SPEC_OPTS) {
        if (s === 'none' || !specOk(k, s)) continue;
        for (const c of lbOpts) push(k, { surge: true, lbCycles: c, specs: withSpec(p, ph, { spec: s, backup: false, ifBarrage: undefined }) }, `P${k + 1} surge + P${ph + 1} ${s}${c !== p.lbCycles ? ` + Lightbearer ${c}` : ''}`);
      }
    }
  });
  if (ctx.swaps) {
    P.forEach((a, i) => P.forEach((b, j) => {
      if (i === j) return;
      if (ctx.allow.surge && a.surge && !b.surge) many({ [i]: { surge: false }, [j]: { surge: true } }, `surge P${i + 1} -> P${j + 1}`);
      if (ctx.allow.lb && a.lbCycles > 0 && !(b.lbCycles > 0)) many({ [i]: { lbCycles: 0 }, [j]: { lbCycles: a.lbCycles } }, `Lightbearer P${i + 1} -> P${j + 1}`);
      if (ctx.allow.specs && i < j) for (let ph = 0; ph < 3; ph++) {
        const x = a.specs[ph], y = b.specs[ph];
        if (x.spec === y.spec && !!x.backup === !!y.backup) continue;
        if (!specOk(j, x.spec) || !specOk(i, y.spec)) continue;
        many({ [i]: { specs: withSpec(a, ph, { spec: y.spec, backup: !!y.backup, ifBarrage: y.ifBarrage, backups: y.backups }) }, [j]: { specs: withSpec(b, ph, { spec: x.spec, backup: !!x.backup, ifBarrage: x.ifBarrage, backups: x.backups }) } }, `P${ph + 1} specs P${i + 1} <-> P${j + 1}`);
      }
    }));
  }
  if (ctx.pairs && ctx.allow.specs) {
    for (let ph = 0; ph < 3; ph++) for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      for (const s1 of SPEC_OPTS) for (const s2 of SPEC_OPTS) {
        if (s1 === P[i].specs[ph].spec || s2 === P[j].specs[ph].spec || !specOk(i, s1) || !specOk(j, s2)) continue;   // both change
        many({ [i]: { specs: withSpec(P[i], ph, { spec: s1 }) }, [j]: { specs: withSpec(P[j], ph, { spec: s2 }) } }, `P${ph + 1}: P${i + 1} ${s1} + P${j + 1} ${s2}`);
      }
    }
  }
  return out;
}

/** A copy of cfg without the planned specs and horns that (almost) never went off in `events` (fired:i:ph:kind counts), or null. */
export function pruneUnfired(cfg, events, raids = 0) {
  const min = Math.max(1, raids * 0.01);   // went off in under 1% of raids: as good as never (kept only if it scores better)
  const fired = (i, ph, kind) => Object.entries(events).reduce((n, [e, v]) => { const [f, a, b, c] = e.split(':'); return n + (f === 'fired' && +a === i && +b === ph && (kind ? c === kind : c !== 'horn' && c !== 'halberd') ? v : 0); }, 0) >= min;
  let changed = false;
  const players = cfg.players.map((p, i) => ({ ...p, specs: p.specs.map((x, ph) => {
    let y = x;
    if (y.horn && !fired(i, ph, 'horn')) { y = { ...y, horn: false }; changed = true; }
    if (Number(y.backups) === 2 && !(events[`backup2:${i}:${ph}`] >= min)) { y = { ...y, backups: undefined }; changed = true; }   // a second backup try that (almost) never happens
    if ((y.spec !== 'none' || y.backup) && !fired(i, ph)) { y = { ...y, spec: 'none', backup: false, ifBarrage: undefined, backups: undefined }; changed = true; }   // nothing went off (a backup too)
    else if (y.backup && (y.spec === 'zcb' || y.spec === 'claws') && !fired(i, ph, 'zcb') && !fired(i, ph, 'claws')) { y = { ...y, spec: 'none' }; changed = true; }   // a backup whose damage spec never went off
    return y;
  }) }));
  return changed ? { ...cfg, players } : null;
}

/**
 * The search. ctx: {team, base (fixed player parts), start (cfg: {entry, players: [{prefire, startSpec, surge, lbCycles,
 * specs}]}), gear, allow, surgeLimit, lbRings, bps, solveEntry, rounds, stages: [[raids, keep], ...], finalRaids, top}.
 * run(configs, from, to, seed, entry) -> Promise<[{totals, split}]>. progress(text, fraction). Returns the top setups:
 * [{cfg, entry, score, totals, split, byEntry}].
 */
export async function solveSote(ctx, run, progress = () => {}, stopped = () => false) {
  const { bps = [], stages = [[60, 0.2], [240, 4], [1000, 1]], rounds = 8, finalRaids = 2000, top = 10 } = ctx;
  const seen = new Map();                                            // key -> {cfg, score, raids}
  const note = (cfg, score, raids) => { const k = keyOf(cfg), o = seen.get(k); if (!o || raids >= o.raids) seen.set(k, { cfg, score, raids }); };
  let cur = { entry: ctx.start.entry ?? 0, players: ctx.start.players };
  // the entry instance to search on: the start setup's best
  if (ctx.solveEntry) {
    progress('Finding the entry instance to search on...', 0);
    const rs = await Promise.all([0, 1, 2, 3].map((e) => run([cur], 0, 300, 'entry', e)));
    let best = 0; for (let e = 1; e < 4; e++) if (better(scoreOf(rs[e][0].totals, bps), scoreOf(rs[best][0].totals, bps))) best = e;
    cur = { ...cur, entry: best };
  }
  const bigN = stages[stages.length - 1][0];
  const starts = [cur, ...(ctx.restarts || []).map((x) => ({ entry: cur.entry, players: x.players }))];   // restarts: other starting setups
  for (const [si0, st0] of starts.entries()) {
  if (stopped()) break;
  cur = st0;
  if (si0) progress(`Restart ${si0}: from another starting setup`, 0);
  for (let round = 1; round <= rounds && !stopped(); round++) {
    let cands = neighbours(cur, ctx).map((c) => ({ ...c, entry: cur.entry }));
    const seed = `round${round}`;
    let pool = cands;
    for (let si = 0; si < stages.length && pool.length && !stopped(); si++) {
      const [n, keep] = stages[si];
      progress(`Round ${round}: trying ${pool.length} change${pool.length === 1 ? '' : 's'} on ${n.toLocaleString()} raids each`, (round - 1 + si / stages.length) / rounds);
      const res = await run(pool, 0, n, seed, cur.entry);
      const scored = pool.map((c, i) => ({ c, s: scoreOf(res[i].totals, bps) })).sort((a, b) => (better(a.s, b.s) ? -1 : better(b.s, a.s) ? 1 : 0));
      if (si === stages.length - 1) { scored.forEach((x) => note(x.c, x.s, n)); pool = scored.map((x) => x.c); break; }
      const k = keep < 1 ? Math.max(6, Math.ceil(pool.length * keep)) : keep;
      pool = scored.slice(0, k).map((x) => x.c);
    }
    if (stopped() || !pool.length) break;
    const [curRes] = await run([cur], 0, bigN, seed, cur.entry), curScore = scoreOf(curRes.totals, bps);
    note(cur, curScore, bigN);
    const bestC = pool[0], bestS = seen.get(keyOf(bestC)).score;
    if (!better(bestS, curScore)) { progress(`Round ${round}: no change beats the current setup - done`, 1); break; }
    cur = { entry: cur.entry, players: bestC.players, what: [...(cur.what || []), bestC.what] };
    progress(`Round ${round}: kept "${bestC.what}"`, round / rounds);
  }
  }
  // the best setups seen, played at every entry instance (or the one searched on) and ranked
  const ranked = [...seen.values()].sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0)).slice(0, top);
  const entries = ctx.solveEntry ? [0, 1, 2, 3] : [starts[0].entry];
  const out = [];
  for (const [i, x] of ranked.entries()) {
    if (stopped()) break;
    progress(`Checking the top setups at ${entries.length > 1 ? 'every entry instance' : 'the entry instance'}: ${i + 1} / ${ranked.length}`, 1);
    const rs = await Promise.all(entries.map((e) => run([x.cfg], 0, finalRaids, 'final', e)));
    const byEntry = entries.map((e, j) => ({ entry: e, score: scoreOf(rs[j][0].totals, bps), totals: rs[j][0].totals, split: rs[j][0].split, events: rs[j][0].events || {} }));
    let b = byEntry.reduce((m, y) => (better(y.score, m.score) ? y : m)), cfg = x.cfg;
    // planned specs / horns that never went off (no spec for them in time) come out - played again to be sure
    const pruned = pruneUnfired(cfg, b.events, b.totals.length);
    if (pruned) {
      const [r2] = await run([pruned], 0, finalRaids, 'final', b.entry), s2 = scoreOf(r2.totals, bps);
      if (!better(b.score, s2)) { cfg = pruned; b = { ...b, score: s2, totals: r2.totals, split: r2.split, events: r2.events || {} }; }
    }
    // the fewest Lightbearer cycles that do as well: one less at a time, kept while it scores no worse (a cycle more
    // than needed only keeps them off Ultor - the search can land on one by noise)
    for (let k = 0; k < cfg.players.length && !stopped(); k++) {
      while (cfg.players[k].lbCycles > 0) {
        const fewer = { ...cfg, players: cfg.players.map((p, j) => (j === k ? { ...p, lbCycles: p.lbCycles - 1 } : p)) };
        const [r2] = await run([fewer], 0, finalRaids, 'final', b.entry), s2 = scoreOf(r2.totals, bps);
        if (better(b.score, s2)) break;
        cfg = fewer; b = { ...b, score: s2, totals: r2.totals, split: r2.split, events: r2.events || {} };
      }
    }
    out.push({ cfg, entry: b.entry, score: b.score, totals: b.totals, split: b.split, events: b.events, byEntry: byEntry.map((y) => ({ entry: y.entry, median: med(sorted(y.totals)) })) });
  }
  return out.sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
}
