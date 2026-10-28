// Gear config: what each player wears for melee, ranged and magic, slot by slot, and which weapons they bring.
//
// Melee: an item per slot (or empty). Ranged / Magic: per slot an item, 'takeoff' (the slot is emptied for that style),
// or 'none' (no switch for that slot). 'none' falls back to:
//   - the other style's item for that slot, when the other style has one (it has fewer negatives than melee gear),
//   - otherwise the melee item.
// A two-handed weapon (Tumeken's shadow, Zorya's tome, Twisted bow, blowpipe) leaves the shield slot empty.
// P1 tick fixes (blowpipe, Sang, Eye of ayak, 3-tick hits) are made in melee gear; only duo Dawn autos use the mage setup.
import { ITEMS } from './gear.js';

export const BOTH_AMULETS = 'Rancour + Blood fury';           // brings both: swaps to Blood fury below an HP (Blood fury HP)
/** The registry item for a slot value (the two-amulet choice counts as Rancour for bonuses). */
export const itemOf = (v) => (v === BOTH_AMULETS ? 'Amulet of rancour' : v);
export const SLOTS = [
  ['head', 'Head'], ['cape', 'Cape'], ['neck', 'Neck'], ['body', 'Body'], ['legs', 'Legs'],
  ['hands', 'Hands'], ['feet', 'Feet'], ['ring', 'Ring'], ['shield', 'Shield'],
];
export const STYLES = [['melee', 'Melee'], ['range', 'Ranged'], ['mage', 'Magic']];

/** The items each style can pick per slot (the registry has the stats). */
export const CHOICES = {
  melee: {
    head: ['Torva full helm', 'Oathplate helm'], cape: ['Infernal cape'], neck: ['Amulet of rancour', 'Amulet of blood fury', BOTH_AMULETS],
    body: ['Torva platebody', 'Oathplate chest'], legs: ['Torva platelegs', 'Oathplate legs'], hands: ['Ferocious gloves'],
    feet: ['Avernic treads (max)'], ring: ['Ultor ring'], shield: [],                  // Lightbearer: set per room
  },
  range: {
    head: ['Masori mask (f)', 'Void ranger helm'], cape: ["Blessed dizana's quiver"], neck: ['Necklace of rupture', 'Necklace of anguish'],
    body: ['Masori body (f)', 'Elite void top'], legs: ['Masori chaps (f)', 'Elite void robe'], hands: ['Zaryte vambraces', 'Void knight gloves'],
    feet: ['Avernic treads (max)'], ring: ['Venator ring'], shield: [],
  },
  mage: {
    head: ['Ancestral hat', 'Virtus mask'], cape: ['Imbued saradomin cape'], neck: ['Occult necklace'],
    body: ['Ancestral robe top', 'Virtus robe top'], legs: ['Ancestral robe bottom', 'Virtus robe bottom'], hands: ['Confliction gauntlets'],
    feet: ['Avernic treads (max)'], ring: ['Magus ring'], shield: ["Elidinis' ward (f)", 'Book of the dead'],
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
    name: `Player ${i + 1}`, prayer: 'Piety', bloodFuryHp: '',
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
    const it = ITEMS[itemOf(n)]; if (!it || !it.atk) continue;
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

// ------------------------------------------------------------------ the Verzik chart <-> gear
const AMULET_OF = { 'Rancour': 'Amulet of rancour', 'Blood fury': 'Amulet of blood fury', 'Both': BOTH_AMULETS };
const AMULET_TO = { 'Amulet of rancour': 'Rancour', 'Amulet of blood fury': 'Blood fury', [BOTH_AMULETS]: 'Both' };
const THREE_OF = { 'Obligator': 'Obligator', 'Breaker': 'Obligator', 'Ayak': 'Eye of ayak', 'Swift blade': 'Swift blade' };
const THREE_TO = { 'Obligator': 'Obligator', 'Eye of ayak': 'Ayak', 'Swift blade': 'Swift blade' };
// the mage set the sim assumed for shadow players before the Gear tab
const MAGE_DEFAULT = { head: 'Ancestral hat', body: 'Ancestral robe top', legs: 'Ancestral robe bottom', cape: 'Imbued saradomin cape',
  neck: 'Occult necklace', hands: 'Confliction gauntlets' };

/** A gear player from a parsed chart config (parse_chart): what an imported chart's gear columns say. */
export function fromChartCfg(cfg, i) {
  const pl = blankPlayer(i);
  pl.name = cfg.name || pl.name;
  pl.prayer = cfg.meleePrayer || 'Piety';
  for (const [k, s] of [['helm', 'head'], ['body', 'body'], ['legs', 'legs']]) if (cfg[k]) pl.melee[s] = cfg[k];
  pl.melee.neck = AMULET_OF[cfg.amulet] || 'Amulet of rancour';
  pl.bloodFuryHp = cfg.bloodFuryHp ?? '';
  const mg = cfg.mage || {};
  Object.assign(pl.mage, MAGE_DEFAULT);
  if (mg.helm === 'off') pl.mage.head = 'takeoff'; else if (mg.helm === 'melee') pl.mage.head = 'none'; else if (mg.helm) pl.mage.head = mg.helm;
  if (mg.body) pl.mage.body = mg.body;
  if (mg.legs) pl.mage.legs = mg.legs;
  if (mg.cape) pl.mage.cape = mg.cape === 'Infernal cape' ? 'none' : mg.cape;
  const w = ['Scythe of vitur', 'Dragon claws'];
  if (cfg.hasBP !== false) w.push('Toxic blowpipe');
  if (THREE_OF[cfg.has3Tick]) w.push(THREE_OF[cfg.has3Tick]);
  if (cfg.shadow) w.push("Tumeken's shadow");
  if (Object.values(cfg.actions || {}).includes('SB')) w.push('Sulphur blades');
  pl.weapons = w;
  return pl;
}

/** The magic set a player shadows in (shield off: the shadow is two-handed), as registry item names. The ring is left
 *  out: in Verzik it follows the room's Lightbearer / Ultor swaps (P2 adds the ring they have on). */
export function mageList(pl) {
  return Object.entries(worn(pl, 'mage', "Tumeken's shadow")).filter(([s, v]) => s !== 'weapon' && s !== 'ring' && v).map(([, v]) => itemOf(v))
    .filter((n) => ITEMS[n]);
}

/** A parsed chart config with the player's gear applied (helm / body / legs, amulet, prayer, blowpipe, 3-tick weapon,
 *  the magic set used for the shadow). */
export function applyToCfg(cfg, pl) {
  const out = { ...cfg };
  out.helm = pl.melee.head || 'Torva full helm'; out.body = pl.melee.body || 'Oathplate chest'; out.legs = pl.melee.legs || 'Oathplate legs';
  out.amulet = AMULET_TO[pl.melee.neck] || 'Rancour';
  if (pl.bloodFuryHp !== '' && pl.bloodFuryHp != null) out.bloodFuryHp = Number(pl.bloodFuryHp); else delete out.bloodFuryHp;
  out.meleePrayer = pl.prayer || 'Piety';
  out.hasBP = (pl.weapons || []).includes('Toxic blowpipe');
  const t = threeTick(pl) || ((pl.weapons || []).includes('Swift blade') ? 'Swift blade' : null);
  out.has3Tick = THREE_TO[t] || false;                      // Zorya's tome as a 3-tick weapon: not simulated yet
  out.mageGear = mageList(pl);
  return out;
}

/** Chart-builder values (table|header|player -> value) for the gear columns, merged into a gear player. Only the
 *  columns present in `values` change (e.g. a Solver result moving the blowpipe or the shadow's mage gear). */
export function mergeChartValues(pl, values, k) {
  const v = (t, h) => values[`${t}|${h}|${k}`];
  const q = structuredClone(pl);
  if (v('setup', 'meleePrayer') != null && v('setup', 'meleePrayer') !== '') q.prayer = v('setup', 'meleePrayer');
  for (const [h, s] of [['helm', 'head'], ['body', 'body'], ['legs', 'legs']]) if (v('gear', h)) q.melee[s] = v('gear', h);
  if (AMULET_OF[v('gear', 'amulet')]) q.melee.neck = AMULET_OF[v('gear', 'amulet')];
  if (v('gear', 'bloodFuryHp') != null) q.bloodFuryHp = v('gear', 'bloodFuryHp');
  const w = new Set(q.weapons || []);
  if (v('gear', 'Has BP') != null) { if (v('gear', 'Has BP') === true) w.add('Toxic blowpipe'); else w.delete('Toxic blowpipe'); }
  if (v('gear', 'Shadow') === true) w.add("Tumeken's shadow");
  const h3 = v('gear', 'has3Tick');
  if (h3 != null && h3 !== '') { for (const x of ['Obligator', 'Eye of ayak', 'Swift blade']) w.delete(x); if (THREE_OF[h3]) w.add(THREE_OF[h3]); }
  q.weapons = [...w];
  const names = { Ancestral: ['Ancestral hat', 'Ancestral robe top', 'Ancestral robe bottom'], Virtus: ['Virtus mask', 'Virtus robe top', 'Virtus robe bottom'] };
  ['head', 'body', 'legs'].forEach((s, i) => {
    const x = v('mage', ['mage helm', 'mage body', 'mage legs'][i]);
    if (!x) return;
    if (i === 0 && x === 'Take off') q.mage.head = 'takeoff';
    else if (i === 0 && x === 'None') q.mage.head = 'none';
    else if (names[x]) q.mage[s] = names[x][i];
  });
  const cape = v('mage', 'mage cape');
  if (cape) q.mage.cape = cape === 'Infernal' ? 'none' : 'Imbued saradomin cape';
  return q;
}
