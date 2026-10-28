// Sotetseg tab: per-player room settings for 2-5 man (the Sotetseg sim comes next). Saved in this browser.
// Gear comes from the Gear tab (the Gear set picked here); the prefire choices need the weapon in that Gear set.
// Rules for the sim (agreed):
//  - Start spec 95 or 100 (default 100). A 95% start gets its first regen the tick after their first special attack,
//    then regens as normal.
//  - Surge: they drink a surge with their first special attack.
//  - Lightbearer cycles: how many spec regens they wear Lightbearer for (none, 1-5; a regen every 25 ticks on it), then
//    swap to Ultor (the regen timer restarts). The solver will pick Surge / Lightbearer cycles too.
//  - Prefires with the Twisted bow / ZCB are made in their best ranged gear, Shadow / Shadow Barrage in their best magic
//    gear (each slot: their ranged, magic or melee item, or nothing - loadout.js bestWorn).
import { loadGear, gearSet, playersOf, GEAR_SETS } from './engine/gearstore.js';
import { bestWorn, bonuses } from './engine/loadout.js';
import { defaultMazes, MAZE_HOW } from './engine/sote.js';

const STORE = 'verzikSim.sote.v1';             // {team: {gearSet, players: [{startSpec, surge, lbCycles, pnecks, sharks, rests, restores, prefire, mazes: [first, second]}]}}
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
const STYLE = { 'Twisted bow': 'range', 'Zaryte crossbow': 'range', 'Shadow ancient sceptre': 'mage', "Tumeken's shadow": 'mage' };
const blank = () => ({ startSpec: 100, surge: false, lbCycles: 0, pnecks: 0, sharks: 0, rests: 0, restores: 3, prefire: '' });
/** How each player crosses each maze (First maze / Second maze; default by their phoenix necklaces - defaultMazes):
 *  Pneck: stall on the maze with a phoenix necklace. Redemption (1-4s, with a locator orb from the Gear tab): orb down to
 *  1 HP and stall with Redemption (a restore sip a maze; they swing a tick late). Shark (one player at most): skip away
 *  from the others, eating sharks / Guthix rests through it. Run: everyone runs that maze (slower). */
const sign = (n) => (n > 0 ? `+${n}` : String(n));

export function createSote(root, { getTeam }) {
  let state = load();
  const team = () => Number(getTeam()) || 4;
  const tstate = () => {
    const t = team(), st = (state[t] ||= { gearSet: 'A', players: [] });
    delete st.skip; delete st.sharkSkipper;                          // first preview (one Maze setting for the room)
    while (st.players.length < t) st.players.push(blank());
    for (const p of st.players) { if (p.lbRegens != null) { p.lbCycles ??= p.lbRegens; delete p.lbRegens; } delete p.redeem; }   // first preview
    st.players.length = t;
    return st;
  };
  const persist = () => save(state);

  function render() {
    const st = tstate(), g = loadGear(), set = gearSet(g, team(), st.gearSet);
    const gp = set ? playersOf(set, team()) : null;
    const pname = (k) => (gp && gp[k] && gp[k].name) || `Player ${k + 1}`;
    const hasOrb = (k) => !!(gp && gp[k] && gp[k].locator);         // a locator orb (Gear tab) is needed to redemption skip
    const mazesOf = (p, k) => (Array.isArray(p.mazes) ? p.mazes : defaultMazes(Number(p.pnecks || 0), hasOrb(k), team()));
    // notices
    const notes = [], tips = [];
    const all = st.players.map((p, k) => ({ k, n: Number(p.pnecks || 0), m: mazesOf(p, k) }));
    for (const { k, n, m } of all) {
      const pn = m.filter((x) => x === 'pneck').length;
      if (pn > n) notes.push(`${pname(k)} stalls ${pn === 2 ? 'both mazes' : 'a maze'} with a phoenix necklace but has ${n}.`);
      if (m.includes('redemption') && !hasOrb(k)) notes.push(`${pname(k)} can't redemption skip without a locator orb (Gear tab).`);
      if (m.includes('redemption') && team() >= 5) notes.push(`${pname(k)}: redemption skips can't be done in 5s.`);
      if (n === 1 && m.includes('shark') && !(m[0] === 'shark' && m[1] === 'pneck')) tips.push(`${pname(k)} has 1 phoenix necklace: shark skip the first maze, then the necklace on the second.`);
      if (n === 1 && m.includes('redemption') && !(m[0] === 'pneck' && m[1] === 'redemption')) tips.push(`${pname(k)} has 1 phoenix necklace: the necklace on the first maze, then a redemption skip on the second (they can veng the first phase more freely).`);
    }
    const sharkers = all.filter(({ m }) => m.includes('shark')).map(({ k }) => pname(k));
    if (sharkers.length > 1) notes.push(`Only one player can shark skip (${sharkers.join(', ')}).`);
    const runs = [0, 1].filter((i) => all.some(({ m }) => m[i] === 'run'));
    const mazeSel = (p, k, i) => `<select data-maze="${k}|${i}">${MAZE_HOW.map(([v, lab]) => `<option value="${v}" ${v === mazesOf(p, k)[i] ? 'selected' : ''} ${v === 'redemption' && team() >= 5 ? 'disabled' : ''}>${lab}${v === 'redemption' && team() >= 5 ? ' (not in 5s)' : ''}</option>`).join('')}</select>`;
    const name = (k) => (gp && gp[k] && gp[k].name) || `Player ${k + 1}`;
    const owns = (k, w) => !!(gp && gp[k] && (gp[k].weapons || []).includes(w));
    const row = (p, k) => {
      const opts = [['', 'None', null], ...PREFIRES].map(([v, lab, need]) => {
        const ok = !need || owns(k, need);
        return `<option value="${esc(v)}" ${v === (p.prefire || '') ? 'selected' : ''} ${ok ? '' : 'disabled'}>${esc(lab)}${ok ? '' : ` (no ${need})`}</option>`;
      }).join('');
      const need = (PREFIRES.find(([v]) => v === p.prefire) || [])[2];
      let note = '';
      if (need && !owns(k, need)) note = `<div class="warn small">Gear set ${esc(st.gearSet)} has no ${esc(need)} for them</div>`;
      else if (need && gp) {                                         // the best gear they have for it
        const style = STYLE[need], { set: ws } = bestWorn(gp[k], style, need), b = bonuses(ws);
        const items = Object.entries(ws).filter(([sl, v]) => v && sl !== 'weapon' && sl !== 'ammo').map(([, v]) => v);
        const nums = style === 'range' ? `ranged ${sign(b.atk[4])} / str ${sign(b.rstr)}${b.eliteVoid ? ' (elite void)' : ''}` : `magic ${sign(b.atk[3])} / dmg ${sign(b.mdmg)}%`;
        note = `<div class="muted small" title="${esc(items.join(', '))}">best gear: ${esc(nums)}</div>`;
      }
      const sel = (key, list, v) => `<select data-s="${k}|${key}">${list.map(([x, lab]) => `<option value="${x}" ${String(x) === String(v) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
      return `<tr><td class="rl">${esc(name(k))}</td>
        <td>${sel('startSpec', [[100, '100'], [95, '95']], p.startSpec === 95 ? 95 : 100)}</td>
        <td style="text-align:center"><input type="checkbox" data-s="${k}|surge" ${p.surge ? 'checked' : ''}></td>
        <td>${sel('lbCycles', [[0, 'None'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], p.lbCycles || 0)}</td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|pnecks" value="${esc(p.pnecks)}"></td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|sharks" value="${esc(p.sharks)}"></td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|rests" value="${esc(p.rests ?? 0)}"></td>
        <td><input type="number" min="0" step="1" style="width:64px" data-s="${k}|restores" value="${esc(p.restores ?? 3)}"></td>
        <td><select data-s="${k}|prefire" style="max-width:150px">${opts}</select>${note}</td>
        <td>${mazeSel(p, k, 0)}</td><td>${mazeSel(p, k, 1)}</td></tr>`;
    };
    root.innerHTML = `<h3 style="margin-top:0">Sotetseg <span class="muted small">(${team()}-man)</span></h3>
      <p class="muted small">Room settings for each player. The Sotetseg sim is being built - these are saved in this browser and will be used by it (and by Full raid).
        Gear comes from the Gear tab; a prefire needs that weapon in the Gear set (Shadow Barrage: a Shadow ancient sceptre).</p>
      <div class="row" style="margin-bottom:8px"><label>Gear<select data-gearset>${GEAR_SETS.map((x) => `<option value="${x}" ${x === st.gearSet ? 'selected' : ''}>Gear set ${x}${gearSet(g, team(), x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
</div>
      ${notes.map((x) => `<div class="warn small" style="margin-bottom:4px">${esc(x)}</div>`).join('')}
      ${tips.map((x) => `<div class="muted small" style="margin-bottom:4px">Recommended: ${esc(x)}</div>`).join('')}
      ${runs.length ? `<div class="muted small" style="margin-bottom:4px">Run: every player runs the ${runs.map((i) => (i ? 'second' : 'first')).join(' and ')} maze instead of skipping it - a real maze each time; usually 4-12 ticks slower than a skip.</div>` : ''}
      <style>.sote-cfg th{white-space:normal !important;max-width:96px;vertical-align:bottom}</style>
      <div class="scroll"><table class="bt sote-cfg">
        <tr><th></th><th title="Spec % at the start of the room. 95: their first regen comes the tick after their first special attack, then as normal">Start spec (%)</th><th title="Drink a surge with their first special attack">Surge</th><th title="How many spec regens they wear Lightbearer for (a regen every 25 ticks on it), then swap to Ultor">Lightbearer cycles</th><th title="Phoenix necklaces they bring">Phoenix necklaces</th><th title="Sharks they bring">Sharks</th><th title="Guthix rest sips they bring (a 4 dose = 4 sips): heal 5 a sip, on the potion delay (can go with a shark on the same tick)">Guthix rest sips</th><th title="Prayer restore sips they bring (default 3): a redemption skip takes one a maze; after the second maze a redemption skipper uses spares on locator orb Redemption procs to Heal Other">Restore sips</th><th title="Their first attack, before the room starts">Prefire</th><th title="How they cross the first maze. Pneck: stall with a phoenix necklace. Redemption: orb down to 1 HP and stall with Redemption (locator orb; 1-4s). Shark: skip away from the others, eating through it (one player). Run: everyone runs it">First maze</th><th title="How they cross the second maze">Second maze</th></tr>
        ${st.players.map(row).join('')}
      </table></div>`;
  }

  root.addEventListener('change', (e) => {
    const t = e.target, st = tstate();
    if (t.dataset.gearset != null) { st.gearSet = t.value; persist(); render(); return; }
    if (t.dataset.maze != null) {
      const [k, i] = t.dataset.maze.split('|').map(Number), p = st.players[k];
      const g = loadGear(), set = gearSet(g, team(), st.gearSet), gp = set ? playersOf(set, team()) : null;
      p.mazes = [...(Array.isArray(p.mazes) ? p.mazes : defaultMazes(Number(p.pnecks || 0), !!(gp && gp[k] && gp[k].locator), team()))];
      p.mazes[i] = t.value; persist(); render(); return;
    }
    if (!t.dataset.s) return;
    const [k, key] = t.dataset.s.split('|');
    st.players[Number(k)][key] = key === 'prefire' ? t.value : key === 'surge' ? t.checked : (t.value === '' ? '' : Number(t.value));
    persist(); render();
  });

  return { refresh: () => { state = load(); render(); } };
}
