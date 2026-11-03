// Verzik Show raid: plays a setup's raids to pick the median / top 25% / top 10% / fastest one, replays it with the
// tick log on, and reads the Attack Timeline (attacks, damage, her attacks and HP, phase points) from that log - the
// Verzik engines aren't changed for it. Used by the Report, Optimizer and Verz Solver.
import { runOneSplit, runOneLogged, raidRng } from './engine/optimize.js';
import { pickRaid, timelineHtml, successSteps, failSteps, raidNav } from './raidview.js';

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
  const lastPot = names.map(() => -99);                                // each player's last potion sip (3 ticks apart)
  const POT = /brew|restore|super combat|surge|divine|ranging|saturated/i;
  const hpAt = (t) => { if (hp != null) trace.push({ t, hp: Math.max(0, hp), phase }); };
  for (const line of log) {
    const sec = line.match(/=== (PHASE 2|RED CRABS|PHASE 3) ===/);
    if (sec) {
      if (sec[1] === 'PHASE 2') { const k = line.match(/K = t(\d+)/); phase = 'P2'; if (k) trace.push({ t: +k[1], mark: 'P2' }); }
      if (sec[1] === 'RED CRABS') {
        const k = line.match(/proc t(\d+)/), sh = line.match(/Shield r0-r(\d+)/); phase = 'Reds';
        if (k) trace.push({ t: +k[1], mark: 'Reds' });
        // her healing shield: from the tick after the proc (r1 - the first healing tick) to its last (rN); those ticks tinted
        if (k && sh) { trace.push({ t: +k[1] + 1, mark: 'Healing Shield' }); for (let x = +k[1] + 1; x <= +k[1] + +sh[1]; x++) trace.push({ t: x, shade: 'shield' }); }
      }
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
      if (/PURPLE CRAB/.test(rest)) { trace.push({ t, boss: 'Purple crab', kind: 'purple', short: 'PC', icon: 'Nylocas_athanatos', prio: 3, tip: 'sends out a purple crab' }); continue; }
      const lt = rest.match(/LIGHTNING -> (.+?) \(.*?rebound (\d+) on Verzik t(\d+)/) || rest.match(/LIGHTNING \(rebound (\d+) lands t(\d+)\)/);
      if (/LIGHTNING/.test(rest)) { trace.push({ t, boss: 'Lightning', kind: 'lightning', short: 'L', icon: 'Lightning', prio: 3, tip: `lightning${lt && lt.length === 4 ? ` -> ${lt[1]} (rebound ${lt[2]} on her t${lt[3]})` : lt ? ` (rebound ${lt[1]} on her t${lt[2]})` : ''}` }); continue; }
      const bh = rest.match(/blood heal \+(\d+)/);
      if (bh) { trace.push({ t, boss: 'Blood heal', short: 'BH', icon: 'Verzik_P2', ring: '#ff69b4', tip: `blood heal +${bh[1]}` }); continue; }
      const style = /magic/.test(rest) ? 'Magic' : /ranged/.test(rest) ? 'Ranged' : 'Attack';
      // her phase's icon; P3: a green border for a ranged auto, blue for magic
      const icon = phase === 'P1' ? 'Verzik_P1' : phase === 'P3' ? 'Verzik_P3' : 'Verzik_P2';
      const ring = phase === 'P3' ? (style === 'Ranged' ? '#3fbf6f' : style === 'Magic' ? '#4a8cff' : null) : null;
      trace.push({ t, boss: style, icon, ...(ring ? { ring } : {}), tip: style === 'Attack' ? 'attack' : `${style.toLowerCase()} auto` }); continue;
    }
    if (/^VERZIK GREEN BALL/.test(rest)) { trace.push({ t, boss: 'Green ball', short: 'GB', tip: 'green ball' }); continue; }
    // the purple crab healing her / its explosion and lightning rebounds hitting her
    const ph = rest.match(/^purple crab heals Verzik (\d+) ->/i);
    if (ph) { trace.push({ t, boss: 'Purple heal', kind: 'heal', short: '+', icon: 'Nylocas_athanatos', ring: '#3fbf6f', prio: 1, tip: `the purple crab heals her +${ph[1]}` }); continue; }
    const px = rest.match(/^purple crab explosion (\d+) ->/i);
    if (px) { trace.push({ t, boss: 'Purple explosion', kind: 'boom', short: 'PX', icon: 'Nylocas_athanatos', ring: '#e5333f', prio: 2, tip: `purple crab explosion - ${px[1]} damage to her` }); continue; }
    const lr = rest.match(/^Lightning rebound (\d+) ->/i);
    if (lr) { trace.push({ t, boss: 'Lightning rebound', kind: 'rebound', short: 'LR', icon: 'Lightning', ring: '#e5333f', prio: 2, tip: `lightning rebound - ${lr[1]} damage to her` }); continue; }
    const ps = rest.match(/-> (.+?)(?: DC)? spec (\d+(?:\.\d+)?)% -> (\d+(?:\.\d+)?)%/);
    if (ps && byName.has(ps[1])) spec[byName.get(ps[1])] = +ps[3];
    const pm = rest.replace(/^(?:P\d->P\d|shield)\s+/, '').match(/^(.+?): (.*)$/); if (!pm || !byName.has(pm[1])) continue;   // (P1->P2 / reds shield sip windows)
    const i = byName.get(pm[1]), what = pm[2];
    if (/swaps to Ultor/.test(what)) ring[i] = 'Ultor ring';
    const xf = what.match(/^spec transfer -> (.+?) \(/);
    if (xf) {
      trace.push({ t, i, xfer: `Spec transfer to ${xf[1]} - they go to 100%; ${pm[1]} to 0% and -10 HP` });
      spec[i] = 0; if (byName.has(xf[1])) spec[byName.get(xf[1])] = 100;
      continue;
    }
    const sm = what.match(/Atk (\d+) Str (\d+)(?: Def (\d+))?/); if (sm) { stats[i].atk = +sm[1]; stats[i].str = +sm[2]; if (sm[3]) stats[i].def = +sm[3]; }
    const mb = what.match(/Magic boosted to (\d+)/); if (mb) stats[i].mag = +mb[1];
    if (SUPPLY.test(what) && !/held for|would be|kept at|window over/.test(what)) {
      // a sip window (P1->P2, reds shield, P2->P3) logs its slots on one line, " | " between them: drawn 3 ticks apart (visual)
      const slots = what.replace(/\s*,?\s*\(?Atk \d+ Str \d+(?: Def \d+)?\)?/, '').replace(/^P\d->P\d /, '').split(' | ');
      // potions 3 ticks apart: a window's first sip waits for the player's last one (the window line comes on its first tick)
      let at = t;
      slots.forEach((x, k) => {
        if (POT.test(x)) { at = Math.max(at, lastPot[i] + 3); lastPot[i] = at; }
        trace.push({ t: at, i, supply: x, ...(slots.length > 1 ? { slot: `sip ${k + 1} of ${slots.length} (window from tick ${t})` } : {}) });
        at += slots.length > 1 ? 3 : 0;
      });
    }
    // a thrall hit (lands the tick after it attacks)
    const th = what.match(/^Thrall (?:lands )?(\d+)\b/);                          // P1: 'Thrall lands N', later 'Thrall N'
    if (th) { trace.push({ t: t - 1, i, thrall: true, dmg: +th[1], landed: t, icon: phase === 'P1' ? 'Greater_zombie' : 'Greater_ghost' }); continue; }   // melee thrall in P1, mage after
    const sc = what.match(/(\d+(?:\.\d+)?)% -> (\d+(?:\.\d+)?)%/);
    const before = spec[i];
    if (sc) spec[i] = +sc[2];
    // a spec regen (natural, Lightbearer, or a charted forced regen): the small r in the cell's corner
    if (sc && /regen/i.test(what) && !/keeps Lightbearer|away/.test(what)) {
      trace.push({ t, i, regen: `${/R forced/.test(what) ? 'forced spec regen' : 'spec regen'} ${sc[1]}% -> ${sc[2]}%` });
      if (/^R forced regen/.test(what)) continue;
    }
    const vg = what.match(/VENG (\d+) -> Verzik/);
    if (vg) { trace.push({ t, i, veng: +vg[1] }); continue; }
    if (/^SOULFLAME HORN/.test(what)) { const fr = what.match(/guaranteed first hit for (.*)$/); trace.push({ t, i, code: 'H', what: `Soulflame horn${fr ? ` - guaranteed first hit for ${fr[1]}` : ''}` }); continue; }
    if (/^Thrall|^regen|^spec |^surge|swaps to|boak, can't|lines up with|bounced|^last scythe before|skips the bounce|has spec for|no claws on|off the team|back on the team|\(tank\)/.test(what) && !/ZCB/.test(what)) continue;
    if (/lands after (the )?kill/.test(what)) {                       // past the kill: still counts as rolled (a 50 on 10 HP rolled 50)
      const am = what.match(/ (\d+) lands after the kill/) || what.match(/rolled (\d+)/), a = last.get(i);
      if (am && a) { a.rolled = (a.rolled ?? a.dmg ?? 0) + +am[1]; if (a.landed == null) a.landed = t; }
      continue;
    }
    // a damage line: credit the player's last attack
    const dmg = what.match(/(?:hit \d+ (?:on \w+ crab )?|lands |spec lands |^\S.*? )(-?\d+)(?: \([^)]*\))? -> (Verzik|crab) -?\d+/);
    if (dmg && !/queued/.test(what)) {
      const a = last.get(i);
      if (a) { a.dmg = (a.dmg || 0) + Math.max(0, +dmg[1]); a.landed = t; if (dmg[2] === 'crab') a.crab = true; }
      continue;
    }
    // an attack queued this tick
    const q = what.match(/^(.*?) queued/) || what.match(/^last swing before the shield - (\w+)/);
    const txt = q ? q[1] : what;
    if (!q && !/^(Scythe|SHADOW|ZCB|CLAW SPEC|HALBERD SPEC|claw scratch|blowpipe at purple|Blowpipe on|TICK FILL|no claws - HALBERD|3-TICK)/.test(what)) continue;
    const a = { t, i, code: codeOf(txt.replace(/^no claws - /, '')), what: txt.split(' (')[0] };
    const rl = what.match(/-> \[([^\]]*)\]\s*$/) || what.match(/-> (\d+)\s*$/);   // the attack's hitsplats as rolled (they count even past the kill)
    if (rl) a.rolledAll = rl[1].split(',').reduce((s, x) => s + (Number(x) || 0), 0);
    if (a.code === '3t') { const wm = txt.match(/^3-TICK \(([^)]+)\)/); a.weapon = { Ayak: 'Eye of ayak' }[wm ? wm[1] : ''] || (wm ? wm[1] : a.what); }   // the actual 3-tick weapon
    if (spec[i] != null) {
      a.spec = sc ? +sc[1] : before; a.specAfter = spec[i];
      const nx = regens[i].find((x) => x > t); a.regenIn = a.spec >= 100 || nx == null ? null : nx - t;
      a.gear = armour(i, a.code);
    }
    a.stats = statText(i);
    const crab = what.match(/on (?:their )?(\w+) crab/), purple = /purple crab/i.test(what);
    a.target = purple ? 'the purple crab' : crab ? `the ${crab[1]} red crab` : 'Verzik';
    if (/RUBY PROC/.test(what)) a.ruby = true;
    const ac = what.match(/acc (\d+(?:\.\d+)?)%(?: \/ (\d+(?:\.\d+)?)%)?/);   // their accuracy for this attack (two rolls: first / second)
    if (ac) a.acc = ac[2] != null ? [ac[1] / 100, ac[2] / 100] : ac[1] / 100;
    const ex = what.match(/exp (\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/); if (ex) a.exp = [+ex[1], +ex[2]];   // expected damage: mean / variance                             // a ZCB auto's ruby proc (red border)
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

const LEGEND = 'her row: her phase icon, purple crab when she sends one (pink border: blood heal; P3 green border: ranged, blue: magic) · thrall icon (bottom right): a thrall hit · pink-tinted ticks: her healing shield (reds) · white outline: a spec regen (forced ones included) · F tick fill · skull: vengeance · supplies: shark icon · potion icons: brew, restore, super combat, surge; grey dot: anything else · heart redemption proc · lightning icon: she throws lightning (red border: it bounces back and hits her) · purple crab icon: she sends one out (green border: it heals her; red border: its explosion hits her) · GB green ball - hover any cell for details';
const store = new Map();
/** The Show raid buttons for a setup (key: unique on the page): successful raids, failed raids, and an example raid
 *  for each Dawn count P1 died in (the decision tree's branches). */
export function verzRaidBar(key, cfgs, team, bps = [], { buttons = true } = {}) {
  store.set(key, { cfgs, team, bps, raids: null });
  // Optimizer / Solver setup panels: no buttons - only the box the decision tree's "Example N Dawn" raids show in
  if (!buttons) return `<div class="row wrap" style="gap:6px;align-items:center"><span class="muted small" data-vraidmsg="${esc(key)}"></span></div><div data-vraidout="${esc(key)}"></div>`;
  // the raids are played straight away (in the background) so "View failed raids" only shows when some failed
  // - once the bar is on screen (the Solver draws one per result, most of them folded away)
  if (typeof window !== 'undefined') setTimeout(() => {
    const bar = document.querySelector(`[data-vraidmsg="${CSS.escape(key)}"]`), go = () => playRaids(store.get(key), key).catch(() => {});
    if (!bar) return;
    if (typeof IntersectionObserver === 'undefined') { go(); return; }
    const io = new IntersectionObserver((xs) => { if (xs.some((x) => x.isIntersecting)) { io.disconnect(); go(); } });
    io.observe(bar.parentElement);
  }, 50);
  const b = (k, l, t) => `<button class="ghost sm" data-vraid="${esc(key)}|${k}" title="${esc(t)}">${l}</button>`;
  return `<div class="row wrap" style="gap:6px;margin-top:8px;align-items:center"><b class="small">Show raid</b>${b('succ', 'View successful raids', 'Opens on the median raid; Previous / Next step through fastest, top 10%, top 25%, median, slowest and your breakpoints')}<span data-vraidfail="${esc(key)}" hidden>${b('fail', 'View failed raids', 'Opens on the fastest failed raid (the earliest into reds); Previous / Next to the median and slowest failed')}</span><span class="muted small" data-vraidmsg="${esc(key)}"></span></div><div data-vraidout="${esc(key)}"></div>`;
}
// the decision tree's "Example N Dawn" buttons: the Show raid box of the same setup (the nearest one around the tree)
if (typeof document !== 'undefined' && !window.vDawnOn) {
  window.vDawnOn = true;
  document.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-vdawn]'); if (!b) return;
    let el = b.parentElement, out = null;
    while (el && !(out = el.querySelector('[data-vraidout]'))) el = el.parentElement;
    if (!out) return;
    const key = out.dataset.vraidout, fake = { dataset: { vraid: `${key}|dawn:${b.dataset.vdawn}` } };
    showVerzRaid(fake, el).then(() => out.scrollIntoView({ block: 'nearest' }));
  });
}
/** The setup's raids, once (in chunks: the page stays live): successful, failed (how far each got), and each one's
 *  Dawn count. Shows the failed-raids button when there are any. */
function playRaids(e, key) {
  if (e.play) return e.play;
  const el = (sel) => document.querySelector(`[${sel}="${CSS.escape(key)}"]`);
  return (e.play = (async () => {
    const raids = [], fails = [], all = [];
    for (let i = 0; i < RAIDS; i += 100) {
      for (let j = i; j < Math.min(RAIDS, i + 100); j++) {
        const r = runOneSplit(e.cfgs, e.team, raidRng(SEED, j));
        all.push({ i: j, total: r.end, key: r.key, dawns: r.dawns });
        if (r.end != null) raids.push({ i: j, total: r.end, key: r.key, dawns: r.dawns });
        else fails.push({ i: j, prog: r.reds ?? (r.p1end != null ? 1e6 + r.p1end : 2e6), reds: r.reds, dawns: r.dawns });   // failed: how far it got (reds proc tick; else P1's end)
      }
      const msg = el('data-vraidmsg'); if (msg && e.waiting) msg.textContent = `Playing ${RAIDS.toLocaleString()} raids... ${Math.min(RAIDS, i + 100).toLocaleString()}`;
      await new Promise((r) => setTimeout(r, 0));
    }
    Object.assign(e, { raids, fails, all });
    const msg = el('data-vraidmsg'); if (msg) msg.textContent = '';
    const fb = el('data-vraidfail'); if (fb) fb.hidden = !fails.length;
  })());
}
/** A Show raid button was clicked (root: where the buttons are). */
export async function showVerzRaid(btn, root) {
  const [key, mode] = btn.dataset.vraid.split(/\|(?=[^|]*$)/), e = store.get(key);
  const box = root.querySelector(`[data-vraidout="${CSS.escape(key)}"]`), msg = root.querySelector(`[data-vraidmsg="${CSS.escape(key)}"]`);
  if (!e || !box) return;
  e.waiting = true; await playRaids(e, key); e.waiting = false;
  const names = e.cfgs.map((c, k) => c.name || `Player ${k + 1}`);
  const draw = (i, title) => { const r = runOneLogged(e.cfgs, e.team, raidRng(SEED, i)); return timelineHtml({ trace: verzTrace(r.log, names, e.cfgs), names, bossName: 'Verzik', end: r.end, title, legend: LEGEND }); };
  const N = RAIDS.toLocaleString();
  if (mode === 'succ') {
    const steps = successSteps(e.raids, e.raids.length, RAIDS, e.bps || []);   // percentiles of the successful raids
    raidNav(box, steps, steps.findIndex((s) => /Median/.test(s.label)), (st) => draw(st.pick.i,
      `${st.label} successful raid (Verzik) - ${fmt(st.pick.total)} · ${st.freq} · ${st.pick.typical} of the ${st.pick.n} raids that ended at ${fmt(st.pick.total)} went this way (${e.raids.length.toLocaleString()} successful of ${N})`));
  } else if (mode === 'fail') {
    const steps = failSteps(e.fails);
    raidNav(box, steps, 0, (st) => draw(st.f.i,
      `${st.label} raid (Verzik) - ${st.f.reds != null ? `reached reds at ${fmt(st.f.reds)}, then failed` : 'failed before reds'} · ${e.fails.length.toLocaleString()} failed of ${N} (${(e.fails.length / RAIDS * 100).toFixed(1)}%)`));
  } else if (mode.startsWith('dawn')) {
    // the decision tree's branches: P1 died in N Dawns (1%+ of raids) - the median successful raid of each
    const by = {}; for (const r of e.all) if (r.dawns != null) (by[r.dawns] ||= []).push(r);
    const steps = Object.keys(by).map(Number).filter((d) => by[d].length >= RAIDS * 0.01).sort((a, b) => b - a)
      .map((d) => { const ok = by[d].filter((r) => r.total != null); return { label: `Example ${d} Dawn (${(by[d].length / RAIDS * 100).toFixed(0)}%)`, d, ok, pick: pickRaid(ok, ok.length, 'median') }; });
    raidNav(box, steps, Math.max(0, steps.findIndex((x) => x.d === Number(mode.split(':')[1]))), (st) => (st.pick ? draw(st.pick.i,
      `Example: P1 died in ${st.d} Dawns (Verzik) - ${fmt(st.pick.total)} · the median of the ${st.ok.length.toLocaleString()} successful raids in this branch (${(by[st.d].length / RAIDS * 100).toFixed(1)}% of ${N} attempts died in ${st.d} Dawns)`)
      : `<p class="muted small">No successful raid where P1 died in ${st.d} Dawns.</p>`));
  }
}
