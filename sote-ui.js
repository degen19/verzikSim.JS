// Sotetseg tab: per-player room settings for 2-5 man (the Sotetseg sim comes next). Saved in this browser.
// Gear comes from the Gear tab (the Gear set picked here); the prefire choices need the weapon in that Gear set.
import { loadGear, gearSet, playersOf, GEAR_SETS } from './engine/gearstore.js';

const STORE = 'verzikSim.sote.v1';             // {team: {gearSet, players: [{startSpec, pnecks, sharks, prefire}]}}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off: kept for this page */ } };

/** Prefire choices: [value, label, weapon it needs]. */
export const PREFIRES = [
  ['Twisted bow', 'Twisted bow', 'Twisted bow'],
  ['ZCB auto', 'ZCB auto', 'Zaryte crossbow'],
  ['ZCB spec', 'ZCB spec', 'Zaryte crossbow'],
  ['Shadow Barrage', 'Shadow Barrage', 'Shadow ancient sceptre'],
  ["Tumeken's shadow", "Tumeken's shadow", "Tumeken's shadow"],
];
const blank = () => ({ startSpec: 100, pnecks: 0, sharks: 0, prefire: '' });

export function createSote(root, { getTeam }) {
  let state = load();
  const team = () => Number(getTeam()) || 4;
  const tstate = () => {
    const t = team(), st = (state[t] ||= { gearSet: 'A', players: [] });
    while (st.players.length < t) st.players.push(blank());
    st.players.length = t;
    return st;
  };
  const persist = () => save(state);

  function render() {
    const st = tstate(), g = loadGear(), set = gearSet(g, team(), st.gearSet);
    const gp = set ? playersOf(set, team()) : null;
    const name = (k) => (gp && gp[k] && gp[k].name) || `Player ${k + 1}`;
    const owns = (k, w) => !!(gp && gp[k] && (gp[k].weapons || []).includes(w));
    const row = (p, k) => {
      const opts = [['', 'None', null], ...PREFIRES].map(([v, lab, need]) => {
        const ok = !need || owns(k, need);
        return `<option value="${esc(v)}" ${v === (p.prefire || '') ? 'selected' : ''} ${ok ? '' : 'disabled'}>${esc(lab)}${ok ? '' : ` (no ${need})`}</option>`;
      }).join('');
      const need = (PREFIRES.find(([v]) => v === p.prefire) || [])[2];
      const warn = need && !owns(k, need) ? `<div class="warn small">Gear set ${esc(st.gearSet)} has no ${esc(need)} for them</div>` : '';
      return `<tr><td class="rl">${esc(name(k))}</td>
        <td><input type="number" min="0" max="100" step="1" data-s="${k}|startSpec" value="${esc(p.startSpec)}"></td>
        <td><input type="number" min="0" step="1" data-s="${k}|pnecks" value="${esc(p.pnecks)}"></td>
        <td><input type="number" min="0" step="1" data-s="${k}|sharks" value="${esc(p.sharks)}"></td>
        <td><select data-s="${k}|prefire">${opts}</select>${warn}</td></tr>`;
    };
    root.innerHTML = `<h3 style="margin-top:0">Sotetseg <span class="muted small">(${team()}-man)</span></h3>
      <p class="muted small">Room settings for each player. The Sotetseg sim is being built - these are saved in this browser and will be used by it (and by Full raid).
        Gear comes from the Gear tab; a prefire needs that weapon in the Gear set (Shadow Barrage: a Shadow ancient sceptre).</p>
      <div class="row" style="margin-bottom:8px"><label>Gear<select data-gearset>${GEAR_SETS.map((x) => `<option value="${x}" ${x === st.gearSet ? 'selected' : ''}>Gear set ${x}${gearSet(g, team(), x) ? '' : ' (empty)'}</option>`).join('')}</select></label></div>
      <div class="scroll"><table class="bt">
        <tr><th></th><th title="Spec % at the start of the room">Start spec (%)</th><th title="Phoenix necklaces they bring">Phoenix necklaces</th><th title="Sharks they bring">Sharks</th><th title="Their first attack, before the room starts">Prefire</th></tr>
        ${st.players.map(row).join('')}
      </table></div>`;
  }

  root.addEventListener('change', (e) => {
    const t = e.target, st = tstate();
    if (t.dataset.gearset != null) { st.gearSet = t.value; persist(); render(); return; }
    if (!t.dataset.s) return;
    const [k, key] = t.dataset.s.split('|');
    st.players[Number(k)][key] = key === 'prefire' ? t.value : (t.value === '' ? '' : Number(t.value));
    persist(); render();
  });

  return { refresh: () => { state = load(); render(); } };
}
