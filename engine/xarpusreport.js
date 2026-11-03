// Xarpus report: run a batch of raids and lay out the times - exhumeds, to the screech, the screech to the kill and the
// room (median / top 10% / top 25% / bottom 25% / fastest) - with the Verzik report's charts and breakpoints.
import { runXarpus, EXHUMED_TICKS } from './xarpus.js';
import { Rng } from './rng.js';
import { histogramSvg, cumulativeSvg, chartBox, REPORT_CSS, MAGNIFY_SCRIPT } from './report.js';
import { VERSION } from './version.js';

const fmt = (t) => { const s = t * 0.6; return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`; };
const fmtSec = (s) => { const r = Math.round(s % 60 * 10) / 10; return `${Math.floor(s / 60)}:${r < 10 ? '0' : ''}${r}`; };
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const q = (v, f) => v[Math.min(v.length - 1, Math.max(0, Math.floor(v.length * f) - 1))];
const avg = (a, d = 1) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(d) : '-');

/** An empty result to add raids into. */
export const newXarpusResult = () => ({ runs: 0, total: [], split: { exh: [], toScreech: [], kill: [] }, startHp: [], heals: [], defEnd: [], defZero: [], maulHits: [],
  ralosHits: [], fixRaids: 0, fixes: {}, specs: {}, failed: 0 });

/** Play raids [from, to) into `res` (seeds '<seed>#i'). opts: runXarpus options + seed. */
export function addXarpusRaids(res, players, team, from, to, { seed = 'xarpus', ...opts } = {}) {
  for (let i = from; i < to; i++) {
    addXarpusRun(res, runXarpus(players, team, new Rng(`${seed}#${i}`), null, opts), team);
  }
  return res;
}

/** One raid's result r into a report result. */
export function addXarpusRun(res, r, team) {
  const EXH = EXHUMED_TICKS[team];
    res.runs++;
    if (r.end == null) { res.failed++; return res; }
    res.total.push(r.end); res.split.exh.push(EXH);
    const drop = r.dropAt ?? r.kill; res.split.toScreech.push(drop - EXH); res.split.kill.push(r.end - drop);
    res.startHp.push(r.startHp); res.heals.push(r.heals); res.defEnd.push(r.defEnd); res.maulHits.push(r.maulHits); res.ralosHits.push(r.specs.ralosHits);
    if (r.defZeroAt != null) res.defZero.push(r.defZeroAt - EXH);
    if (r.fixes.length) res.fixRaids++;
    for (const f of r.fixes) res.fixes[f.fix] = (res.fixes[f.fix] || 0) + 1;
    for (const [k, v] of Object.entries(r.specs)) res.specs[k] = (res.specs[k] || 0) + v;
  return res;
}

const PARTS = [['exh', 'Exhumeds'], ['toScreech', 'Attackable to the screech'], ['kill', 'Screech to the end (incl. death animation)']];
const COL = ['#2a78d6', '#d64545', '#2f9e61'];
const sortedOf = (a) => a.slice().sort((x, y) => x - y);
const FIX_NAMES = { tick: 'lose a tick', scratch: 'claw scratch', claw: 'claw spec', bp: 'blowpipe hit', ayak: 'Ayak hit' };

/** Report body (a <div class="vz-report">). res: one result, or several (sets compared on the same raids) with opts.labels. */
export function xarpusReportHtml(resIn, team, opts = {}) {
  const all = Array.isArray(resIn) ? resIn : [resIn], multi = all.length > 1;
  const labs = all.map((_, i) => (opts.labels || [])[i] || (multi ? `Set ${'ABC'[i]}` : opts.label || 'Xarpus'));
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
    const n = res.total.length, under = (sec) => res.total.filter((t) => t * 0.6 <= sec + 1e-9).length;
    const fastest = n ? Math.min(...res.total) : null, per = (k) => (res.runs ? (res.specs[k] || 0) / res.runs : 0);
    return [
      ['Heals (average) / his HP when attackable (average)', `${avg(res.heals, 1)} / ${avg(res.startHp, 0)}`],
      ['Mauls landed (average)', `${avg(res.maulHits, 2)} of ${per('maul').toFixed(2)}`],
      ['Ralos Spec hits landed (average)', per('ralos') ? `${avg(res.ralosHits, 2)} of ${(per('ralos') * 2).toFixed(2)}` : '-'],
      ['Defence taken to 0', pct(res.defZero.length, n)],
      ['Defence to 0: ticks after the exhumeds (median)', res.defZero.length ? String(sortedOf(res.defZero)[res.defZero.length >> 1]) : '-'],
      ['His Defence left (average)', avg(res.defEnd, 1)],
      ['Raids with a tick fix at the screech', pct(res.fixRaids, n)],
      ['Specs a raid (average)', ['maul', 'bgs', 'ralos', 'claw', 'zcb', 'horn', 'surge'].filter((k) => res.specs[k]).map((k) => `${{ maul: 'maul', bgs: 'BGS', ralos: 'Ralos', claw: 'claws', zcb: 'ZCB', horn: 'horn', surge: 'surge' }[k]} ${per(k).toFixed(2)}`).join(', ') || '-'],
      ['Fastest room', fastest != null ? fmt(fastest) : '-'],
      ['Fastest room frequency', fastest != null ? (() => { const c = res.total.filter((x) => x === fastest).length; return `${c.toLocaleString()} of ${res.runs.toLocaleString()} (1 in ${Math.round(res.runs / c).toLocaleString()})`; })() : '-'],
      ...bps.map((b) => [`${fmtSec(b)} or faster`, pct(under(b), n)]),
    ];
  };
  const od = all.map(oddsOf);
  const oddsT = `<table>${multi ? `<tr><th></th>${labs.map((l, i) => `<th style="color:${COL[i % 3]}">${esc(l)}</th>`).join('')}</tr>` : ''}${
    od[0].map(([n], j) => `<tr><td>${n}</td>${od.map((o) => `<td>${o[j][1]}</td>`).join('')}</tr>`).join('')}</table>`;
  const fixKinds = [...new Set(all.flatMap((r) => Object.keys(r.fixes)))];
  const fixT = fixKinds.length ? `<h3>Tick fixes at the screech</h3><div class="sub">Players whose scythe (or ZCB) would have gone off on the i3 before the screech, per raid.</div><table>${multi ? `<tr><th></th>${labs.map((l, i) => `<th style="color:${COL[i % 3]}">${esc(l)}</th>`).join('')}</tr>` : ''}${
    fixKinds.map((k) => `<tr><td>${FIX_NAMES[k] || k}</td>${all.map((r) => `<td>${r.runs ? ((r.fixes[k] || 0) / r.runs).toFixed(3) : '-'}</td>`).join('')}</tr>`).join('')}</table>` : '';
  const series = all.map((r) => ({ total: r.total, runs: r.runs }));
  const kpis = all.map((r, i) => {
    const v = sortedOf(r.total);
    return `<div class="kpi"><b style="color:${COL[i % 3]}">${v.length ? fmt(v[Math.floor(v.length / 2)]) : '-'}</b><span>${multi ? `${esc(labs[i])}: ` : ''}median room</span></div><div class="kpi"><b style="color:${COL[i % 3]}">${v.length ? fmt(v[0]) : '-'}</b><span>${multi ? `${esc(labs[i])}: ` : ''}fastest</span></div>`;
  }).join('');
  return `<div class="vz-report">
<h2>${team}-man Xarpus: room time${multi ? ` - ${all.length} sets compared` : ''}</h2>
<div class="sub">${all[0].runs.toLocaleString()} raids${multi ? ' per set (the same raids for each)' : ''} · the room ends 4 ticks after the killing hit (3 with overkill) · sim v${VERSION}</div>
<div class="kpis">${kpis}</div>
<h3>Splits</h3>${splits}
<h3>Odds</h3>${oddsT}${fixT}
<h3>How often each room time happens (per second, % of raids)</h3><div class="scroll">${chartBox((rg) => histogramSvg(series, labs, rg).replace('% of successful runs', '% of raids'))}</div>
<h3>Finished by this time or faster - % of raids</h3><div class="sub">${bps.length ? 'Vertical lines are your breakpoints (room finished at that time or faster; times are rounded down to a tick).' : 'Add breakpoints to mark your target times.'}</div><div class="scroll">${chartBox((rg) => cumulativeSvg(series, labs, bps, rg).replace('% of successful runs finished by this time', '% of raids finished by this time'))}</div>
</div>`;
}

/** A complete standalone HTML file. */
export function xarpusReportPage(res, team, opts = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Xarpus ${team}-man report</title><style>body{margin:0;padding:16px;background:#dadde0}${REPORT_CSS}</style></head>
<body>${xarpusReportHtml(res, team, opts)}${MAGNIFY_SCRIPT}</body></html>`;
}
