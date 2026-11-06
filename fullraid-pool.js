// Worker pool for the Full raid solver: combinations split across the workers by raid range (every core on every
// combination) and put back together in order. Without Web Workers it runs the same code on the page.
import { evalFull, evalRooms, roomReport, mergeReports, fullRaidReports } from './engine/fullraid.js';
import { threadCount, workersAvailable } from './pool.js';

const WORKER_URL = new URL('./fullraid-worker.js', import.meta.url);

export class FullRaidPool {
  constructor(ctx, threads = threadCount()) {
    Object.assign(this, { ctx, n: Math.max(1, threads), workers: [], idle: [], queue: [], jobs: new Map(), seq: 0, stopped: false });
    this.local = !workersAvailable();
    if (!this.local) { try { for (let i = 0; i < this.n; i++) this.add(); } catch { this.local = true; } }
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
  /** Play `combos` on raids [from, to): [{totals, ends}] in order. */
  async run(combos, from, to, seed) {
    if (this.local) { await new Promise((r) => setTimeout(r, 0)); return evalFull(combos, this.ctx, from, to, seed); }
    const chunk = Math.max(25, Math.ceil((to - from) / this.n)), parts = [];
    for (let a = from; a < to; a += chunk) parts.push(this.task({ combos, ctx: this.ctx, from: a, to: Math.min(to, a + chunk), seed }));
    const res = await Promise.all(parts);
    return combos.map((_, i) => {
      const out = { totals: [], ends: res[0][i].ends.map(() => []), p3: [] };
      for (const r of res) { out.totals.push(...r[i].totals); r[i].ends.forEach((e, j) => out.ends[j].push(...e)); out.p3.push(...r[i].p3); }
      return out;
    });
  }
  /** Room variants ([{kind, setup, cd}]) on raids [from, to): [{ends}] in order - split across the workers by variant. */
  async runRooms(items, from, to, seed) {
    if (this.local) { await new Promise((r) => setTimeout(r, 0)); return evalRooms(items, this.ctx.team, from, to, seed); }
    const per = Math.max(1, Math.ceil(items.length / (this.n * 3))), parts = [];
    for (let i = 0; i < items.length; i += per) parts.push(this.task({ rooms: items.slice(i, i + per), ctx: this.ctx, from, to, seed }));
    return (await Promise.all(parts)).flat();
  }
  /** Raid ranges [from, to) in chunks of `size` across the workers; onProgress(raids done). */
  async chunks(msg, run, from, to, seed, size, onProgress) {
    const parts = []; let done = 0;
    for (let a = from; a < to; a += size) {
      const b = Math.min(to, a + size);
      parts.push((this.local ? (async () => { await new Promise((r) => setTimeout(r, 0)); return run(a, b); })() : this.task({ ...msg, from: a, to: b, seed }))
        .then((x) => { done += b - a; if (onProgress) onProgress(done); return x; }));
    }
    return Promise.all(parts);
  }
  /** A room's Run report ({room, players, opts, team}) on raids [from, to). */
  async report(report, from, to, seed, onProgress) {
    return mergeReports(await this.chunks({ report }, (a, b) => roomReport({ ...report, from: a, to: b, seed }), from, to, seed, 500, onProgress));
  }
  /** What each player comes into each room with, over whole raids [from, to) of one combination. */
  async entries(setup, from, to, seed, onProgress) {
    const parts = await this.chunks({ entries: setup, ctx: this.ctx }, (a, b) => fullRaidReports(setup, this.ctx, a, b, seed).entry, from, to, seed, 100, onProgress);
    return parts[0].map((_, j) => parts.flatMap((x) => x[j]));
  }
  stop() { this.stopped = true; for (const w of this.workers) w.terminate(); for (const j of this.jobs.values()) j.reject(new Error('Solver stopped.')); this.jobs.clear(); this.queue = []; }
}
