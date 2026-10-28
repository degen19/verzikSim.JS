// Sotetseg spec planner: a fixed (no randomness) projection of each player's spec through the room - when each of their
// planned specs can go off and how much spec they have - from their start spec, Lightbearer cycles, surge and specs,
// on a set of phase times (typical ones for the scale, or the medians of a report). Like the Verzik chart's planner:
// it shows when a spec would come late (waiting for a regen) or not at all.
import { SPEC_COST, HORN_TICK, SURGE } from './sote.js';

/** Typical phase times (ticks; medians of the default setup, everyone stalling, entry i0). */
export const TYPICAL_TIMES = {
  5: { p1: 37, maze1: 15, p2: 35, maze2: 15, p3: 37 },
  4: { p1: 40, maze1: 15, p2: 37, maze2: 15, p3: 41 },
  3: { p1: 48, maze1: 16, p2: 43, maze2: 16, p3: 48 },
  2: { p1: 68, maze1: 16, p2: 68, maze2: 16, p3: 72 },
};
const FIRST_SWING = 11;                       // phase 1: first attack after the prefire

/** Phase windows: [first attack tick, last tick] for P1-P3 and the room's end. */
export function phaseWindows(tm) {
  const b1 = tm.p1 + tm.maze1, s2 = b1 + 1, b2 = b1 + tm.p2 + tm.maze2, s3 = b2 + 1, end = b2 + tm.p3;
  return { win: [[FIRST_SWING, tm.p1], [s2, b1 + tm.p2], [s3, end]], end };
}

/**
 * Project one player: {startSpec, surge, lbCycles, specs: [P1, P2, P3]} on phase times `tm`. Each planned spec goes off
 * at its earliest tick (phase 1 mauls / ZCB / claws on t11 and a horn on t8; phases 2-3 on their first attack - with a
 * horn in the phase, after one scythe; a backup after one scythe, only if needed) or as soon as they have the spec,
 * before the phase ends. Returns {items: [{ph, kind, backup, earliest, at (tick or null: not enough spec)}], endSpec,
 * regens: [ticks], cost, available}.
 */
export function projectPlayer(pl, tm) {
  const { win, end } = phaseWindows(tm);
  const specs = pl.specs || [];
  const items = [];
  for (let ph = 0; ph < 3; ph++) {
    const sp = specs[ph] || {}, [s] = win[ph];
    if (sp.horn) items.push({ ph, kind: 'horn', backup: false, earliest: ph === 0 ? HORN_TICK : s + 5 });
    if (sp.spec && sp.spec !== 'none') {
      const late = sp.backup || (ph > 0 && sp.horn);
      items.push({ ph, kind: sp.backup && sp.spec === 'maul' ? 'maul' : sp.spec, backup: !!sp.backup, earliest: late ? s + 5 : s });
    }
  }
  let spec = Number(pl.startSpec ?? 100), hold = spec < 100, timer = 0, lbLeft = Number(pl.lbCycles || 0), surged = !pl.surge;
  const regens = [];
  let cost = 0, gained = 0;
  for (let t = 1; t <= end; t++) {
    for (const it of items) {
      if (it.at !== undefined || t < it.earliest) continue;
      const c = SPEC_COST[it.kind] || 50;
      if (t > win[it.ph][1]) { it.at = null; continue; }            // the phase is over: not enough spec
      if (spec < c) continue;
      spec -= c; cost += c; it.at = t;
      if (hold) { hold = false; timer = 49; }                        // 95% start: the first regen the tick after the first spec
      if (!surged) { surged = true; const o = spec; spec = Math.min(100, spec + SURGE); gained += spec - o; it.surge = true; }
    }
    if (!hold && spec < 100) {
      if (++timer >= (lbLeft > 0 ? 25 : 50)) { timer = 0; const o = spec; spec = Math.min(100, spec + 10); gained += spec - o; regens.push(t); if (lbLeft > 0) lbLeft--; }
    } else if (!hold) timer = 0;
  }
  for (const it of items) if (it.at === undefined) it.at = null;
  return { items, endSpec: spec, regens, cost, available: Number(pl.startSpec ?? 100) + gained };
}
