// Xarpus (room 4). Stats so far; the exhumeds and the room flow come next.
//  - HP 5000 (5s), scaled down below 5s like the other rooms: 87.5% in 4s, 75% in 3s / duos / solos.
//  - Defence 250, Magic 220. Stab / slash / crush defence 0, ranged (light / standard / heavy) 160, magic defence 0.
//  - No supplies in this room (for now). Start spec 95 or 100.
//  - Players scythe every 5 ticks; specs: Horn, Claws, ZCB, Elder maul, BGS, Ralos Spec. One-time tick fixes (claw
//    scratch / spec, blowpipe hit, Ayak hit) on their triggers.
export const XARPUS_HP = { 5: 5000, 4: 4375, 3: 3750, 2: 3750, 1: 3750 };
export const XARPUS = {
  def: 250, magic: 220,
  dfn: { stab: 0, slash: 0, crush: 0, light: 160, standard: 160, heavy: 160, magic: 0 },
};
/** Ralos Spec: each hit that lands (1+ damage) drains Defence by 1/8 of her Magic level. */
export const RALOS_DRAIN = Math.floor(XARPUS.magic / 8);
