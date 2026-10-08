// Spec planner: the chart's End spec / Room Time / LB swings / Time of regen columns, computed the same way as
// the template's calc sheet (deterministic spec timeline, no randomness). Works on an imported chart or one built
// on the page. The P1 kill-odds model is not included: P1 ends on the Death tick if one is set, otherwise on the
// last charted tick.
import { blockRows } from './util.js';

const yes = (v) => ['yes', 'y', 'true', '1'].includes(String(v ?? '').trim().toLowerCase());
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const fmtTick = (t) => { const s = t * 0.6; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

/** Custom surge timing -> tick (as the calc sheet: m:ss text, seconds, or an Excel time fraction). */
function surgeTick(v) {
  if (v === null || v === undefined || v === '') return null;
  let sec;
  if (typeof v === 'number') sec = v < 1 ? v * 86400 : v;
  else {
    const s = String(v).trim();
    const m = s.match(/^(\d+):(\d+(?:\.\d+)?)$/);
    if (m) sec = Number(m[1]) * 60 + Number(m[2]);
    else if (!Number.isNaN(Number(s))) sec = Number(s) < 1 ? Number(s) * 86400 : Number(s);
    else return null;
  }
  return Math.trunc(sec / 0.6 + 1e-6);
}

/** Read the planner inputs for one block (A or B) of a tab. `ws` = sheet with cell(r,c).value, max_row, max_column. */
export function readPlanInputs(ws, team, block = 'A') {
  const [lo, hi] = blockRows(ws, block);
  const findRow = (label) => {
    for (let r = lo; r <= hi; r++) for (let c = 1; c < 4; c++) {
      const v = ws.cell(r, c).value; if (typeof v === 'string' && v.trim().toLowerCase() === label.toLowerCase()) return r;
    }
    return null;
  };
  const cols = (row) => { const o = {}; for (let c = 1; c <= ws.max_column; c++) { const v = ws.cell(row, c).value; if (typeof v === 'string' && v.trim() && !(v.trim() in o)) o[v.trim()] = c; } return o; };
  const sr = findRow('Player'); if (!sr) return null;
  const sc = cols(sr);
  const g = (r, h) => (h in sc ? ws.cell(r, sc[h]).value : null);
  const players = [];
  for (let k = 0; k < team; k++) {
    const r = sr + 1 + k;
    players.push({
      name: g(r, 'Name') ?? `P${k + 1}`, start: num(g(r, 'startSpec (%)')) ?? 100, lb: yes(g(r, 'lightbearerOn')),
      purple1: yes(g(r, 'PurpleDC') ?? g(r, '1st Purple DC')), purple2: yes(g(r, '2nd Purple DC')),
      west: yes(g(r, 'WestDC')), east: yes(g(r, 'EastDC')), surge: surgeTick(g(r, 'Custom Surge Timing')),
      target: num(g(r, 'Target spec')), ring: num(g(r, 'Ring switch %')), p3: num(g(r, 'P3 target spec')),
      acts: {},
    });
  }
  const nPurples = num(g(sr + 1, 'Number of Purples'));
  const deathTick = num(g(sr + 1, 'Death tick'));
  const tr = findRow('Tick');
  let maxTick = 0;
  if (tr) {
    const tc = cols(tr);
    for (let c = 2; c <= ws.max_column; c++) {
      const t = num(ws.cell(tr, c).value); if (t === null) continue;
      maxTick = Math.max(maxTick, t);
      for (let k = 0; k < team; k++) {
        const v = ws.cell(tr + 1 + k, c).value;
        if (v !== null && v !== undefined && String(v).trim()) players[k].acts[Math.trunc(t)] = String(v).trim().toUpperCase();
      }
    }
    void tc;
  }
  return { team, players, nPurples, deathTick, maxTick };
}

/** Compute End spec, Room Time, LB swings, Time of regen and the bonus labels for every player. */
export function plan({ team, players, nPurples, deathTick, maxTick }) {
  const T = Math.max(maxTick, 1);
  // P1 ends on the Death tick, else the last tick with anything charted
  let lastCharted = 0;
  for (const p of players) for (const t of Object.keys(p.acts)) lastCharted = Math.max(lastCharted, Number(t));
  const death = deathTick ?? lastCharted;
  const p2Start = death + (deathTick == null ? 19 : 21);
  const n = players.length;
  const spec = players.map((p) => [p.start]), timer = players.map(() => [0]), last = players.map(() => 0);
  const surge = players.map((p) => (p.surge != null && !Object.values(p.acts).includes('P') ? p.surge : null));
  const period = players.map((p) => (p.lb ? 25 : 50));
  // 95% start with a Dawn spec and no R: regen held until their first spec, then a forced regen (R) the tick after it
  const autoR = players.map((p) => {
    const ds = Object.entries(p.acts).filter(([, a]) => a === 'D').map(([t]) => Number(t));
    return p.start === 95 && ds.length && !Object.values(p.acts).includes('R') ? Math.min(...ds) + 1 : null;
  });
  for (let t = 1; t <= T; t++) {
    const held = (i) => autoR[i] != null && t < autoR[i];         // no natural regen before the automatic R
    const s1 = players.map((p, i) => Math.min(100, spec[i][t - 1]
      + (!held(i) && t !== autoR[i] && spec[i][t - 1] < 100 && timer[i][t - 1] + 1 >= period[i] ? 10 : 0) + (t === surge[i] ? 25 : 0)));
    for (let i = 0; i < n; i++) {
      const a = players[i].acts[t] || (t === autoR[i] ? 'R' : '');
      const alive = t <= death;
      const receives = players.some((q, j) => j !== i && q.acts[t] === `ST>${i + 1}` && s1[j] >= 100) && alive;
      let s;
      if (a === 'R') s = Math.min(100, s1[i] + 10);
      else if (a === 'P') s = Math.min(100, s1[i] + 25);
      else if (a === 'D' && s1[i] >= 35 && alive) s = s1[i] - 35;
      else if (a.startsWith('ST>') && s1[i] >= 100 && alive) s = 0;
      else if (receives) s = 100;
      else s = s1[i];
      spec[i][t] = s;
      timer[i][t] = a === 'R' || held(i) ? 0 : spec[i][t - 1] >= 100 ? 0 : timer[i][t - 1] + 1 >= period[i] ? 0 : timer[i][t - 1] + 1;
      if (a === 'P' || a === 'R' || (alive && (a === 'D' || a.startsWith('ST>') || receives))) last[i] = t;
    }
  }
  return players.map((p, i) => {
    const N = last[i];
    const C = Math.min(100, spec[i][N] + (surge[i] != null && surge[i] > N ? 25 : 0));
    const D = timer[i][N];
    const purple = team === 2 ? 15 * p.purple1 + 15 * (nPurples === 2 && p.purple2) : 15 * p.purple1;
    const dc = 15 * p.west + 15 * p.east;
    const purpleLabel = team === 2
      ? (purple + dc === 0 ? '-' : (purple ? `+${purple}` : '') + (purple && dc ? ', ' : '') + (dc ? `+${dc} DC` : ''))
      : (p.purple1 ? '+15' : '-');
    const out = { name: p.name, endSpec: C, purple: purpleLabel, dc: dc ? `+${dc}` : '-', specUsed: p.target ?? 0 };
    if (team === 2) {
      // duo: follow the spec from P1's end through P2 (purples + DCs land at P2 start) until the ring target
      const ringT = p.ring ?? p.target ?? 101;
      const sp = [C], tm = [D], lb = [p.lb && C < ringT ? 1 : 0];
      for (let j = 1; j < 330; j++) {
        const per = lb[j - 1] ? 25 : 50;
        sp[j] = Math.min(100, sp[j - 1] + (sp[j - 1] < 100 && tm[j - 1] + 1 >= per ? 10 : 0) + (N + j === p2Start ? purple + dc : 0));
        tm[j] = sp[j - 1] >= 100 ? 0 : tm[j - 1] + 1 >= per ? 0 : tm[j - 1] + 1;
        lb[j] = lb[j - 1] === 0 ? 0 : sp[j] >= ringT ? 0 : 1;
      }
      const below = p.target == null ? 0 : sp.filter((x) => x < p.target).length;
      out.roomTime = p.target == null ? '-' : below >= 330 ? 'not reached' : fmtTick(N + below);
      out.lbSwings = p.lb ? Math.round(lb.filter((x, j) => j >= p2Start - N && x === 1).length / 5.25) : '-';
      const s = Math.min(100, sp[Math.min(329, below)]);
      const regens = Math.max(0, Math.ceil(((p.p3 ?? 30) - (s - (p.target ?? 0) + dc)) / 10));
      out.regenTime = regens === 0 ? 'Ready' : fmtTick(N + below + 50 * regens);
      return out;
    }
    const per = period[i];
    const E = Math.min(100, C + purple);
    const F = Math.max(0, Math.ceil(((p.ring ?? p.target ?? 0) - E) / 10));
    const G = F === 0 ? p2Start : Math.max(p2Start, N + (per - D) + per * (F - 1));
    const H = Math.min(100, E + 10 * F);
    const d = G - p2Start, m = ((d % 21) + 21) % 21;
    const J = d <= 0 ? 0 : 4 * Math.floor(d / 21) + (m > 0) + (m > 6) + (m > 11) + (m > 16);
    const K = (p.lb ? H : E) - (p.target ?? 0) + dc;
    const L = Math.max(0, Math.ceil(((p.p3 ?? 30) - K) / 10));
    const M = p.lb ? G + 50 * L : L === 0 ? N : N + (50 - D) + 50 * (L - 1);
    const O = Math.max(0, Math.ceil(((p.target ?? 0) - H) / 10));
    out.roomTime = p.target != null ? fmtTick(G + 50 * O) : '-';
    out.lbSwings = p.lb ? J : '-';
    out.regenTime = L === 0 ? 'Ready' : fmtTick(M);
    return out;
  });
}
