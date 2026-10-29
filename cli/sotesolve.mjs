// Sotetseg Solver from the command line (single thread): node cli/sotesolve.mjs [team] [--bps=1:20,1:25] [--rounds=4] [--quick]
// Players: the default setup (as cli/sote.mjs), every weapon, a Soulflame horn for player 1.
import { solveSote, evalConfigs } from '../engine/sotesolve.js';
import { defaultSetup, defaultSpecs, defaultMazes } from '../engine/sote.js';
import { blankPlayer } from '../engine/loadout.js';
import { parseBreakpoints } from '../engine/optimize.js';

const team = Number(process.argv[2] || 5);
const arg = (k) => (process.argv.find((x) => x.startsWith(`--${k}=`)) || '').split('=')[1];
const bps = arg('bps') ? parseBreakpoints(arg('bps')) : [];
const quick = process.argv.includes('--quick');
const gear = Array.from({ length: team }, (_, k) => {
  const g = blankPlayer(k); g.prayer = 'Zeal'; g.horn = k === 0;
  Object.assign(g.range, { cape: "Blessed dizana's quiver", neck: 'Necklace of rupture', body: 'Masori body (f)', legs: 'Masori chaps (f)', head: 'Masori mask (f)', hands: 'Zaryte vambraces' });
  g.weapons.push('Elder maul', 'Twisted bow', 'Zaryte crossbow');
  return g;
});
const su = defaultSetup(team), sp = defaultSpecs(team);
const base = gear.map((g, k) => ({ name: `P${k + 1}`, gear: g, pnecks: 2, sharks: 4, rests: 0, restores: 3, mazes: defaultMazes(2, false, team) }));
const start = { entry: 0, players: su.map((x, k) => ({ prefire: x.prefire, startSpec: x.startSpec, surge: x.surge, lbCycles: 0, specs: sp[k] })) };
const run = async (configs, from, to, seed, entry) => evalConfigs(configs, base, team, from, to, seed, entry);
const t0 = Date.now();
const out = await solveSote({ team, base, start, gear, allow: { prefire: true, start: true, surge: true, lb: true, specs: true }, surgeLimit: team, lbRings: team,
  bps, solveEntry: true, rounds: Number(arg('rounds') || 4), stages: quick ? [[30, 0.15], [120, 3], [400, 1]] : undefined, finalRaids: quick ? 600 : 2000, top: 5 },
run, (s) => process.stdout.write(`\r${s.padEnd(90)}`));
const f = (t) => { const s = t * 0.6; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const [i, r] of out.entries()) {
  const v = r.totals.slice().sort((a, b) => a - b);
  console.log(`#${i + 1} entry i${r.entry} median ${f(v[v.length >> 1])} top10 ${f(v[Math.floor(v.length * 0.1) - 1])}${bps.length ? ' | ' + bps.map((b) => `${(v.filter((x) => x * 0.6 <= b).length / v.length * 100).toFixed(1)}%`).join(' ') : ''}`);
  r.cfg.players.forEach((p, k) => console.log(`   P${k + 1}: ${p.prefire || 'no prefire'}, ${p.startSpec}%, ${p.surge ? 'surge' : 'no surge'}, LB ${p.lbCycles} | ${p.specs.map((s, ph) => `P${ph + 1} ${s.horn ? 'horn+' : ''}${s.backup ? 'backup ' : ''}${s.spec}`).join(', ')}`));
}
