// Ready-made colour areas for each part (bands, blocks, stripes, edge trim,
// a backing panel for the number, fender tips and checkers), so customers can
// build a kit by colouring areas instead of placing shapes one by one.
//
// Every area is made from the piece's own cut outline, laid out in the
// piece's frame on the bike (front and up, from its placement), and clipped
// to the piece. So the areas fit each model and brand exactly, on both sides,
// with nothing to align.

import type { KitConfig, Layer, LayerPanel } from '../store/config'
import { layerAspect, layerFrame, levelAngle, type Side } from './graphics'
import { paintStyle, type Paint } from './paint'
import { apply, invert, mul6, type M6, type PanelSet, type Role, type TemplatePiece } from './templates'

export type ZoneId = 'numberBack' | 'lowerBand' | 'topLine' | 'frontBlock' | 'rearBlock' | 'slash' | 'sideLines' | 'tip' | 'checker' | 'centreStripe' | 'topBand' | 'bottomBand' | 'edge'

export const ZONE_LABELS: Record<ZoneId, string> = {
  numberBack: 'Number backing',
  lowerBand: 'Lower band',
  topLine: 'Top line',
  frontBlock: 'Front block',
  rearBlock: 'Rear block',
  slash: 'Slash stripe',
  sideLines: 'Side lines',
  tip: 'Tip',
  checker: 'Checker band',
  centreStripe: 'Centre stripe',
  topBand: 'Top band',
  bottomBand: 'Bottom band',
  edge: 'Edge trim',
}

// The areas each part offers, bottom to top (edge trim last, on top).
const BY_ROLE: Record<Role, ZoneId[]> = {
  shroud: ['lowerBand', 'frontBlock', 'slash', 'topLine', 'edge'],
  sidePlate: ['rearBlock', 'lowerBand', 'numberBack', 'edge'],
  rearFender: ['tip', 'lowerBand', 'sideLines', 'edge'],
  frontFender: ['tip', 'checker', 'centreStripe', 'edge'],
  frontPlate: ['topBand', 'bottomBand', 'edge'],
  other: ['lowerBand', 'frontBlock', 'slash', 'edge'],
  ignore: [],
}

export const zonesFor = (role: Role): ZoneId[] => BY_ROLE[role] ?? []

// Areas the customer can nudge, turn and resize (edge trim follows the cut
// line and the number backing follows the number).
export const movableZone = (id: ZoneId) => id !== 'edge' && id !== 'numberBack'

// The customer's nudge for an area: x and y as a share of the piece's
// length and height, turn in degrees, size as a factor.
export interface ZoneAdjust {
  x: number
  y: number
  r: number
  s: number
}

// The unit frame moved, turned and resized as the customer set it. The turn
// is made in the piece's true proportions and on the bike's axes, so an area
// turns the same way on both sides of the bike.
function adjusted(F: M6, a: ZoneAdjust | undefined): M6 {
  if (!a || (!a.x && !a.y && !a.r && a.s === 1)) return F
  const lu = Math.hypot(F[0], F[1]) || 1
  const lv = Math.hypot(F[2], F[3]) || 1
  const O: M6 = [F[0] / lu, F[1] / lu, F[2] / lv, F[3] / lv, F[4], F[5]]
  const t = (a.r * Math.PI) / 180
  const c = Math.cos(t) * a.s
  const sn = Math.sin(t) * a.s
  // About the piece's centre, then shifted.
  const cx = lu / 2
  const cy = lv / 2
  const A: M6 = [c, sn, -sn, c, cx + a.x * lu - c * cx + sn * cy, cy + a.y * lv - sn * cx - c * cy]
  return mul6(mul6(O, A), [lu, 0, 0, lv, 0, 0])
}
export const zoneKey = (panel: LayerPanel, id: ZoneId) => `${panel}|${id}`

type Pt = [number, number]
const norm = ([x, y]: Pt): Pt => {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

// The piece's frame as a matrix from the unit square to template units:
// u from the back of the piece (0) to its front (1), v from bottom (0) to top
// (1) as it sits on the bike. Front fenders and centre pieces use the layout.
export function pieceUnitFrame(piece: TemplatePiece, toWorld: M6): M6 {
  let fwd: Pt
  let up: Pt
  if (piece.side === 'center') {
    // A front fender is laid out with its tip at the bottom; plates upright.
    fwd = piece.role === 'frontFender' ? [0, 1] : [1, 0]
    up = piece.role === 'frontFender' ? [1, 0] : [0, -1]
  } else {
    const inv = invert(toWorld)
    fwd = norm([inv[0], inv[1]])
    const u = [inv[2], inv[3]]
    const d = u[0] * fwd[0] + u[1] * fwd[1]
    up = norm([u[0] - d * fwd[0], u[1] - d * fwd[1]])
  }
  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  for (const [x, y] of piece.outline) {
    const a = x * fwd[0] + y * fwd[1]
    const b = x * up[0] + y * up[1]
    u0 = Math.min(u0, a)
    u1 = Math.max(u1, a)
    v0 = Math.min(v0, b)
    v1 = Math.max(v1, b)
  }
  return [fwd[0] * (u1 - u0), fwd[1] * (u1 - u0), up[0] * (v1 - v0), up[1] * (v1 - v0), fwd[0] * u0 + up[0] * v0, fwd[1] * u0 + up[1] * v0]
}

// Polygons in the unit frame.
const POLYS: Partial<Record<ZoneId, Pt[][]>> = {
  lowerBand: [[[0, 0], [1, 0], [1, 0.34], [0, 0.22]]],
  topLine: [[[0, 0.8], [1, 0.9], [1, 1], [0, 1]]],
  frontBlock: [[[0.74, 0], [1, 0], [1, 1], [0.62, 1]]],
  rearBlock: [[[0, 0], [0.24, 0], [0.34, 1], [0, 1]]],
  slash: [[[0.36, 0], [0.48, 0], [0.64, 1], [0.52, 1]]],
  sideLines: [
    [[0, 0.3], [1, 0.3], [1, 0.36], [0, 0.36]],
    [[0, 0.42], [1, 0.42], [1, 0.48], [0, 0.48]],
  ],
  centreStripe: [[[0, 0.4], [1, 0.4], [1, 0.6], [0, 0.6]]],
  topBand: [[[0, 0.8], [1, 0.8], [1, 1], [0, 1]]],
  bottomBand: [[[0, 0], [1, 0], [1, 0.18], [0, 0.18]]],
}

// The tip is the front of a front fender and the back end of everything else.
const tipPoly = (role: Role): Pt[] => (role === 'frontFender' ? [[0.8, 0], [1, 0], [1, 1], [0.8, 1]] : [[0, 0], [0.2, 0], [0.14, 1], [0, 1]])

// A rounded rectangle path (also works with the print file's recorder).
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// The number for this side, so its backing sits exactly behind it.
export interface NumberAt {
  layer: Layer
  panels: PanelSet
  side: Side
}

// Draws the customer's coloured areas of one piece, through `base`
// (template units → the context), kept inside the piece.
export function drawZones(ctx: CanvasRenderingContext2D, cfg: KitConfig, piece: TemplatePiece, key: LayerPanel, base: M6, toWorld: M6, number?: NumberAt) {
  const on = zonesFor(piece.role).filter((id) => cfg.zones?.[zoneKey(key, id)])
  if (!on.length) return
  const F = pieceUnitFrame(piece, toWorld)
  const span = Math.min(Math.hypot(F[0], F[1]), Math.hypot(F[2], F[3]))
  const setM = (m: M6) => ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
  ctx.save()
  setM(base)
  ctx.beginPath()
  piece.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.clip()
  for (const id of on) {
    const paint = cfg.zones![zoneKey(key, id)] as Paint
    const unit = mul6(base, adjusted(F, movableZone(id) ? cfg.zoneAdjust?.[zoneKey(key, id)] : undefined))
    ctx.save()
    if (id === 'edge') {
      setM(base)
      ctx.beginPath()
      piece.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.strokeStyle = paintStyle(ctx, paint, piece.bbox)
      // Half the line falls outside the piece and is clipped away.
      ctx.lineWidth = span * 0.09
      ctx.lineJoin = 'round'
      ctx.stroke()
    } else if (id === 'numberBack') {
      setM(base)
      ctx.fillStyle = paintStyle(ctx, paint, piece.bbox)
      ctx.beginPath()
      if (number) {
        // Behind the number wherever it has been moved or resized to.
        const f = layerFrame(number.layer, number.panels)
        const [tx, ty] = apply(invert(toWorld), [f.cx, f.cy])
        const k = Math.sqrt(Math.abs(toWorld[0] * toWorld[3] - toWorld[1] * toWorld[2])) || 1
        const w = ((f.h * layerAspect(number.layer)) / k) * 1.3
        const h = (f.h / k) * 1.22
        ctx.translate(tx, ty)
        ctx.rotate(levelAngle(toWorld, number.side) - (number.layer.rotation * Math.PI) / 180)
        rounded(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.16)
      } else {
        setM(unit)
        rounded(ctx, 0.14, 0.16, 0.72, 0.68, 0.08)
      }
      ctx.fill()
    } else if (id === 'checker') {
      setM(unit)
      ctx.fillStyle = paintStyle(ctx, paint, { x: 0, y: 0, w: 1, h: 1 })
      // Square checks across the fender, two rows deep.
      const rows = 8
      const cv = 1 / rows
      const cu = cv * (Math.hypot(F[2], F[3]) / (Math.hypot(F[0], F[1]) || 1))
      const u0 = 0.56
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < rows; c++) if ((r + c) % 2 === 0) ctx.fillRect(u0 + r * cu, c * cv, cu, cv)
    } else {
      setM(unit)
      ctx.fillStyle = paintStyle(ctx, paint, { x: 0, y: 0, w: 1, h: 1 })
      for (const poly of id === 'tip' ? [tipPoly(piece.role)] : (POLYS[id] ?? [])) {
        ctx.beginPath()
        poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.restore()
  }
  ctx.restore()
}
