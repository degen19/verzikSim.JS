"""Pack a render asset JSON into a compact gzip'd binary (.pak).
Layout: 'PAK1' | u32 header-len | header JSON | pad to 4 | blob.
Header = the JSON with each big numeric array replaced by a ref:
  {"$": "soup", "g": group, "k": j}   - j-th position array of a soup group (expand: idx -> unique verts)
  {"$": "col",  "o": off, "n": n}      - u8 colours (value/255)
  {"$": "f32",  "o": off, "n": n}      - plain float32
groups: [{"idx": [off, n, bytes], "nu": unique count, "scale": s, "arrs": [[off] ...]}]  int16 xyz per unique vertex,
each array delta-coded on the one before it in the group."""
import json, sys, gzip, numpy as np
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
blob = bytearray(); groups = []
def put(b):
    while len(blob) % 4: blob.append(0)
    o = len(blob); blob.extend(b); return o
def is_num_list(v): return isinstance(v, list) and len(v) > 64 and isinstance(v[0], (int, float))
def collect(o, n, out, path):
    if isinstance(o, dict):
        for k, v in o.items():
            if is_num_list(v):
                if len(v) == n and not k.endswith('col'): out.append((o, k))
            else: collect(v, n, out, path + [k])
    elif isinstance(o, list):
        for i, v in enumerate(o):
            if is_num_list(v):
                if len(v) == n: out.append((o, i))
            elif isinstance(v, (dict, list)): collect(v, n, out, path + [i])
def soup(o, colkey):
    n = len(o[colkey]); refs = []; collect(o, n, refs, [])
    if not refs: return
    A = np.array([r[0][r[1]] for r in refs], dtype=np.float64).reshape(len(refs), n // 3, 3)   # arrays x verts x 3
    key = np.ascontiguousarray(A.transpose(1, 0, 2).reshape(n // 3, -1))
    _, first, inv = np.unique(key.view(np.dtype((np.void, key.dtype.itemsize * key.shape[1]))).ravel(), return_index=True, return_inverse=True)
    U = A[:, first, :]                                                   # arrays x unique x 3
    mx = float(np.abs(U).max()) or 1.0; scale = min(1000.0, np.floor(32000 / mx))
    Q = np.round(U * scale).astype(np.int32)
    D = Q.copy(); D[1:] = Q[1:] - Q[:-1]
    if np.abs(D).max() > 32767: D = Q.copy(); delta = False
    else: delta = True
    D = D.astype(np.int16)
    idx = inv.astype(np.uint16 if len(first) < 65536 else np.uint32)
    g = {"idx": [put(idx.tobytes()), int(idx.size), idx.itemsize], "nu": int(len(first)), "scale": scale, "delta": delta, "arrs": [put(D[j].tobytes()) for j in range(len(refs))]}
    gi = len(groups); groups.append(g)
    for j, (par, k) in enumerate(refs): par[k] = {"$": "soup", "g": gi, "k": j}
def walk(o):
    if isinstance(o, dict):
        cols = [k for k, v in o.items() if k.endswith('col') and is_num_list(v)]
        for ck in cols: soup(o, ck)
        for k, v in list(o.items()):
            if is_num_list(v):
                a = np.array(v, dtype=np.float64)
                if k.endswith('col'): o[k] = {"$": "col", "o": put(np.round(np.clip(a, 0, 1) * 255).astype(np.uint8).tobytes()), "n": len(v)}
                else: o[k] = {"$": "f32", "o": put(a.astype(np.float32).tobytes()), "n": len(v)}
            else: walk(v)
    elif isinstance(o, list):
        for v in o: walk(v)
walk(d)
h = json.dumps({"data": d, "groups": groups}, separators=(',', ':')).encode()
pad = (-(8 + len(h))) % 4
out = b'PAK1' + len(h).to_bytes(4, 'little') + h + b' ' * pad + bytes(blob)
with gzip.open(dst, 'wb', compresslevel=9) as f: f.write(out)
print(src, '->', dst, f'{len(out)/1e6:.1f}MB raw', end=' ')
import os; print(f'{os.path.getsize(dst)/1e6:.2f}MB gz')
