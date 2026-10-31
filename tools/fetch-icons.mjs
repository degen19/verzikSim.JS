#!/usr/bin/env node
// One-time: downloads the Show raid timeline's weapon icons from the OSRS Wiki into img/icons/ (the site then serves
// its own copies - nothing is loaded from the wiki when a page is viewed). Run from the repo root:
//   node tools/fetch-icons.mjs
// Already-downloaded icons are skipped, so re-running only fetches what's missing.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

// (all are in img/icons already - this is for adding new ones: list them here and in CODE_ICON in raidview.js)
// [file saved as, wiki names to try] - items, then spell icons (the wiki names those either way)
const FILES = [['Soulflame_horn', ['Soulflame_horn']], ['Eye_of_ayak', ['Eye_of_ayak']], ['Shadow_Barrage', ['Shadow_Barrage_icon', 'Shadow_Barrage']],
  ['Vengeance', ['Vengeance_icon', 'Vengeance']], ['Scythe_of_vitur', ['Scythe_of_vitur']], ['Twisted_bow', ['Twisted_bow']],
  ['Zaryte_crossbow', ['Zaryte_crossbow']], ['Tumekens_shadow', ["Tumeken's_shadow"]], ['Elder_maul', ['Elder_maul']], ['Bandos_godsword', ['Bandos_godsword']],
  ['Dragon_claws', ['Dragon_claws']], ['Crystal_halberd', ['Crystal_halberd']], ['Toxic_blowpipe', ['Toxic_blowpipe']], ['Dawnbringer', ['Dawnbringer']],
  ['Sulphur_blades', ['Sulphur_blades']], ['Sanguinesti_staff', ['Sanguinesti_staff']], ['Shark', ['Shark']]];
mkdirSync('img/icons', { recursive: true });
for (const [save, names] of FILES) {
  const out = `img/icons/${save}.png`;
  if (existsSync(out)) { console.log(`have ${out}`); continue; }
  let ok = false;
  for (const f of names) {
    const url = `https://oldschool.runescape.wiki/images/${encodeURIComponent(f).replace(/'/g, '%27')}.png`;
    const res = await fetch(url, { headers: { 'User-Agent': 'verzikSim.JS icon fetch (one-time; github.com/degen19/verzikSim.JS)' } });
    await new Promise((r) => setTimeout(r, 300));                // be gentle with the wiki
    if (!res.ok) continue;
    writeFileSync(out, Buffer.from(await res.arrayBuffer())); console.log(`saved ${out} (${f})`); ok = true; break;
  }
  if (!ok) console.log(`MISSING ${save} - tried ${names.join(', ')}`);
}
