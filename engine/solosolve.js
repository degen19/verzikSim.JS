// Solo Verzik Solver: searches the Commit % for each spec level (and, if ticked, the shadow mode, Ayak P2 amount,
// godbook and ring switch) for the best room times.
// Search: start from the setup given; each round every single change is tried on a few raids, the best on more, the
// best of those on many (the same raids for each, so they compare fairly), and the best is kept if it beats the current
// setup on those raids. Repeat until nothing improves (or the round limit). The best setups seen are then played on
// more raids and ranked: with breakpoints by the share finished by the fastest breakpoint (then the next ...), then the
// median; without, the median, then the top 10%.
import { run_solo, COMMIT_KEYS } from './solo.js';
import { Rng } from './rng.js';

export const COMMIT_VALUES = [0, 4, 6, 8, 10, 12, 14, 16, 18, 20, 23, 26, 30, 35, 40, 50];
export const SHADOW_MODES = [['none', 'No shadow'], ['camp', 'Shadow camp'], ['31', '3:1'], ['lb', 'Shadow while LB'], ['lb31', 'Shadow while LB + 3:1']];
export const AYAK_VALUES = [0, 20, 35, 50, 70];
export const RING_VALUES = ['', 50, 70, 90, 100];

/** The searched settings applied to a base config. s: {commit: {c100..c0}, shadowMode, ayak, godbook, ringSwitch}. */
export function cfgOf(base, s) {
  const c = { ...base, commit: { ...s.commit }, godbook: !!s.godbook, ringSwitch: s.ringSwitch ?? '' };
  if (s.shadowMode != null) {
    const m = c.hasShadow ? s.shadowMode : 'none';
    Object.assign(c, { shadow: m !== 'none', shadowCamp: m === 'camp', shadow31: m === '31' || m === 'lb31', shadowLB: m === 'lb' || m === 'lb31' });
  }
  if (s.ayak != null) Object.assign(c, { ayakP2: s.ayak > 0, ayakAmount: s.ayak });
  return c;
}
export const shadowModeOf = (c) => (!c.shadow ? 'none' : c.shadowCamp ? 'camp' : c.shadowLB && c.shadow31 ? 'lb31' : c.shadowLB ? 'lb' : c.shadow31 ? '31' : 'none');

/** Totals per setup on raids [from, to) (seeds `<seed>#i`); a failed raid counts as 99999. */
export function evalSolo(settings, base, from, to, seed) {
  return settings.map((s) => {
    const cfg = cfgOf(base, s), totals = [], split = { p1: [], p2: [], p3: [], sets: [] };
    for (let i = from; i < to; i++) {
      const r = run_solo(cfg, new Rng(`${seed}#${i}`));
      if (r.end == null) { totals.push(99999); continue; }
      totals.push(r.end); split.p1.push(r.p1); split.p2.push(r.p2 - r.p1); split.p3.push(r.end - r.p2); split.sets.push(r.st.sets);
    }
    return { totals, split };
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
const keyOf = (s) => JSON.stringify([s.commit, s.shadowMode, s.ayak, !!s.godbook, String(s.ringSwitch ?? '')]);

/** Every single change the ticked options allow. ctx.allow: {commit, shadow, ayak, godbook, ring}; ctx.hasShadow / hasAyak. */
export function neighbours(s, ctx) {
  const out = [], push = (patch, what) => out.push({ ...s, ...patch, commit: { ...s.commit, ...(patch.commit || {}) }, what, path: [...(s.path || []), what] });
  if (ctx.allow.commit) {
    for (const [k, at] of COMMIT_KEYS) for (const v of COMMIT_VALUES) if (v !== Number(s.commit[k] || 0)) push({ commit: { [k]: v } }, `Commit ${v ? `${v}%` : 'never'} with ${at === 100 ? '100%' : at ? `${at}%+` : 'under 50%'} spec`);
  }
  if (ctx.allow.shadow && ctx.hasShadow) for (const [m, l] of SHADOW_MODES) if (m !== s.shadowMode) push({ shadowMode: m }, l);
  if (ctx.allow.ayak && ctx.hasAyak) for (const v of AYAK_VALUES) if (v !== s.ayak) push({ ayak: v }, v ? `Ayak P2 to ${v}` : 'No Ayak P2');
  if (ctx.allow.godbook) push({ godbook: !s.godbook }, s.godbook ? '100% start' : 'Godbook (95%)');
  if (ctx.allow.ring) for (const v of RING_VALUES) if (String(v) !== String(s.ringSwitch ?? '')) push({ ringSwitch: v }, v === '' ? 'Ultor at P2 start' : `Ultor at ${v}% spec`);
  return out;
}

/** ctx: {start (settings), allow, hasShadow, hasAyak, bps, rounds, stages, finalRaids, top}. run(settings[], from, to, seed)
 *  -> Promise<[{totals, split}]>. Returns [{s, score, totals, split}] best first. */
export async function solveSolo(ctx, run, progress = () => {}, stopped = () => false) {
  const { bps = [], stages = [[60, 0.25], [240, 4], [800, 1]], rounds = 8, finalRaids = 2000, top = 10 } = ctx;
  const seen = new Map();
  const note = (s, score, raids) => { const k = keyOf(s), o = seen.get(k); if (!o || raids >= o.raids) seen.set(k, { s, score, raids }); };
  let cur = { ...ctx.start };
  const bigN = stages[stages.length - 1][0];
  for (let round = 1; round <= rounds && !stopped(); round++) {
    let pool = neighbours(cur, ctx);
    const seed = `solo-round${round}`;
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
  const ranked = [...seen.values()].sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0)).slice(0, top);
  if (stopped() || !ranked.length) return [];
  progress(`Playing the top ${ranked.length} setups on ${finalRaids.toLocaleString()} raids each...`, 1);
  const res = await run(ranked.map((x) => x.s), 0, finalRaids, 'solo-final');
  return ranked.map((x, i) => ({ s: x.s, score: scoreOf(res[i].totals, bps), totals: res[i].totals, split: res[i].split }))
    .sort((a, b) => (better(a.score, b.score) ? -1 : better(b.score, a.score) ? 1 : 0));
}
