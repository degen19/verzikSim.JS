#!/usr/bin/env node
// Verz Solver (command line): the best full-room setups for a 2-5 man chart.
//   node cli/solveroom.mjs chart.xlsx --team 5 [--rings 4] [--horns 2] [--bps "2:57,2:51,2:48"] [--boak WWEEE] [--set A]
//        [--p1top 20] [--p1beam 150] [--n1 200] [--keep1 10] [--n2 250] [--keepP2 20] [--n3 200] [--keep2 24]
//        [--final 3000] [--top 10] [--out file.txt]
// --bps: full-room breakpoints (m:ss, rounded down to a tick; a raid counts if it is equal or faster). The first is
//        the target the ranking uses, success is the tie-breaker. Blank = 10th/25th/50th percentile of your chart.
// --minsuccess: minimum raid success % (e.g. 85) - setups below it are left out.
// --minbelow 5: minimum success = your chart's success minus 5 points (instead of --minsuccess).
// --boak: East/West Boak per player (E/W) when the chart has them unset (default: first 2 West, the rest East 0-T).
// --horns: Soulflame horns in the raid (default 2 in 5s, 1 otherwise; 0 = none).
// Searched: P1 chart, who has Lightbearer, purple DC, ring swap %, reds West/East DCs, horns (holder, P2/P3 use).
// Your chart's set also goes in: run as charted (always listed) and through the same search (--nomine to leave it out).
import { readFileSync, writeFileSync } from 'node:fs';
import { readXlsx } from '../engine/xlsx.js';
import { parse_chart } from '../engine/sim.js';
import { solveRoom, evalSetup, evalFull } from '../engine/roomsolver.js';
import { checkRow } from '../engine/chartform.js';

const a = process.argv.slice(2);
const o = { team: 5, set: 'A', rings: null, horns: null, bps: '', boak: '', p1top: 20, p1beam: 150, n1: 200, keep1: 10, n2: 250,
  keepP2: 20, n3: 200, keep2: 24, final: 3000, editrounds: 2, editwidth: 3, diverse: 0, succtol: 3, top: 10, out: '', minsuccess: 0, nomine: 0, minbelow: null };
o.chart = a[0];
for (let i = 1; i < a.length; i++) { if (a[i] === '--nomine') { o.nomine = 1; continue; } const k = a[i].replace(/^--/, ''); if (k in o) o[k] = isNaN(Number(a[i + 1])) ? a[++i] : Number(a[++i]); }
const fmt = (t) => { const s = t * 0.6; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const fmtS = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const tickTime = (sec) => Math.floor(sec / 0.6 + 1e-6) * 0.6;          // breakpoints are tick times
const pctl = (ends, fs) => { const e = [...ends].filter((x) => x >= 0).sort((x, y) => x - y); return fs.map((f) => e[Math.floor(e.length * f)] * 0.6); };

let cfgs = await parse_chart(await readXlsx(readFileSync(o.chart)), o.team, null, o.set);
// Boak sides unset: --boak, else the first 2 players West and the rest East on the 0-T pattern
const unset = o.team === 2 ? [] : cfgs.filter((c) => !c.eastBoak === !c.westBoak);   // duos have no Boak sides
if (unset.length) {
  const sides = String(o.boak || '').toUpperCase();
  cfgs = cfgs.map((c, k) => {
    if (!c.eastBoak !== !c.westBoak) return c;
    const e = sides[k] ? sides[k] === 'E' : k >= 2;
    return { ...c, eastBoak: e, westBoak: !e, ...(e && !sides[k] ? { eastPattern: '0-T' } : {}) };
  });
  console.log(`NOTE: East/West Boak unset for ${unset.map((c) => c.name).join(', ')} - using ${sides ? '--boak' : 'default'} sides ${cfgs.map((c) => (c.eastBoak ? `E(${c.eastPattern || 'A'})` : 'W')).join(' ')}`);
}
const names = cfgs.map((c) => c.name);
const rings = o.rings ?? cfgs.filter((c) => c.lightbearerOn).length;
const mineCfgs = cfgs;                                                  // your chart as charted (your reds DCs)
const base = cfgs.map((c) => ({ ...c, WestDC: false, EastDC: false, horn: false, hornP2: false, hornP3: false })); // the search assigns reds DCs + horns
const horns = o.horns ?? (o.team === 5 ? 2 : o.team === 2 ? 0 : 1);   // duos: no horns

// your chart: the comparison and the default full-room breakpoints; P2-end breakpoints for the early stages
const t0 = Date.now();
let bpsFull = String(o.bps || '').split(/[,\s]+/).filter(Boolean).map((x) => { const [m, s] = x.split(':'); return tickTime(Number(m) * 60 + Number(s)); });
if (!bpsFull.length) {
  bpsFull = pctl(evalFull(mineCfgs, o.team, o.final, 'final', []).ends, [0.10, 0.25, 0.50]);
  console.log(`Room breakpoints from your chart's 10th/25th/50th percentile: ${bpsFull.map(fmtS).join(', ')} - the first is the target`);
}
const mine = evalFull(mineCfgs, o.team, o.final, 'final', bpsFull);
if (o.minbelow != null) { o.minsuccess = Math.max(0, mine.k / mine.n * 100 - o.minbelow); console.log(`Minimum success: your chart ${pct(mine.k / mine.n)} - ${o.minbelow} = ${o.minsuccess.toFixed(1)}%`); }
const bpsP2 = pctl(evalSetup(base, o.team, 1000, 'p2bp', []).ends, [0.10, 0.25, 0.50]);
console.log(`${o.team}-man, ${rings} Lightbearer${rings === 1 ? '' : 's'}, ${horns} horn${horns === 1 ? '' : 's'} | your chart: success ${pct(mine.k / mine.n)}, `
  + `${bpsFull.map((b, j) => `<= ${fmtS(b)} ${pct(mine.under[j] / mine.n)}`).join(', ')}, everyone clawed ${pct(mine.all50 / mine.n)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`P2-end breakpoints for the early stages: ${bpsP2.map(fmtS).join(', ')}`);

const t1 = Date.now();
const res = await solveRoom(base, o.team, { rings, horns, bps: bpsP2, bpsFull, p1Top: o.p1top, p1Beam: o.p1beam, n1: o.n1, keep1: o.keep1,
  n2: o.n2, keepP2: o.keepP2, n3: o.n3, keep2: o.keep2, nFinal: o.final, top: o.top, minSuccess: (o.minsuccess || 0) / 100, log: (s) => console.log(s),
  p1Diverse: !!o.diverse, succTol: o.succtol / 100, editRounds: o.editrounds, editWidth: o.editwidth, seeds: o.nomine ? [] : [{ cfg: mineCfgs, label: `Set ${o.set}` }] });
const st = res.stats;
if (!res.top.length) console.log(`No setup found${o.minsuccess ? ` with ${o.minsuccess}%+ success` : ''} - nothing to suggest`);
if (o.minsuccess) console.log(`Minimum success ${o.minsuccess}%: ${st.succCut} setups cut at the screen, ${st.dcSucc} at reds DCs, ${st.finalSuccCut} on the final`);
console.log(`Search ${((Date.now() - t1) / 1000).toFixed(0)}s (P1 ${st.t.p1.toFixed(0)}s, screen ${st.t.screen.toFixed(0)}s, ring swaps ${st.t.rings.toFixed(0)}s, `
  + `reds DCs ${st.t.dc.toFixed(0)}s, final ${st.t.final.toFixed(0)}s), ${st.raids.toLocaleString()} raids`);
console.log(`Pruning: ${st.lbSets} Lightbearer assignments, ${st.p1Charts} P1 charts (${st.p1Dropped50} dropped: someone can't make 50% by reds), `
  + `${st.setups1} chart x purple setups (${st.cut50} cut by the claw rule), ring values ${st.ringTried} tried / ${st.ringSame} same as another / `
  + `${st.ringCamp} camp-LB / ${st.ringClaw} claw rule, purple re-check ${st.purpleChanged} changed, reds DC pairs ${st.dcTried} tried / `
  + `${st.dcSame} same as another / ${st.dcClaw} claw rule / ${st.dcEquiv} same spec per player (West/East swapped), final ${st.finalClawCut} cut by the claw rule / ${st.finalSame} identical raids (simplest kept)`);

const hornText = (cf) => cf.map((c, k) => (c.horn && (c.hornP2 || c.hornP3) ? `${names[k]} ${[c.hornP2 ? 'P2' : '', c.hornP3 ? 'P3' : ''].filter(Boolean).join('+')}` : null)).filter(Boolean).join(', ') || 'none';
const who = (cf, key) => names[cf.findIndex((c) => c[key])] ?? '-';
// results table: like the Optimizer - the breakpoints and raid success; the settings are under "see setup"
const head = ['#', ...bpsFull.map((b) => `<= ${fmtS(b)}`), 'Success', ...(o.team === 2 ? ['Wipe'] : [])];
const row = (lab, c) => [lab, ...bpsFull.map((_, j) => pct(c.under[j] / c.n)), pct(c.k / c.n), ...(o.team === 2 ? [pct(c.wipe / c.n)] : [])];
let nr = 0;
const lab = res.top.map((x) => (x.asCharted ? `Your ${x.seedLabel}` : `${++nr}${x.seedLabel ? ` (${x.edited ? 'edited ' : ''}from your ${x.seedLabel})` : ''}`));
const rows = res.top.map((x, i) => row(lab[i], x.c));
const wd = head.map((h, j) => Math.max(h.length, ...rows.map((r) => r[j].length)));
const lines = [];
const out = (s) => { console.log(s); lines.push(s); };
if (res.fallback) out(`\nNo setups met ${o.minsuccess}% success rate - these are the next best options with the highest rates of success`);
out(`\nTop ${nr}${nr < res.top.length ? ' + your chart' : ''} (${o.final.toLocaleString()} full raids each)`);
out(head.map((h, j) => h.padEnd(wd[j])).join('  '));
for (const r of rows) out(r.map((c, j) => c.padEnd(wd[j])).join('  '));

// "see setup" for each: settings + P1 chart
res.top.forEach((x, i) => {
  const head1 = (`\n${lab[i]} setup: Lightbearer ${x.cfg.map((c, k) => (c.lightbearerOn ? names[k] : null)).filter(Boolean).join(', ')}`
    + ` | purple DC ${who(x.cfg, 'PurpleDC')} | reds DCs West ${who(x.cfg, 'WestDC')}, East ${who(x.cfg, 'EastDC')} | horns ${hornText(x.cfg)}`
    + ` | ring swap ${x.cfg.map((c, k) => (c.lightbearerOn ? `${names[k]} ${c.ringSwitch ?? 'default'}` : null)).filter(Boolean).join(', ')}`
    + (o.team === 2 ? ` | 2nd purple ${who(x.cfg, 'Purple2DC')} | shadow ${(() => { const m = x.cfg.find((c) => c.shadow); return m ? [m.shadowCamp && 'camp', m.shadowLB && 'while LB', m.shadow31 && '3:1'].filter(Boolean).join(' + ') || 'plain' : '-'; })()} | P2 last hit ${x.cfg[0].lastHitThr ?? '-'}%` : '') + ` | Dawn thr ${x.cfg[0].dawnThr ? `${x.cfg[0].dawnThr}%` : 'never'}`
    + ` | start spec ${x.cfg.map((c) => c.startSpec).join('/')} | room avg ${fmt(x.c.sum / x.c.k)}`);
  out(head1);
  const end = Math.min(66, x.p1.median + 2);
  lines.push('tick'.padEnd(13) + 'start' + Array.from({ length: end }, (_, t) => String(t + 1).padStart(4)).join(''));
  x.cfg.forEach((c, k) => lines.push(names[k].slice(0, 12).padEnd(13) + `${c.startSpec}%`.padStart(5)
    + Array.from({ length: end }, (_, t) => String(c.actions[t + 1] ?? '.').padStart(4)).join('') + `   ${checkRow(c.actions, c.has3Tick, o.team) || 'ok'}`));
});
const file = o.out || `solveroom-${o.team}man.txt`;
writeFileSync(file, lines.join('\n') + '\n');
console.log(`\nSetups (P1 chart, Lightbearer, purple, reds DCs, ring swap %) for all ${res.top.length}: ${file}`);
