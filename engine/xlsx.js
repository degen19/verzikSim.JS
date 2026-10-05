// Minimal, dependency-free .xlsx reader (values only) for Node and browsers.
// Gives an openpyxl-like API so the chart parser ports line by line:
//   const wb = await readXlsx(bytes);  wb.sheetnames;  const ws = wb.sheet('2-man');
//   ws.cell(r, c).value  (1-based, like openpyxl)   ws.max_row   ws.max_column
// Cell values: number, string, boolean or null (formulas give their cached value, like openpyxl data_only=True).

async function inflateRaw(data) {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    const zlib = await import('node:zlib');
    return new Uint8Array(zlib.inflateRawSync(data));
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx (zip) file');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(loff + 26, true), lelen = dv.getUint16(loff + 28, true);
    const start = loff + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    files[name] = { method, raw };
    p += 46 + nlen + elen + clen;
  }
  return {
    async text(name) {
      const f = files[name];
      if (!f) return null;
      const bytes = f.method === 0 ? f.raw : await inflateRaw(f.raw);
      return dec.decode(bytes);
    },
    has: (name) => name in files,
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e] ?? m;
  });
}
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? unescapeXml(m[1]) : null; };

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function textOf(xml) {           // concatenate every <t>...</t> (plain or rich text)
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += m[1] ? unescapeXml(m[1]) : '';
  return out;
}

class Sheet {
  constructor(cells, maxRow, maxCol) { this.cells = cells; this.max_row = maxRow; this.max_column = maxCol; }
  cell(r, c) { const v = this.cells.get(r * 20000 + c); return { value: v === undefined ? null : v }; }
}

export async function readXlsx(bytes) {
  const z = await unzip(bytes);
  const wbXml = await z.text('xl/workbook.xml');
  const relsXml = await z.text('xl/_rels/workbook.xml.rels');
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) rels[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name');
    const rid = attr(m[0], 'r:id');
    let target = rels[rid] || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    sheets.push({ name, target });
  }
  const shared = [];
  const ssXml = await z.text('xl/sharedStrings.xml');
  if (ssXml) for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const cache = {};
  return {
    sheetnames: sheets.map((s) => s.name),
    async load(name) {
      if (cache[name]) return cache[name];
      const sh = sheets.find((s) => s.name === name);
      if (!sh) throw new Error(`Worksheet ${name} does not exist.`);
      const xml = await z.text(sh.target);
      const cells = new Map();
      let maxRow = 0, maxCol = 0;
      for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const head = '<c' + m[1] + '>';
        const ref = attr(head, 'r');
        if (!ref) continue;
        const [, L, R] = ref.match(/^([A-Z]+)(\d+)$/);
        const r = parseInt(R, 10), c = colIndex(L);
        const t = attr(head, 't');
        const body = m[2] || '';
        const vm = body.match(/<v>([\s\S]*?)<\/v>/);
        let v = null;
        if (t === 's') v = vm ? shared[parseInt(vm[1], 10)] : null;
        else if (t === 'b') v = vm ? vm[1] === '1' : null;
        else if (t === 'inlineStr') v = textOf(body);
        else if (t === 'str' || t === 'e') v = vm ? unescapeXml(vm[1]) : null;
        else if (vm) { const num = Number(vm[1]); v = Number.isNaN(num) ? vm[1] : num; }
        if (v === null || v === '') { if (v === '') v = null; }
        if (v !== null) {
          cells.set(r * 20000 + c, v);
          if (r > maxRow) maxRow = r;
          if (c > maxCol) maxCol = c;
        }
      }
      const dim = xml.match(/<dimension ref="[A-Z]+\d+:([A-Z]+)(\d+)"/);
      if (dim) { maxRow = Math.max(maxRow, parseInt(dim[2], 10)); maxCol = Math.max(maxCol, colIndex(dim[1])); }
      return (cache[name] = new Sheet(cells, maxRow, maxCol));
    },
  };
}
