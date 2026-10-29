# Converts a binary STL (Z up) to a GLB (Y up). With a parts map (see
# ktm_sxf_parts.py) the parts are grouped into materials, and parts given the
# material "REMOVE" are left out.
#   python3 stl2glb.py model.stl out.comp.json model.glb [parts.json]
# then: npx gltfpack -i model.glb -o public/models/x.glb -cc -km
# STL (Z up) -> GLB (Y up), one node per connected part; optional part->material map
import struct, sys, json, numpy as np
src, comp_json, dst = sys.argv[1:4]
groups = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
b = open(src, 'rb').read()
n = struct.unpack('<I', b[80:84])[0]
rec = np.frombuffer(b[84:84 + 50 * n], dtype=np.dtype([('n', '<3f4'), ('v', '<9f4'), ('a', '<u2')]))
V = rec['v'].reshape(-1, 3, 3).astype(np.float32)
V = np.stack([V[..., 0], V[..., 2], -V[..., 1]], -1)  # Z up -> Y up
comp = np.array(json.load(open(comp_json))['comp'])
mats = groups['materials'] if groups else [{'name': 'part', 'pbrMetallicRoughness': {'baseColorFactor': [0.7, 0.7, 0.7, 1], 'metallicFactor': 0, 'roughnessFactor': 0.6}}]
assign = {int(k): v for k, v in groups['assign'].items()} if groups else {}
default = groups.get('default', 0) if groups else 0
bins, views, accs, meshes, nodes = [], [], [], [], []
off = 0
def add(arr, typ, comp_t, target, mm=False):
    global off
    data = arr.tobytes(); pad = (-len(data)) % 4
    bins.append(data + b'\0' * pad); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target}); off += len(data) + pad
    a = {'bufferView': len(views) - 1, 'componentType': comp_t, 'count': arr.shape[0], 'type': typ}
    if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
# group parts by material when a map is given (fewer nodes), else one node per part
keys = sorted(set(assign.get(c, default) for c in range(comp.max() + 1))) if groups else range(comp.max() + 1)
for key in keys:
    sel = np.array([assign.get(c, default) == key for c in comp]) if groups else comp == key
    if groups and mats[key]['name'] == 'REMOVE': continue
    T = V[sel]
    if not len(T): continue
    P = T.reshape(-1, 3)
    e1 = T[:, 1] - T[:, 0]; e2 = T[:, 2] - T[:, 0]
    fn = np.cross(e1, e2); fn /= np.linalg.norm(fn, axis=1, keepdims=True) + 1e-12
    # smooth normals within a part: average over welded positions
    q = np.round(P / 1e-5).astype(np.int64)
    u, inv = np.unique(q, axis=0, return_inverse=True)
    acc = np.zeros((len(u), 3)); np.add.at(acc, inv.ravel(), np.repeat(fn, 3, 0))
    vn = acc / (np.linalg.norm(acc, axis=1, keepdims=True) + 1e-12)
    pos = (u * 1e-5).astype(np.float32)
    # keep sharp edges reasonable: use per-face normals where they differ a lot
    N = vn[inv.ravel()]
    dot = (N * np.repeat(fn, 3, 0)).sum(1)
    N[dot < 0.5] = np.repeat(fn, 3, 0)[dot < 0.5]
    Pf = P.astype(np.float32); Nf = N.astype(np.float32)
    idx = np.arange(len(Pf), dtype=np.uint32)
    prim = {'attributes': {'POSITION': add(Pf, 'VEC3', 5126, 34962, True), 'NORMAL': add(Nf, 'VEC3', 5126, 34962)}, 'indices': add(idx, 'SCALAR', 5125, 34963), 'material': int(key) if groups else 0}
    meshes.append({'primitives': [prim]}); nodes.append({'mesh': len(meshes) - 1, 'name': (mats[key]['name'] if groups else f'c{key}')})
gl = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': mats, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': off}]}
js = json.dumps(gl).encode(); js += b' ' * ((-len(js)) % 4); bb = b''.join(bins)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bb), 0x004E4942) + bb)
print(dst, len(nodes), 'nodes', round((12 + 16 + len(js) + len(bb)) / 1e6, 1), 'MB')
