// Sense checks shared by the room solvers' last step: nothing in a setup should be there for nothing.

/** Paired change in mean (ticks) from a to b on the same raids, and its 95% range. */
export function paired(a, b) {
  const d = b.map((x, i) => x - a[i]), n = d.length, m = d.reduce((x, y) => x + y, 0) / n;
  const sd = Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, n - 1));
  return { d: m, ci: 1.96 * sd / Math.sqrt(n) };
}

/** A surge has to save at least this much on average (ticks; a third of a tick, 0.2s) to be kept. */
export const SURGE_WORTH = 1 / 3;

/** Surges that pay for nothing come out: each surging player's surge, dropped on the same raids, stays out unless the
 *  setup is clearly worse without it, by SURGE_WORTH at least (a surge is a dose and a cooldown later rooms could use). cur: {cfg, totals, score};
 *  play(cfg) -> Promise<{totals, ...}>; scoreOf(totals) -> score; fix(cfg, k) -> the setup as they'd play it without
 *  the surge (null: skip). Returns the setup with them out (or cur). */
export async function pruneSurges(cur, play, scoreOf, fix = (c) => c, stopped = () => false) {
  for (let k = 0; k < cur.cfg.players.length && !stopped(); k++) {
    if (!cur.cfg.players[k].surge) continue;
    // without it - and without the spec(s) it pays for, if they can't afford them then (fix)
    const cfg = fix({ ...cur.cfg, players: cur.cfg.players.map((p, j) => (j === k ? { ...p, surge: false } : p)) }, k);
    if (!cfg) continue;
    const r = await play(cfg), ch = paired(cur.totals, r.totals);
    // out unless it's clearly worth it: clearly faster with it, and by SURGE_WORTH ticks on average at least
    if (ch.d < ch.ci || ch.d < SURGE_WORTH) cur = { ...cur, ...r, cfg, score: scoreOf(r.totals) };
  }
  return cur;
}
