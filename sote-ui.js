// Sotetseg tab: per-player room settings for 2-5 man (the Sotetseg sim comes next). Saved in this browser.
// Gear comes from the Gear tab (the Gear set picked here); the prefire choices need the weapon in that Gear set.
// Rules for the sim (agreed):
//  - Start spec 95 or 100 (default 100). A 95% start gets its first regen the tick after their first special attack,
//    then regens as normal.
//  - Surge: they drink a surge with their first special attack.
//  - Lightbearer cycles: how many spec regens they wear Lightbearer for (none, 1-5; a regen every 25 ticks on it), then
//    swap to Ultor (the regen timer restarts). The solver will pick Surge / Lightbearer cycles too.
//  - Prefires with the Twisted bow / ZCB are made in their best ranged gear, Shadow / Shadow Barrage in their best magic
//    gear (each slot: their ranged, magic or melee item, or nothing - loadout.js bestWorn).
import { loadGear, gearSet, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { bestWorn, bonuses, blankPlayer } from './engine/loadout.js';
import { newSoteResult, addSoteRaids, soteReportHtml, soteReportPage } from './engine/sotereport.js';
import { parseBreakpoints } from './engine/optimize.js';
import { solveSote } from './engine/sotesolve.js';
import { SotePool } from './sote-solver-pool.js';
import { defaultMazes, MAZE_HOW, defaultSpecs, defaultSetup, SPECS, SPEC_COST, CLAW_BELOW } from './engine/sote.js';
import { projectPlayer, TYPICAL_TIMES } from './engine/soteplan.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';

const STORE = 'verzikSim.sote.v1';             // {team: {gearSet, surgeLimit, lbRings, players: [{startSpec, surge, lbCycles, pnecks, sharks, rests, restores, prefire, mazes: [first, second]}]}}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off: kept for this page */ } };

/** Prefire choices: [value, label, weapon it needs]. */
export const PREFIRES = [
  ['Twisted bow', 'Twisted bow', 'Twisted bow'],
  ['ZCB auto', 'ZCB auto', 'Zaryte crossbow'],
  ['ZCB spec', 'ZCB spec', 'Zaryte crossbow'],
  ['Shadow Barrage', 'Shadow Barrage', 'Shadow ancient sceptre'],
  ["Tumeken's shadow", "Tumeken's shadow", "Tumeken's shadow"],
];
const STYLE = { 'Twisted bow': 'range', 'Zaryte crossbow': 'range', 'Shadow ancient sceptre': 'mage', "Tumeken's shadow": 'mage' };
const blank = () => ({ startSpec: 100, surge: false, lbCycles: 0, pnecks: 2, sharks: 3, rests: 0, restores: 3, prefire: '' });
/** How each player crosses each maze (First maze / Second maze; default by their phoenix necklaces - defaultMazes):
 *  Pneck: stall on the maze with a phoenix necklace. Redemption (1-4s, with a locator orb from the Gear tab): orb down to
 *  1 HP and stall with Redemption (a restore sip a maze; they swing a tick late). Shark (one player at most): skip away
 *  from the others, eating sharks / Guthix rests through it. Run: everyone runs that maze (slower). */
const sign = (n) => (n > 0 ? `+${n}` : String(n));


export function createSote(host, { getTeam }) {
  let state = load();
  host.innerHTML = `${settingsCard('Sotetseg settings', '<div data-cfg></div>')}
    ${tabsHtml([['rep', 'Report'], ['opt', 'Optimizer'], ['solve', 'Solver']])}
    ${pane('rep', 'data-rep', `
      <div class="row" style="margin-top:10px">
        <label>Raids<input data-r="raids" type="number" min="100" step="500" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <div data-rsets></div>
        <label title="Target room times (m:ss), rounded down to a tick. Marked on the chart and added to Odds.">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-act="dl" class="ghost" disabled>Download report</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div>
      <div data-rerr class="err"></div>
      <div data-rout style="margin-top:8px"></div>
    `)}
    ${pane('opt', 'data-opt', `
      <p class="muted small" style="margin-top:8px">Plays the setup above entered on each instance (i0-i3), on the same raids, and ranks them: with breakpoints by the
        share finished at the fastest breakpoint (then the next), otherwise by the median room time.</p>
      <div class="row">
        <label>Raids per instance<input data-o="raids" type="number" min="100" step="500" style="width:90px"></label>
        <label>Seed (optional)<input data-o="seed" placeholder="random" style="width:100px"></label>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-o="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-oact="run">Find the best entry</button><button data-oact="stop" class="ghost" disabled>Stop</button>
      </div>
      <div data-ostatus class="muted" style="margin-top:8px"></div>
      <div data-oerr class="err"></div>
      <div data-oout style="margin-top:8px"></div>
    `)}
    ${pane('solve', 'data-solve', `
      <p class="muted small" style="margin-top:8px">Searches for the best setup from the one above: each player's prefire, start spec, surge, Lightbearer cycles and
        specs in each phase (Maul, BGS, Claws, ZCB, backup, horn) and the entry instance, within the Surge potions / Lightbearers limits and the gear
        each player has. Each round it tries every single change to one player (with Swaps: also moving a surge / Lightbearer to another player and
        swapping two players' specs in a phase; with Paired specs: two players' specs in a phase changed together) - on a few raids, then the best on
        more - and keeps the best if it beats the current setup, until nothing does (Restarts: again from two other starting setups). The top setups are then played at every entry instance and ranked: with breakpoints by the share finished at the fastest one (then the
        next), otherwise by the median. Mazes and supplies stay as set.</p>
      <div class="row">
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-v="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label title="Quick: fewer raids per try and rounds; Thorough: more (slower, steadier)">Effort<select data-v="effort"><option value="quick">Quick</option><option value="normal">Normal</option><option value="thorough">Thorough</option></select></label>
        <button data-vact="run">Solve</button><button data-vact="stop" class="ghost" disabled>Stop</button>
      </div>
      <div class="row" style="margin-top:6px">
        ${[['prefire', 'Prefires'], ['start', 'Start spec'], ['surge', 'Surges'], ['lb', 'Lightbearer'], ['specs', 'Specs'], ['entry', 'Entry instance']].map(([k, l]) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-va="${k}">${l}</label>`).join('')}
      </div>
      <div class="row" style="margin-top:6px"><span class="muted small">Search:</span>
        ${[['swaps', 'Swaps', 'Also move a surge / Lightbearer from one player to another, and swap two players\' specs in a phase, in one step (finds swaps a one-change-at-a-time search can\'t when the surge limit is used up)'],
          ['pairs', 'Paired specs', 'Also change two players\' specs in the same phase together (slower)'],
          ['restarts', 'Restarts', 'Search again from two other starting setups - the default for the scale and the setup above with the players\' roles moved one along - and keep the best of everything (about 3x the time)']].map(([k, l, tt]) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="${tt}"><input type="checkbox" data-vs="${k}">${l}</label>`).join('')}
      </div>
      <div data-vstatus class="muted" style="margin-top:8px"></div>
      <div data-verr class="err"></div>
      <div data-vout style="margin-top:8px"></div>
    `)}`;
  wireSubtabs(host, 'verzikSim.soteTabs.v1');
  host.querySelector('[data-settabs]').addEventListener('click', (e) => {   // a set tab: switch to that set
    const b = e.target.closest('button[data-set]'); if (!b) return;
    const r = rootState(); r.cur = b.dataset.set; r.sets[r.cur] ||= structuredClone({ gearSet: tstate().gearSet, players: [] }); setMsg = ''; persist(); refreshAll();
  });                         // Report / Optimizer / Solver tabs; settings can be minimized
  const root = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]'), opt = host.querySelector('[data-opt]'), sol = host.querySelector('[data-solve]');
  const $r = (k) => rep.querySelector(`[data-r="${k}"]`);
  const team = () => Number(getTeam()) || 4;
  // per scale: {cur: 'A', sets: {A, B?, C?}, report, opt, solve} - a set is everything above the Report (players, gear
  // set, room settings); the Report compares the sets ticked
  const rootState = () => {
    const t = team();
    let r = state[t];
    if (!r || !r.sets) {                                              // first preview: one setup -> set A
      const old = r || { gearSet: 'A', players: [] }, { report, opt, solve } = old;
      delete old.report; delete old.opt; delete old.solve;
      r = state[t] = { cur: 'A', sets: { A: old }, report, opt, solve };
    }
    if (!r.sets[r.cur]) r.cur = 'A';
    return r;
  };
  const fixSet = (st) => {
    const t = team();
    st.gearSet ||= 'A'; st.players ||= [];
    if (st.entry == null) st.entry = Number(state[t] && state[t].report && state[t].report.entry) || 0;   // was one Report setting for every set
    delete st.skip; delete st.sharkSkipper;                          // first preview (one Maze setting for the room)
    while (st.players.length < t) st.players.push(blank());
    for (const p of st.players) { if (p.lbRegens != null) { p.lbCycles ??= p.lbRegens; delete p.lbRegens; } delete p.redeem; }   // first preview
    st.players.length = t;
    return st;
  };
  const tstate = () => { const r = rootState(); return fixSet(r.sets[r.cur] ||= { gearSet: 'A', players: [] }); };
  const setOf = (k) => { const r = rootState(); return r.sets[k] ? fixSet(r.sets[k]) : null; };
  const SETS = ['A', 'B', 'C'];
  const SAVED = 'verzikSim.soteSaved.v1';                            // {team: [{id, name, saved, set}]}
  const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SAVED)) || {}; } catch { return {}; } };
  let saved = loadSaved(), savedPick = '', setMsg = '';
  const when = (ms) => new Date(ms).toLocaleDateString();
  const persist = () => save(state);

  /** Sets A / B / C (switch, copy to another), and sets saved in this browser or to a file. */
  function setBar() {
    const r = rootState(), list = saved[team()] || [];
    return `<div class="row wrap" style="gap:10px;align-items:end;margin:4px 0 10px">
      <div><div class="muted small">Copy set ${r.cur} to</div>${SETS.filter((k) => k !== r.cur).map((k) => `<button class="ghost sm" data-copyset="${k}" title="Replace set ${k} with a copy of set ${r.cur}">Set ${k}</button>`).join(' ')}</div>
      <button class="ghost sm" data-clearset title="Start set ${r.cur} over from a blank setup (its Gear set stays)">Clear set ${r.cur}</button>
      <label>Saved sets<select data-saved="pick"><option value="">(choose a set)</option>${list.map((x) => `<option value="${x.id}" ${x.id === savedPick ? 'selected' : ''}>${esc(x.name)} · ${when(x.saved)}</option>`).join('')}</select></label>
      <button class="ghost sm" data-setact="load" ${savedPick ? '' : 'disabled'} title="Replace set ${r.cur} with this one">Load into set ${r.cur}</button>
      <button class="ghost sm" data-setact="del" ${savedPick ? '' : 'disabled'}>Delete</button>
      <label>Name<input data-saved="name" placeholder="e.g. 5s horn + ZCBs" style="width:150px"></label>
      <button class="sm" data-setact="save" title="Save set ${r.cur} under this name (in this browser)">Save set</button>
      <button class="ghost sm" data-setact="file">Save to file</button>
      <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-saved="file" hidden></label>
      <span class="muted small">${esc(setMsg)}</span>
    </div>`;
  }

  /** Sets A / B / C as tabs on the settings card; the card takes the current set's colour. */
  function setTabs(cur, has) {
    const tb = host.querySelector('[data-settabs]'), card = host.querySelector('[data-setcard]');
    tb.innerHTML = SETS.map((k) => `<button data-set="${k}" class="${k === cur ? 'on' : ''}" title="${has(k) ? `Set ${k}` : 'Empty - opens a new set'}">Set ${k}${has(k) ? '' : ' <span class="muted">(empty)</span>'}</button>`).join('');
    card.dataset.setcol = cur;
  }
  function render() {
    setTabs(rootState().cur, (k) => !!rootState().sets[k]);
    const st = tstate(), g = loadGear(), set = gearSet(g, team(), st.gearSet);
    const gp = set ? playersOf(set, team()) : null;
    const pname = (k) => (gp && gp[k] && gp[k].name) || `Player ${k + 1}`;
    const hasOrb = (k) => !!(gp && gp[k] && gp[k].locator);         // a locator orb (Gear tab) is needed to redemption skip
    const mazesOf = (p, k) => (Array.isArray(p.mazes) ? p.mazes : defaultMazes(Number(p.pnecks || 0), hasOrb(k), team()));
    // notices
    const notes = [], tips = [];
    const surgeLimit = Number.isInteger(st.surgeLimit) ? st.surgeLimit : team(), lbRings = Number.isInteger(st.lbRings) ? st.lbRings : team();
    const surgers = st.players.filter((p) => p.surge).length, lbers = st.players.filter((p) => Number(p.lbCycles || 0) > 0).length;
    if (surgers > surgeLimit) notes.push(`${surgers} players drink a surge, but only ${surgeLimit} surge potion${surgeLimit === 1 ? '' : 's'} can be used here.`);
    if (lbers > lbRings) notes.push(`${lbers} players wear Lightbearer, but there ${lbRings === 1 ? 'is' : 'are'} only ${lbRings} in the raid.`);
    const all = st.players.map((p, k) => ({ k, n: Number(p.pnecks || 0), m: mazesOf(p, k) }));
    for (const { k, n, m } of all) {
      const pn = m.filter((x) => x === 'pneck').length;
      if (pn > n) notes.push(`${pname(k)} stalls ${pn === 2 ? 'both mazes' : 'a maze'} with a phoenix necklace but has ${n}.`);
      if (m.includes('redemption') && !hasOrb(k)) notes.push(`${pname(k)} can't redemption skip without a locator orb (Gear tab).`);
      if (m.includes('redemption') && team() >= 5) notes.push(`${pname(k)}: redemption skips can't be done in 5s.`);
      if (n === 1 && m.includes('shark') && !(m[0] === 'shark' && m[1] === 'pneck')) tips.push(`${pname(k)} has 1 phoenix necklace: shark skip the first maze, then the necklace on the second.`);
      if (n === 1 && m.includes('redemption') && !(m[0] === 'pneck' && m[1] === 'redemption')) tips.push(`${pname(k)} has 1 phoenix necklace: the necklace on the first maze, then a redemption skip on the second (they can veng the first phase more freely).`);
    }
    const sharkers = all.filter(({ m }) => m.includes('shark')).map(({ k }) => pname(k));
    if (sharkers.length > 1) notes.push(`Only one player can shark skip (${sharkers.join(', ')}).`);
    const runs = [0, 1].filter((i) => all.some(({ m }) => m[i] === 'run'));
    const hasHorn = (k) => !!(gp && gp[k] && gp[k].horn);
    const specsOf = (p, k) => (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[k] || [{}, {}, {}]));
    const specCell = (p, k, ph) => {
      const sp = specsOf(p, k)[ph] || {};
      return `<select data-sp="${k}|${ph}|spec">${SPECS.map(([v, lab]) => `<option value="${v}" ${v === (sp.spec || 'none') ? 'selected' : ''}>${lab}</option>`).join('')}</select>
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="Backup: scythe first; once the phase's mauls have landed, maul if her Defence isn't at the floor - otherwise their spec"><input type="checkbox" data-sp="${k}|${ph}|backup" ${sp.backup ? 'checked' : ''}>Backup</label>
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="${hasHorn(k) ? 'Soulflame horn: they and the first other player mauling this phase can\'t miss their next hit. P1: on t8; P2-P3: after their first scythe off the maze' : 'No Soulflame horn (Gear tab)'}"><input type="checkbox" data-sp="${k}|${ph}|horn" ${sp.horn && hasHorn(k) ? 'checked' : ''} ${hasHorn(k) ? '' : 'disabled'}>Horn</label>${team() === 2 && ph === 0 ? `
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="Duos: if both P1 mauls miss, maul again; if that misses too, the other player mauls P2 and this one camps Lightbearer to maul P3"><input type="checkbox" data-sp="${k}|${ph}|duoBackup" ${sp.duoBackup ? 'checked' : ''}>Backup if both miss</label>` : ''}`;
    };
    // spec planner: the projection on typical phase times for the scale, or the last report's medians
    const times = st.lastTimes || TYPICAL_TIMES[team()] || TYPICAL_TIMES[5];
    const ft = (t) => { const x = t * 0.6; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
    const KIND = { maul: 'Maul', bgs: 'BGS', claws: 'Claws', zcb: 'ZCB', horn: 'Horn' };
    const planRow = (p, k) => {
      const pr = projectPlayer({ startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge, lbCycles: Number(p.lbCycles || 0),
        specs: specsOf(p, k).map((x) => ({ ...x, horn: !!x.horn && hasHorn(k) })) }, times);
      const cells = [0, 1, 2].map((ph) => pr.items.filter((it) => it.ph === ph).map((it) => {
        const name = `${KIND[it.kind]}${it.backup ? ' (backup, if needed)' : ''}`;
        if (it.at == null) return `<div class="warn small">${name}: not enough spec</div>`;
        const wait = it.at - it.earliest;
        return `<div class="small">${name} ${ft(it.at)}${wait > 0 ? ` <span class="${wait >= 10 ? 'warn' : 'muted'}">(${(wait * 0.6).toFixed(1)}s late, waiting for spec)</span>` : ''}${it.surge ? ' <span class="muted">+ surge</span>' : ''}</div>`;
      }).join('') || '<span class="muted small">-</span>');
      const short = pr.items.some((it) => it.at == null);
      if (short) notes.push(`${pname(k)} won't have the spec for: ${pr.items.filter((it) => it.at == null).map((it) => `P${it.ph + 1} ${KIND[it.kind]}`).join(', ')} (see the spec planner).`);
      return `<tr><td class="rl">${esc(pname(k))}</td>${cells.map((c) => `<td>${c}</td>`).join('')}<td>${pr.endSpec}%</td><td class="small">${pr.regens.map(ft).join(', ') || '-'}</td></tr>`;
    };
    const planRows = st.players.map(planRow).join('');
    const mazeSel = (p, k, i) => `<select data-maze="${k}|${i}">${MAZE_HOW.map(([v, lab]) => `<option value="${v}" ${v === mazesOf(p, k)[i] ? 'selected' : ''} ${v === 'redemption' && team() >= 5 ? 'disabled' : ''}>${lab}${v === 'redemption' && team() >= 5 ? ' (not in 5s)' : ''}</option>`).join('')}</select>`;
    const name = (k) => (gp && gp[k] && gp[k].name) || `Player ${k + 1}`;
    const owns = (k, w) => !!(gp && gp[k] && (gp[k].weapons || []).includes(w));
    const row = (p, k) => {
      const opts = [['', 'None', null], ...PREFIRES].map(([v, lab, need]) => {
        const ok = !need || owns(k, need);
        return `<option value="${esc(v)}" ${v === (p.prefire || '') ? 'selected' : ''} ${ok ? '' : 'disabled'}>${esc(lab)}${ok ? '' : ` (no ${need})`}</option>`;
      }).join('');
      const need = (PREFIRES.find(([v]) => v === p.prefire) || [])[2];
      let note = '';
      if (need && !owns(k, need)) note = `<div class="warn small">Gear set ${esc(st.gearSet)} has no ${esc(need)} for them</div>`;
      else if (need && gp) {                                         // the best gear they have for it
        const style = STYLE[need], { set: ws } = bestWorn(gp[k], style, need), b = bonuses(ws);
        const items = Object.entries(ws).filter(([sl, v]) => v && sl !== 'weapon' && sl !== 'ammo').map(([, v]) => v);
        const nums = style === 'range' ? `ranged ${sign(b.atk[4])} / str ${sign(b.rstr)}${b.eliteVoid ? ' (elite void)' : ''}` : `magic ${sign(b.atk[3])} / dmg ${sign(b.mdmg)}%`;
        note = `<div class="muted small" title="${esc(items.join(', '))}">best gear: ${esc(nums)}</div>`;
      }
      const sel = (key, list, v) => `<select data-s="${k}|${key}">${list.map(([x, lab]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
      return `<tr><td class="rl">${esc(name(k))}</td>
        <td>${sel('startSpec', [[100, '100'], [95, '95']], p.startSpec === 95 ? 95 : 100)}</td>
        <td style="text-align:center"><input type="checkbox" data-s="${k}|surge" ${p.surge ? 'checked' : ''}></td>
        <td>${sel('lbCycles', [[0, 'None'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], p.lbCycles || 0)}</td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|pnecks" value="${esc(p.pnecks)}"></td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|sharks" value="${esc(p.sharks)}"></td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|rests" value="${esc(p.rests ?? 0)}"></td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|restores" value="${esc(p.restores ?? 3)}"></td>
        <td><select data-s="${k}|prefire" style="max-width:150px">${opts}</select>${note}</td>
        <td>${mazeSel(p, k, 0)}</td><td>${mazeSel(p, k, 1)}</td></tr>`;
    };
    root.innerHTML = `<h3 style="margin-top:0">Sotetseg <span class="muted small">(${team()}-man)</span></h3>
      <p class="muted small">Room settings for each player, saved in this browser - the Report and Optimizer below play them (and Full raid will).
        Gear comes from the Gear tab; a prefire needs that weapon in the Gear set (Shadow Barrage: a Shadow ancient sceptre).</p>
      ${setBar()}
      <div class="row" style="margin-bottom:8px"><label>Gear<select data-gearset>${GEAR_SETS.map((x) => `<option value="${x}" ${x === st.gearSet ? 'selected' : ''}>Gear set ${x}${gearSet(g, team(), x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        <label title="The 4-tick instance this set enters the room on (shifts the maze cycle). Each set in the Report runs on its own.">Entry instance<select data-entry>${[0, 1, 2, 3].map((x) => `<option value="${x}" ${x === Number(st.entry) ? 'selected' : ''}>i${x}</option>`).join('')}</select></label>
        <label title="Surge potions the team can use in this room (the solver won't use more - keep some back for another room)">Surge potions<select data-rset="surgeLimit">${Array.from({ length: team() + 1 }, (_, n) => `<option value="${n}" ${n === surgeLimit ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label title="P3: anyone planned to ZCB claws instead once Sotetseg is below this HP (needs claws and 50% spec)">P3 ZCB → claws below (HP)<input type="number" min="0" step="50" style="width:80px" data-rnum="clawBelow" value="${esc(st.clawBelow ?? CLAW_BELOW)}"></label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Death ball: when everyone can take an even share, they all share it. Off (or someone too low): the target tick-eats it alone - a Guthix rest if they have one, else a shark - after Heal Othering their HP to a teammate"><input type="checkbox" data-rchk="splitBall" ${st.splitBall === false ? '' : 'checked'}>Split DD if healthy</label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Death ball taken alone with no Guthix rest: tick-heal it (a 3-tick stall while the lowest-HP teammate Heal Others them) before using a shark - the shark may be worth more for a maze"><input type="checkbox" data-rchk="stallTick" ${st.stallTick ? 'checked' : ''}>Stall tick-eat</label>
        <label title="Lightbearer rings in the raid: no more players than this can wear one">Lightbearers<select data-rset="lbRings">${Array.from({ length: team() + 1 }, (_, n) => `<option value="${n}" ${n === lbRings ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
</div>
      ${notes.map((x) => `<div class="warn small" style="margin-bottom:4px">${esc(x)}</div>`).join('')}
      ${tips.map((x) => `<div class="muted small" style="margin-bottom:4px">Recommended: ${esc(x)}</div>`).join('')}
      ${runs.length ? `<div class="muted small" style="margin-bottom:4px">Run: every player runs the ${runs.map((i) => (i ? 'second' : 'first')).join(' and ')} maze instead of skipping it - a real maze each time; usually 4-12 ticks slower than a skip.</div>` : ''}
      <style>.sote-cfg th{white-space:normal !important;max-width:96px;vertical-align:bottom}</style>
      <div class="scroll"><table class="bt sote-cfg">
        <tr><th></th><th title="Spec % at the start of the room. 95: their first regen comes the tick after their first special attack, then as normal">Start spec (%)</th><th title="Drink a surge with their first special attack">Surge</th><th title="How many spec regens they wear Lightbearer for (a regen every 25 ticks on it), then swap to Ultor">Lightbearer cycles</th><th title="Phoenix necklaces they bring">Phoenix necklaces</th><th title="Sharks they bring">Sharks</th><th title="Guthix rest sips they bring (a 4 dose = 4 sips): heal 5 a sip, on the potion delay (can go with a shark on the same tick)">Guthix rest sips</th><th title="Prayer restore sips they bring (default 3): a redemption skip takes one a maze; after the second maze a redemption skipper uses spares on locator orb Redemption procs to Heal Other">Restore sips</th><th title="Their first attack, before the room starts">Prefire</th><th title="How they cross the first maze. Pneck: stall with a phoenix necklace. Redemption: orb down to 1 HP and stall with Redemption (locator orb; 1-4s). Shark: skip away from the others, eating through it (one player). Run: everyone runs it">First maze</th><th title="How they cross the second maze">Second maze</th></tr>
        ${st.players.map(row).join('')}
      </table></div>
      <details class="video" data-specs ${st.specsOpen === false ? '' : 'open'} style="margin-top:14px"><summary>Specs</summary>
        <p class="muted small" style="margin-top:8px">What each player specs in each phase. Planned specs go off as early as possible (P1 mauls on their first hit after the prefire; a ZCB or claws on their next attack after the phase's mauls land - nobody can see PID); a spec they can't afford yet waits for a regen. Horn needs a Soulflame horn in the Gear tab.</p>
        <div class="scroll"><table class="bt"><tr><th></th><th>P1</th><th>P2</th><th>P3</th></tr>
          ${st.players.map((p, k) => `<tr><td class="rl">${esc(pname(k))}</td>${[0, 1, 2].map((ph) => `<td style="white-space:nowrap">${specCell(p, k, ph)}</td>`).join('')}</tr>`).join('')}
        </table></div>
        <h4 style="margin:12px 0 4px">Spec planner</h4>
        <p class="muted small" style="margin:0 0 6px">When each planned spec can go off, from their start spec, Lightbearer cycles and surge, on ${st.lastTimes ? 'the phase times of your last report (medians)' : `typical ${team()}-man phase times`} (P1 ${ft(times.p1)}, mazes ${(times.maze1 * 0.6).toFixed(1)}s / ${(times.maze2 * 0.6).toFixed(1)}s, P2 ${(times.p2 * 0.6).toFixed(1)}s, P3 ${(times.p3 * 0.6).toFixed(1)}s). Times are room time.</p>
        <div class="scroll"><table class="bt"><tr><th></th><th>P1</th><th>P2</th><th>P3</th><th>End spec</th><th>Regens</th></tr>${planRows}</table></div>
      </details>`;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const r = rootState();
    if (b.dataset.set) { r.cur = b.dataset.set; r.sets[r.cur] ||= structuredClone({ gearSet: tstate().gearSet, players: [] }); setMsg = ''; persist(); refreshAll(); return; }
    if (b.dataset.clearset != null) {
      if (!confirm(`Clear set ${r.cur}? Its players, specs, mazes, supplies and room settings go back to a blank setup (its Gear set stays).`)) return;
      r.sets[r.cur] = { gearSet: tstate().gearSet, players: [] }; setMsg = `Set ${r.cur} cleared.`; persist(); refreshAll(); return;
    }
    if (b.dataset.copyset) { r.sets[b.dataset.copyset] = structuredClone(tstate()); delete r.sets[b.dataset.copyset].lastTimes; const rp = repState(); if (!rp.sets.includes(b.dataset.copyset)) rp.sets = SETS.filter((x) => x === b.dataset.copyset || rp.sets.includes(x));
      setMsg = `Copied set ${r.cur} to set ${b.dataset.copyset}.`; persist(); refreshAll(); return; }
    const act = b.dataset.setact; if (!act) return;
    const list = (saved[team()] ||= []);
    const store = () => { try { localStorage.setItem(SAVED, JSON.stringify(saved)); return true; } catch { return false; } };
    if (act === 'save') {
      const name = (root.querySelector('[data-saved="name"]').value || '').trim() || list.find((x) => x.id === savedPick)?.name || '';
      if (!name) { setMsg = 'Type a name for the set first.'; render(); return; }
      const old = list.find((x) => x.name === name), entry = { id: old ? old.id : `s${Date.now()}`, name, saved: Date.now(), set: structuredClone(tstate()) };
      delete entry.set.lastTimes;
      if (old) Object.assign(old, entry); else list.push(entry);
      savedPick = entry.id; setMsg = store() ? `Saved "${name}" (${old ? 'updated' : 'new'}).` : 'Could not save (browser storage is off).';
    } else if (act === 'load' || act === 'del') {
      const x = list.find((y) => y.id === savedPick); if (!x) return;
      if (act === 'load') { r.sets[r.cur] = structuredClone(x.set); persist(); setMsg = `Loaded "${x.name}" into set ${r.cur}.`; refreshAll(); return; }
      saved[team()] = list.filter((y) => y !== x); savedPick = ''; store(); setMsg = `Deleted "${x.name}".`;
    } else if (act === 'file') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', kind: 'soteSet', team: team(), set: tstate() }, null, 1)], { type: 'application/json' }));
      a.download = `sotetseg_${team()}man_set.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    render();
  });
  root.addEventListener('change', async (e) => {
    if (e.target.dataset.saved === 'pick') { savedPick = e.target.value; setMsg = ''; render(); return; }
    if (e.target.dataset.saved === 'file') {
      try {
        const j = JSON.parse(await e.target.files[0].text());
        if (j.kind !== 'soteSet' || !j.set) throw new Error('not a saved Sotetseg set');
        if (Number(j.team) !== team()) throw new Error(`it's a ${j.team}-man set - pick that scale first`);
        const r = rootState(); r.sets[r.cur] = j.set; persist(); setMsg = `Opened ${e.target.files[0].name} into set ${r.cur}.`; refreshAll();
      } catch (x) { setMsg = `Couldn't open that file: ${x.message}`; render(); }
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target, st = tstate();
    if (t.dataset.gearset != null) { st.gearSet = t.value; persist(); render(); return; }
    if (t.dataset.entry != null) { st.entry = Number(t.value) || 0; persist(); return; }
    if (t.dataset.rset) { st[t.dataset.rset] = Number(t.value); persist(); render(); return; }
    if (t.dataset.rchk) { st[t.dataset.rchk] = t.checked; persist(); return; }
    if (t.dataset.rnum) { st[t.dataset.rnum] = t.value === '' ? null : Number(t.value); persist(); return; }
    if (t.dataset.sp) {
      const [k, ph, f] = t.dataset.sp.split('|'), p = st.players[Number(k)];
      p.specs = (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[Number(k)] || [{}, {}, {}])).map((x) => ({ spec: 'none', backup: false, horn: false, ...x }));
      p.specs[Number(ph)][f] = f === 'spec' ? t.value : t.checked;
      persist(); render(); return;
    }
    if (t.dataset.maze != null) {
      const [k, i] = t.dataset.maze.split('|').map(Number), p = st.players[k];
      const g = loadGear(), set = gearSet(g, team(), st.gearSet), gp = set ? playersOf(set, team()) : null;
      p.mazes = [...(Array.isArray(p.mazes) ? p.mazes : defaultMazes(Number(p.pnecks || 0), !!(gp && gp[k] && gp[k].locator), team()))];
      p.mazes[i] = t.value; persist(); render(); return;
    }
    if (!t.dataset.s) return;
    const [k, key] = t.dataset.s.split('|');
    st.players[Number(k)][key] = key === 'prefire' ? t.value : key === 'surge' ? t.checked : (t.value === '' ? '' : Number(t.value));
    persist(); render();
  });

  // ---- report: the players as set up here (gear from the Gear set), raids in batches so the page stays responsive
  let job = null, lastPage = null;
  const repState = () => { const st = rootState(); st.report ||= { raids: 2000, entry: 0, seed: '', bps: '' }; st.report.sets ||= ['A']; st.report.labels ||= {}; return st.report; };
  const showRep = () => {
    const r = repState(), rs = rootState(); $r('raids').value = r.raids; $r('seed').value = r.seed; $r('bps').value = r.bps;
    rep.querySelector('[data-rsets]').innerHTML = `<div class="muted small">Sets to run (compared on the same raids)</div><div class="row" style="gap:8px">${SETS.map((k) => `<label class="pick" style="flex-direction:row;gap:4px;align-items:center"><input type="checkbox" data-rset-run="${k}" ${rs.sets[k] ? '' : 'disabled'} ${rs.sets[k] && r.sets.includes(k) ? 'checked' : ''}>${k}</label><input data-rlabel="${k}" placeholder="Set ${k} label" value="${esc(r.labels[k] || '')}" style="width:110px" ${rs.sets[k] ? '' : 'disabled'}>`).join('')}</div>`;
  };
  rep.addEventListener('change', (e) => {
    const r = repState();
    if (e.target.dataset.rsetRun) { const k = e.target.dataset.rsetRun; r.sets = SETS.filter((x) => (x === k ? e.target.checked : r.sets.includes(x))); persist(); }
    if (e.target.dataset.rlabel) { r.labels[e.target.dataset.rlabel] = e.target.value; persist(); }
  });
  rep.addEventListener('input', (e) => { const k = e.target.dataset.r; if (!k) return; const r = repState(); r[k] = k === 'raids' || k === 'entry' ? Number(e.target.value) : e.target.value; persist(); });
  rep.addEventListener('change', (e) => { const k = e.target.dataset.r; if (!k) return; const r = repState(); r[k] = k === 'raids' || k === 'entry' ? Number(e.target.value) : e.target.value; persist(); });
  const btn = (a) => rep.querySelector(`[data-act="${a}"]`);
  const playersNow = (st = tstate()) => {
    const g = loadGear(), set = gearSet(g, team(), st.gearSet), gp = set ? playersOf(set, team()) : null;
    return st.players.map((p, k) => {
      const gear = gp ? gp[k] : blankPlayer(k), orb = !!gear.locator;
      return { name: gear.name || `Player ${k + 1}`, gear, own: true, prefire: p.prefire || '', startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge,
        lbCycles: Number(p.lbCycles || 0), pnecks: Number(p.pnecks || 0), sharks: Number(p.sharks || 0), rests: Number(p.rests || 0), restores: Number(p.restores ?? 3),
        mazes: Array.isArray(p.mazes) ? p.mazes : defaultMazes(Number(p.pnecks || 0), orb, team()),
        specs: (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[k] || [])).map((x) => ({ ...x, horn: !!x.horn && !!gear.horn })) };
    });
  };
  rep.addEventListener('click', (e) => {
    const a = e.target.dataset.act; if (!a) return;
    if (a === 'stop') { if (job) job.stop = true; return; }
    if (a === 'dl' && lastPage) {
      const url = URL.createObjectURL(new Blob([lastPage], { type: 'text/html' })), el = document.createElement('a');
      el.href = url; el.download = `sotetseg-${team()}man-report.html`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (a !== 'run' || job) return;
    const r = repState(), err = rep.querySelector('[data-rerr]'), status = rep.querySelector('[data-rstatus]'), out = rep.querySelector('[data-rout]');
    err.textContent = '';
    let bps = [];
    try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const n = Math.max(100, Number(r.raids) || 2000), t = team();
    const keys = r.sets.filter((k) => setOf(k));
    if (!keys.length) { err.textContent = 'Tick at least one set to run.'; return; }
    const runs = keys.map((k) => { const st = setOf(k); return { k, st, players: playersNow(st), res: newSoteResult(), opts: { entry: Number(st.entry) || 0, clawBelow: st.clawBelow ?? CLAW_BELOW, splitBall: st.splitBall !== false, stallTick: !!st.stallTick } }; });
    const labels = keys.map((k) => (r.labels[k] || '').trim() || `Set ${k}`);
    const seed = String(r.seed || '').trim() || `r${Date.now()}`;
    job = { stop: false }; const me = job;
    btn('run').disabled = true; btn('stop').disabled = false;
    let i = 0;
    const step = () => {
      if (me.stop || i >= n) {
        job = null; btn('run').disabled = false; btn('stop').disabled = true;
        if (!runs[0].res.runs) { status.textContent = 'Stopped.'; return; }
        const opts = { breakpoints: bps, entries: runs.map((x) => Number(x.st.entry) || 0), labels }, all = runs.map((x) => x.res);
        out.innerHTML = soteReportHtml(all, t, opts); lastPage = soteReportPage(all, t, opts); btn('dl').disabled = false;
        const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
        for (const x of runs) if (x.res.total.length) x.st.lastTimes = Object.fromEntries(Object.entries(x.res.split).map(([k2, v]) => [k2, med(v)]));
        persist(); render();
        status.textContent = `${me.stop ? 'Stopped at' : 'Done:'} ${runs[0].res.runs.toLocaleString()} raids${runs.length > 1 ? ' per set' : ''}.`;
        return;
      }
      const to = Math.min(n, i + Math.max(10, Math.floor(50 / runs.length)));
      try { for (const x of runs) addSoteRaids(x.res, x.players, t, i, to, { seed, ...x.opts }); } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      i = to; status.textContent = `Running... ${i.toLocaleString()} / ${n.toLocaleString()} raids${runs.length > 1 ? ` (${runs.length} sets)` : ''}`;
      setTimeout(step, 0);
    };
    step();
  });

  // ---- optimizer: the entry instance (i0-i3) for the setup above, on the same raids at each
  let ojob = null;
  const $o = (k) => opt.querySelector(`[data-o="${k}"]`), obtn = (a) => opt.querySelector(`[data-oact="${a}"]`);
  const optState = () => { const st = rootState(); st.opt ||= { raids: 2000, seed: '', bps: '' }; return st.opt; };
  const showOpt = () => { const o = optState(); $o('raids').value = o.raids; $o('seed').value = o.seed; $o('bps').value = o.bps; };
  for (const ev of ['input', 'change']) opt.addEventListener(ev, (e) => { const k = e.target.dataset.o; if (!k) return; optState()[k] = k === 'raids' ? Number(e.target.value) : e.target.value; persist(); });
  const tm = (t) => { const x = t * 0.6; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
  opt.addEventListener('click', (e) => {
    const a = e.target.dataset.oact;
    if (e.target.dataset.useEntry != null) { tstate().entry = Number(e.target.dataset.useEntry); persist(); render(); opt.querySelector('[data-ostatus]').textContent = `Set ${rootState().cur} now enters on i${tstate().entry}.`; return; }
    if (!a) return;
    if (a === 'stop') { if (ojob) ojob.stop = true; return; }
    if (a !== 'run' || ojob) return;
    const o = optState(), err = opt.querySelector('[data-oerr]'), status = opt.querySelector('[data-ostatus]'), out = opt.querySelector('[data-oout]');
    err.textContent = '';
    let bps = [];
    try { bps = String(o.bps || '').trim() ? parseBreakpoints(o.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const n = Math.max(100, Number(o.raids) || 2000), t = team(), players = playersNow();
    const seed = String(o.seed || '').trim() || `o${Date.now()}`, res = [0, 1, 2, 3].map(() => newSoteResult());
    ojob = { stop: false }; const me = ojob;
    obtn('run').disabled = true; obtn('stop').disabled = false;
    let entry = 0, i = 0;
    const finish = () => {
      ojob = null; obtn('run').disabled = false; obtn('stop').disabled = true;
      const rows = res.map((r, k) => {
        const v = r.total.slice().sort((x, y) => x - y), med = v[Math.floor(v.length / 2)], q10 = v[Math.max(0, Math.floor(v.length * 0.1) - 1)];
        const sp = (key) => { const w = r.split[key].slice().sort((x, y) => x - y); return w[Math.floor(w.length / 2)]; };
        const at = bps.map((b) => (v.length ? v.filter((x) => x * 0.6 <= b + 1e-9).length / v.length : 0));
        return { k, n: v.length, med, q10, fast: v[0], at, maze: v.length ? sp('maze1') + sp('maze2') : null, p1: v.length ? sp('p1') : null };
      }).filter((r) => r.n);
      if (!rows.length) { status.textContent = 'Stopped.'; return; }
      const asc = [...bps].sort((x, y) => x - y);                     // fastest breakpoint first
      const key = (r) => [...asc.map((b) => -r.at[bps.indexOf(b)]), r.med, r.q10];
      rows.sort((x, y) => { const a1 = key(x), b1 = key(y); for (let j = 0; j < a1.length; j++) if (a1[j] !== b1[j]) return a1[j] - b1[j]; return 0; });
      const best = rows[0].k, fs = (b) => { const r = Math.round(b % 60 * 10) / 10; return `${Math.floor(b / 60)}:${r < 10 ? '0' : ''}${r}`; };
      out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${t}-man Sotetseg: entry instance</h3>
        <div class="sub">${rows[0].n.toLocaleString()} raids per instance, the same raids at each · best: <b>i${best}</b>${bps.length ? ` (most finished by ${fs(asc[0])})` : ' (lowest median)'} · maze = both mazes, proc to interactable (medians)</div>
        <table class="sortlist"><tr><th>Rank</th><th>Entry</th><th>Median</th><th>Top 10%</th><th>Fastest</th>${bps.map((b) => `<th>${fs(b)} or faster</th>`).join('')}<th>Mazes</th><th>P1</th><th></th></tr>
        ${rows.map((r, j) => `<tr${r.k === best ? ' style="font-weight:700"' : ''}><td>${j + 1}</td><td>i${r.k}</td><td>${tm(r.med)}</td><td>${tm(r.q10)}</td><td>${tm(r.fast)}</td>${r.at.map((x) => `<td>${(x * 100).toFixed(1)}%</td>`).join('')}<td>${(r.maze * 0.6).toFixed(1)}s</td><td>${(r.p1 * 0.6).toFixed(1)}s</td><td><button class="ghost sm" data-use-entry="${r.k}">Use for this set</button></td></tr>`).join('')}
        </table></div>`;
      status.textContent = me.stop ? 'Stopped early - partial results.' : 'Done.';
    };
    const step = () => {
      if (me.stop || entry > 3) { finish(); return; }
      const to = Math.min(n, i + 50);
      try { addSoteRaids(res[entry], players, t, i, to, { seed, entry, clawBelow: tstate().clawBelow ?? CLAW_BELOW, splitBall: tstate().splitBall !== false, stallTick: !!tstate().stallTick }); } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      i = to; if (i >= n) { entry++; i = 0; }
      status.textContent = `Running... i${Math.min(entry, 3)}: ${(entry > 3 ? n : i).toLocaleString()} / ${n.toLocaleString()} raids`;
      setTimeout(step, 0);
    };
    step();
  });

  // ---- solver
  let vjob = null, vresults = null;
  const ALLOW = ['prefire', 'start', 'surge', 'lb', 'specs', 'entry'];
  const SEARCH_DEFAULT = { swaps: true, pairs: false, restarts: false };
  const solState = () => { const st = rootState(); st.solve ||= { bps: '', effort: 'normal', allow: Object.fromEntries(ALLOW.map((k) => [k, true])) }; return st.solve; };
  const showSol = () => {
    const v = solState();
    sol.querySelector('[data-v="bps"]').value = v.bps; sol.querySelector('[data-v="effort"]').value = v.effort;
    for (const k of ALLOW) sol.querySelector(`[data-va="${k}"]`).checked = v.allow[k] !== false;
    v.search ||= { ...SEARCH_DEFAULT };
    for (const k of Object.keys(SEARCH_DEFAULT)) sol.querySelector(`[data-vs="${k}"]`).checked = !!v.search[k];
  };
  for (const ev of ['input', 'change']) sol.addEventListener(ev, (e) => {
    const v = solState();
    if (e.target.dataset.v) v[e.target.dataset.v] = e.target.value;
    else if (e.target.dataset.va) v.allow[e.target.dataset.va] = e.target.checked;
    else if (e.target.dataset.vs) { v.search ||= { ...SEARCH_DEFAULT }; v.search[e.target.dataset.vs] = e.target.checked; }
    else return;
    persist();
  });
  const EFFORT = { quick: { rounds: 4, stages: [[30, 0.15], [120, 3], [500, 1]], finalRaids: 1000 },
    normal: { rounds: 8, stages: [[60, 0.2], [240, 4], [1000, 1]], finalRaids: 2000 },
    thorough: { rounds: 14, stages: [[100, 0.25], [400, 5], [2000, 1]], finalRaids: 5000 } };
  const vbtn = (a) => sol.querySelector(`[data-vact="${a}"]`);
  const fsec = (t) => { const x = t * 0.6; return x >= 60 ? `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}` : `${x.toFixed(1)}s`; };
  const KINDS = { none: 'nothing', maul: 'Maul', claws: 'Claws', zcb: 'ZCB', bgs: 'BGS' };
  const specTxt = (x) => `${x.horn ? 'Horn + ' : ''}${x.backup ? `backup (${x.spec === 'none' ? 'maul if needed' : `maul if needed, else ${KINDS[x.spec]}`})` : KINDS[x.spec] || x.spec}`;
  const showResults = (bps, t) => {
    const out = sol.querySelector('[data-vout]');
    if (!vresults || !vresults.length) { out.innerHTML = ''; return; }
    const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const asc = [...bps].sort((a, b) => a - b);
    const fs = (b) => { const r = Math.round(b % 60 * 10) / 10; return `${Math.floor(b / 60)}:${r < 10 ? '0' : ''}${r}`; };
    const ft = (x) => (x == null || Number.isNaN(x) ? '-' : x >= 9999 ? 'wiped' : fsec(x));       // 9999: a raid that wiped
    const wiped = (r) => r.totals.filter((x) => x >= 9999).length / r.totals.length;
    const allWiped = vresults.every((r) => wiped(r) === 1);
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${t}-man Sotetseg: solver - top ${vresults.length}</h3>
      <div class="sub">Each played on the same ${vresults[0].totals.length.toLocaleString()} raids at its best entry instance. Times: median.</div>
      ${allWiped ? '<p class="err">Every raid wiped with these setups, so there is nothing to rank. Check the mazes and supplies above (phoenix necklaces, sharks) and the gear set - a Report run shows how the room goes.</p>' : ''}
      <div class="scroll"><table class="sortlist"><tr><th>#</th><th>Entry</th><th>Median</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fs(b)} or faster</th>`).join('')}<th>P1</th><th>Mazes</th><th>P2</th><th>P3</th>${vresults.some((r) => wiped(r) > 0) ? '<th>Wiped</th>' : ''}<th></th></tr>
      ${vresults.map((r, i) => { const v = r.totals.slice().sort((a, b) => a - b);
        return `<tr${i === 0 ? ' style="font-weight:700"' : ''}><td>${i + 1}</td><td>i${r.entry}</td><td>${ft(v[v.length >> 1])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.1) - 1)])}</td><td>${ft(v[0])}</td>${asc.map((b) => `<td>${(v.filter((x) => x * 0.6 <= b + 1e-9).length / v.length * 100).toFixed(1)}%</td>`).join('')}<td>${ft(med(r.split.p1))}</td><td>${ft(med(r.split.maze1) + med(r.split.maze2))}</td><td>${ft(med(r.split.p2))}</td><td>${ft(med(r.split.p3))}</td>${vresults.some((y) => wiped(y) > 0) ? `<td>${(wiped(r) * 100).toFixed(1)}%</td>` : ''}<td style="white-space:nowrap"><button class="ghost sm" data-vshow="${i}">Procedure</button> ${SETS.map((k) => `<button class="ghost sm" data-vuse="${i}" data-to="${k}" title="Put this setup (and its entry instance) into set ${k}${rootState().sets[k] ? '' : ' - a new set, from set ' + rootState().cur}">Copy to set ${k}</button>`).join(' ')}</td></tr>
        <tr class="sub-row" data-vproc="${i}" hidden><td colspan="${11 + asc.length}" style="text-align:left">
          <div class="small">Entry instance i${r.entry} (median by entry: ${r.byEntry.map((y) => `i${y.entry} ${ft(y.median)}`).join(', ')})</div>
          <table style="margin-top:4px"><tr><th>Player</th><th>Prefire</th><th>Start</th><th>Surge</th><th>Lightbearer</th><th>P1</th><th>P2</th><th>P3</th></tr>
          ${r.cfg.players.map((p, k) => `<tr><td>${esc(pnameOf(k))}</td><td>${esc(p.prefire || 'none')}</td><td>${p.startSpec}%</td><td>${p.surge ? 'yes' : '-'}</td><td>${p.lbCycles ? `${p.lbCycles} cycles` : '-'}</td>${p.specs.map((x) => `<td>${esc(specTxt(x))}</td>`).join('')}</tr>`).join('')}</table></td></tr>`; }).join('')}
      </table></div></div>`;
  };
  const pnameOf = (k) => { const st = tstate(), g = loadGear(), set = gearSet(g, team(), st.gearSet), gp = set ? playersOf(set, team()) : null; return (gp && gp[k] && gp[k].name) || `Player ${k + 1}`; };
  sol.addEventListener('click', async (e) => {
    const t0 = e.target;
    if (t0.dataset.vshow != null) { const row = sol.querySelector(`[data-vproc="${t0.dataset.vshow}"]`); row.hidden = !row.hidden; return; }
    if (t0.dataset.vuse != null) {                                    // copy the setup (and its entry instance) into set A / B / C
      const r = vresults[Number(t0.dataset.vuse)], k = t0.dataset.to || rootState().cur, rs = rootState();
      if (!rs.sets[k]) rs.sets[k] = structuredClone(tstate());          // an empty set starts as a copy of this one (gear, mazes, supplies)
      const st = setOf(k), rp = repState(); if (!rp.sets.includes(k)) rp.sets = SETS.filter((x) => x === k || rp.sets.includes(x));
      r.cfg.players.forEach((p, k) => Object.assign(st.players[k], { prefire: p.prefire, startSpec: p.startSpec, surge: p.surge, lbCycles: p.lbCycles, specs: p.specs.map((x) => ({ ...x })) }));
      st.entry = r.entry; persist(); render(); showRep();
      sol.querySelector('[data-vstatus]').textContent = `Setup #${Number(t0.dataset.vuse) + 1} copied into set ${k} (entry instance i${r.entry}).`;
      return;
    }
    const a = t0.dataset.vact; if (!a) return;
    if (a === 'stop') { if (vjob) { vjob.stopped = true; vjob.pool.stop(); } return; }
    if (a !== 'run' || vjob) return;
    const v = solState(), st = tstate(), status = sol.querySelector('[data-vstatus]'), err = sol.querySelector('[data-verr]');
    err.textContent = '';
    let bps = [];
    try { bps = String(v.bps || '').trim() ? parseBreakpoints(v.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const t = team(), all = playersNow();
    const base = all.map((p) => ({ name: p.name, gear: p.gear, pnecks: p.pnecks, sharks: p.sharks, rests: p.rests, restores: p.restores, mazes: p.mazes }));
    const start = { entry: Number(tstate().entry) || 0, players: all.map((p) => ({ prefire: p.prefire, startSpec: p.startSpec, surge: p.surge, lbCycles: p.lbCycles, specs: p.specs.map((x) => ({ spec: 'none', backup: false, horn: false, ...x })) })) };
    const opts = { clawBelow: st.clawBelow ?? CLAW_BELOW, splitBall: st.splitBall !== false, stallTick: !!st.stallTick };
    const sr = v.search || SEARCH_DEFAULT, sLim = Number.isInteger(st.surgeLimit) ? st.surgeLimit : t, lbLim = Number.isInteger(st.lbRings) ? st.lbRings : t;
    /** A restart setup within the surge / Lightbearer limits and the weapons each player has. */
    const fit = (players) => { let su = 0, lb = 0; return players.map((p, k) => {
      const own = (w) => (all[k].gear.weapons || []).includes(w), okSpec = (x) => x.spec === 'none' || ({ maul: own('Elder maul') || own('Bandos godsword'), bgs: own('Bandos godsword'), claws: own('Dragon claws'), zcb: own('Zaryte crossbow') })[x.spec];
      const pre = { 'Twisted bow': 'Twisted bow', 'ZCB auto': 'Zaryte crossbow', 'ZCB spec': 'Zaryte crossbow', 'Shadow Barrage': 'Shadow ancient sceptre', "Tumeken's shadow": "Tumeken's shadow" }[p.prefire];
      const surge = p.surge && su < sLim; if (surge) su++; const lbc = p.lbCycles > 0 && lb < lbLim ? p.lbCycles : 0; if (lbc) lb++;
      return { ...p, prefire: !pre || own(pre) ? p.prefire : '', surge, lbCycles: lbc, specs: p.specs.map((x) => ({ spec: 'none', backup: false, horn: false, ...x, ...(okSpec(x) ? {} : { spec: 'none' }), horn: !!x.horn && !!all[k].gear.horn })) };
    }); };
    const ds = defaultSetup(t), dsp = defaultSpecs(t);
    const restarts = sr.restarts ? [
      { players: fit(ds.map((x, k) => ({ prefire: x.prefire, startSpec: x.startSpec, surge: x.surge, lbCycles: 0, specs: dsp[k].map((y) => ({ ...y })) }))) },
      { players: fit(start.players.map((_, k) => structuredClone(start.players[(k + 1) % t]))) },
    ] : [];
    const pool = new SotePool(base, t, opts);
    vjob = { stopped: false, pool }; const me = vjob;
    vbtn('run').disabled = true; vbtn('stop').disabled = false;
    const ef = EFFORT[v.effort] || EFFORT.normal, t1 = Date.now();
    try {
      vresults = await solveSote({ team: t, base, start, gear: all.map((p) => p.gear), allow: { ...Object.fromEntries(ALLOW.map((k) => [k, v.allow[k] !== false])) },
        surgeLimit: Number.isInteger(st.surgeLimit) ? st.surgeLimit : t, lbRings: Number.isInteger(st.lbRings) ? st.lbRings : t,
        bps, solveEntry: v.allow.entry !== false, ...ef, top: 10, swaps: !!sr.swaps, pairs: !!sr.pairs, restarts },
      (...args) => pool.run(...args), (txt) => { status.textContent = `${txt} (${Math.round((Date.now() - t1) / 1000)}s)`; }, () => me.stopped);
      showResults(bps, t);
      status.textContent = `Done in ${Math.round((Date.now() - t1) / 1000)}s.`;
    } catch (x) { status.textContent = me.stopped ? 'Stopped.' : ''; if (!me.stopped) err.textContent = `Couldn't solve: ${x.message}`; }
    finally { pool.stop(); vjob = null; vbtn('run').disabled = false; vbtn('stop').disabled = true; }
  });

  function refreshAll() { render(); showRep(); showOpt(); showSol(); }
  return { refresh: () => { state = load(); saved = loadSaved(); refreshAll(); } };
}
