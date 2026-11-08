// Pause / resume for long runs (solvers, report builders, optimizers). One switch for the whole page: while paused,
// the worker pools hand out no new pieces of work and the on-page loops wait at their next yield - the pieces
// already running finish, then the CPU goes idle. Nothing is thrown away: every run keeps its own inputs and
// progress in memory and carries on from the same spot on resume. No DOM here (the engine imports it too).

let paused = false, since = 0, pausedTotal = 0;
const waiters = new Set(), subs = new Set();

export const isPaused = () => paused;

export function setPaused(on) {
  on = !!on;
  if (on === paused) return;
  paused = on;
  if (on) since = Date.now();
  else {
    pausedTotal += Date.now() - since;
    const w = [...waiters]; waiters.clear(); w.forEach((f) => f());
  }
  subs.forEach((f) => { try { f(paused); } catch { /* a listener's problem */ } });
}

/** Resolves at once when running, else on resume. */
export const whenRunning = () => (paused ? new Promise((r) => waiters.add(r)) : Promise.resolve());

/** The yield the on-page loops use between pieces: lets the page breathe, then waits out a pause. */
export async function breath() {
  await new Promise((r) => setTimeout(r, 0));
  while (paused) await whenRunning();
}

/** Run `fn` now, or on resume when paused (the worker pools' dispatch). */
export function whenFree(fn) { if (paused) whenRunning().then(fn); else fn(); }

/** Listen for pause changes: f(paused). Returns an unsubscribe. */
export function onPause(f) { subs.add(f); return () => subs.delete(f); }

/** A clock that stops while paused (ms) - for "Done in ..." / elapsed timers. */
export const activeNow = () => Date.now() - pausedTotal - (paused ? Date.now() - since : 0);
