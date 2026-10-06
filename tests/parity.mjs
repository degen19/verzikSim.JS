#!/usr/bin/env node
// Multithreading checks:
//  1. identical results: the same seed gives exactly the same merged result on 1, 2 and N threads
//  2. same statistics as the old single-stream path (simulate() with one RNG for the whole run)
//  3. speed: raids/second on 1 thread vs N threads
//
//   node tests/parity.mjs my_chart.xlsx --team 2 [--runs 20000] [--set A] [--seed 12345]
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { readXlsx } from '../engine/xlsx.js';
import { parse_chart } from '../engine/sim.js';
import { simulate } from '../engine/simulate.js';
import { planChunks, mergeResults, runChunksSequential, workerCount } from '../engine/parallel.js';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const chart = argv[0], team = Number(opt('team', 2)), runs = Number(opt('runs', 20000)), set = opt('set', 'A'), seed = Number(opt('seed', 12345));
if (!chart) { console.log('usage: node tests/parity.mjs chart.xlsx --team 2 [--runs 20000] [--set A] [--seed 12345]'); process.exit(1); }
const cfgs = await parse_chart(await readXlsx(readFileSync(chart)), team, null, set);

function parallel(threads) {
  const chunks = planChunks(runs), results = new Array(chunks.length), queue = chunks.slice();
  const file = fileURLToPath(new URL('../cli/worker.mjs', import.meta.url));
  let finished = 0;
  return new Promise((resolve, reject) => {
    const ws = Array.from({ length: Math.min(threads, chunks.length) }, () => new Worker(file));
    const feed = (w) => { const c = queue.shift(); if (c) w.postMessage({ cmd: 'chunk', k: c.k, runs: c.runs, seed }); };
    for (const w of ws) {
      w.on('message', (d) => {
        if (d.error) { ws.forEach((x) => x.terminate()); reject(new Error(d.error)); return; }
        results[d.k] = d.result;
        if (++finished === chunks.length) { ws.forEach((x) => x.terminate()); resolve(mergeResults(results)); } else feed(w);
      });
      w.on('error', reject);
      w.postMessage({ cmd: 'init', cfgs, team });
      feed(w);
    }
  });
}
const timed = async (f) => { const t0 = performance.now(); const r = await f(); return [r, (performance.now() - t0) / 1000]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const N = workerCount(cpus().length);

console.log(`${team}-man set ${set}, ${runs.toLocaleString()} raids, seed ${seed}, ${cpus().length} logical cores -> ${N} worker(s)\n`);

// 1. identical across thread counts
const [one, t1] = await timed(async () => runChunksSequential(cfgs, team, runs, seed));
const counts = [...new Set([2, N].filter((n) => n >= 2))];
let allSame = true;
for (const n of counts) {
  const r = await parallel(n);
  const same = JSON.stringify(r) === JSON.stringify(one);
  allSame &&= same;
  console.log(`1. ${n} threads vs 1 thread: ${same ? 'IDENTICAL' : 'DIFFERENT'}`);
}

// 2. statistics vs the old single-stream simulate()
const old = simulate(cfgs, team, runs, seed);
const p1 = one.succ, p0 = old.succ, se = Math.sqrt(p0 * (1 - p0) / runs + p1 * (1 - p1) / runs);
const m1 = mean(one.total), m0 = mean(old.total), seM = Math.sqrt(sd(one.total) ** 2 / one.total.length + sd(old.total) ** 2 / old.total.length);
console.log(`\n2. chunked vs old single-stream (different random rolls, so only noise-level differences expected):`);
console.log(`   success   ${(p1 * 100).toFixed(2)}% vs ${(p0 * 100).toFixed(2)}%   (z = ${((p1 - p0) / se).toFixed(2)})`);
console.log(`   mean time ${(m1 * 0.6).toFixed(2)}s vs ${(m0 * 0.6).toFixed(2)}s   (z = ${((m1 - m0) / seM).toFixed(2)})`);
console.log('   |z| under ~2 = consistent');

// 3. speed
const [, tN] = await timed(() => parallel(N));
console.log(`\n3. speed: 1 thread ${(runs / t1).toFixed(0)} raids/s (${t1.toFixed(1)}s) · ${N} threads ${(runs / tN).toFixed(0)} raids/s (${tN.toFixed(1)}s) · ${(t1 / tN).toFixed(2)}x faster`);
process.exit(allSame ? 0 : 1);
