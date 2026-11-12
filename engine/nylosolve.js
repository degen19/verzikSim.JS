// Nylocas Solver (3s-5s): searches each player's opening spec (none / BGS / claws / halberd), their damage specs in order
// (claws, tome, ZCB, halberd - one or two, either order), start spec (95 / 100) and surges (up to the room's limit), and a backup BGS
// (who, and the Defence it goes at or above: 10-50) - for the best boss times (his spawn to the room's end).
// Search as the Xarpus Solver: each round every single change (with Role changes: a player's opener and damage specs
// together; with Swaps: two players' openers / damage specs swapped, a surge moved) is played on a few raids, the best on
// more, the best of those on many (the same raids for each), and the best is kept if it beats the current setup.
// Ranked by the share of raids at your breakpoints (if any), then the mean boss time, then the top 10%.
// Then, for the best setup: each player's Twisted-bows-only thresholds for his green forms (ranged tick fix: 4 hits +
// bow / bow, hit, bow / 3 hits + bow, by the boss HP) - rangedThresholds.
import { canonKeyOf } from './symmetry.js';
import { pruneSurges } from './solvecheck.js';
import { runNylo, NEEDS, FAST, fastWeaponOf } from './nylo.js';
import { Rng } from './rng.js';

export const OPENS = [['none', 'None'], ['bgs', 'BGS'], ['claw', 'Claws'], ['halb', 'Halberd']];
const ONE = ['claw', 'tome', 'zcb', 'halb'];
/** Damage spec sequences: none, one, or two in order. */
export const SEQS = [[], ...ONE.map((x) => [x]), ...ONE.flatMap((a) => ONE.map((b) => [a, b]))];
export const SPEC_NAME = { claw: 'claws', tome: 'tome', zcb: 'ZCB', halb: 'halberd', bgs: 'BGS', none: 'none' };
export const seqName = (s) => (s.length ? s.map((x) => SPEC_NAME[x]).join(' → ') : 'none');
export const BACKUP_ATS = [10, 20, 30, 40, 50];
export const STOP_PCTS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
export const PLAN_NAMES = { 1: '4bp tbow', 2: 'tbow bp tbow', 3: '3bp tbow' };   // bp: their 2-tick hit (blowpipe, crossbows or darts)
const SHORT = { 'Toxic blowpipe': 'bp', 'Ascension crossbows': 'crossbow', 'Dragon dart': 'dart' };
/** A player's green-form sequences in words, by the tick of their first attack (1: N2, 2: N3, 3: N4) - with their own
 *  2-tick weapon; darts only: tbow dart tbow from N2 or N3, Twisted bows from N4 (no sequence - no threshold). */
export function planLabel(k, weapon) {
  const w = SHORT[weapon] || 'bp';
  if (w === 'dart') return k === 3 ? null : `tbow dart tbow (from N${k + 1})`;
  return { 1: `4${w} tbow`, 2: `tbow ${w} tbow`, 3: `3${w} tbow` }[k];
}
/** When to stop each sequence (Twisted bows only below that % of his HP), in words: [{label, text}] per sequence.
 *  row: a rangedThresholds row (best: {k: pct | null} - null: no threshold clearly faster than going on) - or, with no
 *  row, the setup's own rangedStop. */
export function stopLines(p, weapon, row = null) {
  return [1, 2, 3].map((k) => {
    const label = planLabel(k, weapon);
    if (!label) return null;
    const pct = row ? row.best[k] : (p.rangedStop || {})[k];
    const text = pct != null ? `stop at ${pct}%`
      : row ? 'thresholds make no difference - stop at your own preference' : 'not tested (as set: go on till he\'s dead)';
    return { label, text };
  }).filter(Boolean);
}

const has = (gear, x) => (gear.weapons || []).includes(NEEDS[x]);
export const canSeq = (gear, seq) => seq.every((x) => has(gear, x));
export const canOpen = (gear, v) => v === 'none' || has(gear, v);
/** The default plan for a player: no opener, claws if they have them. */
export const defaultPlan = (gear) => ({ open: 'none', specs: has(gear, 'claw') ? ['claw'] : [], clawMode: 'gain', startSpec: 100, surge: false, tomeTickFix: true });
export const keyOf = (cfg) => JSON.stringify([cfg.players.map((p) => [p.open, p.specs, p.startSpec, !!p.surge, p.rangedStop || null]), cfg.backup || null]);
/** Spec each costs. */
export const SPEC_COST = { bgs: 50, claw: 50, halb: 30, zcb: 75, tome: 50 };
const MELEE_SPECS = new Set(['claw', 'halb']);
/** A plan as players would do it: a melee spec (claws / halberd) in their damage specs with no opener is their opener (a
 *  scythe, then the halberd later makes no sense: they'd halberd first); claws are always 'for a tick' (the default). */
export function canonPlan(p) {
  const out = { ...p, specs: [...(p.specs || [])], clawMode: 'gain' };
  if (out.open === 'none') { const i = out.specs.findIndex((x) => MELEE_SPECS.has(x)); if (i >= 0) { out.open = out.specs[i]; out.specs.splice(i, 1); } }
  return out;
}
/** Spec a raid can give them on top of their start: a surge, and one regen (his ~40-60s). */
export const REGEN_ALLOW = 10;
/** Can they have the spec for every spec in their plan (opener + damage specs)? */
export const feasible = (p) => [p.open, ...(p.specs || [])].reduce((a, x) => a + (SPEC_COST[x] || 0), 0) <= (p.startSpec === 95 ? 95 : 100) + (p.surge ? 25 : 0) + REGEN_ALLOW;

/** Play setups on raids [from, to) (seeds `<seed>#i`). base: [{name, gear}]. -> per setup {totals (boss time, ticks), kills}. */
export function evalNylo(configs, base, team, from, to, seed, opts = {}) {
  return configs.map((cfg) => {
    const players = base.map((b, k) => ({ ...b, plan: cfg.players[k] }));
    const totals = [], kills = [];
    for (let i = from; i < to; i++) {
      const r = runNylo(players, team, new Rng(`${seed}#${i}`), { ...opts, plans: { backup: cfg.backup } });
      totals.push(r.end == null ? 99999 : r.end - r.i1); kills.push(r.kill == null ? 99999 : r.kill - r.i1);
    }
    return { totals, kills };
  });
}

const sorted = (a) => a.slice().sort((x, y) => x - y);
const q10 = (v) => v[Math.max(0, Math.floor(v.length * 0.1) - 1)];
/** Score (lower is better): -share at each breakpoint (fastest first), the mean boss time, the top 10%. */
export function scoreOf(totals, bps = []) {
  const v = sorted(totals), asc = [...bps].sort((a, b) => a - b);
  return [...asc.map((b) => -v.filter((t) => t * 0.6 <= b + 1e-9).length / v.length), v.reduce((a, b) => a + b, 0) / v.length, q10(v)];
}
export const better = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i] - 1e-9) return true; if (a[i] > b[i] + 1e-9) return false; } return false; };

/** The single changes allowed. ctx: {gear: [gear], allow: {open, specs, start, surge, backup}, surgeLimit, swaps, roles}. */
export function neighbours(cfg, ctx) {
  // players identical in every input (ctx.groups): a change that only trades their plans is the same setup - one key
  const K = ctx.groups ? (ctx.canonKey ||= canonKeyOf('nylo', keyOf, ctx.groups)) : keyOf;
  const out = [], P = cfg.players, seen = new Set([K(cfg)]);
  const add = (patches, setPatch, what) => {
    const c = { ...cfg, ...setPatch, players: P.map((p, j) => (patches[j] ? canonPlan({ ...p, ...patches[j] }) : p)), what };
    if (!c.players.every(feasible)) return;                       // a spec they'd never have the spec for
    const k = K(c); if (!seen.has(k)) { seen.add(k); out.push(c); }
  };
  const g = ctx.gear, A = ctx.allow, surges = P.filter((p) => p.surge).length;
  P.forEach((p, k) => {
    const N = `P${k + 1}`;
    // (each with the other start spec too: a halberd opener can pay only from a 95% start - its regen right after)
    const flip = p.startSpec === 95 ? 100 : 95;
    if (A.open) for (const [v, l] of OPENS) if (v !== p.open && canOpen(g[k], v)) { add({ [k]: { open: v } }, null, `${N} opens ${l}`); if (A.start) add({ [k]: { open: v, startSpec: flip } }, null, `${N} opens ${l}, start ${flip}%`); }
    if (A.specs) for (const s of SEQS) if (JSON.stringify(s) !== JSON.stringify(p.specs) && canSeq(g[k], s)) { add({ [k]: { specs: s } }, null, `${N} damage specs ${seqName(s)}`); if (A.start) add({ [k]: { specs: s, startSpec: flip } }, null, `${N} damage specs ${seqName(s)}, start ${flip}%`); }
    if (A.start) add({ [k]: { startSpec: p.startSpec === 95 ? 100 : 95 } }, null, `${N} start ${p.startSpec === 95 ? 100 : 95}%`);
    if (A.surge && (p.surge || surges < ctx.surgeLimit)) add({ [k]: { surge: !p.surge } }, null, `${N} ${p.surge ? 'no surge' : 'surge'}`);
    // a surge and a spec it pays for, together (neither pays off alone: a claw on top of a ZCB needs the surge)
    if (A.surge && !p.surge && surges < ctx.surgeLimit) {
      if (A.open) for (const [v, l] of OPENS) if (v !== p.open && canOpen(g[k], v)) add({ [k]: { open: v, surge: true } }, null, `${N} surge, opens ${l}`);
      if (A.specs) for (const s of SEQS) if (JSON.stringify(s) !== JSON.stringify(p.specs) && canSeq(g[k], s)) add({ [k]: { specs: s, surge: true } }, null, `${N} surge, damage specs ${seqName(s)}`);
    }
    if (A.backup && has(g[k], 'bgs')) for (const at of BACKUP_ATS) if (!cfg.backup || cfg.backup.p !== k || cfg.backup.at !== at) add({}, { backup: { p: k, at } }, `backup BGS: ${N} at Defence ${at}+`);
  });
  if (A.backup && cfg.backup) add({}, { backup: null }, 'no backup BGS');
  if (ctx.roles) P.forEach((p, k) => {
    if (!A.open || !A.specs) return;
    for (const [v] of OPENS) if (canOpen(g[k], v)) for (const s of SEQS) if (canSeq(g[k], s) && v !== p.open && JSON.stringify(s) !== JSON.stringify(p.specs)) add({ [k]: { open: v, specs: s } }, null, `P${k + 1} role: opens ${SPEC_NAME[v]}, then ${seqName(s)}`);
  });
  if (ctx.swaps) P.forEach((a, i) => P.forEach((b, j) => {
    if (i >= j) return;
    if (A.open && a.open !== b.open && canOpen(g[i], b.open) && canOpen(g[j], a.open)) add({ [i]: { open: b.open }, [j]: { open: a.open } }, null, `openers P${i + 1} <-> P${j + 1}`);
    if (A.specs && JSON.stringify(a.specs) !== JSON.stringify(b.specs) && canSeq(g[i], b.specs) && canSeq(g[j], a.specs)) add({ [i]: { specs: b.specs }, [j]: { specs: a.specs } }, null, `damage specs P${i + 1} <-> P${j + 1}`);
    if (A.surge && !!a.surge !== !!b.surge) add({ [i]: { surge: !!b.surge }, [j]: { surge: !!a.surge } }, null, `surge P${i + 1} <-> P${j + 1}`);
  }));
  return out;
}

/** ctx: {start: cfg, gear, allow, surgeLimit, swaps, roles, restarts: [cfg], bps, rounds, stages, finalRaids, top}.
 *  run(configs, from, to, seed) -> Promise<[{totals, kills}]>. Returns [{cfg, score, totals, kills}] best first. */
export async function solveNylo(ctx, run, progress = () => {}, stopped = () => false) {
  const { bps = [], stages = [[60, 0.2], [240, 4], [1000, 1]], rounds = 8, finalRaids = 2000, top = 10 } = ctx;
  // progress: most searches settle in about half their rounds - counted as that many until they go on longer (the bar
  // then waits for them to catch up)
  const D = (round) => Math.min(rounds, Math.max(Math.ceil(rounds / 2), round + 1));
  const seen = new Map();
  const note = (cfg, score, raids) => { const k = keyOf(cfg), o = seen.get(k); if (!o || raids >= o.raids) seen.set(k, { cfg, score, raids }); };
  const bigN = stages[stages.length - 1][0];
  // progress: the search (each start setup an equal share) is the first 80%, the final checks the rest
  const nStarts = 1 + (ctx.restarts || []).length, sf = (si0, f) => 0.8 * (si0 + f) / nStarts;
  for (const [si0, st0] of [ctx.start, ...(ctx.restarts || [])].entries()) {
    if (stopped()) break;
    let cur = { ...st0, players: st0.players.map(canonPlan) };
    // a start they couldn't afford: trim its damage specs from the end until they can
    cur.players = cur.players.map((p) => { const q = { ...p, specs: [...p.specs] }; while (!feasible(q) && q.specs.length) q.specs.pop(); if (!feasible(q)) q.open = 'none'; return q; });
    if (si0) progress(`Restart ${si0}: from another starting setup`, sf(si0, 0));
    for (let round = 1; round <= rounds && !stopped(); round++) {
      let pool = neighbours(cur, ctx);
      const seed = `nround${round}`;
      for (let si = 0; si < stages.length && pool.length && !stopped(); si++) {
        const [n, keep] = stages[si];
        progress(`Round ${round}: trying ${pool.length} change${pool.length === 1 ? '' : 's'} on ${n.toLocaleString()} raids each`, sf(si0, (round - 1 + si / stages.length) / D(round)), sf(si0, (round - 1 + (si + 1) / stages.length) / D(round)));
        const res = await run(pool, 0, n, seed);
        const scored = pool.map((c, i) => ({ c, s: scoreOf(res[i].totals, bps) })).sort((a, b) => (better(a.s, b.s) ? -1 : better(b.s, a.s) ? 1 : 0));
        if (si === stages.length - 1) { scored.forEach((x) => note(x.c, x.s, n)); pool = scored.map((x) => x.c); break; }
        pool = scored.slice(0, keep < 1 ? Math.max(6, Math.ceil(pool.length * keep)) : keep).map((x) => x.c);
      }
      if (stopped() || !pool.length) break;
      const [cr] = await run([cur], 0, bigN, seed), cs = scoreOf(cr.totals, bps);
      note(cur, cs, bigN);
      const best = pool[0], bs = seen.get(keyOf(best)).score;
      if (!better(bs, cs)) { progress(`Round ${round}: no change beats the current setup - done`, sf(si0, 1)); break; }
      cur = { ...best, what: undefined };
      progress(`Round ${round}: kept "${best.what}"`, sf(si0, round / D(round)));
    }
  }
  const ranked = [...seen.values()].sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0)).slice(0, top);
  if (stopped() || !ranked.length) return [];
  progress(`Playing the top ${ranked.length} setups on ${finalRaids.toLocaleString()} raids each...`, 0.8);
  const res = await run(ranked.map((x) => x.cfg), 0, finalRaids, 'nfinal');
  const outv = ranked.map((x, i) => ({ cfg: x.cfg, score: scoreOf(res[i].totals, bps), totals: res[i].totals, kills: res[i].kills }))
    .sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
  if (ctx.allow.surge && !stopped()) for (let i = 0; i < Math.min(3, outv.length); i++) {   // surges that pay for nothing come out
    progress(`Taking out surges that pay for nothing: setup ${i + 1}`, 0.85 + 0.03 * i);
    const p = await pruneSurges(outv[i], async (c) => { const [r] = await run([c], 0, finalRaids, 'nfinal'); return { totals: r.totals, kills: r.kills }; }, (t) => scoreOf(t, bps), (c, k) => { const q = { ...c.players[k], specs: [...c.players[k].specs] }; while (!feasible(q) && q.specs.length) q.specs.pop(); if (!feasible(q)) q.open = 'none'; return { ...c, players: c.players.map((p, j) => (j === k ? canonPlan(q) : p)) }; }, stopped);   // (without the surge: the specs it paid for trimmed from the end)
    if (p !== outv[i]) outv[i] = p;
  }
  if (ctx.allow.start && !stopped()) { const p = await polishStarts(outv[0], run, finalRaids, 'nfinal', bps, (c) => c.players.every(feasible), (t) => progress(t, 0.95)); if (p !== outv[0]) outv.unshift(p); }
  // setups that play out the same on every raid (e.g. a second spec that never goes off) are one: the first kept
  const same = new Set();
  return outv.filter((r) => { const k = r.totals.join(','); if (same.has(k)) return false; same.add(k); return true; });
}

/** Each player's Twisted-bows-only thresholds for a setup: for each ranged plan (1: 4 hits + bow, 2: bow, hit, bow,
 *  3: 3 hits + bow) and each threshold (STOP_PCTS: below that % of his HP they bow only), the change in mean boss time
 *  against never switching, on the same raids (one player and one plan at a time). Players without a 2-tick ranged
 *  weapon are skipped. -> [{p, weapon, plans: {k: [{pct, d, ci}]}, best: {k: pct | null}}]. */
export async function rangedThresholds(cfg, gear, run, n, progress = () => {}, stopped = () => false) {
  const seed = 'nthr', [base] = await run([cfg], 0, n, seed), bt = base.totals, out = [];
  for (let k = 0; k < cfg.players.length && !stopped(); k++) {
    const w = fastWeaponOf(gear[k]);   // (the one they'd use: the hardest-hitting)
    if (!w) continue;
    const row = { p: k, weapon: w, plans: {}, best: {} };
    for (const plan of [1, 2, 3]) {
      progress(`Ranged tick fix thresholds: P${k + 1}, ${PLAN_NAMES[plan]}`, (k * 3 + plan - 1) / (cfg.players.length * 3));
      const cfgs = STOP_PCTS.map((pct) => ({ ...cfg, players: cfg.players.map((p, j) => (j === k ? { ...p, rangedStop: { ...(p.rangedStop || {}), [plan]: pct } } : p)) }));
      const res = await run(cfgs, 0, n, seed);
      row.plans[plan] = STOP_PCTS.map((pct, i) => {
        const d = res[i].totals.map((x, r) => x - bt[r]), m = d.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
        return { pct, d: m, ci: 1.96 * sd / Math.sqrt(n) };
      });
      const b = row.plans[plan].reduce((a, x) => (x.d < a.d ? x : a), { pct: null, d: 0, ci: 0 });
      row.best[plan] = b.pct != null && b.d < -b.ci ? b.pct : null;            // only if it's clearly faster
    }
    out.push(row);
  }
  return out;
}

/** Cross praying: each player's prediction by his HP for a setup. For each form he's in (melee, magic, ranged) and each
 *  threshold (STOP_PCTS: below that % of his HP they predict the other form - from melee or ranged: magic; from magic:
 *  melee), the change in mean boss time against the default prediction, on the same raids. Tome spec plans predict magic
 *  either way. -> [{p, forms: {form: [{pct, d, ci}]}, best: {form: pct | null}}]. */
export const PRED_FORMS = ['melee', 'magic', 'ranged'];
export const PRED_DEFAULT = { melee: 'ranged', magic: 'ranged', ranged: 'melee' }, PRED_OTHER = { melee: 'magic', magic: 'melee', ranged: 'magic' };
export async function predictionThresholds(cfg, run, n, progress = () => {}, stopped = () => false) {
  const seed = 'npred', [base] = await run([cfg], 0, n, seed), bt = base.totals, out = [];
  for (let k = 0; k < cfg.players.length && !stopped(); k++) {
    const row = { p: k, forms: {}, best: {} };
    for (const [fi, form] of PRED_FORMS.entries()) {
      progress(`Predictions: P${k + 1}, from his ${form} form`, (k * 3 + fi) / (cfg.players.length * 3));
      const cfgs = STOP_PCTS.map((pct) => ({ ...cfg, players: cfg.players.map((p, j) => (j === k ? { ...p, predictFlip: { ...(p.predictFlip || {}), [form]: pct } } : p)) }));
      const res = await run(cfgs, 0, n, seed);
      row.forms[form] = STOP_PCTS.map((pct, i) => {
        const d = res[i].totals.map((x, r) => x - bt[r]), m = d.reduce((a, b) => a + b, 0) / n;
        const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
        return { pct, d: m, ci: 1.96 * sd / Math.sqrt(n) };
      });
      let b = row.forms[form].reduce((a, x) => (x.d < a.d ? x : a), { pct: null, d: 0, ci: 0 });
      const all = row.forms[form][row.forms[form].length - 1];       // as good as switching always (100%): always
      if (b.pct != null && all.d <= b.d + 0.01) b = all;
      row.best[form] = b.pct != null && b.d < -b.ci ? b.pct : null;
    }
    out.push(row);
  }
  return out;
}
/** A player's predictions as text: 'he's magic: predict melee below 60% of his HP (ranged above)'. */
export function predictionText(flip = {}) {
  return PRED_FORMS.map((f) => {
    const x = flip[f];
    if (x == null) return `he's ${f}: predict ${PRED_DEFAULT[f]}`;
    return x >= 100 ? `he's ${f}: predict ${PRED_OTHER[f]}` : `he's ${f}: predict ${PRED_DEFAULT[f]}, ${PRED_OTHER[f]} below ${x}% of his HP`;
  }).join(' · ');
}

/** Backup BGS for a setup: for each player with a Bandos godsword and each Defence (BACKUP_ATS: a BGS while his Defence
 *  is at or above it, after the opening BGSs), the change in mean boss time against no backup BGS, on the same raids.
 *  -> {rows: [{p, ats: [{at, d, ci}]}], best: {p, at} | null (only when clearly faster)}. */
export async function backupThresholds(cfg, gear, run, n, progress = () => {}, stopped = () => false) {
  const seed = 'nbgs', none = { ...cfg, backup: null }, [base] = await run([none], 0, n, seed), bt = base.totals, rows = [];
  let best = null;
  for (let k = 0; k < cfg.players.length && !stopped(); k++) {
    if (!has(gear[k], 'bgs')) continue;
    progress(`Backup BGS: P${k + 1}`, k / cfg.players.length);
    const res = await run(BACKUP_ATS.map((at) => ({ ...cfg, backup: { p: k, at } })), 0, n, seed);
    const ats = BACKUP_ATS.map((at, i) => {
      const d = res[i].totals.map((x, r) => x - bt[r]), m = d.reduce((a, b) => a + b, 0) / n;
      const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1));
      return { at, d: m, ci: 1.96 * sd / Math.sqrt(n) };
    });
    rows.push({ p: k, ats });
    for (const x of ats) if (x.d < -x.ci && (!best || x.d < best.d)) best = { p: k, at: x.at, d: x.d };
  }
  return { rows, best };
}

/** Two setups on the same raids: the change in mean boss time from `base` to `cfg` (ticks; negative is faster) ± the
 *  95% range. */
export async function pairedChange(base, cfg, run, n, seed = 'ncomb') {
  const [a, b] = await run([base, cfg], 0, n, seed);
  const d = b.totals.map((x, i) => x - a.totals[i]), m = d.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, n - 1));
  return { d: m, ci: 1.96 * sd / Math.sqrt(n) };
}
/** A setup with each player's best thresholds (rangedThresholds rows) in place of theirs. */
export const withThresholds = (cfg, thr) => ({ ...cfg, players: cfg.players.map((p, k) => { const row = (thr || []).find((r) => r.p === k); if (!row) return p; const rs = {}; for (const x of [1, 2, 3]) if (row.best[x] != null) rs[x] = row.best[x]; return { ...p, rangedStop: rs }; }) });

/** Last step: each player's other start spec (95 / 100) on the best setup, on the final raids - a change kept only when
 *  it's clearly faster there (95% gives a regen right after their first spec: a spec planned after it can come in time). */
async function polishStarts(best, run, finalRaids, seed, bps, ok, progress) {
  let cur = best;
  for (let pass = 0; pass < 2; pass++) {
    const cands = cur.cfg.players.map((p, k) => ({ ...cur.cfg, players: cur.cfg.players.map((q, j) => (j === k ? { ...q, startSpec: q.startSpec === 95 ? 100 : 95 } : q)) })).filter(ok);
    if (!cands.length) break;
    progress(`Checking each player's other start spec on ${finalRaids.toLocaleString()} raids...`, 1);
    const res = await run(cands, 0, finalRaids, seed);
    let pick = null;
    res.forEach((r, i) => {
      const d = r.totals.map((x, n) => x - cur.totals[n]), m = d.reduce((a, b) => a + b, 0) / d.length;
      const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, d.length - 1)), sc = scoreOf(r.totals, bps);
      if (m < -1.96 * sd / Math.sqrt(d.length) && !better(cur.score, sc) && (!pick || m < pick.m)) pick = { i, m, r, sc };
    });
    if (!pick) break;
    cur = { ...cur, ...pick.r, cfg: cands[pick.i], score: pick.sc };
  }
  return cur;
}
