// Brings in a kit the customer already has as a picture: a flat print
// layout (PNG/JPG) with the pieces laid out like our templates. Each piece is
// found in the picture, given a role the same way an SVG template is read
// (shroud, side plate, rear fender, ...), matched to the same piece of the
// customer's own model, and its artwork is fitted into that piece's cut
// outline. So a design made for another bike carries over to this one.

import { newId } from './layers'
import { autoAssign, type BikeTemplate, type PieceSide, type TemplatePiece } from './templates'
import type { Layer } from '../store/config'

type Pt = [number, number]
interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface ImportResult {
  layers: Layer[]
  found: number
  matched: number
}

const MAX_SRC = 3000
const WORK = 700

const loadBitmap = (file: File) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('unreadable'))
    img.src = url
  })

const boxOf = (p: Pt[]): Box => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of p) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const polyArea = (p: Pt[]) => Math.abs(p.reduce((a, [x, y], i) => a + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2

// Foreground: transparent pictures use their alpha; others everything that
// differs from the background colour (taken from the corners).
function foreground(px: Uint8ClampedArray, w: number, h: number) {
  const n = w * h
  let clear = 0
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] < 40) clear++
  const mask = new Uint8Array(n)
  if (clear > n * 0.05) {
    for (let i = 0; i < n; i++) mask[i] = px[i * 4 + 3] >= 40 ? 1 : 0
    return mask
  }
  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]])
  const bg = [0, 1, 2].map((c) => corners.map((k) => k[c]).sort((a, b) => a - b)[1])
  for (let i = 0; i < n; i++) {
    const d = Math.abs(px[i * 4] - bg[0]) + Math.abs(px[i * 4 + 1] - bg[1]) + Math.abs(px[i * 4 + 2] - bg[2])
    mask[i] = d > 60 ? 1 : 0
  }
  return mask
}

// Cut lines (thin magenta strokes in print files) separate pieces, as do
// gaps of a pixel or two: they are cleared before pieces are told apart.
function separate(mask: Uint8Array, px: Uint8ClampedArray, w: number, h: number) {
  const out = new Uint8Array(mask)
  for (let i = 0; i < mask.length; i++) {
    const r = px[i * 4]
    const g = px[i * 4 + 1]
    const b = px[i * 4 + 2]
    if (r > 170 && g < 110 && b > 90 && r - g > 110) out[i] = 0
  }
  // One pixel of erosion splits pieces that only just touch.
  const er = new Uint8Array(out)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (out[i] && (!out[i - 1] || !out[i + 1] || !out[i - w] || !out[i + w])) er[i] = 0
    }
  return er
}

// Connected pieces of the mask (8-neighbour), largest first.
function components(mask: Uint8Array, w: number, h: number) {
  const label = new Int32Array(w * h).fill(-1)
  const out: { start: number; count: number }[] = []
  const stack: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i] >= 0) continue
    const id = out.length
    let count = 0
    label[i] = id
    stack.push(i)
    while (stack.length) {
      const j = stack.pop()!
      count++
      const x = j % w
      const y = (j - x) / w
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const k = ny * w + nx
          if (mask[k] && label[k] < 0) {
            label[k] = id
            stack.push(k)
          }
        }
    }
    out.push({ start: i, count })
  }
  return { label, list: out }
}

// The outer boundary of one component (Moore neighbour tracing), starting
// at its first pixel in reading order.
const DX = [1, 1, 0, -1, -1, -1, 0, 1]
const DY = [0, 1, 1, 1, 0, -1, -1, -1]
function trace(label: Int32Array, w: number, h: number, id: number, start: number): Pt[] {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && label[y * w + x] === id
  const sx = start % w
  const sy = (start - sx) / w
  const pts: Pt[] = [[sx, sy]]
  let x = sx
  let y = sy
  // Arrived moving east (we came from the west, which is background).
  let dir = 0
  for (let step = 0; step < w * h * 4; step++) {
    let found = false
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8
      if (at(x + DX[d], y + DY[d])) {
        x += DX[d]
        y += DY[d]
        dir = d
        found = true
        break
      }
    }
    if (!found || (x === sx && y === sy)) break
    pts.push([x, y])
  }
  return pts
}

const resample = (p: Pt[], n: number) => (p.length <= n ? p : Array.from({ length: n }, (_, i) => p[Math.floor((i * p.length) / n)]))

// Pieces found in the picture, in the picture's own pixels.
function findPieces(src: HTMLCanvasElement) {
  const k = Math.min(1, WORK / Math.max(src.width, src.height))
  const w = Math.max(1, Math.round(src.width * k))
  const h = Math.max(1, Math.round(src.height * k))
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, 0, 0, w, h)
  const px = ctx.getImageData(0, 0, w, h).data
  const mask = separate(foreground(px, w, h), px, w, h)
  const { label, list } = components(mask, w, h)
  const minArea = w * h * 0.0015
  const pieces: TemplatePiece[] = []
  list.forEach((cmp, id) => {
    if (cmp.count < minArea) return
    const outline = resample(trace(label, w, h, id, cmp.start), 240).map(([x, y]) => [(x + 0.5) / k, (y + 0.5) / k] as Pt)
    if (outline.length < 3) return
    pieces.push({ id: pieces.length, role: 'other', side: 'center', outline, bbox: boxOf(outline), area: polyArea(outline) })
  })
  return autoAssign(pieces)
}

// Each side's area of a layout (the bike's right side, left side, centre).
function sideBoxes(pieces: TemplatePiece[]) {
  const groups = new Map<PieceSide, Box>()
  for (const side of ['right', 'left', 'center'] as PieceSide[]) {
    const ps = pieces.filter((p) => p.side === side)
    if (ps.length) groups.set(side, boxOf(ps.flatMap((p) => [[p.bbox.x, p.bbox.y], [p.bbox.x + p.bbox.w, p.bbox.y + p.bbox.h]] as Pt[])))
  }
  return groups
}

// Where a piece sits within its side of the layout (0–1), and its size.
function layoutOf(pieces: TemplatePiece[]) {
  const groups = sideBoxes(pieces)
  return (p: TemplatePiece) => {
    const g = groups.get(p.side)!
    return { cx: (p.bbox.x + p.bbox.w / 2 - g.x) / (g.w || 1), cy: (p.bbox.y + p.bbox.h / 2 - g.y) / (g.h || 1), w: p.bbox.w / (g.w || 1), h: p.bbox.h / (g.h || 1) }
  }
}

const MAIN = ['shroud', 'sidePlate', 'rearFender', 'frontFender', 'frontPlate']

// Pairs pieces of the customer's template with pieces of the picture, on the
// same side: the main parts with the same part first, then the rest by place
// and size. A picture piece far bigger than its partner is several pieces
// touching each other, so it isn't used as one.
function match(source: TemplatePiece[], target: TemplatePiece[]) {
  const ls = layoutOf(source)
  const lt = layoutOf(target)
  const usedT = new Set<number>()
  const usedS = new Set<number>()
  const out: { t: TemplatePiece; s: TemplatePiece }[] = []
  const run = (ok: (t: TemplatePiece, s: TemplatePiece) => boolean, limit: number) => {
    const pairs: { t: TemplatePiece; s: TemplatePiece; score: number }[] = []
    for (const t of target)
      for (const s of source) {
        if (usedT.has(t.id) || usedS.has(s.id) || s.side !== t.side || !ok(t, s)) continue
        const a = lt(t)
        const b = ls(s)
        if (b.w > a.w * 2 + 0.08 || b.h > a.h * 2 + 0.08) continue
        pairs.push({ t, s, score: 2.5 * Math.hypot(a.cx - b.cx, a.cy - b.cy) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h) })
      }
    pairs.sort((a, b) => a.score - b.score)
    for (const p of pairs) {
      if (p.score > limit || usedT.has(p.t.id) || usedS.has(p.s.id)) continue
      usedT.add(p.t.id)
      usedS.add(p.s.id)
      out.push(p)
    }
  }
  run((t, s) => MAIN.includes(t.role) && t.role === s.role, 2.5)
  run((t, s) => !MAIN.includes(t.role) && !MAIN.includes(s.role), 1.2)
  run(() => true, 0.9)
  return out
}

// A piece's picture as a file small enough to send with the order (2 MB):
// PNG, or WebP (also see-through) when the PNG is too big.
function encode(c: HTMLCanvasElement) {
  const png = c.toDataURL('image/png')
  if (png.length < 2.6e6) return png
  const webp = c.toDataURL('image/webp', 0.9)
  return webp.startsWith('data:image/webp') && webp.length < png.length ? webp : png
}

// One piece of the picture, cut along its outline (transparent around it).
function cutOut(src: HTMLCanvasElement, s: TemplatePiece) {
  const k = Math.min(1, 1000 / Math.max(s.bbox.w, s.bbox.h))
  const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(s.bbox.w * k)), height: Math.max(1, Math.round(s.bbox.h * k)) })
  const ctx = c.getContext('2d')!
  ctx.setTransform(k, 0, 0, k, -s.bbox.x * k, -s.bbox.y * k)
  // The piece's shape (a hair wider than the traced edge, so its own border
  // stays), then the picture kept only inside it.
  ctx.beginPath()
  s.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = 3 / k
  ctx.stroke()
  ctx.globalCompositeOperation = 'source-in'
  ctx.drawImage(src, 0, 0)
  return encode(c)
}

// The picture's kit pieces only (background made transparent), full size.
function artOnly(src: HTMLCanvasElement) {
  const ctx = src.getContext('2d', { willReadFrequently: true })!
  const data = ctx.getImageData(0, 0, src.width, src.height)
  const mask = foreground(data.data, src.width, src.height)
  for (let i = 0; i < mask.length; i++) if (!mask[i]) data.data[i * 4 + 3] = 0
  const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height })
  c.getContext('2d')!.putImageData(data, 0, 0)
  return { canvas: c, mask }
}

// For a template piece without its own match: the artwork at the same place
// in the picture's layout (e.g. where pieces touch and couldn't be told
// apart). Skipped when there is little artwork there.
function cutRegion(art: { canvas: HTMLCanvasElement; mask: Uint8Array }, r: Box) {
  const W = art.canvas.width
  const x0 = Math.max(0, Math.floor(r.x))
  const y0 = Math.max(0, Math.floor(r.y))
  const x1 = Math.min(W, Math.ceil(r.x + r.w))
  const y1 = Math.min(art.canvas.height, Math.ceil(r.y + r.h))
  if (x1 - x0 < 4 || y1 - y0 < 4) return null
  let on = 0
  let all = 0
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 40))
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      all++
      on += art.mask[y * W + x]
    }
  if (on < all * 0.25) return null
  const k = Math.min(1, 1000 / Math.max(x1 - x0, y1 - y0))
  const c = Object.assign(document.createElement('canvas'), { width: Math.round((x1 - x0) * k), height: Math.round((y1 - y0) * k) })
  c.getContext('2d')!.drawImage(art.canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height)
  return encode(c)
}

export async function importDesign(file: File, template: BikeTemplate): Promise<ImportResult> {
  const img = await loadBitmap(file)
  const k = Math.min(1, MAX_SRC / Math.max(img.naturalWidth, img.naturalHeight))
  const src = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) })
  src.getContext('2d')!.drawImage(img, 0, 0, src.width, src.height)
  URL.revokeObjectURL(img.src)
  const source = findPieces(src).filter((p) => p.parent === undefined)
  const target = template.pieces.filter((p) => p.parent === undefined && p.role !== 'ignore')
  const pairs = source.length >= 3 ? match(source, target) : []
  const layer = (t: TemplatePiece, src: string): Layer => ({
    id: newId(),
    kind: 'image',
    panel: `p${t.id}`,
    fit: true,
    src,
    name: `${file.name} · piece`,
    x: 0.5,
    y: 0.5,
    size: 1,
    rotation: 0,
    opacity: 1,
    fill: '#ffffff',
  })
  const layers = pairs.map(({ t, s }) => layer(t, cutOut(src, s)))
  // The rest: the same spot of the picture's layout, side by side.
  if (pairs.length) {
    const art = artOnly(src)
    const gs = sideBoxes(source)
    const lt = layoutOf(target)
    for (const t of target) {
      if (pairs.some((p) => p.t === t)) continue
      const g = gs.get(t.side)
      if (!g) continue
      const a = lt(t)
      const url = cutRegion(art, { x: g.x + (a.cx - a.w / 2) * g.w, y: g.y + (a.cy - a.h / 2) * g.h, w: a.w * g.w, h: a.h * g.h })
      if (url) layers.push(layer(t, url))
    }
  }
  return { layers, found: source.length, matched: layers.length }
}
