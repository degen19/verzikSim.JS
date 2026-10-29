// Xarpus tab: per-player room settings for every scale (sets A / B / C, saved in this browser or to a file), a Report
// comparing the ticked sets and the Solver. Gear comes from the Gear tab (the Gear set picked here).
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { blankPlayer } from './engine/loadout.js';
import { newXarpusResult, addXarpusRaids, xarpusReportHtml, xarpusReportPage } from './engine/xarpusreport.js';
import { parseBreakpoints } from './engine/optimize.js';
import { defaultXarpus, canDo, DEF_SPECS, DPS_SPECS, FIXES, DEF_STOP, ZCB_BELOW, HEALS_DEFAULT, HEALS_NOTE, HEAL, EXHUMED_HP, HEAL_SPREAD, XARPUS_HP, EXHUMED_TICKS } from './engine/xarpus.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';
import { setPicker, pickSets, setResultsHtml, wireSetResults } from './setresults.js';
import { solveXarpus, better as scoreBetter } from './engine/xarpussolve.js';
import { XarpusPool } from './xarpus-solver-pool.js';

const STORE = 'verzikSim.xarpus.v1';           // {team: {cur, sets: {A, B?, C?}, report, solve}}
const SAVED = 'verzikSim.xarpusSaved.v1';      // {team: [{id, name, saved, set}]}
const SETS = ['A', 'B', 'C'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadKey = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const pick = () => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"`;

export function createXarpus(host, { getTeam }) {
  let state = loadKey(STORE), saved = loadKey(SAVED), savedPick = '', setMsg = '';
  const persist = () => saveKey(STORE, state);
  const team = () => Number(getTeam()) || 4;
  host.innerHTML = `${settingsCard('Xarpus settings', '<div data-cfg></div>')}
    ${tabsHtml([['rep', 'Report'], ['solve', 'Solver']])}
    ${pane('rep', 'data-rep', `
      <div class="row" style="margin-top:10px">
        <label>Raids per set<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <div data-rsets></div>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-act="dl" class="ghost" disabled>Download report</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>
    `)}
    ${pane('solve', 'data-solve', `
      <p class="muted small" style="margin-top:8px">Searches for the best setup from the one above: each player's Defence spec (maul, BGS, Ralos Spec), backup,
        damage spec (claws, claws at the screech, ZCB), tick fix, start spec, Lightbearer cycles, surge and horn, and the Defence stop and ZCB → claws HP -
        within the Surge potions / Lightbearers limits and the gear each player has. Each round it tries every single change (with Swaps: also two
        players' Defence or damage specs swapped, a Lightbearer / surge moved) on a few raids, then the best on more, and keeps the best if it beats the
        current setup, until nothing does (Restarts: again from the default plan for the scale). The top setups are then played on more raids and ranked:
        with breakpoints by the share finished at the fastest one (then the next), otherwise by the median. Each ticked set is solved from its own setup.</p>
      <div class="row">
        <div data-vsets></div>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-v="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label>Effort<select data-v="effort"><option value="quick">Quick</option><option value="normal">Normal</option><option value="thorough">Thorough</option></select></label>
        <button data-vact="run">Solve</button><button data-vact="stop" class="ghost" disabled>Stop</button>
      </div>
      <div class="row" style="margin-top:6px">${[['def', 'Defence specs'], ['backup', 'Backups'], ['dps', 'Damage specs'], ['fix', 'Tick fixes'], ['start', 'Start spec'], ['lb', 'Lightbearer'], ['surge', 'Surges'], ['horn', 'Horns'], ['defStop', 'Defence stop'], ['zcbBelow', 'ZCB → claws HP']]
        .map(([k, l]) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-va="${k}">${l}</label>`).join('')}</div>
      <div class="row" style="margin-top:6px"><span class="muted small">Search:</span>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Also swap two players' Defence or damage specs, and move a Lightbearer / surge, in one step"><input type="checkbox" data-vs="swaps">Swaps</label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Search again from the default plan for the scale and keep the best of everything (about 2x the time)"><input type="checkbox" data-vs="restarts">Restarts</label></div>
      <div data-vstatus class="muted" style="margin-top:8px"></div><div data-verr class="err"></div><div data-vout style="margin-top:8px"></div>
    `)}`;
  wireSubtabs(host, 'verzikSim.xarpusTabs.v1');
  const cfg = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]');

  // per scale: {cur, sets, report, solve}
  const rootState = () => { const t = team(); state[t] ||= {}; const r = state[t]; r.sets ||= {}; r.cur ||= 'A'; if (!r.sets[r.cur]) r.cur = 'A'; return r; };
  const blankSet = () => ({ gearSet: 'A', heals: HEALS_DEFAULT[team()], exactHeals: false, defStop: DEF_STOP, zcbBelow: ZCB_BELOW, surgeLimit: 0, lbRings: team(), players: [] });
  const fixSet = (st) => {
    const t = team(), d = defaultXarpus(t), b = blankSet();
    for (const k of Object.keys(b)) if (st[k] == null) st[k] = b[k];
    st.players ||= [];
    for (let k = 0; k < t; k++) st.players[k] = { ...d[k] || d[0], ...(st.players[k] || {}) };
    st.players.length = t;
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
    const sel = (k, key, opts, v) => `<select data-p="${k}|${key}">${opts.map(([x, l]) => { const ok = canDo(gearK(k), x); return `<option value="${x}" ${x === v ? 'selected' : ''} ${ok ? '' : 'disabled'}>${l}${ok ? '' : ' (not in Gear set)'}</option>`; }).join('')}</select>`;
    const hp = EXHUMED_HP[t] + Math.max(0, Number(st.heals) || 0) * HEAL[t];
    const notes = [];
    const surgers = st.players.filter((p) => p.surge).length, lbers = st.players.filter((p) => Number(p.lbCycles || 0) > 0).length;
    if (surgers > Number(st.surgeLimit)) notes.push(`${surgers} players drink a surge, but only ${st.surgeLimit} surge potion${Number(st.surgeLimit) === 1 ? '' : 's'} can be used here.`);
    if (lbers > Number(st.lbRings)) notes.push(`${lbers} players wear Lightbearer, but there ${Number(st.lbRings) === 1 ? 'is' : 'are'} only ${st.lbRings} in the raid.`);
    const maulers = st.players.filter((p, k) => p.def === 'maul' && (canDo(gearK(k), 'maul') || canDo(gearK(k), 'bgs'))).length;
    if (!maulers) notes.push('Nobody mauls: Ralos / BGS players spec on their second attack.');
    st.players.forEach((p, k) => {
      for (const [key, v] of [['def', p.def], ['backup', p.backup], ['dps', p.dps], ['fix', p.fix]]) if (v && v !== 'none' && !canDo(gearK(k), v) && !(v === 'maul' && canDo(gearK(k), 'bgs'))) notes.push(`${pname(k)}: no ${({ def: 'weapon for their Defence spec', backup: 'weapon for their backup', dps: 'weapon for their damage spec', fix: 'weapon for their tick fix' })[key]} in this Gear set - ${key === 'fix' ? 'they lose a tick instead' : 'skipped'}.`);
      if (p.horn && !(gp && gp[k] && gp[k].horn)) notes.push(`${pname(k)}: no Soulflame horn (Gear tab) - no horn.`);
    });
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
        <label title="${esc(HEALS_NOTE)}. Each heal (a missed tick on an exhumed) gives him ${HEAL[t]} HP: ${EXHUMED_HP[t]} + heals x ${HEAL[t]} when players can attack.">Number of heals<input data-s="heals" type="number" min="0" step="1" value="${esc(st.heals)}" style="width:70px"></label>
        ${pick()} title="Every raid uses exactly this number of heals. Off: each raid is this number +- ${HEAL_SPREAD} (evenly, never below 0)"><input type="checkbox" data-s="exactHeals" ${st.exactHeals ? 'checked' : ''}>Exact heals (no +-${HEAL_SPREAD})</label>
        <label title="No more Defence specs (planned BGS / Ralos Spec, or backups) once his Defence is at or below this - damage specs instead. Mauls always go.">Defence stop<input data-s="defStop" type="number" min="0" max="250" value="${esc(st.defStop)}" style="width:70px"></label>
        <label title="Surge potions the team can use in this room (the solver won't use more). Most scales don't surge here.">Surge potions<select data-s="surgeLimit">${Array.from({ length: t + 1 }, (_, n) => `<option value="${n}" ${n === Number(st.surgeLimit) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label title="Lightbearer rings in the raid: no more players than this can wear one">Lightbearers<select data-s="lbRings">${Array.from({ length: t + 1 }, (_, n) => `<option value="${n}" ${n === Number(st.lbRings) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label title="A planned ZCB becomes claws (if they have them) once his HP is below this - the ruby is 22% of his HP (max 110), so it's worth less than a claw spec and the tick it gains by then">ZCB → claws below (HP)<input data-s="zcbBelow" type="number" min="0" step="50" value="${esc(st.zcbBelow)}" style="width:80px"></label>
      </div>
      <p class="muted small" style="margin:0 0 8px">${esc(HEALS_NOTE)}. At ${esc(st.heals)} heal${Number(st.heals) === 1 ? '' : 's'} he's on ${hp} HP when players can attack (base ${XARPUS_HP[t]}; screech at 25%: ${Math.floor(XARPUS_HP[t] * 0.25)}).</p>
      ${notes.map((x) => `<div class="warn small" style="margin-bottom:4px">${esc(x)}</div>`).join('')}
      <style>.xarp-cfg th{white-space:normal !important;max-width:110px;vertical-align:bottom}</style>
      <div class="scroll"><table class="bt xarp-cfg">
        <tr><th></th><th title="Spec % at the start of the room. 95: their first regen comes the tick after their first special attack, then as normal">Start spec (%)</th>
          <th title="Drink a surge with their first special attack">Surge</th>
          <th title="Spec regens on Lightbearer (a regen every 25 ticks), then Ultor. A 95% start's regen after their first spec doesn't count as one">Lightbearer cycles</th>
          <th title="Their Defence spec. Elder maul: on their first attack. BGS / Ralos Spec: on their next attack once the mauls have landed (after any backup mauls if fewer than 2 mauls hit)">Defence spec</th>
          <th title="Backup Defence spec (once): after the planned Defence specs have landed, if his Defence is still above the Defence stop. A backup maul goes as soon as the mauls come up short (fewer than 2 hit)">Backup</th>
          <th title="Damage spec once no Defence spec is still to come, as often as their spec allows. Claws at screech: held for the screech (a tick fix, or their first attack from it)">Damage spec</th>
          <th title="If their scythe (or ZCB) would go off on the i3 before the screech: lose a tick (scythe, next attack 6 ticks later), a claw scratch or claw spec (4 ticks), a blowpipe hit (2 - Rigour, quiver, gloves, necklace) or an Ayak hit (3 - their magic gear)">Tick fix</th>
          <th title="Soulflame horn on the interact tick: they and the first other mauler can't miss their next maul / BGS (needs a horn in the Gear tab)">Horn</th></tr>
        ${st.players.map((p, k) => `<tr><td class="rl">${esc(pname(k))}</td>
          <td><select data-p="${k}|startSpec"><option value="100" ${p.startSpec === 95 ? '' : 'selected'}>100</option><option value="95" ${p.startSpec === 95 ? 'selected' : ''}>95</option></select></td>
          <td style="text-align:center"><input type="checkbox" data-p="${k}|surge" ${p.surge ? 'checked' : ''}></td>
          <td><select data-p="${k}|lbCycles">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === Number(p.lbCycles || 0) ? 'selected' : ''}>${n || 'None'}</option>`).join('')}</select></td>
          <td>${sel(k, 'def', DEF_SPECS, p.def)}</td><td>${sel(k, 'backup', DEF_SPECS, p.backup)}</td><td>${sel(k, 'dps', DPS_SPECS, p.dps)}</td><td>${sel(k, 'fix', FIXES, p.fix)}</td>
          <td style="text-align:center"><input type="checkbox" data-p="${k}|horn" ${p.horn ? 'checked' : ''} ${gp && gp[k] && gp[k].horn ? '' : 'disabled title="No Soulflame horn (Gear tab)"'}></td></tr>`).join('')}
      </table></div>`;
  }
  host.querySelector('[data-settabs]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set]'); if (!b) return;
    const r = rootState(); r.cur = b.dataset.set; r.sets[r.cur] ||= { ...blankSet(), gearSet: cur().gearSet }; setMsg = ''; persist(); refreshAll();
  });
  cfg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const r = rootState(), t = team();
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
      else st[k] = Math.max(0, Math.trunc(Number(el.value) || 0));
      persist(); render(); return;
    }
    if (el.dataset.p) {
      const [k, key] = el.dataset.p.split('|'), p = st.players[Number(k)];
      p[key] = el.type === 'checkbox' ? el.checked : ['startSpec', 'lbCycles'].includes(key) ? Number(el.value) : el.value;
      persist(); render();
    }
  });

  /** The players for the engine: gear from the set's Gear set + the room settings. */
  const playersNow = (st) => { const gp = gearOf(st); return st.players.map((p, k) => ({ ...p, name: (gp && gp[k] && gp[k].name) || `Player ${k + 1}`, gear: (gp && gp[k]) || blankPlayer(k) })); };
  const optsOf = (st) => ({ heals: Number(st.heals) || 0, exactHeals: !!st.exactHeals, defStop: Number(st.defStop) || 0, zcbBelow: Number(st.zcbBelow ?? ZCB_BELOW) });

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
        status.textContent = `${me.stop ? 'Stopped at' : 'Done:'} ${runs[0].res.runs.toLocaleString()} raids${runs.length > 1 ? ' per set' : ''} (seed ${seed}).`;
        return;
      }
      const to = Math.min(n, i + Math.max(25, Math.floor(200 / runs.length)));
      try { for (const x of runs) addXarpusRaids(x.res, x.players, t, i, to, { seed, ...x.opts }); } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      i = to; status.textContent = `Running... ${i.toLocaleString()} / ${n.toLocaleString()} raids${runs.length > 1 ? ` (${runs.length} sets)` : ''}`;
      setTimeout(step, 0);
    };
    step();
  });

  // ---------------------------------------------------------------- solver: each ticked set solved from its own setup
  const sol = host.querySelector('[data-solve]');
  const ALLOW = ['def', 'backup', 'dps', 'fix', 'start', 'lb', 'surge', 'horn', 'defStop', 'zcbBelow'];
  const EFFORT = { quick: { rounds: 4, stages: [[40, 0.15], [150, 3], [600, 1]], finalRaids: 1000 },
    normal: { rounds: 8, stages: [[60, 0.2], [240, 4], [1000, 1]], finalRaids: 2000 },
    thorough: { rounds: 14, stages: [[100, 0.25], [400, 5], [2000, 1]], finalRaids: 5000 } };
  const setLabel = (k) => { const l = String((repState().labels || {})[k] || '').trim(); return l ? `Set ${k}: ${l}` : `Set ${k}`; };
  const solState = () => { const r = rootState(); r.solve ||= { bps: '', effort: 'normal', allow: Object.fromEntries(ALLOW.map((k) => [k, k !== 'surge'])), search: { swaps: true, restarts: false } }; r.solve.sets ||= [r.cur]; return r.solve; };
  const showSol = () => {
    const v = solState(), rs = rootState();
    sol.querySelector('[data-vsets]').innerHTML = setPicker((k) => !!rs.sets[k], v.sets, setLabel);
    sol.querySelector('[data-v="bps"]').value = v.bps; sol.querySelector('[data-v="effort"]').value = v.effort;
    for (const k of ALLOW) sol.querySelector(`[data-va="${k}"]`).checked = !!v.allow[k];
    for (const k of ['swaps', 'restarts']) sol.querySelector(`[data-vs="${k}"]`).checked = !!(v.search || {})[k];
  };
  sol.addEventListener('change', (e) => {
    const v = solState(), el = e.target;
    if (el.dataset.runset) v.sets = pickSets(v.sets, el);
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
  const showResults = () => {
    const out = sol.querySelector('[data-vout]');
    if (!vresults || !vresults.groups.some((g) => g.items.length)) { out.innerHTML = ''; return; }
    const { groups, bps, t } = vresults, asc = [...bps].sort((a, b) => a - b);
    const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
    const ft = (x) => (x == null || Number.isNaN(x) ? '-' : x >= 99999 ? 'failed' : fsec(x));
    vflat = [];
    const table = (rows, withSet) => `<div class="scroll"><table class="sortlist"><tr><th>#</th>${withSet ? '<th>Set</th>' : ''}<th>Median</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th>To 25%</th><th>25% to kill</th><th>Defence left</th><th></th></tr>
      ${rows.map((r, i) => { const v = r.totals.slice().sort((a, b) => a - b), idx = vflat.push(r) - 1, EXH = EXHUMED_TICKS[t];
        return `<tr${i === 0 ? ' style="font-weight:700"' : ''}><td>${i + 1}</td>${withSet ? `<td data-setcol="${r.set}" style="color:var(--c);font-weight:700">${esc(setLabel(r.set))}</td>` : ''}<td>${ft(v[v.length >> 1])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.1) - 1)])}</td><td>${ft(v[0])}</td>${asc.map((b) => `<td>${(v.filter((x) => x * 0.6 <= b + 1e-9).length / v.length * 100).toFixed(1)}%</td>`).join('')}<td>${ft(med(r.split.toScreech) - EXH)}</td><td>${ft(med(r.split.kill))}</td><td>${r.defEnd.length ? (r.defEnd.reduce((a, b) => a + b, 0) / r.defEnd.length).toFixed(1) : '-'}</td>
          <td style="white-space:nowrap"><button class="ghost sm" data-vshow="${idx}">Procedure</button> ${SETS.map((k) => `<button class="ghost sm" data-vuse="${idx}" data-to="${k}" title="Put this setup into set ${k}${rootState().sets[k] ? '' : ` - a new set, from set ${r.set}`}">Copy to set ${k}</button>`).join(' ')}</td></tr>
        <tr class="sub-row" data-vproc="${idx}" hidden><td colspan="${9 + asc.length + (withSet ? 1 : 0)}" style="text-align:left">
          <div class="small">Defence stop ${r.cfg.defStop} · ZCB → claws below ${r.cfg.zcbBelow} HP</div>
          <table style="margin-top:4px"><tr><th>Player</th><th>Start</th><th>Surge</th><th>Lightbearer</th><th>Defence spec</th><th>Backup</th><th>Damage spec</th><th>Tick fix</th><th>Horn</th></tr>
          ${r.cfg.players.map((p, k) => `<tr><td>${esc(r.names[k])}</td><td>${p.startSpec}%</td><td>${p.surge ? 'yes' : '-'}</td><td>${p.lbCycles ? `${p.lbCycles} cycles` : '-'}</td><td>${lab(DEF_SPECS, p.def)}</td><td>${lab(DEF_SPECS, p.backup)}</td><td>${lab(DPS_SPECS, p.dps)}</td><td>${lab(FIXES, p.fix)}</td><td>${p.horn ? 'yes' : '-'}</td></tr>`).join('')}</table></td></tr>`; }).join('')}
      </table></div>`;
    const all = groups.flatMap((g) => g.items);
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${t}-man Xarpus: solver</h3>
      <div class="sub">Each played on the same ${all[0].totals.length.toLocaleString()} raids${groups.length > 1 ? ' (every set on the same raids, so sets compare fairly)' : ''}. Times: median.</div>
      ${setResultsHtml(groups, { combine: vcombine, table, open: vopen, better: (a, b) => scoreBetter(a.score, b.score) })}</div>`;
  };
  wireSetResults(sol.querySelector('[data-vout]'), vopen, (c) => { vcombine = c; showResults(); });
  const PLAN = ['startSpec', 'surge', 'lbCycles', 'def', 'backup', 'dps', 'fix', 'horn'];
  sol.addEventListener('click', async (e) => {
    const el = e.target, status = sol.querySelector('[data-vstatus]'), err = sol.querySelector('[data-verr]'), vbtn = (a) => sol.querySelector(`[data-vact="${a}"]`);
    if (el.dataset.vshow != null) { const row = sol.querySelector(`[data-vproc="${el.dataset.vshow}"]`); row.hidden = !row.hidden; return; }
    if (el.dataset.vuse != null) {
      const r = vflat[Number(el.dataset.vuse)]; if (!r) return;
      const k = el.dataset.to, rs = rootState();
      if (!rs.sets[k]) rs.sets[k] = structuredClone(setOf(r.set) || cur());
      const st = setOf(k), rp = repState(); if (!rp.sets.includes(k)) rp.sets = SETS.filter((x) => x === k || rp.sets.includes(x));
      r.cfg.players.forEach((p, j) => { for (const f of PLAN) st.players[j][f] = p[f]; });
      st.defStop = r.cfg.defStop; st.zcbBelow = r.cfg.zcbBelow; persist(); refreshAll();
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
    const t1 = Date.now(), groups = [];
    try {
      for (const [n, k] of keys.entries()) {
        if (me.stopped) break;
        const st = setOf(k), all = playersNow(st), pre = keys.length > 1 ? `Set ${k} (${n + 1} of ${keys.length}): ` : '';
        const base = all.map((p) => ({ name: p.name, gear: p.gear })), names = all.map((p) => p.name);
        const planOf = (p) => Object.fromEntries(PLAN.map((f) => [f, f === 'startSpec' ? (p.startSpec === 95 ? 95 : 100) : f === 'lbCycles' ? Number(p.lbCycles || 0) : p[f]]));
        const start = { players: st.players.map(planOf), defStop: Number(st.defStop) || 0, zcbBelow: Number(st.zcbBelow ?? ZCB_BELOW) };
        const restarts = sr.restarts ? [{ ...start, players: defaultXarpus(t).map(planOf) }] : [];
        me.pool = new XarpusPool(base, t, { heals: Number(st.heals) || 0, exactHeals: !!st.exactHeals });
        try {
          const items = await solveXarpus({ start, gear: all.map((p) => p.gear), allow: { ...v.allow }, surgeLimit: Number(st.surgeLimit) || 0, lbRings: Number(st.lbRings ?? t),
            swaps: !!sr.swaps, restarts, bps, ...ef, top: 10 }, (...args) => me.pool.run(...args),
          (txt) => { status.textContent = `${pre}${txt} (${Math.round((Date.now() - t1) / 1000)}s)`; }, () => me.stopped);
          groups.push({ k, label: setLabel(k), items: items.map((r) => ({ ...r, set: k, names })) });
        } finally { me.pool.stop(); }
        vresults = { groups: [...groups], bps, t }; showResults();
      }
      status.textContent = me.stopped ? 'Stopped.' : `Done in ${Math.round((Date.now() - t1) / 1000)}s.`;
    } catch (x) { status.textContent = me.stopped ? 'Stopped.' : ''; if (!me.stopped) err.textContent = `Couldn't solve: ${x.message}`; }
    finally { vjob = null; vbtn('run').disabled = false; vbtn('stop').disabled = true; }
  });

  function refreshAll() { render(); showRep(); showSol(); }
  return { refresh: () => { state = loadKey(STORE); saved = loadKey(SAVED); refreshAll(); }, api: { rootState, setOf, cur, playersNow, optsOf, team, persist, render: refreshAll, repState } };
}
