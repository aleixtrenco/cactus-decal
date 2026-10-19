"""Convert a .usdz (UsdPreviewSurface materials, optional skinning) to .glb.

Usage: python usd2glb.py in.usdz out.glb
"""
import io
import struct
import sys
import zipfile

import numpy as np
from PIL import Image
from pxr import Gf, Usd, UsdGeom, UsdShade, UsdSkel

src, dst = sys.argv[1], sys.argv[2]
zf = zipfile.ZipFile(src)
stage = Usd.Stage.Open(src)
stage.SetEditTarget(stage.GetSessionLayer())
UsdSkel.BakeSkinning(stage.Traverse())
mpu = UsdGeom.GetStageMetersPerUnit(stage) or 1.0
up = UsdGeom.GetStageUpAxis(stage)

bin_chunks = []
offset = 0
buffer_views = []
accessors = []


def add_view(data: bytes, target=None):
    global offset
    pad = (-len(data)) % 4
    bin_chunks.append(data + b"\0" * pad)
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
    if target:
        view["target"] = target
    buffer_views.append(view)
    offset += len(data) + pad
    return len(buffer_views) - 1


def add_accessor(arr: np.ndarray, kind: str, comp: int, target=None, minmax=False):
    view = add_view(arr.tobytes(), target)
    acc = {"bufferView": view, "componentType": comp, "count": int(arr.shape[0]), "type": kind}
    if minmax:
        acc["min"] = arr.min(axis=0).tolist()
        acc["max"] = arr.max(axis=0).tolist()
    accessors.append(acc)
    return len(accessors) - 1


images, textures, materials = [], [], []
tex_cache, mat_cache = {}, {}


def texture_from(path: str, max_size=2048):
    path = path.lstrip("./")
    if path in tex_cache:
        return tex_cache[path]
    data = zf.read(path)
    im = Image.open(io.BytesIO(data))
    if max(im.size) > max_size:
        im.thumbnail((max_size, max_size))
        out = io.BytesIO()
        im.convert("RGB").save(out, "JPEG", quality=88)
        data = out.getvalue()
    view = add_view(data)
    images.append({"bufferView": view, "mimeType": "image/jpeg" if path.lower().endswith((".jpg", ".jpeg")) else "image/png"})
    textures.append({"source": len(images) - 1})
    tex_cache[path] = len(textures) - 1
    return tex_cache[path]


def connected_file(inp):
    if not inp or not inp.HasConnectedSource():
        return None
    srcs = inp.GetConnectedSources()[0]
    if not srcs:
        return None
    shader = UsdShade.Shader(srcs[0].source.GetPrim())
    f = shader.GetInput("file")
    if f and f.Get():
        return f.Get().path.split("[")[-1].rstrip("]")
    return None


def material_for(prim):
    mat, _ = UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()
    key = str(mat.GetPath()) if mat else "default"
    if key in mat_cache:
        return mat_cache[key]
    m = {"name": mat.GetPrim().GetName() if mat else "default", "pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.6}}
    if mat:
        surf = mat.ComputeSurfaceSource()[0]
        if surf:
            dc = surf.GetInput("diffuseColor")
            f = connected_file(dc)
            if f:
                m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": texture_from(f)}
            elif dc and dc.Get() is not None:
                c = dc.Get()
                m["pbrMetallicRoughness"]["baseColorFactor"] = [c[0], c[1], c[2], 1.0]
            nf = connected_file(surf.GetInput("normal"))
            if nf:
                m["normalTexture"] = {"index": texture_from(nf)}
            for name, field in (("roughness", "roughnessFactor"), ("metallic", "metallicFactor")):
                i = surf.GetInput(name)
                if i and not i.HasConnectedSource() and i.Get() is not None:
                    m["pbrMetallicRoughness"][field] = float(i.Get())
    materials.append(m)
    mat_cache[key] = len(materials) - 1
    return mat_cache[key]


meshes, nodes = [], []
xf_cache = UsdGeom.XformCache()
for prim in stage.Traverse():
    if not prim.IsA(UsdGeom.Mesh):
        continue
    mesh = UsdGeom.Mesh(prim)
    pts = np.array(mesh.GetPointsAttr().Get(), dtype=np.float64)
    counts = np.array(mesh.GetFaceVertexCountsAttr().Get(), dtype=np.int64)
    idx = np.array(mesh.GetFaceVertexIndicesAttr().Get(), dtype=np.int64)
    if len(pts) == 0:
        continue
    m4 = np.array(xf_cache.GetLocalToWorldTransform(prim), dtype=np.float64)
    pts = np.c_[pts, np.ones(len(pts))] @ m4
    pts = pts[:, :3] * mpu
    if up == "Z":
        pts = pts[:, [0, 2, 1]] * np.array([1, 1, -1])

    # Fan-triangulate, keeping face-vertex positions so faceVarying UVs work.
    starts = np.concatenate([[0], np.cumsum(counts)[:-1]])
    tri_fv = []
    for s, c in zip(starts, counts):
        for k in range(1, c - 1):
            tri_fv += [s, s + k, s + k + 1]
    tri_fv = np.array(tri_fv, dtype=np.int64)
    if mesh.GetOrientationAttr().Get() == "leftHanded":
        tri_fv = tri_fv.reshape(-1, 3)[:, ::-1].reshape(-1)

    uv = None
    pv = UsdGeom.PrimvarsAPI(prim)
    for name in ("st", "st0", "UVMap", "uv"):
        p = pv.GetPrimvar(name)
        if p and p.HasValue():
            vals = np.array(p.ComputeFlattened(), dtype=np.float32)
            interp = p.GetInterpolation()
            uv = vals if interp == "faceVarying" else vals[idx] if interp in ("vertex", "varying") else None
            break

    # Smooth normals per point.
    v_idx = idx[tri_fv].reshape(-1, 3)
    a, b, c = pts[v_idx[:, 0]], pts[v_idx[:, 1]], pts[v_idx[:, 2]]
    fn = np.cross(b - a, c - a)
    pn = np.zeros_like(pts)
    for k in range(3):
        np.add.at(pn, v_idx[:, k], fn)
    pn /= np.linalg.norm(pn, axis=1, keepdims=True) + 1e-12

    # Unique (point, uv) pairs become glTF vertices.
    fv_point = idx[tri_fv]
    if uv is not None:
        uvq = np.round(uv[tri_fv] * 1e5).astype(np.int64)
        key = np.c_[fv_point, uvq]
    else:
        key = fv_point[:, None]
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    first = np.zeros(len(uniq), dtype=np.int64)
    first[inv] = np.arange(len(inv))
    pos = pts[fv_point[first]].astype(np.float32)
    nor = pn[fv_point[first]].astype(np.float32)
    attrs = {
        "POSITION": add_accessor(pos, "VEC3", 5126, 34962, minmax=True),
        "NORMAL": add_accessor(nor, "VEC3", 5126, 34962),
    }
    if uv is not None:
        t = uv[tri_fv][first].copy()
        t[:, 1] = 1.0 - t[:, 1]
        attrs["TEXCOORD_0"] = add_accessor(t.astype(np.float32), "VEC2", 5126, 34962)
    ind = inv.astype(np.uint32).reshape(-1)
    prim_def = {"attributes": attrs, "indices": add_accessor(ind, "SCALAR", 5125, 34963), "material": material_for(prim)}
    meshes.append({"name": prim.GetParent().GetName() + "/" + prim.GetName(), "primitives": [prim_def]})
    nodes.append({"mesh": len(meshes) - 1, "name": meshes[-1]["name"]})

import json

binary = b"".join(bin_chunks)
gltf = {
    "asset": {"version": "2.0", "generator": "cactus usd2glb"},
    "scene": 0,
    "scenes": [{"nodes": list(range(len(nodes)))}],
    "nodes": nodes,
    "meshes": meshes,
    "materials": materials,
    "textures": textures,
    "images": images,
    "samplers": [{}],
    "accessors": accessors,
    "bufferViews": buffer_views,
    "buffers": [{"byteLength": len(binary)}],
}
for t in textures:
    t["sampler"] = 0
js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
total = 12 + 8 + len(js) + 8 + len(binary)
with open(dst, "wb") as f:
    f.write(struct.pack("<III", 0x46546C67, 2, total))
    f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
    f.write(struct.pack("<II", len(binary), 0x004E4942) + binary)
print("meshes", len(meshes), "materials", [m["name"] for m in materials], "bytes", total)
