# Splits a binary STL into its separate parts (connected pieces), biggest
# first, and writes which part each triangle belongs to (<out>.comp.json).
#   python3 stl_parts.py model.stl out
import struct, sys, json, numpy as np
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
n = struct.unpack('<I', b[80:84])[0]
rec = np.frombuffer(b[84:84 + 50 * n], dtype=np.dtype([('n', '<3f4'), ('v', '<9f4'), ('a', '<u2')]))
V = rec['v'].reshape(-1, 3, 3).astype(np.float64)
print('tris', n, 'min', V.reshape(-1, 3).min(0), 'max', V.reshape(-1, 3).max(0))
# weld vertices
q = np.round(V.reshape(-1, 3) / (np.ptp(V.reshape(-1, 3), 0).max() * 1e-6)).astype(np.int64)
_, inv = np.unique(q, axis=0, return_inverse=True)
inv = inv.reshape(-1, 3)
parent = np.arange(inv.max() + 1)
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
for t in inv:
    ra, rb, rc = find(t[0]), find(t[1]), find(t[2])
    parent[rb] = ra; parent[rc] = ra
root = np.array([find(t[0]) for t in inv])
labels, comp = np.unique(root, return_inverse=True)
sizes = np.bincount(comp)
order = np.argsort(-sizes)
print('components', len(labels))
info = []
for rank, c in enumerate(order):
    P = V[comp == c].reshape(-1, 3)
    info.append({'id': int(rank), 'tris': int(sizes[c]), 'min': P.min(0).round(3).tolist(), 'max': P.max(0).round(3).tolist()})
json.dump({'comp': [int(np.where(order == c)[0][0]) for c in comp]}, open(dst + '.comp.json', 'w'))
for i in info[:60]: print(i)
