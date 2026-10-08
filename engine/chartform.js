// Chart form: describes every input on a chart tab (taken from the template's own layout), and turns form
// values back into a sheet that parse_chart / the planner read exactly like an imported .xlsx.

export const TEAM_HEADERS = ['Number of Purples', 'Death tick', 'Deep proc HP %', 'P3 halberd HP %', 'Dawn threshold %', 'Second purple %',
  'Purple HP %', 'Tornado hit %', 'P2 Scythe last hit threshold', 'Crab HP threshold', 'Brew sips', 'SCB sips', 'Restore sips', 'Sharks',
  'Perfect 1st set', 'Ducktank', '4 Claw Priority'];
export const COMPUTED = ['End spec', 'Purple crab', 'Room Time', 'LB swings', 'West/East DC +', 'Spec used', 'Time of regen'];
const BOOLS = new Set(['lightbearerOn', '1st Purple DC', '2nd Purple DC', 'PurpleDC', 'WestDC', 'EastDC', 'bouncedZCB', 'Shadow', 'Shadow camp',
  '3:1', 'Shadow while LB', 'Deep proc', 'Horn', 'P2 horn', 'P3 horn', 'East Boak', 'West Boak', 'Pneck on P1', 'Redemption flick',
  'Pass green if death', 'Perfect 1st set', 'Ducktank', '4 Claw Priority']);
const SELECTS = {
  meleePrayer: ['Piety', 'Zeal'], helm: ['Torva full helm', 'Oathplate helm'], body: ['Torva platebody', 'Oathplate chest'],
  legs: ['Torva platelegs', 'Oathplate legs'], amulet: ['Rancour', 'Blood fury', 'Both'], redCrab: ['West', 'East', 'None'],
  has3Tick: ['No', 'Breaker', 'Ayak', 'Swift blade'], 'Number of Purples': [1, 2],
  'East Pattern': ['A', '0-T'],                    // B, C and FLEX come later
  'mage helm': ['Ancestral', 'Virtus'], 'mage body': ['Ancestral', 'Virtus'], 'mage legs': ['Ancestral', 'Virtus'],
  'mage cape': ['Imbued sara', 'Infernal'],
};
const FIXED = new Set(['necklace', 'boots', 'gloves']);           // mage gear the sim always assumes
const TEXT = new Set(['Name', 'Custom Surge Timing']);

export const CODES = ['S', 'D', 'A', 'C', 'H', 'E', 'SB', 'B', 'T', 'P', 'R', 'X', 'ST>1', 'ST>2', 'ST>3', 'ST>4', 'ST>5'];
export const CODE_HELP = {
  S: 'Scythe (5t)', D: 'Dawnbringer spec (4t)', A: 'Dawnbringer auto (4t)', C: 'Claw scratch (4t)', H: "3-tick attack (has3Tick weapon)",
  E: 'Eye of ayak (3t)', SB: 'Sulphur blades (4t, 2 hits)', B: 'Blowpipe (2t)', T: 'Sang (4t)', P: 'Surge / adren pot', R: 'Force spec regen',
  X: 'Dodge (Verzik auto tick only)', 'ST>n': 'Spec transfer to player n',
};
const SPEED = { S: 5, D: 4, A: 4, C: 4, T: 4, SB: 4, H: 3, E: 3, B: 2 };
export const isAutoTick = (t) => t >= 19 && (t - 19) % 14 === 0;

const typeOf = (h) => (BOOLS.has(h) ? 'bool' : h in SELECTS ? 'select' : FIXED.has(h) ? 'fixed' : TEXT.has(h) ? 'text' : 'number');

/**
 * Describe a block (A/B) of a tab. Returns {tables: {setup, team, gear, mage, chart}, fields: Map(key -> field)}.
 * field = {key, header, player (index or null), r, c, type, choices, def}
 */
export function describe(ws, team, block = 'A') {
  let banner = null;
  for (let r = 1; r <= ws.max_row; r++) { const v = ws.cell(r, 1).value; if (typeof v === 'string' && v.startsWith('SET B')) { banner = r; break; } }
  const [lo, hi] = block === 'A' ? [1, (banner || ws.max_row + 1) - 1] : [banner || ws.max_row + 1, ws.max_row];
  const findRow = (label) => {
    for (let r = lo; r <= hi; r++) for (let c = 1; c < 4; c++) {
      const v = ws.cell(r, c).value; if (typeof v === 'string' && v.trim().toLowerCase() === label.toLowerCase()) return r;
    }
    return null;
  };
  const headers = (row, from = 2) => {
    const out = []; const seen = new Set();
    for (let c = from; c <= ws.max_column; c++) {
      const v = ws.cell(row, c).value;
      if (typeof v === 'string' && v.trim() && !seen.has(v.trim())) { seen.add(v.trim()); out.push([v.trim(), c]); }
    }
    return out;
  };
  const fields = new Map();
  const add = (table, header, player, r, c) => {
    const key = `${table}|${header}|${player ?? 'team'}`;
    const type = typeOf(header);
    let def = ws.cell(r, c).value;
    if (type === 'bool') def = def === true || String(def).toLowerCase() === 'true';
    const f = { key, table, header, player, r, c, type, choices: SELECTS[header], def: def ?? (type === 'bool' ? false : '') };
    fields.set(key, f);
    return f;
  };
  const tables = { setup: [], team: [], gear: [], mage: [], chart: null, computed: [] };
  const sr = findRow('Player');
  if (sr) {
    for (const [h, c] of headers(sr)) {
      if (COMPUTED.includes(h)) { tables.computed.push(h); continue; }
      if (TEAM_HEADERS.includes(h)) { tables.team.push(add('team', h, null, sr + 1, c)); continue; }
      tables.setup.push(h);
      for (let k = 0; k < team; k++) add('setup', h, k, sr + 1 + k, c);
    }
  }
  const gr = findRow('helm');
  if (gr) for (const [h, c] of headers(gr)) { tables.gear.push(h); for (let k = 0; k < team; k++) add('gear', h, k, gr + 1 + k, c); }
  const mr = findRow('mage helm');
  if (mr) for (const [h, c] of headers(mr)) { tables.mage.push(h); for (let k = 0; k < team; k++) add('mage', h, k, mr + 1 + k, c); }
  const tr = findRow('Tick');
  if (tr) {
    const ticks = [];
    for (let c = 2; c <= ws.max_column; c++) { const t = ws.cell(tr, c).value; if (typeof t === 'number') ticks.push([t, c]); }
    tables.chart = { row: tr, ticks };
    for (const [t, c] of ticks) for (let k = 0; k < team; k++) {
      const key = `chart|${t}|${k}`;
      fields.set(key, { key, table: 'chart', header: String(t), player: k, r: tr + 1 + k, c, type: 'code', def: ws.cell(tr + 1 + k, c).value ?? '' });
    }
  }
  return { tables, fields };
}

/** Read every value of a described block from a sheet (e.g. an imported chart, or the template for defaults). */
export function readValues(ws, desc) {
  const vals = {};
  for (const f of desc.fields.values()) {
    let v = ws.cell(f.r, f.c).value;
    if (f.type === 'bool') v = v === true || ['true', 'yes', 'y', '1'].includes(String(v ?? '').trim().toLowerCase());
    if (v === null || v === undefined) v = '';
    vals[f.key] = v;
  }
  return vals;
}

/** A sheet that reads like the template tab with the form values written in. */
export function overlaySheet(tplWs, descs, values) {
  const over = new Map();
  for (const [b, desc] of Object.entries(descs)) {
    const vals = values[b] || {};
    for (const f of desc.fields.values()) {
      if (!(f.key in vals)) continue;
      let v = vals[f.key];
      if (f.type === 'number') v = v === '' || v === null ? null : Number(v);
      if (f.type === 'code' || f.type === 'text') v = v === '' ? null : v;
      over.set(`${f.r},${f.c}`, v);
    }
  }
  return {
    max_row: tplWs.max_row, max_column: tplWs.max_column,
    cell(r, c) { const k = `${r},${c}`; return over.has(k) ? { value: over.get(k) } : tplWs.cell(r, c); },
  };
}

/** Chart checks, per player: the same rules as the spreadsheet's Check column. Returns a message or ''. */
export function checkRow(acts, has3Tick, team) {
  let prev = null;
  const ticks = Object.keys(acts).map(Number).sort((a, b) => a - b);
  for (const t of ticks) {
    const a = String(acts[t]).toUpperCase();
    if (!CODES.includes(a)) return `tick ${t}: "${a}" isn't a chart code`;
    const st = a.match(/^ST>(\d)$/);
    if (st && Number(st[1]) > team) return `tick ${t}: ${a} - there's no player ${st[1]}`;
    if (a === 'X' && !isAutoTick(t)) return `tick ${t}: X only goes on a Verzik auto tick (19, 33, 47...)`;
    if (a === 'H' && (!has3Tick || has3Tick === 'No')) return `tick ${t}: H needs a has3Tick weapon in the gear table`;
    if (a in SPEED) {
      if (prev && t - prev[0] < SPEED[prev[1]]) return `tick ${t}: ${a} is too soon after ${prev[1]} on tick ${prev[0]} (${SPEED[prev[1]]}t)`;
      prev = [t, a];
    }
  }
  return '';
}
