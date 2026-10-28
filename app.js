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
import { createGear } from './gear-ui.js';
import { withGear, importGear, absorbValues } from './engine/gearstore.js';
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
// minimize: hides the import box / builder (the chart is still used); remembered in this browser
const MIN_KEY = 'verzikSim.chartMin.v1';
function setChartMin(on) {
  document.body.classList.toggle('chart-min', on);
  $('chartMin').textContent = on ? 'Show chart' : 'Minimize chart';
  try { localStorage.setItem(MIN_KEY, on ? '1' : ''); } catch { /* storage off */ }
}
$('chartMin').addEventListener('click', () => setChartMin(!document.body.classList.contains('chart-min')));
try { if (localStorage.getItem(MIN_KEY)) setChartMin(true); } catch { /* storage off */ }
$('src').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b && document.body.classList.contains('chart-min')) setChartMin(false);   // picking Import / Build shows the chart again
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
  soloMode();
  if (team() === 1) return;                                              // solos: only the Gear tab for now
  showRunBps();
  if (source === 'build') await builder.show(team());
  if (tab === 'opt') optimizer.refresh();
  if (tab === 'solve') solver.refresh();
  if (room === 'gear') gear.refresh();
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
    // its gear columns -> the Gear tab (each set's gear into the Gear set of the same letter)
    const copied = [];
    for (const n of tabs) {
      const t = Number(n[0]), bySet = {};
      for (const b of ['A', 'B', 'C']) {
        try { const c = await parse_chart(imported, t, null, b, { deferBP: true }); if (filled(c)) bySet[b] = c; } catch { /* shows on Run */ }
      }
      const done = importGear(t, bySet);
      if (done.length) copied.push(`${t}-man ${done.join('/')}`);
    }
    $('status').textContent = `Loaded ${f.name} (${tabs.join(', ')}). Pick a scale, then Run or open the Optimizer.`
      + (copied.length ? ` Its gear was copied into the Gear tab (${copied.join(', ')}).` : '');
    if (room === 'gear') gear.refresh();
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
const optimizer = createOptimizer($('tab-opt'), { getWorkbook, getTeam: team, runReport, toBuilder: (t, b, values) => solverToBuilder(t, b, values),
  getLabel: (b) => $(`lab${b}`).value || `Set ${b}` });                    // Run tab set labels
/** Put chart values into a set of "Build chart on this page" (which then becomes the chart source for Run / Optimizer). */
async function solverToBuilder(t, b, values) {
  absorbValues(t, b, values);                                            // its gear changes go to that set's Gear set
  await builder.setSet(t, b, values);
  if (source !== 'build') $('src').querySelector('[data-src="build"]').click();
  else await builder.show(team());
}
const solver = createSolver($('tab-solve'), {
  getTeam: team,
  // a solver setup -> a set of "Build chart on this page" (which then becomes the chart source for Run / Optimizer)
  toBuilder: async (t, b, values) => {
    absorbValues(t, b, values);
    await builder.setSet(t, b, values);
    if (source !== 'build') $('src').querySelector('[data-src="build"]').click();
    else await builder.show(team());
  },
  saveChart: (t, name, values) => builder.saveChart(t, name, values),
  getWorkbook,                                                            // "Also try my chart": the chart on this page
});
for (const b of ['A', 'B', 'C']) $(`lab${b}`).addEventListener('change', () => { if (tab === 'opt') optimizer.refresh(); });
const gear = createGear($('room-gear'), { getTeam: team });
// top-level tabs: Gear / Verzik (Sotetseg, Xarpus and Full raid come later). Remembered in the address (#gear) and this browser.
const ROOM_KEY = 'verzikSim.room.v1';
let room = 'verzik';
/** Solo: only the Gear tab so far - Verzik is greyed out ("soon") like the other rooms. */
function soloMode() {
  const solo = team() === 1, b = $('rooms').querySelector('[data-room="verzik"]');
  b.disabled = solo;
  b.innerHTML = solo ? 'Verzik <span class="soon">soon</span>' : 'Verzik';
  b.title = solo ? 'Solos are coming soon - the Gear tab works for them already' : '';
  if (solo && room !== 'gear') showRoom('gear');
}
function showRoom(r, push = true) {
  room = r === 'gear' || team() === 1 ? 'gear' : 'verzik';
  [...$('rooms').querySelectorAll('[data-room]')].forEach((b) => b.classList.toggle('on', b.dataset.room === room));
  $('room-gear').hidden = room !== 'gear';
  $('room-verzik').hidden = room !== 'verzik';
  if (room === 'gear') gear.refresh();
  else { if (source === 'build') builder.show(team()); if (tab === 'opt') optimizer.refresh(); if (tab === 'solve') solver.refresh(); }
  try { localStorage.setItem(ROOM_KEY, room); } catch { /* storage off */ }
  if (push && location.hash !== `#${room}`) history.replaceState(null, '', `#${room}`);
}
$('rooms').addEventListener('click', (e) => { const b = e.target.closest('button[data-room]'); if (b) showRoom(b.dataset.room); });
window.addEventListener('hashchange', () => showRoom(location.hash.slice(1), false));
{ let r0 = location.hash.slice(1); if (!r0) { try { r0 = localStorage.getItem(ROOM_KEY) || ''; } catch { r0 = ''; } } showRoom(r0 || 'verzik', false); soloMode(); }
const TABS_MIN_KEY = 'verzikSim.tabsMin.v1';
function setTabsMin(on) {
  document.body.classList.toggle('tabs-min', on);
  $('tabsMin').textContent = on ? 'Show' : 'Minimize';
  try { localStorage.setItem(TABS_MIN_KEY, on ? '1' : ''); } catch { /* storage off */ }
}
try { if (localStorage.getItem(TABS_MIN_KEY)) setTabsMin(true); } catch { /* storage off */ }
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'tabsMin') { setTabsMin(!document.body.classList.contains('tabs-min')); return; }
  if (document.body.classList.contains('tabs-min')) setTabsMin(false);   // picking a tab shows the section again
  tab = b.dataset.tab;
  [...$('tabs').children].forEach((x) => { if (x.dataset.tab) x.classList.toggle('on', x === b); });
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
  if (team() === 1) return;                                              // solos: no Verzik yet
  try {
    const wb = await getWorkbook(); if (!wb) return;
    const c = withGear(await parse_chart(wb, team(), null, 'A', { deferBP: true }), team(), 'A');
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
      try { const c = await parse_chart(wb, t, null, block, { deferBP: true }); if (filled(c)) sets.push([block, withGear(c, t, block)]); } catch (e) { if (block === 'A') throw e; }
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
