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
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS, putGearSet } from './engine/gearstore.js';
import { bestWorn, bonuses, blankPlayer } from './engine/loadout.js';
import { newSoteResult, addSoteRaids, soteReportHtml, soteReportPage } from './engine/sotereport.js';
import { parseBreakpoints } from './engine/optimize.js';
import { solveSote } from './engine/sotesolve.js';
import { SotePool } from './sote-solver-pool.js';
import { defaultMazes, MAZE_HOW, defaultSpecs, defaultSetup, SPECS, SPEC_COST, CLAW_BELOW } from './engine/sote.js';
import { projectPlayer, TYPICAL_TIMES } from './engine/soteplan.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';
import { setPicker, pickSets, setResultsHtml, wireSetResults } from './setresults.js';
import { better as scoreBetter, scoreOf as soteScore, playersOf as soteBuild } from './engine/sotesolve.js';
import { runSote } from './engine/sote.js';
import { Rng } from './engine/rng.js';
import { raidChoices, raidTitle, pickRaid, timelineHtml } from './raidview.js';

const STORE = 'verzikSim.sote.v1';             // {team: {gearSet, surgeLimit, lbRings, players: [{startSpec, surge, lbCycles, pnecks, sharks, rests, restores, prefire, mazes: [first, second]}]}}  · solve: {surgeLimit, ...}
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
      <p class="muted small" style="margin-top:8px">Plays each ticked set entered on each instance (i0-i3), on the same raids, and ranks them: with breakpoints by the
        share finished at the fastest breakpoint (then the next), otherwise by the median room time. Each set gets its own results (or one combined ranking).</p>
      <div class="row">
        <div data-osets></div>
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
        specs in each phase (Maul, BGS, Claws, ZCB, backup, horn) and the entry instance, within the Solver surge limit, the room's Lightbearers limit and the gear
        each player has. Each round it tries every single change to one player (with Swaps: also moving a surge / Lightbearer to another player and
        swapping two players' specs in a phase; with Paired specs: two players' specs in a phase changed together) - on a few raids, then the best on
        more - and keeps the best if it beats the current setup, until nothing does (Restarts: again from two other starting setups). The top setups are then played at every entry instance and ranked: with breakpoints by the share finished at the fastest one (then the
        next), otherwise by the median. Mazes and supplies stay as set. Each ticked set is solved from its own setup; each gets its own results (or one combined ranking).</p>
      <div class="row">
        <div data-vsets></div>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-v="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label title="Quick: fewer raids per try and rounds; Thorough: more (slower, steadier)">Effort<select data-v="effort"><option value="quick">Quick</option><option value="normal">Normal</option><option value="thorough">Thorough</option></select></label>
        <label title="Surge potions the Solver may use (its own limit, separate from the room setting above). Starts at the room setting until you change it">Solver surge limit<select data-v="surgeLimit"></select></label>
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
    st.players.forEach((p, k) => { if (p.prefire === 'Shadow Barrage' && !(gp && (gp[k].weapons || []).includes('Shadow ancient sceptre'))) notes.push(`Please add a Shadow ancient sceptre to ${pname(k)}'s configs`); });
    const sharkers = all.filter(({ m }) => m.includes('shark')).map(({ k }) => pname(k));
    if (sharkers.length > 1) notes.push(`Only one player can shark skip (${sharkers.join(', ')}).`);
    const runs = [0, 1].filter((i) => all.some(({ m }) => m[i] === 'run'));
    const hasHorn = (k) => !!(gp && gp[k] && gp[k].horn);
    const specsOf = (p, k) => (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[k] || [{}, {}, {}]));
    const barrageOk = st.players.some((q, j) => q.prefire === 'Shadow Barrage' && !!(gp && (gp[j].weapons || []).includes('Shadow ancient sceptre')));
    const specCell = (p, k, ph) => {
      const sp = specsOf(p, k)[ph] || {};
      return `<select data-sp="${k}|${ph}|spec">${SPECS.map(([v, lab]) => `<option value="${v}" ${v === (sp.spec || 'none') ? 'selected' : ''}>${lab}</option>`).join('')}</select>
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="Backup: scythe first; once the phase's mauls have landed, maul if her Defence isn't at the floor - otherwise their spec"><input type="checkbox" data-sp="${k}|${ph}|backup" ${sp.backup ? 'checked' : ''}>Backup</label>${sp.backup ? `
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="Backup tries this phase. 2: if their backup misses and her Defence still isn't at the floor, they back up again (after every other backup's first try)">Tries<select data-sp="${k}|${ph}|backups">${[1, 2].map((n) => `<option value="${n}" ${n === (Number(sp.backups) === 2 ? 2 : 1) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="${hasHorn(k) ? 'Soulflame horn (25% per other player): one or two other players (those mauling this phase first, then others\' scythes) and the caster get a buff on their next melee hit - a maul / BGS can\'t miss, a scythe\'s first hitsplat can\'t miss, claws\' second accuracy roll can\'t miss (a ZCB gets nothing). P1: on t8; P2-P3: after their first scythe off the maze' : 'No Soulflame horn (Gear tab)'}">Horn<select data-sp="${k}|${ph}|horn" ${hasHorn(k) ? '' : 'disabled'}>${[['', 'None'], ['1', '1 player (25%)'], ['2', '2 players (50%)']].map(([v, l]) => `<option value="${v}" ${v === (hasHorn(k) && sp.horn ? (Number(sp.horn) === 2 ? '2' : '1') : '') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${team() === 2 && ph === 0 ? `
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="Duos: if both P1 mauls miss, maul again; if that misses too, the other player mauls P2 and this one camps Lightbearer to maul P3"><input type="checkbox" data-sp="${k}|${ph}|duoBackup" ${sp.duoBackup ? 'checked' : ''}>Backup if both miss</label>` : ''}${ph === 0 && team() >= 3 && barrageOk && (sp.spec === 'maul' || sp.spec === 'bgs') && !sp.backup ? `
        <label class="small" style="margin-top:4px" title="If a Shadow Barrage prefire landed: scythe first and wait on the P1 mauls - none hit: ${sp.spec === 'bgs' ? 'BGS' : 'maul'} (ahead of the backups); one hit: this spec instead. Barrage missed (or none): ${sp.spec === 'bgs' ? 'BGS' : 'maul'} on their first hit.">If a Barrage lands<select data-sp="${k}|${ph}|ifBarrage">${[['', `${sp.spec === 'bgs' ? 'BGS' : 'Maul'} anyway`], ['zcb', 'ZCB if a maul landed'], ['claws', 'Claws if a maul landed'], ['none', 'No spec if a maul landed']].map(([v, l]) => `<option value="${v}" ${v === (sp.ifBarrage || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}`;
    };
    // spec planner: the projection on typical phase times for the scale, or the last report's medians
    const times = st.lastTimes || TYPICAL_TIMES[team()] || TYPICAL_TIMES[5];
    const ft = (t) => { const x = t * 0.6; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
    const KIND = { maul: 'Maul', bgs: 'BGS', claws: 'Claws', zcb: 'ZCB', horn: 'Horn' };
    const planRow = (p, k) => {
      const pr = projectPlayer({ startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge, lbCycles: Number(p.lbCycles || 0),
        specs: specsOf(p, k).map((x) => ({ ...x, horn: hasHorn(k) ? (x.horn ? (Number(x.horn) === 2 ? 2 : true) : false) : false })) }, times);
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
      <div class="row" style="margin-bottom:8px"><label>Gear<select data-gearset>${GEAR_SETS.map((x) => `<option value="${x}" ${x === st.gearSet ? 'selected' : ''}>${esc(gearSetLabel(g, team(), x))}${gearSet(g, team(), x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        <label title="The 4-tick instance this set enters the room on (shifts the maze cycle). Each set in the Report runs on its own.">Entry instance<select data-entry>${[0, 1, 2, 3].map((x) => `<option value="${x}" ${x === Number(st.entry) ? 'selected' : ''}>i${x}</option>`).join('')}</select></label>
        <label title="Surge potions the team can use in this room - the spec planner warns when more players surge. The Solver has its own limit (it starts at this one)">Surge potions<select data-rset="surgeLimit">${Array.from({ length: team() + 1 }, (_, n) => `<option value="${n}" ${n === surgeLimit ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
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
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', kind: 'soteSet', team: team(), set: tstate(), ...(() => { const gs = gearSet(loadGear(), team(), tstate().gearSet); return gs ? { gear: playersOf(gs, team()), gearName: gs.name || '' } : {}; })() }, null, 1)], { type: 'application/json' }));
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
        const r = rootState(); r.sets[r.cur] = j.set; persist(); setMsg = `Opened ${e.target.files[0].name} into set ${r.cur}.`;
        if (Array.isArray(j.gear)) { putGearSet(team(), j.set.gearSet || 'A', j.gear, j.gearName); setMsg += ` Its gear (prayer, armour, weapons) went into Gear set ${j.set.gearSet || 'A'}.`; }
        refreshAll();
      } catch (x) { setMsg = `Couldn't open that file: ${x.message}`; render(); }
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target, st = tstate();
    if (t.dataset.gearset != null) { st.gearSet = t.value; persist(); render(); return; }
    if (t.dataset.entry != null) { st.entry = Number(t.value) || 0; persist(); return; }
    if (t.dataset.rset) { st[t.dataset.rset] = Number(t.value); persist(); render(); if (t.dataset.rset === 'surgeLimit') showSol(); return; }
    if (t.dataset.rchk) { st[t.dataset.rchk] = t.checked; persist(); return; }
    if (t.dataset.rnum) { st[t.dataset.rnum] = t.value === '' ? null : Number(t.value); persist(); return; }
    if (t.dataset.sp) {
      const [k, ph, f] = t.dataset.sp.split('|'), p = st.players[Number(k)];
      p.specs = (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[Number(k)] || [{}, {}, {}])).map((x) => ({ spec: 'none', backup: false, horn: false, ...x }));
      if (f === 'ifBarrage') { if (t.value) p.specs[Number(ph)].ifBarrage = t.value; else delete p.specs[Number(ph)].ifBarrage; }
      else if (f === 'backups') { if (t.value === '2') p.specs[Number(ph)].backups = 2; else delete p.specs[Number(ph)].backups; }
      else p.specs[Number(ph)][f] = f === 'spec' ? t.value : f === 'horn' ? (t.value === '2' ? 2 : t.value === '1') : t.checked;
      if (!p.specs[Number(ph)].backup) delete p.specs[Number(ph)].backups;
      if (f !== 'ifBarrage' && (Number(ph) !== 0 || p.specs[0].backup || !['maul', 'bgs'].includes(p.specs[0].spec))) delete p.specs[Number(ph)].ifBarrage;
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
    const barrageOk = st.players.some((q, j) => q.prefire === 'Shadow Barrage' && !!(gp && (gp[j].weapons || []).includes('Shadow ancient sceptre')));
    return st.players.map((p, k) => {
      const gear = gp ? gp[k] : blankPlayer(k), orb = !!gear.locator;
      return { name: gear.name || `Player ${k + 1}`, gear, own: true, prefire: p.prefire || '', startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge,
        lbCycles: Number(p.lbCycles || 0), pnecks: Number(p.pnecks || 0), sharks: Number(p.sharks || 0), rests: Number(p.rests || 0), restores: Number(p.restores ?? 3),
        mazes: Array.isArray(p.mazes) ? p.mazes : defaultMazes(Number(p.pnecks || 0), orb, team()),
        specs: (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[k] || [])).map((x) => { const y = { ...x, horn: gear.horn ? (x.horn ? (Number(x.horn) === 2 ? 2 : true) : false) : false }; if (!barrageOk) delete y.ifBarrage; return y; }) };
    });
  };
  rep.addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.sraid) { showRaid(e.target); return; }
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
        // Show raid, per set: the raids just played (replayed from their seed)
        const SPL = ['p1', 'maze1', 'p2', 'maze2', 'p3'];
        rflat = runs.map((x) => ({ set: x.k, replay: { players: x.players, seed, entry: x.opts.entry, opts: x.opts,
          raids: (x.res.idx || []).map((i2, j) => ({ i: i2, total: x.res.total[j], key: SPL.map((q) => x.res.split[q][j]).join(',') })), allN: x.res.runs } }));
        out.insertAdjacentHTML('beforeend', `<div class="vz-report" style="margin-top:10px">${rflat.map((x, j) => `<div style="margin-bottom:6px">${runs.length > 1 ? `<b>${esc(labels[j])}</b>` : ''}${raidBar('r', j, bps)}</div>`).join('')}</div>`);
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

  // ---- optimizer: the entry instance (i0-i3) for each ticked set, on the same raids at each
  let ojob = null, oresults = null, ocombine = false;
  const oopen = {};
  const $o = (k) => opt.querySelector(`[data-o="${k}"]`), obtn = (a) => opt.querySelector(`[data-oact="${a}"]`);
  const setLabel = (k) => { const l = String((repState().labels || {})[k] || '').trim(); return l ? `Set ${k}: ${l}` : `Set ${k}`; };
  const optState = () => { const st = rootState(); st.opt ||= { raids: 2000, seed: '', bps: '' }; st.opt.sets ||= [st.cur]; return st.opt; };
  const showOpt = () => {
    const o = optState(), rs = rootState(); $o('raids').value = o.raids; $o('seed').value = o.seed; $o('bps').value = o.bps;
    opt.querySelector('[data-osets]').innerHTML = setPicker((k) => !!rs.sets[k], o.sets, setLabel);
  };
  for (const ev of ['input', 'change']) opt.addEventListener(ev, (e) => {
    if (e.target.dataset.runset) { const o = optState(); o.sets = pickSets(o.sets, e.target); persist(); return; }
    const k = e.target.dataset.o; if (!k) return; optState()[k] = k === 'raids' ? Number(e.target.value) : e.target.value; persist();
  });
  const tm = (t) => { const x = t * 0.6; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
  const fsB = (b) => { const r = Math.round(b % 60 * 10) / 10; return `${Math.floor(b / 60)}:${r < 10 ? '0' : ''}${r}`; };
  let oflat = [], rflat = [];                                        // Optimizer rows / Report sets shown (Show raid)                                                    // every Optimizer row shown, for the Decision tree buttons
  const showOptResults = () => {
    const out = opt.querySelector('[data-oout]');
    if (!oresults) { out.innerHTML = ''; return; }
    const { groups, bps, t } = oresults, asc = [...bps].sort((x, y) => x - y);
    oflat = [];
    const table = (rows, withSet) => `<table class="sortlist"><tr><th>Rank</th>${withSet ? '<th>Set</th>' : ''}<th>Entry</th><th>Median</th><th>Top 25%</th><th>Top 10%</th><th>Fastest</th>${bps.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th>P1</th><th>Mazes</th><th>P2</th><th>P3</th><th></th></tr>
      ${rows.map((r, j) => `<tr${j === 0 ? ' style="font-weight:700"' : ''}><td>${j + 1}</td>${withSet ? `<td data-setcol="${r.set}" style="color:var(--c);font-weight:700">${esc(setLabel(r.set))}</td>` : ''}<td>i${r.k}</td><td>${tm(r.med)}</td><td>${tm(r.q25)}</td><td>${tm(r.q10)}</td><td>${tm(r.fast)}</td>${r.at.map((x) => `<td>${(x * 100).toFixed(1)}%</td>`).join('')}<td>${(r.p1 * 0.6).toFixed(1)}s</td><td>${(r.maze * 0.6).toFixed(1)}s</td><td>${(r.p2 * 0.6).toFixed(1)}s</td><td>${(r.p3 * 0.6).toFixed(1)}s</td><td style="white-space:nowrap"><button class="ghost sm" data-otree="${oflat.push(r) - 1}">Procedure</button> <button class="ghost sm" data-use-entry="${r.k}" data-for-set="${r.set}" data-to="${r.set}">Use for set ${r.set}</button></td></tr>
        <tr class="sub-row" data-otreerow="${oflat.length - 1}" hidden><td colspan="${11 + bps.length + (withSet ? 1 : 0)}" style="text-align:left"><div class="small">Entry instance i${r.k} (median by entry: ${r.byEntry})</div>${procTable(r)}${adjustments(r)}${raidBar('o', oflat.length - 1, bps)}</td></tr>`).join('')}
      </table>`;
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${t}-man Sotetseg: entry instance</h3>
      <div class="sub">${groups[0].items[0].n.toLocaleString()} raids per instance${groups.length > 1 ? ' and set' : ''}, the same raids at each${bps.length ? ` · ranked by most finished by ${fsB(asc[0])}` : ' · ranked by the lowest median'} · maze = both mazes, proc to interactable (medians)</div>
      ${setResultsHtml(groups, { combine: ocombine, table, open: oopen, better: (a, b) => scoreBetter(a.score, b.score) })}</div>`;
  };
  wireSetResults(opt.querySelector('[data-oout]'), oopen, (c) => { ocombine = c; showOptResults(); });
  opt.addEventListener('click', (e) => {
    const a = e.target.dataset.oact;
    if (e.target.dataset.sraid) { showRaid(e.target); return; }
    if (e.target.dataset.otree != null) { const row = opt.querySelector(`[data-otreerow="${e.target.dataset.otree}"]`); if (row) row.hidden = !row.hidden; return; }
    if (e.target.dataset.useEntry != null) {
      const k = e.target.dataset.forSet, st = setOf(k); if (!st) return;
      st.entry = Number(e.target.dataset.useEntry); persist(); render(); opt.querySelector('[data-ostatus]').textContent = `Set ${k} now enters on i${st.entry}.`; return;
    }
    if (!a) return;
    if (a === 'stop') { if (ojob) ojob.stop = true; return; }
    if (a !== 'run' || ojob) return;
    const o = optState(), err = opt.querySelector('[data-oerr]'), status = opt.querySelector('[data-ostatus]');
    err.textContent = '';
    let bps = [];
    try { bps = String(o.bps || '').trim() ? parseBreakpoints(o.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const keys = o.sets.filter((k) => setOf(k));
    if (!keys.length) { err.textContent = 'Tick at least one set to run.'; return; }
    const n = Math.max(100, Number(o.raids) || 2000), t = team();
    const runs = keys.map((k) => { const st = setOf(k); return { k, players: playersNow(st), opts: { clawBelow: st.clawBelow ?? CLAW_BELOW, splitBall: st.splitBall !== false, stallTick: !!st.stallTick }, res: [0, 1, 2, 3].map(() => newSoteResult()) }; });
    const seed = String(o.seed || '').trim() || `o${Date.now()}`;
    ojob = { stop: false }; const me = ojob;
    obtn('run').disabled = true; obtn('stop').disabled = false;
    let si = 0, entry = 0, i = 0;
    const finish = () => {
      ojob = null; obtn('run').disabled = false; obtn('stop').disabled = true;
      const groups = runs.map((x) => {
        const rows = x.res.map((r, k) => {
          const v = r.total.slice().sort((p, q) => p - q), med = v[Math.floor(v.length / 2)], q10 = v[Math.max(0, Math.floor(v.length * 0.1) - 1)]; const q25 = v[Math.max(0, Math.floor(v.length * 0.25) - 1)];
          const sp = (key) => { const w = r.split[key].slice().sort((p, q) => p - q); return w[Math.floor(w.length / 2)]; };
          const at = bps.map((b) => (v.length ? v.filter((y) => y * 0.6 <= b + 1e-9).length / v.length : 0));
          const SPL = ['p1', 'maze1', 'p2', 'maze2', 'p3'];
          const raids = (r.idx || []).map((i, j) => ({ i, total: r.total[j], key: SPL.map((q) => r.split[q][j]).join(',') }));
          return { set: x.k, k, replay: { players: x.players, seed, entry: k, opts: x.opts, raids, allN: r.runs }, cfg: { players: x.players }, totals: [...r.total, ...Array(r.wipes).fill(9999)], events: r.events || {}, n: v.length, med, q25, q10, fast: v[0], at, score: v.length ? soteScore(r.total, bps) : null, maze: v.length ? sp('maze1') + sp('maze2') : null, p1: v.length ? sp('p1') : null, p2: v.length ? sp('p2') : null, p3: v.length ? sp('p3') : null };
        }).filter((r) => r.n);
        rows.sort((p, q) => (scoreBetter(p.score, q.score) ? -1 : scoreBetter(q.score, p.score) ? 1 : 0));
        const byEntry = rows.map((r) => `i${r.k} ${tm(r.med)}`).sort().join(', ');   // as the Solver shows it
        rows.forEach((r) => { r.byEntry = byEntry; });
        return { k: x.k, label: setLabel(x.k), items: rows };
      });
      if (!groups.some((g) => g.items.length)) { status.textContent = 'Stopped.'; return; }
      oresults = { groups: groups.filter((g) => g.items.length), bps, t }; showOptResults();
      status.textContent = me.stop ? 'Stopped early - partial results.' : 'Done.';
    };
    const step = () => {
      if (me.stop || si >= runs.length) { finish(); return; }
      const x = runs[si], to = Math.min(n, i + 50);
      try { addSoteRaids(x.res[entry], x.players, t, i, to, { seed, entry, ...x.opts }); } catch (y) { err.textContent = `Couldn't run set ${x.k}: ${y.message}`; me.stop = true; }
      i = to; if (i >= n) { entry++; i = 0; if (entry > 3) { entry = 0; si++; } }
      status.textContent = si >= runs.length ? 'Ranking...' : `Running${runs.length > 1 ? ` set ${runs[si].k} (${si + 1} of ${runs.length})` : ''}... i${entry}: ${i.toLocaleString()} / ${n.toLocaleString()} raids`;
      setTimeout(step, 0);
    };
    step();
  });

  // ---- solver: each ticked set solved from its own setup
  let vjob = null, vresults = null, vcombine = false;
  const vopen = {};
  const ALLOW = ['prefire', 'start', 'surge', 'lb', 'specs', 'entry'];
  const SEARCH_DEFAULT = { swaps: true, pairs: false, restarts: true };
  const solState = () => { const st = rootState(); st.solve ||= { bps: '', effort: 'normal', allow: Object.fromEntries(ALLOW.map((k) => [k, true])) }; st.solve.sets ||= [st.cur]; return st.solve; };
  /** The Solver's own surge limit (0..team). Unset: the room setting of the current set, else everyone. */
  const surgeCap = (v) => {
    const t = team(), old = rootState().sets[rootState().cur]?.surgeLimit;
    const n = Number.isInteger(Number(v.surgeLimit)) && v.surgeLimit !== '' && v.surgeLimit != null ? Number(v.surgeLimit) : Number.isInteger(old) ? old : t;
    return Math.max(0, Math.min(t, n));
  };
  const showSol = () => {
    const v = solState(), rs = rootState();
    sol.querySelector('[data-vsets]').innerHTML = setPicker((k) => !!rs.sets[k], v.sets, setLabel);
    sol.querySelector('[data-v="bps"]').value = v.bps; sol.querySelector('[data-v="effort"]').value = v.effort;
    const sl = surgeCap(v);
    sol.querySelector('[data-v="surgeLimit"]').innerHTML = Array.from({ length: team() + 1 }, (_, n) => `<option value="${n}" ${n === sl ? 'selected' : ''}>${n}</option>`).join('');
    for (const k of ALLOW) sol.querySelector(`[data-va="${k}"]`).checked = v.allow[k] !== false;
    v.search ||= { ...SEARCH_DEFAULT };
    for (const k of Object.keys(SEARCH_DEFAULT)) sol.querySelector(`[data-vs="${k}"]`).checked = !!v.search[k];
  };
  for (const ev of ['input', 'change']) sol.addEventListener(ev, (e) => {
    const v = solState();
    if (e.target.dataset.runset) v.sets = pickSets(v.sets, e.target);
    else if (e.target.dataset.v) v[e.target.dataset.v] = e.target.dataset.v === 'surgeLimit' ? Number(e.target.value) : e.target.value;
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
  /** Who a horn buffs (as the engine picks): other players' planned (not backup) mauls / BGS that phase first, then
   *  their scythes (the buff is on the next melee hit - a scythe's first hitsplat), a planned ZCB player last. */
  const hornTxt = (x, k, ph, P, set) => {
    const others = P.map((q, j) => j).filter((j) => j !== k);
    const isM = (j) => ['maul', 'bgs'].includes(P[j].specs[ph].spec) && !P[j].specs[ph].backup && !(ph === 0 && P[j].specs[0].ifBarrage);
    const zcbNow = (j) => (P[j].specs[ph].spec === 'zcb' && !P[j].specs[ph].backup ? 1 : 0);
    const recs = [...others.filter(isM), ...others.filter((j) => !isM(j)).sort((a, b) => zcbNow(a) - zcbNow(b))].slice(0, Number(x.horn) === 2 ? 2 : 1);
    return `Horn ${recs.map((j) => `${pnameOf(set, j)}'s ${isM(j) ? (P[j].specs[ph].spec === 'bgs' ? 'BGS' : 'maul') : 'next hit'}`).join(' + ')}${x.spec === 'none' && !x.backup ? '' : ' + '}`;
  };
  const specTxt = (x, k, ph, P, set) => `${x.horn ? (P ? hornTxt(x, k, ph, P, set) : 'Horn + ') : ''}${x.horn && P && x.spec === 'none' && !x.backup ? '' : x.backup ? `backup (${x.spec === 'none' || x.spec === 'maul' ? 'maul if needed' : x.spec === 'bgs' ? 'BGS if needed' : `maul if needed, else ${KINDS[x.spec]}`}${Number(x.backups) === 2 ? ', up to 2 tries' : ''})` : KINDS[x.spec] || x.spec}${x.ifBarrage ? ` (Barrage landed: ${x.ifBarrage === 'none' ? 'first backup' : `first backup, else ${KINDS[x.ifBarrage]}`})` : ''}`;
  /** "If this happens, do this": the setup's contingencies, with the share of raids each came up in. */
  /** The decision tree: each player's planned route, then what they do if things go another way (share of raids). */
  /** Show raid: the buttons (kind: 'o' Optimizer / 'v' Solver row) and the timeline of the picked raid. */
  const raidBar = (kind, idx, bps = []) => `<div class="row wrap" style="gap:6px;margin-top:8px;align-items:center"><b class="small">Show raid</b>${raidChoices(bps).map(([k, l]) => `<button class="ghost sm" data-sraid="${kind}|${idx}|${k}">${l}</button>`).join('')}</div><div data-sraidout="${kind}|${idx}"></div>`;
  const showRaid = (b) => {
    const [kind, idx, which] = b.dataset.sraid.split('|'), r = ({ o: oflat, v: vflat, r: rflat })[kind][Number(idx)], box = host.querySelector(`[data-sraidout="${kind}|${idx}"]`);
    if (!r || !r.replay || !box) return;
    const { players, seed, entry, opts, raids, allN } = r.replay, pk = pickRaid(raids, allN, which);
    if (!pk) { box.innerHTML = '<p class="muted small">No raid finished at that point.</p>'; return; }
    const trace = [], res = runSote(players, team(), new Rng(`${seed}#${pk.i}`), null, { entry, ...opts, trace });
    box.innerHTML = timelineHtml({ trace, names: players.map((p, k) => pnameOf(r.set, k)), bossName: 'Sotetseg', end: res.end,
      title: `${raidTitle(which, 'Sotetseg')} - ${tm(pk.total)} (entry i${entry}; ${pk.typical} of the ${pk.n} raids that ended at ${tm(pk.total)} went this way)`,
      legend: 'ZCB bolt and ZCB spec share the crossbow icon (hover to tell) · purple tint: the chosen player, under the maze; lighter: the others on the maze · r: a spec regen · skull: vengeance · supplies: shark icon · dots on the left: yellow brew, pink restore, white surge, green super combat, grey anything else · heart redemption proc · her row: red her attacks (DB death ball) - hover any cell for details' });
  };
  /** A setup's procedure: per player prefire, start spec, surge, Lightbearer and each phase's spec. r: {cfg, set}. */
  const procTable = (r) => `<table style="margin-top:4px"><tr><th>Player</th><th>Prefire</th><th>Start</th><th>Surge</th><th>Lightbearer</th><th>P1</th><th>P2</th><th>P3</th></tr>
          ${r.cfg.players.map((p, k) => `<tr><td>${esc(pnameOf(r.set, k))}</td><td>${esc(p.prefire || 'none')}</td><td>${p.startSpec}%</td><td>${p.surge ? 'yes' : '-'}</td><td>${p.lbCycles ? `${p.lbCycles} cycles` : '-'}</td>${p.specs.map((x, ph) => `<td>${esc(specTxt(x, k, ph, r.cfg.players, r.set))}</td>`).join('')}</tr>`).join('')}</table>`;
  const adjustments = (r) => {
    const n = r.totals.length, ev = r.events || {}, P = r.cfg.players, nm = (k) => esc(pnameOf(r.set, k));
    const c = (k) => ev[k] || 0, pc = (x) => `<b>${Math.round(x / n * 100)}%</b>`;
    const cb = `${(setOf(r.set) || {}).clawBelow ?? CLAW_BELOW} HP`;   // the set's P3 ZCB -> claws threshold
    const isDef = (s) => s === 'maul' || s === 'bgs', K = (s) => (s === 'none' ? 'no spec' : KINDS[s]);
    const maulers = (ph, not) => P.map((q, j) => j).filter((j) => j !== not && isDef(P[j].specs[ph].spec) && !P[j].specs[ph].backup);
    const whose = (js) => (js.length ? `${js.map(nm).join(' / ')}'s maul${js.length > 1 ? 's' : ''}` : 'the mauls');
    const barr = P.findIndex((p) => p.prefire === 'Shadow Barrage'), out = [];
    if (barr >= 0) out.push(`${nm(barr)}'s Shadow Barrage lands in ${pc(c('barrage:landed'))} of raids.`);
    P.forEach((p, k) => {
      const lines = [];
      p.specs.forEach((x, ph) => {
        const at = `P${ph + 1}`, fired = (kind) => c(`fired:${k}:${ph}:${kind}`);
        if (x.ifBarrage && isDef(x.spec) && !x.backup && barr >= 0 && ph === 0) {
          const alt = x.ifBarrage, a = c(`cond:${k}:${alt}`);
          const m2 = c(`cond:${k}:maul2`), br = [m2 >= n * 0.01 ? `none hit: ${K(x.spec)} (${pc(m2)})` : null, `one hits: ${alt === 'none' ? 'keep scything' : K(alt)} (${pc(a)})`].filter(Boolean);
          lines.push(`${at}: ${K(x.spec)} on their first hit if the Barrage misses (${pc(c(`cond:${k}:maul1`))}). If it lands: scythe and watch ${whose(maulers(0, k))} - ${br.join('; ')}.`);
        } else if (x.backup) {
          const m = c(`backup:${k}:${ph}:maul`), sp = c(`backup:${k}:${ph}:spec`), cl = ph === 2 && x.spec === 'zcb' ? Math.min(sp, c(`clawsForZcb:${k}`)) : 0, rest = n - m - sp;
          const dmg = x.spec === 'none' || isDef(x.spec) ? [] : cl >= sp && sp ? [`claws (her HP already under ${cb}) (${pc(sp)})`] : [sp - cl ? `${K(x.spec)} (${pc(sp - cl)})` : null, cl ? `claws instead if her HP is already under ${cb} (${pc(cl)})` : null].filter(Boolean);
          const parts = [m >= n * 0.01 ? `${K(x.spec === 'bgs' ? 'bgs' : 'maul')} once ${whose(maulers(ph, k))} ${maulers(ph, k).length === 1 ? 'has' : 'have'} landed, if her Defence isn't at the floor yet (${pc(m)})` : null, dmg.length && sp >= n * 0.01 ? `otherwise ${dmg.join(', ')}` : null, (m >= n * 0.01 || sp >= n * 0.01) && rest >= n * 0.01 ? `no spec (${pc(rest)})` : null, c(`backup2:${k}:${ph}`) >= n * 0.01 ? `the maul missed and she still isn't at the floor: ${K(x.spec === 'bgs' ? 'bgs' : 'maul')} again (${pc(c(`backup2:${k}:${ph}`))})` : null].filter(Boolean);
          lines.push(parts.length ? `${at}: ${parts.join('; ')}.` : `${at}: the backup is almost never needed (under 1% of raids).`);   // under 1% of raids: left out
        } else if (x.spec !== 'none') {
          const f = x.spec === 'zcb' && ph === 2 ? fired('zcb') + fired('claws') : fired(x.spec === 'bgs' ? 'bgs' : x.spec === 'maul' ? 'maul' : x.spec);
          const cl = x.spec === 'zcb' && ph === 2 ? c(`clawsForZcb:${k}`) : 0;
          if (cl) lines.push(`${at}: ZCB, or claws instead if her HP is already under ${cb} (${pc(cl)}).`);
          const bk = p.specs.findIndex((y, j) => j < ph && y.backup && c(`backup:${k}:${j}:maul`));   // an earlier backup maul used the spec
          // a P1 / P2 ZCB that didn't go off that phase moves to the start of the next (after its mauls, a backup first if needed)
          const cr = (x.spec === 'zcb' || x.spec === 'claws') && ph < 2 ? c(`carried:${k}:${ph}`) : 0, inPh = f - cr, nx = p.specs[ph + 1];
          if (cr >= n * 0.01) {
            const bkN = nx && nx.backup ? c(`backup:${k}:${ph + 1}:maul`) : 0, none = n - f;
            const parts = [inPh >= n * 0.01 ? `in P${ph + 1} (${pc(inPh)})` : null, `${inPh >= n * 0.01 ? `if P${ph + 1} was too fast (not enough spec yet, or too close to the maze)` : `never in time for P${ph + 1} - goes`} at the start of P${ph + 2}, once its mauls have landed${nx && nx.backup ? ' and no backup is needed' : ''} (${pc(cr)})`, bkN >= n * 0.01 ? `backup needed instead: ${K(nx.spec === 'bgs' ? 'bgs' : 'maul')}, no ${K(x.spec)} (${pc(Math.min(bkN, none))})` : null, none - Math.min(bkN, none) >= n * 0.01 ? `no ${K(x.spec)} (${pc(none - Math.min(bkN, none))})` : null].filter(Boolean);
            lines.push(`${at}: ${K(x.spec)} ${parts.join('; ')}.`);
          } else if (f < n * 0.99) lines.push(`${at}: ${K(x.spec)} goes off in ${pc(f)} - ${bk >= 0 ? `not if they backed up in P${bk + 1} (no spec left)` : 'otherwise no spec in time'}.`);
        }
        if (c(`zcbAfter:${k}:${ph}`) >= n * 0.01) lines.push(`${at}: ZCB after their backup maul - they still have 75% (the surge) (${pc(c(`zcbAfter:${k}:${ph}`))}).`);
        if (c(`extra:${k}:${ph}`) >= n * 0.01) lines.push(`${at}: claws with the spec they have left, once their P3 plan is done (${pc(c(`extra:${k}:${ph}`))}).`);
        // who the horn went to, when that changes (a conditional maul that waits on a Barrage isn't buffed)
        const hr = Object.entries(ev).filter(([e, v]) => e.startsWith(`horn:${k}:${ph}:`) && v >= n * 0.01);
        if (x.horn && hr.length > 1) lines.push(`${at} horn: ${hr.sort((u, w) => w[1] - u[1]).map(([e, v]) => { const js = e.split(':')[3].split('+').filter(Boolean).map(Number); return `${js.length ? js.map(nm).join(' + ') : 'nobody else'} (${js.length * 25 || 25}%) ${pc(v)}`; }).join(' · ')}.`);
        if (x.horn && c(`fired:${k}:${ph}:horn`) < n * 0.99) lines.push(`${at}: horn goes off in ${pc(c(`fired:${k}:${ph}:horn`))} - otherwise not enough spec.`);
        if (ph < 2 && c(`zcbCarry:${k}:${ph}`) && !(x.spec === 'zcb' && c(`carried:${k}:${ph}`) >= n * 0.01)) lines.push(`${at}: too close to the maze for the ZCB's ruby - keep it for the start of P${ph + 2} (${pc(c(`zcbCarry:${k}:${ph}`))}).`);
      });
      if (c(`halb:${k}`) >= n * 0.01) lines.push(`P3 last hit: Crystal halberd spec when they have 30%+ but can't claw and the team's next swings (this halberd included) kill her on average (${pc(c(`halb:${k}`))}).`);
      if (c(`lbStall:${k}`) >= n * 0.01) lines.push(`Lightbearer: the cycles run out during a maze stall in ${pc(c(`lbStall:${k}`))} - stay on it until out of the stall (no ring swaps while stalling).`);
      const plan = [`start ${p.startSpec}%`, p.prefire ? `${p.prefire} prefire` : null, p.surge ? 'surge with their first spec' : null, p.lbCycles ? `camp Lightbearer ${p.lbCycles} cycle${p.lbCycles > 1 ? 's' : ''}` : null, ...p.specs.map((x, ph) => (x.spec !== 'none' || x.horn || x.backup ? `P${ph + 1} ${specTxt(x, k, ph, P, r.set)}` : null))].filter(Boolean).map(esc).join(' · ');
      out.push(`<b>${nm(k)}</b>: ${plan || 'no specs'}${lines.length ? `<ul style="margin:2px 0 4px 18px;padding:0">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>` : ' <span class="muted">- always as planned</span>'}`);
    });
    return `<div class="small" style="margin-top:8px"><b>Decision tree</b><ul style="margin:4px 0 0 18px;padding:0">${out.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;
  };
  let vflat = [];                                                    // every result shown, for the buttons
  const showResults = () => {
    const out = sol.querySelector('[data-vout]');
    if (!vresults || !vresults.groups.some((g) => g.items.length)) { out.innerHTML = ''; return; }
    const { groups, bps, t } = vresults;
    const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const asc = [...bps].sort((a, b) => a - b);
    const ft = (x) => (x == null || Number.isNaN(x) ? '-' : x >= 9999 ? 'wiped' : fsec(x));       // 9999: a raid that wiped
    const wiped = (r) => r.totals.filter((x) => x >= 9999).length / r.totals.length;
    const all = groups.flatMap((g) => g.items), allWiped = all.every((r) => wiped(r) === 1), anyWiped = all.some((r) => wiped(r) > 0);
    vflat = [];
    const table = (rows, withSet) => `<div class="scroll"><table class="sortlist"><tr><th>#</th>${withSet ? '<th>Set</th>' : ''}<th>Entry</th><th>Median</th><th>Top 25%</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th>P1</th><th>Mazes</th><th>P2</th><th>P3</th>${anyWiped ? '<th>Wiped</th>' : ''}<th></th></tr>
      ${rows.map((r, i) => { const v = r.totals.slice().sort((a, b) => a - b), idx = vflat.push(r) - 1;
        return `<tr${i === 0 ? ' style="font-weight:700"' : ''}><td>${i + 1}</td>${withSet ? `<td data-setcol="${r.set}" style="color:var(--c);font-weight:700">${esc(setLabel(r.set))}</td>` : ''}<td>i${r.entry}</td><td>${ft(v[v.length >> 1])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.25) - 1)])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.1) - 1)])}</td><td>${ft(v[0])}</td>${asc.map((b) => `<td>${(v.filter((x) => x * 0.6 <= b + 1e-9).length / v.length * 100).toFixed(1)}%</td>`).join('')}<td>${ft(med(r.split.p1))}</td><td>${ft(med(r.split.maze1) + med(r.split.maze2))}</td><td>${ft(med(r.split.p2))}</td><td>${ft(med(r.split.p3))}</td>${anyWiped ? `<td>${(wiped(r) * 100).toFixed(1)}%</td>` : ''}<td style="white-space:nowrap"><button class="ghost sm" data-vshow="${idx}">Procedure</button> ${SETS.map((k) => `<button class="ghost sm" data-vuse="${idx}" data-to="${k}" title="Put this setup (and its entry instance) into set ${k}${rootState().sets[k] ? '' : ` - a new set, from set ${r.set}`}">Copy to set ${k}</button>`).join(' ')}</td></tr>
        <tr class="sub-row" data-vproc="${idx}" hidden><td colspan="${13 + asc.length + (withSet ? 1 : 0)}" style="text-align:left">
          <div class="small">Entry instance i${r.entry} (median by entry: ${r.byEntry.map((y) => `i${y.entry} ${ft(y.median)}`).join(', ')})</div>
          ${procTable(r)}${adjustments(r)}${raidBar('v', idx, asc)}</td></tr>`; }).join('')}
      </table></div>`;
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${t}-man Sotetseg: solver</h3>
      <div class="sub">Each played on the same ${all[0].totals.length.toLocaleString()} raids at its best entry instance${groups.length > 1 ? ' (every set on the same raids, so sets compare fairly)' : ''}. Times: median.</div>
      ${allWiped ? '<p class="err">Every raid wiped with these setups, so there is nothing to rank. Check the mazes and supplies above (phoenix necklaces, sharks) and the gear set - a Report run shows how the room goes.</p>' : ''}
      ${setResultsHtml(groups, { combine: vcombine, table, open: vopen, better: (a, b) => scoreBetter(a.score, b.score) })}</div>`;
  };
  wireSetResults(sol.querySelector('[data-vout]'), vopen, (c) => { vcombine = c; showResults(); });
  const pnameOf = (setKey, k) => { const st = setOf(setKey) || tstate(), g = loadGear(), set = gearSet(g, team(), st.gearSet), gp = set ? playersOf(set, team()) : null; return (gp && gp[k] && gp[k].name) || `Player ${k + 1}`; };
  /** Solve one set from its own setup. */
  async function solveSet(k, v, bps, me, say) {
    const st = setOf(k), t = team(), all = playersNow(st);
    const base = all.map((p) => ({ name: p.name, gear: p.gear, pnecks: p.pnecks, sharks: p.sharks, rests: p.rests, restores: p.restores, mazes: p.mazes }));
    const start = { entry: Number(st.entry) || 0, players: all.map((p) => ({ prefire: p.prefire, startSpec: p.startSpec, surge: p.surge, lbCycles: p.lbCycles, specs: p.specs.map((x) => ({ spec: 'none', backup: false, horn: false, ...x })) })) };
    const opts = { clawBelow: st.clawBelow ?? CLAW_BELOW, splitBall: st.splitBall !== false, stallTick: !!st.stallTick };
    const sr = v.search || SEARCH_DEFAULT, sLim = surgeCap(v), lbLim = Number.isInteger(st.lbRings) ? st.lbRings : t;
    /** A restart setup within the surge / Lightbearer limits and the weapons each player has. */
    const fit = (players) => { let su = 0, lb = 0; return players.map((p, j) => {
      const own = (w) => (all[j].gear.weapons || []).includes(w), okSpec = (x) => x.spec === 'none' || ({ maul: own('Elder maul') || own('Bandos godsword'), bgs: own('Bandos godsword'), claws: own('Dragon claws'), zcb: own('Zaryte crossbow') })[x.spec];
      const pre = { 'Twisted bow': 'Twisted bow', 'ZCB auto': 'Zaryte crossbow', 'ZCB spec': 'Zaryte crossbow', 'Shadow Barrage': 'Shadow ancient sceptre', "Tumeken's shadow": "Tumeken's shadow" }[p.prefire];
      const surge = p.surge && su < sLim; if (surge) su++; const lbc = p.lbCycles > 0 && lb < lbLim ? p.lbCycles : 0; if (lbc) lb++;
      return { ...p, prefire: !pre || own(pre) ? p.prefire : '', surge, lbCycles: lbc, specs: p.specs.map((x) => ({ spec: 'none', backup: false, horn: false, ...x, ...(okSpec(x) ? {} : { spec: 'none' }), horn: all[j].gear.horn ? (x.horn ? (Number(x.horn) === 2 ? 2 : true) : false) : false })) };
    }); };
    const ds = defaultSetup(t), dsp = defaultSpecs(t);
    const restarts = sr.restarts ? [
      { players: fit(ds.map((x, j) => ({ prefire: x.prefire, startSpec: x.startSpec, surge: x.surge, lbCycles: 0, specs: dsp[j].map((y) => ({ ...y })) }))) },
      { players: fit(start.players.map((_, j) => structuredClone(start.players[(j + 1) % t]))) },
    ] : [];
    const pool = new SotePool(base, t, opts); me.pool = pool;
    try {
      const res = await solveSote({ team: t, base, start, gear: all.map((p) => p.gear), allow: { ...Object.fromEntries(ALLOW.map((x) => [x, v.allow[x] !== false])) },
        surgeLimit: sLim, lbRings: lbLim, bps, solveEntry: v.allow.entry !== false, ...(EFFORT[v.effort] || EFFORT.normal), top: 10, swaps: !!sr.swaps, pairs: !!sr.pairs, restarts },
      (...args) => pool.run(...args), say, () => me.stopped);
      // Show raid: the final results were played on raids 'final#0..' at their entry instance - replayed from there
      const SPL = ['p1', 'maze1', 'p2', 'maze2', 'p3'];
      return res.map((r) => {
        const raids = []; let j = 0;
        r.totals.forEach((tot, i) => { if (tot >= 9999) return; raids.push({ i, total: tot, key: SPL.map((q) => r.split[q][j]).join(',') }); j++; });
        return { ...r, set: k, replay: { players: soteBuild(base, r.cfg), seed: 'final', entry: r.entry, opts, raids, allN: r.totals.length } };
      });
    } finally { pool.stop(); }
  }
  sol.addEventListener('click', async (e) => {
    const t0 = e.target;
    if (t0.dataset.sraid) { showRaid(t0); return; }
    if (t0.dataset.vshow != null) { const row = sol.querySelector(`[data-vproc="${t0.dataset.vshow}"]`); row.hidden = !row.hidden; return; }
    if (t0.dataset.vuse != null) {                                    // copy the setup (and its entry instance) into set A / B / C
      const r = vflat[Number(t0.dataset.vuse)], k = t0.dataset.to || rootState().cur, rs = rootState();
      if (!r) return;
      if (!rs.sets[k]) rs.sets[k] = structuredClone(setOf(r.set) || tstate());   // an empty set starts as a copy of the set solved (gear, mazes, supplies)
      const st = setOf(k), rp = repState(); if (!rp.sets.includes(k)) rp.sets = SETS.filter((x) => x === k || rp.sets.includes(x));
      r.cfg.players.forEach((p, j) => Object.assign(st.players[j], { prefire: p.prefire, startSpec: p.startSpec, surge: p.surge, lbCycles: p.lbCycles, specs: p.specs.map((x) => ({ ...x })) }));
      st.entry = r.entry; persist(); render(); showRep(); showOpt(); showSol();
      sol.querySelector('[data-vstatus]').textContent = `Set ${r.set} setup copied into set ${k} (entry instance i${r.entry}).`;
      return;
    }
    const a = t0.dataset.vact; if (!a) return;
    if (a === 'stop') { if (vjob) { vjob.stopped = true; if (vjob.pool) vjob.pool.stop(); } return; }
    if (a !== 'run' || vjob) return;
    const v = solState(), status = sol.querySelector('[data-vstatus]'), err = sol.querySelector('[data-verr]');
    err.textContent = '';
    let bps = [];
    try { bps = String(v.bps || '').trim() ? parseBreakpoints(v.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const keys = v.sets.filter((k) => setOf(k));
    if (!keys.length) { err.textContent = 'Tick at least one set to solve.'; return; }
    const t = team();
    vjob = { stopped: false, pool: null }; const me = vjob;
    vbtn('run').disabled = true; vbtn('stop').disabled = false;
    const t1 = Date.now(), groups = [];
    try {
      for (const [n, k] of keys.entries()) {
        if (me.stopped) break;
        const pre = keys.length > 1 ? `Set ${k} (${n + 1} of ${keys.length}): ` : '';
        const items = await solveSet(k, v, bps, me, (txt) => { status.textContent = `${pre}${txt} (${Math.round((Date.now() - t1) / 1000)}s)`; });
        groups.push({ k, label: setLabel(k), items });
        vresults = { groups: [...groups], bps, t }; showResults();
      }
      status.textContent = me.stopped ? 'Stopped.' : `Done in ${Math.round((Date.now() - t1) / 1000)}s.`;
    } catch (x) { status.textContent = me.stopped ? 'Stopped.' : ''; if (!me.stopped) err.textContent = `Couldn't solve: ${x.message}`; }
    finally { vjob = null; vbtn('run').disabled = false; vbtn('stop').disabled = true; }
  });

  function refreshAll() { render(); showRep(); showOpt(); showSol(); }
  return { refresh: () => { state = load(); saved = loadSaved(); refreshAll(); } };
}
