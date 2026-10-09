// Verz Solver tab: set the team's gear and settings, and the solver builds the P1 chart and
// picks start specs, Lightbearers, ring swap %, the purple / reds DCs and the horns (engine/roomsolver.js).
// The inputs come from the chart template's own fields (engine/chartform.js), so defaults match the chart.
import { readXlsx } from './engine/xlsx.js';
import { parse_chart } from './engine/sim.js';
import { describe, readValues, overlaySheet, shadowBlock, SHADOW_MODES } from './engine/chartform.js';
import { parseBreakpoints } from './engine/optimize.js';
import { solveRoom, ROOM_DEPTHS } from './engine/roomsolver.js';
import { SolverPool } from './solver-pool.js';

const STORE = 'verzikSim.solver.v1';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtS = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const fmtT = (t) => fmtS(t * 0.6);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const tickTime = (sec) => Math.floor(sec / 0.6 + 1e-6) * 0.6;
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off */ } };
const CODE_BG = { S: '#8fd18f', D: '#c9b6e4', A: '#fff2a8', C: '#f8cbad', H: '#f4b183', E: '#b4c7e7', SB: '#ffd966', B: '#d9a6e0',
  T: '#8eb4e3', P: '#ff66cc', R: '#ffffff', X: '#595959' };

// which template fields go where (the rest are decided by the solver, or not used)
const PLAYER_SETUP = ['Name', 'meleePrayer', 'Custom Surge Timing'];
const PLAYER_GEAR = ['helm', 'body', 'legs', 'amulet', 'bloodFuryHp', 'has3Tick', 'Has BP', 'Shadow', '3:1', 'Shadow while LB', 'Shadow camp', 'Deep proc'];
const ADV_GEAR = ['bouncedZCB', 'offPrayer', 'hornPriority', 'Phoenix necklaces', 'Pneck on P1', 'Redemption flick', 'Pass green if death'];
const TEAM_MAIN = ['Deep proc HP %', 'Dawn threshold %', 'P2 Scythe last hit threshold', 'P3 halberd HP %'];
// duos: the solver picks the Dawn and P2 last-hit thresholds (1-5%) and the shadow mode itself
const DUO_MAIN = ['Number of Purples', 'Second purple %', 'Crab HP threshold', 'Perfect 1st set', 'Deep proc HP %', 'P3 halberd HP %'];
const DUO_SOLVED = ['Dawn threshold %', 'P2 Scythe last hit threshold'];
const LABEL = {
  Name: 'Name', meleePrayer: 'Prayer', 'Custom Surge Timing': 'Custom surge (m:ss)', helm: 'Helm', body: 'Body', legs: 'Legs', amulet: 'Amulet',
  bloodFuryHp: 'Blood fury HP', has3Tick: '3-tick weapon', 'Has BP': 'Has BP', bouncedZCB: 'Bounced ZCB', offPrayer: 'Off prayer (P3)',
  hornPriority: 'Horn priority', 'Phoenix necklaces': 'Phoenix necklaces', 'Pneck on P1': 'Pneck on P1', 'Redemption flick': 'Redemption flick',
  'Pass green if death': 'Pass green if death', redCrab: 'Red crab', 'Brew sips': 'Brew sips', 'SCB sips': 'Super combat sips',
  'Restore sips': 'Restore sips', Sharks: 'Sharks', 'P2 Scythe last hit threshold': 'P2 halberd: scythe below HP %',
};
const HELP = {
  'Custom Surge Timing': 'Blank: the solver places this player\'s surge in P1. Filled: their surge is on cooldown until this room time (m:ss) and is taken then.',
  'P2 Scythe last hit threshold': 'Under this % of P2 HP an r40 halberd becomes a scythe',
  'Dawn threshold %': 'P1 HP % at or below which a Dawn spec becomes a scythe (blank = never)',
  'P3 halberd HP %': 'P3 HP % at or below which players halberd', 'Deep proc HP %': 'Shadow from max distance below this P2 HP % (Deep proc players)',
  hornPriority: 'Who gets a horn buff first (1 = first). All blank: a random order each run, no two players sharing a number.',
  'Has BP': 'Has a blowpipe. Without one they can\'t take the purple DC.',
  'Shadow while LB': 'Shadow while wearing Lightbearer, then scythe (or 3:1) after the swap. Needs Shadow.',
  '3:1': 'Scythe, but the attack that would collide with Verzik becomes a shadow. Needs Shadow.',
  'Deep proc': 'Shadow from max distance below the Deep proc HP %. Needs Shadow.',
  offPrayer: 'Verzik P3 autos taken off prayer (0-9)',
  'Brew sips': 'Saradomin brew sips the whole team brings', 'SCB sips': 'Super combat potion sips the whole team brings',
  'Restore sips': 'Super restore sips the whole team brings', Sharks: 'Sharks the whole team brings',
};

export function createSolver(root, { getTeam, toBuilder = null, saveChart = null }) {
  let tplWb = null, team = 0, pool = null, running = false, results = null, sortCol = null, sortDir = 1, open = {}, lastValues = null;
  const shownSetups = new Set();          // result rows whose setup is open
  const tpl = {};                                    // team -> {ws, desc, defaults}
  const state = load();                              // team -> {v: {fieldKey: value}, s: {rings, horns, sb, bps, rankBy, minSucc, depth, boak: []}}

  async function ensure(t) {
    if (!tplWb) {
      const res = await fetch(new URL('./verzik_chart_template.xlsx', import.meta.url));
      if (!res.ok) throw new Error("Couldn't load the chart template from the site");
      tplWb = await readXlsx(new Uint8Array(await res.arrayBuffer()));
    }
    if (!tpl[t]) {
      const ws = await tplWb.load(`${t}-man`);
      const desc = describe(ws, t, 'A');
      tpl[t] = { ws, desc, defaults: readValues(ws, desc) };
    }
    if (!state[t]) {
      const dv = { ...tpl[t].defaults };
      if (t === 2 && tpl[t].desc.fields.has('team|Brew sips|team')) dv['team|Brew sips|team'] = 32;   // duos: 32 brew sips as a team
      state[t] = { v: dv, s: { rings: t, horns: t === 5 ? 2 : 1, sb: '', bps: '', rankBy: '0', minSucc: '', depth: 'standard',
        boak: Array.from({ length: t }, (_, k) => (k < 2 ? 'West' : 'East')) } };
      // default East pattern for East Boak players: 0-T
      for (let k = 2; k < t; k++) if (tpl[t].desc.fields.has(`gear|East Pattern|${k}`)) state[t].v[`gear|East Pattern|${k}`] = '0-T';
    }
  }
  const S = () => state[team].s, V = () => state[team].v;
  const persist = () => save(state);
  const field = (table, h, p) => tpl[team].desc.fields.get(`${table}|${h}|${p ?? 'team'}`);
  const names = () => Array.from({ length: team }, (_, k) => V()[`setup|Name|${k}`] || `Player ${k + 1}`);
  const on = (h, k) => { const f = field('gear', h, k); return !!f && V()[f.key] === true; };

  function input(f) {
    const v = V()[f.key] ?? f.def, k = `data-key="${esc(f.key)}"`;
    if (f.type === 'bool') {
      const why = f.player != null ? shadowBlock(f.header, (h) => on(h, f.player)) : '';
      return `<input type="checkbox" ${k} ${v === true && !why ? 'checked' : ''} ${why ? `disabled title="${esc(why)}"` : ''}>`;
    }
    if (f.type === 'select') {
      const ch = [...f.choices]; if (v !== '' && !ch.map(String).includes(String(v))) ch.push(v);
      return `<select ${k}>${ch.map((c) => `<option ${String(c) === String(v) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    }
    if (f.type === 'number') return `<input type="number" step="any" ${k} value="${esc(v)}">`;
    return `<input type="text" ${k} value="${esc(v)}" ${f.header === 'Custom Surge Timing' ? 'placeholder="m:ss"' : ''}>`;
  }
  /** Player table: columns = [table, header] pairs (or a custom column), rows = players (filter = which rows). */
  function playerTable(cols, filter = () => true) {
    const nm = names();
    const shown = cols.filter((c) => c.custom || nm.some((_, k) => field(c[0], c[1], k)));
    const th = (c) => (c.custom ? `<th title="${esc(c.help || '')}">${esc(c.label)}</th>` : `<th title="${esc(HELP[c[1]] || '')}">${esc(LABEL[c[1]] || c[1])}</th>`);
    const td = (c, k) => {
      if (c.custom) return `<td>${c.cell(k)}</td>`;
      const f = field(c[0], c[1], k); return `<td>${f ? input(f) : ''}</td>`;
    };
    return `<div class="scroll"><table class="bt"><tr><th></th>${shown.map(th).join('')}</tr>${
      nm.map((n, k) => (filter(k) ? `<tr><td class="rl">${k + 1}. ${esc(n)}</td>${shown.map((c) => td(c, k)).join('')}</tr>` : '')).join('')}</table></div>`;
  }
  const teamField = (h) => { const f = field('team', h); return f ? `<label title="${esc(HELP[h] || '')}">${esc(LABEL[h] || h)}${input(f)}</label>` : ''; };
  const sel = (key, opts, cur) => `<select data-s="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

  function bpsList() {
    const t = String(S().bps || '').trim();
    if (!t) return [];
    return [...new Set(parseBreakpoints(t).map(tickTime))].sort((a, b) => b - a);
  }
  function rankOpts() {
    let b = []; try { b = bpsList(); } catch { /* shown on Start */ }
    return [...b.map((s, j) => [String(j), `Equal or faster than ${fmtS(s)}`]), ['success', 'Success rate']];
  }

  function section(id, title, body, defOpen) {
    const isOpen = open[id] ?? defOpen;
    return `<details class="msec" data-sec="${id}" ${isOpen ? 'open' : ''}><summary>${esc(title)}</summary><div style="padding:0 12px 10px">${body}</div></details>`;
  }

  function render() {
    const d = tpl[team].desc, nm = names(), s = S(), duo = team === 2;
    const main = duo ? DUO_MAIN : TEAM_MAIN;
    const ro = rankOpts(); if (!ro.some(([v]) => v === String(s.rankBy))) s.rankBy = ro[0][0];
    const shadowRows = nm.map((_, k) => on('Shadow', k));
    const teamBody = `
      <div class="row wrap teamset">
        <label title="How many Lightbearer rings the team has. The solver decides who wears them.">Lightbearers${sel('rings', Array.from({ length: team + 1 }, (_, i) => [i, i]), s.rings)}</label>
        ${duo ? '' : `<label title="How many Soulflame horns the team has. The solver decides who holds them and whether they're used in P2, P3 or both.">Horns${sel('horns', Array.from({ length: team + 1 }, (_, i) => [i, i]), s.horns)}</label>`}
        <label title="Only one player can use Sulphur blades in P1.">Sulphur blades${sel('sb', [['', 'None'], ...nm.map((n, k) => [k, n])], s.sb)}</label>
        ${main.map(teamField).join('')}
      </div>
      <div class="row wrap" style="margin-top:10px">
        <label title="Target room times (m:ss), rounded down to a tick. A raid counts if it is equal or faster.">Breakpoints<input data-s="bps" value="${esc(s.bps)}" placeholder="m:ss, comma-separated" style="width:210px"></label>
        <label>Rank by${sel('rankBy', ro, s.rankBy)}</label>
        <label title="Optional: setups below this raid success % are left out.">Minimum success %<input data-s="minSucc" type="number" min="0" max="100" step="any" value="${esc(s.minSucc)}" placeholder="optional"></label>
        <label>Search depth${sel('depth', Object.entries(ROOM_DEPTHS).map(([k, x]) => [k, x.label]), s.depth)}</label>
      </div>`;
    const boakCol = { custom: true, label: 'Boak side', help: 'Which side they move to for the purple crab', cell: (k) => sel(`boak:${k}`, [['West', 'West'], ['East', 'East']], s.boak[k]) };
    const patCol = { custom: true, label: 'East pattern', help: 'East Boak pattern', cell: (k) => { const f = field('gear', 'East Pattern', k); return f && s.boak[k] === 'East' ? input(f) : '<span class="muted">-</span>'; } };
    const gearCols = [['setup', 'Name'], ['setup', 'meleePrayer'], ...PLAYER_GEAR.slice(0, 7).map((h) => ['gear', h])];
    const roleCols = duo ? [['setup', 'Custom Surge Timing'], ['gear', 'Shadow'], ['gear', 'Deep proc']]
      : [boakCol, patCol, ['setup', 'Custom Surge Timing'], ...PLAYER_GEAR.slice(7).map((h) => ['gear', h])];
    const mage = d.tables.mage.filter((h) => !['necklace', 'boots', 'gloves'].includes(h));
    const playersBody = `<h4 style="margin-top:4px">Gear</h4>${playerTable(gearCols)}<h4>Roles</h4>${playerTable(roleCols)}
      <p class="muted small">${duo ? 'Tick Shadow for the mage (one player). The solver picks the shadow mode (camp, 3:1, Shadow while LB, or 3:1 + Shadow while LB) and the Dawn and P2 last-hit thresholds (1-5%).'
        : 'Shadow modes need Shadow ticked.'} Custom surge blank: the solver places the surge in P1.</p>
      ${shadowRows.some(Boolean) && mage.length ? `<h4>Mage gear <span class="muted small">(Shadow players)</span></h4>${playerTable(mage.map((h) => ['mage', h]), (k) => shadowRows[k])}` : ''}`;
    const SUPPLIES = ['Brew sips', 'SCB sips', 'Restore sips', 'Sharks'];
    const advTeam = d.tables.team.map((f) => f.header).filter((h) => !main.includes(h) && !SUPPLIES.includes(h) && h !== 'Death tick' && !(duo && DUO_SOLVED.includes(h)));
    const advBody = `<h4 style="margin-top:4px">Team supplies</h4>
      <div class="row wrap teamset">${SUPPLIES.map(teamField).join('')}</div>
      <h4>Players</h4>${playerTable([...ADV_GEAR.map((h) => ['gear', h]), ['gear', 'redCrab']].filter(([, h]) => h !== 'redCrab' || team === 2))}
      ${advTeam.length ? `<h4>Team</h4><div class="row wrap teamset">${advTeam.map(teamField).join('')}</div>` : ''}`;
    root.innerHTML = `<h3 style="margin-top:0">Verz Solver <span class="muted small">(${team}-man)</span></h3>
      <p class="muted small">Set the team's gear and settings. The solver writes the P1 chart and picks start specs, who wears Lightbearer, ring swap %,
        the purple and reds DCs and ${duo ? 'the shadow mode and Dawn / P2 last-hit thresholds' : 'the horns'} - everyone always claws in reds. Settings are saved in this browser.</p>
      ${section('team', 'Team', teamBody, true)}
      ${section('players', 'Players', playersBody, true)}
      ${section('adv', 'Advanced', advBody, false)}
      <div class="row between" style="margin-top:12px">
        <div id="sv-est" class="muted small"></div>
        <div class="row"><button id="sv-go" ${running ? 'disabled' : ''}>Start solver</button><button id="sv-stop" class="ghost" ${running ? '' : 'disabled'}>Stop</button></div>
      </div>
      <div class="bar"><div id="sv-prog"></div></div>
      <div id="sv-status" class="muted small" style="margin-top:6px"></div>
      <div id="sv-err" class="err"></div>
      <div id="sv-out"></div>`;
    renderResults();
  }

  // ---- inputs
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.key) {
      const f = tpl[team].desc.fields.get(t.dataset.key);
      let v = t.type === 'checkbox' ? t.checked : t.value;
      if (f && f.type === 'select' && typeof f.choices[0] === 'number') v = Number(v);
      V()[t.dataset.key] = v;
      if (f && f.player != null && (f.header === 'Shadow' || SHADOW_MODES.includes(f.header))) {
        for (const h of SHADOW_MODES) { const g = field('gear', h, f.player); if (g && V()[g.key] === true && shadowBlock(h, (x) => on(x, f.player))) V()[g.key] = false; }
        persist(); render(); return;
      }
      if (t.dataset.key.startsWith('setup|Name|')) { persist(); return; }
      persist();
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.key && t.dataset.key.startsWith('setup|Name|')) { render(); return; }
    if (!t.dataset.s) return;
    const key = t.dataset.s;
    if (key.startsWith('boak:')) { S().boak[Number(key.slice(5))] = t.value; persist(); render(); return; }
    const hadBps = (() => { try { return bpsList().length > 0; } catch { return false; } })();
    S()[key] = t.value;
    if (key === 'bps') { let now = false; try { now = bpsList().length > 0; } catch { /* shown on Start */ } if (!hadBps && now) S().rankBy = '0'; }
    persist();
    if (key === 'bps') render();
  });
  root.addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.sec) open[d.dataset.sec] = d.open; }, true);

  // ---- run
  async function buildCfgs() {
    const v = { ...V() }, s = S();
    for (let k = 0; k < team; k++) {                                 // Boak side -> the chart's two checkboxes
      const e = s.boak[k] === 'East';
      if (field('gear', 'East Boak', k)) v[`gear|East Boak|${k}`] = e;
      if (field('gear', 'West Boak', k)) v[`gear|West Boak|${k}`] = !e;
    }
    // horn priority: all blank -> a random order, no two players sharing a number
    const hp = Array.from({ length: team }, (_, k) => field('gear', 'hornPriority', k)).filter(Boolean);
    if (hp.length && hp.every((f) => v[f.key] === '' || v[f.key] == null)) {
      const order = [...Array(team).keys()].sort(() => Math.random() - 0.5);
      hp.forEach((f) => { v[f.key] = order.indexOf(f.player) + 1; });
    }
    for (const f of tpl[team].desc.fields.values()) if (f.table === 'chart') v[f.key] = '';
    const ws = overlaySheet(tpl[team].ws, { A: tpl[team].desc }, { A: v });
    const cfgs = await parse_chart({ sheetnames: [`${team}-man`], load: async () => ws }, team, null, 'A');
    lastValues = v;                                                   // the form as run (for Copy to set / Save as chart)
    return cfgs.map((c) => ({ ...c, actions: {}, lightbearerOn: false, ringSwitch: null, targetSpec: null, startSpec: 100,
      PurpleDC: false, Purple2DC: false, WestDC: false, EastDC: false, horn: false, hornP2: false, hornP3: false }));
  }

  /** A result as chart-builder values: the form as it was run + the solver's choices and P1 chart. */
  function chartValues(x, vals) {
    const out = { ...vals };
    const put = (table, h, k, v) => { const f = field(table, h, k); if (f) out[f.key] = v; };
    x.cfg.forEach((c, k) => {
      put('setup', 'startSpec (%)', k, c.startSpec);
      put('setup', 'lightbearerOn', k, !!c.lightbearerOn);
      put('setup', 'PurpleDC', k, !!c.PurpleDC);
      put('setup', '1st Purple DC', k, !!c.PurpleDC);
      put('setup', '2nd Purple DC', k, !!c.Purple2DC);
      if (team === 2) { put('gear', 'Shadow camp', k, !!c.shadowCamp); put('gear', '3:1', k, !!c.shadow31); put('gear', 'Shadow while LB', k, !!c.shadowLB); }
      put('setup', 'WestDC', k, !!c.WestDC);
      put('setup', 'EastDC', k, !!c.EastDC);
      put('setup', 'Ring switch %', k, c.ringSwitch ?? '');
      put('setup', 'Target spec', k, '');
      put('gear', 'Horn', k, !!c.horn);
      put('gear', 'P2 horn', k, !!c.hornP2);
      put('gear', 'P3 horn', k, !!c.hornP3);
    });
    if (team === 2) { put('team', 'Dawn threshold %', null, x.cfg[0].dawnThr ?? ''); put('team', 'P2 Scythe last hit threshold', null, x.cfg[0].lastHitThr ?? ''); }
    for (const f of tpl[team].desc.fields.values()) {
      if (f.table !== 'chart') continue;
      out[f.key] = x.cfg[f.player].actions[Number(f.header)] || '';
    }
    return out;
  }

  async function start() {
    const s = S(), err = root.querySelector('#sv-err');
    err.textContent = ''; results = null; renderResults();
    let bps;
    try { bps = bpsList(); } catch (e) { err.textContent = `Breakpoints: ${e.message}`; return; }
    let cfgs;
    try { cfgs = await buildCfgs(); } catch (e) { err.textContent = e.message; return; }
    if (!cfgs.some((c) => c.hasBP !== false)) { err.textContent = 'Nobody has a blowpipe - someone needs one to pop the purple crab.'; return; }
    if (team === 2 && cfgs.filter((c) => c.shadow).length !== 1) { err.textContent = 'Duos: tick Shadow for the mage (one player).'; return; }
    const minSucc = s.minSucc === '' ? 0 : Math.max(0, Math.min(100, Number(s.minSucc))) / 100;
    const depth = ROOM_DEPTHS[s.depth] || ROOM_DEPTHS.standard;
    running = true; root.querySelector('#sv-go').disabled = true; root.querySelector('#sv-stop').disabled = false;
    const status = root.querySelector('#sv-status'), bar = root.querySelector('#sv-prog');
    const STAGES = ['Planning', 'P1 charts', 'Screening', 'Ring swaps, purple and P2 horns', 'Reds DCs and P3 horns', 'Final check', 'Done'];
    const t0 = performance.now();
    pool = new SolverPool();
    let last = { stage: 'Planning', raids: 0 };
    const tick = setInterval(() => show(last), 1000);
    function show(p) {
      last = p;
      const i = Math.max(0, STAGES.indexOf(p.stage));
      bar.style.width = `${(i / (STAGES.length - 1) * 100).toFixed(0)}%`;
      status.textContent = `${p.stage}${p.stage === 'Done' ? '' : '...'} · ${p.raids.toLocaleString()} raids · ${Math.round((performance.now() - t0) / 1000)}s`;
    }
    try {
      const res = await solveRoom(cfgs, team, {
        rings: Number(s.rings), horns: team === 2 ? 0 : Number(s.horns), bpsFull: bps, rankBy: s.rankBy, minSuccess: minSucc,
        sbOwner: s.sb === '' ? null : Number(s.sb), ...depth, top: 10, seed: `solve${Date.now()}`, progress: show,
      }, pool);
      results = { ...res, bps, team, names: names(), minSucc: s.minSucc, secs: (performance.now() - t0) / 1000, values: lastValues };
      sortCol = null; sortDir = 1; shownSetups.clear();
      show({ stage: 'Done', raids: res.stats.raids });
      bar.style.width = '100%';
    } catch (e) {
      if (e.message !== 'Solver stopped.') console.error(e.stack || e.message);
      err.textContent = e.message === 'Solver stopped.' ? 'Stopped.' : e.message;
    } finally {
      clearInterval(tick);
      if (pool) pool.stop(); pool = null;
      running = false;
      const go = root.querySelector('#sv-go'), stop = root.querySelector('#sv-stop');
      if (go) go.disabled = false; if (stop) stop.disabled = true;
      renderResults();
    }
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button, th[data-sort]'); if (!b) return;
    if (b.id === 'sv-go') { start(); return; }
    if (b.id === 'sv-stop') { if (pool) pool.stop(); return; }
    if (b.dataset.sort != null) {
      const c = b.dataset.sort;
      if (sortCol === c) sortDir = -sortDir; else { sortCol = c; sortDir = 1; }
      if (c === '#') { sortCol = null; sortDir = 1; }
      renderResults(); return;
    }
    if (b.dataset.copy != null || b.dataset.save != null) {
      const i = Number(b.dataset.copy ?? b.dataset.save), x = results && results.top[i], msg = root.querySelector(`#sv-msg-${i}`);
      if (!x) return;
      const vals = chartValues(x, results.values || {});
      (async () => {
        try {
          if (b.dataset.copy != null) {
            if (!toBuilder) throw new Error('Copy to set is not available here');
            await toBuilder(results.team, b.dataset.to, vals);
            msg.textContent = `Copied to Set ${b.dataset.to} - "Build chart on this page" is now selected, so Run report and the Optimizer use it.`;
          } else {
            const nm = (root.querySelector(`[data-savename="${i}"]`).value || '').trim();
            if (!nm) { msg.textContent = 'Type a name first.'; return; }
            if (!saveChart) throw new Error('Saving is not available here');
            const ok = await saveChart(results.team, nm, vals);
            if (ok) msg.textContent = `Saved as "${nm}" - pick it from the Chart list in "Build chart on this page".`;
          }
        } catch (e) { msg.textContent = e.message; }
      })();
      return;
    }
    if (b.dataset.setup != null) {
      const i = Number(b.dataset.setup), r = root.querySelector(`#sv-setup-${i}`);
      if (r) { r.hidden = !r.hidden; b.textContent = r.hidden ? 'See setup' : 'Hide setup'; if (r.hidden) shownSetups.delete(i); else shownSetups.add(i); }
    }
  });

  // ---- results
  function setupHtml(x, nm) {
    const cf = x.cfg;
    const who = (key) => nm[cf.findIndex((c) => c[key])] ?? '-';
    const horns = cf.map((c, k) => (c.horn && (c.hornP2 || c.hornP3) ? `${nm[k]} (${[c.hornP2 ? 'P2' : '', c.hornP3 ? 'P3' : ''].filter(Boolean).join(' + ')})` : null)).filter(Boolean);
    const rows = [
      ['Lightbearer', cf.map((c, k) => (c.lightbearerOn ? nm[k] : null)).filter(Boolean).join(', ') || 'none'],
      ['Ring swap %', cf.map((c, k) => (c.lightbearerOn ? `${nm[k]} ${c.ringSwitch ?? 'default'}` : null)).filter(Boolean).join(', ') || '-'],
      ['Purple DC', who('PurpleDC')],
      ['Reds DCs', `West ${who('WestDC')}, East ${who('EastDC')}`],
      ...(results.team === 2 ? [
        ['2nd purple DC', cf.find((c) => c.Purple2DC) ? who('Purple2DC') : `${who('PurpleDC')} (both purples)`],
        ['Shadow mode', (() => { const m = cf.find((c) => c.shadow); return m ? [m.shadowCamp && 'Shadow camp', m.shadowLB && 'Shadow while LB', m.shadow31 && '3:1'].filter(Boolean).join(' + ') || 'Shadow' : '-'; })()],
        ['Dawn threshold', `${cf[0].dawnThr ?? '-'}%`],
        ['P2 last-hit threshold', `${cf[0].lastHitThr ?? '-'}%`],
      ] : [['Horns', horns.join(', ') || 'none']]),
      ['Start spec', cf.map((c, k) => `${nm[k]} ${c.startSpec}%`).join(', ')],
      ['Average room time', x.c.k ? fmtT(x.c.sum / x.c.k) : '-'],
    ];
    const cap = results.team === 2 ? 150 : 70;
    const end = Math.min(cap, Math.max(...cf.map((c) => Math.max(0, ...Object.keys(c.actions).map(Number)))), x.p1 ? x.p1.median + 2 : cap);
    const grid = `<div class="scroll"><table class="bt grid"><tr><th></th><th>Start</th>${Array.from({ length: end }, (_, t) => `<th>${t + 1}</th>`).join('')}</tr>${
      cf.map((c, k) => `<tr><td class="rl">${esc(nm[k])}</td><td>${c.startSpec}%</td>${Array.from({ length: end }, (_, t) => {
        const a = c.actions[t + 1] || '';
        const bg = a.startsWith('ST>') ? '#33cc33' : CODE_BG[a];
        return `<td style="${bg ? `background:${bg};color:${a === 'X' ? '#fff' : '#000'};font-weight:700` : ''}">${esc(a)}</td>`;
      }).join('')}</tr>`).join('')}</table></div>`;
    const i = results.top.indexOf(x);
    const actions = `<div class="row wrap" style="gap:8px;margin:4px 0 8px">
      ${['A', 'B', 'C'].map((b) => `<button class="ghost sm" data-copy="${i}" data-to="${b}" title="Put this setup into Set ${b} of Build chart on this page (gear, settings and the P1 chart), to run reports or optimize it">Copy to Set ${b}</button>`).join('')}
      <input data-savename="${i}" placeholder="Name, e.g. ${esc(results.team)}-man solver #${i + 1}" style="width:220px">
      <button class="sm" data-save="${i}" title="Save as a named chart (Set A) in this browser's chart library">Save as chart</button>
      <span class="muted small" id="sv-msg-${i}"></span></div>`;
    return `${actions}<table class="bt"><tbody>${rows.map(([a, b]) => `<tr><td class="rl">${esc(a)}</td><td style="text-align:left;white-space:normal">${esc(b)}</td></tr>`).join('')}</tbody></table>
      <h4>P1 chart</h4>${grid}`;
  }
  function renderResults() {
    const out = root.querySelector('#sv-out'); if (!out) return;
    if (!results) { out.innerHTML = ''; return; }
    const { top, bps, fallback, names: nm, minSucc, stats, secs } = results;
    if (!top.length) {
      out.innerHTML = `<p class="err">No setup has everyone clawing in reds in 95% of raids${minSucc ? ` with ${esc(minSucc)}%+ success` : ''} - nothing to suggest.</p>`;
      return;
    }
    const cols = [...bps.map((_, j) => ({ key: `b${j}`, label: `≤ ${fmtS(bps[j])}`, val: (x) => x.c.under[j] / x.c.n })), { key: 'succ', label: 'Success', val: (x) => x.c.k / x.c.n },
      ...(results.team === 2 ? [{ key: 'wipe', label: 'Wipe', val: (x) => -(x.c.wipe || 0) / x.c.n, show: (x) => (x.c.wipe || 0) / x.c.n,
        help: 'Raids where both players die in P1 or P3 (counted as failed)' }] : [])];
    let rows = top.map((x, i) => ({ x, i }));
    if (sortCol) { const c = cols.find((y) => y.key === sortCol); rows.sort((a, b) => sortDir * (c.val(b.x) - c.val(a.x)) || a.i - b.i); }
    const arrow = (k) => (sortCol === k ? (sortDir === 1 ? ' ▼' : ' ▲') : '');
    out.innerHTML = `${fallback ? `<p class="warn">No setups met ${esc(minSucc)}% success rate - these are the next best options with the highest rates of success.</p>` : ''}
      <p class="muted small">Top ${top.length} of the setups found, ${(top[0].c.n).toLocaleString()} raids each (${stats.raids.toLocaleString()} raids in ${Math.round(secs)}s). Click a column to sort it best to worst, again to reverse; # goes back to the solver's order.</p>
      <div class="scroll"><table class="bt res" style="min-width:min(760px,100%)"><tr><th data-sort="#" style="cursor:pointer" title="The solver's order">#${sortCol ? '' : ' ▼'}</th>${cols.map((c) => `<th data-sort="${c.key}" style="cursor:pointer" title="${esc(c.help ? `${c.help}. ` : '')}Sort best to worst">${esc(c.label)}${arrow(c.key)}</th>`).join('')}<th></th></tr>
      ${rows.map(({ x, i }) => `<tr><td>${i + 1}</td>${cols.map((c) => `<td>${pct(c.show ? c.show(x) : c.val(x))}</td>`).join('')}<td><button class="ghost sm" data-setup="${i}">${shownSetups.has(i) ? 'Hide setup' : 'See setup'}</button></td></tr>
        <tr id="sv-setup-${i}" ${shownSetups.has(i) ? '' : 'hidden'}><td colspan="${cols.length + 2}" style="text-align:left;white-space:normal">
          <div style="width:0;min-width:100%;overflow-x:auto">${setupHtml(x, nm)}</div></td></tr>`).join('')}</table></div>`;
  }

  return {
    async refresh() {
      const t = getTeam();
      if (running && t !== team) return;                              // keep the running solve on screen
      if (t !== team) results = null;
      team = t;
      try { await ensure(team); render(); } catch (e) { root.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    },
  };
}
