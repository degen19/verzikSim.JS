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
import { bestWorn, bonuses, blankPlayer } from './engine/loadout.js';
import { newSoteResult, addSoteRaids, soteReportHtml, soteReportPage } from './engine/sotereport.js';
import { parseBreakpoints } from './engine/optimize.js';
import { defaultMazes, MAZE_HOW, defaultSpecs, SPECS, SPEC_COST } from './engine/sote.js';
import { projectPlayer, TYPICAL_TIMES } from './engine/soteplan.js';

const STORE = 'verzikSim.sote.v1';             // {team: {gearSet, surgeLimit, lbRings, players: [{startSpec, surge, lbCycles, pnecks, sharks, rests, restores, prefire, mazes: [first, second]}]}}
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

export function createSote(host, { getTeam }) {
  let state = load();
  host.innerHTML = `<div data-cfg></div>
    <details class="video" data-rep open style="margin-top:14px"><summary>Report</summary>
      <div class="row" style="margin-top:10px">
        <label>Raids<input data-r="raids" type="number" min="100" step="500" style="width:90px"></label>
        <label title="The 4-tick instance the room is entered on (shifts the maze cycle)">Entry instance<select data-r="entry">${[0, 1, 2, 3].map((x) => `<option value="${x}">i${x}</option>`).join('')}</select></label>
        <label>Seed (optional)<input data-r="seed" placeholder="random" style="width:100px"></label>
        <label title="Target room times (m:ss), rounded down to a tick. Marked on the % of all raids chart and added to Odds.">Breakpoints (optional)<input data-r="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-act="run">Run</button><button data-act="stop" class="ghost" disabled>Stop</button><button data-act="dl" class="ghost" disabled>Download report</button>
      </div>
      <div data-rstatus class="muted" style="margin-top:8px"></div>
      <div data-rerr class="err"></div>
      <div data-rout style="margin-top:8px"></div>
    </details>
    <details class="video" data-opt style="margin-top:14px"><summary>Optimizer - entry instance</summary>
      <p class="muted small" style="margin-top:8px">Plays the setup above entered on each instance (i0-i3), on the same raids, and ranks them: with breakpoints by the
        share finished at the fastest breakpoint (then the next), otherwise by the median room time.</p>
      <div class="row">
        <label>Raids per instance<input data-o="raids" type="number" min="100" step="500" style="width:90px"></label>
        <label>Seed (optional)<input data-o="seed" placeholder="random" style="width:100px"></label>
        <label title="Target room times (m:ss), rounded down to a tick">Breakpoints (optional)<input data-o="bps" placeholder="m:ss, comma-separated" style="width:190px"></label>
        <button data-oact="run">Find the best entry</button><button data-oact="stop" class="ghost" disabled>Stop</button>
      </div>
      <div data-ostatus class="muted" style="margin-top:8px"></div>
      <div data-oerr class="err"></div>
      <div data-oout style="margin-top:8px"></div>
    </details>`;
  const root = host.querySelector('[data-cfg]'), rep = host.querySelector('[data-rep]'), opt = host.querySelector('[data-opt]');
  const $r = (k) => rep.querySelector(`[data-r="${k}"]`);
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
    const surgeLimit = Number.isInteger(st.surgeLimit) ? st.surgeLimit : team(), lbRings = Number.isInteger(st.lbRings) ? st.lbRings : team();
    const surgers = st.players.filter((p) => p.surge).length, lbers = st.players.filter((p) => Number(p.lbCycles || 0) > 0).length;
    if (surgers > surgeLimit) notes.push(`${surgers} players drink a surge, but only ${surgeLimit} surge potion${surgeLimit === 1 ? '' : 's'} can be used here.`);
    if (lbers > lbRings) notes.push(`${lbers} players wear Lightbearer, but there ${lbRings === 1 ? 'is' : 'are'} only ${lbRings} in the raid.`);
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
    const hasHorn = (k) => !!(gp && gp[k] && gp[k].horn);
    const specsOf = (p, k) => (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[k] || [{}, {}, {}]));
    const specCell = (p, k, ph) => {
      const sp = specsOf(p, k)[ph] || {};
      return `<select data-sp="${k}|${ph}|spec">${SPECS.map(([v, lab]) => `<option value="${v}" ${v === (sp.spec || 'none') ? 'selected' : ''}>${lab}</option>`).join('')}</select>
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="Backup: scythe first; once the phase's mauls have landed, maul if her Defence isn't at the floor - otherwise their spec"><input type="checkbox" data-sp="${k}|${ph}|backup" ${sp.backup ? 'checked' : ''}>Backup</label>
        <label class="pick" style="flex-direction:row;gap:4px;align-items:center;font-size:12px" title="${hasHorn(k) ? 'Soulflame horn: they and the first other player mauling this phase can\'t miss their next hit. P1: on t8; P2-P3: after their first scythe off the maze' : 'No Soulflame horn (Gear tab)'}"><input type="checkbox" data-sp="${k}|${ph}|horn" ${sp.horn && hasHorn(k) ? 'checked' : ''} ${hasHorn(k) ? '' : 'disabled'}>Horn</label>`;
    };
    // spec planner: the projection on typical phase times for the scale, or the last report's medians
    const times = st.lastTimes || TYPICAL_TIMES[team()] || TYPICAL_TIMES[5];
    const ft = (t) => { const x = t * 0.6; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
    const KIND = { maul: 'Maul', claws: 'Claws', zcb: 'ZCB', horn: 'Horn' };
    const planRow = (p, k) => {
      const pr = projectPlayer({ startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge, lbCycles: Number(p.lbCycles || 0),
        specs: specsOf(p, k).map((x) => ({ ...x, horn: !!x.horn && hasHorn(k) })) }, times);
      const cells = [0, 1, 2].map((ph) => pr.items.filter((it) => it.ph === ph).map((it) => {
        const name = `${KIND[it.kind]}${it.backup ? ' (backup, if needed)' : ''}`;
        if (it.at == null) return `<div class="warn small">${name}: not enough spec</div>`;
        const wait = it.at - it.earliest;
        return `<div class="small">${name} ${ft(it.at)}${wait > 0 ? ` <span class="${wait >= 10 ? 'warn' : 'muted'}">(${(wait * 0.6).toFixed(1)}s late, waiting for spec)</span>` : ''}${it.surge ? ' <span class="muted">+ surge</span>' : ''}</div>`;
      }).join('') || '<span class="muted small">-</span>');
      const short = pr.items.some((it) => it.at == null);
      if (short) notes.push(`${pname(k)} won't have the spec for: ${pr.items.filter((it) => it.at == null).map((it) => `P${it.ph + 1} ${KIND[it.kind]}`).join(', ')} (see the spec planner).`);
      return `<tr><td class="rl">${esc(pname(k))}</td>${cells.map((c) => `<td>${c}</td>`).join('')}<td>${pr.endSpec}%</td><td class="small">${pr.regens.map(ft).join(', ') || '-'}</td></tr>`;
    };
    const planRows = st.players.map(planRow).join('');
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
        <label title="Surge potions the team can use in this room (the solver won't use more - keep some back for another room)">Surge potions<select data-rset="surgeLimit">${Array.from({ length: team() + 1 }, (_, n) => `<option value="${n}" ${n === surgeLimit ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label title="Lightbearer rings in the raid: no more players than this can wear one">Lightbearers<select data-rset="lbRings">${Array.from({ length: team() + 1 }, (_, n) => `<option value="${n}" ${n === lbRings ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
</div>
      ${notes.map((x) => `<div class="warn small" style="margin-bottom:4px">${esc(x)}</div>`).join('')}
      ${tips.map((x) => `<div class="muted small" style="margin-bottom:4px">Recommended: ${esc(x)}</div>`).join('')}
      ${runs.length ? `<div class="muted small" style="margin-bottom:4px">Run: every player runs the ${runs.map((i) => (i ? 'second' : 'first')).join(' and ')} maze instead of skipping it - a real maze each time; usually 4-12 ticks slower than a skip.</div>` : ''}
      <style>.sote-cfg th{white-space:normal !important;max-width:96px;vertical-align:bottom}</style>
      <div class="scroll"><table class="bt sote-cfg">
        <tr><th></th><th title="Spec % at the start of the room. 95: their first regen comes the tick after their first special attack, then as normal">Start spec (%)</th><th title="Drink a surge with their first special attack">Surge</th><th title="How many spec regens they wear Lightbearer for (a regen every 25 ticks on it), then swap to Ultor">Lightbearer cycles</th><th title="Phoenix necklaces they bring">Phoenix necklaces</th><th title="Sharks they bring">Sharks</th><th title="Guthix rest sips they bring (a 4 dose = 4 sips): heal 5 a sip, on the potion delay (can go with a shark on the same tick)">Guthix rest sips</th><th title="Prayer restore sips they bring (default 3): a redemption skip takes one a maze; after the second maze a redemption skipper uses spares on locator orb Redemption procs to Heal Other">Restore sips</th><th title="Their first attack, before the room starts">Prefire</th><th title="How they cross the first maze. Pneck: stall with a phoenix necklace. Redemption: orb down to 1 HP and stall with Redemption (locator orb; 1-4s). Shark: skip away from the others, eating through it (one player). Run: everyone runs it">First maze</th><th title="How they cross the second maze">Second maze</th></tr>
        ${st.players.map(row).join('')}
      </table></div>
      <details class="video" data-specs ${st.specsOpen === false ? '' : 'open'} style="margin-top:14px"><summary>Specs</summary>
        <p class="muted small" style="margin-top:8px">What each player specs in each phase. Planned specs go off as early as possible (P1 mauls on their first hit after the prefire, a ZCB once the phase's mauls have gone off, claws once they've landed); a spec they can't afford yet waits for a regen. Horn needs a Soulflame horn in the Gear tab.</p>
        <div class="scroll"><table class="bt"><tr><th></th><th>P1</th><th>P2</th><th>P3</th></tr>
          ${st.players.map((p, k) => `<tr><td class="rl">${esc(pname(k))}</td>${[0, 1, 2].map((ph) => `<td style="white-space:nowrap">${specCell(p, k, ph)}</td>`).join('')}</tr>`).join('')}
        </table></div>
        <h4 style="margin:12px 0 4px">Spec planner</h4>
        <p class="muted small" style="margin:0 0 6px">When each planned spec can go off, from their start spec, Lightbearer cycles and surge, on ${st.lastTimes ? 'the phase times of your last report (medians)' : `typical ${team()}-man phase times`} (P1 ${ft(times.p1)}, mazes ${(times.maze1 * 0.6).toFixed(1)}s / ${(times.maze2 * 0.6).toFixed(1)}s, P2 ${(times.p2 * 0.6).toFixed(1)}s, P3 ${(times.p3 * 0.6).toFixed(1)}s). Times are room time.</p>
        <div class="scroll"><table class="bt"><tr><th></th><th>P1</th><th>P2</th><th>P3</th><th>End spec</th><th>Regens</th></tr>${planRows}</table></div>
      </details>`;
  }

  root.addEventListener('change', (e) => {
    const t = e.target, st = tstate();
    if (t.dataset.gearset != null) { st.gearSet = t.value; persist(); render(); return; }
    if (t.dataset.rset) { st[t.dataset.rset] = Number(t.value); persist(); render(); return; }
    if (t.dataset.sp) {
      const [k, ph, f] = t.dataset.sp.split('|'), p = st.players[Number(k)];
      p.specs = (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[Number(k)] || [{}, {}, {}])).map((x) => ({ spec: 'none', backup: false, horn: false, ...x }));
      p.specs[Number(ph)][f] = f === 'spec' ? t.value : t.checked;
      persist(); render(); return;
    }
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

  // ---- report: the players as set up here (gear from the Gear set), raids in batches so the page stays responsive
  let job = null, lastPage = null;
  const repState = () => { const st = tstate(); st.report ||= { raids: 2000, entry: 0, seed: '', bps: '' }; return st.report; };
  const showRep = () => { const r = repState(); $r('raids').value = r.raids; $r('entry').value = r.entry; $r('seed').value = r.seed; $r('bps').value = r.bps; };
  rep.addEventListener('input', (e) => { const k = e.target.dataset.r; if (!k) return; const r = repState(); r[k] = k === 'raids' || k === 'entry' ? Number(e.target.value) : e.target.value; persist(); });
  rep.addEventListener('change', (e) => { const k = e.target.dataset.r; if (!k) return; const r = repState(); r[k] = k === 'raids' || k === 'entry' ? Number(e.target.value) : e.target.value; persist(); });
  const btn = (a) => rep.querySelector(`[data-act="${a}"]`);
  const playersNow = () => {
    const st = tstate(), g = loadGear(), set = gearSet(g, team(), st.gearSet), gp = set ? playersOf(set, team()) : null;
    return st.players.map((p, k) => {
      const gear = gp ? gp[k] : blankPlayer(k), orb = !!gear.locator;
      return { name: gear.name || `Player ${k + 1}`, gear, own: true, prefire: p.prefire || '', startSpec: p.startSpec === 95 ? 95 : 100, surge: !!p.surge,
        lbCycles: Number(p.lbCycles || 0), pnecks: Number(p.pnecks || 0), sharks: Number(p.sharks || 0), rests: Number(p.rests || 0), restores: Number(p.restores ?? 3),
        mazes: Array.isArray(p.mazes) ? p.mazes : defaultMazes(Number(p.pnecks || 0), orb, team()),
        specs: (Array.isArray(p.specs) ? p.specs : (defaultSpecs(team())[k] || [])).map((x) => ({ ...x, horn: !!x.horn && !!gear.horn })) };
    });
  };
  rep.addEventListener('click', (e) => {
    const a = e.target.dataset.act; if (!a) return;
    if (a === 'stop') { if (job) job.stop = true; return; }
    if (a === 'dl' && lastPage) {
      const url = URL.createObjectURL(new Blob([lastPage], { type: 'text/html' })), el = document.createElement('a');
      el.href = url; el.download = `sotetseg-${team()}man-report.html`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (a !== 'run' || job) return;
    const r = repState(), err = rep.querySelector('[data-rerr]'), status = rep.querySelector('[data-rstatus]'), out = rep.querySelector('[data-rout]');
    err.textContent = '';
    let bps = [];
    try { bps = String(r.bps || '').trim() ? parseBreakpoints(r.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const n = Math.max(100, Number(r.raids) || 2000), t = team(), players = playersNow();
    const seed = String(r.seed || '').trim() || `r${Date.now()}`, res = newSoteResult();
    job = { stop: false }; const me = job;
    btn('run').disabled = true; btn('stop').disabled = false;
    let i = 0;
    const step = () => {
      if (me.stop || i >= n) {
        job = null; btn('run').disabled = false; btn('stop').disabled = true;
        if (!res.runs) { status.textContent = 'Stopped.'; return; }
        const opts = { breakpoints: bps, entry: r.entry };
        out.innerHTML = soteReportHtml(res, t, opts); lastPage = soteReportPage(res, t, opts); btn('dl').disabled = false;
        const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
        if (res.total.length) { tstate().lastTimes = Object.fromEntries(Object.entries(res.split).map(([k2, v]) => [k2, med(v)])); persist(); render(); }
        status.textContent = `${me.stop ? 'Stopped at' : 'Done:'} ${res.runs.toLocaleString()} raids.`;
        return;
      }
      const to = Math.min(n, i + 50);
      try { addSoteRaids(res, players, t, i, to, { seed, entry: Number(r.entry) || 0 }); } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      i = to; status.textContent = `Running... ${i.toLocaleString()} / ${n.toLocaleString()} raids`;
      setTimeout(step, 0);
    };
    step();
  });

  // ---- optimizer: the entry instance (i0-i3) for the setup above, on the same raids at each
  let ojob = null;
  const $o = (k) => opt.querySelector(`[data-o="${k}"]`), obtn = (a) => opt.querySelector(`[data-oact="${a}"]`);
  const optState = () => { const st = tstate(); st.opt ||= { raids: 2000, seed: '', bps: '' }; return st.opt; };
  const showOpt = () => { const o = optState(); $o('raids').value = o.raids; $o('seed').value = o.seed; $o('bps').value = o.bps; };
  for (const ev of ['input', 'change']) opt.addEventListener(ev, (e) => { const k = e.target.dataset.o; if (!k) return; optState()[k] = k === 'raids' ? Number(e.target.value) : e.target.value; persist(); });
  const tm = (t) => { const x = t * 0.6; return `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`; };
  opt.addEventListener('click', (e) => {
    const a = e.target.dataset.oact;
    if (e.target.dataset.useEntry != null) { repState().entry = Number(e.target.dataset.useEntry); persist(); showRep(); rep.open = true; rep.scrollIntoView({ behavior: 'smooth' }); return; }
    if (!a) return;
    if (a === 'stop') { if (ojob) ojob.stop = true; return; }
    if (a !== 'run' || ojob) return;
    const o = optState(), err = opt.querySelector('[data-oerr]'), status = opt.querySelector('[data-ostatus]'), out = opt.querySelector('[data-oout]');
    err.textContent = '';
    let bps = [];
    try { bps = String(o.bps || '').trim() ? parseBreakpoints(o.bps) : []; } catch (x) { err.textContent = x.message; return; }
    const n = Math.max(100, Number(o.raids) || 2000), t = team(), players = playersNow();
    const seed = String(o.seed || '').trim() || `o${Date.now()}`, res = [0, 1, 2, 3].map(() => newSoteResult());
    ojob = { stop: false }; const me = ojob;
    obtn('run').disabled = true; obtn('stop').disabled = false;
    let entry = 0, i = 0;
    const finish = () => {
      ojob = null; obtn('run').disabled = false; obtn('stop').disabled = true;
      const rows = res.map((r, k) => {
        const v = r.total.slice().sort((x, y) => x - y), med = v[Math.floor(v.length / 2)], q10 = v[Math.max(0, Math.floor(v.length * 0.1) - 1)];
        const sp = (key) => { const w = r.split[key].slice().sort((x, y) => x - y); return w[Math.floor(w.length / 2)]; };
        const at = bps.map((b) => (v.length ? v.filter((x) => x * 0.6 <= b + 1e-9).length / v.length : 0));
        return { k, n: v.length, med, q10, fast: v[0], at, maze: v.length ? sp('maze1') + sp('maze2') : null, p1: v.length ? sp('p1') : null };
      }).filter((r) => r.n);
      if (!rows.length) { status.textContent = 'Stopped.'; return; }
      const asc = [...bps].sort((x, y) => x - y);                     // fastest breakpoint first
      const key = (r) => [...asc.map((b) => -r.at[bps.indexOf(b)]), r.med, r.q10];
      rows.sort((x, y) => { const a1 = key(x), b1 = key(y); for (let j = 0; j < a1.length; j++) if (a1[j] !== b1[j]) return a1[j] - b1[j]; return 0; });
      const best = rows[0].k, fs = (b) => { const r = Math.round(b % 60 * 10) / 10; return `${Math.floor(b / 60)}:${r < 10 ? '0' : ''}${r}`; };
      out.innerHTML = `<div class="vz-report"><h3 style="margin-top:0">${t}-man Sotetseg: entry instance</h3>
        <div class="sub">${rows[0].n.toLocaleString()} raids per instance, the same raids at each · best: <b>i${best}</b>${bps.length ? ` (most finished by ${fs(asc[0])})` : ' (lowest median)'} · maze = both mazes, proc to interactable (medians)</div>
        <table><tr><th>Rank</th><th>Entry</th><th>Median</th><th>Top 10%</th><th>Fastest</th>${bps.map((b) => `<th>${fs(b)} or faster</th>`).join('')}<th>Mazes</th><th>P1</th><th></th></tr>
        ${rows.map((r, j) => `<tr${r.k === best ? ' style="font-weight:700"' : ''}><td>${j + 1}</td><td>i${r.k}</td><td>${tm(r.med)}</td><td>${tm(r.q10)}</td><td>${tm(r.fast)}</td>${r.at.map((x) => `<td>${(x * 100).toFixed(1)}%</td>`).join('')}<td>${(r.maze * 0.6).toFixed(1)}s</td><td>${(r.p1 * 0.6).toFixed(1)}s</td><td><button class="ghost sm" data-use-entry="${r.k}">Use in report</button></td></tr>`).join('')}
        </table></div>`;
      status.textContent = me.stop ? 'Stopped early - partial results.' : 'Done.';
    };
    const step = () => {
      if (me.stop || entry > 3) { finish(); return; }
      const to = Math.min(n, i + 50);
      try { addSoteRaids(res[entry], players, t, i, to, { seed, entry }); } catch (x) { err.textContent = `Couldn't run: ${x.message}`; me.stop = true; }
      i = to; if (i >= n) { entry++; i = 0; }
      status.textContent = `Running... i${Math.min(entry, 3)}: ${(entry > 3 ? n : i).toLocaleString()} / ${n.toLocaleString()} raids`;
      setTimeout(step, 0);
    };
    step();
  });

  return { refresh: () => { state = load(); render(); showRep(); showOpt(); } };
}
