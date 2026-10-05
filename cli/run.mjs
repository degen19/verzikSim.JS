#!/usr/bin/env node
// Run the sim from the command line (uses all CPU cores) and write an HTML report.
//   node cli/run.mjs my_chart.xlsx --team 2
//   node cli/run.mjs my_chart.xlsx --team 4 --runs 50000 --seed 1 --labels "Setup A" "Setup B" --out report.html
//   node cli/run.mjs my_chart.xlsx --all            (every filled tab: 2, 3, 4 and 5-man)
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../engine/xlsx.js';
import { parse_chart } from '../engine/sim.js';
import { mergeResults, reportPage } from '../engine/report.js';

function args() {
  const a = process.argv.slice(2), o = { runs: 20000, seed: null, labels: null, team: null, out: null, all: false };
  o.chart = a[0];
  for (let i = 1; i < a.length; i++) {
    if (a[i] === '--team') o.team = Number(a[++i]);
    else if (a[i] === '--runs') o.runs = Number(a[++i]);
    else if (a[i] === '--seed') o.seed = Number(a[++i]);
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--all') o.all = true;
    else if (a[i] === '--labels') { o.labels = [a[++i], a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : undefined].filter(Boolean); }
  }
  if (!o.chart || (!o.team && !o.all)) {
    console.log('usage: node cli/run.mjs chart.xlsx --team 2|3|4|5 [--runs 20000] [--seed N] [--labels "A" "B"] [--out report.html]\n' +
                '       node cli/run.mjs chart.xlsx --all');
    process.exit(1);
  }
  return o;
}

const filled = (cfgs) => cfgs.some((c) => c.actions && Object.keys(c.actions).length > 0);

function runParallel(cfgs, team, runs, seed) {
  const n = Math.max(1, Math.min(cpus().length, 16));
  const per = Math.ceil(runs / n);
  const base = seed ?? Math.floor(Math.random() * 1e9);
  const worker = fileURLToPath(new URL('./worker.mjs', import.meta.url));
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const r = Math.min(per, runs - per * i);
    if (r <= 0) break;
    jobs.push(new Promise((res, rej) => {
      const w = new Worker(worker, { workerData: { cfgs, team, runs: r, seed: base * 1000 + i } });
      w.on('message', res); w.on('error', rej);
    }));
  }
  return Promise.all(jobs).then(mergeResults);
}

const o = args();
const wb = await readXlsx(readFileSync(o.chart));
const teams = o.all ? [2, 3, 4, 5] : [o.team];
for (const team of teams) {
  let A, B;
  try { A = await parse_chart(wb, team, null, 'A'); } catch { A = null; }
  try { B = await parse_chart(wb, team, null, 'B'); } catch { B = null; }
  const sets = [];
  if (A && filled(A)) sets.push(A);
  if (B && filled(B)) sets.push(B);
  if (!sets.length) { if (!o.all) console.log(`${team}-man: no filled set found`); continue; }
  const labels = o.labels && o.labels.length === sets.length ? o.labels
    : sets.length === 2 ? [`${team}-man`, `${team}-man set B`] : [`${team}-man${sets[0] === B ? ' set B' : ''}`];
  const t0 = Date.now();
  const res = [];
  try {
    for (const cf of sets) res.push(await runParallel(cf, team, o.runs, o.seed));
  } catch (e) {
    console.log(`${team}-man: ${e.message}`);
    continue;
  }
  const out = o.out && !o.all ? o.out : `verzik_${team}man_report.html`;
  writeFileSync(out, reportPage(res, labels, team, o.runs));
  res.forEach((r, k) => console.log(`${labels[k]}: success ${(r.succ * 100).toFixed(2)}%`));
  console.log(`${team}-man done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
}
