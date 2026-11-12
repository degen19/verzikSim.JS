// Interchangeable players: two players who are the same in every input (gear, cooldown, the room's settings for them)
// play the same with their plans traded. Used to solve a room once for every arrangement of their surges (relabel the
// solved setup), and to skip search steps that only trade their plans. No DOM here.

/** Every permutation that only moves players within their groups (groups: a group id per player). perm[k] = the old
 *  index whose plan player k takes. Capped (5 identical players: 120). */
export function groupPerms(groups, cap = 120) {
  const n = groups.length; let out = [Array.from({ length: n }, (_, k) => k)];
  const ids = [...new Set(groups)];
  for (const g of ids) {
    const mem = groups.map((x, k) => (x === g ? k : -1)).filter((k) => k >= 0);
    if (mem.length < 2) continue;
    const ps = perms(mem), next = [];
    for (const base of out) for (const p of ps) { const q = base.slice(); mem.forEach((k, i) => { q[k] = base[p[i]]; }); next.push(q); if (next.length >= cap) break; }
    out = next;
  }
  return out;
}
function perms(a) { if (a.length <= 1) return [a.slice()]; const out = []; a.forEach((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).forEach((r) => out.push([x, ...r]))); return out; }
const invOf = (perm) => { const inv = []; perm.forEach((o, k) => { inv[o] = k; }); return inv; };
const isId = (perm) => perm.every((o, k) => o === k);

/** A room's solved setup (as the Full raid plays it) with the players' plans moved: player k gets player perm[k]'s.
 *  Fixed per player (names, gear, cooldowns) stays put; the references to a player by position move with them. */
export function relabelSetup(kind, setup, perm) {
  if (!setup || isId(perm)) return setup;
  const inv = invOf(perm);
  if (kind === 'verzik') return { ...setup, cfgs: perm.map((o, k) => ({ ...setup.cfgs[o], name: setup.cfgs[k].name })) };
  if (kind === 'nylo') {
    const b = setup.opts && setup.opts.plans && setup.opts.plans.backup;
    return { ...setup, players: setup.players.map((p, k) => ({ ...p, plan: setup.players[perm[k]].plan })),
      opts: b ? { ...setup.opts, plans: { ...setup.opts.plans, backup: { ...b, p: inv[b.p] } } } : setup.opts,
      thr: setup.thr ? relabelThr(setup.thr, inv) : setup.thr };
  }
  // Sotetseg / Xarpus: each player's whole entry moves (their name stays)
  const players = setup.players.map((p, k) => ({ ...setup.players[perm[k]], name: p.name }));
  if (kind === 'xarpus') return { ...setup, players, opts: setup.opts ? relabelXOpts(setup.opts, perm, inv) : setup.opts };
  return { ...setup, players };
}
const relabelThr = (thr, inv) => thr.map((r) => ({ ...r, p: inv[r.p] })).sort((a, b) => a.p - b.p);
function relabelXOpts(o, perm, inv) {
  const x = { ...o };
  if (o.remaul) x.remaul = Object.fromEntries(Object.entries(o.remaul).map(([n, ks]) => [n, (ks || []).map((k) => inv[k]).sort((a, b) => a - b)]));
  if (Array.isArray(o.backups)) x.backups = o.backups.map((b) => ({ ...b, p: inv[Number(b.p)] }));
  if (Array.isArray(o.players)) x.players = perm.map((j) => o.players[j]);
  return x;
}

/** A room solver's own setup (cfg) with the players' plans moved, as relabelSetup. */
export function relabelCfg(kind, cfg, perm) {
  if (!cfg || isId(perm)) return cfg;
  const inv = invOf(perm), players = perm.map((j) => cfg.players[j]);
  if (kind === 'nylo') return { ...cfg, players, backup: cfg.backup ? { ...cfg.backup, p: inv[cfg.backup.p] } : cfg.backup, ...(cfg.thr ? { thr: relabelThr(cfg.thr, inv) } : {}) };
  if (kind === 'xarpus') return { ...relabelXOpts(cfg, perm, inv), players };
  return { ...cfg, players };
}

/** A key that's the same for every arrangement of interchangeable players' plans (the smallest of their keys). */
export function canonKeyOf(kind, keyOf, groups) {
  const ps = groupPerms(groups);
  if (ps.length < 2) return keyOf;
  return (cfg) => { let best = null; for (const p of ps) { const k = keyOf(relabelCfg(kind, cfg, p)); if (best === null || k < best) best = k; } return best; };
}

/** Cooldowns in the same order within each group (smallest first, by position) and the permutation back:
 *  -> {cd (canonical), perm (player k plays the canonical solve's player perm[k])}. */
export function canonCd(cd, groups) {
  const c = cd.slice(), perm = cd.map((_, k) => k);
  for (const g of [...new Set(groups)]) {
    const mem = groups.map((x, k) => (x === g ? k : -1)).filter((k) => k >= 0);
    if (mem.length < 2) continue;
    const order = mem.slice().sort((a, b) => cd[a] - cd[b] || a - b);   // order[i]: the player whose value goes to mem[i]
    order.forEach((src, i) => { c[mem[i]] = cd[src]; perm[src] = mem[i]; });
  }
  return { cd: c, perm };
}

/** Group ids from per-player signatures (players with the same signature share an id). */
export const groupsOf = (sigs) => sigs.map((s) => sigs.indexOf(s));
