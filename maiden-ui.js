// Maiden tab (first section: the prefires to the 70s proc): per-player settings for each scale (saved in this browser),
// and a Report - the 70s proc's time over many raids, with Show raid. Gear comes from the Gear tab (the Gear set picked here).
import { whenFree, breath } from './engine/pause.js';
import { progressBar } from './progressbar.js';
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { blankPlayer } from './engine/loadout.js';
import { parseBreakpoints } from './engine/optimize.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';
import { Rng } from './engine/rng.js';
import { timelineHtml, successSteps, failSteps, raidNav } from './raidview.js';
import { runMaiden, defaultMaidenPlan, seqOf, canDo, ATTACKS, PREFIRES, MAIDEN_HP, PREFIRE_TICK } from './engine/maiden.js';

const STORE = 'verzikSim.maiden.v1';           // {team: {set, report}}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadKey = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const fsec = (x) => { const s2 = x * 0.6; return s2 >= 60 ? `${Math.floor(s2 / 60)}:${(s2 % 60).toFixed(1).padStart(4, '0')}` : `${s2.toFixed(1)}s`; };
const LEGEND = 'Maiden: the prefires (tick 5) to her 70s proc - the hit that takes her below 70% of her HP. Her attacks every 10 ticks from tick 9 land 5 ticks later (on the targeted player).';

export function createMaiden(host, { getTeam }) {
  let state = loadKey(STORE);
  const persist = () => saveKey(STORE, state);
  const team = () => Number(getTeam()) || 4;
  host.innerHTML = `${settingsCard('Maiden settings', '<div data-cfg></div>')}
    ${tabsHtml([['rep', 'Report']])}
    ${pane('rep', 'data-rep', `
      <p class="muted small" style="margin-top:8px">The opening so far: the prefires to her 70s proc (the hit that takes her below 70% of her HP - damage carries over).
        Crabs, her ramping, freezes, Dinh's / barrage / chinchompa targeting and the later phases come next.</p>
      <div class="row" style="margin-top:10px">
        <label>Raids<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <label title="Target 70s proc times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page)">Pause</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>
    `)}`;
  wireSubtabs(host, 'verzikSim.maidenTabs.v1');
  const cfg = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]');

  const root = () => { const t = team(); state[t] ||= {}; const r = state[t]; r.set ||= { gearSet: 'A', ...defaultMaidenPlan(t) }; r.report ||= { raids: 10000, seed: '', bps: '' }; return r; };
  const cur = () => {
    const st = root().set, d = defaultMaidenPlan(team());
    st.players = d.players.map((p, k) => { const o = (st.players || [])[k]; return o ? { startSpec: Number(o.startSpec ?? 100), seq: seqOf(o, k, team()) } : p; });
    st.target = Math.min(team() - 1, Math.max(0, Number(st.target ?? d.target) || 0));
    return st;
  };
  const gearOf = (st) => { const set = gearSet(loadGear(), team(), st.gearSet); return set ? playersOf(set, team()) : null; };
  const playersNow = (st) => { const gp = gearOf(st); return st.players.map((p, k) => ({ ...p, name: (gp && gp[k] && gp[k].name) || `Player ${k + 1}`, gear: (gp && gp[k]) || blankPlayer(k) })); };

  function render() {
    const st = cur(), ps = playersNow(st), t = team(), g = loadGear();
    const opts = (codes, v, gear) => codes.map((a) => `<option value="${a}" ${a === v ? 'selected' : ''}>${esc(ATTACKS[a].label)}${canDo(gear, a) ? '' : ' (not in Gear)'}</option>`).join('');
    const col = (p, k) => {
      const rows = p.seq.map((a, j) => `<div class="mrow">${j === 0 ? '<span class="mlab">Prefire</span>' : `<span class="mlab">${j}</span>`}
          <select data-seq="${k}|${j}" class="${canDo(p.gear, a) ? '' : 'bad'}">${opts(j === 0 ? PREFIRES : Object.keys(ATTACKS), a, p.gear)}</select>
          ${j > 0 ? `<button class="ghost sm mx" data-del="${k}|${j}" title="Remove this hit">&times;</button>` : '<span class="mx"></span>'}</div>`).join('');
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b>
          <label class="small muted" title="Spec energy coming into the room">Start spec <select data-p="${k}|startSpec">${[100, 95].map((x) => `<option value="${x}" ${Number(p.startSpec) === x ? 'selected' : ''}>${x}%</option>`).join('')}</select></label></div>
        ${rows}<button class="ghost sm" data-add="${k}" style="margin-top:4px">+ Add hit</button></div>`;
    };
    const later = ['70s', '50s', '30s', 'End'].map((x) => `<div class="msec off"><h4>${x}</h4><span class="muted small">comes later</span></div>`).join('');
    cfg.innerHTML = `<style>
        .msec{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-top:10px}.msec h4{margin:0 0 8px}.msec.off{opacity:.55;display:flex;gap:10px;align-items:baseline;padding:6px 12px}.msec.off h4{margin:0}
        .mgrid{display:flex;gap:14px;flex-wrap:wrap}.mcol{min-width:220px;flex:1}.mhead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
        .mhead label{flex-direction:row;align-items:center;gap:4px}.mrow{display:flex;gap:6px;align-items:center;margin-top:4px}.mrow select{flex:1;min-width:0}
        .mrow select.bad{border-color:#d9534f}.mlab{width:46px;font-size:12px;color:var(--ink2)}.mx{width:28px;padding:2px 0}</style>
      <div class="row">
        <label>Gear<select data-s="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${st.gearSet === x ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}</option>`).join('')}</select></label>
        <label title="Who her attacks go at (for now one player all room - her real targeting comes later)">Maiden targets<select data-s="target">${ps.map((p, k) => `<option value="${k}" ${st.target === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <span class="muted small">HP ${MAIDEN_HP[t].toLocaleString()} · 70s proc below ${(MAIDEN_HP[t] * 0.7).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
      </div>
      <div class="msec"><h4>Start <span class="muted small" style="font-weight:normal">- the prefires (Twisted bow tick ${PREFIRE_TICK.tbow}, ZCB tick ${PREFIRE_TICK.zcb}) to her 70s proc</span></h4>
        <div class="mgrid">${ps.map(col).join('')}</div>
        <p class="muted small" style="margin:8px 0 0">Each hit goes as soon as their attack timer allows; their last hit repeats until the 70s proc.
          A hit they can't do (not in their Gear, or not enough spec) is skipped. Ranged gear on Rigour at 112 Ranged, melee gear on their prayer (Zeal unless set in the Gear tab) at 118; Vengeance up from the start.</p></div>
      ${later}`;
  }
  cfg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const st = cur();
    if (b.dataset.add) { const q = st.players[Number(b.dataset.add)].seq; q.push(q.length > 1 ? q[q.length - 1] : 'tbr'); }
    else if (b.dataset.del) { const [k, j] = b.dataset.del.split('|').map(Number); st.players[k].seq.splice(j, 1); }
    else return;
    persist(); render();
  });
  cfg.addEventListener('change', (e) => {
    const el = e.target, st = cur();
    if (el.dataset.s) { st[el.dataset.s] = el.dataset.s === 'target' ? Number(el.value) : el.value; }
    else if (el.dataset.p) { const [k, f] = el.dataset.p.split('|'); st.players[Number(k)][f] = f === 'startSpec' ? Number(el.value) : el.value; }
    else if (el.dataset.seq) { const [k, j] = el.dataset.seq.split('|').map(Number); st.players[k].seq[j] = el.value; }
    persist(); render();
  });
  const showRep = () => { const r = root().report; for (const k of ['raids', 'seed', 'bps']) rep.querySelector(`[data-r="${k}"]`).value = r[k] ?? ''; };
  rep.addEventListener('change', (e) => { const k = e.target.dataset.r; if (!k) return; root().report[k] = e.target.value; persist(); });

  // ---- the report
  let job = null;
  const draw = (run, i, title) => {
    const trace = [], res = runMaiden(run.players, team(), new Rng(`${run.seed}#${i}`), null, { target: run.target, trace });
    return timelineHtml({ trace, names: run.players.map((p) => p.name), bossName: 'Maiden', end: res.proc ?? 60, title, legend: LEGEND, from: 1 });
  };
  function results(run, raids, bps) {
    const ok = raids.filter((x) => x.total != null), N = raids.length, v = ok.map((x) => x.total).sort((a, b) => a - b);
    const at = (f) => v[Math.min(v.length - 1, Math.max(0, Math.floor(N * f) - 1))];
    const mean = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    const pc = (n) => `${(n / N * 100).toFixed(n / N < 0.1 ? 1 : 0)}%`;
    const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
    const rows = [['Fastest', v[0]], ['Top 10%', at(0.1)], ['Top 25%', at(0.25)], ['Median', v[N >> 1]], ['Bottom 25%', at(0.75)], ['Slowest', v[v.length - 1]]];
    const mauls = Array.from({ length: 3 }, (_, k) => raids.filter((x) => x.maulsLanded === k).length);
    const nMaul = run.players.filter((p) => (p.seq || []).includes('maul')).length;
    return `<div class="vz-report"><h3 style="margin:0 0 6px">70s proc</h3>
      <div class="scroll"><table class="sortlist"><tr><th></th><th>Time</th><th>Tick</th></tr>
        ${rows.map(([l, x]) => `<tr><td>${l}</td><td><b>${x == null ? '-' : fsec(x)}</b></td><td>${x ?? '-'}</td></tr>`).join('')}
        <tr><td>Mean</td><td><b>${fsec(mean)}</b></td><td>${mean.toFixed(1)}</td></tr></table></div>
      ${bps.length ? `<p style="margin:8px 0 0">${[...bps].sort((x, y) => x - y).map((b) => `By ${fsec(Math.floor(b / 0.6))}: <b>${pc(ok.filter((x) => x.total <= Math.floor(b / 0.6 + 1e-9)).length)}</b>`).join(' · ')}</p>` : ''}
      <p class="small" style="margin:8px 0 0">HP left after the proc's tick (damage carries over): median <b>${med(ok.map((x) => x.hp)).toLocaleString()}</b> ·
        her Defence then: median <b>${med(ok.map((x) => x.def))}</b> ·
        ${nMaul ? `Elder mauls landed: ${mauls.map((n, k) => (k <= nMaul && n ? `<b>${k}</b> ${pc(n)}` : '')).filter(Boolean).join(', ')} · ` : ''}
        Vengeance procs: ${(raids.reduce((a, x) => a + x.vengs, 0) / N).toFixed(2)} a raid${N - ok.length ? ` · <span class="err">no proc in ${pc(N - ok.length)}</span>` : ''}</p></div>
      <div class="row wrap" style="gap:6px;align-items:center;margin-top:10px"><b>Show raid</b>
        <button class="ghost sm" data-mraid="succ" title="Opens on the median raid; Previous / Next step through fastest, top 10%, top 25%, median, slowest and your breakpoints">View raids</button></div>
      <div data-mraidout></div>`;
  }
  rep.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const status = rep.querySelector('[data-rstatus]'), err = rep.querySelector('[data-rerr]'), out = rep.querySelector('[data-rout]');
    const btn = (x) => rep.querySelector(`[data-act="${x}"]`);
    if (b.dataset.mraid && out.__run) {
      const { run, raids, bps } = out.__run, ok = raids.filter((x) => x.total != null), steps = successSteps(ok, raids.length, raids.length, bps);
      raidNav(out.querySelector('[data-mraidout]'), steps, steps.findIndex((z) => /Median/.test(z.label)), (s) => draw(run, s.pick.i, `${s.label} raid (Maiden, to 70s) - 70s proc at ${fsec(s.pick.total)} · ${s.freq}`));
      return;
    }
    const a = b.dataset.act;
    if (a === 'stop') { if (job) job.stop = true; return; }
    if (a !== 'run' || job) return;
    const r = root().report; err.textContent = '';
    let bps = []; try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const st = cur(), n = Math.max(100, Number(r.raids) || 10000), t = team(), seed = String(r.seed || '').trim() || `m${Date.now()}`;
    const run = { players: playersNow(st), target: st.target, seed }, raids = [];
    job = { stop: false }; const me = job; btn('run').disabled = true; btn('stop').disabled = false;
    const pb = progressBar(status); pb.start();
    let i = 0;
    const step = () => {
      if (me.stop || i >= n) {
        if (me.stop) pb.stop(); else pb.done();
        job = null; btn('run').disabled = false; btn('stop').disabled = true;
        if (!raids.length) { status.textContent = 'Stopped.'; return; }
        out.__run = { run, raids, bps }; out.innerHTML = results(run, raids, bps);
        status.textContent = `${me.stop ? 'Stopped at' : 'Done:'} ${raids.length.toLocaleString()} raids (seed ${seed}).`;
        return;
      }
      const to = Math.min(n, i + 500);
      try {
        for (; i < to; i++) { const x = runMaiden(run.players, t, new Rng(`${seed}#${i}`), null, { target: run.target }); raids.push({ i, total: x.proc, key: String(x.maulsLanded), hp: x.hp, def: x.def, maulsLanded: x.maulsLanded, vengs: x.vengs, specs: x.specs, skipped: x.skipped.length }); }
      } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      status.textContent = `Running... ${i.toLocaleString()} / ${n.toLocaleString()} raids`; pb.set(i / n);
      whenFree(() => setTimeout(step, 0));
    };
    step();
  });

  const refresh = () => { render(); showRep(); };
  refresh();
  return { refresh };
}
