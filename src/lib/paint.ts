// A "paint" is how every colour in a design is stored: either a plain hex
// colour ("#ff6a13") or a linear gradient ("lg(#ff6a13,#ffd200,90)", angle
// in degrees, 0 = left to right, 90 = bottom to top).

export type Paint = string

export type ParsedPaint = { kind: 'solid'; hex: string } | { kind: 'linear'; a: string; b: string; angle: number }

const HEX = /^#[0-9a-f]{6}$/i

export function parsePaint(p: Paint): ParsedPaint {
  const m = /^lg\((#[0-9a-f]{6}),(#[0-9a-f]{6}),(-?\d+(?:\.\d+)?)\)$/i.exec(p)
  if (m) return { kind: 'linear', a: m[1], b: m[2], angle: +m[3] }
  return { kind: 'solid', hex: HEX.test(p) ? p : '#101010' }
}

export const gradient = (a: string, b: string, angle: number): Paint => `lg(${a},${b},${Math.round(angle)})`
export const isGradient = (p: Paint) => parsePaint(p).kind === 'linear'

// The colours a paint uses (for neon checks, contrast and labels).
export function paintColors(p: Paint): string[] {
  const q = parsePaint(p)
  return q.kind === 'solid' ? [q.hex] : [q.a, q.b]
}
export const firstColor = (p: Paint) => paintColors(p)[0]

export const validHex = (s: string) => HEX.test(s)

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface GradientMaker {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient
}

// A fillStyle for this paint spanning `box` (in the context's current
// coordinates).
export function paintStyle(ctx: GradientMaker, p: Paint, box: Box): string | CanvasGradient {
  const q = parsePaint(p)
  if (q.kind === 'solid') return q.hex
  const a = (q.angle * Math.PI) / 180
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  // Half-length that reaches the box corners along the gradient direction.
  const r = (Math.abs(Math.cos(a)) * box.w + Math.abs(Math.sin(a)) * box.h) / 2
  const dx = Math.cos(a) * r
  const dy = Math.sin(a) * r
  const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
  g.addColorStop(0, q.a)
  g.addColorStop(1, q.b)
  return g
}

// CSS background for previews of a paint.
export function paintCss(p: Paint) {
  const q = parsePaint(p)
  return q.kind === 'solid' ? q.hex : `linear-gradient(${90 - q.angle}deg, ${q.a}, ${q.b})`
}
