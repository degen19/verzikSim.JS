// Full raid tab: solve Sotetseg -> Xarpus -> Verzik as one raid. Everything comes from this tab (nothing from the room
// tabs): the Gear set, each room's supplies / mazes / heals, the surge cooldowns and doses carried room to room, and the
// Lightbearers and horns (ticked in the Gear tab - held by their owners, or traded before each room with Enable trades).
// Each room's Solver decides that room's procedure; Verzik P1 is your chart's when "Use my Verzik P1 chart" is ticked. The best few setups of each room are then
// played together as whole raids (engine/fullraid.js) and ranked on the total time or on each room's own breakpoint.
// Results: for the combination shown, each boss's procedure (decision tree, example raids; Verzik's P1 chart) and its
// standard Run report (20,000 raids), with the surge cooldowns / doses players come into that room with; then the charts.
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { parseBreakpoints } from './engine/optimize.js';
import { runSote, MAZE_HOW, defaultMazes } from './engine/sote.js';
import { HEALS_DEFAULT } from './engine/xarpus.js';
import { parse_chart } from './engine/sim.js';
import { CODES, CODE_HELP, isAutoTick, checkRow } from './engine/chartform.js';
import { gearOfLetter } from './engine/gearstore.js';
import { runXarpus } from './engine/xarpus.js';
import { Rng } from './engine/rng.js';
import { fullScore, fullBetter, SURGE_CD, surgersOf, withSurgers, subsets, distOf, convolve, planScore } from './engine/fullraid.js';
import { FullRaidPool } from './fullraid-pool.js';
import { histogramSvg, cumulativeSvg, chartBox, reportHtml as verzReportHtml } from './engine/report.js';
import { commonEntry, verzikCfgs } from './engine/fullraid.js';
import { soteReportHtml } from './engine/sotereport.js';
import { xarpusReportHtml } from './engine/xarpusreport.js';
import { verzSetupHtml } from './verzsetup.js';
import { verzikTreeHtml, profileChunks } from './engine/vtree.js';
import { verzRaidBar, showVerzRaid } from './verzraid.js';

const STORE = 'verzikSim.fullraid.v1';           // {team: {gearSet, cd: [m:ss], doses: [n], useChart, chartSet, mode, total, rooms: [s, x, v], effort}}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage off */ } };
const fsec = (x) => { const s = x * 0.6; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const fsB = (b) => { const r = Math.round(b % 60 * 10) / 10; return `${Math.floor(b / 60)}:${r < 10 ? '0' : ''}${r}`; };
/** m:ss (or seconds) -> ticks, rounded up: 1:04 -> 107 (1:04.2 - the cooldown is surely up by then). */
const toTicks = (v) => {
  const s = String(v ?? '').trim(); if (!s) return 0;
  const m = s.match(/^(\d+):(\d+(?:\.\d+)?)$/), sec = m ? Number(m[1]) * 60 + Number(m[2]) : Number(s);
  if (!Number.isFinite(sec) || sec < 0) throw new Error(`"${s}" isn't a time (m:ss)`);
  return Math.ceil(sec / 0.6 - 1e-9);
};
const ROOM_NAMES = ['Sotetseg', 'Xarpus', 'Verzik'];
const EFFORTS = { quick: { label: 'Quick', verz: 'quick', keep: 2, raids: 500, screen: 200, full: 12, refine: false }, normal: { label: 'Normal', verz: 'standard', keep: 3, raids: 1000, screen: 300, full: 20, refine: true }, thorough: { label: 'Thorough', verz: 'thorough', keep: 3, raids: 3000, screen: 600, full: 30, refine: true } };

const CODE_BG = { S: '#8fd18f', D: '#c9b6e4', A: '#fff2a8', C: '#f8cbad', H: '#f4b183', E: '#b4c7e7', SB: '#ffd966', B: '#d9a6e0', T: '#8eb4e3',
  P: '#ff66cc', R: '#ffffff', X: '#595959', 'ST>n': '#33cc33' };

export function createFullRaid(host, { getTeam, rooms, goTo, getWorkbook = null, setLabel = (b) => '', runVerzik = null }) {
  /** The Full raid's own P1 chart (Use my Verzik P1 chart): its ticks, each player's actions and start spec. */
  const chartTicks = (t, ch) => Math.max(t === 2 ? 140 : 80, ...ch.acts.flatMap((a) => Object.keys(a).map(Number)));
  const chartOf = (s, t) => { s.chart ||= {}; s.chart.acts ||= []; s.chart.start ||= []; for (let k = 0; k < t; k++) { s.chart.acts[k] ||= {}; s.chart.start[k] ||= 100; } s.chart.acts.length = t; s.chart.start.length = t; return s.chart; };
  function chartEditor(s, t, gp) {
    const ch = chartOf(s, t), gk = gearOfLetter(t, s.gearSet) || [], n = chartTicks(t, ch);
    const name = (k) => esc((gp && gp[k] && gp[k].name) || `Player ${k + 1}`);
    const head = Array.from({ length: n }, (_, i) => i + 1).map((x) => `<th class="${isAutoTick(x) ? 'auto' : ''}">${x}</th>`).join('');
    const rows = Array.from({ length: t }, (_, k) => {
      const acts = ch.acts[k], g = gk[k], msg = checkRow(acts, g ? (g.has3Tick || 'No') : 'No', t, g ? g.hasBP : true);
      return `<tr><td class="rl">${name(k)}</td><td><select data-cstart="${k}">${[100, 95].map((v) => `<option ${Number(ch.start[k]) === v ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td class="small" style="text-align:left;white-space:nowrap;${msg ? 'color:var(--bad)' : ''}">${msg ? esc(msg) : 'OK'}</td>${Array.from({ length: n }, (_, i) => { const x = i + 1, v = String(acts[x] || '').toUpperCase();
          return `<td class="${isAutoTick(x) ? 'auto' : ''}"><input class="code${v && !CODES.includes(v) ? ' badcode' : ''}" list="fr-codes" data-cact="${k}|${x}" ${v ? `data-code="${esc(v)}"` : ''} value="${esc(v)}"></td>`; }).join('')}</tr>`;
    }).join('');
    return `<div style="margin-top:8px"><div class="row wrap" style="gap:8px;align-items:center;margin-bottom:6px"><span class="muted small">Your P1 chart - build it here, or load one of your Verzik sets (a copy: editing it here doesn't change the set):</span>
        ${['A', 'B', 'C'].map((b) => `<button class="ghost sm" data-cload="${b}">Load from Verz ${esc(setLabel(b) || b)}</button>`).join('')}<button class="ghost sm" data-cclear>Clear</button><span class="muted small" data-cmsg></span></div>
      <div class="scroll"><table class="bt grid"><tr><th></th><th>Start</th><th>Check</th>${head}</tr>${rows}</table></div>
      <datalist id="fr-codes">${CODES.map((c) => `<option value="${c}">`).join('')}</datalist>
      <div class="muted small codes-legend">${Object.entries(CODE_HELP).map(([c, h]) => `<span style="background:${CODE_BG[c] || ''};${c === 'X' ? 'color:#fff' : ''}">${c}</span>${esc(h)}`).join(' · ')}. Red columns are Verzik auto ticks.</div></div>`;
  }
  let state = load(), job = null, results = null, charted = 0;
  const team = () => Number(getTeam()) || 4;
  const st = () => {
    const t = team(); state[t] ||= {}; const s = state[t];
    s.gearSet ||= 'A'; s.cd ||= []; s.doses ||= []; s.mode ||= 'total'; s.total ??= ''; s.rooms ||= ['', '', '']; s.effort ||= 'normal'; s.chartSet ||= 'A'; s.rankBy ||= 'goal';
    for (let k = 0; k < t; k++) { s.cd[k] ??= ''; s.doses[k] ??= 2; }
    s.cd.length = t; s.doses.length = t;
    s.sote ||= {}; s.sote.players ||= []; s.sote.noLateSurge ??= false;
    for (let k = 0; k < t; k++) s.sote.players[k] ||= { pnecks: 2, sharks: 3, rests: 0, restores: 3, mazes: null };
    s.sote.players.length = t;
    s.xarpus ||= {}; s.xarpus.heals ??= HEALS_DEFAULT[t]; s.xarpus.exactHeals ??= false;
    s.verzik ||= {}; s.verzik.pnecks ||= []; for (let k = 0; k < t; k++) s.verzik.pnecks[k] ??= 0; s.verzik.pnecks.length = t;
    s.verzik.team ||= { Sharks: '', 'Brew sips': '', 'Restore sips': '', 'SCB sips': '' };
    s.trades ??= false;
    return s;
  };
  /** A player's mazes: as set, else the default for their phoenix necklaces (and locator orb). */
  const mazes = (sp, k, gp) => (Array.isArray(sp.mazes) ? sp.mazes : defaultMazes(Number(sp.pnecks || 0), !!(gp && gp[k] && gp[k].locator), team()));
  const gearPlayers = (s) => { const set = gearSet(loadGear(), team(), s.gearSet); return set ? playersOf(set, team()) : null; };

  function render() {
    const s = st(), t = team(), g = loadGear(), gp = gearPlayers(s), lb = gp ? gp.filter((p) => p.lightbearer).length : 0, horns = gp ? gp.filter((p) => p.horn).length : 0;
    const name = (k) => esc((gp && gp[k] && gp[k].name) || `Player ${k + 1}`);
    host.innerHTML = `<div class="card"><h3 style="margin-top:0">Full raid <span class="muted small">(${t}-man: Sotetseg → Xarpus → Verzik)</span></h3>
      <p class="muted small">Solves the three rooms as one raid - the solver decides each room's procedure (specs, surges, Lightbearer cycles, maze entry, Verzik's P1 chart unless you use yours). Everything it needs is on this tab; gear comes from the Gear tab. Spec resets each room (95 or 100 to start); the surge cooldown and doses carry over.</p>
      <div class="row wrap" style="gap:14px;align-items:end;margin-bottom:10px">
        <label>Gear<select data-f="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${x === s.gearSet ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}${gearSet(g, t, x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        <div class="muted small" style="padding-bottom:8px">${lb} Lightbearer${lb === 1 ? '' : 's'} and ${horns} horn${horns === 1 ? '' : 's'} (ticked in the Gear tab)</div>
      </div>
      <div class="scroll"><table class="bt"><tr><th></th><th title="Time left on their surge potion cooldown at the start of Sotetseg (m:ss), rounded up to a tick - 1:04 means it's up after 1:04.2. Blank: ready">Surge cooldown into Sote</th><th title="Surge potion doses they bring for the three rooms">Surge doses</th></tr>
        ${Array.from({ length: t }, (_, k) => `<tr><td class="rl">${name(k)}</td><td><input data-cd="${k}" value="${esc(s.cd[k])}" placeholder="ready" style="width:80px"></td>
          <td><select data-dose="${k}">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}" ${n === Number(s.doses[k]) ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>`).join('')}</table></div>
      <label class="pick" style="flex-direction:row;gap:6px;align-items:center;margin-top:8px" title="On: the solver decides who holds each Lightbearer and horn in each room (they're traded between rooms - before a room, never during one). Off: they stay with whoever has them ticked in the Gear tab."><input type="checkbox" data-f="trades" ${s.trades ? 'checked' : ''}>Enable trades</label>
      <div class="muted small">On: the solver decides who holds each Lightbearer (${lb}) and horn (${horns}) in each room - traded before a room, never during one. It takes longer to run. Off: they stay with whoever has them ticked in the Gear tab.</div>
      <style>.frblk{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:10px 0}.frblk h4{margin:0 0 6px}</style>
      <div class="frblk"><h4>Sotetseg</h4><div class="scroll"><table class="bt"><tr><th></th><th>Phoenix necklaces</th><th>Sharks</th><th title="Guthix rest sips (a 4 dose = 4 sips)">Guthix rest sips</th><th>Restore sips</th><th title="How they cross the first maze (Redemption needs a locator orb, 1-4s; Shark: one player)">First maze</th><th>Second maze</th></tr>
        ${Array.from({ length: t }, (_, k) => { const sp = s.sote.players[k], m = mazes(sp, k, gp);
          return `<tr><td class="rl">${name(k)}</td>${['pnecks', 'sharks', 'rests', 'restores'].map((f) => `<td><input type="number" min="0" data-sote="${k}|${f}" value="${esc(sp[f])}" style="width:60px"></td>`).join('')}
          ${[0, 1].map((i) => `<td><select data-maze="${k}|${i}">${MAZE_HOW.map(([v, l]) => `<option value="${v}" ${v === m[i] ? 'selected' : ''} ${v === 'redemption' && t >= 5 ? 'disabled' : ''}>${l}</option>`).join('')}</select></td>`).join('')}</tr>`; }).join('')}</table></div>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Only setups where every surge is drunk in P1"><input type="checkbox" data-f="soteNoLate" ${s.sote.noLateSurge ? 'checked' : ''}>No P2 / P3 surges</label></div>
      <div class="frblk"><h4>Xarpus</h4><div class="row" style="gap:14px;align-items:end">
        <label title="Exhumed heals (missed ticks): each one is HP on top of his base">Number of heals<input type="number" min="0" data-xh value="${esc(s.xarpus.heals)}" style="width:70px"></label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-xe ${s.xarpus.exactHeals ? 'checked' : ''}>Exact heals (no ±2)</label></div></div>
      <div class="frblk"><h4>Verzik</h4><div class="row" style="gap:14px;align-items:end;flex-wrap:wrap">
        ${Object.keys(s.verzik.team).map((h) => `<label title="The whole team's (blank: the chart template's default)">${h === 'SCB sips' ? 'Super combat sips' : h} (team)<input type="number" min="0" data-vt="${esc(h)}" value="${esc(s.verzik.team[h])}" placeholder="default" style="width:80px"></label>`).join('')}</div>
        <div class="scroll"><table class="bt"><tr><th></th>${Array.from({ length: t }, (_, k) => `<th>${name(k)}</th>`).join('')}</tr>
          <tr><td class="rl">Phoenix necklaces</td>${Array.from({ length: t }, (_, k) => `<td><input type="number" min="0" data-vp="${k}" value="${esc(s.verzik.pnecks[k])}" style="width:60px"></td>`).join('')}</tr></table></div>
        <div class="muted small">Shadows come from the Gear tab (a Tumeken's shadow): the solver tries the shadow options for whoever has one. Everything else is the chart template's defaults.</div>
      <div class="row wrap" style="gap:14px;align-items:center;margin:10px 0 0">
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Keep your Verzik chart's P1 rotation (much faster) - ring swaps, DCs, horns and the rest are still searched"><input type="checkbox" data-f="useChart" ${s.useChart ? 'checked' : ''}>Use my Verzik P1 chart</label>
      </div>
      ${s.useChart ? chartEditor(s, t, gp) : ''}</div>
      <div class="row wrap" style="gap:14px;align-items:end">
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="radio" name="frmode" data-f="mode" value="total" ${s.mode === 'total' ? 'checked' : ''}>Search for under TOTAL TIME</label>
        <label>Total time (m:ss, comma-separated)<input data-f="total" value="${esc(s.total)}" placeholder="e.g. 6:00" style="width:150px" ${s.mode === 'total' ? '' : 'disabled'}></label>
      </div>
      <div class="row wrap" style="gap:14px;align-items:end;margin-top:6px">
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="radio" name="frmode" data-f="mode" value="rooms" ${s.mode === 'rooms' ? 'checked' : ''}>Use these specific breakpoints</label>
        ${ROOM_NAMES.map((r, j) => `<label>${r}<input data-room="${j}" value="${esc(s.rooms[j])}" placeholder="m:ss" style="width:80px" ${s.mode === 'rooms' ? '' : 'disabled'}></label>`).join('')}
      </div>
      <div class="row wrap" style="gap:14px;align-items:end;margin-top:10px">
        <label title="Goal time: the share of attempts under your time(s) - the first total time, or every room under its own breakpoint. Success rate: the share of attempts that finish (then the median).">Rank by<select data-f="rankBy"><option value="goal" ${s.rankBy !== 'success' ? 'selected' : ''}>Goal time</option><option value="success" ${s.rankBy === 'success' ? 'selected' : ''}>Success rate</option></select></label>
        <label>Effort<select data-f="effort">${Object.entries(EFFORTS).map(([k, x]) => `<option value="${k}" ${k === s.effort ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
        <button data-act="run">Solve</button><button data-act="stop" class="ghost" disabled>Stop</button>
      </div>
      <div data-status class="muted" style="margin-top:8px"></div><div data-err class="err"></div></div>
      <div data-out></div>`;
    showResults();
  }

  host.addEventListener('change', (e) => {
    const el = e.target, s = st();
    if (el.dataset.f === 'soteNoLate') s.sote.noLateSurge = el.checked;
    else if (el.dataset.f) s[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    else if (el.dataset.cd != null) s.cd[Number(el.dataset.cd)] = el.value;
    else if (el.dataset.dose != null) s.doses[Number(el.dataset.dose)] = Number(el.value);
    else if (el.dataset.room != null) s.rooms[Number(el.dataset.room)] = el.value;
    else if (el.dataset.cact) { const [k, x] = el.dataset.cact.split('|').map(Number), v = String(el.value || '').trim().toUpperCase(), ch = chartOf(s, team()); if (v) ch.acts[k][x] = v; else delete ch.acts[k][x]; save(state); render(); return; }
    else if (el.dataset.cstart != null) chartOf(s, team()).start[Number(el.dataset.cstart)] = Number(el.value);
    else if (el.dataset.sote) { const [k, f] = el.dataset.sote.split('|'); s.sote.players[Number(k)][f] = Math.max(0, Math.trunc(Number(el.value) || 0)); }
    else if (el.dataset.maze) { const [k, i] = el.dataset.maze.split('|').map(Number), sp = s.sote.players[k], m = [...mazes(sp, k, gearPlayers(s))]; m[i] = el.value; sp.mazes = m; }
    else if (el.dataset.xh != null) s.xarpus.heals = Math.max(0, Math.trunc(Number(el.value) || 0));
    else if (el.dataset.xe != null) s.xarpus.exactHeals = el.checked;
    else if (el.dataset.vt) s.verzik.team[el.dataset.vt] = el.value === '' ? '' : Math.max(0, Math.trunc(Number(el.value) || 0));
    else if (el.dataset.vp != null) s.verzik.pnecks[Number(el.dataset.vp)] = Math.max(0, Math.trunc(Number(el.value) || 0));
    else return;
    save(state);
    if (['useChart', 'mode', 'gearSet'].includes(el.dataset.f)) render();
  });

  /** Surge cooldown (ticks) and doses left after a room, from its best setup played a few hundred times (median). */
  const carry = (play, cd, doses, n = 200) => {
    const per = cd.map(() => []), used = cd.map(() => 0), ends = [];
    for (let i = 0; i < n; i++) {
      const r = play(i); if (!r || r.end == null) continue;
      ends.push(r.end);
      r.players.forEach((p, k) => {
        if (p.surgeAt != null) used[k]++;
        per[k].push(p.surgeCd != null ? p.surgeCd : Math.max(0, p.surgeAt != null ? p.surgeAt + SURGE_CD - r.end : cd[k] - r.end));
      });
    }
    const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0);
    const dosesLeft = doses.map((d, k) => d - (used[k] > n / 2 ? 1 : 0));
    return { cd: per.map(med), doses: dosesLeft, end: med(ends) };
  };
  /** No doses left: a cooldown that never ends in this room (so its solver won't plan a surge). */
  const blockIfNone = (cd, doses) => cd.map((c, k) => (doses[k] > 0 ? c : 99999));

  host.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.show) { const [ci, j] = b.dataset.show.split('|').map(Number); openRoom(ci, j); return; }
    if (b.dataset.cload) {
      const s = st(), t = team(), msg = host.querySelector('[data-cmsg]');
      try {
        const wb = getWorkbook ? await getWorkbook() : null;
        if (!wb) throw new Error('no Verzik chart on the page (import one or build one in the Verzik tab)');
        const cfg = await parse_chart(wb, t, null, b.dataset.cload, { deferBP: true });
        if (!cfg.some((c) => c.actions && Object.keys(c.actions).length)) throw new Error(`Verz ${b.dataset.cload} has no P1 chart`);
        const ch = chartOf(s, t); ch.acts = cfg.map((c) => ({ ...(c.actions || {}) })); ch.start = cfg.map((c) => (Number(c.startSpec) === 95 ? 95 : 100));
        save(state); render(); host.querySelector('[data-cmsg]').textContent = `Loaded Verz ${setLabel(b.dataset.cload) || b.dataset.cload} (a copy).`;
      } catch (x) { if (msg) msg.textContent = `Couldn't load: ${x.message}`; }
      return;
    }
    if (b.dataset.cclear != null) { const s = st(); s.chart = null; chartOf(s, team()); save(state); render(); return; }
    if (b.dataset.rrep) { const [ci, j] = b.dataset.rrep.split('|').map(Number); showRoomReport(ci, j, b); return; }
    if (b.dataset.rproc) { const [ci, j] = b.dataset.rproc.split('|').map(Number); showRoomProc(ci, j, b); return; }
    if (b.dataset.vraid) { showVerzRaid(b, host); return; }
    if (b.dataset.chart != null) { charted = Number(b.dataset.chart); showResults(); host.querySelector('[data-charts]')?.scrollIntoView({ block: 'nearest' }); return; }
    const a = b.dataset.act; if (!a) return;
    const status = host.querySelector('[data-status]'), err = host.querySelector('[data-err]');
    if (a === 'stop') { if (job) { job.stopped = true; for (const p of job.pools) p.stop(); } return; }
    if (a !== 'run' || job) return;
    err.textContent = '';
    const s = st(), t = team(), ef = EFFORTS[s.effort] || EFFORTS.normal, gp = gearPlayers(s);
    if (!gp) { err.textContent = `Gear set ${s.gearSet} is empty - set the team's gear in the Gear tab.`; return; }
    if (s.useChart && !chartOf(s, t).acts.some((a) => Object.keys(a).length)) { err.textContent = 'Use my Verzik P1 chart: the P1 chart is empty - build it or load one of your Verzik sets.'; return; }
    if (t === 1) { err.textContent = 'The Full raid solver is for 2-5 man raids.'; return; }
    let cd0, total = [], roomBps = [null, null, null];
    try {
      cd0 = s.cd.map(toTicks);
      if (s.mode === 'rooms') roomBps = s.rooms.map((x) => (String(x || '').trim() ? parseBreakpoints(x)[0] : null));
      else total = String(s.total || '').trim() ? parseBreakpoints(s.total) : [];
    } catch (x) { err.textContent = x.message; return; }
    const doses0 = s.doses.map(Number), lbRings = gp.filter((p) => p.lightbearer).length, hornLimit = gp.filter((p) => p.horn).length;
    // no trades: Lightbearers and horns stay with their owners; trades: anyone may hold one in a room (as many as there are)
    const lbOwners = s.trades ? null : gp.map((p) => !!p.lightbearer), hornOwners = s.trades ? null : gp.map((p) => !!p.horn);
    const gearPatch = s.trades && hornLimit ? gp.map(() => ({ horn: true })) : [];
    job = { stopped: false, pools: [] }; const me = job;
    const btn = (x) => host.querySelector(`[data-act="${x}"]`); btn('run').disabled = true; btn('stop').disabled = false;
    const t1 = Date.now(), say = (room) => (txt) => { status.textContent = `${room}: ${txt} (${Math.round((Date.now() - t1) / 1000)}s)`; };
    const common = { gearSet: s.gearSet, lbRings, lbOwners, hornLimit, gearPatch, effort: s.effort, stopped: () => me.stopped, onPool: (p) => me.pools.push(p) };
    const soteSup = s.sote.players.map((sp, k) => ({ pnecks: sp.pnecks, sharks: sp.sharks, rests: sp.rests, restores: sp.restores, mazes: mazes(sp, k, gp) }));
    const vSup = { team: Object.fromEntries(Object.entries(s.verzik.team).filter(([, x]) => x !== '' && x != null)), players: s.verzik.pnecks.map((n) => ({ 'Phoenix necklaces': n })) };
    try {
      const how = { mode: s.mode, total, rooms: roomBps, rankBy: s.rankBy };
      const NONE = cd0.map(() => 99999), KINDS = ['sote', 'xarpus', 'verzik'], RN = { sote: 'Sotetseg', xarpus: 'Xarpus', verzik: 'Verzik' };
      const medOf = (v) => { const a = v.filter((x) => x < 9999).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };
      // each room's solve -> {list (as its tab shows it), setups: [{setup, i}]} - its best few, in full-raid form
      const soteSolve = async (cd, tag) => { const it = await rooms.sote.fullRaidSolve({ ...common, supplies: soteSup, noLateSurge: !!s.sote.noLateSurge, surgeCd: cd, bps: roomBps[0] != null ? [roomBps[0]] : [], say: say(`Sotetseg ${tag}`) });
        return clean({ kind: 'sote', list: it, setups: it.slice(0, ef.keep).map((x, i) => ({ i, setup: { players: x.replay.players, entry: x.replay.entry, opts: x.replay.opts } })), med: it.length ? medOf(it[0].totals) : 0 }, cd); };
      const xSolve = async (cd, tag) => { const it = await rooms.xarpus.fullRaidSolve({ ...common, heals: s.xarpus.heals, exactHeals: !!s.xarpus.exactHeals, surgeCd: cd, bps: roomBps[1] != null ? [roomBps[1]] : [], say: say(`Xarpus ${tag}`) });
        return clean({ kind: 'xarpus', list: it, setups: it.slice(0, ef.keep).map((x, i) => ({ i, setup: x.run })), med: it.length ? medOf(it[0].totals) : 0 }, cd); };
      const vSolve = async (cd, tag, bps) => { const r = await rooms.verzik.fullRaidSolve({ ...common, hornOwners, supplies: vSup, effort: ef.verz, chart: s.useChart ? chartOf(s, t) : null, surgeCd: cd, bps, say: say(`Verzik ${tag}`) });
        return clean({ kind: 'verzik', res: r, list: r.top || [], setups: (r.top || []).slice(0, ef.keep).map((x, i) => ({ i, setup: { cfgs: x.cfg } })) }, cd); };
      const stop = () => { if (me.stopped) throw new Error('stopped'); };
      /** A solve's setups without the surges its blocked players (cooldown 99999) can't take. */
      const clean = (sv, cd) => { sv.setups = sv.setups.map((x) => ({ ...x, setup: withSurgers(sv.kind, x.setup, surgersOf(sv.kind, x.setup).filter((k) => cd[k] < 99999)) })); return sv; };
      // ---- 1. every room solved twice: surges allowed (everyone with a dose) and no surges
      const sA = await soteSolve(blockIfNone(cd0, doses0), '(surges allowed)'); stop();
      const sB = await soteSolve(NONE, '(no surges)'); stop();
      const medS = sA.med || sB.med, cdX = cd0.map((c) => Math.max(0, c - medS));
      const xA = await xSolve(blockIfNone(cdX, doses0), '(surges allowed)'); stop();
      const xB = await xSolve(NONE, '(no surges)'); stop();
      const medX = xA.med || xB.med, cdV = cd0.map((c) => Math.max(0, c - medS - medX));
      // Verzik in total mode aims at what's left of the total after the other two rooms
      const vBps = roomBps[2] != null ? [roomBps[2]] : total.map((b) => b - (medS + medX) * 0.6).filter((b) => b > 0);
      const vA = await vSolve(blockIfNone(cdV, doses0), '(surges allowed)', vBps); stop();
      const vB = await vSolve(NONE, '(no surges)', vBps); stop();
      const solves = [sA, sB, xA, xB, vA, vB];
      if (!solves.every((x) => x.setups.length)) throw new Error('A room solver found no setup that finishes.');
      // ---- 2. variants: each setup with every subset of its surgers (nobody re-solved), each room's time on its own
      const cdOf = { sote: cd0, xarpus: cdX, verzik: cdV };
      const variants = [], vkey = new Set();
      const addVariants = (sv, subsetsToo = true) => sv.setups.forEach((x) => {
        const sur = surgersOf(sv.kind, x.setup);
        for (const keep of subsetsToo ? subsets(sur) : [sur]) {
          const setup = withSurgers(sv.kind, x.setup, keep), k = `${sv.kind}|${JSON.stringify(setup)}`;
          if (vkey.has(k)) continue; vkey.add(k);
          variants.push({ kind: sv.kind, setup, surgers: [...keep].sort((p, q) => p - q), from: sv, i: x.i, dropped: sur.filter((q) => !keep.includes(q)) });
        }
      });
      solves.forEach((sv) => addVariants(sv));
      const pool = new FullRaidPool({ team: t, surgeCd: cd0, doses: doses0 }); me.pools.push(pool);
      const n1 = ef.screen, seed = `full${Date.now()}`;
      const evalVariants = async (list) => {
        say('Rooms')(`each setup and surge choice on its own: ${list.length} on ${n1.toLocaleString()} raids each`);
        const res = await pool.runRooms(list.map((v) => ({ kind: v.kind, setup: v.setup, cd: cdOf[v.kind] })), 0, n1, seed);
        list.forEach((v, j) => { v.dist = distOf(res[j].ends); v.q = res[j].ends.slice().sort((a, b2) => a - b2)[Math.floor(n1 * 0.4)]; });
      };
      await evalVariants(variants); stop();
      // ---- 3. surge plans: a room (or none) per player, within their doses; each scored from its rooms' times
      // a player can surge in several rooms (doses allowing): a later room's surge waits for the cooldown from their last
      // one - taken as soon as it's up (Verzik: a custom timing, so after P1). Their cooldown into that room comes from
      // the earlier room's best setup (its surge tick, median).
      const medAt = (play) => { const at = cd0.map(() => []); for (let i = 0; i < 100; i++) { const r = play(i); if (r && r.players) r.players.forEach((p, k) => { if (p.surgeAt != null) at[k].push(p.surgeAt); }); }
        return at.map((a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 30)); };
      const sAt = medAt((i) => { const x = sA.setups[0].setup; return runSote(x.players.map((p, k) => ({ ...p, surgeCd: cd0[k] })), t, new Rng(`at#${i}`), null, { ...x.opts, entry: x.entry }); });
      const xAt = medAt((i) => { const x = xA.setups[0].setup; return runXarpus(x.players.map((p, k) => ({ ...p, surgeCd: cdX[k] })), t, new Rng(`at#${i}`), null, x.opts); });
      /** Cooldown into room r for a player whose last surge was in room `last`. */
      const lateCdK = (r, last, k) => Math.max(0, last === 0 ? sAt[k] + SURGE_CD - medS - (r === 2 ? medX : 0) : xAt[k] + SURGE_CD - medX);
      const lateDist = new Map();                                   // `${kind}|${variant}|${cooldowns}` -> times with those players' cooldown carried in
      // plans: per player the rooms they surge in - any of Sotetseg / Xarpus / Verzik, as many as their doses
      const roomSets = (d) => subsets([0, 1, 2]).filter((x) => x.length <= d).map((x) => x.sort());
      const planList = () => { let ps = [[]]; for (let k = 0; k < t; k++) ps = ps.flatMap((pl) => roomSets(doses0[k]).map((r) => [...pl, r])); return ps; };
      const setsOf = (pl) => [0, 1, 2].map((r) => pl.map((x, k) => (x.includes(r) ? k : -1)).filter((k) => k >= 0));
      /** Room r's carried-in cooldowns for a plan's players who surged in an earlier room ({k: ticks}), or null. */
      const lateOf = (pl, r) => { const o = {}; pl.forEach((x, k) => { if (!x.includes(r)) return; const prev = x.filter((q) => q < r); if (prev.length) o[k] = lateCdK(r, Math.max(...prev), k); }); return Object.keys(o).length ? o : null; };
      const byRoomSet = (kind, set) => variants.filter((v) => v.kind === kind && v.surgers.join() === set.join()).sort((a, b2) => a.q - b2.q).slice(0, 2);
      const distFor = (v, late) => (late ? lateDist.get(`${v.kind}|${variants.indexOf(v)}|${JSON.stringify(late)}`) : v.dist);
      /** Times for the later-room surge variants the plans need (played with those players' cooldown carried in). */
      const evalLate = async () => {
        const need = new Map();
        for (const pl of planList()) {
          const sets = setsOf(pl);
          for (const r of [1, 2]) { const late = lateOf(pl, r); if (!late) continue; for (const v of byRoomSet(KINDS[r], sets[r])) { const k = `${v.kind}|${variants.indexOf(v)}|${JSON.stringify(late)}`; if (!lateDist.has(k) && !need.has(k)) need.set(k, { v, late }); } }
        }
        if (!need.size) return;
        const list = [...need.entries()];
        say('Rooms')(`second surges (after the cooldown from an earlier room): ${list.length} on ${n1.toLocaleString()} raids each`);
        const res = await pool.runRooms(list.map(([, x]) => ({ kind: x.v.kind, setup: x.v.setup, cd: cdOf[x.v.kind].map((c, k) => (x.late[k] != null ? x.late[k] : c)) })), 0, n1, seed);
        list.forEach(([k], j) => lateDist.set(k, distOf(res[j].ends)));
      };
      const planScores = () => {
        const out = [], pairCache = new Map();
        for (const pl of planList()) {
          const sets = setsOf(pl), lx = lateOf(pl, 1), lv = lateOf(pl, 2);
          const cands = KINDS.map((kind, r) => byRoomSet(kind, sets[r]));
          if (cands.some((c) => !c.length)) continue;
          for (const a of cands[0]) for (const b2 of cands[1]) {
            const xd = distFor(b2, lx); if (!xd) continue;
            const key = `${variants.indexOf(a)}|${variants.indexOf(b2)}|${JSON.stringify(lx)}`;
            if (!pairCache.has(key)) pairCache.set(key, convolve(a.dist, xd));
            for (const c of cands[2]) {
              const vd = distFor(c, lv); if (!vd) continue;
              out.push({ plan: pl, vars: [a, b2, c], score: planScore([a.dist, xd, vd], how, pairCache.get(key)) });
            }
          }
        }
        return out.sort((x, y) => (fullBetter(x.score, y.score) ? -1 : fullBetter(y.score, x.score) ? 1 : 0));
      };
      await evalLate(); stop();
      let scored = planScores();
      // ---- 4. refine: the best plan's rooms re-solved with exactly its surgers (only where that's a new choice)
      if (ef.refine && scored.length) {
        const best = scored[0].plan;
        for (const [r, kind] of KINDS.entries()) {
          stop();
          const set = setsOf(best)[r];
          const fromA = [sA, xA, vA][r].setups.some((x) => surgersOf(kind, x.setup).join() === set.join());
          if (!set.length || fromA) continue;
          const cd = cdOf[kind].map((c, k) => (set.includes(k) ? c : 99999)), tag = `(only ${set.map((k) => `P${k + 1}`).join(', ')} surge)`;
          const sv = kind === 'sote' ? await soteSolve(cd, tag) : kind === 'xarpus' ? await xSolve(cd, tag) : await vSolve(cd, tag, vBps);
          const n0 = variants.length; addVariants(sv, false); await evalVariants(variants.slice(n0));
        }
        await evalLate(); scored = planScores();
      }
      stop();
      // ---- 5. the best plans as whole raids, the surge cooldown carried for real
      const seen = new Set(), top = [];
      for (const x of scored) { const k = x.vars.map((v) => variants.indexOf(v)).join(); if (seen.has(k)) continue; seen.add(k); top.push(x); if (top.length >= ef.full) break; }
      say('Full raids')(`the best ${top.length} surge plans as whole raids: ${ef.raids.toLocaleString()} each`);
      let res;
      try { res = await pool.run(top.map((x) => ({ sote: x.vars[0].setup, xarpus: x.vars[1].setup, verzik: { cfgs: x.vars[2].setup.cfgs } })), 0, ef.raids, seed); } finally { pool.stop(); }
      const ranked = top.map((x, i) => ({ ...x, setup: { sote: x.vars[0].setup, xarpus: x.vars[1].setup, verzik: x.vars[2].setup }, ...res[i], score: fullScore(res[i], how) }))
        .sort((x, y) => (fullBetter(x.score, y.score) ? -1 : fullBetter(y.score, x.score) ? 1 : 0));
      results = { ranked, vBps, how, t, ctx: { team: t, surgeCd: cd0, doses: doses0 }, seed, names: gp.map((p, k) => p.name || `Player ${k + 1}`), raids: ef.raids, plans: scored.length, nVariants: variants.length }; charted = 0;
      status.textContent = `Done in ${Math.round((Date.now() - t1) / 1000)}s.`;
    } catch (x) {
      status.textContent = me.stopped ? 'Stopped.' : '';
      if (!me.stopped && x.message !== 'Solver stopped.') err.textContent = `Couldn't solve: ${x.message}`;
    } finally {
      for (const p of me.pools) p.stop();
      job = null; btn('run').disabled = false; btn('stop').disabled = true;
      showResults();
    }
  });

  /** Room j's procedure for combination ci: its setup first in the Solver results it came from, then that tab opened. */
  function openRoom(ci, j) {
    const v = results.ranked[ci].vars[j], sv = v.from, first = [sv.list[v.i], ...sv.list.filter((_, k) => k !== v.i)];
    if (j === 0) rooms.sote.fullRaidShow(first, results.how.rooms[0] != null ? [results.how.rooms[0]] : []);
    else if (j === 1) rooms.xarpus.fullRaidShow(first, results.how.rooms[1] != null ? [results.how.rooms[1]] : []);
    else rooms.verzik.fullRaidShow({ ...sv.res, top: first }, results.vBps || []);
    goTo(['sote', 'xarpus', 'verzik'][j]);
  }

  /** Who surges in each room of a combination (planned; Verzik: a P on the chart or a custom timing). */
  const surgesOf = (r) => {
    const nm = (k) => esc(results.names[k] || `Player ${k + 1}`), su = r.setup;
    const list = [su.sote.players.map((p, k) => (p.surge ? k : -1)), su.xarpus.players.map((p, k) => (p.surge ? k : -1)),
      su.verzik.cfgs.map((c, k) => (Object.values(c.actions || {}).includes('P') || c.customSurgeTick != null ? k : -1))].map((a) => a.filter((k) => k >= 0));
    return ROOM_NAMES.map((x, j) => `${x}: ${list[j].map((k) => `${nm(k)}${list.slice(0, j).some((l) => l.includes(k)) ? ' (after cooldown)' : ''}`).join(', ') || 'nobody'}`).join('<br>');
  };
  function showResults() {
    const out = host.querySelector('[data-out]'); if (!out) return;
    if (!results || !results.ranked.length) { out.innerHTML = ''; return; }
    const { ranked, how, raids } = results, total = [...how.total].sort((a, b) => a - b);
    const okOf = (v) => v.filter((x) => x < 99999), med = (v) => { const a = okOf(v).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
    const ft = (x) => (x == null ? '-' : fsec(x));
    const roomsCol = how.mode === 'rooms' && how.rooms.some((b) => b != null);
    out.innerHTML = `<div class="card"><div class="vz-report"><h3 style="margin-top:0">${results.t}-man Full raid: solver</h3>
      <div class="sub">Each room solved with surges allowed and with none (and re-solved for the best plan's surgers); every surge plan - the rooms each player surges in, any combination within their doses (a later surge waits for the cooldown) - scored from the rooms' own times (${results.plans.toLocaleString()} plans, ${results.nVariants} room setups and surge choices); the best ${ranked.length} played as ${raids.toLocaleString()} whole raids each (the same raids for each), surge cooldowns and doses carried room to room. Breakpoint columns and Finished are of every attempt (a raid that fails anywhere, or finishes slower, counts against them); Verzik success is the raids that got to P3 (P2 down in reds), of the raids that reached Verzik; times (median, top 25% / 10%, fastest) are of the raids that finished, however slow. Each room's button opens its procedure, decision tree and example raids in that room's Solver (* played here without some of that setup's surges - hover for whose).</div>
      <div class="scroll"><table class="sortlist"><tr><th>#</th><th title="Median total of the raids that finished">Total</th><th title="Of the raids that finished">Top 25%</th><th title="Of the raids that finished">Top 10%</th><th>Fastest</th>${roomsCol ? `<th>Every room at its breakpoint (${how.rooms.map((b) => (b == null ? '-' : fsB(b))).join(' / ')})</th>${how.rooms.map((b, j) => (b == null ? '' : `<th>${ROOM_NAMES[j]} ${fsB(b)} or faster</th>`)).join('')}` : total.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th title="Raids that finished all three rooms, of every attempt">Finished</th><th title="Raids that got to P3 (P2 down in reds), of the raids that reached Verzik">Verzik success</th><th>Sotetseg</th><th>Xarpus</th><th>Verzik</th><th title="Who has a surge planned in each room (doses permitting: a player out of doses doesn't surge)">Surges</th><th>Rooms</th></tr>
      ${ranked.slice(0, 10).map((r, ci) => { const v = okOf(r.totals).sort((a, b) => a - b), n = r.totals.length;
        return `<tr${ci === 0 ? ' style="font-weight:700"' : ''}><td>${ci + 1}</td><td>${ft(v[v.length >> 1])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.25) - 1)])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.1) - 1)])}</td><td>${ft(v[0])}</td>
          ${roomsCol ? `<td>${(r.score[0] * 100).toFixed(1)}%</td>${how.rooms.map((b, j) => (b == null ? '' : `<td>${(r.ends[j].filter((x) => x * 0.6 <= b + 1e-9).length / n * 100).toFixed(1)}%</td>`)).join('')}` : total.map((_, j) => `<td>${(r.score[j] * 100).toFixed(1)}%</td>`).join('')}
          <td>${(v.length / n * 100).toFixed(1)}%</td><td>${(() => { const reached = r.ends[1].filter((x) => x < 99999).length; return reached ? `${((r.p3 || []).reduce((a, x) => a + x, 0) / reached * 100).toFixed(1)}%` : '-'; })()}</td>${r.ends.map((e) => `<td>${ft(med(e))}</td>`).join('')}<td class="small" style="text-align:left;white-space:nowrap">${surgesOf(r)}</td>
          <td style="white-space:nowrap"><button class="${ci === charted ? '' : 'ghost '}sm" data-chart="${ci}" title="Show this combination below: each room's report and procedure, and the charts">${ci === charted ? 'Shown below' : 'Show'}</button></td></tr>`; }).join('')}
      </table></div>
      ${roomsHtml(charted)}
      ${chartsHtml(ranked[charted] || ranked[0], charted)}</div></div>`;
  }

  /** The shown combination, room by room: Show report (that room's standard report, from whole raids of this
   *  combination - the raids that got to the room) and Show procedure (its setup and decision tree; Verzik: the P1 chart). */
  function roomsHtml(ci) {
    const r = results.ranked[ci];
    return `<h3>Combination #${ci + 1}: each boss</h3><div class="sub">Show procedure: the room's setup and decision tree, as its own Solver shows them. Show report: that procedure through the room's Run report (${REPORT_RAIDS.toLocaleString()} raids). Both with the surge cooldown and doses each player comes into the room with. The full raid's charts are below.</div>
      ${ROOM_NAMES.map((rn, j) => `<div class="card" style="margin:8px 0;padding:8px 10px"><div class="row wrap" style="gap:8px;align-items:center"><b>${rn}</b>
        <button class="ghost sm" data-rrep="${ci}|${j}">Show report</button><button class="ghost sm" data-rproc="${ci}|${j}">Show procedure</button>
        ${r.vars[j].dropped.length ? `<span class="muted small">Played without ${r.vars[j].dropped.map((k) => esc(results.names[k])).join(', ')}'s surge (no dose left / not in the plan).</span>` : ''}
        <span class="muted small" data-rmsg="${ci}|${j}"></span></div>
        <div data-rout="rep|${ci}|${j}" hidden></div><div data-rout="proc|${ci}|${j}" hidden></div></div>`).join('')}`;
  }
  const REPORT_RAIDS = 20000, ENTRY_RAIDS = 1000;
  /** The combination's per-room reports (cached): whole raids played on the main thread, a chunk at a time. */
  let rpool = null;
  const reportPool = () => (rpool && rpool.ctx === results.ctx ? rpool : (rpool && rpool.stop(), rpool = new FullRaidPool(results.ctx)));
  /** What each player comes into each room with in this combination (cached): from whole raids. */
  async function entriesOf(ci, msg) {
    const r = results.ranked[ci]; if (r.entries) return r.entries;
    const setup = { sote: r.setup.sote, xarpus: r.setup.xarpus, verzik: { cfgs: r.setup.verzik.cfgs } };
    r.entries = await reportPool().entries(setup, 0, ENTRY_RAIDS, `ent-${results.seed}`, (d) => { msg.textContent = `Playing whole raids for what each player comes into the room with... ${d.toLocaleString()} / ${ENTRY_RAIDS.toLocaleString()}`; });
    msg.textContent = '';
    return r.entries;
  }
  const roomBps = (j) => (results.how.mode === 'rooms' ? (results.how.rooms[j] != null ? [results.how.rooms[j]] : []) : []);
  const entryLine = (e, j) => {
    if (!e) return '';
    const parts = results.names.map((n, k) => `${esc(n)}: ${e.doses[k]} dose${e.doses[k] === 1 ? '' : 's'}${e.cd[k] > 0 ? `, cooldown ${fsec(e.cd[k])} left` : ''}`);
    return `<div class="small muted" style="margin:4px 0">Coming into ${ROOM_NAMES[j]} (${(e.share * 100).toFixed(0)}% of raids that got there): ${parts.join(' · ')}</div>`;
  };
  /** Room j of combination ci as it's played in the full raid: Sotetseg with the cooldowns / doses you set; Xarpus and
   *  Verzik with what most raids come in with (from whole raids). */
  async function roomEntry(ci, j, msg) {
    const r = results.ranked[ci], names = results.names;
    if (j === 0) {
      const { surgeCd: cd, doses } = results.ctx;
      return { e: null, players: r.setup.sote.players.map((p, k) => ({ ...p, name: names[k], surgeCd: Number(cd[k]) || 0, surge: !!p.surge && (Number(doses[k]) || 0) > 0 })) };
    }
    const e = commonEntry((await entriesOf(ci, msg))[j]);
    if (j === 1) return { e, players: r.setup.xarpus.players.map((p, k) => ({ ...p, name: names[k], surgeCd: e ? e.cd[k] : 0, surge: !!p.surge && (!e || e.doses[k] > 0) })) };
    return { e, cfgs: (e ? verzikCfgs(r.setup.verzik.cfgs, e.cd, e.doses) : r.setup.verzik.cfgs).map((c, k) => ({ ...c, name: names[k] ?? c.name })) };
  }
  /** Show report: the room's standard report (as its Run report gives it), 20,000 raids of this procedure. */
  async function showRoomReport(ci, j, b) {
    const box = host.querySelector(`[data-rout="rep|${ci}|${j}"]`), msg = host.querySelector(`[data-rmsg="${ci}|${j}"]`);
    if (!box.hidden && box.innerHTML) { box.hidden = true; b.textContent = 'Show report'; return; }
    const r = results.ranked[ci];
    if (r.rep && r.rep[j]) { box.innerHTML = r.rep[j]; box.hidden = false; b.textContent = 'Hide report'; return; }
    b.disabled = true;
    try {
      const t = results.t, label = `#${ci + 1}`, opts = { breakpoints: roomBps(j), labels: [label] }, N = REPORT_RAIDS, seed = `rep${Date.now()}`;
      const { e, players, cfgs } = await roomEntry(ci, j, msg);
      const prog = (d) => { msg.textContent = `Running the report... ${d.toLocaleString()} / ${N.toLocaleString()} raids`; };
      let html;
      if (j === 0) {
        const su = r.setup.sote, o = { entry: su.entry || 0, ...(su.opts || {}) };
        const res = await reportPool().report({ room: 'sote', players, opts: o, team: t }, 0, N, seed, prog);
        html = soteReportHtml([res], t, { ...opts, entries: [o.entry] });
      } else if (j === 1) {
        const res = await reportPool().report({ room: 'xarpus', players, opts: r.setup.xarpus.opts, team: t }, 0, N, seed, prog);
        html = xarpusReportHtml([res], t, opts);
      } else {
        if (!runVerzik) throw new Error('the report runner is not available here');
        const res = await runVerzik(cfgs, t, N, Math.floor(Math.random() * 1e9), (d, n) => { msg.textContent = `Running the report... ${Number(d).toLocaleString()} / ${Number(n).toLocaleString()} raids`; });
        html = verzReportHtml([res], [label], t, N, opts);
      }
      msg.textContent = '';
      (r.rep ||= [])[j] = `${entryLine(e, j)}${html}`;
      box.innerHTML = r.rep[j]; box.hidden = false; b.textContent = 'Hide report';
    } catch (x) { msg.textContent = `Couldn't run: ${x.message}`; } finally { b.disabled = false; }
  }
  async function showRoomProc(ci, j, b) {
    const box = host.querySelector(`[data-rout="proc|${ci}|${j}"]`), msg = host.querySelector(`[data-rmsg="${ci}|${j}"]`);
    if (!box.hidden && box.innerHTML) { box.hidden = true; b.textContent = 'Show procedure'; return; }
    b.disabled = true;
    try {
      const r = results.ranked[ci], t = results.t, names = results.names, say = (x) => { msg.textContent = x; };
      const { e, players, cfgs } = await roomEntry(ci, j, msg);
      if (j === 0) {
        box.hidden = false; box.innerHTML = '';
        const inner = document.createElement('div'); box.append(inner);
        await rooms.sote.fullProcedure(inner, { players, entry: r.setup.sote.entry || 0, opts: r.setup.sote.opts || {}, names, bps: roomBps(0), say });
        msg.textContent = '';
      } else if (j === 1) {
        box.innerHTML = entryLine(e, 1) + rooms.xarpus.procHtml({ cfg: { ...r.setup.xarpus.opts, players }, names });
        msg.textContent = '';
      } else {
        const late = cfgs.map((c, k) => (c.customSurgeTick != null ? `${esc(names[k])} surges on tick ${c.customSurgeTick} (${fsec(c.customSurgeTick)}${e && e.cd[k] > 0 ? ', once the cooldown is up' : ''})` : null)).filter(Boolean);
          box.innerHTML = `${entryLine(e, 2)}${late.length ? `<div class="small" style="margin:4px 0">Surges off the chart: ${late.join(' · ')}</div>` : ''}${verzSetupHtml(cfgs, names, t)}<div data-vtree style="margin-top:8px"></div>${verzRaidBar(`fr-${ci}-${Date.now()}`, cfgs, t, results.vBps || [])}`;
        box.hidden = false;
        const by = await profileChunks(cfgs, t, 2000, 4242, (d, n) => say(`Decision tree: playing raids... ${d.toLocaleString()} / ${n.toLocaleString()}`));
        box.querySelector('[data-vtree]').innerHTML = verzikTreeHtml(by, cfgs, t, esc);
        msg.textContent = '';
      }
      box.hidden = false; b.textContent = 'Hide procedure';
    } catch (x) { msg.textContent = `Couldn't show it: ${x.message}`; } finally { b.disabled = false; }
  }

  /** A combination's total times (and each room's): how often each happens, and finished by that time or faster - % of
   *  every attempt (raids that failed count, so the lines top out at the share that finished). */
  function chartsHtml(r, ci) {
    const ok = (v) => v.filter((x) => x < 99999), n = r.totals.length, bps = results.how.mode === 'rooms' ? [] : results.how.total;
    const tot = [{ total: ok(r.totals), runs: n, ofAll: true }], lab = [`#${ci + 1}`];
    const room = (j) => [{ total: ok(r.ends[j]), runs: n, ofAll: true }];
    const roomBp = (j) => (results.how.rooms[j] != null ? [results.how.rooms[j]] : []);
    return `<div data-charts><h3>Combination #${ci + 1}: how often each total time happens (per second, % of all attempts)</h3><div class="scroll">${chartBox((rg) => histogramSvg(tot, lab, rg).replace('% of successful runs', '% of all attempts'))}</div>
      <h3>Finished the raid by this time or faster - % of all attempts</h3><div class="sub">${bps.length ? 'Vertical lines are your total-time breakpoints.' : 'Raids that failed count as attempts, so the line tops out at the share that finished.'}</div>
      <div class="scroll">${chartBox((rg) => cumulativeSvg(tot, lab, bps, rg).replace('% of successful runs finished by this time', '% of all attempts finished by this time'))}</div>
      <details style="margin-top:8px"><summary class="small" style="cursor:pointer">Each room's times (finished by this time or faster)</summary>
      ${ROOM_NAMES.map((rn, j) => `<h4>${rn}</h4><div class="scroll">${chartBox((rg) => cumulativeSvg(room(j), [rn], roomBp(j), rg).replace('% of successful runs finished by this time', '% of all attempts finished by this time'))}</div>`).join('')}</details></div>`;
  }

  if (typeof window !== 'undefined') { window.__fullRaidResults = () => results; window.__fullRaidSet = (x) => { results = x; charted = 0; showResults(); }; }   // for tests
  return { refresh: render };
}
