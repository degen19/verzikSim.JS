// Web Worker: runs a share of the raids off the main thread.
//   {cmd: 'sim', cfgs, team, runs, seed}                  -> normal report run
//   {cmd: 'batch', variants, team, from, to, seed, bps}   -> optimizer counts for several setups
import { simulate } from './engine/simulate.js';
import { countBatch } from './engine/optimize.js';

self.onmessage = (ev) => {
  const d = ev.data;
  try {
    if (d.cmd === 'batch') {
      const counts = countBatch(d.variants, d.team, d.from, d.to, d.seed, d.bps, (done) => self.postMessage({ progress: done }));
      self.postMessage({ result: counts });
    } else {
      const result = simulate(d.cfgs, d.team, d.runs, d.seed, (done) => self.postMessage({ progress: done }));
      self.postMessage({ result });
    }
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
