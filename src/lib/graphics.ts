// Paints a graphics kit onto a side-view "sheet". Every decal panel samples
// this sheet by its world x/y position, so a design flows across shroud,
// side plate and fenders exactly like a printed kit. The left side is drawn
// mirrored (front on the left) with text kept readable.

import { bikeById, makeInfo } from '../data/bikes'
import { LOGO_SLOTS, type Palette, type Placement } from '../data/designs'
import { FONTS, fontById, loadFontFaces, type FontId } from '../data/fonts'
import { pieceIdOf, type KitConfig, type Layer, type LayerPanel, type RiderPlace, type RiderText } from '../store/config'
import { firstColor, paintStyle, type Box, type Paint } from './paint'
import { SHAPES } from './shapes2d'
import { tracePath, type Seg } from './shapes'
import { apply as applyM6, invert as invertM6, panelsFor, type PanelSet, type TemplatePiece } from './templates'

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

// Fills a polygon given as [x, y] world points.
function shape(ctx: CanvasRenderingContext2D, fill: Fill, pts: [number, number][]) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

// A straight band between two points, `w` thick, with square ends.
function band(ctx: CanvasRenderingContext2D, fill: Fill, a: [number, number], b: [number, number], w: number) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l = Math.hypot(dx, dy) || 1
  const nx = (-dy / l) * (w / 2)
  const ny = (dx / l) * (w / 2)
  shape(ctx, fill, [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ])
}

// A smooth curved band (quadratic), `w` thick, tapering at both ends.
function swoosh(ctx: CanvasRenderingContext2D, fill: Fill, a: [number, number], c: [number, number], b: [number, number], w: number) {
  const n = 40
  const top: [number, number][] = []
  const bot: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0]
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]
    const tx = 2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0])
    const ty = 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])
    const l = Math.hypot(tx, ty) || 1
    const half = (w / 2) * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85))
    top.push([x - (ty / l) * half, y + (tx / l) * half])
    bot.push([x + (ty / l) * half, y - (tx / l) * half])
  }
  shape(ctx, fill, [...top, ...bot.reverse()])
}

const PATTERNS: Record<string, Painter> = {
  // Inspired by a black, white and purple factory-style race kit.
  factory(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    // Purple wedge low on the shroud, running back under the seat.
    shape(ctx, c.secondary, [
      [-0.85, 0.66],
      [0.1, 0.74],
      [0.6, 0.94],
      [0.62, 0.78],
      [0.2, 0.66],
      [-0.85, 0.56],
    ])
    // Big white arrow across the shroud, pointing forward.
    shape(ctx, c.primary, [
      [-0.26, 0.86],
      [0.12, 1.24],
      [0.58, 1.24],
      [0.58, 1.1],
      [0.3, 1.05],
      [0.1, 0.86],
    ])
    // Black notch through the white.
    band(ctx, c.base, [-0.02, 0.93], [0.4, 1.17], 0.028)
    // Orange slashes.
    band(ctx, c.accent, [0.08, 0.82], [0.58, 1.06], 0.045)
    band(ctx, c.accent, [-0.85, 1.0], [-0.32, 1.05], 0.02)
    // White blade over the rear fender.
    shape(ctx, c.primary, [
      [-0.9, 1.15],
      [-0.3, 1.1],
      [-0.36, 1.06],
      [-0.9, 1.07],
    ])
    // Front fender: white arrow with a purple tip.
    shape(ctx, c.primary, [
      [0.45, 0.7],
      [1.25, 0.66],
      [1.25, 0.56],
      [0.6, 0.62],
    ])
    shape(ctx, c.secondary, [
      [0.95, 0.66],
      [1.25, 0.66],
      [1.25, 0.6],
    ])
  },
  // Inspired by a waffle-cone and sprinkles custom kit.
  sugar(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const top = (x: number) => 0.86 + 0.05 * Math.sin(x * 2.1) - (x + 1.25) * 0.03
    const cone: [number, number][] = [[x0, y0]]
    for (let x = x0; x <= x1 + 0.001; x += 0.02) cone.push([x, top(x)])
    cone.push([x1, y0])
    ctx.save()
    shape(ctx, c.primary, cone)
    ctx.clip()
    // Waffle grid: lighter squares with darker crossing ridges.
    const g = 0.07
    ctx.globalAlpha = 0.28
    ctx.fillStyle = '#ffffff'
    for (let i = -40; i < 40; i++)
      for (let j = -10; j < 30; j++) {
        const cx = i * g + (j % 2) * (g / 2)
        const cy = y0 + j * (g / 2)
        shape(ctx, '#ffffff', [
          [cx, cy + g * 0.36],
          [cx + g * 0.36, cy],
          [cx, cy - g * 0.36],
          [cx - g * 0.36, cy],
        ])
      }
    ctx.globalAlpha = 1
    ctx.strokeStyle = c.accent
    ctx.lineWidth = 0.009
    for (let k = -60; k < 60; k++) {
      ctx.beginPath()
      ctx.moveTo(x0 + k * g * 0.7071 * 1.414, y0)
      ctx.lineTo(x0 + k * g * 0.7071 * 1.414 + 2, y0 + 2)
      ctx.moveTo(x0 + k * g * 0.7071 * 1.414, y0)
      ctx.lineTo(x0 + k * g * 0.7071 * 1.414 - 2, y0 + 2)
      ctx.stroke()
    }
    ctx.restore()
    // Pink icing drips over the edge of the cone.
    const drip: [number, number][] = []
    for (let x = x0; x <= x1 + 0.001; x += 0.01) {
      const d = Math.max(0, Math.sin(x * 9.3) * 0.5 + Math.sin(x * 23.1) * 0.5)
      drip.push([x, top(x) - 0.012 - d * d * 0.07])
    }
    for (let x = x1; x >= x0 - 0.001; x -= 0.02) drip.push([x, top(x) + 0.03])
    shape(ctx, c.secondary, drip)
    // Sprinkles on the white.
    const r = rng(21)
    const cols = [c.secondary, '#ffd200', '#5fd3b5', '#3aa0ff', '#ff8a00']
    for (let i = 0; i < 160; i++) {
      const x = x0 + r() * WW
      const y = top(x) + 0.05 + r() * (y1 - top(x))
      const a = r() * Math.PI
      band(ctx, cols[i % cols.length], [x - Math.cos(a) * 0.018, y - Math.sin(a) * 0.018], [x + Math.cos(a) * 0.018, y + Math.sin(a) * 0.018], 0.013)
    }
  },
  // Inspired by a black retro kit with orange and red pinstripe swooshes.
  retro(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const sweeps: [[number, number], [number, number], [number, number], number, Fill][] = [
      [[-0.95, 0.98], [-0.1, 1.24], [0.6, 1.04], 0.09, c.primary],
      [[-0.9, 0.9], [0.0, 1.1], [0.62, 0.9], 0.05, c.secondary],
      [[-0.4, 0.7], [0.2, 0.9], [0.66, 0.72], 0.06, c.primary],
      [[0.42, 0.6], [0.8, 0.8], [1.25, 0.6], 0.06, c.primary],
    ]
    for (const [a, m, b, w, f] of sweeps) swoosh(ctx, f, a, m, b, w)
    // Fine pinstripes under each swoosh.
    ctx.strokeStyle = c.accent
    ctx.lineWidth = 0.007
    for (const [a, m, b, w] of sweeps) {
      ctx.beginPath()
      ctx.moveTo(a[0], a[1] - w * 0.75)
      ctx.quadraticCurveTo(m[0], m[1] - w * 0.75, b[0], b[1] - w * 0.75)
      ctx.stroke()
    }
  },
  // Torn claw marks ripping through a bold band, nose to tail.
  claw(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    // Sweeping band low across the kit, rising to the front.
    shape(ctx, c.primary, [
      [x0, 0.98],
      [-0.4, 0.92],
      [0.2, 0.86],
      [0.7, 0.92],
      [x1, 0.74],
      [x1, 0.6],
      [0.6, 0.72],
      [0.1, 0.7],
      [-0.5, 0.8],
      [x0, 0.86],
    ])
    band(ctx, c.secondary, [x0, 1.02], [-0.35, 0.96], 0.018)
    band(ctx, c.secondary, [-0.35, 0.96], [0.72, 0.97], 0.018)
    // Four tapered tears, slanting back like a swipe.
    const tear = (x: number, y: number, len: number, w: number) => {
      const pts: [number, number][] = []
      const n = 14
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const jag = (i % 2 ? 0.35 : 0) * w
        pts.push([x - t * len * 0.55 + jag, y - t * len - jag * 0.3])
      }
      for (let i = n; i >= 0; i--) {
        const t = i / n
        const half = w * Math.sin(Math.PI * Math.min(1, 0.1 + t))
        pts.push([x - t * len * 0.55 + half, y - t * len + half * 0.2])
      }
      shape(ctx, c.accent, pts)
    }
    for (const [x, y] of [
      [0.5, 1.16],
      [0.36, 1.18],
      [0.22, 1.18],
      [0.08, 1.15],
    ] as [number, number][])
      tear(x, y, 0.42, 0.05)
    for (const [x, y] of [
      [-0.6, 1.17],
      [-0.72, 1.17],
      [-0.84, 1.15],
    ] as [number, number][])
      tear(x, y, 0.2, 0.03)
  },
  // A chequered flag band across the kit with racing-red borders.
  checkmate(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const flag = (pts: [number, number][], g: number) => {
      ctx.save()
      shape(ctx, c.base, pts)
      ctx.clip()
      for (let i = -60; i < 60; i++)
        for (let j = -10; j < 30; j++)
          if ((i + j) % 2 === 0) {
            ctx.fillStyle = c.primary
            ctx.fillRect(i * g, y0 + j * g, g, g)
          }
      ctx.restore()
    }
    const main: [number, number][] = [
      [-0.1, 0.72],
      [0.66, 1.18],
      [0.92, 1.18],
      [0.16, 0.72],
    ]
    flag(main, 0.045)
    band(ctx, c.secondary, [-0.13, 0.72], [0.63, 1.18], 0.03)
    band(ctx, c.secondary, [0.19, 0.72], [0.95, 1.18], 0.03)
    // Long stripes along the side and rear, a smaller flag on the tail.
    band(ctx, c.secondary, [x0, 1.08], [-0.15, 0.95], 0.04)
    band(ctx, c.accent, [x0, 1.03], [-0.17, 0.91], 0.012)
    flag(
      [
        [-1.0, 1.12],
        [-0.62, 1.1],
        [-0.62, 1.2],
        [-1.0, 1.22],
      ],
      0.035,
    )
    // Front fender: red tip with a fine stripe.
    shape(ctx, c.secondary, [
      [0.9, 0.7],
      [1.25, 0.66],
      [1.25, 0.56],
      [1.0, 0.6],
    ])
  },
  // Layered waves rolling from tail to nose, with spray.
  tidal(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    const wave = (fill: Fill, top: (x: number) => number) => {
      const pts: [number, number][] = [[x0, y0]]
      for (let x = x0; x <= x1 + 0.001; x += 0.01) pts.push([x, top(x)])
      pts.push([x1, y0])
      shape(ctx, fill, pts)
    }
    wave(c.secondary, (x) => 0.96 + 0.07 * Math.sin(x * 3.2 + 0.6) + 0.02 * Math.sin(x * 9))
    wave(c.primary, (x) => 0.86 + 0.06 * Math.sin(x * 3.2 - 0.2) + 0.015 * Math.sin(x * 11 + 1))
    wave(c.secondary, (x) => 0.74 + 0.05 * Math.sin(x * 3.6 - 1.1))
    // A thin accent line riding the top wave.
    ctx.strokeStyle = c.accent
    ctx.lineWidth = 0.012
    ctx.beginPath()
    for (let x = x0; x <= x1 + 0.001; x += 0.01) {
      const y = 1.0 + 0.07 * Math.sin(x * 3.2 + 0.6) + 0.02 * Math.sin(x * 9)
      if (x === x0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Spray above the crest.
    const r = rng(7)
    for (let i = 0; i < 90; i++) {
      const x = x0 + r() * WW
      const y = 1.04 + 0.07 * Math.sin(x * 3.2 + 0.6) + r() * 0.12
      ctx.beginPath()
      ctx.arc(x, y, 0.004 + r() * 0.01, 0, Math.PI * 2)
      ctx.fillStyle = c.primary
      ctx.fill()
    }
  },
  // Inspired by a blue kit with red and white heritage speed blocks.
  speedblock(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    // Speed blocks: slanted blocks shrinking towards the rear, white edged.
    const blocks = [
      [0.3, 0.9, 0.17, 0.24],
      [0.1, 0.88, 0.13, 0.2],
      [-0.06, 0.86, 0.1, 0.17],
      [-0.18, 0.85, 0.07, 0.13],
      [-0.27, 0.84, 0.045, 0.1],
    ]
    for (const [x, y, w, h] of blocks) {
      const sk = h * 0.45
      const pad = 0.012
      shape(ctx, c.secondary, [
        [x - pad, y - pad],
        [x + w + pad, y - pad],
        [x + w + sk + pad, y + h + pad],
        [x + sk - pad, y + h + pad],
      ])
      shape(ctx, c.primary, [
        [x, y],
        [x + w, y],
        [x + w + sk, y + h],
        [x + sk, y + h],
      ])
    }
    // Long white and red stripes along the rear.
    band(ctx, c.secondary, [x0, 1.12], [-0.3, 1.08], 0.05)
    band(ctx, c.primary, [x0, 1.06], [-0.32, 1.03], 0.035)
    band(ctx, c.secondary, [-0.3, 0.76], [0.6, 0.8], 0.03)
    band(ctx, c.secondary, [0.45, 0.6], [x1, 0.75], 0.04)
    band(ctx, c.primary, [0.5, 0.66], [x1, 0.8], 0.03)
  },
  // Inspired by a flag kit: a bold Y split in four colours.
  ysplit(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    // Lower half in the second colour.
    shape(ctx, c.secondary, [
      [x0, y0],
      [x1, y0],
      [x1, 0.9],
      [0.0, 0.94],
      [x0, 0.7],
    ])
    // The Y: arms from the rear top and bottom meet on the shroud and run to the nose.
    const fork: [number, number] = [0.0, 0.96]
    const arm = (w: number, fill: Fill) =>
      shape(ctx, fill, [
        [x0, 1.22 + w],
        [fork[0], fork[1] + w],
        [x1, 0.92 + w],
        [x1, 0.92 - w],
        [fork[0], fork[1] - w],
        [x0, 0.7 - w],
        [x0, 0.7 + w * 1.4],
        [fork[0] - w * 2.6, fork[1]],
        [x0, 1.22 - w * 1.4],
      ])
    arm(0.075, '#f4f4f2')
    arm(0.048, c.primary)
    // Dark wedge in the fork of the Y, edged in the accent colour.
    shape(ctx, c.accent, [
      [x0, 1.13],
      [fork[0] - 0.2, fork[1]],
      [x0, 0.79],
    ])
    shape(ctx, '#101010', [
      [x0, 1.09],
      [fork[0] - 0.28, fork[1]],
      [x0, 0.83],
    ])
  },
  // Inspired by an orange-to-purple chrome fade kit with black cut-outs.
  chrome(ctx, c) {
    ctx.fillStyle = c.base
    ctx.fillRect(x0, y0, WW, WH)
    // Soft diagonal light streaks sell the chrome.
    ctx.save()
    ctx.globalAlpha = 0.24
    band(ctx, '#ffffff', [-0.2, 0.5], [0.45, 1.5], 0.16)
    ctx.globalAlpha = 0.14
    band(ctx, '#ffffff', [0.05, 0.5], [0.7, 1.5], 0.05)
    ctx.restore()
    // Black angular cut-out low on the shroud.
    shape(ctx, c.primary, [
      [-0.24, 0.72],
      [0.62, 0.72],
      [0.62, 0.84],
      [0.2, 0.86],
      [0.46, 1.06],
      [0.32, 1.06],
      [-0.04, 0.84],
    ])
    // Black tip on the rear fender and the front fender.
    shape(ctx, c.primary, [
      [-0.9, 1.0],
      [-0.5, 1.12],
      [-0.58, 0.98],
    ])
    shape(ctx, c.primary, [
      [0.75, 0.66],
      [1.25, 0.7],
      [1.25, 0.58],
    ])
    // Teal accents.
    band(ctx, c.secondary, [0.02, 1.0], [0.4, 1.2], 0.028)
    band(ctx, c.secondary, [-0.85, 1.04], [-0.45, 1.09], 0.02)
    band(ctx, c.accent, [0.26, 0.9], [0.58, 0.9], 0.008)
  },

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

// `seen` (optional) marks where the plastics really show on a 3D model, so a
// box also avoids vents, holes and parts covered by something else.
export interface SeenArea {
  id: string
  at: (x: number, y: number) => boolean
}

const segPts = (seg: Seg[]) => seg.map((p) => (p.length === 5 ? [p[3], p[4]] : [p[1], p[2]]) as [number, number])

function inPoly(poly: [number, number][], x: number, y: number) {
  let wn = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[j]
    const [xj, yj] = poly[i]
    const c = (xj - xi) * (y - yi) - (x - xi) * (yj - yi)
    if (yi <= y) {
      if (yj > y && c > 0) wn++
    } else if (yj <= y && c < 0) wn--
  }
  return wn !== 0
}

// Tests for a box of the given width/height ratio centred at (cx, cy):
// inside any of the polygons (a panel cut in more than one piece counts as
// one area) and, on a 3D model, where the plastics show.
// Which polygons cover each cell of a grid over their bounds, worked out once
// so the many inside tests below are lookups (outlines have hundreds of points).
function polyGrid(polys: [number, number][][]) {
  const pts = polys.flat()
  const x0 = Math.min(...pts.map((p) => p[0]))
  const y0 = Math.min(...pts.map((p) => p[1]))
  const w = Math.max(...pts.map((p) => p[0])) - x0 || 1
  const h = Math.max(...pts.map((p) => p[1])) - y0 || 1
  const N = 220
  const nx = w >= h ? N : Math.max(8, Math.round((N * w) / h))
  const ny = w >= h ? Math.max(8, Math.round((N * h) / w)) : N
  const bits = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((i + 0.5) * w) / nx
      const y = y0 + ((j + 0.5) * h) / ny
      let m = 0
      polys.forEach((q, k) => {
        if (k < 8 && inPoly(q, x, y)) m |= 1 << k
      })
      bits[j * nx + i] = m
    }
  return (x: number, y: number) => {
    const i = Math.floor(((x - x0) / w) * nx)
    const j = Math.floor(((y - y0) / h) * ny)
    return i < 0 || j < 0 || i >= nx || j >= ny ? 0 : bits[j * nx + i]
  }
}

function boxFit(polys: [number, number][][], aspect: number, seen?: SeenArea) {
  const cover = polyGrid(polys)
  const inside = (x: number, y: number) => cover(x, y) !== 0
  const fits = (cx: number, cy: number, h: number) => {
    const w = h * aspect
    if (seen)
      for (let i = 0; i <= 8; i++)
        for (let j = 0; j <= 4; j++) if (!seen.at(cx - w / 2 + (w * i) / 8, cy - h / 2 + (h * j) / 4)) return false
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      for (const [x, y] of [
        [cx - w / 2 + w * t, cy - h / 2],
        [cx - w / 2 + w * t, cy + h / 2],
        [cx - w / 2, cy - h / 2 + h * t],
        [cx + w / 2, cy - h / 2 + h * t],
      ])
        if (!inside(x, y)) return false
    }
    return true
  }
  // The tallest box that fits at a centre (0 if none).
  const grow = (cx: number, cy: number, max: number, from = 0) => {
    if (!fits(cx, cy, from + 1e-4)) return from && fits(cx, cy, from) ? from : 0
    let lo = from
    let hi = max
    for (let k = 0; k < 12; k++) {
      const mid = (lo + hi) / 2
      if (fits(cx, cy, mid)) lo = mid
      else hi = mid
    }
    return lo
  }
  return { inside, fits, grow, cover }
}

const rectAt = (cx: number, cy: number, h: number, aspect: number): Rect => ({ x0: cx - (h * aspect) / 2, y0: cy - h / 2, x1: cx + (h * aspect) / 2, y1: cy + h / 2 })

// The largest rectangle of a given width/height ratio that fits inside a
// panel's real outline (not just its bounding box), so the race number never
// crosses a slanted edge. Cached: it only changes with the outline.
type Rect = { x0: number; y0: number; x1: number; y1: number }
const fitCache = new Map<string, Rect>()
const polysKey = (polys: [number, number][][]) => polys.map((q) => `${q.length}|${q[0]}|${q[q.length >> 1]}`).join('/')
function insideBox(panels: Seg[][], aspect: number, seen?: SeenArea): Rect {
  const b = anchorBox(panels)
  const polys = panels.map(segPts).filter((q) => q.length > 2)
  if (!polys.length) return b
  const key = `${aspect}|${polysKey(polys)}|${seen?.id ?? ''}`
  const hit = fitCache.get(key)
  if (hit) return hit
  const { inside, grow } = boxFit(polys, aspect, seen)
  let best = { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, h: 0 }
  const W = b.x1 - b.x0
  const H = b.y1 - b.y0
  for (let i = 1; i < 24; i++)
    for (let j = 1; j < 16; j++) {
      const cx = b.x0 + (W * i) / 24
      const cy = b.y0 + (H * j) / 16
      if (!inside(cx, cy) || (seen && !seen.at(cx, cy))) continue
      const h = grow(cx, cy, H, best.h)
      if (h > best.h) best = { cx, cy, h }
    }
  const out = best.h ? rectAt(best.cx, best.cy, best.h, aspect) : seen ? insideBox(panels, aspect) : b
  fitCache.set(key, out)
  return out
}

// A side plate cut in two (e.g. around the airbox): one number across both
// parts, half on each, so it reads complete and bigger once fitted. The
// biggest box that sits at least a third on each part; the usual box when the
// parts don't allow a good-sized one.
function splitBox(panels: Seg[][], aspect: number, seen?: SeenArea): Rect {
  const whole = insideBox(panels, aspect, seen)
  const polys = panels
    .map(segPts)
    .filter((q) => q.length > 2)
    .sort((p, q) => polyArea(q) - polyArea(p))
  if (polys.length < 2) return whole
  const key = `split|${aspect}|${polysKey(polys)}|${seen?.id ?? ''}`
  const hit = fitCache.get(key)
  if (hit) return hit
  const { inside, grow, cover } = boxFit(polys, aspect, seen)
  const b = anchorBox(panels)
  const W = b.x1 - b.x0
  const H = b.y1 - b.y0
  const share = (cx: number, cy: number, h: number) => {
    const w = h * aspect
    let a = 0
    let bb = 0
    let n = 0
    for (let i = 0; i <= 8; i++)
      for (let j = 0; j <= 4; j++) {
        const x = cx - w / 2 + (w * i) / 8
        const y = cy - h / 2 + (h * j) / 4
        n++
        const m = cover(x, y)
        if (m & 1) a++
        if (m & 2) bb++
      }
    return Math.min(a, bb) / n
  }
  let best = { cx: 0, cy: 0, h: 0 }
  for (let i = 1; i < 32; i++)
    for (let j = 1; j < 20; j++) {
      const cx = b.x0 + (W * i) / 32
      const cy = b.y0 + (H * j) / 20
      if (!inside(cx, cy) || (seen && !seen.at(cx, cy))) continue
      // Shrink until the box is shared fairly between the parts.
      for (let h = grow(cx, cy, H); h > Math.max(best.h, H * 0.05); h *= 0.85) {
        if (share(cx, cy, h) >= 0.33) {
          best = { cx, cy, h }
          break
        }
      }
    }
  const out = best.h >= (whole.y1 - whole.y0) * 0.55 ? rectAt(best.cx, best.cy, best.h, aspect) : whole
  fitCache.set(key, out)
  return out
}

const polyArea = (q: [number, number][]) => Math.abs(q.reduce((a, [x, y], i) => a + x * q[(i + 1) % q.length][1] - q[(i + 1) % q.length][0] * y, 0)) / 2

// Where the race number goes: centred in the biggest box inside the side
// plate (on that side of the bike: the two sides can be cut differently).
function numberBox(panels: PanelSet, seen?: SeenArea, side: Side = 'right') {
  const plates = side === 'left' && panels.sidePlateLeft?.length ? panels.sidePlateLeft : panels.sidePlate
  const b = plates.length > 1 ? splitBox(plates, 1.2, seen) : insideBox(plates, 1.2, seen)
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: w * 1.05, h: h * 1.05 }
}

// The number, name and make lettering as text layers on their panels (ids
// "__number", "__name", "__make"), so they can be moved and resized like any
// text. Placed automatically (inside the plates and shrouds, on the parts that
// show) until the customer moves them; then the same on both sides.
// Each side of the bike has its own, so they can be adjusted independently.
export const riderId = (k: RiderText, side: Side = 'right') => `__${k}${side === 'left' ? ':left' : ''}`
export const riderKeyOf = (id: string | null): RiderText | null => (id && /^__(number|name|make)(:left)?$/.test(id) ? (id.slice(2).replace(':left', '') as RiderText) : null)
export const riderSideOf = (id: string): Side => (id.endsWith(':left') ? 'left' : 'right')
// The key in `rider.place` for a lettering layer id.
export const riderPlaceOf = (id: string) => id.slice(2) as RiderPlace

export function riderLayers(cfg: KitConfig, panels: PanelSet, side: Side = 'right', seen?: SeenArea): Layer[] {
  const out: Layer[] = []
  const T = shroudText(panels, seen)
  const add = (key: RiderText, panel: 'sidePlate' | 'shroud', text: string, font: FontId, fill: string, outline: string | undefined, auto: (s: Side) => { x: number; y: number; w: number; h: number }) => {
    if (!text) return
    const b = anchorBox(panels[panel])
    const pw = b.x1 - b.x0 || 1
    const ph = b.y1 - b.y0 || 1
    const base: Layer = { id: riderId(key, side), kind: 'text', panel, text, font, fill, outline, x: 0.5, y: 0.5, size: 0.2, rotation: 0, opacity: 1 }
    // The automatic spot: the text fitted inside the box for that side.
    const spot = (s: Side) => {
      const a = auto(s)
      const h = Math.min(a.h, a.w / layerAspect(base))
      return { x: (a.x - b.x0) / pw, y: (a.y - b.y0) / ph, size: h / ph }
    }
    const at = cfg.rider.place?.[riderPlaceOf(base.id)]
    out.push({ ...base, ...(at ?? spot(side)) })
  }
  const r = cfg.rider
  add('number', 'sidePlate', r.number, r.font, r.numberColor, outlineFor(r.numberColor) === '#101010' ? '#101010' : undefined, (s) => numberBox(panels, seen, s))
  add('name', 'shroud', r.name.toUpperCase(), r.font, r.nameColor, outlineFor(r.nameColor), () => T.name)
  if (cfg.makeLettering) add('make', 'shroud', makeInfo(bikeById(cfg.bikeId).make).make.toUpperCase(), 'italic', cfg.colors.accent, outlineFor(cfg.colors.accent), () => T.make)
  return out
}

// The angle (template units, y down, radians) that keeps text level on the
// bike on a template piece: the bike's forward direction as it reads from
// that side, mapped onto the piece. `toWorld` maps the piece to the bike.
export function levelAngle(toWorld: M6, side: Side) {
  const inv = invertM6(toWorld)
  const s = side === 'left' ? -1 : 1
  return Math.atan2(inv[1] * s, inv[0] * s)
}

// Draws a main-panel text layer on one template piece where it sits on the
// bike: level on the bike, but never stretched or skewed by the piece's fit
// to the bike. `base` maps template units to the context.
export function drawUpright(ctx: CanvasRenderingContext2D, l: Layer, panels: PanelSet, toWorld: M6, base: M6, side: Side) {
  const f = layerFrame(l, panels)
  const [tx, ty] = applyM6(invertM6(toWorld), [f.cx, f.cy])
  const k = Math.sqrt(Math.abs(toWorld[0] * toWorld[3] - toWorld[1] * toWorld[2])) || 1
  ctx.save()
  ctx.globalAlpha = l.opacity
  ctx.setTransform(base[0], base[1], base[2], base[3], base[4], base[5])
  ctx.translate(tx, ty)
  ctx.rotate(levelAngle(toWorld, side) - (l.rotation * Math.PI) / 180)
  flatBody(ctx, l, f.h / k)
  ctx.restore()
}

// Name and make lettering share the biggest wide box inside the shroud (make
// on top), and the tag sits inside the rear fender, so none of it runs off a
// panel edge or onto the seat or tank on a real model.
function shroudText(panels: PanelSet, seen?: SeenArea) {
  const b = insideBox(panels.shroud, 2.4, seen)
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const x = (b.x0 + b.x1) / 2
  return { make: { x, y: b.y0 + h * 0.66, w: w * 0.96, h: h * 0.56 }, name: { x, y: b.y0 + h * 0.17, w: w * 0.8, h: h * 0.28 } }
}

function tagBox(panels: PanelSet, seen?: SeenArea) {
  const b = insideBox(panels.rearFender, 7, seen)
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, w: (b.x1 - b.x0) * 0.9, h: (b.y1 - b.y0) * 0.8 }
}

function place(p: Placement, panels: PanelSet) {
  const b = anchorBox(panels[p.panel])
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  return { x: b.x0 + p.rx * w, y: b.y0 + p.ry * h, w: p.rw * w, h: p.rh * h }
}

// Options: `lettering: false` paints the design only; `art: false` only the
// lettering and layers (on a transparent sheet, to go over a solid-coloured
// piece); `pieces: true` leaves part colours and the plate background to the
// caller, which fills each template piece itself so a colour never spills
// onto a neighbouring piece.
export function paintSheet(
  canvas: HTMLCanvasElement,
  cfg: KitConfig,
  side: Side,
  panels: PanelSet = panelsFor(cfg),
  {
    lettering = true,
    art = true,
    pieces = false,
    layers = 'all',
    text = true,
    seen,
  }: { lettering?: boolean; art?: boolean; pieces?: boolean; layers?: 'all' | 'none' | LayerPanel; text?: boolean; seen?: SeenArea } = {},
) {
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')!

  ctx.save()
  worldTransform(ctx, side, W, H)
  const sheetBox = { x: x0, y: y0, w: WW, h: WH }
  const c = cfg.colors
  const fills = { base: paintStyle(ctx, c.base, sheetBox), primary: paintStyle(ctx, c.primary, sheetBox), secondary: paintStyle(ctx, c.secondary, sheetBox), accent: paintStyle(ctx, c.accent, sheetBox) }
  if (art) {
    PATTERNS[cfg.designId](ctx, fills)
    // Main panels with their own colour are filled with it completely.
    if (!pieces)
      for (const role of ['shroud', 'rearFender', 'frontFender'] as const) {
        const base = cfg.partColors?.[role]
        if (!base) continue
        ctx.beginPath()
        for (const seg of panels[role]) {
          tracePath(ctx, seg)
          ctx.closePath()
        }
        ctx.fillStyle = paintStyle(ctx, base, anchorBoxOf(panels[role]))
        ctx.fill()
      }
    // Customer photos used as the whole background go straight over the pattern.
    for (const l of cfg.layers) if (l.kind === 'image' && l.cover) drawCover(ctx, l, W, H)
    worldTransform(ctx, side, W, H)
  }
  if (!lettering) {
    ctx.restore()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return
  }

  // Solid number background on the side plate.
  const blank = cfg.designId === 'blank'
  if (!pieces) {
    ctx.fillStyle = paintStyle(ctx, cfg.rider.plateColor, anchorBoxOf(panels.sidePlate))
    ctx.strokeStyle = fills.accent
    ctx.lineWidth = 0.012
    for (const seg of panels.sidePlate) {
      ctx.beginPath()
      tracePath(ctx, seg)
      ctx.closePath()
      ctx.fill()
      if (!blank) ctx.stroke()
    }
  }
  ctx.restore()

  // Layers on a single template piece are drawn with that piece instead.
  // `layers` can limit this to one panel (plus whole-kit layers), so a
  // renderer can keep a panel's layers on that panel's pieces only.
  const wanted = (l: Layer) => layers === 'all' || (layers !== 'none' && (l.panel === layers || l.panel === 'kit'))
  for (const l of cfg.layers) if (!(l.kind === 'image' && l.cover) && pieceIdOf(l.panel) === null && wanted(l)) drawLayer(ctx, l, panels, side, W, H)
  if (!text) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return
  }

  // Number, name and make: with template pieces they are drawn upright on
  // each piece (drawUpright), so they never come out skewed.
  if (!pieces) for (const l of riderLayers(cfg, panels, side, seen)) drawLayer(ctx, l, panels, side, W, H)
  if (!blank) drawText(ctx, 'CACTUS DECAL LAB', tagBox(panels, seen), side, W, H, (px) => `700 ${px}px "Saira"`, outlineFor(cfg.colors.base) === '#101010' ? '#101010' : '#f4f4f2')

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

// `on` describes the plate on a 3D model: the square canvas is stretched over
// a `w`×`h` area there, so text is pre-squeezed to read undistorted, and
// `number` is the band (fractions from the top) clear of e.g. a headlight.
// The solid colour a template piece is filled with, if any: side plates take
// the plate background, other parts their own colour once the customer set
// one (`key` is the panel the piece belongs to).
export const pieceFill = (cfg: KitConfig, piece: TemplatePiece, key: LayerPanel): Paint | undefined =>
  piece.role === 'sidePlate' ? cfg.rider.plateColor : piece.role === 'frontPlate' ? undefined : cfg.partColors?.[key]

// Fills a piece (template units, through `base`) with a solid colour; side
// plates also get the design's accent edge.
export function fillPieceSolid(ctx: CanvasRenderingContext2D, cfg: KitConfig, piece: TemplatePiece, paint: Paint, base: M6) {
  ctx.save()
  ctx.setTransform(base[0], base[1], base[2], base[3], base[4], base[5])
  ctx.beginPath()
  piece.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fillStyle = paintStyle(ctx, paint, piece.bbox)
  ctx.fill()
  if (piece.role === 'sidePlate' && cfg.designId !== 'blank') {
    ctx.clip()
    ctx.strokeStyle = paintStyle(ctx, cfg.colors.accent, piece.bbox)
    ctx.lineWidth = Math.min(piece.bbox.w, piece.bbox.h) * 0.035
    ctx.stroke()
  }
  ctx.restore()
}

export const frontPlateColor = (cfg: KitConfig) => cfg.rider.frontPlateColor ?? cfg.rider.plateColor

export function paintFrontPlate(canvas: HTMLCanvasElement, cfg: KitConfig, on?: { w: number; h: number; number?: [number, number] }) {
  const S = canvas.width
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const all = { x: 0, y: 0, w: S, h: S }
  const [top, bottom] = on?.number ?? [0.34, 0.72]
  const sx = on ? on.h / on.w : 1
  ctx.fillStyle = paintStyle(ctx, frontPlateColor(cfg), all)
  ctx.fillRect(0, 0, S, S)
  // Only the middle band (14%–86%) lands on the plate, see Bike.tsx.
  const band = Math.min(0.25, top - 0.09)
  if (cfg.designId !== 'blank' && band > 0.05) {
    ctx.fillStyle = paintStyle(ctx, cfg.colors.primary, all)
    ctx.fillRect(0, 0, S, S * band)
    ctx.fillStyle = paintStyle(ctx, cfg.colors.accent, all)
    ctx.fillRect(0, S * band, S, S * 0.03)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const text = (t: string, font: (px: number) => string, maxW: number, maxH: number, y: number) => {
    ctx.save()
    ctx.translate(S / 2, y)
    ctx.scale(sx, 1)
    fitText(ctx, t, font, maxW / sx, maxH)
    ctx.fillText(t, 0, 0)
    ctx.restore()
  }
  ctx.fillStyle = paintStyle(ctx, cfg.rider.numberColor, { x: S * 0.19, y: S * top, w: S * 0.62, h: S * (bottom - top) })
  text(cfg.rider.number, fontById(cfg.rider.font).css, S * 0.62, S * (bottom - top), S * (top + bottom) / 2)
  if (bottom < 0.74) text(cfg.rider.name.toUpperCase(), FONTS.italic.css, S * 0.5, S * 0.08, S * 0.78)
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
type MainPanel = 'shroud' | 'sidePlate' | 'rearFender' | 'frontFender'


// Where a layer sits in world units: its centre and its height.
export function layerFrame(l: Layer, panels: PanelSet) {
  const b = l.panel === 'kit' || pieceIdOf(l.panel) !== null ? KIT_BOX : anchorBox(panels[l.panel as MainPanel])
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  return { cx: b.x0 + l.x * w, cy: b.y0 + l.y * h, h: l.size * h, panel: { x: b.x0, y: b.y0, w, h } }
}

let measureCtx: CanvasRenderingContext2D | null = null

// A layer's centre and size in world units, matching how it is drawn (used
// for selection boxes and dragging in the designer).
export function layerBox(l: Layer, panels: PanelSet) {
  const f = layerFrame(l, panels)
  return { cx: f.cx, cy: f.cy, w: f.h * layerAspect(l), h: f.h, panel: f.panel }
}

// Width / height of a layer as drawn.
export function layerAspect(l: Layer) {
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
  return aspect
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

// A shape layer at the origin, in units of its height (y up).
function shapeBody(ctx: CanvasRenderingContext2D, l: Layer) {
  const s = SHAPES[l.shape!]
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
}

// A text or image layer centred on the origin, `hp` tall (y down).
function flatBody(ctx: CanvasRenderingContext2D, l: Layer, hp: number) {
  if (l.kind === 'text' && l.text) {
    ctx.font = fontById(l.font).css(hp)
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

export function drawLayer(ctx: CanvasRenderingContext2D, l: Layer, panels: PanelSet, side: Side, W: number, H: number) {
  const f = layerFrame(l, panels)
  ctx.save()
  ctx.globalAlpha = l.opacity
  if (l.kind === 'shape' && l.shape) {
    // Shapes live in world space, so the left side mirrors like the pattern.
    worldTransform(ctx, side, W, H)
    ctx.translate(f.cx, f.cy)
    ctx.rotate((l.rotation * Math.PI) / 180)
    ctx.scale(f.h, f.h)
    shapeBody(ctx, l)
  } else {
    // Text and images stay readable on both sides: drawn unmirrored, with
    // the rotation flipped on the left so the layout still mirrors.
    const { px, py, scale } = toPx(f.cx, f.cy, side, W, H)
    ctx.setTransform(1, 0, 0, 1, px, py)
    ctx.rotate(((side === 'right' ? -1 : 1) * l.rotation * Math.PI) / 180)
    flatBody(ctx, l, f.h * scale)
  }
  ctx.restore()
}

type M6 = [number, number, number, number, number, number]

// Where a layer sits on its own template piece (piece panels), in template
// units (y down): x, y are 0–1 across the piece, size is relative to the
// piece's smaller side.
export function pieceFrame(l: Layer, bbox: { x: number; y: number; w: number; h: number }) {
  return { cx: bbox.x + l.x * bbox.w, cy: bbox.y + (1 - l.y) * bbox.h, h: l.size * Math.min(bbox.w, bbox.h) }
}

// Draws a piece-panel layer. `base` maps template units to the context.
// `mirror` draws it on the matching piece from the other side of the bike:
// the layout and shapes mirror, text and photos stay readable.
export function drawPieceLayer(ctx: CanvasRenderingContext2D, l: Layer, bbox: { x: number; y: number; w: number; h: number }, base: M6, mirror = false) {
  const f = pieceFrame(mirror ? { ...l, x: 1 - l.x } : l, bbox)
  const k = mirror ? -1 : 1
  ctx.save()
  ctx.globalAlpha = l.opacity
  ctx.setTransform(base[0], base[1], base[2], base[3], base[4], base[5])
  ctx.translate(f.cx, f.cy)
  ctx.rotate((-k * l.rotation * Math.PI) / 180)
  if (l.kind === 'shape' && l.shape) {
    ctx.scale(k * f.h, -f.h)
    shapeBody(ctx, l)
  } else flatBody(ctx, l, f.h)
  ctx.restore()
}

// For real 3D models: the kit artwork with everything outside the printed
// pieces made transparent, so it can be projected onto the model.
export function paintDecalSheet(canvas: HTMLCanvasElement, cfg: KitConfig, side: Side, outlines: [number, number][][], panels: PanelSet = panelsFor(cfg), seen?: SeenArea) {
  // The design only: lettering and layers are added piece by piece.
  paintSheet(canvas, cfg, side, panels, { pieces: true, lettering: false, seen })
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
