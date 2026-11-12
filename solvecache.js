// Saved room solves (Full raid solver): a solve is kept in this browser (IndexedDB), keyed by every input it had, and
// reused when a run asks for exactly the same solve again - a rerun after a reload, a stop or a small change elsewhere.
// The key includes a fingerprint of the code that plays and solves the rooms (the files below and the chart template),
// so any change to the sim or the solvers starts afresh. Keep CODE_FILES in step with the files the room solves use.

const DB = 'verzikSim.solves', STORE = 'solves', MAX = 3000;
export const CODE_FILES = [
  'engine/chartform.js', 'engine/duo_reds.js', 'engine/expdmg.js', 'engine/fullraid.js', 'engine/gear.js', 'engine/gearstore.js', 'engine/horn.js',
  'engine/loadout.js', 'engine/magnify.js', 'engine/nylo.js', 'engine/nylosolve.js', 'engine/optimize.js', 'engine/p2.js', 'engine/p3.js',
  'engine/parallel.js', 'engine/planner.js', 'engine/reds.js', 'engine/report.js', 'engine/rng.js', 'engine/roomsolver.js', 'engine/sim.js',
  'engine/simulate.js', 'engine/solvecheck.js', 'engine/solver.js', 'engine/sote.js', 'engine/sotemaze.js', 'engine/soteplan.js',
  'engine/sotereport.js', 'engine/sotesolve.js', 'engine/supplies.js', 'engine/symmetry.js', 'engine/tome.js', 'engine/util.js',
  'engine/version.js', 'engine/vtree.js', 'engine/xarpus.js', 'engine/xarpusreport.js', 'engine/xarpussolve.js', 'engine/xlsx.js',
  'nylo-ui.js', 'sote-ui.js', 'xarpus-ui.js', 'solver-ui.js', 'fullraid-ui.js', 'fullraid-pool.js', 'fullraid-worker.js',
  'nylo-solver-pool.js', 'nylo-solver-worker.js', 'sote-solver-pool.js', 'sote-solver-worker.js', 'xarpus-solver-pool.js',
  'xarpus-solver-worker.js', 'solver-pool.js', 'solver-worker.js', 'pool.js', 'worker.js', 'verzik_chart_template.xlsx',
];

/** A short hash of a string (two FNV-1a 32-bit halves). */
export function hashOf(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

let codeP = null;
/** The code's fingerprint (once per page): null when the files can't be read - then nothing is saved or reused. */
export function codeFingerprint() {
  codeP ||= Promise.all(CODE_FILES.map((f) => fetch(f, { cache: 'no-cache' }).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(f))))
    .then((buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 4096) s += String.fromCharCode(...u.subarray(i, i + 4096)); return `${f}:${hashOf(s)}`; })))
    .then((xs) => hashOf(xs.join('|'))).catch(() => null);
  return codeP;
}

let dbP = null;
const db = () => (dbP ||= new Promise((res) => {
  try {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('at', 'at'); };
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  } catch { res(null); }
}));
const tx = async (mode, f) => { const d = await db(); if (!d) return null; return new Promise((res) => { try { const t = d.transaction(STORE, mode), s = t.objectStore(STORE), q = f(s); t.oncomplete = () => res(q && 'result' in q ? q.result : null); t.onerror = () => res(null); t.onabort = () => res(null); } catch { res(null); } }); };

/** A saved solve for this exact key (a string of every input), else null. */
export async function getSolve(key) {
  const row = await tx('readonly', (s) => s.get(hashOf(key)));
  return row && row.key === key ? row.value : null;
}
/** Save a solve (the oldest go once there are more than MAX). */
export async function putSolve(key, value) {
  await tx('readwrite', (s) => s.put({ id: hashOf(key), key, value, at: Date.now() }));
  const n = await tx('readonly', (s) => s.count());
  if (n > MAX) await tx('readwrite', (s) => { const c = s.index('at').openCursor(); let left = n - MAX; c.onsuccess = () => { const cur = c.result; if (cur && left-- > 0) { cur.delete(); cur.continue(); } }; return null; });
}
/** How many solves are saved. */
export const countSolves = async () => (await tx('readonly', (s) => s.count())) || 0;
/** Forget every saved solve. */
export const clearSolves = () => tx('readwrite', (s) => s.clear());
