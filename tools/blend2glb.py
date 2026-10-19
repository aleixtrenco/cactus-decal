"""Convert a Blender scene (.blend) to a .glb for the 3D preview.

Modifiers (including geometry nodes) are applied. Materials can be renamed
on the way, e.g. so only the plastics that carry graphics match the
"livery/plastic" names the site looks for.

Usage (needs Blender's Python module: pip install bpy):
    python blend2glb.py in.blend out.glb ["Old name=New name" ...]
"""
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:]
src, dst, renames = args[0], args[1], args[2:]

bpy.ops.wm.open_mainfile(filepath=src)
for pair in renames:
    old, new = pair.split('=', 1)
    if old in bpy.data.materials:
        bpy.data.materials[old].name = new
        print(f'material {old!r} -> {new!r}')

# Only meshes matter: lights and cameras are dropped.
for o in list(bpy.data.objects):
    if o.type not in {'MESH', 'EMPTY'}:
        bpy.data.objects.remove(o)

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format='GLB',
    export_apply=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
print('wrote', dst)
