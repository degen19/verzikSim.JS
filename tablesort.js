// Click a column title in a results list (table.sortlist) to sort it best to worst; click again for worst to best; the
// "#" / Rank column puts the original order back. Best: times fastest first, % columns highest first, other numbers
// lowest first (a th data-better="high" / "low" overrides). Rows with class sub-row (a details row) stay with the row above.
const TIME = /^(\d+):(\d+(?:\.\d+)?)$/;
const valueOf = (td) => {
  const s = (td ? td.textContent : '').trim();
  let m = s.match(TIME); if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^-?\d+(?:\.\d+)?(?=%|s\b|$)/); if (m) return Number(m[0]);
  m = s.match(/^i(\d)$/); if (m) return Number(m[1]);
  return null;                                                    // '-', 'failed', 'wiped', text: always last
};
const higherBetter = (th) => {
  if (th.dataset.better) return th.dataset.better === 'high';
  const t = th.textContent.toLowerCase();
  if (/wip|fail|death/.test(t)) return false;
  return /%|or faster|or better|success|kills/.test(t);
};

export function installTableSort(doc) {
  const css = doc.createElement('style');
  css.textContent = 'table.sortlist tr:first-child th{cursor:pointer;user-select:none}table.sortlist tr:first-child th:hover{text-decoration:underline}';
  doc.head.appendChild(css);
  doc.addEventListener('click', (e) => {
    const th = e.target.closest && e.target.closest('table.sortlist tr:first-child th');
    if (!th || e.target.closest('button, input, select, a') || !th.closest('table').classList.contains('sortlist')) return;
    const table = th.closest('table'), head = th.parentElement, col = [...head.children].indexOf(th);
    if (!th.textContent.trim()) return;
    const body = head.parentElement;
    const rows = [...body.children].filter((r) => r !== head);
    const groups = [];                                            // [main row, ...its sub rows]
    for (const r of rows) {
      if (r.classList.contains('sub-row') && groups.length) groups[groups.length - 1].push(r);
      else { if (r.dataset.orig == null) r.dataset.orig = String(groups.length); groups.push([r]); }
    }
    const rank = /^(#|rank)$/i.test(th.textContent.trim().replace(/[▲▼]/g, '').trim());
    const flip = th.dataset.sorted === 'best';
    const sign = (higherBetter(th) ? -1 : 1) * (flip ? -1 : 1);
    groups.sort((a, b) => {
      if (rank) return (Number(a[0].dataset.orig) - Number(b[0].dataset.orig)) * (flip ? -1 : 1);
      const x = valueOf(a[0].children[col]), y = valueOf(b[0].children[col]);
      if (x == null && y == null) return Number(a[0].dataset.orig) - Number(b[0].dataset.orig);
      if (x == null) return 1; if (y == null) return -1;
      return (x - y) * sign || Number(a[0].dataset.orig) - Number(b[0].dataset.orig);
    });
    for (const g of groups) for (const r of g) body.appendChild(r);
    for (const h of head.children) { h.textContent = h.textContent.replace(/ [▲▼]$/, ''); if (h !== th) delete h.dataset.sorted; }
    th.dataset.sorted = flip ? 'worst' : 'best';
    th.textContent += flip ? ' ▲' : ' ▼';
    th.title = flip ? 'Worst to best - click for best to worst' : 'Best to worst - click for worst to best';
    table.dispatchEvent(new CustomEvent('sorted', { bubbles: true }));
  });
}
