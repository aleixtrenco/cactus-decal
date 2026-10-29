# The parts map for the KTM 450 SX-F STL: which parts are the plastics
# (livery), seat, tyres (with their tread knobs), frame and swingarm, and the
# helmet and stand that are removed. Part numbers come from stl_parts.py.
#   python3 ktm_sxf_parts.py model.stl out.comp.json parts.json
import struct, json, sys, numpy as np
src, comp_json, out = sys.argv[1:4]
b = open(src, 'rb').read(); n = struct.unpack('<I', b[80:84])[0]
V = np.frombuffer(b[84:84 + 50 * n], dtype=np.dtype([('n', '<3f4'), ('v', '<9f4'), ('a', '<u2')]))['v'].reshape(-1, 3, 3)
comp = np.array(json.load(open(comp_json))['comp'])
K = comp.max() + 1
lo = np.full((K, 3), 9.0); hi = np.full((K, 3), -9.0)
for c in range(K):
    P = V[comp == c].reshape(-1, 3); lo[c] = P.min(0); hi[c] = P.max(0)
LIVERY = [0, 45, 46, 7, 37, 16, 17, 55, 56]
mats = [
    {'name': 'Metal', 'pbrMetallicRoughness': {'baseColorFactor': [0.55, 0.56, 0.58, 1], 'metallicFactor': 0.6, 'roughnessFactor': 0.45}},
    {'name': 'Livery Plastics', 'pbrMetallicRoughness': {'baseColorFactor': [0.93, 0.93, 0.92, 1], 'metallicFactor': 0, 'roughnessFactor': 0.45}},
    {'name': 'Seat', 'pbrMetallicRoughness': {'baseColorFactor': [0.05, 0.05, 0.05, 1], 'metallicFactor': 0, 'roughnessFactor': 0.85}},
    {'name': 'Tyre', 'pbrMetallicRoughness': {'baseColorFactor': [0.035, 0.035, 0.035, 1], 'metallicFactor': 0, 'roughnessFactor': 0.9}},
    {'name': 'Frame', 'pbrMetallicRoughness': {'baseColorFactor': [0.92, 0.36, 0.05, 1], 'metallicFactor': 0.2, 'roughnessFactor': 0.5}},
    {'name': 'Black parts', 'pbrMetallicRoughness': {'baseColorFactor': [0.08, 0.08, 0.09, 1], 'metallicFactor': 0.3, 'roughnessFactor': 0.6}},
    {'name': 'REMOVE', 'pbrMetallicRoughness': {'baseColorFactor': [1, 0, 1, 1]}},
]
assign = {}
for c in LIVERY: assign[c] = 1
assign[30] = 2
assign[10] = 4
assign[5] = 5
# wheels: tyres 18 (rear) and 27 (front); knobs are small parts inside each tyre ring (y-z plane)
for t in (18, 27):
    assign[t] = 3
    cy, cz = (lo[t][1] + hi[t][1]) / 2, (lo[t][2] + hi[t][2]) / 2
    r_out = (hi[t][2] - lo[t][2]) / 2
    for c in range(K):
        if c in assign: continue
        P = V[comp == c].reshape(-1, 3)
        d = np.hypot(P[:, 1] - cy, P[:, 2] - cz)
        if np.abs(P[:, 0]).max() < 0.09 and d.min() > r_out * 0.8 and d.max() < r_out * 1.12: assign[c] = 3
# helmet on the seat and the stand under the bike
for c in range(K):
    if lo[c][1] > 0.27 and hi[c][1] < 0.68 and lo[c][2] > 0.95: assign[c] = 6
    if hi[c][2] < 0.37 and abs(lo[c][1]) < 0.2 and abs(hi[c][1]) < 0.2 and abs(lo[c][0]) < 0.2 and abs(hi[c][0]) < 0.2 and lo[c][2] < 0.02: assign[c] = 6
    if c in (1, 28, 195): assign[c] = 6
print('removed', [c for c, m in assign.items() if m == 6][:40], 'tyre parts', sum(1 for m in assign.values() if m == 3))
json.dump({'materials': mats, 'assign': {str(k): v for k, v in assign.items()}, 'default': 0}, open(out, 'w'))
