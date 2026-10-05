// Turns simulate() results into a self-contained HTML report (SVG charts + tables). Used by the web page and the CLI.

import { VERSION } from './version.js';

const COL = ['#2a78d6', '#d64545'];
const fmt = (t) => `${Math.floor(t * 0.6 / 60)}:${(t * 0.6 % 60).toFixed(1).padStart(4, '0')}`;
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Merge results from several workers (same team) into one. */
export function mergeResults(parts) {
  const out = JSON.parse(JSON.stringify(parts[0]));
  for (const r of parts.slice(1)) {
    for (const k of ['total', 'p1', 'p2', 'p3', 'depth', 'p20', 'reds']) out[k].push(...r[k]);
    out.runs += r.runs;
    if (out.duo) {
      for (const k of ['die_p1', 'kill_ny', 'kill_ng', 'kill_ngl', 'n2d', 'runs']) out.duo[k] += r.duo[k];
      for (const k of ['sp1', 'sproc', 'sp2', 'sp3', 'dep1', 'dep2']) out.duo[k].push(...r.duo[k]);
      out.n2d += r.n2d;
    } else {
      out.die_p1 += r.die_p1;
      for (const k of ['sp1', 'sproc', 'sp2', 'sp3']) out.splits[k].push(...r.splits[k]);
    }
  }
  out.succ = out.total.length / out.runs;
  return out;
}

function q(sortedArr, f) {
  const m = sortedArr.length;
  return sortedArr[Math.min(m - 1, Math.max(0, Math.floor(m * f) - 1))];
}

function splitRows(res, labels) {
  const rows = [];
  const names = [['P1 end', 'sp1'], ['1st reds proc', 'sproc'], ['P2 end', 'sp2'], ['Room complete', 'sp3']];
  for (const [name, key] of names) {
    res.forEach((r, k) => {
      const src = r.duo ? r.duo[key] : r.splits[key];
      const v = src.slice().sort((a, b) => a - b);
      if (!v.length) { rows.push([k === 0 ? name : '', labels[k], '-', '-', '-', '-', k]); return; }
      rows.push([k === 0 ? name : '', labels[k], fmt(v[Math.floor(v.length / 2)]), fmt(q(v, 0.10)), fmt(q(v, 0.25)), fmt(q(v, 0.75)), k]);
    });
  }
  if (res.some((r) => r.duo)) {
    for (const [name, key] of [['1st reds depth (avg)', 'dep1'], ['2nd reds depth (avg)', 'dep2']]) {
      res.forEach((r, k) => rows.push([k === 0 ? name : '', labels[k], ...depthBuckets(r.duo, key), k]));
    }
  }
  return rows;
}

/** Average reds depth (Verzik HP % at the shield, lower = deeper) for the runs in each room-time bucket:
 *  Median = runs around the median room time (45th-55th percentile), Top 10% / 25% = fastest kills, Bottom 25% = slowest. */
function depthBuckets(d, key) {
  const n = d.sp3.length;
  if (!n) return ['-', '-', '-', '-'];
  const order = [...Array(n).keys()].sort((a, b) => d.sp3[a] - d.sp3[b]);
  const v = order.map((i) => d[key][i]);
  const avg = (sl) => { const x = sl.filter((y) => y != null); return x.length ? `${(x.reduce((s, y) => s + y, 0) / x.length).toFixed(1)}%` : '-'; };
  const qn = (f) => Math.max(1, Math.floor(n * f));
  const lo = Math.floor(n * 0.45), hi = Math.max(Math.floor(n * 0.55), lo + 1);
  return [avg(v.slice(lo, hi)), avg(v.slice(0, qn(0.10))), avg(v.slice(0, qn(0.25))), avg(v.slice(n - qn(0.25)))];
}

const fastest = (a) => a.reduce((m, x) => (x < m ? x : m), Infinity);
/** How often the fastest room time happened: count of runs at that exact tick, out of all attempts. */
function fastestFreq(r) {
  if (!r.total.length) return '-';
  const f = fastest(r.total), n = r.total.filter((x) => x === f).length;
  return `${n.toLocaleString()} of ${r.runs.toLocaleString()} (1 in ${Math.round(r.runs / n).toLocaleString()})`;
}

function oddsRows(res, team) {
  if (team === 2) {
    const d = res.map((r) => r.duo);
    return [
      ['2-down success (all runs)', d.map((x) => pct(x.n2d, x.runs))],
      ['Kill before yellows (of 2-downs)', d.map((x) => pct(x.kill_ny, x.n2d))],
      ['Kill before the green ball launches (of 2-downs)', d.map((x) => pct(x.kill_ng, x.n2d))],
      ['Kill before the green ball lands (of 2-downs)', d.map((x) => pct(x.kill_ngl, x.n2d))],
      ['Someone dies in P1 (all runs)', d.map((x) => pct(x.die_p1, x.runs))],
      ['Full kill (all runs)', res.map((r) => pct(r.total.length, r.runs))],
      ['Fastest completed run', res.map((r) => (r.total.length ? fmt(fastest(r.total)) : '-'))],
      ['Fastest run frequency (all runs)', res.map((r) => fastestFreq(r))],
    ];
  }
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
  return [
    ['Success (all runs)', res.map((r) => pct(r.total.length, r.runs))],
    ['Someone dies in P1 (all runs)', res.map((r) => pct(r.die_p1, r.runs))],
    ['Avg reds proc depth (Verzik HP %)', res.map((r) => `${mean(r.depth).toFixed(1)}%`)],
    ['Deepest reds proc', res.map((r) => (r.depth.length ? `${Math.min(...r.depth).toFixed(1)}%` : '-'))],
    ['Avg P3 20% tick', res.map((r) => (r.p20.length ? mean(r.p20).toFixed(1) : '-'))],
  ];
}

function histogramSvg(res, labels) {
  const all = res.flatMap((r) => r.total.map((t) => Math.round(t * 0.6))).sort((a, b) => a - b);
  if (!all.length) return '<p>No successful runs to chart.</p>';
  const lo = all[Math.floor(all.length * 0.003)], hi = all[Math.min(all.length - 1, Math.floor(all.length * 0.997))];
  const xs = []; for (let s = lo; s <= hi; s++) xs.push(s);
  const series = res.map((r) => {
    const n = r.total.length || 1; const c = new Map();
    for (const t of r.total) { const s = Math.round(t * 0.6); c.set(s, (c.get(s) || 0) + 1); }
    return xs.map((s) => (c.get(s) || 0) / n * 100);
  });
  const top = Math.max(...series.flat(), 1);
  const W = Math.max(900, xs.length * 22), H = 360, L = 50, B = 46, T = 20, R = 10;
  const pw = W - L - R, ph = H - T - B, slot = pw / xs.length, bw = slot * 0.8 / res.length;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = T + ph - ph * i / 4, v = (top * 1.1 * i / 4).toFixed(1);
    g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 4}" class="ax" text-anchor="end">${v}</text>`;
  }
  series.forEach((ser, k) => ser.forEach((v, i) => {
    if (!v) return;
    const h = ph * v / (top * 1.1), x = L + i * slot + slot * 0.1 + k * bw;
    g += `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(bw * 0.92).toFixed(1)}" height="${h.toFixed(1)}" fill="${COL[k]}"><title>${labels[k]} ${Math.floor(xs[i] / 60)}:${String(xs[i] % 60).padStart(2, '0')} - ${v.toFixed(2)}%</title></rect>`;
  }));
  const step = Math.max(1, Math.ceil(xs.length / 30));
  xs.forEach((s, i) => {
    if (i % step) return;
    const x = L + i * slot + slot / 2;
    g += `<text x="${x}" y="${H - B + 16}" class="ax" text-anchor="middle">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</text>`;
  });
  g += `<text x="14" y="${T + ph / 2}" class="ax" transform="rotate(-90 14 ${T + ph / 2})" text-anchor="middle">% of successful runs</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}

function cumulativeSvg(res, labels) {
  const all = res.flatMap((r) => r.total.map((t) => Math.round(t * 0.6))).sort((a, b) => a - b);
  if (!all.length) return '';
  const lo = all[Math.floor(all.length * 0.003)], hi = all[Math.min(all.length - 1, Math.floor(all.length * 0.997))];
  const xs = []; for (let s = lo; s <= hi; s++) xs.push(s);
  const W = Math.max(900, xs.length * 14), H = 320, L = 50, B = 40, T = 16, R = 16;
  const pw = W - L - R, ph = H - T - B;
  const X = (i) => L + pw * i / Math.max(1, xs.length - 1), Y = (v) => T + ph - ph * v / 100;
  let g = '';
  for (let v = 0; v <= 100; v += 20) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  res.forEach((r, k) => {
    const n = r.total.length || 1; const c = new Map();
    for (const t of r.total) { const s = Math.round(t * 0.6); c.set(s, (c.get(s) || 0) + 1); }
    let run = r.total.filter((t) => Math.round(t * 0.6) < lo).length;
    const cum = xs.map((s) => { run += c.get(s) || 0; return run / n * 100; });
    g += `<polyline fill="none" stroke="${COL[k]}" stroke-width="2.4" points="${cum.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
    for (const qq of [25, 50, 75]) {
      const i = cum.findIndex((v) => v >= qq);
      if (i < 0) continue;
      const s = xs[i], lab = `${qq}% by ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const dy = k === 0 ? 18 : -10, anchor = k === 0 ? 'start' : 'end', dx = k === 0 ? 8 : -8;
      g += `<circle cx="${X(i)}" cy="${Y(cum[i])}" r="5" fill="${COL[k]}" style="stroke:var(--surf)" stroke-width="2"/>`;
      g += `<text x="${X(i) + dx}" y="${Y(cum[i]) + dy}" class="tag" fill="${COL[k]}" text-anchor="${anchor}">${lab}</text>`;
    }
  });
  const step = Math.max(1, Math.ceil(xs.length / 25));
  xs.forEach((s, i) => { if (!(i % step)) g += `<text x="${X(i)}" y="${H - B + 16}" class="ax" text-anchor="middle">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</text>`; });
  g += `<text x="14" y="${T + ph / 2}" class="ax" transform="rotate(-90 14 ${T + ph / 2})" text-anchor="middle">% finished by this time</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}

export const REPORT_CSS = `
.vz-report{--ink:#0b0b0b;--ink2:#52514e;--grid:#e6e5e0;--surf:#fcfcfb;--th:#f3f2ee;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--surf);padding:16px;border-radius:10px}
.vz-report h2{margin:0 0 4px;font-size:20px}.vz-report .sub{color:var(--ink2);font-size:13px;margin-bottom:12px}
.vz-report .kpis{display:flex;gap:28px;flex-wrap:wrap;margin:8px 0 14px}.vz-report .kpi b{font-size:30px;display:block}.vz-report .kpi span{color:var(--ink2);font-size:12px}
.vz-report h3{font-size:15px;margin:18px 0 6px}.vz-report .scroll{overflow-x:auto}
.vz-report svg.chart{width:100%;min-width:640px;height:auto;background:var(--surf)}
.vz-report .grid{stroke:var(--grid)}.vz-report .ax{font-size:11px;fill:var(--ink2)}.vz-report .tag{font-size:12px;font-weight:600}
.vz-report table{border-collapse:collapse;font-size:13px;margin:4px 0 8px}.vz-report th,.vz-report td{border:1px solid var(--grid);padding:5px 10px;text-align:right}
.vz-report th{color:var(--ink2);background:var(--th)}.vz-report td:first-child,.vz-report th:first-child{text-align:left}
.vz-report .legend span{display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-size:13px}.vz-report .legend i{width:12px;height:12px;border-radius:2px;display:inline-block}
`;

/** Report body (a <div class="vz-report">), for embedding in a page. */
export function reportHtml(res, labels, team, runs) {
  const legend = `<div class="legend">${labels.map((l, k) => `<span><i style="background:${COL[k]}"></i>${esc(l)}</span>`).join('')}</div>`;
  const kpis = res.map((r, k) => `<div class="kpi"><b style="color:${COL[k]}">${(r.succ * 100).toFixed(1)}%</b><span>${esc(labels[k])} success</span></div>`).join('');
  const sr = splitRows(res, labels);
  const splits = `<table><tr><th>Split (successful runs)</th><th>Set</th><th>Median</th><th>Top 10%</th><th>Top 25%</th><th>Bottom 25%</th></tr>${
    sr.map((r) => `<tr><td>${r[0]}</td><td style="color:${COL[r[6]]};font-weight:600">${esc(r[1])}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td></tr>`).join('')}</table>`;
  const od = oddsRows(res, team);
  const odds = `<table><tr><th></th>${labels.map((l, k) => `<th style="color:${COL[k]}">${esc(l)}</th>`).join('')}</tr>${
    od.map(([n, vals]) => `<tr><td>${n}</td>${vals.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</table>`;
  const what = team === 2 ? 'success = P2 down in two reds and P3 killed' : 'success = P2 down in reds and P3 killed';
  return `<div class="vz-report">
<h2>${team}-man Verzik: room time${res.length === 2 ? ' comparison' : ''}</h2>
<div class="sub">${runs.toLocaleString()} raids per set · times are total room time · charts use each set's successful runs · ${what} · sim v${VERSION}</div>
<div class="kpis">${kpis}</div>
<h3>Splits</h3>${splits}${team === 2 ? '<div class="sub" style="margin-top:6px">Depth = Verzik HP % when the shield goes up (lower = deeper), averaged over the runs in each room-time bucket (Median = runs around the median room time).</div>' : ''}
<h3>Odds</h3>${odds}
<h3>How often each room time happens (per second)</h3>${legend}<div class="scroll">${histogramSvg(res, labels)}</div>
<h3>Finished by this time or faster</h3>${legend}<div class="scroll">${cumulativeSvg(res, labels)}</div>
</div>`;
}

/** A complete standalone HTML file. */
export function reportPage(res, labels, team, runs) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verzik ${team}-man report</title><style>body{margin:0;padding:16px;background:#fcfcfb}${REPORT_CSS}</style></head>
<body>${reportHtml(res, labels, team, runs)}</body></html>`;
}
