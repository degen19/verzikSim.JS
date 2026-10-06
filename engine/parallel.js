// Parallel run plan, shared by the browser pool (pool.js) and the command-line runner (cli/run.mjs).
//
// A run of N raids is split into fixed chunks of CHUNK raids. Chunk k always uses the random stream seeded by
// (run seed, k), so the merged result is identical whether the chunks run on 1 thread or 12, in any order.
// The raid logic itself is the unchanged simulate() from simulate.js.
import { simulate } from './simulate.js';

export const CHUNK = 2000;                 // raids per chunk (big enough that message overhead is negligible)
export const SINGLE_THREAD_BELOW = 4000;   // smaller runs aren't worth starting workers for
export const MAX_WORKERS = 32;

/**
 * Worker count for a machine: every logical core (the page itself is idle while workers run), capped at
 * MAX_WORKERS. ?threads=N on the page (or --threads N on the command line) overrides this.
 */
export function workerCount(cores) {
  const c = Math.max(1, Math.floor(Number(cores) || 4));
  return Math.min(c, MAX_WORKERS);
}

/** [{k, runs}] covering `runs` raids in CHUNK-sized pieces. */
export function planChunks(runs) {
  const out = [];
  for (let k = 0, done = 0; done < runs; k++) {
    const n = Math.min(CHUNK, runs - done);
    out.push({ k, runs: n });
    done += n;
  }
  return out;
}

/** Seed for chunk k of a run. Rng hashes the string into its state, so every chunk is an independent stream. */
export const chunkSeed = (seed, k) => `${seed}:${k}`;

/** Run one chunk with the unchanged simulator. */
export function runChunk(cfgs, team, k, runs, seed, onProgress = null) {
  return simulate(cfgs, team, runs, chunkSeed(seed, k), onProgress);
}

const append = (dst, src) => { for (let i = 0; i < src.length; i++) dst.push(src[i]); };

/**
 * Merge simulate() results (in chunk order). Loops instead of push(...arr), which overflows the call stack for
 * arrays of ~100k+ elements.
 */
export function mergeResults(parts) {
  parts = parts.filter(Boolean);
  const first = parts[0];
  const out = {
    ...first,
    total: [], p1: [], p2: [], p3: [], depth: [], p20: [], reds: [], runs: 0,
  };
  const listKeys = ['total', 'p1', 'p2', 'p3', 'depth', 'p20', 'reds'];
  if (first.duo) {
    out.duo = { ...first.duo, die_p1: 0, kill_ny: 0, kill_ng: 0, kill_ngl: 0, n2d: 0, runs: 0 };
    for (const k of ['sp1', 'sproc', 'sp2', 'sp3', 'dep1', 'dep2']) out.duo[k] = [];
    out.n2d = 0;
  } else {
    out.die_p1 = 0;
    out.splits = { sp1: [], sproc: [], sp2: [], sp3: [] };
  }
  for (const r of parts) {
    for (const k of listKeys) append(out[k], r[k]);
    out.runs += r.runs;
    if (out.duo) {
      for (const k of ['die_p1', 'kill_ny', 'kill_ng', 'kill_ngl', 'n2d', 'runs']) out.duo[k] += r.duo[k];
      for (const k of ['sp1', 'sproc', 'sp2', 'sp3', 'dep1', 'dep2']) if (r.duo[k]) append(out.duo[k], r.duo[k]);
      out.n2d += r.n2d;
    } else {
      out.die_p1 += r.die_p1;
      for (const k of ['sp1', 'sproc', 'sp2', 'sp3']) append(out.splits[k], r.splits[k]);
    }
  }
  out.succ = out.total.length / out.runs;
  return out;
}

/** Single-threaded run of the same chunk plan (fallback path, and the reference for parity tests). */
export function runChunksSequential(cfgs, team, runs, seed) {
  return mergeResults(planChunks(runs).map(({ k, runs: n }) => runChunk(cfgs, team, k, n, seed)));
}
