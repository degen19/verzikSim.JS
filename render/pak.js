// Loads a packed render asset (render/assets/*.pak, made by the packer from the game-model JSONs): gzip'd
// 'PAK1' | u32 header length | header JSON | blob. Returns the original JSON's shape; a model frame (a triangle soup of
// positions) comes back as a Soup - .get() expands it to a Float32Array on first use, so only shown frames cost memory.
export class Soup {
  constructor(g, k) { this.g = g; this.k = k; this.length = g.idx.length * 3; }
  get() {
    const { idx, U, inv } = this.g, q = U[this.k], out = new Float32Array(idx.length * 3);
    for (let i = 0; i < idx.length; i++) { const u = idx[i] * 3; out[i * 3] = q[u] * inv; out[i * 3 + 1] = q[u + 1] * inv; out[i * 3 + 2] = q[u + 2] * inv; }
    return out;
  }
}
export const arr = (a) => (a instanceof Soup ? a.get() : a);
export async function loadPak(url) {
  const res = await fetch(url); if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const dv = new DataView(buf), hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const base = 8 + hl + ((4 - ((8 + hl) % 4)) % 4);
  const groups = head.groups.map((g) => {
    const [o, n, b] = g.idx, idx = b === 2 ? new Uint16Array(buf, base + o, n) : new Uint32Array(buf, base + o, n), m = g.nu * 3;
    const U = []; let prev = null;
    for (const off of g.arrs) { const d = new Int16Array(buf, base + off, m), q = new Int16Array(m); for (let i = 0; i < m; i++) q[i] = g.delta && prev ? prev[i] + d[i] : d[i]; U.push(q); prev = q; }
    return { idx, U, inv: 1 / g.scale };
  });
  const rev = (o) => {
    if (Array.isArray(o)) return o.map(rev);
    if (!o || typeof o !== 'object') return o;
    if (o.$ === 'soup') return new Soup(groups[o.g], o.k);
    if (o.$ === 'col') { const u = new Uint8Array(buf, base + o.o, o.n), f = new Float32Array(o.n); for (let i = 0; i < o.n; i++) f[i] = u[i] / 255; return f; }
    if (o.$ === 'f32') return new Float32Array(buf, base + o.o, o.n);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rev(v)]));
  };
  return rev(head.data);
}
