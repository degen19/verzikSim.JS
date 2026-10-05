// Browser front end: chart source (import or build on the page), Run report, Optimizer, What's new.
import { readXlsx } from './engine/xlsx.js';
import { parse_chart } from './engine/sim.js';
import { mergeResults, reportHtml, reportPage, REPORT_CSS } from './engine/report.js';
import { VERSION, CHANGES } from './engine/version.js';
import { createBuilder } from './builder-ui.js';
import { createOptimizer } from './optimizer-ui.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const style = document.createElement('style'); style.textContent = REPORT_CSS; document.head.appendChild(style);
$('ver').textContent = `v${VERSION}`;
// the walkthrough video only loads when it's opened
$('video').addEventListener('toggle', () => { const f = $('vframe'); if ($('video').open && !f.src) f.src = f.dataset.src; });

let source = 'import', imported = null, importedName = '', lastPage = null, tab = 'run';
const team = () => Number($('team').value);
const filled = (cfgs) => cfgs.some((c) => c.actions && Object.keys(c.actions).length > 0);

let optTimer = null;
const builder = createBuilder($('builder'), { onChange: () => { clearTimeout(optTimer); optTimer = setTimeout(() => { if (tab === 'opt') optimizer.refresh(); }, 800); } });
async function getWorkbook() {
  if (source === 'build') return builder.workbook(team());
  return imported;
}

// ---- chart source
$('src').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  source = b.dataset.src;
  [...$('src').children].forEach((x) => x.classList.toggle('on', x === b));
  $('imp').hidden = source !== 'import';
  $('builder').hidden = source !== 'build';
  if (source === 'build') {
    $('status').textContent = 'Building on the page - fill in the tables below, then Run or open the Optimizer.';
    try { await builder.show(team()); } catch (err) { $('status').textContent = err.message; }
  } else {
    $('status').textContent = imported ? `Using ${importedName}.` : 'Import a chart or switch to "Build chart on this page".';
  }
  if (tab === 'opt') optimizer.refresh();
});
$('team').addEventListener('change', async () => {
  if (source === 'build') await builder.show(team());
  if (tab === 'opt') optimizer.refresh();
});
$('file').addEventListener('change', async (e) => {
  $('err').textContent = '';
  const f = e.target.files[0];
  if (!f) return;
  try {
    imported = await readXlsx(new Uint8Array(await f.arrayBuffer()));
    importedName = f.name;
    const tabs = imported.sheetnames.filter((n) => /^\d-man$/.test(n));
    $('status').textContent = `Loaded ${f.name} (${tabs.join(', ')}). Pick a scale, then Run or open the Optimizer.`;
    $('toBuilder').disabled = false;
    if (tab === 'opt') optimizer.refresh();
  } catch (err) {
    $('status').textContent = `Couldn't read that file: ${err.message}`;
  }
});
$('toBuilder').addEventListener('click', async () => {
  try {
    await builder.importFrom(imported, team());
    $('src').querySelector('[data-src="build"]').click();
  } catch (err) { $('status').textContent = err.message; }
});

// ---- tabs
const optimizer = createOptimizer($('tab-opt'), { getWorkbook, getTeam: team, runReport });
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab;
  [...$('tabs').children].forEach((x) => x.classList.toggle('on', x === b));
  for (const t of ['run', 'opt', 'new']) $(`tab-${t}`).hidden = t !== tab;
  if (tab === 'opt') optimizer.refresh();
});
$('tab-new').innerHTML = `<h3>What's new</h3>${CHANGES.map((c) => `<h4>v${c.version} <span class="muted small">${c.date}</span></h4><ul class="news">${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}`;

// ---- run report
export function runWorkers(cfgs, t, runs, seed, onProgress) {
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
        if (ev.data.progress != null) { done[i] = ev.data.progress; onProgress && onProgress(done.reduce((s, x) => s + x, 0) / runs); return; }
        if (ev.data.error) { reject(new Error(ev.data.error)); w.terminate(); return; }
        resolve(ev.data.result); w.terminate();
      };
      w.onerror = (ev) => { reject(new Error(ev.message)); w.terminate(); };
      w.postMessage({ cmd: 'sim', cfgs, team: t, runs: r, seed: seed * 1000 + i });
    }));
  }
  return Promise.all(jobs).then(mergeResults);
}

/** Used by the Optimizer's "Full report vs your chart". */
async function runReport(cfgsList, labels) {
  const runs = Math.max(100, Number($('runs').value) || 20000);
  const seed = Math.floor(Math.random() * 1e9);
  const res = [];
  for (const c of cfgsList) res.push(await runWorkers(c, team(), runs, seed));
  return reportHtml(res, labels, team(), runs);
}

$('go').addEventListener('click', async () => {
  $('err').textContent = ''; $('out').innerHTML = ''; $('go').disabled = true; $('dl').disabled = true;
  const t = team(), runs = Math.max(100, Number($('runs').value) || 20000);
  const seed = $('seed').value === '' ? Math.floor(Math.random() * 1e9) : Number($('seed').value);
  try {
    const wb = await getWorkbook();
    if (!wb) throw new Error('Import a chart or build one on the page first.');
    const sets = [];
    for (const block of ['A', 'B']) {
      try { const c = await parse_chart(wb, t, null, block); if (filled(c)) sets.push([block, c]); } catch (e) { if (block === 'A') throw e; }
    }
    if (!sets.length) throw new Error(`The ${t}-man chart has no filled P1 chart.`);
    const labels = sets.map(([b]) => (b === 'A' ? $('labA').value || `${t}-man` : $('labB').value || `${t}-man set B`));
    const res = [];
    const t0 = performance.now();
    for (let k = 0; k < sets.length; k++) {
      $('runStatus').textContent = `Running ${labels[k]} (${k + 1} of ${sets.length})...`;
      try {
        res.push(await runWorkers(sets[k][1], t, runs, seed, (f) => {
          $('prog').style.width = `${((k + f) / sets.length * 100).toFixed(1)}%`;
        }));
      } catch (e) {
        throw new Error(`Set ${sets[k][0]} (${labels[k]}): ${e.message}`);
      }
    }
    $('prog').style.width = '100%';
    $('runStatus').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)}s (seed ${seed}).`;
    $('out').innerHTML = reportHtml(res, labels, t, runs);
    lastPage = reportPage(res, labels, t, runs);
    $('dl').disabled = false;
  } catch (err) {
    $('err').textContent = err.message;
    $('runStatus').textContent = '';
  } finally {
    $('go').disabled = false;
  }
});

$('dl').addEventListener('click', () => {
  if (!lastPage) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lastPage], { type: 'text/html' }));
  a.download = `verzik_${team()}man_report.html`;
  a.click();
});
