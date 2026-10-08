// Optimizer: sweeps chart inputs (ring %, death charges, deep proc, gear, toggles) and finds the setups that
// most often beat the user's breakpoints. Used by the web page's Optimizer tab (via worker.js).
import { Rng } from './rng.js';
import { run_p1, PRAYERS } from './sim.js';
import { run_p2 } from './p2.js';
import { run_reds } from './reds.js';
import { run_duo_reds } from './duo_reds.js';
import { run_p3 } from './p3.js';

/** One raid. Returns the room-complete tick, or null if the raid failed. Same RNG use as simulate(). */
export function runOne(cfgs, team, rng) {
  const scope = cfgs[0] && cfgs[0].scope;                    // 'p1' / 'p2' stop at that phase's end (see simulate.js)
  const r1 = run_p1(cfgs, team, rng);
  if (r1.players.every((p) => p.dead)) return null;
  if (scope === 'p1') return r1.end ?? null;
  const r2 = run_p2(r1, team, rng);
  if (r2.reds_tick == null || (team === 2 && r2.players.every((p) => p.dead))) return null;
  const r3 = team === 2 ? run_duo_reds(r2, cfgs, rng) : run_reds(r2, cfgs, team, rng);
  if (!r3.success || (team === 2 && r3.players.every((p) => p.dead))) return null;
  if (scope === 'p2') return r3.kill;
  const r4 = run_p3({ ...r3, pid: r2.pid }, cfgs, team, rng);
  return r4.kill == null ? null : r4.end;
}

/** Raid i always uses the same random rolls, so every setup is tested on identical raids. */
export const raidRng = (seed, i) => new Rng(seed + i * 7919);

/**
 * Run raids [from, to) for each variant. Returns per variant: {n, k, fastest, fastestN, under: [count per breakpoint]}.
 * Breakpoints are in seconds; a room counts if it finishes strictly faster than the breakpoint.
 */
export function countBatch(variants, team, from, to, seed, bpSecs, onProgress = null) {
  const out = [];
  const total = variants.length * (to - from);
  let done = 0;
  for (const cfgs of variants) {
    const c = { n: 0, k: 0, fastest: null, fastestN: 0, under: bpSecs.map(() => 0) };
    for (let i = from; i < to; i++) {
      c.n++;
      const end = runOne(cfgs, team, raidRng(seed, i));
      if (end != null) {
        c.k++;
        const s = end * 0.6;
        bpSecs.forEach((b, j) => { if (s < b - 1e-9) c.under[j]++; });
        if (c.fastest == null || end < c.fastest) { c.fastest = end; c.fastestN = 1; } else if (end === c.fastest) c.fastestN++;
      }
      if (onProgress && ++done % 200 === 0) onProgress(done, total);
    }
    out.push(c);
  }
  if (onProgress) onProgress(total, total);
  return out;
}

export function mergeCounts(a, b) {
  if (!a) return b;
  const f = a.fastest == null ? b.fastest : b.fastest == null ? a.fastest : Math.min(a.fastest, b.fastest);
  return {
    n: a.n + b.n, k: a.k + b.k, under: a.under.map((x, j) => x + b.under[j]), fastest: f,
    fastestN: (a.fastest === f ? a.fastestN : 0) + (b.fastest === f ? b.fastestN : 0),
  };
}

// ---------------------------------------------------------------- what can be swept

const HELMS = ['Torva full helm', 'Oathplate helm'];
const BODIES = ['Torva platebody', 'Oathplate chest'];
const LEGS = ['Torva platelegs', 'Oathplate legs'];
const AMULETS = ['Rancour', 'Blood fury'];
const MAGE_SETS = { Ancestral: ['Ancestral hat', 'Ancestral robe top', 'Ancestral robe bottom'], Virtus: ['Virtus mask', 'Virtus robe top', 'Virtus robe bottom'] };
const MAGE_CAPES = ['Infernal cape', 'Imbued saradomin cape'];
const TOGGLES = [
  ['shadowLB', 'Shadow while on Lightbearer'], ['shadowCamp', 'Shadow camp'], ['shadow31', '3:1'],
  ['pneckP1', 'Pneck on P1'], ['redemptionFlick', 'Redemption flick'], ['passGreen', 'Pass green if death'],
];

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
  opts.push({ id: 'dc_p1', group: 'Death charges', label: team === 2 ? '1st purple DC' : 'Purple DC', kind: 'choice', choices: names,
    current: who((c) => c.PurpleDC), apply: (cf, v) => cf.forEach((c, i) => { c.PurpleDC = names[i] === v; }) });
  if (team === 2) {
    const p2cur = who((c) => c.Purple2DC) || who((c) => c.PurpleDC);
    opts.push({ id: 'dc_p2', group: 'Death charges', label: '2nd purple DC', kind: 'choice', choices: names, current: p2cur,
      apply: (cf, v) => { const p1 = cf.find((c) => c.PurpleDC); cf.forEach((c, i) => { c.Purple2DC = names[i] === v && c !== p1; }); },
      after: 'dc_p1' });
  }
  opts.push({ id: 'dc_w', group: 'Death charges', label: 'West crab DC (1st reds set)', kind: 'choice', choices: names,
    current: who((c) => c.WestDC), apply: (cf, v) => cf.forEach((c, i) => { c.WestDC = names[i] === v; }) });
  opts.push({ id: 'dc_e', group: 'Death charges', label: 'East crab DC (1st reds set)', kind: 'choice', choices: names,
    current: who((c) => c.EastDC), apply: (cf, v) => cf.forEach((c, i) => { c.EastDC = names[i] === v; }) });

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
    opts.push({ id: `prayer_${i}`, group: g, label: 'Melee prayer', kind: 'choice', choices: Object.keys(PRAYERS), current: c.meleePrayer || 'Piety',
      apply: (cf, v) => { cf[i].meleePrayer = v; } });
    for (const [key, label, list, def] of [['helm', 'Helm', HELMS, 'Torva full helm'], ['body', 'Body', BODIES, 'Torva platebody'],
      ['legs', 'Legs', LEGS, 'Torva platelegs'], ['amulet', 'Amulet', AMULETS, 'Rancour']]) {
      opts.push({ id: `${key}_${i}`, group: g, label, kind: 'choice', choices: list, current: c[key] || def,
        apply: (cf, v) => { cf[i][key] = v; } });
    }
    if (c.shadow) {
      const mg = c.mage || {};
      opts.push({ id: `mcape_${i}`, group: g, label: 'Mage cape', kind: 'choice', choices: MAGE_CAPES, current: mg.cape || 'Imbued saradomin cape',
        apply: (cf, v) => { cf[i].mage = { ...(cf[i].mage || {}), cape: v }; } });
      opts.push({ id: `mset_${i}`, group: g, label: 'Mage armour', kind: 'choice', choices: Object.keys(MAGE_SETS),
        current: String(mg.helm || 'Ancestral').startsWith('Virtus') ? 'Virtus' : 'Ancestral',
        apply: (cf, v) => { const [h, b, l] = MAGE_SETS[v]; cf[i].mage = { ...(cf[i].mage || {}), helm: h, body: b, legs: l }; } });
    }
    if (team > 2) {
      opts.push({ id: `boak_${i}`, group: g, label: 'Boak side', kind: 'choice', choices: ['East', 'West'],
        current: c.eastBoak ? 'East' : c.westBoak ? 'West' : '-',
        apply: (cf, v) => { cf[i].eastBoak = v === 'East'; cf[i].westBoak = v === 'West'; } });
      opts.push({ id: `epat_${i}`, group: g, label: 'East Pattern (East Boak players)', kind: 'choice', choices: ['A', '0-T'], current: c.eastPattern || 'A',
        apply: (cf, v) => { cf[i].eastPattern = v; } });
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

/** Build the chart for one combination. `combo` = {optionId: value}. Options are applied in catalog order. */
export function applyCombo(cfgs, team, combo) {
  const cf = structuredClone(cfgs);
  for (const o of catalog(cfgs, team)) if (o.id in combo) o.apply(cf, combo[o.id]);
  return cf;
}

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
export function score(c, metric) {
  const rate = (x) => x / c.n;
  if (metric === 'success') return rate(c.k);
  const j = metric;
  let s = rate(c.under[j]);
  c.under.forEach((x, i) => { if (i !== j && x > c.under[j]) s += 0.1 * rate(x); });
  return s + 0.01 * rate(c.k);
}
export const finalScore = (c, metric) => (metric === 'success' ? c.k / c.n : c.under[metric] / c.n);

/** Parse "m:ss, m:ss, ..." into seconds (sorted slowest first). */
export function parseBreakpoints(text) {
  const out = [];
  for (const part of String(text).split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
    if (!m) throw new Error(`"${part}" isn't a time - use m:ss, comma-separated`);
    out.push(Number(m[1]) * 60 + Number(m[2]));
  }
  if (!out.length) throw new Error('Add at least one breakpoint (m:ss, comma-separated)');
  return [...new Set(out)].sort((a, b) => b - a);
}
