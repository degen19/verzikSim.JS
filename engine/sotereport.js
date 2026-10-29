// Sotetseg report: run a batch of raids and lay out the times - P1, first maze, P2, second maze, P3 and the room
// (median / top 10% / top 25% / bottom 25% / fastest) - with the Verzik report's charts and breakpoints.
import { runSote } from './sote.js';
import { Rng } from './rng.js';
import { histogramSvg, cumulativeSvg, REPORT_CSS } from './report.js';
import { VERSION } from './version.js';

const fmt = (t) => { const s = t * 0.6; return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`; };
const fmtSec = (s) => { const r = Math.round(s % 60 * 10) / 10; return `${Math.floor(s / 60)}:${r < 10 ? '0' : ''}${r}`; };
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (v, f) => v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * f) - 1))];

/** An empty result to add raids into. */
export const newSoteResult = () => ({ missed: {}, runs: 0, total: [], split: { p1: [], maze1: [], p2: [], maze2: [], p3: [] }, deaths: 0, raidsWithDeath: 0, wipes: 0, mazeRuns: 0, runLost: 0 });

/** Play raids [from, to) into `res` (seeds '<seed>#i'). */
export function addSoteRaids(res, players, team, from, to, { seed = 'sote', entry = 0, clawBelow, splitBall = true, stallTick = false } = {}) {
  for (let i = from; i < to; i++) {
    const r = runSote(players, team, new Rng(`${seed}#${i}`), null, { entry, splitBall, stallTick, ...(clawBelow != null ? { clawBelow } : {}) });
    res.runs++;
    const dead = r.players.filter((p) => p.dead).length;
    res.deaths += dead; if (dead) res.raidsWithDeath++;
    for (const x of r.runs || []) { res.mazeRuns++; res.runLost += x.lost; }
    for (const x of new Set((r.specMissed || []).map((m) => `${players[m.i]?.name || `Player ${m.i + 1}`}: P${m.ph + 1} ${{ maul: 'maul', bgs: 'BGS', claws: 'claws', zcb: 'ZCB', horn: 'horn' }[m.kind] || m.kind}`))) res.missed[x] = (res.missed[x] || 0) + 1;
    if (r.end == null || !r.split) { res.wipes++; continue; }
    res.total.push(r.end);
    for (const k of Object.keys(res.split)) res.split[k].push(r.split[k]);
  }
  return res;
}

const PARTS = [['p1', 'P1 (to the first maze)'], ['maze1', 'First maze'], ['p2', 'P2 (to the second maze)'], ['maze2', 'Second maze'], ['p3', 'P3 (to the kill)']];

const COL = ['#2a78d6', '#d64545', '#2f9e61'];
const sortedOf = (a) => a.slice().sort((x, y) => x - y);

/** Report body (a <div class="vz-report">). res: one result, or several (sets compared on the same raids) with
 *  opts.labels. */
export function soteReportHtml(resIn, team, opts = {}) {
  const all = Array.isArray(resIn) ? resIn : [resIn], multi = all.length > 1;
  const labs = all.map((_, i) => (opts.labels || [])[i] || (multi ? `Set ${'ABC'[i]}` : opts.label || 'Sotetseg'));
  const bps = opts.breakpoints || [];
  const cells = (arr) => {
    const v = sortedOf(arr);
    if (!v.length) return '<td>-</td><td>-</td><td>-</td><td>-</td><td>-</td>';
    return `<td>${fmt(v[Math.floor(v.length / 2)])}</td><td>${fmt(q(v, 0.10))}</td><td>${fmt(q(v, 0.25))}</td><td>${fmt(q(v, 0.75))}</td><td>${fmt(v[0])}</td>`;
  };
  const tag = (i) => `<td style="color:${COL[i % 3]};font-weight:600">${esc(labs[i])}</td>`;
  const splits = `<table><tr><th>Part</th>${multi ? '<th>Set</th>' : ''}<th>Median</th><th>Top 10%</th><th>Top 25%</th><th>Bottom 25%</th><th>Fastest</th></tr>${
    [...PARTS, ['total', '<b>Room</b>']].map(([k, n]) => all.map((res, i) => `<tr>${i === 0 ? `<td${multi ? ` rowspan="${all.length}"` : ''}>${n}</td>` : ''}${multi ? tag(i) : ''}${cells(k === 'total' ? res.total : res.split[k])}</tr>`).join('')).join('')}</table>`;
  const oddsOf = (res) => {
    const under = (sec) => res.total.filter((t) => t * 0.6 <= sec + 1e-9).length;
    const fastest = res.total.length ? Math.min(...res.total) : null;
    return [
      ['Raids that wiped', pct(res.wipes || 0, res.runs)],
      ['Maze runs: ticks after a skip (average)', res.mazeRuns ? (res.runLost / res.mazeRuns).toFixed(1) : '-'],
      ['Fastest room', fastest != null ? fmt(fastest) : '-'],
      ['Fastest room frequency', fastest != null ? (() => { const n = res.total.filter((x) => x === fastest).length; return `${n.toLocaleString()} of ${res.runs.toLocaleString()} (1 in ${Math.round(res.runs / n).toLocaleString()})`; })() : '-'],
      ...bps.map((b) => [`${fmtSec(b)} or faster`, pct(under(b), res.total.length)]),
    ];
  };
  const od = all.map(oddsOf), anyRuns = all.some((r) => r.mazeRuns), anyWipes = all.some((r) => r.wipes);
  const oddsT = `<table>${multi ? `<tr><th></th>${labs.map((l, i) => `<th style="color:${COL[i % 3]}">${esc(l)}</th>`).join('')}</tr>` : ''}${
    od[0].map(([n], j) => ((j === 0 && !anyWipes) || (j === 1 && !anyRuns) ? '' : `<tr><td>${n}</td>${od.map((o) => `<td>${o[j][1]}</td>`).join('')}</tr>`)).join('')}</table>`;
  const names = [...new Set(all.flatMap((r) => Object.keys(r.missed || {})))].sort((x, y) => Math.max(...all.map((r) => (r.missed?.[y] || 0) / (r.runs || 1))) - Math.max(...all.map((r) => (r.missed?.[x] || 0) / (r.runs || 1))));
  const missT = names.length ? `<h3>Planned specs that didn't go off</h3><div class="sub">Share of raids where a planned (not backup) spec or horn never happened in its phase - not enough spec in time, or the phase ended first.</div><table>${multi ? `<tr><th></th>${labs.map((l, i) => `<th style="color:${COL[i % 3]}">${esc(l)}</th>`).join('')}</tr>` : ''}${
    names.map((n) => `<tr><td>${esc(n)}</td>${all.map((r) => `<td>${r.missed?.[n] ? pct(r.missed[n], r.runs) : '-'}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const series = all.map((r) => ({ total: r.total, runs: r.runs }));
  const kpis = all.map((r, i) => {
    const v = sortedOf(r.total);
    return `<div class="kpi"><b style="color:${COL[i % 3]}">${v.length ? fmt(v[Math.floor(v.length / 2)]) : '-'}</b><span>${multi ? `${esc(labs[i])}: ` : ''}median room</span></div><div class="kpi"><b style="color:${COL[i % 3]}">${v.length ? fmt(v[0]) : '-'}</b><span>${multi ? `${esc(labs[i])}: ` : ''}fastest</span></div>`;
  }).join('');
  return `<div class="vz-report">
<h2>${team}-man Sotetseg: room time${multi ? ` - ${all.length} sets compared` : ''}</h2>
<div class="sub">${all[0].runs.toLocaleString()} raids${multi ? ' per set (the same raids for each)' : ''} · ${opts.entries ? (multi ? `entry instance ${labs.map((l, i) => `${esc(l)} i${opts.entries[i] ?? 0}`).join(', ')}` : `entry instance i${opts.entries[0] ?? 0}`) : `entry instance i${opts.entry ?? 0}`} · each maze runs from its proc to the end of the last cycle before she's interactable · sim v${VERSION}</div>
<div class="kpis">${kpis}</div>
<h3>Splits</h3>${splits}
<h3>Odds</h3>${oddsT}${missT}
<h3>How often each room time happens (per second, % of raids)</h3><div class="scroll">${histogramSvg(series, labs).replace('% of successful runs', '% of raids')}</div>
<h3>Finished by this time or faster - % of raids</h3><div class="sub">${bps.length ? 'Vertical lines are your breakpoints (room finished at that time or faster; times are rounded down to a tick).' : 'Add breakpoints to mark your target times.'}</div><div class="scroll">${cumulativeSvg(series, labs, bps).replace('% of successful runs finished by this time', '% of raids finished by this time')}</div>
</div>`;
}

/** A complete standalone HTML file. */
export function soteReportPage(res, team, opts = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sotetseg ${team}-man report</title><style>body{margin:0;padding:16px;background:#dadde0}${REPORT_CSS}</style></head>
<body>${soteReportHtml(res, team, opts)}</body></html>`;
}
