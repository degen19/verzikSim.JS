// Full raid tab: solve (Nylocas ->) Sotetseg -> Xarpus -> Verzik as one raid. Everything comes from this tab (nothing from the room
// tabs): the Gear set, each room's supplies / mazes / heals, the surge cooldowns and doses carried room to room, and the
// Lightbearers and horns (ticked in the Gear tab - held by their owners, or traded before each room with Enable trades).
// Each room's Solver decides that room's procedure; Verzik P1 is your chart's when "Use my Verzik P1 chart" is ticked. The best few setups of each room are then
// played together as whole raids (engine/fullraid.js) and ranked on the total time or on each room's own breakpoint.
// Results: for the combination shown, each boss's procedure (decision tree, example raids; Verzik's P1 chart) and its
// standard Run report (20,000 raids), with the surge cooldowns / doses players come into that room with; then the charts.
import { activeNow } from './engine/pause.js';
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { parseBreakpoints } from './engine/optimize.js';
import { runSote, MAZE_HOW, defaultMazes, normRangePot } from './engine/sote.js';
import { rangePotCell, rangePotFrom, RANGE_POT_TIP } from './sote-ui.js';
import { HEALS_DEFAULT, defaultXarpusPlan } from './engine/xarpus.js';
import { autoRangePot } from './xarpus-ui.js';
import { parse_chart } from './engine/sim.js';
import { CODES, CODE_HELP, isAutoTick, checkRow } from './engine/chartform.js';
import { gearOfLetter } from './engine/gearstore.js';
import { runXarpus } from './engine/xarpus.js';
import { runNylo, parseWaveTimes, fmtWave, MAX_SWITCHES, normSwitches } from './engine/nylo.js';
import { Rng } from './engine/rng.js';
import { ALL_ROOMS, forceSurgers, fullScore, fullBetter, SURGE_CD, surgersOf, withSurgers, subsets, distOf, convolve, planScore } from './engine/fullraid.js';
import { FullRaidPool } from './fullraid-pool.js';
import { histogramSvg, cumulativeSvg, chartBox, reportHtml as verzReportHtml } from './engine/report.js';
import { commonEntry, verzikCfgs } from './engine/fullraid.js';
import { soteReportHtml } from './engine/sotereport.js';
import { xarpusReportHtml } from './engine/xarpusreport.js';
import { verzSetupHtml } from './verzsetup.js';
import { verzikTreeHtml, profileChunks } from './engine/vtree.js';
import { verzRaidBar, showVerzRaid } from './verzraid.js';
import { canonCd, relabelSetup, groupsOf } from './engine/symmetry.js';
import { codeFingerprint, getSolve, putSolve, countSolves, clearSolves } from './solvecache.js';

const STORE = 'verzikSim.fullraid.v1';           // {team: {gearSet, cd: [m:ss], doses: [n], useChart, chartSet, mode, total, rooms: [s, x, v], effort}}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage off */ } };
/** Use my P1 chart: an earlier surge's cooldown has to be up at least this many ticks before the chart needs the surge. */
const CHART_MARGIN = 5;
/** Exhaustive with warm starts: the best this many plans are solved from scratch too (their Verzik), to check. */
const WARM_CHECK = 3;
/** Exhaustive: warm-start each plan's Verzik from the best plan so far (off - no faster in testing, less accurate). */
const WARM_V = false;
/** Exhaustive: cooldowns into a room are rounded to this many ticks (25: 15s) - each case is solved once. */
const CD_STEP = 25;
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
const KIND_NAME = { nylo: 'Nylocas', sote: 'Sotetseg', xarpus: 'Xarpus', verzik: 'Verzik' };
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
  /** The shown results' rooms, in order, and their names. */
  const kindsR = () => (results && results.kinds) || ['sote', 'xarpus', 'verzik'];
  const namesR = () => kindsR().map((k) => KIND_NAME[k]);
  const team = () => Number(getTeam()) || 4;
  const st = () => {
    const t = team(); state[t] ||= {}; const s = state[t];
    s.gearSet ||= 'A'; s.cd ||= []; s.doses ||= []; s.mode ||= 'total'; s.total ??= ''; s.rooms ||= ['', '', '']; s.effort ||= 'normal'; s.chartSet ||= 'A'; s.rankBy ||= 'goal';
    for (let k = 0; k < t; k++) { s.cd[k] ??= ''; s.doses[k] ??= 2; }
    s.cd.length = t; s.doses.length = t;
    s.sote ||= {}; s.sote.players ||= []; s.sote.noLateSurge ??= false;
    for (let k = 0; k < t; k++) { s.sote.players[k] ||= { pnecks: 2, sharks: 3, rests: 0, restores: 3, mazes: null }; s.sote.players[k].rangePot = normRangePot(s.sote.players[k].rangePot); }
    s.sote.players.length = t;
    s.xarpus ||= {}; s.xarpus.heals ??= HEALS_DEFAULT[t]; s.xarpus.exactHeals ??= false; s.xarpus.rangePots ||= [];
    { const dp = defaultXarpusPlan(t); for (let k = 0; k < t; k++) s.xarpus.rangePots[k] = s.xarpus.rangePots[k] == null ? autoRangePot(dp, k) : normRangePot(s.xarpus.rangePots[k]); s.xarpus.rangePots.length = t; }   // default: as the sim played it before (Ralos players in the default plan)
    s.verzik ||= {}; s.verzik.pnecks ||= []; for (let k = 0; k < t; k++) s.verzik.pnecks[k] ??= 0; s.verzik.pnecks.length = t;
    s.verzik.tome ||= []; for (let k = 0; k < t; k++) s.verzik.tome[k] ||= { reds: false, scythe: false }; s.verzik.tome.length = t;
    s.verzik.team ||= { Sharks: '', 'Brew sips': '', 'Restore sips': '', 'SCB sips': '' };
    s.trades ??= false;
    s.nylo ||= {};
    s.on ||= { nylo: s.nylo.on ?? true, sote: true, xarpus: true, verzik: true };   // the rooms to run (in a row)
    s.nylo.maxSwitches ||= []; s.nylo.healer ??= null; s.nylo.restores ??= 8; s.nylo.bp ??= '';
    s.nylo.wave ||= [{ time: '', freq: '' }];
    for (let k = 0; k < t; k++) s.nylo.maxSwitches[k] = normSwitches(s.nylo.maxSwitches[k] ?? MAX_SWITCHES);
    s.nylo.maxSwitches.length = t; if (s.nylo.healer != null && (t !== 2 || s.nylo.healer >= t)) s.nylo.healer = null;
    return s;
  };
  /** A player's mazes: as set, else the default for their phoenix necklaces (and locator orb). */
  const mazes = (sp, k, gp) => (Array.isArray(sp.mazes) ? sp.mazes : defaultMazes(Number(sp.pnecks || 0), !!(gp && gp[k] && gp[k].locator), team()));
  const gearPlayers = (s) => { const set = gearSet(loadGear(), team(), s.gearSet); return set ? playersOf(set, team()) : null; };

  /** The rooms ticked, in raid order, and whether they're in a row (no gaps). */
  const picked = (s) => { const ks = ALL_ROOMS.filter((k) => s.on[k]), ix = ks.map((k) => ALL_ROOMS.indexOf(k)); return { ks, ok: ks.length > 0 && ix.every((x, i) => !i || x === ix[i - 1] + 1) }; };
  const tick = (s, k) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center;display:inline-flex"><input type="checkbox" data-on="${k}" ${s.on[k] ? 'checked' : ''}>${KIND_NAME[k]}</label>`;
  /** Room solves by room: how many were made and the time they took, and how many were reused. */
  const statsTxt = (ss) => {
    if (!ss) return '';
    const dur = (ms) => { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : m >= 1 ? `${m}m` : `${Math.round(ms / 1000)}s`; };
    const parts = Object.entries(ss).filter(([, x]) => x.n || x.saved || x.swapped || x.again).map(([k, x]) => {
      const re = [x.saved && `${x.saved} saved`, x.swapped && `${x.swapped} with identical players swapped`, x.again && `${x.again} repeated`].filter(Boolean);
      return `${KIND_NAME[k]} ${x.n} (${dur(x.ms)})${re.length ? ` + reused: ${re.join(', ')}` : ''}`; });
    return parts.length ? `Room solves: ${parts.join(' · ')}.` : '';
  };
  const refreshSaved = () => countSolves().then((n) => { const e = host.querySelector('[data-saved]'); if (e) e.textContent = n.toLocaleString(); });
  function render() {
    const s = st(), t = team(), pk = picked(s), g = loadGear(), gp = gearPlayers(s), lb = gp ? gp.filter((p) => p.lightbearer).length : 0, horns = gp ? gp.filter((p) => p.horn).length : 0;
    const name = (k) => esc((gp && gp[k] && gp[k].name) || `Player ${k + 1}`);
    host.innerHTML = `<div class="card"><h3 style="margin-top:0">Full raid <span class="muted small">(${t}-man: ${pk.ks.map((k) => KIND_NAME[k]).join(' → ') || 'no rooms ticked'})</span></h3>
      <div class="small ${pk.ok ? 'muted' : 'warn'}">${pk.ok ? 'Tick the rooms to run below - any run of them in a row.' : pk.ks.length ? "The rooms need to be in a row - no gaps (e.g. Nylocas + Sotetseg + Xarpus, not Nylocas + Xarpus + Verzik)." : 'Tick at least one room.'}</div>
      <p class="muted small">Solves the rooms as one raid - the solver decides each room's procedure (specs, surges, Lightbearer cycles, maze entry, Verzik's P1 chart unless you use yours). Everything it needs is on this tab; gear comes from the Gear tab. Spec resets each room (95 or 100 to start); the surge cooldown and doses carry over.</p>
      <div class="row wrap" style="gap:14px;align-items:end;margin-bottom:10px">
        <label>Gear<select data-f="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${x === s.gearSet ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}${gearSet(g, t, x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        <div class="muted small" style="padding-bottom:8px">${lb} Lightbearer${lb === 1 ? '' : 's'} and ${horns} horn${horns === 1 ? '' : 's'} (ticked in the Gear tab)</div>
      </div>
      <div class="scroll"><table class="bt"><tr><th></th><th title="Time left on their surge potion cooldown at the start of the first room (m:ss), rounded up to a tick - 1:04 means it's up after 1:04.2. Blank: ready">Surge cooldown into ${KIND_NAME[pk.ks[0]] || 'the first room'}</th><th title="Surge potion doses they bring for the three rooms">Surge doses</th></tr>
        ${Array.from({ length: t }, (_, k) => `<tr><td class="rl">${name(k)}</td><td><input data-cd="${k}" value="${esc(s.cd[k])}" placeholder="ready" style="width:80px"></td>
          <td><select data-dose="${k}">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}" ${n === Number(s.doses[k]) ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>`).join('')}</table></div>
      <label class="pick" style="flex-direction:row;gap:6px;align-items:center;margin-top:8px" title="On: the solver decides who holds each Lightbearer and horn in each room (they're traded between rooms - before a room, never during one). Off: they stay with whoever has them ticked in the Gear tab."><input type="checkbox" data-f="trades" ${s.trades ? 'checked' : ''}>Enable trades</label>
      <div class="muted small">On: the solver decides who holds each Lightbearer (${lb}) and horn (${horns}) in each room - traded before a room, never during one. It takes longer to run. Off: they stay with whoever has them ticked in the Gear tab.</div>
      <style>.frblk{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:10px 0}.frblk h4{margin:0 0 6px}</style>
      <div class="frblk"><h4>${tick(s, 'nylo')}</h4>
        ${s.on.nylo ? (() => { const w = parseWaveTimes(s.nylo.wave); return `<div class="muted small">The waves and the boss: room time = wave time + boss time (the waves run down surge cooldowns too). The solver decides the specs and surges; cross praying with each player's Max switches.</div>
        <div class="row wrap" style="gap:14px;align-items:flex-start;margin-top:6px">
          <div class="scroll"><table class="bt"><tr><th></th>${[['melee', 'melee'], ['range', 'range'], ['mage', 'mage']].map(([, l]) => `<th title="Cross praying: a wrong prediction with him ${l} leaves this many ${l} item switches a tick before their first attack in the form (the weapon first). Due on N2: the attack goes on N3">Max ${l} switches<br>on wrong prediction</th>`).join('')}${t === 2 ? '<th title="Feeds HP and Vengs to other player with redemption - requires locator orb and restore doses">Healer Tech</th>' : ''}</tr>
            ${Array.from({ length: t }, (_, k) => `<tr><td class="rl">${name(k)}</td>${['melee', 'range', 'mage'].map((y) => `<td><select data-nyms="${k}|${y}">${[1, 2, 3, 4, 5, 6, 7, 8].map((x) => `<option ${x === s.nylo.maxSwitches[k][y] ? 'selected' : ''}>${x}</option>`).join('')}</select></td>`).join('')}${t === 2 ? `<td style="text-align:center"><input type="checkbox" data-nyh="${k}" ${s.nylo.healer === k ? 'checked' : ''}></td>` : ''}</tr>`).join('')}</table></div>
          ${t === 2 ? `<label title="Restore doses for the Healer Tech player's redemption loops">Restore doses<input type="number" min="0" max="40" data-ny="restores" value="${esc(s.nylo.restores)}" style="width:60px"></label>` : ''}
          <div><div class="small" style="font-weight:600">Wave times (required)</div><table class="bt"><tr><th>Wave time</th><th>Frequency</th><th></th></tr>
            ${s.nylo.wave.map((r, j) => `<tr><td><input data-nyw="${j}|time" value="${esc(r.time)}" placeholder="m:ss.s" style="width:80px"></td><td><input data-nyw="${j}|freq" value="${esc(r.freq)}" placeholder="%" style="width:60px"> %</td><td>${s.nylo.wave.length > 1 ? `<button class="ghost sm" data-nywdel="${j}">Remove</button>` : ''}</td></tr>`).join('')}</table>
            <button class="ghost sm" data-nywadd style="margin-top:4px">+ Add wave time</button>
            <div class="small ${w.error ? 'warn' : 'muted'}" data-nywmsg style="margin-top:4px">${w.error ? esc(w.error) : `Average wave time ${fmtWave(Math.round(w.mean))} - times a whole tick, 2.4s (4 ticks) apart; frequencies add up to 100%.`}</div></div>
        </div>`; })() : '<div class="muted small">Not run.</div>'}</div>
      <div class="frblk"><h4>${tick(s, 'sote')}</h4>${s.on.sote ? '' : '<div class="muted small">Not run.</div>'}<div ${s.on.sote ? '' : 'hidden'}><div class="scroll"><table class="bt"><tr><th></th><th>Phoenix necklaces</th><th>Sharks</th><th title="Guthix rest sips (a 4 dose = 4 sips)">Guthix rest sips</th><th>Restore sips</th><th title="How they cross the first maze (Redemption needs a locator orb, 1-4s; Shark: one player)">First maze</th><th>Second maze</th><th title="${RANGE_POT_TIP}">Range pot</th></tr>
        ${Array.from({ length: t }, (_, k) => { const sp = s.sote.players[k], m = mazes(sp, k, gp);
          return `<tr><td class="rl">${name(k)}</td>${['pnecks', 'sharks', 'rests', 'restores'].map((f) => `<td><input type="number" min="0" data-sote="${k}|${f}" value="${esc(sp[f])}" style="width:60px"></td>`).join('')}
          ${[0, 1].map((i) => `<td><select data-maze="${k}|${i}">${MAZE_HOW.map(([v, l]) => `<option value="${v}" ${v === m[i] ? 'selected' : ''} ${v === 'redemption' && t >= 5 ? 'disabled' : ''}>${l}</option>`).join('')}</select></td>`).join('')}<td>${rangePotCell('spot', k, sp.rangePot)}</td></tr>`; }).join('')}</table></div>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Only setups where every surge is drunk in P1"><input type="checkbox" data-f="soteNoLate" ${s.sote.noLateSurge ? 'checked' : ''}>No P2 / P3 surges</label></div></div>
      <div class="frblk"><h4>${tick(s, 'xarpus')}</h4>${s.on.xarpus ? '' : '<div class="muted small">Not run.</div>'}<div class="row" style="gap:14px;align-items:end" ${s.on.xarpus ? '' : 'hidden'}>
        <label title="Exhumed heals (missed ticks): each one is HP on top of his base">Number of heals<input type="number" min="0" data-xh value="${esc(s.xarpus.heals)}" style="width:70px"></label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-xe ${s.xarpus.exactHeals ? 'checked' : ''}>Exact heals (no ±2)</label></div>
        <div ${s.on.xarpus ? '' : 'hidden'} style="margin-top:6px"><div class="scroll"><table class="bt"><tr><th></th>${Array.from({ length: t }, (_, k) => `<th>${name(k)}</th>`).join('')}</tr>
          <tr><td class="rl" title="${RANGE_POT_TIP.replace('prefires and ZCB specs', 'Ralos Specs, ZCB specs and blowpipe tick fixes')}">Range pot</td>${Array.from({ length: t }, (_, k) => `<td>${rangePotCell('xrpot', k, s.xarpus.rangePots[k])}</td>`).join('')}</tr></table></div></div></div>
      <div class="frblk"><h4>${tick(s, 'verzik')}</h4>${s.on.verzik ? '' : '<div class="muted small">Not run.</div>'}<div ${s.on.verzik ? '' : 'hidden'}><div class="row" style="gap:14px;align-items:end;flex-wrap:wrap">
        ${Object.keys(s.verzik.team).map((h) => `<label title="The whole team's (blank: the chart template's default)">${h === 'SCB sips' ? 'Super combat sips' : h} (team)<input type="number" min="0" data-vt="${esc(h)}" value="${esc(s.verzik.team[h])}" placeholder="default" style="width:80px"></label>`).join('')}</div>
        <div class="scroll"><table class="bt"><tr><th></th>${Array.from({ length: t }, (_, k) => `<th>${name(k)}</th>`).join('')}</tr>
          <tr><td class="rl">Phoenix necklaces</td>${Array.from({ length: t }, (_, k) => `<td><input type="number" min="0" data-vp="${k}" value="${esc(s.verzik.pnecks[k])}" style="width:60px"></td>`).join('')}</tr>
          ${[['reds', 'Tome Reds', "Zorya's tome in P2 reds (needs a tome in the Gear tab). The starting point: the solver tries it on and off for each player with a tome"], ['scythe', 'Scythe first hit after tome', 'A full-switch scythe as their first hit after their last buffed tome attack (needs a tome). Kept as set - the solver doesn\'t change it']].map(([f, l, tip]) => `<tr><td class="rl" title="${esc(tip)}">${l}</td>${Array.from({ length: t }, (_, k) => { const has = !!(gp && gp[k] && (gp[k].weapons || []).includes("Zorya's tome")); return `<td style="text-align:center"><input type="checkbox" data-vtome="${k}|${f}" ${has && s.verzik.tome[k][f] ? 'checked' : ''} ${has ? '' : 'disabled title="No Zorya\'s tome (Gear tab)"'}></td>`; }).join('')}</tr>`).join('')}</table></div>
        <div class="muted small">Tome Reds: the solver tries it on and off for each player with a tome; Scythe first hit after tome stays as ticked. Shadows come from the Gear tab (a Tumeken's shadow): the solver tries the shadow options for whoever has one. Everything else is the chart template's defaults.</div>
      <div class="row wrap" style="gap:14px;align-items:center;margin:10px 0 0">
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Keep your Verzik chart's P1 rotation (much faster) - ring swaps, DCs, horns and the rest are still searched"><input type="checkbox" data-f="useChart" ${s.useChart ? 'checked' : ''}>Use my Verzik P1 chart</label>
      </div>
      ${s.useChart ? chartEditor(s, t, gp) : ''}</div></div>
      <div class="row wrap" style="gap:14px;align-items:end">
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="radio" name="frmode" data-f="mode" value="total" ${s.mode === 'total' ? 'checked' : ''}>Search for under TOTAL TIME</label>
        <label>Total time (m:ss, comma-separated)<input data-f="total" value="${esc(s.total)}" placeholder="e.g. 6:00" style="width:150px" ${s.mode === 'total' ? '' : 'disabled'}></label>
      </div>
      <div class="row wrap" style="gap:14px;align-items:end;margin-top:6px">
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="radio" name="frmode" data-f="mode" value="rooms" ${s.mode === 'rooms' ? 'checked' : ''}>Use these specific breakpoints</label>
        ${s.on.nylo ? `<label title="Room time: waves + boss">Nylocas<input data-ny="bp" value="${esc(s.nylo.bp)}" placeholder="m:ss" style="width:80px" ${s.mode === 'rooms' ? '' : 'disabled'}></label>` : ''}
        ${ROOM_NAMES.map((r, j) => (s.on[ALL_ROOMS[j + 1]] ? `<label>${r}<input data-room="${j}" value="${esc(s.rooms[j])}" placeholder="m:ss" style="width:80px" ${s.mode === 'rooms' ? '' : 'disabled'}></label>` : '')).join('')}
      </div>
      <div class="row wrap" style="gap:14px;align-items:end;margin-top:10px">
        <label title="Goal time: the share of attempts under your time(s) - the first total time, or every room under its own breakpoint. Success rate: the share of attempts that finish (then the median).">Rank by<select data-f="rankBy"><option value="goal" ${s.rankBy !== 'success' ? 'selected' : ''}>Goal time</option><option value="success" ${s.rankBy === 'success' ? 'selected' : ''}>Success rate</option></select></label>
        <label title="Plans that finish less often than this (of every attempt) go to the bottom, however fast - your team's risk tolerance. Blank: no minimum.">Min. success %<input data-f="minSuccess" value="${esc(s.minSuccess ?? '')}" placeholder="none" style="width:60px"></label>
        <label>Effort<select data-f="effort">${Object.entries(EFFORTS).map(([k, x]) => `<option value="${k}" ${k === s.effort ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Every surge plan (who surges in which room - every dose used, in whichever rooms), each room solved for exactly that plan and the cooldowns it brings; plans that can't win dropped by bounds; the rest played as whole raids. Much slower (can be hours) - the most accurate. Use my Verzik P1 chart speeds it up a lot."><input type="checkbox" data-f="exhaustive" ${s.exhaustive ? 'checked' : ''}>Exhaustive surge plans (slow)</label>
        <button data-act="run">Solve</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page): the pieces already running finish, then it waits. Resume carries on from the same spot with the inputs it started with">Pause</button>
      </div>
      <div class="muted small" style="margin-top:6px" title="Room solves are saved in this browser and reused when a run needs exactly the same solve again (a rerun after a reload or a stop, or after changing something that doesn't touch that room). Any change to the sim or the solvers starts afresh.">Saved room solves: <span data-saved>…</span> <button class="ghost sm" data-clearsaved>Clear</button></div>
      <div data-status class="muted" style="margin-top:8px"></div><div data-err class="err"></div></div>
      <div data-out></div>`;
    refreshSaved();
    showResults();
  }

  host.addEventListener('change', (e) => {
    const el = e.target, s = st();
    if (el.dataset.on) { s.on[el.dataset.on] = el.checked; save(state); render(); return; }
    if (el.dataset.ny) { const k = el.dataset.ny; s.nylo[k] = k === 'restores' ? Math.max(0, Math.trunc(Number(el.value) || 0)) : el.value; save(state); return; }
    if (el.dataset.nyms != null) { const [k, y] = el.dataset.nyms.split('|'); s.nylo.maxSwitches[Number(k)] = { ...normSwitches(s.nylo.maxSwitches[Number(k)]), [y]: Number(el.value) }; save(state); return; }
    if (el.dataset.nyh != null) { s.nylo.healer = el.checked ? Number(el.dataset.nyh) : null; save(state); render(); return; }
    if (el.dataset.nyw) { const [j, f] = el.dataset.nyw.split('|'); s.nylo.wave[Number(j)][f] = el.value.trim(); save(state); render(); return; }
    if (el.dataset.f === 'soteNoLate') s.sote.noLateSurge = el.checked;
    else if (el.dataset.f) s[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    else if (el.dataset.cd != null) s.cd[Number(el.dataset.cd)] = el.value;
    else if (el.dataset.dose != null) s.doses[Number(el.dataset.dose)] = Number(el.value);
    else if (el.dataset.room != null) s.rooms[Number(el.dataset.room)] = el.value;
    else if (el.dataset.cact) { const [k, x] = el.dataset.cact.split('|').map(Number), v = String(el.value || '').trim().toUpperCase(), ch = chartOf(s, team()); if (v) ch.acts[k][x] = v; else delete ch.acts[k][x]; save(state); render(); return; }
    else if (el.dataset.cstart != null) chartOf(s, team()).start[Number(el.dataset.cstart)] = Number(el.value);
    else if (el.dataset.spot != null || el.dataset.spotkind != null) { const k = Number(el.dataset.spot ?? el.dataset.spotkind); s.sote.players[k].rangePot = rangePotFrom(el, el.dataset.spotkind != null, s.sote.players[k].rangePot); save(state); render(); return; }
    else if (el.dataset.sote) { const [k, f] = el.dataset.sote.split('|'); s.sote.players[Number(k)][f] = Math.max(0, Math.trunc(Number(el.value) || 0)); }
    else if (el.dataset.maze) { const [k, i] = el.dataset.maze.split('|').map(Number), sp = s.sote.players[k], m = [...mazes(sp, k, gearPlayers(s))]; m[i] = el.value; sp.mazes = m; }
    else if (el.dataset.xh != null) s.xarpus.heals = Math.max(0, Math.trunc(Number(el.value) || 0));
    else if (el.dataset.xe != null) s.xarpus.exactHeals = el.checked;
    else if (el.dataset.xrpot != null || el.dataset.xrpotkind != null) { const k = Number(el.dataset.xrpot ?? el.dataset.xrpotkind); s.xarpus.rangePots[k] = rangePotFrom(el, el.dataset.xrpotkind != null, s.xarpus.rangePots[k]); save(state); render(); return; }
    else if (el.dataset.vt) s.verzik.team[el.dataset.vt] = el.value === '' ? '' : Math.max(0, Math.trunc(Number(el.value) || 0));
    else if (el.dataset.vtome) { const [k, f] = el.dataset.vtome.split('|'); s.verzik.tome[Number(k)][f] = el.checked; }
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
    if (b.dataset.nywadd != null) { st().nylo.wave.push({ time: '', freq: '' }); save(state); render(); return; }
    if (b.dataset.nywdel != null) { st().nylo.wave.splice(Number(b.dataset.nywdel), 1); save(state); render(); return; }
    if (b.dataset.clearsaved != null) { await clearSolves(); render(); return; }
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
    if (b.dataset.chart != null) { charted = Number(b.dataset.chart); showResults(); autoReports(charted); host.querySelector('[data-charts]')?.scrollIntoView({ block: 'nearest' }); return; }
    const a = b.dataset.act; if (!a) return;
    const status = host.querySelector('[data-status]'), err = host.querySelector('[data-err]');
    if (a === 'stop') { if (job) { job.stopped = true; for (const p of job.pools) p.stop(); } return; }
    if (a !== 'run' || job) return;
    err.textContent = '';
    const s = st(), t = team(), ef = EFFORTS[s.effort] || EFFORTS.normal, gp = gearPlayers(s);
    if (!gp) { err.textContent = `Gear set ${s.gearSet} is empty - set the team's gear in the Gear tab.`; return; }
    if (s.on.verzik && s.useChart && !chartOf(s, t).acts.some((a) => Object.keys(a).length)) { err.textContent = 'Use my Verzik P1 chart: the P1 chart is empty - build it or load one of your Verzik sets.'; return; }
    if (t === 1) { err.textContent = 'The Full raid solver is for 2-5 man raids.'; return; }
    const pk = picked(s), KINDS = pk.ks, nyOn = !!s.on.nylo;
    if (!pk.ok) { err.textContent = KINDS.length ? 'Pick rooms in a row - no gaps between them.' : 'Tick at least one room.'; return; }
    const wave = nyOn ? parseWaveTimes(s.nylo.wave) : null;
    if (wave && wave.error) { err.textContent = `Nylocas wave times: ${wave.error}`; return; }
    let cd0, total = [], roomBps = KINDS.map(() => null);
    try {
      cd0 = s.cd.map(toTicks);
      const bp1 = (x) => (String(x || '').trim() ? parseBreakpoints(x)[0] : null);
      if (s.mode === 'rooms') roomBps = KINDS.map((k) => (k === 'nylo' ? bp1(s.nylo.bp) : bp1(s.rooms[ALL_ROOMS.indexOf(k) - 1])));
      else total = String(s.total || '').trim() ? parseBreakpoints(s.total) : [];
    } catch (x) { err.textContent = x.message; return; }
    const doses0 = s.doses.map(Number), lbRings = gp.filter((p) => p.lightbearer).length, hornLimit = gp.filter((p) => p.horn).length;
    // no trades: Lightbearers and horns stay with their owners; trades: anyone may hold one in a room (as many as there are)
    const lbOwners = s.trades ? null : gp.map((p) => !!p.lightbearer), hornOwners = s.trades ? null : gp.map((p) => !!p.horn);
    const gearPatch = s.trades && hornLimit ? gp.map(() => ({ horn: true })) : [];
    const solveStats = Object.fromEntries(['nylo', 'sote', 'xarpus', 'verzik'].map((k) => [k, { n: 0, ms: 0, saved: 0, swapped: 0, again: 0 }]));
    job = { stopped: false, pools: [] }; const me = job;
    const btn = (x) => host.querySelector(`[data-act="${x}"]`); btn('run').disabled = true; btn('stop').disabled = false;
    const t1 = activeNow(), say = (room) => (txt) => { const n = Object.values(solveStats).reduce((x, y) => x + y.n, 0); status.textContent = `${room}: ${txt} (${Math.round((activeNow() - t1) / 1000)}s${n ? ` · ${n} room solve${n === 1 ? '' : 's'} so far` : ''})`; };
    const common = { gearSet: s.gearSet, lbRings, lbOwners, hornLimit, gearPatch, effort: s.effort, stopped: () => me.stopped, onPool: (p) => me.pools.push(p) };
    // players identical in every input (gear, cooldown, doses, each room's settings for them, your P1 chart's row)
    const on = (r) => KINDS.includes(r);   // (only the rooms being run)
    const sigs = cd0.map((_, k) => JSON.stringify([{ ...gp[k], name: null }, cd0[k], doses0[k], on('nylo') ? [s.nylo.maxSwitches[k], s.nylo.healer === k] : null, on('sote') ? s.sote.players[k] : null, on('xarpus') ? s.xarpus.rangePots[k] : null,
      on('verzik') ? [s.verzik.pnecks[k], s.verzik.tome[k], s.useChart && s.chart ? [(s.chart.acts || [])[k], (s.chart.start || [])[k]] : null] : null]));
    const groups = groupsOf(sigs);
    const fp = await codeFingerprint();   // (null: the code can't be read - nothing saved or reused across runs)
    const soteSup = s.sote.players.map((sp, k) => ({ pnecks: sp.pnecks, sharks: sp.sharks, rests: sp.rests, restores: sp.restores, mazes: mazes(sp, k, gp), rangePot: normRangePot(sp.rangePot) }));
    const vSup = { team: Object.fromEntries(Object.entries(s.verzik.team).filter(([, x]) => x !== '' && x != null)), players: s.verzik.pnecks.map((n, k) => ({ 'Phoenix necklaces': n, 'Tome Reds': !!s.verzik.tome[k].reds, 'Scythe first hit after tome': !!s.verzik.tome[k].scythe })) };
    try {
      const how = { mode: s.mode, total, rooms: roomBps, rankBy: s.rankBy };
      const NONE = cd0.map(() => 99999), RN = { nylo: 'Nylocas', sote: 'Sotetseg', xarpus: 'Xarpus', verzik: 'Verzik' };
      const R = KINDS.length, LAST = R - 1, ri = (kind) => KINDS.indexOf(kind), bpOf = (kind) => roomBps[ri(kind)];
      const medOf = (v) => { const a = v.filter((x) => x < 9999).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 0; };
      // each room's solve -> {list (as its tab shows it), setups: [{setup, i}]} - its best few, in full-raid form; med: its
      // median room time (Nylocas: boss + the average wave)
      const nSolve = async (cd, tag, must = null) => { const it = await rooms.nylo.fullRaidSolve({ ...common, mustSurge: must, keep: ef.keep, maxSwitches: s.nylo.maxSwitches, healer: s.nylo.healer, restores: s.nylo.restores, waveDist: wave.dist, surgeCd: cd, bps: bpOf('nylo') != null ? [bpOf('nylo') - wave.mean * 0.6].filter((b) => b > 0) : [], say: say(`Nylocas ${tag}`) });
        return clean({ kind: 'nylo', list: it, setups: it.slice(0, ef.keep).map((x, i) => ({ i, setup: x.run })), med: it.length ? medOf(it[0].totals) + Math.round(wave.mean) : 0 }, cd); };
      const soteSolve = async (cd, tag, must = null) => { const it = await rooms.sote.fullRaidSolve({ ...common, mustSurge: must, supplies: soteSup, noLateSurge: !!s.sote.noLateSurge, surgeCd: cd, bps: bpOf('sote') != null ? [bpOf('sote')] : [], say: say(`Sotetseg ${tag}`) });
        return clean({ kind: 'sote', list: it, setups: it.slice(0, ef.keep).map((x, i) => ({ i, setup: { players: x.replay.players, entry: x.replay.entry, opts: x.replay.opts } })), med: it.length ? medOf(it[0].totals) : 0 }, cd); };
      const xSolve = async (cd, tag, must = null) => { const it = await rooms.xarpus.fullRaidSolve({ ...common, mustSurge: must, heals: s.xarpus.heals, exactHeals: !!s.xarpus.exactHeals, rangePots: s.xarpus.rangePots, surgeCd: cd, bps: bpOf('xarpus') != null ? [bpOf('xarpus')] : [], say: say(`Xarpus ${tag}`) });
        return clean({ kind: 'xarpus', list: it, setups: it.slice(0, ef.keep).map((x, i) => ({ i, setup: x.run })), med: it.length ? medOf(it[0].totals) : 0 }, cd); };
      const vSolve = async (cd, tag, bps, warm = null) => { const r = await rooms.verzik.fullRaidSolve({ ...common, hornOwners, supplies: vSup, effort: ef.verz, chart: s.useChart ? chartOf(s, t) : null, warm, surgeCd: cd, bps, say: say(`Verzik ${tag}${warm ? ' (warm start)' : ''}`) });
        return clean({ kind: 'verzik', res: r, list: r.top || [], setups: (r.top || []).slice(0, ef.keep).map((x, i) => ({ i, setup: { cfgs: x.cfg } })) }, cd); };
      const stop = () => { if (me.stopped) throw new Error('stopped'); };
      /** A solve's setups without the surges its blocked players (cooldown 99999) can't take. */
      const clean = (sv, cd) => { sv.setups = sv.setups.map((x) => ({ ...x, setup: withSurgers(sv.kind, x.setup, surgersOf(sv.kind, x.setup).filter((k) => cd[k] < 99999)) })); return sv; };
      let vBps = [];
      /** Min. success %: the plans under it go to the bottom (in their order), marked. */
      const minS = Number(String(s.minSuccess ?? '').replace('%', '')) || 0;
      const minFirst = (list) => { if (!minS) return; const ok = (r) => r.totals.filter((x) => x < 99999).length / r.totals.length * 100 >= minS - 1e-9;
        const a = list.filter(ok), b = list.filter((r) => !ok(r)); b.forEach((r) => { r.underMin = true; }); list.splice(0, list.length, ...a, ...b); };
      // ---- Use my P1 chart: the ticks each player's chart needs their surge by (a P, or the specs they can't afford
      // without one). A surge in an earlier room that would leave it on cooldown then rules that plan out.
      const VIk = KINDS.indexOf('verzik');
      let needs = null, chartSkipped = 0;
      if (VIk >= 0 && s.useChart) {
        say('Verzik')('working out when your P1 chart needs each player\'s surge');
        needs = await rooms.verzik.chartSurgeNeeds({ gearSet: s.gearSet, supplies: vSup, chart: chartOf(s, t) }); stop();
        const short = (needs || []).map((n, k) => (n != null && !(doses0[k] > 0) ? k : -1)).filter((k) => k >= 0);
        if (short.length) throw new Error(`Use my Verzik P1 chart: ${short.map((k) => `${gp[k].name || `Player ${k + 1}`}'s chart needs a surge by ${fsec(needs[k])} (tick ${needs[k]})`).join('; ')} - but they bring no surge doses.`);
        if (!(needs || []).some((n) => n != null)) needs = null;
      }
      /** A plan is fine for the chart unless an earlier-room surge leaves a player's surge on cooldown past CHART_MARGIN
       *  ticks before their chart needs it. cdV: cooldowns into Verzik (ticks). */
      const chartOk = (pl, cdV) => !needs || needs.every((n, k) => n == null || (pl[k].includes(VIk) && (!pl[k].some((r) => r < VIk) || cdV[k] <= n - CHART_MARGIN)));
      // must: players who surge in this room in the plan being solved for (exhaustive) - the room solver plans their specs
      // around it instead of a surge being put in afterwards
      // a room solve's inputs besides the cooldowns (for the saved solves' key)
      const inputsOf = (kind) => [common, kind === 'nylo' ? [ef.keep, s.nylo.maxSwitches, s.nylo.healer, s.nylo.restores, wave && wave.dist, bpOf('nylo')]
        : kind === 'sote' ? [soteSup, !!s.sote.noLateSurge, bpOf('sote')] : kind === 'xarpus' ? [s.xarpus.heals, !!s.xarpus.exactHeals, s.xarpus.rangePots, bpOf('xarpus')]
          : [vSup, hornOwners, ef.verz, s.useChart ? chartOf(s, t) : null]];
      const solveRaw = (kind, cd, tag, must = null, warm = null) => (kind === 'nylo' ? nSolve(cd, tag, must) : kind === 'sote' ? soteSolve(cd, tag, must) : kind === 'xarpus' ? xSolve(cd, tag, must) : vSolve(cd, tag, vBps, warm));
      // every room solve goes through here: players identical in every input are interchangeable, so a solve is made for
      // their cooldowns in one order and the setup's plans moved to fit (solved once for every arrangement); a solve with
      // exactly these inputs already made (this run, or saved in this browser from an earlier run) is reused; each room's
      // solves are counted and timed
      const memo = new Map();
      // Nylocas: a cooldown that's up before the shortest wave ends is the same as none (a surge comes after a spec on him)
      const minWave = wave && wave.dist && wave.dist.length ? Math.min(...wave.dist.map(([x]) => x)) : 0;
      const solveOf = async (kind, cd0_, tag, must = null, warm = null) => {
        const cd = kind === 'nylo' ? cd0_.map((c) => (c < 99999 && c <= minWave ? 0 : c)) : cd0_;
        const { cd: cdC, perm } = canonCd(cd, groups), mustC = must ? cdC.map((c, k) => (c < 99999 ? k : -1)).filter((k) => k >= 0) : null;
        // a warm start (Verzik): the other plan's setup in this solve's order of players
        const invP = []; perm.forEach((o, k) => { invP[o] = k; });
        const warmC = warm && kind === 'verzik' && !s.useChart ? relabelSetup('verzik', { cfgs: warm }, invP).cfgs : null;
        const key = JSON.stringify([kind, cdC, mustC, kind === 'verzik' ? vBps : null, warmC ? warmC.map((c) => [c.actions, c.startSpec, !!c.lightbearerOn, c.dawnThr ?? null, c.customSurgeTick ?? null]) : null]);
        const sw = perm.some((o, k) => o !== k), stt = solveStats[kind];
        let p = memo.get(key);
        if (p) { if (sw) stt.swapped++; else stt.again++; }
        else {
          p = (async () => {
            const full = fp ? JSON.stringify([fp, t, gp, inputsOf(kind), key]) : null;
            const hit = full ? await getSolve(full).catch(() => null) : null;
            if (hit) { stt.saved++; return hit; }
            const a = activeNow(), sv = await solveRaw(kind, cdC, tag, mustC, warmC);
            stt.n++; stt.ms += activeNow() - a;
            const keep = { kind: sv.kind, setups: sv.setups, med: sv.med, list: [] };   // (what the plans play; the solver's own list isn't kept)
            if (full && !me.stopped) putSolve(full, keep).catch(() => {});
            return keep;
          })();
          memo.set(key, p); if (sw) stt.swapped++;
          p.catch(() => memo.delete(key));
        }
        const sv = await p;
        return sw ? { ...sv, setups: sv.setups.map((x) => ({ ...x, setup: relabelSetup(kind, x.setup, perm) })) } : sv;
      };
      // ================================================================ exhaustive surge plans
      // Every surge plan (the rooms each player surges in - every dose used, in whichever rooms; a later surge once the
      // cooldown is up), each room solved
      // for exactly that plan (who surges in it, and the cooldowns they come in with - solved once per distinct case and
      // reused), the plans that can't win dropped by bounds, the rest played as whole raids and ranked.
      if (s.exhaustive) {
        const R = KINDS.length, VI = KINDS.indexOf('verzik'), n1 = ef.raids, seed = `full${Date.now()}`;
        const pool = new FullRaidPool({ team: t, surgeCd: cd0, doses: doses0 }); me.pools.push(pool);
        const idx = KINDS.map((_, r) => r);
        // every dose used, in whichever rooms (a later surge waits for the cooldown) - the plans are ranked on the whole raid
        // (a player your P1 chart needs a Verzik surge from: any plan with it - a dose can be held back for it)
        const optsOf = (d, k) => (d < 1 ? [[]] : subsets(idx).filter((x) => (needs && needs[k] != null ? x.includes(VI) && x.length <= d : x.length === Math.min(d, idx.length))).map((x) => x.sort((p, q) => p - q)));
        // players who are the same in every input (gear, cooldown, doses, every room's settings for them, your P1 chart's
        // row) are interchangeable: a plan and the same plan with their surges traded play the same - only one is solved
        // (the earlier player's choice no later in the list than the later one's)
        const twin = sigs.map((x, k) => sigs.lastIndexOf(x, k - 1));   // the nearest earlier identical player (-1: none)
        let plans = [[]], oi = [[]];
        for (let k = 0; k < t; k++) {
          const os = optsOf(doses0[k], k), np = [], ni = [];
          plans.forEach((pl, j) => os.forEach((o, i) => { if (twin[k] >= 0 && i < oi[j][twin[k]]) return; np.push([...pl, o]); ni.push([...oi[j], i]); }));
          plans = np; oi = ni;
        }
        const twins = twin.filter((x) => x >= 0).length;
        // solves, cached by room and the cooldowns in (99999: no surge in this room; else the ticks until it's up)
        // cooldowns in steps of CD_STEP ticks (a room is solved once per case; the whole raids carry the real cooldowns)
        const solved = new Map(), q10 = (c) => (c >= 99999 ? 99999 : Math.round(c / CD_STEP) * CD_STEP);
        let nSolves = 0;
        const solveRoom = async (r, cdIn, warm = null) => {
          const kind = KINDS[r];
          // a cooldown that's still running when the room's slowest raid without surges is over can't be drunk there: the
          // same as no surge in this room (exact - solved once, as the no-surge case)
          let cd = cdIn;
          if (kind !== 'verzik' && cd.some((c) => c < 99999)) { const none = await solveRoom(r, cd.map(() => 99999)); cd = cd.map((c) => (c < 99999 && c >= none.slow ? 99999 : c)); }
          const key = `${kind}|${cd.map(q10).join(',')}${warm ? `|warm ${JSON.stringify(warm.map((c) => [c.actions, c.startSpec, !!c.lightbearerOn]))}` : ''}`;
          if (!solved.has(key)) {
            nSolves++; const who = cd.map((c, k) => (c < 99999 ? `P${k + 1}${c > 0 ? ` (cooldown ${fsec(c)})` : ''}` : null)).filter(Boolean);
            const sv = await solveOf(kind, cd.map(q10), `#${nSolves}: ${who.length ? `${who.join(', ')} surge` : 'no surges'}`, cd.map((c, k) => (c < 99999 ? k : -1)).filter((k) => k >= 0), warm); stop();
            if (!sv.setups.length) throw new Error(`${KIND_NAME[kind]}: the solver found no setup that finishes.`);
            // literally this plan: exactly these players surge in this room - the solver's best setup that has all of
            // them surging, else its best with their surges put in (and nobody else's)
            const set = cd.map((c, k) => (c < 99999 ? k : -1)).filter((k) => k >= 0);
            const has = sv.setups.find((x) => set.every((k) => surgersOf(kind, x.setup).includes(k)));
            const setup = forceSurgers(kind, (has || sv.setups[0]).setup, set);
            // its times on their own (cooldowns as given) and the players' surge ticks in it (median)
            const [ev] = await pool.runRooms([{ kind, setup, cd: cd.map((c) => Math.min(c, 99999)) }], 0, n1, seed);
            const at = cd.map(() => []);
            if (kind !== 'verzik') for (let i = 0; i < 100; i++) {
              const rr = kind === 'nylo' ? runNylo(setup.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), t, new Rng(`at#${i}`), setup.opts)
                : kind === 'sote' ? runSote(setup.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), t, new Rng(`at#${i}`), null, { ...setup.opts, entry: setup.entry })
                  : runXarpus(setup.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), t, new Rng(`at#${i}`), null, setup.opts);
              if (rr && rr.players) rr.players.forEach((p, k) => { if (p.surgeAt != null) at[k].push(p.surgeAt); });
            }
            const md = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
            const ok = ev.ends.filter((x) => x < 99999);
            solved.set(key, { sv, setup, dist: distOf(ev.ends), med: md(ok) ?? 0, slow: ok.length ? Math.max(...ok) : 99999, at: at.map(md), surgers: surgersOf(kind, setup) });
          }
          return solved.get(key);
        };
        /** A plan through its rooms in order: each room's cooldowns in (from the earlier rooms' surge ticks and times),
         *  solved; verzikCd: override Verzik's cooldowns (bounds). -> [room results] */
        const walk = async (pl, verzikCd = null, upto = R, warm = null) => {
          const last = cd0.map(() => null), out = [];   // last: {r, at} of each player's last surge
          for (let r = 0; r < R; r++) {
            const cd = pl.map((rooms, k) => {
              if (!rooms.includes(r)) return 99999;
              let c = Math.max(0, cd0[k] - out.reduce((a, x) => a + x.med, 0));
              if (last[k]) { let left = last[k].at + SURGE_CD - out[last[k].r].med; for (let q = last[k].r + 1; q < r; q++) left -= out[q].med; c = Math.max(0, left); }
              return c;
            });
            if (r === upto) return { out, cd };                         // stop here: the rooms before, and this room's cooldowns in
            // Verzik in total mode aims at what's left of the total after the rooms before (the first plan's)
            if (r === VI && !vBps.length) vBps = bpOf('verzik') != null ? [bpOf('verzik')] : total.map((b) => b - out.reduce((a, x) => a + x.med, 0) * 0.6).filter((b) => b > 0);
            const res = await solveRoom(r, r === VI && verzikCd ? verzikCd(cd) : cd, r === VI ? warm : null);
            out.push(res);
            pl.forEach((rooms, k) => { if (rooms.includes(r) && res.at[k] != null) last[k] = { r, at: res.at[k] }; });
          }
          return out;
        };
        const scoreOf = (rs) => planScore(rs.map((x) => x.dist), how), plans0 = plans.length;
        if (needs && VI > 0) {
          say('Exhaustive')(`${plans.length} surge plans - the rooms before Verzik solved exactly, checking each against your P1 chart's surges`);
          const ok = [];
          for (const pl of plans) { stop(); const { cd } = await walk(pl, null, VI); if (chartOk(pl, cd)) ok.push(pl); else chartSkipped++; }
          plans = ok;
        }
        let alive = plans, dropped = [], boundOf = null, canBeat = null, shareM = false;
        // ---- drop the plans that can't win, before their own Verzik solves. Verzik is solved once with every planned surge
        // ready; each plan's rooms before Verzik are solved exactly, and that Verzik setup is played with the plan's real
        // cooldowns (its surges after the cooldown at a custom timing): a lower bound on what the plan gets (its own solve
        // can only do better). Its upper bound: the same with every surge ready. A plan is dropped when its upper bound
        // can't reach the best lower bound (beyond the noise) - or when its lower bound is obviously worse (5 points of the
        // goal share, or 10 ticks of the median, below the best): a Verzik solve of its own won't make that up.
        if (VI >= 0 && plans.length > 1) {
          say('Exhaustive')(`${plans.length} surge plans - the rooms before Verzik solved exactly, then each plan's bounds`);
          const ready = await solveRoom(VI, cd0.map((_, k) => (plans.some((pl) => pl[k].includes(VI)) ? 0 : 99999)));
          const B = [];
          for (const pl of plans) {
            stop();
            const { out, cd } = await walk(pl, null, VI);
            const [ev] = await pool.runRooms([{ kind: 'verzik', setup: ready.setup, cd }], 0, n1, seed);
            const later = KINDS.slice(VI + 1).length ? (await walk(pl)).slice(VI + 1) : [];   // (no rooms after Verzik today)
            B.push({ pl, lo: planScore([...out, { dist: distOf(ev.ends) }, ...later].map((x) => x.dist), how), hi: planScore([...out, ready, ...later].map((x) => x.dist), how) });
          }
          const shareMode = B[0].hi.length > 2 || how.rankBy === 'success';   // (scores end with -median, -mean)
          const best = B.reduce((m, x) => (fullBetter(x.lo, m.lo) ? x : m), B[0]).lo;
          const noise = (p) => 2 * Math.sqrt(Math.max(p * (1 - p), 0.01) / n1);
          const keep = (x) => (shareMode
            ? x.hi[0] >= best[0] - noise(best[0]) && x.lo[0] >= best[0] - Math.max(0.05, noise(best[0]))
            : -x.hi[0] <= -best[0] + 3 && -x.lo[0] <= -best[0] + 10);
          alive = B.filter(keep).map((x) => x.pl); boundOf = new Map(B.map((x) => [x.pl, x])); shareM = shareMode; canBeat = (x, best) => (shareMode ? x.hi[0] >= best[0] - noise(best[0]) : -x.hi[0] <= -best[0] + 3);
          dropped = B.filter((x) => !keep(x)).map((x) => ({ plan: x.pl, lo: x.lo, hi: x.hi, share: shareMode }));
          if (!alive.length) { alive = plans; dropped = []; }   // (no bound to go on - e.g. no plan finishes with the ready setup: solve them all)
          say('Exhaustive')(`${alive.length} of ${plans.length} plans can still win - solving each one's Verzik exactly`);
        }
        // ---- every plan left, each room solved for it exactly
        // Branch and bound: the plans in order of their best case; once the best plan solved so far is beyond a
        // plan's best case (by the same noise margin as the bounds), that plan isn't solved - it can't win.
        // Warm start (off: WARM_V - tested no faster at Quick, and a worse winner; without your P1 chart): each plan's Verzik is solved from the best plan so far's setup - its
        // P1 chart edited for this plan's cooldowns (no P1 search); the best few are then solved from scratch to check.
        const exact = [], bnb = !!boundOf, warmOn = WARM_V && !s.useChart && VI >= 0;
        const better = (x, y) => (fullBetter(x.score, y.score) ? -1 : fullBetter(y.score, x.score) ? 1 : 0);
        const order = bnb ? alive.slice().sort((x, y) => (fullBetter(boundOf.get(x).hi, boundOf.get(y).hi) ? -1 : fullBetter(boundOf.get(y).hi, boundOf.get(x).hi) ? 1 : 0)) : alive;
        let lead = null, cut = 0;
        for (const [i, pl] of order.entries()) {
          stop();
          if (bnb && lead && !canBeat(boundOf.get(pl), lead.score)) { cut++; dropped.push({ plan: pl, lo: boundOf.get(pl).lo, hi: boundOf.get(pl).hi, share: shareM, bnb: true }); continue; }
          say('Exhaustive')(`plan ${i + 1} of ${order.length}${cut ? ` (${cut} can't win - not solved)` : ''}`);
          const warm = warmOn && lead ? lead.rs[VI].setup.cfgs : null;
          const rs = await walk(pl, null, R, warm), x = { pl, rs, score: scoreOf(rs), warm: !!warm };
          exact.push(x); if (!lead || better(x, lead) < 0) lead = x;
        }
        // warm starts checked: the best few solved from scratch (their Verzik), and kept if better
        let rechecked = 0;
        if (warmOn) {
          exact.sort(better);
          for (const [i, x] of exact.slice(0, WARM_CHECK).entries()) {
            if (!x.warm) continue; stop();
            say('Exhaustive')(`checking the warm starts: plan ${i + 1} of ${Math.min(WARM_CHECK, exact.length)} solved from scratch`);
            const rs = await walk(x.pl), sc = scoreOf(rs); rechecked++;
            if (fullBetter(sc, x.score)) Object.assign(x, { rs, score: sc, warm: false }); else x.checked = true;
          }
        }
        exact.sort(better);
        // ---- as whole raids (the cooldowns carried for real); the same room setups twice are one plan
        const seenK = new Set(), top = [];
        for (const x of exact) { const k = JSON.stringify(x.rs.map((r) => r.setup)); if (seenK.has(k)) continue; seenK.add(k); top.push(x); }
        say('Full raids')(`${top.length} plans as whole raids: ${ef.raids.toLocaleString()} each (${nSolves} room solves)`);
        const setupOf = (x) => Object.fromEntries(KINDS.map((kind, r) => [kind, kind === 'verzik' ? { cfgs: x.rs[r].setup.cfgs } : x.rs[r].setup]));
        let res;
        try { res = await pool.run(top.map(setupOf), 0, ef.raids, seed); } finally { pool.stop(); }
        const sameRes = new Set();
        const ranked = top.map((x, i) => ({ plan: x.pl, vars: x.rs.map((r, j) => ({ kind: KINDS[j], setup: r.setup, surgers: r.surgers, from: r.sv, i: 0, dropped: [] })), setup: setupOf(x), ...res[i], score: fullScore(res[i], how) }))
          .sort((x, y) => (fullBetter(x.score, y.score) ? -1 : fullBetter(y.score, x.score) ? 1 : 0))
          // plans that play out the same on every raid (e.g. a planned surge the room's solver didn't take) are one
          .filter((r) => { const k = r.totals.join(','); if (sameRes.has(k)) return false; sameRes.add(k); return true; });
        minFirst(ranked);
        results = { solveStats, chartNeeds: needs, chartSkipped, ranked, vBps, how, t, kinds: KINDS, wave, exhaustive: { plans: plans0, twins, alive: alive.length, solves: nSolves, dropped, cut, warm: warmOn, rechecked }, ctx: { team: t, surgeCd: cd0, doses: doses0 }, seed, names: gp.map((p, k) => p.name || `Player ${k + 1}`), raids: ef.raids, plans: plans.length, nVariants: nSolves }; charted = 0; autoReports(0);
        status.textContent = `Done in ${Math.round((activeNow() - t1) / 1000)}s: ${plans0} surge plans, ${alive.length} solved exactly. ${statsTxt(solveStats)}`; refreshSaved();
        return;
      }
      // ---- 1. every room solved twice, in order: surges allowed (everyone with a dose) and no surges; each room's
      // cooldowns in: what's left after the rooms before (their medians)
      const A = [], B = [], cdOf = {}, med = [];
      for (const [r, kind] of KINDS.entries()) {
        const before = med.slice(0, r).reduce((a, x) => a + x, 0);
        cdOf[kind] = cd0.map((c) => Math.max(0, c - before));
        // Verzik in total mode aims at what's left of the total after the rooms before
        if (kind === 'verzik') vBps = bpOf('verzik') != null ? [bpOf('verzik')] : total.map((b) => b - before * 0.6).filter((b) => b > 0);
        A[r] = await solveOf(kind, blockIfNone(cdOf[kind], doses0), '(surges allowed)'); stop();
        B[r] = await solveOf(kind, NONE, '(no surges)'); stop();
        med[r] = A[r].med || B[r].med || 0;
      }
      const solves = [...A, ...B];
      if (!solves.every((x) => x.setups.length)) throw new Error('A room solver found no setup that finishes.');
      // ---- 2. variants: each setup with every subset of its surgers (nobody re-solved), each room's time on its own
      const variants = [], vkey = new Set();
      const withDose = cd0.map((_, k) => (doses0[k] > 0 ? k : -1)).filter((k) => k >= 0);
      const addVariants = (sv, subsetsToo = true) => sv.setups.forEach((x) => {
        // Verzik: each setup with every combination of surgers among those with a dose (a surge its solve didn't plan
        // put in - forced: once the cooldown is up and it won't waste spec), so a plan can surge anyone there or not
        if (sv.kind === 'verzik') for (const set of subsets(withDose)) {
          const sur0 = surgersOf('verzik', x.setup);
          if (set.length === sur0.length && set.every((k) => sur0.includes(k))) continue;
          if (set.every((k) => sur0.includes(k))) continue;                   // a subset of its own: below
          const setup = forceSurgers('verzik', x.setup, set), k = `verzik|${JSON.stringify(setup)}`;
          if (!vkey.has(k)) { vkey.add(k); variants.push({ kind: 'verzik', setup, surgers: [...set].sort((a, b) => a - b), from: sv, i: x.i, dropped: [] }); }
        }
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
      // ---- 3. surge plans: the rooms each player surges in, within their doses; each scored from its rooms' times
      // a player can surge in several rooms (doses allowing): a later room's surge waits for the cooldown from their last
      // one - taken as soon as it's up (Verzik: a custom timing, so after P1). Their cooldown into that room comes from
      // the earlier room's best setup (its surge tick, median).
      const medAt = (play) => { const at = cd0.map(() => []); for (let i = 0; i < 100; i++) { const r = play(i); if (r && r.players) r.players.forEach((p, k) => { if (p.surgeAt != null) at[k].push(p.surgeAt); }); }
        return at.map((a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 30)); };
      const atOf = KINDS.map((kind, r) => {
        if (r === LAST) return null;
        const x = A[r].setups[0].setup, cd = cdOf[kind];
        if (kind === 'nylo') return medAt((i) => runNylo(x.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), t, new Rng(`at#${i}`), x.opts));
        if (kind === 'sote') return medAt((i) => runSote(x.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), t, new Rng(`at#${i}`), null, { ...x.opts, entry: x.entry }));
        return medAt((i) => runXarpus(x.players.map((p, k) => ({ ...p, surgeCd: cd[k] })), t, new Rng(`at#${i}`), null, x.opts));
      });
      /** Cooldown into room r for a player whose last surge was in room `last`. */
      const lateCdK = (r, last, k) => Math.max(0, atOf[last][k] + SURGE_CD - med.slice(last, r).reduce((a, x) => a + x, 0));
      const lateDist = new Map();                                   // `${kind}|${variant}|${cooldowns}` -> times with those players' cooldown carried in
      // each player's doses all used, in whichever rooms make the whole raid fastest (a later surge waits for the cooldown)
      const VI = KINDS.indexOf('verzik');
      // every dose used, in whichever rooms make the whole raid fastest (a later surge waits for the cooldown)
      const roomSets = (d, k) => subsets(KINDS.map((_, r) => r)).filter((x) => (needs && needs[k] != null ? x.includes(VI) && x.length <= d : x.length === Math.min(d, KINDS.length))).map((x) => x.sort((p, q) => p - q));   // (your P1 chart needs their Verzik surge: any plan with it)
      const planAll = () => { let ps = [[]]; for (let k = 0; k < t; k++) ps = ps.flatMap((pl) => roomSets(doses0[k], k).map((r) => [...pl, r])); return ps; };
      // your P1 chart's surges: plans whose earlier-room surge leaves it on cooldown when the chart needs it are out
      const cdIntoV = (pl) => pl.map((x, k) => { const prev = x.filter((q) => q < VI); return prev.length ? lateCdK(VI, Math.max(...prev), k) : Math.max(0, cd0[k] - med.slice(0, VI).reduce((a, y) => a + y, 0)); });
      const planList = () => (needs && VI > 0 ? planAll().filter((pl) => chartOk(pl, cdIntoV(pl))) : planAll());
      if (needs && VI > 0) chartSkipped = planAll().length - planList().length;
      const setsOf = (pl) => KINDS.map((_, r) => pl.map((x, k) => (x.includes(r) ? k : -1)).filter((k) => k >= 0));
      /** Room r's carried-in cooldowns for a plan's players who surged in an earlier room ({k: ticks}), or null. */
      const lateOf = (pl, r) => { const o = {}; pl.forEach((x, k) => { if (!x.includes(r)) return; const prev = x.filter((q) => q < r); if (prev.length) o[k] = lateCdK(r, Math.max(...prev), k); }); return Object.keys(o).length ? o : null; };
      // a plan's surgers in a room; when no setup has exactly them (the room's solver found some of those surges not worth
      // it and dropped them), the setups with the most of them - those players keep the dose (no wasted surge)
      const byRoomSet = (kind, set) => {
        let vs = variants.filter((v) => v.kind === kind && v.surgers.join() === set.join());
        if (!vs.length) { const sub = variants.filter((v) => v.kind === kind && v.surgers.every((k) => set.includes(k))), most = Math.max(-1, ...sub.map((v) => v.surgers.length)); vs = sub.filter((v) => v.surgers.length === most); }
        return vs.sort((a, b2) => a.q - b2.q).slice(0, 2);
      };
      const distFor = (v, late) => (late ? lateDist.get(`${v.kind}|${variants.indexOf(v)}|${JSON.stringify(late)}`) : v.dist);
      /** Times for the later-room surge variants the plans need (played with those players' cooldown carried in). */
      const evalLate = async () => {
        const need = new Map();
        for (const pl of planList()) {
          const sets = setsOf(pl);
          for (let r = 1; r < R; r++) { const late = lateOf(pl, r); if (!late) continue; for (const v of byRoomSet(KINDS[r], sets[r])) { const k = `${v.kind}|${variants.indexOf(v)}|${JSON.stringify(late)}`; if (!lateDist.has(k) && !need.has(k)) need.set(k, { v, late }); } }
        }
        if (!need.size) return;
        const list = [...need.entries()];
        say('Rooms')(`second surges (after the cooldown from an earlier room): ${list.length} on ${n1.toLocaleString()} raids each`);
        const res = await pool.runRooms(list.map(([, x]) => ({ kind: x.v.kind, setup: x.v.setup, cd: cdOf[x.v.kind].map((c, k) => (x.late[k] != null ? x.late[k] : c)) })), 0, n1, seed);
        list.forEach(([k], j) => lateDist.set(k, distOf(res[j].ends)));
      };
      const planScores = () => {
        const out = [], cache = new Map();
        for (const pl of planList()) {
          const sets = setsOf(pl), lates = KINDS.map((_, r) => (r ? lateOf(pl, r) : null));
          const cands = KINDS.map((kind, r) => byRoomSet(kind, sets[r]));
          if (cands.some((c) => !c.length)) continue;
          // every room's candidates in turn; the rooms but the last added together (cached by the choices so far)
          const walk = (r, vars, ds, key, sum) => {
            for (const c of cands[r]) {
              const d = distFor(c, lates[r]); if (!d) continue;
              if (r === LAST) { out.push({ plan: pl, vars: [...vars, c], score: planScore([...ds, d], how, sum) }); continue; }
              const k2 = `${key}|${variants.indexOf(c)}:${JSON.stringify(lates[r])}`;
              if (!cache.has(k2)) cache.set(k2, sum ? convolve(sum, d) : d);
              walk(r + 1, [...vars, c], [...ds, d], k2, cache.get(k2));
            }
          };
          walk(0, [], [], '', null);
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
          const fromA = A[r].setups.some((x) => surgersOf(kind, x.setup).join() === set.join());
          if (!set.length || fromA) continue;
          const cd = cdOf[kind].map((c, k) => (set.includes(k) ? c : 99999)), tag = `(only ${set.map((k) => `P${k + 1}`).join(', ')} surge)`;
          const sv = await solveOf(kind, cd, tag);
          const n0 = variants.length; addVariants(sv, false); await evalVariants(variants.slice(n0));
        }
        await evalLate(); scored = planScores();
      }
      stop();
      // ---- 5. the best plans as whole raids, the surge cooldown carried for real
      const seen = new Set(), top = [];
      for (const x of scored) { const k = x.vars.map((v) => variants.indexOf(v)).join(); if (seen.has(k)) continue; seen.add(k); top.push(x); if (top.length >= ef.full) break; }
      say('Full raids')(`the best ${top.length} surge plans as whole raids: ${ef.raids.toLocaleString()} each`);
      const setupOf = (x) => Object.fromEntries(KINDS.map((kind, r) => [kind, kind === 'verzik' ? { cfgs: x.vars[r].setup.cfgs } : x.vars[r].setup]));
      let res;
      try { res = await pool.run(top.map(setupOf), 0, ef.raids, seed); } finally { pool.stop(); }
      const kept = top.map((x, i) => ({ x, r: res[i] }));
      const seenSet = new Set();
      const ranked = kept.filter(({ x }) => { const k = JSON.stringify(setupOf(x)); if (seenSet.has(k)) return false; seenSet.add(k); return true; })
        .map(({ x, r }) => ({ ...x, setup: setupOf(x), ...r, score: fullScore(r, how) }))
        .sort((x, y) => (fullBetter(x.score, y.score) ? -1 : fullBetter(y.score, x.score) ? 1 : 0));
      minFirst(ranked);
      results = { solveStats, chartNeeds: needs, chartSkipped, ranked, vBps, how, t, kinds: KINDS, wave, ctx: { team: t, surgeCd: cd0, doses: doses0 }, seed, names: gp.map((p, k) => p.name || `Player ${k + 1}`), raids: ef.raids, plans: scored.length, nVariants: variants.length }; charted = 0; autoReports(0);
      status.textContent = `Done in ${Math.round((activeNow() - t1) / 1000)}s. ${statsTxt(solveStats)}`; refreshSaved();
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
    const v = results.ranked[ci].vars[j], sv = v.from, first = [sv.list[v.i], ...sv.list.filter((_, k) => k !== v.i)], kind = kindsR()[j];
    const bp = results.how.rooms[j] != null ? [results.how.rooms[j]] : [];
    if (kind === 'nylo') rooms.nylo.fullRaidShow(first, []);
    else if (kind === 'sote') rooms.sote.fullRaidShow(first, bp);
    else if (kind === 'xarpus') rooms.xarpus.fullRaidShow(first, bp);
    else rooms.verzik.fullRaidShow({ ...sv.res, top: first }, results.vBps || []);
    goTo(kind);
  }

  /** Who surges in each room of a combination (planned; Verzik: a P on the chart or a custom timing). */
  const surgesOf = (r) => {
    const nm = (k) => esc(results.names[k] || `Player ${k + 1}`), su = r.setup;
    const list = kindsR().map((kind) => surgersOf(kind, su[kind]));
    return namesR().map((x, j) => `${x}: ${list[j].map((k) => `${nm(k)}${list.slice(0, j).some((l) => l.includes(k)) ? ' (after cooldown)' : ''}`).join(', ') || 'nobody'}`).join('<br>');
  };
  function showResults() {
    const out = host.querySelector('[data-out]'); if (!out) return;
    if (!results) { out.innerHTML = ''; return; }
    if (!results.ranked.length) { out.innerHTML = '<div class="card"><p class="err" style="margin:0">No surge plan could be played: the room solvers\' setups don\'t fit any plan (doses, the chart\'s surges). Try other doses or untick Use my P1 chart.</p></div>'; return; }
    const { ranked, how, raids } = results, total = [...how.total].sort((a, b) => a - b);
    const okOf = (v) => v.filter((x) => x < 99999), med = (v) => { const a = okOf(v).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
    const ft = (x) => (x == null ? '-' : fsec(x));
    const roomsCol = how.mode === 'rooms' && how.rooms.some((b) => b != null), RNs = namesR(), R = RNs.length;
    const chartLine = results.chartNeeds ? `<div class="sub">Your P1 chart needs surges from ${results.chartNeeds.map((n, k) => (n == null ? null : `${esc(results.names[k] || `Player ${k + 1}`)} by ${fsec(n)} (tick ${n})`)).filter(Boolean).join(', ')}. ${results.chartSkipped ? `${results.chartSkipped.toLocaleString()} surge plan${results.chartSkipped === 1 ? '' : 's'} left out: an earlier-room surge would still be on cooldown then.` : 'No plan had to be left out for it.'}</div>` : '';
    out.innerHTML = `<div class="card"><div class="vz-report"><h3 style="margin-top:0">${results.t}-man Full raid: solver</h3>${chartLine}
      <div class="sub">${results.exhaustive ? `Exhaustive: all ${results.exhaustive.plans.toLocaleString()} surge plans (who surges in which room, within their doses; every dose used, in whichever rooms; a later surge waits for the cooldown${results.exhaustive.twins ? '; players identical in every input are interchangeable, so a plan with their surges traded is counted once' : ''}). Each room solved for exactly each plan - who surges in it and the cooldowns they come in with (${results.exhaustive.solves} room solves, each case solved once); plans that couldn't win dropped first (bounds: Verzik solved with every planned surge ready, played with each plan's real cooldowns) - ${results.exhaustive.alive.toLocaleString()} left;${results.exhaustive.cut ? ` ${results.exhaustive.cut.toLocaleString()} of those not solved (they couldn't beat the best plan solved);` : ''}${results.exhaustive.warm ? ` Verzik warm-started from the best plan so far, the best ${results.exhaustive.rechecked} also solved from scratch to check;` : ''} the different ones (${results.ranked.length}) each played as ${raids.toLocaleString()} whole raids (the same raids for each), the cooldowns carried for real. Breakpoint columns and Finished are of every attempt; times are of the raids that finished.` : `Each room solved with surges allowed and with none (and re-solved for the best plan's surgers); every surge plan - the rooms each player surges in, any combination within their doses (a later surge waits for the cooldown) - scored from the rooms' own times (${results.plans.toLocaleString()} plans, ${results.nVariants} room setups and surge choices); the best ${ranked.length} played as ${raids.toLocaleString()} whole raids each (the same raids for each), surge cooldowns and doses carried room to room. Every dose is used, in whichever rooms make the whole raid fastest (a later surge waits for the cooldown). Breakpoint columns and Finished are of every attempt (a raid that fails anywhere, or finishes slower, counts against them); Verzik success is the raids that got to P3 (P2 down in reds), of the raids that reached Verzik; times (median, top 25% / 10%, fastest) are of the raids that finished, however slow. Each room's button opens its procedure, decision tree and example raids in that room's Solver (* played here without some of that setup's surges - hover for whose).`}</div>${results.solveStats ? `<div class="muted small">${statsTxt(results.solveStats)}</div>` : ''}
      <div class="scroll"><table class="sortlist"><tr><th>#</th><th title="Median total of the raids that finished">Total</th><th title="Of the raids that finished">Top 25%</th><th title="Of the raids that finished">Top 10%</th><th>Fastest</th>${roomsCol ? `<th>Every room at its breakpoint (${how.rooms.map((b) => (b == null ? '-' : fsB(b))).join(' / ')})</th>${how.rooms.map((b, j) => (b == null ? '' : `<th>${RNs[j]} ${fsB(b)} or faster</th>`)).join('')}` : total.map((b) => `<th>${fsB(b)} or faster</th>`).join('')}<th title="Raids that finished every room, of every attempt">Finished</th>${kindsR().includes('verzik') ? '<th title="Raids that got to P3 (P2 down in reds), of the raids that reached Verzik">Verzik success</th>' : ''}${RNs.map((x) => `<th>${x}</th>`).join('')}<th title="Who has a surge planned in each room (doses permitting: a player out of doses doesn't surge)">Surges</th><th>Rooms</th></tr>
      ${ranked.slice(0, 10).map((r, ci) => { const v = okOf(r.totals).sort((a, b) => a - b), n = r.totals.length;
        return `<tr${ci === 0 ? ' style="font-weight:700"' : ''}><td>${ci + 1}</td><td>${ft(v[v.length >> 1])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.25) - 1)])}</td><td>${ft(v[Math.max(0, Math.floor(v.length * 0.1) - 1)])}</td><td>${ft(v[0])}</td>
          ${roomsCol ? `<td>${(r.score[0] * 100).toFixed(1)}%</td>${how.rooms.map((b, j) => (b == null ? '' : `<td>${(r.ends[j].filter((x) => x * 0.6 <= b + 1e-9).length / n * 100).toFixed(1)}%</td>`)).join('')}` : total.map((_, j) => `<td>${(r.score[j] * 100).toFixed(1)}%</td>`).join('')}
          <td${r.underMin ? ' style="color:var(--bad,#e66)" title="Under your minimum success rate"' : ''}>${(v.length / n * 100).toFixed(1)}%</td>${(() => { const vi = kindsR().indexOf('verzik'); if (vi < 0) return ''; const reached = vi ? r.ends[vi - 1].filter((x) => x < 99999).length : n; return `<td>${reached ? `${((r.p3 || []).reduce((a, x) => a + x, 0) / reached * 100).toFixed(1)}%` : '-'}</td>`; })()}${r.ends.map((e) => `<td>${ft(med(e))}</td>`).join('')}<td class="small" style="text-align:left;min-width:260px">${surgesOf(r)}</td>
          <td style="white-space:nowrap"><button class="${ci === charted ? '' : 'ghost '}sm" data-chart="${ci}" title="Show this combination below: each room's report and procedure, and the charts">${ci === charted ? 'Shown below' : 'Show'}</button></td></tr>`; }).join('')}
      </table></div>
      ${results.exhaustive && results.exhaustive.dropped.length ? (() => { const nm = (k) => esc(results.names[k] || `Player ${k + 1}`), RNs = namesR();
        const planText = (pl) => RNs.map((rn, r) => `${rn}: ${pl.map((x, k) => (x.includes(r) ? nm(k) : null)).filter(Boolean).join(', ') || 'nobody'}`).join('<br>');
        const val = (sc, share) => (share ? `${(sc[0] * 100).toFixed(1)}%` : fsec(-sc[0]));
        const all = results.exhaustive.dropped, shown = all.slice().sort((a, b) => (fullBetter(a.lo, b.lo) ? -1 : fullBetter(b.lo, a.lo) ? 1 : 0)).slice(0, 20);
        return `<details style="margin-top:8px"><summary class="small" style="cursor:pointer">${all.length} plans dropped before their own Verzik solve (couldn't win) - ${all.length > 20 ? 'the closest 20, and ' : ''}what each could get</summary>
          <div class="sub" style="margin-top:4px">Each with its rooms before Verzik solved exactly and Verzik's every-surge-ready setup played with its cooldowns (at least this) - up to Verzik with every surge ready (at most this); on ${how.mode === 'rooms' ? 'every room at its breakpoint' : how.rankBy === 'success' ? 'success rate' : how.total.length ? `${fsB([...how.total].sort((a, b) => a - b)[0])} or faster` : 'median total'}.</div>
          <div class="scroll"><table class="sortlist"><tr><th>Surges</th><th>At least</th><th>At most</th></tr>${shown.map((d) => `<tr><td class="small" style="text-align:left">${planText(d.plan)}</td><td>${val(d.lo, d.share)}</td><td>${val(d.hi, d.share)}</td></tr>`).join('')}</table></div></details>`; })() : ''}
      ${roomsHtml(charted)}
      ${chartsHtml(ranked[charted] || ranked[0], charted)}</div></div>`;
  }

  /** The shown combination, room by room: Show report (that room's standard report, from whole raids of this
   *  combination - the raids that got to the room) and Show procedure (its setup and decision tree; Verzik: the P1 chart). */
  function roomsHtml(ci) {
    const r = results.ranked[ci];
    return `<h3>Combination #${ci + 1}: each boss</h3><div class="sub">Show procedure: the room's setup and decision tree, as its own Solver shows them. Show report: that procedure through the room's Run report (${REPORT_RAIDS.toLocaleString()} raids). Both with the surge cooldown and doses each player comes into the room with. The full raid's charts are below.</div>
      ${namesR().map((rn, j) => `<div class="card" style="margin:8px 0;padding:8px 10px"><div class="row wrap" style="gap:8px;align-items:center"><b>${rn}</b>
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
    const r = results.ranked[ci];
    if (!r.entries) {
      const setup = r.setup.verzik ? { ...r.setup, verzik: { cfgs: r.setup.verzik.cfgs } } : r.setup;
      r.entries = reportPool().entries(setup, 0, ENTRY_RAIDS, `ent-${results.seed}`, (d) => { msg.textContent = `Playing whole raids for what each player comes into the room with... ${d.toLocaleString()} / ${ENTRY_RAIDS.toLocaleString()}`; })
        .catch((x) => { r.entries = null; throw x; });
    }
    const e = await r.entries; msg.textContent = '';
    return e;
  }
  const roomBps = (j) => (results.how.mode === 'rooms' ? (results.how.rooms[j] != null ? [results.how.rooms[j]] : []) : []);
  const entryLine = (e, j) => {
    if (!e) return '';
    const parts = results.names.map((n, k) => `${esc(n)}: ${e.doses[k]} dose${e.doses[k] === 1 ? '' : 's'}${e.cd[k] > 0 ? `, cooldown ${fsec(e.cd[k])} left` : ''}`);
    return `<div class="small muted" style="margin:4px 0">Coming into ${namesR()[j]} (${(e.share * 100).toFixed(0)}% of raids that got there): ${parts.join(' · ')}</div>`;
  };
  /** Room j of combination ci as it's played in the full raid: the first room with the cooldowns / doses you set; the
   *  rest with what most raids come in with (from whole raids). */
  async function roomEntry(ci, j, msg) {
    const r = results.ranked[ci], names = results.names, kind = kindsR()[j];
    const e = j === 0 ? null : commonEntry((await entriesOf(ci, msg))[j]);
    const cdK = (k) => (e ? e.cd[k] : Number(results.ctx.surgeCd[k]) || 0), doseK = (k) => (e ? e.doses[k] : Number(results.ctx.doses[k]) || 0);
    if (kind === 'nylo') return { e, players: r.setup.nylo.players.map((p, k) => ({ ...p, name: names[k], surgeCd: cdK(k), plan: { ...p.plan, surge: !!p.plan.surge && doseK(k) > 0 } })) };
    if (kind === 'sote') return { e, players: r.setup.sote.players.map((p, k) => ({ ...p, name: names[k], surgeCd: cdK(k), surge: !!p.surge && doseK(k) > 0 })) };
    if (kind === 'xarpus') return { e, players: r.setup.xarpus.players.map((p, k) => ({ ...p, name: names[k], surgeCd: e ? e.cd[k] : 0, surge: !!p.surge && (!e || e.doses[k] > 0) })) };
    return { e, cfgs: verzikCfgs(r.setup.verzik.cfgs, names.map((_, k) => cdK(k)), names.map((_, k) => doseK(k))).map((c, k) => ({ ...c, name: names[k] ?? c.name })) };
  }
  /** Show report: the room's standard report (as its Run report gives it), 20,000 raids of this procedure. */
  /** A status line under a boss (looked up each time: the results may have been redrawn since). */
  const sayTo = (ci, j) => ({ set textContent(x) { const m = host.querySelector(`[data-rmsg="${ci}|${j}"]`); if (m) m.textContent = x; } });
  /** Room j's report for combination ci (one run, cached as a promise: started by the solve finishing or by Show report). */
  function buildReport(ci, j) {
    const r = results.ranked[ci], res0 = results; r.repP ||= [];
    if (r.repP[j]) return r.repP[j];
    const msg = sayTo(ci, j);
    r.repP[j] = (async () => {
      const t = res0.t, label = `#${ci + 1}`, opts = { breakpoints: roomBps(j), labels: [label] }, N = REPORT_RAIDS, seed = `rep${Date.now()}`;
      const { e, players, cfgs } = await roomEntry(ci, j, msg);
      const prog = (d, n = N) => { if (results === res0) msg.textContent = `Running the report... ${Number(d).toLocaleString()} / ${Number(n).toLocaleString()} raids`; };
      let html;
      const kind = kindsR()[j];
      if (kind === 'nylo') {
        const n = 5000;
        html = await rooms.nylo.reportHtml({ players, opts: r.setup.nylo.opts }, { n, seed, bps: roomBps(j), prog: (d) => prog(d, n), title: `${t}-man Nylocas (combination ${label}): ${n.toLocaleString()} raids` });
      } else if (kind === 'sote') {
        const su = r.setup.sote, o = { entry: su.entry || 0, ...(su.opts || {}) };
        html = soteReportHtml([await reportPool().report({ room: 'sote', players, opts: o, team: t }, 0, N, seed, prog)], t, { ...opts, entries: [o.entry] });
      } else if (kind === 'xarpus') {
        html = xarpusReportHtml([await reportPool().report({ room: 'xarpus', players, opts: r.setup.xarpus.opts, team: t }, 0, N, seed, prog)], t, opts);
        (r.repRaids ||= [])[j] = { players, opts: r.setup.xarpus.opts, seed, n: N };
        html += '<div class="vz-report" style="margin-top:10px" data-xrepraids></div>';
      } else {
        if (!runVerzik) throw new Error('the report runner is not available here');
        html = verzReportHtml([await runVerzik(cfgs, t, N, Math.floor(Math.random() * 1e9), (f) => prog(Math.round(f * N)))], [label], t, N, opts);
      }
      if (results === res0) msg.textContent = 'Report ready.';
      return `${entryLine(e, j)}${html}`;
    })().catch((x) => { r.repP[j] = null; throw x; });
    return r.repP[j];
  }
  /** Start the shown combination's reports in the background, one boss after another. */
  function autoReports(ci) {
    const res0 = results;
    (async () => { for (const j of kindsR().keys()) { if (results !== res0) return; try { await buildReport(ci, j); } catch (x) { sayTo(ci, j).textContent = `Couldn't run the report: ${x.message}`; } } })();
  }
  async function showRoomReport(ci, j, b) {
    const box = () => host.querySelector(`[data-rout="rep|${ci}|${j}"]`);
    if (!box().hidden && box().innerHTML) { box().hidden = true; b.textContent = 'Show report'; return; }
    b.disabled = true;
    try {
      const html = await buildReport(ci, j), el = box();
      if (!el) return;
      el.innerHTML = html; el.hidden = false;
      const rr = results.ranked[ci].repRaids && results.ranked[ci].repRaids[j], xe = el.querySelector('[data-xrepraids]');
      if (rr && xe && rooms.xarpus.reportRaids) rooms.xarpus.reportRaids(xe, { run: { players: rr.players, opts: rr.opts }, names: results.names }, roomBps(j), { seed: rr.seed, n: rr.n });
      const bb = host.querySelector(`[data-rrep="${ci}|${j}"]`); if (bb) bb.textContent = 'Hide report';
      sayTo(ci, j).textContent = '';
    } catch (x) { sayTo(ci, j).textContent = `Couldn't run: ${x.message}`; } finally { b.disabled = false; }
  }
  async function showRoomProc(ci, j, b) {
    const box = host.querySelector(`[data-rout="proc|${ci}|${j}"]`), msg = host.querySelector(`[data-rmsg="${ci}|${j}"]`);
    if (!box.hidden && box.innerHTML) { box.hidden = true; b.textContent = 'Show procedure'; return; }
    b.disabled = true;
    try {
      const r = results.ranked[ci], t = results.t, names = results.names, say = (x) => { msg.textContent = x; };
      const { e, players, cfgs } = await roomEntry(ci, j, msg), kind = kindsR()[j];
      if (kind === 'nylo') {
        box.innerHTML = entryLine(e, j); const inner = document.createElement('div'); box.append(inner);
        const op = r.setup.nylo.opts || {};
        rooms.nylo.procedure(inner, { cfg: { players: players.map((p) => p.plan), backup: op.plans ? op.plans.backup : null, thr: r.setup.nylo.thr || null }, names, run: { players, opts: op } }, roomBps(j));
        msg.textContent = '';
      } else if (kind === 'sote') {
        box.hidden = false; box.innerHTML = '';
        const inner = document.createElement('div'); box.append(inner);
        await rooms.sote.fullProcedure(inner, { players, entry: r.setup.sote.entry || 0, opts: r.setup.sote.opts || {}, names, bps: roomBps(j), say });
        msg.textContent = '';
      } else if (kind === 'xarpus') {
        box.innerHTML = entryLine(e, j); const inner = document.createElement('div'); box.append(inner);
        rooms.xarpus.procedure(inner, { cfg: { ...r.setup.xarpus.opts, players }, names, run: { players, opts: r.setup.xarpus.opts } }, roomBps(j));
        msg.textContent = '';
      } else {
        const late = cfgs.map((c, k) => (c.customSurgeTick != null ? `${esc(names[k])} surges on tick ${c.customSurgeTick} (${fsec(c.customSurgeTick)}${e && e.cd[k] > 0 ? ', once the cooldown is up' : ''})` : null)).filter(Boolean);
          box.innerHTML = `${entryLine(e, j)}${late.length ? `<div class="small" style="margin:4px 0">Surges off the chart: ${late.join(' · ')}</div>` : ''}${verzSetupHtml(cfgs, names, t)}<div data-vtree style="margin-top:8px"></div>${verzRaidBar(`fr-${ci}-${Date.now()}`, cfgs, t, results.vBps || [])}`;
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
      ${namesR().map((rn, j) => `<h4>${rn}</h4><div class="scroll">${chartBox((rg) => cumulativeSvg(room(j), [rn], roomBp(j), rg).replace('% of successful runs finished by this time', '% of all attempts finished by this time'))}</div>`).join('')}</details></div>`;
  }

  if (typeof window !== 'undefined') { window.__fullRaidResults = () => results; window.__fullRaidSet = (x) => { results = x; charted = 0; autoReports(0); showResults(); }; }   // for tests
  return { refresh: render };
}
