"""Paints out light lettering (e.g. a maker's logo) on dark areas of a .glb's
textures: in each box, grey and white pixels below the first dark pixel of
their column become the box's dark colour.

    python3 tools/glb_retouch.py in.glb out.glb IMAGE:X0,Y0,X1,Y1 [...]

Boxes are fractions of the texture (0-1), so they work on any copy size.
Used to remove the "BACKYARD" lettering and the maker's tag from the Honda
CRF 450 model (images 0 and 4).
"""
import io, json, struct, sys
import numpy as np
from PIL import Image

src, dst, *specs = sys.argv[1:]
boxes = {}
for s in specs:
    i, b = s.split(':')
    boxes.setdefault(int(i), []).append([float(v) for v in b.split(',')])

data = open(src, 'rb').read()
json_len = struct.unpack('<I', data[12:16])[0]
gltf = json.loads(data[20:20 + json_len])
bin_start = 20 + json_len + 8
binary = data[bin_start:bin_start + struct.unpack('<I', data[20 + json_len:24 + json_len])[0]]
views = gltf['bufferViews']
image_of = {im['bufferView']: n for n, im in enumerate(gltf.get('images', [])) if 'bufferView' in im}


def retouch(chunk, mime, bs):
    im = np.array(Image.open(io.BytesIO(chunk)).convert('RGB'))
    h, w = im.shape[:2]
    for x0, y0, x1, y1 in bs:
        X0, Y0, X1, Y1 = int(x0 * w), int(y0 * h), int(np.ceil(x1 * w)), int(np.ceil(y1 * h))
        r = im[Y0:Y1, X0:X1]
        dark = r.max(2) < 60
        # Lettering and its soft edges: anything grey or white (the red and
        # other colours around the bar have a strong hue).
        light = r.max(2).astype(int) - r.min(2) < 70
        # Only lettering inside the dark area: below the first dark pixel of
        # each column, so light shapes touching the box's top stay.
        below = np.cumsum(dark, 0) > 0
        mask = light & below
        colour = np.median(r[dark], 0) if dark.any() else np.zeros(3)
        r[mask] = colour
    buf = io.BytesIO()
    if mime == 'image/png':
        Image.fromarray(im).save(buf, 'PNG', optimize=True)
    else:
        Image.fromarray(im).save(buf, 'JPEG', quality=90)
    return buf.getvalue()


regions = []
for i, v in enumerate(views):
    ext = v.get('extensions', {}).get('EXT_meshopt_compression')
    if ext and ext.get('buffer', 0) == 0:
        regions.append((i, ext))
    if v.get('buffer', 0) == 0:
        regions.append((i, v))
out = bytearray()
for i, ref in regions:
    start = ref.get('byteOffset', 0)
    chunk = binary[start:start + ref['byteLength']]
    if i in image_of and ref is views[i] and image_of[i] in boxes:
        chunk = retouch(chunk, gltf['images'][image_of[i]].get('mimeType'), boxes[image_of[i]])
    while len(out) % 4:
        out.append(0)
    ref['byteOffset'] = len(out)
    ref['byteLength'] = len(chunk)
    out += chunk
while len(out) % 4:
    out.append(0)
gltf['buffers'][0]['byteLength'] = len(out)

j = json.dumps(gltf, separators=(',', ':')).encode()
j += b' ' * (-len(j) % 4)
body = struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(out), 0x004E4942) + bytes(out)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + len(body)) + body)
print(f'{dst}: {(12 + len(body)) / 1e6:.1f} MB')
