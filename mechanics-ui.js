// "View mechanics & behavior": shows the chart template's Mechanics & behavior sheet on the page.
// Read straight from verzik_chart_template.xlsx, so it always matches the template.
import { readXlsx } from './engine/xlsx.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function loadMechanics() {
  const res = await fetch(new URL('./verzik_chart_template.xlsx', import.meta.url));
  if (!res.ok) throw new Error("Couldn't load the chart template from the site");
  const wb = await readXlsx(new Uint8Array(await res.arrayBuffer()));
  const ws = await wb.load('Mechanics & behavior');
  const v = (r, c) => { const x = ws.cell(r, c).value; return x == null ? '' : String(x).trim(); };
  const intro = [], sections = [];
  let header = null;
  for (let r = 2; r <= ws.max_row; r++) {
    const a = v(r, 1), b = v(r, 2), c = v(r, 3), d = v(r, 4);
    if (!a && !b && !c && !d) continue;
    if (!header) { if (a === 'Topic') header = r; else intro.push(a); continue; }
    if (a && !b && !c && !d) sections.push({ title: a, rows: [] });
    else if (sections.length) sections[sections.length - 1].rows.push({ topic: a, scales: b, what: c, input: d });
  }
  return { intro, sections };
}

export function createMechanics(details, body) {
  let data = null;
  async function render() {
    if (!data) {
      body.innerHTML = '<p class="muted">Loading...</p>';
      try { data = await loadMechanics(); } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
      body.innerHTML = `
        ${data.intro.map((t) => `<p class="muted small">${esc(t)}</p>`).join('')}
        <div class="row" style="margin:8px 0">
          <label>Search<input id="m-q" placeholder="e.g. brew, purple, horn" style="width:220px"></label>
          <label>Scale<select id="m-s"><option value="">All scales</option><option value="duo">Duo</option><option value="team">3-5 man</option></select></label>
        </div>
        <div class="row" style="margin:0 0 6px"><button class="ghost sm" id="m-all">Expand all</button><button class="ghost sm" id="m-none">Collapse all</button></div>
        <div id="m-list"></div>`;
      body.querySelector('#m-all').addEventListener('click', () => body.querySelectorAll('details.msec').forEach((d) => { d.open = true; }));
      body.querySelector('#m-none').addEventListener('click', () => body.querySelectorAll('details.msec').forEach((d) => { d.open = false; }));
      body.querySelector('#m-q').addEventListener('input', list);
      body.querySelector('#m-s').addEventListener('input', list);
    }
    list();
  }
  function list() {
    const q = body.querySelector('#m-q').value.trim().toLowerCase();
    const s = body.querySelector('#m-s').value;
    const scaleOk = (sc) => {
      const x = sc.toLowerCase();
      if (!s || x.includes('all')) return true;
      if (s === 'duo') return x.includes('duo') || x.includes('2');
      return x.includes('3') || x.includes('4') || x.includes('5');
    };
    const hit = (r) => !q || [r.topic, r.what, r.input].some((t) => t.toLowerCase().includes(q));
    const html = data.sections.map((sec) => {
      const rows = sec.rows.filter((r) => scaleOk(r.scales) && hit(r));
      if (!rows.length) return '';
      return `<details class="msec" ${q ? 'open' : ''}><summary>${esc(sec.title)} <span class="muted small">(${rows.length})</span></summary><div class="scroll"><table class="bt mech"><tr><th>Topic</th><th>Scales</th><th>What the sim does</th><th>Set on the chart</th></tr>${
        rows.map((r) => `<tr><td class="rl">${esc(r.topic)}</td><td>${esc(r.scales)}</td><td class="what">${esc(r.what)}</td><td class="inp">${esc(r.input)}</td></tr>`).join('')}</table></div></details>`;
    }).join('');
    body.querySelector('#m-list').innerHTML = html || '<p class="muted">Nothing matches.</p>';
  }
  details.addEventListener('toggle', () => { if (details.open) render(); });
}
