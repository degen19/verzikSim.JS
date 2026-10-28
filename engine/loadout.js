// Gear config: what each player wears for melee, ranged and magic, slot by slot, and which weapons they bring.
//
// Melee: an item per slot (or empty). Ranged / Magic: per slot an item, 'takeoff' (the slot is emptied for that style),
// or 'none' (no switch for that slot). 'none' falls back to:
//   - the other style's item for that slot, when the other style has one (it has fewer negatives than melee gear),
//   - otherwise the melee item.
// A two-handed weapon (Tumeken's shadow, Zorya's tome, Twisted bow, blowpipe) leaves the shield slot empty.
// P1 tick fixes (blowpipe, Sang, Eye of ayak, 3-tick hits) are made in melee gear; only duo Dawn autos use the mage setup.
import { ITEMS } from './gear.js';

export const SLOTS = [
  ['head', 'Head'], ['cape', 'Cape'], ['neck', 'Neck'], ['body', 'Body'], ['legs', 'Legs'],
  ['hands', 'Hands'], ['feet', 'Feet'], ['ring', 'Ring'], ['shield', 'Shield'],
];
export const STYLES = [['melee', 'Melee'], ['range', 'Ranged'], ['mage', 'Magic']];

/** The items each style can pick per slot (the registry has the stats). */
export const CHOICES = {
  melee: {
    head: ['Torva full helm', 'Oathplate helm'], cape: ['Infernal cape'], neck: ['Amulet of rancour', 'Amulet of blood fury'],
    body: ['Torva platebody', 'Oathplate chest'], legs: ['Torva platelegs', 'Oathplate legs'], hands: ['Ferocious gloves'],
    feet: ['Avernic treads (max)'], ring: ['Ultor ring', 'Lightbearer'], shield: [],
  },
  range: {
    head: ['Masori mask (f)', 'Void ranger helm'], cape: ["Blessed dizana's quiver"], neck: ['Necklace of rupture', 'Necklace of anguish'],
    body: ['Masori body (f)', 'Elite void top'], legs: ['Masori chaps (f)', 'Elite void robe'], hands: ['Zaryte vambraces', 'Void knight gloves'],
    feet: ['Avernic treads (max)'], ring: ['Venator ring', 'Lightbearer'], shield: [],
  },
  mage: {
    head: ['Ancestral hat', 'Virtus mask'], cape: ['Imbued saradomin cape'], neck: ['Occult necklace'],
    body: ['Ancestral robe top', 'Virtus robe top'], legs: ['Ancestral robe bottom', 'Virtus robe bottom'], hands: ['Confliction gauntlets'],
    feet: ['Avernic treads (max)'], ring: ['Magus ring', 'Lightbearer'], shield: ["Elidinis' ward (f)", 'Book of the dead'],
  },
};

/** Weapons a player can bring, by style. Dawnbringer is the team's (passed around), not listed. */
export const WEAPONS_OWNED = {
  melee: ['Scythe of vitur', 'Dragon claws', 'Sulphur blades', 'Obligator', 'Swift blade'],
  range: ['Toxic blowpipe', 'Zaryte crossbow', 'Twisted bow'],
  mage: ["Tumeken's shadow", "Zorya's tome", 'Eye of ayak', 'Sanguinesti staff', 'Smoke ancient sceptre'],
};
export const ARROWS = ['Dragon arrow', 'Seeking dragon arrow'];
export const BOLTS = ['Ruby dragon bolts (e)'];
/** 3-tick weapon: the first of these the player has. */
export const THREE_TICK_PRIORITY = ['Obligator', 'Eye of ayak', "Zorya's tome"];

export const isTwoHanded = (w) => !!(ITEMS[w] && ITEMS[w].two_handed);

/** A blank player: Torva / Oathplate melee (the sim's defaults), no ranged or magic switches, scythe + claws + blowpipe. */
export function blankPlayer(i) {
  const slots = (style, f) => Object.fromEntries(SLOTS.map(([s]) => [s, f(style, s)]));
  return {
    name: `Player ${i + 1}`,
    melee: { head: 'Torva full helm', cape: 'Infernal cape', neck: 'Amulet of rancour', body: 'Oathplate chest', legs: 'Oathplate legs',
      hands: 'Ferocious gloves', feet: 'Avernic treads (max)', ring: 'Ultor ring', shield: '' },
    range: slots('range', () => 'none'),
    mage: slots('mage', () => 'none'),
    weapons: ['Scythe of vitur', 'Dragon claws', 'Toxic blowpipe'],
    arrows: 'Dragon arrow', bolts: 'Ruby dragon bolts (e)',
  };
}

const isItem = (v) => !!v && v !== 'none' && v !== 'takeoff';

/** What the player wears in one slot for a style ('' = nothing). */
export function slotItem(pl, style, slot) {
  if (style === 'melee') return pl.melee[slot] || '';
  const own = pl[style][slot];
  if (own === 'takeoff') return '';
  if (isItem(own)) return own;
  const other = pl[style === 'range' ? 'mage' : 'range'][slot];   // 'none': the other style's item, else melee
  if (isItem(other)) return other;
  return pl.melee[slot] || '';
}

/** Everything worn for a style with a weapon: {slot: item} (shield emptied for a two-handed weapon), plus the weapon. */
export function worn(pl, style, weapon = null) {
  const out = {};
  for (const [s] of SLOTS) out[s] = slotItem(pl, style, s);
  if (weapon && isTwoHanded(weapon)) out.shield = '';
  if (weapon) out.weapon = weapon;
  if (style === 'range' && weapon && ITEMS[weapon]) {
    if (ITEMS[weapon].bow) out.ammo = pl.arrows || 'Dragon arrow';
    else if (ITEMS[weapon].crossbow) out.ammo = pl.bolts || 'Ruby dragon bolts (e)';
  }
  return out;
}

/** Summed bonuses of a worn set: {atk[5], dfn[5], str, rstr, mdmg, pray, eliteVoid}. Quiver adds its +10 / +1 with
 *  arrows or bolts; seeking dragon arrows give their +20 ranged attack with bows only. */
export function bonuses(set) {
  const t = { atk: [0, 0, 0, 0, 0], dfn: [0, 0, 0, 0, 0], str: 0, rstr: 0, mdmg: 0, pray: 0 };
  const names = Object.values(set).filter(Boolean);
  const bow = set.weapon && ITEMS[set.weapon] && ITEMS[set.weapon].bow;
  for (const n of names) {
    const it = ITEMS[n]; if (!it || !it.atk) continue;
    for (let i = 0; i < 5; i++) {
      t.atk[i] += i === 4 && it.bowAtkOnly && !bow ? 0 : it.atk[i];
      t.dfn[i] += it.dfn[i];
    }
    for (const k of ['str', 'rstr', 'mdmg', 'pray']) t[k] += it[k] || 0;
  }
  const quiver = names.map((n) => ITEMS[n]).find((it) => it && it.quiver);
  const ammo = set.ammo && ITEMS[set.ammo];
  if (quiver && ammo && (ammo.arrow || ammo.bolt)) { t.atk[4] += quiver.quiver.atk; t.rstr += quiver.quiver.rstr; }
  t.eliteVoid = ['head', 'body', 'legs', 'hands'].every((s) => set[s] && ITEMS[set[s]] && ITEMS[set[s]].void)
    && ['Elite void top', 'Elite void robe'].every((n) => names.includes(n));
  return t;
}

/** The player's 3-tick weapon: the first of Obligator, Eye of ayak, Zorya's tome they have (null if none). */
export const threeTick = (pl) => THREE_TICK_PRIORITY.find((w) => (pl.weapons || []).includes(w)) || null;
