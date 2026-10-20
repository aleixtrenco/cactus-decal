# Splits a single-texture photo-scan bike (converted with usd2glb.py to adv.glb,
# texture at 0/main_baseColor.jpg) into body parts and 'Livery Plastics' by
# texture colour, turns it to face +x, centres it and crops the scanned ground.
# Written for the KTM 790 Adventure scan; the angle and colour rules are
# specific to it. Run next to adv.glb: python3 scan_split_livery.py

import colorsys
exec(open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'scan_geo.py')).read())
th=np.radians(40.18); c,s=np.cos(th),np.sin(th)
def rot(A):  # front direction (cos th, sin th) in x,z -> +x
  x,y,z=A[:,0],A[:,1],A[:,2]
  return np.stack([x*c+z*s, y, -x*s+z*c],1).astype(np.float32)
H,W=tex.shape[:2]
def texel(uv):
  return tex[np.clip((uv[...,1]*(H-1)).astype(int),0,H-1),np.clip((uv[...,0]*(W-1)).astype(int),0,W-1)].astype(float)/255
def is_livery(rgb):
  r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
  mx=np.max(rgb,-1); mn=np.min(rgb,-1); sat=(mx-mn)/np.maximum(mx,1e-6)
  orange=(r>0.45)&(r>g*1.6)&(r>b*1.8)&(sat>0.5)
  white=(mn>0.62)&(sat<0.16)
  navy=(b>r*1.25)&(b>0.16)&(sat>0.3)&(mx<0.6)
  return orange|white|navy
out=[]
stats=[0,0,0]
# The bike's footprint after turning it: centre it and keep only what is on it.
allP=np.vstack([rot(q[0]) for q in prims]); body_pts=allP[allP[:,1]>0.3]
zc=np.median(body_pts[:,2]); xlo,xhi=np.percentile(body_pts[:,0],[0.5,99.5])
print('centre z',zc,'x',xlo,xhi)
for Pp,N,UV,I in prims:
  Pr=rot(Pp); Nr=rot(N)
  Pr[:,2]-=zc; Pr[:,0]-=(xlo+xhi)/2
  tri=Pr[I]; cen=tri.mean(1)
  # ground: thin disc at y~0 well away from the wheels' contact
  ground=(tri[:,:,1].max(1)<0.035)|(np.abs(cen[:,2])>0.5)|(cen[:,0]<xlo-(xlo+xhi)/2-0.05)|(cen[:,0]>xhi-(xlo+xhi)/2+0.05)|((cen[:,1]<0.12)&(np.abs(cen[:,2])>0.2))
  # sample texture at centroid and the 3 corners
  uvs=UV[I]; samp=np.concatenate([uvs, uvs.mean(1,keepdims=True)],1)
  liv=is_livery(texel(samp)).mean(1)
  # charts: connected triangles sharing vertices
  n=len(Pp); parent=np.arange(n)
  def find(a):
    while parent[a]!=a:
      parent[a]=parent[parent[a]]; a=parent[a]
    return a
  for t in I:
    ra,rb,rc=find(t[0]),find(t[1]),find(t[2])
    parent[rb]=ra; parent[rc]=ra
  root=np.array([find(t[0]) for t in I])
  e1=tri[:,1]-tri[:,0]; e2=tri[:,2]-tri[:,0]; area=np.linalg.norm(np.cross(e1,e2),axis=1)/2
  score={}
  for r,a,lv in zip(root,area,liv):
    sa,sl=score.get(r,(0,0)); score[r]=(sa+a,sl+a*lv)
  chart=np.array([score[r][1]/max(score[r][0],1e-12) for r in root])
  # plastics sit on the body, not the wheels, ground or exhaust
  body=(cen[:,1]>0.5)&(cen[:,1]<1.45)
  livery=(~ground)&body&((chart>0.45)|((liv>0.6)&(chart>0.25)))
  keep=~ground
  stats[0]+=keep.sum(); stats[1]+=livery.sum(); stats[2]+=ground.sum()
  out.append((Pr,Nr,UV,I[keep&~livery],I[livery]))
print('kept',stats[0],'livery',stats[1],'ground removed',stats[2])
# write glb
import io
bins=[];views=[];accs=[];off=0
def add(arr,target,typ,comp,mm=False):
  global off
  data=arr.tobytes(); pad=(-len(data))%4
  bins.append(data+b'\0'*pad); views.append({'buffer':0,'byteOffset':off,'byteLength':len(data),'target':target}); off+=len(data)+pad
  a={'bufferView':len(views)-1,'componentType':comp,'count':len(arr) if arr.ndim==1 else arr.shape[0],'type':typ}
  if mm: a['min']=arr.min(0).tolist(); a['max']=arr.max(0).tolist()
  accs.append(a); return len(accs)-1
meshes=[];nodes=[]
for Pr,Nr,UV,Ia,Ib in out:
  ap=add(Pr,34962,'VEC3',5126,True); an=add(Nr,34962,'VEC3',5126); au=add(UV.astype(np.float32),34962,'VEC2',5126)
  prs=[]
  for mat,Ix in ((0,Ia),(1,Ib)):
    if len(Ix)==0: continue
    prs.append({'attributes':{'POSITION':ap,'NORMAL':an,'TEXCOORD_0':au},'indices':add(Ix.astype(np.uint32).ravel(),34963,'SCALAR',5125),'material':mat})
  meshes.append({'primitives':prs}); nodes.append({'mesh':len(meshes)-1,'name':f'bike{len(nodes)}'})
img=open('0/main_baseColor.jpg','rb').read(); pad=(-len(img))%4
bins.append(img+b'\0'*pad); views.append({'buffer':0,'byteOffset':off,'byteLength':len(img)}); off+=len(img)+pad
gl={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,
 'materials':[{'name':'Frame and parts','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0.1,'roughnessFactor':0.7}},
              {'name':'Livery Plastics','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':0.5}}],
 'textures':[{'source':0}],'images':[{'bufferView':len(views)-1,'mimeType':'image/jpeg'}],
 'accessors':accs,'bufferViews':views,'buffers':[{'byteLength':off}]}
js=json.dumps(gl).encode(); js+=b' '*((-len(js))%4); bb=b''.join(bins)
open('adv-split.glb','wb').write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bb))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bb),0x004E4942)+bb)
