// Web Worker for the solo Verzik Solver: plays a batch of setups on a range of raids (engine/solosolve.js evalSolo).
import { evalSolo } from './engine/solosolve.js';

self.onmessage = (ev) => {
  const { id, configs, base, from, to, seed } = ev.data;
  try { self.postMessage({ id, result: evalSolo(configs, base, from, to, seed) }); }
  catch (e) { self.postMessage({ id, error: e && e.message ? e.message : String(e) }); }
};
