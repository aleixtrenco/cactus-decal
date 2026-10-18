// Builds a vector print file (SVG, opens directly in Adobe Illustrator) for
// an order. The kit artwork is re-drawn as vectors by running the same
// painters as the preview against an SVG-recording "canvas", then masked to
// the exact panel outlines from the uploaded template, with bleed.
//
// Layers: PRINT (artwork), CUT (magenta cut lines), INFO (order details).
// Lettering on the kit is converted to vector outlines, so the file prints
// the same on any machine without the fonts installed.

import opentype from 'opentype.js'
import ecUrl from '@fontsource/saira-extra-condensed/files/saira-extra-condensed-latin-800-normal.woff?url'
import s7Url from '@fontsource/saira/files/saira-latin-700-normal.woff?url'
import s8Url from '@fontsource/saira/files/saira-latin-800-normal.woff?url'
import { bikeById } from '../data/bikes'
import { designById } from '../data/designs'
import { FINISHES, KITS, MATERIALS } from '../data/pricing'
import type { KitConfig } from '../store/config'
import { paintFrontPlate, paintSheet, WORLD, type Side } from './graphics'
import type { Seg } from './shapes'
import { mount, nameOf, panelsFor, slotFor, toRoot, type BikeTemplate, type Slot } from './templates'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => (Math.abs(v) < 1e-9 ? '0' : +v.toFixed(3) + '')

type M6 = [number, number, number, number, number, number]

interface Fonts {
  ec800: opentype.Font
  s700: opentype.Font
  s800: opentype.Font
}
let fonts: Promise<Fonts | null> | null = null
function loadFonts() {
  const one = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((b) => opentype.parse(b))
  fonts ??= Promise.all([one(ecUrl), one(s7Url), one(s8Url)])
    .then(([ec800, s700, s800]) => ({ ec800, s700, s800 }))
    .catch(() => null)
  return fonts
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
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  globalAlpha: number
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  lineJoin: CanvasLineJoin
  lineCap: CanvasLineCap
}

// Records the subset of CanvasRenderingContext2D our painters use.
class SvgRecorder {
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

  get fillStyle() { return this.s.fillStyle }
  set fillStyle(v: string) { this.s.fillStyle = v }
  get strokeStyle() { return this.s.strokeStyle }
  set strokeStyle(v: string) { this.s.strokeStyle = v }
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
  private scale() {
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
      this.circle = { cx: a * x + c * y + e, cy: b * x + d * y + f, r: r * this.scale() }
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
      this.out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${this.s.fillStyle}"${this.alpha()}/>`)
    } else if (this.d) this.out.push(`<path d="${this.d}" fill="${this.s.fillStyle}"${this.alpha()}/>`)
  }
  stroke() {
    if (!this.d) return
    this.out.push(`<path d="${this.d}" fill="none" stroke="${this.s.strokeStyle}" stroke-width="${n(this.s.lineWidth * this.scale())}" stroke-linejoin="${this.s.lineJoin}" stroke-linecap="${this.s.lineCap}"${this.alpha()}/>`)
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.out.push(`<path d="M${this.tp(x, y)}L${this.tp(x + w, y)}L${this.tp(x + w, y + h)}L${this.tp(x, y + h)}Z" fill="${this.s.fillStyle}"${this.alpha()}/>`)
  }
  measureText(t: string) {
    this.measurer.font = this.s.font
    return this.measurer.measureText(t)
  }
  private text(t: string, x: number, y: number, paint: string) {
    const m = /^(italic\s+)?(\d+)\s+([\d.]+)px\s+(.+)$/.exec(this.s.font.trim())
    const italic = !!m?.[1]
    const weight = m?.[2] ?? '400'
    const size = parseFloat(m?.[3] ?? '10')
    const family = (m?.[4] ?? 'sans-serif').replace(/"/g, '')
    const met = this.measureText(t)
    const font = this.fonts && (/condensed/i.test(family) ? this.fonts.ec800 : +weight >= 800 ? this.fonts.s800 : /saira/i.test(family) ? this.fonts.s700 : null)
    const width = font ? font.getAdvanceWidth(t, size) : met.width
    let bx = x
    if (this.s.textAlign === 'center') bx = x - width / 2
    else if (this.s.textAlign === 'right' || this.s.textAlign === 'end') bx = x - width
    // Illustrator ignores dominant-baseline, so place the baseline ourselves.
    let by = y
    if (this.s.textBaseline === 'middle') by = y + (met.actualBoundingBoxAscent - met.actualBoundingBoxDescent) / 2
    else if (this.s.textBaseline === 'top') by = y + met.actualBoundingBoxAscent
    const at = mul(this.s.m, [1, 0, 0, 1, bx, by])
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
  fillText(t: string, x: number, y: number) { this.text(t, x, y, `fill="${this.s.fillStyle}"`) }
  strokeText(t: string, x: number, y: number) {
    this.text(t, x, y, `fill="none" stroke="${this.s.strokeStyle}" stroke-width="${n(this.s.lineWidth)}" stroke-linejoin="${this.s.lineJoin}"`)
  }
  drawImage(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    this.out.push(`<image href="${esc(img.src)}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" transform="${mstr(this.s.m)}"${this.alpha()}/>`)
  }
}

function record(f: Fonts | null, width: number, height: number, paint: (c: HTMLCanvasElement) => void) {
  const rec = new SvgRecorder(f)
  const fake = { width, height, getContext: () => rec }
  paint(fake as unknown as HTMLCanvasElement)
  return rec.out.join('\n')
}

interface PanelOut {
  name: string
  slot: Slot
  markup: string // element in template root coordinates
}

const SHEET_W = 2048

// Sheet pixel → world, for each side (inverse of the painter transform).
function sheetToWorld(side: Side): M6 {
  const k = (WORLD.x1 - WORLD.x0) / SHEET_W
  return side === 'right' ? [k, 0, 0, -k, WORLD.x0, WORLD.y1] : [-k, 0, 0, -k, WORLD.x1, WORLD.y1]
}

function segToD(seg: Seg[], m: M6) {
  const t = (x: number, y: number) => `${n(m[0] * x + m[2] * y + m[4])} ${n(m[1] * x + m[3] * y + m[5])}`
  return seg.map((p) => (p.length === 5 ? `Q${t(p[1], p[2])} ${t(p[3], p[4])}` : `${p[0]}${t(p[1], p[2])}`)).join('') + 'Z'
}

export interface PrintFile {
  svg: string
  fileName: string
  usedTemplate: boolean
}

export async function buildPrintSvg(cfg: KitConfig, template?: BikeTemplate & { svgText?: string }): Promise<PrintFile> {
  const f = await loadFonts()
  const bike = bikeById(cfg.bikeId)
  let panels: PanelOut[] = []
  let worldToTpl: M6
  let box = { x: 0, y: 0, w: 0, h: 0 }
  let unitsPerMm = 1
  let primary: Side = 'right'

  if (template?.svgText) {
    const { svg, done } = mount(template.svgText)
    try {
      const shapes = [...svg.querySelectorAll('path, polygon, rect, ellipse, circle, polyline')] as SVGGeometryElement[]
      for (const el of shapes) {
        const name = nameOf(el)
        const slot = slotFor(name)
        if (!slot) continue
        const clone = el.cloneNode(false) as Element
        for (const a of ['style', 'class', 'fill', 'stroke', 'stroke-width', 'id', 'data-name', 'opacity', 'clip-path', 'mask', 'filter']) clone.removeAttribute(a)
        const m = toRoot(el, svg)
        clone.setAttribute('transform', `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(n).join(' ')})`)
        panels.push({ name, slot, markup: new XMLSerializer().serializeToString(clone).replace(/ xmlns="[^"]*"/, '') })
      }
      const vb = svg.viewBox.baseVal
      const bb = svg.getBBox()
      box = vb && vb.width ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height } : { x: bb.x, y: bb.y, w: bb.width, h: bb.height }
      const wAttr = svg.getAttribute('width') ?? ''
      const wNum = parseFloat(wAttr)
      if (/mm$/.test(wAttr) && wNum) unitsPerMm = box.w / wNum
      else if (/cm$/.test(wAttr) && wNum) unitsPerMm = box.w / (wNum * 10)
      else if (/in$/.test(wAttr) && wNum) unitsPerMm = box.w / (wNum * 25.4)
      else unitsPerMm = 72 / 25.4 // Illustrator exports points as user units
    } finally {
      done()
    }
    const [a, , , d, e, f] = template.toWorld
    worldToTpl = [1 / a, 0, 0, 1 / d, -e / a, -f / d]
    primary = template.side
  } else {
    // No template: built-in outlines at roughly real size (1 world unit ≈ 1 m).
    const k = 1000
    worldToTpl = [k, 0, 0, -k, 0, 1.4 * k]
    unitsPerMm = 1
    const set = panelsFor(cfg)
    const add = (slot: Slot, segs: Seg[][]) => segs.forEach((s, i) => panels.push({ name: `${slot}${i ? `-${i + 1}` : ''}`, slot, markup: `<path d="${segToD(s, worldToTpl)}"/>` }))
    add('shroud', set.shroud)
    add('sidePlate', set.sidePlate)
    add('rearFender', set.rearFender)
    add('frontFender', set.frontFender)
    box = { x: -1300, y: 0, w: 2600, h: 1200 }
  }

  const printed = (slot: Slot) =>
    slot === 'sidePlate' || slot === 'frontPlate' || (slot === 'shroud' && cfg.kit !== 'plates') || cfg.kit === 'full'
  panels = panels.filter((p) => printed(p.slot))
  const sidePanels = panels.filter((p) => p.slot !== 'frontPlate')
  const plate = panels.find((p) => p.slot === 'frontPlate')

  const bleed = 3 * unitsPerMm
  const gap = 20 * unitsPerMm
  const cx = box.x + box.w / 2
  const mirror: M6 = mul([1, 0, 0, 1, 0, box.h + gap], [-1, 0, 0, 1, 2 * cx, 0])
  const other: Side = primary === 'right' ? 'left' : 'right'
  const art = (side: Side) => record(f, SHEET_W, SHEET_W / 2, (c) => paintSheet(c, cfg, side))
  const toTpl = (side: Side) => mul(worldToTpl, sheetToWorld(side))

  const maskBody = (list: PanelOut[]) => list.map((p) => p.markup.replace(/^<(\w+)/, `<$1 fill="#fff" stroke="#fff" stroke-width="${n(bleed * 2)}" stroke-linejoin="round"`)).join('\n')
  const cut = (list: PanelOut[]) => list.map((p) => p.markup.replace(/^<(\w+)/, `<$1 fill="none" stroke="#ec008c" stroke-width="${n(0.25 * unitsPerMm)}"`)).join('\n')
  const big = `x="${n(box.x - box.w)}" y="${n(box.y - box.h)}" width="${n(box.w * 3)}" height="${n(box.h * 4)}"`

  let plateArt = ''
  if (plate) {
    // Map the square plate artwork onto the plate outline's bounding box.
    const { svg, done } = mount(`<svg xmlns="http://www.w3.org/2000/svg">${plate.markup}</svg>`)
    const bb = (svg.firstElementChild as SVGGraphicsElement).getBBox()
    const m = toRoot(svg.firstElementChild as SVGGraphicsElement, svg)
    done()
    const p0 = new DOMPoint(bb.x, bb.y).matrixTransform(m)
    const p1 = new DOMPoint(bb.x + bb.width, bb.y + bb.height).matrixTransform(m)
    const S = 512
    const w = Math.abs(p1.x - p0.x)
    const k = w / S
    const mx = (p0.x + p1.x) / 2 - (S / 2) * k
    const my = (p0.y + p1.y) / 2 - (S / 2) * k
    plateArt = `<mask id="mask-plate" maskUnits="userSpaceOnUse" ${big}>${maskBody([plate])}</mask>
<g mask="url(#mask-plate)"><g transform="${mstr([k, 0, 0, k, mx, my])}">${record(f, S, S, (c) => paintFrontPlate(c, cfg))}</g></g>`
  }

  const totalH = box.h * 2 + gap + 60 * unitsPerMm
  const info = [
    `CACTUS DECAL LAB · ${bike.make} ${bike.model} (${bike.years})`,
    `Design ${designById(cfg.designId).name} · ${KITS[cfg.kit].label} · ${FINISHES[cfg.finish].label} · ${MATERIALS[cfg.material].label}`,
    `Rider ${cfg.rider.name || '-'} #${cfg.rider.number || '-'} · Colours ${Object.values(cfg.colors).join(' ')}`,
    template ? `Template ${template.fileName}` : 'Built-in outline: NOT a production template. Upload the model template before printing.',
  ]

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(totalH)}" width="${n(box.w / unitsPerMm)}mm" height="${n(totalH / unitsPerMm)}mm">
<defs>
<mask id="mask-${primary}" maskUnits="userSpaceOnUse" ${big}>${maskBody(sidePanels)}</mask>
<mask id="mask-${other}" maskUnits="userSpaceOnUse" ${big}><g transform="${mstr(mirror)}">${maskBody(sidePanels)}</g></mask>
</defs>
<g id="PRINT">
<g id="PRINT_${primary.toUpperCase()}_SIDE" mask="url(#mask-${primary})"><g transform="${mstr(toTpl(primary))}">
${art(primary)}
</g></g>
<g id="PRINT_${other.toUpperCase()}_SIDE" mask="url(#mask-${other})"><g transform="${mstr(mul(mirror, toTpl(other)))}">
${art(other)}
</g></g>
${plateArt ? `<g id="PRINT_FRONT_PLATE">${plateArt}</g>` : ''}
</g>
<g id="CUT">
<g id="CUT_${primary.toUpperCase()}_SIDE">${cut(panels)}</g>
<g id="CUT_${other.toUpperCase()}_SIDE" transform="${mstr(mirror)}">${cut(sidePanels)}</g>
</g>
<g id="INFO" font-family="'Saira'" font-size="${n(5 * unitsPerMm)}" fill="#111">
${info.map((t, i) => `<text x="${n(box.x + 10 * unitsPerMm)}" y="${n(box.y + box.h * 2 + gap + (12 + i * 8) * unitsPerMm)}">${esc(t)}</text>`).join('\n')}
</g>
</svg>`

  const slug = `${bike.make}-${cfg.rider.number || 'kit'}-${cfg.designId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
  return { svg, fileName: `cdl-print-${slug}.svg`, usedTemplate: !!template?.svgText }
}

export function downloadText(text: string, fileName: string, type = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
