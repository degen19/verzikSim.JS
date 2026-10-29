// Sub-tabs (Report / Optimizer / Solver) under a minimizable settings card, as on the Verzik tab. The open tab and what is
// minimized are remembered in this browser (per page: `key`).
const MIN_TITLE = 'Hide this section (a running report or search keeps going); click any tab to show it again';

/** The settings card: a title, a Minimize settings button, and the body (`inner` goes in [data-cfgbody]). */
export const settingsCard = (title, inner) => `<div class="settabs" data-settabs></div><div class="card" data-setcard><div class="row between"><h3 style="margin:0">${title}</h3>
  <button class="ghost sm" data-cfgmin title="Hide the settings - the Report, Optimizer and Solver still use them">Minimize settings</button></div>
  <div data-cfgbody style="margin-top:10px">${inner}</div></div>`;
/** The tab row: [[key, label], ...] + Minimize. */
export const tabsHtml = (tabs) => `<div class="tabs" data-subtabs>${tabs.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}<button class="tabmin" data-tabsmin title="${MIN_TITLE}">Minimize</button></div>`;
/** A tab's section (shown when its tab is picked). */
export const pane = (key, attrs, inner) => `<section class="card" data-pane="${key}" ${attrs} style="border-top-left-radius:0" hidden>${inner}</section>`;

export function wireSubtabs(host, key, { onShow } = {}) {
  let st = {};
  try { st = JSON.parse(localStorage.getItem(key)) || {}; } catch { st = {}; }
  const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch { /* storage off */ } };
  const tabs = host.querySelector('[data-subtabs]'), panes = [...host.querySelectorAll('[data-pane]')];
  const body = host.querySelector('[data-cfgbody]'), cfgBtn = host.querySelector('[data-cfgmin]'), minBtn = tabs.querySelector('[data-tabsmin]');
  const cur = () => (panes.some((p) => p.dataset.pane === st.tab) ? st.tab : panes[0].dataset.pane);
  const show = () => {
    const c = cur();
    for (const b of tabs.querySelectorAll('[data-t]')) b.classList.toggle('on', b.dataset.t === c);
    for (const p of panes) p.hidden = !!st.min || p.dataset.pane !== c;
    minBtn.textContent = st.min ? 'Show' : 'Minimize';
    if (body) { body.hidden = !!st.cfgMin; cfgBtn.textContent = st.cfgMin ? 'Show settings' : 'Minimize settings'; }
  };
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tabsmin != null) st.min = !st.min;
    else { st.tab = b.dataset.t; st.min = false; }                // picking a tab shows the section again
    save(); show(); if (onShow && !st.min) onShow(cur());
  });
  if (cfgBtn) cfgBtn.addEventListener('click', () => { st.cfgMin = !st.cfgMin; save(); show(); });
  show();
  return { show: (k) => { st.tab = k; st.min = false; save(); show(); } };
}
