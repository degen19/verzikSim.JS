#!/usr/bin/env node
// Verz Solver, P1 chart only: node cli/solve.mjs chart.xlsx --team 5 [--set A] [--beam 300] [--sim 2000] [--top 15] [--transfers 1]
import { readFileSync } from 'node:fs';
import { readXlsx } from '../engine/xlsx.js';
import { parse_chart } from '../engine/sim.js';
import { makeContext, solve, simP1, killTick, chartKey } from '../engine/solver.js';
import { checkRow } from '../engine/chartform.js';

const a = process.argv.slice(2), o = { team: 5, set: 'A', beam: 300, sim: 2000, top: 15, transfers: 1, slots: 16, bps: '' };
o.chart = a[0];
for (let i = 1; i < a.length; i++) { const k = a[i].replace(/^--/, ''); if (k in o) o[k] = isNaN(Number(a[i + 1])) ? a[++i] : Number(a[++i]); }
const fmt = (t) => { const s = t * 0.6; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const cfgs = await parse_chart(await readXlsx(readFileSync(o.chart)), o.team, null, o.set);
const ctx = makeContext(cfgs, o.team, { transfers: !!o.transfers });
console.log(`${o.team}-man set ${o.set}: ${ctx.players.map((p) => `${p.name}${p.lb ? ' (LB)' : ''}`).join(', ')} | SB owner: ${ctx.sb != null ? ctx.players[ctx.sb].name : 'none'} | transfers ${o.transfers ? 'on' : 'off'}`);
const steps = (r) => { let c = 0; return Object.entries(r.byTick).map(([t, n]) => [Number(t), n]).sort((x, y) => x[0] - y[0]).slice(0, 4).map(([t, n]) => { c += n; return `${fmt(t)} ${(c / r.runs * 100).toFixed(1)}%`; }).join(' · '); };
const line = (label, r, extra = '') => console.log(`${label.padEnd(12)} top-10% ${fmt(r.top10)} | fastest-10% avg ${(r.cvar * 0.6).toFixed(2)}s | median ${fmt(r.median)} | ends by ${steps(r)}${extra}`);

const asCharted = cfgs.map((c) => c.actions || {});
const hasChart = asCharted.some((x) => Object.keys(x).length);   // a blank chart: nothing to compare against
const mine = hasChart ? simP1(cfgs, o.team, asCharted, o.sim) : null;
if (mine) line('Your chart', mine, ` | analytic ${(killTick(ctx, asCharted).cvar * 0.6).toFixed(2)}s`);
else console.log('Your chart   (blank - no comparison)');

const bps = String(o.bps || '').split(/[,\s]+/).filter(Boolean).map((x) => { const [m, sec] = x.split(':'); return Number(m) * 60 + Number(sec); });
const under = (r, b) => Object.entries(r.byTick).reduce((n, [t, c]) => n + (Number(t) * 0.6 < b - 1e-9 ? c : 0), 0) / r.runs;

const t0 = Date.now();
const res = solve(ctx, { beam: o.beam, slots: o.slots });
console.log(`Search: ${res.tried.toLocaleString()} rotations tried, ${res.tops.length} charts scored in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const finals = res.tops.slice(0, o.top);
for (const f of finals) f.sim = simP1(cfgs, o.team, f.built.acts, o.sim, 'solver', f.plan.start);
finals.sort((x, y) => x.sim.cvar - y.sim.cvar || x.sim.median - y.sim.median);
// the top 5 are re-checked on 4x more fresh raids (so a lucky run can't win), your chart on the same raids
const top = [], tseen = new Set();               // five different charts (same up to the kill = same option)
// same damage up to the median kill (surge / transfer ticks aside), or the same chart with identical players swapped
for (const f of finals) { const k = chartKey(ctx, f.built.acts, f.sim.median, f.plan.start); if (!tseen.has(k)) { tseen.add(k); top.push(f); } if (top.length === 5) break; }
for (const f of top) f.sim = simP1(cfgs, o.team, f.built.acts, o.sim * 4, 'confirm', f.plan.start);
top.sort((x, y) => x.sim.cvar - y.sim.cvar || x.sim.median - y.sim.median);
const mine4 = hasChart ? simP1(cfgs, o.team, asCharted, o.sim * 4, 'confirm') : null;

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const head = ['#', 'Top-10%', 'Fastest-10% avg', 'Median', 'P1 success', ...bps.map((b) => `Under ${fmt(b / 0.6)}`), 'Dawns', 'Transfers', 'Start spec'];
const row = (lab, r, plan, built) => [lab, fmt(r.top10), `${(r.cvar * 0.6).toFixed(2)}s`, fmt(r.median), pct(r.killed), ...bps.map((b) => pct(under(r, b))),
  built ? String(built.dawnTicks.length) : '-', plan ? String(plan.slots.filter((x) => x.st != null).length) : '-', plan ? plan.start.join('/') : '-'];
const rows = [...top.map((f, i) => row(String(i + 1), f.sim, f.plan, f.built)), ...(mine4 ? [row('Yours', mine4, null, null)] : [])];
const wd = head.map((h, j) => Math.max(h.length, ...rows.map((r) => r[j].length)));
console.log(`\nTop 5 (${(o.sim * 4).toLocaleString()} raids each, P1 only)`);
console.log(head.map((h, j) => h.padEnd(wd[j])).join('  '));
for (const r of rows) console.log(r.map((c, j) => c.padEnd(wd[j])).join('  '));

const printChart = (acts, end, start) => {
  console.log('tick'.padEnd(13) + 'start' + Array.from({ length: end }, (_, i) => String(i + 1).padStart(4)).join(''));
  acts.forEach((x, k) => console.log(ctx.players[k].name.slice(0, 12).padEnd(13) + `${start[k]}%`.padStart(5) + Array.from({ length: end }, (_, i) => String(x[i + 1] ?? '.').padStart(4)).join('')
    + `   ${checkRow(x, cfgs[k].has3Tick, o.team) || 'ok'}`));
};
top.forEach((f, i) => {
  console.log(`\n#${i + 1}  top-10% ${fmt(f.sim.top10)} · fastest-10% avg ${(f.sim.cvar * 0.6).toFixed(2)}s · median ${fmt(f.sim.median)} · start ${f.plan.start.join('/')}`);
  console.log(`    Dawns: ${f.built.dawnTicks.map(([t, h]) => `${t} ${ctx.players[h].name}`).join(' | ')}`);
  printChart(f.built.acts, Math.min(66, f.sim.median + 2), f.plan.start);
});
