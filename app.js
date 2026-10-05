// Browser front end: load a chart, run the sim in Web Workers (one per CPU core), show the report.
import { readXlsx } from './engine/xlsx.js';
import { parse_chart } from './engine/sim.js';
import { mergeResults, reportHtml, reportPage, REPORT_CSS } from './engine/report.js';

const $ = (id) => document.getElementById(id);
const style = document.createElement('style'); style.textContent = REPORT_CSS; document.head.appendChild(style);

let wb = null, lastPage = null;
const filled = (cfgs) => cfgs.some((c) => c.actions && Object.keys(c.actions).length > 0);

$('file').addEventListener('change', async (e) => {
  $('err').textContent = '';
  const f = e.target.files[0];
  if (!f) return;
  try {
    wb = await readXlsx(new Uint8Array(await f.arrayBuffer()));
    const tabs = wb.sheetnames.filter((n) => /^\d-man$/.test(n));
    $('status').textContent = `Loaded ${f.name} (${tabs.join(', ')}). Pick a scale and press Run.`;
    $('go').disabled = false;
  } catch (err) {
    $('err').textContent = `Couldn't read that file: ${err.message}`;
  }
});

function runWorkers(cfgs, team, runs, seed, onProgress) {
  const n = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 16));
  const per = Math.ceil(runs / n);
  const done = new Array(n).fill(0);
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const r = Math.min(per, runs - per * i);
    if (r <= 0) break;
    jobs.push(new Promise((resolve, reject) => {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (ev) => {
        if (ev.data.progress != null) { done[i] = ev.data.progress; onProgress(done.reduce((s, x) => s + x, 0) / runs); return; }
        if (ev.data.error) { reject(new Error(ev.data.error)); w.terminate(); return; }
        resolve(ev.data.result); w.terminate();
      };
      w.onerror = (ev) => { reject(new Error(ev.message)); w.terminate(); };
      w.postMessage({ cfgs, team, runs: r, seed: seed * 1000 + i });
    }));
  }
  return Promise.all(jobs).then(mergeResults);
}

$('go').addEventListener('click', async () => {
  $('err').textContent = ''; $('out').innerHTML = ''; $('go').disabled = true; $('dl').disabled = true;
  const team = Number($('team').value), runs = Math.max(100, Number($('runs').value) || 20000);
  const seed = $('seed').value === '' ? Math.floor(Math.random() * 1e9) : Number($('seed').value);
  try {
    const sets = [];
    for (const block of ['A', 'B']) {
      try { const c = await parse_chart(wb, team, null, block); if (filled(c)) sets.push([block, c]); } catch (e) { if (block === 'A') throw e; }
    }
    if (!sets.length) throw new Error(`The ${team}-man tab has no filled P1 chart.`);
    const labels = sets.map(([b]) => (b === 'A' ? $('labA').value || `${team}-man` : $('labB').value || `${team}-man set B`));
    const res = [];
    const t0 = performance.now();
    for (let k = 0; k < sets.length; k++) {
      $('status').textContent = `Running ${labels[k]} (${k + 1} of ${sets.length})...`;
      res.push(await runWorkers(sets[k][1], team, runs, seed, (f) => {
        $('prog').style.width = `${((k + f) / sets.length * 100).toFixed(1)}%`;
      }));
    }
    $('prog').style.width = '100%';
    $('status').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)}s (seed ${seed}).`;
    $('out').innerHTML = reportHtml(res, labels, team, runs);
    lastPage = reportPage(res, labels, team, runs);
    $('dl').disabled = false;
  } catch (err) {
    $('err').textContent = err.message;
    $('status').textContent = '';
  } finally {
    $('go').disabled = false;
  }
});

$('dl').addEventListener('click', () => {
  if (!lastPage) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lastPage], { type: 'text/html' }));
  a.download = `verzik_${$('team').value}man_report.html`;
  a.click();
});
