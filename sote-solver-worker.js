// Web Worker for the Sotetseg Solver: plays a batch of setups on a range of raids (engine/sotesolve.js evalConfigs).
import { evalConfigs } from './engine/sotesolve.js';

self.onmessage = (ev) => {
  const { id, configs, base, team, from, to, seed, entry, opts } = ev.data;
  try { self.postMessage({ id, result: evalConfigs(configs, base, team, from, to, seed, entry, opts) }); }
  catch (e) { self.postMessage({ id, error: e && e.message ? e.message : String(e) }); }
};
