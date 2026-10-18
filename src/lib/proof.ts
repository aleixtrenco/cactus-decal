// Flat 2D "print proof" of the kit: the bike silhouette with every decal
// panel clipped from the same graphics sheet the 3D preview uses. Also used
// for the design thumbnails on the home page.

import type { KitConfig } from '../store/config'
import { plasticsHex } from '../store/config'
import { paintSheet, WORLD, type Side } from './graphics'
import { FRONT_WHEEL, REAR_WHEEL, tracePath, type Seg } from './shapes'
import { panelsFor } from './templates'

const sheetCache = new Map<string, HTMLCanvasElement>()

function sheetFor(cfg: KitConfig, side: Side, width: number) {
  const key = `${side}:${width}`
  let c = sheetCache.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = width
    c.height = width / 2
    sheetCache.set(key, c)
  }
  paintSheet(c, cfg, side)
  return c
}

export function drawProof(canvas: HTMLCanvasElement, cfg: KitConfig, side: Side, opts: { bg?: string } = {}) {
  const W = canvas.width
  const H = canvas.height
  const ctx = canvas.getContext('2d')!
  const panelsSet = panelsFor(cfg)
  const sheet = sheetFor(cfg, side, W)

  // Fit the world width to the canvas and stand the tyres on the bottom edge.
  // The sheet only covers y >= WORLD.y0, which is fine: no decals sit lower.
  const scale = W / (WORLD.x1 - WORLD.x0)
  const top = H / scale - 0.02
  const offY = (top - WORLD.y1) * scale
  const world = () => {
    if (side === 'right') ctx.setTransform(scale, 0, 0, -scale, -WORLD.x0 * scale, top * scale)
    else ctx.setTransform(-scale, 0, 0, -scale, WORLD.x1 * scale, top * scale)
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, W, H)
  if (opts.bg) {
    ctx.fillStyle = opts.bg
    ctx.fillRect(0, 0, W, H)
  }

  world()
  const lw = 1 / scale
  // Wheels and chassis silhouette.
  for (const w of [REAR_WHEEL, FRONT_WHEEL]) {
    ctx.beginPath()
    ctx.arc(w.x, w.y, 0.37, 0, Math.PI * 2)
    ctx.fillStyle = '#161616'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(w.x, w.y, 0.285, 0, Math.PI * 2)
    ctx.fillStyle = '#2a2a2a'
    ctx.fill()
    ctx.strokeStyle = '#555'
    ctx.lineWidth = lw
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(w.x, w.y)
      ctx.lineTo(w.x + Math.cos(a) * 0.28, w.y + Math.sin(a) * 0.28)
      ctx.stroke()
    }
  }
  ctx.strokeStyle = '#3a3a3a'
  ctx.lineCap = 'round'
  ctx.lineWidth = 0.05
  ctx.beginPath()
  ctx.moveTo(0.42, 1.16)
  ctx.lineTo(FRONT_WHEEL.x, FRONT_WHEEL.y)
  ctx.moveTo(0.3, 1.22)
  ctx.lineTo(0.42, 1.18)
  ctx.moveTo(-0.1, 0.55)
  ctx.lineTo(REAR_WHEEL.x, REAR_WHEEL.y)
  ctx.stroke()
  ctx.fillStyle = '#262626'
  ctx.fillRect(-0.23, 0.35, 0.46, 0.36)
  ctx.fillStyle = cfg.extras.includes('seat') ? cfg.colors.primary : '#141414'
  ctx.beginPath()
  ctx.moveTo(0.14, 1.02)
  ctx.quadraticCurveTo(0.1, 1.09, 0, 1.08)
  ctx.lineTo(-0.88, 1.04)
  ctx.lineTo(-0.86, 1.0)
  ctx.closePath()
  ctx.fill()

  const full = cfg.kit === 'full'
  const panels: [Seg[], boolean][] = [
    ...panelsSet.other.map((s) => [s, full] as [Seg[], boolean]),
    ...panelsSet.rearFender.map((s) => [s, full] as [Seg[], boolean]),
    ...panelsSet.frontFender.map((s) => [s, full] as [Seg[], boolean]),
    ...panelsSet.shroud.map((s) => [s, cfg.kit !== 'plates'] as [Seg[], boolean]),
    ...panelsSet.sidePlate.map((s) => [s, true] as [Seg[], boolean]),
  ]
  for (const [segs, printed] of panels) {
    ctx.save()
    world()
    ctx.beginPath()
    tracePath(ctx, segs)
    ctx.closePath()
    if (printed) {
      ctx.clip()
      ctx.setTransform(1, 0, 0, 1, 0, offY)
      ctx.drawImage(sheet, 0, 0, W, W / 2)
    } else {
      ctx.fillStyle = plasticsHex(cfg)
      ctx.fill()
    }
    ctx.restore()
    world()
    ctx.beginPath()
    tracePath(ctx, segs)
    ctx.closePath()
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth = 2 * lw
    ctx.stroke()
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
