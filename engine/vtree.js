// Verzik decision tree: each player's plan by the number of Dawn specs P1 died in (the ring swap point for that branch
// and their reds line), then what they do if bounced; who death charges what comes first. Built from branchProfile (optimize.js). Branches and lines
// under 1% of raids are left out; a "she died first" reds line (fewer attacks than their usual one) is an outcome,
// not a choice, so it's left out too; a player who does the same in every branch gets one line.
import { branchProfile } from './optimize.js';

const MIN = 0.01;
const attacks = (line) => (line.match(/\d+/g) || []).reduce((n, x) => n + Number(x), 0);
const pc = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/** The reds lines worth showing: their usual one, then any other that came up in 1%+ of all raids (not one where she
 *  died before their last swing). lines: {line: count}; all: raids in total. [[line, share of these lines], ...] */
function mainLines(lines, all) {
  const ent = Object.entries(lines).sort((a, b) => b[1] - a[1]); if (!ent.length) return [];
  const top = attacks(ent[0][0]), keep = ent.filter(([l, v], i) => i === 0 || (attacks(l) >= top && v >= all * MIN));
  const tot = keep.reduce((n, [, v]) => n + v, 0);                 // shares of the lines shown
  return keep.map(([l, v]) => [l, v / tot]);
}
const linesText = (ls) => ls.map(([l, s], i) => (ls.length > 1 ? `${i ? 'or ' : ''}${l} (${pc(s)})` : l)).join(' · ');

/** The tree as HTML. by: branchProfile result; cfgs: the setup's players; esc: HTML escaping. */
export function verzikTreeHtml(by, cfgs, team, esc) {
  const all = Object.values(by).reduce((n, b) => n + b.n, 0); if (!all) return '';
  const ds = Object.keys(by).map(Number).filter((d) => by[d].n >= all * MIN).sort((a, b) => b - a);
  const rare = Object.keys(by).map(Number).filter((d) => !ds.includes(d)).reduce((n, d) => n + by[d].n, 0);
  const head = `P1 died in ${ds.map((d) => `<b>${d} Dawns</b> (${pc(by[d].n / all)}, ${pc(by[d].k / by[d].n)} success)`).join(' · ')}${rare ? ` · other Dawn counts ${pc(rare / all)} (left out)` : ''}.`;
  const players = cfgs.map((c, k) => {
    const ring = (d) => {
      if (!c.lightbearerOn) return null;
      const v = c.ringByDawns && c.ringByDawns[d] != null ? c.ringByDawns[d] : c.ringSwitch;
      return v == null || v === '' || v === 'default' ? 'default ring swap' : `ring swap at ${v}%`;
    };
    const text = (r, ls) => [r, ls.length ? `reds: ${linesText(ls)}` : null].filter(Boolean).join(' → ');
    const branch = ds.map((d) => {
      const ls = team > 2 ? mainLines(by[d].lines[k], all) : [];
      return { d, ring: ring(d), ls, key: `${ring(d)}|${ls.length ? ls[0][0] : ''}` };   // the ring swap and their usual line
    }).filter((x) => x.ring || x.ls.length);
    const rows = [];
    // who death charges what (part of the plan - the Optimizer / Solver can move these)
    // 3-5 man: the purple DC pops every purple that spawns; duos: 1st / 2nd purple DCs (no 2nd: the 1st DC pops both)
    const nobody2 = !cfgs.some((q) => q.Purple2DC);
    const purple = team > 2 ? 'every purple' : nobody2 ? 'every purple' : 'the 1st purple';
    const dcs = [c.PurpleDC && purple, team === 2 && c.Purple2DC && 'the 2nd purple', c.WestDC && 'West reds', c.EastDC && 'East reds'].filter(Boolean);
    if (dcs.length) rows.push(`death charge: ${dcs.join(', ')}`);
    if (branch.length && branch.every((x) => x.key === branch[0].key)) {   // the same plan in every branch: one line
      const merged = {}; for (const d of ds) for (const [l, v] of Object.entries(by[d].lines[k] || {})) merged[l] = (merged[l] || 0) + v;
      const ls = team > 2 ? mainLines(merged, all) : [];
      rows.push(`every branch: ${esc(text(branch[0].ring, ls))}`);
    } else for (const x of branch) rows.push(`P1 dies in ${x.d} Dawns (${pc(by[x.d].n / all)}): ${esc(text(x.ring, x.ls))}`);
    // (hits on the crabs - the purple DC blowpiping the purple in the shield - aren't part of it: hits on her only)
    if (team > 2) {                                                   // bounced: every branch together
      const bl = {}; let b = 0, reds = 0;
      for (const d of Object.keys(by)) {
        b += by[d].bounced[k];
        for (const [l, v] of Object.entries(by[d].blines[k] || {})) bl[l] = (bl[l] || 0) + v;
        reds += Object.values(by[d].lines[k]).reduce((n, v) => n + v, 0) + Object.values(by[d].blines[k] || {}).reduce((n, v) => n + v, 0);
      }
      const ls = mainLines(bl, all);
      if (b >= all * MIN && ls.length) rows.push(`if bounced (${pc(b / reds)} of raids that reach reds): ${esc(linesText(ls))}`);
    }
    return `<li><b>${esc(c.name || `Player ${k + 1}`)}</b>${rows.length === 1 ? `: ${rows[0]}` : rows.length ? `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>` : ': nothing to show'}</li>`;
  });
  return `<div class="vtree small" style="margin-top:6px"><b>Decision tree</b>
    <div>${head}</div><ul style="margin:4px 0 0 18px;padding:0">${players.join('')}</ul></div>`;
}

/** Profile a setup in chunks (keeps the page responsive). onProgress(done, n). */
export async function profileChunks(cfgs, team, n, seed, onProgress = () => {}) {
  let by = {};
  for (let i = 0; i < n; i += 200) {
    by = branchProfile(cfgs, team, i, Math.min(n, i + 200), seed, by);
    onProgress(Math.min(n, i + 200), n);
    await new Promise((r) => setTimeout(r, 0));
  }
  return by;
}
