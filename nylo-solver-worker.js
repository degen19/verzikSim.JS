// Web Worker for the Nylocas Solver: plays a batch of setups on a range of raids (engine/nylosolve.js evalNylo).
import { evalNylo } from './engine/nylosolve.js';

self.onmessage = (ev) => {
  const { id, configs, base, team, from, to, seed, opts } = ev.data;
  try { self.postMessage({ id, result: evalNylo(configs, base, team, from, to, seed, opts) }); }
  catch (e) { self.postMessage({ id, error: e && e.message ? e.message : String(e) }); }
};
