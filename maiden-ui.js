// Maiden tab (first section: the prefires to the 70s proc): per-player settings for each scale (sets A / B / C, saved in
// this browser by name or to a file), and a Report - the 70s proc's time over many raids for the ticked sets (the same
// raids for each), with Show raid. Gear comes from the Gear tab (the Gear set picked here).
import { whenFree, breath } from './engine/pause.js';
import { progressBar } from './progressbar.js';
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { blankPlayer } from './engine/loadout.js';
import { parseBreakpoints } from './engine/optimize.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';
import { Rng } from './engine/rng.js';
import { timelineHtml, successSteps, failSteps, raidNav } from './raidview.js';
import { runMaiden, defaultMaidenPlan, seqOf, canDo, ATTACKS, PREFIRES, MAIDEN_HP, PREFIRE_TICK } from './engine/maiden.js';

const STORE = 'verzikSim.maiden.v1';           // {team: {cur, sets: {A, B?, C?}, report}}
const SETS = ['A', 'B', 'C'];
const SAVED = 'verzikSim.maidenSaved.v1';      // {team: [{id, name, saved, set}]}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadKey = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const fsec = (x) => { const s2 = x * 0.6; return s2 >= 60 ? `${Math.floor(s2 / 60)}:${(s2 % 60).toFixed(1).padStart(4, '0')}` : `${s2.toFixed(1)}s`; };
const LEGEND = 'Maiden: the prefires (tick 5) to her 70s proc - the hit that takes her below 70% of her HP. Her attacks every 10 ticks from tick 9 land 5 ticks later (on the targeted player).';

export function createMaiden(host, { getTeam }) {
  let state = loadKey(STORE), saved = loadKey(SAVED), savedPick = '', setMsg = '';
  const persist = () => saveKey(STORE, state);
  const team = () => Number(getTeam()) || 4;
  host.innerHTML = `${settingsCard('Maiden settings', '<div data-cfg></div>')}
    ${tabsHtml([['rep', 'Report']])}
    ${pane('rep', 'data-rep', `
      <p class="muted small" style="margin-top:8px">The opening so far: the prefires to her 70s proc (the hit that takes her below 70% of her HP - damage carries over).
        Crabs, her ramping, freezes, Dinh's / barrage / chinchompa targeting and the later phases come next.</p>
      <div class="row" style="margin-top:10px">
        <label>Raids<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <div data-rsets></div>
        <label title="Target 70s proc times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page)">Pause</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>
    `)}`;
  wireSubtabs(host, 'verzikSim.maidenTabs.v1');
  const cfg = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]');

  const blankSet = () => ({ gearSet: 'A', ...defaultMaidenPlan(team()) });
  const root = () => {
    const t = team(); state[t] ||= {}; const r = state[t];
    r.sets ||= {}; if (r.set) { r.sets.A ||= r.set; delete r.set; }   // (one setup before sets A / B / C: set A)
    r.cur = SETS.includes(r.cur) ? r.cur : 'A'; r.sets[r.cur] ||= blankSet();
    r.report ||= { raids: 10000, seed: '', bps: '' }; r.report.sets ||= ['A']; r.report.labels ||= {};
    return r;
  };
  const fix = (st) => {
    const d = defaultMaidenPlan(team());
    st.gearSet ||= 'A';
    st.players = d.players.map((p, k) => { const o = (st.players || [])[k]; return o ? { startSpec: Number(o.startSpec ?? 100), seq: seqOf(o, k, team()) } : p; });
    st.target = Math.min(team() - 1, Math.max(0, Number(st.target ?? d.target) || 0));
    return st;
  };
  const cur = () => { const r = root(); return fix(r.sets[r.cur]); };
  const setOf = (k) => { const r = root(); return r.sets[k] ? fix(r.sets[k]) : null; };
  const setLabel = (k) => { const l = String(root().report.labels[k] || '').trim(); return l ? `Set ${k}: ${l}` : `Set ${k}`; };
  function setTabs() {
    const r = root(), tb = host.querySelector('[data-settabs]');
    tb.innerHTML = SETS.map((k) => `<button data-set="${k}" class="${k === r.cur ? 'on' : ''}" title="${r.sets[k] ? `Set ${k}` : 'Empty - opens a new set'}">Set ${k}${r.sets[k] ? '' : ' <span class="muted">(empty)</span>'}</button>`).join('');
    host.querySelector('[data-setcard]').dataset.setcol = r.cur;
  }
  host.querySelector('[data-settabs]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set]'); if (!b) return;
    const r = root(), gs = cur().gearSet; r.cur = b.dataset.set;
    if (!r.sets[r.cur]) { r.sets[r.cur] = { ...blankSet(), gearSet: gs }; if (!r.report.sets.includes(r.cur)) r.report.sets = SETS.filter((x) => x === r.cur || r.report.sets.includes(x)); }
    setMsg = ''; persist(); refreshAll();
  });
  const gearOf = (st) => { const set = gearSet(loadGear(), team(), st.gearSet); return set ? playersOf(set, team()) : null; };
  const playersNow = (st) => { const gp = gearOf(st); return st.players.map((p, k) => ({ ...p, name: (gp && gp[k] && gp[k].name) || `Player ${k + 1}`, gear: (gp && gp[k]) || blankPlayer(k) })); };

  function render() {
    setTabs();
    const st = cur(), r0 = root(), ps = playersNow(st), t = team(), g = loadGear(), list = saved[t] || [];
    if (savedPick && !list.some((x) => x.id === savedPick)) savedPick = '';
    const opts = (codes, v, gear) => codes.map((a) => `<option value="${a}" ${a === v ? 'selected' : ''}>${esc(ATTACKS[a].label)}${canDo(gear, a) ? '' : ' (not in Gear)'}</option>`).join('');
    const col = (p, k) => {
      const rows = p.seq.map((a, j) => `<div class="mrow">${j === 0 ? '<span class="mlab">Prefire</span>' : `<span class="mlab">${j}</span>`}
          <select data-seq="${k}|${j}" class="${canDo(p.gear, a) ? '' : 'bad'}">${opts(j === 0 ? PREFIRES : Object.keys(ATTACKS), a, p.gear)}</select>
          ${j > 0 ? `<button class="ghost sm mx" data-del="${k}|${j}" title="Remove this hit">&times;</button>` : '<span class="mx"></span>'}</div>`).join('');
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b>
          <label class="small muted" title="Spec energy coming into the room">Start spec <select data-p="${k}|startSpec">${[100, 95].map((x) => `<option value="${x}" ${Number(p.startSpec) === x ? 'selected' : ''}>${x}%</option>`).join('')}</select></label></div>
        ${rows}<button class="ghost sm" data-add="${k}" style="margin-top:4px">+ Add hit</button></div>`;
    };
    const later = ['70s', '50s', '30s', 'End'].map((x) => `<div class="msec off"><h4>${x}</h4><span class="muted small">comes later</span></div>`).join('');
    cfg.innerHTML = `<style>
        .msec{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-top:10px}.msec h4{margin:0 0 8px}.msec.off{opacity:.55;display:flex;gap:10px;align-items:baseline;padding:6px 12px}.msec.off h4{margin:0}
        .mgrid{display:flex;gap:14px;flex-wrap:wrap}.mcol{min-width:220px;flex:1}.mhead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
        .mhead label{flex-direction:row;align-items:center;gap:4px}.mrow{display:flex;gap:6px;align-items:center;margin-top:4px}.mrow select{flex:1;min-width:0}
        .mrow select.bad{border-color:#d9534f}.mlab{width:46px;font-size:12px;color:var(--ink2)}.mx{width:28px;padding:2px 0}</style>
      <div class="row wrap" style="gap:10px;align-items:end;margin:0 0 10px">
        <div><div class="muted small">Copy set ${r0.cur} to</div>${SETS.filter((k) => k !== r0.cur).map((k) => `<button class="ghost sm" data-copyset="${k}" title="Replace set ${k} with a copy of set ${r0.cur}">Set ${k}</button>`).join(' ')}</div>
        <button class="ghost sm" data-clearset title="Start set ${r0.cur} over from the default plan (its Gear set stays)">Clear set ${r0.cur}</button>
        <label>Saved setups<select data-saved="pick"><option value="">(choose a setup)</option>${list.map((x) => `<option value="${x.id}" ${x.id === savedPick ? 'selected' : ''}>${esc(x.name)} · ${new Date(x.saved).toLocaleDateString()}</option>`).join('')}</select></label>
        <button class="ghost sm" data-setact="load" ${savedPick ? '' : 'disabled'}>Load into set ${r0.cur}</button>
        <button class="ghost sm" data-setact="del" ${savedPick ? '' : 'disabled'}>Delete</button>
        <label>Name<input data-saved="name" placeholder="e.g. creepy maiden" style="width:150px"></label>
        <button class="sm" data-setact="save">Save setup</button>
        <button class="ghost sm" data-setact="file">Save to file</button>
        <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-saved="file" hidden></label>
        <span class="muted small">${esc(setMsg)}</span>
      </div>
      <div class="row">
        <label>Gear<select data-s="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${st.gearSet === x ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}</option>`).join('')}</select></label>
        <label title="Who her attacks go at (for now one player all room - her real targeting comes later)">Maiden targets<select data-s="target">${ps.map((p, k) => `<option value="${k}" ${st.target === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <span class="muted small">HP ${MAIDEN_HP[t].toLocaleString()} · 70s proc below ${(MAIDEN_HP[t] * 0.7).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
      </div>
      <div class="msec"><h4>Start <span class="muted small" style="font-weight:normal">- the prefires (Twisted bow tick ${PREFIRE_TICK.tbow}, ZCB tick ${PREFIRE_TICK.zcb}) to her 70s proc</span></h4>
        <div class="mgrid">${ps.map(col).join('')}</div>
        <p class="muted small" style="margin:8px 0 0">Each hit goes as soon as their attack timer allows; their last hit repeats until the 70s proc.
          A hit they can't do (not in their Gear, or not enough spec) is skipped. Ranged gear on Rigour at 112 Ranged, melee gear on their prayer (Zeal unless set in the Gear tab) at 118; Vengeance up from the start.</p></div>
      ${later}`;
  }
  cfg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const st = cur();
    if (b.dataset.add) { const q = st.players[Number(b.dataset.add)].seq; q.push(q.length > 1 ? q[q.length - 1] : 'tbr'); persist(); render(); return; }
    if (b.dataset.del) { const [k, j] = b.dataset.del.split('|').map(Number); st.players[k].seq.splice(j, 1); persist(); render(); return; }
    const r = root();
    if (b.dataset.copyset) {
      const k = b.dataset.copyset; r.sets[k] = structuredClone(st);
      if (!r.report.sets.includes(k)) r.report.sets = SETS.filter((x) => x === k || r.report.sets.includes(x));
      setMsg = `Copied set ${r.cur} to set ${k}.`; persist(); refreshAll(); return;
    }
    if (b.dataset.clearset !== undefined) {
      if (!confirm(`Clear set ${r.cur}? Its hits go back to the default plan (its Gear set stays).`)) return;
      r.sets[r.cur] = { ...blankSet(), gearSet: st.gearSet }; setMsg = `Set ${r.cur} cleared.`; persist(); refreshAll(); return;
    }
    // saved setups (this browser, per scale) and files
    const act = b.dataset.setact; if (!act) return;
    const t = team(), list = (saved[t] ||= []);
    if (act === 'save') {
      const name = (cfg.querySelector('[data-saved="name"]').value || '').trim() || list.find((x) => x.id === savedPick)?.name || '';
      if (!name) { setMsg = 'Type a name for the setup first.'; render(); return; }
      const old = list.find((x) => x.name === name), entry = { id: old ? old.id : `s${Date.now()}`, name, saved: Date.now(), set: structuredClone(st) };
      if (old) Object.assign(old, entry); else list.push(entry);
      savedPick = entry.id; setMsg = saveKey(SAVED, saved) ? `Saved "${name}".` : 'Could not save (browser storage is off).';
    } else if (act === 'load' || act === 'del') {
      const x = list.find((y) => y.id === savedPick); if (!x) return;
      if (act === 'load') { r.sets[r.cur] = structuredClone(x.set); persist(); setMsg = `Loaded "${x.name}" into set ${r.cur}.`; }
      else { if (!confirm(`Delete the saved setup "${x.name}"?`)) return; saved[t] = list.filter((y) => y !== x); savedPick = ''; saveKey(SAVED, saved); setMsg = `Deleted "${x.name}".`; }
    } else if (act === 'file') {
      const a = document.createElement('a'), nm = (cfg.querySelector('[data-saved="name"]').value || '').trim() || list.find((x) => x.id === savedPick)?.name || '';
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', kind: 'maidenSet', team: t, name: nm, set: st }, null, 1)], { type: 'application/json' }));
      a.download = `maiden_${t}man_${(nm || 'setup').replace(/[^a-z0-9]+/gi, '_')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    render();
  });
  cfg.addEventListener('change', async (e) => {
    const el = e.target, st = cur();
    if (el.dataset.saved === 'pick') { savedPick = el.value; setMsg = ''; render(); return; }
    if (el.dataset.saved === 'name') return;
    if (el.dataset.saved === 'file') {
      try {
        const j = JSON.parse(await el.files[0].text());
        if (j.kind !== 'maidenSet' || !j.set) throw new Error('not a saved Maiden setup');
        if (Number(j.team) !== team()) throw new Error(`it's a ${j.team}-man setup - pick that scale first`);
        const r = root(); r.sets[r.cur] = j.set; persist(); setMsg = `Opened ${el.files[0].name} into set ${r.cur}.`;
      } catch (x) { setMsg = `Couldn't open that file: ${x.message}`; }
      render(); return;
    }
    if (el.dataset.s) { st[el.dataset.s] = el.dataset.s === 'target' ? Number(el.value) : el.value; }
    else if (el.dataset.p) { const [k, f] = el.dataset.p.split('|'); st.players[Number(k)][f] = f === 'startSpec' ? Number(el.value) : el.value; }
    else if (el.dataset.seq) { const [k, j] = el.dataset.seq.split('|').map(Number); st.players[k].seq[j] = el.value; }
    persist(); render();
  });
  const showRep = () => {
    const rs = root(), r = rs.report;
    for (const k of ['raids', 'seed', 'bps']) rep.querySelector(`[data-r="${k}"]`).value = r[k] ?? '';
    rep.querySelector('[data-rsets]').innerHTML = `<div class="muted small">Sets to run (compared on the same raids)</div><div class="row" style="gap:8px">${SETS.map((k) => `<label class="pick" style="flex-direction:row;gap:4px;align-items:center" data-setcol="${k}"><input type="checkbox" data-rset-run="${k}" ${rs.sets[k] ? '' : 'disabled'} ${rs.sets[k] && r.sets.includes(k) ? 'checked' : ''}>${k}</label><input data-rlabel="${k}" placeholder="Set ${k} label" value="${esc(r.labels[k] || '')}" style="width:110px" ${rs.sets[k] ? '' : 'disabled'}>`).join('')}</div>`;
  };
  rep.addEventListener('change', (e) => {
    const r = root().report, el = e.target;
    if (el.dataset.r) r[el.dataset.r] = el.value;
    if (el.dataset.rsetRun) { const k = el.dataset.rsetRun; r.sets = SETS.filter((x) => (x === k ? el.checked : r.sets.includes(x))); }
    if (el.dataset.rlabel != null) r.labels[el.dataset.rlabel] = el.value;
    persist();
  });

  // ---- the report
  let job = null;
  const draw = (run, i, title) => {
    const trace = [], res = runMaiden(run.players, team(), new Rng(`${run.seed}#${i}`), null, { target: run.target, trace });
    return timelineHtml({ trace, names: run.players.map((p) => p.name), bossName: 'Maiden', end: res.proc ?? 60, title, legend: LEGEND, from: 1 });
  };
  /** One set's numbers. */
  function statsOf(run) {
    const raids = run.raids, ok = raids.filter((x) => x.total != null), N = raids.length, v = ok.map((x) => x.total).sort((a, b) => a - b);
    const at = (f) => v[Math.min(v.length - 1, Math.max(0, Math.floor(N * f) - 1))];
    const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q[q.length >> 1]; };
    return { N, ok, v, rows: { Fastest: v[0], 'Top 10%': at(0.1), 'Top 25%': at(0.25), Median: v[N >> 1], 'Bottom 25%': at(0.75), Slowest: v[v.length - 1] },
      mean: v.reduce((a, b) => a + b, 0) / Math.max(1, v.length), hp: med(ok.map((x) => x.hp)), def: med(ok.map((x) => x.def)),
      mauls: [0, 1, 2, 3, 4, 5].map((k) => raids.filter((x) => x.maulsLanded === k).length), nMaul: run.players.filter((p) => (p.seq || []).includes('maul')).length,
      vengs: raids.reduce((a, x) => a + x.vengs, 0) / Math.max(1, N), fails: N - ok.length,
      skips: (() => { const by = new Map(); for (const x of raids) for (const q of new Set((x.skipped || []).map((y) => `${y.i}|${y.a}`))) by.set(q, (by.get(q) || 0) + 1); return [...by.entries()]; })() };
  }
  function results(runs, bps) {
    const S = runs.map(statsOf), one = runs.length === 1;
    const pc = (n, N) => `${(n / N * 100).toFixed(n / N < 0.1 ? 1 : 0)}%`;
    const head = `<tr><th></th>${runs.map((x) => `<th data-setcol="${x.k}">${esc(x.label)}</th>`).join('')}</tr>`;
    const cell = (x) => (x == null ? '-' : `<b>${fsec(x)}</b> <span class="muted small">t${x}</span>`);
    const rowsHtml = Object.keys(S[0].rows).map((l) => `<tr><td>${l}</td>${S.map((s) => `<td>${cell(s.rows[l])}</td>`).join('')}</tr>`).join('')
      + `<tr><td>Mean</td>${S.map((s) => `<td><b>${fsec(s.mean)}</b> <span class="muted small">t${s.mean.toFixed(1)}</span></td>`).join('')}</tr>`
      + [...bps].sort((x, y) => x - y).map((b) => { const T = Math.floor(b / 0.6 + 1e-9); return `<tr><td>By ${fsec(T)}</td>${S.map((s) => `<td><b>${pc(s.ok.filter((x) => x.total <= T).length, s.N)}</b></td>`).join('')}</tr>`; }).join('')
      + `<tr><td title="Damage carries over">HP left after the proc (median)</td>${S.map((s) => `<td>${s.hp == null ? '-' : s.hp.toLocaleString()}</td>`).join('')}</tr>`
      + `<tr><td>Her Defence then (median)</td>${S.map((s) => `<td>${s.def ?? '-'}</td>`).join('')}</tr>`
      + (S.some((s) => s.nMaul) ? `<tr><td>Elder mauls landed</td>${S.map((s) => `<td class="small">${s.nMaul ? s.mauls.map((n, k) => (k <= s.nMaul && n ? `<b>${k}</b> ${pc(n, s.N)}` : '')).filter(Boolean).join(', ') : '-'}</td>`).join('')}</tr>` : '')
      + `<tr><td>Vengeance procs a raid</td>${S.map((s) => `<td>${s.vengs.toFixed(2)}</td>`).join('')}</tr>`
      + (S.some((s) => s.skips.length) ? `<tr><td title="Not in their Gear, or not enough spec energy">Hits skipped</td>${S.map((s, j) => `<td class="small">${s.skips.length ? s.skips.map(([q, n]) => { const [i, a] = q.split('|'); return `<span class="err">${esc(runs[j].players[Number(i)].name)} ${esc(ATTACKS[a].label)}</span> ${pc(n, s.N)}`; }).join('<br>') : '-'}</td>`).join('')}</tr>` : '')
      + (S.some((s) => s.fails) ? `<tr><td>No proc</td>${S.map((s) => `<td class="err">${s.fails ? pc(s.fails, s.N) : '-'}</td>`).join('')}</tr>` : '');
    return `<div class="vz-report"><h3 style="margin:0 0 6px">70s proc</h3>
      <div class="scroll"><table class="sortlist">${head}${rowsHtml}</table></div></div>
      <div class="row wrap" style="gap:6px;align-items:center;margin-top:10px"><b>Show raid</b>
        ${runs.map((x, j) => `<button class="ghost sm" data-mraid="${j}" data-setcol="${x.k}" title="Opens on the median raid; Previous / Next step through fastest, top 10%, top 25%, median, slowest and your breakpoints">${one ? 'View raids' : esc(x.label)}</button>`).join('')}</div>
      <div data-mraidout></div>`;
  }
  rep.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const status = rep.querySelector('[data-rstatus]'), err = rep.querySelector('[data-rerr]'), out = rep.querySelector('[data-rout]');
    const btn = (x) => rep.querySelector(`[data-act="${x}"]`);
    if (b.dataset.mraid != null && out.__run) {
      const { runs, bps } = out.__run, run = runs[Number(b.dataset.mraid)], raids = run.raids, ok = raids.filter((x) => x.total != null), steps = successSteps(ok, raids.length, raids.length, bps);
      const who = runs.length > 1 ? `${run.label}: ` : '';
      raidNav(out.querySelector('[data-mraidout]'), steps, steps.findIndex((z) => /Median/.test(z.label)), (s) => draw(run, s.pick.i, `${who}${s.label} raid (Maiden, to 70s) - 70s proc at ${fsec(s.pick.total)} · ${s.freq}`));
      return;
    }
    const a = b.dataset.act;
    if (a === 'stop') { if (job) job.stop = true; return; }
    if (a !== 'run' || job) return;
    const r = root().report; err.textContent = '';
    let bps = []; try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const keys = r.sets.filter((k) => setOf(k)); if (!keys.length) { err.textContent = 'Tick at least one set to run.'; return; }
    const n = Math.max(100, Number(r.raids) || 10000), t = team(), seed = String(r.seed || '').trim() || `m${Date.now()}`;
    const runs = keys.map((k) => { const st = setOf(k); return { k, label: setLabel(k), players: playersNow(st), target: st.target, seed, raids: [] }; });
    job = { stop: false }; const me = job; btn('run').disabled = true; btn('stop').disabled = false;
    const pb = progressBar(status); pb.start();
    let i = 0;
    const step = () => {
      if (me.stop || i >= n) {
        if (me.stop) pb.stop(); else pb.done();
        job = null; btn('run').disabled = false; btn('stop').disabled = true;
        if (!runs[0].raids.length) { status.textContent = 'Stopped.'; return; }
        out.__run = { runs, bps }; out.innerHTML = results(runs, bps);
        status.textContent = `${me.stop ? 'Stopped at' : 'Done:'} ${runs[0].raids.length.toLocaleString()} raids${runs.length > 1 ? ' per set' : ''} (seed ${seed}).`;
        return;
      }
      const to = Math.min(n, i + Math.max(100, Math.floor(500 / runs.length)));
      try {
        for (; i < to; i++) for (const run of runs) { const x = runMaiden(run.players, t, new Rng(`${seed}#${i}`), null, { target: run.target }); run.raids.push({ i, total: x.proc, key: String(x.maulsLanded), hp: x.hp, def: x.def, maulsLanded: x.maulsLanded, vengs: x.vengs, skipped: x.skipped }); }
      } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      status.textContent = `Running... ${i.toLocaleString()} / ${n.toLocaleString()} raids${runs.length > 1 ? ` (${runs.length} sets)` : ''}`; pb.set(i / n);
      whenFree(() => setTimeout(step, 0));
    };
    step();
  });

  const refreshAll = () => { render(); showRep(); };
  const refresh = () => { state = loadKey(STORE); saved = loadKey(SAVED); setMsg = ''; refreshAll(); };
  refresh();
  return { refresh };
}
