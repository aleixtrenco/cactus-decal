// A real 3D bike (.glb) with the customer's kit projected onto it.
//
// The model doesn't need special UVs or separate parts. The kit artwork is
// painted in side-view "world" space (see lib/graphics.ts), masked to the
// template pieces placed on the model, and projected sideways onto the
// outermost surface of each side, the same way a printed decal wraps the
// plastics. Depth maps taken from each side stop the artwork from landing on
// anything hidden behind the plastics. The front plate is projected from the
// front.

import { useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { FinishId } from '../data/pricing'
import { ensureAssets, paintDecalSheet, paintFrontPlate, sheetWidth, WORLD } from '../lib/graphics'
import { modelUrl, panelSet, sideOutlines, type BikeTemplate, type ModelSetup } from '../lib/templates'
import { bikeById, makeInfo } from '../data/bikes'
import { plasticsHex, type KitConfig } from '../store/config'

// Overall bike length the model is fitted to (rear fender tip to front tyre).
const FIT = { x0: -1.2, x1: 1.17 }
const CAM_Z = 3
const NEAR = 0.01
const FAR = 6
// Parts that never carry graphics, matched on mesh or material names.
const NO_DECAL = /tyre|tire|wheel|rim|spoke|hub|chain|sprocket|exhaust|pipe|muffler|silencer|engine|cylinder|brake|disc|rotor|caliper|frame|chassis|swing|shock|spring|fork(?!.?guard)|handle|bar|grip|lever|chrome|metal|bolt|screw|seat/i

const LIVERY = /livery|plastic|decal|graphic|sticker|bodywork|fairing/i

const FINISH: Record<FinishId, { rough: number; metal: number; clear: number }> = {
  gloss: { rough: 0.22, metal: 0, clear: 1 },
  matte: { rough: 0.85, metal: 0, clear: 0 },
  chrome: { rough: 0.12, metal: 0.8, clear: 1 },
  holo: { rough: 0.18, metal: 0.5, clear: 1 },
}

const dracoUrl = 'https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/draco/gltf/'

// Scales and places the model so it stands on y = 0, faces +x and spans the
// same length as the built-in bike. `setup` fine-tunes the automatic fit.
export function fitModel(root: THREE.Object3D, setup: ModelSetup) {
  root.position.set(0, 0, 0)
  root.scale.setScalar(1)
  root.rotation.set(0, 0, 0)
  root.updateMatrixWorld(true)
  // Lay the bike's length along x first; `yaw` then turns it to face +x.
  const raw = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  const base = raw.z > raw.x ? 90 : 0
  root.rotation.set(0, ((base + setup.yaw) * Math.PI) / 180, 0)
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const k = ((FIT.x1 - FIT.x0) / size.x) * setup.scale
  root.scale.setScalar(k)
  root.updateMatrixWorld(true)
  box.setFromObject(root)
  const c = box.getCenter(new THREE.Vector3())
  root.position.set((FIT.x0 + FIT.x1) / 2 - c.x + setup.dx, -box.min.y + setup.dy, -c.z)
  root.updateMatrixWorld(true)
}

const hasLiveryMaterial = (root: THREE.Object3D) => {
  let found = false
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) for (const m of [mesh.material].flat()) if (LIVERY.test(m.name)) found = true
  })
  return found
}

// If the model has a dedicated graphics material (often called "livery"),
// only that gets the kit; otherwise everything not ruled out by name.
export function isDecalSurface(root: THREE.Object3D) {
  const livery = hasLiveryMaterial(root)
  return (mesh: THREE.Mesh, mat: THREE.Material) => (livery ? LIVERY.test(mat.name) : !NO_DECAL.test(mesh.name) && !NO_DECAL.test(mat.name))
}

function depthTarget(w: number, h: number) {
  const rt = new THREE.WebGLRenderTarget(w, h)
  rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType)
  return rt
}

// Orthographic cameras looking at the bike from the right (+z), the left
// (-z) and the front (+x). Their screen coordinates match the artwork's.
function sideCams() {
  const { x0, x1, y0, y1 } = WORLD
  const right = new THREE.OrthographicCamera(x0, x1, y1, y0, NEAR, FAR)
  right.position.set(0, 0, CAM_Z)
  right.lookAt(0, 0, 0)
  const left = new THREE.OrthographicCamera(-x1, -x0, y1, y0, NEAR, FAR)
  left.position.set(0, 0, -CAM_Z)
  left.lookAt(0, 0, 0)
  const front = new THREE.OrthographicCamera(-0.6, 0.6, y1, y0, NEAR, FAR)
  front.position.set(CAM_Z, 0, 0)
  front.lookAt(0, 0, 0)
  for (const c of [right, left, front]) c.updateMatrixWorld(true)
  return { right, left, front }
}

interface Projector {
  uniforms: Record<string, THREE.IUniform>
  sheets: { right: HTMLCanvasElement; left: HTMLCanvasElement; plate: HTMLCanvasElement }
  textures: THREE.Texture[]
  depth: { right: THREE.WebGLRenderTarget; left: THREE.WebGLRenderTarget; front: THREE.WebGLRenderTarget }
}

function makeProjector(): Projector {
  const W = sheetWidth()
  const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })
  const sheets = { right: canvas(W, W / 2), left: canvas(W, W / 2), plate: canvas(W / 4, W / 4) }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  const tR = tex(sheets.right)
  const tL = tex(sheets.left)
  const tP = tex(sheets.plate)
  const D = 1024
  const depth = { right: depthTarget(D, D / 2), left: depthTarget(D, D / 2), front: depthTarget(D / 2, D / 2) }
  const { x0, x1, y0, y1 } = WORLD
  return {
    sheets,
    textures: [tR, tL, tP],
    depth,
    uniforms: {
      uSheetR: { value: tR },
      uSheetL: { value: tL },
      uPlate: { value: tP },
      uDepthR: { value: depth.right.depthTexture },
      uDepthL: { value: depth.left.depthTexture },
      uDepthF: { value: depth.front.depthTexture },
      uWorld: { value: new THREE.Vector4(x0, x1, y0, y1) },
      uCam: { value: new THREE.Vector3(CAM_Z, NEAR, FAR) },
      uPlateRect: { value: new THREE.Vector3(1.02, 0.3, 0.27) },
      uFinish: { value: new THREE.Vector3(0.22, 0, 1) },
      uOn: { value: 0 },
      uPlastic: { value: new THREE.Color('#141414') },
    },
  }
}

// Adds the projection to a standard/physical material.
function patchMaterial(m: THREE.Material, P: Projector, livery: boolean) {
  if (!(m instanceof THREE.MeshStandardMaterial)) return
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, P.uniforms)
    // A livery material's own printed graphics are replaced by bare plastic.
    shader.defines = { ...shader.defines, CDL_LIVERY: livery ? 1 : 0 }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDecalPos;\nvarying vec3 vDecalNormal;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvDecalPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvDecalNormal = normalize(mat3(modelMatrix) * objectNormal);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDecalPos;
varying vec3 vDecalNormal;
uniform sampler2D uSheetR, uSheetL, uPlate, uDepthR, uDepthL, uDepthF;
uniform vec4 uWorld;
uniform vec3 uCam, uPlateRect, uFinish;
uniform float uOn;
uniform vec3 uPlastic;
float decalA = 0.0;
// Distance from an ortho camera to the first surface it sees.
float camDist(sampler2D d, vec2 uv) { return uCam.y + texture2D(d, uv).x * (uCam.z - uCam.y); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#if CDL_LIVERY == 1
if (uOn > 0.5) diffuseColor.rgb = uPlastic;
#endif
if (uOn > 0.5) {
  float ww = uWorld.y - uWorld.x;
  float wh = uWorld.w - uWorld.z;
  float v = (vDecalPos.y - uWorld.z) / wh;
  vec4 dec = vec4(0.0);
  float tol = 0.012;
  if (vDecalPos.z >= 0.0 && vDecalNormal.z > -0.2) {
    vec2 uv = vec2((vDecalPos.x - uWorld.x) / ww, v);
    if (abs((uCam.x - vDecalPos.z) - camDist(uDepthR, uv)) < tol) dec = texture2D(uSheetR, uv);
  } else if (vDecalPos.z < 0.0 && vDecalNormal.z < 0.2) {
    vec2 uv = vec2((uWorld.y - vDecalPos.x) / ww, v);
    if (abs((uCam.x + vDecalPos.z) - camDist(uDepthL, uv)) < tol) dec = texture2D(uSheetL, uv);
  }
  // Front number plate, projected from the front.
  vec2 pr = vec2(-vDecalPos.z / uPlateRect.y + 0.5, (vDecalPos.y - uPlateRect.x) / uPlateRect.z + 0.5);
  if (vDecalNormal.x > 0.25 && all(greaterThan(pr, vec2(0.0))) && all(lessThan(pr, vec2(1.0)))) {
    vec2 fuv = vec2((-vDecalPos.z + 0.6) / 1.2, v);
    if (abs((uCam.x - vDecalPos.x) - camDist(uDepthF, fuv)) < tol * 1.5) dec = vec4(texture2D(uPlate, pr).rgb, 1.0);
  }
  decalA = dec.a;
  diffuseColor.rgb = mix(diffuseColor.rgb, dec.rgb, decalA);
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uFinish.x, decalA);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, uFinish.y, decalA);')
  }
  m.customProgramCacheKey = () => `cdl-decal-${livery ? 1 : 0}`
  m.needsUpdate = true
}

function loadModel(url: string) {
  return useLoader(GLTFLoader, url, (loader) => {
    const draco = new DRACOLoader()
    draco.setDecoderPath(dracoUrl)
    loader.setDRACOLoader(draco)
    loader.setMeshoptDecoder(MeshoptDecoder)
  })
}

export default function RealBike({ cfg, template }: { cfg: KitConfig; template: BikeTemplate & { model: ModelSetup } }) {
  const gltf = loadModel(modelUrl(template.model.url))
  const gl = useThree((s) => s.gl)
  const P = useMemo(makeProjector, [])

  // Our own copy of the scene with patched materials, fitted to world space.
  const root = useMemo(() => {
    const r = new THREE.Group()
    const copy = gltf.scene.clone(true)
    const decalOn = isDecalSurface(copy)
    const hasLivery = hasLiveryMaterial(copy)
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const next = mats.map((mat) => {
        const c = mat.clone()
        if (decalOn(mesh, mat)) patchMaterial(c, P, hasLivery)
        return c
      })
      mesh.material = Array.isArray(mesh.material) ? next : next[0]
    })
    r.add(copy)
    return r
  }, [gltf, P])

  const { yaw, scale, dx, dy, plate } = template.model
  // Fit the model, then take depth snapshots from each side and the front.
  useEffect(() => {
    fitModel(root.children[0], template.model)
    const cams = sideCams()
    const scene = new THREE.Scene()
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const parent = root.parent
    scene.add(root)
    const prev = gl.getRenderTarget()
    for (const k of ['right', 'left', 'front'] as const) {
      gl.setRenderTarget(P.depth[k])
      gl.clear()
      gl.render(scene, cams[k])
    }
    gl.setRenderTarget(prev)
    scene.remove(root)
    parent?.add(root)
    P.uniforms.uPlateRect.value.set(plate.y, plate.w, plate.h)
    P.uniforms.uOn.value = 1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, gl, P, yaw, scale, dx, dy, plate.y, plate.w, plate.h])

  // Repaint the artwork when the design or the piece placement changes.
  const make = makeInfo(bikeById(cfg.bikeId).make)
  const panels = useMemo(() => panelSet(template, make.shroudLift, make.tailRise), [template, make.shroudLift, make.tailRise])
  useEffect(() => {
    let alive = true
    const paint = () => {
      paintDecalSheet(P.sheets.right, cfg, 'right', sideOutlines(template, 'right'), panels)
      paintDecalSheet(P.sheets.left, cfg, 'left', sideOutlines(template, 'left'), panels)
      paintFrontPlate(P.sheets.plate, cfg)
      for (const t of P.textures) t.needsUpdate = true
    }
    paint()
    ensureAssets(cfg).then(() => alive && paint())
    return () => {
      alive = false
    }
  }, [cfg, template, panels, P])

  useEffect(() => {
    P.uniforms.uPlastic.value.set(plasticsHex(cfg))
  }, [cfg, P])

  useEffect(() => {
    const f = FINISH[cfg.finish]
    P.uniforms.uFinish.value.set(f.rough, f.metal, f.clear)
  }, [cfg.finish, P])

  useEffect(
    () => () => {
      for (const t of P.textures) t.dispose()
      for (const d of Object.values(P.depth)) d.dispose()
    },
    [P],
  )

  return <primitive object={root} />
}
