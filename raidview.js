// Show raid: a tick-by-tick Attack Timeline of one raid (laid out like Blert's): a row per player plus the boss, the
// attack each player queued on each tick, the boss's attack ticks, and phase markers. Shared by every room.
//
// pickRaid: which raid to show for a breakpoint (median / top 25% / top 10% / fastest): the room time shown for it,
// then among the raids that ended exactly then, the most common phase splits (the typical way to get that time).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const BREAKPOINTS = [['median', 'Median'], ['q25', 'Top 25%'], ['q10', 'Top 10%'], ['fast', 'Fastest']];
const fmtSec = (x) => { const r = Math.round(x % 60 * 10) / 10; return `${Math.floor(x / 60)}:${r < 10 ? '0' : ''}${r}`; };
/** The Show raid choices: the four above, then one per breakpoint the user entered (seconds) - [[which, label]]. */
export const raidChoices = (bps = []) => [...BREAKPOINTS, ...[...bps].sort((a, b) => a - b).map((b) => [`bp:${b}`, fmtSec(b)])];
/** The timeline's title for a choice: "Median Raid (Sotetseg)", "Top 10% (Verzik)", "2:57 (Verzik)". */
export const raidTitle = (which, boss) => `${which === 'median' ? 'Median Raid' : which.startsWith('bp:') ? `${fmtSec(Number(which.slice(3)))} Raid` : (BREAKPOINTS.find(([k]) => k === which) || [])[1]} (${boss})`;

/** raids: [{i, total, key}] (key: the raid's phase splits as text; failed raids left out). allN: raids played in all
 *  (failed ones count for the percentiles, as in the results tables). which: a BREAKPOINTS key. -> {i, total, n} */
export function pickRaid(raids, allN, which) {
  const v = raids.map((r) => r.total).sort((a, b) => a - b), n = Math.max(allN, v.length);
  if (!v.length) return null;
  let T;
  if (String(which).startsWith('bp:')) {                             // a breakpoint: the raids ending on its tick (or the closest time)
    const want = Math.round(Number(which.slice(3)) / 0.6);
    T = v.reduce((m, x) => (Math.abs(x - want) < Math.abs(m - want) || (Math.abs(x - want) === Math.abs(m - want) && x < m) ? x : m), v[0]);
  } else {
    const at = { median: n >> 1, q25: Math.max(0, Math.floor(n * 0.25) - 1), q10: Math.max(0, Math.floor(n * 0.1) - 1), fast: 0 }[which];
    if (at >= v.length) return null;
    T = v[at];
  }
  const same = raids.filter((r) => r.total === T), count = {};
  for (const r of same) count[r.key] = (count[r.key] || 0) + 1;
  const key = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  const r = same.find((x) => x.key === key);
  return { i: r.i, total: T, n: same.length, typical: count[key] };
}

// cell colours by attack code (specs stand out; plain attacks are quiet)
const CODE_COL = {
  S: '#9aa3b5', TB: '#7bd88f', Z: '#e8d27a', ZCB: '#ffd54a', SB: '#6fd3e8', TS: '#6fd3e8', EM: '#c79bff', BGS: '#5fd0c0',
  C: '#ff9f5a', Ch: '#ff7ab8', H: '#ff6b6b', BP: '#b9e07a', R: '#ff9f9f', D: '#c79bff', P: '#ff66cc', SH: '#6fd3e8',
  E: '#8fb8ff', SuB: '#ffcf70', T: '#ff8a8a', Cs: '#d9a37a', Sh: '#6fd3e8', F: '#c0c4d0', '3t': '#c0c4d0',
};
const CODE_NAME = { S: 'Scythe', TB: 'Twisted bow', Z: 'ZCB', ZCB: 'ZCB spec', SB: 'Shadow Barrage', TS: "Tumeken's shadow", EM: 'Elder maul spec',
  BGS: 'BGS spec', C: 'Claw spec', Ch: 'Crystal halberd spec', H: 'Soulflame horn', BP: 'Blowpipe', D: 'Dawnbringer spec', P: 'Surge pot', SH: 'Shadow',
  E: 'Eye of ayak', SuB: 'Sulphur blades', T: 'Sang', R: 'Forced spec regen', Cs: 'Claw scratch', Sh: 'Shadow', F: 'Tick fill', '3t': '3-tick weapon' };
// weapon icons: the OSRS Wiki's item images, downloaded once into img/icons (tools/fetch-icons.mjs) and served from
// the site - never loaded from the wiki. The text code shows for any icon that isn't there.
const ICONS = 'img/icons/';
// (any icon whose file is missing shows its text code instead - the image fails to load and falls back)
const CODE_ICON = { S: 'Scythe_of_vitur', TB: 'Twisted_bow', Z: 'Zaryte_crossbow', ZCB: 'Zaryte_crossbow', TS: 'Tumekens_shadow',
  EM: 'Elder_maul', BGS: 'Bandos_godsword', C: 'Dragon_claws', Cs: 'Dragon_claws', Ch: 'Crystal_halberd', BP: 'Toxic_blowpipe',
  D: 'Dawnbringer', SuB: 'Sulphur_blades', T: 'Sanguinesti_staff', Sh: 'Tumekens_shadow', Shark: 'Shark', Redemption: 'Redemption',
  H: 'Soulflame_horn', E: 'Eye_of_ayak', SB: 'Shadow_Barrage', V: 'Vengeance' };
const icon = (code) => (CODE_ICON[code]
  ? `<img src="${ICONS}${CODE_ICON[code]}.png" alt="${esc(code)}" onerror="this.replaceWith(document.createTextNode(this.alt))">`
  : esc(code));
// her events: the colour by kind (her attacks red, purple crab, heals green, damage to her orange, lightning gold)
const BOSS_BG = { attack: '#7a2433', purple: '#6b3fa0', heal: '#2f7a3f', boom: '#b8641f', lightning: '#9a7f12', rebound: '#b59a1c' };
const BOSS_ATTACK = new Set(['attack', 'purple', 'lightning']);   // red tick numbers: the ticks she attacks
const CSS = `<style>
.rv{background:#16171f;color:#d7d9e0;border-radius:8px;padding:10px 12px;font:12px/1.2 system-ui,sans-serif;overflow-x:auto}
.rv h4{margin:0 0 8px;color:#fff;font-size:15px}
.rv .blk{display:grid;gap:3px;margin:0 0 14px;width:max-content}
.rv .lab{background:#2a2c3b;border-radius:4px;padding:5px 8px;text-align:center;min-width:86px;white-space:nowrap;color:#e6e8ef}
.rv .lab.boss{background:#5b2a3c;color:#fff}
.rv .tk{color:#8c90a0;text-align:center;font-size:10px;align-self:end}
.rv .tk.her{color:#fff;background:#b8323f;border-radius:3px}
.rv .c{width:24px;height:24px;border-radius:4px;background:#22242f;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;position:relative}
.rv .c img{max-width:20px;max-height:20px;image-rendering:pixelated}
.rv .c.v{background:#3a1830;border:1px solid #c2185b;color:#ff8fc0}
.rv .c .dots{position:absolute;left:2px;top:3px;bottom:3px;display:flex;flex-direction:column;justify-content:center;gap:1px}
.rv .c .dots i{width:5px;height:5px;border-radius:50%;display:block}
.rv .c .dots i.brew{background:#f2c94c}.rv .c .dots i.restore{background:#ff7ab8}.rv .c .dots i.surge{background:#fff}.rv .c .dots i.scb{background:#3fbf6f}.rv .c .dots i.other{background:#8c90a0}
.rv .c .rd{position:absolute;left:-3px;top:-5px;line-height:0}
.rv .c .rd img{max-width:11px;max-height:10px}
.rv .c.hd{padding-left:6px;box-sizing:border-box}
.rv .c.hd img{max-width:16px;max-height:16px}
.rv .c.duo img{max-width:12px;max-height:12px}
.rv .c.trio img{max-width:9px;max-height:9px}
.rv .c .vt{color:#ff6b9a;font-size:9px;font-weight:800}
.rv .c.duo .vt,.rv .c.trio .vt{font-size:8px}
.rv .c.a{background:#2f3242;border:1px solid #474b60}
.rv .c.b{background:#7a2433;color:#fff}
.rv .mk{font-size:10px;text-align:center;align-self:end;white-space:nowrap}
.rv .mk span{display:inline-block;border:1px solid #6b74ff;color:#c8ccff;border-radius:4px;padding:2px 5px;background:#1f2140}
/* her healing shield (Verzik reds): every cell in those ticks tinted pink */
.rv .sh{box-shadow:inset 0 0 0 30px rgba(255,105,180,.16)}
.rv .tk.sh{border-radius:3px}
.rv .legend{color:#9aa0b0;font-size:11px;margin-top:4px}
</style>`;

/** A supply line from the log as the items used (no HP - not shown until deaths are tracked): "shark, brew ×3", or
 *  a surge with its spec change. */
const SUPPLY_ITEMS = [[/shark/i, 'shark'], [/guthix rest|\brest\b/i, 'Guthix rest'], [/brew/i, 'brew'], [/super restore|\brestore/i, 'super restore'],
  [/super combat/i, 'super combat'], [/heart|Magic boosted/i, 'heart'], [/phoenix/i, 'phoenix necklace proc'], [/redemption/i, 'redemption proc'],
  [/heals? other|HEAL OTHER/i, 'heal other'], [/ranging/i, 'ranging potion'], [/divine/i, 'divine potion']];
/** Which marker a supply line gets: shark (its icon), brew (yellow), restore (pink), surge (white), scb (green: super
 *  combat / divine), redemption (blue heart), other (grey: phoenix necklaces, rests, heart, heal other). */
export function supplyKinds(lines) {
  const k = new Set();
  for (const line of lines) for (const part of line.split(/[|+;]/)) {
    if (/shark/i.test(part)) k.add('shark');
    else if (/brew/i.test(part)) k.add('brew');
    else if (/super combat|divine/i.test(part)) k.add('scb');
    else if (/restore/i.test(part)) k.add('restore');
    else if (/surge/i.test(part)) k.add('surge');
    else if (/redemption/i.test(part)) k.add('redemption');
    else if (part.trim()) k.add('other');
  }
  return k;
}
const DOTS = ['brew', 'restore', 'surge', 'scb', 'other'];       // the potion dots, top to bottom
export function supplyText(lines) {
  const n = new Map(), out = [];
  for (const line of lines) {
    const sg = line.match(/surge (\d+)% -> (\d+)%/i); if (sg) { out.push(`surge (${sg[1]}% -> ${sg[2]}% spec)`); continue; }
    for (const part of line.split(/[|+;]/)) for (const [re, name] of SUPPLY_ITEMS) if (re.test(part)) { n.set(name, (n.get(name) || 0) + 1); break; }
  }
  for (const [name, k] of n) out.push(k > 1 ? `${name} ×${k}` : name);
  return out.join(', ');
}

/** The timeline. trace: [{t, i, code, dmg?, landed?, what?} a player's attack | {t, i, veng} a vengeance proc (damage to
 *  her) | {t, boss, kind?, tip?, short?} her event (several a tick) | {t, hp, phase} her HP | {t, mark}]; names: player
 *  names; bossName; end: last tick; title; perRow: ticks per block (Blert: 55). */
export function timelineHtml({ trace, names, bossName, end, title = '', perRow = 55, legend = '' }) {
  const at = new Map(), veng = new Map(), sup = new Map(), boss = new Map(), marks = new Map(), hpAt = new Map(), shade = new Set();
  for (const x of trace) {
    if (x.shade) shade.add(x.t);
    else if (x.mark) marks.set(x.t, [...(marks.get(x.t) || []), x.mark]);
    else if (x.boss) boss.set(x.t, [...(boss.get(x.t) || []), { kind: 'attack', ...x }]);
    else if (x.hp != null) hpAt.set(x.t, x);
    else if (x.veng != null) veng.set(`${x.i}:${x.t}`, x.veng);
    else if (x.supply) sup.set(`${x.i}:${x.t}`, [...(sup.get(`${x.i}:${x.t}`) || []), x.supply]);
    else if (x.i != null) at.set(`${x.i}:${x.t}`, x);
  }
  // hover: the tick - her phase and HP at the end of it, and what she did; an attack - what it did when it landed
  const evTip = (e) => e.tip || e.boss;
  const S = (t) => (shade.has(t) ? ' sh' : '');                      // a tinted (healing shield) tick
  const tickTip = (t) => { const h = hpAt.get(t); return [`Tick ${t}`, h ? `${bossName} ${h.phase} - ${h.hp.toLocaleString()} HP` : '', shade.has(t) ? 'Healing shield up' : '', ...(boss.get(t) || []).map((e) => `${bossName}: ${evTip(e)}`)].filter(Boolean).join('\n'); };
  const hitTip = (nm, x) => [`${nm} - tick ${x.t}: ${x.what || CODE_NAME[x.code] || x.code}${x.code === 'H' || x.code === 'R' ? '' : x.landed == null ? ' - never landed (a maze or the kill came first)' : x.dmg ? ` - ${x.dmg} damage${x.crab ? ' to a crab' : ''} (lands tick ${x.landed})` : ` - missed / 0 (tick ${x.landed})`}`,
    x.target ? `Target: ${x.target}` : '',
    x.gear ? `Gear: ${x.gear}` : '',
    x.stats ? `Stats: ${x.stats}` : '',
    x.spec != null ? `Spec: ${Math.round(x.spec)}%${x.specAfter != null && x.specAfter !== x.spec ? ` -> ${Math.round(x.specAfter)}%` : ''}` : '',
    x.spec != null ? (x.regenIn == null ? (x.spec >= 100 ? 'Spec full (no regen running)' : '') : `Next spec regen: ${x.regenIn} tick${x.regenIn === 1 ? '' : 's'} (tick ${x.t + x.regenIn})`) : '',
  ].filter(Boolean).join('\n');
  const last = Math.max(end || 0, ...trace.map((x) => x.t));
  const blocks = [];
  for (let a = 1; a <= last; a += perRow) {
    const b = Math.min(last, a + perRow - 1), ticks = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    const cols = `grid-template-columns:auto repeat(${ticks.length},24px)`;
    const mk = ticks.some((t) => marks.has(t)) ? `<div></div>${ticks.map((t) => `<div class="mk">${marks.has(t) ? marks.get(t).map((m) => `<span>${esc(m)}</span>`).join('<br>') : ''}</div>`).join('')}` : '';
    const attacks = (t) => (boss.get(t) || []).some((e) => BOSS_ATTACK.has(e.kind));
    const head = `<div></div>${ticks.map((t) => `<div class="tk${attacks(t) ? ' her' : ''}${S(t)}" title="${esc(tickTip(t))}">${t}</div>`).join('')}`;
    const bossCell = (t) => {
      const ev = boss.get(t); if (!ev) return `<div class="c${S(t)}" title="${esc(tickTip(t))}"></div>`;
      const top = ev.find((e) => e.kind !== 'attack') || ev[0];            // the most telling one colours the cell
      const short = top.short ?? (top.boss === 'Attack' ? '' : top.boss.split(' ').map((w) => w[0].toUpperCase()).join(''));
      return `<div class="c b${S(t)}" style="background:${BOSS_BG[top.kind] || BOSS_BG.attack}" title="${esc(tickTip(t))}">${esc(short)}</div>`;
    };
    const bossRow = `<div class="lab boss">${esc(bossName)}</div>${ticks.map(bossCell).join('')}`;
    const rows = names.map((nm, i) => `<div class="lab">${esc(nm)}</div>${ticks.map((t) => {
      const x = at.get(`${i}:${t}`), v = veng.get(`${i}:${t}`), su = sup.get(`${i}:${t}`);
      const vt = v != null ? `Vengeance - ${v} damage to ${bossName}` : '', st = su ? `Supplies: ${supplyText(su)}` : '';
      // supplies: a shark is its icon (sharing the cell with an attack, both smaller); brews / super combats / anything
      // else are small yellow / green / grey dots, a redemption proc a blue heart
      const kinds = su ? supplyKinds(su) : new Set(), shark = kinds.has('shark');
      const marks = `${kinds.has('redemption') ? `<span class="rd">${icon('Redemption')}</span>` : ''}${DOTS.some((q) => kinds.has(q)) ? `<span class="dots">${DOTS.filter((q) => kinds.has(q)).map((q) => `<i class="${q}"></i>`).join('')}</span>` : ''}`;
      // the shark and a vengeance proc share the cell with an attack (all smaller): veng is its icon (V until the icon's in)
      const sharkImg = shark ? icon('Shark') : '', vengImg = v != null ? (CODE_ICON.V ? icon('V') : '<span class="vt">V</span>') : '';
      const n = (x ? 1 : 0) + (shark ? 1 : 0) + (v != null ? 1 : 0), dots = DOTS.some((q) => kinds.has(q));
      const fit = `${n >= 3 ? ' trio' : n === 2 ? ' duo' : ''}${dots && n ? ' hd' : ''}`;   // hd: icons nudged right of the potion dots
      if (x) return `<div class="c a${fit}${S(t)}" style="color:${CODE_COL[x.code] || '#fff'}" title="${esc([hitTip(nm, x), vt, st].filter(Boolean).join('\n'))}">${icon(x.code)}${vengImg}${sharkImg}${marks}</div>`;
      if (v != null) return `<div class="c v${fit}${S(t)}" title="${esc([`${nm} - tick ${t}: ${vt}`, st].filter(Boolean).join('\n'))}">${vengImg}${sharkImg}${marks}</div>`;
      if (su) return `<div class="c${S(t)}" title="${esc(`${nm} - tick ${t}: ${st}`)}">${sharkImg}${marks}</div>`;
      return `<div class="c${S(t)}"></div>`;
    }).join('')}`).join('');
    blocks.push(`<div class="blk" style="${cols}">${mk}${head}${bossRow}${rows}</div>`);
  }
  return `${CSS}<div class="rv">${title ? `<h4>${esc(title)}</h4>` : ''}${blocks.join('')}${legend ? `<div class="legend">${legend}</div>` : ''}</div>`;
}
