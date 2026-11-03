// Expected damage (mean and variance) of a player's attack, from its accuracy and max hit(s), for the Show raid
// timeline's Expected / Cumulative damage and the raid's average hits and their percentiles. Every helper returns
// [mean, variance] and draws no random numbers (the sims' results are unchanged).
//
// A hitsplat that passes accuracy rolls max(1, 0..max) (OSRS: a hit that lands deals at least 1); P1 Verzik's damage
// cap: the hit is then min(hit, 0..cap).

/** E[X], E[X^2] of max(1, uniform 0..m) (+ bonus on every landed hit). */
function landed(m, bonus = 0) {
  m = Math.max(0, Math.floor(m));
  let s = 0, s2 = 0;
  for (let x = 0; x <= m; x++) { const v = Math.max(1, x) + bonus; s += v; s2 += v * v; }
  return [s / (m + 1), s2 / (m + 1)];
}
/** One hitsplat: lands with chance ch. opts: cap (P1: min(hit, 0..cap)), bonus (added to a landed hit). */
export function hitMV(ch, m, { cap = null, bonus = 0 } = {}) {
  ch = Math.max(0, Math.min(1, ch));
  let e, e2;
  if (cap == null) [e, e2] = landed(m, bonus);
  else {                                                            // min(x, y), y uniform 0..cap
    m = Math.max(0, Math.floor(m)); e = 0; e2 = 0;
    for (let x = 0; x <= m; x++) {
      const v = Math.max(1, x) + bonus;
      for (let y = 0; y <= cap; y++) { const z = Math.min(v, y); e += z; e2 += z * z; }
    }
    e /= (m + 1) * (cap + 1); e2 /= (m + 1) * (cap + 1);
  }
  const mean = ch * e;
  return [mean, ch * e2 - mean * mean];
}
/** Independent parts added up. */
export const sumMV = (...parts) => parts.reduce(([m, v], [a, b]) => [m + a, v + b], [0, 0]);
/** Scythe: 3 hitsplats (max, max/2, max/4), each its own accuracy roll; buffed: the first can't miss (Soulflame horn). */
export const scytheMV = (ch, mx, { buffed = false, cap = null } = {}) =>
  sumMV(hitMV(buffed ? 1 : ch, mx, { cap }), hitMV(ch, Math.floor(mx / 2), { cap }), hitMV(ch, Math.floor(mx / 4), { cap }));
/** Several hitsplats with their own maxes and one accuracy (P1's roll_attack). */
export const splatsMV = (ch, maxes, cap = null) => sumMV(...maxes.map((m) => hitMV(ch, m, { cap })));
/** Dragon claws (Slice and Dice): the 4-roll cascade; horned: the second roll can't miss. */
export function clawMV(ch, mx, { horned = false } = {}) {
  const out = [];                                                   // [probability, total]
  const span = (p, a, b, f) => { if (b < a) { out.push([p, f(a)]); return; } for (let x = a; x <= b; x++) out.push([p / (b - a + 1), f(x)]); };
  const fl = Math.floor, p0 = ch, p1 = horned ? 1 - ch : (1 - ch) * ch, p2 = horned ? 0 : (1 - ch) ** 2 * ch, p3 = horned ? 0 : (1 - ch) ** 3 * ch;
  span(p0, fl(mx / 2), mx - 1, (x) => x + fl(x / 2) + 2 * fl(x / 4) + 1);
  span(p1, fl(3 * mx / 8), fl(7 * mx / 8), (x) => x + 2 * fl(x / 2) + 1);
  if (p2) span(p2, fl(mx / 4), fl(3 * mx / 4), (x) => 2 * x + 1);
  if (p3) span(p3, fl(mx / 4), fl(5 * mx / 4), (x) => x);
  const pf = horned ? 0 : (1 - ch) ** 4; out.push([pf * 2 / 3, 2]);   // all four miss: 1 + 1 two times in three
  const e = out.reduce((s, [p, v]) => s + p * v, 0), e2 = out.reduce((s, [p, v]) => s + p * v * v, 0);
  return [e, e2 - e * e];
}
/** Crystal halberd spec: two hits (accuracy ch1, ch2), each landed hit max(1, 0..m) + m/10. */
export const halbMV = (ch1, ch2, m) => sumMV(hitMV(ch1, m, { bonus: Math.floor(m / 10) }), hitMV(ch2, m, { bonus: Math.floor(m / 10) }));
/** Dawnbringer spec: 75..150, always hits. */
export const DAWN_SPEC_MV = [112.5, (76 * 76 - 1) / 12];
/** A fixed amount with chance p (a ZCB spec's ruby bolt). */
export const constMV = (p, val) => [p * val, p * val * val - (p * val) ** 2];
/** A ruby bolt (e) auto: a ruby proc (chance pr, ignores accuracy) for `ruby`, else a normal hit. */
export function rubyAutoMV(pr, ruby, ch, mx) {
  const [a, b] = landed(mx), m = pr * ruby + (1 - pr) * ch * a, e2 = pr * ruby * ruby + (1 - pr) * ch * b;
  return [m, e2 - m * m];
}
/** The log text the Verzik Show raid reads back: 'exp mean/variance'. */
export const expText = ([m, v]) => `exp ${m.toFixed(2)}/${Math.max(0, v).toFixed(2)}`;
