// Fits template pieces onto a real model's plastics automatically.
//
// The model is rendered from the right side with its graphics surfaces
// (the "livery" material, or everything that can carry decals) in white and
// the rest in black. Each main piece is then moved, scaled and rotated to
// cover as much white as possible while spilling as little as possible onto
// black or onto pieces already placed.

import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { WORLD } from './graphics'
import { apply, modelUrl, mul6, pieceToWorld, type BikeTemplate, type M6, type ModelSetup, type Role } from './templates'
import { fitModel, isDecalSurface } from '../three/RealBike'

const MW = 600
const MH = 300
const { x0, x1, y0, y1 } = WORLD

async function liveryMask(setup: ModelSetup) {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/draco/gltf/')
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(modelUrl(setup.url))
  fitModel(gltf.scene, setup)
  const decal = isDecalSurface(gltf.scene)
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const on = [m.material].flat().some((mat) => decal(m, mat))
    m.material = new THREE.MeshBasicMaterial({ color: on ? '#ffffff' : '#000000', side: THREE.DoubleSide })
  })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#000000')
  scene.add(gltf.scene)
  const cam = new THREE.OrthographicCamera(x0, x1, y1, y0, 0.01, 6)
  cam.position.set(0, 0, 3)
  cam.lookAt(0, 0, 0)
  const r = new THREE.WebGLRenderer({ preserveDrawingBuffer: true })
  r.setSize(MW, MH, false)
  r.render(scene, cam)
  const c = Object.assign(document.createElement('canvas'), { width: MW, height: MH })
  const ctx = c.getContext('2d')!
  ctx.drawImage(r.domElement, 0, 0)
  r.dispose()
  draco.dispose()
  const px = ctx.getImageData(0, 0, MW, MH).data
  const mask = new Uint8Array(MW * MH)
  for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4] > 128 ? 1 : 0
  return mask
}

// Rasterises a world-space polygon into the mask grid.
function makeRaster() {
  const c = Object.assign(document.createElement('canvas'), { width: MW, height: MH })
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  return (poly: [number, number][]) => {
    ctx.clearRect(0, 0, MW, MH)
    ctx.beginPath()
    poly.forEach(([x, y], i) => {
      const px = ((x - x0) / (x1 - x0)) * MW
      const py = (1 - (y - y0) / (y1 - y0)) * MH
      if (i) ctx.lineTo(px, py)
      else ctx.moveTo(px, py)
    })
    ctx.closePath()
    ctx.fill()
    return ctx.getImageData(0, 0, MW, MH).data
  }
}

function transformAround(m: M6, c: [number, number], dx: number, dy: number, k: number, rot: number): M6 {
  const cs = Math.cos(rot) * k
  const sn = Math.sin(rot) * k
  const t: M6 = [cs, sn, -sn, cs, c[0] - cs * c[0] + sn * c[1] + dx, c[1] - sn * c[0] - cs * c[1] + dy]
  return mul6(t, m)
}

const ORDER: Role[] = ['sidePlate', 'shroud', 'rearFender', 'frontFender']

export async function autoPlace(t: BikeTemplate): Promise<BikeTemplate> {
  if (!t.model) return t
  const mask = await liveryMask(t.model)
  const claimed = new Uint8Array(MW * MH)
  const raster = makeRaster()
  const pieces = t.pieces.map((p) => ({ ...p }))
  const targets = ORDER.flatMap((r) => pieces.filter((p) => p.role === r && p.side === 'right' && p.parent === undefined))

  for (const p of targets) {
    const base = pieceToWorld({ ...p, place: undefined }, pieces)
    const c = apply(base, [p.bbox.x + p.bbox.w / 2, p.bbox.y + p.bbox.h / 2])
    const score = (v: number[]) => {
      const img = raster(p.outline.map((q) => apply(transformAround(base, c, v[0], v[1], Math.exp(v[2]), v[3]), q)))
      let good = 0
      let bad = 0
      for (let i = 0; i < mask.length; i++) {
        if (img[i * 4 + 3] < 128) continue
        if (mask[i] && !claimed[i]) good++
        else bad++
      }
      return good - 2.5 * bad
    }
    // Coarse search for position and size, then refine everything.
    let best = [0, 0, 0, 0]
    let bestS = score(best)
    for (const k of [-0.3, -0.15, 0, 0.15, 0.3])
      for (let dx = -0.4; dx <= 0.4001; dx += 0.08)
        for (let dy = -0.24; dy <= 0.2401; dy += 0.06) {
          const v = [dx, dy, k, 0]
          const s = score(v)
          if (s > bestS) [best, bestS] = [v, s]
        }
    let steps = [0.04, 0.03, 0.08, 0.06]
    for (let round = 0; round < 6; round++) {
      let improved = true
      while (improved) {
        improved = false
        for (let d = 0; d < 4; d++)
          for (const sgn of [1, -1]) {
            const v = [...best]
            v[d] += sgn * steps[d]
            const s = score(v)
            if (s > bestS) {
              ;[best, bestS] = [v, s]
              improved = true
            }
          }
      }
      steps = steps.map((x) => x / 2)
    }
    p.place = transformAround(base, c, best[0], best[1], Math.exp(best[2]), best[3])
    const img = raster(p.outline.map((q) => apply(p.place!, q)))
    for (let i = 0; i < claimed.length; i++) if (img[i * 4 + 3] >= 128) claimed[i] = 1
  }
  return { ...t, pieces }
}
