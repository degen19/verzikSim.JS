// Xarpus (room 4). Stats so far; the exhumeds and the room flow come next.
//  - HP 5080 (5s), scaled down below 5s like the other rooms: 87.5% in 4s, 75% in 3s / duos / solos.
//  - Defence 250, Magic 220. Stab / slash / crush defence 0, ranged (light / standard / heavy) 160, magic defence 0.
//  - No supplies in this room (for now). Start spec 95 or 100.
//  - Players scythe every 5 ticks; specs: Horn, Claws, ZCB, Elder maul, BGS, Ralos Spec. One-time tick fixes (claw
//    scratch / spec, blowpipe hit, Ayak hit) on their triggers.
export const XARPUS_HP = { 5: 5080, 4: 4445, 3: 3810, 2: 3810, 1: 3810 };
export const XARPUS = {
  def: 250, magic: 220,
  dfn: { stab: 0, slash: 0, crush: 0, light: 160, standard: 160, heavy: 160, magic: 0 },
};
/** Exhumeds: the room tick players can first interact with Xarpus, by scale; their first attack goes off the tick after. */
export const EXHUMED_TICKS = { 1: 100, 2: 92, 3: 116, 4: 84, 5: 96 };
/** Exhumeds: Xarpus lowers his HP to this by the end of the phase, by scale ... */
export const EXHUMED_HP = { 1: 2928, 2: 2905, 3: 2910, 4: 3560, 5: 4127 };
/** ... then heals this much per heal (a missed tick on an exhumed), by scale. HP when players can attack = EXHUMED_HP + heals x HEAL. */
export const HEAL = { 1: 20, 2: 16, 3: 12, 4: 9, 5: 8 };
/** The default number of heals (a setting per set): Blert averages by scale. */
export const HEALS_DEFAULT = { 1: 8, 2: 5, 3: 4, 4: 7, 5: 1 };
export const HEALS_NOTE = 'Default: the Blert average for the scale (5s 1, 4s 7, 3s 4, duos 5, solos 8)';
/** Xarpus' HP when players can first attack, after `heals` heals. */
export const startHp = (team, heals = HEALS_DEFAULT[team]) => EXHUMED_HP[team] + Math.max(0, Math.trunc(Number(heals) || 0)) * HEAL[team];
/** Heal variability: each raid's heals are the set's number +- this (evenly, never below 0), unless the set uses its exact number. */
export const HEAL_SPREAD = 2;
/** The heals for one raid: `heals` +- HEAL_SPREAD (rng.randint, inclusive), or exactly `heals` when `exact`. */
export const rollHeals = (heals, rng, exact = false) => {
  const h = Math.max(0, Math.trunc(Number(heals) || 0));
  return exact ? h : Math.max(0, h + rng.randint(-HEAL_SPREAD, HEAL_SPREAD));
};
/** Hit delays (ticks from the attack to the hit landing): melee 1; the ZCB spec 2 (as on Sotetseg); Ralos Spec 1 more. */
export const MELEE_DELAY = 1, ZCB_DELAY = 2, RALOS_DELAY = ZCB_DELAY + 1;
/** Ralos Spec: each hit that lands (1+ damage) drains Defence by 1/8 of her Magic level. */
export const RALOS_DRAIN = Math.floor(XARPUS.magic / 8);

// ---------------------------------------------------------------- the room
//  - The exhumeds end on EXHUMED_TICKS (a multiple of 4: his 4-tick cycle, i0 = tick % 4 === 0); players attack from the
//    tick after. His HP then: startHp (the heals +- HEAL_SPREAD a raid, or exact). Horns go off on the interact tick.
//  - Defence specs: each player has up to 4 in order (slots), each Elder maul / BGS / Ralos Spec with when it goes:
//     Always - a maul on their first attack (as soon as they have 50%); a BGS / Ralos Spec once the mauls are settled
//       (no maul hit still on its way, no planned maul still to swing, and no "if short" maul due), if his Defence is above
//       the Defence stop.
//     If short - only if the mauls come up short of the Maul target (landed mauls + mauls on their way + planned mauls
//       still to swing < the target): a maul straight away; a BGS / Ralos Spec once the mauls are settled. While it can't
//       be known yet (a maul on its way or still to swing) they scythe and wait; otherwise the slot is skipped.
//     Backup - once every Always / If short Defence spec has gone and landed, if his Defence is still above the Defence
//       stop (they wait for 50% spec if needed; others don't wait for them).
//    A maul / BGS lowers his Defence as the attack is made (PID); a Ralos Spec when it lands. No Defence floor.
//  - Damage specs (after the player's own Defence specs): ZCB (75%) once the mauls are settled, while his HP is at or
//    above the ZCB -> claws HP (below it: claws instead, if they have them); Claws (50%) once no Defence spec is still to
//    come; Claws at the screech (held: on the tick fix if their fix is a claw spec, else their first attack from the
//    screech). As often as their spec allows.
//  - The screech: once he's at or below 25% of his base HP (XARPUS_HP), on the next i0. A player whose scythe (or ZCB)
//    would go off on the i3 before it - who could see he was below 25% the tick before - tick fixes instead: lose a tick
//    (scythe, next attack 6 ticks later), a claw scratch or claw spec (4 ticks), a blowpipe hit (2) or an Ayak hit (3),
//    then scythes every 5 ticks again. Nothing else happens; they attack until he's dead. The room ends 5 ticks after
//    the killing hit (4 with overkill: another hitsplat on the killing tick).
//  - Thralls (0-3 every 4 ticks) from everyone's first attack. Spec: 10% every 50 ticks (Lightbearer: 25) below 100;
//    a 95% start regens the tick after their first spec (not a Lightbearer cycle). Surge (if planned): +25% straight after
//    their first spec - once its cooldown (500 ticks, carried in from earlier rooms: surgeCd) is up, else as soon as it is.
//  - Damage to players doesn't matter in this room.
import { hit_chance } from './sim.js';
import { worn, bonuses, bestWorn, slotItem } from './loadout.js';

export const SCREECH_AT = 0.25;
// his death: the room ends 5 ticks after the killing hit, 4 with overkill (another hitsplat landing on the killing tick after it)
export const DEATH_ANIM = 5, DEATH_ANIM_OVERKILL = 4;
export const HORN_COST = 25, HORN_TICKS = 10, SURGE = 25, SURGE_CD = 500, ZCB_SPEC = 75, BP_DELAY = 2, AYAK_DELAY = 2;
export const ZCB_BELOW = 450;      // a planned ZCB becomes claws below this HP (the ruby: 22% of his HP, max 110)
export const DEF_STOP = 0;         // no more BGS / Ralos Specs / backups once his Defence is at or below this
export const MAUL_TARGET = 2;      // "if short": mauls landed (or on their way / still to swing) below this
export const DEF_SLOTS = 4;
export const DEF_SPECS = [['none', 'None'], ['maul', 'Elder maul'], ['bgs', 'BGS'], ['ralos', 'Ralos Spec']];
export const WHEN = [['always', ''], ['short', ' if short'], ['backup', ' (backup)']];
/** A Defence slot's choices: 'none', or `${spec}` / `${spec}:short` / `${spec}:backup`. */
export const SLOT_CHOICES = [['none', 'None'], ...DEF_SPECS.slice(1).flatMap(([v, l]) => WHEN.map(([w, wl]) => [w === 'always' ? v : `${v}:${w}`, `${l}${wl}`]))];
export const parseSlot = (x) => { const [spec, when = 'always'] = String(x || 'none').split(':'); return { spec, when }; };
export const DPS_SPECS = [['none', 'None'], ['claws', 'Claws'], ['clawsScreech', 'Claws at screech'], ['zcb', 'ZCB']];
export const FIXES = [['tick', 'Lose a tick'], ['scratch', 'Claw scratch'], ['claw', 'Claw spec'], ['bp', 'Blowpipe hit'], ['ayak', 'Ayak hit']];
const NEED = { maul: 'Elder maul', bgs: 'Bandos godsword', ralos: 'Tonalztics of Ralos', claws: 'Dragon claws', clawsScreech: 'Dragon claws', zcb: 'Zaryte crossbow',
  scratch: 'Dragon claws', claw: 'Dragon claws', bp: 'Toxic blowpipe', ayak: 'Eye of ayak' };
/** Does the player have what this choice needs (Gear tab)? A slot choice: its spec (a maul can be a BGS instead). */
export const canDo = (gear, v) => {
  const x = String(v || '').split(':')[0], own = (w) => (gear.weapons || []).includes(w);
  return !NEED[x] || own(NEED[x]) || (x === 'maul' && own('Bandos godsword'));
};
/** A player's Defence slots (DEF_SLOTS long): from `defs`, or the older def / backup. */
export const slotsOf = (c) => {
  const d = Array.isArray(c.defs) ? c.defs.slice(0, DEF_SLOTS) : [c.def || 'none', c.backup && c.backup !== 'none' ? `${c.backup}:backup` : 'none'];
  while (d.length < DEF_SLOTS) d.push('none');
  return d;
};
const PRAY = { Piety: [1.20, 1.23], Zeal: [1.25, 1.28] };
const RANGED = 112, MAGIC = 99;

const defRoll = (lvl, style) => (style === 'mage' ? (XARPUS.magic + 9) * (XARPUS.dfn.magic + 64)
  : (lvl + 9) * ((style === 'range' ? XARPUS.dfn.light : XARPUS.dfn.slash) + 64));
const ringOn = (set, p) => (p.lb ? { ...set, ring: 'Lightbearer' } : set);
/** Melee with a weapon: [chance, max]. idx 1 slash, 2 crush (his melee defence is 0 for each). */
function melee(p, weapon, idx, defLvl, accMult = 1) {
  const b = bonuses(ringOn(worn(p.gear, 'melee', weapon), p));
  const [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(118 * pa) + 8, es = Math.floor(118 * ps) + 3 + 8;
  return [hit_chance(Math.floor(ea * (b.atk[idx] + 64) * accMult), defRoll(defLvl, 'melee')), Math.floor((es * (b.str + 64) + 320) / 640)];
}
/** Ranged on Rigour in a set: [chance, max]. */
function ranged(set, defLvl, accMult = 1) {
  const b = bonuses(set), v = b.eliteVoid ? [1.10, 1.125] : [1, 1];
  const ea = Math.floor((Math.floor(RANGED * 1.20) + 8) * v[0]), es = Math.floor((Math.floor(RANGED * 1.23) + 8) * v[1]);
  return [hit_chance(Math.floor(ea * (b.atk[4] + 64) * accMult), defRoll(defLvl, 'range')), Math.floor(0.5 + es * (b.rstr + 64) / 640)];
}
/** Blowpipe hit: Rigour, their ranged cape, gloves and necklace over their melee gear. */
function bpSet(p) {
  const set = { ...worn(p.gear, 'melee', 'Toxic blowpipe') };
  for (const s of ['cape', 'hands', 'neck']) set[s] = slotItem(p.gear, 'range', s);
  return set;
}
/** Eye of ayak in their best magic gear (Augury): [chance, max]. */
function ayak(p) {
  const b = bonuses(bestWorn(p.gear, 'mage', 'Eye of ayak').set);
  const mx = Math.floor((Math.floor(MAGIC / 3) - 6) * (100 + b.mdmg + 4) / 100);
  return [hit_chance((Math.floor(MAGIC * 1.25) + 9) * (b.atk[3] + 64), defRoll(0, 'mage')), mx];
}
function clawSpec(p, defLvl, rng) {
  const [ch, mx] = melee(p, 'Dragon claws', 1, defLvl);
  for (let k = 0; k < 4; k++) {
    if (rng.random() >= ch) continue;
    if (k === 0) { const x = rng.randint(Math.floor(mx / 2), mx - 1); return [x, Math.floor(x / 2), Math.floor(x / 4), Math.floor(x / 4) + 1]; }
    if (k === 1) { const x = rng.randint(Math.floor(3 * mx / 8), Math.floor(7 * mx / 8)); return [0, x, Math.floor(x / 2), Math.floor(x / 2) + 1]; }
    if (k === 2) { const x = rng.randint(Math.floor(mx / 4), Math.floor(3 * mx / 4)); return [0, 0, x, x + 1]; }
    return [0, 0, 0, rng.randint(Math.floor(mx / 4), Math.floor(5 * mx / 4))];
  }
  return rng.random() < 2 / 3 ? [1, 1, 0, 0] : [0, 0, 0, 0];
}

/** The default plan by scale (players 1-5): Defence slots, damage spec, tick fix, start spec, Lightbearer cycles. */
export function defaultXarpus(team) {
  const P = (defs, dps, extra = {}) => ({ startSpec: 100, surge: false, lbCycles: 0, defs: [...defs, 'none', 'none', 'none', 'none'].slice(0, DEF_SLOTS), dps, fix: 'tick', horn: false, ...extra });
  if (team === 1) return [P(['maul', 'maul'], 'claws')];                                    // two mauls at the start
  if (team === 2) return [P(['maul', 'maul'], 'claws'),                                     // P1 double mauls; P2 mauls if they come up short, else BGS / Ralos 1-2 times
    P(['maul:short', 'maul:short', 'ralos', 'ralos:backup'], 'claws')];
  if (team === 3) return [P(['maul', 'ralos'], 'claws'), P(['maul', 'ralos'], 'claws'), P(['maul', 'ralos:backup'], 'claws')];
  if (team === 4) return [P(['maul', 'maul:short', 'ralos'], 'clawsScreech'), P(['maul', 'maul:short', 'ralos:backup'], 'zcb', { lbCycles: 3 }),
    P(['maul', 'maul:short', 'ralos:backup'], 'zcb', { lbCycles: 3 }), P(['ralos', 'ralos:backup'], 'zcb', { startSpec: 95, lbCycles: 2 })];
  return [0, 1, 2].map(() => P(['maul', 'maul:short'], 'clawsScreech')).concat([3, 4].map(() => P(['ralos', 'ralos:backup'], 'zcb', { startSpec: 95, lbCycles: 2 })));
}

/**
 * One raid of Xarpus. players: [{name, gear, startSpec, surge, surgeCd (ticks of surge cooldown left coming in), lbCycles,
 * defs ([slot] - see SLOT_CHOICES), dps, fix, horn}]. opts: {heals (default HEALS_DEFAULT), exactHeals, defStop (DEF_STOP),
 * zcbBelow (ZCB_BELOW), maulTarget (MAUL_TARGET)}. Returns {end, kill, startHp, heals, screech, ..., players: [{surgeCd (left at
 * the end of the room), spec}]}.
 */
export function runXarpus(players, team, rng, log = null, { heals = HEALS_DEFAULT[team], exactHeals = false, defStop = DEF_STOP, zcbBelow = ZCB_BELOW, maulTarget = MAUL_TARGET, trace = null, specsLand = false, bgsToZero = false } = {}) {
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const EXH = EXHUMED_TICKS[team] || 96, BASE = XARPUS_HP[team] || 5080, SCREECH_HP = Math.floor(BASE * SCREECH_AT);
  const nHeals = rollHeals(heals, rng, exactHeals), START = EXHUMED_HP[team] + nHeals * HEAL[team];
  let anim = DEATH_ANIM, hp = START, defLvl = XARPUS.def, kill = null, dropAt = null, screech = null, defZeroAt = null, lastDefAt = null;
  const st = { dmg: { scythe: 0, maul: 0, bgs: 0, ralos: 0, claw: 0, scratch: 0, zcb: 0, thrall: 0, bp: 0, ayak: 0 },
    specs: { maul: 0, maulHit: 0, bgs: 0, bgsHit: 0, ralos: 0, ralosHits: 0, claw: 0, zcb: 0, horn: 0, surge: 0 }, fixes: [], specLog: [] };
  L.on && L(`exhumeds: ${nHeals} heal${nHeals === 1 ? '' : 's'} -> Xarpus ${START} HP; interactable t${EXH}, first attacks t${EXH + 1}`);
  const ps = players.map((c, i) => {
    const g = c.gear, ok = (v) => canDo(g, v), own = (w) => (g.weapons || []).includes(w);
    const slots = slotsOf(c).map(parseSlot).filter((x) => x.spec !== 'none' && ok(x.spec))
      .map((x) => ({ ...x, useBgs: x.spec === 'maul' && !own('Elder maul'), done: false }));   // no maul: a BGS in its place (it counts as a maul)
    let dps = c.dps || 'none'; if (!ok(dps)) dps = 'none';
    let fix = c.fix || 'tick'; if (!ok(fix)) fix = 'tick';
    return { i, name: c.name || `P${i + 1}`, gear: g, spec: Number(c.startSpec ?? 100), regen: 0, regenHold: Number(c.startSpec ?? 100) < 100,
      surgePlan: !!c.surge, surged: false, surgeReady: Math.max(0, Number(c.surgeCd) || 0), surgeAt: null,
      lb: false, lbLeft: Number(c.lbCycles || 0), dpsFrom: Number(c.dpsFrom) || 0, slots, dps, fix, horn: !!c.horn && !!g.horn, firstSpec: false,
      next: EXH + 1, hornUntil: -1, thrallNext: EXH + 1 + rng.randint(1, 2) };
  });
  // surge cooldown carried in: it doesn't tick between rooms, so it's ready `surgeCd` ticks into this room (the exhumeds count)
  const pid = rng.shuffle(ps.slice());
  let hits = [];                                                    // [tick, player, amount | null, label, kind]
  const has = (p, w) => (p.gear.weapons || []).includes(w);
  const drinkSurge = (p, t) => { const o = p.spec; p.spec = Math.min(100, p.spec + SURGE); p.surged = true; p.surgeAt = t; st.specs.surge++; L.on && L(`t${t} ${p.name} surge ${o}% -> ${p.spec}%`); };
  const spend = (p, n, t) => {
    p.spec -= n; p.firstSpec = true;
    if (p.regenHold) { p.regenHold = false; p.regen = 49; p.freeRegen = true; }   // a 95% start: the regen the tick after isn't a Lightbearer cycle
    if (p.surgePlan && !p.surged && t >= p.surgeReady) drinkSurge(p, t);
  };
  const lowerDef = (t, what, by) => {
    if (by <= 0 || defLvl <= 0) return;
    defLvl = Math.max(0, defLvl - by); lastDefAt = t; if (defLvl === 0 && defZeroAt == null) defZeroAt = t;
    L.on && L(`t${t} ${what} lowers his Defence -> ${defLvl}`);
  };
  const damage = (t, amt, label, kind) => {
    if (kill != null || amt <= 0) { if (kill == null) L.on && L(`t${t} ${label} 0`); return; }
    hp -= amt; st.dmg[kind] = (st.dmg[kind] || 0) + amt;
    L.on && L(`t${t} ${label} ${amt} -> Xarpus ${Math.max(0, hp)}`);
    if (dropAt == null && hp <= SCREECH_HP && hp > 0) { dropAt = t; screech = t + 1; while (screech % 4 !== 0) screech++; L.on && L(`t${t} Xarpus at or below 25% (${SCREECH_HP}): screech on t${screech}`); }
    if (hp <= 0) { kill = t; L.on && L(`t${t} *** XARPUS DIES ***`); }
  };
  // ---- Defence slots
  let maulsLanded = 0;                                              // maul / BGS-as-maul hits that have landed (seen)
  const inFlight = (...k) => hits.filter((h) => k.includes(h[4])).length;
  const alwaysMaulsLeft = () => ps.reduce((n, p) => n + p.slots.filter((x) => !x.done && x.when === 'always' && x.spec === 'maul').length, 0);
  const uncertain = () => inFlight('maul') > 0 || alwaysMaulsLeft() > 0;
  const short = () => maulsLanded + inFlight('maul') + alwaysMaulsLeft() < maulTarget;
  const shortMaulDue = () => short() && ps.some((p) => p.spec >= 50 && p.slots.some((x) => !x.done && x.when === 'short' && x.spec === 'maul'));
  const settled = () => !uncertain() && !shortMaulDue();            // the mauls are settled
  const firstWaveOpen = () => inFlight('maul', 'bgs', 'ralos') > 0 || ps.some((p) => p.slots.some((x) => !x.done && x.when !== 'backup'));
  /** Is any Defence spec still to come that others should wait for (not a backup still waiting for spec)? */
  const defOpen = () => firstWaveOpen() || ps.some((p) => p.slots.some((x) => !x.done && x.when === 'backup' && p.spec >= 50 && defLvl > defStop));
  /** The player's next Defence spec now (or null: scythe / damage spec). Skips slots that no longer apply. */
  const defAct = (p) => {
    for (const x of p.slots) {
      if (x.done) continue;
      if (x.when === 'always') {
        if (x.spec === 'maul') return p.spec >= 50 ? x : null;
        if (!settled()) return null;
        if (defLvl <= defStop) { x.done = true; continue; }
        return p.spec >= 50 ? x : null;
      }
      if (x.when === 'short') {
        if (short()) {
          if (x.spec === 'maul') return p.spec >= 50 ? x : null;
          if (!settled()) return null;
          if (defLvl <= defStop) { x.done = true; continue; }
          return p.spec >= 50 ? x : null;
        }
        if (uncertain()) return null;                               // can't tell yet: scythe and wait
        x.done = true; continue;                                    // the mauls landed: skip it
      }
      // backup: once every Always / If short Defence spec has gone and landed
      if (firstWaveOpen()) return null;
      if (defLvl <= defStop) { x.done = true; continue; }
      return p.spec >= 50 ? x : null;                               // waits for 50% (others don't wait for them)
    }
    return null;
  };
  const ownDefDone = (p) => p.slots.every((x) => x.done);
  const dpsAct = (p, t) => {
    if (p.dps === 'none' || !ownDefDone(p) || t < p.dpsFrom) return null;   // their own Defence specs first; held until dpsFrom
    if (p.dps === 'zcb') {
      if (hp < zcbBelow) return !defOpen() && has(p, 'Dragon claws') && p.spec >= 50 ? 'claw' : null;
      return settled() && p.spec >= ZCB_SPEC ? 'zcb' : null;        // a ZCB: once the mauls are settled
    }
    if (defOpen()) return null;                                     // claws: once no Defence spec is still to come
    if (p.dps === 'clawsScreech' && !(screech != null && t >= screech)) return null;
    return p.spec >= 50 ? 'claw' : null;
  };
  // ---- horns on the interact tick: the caster and the first other player mauling on their first attack can't miss their next maul / BGS
  for (const c of ps.filter((q) => q.horn && q.spec >= HORN_COST)) {
    const rec = ps.find((q) => q !== c && q.slots[0] && q.slots[0].when === 'always' && q.slots[0].spec !== 'ralos');
    spend(c, HORN_COST, EXH); st.specs.horn++; st.specLog.push({ i: c.i, kind: 'horn', t: EXH });
    c.hornUntil = EXH + HORN_TICKS; if (rec) rec.hornUntil = EXH + HORN_TICKS;
    L.on && L(`t${EXH} ${c.name} Soulflame horn (${c.spec}% left): ${c.name}${rec ? ` and ${rec.name}` : ''} can't miss their next maul / BGS`);
  }
  for (let t = EXH + 1; t <= EXH + 3000 && kill == null; t++) {
    // ---- hits landing
    const landing = hits.filter((h) => h[0] === t); hits = hits.filter((h) => h[0] !== t);
    for (const h of landing) {
      const [, p, amt, label, kind, hit] = h;
      if (kill != null) { if (kill === t) { anim = DEATH_ANIM_OVERKILL; L.on && L(`t${t} ${p.name} ${label} lands after the kill (overkill)`); } break; }
      if (kind === 'maul' && hit) maulsLanded++;
      if (kind === 'ralos') {                                         // two rolls; a hit (1+) drains before the second roll
        let total = 0; const parts = [], defBeforeRalos = defLvl;
        for (let k = 0; k < 2; k++) {
          const [ch, mx] = ranged(bestWorn(p.gear, 'range', 'Tonalztics of Ralos').set, defLvl, 1.5);
          const d = rng.random() < ch ? Math.max(1, rng.randint(0, Math.floor(mx * 0.75))) : 0;   // a hit that passes accuracy: at least 1
          parts.push(d); total += d;
          if (d >= 1) { st.specs.ralosHits++; lowerDef(t, `${p.name} Ralos Spec hit ${k + 1}`, RALOS_DRAIN); }
        }
        if (h.tr) Object.assign(h.tr, { amt: total, parts: parts.join('/'), def: defBeforeRalos, defAfter: defLvl });
        damage(t, total, `${p.name} Ralos Spec ${parts.join('/')}`, 'ralos');
      } else if (kind === 'zcb') {
        const [ch] = ranged(bestWorn(p.gear, 'range', 'Zaryte crossbow').set, defLvl, 2);
        const ok = rng.random() < ch, ruby = Math.min(110, Math.floor(hp * 0.22));
        if (h.tr) h.tr.amt = ok ? ruby : 0;
        if (ok) damage(t, ruby, `${p.name} ZCB spec ruby`, 'zcb');
        else L.on && L(`t${t} ${p.name} ZCB spec misses`);
      } else damage(t, amt, `${p.name} ${label}`, kind);
    }
    if (kill != null) break;
    // ---- spec regen, Lightbearer, a surge that was waiting on its cooldown, thralls
    for (const p of ps) {
      if (p.surgePlan && !p.surged && p.firstSpec && t >= p.surgeReady && p.spec <= 75) drinkSurge(p, t);
      const wantLb = p.lbLeft > 0 && p.spec < 100 && !p.regenHold;
      if (wantLb !== p.lb) p.lb = wantLb;
      if (!p.regenHold && p.spec < 100) {
        if (++p.regen >= (p.lb ? 25 : 50)) {
          p.regen = 0; p.spec = Math.min(100, p.spec + 10);
          if (p.freeRegen) p.freeRegen = false;
          else if (p.lb && --p.lbLeft <= 0) { p.lb = false; L.on && L(`t${t} ${p.name} Lightbearer cycles done (${p.spec}%) - Ultor`); }
        }
      } else if (!p.regenHold) p.regen = 0;
      if (p.thrallNext === t) { hits.push([t + 1, p, rng.randint(0, 3), 'thrall', 'thrall']); p.thrallNext = t + 4; }
    }
    // ---- player attacks, in PID order
    const hpNow = hp;                                                 // (trace: his HP as the attacks go off)
    for (const p of pid) {
      if (t !== p.next) continue;
      const n0 = hits.length, d0 = defLvl;
      const slot = defAct(p);
      let act = slot ? (slot.useBgs ? 'bgs' : slot.spec) : dpsAct(p, t) || 'scythe';
      // the tick fix: their scythe / ZCB would go off on the i3 before the screech (they saw him under 25% by the tick before)
      if (screech != null && t === screech - 1 && dropAt < t && (act === 'scythe' || act === 'zcb')) {
        const f = p.fix === 'claw' && p.spec < 50 ? 'scratch' : p.fix;
        st.fixes.push({ i: p.i, fix: f, t }); act = `fix:${f}`;
      }
      if (slot) slot.done = true;
      if (act !== 'scythe' && !act.startsWith('fix:')) st.specLog.push({ i: p.i, kind: act, t, when: slot ? slot.when : undefined });
      const tag = slot && slot.when !== 'always' ? ` (${slot.when === 'short' ? 'mauls short' : 'backup'})` : '';
      if (act === 'maul' || act === 'bgs') {
        spend(p, 50, t);
        const horned = t <= p.hornUntil; if (horned) p.hornUntil = -1;
        if (act === 'maul') {
          st.specs.maul++;
          const [ch, mx] = melee(p, 'Elder maul', 2, defLvl, 1.25), hit = horned || rng.random() < ch || specsLand;
          const d = hit ? Math.max(1, rng.randint(0, mx)) : 0;
          if (hit) { st.specs.maulHit++; lowerDef(t, `${p.name} Elder maul`, Math.floor(defLvl * 0.35)); }
          hits.push([t + MELEE_DELAY, p, d, `Elder maul spec${horned ? ' (horned)' : ''}${hit ? '' : ' misses'}`, 'maul', hit]);
        } else {
          st.specs.bgs++;
          const [ch, mx0] = melee(p, 'Bandos godsword', 1, defLvl, 2), mx = Math.floor(Math.floor(mx0 * 1.1) * 1.1), hit = horned || rng.random() < ch || specsLand;
          const d = hit ? Math.max(1, rng.randint(0, mx)) : 0;
          if (hit) { st.specs.bgsHit++; lowerDef(t, `${p.name} BGS`, bgsToZero ? defLvl : d); }   // bgsToZero: checking against a raid that hit 0 there
          hits.push([t + MELEE_DELAY, p, d, `BGS spec${horned ? ' (horned)' : ''}${hit ? '' : ' misses'}`, slot && slot.useBgs ? 'maul' : 'bgs', hit]);
        }
        L.on && L(`t${t} ${p.name} ${act === 'maul' ? 'Elder maul' : 'BGS'} spec${tag} (${p.spec}% left)`);
        p.next = t + 6;
      } else if (act === 'ralos') {
        spend(p, 50, t); st.specs.ralos++;
        hits.push([t + RALOS_DELAY, p, null, 'Ralos Spec', 'ralos']);
        L.on && L(`t${t} ${p.name} Ralos Spec${tag} (${p.spec}% left), lands t${t + RALOS_DELAY}`);
        p.next = t + 6;
      } else if (act === 'zcb') {
        spend(p, ZCB_SPEC, t); st.specs.zcb++;
        hits.push([t + ZCB_DELAY, p, null, 'ZCB spec', 'zcb']);
        L.on && L(`t${t} ${p.name} ZCB spec (${p.spec}% left)`);
        p.next = t + 5;
      } else if (act === 'claw' || act === 'fix:claw') {
        spend(p, 50, t); st.specs.claw++;
        const parts = clawSpec(p, defLvl, rng);
        hits.push([t + MELEE_DELAY, p, parts.reduce((a, b) => a + b, 0), `claw spec ${parts.join('/')}${act === 'fix:claw' ? ' (tick fix)' : ''}`, 'claw']);
        L.on && L(`t${t} ${p.name} claw spec${act === 'fix:claw' ? ' (tick fix)' : ''} (${p.spec}% left)`);
        p.next = t + 4;
      } else if (act === 'fix:scratch') {
        const [ch, mx] = melee(p, 'Dragon claws', 1, defLvl), d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
        hits.push([t + MELEE_DELAY, p, d, 'claw scratch (tick fix)', 'scratch']); p.next = t + 4;
      } else if (act === 'fix:bp') {
        const [ch, mx] = ranged(bpSet(p), defLvl), d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
        hits.push([t + BP_DELAY, p, d, 'blowpipe (tick fix)', 'bp']); p.next = t + 2;
      } else if (act === 'fix:ayak') {
        const [ch, mx] = ayak(p), d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0;
        hits.push([t + AYAK_DELAY, p, d, 'Ayak (tick fix)', 'ayak']); p.next = t + 3;
      } else {                                                        // scythe (fix 'tick': a scythe, next attack a tick late)
        const [ch, mx] = melee(p, 'Scythe of vitur', 1, defLvl);
        const parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => (rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0));
        hits.push([t + MELEE_DELAY, p, parts.reduce((a, b) => a + b, 0), `scythe ${parts.join('/')}${act === 'fix:tick' ? ' (tick fix: next swing a tick late)' : ''}`, 'scythe']);
        p.next = t + (act === 'fix:tick' ? 6 : 5);
      }
      if (trace) for (const h of hits.slice(n0)) {                   // this attack: his HP / Defence as it goes off, Defence after a maul / BGS
        h.tr = { t, lands: h[0], name: p.name, what: h[3], kind: h[4], amt: h[2], hp: hpNow, def: d0, defAfter: defLvl };
        trace.push(h.tr);
      }
    }
  }
  const end = kill == null ? null : kill + anim;
  if (trace) trace.sort((a, b) => a.t - b.t);
  return { end, kill, anim, startHp: START, heals: nHeals, screech, dropAt, defZeroAt, defEnd: defLvl, defLastAt: lastDefAt, maulHits: maulsLanded, ...st,
    players: ps.map((p) => ({ name: p.name, spec: p.spec, surgeAt: p.surgeAt,
      // surge cooldown left after the room (it doesn't tick between rooms)
      surgeCd: end == null ? 0 : p.surgeAt != null ? Math.max(0, p.surgeAt + SURGE_CD - end) : Math.max(0, p.surgeReady - end) })) };
}
