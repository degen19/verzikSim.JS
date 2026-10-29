// Web Worker for the Xarpus Solver: plays a batch of setups on a range of raids (engine/xarpussolve.js evalXarpus).
import { evalXarpus } from './engine/xarpussolve.js';

self.onmessage = (ev) => {
  const { id, configs, base, team, from, to, seed, opts } = ev.data;
  try { self.postMessage({ id, result: evalXarpus(configs, base, team, from, to, seed, opts) }); }
  catch (e) { self.postMessage({ id, error: e && e.message ? e.message : String(e) }); }
};
