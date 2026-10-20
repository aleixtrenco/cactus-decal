import json,struct,numpy as np
from PIL import Image
b=open('adv.glb','rb').read(); l=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+l]); bin_=b[20+l+8:]
def acc(i):
  a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]; n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
  dt={5126:np.float32,5125:np.uint32,5123:np.uint16}[a['componentType']]
  off=v.get('byteOffset',0)+a.get('byteOffset',0)
  x=np.frombuffer(bin_,dt,a['count']*n,off)
  return x.reshape(-1,n) if n>1 else x
tex=np.asarray(Image.open('0/main_baseColor.jpg').convert('RGB'))
prims=[]
for m in j['meshes']:
  for p in m['primitives']:
    prims.append((acc(p['attributes']['POSITION']),acc(p['attributes']['NORMAL']),acc(p['attributes']['TEXCOORD_0']),acc(p['indices']).reshape(-1,3)))
