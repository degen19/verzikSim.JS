// Solo Verzik from the command line: node cli/solo.mjs [--n=2000] [--s31=1 --camp=1 --ayak=1 --amt=70 --gb=1 --c100= --c80= --c50= --c0=] [--log --seed=x#1] [--solve]
// Test player: Torva, Ancestral, blowpipe, Tumeken's shadow, Eye of ayak.
import { run_solo } from '/root/repo/engine/solo.js';
import { simulate } from '/root/repo/engine/simulate.js';
import { Rng } from '/root/repo/engine/rng.js';
import { blankPlayer, applyToCfg } from '/root/repo/engine/loadout.js';
const g = blankPlayer(0); g.prayer = 'Zeal';
Object.assign(g.mage, { head: 'Ancestral hat', body: 'Ancestral robe top', legs: 'Ancestral robe bottom', cape: 'Imbued saradomin cape', neck: 'Occult necklace', hands: 'Confliction gauntlets', feet: 'Avernic treads (max)' });
Object.assign(g.melee, { head: 'Torva full helm', body: 'Torva platebody', legs: 'Torva platelegs' });
g.weapons.push('Toxic blowpipe', "Tumeken's shadow", 'Eye of ayak', 'Elder maul');
const base = applyToCfg({ name: 'Solo' }, g);
const arg = (k, d) => { const x = process.argv.find((a) => a.startsWith(`--${k}=`)); return x ? x.split('=')[1] : d; };
const cfg = { ...base, shadow: base.hasShadow, shadow31: arg('s31', '0') === '1', shadowCamp: arg('camp', '0') === '1', ayakP2: arg('ayak', '0') === '1', ayakAmount: Number(arg('amt', 70)), godbook: arg('gb', '0') === '1',
  commit: { c100: Number(arg('c100', 0)), c80: Number(arg('c80', 0)), c50: Number(arg('c50', 0)), c0: Number(arg('c0', 0)) } };
if (process.argv.includes('--log')) { const log = []; const r = run_solo(cfg, new Rng(arg('seed', 'x#1')), log); console.log(log.join('\n')); console.log(r.end, r.st); }
else {
  const t0 = Date.now(); const res = simulate([cfg], 1, Number(arg('n', 2000)), 'a');
  const md = (a) => { const v = a.slice().sort((x, y) => x - y); return v[v.length >> 1]; }, f = (x) => (x * 0.6).toFixed(1);
  const avg = (a) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(2);
  console.log(`${Date.now() - t0}ms succ ${(res.succ * 100).toFixed(1)}% med ${f(md(res.total))}s p1 ${f(md(res.p1))} p2 ${f(md(res.p2))} p3 ${f(md(res.p3))} | sets ${avg(res.solo.sets)} purples ${avg(res.solo.purples)} redem ${avg(res.solo.redemptions)} drained ${avg(res.solo.drained)} commit ${avg(res.solo.commit)} fix ${avg(res.solo.ayak_fix)}`);
}
if (process.argv.includes('--acc')) {
  const { Player } = await import('/root/repo/engine/sim.js'); const { scythe_roll } = await import('/root/repo/engine/p2.js');
  const p = new Player(1, cfg); p.ring = 'Ultor'; console.log('scythe', scythe_roll(p), p.helm, p.body, p.legs, p.amulet, p.prayer);
}
if (process.argv.includes('--solve')) {
  const { solveSolo, evalSolo } = await import('/root/repo/engine/solosolve.js');
  const t0 = Date.now();
  const out = await solveSolo({ start: { commit: { c100: 0, c80: 0, c50: 0, c0: 0 }, shadowMode: '31', ayak: 0, godbook: false, ringSwitch: '' }, allow: { commit: true, shadow: true, ayak: true, godbook: false, ring: false }, hasShadow: true, hasAyak: true,
    rounds: 5, stages: [[40, 0.25], [150, 3], [500, 1]], finalRaids: 800, top: 5 }, async (s, a, b, seed) => evalSolo(s, cfg, a, b, seed), (m) => process.stdout.write(`\r${m.padEnd(80)}`));
  console.log(`\n${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const r of out) { const v = r.totals.slice().sort((a, b) => a - b); console.log((v[v.length >> 1] * 0.6).toFixed(1), JSON.stringify(r.s.commit), r.s.shadowMode, r.s.ayak, (r.s.path || []).join(' > ')); }
}
