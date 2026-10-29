// Crop a report chart: press on the chart, drag across the time range you want and let go - the chart is redrawn for just
// that range (bigger bars, fresh time axis, breakpoint lines kept). Crop again to go further; Reset shows it all again.
// Works on charts in a .chartbox (report.js chartBox) while the page still holds their render function.
import { CHART_RENDER } from './engine/report.js';

export function installChartCrop(doc) {
  const css = doc.createElement('style');
  css.textContent = `.chartbox{position:relative}.crop-bar{display:flex;gap:8px;align-items:center;margin:0 0 4px;font-size:12px;color:var(--ink2,#666)}
.crop-reset{padding:3px 9px;font-size:12px;border-radius:6px;border:1px solid #2a78d6;background:transparent;color:#2a78d6;cursor:pointer}
.chartbox svg.chart:not(.mag-active){cursor:col-resize;touch-action:pan-y}
.crop-sel{position:absolute;background:rgba(42,120,214,.18);border-left:2px solid #2a78d6;border-right:2px solid #2a78d6;pointer-events:none}`;
  doc.head.appendChild(css);
  const bar = (box) => {
    let b = box.querySelector(':scope > .crop-bar');
    if (!b) {
      b = doc.createElement('div'); b.className = 'crop-bar';
      b.innerHTML = '<span class="crop-hint">Drag across the chart to crop it to that time range</span><button type="button" class="crop-reset" hidden>Reset crop</button>';
      box.prepend(b);
      b.querySelector('.crop-reset').addEventListener('click', () => redraw(box, null));
    }
    return b;
  };
  const scan = (root) => { if (root.querySelectorAll) root.querySelectorAll('.chartbox').forEach((box) => { if (CHART_RENDER.has(Number(box.dataset.chart))) bar(box); }); };
  scan(doc);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches && n.matches('.chartbox')) scan(n.parentNode); else scan(n); } })))
    .observe(doc.body, { childList: true, subtree: true });

  function redraw(box, range) {
    const render = CHART_RENDER.get(Number(box.dataset.chart)); if (!render) return;
    const old = box.querySelector('svg.chart'); if (!old) return;
    const tmp = doc.createElement('div'); tmp.innerHTML = render(range);
    const svg = tmp.querySelector('svg.chart'); if (!svg) return;
    old.replaceWith(svg);
    bar(box).querySelector('.crop-reset').hidden = !range;
  }
  /** Room time (seconds) at a client x over the chart. */
  const secAt = (svg, clientX) => {
    const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const x = (clientX - r.left) / r.width * vb.width;
    const lo = Number(svg.dataset.lo), hi = Number(svg.dataset.hi), x0 = Number(svg.dataset.x0), x1 = Number(svg.dataset.x1);
    return lo + (Math.max(x0, Math.min(x1, x)) - x0) / (x1 - x0) * (hi - lo);
  };
  let drag = null;
  doc.addEventListener('pointerdown', (e) => {
    const svg = e.target.closest && e.target.closest('.chartbox svg.chart');
    if (!svg || svg.classList.contains('mag-active') || e.button !== 0 || svg.dataset.lo == null) return;
    const box = svg.closest('.chartbox'); if (!CHART_RENDER.has(Number(box.dataset.chart))) return;
    const sel = doc.createElement('div'); sel.className = 'crop-sel'; box.appendChild(sel);
    drag = { svg, box, sel, x: e.clientX };
    place(e.clientX);
    e.preventDefault();
  });
  function place(cx) {
    const r = drag.svg.getBoundingClientRect(), b = drag.box.getBoundingClientRect();
    const a = Math.max(r.left, Math.min(drag.x, cx)), z = Math.min(r.right, Math.max(drag.x, cx));
    Object.assign(drag.sel.style, { left: `${a - b.left}px`, width: `${Math.max(0, z - a)}px`, top: `${r.top - b.top}px`, height: `${r.height}px` });
  }
  doc.addEventListener('pointermove', (e) => { if (drag) place(e.clientX); });
  const end = (e) => {
    if (!drag) return;
    const { svg, box, sel, x } = drag; drag = null; sel.remove();
    if (!e || Math.abs(e.clientX - x) < 8) return;                     // a click, not a drag
    const a = secAt(svg, Math.min(x, e.clientX)), z = secAt(svg, Math.max(x, e.clientX));
    if (z - a < 2) return;
    redraw(box, { lo: Math.floor(a), hi: Math.ceil(z) });
  };
  doc.addEventListener('pointerup', end);
  doc.addEventListener('pointercancel', () => end(null));
}
