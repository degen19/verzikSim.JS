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

const STORE = 'verzikSim.sote.v1';             // {team: {gearSet, skip, sharkSkipper (player index), players (redeem: redemption skip): [{startSpec, surge, lbCycles, pnecks, sharks, rests, prefire}]}}
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
const blank = () => ({ startSpec: 100, surge: false, lbCycles: 0, pnecks: 0, sharks: 0, rests: 0, prefire: '' });
/** How the maze is crossed. Stall: everyone but the player under stands on the maze for 7 ticks with a phoenix
 *  necklace. Shark skip: one player short of phoenix necklaces (never more than one) skips
 *  away from the others (no splash), eating sharks / Guthix rests through it instead. Run maze: everyone runs it
 *  (slower). Redemption skip: the players ticked orb down to 1 HP with a locator orb and stall with Redemption instead
 *  of a phoenix necklace (a restore sip after each - 2 doses; they swing a tick late). Run maze is still to come. */
export const SKIP_TYPES = [['stall', 'Stall (phoenix necklaces)'], ['shark', 'Shark skip'], ['redemption', 'Redemption skip'], ['run', 'Run maze - all players (to come)']];
const sign = (n) => (n > 0 ? `+${n}` : String(n));

export function createSote(root, { getTeam }) {
  let state = load();
  const team = () => Number(getTeam()) || 4;
  const tstate = () => {
    const t = team(), st = (state[t] ||= { gearSet: 'A', skip: 'stall', players: [] });
    st.skip ||= 'stall';
    while (st.players.length < t) st.players.push(blank());
    for (const p of st.players) if (p.lbRegens != null) { p.lbCycles ??= p.lbRegens; delete p.lbRegens; }   // first preview
    st.players.length = t;
    return st;
  };
  const persist = () => save(state);

  function render() {
    const st = tstate(), g = loadGear(), set = gearSet(g, team(), st.gearSet);
    const gp = set ? playersOf(set, team()) : null;
    const pname = (k) => (gp && gp[k] && gp[k].name) || `Player ${k + 1}`;
    const shortK = st.players.map((p, k) => [p, k]).filter(([p]) => Number(p.pnecks || 0) < 2).map(([, k]) => k);
    const short = shortK.map(pname);
    const fewest = [...shortK].sort((a, b) => Number(st.players[a].pnecks || 0) - Number(st.players[b].pnecks || 0))[0];
    const skipper = Number.isInteger(st.sharkSkipper) && st.sharkSkipper < st.players.length ? st.sharkSkipper : (fewest ?? 0);
    const others = shortK.filter((k) => k !== skipper).map(pname);
    const redeems = (p) => (p.redeem != null ? !!p.redeem : Number(p.pnecks || 0) < 2);   // default: short of necklaces
    const unredeemed = st.players.map((p, k) => [p, k]).filter(([p]) => Number(p.pnecks || 0) < 2 && !redeems(p)).map(([, k]) => pname(k));
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
        <td><input type="number" min="0" step="1" data-s="${k}|pnecks" value="${esc(p.pnecks)}"></td>
        <td><input type="number" min="0" step="1" data-s="${k}|sharks" value="${esc(p.sharks)}"></td>
        <td><input type="number" min="0" step="1" data-s="${k}|rests" value="${esc(p.rests ?? 0)}"></td>
        <td><select data-s="${k}|prefire">${opts}</select>${note}</td>
        ${st.skip === 'redemption' ? `<td style="text-align:center"><input type="checkbox" data-s="${k}|redeem" ${redeems(p) ? 'checked' : ''}></td>` : ''}</tr>`;
    };
    root.innerHTML = `<h3 style="margin-top:0">Sotetseg <span class="muted small">(${team()}-man)</span></h3>
      <p class="muted small">Room settings for each player. The Sotetseg sim is being built - these are saved in this browser and will be used by it (and by Full raid).
        Gear comes from the Gear tab; a prefire needs that weapon in the Gear set (Shadow Barrage: a Shadow ancient sceptre).</p>
      <div class="row" style="margin-bottom:8px"><label>Gear<select data-gearset>${GEAR_SETS.map((x) => `<option value="${x}" ${x === st.gearSet ? 'selected' : ''}>Gear set ${x}${gearSet(g, team(), x) ? '' : ' (empty)'}</option>`).join('')}</select></label>
        <label title="How the mazes are crossed">Maze<select data-skip>${SKIP_TYPES.map(([v, lab]) => `<option value="${v}" ${v === st.skip ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select></label>
        ${st.skip === 'shark' ? `<label title="The one player who shark skips (with 1 phoenix necklace: the first maze; with none: both). Everyone else stalls">Shark skipper<select data-skipper>${st.players.map((p, k) => `<option value="${k}" ${k === skipper ? 'selected' : ''}>${esc(pname(k))} (${Number(p.pnecks || 0)} necklace${Number(p.pnecks || 0) === 1 ? '' : 's'})</option>`).join('')}</select></label>` : ''}</div>
      ${st.skip === 'shark' && others.length ? `<div class="warn small" style="margin-bottom:8px">Only one player can shark skip. ${esc(others.join(', '))} ${others.length > 1 ? 'have' : 'has'} fewer than 2 phoenix necklaces too - not enough to stall both mazes.</div>` : ''}
      ${short.length && st.skip === 'stall' ? `<div class="warn small" style="margin-bottom:8px">${esc(short.join(', '))} ${short.length > 1 ? 'have' : 'has'} fewer than 2 phoenix necklaces - not enough to stall both mazes. Pick another way to cross the maze: Shark skip, Redemption skip or Run maze.</div>` : ''}
      ${st.skip === 'redemption' ? `<div class="muted small" style="margin-bottom:8px">Redemption skippers need a locator orb and 2 restore doses (one a maze). They come off the maze on 15-18 HP and swing a tick after the others.</div>` : ''}
      ${st.skip === 'redemption' && unredeemed.length ? `<div class="warn small" style="margin-bottom:8px">${esc(unredeemed.join(', '))} ${unredeemed.length > 1 ? 'have' : 'has'} fewer than 2 phoenix necklaces and isn't redemption skipping.</div>` : ''}
      ${st.skip === 'run' ? '<div class="muted small" style="margin-bottom:8px">Run maze: every player runs the maze instead of skipping it - slower.</div>' : ''}
      <div class="scroll"><table class="bt">
        <tr><th></th><th title="Spec % at the start of the room. 95: their first regen comes the tick after their first special attack, then as normal">Start spec (%)</th><th title="Drink a surge with their first special attack">Surge</th><th title="How many spec regens they wear Lightbearer for (a regen every 25 ticks on it), then swap to Ultor">Lightbearer cycles</th><th title="Phoenix necklaces they bring">Phoenix necklaces</th><th title="Sharks they bring">Sharks</th><th title="Guthix rests (4 dose) they bring: heal 5 a sip, on the potion delay (can go with a shark on the same tick)">Guthix rests</th><th title="Their first attack, before the room starts">Prefire</th>${st.skip === 'redemption' ? '<th title="Orbs down to 1 HP with a locator orb and stalls with Redemption instead of a phoenix necklace (needs a locator orb and 2 restore doses)">Redemption skip</th>' : ''}</tr>
        ${st.players.map(row).join('')}
      </table></div>`;
  }

  root.addEventListener('change', (e) => {
    const t = e.target, st = tstate();
    if (t.dataset.gearset != null) { st.gearSet = t.value; persist(); render(); return; }
    if (t.dataset.skip != null) { st.skip = t.value; persist(); render(); return; }
    if (t.dataset.skipper != null) { st.sharkSkipper = Number(t.value); persist(); render(); return; }
    if (!t.dataset.s) return;
    const [k, key] = t.dataset.s.split('|');
    st.players[Number(k)][key] = key === 'prefire' ? t.value : key === 'surge' || key === 'redeem' ? t.checked : (t.value === '' ? '' : Number(t.value));
    persist(); render();
  });

  return { refresh: () => { state = load(); render(); } };
}
