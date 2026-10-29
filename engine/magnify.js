// Chart magnifier: a "Magnify" button above every report chart (svg.chart); while it's on, hovering (or dragging a finger
// on) the chart shows a round lens with that part of the chart enlarged. Mouse wheel over the chart: zoom level.
// Self-contained (no outside references) so report pages saved to a file can embed it: `(${installMagnifier})(document)`.
export function installMagnifier(doc) {
  if (doc.__magnifier) return;
  doc.__magnifier = true;
  const R = 130;                                       // lens radius (px)
  let zoom = 3, lens = null, cur = null, clone = null, last = null;
  const css = doc.createElement('style');
  css.textContent = `.mag-btn{display:inline-block;margin:0 0 4px;padding:3px 9px;font-size:12px;border-radius:6px;border:1px solid #2a78d6;background:transparent;color:#2a78d6;cursor:pointer}
.mag-btn.on{background:#2a78d6;color:#fff}svg.chart.mag-active{cursor:zoom-in;touch-action:none}
.mag-lens{position:fixed;width:${2 * R}px;height:${2 * R}px;border-radius:50%;overflow:hidden;pointer-events:none;border:2px solid #2a78d6;box-shadow:0 6px 22px rgba(0,0,0,.4);z-index:99999;display:none;padding:0!important;margin:0!important}
.mag-lens svg.chart{position:absolute;left:0;top:0;min-width:0!important;max-width:none!important;transform-origin:0 0}`;
  doc.head.appendChild(css);
  const add = (svg) => {
    if (svg.dataset.mag || svg.closest('.mag-lens')) return;
    svg.dataset.mag = '1';
    const b = doc.createElement('button');
    b.type = 'button'; b.className = 'mag-btn'; b.textContent = '\u{1F50D} Magnify';
    b.title = 'Hover the chart to zoom in; mouse wheel over it changes the zoom';
    svg.parentNode.insertBefore(b, svg);
    b.addEventListener('click', () => {
      const on = svg.classList.toggle('mag-active');
      b.classList.toggle('on', on); b.textContent = on ? '\u{1F50D} Magnifying - click to stop' : '\u{1F50D} Magnify';
      if (!on && lens) lens.style.display = 'none';
    });
  };
  const scan = (root) => { if (root.querySelectorAll) root.querySelectorAll('svg.chart').forEach(add); };
  scan(doc);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches && n.matches('svg.chart')) add(n); else scan(n);
  }))).observe(doc.body, { childList: true, subtree: true });
  const hide = () => { if (lens) lens.style.display = 'none'; cur = null; };
  const move = (x, y, target) => {
    const svg = target && target.closest ? target.closest('svg.chart.mag-active') : null;
    if (!svg) { hide(); return false; }
    if (!lens) { lens = doc.createElement('div'); lens.className = 'mag-lens vz-report'; doc.body.appendChild(lens); }
    if (cur !== svg) {
      cur = svg; lens.innerHTML = '';
      clone = svg.cloneNode(true); clone.classList.remove('mag-active'); clone.removeAttribute('data-mag');
      lens.appendChild(clone);
    }
    const r = svg.getBoundingClientRect();
    clone.style.width = `${r.width}px`; clone.style.height = `${r.height}px`;
    clone.style.transform = `translate(${R - (x - r.left) * zoom}px, ${R - (y - r.top) * zoom}px) scale(${zoom})`;
    lens.style.left = `${x - R}px`; lens.style.top = `${y - R}px`; lens.style.display = 'block';
    return true;
  };
  doc.addEventListener('mousemove', (e) => { last = [e.clientX, e.clientY, e.target]; move(e.clientX, e.clientY, e.target); });
  doc.addEventListener('scroll', hide, true);
  doc.addEventListener('wheel', (e) => {
    if (!e.target.closest || !e.target.closest('svg.chart.mag-active')) return;
    e.preventDefault();
    zoom = Math.max(1.5, Math.min(8, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (last) move(last[0], last[1], last[2]);
  }, { passive: false });
  doc.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (!t) return;
    const el = doc.elementFromPoint(t.clientX, t.clientY);
    if (move(t.clientX, t.clientY, el)) e.preventDefault();
  }, { passive: false });
  doc.addEventListener('touchend', hide);
}
