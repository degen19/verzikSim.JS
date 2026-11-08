// Xarpus (room 4). Stats so far; the exhumeds and the room flow come next.
//  - HP 5000 (5s), scaled down below 5s like the other rooms: 87.5% in 4s (4375), 75% in 3s / duos / solos (3750).
//    The exhumeds' heals go on top: HP when players can attack = base HP + heals x HEAL (4s, 9 heals: 4375 + 81 = 4456).
//  - Defence 250, Magic 220. Stab / slash / crush defence 0, ranged (light / standard / heavy) 160, magic defence 0.
//  - No supplies in this room (for now). Start spec 95 or 100.
//  - Players scythe every 5 ticks; specs: Horn, Claws, ZCB, Elder maul, BGS, Ralos Spec. One-time tick fixes (claw
//    scratch / spec, blowpipe hit, Ayak hit) on their triggers.
export const XARPUS_HP = { 5: 5000, 4: 4375, 3: 3750, 2: 3750, 1: 3750 };
export const XARPUS = {
  def: 250, magic: 220,
  dfn: { stab: 0, slash: 0, crush: 0, light: 160, standard: 160, heavy: 160, magic: 0 },
};
/** Exhumeds: the room tick players can first interact with Xarpus, by scale; their first attack goes off the tick after. */
export const EXHUMED_TICKS = { 1: 100, 2: 92, 3: 116, 4: 84, 5: 96 };
/** Exhumeds: each heal (a missed tick on an exhumed) adds this much HP on top of his base HP, by scale.
 *  HP when players can attack = XARPUS_HP + heals x HEAL. */
export const HEAL = { 1: 20, 2: 16, 3: 12, 4: 9, 5: 8 };
/** The default number of heals (a setting per set): Blert averages by scale. */
export const HEALS_DEFAULT = { 1: 8, 2: 5, 3: 4, 4: 7, 5: 1 };
export const HEALS_NOTE = 'Default: the Blert average for the scale (5s 1, 4s 7, 3s 4, duos 5, solos 8)';
/** Xarpus' HP when players can first attack, after `heals` heals. */
export const startHp = (team, heals = HEALS_DEFAULT[team]) => XARPUS_HP[team] + Math.max(0, Math.trunc(Number(heals) || 0)) * HEAL[team];
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
//  - Defence specs, in three steps (each player does at most 2 - 3 in solos):
//     1. Opening specs (one each, or none): an Elder maul on their first attack; a BGS / Ralos Spec after their first
//        scythe, once the opening mauls (and any re-mauls) are in - skipped if his Defence is already at or below the
//        Defence target. A horn on the interact tick: the caster and the first other opening mauler can't miss.
//     2. Maul again: once the opening mauls have landed, the players chosen for that many landed maul on their next
//        attack (whether theirs landed or not - and anyone can, not only the opening maulers: duos' 2:2).
//     3. Backups, in list order, each only while his Defence is above the Defence target: one at a time - each waits for
//        everything before it to land (the others scythe meanwhile) - except that a backup whose best roll can't get him
//        to the target from where he is goes together with the next one (and so on). "Back up right away if this many or
//        fewer opening mauls land": when that's so, it goes as soon as the re-maul volley has gone and their own opening
//        spec is done, without waiting on the ones before it. A backup whose player hasn't the spec when its turn comes is
//        passed over; a maul backup is skipped once 2 mauls have landed (then it's flat Defence reduction).
//    A maul / BGS lowers his Defence as the attack is made (PID); a Ralos Spec when it lands. No Defence floor.
//  - Damage specs (after the player's own Defence specs): ZCB (75%) - held for the screech (Hold ZCBs: their first attack
//    from it, nobody waits for anyone) or else once the mauls are settled - while his HP is at or above the ZCB -> claws
//    HP (below it: claws instead, if they have them); Claws (50%) once no Defence spec is still to come. As often as their
//    spec allows. A Claw spec tick fix goes before a held ZCB.
//  - The screech: once he's at or below 33% of his starting HP (base + heals), on the next i0. A player whose scythe (or ZCB)
//    would go off on the i3 before it - who could see he was below 33% the tick before - tick fixes instead: lose tick(s)
//    (scythe, next attack 6 ticks later, 7 a quarter of the time), a claw scratch or claw spec (4 ticks), a blowpipe hit (2) or an Ayak hit (3),
//    then scythes every 5 ticks again. Nothing else happens; they attack until he's dead. The room ends on the 5th tick
//    counting the one the killing hit lands on (the 4th with overkill: another hitsplat on the killing tick).
//  - Thralls (0-3 every 4 ticks) from everyone's first attack. Spec: 10% every 50 ticks (Lightbearer: 25) below 100;
//    a 95% start regens the tick after their first spec (not a Lightbearer cycle). Surge (if planned): +25% straight after
//    their first spec - once its cooldown (500 ticks, carried in from earlier rooms: surgeCd) is up, else as soon as it is.
//  - Damage to players doesn't matter in this room.
import { rangedLevel, normRangePot } from './sote.js';
import { hitMV, sumMV, scytheMV, clawMV, halbMV, constMV } from './expdmg.js';
import { hit_chance } from './sim.js';
import { worn, bonuses, bestWorn, slotItem } from './loadout.js';
import { ITEMS } from './gear.js';

export const SCREECH_AT = 0.33;               // of his starting HP (after the exhumeds' heals)
/** The screech threshold for a starting HP. */
export const screechHp = (start) => Math.floor(start * SCREECH_AT);
// his death: the room ends 5 ticks (4 with overkill) counting the tick the killing hit lands - a hit landing on 203
// ends it on 207 (206 with overkill): end = kill + 4 / kill + 3. He doesn't wait for a cycle start.
export const DEATH_ANIM = 4, DEATH_ANIM_OVERKILL = 3;
export const HORN_COST = 25, HORN_TICKS = 10, SURGE = 25, SURGE_CD = 500, ZCB_SPEC = 75, BP_DELAY = 2, AYAK_DELAY = 2;
export const ZCB_BELOW = 450;      // a planned ZCB becomes claws below this HP (the ruby: 22% of his HP, max 110)
export const DEF_TARGETS = [10, 20, 30, 40];
export const DEF_TARGET = 20;      // BGS / Ralos openers and backups only while his Defence is above this
/** At most this many Defence specs each (opening + re-maul + backups). */
export const defCap = (team) => (team === 1 ? 3 : 2);
export const OPENERS = [['none', 'None'], ['maul', 'Elder maul'], ['bgs', 'BGS'], ['ralos', 'Ralos Spec']];
export const BACKUP_SPECS = [['ralos', 'Ralos Spec'], ['bgs', 'BGS'], ['maul', 'Elder maul']];
export const DPS_SPECS = [['none', 'None'], ['zcb', 'ZCB'], ['claws', 'Claws']];
export const FIXES = [['tick', 'Lose tick(s)'], ['ayak', '3-tick (Eye of ayak)'], ['bp', 'Blowpipe (2 ticks)'], ['claw', 'Claw spec'], ['scratch', 'Claw scratch (4 ticks)']];
const NEED = { maul: 'Elder maul', bgs: 'Bandos godsword', ralos: 'Tonalztics of Ralos', claws: 'Dragon claws', zcb: 'Zaryte crossbow',
  scratch: 'Dragon claws', claw: 'Dragon claws', bp: 'Toxic blowpipe', ayak: 'Eye of ayak' };
export { NEED };
/** Does the player have what this choice needs (Gear tab)? A maul can be a BGS instead. */
export const canDo = (gear, v) => {
  const x = String(v || '').split(':')[0], own = (w) => (gear.weapons || []).includes(w);
  return !NEED[x] || own(NEED[x]) || (x === 'maul' && own('Bandos godsword'));
};
/** The opening maulers (indexes): players whose opening spec is a maul. */
export const openMaulers = (plan) => plan.map((p, k) => (p.open === 'maul' ? k : -1)).filter((k) => k >= 0);
/** A maul backup only goes while fewer than this many mauls have landed - then flat Defence reduction (BGS / Ralos). */
export const MAUL_BACKUP_UNTIL = 2;

// ---- older saved sets: Defence slots ('maul', 'maul:short', 'ralos:backup', ...) -> the steps above
const parseSlot = (x) => { const [spec, when = 'always'] = String(x || 'none').split(':'); return { spec, when }; };
/** A set (or Solver setup) in the older shape -> {players: [{..., open}], remaul, backups, defTarget, holdZcb}. In place. */
export function migrateXarpus(st, team) {
  const ps = st.players || [];
  if (ps.some((p) => p && (Array.isArray(p.defs) || p.def || p.backup))) {
    const slots = ps.map((p) => (Array.isArray(p.defs) ? p.defs : [p.def || 'none', p.backup && p.backup !== 'none' ? `${p.backup}:backup` : 'none']).map(parseSlot).filter((x) => x.spec !== 'none'));
    ps.forEach((p, k) => { const f = slots[k].find((x) => x.when === 'always'); p.open = f ? f.spec : 'none'; if (f) f.used = true; });
    const maulers = openMaulers(ps), target = Number(st.maulTarget) || 2, shorts = ps.map((_, k) => slots[k].filter((x) => x.when === 'short' && x.spec === 'maul').length);
    st.remaul = {};
    for (let n = 0; n <= maulers.length; n++) st.remaul[n] = n < target ? ps.map((_, k) => k).filter((k) => shorts[k] > 0 || slots[k].some((x) => !x.used && x.when === 'always' && x.spec === 'maul')) : [];
    st.backups = [];
    ps.forEach((p, k) => slots[k].filter((x) => !x.used && x.spec !== 'maul').forEach((x) => st.backups.push({ p: k, spec: x.spec, now: -1 })));
    st.defTarget = DEF_TARGETS.includes(Number(st.defStop)) ? Number(st.defStop) : DEF_TARGET;
    for (const p of ps) { delete p.defs; delete p.def; delete p.backup; }
    delete st.maulTarget; delete st.defStop;
  }
  for (const p of ps) if (p && p.dps === 'clawsScreech') { p.dps = 'claws'; }
  st.remaul ||= {}; st.backups ||= []; st.defTarget ??= DEF_TARGET; st.holdZcb ??= true; st.chally ??= false; st.challyAt ??= CHALLY_AT;
  return st;
}
const PRAY = { Piety: [1.20, 1.23], Zeal: [1.25, 1.28] };
const MAGIC = 99;
// Ranged level: each player's Range pot (rangedLevel, as Sotetseg: divine 112 / regular 112 draining 1 every 90s from the
// room's start / none 99). Not set (setups from before the option): Ralos players divine, everyone else not potted.

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
function ranged(set, defLvl, accMult = 1, lvl = 112) {
  const b = bonuses(set), v = b.eliteVoid ? [1.10, 1.125] : [1, 1];
  const ea = Math.floor((Math.floor(lvl * 1.20) + 8) * v[0]), es = Math.floor((Math.floor(lvl * 1.23) + 8) * v[1]);
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
function clawSpec(p, defLvl, rng) { const r = clawRolls(p, defLvl, rng); r.acc = melee(p, 'Dragon claws', 1, defLvl)[0]; return r; }
function clawRolls(p, defLvl, rng) {
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

/** Crystal halberd (Sweep, 30%): two hits on him (he's big), the second at 75% accuracy; each hit that lands rolls
 *  1..max, then + max / 10. Its stats go in place of the scythe's (both two-handed). */
const HALB = { atk: 110, str: 118 };
function halbSpec(p, defLvl, rng) {
  const scy = ITEMS['Scythe of vitur'], b = bonuses(ringOn(worn(p.gear, 'melee', 'Scythe of vitur'), p));
  const [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(118 * pa) + 8, es = Math.floor(118 * ps) + 3 + 8;
  const atk = b.atk[1] - scy.atk[1] + HALB.atk, mx = Math.floor((es * (b.str - (scy.str || 0) + HALB.str + 64) + 320) / 640);
  const ch = (m) => hit_chance(Math.floor(ea * (atk + 64) * m), defRoll(defLvl, 'melee'));
  const r = [ch(1), ch(0.75)].map((c) => (rng.random() < c ? Math.max(1, rng.randint(0, mx)) + Math.floor(mx / 10) : 0)); r.acc = [ch(1), ch(0.75)]; r.m = mx; return r;
}
/** Chally last hit: off by default; when on, a player who'd scythe halberds (30%) once his HP is at or below this % of his starting HP. */
export const CHALLY_AT = 5;
export const CHALLY_ATS = [3, 5, 7, 10];

/** Show raid timeline codes (raidview.js) by hit kind. */
const TRACE_CODE = { scythe: 'S', maul: 'EM', bgs: 'BGS', ralos: 'Ra', zcb: 'ZCB', halb: 'Ch', claw: 'C', scratch: 'Cs', bp: 'BP', ayak: 'E' };
/** The default plan by scale: {players: [{startSpec, surge, lbCycles, open, horn, dps, fix}], remaul, backups, defTarget, holdZcb}. */
export function defaultXarpusPlan(team) {
  const P = (open, dps, extra = {}) => ({ startSpec: 100, surge: false, lbCycles: 0, open, horn: false, dps, fix: 'tick', ...extra });
  const R = (k) => ({ p: k, spec: 'ralos', now: -1 });
  const plan = (players, remaul, backups) => ({ players, remaul, backups, defTarget: DEF_TARGET, holdZcb: true, chally: false, challyAt: CHALLY_AT });
  if (team === 1) return plan([P('maul', 'claws')], { 0: [0], 1: [0] }, []);                  // two mauls at the start
  // duos, 2:2 - P1 mauls twice; P2 scythes, mauls straight away if P1's first misses, then mauls until 2 have landed, then Ralos.
  // (3:1: both open with a maul, P1 mauls again whatever lands; backups P2 maul, P2 Ralos.)
  if (team === 2) return plan([P('maul', 'claws'), P('none', 'claws')], { 0: [0, 1], 1: [0] }, [{ p: 1, spec: 'maul', now: -1 }, R(1), R(1)]);
  if (team === 3) return plan([0, 1, 2].map(() => P('maul', 'claws')), { 0: [0, 1, 2], 1: [0, 1], 2: [], 3: [] }, [R(0), R(1), R(2)]);
  const mauls = [0, 1, 2].map((k) => P('maul', 'zcb', { fix: k === 0 ? 'claw' : 'tick', lbCycles: k === 0 ? 0 : 3 }));
  const ralos = (n) => Array.from({ length: n }, () => P('ralos', 'zcb', { startSpec: 95, lbCycles: 2 }));
  if (team === 4) return plan([...mauls, ...ralos(1)], { 0: [0, 1, 2], 1: [0, 1], 2: [], 3: [] }, [R(3), R(1), R(2)]);
  return plan([...mauls, ...ralos(2)], { 0: [0, 1, 2], 1: [0, 1], 2: [], 3: [] }, [R(3), R(4)]);
}
/** The default plan's players (see defaultXarpusPlan). */
export const defaultXarpus = (team) => defaultXarpusPlan(team).players;

/**
 * One raid of Xarpus. players: [{name, gear, startSpec, surge, surgeCd (ticks of surge cooldown left coming in), lbCycles,
 * open (OPENERS), dps, fix, horn}]. opts: {heals (default HEALS_DEFAULT), exactHeals, defTarget (DEF_TARGET), remaul
 * ({landed: [player index]}), backups ([{p, spec, now (-1 never, else this many or fewer opening mauls)}]), holdZcb,
 * chally (Chally last hit), challyAt (% of his starting HP), zcbBelow (ZCB_BELOW)}. Returns {end, kill, startHp, heals, screech, ..., players: [{surgeCd (left at the end of the room), spec}]}.
 */
export function runXarpus(players, team, rng, log = null, { heals = HEALS_DEFAULT[team], exactHeals = false, defTarget = DEF_TARGET, remaul = {}, backups = [], holdZcb = true,
  chally = false, challyAt = CHALLY_AT, zcbBelow = ZCB_BELOW, trace = null, specsLand = false, bgsToZero = false } = {}) {
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const EXH = EXHUMED_TICKS[team] || 96, BASE = XARPUS_HP[team] || 5000, CAP = defCap(team);
  const nHeals = rollHeals(heals, rng, exactHeals), START = BASE + nHeals * HEAL[team], SCREECH_HP = screechHp(START);
  let anim = DEATH_ANIM, hp = START, defLvl = XARPUS.def, kill = null, dropAt = null, screech = null, defZeroAt = null, lastDefAt = null;
  const st = { dmg: { scythe: 0, maul: 0, bgs: 0, ralos: 0, claw: 0, scratch: 0, zcb: 0, thrall: 0, bp: 0, ayak: 0, halb: 0 },
    specs: { maul: 0, maulHit: 0, bgs: 0, bgsHit: 0, ralos: 0, ralosHits: 0, claw: 0, zcb: 0, horn: 0, surge: 0, halb: 0, lateHorn: 0 }, fixes: [], specLog: [] };
  const CHALLY_HP = chally ? Math.floor(START * challyAt / 100) : -1;
  L.on && L(`exhumeds: ${nHeals} heal${nHeals === 1 ? '' : 's'} -> Xarpus ${START} HP; interactable t${EXH}, first attacks t${EXH + 1}`);
  const ps = players.map((c, i) => {
    const g = c.gear, ok = (v) => canDo(g, v), own = (w) => (g.weapons || []).includes(w);
    const open = c.open && c.open !== 'none' && ok(c.open) ? c.open : 'none';
    let dps = c.dps === 'clawsScreech' ? 'claws' : c.dps || 'none'; if (!ok(dps)) dps = 'none';
    let fix = c.fix || 'tick'; if (!ok(fix)) fix = 'tick';
    return { i, name: c.name || `P${i + 1}`, gear: g, spec: Number(c.startSpec ?? 100), regen: 0, regenHold: Number(c.startSpec ?? 100) < 100,
      surgePlan: !!c.surge, surged: false, surgeReady: Math.max(0, Number(c.surgeCd) || 0), surgeAt: null,
      lb: false, lbLeft: Number(c.lbCycles || 0), dpsFrom: Number(c.dpsFrom) || 0, dps, fix, horn: !!c.horn && !!g.horn, firstSpec: false,
      open, openDone: open === 'none', noMaul: !own('Elder maul'), used: 0, attacks: 0, remaulDue: false, halb: own('Crystal halberd'), hornUsed: false, scytheSure: false,
      rangePot: c.rangePot === undefined || c.rangePot === null ? (open === 'ralos' || (backups || []).some((b) => Number(b.p) === i && b.spec === 'ralos') ? 'divine' : '') : normRangePot(c.rangePot),
      next: EXH + 1, hornUntil: -1, thrallNext: EXH + 1 + rng.randint(1, 2) };
  });
  // surge cooldown carried in: it doesn't tick between rooms, so it's ready `surgeCd` ticks into this room (the exhumeds count)
  const pid = rng.shuffle(ps.slice());
  let hits = [];                                                    // [tick, player, amount | null, label, kind, hit]; .role: open / remaul / backup
  const has = (p, w) => (p.gear.weapons || []).includes(w);
  const drinkSurge = (p, t) => { const o = p.spec; p.spec = Math.min(100, p.spec + SURGE); p.surged = true; p.surgeAt = t; st.specs.surge++; if (trace) trace.push({ t, i: p.i, supply: `spec surge (${o}% -> ${p.spec}%)` }); L.on && L(`t${t} ${p.name} surge ${o}% -> ${p.spec}%`); };
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
    if (dropAt == null && hp <= SCREECH_HP && hp > 0) { dropAt = t; screech = t + 1; while (screech % 4 !== 0) screech++; L.on && L(`t${t} Xarpus at or below 33% of his start (${SCREECH_HP}): screech on t${screech}`); }
    if (hp <= 0) { kill = t; L.on && L(`t${t} *** XARPUS DIES ***`); }
  };
  // ---- Defence specs: openings, re-mauls, backups
  const maulers = ps.filter((p) => p.open === 'maul');
  let maulsLanded = 0, openSeen = 0, openLanded = 0, remaulers = maulers.length ? null : [];   // re-maul players, once the opening mauls are in
  const remaulAny = new Set(Object.values(remaul || {}).flat().map(Number));
  const backs = (backups || []).map((b) => ({ p: ps[Number(b.p)], spec: b.spec, now: b.now == null ? -1 : Number(b.now), state: 'wait' }))
    .filter((b) => b.p && canDo(b.p.gear, b.spec));                // state: wait / armed / done / skip
  const inFlight = (...k) => hits.filter((h) => k.includes(h[4])).length;
  const defFlying = () => inFlight('maul', 'bgs', 'ralos') > 0;
  const remaulOpen = () => remaulers == null || ps.some((p) => p.remaulDue) || hits.some((h) => h.role === 'remaul');
  /** The mauls are settled: the opening mauls have swung and landed and any re-mauls have too. */
  const settled = () => maulers.every((p) => p.openDone) && !remaulOpen();
  const canSpec = (p) => p.used < CAP;
  /** The most a backup could take off his Defence from `d`. */
  const maxDrain = (b, d) => {
    if (b.spec === 'maul' && !b.p.noMaul) return Math.floor(d * 0.35);
    if (b.spec === 'ralos') return 2 * RALOS_DRAIN;
    const mx0 = melee(b.p, 'Bandos godsword', 1, d, 2)[1]; return Math.floor(Math.floor(mx0 * 1.1) * 1.1);
  };
  /** Each tick before the attacks: re-mauls once the opening mauls are in; backups armed (right away, or the next in turn). */
  const planDefence = (t) => {
    if (remaulers == null && maulers.every((p) => p.openDone) && openSeen >= maulers.length) {
      remaulers = (remaul[openLanded] || []).map((k) => ps[Number(k)]).filter((p) => p && canDo(p.gear, 'maul') && canSpec(p));
      for (const p of remaulers) p.remaulDue = true;
      L.on && L(`t${t} ${openLanded} of ${maulers.length} opening mauls landed${remaulers.length ? `: ${remaulers.map((p) => p.name).join(', ')} maul again` : ''}`);
    }
    if (remaulers == null) return;
    const volleyGone = !ps.some((p) => p.remaulDue);
    for (const b of backs) {                                        // back up right away
      if (b.state === 'wait' && b.now >= 0 && openLanded <= b.now && volleyGone && b.p.openDone && !b.p.remaulDue && canSpec(b.p) && b.p.spec >= 50 && defLvl > defTarget) { b.state = 'armed'; L.on && L(`t${t} ${b.p.name} backs up right away (${openLanded} opening maul${openLanded === 1 ? '' : 's'} landed)`); }
    }
    if (backs.some((b) => b.state === 'armed') || defFlying() || !settled() || ps.some((p) => !p.openDone)) return;
    const rest = backs.filter((b) => b.state === 'wait');
    if (!rest.length) return;
    if (defLvl <= defTarget) { for (const b of rest) b.state = 'skip'; return; }
    let d = defLvl; const group = [];
    for (const b of rest) {
      if (group.some((x) => x.p === b.p)) continue;                  // one each at a time
      if (!canSpec(b.p) || b.p.spec < 50 || (b.spec === 'maul' && maulsLanded >= MAUL_BACKUP_UNTIL)) { b.state = 'skip'; continue; }
      group.push(b); d -= maxDrain(b, d);
      if (d <= defTarget) break;                                    // this one (with any before it in the group) could get him there
    }
    for (const b of group) b.state = 'armed';
    if (L.on && group.length) L(`t${t} backup${group.length > 1 ? 's together' : ''}: ${group.map((b) => `${b.p.name} ${b.spec}`).join(', ')} (Defence ${defLvl}, target ${defTarget})`);
  };
  /** The player's Defence spec now: {kind, role, b?} or null (scythe / damage spec). */
  const defAct = (p, t) => {
    if (!p.openDone) {
      if (p.open === 'maul') return p.spec >= 50 ? { kind: p.noMaul ? 'bgs' : 'maul', role: 'open', asMaul: p.noMaul } : null;
      if (p.attacks < 1 || !settled()) return null;                // a BGS / Ralos opener: after their first scythe, once the mauls are in
      if (defLvl <= defTarget) { p.openDone = true; return null; }
      return p.spec >= 50 ? { kind: p.open, role: 'open' } : null;
    }
    if (p.remaulDue) return p.spec >= 50 ? { kind: p.noMaul ? 'bgs' : 'maul', role: 'remaul', asMaul: p.noMaul } : null;
    const b = backs.find((x) => x.p === p && x.state === 'armed');
    if (!b) return null;
    if (defLvl <= defTarget || !canSpec(p) || (b.spec === 'maul' && maulsLanded >= MAUL_BACKUP_UNTIL)) { b.state = 'skip'; return null; }
    if (p.spec < 50) return null;
    return { kind: b.spec === 'maul' && p.noMaul ? 'bgs' : b.spec, role: 'backup', b, asMaul: b.spec === 'maul' && p.noMaul };
  };
  /** Is any Defence spec still to come? */
  const defOpen = () => ps.some((p) => !p.openDone) || remaulOpen() || defFlying() || (defLvl > defTarget && backs.some((b) => b.state === 'wait' || b.state === 'armed'));
  const ownDefDone = (p) => p.openDone && !p.remaulDue && !(remaulers == null && remaulAny.has(p.i))
    && !(defLvl > defTarget && backs.some((b) => b.p === p && (b.state === 'wait' || b.state === 'armed')));
  const dpsAct = (p, t) => {
    if (p.dps === 'none' || !ownDefDone(p) || t < p.dpsFrom) return null;   // their own Defence specs first; held until dpsFrom
    if (p.dps === 'zcb') {
      if (hp < zcbBelow) return !defOpen() && has(p, 'Dragon claws') && p.spec >= 50 ? 'claw' : null;
      if (holdZcb) return screech != null && t >= screech && p.spec >= ZCB_SPEC ? 'zcb' : null;   // held for the screech
      return settled() && p.spec >= ZCB_SPEC ? 'zcb' : null;        // else: once the mauls are settled
    }
    if (defOpen()) return null;                                     // claws: once no Defence spec is still to come
    return p.spec >= 50 ? 'claw' : null;
  };
  // ---- horns on the interact tick: the caster and the first other opening mauler can't miss their next maul / BGS
  for (const c of ps.filter((q) => q.horn && q.spec >= HORN_COST)) {
    const rec = ps.find((q) => q !== c && (q.open === 'maul' || q.open === 'bgs'));
    spend(c, HORN_COST, EXH); st.specs.horn++; st.specLog.push({ i: c.i, kind: 'horn', t: EXH });
    c.hornUntil = EXH + HORN_TICKS; c.hornUsed = true; if (rec) rec.hornUntil = EXH + HORN_TICKS;
    if (trace) trace.push({ t: EXH, i: c.i, code: 'H', what: `Soulflame horn: ${c.name}${rec ? ` and ${rec.name}` : ''} can't miss their next maul / BGS`, spec: c.spec + HORN_COST, specAfter: c.spec });
    L.on && L(`t${EXH} ${c.name} Soulflame horn (${c.spec}% left): ${c.name}${rec ? ` and ${rec.name}` : ''} can't miss their next maul / BGS`);
  }
  for (let t = EXH + 1; t <= EXH + 3000 && kill == null; t++) {
    // ---- hits landing
    const landing = hits.filter((h) => h[0] === t); hits = hits.filter((h) => h[0] !== t);
    for (const h of landing) {
      const [, p, amt, label, kind, hit] = h;
      if (h.tr && (kill == null || kill === t)) h.tr.landed = t;
      if (kill != null) { if (kill === t) { anim = DEATH_ANIM_OVERKILL; L.on && L(`t${t} ${p.name} ${label} lands after the kill (overkill)`); } if (trace) for (const x of landing.slice(landing.indexOf(h))) if (x.tr && x.tr.landed == null && x[2] != null) x.tr.landed = x[0]; break; }
      if (kind === 'maul' && hit) maulsLanded++;
      if (h.role === 'open' && kind === 'maul') { openSeen++; if (hit) openLanded++; }
      if (kind === 'ralos') {                                         // two rolls; a hit (1+) drains before the second roll
        let total = 0; const parts = [], defBeforeRalos = defLvl, accs = [], exps = [];
        for (let k = 0; k < 2; k++) {
          const [ch, mx] = ranged(bestWorn(p.gear, 'range', 'Tonalztics of Ralos').set, defLvl, 1.5, rangedLevel(p.rangePot, t)); accs.push(ch); exps.push(hitMV(ch, Math.floor(mx * 0.75)));
          const d = rng.random() < ch || specsLand ? Math.max(1, rng.randint(0, Math.floor(mx * 0.75))) : 0;   // a hit that passes accuracy: at least 1 (specsLand: always)
          parts.push(d); total += d;
          if (d >= 1) { st.specs.ralosHits++; lowerDef(t, `${p.name} Ralos Spec hit ${k + 1}`, RALOS_DRAIN); }
        }
        if (h.tr) Object.assign(h.tr, { acc: accs, exp: sumMV(...exps), dmg: total, what: `Ralos Spec ${parts.join('/')} - his Defence ${defBeforeRalos} -> ${defLvl}` });
        damage(t, total, `${p.name} Ralos Spec ${parts.join('/')}`, 'ralos');
      } else if (kind === 'zcb') {
        const [ch] = ranged(bestWorn(p.gear, 'range', 'Zaryte crossbow').set, defLvl, 2, rangedLevel(p.rangePot, t));
        const ok = rng.random() < ch, ruby = Math.min(110, Math.floor(hp * 0.22));
        if (h.tr) Object.assign(h.tr, { acc: ch, exp: constMV(ch, ruby) }, ok ? { dmg: ruby, ruby: true } : { dmg: 0 });
        if (ok) damage(t, ruby, `${p.name} ZCB spec ruby`, 'zcb');
        else L.on && L(`t${t} ${p.name} ZCB spec misses`);
      } else damage(t, amt, `${p.name} ${label}`, kind);
    }
    if (trace) {
      trace.push({ t, hp: Math.max(0, hp), phase: dropAt == null ? 'to the screech' : 'after the screech' });
      if (dropAt === t) trace.push({ t, mark: '33%' });
    }
    if (kill != null) { if (trace) trace.push({ t, boss: 'Dies', short: '☠', kind: 'kill', tip: `Xarpus dies - the room ends ${anim} ticks later` }); break; }
    // ---- spec regen, Lightbearer, a surge that was waiting on its cooldown, thralls
    for (const p of ps) {
      if (p.surgePlan && !p.surged && p.firstSpec && t >= p.surgeReady && p.spec <= 75) drinkSurge(p, t);
      const wantLb = p.lbLeft > 0 && p.spec < 100 && !p.regenHold;
      if (wantLb !== p.lb) p.lb = wantLb;
      if (!p.regenHold && p.spec < 100) {
        if (++p.regen >= (p.lb ? 25 : 50)) {
          p.regen = 0; p.spec = Math.min(100, p.spec + 10);
          if (trace) trace.push({ t, i: p.i, regen: `spec regen -> ${p.spec}%${p.lb ? ' (Lightbearer)' : ''}` });
          if (p.freeRegen) p.freeRegen = false;
          else if (p.lb && --p.lbLeft <= 0) { p.lb = false; L.on && L(`t${t} ${p.name} Lightbearer cycles done (${p.spec}%) - Ultor`); }
        }
      } else if (!p.regenHold) p.regen = 0;
      if (p.thrallNext === t) { hits.push([t + 1, p, rng.randint(0, 3), 'thrall', 'thrall']); if (trace) hits[hits.length - 1].tr = { t, i: p.i, thrall: true, dmg: hits[hits.length - 1][2], icon: 'Greater_ghost' }, trace.push(hits[hits.length - 1].tr); p.thrallNext = t + 4; }
    }
    // ---- player attacks, in PID order
    planDefence(t);
    for (const p of pid) {
      if (t !== p.next) continue;
      const n0 = hits.length, d0 = defLvl, specAt0 = p.spec;
      const da = defAct(p, t);
      let act = da ? da.kind : dpsAct(p, t) || 'scythe';
      // Chally last hit: once he's at or below the threshold, a player who'd scythe halberds with 30%; one with a horn and
      // 25-29% (no halberd in reach) horns instead - no attack delay: their and the next other attacker's swing can't miss
      if (act === 'scythe' && hp <= CHALLY_HP && ownDefDone(p)) {
        if (p.halb && p.spec >= 30) act = 'halb';
        else if (p.horn && !p.hornUsed && p.spec >= HORN_COST) {
          spend(p, HORN_COST, t); p.hornUsed = true; st.specs.horn++; st.specs.lateHorn++; st.specLog.push({ i: p.i, kind: 'horn', t });
          p.scytheSure = true; const rec = pid.find((q) => q !== p && q.next > t); if (rec) rec.scytheSure = true;
          if (trace) trace.push({ t, i: p.i, code: 'H', what: `Soulflame horn for the last hit: ${p.name}${rec ? ` and ${rec.name}` : ''} can't miss their next swing`, spec: p.spec + HORN_COST, specAfter: p.spec });
          L.on && L(`t${t} ${p.name} Soulflame horn for the last hit (${p.spec}% left): ${p.name}${rec ? ` and ${rec.name}` : ''} can't miss their next swing`);
        }
      }
      // the tick fix: their scythe / ZCB would go off on the i3 before the screech (they saw him under 33% by the tick before)
      if (screech != null && t === screech - 1 && dropAt < t && (act === 'scythe' || act === 'zcb')) {
        const f = p.fix === 'claw' && p.spec < 50 ? 'scratch' : p.fix;
        st.fixes.push({ i: p.i, fix: f, t }); act = `fix:${f}`;
      }
      if (da) {
        p.used++;
        if (da.role === 'open') p.openDone = true; else if (da.role === 'remaul') p.remaulDue = false; else da.b.state = 'done';
      }
      p.attacks++;
      if (act !== 'scythe' && !act.startsWith('fix:')) st.specLog.push({ i: p.i, kind: act, t, when: da ? da.role : undefined });
      const tag = da && da.role !== 'open' ? ` (${da.role === 'remaul' ? (p.open === 'maul' ? 'maul again' : 'mauls short') : 'backup'})` : '';
      let acc = null, exp = null;                                     // (trace: their accuracy and expected damage for this attack)
      if (act === 'maul' || act === 'bgs') {
        spend(p, 50, t);
        const horned = t <= p.hornUntil; if (horned) p.hornUntil = -1;
        if (act === 'maul') {
          st.specs.maul++;
          const [ch, mx] = melee(p, 'Elder maul', 2, defLvl, 1.25), hit = horned || rng.random() < ch || specsLand; acc = horned ? 1 : ch; exp = hitMV(acc, mx);
          const d = hit ? Math.max(1, rng.randint(0, mx)) : 0;
          if (hit) { st.specs.maulHit++; lowerDef(t, `${p.name} Elder maul`, Math.floor(defLvl * 0.35)); }
          hits.push(Object.assign([t + MELEE_DELAY, p, d, `Elder maul spec${horned ? ' (horned)' : ''}${hit ? '' : ' misses'}`, 'maul', hit], { role: da && da.role }));
        } else {
          st.specs.bgs++;
          const [ch, mx0] = melee(p, 'Bandos godsword', 1, defLvl, 2), mx = Math.floor(Math.floor(mx0 * 1.1) * 1.1), hit = horned || rng.random() < ch || specsLand; acc = horned ? 1 : ch; exp = hitMV(acc, mx);
          const d = hit ? Math.max(1, rng.randint(0, mx)) : 0;
          if (hit) { st.specs.bgsHit++; lowerDef(t, `${p.name} BGS`, bgsToZero ? defLvl : d); }   // bgsToZero: checking against a raid that hit 0 there
          hits.push(Object.assign([t + MELEE_DELAY, p, d, `BGS spec${horned ? ' (horned)' : ''}${hit ? '' : ' misses'}`, da && da.asMaul ? 'maul' : 'bgs', hit], { role: da && da.role }));
        }
        L.on && L(`t${t} ${p.name} ${act === 'maul' ? 'Elder maul' : 'BGS'} spec${tag} (${p.spec}% left)`);
        p.next = t + 6;
      } else if (act === 'ralos') {
        spend(p, 50, t); st.specs.ralos++;
        hits.push(Object.assign([t + RALOS_DELAY, p, null, 'Ralos Spec', 'ralos'], { role: da && da.role }));
        L.on && L(`t${t} ${p.name} Ralos Spec${tag} (${p.spec}% left), lands t${t + RALOS_DELAY}`);
        p.next = t + 6;
      } else if (act === 'zcb') {
        spend(p, ZCB_SPEC, t); st.specs.zcb++;
        hits.push([t + ZCB_DELAY, p, null, 'ZCB spec', 'zcb']);
        L.on && L(`t${t} ${p.name} ZCB spec (${p.spec}% left)`);
        p.next = t + 5;
      } else if (act === 'halb') {
        spend(p, 30, t); st.specs.halb++;
        const parts = halbSpec(p, defLvl, rng); acc = parts.acc; exp = halbMV(acc[0], acc[1], parts.m);
        hits.push([t + MELEE_DELAY, p, parts[0] + parts[1], `halberd spec ${parts.join('/')} (last hit)`, 'halb']);
        L.on && L(`t${t} ${p.name} Crystal halberd spec - last hit (${p.spec}% left)`);
        p.next = t + 7;
      } else if (act === 'claw' || act === 'fix:claw') {
        spend(p, 50, t); st.specs.claw++;
        const parts = clawSpec(p, defLvl, rng); acc = parts.acc; exp = clawMV(acc, melee(p, 'Dragon claws', 1, defLvl)[1]);
        hits.push([t + MELEE_DELAY, p, parts.reduce((a, b) => a + b, 0), `claw spec ${parts.join('/')}${act === 'fix:claw' ? ' (tick fix)' : ''}`, 'claw']);
        L.on && L(`t${t} ${p.name} claw spec${act === 'fix:claw' ? ' (tick fix)' : ''} (${p.spec}% left)`);
        p.next = t + 4;
      } else if (act === 'fix:scratch') {
        const [ch, mx] = melee(p, 'Dragon claws', 1, defLvl), d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0; acc = ch; exp = hitMV(ch, mx);
        hits.push([t + MELEE_DELAY, p, d, 'claw scratch (tick fix)', 'scratch']); p.next = t + 4;
      } else if (act === 'fix:bp') {
        const [ch, mx] = ranged(bpSet(p), defLvl, 1, rangedLevel(p.rangePot, t)), d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0; acc = ch; exp = hitMV(ch, mx);
        hits.push([t + BP_DELAY, p, d, 'blowpipe (tick fix)', 'bp']); p.next = t + 2;
      } else if (act === 'fix:ayak') {
        const [ch, mx] = ayak(p), d = rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0; acc = ch; exp = hitMV(ch, mx);
        hits.push([t + AYAK_DELAY, p, d, 'Ayak (tick fix)', 'ayak']); p.next = t + 3;
      } else {                                                        // scythe (fix 'tick': a scythe, next attack 1 tick late - 2 ticks a quarter of the time)
        const [ch, mx] = melee(p, 'Scythe of vitur', 1, defLvl);
        const sure = p.scytheSure; p.scytheSure = false; acc = sure ? 1 : ch; exp = scytheMV(acc, mx);   // a last-hit horn: this swing can't miss
        const parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => (sure || rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0));
        const lose = act === 'fix:tick' ? (rng.random() < 0.75 ? 1 : 2) : 0;   // lose tick(s): 1 tick 75% of the time, 2 ticks 25%
        hits.push([t + MELEE_DELAY, p, parts.reduce((a, b) => a + b, 0), `scythe ${parts.join('/')}${lose ? ` (tick fix: next swing ${lose} tick${lose > 1 ? 's' : ''} late)` : ''}`, 'scythe']);
        p.next = t + 5 + lose;
      }
      if (trace) for (const h of hits.slice(n0)) {                   // this attack (the Show raid timeline): what it was, his Defence as it went off
        h.tr = { t, i: p.i, code: TRACE_CODE[h[4]] || 'S', what: `${h[3]}${defLvl !== d0 ? ` - his Defence ${d0} -> ${defLvl}` : ` (his Defence ${d0})`}`, dmg: h[2], landed: null, spec: specAt0, specAfter: p.spec, acc, exp };
        trace.push(h.tr);
      }
    }
  }
  const end = kill == null ? null : kill + anim;
  if (trace) for (const h of hits) if (h.tr && h.tr.landed == null && h[2] != null) h.tr.landed = h[0];   // hits in the air at the kill count as rolled
  if (trace) {
    // his row: an attack at the start of each cycle (the first one after the exhumeds skipped: EXH + 7, then every 4),
    // up to the screech; the screech skips one action, then he turns every two cycles (screech + 8, + 16, ...)
    const last = kill ?? (EXH + 3000);
    trace.push({ t: EXH, mark: 'Start' }, { t: EXH, boss: 'Exhumeds end', short: '', kind: 'exh', tip: `The exhumeds end - ${nHeals} heal${nHeals === 1 ? '' : 's'}, he starts on ${START} HP` });
    for (let x = EXH + 7; x <= last && (screech == null || x < screech); x += 4) trace.push({ t: x, boss: 'Attack', kind: 'attack', icon: 'Xarpus', tip: 'attack' });
    if (screech != null && screech <= last) {
      trace.push({ t: screech, mark: 'Screech' });
      for (let x = screech + 8; x <= last; x += 8) trace.push({ t: x, boss: 'Turn', kind: 'turn', icon: 'Xarpus_turn', tip: 'turns' });
    }
    trace.sort((a, b) => a.t - b.t);
  }
  return { end, kill, anim, startHp: START, heals: nHeals, screech, dropAt, defZeroAt, defEnd: defLvl, defLastAt: lastDefAt, maulHits: maulsLanded, openLanded, openMaulers: maulers.length, ...st,
    players: ps.map((p) => ({ name: p.name, spec: p.spec, surgeAt: p.surgeAt,
      // surge cooldown left after the room (it doesn't tick between rooms)
      surgeCd: end == null ? 0 : p.surgeAt != null ? Math.max(0, p.surgeAt + SURGE_CD - end) : Math.max(0, p.surgeReady - end) })) };
}
