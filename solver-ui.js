// Verz Solver tab: set the team's gear and settings, and the solver builds the P1 chart and
// picks start specs, Lightbearers, ring swap %, the purple / reds DCs and the horns (engine/roomsolver.js).
// The inputs come from the chart template's own fields (engine/chartform.js), so defaults match the chart.
import { readXlsx } from './engine/xlsx.js';
import { parse_chart, ringByDawnsText } from './engine/sim.js';
import { withGear, withGearSet, GEAR_SETS, blowpipes, gearOfLetter } from './engine/gearstore.js';
import { describe, readValues, overlaySheet, shadowBlock, SHADOW_MODES, multiInput, multiFromBox, migrateKeys } from './engine/chartform.js';
import { parseBreakpoints } from './engine/optimize.js';
import { verzikTreeHtml, profileChunks } from './engine/vtree.js';
import { solveRoom, evalRange, ROOM_DEPTHS } from './engine/roomsolver.js';
import { SolverPool } from './solver-pool.js';
import { verzSetupHtml } from './verzsetup.js';
import { verzRaidBar, showVerzRaid } from './verzraid.js';

const STORE = 'verzikSim.solver.v1';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtS = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const tickTime = (sec) => Math.floor(sec / 0.6 + 1e-6) * 0.6;
const load = () => { try { return migrateKeys(JSON.parse(localStorage.getItem(STORE))) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off */ } };

// which template fields go where (the rest are decided by the solver, or not used)
const PLAYER_SETUP = ['Name', 'meleePrayer', 'Custom Surge Timing'];
const PLAYER_GEAR = ['helm', 'body', 'legs', 'amulet', 'bloodFuryThreshold', 'has3Tick', 'Has BP', 'Shadow', '3:1', 'Shadow while LB', 'Shadow camp', 'Deep proc'];
const ADV_GEAR = ['bouncedZCB', 'offPrayer', 'hornPriority', 'Phoenix necklaces', 'Pneck on P1', 'Redemption flick', 'Pass green if death'];
// 3-5 man: the solver picks the Dawn threshold (1-6%)
const TEAM_MAIN = ['Deep proc HP %', 'P2 Scythe last hit threshold', 'P3 halberd HP %'];
const TEAM_SOLVED = ['Dawn threshold %'];
// duos: the solver picks the Dawn and P2 last-hit thresholds (1-5%) and the shadow mode itself
const DUO_MAIN = ['Number of Purples', 'Second purple %', 'Crab HP threshold', 'Perfect 1st set', 'Deep proc HP %', 'P3 halberd HP %'];
const DUO_SOLVED = ['Dawn threshold %', 'P2 Scythe last hit threshold'];
const LABEL = {
  Name: 'Name', meleePrayer: 'Prayer', 'Custom Surge Timing': 'Custom surge (m:ss)', helm: 'Helm', body: 'Body', legs: 'Legs', amulet: 'Amulet',
  bloodFuryThreshold: 'Blood fury threshold', has3Tick: '3-tick weapon', 'Has BP': 'Has BP', bouncedZCB: 'Bounced ZCB', offPrayer: 'Off prayer (P3)',
  hornPriority: 'Horn priority', 'Phoenix necklaces': 'Phoenix necklaces', 'Pneck on P1': 'Pneck on P1', 'Redemption flick': 'Redemption flick',
  'Pass green if death': 'Pass green if death', redCrab: 'Red crab', 'Brew sips': 'Brew sips', 'SCB sips': 'Super combat sips',
  'Restore sips': 'Restore sips', Sharks: 'Sharks', 'P2 Scythe last hit threshold': 'P2 halberd: scythe below HP %',
};
const HELP = {
  'Custom Surge Timing': 'Blank: the solver places this player\'s surge in P1. Filled: their surge is on cooldown until this room time (m:ss) and is taken then.',
  'P2 Scythe last hit threshold': 'Under this % of P2 HP an r40 halberd becomes a scythe',
  'East bounce tech': "East bounce tech (3-5 man): on the first N Verzik attacks in P2 before reds (0-3), the East Boak players attack on her attack tick instead of waiting a tick, chancing her bounce (50% one of them; certain if everyone is East). A bounced player's next attack is a ZCB with ruby bolts (melee gear + Blessed quiver, Necklace of rupture, Rigour), then scythes again. Stops after 2 bounces. 0 = off.",
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

export function createSolver(root, { getTeam, toBuilder = null, saveChart = null, getWorkbook = null }) {
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
      for (let k = 0; k < t; k++) if (tpl[t].desc.fields.has(`gear|East Pattern|${k}`)) state[t].v[`gear|East Pattern|${k}`] = '0-T';
    }
    // 3-tick weapon: Eye of ayak by default (once for settings saved before this default, where it was left as the chart's default)
    if (!state[t].s.ayak) {
      for (let k = 0; k < t; k++) {
        const key = `gear|has3Tick|${k}`;
        if (tpl[t].desc.fields.has(key) && (state[t].v[key] == null || state[t].v[key] === tpl[t].defaults[key])) state[t].v[key] = 'Ayak';
      }
      state[t].s.ayak = true;
    }
  }
  const S = () => state[team].s, V = () => state[team].v;
  const persist = () => save(state);
  const field = (table, h, p) => tpl[team].desc.fields.get(`${table}|${h}|${p ?? 'team'}`);
  const bpCount = () => Math.max(1, blowpipes(team, S().gearSet || 'A') ?? team);   // blowpipes in the Gear set
  const names = () => Array.from({ length: team }, (_, k) => V()[`setup|Name|${k}`] || `Player ${k + 1}`);
  const on = (h, k) => { const f = field('gear', h, k); return !!f && V()[f.key] === true; };

  /** Why a player setting can't be used with the team's Gear set ('' = it can). */
  function gearBlock(f) {
    if (f.player == null) return '';
    const letter = S().gearSet || 'A', g = gearOfLetter(team, letter), p = g && g[f.player];
    if (!p) return '';
    if ((f.header === 'Shadow' || SHADOW_MODES.includes(f.header)) && !p.hasShadow && !S().shadowSearch) return `No Tumeken's shadow in Gear set ${letter} (Gear tab)`;
    if ((f.header === 'bloodFuryThreshold' || f.header === 'Blood fury in') && p.amulet !== 'Both') return `Needs Rancour + Blood fury in Gear set ${letter} (Gear tab)`;
    return '';
  }
  function input(f) {
    let v = V()[f.key] ?? f.def;
    const k = `data-key="${esc(f.key)}"`, gb = gearBlock(f);
    if (f.type === 'multi') return multiInput(f, v, esc, gb);
    if (gb && f.type === 'bool') return `<input type="checkbox" ${k} disabled title="${esc(gb)}">`;
    if (gb) return `<input type="${f.type === 'number' ? 'number' : 'text'}" ${k} value="${esc(v)}" disabled title="${esc(gb)}">`;
    if (f.type === 'bool') {
      const why = f.player != null ? shadowBlock(f.header, (h) => on(h, f.player)) : '';
      return `<input type="checkbox" ${k} ${v === true && !why ? 'checked' : ''} ${why ? `disabled title="${esc(why)}"` : ''}>`;
    }
    if (f.type === 'select') {
      if (f.header === 'has3Tick' && v === 'Breaker') v = 'Obligator';   // its old name
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

  // redraws keep each table's horizontal scroll (e.g. ticking Shadow far right in the gear table)
  function render() {
    const sx = [...root.querySelectorAll('.scroll')].map((e) => e.scrollLeft);
    draw();
    root.querySelectorAll('.scroll').forEach((e, i) => { if (sx[i]) e.scrollLeft = sx[i]; });
  }
  function draw() {
    const d = tpl[team].desc, nm = names(), s = S(), duo = team === 2;
    const main = duo ? DUO_MAIN : TEAM_MAIN;
    const ro = rankOpts(); if (!ro.some(([v]) => v === String(s.rankBy))) s.rankBy = ro[0][0];
    const teamBody = `
      <div class="row wrap teamset">
        <label title="How many Lightbearer rings the team has. The solver decides who wears them.">Lightbearers${sel('rings', Array.from({ length: team + 1 }, (_, i) => [i, i]), s.rings)}</label>
        ${duo ? '' : `<label title="How many Soulflame horns the team has. The solver decides who holds them and whether they're used in P2, P3 or both.">Horns${sel('horns', Array.from({ length: team + 1 }, (_, i) => [i, i]), s.horns)}</label>`}
        <label title="Which Gear set (Gear tab) the team uses">Gear set${sel('gearSet', GEAR_SETS.map((g) => [g, g]), s.gearSet || 'A')}</label>
        <label title="Only one player can use Sulphur blades in P1.">Sulphur blades${sel('sb', [['', 'None'], ...nm.map((n, k) => [k, n])], s.sb)}</label>
        <label title="The most times the Dawnbringer may be passed to another player in P1 (the first holder starts with it). Fewer transfers means players spec several times in a row instead of passing the staff back and forth. Blank = no limit.">Dawn transfer limit<input data-s="dawnLimit" type="number" min="0" max="30" step="1" value="${esc(s.dawnLimit ?? '')}" placeholder="no limit" style="width:80px"></label>
        <label title="The attack a player makes right before picking up the Dawnbringer from another player is a Claw scratch instead of Sulphur blades (both 4 ticks) - picking up the Dawn and speccing is easier with claws equipped.">Claw scratch on 4t transfer<input type="checkbox" data-s="clawPickup" ${s.clawPickup ? 'checked' : ''} style="width:auto;align-self:flex-start;margin:8px 0 0"></label>
        ${main.map(teamField).join('')}
      </div>
      <div class="row wrap" style="margin-top:10px">
        <label title="Target room times (m:ss), rounded down to a tick. A raid counts if it is equal or faster.">Breakpoints<input data-s="bps" value="${esc(s.bps)}" placeholder="m:ss, comma-separated" style="width:210px"></label>
        <label>Rank by${sel('rankBy', ro, s.rankBy)}</label>
        <label title="Breakpoint rates: share of all attempts (failed raids count, so success matters too) or share of the successful runs only (how fast the kills are)">Breakpoints count${sel('bpBasis', [['all', 'All attempts'], ['kills', 'Successful runs only']], s.bpBasis || 'all')}</label>
        <label title="Optional: setups below this raid success % are left out.">Minimum success %<input data-s="minSucc" type="number" min="0" max="100" step="any" value="${esc(s.minSucc)}" placeholder="optional"></label>
        <label>Search depth${sel('depth', Object.entries(ROOM_DEPTHS).map(([k, x]) => [k, x.label]), s.depth)}</label>
      </div>
      <label class="row" style="margin-top:8px;gap:6px" title="Every filled set (A, B, C) of the chart on this page (imported or built) is run exactly as charted and always shown, and also goes through the same search (ring swap %, purple, DCs, ${duo ? 'shadow mode, thresholds' : 'horns'}) - so the results are never worse than your chart.">
        <input type="checkbox" data-s="mine" ${s.mine !== false ? 'checked' : ''}> Also try my chart (the sets on this page, as charted and improved)</label>`;
    const pickSides = !duo && !!s.sideSearch;          // Advanced: the solver picks the Boak sides
    const boakCol = { custom: true, label: 'Boak side', help: pickSides ? 'The solver picks the sides (Advanced: Let the solver pick Boak sides)' : 'Which side they move to for the purple crab',
      cell: (k) => (pickSides ? '<span class="muted" title="The solver picks (Advanced)">Solver</span>' : sel(`boak:${k}`, [['West', 'West'], ['East', 'East']], s.boak[k])) };
    const patCol = { custom: true, label: 'East pattern', help: pickSides ? 'East Boak pattern, used if the solver puts them East' : 'East Boak pattern',
      cell: (k) => { const f = field('gear', 'East Pattern', k); return f && (pickSides || s.boak[k] === 'East') ? input(f) : '<span class="muted">-</span>'; } };
    const pickBP = !!s.bpSearch;                                  // Advanced: the solver hands out the blowpipes
    const bpCol = { custom: true, label: 'Has BP', help: 'The solver hands out the blowpipes (Advanced)', cell: () => '<span class="muted" title="The solver hands out the blowpipes (Advanced)">Solver</span>' };
    // gear (helm / body / legs, amulet, prayer, blowpipe, 3-tick weapon, mage gear) comes from the Gear tab
    const BF = [['gear', 'bloodFuryThreshold'], ['gear', 'Blood fury in']];
    const roleCols = duo ? [['setup', 'Name'], ['setup', 'Custom Surge Timing'], ...BF, ['gear', 'Shadow'], ['gear', 'Deep proc']]
      : [['setup', 'Name'], boakCol, patCol, ['setup', 'Custom Surge Timing'], ...BF, ...(pickBP ? [bpCol] : []), ...PLAYER_GEAR.slice(7).map((h) => ['gear', h])];
    const playersBody = `<p class="muted small" style="margin-top:4px">Gear (helm, body, legs, amulet, prayer, blowpipe, 3-tick weapon, mage gear) comes from the Gear tab; the Blood fury threshold is set here - Gear set ${esc(s.gearSet || 'A')}.</p>${playerTable(roleCols)}
      <p class="muted small">${duo ? 'Tick Shadow for the mage (one player). The solver picks the shadow mode (camp, 3:1, Shadow while LB, or 3:1 + Shadow while LB) and the Dawn and P2 last-hit thresholds (1-5%).'
        : 'Shadow modes need Shadow ticked.'}${!duo && s.shadowSearch ? ' The solver places the shadow player(s): the ticked Shadow settings and mage gear move with them to the slot it picks.' : ''} Custom surge blank: the solver places the surge in P1.</p>
      `;
    const SUPPLIES = ['Brew sips', 'SCB sips', 'Restore sips', 'Sharks'];
    const advTeam = d.tables.team.map((f) => f.header).filter((h) => !main.includes(h) && !SUPPLIES.includes(h) && h !== 'Death tick' && !(duo ? DUO_SOLVED : TEAM_SOLVED).includes(h));
    const advBody = `<h4 style="margin-top:4px">Team supplies</h4>
      <div class="row wrap teamset">${SUPPLIES.map(teamField).join('')}</div>
      <h4>Players</h4>${playerTable([...ADV_GEAR.map((h) => ['gear', h]), ['gear', 'redCrab']].filter(([, h]) => h !== 'redCrab' || team === 2))}
      ${advTeam.length ? `<h4>Team</h4><div class="row wrap teamset">${advTeam.map(teamField).join('')}</div>` : ''}
      <div class="row wrap" style="margin-top:8px;gap:10px;align-items:center">
        <label class="row" style="gap:6px" title="Blowpipes can be traded before the room: the solver tries every way of handing out this many (who has one decides who can take the purple DC, and the P1 blowpipe fills)">
          <input type="checkbox" data-s="bpSearch" ${s.bpSearch ? 'checked' : ''}> Let the solver decide who has a blowpipe</label>
        ${s.bpSearch ? `<label title="How many blowpipes the team has">Blowpipes${sel('nBP', Array.from({ length: team }, (_, i) => [i + 1, i + 1]), s.nBP ?? bpCount())}</label>` : ''}</div>
      ${duo ? '' : `<label class="row" style="margin-top:8px;gap:6px" title="The solver also tries East bounce tech 0, 1, 2 and 3 for each setup (the East bounce tech value above is then only its starting point). It usually makes fast times more likely at the cost of some raid success.">
        <input type="checkbox" data-s="ebtSearch" ${s.ebtSearch ? 'checked' : ''}> Let the solver try East bounce tech (0-3)</label>
      <label class="row" style="margin-top:6px;gap:6px" title="The shadow player's role (Shadow, its modes and their mage gear) can be traded before the room: the solver tries it on every player slot. Results name the slot (e.g. Player 3) - the player with the shadow gear takes that slot.">
        <input type="checkbox" data-s="shadowSearch" ${s.shadowSearch ? 'checked' : ''}> Let the solver decide the shadow player</label>
      <label class="row" style="margin-top:6px;gap:6px" title="The solver also tries every West / East split for the purple (at least one player on each side) - e.g. to find the best side for a shadow player. The Boak sides set under Players are then only its starting point. Players it moves East use their East pattern (0-T if none).">
        <input type="checkbox" data-s="sideSearch" ${s.sideSearch ? 'checked' : ''}> Let the solver pick Boak sides (West / East)</label>`}`;
    root.innerHTML = `<h3 style="margin-top:0">Verz Solver <span class="muted small">(${team}-man)</span></h3>
      <p class="muted small">Set the team's gear and settings. The solver writes the P1 chart and picks start specs, who wears Lightbearer, ring swap %,
        the purple and reds DCs, ${duo ? 'the shadow mode and the Dawn / P2 last-hit thresholds' : 'the horns and the Dawn threshold (1-6%)'}. Settings are saved in this browser.</p>
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
    if (t.dataset.mkey) {                                              // multi-choice checklist (Blood fury in)
      const [mk, text] = multiFromBox(t, root);
      V()[mk] = text;
      const n = text === 'None' ? 0 : text.split(' / ').length;
      t.closest('details').querySelector('summary').textContent = n === 3 ? 'All' : n ? text.replace(/ \/ /g, ' + ') : 'None';
      persist(); return;
    }
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
    S()[key] = t.type === 'checkbox' ? t.checked : t.value;
    if (key === 'bps') { let now = false; try { now = bpsList().length > 0; } catch { /* shown on Start */ } if (!hadBps && now) S().rankBy = '0'; }
    persist();
    if (['bps', 'sideSearch', 'bpSearch', 'shadowSearch', 'gearSet'].includes(key)) render();
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
    const cfgs = withGearSet(await parse_chart({ sheetnames: [`${team}-man`], load: async () => ws }, team, null, 'A', { deferBP: true }), team, S().gearSet || 'A');
    lastValues = v;                                                   // the form as run (for Copy to set / Save as chart)
    return cfgs.map((c) => ({ ...c, actions: {}, lightbearerOn: false, ringSwitch: null, targetSpec: null, startSpec: 100,
      PurpleDC: false, Purple2DC: false, WestDC: false, EastDC: false, horn: false, hornP2: false, hornP3: false }));
  }

  /** The form fields your chart's set has different values for (header names, once each) - only what the form shows,
   *  and not what the solver decides (or the form randomizes, horn priority). */
  function formDiff(mine, form) {
    const solved = new Set(['startSpec (%)', 'lightbearerOn', 'PurpleDC', '1st Purple DC', '2nd Purple DC', 'WestDC', 'EastDC', 'Ring switch %', 'Ring % by Dawns',
      'Target spec', 'Horn', 'P2 horn', 'P3 horn', 'hornPriority', 'Name', ...(team === 2 ? [...DUO_SOLVED, 'Shadow camp', '3:1', 'Shadow while LB'] : TEAM_SOLVED)]);
    const shown = new Set([...PLAYER_SETUP, ...PLAYER_GEAR, ...ADV_GEAR, 'redCrab', 'East Boak', 'West Boak', 'East Pattern',
      ...tpl[team].desc.tables.team.map((f) => f.header).filter((h) => h !== 'Death tick')]);
    const out = new Set();
    for (const f of tpl[team].desc.fields.values()) {
      if (f.table === 'chart' || solved.has(f.header) || (!shown.has(f.header) && f.table !== 'mage')) continue;
      const a = mine[f.key] ?? '', b = form[f.key] ?? '';
      if (String(a) !== String(b)) out.add(LABEL[f.header] || f.header);
    }
    return [...out];
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
      put('setup', 'Ring % by Dawns', k, ringByDawnsText(c.ringByDawns));
      if (!x.seedLabel) put('setup', 'Target spec', k, '');           // your chart's rows keep their own
      put('gear', 'Horn', k, !!c.horn);
      put('gear', 'P2 horn', k, !!c.hornP2);
      put('gear', 'P3 horn', k, !!c.hornP3);
    });
    put('team', 'Dawn threshold %', null, x.cfg[0].dawnThr ?? '');
    if (team !== 2) put('team', 'East bounce tech', null, x.cfg[0].eastBounce || 0);
    x.cfg.forEach((c, k) => {
      put('gear', 'Has BP', k, c.hasBP !== false);
      if (team === 2) return;
      put('gear', 'Shadow', k, !!c.shadow); put('gear', '3:1', k, !!c.shadow31); put('gear', 'Shadow while LB', k, !!c.shadowLB); put('gear', 'Deep proc', k, !!c.deepProc);
      if (c.shadowSrc != null && c.shadowSrc !== k) {           // the shadow moved here: their mage gear comes with it
        for (const f of tpl[team].desc.fields.values()) if (f.table === 'mage' && f.player === c.shadowSrc) { const g = field('mage', f.header, k); if (g) out[g.key] = vals[f.key]; }
      }
    });
    if (team !== 2) x.cfg.forEach((c, k) => { put('gear', 'East Boak', k, !!c.eastBoak); put('gear', 'West Boak', k, !!c.westBoak); if (c.eastBoak && c.eastPattern) put('gear', 'East Pattern', k, c.eastPattern); });
    if (team === 2) put('team', 'P2 Scythe last hit threshold', null, x.cfg[0].lastHitThr ?? '');
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
    if (!s.bpSearch && !cfgs.some((c) => c.hasBP !== false)) { err.textContent = 'Nobody has a blowpipe - someone needs one to pop the purple crab.'; return; }
    if (team === 2 && cfgs.filter((c) => c.shadow).length !== 1) { err.textContent = 'Duos: tick Shadow for the mage (one player).'; return; }
    // your chart(s): every filled set on the page, with its own values (for Copy to set / Save as chart)
    const seeds = [], skipped = [];
    if (s.mine !== false && getWorkbook) {
      try {
        const wb = await getWorkbook();
        const ws = wb ? await wb.load(`${team}-man`) : null;
        if (ws) for (const b of ['A', 'B', 'C']) {
          let cfg; try { cfg = withGear(await parse_chart(wb, team, null, b, { deferBP: true }), team, b); } catch (e) { if (b === 'A') skipped.push(`Set A: ${e.message}`); continue; }
          if (cfg.length !== team || !cfg.some((c) => c.actions && Object.keys(c.actions).length)) continue;
          const values = { ...tpl[team].defaults, ...readValues(ws, describe(ws, team, b)) };
          // Boak side left unset on your chart: the form's side (and the 0-T East pattern, as the form defaults)
          if (team > 2) cfg = cfg.map((c, k) => {
            if (!c.eastBoak !== !c.westBoak) return c;
            const e = s.boak[k] === 'East';
            if (field('gear', 'East Boak', k)) values[`gear|East Boak|${k}`] = e;
            if (field('gear', 'West Boak', k)) values[`gear|West Boak|${k}`] = !e;
            const pat = e && !c.eastPattern ? V()[`gear|East Pattern|${k}`] || '0-T' : c.eastPattern;
            if (e && !c.eastPattern && field('gear', 'East Pattern', k)) values[`gear|East Pattern|${k}`] = pat;
            return { ...c, eastBoak: e, westBoak: !e, ...(e ? { eastPattern: pat } : {}) };
          });
          // one full raid first: a set the sim can't run is left out (and said so) instead of stopping the search
          try { evalRange('full', cfg, team, 0, 1, 'check', []); } catch (e) { skipped.push(`Set ${b}: ${e.message}`); continue; }
          seeds.push({ cfg, label: `Set ${b}`, values });
        }
      } catch { /* no chart on the page */ }
    }
    const minSucc = s.minSucc === '' ? 0 : Math.max(0, Math.min(100, Number(s.minSucc))) / 100;
    const depth = ROOM_DEPTHS[s.depth] || ROOM_DEPTHS.standard;
    running = true; root.querySelector('#sv-go').disabled = true; root.querySelector('#sv-stop').disabled = false;
    const status = root.querySelector('#sv-status'), bar = root.querySelector('#sv-prog');
    const STAGES = ['Planning', 'P1 charts', 'Editing your chart', 'Screening', 'Ring swaps, purple and P2 horns', 'Reds DCs and P3 horns', 'Final check', 'Done'];
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
        sbOwner: s.sb === '' ? null : Number(s.sb), ...depth, top: 10, seed: `solve${Date.now()}`, progress: show, ofKills: s.bpBasis === 'kills', dawnLimit: s.dawnLimit === '' || s.dawnLimit == null ? null : Math.max(0, Math.floor(Number(s.dawnLimit))), clawPickup: !!s.clawPickup, ebtSearch: team !== 2 && !!s.ebtSearch, sideSearch: team !== 2 && !!s.sideSearch, shadowSearch: team !== 2 && !!s.shadowSearch,
        bpSearch: !!s.bpSearch, nBP: s.bpSearch ? Number(s.nBP ?? bpCount()) : undefined,
        seeds: seeds.map(({ cfg, label }) => ({ cfg, label })),
      }, pool);
      const mine = Object.fromEntries(seeds.map((sd) => [sd.label, { values: sd.values, diff: formDiff(sd.values, lastValues) }]));
      results = { ...res, bps, team, names: names(), minSucc: s.minSucc, ofKills: s.bpBasis === 'kills', secs: (performance.now() - t0) / 1000, values: lastValues, mine, skipped };
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
    if (b.dataset.vraid) { showVerzRaid(b, root); return; }
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
      const vals = chartValues(x, (x.seedLabel && results.mine[x.seedLabel] ? results.mine[x.seedLabel].values : results.values) || {});
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
    if (b.dataset.vtree != null) {                                  // the setup's decision tree, played on 2,000 raids
      const i = Number(b.dataset.vtree), x = results.top[i], box = root.querySelector(`#sv-tree-${i}`), nm = results.names;
      const cfgs = x.cfg.map((c, k) => ({ ...c, name: nm[k] ?? c.name }));
      b.disabled = true;
      (async () => {
        try {
          const by = await profileChunks(cfgs, results.team, 2000, 4242, (d, n) => { b.textContent = `Playing raids... ${d.toLocaleString()} / ${n.toLocaleString()}`; });
          box.innerHTML = verzikTreeHtml(by, cfgs, results.team, esc);
        } catch (e) { b.disabled = false; b.textContent = 'Decision tree'; box.insertAdjacentHTML('beforeend', ` <span class="err small">${esc(e.message)}</span>`); }
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
    const i = results.top.indexOf(x);
    const actions = `<div class="row wrap" style="gap:8px;margin:4px 0 8px">
      ${['A', 'B', 'C'].map((b) => `<button class="ghost sm" data-copy="${i}" data-to="${b}" title="Put this setup into Set ${b} of Build chart on this page (gear, settings and the P1 chart), to run reports or optimize it">Copy to Set ${b}</button>`).join('')}
      <input data-savename="${i}" placeholder="Name, e.g. ${esc(results.team)}-man solver #${i + 1}" style="width:220px">
      <button class="sm" data-save="${i}" title="Save as a named chart (Set A) in this browser's chart library">Save as chart</button>
      <span class="muted small" id="sv-msg-${i}"></span></div>
      <div id="sv-tree-${i}" style="margin-bottom:8px"><button class="ghost sm" data-vtree="${i}" title="Each player's plan by the Dawns P1 died in, and what they do if bounced (plays 2,000 raids)">Decision tree</button></div>`;
    return `${actions}${verzSetupHtml(x.cfg, nm, results.team, { avg: x.c.k ? x.c.sum / x.c.k : null, p1Median: x.p1 ? x.p1.median : null })}${verzRaidBar(`sv-${i}-${Date.now()}`, x.cfg.map((c, k) => ({ ...c, name: nm[k] ?? c.name })), results.team, results.bps || [])}`;
  }
  function renderResults() {
    const out = root.querySelector('#sv-out'); if (!out) return;
    if (!results) { out.innerHTML = ''; return; }
    const { top, bps, fallback, names: nm, minSucc, stats, secs } = results;
    if (!top.length) {
      out.innerHTML = `<p class="err">No setup found${minSucc ? ` with ${esc(minSucc)}%+ success` : ''} - nothing to suggest.</p>`;
      return;
    }
    const ofK = !!results.ofKills;
    const cols = [...bps.map((_, j) => ({ key: `b${j}`, label: `≤ ${fmtS(bps[j])}${ofK ? ' (of kills)' : ''}`, val: (x) => x.c.under[j] / (ofK ? Math.max(1, x.c.k) : x.c.n),
      help: ofK ? 'Share of the successful runs' : 'Share of all attempts' })), { key: 'succ', label: 'Success', val: (x) => x.c.k / x.c.n },
      ...(results.team === 2 ? [{ key: 'wipe', label: 'Wipe', val: (x) => -(x.c.wipe || 0) / x.c.n, show: (x) => (x.c.wipe || 0) / x.c.n,
        help: 'Raids where both players die in P1 or P3 (counted as failed)' }] : [])];
    let rows = top.map((x, i) => ({ x, i }));
    const num = new Map(); let n1 = 0; top.forEach((x, i) => { if (!x.asCharted) num.set(i, ++n1); });   // your as-charted rows aren't numbered
    if (sortCol) { const c = cols.find((y) => y.key === sortCol); rows.sort((a, b) => sortDir * (c.val(b.x) - c.val(a.x)) || a.i - b.i); }
    const arrow = (k) => (sortCol === k ? (sortDir === 1 ? ' ▼' : ' ▲') : '');
    const diffs = Object.entries(results.mine || {}).filter(([, m]) => m.diff.length);
    out.innerHTML = `${(results.skipped || []).map((t) => `<p class="warn">Your chart wasn't included - ${esc(t)}</p>`).join('')}${diffs.map(([l, m]) => `<p class="warn">Your ${esc(l)} has different settings from the form (${esc(m.diff.slice(0, 6).join(', '))}${m.diff.length > 6 ? ', ...' : ''}) - its rows use your chart's own settings, so they aren't a like-for-like comparison.</p>`).join('')}${fallback ? `<p class="warn">No setups met ${esc(minSucc)}% success rate - these are the next best options with the highest rates of success.</p>` : ''}
      ${results.ofKills && !Number(minSucc) ? '<p class="warn">Breakpoints count the successful runs only, so a setup that rarely succeeds can still rank high - set a Minimum success % to rule those out.</p>' : ''}
      <p class="muted small">Top ${n1} of the setups found${top.length > n1 ? ', plus your chart as charted' : ''}, ${(top[0].c.n).toLocaleString()} raids each (${stats.raids.toLocaleString()} raids in ${Math.round(secs)}s). Click a column to sort it best to worst, again to reverse; # goes back to the solver's order.</p>
      <div class="scroll"><table class="bt res" style="min-width:min(760px,100%)"><tr><th data-sort="#" style="cursor:pointer" title="The solver's order">#${sortCol ? '' : ' ▼'}</th>${cols.map((c) => `<th data-sort="${c.key}" style="cursor:pointer" title="${esc(c.help ? `${c.help}. ` : '')}Sort best to worst">${esc(c.label)}${arrow(c.key)}</th>`).join('')}<th></th></tr>
      ${rows.map(({ x, i }) => `<tr><td style="white-space:nowrap">${x.asCharted ? `Your ${esc(x.seedLabel)}` : `${num.get(i)}${x.seedLabel ? ` <span class="muted small">(${x.edited ? 'edited ' : ''}from your ${esc(x.seedLabel)})</span>` : ''}`}</td>${cols.map((c) => `<td>${pct(c.show ? c.show(x) : c.val(x))}</td>`).join('')}<td><button class="ghost sm" data-setup="${i}">${shownSetups.has(i) ? 'Hide setup' : 'See setup'}</button></td></tr>
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
