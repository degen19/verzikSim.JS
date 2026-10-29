// Optimizer: sweeps chart inputs (ring %, death charges, deep proc, gear, toggles) and finds the setups that
// most often beat the user's breakpoints. Used by the web page's Optimizer tab (via worker.js).
import { plan } from './planner.js';
import { Rng } from './rng.js';
import { ITEMS } from './gear.js';
import { multiPicks, multiText } from './chartform.js';
import { run_p1, Player } from './sim.js';
import { run_p2 } from './p2.js';
import { run_reds } from './reds.js';
import { run_duo_reds } from './duo_reds.js';
import { run_p3 } from './p3.js';

/** Duos: both players dead, or would have gone below 0 HP, in one of these phases (a wipe - same rule as the Verz Solver). */
const wiped = (players, phases) => players.every((p) => p.dead || (p.would_die && phases.some((ph) => p.would_die.has(ph))));

/** One raid. Returns the room-complete tick, or null if the raid failed (duos: a P1 or P3 wipe fails it).
 *  Same RNG use as simulate(). */
export function runOne(cfgs, team, rng) {
  return runAfterP1(run_p1(cfgs, team, rng), cfgs, team, rng);
}
/** The rest of a raid after P1 (r1 = run_p1's result, rng right after it). */
function runAfterP1(r1, cfgs, team, rng) {
  const scope = cfgs[0] && cfgs[0].scope;                    // 'p1' / 'p2' stop at that phase's end (see simulate.js)
  if (r1.players.every((p) => p.dead)) return null;
  if (team === 2 && wiped(r1.players, ['P1'])) return null;
  if (scope === 'p1') return r1.end ?? null;
  const r2 = run_p2(r1, team, rng);
  if (r2.reds_tick == null || (team === 2 && r2.players.every((p) => p.dead))) return null;
  const r3 = team === 2 ? run_duo_reds(r2, cfgs, rng) : run_reds(r2, cfgs, team, rng);
  if (!r3.success || (team === 2 && r3.players.every((p) => p.dead))) return null;
  if (scope === 'p2') return r3.kill;
  const r4 = run_p3({ ...r3, pid: r2.pid }, cfgs, team, rng);
  if (team === 2 && wiped(r4.players || r3.players, ['P1', 'P3'])) return null;
  return r4.kill == null ? null : r4.end;
}

// settings P1 never uses (it plays out the same with any value of them): the reds DCs, Boak sides / pattern, East bounce
// tech, deep proc and the P2 shadow modes, and in 4-5 man the purple DCs (the trio's 4 Claw Priority reads the purple DC
// at the end of P1). Checked: every result is identical to playing each setup's P1 on its own.
const P2_ONLY = ['WestDC', 'EastDC', 'eastBoak', 'westBoak', 'eastPattern', 'eastBounce', 'deepProc', 'deepThr', 'shadow31', 'shadowLB', 'shadowCamp', 'scope'];
const p1Key = (cfgs, team) => JSON.stringify(cfgs.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) =>
  !P2_ONLY.includes(k) && !(team >= 4 && (k === 'PurpleDC' || k === 'Purple2DC')) && k !== 'name'))));
/** Player fields that differ between two setups of the same P1 group (from their settings): [[key, value], ...] per player. */
function playerPatch(repCfgs, cfgs) {
  if (repCfgs === cfgs) return cfgs.map(() => []);
  return cfgs.map((c, k) => {
    const a = new Player(k + 1, repCfgs[k]), b = new Player(k + 1, c), diff = [];
    for (const key of Object.keys(b)) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) diff.push([key, b[key]]);
    return diff;
  });
}
/** Deep copy that keeps classes (prototypes) and shared references (the team's supply pool, the players list). */
function cloneGraph(x, seen = new Map()) {
  if (x === null || typeof x !== 'object') return x;
  if (seen.has(x)) return seen.get(x);
  let y;
  if (Array.isArray(x)) { y = new Array(x.length); seen.set(x, y); for (let i = 0; i < x.length; i++) y[i] = cloneGraph(x[i], seen); return y; }
  if (x instanceof Map) { y = new Map(); seen.set(x, y); for (const [k, v] of x) y.set(cloneGraph(k, seen), cloneGraph(v, seen)); return y; }
  if (x instanceof Set) { y = new Set(); seen.set(x, y); for (const v of x) y.add(cloneGraph(v, seen)); return y; }
  if (ArrayBuffer.isView(x)) { y = x.slice(); seen.set(x, y); return y; }
  y = Object.create(Object.getPrototypeOf(x)); seen.set(x, y);
  for (const k of Object.keys(x)) y[k] = cloneGraph(x[k], seen);
  return y;
}

/** Raid i always uses the same random rolls, so every setup is tested on identical raids. */
export const raidRng = (seed, i) => new Rng(seed + i * 7919);

/**
 * Run raids [from, to) for each variant. Returns per variant: {n, k, fastest, fastestN, under: [count per breakpoint]}.
 * Breakpoints are in seconds (tick times); a room counts if it finishes on the breakpoint or faster.
 */
export function countBatch(variants, team, from, to, seed, bpSecs, onProgress = null) {
  const total = variants.length * (to - from);
  let done = 0;
  const out = variants.map(() => ({ n: 0, k: 0, fastest: null, fastestN: 0, under: bpSecs.map(() => 0), sig: 0 }));
  const add = (c, end) => {
    c.n++;
    c.sig = (Math.imul(c.sig, 1000003) + (end == null ? 65535 : end) + 1) >>> 0;   // raid-by-raid signature (identical setups)
    if (end == null) return;
    c.k++;
    const s = end * 0.6;
    bpSecs.forEach((b, j) => { if (s <= b + 1e-9) c.under[j]++; });
    if (c.fastest == null || end < c.fastest) { c.fastest = end; c.fastestN = 1; } else if (end === c.fastest) c.fastestN++;
  };
  // setups whose P1 settings are the same play P1 identically on a raid (same rolls): P1 runs once per group and each
  // setup continues from a copy of it, with its own P2-on settings written into the players
  const groups = new Map();
  variants.forEach((cfgs, v) => { const key = p1Key(cfgs, team); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(v); });
  const plan = [...groups.values()].map((vs) => ({ vs, rep: variants[vs[0]], patch: vs.map((v) => playerPatch(variants[vs[0]], variants[v])) }));
  for (let i = from; i < to; i++) {
    for (const g of plan) {
      if (g.vs.length === 1) { add(out[g.vs[0]], runOne(g.rep, team, raidRng(seed, i))); done++; continue; }
      const rng = raidRng(seed, i), r1 = run_p1(g.rep, team, rng);
      g.vs.forEach((v, j) => {
        const last = j === g.vs.length - 1;
        const st = last ? { r1, rng } : cloneGraph({ r1, rng });
        g.patch[j].forEach((pp, k) => { const pl = st.r1.players[k]; for (const [key, val] of pp) pl[key] = cloneGraph(val); });
        add(out[v], runAfterP1(st.r1, variants[v], team, st.rng));
        done++;
      });
    }
    if (onProgress && (i - from) % 20 === 19) onProgress(done, total);
  }
  for (const c of out) c.sig = c.sig.toString(36);
  if (onProgress) onProgress(total, total);
  return out;
}

export function mergeCounts(a, b) {
  if (!a) return b;
  const f = a.fastest == null ? b.fastest : b.fastest == null ? a.fastest : Math.min(a.fastest, b.fastest);
  return {
    n: a.n + b.n, k: a.k + b.k, under: a.under.map((x, j) => x + b.under[j]), fastest: f, sig: `${a.sig ?? ''}.${b.sig ?? ''}`,
    fastestN: (a.fastest === f ? a.fastestN : 0) + (b.fastest === f ? b.fastestN : 0),
  };
}

// ---------------------------------------------------------------- what can be swept

// mage gear by piece (shadow players). Helm 'Take off' = no helm at all; 'None' = keeps the melee helm on.
const MAGE_HELM = { Ancestral: 'Ancestral hat', Virtus: 'Virtus mask', 'Take off': 'off', None: 'melee' };
const MAGE_BODY = { Ancestral: 'Ancestral robe top', Virtus: 'Virtus robe top' };
const MAGE_LEGS = { Ancestral: 'Ancestral robe bottom', Virtus: 'Virtus robe bottom' };
const labelOf = (map, item, def) => Object.keys(map).find((k) => map[k] === item) || def;
const MAGE_CAPES = ['Infernal cape', 'Imbued saradomin cape'];
const TOGGLES = [
  ['shadowLB', 'Shadow while on Lightbearer'], ['shadowCamp', 'Shadow camp'], ['shadow31', '3:1'],
  ['pneckP1', 'Pneck on P1'],
];
// Blood fury in: where the threshold swap is used (players with both amulets and a threshold)
const BF_COMBOS = ['P2 crabs / P2 Verzik / P3', 'P2 Verzik / P3', 'P2 crabs / P3', 'P3', 'P2 crabs / P2 Verzik', 'P2 Verzik', 'P2 crabs', 'None'];

/**
 * A setup as chart-form changes: [[table, header, player (null = team), value], ...] for every input the optimizer can
 * vary (DCs, Lightbearers, ring swap %, amulet, Boak sides / pattern, blowpipes, shadow + modes + mage gear, deep proc,
 * East bounce tech, toggles). Written over the set's own form values, it gives the chart of that setup.
 */
export function cfgsToFields(cfgs, team) {
  const out = [];
  const put = (t, h, k, v) => out.push([t, h, k, v]);
  cfgs.forEach((c, k) => {
    put('setup', 'lightbearerOn', k, !!c.lightbearerOn);
    put('setup', 'PurpleDC', k, !!c.PurpleDC); put('setup', '1st Purple DC', k, !!c.PurpleDC); put('setup', '2nd Purple DC', k, !!c.Purple2DC);
    put('setup', 'WestDC', k, !!c.WestDC); put('setup', 'EastDC', k, !!c.EastDC);
    put('setup', 'Ring switch %', k, c.ringSwitch ?? '');
    if (c.amulet_mode || c.amulet) put('gear', 'amulet', k, c.amulet);
    put('gear', 'Has BP', k, c.hasBP !== false);
    put('gear', 'Shadow', k, !!c.shadow); put('gear', '3:1', k, !!c.shadow31); put('gear', 'Shadow while LB', k, !!c.shadowLB);
    put('gear', 'Shadow camp', k, !!c.shadowCamp); put('gear', 'Deep proc', k, !!c.deepProc);
    if ('pneckP1' in c) put('gear', 'Pneck on P1', k, !!c.pneckP1);
    if (Array.isArray(c.bfIn)) put('gear', 'Blood fury in', k, multiText('Blood fury in', c.bfIn));
    if (team > 2) {
      if (c.eastBoak != null || c.westBoak != null) { put('gear', 'East Boak', k, !!c.eastBoak); put('gear', 'West Boak', k, !!c.westBoak); }
      if (c.eastPattern) put('gear', 'East Pattern', k, c.eastPattern);
    }
    if (c.shadow && c.mage) {
      const mg = c.mage;
      if (mg.helm) put('mage', 'mage helm', k, labelOf(MAGE_HELM, mg.helm, 'Ancestral'));
      if (mg.body) put('mage', 'mage body', k, labelOf(MAGE_BODY, mg.body, 'Ancestral'));
      if (mg.legs) put('mage', 'mage legs', k, labelOf(MAGE_LEGS, mg.legs, 'Ancestral'));
      if (mg.cape) put('mage', 'mage cape', k, /nfernal/.test(mg.cape) ? 'Infernal' : 'Imbued sara');
    }
  });
  if (cfgs[0]) {
    if (cfgs[0].deepThr != null) put('team', 'Deep proc HP %', null, cfgs[0].deepThr);
    if (team > 2) put('team', 'East bounce tech', null, cfgs[0].eastBounce || 0);
  }
  return out;
}

/**
 * Every input the optimizer can vary for this chart. Each option:
 *  {id, group, label, kind: 'num'|'choice', current, choices?, apply(cfgs, value)}
 * 'num' values are numbers or 'off'; 'choice' values are strings from `choices`.
 */
export function catalog(cfgs, team) {
  const opts = [];
  const names = cfgs.map((c, i) => c.name || `P${i + 1}`);
  const who = (pred) => { const i = cfgs.findIndex(pred); return i < 0 ? null : names[i]; };

  // death charges (team-wide: one owner each)
  // popping the purple needs a blowpipe: the blowpipe holders (everyone when they can be swept too - setups where the purple DC
  // has no blowpipe are skipped, see validCfgs)
  const bpNames = names.filter((_, i) => cfgs[i].hasBP !== false).length < team ? names : names.filter((_, i) => cfgs[i].hasBP !== false);
  opts.push({ id: 'dc_p1', group: 'Death charges', label: team === 2 ? '1st purple DC' : 'Purple DC', kind: 'choice', choices: bpNames,
    current: who((c) => c.PurpleDC), apply: (cf, v) => cf.forEach((c, i) => { c.PurpleDC = names[i] === v; }) });
  if (team === 2) {
    const p2cur = who((c) => c.Purple2DC) || who((c) => c.PurpleDC);
    opts.push({ id: 'dc_p2', group: 'Death charges', label: '2nd purple DC', kind: 'choice', choices: bpNames, current: p2cur,
      apply: (cf, v) => { const p1 = cf.find((c) => c.PurpleDC); cf.forEach((c, i) => { c.Purple2DC = names[i] === v && c !== p1; }); },
      after: 'dc_p1' });
  }
  opts.push({ id: 'dc_w', group: 'Death charges', label: 'West crab DC (1st reds set)', kind: 'choice', choices: names,
    current: who((c) => c.WestDC), apply: (cf, v) => cf.forEach((c, i) => { c.WestDC = names[i] === v; }) });
  opts.push({ id: 'dc_e', group: 'Death charges', label: 'East crab DC (1st reds set)', kind: 'choice', choices: names,
    current: who((c) => c.EastDC), apply: (cf, v) => cf.forEach((c, i) => { c.EastDC = names[i] === v; }) });

  // 3-5 man: who goes West / East for the purple (Boak sides; at least one player on each side), East bounce tech
  if (team > 2) {
    const side = (c) => (c.eastBoak && !c.westBoak ? 'E' : c.westBoak && !c.eastBoak ? 'W' : '?');
    const sides = [];
    for (let m = 1; m < (1 << team) - 1; m++) sides.push(cfgs.map((_, k) => (m >> k & 1 ? 'E' : 'W')).join(''));
    opts.push({ id: 'boak', group: 'Team', label: `Boak sides (${names.join(', ')})`, kind: 'choice', choices: sides,
      current: cfgs.map(side).join(''),
      apply: (cf, v) => cf.forEach((c, i) => {
        const e = v[i] === 'E';
        if (e && !c.eastBoak) c.eastPattern = c.eastPattern || '0-T';     // moved East: 0-T unless they have a pattern
        c.eastBoak = e; c.westBoak = !e;
      }) });
    opts.push({ id: 'ebt', group: 'Team', label: 'East bounce tech', kind: 'choice', choices: ['0', '1', '2', '3'],
      current: String(cfgs[0].eastBounce || 0), apply: (cf, v) => cf.forEach((c) => { c.eastBounce = Number(v); }) });
  }

  // who holds what (tradeable before the room): Lightbearers, blowpipes, and (3-5 man) the shadow with its modes and mage
  // gear - every way of handing out the same number, listed by the players who get them
  const pick = (n, k) => { const out = []; const go = (st, acc) => { if (acc.length === k) { out.push(acc); return; } for (let i = st; i < n; i++) go(i + 1, [...acc, i]); }; go(0, []); return out; };
  const label = (ks) => (ks.length ? ks.map((k) => names[k]).join(' + ') : 'nobody');
  const holders = (key, test) => cfgs.map((c, k) => (test(c) ? k : -1)).filter((k) => k >= 0);
  const lbK = holders('lb', (c) => c.lightbearerOn);
  if (lbK.length && lbK.length < team) {
    const ch = pick(team, lbK.length);
    opts.push({ id: 'lbHolders', group: 'Team', label: 'Lightbearer holders', kind: 'choice', choices: ch.map(label), current: label(lbK),
      apply: (cf, v) => { const ks = ch[ch.map(label).indexOf(v)]; cf.forEach((c, i) => { const was = c.lightbearerOn; c.lightbearerOn = ks.includes(i); if (!was && c.lightbearerOn) c.ringSwitch = null; }); } });
  }
  const bpK = holders('bp', (c) => c.hasBP !== false);
  if (bpK.length && bpK.length < team) {
    const ch = pick(team, bpK.length);
    opts.push({ id: 'bpHolders', group: 'Team', label: 'Blowpipe holders', kind: 'choice', choices: ch.map(label), current: label(bpK),
      apply: (cf, v) => { const ks = ch[ch.map(label).indexOf(v)]; cf.forEach((c, i) => { c.hasBP = ks.includes(i); }); } });
  }
  const shK = holders('sh', (c) => c.shadow);
  if (team > 2 && shK.length && shK.length < team) {
    const ch = pick(team, shK.length), KEYS = ['shadow', 'shadow31', 'shadowLB', 'shadowCamp', 'deepProc', 'mage', 'mageGear'];
    const src = shK.map((k) => Object.fromEntries(KEYS.map((x) => [x, structuredClone(cfgs[k][x])])));
    opts.push({ id: 'shadowHolders', group: 'Team', label: 'Shadow player' + (shK.length > 1 ? 's' : '') + ' (with their modes and mage gear)', kind: 'choice', choices: ch.map(label), current: label(shK),
      apply: (cf, v) => { const ks = ch[ch.map(label).indexOf(v)]; cf.forEach((c, i) => {
        const j = ks.indexOf(i);
        if (j >= 0) Object.assign(c, structuredClone(src[j]));
        else Object.assign(c, { shadow: false, shadow31: false, shadowLB: false, shadowCamp: false, deepProc: false });
      }); } });
  }

  // deep proc (shadow player)
  const sh = cfgs.findIndex((c) => c.shadow);
  if (sh >= 0) {
    const c = cfgs[sh];
    opts.push({ id: 'deep', group: 'Team', label: `Deep proc HP % (${names[sh]})`, kind: 'num',
      current: c.deepProc ? Number(c.deepThr ?? 42) : 'off',
      apply: (cf, v) => { cf[sh].deepProc = v !== 'off'; if (v !== 'off') cf.forEach((x) => { x.deepThr = v; }); } });
  }

  cfgs.forEach((c, i) => {
    const g = names[i];
    if (c.lightbearerOn) {
      opts.push({ id: `ring_${i}`, group: g, label: 'Ring swap %', kind: 'num', current: Number(c.ringSwitch ?? c.targetSpec ?? 100),
        apply: (cf, v) => { cf[i].ringSwitch = v; } });
    }
    opts.push({ id: `amulet_${i}`, group: g, label: 'Amulet', kind: 'choice', choices: ['Rancour', 'Blood fury'], current: c.amulet || 'Rancour',
      apply: (cf, v) => { cf[i].amulet = v; } });
    if (c.shadow) {
      const mg = c.mage || {};
      opts.push({ id: `mcape_${i}`, group: g, label: 'Mage cape', kind: 'choice', choices: MAGE_CAPES, current: mg.cape || 'Imbued saradomin cape',
        apply: (cf, v) => { cf[i].mage = { ...(cf[i].mage || {}), cape: v }; setMageSlot(cf[i], 'cape', v); } });
      for (const [key, label, map, def] of [['helm', 'Mage helm', MAGE_HELM, 'Ancestral'], ['body', 'Mage top', MAGE_BODY, 'Ancestral'],
        ['legs', 'Mage bottom', MAGE_LEGS, 'Ancestral']]) {
        opts.push({ id: `m${key}_${i}`, group: g, label, kind: 'choice', choices: Object.keys(map), current: labelOf(map, mg[key], def),
          apply: (cf, v) => { cf[i].mage = { ...(cf[i].mage || {}), [key]: map[v] }; setMageSlot(cf[i], key === 'helm' ? 'head' : key, map[v]); } });
      }
    }
    if (team > 2) {
      if (c.eastBoak) opts.push({ id: `epat_${i}`, group: g, label: 'East Pattern', kind: 'choice', choices: ['A', '0-T'], current: c.eastPattern || 'A',
        apply: (cf, v) => { cf[i].eastPattern = v; } });
    }
    if (c.amulet === 'Both' && c.bloodFuryHp) {
      opts.push({ id: `bfin_${i}`, group: g, label: 'Blood fury in', kind: 'choice', choices: BF_COMBOS,
        current: multiText('Blood fury in', Array.isArray(c.bfIn) ? c.bfIn : multiPicks('Blood fury in', '')),
        apply: (cf, v) => { cf[i].bfIn = multiPicks('Blood fury in', v); } });
    }
    for (const [key, label] of TOGGLES) {
      if (!(key in c)) continue;                                  // only toggles the chart actually has
      if ((key.startsWith('shadow')) && !c.shadow) continue;
      opts.push({ id: `${key}_${i}`, group: g, label, kind: 'choice', choices: ['On', 'Off'], current: c[key] ? 'On' : 'Off',
        apply: (cf, v) => { cf[i][key] = v === 'On'; } });
    }
  });
  return opts;
}

/** Gear-tab magic set (cfg.mageGear): put `name` in that slot ('off' = nothing, 'melee' = their melee helm). */
function setMageSlot(c, slot, name) {
  if (!Array.isArray(c.mageGear)) return;
  const v = name === 'off' ? null : name === 'melee' ? c.helm : name;
  c.mageGear = c.mageGear.filter((n) => !(ITEMS[n] && ITEMS[n].slot === slot));
  if (v && ITEMS[v]) c.mageGear.push(v);
}

/** Build the chart for one combination. `combo` = {optionId: value}. Options are applied in catalog order. */
export function applyCombo(cfgs, team, combo) {
  const cf = structuredClone(cfgs);
  for (const o of catalog(cfgs, team)) if (o.id in combo) o.apply(cf, combo[o.id]);
  return cf;
}

/** Charted Dawn specs a setup can't afford, per player (its start spec, Lightbearer and surge timing on the P1 chart -
 *  the spec planner's timeline). The sim skips them, so the chart doesn't play as charted. */
export function dawnsShort(cfgs) {
  const players = cfgs.map((c) => ({ name: c.name, start: Number(c.startSpec ?? 100) || 100, lb: !!c.lightbearerOn, surge: c.customSurgeTick ?? null, acts: c.actions || {}, purple1: false, purple2: false, west: false, east: false }));
  const maxTick = Math.max(1, ...players.flatMap((p) => Object.keys(p.acts).map(Number)));
  return plan({ team: cfgs.length, players, nPurples: null, deathTick: null, maxTick }).map((x) => x.dawnShort);
}
/** The charted Dawn specs a setup can't afford, as text (empty if none): "P2: t41 (Dawn spec needs 35%)". */
export function dawnShortfalls(cfgs) {
  const players = cfgs.map((c) => ({ name: c.name, start: Number(c.startSpec ?? 100) || 100, lb: !!c.lightbearerOn, surge: c.customSurgeTick ?? null, acts: c.actions || {}, purple1: false, purple2: false, west: false, east: false }));
  const maxTick = Math.max(1, ...players.flatMap((p) => Object.keys(p.acts).map(Number)));
  return plan({ team: cfgs.length, players, nPurples: null, deathTick: null, maxTick })
    .map((x, i) => (x.dawnShortTicks.length ? `${cfgs[i].name || `P${i + 1}`}: Dawn spec on ${x.dawnShortTicks.map((t) => `tick ${t}`).join(', ')}` : '')).filter(Boolean);
}
/** False when the setup can't afford a charted Dawn spec that the base setup (as charted) can. */
export function dawnsOk(cfgs, base) {
  const a = dawnsShort(cfgs), b = dawnsShort(base);
  return a.every((n, i) => n <= (b[i] || 0));
}

/** False when a setup breaks the shadow rules (Shadow camp together with 3:1 or Shadow while LB). */
export const validCfgs = (cfgs) => cfgs.every((c) => !(c.shadowCamp && (c.shadow31 || c.shadowLB))
  && !((c.PurpleDC || c.Purple2DC) && c.hasBP === false));         // the purple DC needs a blowpipe

/** All combinations of the chosen values: sweep = [{id, values: [...]}, ...]. */
export function enumerate(sweep) {
  let out = [{}];
  for (const { id, values } of sweep) out = out.flatMap((c) => values.map((v) => ({ ...c, [id]: v })));
  return out;
}

/** Search plans: raids per setup at each stage, and how many setups survive to the next stage. */
export const DEPTHS = {
  quick:    { label: 'Quick',    n: [500, 2000, 8000],   keep: [12, 4] },
  standard: { label: 'Standard', n: [1000, 4000, 20000], keep: [16, 6] },
  thorough: { label: 'Thorough', n: [2500, 10000, 60000], keep: [24, 8] },
};

/** Total raids a search will run (used for the runtime estimate). */
export function planRaids(nCombos, depth) {
  const d = DEPTHS[depth];
  if (nCombos <= d.keep[1]) return nCombos * d.n[2];               // few setups: straight to the final stage
  const k1 = Math.min(nCombos, d.keep[0]), k2 = Math.min(k1, d.keep[1]);
  return nCombos * d.n[0] + k1 * d.n[1] + (k2 + 1) * d.n[2];       // +1 = your chart as charted, for comparison
}

/** Early-stage score: the chosen breakpoint, with small nudges from looser breakpoints and success so rare
 *  breakpoints (few rooms per setup at low raid counts) don't rank on pure luck. */
export function score(c, metric, ofKills = false) {
  const rate = (x) => x / c.n, brate = (x) => x / (ofKills ? Math.max(1, c.k) : c.n);   // breakpoints: of all attempts, or of kills
  if (metric === 'success') return rate(c.k);
  const j = metric;
  let s = brate(c.under[j]);
  c.under.forEach((x, i) => { if (i !== j && x > c.under[j]) s += 0.1 * brate(x); });
  return s + 0.01 * rate(c.k);
}
export const finalScore = (c, metric, ofKills = false) => (metric === 'success' ? c.k / c.n
  : c.under[metric] / (ofKills ? Math.max(1, c.k) : c.n) + 1e-6 * c.k / c.n);   // ties: more success

/** Parse "m:ss, m:ss, ..." into seconds, rounded down to a tick (sorted slowest first). */
export function parseBreakpoints(text) {
  const out = [];
  for (const part of String(text).split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
    if (!m) throw new Error(`"${part}" isn't a time - use m:ss, comma-separated`);
    // rounded down to a tick (0.6s): a room counts if it finishes on that tick or faster (same rule as the Verz Solver)
    out.push(Math.round(Math.floor((Number(m[1]) * 60 + Number(m[2])) / 0.6 + 1e-6) * 6) / 10);
  }
  if (!out.length) throw new Error('Add at least one breakpoint (m:ss, comma-separated)');
  return [...new Set(out)].sort((a, b) => b - a);
}
