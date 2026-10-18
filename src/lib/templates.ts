// Per-model SVG templates. An uploaded template replaces the built-in panel
// outlines for that bike, in the 3D preview, the 2D proof and the print file.
//
// Template rules (see README):
// - Side view of the bike as the panels sit on it.
// - Each panel is a closed shape named (layer/object name in Illustrator)
//   with one of: shroud, side-plate, rear-fender, front-fender. Any other
//   named shape is printed too but not shown in 3D.
// - Optional front-plate: printed with the front number plate artwork.
// - Two markers named rear-axle and front-axle (small circles) fix the scale
//   and position. Without them the panels are fitted to the default layout.

import { create } from 'zustand'
import { bikeById, makeInfo } from '../data/bikes'
import { FRONT_WHEEL, REAR_WHEEL, frontFender, rearFender, shroud, sidePlate, type Seg } from './shapes'

export type Slot = 'shroud' | 'sidePlate' | 'rearFender' | 'frontFender' | 'frontPlate' | 'other'

export interface TemplatePanel {
  name: string
  slot: Slot
  // Outline in world units (bike faces +x, ground y = 0), as polyline.
  seg: Seg[]
}

export interface BikeTemplate {
  bikeId: string
  fileName: string
  svgUrl?: string
  // Raw SVG text, kept in memory for print export when there is no URL.
  svgText?: string
  // Template-space → world affine: x' = a*x + c*y + e, y' = b*x + d*y + f
  toWorld: [number, number, number, number, number, number]
  side: 'right' | 'left'
  hasAxles: boolean
  panels: TemplatePanel[]
  updatedAt: string
}

const SLOT_MATCHERS: [Slot, RegExp][] = [
  ['frontPlate', /front.?(number.?)?plate|number.?plate.?front|front.?no/],
  ['sidePlate', /side.?(number.?)?plate|side.?panel|number.?plate|sideplate/],
  ['shroud', /shroud|radiator|rad.?wing/],
  ['rearFender', /rear.?fender|rear.?mud|fender.?rear|tail/],
  ['frontFender', /front.?fender|fender.?front|front.?mud/],
]

const IGNORE = /axle|ignore|guide|bleed|background|^bg$|reference|^ref/

// Illustrator escapes characters in ids (e.g. "_x5F_" for "_").
function cleanName(raw: string) {
  return raw
    .replace(/_x([0-9a-f]{2})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/_\d+_$/, '')
    .toLowerCase()
    .trim()
}

export function nameOf(el: Element): string {
  // Walk up so shapes inside a named group/layer inherit its name.
  for (let e: Element | null = el; e && e.tagName.toLowerCase() !== 'svg'; e = e.parentElement) {
    const n = e.getAttribute('data-name') || e.getAttribute('inkscape:label') || e.getAttribute('id')
    if (n) return cleanName(n)
  }
  return ''
}

export function slotFor(name: string): Slot | null {
  if (!name || IGNORE.test(name)) return null
  for (const [slot, re] of SLOT_MATCHERS) if (re.test(name)) return slot
  return 'other'
}

type Mat = DOMMatrix

function samplePath(el: SVGGeometryElement, ctm: Mat): [number, number][] {
  const len = el.getTotalLength()
  const n = Math.max(24, Math.min(400, Math.round(len / 2)))
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const p = el.getPointAtLength((len * i) / n)
    const q = new DOMPoint(p.x, p.y).matrixTransform(ctm)
    pts.push([q.x, q.y])
  }
  return pts
}

// Mounts the SVG off-screen so the browser resolves transforms and units.
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

function centreOf(el: SVGGraphicsElement, svg: SVGSVGElement) {
  const bb = el.getBBox()
  return new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(toRoot(el, svg))
}

const DEFAULT_SLOTS: Partial<Record<Slot, Seg[]>> = {
  shroud: shroud(),
  sidePlate: sidePlate(),
  rearFender: rearFender(),
  frontFender: frontFender(),
}

function bboxOf(points: [number, number][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  return { x0, y0, x1, y1 }
}

const segPoints = (s: Seg[]) => s.map((p) => (p.length === 5 ? [p[3], p[4]] : [p[1], p[2]]) as [number, number])

export interface ParseResult {
  template: BikeTemplate
  warnings: string[]
}

export function parseTemplate(svgText: string, bikeId: string, fileName: string): ParseResult {
  const { svg, done } = mount(svgText)
  const warnings: string[] = []
  try {
    const shapes = [...svg.querySelectorAll('path, polygon, rect, ellipse, circle, polyline')] as SVGGeometryElement[]
    let rear: DOMPoint | null = null
    let front: DOMPoint | null = null
    const raw: { name: string; slot: Slot; pts: [number, number][] }[] = []
    for (const el of shapes) {
      const name = nameOf(el)
      if (/rear.?axle|axle.?rear|rear.?wheel.?(centre|center)/.test(name)) rear = centreOf(el, svg)
      else if (/front.?axle|axle.?front|front.?wheel.?(centre|center)/.test(name)) front = centreOf(el, svg)
      const slot = slotFor(name)
      if (!slot) continue
      if (el.getAttribute('fill') === 'none' && !el.getAttribute('stroke')) continue
      raw.push({ name, slot, pts: samplePath(el, toRoot(el, svg)) })
    }
    if (!raw.length) throw new Error('No panels found. Name each panel shape (e.g. "shroud", "side-plate") in your SVG.')

    for (const slot of ['shroud', 'sidePlate'] as Slot[])
      if (!raw.some((r) => r.slot === slot)) warnings.push(`No "${slot === 'sidePlate' ? 'side-plate' : slot}" panel found. The 3D preview uses the default shape for it.`)

    // Template space has y pointing down. Build template → world.
    let toWorld: BikeTemplate['toWorld']
    let side: 'right' | 'left'
    if (rear && front) {
      side = front.x > rear.x ? 'right' : 'left'
      const dt = Math.hypot(front.x - rear.x, front.y - rear.y)
      const dw = FRONT_WHEEL.x - REAR_WHEEL.x
      const s = dw / dt
      const sx = side === 'right' ? s : -s
      // Ignore any tilt: axles in a side view sit at the same height.
      toWorld = [sx, 0, 0, -s, REAR_WHEEL.x - sx * rear.x, REAR_WHEEL.y + s * rear.y]
    } else {
      warnings.push('No rear-axle / front-axle markers found, so panels were fitted to the default layout. Add the markers for an exact fit.')
      side = 'right'
      const all = bboxOf(raw.filter((r) => r.slot !== 'frontPlate').flatMap((r) => r.pts))
      const ref = bboxOf(Object.values(DEFAULT_SLOTS).flatMap((s) => segPoints(s!)))
      const s = (ref.x1 - ref.x0) / (all.x1 - all.x0)
      toWorld = [s, 0, 0, -s, ref.x0 - s * all.x0, ref.y1 + s * all.y0]
    }
    const [a, , , d, e, f] = toWorld
    const panels: TemplatePanel[] = raw.map((r) => ({
      name: r.name,
      slot: r.slot,
      seg: r.pts.map(([x, y], i) => [i ? 'L' : 'M', a * x + e, d * y + f] as Seg),
    }))
    return {
      template: { bikeId, fileName, svgText, toWorld, side, hasAxles: !!(rear && front), panels, updatedAt: new Date().toISOString() },
      warnings,
    }
  } finally {
    done()
  }
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
  setAll: (ts) => set({ templates: Object.fromEntries(ts.map((t) => [t.bikeId, t])) }),
}))

let loaded = false
// Loads published templates once. Fails quietly (e.g. static preview).
export async function loadTemplates() {
  if (loaded) return
  loaded = true
  try {
    const res = await fetch('/api/templates')
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return
    const data = await res.json()
    if (Array.isArray(data.templates)) useTemplates.getState().setAll(data.templates)
  } catch {
    /* no API available: built-in shapes are used */
  }
}

export interface PanelSet {
  shroud: Seg[][]
  sidePlate: Seg[][]
  rearFender: Seg[][]
  frontFender: Seg[][]
  other: Seg[][]
}

// The outlines to use for a bike: template panels when uploaded, else the
// built-in shapes (with the per-make tweaks).
export function panelSet(t: BikeTemplate | undefined, lift: number, rise: number): PanelSet {
  const def: PanelSet = { shroud: [shroud(lift)], sidePlate: [sidePlate(rise)], rearFender: [rearFender(rise)], frontFender: [frontFender()], other: [] }
  if (!t) return def
  const pick = (slot: Slot) => t.panels.filter((p) => p.slot === slot).map((p) => p.seg)
  const or = (a: Seg[][], b: Seg[][]) => (a.length ? a : b)
  return {
    shroud: or(pick('shroud'), def.shroud),
    sidePlate: or(pick('sidePlate'), def.sidePlate),
    rearFender: or(pick('rearFender'), def.rearFender),
    frontFender: or(pick('frontFender'), def.frontFender),
    other: pick('other'),
  }
}

export function panelsFor(cfg: { bikeId: string }) {
  const m = makeInfo(bikeById(cfg.bikeId).make)
  return panelSet(useTemplates.getState().templates[cfg.bikeId], m.shroudLift, m.tailRise)
}
