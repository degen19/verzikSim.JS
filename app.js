// Browser front end: chart source (import or build on the page), Run report, Optimizer, What's new.
import { readXlsx } from './engine/xlsx.js';
import { parse_chart } from './engine/sim.js';
import { mergeResults, reportHtml, reportPage, REPORT_CSS } from './engine/report.js';
import { parseBreakpoints } from './engine/optimize.js';
import { VERSION, CHANGES } from './engine/version.js';
import { createBuilder } from './builder-ui.js';
import { createOptimizer } from './optimizer-ui.js';
import { createMechanics } from './mechanics-ui.js';
import { createSolver } from './solver-ui.js';
import { SimPool } from './pool.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const style = document.createElement('style'); style.textContent = REPORT_CSS; document.head.appendChild(style);
$('ver').textContent = `v${VERSION}`;
// light / dark switch (saved in this browser)
const themeLabel = () => { $('theme').textContent = document.documentElement.dataset.theme === 'dark' ? 'Light mode' : 'Dark mode'; };
themeLabel();
$('theme').addEventListener('click', () => {
  const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('verzikSim.theme', t); } catch { /* ignore */ }
  themeLabel();
});
createMechanics($('mech'), $('mechBody'));
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
  showRunBps();
  if (source === 'build') await builder.show(team());
  if (tab === 'opt') optimizer.refresh();
  if (tab === 'solve') solver.refresh();
  prewarm();
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
    prewarm();
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
const optimizer = createOptimizer($('tab-opt'), { getWorkbook, getTeam: team, runReport,
  getLabel: (b) => $(`lab${b}`).value || `Set ${b}` });                    // Run tab set labels
const solver = createSolver($('tab-solve'), {
  getTeam: team,
  // a solver setup -> a set of "Build chart on this page" (which then becomes the chart source for Run / Optimizer)
  toBuilder: async (t, b, values) => {
    await builder.setSet(t, b, values);
    if (source !== 'build') $('src').querySelector('[data-src="build"]').click();
    else await builder.show(team());
  },
  saveChart: (t, name, values) => builder.saveChart(t, name, values),
  getWorkbook,                                                            // "Also try my chart": the chart on this page
});
for (const b of ['A', 'B', 'C']) $(`lab${b}`).addEventListener('change', () => { if (tab === 'opt') optimizer.refresh(); });
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.tab;
  [...$('tabs').children].forEach((x) => x.classList.toggle('on', x === b));
  for (const t of ['run', 'opt', 'solve', 'new']) $(`tab-${t}`).hidden = t !== tab;
  if (tab === 'opt') optimizer.refresh();
  if (tab === 'solve') solver.refresh();
});
$('tab-new').innerHTML = `<h3>What's new</h3>${CHANGES.map((c) => `<h4>v${c.version} <span class="muted small">${c.date}</span></h4><ul class="news">${c.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`).join('')}`;

// ---- run report (multithreaded via pool.js; one pool, workers reused between runs)
const pool = new SimPool();
let lastInfo = null;
/** Warm the report workers for the current chart (in the background; any error is ignored here). */
async function prewarm() {
  try {
    const wb = await getWorkbook(); if (!wb) return;
    const c = await parse_chart(wb, team(), null, 'A');
    if (filled(c)) pool.warm(c, team());
  } catch { /* a chart problem shows up when the user presses Run */ }
}
export function runWorkers(cfgs, t, runs, seed, onProgress) {
  const p = pool.run(cfgs, t, runs, seed, { onProgress });
  lastInfo = p.info;
  return p;
}

// Run-tab breakpoints: marked on the report's "% of all attempts" chart and added to the Odds table. Remembered in this browser.
// Kept per scale, so duo times don't follow you to 4-man.
const BPS_KEY = 'verzikSim.runBps.v2';
const runBpsSaved = (() => { try { return JSON.parse(localStorage.getItem(BPS_KEY)) || {}; } catch { return {}; } })();
const showRunBps = () => { $('bpsRun').value = runBpsSaved[team()] || ''; };
showRunBps();
$('bpsRun').addEventListener('input', () => { runBpsSaved[team()] = $('bpsRun').value; try { localStorage.setItem(BPS_KEY, JSON.stringify(runBpsSaved)); } catch { /* storage off */ } });
function runBps() {
  const v = $('bpsRun').value.trim();
  if (!v) return [];
  try { return parseBreakpoints(v); } catch (e) { throw new Error(`Breakpoints: ${e.message}`); }
}

/** Used by the Optimizer's "Full report vs your chart". */
async function runReport(cfgsList, labels) {
  const runs = Math.max(100, Number($('runs').value) || 20000);
  const seed = Math.floor(Math.random() * 1e9);
  const res = [];
  for (const c of cfgsList) res.push(await runWorkers(c, team(), runs, seed));
  let breakpoints = []; try { breakpoints = runBps(); } catch { /* a bad Run-tab entry shouldn't block this */ }
  return reportHtml(res, labels, team(), runs, { breakpoints });
}

$('go').addEventListener('click', async () => {
  $('err').textContent = ''; $('out').innerHTML = ''; $('go').disabled = true; $('dl').disabled = true; $('stop').disabled = false;
  const t = team(), runs = Math.max(100, Number($('runs').value) || 20000);
  const seed = $('seed').value === '' ? Math.floor(Math.random() * 1e9) : Number($('seed').value);
  try {
    const breakpoints = runBps();
    const wb = await getWorkbook();
    if (!wb) throw new Error('Import a chart or build one on the page first.');
    const sets = [];
    for (const block of ['A', 'B', 'C']) {
      try { const c = await parse_chart(wb, t, null, block); if (filled(c)) sets.push([block, c]); } catch (e) { if (block === 'A') throw e; }
    }
    if (!sets.length) throw new Error(`The ${t}-man chart has no filled P1 chart.`);
    const notes = sets.flatMap(([b, c]) => (c.notes || []).map((n) => `Set ${b} - ${n}`));
    const scope = $('scope').value;
    for (const s of sets) s[1] = s[1].map((c) => ({ ...c, scope }));                // phases to simulate (see simulate.js)
    const labels = sets.map(([b]) => $(`lab${b}`).value || (b === 'A' ? `${t}-man` : `${t}-man set ${b}`));
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
    const secs = (performance.now() - t0) / 1000;
    $('err').textContent = notes.length ? `Chart notes:\n${notes.join('\n')}` : '';
    $('runStatus').textContent = `Done in ${secs.toFixed(1)}s · ${Math.round(runs * sets.length / secs).toLocaleString()} raids/s · ${lastInfo ? lastInfo.mode : ''} (seed ${seed}).`;
    $('out').innerHTML = reportHtml(res, labels, t, runs, { breakpoints });
    lastPage = reportPage(res, labels, t, runs, { breakpoints });
    $('dl').disabled = false;
  } catch (err) {
    $('err').textContent = err.message;
    $('runStatus').textContent = '';
  } finally {
    $('go').disabled = false; $('stop').disabled = true;
  }
});
$('stop').addEventListener('click', () => { pool.stop(); $('stop').disabled = true; });

$('dl').addEventListener('click', () => {
  if (!lastPage) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lastPage], { type: 'text/html' }));
  a.download = `verzik_${team()}man_report.html`;
  a.click();
});
