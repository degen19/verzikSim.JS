// A progress bar with "% done" and an estimate of the time left, for the solvers, optimizers and reports.
// The time left is the time so far scaled by the share still to do (paused time doesn't count), so it's a straight-line
// estimate: exact for runs that do the same work per raid (reports), rougher for searches that can end early.
import { activeNow } from './engine/pause.js';

/** "about 40s left" / "about 3 min left" / "about 1 h 20 min left". */
export function timeLeft(ms) {
  if (!(ms > 0)) return 'almost done';
  const s = ms / 1000;
  if (s < 55) return `about ${Math.max(5, Math.round(s / 5) * 5)}s left`;
  const m = Math.round(s / 60);
  if (m < 60) return `about ${m} min left`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h >= 48) return `about ${Math.round(h / 24)} days left`;
  return `about ${h} h${mm ? ` ${mm} min` : ''} left`;
}

/** The bar for `el`: an existing `.bar` (its child is the fill) or any element - the bar then goes right after it.
 *  -> {start(label?), set(fraction), part(lo, hi) -> (fraction) => set, done(), stop(), hide()}. One bar per element. */
export function progressBar(el) {
  if (el.__pbar) return el.__pbar;
  let wrap, fill, txt;
  if (el.classList.contains('bar')) {
    wrap = document.createElement('div'); wrap.className = 'pbar';
    el.replaceWith(wrap); wrap.append(el); fill = el.firstElementChild || el.appendChild(document.createElement('div'));
  } else {
    wrap = document.createElement('div'); wrap.className = 'pbar';
    wrap.innerHTML = '<div class="bar"><div></div></div>'; fill = wrap.querySelector('.bar > div');
    el.after(wrap);
  }
  txt = document.createElement('span'); txt.className = 'ptxt'; wrap.append(txt);
  wrap.hidden = true;

  let t0 = 0, f = 0, total = null, timer = null, state = 'idle', label = '';
  const render = () => {
    fill.style.width = `${(f * 100).toFixed(1)}%`;
    const pct = state === 'done' ? 100 : Math.min(99, Math.floor(f * 100));
    let tail = '';
    if (state === 'run') { const left = total == null ? null : total - (activeNow() - t0); tail = left == null ? ' · working out the time left' : ` · ${timeLeft(left)}${label && left > 0 ? ' in this step' : ''}`; }
    else if (state === 'stopped') tail = ' · stopped';
    txt.textContent = `${label ? `${label}: ` : ''}${pct}%${tail}`;
  };
  const halt = () => { if (timer) clearInterval(timer); timer = null; };
  const api = {
    /** A new run (or a new step of one: label, e.g. "Step 2 of 3" - the bar and the time left are then the step's). */
    start(lab = '') { halt(); label = lab; t0 = activeNow(); f = 0; total = null; state = 'run'; wrap.hidden = false; render(); timer = setInterval(render, 1000); },
    /** fraction 0..1 of the whole job; never goes back. */
    set(x) {
      if (state !== 'run' || !(x >= 0)) return;
      x = Math.min(1, x); if (x < f) return; f = x;
      const el = activeNow() - t0;
      if (f >= 0.002 && el >= 3000) total = el / f;
      render();
    },
    /** A setter for a part of the job: its own 0..1 goes to lo..hi of the bar. */
    part(lo, hi) { return (x) => api.set(lo + (hi - lo) * Math.max(0, Math.min(1, x))); },
    done() { halt(); f = 1; state = 'done'; render(); },
    stop() { halt(); state = 'stopped'; render(); },
    hide() { halt(); state = 'idle'; wrap.hidden = true; },
  };
  el.__pbar = api;
  return api;
}
