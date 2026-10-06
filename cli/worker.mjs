// Node worker thread: same protocol as the browser worker - store the chart once, then run chunks on request.
import { parentPort } from 'node:worker_threads';
import { runChunk } from '../engine/parallel.js';

let job = null;
parentPort.on('message', (d) => {
  try {
    if (d.cmd === 'init') job = d;
    else if (d.cmd === 'chunk') parentPort.postMessage({ k: d.k, result: runChunk(job.cfgs, job.team, d.k, d.runs, d.seed) });
  } catch (e) {
    parentPort.postMessage({ k: d.k, error: e.message });
  }
});
