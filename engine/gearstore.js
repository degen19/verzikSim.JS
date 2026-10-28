// Gear sets (A / B / C) per scale, saved in this browser, and which Gear set each Verzik set (A / B / C) uses.
// withGear() is applied to every chart right after it is read (Run, Optimizer, Solver): the chart's own gear columns
// are replaced by the linked Gear set. A chart run before any Gear set exists seeds one from its own gear columns, so
// existing charts play exactly as before.
import { blankPlayer, fromChartCfg, applyToCfg, mergeChartValues } from './loadout.js';

export const GEAR_KEY = 'verzikSim.gear.v1';     // {team: {sets: {A: {players}, B?, C?}, link: {A, B, C}}}
export const GEAR_SETS = ['A', 'B', 'C'];
let mem = null;                                   // storage off: kept in memory for this page

export function loadGear() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(GEAR_KEY)); } catch { s = null; }
  s = s || mem || {};
  for (const t of Object.keys(s)) if (s[t] && s[t].players && !s[t].sets) s[t] = { sets: { A: { players: s[t].players } }, link: {} };   // first preview
  return s;
}
export function saveGear(s) { mem = s; try { localStorage.setItem(GEAR_KEY, JSON.stringify(s)); } catch { /* storage off */ } }

const teamOf = (s, team) => (s[team] ||= { sets: {}, link: {} });
/** The Gear set a Verzik set uses: the one picked, else the same letter if that Gear set exists, else A. */
export function linkOf(s, team, block) {
  const t = teamOf(s, team);
  const l = t.link && t.link[block];
  if (GEAR_SETS.includes(l)) return l;                 // picked (an empty one starts from the chart when it first runs)
  return t.sets[block] ? block : 'A';
}
export function setLink(team, block, letter) { const s = loadGear(); teamOf(s, team).link[block] = letter; saveGear(s); }
export function gearSet(s, team, letter) { return teamOf(s, team).sets[letter] || null; }
/** The players of a Gear set, padded / cut to the team size (blank players added). */
export function playersOf(set, team) {
  const ps = set.players.slice(0, team);
  while (ps.length < team) ps.push(blankPlayer(ps.length));
  return ps;
}

/** Chart configs with the linked Gear set's gear applied (seeding that Gear set from the chart if none exists yet). */
export function withGear(cfgs, team, block) {
  return withGearSet(cfgs, team, linkOf(loadGear(), team, block));
}
/** Chart configs with Gear set `letter` applied (seeded from the chart's own gear columns if that set is empty). */
export function withGearSet(cfgs, team, letter) {
  const s = loadGear(), t = teamOf(s, team);
  if (!t.sets[letter]) { t.sets[letter] = { players: cfgs.map((c, k) => fromChartCfg(c, k)) }; saveGear(s); }
  const ps = playersOf(t.sets[letter], team);
  const out = cfgs.map((c, k) => applyToCfg(c, ps[k]));
  if (cfgs.notes) out.notes = cfgs.notes;
  const nm = (k) => cfgs[k].name || `P${k + 1}`;
  out.forEach((c, k) => {
    if ((c.PurpleDC || c.Purple2DC) && !c.hasBP) {
      throw new Error(`A blowpipe is required to pop the purple crab. Either change the player who DC's purple, or give ${nm(k)} a blowpipe (Gear tab, Gear set ${letter})`);
    }
  });
  out.gearSet = letter;
  return out;
}

/** An imported chart's gear (parsed configs per set) copied into the Gear sets of the same letters. Returns the letters. */
export function importGear(team, bySet) {
  const s = loadGear(), t = teamOf(s, team), done = [];
  for (const [b, cfgs] of Object.entries(bySet)) {
    if (!cfgs) continue;
    t.sets[b] = { players: cfgs.map((c, k) => fromChartCfg(c, k)) };
    t.link[b] = b;
    done.push(b);
  }
  saveGear(s);
  return done;
}

/** Chart-builder values written into a Verzik set (an Optimizer / Solver result): their gear columns go to that set's
 *  Gear set, so the Gear tab doesn't override what the result changed. */
export function absorbValues(team, block, values) {
  const s = loadGear(), t = teamOf(s, team);
  const letter = linkOf(s, team, block);
  const set = t.sets[letter] || { players: [] };
  const ps = playersOf(set, team);
  t.sets[letter] = { players: ps.map((pl, k) => mergeChartValues(pl, values, k)) };
  saveGear(s);
  return letter;
}

/** How many players of Gear set `letter` bring a blowpipe (null if that Gear set doesn't exist yet). */
export function blowpipes(team, letter) {
  const set = gearSet(loadGear(), team, letter);
  return set ? playersOf(set, team).filter((p) => (p.weapons || []).includes('Toxic blowpipe')).length : null;
}

/** The gear-derived settings of each player for a Verzik set ({has3Tick, hasBP, ...}), or null if its Gear set doesn't
 *  exist yet (then the chart's own columns still count). */
export function gearOfSet(team, block) {
  const s = loadGear(), letter = linkOf(s, team, block), set = gearSet(s, team, letter);
  return set ? playersOf(set, team).map((p) => applyToCfg({}, p)) : null;
}
