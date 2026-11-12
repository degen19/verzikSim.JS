// Web Worker: runs simulation work off the main thread. Loaded by pool.js and optimizer-ui.js with a relative URL.
//   {cmd: 'init', runId, cfgs, team}                     -> store the run's chart once
//   {cmd: 'chunk', runId, k, runs, seed}                  -> run chunk k of that run, post {runId, k, result}
//   {cmd: 'sim', cfgs, team, runs, seed}                  -> one-off run (kept for compatibility)
//   {cmd: 'batch', variants, team, from, to, seed, bps, idx?} -> optimizer counts for several setups (idx: just those raids)
//   {cmd: 'dawns', cfgs, team, from, to, seed}  -> the raids by the Dawn specs P1 died in
import { simulate } from './engine/simulate.js';
import { runChunk } from './engine/parallel.js';
import { countBatch, raidsByDawns } from './engine/optimize.js';

let job = null;                     // {runId, cfgs, team} for the current pooled run

self.onmessage = (ev) => {
  const d = ev.data;
  try {
    if (d.cmd === 'init') {
      job = { runId: d.runId, cfgs: d.cfgs, team: d.team };
    } else if (d.cmd === 'chunk') {
      if (!job || job.runId !== d.runId) throw new Error('worker got a chunk for a run it was not given');
      let last = 0;
      const result = runChunk(job.cfgs, job.team, d.k, d.runs, d.seed, (done) => {
        self.postMessage({ runId: d.runId, k: d.k, progress: done - last }); last = done;
      });
      self.postMessage({ runId: d.runId, k: d.k, progress: d.runs - last, result });
    } else if (d.cmd === 'batch') {
      const counts = countBatch(d.variants, d.team, d.from, d.to, d.seed, d.bps, (done) => self.postMessage({ progress: done }), d.idx || null);
      self.postMessage({ result: counts });
    } else if (d.cmd === 'dawns') {
      self.postMessage({ result: raidsByDawns(d.cfgs, d.team, d.from, d.to, d.seed) });
    } else {
      const result = simulate(d.cfgs, d.team, d.runs, d.seed, (done) => self.postMessage({ progress: done }));
      self.postMessage({ result });
    }
  } catch (e) {
    self.postMessage({ runId: d.runId, k: d.k, error: e.message });
  }
};
