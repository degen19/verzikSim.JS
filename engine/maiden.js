// The Maiden of Sugadinti (room 1). Stats and the room's timing so far; the players' attacks come next.
//  - HP 3500 (5s), scaled down below 5s like the other rooms: 87.5% in 4s (3062), 75% in 3s / duos / solos (2625).
//  - Defence 200, Magic 350. Every defence bonus 0 (stab / slash / crush / ranged / magic). Magic attack bonus 300
//    (her own attacks - not used yet).
//  - Prefires: a Twisted bow can fire on room tick 5 (its longer range), a ZCB on tick 6.
//  - She attacks every 10 ticks from tick 9 (9, 19, 29, ...). Projectile delay and the blood toss come later.
//  - First section: the prefires to her 70s proc - the tick a hit lands that takes her HP below 70% of her max (on that
//    hit, not on her attack cycle). Damage carries over: that hit's full damage comes off, and the 70s phase starts
//    from what's left.
//  Later (the wishlist): crabs and her ramping when they leak, Dinhs / barrage / chinchompa AoE targeting, freezes
//  (with / without a sceptre), crab spawn distances and clumping, scythe / Soulreaper axe... cleave on crabs, "add
//  attack" per section (start, 70s, 50s, 30s, end), fail conditions, prefire options, stalling her auto, money raid.
export const MAIDEN_HP = { 5: 3500, 4: 3062, 3: 2625, 2: 2625, 1: 2625 };
export const MAIDEN = {
  def: 200, magic: 350, magicAtk: 300,
  dfn: { stab: 0, slash: 0, crush: 0, light: 0, standard: 0, heavy: 0, magic: 0 },
};
/** The first room tick each prefire can go off. */
export const PREFIRE_TICK = { tbow: 5, zcb: 6 };
/** Her attacks: every ATTACK_EVERY ticks from FIRST_ATTACK. */
export const FIRST_ATTACK = 9, ATTACK_EVERY = 10;
export const isAttackTick = (t) => t >= FIRST_ATTACK && (t - FIRST_ATTACK) % ATTACK_EVERY === 0;
/** Her procs: below 70% / 50% / 30% of her max HP (in percent), on the hit that takes her there. */
export const PROCS = [70, 50, 30];
/** Is this HP below the proc? (whole numbers: no rounding at 4s' 2143.4) */
export const belowProc = (team, pct, hp) => hp * 100 < MAIDEN_HP[team] * pct;
/** Has this hit (her HP before -> after) taken her below the proc? */
export const procsOn = (team, pct, before, after) => !belowProc(team, pct, before) && belowProc(team, pct, after);

// ---------------------------------------------------------------- the opening (prefires to the 70s proc)
//  - Each player has a list of attacks for the section (the Start section: the prefires to the 70s proc). The first is
//    their prefire (Twisted bow on tick 5, ZCB on tick 6); then each in turn as soon as their attack timer allows; the
//    last one repeats until the section ends. An attack they can't do (no weapon in the Gear tab, or not enough spec
//    energy) is skipped - the last one, when it's a spec they can't afford, falls back to their scythe (melee) or a
//    rapid Twisted bow (ranged).
//  - Attacks (next attack after / lands after, in ticks):
//     Twisted bow rapid 5 / 4 (from max distance); accurate 6 / 4 (+3 to effective Ranged attack and strength).
//     Blowpipe 2 / 2; Ascension crossbows 2 / 3 (Armour Piercing 5.5%: can't miss, 0-115% of the max).
//     ZCB 5 / 3 (an enchanted ruby proc 6.6%: 22% of her HP when it lands, max 110); ZCB spec (75%) 5 / 3 (2x accuracy;
//     a hit is the ruby: 22% of her HP, max 110).
//     Ralos Spec (50%) 6 / 3: two rolls at 1.5x accuracy, each hit that lands drains her Defence by her Magic / 8 = 43
//     before the next roll.
//     Elder maul spec (50%) 6 / 1: 1.25x accuracy, crush; a hit takes 35% of her Defence. BGS spec (50%) 6 / 1: 2x
//     accuracy, 1.21x max; a hit takes its damage off her Defence. Claw spec (50%) 4 / 1. Scythe 5 / 1 (3 hitsplats -
//     she's large). A Defence spec's drain applies when it's swung (as on Xarpus).
//  - Gear: their ranged gear (elite void) on Rigour at 112 Ranged; melee gear on their prayer (Zeal by default) at 118.
//  - Her attack every 10 ticks from tick 9, on one player (the Maiden targets setting: player 4 in a 4s for now),
//    landing 5 ticks later: her accuracy (Magic 350, +300 magic attack) against their magic defence in what they're
//    wearing, up to MAX_HIT on Protect from Magic (no crabs leaked yet). Everyone starts with Vengeance cast and its
//    cooldown up: a hit of 1+ sends 75% (rounded down) back at her the same tick, and they recast straight away (no
//    tick lost; 50-tick cooldown).
//  - Within a tick: what lands first (in the order sent), then attacks. The 70s proc ends the section on its tick.
//  Later: how a player's list changes with the procs' timing (e.g. barraging the next crabs straight away on a fast
//  proc) is the sim's own behaviour, not more settings.
import { hit_chance } from './sim.js';
import { worn, bonuses } from './loadout.js';
import { tbowMult } from './sote.js';
import { hitMV, scytheMV, constMV, sumMV } from './expdmg.js';

/** Her max hit by crabs leaked: on Protect from Magic / off it. */
export const MAX_HIT = { on: [18, 20, 21, 23, 25, 27, 29, 30, 32, 34, 36, 38, 39, 41, 43], off: [36, 40, 43, 47, 50, 54, 58, 61, 65, 68, 72, 76, 79, 83, 86] };
export const MAX_HIT_30 = { on: 72, off: 144 };   // (30 crabs)
/** The attacks: code -> {label, weapon, style, speed (next attack after), delay (lands after), spec (energy), code (Show raid)}. */
export const ATTACKS = {
  tbr: { label: 'Tbow (rapid)', weapon: 'Twisted bow', style: 'range', speed: 5, delay: 4, code: 'TB' },
  tba: { label: 'Tbow (accurate)', weapon: 'Twisted bow', style: 'range', speed: 6, delay: 4, code: 'TB' },
  bp: { label: 'Blowpipe', weapon: 'Toxic blowpipe', style: 'range', speed: 2, delay: 2, code: 'BP' },
  ax: { label: 'Ascension xbows', weapon: 'Ascension crossbows', style: 'range', speed: 2, delay: 3, code: 'AX' },
  zcb: { label: 'ZCB', weapon: 'Zaryte crossbow', style: 'range', speed: 5, delay: 3, code: 'Z' },
  zcbs: { label: 'ZCB spec', weapon: 'Zaryte crossbow', style: 'range', speed: 5, delay: 3, spec: 75, code: 'ZCB' },
  ralos: { label: 'Ralos spec', weapon: 'Tonalztics of Ralos', style: 'range', speed: 6, delay: 3, spec: 50, code: 'Ra' },
  maul: { label: 'Elder maul spec', weapon: 'Elder maul', style: 'melee', speed: 6, delay: 1, spec: 50, code: 'EM' },
  bgs: { label: 'BGS spec', weapon: 'Bandos godsword', style: 'melee', speed: 6, delay: 1, spec: 50, code: 'BGS' },
  claws: { label: 'Claw spec', weapon: 'Dragon claws', style: 'melee', speed: 4, delay: 1, spec: 50, code: 'C' },
  scythe: { label: 'Scythe', weapon: 'Scythe of vitur', style: 'melee', speed: 5, delay: 1, code: 'S' },
};
/** What can be a prefire, and the first tick it can go. */
export const PREFIRES = ['tbr', 'tba', 'zcb', 'zcbs'];
const prefireTick = (a) => (ATTACKS[a].weapon === 'Twisted bow' ? PREFIRE_TICK.tbow : PREFIRE_TICK.zcb);
export const AUTO_DELAY = 5, VENG_CD = 50, RUBY = 0.066;
const RANGED = 112, MELEE = 118, MAGIC_LVL = 99, DEF_LVL = 118;
const PRAY = { Piety: [1.20, 1.23], Zeal: [1.25, 1.28] };
const RIGOUR = [1.20, 1.23];
const PRAY_DEF = { Piety: 1.25, Zeal: 1, Rigour: 1.25 };      // Zeal: no Defence boost (assumed)
const RANGE_SEQ = ['tbr', 'ax', 'ralos', 'tbr'], MELEE_SEQ = ['tbr', 'maul', 'scythe'];
/** The default plan by scale: half the team ranged (tbow, Ascension hit, Ralos spec, tbows), the rest melee (tbow,
 *  Elder maul spec, scythes); 100% spec; her attacks on the last player. */
export function defaultMaidenPlan(team) {
  const nR = Math.floor(team / 2);
  return { target: team - 1, players: Array.from({ length: team }, (_, k) => ({ seq: (k < nR ? RANGE_SEQ : MELEE_SEQ).slice(), startSpec: 100 })) };
}
/** A player's list from an older saved shape ({role, prefire}) or as saved: the first a prefire, every code known. */
export function seqOf(p, k = 0, team = 4) {
  let s = Array.isArray(p.seq) ? p.seq.filter((a) => ATTACKS[a]) : null;
  if (!s || !s.length) s = (p.role === 'melee' || (p.role == null && k >= Math.floor(team / 2)) ? MELEE_SEQ : RANGE_SEQ).slice();
  if (!Array.isArray(p.seq) && p.prefire === 'accurate') s[0] = 'tba';
  if (!PREFIRES.includes(s[0])) s.unshift('tbr');
  return s;
}
const own = (p, w) => (p.gear.weapons || []).includes(w);
/** Can the player do this attack at all (the weapon's in their Gear)? */
export const canDo = (gear, a) => (gear.weapons || []).includes(ATTACKS[a].weapon);
const dRoll = (d) => (d + 9) * (0 + 64);                      // every defence bonus 0
/** Ranged on Rigour in their ranged gear: [chance, max]. accurate: +3 to both effective levels. */
function ranged(p, weapon, d, { accMult = 1, accurate = false } = {}) {
  const b = bonuses(worn(p.gear, 'range', weapon)), v = b.eliteVoid ? [1.10, 1.125] : [1, 1], st = accurate ? 3 : 0;
  const ea = Math.floor((Math.floor(RANGED * RIGOUR[0]) + st + 8) * v[0]), es = Math.floor((Math.floor(RANGED * RIGOUR[1]) + st + 8) * v[1]);
  let roll = Math.floor(ea * (b.atk[4] + 64) * accMult), mx = Math.floor(0.5 + es * (b.rstr + 64) / 640);
  if (weapon === 'Twisted bow') { const [ma, md] = tbowMult(Math.max(MAIDEN.magic, MAIDEN.magicAtk)); roll = Math.floor(roll * ma); mx = Math.floor(mx * md); }
  return [hit_chance(roll, dRoll(d)), mx];
}
/** Melee in their melee gear (aggressive): [chance, max]. idx 1 slash, 2 crush. */
function melee(p, weapon, idx, d, accMult = 1) {
  const b = bonuses(worn(p.gear, 'melee', weapon)), [pa, ps] = PRAY[p.gear.prayer || 'Zeal'] || PRAY.Zeal;
  const ea = Math.floor(MELEE * pa) + 8, es = Math.floor(MELEE * ps) + 3 + 8;
  return [hit_chance(Math.floor(ea * (b.atk[idx] + 64) * accMult), dRoll(d)), Math.floor((es * (b.str + 64) + 320) / 640)];
}
/** Her attack's chance to hit a player in this style's gear. */
function autoChance(p, style) {
  const b = bonuses(worn(p.gear, style)), pd = style === 'range' ? PRAY_DEF.Rigour : (PRAY_DEF[p.gear.prayer || 'Zeal'] ?? 1);
  const eff = Math.floor(MAGIC_LVL * 0.7 + Math.floor(DEF_LVL * pd) * 0.3) + 8;
  return hit_chance((MAIDEN.magic + 9) * (MAIDEN.magicAtk + 64), eff * (b.dfn[3] + 64));
}
const roll = (rng, ch, mx) => (rng.random() < ch ? Math.max(1, rng.randint(0, mx)) : 0);
/** Dragon claws: the four hits (as on Xarpus). */
function clawRolls(ch, mx, rng) {
  for (let k = 0; k < 4; k++) {
    if (rng.random() >= ch) continue;
    if (k === 0) { const x = rng.randint(Math.floor(mx / 2), mx - 1); return [x, Math.floor(x / 2), Math.floor(x / 4), Math.floor(x / 4) + 1]; }
    if (k === 1) { const x = rng.randint(Math.floor(3 * mx / 8), Math.floor(7 * mx / 8)); return [0, x, Math.floor(x / 2), Math.floor(x / 2) + 1]; }
    if (k === 2) { const x = rng.randint(Math.floor(mx / 4), Math.floor(3 * mx / 4)); return [0, 0, x, x + 1]; }
    return [0, 0, 0, rng.randint(Math.floor(mx / 4), Math.floor(5 * mx / 4))];
  }
  return rng.random() < 2 / 3 ? [1, 1, 0, 0] : [0, 0, 0, 0];
}

/**
 * One raid's opening, to the 70s proc. players: [{name, gear, seq, startSpec}]; opts: {target (player index), trace ([] to
 * fill for Show raid), maxTick}. Returns {proc (tick, null if it never came), hp (after the proc's tick), def, specs
 * ({code: [used, landed]}), maulsLanded, vengs, skipped ([{i, a}] attacks skipped), dmg: {kind: total}}.
 */
export function runMaiden(players, team, rng, log = null, { target = team - 1, trace = null, maxTick = 200, hps = null } = {}) {   // hps: [] for her HP at the end of each tick
  const L = log ? (s) => log.push(s) : () => {}; L.on = !!log;
  const MAX = MAIDEN_HP[team] || 3500;
  let hp = MAX, def = MAIDEN.def, proc = null;
  const st = { specs: {}, maulsLanded: 0, vengs: 0, dmg: {}, skipped: [] };
  const ps = players.map((c, i) => {
    const seq = seqOf(c, i, team);
    return { i, name: c.name || `P${i + 1}`, gear: c.gear, seq, spec: Number(c.startSpec ?? 100), step: 0, next: prefireTick(seq[0]), style: 'range', veng: true, vengReady: 0 };
  });
  const tgt = ps[Math.min(ps.length - 1, Math.max(0, Number(target) || 0))];
  const hits = [];                                     // {t, p, a, amt?, tr?, label, ok?}
  const damage = (t, amt, label, kind) => {
    if (amt <= 0) { L.on && L(`t${t} ${label} 0`); return; }
    const before = hp; hp -= amt; st.dmg[kind] = (st.dmg[kind] || 0) + amt;
    L.on && L(`t${t} ${label} ${amt} -> Maiden ${hp}`);
    if (proc == null && procsOn(team, 70, before, hp)) { proc = t; L.on && L(`t${t} *** 70s proc (below ${(MAX * 0.7).toFixed(1)}) ***`); }
  };
  const lowerDef = (t, what, by) => { if (by <= 0 || def <= 0) return; def = Math.max(0, def - by); L.on && L(`t${t} ${what} lowers her Defence -> ${def}`); };
  const used = (a, ok) => { const x = (st.specs[a] ||= [0, 0]); x[0]++; if (ok) x[1]++; };
  /** The player's next attack: their list in turn (the last repeats), skipping what they can't do. */
  const nextAct = (p) => {
    for (;;) {
      const last = p.step >= p.seq.length - 1, a = p.seq[Math.min(p.step, p.seq.length - 1)], A = ATTACKS[a];
      const ok = own(p, A.weapon) && (!A.spec || p.spec >= A.spec);
      if (ok) { if (!last) p.step++; return a; }
      if (!last) { st.skipped.push({ i: p.i, a }); L.on && L(`${p.name} skips ${A.label} (${own(p, A.weapon) ? 'not enough spec' : 'no weapon'})`); p.step++; continue; }
      return A.style === 'melee' && own(p, 'Scythe of vitur') ? 'scythe' : 'tbr';   // the last one, and they can't: scythe / rapid tbow
    }
  };
  for (let t = 0; t <= maxTick && proc == null; t++) {
    // ---- landing
    for (const h of hits.filter((x) => x.t === t)) {
      hits.splice(hits.indexOf(h), 1);
      if (h.a === 'auto') {
        const p = h.p, ch = autoChance(p, p.style), d = rng.random() < ch ? rng.randint(0, MAX_HIT.on[0]) : 0;
        L.on && L(`t${t} her attack on ${p.name}: ${d}`);
        if (h.tr) h.tr.tip = `Her attack on ${p.name}: ${d} (landed t${t})${d >= 1 && p.veng ? ' - Vengeance' : ''}`;
        if (d >= 1 && p.veng) {
          const v = Math.floor(d * 0.75); p.veng = false; st.vengs++;
          if (trace) trace.push({ t, i: p.i, veng: v });
          damage(t, v, `${p.name} Vengeance`, 'veng');
          if (t >= p.vengReady) { p.veng = true; p.vengReady = t + VENG_CD; L.on && L(`t${t} ${p.name} recasts Vengeance`); }
        }
        continue;
      }
      if (h.tr) h.tr.landed = t;
      if (h.a === 'ralos') {                           // two rolls; a hit (1+) drains before the second
        const parts = [], d0 = def, accs = [], exps = [];
        for (let k = 0; k < 2; k++) {
          const [ch, mx] = ranged(h.p, 'Tonalztics of Ralos', def, { accMult: 1.5 }), m = Math.floor(mx * 0.75), d = roll(rng, ch, m);
          accs.push(ch); exps.push(hitMV(ch, m)); parts.push(d);
          if (d >= 1) lowerDef(t, `${h.p.name} Ralos Spec hit ${k + 1}`, Math.floor(MAIDEN.magic / 8));
        }
        used('ralos', parts.some((x) => x >= 1));
        const total = parts[0] + parts[1];
        if (h.tr) Object.assign(h.tr, { acc: accs, exp: sumMV(...exps), dmg: total, what: `Ralos Spec ${parts.join('/')} - her Defence ${d0} -> ${def}` });
        damage(t, total, `${h.p.name} Ralos Spec ${parts.join('/')}`, 'ralos');
        continue;
      }
      if (h.ruby) {                                    // a ZCB's ruby: 22% of her HP as it lands, max 110
        const d = Math.min(110, Math.floor(Math.max(0, hp) * 22 / 100));
        if (h.tr) Object.assign(h.tr, { dmg: d, exp: constMV(h.acc ?? 1, d), what: `${h.label}: ruby ${d}` });
        damage(t, d, `${h.p.name} ${h.label} ruby`, h.a);
        continue;
      }
      damage(t, h.amt, `${h.p.name} ${h.label}`, h.a);
    }
    if (proc != null) { if (hps) hps.push(hp); break; }
    // ---- her attack
    if (isAttackTick(t)) {
      const tr = trace ? { t, boss: 'Attack', kind: 'attack', tip: `Her attack on ${tgt.name} (lands t${t + AUTO_DELAY})`, short: '' } : null;
      hits.push({ t: t + AUTO_DELAY, p: tgt, a: 'auto', tr }); if (tr) trace.push(tr);
    }
    // ---- attacks
    for (const p of ps) {
      if (t < p.next) continue;
      const first = p.step === 0, a = nextAct(p), A = ATTACKS[a], tr = trace ? { t, i: p.i, code: A.code } : null;
      const go = (h) => { hits.push({ t: t + A.delay, p, a, tr, label: A.label, ...h }); if (tr) trace.push(tr); };
      const tag = first ? ' (prefire)' : '';
      if (A.spec) { p.spec -= A.spec; L.on && L(`t${t} ${p.name} ${A.label} (${p.spec}% left)`); }
      if (a === 'tbr' || a === 'tba' || a === 'bp') {
        const [ch, mx] = ranged(p, A.weapon, def, { accurate: a === 'tba' }), d = roll(rng, ch, mx);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `${A.label}${tag} ${d}` });
        go({ amt: d });
      } else if (a === 'ax') {
        const [ch, mx] = ranged(p, A.weapon, def), ap = rng.random() < 0.055, d = ap ? Math.max(1, rng.randint(0, Math.floor(mx * 1.15))) : roll(rng, ch, mx);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `Ascension crossbows ${d}${ap ? ' (Armour Piercing)' : ''}` });
        go({ amt: d });
      } else if (a === 'zcb') {
        const [ch, mx] = ranged(p, A.weapon, def);
        if (rng.random() < RUBY) { if (tr) tr.acc = 1; go({ ruby: true, acc: 1, label: `ZCB${tag}` }); }
        else { const d = roll(rng, ch, mx); if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `ZCB${tag} ${d}` }); go({ amt: d, label: `ZCB${tag}` }); }
      } else if (a === 'zcbs') {
        const [ch] = ranged(p, A.weapon, def, { accMult: 2 }), ok = rng.random() < ch; used(a, ok);
        if (tr) tr.acc = ch;
        if (ok) go({ ruby: true, acc: ch, label: `ZCB spec${tag}` });
        else { if (tr) Object.assign(tr, { dmg: 0, exp: [0, 0], what: `ZCB spec${tag} misses` }); go({ amt: 0, label: 'ZCB spec misses' }); }
      } else if (a === 'ralos') {
        go({});
      } else if (a === 'maul' || a === 'bgs') {
        const [ch, mx0] = a === 'maul' ? melee(p, A.weapon, 2, def, 1.25) : melee(p, A.weapon, 1, def, 2), mx = a === 'maul' ? mx0 : Math.floor(Math.floor(mx0 * 1.1) * 1.1);
        const ok = rng.random() < ch, d = ok ? Math.max(1, rng.randint(0, mx)) : 0, d0 = def; used(a, ok);
        if (ok) { lowerDef(t, `${p.name} ${A.label}`, a === 'maul' ? Math.floor(def * 0.35) : d); if (a === 'maul') st.maulsLanded++; }
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: hitMV(ch, mx), what: `${A.label} ${ok ? d : 'misses'} - her Defence ${d0} -> ${def}` });
        go({ amt: d, label: `${A.label}${ok ? '' : ' misses'}` });
      } else if (a === 'claws') {
        const [ch, mx] = melee(p, A.weapon, 1, def), parts = clawRolls(ch, mx, rng), d = parts.reduce((x, y) => x + y, 0); used(a, d > 0);
        if (tr) Object.assign(tr, { dmg: d, acc: ch, what: `Claw spec ${parts.join('/')}` });
        go({ amt: d, label: `Claw spec ${parts.join('/')}` });
      } else {
        const [ch, mx] = melee(p, A.weapon, 1, def), parts = [mx, Math.floor(mx / 2), Math.floor(mx / 4)].map((m) => roll(rng, ch, m)), d = parts[0] + parts[1] + parts[2];
        if (tr) Object.assign(tr, { dmg: d, acc: ch, exp: scytheMV(ch, mx), what: `scythe ${parts.join('/')}` });
        go({ amt: d, label: `scythe ${parts.join('/')}` });
      }
      p.style = A.style; p.next = t + A.speed;
    }
    if (trace) trace.push({ t, hp: Math.max(0, hp), phase: 'to 70s' });
    if (hps) hps.push(hp);
  }
  if (trace && proc != null) { trace.push({ t: proc, hp: Math.max(0, hp), phase: '70s' }); trace.push({ t: proc, mark: '70s' }); }
  return { proc, hp, def, ...st, inFlight: hits.filter((h) => h.a !== 'auto').length };
}
