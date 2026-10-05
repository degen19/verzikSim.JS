// "Build chart on this page": the chart template's inputs as a form, for the selected scale. Saved in this browser.
import { readXlsx } from './engine/xlsx.js';
import { describe, readValues, overlaySheet, checkRow, CODES, CODE_HELP, isAutoTick } from './engine/chartform.js';
import { readPlanInputs, plan } from './engine/planner.js';

const STORE = 'verzikSim.builder.v1';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off: keep in memory */ } };

const HELP = {
  'startSpec (%)': 'Spec % at the start of the room', lightbearerOn: 'Starts the room on Lightbearer',
  'Custom Surge Timing': 'Room time of a surge pot without a P in the chart (m:ss)', 'Target spec': 'Spec used in P2 (the ring-swap target if no Ring switch %)',
  'Ring switch %': 'Swap Lightbearer -> Ultor at this spec %', 'P3 target spec': 'Spec wanted for P3 (default 30)',
  'Death tick': 'Tick P1 dies (blank = last charted tick)', redCrab: 'Red crab hit once during the reds shield',
  offPrayer: "Verzik P3 autos taken off prayer (0-9)", has3Tick: 'Weapon used by H in the P1 chart',
};

export function createBuilder(root, { onChange }) {
  let tplWb = null;
  const tpl = {};                 // team -> {ws, descs: {A, B}, defaults: {A, B}}
  let state = load();             // team -> {A: {key: value}, B: {...}}
  let team = 4, block = 'A', timer = null;

  async function ensure(t) {
    if (!tplWb) {
      const res = await fetch(new URL('./verzik_chart_template.xlsx', import.meta.url));
      if (!res.ok) throw new Error("Couldn't load the chart template from the site");
      tplWb = await readXlsx(new Uint8Array(await res.arrayBuffer()));
    }
    if (!tpl[t]) {
      const ws = await tplWb.load(`${t}-man`);
      const descs = { A: describe(ws, t, 'A'), B: describe(ws, t, 'B') };
      tpl[t] = { ws, descs, defaults: { A: readValues(ws, descs.A), B: readValues(ws, descs.B) } };
    }
    if (!state[t]) state[t] = { A: { ...tpl[t].defaults.A }, B: { ...tpl[t].defaults.B } };
    return tpl[t];
  }
  const vals = () => state[team][block];
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => save(state), 300); onChange && onChange(); };

  function input(f, v) {
    const k = `data-key="${esc(f.key)}"`;
    if (f.type === 'bool') return `<input type="checkbox" ${k} ${v === true ? 'checked' : ''}>`;
    if (f.type === 'select') {
      const ch = [...f.choices]; if (v !== '' && !ch.map(String).includes(String(v))) ch.push(v);
      return `<select ${k}>${ch.map((c) => `<option ${String(c) === String(v) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    }
    if (f.type === 'fixed') return `<span class="muted">${esc(v)}</span>`;
    if (f.type === 'number') return `<input type="number" step="any" ${k} value="${esc(v)}">`;
    return `<input type="text" ${k} value="${esc(v)}" ${f.header === 'Custom Surge Timing' ? 'placeholder="m:ss"' : ''}>`;
  }
  const field = (table, h, p) => tpl[team].descs[block].fields.get(`${table}|${h}|${p ?? 'team'}`);
  const names = () => Array.from({ length: team }, (_, k) => vals()[`setup|Name|${k}`] || `Player ${k + 1}`);

  function playerTable(table, headers, rowLabel) {
    const nm = names();
    return `<div class="scroll"><table class="bt"><tr><th></th>${headers.map((h) => `<th title="${esc(HELP[h] || '')}">${esc(h)}</th>`).join('')}</tr>${
      nm.map((n, k) => `<tr><td class="rl">${esc(rowLabel ? rowLabel(k, n) : n)}</td>${headers.map((h) => {
        const f = field(table, h, k); return `<td>${f ? input(f, vals()[f.key] ?? f.def) : ''}</td>`;
      }).join('')}</tr>`).join('')}</table></div>`;
  }

  function chartGrid() {
    const ch = tpl[team].descs[block].tables.chart;
    if (!ch) return '';
    const nm = names();
    const head = ch.ticks.map(([t]) => `<th class="${isAutoTick(t) ? 'auto' : ''}">${t}</th>`).join('');
    const rows = nm.map((n, k) => `<tr><td class="rl">${esc(n)}</td><td class="chk" id="chk-${k}"></td>${ch.ticks.map(([t]) => {
      const f = tpl[team].descs[block].fields.get(`chart|${t}|${k}`);
      return `<td class="${isAutoTick(t) ? 'auto' : ''}"><input class="code" list="vz-codes" data-key="${esc(f.key)}" value="${esc(vals()[f.key] ?? '')}"></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="scroll"><table class="bt grid"><tr><th></th><th>Check</th>${head}</tr>${rows}</table></div>
      <datalist id="vz-codes">${CODES.map((c) => `<option value="${c}">`).join('')}</datalist>
      <div class="muted small">Codes: ${Object.entries(CODE_HELP).map(([c, h]) => `<b>${c}</b> ${esc(h)}`).join(' · ')}. Red columns are Verzik auto ticks.</div>`;
  }

  function refreshDerived() {
    const ws = overlaySheet(tpl[team].ws, tpl[team].descs, state[team]);
    const out = plan(readPlanInputs(ws, team, block));
    const el = root.querySelector('#vz-plan');
    if (el) {
      el.innerHTML = `<table class="bt"><tr><th></th><th>End spec</th><th>Purple crab</th><th>Room Time</th><th>LB swings</th><th>West/East DC +</th><th>Time of regen</th></tr>${
        out.map((o) => `<tr><td class="rl">${esc(o.name)}</td><td>${o.endSpec}</td><td>${esc(o.purple)}</td><td>${esc(o.roomTime)}</td><td>${esc(o.lbSwings)}</td><td>${esc(o.dc)}</td><td>${esc(o.regenTime)}</td></tr>`).join('')}</table>`;
    }
    const ch = tpl[team].descs[block].tables.chart;
    for (let k = 0; k < team; k++) {
      const acts = {};
      if (ch) for (const [t] of ch.ticks) { const v = vals()[`chart|${t}|${k}`]; if (v) acts[t] = v; }
      const msg = checkRow(acts, vals()[`gear|has3Tick|${k}`], team);
      const c = root.querySelector(`#chk-${k}`); if (c) { c.textContent = msg ? '✗' : '✓'; c.title = msg; c.className = `chk ${msg ? 'bad' : 'ok'}`; }
    }
    const msgs = [];
    for (let k = 0; k < team; k++) { const c = root.querySelector(`#chk-${k}`); if (c && c.title) msgs.push(`${names()[k]}: ${c.title}`); }
    const m = root.querySelector('#vz-checks'); if (m) m.textContent = msgs.join('\n');
  }

  function render() {
    const d = tpl[team].descs[block].tables;
    const teamFields = d.team.map((f) => `<label title="${esc(HELP[f.header] || '')}">${esc(f.header)}${input(f, vals()[f.key] ?? f.def)}</label>`).join('');
    root.innerHTML = `
      <div class="row between">
        <div class="seg"><button data-block="A" class="${block === 'A' ? 'on' : ''}">Set A</button><button data-block="B" class="${block === 'B' ? 'on' : ''}">Set B (optional)</button></div>
        <div class="row">
          <button class="ghost sm" data-act="copy">${block === 'A' ? 'Copy Set A to Set B' : 'Copy Set B to Set A'}</button>
          <button class="ghost sm" data-act="reset">Reset this set</button>
          <button class="ghost sm" data-act="export">Save to file</button>
          <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-act="import" hidden></label>
        </div>
      </div>
      <p class="muted small">${team}-man chart, Set ${block}. Changes are saved in this browser automatically. Set B only runs if its P1 chart has something in it.</p>
      <h3>Setup</h3>${playerTable('setup', d.setup)}
      <h3>Spec planner</h3><div id="vz-plan"></div>
      <p class="muted small">Same as the chart's End spec / Room Time / LB swings / Time of regen columns. P1 ends on the Death tick if set, otherwise on the last charted tick.</p>
      <h3>Team settings</h3><div class="row wrap teamset">${teamFields}</div>
      <h3>Gear</h3>${playerTable('gear', d.gear)}
      ${d.mage.length ? `<h3>Mage gear <span class="muted small">(used by Shadow players)</span></h3>${playerTable('mage', d.mage)}` : ''}
      <h3>P1 chart</h3>${chartGrid()}<div id="vz-checks" class="err small"></div>`;
    refreshDerived();
  }

  root.addEventListener('input', (e) => {
    const key = e.target.dataset && e.target.dataset.key; if (!key) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (e.target.classList.contains('code')) { v = String(v).toUpperCase(); e.target.value = v; }
    const f = tpl[team].descs[block].fields.get(key);
    if (f && f.type === 'select' && typeof f.choices[0] === 'number') v = Number(v);
    vals()[key] = v;
    if (key.startsWith('setup|Name|')) { render(); }
    else refreshDerived();
    persist();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.block) { block = b.dataset.block; render(); return; }
    const act = b.dataset.act;
    if (act === 'copy') { const other = block === 'A' ? 'B' : 'A'; state[team][other] = remap(state[team][block], block, other); block = other; render(); persist(); }
    if (act === 'reset') { state[team][block] = { ...tpl[team].defaults[block] }; render(); persist(); }
    if (act === 'export') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', team, sets: state[team] }, null, 1)], { type: 'application/json' }));
      a.download = `verzik_${team}man_chart.json`; a.click();
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.dataset.act !== 'import' || !e.target.files[0]) return;
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (j.app !== 'verzikSim' || !j.sets) throw new Error("That file isn't a saved chart from this page");
      if (j.team !== team) throw new Error(`That file is a ${j.team}-man chart - switch Scale to ${j.team}-man first`);
      state[team] = { A: { ...tpl[team].defaults.A, ...j.sets.A }, B: { ...tpl[team].defaults.B, ...j.sets.B } };
      render(); persist();
    } catch (err) { alertMsg(err.message); }
    e.target.value = '';
  });
  // Set A and Set B fields share keys (table|header|player), so copying is a plain copy.
  const remap = (v) => ({ ...v });
  const alertMsg = (m) => { const el = root.querySelector('#vz-checks'); if (el) el.textContent = m; };

  return {
    async show(t) { team = t; await ensure(t); render(); },
    /** A workbook-like object the sim reads exactly like an imported .xlsx. */
    async workbook(t) {
      await ensure(t);
      const ws = overlaySheet(tpl[t].ws, tpl[t].descs, state[t]);
      return { sheetnames: [`${t}-man`], load: async () => ws };
    },
    /** Copy an imported chart's values into the builder (both sets). */
    async importFrom(wb, t) {
      await ensure(t);
      const ws = await wb.load(`${t}-man`);
      state[t] = { A: { ...tpl[t].defaults.A, ...readValues(ws, describe(ws, t, 'A')) },
                   B: { ...tpl[t].defaults.B, ...readValues(ws, describe(ws, t, 'B')) } };
      save(state);
    },
  };
}
