// Paints a graphics kit onto a side-view "sheet". Every decal panel samples
// this sheet by its world x/y position, so a design flows across shroud,
// side plate and fenders exactly like a printed kit. The left side is drawn
// mirrored (front on the left) with text kept readable.

import { bikeById, makeInfo } from '../data/bikes'
import { LOGO_SLOTS, TEXT_PLACEMENTS, type Palette, type Placement } from '../data/designs'
import { FONTS, fontById, loadFontFaces } from '../data/fonts'
import type { KitConfig, Layer } from '../store/config'
import { firstColor, paintStyle, type Box } from './paint'
import { SHAPES } from './shapes2d'
import { tracePath, type Seg } from './shapes'
import { panelsFor, type PanelSet } from './templates'

export type Side = 'right' | 'left'

export const WORLD = { x0: -1.25, x1: 1.25, y0: 0.25, y1: 1.5 }
const WW = WORLD.x1 - WORLD.x0
const WH = WORLD.y1 - WORLD.y0

export function uvFor(x: number, y: number, side: Side): [number, number] {
  const u = side === 'right' ? (x - WORLD.x0) / WW : (WORLD.x1 - x) / WW
  return [u, (y - WORLD.y0) / WH]
}

// Sheet width in px. Height is always half (the world box is 2:1).
export const sheetWidth = () => (typeof window !== 'undefined' && window.innerWidth < 700 ? 1024 : 2048)

export function worldTransform(ctx: CanvasRenderingContext2D, side: Side, W: number, H: number) {
  const sx = W / WW
  const sy = H / WH
  if (side === 'right') ctx.setTransform(sx, 0, 0, -sy, -WORLD.x0 * sx, H + WORLD.y0 * sy)
  else ctx.setTransform(-sx, 0, 0, -sy, WORLD.x1 * sx, H + WORLD.y0 * sy)
}

function toPx(x: number, y: number, side: Side, W: number, H: number) {
  const [u, v] = uvFor(x, y, side)
  return { px: u * W, py: (1 - v) * H, scale: W / WW }
}

// Small deterministic PRNG so camo/hex layouts never jump between redraws.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

type Fill = string | CanvasGradient
type Painter = (ctx: CanvasRenderingContext2D, c: Record<keyof Palette, Fill>) => void

const { x0, x1, y0, y1 } = WORLD

const PATTERNS: Record<string, Painter> = {
  dune(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const fills = [c.secondary, c.primary, c.base, c.primary, c.secondary]
    // Each ridge fills down to the ground, so paint the highest one first.
    for (let i = 4; i >= 0; i--) {
      ctx.beginPath()
      const base = 0.55 + i * 0.13
      ctx.moveTo(x0, y0)
      for (let x = x0; x <= x1 + 0.01; x += 0.02) ctx.lineTo(x, base + 0.07 * Math.sin(x * 3.2 + i * 1.3) + (x - 0.2) * 0.12)
      ctx.lineTo(x1, y0)
      ctx.closePath()
      ctx.fillStyle = fills[i]
      ctx.fill()
    }
    ctx.lineWidth = 0.012
    ctx.strokeStyle = c.accent
    ctx.beginPath()
    for (let x = x0; x <= x1; x += 0.02) {
      const y = 0.55 + 2 * 0.13 + 0.07 * Math.sin(x * 3.2 + 2 * 1.3) + (x - 0.2) * 0.12 + 0.025
      if (x === x0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  },
  saguaro(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    for (let i = 0; i < 26; i++) {
      const x = x0 + i * 0.1
      ctx.fillStyle = c.primary
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.lineTo(x + 0.05, y0)
      ctx.lineTo(x + 0.11, y1)
      ctx.lineTo(x + 0.06, y1)
      ctx.closePath()
      ctx.fill()
      if (i % 2 === 0) {
        // Darker alternate ribs.
        ctx.globalAlpha = 0.25
        ctx.fillStyle = '#000000'
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = c.accent
      ctx.lineWidth = 0.004
      for (let y = y0 + 0.04; y < y1; y += 0.07) {
        const sx = x + 0.025 + (y - y0) * 0.048
        ctx.beginPath()
        ctx.moveTo(sx, y)
        ctx.lineTo(sx - 0.018, y + 0.02)
        ctx.moveTo(sx, y)
        ctx.lineTo(sx + 0.018, y + 0.02)
        ctx.stroke()
      }
    }
    ctx.fillStyle = c.secondary
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y0)
    ctx.lineTo(x1, 0.62)
    ctx.lineTo(0.1, 0.8)
    ctx.lineTo(x0, 0.9)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.accent
    ctx.beginPath()
    ctx.moveTo(x0, 0.9)
    ctx.lineTo(0.1, 0.8)
    ctx.lineTo(x1, 0.62)
    ctx.lineTo(x1, 0.65)
    ctx.lineTo(0.1, 0.83)
    ctx.lineTo(x0, 0.93)
    ctx.closePath()
    ctx.fill()
  },
  shamal(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const r = rng(7)
    const cols = [c.primary, c.secondary, c.primary, c.accent]
    for (let i = 0; i < 34; i++) {
      const x = x0 + r() * WW
      const w = 0.02 + r() * 0.12
      const yA = y0 + r() * WH * 0.5
      ctx.fillStyle = cols[i % 4]
      ctx.beginPath()
      ctx.moveTo(x, yA)
      ctx.lineTo(x + w, yA)
      ctx.lineTo(x + w - 0.35, yA + 0.7)
      ctx.lineTo(x - 0.35, yA + 0.7)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = c.primary
    ctx.fillRect(x0, y0, WW, 0.38)
  },
  falcon(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const cols = [c.primary, c.secondary, c.accent, c.primary]
    for (let i = 0; i < 9; i++) {
      const tip = 0.9 - i * 0.26
      ctx.fillStyle = cols[i % 4]
      ctx.beginPath()
      ctx.moveTo(tip, 0.84)
      ctx.lineTo(tip - 0.42, y1)
      ctx.lineTo(tip - 0.52, y1)
      ctx.lineTo(tip - 0.1, 0.84)
      ctx.lineTo(tip - 0.52, y0)
      ctx.lineTo(tip - 0.42, y0)
      ctx.closePath()
      ctx.fill()
    }
  },
  hex(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const s = 0.045
    const h = s * Math.sqrt(3)
    for (let row = 0, y = y0; y < y1 + h; row++, y += h / 2) {
      for (let x = x0 + (row % 2) * s * 1.5; x < x1 + s; x += s * 3) {
        const t = (x - x0) / WW
        ctx.globalAlpha = Math.max(0, Math.min(1, t * 1.3 - 0.1))
        ctx.fillStyle = c.primary
        ctx.beginPath()
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k
          const px = x + Math.cos(a) * s * 0.86
          const py = y + Math.sin(a) * s * 0.86
          if (k) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    ctx.fillStyle = c.secondary
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y0)
    ctx.lineTo(x1, 0.72)
    ctx.lineTo(0.3, 0.72)
    ctx.lineTo(0.16, 0.84)
    ctx.lineTo(x0, 0.84)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.accent
    ctx.fillRect(x0, 0.84, WW * 0.55, 0.018)
  },
  mirage(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const step = 0.03
    ctx.fillStyle = c.primary
    for (let x = x0; x < x1; x += step) {
      for (let y = y0; y < y1; y += step) {
        const t = Math.max(0, Math.min(1, (y - 0.6) / 0.55 + Math.sin(x * 2) * 0.15))
        const r = step * 0.55 * t
        if (r < 0.002) continue
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.fillStyle = c.secondary
    ctx.fillRect(x0, 0.74, WW, 0.06)
    ctx.fillStyle = c.accent
    ctx.fillRect(x0, 0.82, WW, 0.018)
    ctx.fillRect(x0, 0.71, WW, 0.012)
  },
  camo(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const r = rng(42)
    const cols = [c.primary, c.secondary, c.accent]
    const g = 0.035
    for (let layer = 0; layer < 3; layer++) {
      for (let n = 0; n < 70 - layer * 18; n++) {
        let cx = Math.floor((x0 + r() * WW) / g) * g
        let cy = Math.floor((y0 + r() * WH) / g) * g
        ctx.fillStyle = cols[layer]
        for (let k = 0; k < 9; k++) {
          ctx.fillRect(cx, cy, g + 0.001, g + 0.001)
          cx += (Math.floor(r() * 3) - 1) * g
          cy += (Math.floor(r() * 3) - 1) * g
        }
      }
    }
  },
  blank(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
  },
  clean(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    ctx.fillStyle = c.primary
    ctx.beginPath()
    ctx.moveTo(x0, 0.82)
    ctx.lineTo(x1, 0.66)
    ctx.lineTo(x1, 0.78)
    ctx.lineTo(x0, 0.94)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.secondary
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y0)
    ctx.lineTo(x1, 0.6)
    ctx.lineTo(x0, 0.76)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = c.accent
    ctx.beginPath()
    ctx.moveTo(x0, 0.955)
    ctx.lineTo(x1, 0.795)
    ctx.lineTo(x1, 0.81)
    ctx.lineTo(x0, 0.97)
    ctx.closePath()
    ctx.fill()
  },
}

// Picks black or white outline so lettering stays readable on any colour.
function outlineFor(paint: string) {
  const n = parseInt(firstColor(paint).slice(1), 16)
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return l > 150 ? '#101010' : '#f4f4f2'
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, maxH: number) {
  let px = maxH
  ctx.font = font(px)
  const w = ctx.measureText(text).width
  if (w > maxW) px = (px * maxW) / w
  ctx.font = font(px)
  return px
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: { x: number; y: number; w: number; h: number },
  side: Side,
  W: number,
  H: number,
  font: (px: number) => string,
  fill: string,
  outline?: string,
) {
  if (!text) return
  const { px, py, scale } = toPx(at.x, at.y, side, W, H)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const size = fitText(ctx, text, font, at.w * scale, at.h * scale)
  const tw = ctx.measureText(text).width
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = at.h * scale * 0.12
    ctx.strokeStyle = outline
    ctx.strokeText(text, px, py)
  }
  ctx.fillStyle = paintStyle(ctx, fill, { x: px - tw / 2, y: py - size / 2, w: tw, h: size })
  ctx.fillText(text, px, py)
}

const imageCache = new Map<string, HTMLImageElement>()
export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = imageCache.get(src)
  if (hit?.complete) return Promise.resolve(hit)
  return new Promise((res, rej) => {
    const img = hit ?? new Image()
    img.onload = () => res(img)
    img.onerror = rej
    if (!hit) {
      img.src = src
      imageCache.set(src, img)
    }
  })
}

// Largest outline of a panel slot, used to anchor lettering and logos.
function anchorBox(panels: Seg[][]) {
  let best = { x0: 0, y0: 0, x1: 0, y1: 0 }
  let area = -1
  for (const seg of panels) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of seg) {
      const x = p.length === 5 ? p[3] : p[1]
      const y = p.length === 5 ? p[4] : p[2]
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
    const a = (x1 - x0) * (y1 - y0)
    if (a > area) {
      area = a
      best = { x0, y0, x1, y1 }
    }
  }
  return best
}

function place(p: Placement, panels: PanelSet) {
  const b = anchorBox(panels[p.panel])
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  return { x: b.x0 + p.rx * w, y: b.y0 + p.ry * h, w: p.rw * w, h: p.rh * h }
}

// `lettering: false` paints the pattern only (for trim pieces in print files).
export function paintSheet(canvas: HTMLCanvasElement, cfg: KitConfig, side: Side, panels: PanelSet = panelsFor(cfg), { lettering = true } = {}) {
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')!
  const make = makeInfo(bikeById(cfg.bikeId).make)

  ctx.save()
  worldTransform(ctx, side, W, H)
  const sheetBox = { x: x0, y: y0, w: WW, h: WH }
  const c = cfg.colors
  const fills = { base: paintStyle(ctx, c.base, sheetBox), primary: paintStyle(ctx, c.primary, sheetBox), secondary: paintStyle(ctx, c.secondary, sheetBox), accent: paintStyle(ctx, c.accent, sheetBox) }
  PATTERNS[cfg.designId](ctx, fills)
  // Customer photos used as the whole background go straight over the pattern.
  for (const l of cfg.layers) if (l.kind === 'image' && l.cover) drawCover(ctx, l, W, H)
  worldTransform(ctx, side, W, H)
  if (!lettering) {
    ctx.restore()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return
  }

  // Solid number background on the side plate.
  const plateBox = anchorBoxOf(panels.sidePlate)
  ctx.fillStyle = paintStyle(ctx, cfg.rider.plateColor, plateBox)
  ctx.strokeStyle = fills.accent
  ctx.lineWidth = 0.012
  for (const seg of panels.sidePlate) {
    ctx.beginPath()
    tracePath(ctx, seg)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()

  for (const l of cfg.layers) if (!(l.kind === 'image' && l.cover)) drawLayer(ctx, l, panels, side, W, H)

  const font = fontById(cfg.rider.font).css
  const T = TEXT_PLACEMENTS
  drawText(ctx, cfg.rider.number, place(T.number, panels), side, W, H, font, cfg.rider.numberColor, outlineFor(cfg.rider.numberColor) === '#101010' ? '#101010' : undefined)
  drawText(ctx, cfg.rider.name.toUpperCase(), place(T.name, panels), side, W, H, font, cfg.rider.nameColor, outlineFor(cfg.rider.nameColor))
  if (cfg.makeLettering) {
    drawText(ctx, make.make.toUpperCase(), place(T.make, panels), side, W, H, FONTS.italic.css, cfg.colors.accent, outlineFor(cfg.colors.accent))
  }
  drawText(ctx, 'CACTUS DECAL LAB', place(T.tag, panels), side, W, H, (px) => `700 ${px}px "Saira"`, outlineFor(cfg.colors.base) === '#101010' ? '#101010' : '#f4f4f2')

  for (const logo of cfg.logos) {
    const img = imageCache.get(logo.src)
    if (!img?.complete || !img.naturalWidth) continue
    const slot = place(LOGO_SLOTS[logo.slot], panels)
    const { px, py, scale } = toPx(slot.x, slot.y, side, W, H)
    const bw = slot.w * scale
    const bh = slot.h * scale
    const k = Math.min(bw / img.naturalWidth, bh / img.naturalHeight)
    const dw = img.naturalWidth * k
    const dh = img.naturalHeight * k
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(img, px - dw / 2, py - dh / 2, dw, dh)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

export function paintFrontPlate(canvas: HTMLCanvasElement, cfg: KitConfig) {
  const S = canvas.width
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const all = { x: 0, y: 0, w: S, h: S }
  ctx.fillStyle = paintStyle(ctx, cfg.rider.plateColor, all)
  ctx.fillRect(0, 0, S, S)
  // Only the middle band (14%–86%) lands on the plate, see Bike.tsx.
  ctx.fillStyle = paintStyle(ctx, cfg.colors.primary, all)
  ctx.fillRect(0, 0, S, S * 0.25)
  ctx.fillStyle = paintStyle(ctx, cfg.colors.accent, all)
  ctx.fillRect(0, S * 0.25, S, S * 0.03)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = paintStyle(ctx, cfg.rider.numberColor, { x: S * 0.19, y: S * 0.34, w: S * 0.62, h: S * 0.38 })
  fitText(ctx, cfg.rider.number, fontById(cfg.rider.font).css, S * 0.62, S * 0.38)
  ctx.fillText(cfg.rider.number, S / 2, S * 0.53)
  fitText(ctx, cfg.rider.name.toUpperCase(), FONTS.italic.css, S * 0.5, S * 0.08)
  ctx.fillText(cfg.rider.name.toUpperCase(), S / 2, S * 0.78)
}

export async function ensureAssets(cfg: KitConfig) {
  await Promise.all([
    loadFontFaces(['italic', 'block', 'wide', cfg.rider.font, ...cfg.layers.map((l) => l.font)]),
    document.fonts.load('700 40px "Saira"'),
    ...cfg.logos.map((l) => loadImage(l.src).catch(() => null)),
    ...cfg.layers.filter((l) => l.src).map((l) => loadImage(l.src!).catch(() => null)),
  ])
}

// ---------- Customer layers ----------

const KIT_BOX = { x0: -1.15, y0: 0.6, x1: 1.05, y1: 1.2 }

const anchorBoxOf = (segs: Seg[][]): Box => {
  const b = anchorBox(segs)
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }
}

// Where a layer sits in world units: its centre and its height.
export function layerFrame(l: Layer, panels: PanelSet) {
  const b = l.panel === 'kit' ? KIT_BOX : anchorBox(panels[l.panel])
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  return { cx: b.x0 + l.x * w, cy: b.y0 + l.y * h, h: l.size * h, panel: { x: b.x0, y: b.y0, w, h } }
}

let measureCtx: CanvasRenderingContext2D | null = null

// A layer's centre and size in world units, matching how it is drawn (used
// for selection boxes and dragging in the designer).
export function layerBox(l: Layer, panels: PanelSet) {
  const f = layerFrame(l, panels)
  let aspect = 1
  if (l.kind === 'shape' && l.shape) aspect = SHAPES[l.shape].aspect
  else if (l.kind === 'text') {
    measureCtx ??= document.createElement('canvas').getContext('2d')!
    measureCtx.font = fontById(l.font).css(100)
    aspect = Math.max(0.3, measureCtx.measureText(l.text ?? '').width / 100)
  } else if (l.kind === 'image') {
    const img = l.src ? imageCache.get(l.src) : undefined
    aspect = img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 1
  }
  return { cx: f.cx, cy: f.cy, w: f.h * aspect, h: f.h, panel: f.panel }
}

function drawCover(ctx: CanvasRenderingContext2D, l: Layer, W: number, H: number) {
  const img = l.src ? imageCache.get(l.src) : undefined
  if (!img?.complete || !img.naturalWidth) return
  // Cover the area around the plastics, unmirrored so photos read correctly.
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = l.opacity
  ctx.drawImage(img, (W - img.naturalWidth * k) / 2, (H - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k)
  ctx.restore()
}

function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, panels: PanelSet, side: Side, W: number, H: number) {
  const f = layerFrame(l, panels)
  ctx.save()
  ctx.globalAlpha = l.opacity
  if (l.kind === 'shape' && l.shape) {
    // Shapes live in world space, so the left side mirrors like the pattern.
    worldTransform(ctx, side, W, H)
    const s = SHAPES[l.shape]
    ctx.translate(f.cx, f.cy)
    ctx.rotate((l.rotation * Math.PI) / 180)
    ctx.scale(f.h, f.h)
    ctx.fillStyle = paintStyle(ctx, l.fill, { x: -s.aspect / 2, y: -0.5, w: s.aspect, h: 1 })
    ctx.beginPath()
    s.draw(ctx, l.outline ?? '#101010')
    ctx.fill()
    if (l.outline && l.shape !== 'checker') {
      ctx.lineWidth = 0.05
      ctx.lineJoin = 'round'
      ctx.strokeStyle = l.outline
      ctx.stroke()
    }
  } else {
    // Text and images stay readable on both sides: drawn unmirrored, with
    // the rotation flipped on the left so the layout still mirrors.
    const { px, py, scale } = toPx(f.cx, f.cy, side, W, H)
    const hp = f.h * scale
    ctx.setTransform(1, 0, 0, 1, px, py)
    ctx.rotate(((side === 'right' ? -1 : 1) * l.rotation * Math.PI) / 180)
    if (l.kind === 'text' && l.text) {
      const font = fontById(l.font)
      ctx.font = font.css(hp)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const tw = ctx.measureText(l.text).width
      if (l.outline) {
        ctx.lineJoin = 'round'
        ctx.lineWidth = hp * 0.14
        ctx.strokeStyle = l.outline
        ctx.strokeText(l.text, 0, 0)
      }
      ctx.fillStyle = paintStyle(ctx, l.fill, { x: -tw / 2, y: -hp / 2, w: tw, h: hp })
      ctx.fillText(l.text, 0, 0)
    } else if (l.kind === 'image' && l.src) {
      const img = imageCache.get(l.src)
      if (img?.complete && img.naturalWidth) {
        const wp = (img.naturalWidth / img.naturalHeight) * hp
        ctx.drawImage(img, -wp / 2, -hp / 2, wp, hp)
      }
    }
  }
  ctx.restore()
}

// For real 3D models: the kit artwork with everything outside the printed
// pieces made transparent, so it can be projected onto the model.
export function paintDecalSheet(canvas: HTMLCanvasElement, cfg: KitConfig, side: Side, outlines: [number, number][][], panels: PanelSet = panelsFor(cfg)) {
  paintSheet(canvas, cfg, side, panels)
  const ctx = canvas.getContext('2d')!
  ctx.save()
  worldTransform(ctx, side, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  for (const o of outlines) {
    o.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
  }
  ctx.fillStyle = '#000'
  ctx.fill('nonzero')
  ctx.restore()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
