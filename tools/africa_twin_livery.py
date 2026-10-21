# Prepares the 2023 Honda CRF1100L Africa Twin model (converted with
# usd2glb.py) for the 3D preview: drops the panniers, which hide the rear
# side panels, and gives the painted bodywork its own "Livery" materials so
# only those parts take the graphics. Every other material with "plastic" in
# its name is renamed, so the site doesn't mistake it for bodywork.
#
# The black side panels share one material with the frame covers and the
# engine, so only the triangles of it that sit under a placed template piece
# (right-side `place` transforms in the template JSON) and face outwards
# become livery.
#
#   python3 africa_twin_livery.py at.glb out.glb [template.json]
# then: npx gltfpack -i out.glb -o model.glb -cc -km  (-km keeps the livery
# materials apart from their look-alike originals)

import json
import struct
import sys

import numpy as np

src, dst = sys.argv[1], sys.argv[2]
tpl = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else None

b = open(src, 'rb').read()
jl = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + jl])
bin_ = b[20 + jl + 8:]


def acc(i):
    a = j['accessors'][i]
    v = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
    x = np.frombuffer(bin_, dt, a['count'] * n, v.get('byteOffset', 0) + a.get('byteOffset', 0))
    return x.reshape(-1, n) if n > 1 else x


mats = j['materials']
mname = [m['name'] for m in mats]
# Painted bodywork: red, blue, the printed stripes, the lower front fender,
# the tank badge and the "Africa Twin" lettering (its left-side copy shares a
# material with small parts elsewhere, so it is picked by object).
BODY = {'vehicle_generic_smallspecmap_PRIMARY', 'Material_003', 'remap_SECONDARY', 'plastic', 'badge', 'Material_006'}
BODY_OBJECTS = {'skin0/Object_9', 'skin3/Object_107'}
PANELS = 'plastics_d'
PANNIER = {'gray80_003', 'plastics_d_008'}

prims = []
for n in j['nodes']:
    for p in j['meshes'][n['mesh']]['primitives']:
        at = p['attributes']
        prims.append({
            'name': n.get('name', ''),
            'P': acc(at['POSITION']).astype(np.float32),
            'N': acc(at['NORMAL']).astype(np.float32),
            'UV': acc(at['TEXCOORD_0']).astype(np.float32) if 'TEXCOORD_0' in at else None,
            'I': acc(p['indices']).astype(np.uint32).reshape(-1, 3),
            'mat': p['material'],
        })

# Panniers: the case and its frame behind the seat (the crash bars at the
# front share their materials).
for q in prims:
    if mname[q['mat']] in PANNIER:
        cz = q['P'][q['I']].mean(1)[:, 2]
        q['I'] = q['I'][cz < 0.1]
prims = [q for q in prims if len(q['I'])]

# Same framing as fitModel() in RealBike.tsx with yaw 180: the front (-z in
# the file) points to +x, the right side to +z.
used = np.vstack([q['P'][np.unique(q['I'])] for q in prims])


def turn(P):
    return np.stack([-P[:, 2], P[:, 1], P[:, 0]], 1)


T = turn(used)
lo, hi = T.min(0), T.max(0)
k = (1.17 + 1.2) / (hi[0] - lo[0])
c = (lo + hi) / 2 * k


def world(P):
    W = turn(P) * k
    return W - [c[0] - (-1.2 + 1.17) / 2, lo[1] * k, c[2]]


def inside(pts, poly):
    x, y = pts[:, 0], pts[:, 1]
    hit = np.zeros(len(pts), bool)
    for (xi, yi), (xj, yj) in zip(poly, np.roll(poly, 1, 0)):
        m = (yi > y) != (yj > y)
        with np.errstate(divide='ignore', invalid='ignore'):
            hit ^= m & (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    return hit


outlines = []
if tpl:
    for p in tpl['pieces']:
        if p.get('place') and p['side'] == 'right':
            a, bb, cc, d, e, f = p['place']
            o = np.array(p['outline'])
            outlines.append(np.stack([a * o[:, 0] + cc * o[:, 1] + e, bb * o[:, 0] + d * o[:, 1] + f], 1))

# Side-view depth of every surface (both sides), to keep only outer panels.
G = 0.006
allW = [world(q['P'])[q['I']].mean(1) for q in prims]
cen = np.vstack(allW)
gx = np.floor(cen[:, 0] / G).astype(int)
gy = np.floor(cen[:, 1] / G).astype(int)
key = gx * 100000 + gy
zmax, zmin = {}, {}
for kk, z in zip(key, cen[:, 2]):
    if z > zmax.get(kk, -9):
        zmax[kk] = z
    if z < zmin.get(kk, 9):
        zmin[kk] = z

livery_tris = 0
for q, C in zip(prims, allW):
    name = mname[q['mat']]
    q['liv'] = np.full(len(q['I']), name in BODY or q['name'] in BODY_OBJECTS)
    if name == PANELS and outlines:
        Wn = (turn(q['N'])[q['I']]).mean(1)
        under = np.zeros(len(C), bool)
        for o in outlines:
            under |= inside(C[:, :2], o)
        kk = np.floor(C[:, 0] / G).astype(int) * 100000 + np.floor(C[:, 1] / G).astype(int)
        right = C[:, 2] >= 0
        outer = np.where(right, C[:, 2] >= np.array([zmax[x] for x in kk]) - 0.03, C[:, 2] <= np.array([zmin[x] for x in kk]) + 0.03)
        facing = np.where(right, Wn[:, 2] > 0.25, Wn[:, 2] < -0.25)
        q['liv'] = under & outer & facing
    livery_tris += q['liv'].sum()
print('livery triangles', livery_tris)

# Materials: livery copies are named "Livery ...", other plastics renamed.
out_mats = []
for m in mats:
    m = json.loads(json.dumps(m))
    if m['name'] in BODY:
        m['name'] = 'Livery ' + m['name']
    elif 'plastic' in m['name'].lower():
        m['name'] = m['name'].lower().replace('plastics', 'trim').replace('plastic', 'trim')
    out_mats.append(m)
liv_of = {}


def livery_mat(i):
    if i not in liv_of:
        m = json.loads(json.dumps(mats[i]))
        m['name'] = 'Livery ' + mats[i]['name']
        out_mats.append(m)
        liv_of[i] = len(out_mats) - 1
    return liv_of[i]


chunks, views, accs = [], [], []
off = 0


def add_bytes(data, target=None):
    global off
    pad = (-len(data)) % 4
    chunks.append(data + b'\0' * pad)
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target:
        v['target'] = target
    views.append(v)
    off += len(data) + pad
    return len(views) - 1


def add(arr, typ, comp, target, mm=False):
    a = {'bufferView': add_bytes(arr.tobytes(), target), 'componentType': comp, 'count': arr.shape[0], 'type': typ}
    if mm:
        a['min'] = arr.min(0).tolist()
        a['max'] = arr.max(0).tolist()
    accs.append(a)
    return len(accs) - 1


meshes, nodes = [], []
for q in prims:
    used_v = np.unique(q['I'])
    remap = np.full(len(q['P']), -1, np.int64)
    remap[used_v] = np.arange(len(used_v))
    attrs = {'POSITION': add(q['P'][used_v], 'VEC3', 5126, 34962, True), 'NORMAL': add(q['N'][used_v], 'VEC3', 5126, 34962)}
    if q['UV'] is not None:
        attrs['TEXCOORD_0'] = add(q['UV'][used_v], 'VEC2', 5126, 34962)
    ps = []
    for liv in (False, True):
        I = q['I'][q['liv'] == liv]
        if not len(I):
            continue
        mat = q['mat'] if not liv or mname[q['mat']] in BODY else livery_mat(q['mat'])
        ps.append({'attributes': attrs, 'indices': add(remap[I].astype(np.uint32).ravel(), 'SCALAR', 5125, 34963), 'material': mat})
    meshes.append({'primitives': ps})
    nodes.append({'mesh': len(meshes) - 1, 'name': q['name']})

images = []
for im in j['images']:
    v = j['bufferViews'][im['bufferView']]
    data = bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    images.append({'bufferView': add_bytes(data), 'mimeType': im['mimeType']})

gl = {'asset': {'version': '2.0', 'generator': 'africa_twin_livery.py'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}],
      'nodes': nodes, 'meshes': meshes, 'materials': out_mats, 'textures': j['textures'], 'samplers': j['samplers'], 'images': images,
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': off}]}
js = json.dumps(gl).encode()
js += b' ' * ((-len(js)) % 4)
bb = b''.join(chunks)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bb), 0x004E4942) + bb)
print('world bounds', world(used).min(0), world(used).max(0))
