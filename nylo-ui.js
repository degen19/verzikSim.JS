// Nylocas tab (solo - 5s; duos: Healer Tech, solos: under him every form): per-player room settings (opening spec, damage specs, start spec, surge, tome tick fix,
// Twisted-bows-only thresholds) and the team's backup BGS, saved in this browser; a Report (raids played, boss times,
// Show raid) and the Solver (best spec setups, then each player's ranged tick fix thresholds). Gear from the Gear tab.
import { groupsOf } from './engine/symmetry.js';
import { breath, whenFree } from './engine/pause.js';
import { activeNow } from './engine/pause.js';
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { blankPlayer } from './engine/loadout.js';
import { parseBreakpoints } from './engine/optimize.js';
import { histogramSvg, cumulativeSvg, chartBox } from './engine/report.js';
import { runNylo, NYLO_HP, FAST, parseWaveTimes, drawWave, fmtWave, normSwitches, fastWeaponOf } from './engine/nylo.js';
const SW_STYLES = [['melee', 'Melee'], ['range', 'Range'], ['mage', 'Mage']];
import { solveNylo, rangedThresholds, backupThresholds, pairedChange, withThresholds, defaultPlan, canSeq, canOpen, OPENS, SEQS, seqName, SPEC_NAME, BACKUP_ATS, STOP_PCTS, PLAN_NAMES, stopLines, planLabel, better as scoreBetter, scoreOf } from './engine/nylosolve.js';
import { NyloPool } from './nylo-solver-pool.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';
import { Rng } from './engine/rng.js';
import { timelineHtml, successSteps, raidNav } from './raidview.js';

const STORE = 'verzikSim.nylo.v1';           // {team: {set, report, solve}}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadKey = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const pick = () => '<label class="pick" style="flex-direction:row;gap:6px;align-items:center"';
const fsec = (x) => { if (x == null || x >= 99999) return '-'; const s = x * 0.6; return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` : `${s.toFixed(1)}s`; };
const fsB = (b) => { const r = Math.round(b % 60 * 10) / 10; return `${Math.floor(b / 60)}:${r < 10 ? '0' : ''}${r}`; };
const seqKey = (s) => s.join('+') || 'none';
const LEGEND = "Grey: his melee form · green: ranged · blue: magic · slightly lighter: under him · his attacks: hover for the target, takeoff, accuracy, damage and veng · tome borders: pink spec hit, black missed, red buffed auto · zombie (bottom right): a melee thrall hit";

export function createNylo(host, { getTeam }) {
  let state = loadKey(STORE);
  const persist = () => saveKey(STORE, state);
  const team = () => Number(getTeam()) || 4;
  host.innerHTML = `<div data-small></div><div data-main>${settingsCard('Nylocas settings', '<div data-cfg></div>')}
    ${tabsHtml([['rep', 'Report'], ['opt', 'Optimizer'], ['solve', 'Solver']])}
    ${pane('rep', 'data-rep', `
      <div data-rsets style="margin-top:10px"></div>
      <div class="row" style="margin-top:10px">
        <label>Raids<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <label title="Target boss times (m:ss: his spawn to the room's end)">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page): the pieces already running finish, then it waits. Resume carries on from the same spot with the inputs it started with">Pause</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>`)}
    ${pane('opt', 'data-opt', `
      <p class="muted small" style="margin-top:8px">Your setup as it is above (specs, surges, gear, Max switches) - and, for your gear and your team's, what changes help against his HP:
        when to backup BGS (who, at which Defence - or not at all), and when each player should stop each ranged tick fix sequence (Twisted bows only below a % of his HP).
        Each is played against your setup on the same raids (one change at a time) and kept only when it's clearly faster.</p>
      <div class="row">
        <label>Effort<select data-o="effort"><option value="quick">Quick (800 raids)</option><option value="normal">Normal (1,500)</option><option value="thorough">Thorough (3,000)</option></select></label>
        ${pick()}><input type="checkbox" data-oc="bgs" checked>Backup BGS</label>
        ${pick()}><input type="checkbox" data-oc="thr" checked>Tick fix thresholds</label>
        <button data-oact="run">Optimize</button><button data-oact="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page): the pieces already running finish, then it waits. Resume carries on from the same spot with the inputs it started with">Pause</button>
      </div>
      <div data-ostatus class="muted" style="margin-top:8px"></div><div data-oerr class="err"></div><div data-oout style="margin-top:8px"></div>`)}
    ${pane('solve', 'data-solve', `
      <p class="muted small" style="margin-top:8px">Searches for the best setup from the one above: each player's opening spec (none, BGS, claws, halberd), their second spec(s) in order (claws, tome, ZCB, halberd - one or two, either order),
        start spec (95 / 100), surges (within the Surge potions limit) and the backup BGS (who, and at which Defence: ${BACKUP_ATS.join(', ')}+) -
        within the gear each player has and the spec they can have (start + a surge + one regen). A player doing a melee spec (claws / halberd) opens with one; claws go when they gain a tick (or he's nearly dead). Each round it tries every single change (with Role changes: a player's opener and damage specs together; with Swaps: two players' specs swapped, a surge moved) on a few raids,
        then the best on more, and keeps the best if it beats the current setup, until nothing does. The top setups are then played on more raids and ranked: with breakpoints by the share at the fastest one (then the next), otherwise by the mean boss time.
        Then for the best setup: each player's ranged tick fix thresholds (the % of his HP to stop each green-form sequence at - 4bp tbow, tbow bp tbow, 3bp tbow - and play Twisted bows only; bp is their 2-tick hit).</p>
      <div class="row">
        <label title="Target boss times (m:ss)">Breakpoints (optional)<input data-v="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label>Effort<select data-v="effort"><option value="quick">Quick</option><option value="normal">Normal</option><option value="thorough">Thorough</option></select></label>
        <button data-vact="run">Solve</button><button data-vact="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page): the pieces already running finish, then it waits. Resume carries on from the same spot with the inputs it started with">Pause</button>
      </div>
      <div class="row" style="margin-top:6px">${[['open', 'Opening specs'], ['specs', 'Second specs'], ['start', 'Start spec'], ['surge', 'Surges'], ['backup', 'Backup BGS']]
        .map(([k, l]) => `${pick()}><input type="checkbox" data-va="${k}">${l}</label>`).join('')}
        <span class="muted small">Search:</span>${pick()} title="Also swap two players' specs, and move a surge, in one step"><input type="checkbox" data-vs="swaps">Swaps</label>
        ${pick()} title="Also change a player's opener and damage specs together"><input type="checkbox" data-vs="roles">Role changes</label>
        ${pick()} title="After the search: each player's Twisted-bows-only thresholds for the best setup"><input type="checkbox" data-vs="thr">Ranged thresholds</label></div>
      <div data-vstatus class="muted" style="margin-top:8px"></div><div data-verr class="err"></div><div data-vout style="margin-top:8px"></div>`)}</div>`;
  wireSubtabs(host, 'verzikSim.nyloTabs.v1');
  const cfg = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]'), sol = host.querySelector('[data-solve]'), opt = host.querySelector('[data-opt]');

  const SETS = ['A', 'B', 'C'];
  // per team: sets A / B / C (each a full setup: gear set, specs, surges, ...), the one being edited (cur), the report / solver
  const root = () => {
    const t = team(); state[t] ||= {}; const r = state[t];
    if (r.set && !r.sets) { r.sets = { A: r.set }; delete r.set; }      // (one set before sets came in: set A)
    r.sets ||= {}; r.cur ||= 'A'; if (!SETS.includes(r.cur)) r.cur = 'A';
    return r;
  };
  const blankSet = () => ({ gearSet: 'A', surgeLimit: 0, takeoffs: true, backup: null, players: [] });
  const gearOf = (gs) => { const set = gearSet(loadGear(), team(), gs); return set ? playersOf(set, team()) : null; };
  const gearK = (st, k) => { const gp = gearOf(st.gearSet); return (gp && gp[k]) || blankPlayer(k); };
  const fixSet = (st) => {
    const t = team();
    for (let k = 0; k < t; k++) st.players[k] = { ...defaultPlan(gearK(st, k)), rangedStop: {}, ...(st.players[k] || {}) };
    st.players.length = t;
    return st;
  };
  const cur = () => { const r = root(); return fixSet(r.sets[r.cur] ||= blankSet()); };
  const setOf = (k) => { const r = root(); return r.sets[k] ? fixSet(r.sets[k]) : null; };
  const setLabel = (k) => { const l = String((repState().labels || {})[k] || '').trim(); return l ? `Set ${k}: ${l}` : `Set ${k}`; };
  // room options from the settings: takeoffs, off-prayer vengs (solos: off by default), restore doses (duos / solos)
  const roomOpts = (st) => ({ takeoffs: st.takeoffs !== false, offPrayVeng: st.offPrayVeng ?? team() !== 1, restores: Number(st.restores ?? 8) });
  const playersNow = (st) => { const gp = gearOf(st.gearSet); return st.players.map((p, k) => { const { predictFlip, ...plan } = p; return { name: (gp && gp[k] && gp[k].name) || `Player ${k + 1}`, gear: (gp && gp[k]) || blankPlayer(k), plan }; }); };   // (predictions by HP: retired - the default prediction)

  function render() {
    const t = team(), small = host.querySelector('[data-small]'), main = host.querySelector('[data-main]');
    small.innerHTML = ''; main.hidden = false;
    const st = cur(), g = loadGear(), names = playersNow(st).map((p) => p.name);
    const notes = [];
    st.players.forEach((p, k) => {
      const gk = gearK(st, k);
      if (!canOpen(gk, p.open)) notes.push(`${names[k]}: no weapon for their opening ${SPEC_NAME[p.open]} - skipped.`);
      if (!canSeq(gk, p.specs)) notes.push(`${names[k]}: a damage spec they've no weapon for - skipped.`);
      if (!FAST.some((w) => (gk.weapons || []).includes(w))) notes.push(`${names[k]}: no blowpipe, Ascension crossbows or dragon darts - Twisted bows only in his ranged form.`);
    });
    const surgers = st.players.filter((p) => p.surge).length;
    if (surgers > Number(st.surgeLimit)) notes.push(`${surgers} players surge, but only ${st.surgeLimit} surge potion${Number(st.surgeLimit) === 1 ? '' : 's'} can be used here.`);
    const opt = (list, v) => list.map(([x, l]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
    const stopSel = (k, plan) => `<select data-stop="${k}|${plan}" style="width:150px">${opt([['', 'continue till dead'], ...STOP_PCTS.map((x) => [x, `< ${x}%`])], (st.players[k].rangedStop || {})[plan] ?? '')}</select>`;
    const r0 = root();
    cfg.innerHTML = `<div class="row wrap" style="gap:6px;align-items:center;margin-bottom:8px"><span class="seg">${SETS.map((k) => `<button data-nset="${k}" class="${k === r0.cur ? 'on' : ''}" title="${r0.sets[k] ? `Set ${k}` : 'Empty - opens a new set'}">Set ${k}${r0.sets[k] ? '' : ' <span class="muted">(empty)</span>'}</button>`).join('')}</span>
        <span class="muted small" style="margin-left:8px">Copy set ${r0.cur} to</span>${SETS.filter((k) => k !== r0.cur).map((k) => `<button class="ghost sm" data-ncopy="${k}" title="Replace set ${k} with a copy of set ${r0.cur}">Set ${k}</button>`).join('')}
        <button class="ghost sm" data-nclear title="Set ${r0.cur} back to the defaults">Clear set ${r0.cur}</button><span class="muted small" data-nsetmsg></span></div>
      <h3 style="margin-top:0">Nylocas boss <span class="muted small">(${t}-man · ${NYLO_HP[t]} HP)</span></h3>
      <p class="muted small">He spawns melee for 9 ticks, then switches every 10 ticks to one of his other two forms; players use the matching style from each form's 2nd tick (scythe / Twisted bow + 2-tick hits / Eye of ayak). Boss time: his spawn (i1) to the room's end (the tick after the first i4 his death animation is done by). Gear comes from the Gear tab.</p>
      <div class="row wrap" style="gap:14px;align-items:end;margin-bottom:8px">
        <label>Gear<select data-s="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${x === st.gearSet ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}${gearSet(g, t, x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        <label title="Surge potions the team can use in this room (the solver won't use more)">Surge potions<select data-s="surgeLimit">${Array.from({ length: t + 1 }, (_, n) => `<option value="${n}" ${n === Number(st.surgeLimit) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        ${pick()} title="A player taking his attack off prayer for veng, whose next attack is 2+ ticks away, wears their least defensive set for it"><input type="checkbox" data-s="takeoffs" ${st.takeoffs !== false ? 'checked' : ''}>Takeoffs</label>
        ${pick()} title="With a veng up and HP above his max hit (70), take his ranged / magic attacks off prayer for the veng damage. Solos usually stay on prayer"><input type="checkbox" data-s="offPrayVeng" ${(st.offPrayVeng ?? t !== 1) ? 'checked' : ''}>Off pray veng if healthy</label>
        ${t <= 2 ? `<label title="Restore doses for redemption: each locator orb + redemption takes one to get their prayers back (${t === 1 ? 'when too low for a prayed hit' : 'the Healer Tech player, each Heal Other loop'})">Restore doses<input type="number" min="0" max="40" data-s="restores" value="${Number(st.restores ?? 8)}" style="width:60px"></label>` : ''}
        ${t === 1 ? '' : `<label title="A BGS by this player while his Defence is at or above the value (after the opening BGSs)">Backup BGS<select data-s="backupP"><option value="">None</option>${st.players.map((_, k) => `<option value="${k}" ${st.backup && st.backup.p === k ? 'selected' : ''} ${(gearK(st, k).weapons || []).includes('Bandos godsword') ? '' : 'disabled'}>${esc(names[k])}</option>`).join('')}</select></label>
        <label>at Defence<select data-s="backupAt" ${st.backup ? '' : 'disabled'}>${opt(BACKUP_ATS.map((x) => [x, `${x}+`]), st.backup ? st.backup.at : 30)}</select></label>`}
      </div>
      ${t === 1 ? '<p class="muted small">Solo: after his first form they step under him on each form\'s ticks 1-4 and 6-9 and attack on 5 and 10 (scythe / Twisted bow / shadow, else Ayak; no tome), so he attacks once a form. Too low for a prayed hit: a locator orb + redemption and a restore. Amulet of blood fury heals (20% of melee hits, 30% of the damage) count.</p>' : ''}
      ${notes.map((x) => `<div class="warn small" style="margin-bottom:4px">${esc(x)}</div>`).join('')}
      <div class="scroll"><table class="bt"><tr><th></th><th title="95: their first regen comes the tick after their first spec">Start spec</th><th title="+25% straight after their first spec">Surge</th>
        <th title="Their first attack (his melee form) - a halberd opener goes on their second, after a scythe">Opening spec</th><th title="After their opener, in order, each when his form allows: claws / halberd (melee), tome (magic), ZCB (in place of a Twisted bow, ranged). Never their first attack">Second spec</th>
        ${SW_STYLES.map(([, l]) => `<th title="Cross praying: between forms they wear the gear of the form they predict (he's magic or melee -> ranged; ranged -> melee; a tome spec planned -> magic) and pray for the other. Guessed wrong and he's ${l.toLowerCase()}: this many ${l.toLowerCase()} item switches a tick before their first attack (the weapon first, then what adds the most damage). Due on N2: the attack goes on N3">Max ${l.toLowerCase()} switches<br>on wrong prediction</th>`).join('')}
        ${t === 2 ? '<th title="Feeds HP and Vengs to other player with redemption - requires locator orb and restore doses">Healer Tech</th>' : ''}
        ${t === 1 ? '' : [1, 2, 3].map((k) => `<th title="Below this % of his HP they stop this green-form sequence and play Twisted bows only (bp: their 2-tick hit - blowpipe, crossbows or darts). Which sequence depends on their first attack in the form: its 2nd tick 4bp tbow, 3rd tbow bp tbow, 4th 3bp tbow. Darts only (no blowpipe / Ascension crossbows): tbow dart tbow from the 2nd or 3rd tick, else Twisted bows">Stop sequence at HP:<br>${PLAN_NAMES[k]}</th>`).join('')}</tr>
      ${st.players.map((p, k) => { const gk = gearK(st, k); return `<tr><td class="rl">${esc(names[k])}</td>
        <td><select data-p="${k}|startSpec">${opt([[100, '100'], [95, '95']], p.startSpec)}</select></td>
        <td style="text-align:center"><input type="checkbox" data-p="${k}|surge" ${p.surge ? 'checked' : ''}></td>
        <td><select data-p="${k}|open">${OPENS.map(([v, l]) => `<option value="${v}" ${v === p.open ? 'selected' : ''} ${canOpen(gk, v) ? '' : 'disabled'}>${l}</option>`).join('')}</select></td>
        <td><select data-p="${k}|specs" style="width:150px">${SEQS.map((s) => `<option value="${seqKey(s)}" ${seqKey(s) === seqKey(p.specs) ? 'selected' : ''} ${canSeq(gk, s) && !(t === 1 && s.includes('tome')) ? '' : 'disabled'}>${seqName(s)}</option>`).join('')}</select></td>
        ${SW_STYLES.map(([y]) => `<td><select data-p="${k}|maxSwitches.${y}">${opt([1, 2, 3, 4, 5, 6, 7, 8].map((x) => [x, x]), normSwitches(p.maxSwitches)[y])}</select></td>`).join('')}
        ${t === 2 ? `<td style="text-align:center"><input type="checkbox" data-p="${k}|healer" ${p.healer ? 'checked' : ''}></td>` : ''}
        ${t === 1 ? '' : `<td>${stopSel(k, 1)}</td><td>${stopSel(k, 2)}</td><td>${stopSel(k, 3)}</td>`}</tr>`; }).join('')}</table></div>
      <div style="margin-top:10px">${pick()} title="Add the Nylocas waves before the boss: room time = wave time + boss time (the Report's numbers and charts). In a full raid it also runs down surge cooldowns from the rooms before"><input type="checkbox" data-s="waveOn" ${st.wave && st.wave.on ? 'checked' : ''}>Include wave time</label></div>
      ${st.wave && st.wave.on ? (() => { const w = parseWaveTimes(st.wave.rows); return `<table class="bt" style="margin-top:4px"><tr><th>Wave time</th><th>Frequency</th><th></th></tr>
        ${st.wave.rows.map((r, j) => `<tr><td><input data-wave="${j}|time" value="${esc(r.time ?? '')}" placeholder="m:ss.s" style="width:80px"></td><td><input data-wave="${j}|freq" value="${esc(r.freq ?? '')}" placeholder="%" style="width:60px"> %</td><td>${st.wave.rows.length > 1 ? `<button class="ghost sm" data-wavedel="${j}">Remove</button>` : ''}</td></tr>`).join('')}</table>
        <button class="ghost sm" data-waveadd style="margin-top:4px">+ Add wave time</button>
        <div class="small ${w.error ? 'warn' : 'muted'}" style="margin-top:4px">${w.error ? esc(w.error) : `Average wave time ${fmtWave(Math.round(w.mean))} (${(w.mean * 0.6).toFixed(2)}s) - times are a whole tick, 2.4s (4 ticks) apart; frequencies add up to 100%.`}</div>`; })() : ''}`;
  }
  cfg.addEventListener('click', (e) => {
    const st = cur(), d = e.target.closest('button') ? e.target.closest('button').dataset : e.target.dataset, r = root();
    if (d.nset) { r.cur = d.nset; r.sets[r.cur] ||= { ...blankSet(), gearSet: st.gearSet }; persist(); refreshAll(); return; }
    if (d.ncopy) { const k = d.ncopy; r.sets[k] = structuredClone(st); const rp = repState(); if (!rp.sets.includes(k)) rp.sets = SETS.filter((x) => x === k || rp.sets.includes(x)); persist(); refreshAll(); cfg.querySelector('[data-nsetmsg]').textContent = `Copied set ${r.cur} to set ${k}.`; return; }
    if (d.nclear != null) { r.sets[r.cur] = { ...blankSet(), gearSet: st.gearSet }; persist(); refreshAll(); return; }
    if (d.waveadd != null) { st.wave.rows.push({ time: '', freq: '' }); persist(); render(); return; }
    if (d.wavedel != null) { st.wave.rows.splice(Number(d.wavedel), 1); persist(); render(); return; }

  });
  cfg.addEventListener('change', (e) => {
    const el = e.target, st = cur();
    if (el.dataset.s) {
      const k = el.dataset.s;
      if (k === 'takeoffs') st.takeoffs = el.checked;
      else if (k === 'waveOn') { st.wave ||= { on: false, rows: [{ time: '', freq: '' }] }; st.wave.on = el.checked; }
      else if (k === 'offPrayVeng') st.offPrayVeng = el.checked;
      else if (k === 'restores') st.restores = Math.max(0, Math.min(40, Number(el.value) || 0));
      else if (k === 'gearSet') st.gearSet = el.value;
      else if (k === 'surgeLimit') st.surgeLimit = Number(el.value);
      else if (k === 'backupP') st.backup = el.value === '' ? null : { p: Number(el.value), at: st.backup ? st.backup.at : 30 };
      else if (k === 'backupAt' && st.backup) st.backup.at = Number(el.value);
    } else if (el.dataset.p) {
      const [k, f] = el.dataset.p.split('|'), p = st.players[Number(k)];
      if (f === 'specs') p.specs = el.value === 'none' ? [] : el.value.split('+');
      else if (f === 'startSpec') p[f] = Number(el.value);
      else if (f.startsWith('maxSwitches.')) p.maxSwitches = { ...normSwitches(p.maxSwitches), [f.slice(12)]: Number(el.value) };
      else if (f === 'healer') { st.players.forEach((q) => { q.healer = false; }); p.healer = el.checked; }   // one Healer Tech at most
      else if (el.type === 'checkbox') p[f] = el.checked;
      else p[f] = el.value;
    } else if (el.dataset.wave) {
      const [j, fld] = el.dataset.wave.split('|'); st.wave.rows[Number(j)][fld] = el.value.trim();
    } else if (el.dataset.stop) {
      const [k, plan] = el.dataset.stop.split('|'), p = st.players[Number(k)];
      p.rangedStop ||= {}; if (el.value === '') delete p.rangedStop[plan]; else p.rangedStop[plan] = Number(el.value);
    } else return;
    persist(); render();
  });

  // ---------------------------------------------------------------- Show raid
  const flat = [];
  /** A setup's Show raid: its raids played once (2,000), then fastest / top 10% / median / slowest / breakpoints. */
  function raidBar(run, bps, { seed = 'nshow', n = 2000 } = {}) {
    const idx = flat.push({ run, bps, seed, n }) - 1;
    return `<div class="small" style="margin-top:8px" data-nbar="${idx}"><button class="ghost sm" data-nraid="${idx}">Show raid</button> <span class="muted" data-nmsg="${idx}"></span></div><div style="width:0;min-width:100%"><div data-nout="${idx}"></div></div>`;
  }
  async function playAll(x) {
    if (x.all) return x.all;
    const all = [];
    for (let i = 0; i < x.n; i++) {
      const r = runNylo(x.run.players, team(), new Rng(`${x.seed}#${i}`), x.run.opts);
      all.push({ i, total: r.roomEnd, key: r.roomEnd == null ? '' : String(r.roomEnd) });
      if (i % 250 === 249) await breath();
    }
    return (x.all = all);
  }
  const draw = (x, i, title) => {
    const trace = [], r = runNylo(x.run.players, team(), new Rng(`${x.seed}#${i}`), { ...x.run.opts, trace });
    return timelineHtml({ trace, names: x.run.players.map((p) => p.name), bossName: 'Nylocas', end: r.end, from: r.i1 - 1, title, legend: LEGEND });
  };
  async function showRaid(idx) {
    const x = flat[idx], box = document.querySelector(`[data-nout="${idx}"]`), msg = document.querySelector(`[data-nmsg="${idx}"]`);   // (in this tab or the Full raid's)
    msg.textContent = `playing ${x.n.toLocaleString()} raids...`;
    const all = await playAll(x), ok = all.filter((z) => z.total != null);
    msg.textContent = '';
    const steps = successSteps(ok, all.length, all.length, x.bps);
    raidNav(box, steps, Math.max(0, steps.findIndex((z) => /Median/.test(z.label))), (s2) => draw(x, s2.pick.i, `${s2.label} raid (Nylocas) - ${x.run.opts && x.run.opts.waveDist ? 'room' : 'boss'} time ${fsec(s2.pick.total)} (${s2.pick.total} ticks) · ${s2.freq}`));
  }
  host.addEventListener('click', (e) => { const b = e.target.closest('button[data-nraid]'); if (b) showRaid(Number(b.dataset.nraid)); });

  /** A setup laid out. */
  const procHtml = (c, names, gears = []) => `<table style="margin-top:4px"><tr><th>Player</th><th>Start</th><th>Surge</th><th>Opening spec</th><th>Second spec</th><th>Max switches (melee / range / mage)</th><th title="Ranged tick fix: below that share of his HP, that green-form sequence (picked by the tick of their first attack there) is Twisted bows only">Ranged tick fix</th>${c.players.some((p) => p.healer) ? '<th>Healer Tech</th>' : ''}</tr>
    ${c.players.map((p, k) => `<tr><td>${esc(names[k])}</td><td>${p.startSpec}%</td><td>${p.surge ? 'yes' : '-'}</td><td>${SPEC_NAME[p.open]}</td><td>${seqName(p.specs)}</td><td>${(({ melee, range, mage }) => `${melee} / ${range} / ${mage}`)(normSwitches(p.maxSwitches))}</td><td class="small" style="text-align:left">${(() => { const row = (c.thr || []).find((x) => x.p === k), w = row ? row.weapon : (gears[k] ? fastWeaponOf(gears[k]) : null); return w ? stopHtml(stopLines(p, w, row)) : 'Twisted bows only (no 2-tick weapon)'; })()}</td>${c.players.some((q) => q.healer) ? `<td>${p.healer ? 'yes' : '-'}</td>` : ''}</tr>`).join('')}</table>
    <div class="small">Backup BGS: ${c.backup ? `${esc(names[c.backup.p])} while his Defence is ${c.backup.at}+` : 'none'}</div>`;
  const statsRow = (totals, bps) => { const v = totals.slice().sort((a, b) => a - b), n = v.length, asc = [...bps].sort((a, b) => a - b);
    return { mean: v.reduce((a, b) => a + b, 0) / n, med: v[n >> 1], q10: v[Math.max(0, Math.floor(n * 0.1) - 1)], q25: v[Math.max(0, Math.floor(n * 0.25) - 1)], fast: v[0], bp: asc.map((b) => v.filter((x) => x * 0.6 <= b + 1e-9).length / n) }; };

  /** A setup's report (n raids): boss time - or room time (waves + boss) when its opts have a waveDist - stats, charts
   *  and Show raid. */
  const reportHtml = (run, o = {}) => reportMulti([{ k: 'A', label: 'Nylocas', run }], o);
  /** Several setups (sets) on the same raids: each one's stats, the charts with a line / bars each, Show raid each.
   *  list: [{k, label, run}]. */
  async function reportMulti(list, { n = 4000, seed = `n${Date.now()}`, bps = [], prog = () => {}, title = null, stopped = () => false } = {}) {
    const asc = [...bps].sort((a, b) => a - b), multi = list.length > 1, rows = [];
    for (const x of list) {
      const run = x.run, wave = run.opts && run.opts.waveDist ? { dist: run.opts.waveDist, mean: run.opts.waveDist.reduce((a, [t, f]) => a + t * f, 0) } : null;
      const fx = { run, bps, seed, n }; flat.push(fx);
      const all = [], agg = {};
      for (let i = 0; i < n; i++) {
        const res = runNylo(run.players, team(), new Rng(`${seed}#${i}`), run.opts);
        all.push({ i, boss: res.boss, wave: res.wave, total: res.roomEnd, key: String(res.boss) });
        for (const [k, v] of Object.entries(res.st)) agg[k] = (agg[k] || 0) + v;
        if (i % 250 === 249) { prog(i + 1, x.k); await breath(); if (stopped()) throw new Error('Stopped.'); }
      }
      fx.all = all;
      rows.push({ ...x, wave, all, agg, idx: flat.length - 1, s: statsRow(all.map((z) => z.total ?? 99999), bps), sb: wave ? statsRow(all.map((z) => z.boss ?? 99999), []) : null });
    }
    const anyWave = rows.some((x) => x.wave), what = anyWave ? 'room time' : 'boss time';
    const lab = (x) => `<td class="rl" data-setcol="${x.k}" style="color:${multi ? 'var(--c)' : 'inherit'};font-weight:${multi ? 700 : 400}">${esc(x.label)}</td>`;
    const tr = (x, st, name, bp) => `<tr>${multi ? lab(x) : ''}${anyWave ? `<td class="rl">${name}</td>` : ''}<td>${fsec(st.med)}</td><td>${fsec(st.q25)}</td><td>${fsec(st.q10)}</td><td>${fsec(st.fast)}</td>${bp ? st.bp.map((q) => `<td>${(q * 100).toFixed(1)}%</td>`).join('') : asc.map(() => '<td>-</td>').join('')}</tr>`;
    const per = (x, k) => ((x.agg[k] || 0) / n).toFixed(2);
    const series = rows.map((x) => ({ total: x.all.filter((z) => z.total != null).map((z) => z.total), runs: n })), labels = rows.map((x) => x.label);
    return `<div class="vz-report"><h3 style="margin-top:0">${title || `${team()}-man Nylocas: ${n.toLocaleString()} raids${multi ? ` - ${rows.length} sets compared (the same raids for each)` : ''}`}</h3>
      ${anyWave ? `<div class="small muted" style="margin-bottom:4px">Room time = wave time (${rows.filter((x) => x.wave).map((x) => `${multi ? `${esc(x.label)}: ` : ''}average ${fmtWave(Math.round(x.wave.mean))}`).join(' · ')}) + boss time. Breakpoints are room times.</div>` : ''}
      <table><tr>${multi ? '<th>Set</th>' : ''}${anyWave ? '<th></th>' : ''}<th>Median</th><th>Top 25%</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}</tr>
      ${rows.map((x) => `${x.sb ? tr(x, x.sb, 'Boss time', false) : ''}${tr(x, x.s, x.wave ? 'Room time' : anyWave ? 'Boss time' : '', true)}`).join('')}</table>
      ${rows.map((x) => `<div class="small muted" style="margin-top:6px">${multi ? `<b>${esc(x.label)}</b> - ` : ''}Per raid: vengs ${per(x, 'veng')} (${per(x, 'vengDmg')} damage) · damage taken ${per(x, 'taken')} · thralls ${per(x, 'thrall')} · takeoffs ${per(x, 'takeoffs')} · under him ${per(x, 'under')} · Heal Others ${per(x, 'heals')} · redemptions ${per(x, 'redemptions')} · deaths ${per(x, 'deaths')} · wrong predictions ${per(x, 'wrong')} (first attack short of their full set ${per(x, 'short')})</div>`).join('')}
      <h3>How often each ${what} happens (per second, % of raids)</h3><div class="scroll">${chartBox((rg) => histogramSvg(series, labels, rg).replace('% of successful runs', '% of raids'))}</div>
      <h3>${anyWave ? 'Room' : 'Boss'} time this or faster - % of raids</h3><div class="sub">${bps.length ? `Vertical lines are your breakpoints (${what} at that or faster; times are rounded down to a tick).` : 'Add breakpoints to mark your target times.'}</div><div class="scroll">${chartBox((rg) => cumulativeSvg(series, labels, bps, rg).replace('% of successful runs finished by this time', `% of raids at this ${what} or faster`))}</div>
      ${rows.map((x) => `<div class="small" style="margin-top:8px" data-nbar="${x.idx}"><button class="ghost sm" data-nraid="${x.idx}">Show raid${multi ? ` - ${esc(x.label)}` : ''}</button> <span class="muted" data-nmsg="${x.idx}"></span></div><div style="width:0;min-width:100%"><div data-nout="${x.idx}"></div></div>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- report
  const repState = () => { const r = root(); r.report ||= { raids: 4000, seed: '', bps: '' }; r.report.sets ||= ['A']; r.report.labels ||= {}; return r.report; };
  const showRep = () => {
    const r = repState(), rs = root();
    for (const k of ['raids', 'seed', 'bps']) rep.querySelector(`[data-r="${k}"]`).value = r[k];
    rep.querySelector('[data-rsets]').innerHTML = `<div class="muted small">Sets to run (compared on the same raids)</div><div class="row" style="gap:8px">${SETS.map((k) => `<label class="pick" style="flex-direction:row;gap:4px;align-items:center" data-setcol="${k}"><input type="checkbox" data-nrset="${k}" ${rs.sets[k] ? '' : 'disabled'} ${rs.sets[k] && r.sets.includes(k) ? 'checked' : ''}>${k}</label><input data-nrlabel="${k}" placeholder="Set ${k} label" value="${esc(r.labels[k] || '')}" style="width:110px" ${rs.sets[k] ? '' : 'disabled'}>`).join('')}</div>`;
  };
  rep.addEventListener('change', (e) => {
    const r = repState(), el = e.target;
    if (el.dataset.nrset) { const k = el.dataset.nrset; r.sets = SETS.filter((x) => (x === k ? el.checked : r.sets.includes(x))); persist(); return; }
    if (el.dataset.nrlabel) { r.labels[el.dataset.nrlabel] = el.value; persist(); return; }
    if (!el.dataset.r) return; r[el.dataset.r] = el.dataset.r === 'raids' ? Number(el.value) || 4000 : el.value; persist();
  });
  let repJob = null;
  rep.addEventListener('click', async (e) => {
    if (e.target.dataset.act === 'stop') { if (repJob) repJob.stop = true; return; }
    if (e.target.dataset.act !== 'run' || repJob) return;
    const r = repState(), status = rep.querySelector('[data-rstatus]'), err = rep.querySelector('[data-rerr]'), out = rep.querySelector('[data-rout]');
    err.textContent = '';
    let bps = []; try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const n = Math.max(100, Number(r.raids) || 4000), seed = String(r.seed || '').trim() || `n${Date.now()}`;
    const keys = r.sets.filter((k) => setOf(k)); if (!keys.length) { err.textContent = 'Tick at least one set to run.'; return; }
    const list = [];
    for (const k of keys) {
      const st = setOf(k), wave = st.wave && st.wave.on ? parseWaveTimes(st.wave.rows) : null;
      if (wave && wave.error) { err.textContent = `Set ${k} wave time: ${wave.error}`; return; }
      list.push({ k, label: setLabel(k), run: { players: playersNow(st), opts: { ...roomOpts(st), plans: { backup: team() === 1 ? null : st.backup }, ...(wave ? { waveDist: wave.dist } : {}) } } });
    }
    const me = repJob = { stop: false }, go = rep.querySelector('[data-act="run"]'), stopB = rep.querySelector('[data-act="stop"]');
    go.disabled = true; stopB.disabled = false;
    try {
      out.innerHTML = await reportMulti(list, { n, seed, bps, stopped: () => me.stop, prog: (d, k) => { status.textContent = `Running ${keys.length > 1 ? `set ${k}: ` : ''}${d} / ${n}`; } });
      status.textContent = `Done: ${n.toLocaleString()} raids (seed ${seed}).`;
    } catch (x) { if (me.stop) status.textContent = 'Stopped.'; else err.textContent = `Couldn't run: ${x.message}`; }
    finally { repJob = null; go.disabled = false; stopB.disabled = true; }
  });

  // ---------------------------------------------------------------- solver
  const ALLOW = ['open', 'specs', 'start', 'surge', 'backup'];
  const EFFORT = { quick: { rounds: 4, stages: [[40, 0.15], [150, 3], [600, 1]], finalRaids: 1000, thrRaids: 800 },
    normal: { rounds: 8, stages: [[60, 0.2], [240, 4], [1000, 1]], finalRaids: 2000, thrRaids: 1500 },
    thorough: { rounds: 14, stages: [[100, 0.25], [400, 5], [2000, 1]], finalRaids: 5000, thrRaids: 3000 } };
  const solState = () => { const r = root(); r.solve ||= { bps: '', effort: 'normal', allow: Object.fromEntries(ALLOW.map((k) => [k, true])), search: { swaps: true, roles: false, thr: true } }; return r.solve; };
  const showSol = () => {
    const v = solState();
    sol.querySelector('[data-v="bps"]').value = v.bps; sol.querySelector('[data-v="effort"]').value = v.effort;
    for (const k of ALLOW) sol.querySelector(`[data-va="${k}"]`).checked = !!v.allow[k];
    for (const k of ['swaps', 'roles', 'thr']) sol.querySelector(`[data-vs="${k}"]`).checked = !!v.search[k];
  };
  sol.addEventListener('change', (e) => {
    const v = solState(), el = e.target;
    if (el.dataset.v) v[el.dataset.v] = el.value; else if (el.dataset.va) v.allow[el.dataset.va] = el.checked; else if (el.dataset.vs) v.search[el.dataset.vs] = el.checked; else return;
    persist();
  });
  let vjob = null, vres = null;
  /** Ranged tick fix: when each player stops each green-form sequence (Twisted bows only below that % of his HP). */
  const stopHtml = (lines) => lines.map((x) => `${esc(x.label)} - <b>${esc(x.text)}</b>`).join('<br>');
  const thrHtml = (thr, names, whose = 'best setup', solo = null) => {
    if (!thr) return '';
    const overlap = solo ? solo.flatMap((row) => [1, 2, 3].filter((k) => row.best[k] != null).map((k) => `${esc(names[row.p])} ${esc(planLabel(k, row.weapon) || '')} ${row.best[k]}%`)).join(', ') : '';
    if (!thr.length) return '<p class="muted small">Nobody has a blowpipe, Ascension crossbows or dragon darts - Twisted bows only.</p>';
    return `<h4 style="margin:12px 0 2px">Ranged tick fix: when to stop each sequence (${whose})</h4>
      <p class="muted small" style="margin:0 0 6px">Below that share of his HP they play Twisted bows only in his green form (each sequence is picked by the tick of their first attack there). Tested one player and sequence at a time, on the same raids - a stop is given only when it's clearly faster than going on${overlap ? ' - and when they\'re faster together too: here the ones that looked faster on their own (' + overlap + ') weren\'t, together' : ''}.</p>
      ${thr.map((row) => `<div class="small" style="margin-top:6px"><b>${esc(names[row.p])}</b> <span class="muted">(${esc(row.weapon)})</span><br>${stopHtml(stopLines({}, row.weapon, row))}</div>`).join('')}
      <button class="ghost sm" data-usethr style="margin-top:6px">Use these thresholds in the settings</button>`;
  };
  /** The recommendations played together against the setup they came from (they don't simply add up: they overlap). */
  const combHtml = (c, what) => (c ? `<div class="small" style="margin:10px 0 4px;padding:6px 8px;border:1px solid var(--line);border-radius:8px"><b>All together</b> (${esc(what)}): <b>${c.d >= 0 ? '+' : ''}${c.d.toFixed(2)}</b> ticks mean boss time <span class="muted">±${c.ci.toFixed(2)} (${(c.d * 0.6).toFixed(2)}s) - played together on the same raids, against the setup without them. Each player's and sequence's own number below is one change at a time; they overlap, so they don't add up.</span></div>` : '');
  const showResults = () => {
    const out = sol.querySelector('[data-vout]');
    if (!vres || !vres.items.length) { out.innerHTML = ''; return; }
    const { items, bps, names, thr } = vres, asc = [...bps].sort((a, b) => a - b);
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${team()}-man Nylocas: solver</h3>
      <div class="sub">Each played on the same ${items[0].totals.length.toLocaleString()} raids. Boss time: his spawn to the room's end.</div>
      <div class="scroll"><table class="sortlist"><tr><th>#</th><th>Median</th><th>Top 25%</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th>Setup</th><th></th></tr>
      ${items.map((r, i) => { const s = statsRow(r.totals, bps);
        const short = r.cfg.players.map((p, k) => `${esc(names[k])}: ${p.startSpec === 95 ? '95% · ' : ''}${p.surge ? 'surge · ' : ''}${p.open === 'none' ? '' : `${SPEC_NAME[p.open]} → `}${seqName(p.specs)}`).join('<br>') + (r.cfg.players.some((p) => p.healer) ? `<br>Healer Tech: ${esc(names[r.cfg.players.findIndex((p) => p.healer)])}` : '') + (r.cfg.backup ? `<br>backup BGS: ${esc(names[r.cfg.backup.p])} at ${r.cfg.backup.at}+` : '');
        return `<tr${i === 0 ? ' style="font-weight:700"' : ''}><td>${i + 1}</td><td>${fsec(s.med)}</td><td>${fsec(s.q25)}</td><td>${fsec(s.q10)}</td><td>${fsec(s.fast)}</td>${s.bp.map((q) => `<td>${(q * 100).toFixed(1)}%</td>`).join('')}
          <td class="small" style="text-align:left;font-weight:400">${short}</td>
          <td style="white-space:nowrap"><button class="ghost sm" data-vshow="${i}">Procedure</button> <button class="ghost sm" data-vuse="${i}">Use</button></td></tr>
          <tr class="sub-row" data-vproc="${i}" hidden><td colspan="${7 + asc.length}" style="text-align:left">${procHtml(r.cfg, names, r.run.players.map((q) => q.gear))}${raidBar(r.run, bps)}</td></tr>`; }).join('')}</table></div>
      ${vres.thrSolo ? '' : combHtml(vres.comb, 'every player\'s thresholds below')}${thrHtml(thr, names, 'best setup', vres.thrSolo)}</div>`;
  };
  sol.addEventListener('click', async (e) => {
    const el = e.target, status = sol.querySelector('[data-vstatus]'), err = sol.querySelector('[data-verr]'), vbtn = (a) => sol.querySelector(`[data-vact="${a}"]`);
    if (el.dataset.vshow != null) { const row = sol.querySelector(`[data-vproc="${el.dataset.vshow}"]`); row.hidden = !row.hidden; return; }
    if (el.dataset.vuse != null) {
      const r = vres.items[Number(el.dataset.vuse)], st = cur();
      r.cfg.players.forEach((p, k) => { st.players[k] = { ...st.players[k], ...structuredClone(p) }; });
      st.backup = r.cfg.backup ? { ...r.cfg.backup } : null; persist(); render(); status.textContent = 'Setup copied into the settings.'; return;
    }
    if (el.dataset.usethr != null && vres && vres.thr) {
      const st = cur();
      for (const row of vres.thr) { const rs = {}; for (const k of [1, 2, 3]) if (row.best[k] != null) rs[k] = row.best[k]; st.players[row.p].rangedStop = rs; }
      persist(); render(); status.textContent = 'Thresholds copied into the settings.'; return;
    }
    const a = el.dataset.vact; if (!a) return;
    if (a === 'stop') { if (vjob) { vjob.stopped = true; if (vjob.pool) vjob.pool.stop(); } return; }
    if (a !== 'run' || vjob) return;
    const v = solState(); err.textContent = '';
    let bps = []; try { bps = String(v.bps || '').trim() ? parseBreakpoints(v.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const t = team(), st = cur(), all = playersNow(st), ef = EFFORT[v.effort] || EFFORT.normal;
    const base = all.map((p) => ({ name: p.name, gear: p.gear })), names = all.map((p) => p.name), gear = all.map((p) => p.gear);
    const opts = roomOpts(st);
    const start = { players: st.players.map((p) => ({ open: p.open, specs: [...p.specs], clawMode: 'gain', startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge, tomeTickFix: p.tomeTickFix !== false, healer: t === 2 && !!p.healer, maxSwitches: normSwitches(p.maxSwitches) })), backup: st.backup && t > 1 ? { ...st.backup } : null };
    vjob = { stopped: false, pool: null }; const me = vjob;
    vbtn('run').disabled = true; vbtn('stop').disabled = false;
    const t1 = activeNow(), say = (txt) => { status.textContent = `${txt} (${Math.round((activeNow() - t1) / 1000)}s)`; };
    try {
      me.pool = new NyloPool(base, t, opts);
      const run = (...args) => me.pool.run(...args);
      const items = await solveNylo({ start, gear, allow: { ...v.allow, ...(t === 1 ? { backup: false } : {}) }, surgeLimit: Number(st.surgeLimit) || 0, swaps: !!v.search.swaps, roles: !!v.search.roles, bps, ...ef, top: 10 }, run, say, () => me.stopped);
      const mk = (cfg) => ({ players: base.map((b, k) => ({ ...b, plan: cfg.players[k] })), opts: { ...opts, plans: { backup: cfg.backup } } });
      vres = { items: items.map((r) => ({ ...r, run: mk(r.cfg) })), bps, names, thr: null }; showResults();
      if (v.search.thr && t > 1 && items.length && !me.stopped) {
        // the top 3 setups' ranged tick fix thresholds: each player and sequence on its own, then all together - kept (and
        // played: the setup's times, Show raid and Use carry them) only when together they're clearly faster on the same raids
        const none = (thr) => thr.map((x) => ({ ...x, best: { 1: null, 2: null, 3: null } }));
        for (let i = 0; i < Math.min(3, vres.items.length) && !me.stopped; i++) {
          const c0 = vres.items[i].cfg, tag = i ? `setup ${i + 1}: ` : '';
          const thr = await rangedThresholds(c0, gear, run, ef.thrRaids, (m) => say(`${tag}${m}`), () => me.stopped);
          if (me.stopped) break;
          let keepThr = none(thr), comb = null;
          if (thr.some((x) => [1, 2, 3].some((k) => x.best[k] != null))) {
            say(`${tag}All the thresholds together`); comb = await pairedChange(c0, withThresholds(c0, thr), run, ef.thrRaids);
            if (comb.d < -comb.ci) keepThr = thr;
          }
          if (keepThr === thr) {
            const cfg = { ...withThresholds(c0, thr), thr, comb }, [res] = await run([cfg], 0, ef.finalRaids, 'nfinal');
            vres.items[i] = { ...vres.items[i], cfg, totals: res.totals, kills: res.kills, score: scoreOf(res.totals, bps), run: mk(cfg) };
          } else vres.items[i] = { ...vres.items[i], cfg: { ...c0, thr: keepThr, comb, thrSolo: comb ? thr : null } };
          if (i === 0) { vres.thr = keepThr; vres.comb = comb; vres.thrSolo = vres.items[0].cfg.thrSolo || null; }
          showResults();
        }
        // (thresholds can move a setup up: best first again)
        const top3 = vres.items.slice(0, 3).sort((x, y) => (x.score && y.score ? (scoreBetter(x.score, y.score) ? -1 : scoreBetter(y.score, x.score) ? 1 : 0) : 0));
        vres.items.splice(0, top3.length, ...top3); const c = vres.items[0].cfg; if (c.thr) { vres.thr = c.thr; vres.comb = c.comb || null; vres.thrSolo = c.thrSolo || null; } showResults();
      }
      status.textContent = me.stopped ? 'Stopped.' : `Done in ${Math.round((activeNow() - t1) / 1000)}s.`;
    } catch (x) { status.textContent = me.stopped ? 'Stopped.' : ''; if (!me.stopped) err.textContent = `Couldn't solve: ${x.message}`; }
    finally { if (me.pool) me.pool.stop(); vjob = null; vbtn('run').disabled = false; vbtn('stop').disabled = true; }
  });

  // ---------------------------------------------------------------- optimizer
  const OPT_RAIDS = { quick: 800, normal: 1500, thorough: 3000 };
  let ojob = null, ores = null;
  const bgsHtml = (b, names) => {
    if (!b) return '';
    if (!b.rows.length) return '<h4 style="margin:12px 0 2px">Backup BGS</h4><p class="muted small">Nobody has a Bandos godsword.</p>';
    const cell = (x) => `<td style="${b.best && b.best.at === x.at && b.best.p === x.p ? 'font-weight:700;background:rgba(80,200,120,.15)' : ''}${x.d > x.ci ? ';color:var(--bad,#e66)' : ''}">${x.d >= 0 ? '+' : ''}${x.d.toFixed(2)}<span class="muted" style="font-size:10px"> ±${x.ci.toFixed(2)}</span></td>`;
    return `<h4 style="margin:12px 0 2px">Backup BGS</h4>
      <p class="muted small" style="margin:0 0 6px">Change in mean boss time (ticks; negative is faster, ± the 95% range) against no backup BGS, if that player BGSes while his Defence is at or above each value (after the opening BGSs). Best: <b>${b.best ? `${esc(names[b.best.p])} at Defence ${b.best.at}+` : 'no backup BGS'}</b>${b.best ? '' : ' (none is clearly faster)'}.</p>
      <div class="scroll"><table class="bt"><tr><th>Player</th>${BACKUP_ATS.map((a) => `<th>Defence ${a}+</th>`).join('')}</tr>
      ${b.rows.map((r) => `<tr><td class="rl">${esc(names[r.p])}</td>${r.ats.map((x) => cell({ ...x, p: r.p })).join('')}</tr>`).join('')}</table></div>
      <button class="ghost sm" data-usebgs style="margin-top:6px">Use this in the settings</button>`;
  };
  const showOpt = () => { const out = opt.querySelector('[data-oout]'); if (!ores) { out.innerHTML = ''; return; }
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${team()}-man Nylocas: optimizer</h3><div class="sub">Your setup, ${ores.n.toLocaleString()} raids for each change.</div>${combHtml(ores.comb, ores.combWhat)}${bgsHtml(ores.bgs, ores.names)}${thrHtml(ores.thr, ores.names, 'your setup')}</div>`; };
  opt.addEventListener('click', async (e) => {
    const el = e.target, status = opt.querySelector('[data-ostatus]'), err = opt.querySelector('[data-oerr]'), obtn = (a) => opt.querySelector(`[data-oact="${a}"]`);
    if (el.dataset.usebgs != null && ores && ores.bgs) { const st = cur(); st.backup = ores.bgs.best ? { p: ores.bgs.best.p, at: ores.bgs.best.at } : null; persist(); render(); status.textContent = 'Backup BGS set in the settings.'; return; }
    if (el.dataset.usethr != null && ores && ores.thr) { const st = cur(); for (const row of ores.thr) { const rs = {}; for (const k of [1, 2, 3]) if (row.best[k] != null) rs[k] = row.best[k]; st.players[row.p].rangedStop = rs; } persist(); render(); status.textContent = 'Thresholds set in the settings.'; return; }
    const a = el.dataset.oact; if (!a) return;
    if (a === 'stop') { if (ojob) { ojob.stopped = true; if (ojob.pool) ojob.pool.stop(); } return; }
    if (a !== 'run' || ojob) return;
    err.textContent = '';
    const t = team(), st = cur(), all = playersNow(st), n = OPT_RAIDS[opt.querySelector('[data-o="effort"]').value] || 1500;
    const want = (k) => opt.querySelector(`[data-oc="${k}"]`).checked;
    const base = all.map((p) => ({ name: p.name, gear: p.gear })), names = all.map((p) => p.name), gear = all.map((p) => p.gear);
    const cfgNow = { players: st.players.map((p) => structuredClone(p)), backup: t > 1 && st.backup ? { ...st.backup } : null };
    ojob = { stopped: false, pool: null }; const me = ojob;
    obtn('run').disabled = true; obtn('stop').disabled = false;
    const t1 = activeNow(), say = (txt) => { status.textContent = `${txt} (${Math.round((activeNow() - t1) / 1000)}s)`; };
    ores = { n, names, bgs: null, thr: null }; showOpt();
    try {
      me.pool = new NyloPool(base, t, roomOpts(st));
      const run = (...x) => me.pool.run(...x);
      if (want('bgs') && t > 1 && !me.stopped) { ores.bgs = await backupThresholds(cfgNow, gear, run, n, say, () => me.stopped); showOpt(); }
      if (want('thr') && t > 1 && !me.stopped) { ores.thr = await rangedThresholds(cfgNow, gear, run, n, say, () => me.stopped); showOpt(); }
      // everything it recommends, played together against your setup
      const bb = ores.bgs && ores.bgs.best, anyThr = ores.thr && ores.thr.some((r) => Object.values(r.best).some((x) => x != null));
      if ((bb || anyThr) && !me.stopped) {
        say('All the recommendations together');
        let all = anyThr ? withThresholds(cfgNow, ores.thr) : cfgNow;
        if (bb) all = { ...all, backup: { p: bb.p, at: bb.at } };
        ores.comb = await pairedChange(cfgNow, all, run, n);
        ores.combWhat = [bb ? `backup BGS: ${names[bb.p]} at Defence ${bb.at}+` : '', anyThr ? 'every player\'s thresholds below' : ''].filter(Boolean).join(' + ');
        showOpt();
      }
      status.textContent = me.stopped ? 'Stopped.' : `Done in ${Math.round((activeNow() - t1) / 1000)}s.`;
    } catch (x) { status.textContent = me.stopped ? 'Stopped.' : ''; if (!me.stopped) err.textContent = `Couldn't optimize: ${x.message}`; }
    finally { if (me.pool) me.pool.stop(); ojob = null; obtn('run').disabled = false; obtn('stop').disabled = true; }
  });

  /** Full raid: the Nylocas Solver on the Full raid's gear, surge cooldowns carried in (ticks per player, from the room's
   *  start: the waves run them down), Max switches, Healer Tech (duos), restore doses and wave times. -> ranked setups,
   *  each with what a full raid plays ({players, opts}). */
  async function fullRaidSolve({ gearSet: gs, surgeCd, mustSurge = null, maxSwitches = [], healer = null, restores = 8, waveDist, bps = [], effort = 'normal', keep = 3, say = () => {}, stopped = () => false, onPool = () => {} }) {
    const t = team(), gp = gearOf(gs);
    const base = Array.from({ length: t }, (_, k) => { const g = (gp && gp[k]) || blankPlayer(k); return { name: g.name || `Player ${k + 1}`, gear: g, surgeCd: surgeCd[k] || 0 }; });
    const names = base.map((b) => b.name), gear = base.map((b) => b.gear);
    const opts = { takeoffs: true, offPrayVeng: true, restores: Number(restores) || 0, waveDist };
    const extra = (k) => ({ maxSwitches: normSwitches(maxSwitches[k]), healer: t === 2 && healer === k });
    // mustSurge (a full raid plan's surgers here): their surge is on throughout the search - their specs are planned around it
    const start = { players: gear.map((g, k) => ({ ...defaultPlan(g), surge: !!(mustSurge && mustSurge.includes(k)), ...extra(k) })), backup: null };
    const pool = new NyloPool(base, t, opts); onPool(pool);
    try {
      const ef = EFFORT[effort] || EFFORT.normal;
      const groups = groupsOf(base.map((b, k) => JSON.stringify([{ ...b.gear, name: null }, b.surgeCd, extra(k)])));   // (identical players: one key for their traded plans)
      const items = await solveNylo({ start, gear, allow: Object.fromEntries(ALLOW.map((k) => [k, k !== 'surge' || !mustSurge])), surgeLimit: t, swaps: true, roles: true, bps, ...ef, top: 10, groups }, (...a) => pool.run(...a), say, stopped);
      // each kept setup's ranged tick fix thresholds (Twisted bows only below them), as the Optimizer finds them - kept only
      // when they're clearly faster on the same raids
      const run = (cfgs, from, to, seed) => pool.run(cfgs, from, to, seed);
      for (const [i, r] of items.slice(0, keep).entries()) {
        if (stopped()) break;
        const thr = await rangedThresholds(r.cfg, gear, run, ef.thrRaids, (m) => say(`setup ${i + 1}: ${m}`), stopped);
        items[i] = { ...r, cfg: { ...r.cfg, thr } };   // (the procedure says when to stop, or that it makes no difference)
        if (!thr.some((x) => [1, 2, 3].some((k) => x.best[k] != null))) continue;
        const cfg = { ...withThresholds(r.cfg, thr), thr }, ch = await pairedChange(r.cfg, cfg, run, ef.thrRaids);
        if (ch.d < -ch.ci) { const [res] = await run([cfg], 0, ef.finalRaids, 'nfinal'); items[i] = { ...r, cfg, totals: res.totals, thr }; }
        else items[i] = { ...r, cfg: { ...r.cfg, thr: thr.map((x) => ({ ...x, best: { 1: null, 2: null, 3: null } })) } };   // together they don't help: none
      }
      return items.map((r) => ({ ...r, cfg: { ...r.cfg, players: r.cfg.players.map((p, k) => ({ ...p, ...extra(k) })) },
        run: { players: base.map((b, k) => ({ ...b, plan: { ...r.cfg.players[k], ...extra(k) } })), opts: { ...opts, plans: { backup: r.cfg.backup } }, thr: r.cfg.thr || null } }));   // thr: its tick fix thresholds (for the procedure)
    } finally { pool.stop(); }
  }
  /** Full raid: show setups (best first) in this tab's Solver results. */
  const fullRaidShow = (items, bps) => { vres = { items, bps, names: items[0] ? items[0].run.players.map((p) => p.name) : [], thr: null }; showResults(); };
  /** Full raid: a setup's procedure (its plan and Show raid) into `el`. */
  const procedure = (el, { cfg, names, run }, bps = []) => { el.innerHTML = `${procHtml(cfg, names, run.players.map((q) => q.gear))}${raidBar(run, bps)}`; if (!el.dataset.wired) { el.dataset.wired = '1'; el.addEventListener('click', (e) => { const b = e.target.closest('button[data-nraid]'); if (b && !host.contains(b)) showRaid(Number(b.dataset.nraid)); }); } };

  function refreshAll() { render(); showRep(); showSol(); }
  return { refresh: () => { state = loadKey(STORE); refreshAll(); }, api: { fullRaidSolve, fullRaidShow, procedure, reportHtml, team } };
}
