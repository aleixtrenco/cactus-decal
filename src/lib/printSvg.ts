// Builds a vector print file (SVG, opens directly in Adobe Illustrator) for
// an order. The kit artwork is re-drawn as vectors by running the same
// painters as the preview against an SVG-recording "canvas", then masked to
// the exact panel outlines from the uploaded template, with bleed.
//
// Layers: PRINT (artwork), CUT (magenta cut lines), INFO (order details).
// Lettering on the kit is converted to vector outlines, so the file prints
// the same on any machine without the fonts installed.

import opentype from 'opentype.js'
import s7Url from '@fontsource/saira/files/saira-latin-700-normal.woff?url'
import s8Url from '@fontsource/saira/files/saira-latin-800-normal.woff?url'
import { FONTS } from '../data/fonts'
import { bikeById, typeLabel } from '../data/bikes'
import { designById } from '../data/designs'
import { FINISHES, MATERIALS } from '../data/pricing'
import type { KitConfig } from '../store/config'
import { paintFrontPlate, paintSheet, WORLD, type Side } from './graphics'
import type { Seg } from './shapes'
import { invert, mount, pieceElements, pieceToWorld, panelsFor, toRoot, type BikeTemplate, type M6, type Role, type TemplatePiece } from './templates'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => (Math.abs(v) < 1e-9 ? '0' : +v.toFixed(3) + '')


// Loaded font files by "family|weight", for outlining lettering.
type Fonts = Map<string, opentype.Font>
const fontFiles = new Map<string, string>([
  ...Object.values(FONTS).map((f) => [`${f.family}|${f.weight}`, f.file] as [string, string]),
  ['Saira|700', s7Url],
  ['Saira|800', s8Url],
])
const fontCache = new Map<string, Promise<opentype.Font | null>>()
async function loadFonts(): Promise<Fonts> {
  const out: Fonts = new Map()
  await Promise.all(
    [...fontFiles].map(async ([key, url]) => {
      if (!fontCache.has(key))
        fontCache.set(
          key,
          fetch(url)
            .then((r) => r.arrayBuffer())
            .then((b) => opentype.parse(b))
            .catch(() => null),
        )
      const f = await fontCache.get(key)!
      if (f) out.set(key, f)
    }),
  )
  return out
}
// Matches the browser's synthetic italic closely enough for lettering.
const ITALIC_SKEW = Math.tan((12 * Math.PI) / 180)
const mul = (p: M6, q: M6): M6 => [
  p[0] * q[0] + p[2] * q[1],
  p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3],
  p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4],
  p[1] * q[4] + p[3] * q[5] + p[5],
]
const mstr = (m: M6) => `matrix(${m.map(n).join(' ')})`

interface State {
  m: M6
  fillStyle: Style
  strokeStyle: Style
  lineWidth: number
  globalAlpha: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  lineJoin: CanvasLineJoin
  lineCap: CanvasLineCap
}

// A linear gradient as the painters create it (in their own coordinates).
class RecGradient {
  stops: [number, string][] = []
  x0: number
  y0: number
  x1: number
  y1: number
  constructor(x0: number, y0: number, x1: number, y1: number) {
    this.x0 = x0
    this.y0 = y0
    this.x1 = x1
    this.y1 = y1
  }
  addColorStop(o: number, c: string) {
    this.stops.push([o, c])
  }
}
type Style = string | RecGradient
let gradientIds = 0

// Records the subset of CanvasRenderingContext2D our painters use.
class SvgRecorder {
  defs: string[] = []
  out: string[] = []
  private s: State = { m: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt' }
  private stack: State[] = []
  private d = ''
  private circle: { cx: number; cy: number; r: number } | null = null
  private measurer = document.createElement('canvas').getContext('2d')!
  private fonts: Fonts | null
  constructor(fonts: Fonts | null) {
    this.fonts = fonts
  }

  get fillStyle(): Style { return this.s.fillStyle }
  set fillStyle(v: Style) { this.s.fillStyle = v }
  get strokeStyle(): Style { return this.s.strokeStyle }
  set strokeStyle(v: Style) { this.s.strokeStyle = v }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number) { return new RecGradient(x0, y0, x1, y1) }
  // SVG paint for a style. Gradients are defined in the painter's current
  // coordinates: `m` maps them to the element's own coordinates.
  private paint(v: Style, m: M6 = this.s.m): string {
    if (typeof v === 'string') return v
    const id = `cdlg${++gradientIds}`
    const p0 = [m[0] * v.x0 + m[2] * v.y0 + m[4], m[1] * v.x0 + m[3] * v.y0 + m[5]]
    const p1 = [m[0] * v.x1 + m[2] * v.y1 + m[4], m[1] * v.x1 + m[3] * v.y1 + m[5]]
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}">${v.stops.map(([o, c]) => `<stop offset="${n(o)}" stop-color="${c}"/>`).join('')}</linearGradient>`,
    )
    return `url(#${id})`
  }
  translate(x: number, y: number) { this.s.m = mul(this.s.m, [1, 0, 0, 1, x, y]) }
  rotate(a: number) { this.s.m = mul(this.s.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]) }
  scale(x: number, y: number) { this.s.m = mul(this.s.m, [x, 0, 0, y, 0, 0]) }
  get lineWidth() { return this.s.lineWidth }
  set lineWidth(v: number) { this.s.lineWidth = v }
  get globalAlpha() { return this.s.globalAlpha }
  set globalAlpha(v: number) { this.s.globalAlpha = v }
  get font() { return this.s.font }
  set font(v: string) { this.s.font = v }
  get textAlign() { return this.s.textAlign }
  set textAlign(v: CanvasTextAlign) { this.s.textAlign = v }
  get textBaseline() { return this.s.textBaseline }
  set textBaseline(v: CanvasTextBaseline) { this.s.textBaseline = v }
  get lineJoin() { return this.s.lineJoin }
  set lineJoin(v: CanvasLineJoin) { this.s.lineJoin = v }
  get lineCap() { return this.s.lineCap }
  set lineCap(v: CanvasLineCap) { this.s.lineCap = v }

  save() { this.stack.push({ ...this.s, m: [...this.s.m] as M6 }) }
  restore() { if (this.stack.length) this.s = this.stack.pop()! }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.s.m = [a, b, c, d, e, f] }

  private tp(x: number, y: number) {
    const [a, b, c, d, e, f] = this.s.m
    return `${n(a * x + c * y + e)} ${n(b * x + d * y + f)}`
  }
  private unit() {
    const [a, b, c, d] = this.s.m
    return Math.sqrt(Math.abs(a * d - b * c))
  }
  private alpha() { return this.s.globalAlpha < 1 ? ` opacity="${n(this.s.globalAlpha)}"` : '' }

  beginPath() { this.d = ''; this.circle = null }
  moveTo(x: number, y: number) { this.d += `M${this.tp(x, y)}`; this.circle = null }
  lineTo(x: number, y: number) { this.d += `${this.d ? 'L' : 'M'}${this.tp(x, y)}`; this.circle = null }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) { this.d += `Q${this.tp(cx, cy)} ${this.tp(x, y)}` }
  closePath() { this.d += 'Z' }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    if (!this.d && a1 - a0 >= Math.PI * 2 - 1e-6) {
      const [a, b, c, d, e, f] = this.s.m
      this.circle = { cx: a * x + c * y + e, cy: b * x + d * y + f, r: r * this.unit() }
      return
    }
    for (let i = 0; i <= 24; i++) {
      const t = a0 + ((a1 - a0) * i) / 24
      this.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r)
    }
  }
  fill() {
    if (this.circle) {
      const { cx, cy, r } = this.circle
      this.out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${this.paint(this.s.fillStyle)}"${this.alpha()}/>`)
    } else if (this.d) this.out.push(`<path d="${this.d}" fill="${this.paint(this.s.fillStyle)}"${this.alpha()}/>`)
  }
  stroke() {
    if (!this.d) return
    this.out.push(`<path d="${this.d}" fill="none" stroke="${this.paint(this.s.strokeStyle)}" stroke-width="${n(this.s.lineWidth * this.unit())}" stroke-linejoin="${this.s.lineJoin}" stroke-linecap="${this.s.lineCap}"${this.alpha()}/>`)
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.out.push(`<path d="M${this.tp(x, y)}L${this.tp(x + w, y)}L${this.tp(x + w, y + h)}L${this.tp(x, y + h)}Z" fill="${this.paint(this.s.fillStyle)}"${this.alpha()}/>`)
  }
  measureText(t: string) {
    this.measurer.font = this.s.font
    return this.measurer.measureText(t)
  }
  private text(t: string, x: number, y: number, style: Style, extra: string) {
    const m = /^(italic\s+)?(\d+)\s+([\d.]+)px\s+(.+)$/.exec(this.s.font.trim())
    const italic = !!m?.[1]
    const weight = m?.[2] ?? '400'
    const size = parseFloat(m?.[3] ?? '10')
    const family = (m?.[4] ?? 'sans-serif').replace(/"/g, '')
    const met = this.measureText(t)
    const font = this.fonts?.get(`${family}|${weight}`) ?? null
    const width = font ? font.getAdvanceWidth(t, size) : met.width
    let bx = x
    if (this.s.textAlign === 'center') bx = x - width / 2
    else if (this.s.textAlign === 'right' || this.s.textAlign === 'end') bx = x - width
    // Illustrator ignores dominant-baseline, so place the baseline ourselves.
    let by = y
    if (this.s.textBaseline === 'middle') by = y + (met.actualBoundingBoxAscent - met.actualBoundingBoxDescent) / 2
    else if (this.s.textBaseline === 'top') by = y + met.actualBoundingBoxAscent
    const at = mul(this.s.m, [1, 0, 0, 1, bx, by])
    // Gradients were made in the painter's space; the element's own space is
    // shifted by the baseline origin.
    const paint = `${style === 'none' ? 'fill="none"' : `fill="${this.paint(style, [1, 0, 0, 1, -bx, -by])}"`} ${extra}`
    if (font) {
      // Outlined lettering: no font needed on the print machine.
      const d = font.getPath(t, 0, 0, size).toPathData(3)
      const tm = italic ? mul(at, [1, 0, -ITALIC_SKEW, 1, 0, 0]) : at
      this.out.push(`<path d="${d}" transform="${mstr(tm)}" ${paint}${this.alpha()}/>`)
      return
    }
    this.out.push(
      `<text transform="${mstr(at)}" font-family="'${esc(family)}'" font-weight="${weight}"${italic ? ' font-style="italic"' : ''} font-size="${n(size)}" ${paint}${this.alpha()}>${esc(t)}</text>`,
    )
  }
  fillText(t: string, x: number, y: number) { this.text(t, x, y, this.s.fillStyle, '') }
  strokeText(t: string, x: number, y: number) {
    const stroke = typeof this.s.strokeStyle === 'string' ? this.s.strokeStyle : this.paint(this.s.strokeStyle)
    this.text(t, x, y, 'none', `stroke="${stroke}" stroke-width="${n(this.s.lineWidth)}" stroke-linejoin="${this.s.lineJoin}"`)
  }
  drawImage(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    this.out.push(`<image href="${esc(img.src)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" transform="${mstr(this.s.m)}"${this.alpha()}/>`)
  }
}

function record(f: Fonts, width: number, height: number, paint: (c: HTMLCanvasElement) => void) {
  const rec = new SvgRecorder(f)
  const fake = { width, height, getContext: () => rec }
  paint(fake as unknown as HTMLCanvasElement)
  return (rec.defs.length ? `<defs>${rec.defs.join('')}</defs>\n` : '') + rec.out.join('\n')
}

const SHEET_W = 2048

// Sheet pixel → world, for each side (inverse of the painter transform).
function sheetToWorld(side: Side): M6 {
  const k = (WORLD.x1 - WORLD.x0) / SHEET_W
  return side === 'right' ? [k, 0, 0, -k, WORLD.x0, WORLD.y1] : [-k, 0, 0, -k, WORLD.x1, WORLD.y1]
}

export interface PrintFile {
  svg: string
  fileName: string
  // False when built from the public outlines (no original SVG available).
  exact: boolean
}

const polyD = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)} ${n(y)}`).join('') + 'Z'

// Builds the print file on the template's own artboard: every piece keeps
// its exact position and cut line, and is filled with its part of the design.
export async function buildPrintSvg(cfg: KitConfig, template?: BikeTemplate): Promise<PrintFile> {
  const f = await loadFonts()
  const bike = bikeById(cfg.bikeId)
  const t = template ?? builtInTemplate(cfg)
  const pieces = t.pieces.filter((p) => p.role !== 'ignore')

  // Exact piece shapes from the original file when we have it.
  const shapes = new Map<number, string>()
  if (t.svgText) {
    const { svg, done } = mount(t.svgText)
    try {
      pieceElements(svg).forEach((el, id) => {
        const clone = el.cloneNode(false) as Element
        for (const a of ['style', 'class', 'fill', 'stroke', 'stroke-width', 'id', 'data-name', 'opacity', 'clip-path', 'mask', 'filter', 'transform']) clone.removeAttribute(a)
        const m = toRoot(el, svg)
        clone.setAttribute('transform', `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(n).join(' ')})`)
        const rule = getComputedStyle(el).fillRule
        if (rule === 'evenodd') clone.setAttribute('fill-rule', 'evenodd')
        shapes.set(id, new XMLSerializer().serializeToString(clone).replace(/ xmlns="[^"]*"/, ''))
      })
    } finally {
      done()
    }
  }
  const shapeOf = (p: TemplatePiece) => shapes.get(p.id) ?? `<path d="${polyD(p.outline)}"/>`
  const paint = (markup: string, attrs: string) => markup.replace(/^<(\w+)/, `<$1 ${attrs}`)

  const [vx, vy, vw, vh] = t.viewBox
  const bleed = vw * 0.002
  // Lettering (number, name, make, logos) only on the pieces it belongs to.
  const panels = panelsFor(cfg)
  const art = (side: Side, lettering: boolean) => record(f, SHEET_W, SHEET_W / 2, (c) => paintSheet(c, cfg, side, panels, { lettering }))
  const LETTERED: Role[] = ['shroud', 'sidePlate', 'rearFender']
  const big = `x="${n(vx - vw)}" y="${n(vy - vh)}" width="${n(vw * 3)}" height="${n(vh * 3)}"`

  const defs: string[] = [
    `<g id="art-right">${art('right', true)}</g>`,
    `<g id="art-left">${art('left', true)}</g>`,
    `<g id="art-right-plain">${art('right', false)}</g>`,
    `<g id="art-left-plain">${art('left', false)}</g>`,
  ]
  const printed: string[] = []
  for (const p of pieces) {
    const mask = `<mask id="m${p.id}" maskUnits="userSpaceOnUse" ${big}>${paint(shapeOf(p), `fill="#fff" stroke="#fff" stroke-width="${n(bleed * 2)}" stroke-linejoin="round"`)}</mask>`
    defs.push(mask)
    if (p.role === 'frontPlate') {
      const S = 512
      const k = Math.min(p.bbox.w, p.bbox.h * 1.1) / (S * 0.82)
      const mx = p.bbox.x + p.bbox.w / 2 - (S / 2) * k
      const my = p.bbox.y + p.bbox.h / 2 - (S / 2) * k
      printed.push(`<g id="piece-${p.id}-front-plate" mask="url(#m${p.id})"><g transform="${mstr([k, 0, 0, k, mx, my])}">${record(f, S, S, (c) => paintFrontPlate(c, cfg))}</g></g>`)
      continue
    }
    const side: Side = p.side === 'left' ? 'left' : 'right'
    const m = mul(invert(pieceToWorld(p, t.pieces)), sheetToWorld(side))
    const host = p.parent !== undefined ? (t.pieces.find((q) => q.id === p.parent) ?? p) : p
    const ref = `#art-${side}${LETTERED.includes(host.role) ? '' : '-plain'}`
    printed.push(`<g id="piece-${p.id}-${p.role}" mask="url(#m${p.id})"><use href="${ref}" xlink:href="${ref}" transform="${mstr(m)}"/></g>`)
  }
  const cut = pieces.map((p) => paint(shapeOf(p), `fill="none" stroke="#ec008c" stroke-width="${n(vw * 0.0004)}"`)).join('\n')

  const info = [
    `CACTUS DECAL LAB · ${bike.make} ${bike.model} (${bike.years}) · ${typeLabel(bike.type)} kit`,
    `Design ${designById(cfg.designId).name} · ${FINISHES[cfg.finish].label} · ${MATERIALS[cfg.material].label}`,
    `Rider ${cfg.rider.name || '-'} #${cfg.rider.number || '-'} · Colours ${Object.values(cfg.colors).join(' ')}`,
    template ? `Template ${t.fileName}${t.svgText ? '' : ' (outline copy: upload the original SVG in /admin for exact cut lines)'}` : 'No template for this model: built-in outlines, NOT for production.',
  ]
  const fs = vw * 0.011
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh + fs * 6)}">
<defs>
${defs.join('\n')}
</defs>
<g id="PRINT">
${printed.join('\n')}
</g>
<g id="CUT">
${cut}
</g>
<g id="INFO" font-family="'Saira', Arial, sans-serif" font-size="${n(fs)}" fill="#111">
${info.map((s, i) => `<text x="${n(vx)}" y="${n(vy + vh + fs * (1.6 + i * 1.3))}">${esc(s)}</text>`).join('\n')}
</g>
</svg>`

  const slug = `${bike.make}-${cfg.rider.number || 'kit'}-${cfg.designId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  return { svg, fileName: `cdl-print-${slug}.svg`, exact: !!t.svgText }
}

// Fallback when a model has no template: the built-in outlines laid out
// like a cut file (right side on the left, left side mirrored on the right).
function builtInTemplate(cfg: KitConfig): BikeTemplate {
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
        const outline = pts.map(([x, y]) => [side === 'right' ? (x - 1.3) * k : (1.3 - x) * k + 2700, (1.5 - y) * k] as [number, number])
        const xs = outline.map((q) => q[0])
        const ys = outline.map((q) => q[1])
        const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
        pieces.push({ id: pieces.length, role, side, outline, bbox, area: bbox.w * bbox.h })
      }
  // Built-in pieces already sit at their world spot: use an exact transform.
  return { bikeId: cfg.bikeId, fileName: 'built-in', viewBox: [-2600, 0, 5300, 1300], pieces, updatedAt: '' }
}

export function downloadText(text: string, fileName: string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
