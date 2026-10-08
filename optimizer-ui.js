// Optimizer tab: choose inputs to vary, set breakpoints, see the estimated run time, run a staged search.
import { parse_chart } from './engine/sim.js';
import { threadCount, workersAvailable } from './pool.js';
import { catalog, applyCombo, validCfgs, enumerate, DEPTHS, planRaids, score, finalScore, parseBreakpoints, mergeCounts } from './engine/optimize.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = (t) => `${Math.floor(t * 0.6 / 60)}:${(t * 0.6 % 60).toFixed(1).padStart(4, '0')}`;
const fmtS = (s) => `${Math.floor(s / 60)}:${String(Math.round((s % 60) * 10) / 10).padStart(2, '0')}`;
const dur = (sec) => (sec < 90 ? `${Math.max(1, Math.round(sec))} seconds` : sec < 5400 ? `${Math.round(sec / 60)} minutes` : `${(sec / 3600).toFixed(1)} hours`);
const DEFAULT_NUM = { ring: '20, 35, 50, 65, 80', deep: 'off, 40, 42, 44' };
const CORES = threadCount();                    // same worker count as report runs (all logical cores; ?threads=N overrides)
const BPS_KEY = 'verzikSim.optBps.v1';  // breakpoints typed per scale: {team: text}
const RATE_KEY = 'verzikSim.rate.v2';   // v2: engine got ~1.4x faster in v1.6.0, so older measurements are stale            // measured raids/second per scale, from finished searches on this computer
const rates = (() => { try { return JSON.parse(localStorage.getItem(RATE_KEY)) || {}; } catch { return {}; } })();
const keepRate = (key, r) => { rates[key] = r; try { localStorage.setItem(RATE_KEY, JSON.stringify(rates)); } catch { /* ignore */ } };

export function createOptimizer(root, { getWorkbook, getTeam, runReport, getLabel = (b) => `Set ${b}` }) {
  // cfgs / opts: the first chosen set's chart and the union of every chosen set's options (a sweep is applied to each set)
  let cfgs = null, team = 0, opts = [], rate = null, rateKey = '', pool = null, stopped = false;
  let filledSets = [], chosen = new Set(['A']), sets = [];   // sets: [{block, cfgs, opts}] for the chosen, filled sets
  let combineView = false, lastResults = null;
  const sel = {};               // optionId -> {on, text, picks:Set}
  const openGroups = new Set(['Death charges', 'Team']);   // player groups start collapsed (state kept while the page is open)

  root.innerHTML = `
    <div class="row wrap">
      <div title="Every ticked set is searched with the same options, on the same raids. Each gets its own results table (or one combined ranking)."><div class="muted small">Sets</div><div id="o-sets" class="row" style="gap:8px"></div></div>
      <label title="Target room times for this scale. Leave blank to rank by success rate.">Breakpoints (m:ss)<input id="o-bps" placeholder="m:ss, comma-separated" style="width:200px"></label>
      <label title="How far each raid is simulated. Breakpoints and success then refer to the end of that phase.">Phases<select id="o-scope"><option value="full">Full raid</option><option value="p2">P1 + P2 (to end of P2)</option><option value="p1">P1 only</option></select></label>
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
  const scope = () => $('o-scope').value;
  /** The chart with the chosen phases on every player's config (simulate.js / optimize.js runOne read cfgs[k].scope). */
  const scopedOf = (cf) => cf.map((c) => ({ ...c, scope: scope() }));
  const scoped = () => scopedOf(cfgs);
  const rateId = () => `${team}:${scope()}:${CORES}`;

  const savedBps = (() => { try { return JSON.parse(localStorage.getItem(BPS_KEY)) || {}; } catch { return {}; } })();
  const keepBps = () => { savedBps[team] = $('o-bps').value; try { localStorage.setItem(BPS_KEY, JSON.stringify(savedBps)); } catch { /* ignore */ } };
  /** Breakpoints in seconds; [] when the box is blank (rank by success only); null (with a message) when it can't be read. */
  function bps() {
    if (!$('o-bps').value.trim()) { $('o-err').textContent = ''; return []; }
    try { const b = parseBreakpoints($('o-bps').value); $('o-err').textContent = ''; return b; } catch (e) { $('o-err').textContent = e.message; return null; }
  }
  function rankOptions() {
    const b = bps() || [];
    const cur = $('o-rank').value;
    $('o-rank').innerHTML = b.map((s, j) => `<option value="${j}">Faster than ${fmtS(s)}</option>`).join('') + `<option value="success">${scope() === 'p1' ? 'P1 killed' : team === 2 ? '2-down success' : scope() === 'p2' ? 'P2 down in reds' : 'Success'}</option>`;
    if ([...$('o-rank').options].some((o) => o.value === cur)) $('o-rank').value = cur;
    $('o-rank').title = b.length ? '' : 'Add breakpoints to rank by a room time';
  }

  function values(o) {
    const s = sel[o.id];
    if (o.kind === 'num') {
      return s.text.split(/[,\s]+/).filter(Boolean).map((x) => (x.toLowerCase() === 'off' ? 'off' : Number(x))).filter((x) => x === 'off' || Number.isFinite(x));
    }
    return o.choices.filter((c) => s.picks.has(c));
  }
  const sweep = () => opts.filter((o) => sel[o.id]?.on).map((o) => ({ id: o.id, values: values(o) })).filter((s) => s.values.length);
  const nCombos = () => {
    const n = sweep().reduce((m, s) => m * s.values.length, 1);
    if (n > 20000 || !cfgs) return n;                             // count only valid setups (shadow rules) when cheap to
    return enumerate(sweep()).filter((c) => validCfgs(applyCombo(cfgs, team, c))).length;
  };

  function renderOpts() {
    const groups = {};
    for (const o of opts) (groups[o.group] ||= []).push(o);
    const head = `<div class="row" style="margin-bottom:6px"><button class="ghost sm" data-groups="open">Expand all</button><button class="ghost sm" data-groups="close">Collapse all</button></div>`;
    $('o-opts').innerHTML = head + Object.entries(groups).map(([g, list]) => {
      const n = list.filter((o) => sel[o.id].on).length;
      return `<details class="ogroup" data-group="${esc(g)}" ${openGroups.has(g) ? 'open' : ''}><summary><h4 style="display:inline">${esc(g)}</h4> <span class="muted small">${n ? `${n} varied` : `${list.length} option${list.length === 1 ? '' : 's'}`}</span></summary>${list.map((o) => {
      const s = sel[o.id];
      const cur = `<span class="muted small">now: ${esc(o.current ?? '-')}</span>`;
      const editor = o.kind === 'num'
        ? `<input data-text="${o.id}" value="${esc(s.text)}" ${s.on ? '' : 'disabled'} style="width:170px">`
        : o.choices.map((c) => `<label class="pick"><input type="checkbox" data-pick="${o.id}" value="${esc(c)}" ${s.picks.has(c) ? 'checked' : ''} ${s.on ? '' : 'disabled'}>${esc(c)}</label>`).join('');
      return `<div class="orow ${s.on ? 'on' : ''}"><label class="vary"><input type="checkbox" data-on="${o.id}" ${s.on ? 'checked' : ''}>${esc(o.label)}</label>${cur}<span class="oed">${editor}</span></div>`;
    }).join('')}</details>`;
    }).join('');
    estimate();
  }

  // The speed test runs once at a time. A search started meanwhile waits for it (they used to share the worker pool,
  // and the test's clean-up shut down the search's workers, so the search hung with no progress).
  let calibrating = null;
  function calibrate() {
    if (!calibrating) calibrating = calibrateNow().finally(() => { calibrating = null; });
    return calibrating;
  }
  async function calibrateNow() {
    const key = JSON.stringify([team, sets.map((x) => x.block).join(''), scope()]);
    if (rate && rateKey === key) return rate;
    rateKey = key;
    if (rates[rateId()]) { rate = rates[rateId()]; return rate; }   // measured by an earlier search here
    $('o-est').textContent = 'Measuring how fast this computer runs the sim (a few seconds)...';
    const base = applyCombo(scoped(), team, {});
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
    const n = nCombos(), depth = $('o-depth').value, k = Math.max(1, sets.length);   // read after the speed test
    const raids = planRaids(n, depth) * k;
    const sec = raids / rate;
    $('o-est').innerHTML = `<b>${n.toLocaleString()}</b> setup${n === 1 ? '' : 's'}${k > 1 ? ` × ${k} sets` : ''} · ${raids.toLocaleString()} raids · about <b>${dur(sec)}</b> on this computer (${CORES} cores)` +
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
    if (calibrating) {
      $('o-status').textContent = 'Finishing the speed test first...';
      try { await calibrating; } catch { /* the search measures its own speed anyway */ }
    }
    curBps = b;
    const metric = $('o-rank').value === 'success' ? 'success' : Number($('o-rank').value);
    const depth = DEPTHS[$('o-depth').value];
    const combos = enumerate(sweep());
    const total = planRaids(combos.length, $('o-depth').value) * sets.length;
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
      // every chosen set gets the same combos; all sets' setups run together on the same raids, pruning is per set
      const stage = async (list, from, to, sd, label) => {
        stageLabel = `${label}: ${list.length.toLocaleString()} setup${list.length === 1 ? '' : 's'} × ${(to - from).toLocaleString()} raids`;
        $('o-status').textContent = `${stageLabel}...`;
        const res = await runBatch(list.map((x) => x.cfgs), from, to, sd, (d) => prog(d));
        if (stopped) throw new Error('Search stopped.');
        doneBefore += list.length * (to - from);
        return res;
      };
      const isChart = (x) => Object.entries(x.combo).every(([id, v]) => { const o = x.set.opts.find((y) => y.id === id); return !o || String(o.current) === String(v); });
      const best = (list, n, fn) => list.slice().sort((a, c) => fn(c.counts, metric) - fn(a.counts, metric)).slice(0, n);
      // per set: keep only the options that set has, and drop combos that become the same setup there
      let perSet = sets.map((st) => {
        const seen = new Set(), out = [];
        for (const c of combos) {
          const own = Object.fromEntries(Object.entries(c).filter(([id]) => st.opts.some((o) => o.id === id)));
          const key = JSON.stringify(own); if (seen.has(key)) continue; seen.add(key);
          const cf = applyCombo(scopedOf(st.cfgs), team, own);
          if (!validCfgs(cf)) continue;                            // e.g. Shadow camp + 3:1
          out.push({ combo: own, set: st, cfgs: cf, counts: null });
        }
        return out;
      });
      if (combos.length > depth.keep[1]) {
        let flat = perSet.flat(); let res = await stage(flat, 0, depth.n[0], seed, 'Round 1 (screening)');
        flat.forEach((x, i) => { x.counts = res[i]; });
        perSet = perSet.map((l) => best(l, depth.keep[0], score));
        flat = perSet.flat(); res = await stage(flat, depth.n[0], depth.n[0] + depth.n[1], seed, 'Round 2');
        flat.forEach((x, i) => { x.counts = mergeCounts(x.counts, res[i]); });
        perSet = perSet.map((l) => best(l, depth.keep[1], score));
      }
      perSet.forEach((l, k) => {                                   // each set's own chart is always in its final round
        l.forEach((x) => { if (isChart(x)) x.base = true; });
        if (!l.some((x) => x.base)) l.push({ combo: {}, set: sets[k], cfgs: applyCombo(scopedOf(sets[k].cfgs), team, {}), base: true });
      });
      const finals = perSet.flat();
      const res = await stage(finals, 0, depth.n[2], seed + 7777777, 'Final round (fresh raids)');
      finals.forEach((x, i) => { x.counts = res[i]; });
      perSet = perSet.map((l) => l.slice().sort((a, c) => finalScore(c.counts, metric) - finalScore(a.counts, metric)));
      $('o-prog').style.width = '100%';
      const secs = (performance.now() - t0) / 1000;
      if (secs > 20) { rate = total / secs; keepRate(rateId(), rate); }      // better estimates next time
      $('o-status').textContent = `Done in ${dur((performance.now() - t0) / 1000)} · final round: ${depth.n[2].toLocaleString()} fresh raids per setup.`;
      renderResults(perSet, metric);
    } catch (e) {
      $('o-err').textContent = e.message;
    } finally {
      pool.forEach((w) => w.terminate()); pool = null;
      $('o-go').disabled = false; $('o-stop').disabled = true;
    }
  }

  function describeCombo(combo, setOpts = opts) {
    const parts = Object.entries(combo).filter(([id]) => setOpts.some((x) => x.id === id)).map(([id, v]) => {
      const o = setOpts.find((x) => x.id === id);
      const changed = String(o.current) !== String(v);
      const label = o.group === 'Death charges' || o.group === 'Team' ? o.label : `${o.group} ${o.label.toLowerCase()}`;
      return `<span class="${changed ? 'chg' : ''}">${esc(label)}: <b>${esc(v)}</b></span>`;
    });
    return parts.length ? parts.join(' · ') : 'As charted';
  }

  /** perSet: [[setup, ...] per chosen set], each sorted best first. One table per set, or one combined ranking. */
  function renderResults(perSet, metric) {
    lastResults = [perSet, metric];
    const pct = (x, n) => `${(x / n * 100).toFixed(x / n < 0.01 ? 2 : 1)}%`;
    const oneIn = (x, n) => (x ? `1 in ${Math.round(n / x).toLocaleString()}` : '-');
    const multi = perSet.length > 1;
    const succ = scope() === 'p1' ? 'P1 killed' : team === 2 ? '2-down success' : scope() === 'p2' ? 'P2 down' : 'Success';
    const head = (withSet) => `<tr><th>#</th>${withSet ? '<th>Set</th>' : ''}<th>Setup</th><th>${succ}</th>${curBps.map((x) => `<th>Faster than ${fmtS(x)}</th>`).join('')}<th>Fastest run</th><th></th></tr>`;
    const all = [];                                              // [setup, index for the report button]
    const row = (x, rank, withSet) => {
      const c = x.counts, idx = all.push(x) - 1;
      return `<tr class="${x.base ? 'base' : ''}"><td>${rank}</td>${withSet ? `<td><b>${esc(getLabel(x.set.block))}</b></td>` : ''}
        <td class="setup">${x.base ? (multi ? '<b>As charted</b>' : '<b>Your chart</b> (as charted)') : describeCombo(x.combo, x.set.opts)}</td>
        <td>${pct(c.k, c.n)}</td>${c.under.map((u) => `<td>${pct(u, c.n)}<div class="muted small">${oneIn(u, c.n)}</div></td>`).join('')}
        <td>${c.fastest != null ? `${fmtT(c.fastest)}<div class="muted small">${c.fastestN}× in ${c.n.toLocaleString()}</div>` : '-'}</td>
        <td><button class="ghost sm" data-rep="${idx}" title="Full report: this setup vs ${esc(getLabel(x.set.block))} as charted">Full report</button></td></tr>`;
    };
    let body;
    if (multi && combineView) {
      const merged = perSet.flat().sort((a, c) => finalScore(c.counts, metric) - finalScore(a.counts, metric));
      body = `<h4>All sets, one ranking</h4><div class="scroll"><table class="bt res">${head(true)}${merged.map((x, i) => row(x, i + 1, true)).join('')}</table></div>`;
    } else {
      body = perSet.map((l) => `${multi ? `<h4>${esc(getLabel(l[0].set.block))}</h4>` : ''}<div class="scroll"><table class="bt res">${head(false)}${l.map((x, i) => row(x, i + 1, false)).join('')}</table></div>`).join('');
    }
    $('o-out').innerHTML = `<div class="row between"><h3>Results</h3>${multi ? `<label class="pick"><input type="checkbox" id="o-combine" ${combineView ? 'checked' : ''}>Combine into one ranked list</label>` : ''}</div>${body}
      <p class="muted small">Highlighted values differ from that set's chart. Ranked by ${metric === 'success' ? 'success rate' : `rooms faster than ${fmtS(curBps[metric])}`} in the final round${multi ? ' (every set\'s finalists ran on the same fresh raids, so sets compare fairly)' : ''}.
      Differences under ~${(100 / Math.sqrt(DEPTHS[$('o-depth').value].n[2])).toFixed(1)} points (and much less for rare breakpoints) can be noise - use Thorough to separate close setups.</p>`;
    $('o-out').onclick = async (e) => {
      const b = e.target.closest('button[data-rep]'); if (!b) return;
      const x = all[Number(b.dataset.rep)], lab = getLabel(x.set.block);
      $('o-report').innerHTML = '<p class="muted">Running the full report...</p>';
      try {
        $('o-report').innerHTML = await runReport([x.cfgs, applyCombo(scopedOf(x.set.cfgs), team, {})],
          [x.base ? `${lab} (as charted)` : `${lab} setup`, `${lab} as charted`]);
        $('o-report').scrollIntoView({ behavior: 'smooth' });
      } catch (err) { $('o-report').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
    };
  }


  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.on) { sel[t.dataset.on].on = t.checked; renderOpts(); return; }
    if (t.dataset.text) { sel[t.dataset.text].text = t.value; estimate(); return; }
    if (t.dataset.pick) { const s = sel[t.dataset.pick]; t.checked ? s.picks.add(t.value) : s.picks.delete(t.value); estimate(); return; }
    if (t.id === 'o-bps') { keepBps(); rankOptions(); return; }
    if (t.id === 'o-depth') { estimate(); return; }
    if (t.id === 'o-scope') { rate = null; rankOptions(); estimate(); return; }
    if (t.dataset.set) { if (t.checked) chosen.add(t.dataset.set); else chosen.delete(t.dataset.set); rate = null; refresh(); return; }
    if (t.id === 'o-combine') { combineView = t.checked; if (lastResults) renderResults(...lastResults); return; }
  });
  root.addEventListener('toggle', (e) => {                // remember which groups are open across re-renders
    const g = e.target.dataset && e.target.dataset.group; if (g == null) return;
    if (e.target.open) openGroups.add(g); else openGroups.delete(g);
  }, true);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-groups]'); if (!b) return;
    root.querySelectorAll('details.ogroup').forEach((d) => { d.open = b.dataset.groups === 'open'; });
  });
  $('o-go').addEventListener('click', search);
  $('o-stop').addEventListener('click', () => { stopped = true; if (pool) pool.forEach((w) => w.terminate()); $('o-err').textContent = 'Search stopped.'; $('o-go').disabled = false; $('o-stop').disabled = true; pool = null; });

  async function refresh() {
    $('o-err').textContent = '';
    const t = getTeam();
    if (t !== team) { team = t; $('o-bps').value = savedBps[team] || ''; rankOptions(); }   // each scale keeps its own breakpoints
    const wb = await getWorkbook();
    if (!wb) { $('o-opts').innerHTML = '<p class="muted">Import a chart or build one above first.</p>'; cfgs = null; estimate(); return; }
    const all = [];
    for (const b of ['A', 'B', 'C']) {
      try {
        const c = await parse_chart(wb, team, null, b);
        if (c.some((x) => x.actions && Object.keys(x.actions).length)) all.push({ block: b, cfgs: c, opts: catalog(c, team) });
      } catch (e) { if (b === 'A') { cfgs = null; sets = []; $('o-sets').innerHTML = ''; $('o-opts').innerHTML = ''; $('o-err').textContent = e.message; return; } }
    }
    filledSets = all.map((x) => x.block);
    if (![...chosen].some((b) => filledSets.includes(b)) && filledSets.length) chosen = new Set([filledSets[0]]);
    $('o-sets').innerHTML = ['A', 'B', 'C'].map((b) => `<label class="pick" title="${filledSets.includes(b) ? '' : 'No P1 chart in this set'}"><input type="checkbox" data-set="${b}" ${chosen.has(b) && filledSets.includes(b) ? 'checked' : ''} ${filledSets.includes(b) ? '' : 'disabled'}>${esc(getLabel(b))}</label>`).join('');
    sets = all.filter((x) => chosen.has(x.block));
    if (!sets.length) { cfgs = null; $('o-opts').innerHTML = `<p class="muted">${filledSets.length ? 'Tick at least one set.' : `The ${team}-man chart has no P1 chart filled in.`}</p>`; estimate(); return; }
    cfgs = sets[0].cfgs;
    // union of the chosen sets' options; "now" shows each set's current value when they differ
    opts = [];
    for (const x of sets) for (const o of x.opts) {
      const have = opts.find((y) => y.id === o.id);
      if (!have) { opts.push({ ...o, currents: { [x.block]: o.current } }); continue; }
      have.currents[x.block] = o.current;
      for (const c of o.choices || []) if (!have.choices.includes(c)) have.choices.push(c);
    }
    for (const o of opts) {
      const vals = Object.entries(o.currents);
      if (sets.length > 1 && new Set(vals.map(([, v]) => String(v))).size > 1) o.current = vals.map(([b, v]) => `${b}: ${v ?? '-'}`).join(' · ');
    }
    for (const o of opts) {
      if (!sel[o.id]) sel[o.id] = { on: false, text: o.kind === 'num' ? (o.id.startsWith('ring') ? DEFAULT_NUM.ring : DEFAULT_NUM.deep) : '', picks: new Set(o.choices || []) };
    }
    rankOptions(); renderOpts();
  }
  rankOptions();
  return { refresh };
}
