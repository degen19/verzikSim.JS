// Port of gear.py - item registry (OSRS Wiki stats) and magic attack helpers.
//
// Each item: atk / dfn = (stab, slash, crush, magic, ranged); str, rstr = melee / ranged strength;
// mdmg = magic damage %; pray = prayer bonus; slot; two_handed for weapons.
import { floordiv } from './util.js';
import { hit_chance } from './sim.js';

/** Python item(slot, atk=..., dfn=..., str=0, rstr=0, mdmg=0, pray=0, **kw) -> item(slot, atk, dfn, { str, rstr, mdmg, pray, ...kw }) */
export function item(slot, atk = [0, 0, 0, 0, 0], dfn = [0, 0, 0, 0, 0], kw = {}) {
  const { str = 0, rstr = 0, mdmg = 0, pray = 0, ...rest } = kw;
  const d = { slot, atk, dfn, str, rstr, mdmg, pray };
  Object.assign(d, rest);
  return d;
}

export const ITEMS = {
  // ---- melee armour (already in the sim)
  'Torva full helm':  item('head', [0, 0, 0, -5, -5], [59, 60, 62, -2, 57], { str: 8, pray: 1 }),
  'Torva platebody':  item('body', [0, 0, 0, -18, -14], [117, 111, 117, -11, 142], { str: 6, pray: 1 }),
  'Torva platelegs':  item('legs', [0, 0, 0, -24, -11], [87, 78, 79, -9, 102], { str: 4, pray: 1 }),
  'Oathplate helm':   item('head', [0, 10, 0, -2, -7], [50, 72, 45, 0, 50], { str: 6 }),
  'Oathplate chest':  item('body', [0, 16, 0, -16, -18], [105, 128, 100, -5, 112], { str: 4 }),
  'Oathplate legs':   item('legs', [0, 12, 0, -12, -14], [75, 100, 73, -3, 81], { str: 2 }),
  'Ferocious gloves': item('hands', [16, 16, 16, -16, -16], undefined, { str: 14 }),
  'Infernal cape':    item('cape', [4, 4, 4, 1, 1], [12, 12, 12, 12, 12], { str: 8, pray: 2 }),
  'Amulet of rancour': item('neck', [25, 25, 25, -6, -8], undefined, { str: 12, pray: 2 }),
  'Amulet of blood fury': item('neck', [10, 10, 10, 10, 10], [15, 15, 15, 15, 15], { str: 8, pray: 5 }),
  'Ultor ring':       item('ring', undefined, undefined, { str: 12 }),
  'Lightbearer':      item('ring'),
  // ---- shared
  'Avernic treads (max)': item('feet', [5, 5, 5, 11, 15], [21, 25, 25, 10, 10], { str: 6, rstr: 3, mdmg: 2 }),
  'Confliction gauntlets': item('hands', [0, 0, 0, 20, -4], [15, 18, 7, 5, 5], { mdmg: 7, pray: 2 }),
  // ---- mage armour
  'Ancestral hat':        item('head', [0, 0, 0, 8, -2], [12, 11, 13, 5, 0], { mdmg: 3 }),
  'Ancestral robe top':   item('body', [0, 0, 0, 35, -8], [42, 31, 51, 28, 0], { mdmg: 3 }),
  'Ancestral robe bottom': item('legs', [0, 0, 0, 26, -7], [27, 24, 30, 20, 0], { mdmg: 3 }),
  // Virtus: 2% each; with Ancient Magicks combat spells +3% more per piece (not used for powered staves)
  'Virtus mask':          item('head', [0, 0, 0, 8, -3], [15, 14, 16, 6, 0], { mdmg: 2, ancients_mdmg: 3 }),
  'Virtus robe top':      item('body', [0, 0, 0, 35, -11], [47, 36, 56, 31, 0], { mdmg: 2, ancients_mdmg: 3 }),
  'Virtus robe bottom':   item('legs', [0, 0, 0, 26, -9], [31, 28, 34, 22, 0], { mdmg: 2, ancients_mdmg: 3 }),
  'Occult necklace':      item('neck', [0, 0, 0, 12, 0], undefined, { mdmg: 5, pray: 2 }),
  'Imbued saradomin cape': item('cape', [0, 0, 0, 15, 0], [3, 3, 3, 15, 0], { mdmg: 2 }),
  'Magus ring':           item('ring', [0, 0, 0, 15, 0], undefined, { mdmg: 2 }),
  "Elidinis' ward (f)":   item('shield', [0, 0, 0, 25, 0], [53, 55, 73, 2, 52], { mdmg: 5, pray: 4 }),
  // ---- weapons
  "Tumeken's shadow":     item('weapon', [0, 0, 0, 35, 0], [0, 0, 0, 20, 0], { pray: 1, speed: 5, two_handed: true,
                                 spell: 'shadow' }),
};

export const MAGE_SET = ['Ancestral hat', 'Ancestral robe top', 'Ancestral robe bottom', 'Occult necklace',
  'Imbued saradomin cape', 'Confliction gauntlets', 'Avernic treads (max)'];


export function totals(names) {
  const t = { atk: [0, 0, 0, 0, 0], dfn: [0, 0, 0, 0, 0], str: 0, rstr: 0, mdmg: 0, pray: 0 };
  for (const n of names) {
    const it = ITEMS[n];
    if (it === undefined) throw new Error(`KeyError: ${n}`);
    for (let i = 0; i < 5; i++) {
      t.atk[i] += it.atk[i]; t.dfn[i] += it.dfn[i];
    }
    for (const k of ['str', 'rstr', 'mdmg', 'pray']) t[k] += it[k];
  }
  return t;
}


/** Tumeken's shadow: max floor(magic/3)+1; worn magic attack and magic damage x3 (x4 in ToA),
 * damage capped at +100%. Augury: accuracy x1.25, +4% damage (not multiplied).
 * Returns [attack_roll, max_hit] or [attack_roll, max_hit, hit_chance] when def_roll is given. */
export function shadow_attack(gear, magic_level, opts = {}) {
  const { prayer = 'Augury', in_toa = false, def_roll = null, stance = 3 } = opts;
  const t = totals([...gear, "Tumeken's shadow"]);
  const mult = in_toa ? 4 : 3;
  const atk_bonus = t.atk[3] * mult;                      // all worn magic attack (staff included), negatives too
  const [pa, pdmg] = prayer === 'Augury' ? [1.25, 4] : [1.0, 0];
  const eff = Math.floor(magic_level * pa) + 8 + stance;  // accurate stance +3 (spec formula)
  const roll = eff * (atk_bonus + 64);
  const base = floordiv(magic_level, 3) + 1;
  const dmg_pct = Math.min(100, t.mdmg * mult);
  const mx = floordiv(base * (100 + dmg_pct + pdmg), 100);
  if (def_roll == null) return [roll, mx];
  return [roll, mx, hit_chance(roll, def_roll)];
}
