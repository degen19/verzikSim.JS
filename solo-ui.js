// Verzik for solos: no chart - the room settings below (P1 plays itself: Dawn spec off cooldown, Dawn autos, Lightbearer).
// Sets A / B / C (switch, copy, save in this browser or to a file), a Report comparing the ticked sets, and the Solver
// (Commit % for each spec level, and optionally the shadow mode, Ayak P2, godbook and ring switch). Gear: the Gear tab.
import { loadGear, gearSet, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { applyToCfg, blankPlayer } from './engine/loadout.js';
import { reportHtml, reportPage } from './engine/report.js';
import { parseBreakpoints } from './engine/optimize.js';
import { COMMIT_KEYS, COMMIT_DEFAULT, DEEP_THR } from './engine/solo.js';
import { solveSolo, cfgOf, shadowModeOf, SHADOW_MODES } from './engine/solosolve.js';
import { SoloPool } from './solo-solver-pool.js';
import { SimPool } from './pool.js';

const STORE = 'verzikSim.solo.v1';             // {cur, sets: {A, B?, C?}, report, solve}
const SAVED = 'verzikSim.soloSaved.v1';        // [{id, name, saved, set}]
const SETS = ['A', 'B', 'C'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadKey = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
export const DEATHS_NOTE = '*This does not yet take into account deaths and assumes you live every raid. Death tracking will come at a later date*';
const blankSet = () => ({ gearSet: 'A', godbook: false, ringSwitch: '', shadowCamp: false, shadowLB: false, shadow31: false, deepProc: false, deepThr: DEEP_THR,
  ayakP2: false, ayakAmount: 70, redsMode: 'scythe', commit: { ...COMMIT_DEFAULT } });
const fsec = (t) => { const s = t * 0.6, m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };
const COMMIT_LABEL = { c100: '100% spec', c80: '80%+ spec', c50: '50%+ spec', c30: '30%+ spec' };

export function createSolo(host) {
  let state = loadKey(STORE, {}), saved = loadKey(SAVED, []), savedPick = '', setMsg = '';
  const persist = () => saveKey(STORE, state);
  const root = () => { state.sets ||= { A: blankSet() }; if (!state.sets[state.cur]) state.cur = 'A'; state.sets.A ||= blankSet(); return state; };
  const fix = (st) => { const b = blankSet(); for (const k of Object.keys(b)) st[k] ??= b[k]; st.commit = { ...b.commit, ...st.commit }; return st; };
  const cur = () => fix(root().sets[root().cur]);
  const setOf = (k) => (root().sets[k] ? fix(root().sets[k]) : null);
  const gearOf = (st) => { const set = gearSet(loadGear(), 1, st.gearSet); return set ? playersOf(set, 1)[0] : null; };
  /** The engine config for a set: the Gear set's gear + the room settings. */
  const cfgOfSet = (st) => {
    const g = gearOf(st) || blankPlayer(0), base = applyToCfg({ name: g.name || 'Solo' }, g);
    const sh = base.hasShadow;
    return { ...base, name: base.name || 'Solo', godbook: !!st.godbook, ringSwitch: st.ringSwitch ?? '', shadow: sh,
      shadowCamp: sh && !!st.shadowCamp, shadowLB: sh && !!st.shadowLB, shadow31: sh && !!st.shadow31, deepProc: sh,                                                         // solos always deep proc with a shadow deepThr: Number(st.deepThr) || DEEP_THR,
      ayakP2: (g.weapons || []).includes('Eye of ayak') && !!st.ayakP2, ayakAmount: Number(st.ayakAmount) || 0, redsMode: sh ? st.redsMode || 'scythe' : 'scythe', commit: { ...st.commit }, hasAyak: (g.weapons || []).includes('Eye of ayak') };
  };

  host.innerHTML = `<div class="card"><div data-cfg></div></div>
    <div class="card" style="margin-top:14px"><details class="video" data-rep open><summary>Report</summary>
      <div class="row" style="margin-top:10px">
        <label title="How far each raid is simulated">Phases<select data-r="scope"><option value="full">Full raid</option><option value="p2">P1 + P2 (to end of P2)</option><option value="p1">P1 only</option></select></label>
        <label>Raids per set<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <div data-rsets></div>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label title="Numbers of reds sets to mark off: the report shows the % of kills done in each (e.g. 4, 5, 6, 7)">Mark reds sets<input data-r="marks" placeholder="e.g. 4, 5, 6, 7" style="width:120px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-act="dl" class="ghost" disabled>Download report</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div class="bar"><div data-prog></div></div>
      <div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>
    </details></div>
    <div class="card" style="margin-top:14px"><details class="video" data-solve><summary>Solver</summary>
      <p class="muted small" style="margin-top:8px">Searches for the best setup from the one above. Commit % (always): for each spec level at a reds shield,
        how low Verzik must be (% of P2 HP) for the player to commit to the kill - one swing on the crab for the Death Charge, then the spec
        sequence (two claws, claw > shadow > scythes, claw > scratch > scythes, or scythes; halberd on r40 with 30%+). Optionally also the shadow
        mode, Ayak P2 amount, godbook and ring switch. Each round tries every single change on a few raids, then the best on more, and keeps the best
        if it beats the current setup; the top setups are then played on more raids and ranked: with breakpoints by the share finished at the
        fastest one (then the next), otherwise by the median.</p>
      <div class="row">
        <label>Breakpoints (optional)<input data-v="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label>Effort<select data-v="effort"><option value="quick">Quick</option><option value="normal">Normal</option><option value="thorough">Thorough</option></select></label>
        <button data-vact="run">Solve</button><button data-vact="stop" class="ghost" disabled>Stop</button>
      </div>
      <div class="row" style="margin-top:6px">${[['shadow', 'Shadow mode'], ['ayak', 'Ayak P2'], ['godbook', 'Godbook'], ['ring', 'Ring switch']].map(([k, l]) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-va="${k}">${l}</label>`).join('')}</div>
      <div data-vstatus class="muted" style="margin-top:8px"></div><div data-verr class="err"></div><div data-vout style="margin-top:8px"></div>
    </details></div>`;
  const cfgEl = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]'), sol = host.querySelector('[data-solve]');

  // ---------------------------------------------------------------- settings
  function render() {
    const r = root(), st = cur(), g = gearOf(st), w = (g && g.weapons) || [];
    const sh = w.includes("Tumeken's shadow"), ay = w.includes('Eye of ayak'), bp = w.includes('Toxic blowpipe');
    const chk = (k, l, on, title, dis) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="${esc(title)}"><input type="checkbox" data-s="${k}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}>${l}</label>`;
    const list = saved.slice().sort((a, b) => a.name.localeCompare(b.name));
    cfgEl.innerHTML = `
      <p class="small" style="margin:0 0 8px"><b>${esc(DEATHS_NOTE)}</b></p>
      <p class="muted small" style="margin:0 0 10px">Solos have no P1 chart: they open P1 with a Dawnbringer spec, spec whenever it's off cooldown (35%), Dawn auto
        otherwise in their mage gear, surge straight after the first spec and camp Lightbearer all of P1, with a melee thrall; once she's within 1% they scythe it
        off. Gear comes from the Gear tab (solo Gear set).</p>
      <div class="row wrap" style="gap:10px;align-items:end;margin:4px 0 10px">
        <div><div class="muted small">Set</div><div class="seg">${SETS.map((k) => `<button data-set="${k}" class="${k === r.cur ? 'on' : ''}">Set ${k}${r.sets[k] ? '' : ' (empty)'}</button>`).join('')}</div></div>
        <div><div class="muted small">Copy set ${r.cur} to</div>${SETS.filter((k) => k !== r.cur).map((k) => `<button class="ghost sm" data-copyset="${k}">Set ${k}</button>`).join(' ')}</div>
        <label>Saved sets<select data-saved="pick"><option value="">(choose a set)</option>${list.map((x) => `<option value="${x.id}" ${x.id === savedPick ? 'selected' : ''}>${esc(x.name)} · ${new Date(x.saved).toLocaleDateString()}</option>`).join('')}</select></label>
        <button class="ghost sm" data-setact="load" ${savedPick ? '' : 'disabled'}>Load into set ${r.cur}</button>
        <button class="ghost sm" data-setact="del" ${savedPick ? '' : 'disabled'}>Delete</button>
        <label>Name<input data-saved="name" placeholder="e.g. 3:1 + commit" style="width:150px"></label>
        <button class="sm" data-setact="save">Save set</button>
        <button class="ghost sm" data-setact="file">Save to file</button>
        <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-saved="file" hidden></label>
        <span class="muted small">${esc(setMsg)}</span>
      </div>
      <div class="row wrap" style="gap:14px;align-items:end">
        <label>Gear<select data-s="gearSet">${GEAR_SETS.map((k) => `<option value="${k}" ${k === st.gearSet ? 'selected' : ''}>Gear set ${k}${gearSet(loadGear(), 1, k) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        ${chk('godbook', 'Godbook (95% start)', st.godbook, 'Start P1 at 95%: no regen before the first Dawn spec, then a regen the tick after it')}
        <label title="P2: swap Lightbearer -> Ultor once spec reaches this %. Blank: Ultor from the start of P2">Ring switch %<input data-s="ringSwitch" type="number" min="0" max="100" step="10" value="${esc(st.ringSwitch)}" placeholder="P2 start" style="width:80px"></label>
      </div>
      <h4 style="margin:12px 0 4px">Shadow ${sh ? '' : '<span class="muted small">(no Tumeken\'s shadow in this Gear set)</span>'}</h4>
      <div class="row wrap" style="gap:14px;align-items:end">
        ${chk('shadowCamp', 'Shadow camp', st.shadowCamp, 'Shadow every P2 attack until reds', !sh)}
        ${chk('shadowLB', 'Shadow while LB', st.shadowLB, 'Shadow while wearing Lightbearer in P2', !sh)}
        ${chk('shadow31', '3:1', st.shadow31, 'Scythe, but the attack that would collide with Verzik becomes a shadow (P2 and reds)', !sh)}
        <label title="What they attack with in reds (until a commit): scythes, the shadow on the crab and Verzik, or the shadow on the crab and scythes on Verzik">Reds<select data-s="redsMode" ${sh ? '' : 'disabled'}>${[['scythe', 'Scythe'], ['shadow', 'Shadow (crab + Verzik)'], ['shadowCrab', 'Shadow crab, scythe Verzik']].map(([v, l]) => `<option value="${v}" ${v === (st.redsMode || 'scythe') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label title="Solos always deep proc with a shadow: below this % of P2 HP every attack is a shadow from max distance">Deep proc HP %<input data-s="deepThr" type="number" min="1" max="100" value="${esc(st.deepThr)}" style="width:70px" ${sh ? '' : 'disabled'}></label>
        ${chk('ayakP2', 'Ayak P2', st.ayakP2, 'Eye of ayak in P2: ayak autos until one misses (Confliction gauntlets then roll accuracy twice), then Soul Rend (50%: 2x accuracy, +30% max), which lowers her magic defence (70) by the damage - until it is down by the Ayak Amount', !ay)}
        <label title="Stop Soul Rending once her magic defence is down by this much (0-70)">Ayak Amount<input data-s="ayakAmount" type="number" min="0" max="70" value="${esc(st.ayakAmount)}" style="width:70px" ${ay ? '' : 'disabled'}></label>
        ${ay ? '' : '<span class="muted small">Ayak P2 needs an Eye of ayak in this Gear set</span>'}
      </div>
      <h4 style="margin:12px 0 4px">Commit % <span class="muted small">- at a reds shield, commit to the kill when Verzik is at or below this % of P2 HP for the spec they have (0 = never; under 30% spec: never)</span></h4>
      <div class="row wrap" style="gap:14px;align-items:end">
        ${COMMIT_KEYS.map(([k]) => `<label>${COMMIT_LABEL[k]}<input data-commit="${k}" type="number" min="0" max="100" value="${esc(st.commit[k])}" style="width:70px"></label>`).join('')}
      </div>
      ${bp ? '' : '<p class="err small">No blowpipe in this Gear set: the purple crabs are never popped (they heal Verzik until reds).</p>'}`;
  }
  cfgEl.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const r = root();
    if (b.dataset.set) { r.cur = b.dataset.set; r.sets[r.cur] ||= blankSet(); setMsg = ''; persist(); refreshAll(); return; }
    if (b.dataset.copyset) { const k = b.dataset.copyset; r.sets[k] = structuredClone(cur()); const rp = repState(); if (!rp.sets.includes(k)) rp.sets = SETS.filter((x) => x === k || rp.sets.includes(x)); setMsg = `Copied set ${r.cur} to set ${k}.`; persist(); refreshAll(); return; }
    const act = b.dataset.setact; if (!act) return;
    if (act === 'save') {
      const name = (cfgEl.querySelector('[data-saved="name"]').value || '').trim() || saved.find((x) => x.id === savedPick)?.name || '';
      if (!name) { setMsg = 'Type a name for the set first.'; render(); return; }
      const old = saved.find((x) => x.name === name), entry = { id: old ? old.id : `s${Date.now()}`, name, saved: Date.now(), set: structuredClone(cur()) };
      if (old) Object.assign(old, entry); else saved.push(entry);
      savedPick = entry.id; setMsg = saveKey(SAVED, saved) ? `Saved "${name}".` : 'Could not save (browser storage is off).';
    } else if (act === 'load' || act === 'del') {
      const x = saved.find((y) => y.id === savedPick); if (!x) return;
      if (act === 'load') { r.sets[r.cur] = structuredClone(x.set); persist(); setMsg = `Loaded "${x.name}" into set ${r.cur}.`; refreshAll(); return; }
      saved = saved.filter((y) => y !== x); savedPick = ''; saveKey(SAVED, saved); setMsg = `Deleted "${x.name}".`;
    } else if (act === 'file') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', kind: 'soloVerzikSet', set: cur() }, null, 1)], { type: 'application/json' }));
      a.download = 'verzik_solo_set.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    render();
  });
  cfgEl.addEventListener('change', async (e) => {
    const t = e.target, st = cur();
    if (t.dataset.saved === 'pick') { savedPick = t.value; setMsg = ''; render(); return; }
    if (t.dataset.saved === 'file') {
      try {
        const j = JSON.parse(await t.files[0].text());
        if (j.kind !== 'soloVerzikSet' || !j.set) throw new Error('not a saved solo Verzik set');
        root().sets[root().cur] = j.set; persist(); setMsg = `Opened ${t.files[0].name} into set ${root().cur}.`; refreshAll();
      } catch (x) { setMsg = `Couldn't open that file: ${x.message}`; render(); }
      return;
    }
    if (t.dataset.commit) { st.commit[t.dataset.commit] = Math.max(0, Math.min(100, Number(t.value) || 0)); persist(); return; }
    const k = t.dataset.s; if (!k) return;
    if (t.type === 'checkbox') st[k] = t.checked;
    else if (k === 'ringSwitch') st[k] = t.value === '' ? '' : Math.max(0, Math.min(100, Number(t.value) || 0));
    else if (k === 'gearSet' || k === 'redsMode') st[k] = t.value;
    else st[k] = Number(t.value) || 0;
    if (k === 'shadowCamp' && t.checked) { st.shadow31 = false; st.shadowLB = false; }       // camp covers 3:1 / while LB
    if ((k === 'shadow31' || k === 'shadowLB') && t.checked) st.shadowCamp = false;
    persist(); render();
  });

  // ---------------------------------------------------------------- report
  const repState = () => { const r = root(); r.report ||= { raids: 5000, seed: '', bps: '', scope: 'full' }; r.report.marks ??= '4, 5, 6, 7'; r.report.sets ||= ['A']; r.report.labels ||= {}; return r.report; };
  const $r = (k) => rep.querySelector(`[data-r="${k}"]`);
  const showRep = () => {
    const r = repState(), rs = root();
    for (const k of ['raids', 'seed', 'bps', 'scope', 'marks']) $r(k).value = r[k];
    rep.querySelector('[data-rsets]').innerHTML = `<div class="muted small">Sets to run (compared on the same raids)</div><div class="row" style="gap:8px">${SETS.map((k) => `<label class="pick" style="flex-direction:row;gap:4px;align-items:center"><input type="checkbox" data-rset-run="${k}" ${rs.sets[k] ? '' : 'disabled'} ${rs.sets[k] && r.sets.includes(k) ? 'checked' : ''}>${k}</label><input data-rlabel="${k}" placeholder="Set ${k} label" value="${esc(r.labels[k] || '')}" style="width:110px" ${rs.sets[k] ? '' : 'disabled'}>`).join('')}</div>`;
  };
  rep.addEventListener('change', (e) => {
    const r = repState(), t = e.target;
    if (t.dataset.r) r[t.dataset.r] = t.dataset.r === 'raids' ? Number(t.value) || 5000 : t.value;
    if (t.dataset.rsetRun) { const k = t.dataset.rsetRun; r.sets = SETS.filter((x) => (x === k ? t.checked : r.sets.includes(x))); }
    if (t.dataset.rlabel) r.labels[t.dataset.rlabel] = t.value;
    persist();
  });
  const pool = new SimPool();
  let running = false, lastPage = null;
  rep.addEventListener('click', async (e) => {
    const a = e.target.dataset.act; if (!a) return;
    const btn = (x) => rep.querySelector(`[data-act="${x}"]`), status = rep.querySelector('[data-rstatus]'), err = rep.querySelector('[data-rerr]'), out = rep.querySelector('[data-rout]'), prog = rep.querySelector('[data-prog]');
    if (a === 'stop') { pool.stop(); return; }
    if (a === 'dl' && lastPage) { const el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([lastPage], { type: 'text/html' })); el.download = 'verzik_solo_report.html'; el.click(); return; }
    if (a !== 'run' || running) return;
    const r = repState(); err.textContent = '';
    let bps = []; try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const keys = r.sets.filter((k) => setOf(k)); if (!keys.length) { err.textContent = 'Tick at least one set to run.'; return; }
    const marks = [...new Set(String(r.marks || '').split(/[\s,]+/).filter(Boolean).map(Number))];
    if (marks.some((n) => !Number.isInteger(n) || n < 1 || n > 60)) { err.textContent = 'Mark reds sets: whole numbers of sets, e.g. 4, 5, 6, 7'; return; }
    marks.sort((a, b) => a - b);
    const runs = Math.max(100, Number(r.raids) || 5000), seed = String(r.seed || '').trim() || Math.floor(Math.random() * 1e9);
    const labels = keys.map((k) => (r.labels[k] || '').trim() || `Set ${k}`);
    running = true; btn('run').disabled = true; btn('stop').disabled = false;
    const res = [], t0 = performance.now();
    try {
      for (let i = 0; i < keys.length; i++) {
        const cfgs = [{ ...cfgOfSet(setOf(keys[i])), scope: r.scope }];
        status.textContent = `Running ${labels[i]} (${i + 1} of ${keys.length})...`;
        res.push(await pool.run(cfgs, 1, runs, seed, { onProgress: (f) => { prog.style.width = `${((i + f) / keys.length * 100).toFixed(1)}%`; } }));
      }
      prog.style.width = '100%';
      const ropts = { breakpoints: bps, markSets: marks };
      out.innerHTML = reportHtml(res, labels, 1, runs, ropts); lastPage = reportPage(res, labels, 1, runs, ropts); btn('dl').disabled = false;
      const secs = (performance.now() - t0) / 1000;
      status.textContent = `Done in ${secs.toFixed(1)}s · ${Math.round(runs * keys.length / secs).toLocaleString()} raids/s (seed ${seed}).`;
    } catch (x) { err.textContent = x.message; status.textContent = ''; }
    finally { running = false; btn('run').disabled = false; btn('stop').disabled = true; }
  });

  // ---------------------------------------------------------------- solver
  const EFFORT = { quick: { rounds: 5, stages: [[40, 0.25], [150, 3], [500, 1]], final: 1000 }, normal: { rounds: 8, stages: [[60, 0.25], [240, 4], [800, 1]], final: 2000 },
    thorough: { rounds: 14, stages: [[100, 0.3], [400, 5], [1500, 1]], final: 5000 } };
  const solState = () => { const r = root(); r.solve ||= { bps: '', effort: 'normal', allow: { shadow: false, ayak: false, godbook: false, ring: false } }; return r.solve; };
  const showSol = () => {
    const v = solState(); sol.querySelector('[data-v="bps"]').value = v.bps; sol.querySelector('[data-v="effort"]').value = v.effort;
    for (const k of ['shadow', 'ayak', 'godbook', 'ring']) sol.querySelector(`[data-va="${k}"]`).checked = !!v.allow[k];
  };
  sol.addEventListener('change', (e) => {
    const v = solState(), t = e.target;
    if (t.dataset.v) v[t.dataset.v] = t.value;
    if (t.dataset.va) v.allow[t.dataset.va] = t.checked;
    persist();
  });
  let solver = null, results = null, lastBps = [];
  const settingsOf = (st, c, allow) => ({ commit: { ...st.commit }, shadowMode: allow.shadow && c.hasShadow ? shadowModeOf(c) : null,
    ayak: allow.ayak && c.hasAyak ? (c.ayakP2 ? Number(st.ayakAmount) || 0 : 0) : null, godbook: !!st.godbook, ringSwitch: st.ringSwitch ?? '' });
  const describe = (s, hasShadow, hasAyak) => [
    COMMIT_KEYS.map(([k]) => `${COMMIT_LABEL[k]}: ${s.commit[k] ? `${s.commit[k]}%` : 'never'}`).join(', '),
    hasShadow && s.shadowMode != null ? (SHADOW_MODES.find((m) => m[0] === s.shadowMode) || ['', 'No shadow'])[1] : null,
    hasAyak && s.ayak != null ? (s.ayak ? `Ayak P2 to ${s.ayak}` : 'no Ayak P2') : null,
    s.godbook ? 'godbook' : null, s.ringSwitch !== '' && s.ringSwitch != null ? `Ultor at ${s.ringSwitch}%` : null,
  ].filter(Boolean).join(' · ');
  sol.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const status = sol.querySelector('[data-vstatus]'), err = sol.querySelector('[data-verr]'), out = sol.querySelector('[data-vout]');
    const vbtn = (a) => sol.querySelector(`[data-vact="${a}"]`);
    if (b.dataset.vuse != null && results) {
      const s = results[Number(b.dataset.vuse)].s, st = cur();
      st.commit = { ...s.commit }; st.godbook = !!s.godbook; st.ringSwitch = s.ringSwitch ?? '';
      if (s.shadowMode != null) Object.assign(st, { shadowCamp: s.shadowMode === 'camp', shadow31: s.shadowMode === '31' || s.shadowMode === 'lb31', shadowLB: s.shadowMode === 'lb' || s.shadowMode === 'lb31' });
      if (s.ayak != null) { st.ayakP2 = s.ayak > 0; if (s.ayak > 0) st.ayakAmount = s.ayak; }
      persist(); render(); status.textContent = `Set ${root().cur} now uses setup #${Number(b.dataset.vuse) + 1}.`; return;
    }
    if (b.dataset.vact === 'stop') { if (solver) { solver.stopped = true; solver.pool.stop(); } return; }
    if (b.dataset.vact !== 'run' || solver) return;
    const v = solState(); err.textContent = '';
    let bps = []; try { bps = String(v.bps || '').trim() ? parseBreakpoints(v.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const st = cur(), c = cfgOfSet(st), eff = EFFORT[v.effort] || EFFORT.normal;
    const base = { ...c }, start = settingsOf(st, c, v.allow);
    solver = { stopped: false, pool: new SoloPool(base) }; const me = solver;
    vbtn('run').disabled = true; vbtn('stop').disabled = false; out.innerHTML = ''; lastBps = bps;
    const t0 = performance.now();
    try {
      results = await solveSolo({ start, allow: { commit: true, ...v.allow }, hasShadow: !!c.hasShadow, hasAyak: !!c.hasAyak, bps, rounds: eff.rounds, stages: eff.stages, finalRaids: eff.final, top: 10 },
        (cfgs, from, to, seed) => me.pool.run(cfgs, from, to, seed), (m) => { status.textContent = m; }, () => me.stopped);
      status.textContent = me.stopped ? 'Stopped.' : `Done in ${((performance.now() - t0) / 1000).toFixed(0)}s.`;
      showResults(!!c.hasShadow, !!c.hasAyak);
    } catch (x) { if (!me.stopped) err.textContent = x.message; else status.textContent = 'Stopped.'; }
    finally { me.pool.stop(); solver = null; vbtn('run').disabled = false; vbtn('stop').disabled = true; }
  });
  function showResults(hasShadow, hasAyak) {
    const out = sol.querySelector('[data-vout]');
    if (!results || !results.length) { out.innerHTML = ''; return; }
    const med = (a) => { const x = a.slice().sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
    const asc = [...lastBps].sort((a, b) => a - b), fs = (b) => `${Math.floor(b / 60)}:${String(Math.round(b % 60)).padStart(2, '0')}`;
    const ft = (x) => (x == null || Number.isNaN(x) ? '-' : x >= 99999 ? 'failed' : fsec(x));
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">Solo Verzik: solver - top ${results.length}</h3>
      <div class="sub">Each played on the same ${results[0].totals.length.toLocaleString()} raids. Times: median. ${esc(DEATHS_NOTE)}</div>
      <div class="scroll"><table><tr><th>#</th><th>Median</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fs(b)} or faster</th>`).join('')}<th>P1</th><th>P2</th><th>P3</th><th>Reds sets</th><th style="text-align:left">Setup</th><th></th></tr>
      ${results.map((r, i) => { const v = r.totals.slice().sort((a, b) => a - b), sets = r.split.sets;
        return `<tr${i === 0 ? ' style="font-weight:700"' : ''}><td>${i + 1}</td><td>${ft(v[v.length >> 1])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.1) - 1)])}</td><td>${ft(v[0])}</td>${asc.map((b) => `<td>${(v.filter((x) => x * 0.6 <= b + 1e-9).length / v.length * 100).toFixed(1)}%</td>`).join('')}<td>${ft(med(r.split.p1))}</td><td>${ft(med(r.split.p2))}</td><td>${ft(med(r.split.p3))}</td><td>${sets.length ? (sets.reduce((s, x) => s + x, 0) / sets.length).toFixed(2) : '-'}</td><td style="text-align:left;white-space:normal;min-width:260px">${esc(describe(r.s, hasShadow, hasAyak))}</td><td><button class="ghost sm" data-vuse="${i}">Use this setup</button></td></tr>`; }).join('')}
      </table></div></div>`;
  }

  function refreshAll() { render(); showRep(); showSol(); }
  refreshAll();
  return { refresh: () => { state = loadKey(STORE, {}); saved = loadKey(SAVED, []); refreshAll(); } };
}
