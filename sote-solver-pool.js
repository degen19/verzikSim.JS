// Worker pool for the Sotetseg Solver: a batch of setups is split across the workers (by setup, or by raid range when
// there are fewer setups than workers) and put back together in order, so every core works on every batch. Without
// Web Workers it runs the same code on the page.
import { evalConfigs } from './engine/sotesolve.js';
import { threadCount, workersAvailable } from './pool.js';

const WORKER_URL = new URL('./sote-solver-worker.js', import.meta.url);

export class SotePool {
  constructor(base, team, opts, threads = threadCount()) {
    Object.assign(this, { base, team, opts, n: Math.max(1, threads), workers: [], idle: [], queue: [], jobs: new Map(), seq: 0, stopped: false });
    this.local = !workersAvailable();
    if (!this.local) {
      try { for (let i = 0; i < this.n; i++) this.add(); } catch { this.local = true; }
    }
  }
  add() {
    const w = new Worker(WORKER_URL, { type: 'module' });
    w.onmessage = (ev) => {
      const { id, result, error } = ev.data, job = this.jobs.get(id);
      this.jobs.delete(id); this.idle.push(w); this.pump();
      if (job) { if (error) job.reject(new Error(error)); else job.resolve(result); }
    };
    w.onerror = (ev) => { for (const j of this.jobs.values()) j.reject(new Error(ev.message || 'A solver worker failed')); this.jobs.clear(); };
    this.workers.push(w); this.idle.push(w);
  }
  task(msg) {
    if (this.stopped) return Promise.reject(new Error('Solver stopped.'));
    return new Promise((resolve, reject) => { this.queue.push({ msg, resolve, reject }); this.pump(); });
  }
  pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.shift(), t = this.queue.shift(), id = ++this.seq;
      this.jobs.set(id, t); w.postMessage({ ...t.msg, id });
    }
  }
  /** Play `configs` on raids [from, to) entered on `entry`: [{totals, split}] in order. */
  async run(configs, from, to, seed, entry) {
    const common = { base: this.base, team: this.team, seed, entry, opts: this.opts };
    if (this.local) { await new Promise((r) => setTimeout(r, 0)); return evalConfigs(configs, this.base, this.team, from, to, seed, entry, this.opts); }
    if (configs.length >= this.n) {                                  // by setup
      const per = Math.ceil(configs.length / this.n), parts = [];
      for (let i = 0; i < configs.length; i += per) parts.push(this.task({ ...common, configs: configs.slice(i, i + per), from, to }));
      return (await Promise.all(parts)).flat();
    }
    const per = Math.ceil((to - from) / this.n), parts = [];            // by raid range
    for (let a = from; a < to; a += per) parts.push(this.task({ ...common, configs, from: a, to: Math.min(to, a + per) }));
    const res = await Promise.all(parts);
    return configs.map((_, i) => {
      const out = { totals: [], split: { p1: [], maze1: [], p2: [], maze2: [], p3: [] } };
      for (const r of res) { out.totals.push(...r[i].totals); for (const k of Object.keys(out.split)) out.split[k].push(...r[i].split[k]); }
      return out;
    });
  }
  stop() { this.stopped = true; for (const w of this.workers) w.terminate(); for (const j of this.jobs.values()) j.reject(new Error('Solver stopped.')); this.jobs.clear(); this.queue = []; }
}
