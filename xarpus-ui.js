// Xarpus tab: per-player room settings for every scale (sets A / B / C, saved in this browser or to a file), a Report
// comparing the ticked sets and the Solver. Gear comes from the Gear tab (the Gear set picked here).
import { groupsOf } from './engine/symmetry.js';
import { breath, whenFree } from './engine/pause.js';
import { activeNow } from './engine/pause.js';
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { blankPlayer } from './engine/loadout.js';
import { newXarpusResult, addXarpusRaids, xarpusReportHtml, xarpusReportPage } from './engine/xarpusreport.js';
import { parseBreakpoints } from './engine/optimize.js';
import { defaultXarpusPlan, migrateXarpus, canDo, openMaulers, defCap, OPENERS, BACKUP_SPECS, DPS_SPECS, FIXES, DEF_TARGETS, CHALLY_ATS, ZCB_BELOW, HEALS_DEFAULT, HEALS_NOTE, HEAL, HEAL_SPREAD, XARPUS_HP, screechHp, EXHUMED_TICKS, hornN } from './engine/xarpus.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';
import { setPicker, pickSets, setResultsHtml, wireSetResults } from './setresults.js';
import { solveXarpus, better as scoreBetter, normalizePlan } from './engine/xarpussolve.js';
import { XarpusPool } from './xarpus-solver-pool.js';
import { runXarpus } from './engine/xarpus.js';
import { normRangePot } from './engine/sote.js';
import { rangePotCell, rangePotFrom, RANGE_POT_TIP } from './sote-ui.js';
/** Range pot before the option was set: Ralos players (opening or backup Ralos Spec) divine, everyone else not potted. */
export const autoRangePot = (plan, k) => ((plan.players[k] || {}).open === 'ralos' || (plan.backups || []).some((b) => Number(b.p) === k && b.spec === 'ralos') ? 'divine' : '');
import { Rng } from './engine/rng.js';
import { pickRaid, timelineHtml, successSteps, failSteps, raidNav } from './raidview.js';

const STORE = 'verzikSim.xarpus.v1';           // {team: {cur, sets: {A, B?, C?}, report, solve}}
const SAVED = 'verzikSim.xarpusSaved.v1';      // {team: [{id, name, saved, set}]}
const SETS = ['A', 'B', 'C'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadKey = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const pick = () => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"`;

export function createXarpus(host, { getTeam, store = STORE, embed = false }) {
  let state = loadKey(store), saved = loadKey(SAVED), savedPick = '', setMsg = '';
  const persist = () => saveKey(store, state);
  const team = () => Number(getTeam()) || 4;
  host.innerHTML = `${settingsCard('Xarpus settings', '<div data-cfg></div>')}
    ${tabsHtml([['rep', 'Report'], ['solve', 'Solver']])}
    ${pane('rep', 'data-rep', `
      <div class="row" style="margin-top:10px">
        <label>Raids per set<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <div data-rsets></div>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page): the pieces already running finish, then it waits. Resume carries on from the same spot with the inputs it started with">Pause</button><button data-act="dl" class="ghost" disabled>Download report</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>
    `)}
    ${pane('solve', 'data-solve', `
      <p class="muted small" style="margin-top:8px">Searches for the best setup from the one above: each player's opening Defence spec, who mauls again for each number of opening mauls landed,
        the backups (who, which spec, the order and "back up right away"), the Defence target (${DEF_TARGETS.join(', ')}), damage spec (ZCB, claws) and holding ZCBs for the screech or ZCB As Soon As Available, tick fix, start spec, Lightbearer cycles, surge and horn (none / 1 / 2 others), the ZCB → claws HP and the Chally last hit (${CHALLY_ATS.join(', ')}%) -
        within the Surge potions / Lightbearers limits and the gear each player has. Each round it tries every single change (with Role changes: a player's opening spec, damage spec, start spec and Lightbearer cycles together; with Swaps: also two
        players' opening or damage specs swapped, a Lightbearer / surge moved) on a few raids, then the best on more, and keeps the best if it beats the
        current setup, until nothing does (Restarts: again from the default plan for the scale). Setups with no Defence spec at all are skipped. The top setups are then played on more raids and ranked:
        with breakpoints by the share finished at the fastest one (then the next), otherwise by the median. Each ticked set is solved from its own setup.</p>
      <div class="row">
        <div data-vsets></div>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-v="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label>Effort<select data-v="effort"><option value="quick">Quick</option><option value="normal">Normal</option><option value="thorough">Thorough</option></select></label>
        <button data-vact="run">Solve</button><button data-vact="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page): the pieces already running finish, then it waits. Resume carries on from the same spot with the inputs it started with">Pause</button>
      </div>
      <div class="row" style="margin-top:6px">${[['def', 'Defence specs'], ['dps', 'Damage specs'], ['fix', 'Tick fixes'], ['start', 'Start spec'], ['lb', 'Lightbearer'], ['surge', 'Surges'], ['horn', 'Horns'], ['defTarget', 'Defence target'], ['zcbBelow', 'ZCB → claws HP'], ['chally', 'Chally last hit']]
        .map(([k, l]) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-va="${k}">${l}</label>`).join('')}</div>
      <div class="row" style="margin-top:6px"><span class="muted small">Search:</span>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Also swap two players' Defence or damage specs, and move a Lightbearer / surge, in one step"><input type="checkbox" data-vs="swaps">Swaps</label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Also change a player's Defence spec, damage spec, start spec and Lightbearer cycles together (e.g. no maul: 95% start, ZCB, Lightbearer for a second) - plans one change at a time can't reach"><input type="checkbox" data-vs="roles">Role changes</label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Search again from the default plan for the scale and keep the best of everything (about 2x the time)"><input type="checkbox" data-vs="restarts">Restarts</label></div>
      <div data-vpots style="margin-top:6px"></div>
      <div data-vstatus class="muted" style="margin-top:8px"></div><div data-verr class="err"></div><div data-vout style="margin-top:8px"></div>
    `)}`;
  wireSubtabs(host, 'verzikSim.xarpusTabs.v1');
  const cfg = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]');

  // per scale: {cur, sets, report, solve}
  const rootState = () => { const t = team(); state[t] ||= {}; const r = state[t]; r.sets ||= {}; r.cur ||= 'A'; if (!r.sets[r.cur]) r.cur = 'A'; return r; };
  const blankSet = () => ({ gearSet: 'A', heals: HEALS_DEFAULT[team()], exactHeals: false, zcbBelow: ZCB_BELOW, surgeLimit: 0, lbRings: team(), ...structuredClone(defaultXarpusPlan(team())) });
  const fixSet = (st) => {
    const t = team(), d = defaultXarpusPlan(t), b = blankSet();
    if ((st.players || []).some((p) => p && (Array.isArray(p.defs) || p.def || p.backup))) migrateXarpus(st, t);   // an older set: Defence slots
    for (const k of Object.keys(b)) if (st[k] == null) st[k] = structuredClone(b[k]);
    st.players ||= [];
    for (let k = 0; k < t; k++) {
      const old = st.players[k], dp = d.players[k] || d.players[0];
      st.players[k] = { ...dp, ...(old || {}) };
      if (st.players[k].open == null) st.players[k].open = dp.open;
    }
    st.players.length = t;
    migrateXarpus(st, t); normalizePlan(st);
    st.players.forEach((p, k) => { if (p.rangePot === undefined || p.rangePot === null) p.rangePot = autoRangePot(st, k); });   // older sets: as the sim played them
    return st;
  };
  const cur = () => { const r = rootState(); return fixSet(r.sets[r.cur] ||= blankSet()); };
  const setOf = (k) => { const r = rootState(); return r.sets[k] ? fixSet(r.sets[k]) : null; };
  const gearOf = (st) => { const set = gearSet(loadGear(), team(), st.gearSet); return set ? playersOf(set, team()) : null; };

  /** Sets A / B / C as tabs on the settings card; the card takes the current set's colour. */
  function setTabs() {
    const r = rootState(), tb = host.querySelector('[data-settabs]');
    tb.innerHTML = SETS.map((k) => `<button data-set="${k}" class="${k === r.cur ? 'on' : ''}" title="${r.sets[k] ? `Set ${k}` : 'Empty - opens a new set'}">Set ${k}${r.sets[k] ? '' : ' <span class="muted">(empty)</span>'}</button>`).join('');
    host.querySelector('[data-setcard]').dataset.setcol = r.cur;
  }
  function render() {
    const st = cur(); setTabs();
    const t = team(), r = rootState(), g = loadGear(), gp = gearOf(st), list = saved[t] || [];
    const pname = (k) => (gp && gp[k] && gp[k].name) || `Player ${k + 1}`;
    const gearK = (k) => (gp && gp[k]) || blankPlayer(k);
    const sel = (k, key, opts, v, w = 170) => `<select data-p="${k}|${key}" style="width:${w}px">${opts.map(([x, l]) => { const ok = canDo(gearK(k), x); return `<option value="${x}" ${x === v ? 'selected' : ''} ${ok ? '' : 'disabled'}>${l}${ok ? '' : ' (not in Gear set)'}</option>`; }).join('')}</select>`;
    const hp = XARPUS_HP[t] + Math.max(0, Number(st.heals) || 0) * HEAL[t];
    const notes = [], cap = defCap(t), maulers = openMaulers(st.players), N = maulers.length;
    const surgers = st.players.filter((p) => p.surge).length, lbers = st.players.filter((p) => Number(p.lbCycles || 0) > 0).length;
    if (surgers > Number(st.surgeLimit)) notes.push(`${surgers} players drink a surge, but only ${st.surgeLimit} surge potion${Number(st.surgeLimit) === 1 ? '' : 's'} can be used here.`);
    if (lbers > Number(st.lbRings)) notes.push(`${lbers} players wear Lightbearer, but there ${Number(st.lbRings) === 1 ? 'is' : 'are'} only ${st.lbRings} in the raid.`);
    if (!st.players.some((p, k) => p.open !== 'none' && canDo(gearK(k), p.open)) && !st.backups.length) notes.push('Nobody lowers his Defence.');
    const specName = (v) => (OPENERS.find((x) => x[0] === v) || [v, v])[1];
    st.players.forEach((p, k) => {
      for (const [key, v] of [['open', p.open], ['dps', p.dps], ['fix', p.fix]]) if (v && v !== 'none' && !canDo(gearK(k), v)) notes.push(`${pname(k)}: no ${({ open: `weapon for their opening ${specName(v)}`, dps: 'weapon for their damage spec', fix: 'weapon for their tick fix' })[key]} in this Gear set - ${key === 'fix' ? 'they lose a tick instead' : 'skipped'}.`);
      if ((p.open === 'maul' || Object.values(st.remaul).some((x) => x.includes(k)) || st.backups.some((b) => b.p === k && b.spec === 'maul')) && !(gearK(k).weapons || []).includes('Elder maul') && canDo(gearK(k), 'maul')) notes.push(`${pname(k)}: no Elder maul - a BGS in its place.`);
      if (p.horn && !(gp && gp[k] && gp[k].horn)) notes.push(`${pname(k)}: no Soulflame horn (Gear tab) - no horn.`);
    });
    st.backups.forEach((b, i) => { if (!canDo(gearK(b.p), b.spec)) notes.push(`Backup ${i + 1}: ${pname(b.p)} has no weapon for ${specName(b.spec)} in this Gear set - skipped.`); });
    const opt = (list, v) => list.map(([x, l]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
    const nowOpts = [[-1, 'Never'], ...Array.from({ length: N }, (_, n) => [n, String(n)])];
    const blk = (n, title, body) => `<div class="xblk"><h4>${n ? `<span class="xstep">${n}</span>` : ''}${title}</h4>${body}</div>`;
    cfg.innerHTML = `<h3 style="margin-top:0">Xarpus <span class="muted small">(${t}-man)</span></h3>
      <p class="muted small">Room settings for each player, saved in this browser. Gear comes from the Gear tab. The exhumeds end on t${EXHUMED_TICKS[t]} (his 4-tick cycle);
        everyone's first attack is the tick after. Players scythe every 5 ticks; the specs below go off as described in View mechanics &amp; behavior.</p>
      <div class="row wrap" style="gap:10px;align-items:end;margin:4px 0 10px">
        <div><div class="muted small">Copy set ${r.cur} to</div>${SETS.filter((k) => k !== r.cur).map((k) => `<button class="ghost sm" data-copyset="${k}" title="Replace set ${k} with a copy of set ${r.cur}">Set ${k}</button>`).join(' ')}</div>
        <button class="ghost sm" data-clearset title="Start set ${r.cur} over from the default plan (its Gear set stays)">Clear set ${r.cur}</button>
        <label>Saved sets<select data-saved="pick"><option value="">(choose a set)</option>${list.map((x) => `<option value="${x.id}" ${x.id === savedPick ? 'selected' : ''}>${esc(x.name)} · ${new Date(x.saved).toLocaleDateString()}</option>`).join('')}</select></label>
        <button class="ghost sm" data-setact="load" ${savedPick ? '' : 'disabled'}>Load into set ${r.cur}</button>
        <button class="ghost sm" data-setact="del" ${savedPick ? '' : 'disabled'}>Delete</button>
        <label>Name<input data-saved="name" placeholder="e.g. 3 mauls + 2 Ralos" style="width:150px"></label>
        <button class="sm" data-setact="save">Save set</button>
        <button class="ghost sm" data-setact="file">Save to file</button>
        <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-saved="file" hidden></label>
        <span class="muted small">${esc(setMsg)}</span>
      </div>
      <div class="row wrap" style="gap:14px;align-items:end;margin-bottom:8px">
        <label>Gear<select data-s="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${x === st.gearSet ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}${gearSet(g, t, x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        <label title="${esc(HEALS_NOTE)}. Each heal (a missed tick on an exhumed) gives him ${HEAL[t]} HP: ${XARPUS_HP[t]} + heals x ${HEAL[t]} when players can attack.">Number of heals<input data-s="heals" type="number" min="0" step="1" value="${esc(st.heals)}" style="width:70px"></label>
        ${pick()} title="Every raid uses exactly this number of heals. Off: each raid is this number +- ${HEAL_SPREAD} (evenly, never below 0)"><input type="checkbox" data-s="exactHeals" ${st.exactHeals ? 'checked' : ''}>Exact heals (no ±${HEAL_SPREAD})</label>
        <label title="Surge potions the team can use in this room (the solver won't use more). Most scales don't surge here.">Surge potions<select data-s="surgeLimit">${Array.from({ length: t + 1 }, (_, n) => `<option value="${n}" ${n === Number(st.surgeLimit) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label title="Lightbearer rings in the raid: no more players than this can wear one">Lightbearers<select data-s="lbRings">${Array.from({ length: t + 1 }, (_, n) => `<option value="${n}" ${n === Number(st.lbRings) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <p class="muted small" style="margin:0 0 8px">${esc(HEALS_NOTE)}. At ${esc(st.heals)} heal${Number(st.heals) === 1 ? '' : 's'} he's on ${hp} HP when players can attack (base ${XARPUS_HP[t]} + ${esc(st.heals)} x ${HEAL[t]}; screech at 33% of that: ${screechHp(hp)}).</p>
      ${notes.map((x) => `<div class="warn small" style="margin-bottom:4px">${esc(x)}</div>`).join('')}
      <style>.xblk{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:10px 0}.xblk h4{margin:0 0 2px;font-size:14px}.xblk p{margin:2px 0 6px}
        .xstep{display:inline-block;width:19px;height:19px;border-radius:50%;background:var(--accent);color:var(--card);text-align:center;font-size:12px;line-height:19px;margin-right:6px;font-weight:700}</style>
      ${blk(0, 'Players', `<div class="scroll"><table class="bt"><tr><th></th><th title="Spec % at the start of the room. 95: their first regen comes the tick after their first special attack, then as normal">Start spec (%)</th>
          <th title="Drink a surge with their first special attack">Surge</th><th title="Spec regens on Lightbearer (a regen every 25 ticks), then Ultor. A 95% start's regen after their first spec doesn't count as one">Lightbearer cycles</th><th title="${RANGE_POT_TIP.replace('prefires and ZCB specs', 'Ralos Specs, ZCB specs and blowpipe tick fixes')}">Range pot</th></tr>
        ${st.players.map((p, k) => `<tr><td class="rl">${esc(pname(k))}</td>
          <td><select data-p="${k}|startSpec"><option value="100" ${p.startSpec === 95 ? '' : 'selected'}>100</option><option value="95" ${p.startSpec === 95 ? 'selected' : ''}>95</option></select></td>
          <td style="text-align:center"><input type="checkbox" data-p="${k}|surge" ${p.surge ? 'checked' : ''}></td>
          <td><select data-p="${k}|lbCycles">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === Number(p.lbCycles || 0) ? 'selected' : ''}>${n || 'None'}</option>`).join('')}</select></td><td>${rangePotCell('xpot', k, p.rangePot)}</td></tr>`).join('')}</table></div>`)}
      ${blk(1, 'Opening Defence specs', `<p class="muted small">One each, or None. An Elder maul goes on their first attack; a BGS or Ralos Spec after their first scythe - or, if anyone mauls again (step 2), once those mauls are in - and only if his Defence is above the Defence target. Horn (Soulflame horn, on the interact tick, 25% per other player): the caster and 1 or 2 others get a buff on their next melee hit - a maul / BGS can't miss, a scythe's first hitsplat can't miss. Other players' opening mauls get it first, then BGS openers, then the rest (ZCB users last).</p>
        <div class="scroll"><table class="bt"><tr><th></th><th>Opening spec</th><th>When</th><th title="Soulflame horn on the interact tick: how many other players get the buff, 25% each (needs a horn in the Gear tab)">Horn</th></tr>
        ${st.players.map((p, k) => `<tr><td class="rl">${esc(pname(k))}</td><td>${sel(k, 'open', OPENERS, p.open)}</td>
          <td class="muted small" style="text-align:left">${p.open === 'maul' ? `First attack (t${EXHUMED_TICKS[t] + 1})` : p.open === 'none' ? '-' : 'After their first scythe'}</td>
          <td><select data-p="${k}|horn" ${gp && gp[k] && gp[k].horn ? '' : 'disabled title="No Soulflame horn (Gear tab)"'}>${[[0, 'None'], [1, '1 other (25%)'], [2, '2 others (50%)']].map(([v, l]) => `<option value="${v}" ${v === hornN(p) ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}</table></div>`)}
      ${blk(2, 'Maul again if short', N ? `<p class="muted small">Once the ${N} opening maul${N === 1 ? ' is' : 's are'} in: who mauls, by how many landed (whether their own landed or not - and a player who didn't open with a maul can too, e.g. duos' 2:2). They maul on their next attack.</p>
        <div class="scroll"><table class="bt"><tr><th>Opening mauls</th>${st.players.map((_, k) => `<th>${esc(pname(k))}</th>`).join('')}</tr>
        ${Array.from({ length: N + 1 }, (_, n) => `<tr><td class="rl">${n} of ${N} land</td>${st.players.map((_, k) => `<td style="text-align:center"><input type="checkbox" data-rm="${n}|${k}" ${(st.remaul[n] || []).includes(k) ? 'checked' : ''} ${canDo(gearK(k), 'maul') ? '' : 'disabled title="No Elder maul or BGS (Gear tab)"'}></td>`).join('')}</tr>`).join('')}</table></div>`
        : '<p class="muted small">Nobody opens with a maul.</p>')}
      ${blk(3, 'Backups to a Defence target', `<p class="muted small">After the opening specs and any re-mauls (those always go first): these go one at a time, in list order. Each waits for the one before it to land (the next player scythes meanwhile) and goes only if his Defence is still above the target.
        <b>Back up right away</b>: when this many or fewer opening mauls landed, that backup goes as soon as the re-mauls have gone and their own opening spec is done. Otherwise, wait for the higher priority backup.
        If a backup can't get him to the target even with its best roll, the next one goes with it. A backup whose player hasn't the spec when its turn comes is passed over, and a maul backup is skipped once 2 mauls have landed (flat Defence reduction from there).</p>
        <div class="row" style="margin-bottom:6px;align-items:center"><label style="flex-direction:row;gap:8px;align-items:center">Defence target<select data-s="defTarget">${opt(DEF_TARGETS.map((x) => [x, x]), st.defTarget)}</select></label><span class="muted small">The solver tries ${DEF_TARGETS.join(', ')}.</span></div>
        ${st.backups.length ? `<div class="scroll"><table class="bt"><tr><th>#</th><th>Player</th><th>Spec</th><th>Back up right away if this many<br>or fewer opening mauls land</th><th></th></tr>
        ${st.backups.map((b, i) => `<tr><td>${i + 1}</td>
          <td><select data-bk="${i}|p" style="width:140px">${opt(st.players.map((_, k) => [k, pname(k)]), b.p)}</select></td>
          <td><select data-bk="${i}|spec" style="width:140px">${BACKUP_SPECS.map(([x, l]) => { const ok = canDo(gearK(b.p), x); return `<option value="${x}" ${x === b.spec ? 'selected' : ''} ${ok ? '' : 'disabled'}>${l}${ok ? '' : ' (not in Gear set)'}</option>`; }).join('')}</select></td>
          <td><select data-bk="${i}|now" style="width:90px" ${N ? '' : 'disabled'}>${opt(nowOpts, b.now)}</select></td>
          <td style="white-space:nowrap"><button class="ghost sm" data-bkup="${i}" ${i ? '' : 'disabled'} title="Move up">↑</button> <button class="ghost sm" data-bkdel="${i}" title="Remove">✕</button></td></tr>`).join('')}</table></div>` : '<p class="muted small">No backups.</p>'}
        <button class="ghost sm" data-bkadd>+ Add backup</button>`)}
      <p class="muted small" style="margin:0 0 6px">Each player does at most ${cap} Defence specs (opening, maul again, backups)${t === 1 ? '' : ' - 3 in solos'} - so a player who mauls again skips their backup. A spec they don't have in the Gear set is skipped.</p>
      ${blk(4, 'Damage specs and tick fixes', `<div class="row" style="align-items:flex-start;gap:24px"><div class="scroll"><table class="bt"><tr><th></th>
          <th title="After their own Defence specs, as often as their spec allows. ZCB: held for the screech (see the right) or once the mauls are settled. Claws: once no Defence spec is still to come">Damage spec</th>
          <th title="If their scythe (or ZCB) would go off on the i3 before the screech: lose tick(s) (scythe, next attack 6 ticks later - 7 a quarter of the time: they lose 1 tick 75% of the time, 2 ticks 25%), an Eye of ayak hit (3 ticks - their magic gear), a blowpipe hit (2 - Rigour, quiver, gloves, necklace), a claw spec or a claw scratch (4 ticks)">Tick fix at the screech</th></tr>
        ${st.players.map((p, k) => `<tr><td class="rl">${esc(pname(k))}</td><td>${sel(k, 'dps', DPS_SPECS, p.dps, 120)}</td><td>${sel(k, 'fix', FIXES, p.fix, 200)}</td></tr>`).join('')}</table></div>
        <div style="max-width:420px">${pick()} style="color:var(--ink)"><input type="checkbox" data-s="zcbAsap" ${st.zcbAsap ? 'checked' : ''}>ZCB As Soon As Available</label>
          <p class="muted small" style="margin:4px 0 10px">Everyone (all or nothing): each ZCB goes on their first attack with 75% spec once their own Defence specs are done - no waiting on the mauls or the screech. Overrides Hold ZCBs.</p>
          ${pick()} style="color:var(--ink)${st.zcbAsap ? ';opacity:.5' : ''}"><input type="checkbox" data-s="holdZcb" ${st.holdZcb ? 'checked' : ''} ${st.zcbAsap ? 'disabled' : ''}>Hold ZCBs for the screech</label>
          <p class="muted small" style="margin:4px 0 10px">Players with ZCB hold it until the screech, then fire on their first attack from it - nobody waits for anyone else, so no ticks are lost. Off: they ZCB once the mauls are in.</p>
          <label title="A planned ZCB becomes claws (if they have them) once his HP is below this - the ruby is 22% of his HP (max 110), so it's worth less than a claw spec and the tick it gains by then">ZCB → claws below (HP)<input data-s="zcbBelow" type="number" min="0" step="50" value="${esc(st.zcbBelow)}" style="width:80px"></label>
          <p class="muted small" style="margin:6px 0 10px">A Claw spec tick fix goes before their ZCB.</p>
          <div class="row" style="gap:10px;align-items:center">${pick()} style="color:var(--ink)"><input type="checkbox" data-s="chally" ${st.chally ? 'checked' : ''}>Chally last hit</label>
            <label style="flex-direction:row;gap:6px;align-items:center">at or below<select data-s="challyAt" ${st.chally ? '' : 'disabled'}>${opt(CHALLY_ATS.map((x) => [x, `${x}%`]), st.challyAt)}</select>of his starting HP</label></div>
          <p class="muted small" style="margin:4px 0 0">Once he's there, a player who'd scythe halberds instead (30%, Crystal halberd in the Gear tab). One with a horn and 25-29% horns instead - their swing and the next other attacker's can't miss. Mostly worth it in solos and duos.</p></div></div>`)}`;
  }
  host.querySelector('[data-settabs]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set]'); if (!b) return;
    const r = rootState(); r.cur = b.dataset.set; r.sets[r.cur] ||= { ...blankSet(), gearSet: cur().gearSet }; setMsg = ''; persist(); refreshAll();
  });
  cfg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const r = rootState(), t = team();
    if (b.dataset.bkadd != null || b.dataset.bkdel != null || b.dataset.bkup != null) {
      const st = cur(), B = st.backups;
      if (b.dataset.bkadd != null) { const k = st.players.findIndex((p, j) => !B.some((x) => x.p === j) && p.open !== 'maul'); B.push({ p: k < 0 ? 0 : k, spec: 'ralos', now: -1 }); }
      else if (b.dataset.bkdel != null) B.splice(Number(b.dataset.bkdel), 1);
      else { const i = Number(b.dataset.bkup); [B[i - 1], B[i]] = [B[i], B[i - 1]]; }
      persist(); render(); return;
    }
    if (b.dataset.clearset != null) {
      if (!confirm(`Clear set ${r.cur}? Its players and room settings go back to the default plan (its Gear set stays).`)) return;
      r.sets[r.cur] = { ...blankSet(), gearSet: cur().gearSet }; setMsg = `Set ${r.cur} cleared.`; persist(); refreshAll(); return;
    }
    if (b.dataset.copyset) { const k = b.dataset.copyset; r.sets[k] = structuredClone(cur()); const rp = repState(); if (!rp.sets.includes(k)) rp.sets = SETS.filter((x) => x === k || rp.sets.includes(x)); setMsg = `Copied set ${r.cur} to set ${k}.`; persist(); refreshAll(); return; }
    const act = b.dataset.setact; if (!act) return;
    const list = (saved[t] ||= []);
    if (act === 'save') {
      const name = (cfg.querySelector('[data-saved="name"]').value || '').trim() || list.find((x) => x.id === savedPick)?.name || '';
      if (!name) { setMsg = 'Type a name for the set first.'; render(); return; }
      const old = list.find((x) => x.name === name), entry = { id: old ? old.id : `s${Date.now()}`, name, saved: Date.now(), set: structuredClone(cur()) };
      if (old) Object.assign(old, entry); else list.push(entry);
      savedPick = entry.id; setMsg = saveKey(SAVED, saved) ? `Saved "${name}".` : 'Could not save (browser storage is off).';
    } else if (act === 'load' || act === 'del') {
      const x = list.find((y) => y.id === savedPick); if (!x) return;
      if (act === 'load') { r.sets[r.cur] = structuredClone(x.set); persist(); setMsg = `Loaded "${x.name}" into set ${r.cur}.`; refreshAll(); return; }
      saved[t] = list.filter((y) => y !== x); savedPick = ''; saveKey(SAVED, saved); setMsg = `Deleted "${x.name}".`;
    } else if (act === 'file') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', kind: 'xarpusSet', team: t, set: cur() }, null, 1)], { type: 'application/json' }));
      a.download = `xarpus_${t}man_set.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    render();
  });
  cfg.addEventListener('change', async (e) => {
    const el = e.target, st = cur();
    if (el.dataset.saved === 'pick') { savedPick = el.value; setMsg = ''; render(); return; }
    if (el.dataset.saved === 'file') {
      try {
        const j = JSON.parse(await el.files[0].text());
        if (j.kind !== 'xarpusSet' || !j.set) throw new Error('not a saved Xarpus set');
        if (Number(j.team) !== team()) throw new Error(`it's a ${j.team}-man set - pick that scale first`);
        const r = rootState(); r.sets[r.cur] = j.set; persist(); setMsg = `Opened ${el.files[0].name} into set ${r.cur}.`; refreshAll();
      } catch (x) { setMsg = `Couldn't open that file: ${x.message}`; render(); }
      return;
    }
    if (el.dataset.s) {
      const k = el.dataset.s;
      if (el.type === 'checkbox') st[k] = el.checked;
      else if (k === 'gearSet') st[k] = el.value;
      else if (k === 'defTarget' || k === 'challyAt') st[k] = Number(el.value);
      else st[k] = Math.max(0, Math.trunc(Number(el.value) || 0));
      persist(); render(); return;
    }
    if (el.dataset.xpot != null || el.dataset.xpotkind != null) { const p = st.players[Number(el.dataset.xpot ?? el.dataset.xpotkind)]; p.rangePot = rangePotFrom(el, el.dataset.xpotkind != null, p.rangePot); persist(); render(); showSol(); return; }
    if (el.dataset.p) {
      const [k, key] = el.dataset.p.split('|'), p = st.players[Number(k)];
      p[key] = el.type === 'checkbox' ? el.checked : key === 'horn' ? (el.value === '2' ? 2 : el.value === '1') : ['startSpec', 'lbCycles'].includes(key) ? Number(el.value) : el.value;
      if (key === 'open') normalizePlan(st);
      persist(); render(); return;
    }
    if (el.dataset.rm) {
      const [n, k] = el.dataset.rm.split('|').map(Number), list = (st.remaul[n] ||= []);
      st.remaul[n] = el.checked ? [...new Set([...list, k])].sort((a, b) => a - b) : list.filter((x) => x !== k);
      persist(); render(); return;
    }
    if (el.dataset.bk) {
      const [i, f] = el.dataset.bk.split('|'), b = st.backups[Number(i)];
      b[f] = f === 'spec' ? el.value : Number(el.value);
      persist(); render();
    }
  });

  /** The players for the engine: gear from the set's Gear set + the room settings. */
  const playersNow = (st) => { const gp = gearOf(st); return st.players.map((p, k) => ({ ...p, name: (gp && gp[k] && gp[k].name) || `Player ${k + 1}`, gear: (gp && gp[k]) || blankPlayer(k) })); };
  const optsOf = (st) => ({ heals: Number(st.heals) || 0, exactHeals: !!st.exactHeals, defTarget: Number(st.defTarget) || 20, remaul: st.remaul, backups: st.backups, holdZcb: !!st.holdZcb, zcbAsap: !!st.zcbAsap, chally: !!st.chally, challyAt: Number(st.challyAt) || 5, zcbBelow: Number(st.zcbBelow ?? ZCB_BELOW) });

  // ---------------------------------------------------------------- report
  const repState = () => { const r = rootState(); r.report ||= { raids: 5000, seed: '', bps: '' }; r.report.sets ||= ['A']; r.report.labels ||= {}; return r.report; };
  const $r = (k) => rep.querySelector(`[data-r="${k}"]`);
  const showRep = () => {
    const r = repState(), rs = rootState();
    for (const k of ['raids', 'seed', 'bps']) $r(k).value = r[k];
    rep.querySelector('[data-rsets]').innerHTML = `<div class="muted small">Sets to run (compared on the same raids)</div><div class="row" style="gap:8px">${SETS.map((k) => `<label class="pick" style="flex-direction:row;gap:4px;align-items:center" data-setcol="${k}"><input type="checkbox" data-rset-run="${k}" ${rs.sets[k] ? '' : 'disabled'} ${rs.sets[k] && r.sets.includes(k) ? 'checked' : ''}>${k}</label><input data-rlabel="${k}" placeholder="Set ${k} label" value="${esc(r.labels[k] || '')}" style="width:110px" ${rs.sets[k] ? '' : 'disabled'}>`).join('')}</div>`;
  };
  rep.addEventListener('change', (e) => {
    const r = repState(), el = e.target;
    if (el.dataset.r) r[el.dataset.r] = el.dataset.r === 'raids' ? Number(el.value) || 5000 : el.value;
    if (el.dataset.rsetRun) { const k = el.dataset.rsetRun; r.sets = SETS.filter((x) => (x === k ? el.checked : r.sets.includes(x))); }
    if (el.dataset.rlabel) r.labels[el.dataset.rlabel] = el.value;
    persist();
  });
  let job = null, lastPage = null;
  rep.addEventListener('click', (e) => {
    const a = e.target.dataset.act; if (!a) return;
    const btn = (x) => rep.querySelector(`[data-act="${x}"]`), status = rep.querySelector('[data-rstatus]'), err = rep.querySelector('[data-rerr]'), out = rep.querySelector('[data-rout]');
    if (a === 'stop') { if (job) job.stop = true; return; }
    if (a === 'dl' && lastPage) {
      const url = URL.createObjectURL(new Blob([lastPage], { type: 'text/html' })), el = document.createElement('a');
      el.href = url; el.download = `xarpus-${team()}man-report.html`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (a !== 'run' || job) return;
    const r = repState(); err.textContent = '';
    let bps = []; try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const keys = r.sets.filter((k) => setOf(k)); if (!keys.length) { err.textContent = 'Tick at least one set to run.'; return; }
    const n = Math.max(100, Number(r.raids) || 5000), t = team(), seed = String(r.seed || '').trim() || `x${Date.now()}`;
    const runs = keys.map((k) => { const st = setOf(k); return { players: playersNow(st), opts: optsOf(st), res: newXarpusResult() }; });
    const labels = keys.map((k) => (r.labels[k] || '').trim() || `Set ${k}`);
    job = { stop: false }; const me = job; btn('run').disabled = true; btn('stop').disabled = false;
    let i = 0;
    const step = () => {
      if (me.stop || i >= n) {
        job = null; btn('run').disabled = false; btn('stop').disabled = true;
        if (!runs[0].res.runs) { status.textContent = 'Stopped.'; return; }
        const opts = { breakpoints: bps, labels }, all = runs.map((x) => x.res);
        out.innerHTML = xarpusReportHtml(all, t, opts); lastPage = xarpusReportPage(all, t, opts); btn('dl').disabled = false;
        // Show raid, per set: the raids just played (replayed from their seed)
        out.insertAdjacentHTML('beforeend', `<div class="vz-report" style="margin-top:10px">${runs.map((x, j) => `<div style="margin-bottom:6px">${runs.length > 1 ? `<b>${esc(labels[j])}</b>` : ''}<div data-xrepraids="${j}"></div></div>`).join('')}</div>`);
        runs.forEach((x, j) => reportRaids(out.querySelector(`[data-xrepraids="${j}"]`), { run: { players: x.players, opts: x.opts }, names: x.players.map((q, k) => q.name || `Player ${k + 1}`) }, bps, { seed, n: x.res.runs }));
        status.textContent = `${me.stop ? 'Stopped at' : 'Done:'} ${runs[0].res.runs.toLocaleString()} raids${runs.length > 1 ? ' per set' : ''} (seed ${seed}).`;
        return;
      }
      const to = Math.min(n, i + Math.max(25, Math.floor(200 / runs.length)));
      try { for (const x of runs) addXarpusRaids(x.res, x.players, t, i, to, { seed, ...x.opts }); } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      i = to; status.textContent = `Running... ${i.toLocaleString()} / ${n.toLocaleString()} raids${runs.length > 1 ? ` (${runs.length} sets)` : ''}`;
      whenFree(() => setTimeout(step, 0));   // paused: the next step waits for resume
    };
    step();
  });

  // ---------------------------------------------------------------- solver: each ticked set solved from its own setup
  const sol = host.querySelector('[data-solve]');
  const ALLOW = ['def', 'dps', 'fix', 'start', 'lb', 'surge', 'horn', 'defTarget', 'zcbBelow', 'chally'];
  const EFFORT = { quick: { rounds: 4, stages: [[40, 0.15], [150, 3], [600, 1]], finalRaids: 1000 },
    normal: { rounds: 8, stages: [[60, 0.2], [240, 4], [1000, 1]], finalRaids: 2000 },
    thorough: { rounds: 14, stages: [[100, 0.25], [400, 5], [2000, 1]], finalRaids: 5000 } };
  const setLabel = (k) => { const l = String((repState().labels || {})[k] || '').trim(); return l ? `Set ${k}: ${l}` : `Set ${k}`; };
  const solState = () => { const r = rootState(); r.solve ||= { bps: '', effort: 'normal', allow: Object.fromEntries(ALLOW.map((k) => [k, k !== 'surge'])), search: { swaps: true, roles: true, restarts: false } }; r.solve.sets ||= [r.cur]; if (r.solve.allow.defTarget == null) r.solve.allow.defTarget = r.solve.allow.defStop !== false; if (r.solve.allow.chally == null) r.solve.allow.chally = team() <= 3; return r.solve; };
  const showSol = () => {
    const v = solState(), rs = rootState();
    sol.querySelector('[data-vsets]').innerHTML = setPicker((k) => !!rs.sets[k], v.sets, setLabel);
    sol.querySelector('[data-v="bps"]').value = v.bps; sol.querySelector('[data-v="effort"]').value = v.effort;
    for (const k of ALLOW) sol.querySelector(`[data-va="${k}"]`).checked = !!v.allow[k];
    for (const k of ['swaps', 'roles', 'restarts']) sol.querySelector(`[data-vs="${k}"]`).checked = k === 'roles' ? (v.search || {}).roles !== false : !!(v.search || {})[k];
    // Range pots (not searched - the same setting as in each set's Players table above, shown here for the sets to solve)
    const ks = (v.sets || []).filter((k) => rs.sets[k]), names = playersNow(cur()).map((p) => p.name);
    sol.querySelector('[data-vpots]').innerHTML = ks.length ? `<div class="muted small">Range pot (kept as set - not searched; the same setting as in the Players table above)</div>
      <div class="scroll"><table class="bt"><tr><th></th>${names.map((n) => `<th>${esc(n)}</th>`).join('')}</tr>${ks.map((k) => `<tr><td class="rl">${esc(setLabel(k))}</td>${setOf(k).players.map((p, j) => `<td>${rangePotCell('vpot', `${k}|${j}`, p.rangePot)}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
  };
  sol.addEventListener('change', (e) => {
    const v = solState(), el = e.target;
    if (el.dataset.vpot != null || el.dataset.vpotkind != null) {
      const [k, j] = String(el.dataset.vpot ?? el.dataset.vpotkind).split('|'), p = setOf(k).players[Number(j)];
      p.rangePot = rangePotFrom(el, el.dataset.vpotkind != null, p.rangePot); persist(); render(); showSol(); return;
    }
    if (el.dataset.runset) { v.sets = pickSets(v.sets, el); persist(); showSol(); return; }
    else if (el.dataset.v) v[el.dataset.v] = el.value;
    else if (el.dataset.va) v.allow[el.dataset.va] = el.checked;
    else if (el.dataset.vs) { v.search ||= {}; v.search[el.dataset.vs] = el.checked; }
    else return;
    persist();
  });
  let vjob = null, vresults = null, vcombine = false, vflat = [];
  const vopen = {};
  const fsec = (x) => { const s2 = x * 0.6; return s2 >= 60 ? `${Math.floor(s2 / 60)}:${(s2 % 60).toFixed(1).padStart(4, '0')}` : `${s2.toFixed(1)}s`; };
  const fsB = (b) => { const r = Math.round(b % 60 * 10) / 10; return `${Math.floor(b / 60)}:${r < 10 ? '0' : ''}${r}`; };
  const lab = (list, v) => (list.find((x) => x[0] === v) || [v, v])[1];
  /** A setup laid out: the players, who mauls again, the backups, the rest. */
  /** stats (once its raids are played): per player, the share of raids each spec / tick fix went off in - shown beside
   *  the plan, so a plan that can't happen (a ZCB they never have 75% for) says what they did instead. */
  const procHtml = (r, stats = null) => {
    const c = r.cfg, m = openMaulers(c.players), nm = (k) => esc(r.names[k]);
    // who an interact horn buffs (as the engine picks): other opening mauls, then BGS openers, then the rest (ZCB users last)
    const hornWho = (c, k) => { const n = hornN(c.players[k]); if (!n) return '-'; const rank = (j) => (c.players[j].open === 'maul' ? 0 : c.players[j].open === 'bgs' ? 1 : c.players[j].dps === 'zcb' ? 3 : 2);
      return `${nm(k)} + ${c.players.map((_, j) => j).filter((j) => j !== k).sort((a, b) => rank(a) - rank(b)).slice(0, n).map(nm).join(', ')} (${25 * n}%)`; };
    const pct = (n) => `${Math.round(n * 100)}%`, KIND = { maul: 'maul', bgs: 'BGS', ralos: 'Ralos', zcb: 'ZCB', claw: 'claws', halb: 'halberd', horn: 'horn' };
    const did = (k, kinds) => { if (!stats) return ''; const x = stats[k], parts = kinds.filter((q) => x.spec[q]).map((q) => `${KIND[q]} ${pct(x.spec[q] / stats.n)}`);
      return `<div class="muted" style="font-size:11px">in raids: ${parts.join(' · ') || 'none'}</div>`; };
    const dmgCell = (p, k) => {
      if (!stats) return lab(DPS_SPECS, p.dps);
      const x = stats[k], zcb = (x.spec.zcb || 0) / stats.n, cl = (x.spec.claw || 0) / stats.n;
      if (p.dps === 'zcb' && zcb < 0.01) return `${cl >= 0.01 ? 'Claws' : 'None'} <span class="muted" style="font-size:11px">(ZCB planned - never 75% spec in time)</span>${did(k, ['claw'])}`;
      return `${lab(DPS_SPECS, p.dps)}${did(k, ['zcb', 'claw', 'halb'])}`;
    };
    const fixCell = (p, k) => {
      if (!stats) return lab(FIXES, p.fix);
      const f = stats[k].fix, tot = Object.values(f).reduce((a, b) => a + b, 0);
      return `${lab(FIXES, p.fix)}${tot ? `<div class="muted" style="font-size:11px">in raids: ${Object.entries(f).map(([q, n]) => `${{ tick: 'lose tick(s)', scratch: 'claw scratch', claw: 'claw spec', bp: 'blowpipe', ayak: 'Ayak' }[q] || q} ${pct(n / stats.n)}`).join(' · ')}</div>` : ''}`;
    };
    const re = m.length ? Array.from({ length: m.length + 1 }, (_, n) => `${n} land: ${(c.remaul[n] || []).map(nm).join(', ') || 'nobody'}`).join(' · ') : 'nobody opens with a maul';
    const bk = (c.backups || []).map((b, i) => `${i + 1}. ${nm(b.p)} ${lab(BACKUP_SPECS, b.spec)}${b.now >= 0 ? ` (right away if ${b.now} or fewer land)` : ''}`).join(' → ') || 'none';
    return `<div class="small">Maul again - ${re}</div><div class="small">Backups (Defence target ${c.defTarget}): ${bk}</div>
      <div class="small">ZCBs ${c.zcbAsap ? 'as soon as available' : c.holdZcb ? 'held for the screech' : 'once the mauls are in'} · ZCB → claws below ${c.zcbBelow} HP · ${c.chally ? `Chally last hit at ${c.challyAt}%` : 'no Chally last hit'}</div>
      <table style="margin-top:4px"><tr><th>Player</th><th>Start</th><th>Surge</th><th>Lightbearer</th><th>Opening spec</th><th>Damage spec</th><th>Tick fix</th><th>Horn</th></tr>
      ${c.players.map((p, k) => `<tr><td>${nm(k)}</td><td>${p.startSpec}%</td><td>${p.surge ? 'yes' : '-'}</td><td>${p.lbCycles ? `${p.lbCycles} cycles` : '-'}</td><td>${lab(OPENERS, p.open)}${did(k, ['maul', 'bgs', 'ralos'])}</td><td>${dmgCell(p, k)}</td><td>${fixCell(p, k)}</td><td>${hornWho(c, k)}</td></tr>`).join('')}</table>`;
  };
  // ---- Show raid: a setup's raids (played once, 2,000 of them), its timeline for the fastest / Top 10% / ... / median /
  // slowest and breakpoints, and an example raid for each number of opening mauls landed
  const X_RAIDS = 2000, X_SEED = 'xshow';
  const xflat = [];
  const X_LEGEND = 'Elder maul / BGS / Ralos Spec: hover for his Defence before and after · ZCB: the ruby (red outline) · claw scratch / blowpipe / Ayak: a tick fix · thrall icon (bottom right): a thrall hit · white outline: a spec regen · his row: his attack at the start of each cycle (from the second cycle after the exhumeds), then after the screech (one action skipped) a turn every two cycles (green), ☠ he dies';
  /** The Show raid bar for a setup r ({run: {players, opts}, names}); filled once its raids are played (fillXBar). */
  function xBar(r, bps = [], withProc = false, { seed = X_SEED, n = X_RAIDS } = {}) {   // seed / n: a report's own raids
    const idx = xflat.push({ r, bps, seed, n }) - 1;
    return `${withProc ? `<div data-xproc="${idx}">${procHtml(r)}</div>` : ''}<div class="small" style="margin-top:8px" data-xbar="${idx}"><span class="muted">Show raid: playing ${n.toLocaleString()} raids...</span></div><span class="muted small" data-xraidmsg="${idx}"></span><div style="width:0;min-width:100%"><div data-xraidout="${idx}"></div></div>`;
  }
  async function xPlay(x) {
    if (x.all) return x.all;
    const { players, opts } = x.r.run, all = [], t = team();
    const stats = { n: x.n, ...players.map(() => ({ spec: {}, fix: {} })) };
    for (let i = 0; i < x.n; i++) {
      const res = runXarpus(players, t, new Rng(`${x.seed}#${i}`), null, opts);
      for (const [k, kinds] of players.map((_, k) => [k, new Set(res.specLog.filter((z) => z.i === k).map((z) => z.kind))])) for (const q of kinds) stats[k].spec[q] = (stats[k].spec[q] || 0) + 1;
      for (const [k, fx2] of players.map((_, k) => [k, new Set(res.fixes.filter((z) => z.i === k).map((z) => z.fix))])) for (const q of fx2) stats[k].fix[q] = (stats[k].fix[q] || 0) + 1;
      all.push({ i, total: res.end, key: res.end == null ? '' : `${(res.dropAt ?? res.kill) - EXHUMED_TICKS[t]},${res.end - (res.dropAt ?? res.kill)}`, open: res.openLanded, nOpen: res.openMaulers });
      if (i % 200 === 199) await breath();
    }
    x.stats = stats;
    return (x.all = all);
  }
  async function fillXBar(el) {
    if (el.dataset.filled) return; el.dataset.filled = '1';
    const idx = Number(el.dataset.xbar), x = xflat[idx], all = await xPlay(x), ok = all.filter((z) => z.total != null), fails = all.length - ok.length;
    const pe = document.querySelector(`[data-xproc="${idx}"]`); if (pe) pe.innerHTML = procHtml(x.r, x.stats);
    const nOpen = all[0] ? all[0].nOpen : 0, pc = (n) => `${(n / all.length * 100).toFixed(n / all.length < 0.1 ? 1 : 0)}%`;
    const by = Array.from({ length: nOpen + 1 }, (_, n) => all.filter((z) => z.open === n).length);
    el.innerHTML = `<div class="row wrap" style="gap:6px;align-items:center"><b>Show raid</b>
        <button class="ghost sm" data-xraid="${idx}|succ" title="Opens on the median raid; Previous / Next step through fastest, top 10%, top 25%, median, slowest and your breakpoints">View successful raids</button>
        ${fails ? `<button class="ghost sm" data-xraid="${idx}|fail">View failed raids (${pc(fails)})</button>` : ''}</div>
      ${nOpen ? `<div style="margin-top:4px">Opening mauls landed (of ${x.n.toLocaleString()} raids): ${by.map((n, k) => (n ? `<b>${k}</b> ${pc(n)} <button class="ghost sm" style="padding:0 6px;font-size:11px" data-xex="${idx}|${k}" title="The median raid where ${k} of the opening mauls landed">example</button>` : null)).filter(Boolean).join(' · ')}</div>` : ''}`;
  }
  const xDraw = (x, i, title) => {
    const { players, opts } = x.r.run, trace = [], res = runXarpus(players, team(), new Rng(`${x.seed}#${i}`), null, { ...opts, trace });
    return timelineHtml({ trace, names: x.r.names || players.map((p, k) => p.name || `Player ${k + 1}`), bossName: 'Xarpus', end: res.end, title, legend: X_LEGEND, from: EXHUMED_TICKS[team()] });
  };
  async function showXRaid(b) {
    const [idx, mode] = (b.dataset.xraid || b.dataset.xex).split('|'), x = xflat[Number(idx)]; if (!x) return;
    const box = document.querySelector(`[data-xraidout="${idx}"]`), all = await xPlay(x), ok = all.filter((z) => z.total != null), N = all.length;
    if (b.dataset.xex) {
      const k = Number(mode), sub = ok.filter((z) => z.open === k), pk = pickRaid(sub, sub.length, 'median');
      box.innerHTML = pk ? xDraw(x, pk.i, `Example: ${k} opening maul${k === 1 ? '' : 's'} landed (Xarpus) - ${fsec(pk.total)} · the median of the ${sub.length.toLocaleString()} raids where this happened`) : '<p class="muted small">No raid like that.</p>';
      box.scrollIntoView({ block: 'nearest' }); return;
    }
    if (mode === 'succ') {
      const steps = successSteps(ok, N, N, x.bps);
      raidNav(box, steps, steps.findIndex((z) => /Median/.test(z.label)), (st) => xDraw(x, st.pick.i, `${st.label} raid (Xarpus) - ${fsec(st.pick.total)} · ${st.freq}`));
      return;
    }
    const fl = all.filter((z) => z.total == null).map((z) => ({ ...z, prog: z.i }));
    if (!fl.length) { box.innerHTML = '<p class="muted small">No failed raids.</p>'; return; }
    raidNav(box, failSteps(fl), 0, (st) => xDraw(x, st.f.i, `${st.label} raid (Xarpus) - didn't finish`));
  }
  /** Full raid tab: a setup's procedure with Show raid, into `el` (its own clicks). r: {cfg, names, run: {players, opts}}. */
  /** A report's Show raid (its own raids replayed: seed / n), into `el` (its own clicks). r: {run: {players, opts}, names}. */
  function reportRaids(el, r, bps = [], { seed, n }) {
    el.innerHTML = xBar(r, bps, false, { seed, n });
    el.querySelectorAll('[data-xbar]').forEach(fillXBar);
    if (!el.dataset.wired) { el.dataset.wired = '1'; el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && (b.dataset.xraid || b.dataset.xex)) showXRaid(b); }); }
  }
  function procedure(el, r, bps = []) {
    el.innerHTML = xBar(r, bps, true);
    el.querySelectorAll('[data-xbar]').forEach(fillXBar);
    if (!el.dataset.wired) { el.dataset.wired = '1'; el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && (b.dataset.xraid || b.dataset.xex)) showXRaid(b); }); }
  }
  const showResults = () => {
    const out = sol.querySelector('[data-vout]');
    if (!vresults || !vresults.groups.some((g) => g.items.length)) { out.innerHTML = ''; return; }
    const { groups, bps, t } = vresults, asc = [...bps].sort((a, b) => a - b);
    const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const ft = (x) => (x == null || Number.isNaN(x) ? '-' : x >= 99999 ? 'failed' : fsec(x));
    vflat = [];
    const table = (rows, withSet) => `<div class="scroll"><table class="sortlist"><tr><th>#</th>${withSet ? '<th>Set</th>' : ''}<th>Median</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th>To the screech</th><th>Screech to the end</th><th>Defence left</th><th></th></tr>
      ${rows.map((r, i) => { const v = r.totals.slice().sort((a, b) => a - b), idx = vflat.push(r) - 1, EXH = EXHUMED_TICKS[t];
        return `<tr${i === 0 ? ' style="font-weight:700"' : ''}><td>${i + 1}</td>${withSet ? `<td data-setcol="${r.set}" style="color:var(--c);font-weight:700">${esc(setLabel(r.set))}</td>` : ''}<td>${ft(v[v.length >> 1])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.1) - 1)])}</td><td>${ft(v[0])}</td>${asc.map((b) => `<td>${(v.filter((x) => x * 0.6 <= b + 1e-9).length / v.length * 100).toFixed(1)}%</td>`).join('')}<td>${ft(med(r.split.toScreech) - EXH)}</td><td>${ft(med(r.split.kill))}</td><td>${r.defEnd.length ? (r.defEnd.reduce((a, b) => a + b, 0) / r.defEnd.length).toFixed(1) : '-'}</td>
          <td style="white-space:nowrap"><button class="ghost sm" data-vshow="${idx}">Procedure</button> ${SETS.map((k) => `<button class="ghost sm" data-vuse="${idx}" data-to="${k}" title="Put this setup into set ${k}${rootState().sets[k] ? '' : ` - a new set, from set ${r.set}`}">Copy to set ${k}</button>`).join(' ')}</td></tr>
        <tr class="sub-row" data-vproc="${idx}" hidden><td colspan="${9 + asc.length + (withSet ? 1 : 0)}" style="text-align:left">
          ${r.run ? xBar(r, bps, true) : procHtml(r)}</td></tr>`; }).join('')}
      </table></div>`;
    const all = groups.flatMap((g) => g.items);
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${t}-man Xarpus: solver</h3>
      <div class="sub">Each played on the same ${all[0].totals.length.toLocaleString()} raids${groups.length > 1 ? ' (every set on the same raids, so sets compare fairly)' : ''}. Times: median.</div>
      ${setResultsHtml(groups, { combine: vcombine, table, open: vopen, better: (a, b) => scoreBetter(a.score, b.score) })}</div>`;
  };
  wireSetResults(sol.querySelector('[data-vout]'), vopen, (c) => { vcombine = c; showResults(); });
  const PLAN = ['startSpec', 'surge', 'lbCycles', 'open', 'dps', 'fix', 'horn'];
  sol.addEventListener('click', async (e) => {
    const el = e.target, status = sol.querySelector('[data-vstatus]'), err = sol.querySelector('[data-verr]'), vbtn = (a) => sol.querySelector(`[data-vact="${a}"]`);
    if (el.dataset.vshow != null) { const row = sol.querySelector(`[data-vproc="${el.dataset.vshow}"]`); row.hidden = !row.hidden; if (!row.hidden) row.querySelectorAll('[data-xbar]').forEach(fillXBar); return; }
    if (el.dataset.xraid || el.dataset.xex) { showXRaid(el); return; }
    if (el.dataset.vuse != null) {
      const r = vflat[Number(el.dataset.vuse)]; if (!r) return;
      const k = el.dataset.to, rs = rootState();
      if (!rs.sets[k]) rs.sets[k] = structuredClone(setOf(r.set) || cur());
      const st = setOf(k), rp = repState(); if (!rp.sets.includes(k)) rp.sets = SETS.filter((x) => x === k || rp.sets.includes(x));
      r.cfg.players.forEach((p, j) => { for (const f of PLAN) st.players[j][f] = p[f]; });
      Object.assign(st, structuredClone({ remaul: r.cfg.remaul, backups: r.cfg.backups, defTarget: r.cfg.defTarget, holdZcb: r.cfg.holdZcb, zcbAsap: !!r.cfg.zcbAsap, chally: !!r.cfg.chally, challyAt: r.cfg.challyAt, zcbBelow: r.cfg.zcbBelow })); persist(); refreshAll();
      status.textContent = `Set ${r.set} setup copied into set ${k}.`; return;
    }
    const a = el.dataset.vact; if (!a) return;
    if (a === 'stop') { if (vjob) { vjob.stopped = true; if (vjob.pool) vjob.pool.stop(); } return; }
    if (a !== 'run' || vjob) return;
    const v = solState(); err.textContent = '';
    let bps = []; try { bps = String(v.bps || '').trim() ? parseBreakpoints(v.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const keys = v.sets.filter((k) => setOf(k)); if (!keys.length) { err.textContent = 'Tick at least one set to solve.'; return; }
    const t = team(), ef = EFFORT[v.effort] || EFFORT.normal, sr = v.search || {};
    vjob = { stopped: false, pool: null }; const me = vjob;
    vbtn('run').disabled = true; vbtn('stop').disabled = false;
    const t1 = activeNow(), groups = [];
    try {
      for (const [n, k] of keys.entries()) {
        if (me.stopped) break;
        const st = setOf(k), all = playersNow(st), pre = keys.length > 1 ? `Set ${k} (${n + 1} of ${keys.length}): ` : '';
        const base = all.map((p) => ({ name: p.name, gear: p.gear, rangePot: normRangePot(p.rangePot) })), names = all.map((p) => p.name);   // range pot: kept as set, not searched
        const planOf = (p) => Object.fromEntries(PLAN.map((f) => [f, f === 'startSpec' ? (p.startSpec === 95 ? 95 : 100) : f === 'lbCycles' ? Number(p.lbCycles || 0) : f === 'horn' ? (hornN(p) === 2 ? 2 : hornN(p) === 1) : f === 'surge' ? !!p[f] : p[f]]));
        const setPlan = (x) => normalizePlan({ players: x.players.map(planOf), remaul: structuredClone(x.remaul), backups: structuredClone(x.backups), defTarget: Number(x.defTarget) || 20, holdZcb: !!x.holdZcb, zcbAsap: !!x.zcbAsap, chally: !!x.chally, challyAt: Number(x.challyAt) || 5, zcbBelow: Number(st.zcbBelow ?? ZCB_BELOW) });
        const start = setPlan(st);
        const restarts = sr.restarts ? [setPlan(defaultXarpusPlan(t))] : [];
        me.pool = new XarpusPool(base, t, { heals: Number(st.heals) || 0, exactHeals: !!st.exactHeals });
        try {
          const items = await solveXarpus({ start, gear: all.map((p) => p.gear), allow: { ...v.allow }, surgeLimit: Number(st.surgeLimit) || 0, lbRings: Number(st.lbRings ?? t),
            swaps: !!sr.swaps, roles: sr.roles !== false, restarts, bps, ...ef, top: 10 }, (...args) => me.pool.run(...args),
          (txt) => { status.textContent = `${pre}${txt} (${Math.round((activeNow() - t1) / 1000)}s)`; }, () => me.stopped);
          groups.push({ k, label: setLabel(k), items: items.map((r) => ({ ...r, set: k, names, run: { players: base.map((b, j) => ({ ...b, ...r.cfg.players[j] })), opts: { heals: Number(st.heals) || 0, exactHeals: !!st.exactHeals, ...r.cfg } } })) });
        } finally { me.pool.stop(); }
        vresults = { groups: [...groups], bps, t }; showResults();
      }
      status.textContent = me.stopped ? 'Stopped.' : `Done in ${Math.round((activeNow() - t1) / 1000)}s.`;
    } catch (x) { status.textContent = me.stopped ? 'Stopped.' : ''; if (!me.stopped) err.textContent = `Couldn't solve: ${x.message}`; }
    finally { vjob = null; vbtn('run').disabled = false; vbtn('stop').disabled = true; }
  });

  /** Full raid: solve the current set with the Full raid's Gear set, Lightbearers and the surge cooldowns carried in
   *  (ticks per player). Returns the ranked setups, each with what a full raid needs to play it ({players, opts}). */
  async function fullRaidSolve({ gearSet: gs, lbRings, lbOwners = null, hornLimit = null, gearPatch = [], heals = HEALS_DEFAULT[team()], exactHeals = false, rangePots = [], surgeCd, mustSurge = null, bps = [], effort = 'normal', say = () => {}, stopped = () => false, onPool = () => {} }) {
    // the Full raid's own settings (nothing from this tab): the default plan, every option searched
    const t = team(), st = { ...blankSet(), gearSet: gs, heals, exactHeals };
    const all = playersNow(st).map((p, k) => ({ ...p, gear: { ...p.gear, ...(gearPatch[k] || {}) }, surgeCd: surgeCd[k] || 0 }));
    const base = all.map((p, k) => ({ name: p.name, gear: p.gear, surgeCd: p.surgeCd, rangePot: rangePots[k] != null ? normRangePot(rangePots[k]) : autoRangePot(st, k) })), names = all.map((p) => p.name);
    const planOf = (p) => Object.fromEntries(PLAN.map((f) => [f, f === 'startSpec' ? (p.startSpec === 95 ? 95 : 100) : f === 'lbCycles' ? Number(p.lbCycles || 0) : f === 'horn' ? (hornN(p) === 2 ? 2 : hornN(p) === 1) : f === 'surge' ? !!p[f] : p[f]]));
    const setPlan = (x) => normalizePlan({ players: x.players.map(planOf), remaul: structuredClone(x.remaul), backups: structuredClone(x.backups), defTarget: Number(x.defTarget) || 20, holdZcb: !!x.holdZcb, zcbAsap: !!x.zcbAsap, chally: !!x.chally, challyAt: Number(x.challyAt) || 5, zcbBelow: Number(st.zcbBelow ?? ZCB_BELOW) });
    // Lightbearers: only the players holding one this room (no trades), no more than the raid has; horns likewise
    const fit = (plan) => { let n = 0, h = 0; plan.players.forEach((p, k) => {
      if (p.lbCycles > 0) { if (n >= lbRings || (lbOwners && !lbOwners[k])) p.lbCycles = 0; else n++; }
      if (p.horn) { if (!all[k].gear.horn || (hornLimit != null && h >= hornLimit)) p.horn = false; else h++; }
    }); return plan; };
    const start = fit(setPlan(st)), hh = { heals: Number(heals) || 0, exactHeals: !!exactHeals };
    if (mustSurge) start.players.forEach((p, k) => { p.surge = mustSurge.includes(k); });   // a full raid plan's surgers: on throughout the search
    const pool = new XarpusPool(base, t, hh); onPool(pool);
    try {
      const allow = Object.fromEntries(ALLOW.map((k) => [k, k !== 'surge' || (t > 0 && !mustSurge)]));
      const groups = groupsOf(base.map((b, k) => JSON.stringify([{ ...b.gear, name: null }, b.surgeCd, b.rangePot, lbOwners ? !!lbOwners[k] : null])));   // (identical players: one key for their traded plans)
      const items = await solveXarpus({ start, gear: all.map((p) => p.gear), allow, surgeLimit: t, lbRings, lbOwners, hornLimit, swaps: true, roles: true, groups,
        restarts: [], bps, ...(EFFORT[effort] || EFFORT.normal), top: 10 }, (...args) => pool.run(...args), say, stopped);
      return items.map((r) => ({ ...r, set: rootState().cur, names, run: { players: base.map((b, k) => ({ ...b, ...r.cfg.players[k] })), opts: { ...hh, ...r.cfg } } }));
    } finally { pool.stop(); }
  }
  /** Full raid: show setups (best first) in this tab's Solver results. */
  const fullRaidShow = (items, bps) => { vresults = { groups: [{ k: rootState().cur, label: 'Full raid', items }], bps, t: team() }; showResults(); };
  function refreshAll() { render(); showRep(); showSol(); }
  return { refresh: () => { state = loadKey(store); saved = loadKey(SAVED); refreshAll(); }, api: { getSet: (k) => (setOf(k) ? structuredClone(setOf(k)) : null), putSet: (st) => { const r = rootState(); r.sets[r.cur] = structuredClone(st); persist(); refreshAll(); }, setupOf: (k) => { const st = setOf(k); return st ? { players: playersNow(st), opts: optsOf(st) } : null; }, curSet: () => rootState().cur, hasSet: (k) => !!rootState().sets[k], rootState, setOf, cur, playersNow, optsOf, team, persist, render: refreshAll, repState, fullRaidSolve, fullRaidShow, procHtml, procedure, reportRaids } };
}
