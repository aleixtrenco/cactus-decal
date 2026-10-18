// Paints a graphics kit onto a side-view "sheet". Every decal panel samples
// this sheet by its world x/y position, so a design flows across shroud,
// side plate and fenders exactly like a printed kit. The left side is drawn
// mirrored (front on the left) with text kept readable.

import { bikeById, makeInfo } from '../data/bikes'
import { LOGO_SLOTS, NUMBER_FONTS, TEXT_PLACEMENTS, type Palette, type Placement } from '../data/designs'
import type { KitConfig } from '../store/config'
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

function worldTransform(ctx: CanvasRenderingContext2D, side: Side, W: number, H: number) {
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

type Painter = (ctx: CanvasRenderingContext2D, c: Palette) => void

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
      ctx.fillStyle = i % 2 ? c.primary : shade(c.primary, -0.25)
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.lineTo(x + 0.05, y0)
      ctx.lineTo(x + 0.11, y1)
      ctx.lineTo(x + 0.06, y1)
      ctx.closePath()
      ctx.fill()
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

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

// Picks black or white outline so lettering stays readable on any colour.
function outlineFor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
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
  fitText(ctx, text, font, at.w * scale, at.h * scale)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = at.h * scale * 0.12
    ctx.strokeStyle = outline
    ctx.strokeText(text, px, py)
  }
  ctx.fillStyle = fill
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

export function paintSheet(canvas: HTMLCanvasElement, cfg: KitConfig, side: Side, panels: PanelSet = panelsFor(cfg)) {
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')!
  const make = makeInfo(bikeById(cfg.bikeId).make)

  ctx.save()
  worldTransform(ctx, side, W, H)
  PATTERNS[cfg.designId](ctx, cfg.colors)

  // Solid number background on the side plate.
  ctx.fillStyle = cfg.rider.plateColor
  ctx.strokeStyle = cfg.colors.accent
  ctx.lineWidth = 0.012
  for (const seg of panels.sidePlate) {
    ctx.beginPath()
    tracePath(ctx, seg)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()

  const font = NUMBER_FONTS[cfg.rider.font].css
  const T = TEXT_PLACEMENTS
  drawText(ctx, cfg.rider.number, place(T.number, panels), side, W, H, font, cfg.rider.numberColor, outlineFor(cfg.rider.numberColor) === '#101010' ? '#101010' : undefined)
  drawText(ctx, cfg.rider.name.toUpperCase(), place(T.name, panels), side, W, H, NUMBER_FONTS.italic.css, cfg.rider.nameColor, outlineFor(cfg.rider.nameColor))
  if (cfg.makeLettering) {
    drawText(ctx, make.make.toUpperCase(), place(T.make, panels), side, W, H, NUMBER_FONTS.italic.css, cfg.colors.accent, outlineFor(cfg.colors.accent))
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
  ctx.fillStyle = cfg.rider.plateColor
  ctx.fillRect(0, 0, S, S)
  // Only the middle band (14%–86%) lands on the plate, see Bike.tsx.
  ctx.fillStyle = cfg.colors.primary
  ctx.fillRect(0, 0, S, S * 0.25)
  ctx.fillStyle = cfg.colors.accent
  ctx.fillRect(0, S * 0.25, S, S * 0.03)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = cfg.rider.numberColor
  fitText(ctx, cfg.rider.number, NUMBER_FONTS[cfg.rider.font].css, S * 0.62, S * 0.38)
  ctx.fillText(cfg.rider.number, S / 2, S * 0.53)
  fitText(ctx, cfg.rider.name.toUpperCase(), NUMBER_FONTS.italic.css, S * 0.5, S * 0.08)
  ctx.fillText(cfg.rider.name.toUpperCase(), S / 2, S * 0.78)
}

export async function ensureAssets(cfg: KitConfig) {
  await Promise.all([
    document.fonts.load(NUMBER_FONTS.block.css(40)),
    document.fonts.load(NUMBER_FONTS.wide.css(40)),
    document.fonts.load('700 40px "Saira"'),
    ...cfg.logos.map((l) => loadImage(l.src).catch(() => null)),
  ])
}
