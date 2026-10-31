// Verzik: a setup's settings table (Lightbearer, ring swaps, death charges, horns, shadow, Boak sides ...) and its P1
// chart grid - shown for a result by the Verz Solver and the Optimizer.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = (t) => `${Math.floor(t * 0.6 / 60)}:${(t * 0.6 % 60).toFixed(1).padStart(4, '0')}`;
export const CODE_BG = { S: '#8fd18f', D: '#c9b6e4', A: '#fff2a8', C: '#f8cbad', H: '#f4b183', E: '#b4c7e7', SB: '#ffd966', B: '#d9a6e0',
  T: '#8eb4e3', P: '#ff66cc', R: '#ffffff', X: '#595959' };

/** cf: the setup's players (configs); nm: player names; team; avg: average room time (ticks, or null); p1Median:
 *  P1's median kill tick (or null - the grid then runs to the last charted tick). */
export function verzSetupHtml(cf, nm, team, { avg = null, p1Median = null } = {}) {
  const who = (key) => nm[cf.findIndex((c) => c[key])] ?? '-';
  const horns = cf.map((c, k) => (c.horn && (c.hornP2 || c.hornP3) ? `${nm[k]} (${[c.hornP2 ? 'P2' : '', c.hornP3 ? 'P3' : ''].filter(Boolean).join(' + ')})` : null)).filter(Boolean);
  const byDawns = (c) => (c.ringByDawns ? ` (${Object.keys(c.ringByDawns).map(Number).sort((a, b) => b - a).map((d) => `${d} Dawns: ${c.ringByDawns[d]}`).join(', ')})` : '');
  const rows = [
    ['Lightbearer', cf.map((c, k) => (c.lightbearerOn ? nm[k] : null)).filter(Boolean).join(', ') || 'none'],
    ['Ring swap %', cf.map((c, k) => (c.lightbearerOn ? `${nm[k]} ${c.ringSwitch ?? 'default'}${byDawns(c)}` : null)).filter(Boolean).join(', ') || '-'],
    [team === 2 ? '1st purple DC' : 'Purple DC (every purple)', who('PurpleDC')],
    ['Reds DCs', `West ${cf.filter((c) => c.WestDC).map((c) => nm[cf.indexOf(c)]).join(' + ') || '-'}, East ${cf.filter((c) => c.EastDC).map((c) => nm[cf.indexOf(c)]).join(' + ') || '-'}`],
    ...(team === 2 ? [
      ['2nd purple DC', cf.find((c) => c.Purple2DC) ? who('Purple2DC') : `${who('PurpleDC')} (both purples)`],
      ['Shadow mode', (() => { const m = cf.find((c) => c.shadow); return m ? [m.shadowCamp && 'Shadow camp', m.shadowLB && 'Shadow while LB', m.shadow31 && '3:1'].filter(Boolean).join(' + ') || 'Shadow' : '-'; })()],
      ['P2 last-hit threshold', `${cf[0].lastHitThr ?? '-'}%`],
    ] : [['Horns', horns.join(', ') || 'none']]),
    ['Dawn threshold', cf[0].dawnThr ? `${cf[0].dawnThr}%` : 'never'],
    ...(team === 2 ? [] : [['Shadow', cf.map((c, k) => (c.shadow ? `${nm[k]}${[c.shadow31 && '3:1', c.shadowLB && 'while LB', c.deepProc && 'deep proc'].filter(Boolean).map((x) => ` (${x})`).join('')}` : null)).filter(Boolean).join(', ') || 'nobody']]),
    ['Blowpipes', cf.map((c, k) => (c.hasBP !== false ? nm[k] : null)).filter(Boolean).join(', ') || 'nobody'],
    ...(team === 2 ? [] : [['Boak sides', `West: ${cf.map((c, k) => (c.westBoak ? nm[k] : null)).filter(Boolean).join(', ') || '-'} | East: ${cf.map((c, k) => (c.eastBoak ? `${nm[k]} (${c.eastPattern || 'A'})` : null)).filter(Boolean).join(', ') || '-'}`]]),
    ...(team === 2 ? [] : [['East bounce tech', cf[0].eastBounce ? `${cf[0].eastBounce} (East: ${cf.map((c, k) => (c.eastBoak ? nm[k] : null)).filter(Boolean).join(', ') || 'nobody'})` : 'off']]),
    ['Start spec', cf.map((c, k) => `${nm[k]} ${c.startSpec}%`).join(', ')],
    ...(avg != null ? [['Average room time', fmtT(avg)]] : []),
  ];
  const cap = team === 2 ? 150 : 70;
  const end = Math.min(cap, Math.max(...cf.map((c) => Math.max(0, ...Object.keys(c.actions || {}).map(Number)))), p1Median != null ? p1Median + 2 : cap);
  const grid = `<div class="scroll"><table class="bt grid"><tr><th></th><th>Start</th>${Array.from({ length: end }, (_, t) => `<th>${t + 1}</th>`).join('')}</tr>${
    cf.map((c, k) => `<tr><td class="rl">${esc(nm[k])}</td><td>${c.startSpec}%</td>${Array.from({ length: end }, (_, t) => {
      const a = (c.actions || {})[t + 1] || '';
      const bg = a.startsWith('ST>') ? '#33cc33' : CODE_BG[a];
      return `<td style="${bg ? `background:${bg};color:${a === 'X' ? '#fff' : '#000'};font-weight:700` : ''}">${esc(a)}</td>`;
    }).join('')}</tr>`).join('')}</table></div>`;
  return `<table class="bt"><tbody>${rows.map(([a, b]) => `<tr><td class="rl">${esc(a)}</td><td style="text-align:left;white-space:normal">${esc(b)}</td></tr>`).join('')}</tbody></table>
      <h4>P1 chart</h4>${grid}`;
}
