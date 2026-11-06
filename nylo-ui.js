// Nylocas tab (solo - 5s; duos: Healer Tech, solos: under him every form): per-player room settings (opening spec, damage specs, claw rule, start spec, surge, tome tick fix,
// Twisted-bows-only thresholds) and the team's backup BGS, saved in this browser; a Report (raids played, boss times,
// Show raid) and the Solver (best spec setups, then each player's ranged tick fix thresholds). Gear from the Gear tab.
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { blankPlayer } from './engine/loadout.js';
import { parseBreakpoints } from './engine/optimize.js';
import { histogramSvg, cumulativeSvg, chartBox } from './engine/report.js';
import { runNylo, NYLO_HP, FAST, parseWaveTimes, drawWave, fmtWave } from './engine/nylo.js';
import { solveNylo, rangedThresholds, predictionThresholds, predictionText, PRED_FORMS, PRED_DEFAULT, PRED_OTHER, defaultPlan, canSeq, canOpen, OPENS, SEQS, seqName, SPEC_NAME, BACKUP_ATS, STOP_PCTS, PLAN_NAMES, better as scoreBetter } from './engine/nylosolve.js';
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
    ${tabsHtml([['rep', 'Report'], ['solve', 'Solver']])}
    ${pane('rep', 'data-rep', `
      <div class="row" style="margin-top:10px">
        <label>Raids<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <label title="Target boss times (m:ss: his spawn to the room's end)">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>`)}
    ${pane('solve', 'data-solve', `
      <p class="muted small" style="margin-top:8px">Searches for the best setup from the one above: each player's opening spec (none, BGS, claws, halberd), their second spec(s) in order (claws, tome, ZCB, halberd - one or two, either order),
        the claw rule (only when it gains a usable tick, or as soon as they have 50%), start spec (95 / 100), surges (within the Surge potions limit) and the backup BGS (who, and at which Defence: ${BACKUP_ATS.join(', ')}+) -
        within the gear each player has. Each round it tries every single change (with Role changes: a player's opener and damage specs together; with Swaps: two players' specs swapped, a surge moved) on a few raids,
        then the best on more, and keeps the best if it beats the current setup, until nothing does. The top setups are then played on more raids and ranked: with breakpoints by the share at the fastest one (then the next), otherwise by the mean boss time.
        Then for the best setup: each player's ranged tick fix thresholds (the % of his HP to stop each green-form sequence at - 4bp tbow, tbow bp tbow, 3bp tbow - and play Twisted bows only; bp is their 2-tick hit).</p>
      <div class="row">
        <label title="Target boss times (m:ss)">Breakpoints (optional)<input data-v="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <label>Effort<select data-v="effort"><option value="quick">Quick</option><option value="normal">Normal</option><option value="thorough">Thorough</option></select></label>
        <button data-vact="run">Solve</button><button data-vact="stop" class="ghost" disabled>Stop</button>
      </div>
      <div class="row" style="margin-top:6px">${[['open', 'Opening specs'], ['specs', 'Second specs'], ['clawMode', 'Claw rule'], ['start', 'Start spec'], ['surge', 'Surges'], ['backup', 'Backup BGS']]
        .map(([k, l]) => `${pick()}><input type="checkbox" data-va="${k}">${l}</label>`).join('')}
        <span class="muted small">Search:</span>${pick()} title="Also swap two players' specs, and move a surge, in one step"><input type="checkbox" data-vs="swaps">Swaps</label>
        ${pick()} title="Also change a player's opener and damage specs together"><input type="checkbox" data-vs="roles">Role changes</label>
        ${pick()} title="After the search: each player's Twisted-bows-only thresholds for the best setup"><input type="checkbox" data-vs="thr">Ranged thresholds</label>
        ${pick()} title="After the search: what each player should predict between forms (cross praying), by his HP, for the best setup - kept at the default when changing it isn't clearly faster"><input type="checkbox" data-vs="pred">Predictions by HP</label></div>
      <div data-vstatus class="muted" style="margin-top:8px"></div><div data-verr class="err"></div><div data-vout style="margin-top:8px"></div>`)}</div>`;
  wireSubtabs(host, 'verzikSim.nyloTabs.v1');
  const cfg = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]'), sol = host.querySelector('[data-solve]');

  const root = () => { const t = team(); state[t] ||= {}; return state[t]; };
  const gearOf = (gs) => { const set = gearSet(loadGear(), team(), gs); return set ? playersOf(set, team()) : null; };
  const gearK = (st, k) => { const gp = gearOf(st.gearSet); return (gp && gp[k]) || blankPlayer(k); };
  const cur = () => {
    const r = root(), t = team();
    r.set ||= { gearSet: 'A', surgeLimit: 0, takeoffs: true, backup: null, players: [] };
    const st = r.set;
    for (let k = 0; k < t; k++) st.players[k] = { ...defaultPlan(gearK(st, k)), rangedStop: {}, ...(st.players[k] || {}) };
    st.players.length = t;
    return st;
  };
  // room options from the settings: takeoffs, off-prayer vengs (solos: off by default), restore doses (duos / solos)
  const roomOpts = (st) => ({ takeoffs: st.takeoffs !== false, offPrayVeng: st.offPrayVeng ?? team() !== 1, restores: Number(st.restores ?? 8) });
  const playersNow = (st) => { const gp = gearOf(st.gearSet); return st.players.map((p, k) => ({ name: (gp && gp[k] && gp[k].name) || `Player ${k + 1}`, gear: (gp && gp[k]) || blankPlayer(k), plan: p })); };

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
    cfg.innerHTML = `<h3 style="margin-top:0">Nylocas boss <span class="muted small">(${t}-man · ${NYLO_HP[t]} HP)</span></h3>
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
        <th title="Their first attack (his melee form)">Opening spec</th><th title="After their opener, in order, each when his form allows: claws / halberd (melee), tome (magic), ZCB (in place of a Twisted bow, ranged). Never their first attack">Second spec</th>
        <th title="Cross praying: between forms they wear the gear of the form they predict (he's magic or melee -> ranged; ranged -> melee; a tome spec planned -> magic) and pray for the other. Guessed wrong: this many item switches a tick before their first attack (the weapon first, then what adds the most damage)">Max switches on<br>wrong prediction</th>
        ${t === 2 ? '<th title="Feeds HP and Vengs to other player with redemption - requires locator orb and restore doses">Healer Tech</th>' : ''}
        ${t === 1 ? '' : [1, 2, 3].map((k) => `<th title="Below this % of his HP they stop this green-form sequence and play Twisted bows only (bp: their 2-tick hit - blowpipe, crossbows or darts). Which sequence depends on their first attack in the form: its 2nd tick 4bp tbow, 3rd tbow bp tbow, 4th 3bp tbow">Stop sequence at HP:<br>${PLAN_NAMES[k]}</th>`).join('')}</tr>
      ${st.players.map((p, k) => { const gk = gearK(st, k); return `<tr><td class="rl">${esc(names[k])}</td>
        <td><select data-p="${k}|startSpec">${opt([[100, '100'], [95, '95']], p.startSpec)}</select></td>
        <td style="text-align:center"><input type="checkbox" data-p="${k}|surge" ${p.surge ? 'checked' : ''}></td>
        <td><select data-p="${k}|open">${OPENS.map(([v, l]) => `<option value="${v}" ${v === p.open ? 'selected' : ''} ${canOpen(gk, v) ? '' : 'disabled'}>${l}</option>`).join('')}</select></td>
        <td><select data-p="${k}|specs" style="width:150px">${SEQS.map((s) => `<option value="${seqKey(s)}" ${seqKey(s) === seqKey(p.specs) ? 'selected' : ''} ${canSeq(gk, s) && !(t === 1 && s.includes('tome')) ? '' : 'disabled'}>${seqName(s)}</option>`).join('')}</select></td>
        <td><select data-p="${k}|maxSwitches">${opt([1, 2, 3, 4, 5, 6, 7, 8].map((x) => [x, x]), p.maxSwitches ?? 8)}</select></td>
        ${t === 2 ? `<td style="text-align:center"><input type="checkbox" data-p="${k}|healer" ${p.healer ? 'checked' : ''}></td>` : ''}
        ${t === 1 ? '' : `<td>${stopSel(k, 1)}</td><td>${stopSel(k, 2)}</td><td>${stopSel(k, 3)}</td>`}</tr>`; }).join('')}</table></div>
      <div style="margin-top:10px">${pick()} title="Add the Nylocas waves before the boss: room time = wave time + boss time (the Report's numbers and charts). In a full raid it also runs down surge cooldowns from the rooms before"><input type="checkbox" data-s="waveOn" ${st.wave && st.wave.on ? 'checked' : ''}>Include wave time</label></div>
      ${st.wave && st.wave.on ? (() => { const w = parseWaveTimes(st.wave.rows); return `<table class="bt" style="margin-top:4px"><tr><th>Wave time</th><th>Frequency</th><th></th></tr>
        ${st.wave.rows.map((r, j) => `<tr><td><input data-wave="${j}|time" value="${esc(r.time ?? '')}" placeholder="m:ss.s" style="width:80px"></td><td><input data-wave="${j}|freq" value="${esc(r.freq ?? '')}" placeholder="%" style="width:60px"> %</td><td>${st.wave.rows.length > 1 ? `<button class="ghost sm" data-wavedel="${j}">Remove</button>` : ''}</td></tr>`).join('')}</table>
        <button class="ghost sm" data-waveadd style="margin-top:4px">+ Add wave time</button>
        <div class="small ${w.error ? 'warn' : 'muted'}" style="margin-top:4px">${w.error ? esc(w.error) : `Average wave time ${fmtWave(Math.round(w.mean))} (${(w.mean * 0.6).toFixed(2)}s) - times are a whole tick, 2.4s (4 ticks) apart; frequencies add up to 100%.`}</div>`; })() : ''}
      <div class="small muted" style="margin-top:6px">Cross praying (they predict his next form: its gear on, the other form's prayers):
        ${st.players.map((p, k) => `<div>${esc(names[k])}: ${esc(predictionText(p.predictFlip || {}))}${p.specs.includes('tome') ? ' (magic while a tome spec is planned)' : ''}${p.predictFlip && Object.keys(p.predictFlip).length ? ` <button class="ghost sm" data-resetpred="${k}">Default</button>` : ''}</div>`).join('')}</div>`;
  }
  cfg.addEventListener('click', (e) => {
    const st = cur(), d = e.target.dataset;
    if (d.waveadd != null) { st.wave.rows.push({ time: '', freq: '' }); persist(); render(); return; }
    if (d.wavedel != null) { st.wave.rows.splice(Number(d.wavedel), 1); persist(); render(); return; }
    const k = d.resetpred; if (k == null) return;
    delete st.players[Number(k)].predictFlip; persist(); render();
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
      else if (f === 'startSpec' || f === 'maxSwitches') p[f] = Number(el.value);
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
      if (i % 250 === 249) await new Promise((z) => setTimeout(z, 0));
    }
    return (x.all = all);
  }
  const draw = (x, i, title) => {
    const trace = [], r = runNylo(x.run.players, team(), new Rng(`${x.seed}#${i}`), { ...x.run.opts, trace });
    return timelineHtml({ trace, names: x.run.players.map((p) => p.name), bossName: 'Nylocas', end: r.end + 1, from: r.i1 - 1, title, legend: LEGEND });
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
  const procHtml = (c, names) => `<table style="margin-top:4px"><tr><th>Player</th><th>Start</th><th>Surge</th><th>Opening spec</th><th>Second spec</th><th>Claw rule</th><th>Max switches</th>${c.players.some((p) => p.healer) ? '<th>Healer Tech</th>' : ''}</tr>
    ${c.players.map((p, k) => `<tr><td>${esc(names[k])}</td><td>${p.startSpec}%</td><td>${p.surge ? 'yes' : '-'}</td><td>${SPEC_NAME[p.open]}</td><td>${seqName(p.specs)}</td><td>${p.specs.includes('claw') ? (p.clawMode === 'gain' ? 'for a tick' : 'as soon as they can') : '-'}</td><td>${p.maxSwitches ?? 8}</td>${c.players.some((q) => q.healer) ? `<td>${p.healer ? 'yes' : '-'}</td>` : ''}</tr>`).join('')}</table>
    <div class="small">Backup BGS: ${c.backup ? `${esc(names[c.backup.p])} while his Defence is ${c.backup.at}+` : 'none'}</div>`;
  const statsRow = (totals, bps) => { const v = totals.slice().sort((a, b) => a - b), n = v.length, asc = [...bps].sort((a, b) => a - b);
    return { mean: v.reduce((a, b) => a + b, 0) / n, med: v[n >> 1], q10: v[Math.max(0, Math.floor(n * 0.1) - 1)], fast: v[0], bp: asc.map((b) => v.filter((x) => x * 0.6 <= b + 1e-9).length / n) }; };

  /** A setup's report (n raids): boss time - or room time (waves + boss) when its opts have a waveDist - stats, charts
   *  and Show raid. */
  async function reportHtml(run, { n = 4000, seed = `n${Date.now()}`, bps = [], prog = () => {}, title = null } = {}) {
    const wave = run.opts && run.opts.waveDist ? { dist: run.opts.waveDist, mean: run.opts.waveDist.reduce((a, [t, f]) => a + t * f, 0) } : null;
    const x = { run, bps, seed, n }; flat.push(x);
    const all = []; const agg = {};
    for (let i = 0; i < n; i++) {
      const res = runNylo(run.players, team(), new Rng(`${seed}#${i}`), run.opts);
      all.push({ i, boss: res.boss, wave: res.wave, total: res.roomEnd, key: String(res.boss) });
      for (const [k, v] of Object.entries(res.st)) agg[k] = (agg[k] || 0) + v;
      if (i % 250 === 249) { prog(i + 1); await new Promise((z) => setTimeout(z, 0)); }
    }
    x.all = all;
    const s = statsRow(all.map((z) => z.total ?? 99999), bps), sb = wave ? statsRow(all.map((z) => z.boss ?? 99999), []) : null, idx = flat.length - 1, asc = [...bps].sort((a, b) => a - b);
    const per = (k) => ((agg[k] || 0) / n).toFixed(2);
    return `<div class="vz-report"><h3 style="margin-top:0">${title || `${team()}-man Nylocas: ${n.toLocaleString()} raids`}</h3>
      ${wave ? `<div class="small muted" style="margin-bottom:4px">Room time = wave time (average ${fmtWave(Math.round(wave.mean))}) + boss time. Breakpoints are room times.</div>` : ''}
      <table><tr>${wave ? '<th></th>' : ''}<th>Mean</th><th>Median</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}</tr>
      ${sb ? `<tr><td class="rl">Boss time</td><td>${fsec(sb.mean)}</td><td>${fsec(sb.med)}</td><td>${fsec(sb.q10)}</td><td>${fsec(sb.fast)}</td>${asc.map(() => '<td>-</td>').join('')}</tr>` : ''}
      <tr>${wave ? '<td class="rl">Room time</td>' : ''}<td>${fsec(s.mean)}</td><td>${fsec(s.med)}</td><td>${fsec(s.q10)}</td><td>${fsec(s.fast)}</td>${s.bp.map((q) => `<td>${(q * 100).toFixed(1)}%</td>`).join('')}</tr></table>
      <div class="small muted" style="margin-top:6px">Per raid: vengs ${per('veng')} (${per('vengDmg')} damage) · damage taken ${per('taken')} · thralls ${per('thrall')} · takeoffs ${per('takeoffs')} · under him ${per('under')} · Heal Others ${per('heals')} · redemptions ${per('redemptions')} · deaths ${per('deaths')} · wrong predictions ${per('wrong')} (first attack short of their full set ${per('short')})</div>
      ${(() => { const series = [{ total: all.filter((z) => z.total != null).map((z) => z.total), runs: n }];
        const what = wave ? 'room time' : 'boss time';
        return `<h3>How often each ${what} happens (per second, % of raids)</h3><div class="scroll">${chartBox((rg) => histogramSvg(series, ['Nylocas'], rg).replace('% of successful runs', '% of raids'))}</div>
      <h3>${wave ? 'Room' : 'Boss'} time this or faster - % of raids</h3><div class="sub">${bps.length ? `Vertical lines are your breakpoints (${what} at that or faster; times are rounded down to a tick).` : 'Add breakpoints to mark your target times.'}</div><div class="scroll">${chartBox((rg) => cumulativeSvg(series, ['Nylocas'], bps, rg).replace('% of successful runs finished by this time', `% of raids at this ${what} or faster`))}</div>`; })()}
      <div class="small" style="margin-top:8px" data-nbar="${idx}"><button class="ghost sm" data-nraid="${idx}">Show raid</button> <span class="muted" data-nmsg="${idx}"></span></div><div style="width:0;min-width:100%"><div data-nout="${idx}"></div></div></div>`;
  }

  // ---------------------------------------------------------------- report
  const repState = () => { const r = root(); r.report ||= { raids: 4000, seed: '', bps: '' }; return r.report; };
  const showRep = () => { const r = repState(); for (const k of ['raids', 'seed', 'bps']) rep.querySelector(`[data-r="${k}"]`).value = r[k]; };
  rep.addEventListener('change', (e) => { const r = repState(), el = e.target; if (!el.dataset.r) return; r[el.dataset.r] = el.dataset.r === 'raids' ? Number(el.value) || 4000 : el.value; persist(); });
  rep.addEventListener('click', async (e) => {
    if (e.target.dataset.act !== 'run') return;
    const r = repState(), status = rep.querySelector('[data-rstatus]'), err = rep.querySelector('[data-rerr]'), out = rep.querySelector('[data-rout]');
    err.textContent = '';
    let bps = []; try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const st = cur(), players = playersNow(st), n = Math.max(100, Number(r.raids) || 4000), seed = String(r.seed || '').trim() || `n${Date.now()}`;
    const wave = st.wave && st.wave.on ? parseWaveTimes(st.wave.rows) : null;
    if (wave && wave.error) { err.textContent = `Wave time: ${wave.error}`; return; }
    const run = { players, opts: { ...roomOpts(st), plans: { backup: team() === 1 ? null : st.backup }, ...(wave ? { waveDist: wave.dist } : {}) } };
    out.innerHTML = await reportHtml(run, { n, seed, bps, prog: (d) => { status.textContent = `Running... ${d} / ${n}`; } });
    status.textContent = `Done: ${n.toLocaleString()} raids (seed ${seed}).`;
  });

  // ---------------------------------------------------------------- solver
  const ALLOW = ['open', 'specs', 'clawMode', 'start', 'surge', 'backup'];
  const EFFORT = { quick: { rounds: 4, stages: [[40, 0.15], [150, 3], [600, 1]], finalRaids: 1000, thrRaids: 800 },
    normal: { rounds: 8, stages: [[60, 0.2], [240, 4], [1000, 1]], finalRaids: 2000, thrRaids: 1500 },
    thorough: { rounds: 14, stages: [[100, 0.25], [400, 5], [2000, 1]], finalRaids: 5000, thrRaids: 3000 } };
  const solState = () => { const r = root(); r.solve ||= { bps: '', effort: 'normal', allow: Object.fromEntries(ALLOW.map((k) => [k, true])), search: { swaps: true, roles: false, thr: true, pred: true } }; return r.solve; };
  const showSol = () => {
    const v = solState();
    sol.querySelector('[data-v="bps"]').value = v.bps; sol.querySelector('[data-v="effort"]').value = v.effort;
    for (const k of ALLOW) sol.querySelector(`[data-va="${k}"]`).checked = !!v.allow[k];
    for (const k of ['swaps', 'roles', 'thr', 'pred']) sol.querySelector(`[data-vs="${k}"]`).checked = !!v.search[k];
  };
  sol.addEventListener('change', (e) => {
    const v = solState(), el = e.target;
    if (el.dataset.v) v[el.dataset.v] = el.value; else if (el.dataset.va) v.allow[el.dataset.va] = el.checked; else if (el.dataset.vs) v.search[el.dataset.vs] = el.checked; else return;
    persist();
  });
  let vjob = null, vres = null;
  const thrHtml = (thr, names) => {
    if (!thr) return '';
    if (!thr.length) return '<p class="muted small">Nobody has a blowpipe, Ascension crossbows or dragon darts - Twisted bows only.</p>';
    const cell = (x, best) => `<td style="${x.pct === best ? 'font-weight:700;background:rgba(80,200,120,.15)' : ''}${x.d > x.ci ? ';color:var(--bad,#e66)' : ''}">${x.d >= 0 ? '+' : ''}${x.d.toFixed(2)}<span class="muted" style="font-size:10px"> ±${x.ci.toFixed(2)}</span></td>`;
    return `<h4 style="margin:12px 0 2px">Ranged tick fix thresholds (best setup)</h4>
      <p class="muted small" style="margin:0 0 6px">Change in mean boss time (ticks; negative is faster, ± the 95% range) if that player stops each green-form sequence below each % of his HP and plays Twisted bows only (bp: their 2-tick hit) - one player and sequence at a time, on the same raids. Bold: their best, when it's clearly faster than continuing till he's dead.</p>
      ${thr.map((row) => `<div class="small" style="margin-top:6px"><b>${esc(names[row.p])}</b> <span class="muted">(${esc(row.weapon)})</span> - ${[1, 2, 3].map((k) => `${PLAN_NAMES[k]}: <b>${row.best[k] == null ? 'continue till dead' : `stop at ${row.best[k]}%`}</b>`).join(' · ')}</div>
        <div class="scroll"><table class="bt"><tr><th>Sequence</th>${STOP_PCTS.map((p) => `<th>&lt; ${p}%</th>`).join('')}</tr>
        ${[1, 2, 3].map((k) => `<tr><td class="rl">${PLAN_NAMES[k]}</td>${row.plans[k].map((x) => cell(x, row.best[k])).join('')}</tr>`).join('')}</table></div>`).join('')}
      <button class="ghost sm" data-usethr style="margin-top:6px">Use these thresholds in the settings</button>`;
  };
  const predHtml = (pred, names) => {
    if (!pred) return '';
    const cell = (x, best) => `<td style="${x.pct === best ? 'font-weight:700;background:rgba(80,200,120,.15)' : ''}${x.d > x.ci ? ';color:var(--bad,#e66)' : ''}">${x.d >= 0 ? '+' : ''}${x.d.toFixed(2)}<span class="muted" style="font-size:10px"> ±${x.ci.toFixed(2)}</span></td>`;
    return `<h4 style="margin:12px 0 2px">Cross praying: predictions by his HP (best setup)</h4>
      <p class="muted small" style="margin:0 0 6px">Change in mean boss time (ticks; negative is faster) if that player predicts the other form below each % of his HP (he's melee: magic instead of ranged · magic: melee instead of ranged · ranged: magic instead of melee) - one player and form at a time, on the same raids, with their Max switches. Bold: their best, when it's clearly faster than the default.</p>
      ${pred.map((row) => `<div class="small" style="margin-top:6px"><b>${esc(names[row.p])}</b> - ${esc(predictionText(row.best))}</div>
        <div class="scroll"><table class="bt"><tr><th>He's</th>${STOP_PCTS.map((p) => `<th>&lt; ${p}%</th>`).join('')}</tr>
        ${PRED_FORMS.map((fm) => `<tr><td class="rl">${fm} (${PRED_DEFAULT[fm]} → ${PRED_OTHER[fm]})</td>${row.forms[fm].map((x) => cell(x, row.best[fm])).join('')}</tr>`).join('')}</table></div>`).join('')}
      <button class="ghost sm" data-usepred style="margin-top:6px">Use these predictions in the settings</button>`;
  };
  const showResults = () => {
    const out = sol.querySelector('[data-vout]');
    if (!vres || !vres.items.length) { out.innerHTML = ''; return; }
    const { items, bps, names, thr, pred } = vres, asc = [...bps].sort((a, b) => a - b);
    out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${team()}-man Nylocas: solver</h3>
      <div class="sub">Each played on the same ${items[0].totals.length.toLocaleString()} raids. Boss time: his spawn to the room's end.</div>
      <div class="scroll"><table class="sortlist"><tr><th>#</th><th>Mean</th><th>Median</th><th>Top 10%</th><th>Fastest</th>${asc.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th>Setup</th><th></th></tr>
      ${items.map((r, i) => { const s = statsRow(r.totals, bps);
        const short = r.cfg.players.map((p, k) => `${esc(names[k])}: ${p.startSpec === 95 ? '95% · ' : ''}${p.surge ? 'surge · ' : ''}${p.open === 'none' ? '' : `${SPEC_NAME[p.open]} → `}${seqName(p.specs)}${p.specs.includes('claw') && p.clawMode === 'gain' ? ' (claws only for a tick)' : ''}`).join('<br>') + (r.cfg.players.some((p) => p.healer) ? `<br>Healer Tech: ${esc(names[r.cfg.players.findIndex((p) => p.healer)])}` : '') + (r.cfg.backup ? `<br>backup BGS: ${esc(names[r.cfg.backup.p])} at ${r.cfg.backup.at}+` : '');
        return `<tr${i === 0 ? ' style="font-weight:700"' : ''}><td>${i + 1}</td><td>${fsec(s.mean)}</td><td>${fsec(s.med)}</td><td>${fsec(s.q10)}</td><td>${fsec(s.fast)}</td>${s.bp.map((q) => `<td>${(q * 100).toFixed(1)}%</td>`).join('')}
          <td class="small" style="text-align:left;font-weight:400">${short}</td>
          <td style="white-space:nowrap"><button class="ghost sm" data-vshow="${i}">Procedure</button> <button class="ghost sm" data-vuse="${i}">Use</button></td></tr>
          <tr class="sub-row" data-vproc="${i}" hidden><td colspan="${7 + asc.length}" style="text-align:left">${procHtml(r.cfg, names)}${raidBar(r.run, bps)}</td></tr>`; }).join('')}</table></div>
      ${thrHtml(thr, names)}${predHtml(pred, names)}</div>`;
  };
  sol.addEventListener('click', async (e) => {
    const el = e.target, status = sol.querySelector('[data-vstatus]'), err = sol.querySelector('[data-verr]'), vbtn = (a) => sol.querySelector(`[data-vact="${a}"]`);
    if (el.dataset.vshow != null) { const row = sol.querySelector(`[data-vproc="${el.dataset.vshow}"]`); row.hidden = !row.hidden; return; }
    if (el.dataset.vuse != null) {
      const r = vres.items[Number(el.dataset.vuse)], st = cur();
      r.cfg.players.forEach((p, k) => { st.players[k] = { ...st.players[k], ...structuredClone(p) }; });
      st.backup = r.cfg.backup ? { ...r.cfg.backup } : null; persist(); render(); status.textContent = 'Setup copied into the settings.'; return;
    }
    if (el.dataset.usepred != null && vres && vres.pred) {
      const st = cur();
      for (const row of vres.pred) { const pf = {}; for (const fm of PRED_FORMS) if (row.best[fm] != null) pf[fm] = row.best[fm]; st.players[row.p].predictFlip = pf; }
      persist(); render(); status.textContent = 'Predictions copied into the settings.'; return;
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
    const start = { players: st.players.map((p) => ({ open: p.open, specs: [...p.specs], clawMode: p.clawMode, startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge, tomeTickFix: p.tomeTickFix !== false, healer: t === 2 && !!p.healer, maxSwitches: Number(p.maxSwitches ?? 8), ...(p.predictFlip ? { predictFlip: { ...p.predictFlip } } : {}) })), backup: st.backup && t > 1 ? { ...st.backup } : null };
    vjob = { stopped: false, pool: null }; const me = vjob;
    vbtn('run').disabled = true; vbtn('stop').disabled = false;
    const t1 = Date.now(), say = (txt) => { status.textContent = `${txt} (${Math.round((Date.now() - t1) / 1000)}s)`; };
    try {
      me.pool = new NyloPool(base, t, opts);
      const run = (...args) => me.pool.run(...args);
      const items = await solveNylo({ start, gear, allow: { ...v.allow, ...(t === 1 ? { backup: false } : {}) }, surgeLimit: Number(st.surgeLimit) || 0, swaps: !!v.search.swaps, roles: !!v.search.roles, bps, ...ef, top: 10 }, run, say, () => me.stopped);
      const mk = (cfg) => ({ players: base.map((b, k) => ({ ...b, plan: cfg.players[k] })), opts: { ...opts, plans: { backup: cfg.backup } } });
      vres = { items: items.map((r) => ({ ...r, run: mk(r.cfg) })), bps, names, thr: null, pred: null }; showResults();
      if (v.search.thr && t > 1 && items.length && !me.stopped) {
        vres.thr = await rangedThresholds(items[0].cfg, gear, run, ef.thrRaids, say, () => me.stopped);
        showResults();
      }
      if (v.search.pred && items.length && !me.stopped) {
        vres.pred = await predictionThresholds(items[0].cfg, run, ef.thrRaids, say, () => me.stopped);
        showResults();
      }
      status.textContent = me.stopped ? 'Stopped.' : `Done in ${Math.round((Date.now() - t1) / 1000)}s.`;
    } catch (x) { status.textContent = me.stopped ? 'Stopped.' : ''; if (!me.stopped) err.textContent = `Couldn't solve: ${x.message}`; }
    finally { if (me.pool) me.pool.stop(); vjob = null; vbtn('run').disabled = false; vbtn('stop').disabled = true; }
  });

  /** Full raid: the Nylocas Solver on the Full raid's gear, surge cooldowns carried in (ticks per player, from the room's
   *  start: the waves run them down), Max switches, Healer Tech (duos), restore doses and wave times. -> ranked setups,
   *  each with what a full raid plays ({players, opts}). */
  async function fullRaidSolve({ gearSet: gs, surgeCd, maxSwitches = [], healer = null, restores = 8, waveDist, bps = [], effort = 'normal', say = () => {}, stopped = () => false, onPool = () => {} }) {
    const t = team(), gp = gearOf(gs);
    const base = Array.from({ length: t }, (_, k) => { const g = (gp && gp[k]) || blankPlayer(k); return { name: g.name || `Player ${k + 1}`, gear: g, surgeCd: surgeCd[k] || 0 }; });
    const names = base.map((b) => b.name), gear = base.map((b) => b.gear);
    const opts = { takeoffs: true, offPrayVeng: true, restores: Number(restores) || 0, waveDist };
    const extra = (k) => ({ maxSwitches: Number(maxSwitches[k] ?? 8) || 8, healer: t === 2 && healer === k });
    const start = { players: gear.map((g, k) => ({ ...defaultPlan(g), surge: false, ...extra(k) })), backup: null };
    const pool = new NyloPool(base, t, opts); onPool(pool);
    try {
      const ef = EFFORT[effort] || EFFORT.normal;
      const items = await solveNylo({ start, gear, allow: Object.fromEntries(ALLOW.map((k) => [k, true])), surgeLimit: t, swaps: true, roles: true, bps, ...ef, top: 10 }, (...a) => pool.run(...a), say, stopped);
      return items.map((r) => ({ ...r, cfg: { ...r.cfg, players: r.cfg.players.map((p, k) => ({ ...p, ...extra(k) })) },
        run: { players: base.map((b, k) => ({ ...b, plan: { ...r.cfg.players[k], ...extra(k) } })), opts: { ...opts, plans: { backup: r.cfg.backup } } } }));
    } finally { pool.stop(); }
  }
  /** Full raid: show setups (best first) in this tab's Solver results. */
  const fullRaidShow = (items, bps) => { vres = { items, bps, names: items[0] ? items[0].run.players.map((p) => p.name) : [], thr: null, pred: null }; showResults(); };
  /** Full raid: a setup's procedure (its plan and Show raid) into `el`. */
  const procedure = (el, { cfg, names, run }, bps = []) => { el.innerHTML = `${procHtml(cfg, names)}${raidBar(run, bps)}`; if (!el.dataset.wired) { el.dataset.wired = '1'; el.addEventListener('click', (e) => { const b = e.target.closest('button[data-nraid]'); if (b && !host.contains(b)) showRaid(Number(b.dataset.nraid)); }); } };

  function refreshAll() { render(); showRep(); showSol(); }
  return { refresh: () => { state = loadKey(STORE); refreshAll(); }, api: { fullRaidSolve, fullRaidShow, procedure, reportHtml, team } };
}
