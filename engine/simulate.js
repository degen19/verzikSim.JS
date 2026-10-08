// Batch runner (port of compare.py simulate / simulate_duo). Returns the same result shapes.
// Every raid has its own random stream (seed#i), so P1-only, P1 + P2 and full runs with one seed play the same raids.
import { Rng } from './rng.js';
import { run_p1 } from './sim.js';
import { run_p2 } from './p2.js';
import { run_reds } from './reds.js';
import { run_duo_reds } from './duo_reds.js';
import { run_p3 } from './p3.js';
import { dget } from './util.js';

/** How far a run goes: 'full' (whole room), 'p2' (P1 + P2, ends when P2 dies) or 'p1' (P1 only). Set on the
 *  chart configs (cfgs[k].scope) so it travels with the chart to every worker. 'total' is then the tick that phase ends. */
export const SCOPES = { full: 'Full raid', p2: 'P1 + P2', p1: 'P1 only' };
export const scopeOf = (cfgs) => (cfgs && cfgs[0] && SCOPES[cfgs[0].scope] ? cfgs[0].scope : 'full');

/** Run `runs` raids. `onProgress(done, runs)` is called every 250 raids (optional). */
export function simulate(cfgs, team, runs, seed, onProgress = null) {
  const res = team === 2 ? simulate_duo(cfgs, runs, seed, onProgress) : simulate_team(cfgs, team, runs, seed, onProgress);
  res.scope = scopeOf(cfgs);
  return res;
}

export function simulate_duo(cfgs, runs, seed, onProgress = null) {
  const scope = scopeOf(cfgs);
  const tot = [], s1 = [], s2 = [], s3 = [], depth = [], p20 = [], reds = [];
  const sp1 = [], sproc = [], sp2 = [], sp3 = [], dep1 = [], dep2 = [];
  let n2d = 0;
  const c = { die_p1: 0, kill_ny: 0, kill_ng: 0, kill_ngl: 0 };
  for (let i = 0; i < runs; i++) {
    if (onProgress && i % 250 === 0) onProgress(i, runs);
    const rng = new Rng(`${seed}#${i}`);    // one stream per raid: raid i plays the same P1 / P2 whatever the phases
    const r1 = run_p1(cfgs, 2, rng);
    if (r1.players.some((p) => p.dead)) c.die_p1 += 1;
    if (r1.players.every((p) => p.dead)) continue;
    if (scope === 'p1') { if (r1.end != null) { tot.push(r1.end); s1.push(r1.end); sp1.push(r1.end); } continue; }
    const r2 = run_p2(r1, 2, rng);
    if (r2.players.every((p) => p.dead) || r2.reds_tick == null) continue;
    depth.push(r2.hp / r2.max_hp * 100); reds.push(r2.reds_tick);
    const r3 = run_duo_reds(r2, cfgs, rng);
    if (!r3.success || r3.players.every((p) => p.dead)) continue;
    n2d += 1;
    if (scope === 'p2') {
      tot.push(r3.kill); s1.push(r1.end); s2.push(r3.kill - r1.end);
      sp1.push(r1.end); sproc.push(r2.proc_tick); sp2.push(r3.kill);
      dep1.push(r2.hp / r2.max_hp * 100); const h2p = dget(r3.st, 'hp_after1', null); dep2.push(h2p != null ? h2p / r2.max_hp * 100 : null);
      continue;
    }
    const r4 = run_p3({ ...r3, pid: r2.pid }, cfgs, 2, rng);
    if (r4.kill == null) continue;
    if (r4.yellow_skip) c.kill_ny += 1;
    if (!r4.green) c.kill_ng += 1;
    if (dget(r4, 'green_74') == null) c.kill_ngl += 1;
    tot.push(r4.end); s1.push(r1.end); s2.push(r3.kill - r1.end); s3.push(r4.end - r3.kill);
    sp1.push(r1.end); sproc.push(r2.proc_tick); sp2.push(r3.kill); sp3.push(r4.end);
    dep1.push(r2.hp / r2.max_hp * 100);                                  // Verzik HP % when the 1st reds shield goes up
    const h2 = dget(r3.st, 'hp_after1', null);                            // Verzik HP when the 2nd shield goes up
    dep2.push(h2 != null ? h2 / r2.max_hp * 100 : null);
    if (r4.below20) p20.push(r4.below20 - (r3.kill + 4));
  }
  if (onProgress) onProgress(runs, runs);
  return {
    total: tot, p1: s1, p2: s2, p3: s3, depth, p20, reds, succ: tot.length / runs, runs, n2d,
    duo: { ...c, n2d, runs, sp1, sproc, sp2, sp3, dep1, dep2 },
  };
}

export function simulate_team(cfgs, team, runs, seed, onProgress = null) {
  const scope = scopeOf(cfgs);
  const tot = [], s1 = [], s2 = [], s3 = [], depth = [], p20 = [], reds = [];
  const sp1 = [], sproc = [], sp2 = [], sp3 = [];
  let die_p1 = 0;
  for (let i = 0; i < runs; i++) {
    if (onProgress && i % 250 === 0) onProgress(i, runs);
    const rng = new Rng(`${seed}#${i}`);    // one stream per raid: raid i plays the same P1 / P2 whatever the phases
    const r1 = run_p1(cfgs, team, rng);
    if (r1.players.some((p) => p.dead)) die_p1 += 1;
    if (r1.players.every((p) => p.dead)) continue;
    if (scope === 'p1') { if (r1.end != null) { tot.push(r1.end); s1.push(r1.end); sp1.push(r1.end); } continue; }
    const r2 = run_p2(r1, team, rng);
    if (r2.reds_tick == null) continue;
    depth.push(r2.hp / r2.max_hp * 100); reds.push(r2.reds_tick);
    const r3 = run_reds(r2, cfgs, team, rng);
    if (!r3.success) continue;
    if (scope === 'p2') {
      tot.push(r3.kill); s1.push(r1.end); s2.push(r3.kill - r1.end);
      sp1.push(r1.end); sproc.push(r2.proc_tick); sp2.push(r3.kill);
      continue;
    }
    const r4 = run_p3({ ...r3, pid: r2.pid }, cfgs, team, rng);
    if (r4.kill == null) continue;
    tot.push(r4.end); s1.push(r1.end); s2.push(r3.kill - r1.end); s3.push(r4.end - r3.kill);
    sp1.push(r1.end); sproc.push(r2.proc_tick); sp2.push(r3.kill); sp3.push(r4.end);
    if (r4.below20) p20.push(r4.below20 - (r3.kill + 4));
  }
  if (onProgress) onProgress(runs, runs);
  return { total: tot, p1: s1, p2: s2, p3: s3, depth, p20, reds, succ: tot.length / runs, runs,
           die_p1, splits: { sp1, sproc, sp2, sp3 } };
}
