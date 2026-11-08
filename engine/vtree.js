// Verzik decision tree: each player's plan by the number of Dawn specs P1 died in (the ring swap point for that branch
// and their reds line), then what they do if bounced; who death charges what comes first. Built from branchProfile (optimize.js). Branches and lines
// under 1% of raids are left out; a "she died first" reds line (fewer attacks than their usual one) is an outcome,
// not a choice, so it's left out too; a player who does the same in every branch gets one line.
import { breath } from './pause.js';
import { branchProfile } from './optimize.js';

const MIN = 0.01;
const attacks = (line) => (line.replace(/\d+ horns?/g, '').match(/\d+/g) || []).reduce((n, x) => n + Number(x), 0);
const pc = (x) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/** The reds lines worth showing: their usual one, then any other that came up in 1%+ of all raids (not one where she
 *  died before their last swing). lines: {line: count}; all: raids in total. [[line, share of these lines], ...] */
function mainLines(lines, all) {
  const ent = Object.entries(lines).sort((a, b) => b[1] - a[1]); if (!ent.length) return [];
  const top = attacks(ent[0][0]), keep = ent.filter(([l, v], i) => i === 0 || (attacks(l) >= top && v >= all * MIN));
  const tot = keep.reduce((n, [, v]) => n + v, 0);                 // shares of the lines shown
  return keep.map(([l, v]) => [l, v / tot]);
}
// a line as its usual timings: 'tome r11, shadow r20, scythe remainder // no bounce chance r16' (timed: {line: {text: n}})
const timedOf = (l, timed) => { const e = Object.entries((timed && timed[l]) || {}).sort((a, b) => b[1] - a[1]); return e.length ? e[0][0] : l; };
const LATE = /claw r(3[1-9]|40)\b/g;                               // a late claw (r31+): grouped as a tick range
const linesText = (ls, timed) => {
  // lines with the same timings are one; lines that differ only in their late claws' ticks are one, with the range
  const m = new Map();
  for (const [l, s] of ls) {
    const t = timedOf(l, timed), key = t.replace(LATE, 'claw r§'), ticks = [...t.matchAll(LATE)].map((x) => +x[1]);
    const g = m.get(key) || { s: 0, lo: ticks.slice(), hi: ticks.slice() };
    ticks.forEach((x, i) => { g.lo[i] = Math.min(g.lo[i], x); g.hi[i] = Math.max(g.hi[i], x); });
    g.s += s; m.set(key, g);
  }
  const e = [...m].map(([key, g]) => { let i = 0; return [key.replace(/claw r§/g, () => { const k = i++; return g.lo[k] === g.hi[k] ? `claw r${g.lo[k]}` : `claw r${g.lo[k]}–r${g.hi[k]}`; }), g.s]; })
    .sort((a, b) => b[1] - a[1]);
  return e.map(([t, s], i) => (e.length > 1 ? `${i ? 'or ' : ''}${t} (${pc(s)})` : t)).join(' · ');
};
/** A player's timings for each line, over the given branches. */
const timedFor = (by, ds, k, src = 'timed') => { const out = {}; for (const d of ds) for (const [l, m] of Object.entries((by[d][src] || [])[k] || {})) { const o = out[l] ||= {}; for (const [t, v] of Object.entries(m)) o[t] = (o[t] || 0) + v; } return out; };

const mmss = (t) => { const s = Math.round(t * 0.6); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** When a player's spec choice in reds turns on when their 50% comes in (most raids enter reds under 50%): the rules,
 *  earliest regen first - 'reds proc 1:40 or later: tome spec (r11-r16)'. Proc times when their regen lands on the same
 *  raid tick in 80%+ of raids, else the reds tick their 50% comes in. null when it doesn't apply. samp: [[rs, P, kind,
 *  spec r, r16], ...] (non-bounced raids). */
function specRules(samp) {
  if (samp.length < 50 || samp.filter((x) => x[0] > 0).length < samp.length * 0.5) return null;
  // tome specs whose ticks fall in separate clusters (a gap over 5 reds ticks - a tome on r16 or held till r31) are a rule each
  // (claws stay one rule: their first swing after the regen)
  const cl = new Map();
  for (const [, , kind, r] of samp) if (r != null && kind === 'tome') (cl.get(kind) || cl.set(kind, new Set()).get(kind)).add(r);
  const part = new Map();
  for (const [kind, set] of cl) { const v = [...set].sort((x, y) => x - y); let c = 0; v.forEach((r, i) => { if (i && r - v[i - 1] > 5) c++; part.set(`${kind}|${r}`, c); }); }
  const kinds = new Map();
  for (const [rs, P, kind, r, r16] of samp) {
    const key = r == null || kind !== 'tome' ? kind : `${kind}#${part.get(`${kind}|${r}`)}`;
    const g = kinds.get(key) || { kind, n: 0, rs: [], r: [], out: 0 }; g.n++; g.rs.push(rs); if (r != null) g.r.push(r); if (r16 === 'out') g.out++; kinds.set(key, g);
  }
  const main = [...kinds].filter(([, g]) => g.n >= samp.length * 0.02);
  if (main.length < 2) return null;
  const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))]; };
  const rows = main.map(([, g]) => ({ kind: g.kind, n: g.n, lo: q(g.rs, 0.05), hi: q(g.rs, 0.95), rlo: g.r.length ? q(g.r, 0.05) : null, rhi: g.r.length ? q(g.r, 0.95) : null, out: g.out / g.n }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  // the raid tick their 50% lands on: P + rs - the same one in 80%+ of raids?
  const abs = new Map(); for (const [rs, P] of samp) if (rs > 0) abs.set(P + rs, (abs.get(P + rs) || 0) + 1);
  const [A, An] = [...abs].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const byProc = A != null && An >= samp.filter((x) => x[0] > 0).length * 0.8;
  const tot = samp.length;
  return rows.map((x, i) => {
    const what = x.kind === 'none' ? 'no spec (the regen comes too late)' : `${x.kind} spec${x.rlo == null ? '' : x.rlo === x.rhi ? ` r${x.rlo}` : ` r${x.rlo}–r${x.rhi}`}${x.kind === 'claw' && x.rlo !== x.rhi ? ' (their first swing after the regen)' : ''}`;
    const bounce = x.kind === 'none' ? '' : x.out >= 0.9 ? ' - no bounce chance r16' : x.out <= 0.1 ? ' - chances the r16 bounce' : ` - no bounce chance r16 ${pc(x.out)}`;
    let when;
    if (byProc) {                                                  // regen on raid tick A: reds proc time = A - rs
      const late = A - x.lo, early = A - x.hi;
      when = i === 0 ? `reds proc ${mmss(early)} or later` : i === rows.length - 1 ? `reds proc ${mmss(late)} or sooner` : `reds proc ${mmss(early)}–${mmss(late)}`;
    } else when = i === 0 ? `50% by r${x.hi}` : i === rows.length - 1 ? `50% on r${x.lo} or later` : `50% on r${x.lo}–r${x.hi}`;
    return `${when}: ${what}${bounce} (${pc(x.n / tot)})`;
  });
}

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
    const text = (r, ls, timed) => [r, ls.length ? `reds: ${linesText(ls, timed)}` : null].filter(Boolean).join(' → ');
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
    const samp = team > 2 ? ds.flatMap((d) => ((by[d].samp || [])[k] || [])) : [];
    const rules = specRules(samp);
    if (rules) {                                                      // their spec turns on when their 50% comes in
      const rings = [...new Set(branch.map((x) => x.ring))];
      if (rings.length === 1 && rings[0]) rows.push(`every branch: ${esc(rings[0])}`);
      else for (const x of branch) if (x.ring) rows.push(`P1 dies in ${x.d} Dawns (${pc(by[x.d].n / all)}): ${esc(x.ring)}`);
      rows.push(`reds:<ul>${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
    } else if (branch.length && branch.every((x) => x.key === branch[0].key)) {   // the same plan in every branch: one line
      const merged = {}; for (const d of ds) for (const [l, v] of Object.entries(by[d].lines[k] || {})) merged[l] = (merged[l] || 0) + v;
      const ls = team > 2 ? mainLines(merged, all) : [];
      rows.push(`every branch: ${esc(text(branch[0].ring, ls, timedFor(by, ds, k)))}`);
    } else for (const x of branch) rows.push(`P1 dies in ${x.d} Dawns (${pc(by[x.d].n / all)}): ${esc(text(x.ring, x.ls, timedFor(by, [x.d], k)))}`);
    // (hits on the crabs - the purple DC blowpiping the purple in the shield - aren't part of it: hits on her only)
    if (team > 2) {                                                   // bounced: every branch together
      const bl = {}; let b = 0, reds = 0;
      for (const d of Object.keys(by)) {
        b += by[d].bounced[k];
        for (const [l, v] of Object.entries(by[d].blines[k] || {})) bl[l] = (bl[l] || 0) + v;
        reds += Object.values(by[d].lines[k]).reduce((n, v) => n + v, 0) + Object.values(by[d].blines[k] || {}).reduce((n, v) => n + v, 0);
      }
      const ls = mainLines(bl, all);
      if (b >= all * MIN && ls.length) rows.push(`if bounced (${pc(b / reds)} of raids that reach reds): ${esc(linesText(ls, timedFor(by, Object.keys(by), k, 'btimed')))}`);
    }
    if (team > 2 && c.horn && c.hornP2) {                             // the P2 horn: no attack of its own, so say how often it goes off
      let h = 0, reds = 0;
      for (const d of Object.keys(by)) for (const src of [by[d].lines[k], by[d].blines[k] || {}]) for (const [l, v] of Object.entries(src)) { reds += v; if (/horn/.test(l)) h += v; }
      if (reds) rows.push(`P2 horn: goes off in reds in ${pc(h / reds)} of raids that reach reds (from their 2nd attack, on 25-49% spec)${h / reds < MIN ? ' - almost never: they don\'t have the spec for it' : ''}`);
    }
    return `<li><b>${esc(c.name || `Player ${k + 1}`)}</b>${rows.length === 1 ? `: ${rows[0]}` : rows.length ? `<ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>` : ': nothing to show'}</li>`;
  });
  return `<div class="vtree small" style="margin-top:6px"><b>Decision tree</b>
    <div>${head}</div>
    <div class="row wrap" style="gap:6px;margin:4px 0 2px">${ds.map((d) => `<button class="ghost sm" data-vdawn="${d}" title="The median successful raid where P1 died in ${d} Dawns (in the Show raid box below)">Example ${d} Dawn</button>`).join('')}</div>
    <ul style="margin:4px 0 0 18px;padding:0">${players.join('')}</ul></div>`;
}

/** Profile a setup in chunks (keeps the page responsive). onProgress(done, n). */
export async function profileChunks(cfgs, team, n, seed, onProgress = () => {}) {
  let by = {};
  for (let i = 0; i < n; i += 200) {
    by = branchProfile(cfgs, team, i, Math.min(n, i + 200), seed, by);
    onProgress(Math.min(n, i + 200), n);
    await breath();
  }
  return by;
}
