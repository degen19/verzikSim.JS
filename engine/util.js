// Python-semantics helpers used by the ported engine. Keep the port line-by-line with the Python original.

/** Python floor division a // b (works for negatives like Python). */
export function floordiv(a, b) { return Math.floor(a / b); }

/** Python modulo a % b (result has the sign of b). */
export function pymod(a, b) { return ((a % b) + b) % b; }

/** Python round() (banker's rounding for .5) with optional ndigits. */
export function pyround(x, nd = 0) {
  const m = Math.pow(10, nd);
  const v = x * m;
  const r = Math.round(v);
  const diff = Math.abs(v - Math.trunc(v));
  let out;
  if (Math.abs(diff - 0.5) < 1e-9) {               // exactly half: round to even
    const f = Math.floor(v);
    out = (f % 2 === 0) ? f : f + 1;
  } else {
    out = r;
  }
  return nd ? out / m : out;
}

/** Python getattr(obj, name, def): the attribute if the object has it (even if null), else def. */
export function ga(obj, name, def = undefined) {
  return (obj != null && Object.prototype.hasOwnProperty.call(obj, name)) ? obj[name] : def;
}

/** Python truthiness (empty array / object / string / 0 / null / undefined / NaN are falsy). */
export function truthy(x) {
  if (x == null) return false;
  if (Array.isArray(x)) return x.length > 0;
  if (x instanceof Map || x instanceof Set) return x.size > 0;
  if (typeof x === 'object') return Object.keys(x).length > 0;
  if (typeof x === 'number') return x !== 0 && !Number.isNaN(x);
  return Boolean(x);
}

/** Python range(start, stop, step). */
export function range(a, b, step = 1) {
  if (b === undefined) { b = a; a = 0; }
  const out = [];
  if (step > 0) for (let i = a; i < b; i += step) out.push(i);
  else for (let i = a; i > b; i += step) out.push(i);
  return out;
}

export const sum = (arr) => arr.reduce((s, x) => s + Number(x), 0);
export const any = (arr) => arr.some(Boolean);
export const all = (arr) => arr.every(Boolean);

/** Python min/max over an iterable with an optional key. Throws on empty like Python. */
export function minBy(arr, key = (x) => x) {
  if (!arr.length) throw new Error('min() arg is an empty sequence');
  let best = arr[0], bk = key(arr[0]);
  for (const x of arr.slice(1)) { const k = key(x); if (cmp(k, bk) < 0) { best = x; bk = k; } }
  return best;
}
export function maxBy(arr, key = (x) => x) {
  if (!arr.length) throw new Error('max() arg is an empty sequence');
  let best = arr[0], bk = key(arr[0]);
  for (const x of arr.slice(1)) { const k = key(x); if (cmp(k, bk) > 0) { best = x; bk = k; } }
  return best;
}

/** Compare like Python: numbers, strings, and arrays (tuples) element-wise. */
export function cmp(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) { const c = cmp(a[i], b[i]); if (c) return c; }
    return a.length - b.length;
  }
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Python sorted(arr, key=..., reverse=...) - stable. */
export function sorted(arr, key = (x) => x, reverse = false) {
  const out = arr.slice().sort((x, y) => cmp(key(x), key(y)));
  return reverse ? out.reverse() : out;
}

/** collections.Counter-like helper: increment a key in a plain object. */
export function inc(obj, key, by = 1) { obj[key] = (obj[key] || 0) + by; return obj; }

/** Python str.strip() on possibly-non-string values. */
export const strip = (v) => (typeof v === 'string' ? v.trim() : v);

/** Python isinstance(v, str) / (int, float). */
export const isStr = (v) => typeof v === 'string';
export const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/** f"{x:>4}" style right-pad used in logs. */
export const rjust = (v, n) => String(v).padStart(n);
export const ljust = (v, n) => String(v).padEnd(n);

/** Python's f"{x:.0f}" / "{x:.1f}". */
export const fx = (v, d = 0) => Number(v).toFixed(d);

/** Python dict.get(k, def): the value if the key exists (even if null), else def. */
export function dget(d, k, def = null) {
  if (d == null) return def;
  if (d instanceof Map) return d.has(k) ? d.get(k) : def;
  return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : def;
}

/** Python `x in container` for arrays, strings, Sets, Maps and plain-object dicts. */
export function has(container, x) {
  if (container == null) return false;
  if (Array.isArray(container) || typeof container === 'string') return container.includes(x);
  if (container instanceof Set || container instanceof Map) return container.has(x);
  return Object.prototype.hasOwnProperty.call(container, x);
}

/** Integer keys of an int-keyed plain-object dict (Python dict[int, ...]). */
export const intKeys = (d) => Object.keys(d).map(Number);
