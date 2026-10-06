// Optimizer tab: choose inputs to vary, set breakpoints, see the estimated run time, run a staged search.
import { parse_chart } from './engine/sim.js';
import { threadCount, workersAvailable } from './pool.js';
import { catalog, applyCombo, enumerate, DEPTHS, planRaids, score, finalScore, parseBreakpoints, mergeCounts } from './engine/optimize.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = (t) => `${Math.floor(t * 0.6 / 60)}:${(t * 0.6 % 60).toFixed(1).padStart(4, '0')}`;
const fmtS = (s) => `${Math.floor(s / 60)}:${String(Math.round((s % 60) * 10) / 10).padStart(2, '0')}`;
const dur = (sec) => (sec < 90 ? `${Math.max(1, Math.round(sec))} seconds` : sec < 5400 ? `${Math.round(sec / 60)} minutes` : `${(sec / 3600).toFixed(1)} hours`);
const DEFAULT_NUM = { ring: '20, 35, 50, 65, 80', deep: 'off, 40, 42, 44' };
const CORES = threadCount();                    // same worker count as report runs (all logical cores; ?threads=N overrides)
const RATE_KEY = 'verzikSim.rate.v2';   // v2: engine got ~1.4x faster in v1.6.0, so older measurements are stale            // measured raids/second per scale, from finished searches on this computer
const rates = (() => { try { return JSON.parse(localStorage.getItem(RATE_KEY)) || {}; } catch { return {}; } })();
const keepRate = (t, r) => { rates[`${t}:${CORES}`] = r; try { localStorage.setItem(RATE_KEY, JSON.stringify(rates)); } catch { /* ignore */ } };

export function createOptimizer(root, { getWorkbook, getTeam, runReport }) {
  let cfgs = null, team = 0, block = 'A', opts = [], rate = null, rateKey = '', pool = null, stopped = false;
  const sel = {};               // optionId -> {on, text, picks:Set}

  root.innerHTML = `
    <div class="row wrap">
      <label>Set<select id="o-set"><option value="A">Set A</option><option value="B">Set B</option></select></label>
      <label>Breakpoints (m:ss)<input id="o-bps" value="5:21, 5:12, 5:00" style="width:200px"></label>
      <label>Rank by<select id="o-rank"></select></label>
      <label>Search depth<select id="o-depth">${Object.entries(DEPTHS).map(([k, d]) => `<option value="${k}" ${k === 'standard' ? 'selected' : ''}>${d.label}</option>`).join('')}</select></label>
    </div>
    <p class="muted small">Tick the inputs to vary and list the values to try. Every combination is tested on the same raids (same random rolls),
      weak setups are dropped early, and the finalists are re-run on fresh raids so the winner isn't just a lucky one. Rates count all attempts, including failed ones.</p>
    <div id="o-opts"></div>
    <div class="row between" style="margin-top:12px">
      <div id="o-est" class="muted"></div>
      <div class="row"><button id="o-go">Start search</button><button id="o-stop" class="ghost" disabled>Stop</button></div>
    </div>
    <div class="bar"><div id="o-prog"></div></div>
    <div id="o-status" class="muted small" style="margin-top:6px"></div>
    <div id="o-err" class="err"></div>
    <div id="o-out"></div>
    <div id="o-report"></div>`;
  const $ = (id) => root.querySelector(`#${id}`);

  function bps() { try { const b = parseBreakpoints($('o-bps').value); $('o-err').textContent = ''; return b; } catch (e) { $('o-err').textContent = e.message; return null; } }
  function rankOptions() {
    const b = bps() || [];
    const cur = $('o-rank').value;
    $('o-rank').innerHTML = b.map((s, j) => `<option value="${j}">Faster than ${fmtS(s)}</option>`).join('') + `<option value="success">${team === 2 ? '2-down success' : 'Success'}</option>`;
    if ([...$('o-rank').options].some((o) => o.value === cur)) $('o-rank').value = cur;
  }

  function values(o) {
    const s = sel[o.id];
    if (o.kind === 'num') {
      return s.text.split(/[,\s]+/).filter(Boolean).map((x) => (x.toLowerCase() === 'off' ? 'off' : Number(x))).filter((x) => x === 'off' || Number.isFinite(x));
    }
    return o.choices.filter((c) => s.picks.has(c));
  }
  const sweep = () => opts.filter((o) => sel[o.id]?.on).map((o) => ({ id: o.id, values: values(o) })).filter((s) => s.values.length);
  const nCombos = () => sweep().reduce((n, s) => n * s.values.length, 1);

  function renderOpts() {
    const groups = {};
    for (const o of opts) (groups[o.group] ||= []).push(o);
    $('o-opts').innerHTML = Object.entries(groups).map(([g, list]) => `<div class="ogroup"><h4>${esc(g)}</h4>${list.map((o) => {
      const s = sel[o.id];
      const cur = `<span class="muted small">now: ${esc(o.current ?? '-')}</span>`;
      const editor = o.kind === 'num'
        ? `<input data-text="${o.id}" value="${esc(s.text)}" ${s.on ? '' : 'disabled'} style="width:170px">`
        : o.choices.map((c) => `<label class="pick"><input type="checkbox" data-pick="${o.id}" value="${esc(c)}" ${s.picks.has(c) ? 'checked' : ''} ${s.on ? '' : 'disabled'}>${esc(c)}</label>`).join('');
      return `<div class="orow ${s.on ? 'on' : ''}"><label class="vary"><input type="checkbox" data-on="${o.id}" ${s.on ? 'checked' : ''}>${esc(o.label)}</label>${cur}<span class="oed">${editor}</span></div>`;
    }).join('')}</div>`).join('');
    estimate();
  }

  async function calibrate() {
    const key = JSON.stringify([team, block]);
    if (rate && rateKey === key) return rate;
    rateKey = key;
    if (rates[`${team}:${CORES}`]) { rate = rates[`${team}:${CORES}`]; return rate; }   // measured by an earlier search here
    $('o-est').textContent = 'Measuring how fast this computer runs the sim (a few seconds)...';
    const base = applyCombo(cfgs, team, {});
    const own = !pool;
    if (own) pool = makePool();
    try {
      await runBatch([base], 0, 150 * CORES, 12345);                // warm-up: the browser speeds the sim up as it runs
      const t0 = performance.now();
      await runBatch([base], 150 * CORES, 350 * CORES, 12345);
      // the sim keeps speeding up for a while after this; long searches run ~2.5x faster than this short test
      rate = 2.5 * (200 * CORES) / ((performance.now() - t0) / 1000);
    } finally {
      if (own) { pool.forEach((w) => w.terminate()); pool = null; }
    }
    return rate;
  }

  async function estimate() {
    if (!cfgs) { $('o-est').textContent = ''; return; }
    if (!rate) { try { await calibrate(); } catch (e) { $('o-err').textContent = e.message; return; } }
    const n = nCombos(), depth = $('o-depth').value;            // read after the speed test, so the numbers are current
    const raids = planRaids(n, depth);
    const sec = raids / rate;
    $('o-est').innerHTML = `<b>${n.toLocaleString()}</b> setup${n === 1 ? '' : 's'} · ${raids.toLocaleString()} raids · about <b>${dur(sec)}</b> on this computer (${CORES} cores)` +
      (n > 2000 ? ' - <span class="warn">a big search; untick some options or values to speed it up</span>' : '');
  }

  // ---- workers
  function makePool() { return Array.from({ length: CORES }, () => new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })); }
  function runBatch(variants, from, to, seed, onDone) {
    const own = !pool; const ws = pool || makePool();
    const span = to - from, per = Math.ceil(span / ws.length);
    const done = new Array(ws.length).fill(0);
    return Promise.all(ws.map((w, i) => new Promise((res, rej) => {
      const a = from + per * i, b = Math.min(to, a + per);
      if (a >= b) { res(null); return; }
      w.onmessage = (ev) => {
        if (ev.data.progress != null) { done[i] = ev.data.progress; onDone && onDone(done.reduce((s, x) => s + x, 0)); return; }
        if (ev.data.error) { rej(new Error(ev.data.error)); return; }
        res(ev.data.result);
      };
      w.onerror = (ev) => rej(new Error(ev.message || 'worker failed'));
      w.postMessage({ cmd: 'batch', variants, team, from: a, to: b, seed, bps: curBps });
    }))).then((parts) => {
      if (own) ws.forEach((w) => w.terminate());
      parts = parts.filter(Boolean);
      return variants.map((_, v) => parts.reduce((acc, p) => mergeCounts(acc, p[v]), null));
    });
  }
  let curBps = [];

  async function search() {
    $('o-err').textContent = ''; $('o-out').innerHTML = ''; $('o-report').innerHTML = '';
    if (!workersAvailable()) { $('o-err').textContent = "This browser doesn't support Web Workers, which the Optimizer needs. Try a current Chrome, Edge, Firefox or Safari."; return; }
    const b = bps(); if (!b) return;
    curBps = b;
    const metric = $('o-rank').value === 'success' ? 'success' : Number($('o-rank').value);
    const depth = DEPTHS[$('o-depth').value];
    const combos = enumerate(sweep());
    const total = planRaids(combos.length, $('o-depth').value);
    let doneBefore = 0, stageLabel = '';
    const prog = (d) => {
      const done = doneBefore + d, el = (performance.now() - t0) / 1000;
      $('o-prog').style.width = `${Math.min(100, done / total * 100).toFixed(1)}%`;
      if (done > total * 0.03 && el > 3) $('o-status').textContent = `${stageLabel} · about ${dur(el / done * (total - done))} left`;
    };
    stopped = false; $('o-go').disabled = true; $('o-stop').disabled = false;
    pool = makePool();
    const seed = Math.floor(Math.random() * 1e8);
    var t0 = performance.now();
    try {
      let alive = combos.map((c) => ({ combo: c, cfgs: applyCombo(cfgs, team, c), counts: null }));
      const stage = async (list, from, to, sd, label) => {
        stageLabel = `${label}: ${list.length.toLocaleString()} setup${list.length === 1 ? '' : 's'} × ${(to - from).toLocaleString()} raids`;
        $('o-status').textContent = `${stageLabel}...`;
        const res = await runBatch(list.map((x) => x.cfgs), from, to, sd, (d) => prog(d));
        if (stopped) throw new Error('Search stopped.');
        doneBefore += list.length * (to - from);
        return res;
      };
      if (combos.length > depth.keep[1]) {
        let res = await stage(alive, 0, depth.n[0], seed, 'Round 1 (screening)');
        alive.forEach((x, i) => { x.counts = res[i]; });
        alive = alive.sort((a, c) => score(c.counts, metric) - score(a.counts, metric)).slice(0, depth.keep[0]);
        res = await stage(alive, depth.n[0], depth.n[0] + depth.n[1], seed, 'Round 2');
        alive.forEach((x, i) => { x.counts = mergeCounts(x.counts, res[i]); });
        alive = alive.sort((a, c) => score(c.counts, metric) - score(a.counts, metric)).slice(0, depth.keep[1]);
      }
      const finals = [...alive];
      const isChart = (x) => Object.entries(x.combo).every(([id, v]) => String(opts.find((o) => o.id === id)?.current) === String(v));
      finals.forEach((x) => { if (isChart(x)) x.base = true; });
      if (!finals.some(isChart)) {
        finals.push({ combo: {}, cfgs: applyCombo(cfgs, team, {}), base: true });
      }
      const res = await stage(finals, 0, depth.n[2], seed + 7777777, 'Final round (fresh raids)');
      finals.forEach((x, i) => { x.counts = res[i]; });
      finals.sort((a, c) => finalScore(c.counts, metric) - finalScore(a.counts, metric));
      $('o-prog').style.width = '100%';
      const secs = (performance.now() - t0) / 1000;
      if (secs > 20) { rate = total / secs; keepRate(team, rate); }      // better estimates next time
      $('o-status').textContent = `Done in ${dur((performance.now() - t0) / 1000)} · final round: ${depth.n[2].toLocaleString()} fresh raids per setup.`;
      renderResults(finals, metric);
    } catch (e) {
      $('o-err').textContent = e.message;
    } finally {
      pool.forEach((w) => w.terminate()); pool = null;
      $('o-go').disabled = false; $('o-stop').disabled = true;
    }
  }

  function describeCombo(combo) {
    const parts = Object.entries(combo).map(([id, v]) => {
      const o = opts.find((x) => x.id === id);
      const changed = String(o.current) !== String(v);
      const label = o.group === 'Death charges' || o.group === 'Team' ? o.label : `${o.group} ${o.label.toLowerCase()}`;
      return `<span class="${changed ? 'chg' : ''}">${esc(label)}: <b>${esc(v)}</b></span>`;
    });
    return parts.length ? parts.join(' · ') : 'As charted';
  }

  function renderResults(list, metric) {
    const pct = (x, n) => `${(x / n * 100).toFixed(x / n < 0.01 ? 2 : 1)}%`;
    const oneIn = (x, n) => (x ? `1 in ${Math.round(n / x).toLocaleString()}` : '-');
    const head = curBps.map((s) => `<th>Faster than ${fmtS(s)}</th>`).join('');
    $('o-out').innerHTML = `<h3>Results</h3><div class="scroll"><table class="bt res"><tr><th>#</th><th>Setup</th><th>${team === 2 ? '2-down success' : 'Success'}</th>${head}<th>Fastest run</th><th></th></tr>${
      list.map((x, i) => {
        const c = x.counts;
        return `<tr class="${x.base ? 'base' : ''}"><td>${i + 1}</td><td class="setup">${x.base ? '<b>Your chart</b> (as charted)' : describeCombo(x.combo)}</td>
          <td>${pct(c.k, c.n)}</td>${c.under.map((u) => `<td>${pct(u, c.n)}<div class="muted small">${oneIn(u, c.n)}</div></td>`).join('')}
          <td>${c.fastest != null ? `${fmtT(c.fastest)}<div class="muted small">${c.fastestN}× in ${c.n.toLocaleString()}</div>` : '-'}</td>
          <td><button class="ghost sm" data-rep="${i}">Full report vs your chart</button></td></tr>`;
      }).join('')}</table></div>
      <p class="muted small">Highlighted values differ from your chart. Ranked by ${metric === 'success' ? 'success rate' : `rooms faster than ${fmtS(curBps[metric])}`} in the final round.
      Differences under ~${(100 / Math.sqrt(DEPTHS[$('o-depth').value].n[2])).toFixed(1)} points (and much less for rare breakpoints) can be noise - use Thorough to separate close setups.</p>`;
    $('o-out').onclick = async (e) => {
      const b = e.target.closest('button[data-rep]'); if (!b) return;
      const x = list[Number(b.dataset.rep)];
      $('o-report').innerHTML = '<p class="muted">Running the full report...</p>';
      try {
        $('o-report').innerHTML = await runReport([x.cfgs, applyCombo(cfgs, team, {})], [`Setup #${Number(b.dataset.rep) + 1}`, 'Your chart']);
        $('o-report').scrollIntoView({ behavior: 'smooth' });
      } catch (err) { $('o-report').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
    };
  }

  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.on) { sel[t.dataset.on].on = t.checked; renderOpts(); return; }
    if (t.dataset.text) { sel[t.dataset.text].text = t.value; estimate(); return; }
    if (t.dataset.pick) { const s = sel[t.dataset.pick]; t.checked ? s.picks.add(t.value) : s.picks.delete(t.value); estimate(); return; }
    if (t.id === 'o-bps') { rankOptions(); return; }
    if (t.id === 'o-depth') { estimate(); return; }
    if (t.id === 'o-set') { block = t.value; refresh(); }
  });
  $('o-go').addEventListener('click', search);
  $('o-stop').addEventListener('click', () => { stopped = true; if (pool) pool.forEach((w) => w.terminate()); $('o-err').textContent = 'Search stopped.'; $('o-go').disabled = false; $('o-stop').disabled = true; pool = null; });

  async function refresh() {
    $('o-err').textContent = '';
    team = getTeam();
    const wb = await getWorkbook();
    if (!wb) { $('o-opts').innerHTML = '<p class="muted">Import a chart or build one above first.</p>'; cfgs = null; estimate(); return; }
    try { cfgs = await parse_chart(wb, team, null, block); } catch (e) { cfgs = null; $('o-opts').innerHTML = ''; $('o-err').textContent = e.message; return; }
    if (!cfgs.some((c) => c.actions && Object.keys(c.actions).length)) { cfgs = null; $('o-opts').innerHTML = `<p class="muted">Set ${block} of the ${team}-man chart has no P1 chart filled in.</p>`; return; }
    opts = catalog(cfgs, team);
    for (const o of opts) {
      if (!sel[o.id]) sel[o.id] = { on: false, text: o.kind === 'num' ? (o.id.startsWith('ring') ? DEFAULT_NUM.ring : DEFAULT_NUM.deep) : '', picks: new Set(o.choices || []) };
    }
    rankOptions(); renderOpts();
  }
  rankOptions();
  return { refresh };
}
