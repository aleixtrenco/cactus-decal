// Side-profile outlines of the decal panels, in world units (metres-ish).
// The bike faces +x, the ground is y = 0. The same outlines build the 3D
// panels and clip the 2D proof, so both always match.

export type Seg = ['M' | 'L', number, number] | ['Q', number, number, number, number]

interface PathTarget {
  moveTo(x: number, y: number): unknown
  lineTo(x: number, y: number): unknown
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): unknown
}

export function tracePath(t: PathTarget, segs: Seg[]) {
  for (const s of segs) {
    if (s.length === 5) t.quadraticCurveTo(s[1], s[2], s[3], s[4])
    else if (s[0] === 'M') t.moveTo(s[1], s[2])
    else t.lineTo(s[1], s[2])
  }
}

export const REAR_WHEEL = { x: -0.74, y: 0.36 }
export const FRONT_WHEEL = { x: 0.8, y: 0.36 }
export const WHEEL_R = 0.36

export const shroud = (lift = 0): Seg[] => [
  ['M', 0.38, 1.04 + lift],
  ['L', 0.06, 1.07 + lift],
  ['Q', -0.04, 1.02 + lift, -0.02, 0.94],
  ['L', 0.06, 0.8],
  ['Q', 0.14, 0.66, 0.3, 0.62],
  ['L', 0.4, 0.64],
  ['Q', 0.48, 0.74, 0.46, 0.88],
  ['L', 0.38, 1.04 + lift],
]

export const sidePlate = (rise = 0): Seg[] => [
  ['M', -0.3, 0.99],
  ['L', -0.84, 1.0 + rise],
  ['Q', -0.87, 0.9, -0.8, 0.8],
  ['L', -0.66, 0.7],
  ['L', -0.36, 0.68],
  ['Q', -0.28, 0.74, -0.28, 0.86],
  ['L', -0.3, 0.99],
]

export const rearFender = (rise = 0): Seg[] => [
  ['M', -0.22, 1.0],
  ['L', -0.86, 1.03 + rise],
  ['L', -1.18, 1.12 + rise * 1.5],
  ['L', -1.2, 1.08 + rise * 1.5],
  ['Q', -1.0, 1.0 + rise, -0.86, 0.965 + rise],
  ['L', -0.3, 0.93],
  ['L', -0.22, 1.0],
]

export function frontFender(): Seg[] {
  const { x, y } = FRONT_WHEEL
  const r0 = 0.405
  const r1 = 0.435
  const a0 = (18 * Math.PI) / 180
  const a1 = (150 * Math.PI) / 180
  const n = 14
  const segs: Seg[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    segs.push([i === 0 ? 'M' : 'L', x + Math.cos(a) * r1, y + Math.sin(a) * r1])
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n
    segs.push(['L', x + Math.cos(a) * r0, y + Math.sin(a) * r0])
  }
  segs.push(['L', x + Math.cos(a0) * r1, y + Math.sin(a0) * r1])
  return segs
}

// Front number plate, drawn in its own local space (width along x).
export const frontPlate: Seg[] = [
  ['M', -0.16, 0.14],
  ['L', 0.16, 0.14],
  ['Q', 0.19, 0.0, 0.12, -0.14],
  ['L', -0.12, -0.14],
  ['Q', -0.19, 0.0, -0.16, 0.14],
]
