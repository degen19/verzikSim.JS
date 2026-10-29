// Optimizer / Solver over several sets (A / B / C): pick the sets to run, then show each set's results in its own
// collapsible section (in the set's colour), or every set's results in one ranked list (top 10).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const SETS = ['A', 'B', 'C'];

/** The sets to run, as checkboxes (data-runset="A"). has(k): the set exists; chosen: [keys]; label(k). */
export function setPicker(has, chosen, label) {
  return `<div><div class="muted small">Sets to run (same raids for each)</div><div class="row" style="gap:10px">${SETS.map((k) => `<label class="pick" style="flex-direction:row;gap:4px;align-items:center" data-setcol="${k}" title="${has(k) ? '' : 'Empty set'}"><input type="checkbox" data-runset="${k}" ${has(k) ? '' : 'disabled'} ${has(k) && chosen.includes(k) ? 'checked' : ''}>${esc(label(k))}</label>`).join('')}</div></div>`;
}
/** The chosen sets after a data-runset checkbox changed. */
export const pickSets = (chosen, el) => SETS.filter((x) => (x === el.dataset.runset ? el.checked : chosen.includes(x)));

/**
 * groups: [{k, label, items: [...]}] (items best first). table(items, withSet) -> html. better(a, b): a ranks above b.
 * open: {k: false} for sections the viewer collapsed. Returns the results html (data-combine toggle when several sets).
 */
export function setResultsHtml(groups, { combine, table, better, open = {}, top = 10 }) {
  groups = groups.filter((g) => g.items.length);
  if (!groups.length) return '';
  const multi = groups.length > 1;
  const toggle = multi ? `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-combine ${combine ? 'checked' : ''}>Combine into one ranked list (top ${top})</label>` : '';
  if (multi && combine) {
    const all = groups.flatMap((g) => g.items);
    all.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
    return `<div class="row" style="margin-bottom:6px">${toggle}</div><h4 style="margin:4px 0">All sets, one ranking</h4>${table(all.slice(0, top), true)}`;
  }
  return `${toggle ? `<div class="row" style="margin-bottom:6px">${toggle}</div>` : ''}${groups.map((g) => multi
    ? `<details class="setres" data-setcol="${g.k}" data-resset="${g.k}" ${open[g.k] === false ? '' : 'open'}><summary><b>${esc(g.label)}</b> <span class="muted small">(${g.items.length} result${g.items.length === 1 ? '' : 's'})</span></summary>${table(g.items, false)}</details>`
    : table(g.items, false)).join('')}`;
}

/** Remember which sections the viewer collapsed (details toggle) in `open`. */
export function wireSetResults(el, open, rerender) {
  el.addEventListener('toggle', (e) => { const d = e.target; if (d.dataset && d.dataset.resset) open[d.dataset.resset] = d.open; }, true);
  el.addEventListener('change', (e) => { if (e.target.dataset.combine != null) rerender(e.target.checked); });
}
