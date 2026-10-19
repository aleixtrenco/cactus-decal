"""Makes a lighter copy of a .glb for phones: every texture is scaled down
(default: longest side at most 512 px) and re-saved as JPEG/PNG.

    python3 tools/glb_lite.py in.glb out.glb [max_px]
"""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
max_px = int(sys.argv[3]) if len(sys.argv) > 3 else 512

data = open(src, 'rb').read()
json_len = struct.unpack('<I', data[12:16])[0]
gltf = json.loads(data[20:20 + json_len])
bin_start = 20 + json_len + 8
binary = data[bin_start:bin_start + struct.unpack('<I', data[20 + json_len:24 + json_len])[0]]

views = gltf['bufferViews']
image_views = {im['bufferView']: im for im in gltf.get('images', []) if 'bufferView' in im}
# Every slice of the GLB's binary chunk (buffer 0): plain buffer views, and
# the compressed data that meshopt views point at through their extension.
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
    if i in image_views and ref is views[i]:
        im = Image.open(io.BytesIO(chunk))
        if max(im.size) > max_px:
            k = max_px / max(im.size)
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        buf = io.BytesIO()
        if image_views[i].get('mimeType') == 'image/png':
            im.save(buf, 'PNG', optimize=True)
        else:
            im.convert('RGB').save(buf, 'JPEG', quality=82)
        chunk = buf.getvalue()
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
