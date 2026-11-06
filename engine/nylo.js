// Nylocas Vasilias (room 3, the Nylo boss). Stats so far; the room flow comes next.
//  - HP 2500 (5s), scaled down below 5s like the other rooms: 87.5% in 4s, 75% in 3s / duos / solos.
//  - Defence 50, Magic 20; every defensive bonus 0 (stab / slash / crush, ranged, magic). Size 4x4.
//    His defence rolls: melee / ranged (50 + 9) x 64 = 3776; magic (his Magic level) (20 + 9) x 64 = 1856.
//  - Three forms, shown by his carapace: white = melee, green = ranged, blue = magic. He spawns white (melee) for 9 ticks,
//    then switches to one of the other two (50 / 50), and every form after that lasts 10 ticks. Only the matching style
//    damages him: a wrong-style hit heals him by the damage and is reflected back to the player.
//  - Players queue their attack on each change (they click the tick it changes), so the earliest attack in a form is its
//    2nd tick (spawn t286: first attacks t287).
//  - The room runs on a 4-tick instance cycle, i1..i4. He spawns on an i1 (set by the players later) and shows up 2 ticks
//    later (i3: his first form starts there), so the first attacks are on an i4. His death animation is 5 ticks from the
//    killing hit landing (4 with overkill); the room ends the tick after the first i4 at or after it ends (the next i1).
//    The boss time runs from his spawn (i1) to the room's end - always a multiple of 4 ticks (spawn t300 = 3:00, death
//    animation done on the i4 t355: room ends t356 = 3:33.6).
export const NYLO_HP = { 5: 2500, 4: 2187, 3: 1875, 2: 1875, 1: 1875 };
export const NYLO = { def: 50, magic: 20, dfn: { stab: 0, slash: 0, crush: 0, light: 0, standard: 0, heavy: 0, ranged: 0, magic: 0 } };
export const FORMS = ['melee', 'ranged', 'magic'];
export const FIRST_FORM_TICKS = 9;               // his spawn form (melee)
export const FORM_TICKS = 10;                    // every form after it
export const FIRST_ATTACK_OFFSET = 1;            // earliest attack: the form's 2nd tick
/** The attacks players use here (for the setup): by his form, and the specs. */
export const NYLO_WEAPONS = {
  melee: ['Scythe of vitur', 'Dragon claws (spec)', 'Crystal halberd (spec)', 'Bandos godsword (spec)'],
  ranged: ['Twisted bow', 'Toxic blowpipe', 'Zaryte crossbow (spec)'],
  magic: ["Tumeken's shadow", 'Eye of ayak', "Zorya's tome", "Zorya's tome (spec)"],
};
export const CYCLE = 4;                          // the room's cycle
export const SHOW_UP = 2;                        // spawn (i1) -> his first form (i3)
export const DEATH_TICKS = 5, DEATH_OVERKILL = 4; // killing hit landing -> his death animation ends
/** The instance tick (1..4) of tick t, for a spawn (i1) on tick i1. */
export const inst = (t, i1) => (((t - i1) % CYCLE) + CYCLE) % CYCLE + 1;
/** The room's end: the tick after the first i4 at or after his death animation ends (an i1). */
export function roomEnd(kill, overkill, i1) { let t = kill + (overkill ? DEATH_OVERKILL : DEATH_TICKS); while (inst(t, i1) !== 4) t++; return t + 1; }
/** His defence roll against a style: (level + 9) x (bonus + 64); magic rolls against his Magic level. */
export const defRoll = (style) => ((style === 'magic' ? NYLO.magic : NYLO.def) + 9) * ((NYLO.dfn[style] ?? 0) + 64);
/** The next form: one of the other two, at random. */
export const nextForm = (form, rng) => { const o = FORMS.filter((f) => f !== form); return o[rng.randint(0, 1)]; };
/** His forms from his spawn tick: [{ form, start, end (last tick), first (earliest attack) }, ...] covering up to `until`. */
export function formSchedule(spawn, rng, until) {
  const out = [{ form: 'melee', start: spawn, end: spawn + FIRST_FORM_TICKS - 1 }];
  while (out[out.length - 1].end < until) {
    const prev = out[out.length - 1], start = prev.end + 1;
    out.push({ form: nextForm(prev.form, rng), start, end: start + FORM_TICKS - 1 });
  }
  for (const f of out) f.first = f.start + FIRST_ATTACK_OFFSET;
  return out;
}
/** His form on tick t (from a formSchedule). */
export const formAt = (sched, t) => sched.find((f) => t >= f.start && t <= f.end) || null;

// ---------------------------------------------------------------- the room (step 3: + blowpipes, opening claws / BGS)
//  - He spawns on `spawn` (default t286, a cycle start) and attacks on his forms' 3rd and 7th ticks (the spawn form: its
//    2nd and 6th). Damage to players isn't simulated.
//  - Players: a scythe in his melee form (their first attack a spec: Player 4 a BGS, everyone else claws - for now), in
//    his ranged form a plan by how far into it their first attack goes (rangedPlan: blowpipes and Twisted bows), an Eye of
//    ayak in his magic form. From the
//    form's 2nd tick, whenever their attack timer is up (scythe / Twisted bow 5 ticks, Ayak 3 - a switch doesn't reset
//    it). The style is checked when the attack is made: a hit landing after he's switched still counts.
//  - Hit delays: scythe 1 (3 hitsplats - he's large), Twisted bow 2, Ayak 2 (as in Verzik), tome 2, shadow 3.
//  - Scythe in their melee gear (118s, their prayer); Twisted bow in their ranged gear on Rigour at 99 Ranged, at the full
//    raid boost (his magic attack bonus is +380: past the 250 cap). Magic at 112 (boosted) on Augury, in their best mage
//    gear for the Ayak: base max 112 / 3 - 6.
import { hit_chance } from './sim.js';
import { worn, bonuses, bestWorn } from './loadout.js';
import { tbowMult } from './sote.js';
import { hitMV, scytheMV, clawMV, halbMV, constMV } from './expdmg.js';
import { ITEMS, tome_attack, shadow_attack } from './gear.js';

export const SCYTHE_DELAY = 1, TBOW_DELAY = 2, AYAK_DELAY = 2, TOME_DELAY = 2, SHADOW_DELAY = 3, BP_DELAY = 2, ZCB_DELAY = 2;
export const BOSS_HITS = [2, 6], SPAWN_HITS = [1, 5];       // his attacks: ticks into a form (spawn form: one earlier)
const PRAY = { Piety: [1.20, 1.23], Zeal: [1.25, 1.28] };
const RANGED = 112, MAGIC = 112, DEF = 118;
const TBOW_MAGIC = 380;                                      // his magic attack bonus (the Twisted bow uses the higher)
const setText = (set) => Object.entries(set).filter(([k, v]) => v && v !== 'none' && k !== 'ammo').map(([, v]) => v).concat(set.ammo ? [set.ammo] : []).join(', ');
/** His defence roll at Defence level d (a BGS lowers it; magic rolls against his Magic level, which it doesn't touch). */
const dRoll = (style, d) => (style === 'magic' ? defRoll('magic') : (d + 9) * ((NYLO.dfn[style] ?? 0) + 64));

/** Melee with a weapon (slash) in their melee gear: [chance, max, gear text]. accMult: a spec's accuracy. */
function melee(p, weapon, d, accMult = 1) {
  const set = worn(p.gear, 'melee', weapon), b = bonuses(set);
  const [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(118 * pa) + 8, es = Math.floor(118 * ps) + 3 + 8;
  return [hit_chance(Math.floor(ea * (b.atk[1] + 64) * accMult), dRoll('slash', d)), Math.floor((es * (b.str + 64) + 320) / 640), setText(set)];
}
/** Their scythe: [chance per hitsplat, max, gear text]. */
export const nyloScythe = (p, d = NYLO.def) => melee(p, 'Scythe of vitur', d);
/** Ranged in their ranged gear on Rigour: [chance, max, gear text]. */
function ranged(p, weapon, d) {
  const set = worn(p.gear, 'range', weapon), b = bonuses(set), v = b.eliteVoid ? [1.10, 1.125] : [1, 1];
  const ea = Math.floor((Math.floor(RANGED * 1.20) + 8) * v[0]), es = Math.floor((Math.floor(RANGED * 1.23) + 8) * v[1]);
  let roll = ea * (b.atk[4] + 64), mx = Math.floor(0.5 + es * (b.rstr + 64) / 640);
  if (weapon === 'Twisted bow') { const [ma, md] = tbowMult(Math.max(NYLO.magic, TBOW_MAGIC)); roll = Math.floor(roll * ma); mx = Math.floor(mx * md); }
  return [hit_chance(roll, dRoll('ranged', d)), mx, setText(set)];
}
/** ZCB spec: double accuracy -> its chance (a hit is the ruby: 22% of his HP, max 110). */
function zcbChance(p, d) {
  const set = worn(p.gear, 'range', 'Zaryte crossbow'), b = bonuses(set), v = b.eliteVoid ? 1.10 : 1;
  const ea = Math.floor((Math.floor(RANGED * 1.20) + 8) * v);
  return hit_chance(ea * (b.atk[4] + 64) * 2, dRoll('ranged', d));
}
/** Their Twisted bow: [chance, max, gear text]. */
export const nyloTbow = (p, d = NYLO.def) => ranged(p, 'Twisted bow', d);
/** Their blowpipe (dragon darts, 2 ticks): [chance, max, gear text]. */
export const nyloBp = (p, d = NYLO.def) => ranged(p, 'Toxic blowpipe', d);
const MELEE_CODES = new Set(['S', 'C', 'Ch', 'BGS', 'Cs']);
/** Their Tumeken's shadow (5 ticks) at 112 Magic: [chance, max, gear text]. */
export function nyloShadow(p) {
  const set = bestWorn(p.gear, 'mage', "Tumeken's shadow").set, gear = Object.entries(set).filter(([s2, v]) => s2 !== 'weapon' && v && v !== 'none').map(([, v]) => v);
  const [, mx, ch] = shadow_attack(gear, MAGIC, { def_roll: defRoll('magic') });
  return [ch, mx, setText(set)];
}
/** Their Eye of ayak (3 ticks): [chance, max, gear text]. */
export function nyloAyak(p) {
  const set = bestWorn(p.gear, 'mage', 'Eye of ayak').set, b = bonuses(set);
  const mx = Math.floor((Math.floor(MAGIC / 3) - 6) * (100 + b.mdmg + 4) / 100);
  return [hit_chance((Math.floor(MAGIC * 1.25) + 9) * (b.atk[3] + 64), defRoll('magic')), mx, setText(set)];
}
/** Dragon claws spec (4 ticks): the 4-roll cascade -> [hits[4], chance, max, gear]. */
function clawSpec(p, d, rng) {
  const [ch, mx, gear] = melee(p, 'Dragon claws', d), fl = Math.floor;
  let hits = null;
  for (let k = 0; k < 4 && !hits; k++) {
    if (rng.random() >= ch) continue;
    if (k === 0) { const x = rng.randint(fl(mx / 2), mx - 1); hits = [x, fl(x / 2), fl(x / 4), fl(x / 4) + 1]; }
    else if (k === 1) { const x = rng.randint(fl(3 * mx / 8), fl(7 * mx / 8)); hits = [0, x, fl(x / 2), fl(x / 2) + 1]; }
    else if (k === 2) { const x = rng.randint(fl(mx / 4), fl(3 * mx / 4)); hits = [0, 0, x, x + 1]; }
    else hits = [0, 0, 0, rng.randint(fl(mx / 4), fl(5 * mx / 4))];
  }
  return [hits || (rng.random() < 2 / 3 ? [1, 1, 0, 0] : [0, 0, 0, 0]), ch, mx, gear];
}
/** BGS spec (6 ticks): 2x accuracy, max x1.1 x1.1 -> [chance, max, gear]. A hit lowers his Defence by the damage. */
function bgsNums(p, d) { const [ch, mx0, gear] = melee(p, 'Bandos godsword', d, 2); return [ch, Math.floor(Math.floor(mx0 * 1.1) * 1.1), gear]; }

/** Crystal halberd spec (30%, 7 ticks): two hits (he's big), the second at 75% accuracy; each landed hit 1..max + max/10.
 *  Its stats in place of the scythe's. -> [hits[2], [ch1, ch2], max, gear]. */
const HALB = { atk: 110, str: 118 };
function halbSpec(p, d, rng) {
  const scy = ITEMS['Scythe of vitur'], set = worn(p.gear, 'melee', 'Scythe of vitur'), b = bonuses(set);
  const [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(118 * pa) + 8, es = Math.floor(118 * ps) + 3 + 8;
  const atk = b.atk[1] - scy.atk[1] + HALB.atk, mx = Math.floor((es * (b.str - (scy.str || 0) + HALB.str + 64) + 320) / 640);
  const ch = [1, 0.75].map((m) => hit_chance(Math.floor(ea * (atk + 64) * m), dRoll('slash', d)));
  const hits = ch.map((c) => (rng.random() < c ? Math.max(1, rng.randint(0, mx)) + Math.floor(mx / 10) : 0));
  return [hits, ch, mx, setText({ ...set, weapon: 'Crystal halberd' })];
}
/** Zorya's tome in their best magic gear at 112 Magic: [chance, max, gear] for k Flow boosts (0 auto, 1 spec / buffed). */
function tomeNums(p, k) {
  const set = bestWorn(p.gear, 'mage', "Zorya's tome").set, gear = Object.entries(set).filter(([s2, v]) => s2 !== 'weapon' && v && v !== 'none').map(([, v]) => v);
  const [, mx, ch] = tome_attack(gear, MAGIC, { def_roll: defRoll('magic'), k });
  return [ch, mx, setText(set)];
}

/** Their ranged plan for a green form,from how many ticks into it their first attack goes (the form's 2nd tick is 1):
 *  1: 4 blowpipes, Twisted bow · 2: Twisted bow, blowpipe, Twisted bow · 3: 3 blowpipes, Twisted bow · later: Twisted bows.
 *  No blowpipe: Twisted bows. */
export function rangedPlan(k, hasBp = true) {
  if (!hasBp) return [];
  return k === 1 ? ['bp', 'bp', 'bp', 'bp', 'tb'] : k === 2 ? ['tb', 'bp', 'tb'] : k === 3 ? ['bp', 'bp', 'bp', 'tb'] : ['tb', 'tb'];
}
export const SPEC_REGEN = 50, SURGE = 25, ZCB_SPEC = 75;
/** The test plan by player (Player 1..4): opening attack, then what they spec. */
export const TEST_PLAN = [
  { open: 'none', specs: ['halb', 'zcb'], startSpec: 95 },             // P1: 95% start: scythe, chally (regens straight after), ZCB in place of their first Twisted bow
  { open: 'claw', specs: ['zcb'], surge: true },                       // P2: claws, surge, ZCB in place of their first Twisted bow
  { open: 'claw', specs: ['claw'], clawMode: 'gain' },                 // P3: claws, then claws whenever it gains a usable tick
  { open: 'bgs', specs: ['tome'], tomeTickFix: true },                 // P4: BGS, then a tome spec + buffed autos asap (tick fixing for it)
];
/** A player's room plan: { open: 'none' | 'bgs' | 'claw' | 'halb' (their first attack), specs: damage specs in order
 *  ('claw' | 'tome' | 'zcb' | 'halb' - each when his form allows: claws / halberd in melee, tome in magic, ZCB in place of
 *  a Twisted bow), clawMode: 'gain' (only when it gains a usable tick - or he's likely to die this cycle or the next and
 *  the claw can't be the killing blow) | 'asap', startSpec: 95 | 100, surge (after their first spec), tomeTickFix,
 *  rangedStop: { 1: %, 2: %, 3: % } (their own Twisted-bows-only thresholds) }. Specs they've no weapon for are dropped. */
export const NEEDS = { bgs: 'Bandos godsword', claw: 'Dragon claws', halb: 'Crystal halberd', tome: "Zorya's tome", zcb: 'Zaryte crossbow' };
export function normPlan(pl, has, team = 4) {
  const out = { open: 'none', specs: [], clawMode: 'asap', startSpec: 100, surge: false, tomeTickFix: true, healer: false, ...pl };
  out.specs = (out.specs || []).filter((x) => has.has(NEEDS[x]) && !(team === 1 && x === 'tome'));   // solos: no tome (only ticks 5 and 10)
  if (team !== 2) out.healer = false;
  if (out.open !== 'none' && !has.has(NEEDS[out.open])) out.open = 'none';
  return out;
}
/** Their 2-tick ranged weapon for his green forms: the best they have of blowpipe, Ascension crossbows, thrown dragon darts. */
export const FAST = ['Toxic blowpipe', 'Ascension crossbows', 'Dragon dart'];
const FAST_CODE = { 'Toxic blowpipe': 'BP', 'Ascension crossbows': 'AX', 'Dragon dart': 'DD' };
function fastWeapon(p) {
  const own = FAST.filter((w) => p.has.has(w));
  if (!own.length) return null;
  return own.map((w) => [w, fastMV({ ...p, fastW: w }, NYLO.def)]).sort((a, b) => b[1] - a[1])[0][0];
}
/** Diamond ascension bolts (e): Armour Piercing 5.5% (Kandarin hard diary, crossbows' halving included) - can't miss,
 *  0-115% of their max. */
export const DIAMOND_PROC = 0.055;
/** Their 2-tick ranged hit's expected damage (fastMVv: [mean, variance]). */
function fastMVv(p, d) {
  const [ch, mx] = ranged(p, p.fastW, d);
  if (p.fastW !== 'Ascension crossbows') return hitMV(ch, mx);
  const [m1, v1] = hitMV(1, Math.floor(mx * 1.15)), [m0, v0] = hitMV(ch, mx), q = DIAMOND_PROC, m = q * m1 + (1 - q) * m0;
  return [m, q * (v1 + m1 * m1) + (1 - q) * (v0 + m0 * m0) - m * m];
}
const fastMV = (p, d) => fastMVv(p, d)[0];
/** One 2-tick ranged hit -> [hits[1], chance, max, gear, proc]. */
function fastHit(p, d, rng) {
  const [ch, mx, gear] = ranged(p, p.fastW, d);
  if (p.fastW === 'Ascension crossbows' && rng.random() < DIAMOND_PROC) return [[Math.max(1, rng.randint(0, Math.floor(mx * 1.15)))], 1, Math.floor(mx * 1.15), gear, true];
  return [[rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0], ch, mx, gear, false];
}


/** Tome tick fixing (plan.tomeTickFix): while they've a tome hit to come (a tome spec they have the spec for, or buffed
 *  autos still in their 30s), in his ranged form they pick their blowpipes / Twisted bows for the most damage that still
 *  leaves them free in time to fit it all into a magic form next: the spec by its 3rd tick (spec + 3 buffed autos), or the
 *  buffed autos they have left (b: free by tick 10 - 2(b - 1)). E.g. from the form's 2nd tick 3 blowpipes and a Twisted bow
 *  instead of 4 blowpipes and one. Their melee form plays as usual. Unless he's likely to die this form or the next (his
 *  HP at or under the team's expected damage over them) and this form isn't magic: then they drop the tome and claw
 *  instead (their next melee attack, with 50%+). -> the attack now: 'bp' | 'tb' | 'wait'. */
function alignAct(t, f, ev, target) {
  const memo = new Map(), opts = [['tb', 5, ev.tb], ['bp', 2, ev.bp]];
  const V = (n) => {
    if (n > f.end) return n <= target ? [0, 'wait'] : [-1e9, null];
    if (memo.has(n)) return memo.get(n);
    let best = [V(n + 1)[0] - 1e-6, 'wait'];                   // a tick waiting (only if nothing else fits)
    for (const [a, d, v] of opts) if (v != null) { const x = v + V(n + d)[0]; if (x > best[0] + 1e-9) best = [x, a]; }
    memo.set(n, best); return best;
  };
  return V(t)[1];
}

// ---------------------------------------------------------------- his attacks, veng
//  - On each form's 3rd and 7th ticks (2nd and 6th as he spawns) at a random player (not one under him), in his form's
//    style: max 70, accuracy - melee (400 + 9) x 64 (crush - to confirm), ranged (350 + 9) x 64, magic (50 + 9) x (600 + 64)
//    - against their Defence 118 / Magic 112 on their prayer (+25%), in the gear they have on for his form. Prayed against:
//    melee blocked, ranged / magic max 17. Players pray against him unless they've veng up and more than 70 HP (then they
//    take it off prayer). His melee lands the tick after he attacks, ranged / magic 2 ticks after.
//  - Takeoffs (option, default on): a player taking his attack off prayer for veng, whose next attack is at least 2 ticks
//    after his, wears their least defensive set for it - his melee / ranged: their mage gear; his magic: their melee gear.
//  - Veng: 75% of a hit back to him (any form), that tick. Everyone starts with it up and off cooldown; recast the tick the
//    50-tick cooldown allows. 99 HP, no food.
//  - Under him (his ranged / magic forms): on ticks 2-4 and 6-8 he can't target them; they attack only on ticks 5 and 10, with
//    their strongest weapon (Twisted bow / Ayak for now). They go under when they can't take a prayed hit (17 or less) - after
//    a teammate's Heal Other (75% of the caster's HP, to the one with the most) - or with no veng when it costs them nothing
//    (their attacks fall on 5 and 10 anyway). Under, they Heal Other (once a form, on its 2nd tick) a teammate who isn't: one
//    with veng up who'd then take it off prayer safely, else one who'd have veng by his attack and could, else the lowest at
//    30 or less - on redemption: a proc (9 or less) +24, then a restore for their prayers.
//  - Melee thralls (one each, from their first attack, 0-3 every 4 ticks, can't miss): damage only in his melee form.
//  - Amulet of blood fury (their melee neck): 20% of melee hits heal them 30% of the damage.
// Duos: Healer Tech (one player, plan.healer): under him every ranged / magic form; they Heal Other their teammate whenever
//   they're down 24+ (every 3 ticks at most), then a locator orb takes them to 9 or less for redemption (+24) and a restore
//   puts their prayers back - while restore doses last; their veng goes on their teammate (Vengeance Other) whenever the
//   teammate's is down.
// Solos: after his first form, under him on each form's ticks 1-4 and 6-9, attacking only on 5 and 10 (scythe / Twisted
//   bow / shadow, else Ayak, or a spec); he attacks once a form, on its 5th tick. Too low for a prayed hit: a locator orb +
//   redemption (+24) and a restore, while restore doses last.
export const SOLO_UNDER = new Set([0, 1, 2, 3, 5, 6, 7, 8]), SOLO_HITS = [4], HEAL_LOOP = 3;
export const BOSS_MAX = 70, PRAYED_MAX = 17, VENG_CD = 50, HP_MAX = 99, REDEMPTION = 24;
export const BOSS_ATK = { melee: (400 + 9) * 64, ranged: (350 + 9) * 64, magic: (50 + 9) * (600 + 64) };
export const BOSS_DELAY = { melee: 1, ranged: 2, magic: 2 };
const UNDER_TICKS = new Set([1, 2, 3, 5, 6, 7]);              // ticks into a form (0 = its first) they're under him
/** Their defence rolls against his three styles, in the gear they wear for each form. */
export function playerDef(p) {
  const eff = Math.floor(DEF * 1.25) + 8, effM = Math.floor(Math.floor(MAGIC * 1.25) * 0.7 + Math.floor(DEF * 1.25) * 0.3) + 8;
  const bm = bonuses(worn(p.gear, 'melee', 'Scythe of vitur')), br = bonuses(worn(p.gear, 'range', 'Twisted bow')), bg = bonuses(bestWorn(p.gear, 'mage', 'Eye of ayak').set);
  return { melee: eff * (bm.dfn[2] + 64), ranged: eff * (br.dfn[4] + 64), magic: effM * (bg.dfn[3] + 64),
    // a takeoff: their least defensive set for it (his melee / ranged: their mage gear; his magic: their melee gear)
    off: { melee: eff * (bg.dfn[2] + 64), ranged: eff * (bg.dfn[4] + 64), magic: effM * (bm.dfn[3] + 64) } };
}

/** One room. players: [{ name, gear (Gear tab), plan? (TEST_PLAN shape) }]. trace (opt): the Show raid entries.
 *  -> { spawn, kill, sched, def } */
export function runNylo(players, team, rng, { spawn = 286, trace = null, tomeTickFix = true, takeoffs = true, rangedStop = null, ayakSkip = null, plans = null, restores = 8, offPrayVeng = true } = {}) {
  // offPrayVeng: off prayer for his ranged / magic hits with a veng up and HP above his max (solos usually stay on prayer)
  // restores: restore doses for redemption (a duo's Healer Tech player / a solo)
  // plans: { backup: { p, at } } - a backup BGS by player p while his Defence is at or above `at` (after the opening BGSs)
  // ayakSkip: (his HP %) => true to skip an Ayak that would push their next attack past the next form's first tick
  // rangedStop: { 1: %, 2: %, 3: % } - below that share of his HP, a green form's plan (by its first attack's tick) is Twisted bows only
  const sched = formSchedule(spawn, rng, spawn + 600);
  let hp = NYLO_HP[team], kill = null, def = NYLO.def, overkill = false;
  const i1 = spawn - SHOW_UP;                                  // his spawn on the instance cycle (i1); `spawn`: his first form (i3)
  const ps = players.map((p, i) => ({ ...p, i, next: 0, n: 0, plan: null, planForm: null, has: new Set(p.gear.weapons || []),
    spec: null, regen: 0, buff: 0, buffUntil: -1, pl: structuredClone(p.plan || TEST_PLAN[i] || {}),
    hp: HP_MAX, veng: true, vengReady: spawn - SHOW_UP, dead: false, underForm: null, healForm: null, thrallNext: null, pdef: playerDef(p),
    restores, loopReady: 0, bloodFury: /blood fury/i.test(String((p.gear.melee || {}).neck || '')) }));
  const st = { veng: 0, vengDmg: 0, deaths: 0, under: 0, heals: 0, redemptions: 0, taken: 0, thrall: 0, takeoffs: 0 };
  const bq = [];                                              // his hits on the way: [lands, player, damage, entry]
  const alive = () => ps.filter((p) => !p.dead);
  const solo = team === 1;
  const isUnder = (p, f, t) => (solo ? f.start !== spawn && SOLO_UNDER.has(t - f.start) : p.underForm === f.start && UNDER_TICKS.has(t - f.start));
  for (const p of ps) {
    p.pl = normPlan(p.pl, p.has, team);
    p.spec = p.startSpec ?? p.pl.startSpec ?? 100; p.hold = p.spec < 100;
    p.fastW = fastWeapon(p);
  }
  const backup = plans && plans.backup && plans.backup.p != null && ps[plans.backup.p] ? { ...plans.backup } : null;
  const openBgsLeft = () => ps.some((q) => !q.dead && q.pl.open === 'bgs' && !q.openDone && q.spec >= 50);
  // the team's expected damage a tick (each player: the mean of their scythe / Twisted bow / Ayak per tick) - "likely to die"
  const dpt = ps.reduce((a, p) => { const [c1, m1] = nyloScythe(p), [c2, m2] = nyloTbow(p), [c3, m3] = nyloAyak(p);
    return a + (scytheMV(c1, m1)[0] / 5 + hitMV(c2, m2)[0] / 5 + hitMV(c3, m3)[0] / 3) / 3; }, 0);   // under 100: the regen timer waits for their first spec, then regens the tick after
  const q = [];                                               // [lands, i, amt (null: a ZCB ruby), entry]
  const T = trace;
  const roll = (ch, mx) => (rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0);
  const after = (f) => sched[sched.indexOf(f) + 1];
  // scythes from tick n to the end of melee form f: [attacks, the tick they're free in the next form]
  const ride = (n, f) => { let a = 0; while (n <= f.end) { a++; n += 5; } return [a, Math.max(n, after(f).first)]; };
  for (let t = spawn; t < spawn + 600 && kill == null; t++) {
    for (const h of q.filter((h) => h[0] === t)) {            // hits landing
      let amt = h[2];
      if (amt == null) { amt = Math.min(110, Math.floor(hp * 0.22)); if (h[3]) { h[3].ruby = true; h[3].rolledAll = amt; } }   // ZCB ruby
      hp -= amt; h[3] && (h[3].dmg = (h[3].dmg || 0) + amt, h[3].landed = t);
      const a = h[4] && ps[h[1]];                                  // a melee hit: Amulet of blood fury
      if (a && a.bloodFury && !a.dead && amt > 0 && rng.random() < 0.2) { const o = a.hp; a.hp = Math.min(HP_MAX, a.hp + Math.floor(amt * 0.3)); st.bloodFury = (st.bloodFury || 0) + a.hp - o; }
      if (hp <= 0) { overkill = hp < 0; hp = 0; kill = t; break; }
    }
    for (const h of bq.filter((h) => h[0] === t)) {           // his hits landing (veng on any damage)
      const [, p, d, e] = h;
      if (p.dead) continue;
      p.hp -= d; st.taken += d;
      if (e) e.tip += ` - lands t${t}: ${p.name} ${Math.max(0, p.hp)} HP`;
      if (d > 0 && p.veng && kill == null) {
        const r = Math.floor(d * 0.75); p.veng = false; st.veng++; st.vengDmg += r; hp -= r;
        if (e) e.tip += ` · veng ${r} back`;
        if (T) T.push({ t, i: p.i, veng: r });
        if (hp <= 0) { overkill = hp < 0; hp = 0; kill = t; }
      }
      if (p.hp <= 0) { p.dead = true; st.deaths++; if (e) e.tip += ' · DIES'; }
    }
    if (kill != null) break;
    const f = formAt(sched, t), ft = t - f.start;             // ft: ticks into his form (0 = its first)
    for (const p of alive()) {
      if (p.pl.healer) {                                         // Healer Tech: their veng goes on their teammate
        const m = alive().find((q) => q !== p && !q.veng);
        if (m && t >= p.vengReady) { m.veng = true; p.vengReady = t + VENG_CD; if (T) T.push({ t, i: p.i, supply: `casts Vengeance Other on ${m.name}` }); }
        continue;
      }
      if (!p.veng && t >= p.vengReady) { p.veng = true; p.vengReady = t + VENG_CD; if (T) T.push({ t, i: p.i, supply: 'casts Vengeance' }); }
    }
    for (const h of alive().filter((q) => q.pl.healer)) {         // Healer Tech: Heal Other, locator orb -> redemption, restore
      const m = alive().find((q) => q !== h);
      if (!m || h.restores <= 0 || t < h.loopReady || HP_MAX - m.hp < REDEMPTION || h.hp < 12) continue;   // a dose for at least a redemption's worth
      const amt = Math.min(Math.floor(h.hp * 0.75), HP_MAX - m.hp); h.hp -= amt; m.hp += amt; st.heals++;
      const o = h.hp; h.hp = Math.min(h.hp, 9) + REDEMPTION; h.restores--; st.redemptions++; h.loopReady = t + HEAL_LOOP;
      if (T) T.push({ t, i: h.i, supply: `heal other -> ${m.name} +${amt} (${m.name} ${m.hp} HP); ${o > 9 ? `locator orb ${o} -> 9, ` : ''}redemption -> ${h.hp} HP; restore (${h.restores} left)` });
    }
    if (solo && t === f.start && f.start !== spawn) { st.under++; if (T) for (const k of SOLO_UNDER) T.push({ t: f.start + k, i: 0, under: true }); }
    if (solo && f.start !== spawn && f.form !== 'melee' && t - f.start === 3) {   // a solo too low for a prayed hit: orb + redemption
      const p = ps[0];
      if (!p.dead && p.hp <= PRAYED_MAX && p.restores > 0) {
        const o = p.hp; p.hp = Math.min(p.hp, 9) + REDEMPTION; p.restores--; st.redemptions++;
        if (T) T.push({ t, i: p.i, supply: `locator orb ${o} -> ${Math.min(o, 9)}, redemption -> ${p.hp} HP; restore (${p.restores} left)` });
      }
    }
    if (f.form !== 'melee' && ft === 0) {                     // a ranged / magic form: Heal Others, then who goes under
      const heal = (c, g, why) => {
        const amt = Math.min(Math.floor(c.hp * 0.75), HP_MAX - g.hp); if (amt <= 0) return false;
        c.hp -= amt; g.hp += amt; st.heals++;
        if (T) T.push({ t, i: c.i, supply: `heal other -> ${g.name} +${amt} (${g.name} ${g.hp} HP, ${c.name} ${c.hp})${why ? ` - ${why}` : ''}` });
        if (c.hp <= 9 && c.underForm === f.start) { c.hp += REDEMPTION; st.redemptions++; if (T) T.push({ t, i: c.i, supply: `redemption procs -> ${c.hp} HP; restore - prayers back` }); }
        return true;
      };
      for (const g of alive().filter((q) => q.hp <= PRAYED_MAX)) {   // can't take a prayed hit: the one with the most HP heals them
        const c = alive().filter((q) => q !== g && q.hp > PRAYED_MAX).sort((a, b) => b.hp - a.hp)[0];
        if (c && c.hp - Math.min(Math.floor(c.hp * 0.75), HP_MAX - g.hp) > PRAYED_MAX) heal(c, g, `${g.name} couldn't take a prayed hit`);
      }
      for (const p of solo ? [] : alive()) {
        const free = (f.form === 'ranged' ? (p.next === f.start + 4) : false) || p.next >= f.start + 9 || p.pl.healer;   // their attacks on 5 and 10 anyway (Healer Tech: always)
        const noVeng = !p.veng && p.vengReady > f.start + 2;
        if (p.hp <= PRAYED_MAX || (noVeng && free) || p.pl.healer) {
          p.underForm = f.start; st.under++;
          if (p.next < f.start + 4) p.next = f.start + 4;
          if (T) for (const k of UNDER_TICKS) T.push({ t: f.start + k, i: p.i, under: true });
        }
      }
    }
    if (f.form !== 'melee' && ft === 1) {                     // under: Heal Other a teammate who isn't (on redemption)
      for (const c of alive().filter((q) => q.underForm === f.start && q.healForm !== f.start && q.hp >= 12)) {
        const out = alive().filter((q) => q.underForm !== f.start && q.hp < HP_MAX), give = (g) => Math.min(Math.floor(c.hp * 0.75), HP_MAX - g.hp);
        const g = out.find((q) => q.veng && q.hp <= BOSS_MAX && q.hp + give(q) > BOSS_MAX)
          || out.find((q) => !q.veng && q.vengReady <= f.start + 2 && q.hp <= BOSS_MAX && q.hp + give(q) > BOSS_MAX)
          || out.filter((q) => q.hp <= 30).sort((a, b) => a.hp - b.hp)[0];
        if (!g) continue;
        c.healForm = f.start;
        const amt = give(g); c.hp -= amt; g.hp += amt; st.heals++;
        if (T) T.push({ t, i: c.i, supply: `heal other (under him) -> ${g.name} +${amt} (${g.name} ${g.hp} HP, ${c.name} ${c.hp})` });
        if (c.hp <= 9) { c.hp += REDEMPTION; st.redemptions++; if (T) T.push({ t, i: c.i, supply: `redemption procs -> ${c.hp} HP; restore - prayers back` }); }
      }
    }
    // his attack
    const hits = f.start === spawn ? SPAWN_HITS : solo ? SOLO_HITS : BOSS_HITS;
    if (hits.includes(ft)) {
      const pool = alive().filter((p) => !isUnder(p, f, t));
      if (pool.length) {
        const p = pool[rng.randint(0, pool.length - 1)], off = offPrayVeng && p.veng && p.hp > BOSS_MAX;
        const tk = takeoffs && off && p.next >= t + 2;            // a takeoff: their least defensive set for it
        const mx = off ? BOSS_MAX : f.form === 'melee' ? 0 : PRAYED_MAX, ch = hit_chance(BOSS_ATK[f.form], tk ? p.pdef.off[f.form] : p.pdef[f.form]);
        const d = rng.random() < ch ? rng.randint(0, mx) : 0;
        if (tk) st.takeoffs++;
        const e = T && { t, boss: 'Attack', icon: `Nylo_boss_${f.form}`, ring: { melee: '#d9dde6', ranged: '#3fbf5a', magic: '#4f8dff' }[f.form],
          tip: `${f.form} attack -> ${p.name}${off ? ` (off prayer, veng${tk ? `, takeoff: their ${f.form === 'magic' ? 'melee' : 'mage'} gear` : ''})` : ' (prayed)'} - his accuracy ${(ch * 100).toFixed(1)}%: ${d}${mx === 0 ? ' (blocked)' : ''}` };
        bq.push([t + BOSS_DELAY[f.form], p, d, e]);
        if (T) T.push(e);
      }
    }
    if (kill != null) break;
    for (const p of alive()) {                                 // melee thralls: damage only in his melee form
      if (p.thrallNext !== t) continue;
      p.thrallNext = t + 4;
      if (f.form !== 'melee') continue;
      const d = rng.randint(0, 3), e = T && { t, i: p.i, thrall: true, dmg: 0, icon: 'Greater_zombie' };
      q.push([t + 1, p.i, d, e]); st.thrall += d; if (e) T.push(e);
    }
    for (const p of ps) {                                     // spec regen: 10% every 50 ticks below 100
      if (p.hold) continue;
      if (p.spec < 100) { if (++p.regen >= SPEC_REGEN) { p.regen = 0; p.spec = Math.min(100, p.spec + 10); if (T) T.push({ t, i: p.i, regen: `spec regen -> ${p.spec}%` }); } } else p.regen = 0;
    }
    for (const p of alive()) {
      if (t < f.first || p.next > t) continue;
      if (isUnder(p, f, t)) continue;                          // under him: no attack on 2-4 / 6-8
      if (p.thrallNext == null) p.thrallNext = t + rng.randint(1, 2);
      const under = (solo && f.start !== spawn) || (p.underForm === f.start && f.form !== 'melee');
      const base = { t, i: p.i, target: `Nylocas Vasilias (${f.form}) - Defence ${def}` };
      let e = null;
      const pay = (c) => { const o = p.spec; p.spec -= c; if (p.hold) { p.hold = false; p.regen = SPEC_REGEN - 1; } return [o, p.spec]; };
      const go = (code, what, gear, stats, ch, exp, hits, delays, speed, sp = null) => {
        e = T && { ...base, code, what, gear, stats, acc: ch, exp, rolledAll: hits.reduce((a, b) => a + (b || 0), 0), ...(sp ? { spec: sp[0], specAfter: sp[1] } : {}) };
        hits.forEach((d, k) => q.push([t + delays[k], p.i, d, e, MELEE_CODES.has(code)]));
        p.next = t + speed; p.n++;
        if (e) T.push(e);
      };
      const MEL = 'Attack 118 · Strength 118';
      const pl = p.pl, nextSpec = pl.specs[0];
      const surge = () => { if (pl.surge && !p.surged) { const o = p.spec; p.spec = Math.min(100, p.spec + SURGE); p.surged = true; st.surges = (st.surges || 0) + 1; if (T) T.push({ t, i: p.i, supply: `spec surge (${o}% -> ${p.spec}%)` }); } };
      // tome tick fixing: a tome hit to come and he's not magic -> blowpipes / bows that leave room for it in a magic form next
      let fix = null;
      const tomeDue = (p.buff > 0 && t <= p.buffUntil) || (nextSpec === 'tome' && p.spec >= 50);
      if (tomeTickFix && pl.tomeTickFix !== false && tomeDue && f.form !== 'magic' && !under) {
        if (hp <= dpt * (f.end - t + 1 + FORM_TICKS)) {           // likely to die this form or the next: claw instead
          if (nextSpec === 'tome') { pl.specs[0] = 'claw'; p.clawNow = true; }
          p.buff = 0;
          if (T) T.push({ t, i: p.i, supply: `drops the tome (he's likely to die by the next form: ${hp} HP) - claws instead` });
        } else if (f.form === 'ranged') {
          const [c3, m3] = nyloTbow(p, def), nf = after(f);
          const k = nextSpec === 'tome' && p.spec >= 50 ? 2 : FORM_TICKS - 1 - 2 * (p.buff - 1);   // latest tick into a magic form to start it
          fix = alignAct(t, f, { tb: hitMV(c3, m3)[0], bp: p.fastW ? fastMV(p, def) : null }, nf.start + k);
          if (fix === 'wait') { p.next = t + 1; continue; }
        }
      }
      const fast = (why = '') => { const [hits, ch, mx, gear, proc] = fastHit(p, def, rng); go(FAST_CODE[p.fastW], `${p.fastW}${proc ? ' - Armour Piercing (+15%, can\'t miss)' : ''}${why}`, gear, `Ranged ${RANGED} (Rigour)`, ch, fastMVv(p, def), hits, [BP_DELAY], 2); };
      if (fix === 'bp' || fix === 'tb') {
        if (fix === 'bp') fast(' (tome tick fix)');
        else { const [ch, mx, gear] = nyloTbow(p, def), d = roll(ch, mx); go('TB', 'Twisted bow (tome tick fix)', gear, `Ranged ${RANGED} (Rigour)`, ch, hitMV(ch, mx), [d], [TBOW_DELAY], 5); }
      } else if (f.form === 'melee') {
        const first = p.n === 0;
        let act = 'scythe', why = '';
        const COST = { bgs: 50, claw: 50, halb: 30 };
        if (first && COST[pl.open] && p.spec >= COST[pl.open]) act = pl.open;
        else if (backup && backup.p === p.i && !backup.done && !openBgsLeft() && def >= backup.at && p.spec >= 50 && p.has.has('Bandos godsword')) { act = 'bgs'; backup.done = true; why = ` (backup: his Defence ${def} >= ${backup.at})`; }
        else if (!first && nextSpec === 'halb' && p.spec >= 30) act = 'halb';                 // damage specs: never their first attack
        else if (!first && nextSpec === 'claw' && p.spec >= 50) {
          if (pl.clawMode !== 'gain' || p.clawNow) act = 'claw';
          else {
            const [aC, eC] = ride(t + 4, f), [aS, eS] = ride(t + 5, f);
            // a usable tick (another attack this form, or earlier into the next) - or he's likely to die this cycle or the
            // next and the claw can't be the killing blow (its last two hitsplats land a tick later)
            let c = t; while (inst(c, i1) !== 4) c++;
            const dying = hp <= dpt * (c - t + 1 + CYCLE), clawMax = 2 * melee(p, 'Dragon claws', def)[1];
            if (aC > aS || eC < eS) { act = 'claw'; why = ' (gains a tick)'; }
            else if (dying && hp > clawMax) { act = 'claw'; why = ' (he\'s low - sent before the kill)'; }
          }
        }
        if (act === 'bgs') {
          const sp = pay(50), [ch, mx, gear] = bgsNums(p, def), d = roll(ch, mx);
          go('BGS', `BGS spec${why}`, gear, `${MEL} (2x accuracy)`, ch, hitMV(ch, mx), [d], [SCYTHE_DELAY], 6, sp);
          if (first) p.openDone = true;
          if (d > 0) { const was = def; def = Math.max(0, def - d); if (e) e.what = `BGS spec${why} - his Defence ${was} -> ${def}`; }
          surge();
        } else if (act === 'claw') {
          const sp = pay(50), [hits, ch, mx, gear] = clawSpec(p, def, rng);
          go('C', `Claw spec${why}`, gear, MEL, ch, clawMV(ch, mx), hits, [1, 1, 2, 2], 4, sp);
          if (!first || pl.open !== 'claw') pl.specs.shift(); p.clawNow = false;
          surge();
        } else if (act === 'halb') {
          const sp = pay(30), [hits, ch, mx, gear] = halbSpec(p, def, rng);
          go('Ch', 'Crystal halberd spec', gear, MEL, ch[0], halbMV(ch[0], ch[1], mx), hits, [1, 1], 7, sp);
          if (!first || pl.open !== 'halb') pl.specs.shift();
          surge();
        } else {
          const [ch, mx, gear] = nyloScythe(p, def), hits = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => roll(ch, m));
          go('S', 'Scythe', gear, MEL, ch, scytheMV(ch, mx), hits, [1, 1, 1], 5);
        }
        if (first) p.openDone = true;
      } else if (f.form === 'ranged') {
        if (p.planForm !== f.start) {
          p.planForm = f.start; const k = t - f.start, stop = pl.rangedStop || rangedStop;
          p.plan = under || (stop && stop[k] != null && hp * 100 < stop[k] * NYLO_HP[team]) ? [] : rangedPlan(k, !!p.fastW);
        }
        let w = p.plan.shift() || 'tb';
        if (w === 'tb' && nextSpec === 'zcb' && p.spec >= ZCB_SPEC) { w = 'zcb'; pl.specs.shift(); }
        if (w === 'bp') fast();
        else if (w === 'zcb') {
          const sp = pay(ZCB_SPEC), gear = ranged(p, 'Zaryte crossbow', def)[2], ch = zcbChance(p, def), ok = rng.random() < ch;
          go('ZCB', 'ZCB spec (ruby: 22% of his HP, max 110)', gear, `Ranged ${RANGED} (Rigour, 2x accuracy)`, ch, constMV(ch, Math.min(110, Math.floor(hp * 0.22))), [ok ? null : 0], [ZCB_DELAY], 5, sp);
          surge();
        } else { const [ch, mx, gear] = nyloTbow(p, def), d = roll(ch, mx); go('TB', 'Twisted bow', gear, `Ranged ${RANGED} (Rigour)`, ch, hitMV(ch, mx), [d], [TBOW_DELAY], 5); }
      } else if (f.form === 'magic') {
        const MAG = `Magic ${MAGIC} (Augury)`;
        if (p.buff > 0 && t > p.buffUntil) p.buff = 0;             // the Flow lasts 30s (50 ticks) from their last tome spec
        if (under && p.has.has("Tumeken's shadow")) {             // under him: their strongest - the shadow on 5 and 10
          const [ch, mx, gear] = nyloShadow(p), d = roll(ch, mx);
          go('Sh', "Tumeken's shadow (under him)", gear, MAG, ch, hitMV(ch, mx), [d], [SHADOW_DELAY], 5);
        } else if (under) {                                       // under him: the Ayak on 5 and 10
          const [ch, mx, gear] = nyloAyak(p), d = roll(ch, mx);
          go('E', 'Eye of ayak (under him)', gear, MAG, ch, hitMV(ch, mx), [d], [AYAK_DELAY], 3);
        } else if (p.buff > 0) {                                  // a buffed tome auto (2 ticks) - carried over between his magic forms
          const [ch, mx, gear] = tomeNums(p, 1), d = roll(ch, mx); p.buff--;
          go('Zt', `Tome buffed auto (${p.buff} left)`, gear, MAG, ch, hitMV(ch, mx), [d], [TOME_DELAY], 2); if (e) e.tl = 'A';
        } else if (nextSpec === 'tome' && p.spec >= 50) {
          pl.specs.shift();
          const sp = pay(50), [ch, mx, gear] = tomeNums(p, 1), d = roll(ch, mx); p.buff = d > 0 ? 3 : 0; p.buffUntil = t + 50;
          go('Zt', `Tome spec - ${d > 0 ? 'hit: 3 buffed autos' : 'missed'}`, gear, MAG, ch, hitMV(ch, mx), [d], [TOME_DELAY], 3, sp); if (e) e.tl = d > 0 ? 'S' : 'M';
          surge();
        } else if (ayakSkip && t + 3 > f.end + 2 && ayakSkip(hp * 100 / NYLO_HP[team])) {
          p.next = f.end + 2;                                     // skip the late Ayak: free on the next form's first attack tick
        } else {
          const [ch, mx, gear] = nyloAyak(p), d = roll(ch, mx);
          go('E', 'Eye of ayak', gear, MAG, ch, hitMV(ch, mx), [d], [AYAK_DELAY], 3);
        }
      }
    }
    if (T) T.push({ t, hp, phase: `${f.form} form` });
  }
  if (T) {
    const RING = { melee: '#d9dde6', ranged: '#3fbf5a', magic: '#4f8dff' };
    for (const f of sched) {
      if (f.start > (kill ?? spawn + 600)) break;
      if (f.form !== 'melee') for (let t = f.start; t <= f.end; t++) T.push({ t, shade: f.form === 'ranged' ? 'sg' : 'sb' });
    }
    T.push({ t: i1, mark: 'Spawn (i1)' });
    if (kill != null) {
      const end = roomEnd(kill, overkill, i1), de = kill + (overkill ? DEATH_OVERKILL : DEATH_TICKS);
      T.push({ t: kill, boss: 'Killed', short: '0', tip: `the killing hit lands (i${inst(kill, i1)})${overkill ? ' - overkill' : ''}: his death animation ${overkill ? DEATH_OVERKILL : DEATH_TICKS} ticks` }, { t: kill, mark: 'Dies' });
      for (let t = kill + 1; t < de; t++) T.push({ t, boss: 'Death animation', short: '…', tip: 'his death animation' });
      T.push({ t: end, mark: `Room ends (boss time ${end - i1} ticks)` });
    }
  }
  const end = kill == null ? null : roomEnd(kill, overkill, i1);
  return { spawn, i1, kill, overkill, end, sched, def, st, hp: ps.map((p) => p.hp) };
}
