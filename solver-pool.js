// Worker pool for the Verz Solver tab: the evaluator the room search runs on in the browser.
// Each batch of setups is split into raid ranges, one per worker, so every core works on every batch; ranges are put
// back together in raid order (mergeCounts), so the answer is the same for any number of workers. Without Web Workers
// it falls back to the same code on the page itself.
import { mergeCounts, localEvaluator } from './engine/roomsolver.js';
import { threadCount, workersAvailable } from './pool.js';

const WORKER_URL = new URL('./solver-worker.js', import.meta.url);

export class SolverPool {
  constructor(threads = threadCount()) {
    this.n = Math.max(1, threads);
    this.workers = []; this.idle = []; this.queue = []; this.jobs = new Map(); this.seq = 0; this.stopped = false;
    this.local = !workersAvailable();
    if (!this.local) {
      try { for (let i = 0; i < this.n; i++) this.add(); } catch { this.local = true; this.workers = []; this.idle = []; }
    }
  }
  add() {
    const w = new Worker(WORKER_URL, { type: 'module' });
    w.onmessage = (ev) => {
      const { id, result, error } = ev.data, job = this.jobs.get(id);
      this.jobs.delete(id);
      this.idle.push(w); this.pump();
      if (!job) return;
      if (error) job.reject(new Error(error)); else job.resolve(result);
    };
    w.onerror = (ev) => { this.fail(new Error(ev.message || 'A solver worker failed to load')); };
    this.workers.push(w); this.idle.push(w);
  }
  /** One message to the next free worker. */
  task(msg) {
    if (this.stopped) return Promise.reject(new Error('Solver stopped.'));
    return new Promise((resolve, reject) => { this.queue.push({ msg, resolve, reject }); this.pump(); });
  }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift(), t = this.queue.shift(), id = ++this.seq;
      this.jobs.set(id, t);
      w.postMessage({ ...t.msg, id });
    }
  }
  fail(err) {
    for (const j of this.jobs.values()) j.reject(err);
    for (const t of this.queue) t.reject(err);
    this.jobs.clear(); this.queue = [];
  }
  stop() {
    this.stopped = true;
    this.fail(new Error('Solver stopped.'));
    this.workers.forEach((w) => w.terminate());
    this.workers = []; this.idle = [];
  }

  // ---- the evaluator interface solveRoom uses (same calls as localEvaluator)
  async eval(kind, list, team, n, seed, bps) {
    if (this.local) return localEvaluator.eval(kind, list, team, n, seed, bps);
    const parts = Math.max(1, Math.min(this.n, Math.ceil(n / 40)));      // ranges of at least ~40 raids
    const ranges = Array.from({ length: parts }, (_, i) => [Math.floor(n * i / parts), Math.floor(n * (i + 1) / parts)]);
    const res = await Promise.all(ranges.map(([from, to]) => this.task({ cmd: 'eval', kind, list, team, from, to, seed, bps })));
    return list.map((_, v) => mergeCounts(res.map((r) => r[v])));
  }
  async p1(base, team, lb, opts) {
    if (this.local) return localEvaluator.p1(base, team, lb, opts);
    return this.task({ cmd: 'p1', base, team, lb, opts });
  }
  async edits(cfg, team, plans, opts) {
    if (this.local) return localEvaluator.edits(cfg, team, plans, opts);
    const parts = await Promise.all(plans.map((p) => this.task({ cmd: 'edits', cfg, team, plans: [p], opts })));   // one plan per worker
    return parts.flat();
  }
  async p1sim(list, team, runs, seed) {
    if (this.local) return localEvaluator.p1sim(list, team, runs, seed);
    return Promise.all(list.map((cfgs) => this.task({ cmd: 'p1sim', list: [cfgs], team, runs, seed }).then((r) => r[0])));
  }
}
