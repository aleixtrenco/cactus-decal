// Per-model print templates (the SVG cut files the shop already uses).
//
// Templates are flat print/cut layouts: the bike's right-side pieces on the
// left half (fronts pointing to the middle), the left-side pieces mirrored on
// the right half, and centre pieces (front plate, front fender) in between.
// Pieces don't need names: each closed shape is detected, given a role
// automatically (shroud, side plate, ...) and can be corrected in /admin.
//
// Every piece gets a transform into the bike's side-view "world" (see
// graphics.ts). That is how one design flows across all pieces, how the
// real outlines appear on the 3D bike, and how the print file is built.

import { useMemo } from 'react'
import { create } from 'zustand'
import { BIKES, bikeById, makeInfo, type BikeType } from '../data/bikes'
import { frontFender, rearFender, shroud, sidePlate, type Seg } from './shapes'

export type Role = 'shroud' | 'sidePlate' | 'rearFender' | 'frontFender' | 'frontPlate' | 'other' | 'ignore'
export type PieceSide = 'right' | 'left' | 'center'

export const ROLE_LABELS: Record<Role, string> = {
  shroud: 'Shroud',
  sidePlate: 'Side plate',
  rearFender: 'Rear fender',
  frontFender: 'Front fender',
  frontPlate: 'Front plate',
  other: 'Other piece',
  ignore: "Don't print",
}

type Pt = [number, number]
interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface TemplatePiece {
  // Index among the template's closed shapes, in document order.
  id: number
  role: Role
  side: PieceSide
  // Piece this one sits on top of (artwork lines up with the parent).
  parent?: number
  // Outer contour in template coordinates (simplified).
  outline: Pt[]
  bbox: Box
  area: number
  // Where the piece sits on the 3D model (template → world), set in /admin.
  place?: M6
}

// A real 3D bike for this template, plus how it was lined up.
export interface ModelSetup {
  url: string
  // Optional lighter copy (smaller textures) loaded on phones and tablets.
  mobileUrl?: string
  // Turn (degrees about the vertical axis) so the front points to +x.
  yaw: number
  // Fine-tuning after the automatic fit.
  scale: number
  dx: number
  dy: number
  // Front number plate area on the model, in world units.
  // `number`: optional band (fractions from the top) for the race number,
  // e.g. above a headlight.
  plate: { y: number; w: number; h: number; number?: [number, number] }
  // Areas (world units, side view) that never get graphics, e.g. the seat
  // when the model paints it with the same material as the plastics.
  exclude?: [number, number][][]
  // Bike types this model may stand in for on other models of the same make
  // (e.g. a motocross model is not shown for trail bikes). Any type if unset.
  types?: BikeType[]
}

// Site-relative model paths (bundled models) also work from a sub-folder.
// The sandboxed preview can't serve binary files, so its bundled models are
// stored as base64 text and turned back into a file in the browser.
const resolved = new Map<string, Promise<string>>()
// Phones and tablets have far less graphics memory than computers.
export const isHandheld = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 900)

export const modelUrl = (m: ModelSetup) => (m.mobileUrl && isHandheld() ? m.mobileUrl : m.url)

export function resolveModel(u: string): Promise<string> {
  // Promises are cached so React's use() sees the same one on every render.
  let p = resolved.get(u)
  if (p) return p
  const local = u.startsWith('/') && !u.startsWith('//')
  const url = local ? import.meta.env.BASE_URL + u.slice(1) : u
  p =
    local && import.meta.env.VITE_HASH_ROUTER
      ? fetch(url + '.b64.txt')
          .then((r) => r.text())
          .then((b64) => URL.createObjectURL(new Blob([Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0))], { type: 'model/gltf-binary' })))
      : Promise.resolve(url)
  resolved.set(u, p)
  return p
}

export const defaultModelSetup = (url: string): ModelSetup => ({ url, yaw: 0, scale: 1, dx: 0, dy: 0, plate: { y: 1.02, w: 0.3, h: 0.27 } })

export interface BikeTemplate {
  bikeId: string
  fileName: string
  // Full SVG, kept for print files. Never published to the public site.
  svgText?: string
  // Set when the original SVG is stored privately (published from /admin).
  svgUrl?: string
  viewBox: [number, number, number, number]
  pieces: TemplatePiece[]
  model?: ModelSetup
  updatedAt: string
}

type Mat = DOMMatrix

// ---------- Reading SVGs ----------

// Mounts the SVG off-screen so the browser resolves CSS, transforms and units.
export function mount(svgText: string) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (doc.querySelector('parsererror')) throw new Error('This file is not a valid SVG.')
  const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
  svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove())
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden'
  host.appendChild(svg)
  document.body.appendChild(host)
  return { svg, done: () => host.remove() }
}

// Matrix from an element's own user space to the root SVG user space.
export function toRoot(el: SVGGraphicsElement, svg: SVGSVGElement): Mat {
  const a = el.getScreenCTM()
  const b = svg.getScreenCTM()
  if (!a || !b) return new DOMMatrix()
  return b.inverse().multiply(a)
}

const SHAPES = 'path, polygon, rect, ellipse, circle, polyline'

// (The SVG is mounted hidden, so visibility can't be used here.)
const isFilled = (el: Element) => {
  const cs = getComputedStyle(el)
  return cs.fill !== 'none' && cs.fillOpacity !== '0'
}

// The closed shapes that make up the kit, in a stable order. Cut-line copies
// (unfilled strokes on top of a filled piece) are skipped.
export function pieceElements(svg: SVGSVGElement): SVGGeometryElement[] {
  const all = [...svg.querySelectorAll(SHAPES)].filter((e) => !e.closest('defs, clipPath, mask, symbol')) as SVGGeometryElement[]
  const filled = all.filter(isFilled)
  return filled.length ? filled : all
}

function polyArea(p: Pt[]) {
  let a = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1])
  return Math.abs(a / 2)
}

function boxOf(p: Pt[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of p) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function resample(p: Pt[], n: number): Pt[] {
  if (p.length <= n) return p
  const step = p.length / n
  return Array.from({ length: n }, (_, i) => p[Math.floor(i * step)])
}

// Samples a shape and keeps its outer contour (holes and extra sub-paths are
// split off where the sampled outline jumps).
function outerContour(el: SVGGeometryElement, m: Mat): Pt[] {
  const len = el.getTotalLength()
  if (!len) return []
  const n = Math.max(80, Math.min(2400, Math.round(len * 2)))
  const step = len / n
  const runs: Pt[][] = [[]]
  let prev: DOMPoint | null = null
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((len * i) / n)
    if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > step * 2.5) runs.push([])
    prev = p
    const q = new DOMPoint(p.x, p.y).matrixTransform(m)
    runs[runs.length - 1].push([q.x, q.y])
  }
  const best = runs.filter((r) => r.length > 2).sort((a, b) => polyArea(b) - polyArea(a))[0] ?? []
  return resample(best, 220).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)] as Pt)
}

// ---------- Automatic roles ----------

function inside([x, y]: Pt, poly: Pt[]) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

// A piece printed on top of another (a layered decal) lies mostly inside it.
const liesOn = (small: TemplatePiece, big: TemplatePiece) => small.outline.filter((p) => inside(p, big.outline)).length >= small.outline.length * 0.7

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1e-9)
const sameSize = (a: TemplatePiece, b: TemplatePiece, tol: number) => rel(a.bbox.w, b.bbox.w) < tol && rel(a.bbox.h, b.bbox.h) < tol && rel(a.area, b.area) < 0.3

// Mirror axis: the midpoint of the biggest matching pair at the same height
// (normally the two shrouds).
function mirrorAxis(pieces: TemplatePiece[], width: number, fallback: number) {
  const big = [...pieces].sort((a, b) => b.area - a.area).slice(0, 16)
  for (let i = 0; i < big.length; i++)
    for (let j = i + 1; j < big.length; j++) {
      const a = big[i]
      const b = big[j]
      if (sameSize(a, b, 0.12) && Math.abs(a.bbox.y - b.bbox.y) < a.bbox.h * 0.2 && Math.abs(a.bbox.x - b.bbox.x) > width * 0.2)
        return (a.bbox.x + a.bbox.w / 2 + b.bbox.x + b.bbox.w / 2) / 2
    }
  return fallback
}

export function autoAssign(pieces: TemplatePiece[]): TemplatePiece[] {
  const out = pieces.map((p) => ({ ...p, role: 'other' as Role, side: 'center' as PieceSide, parent: undefined as number | undefined }))
  if (!out.length) return out
  const all = boxOf(out.flatMap((p) => [[p.bbox.x, p.bbox.y], [p.bbox.x + p.bbox.w, p.bbox.y + p.bbox.h]] as Pt[]))
  const axis = mirrorAxis(out, all.w, all.x + all.w / 2)
  const cx = (p: TemplatePiece) => p.bbox.x + p.bbox.w / 2
  const cy = (p: TemplatePiece) => p.bbox.y + p.bbox.h / 2

  // Pieces sitting on a bigger piece follow it.
  for (const p of out) {
    const host = out.filter((q) => q !== p && q.area > p.area * 1.3 && liesOn(p, q)).sort((a, b) => a.area - b.area)[0]
    if (host) p.parent = host.id
  }
  const top = out.filter((p) => p.parent === undefined)
  for (const p of top) {
    const d = cx(p) - axis
    // Fronts point to the middle: the left half shows the bike's right side.
    p.side = Math.abs(d) < all.w * 0.05 ? 'center' : d < 0 ? 'right' : 'left'
  }

  // Front plate: a squarish, sizeable piece near the top and the middle
  // (some layouts put it off to one side).
  const plateScore = (p: TemplatePiece) => {
    const aspect = p.bbox.w / p.bbox.h
    if (aspect < 0.7 || aspect > 1.45) return 0
    return p.area / (1 + (4 * Math.abs(cx(p) - axis)) / all.w) / (1 + (2 * (cy(p) - all.y)) / all.h)
  }
  const plate = [...top].sort((a, b) => plateScore(b) - plateScore(a))[0]
  if (plate && plateScore(plate) > 0) {
    plate.role = 'frontPlate'
    plate.side = 'center'
  }
  // Front fender: the biggest piece in the centre column.
  const fender = top.filter((p) => p.side === 'center' && p.role === 'other').sort((a, b) => b.area - a.area)[0]
  if (fender) fender.role = 'frontFender'

  // Upper row of a half holds shroud (nearest the middle), rear fender
  // (outermost) and side plate (the biggest of the rest).
  const band = all.y + all.h * 0.6
  const assignHalf = (side: 'right' | 'left', want: Role[]) => {
    const half = top.filter((p) => p.side === side && p.role === 'other' && cy(p) < band)
    const maxA = Math.max(0, ...top.filter((p) => p.side === side && cy(p) < band).map((p) => p.area))
    const big = half.filter((p) => p.area >= maxA * 0.2)
    const byDist = [...big].sort((a, b) => Math.abs(cx(a) - axis) - Math.abs(cx(b) - axis))
    if (want.includes('shroud') && byDist.length) byDist.shift()!.role = 'shroud'
    if (want.includes('rearFender') && byDist.length) byDist.pop()!.role = 'rearFender'
    const rest = byDist.sort((a, b) => b.area - a.area)[0]
    if (want.includes('sidePlate') && rest) rest.role = 'sidePlate'
  }
  const ROW: Role[] = ['shroud', 'sidePlate', 'rearFender']
  assignHalf('right', ROW)
  // The left half mirrors the right: match each piece to its twin first.
  const mirrorX = (p: TemplatePiece) => 2 * axis - cx(p)
  for (const r of top.filter((p) => p.side === 'right' && ROW.includes(p.role))) {
    const twin = top
      .filter((p) => p.side === 'left' && p.role === 'other' && sameSize(p, r, 0.15))
      .sort((a, b) => Math.abs(mirrorX(a) - cx(r)) + Math.abs(cy(a) - cy(r)) - (Math.abs(mirrorX(b) - cx(r)) + Math.abs(cy(b) - cy(r))))[0]
    if (twin) twin.role = r.role
  }
  assignHalf('left', ROW.filter((r) => !top.some((p) => p.side === 'left' && p.role === r)))
  for (const p of out) if (p.parent !== undefined) p.side = out.find((q) => q.id === p.parent)!.side
  return out
}

export interface ParseResult {
  template: BikeTemplate
  warnings: string[]
}

export function readPieces(svg: SVGSVGElement): TemplatePiece[] {
  const els = pieceElements(svg)
  const pieces: TemplatePiece[] = []
  els.forEach((el, id) => {
    const outline = outerContour(el, toRoot(el, svg))
    if (outline.length < 3) return
    pieces.push({ id, role: 'other', side: 'center', outline, bbox: boxOf(outline), area: polyArea(outline) })
  })
  // Drop exact duplicates (e.g. a fill and its cut line exported twice).
  const W = boxOf(pieces.flatMap((p) => p.outline)).w || 1
  return pieces.filter((p, i) => !pieces.slice(0, i).some((q) => Math.abs(q.bbox.x - p.bbox.x) + Math.abs(q.bbox.y - p.bbox.y) + Math.abs(q.bbox.w - p.bbox.w) + Math.abs(q.bbox.h - p.bbox.h) < W * 0.002))
}

export function parseTemplate(svgText: string, bikeId: string, fileName: string): ParseResult {
  const { svg, done } = mount(svgText)
  const warnings: string[] = []
  try {
    const pieces = autoAssign(readPieces(svg))
    if (!pieces.length) throw new Error('No closed shapes found in this SVG. Export the cut file with filled or closed outlines.')
    const vb = svg.viewBox.baseVal
    const all = boxOf(pieces.flatMap((p) => p.outline))
    const viewBox: BikeTemplate['viewBox'] = vb && vb.width ? [vb.x, vb.y, vb.width, vb.height] : [all.x, all.y, all.w, all.h]
    for (const role of ['shroud', 'sidePlate', 'frontPlate'] as Role[])
      if (!pieces.some((p) => p.role === role)) warnings.push(`No ${ROLE_LABELS[role].toLowerCase()} was found automatically. Click the piece and set it.`)
    return { template: { bikeId, fileName, svgText, viewBox, pieces, updatedAt: new Date().toISOString() }, warnings }
  } finally {
    done()
  }
}

// ---------- Template → bike world ----------

// [a, b, c, d, e, f] maps (x, y) to (a*x + c*y + e, b*x + d*y + f).
export type M6 = [number, number, number, number, number, number]

const segPoints = (s: Seg[]) => s.map((p) => (p.length === 5 ? [p[3], p[4]] : [p[1], p[2]]) as Pt)

// Where each role sits on the side-view bike, in world units.
function targetBox(role: Role): Box {
  const shape = role === 'sidePlate' ? sidePlate() : role === 'rearFender' ? rearFender() : role === 'frontFender' ? frontFender() : shroud()
  const b = boxOf(segPoints(shape))
  return { x: b.x, y: b.y, w: b.w, h: b.h }
}

// Fits a piece into its role's spot on the bike. Left-side pieces are
// mirrored in the template, so they are flipped back here.
export function pieceToWorld(p: TemplatePiece, pieces: TemplatePiece[]): M6 {
  if (p.parent !== undefined) {
    const host = pieces.find((q) => q.id === p.parent)
    if (host) return pieceToWorld(host, pieces)
  }
  if (p.place) return p.place
  // Left pieces follow their right-side twin once that has been placed.
  const twin = placedTwin(p, pieces)
  if (twin?.place) {
    const kx = twin.bbox.w / p.bbox.w
    const ky = twin.bbox.h / p.bbox.h
    const flip: M6 = [-kx, 0, 0, ky, twin.bbox.x + twin.bbox.w + p.bbox.x * kx, twin.bbox.y - p.bbox.y * ky]
    return mul6(twin.place, flip)
  }
  const t = targetBox(p.role === 'other' || p.role === 'ignore' || p.role === 'frontPlate' ? 'shroud' : p.role)
  const k = Math.min(t.w / p.bbox.w, t.h / p.bbox.h)
  const sx = p.side === 'left' ? -k : k
  const pcx = p.bbox.x + p.bbox.w / 2
  const pcy = p.bbox.y + p.bbox.h / 2
  const tcx = t.x + t.w / 2
  const tcy = t.y + t.h / 2
  return [sx, 0, 0, -k, tcx - sx * pcx, tcy + k * pcy]
}

// The placed right-side piece a left piece mirrors: same role, or for trim
// pieces the same size.
export function placedTwin(p: TemplatePiece, pieces: TemplatePiece[]) {
  if (p.side !== 'left') return undefined
  const cands = pieces.filter((q) => q.side === 'right' && q.place && q.parent === undefined)
  if (p.role !== 'other') return cands.find((q) => q.role === p.role)
  return cands.filter((q) => q.role === 'other' && sameSize(q, p, 0.15)).sort((a, b) => Math.abs(a.area - p.area) - Math.abs(b.area - p.area))[0]
}

const MAIN: Role[] = ['shroud', 'sidePlate', 'rearFender', 'frontFender']
// Pieces shown on a real 3D model: the main panels, plus trim pieces once
// they have been placed in /admin.
export const onModel = (p: TemplatePiece, pieces: TemplatePiece[]) =>
  p.parent === undefined && p.side !== 'center' && (MAIN.includes(p.role) || !!p.place || !!placedTwin(p, pieces))

export const mul6 = (p: M6, q: M6): M6 => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
]

export const apply = (m: M6, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

export function invert(m: M6): M6 {
  const [a, b, c, d, e, f] = m
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

// ---------- Registry ----------

interface TemplateStore {
  templates: Record<string, BikeTemplate>
  put: (t: BikeTemplate) => void
  remove: (bikeId: string) => void
  setAll: (ts: BikeTemplate[]) => void
}

export const useTemplates = create<TemplateStore>((set) => ({
  templates: {},
  put: (t) => set((s) => ({ templates: { ...s.templates, [t.bikeId]: t } })),
  remove: (id) =>
    set((s) => {
      const next = { ...s.templates }
      delete next[id]
      return { templates: next }
    }),
  setAll: (ts) => set((s) => ({ templates: { ...s.templates, ...Object.fromEntries(ts.map((t) => [t.bikeId, t])) } })),
}))

const isTemplate = (t: unknown): t is BikeTemplate => !!t && typeof t === 'object' && Array.isArray((t as BikeTemplate).pieces) && Array.isArray((t as BikeTemplate).viewBox)

let loaded: Promise<void> | null = null
// Loads the outlines that ship with the site, then any published from /admin
// (those win). Both fail quietly so the built-in shapes still work.
export function loadTemplates() {
  loaded ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}templates/index.json`)
      if (res.ok) {
        const list: string[] = await res.json()
        const ts = await Promise.all(list.map((f) => fetch(`${import.meta.env.BASE_URL}templates/${f}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
        useTemplates.getState().setAll(ts.filter(isTemplate))
      }
    } catch {
      /* no bundled outlines */
    }
    try {
      const res = await fetch('/api/templates')
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return
      const data = await res.json()
      if (Array.isArray(data.templates)) useTemplates.getState().setAll(data.templates.filter(isTemplate))
    } catch {
      /* no API available (static preview) */
    }
  })()
  return loaded
}

export interface PanelSet {
  shroud: Seg[][]
  sidePlate: Seg[][]
  rearFender: Seg[][]
  frontFender: Seg[][]
}

// The outlines used on the bike: the template's real pieces (placed on the
// bike) when there is one, else the built-in shapes.
export function panelSet(t: BikeTemplate | undefined, lift: number, rise: number): PanelSet {
  const def: PanelSet = { shroud: [shroud(lift)], sidePlate: [sidePlate(rise)], rearFender: [rearFender(rise)], frontFender: [frontFender()] }
  if (!t) return def
  const pick = (role: Role) => {
    const sided = t.pieces.filter((p) => p.role === role && p.parent === undefined && p.side !== 'center')
    // Both sides are mirror images; use one side so panels aren't doubled.
    const one = sided.some((p) => p.side === 'right') ? sided.filter((p) => p.side === 'right') : sided
    return one.map((p) => {
      const m = pieceToWorld(p, t.pieces)
      return p.outline.map((pt, i) => {
        const [x, y] = apply(m, pt)
        return [i ? 'L' : 'M', x, y] as Seg
      })
    })
  }
  const or = (a: Seg[][], b: Seg[][]) => (a.length ? a : b)
  return {
    shroud: or(pick('shroud'), def.shroud),
    sidePlate: or(pick('sidePlate'), def.sidePlate),
    rearFender: or(pick('rearFender'), def.rearFender),
    frontFender: or(pick('frontFender'), def.frontFender),
  }
}

// Outlines (in world units) of the printed pieces on one side of the bike.
// `roles` limits it to some pieces (e.g. side plates for a plates-only kit).
export function sideOutlines(t: BikeTemplate, side: 'right' | 'left', roles?: Role[]): Pt[][] {
  return t.pieces
    .filter((p) => p.side === side && onModel(p, t.pieces) && (!roles || roles.includes(p.role)))
    .map((p) => {
      const m = pieceToWorld(p, t.pieces)
      return p.outline.map((pt) => apply(m, pt))
    })
}

// Bikes customers can design: only those with an uploaded print template,
// so every kit is cut from the shop's real file. New templates uploaded in
// /admin appear automatically.
export function useAvailableBikes() {
  const templates = useTemplates((s) => s.templates)
  return useMemo(() => BIKES.filter((b) => templates[b.id]), [templates])
}

// The 3D model shown for a bike: its own, else one from another model of the
// same brand (every Husqvarna uses the Husqvarna model, and so on). The
// bike's own template still decides the printed pieces.
export function modelFor(bikeId: string, templates: Record<string, BikeTemplate>): ModelSetup | undefined {
  const own = templates[bikeId]?.model
  if (own) return own
  const { make, type } = bikeById(bikeId)
  return Object.values(templates).find((t) => t.model && bikeById(t.bikeId).make === make && (!t.model.types || t.model.types.includes(type)))?.model
}

export function panelsFor(cfg: { bikeId: string }) {
  const m = makeInfo(bikeById(cfg.bikeId).make)
  return panelSet(useTemplates.getState().templates[cfg.bikeId], m.shroudLift, m.tailRise)
}

// Fallback when a model has no template: the built-in outlines laid out
// like a cut file (right side on the left, left side mirrored on the right).
export function builtInTemplate(cfg: { bikeId: string }): BikeTemplate {
  const set = panelsFor(cfg)
  const pieces: TemplatePiece[] = []
  const roles: [Role, Seg[][]][] = [
    ['shroud', set.shroud],
    ['sidePlate', set.sidePlate],
    ['rearFender', set.rearFender],
    ['frontFender', set.frontFender],
  ]
  const k = 1000
  for (const side of ['right', 'left'] as const)
    for (const [role, segs] of roles)
      for (const seg of segs) {
        // World → layout: right side on the left half, mirrored on the right.
        const pts = seg.map((s) => (s.length === 5 ? [s[3], s[4]] : [s[1], s[2]]) as [number, number])
        const outline = pts.map(([x, y]) => [side === 'right' ? (x - 1.3) * k : (1.3 - x) * k, (1.5 - y) * k] as [number, number])
        const xs = outline.map((q) => q[0])
        const ys = outline.map((q) => q[1])
        const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
        pieces.push({ id: pieces.length, role, side, outline, bbox, area: bbox.w * bbox.h })
      }
  // Built-in pieces already sit at their world spot: use an exact transform.
  return { bikeId: cfg.bikeId, fileName: 'built-in', viewBox: [-2600, 0, 5300, 1300], pieces, updatedAt: '' }
}

// Public copy of a template: outlines only, never the original SVG.
export const publicCopy = ({ svgText: _svg, ...t }: BikeTemplate) => (void _svg, t)
