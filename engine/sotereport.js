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
export const newSoteResult = () => ({ runs: 0, total: [], split: { p1: [], maze1: [], p2: [], maze2: [], p3: [] }, deaths: 0, raidsWithDeath: 0, wipes: 0, mazeRuns: 0, runLost: 0 });

/** Play raids [from, to) into `res` (seeds '<seed>#i'). */
export function addSoteRaids(res, players, team, from, to, { seed = 'sote', entry = 0 } = {}) {
  for (let i = from; i < to; i++) {
    const r = runSote(players, team, new Rng(`${seed}#${i}`), null, { entry });
    res.runs++;
    const dead = r.players.filter((p) => p.dead).length;
    res.deaths += dead; if (dead) res.raidsWithDeath++;
    for (const x of r.runs || []) { res.mazeRuns++; res.runLost += x.lost; }
    if (r.end == null || !r.split) { res.wipes++; continue; }
    res.total.push(r.end);
    for (const k of Object.keys(res.split)) res.split[k].push(r.split[k]);
  }
  return res;
}

const PARTS = [['p1', 'P1 (to the first maze)'], ['maze1', 'First maze'], ['p2', 'P2 (to the second maze)'], ['maze2', 'Second maze'], ['p3', 'P3 (to the kill)']];

/** Report body (a <div class="vz-report">). */
export function soteReportHtml(res, team, opts = {}) {
  const bps = opts.breakpoints || [], label = opts.label || 'Sotetseg';
  const row = (name, arr) => {
    const v = arr.slice().sort((a, b) => a - b);
    if (!v.length) return `<tr><td>${name}</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>`;
    return `<tr><td>${name}</td><td>${fmt(v[Math.floor(v.length / 2)])}</td><td>${fmt(q(v, 0.10))}</td><td>${fmt(q(v, 0.25))}</td><td>${fmt(q(v, 0.75))}</td><td>${fmt(v[0])}</td></tr>`;
  };
  const splits = `<table><tr><th>Part</th><th>Median</th><th>Top 10%</th><th>Top 25%</th><th>Bottom 25%</th><th>Fastest</th></tr>${
    PARTS.map(([k, n]) => row(n, res.split[k])).join('')}${row('<b>Room</b>', res.total)}</table>`;
  const under = (sec) => res.total.filter((t) => t * 0.6 <= sec + 1e-9).length;
  const fastest = res.total.length ? Math.min(...res.total) : null;
  const odds = [
    ...(res.mazeRuns ? [['Maze runs: ticks after a skip (average)', (res.runLost / res.mazeRuns).toFixed(1)]] : []),
    ['Fastest room', fastest != null ? fmt(fastest) : '-'],
    ['Fastest room frequency', fastest != null ? (() => { const n = res.total.filter((x) => x === fastest).length; return `${n.toLocaleString()} of ${res.runs.toLocaleString()} (1 in ${Math.round(res.runs / n).toLocaleString()})`; })() : '-'],
    ...bps.map((b) => [`${fmtSec(b)} or faster`, pct(under(b), res.total.length)]),
  ];
  const oddsT = `<table>${odds.map(([n, v]) => `<tr><td>${n}</td><td>${v}</td></tr>`).join('')}</table>`;
  const r1 = [{ total: res.total, runs: res.runs }], labs = [label];
  const med = res.total.length ? fmt(res.total.slice().sort((a, b) => a - b)[Math.floor(res.total.length / 2)]) : '-';
  return `<div class="vz-report">
<h2>${team}-man Sotetseg: room time</h2>
<div class="sub">${res.runs.toLocaleString()} raids · entry instance ${opts.entry ?? 0} · each maze runs from its proc to the end of the last cycle before she's interactable · sim v${VERSION}</div>
<div class="kpis"><div class="kpi"><b style="color:#2a78d6">${med}</b><span>median room</span></div><div class="kpi"><b style="color:#2a78d6">${fastest != null ? fmt(fastest) : '-'}</b><span>fastest</span></div></div>
<h3>Splits</h3>${splits}
<h3>Odds</h3>${oddsT}
<h3>How often each room time happens (per second, % of raids)</h3><div class="scroll">${histogramSvg(r1, labs).replace('% of successful runs', '% of raids')}</div>
<h3>Finished by this time or faster - % of raids</h3><div class="sub">${bps.length ? 'Vertical lines are your breakpoints (room finished at that time or faster; times are rounded down to a tick).' : 'Add breakpoints to mark your target times.'}</div><div class="scroll">${cumulativeSvg(r1, labs, bps).replace('% of successful runs finished by this time', '% of raids finished by this time')}</div>
</div>`;
}

/** A complete standalone HTML file. */
export function soteReportPage(res, team, opts = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sotetseg ${team}-man report</title><style>body{margin:0;padding:16px;background:#dadde0}${REPORT_CSS}</style></head>
<body>${soteReportHtml(res, team, opts)}</body></html>`;
}
