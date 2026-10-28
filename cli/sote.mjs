// Sotetseg phase 1 from the command line: node cli/sote.mjs [team] [raids] [prefire] [--log]
// Players: default gear (Torva / Oathplate melee) plus Masori + quiver + rupture for ranged and Ancestral for magic,
// every weapon, all prefiring the same (default Twisted bow).
import { runSotePhase1, runSote, SOTE_HP } from '../engine/sote.js';
import { blankPlayer } from '../engine/loadout.js';
import { Rng } from '../engine/rng.js';

const a = process.argv.slice(2).filter((x) => x !== '--log');
const team = Number(a[0] || 5), N = Number(a[1] || 2000), prefire = a[2] ?? 'Twisted bow', showLog = process.argv.includes('--log');
const players = Array.from({ length: team }, (_, k) => {
  const g = blankPlayer(k);
  Object.assign(g.range, { cape: "Blessed dizana's quiver", neck: 'Necklace of rupture', body: 'Masori body (f)', legs: 'Masori chaps (f)', head: 'Masori mask (f)', hands: 'Zaryte vambraces' });
  Object.assign(g.mage, { head: 'Ancestral hat', body: 'Ancestral robe top', legs: 'Ancestral robe bottom', neck: 'Occult necklace', hands: 'Confliction gauntlets', cape: 'Imbued saradomin cape' });
  g.weapons.push('Twisted bow', 'Zaryte crossbow', "Tumeken's shadow", 'Shadow ancient sceptre');
  return { name: `P${k + 1}`, gear: g, prefire };
});
if (showLog) { const log = []; runSotePhase1(players, team, new Rng('sote#0'), log); console.log(log.join('\n')); }
const mazes = [], tot = { prefire: 0, scythe: 0, veng: 0, ruby: 0 }, orb = { taken: 0, prayed: 0, vengd: 0 };
let melees = 0, lowHp = 0;
for (let i = 0; i < N; i++) {
  const r = runSotePhase1(players, team, new Rng(`sote#${i}`));
  mazes.push(r.maze ?? 999); for (const k in tot) tot[k] += r.dmg[k]; for (const k in orb) orb[k] += r.orbs[k]; melees += r.melees;
  lowHp += r.players.filter((p) => p.hp < 50).length;
}
mazes.sort((x, y) => x - y);
const q = (f) => mazes[Math.floor(N * f)];
const by = {}; mazes.forEach((m) => { by[m] = (by[m] || 0) + 1; });
console.log(`${team}-man, ${SOTE_HP[team]} HP, prefire ${prefire || 'none'}: first maze tick  10% ${q(0.1)} | median ${q(0.5)} | 90% ${q(0.9)} | fastest ${mazes[0]}`);
console.log(`  most common: ${Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([t, n]) => `t${t} ${(n / N * 100).toFixed(1)}%`).join(', ')}`);
const D = Object.values(tot).reduce((x, y) => x + y, 0);
console.log(`  damage share: ${Object.entries(tot).map(([k, v]) => `${k} ${(v / D * 100).toFixed(1)}%`).join(', ')} | per raid: orbs taken ${(orb.taken / N).toFixed(2)} (veng'd ${(orb.vengd / N).toFixed(2)}), prayed ${(orb.prayed / N).toFixed(2)}, melees ${(melees / N).toFixed(2)}, players under 50 HP ${(lowHp / N).toFixed(2)}`);

// ---- the whole room (--full): node cli/sote.mjs 5 2000 "Twisted bow" --full [--log]  (2 phoenix necklaces each)
if (process.argv.includes('--full')) {
  const full = players.map((p) => ({ ...p, pnecks: 2 }));
  if (showLog) { const log = []; runSote(full, team, new Rng('full#0'), log); console.log('\n--- full raid log ---\n' + log.filter((l) => /MAZE|under|stall|DIES|overkill|necklace|dies|^t(3[5-9]|4\d|5[0-9]) /.test(l)).join('\n')); }
  const ends = [], m1 = [], m2 = []; let deaths = 0, pn = 0, fails = 0, stallDeaths = 0;
  for (let i = 0; i < N; i++) {
    const r = runSote(full, team, new Rng(`full#${i}`));
    if (r.end == null) { fails++; continue; }
    ends.push(r.end); m1.push(r.mazes[0]); m2.push(r.mazes[1]);
    deaths += r.players.filter((p) => p.dead).length; pn += r.players.reduce((a, p) => a + (2 - p.pnecks), 0);
    stallDeaths += r.stalls.filter((x) => x.dead).length;
  }
  const s = (a) => a.sort((x, y) => x - y), qq = (a, f) => a[Math.floor(a.length * f)];
  s(ends); s(m1); s(m2);
  const mmss = (t) => { const sec = t * 0.6; return `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, '0')}`; };
  console.log(`FULL ${team}-man: room time 10% ${mmss(qq(ends, 0.1))} | median ${mmss(qq(ends, 0.5))} | 90% ${mmss(qq(ends, 0.9))} | fastest ${mmss(ends[0])} (t${ends[0]})`);
  console.log(`  maze 1 median t${qq(m1, 0.5)}, maze 2 median t${qq(m2, 0.5)} | per raid: player deaths ${(deaths / ends.length).toFixed(2)} (in stalls ${(stallDeaths / ends.length).toFixed(2)}), phoenix necklaces used ${(pn / ends.length).toFixed(2)}${fails ? ` | ${fails} raids didn't finish` : ''}`);
}
