// Gear tab: each player's melee / ranged / magic setup, slot by slot, and the weapons they bring. Saved in this browser.
// (Preview: the sims don't read it yet - Verzik still uses the gear in its chart.)
import { ITEMS } from './engine/gear.js';
import { SLOTS, STYLES, CHOICES, WEAPONS_OWNED, ARROWS, BOLTS, blankPlayer, slotItem, worn, bonuses, threeTick, isTwoHanded } from './engine/loadout.js';

const STORE = 'verzikSim.gear.v1';             // {team: {players: [...]}}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage off: keep in memory */ } };
const sign = (n) => (n > 0 ? `+${n}` : String(n));

export function createGear(root, { getTeam }) {
  let state = load();
  let cur = 0;
  const team = () => Number(getTeam()) || 4;
  const players = () => {
    const t = team();
    const st = (state[t] ||= { players: [] });
    while (st.players.length < t) st.players.push(blankPlayer(st.players.length));
    st.players.length = t;
    return st.players;
  };
  const persist = () => save(state);

  function cell(pl, style, slot) {
    const list = CHOICES[style][slot];
    const v = style === 'melee' ? (pl.melee[slot] || '') : (pl[style][slot] || 'none');
    if (style === 'melee') {
      if (!list.length) return '<span class="muted">-</span>';
      return `<select data-g="${style}|${slot}"><option value="" ${v === '' ? 'selected' : ''}>(nothing)</option>${list.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    }
    const opts = [['none', 'none'], ['takeoff', 'take off'], ...list.map((x) => [x, x])];
    const eff = slotItem(pl, style, slot);
    const hint = v === 'none' ? `<div class="muted small">wears ${esc(eff || 'nothing')}</div>` : '';
    return `<select data-g="${style}|${slot}">${opts.map(([val, lab]) => `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>${hint}`;
  }

  function weaponRows(pl) {
    const rows = [];
    for (const [style, label] of STYLES) for (const w of WEAPONS_OWNED[style]) {
      if (!(pl.weapons || []).includes(w)) continue;
      const set = worn(pl, style, w), b = bonuses(set);
      const acc = style === 'melee' ? Math.max(b.atk[0], b.atk[1], b.atk[2]) : style === 'range' ? b.atk[4] : b.atk[3];
      const dmg = style === 'melee' ? `str ${sign(b.str)}` : style === 'range' ? `ranged str ${sign(b.rstr)}` : `magic dmg ${sign(b.mdmg)}%`;
      const notes = [];
      if (isTwoHanded(w)) notes.push('two-handed (no shield)');
      if (set.ammo) notes.push(set.ammo);
      if (ITEMS[w] && ITEMS[w].spell === 'shadow') notes.push('shadow triples worn magic attack and damage (shown unmultiplied)');
      if (b.eliteVoid && style === 'range') notes.push('elite void: +10% accuracy, +12.5% damage');
      rows.push(`<tr><td class="rl">${esc(w)}</td><td>${label}</td><td>${sign(acc)}</td><td>${dmg}</td><td>${sign(b.pray)}</td><td class="muted small" style="text-align:left">${esc(notes.join(' · '))}</td></tr>`);
    }
    return rows.join('');
  }

  function render() {
    const ps = players();
    if (cur >= ps.length) cur = 0;
    const pl = ps[cur];
    const three = threeTick(pl);
    root.innerHTML = `<h3 style="margin-top:0">Gear <span class="muted small">(${team()}-man · preview)</span></h3>
      <p class="muted small">What each player wears for melee, ranged and magic, slot by slot, and the weapons they bring. Ranged / Magic slots:
        <b>none</b> = no switch for that slot (they wear the other style's item if it has one, otherwise their melee item), <b>take off</b> = nothing in that slot.
        A two-handed weapon leaves the shield slot empty. P1 tick fixes are made in melee gear; only duo Dawn autos use the magic setup.
        Saved in this browser. <span class="warn">Preview: not used by the sim yet - Verzik still uses the gear in its chart.</span></p>
      <div class="row between" style="margin-bottom:8px">
        <div class="seg">${ps.map((p, k) => `<button data-p="${k}" class="${k === cur ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
        <div class="row" style="gap:8px">
          <button class="ghost sm" data-act="copyall" title="Give every player this player's gear and weapons (names stay)">Copy to all players</button>
          <button class="ghost sm" data-act="reset" title="Back to the default melee gear, no switches">Reset this player</button>
        </div>
      </div>
      <label>Name<input data-g="name" value="${esc(pl.name)}" style="width:160px"></label>
      <div class="scroll"><table class="bt gear">
        <tr><th>Slot</th>${STYLES.map(([, l]) => `<th>${l}</th>`).join('')}</tr>
        ${SLOTS.map(([s, lab]) => `<tr><td class="rl">${lab}</td>${STYLES.map(([st]) => `<td>${cell(pl, st, s)}</td>`).join('')}</tr>`).join('')}
      </table></div>
      <h4>Weapons</h4>
      <div class="row wrap" style="gap:18px;align-items:flex-start">
        ${STYLES.map(([st, l]) => `<div><div class="muted small">${l}</div>${WEAPONS_OWNED[st].map((w) => `<label class="pick" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-w="${esc(w)}" ${(pl.weapons || []).includes(w) ? 'checked' : ''}>${esc(w)}</label>`).join('')}</div>`).join('')}
        <div>
          <label>Arrows<select data-g="arrows">${ARROWS.map((a) => `<option ${a === pl.arrows ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
          <label style="margin-top:6px">Bolts<select data-g="bolts">${BOLTS.map((a) => `<option ${a === pl.bolts ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
          <p class="small" style="margin:8px 0 0">3-tick weapon: <b>${esc(three || 'none')}</b><br><span class="muted">first of Obligator, Eye of ayak, Zorya's tome they have</span></p>
        </div>
      </div>
      <h4>Bonuses with each weapon</h4>
      <div class="scroll"><table class="bt">
        <tr><th>Weapon</th><th>Style</th><th>Accuracy</th><th>Damage</th><th>Prayer</th><th>Notes</th></tr>
        ${weaponRows(pl) || '<tr><td colspan="6" class="muted">Tick the weapons they bring.</td></tr>'}
      </table></div>`;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p != null) { cur = Number(b.dataset.p); render(); return; }
    const ps = players();
    if (b.dataset.act === 'copyall') {
      const src = ps[cur];
      ps.forEach((p, k) => { if (k !== cur) Object.assign(p, structuredClone({ ...src, name: p.name })); });
      persist(); render();
    } else if (b.dataset.act === 'reset') {
      ps[cur] = { ...blankPlayer(cur), name: ps[cur].name }; persist(); render();
    }
  });
  root.addEventListener('change', (e) => {
    const t = e.target, pl = players()[cur];
    if (t.dataset.w) {
      const w = t.dataset.w, set = new Set(pl.weapons || []);
      if (t.checked) set.add(w); else set.delete(w);
      pl.weapons = [...set];
    } else if (t.dataset.g === 'name') pl.name = t.value || `Player ${cur + 1}`;
    else if (t.dataset.g === 'arrows' || t.dataset.g === 'bolts') pl[t.dataset.g] = t.value;
    else if (t.dataset.g) { const [style, slot] = t.dataset.g.split('|'); pl[style][slot] = t.value; }
    else return;
    persist(); render();
  });

  return { refresh: render };
}

export { ITEMS };
