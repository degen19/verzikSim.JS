// Maiden tab (first section: the prefires to the 70s proc): per-player settings for each scale (sets A / B / C, saved in
// this browser by name or to a file), and a Report - the 70s proc's time over many raids for the ticked sets (the same
// raids for each), with Show raid. Gear comes from the Gear tab (the Gear set picked here).
import { whenFree, breath } from './engine/pause.js';
import { progressBar } from './progressbar.js';
import { loadGear, gearSet, gearSetLabel, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { blankPlayer } from './engine/loadout.js';
import { parseBreakpoints } from './engine/optimize.js';
import { settingsCard, tabsHtml, pane, wireSubtabs } from './subtabs.js';
import { Rng } from './engine/rng.js';
import { timelineHtml, successSteps, failSteps, raidNav } from './raidview.js';
import { runMaiden, defaultMaidenPlan, seqOf, canDo, ATTACKS, PREFIRES, MAIDEN_HP, PREFIRE_TICK, SPELLS, spellsOf, TBOW_FROM, tbowFromOf, scheduleOf, atkOf, crabOf, hitLabel, S70_HITS, PROC_ROLES, PROC_DEFAULT, PROC_HITS, roleDefault, procedureOf, procedureOpts, DEATH_TICKS , FREEZE, FSPELL } from './engine/maiden.js';

const STORE = 'verzikSim.maiden.v1';           // {team: {cur, sets: {A, B?, C?}, report}}
const SETS = ['A', 'B', 'C'];
const OPEN = 'verzikSim.maidenOpen.v1';        // {section: false} for the sections collapsed (this browser)
const openOf = () => loadKey(OPEN);
const SAVED = 'verzikSim.maidenSaved.v1';      // {team: [{id, name, saved, set}]}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadKey = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveKey = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
/** A fail-condition time: m:ss or seconds -> the last tick that still passes (a proc on that tick or faster is fine); null: not set. */
const failT = (v) => { const m = String(v ?? '').trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/); return m ? Math.floor(((Number(m[1]) || 0) * 60 + Number(m[2])) / 0.6 + 1e-6) : null; };
const FAIL_IDS = ['N1', 'N2', 'N3', 'N4', 'S1', 'S2', 'S3', 'S4'];
/** Why this raid gets reset (the set's fail conditions), or null. Her dying the tick a crab would heal her is a pass - the
 *  heal never lands (leakT: the tick each crab's heal landed). */
const failOf = (f, x) => {
  if (!f) return null;
  const T70 = failT(f.p70), T50 = failT(f.p50), T30 = failT(f.p30);
  if (T70 != null && (x.proc == null || x.proc > T70)) return '70s proc too slow';
  if (T50 != null && (x.proc50 == null ? x.dead == null || x.dead - x.proc > T50 : x.proc50 - x.proc > T50)) return '50s proc too slow';
  if (T30 != null && x.proc50 != null && (x.proc30 == null ? x.dead == null || x.dead - x.proc50 > T30 : x.proc30 - x.proc50 > T30)) return '30s proc too slow';
  const L = Object.entries(x.leakT || {}).filter(([k]) => (f.crabs || []).includes(k.replace(/[ab]@/, '@'))).sort((a, b) => a[1] - b[1]);
  return L.length ? `${L[0][0].replace(/[ab]@/, '@').replace(/@(\d+)/, ' ($1s)')} leaked` : null;
};

// ---- a list line as the page shows it: the attack, then its target (spells always; on 5s a crab for a melee / chin
// hit too - the default is the sim's choice), then the weapon a spell is cast with. One code per line underneath.
const pref0 = (a) => String(a).split(':')[0];
const SPEC_CODES = new Set(['chally', 'challyf', 'claws', 'clawc', 'dinhs', 'maul', 'bgs', 'zcbs', 'ralos', 'ralosl']);
/** The colour class of a line: spells blue, special attacks purple. */
const hueOf = (a) => { const p = pref0(a); return ['ib', 'ibs', 'ibl', 'ibu', 'ir', 'barrage', 'blitz', 'burst', 'rush'].includes(p) ? 'hspell' : SPEC_CODES.has(p) || ['chally', 'claws', 'dinhs', 'maul', 'zcbs'].includes(p) ? 'hspec' : ''; };
const SPELL_P = { ib: 'barrage', ibs: 'barrage', ibl: 'blitz', ibu: 'burst', ir: 'rush' };
const ATK_GROUPS = [
  ['Spells', [['barrage', 'Ice barrage'], ['blitz', 'Ice blitz'], ['burst', 'Ice burst'], ['rush', 'Ice rush']]],
  ['Melee', [['scythe', 'Scythe'], ['chally', 'Halberd spec'], ['claws', 'Claw spec'], ['dinhs', "Dinh's spec"], ['maul', 'Elder maul spec']]],
  ['Range', [['tbr', 'Tbow (rapid)'], ['tba', 'Tbow (accurate)'], ['bp', 'Blowpipe'], ['ax', 'Ascension xbows'], ['zcbs', 'ZCB spec'], ['ralos', 'Ralos spec (rapid)'], ['ralosl', 'Ralos spec (long range)'], ['chin', 'Chinchompa']]],
  ['Other', [['surge', 'Surge potion (+25% spec)'], ['lose', 'Lose 1 tick']]],
];
const ATK_NAME = Object.fromEntries(ATK_GROUPS.flatMap(([, l]) => l));
const niceT = (x) => String(x).replace(/^([NS]\d[ab]?)@(\d+)$/, '$2s $1').replace(/^pile$/, 'the older pile').replace(/^([34]s)$/, 'the $1');
/** A code -> {atk, tgt, wpn, mode, n, hold} (atk: an ATK_NAME key, or the code itself when the page has no other way to show it). */
function lineParts(code) {
  const a = String(code), p = a.split(':')[0], rest = a.split(':').slice(1).join(':'); let m;
  if (SPELL_P[p]) { const h = /\+(\d+)$/.exec(rest); return { atk: SPELL_P[p], tgt: rest.replace(/\+\d+$/, ''), wpn: p === 'ibs' ? 'sceptre' : p === 'ib' ? 'kodai' : p === 'ir' ? 'kodai' : 'ayak', hold: h ? Number(h[1]) : null }; }
  if (a === 'scythe' || ['qscy', 'tdps', 'qs1', 'scyf', 'tclean'].includes(a)) return { atk: 'scythe', tgt: '' };
  if ((m = /^scy[ck]:([^:|]+)/.exec(a))) return { atk: 'scythe', tgt: m[1] };
  if (/^s1if:/.test(a)) return { atk: 'scythe', tgt: 'S1@70' };
  if (/^(fin|qfin|finz)/.test(a)) return { atk: 'chally', tgt: '' };
  if (a === 'chally' || a === 'challyf') return { atk: 'chally', tgt: '' };
  if ((m = /^chally:(.+)$/.exec(a))) return { atk: 'chally', tgt: m[1] };
  if (a === 'claws' || a === 'qspec') return { atk: 'claws', tgt: '' };
  if ((m = /^clawc:(.+)$/.exec(a))) return { atk: 'claws', tgt: m[1] };
  if (a === 'dinhs' || a === 'tdin' || a === 'tdin2') return { atk: 'dinhs', tgt: '' };
  if ((m = /^dinhs:(.+)$/.exec(a))) return { atk: 'dinhs', tgt: m[1] };
  if (['chinp', 'qchin'].includes(a)) return { atk: 'chin', tgt: '' };
  if (a === 'chinpa') return { atk: 'chin', tgt: 'acc' };
  if (a === 'chin') return { atk: 'chin', tgt: '3s' };
  if (a === 'chin4') return { atk: 'chin', tgt: '4s' };
  if (a === 'zcbg' || a === 'zcbx' || a === 'zcbf') return { atk: 'zcbs' };
  return { atk: a };
}
/** The code for those parts (5s: a crab scythe is 'scyc', the trio / 4s lists only target spells). */
function lineCode(P, five) {
  const T = P.tgt || '';
  switch (P.atk) {
    case 'barrage': case 'blitz': case 'burst': case 'rush': {
      const pre = P.atk === 'barrage' ? (P.wpn === 'sceptre' ? 'ibs' : 'ib') : P.atk === 'blitz' ? 'ibl' : P.atk === 'burst' ? 'ibu' : 'ir';
      return `${pre}:${T || 'S1'}${P.hold ? `+${P.hold}` : ''}`; }
    case 'scythe': if (!T) return 'scythe'; return five ? `scyc:${T}:25|scythe` : `scyk:${T}`;   // the crab while it's worth it, else her
    case 'chally': return T ? `chally:${T}` : 'chally';
    case 'claws': return T ? `clawc:${T}` : 'claws';
    case 'dinhs': return 'dinhs';
    case 'chin': return 'chinp';
    default: return P.atk;
  }
}
/** Spells: the crab (or clump) they're cast on. Melee specs and scythes: Maiden or a crab (CRAB_T) - the sim decides
 *  when it's worth leaving her. Chinchompas (5s): which clump. */
function targetsOf(atk, five) {
  const crabs1 = five ? ['N1', 'N2', 'N3', 'N4', 'S1', 'S2', 'S3', 'S4'] : ['S1', 'N1', 'S2', 'N2'];
  const waves = five ? ['N1@70', 'N2@70', 'S1@70', 'S2@70', 'N1@50', 'N2@50', 'S1@50', 'S2@50'] : [];
  if (atk === 'barrage' || atk === 'burst') return [...crabs1, '3s', '4s', ...waves].map((x) => [x, niceT(x)]);
  if (atk === 'blitz' || atk === 'rush') return [...crabs1, ...waves].map((x) => [x, niceT(x)]);
  return null;
}
const CRAB_T = (five) => (five ? ['N1@70', 'N2@70', 'S1@70', 'S2@70', 'N1@50', 'N2@50', 'S1@50', 'S2@50', 'N1', 'N2', 'S1', 'S2', 'N3', 'S3', 'N4', 'S4'] : ['S1', 'N1', 'S2', 'N2']);
const ON_CRAB = new Set(['scythe', 'chally', 'claws']);
/** What a Start list can hold after the prefire (no crabs out yet). */
const START_HITS = ['tbr', 'tba', 'bp', 'ax', 'zcb', 'zcbs', 'ralos', 'ralosl', 'maul', 'bgs', 'claws', 'chally', 'scythe', 'aya', 'surge', 'lose'];
const fsec = (x) => { const s2 = x * 0.6; return s2 >= 60 ? `${Math.floor(s2 / 60)}:${(s2 % 60).toFixed(1).padStart(4, '0')}` : `${s2.toFixed(1)}s`; };
const SPELL_TIP = {
  ancients: 'Ancients: they can freeze the crabs when they spawn (comes with the crabs)',
  thralls: 'Thralls: their thrall hits her from 1-3 ticks after their first attack, then every 4 ticks (0-3 damage)',
  dc: 'DC: Death Charge (comes with the later phases)',
  veng: 'Veng: they cast Vengeance themselves - and Vengeance Other on a teammate without it',
};
const LEGEND = `Maiden: the prefires (Twisted bow tick ${PREFIRE_TICK.tbow}, ZCB ${PREFIRE_TICK.zcb}, Ralos ${PREFIRE_TICK.ralosl} long range / ${PREFIRE_TICK.ralos} rapid) to her 70s proc, then each wave of crabs, to her death. Her attacks every 10 ticks from tick 9 land 5 ticks later (on the targeted player). IB: Ice barrage on a crab (Kodai).`;
const STAND = [[0, 'No'], [70, 'at 70%'], [72, 'at 72%'], [75, 'at 75%'], [78, 'at 78%'], [80, 'at 80%']];

export function createMaiden(host, { getTeam }) {
  let state = loadKey(STORE), saved = loadKey(SAVED), savedPick = '', setMsg = '';
  const persist = () => saveKey(STORE, state);
  const team = () => Number(getTeam()) || 4;
  const isProc = () => team() === 3 || team() === 4;   // 3s / 4s: the team's procedure (roles + specs per phase); the engine does the rest
  host.innerHTML = `${settingsCard('Maiden settings', '<div data-cfg></div>')}
    ${tabsHtml([['rep', 'Report']])}
    ${pane('rep', 'data-rep', `
      <p class="muted small" style="margin-top:8px" data-rblurb>The prefires to her 70s proc, then the 70s crabs (Ice barrage freezes, leaks and her heals) to her 50s proc - damage carries over. Chinchompas, Dinh's, scythe cleave and the later phases come next.</p>
      <div class="row" style="margin-top:10px">
        <label>Raids<input data-r="raids" type="number" min="100" step="1000" style="width:90px"></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <div data-rsets></div>
        <label title="Target 70s proc times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-pause class="ghost" disabled title="Pause this run (and any other run on the page)">Pause</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div><div data-rerr class="err"></div><div data-rout style="margin-top:8px"></div>
    `)}`;
  wireSubtabs(host, 'verzikSim.maidenTabs.v1');
  const cfg = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]');

  const blankSet = () => ({ gearSet: 'A', ...(isProc() ? { target: team() - 1, players: PROC_DEFAULT[team()].map((x) => ({ ...structuredClone(x), startSpec: 100 })) } : defaultMaidenPlan(team())) });
  const root = () => {
    const t = team(); state[t] ||= {}; const r = state[t];
    r.sets ||= {}; if (r.set) { r.sets.A ||= r.set; delete r.set; }   // (one setup before sets A / B / C: set A)
    r.cur = SETS.includes(r.cur) ? r.cur : 'A'; r.sets[r.cur] ||= blankSet();
    r.report ||= { raids: 10000, seed: '', bps: '' }; r.report.sets ||= ['A']; r.report.labels ||= {};
    return r;
  };
  const fix = (st) => {
    const d = isProc() ? { target: team() - 1, players: PROC_DEFAULT[team()].map((r) => roleDefault(team(), r)) } : defaultMaidenPlan(team());
    st.gearSet ||= 'A';
    st.players = d.players.map((p, k) => {
      const o = (st.players || [])[k], b = o ? { startSpec: Number(o.startSpec ?? 100), seq: seqOf(o, k, team()), spells: spellsOf(o), tbowFrom: tbowFromOf(o) } : { ...p, spells: spellsOf(p), tbowFrom: 4 };
      const s70 = (o ? o.s70 : p.s70) || {}, q = Array.isArray(s70.seq) ? s70.seq.filter((a) => atkOf(a)) : [];
      if (!isProc()) { const sd = o ? o.side : p.side; if (sd) b.side = sd; }
      b.s70 = { seq: q.length ? q : [b.seq[b.seq.length - 1]], tbowFrom: tbowFromOf(s70) };
      b.standAt = STAND.some(([v]) => v === Number(o && o.standAt)) ? Number(o.standAt) : (o && o.stand70 ? 70 : 0); b.stand70 = b.standAt > 0;
      if (!isProc()) {   // 5s: a list after the 50s and after the 30s too (new ones: their last 70s hit, repeated)
        const ok = (q) => Array.isArray(q) && q.length && q.every((a) => atkOf(a)), last = [b.s70.seq[b.s70.seq.length - 1]];
        const q5 = o && o.s50, q3 = o && o.s30, dflt = (ph) => (p[ph] && ok(p[ph].seq) ? p[ph].seq.slice() : last.slice());   // missing: the stacked procedure's list (or their last 70s hit)
        b.s50 = { seq: ok(q5 && q5.seq) ? q5.seq.slice() : dflt('s50'), tbowFrom: tbowFromOf(q5 || {}) };
        b.s30 = { seq: ok(q3 && q3.seq) ? q3.seq.slice() : dflt('s30'), tbowFrom: tbowFromOf(q3 || {}) };
      }
      if (isProc()) {   // a role, and a list for each phase (smart lines: the engine takes over where it's better)
        const roles = PROC_ROLES[team()].map(([r]) => r), ok = (q) => Array.isArray(q) && q.length && q.every((a) => atkOf(a));
        if (!o || !roles.includes(o.role) || !ok(o.s50 && o.s50.seq)) { const dd = roleDefault(team(), o && roles.includes(o.role) ? o.role : p.role); Object.assign(b, { role: dd.role, seq: dd.seq, s70: dd.s70, s50: dd.s50, s30: dd.s30, spells: dd.spells }); }   // new, or from before the lists: the role's defaults
        else { b.role = o.role; b.s70 = { seq: o.s70.seq.filter((a) => atkOf(a)) }; b.s50 = { seq: o.s50.seq.filter((a) => atkOf(a)) }; b.s30 = { seq: ok(o.s30 && o.s30.seq) ? o.s30.seq.filter((a) => atkOf(a)) : roleDefault(team(), o.role).s30.seq }; }
      }
      return b;
    });
    st.target = Math.min(team() - 1, Math.max(0, Number(st.target ?? d.target) || 0));
    st.stall = st.stall !== false;
    return st;
  };
  const cur = () => { const r = root(); return fix(r.sets[r.cur]); };
  const setOf = (k) => { const r = root(); return r.sets[k] ? fix(r.sets[k]) : null; };
  const setLabel = (k) => { const l = String(root().report.labels[k] || '').trim(); return l ? `Set ${k}: ${l}` : `Set ${k}`; };
  function setTabs() {
    const r = root(), tb = host.querySelector('[data-settabs]');
    tb.innerHTML = SETS.map((k) => `<button data-set="${k}" class="${k === r.cur ? 'on' : ''}" title="${r.sets[k] ? `Set ${k}` : 'Empty - opens a new set'}">Set ${k}${r.sets[k] ? '' : ' <span class="muted">(empty)</span>'}</button>`).join('');
    host.querySelector('[data-setcard]').dataset.setcol = r.cur;
  }
  host.querySelector('[data-settabs]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set]'); if (!b) return;
    const r = root(), gs = cur().gearSet; r.cur = b.dataset.set;
    if (!r.sets[r.cur]) { r.sets[r.cur] = { ...blankSet(), gearSet: gs }; if (!r.report.sets.includes(r.cur)) r.report.sets = SETS.filter((x) => x === r.cur || r.report.sets.includes(x)); }
    setMsg = ''; persist(); refreshAll();
  });
  const gearOf = (st) => { const set = gearSet(loadGear(), team(), st.gearSet); return set ? playersOf(set, team()) : null; };
  const playersNow = (st) => { const gp = gearOf(st); return st.players.map((p, k) => ({ ...p, ...(isProc() ? procedureOf(team(), p.role) : {}), name: (gp && gp[k] && gp[k].name) || `Player ${k + 1}`, gear: (gp && gp[k]) || blankPlayer(k) })); };

  function render() {
    setTabs();
    const st = cur(), r0 = root(), ps = playersNow(st), t = team(), g = loadGear(), list = saved[t] || [];
    if (savedPick && !list.some((x) => x.id === savedPick)) savedPick = '';
    const opts = (codes, v, gear) => codes.map((a) => `<option value="${a}" class="${hueOf(a)}" ${a === v ? 'selected' : ''}>${esc(hitLabel(a))}${canDo(gear, a) ? '' : ' (not in Gear)'}</option>`).join('');
    // when each hit fires and lands, and which tbow shots land on the same tick as another player's
    const sched = ps.map((p, k) => scheduleOf(p, k, t));
    const tbowLands = sched.map((sc) => sc.filter((x) => x.tbow).map((x) => x.land));
    const line = (x, last, a) => {
      if (x.wait != null) return `waits t${x.wait}`;
      if (x.skip) return `skipped - ${x.skip}`;
      if (x.fire == null) return '';
      return `${x.melee ? 'swings' : 'fires'} t${x.fire} · lands t${x.land}${last ? ` · then every ${ATTACKS[a].speed}` : ''}`;
    };
    const col = (p, k) => {
      const sc = sched[k];
      const rows = p.seq.map((a, j) => {
        const x = sc[j] || {}, mates = x.tbow ? ps.filter((q, i) => i !== k && tbowLands[i].includes(x.land)).map((q) => q.name) : [];
        const txt = line(x, j === p.seq.length - 1, a) + (mates.length ? ` · same tick as ${mates.join(', ')}` : '');
        return `${j === 0 ? '<div class="mlab">Prefire</div>' : j === 1 ? '<div class="mlab">Then</div>' : ''}<div class="mrow">
          <select title="${j === 0 ? 'Prefire' : `Hit ${j}`}"  data-seq="${k}|${j}" class="${canDo(p.gear, a) ? '' : 'bad'} ${hueOf(a)}">${opts(j === 0 ? PREFIRES : (START_HITS.includes(a) ? START_HITS : [a, ...START_HITS]), a, p.gear)}</select>
          ${j > 0 ? `<button class="ghost sm mx" data-del="${k}|${j}" title="Remove this hit">&times;</button>` : '<span class="mx"></span>'}</div>
          ${x.skip ? `<div class="mwhen skip">skipped - ${esc(x.skip)}</div>` : ''}`;
      }).join('');
      const tbows = p.seq.slice(1).some((a) => a === 'tbr' || a === 'tba');
      const roleSel = isProc() ? `<label class="small muted mfrom" title="Their job after the 70s proc - the engine plays it (freezes by spawns and timing, DPS picks)">Role <select data-role="${k}">${PROC_ROLES[t].map(([r, l]) => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : '';
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b>${roleSel}
          <label class="small muted" title="Spec energy coming into the room">Spec <select data-p="${k}|startSpec">${[100, 95].map((x) => `<option value="${x}" ${Number(p.startSpec) === x ? 'selected' : ''}>${x}%</option>`).join('')}</select></label>
          <label class="small muted mfrom" title="They stop attacking once her HP is at or below this (and stay off cooldown for the spawns) until the 70s proc">Stand for the proc <select data-p="${k}|standAt">${STAND.map(([v, l]) => `<option value="${v}" ${Number(p.standAt) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${tbows ? `<label class="small muted mfrom" title="Where they stand for their tbow shots after the prefire (prefires are always from max range) - how many ticks the arrow takes to land">Tbow from <select data-p="${k}|tbowFrom">${TBOW_FROM.map(([d, l]) => `<option value="${d}" ${Number(p.tbowFrom) === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>
        <div class="mspells">${SPELLS.map(([sk, sl]) => `<label title="${SPELL_TIP[sk]}"><input type="checkbox" data-spell="${k}|${sk}" ${p.spells[sk] ? 'checked' : ''}>${sl}</label>`).join('')}</div>
        ${rows}<button class="ghost sm" data-add="${k}" style="margin-top:4px">+ Add hit</button></div>`;
    };
    const col70 = (p, k) => {
      const q = p.s70.seq, rows = q.map((a, j) => `<div class="mrow">
          <select title="Hit ${j + 1} after the 70s proc" data-seq70="${k}|${j}" class="${canDo(p.gear, a) && (!atkOf(a).crab || p.spells.ancients) ? '' : 'bad'}">${opts(S70_HITS(), a, p.gear)}</select>
          ${q.length > 1 ? `<button class="ghost sm mx" data-del70="${k}|${j}" title="Remove this hit">&times;</button>` : '<span class="mx"></span>'}</div>${atkOf(a).crab && !p.spells.ancients ? '<div class="mwhen skip">skipped - Ancients off</div>' : ''}`).join('');
      const tbows = q.some((a) => a === 'tbr' || a === 'tba');
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b>
          ${tbows ? `<label class="small muted mfrom" title="Where they stand for their tbow shots in this section - how many ticks the arrow takes to land">Tbow from <select data-p70="${k}|tbowFrom">${TBOW_FROM.map(([d, l]) => `<option value="${d}" ${Number(p.s70.tbowFrom) === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>
        ${rows}<button class="ghost sm" data-add70="${k}" style="margin-top:4px">+ Add hit</button></div>`;
    };
    const op = openOf(), sec = (k, title, body, off = false) => `<details class="msec${off ? ' off' : ''}" data-sec="${k}" ${op[k] === false || (off && op[k] !== true) ? '' : 'open'}><summary><h4>${title}</h4></summary>${body}</details>`;
    const colN = (ph) => (p, k) => {   // 5s: their list after the 50s / 30s proc
      const q = p[`s${ph}`].seq, hits = S70_HITS(), rows = q.map((a, j) => `<div class="mrow">
          <select title="Hit ${j + 1} after the ${ph}s proc" data-seqp="${k}|${ph}|${j}" class="${canDo(p.gear, a) && (!atkOf(a).crab || p.spells.ancients) ? '' : 'bad'}">${opts(hits.includes(a) ? hits : [a, ...hits], a, p.gear)}</select>
          ${q.length > 1 ? `<button class="ghost sm mx" data-delp="${k}|${ph}|${j}" title="Remove this hit">&times;</button>` : '<span class="mx"></span>'}</div>${atkOf(a).crab && !p.spells.ancients ? '<div class="mwhen skip">skipped - Ancients off</div>' : ''}`).join('');
      const tbows = q.some((a) => a === 'tbr' || a === 'tba');
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b>
          ${tbows ? `<label class="small muted mfrom" title="Where they stand for their tbow shots in this section - how many ticks the arrow takes to land">Tbow from <select data-pph="${k}|${ph}">${TBOW_FROM.map(([d, l]) => `<option value="${d}" ${Number(p[`s${ph}`].tbowFrom) === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>
        ${rows}<button class="ghost sm" data-addp="${k}|${ph}" style="margin-top:4px">+ Add hit</button></div>`;
    };
    const later = isProc() ? '' : [[50, 'from the 50s proc (the second crabs) to her 30s proc'], [30, 'from the 30s proc (the last crabs) to her death']].map(([ph, d]) => sec(`f${ph}`, `${ph}s <span class="muted small" style="font-weight:normal">- ${d}</span>`, `
        <div class="mgrid" data-n="${ps.length}" style="--n:${ps.length}">${ps.map(colN(ph)).join('')}</div>
        <p class="muted small" style="margin:8px 0 0">From the proc each player's next hit is the first here, as soon as their attack timer allows; the last repeats until the next proc${ph === 30 ? ' (here: until she dies)' : ''}. A crab target can be a wave (S2@70) or a clump (the 3s / the 4s).</p>`)).join('');
    const colPh = (ph) => (p, k) => {
      const q = p[`s${ph}`].seq, hits = PROC_HITS(t), role = PROC_ROLES[t].find(([r]) => r === p.role);
      const rows = q.map((a, j) => `<div class="mrow"><select title="Line ${j + 1} after the ${ph}s proc" data-seqp="${k}|${ph}|${j}" class="${canDo(p.gear, a) && (!/^(tfz|qfz)$/.test(a) || p.spells.ancients) ? '' : 'bad'}">${opts(hits.includes(a) ? hits : [a, ...hits], a, p.gear)}</select>
          ${q.length > 1 ? `<button class="ghost sm mx" data-delp="${k}|${ph}|${j}" title="Remove this line">&times;</button>` : '<span class="mx"></span>'}</div>${/^(tfz|qfz)$/.test(a) && !p.spells.ancients ? '<div class="mwhen skip">skipped - Ancients off</div>' : ''}`).join('');
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b><span class="small muted">${esc(role ? role[1] : '')}</span></div>${rows}<button class="ghost sm" data-addp="${k}|${ph}" style="margin-top:4px">+ Add line</button></div>`;
    };
    const DESC = { 70: 'from the 70s proc to her 50s proc', 50: 'from the 50s proc to her 30s proc', 30: 'from the 30s proc to her death' };
    const procNote = (ph) => (ph === 70 ? `<p class="muted small" style="margin:8px 0 0">${t === 3 ? 'Mage: S1 > N1 > S2 > N2 (two a wave; all four out: S1, S2; no S1 / N1: ice rush the S2), then the 3s and 4s clumps; empty freeze slots get a tbow (70s) or a barrage on the older pile (50s / 30s); pulls up to the clump in the 50s / 30s. DPS: the 1s / 2s the mage won\'t freeze, then stragglers over the line.' : 'North: S1, N2, then the 3s and 4s; south: N1, then S2 a tick later (one freezer late: the clumps split - 1 tick late takes the 3s, 2+ the 4s). No N1 but an S2: the south ice rushes it. DPS: the thawed 1s / 2s on their side walking in over the line (melee N1s / N2s, range S1s / N2s).'} </p><p class="muted small" style="margin:4px 0 0">The sim takes over where the procedure calls for it: <b>Ice barrage → a crab</b> - the freezer's written order (a late freezer: the clumps split; no N1 but an S2: rushed); <b>Ice barrage → pile</b> - only if the leftover clump is worth it; <b>Scythe</b> (DPS) - her, or their side's thawed crab walking in over the line; <b>Scythe → S1</b> - the oldest S1 alive (70s first), else her; <b>Dinh's</b> - the sim picks the target and the swing (a 2nd only if it reaches 4+ crabs, else claws); <b>Chinchompa</b> lines - 3 or 5 at the clump by its HP; <b>ZCB</b> after the 30s (DPS) - else claws; <b>Surge</b> - drunk on the way to the next line (no tick lost). A spec without the energy for it (no surge, death charges short) becomes the best one they can do - a Dinh's or claws; a ZCB not reached before the next proc goes after their next freezes. The report lists where the sim went off the list.</p>` : '');
    const procSecs = isProc() ? [70, 50, 30].map((ph) => sec(`p${ph}`, `After the ${ph}s <span class="muted small" style="font-weight:normal">- ${DESC[ph]}: their list (the sim takes over where the proc calls for it)</span>`, `
        <div class="mgrid" data-n="${ps.length}" style="--n:${ps.length}">${ps.map(colPh(ph)).join('')}</div>
        ${ph === 70 ? `<p class="muted small" style="margin:8px 0 0">${t === 3 ? 'Mage: S1 > N1 > S2 > N2 (two a wave; all four out: S1, S2; no S1 / N1: ice rush the S2), then the 3s and 4s clumps; empty freeze slots get a tbow (70s) or a barrage on the older pile (50s / 30s); pulls up to the clump in the 50s / 30s. DPS: the 1s / 2s the mage won\'t freeze, then stragglers over the line.' : 'North: S1, N2, then the 3s and 4s; south: N1, then S2 a tick later (one freezer late: the clumps split - 1 tick late takes the 3s, 2+ the 4s). No N1 but an S2: the south ice rushes it. DPS: the thawed 1s / 2s on their side walking in over the line (melee N1s / N2s, range S1s / N2s).'} </p><p class="muted small" style="margin:4px 0 0">The sim takes over where the procedure calls for it: <b>Ice barrage → a crab</b> - the freezer's written order (a late freezer: the clumps split; no N1 but an S2: rushed); <b>Ice barrage → pile</b> - only if the leftover clump is worth it; <b>Scythe</b> (DPS) - her, or their side's thawed crab walking in over the line; <b>Scythe → S1</b> - the oldest S1 alive (70s first), else her; <b>Dinh's</b> - the sim picks the target and the swing (a 2nd only if it reaches 4+ crabs, else claws); <b>Chinchompa</b> lines - 3 or 5 at the clump by its HP; <b>ZCB</b> after the 30s (DPS) - else claws; <b>Surge</b> - drunk on the way to the next line (no tick lost). A spec without the energy for it (no surge, death charges short) becomes the best one they can do - a Dinh's or claws; a ZCB not reached before the next proc goes after their next freezes. The report lists where the sim went off the list.</p>` : ''}`)).join('') : '';

    // ---- Phases: a tab per proc (Start, 70s, 50s, 30s, End), a column per player - their list, the weapon each freeze
    // is cast with, when each hit goes (ticks after the proc), and the conditions on a conditional hit
    const PT = op.ptab || '70', WAVES = { 70: 'the first crabs, to her 50s proc', 50: 'the second crabs, to her 30s proc', 30: 'the last crabs, to her death' };
    const nice = (x) => String(x).replace(/^([NS]\d[ab]?)@(\d+)$/, '$2s $1');
    const FZ_T = isProc() ? ['S1', 'N1', 'S2', 'N2', '3s', '4s', 'pile'] : ['N1', 'N2', 'N3', 'N4', 'S1', 'S2', 'S3', 'S4', '3s', '4s', 'N1@70', 'N2@70', 'S1@70', 'S2@70', 'N1@50', 'S1@50'];
    const fzOpts = [['ib', 'Ice barrage'], ['ibl', 'Ice blitz'], ['ibu', 'Ice burst'], ['ir', 'Ice rush']].flatMap(([c, n]) => FZ_T.filter((x) => c !== 'ir' || !/^(3s|4s|pile)$/.test(x)).map((x) => [`${c}:${x}`, `${n} → ${nice(x)}`]));
    const pref = (a) => String(a).split(':')[0], canon = (a) => (pref(a) === 'ibs' ? `ib:${String(a).slice(4)}` : String(a)).replace(/\+\d+$/, '');
    const melee5 = isProc() ? [] : ['scyc:N1@70', 'scyc:S1@70', 'chally:N1@70', 'chally:S1@70', 'scyc:N1@70:25|scythe', 's1if:58', 'fin'];
    const restOpts = [...new Set([...(isProc() ? PROC_HITS(t) : S70_HITS()).filter((a) => !/^(ib|ibs|ibl|ibu|ir)(:|$)/.test(a) && a !== 'ib'), ...melee5])];
    const labOf = (a) => { const q = String(a); let m;
      if ((m = /^scyc:([^:]+):(\d+)\|/.exec(q))) return `Scythe → ${nice(m[1])} ?`;
      if ((m = /^scyc:([^:]+)(?::\d+)?$/.exec(q))) return `Scythe → ${nice(m[1])}`;
      if (/^s1if:/.test(q)) return 'Scythe → 70s S1 ?';
      if ((m = /^chally:(.+)$/.exec(q))) return `Halberd spec → ${nice(m[1])}`;
      if (/^fin(:|$)/.test(q)) return 'Scythe, then the halberd as the last hit';
      const fz = fzOpts.find(([v]) => v === canon(q)); if (fz) return fz[1];
      return hitLabel(q).replace(/(→ )([NS]\d[ab]?)@(\d+)/, '$1$3s $2'); };
    const lineOpts = (a, gear) => { const cur = canon(a), all = [...fzOpts.map(([v]) => v), ...restOpts]; if (!all.includes(cur)) all.unshift(cur);
      return `<optgroup label="Freezes">${all.filter((v) => /^(ib|ibl|ibu|ir):/.test(v)).map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(labOf(v))}</option>`).join('')}</optgroup>
        <optgroup label="Hits">${all.filter((v) => !/^(ib|ibl|ibu|ir):/.test(v)).map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(labOf(v))}${canDo(gear, v) ? '' : ' (not in Gear)'}</option>`).join('')}</optgroup>`; };
    const condOf = (a) => { const q = String(a); let m;
      if ((m = /^scyc:([^:]+):(\d+)\|/.exec(q))) return ['if', `${nice(m[1])} is over`, m[2], 'HP - else Maiden'];
      if ((m = /^scyc:([^:]+):(\d+)$/.exec(q))) return ['', `once, while ${nice(m[1])} is over`, m[2], 'HP - skipped if it\'s dead'];
      if ((m = /^s1if:(\d+)/.exec(q))) return ['if', 'Maiden is under', m[1], '% after their previous scythe'];
      if ((m = /^ib[a-z]*:[^+]+\+(\d+)$/.exec(q))) return ['', 'held to +', m[1], 'after the proc'];
      if ((m = /^fin:(\d+)$/.exec(q))) return ['', 'the halberd early at', m[1], '% or under'];
      return null; };
    const roleLine = (p) => {
      if (isProc()) { const r = PROC_ROLES[t].find(([x]) => x === p.role); return r ? r[1] : ''; }
      const fz = (ph) => (p[`s${ph}`] || { seq: [] }).seq.filter((a) => /^(ib|ibs|ibl|ibu|ir):/.test(a)).map((a) => nice(String(crabOf(a)).replace(/\+\d+$/, '')));
      const f70 = fz(70), f50 = fz(50), mel = [p.s70, p.s50, p.s30].some((q) => q && q.seq.some((a) => /scy|chally|fin|scythe|s1if/.test(a)));
      if (f70.length || f50.length) return `Freezer${mel ? ' + melee' : ''}${f70.length ? ` · ${f70.join(' / ')}` : ''}${f50.length ? ` · then ${f50.join(' / ')}` : ''}`;
      return mel ? 'Melee' : 'Range'; };
    const colPhase = (ph) => (p, k) => {
      const q = (p[`s${ph}`] || { seq: [] }).seq, tbows = q.some((a) => a === 'tbr' || a === 'tba');
      let off = 1, firstFz = true;
      const five = !isProc();
      const rows = q.map((a, j) => {
        const A = atkOf(a) || {}, pr = pref(a), F = FSPELL[pr], hold = /\+(\d+)$/.exec(String(a)), last = j === q.length - 1, P = lineParts(a), key = `${k}|${ph}|${j}`;
        if (hold) off = Math.max(off, Number(hold[1]));
        let when = `+${off}`;
        if (F || pr === 'ir') { const dur = pr === 'ir' ? FREEZE.rush[0] : FREEZE[F.spell][F.sc]; when += ` · ${dur} ticks`; }
        if ((a === 'zcbs' || a === 'zcb') && A.delay != null) when += ` · lands +${off + A.delay}`;
        if (last) when += ph === 30 ? ', then until she dies' : ', then until the proc';
        const tick = (F || pr === 'ir') && firstFz && (off === 1 || off === 2) ? `<div class="pwhen"><b>${off === 1 ? 'First tick' : 'Second tick'}</b></div>` : '';
        if (F || pr === 'ir') firstFz = false;
        const known = ATK_NAME[P.atk] != null, atkSel = `<select title="Line ${j + 1} after the ${ph}s proc" data-patk="${key}" class="${canDo(p.gear, a) && (!(F || pr === 'ir') || p.spells.ancients) ? '' : 'bad'} ${hueOf(P.atk)}">${known ? '' : `<option value="${esc(P.atk)}" selected>${esc(hitLabel(a))}</option>`}${ATK_GROUPS.map(([g, l]) => `<optgroup label="${g}">${l.filter(([v]) => !(v === 'finz' && five)).map(([v, n]) => `<option value="${v}" class="${hueOf(v)}" ${v === P.atk ? 'selected' : ''}>${esc(n)}${canDo(p.gear, lineCode({ atk: v, tgt: (targetsOf(v, five) || [['']])[0][0], wpn: 'kodai' }, five)) ? '' : ' (not in Gear)'}</option>`).join('')}</optgroup>`).join('')}</select>`;
        let sub = '';
        const T = targetsOf(P.atk, five);
        if (T) sub += `<div class="mrow psub"><span class="muted">→</span><select data-ptgt="${key}">${T.map(([v, l]) => `<option value="${esc(v)}" ${v === (P.tgt || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}${T.some(([v]) => v === (P.tgt || '')) ? '' : `<option selected>${esc(niceT(P.tgt))}</option>`}</select></div>`;
        if (ON_CRAB.has(P.atk)) { const onC = !!P.tgt, CT = CRAB_T(five);
          sub += `<div class="mrow psub"><span class="muted">→</span><select data-pkind="${key}"><option value="" ${onC ? '' : 'selected'}>Maiden</option><option value="crab" ${onC ? 'selected' : ''}>Crab</option></select></div>${onC ? `<div class="mrow psub" style="margin-left:22px"><span class="muted">→</span><select data-ptgt="${key}">${CT.map((x) => `<option value="${x}" ${x === P.tgt ? 'selected' : ''}>${esc(niceT(x))}</option>`).join('')}${CT.includes(P.tgt) ? '' : `<option selected>${esc(niceT(P.tgt))}</option>`}</select></div>` : ''}`; }
        if (P.atk === 'barrage') sub += `<div class="mrow psub"><span class="muted">↳</span><select data-wpn="${key}"><option value="kodai" ${P.wpn !== 'sceptre' ? 'selected' : ''}>Kodai wand</option><option value="sceptre" ${P.wpn === 'sceptre' ? 'selected' : ''}>Ice ancient sceptre</option></select></div>`;
        else if (P.atk === 'blitz' || P.atk === 'burst') sub += '<div class="mrow psub"><span class="muted">↳ Eye of Ayak</span></div>';
        else if (P.atk === 'rush') sub += '<div class="mrow psub"><span class="muted">↳ Kodai wand</span></div>';
        const out = `<div class="mrow">${atkSel}
          ${q.length > 1 ? `<button class="ghost sm mx" data-delp="${key}" title="Remove this line">&times;</button>` : '<span class="mx"></span>'}</div>${sub}`;
        off += Math.max(0, A.speed ?? 5);
        return out;
      }).join('');
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b><span class="small muted prole">${esc(roleLine(p))}</span>
          ${tbows ? `<label class="small muted mfrom" title="Where they stand for their tbow shots in this phase - how many ticks the arrow takes to land">Tbow from <select data-pph="${k}|${ph}">${TBOW_FROM.map(([d, l]) => `<option value="${d}" ${Number((p[`s${ph}`] || {}).tbowFrom) === d ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>
        <div class="mlab">Then</div>${rows}<button class="ghost sm" data-addp="${k}|${ph}" style="margin-top:6px">+ Add hit</button></div>`;
    };
    const colEnd = (p) => { const q = (p.s30 || { seq: [] }).seq, last = q[q.length - 1];
      const fin = /^(fin|qfin|finz)/.test(String(last));
      return `<div class="mcol"><div class="mhead"><b>${esc(p.name)}</b><span class="small muted prole">${esc(roleLine(p))}</span></div>
        ${fin ? `<div class="mrow"><span class="pbox">Scythe</span></div><div class="pwhen">until their last swing before a crab reaches her</div><div class="mrow"><span class="pbox">${/finz/.test(String(last)) ? 'ZCB spec' : 'Halberd spec'}</span></div><div class="pwhen">that last swing - lands by the tick the crab reaches her (early when it likely kills her)</div>`
          : `<div class="mrow"><span class="pbox">${esc(labOf(last))}</span></div><div class="pwhen">their last 30s line, until she dies</div>`}</div>`; };
    const startCol = (p, k) => col(p, k).replace('<div class="mspells">', `${isProc() ? '' : `<label class="small muted mfrom" title="Which side of her they melee from (freezers cast from the east)">Stands <select data-side="${k}">${[['', 'Auto'], ['E', 'East'], ['N', 'North'], ['S', 'South']].map(([v, l]) => `<option value="${v}" ${(p.side || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}<div class="mspells">`);
    const NOTE = {
      start: 'Each hit goes as soon as their attack timer allows; their last hit repeats until the 70s proc. Lose 1 tick: their next hit goes a tick later. A hit they can\'t do (not in their Gear, or not enough spec) is skipped. Ranged gear on Rigour at 112 Ranged, melee gear on their prayer (Zeal unless set in the Gear tab) at 118; Vengeance up from the start.',
      70: 'Each line goes as soon as their attack timer allows; their last line repeats until the next proc. A Scythe on a crab goes on her when the crab isn\'t worth it; a spec they can\'t do falls back on its own.',
      50: 'A crab can be a wave (70s S2) or a clump (the 3s / the 4s). Their last line repeats until the next proc.',
      30: 'End a list with Scythe then Halberd spec: they scythe until the halberd\'s time (the last swing before a crab reaches her, or earlier when it likely kills her). Their last line repeats until she dies.',
      end: 'After their 30s list, until she dies. The room ends 8 ticks after the killing blow lands.' };
    const TABS = [['start', 'Start', 'the prefires to her 70s proc'], ['70', '70s', WAVES[70]], ['50', '50s', WAVES[50]], ['30', '30s', WAVES[30]]];
    const curTab = TABS.find(([k]) => k === PT) || TABS[1];
    const body = curTab[0] === 'start' ? ps.map(col).join('') : ps.map(colPhase(Number(curTab[0]))).join('');
    const phasesCard = sec('phases', `Phases <span class="muted small" style="font-weight:normal">- what each player does after each proc</span>`, `
        <div class="ptabs">${TABS.map(([k, l]) => `<button class="ptab${k === curTab[0] ? ' on' : ''}" data-ptab="${k}">${l}</button>`).join('')}</div>
        <div class="muted small" style="margin:-2px 0 10px"><b style="color:var(--ink)">${curTab[1]}${/^\d/.test(curTab[0]) ? ' proc' : ''}</b> - ${curTab[2]}</div>
        <div class="mgrid" data-n="${ps.length}" style="--n:${ps.length}">${body}</div>
        ${NOTE[curTab[0]] ? `<p class="muted small" style="margin:10px 0 0">${NOTE[curTab[0]]}</p>` : ''}`);
    { const bl = rep.querySelector('[data-rblurb]'); if (bl) bl.textContent = isProc() ? 'The whole room, prefires to her death: the freezes, leaks and her heals, the DPS, specs and cleave on every wave - what the lists say, with the sim taking over where the procedure calls for it. The report adds where it went off the list.' : true ? 'The whole room, prefires to her death: every list in order (Start, 70s, 50s, 30s), the freezes, leaks and her heals. The 70s / 50s proc details are under the charts.' : 'The prefires to her 70s proc, then the 70s crabs (Ice barrage freezes, leaks and her heals) to her 50s proc - damage carries over. Chinchompas, Dinh\'s, scythe cleave and the later phases come next.'; }
    cfg.innerHTML = `<style>
        .msec{border:1px solid var(--line);border-radius:8px;padding:8px 12px;margin-top:10px}.msec>summary{cursor:pointer;list-style:none;display:flex;align-items:baseline;gap:8px}.msec>summary::-webkit-details-marker{display:none}
        .msec>summary::before{content:'▸';color:var(--ink2);font-size:12px;display:inline-block;transition:transform .15s}.msec[open]>summary::before{transform:rotate(90deg)}.msec>summary h4{margin:0;display:inline}.msec[open]>summary{margin-bottom:8px}.msec.off{opacity:.55}
        .mgrid{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:10px}.mcol{min-width:0;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:rgba(255,255,255,.02)}.mhead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 8px;margin-bottom:6px}
        .mhead b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}@media (max-width:1000px){.mgrid[data-n="5"]{grid-template-columns:repeat(3,minmax(0,1fr))}}@media (max-width:840px){.mgrid[data-n="4"]{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:760px){.mgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media (max-width:460px){.mgrid{grid-template-columns:minmax(0,1fr)}}
        .mhead label{flex-direction:row;align-items:center;gap:4px}.mrow{display:flex;gap:6px;align-items:center;margin-top:4px}.mrow select{flex:1;width:100%;max-width:none;min-width:0;font-size:13px;padding-left:6px;padding-right:2px}
        .mrow select.bad{border-color:#d9534f}.mwhen{margin:2px 32px 0 3px;font-size:11.5px;color:var(--ink2)}.mwhen.same{color:var(--good)}.mwhen.skip{color:var(--warn)}.mhead .mfrom{width:100%}.mhead .mfrom select{font-size:12px;max-width:none}.mlab{font-size:11px;color:var(--ink2);margin-top:6px}
        .mspells{display:grid;grid-template-columns:repeat(2,max-content);gap:2px 14px;font-size:12px}.mspells label{flex-direction:row;align-items:center;gap:4px;color:var(--ink2)}.mx{width:26px;flex:none;padding:2px 0}select.hspell,option.hspell{color:#8fd8ff}select.hspec,option.hspec{color:#e8a0ff}select option:not(.hspell):not(.hspec){color:var(--ink)}.ptabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}.ptab{border-radius:18px;padding:5px 16px;font-weight:600}.ptab:not(.on){background:transparent;color:var(--ink2);border:1px solid var(--line)}.prole{display:block;width:100%;font-size:11px;margin:0 0 4px}.psub{margin:3px 0 0 6px}.psub select{flex:1;width:auto;min-width:0;max-width:170px;font-size:12px}.psub span{font-size:12px}.pwhen{margin:2px 30px 0 3px;font-size:11.5px;color:var(--ink2)}.pwhen b{color:var(--good);font-weight:600}.pcond{font-size:11.5px;margin:4px 0 0 10px;line-height:1.6}.pcond .k{color:var(--warn);font-weight:600}.pnum{width:52px;padding:1px 4px;font-size:12px;text-align:center}.pbox{flex:1;border:1px solid var(--line);border-radius:6px;padding:5px 8px;font-size:13px}</style>
      <div class="row wrap" style="gap:10px;align-items:end;margin:0 0 10px">
        <div><div class="muted small">Copy set ${r0.cur} to</div>${SETS.filter((k) => k !== r0.cur).map((k) => `<button class="ghost sm" data-copyset="${k}" title="Replace set ${k} with a copy of set ${r0.cur}">Set ${k}</button>`).join(' ')}</div>
        <button class="ghost sm" data-clearset title="Start set ${r0.cur} over from the default plan (its Gear set stays)">Clear set ${r0.cur}</button>
        <label>Saved setups<select data-saved="pick"><option value="">(choose a setup)</option>${list.map((x) => `<option value="${x.id}" ${x.id === savedPick ? 'selected' : ''}>${esc(x.name)} · ${new Date(x.saved).toLocaleDateString()}</option>`).join('')}</select></label>
        <button class="ghost sm" data-setact="load" ${savedPick ? '' : 'disabled'}>Load into set ${r0.cur}</button>
        <button class="ghost sm" data-setact="del" ${savedPick ? '' : 'disabled'}>Delete</button>
        <label>Name<input data-saved="name" placeholder="e.g. creepy maiden" style="width:150px"></label>
        <button class="sm" data-setact="save">Save setup</button>
        <button class="ghost sm" data-setact="file">Save to file</button>
        <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-saved="file" hidden></label>
        <span class="muted small">${esc(setMsg)}</span>
      </div>
      <div class="row">
        <label>Gear<select data-s="gearSet">${GEAR_SETS.map((x) => `<option value="${x}" ${st.gearSet === x ? 'selected' : ''}>${esc(gearSetLabel(g, t, x))}</option>`).join('')}</select></label>
        
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="The player she attacks, with Vengeance up, stalls her attack so it lands on the tick their next scythe lands - its Vengeance can't proc her on a tick of its own. From the start to her 30s proc (team-wide)"><input type="checkbox" data-s="stall" ${st.stall ? 'checked' : ''}>Stall Veng to prevent troll procs</label>
        <span class="muted small">HP ${MAIDEN_HP[t].toLocaleString()} · 70s proc below ${(MAIDEN_HP[t] * 0.7).toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
      </div>
      ${(() => { const f = st.fail || {}, waves = [70, 50, 30], on = (f.crabs || []).length + ['p70', 'p50', 'p30'].filter((k) => failT(f[k]) != null).length;
        return sec('fail', `Fail conditions <span class="muted small" style="font-weight:normal">- reset the raid when any of these happens${on ? ` (${on} set)` : ''}</span>`, `
        <div class="row wrap" style="gap:14px">
          <label title="m:ss or seconds from the start. A proc on this time or faster passes">70s proc slower than<input data-fail="p70" placeholder="e.g. 0:16.8" value="${esc(f.p70 || '')}" style="width:90px"></label>
          <label title="Seconds after her 70s proc (a 12s 50s proc lands 12 seconds after the 70s). This time or faster passes">50s proc slower than<input data-fail="p50" placeholder="e.g. 12" value="${esc(f.p50 || '')}" style="width:90px"></label>
          ${`<label title="Seconds after her 50s proc. This time or faster passes; her dying before it procs passes">30s proc slower than<input data-fail="p30" placeholder="e.g. 12.6" value="${esc(f.p30 || '')}" style="width:90px"></label>`}
        </div>
        <div class="muted small" style="margin:10px 0 4px">She doesn't die before any of these crabs leak (her dying the tick it would heal her passes). A ticked crab is also left alone when it walks in: nobody leaves her for it - it's still frozen as listed.</div>
        <table class="small" style="border-collapse:collapse"><tr><th></th>${FAIL_IDS.map((id) => `<th style="padding:2px 6px">${id}</th>`).join('')}</tr>
          ${waves.map((w) => `<tr><td style="padding:2px 6px"><b>${w}s</b></td>${FAIL_IDS.map((id) => `<td style="text-align:center"><input type="checkbox" data-failcrab="${id}@${w}" ${(f.crabs || []).includes(`${id}@${w}`) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</table>
        <p class="muted small" style="margin:8px 0 0">The report runs every raid, then shows the reset share and why - its times and stats are the raids that weren't reset.</p>`); })()}
      ${phasesCard}`;
  }
  cfg.addEventListener('toggle', (e) => {
    const d = e.target; if (!d.dataset || !d.dataset.sec) return;
    const o = openOf(); o[d.dataset.sec] = d.open; saveKey(OPEN, o);
  }, true);
  cfg.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const st = cur();
    if (b.dataset.ptab) { const o = openOf(); o.ptab = b.dataset.ptab; saveKey(OPEN, o); render(); return; }
    if (b.dataset.add) { const q = st.players[Number(b.dataset.add)].seq; q.push(q.length > 1 ? q[q.length - 1] : 'tbr'); persist(); render(); return; }
    if (b.dataset.del) { const [k, j] = b.dataset.del.split('|').map(Number); st.players[k].seq.splice(j, 1); persist(); render(); return; }
    if (b.dataset.addp) { const [k, ph] = b.dataset.addp.split('|').map(Number), q = st.players[k][`s${ph}`].seq; q.push(q[q.length - 1]); persist(); render(); return; }
    if (b.dataset.delp) { const [k, ph, j] = b.dataset.delp.split('|').map(Number); st.players[k][`s${ph}`].seq.splice(j, 1); persist(); render(); return; }
    if (b.dataset.add70) { const q = st.players[Number(b.dataset.add70)].s70.seq; q.push(q[q.length - 1]); persist(); render(); return; }
    if (b.dataset.del70) { const [k, j] = b.dataset.del70.split('|').map(Number); st.players[k].s70.seq.splice(j, 1); persist(); render(); return; }
    const r = root();
    if (b.dataset.copyset) {
      const k = b.dataset.copyset; r.sets[k] = structuredClone(st);
      if (!r.report.sets.includes(k)) r.report.sets = SETS.filter((x) => x === k || r.report.sets.includes(x));
      setMsg = `Copied set ${r.cur} to set ${k}.`; persist(); refreshAll(); return;
    }
    if (b.dataset.clearset !== undefined) {
      if (!confirm(`Clear set ${r.cur}? Its hits go back to the default plan (its Gear set stays).`)) return;
      r.sets[r.cur] = { ...blankSet(), gearSet: st.gearSet }; setMsg = `Set ${r.cur} cleared.`; persist(); refreshAll(); return;
    }
    // saved setups (this browser, per scale) and files
    const act = b.dataset.setact; if (!act) return;
    const t = team(), list = (saved[t] ||= []);
    if (act === 'save') {
      const name = (cfg.querySelector('[data-saved="name"]').value || '').trim() || list.find((x) => x.id === savedPick)?.name || '';
      if (!name) { setMsg = 'Type a name for the setup first.'; render(); return; }
      const old = list.find((x) => x.name === name), entry = { id: old ? old.id : `s${Date.now()}`, name, saved: Date.now(), set: structuredClone(st) };
      if (old) Object.assign(old, entry); else list.push(entry);
      savedPick = entry.id; setMsg = saveKey(SAVED, saved) ? `Saved "${name}".` : 'Could not save (browser storage is off).';
    } else if (act === 'load' || act === 'del') {
      const x = list.find((y) => y.id === savedPick); if (!x) return;
      if (act === 'load') { r.sets[r.cur] = structuredClone(x.set); persist(); setMsg = `Loaded "${x.name}" into set ${r.cur}.`; }
      else { if (!confirm(`Delete the saved setup "${x.name}"?`)) return; saved[t] = list.filter((y) => y !== x); savedPick = ''; saveKey(SAVED, saved); setMsg = `Deleted "${x.name}".`; }
    } else if (act === 'file') {
      const a = document.createElement('a'), nm = (cfg.querySelector('[data-saved="name"]').value || '').trim() || list.find((x) => x.id === savedPick)?.name || '';
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', kind: 'maidenSet', team: t, name: nm, set: st }, null, 1)], { type: 'application/json' }));
      a.download = `maiden_${t}man_${(nm || 'setup').replace(/[^a-z0-9]+/gi, '_')}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return;
    }
    render();
  });
  cfg.addEventListener('change', async (e) => {
    const el = e.target, st = cur();
    if (el.dataset.saved === 'pick') { savedPick = el.value; setMsg = ''; render(); return; }
    if (el.dataset.saved === 'name') return;
    if (el.dataset.saved === 'file') {
      try {
        const j = JSON.parse(await el.files[0].text());
        if (j.kind !== 'maidenSet' || !j.set) throw new Error('not a saved Maiden setup');
        if (Number(j.team) !== team()) throw new Error(`it's a ${j.team}-man setup - pick that scale first`);
        const r = root(); r.sets[r.cur] = j.set; persist(); setMsg = `Opened ${el.files[0].name} into set ${r.cur}.`;
      } catch (x) { setMsg = `Couldn't open that file: ${x.message}`; }
      render(); return;
    }
    if (el.dataset.fail) { (st.fail ||= {})[el.dataset.fail] = el.value.trim(); }
    else if (el.dataset.failcrab) { const f = (st.fail ||= {}), c = (f.crabs ||= []), k = el.dataset.failcrab; f.crabs = el.checked ? [...new Set([...c, k])] : c.filter((x) => x !== k); }
    else if (el.dataset.s) { st[el.dataset.s] = el.type === 'checkbox' ? el.checked : el.dataset.s === 'target' ? Number(el.value) : el.value; }
    else if (el.dataset.p) { const [k, f] = el.dataset.p.split('|'); st.players[Number(k)][f] = f === 'startSpec' || f === 'tbowFrom' || f === 'standAt' ? Number(el.value) : el.value; if (f === 'standAt') st.players[Number(k)].stand70 = Number(el.value) > 0; }
    else if (el.dataset.p70) { const [k, f] = el.dataset.p70.split('|'); st.players[Number(k)].s70[f] = Number(el.value); }
    else if (el.dataset.seq70) { const [k, j] = el.dataset.seq70.split('|').map(Number); st.players[k].s70.seq[j] = el.value; }
    else if (el.dataset.role) { const k = Number(el.dataset.role), d = roleDefault(team(), el.value); st.players[k] = { ...st.players[k], ...d, startSpec: st.players[k].startSpec }; }   // a role: its default lists and spells
    else if (el.dataset.pph) { const [k, ph] = el.dataset.pph.split('|').map(Number); st.players[k][`s${ph}`].tbowFrom = Number(el.value); }
    else if (el.dataset.seqp) { const [k, ph, j] = el.dataset.seqp.split('|').map(Number), q = st.players[k][`s${ph}`].seq, old = String(q[j] || ''); let v = el.value;
      if (/^ib:/.test(v) && /^ibs:/.test(old)) v = `ibs:${v.slice(3)}`;   // a new target keeps the weapon it's cast with
      q[j] = v; }
    else if (el.dataset.patk || el.dataset.ptgt || el.dataset.pkind || el.dataset.wpn) {
      const key = el.dataset.patk || el.dataset.ptgt || el.dataset.pkind || el.dataset.wpn, [k, ph, j] = key.split('|').map(Number), q = st.players[k][`s${ph}`].seq, five = !isProc(), P = lineParts(q[j]);
      if (el.dataset.patk) { const tg = targetsOf(el.value, five); q[j] = lineCode({ atk: el.value, tgt: tg ? (tg.some(([v]) => v === P.tgt) ? P.tgt : tg[0][0]) : '', wpn: P.wpn || 'kodai' }, five); }
      else if (el.dataset.pkind != null) q[j] = lineCode({ ...P, tgt: el.value === 'crab' ? CRAB_T(five)[0] : '' }, five);
      else if (el.dataset.ptgt) q[j] = lineCode({ ...P, tgt: el.value }, five);
      else q[j] = lineCode({ ...P, wpn: el.value }, five); }
    else if (el.dataset.cond) { const [k, ph, j] = el.dataset.cond.split('|').map(Number), q = st.players[k][`s${ph}`].seq, n = String(Math.max(0, Math.round(Number(el.value) || 0))), a = String(q[j]);
      q[j] = /^scyc:[^:]+:\d+\|/.test(a) ? a.replace(/:(\d+)\|/, `:${n}|`) : /^scyc:[^:]+:\d+$/.test(a) ? a.replace(/:\d+$/, `:${n}`) : /^s1if:/.test(a) ? `s1if:${n}` : /^fin:/.test(a) ? `fin:${n}` : a.replace(/\+\d+$/, `+${n}`); }
    else if (el.dataset.side != null) { const k = Number(el.dataset.side); if (el.value) st.players[k].side = el.value; else delete st.players[k].side; }
    else if (el.dataset.spell) { const [k, sk] = el.dataset.spell.split('|'); st.players[Number(k)].spells[sk] = el.checked; }
    else if (el.dataset.seq) { const [k, j] = el.dataset.seq.split('|').map(Number); st.players[k].seq[j] = el.value; }
    persist(); render();
  });
  const showRep = () => {
    const rs = root(), r = rs.report;
    for (const k of ['raids', 'seed', 'bps']) rep.querySelector(`[data-r="${k}"]`).value = r[k] ?? '';
    rep.querySelector('[data-rsets]').innerHTML = `<div class="muted small">Sets to run (compared on the same raids)</div><div class="row" style="gap:8px">${SETS.map((k) => `<label class="pick" style="flex-direction:row;gap:4px;align-items:center" data-setcol="${k}"><input type="checkbox" data-rset-run="${k}" ${rs.sets[k] ? '' : 'disabled'} ${rs.sets[k] && r.sets.includes(k) ? 'checked' : ''}>${k}</label><input data-rlabel="${k}" placeholder="Set ${k} label" value="${esc(r.labels[k] || '')}" style="width:110px" ${rs.sets[k] ? '' : 'disabled'}>`).join('')}</div>`;
  };
  rep.addEventListener('change', (e) => {
    const r = root().report, el = e.target;
    if (el.dataset.condense != null || el.dataset.hideodd != null) {
      if (el.dataset.condense != null) r.condense = el.checked; else r.hideOdd = el.checked;
      persist();
      const out = rep.querySelector('[data-rout]'); if (out.__run) out.innerHTML = results(out.__run.runs, out.__run.bps);
      return;
    }
    if (el.dataset.r) r[el.dataset.r] = el.value;
    if (el.dataset.rsetRun) { const k = el.dataset.rsetRun; r.sets = SETS.filter((x) => (x === k ? el.checked : r.sets.includes(x))); }
    if (el.dataset.rlabel != null) r.labels[el.dataset.rlabel] = el.value;
    persist();
  });

  // ---- the report
  let job = null;
  /** The raid as the 3D player reads it (as the test renders did): the room by tick, the log by tick (players as
   *  'Player N'), every attack, and who stands where. */
  const replayOf = (run, i, title) => {
    const room = [], log = [], trace = [], ps = run.players, t = team();
    const res = runMaiden(ps, t, new Rng(`${run.seed}#${i}`), log, isProc() ? { ...procedureOpts(t), maxTick: 600, target: run.target, stall: run.stall, ignoreCrabs: (run.fail && run.fail.crabs) || null, room, trace } : { target: run.target, stall: run.stall, ignoreCrabs: (run.fail && run.fail.crabs) || null, to: 0, maxTick: 600, room, trace });
    const names = ps.map((p) => p.name), rx = new RegExp(names.map((n, k) => ({ n, k })).sort((a, b) => b.n.length - a.n.length).map((x) => x.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    const PN = (x) => x.replace(rx, (w) => `Player ${names.indexOf(w) + 1}`);
    const ev = {}; for (const l of log) { const m = /^t(\d+) (.*)$/.exec(l); if (m) (ev[m[1]] ||= []).push(PN(m[2])); }
    return { title, proc: res.proc, proc50: res.proc50, proc30: res.proc30, dead: res.dead, max: MAIDEN_HP[t], room, ev, atk: trace.filter((y) => y.i != null && y.code).map((y) => ({ t: y.t, i: y.i, code: y.code, pos: y.pos, tgt: y.tgt })),
      names: ps.map((_, k) => `Player ${k + 1}`), labels: ps.map((p) => (isProc() && p.role ? p.role[0].toUpperCase() + p.role.slice(1) : p.name)), sides: ps.map((p) => (p.dps != null ? p.side ?? null : null)) };
  };
  /** The 3D player over the page: Low (30 fps, plain) or Medium (60 fps, smooth). */
  const openRender = (q) => {
    if (!curRaid) return;
    window.__maidenReplay = replayOf(curRaid.run, curRaid.i, curRaid.title.replace(/<[^>]*>/g, '').split(' · ')[0]);
    document.querySelector('.mr-overlay')?.remove();
    const o = document.createElement('div'); o.className = 'mr-overlay';
    o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column';
    o.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#111;color:#ddd;font-size:14px"><span>${esc(curRaid.title.replace(/<[^>]*>/g, ''))} · ${q === 'low' ? 'Low' : 'Medium'}</span><button class="sm" data-mrclose>Close</button></div><iframe src="render/maiden.html?q=${q}" style="flex:1;border:0;width:100%" allow="fullscreen"></iframe>`;
    o.querySelector('[data-mrclose]').onclick = () => o.remove();
    document.body.appendChild(o);
  };
  let curRaid = null;
  const renderBar = () => `<div class="row wrap" style="gap:6px;align-items:center;margin:8px 0"><b>Render this raid</b>
    <button class="ghost sm" data-render="low" title="The 3D replay at up to 30 frames a second, plain - lightest on the computer">Low</button>
    <button class="ghost sm" data-render="medium" title="The 3D replay at up to 60 frames a second, smooth">Medium</button>
    <button class="ghost sm" disabled title="The game's full models and textures - after Bloat">High (soon)</button>
    <span class="muted small">Loads about 7 MB of models the first time.</span></div>`;
  const draw = (run, i, title) => {
    curRaid = { run, i, title };
    const trace = [], res = runMaiden(run.players, team(), new Rng(`${run.seed}#${i}`), null, isProc() ? { ...procedureOpts(team()), maxTick: 600, target: run.target, stall: run.stall, ignoreCrabs: (run.fail && run.fail.crabs) || null, trace } : { target: run.target, stall: run.stall, ignoreCrabs: (run.fail && run.fail.crabs) || null, trace, to: 0, maxTick: 600 });
    return renderBar() + timelineHtml({ trace, names: run.players.map((p) => p.name), bossName: 'Maiden', end: res.dead ?? res.proc30 ?? res.proc50 ?? 60, title, legend: LEGEND, from: 1 });
  };
  /** One set's numbers. */
  function statsOf(run) {
    const raids = run.raids, ok = raids.filter((x) => x.total != null), N = raids.length, by = new Map();
    for (const x of ok) by.set(x.total, (by.get(x.total) || 0) + 1);
    const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q[q.length >> 1]; };
    const ok50 = raids.filter((x) => x.total50 != null), by50 = new Map();
    for (const x of ok50) by50.set(x.total50, (by50.get(x.total50) || 0) + 1);
    const medInf = (k) => { const v = raids.map((x) => (x[k] == null ? Infinity : x[k])).sort((a, b) => a - b), m = v[(N - 1) >> 1]; return Number.isFinite(m) ? m : null; };
    const rt = raids.filter((x) => x.room != null).map((x) => x.room).sort((a, b) => a - b), q = (p) => (rt.length ? rt[Math.min(rt.length - 1, Math.floor(rt.length * p))] : null), hl = raids.map((x) => x.healed || 0).sort((a, b) => a - b);
    const roomS = rt.length ? { avg: rt.reduce((a, b) => a + b, 0) / rt.length, med: q(0.5), p25: q(0.25), p10: q(0.1), best: rt[0], kills: rt.length, healAvg: hl.reduce((a, b) => a + b, 0) / Math.max(1, hl.length), healMed: hl[hl.length >> 1], leakAvg: raids.reduce((a, x) => a + (x.leaks || 0), 0) / Math.max(1, N) } : null;
    return { roomS, N, ok, by, ok50, by50, median50: medInf('total50'), leaks: med(raids.map((x) => x.leaks || 0)), leaks0: raids.filter((x) => !x.leaks).length, leakEarly: raids.filter((x) => x.leakEarly).length, median: (() => { const v = raids.map((x) => (x.total == null ? Infinity : x.total)).sort((a, b) => a - b), m = v[(N - 1) >> 1]; return Number.isFinite(m) ? m : null; })(), hp: med(ok.map((x) => x.hp)), def: med(ok.map((x) => x.def)),
      mauls: [0, 1, 2, 3, 4, 5].map((k) => raids.filter((x) => x.maulsLanded === k).length), nMaul: run.players.filter((p) => (p.seq || []).includes('maul')).length,
      vengs: raids.reduce((a, x) => a + x.vengs, 0) / Math.max(1, N), fails: N - ok.length,
      skips: (() => { const m = new Map(); for (const x of raids) for (const q of new Set((x.skipped || []).map((y) => `${y.i}|${y.a}`))) m.set(q, (m.get(q) || 0) + 1); return [...m.entries()]; })() };
  }
  const COLS = ['#2a78d6', '#d64545', '#2f9e61'];
  const SETCOL = { A: COLS[0], B: COLS[1], C: COLS[2] };
  /** Bars: how often each 70s proc time happens, per set. */
  function barSvg(runs, S, times) {
    const W = Math.max(640, times.length * 46 + 70), H = 300, L = 46, B = 40, T = 16, R = 10, pw = W - L - R, ph = H - T - B;
    const vals = S.map((s) => times.map((x) => (s.by.get(x) || 0) / s.N * 100)), top = Math.max(1, ...vals.flat()) * 1.12;
    const slot = pw / times.length, bw = slot * 0.8 / runs.length;
    let g = '';
    for (let i = 0; i <= 4; i++) { const y = T + ph - ph * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 4}" class="ax" text-anchor="end">${(top * i / 4).toFixed(0)}%</text>`; }
    vals.forEach((ser, k) => ser.forEach((v, i) => {
      if (!v) return;
      const h = ph * v / top, x = L + i * slot + slot * 0.1 + k * bw;
      g += `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(bw * 0.92).toFixed(1)}" height="${h.toFixed(1)}" fill="${SETCOL[runs[k].k]}"><title>${esc(runs[k].label)} ${fsec(times[i])} - ${v.toFixed(1)}%</title></rect>`;
      if (runs.length === 1 || bw > 26) g += `<text x="${(x + bw * 0.46).toFixed(1)}" y="${(T + ph - h - 4).toFixed(1)}" class="ax" text-anchor="middle">${v.toFixed(v < 10 ? 1 : 0)}%</text>`;
    }));
    times.forEach((x, i) => { g += `<text x="${(L + i * slot + slot / 2).toFixed(1)}" y="${H - B + 16}" class="ax" text-anchor="middle">${fsec(x)}</text>`; });
    g += `<text x="12" y="${T + ph / 2}" class="ax" transform="rotate(-90 12 ${T + ph / 2})" text-anchor="middle">% of raids</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
  }
  /** Lines: her average HP (% of max) by time, per set, and a dotted line at each set's average proc. */
  function lineSvg(runs, S, maxHp) {
    const end = Math.max(...runs.map((r) => r.hpSum.length)), W = 900, H = 320, L = 46, B = 40, T = 18, R = 14, pw = W - L - R, ph = H - T - B;
    const lo = isProc() ? 0 : 40, X = (t) => L + pw * t / Math.max(1, end - 1), Y = (pct) => T + ph * (100 - pct) / (100 - lo);
    let g = '';
    for (let p = lo; p <= 100; p += 10) g += `<line x1="${L}" x2="${W - R}" y1="${Y(p)}" y2="${Y(p)}" class="grid"/><text x="${L - 6}" y="${Y(p) + 4}" class="ax" text-anchor="end">${p}%</text>`;
    for (let sec = 0; sec * 0.6 <= (end - 1) * 0.6 + 1e-9; sec += 5) { const t = sec / 0.6; if (t > end - 1) break; g += `<text x="${X(t)}" y="${H - B + 16}" class="ax" text-anchor="middle">${sec}s</text>`; }
    for (const pp of isProc() ? [70, 50, 30] : [70, 50]) g += `<line x1="${L}" x2="${W - R}" y1="${Y(pp)}" y2="${Y(pp)}" stroke="#999" stroke-dasharray="2 4"/><text x="${W - R - 2}" y="${Y(pp) - 4}" class="ax" text-anchor="end">${pp}%</text>`;
    runs.forEach((run, k) => {
      const N = run.raids.length; let held = 0; const pts = [];
      for (let t = 0; t < end; t++) { held += run.held[t] || 0; pts.push([X(t), Y(((run.hpSum[t] || 0) + held) / N / maxHp * 100)]); }
      const c = SETCOL[run.k], m = S[k].median;
      g += `<polyline fill="none" stroke="${c}" stroke-width="2" points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}"><title>${esc(run.label)}: her average HP</title></polyline>`;
      if (m == null) return;
      g += `<line x1="${X(m)}" x2="${X(m)}" y1="${T}" y2="${T + ph}" stroke="${c}" stroke-width="1.5" stroke-dasharray="5 4"><title>${esc(run.label)}: median 70s proc ${fsec(m)}</title></line>`;
      g += `<text x="${X(m) + 4}" y="${T + 12 + k * 14}" class="ax" fill="${c}" style="fill:${c}">median 70s ${fsec(m)}</text>`;
      const m5 = S[k].median50;
      if (m5 != null) g += `<line x1="${X(m5)}" x2="${X(m5)}" y1="${T}" y2="${T + ph}" stroke="${c}" stroke-width="1.5" stroke-dasharray="2 3"><title>${esc(run.label)}: median 50s proc ${fsec(m5)}</title></line><text x="${X(m5) + 4}" y="${T + 12 + k * 14}" class="ax" fill="${c}" style="fill:${c}">median 50s ${fsec(m5)}</text>`;
    });
    g += `<text x="12" y="${T + ph / 2}" class="ax" transform="rotate(-90 12 ${T + ph / 2})" text-anchor="middle">her HP (average)</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
  }
  /** The 50s proc: each time's share (and that time or faster), the median, and the crabs. */
  function table50(runs, S, pc) {
    const times = [...new Set(S.flatMap((s) => [...s.by50.keys()]))].sort((a, b) => a - b), cum = S.map(() => 0);
    const rows = times.map((x) => `<tr><td><b>${fsec(x)}</b> <span class="muted small">t${x}</span></td>${S.map((s, k) => { const n = s.by50.get(x) || 0; cum[k] += n; return `<td><b>${n ? pc(n, s.N) : '0%'}</b> <span class="muted">(${pc(cum[k], s.N)})</span></td>`; }).join('')}</tr>`).join('');
    return `<h3>50s proc - how often each time happens</h3><div class="scroll"><table class="sortlist"><tr><th>50s proc</th>${runs.map((x) => `<th>${esc(x.label)}<div class="small" style="font-weight:normal">this time (or faster)</div></th>`).join('')}</tr>${rows}
      <tr><td>Median</td>${S.map((s) => `<td>${s.median50 == null ? '-' : `<b>${fsec(s.median50)}</b> <span class="muted small">t${s.median50}</span>`}</td>`).join('')}</tr>
      <tr><td title="Every crab frozen (or dead) before it reached her, in the 20 ticks after the 70s proc">All crabs frozen in time</td>${S.map((s) => `<td><b>${pc(s.N - s.leakEarly, s.N)}</b></td>`).join('')}</tr>
      <tr><td title="Crabs that reached her before the 50s proc (including ones walking in once their freeze ended) - she heals twice each one's HP left">Crabs leaked (median)</td>${S.map((s) => `<td>${s.leaks}</td>`).join('')}</tr>
      ${S.some((s) => s.ok50.length < s.N) ? `<tr><td>No 50s proc</td>${S.map((s) => `<td class="err">${s.N - s.ok50.length ? pc(s.N - s.ok50.length, s.N) : '-'}</td>`).join('')}</tr>` : ''}</table></div>`;
  }
  function resetTable(runs) {
    if (!runs.some((x) => Object.keys(x.resets || {}).length || (x.fail && ((x.fail.crabs || []).length || ['p70', 'p50', 'p30'].some((k) => failT(x.fail[k]) != null))))) return '';
    const pc = (n, N) => (n > 0 && n / N < 0.0005 ? '<0.1%' : `${(n / N * 100).toFixed(n / N < 0.1 ? 1 : 0)}%`);
    const why = [...new Set(runs.flatMap((x) => Object.keys(x.resets || {})))].sort((a, b) => Math.max(...runs.map((x) => x.resets[b] || 0)) - Math.max(...runs.map((x) => x.resets[a] || 0)));
    return `<h3 style="margin:0 0 6px">Resets (your fail conditions)</h3><div class="sub">Each reset counted once, by the first condition it hit. Everything below is the raids that weren't reset.</div><div class="scroll"><table class="sortlist"><tr><th></th>${runs.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>
      <tr><td><b>Completed</b></td>${runs.map((x) => `<td><b>${pc(x.raids.length, x.all)}</b> <span class="muted small">${x.raids.length.toLocaleString()} / ${x.all.toLocaleString()}</span></td>`).join('')}</tr>
      <tr><td title="On average, how many attempts it takes to get one that isn't reset">Attempts per completion</td>${runs.map((x) => `<td>${x.raids.length ? (x.all / x.raids.length).toFixed(2) : '-'}</td>`).join('')}</tr>
      ${why.map((w) => `<tr><td>${esc(w)}</td>${runs.map((x) => `<td class="err">${x.resets[w] ? pc(x.resets[w], x.all) : '-'}</td>`).join('')}</tr>`).join('')}</table></div>`;
  }
  /** 3s / 4s: the room to her death - the summary, how often each time happens, and the odds of a time or faster. */
  function procResults(runs, bps) {
    const pc = (n, N) => (n > 0 && n / N < 0.0005 ? '<0.1%' : `${(n / N * 100).toFixed(n / N < 0.1 ? 1 : 0)}%`), one = runs.length === 1;
    const anyFail = runs.some((x) => x.fail && ((x.fail.crabs || []).length || ['p70', 'p50', 'p30'].some((k) => failT(x.fail[k]) != null)));
    const S = runs.map((x) => { const r = x.raids.filter((y) => y.room != null).sort((a, b) => a.room - b.room || a.healed - b.healed), n = r.length;
      const med = (a) => (a.length ? a[Math.floor((a.length - 1) / 2)] : null), top = r.slice(0, Math.max(1, Math.ceil(n * 0.25))), hs = (a) => a.map((y) => y.healed).sort((u, v) => u - v);
      const by = new Map(); for (const y of r) by.set(y.room, (by.get(y.room) || 0) + 1);
      return { n, all: x.all, by, med: n ? med(r).room : null, medHeal: n ? med(hs(r)) : null, p25: n ? r[top.length - 1].room : null, topHeal: n ? med(hs(top)) : null, best: n ? r[0] : null, rooms: r.map((y) => y.room) }; });
    const legend = one ? '' : `<div class="legend">${runs.map((x) => `<span><i style="background:${SETCOL[x.k]}"></i>${esc(x.label)}</span>`).join('')}</div>`;
    const cell = (v) => `<td><b>${v ?? '-'}</b></td>`, BP = [...bps].sort((a, b) => a - b).map((b) => Math.floor(b / 0.6 + 1e-9));
    const rows = [
      ...(anyFail ? [['Success rate', (s) => `${pc(s.n, s.all)} <span class="muted small">${s.n.toLocaleString()} / ${s.all.toLocaleString()}</span>`]] : []),
      ['Median time', (s) => s.med == null ? null : fsec(s.med)], ['Median heals', (s) => s.medHeal?.toLocaleString()],
      ['Top 25% time', (s) => s.p25 == null ? null : fsec(s.p25)], ['Top 25% heals <span class="muted small">(median of the top 25%)</span>', (s) => s.topHeal?.toLocaleString()],
      ['Fastest recorded', (s) => s.best ? fsec(s.best.room) : null], ['Heals on the fastest', (s) => s.best ? s.best.healed.toLocaleString() : null],
      ...BP.map((T) => [`${fsec(T)} or faster`, (s) => `${pc(s.rooms.filter((x) => x <= T).length, s.n)}${anyFail ? ` <span class="muted small">(${pc(s.rooms.filter((x) => x <= T).length, s.all)} of attempts)</span>` : ''}`]),
    ];
    const summary = `<div class="scroll"><table class="sortlist"><tr><th></th>${runs.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>${rows.map(([l, f]) => `<tr><td>${l}</td>${S.map((s) => cell(f(s))).join('')}</tr>`).join('')}</table></div>`;
    const lo = Math.min(...S.flatMap((s) => s.rooms.slice(0, 1))), hi = Math.max(...S.flatMap((s) => s.rooms.slice(-1)));
    const ticks = []; for (let t = lo; t <= hi; t++) ticks.push(t);
    // bars: share of (completed) raids on each time
    // bars: a bin per tick, or per few ticks when the times spread wide (at most ~60 bars)
    const BIN = Math.max(1, Math.ceil(ticks.length / 60)), bins = ticks.filter((_, j) => j % BIN === 0), binOf = (s, t0) => { let c = 0; for (let t = t0; t < t0 + BIN; t++) c += s.by.get(t) || 0; return c; };
    const bars = (() => { const ticks = bins, W = Math.max(680, ticks.length * 16 + 70), H = 280, L = 46, B = 40, T = 16, R = 10, pw = W - L - R, ph = H - T - B, slot = pw / ticks.length, bw = slot * 0.84 / runs.length;
      const vals = S.map((s) => ticks.map((x) => binOf(s, x) / Math.max(1, s.n) * 100)), top = Math.max(1, ...vals.flat()) * 1.12, every = Math.ceil(46 / slot);
      let g = ''; for (let i = 0; i <= 4; i++) { const y = T + ph - ph * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 4}" class="ax" text-anchor="end">${(top * i / 4).toFixed(1)}%</text>`; }
      vals.forEach((ser, k) => ser.forEach((v, i) => { if (!v) return; const h = ph * v / top, x = L + i * slot + slot * 0.08 + k * bw; g += `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(bw * 0.92).toFixed(1)}" height="${h.toFixed(1)}" fill="${SETCOL[runs[k].k]}"><title>${esc(runs[k].label)} ${fsec(ticks[i])}${BIN > 1 ? `-${fsec(ticks[i] + BIN - 1)}` : ''} - ${v.toFixed(2)}%</title></rect>`; }));
      ticks.forEach((x, i) => { if (i % every === 0) g += `<text x="${(L + i * slot + slot / 2).toFixed(1)}" y="${H - B + 16}" class="ax" text-anchor="middle">${fsec(x)}</text>`; });
      g += `<text x="12" y="${T + ph / 2}" class="ax" transform="rotate(-90 12 ${T + ph / 2})" text-anchor="middle">% of raids</text>`;
      return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`; })();
    // line: the odds of this time or faster, with the breakpoints marked
    const cum = (() => { const W = 760, H = 300, L = 46, B = 40, T = 16, R = 14, pw = W - L - R, ph = H - T - B, X = (t) => L + (t - lo) / Math.max(1, hi - lo) * pw, Y = (v) => T + ph - ph * v / 100;
      let g = ''; for (let i = 0; i <= 4; i++) { const y = Y(i * 25); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 6}" y="${y + 4}" class="ax" text-anchor="end">${i * 25}%</text>`; }
      const step = Math.max(1, Math.ceil((hi - lo) / 8)); for (let t = lo; t <= hi; t += step) g += `<text x="${X(t).toFixed(1)}" y="${H - B + 16}" class="ax" text-anchor="middle">${fsec(t)}</text>`;
      BP.forEach((T0, j) => { if (T0 >= lo && T0 <= hi) g += `<line x1="${X(T0).toFixed(1)}" x2="${X(T0).toFixed(1)}" y1="${T}" y2="${T + ph}" stroke="currentColor" stroke-dasharray="4 4" opacity="0.5"/><text x="${(X(T0) + 4).toFixed(1)}" y="${T + ph - 8 - (j % 3) * 14}" class="ax">${fsec(T0)}</text>`; });
      S.forEach((s, k) => { let c = 0; const pts = ticks.map((t) => { c += s.by.get(t) || 0; return `${X(t).toFixed(1)},${Y(c / Math.max(1, s.n) * 100).toFixed(1)}`; });
        g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${SETCOL[runs[k].k]}" stroke-width="2.2"><title>${esc(runs[k].label)}: of the raids that weren't reset</title></polyline>`;
        if (anyFail && s.all > s.n) { let c2 = 0; const pa = ticks.map((t) => { c2 += s.by.get(t) || 0; return `${X(t).toFixed(1)},${Y(c2 / s.all * 100).toFixed(1)}`; });   // every attempt (resets never finish)
          g += `<polyline points="${pa.join(' ')}" fill="none" stroke="${SETCOL[runs[k].k]}" stroke-width="2" stroke-dasharray="6 4" opacity="0.85"><title>${esc(runs[k].label)}: of all attempts</title></polyline>`;
          BP.forEach((T0, j) => { if (T0 >= lo && T0 <= hi) { const v = s.rooms.filter((x) => x <= T0).length / s.all * 100; g += `<circle cx="${X(T0).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.5" fill="none" stroke="${SETCOL[runs[k].k]}" stroke-width="2"><title>${esc(runs[k].label)}: ${fsec(T0)} or faster - ${v.toFixed(1)}% of all attempts</title></circle><text x="${(X(T0) + 6).toFixed(1)}" y="${(Y(v) + 14).toFixed(1)}" class="ax">${v.toFixed(1)}%</text>`; } }); }
        BP.forEach((T0, j) => { if (T0 >= lo && T0 <= hi) { const v = s.rooms.filter((x) => x <= T0).length / Math.max(1, s.n) * 100; g += `<circle cx="${X(T0).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="${SETCOL[runs[k].k]}"><title>${esc(runs[k].label)}: ${fsec(T0)} or faster - ${v.toFixed(1)}%</title></circle><text x="${(X(T0) + 6).toFixed(1)}" y="${(Y(v) - 6 + (j % 2) * 20).toFixed(1)}" class="ax">${v.toFixed(1)}%</text>`; } }); });
      g += `<text x="12" y="${T + ph / 2}" class="ax" transform="rotate(-90 12 ${T + ph / 2})" text-anchor="middle">this time or faster</text>`;
      return `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`; })();
    // going for the kill: when the freezers skipped a 30s clump for the kill (the HP% to call it at), and the early halberds
    const killRows = (() => {
      const R = runs.map((x) => { const sk = { '3s': [], '4s': [] }; for (const y of x.raids) for (const z of y.skip34 || []) sk[z.id]?.push(z.pct); const hb = Object.entries(x.ovr || {}).filter(([o]) => /halberd early/.test(o)).reduce((u, [, v]) => u + v, 0); return { sk, hb, n: x.raids.length }; });
      if (!R.some((r) => r.sk['3s'].length || r.sk['4s'].length || r.hb)) return '';
      const at = (a) => { if (!a.length) return '-'; const q = a.slice().sort((u, v) => u - v); return `${Math.floor(q[Math.floor((q.length - 1) * 0.9)])}% or under`; };
      return `<h3 style="margin:14px 0 6px">Going for the kill</h3><div class="sub">When a freezer skipped their 30s clump barrage to hit her instead (she was likely to die before those crabs could heal her), and halberds thrown early for the kill. The HP% is hers when that barrage would have gone - the call to make in game.</div><div class="scroll"><table class="sortlist"><tr><th></th>${runs.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>
        ${['3s', '4s'].map((id) => `<tr><td>Ignore the 30s ${id} at</td>${R.map((r) => `<td><b>${at(r.sk[id])}</b>${r.sk[id].length ? ` <span class="muted small">(${pc(r.sk[id].length, r.n)} of raids)</span>` : ''}</td>`).join('')}</tr>`).join('')}
        <tr><td>Halberd early for the kill</td>${R.map((r) => `<td>${r.hb ? pc(r.hb, r.n) : '-'}</td>`).join('')}</tr></table></div>`; })();
    const offs = [...new Set(runs.flatMap((x) => Object.keys(x.ovr || {})))].sort((a, b) => Math.max(...runs.map((x) => (x.ovr || {})[b] || 0)) - Math.max(...runs.map((x) => (x.ovr || {})[a] || 0)));
    const offTable = offs.length ? `<details style="margin-top:14px"><summary><b>Where the sim went off the list</b></summary><div class="sub">Share of raids it happened in. Change the list if the sim keeps overriding it.</div><div class="scroll"><table class="sortlist"><tr><th></th>${runs.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>${offs.map((o) => `<tr><td>${esc(o)}</td>${runs.map((x) => `<td>${(x.ovr || {})[o] ? pc(x.ovr[o], x.raids.length) : '-'}</td>`).join('')}</tr>`).join('')}</table></div></details>` : '';
    return `<div class="vz-report"><h3 style="margin:0 0 6px">Room (to her death)${anyFail ? ' - raids that weren\'t reset' : ''}</h3>${summary}
      <h3>How often each time happens</h3>${legend}<div class="scroll">${bars}</div>
      <h3>Odds of this time or faster${BP.length ? ' - dotted: your breakpoints' : ''}</h3>${anyFail ? '<div class="sub">Solid: of the raids that weren\'t reset · dashed: of all attempts (a reset never finishes)</div>' : ''}${legend}<div class="scroll">${cum}</div>${killRows}${offTable}${anyFail ? `<details style="margin-top:10px"><summary><b>Why raids were reset</b></summary>${resetTable(runs)}</details>` : ''}
      <div class="row wrap" style="gap:6px;align-items:center;margin-top:10px"><b>Show raid</b>
        ${runs.map((x, j) => `<button class="ghost sm" data-mraid="${j}" data-setcol="${x.k}" title="Opens on the median raid; Previous / Next step through fastest, top 10%, top 25%, median, slowest and your breakpoints">${one ? 'View raids' : esc(x.label)}</button>`).join('')}</div>
      <div data-mraidout></div></div>`;
  }
  function results(runs, bps) {
    if (isProc()) return procResults(runs, bps);
    return procResults(runs, bps).replace(/<\/div>$/, `<details style="margin-top:14px"><summary><b>70s / 50s proc details</b></summary>${oldResults(runs, bps).split('<div class="row wrap" style="gap:6px;align-items:center;margin-top:10px"><b>Show raid</b>')[0]}</details></div>`);
  }
  function oldResults(runs, bps) {
    const S = runs.map(statsOf), one = runs.length === 1, maxHp = MAIDEN_HP[team()];
    const pc = (n, N) => (n > 0 && n / N < 0.0005 ? '<0.1%' : `${(n / N * 100).toFixed(n / N < 0.1 ? 1 : 0)}%`);
    const times = [...new Set(S.flatMap((s) => [...s.by.keys()]))].sort((a, b) => a - b);
    const legend = one ? '' : `<div class="legend">${runs.map((x) => `<span><i style="background:${SETCOL[x.k]}"></i>${esc(x.label)}</span>`).join('')}</div>`;
    const head = `<tr><th>70s proc</th>${runs.map((x) => `<th>${esc(x.label)}<div class="small" style="font-weight:normal">this time (or faster)</div></th>`).join('')}</tr>`;
    // Condense list: times only thralls or a Vengeance on a tick of its own ever proc her on go into one row per gap
    // between the times player attacks (or a stalled Vengeance) proc her on
    const main = new Set(runs.flatMap((x) => x.raids.filter((y) => y.total != null && y.procBy === 'attack').map((y) => y.total)));
    const condense = root().report.condense !== false, groups = [];
    for (const x of times) {
      const last = groups[groups.length - 1];
      if (condense && !main.has(x) && last && last.odd) last.ts.push(x); else groups.push({ ts: [x], odd: !main.has(x) });
    }
    const hide = !!root().report.hideOdd, hidden = S.map(() => 0);
    const cum = S.map(() => 0);
    const dist = groups.map((gp) => {
      if (hide && gp.odd) { S.forEach((s, k) => { const n = gp.ts.reduce((q, x) => q + (s.by.get(x) || 0), 0); cum[k] += n; hidden[k] += n; }); return ''; }
      const a = gp.ts[0], b = gp.ts[gp.ts.length - 1], many = gp.ts.length > 1;
      const lab = many ? `<b>${fsec(a)}-${fsec(b)}</b> <span class="muted small">t${a}-${b}</span>` : `<b>${fsec(a)}</b> <span class="muted small">t${a}</span>`;
      const tip = gp.odd ? ' title="Only thralls or a Vengeance on a tick of its own proc her on this time"' : '';
      return `<tr${gp.odd ? ' class="muted"' : ''}><td${tip}>${lab}${gp.odd ? ' <span class="small">(thralls / Vengeance)</span>' : ''}</td>${S.map((s, k) => {
        const n = gp.ts.reduce((q, x) => q + (s.by.get(x) || 0), 0); cum[k] += n;
        return `<td title="This time: ${pc(n, s.N)} of raids · this time or faster: ${pc(cum[k], s.N)}"><b>${n ? pc(n, s.N) : '0%'}</b> <span class="muted">(${pc(cum[k], s.N)})</span></td>`;
      }).join('')}</tr>`;
    }).join('');
    const extra = `<tr><td>Median</td>${S.map((s) => `<td>${s.median == null ? '-' : `<b>${fsec(s.median)}</b> <span class="muted small">t${s.median}</span>`}</td>`).join('')}</tr>`
      + [...bps].sort((x, y) => x - y).map((b) => { const T = Math.floor(b / 0.6 + 1e-9); return `<tr><td>By ${fsec(T)}</td>${S.map((s) => `<td><b>${pc(s.ok.filter((x) => x.total <= T).length, s.N)}</b></td>`).join('')}</tr>`; }).join('')
      + `<tr><td title="Damage carries over">HP left after the proc (median)</td>${S.map((s) => `<td>${s.hp == null ? '-' : s.hp.toLocaleString()}</td>`).join('')}</tr>`
      + (S.some((s) => s.skips.length) ? `<tr><td title="Not in their Gear, or not enough spec energy">Hits skipped</td>${S.map((s, j) => `<td class="small">${s.skips.length ? s.skips.map(([q, n]) => { const [i, a] = q.split('|'); return `<span class="err">${esc(runs[j].players[Number(i)].name)} ${esc(hitLabel(a))}</span> ${pc(n, s.N)}`; }).join('<br>') : '-'}</td>`).join('')}</tr>` : '')
      + (S.some((s) => s.fails) ? `<tr><td>No proc</td>${S.map((s) => `<td class="err">${s.fails ? pc(s.fails, s.N) : '-'}</td>`).join('')}</tr>` : '');
    const roomTable = isProc() ? `<h3 style="margin:0 0 6px">Room (to her death)</h3><div class="scroll"><table class="sortlist"><tr><th></th>${runs.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>
      ${[['Average', (r) => fsec(r.avg)], ['Median', (r) => fsec(r.med)], ['Top 25% (cutoff)', (r) => fsec(r.p25)], ['Top 10% (cutoff)', (r) => fsec(r.p10)], ['Fastest', (r) => fsec(r.best)], ['Healed (average)', (r) => Math.round(r.healAvg).toLocaleString()], ['Healed (median)', (r) => r.healMed.toLocaleString()], ['Crabs leaked (average)', (r) => r.leakAvg.toFixed(1)]]
        .map(([l, f]) => `<tr><td>${l}</td>${S.map((s) => `<td><b>${s.roomS ? f(s.roomS) : '-'}</b></td>`).join('')}</tr>`).join('')}
      ${[...bps].sort((x, y) => x - y).map((b) => { const T = Math.floor(b / 0.6 + 1e-9); return `<tr><td>By ${fsec(T)}</td>${S.map((s, k) => `<td><b>${pc(runs[k].raids.filter((x) => x.room != null && x.room <= T).length, s.N)}</b></td>`).join('')}</tr>`; }).join('')}</table></div>` : '';
    const offs = isProc() ? [...new Set(runs.flatMap((x) => Object.keys(x.ovr || {})))].sort((a, b) => Math.max(...runs.map((x) => (x.ovr || {})[b] || 0)) - Math.max(...runs.map((x) => (x.ovr || {})[a] || 0))) : [];
    const offTable = offs.length ? `<h3 style="margin:14px 0 6px">Where the sim went off the list</h3><div class="sub">Share of raids it happened in. Change the list if the sim keeps overriding it.</div><div class="scroll"><table class="sortlist"><tr><th></th>${runs.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr>${offs.map((o) => `<tr><td>${esc(o)}</td>${runs.map((x, k) => `<td>${(x.ovr || {})[o] ? pc(x.ovr[o], S[k].N) : '-'}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
    return `<div class="vz-report">${resetTable(runs)}${roomTable}${offTable}<h3 style="margin:${isProc() ? '14px' : '0'} 0 6px">70s proc - how often each time happens</h3>
      <div class="row" style="gap:16px;margin:0 0 6px">
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Times that only thralls or a Vengeance on a tick of its own proc her on go into one row between the times player attacks proc her on"><input type="checkbox" data-condense ${condense ? 'checked' : ''} ${hide ? 'disabled' : ''}>Condense list</label>
        <label class="pick" style="flex-direction:row;gap:6px;align-items:center" title="Hide the times only thralls, or a Vengeance not stalled to land with a scythe, proc her on. The (or faster) shares still count them"><input type="checkbox" data-hideodd ${hide ? 'checked' : ''}>Hide non-player procs</label></div>
      <div class="scroll"><table class="sortlist">${head}${hide && hidden.some((n) => n) ? `<tr class="muted"><td title="Thralls, or a Vengeance not stalled to land with a scythe">Hidden: non-player procs</td>${S.map((s, k) => `<td>${hidden[k] ? pc(hidden[k], s.N) : '-'}</td>`).join('')}</tr>` : ''}${dist}${extra}</table></div>
      <h3>How often each 70s proc time happens (% of raids)</h3>${legend}<div class="scroll">${barSvg(runs, S, times)}</div>
      ${table50(runs, S, pc)}
      <h3>How often each 50s proc time happens (% of raids)</h3>${legend}<div class="scroll">${barSvg(runs, S.map((s) => ({ ...s, by: s.by50 })), [...new Set(S.flatMap((s) => [...s.by50.keys()]))].sort((a, b) => a - b))}</div>
      <h3>Her HP over time (average) - dotted: the median 70s and 50s procs</h3>${legend}<div class="sub">Each raid's HP is held at what it had after the 50s proc.</div><div class="scroll">${lineSvg(runs, S, maxHp)}</div></div>
      <div class="row wrap" style="gap:6px;align-items:center;margin-top:10px"><b>Show raid</b>
        ${runs.map((x, j) => `<button class="ghost sm" data-mraid="${j}" data-setcol="${x.k}" title="Opens on the median raid; Previous / Next step through fastest, top 10%, top 25%, median, slowest and your breakpoints">${one ? 'View raids' : esc(x.label)}</button>`).join('')}</div>
      <div data-mraidout></div>`;
  }
  rep.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const status = rep.querySelector('[data-rstatus]'), err = rep.querySelector('[data-rerr]'), out = rep.querySelector('[data-rout]');
    const btn = (x) => rep.querySelector(`[data-act="${x}"]`);
    if (b.dataset.render) { openRender(b.dataset.render); return; }
    if (b.dataset.mraid != null && out.__run) {
      const { runs, bps } = out.__run, run = runs[Number(b.dataset.mraid)], raids = run.raids.map((x) => ({ ...x, p70: x.total, total: x.room })), ok = raids.filter((x) => x.total != null), steps = successSteps(ok, raids.length, raids.length, bps);
      const who = runs.length > 1 ? `${run.label}: ` : '';
      raidNav(out.querySelector('[data-mraidout]'), steps, steps.findIndex((z) => /Median/.test(z.label)), (s) => draw(run, s.pick.i, true ? (() => { const y = raids.find((r) => r.i === s.pick.i) || {}; return `${who}${s.label} raid (Maiden) - ${fsec(s.pick.total)}, healed ${(y.healed ?? 0).toLocaleString()}${y.p70 != null ? ` · 70s proc at ${fsec(y.p70)}` : ''} · ${s.freq}`; })() : `${who}${s.label} raid (Maiden, to 50s) - 70s proc at ${fsec(s.pick.total)}${s.pick.total50 != null ? `, 50s at ${fsec(s.pick.total50)}` : ''} · ${s.freq}`));
      return;
    }
    const a = b.dataset.act;
    if (a === 'stop') { if (job) job.stop = true; return; }
    if (a !== 'run' || job) return;
    const r = root().report; err.textContent = '';
    let bps = []; try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const keys = r.sets.filter((k) => setOf(k)); if (!keys.length) { err.textContent = 'Tick at least one set to run.'; return; }
    const n = Math.max(100, Number(r.raids) || 10000), t = team(), seed = String(r.seed || '').trim() || `m${Date.now()}`;
    const runs = keys.map((k) => { const st = setOf(k); return { k, label: setLabel(k), players: playersNow(st), target: st.target, stall: st.stall, fail: st.fail, seed, raids: [], all: 0, resets: {} }; });
    // every hit on every player's list needs its weapon in their Gear: no run until it's there (or the hit's changed)
    const missing = runs.flatMap((x) => x.players.flatMap((p) => [...new Set([...p.seq, ...p.s70.seq, ...((p.s50 || {}).seq || []), ...((p.s30 || {}).seq || [])].filter((c) => !canDo(p.gear, c)))].map((c) => `${runs.length > 1 ? `${x.label}: ` : ''}${p.name} - ${hitLabel(c)} (no ${atkOf(c).weapon} in ${gearSetLabel(loadGear(), t, setOf(x.k).gearSet)})`)));
    if (isProc()) for (const x of runs) for (const p of x.players) {
      if ([p.s70, p.s50, p.s30].some((q) => q && q.seq.some((a) => a === 'tfz' || a === 'qfz')) && p.spells.ancients && !(p.gear.weapons || []).some((w) => w === 'Kodai wand' || w === 'Ice ancient sceptre')) missing.push(`${runs.length > 1 ? `${x.label}: ` : ''}${p.name} - freezes (no Kodai wand or Ice ancient sceptre)`);
    }
    if (missing.length) { err.innerHTML = `Can't run - missing from the Gear tab:<br>${missing.map(esc).join('<br>')}<br><span class="muted">Add the item to that player's gear, or change the hit.</span>`; return; }
    job = { stop: false }; const me = job; btn('run').disabled = true; btn('stop').disabled = false;
    const pb = progressBar(status); pb.start();
    let i = 0;
    const step = () => {
      if (me.stop || i >= n) {
        if (me.stop) pb.stop(); else pb.done();
        job = null; btn('run').disabled = false; btn('stop').disabled = true;
        if (!runs[0].all) { status.textContent = 'Stopped.'; return; }
        if (runs.some((x) => !x.raids.length)) { out.__run = null; out.innerHTML = `<div class="vz-report">${resetTable(runs)}<p class="err">Every raid${runs.length > 1 ? ' of a set' : ''} was reset - loosen its fail conditions.</p></div>`; status.textContent = `Done: ${runs[0].all.toLocaleString()} raids - all reset.`; return; }
        out.__run = { runs, bps }; out.innerHTML = results(runs, bps);
        status.textContent = `${me.stop ? 'Stopped at' : 'Done:'} ${runs[0].raids.length.toLocaleString()} raids${runs.length > 1 ? ' per set' : ''} (seed ${seed}).`.replace(runs[0].raids.length.toLocaleString(), runs[0].all.toLocaleString());
        return;
      }
      const to = Math.min(n, i + Math.max(100, Math.floor(500 / runs.length)));
      try {
        for (; i < to; i++) for (const run of runs) {
          const hps = [], room = [], x = runMaiden(run.players, t, new Rng(`${seed}#${i}`), null, isProc() ? { ...procedureOpts(t), maxTick: 600, target: run.target, stall: run.stall, ignoreCrabs: (run.fail && run.fail.crabs) || null, hps, room } : { target: run.target, stall: run.stall, ignoreCrabs: (run.fail && run.fail.crabs) || null, hps, to: 0, maxTick: 600, room });
          run.all++; const why = failOf(run.fail, x); if (why) { run.resets[why] = (run.resets[why] || 0) + 1; continue; }
          const lastRoom = room[room.length - 1], leakEarly = x.proc != null && lastRoom ? lastRoom.crabs.some((c) => c.leaked != null && c.leaked <= x.proc + 20) : false;
          // her average HP by tick: each raid's HP up to its proc, then held at what it had then (later sections come next)
          run.hpSum ||= []; run.held ||= [];
          hps.forEach((h, k) => { run.hpSum[k] = (run.hpSum[k] || 0) + h; });
          run.held[hps.length] = (run.held[hps.length] || 0) + hps[hps.length - 1]; if (x.ovr) { run.ovr ||= {}; for (const o of new Set(x.ovr)) run.ovr[o] = (run.ovr[o] || 0) + 1; }
          run.raids.push({ i, skip34: x.skip34 || null, room: x.dead != null ? x.dead + DEATH_TICKS : null, healed: x.healed, total: x.proc, total50: x.proc50, leaks: x.leaks, leakEarly, procBy: x.procBy, key: String(x.maulsLanded), hp: x.hp, def: x.def, maulsLanded: x.maulsLanded, vengs: x.vengs, skipped: x.skipped }); }
      } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      status.textContent = `Running... ${i.toLocaleString()} / ${n.toLocaleString()} raids${runs.length > 1 ? ` (${runs.length} sets)` : ''}`; pb.set(i / n);
      whenFree(() => setTimeout(step, 0));
    };
    step();
  });

  const refreshAll = () => { render(); showRep(); };
  const refresh = () => { state = loadKey(STORE); saved = loadKey(SAVED); setMsg = ''; refreshAll(); };
  refresh();
  return { refresh };
}
