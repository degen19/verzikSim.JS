// "Build chart on this page": the chart template's inputs as a form, for the selected scale. Saved in this browser.
import { readXlsx } from './engine/xlsx.js';
import { describe, readValues, overlaySheet, checkRow, withSetC, shadowBlock, SHADOW_MODES, BLOCKS, CODES, CODE_HELP, isAutoTick } from './engine/chartform.js';
import { readPlanInputs, plan } from './engine/planner.js';

const STORE = 'verzikSim.builder.v1';
const LIB = 'verzikSim.library.v1';          // saved charts: {team: [{id, name, saved, sets}]}
const LIBCUR = 'verzikSim.libcur.v1';        // which saved / default chart each scale's working copy came from
const CODE_BG = { S: '#8fd18f', D: '#c9b6e4', A: '#fff2a8', C: '#f8cbad', H: '#f4b183', E: '#b4c7e7', SB: '#ffd966', B: '#d9a6e0', T: '#8eb4e3',
  P: '#ff66cc', R: '#ffffff', X: '#595959', 'ST>n': '#33cc33' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off: keep in memory */ } };
const loadKey = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const HELP = {
  'startSpec (%)': 'Spec % at the start of the room', lightbearerOn: 'Starts the room on Lightbearer',
  'Custom Surge Timing': 'Room time of a surge pot without a P in the chart (m:ss)', 'Target spec': 'Spec used in P2 (the ring-swap target if no Ring switch %)',
  'Ring switch %': 'Swap Lightbearer -> Ultor at this spec %. Both this and Target spec blank: swap when the regen in progress at P1\'s end lands, as long as they still reach 50% (one claw) by reds r36', 'P3 target spec': 'Spec wanted for P3 (default 30)',
  'Death tick': 'Tick P1 dies (blank = last charted tick)',
  'Shadow while LB': 'Shadow while wearing Lightbearer, then scythe (or 3:1) after the swap. Takes priority over 3:1: with both ticked they shadow on Lightbearer hits, then 3:1. Needs Shadow; not with Shadow camp.',
  '3:1': 'Scythe, but the attack that would collide with Verzik becomes a shadow. With Shadow while LB: 3:1 starts after the ring swap. Needs Shadow; not with Shadow camp.',
  'Shadow camp': 'Duo: shadow every P2 attack until reds. Needs Shadow; not with 3:1 or Shadow while LB (camp already covers them).',
  'Deep proc': 'Shadow from max distance below the Deep proc HP %. Needs Shadow.', redCrab: 'Red crab hit once during the reds shield',
  offPrayer: "Verzik P3 autos taken off prayer (0-9)",
  '4 Claw Priority': "If Verzik's P1 dies in 11 or fewer Dawn specs, the player with the highest regen status prioritises 100% spec for reds (both claws by r36, taking over the purple DC); the others prioritise 50%. Off: rings follow the chart.", has3Tick: 'Weapon used by H in the P1 chart',
};

export function createBuilder(root, { onChange }) {
  let tplWb = null;
  const tpl = {};                 // team -> {ws, descs: {A, B}, defaults: {A, B}}
  let state = load();             // team -> {A: {key: value}, B: {...}}
  let team = 4, block = 'A', timer = null;
  let lib = loadKey(LIB);         // team -> [{id, name, saved, sets}]
  let cur = loadKey(LIBCUR);      // team -> {kind: 'saved'|'default', id, name, snap}
  let defaults = null;            // [{name, team, file, note}] from defaults/index.json (null = not fetched yet)

  async function ensure(t) {
    if (!tplWb) {
      const res = await fetch(new URL('./verzik_chart_template.xlsx', import.meta.url));
      if (!res.ok) throw new Error("Couldn't load the chart template from the site");
      tplWb = await readXlsx(new Uint8Array(await res.arrayBuffer()));
    }
    if (!tpl[t]) {
      const ws = withSetC(await tplWb.load(`${t}-man`));          // the template's Sets A and B + a Set C copied from B
      const descs = {}, defaults = {};
      for (const b of BLOCKS) { descs[b] = describe(ws, t, b); defaults[b] = readValues(ws, descs[b]); }
      tpl[t] = { ws, descs, defaults };
    }
    if (!state[t]) state[t] = {};
    for (const b of BLOCKS) if (!state[t][b]) state[t][b] = { ...tpl[t].defaults[b] };   // older saves have no Set C
    return tpl[t];
  }
  const vals = () => state[team][block];
  const LOCK = '__lockChart';                                       // per set: P1 chart locked (kept by Reset / Copy)
  const isChartKey = (k) => k.startsWith('chart|');
  const locked = (b = block) => !!(state[team][b] && state[team][b][LOCK]);
  /** `fresh` with the P1 chart (and lock) of `old` carried over. */
  const keepChart = (fresh, old) => {
    const out = {}; for (const [k, v] of Object.entries(fresh)) if (!isChartKey(k)) out[k] = v;
    for (const [k, v] of Object.entries(old)) if (isChartKey(k)) out[k] = v;
    out[LOCK] = true; return out;
  };
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => save(state), 300); libStatus(); onChange && onChange(); };

  // ---- chart library: named charts saved in this browser, plus default charts shipped in defaults/
  const charts = () => lib[team] || [];
  const snapOf = () => JSON.stringify(state[team]);
  const dirty = () => !cur[team] || cur[team].snap !== snapOf();
  async function fetchDefaults() {
    if (defaults) return defaults;
    try {
      const r = await fetch(new URL('./defaults/index.json', import.meta.url), { cache: 'no-cache' });
      defaults = r.ok ? await r.json() : [];
    } catch { defaults = []; }
    if (!Array.isArray(defaults)) defaults = [];
    return defaults;
  }
  /** Sets {A, B, ...} from a default chart file: a .json saved by this page, or a filled .xlsx chart. */
  async function readDefault(d) {
    const res = await fetch(new URL(`./defaults/${d.file}`, import.meta.url));
    if (!res.ok) throw new Error(`Couldn't load the default chart "${d.name}"`);
    if (/\.xlsx$/i.test(d.file)) {
      const wb = await readXlsx(new Uint8Array(await res.arrayBuffer()));
      const ws = await wb.load(`${team}-man`);
      return Object.fromEntries(BLOCKS.map((b) => [b, readValues(ws, describe(ws, team, b))]));
    }
    const j = await res.json();
    if (j.app !== 'verzikSim' || !j.sets) throw new Error(`"${d.name}" isn't a chart saved from this page`);
    return j.sets;
  }
  const withDefaults = (sets) => Object.fromEntries(BLOCKS.map((b) => [b, { ...tpl[team].defaults[b], ...(sets[b] || {}) }]));
  function markCurrent(kind, id, name) { cur[team] = { kind, id, name, snap: snapOf() }; saveKey(LIBCUR, cur); }
  function libBar() {
    const c = cur[team] || {};
    const saved = charts().slice().sort((a, b) => a.name.localeCompare(b.name));
    const defs = (defaults || []).map((d, i) => [d, i]).filter(([d]) => Number(d.team) === team);
    const sel = (kind, id) => (c.kind === kind && String(c.id) === String(id) ? 'selected' : '');
    return `<div class="row wrap lib">
      <label>Chart<select data-lib="pick">
        <option value="">${c.name ? '- choose a chart -' : '(unsaved working copy)'}</option>
        ${saved.length ? `<optgroup label="Saved in this browser">${saved.map((x) => `<option value="s:${esc(x.id)}" ${sel('saved', x.id)}>${esc(x.name)}</option>`).join('')}</optgroup>` : ''}
        ${defs.length ? `<optgroup label="Default charts">${defs.map(([d, i]) => `<option value="d:${i}" ${sel('default', i)}>${esc(d.name)}</option>`).join('')}</optgroup>` : ''}
      </select></label>
      <label>Name<input data-lib="name" placeholder="e.g. Booma P1 v2" value="${esc(c.kind === 'saved' ? c.name : '')}" style="width:190px"></label>
      <button class="sm" data-act="libsave">Save</button>
      <button class="ghost sm" data-act="libnew" title="Start a new unnamed chart from the blank template">New</button>
      <button class="ghost sm" data-act="libdel" ${c.kind === 'saved' ? '' : 'disabled'}>Delete</button>
      <span class="muted small" id="vz-libstat"></span>
    </div>`;
  }
  const libMsg = (m) => { const el = root.querySelector('#vz-libstat'); if (el) { el.textContent = m; el.classList.add('err'); } };
  function libStatus() {
    const el = root.querySelector('#vz-libstat'); if (!el) return;
    el.classList.remove('err');
    const c = cur[team];
    if (!c) { el.textContent = `${charts().length} saved ${team}-man chart${charts().length === 1 ? '' : 's'} · working copy not saved under a name`; return; }
    const what = c.kind === 'default' ? `default chart "${c.name}"` : `"${c.name}"`;
    el.textContent = dirty() ? `${what} - unsaved changes` : `${what} - ${c.kind === 'saved' ? 'saved' : 'unchanged'}`;
  }
  function libSave() {
    const name = (root.querySelector('[data-lib="name"]').value || '').trim();
    if (!name) { libMsg('Type a name for this chart, then Save.'); return; }
    const list = (lib[team] = charts());
    let x = list.find((y) => y.name.toLowerCase() === name.toLowerCase());
    const isCur = cur[team] && cur[team].kind === 'saved' && x && x.id === cur[team].id;
    if (x && !isCur && !confirm(`Replace the saved ${team}-man chart "${x.name}"?`)) return;
    if (!x) { x = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name }; list.push(x); }
    x.name = name; x.saved = Date.now(); x.sets = JSON.parse(snapOf());
    if (!saveKey(LIB, lib)) { libMsg("Couldn't save - this browser's storage is full or turned off. Use Save to file instead."); return; }
    markCurrent('saved', x.id, name); render();
  }
  async function libPick(v) {
    if (!v) return;
    if (dirty() && !confirm('The chart on the page has unsaved changes. Load the other chart anyway?')) { render(); return; }
    try {
      if (v.startsWith('s:')) {
        const x = charts().find((y) => y.id === v.slice(2)); if (!x) return;
        state[team] = withDefaults(x.sets); markCurrent('saved', x.id, x.name);
      } else {
        const i = Number(v.slice(2)), d = (await fetchDefaults())[i];
        state[team] = withDefaults(await readDefault(d)); markCurrent('default', i, d.name);
      }
      block = 'A'; save(state); render(); onChange && onChange();
    } catch (err) { render(); libMsg(err.message); }
  }

  /** Is this player's checkbox `header` (any table) ticked? */
  const ticked = (header, player) => {
    for (const t of ['gear', 'setup']) { const fd = field(t, header, player); if (fd) return vals()[fd.key] === true || (vals()[fd.key] ?? fd.def) === true; }
    return false;
  };
  function input(f, v) {
    const k = `data-key="${esc(f.key)}"`;
    if (f.type === 'bool') {
      const why = f.player != null ? shadowBlock(f.header, (h) => ticked(h, f.player)) : '';
      return `<input type="checkbox" ${k} ${v === true && !why ? 'checked' : ''} ${why ? `disabled title="${esc(why)}"` : ''}>`;
    }
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
      const v = String(vals()[f.key] ?? '').toUpperCase();
      return `<td class="${isAutoTick(t) ? 'auto' : ''}"><input class="code${v && !CODES.includes(v) ? ' badcode' : ''}" list="vz-codes" data-key="${esc(f.key)}" ${v ? `data-code="${esc(v)}"` : ''} value="${esc(v)}" ${locked() ? 'disabled' : ''}></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="scroll"><table class="bt grid"><tr><th></th><th>Check</th>${head}</tr>${rows}</table></div>
      <datalist id="vz-codes">${CODES.map((c) => `<option value="${c}">`).join('')}</datalist>
      <div class="muted small codes-legend">${Object.entries(CODE_HELP).map(([c, h]) => `<span style="background:${CODE_BG[c]};${c === 'X' ? 'color:#fff' : ''}">${c}</span>${esc(h)}`).join(' · ')}. Red columns are Verzik auto ticks.</div>`;
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
    root.innerHTML = `${libBar()}
      <div class="row between">
        <div class="seg">${BLOCKS.map((b) => `<button data-block="${b}" class="${block === b ? 'on' : ''}">Set ${b}${b === 'A' ? '' : ' (optional)'}</button>`).join('')}</div>
        <div class="row">
          ${BLOCKS.filter((b) => b !== block).map((b) => `<button class="ghost sm" data-act="copy" data-to="${b}">Copy Set ${block} to Set ${b}</button>`).join('')}
          <button class="ghost sm" data-act="reset">Reset this set</button>
          <button class="ghost sm" data-act="export">Save to file</button>
          <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-act="import" hidden></label>
        </div>
      </div>
      <p class="muted small">${team}-man chart, Set ${block}. Changes are saved in this browser automatically. Sets B and C only run if their P1 chart has something in it.</p>
      <h3>Setup</h3>${playerTable('setup', d.setup)}
      <h3>Spec planner</h3><div id="vz-plan"></div>
      <p class="muted small">Same as the chart's End spec / Room Time / LB swings / Time of regen columns. P1 ends on the Death tick if set, otherwise on the last charted tick.</p>
      <h3>Team settings</h3><div class="row wrap teamset">${teamFields}</div>
      ${d.team.some((f) => f.header === '4 Claw Priority') ? `<p class="muted small">4 Claw Priority (on by default): when checked, if Verzik's P1 dies in 11 or fewer Dawn specs, the player with the highest regen status (didn't use their last Dawn; ties: highest spec % out of P1, then closest to their next regen) prioritises 100% spec for reds - both claws by r36, and they take over the purple DC. The others prioritise 50% (one claw by r36). Each camps Lightbearer only as long as needed.</p>` : ''}
      <h3>Gear</h3>${playerTable('gear', d.gear)}
      ${d.gear.includes('Shadow while LB') ? `<p class="muted small">Shadow modes need Shadow ticked. Shadow while LB takes priority over 3:1 - with both ticked, they shadow on Lightbearer hits, then 3:1 after the ring swap.${d.gear.includes('Shadow camp') ? ' Shadow camp can\'t be combined with 3:1 or Shadow while LB.' : ''}</p>` : ''}
      ${d.mage.length ? `<h3>Mage gear <span class="muted small">(used by Shadow players)</span></h3>${playerTable('mage', d.mage)}` : ''}
      <div class="row between" style="margin-top:18px"><h3 style="margin:0">P1 chart ${locked() ? '<span class="muted small">(locked)</span>' : ''}</h3>
        <div class="row"><button class="ghost sm" data-act="clearchart" ${locked() ? 'disabled title="Unlock the chart to clear it"' : ''}>Clear chart</button>
        <button class="ghost sm" data-act="lockchart" title="A locked chart can't be edited and is kept by Reset this set and Copy">${locked() ? 'Unlock chart' : 'Lock chart'}</button></div></div>
      ${chartGrid()}<div id="vz-checks" class="err small"></div>`;
    refreshDerived();
    libStatus();
  }

  root.addEventListener('input', (e) => {
    const key = e.target.dataset && e.target.dataset.key; if (!key) return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (e.target.classList.contains('code')) {
      v = String(v).toUpperCase(); e.target.value = v;
      if (v) e.target.dataset.code = v; else delete e.target.dataset.code;
      e.target.classList.toggle('badcode', !!v && !CODES.includes(v));
    }
    const f = tpl[team].descs[block].fields.get(key);
    if (f && f.type === 'select' && typeof f.choices[0] === 'number') v = Number(v);
    vals()[key] = v;
    const fld = tpl[team].descs[block].fields.get(key);
    if (fld && fld.player != null && (fld.header === 'Shadow' || SHADOW_MODES.includes(fld.header))) {
      // keep the shadow modes valid: clear any box this change made unavailable, then redraw
      for (const h of SHADOW_MODES) {
        const g = field('gear', h, fld.player) || field('setup', h, fld.player);
        if (g && vals()[g.key] === true && shadowBlock(h, (x) => ticked(x, fld.player))) vals()[g.key] = false;
      }
      render();
    } else if (key.startsWith('setup|Name|')) { render(); }
    else refreshDerived();
    persist();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.block) { block = b.dataset.block; render(); return; }
    const act = b.dataset.act;
    if (act === 'copy') {
      const other = b.dataset.to;
      const copied = remap(state[team][block], block, other); delete copied[LOCK];
      state[team][other] = locked(other) ? keepChart(copied, state[team][other]) : copied;   // a locked chart stays put
      block = other; render(); persist();
    }
    if (act === 'reset') {
      const fresh = { ...tpl[team].defaults[block] };
      state[team][block] = locked() ? keepChart(fresh, state[team][block]) : fresh;           // locked: everything but the chart
      render(); persist();
    }
    if (act === 'clearchart' && !locked()) {
      if (!confirm(`Clear the whole P1 chart for Set ${block}? Everything else stays as it is.`)) return;
      for (const k of Object.keys(vals())) if (isChartKey(k)) vals()[k] = '';
      render(); persist();
    }
    if (act === 'libsave') { libSave(); return; }
    if (act === 'libdel') {
      const c = cur[team]; if (!c || c.kind !== 'saved') return;
      if (!confirm(`Delete the saved chart "${c.name}"? The chart stays on the page as an unsaved working copy.`)) return;
      lib[team] = charts().filter((y) => y.id !== c.id); saveKey(LIB, lib);
      delete cur[team]; saveKey(LIBCUR, cur); render(); return;
    }
    if (act === 'libnew') {
      if (dirty() && !confirm('Start a new chart? Unsaved changes on the page will be lost (save them first if you want to keep them).')) return;
      state[team] = withDefaults({});
      delete cur[team]; saveKey(LIBCUR, cur); block = 'A'; save(state); render(); onChange && onChange(); return;
    }
    if (act === 'lockchart') {
      if (locked()) delete vals()[LOCK]; else vals()[LOCK] = true;
      render(); persist();
    }
    if (act === 'export') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', team, sets: state[team] }, null, 1)], { type: 'application/json' }));
      const nm = cur[team] && cur[team].name ? `_${cur[team].name.replace(/[^\w.-]+/g, '_')}` : '';
      a.download = `verzik_${team}man${nm}_chart.json`; a.click();
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.dataset.lib === 'pick') { await libPick(e.target.value); return; }
    if (e.target.dataset.act !== 'import' || !e.target.files[0]) return;
    try {
      const j = JSON.parse(await e.target.files[0].text());
      if (j.app !== 'verzikSim' || !j.sets) throw new Error("That file isn't a saved chart from this page");
      if (j.team !== team) throw new Error(`That file is a ${j.team}-man chart - switch Scale to ${j.team}-man first`);
      state[team] = withDefaults(j.sets);
      delete cur[team]; saveKey(LIBCUR, cur);
      render(); persist();
    } catch (err) { alertMsg(err.message); }
    e.target.value = '';
  });
  // Set A and Set B fields share keys (table|header|player), so copying is a plain copy.
  const remap = (v) => ({ ...v });
  const alertMsg = (m) => { const el = root.querySelector('#vz-checks'); if (el) el.textContent = m; };

  return {
    async show(t) { team = t; await ensure(t); await fetchDefaults(); render(); },
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
      state[t] = Object.fromEntries(BLOCKS.map((b) => [b, { ...tpl[t].defaults[b], ...readValues(ws, describe(ws, t, b)) }]));
      delete cur[t]; saveKey(LIBCUR, cur);
      save(state);
    },
  };
}
