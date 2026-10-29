// Solo Verzik. No P1 chart: the player opens P1 with a Dawnbringer spec, specs whenever it's off cooldown (35%), Dawn
// autos otherwise, in their mage gear on Lightbearer, with a melee thrall; scythes once she's within 1%. P2: lightning on
// the player (11-14; under 15 HP a locator orb + Redemption tick-eat), purple crabs blowpiped from 9 ticks after the
// spawn, Eye of ayak magic defence drain (Ayak P2), the shadow options, then red crab sets back to back (one crab a set)
// until P2 dies - committing to the kill from a set start once she's low enough for their spec (Commit %). P3: p3.js.
//
// Deaths aren't tracked yet: HP never drops below 1 (supplies.FLAGS.DEATHS), and supplies are plentiful.
import * as supplies from './supplies.js';
import { Player, roll_attack, hit_chance, auto_surge, P1_HP, AUTO_QUEUE_FIRST, AUTO_EVERY, AUTO_DELAY, SHADOW_MAGIC } from './sim.js';
import { P2_HP, P2_REDS, P2_DEF, scythe_roll, blowpipe_chance, BP_DELAY, PURPLE_CD_ATTACKS, PURPLE_FIRST_HEAL, SHADOW_DELAY_NEAR, SHADOW_DELAY_DEEP } from './p2.js';
import { CRAB_BASE_HP, CRAB_DEF_ROLL, CLAW, SHIELD, VERZ_ATTACKS, CRAB_HEAL_R, melee_max_acc, claw_spec } from './reds.js';
import { crab_scythe_exp, verzik_scythe_exp, collisions_ahead, _exp_capped } from './duo_reds.js';
import { ITEMS, totals, shadow_attack } from './gear.js';
import * as p3 from './p3.js';
import { floordiv, pymod, pyround, rjust, fx } from './util.js';

export const SOLO_FIRST = 1;              // P1: the opening Dawn spec
export const SCYTHE_AT = 0.01;            // P1: scythe once she's at or below 1%
export const LTG_MIN = 11, LTG_MAX = 14;  // P2 lightning on the player
export const REDEEM_BELOW = 15;           // under this when the lightning lands: locator orb + Redemption tick-eat
export const BP_FROM = 9;                 // purple: first blowpipe this many ticks after her spawning attack
export const MDEF = 70;                   // Verzik P2 magic defence bonus (her magic def roll: (200 + 9) x (bonus + 64))
export const MAG_DEF_LVL = 200;
export const SET_LEN = 44;                // reds sets back to back: the next shield 44 ticks after the last
export const LAST_HIT_THR = 2.0;          // commit set r40: under 2% scythe, not halberd
export const COMMIT_KEYS = [['c100', 100], ['c80', 80], ['c50', 50], ['c30', 30], ['c0', 0]];   // Commit % by spec at the shield
export const COMMIT_DEFAULT = { c100: 12, c80: 9, c50: 7, c30: 5, c0: 5 };
export const DEEP_THR = 37;                // solo deep proc: below this % of P2 HP

const magicDef = (mdef) => (MAG_DEF_LVL + 9) * (Math.max(0, mdef) + 64);
const roll = (rng, ch, m) => (rng.random() < ch ? Math.max(1, rng.randint(0, m)) : 0);

/** Eye of ayak in their mage gear (on Augury): [attack roll, max]. Soul Rend: 2x accuracy, +30% max. */
export function ayakMage(p, spec = false) {
  const ring = p.ring === 'Lightbearer' ? 'Lightbearer' : 'Ultor ring';
  const tt = totals([...p.mage_gear.filter((n) => ITEMS[n]), ring, 'Eye of ayak']);
  const a = (Math.floor(p.mag * 1.25) + 9) * (tt.atk[3] + 64);
  const mx = floordiv((floordiv(p.mag, 3) - 6) * (100 + tt.mdmg + 4), 100);
  return spec ? [a * 2, Math.floor(mx * 1.3)] : [a, mx];
}
/** Tumeken's shadow against her current magic defence: [chance, max]. */
function shadowVs(p, mdef) {
  const ring = p.ring === 'Lightbearer' ? 'Lightbearer' : 'Ultor ring';
  const [, mx, ch] = shadow_attack([...p.mage_gear.filter((n) => ITEMS[n]), ring], p.mag, { def_roll: magicDef(mdef) });
  return [ch, mx];
}

/** The solo player's config: {name, startSpec, godbook, ringSwitch, shadow, shadowLB, shadowCamp, shadow31, deepProc,
 *  deepThr, ayakP2, ayakAmount, commit: {c100, c80, c50, c30, c0}, + gear (applyToCfg)}. */
export function run_solo(cfg, rng, log = null, scope = 'full') {
  const L = log != null ? ((s) => log.push(s)) : (() => {}); L.on = log != null;
  const pool = new supplies.Pool([{ ...cfg, brewSips: 999, scbSips: 999, restoreSips: 999, sharks: 999 }], 1);
  const p = new Player(1, { ...cfg, lightbearerOn: true, startSpec: cfg.godbook ? 95 : 100 });
  supplies.init_player(p, cfg, pool);
  p.ring = 'Lightbearer';
  p.mag = SHADOW_MAGIC; p.heart = SHADOW_MAGIC;                  // heart boost (112 Magic) the whole room
  p.auto_surge_on = true;
  p.auto_r = cfg.godbook ? 'pending' : null;                    // godbook: 95%, no regen before the first spec, then one
  p.has3 = cfg.has3Tick || 'Ayak';
  const st = { purples: 0, purple_pops: 0, redemptions: 0, drained: 0, rends: 0, ayak: 0, sets: 0, commit_set: null, dc: 0, crab_kills: 0, claws: 0, halb: 0, shadows: 0, ayak_fix: 0 };
  const out = { st, players: [p], pid: [p] };
  const regen = (t, tag = '') => {
    if (p.auto_r === t) { const o = p.spec; p.spec = Math.min(100, p.spec + 10); p.regen_timer = 0; p.auto_r = null; L.on && L(`t${rjust(t, 4)} ${tag}regen the tick after the first spec (godbook) ${fx(o)}% -> ${fx(p.spec)}%`); return; }
    if (p.auto_r === 'pending') return;
    if (p.spec < 100) {
      p.regen_timer += 1;
      if (p.regen_timer >= p.regen_period()) { p.regen_timer = 0; const o = p.spec; p.spec = Math.min(100, p.spec + 10); L.on && L(`t${rjust(t, 4)} ${tag}regen ${fx(o)}% -> ${fx(p.spec)}%`); }
    } else p.regen_timer = 0;
  };
  const surge = (t, tag = '') => {
    if (p.surge_due && t >= p.sip_ready && t >= p.surge_ready) {
      const o = p.spec; p.spec = Math.min(100, p.spec + 25); p.surge_ready = t + 500; p.sip_ready = t + 3; p.surge_due = false;
      L.on && L(`t${rjust(t, 4)} ${tag}surge after the first spec ${fx(o)}% -> ${fx(p.spec)}%`);
    } else if (!p.surge_due) auto_surge(p, t, L, tag);
  };
  const dc = (t, why, tag = '') => { const o = p.spec; p.spec = Math.min(100, p.spec + 15); st.dc += 1; L.on && L(`t${rjust(t, 4)} ${tag}${why} -> Death Charge ${fx(o)}% -> ${fx(p.spec)}%`); };
  const floor1 = (why, t) => { if (p.hp < 1) { L.on && L(`t${rjust(t, 4)} would be at ${p.hp} HP (${why}) - kept at 1 HP`); p.hp = 1; } };

  // ================================================================ P1
  let hp = P1_HP[1], vq = [], pq = [], kill = null, anim = 5;
  const thr = Math.floor(P1_HP[1] * SCYTHE_AT);
  const dmax = (() => { const md = p.mage_gear.reduce((s, n) => s + (ITEMS[n] ? ITEMS[n].mdmg : 0), 0) + 4; return floordiv(floordiv(p.mag, 6) * (100 + md), 100); })();
  p.next_attack = SOLO_FIRST;
  L.on && L(`=== SOLO P1 === Verzik ${hp}. ${cfg.godbook ? 'Godbook (95% start)' : '100% start'}, Lightbearer, Dawn autos max ${dmax}`);
  let t = 0;
  for (; t < 600; t++) {
    const land = vq.filter((h) => h[0] === t).sort((a, b) => a[1] - b[1]);
    vq = vq.filter((h) => h[0] !== t);
    for (const [, , d, cap, label] of land) {
      if (kill != null) { anim = 4; L.on && L(`t${rjust(t, 4)} ${label} lands after the kill (overkill)`); break; }
      const f = cap != null ? Math.min(d, rng.randint(0, cap)) : d;
      hp -= f;
      L.on && L(`t${rjust(t, 4)} ${label} ${f} -> Verzik ${Math.max(0, hp)}`);
      if (hp <= 0) kill = t;
    }
    if (kill != null) break;
    if (t >= AUTO_QUEUE_FIRST && (t - AUTO_QUEUE_FIRST) % AUTO_EVERY === 0) { const d = rng.randint(0, 69); pq.push([t + AUTO_DELAY, d]); }
    for (const [, d] of pq.filter((h) => h[0] === t)) { p.hp -= d; floor1('P1 auto', t); L.on && L(`t${rjust(t, 4)} takes ${d} from her auto -> ${p.hp} HP`); }
    pq = pq.filter((h) => h[0] !== t);
    regen(t); surge(t);
    if (p.thrall_next != null && t === p.thrall_next) { vq.push([t + 1, 9, rng.randint(0, 3), 10, 'Thrall']); p.thrall_next = t + 4; }
    if (t < p.next_attack) continue;
    if (hp <= thr) {
      const [sp] = roll_attack(p, 'S', rng);
      sp.forEach(([d, cap], k) => vq.push([t + 1, k, d, cap, `Scythe hit ${k + 1}`]));
      p.next_attack = t + 5;
      L.on && L(`t${rjust(t, 4)} Verzik at ${hp} (<= 1%) - scythe`);
    } else if (p.spec >= 35) {
      const o = p.spec; p.spec -= 35;
      if (p.auto_r === 'pending') p.auto_r = t + 1;
      if (!p.specced) { p.specced = true; p.surge_due = true; }
      vq.push([t + 2, 0, rng.randint(75, 150), null, 'Dawn spec']);
      p.next_attack = t + 4;
      L.on && L(`t${rjust(t, 4)} Dawn spec (${fx(o)}% -> ${fx(p.spec)}%)`);
    } else {
      vq.push([t + 2, 0, rng.randint(0, dmax), null, 'Dawn auto']);
      p.next_attack = t + 4;
    }
    if (p.thrall_next == null) p.thrall_next = t + rng.randint(1, 2);
  }
  if (kill == null) return { ...out, end: null };
  const p1end = kill + anim;
  out.p1 = p1end;
  L.on && L(`t${rjust(kill, 4)} P1 HP 0, death animation ${anim} -> ends t${p1end}; P2 from t${p1end + 14}`);
  if (scope === 'p1') return { ...out, end: p1end };
  const K = p1end + 14;
  for (t = kill + 1; t < K; t++) { regen(t); surge(t); }
  p.hp = Math.max(p.hp, 99); p.atk = p.str = p.dfn = 118; p.next_attack = K;   // the heal-up window
  if (p.thrall_next != null) while (p.thrall_next < K + 1) p.thrall_next += 4;   // the thrall stays up: its next hit on her once she's attackable

  // ================================================================ P2 (to the reds shield)
  const MX = P2_HP[1], REDS = P2_REDS[1];
  hp = MX; vq = [];
  let mdef = MDEF;
  const rs = cfg.ringSwitch === '' || cfg.ringSwitch == null ? null : Number(cfg.ringSwitch);
  const ayakOn = !!cfg.ayakP2 && (cfg.ayakAmount ?? 0) > 0, ayakGoal = Math.min(MDEF, Number(cfg.ayakAmount) || 0);
  const draining = () => ayakOn && MDEF - mdef < ayakGoal;
  let lastMiss = false;                                         // confliction gauntlets: a missed magic hit -> next magic rolls twice
  const ringCheck = (t, tag = '') => {
    if (p.ring !== 'Lightbearer') return;
    if (rs == null ? true : p.spec >= rs) { p.ring = 'Ultor'; p.regen_timer = 0; L.on && L(`t${rjust(t, 4)} ${tag}swaps to Ultor (spec ${fx(p.spec)}%)`); }
  };
  const magicHit = (t, a, mx, delay, label, target, tag = '') => {   // ayak / Soul Rend: accuracy vs her magic defence now
    const ch = hit_chance(a, magicDef(mdef));
    const ok = rng.random() < ch || (lastMiss && rng.random() < ch);
    const d = ok ? Math.max(1, rng.randint(0, mx)) : 0;
    lastMiss = !ok;
    vq.push([t + delay, 0, label, d, target]);
    L.on && L(`t${rjust(t, 4)} ${tag}${label} (acc ${fx(ch * 100, 1)}%${lastMiss ? '' : ''}, max ${mx}, magic def ${mdef}) -> ${d}`);
    return d;
  };
  const rend = (t, tag = '') => {
    const o = p.spec; p.spec -= 50; st.rends += 1;
    const [a, mx] = ayakMage(p, true);
    const d = magicHit(t, a, mx, 2, 'Soul Rend', 'v', tag);
    if (d > 0) { const o2 = mdef; mdef = Math.max(0, mdef - d); st.drained += o2 - mdef; L.on && L(`t${rjust(t, 4)} ${tag}Soul Rend drains her magic defence ${o2} -> ${mdef} (spec ${fx(o)}% -> ${fx(p.spec)}%)`); }
    p.next_attack = t + 5; p.in_mage = true;
  };
  const ayakAuto = (t, target = 'v', tag = '') => {
    const [a, mx] = ayakMage(p);
    const ch = target === 'crab' ? hit_chance(a, CRAB_DEF_ROLL) : null;
    if (target === 'crab') { const d = roll(rng, ch, mx); vq.push([t + 2, 0, 'Eye of ayak', d, 'crab']); L.on && L(`t${rjust(t, 4)} ${tag}Eye of ayak on the crab -> ${d}`); }
    else magicHit(t, a, mx, 2, 'Eye of ayak', 'v', tag);
    st.ayak += 1; p.next_attack = t + 3; p.in_mage = true;
  };
  const shadow = (t, why, tag = '', delay = SHADOW_DELAY_NEAR) => {
    const [ch, mx] = shadowVs(p, mdef);
    const ok = rng.random() < ch || (lastMiss && rng.random() < ch);
    const d = ok ? Math.max(1, rng.randint(0, mx)) : 0; lastMiss = !ok;
    vq.push([t + delay, 0, `Shadow (${why})`, d, 'v']); st.shadows += 1;
    p.next_attack = t + 5; p.in_mage = true;
    L.on && L(`t${rjust(t, 4)} ${tag}SHADOW [${why}] (acc ${fx(ch * 100, 1)}%, max ${mx}) -> ${d}`);
  };
  const scythe = (t, tag = '') => {
    const [ch, mx] = scythe_roll(p), sp = [];
    [mx, floordiv(mx, 2), floordiv(mx, 4)].forEach((m, k) => { const d = roll(rng, ch, m); sp.push(d); vq.push([t + 1, k, `Scythe hit ${k + 1}`, d, 'v']); });
    p.next_attack = t + 5; p.in_mage = false;
    L.on && L(`t${rjust(t, 4)} ${tag}Scythe -> [${sp.join(', ')}]`);
  };
  const claw = (t, tag = '') => {
    const o = p.spec; p.spec -= 50; st.claws += 1;
    const [hits] = claw_spec(p, rng);
    hits.forEach((d, k) => vq.push([t + 1, k, `Claw spec hit ${k + 1}`, d, 'v']));
    p.next_attack = t + 4; p.in_mage = false;
    L.on && L(`t${rjust(t, 4)} ${tag}CLAW SPEC (${fx(o)}% -> ${fx(p.spec)}%) -> [${hits.join(', ')}]`);
  };
  /** Spec about to go over 100 (at 100, or a regen due before their next attack would cap it). */
  const overflow = () => p.spec >= 100 || (p.spec > 90 && p.auto_r == null && p.regen_period() - p.regen_timer <= 5);
  /** The guard: Soul Rend while she's above the Ayak Amount, else a claw spec (melee: not on her attack tick). */
  const specGuard = (t, verz, tag = '') => {
    if (!overflow() || p.spec < 50) return false;
    if (draining() || (ayakOn && mdef > MDEF - ayakGoal)) { rend(t, tag); return true; }
    if (!verz) { claw(t, tag); return true; }
    return false;
  };
  const lightning = (t, d, tag = '') => {
    if (p.hp < REDEEM_BELOW) { const o = p.hp; p.hp = Math.max(1, supplies.REDEMPTION_HEAL + 1 - d); st.redemptions += 1; L.on && L(`t${rjust(t, 4)} ${tag}${o} HP: locator orb + Redemption tick-eat the lightning (${d}) -> ${p.hp} HP, restore after`); }
    else { p.hp -= d; floor1('lightning', t); L.on && L(`t${rjust(t, 4)} ${tag}lightning hits ${d} -> ${p.hp} HP`); }
  };
  const shadowMode = () => {
    if (!cfg.shadow) return null;
    if (cfg.deepProc && hp <= MX * (cfg.deepThr ?? DEEP_THR) / 100) return 'deep proc';
    if (cfg.shadowCamp) return 'camp';
    if (cfg.shadowLB && p.ring === 'Lightbearer') return 'while LB';
    return null;
  };
  let regular = 0, since = PURPLE_CD_ATTACKS, crab = null, proc = null, shield = null, ltgs = 0;
  const pend = [];                                              // [tick, damage] lightning on the player
  const vatk = (x) => x >= K + 1 && pymod(x - (K + 1), 4) === 0;
  L.on && L(`\n=== SOLO P2 === K = t${K}. Verzik ${hp}, reds at ${REDS}${ayakOn ? `; Ayak P2 until her magic defence is down ${ayakGoal}` : ''}`);
  for (t = K; t < K + 1500; t++) {
    const verz = vatk(t);
    if (verz && crab) {
      if (crab.alive && t >= crab.first_heal) { const h = rng.randint(9, 11), o = hp; hp = Math.min(MX, hp + h); L.on && L(`t${rjust(t, 4)} purple heals ${hp - o} -> ${hp}`); }
      if (crab.expl === t) { vq.push([t, -1, 'Purple crab explosion', rng.randint(65, 75), 'v']); crab.expl = null; }
    }
    if (shield === t) break;
    const land = vq.filter((h) => h[0] === t).sort((a, b) => a[1] - b[1]);
    vq = vq.filter((h) => h[0] !== t);
    for (const h of land) {
      if (h[4] === 'purple') { dc(t, 'purple crab pops'); st.purple_pops += 1; continue; }
      hp -= h[3];
      L.on && L(`t${rjust(t, 4)} ${h[2]} ${h[3]} -> Verzik ${hp}`);
      if (hp <= REDS && proc == null) { proc = t; shield = t + pymod(-(t - (K + 1)), 4); L.on && L(`t${rjust(t, 4)} at/below 35% - shield t${shield}`); }
    }
    if (shield === t) break;
    if (verz) {
      if ((regular + 1) % 5 === 0) {
        regular += 1; since += 1; ltgs += 1;
        pend.push([t + 2, rng.randint(LTG_MIN, LTG_MAX)]);
        vq.push([t + 8, -1, 'Lightning rebound', rng.randint(20, 25), 'v']);
        L.on && L(`t${rjust(t, 4)} VERZIK: LIGHTNING`);
      } else if ((crab == null || (!crab.alive && crab.expl == null)) && since >= PURPLE_CD_ATTACKS && rng.random() < 1 / 3) {
        since = 0; st.purples += 1;
        crab = { spawn: t, alive: true, first_heal: t + PURPLE_FIRST_HEAL, bp_from: t + BP_FROM, expl: null };
        L.on && L(`t${rjust(t, 4)} VERZIK: PURPLE CRAB #${st.purples} (blowpipe from t${t + BP_FROM})`);
      } else { regular += 1; since += 1; }
    }
    for (const [, d] of pend.filter((x) => x[0] === t)) lightning(t, d);
    for (let i = pend.length - 1; i >= 0; i--) if (pend[i][0] === t) pend.splice(i, 1);
    regen(t); surge(t); ringCheck(t);
    if (p.thrall_next != null && t === p.thrall_next) { vq.push([t + 1, 9, 'Thrall', rng.randint(0, 3), 'v']); p.thrall_next = t + 4; }
    if (t < p.next_attack) continue;
    if (crab && crab.alive && t >= crab.bp_from && p.has_bp) {
      const [ch] = blowpipe_chance(p), ok = rng.random() < ch;
      p.next_attack = t + 2; p.in_mage = false;
      L.on && L(`t${rjust(t, 4)} blowpipe at the purple -> ${ok ? 'PASSES' : 'miss'}`);
      if (ok) {
        crab.alive = false; vq.push([t + BP_DELAY, 0, 'pop', 0, 'purple']);
        let nx = t + 1; while (!vatk(nx)) nx += 1; crab.expl = nx;
      }
      continue;
    }
    if (draining() && p.spec >= 50 && lastMiss) { rend(t); continue; }
    if (draining() && p.spec >= 50) { ayakAuto(t); continue; }
    if (specGuard(t, verz)) continue;
    const sm = shadowMode();
    if (sm) { shadow(t, sm, '', sm === 'deep proc' ? SHADOW_DELAY_DEEP : SHADOW_DELAY_NEAR); }
    else if (verz && cfg.shadow && cfg.shadow31) shadow(t, '3:1');
    else if (verz) { p.next_attack = t + 1; L.on && L(`t${rjust(t, 4)} lines up with her attack -> +1t`); continue; }
    else scythe(t);
    if (p.thrall_next == null) p.thrall_next = t + rng.randint(1, 2);
  }
  if (shield == null) return { ...out, end: null };
  // the last swing on the shield tick still goes in; everything queued lands
  if (t >= p.next_attack) { const sm = shadowMode() || (cfg.shadow && cfg.shadow31 ? '3:1' : null); if (sm) shadow(t, sm); else scythe(t); }
  for (const h of vq.sort((a, b) => a[0] - b[0])) { if (h[4] === 'purple') { dc(h[0], 'purple crab pops'); st.purple_pops += 1; continue; } hp -= h[3]; }
  vq = [];
  out.proc = proc; out.depth = hp / MX * 100; st.purples_before_reds = st.purples;

  // ================================================================ reds sets
  const crab0 = floordiv(CRAB_BASE_HP * P2_HP[1], 3500);
  const pc = crab && (crab.alive || crab.expl != null) ? { alive: crab.alive, expl: crab.expl != null } : null;
  let P = shield, kill2 = null, since_ltg = regular % 5;
  const redsMode = cfg.shadow ? (cfg.redsMode || 'scythe') : 'scythe';   // reds: scythe | shadow (crab and Verzik) | shadowCrab
  const crabShadow = (r) => redsMode !== 'scythe' && r + SHADOW_DELAY_NEAR <= CRAB_HEAL_R;
  const shadowCrabNums = () => { const ring = p.ring === 'Lightbearer' ? 'Lightbearer' : 'Ultor ring'; const [, mx, c] = shadow_attack([...p.mage_gear.filter((n) => ITEMS[n]), ring], p.mag, { def_roll: CRAB_DEF_ROLL }); return [c, mx]; };
  const crabExp = (r, cap) => { if (crabShadow(r)) { const [c, mx] = shadowCrabNums(); return _exp_capped(pyround(c, 3), [mx], cap); } const [c, mx] = melee_max_acc(p, 125, 75, CRAB_DEF_ROLL); return _exp_capped(pyround(c, 3), [mx, floordiv(mx, 2)], cap); };
  const verzExp = () => { if (redsMode === 'shadow') { const [c, mx] = shadowVs(p, mdef); return c * (mx + 1) / 2; } return verzik_scythe_exp(p); };
  for (let s = 1; s <= 60 && kill2 == null; s++, P += SET_LEN) {
    st.sets = s;
    let ch = crab0, crabDone = false;
    if (p.next_attack < P) p.next_attack = P;
    // commit: at the shield, Verzik at or below the Commit % for the spec they have
    const cp = COMMIT_KEYS.find(([, at]) => p.spec >= at), cpct = cp && cfg.commit ? Number(cfg.commit[cp[0]]) : NaN;
    const commit = Number.isFinite(cpct) && cpct > 0 && hp <= MX * cpct / 100;
    if (commit && st.commit_set == null) st.commit_set = s;
    let plan = null, claws = 0, scratched = false, firstCol = false, dcSwing = false;
    L.on && L(`\n=== REDS SET ${s} === r0 = t${P}. Verzik ${hp} (${fx(hp / MX * 100, 1)}%), spec ${fx(p.spec)}%${commit ? ` - COMMIT (<= ${cpct}% at ${cp && cp[1]}%+ spec)` : ''}`);
    for (let r = 0; r < SET_LEN; r++) {
      t = P + r;
      const tag = `s${s} r${r} `;
      const land = vq.filter((h) => h[0] === t).sort((a, b) => a[1] - b[1]);
      vq = vq.filter((h) => h[0] !== t);
      for (const h of land) {
        if (h[4] === 'purple') { dc(t, 'purple crab pops', tag); st.purple_pops += 1; continue; }
        if (h[4] === 'crab') {
          if (ch <= 0) continue;
          ch = Math.max(0, ch - h[3]);
          L.on && L(`t${rjust(t, 4)} ${tag}${h[2]} on the crab ${h[3]} -> crab ${ch}`);
          if (ch === 0 && !crabDone) { crabDone = true; st.crab_kills += 1; dc(t, 'red crab dies', tag); }
          continue;
        }
        hp -= h[3];
        L.on && L(`t${rjust(t, 4)} ${tag}${h[2]} ${h[3]} -> Verzik ${hp}`);
        if (hp <= 0 && kill2 == null) kill2 = t;
      }
      if (pc && r >= 12 && (r - 12) % 4 === 0 && kill2 == null) {
        if (pc.expl) { const d = rng.randint(65, 75); hp -= d; pc.expl = false; L.on && L(`t${rjust(t, 4)} ${tag}purple explosion ${d} -> ${hp}`); if (hp <= 0) kill2 = t; }
        else if (pc.alive) { const o = hp; hp = Math.min(MX, hp + rng.randint(9, 11)); L.on && L(`t${rjust(t, 4)} ${tag}purple heals ${hp - o}`); }
      }
      if (r === CRAB_HEAL_R && kill2 == null && !crabDone) {
        crabDone = true; const o = hp; hp = Math.min(MX, hp + ch);
        L.on && L(`t${rjust(t, 4)} ${tag}red crab heals Verzik +${hp - o} -> ${hp}`); dc(t, 'red crab dies (heals her)', tag);
      }
      if (kill2 != null) { st.kill_set = s; st.kill_r = kill2 - P; break; }
      const verz = VERZ_ATTACKS.includes(r);
      if (verz) {
        if (rng.random() < 0.75) { const o = hp; hp = Math.min(MX, hp + floordiv(floordiv(rng.randint(0, 47), 2), 2)); L.on && L(`t${rjust(t, 4)} ${tag}blood heal +${hp - o}`); }
        else if (since_ltg < 4) since_ltg += 1;
        else { since_ltg = 0; pend.push([t + 2, rng.randint(LTG_MIN, LTG_MAX)]); vq.push([t + (rng.random() >= 0.5 ? 5 : 8), -1, 'Lightning rebound', rng.randint(20, 25), 'v']); L.on && L(`t${rjust(t, 4)} ${tag}LIGHTNING`); }
      }
      for (const [, d] of pend.filter((x) => x[0] === t)) lightning(t, d, tag);
      for (let i = pend.length - 1; i >= 0; i--) if (pend[i][0] === t) pend.splice(i, 1);
      regen(t, tag); surge(t, tag); ringCheck(t, tag);
      if (p.thrall_next != null && t === p.thrall_next) {                 // the thrall stays up: the crab during the shield, then Verzik
        if (r >= SHIELD) vq.push([t + 1, 9, 'Thrall', rng.randint(0, 3), 'v']);
        else if (r >= 2 && ch > 0 && !crabDone) vq.push([t + 1, 9, 'Thrall', rng.randint(0, 3), 'crab']);
        p.thrall_next = t + 4;
      }
      if (t < p.next_attack) continue;
      const before = vq.length;
      act(t, r, verz, tag);
      if (p.thrall_next == null && vq.slice(before).length > 0) p.thrall_next = t + rng.randint(1, 2);
    }
    if (kill2 != null) break;

    function crabHit(t, why, tag) {
      const r = t - P;
      if (crabShadow(r)) {
        const [c, mx] = shadowCrabNums(), d = roll(rng, c, mx);
        vq.push([t + SHADOW_DELAY_NEAR, 0, 'Shadow', d, 'crab']); st.shadows += 1;
        p.next_attack = t + 5; p.in_mage = true;
        L.on && L(`t${rjust(t, 4)} ${tag}Shadow on the crab (${why}) -> ${d}`);
        return;
      }
      const [c, mx] = melee_max_acc(p, 125, 75, CRAB_DEF_ROLL);
      [mx, floordiv(mx, 2)].forEach((m, k) => vq.push([t + 1, k, `Scythe hit ${k + 1}`, roll(rng, c, m), 'crab']));
      p.next_attack = t + 5; p.in_mage = false;
      L.on && L(`t${rjust(t, 4)} ${tag}Scythe on the crab (${why})`);
    }
    function act(t, r, verz, tag) {
      if (pc && pc.alive && p.has_bp) {                              // a purple carried into reds: blowpipe it from r0
        const [c] = blowpipe_chance(p), ok = rng.random() < c;
        p.next_attack = t + 2;
        if (ok) { pc.alive = false; pc.expl = true; vq.push([t + BP_DELAY, 0, 'pop', 0, 'purple']); }
        L.on && L(`t${rjust(t, 4)} ${tag}blowpipe at the purple -> ${ok ? 'PASSES' : 'miss'}`);
        return;
      }
      const crabOk = ch > 0 && !crabDone && r >= 2 && r + 1 <= CRAB_HEAL_R;
      if (r < SHIELD) {                                              // Verzik invulnerable
        if (r < 2) { p.next_attack = t + 1; return; }
        if (crabOk && (!commit || !dcSwing) && r <= SHIELD - (commit ? 5 : 1)) { dcSwing = true; crabHit(t, commit ? 'DC swing' : 'shield up', tag); return; }
        p.next_attack = P + SHIELD; return;
      }
      if (commit) return commitAttack(t, r, verz, tag);
      if (specGuard(t, verz, tag)) return;
      if (redsMode === 'shadow') {                                      // shadowing reds: the crab while it's worth more, else Verzik
        if (crabOk && crabExp(r, ch) > verzExp()) return crabHit(t, `crab ${ch}`, tag);
        return shadow(t, 'reds', tag);
      }
      if (verz) {
        if (crabOk) return crabHit(t, 'her attack tick', tag);
        if (p.in_mage && p.has3 === 'Ayak') { st.ayak_fix += 1; return ayakAuto(t, 'v', tag + 'tick fix: '); }
        if (cfg.shadow && cfg.shadow31) return shadow(t, '3:1', tag);
        p.next_attack = t + 1; L.on && L(`t${rjust(t, 4)} ${tag}lines up with her attack -> +1t`); return;
      }
      if (crabOk) {
        const full = crabExp(r, 10 ** 6), spare = ch - collisions_ahead(r) * full;   // keep what the collision-tick swings will take
        if (spare > 0 && crabExp(r, Math.trunc(spare)) > verzExp()) return crabHit(t, `crab ${ch}`, tag);
      }
      scythe(t, tag);
    }
    function commitAttack(t, r, verz, tag) {
      if (plan == null) {
        const per = p.regen_period(), first = per - p.regen_timer;
        const regens = first > 20 ? 0 : 1 + floordiv(20 - first, per);
        plan = p.spec >= 100 || (p.spec >= 50 && p.spec + 10 * regens >= 100) ? 'two claws'
          : p.spec >= 50 && cfg.shadow ? 'claw + shadow' : p.spec >= 50 ? 'claw + scratch' : 'scythes';
        L.on && L(`t${rjust(t, 4)} ${tag}commit plan: ${plan} (spec ${fx(p.spec)}%)`);
      }
      if (verz) {
        if (cfg.shadow && !firstCol && (plan === 'claw + shadow' || (plan === 'two claws' && claws < 2))) { firstCol = true; return shadow(t, 'collision', tag); }
        if (cfg.shadow && cfg.shadow31) return shadow(t, '3:1', tag);
        p.next_attack = t + 1; return;
      }
      if (r === 40 && p.spec >= 30 && hp >= MX * LAST_HIT_THR / 100) {
        p.spec -= 30; st.halb += 1;
        const [c1, m] = p3.melee(p, p3.HALB, P2_DEF[1]), [c2] = p3.melee(p, p3.HALB, P2_DEF[1], 0.75);
        const hb = (d) => (d > 0 ? d + p3.halb_bonus(m) : 0), hits = [hb(roll(rng, c1, m)), hb(roll(rng, c2, m))];
        hits.forEach((d, k) => vq.push([t + 1, k, `Halberd spec hit ${k + 1}`, d, 'v']));
        p.next_attack = t + 7; p.in_mage = false;
        L.on && L(`t${rjust(t, 4)} ${tag}HALBERD SPEC on r40 -> [${hits.join(', ')}]`);
        return;
      }
      if (plan === 'claw + scratch' && claws === 1 && !scratched) {
        const [c, mx] = melee_max_acc(p, CLAW.atk, CLAW.str, P2_DEF[1]), ds = [roll(rng, c, mx), roll(rng, c, floordiv(mx, 2))];
        ds.forEach((d, k) => vq.push([t + 1, k, 'Claw scratch', d, 'v']));
        scratched = true; p.next_attack = t + 4; p.in_mage = false;
        L.on && L(`t${rjust(t, 4)} ${tag}claw scratch -> [${ds.join(', ')}]`);
        return;
      }
      if (p.spec >= 50 && ((plan === 'two claws' && claws < 2) || (plan !== 'scythes' && plan !== 'two claws' && claws < 1))) { claws += 1; return claw(t, tag); }
      scythe(t, tag);
    }
  }
  if (kill2 == null) return { ...out, end: null };
  out.p2 = kill2;
  if (scope === 'p2') return { ...out, end: kill2 };
  // ================================================================ P3 (p3.js, solo)
  const r4 = p3.run_p3({ players: [p], pid: [p], kill: kill2 }, [cfg], 1, rng, log);
  if (r4.kill == null) return { ...out, end: null };
  out.p20 = r4.below20 != null ? r4.below20 - (kill2 + 4) : null;
  out.green = r4.green;
  return { ...out, end: r4.end };
}

/** Run `runs` raids (seeds `<seed>#i`): the report's result shape (as simulate_team) + solo stats. */
export function simulate_solo(cfgs, runs, seed, onProgress = null, Rng, scope = 'full') {
  const tot = [], s1 = [], s2 = [], s3 = [], depth = [], p20 = [], reds = [];
  const sp1 = [], sproc = [], sp2 = [], sp3 = [];
  const solo = { sets: [], purples: [], redemptions: [], drained: [], rends: [], commit: [], dc: [], crab_kills: [], ayak_fix: [] };
  for (let i = 0; i < runs; i++) {
    if (onProgress && i % 250 === 0) onProgress(i, runs);
    const r = run_solo(cfgs[0], new Rng(`${seed}#${i}`), null, scope);
    if (r.end == null) continue;
    tot.push(r.end); s1.push(r.p1); sp1.push(r.p1);
    if (scope === 'p1') continue;
    s2.push(r.p2 - r.p1); sproc.push(r.proc); sp2.push(r.p2); depth.push(r.depth); reds.push(r.proc);
    const st = r.st;
    solo.sets.push(st.sets); solo.purples.push(st.purples_before_reds); solo.redemptions.push(st.redemptions); solo.drained.push(st.drained);
    solo.rends.push(st.rends); solo.commit.push(st.commit_set ?? 0); solo.dc.push(st.dc); solo.crab_kills.push(st.crab_kills); solo.ayak_fix.push(st.ayak_fix);
    if (scope === 'p2') continue;
    s3.push(r.end - r.p2); sp3.push(r.end);
    if (r.p20 != null) p20.push(r.p20);
  }
  if (onProgress) onProgress(runs, runs);
  return { total: tot, p1: s1, p2: s2, p3: s3, depth, p20, reds, succ: tot.length / runs, runs, die_p1: 0, splits: { sp1, sproc, sp2, sp3 }, solo };
}
