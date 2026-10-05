// Web Worker: runs a share of the raids off the main thread.
import { simulate } from './engine/simulate.js';

self.onmessage = (ev) => {
  const { cfgs, team, runs, seed } = ev.data;
  try {
    const result = simulate(cfgs, team, runs, seed, (done) => self.postMessage({ progress: done }));
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
