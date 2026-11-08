// The Pause / Resume buttons beside every Stop button (solvers, report builders, optimizers). One switch for the
// page (engine/pause.js): a Pause button is live while its Stop button is, Stop while paused also resumes (so the
// run can wind down), and the switch clears itself once no run is going.
import { isPaused, setPaused, onPause } from './engine/pause.js';

export function installPause() {
  const stopOf = (b) => b.previousElementSibling;
  const sync = () => {
    const btns = [...document.querySelectorAll('button[data-pause]')];
    const live = btns.filter((b) => { const s = stopOf(b); return s && !s.disabled; });
    if (isPaused() && !live.length) { setPaused(false); return; }   // nothing running: don't hold the next run
    for (const b of btns) {
      const on = live.includes(b);
      const txt = isPaused() && on ? 'Resume' : 'Pause';      // change only what differs: the observer below sees our edits too
      if (b.disabled !== !on) b.disabled = !on;
      if (b.textContent !== txt) b.textContent = txt;
      if (b.classList.contains('paused') !== (isPaused() && on)) b.classList.toggle('paused', isPaused() && on);
    }
  };
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-pause')) { setPaused(!isPaused()); return; }
    const n = b.nextElementSibling;
    if (isPaused() && n && n.hasAttribute && n.hasAttribute('data-pause')) setPaused(false);   // Stop while paused
  }, true);
  onPause(sync);
  // Stop buttons are switched on and off by each tab's own code: watch for that
  new MutationObserver(sync).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
  sync();
}
