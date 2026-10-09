// Web Worker for the Verz Solver tab. Loaded by solver-pool.js with a relative URL.
//   {id, cmd: 'eval', kind, list, team, from, to, seed, bps} -> counts for raids [from, to) of every setup in list
//   {id, cmd: 'p1', base, team, lb, opts}                    -> P1 chart candidates for one Lightbearer assignment
//   {id, cmd: 'edits', cfg, team, plans, opts}                -> your chart's P1, edited (charts one change away)
//   {id, cmd: 'p1sim', list, team, runs, seed}               -> P1-only stats of each setup's chart
import { evalRange, p1Candidates, editCandidates } from './engine/roomsolver.js';
import { simP1 } from './engine/solver.js';

self.onmessage = (ev) => {
  const d = ev.data;
  try {
    let result;
    if (d.cmd === 'eval') result = d.list.map((cfgs) => evalRange(d.kind, cfgs, d.team, d.from, d.to, d.seed, d.bps));
    else if (d.cmd === 'p1') result = p1Candidates(d.base, d.team, d.lb, d.opts);
    else if (d.cmd === 'edits') result = editCandidates(d.cfg, d.team, d.plans, d.opts);
    else if (d.cmd === 'p1sim') result = d.list.map((cfgs) => simP1(cfgs, d.team, cfgs.map((c) => c.actions), d.runs, d.seed, cfgs.map((c) => c.startSpec)));
    else throw new Error(`unknown command ${d.cmd}`);
    self.postMessage({ id: d.id, result });
  } catch (e) {
    self.postMessage({ id: d.id, error: `${e.message} (${d.cmd}: ${String(e.stack || '').split('\n').slice(1, 3).join(' | ').trim()})` });
  }
};
