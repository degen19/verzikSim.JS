// Verzik Show raid: plays a setup's raids to pick the median / top 25% / top 10% / fastest one, replays it with the
// tick log on, and reads the Attack Timeline (attacks, damage, her attacks and HP, phase points) from that log - the
// Verzik engines aren't changed for it. Used by the Report, Optimizer and Verz Solver.
import { runOneSplit, runOneLogged, raidRng } from './engine/optimize.js';
import { raidChoices, raidTitle, pickRaid, timelineHtml } from './raidview.js';

const RAIDS = 2000, SEED = 9191;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (t) => `${Math.floor(t * 0.6 / 60)}:${(t * 0.6 % 60).toFixed(1).padStart(4, '0')}`;

// what a queued attack's text says -> its timeline code
const WEAPONS = [[/^Scythe/i, 'S'], [/^Dawn spec/i, 'D'], [/^Eye of ayak/i, 'E'], [/^Sulphur blades/i, 'SuB'], [/^Blowpipe/i, 'BP'],
  [/^Sang/i, 'T'], [/^(Dragon )?claws?|^CLAW SPEC/i, 'C'], [/^claw scratch/i, 'Cs'], [/^HALBERD|^Halberd/i, 'Ch'], [/^SHADOW|^Shadow/i, 'Sh'],
  [/^ZCB/i, 'Z'], [/^Elder maul/i, 'EM'], [/^Bandos/i, 'BGS'], [/^Obligator|^Swift blade|^3-tick/i, '3t'], [/^blowpipe at purple/i, 'BP'], [/^TICK FILL/i, 'F']];
const codeOf = (txt) => { for (const [re, c] of WEAPONS) if (re.test(txt)) return c; return txt.split(/[\s(]/)[0].slice(0, 3); };

// the weapon each attack code is made with (the tooltip's gear line)
const WEAPON_OF = { S: 'Scythe of vitur', D: 'Dawnbringer', E: 'Eye of ayak', SuB: 'Sulphur blades', BP: 'Toxic blowpipe', T: 'Sanguinesti staff',
  C: 'Dragon claws', Cs: 'Dragon claws', Ch: 'Crystal halberd', Sh: "Tumeken's shadow", Z: 'Zaryte crossbow', EM: 'Elder maul', BGS: 'Bandos godsword', H: 'Soulflame horn' };

/** The timeline trace from a raid's log. names: the players; cfgs (optional): their setups - the tooltips' gear, ring
 *  and start spec. Spec is followed through the log's "X% -> Y%" changes; the next regen is the player's next regen line. */
export function verzTrace(log, names, cfgs = null) {
  const trace = [], last = new Map(), byName = new Map(names.map((n, i) => [n, i]));
  const spec = names.map((_, k) => (cfgs && cfgs[k] ? Number(cfgs[k].startSpec ?? 100) : null));
  const ring = names.map((_, k) => (cfgs && cfgs[k] && cfgs[k].lightbearerOn ? 'Lightbearer' : 'Ultor ring'));
  const regens = names.map(() => []);                                 // each player's regen ticks (for "next regen")
  // combat stats: boosted 118s / 99 Ranged and Magic at the start, then each supply / drain line's "Atk N Str N Def N"
  const stats = names.map(() => ({ atk: 118, str: 118, def: 118, rng: 99, mag: 99 }));
  const statText = (k) => { const x = stats[k]; return `Attack ${x.atk} · Strength ${x.str} · Defence ${x.def} · Ranged ${x.rng} · Magic ${x.mag}`; };
  const SUPPLY = /brew|restore|super combat|shark|surge|heart|Magic boosted|phoenix|REDEMPTION|HEAL OTHER|catch-up|ranging|divine|saturated/i;
  for (const line of log) {
    const m = line.match(/^t\s*(\d+)\s+(?:s\d\s+)?(?:r\d+\s+)?(.+?): (?:(?:R forced |natural |Lightbearer )?regen |regen the tick after)/);
    if (m && byName.has(m[2])) regens[byName.get(m[2])].push(+m[1]);
  }
  const armour = (k, code) => {
    const c = cfgs && cfgs[k]; if (!c) return null;
    const amulet = c.amulet ? (/fury/i.test(c.amulet) ? 'Amulet of blood fury' : `Amulet of ${String(c.amulet).toLowerCase()}`) : null;
    return [WEAPON_OF[code], c.helm, c.body, c.legs, amulet, ring[k]].filter(Boolean).join(', ');
  };
  let phase = 'P1', hp = null, lastT = 0;
  const hpAt = (t) => { if (hp != null) trace.push({ t, hp: Math.max(0, hp), phase }); };
  for (const line of log) {
    const sec = line.match(/=== (PHASE 2|RED CRABS|PHASE 3) ===/);
    if (sec) {
      if (sec[1] === 'PHASE 2') { const k = line.match(/K = t(\d+)/); phase = 'P2'; if (k) trace.push({ t: +k[1], mark: 'P2' }); }
      if (sec[1] === 'RED CRABS') { const k = line.match(/proc t(\d+)/); phase = 'Reds'; if (k) trace.push({ t: +k[1], mark: 'Reds' }); }
      if (sec[1] === 'PHASE 3') { const k = line.match(/P3 tick 1 = t(\d+)/); phase = 'P3'; if (k) trace.push({ t: +k[1], mark: 'P3' }); }
      const h = line.match(/Verzik (\d+)/); if (h) hp = +h[1];
      continue;
    }
    if (/^\s*Verzik P1 HP (\d+)/.test(line)) { hp = +line.match(/HP (\d+)/)[1]; trace.push({ t: 1, mark: 'P1' }); continue; }
    const m = line.match(/^t\s*(\d+)\s+(?:s\d\s+)?(?:r\d+\s+)?(.*)$/); if (!m) continue;
    const t = +m[1], rest = m[2];
    if (t !== lastT) { hpAt(lastT); lastT = t; }
    const v = rest.match(/-> Verzik (-?\d+)/); if (v) hp = +v[1];
    if (v && phase === 'P3' && hp <= 0 && !trace.some((x) => x.mark === 'Dies')) trace.push({ t, mark: 'Dies' });
    if (/^VERZIK P1 HP 0/.test(rest)) { trace.push({ t, mark: 'P1 dies' }); continue; }
    if (/^VERZIK P2 HP 0/.test(rest)) { trace.push({ t, mark: 'P2 dies' }); continue; }
    if (/^HEALING PHASE STARTS/.test(rest)) continue;
    if (/^\*\*\* BELOW 20%/.test(rest)) { trace.push({ t, mark: '20%' }); continue; }
    const wb = rest.match(/^Verzik moves to webs.*webs t(\d+)/); if (wb) { trace.push({ t: +wb[1], mark: 'Webs' }); continue; }
    const va = rest.match(/^VERZIK (auto|attack) #\d+(?: \([^)]*\))?:? ?(.*)$/);
    if (va) {
      if (/bounce chance/.test(rest)) continue;
      if (/PURPLE CRAB/.test(rest)) { trace.push({ t, boss: 'Purple crab', kind: 'purple', short: 'PC', tip: 'sends out a purple crab' }); continue; }
      const lt = rest.match(/LIGHTNING -> (.+?) \(.*?rebound (\d+) on Verzik t(\d+)/) || rest.match(/LIGHTNING \(rebound (\d+) lands t(\d+)\)/);
      if (/LIGHTNING/.test(rest)) { trace.push({ t, boss: 'Lightning', kind: 'lightning', short: 'L', tip: `lightning${lt && lt.length === 4 ? ` -> ${lt[1]} (rebound ${lt[2]} on her t${lt[3]})` : lt ? ` (rebound ${lt[1]} on her t${lt[2]})` : ''}` }); continue; }
      const bh = rest.match(/blood heal \+(\d+)/);
      if (bh) { trace.push({ t, boss: 'Blood heal', short: 'BH', tip: `blood heal +${bh[1]}` }); continue; }
      const style = /magic/.test(rest) ? 'Magic' : /ranged/.test(rest) ? 'Ranged' : 'Attack';
      trace.push({ t, boss: style, tip: style === 'Attack' ? 'attack' : `${style.toLowerCase()} auto` }); continue;
    }
    if (/^VERZIK GREEN BALL/.test(rest)) { trace.push({ t, boss: 'Green ball', short: 'GB', tip: 'green ball' }); continue; }
    // the purple crab healing her / its explosion and lightning rebounds hitting her
    const ph = rest.match(/^purple crab heals Verzik (\d+) ->/i);
    if (ph) { trace.push({ t, boss: 'Purple heal', kind: 'heal', short: '+', tip: `the purple crab heals her +${ph[1]}` }); continue; }
    const px = rest.match(/^purple crab explosion (\d+) ->/i);
    if (px) { trace.push({ t, boss: 'Purple explosion', kind: 'boom', short: 'PX', tip: `purple crab explosion - ${px[1]} damage to her` }); continue; }
    const lr = rest.match(/^Lightning rebound (\d+) ->/i);
    if (lr) { trace.push({ t, boss: 'Lightning rebound', kind: 'rebound', short: 'LR', tip: `lightning rebound - ${lr[1]} damage to her` }); continue; }
    const ps = rest.match(/-> (.+?)(?: DC)? spec (\d+(?:\.\d+)?)% -> (\d+(?:\.\d+)?)%/);
    if (ps && byName.has(ps[1])) spec[byName.get(ps[1])] = +ps[3];
    const pm = rest.replace(/^P\d->P\d\s+/, '').match(/^(.+?): (.*)$/); if (!pm || !byName.has(pm[1])) continue;
    const i = byName.get(pm[1]), what = pm[2];
    if (/swaps to Ultor/.test(what)) ring[i] = 'Ultor ring';
    const sm = what.match(/Atk (\d+) Str (\d+)(?: Def (\d+))?/); if (sm) { stats[i].atk = +sm[1]; stats[i].str = +sm[2]; if (sm[3]) stats[i].def = +sm[3]; }
    const mb = what.match(/Magic boosted to (\d+)/); if (mb) stats[i].mag = +mb[1];
    if (SUPPLY.test(what) && !/held for|would be|kept at|window over/.test(what)) trace.push({ t, i, supply: what.replace(/\s*\(?Atk \d+ Str \d+(?: Def \d+)?\)?/, '').replace(/^P\d->P\d /, '') });
    const sc = what.match(/(\d+(?:\.\d+)?)% -> (\d+(?:\.\d+)?)%/);
    const before = spec[i];
    if (sc) spec[i] = +sc[2];
    const vg = what.match(/VENG (\d+) -> Verzik/);
    if (vg) { trace.push({ t, i, veng: +vg[1] }); continue; }
    if (/^SOULFLAME HORN/.test(what)) { const fr = what.match(/guaranteed first hit for (.*)$/); trace.push({ t, i, code: 'H', what: `Soulflame horn${fr ? ` - guaranteed first hit for ${fr[1]}` : ''}` }); continue; }
    if (/^Thrall|^regen|^spec |^surge|swaps to|boak, can't|lines up with|bounced|^last scythe before|skips the bounce|has spec for|no claws on|off the team|back on the team|\(tank\)/.test(what) && !/ZCB/.test(what)) continue;
    if (/lands after the kill/.test(what)) continue;
    // a damage line: credit the player's last attack
    const dmg = what.match(/(?:hit \d+ (?:on \w+ crab )?|lands |spec lands |^\S.*? )(-?\d+)(?: \([^)]*\))? -> (Verzik|crab) -?\d+/);
    if (dmg && !/queued/.test(what)) {
      const a = last.get(i);
      if (a) { a.dmg = (a.dmg || 0) + Math.max(0, +dmg[1]); a.landed = t; if (dmg[2] === 'crab') a.crab = true; }
      continue;
    }
    if (/^R forced regen/.test(what)) { trace.push({ t, i, code: 'R' }); continue; }
    // an attack queued this tick
    const q = what.match(/^(.*?) queued/) || what.match(/^last swing before the shield - (\w+)/);
    const txt = q ? q[1] : what;
    if (!q && !/^(Scythe|SHADOW|ZCB|CLAW SPEC|HALBERD SPEC|claw scratch|blowpipe at purple|Blowpipe on|TICK FILL|no claws - HALBERD)/.test(what)) continue;
    const a = { t, i, code: codeOf(txt.replace(/^no claws - /, '')), what: txt.split(' (')[0] };
    if (spec[i] != null) {
      a.spec = sc ? +sc[1] : before; a.specAfter = spec[i];
      const nx = regens[i].find((x) => x > t); a.regenIn = a.spec >= 100 || nx == null ? null : nx - t;
      a.gear = armour(i, a.code);
    }
    a.stats = statText(i);
    const crab = what.match(/on (?:their )?(\w+) crab/), purple = /purple crab/i.test(what);
    a.target = purple ? 'the purple crab' : crab ? `the ${crab[1]} red crab` : 'Verzik';
    trace.push(a); last.set(i, a);
    if (/PASSES|-> \[/.test(what) && /blowpipe at purple/.test(what)) a.landed = t;
  }
  hpAt(lastT);
  // phases forward-filled per tick for the hover (the log only has HP when it changes)
  const hpLog = trace.filter((x) => x.hp != null).sort((a, b) => a.t - b.t);
  const out = trace.filter((x) => x.hp == null);
  let k = 0, cur = null;
  for (let t = 1; t <= lastT; t++) { while (k < hpLog.length && hpLog[k].t <= t) cur = hpLog[k++]; if (cur) out.push({ t, hp: cur.hp, phase: cur.phase }); }
  return out;
}

const LEGEND = 'R forced regen · F tick fill · skull: vengeance · supplies: shark icon · dots on the left: yellow brew, pink restore, white surge, green super combat, grey anything else · heart redemption proc · her row: red her attacks (BH blood heal, M magic, R ranged, GB green ball), purple PC a purple crab sent out, green + the purple heals her, orange PX its explosion, gold L lightning and LR its rebound - hover any cell for details';
const store = new Map();
/** The Show raid buttons for a setup (key: unique on the page). */
export function verzRaidBar(key, cfgs, team, bps = []) {
  store.set(key, { cfgs, team, raids: null });
  return `<div class="row wrap" style="gap:6px;margin-top:8px;align-items:center"><b class="small">Show raid</b>${raidChoices(bps).map(([k, l]) => `<button class="ghost sm" data-vraid="${esc(key)}|${k}">${l}</button>`).join('')}<span class="muted small" data-vraidmsg="${esc(key)}"></span></div><div data-vraidout="${esc(key)}"></div>`;
}
/** A Show raid button was clicked (root: where the buttons are). */
export async function showVerzRaid(btn, root) {
  const [key, which] = btn.dataset.vraid.split(/\|(?=[^|]*$)/), e = store.get(key);
  const box = root.querySelector(`[data-vraidout="${CSS.escape(key)}"]`), msg = root.querySelector(`[data-vraidmsg="${CSS.escape(key)}"]`);
  if (!e || !box) return;
  if (!e.raids) {                                                     // the setup's raids, once (in chunks: the page stays live)
    const raids = [];
    for (let i = 0; i < RAIDS; i += 100) {
      for (let j = i; j < Math.min(RAIDS, i + 100); j++) { const r = runOneSplit(e.cfgs, e.team, raidRng(SEED, j)); if (r.end != null) raids.push({ i: j, total: r.end, key: r.key }); }
      if (msg) msg.textContent = `Playing ${RAIDS.toLocaleString()} raids to find it... ${Math.min(RAIDS, i + 100).toLocaleString()}`;
      await new Promise((r) => setTimeout(r, 0));
    }
    e.raids = raids; if (msg) msg.textContent = '';
  }
  const pk = pickRaid(e.raids, e.raids.length, which);             // of the successful raids (failed ones have no room time)
  if (!pk) { box.innerHTML = '<p class="muted small">Too few successful raids for that one.</p>'; return; }
  const r = runOneLogged(e.cfgs, e.team, raidRng(SEED, pk.i)), names = e.cfgs.map((c, k) => c.name || `Player ${k + 1}`);
  box.innerHTML = timelineHtml({ trace: verzTrace(r.log, names, e.cfgs), names, bossName: 'Verzik', end: r.end,
    title: `${raidTitle(which, 'Verzik')} - ${fmt(pk.total)} (of the ${e.raids.length.toLocaleString()} successful raids out of ${RAIDS.toLocaleString()} played for this; ${pk.typical} of the ${pk.n} that ended at ${fmt(pk.total)} went this way)`, legend: LEGEND });
}
