// Browser worker pool for report runs: reusable Web Workers, a chunk queue, progress, Stop, and a
// single-thread fallback. Results are identical for a given seed whatever the thread count (see engine/parallel.js).
import { planChunks, runChunk, mergeResults, workerCount, SINGLE_THREAD_BELOW } from './engine/parallel.js';

const WORKER_URL = new URL('./worker.js', import.meta.url);   // relative: works under the GitHub Pages repo path

/** Thread count: ?threads=N in the page URL overrides (for testing / benchmarking), else workerCount(cores). */
export function threadCount() {
  const q = Number(new URLSearchParams(location.search).get('threads'));
  if (Number.isFinite(q) && q >= 1) return Math.min(Math.floor(q), 64);
  return workerCount(navigator.hardwareConcurrency);
}
export const workersAvailable = () => typeof Worker !== 'undefined';

export class SimPool {
  constructor() { this.workers = []; this.runSeq = 0; this.active = null; }

  /** Start (or keep) n module workers. Throws if the browser can't create them. */
  ensure(n) {
    while (this.workers.length < n) this.workers.push(new Worker(WORKER_URL, { type: 'module' }));
    while (this.workers.length > n) this.workers.pop().terminate();
  }

  /** Stop the current run: kill the workers (they're recreated on the next run). */
  stop() {
    if (this.active) this.active.cancel();
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
  }

  /**
   * Run `runs` raids of one chart. Resolves with the merged result.
   * opts: {onProgress(fractionDone), threads}. Reports {threads, mode} via the returned info object.
   */
  run(cfgs, team, runs, seed, { onProgress = null, threads = threadCount() } = {}) {
    const chunks = planChunks(runs);
    const why = !workersAvailable() ? 'no Web Workers in this browser' : threads <= 1 ? '1 thread selected'
      : runs < SINGLE_THREAD_BELOW ? `small run (under ${SINGLE_THREAD_BELOW.toLocaleString()} raids)` : null;
    if (!why) {
      try { this.ensure(Math.min(threads, chunks.length)); } catch { return this.runMain(cfgs, team, runs, seed, chunks, onProgress, "workers couldn't start"); }
      return this.runWorkers(cfgs, team, runs, seed, chunks, onProgress);
    }
    return this.runMain(cfgs, team, runs, seed, chunks, onProgress, why);
  }

  runWorkers(cfgs, team, runs, seed, chunks, onProgress) {
    const runId = ++this.runSeq;
    const results = new Array(chunks.length);
    const queue = chunks.slice();
    let done = 0, finished = 0, settled = false;
    return Object.assign(new Promise((resolve, reject) => {
      const fail = (err) => { if (settled) return; settled = true; this.active = null; this.stop(); reject(err); };
      this.active = { cancel: () => fail(new Error('Run stopped.')) };
      const feed = (w) => {
        const c = queue.shift();
        if (c) w.postMessage({ cmd: 'chunk', runId, k: c.k, runs: c.runs, seed });
      };
      for (const w of this.workers) {
        w.onmessage = (ev) => {
          const d = ev.data;
          if (settled || d.runId !== runId) return;
          if (d.error) { fail(new Error(d.error)); return; }
          if (d.progress) { done += d.progress; onProgress && onProgress(done / runs); }
          if (d.result) {
            results[d.k] = d.result;
            if (++finished === chunks.length) {
              settled = true; this.active = null;
              resolve(mergeResults(results));                 // chunk order -> same result for any thread count
            } else feed(w);
          }
        };
        w.onerror = (ev) => fail(new Error(ev.message || 'A worker failed to load'));
        w.postMessage({ cmd: 'init', runId, cfgs, team });    // the chart goes over once per worker per run
        feed(w);
      }
    }), { info: { threads: this.workers.length, mode: `${this.workers.length} Web Worker${this.workers.length === 1 ? '' : 's'}` } });
  }

  /** Main-thread fallback: same chunks, yielding between them so the page stays responsive and Stop works. */
  runMain(cfgs, team, runs, seed, chunks, onProgress, why) {
    let cancelled = false;
    this.active = { cancel: () => { cancelled = true; } };
    const p = (async () => {
      const results = [];
      let done = 0;
      for (const c of chunks) {
        if (cancelled) throw new Error('Run stopped.');
        results.push(runChunk(cfgs, team, c.k, c.runs, seed));
        done += c.runs; onProgress && onProgress(done / runs);
        await new Promise((r) => setTimeout(r, 0));
      }
      this.active = null;
      return mergeResults(results);
    })();
    return Object.assign(p, { info: { threads: 1, mode: `main thread - ${why}` } });
  }
}
