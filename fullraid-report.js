// Full raid Report: your own procedure for each room (a set from that room's tab, or a custom one made here), played as
// whole raids - surge cooldowns and doses carried from room to room for real, so a surge in Nylocas or Sotetseg moves
// when it can be drunk again later. The results (times, breakpoints, each room's report, procedure and Show raid) are
// drawn by fullraid-ui.js like the Solver's.
import { FullRaidPool } from './fullraid-pool.js';
import { createNylo } from './nylo-ui.js';
import { createSote } from './sote-ui.js';
import { createXarpus } from './xarpus-ui.js';
import { createBuilder } from './builder-ui.js';
import { parse_chart } from './engine/sim.js';
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS, withGear } from './engine/gearstore.js';
import { describe, readValues } from './engine/chartform.js';
import { parseBreakpoints } from './engine/optimize.js';
import { parseWaveTimes, fmtWave } from './engine/nylo.js';
import { ALL_ROOMS, surgersOf, fullScore } from './engine/fullraid.js';
import { activeNow, breath } from './engine/pause.js';

const KEY = 'verzikSim.fullraidReport.v1';     // {team: {on, src, gearSet, cd, doses, wave, raids, seed, bps}}
const CUSTOM = { nylo: 'verzikSim.frCustom.nylo.v1', sote: 'verzikSim.frCustom.sote.v1', xarpus: 'verzikSim.frCustom.xarpus.v1', verzik: 'verzikSim.frCustom.verzik.v1' };
const NAME = { nylo: 'Nylocas', sote: 'Sotetseg', xarpus: 'Xarpus', verzik: 'Verzik' };
const SETS = ['A', 'B', 'C'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage off: kept for this page */ } };
const fsec = (t) => { const x = t * 0.6, m = Math.floor(x / 60); return `${m}:${(x - m * 60).toFixed(1).padStart(4, '0')}`; };
/** m:ss(.s) -> ticks (blank: 0). */
const toTicks = (v) => { const x = String(v ?? '').trim(); if (!x) return 0; const m = x.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/); if (!m) throw new Error(`'${x}' isn't a time (m:ss)`); return Math.ceil(((m[1] ? Number(m[1]) * 60 : 0) + Number(m[2])) / 0.6 - 1e-9); };

export function createFullRaidReport(el, { getTeam, rooms, getWorkbook, setLabel = () => '', onResults }) {
  let state = load(), job = null;
  const team = () => Number(getTeam()) || 4;
  const st = () => {
    const t = team(); state[t] ||= {}; const s = state[t];
    s.on ||= { nylo: false, sote: true, xarpus: true, verzik: true };
    s.src ||= {}; for (const k of ALL_ROOMS) s.src[k] ||= 'A';
    s.gearSet ||= 'A'; s.cd ||= []; s.doses ||= []; s.raids ||= 5000; s.seed ??= ''; s.bps ??= '';
    for (let k = 0; k < t; k++) { s.cd[k] ??= ''; s.doses[k] ??= 1; }
    s.cd.length = t; s.doses.length = t;
    s.wave ||= [{ time: '', freq: '' }];
    return s;
  };
  el.innerHTML = `<style>[data-embed] [data-subtabs], [data-embed] section[data-pane] { display: none !important; }</style>
    <div class="card" data-rpform></div>
    ${ALL_ROOMS.map((k) => `<div class="card" data-rpcustwrap="${k}" hidden><div class="row wrap" style="gap:8px;align-items:center"><b>Custom ${NAME[k]} procedure</b><span class="muted small">Copy into the set shown below:</span><span data-rpcopy="${k}"></span></div>
      ${k === 'verzik' ? '<div class="settabs" data-rpvtabs></div>' : ''}<div data-rpcust="${k}" style="margin-top:6px"></div></div>`).join('')}
    <div data-out></div>`;
  const form = el.querySelector('[data-rpform]');
  // the custom editors: each room's own settings, saved apart from its tab (made when first needed)
  const custom = {};
  const customOf = (k) => {
    if (custom[k]) return custom[k];
    const box = el.querySelector(`[data-rpcust="${k}"]`);
    if (k === 'verzik') {
      const b = createBuilder(box, { store: CUSTOM.verzik, libcur: 'verzikSim.frCustom.libcur.v1', tabsEl: el.querySelector('[data-rpvtabs]') });
      custom[k] = { builder: b, refresh: () => b.show(team()) };
    } else {
      const make = { nylo: createNylo, sote: createSote, xarpus: createXarpus }[k];
      const inst = make(box, { getTeam: team, store: CUSTOM[k] }); box.dataset.embed = '1';
      custom[k] = { api: inst.api, refresh: inst.refresh };
    }
    return custom[k];
  };
  const gp = (s) => { const set = gearSet(loadGear(), team(), s.gearSet); return set ? playersOf(set, team()) : null; };
  const name = (s, k) => esc((gp(s) || [])[k] ? gp(s)[k].name || `Player ${k + 1}` : `Player ${k + 1}`);
  const picked = (s) => { const ks = ALL_ROOMS.filter((k) => s.on[k]), ix = ks.map((k) => ALL_ROOMS.indexOf(k)); return { ks, ok: ks.length > 0 && ix.every((x, i) => !i || x === ix[i - 1] + 1) }; };
  const srcOpts = (k, v) => [...SETS.map((b) => [b, k === 'verzik' ? `Verz ${setLabel(b) || `Set ${b}`}` : `${NAME[k]} tab: Set ${b}`]), ['custom', 'Custom (made below)']]
    .map(([x, l]) => `<option value="${x}" ${x === v ? 'selected' : ''}>${esc(l)}</option>`).join('');

  function render() {
    const s = st(), t = team(), pk = picked(s), g = loadGear(), w = parseWaveTimes(s.wave);
    form.innerHTML = `<h3 style="margin-top:0">Full raid report <span class="muted small">(${t}-man: ${pk.ks.map((k) => NAME[k]).join(' → ') || 'no rooms ticked'})</span></h3>
      <p class="muted small">Your own procedure for each room - a set from that room's tab, or a custom one made here - played as whole raids: surge cooldowns and doses carry from room to room (a surge in Nylocas or Sotetseg moves when it's up again later). Each room's procedure keeps its own gear set.</p>
      <div class="scroll"><table class="bt"><tr><th>Room</th><th>Procedure</th></tr>
        ${ALL_ROOMS.map((k) => `<tr><td class="rl"><label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-rpon="${k}" ${s.on[k] ? 'checked' : ''}>${NAME[k]}</label></td>
          <td><select data-rpsrc="${k}" ${s.on[k] ? '' : 'disabled'}>${srcOpts(k, s.src[k])}</select></td></tr>`).join('')}</table></div>
      <div class="small ${pk.ok ? 'muted' : 'warn'}">${pk.ok ? 'Any run of rooms in raid order.' : 'Tick rooms in a row - no gaps.'}</div>
      <div class="row wrap" style="gap:14px;align-items:flex-start;margin-top:10px">
        <div><label>Names from<select data-rpf="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${x === s.gearSet ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}</option>`).join('')}</select></label>
          <div class="scroll" style="margin-top:6px"><table class="bt"><tr><th></th><th title="Time left on their surge cooldown at the start of the first room (m:ss). Blank: ready">Surge cooldown</th><th>Surge doses</th></tr>
          ${Array.from({ length: t }, (_, k) => `<tr><td class="rl">${name(s, k)}</td><td><input data-rpcd="${k}" value="${esc(s.cd[k])}" placeholder="ready" style="width:80px"></td>
            <td><select data-rpdose="${k}">${[0, 1, 2, 3, 4].map((n) => `<option ${n === Number(s.doses[k]) ? 'selected' : ''}>${n}</option>`).join('')}</select></td></tr>`).join('')}</table></div></div>
        ${s.on.nylo ? `<div><div class="small" style="font-weight:600" title="Used for a Nylocas set without wave times of its own">Nylocas wave times</div><table class="bt"><tr><th>Wave time</th><th>Frequency</th></tr>
          ${s.wave.map((r, j) => `<tr><td><input data-rpw="${j}|time" value="${esc(r.time)}" placeholder="m:ss.s" style="width:80px"></td><td><input data-rpw="${j}|freq" value="${esc(r.freq)}" placeholder="%" style="width:60px"> %</td></tr>`).join('')}</table>
          <button class="ghost sm" data-rpwadd style="margin-top:4px">+ Add wave time</button>
          <div class="small ${w.error && s.wave.some((r) => r.time) ? 'warn' : 'muted'}">${w.error ? (s.wave.some((r) => r.time) ? esc(w.error) : 'A set with its own wave times uses those.') : `Average ${fmtWave(Math.round(w.mean))}.`}</div></div>` : ''}
      </div>
      <div class="row wrap" style="gap:14px;align-items:end;margin-top:10px">
        <label>Raids<input type="number" min="200" step="1000" data-rpf="raids" value="${esc(s.raids)}" style="width:90px"></label>
        <label>Seed (optional)<input data-rpf="seed" value="${esc(s.seed)}" placeholder="random" style="width:100px"></label>
        <label title="Total times (m:ss): the share of attempts and of successes under each">Breakpoints (optional)<input data-rpf="bps" value="${esc(s.bps)}" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-rpact="run">Run report</button><button data-rpact="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page): the pieces already running finish, then it waits.">Pause</button>
      </div>
      <div data-rpstatus class="muted" style="margin-top:8px"></div><div data-rperr class="err"></div>`;
    for (const k of ALL_ROOMS) {
      const wrap = el.querySelector(`[data-rpcustwrap="${k}"]`), on = s.on[k] && s.src[k] === 'custom';
      wrap.hidden = !on;
      if (on) {
        el.querySelector(`[data-rpcopy="${k}"]`).innerHTML = SETS.map((b) => `<button class="ghost sm" data-rpcopyset="${k}|${b}">${k === 'verzik' ? `Verz ${esc(setLabel(b) || `Set ${b}`)}` : `${NAME[k]} tab: Set ${b}`}</button>`).join(' ');
        customOf(k).refresh();
      }
    }
    if (job) { form.querySelector('[data-rpact="run"]').disabled = true; form.querySelector('[data-rpact="stop"]').disabled = false; }
  }

  el.addEventListener('change', (e) => {
    const x = e.target, s = st();
    if (!form.contains(x)) return;                                    // (the custom editors save themselves)
    if (x.dataset.rpon) { s.on[x.dataset.rpon] = x.checked; save(state); render(); return; }
    if (x.dataset.rpsrc) { s.src[x.dataset.rpsrc] = x.value; save(state); render(); return; }
    if (x.dataset.rpf) { s[x.dataset.rpf] = x.dataset.rpf === 'raids' ? Math.max(200, Math.trunc(Number(x.value) || 5000)) : x.value; save(state); if (x.dataset.rpf === 'gearSet') render(); return; }
    if (x.dataset.rpcd != null) { s.cd[Number(x.dataset.rpcd)] = x.value; save(state); return; }
    if (x.dataset.rpdose != null) { s.doses[Number(x.dataset.rpdose)] = Number(x.value); save(state); return; }
    if (x.dataset.rpw) { const [j, f] = x.dataset.rpw.split('|'); s.wave[Number(j)][f] = x.value.trim(); save(state); render(); }
  });
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rpwadd != null) { st().wave.push({ time: '', freq: '' }); save(state); render(); return; }
    if (b.dataset.rpcopyset) {
      const [k, set] = b.dataset.rpcopyset.split('|'), c = customOf(k), err = form.querySelector('[data-rperr]'); err.textContent = '';
      try {
        if (k === 'verzik') {
          const wb = getWorkbook ? await getWorkbook() : null; if (!wb) throw new Error('no Verzik chart on the page');
          const t = team(), ws = await wb.load(`${t}-man`);
          await c.builder.setSet(t, c.builder.curBlock(), readValues(ws, describe(ws, t, set))); await c.builder.show(t);
        } else {
          const from = rooms[k].getSet(set); if (!from) throw new Error(`the ${NAME[k]} tab's Set ${set} is empty`);
          c.api.putSet(from);
        }
      } catch (x) { err.textContent = `Couldn't copy: ${x.message}`; }
      return;
    }
    const a = b.dataset.rpact; if (!a) return;
    if (a === 'stop') { if (job) job.stopped = true; return; }
    if (a === 'run' && !job) run();
  });

  /** Room k's setup as the whole raid plays it, from its set or the custom one. */
  async function setupOf(k, s, wave) {
    const src = s.src[k], t = team();
    if (k === 'verzik') {
      const wb = src === 'custom' ? await customOf('verzik').builder.workbook(t) : getWorkbook ? await getWorkbook() : null;
      const b = src === 'custom' ? customOf('verzik').builder.curBlock() : src;
      if (!wb) throw new Error('no Verzik chart on the page - import or build one');
      const cfgs = withGear(await parse_chart(wb, t, null, b, { deferBP: true }), t, b);
      if (!cfgs.some((c) => c.actions && Object.keys(c.actions).length)) throw new Error(`Verzik: ${src === 'custom' ? 'the custom chart' : `Verz Set ${b}`} has no P1 chart`);
      return { cfgs };
    }
    const api = src === 'custom' ? customOf(k).api : rooms[k], set = src === 'custom' ? api.curSet() : src;
    const su = api.setupOf(set);
    if (!su) throw new Error(`${NAME[k]}: ${src === 'custom' ? 'the custom set' : `the ${NAME[k]} tab's Set ${set}`} is empty`);
    if (k === 'nylo' && !su.opts.waveDist) {                         // no wave times of its own: the report's
      if (wave.error) throw new Error(`Nylocas wave times: ${wave.error}`);
      su.opts = { ...su.opts, waveDist: wave.dist };
    }
    return su;
  }

  async function run() {
    const s = st(), t = team(), status = form.querySelector('[data-rpstatus]'), err = form.querySelector('[data-rperr]');
    err.textContent = '';
    const pk = picked(s); if (!pk.ok) { err.textContent = pk.ks.length ? 'Tick rooms in a row - no gaps.' : 'Tick at least one room.'; return; }
    let cd, bps;
    try { cd = s.cd.map(toTicks); bps = String(s.bps || '').trim() ? parseBreakpoints(s.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const setup = {};
    try { for (const k of pk.ks) setup[k] = await setupOf(k, s, parseWaveTimes(s.wave)); } catch (x) { err.textContent = x.message; return; }
    const doses = s.doses.map(Number), n = Math.max(200, Number(s.raids) || 5000), seed = String(s.seed || '').trim() || `frrep${Date.now()}`;
    const ctx = { team: t, surgeCd: cd, doses }, pool = new FullRaidPool(ctx), me = job = { stopped: false };
    const go = form.querySelector('[data-rpact="run"]'), stopB = form.querySelector('[data-rpact="stop"]'); go.disabled = true; stopB.disabled = false;
    const t1 = activeNow(), out = { totals: [], ends: pk.ks.map(() => []), p3: [] }, CH = 1000;
    const timer = setInterval(() => { if (me.stopped) pool.stop(); }, 300);
    try {
      for (let a = 0; a < n && !me.stopped; a += CH) {
        const [r] = await pool.run([setup], a, Math.min(n, a + CH), seed);
        out.totals.push(...r.totals); r.ends.forEach((x, j) => out.ends[j].push(...x)); out.p3.push(...r.p3);
        status.textContent = `Playing whole raids... ${out.totals.length.toLocaleString()} / ${n.toLocaleString()} (${Math.round((activeNow() - t1) / 1000)}s)`;
        await breath();
      }
      if (!out.totals.length) { status.textContent = 'Stopped.'; return; }
      const how = { mode: 'total', total: bps, rooms: pk.ks.map(() => null), rankBy: 'goal' };
      const names = Array.from({ length: t }, (_, k) => ((gp(s) || [])[k] && gp(s)[k].name) || `Player ${k + 1}`);
      const ranked = [{ plan: null, vars: pk.ks.map((kind) => ({ kind, setup: setup[kind], surgers: surgersOf(kind, setup[kind]), dropped: [] })), setup, ...out, score: fullScore(out, how) }];
      const srcTxt = pk.ks.map((k) => `${NAME[k]}: ${s.src[k] === 'custom' ? 'custom' : k === 'verzik' ? `Verz ${setLabel(s.src[k]) || `Set ${s.src[k]}`}` : `Set ${s.src[k]}`}`).join(' · ');
      onResults({ report: { sub: `${srcTxt}. ${out.totals.length.toLocaleString()} whole raids (seed ${esc(seed)}), surge cooldowns and doses carried room to room. Breakpoint shares and Finished are of every attempt; times are of the raids that finished unless marked.`, summary: summaryHtml(out.totals, bps) },
        title: `${t}-man Full raid: report`, ranked, how, t, kinds: pk.ks, names, ctx, seed, raids: out.totals.length, vBps: [], chartNeeds: null, wave: null });
      status.textContent = `${me.stopped ? 'Stopped' : 'Done'} in ${Math.round((activeNow() - t1) / 1000)}s: ${out.totals.length.toLocaleString()} raids.`;
    } catch (x) {
      status.textContent = me.stopped ? 'Stopped.' : '';
      if (!me.stopped) err.textContent = `Couldn't run: ${x.message}`;
    } finally { clearInterval(timer); pool.stop(); job = null; go.disabled = false; stopB.disabled = true; }
  }

  /** The totals: of the raids that finished and of every attempt (a failed raid counts as never finishing), and the
   *  share under each breakpoint. */
  function summaryHtml(totals, bps) {
    const n = totals.length, ok = totals.filter((x) => x < 99999).sort((a, b) => a - b), all = totals.map((x) => (x < 99999 ? x : Infinity)).sort((a, b) => a - b);
    const at = (v, q) => (v.length ? v[Math.min(v.length - 1, Math.max(0, Math.ceil(v.length * q) - 1))] : null);
    const ft = (x) => (x == null || !Number.isFinite(x) ? '-' : fsec(x)), mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    const row = (label, v, m) => `<tr><td class="rl">${label}</td><td>${ft(v[0])}</td><td>${ft(at(v, 0.1))}</td><td>${ft(at(v, 0.25))}</td><td>${ft(at(v, 0.5))}</td><td>${ft(at(v, 0.75))}</td><td>${ft(m)}</td></tr>`;
    const fs2 = (sec) => { const m = Math.floor(sec / 60); return `${m}:${(sec - m * 60).toFixed(1).padStart(4, '0')}`; };
    bps = [...bps].sort((a, b) => a - b);
    const share = (b) => ({ att: ok.filter((x) => x * 0.6 <= b + 1e-9).length / n, suc: ok.length ? ok.filter((x) => x * 0.6 <= b + 1e-9).length / ok.length : 0 });
    return `<div class="scroll"><table class="sortlist"><tr><th></th><th>Fastest</th><th title="10% are this fast or faster">Top 10%</th><th>Top 25%</th><th>Median</th><th title="75% are this fast or faster">Bottom 25%</th><th>Mean</th></tr>
      ${row(`Successes (${ok.length.toLocaleString()}: ${(ok.length / n * 100).toFixed(1)}% finished)`, ok, mean(ok))}
      ${row(`Attempts (${n.toLocaleString()}; a failed raid never finishes)`, all, null)}</table></div>
      ${bps.length ? `<div class="scroll" style="margin-top:6px"><table class="sortlist"><tr><th>Breakpoint</th>${bps.map((b) => `<th>${fs2(b)}</th>`).join('')}</tr>
        <tr><td class="rl">Of attempts</td>${bps.map((b) => `<td>${(share(b).att * 100).toFixed(1)}%</td>`).join('')}</tr>
        <tr><td class="rl">Of successes</td>${bps.map((b) => `<td>${(share(b).suc * 100).toFixed(1)}%</td>`).join('')}</tr></table></div>` : ''}`;
  }

  return { show: render, refresh: () => { state = load(); render(); } };
}
