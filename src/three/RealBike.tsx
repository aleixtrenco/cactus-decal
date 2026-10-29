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
import { use, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import type { FinishId } from '../data/pricing'
import { drawFitArt, drawLayer, drawPieceLayer, ensureAssets, loadImage, shroudBadgeBox, fillPieceSolid, frontPlateColor, paintDecalSheet, paintFrontPlate, paintSheet, pieceFill, riderId, riderLayers, sheetWidth, WORLD, type SeenArea, type Side } from '../lib/graphics'
import { drawZones } from '../lib/zones'
import { useSeen } from '../lib/seen'
import { paintStyle } from '../lib/paint'
import { FRONT_WHEEL } from '../lib/shapes'
import { apply, invert, modelUrl, mul6, onModel, panelKey, panelSet, pieceToWorld, resolveModel, sideOutlines, type BikeTemplate, type M6, type ModelSetup, type Role, type TemplatePiece } from '../lib/templates'
import { bikeById, makeInfo } from '../data/bikes'
import { pieceIdOf, plasticsHex, platesOnly, type KitConfig, type LayerPanel } from '../store/config'

// Overall bike length the model is fitted to (rear fender tip to front tyre).
const FIT = { x0: -1.2, x1: 1.17 }
const CAM_Z = 3
const NEAR = 0.01
const FAR = 6
// Half the width (world z) seen by the top camera.
const TOP_Z = 0.35
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
  // From above (for the front fender): screen x = world x, screen y = -world z.
  const top = new THREE.OrthographicCamera(x0, x1, TOP_Z, -TOP_Z, NEAR, FAR)
  top.position.set(0, CAM_Z, 0)
  top.up.set(0, 0, -1)
  top.lookAt(0, 0, 0)
  front.position.set(CAM_Z, 0, 0)
  front.lookAt(0, 0, 0)
  for (const c of [right, left, front, top]) c.updateMatrixWorld(true)
  return { right, left, front, top }
}

interface Projector {
  uniforms: Record<string, THREE.IUniform>
  sheets: { right: HTMLCanvasElement; left: HTMLCanvasElement; plate: HTMLCanvasElement; fender: HTMLCanvasElement; art: HTMLCanvasElement }
  textures: THREE.Texture[]
  depth: { right: THREE.WebGLRenderTarget; left: THREE.WebGLRenderTarget; front: THREE.WebGLRenderTarget; top: THREE.WebGLRenderTarget }
}

function makeProjector(): Projector {
  const W = sheetWidth()
  const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })
  const sheets = { right: canvas(W, W / 2), left: canvas(W, W / 2), plate: canvas(W / 4, W / 4), fender: canvas(W / 4, W / 4), art: canvas(W / 2, W / 4) }
  const tex = (c: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }
  const tR = tex(sheets.right)
  const tL = tex(sheets.left)
  const tP = tex(sheets.plate)
  const tF = tex(sheets.fender)
  const D = 1024
  const depth = { right: depthTarget(D, D / 2), left: depthTarget(D, D / 2), front: depthTarget(D / 2, D / 2), top: depthTarget(D, Math.round((D * TOP_Z * 2) / (WORLD.x1 - WORLD.x0))) }
  const { x0, x1, y0, y1 } = WORLD
  return {
    sheets,
    textures: [tR, tL, tP, tF],
    depth,
    uniforms: {
      uSheetR: { value: tR },
      uSheetL: { value: tL },
      uPlate: { value: tP },
      uFender: { value: tF },
      uDepthT: { value: depth.top.depthTexture },
      // Front fender area seen from above: x from, x to, half width, on.
      uFenderRect: { value: new THREE.Vector4(0, 0, 0, 0) },
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
uniform sampler2D uSheetR, uSheetL, uPlate, uFender, uDepthR, uDepthL, uDepthF, uDepthT;
uniform vec4 uFenderRect;
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
// uOn: 0 stock paint, 1 the customer's design, 2 stock paint with a badge.
if (uOn > 0.5 && uOn < 1.5) diffuseColor.rgb = uPlastic;
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
  bool onPlate = uOn < 1.5 && vDecalNormal.x > 0.25 && all(greaterThan(pr, vec2(0.0))) && all(lessThan(pr, vec2(1.0)));
  if (onPlate) {
    vec2 fuv = vec2((-vDecalPos.z + 0.6) / 1.2, v);
    onPlate = abs((uCam.x - vDecalPos.x) - camDist(uDepthF, fuv)) < tol * 1.5;
    if (onPlate) dec = vec4(texture2D(uPlate, pr).rgb, 1.0);
  }
  // Front fender, projected from above.
  vec4 fr = uFenderRect;
  // The plate leans back, so it is also seen from above: keep the fender art off it.
  if (!onPlate && uOn < 1.5 && fr.w > 0.5 && vDecalNormal.y > 0.2 && vDecalPos.x > fr.x && vDecalPos.x < fr.y && abs(vDecalPos.z) < fr.z) {
    vec2 tuv = vec2(0.5 - vDecalPos.z / (2.0 * fr.z), 1.0 - (vDecalPos.x - fr.x) / (fr.y - fr.x));
    vec2 duv = vec2((vDecalPos.x - uWorld.x) / ww, (-vDecalPos.z + ${TOP_Z.toFixed(3)}) / ${(TOP_Z * 2).toFixed(3)});
    if (abs((uCam.x - vDecalPos.y) - camDist(uDepthT, duv)) < tol * 1.5) {
      vec4 f = texture2D(uFender, tuv);
      dec = vec4(mix(dec.rgb, f.rgb, f.a), max(dec.a, f.a));
    }
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

// The front fender on the model: printed plastic above the front wheel and
// below the handlebars, in front of the number plate.
function findFender(root: THREE.Object3D) {
  const decalOn = isDecalSurface(root)
  const v = new THREE.Vector3()
  let x0 = Infinity
  let x1 = -Infinity
  let w = 0
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || ![mesh.material].flat().some((m) => decalOn(mesh, m))) return
    const pos = mesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i += 2) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      if (v.x < FRONT_WHEEL.x - 0.3 || v.y < FRONT_WHEEL.y + 0.45 || v.y > FRONT_WHEEL.y + 0.85 || Math.abs(v.z) > 0.25) continue
      x0 = Math.min(x0, v.x)
      x1 = Math.max(x1, v.x)
      w = Math.max(w, Math.abs(v.z))
    }
  })
  return x1 - x0 > 0.15 ? { x0, x1, w: w * 1.05 } : null
}

// Layers designed on one template piece, drawn into a sheet through `base`
// (template units → sheet pixels) and kept inside the piece.
function paintPieceLayers(c: HTMLCanvasElement, cfg: KitConfig, t: BikeTemplate, piece: TemplatePiece, base: M6) {
  const host = piece.parent !== undefined ? (t.pieces.find((q) => q.id === piece.parent) ?? piece) : piece
  const key = panelKey(host, t.pieces)
  const ls = cfg.layers.filter((l) => l.panel === key && pieceIdOf(l.panel) !== null && !l.cover && !l.fit)
  if (!ls.length) return
  const ctx = c.getContext('2d')!
  ctx.save()
  ctx.setTransform(...base)
  ctx.beginPath()
  piece.outline.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  ctx.closePath()
  ctx.clip()
  // The other side's piece of a mirrored pair shows the layers mirrored.
  for (const l of ls) drawPieceLayer(ctx, l, host.bbox, base, key !== `p${host.id}`)
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

// Sheet pixels from world units (inverse of the sheet → world mapping).
const worldToSheet = (side: Side, w: number) => {
  const k = (WORLD.x1 - WORLD.x0) / w
  return invert(side === 'right' ? [k, 0, 0, -k, WORLD.x0, WORLD.y1] : [-k, 0, 0, -k, WORLD.x1, WORLD.y1])
}

// The design with a piece's own base colour, cached per paint.
// Transparent sheets drawn piece by piece over the design: the number and
// lettering ('text'), or one main panel's layers (with whole-kit layers), so
// a layer only shows on its own panel. Cached per paint; null when empty.
function overlays(cfg: KitConfig, panels: ReturnType<typeof panelSet>, w: number, seen?: SeenArea) {
  const made = new Map<string, HTMLCanvasElement | null>()
  return (side: Side, what: 'text' | Role) => {
    const key = `${side}|${what}`
    if (!made.has(key)) {
      let c: HTMLCanvasElement | null = null
      if (what === 'text' || cfg.layers.some((l) => (l.panel === what || l.panel === 'kit') && !l.cover)) {
        c = Object.assign(document.createElement('canvas'), { width: w, height: w / 2 })
        paintSheet(c, cfg, side, panels, what === 'text' ? { art: false, pieces: true, layers: 'none', seen } : { art: false, pieces: true, layers: what as LayerPanel, text: false, seen })
      }
      made.set(key, c)
    }
    return made.get(key)!
  }
}

const LETTERED: Role[] = ['shroud', 'sidePlate', 'rearFender', 'frontFender']

// Draws `img` (a full sheet) inside one piece, through `base`.
function fillPiece(c: HTMLCanvasElement, piece: TemplatePiece, base: M6, img: HTMLCanvasElement, imgToC: M6) {
  const ctx = c.getContext('2d')!
  ctx.save()
  ctx.setTransform(...base)
  ctx.beginPath()
  piece.outline.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(...imgToC)
  ctx.drawImage(img, 0, 0)
  ctx.restore()
}

// Pieces designed on their own that sit on the side of the model: their own
// base colour, then their layers.
// Pieces with a solid colour (side plates, and any part the customer
// coloured) are filled piece by piece, so a colour never spills onto a
// neighbouring piece; then the layers designed on single pieces.
function paintSidePieces(P: Projector, cfg: KitConfig, t: BikeTemplate, panels: ReturnType<typeof panelSet>, roles?: Role[], seen?: SeenArea) {
  const overlay = overlays(cfg, panels, P.sheets.right.width, seen)
  const lettering = { right: riderLayers(cfg, panels, 'right', seen), left: riderLayers(cfg, panels, 'left', seen) }
  for (const side of ['right', 'left'] as const) {
    const c = P.sheets[side]
    for (const p of t.pieces) {
      if (p.side !== side || !onModel(p, t.pieces) || (roles && !roles.includes(p.role))) continue
      const toWorld = pieceToWorld(p, t.pieces)
      const base = mul6(worldToSheet(side, c.width), toWorld)
      const solid = pieceFill(cfg, p, panelKey(p, t.pieces))
      if (solid) fillPieceSolid(c.getContext('2d')!, cfg, p, solid, base)
      // Ready-made coloured areas, under the layers and lettering.
      const num = lettering[side].find((l) => l.id === riderId('number', side))
      drawFitArt(c.getContext('2d')!, cfg, p, base)
      drawZones(c.getContext('2d')!, cfg, p, panelKey(p, t.pieces), base, toWorld, num && { layer: num, panels, side })
      if (LETTERED.includes(p.role)) {
        for (const what of [p.role, 'text'] as const) {
          const o = overlay(side, what)
          if (o) fillPiece(c, p, base, o, [1, 0, 0, 1, 0, 0])
        }
        // The number and lettering, level on the bike, kept to the piece.
        const ctx = c.getContext('2d')!
        ctx.save()
        ctx.setTransform(...base)
        ctx.beginPath()
        p.outline.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
        ctx.closePath()
        ctx.clip()
        for (const l of lettering[side]) if (l.panel === p.role) drawLayer(ctx, l, panels, side, c.width, c.height)
        ctx.restore()
      }
      paintPieceLayers(c, cfg, t, p, base)
    }
  }
}

// A badge on the visible part of the shrouds, both sides, level and readable.
function paintBadge(P: Projector, img: HTMLImageElement, panels: ReturnType<typeof panelSet>, seen?: SeenArea) {
  if (!img.naturalWidth) return
  // Trimmed to its visible pixels, so empty margins don't shrink it.
  const src = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight })
  const sctx = src.getContext('2d')!
  sctx.drawImage(img, 0, 0)
  const px = sctx.getImageData(0, 0, src.width, src.height).data
  let x0 = src.width
  let y0 = src.height
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++)
      if (px[(y * src.width + x) * 4 + 3] > 16) {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x + 1)
        y1 = Math.max(y1, y + 1)
      }
  if (x1 <= x0 || y1 <= y0) return
  const aspect = (x1 - x0) / (y1 - y0)
  const b = shroudBadgeBox(panels, aspect, seen)
  const h = Math.min(b.h, b.w / aspect) * 1.15
  const w = h * aspect
  for (const side of ['right', 'left'] as const) {
    const c = P.sheets[side]
    const ctx = c.getContext('2d')!
    const m = worldToSheet(side, c.width)
    // Drawn in the sheet's own axes: upright, and unmirrored on the left side.
    const [cx, cy] = apply(m, [b.x, b.y])
    const k = Math.abs(m[0])
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, cx - (w * k) / 2, cy - (h * k) / 2, w * k, h * k)
    ctx.restore()
  }
  for (const tx of P.textures) tx.needsUpdate = true
}

// Removes the artwork from areas of the model that must stay bare.
function clearAreas(c: HTMLCanvasElement, side: Side, areas: [number, number][][] | undefined) {
  if (!areas?.length) return
  const ctx = c.getContext('2d')!
  ctx.save()
  ctx.setTransform(...worldToSheet(side, c.width))
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  for (const a of areas) {
    a.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
  }
  ctx.fill()
  ctx.restore()
}

// The front of the bike seen from the front: the template's front plate (or,
// for models with a headlight mask, the piece set as `model.frontPiece`)
// exactly as the template shows it, with any small pieces on it, stretched
// over the plate area of the model.
function paintFront(P: Projector, cfg: KitConfig, t: BikeTemplate & { model: ModelSetup }) {
  const c = P.sheets.plate
  const ctx = c.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const front = (t.model.frontPiece !== undefined ? t.pieces.find((p) => p.id === t.model.frontPiece) : undefined) ?? t.pieces.find((p) => p.role === 'frontPlate')
  if (!front) return paintFrontPlate(c, cfg)
  const { x, y, w, h } = front.bbox
  const S: M6 = [c.width / w, 0, 0, c.height / h, (-x * c.width) / w, (-y * c.height) / h]
  ctx.fillStyle = paintStyle(ctx, front.role === 'frontPlate' ? frontPlateColor(cfg) : (cfg.partColors?.[panelKey(front, t.pieces)] ?? cfg.colors.base), { x: 0, y: 0, w: c.width, h: c.height })
  ctx.fillRect(0, 0, c.width, c.height)
  const square = Object.assign(document.createElement('canvas'), { width: 512, height: 512 })
  paintFrontPlate(square, cfg)
  const k = (WORLD.x1 - WORLD.x0) / P.sheets.art.width
  const inside = (p: TemplatePiece) => {
    const cx = p.bbox.x + p.bbox.w / 2
    const cy = p.bbox.y + p.bbox.h / 2
    return p.side === 'center' && p.role !== 'ignore' && p.role !== 'frontFender' && cx > x && cx < x + w && cy > y && cy < y + h
  }
  const parts = [front, ...t.pieces.filter((p) => p !== front && inside(p))]
  for (const p of parts) {
    if (p.role === 'frontPlate') {
      // Same placement as the template and the print file.
      const q = Math.min(p.bbox.w, p.bbox.h * 1.1) / (512 * 0.82)
      const m: M6 = [q, 0, 0, q, p.bbox.x + p.bbox.w / 2 - 256 * q, p.bbox.y + p.bbox.h / 2 - 256 * q]
      fillPiece(c, p, S, square, mul6(S, m))
    } else {
      const solid = pieceFill(cfg, p, panelKey(p, t.pieces))
      if (solid) fillPieceSolid(ctx, cfg, p, solid, S)
      else fillPiece(c, p, S, P.sheets.art, mul6(mul6(S, invert(pieceToWorld(p, t.pieces))), [k, 0, 0, -k, WORLD.x0, WORLD.y1]))
    }
    drawFitArt(ctx, cfg, p, S)
    drawZones(ctx, cfg, p, panelKey(p, t.pieces), S, pieceToWorld(p, t.pieces))
    paintPieceLayers(c, cfg, t, p, S)
  }
}

// The template's front fender piece and the pieces laid on it (e.g. a centre
// strip), as printed, flat in the fender sheet: the top of the piece towards
// the back of the bike.
function paintFender(P: Projector, cfg: KitConfig, t: BikeTemplate, panels: ReturnType<typeof panelSet>) {
  const c = P.sheets.fender
  const ctx = c.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)
  const piece = t.pieces.find((p) => p.role === 'frontFender' && p.side === 'center') ?? t.pieces.find((p) => p.role === 'frontFender')
  paintSheet(P.sheets.art, cfg, 'right', panels, { pieces: true, lettering: false })
  if (!piece || platesOnly(cfg)) return
  const overlay = overlays(cfg, panels, P.sheets.art.width)
  const { x, y, w, h } = piece.bbox
  // Template → fender sheet (long side of the piece along the sheet's height).
  const S: M6 = h >= w ? [c.width / w, 0, 0, c.height / h, (-x * c.width) / w, (-y * c.height) / h] : [0, c.height / w, c.width / h, 0, (-y * c.width) / h, (-x * c.height) / w]
  const k = (WORLD.x1 - WORLD.x0) / P.sheets.art.width
  const within = (p: TemplatePiece) => {
    const cx = p.bbox.x + p.bbox.w / 2
    const cy = p.bbox.y + p.bbox.h / 2
    return p.side === piece.side && p.role !== 'frontPlate' && p.role !== 'ignore' && cx > x && cx < x + w && cy > y && cy < y + h
  }
  const parts = [piece, ...t.pieces.filter((p) => p !== piece && within(p))]
  for (const p of parts) {
    // The fender and the pieces on it (e.g. its centre) can have their own colour.
    const toArt = mul6(mul6(S, invert(pieceToWorld(p, t.pieces))), [k, 0, 0, -k, WORLD.x0, WORLD.y1])
    const solid = pieceFill(cfg, p, panelKey(p, t.pieces))
    if (solid) fillPieceSolid(ctx, cfg, p, solid, S)
    else fillPiece(c, p, S, P.sheets.art, toArt)
    drawFitArt(ctx, cfg, p, S)
    drawZones(ctx, cfg, p, panelKey(p, t.pieces), S, pieceToWorld(p, t.pieces))
    if (LETTERED.includes(p.role))
      for (const what of [p.role, 'text'] as const) {
        const o = overlay('right', what)
        if (o) fillPiece(c, p, S, o, toArt)
      }
    paintPieceLayers(c, cfg, t, p, S)
  }
}

function useModel(url: string) {
  return useLoader(GLTFLoader, url, (loader) => {
    const draco = new DRACOLoader()
    draco.setDecoderPath(dracoUrl)
    loader.setDRACOLoader(draco)
    loader.setMeshoptDecoder(MeshoptDecoder)
  })
}

// Where the plastics show from both sides, as a grid over WORLD: lettering is
// kept to these areas so it never lands on a vent, a hole or something in
// front of the plastics. Rendered once per fitted model with the page's own
// renderer (no extra WebGL context).
const SEEN_W = 400
const SEEN_H = 200
function seenArea(gl: THREE.WebGLRenderer, root: THREE.Object3D, cams: ReturnType<typeof sideCams>, id: string): SeenArea {
  const decalOn = isDecalSurface(root)
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })
  const black = new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide })
  const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    saved.set(m, m.material)
    m.material = Array.isArray(m.material) ? m.material.map((x) => (decalOn(m, x) ? white : black)) : decalOn(m, m.material) ? white : black
  })
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#000000')
  const parent = root.parent
  scene.add(root)
  const rt = new THREE.WebGLRenderTarget(SEEN_W, SEEN_H)
  const prev = gl.getRenderTarget()
  const read = (cam: THREE.Camera) => {
    const px = new Uint8Array(SEEN_W * SEEN_H * 4)
    gl.setRenderTarget(rt)
    gl.clear()
    gl.render(scene, cam)
    gl.readRenderTargetPixels(rt, 0, 0, SEEN_W, SEEN_H, px)
    return px
  }
  const r = read(cams.right)
  const l = read(cams.left)
  gl.setRenderTarget(prev)
  rt.dispose()
  scene.remove(root)
  parent?.add(root)
  for (const [m, mat] of saved) m.material = mat
  white.dispose()
  black.dispose()
  const { x0, x1, y0, y1 } = WORLD
  return {
    id,
    // Rows run bottom to top; the left camera sees the bike mirrored.
    at: (x, y) => {
      const row = Math.floor(((y - y0) / (y1 - y0)) * SEEN_H)
      const cr = Math.floor(((x - x0) / (x1 - x0)) * SEEN_W)
      const cl = SEEN_W - 1 - cr
      if (row < 0 || row >= SEEN_H || cr < 0 || cr >= SEEN_W) return false
      return r[(row * SEEN_W + cr) * 4] > 128 && l[(row * SEEN_W + cl) * 4] > 128
    },
  }
}

export default function RealBike({ cfg, template, stock = false, badge }: { cfg: KitConfig; template: BikeTemplate & { model: ModelSetup }; stock?: boolean; badge?: string }) {
  const gltf = useModel(use(resolveModel(modelUrl(template.model))))
  const gl = useThree((s) => s.gl)
  const P = useMemo(makeProjector, [])
  // Development only: lets tests inspect the projection.
  if (import.meta.env.DEV) Object.assign(window, { __cdlProjector: P })

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
  const [seen, setSeen] = useState<SeenArea>()
  // Fit the model, then take depth snapshots from each side and the front.
  useEffect(() => {
    fitModel(root.children[0], template.model)
    const cams = sideCams()
    const scene = new THREE.Scene()
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    const parent = root.parent
    scene.add(root)
    const prev = gl.getRenderTarget()
    for (const k of ['right', 'left', 'front', 'top'] as const) {
      gl.setRenderTarget(P.depth[k])
      gl.clear()
      gl.render(scene, cams[k])
    }
    gl.setRenderTarget(prev)
    scene.remove(root)
    parent?.add(root)
    P.uniforms.uPlateRect.value.set(plate.y, plate.w, plate.h)
    const f = findFender(root)
    if (f) P.uniforms.uFenderRect.value.set(f.x0, f.x1, f.w, 1)
    else P.uniforms.uFenderRect.value.set(0, 0, 0, 0)
    // Stock: the model's own paint, no graphics.
    P.uniforms.uOn.value = stock ? (badge ? 2 : 0) : 1
    const area = seenArea(gl, root.children[0], cams, `${template.model.url}|${yaw}|${scale}|${dx}|${dy}`)
    setSeen(area)
    // The template and print file place lettering with the same map.
    useSeen.getState().put(template.bikeId, area)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, gl, P, yaw, scale, dx, dy, plate.y, plate.w, plate.h, stock, badge])

  // Repaint the artwork when the design or the piece placement changes.
  const make = makeInfo(bikeById(cfg.bikeId).make)
  const panels = useMemo(() => panelSet(template, make.shroudLift, make.tailRise), [template, make.shroudLift, make.tailRise])
  useEffect(() => {
    let alive = true
    if (stock) {
      // The stock paint, with only a badge (e.g. our logo) on the shrouds.
      for (const side of ['right', 'left'] as const) P.sheets[side].getContext('2d')!.clearRect(0, 0, P.sheets[side].width, P.sheets[side].height)
      if (badge) loadImage(badge).then((img) => alive && paintBadge(P, img, panels, seen))
      for (const t of P.textures) t.needsUpdate = true
      return () => {
        alive = false
      }
    }
    const paint = () => {
      const roles = platesOnly(cfg) ? (['sidePlate'] as Role[]) : undefined
      paintDecalSheet(P.sheets.right, cfg, 'right', sideOutlines(template, 'right', roles), panels, seen)
      // The bike is symmetric: the left side uses the right side's placed
      // outlines (mirrored left pieces can't be fitted as precisely).
      const right = sideOutlines(template, 'right', roles)
      paintDecalSheet(P.sheets.left, cfg, 'left', right.length ? right : sideOutlines(template, 'left', roles), panels, seen)
      paintSidePieces(P, cfg, template, panels, roles, seen)
      for (const side of ['right', 'left'] as const) clearAreas(P.sheets[side], side, template.model.exclude)
      paintFender(P, cfg, template, panels)
      paintFront(P, cfg, template)
      for (const t of P.textures) t.needsUpdate = true
    }
    paint()
    ensureAssets(cfg).then(() => alive && paint())
    return () => {
      alive = false
    }
  }, [cfg, template, panels, P, seen, stock, badge])

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
