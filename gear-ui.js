// Gear tab: Gear sets A / B / C - each player's melee / ranged / magic setup, slot by slot, and the weapons they bring.
// Each Verzik set picks the Gear set it uses (chart builder). Saved in this browser.
import { ITEMS } from './engine/gear.js';
import { SLOTS, STYLES, CHOICES, WEAPONS_OWNED, ARROWS, BOLTS, BOTH_AMULETS, blankPlayer, slotItem, worn, bonuses, threeTick, isTwoHanded } from './engine/loadout.js';
import { loadGear, saveGear, linkOf, GEAR_SETS } from './engine/gearstore.js';

const TEAMS = 'verzikSim.gearTeams.v1';        // saved teams: {team: [{id, name, saved, players}]}
const loadTeams = () => {
  let v; try { v = JSON.parse(localStorage.getItem(TEAMS)) || {}; } catch { v = {}; }
  for (const list of Object.values(v)) for (const t of list || []) for (const p of t.players || []) {   // renamed items
    if (Array.isArray(p.weapons)) p.weapons = p.weapons.map((w) => (w === 'Smoke ancient sceptre' ? 'Shadow ancient sceptre' : w));
  }
  return v;
};
const saveTeams = (v) => { try { localStorage.setItem(TEAMS, JSON.stringify(v)); return true; } catch { return false; } };
const when = (ms) => new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sign = (n) => (n > 0 ? `+${n}` : String(n));

export function createGear(root, { getTeam }) {
  let state = loadGear();
  let cur = 0, gset = 'A', teamPick = '', msg = '';
  let teams = loadTeams();
  const team = () => Number(getTeam()) || 4;
  const tstate = () => (state[team()] ||= { sets: {}, link: {} });
  /** The open Gear set's players (a new set starts as a copy of Gear set A, or blank). */
  const players = () => {
    const t = team(), ts = tstate();
    if (!ts.sets[gset]) ts.sets[gset] = { players: structuredClone(ts.sets.A ? ts.sets.A.players : []) };
    const ps = ts.sets[gset].players;
    while (ps.length < t) ps.push(blankPlayer(ps.length));
    ps.length = t;
    return ps;
  };
  const persist = () => saveGear(state);
  const usedBy = () => GEAR_SETS.filter((b) => linkOf(state, team(), b) === gset);

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

  /** Saved teams: the open Gear set's players and gear under a name (per scale), loaded back into any Gear set. */
  function teamBar() {
    const list = teams[team()] || [];
    return `<div class="row wrap" style="gap:10px;align-items:end;margin:4px 0 8px">
      <label>Saved teams<select data-team="pick"><option value="">(choose a team)</option>${list.map((x) => `<option value="${x.id}" ${x.id === teamPick ? 'selected' : ''}>${esc(x.name)} · ${when(x.saved)}</option>`).join('')}</select></label>
      <button class="ghost sm" data-act="teamload" ${teamPick ? '' : 'disabled'} title="Replace Gear set ${gset} with this team">Load into Gear set ${gset}</button>
      <button class="ghost sm" data-act="teamdel" ${teamPick ? '' : 'disabled'}>Delete</button>
      <label>Name<input data-team="name" placeholder="e.g. Main team" style="width:150px"></label>
      <button class="sm" data-act="teamsave" title="Save Gear set ${gset} (every player's gear and weapons) under this name">Save team</button>
      <button class="ghost sm" data-act="teamfile">Save to file</button>
      <label class="ghost sm filebtn">Open file<input type="file" accept=".json" data-team="file" hidden></label>
      <span class="muted small">${esc(msg)}</span>
    </div>`;
  }

  function render() {
    const ps = players();
    if (cur >= ps.length) cur = 0;
    const pl = ps[cur];
    const three = threeTick(pl);
    const ts = tstate(), used = usedBy();
    root.innerHTML = `<h3 style="margin-top:0">Gear <span class="muted small">(${team() === 1 ? 'solo' : `${team()}-man`})</span></h3>
      <p class="muted small">What each player wears for melee, ranged and magic, slot by slot, and the weapons they bring. Ranged / Magic slots:
        <b>none</b> = no switch for that slot (they wear the other style's item if it has one, otherwise their melee item), <b>take off</b> = nothing in that slot.
        A two-handed weapon leaves the shield slot empty. P1 tick fixes are made in melee gear; the shadow and duo Dawn autos use the magic setup.
        Lightbearer is set per room. Saved in this browser; importing a chart copies its gear into the Gear sets of the same letters.</p>
      <div class="row between" style="margin-bottom:8px">
        <div class="seg">${GEAR_SETS.map((g) => `<button data-gset="${g}" class="${g === gset ? 'on' : ''}">Gear set ${g}${ts.sets[g] ? '' : ' (empty)'}</button>`).join('')}</div>
        <div class="row" style="gap:8px">${GEAR_SETS.filter((g) => g !== gset).map((g) => `<button class="ghost sm" data-act="copyset" data-to="${g}">Copy Gear set ${gset} to ${g}</button>`).join('')}</div>
      </div>
      ${teamBar()}
      <p class="small" style="margin:0 0 10px">${team() === 1 ? '<span class="muted">Solos: the rooms are coming soon - set up the gear now and it carries over</span>' : used.length ? `Used by Verzik ${used.map((b) => `Set ${b}`).join(', ')}` : '<span class="muted">No Verzik set uses this Gear set (pick it in the chart builder, next to Set A / B / C)</span>'}.</p>
      <div class="row between" style="margin-bottom:8px">
        <div class="seg">${ps.map((p, k) => `<button data-p="${k}" class="${k === cur ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
        <div class="row" style="gap:8px">
          ${team() === 1 ? '' : `<button class="ghost sm" data-act="copyall" title="Give every player this player's gear and weapons (names stay)">Copy to all players</button>`}
          <button class="ghost sm" data-act="reset" title="Back to the default melee gear, no switches">Reset this player</button>
        </div>
      </div>
      <div class="row" style="gap:14px">
        <label>Name<input data-g="name" value="${esc(pl.name)}" style="width:160px"></label>
        <label>Melee prayer<select data-g="prayer">${['Piety', 'Zeal'].map((x) => `<option ${x === (pl.prayer || 'Piety') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
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
          <p class="small" style="margin:8px 0 0">3-tick weapon: <b>${esc(three || ((pl.weapons || []).includes('Swift blade') ? 'Swift blade' : 'none'))}</b><br><span class="muted">first of Obligator, Eye of ayak, Zorya's tome they have${three === "Zorya's tome" ? ' - the tome as a 3-tick weapon isn\'t simulated yet' : ''}</span></p>
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
    if (b.dataset.gset) { gset = b.dataset.gset; render(); return; }
    if (b.dataset.act === 'teamsave') {
      const name = (root.querySelector('[data-team="name"]').value || '').trim() || (teams[team()] || []).find((x) => x.id === teamPick)?.name || '';
      if (!name) { msg = 'Type a name for the team first.'; render(); return; }
      const list = (teams[team()] ||= []);
      const old = list.find((x) => x.name === name);
      const entry = { id: old ? old.id : `t${Date.now()}`, name, saved: Date.now(), players: structuredClone(players()) };
      if (old) Object.assign(old, entry); else list.push(entry);
      teamPick = entry.id;
      msg = saveTeams(teams) ? `Saved "${name}" (${old ? 'updated' : 'new'}).` : 'Could not save (browser storage is off).';
      render(); return;
    }
    if (b.dataset.act === 'teamload' || b.dataset.act === 'teamdel') {
      const list = teams[team()] || [], x = list.find((y) => y.id === teamPick); if (!x) return;
      if (b.dataset.act === 'teamload') {
        tstate().sets[gset] = { players: structuredClone(x.players) }; persist();
        msg = `Loaded "${x.name}" into Gear set ${gset}.`;
      } else {
        teams[team()] = list.filter((y) => y !== x); teamPick = ''; saveTeams(teams);
        msg = `Deleted "${x.name}".`;
      }
      render(); return;
    }
    if (b.dataset.act === 'teamfile') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'verzikSim', kind: 'team', team: team(), players: players() }, null, 1)], { type: 'application/json' }));
      a.download = team() === 1 ? 'verzik_solo_gear.json' : `verzik_team_${team()}man.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    if (b.dataset.act === 'copyset') { tstate().sets[b.dataset.to] = { players: structuredClone(players()) }; persist(); render(); return; }
    const ps = players();
    if (b.dataset.act === 'copyall') {
      const src = ps[cur];
      ps.forEach((p, k) => { if (k !== cur) Object.assign(p, structuredClone({ ...src, name: p.name })); });
      persist(); render();
    } else if (b.dataset.act === 'reset') {
      ps[cur] = { ...blankPlayer(cur), name: ps[cur].name }; persist(); render();
    }
  });
  root.addEventListener('change', async (e) => {
    const t = e.target, pl = players()[cur];
    if (t.dataset.team === 'pick') { teamPick = t.value; msg = ''; render(); return; }
    if (t.dataset.team === 'name') return;
    if (t.dataset.team === 'file') {
      try {
        const j = JSON.parse(await t.files[0].text());
        if (j.kind !== 'team' || !Array.isArray(j.players)) throw new Error('not a saved team file');
        if (Number(j.team) !== team()) throw new Error(`it's a ${j.team}-man team - pick that scale first`);
        tstate().sets[gset] = { players: j.players }; persist();
        msg = `Opened ${t.files[0].name} into Gear set ${gset}.`;
      } catch (err) { msg = `Couldn't open that file: ${err.message}`; }
      render(); return;
    }
    if (t.dataset.w) {
      const w = t.dataset.w, set = new Set(pl.weapons || []);
      if (t.checked) set.add(w); else set.delete(w);
      pl.weapons = [...set];
    } else if (t.dataset.g === 'name') pl.name = t.value || `Player ${cur + 1}`;
    else if (['arrows', 'bolts', 'prayer'].includes(t.dataset.g)) pl[t.dataset.g] = t.value;
    else if (t.dataset.g) { const [style, slot] = t.dataset.g.split('|'); pl[style][slot] = t.value; }
    else return;
    persist(); render();
  });

  return { refresh: () => { state = loadGear(); render(); } };
}

export { ITEMS };
