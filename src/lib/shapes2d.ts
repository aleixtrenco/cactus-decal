// Shapes customers can add to their kit. Each is drawn around (0, 0) with a
// height of 1 (y up), so a layer just scales, rotates and places it.
// Only moveTo/lineTo/quadraticCurveTo/arc/fillRect are used so the same
// drawing also works in the print-file recorder.

import type { ShapeId } from '../store/config'

interface Pen {
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number): void
  closePath(): void
  fill(): void
  stroke(): void
  fillRect(x: number, y: number, w: number, h: number): void
  fillStyle: unknown
}

const poly = (p: Pen, pts: [number, number][]) => {
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)))
  p.closePath()
}

export const SHAPES: Record<ShapeId, { label: string; aspect: number; draw: (p: Pen, second: unknown) => void }> = {
  stripe: { label: 'Stripe', aspect: 6, draw: (p) => poly(p, [[-3, -0.5], [3, -0.5], [3, 0.5], [-3, 0.5]]) },
  twin: {
    label: 'Twin stripe',
    aspect: 6,
    draw: (p) => {
      poly(p, [[-3, 0.1], [3, 0.1], [3, 0.5], [-3, 0.5]])
      poly(p, [[-3, -0.5], [3, -0.5], [3, -0.25], [-3, -0.25]])
    },
  },
  chevron: { label: 'Chevron', aspect: 1, draw: (p) => poly(p, [[-0.5, 0.5], [-0.1, 0.5], [0.5, 0], [-0.1, -0.5], [-0.5, -0.5], [0.1, 0]]) },
  slash: { label: 'Slash', aspect: 1.6, draw: (p) => poly(p, [[-0.3, -0.5], [0.1, -0.5], [0.8, 0.5], [0.4, 0.5]].map(([x, y]) => [x - 0.25, y]) as [number, number][]) },
  star: {
    label: 'Star',
    aspect: 1,
    draw: (p) => {
      const pts: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 ? 0.21 : 0.5
        pts.push([Math.cos(a) * r, Math.sin(a) * r])
      }
      poly(p, pts)
    },
  },
  circle: { label: 'Circle', aspect: 1, draw: (p) => p.arc(0, 0, 0.5, 0, Math.PI * 2) },
  triangle: { label: 'Triangle', aspect: 1.15, draw: (p) => poly(p, [[-0.577, -0.5], [0.577, -0.5], [0, 0.5]]) },
  flame: {
    label: 'Flames',
    aspect: 2.4,
    draw: (p) => {
      // Tongues trailing backwards (towards -x) from a rounded front.
      p.moveTo(1.2, -0.5)
      p.quadraticCurveTo(1.25, 0.3, 0.6, 0.45)
      p.quadraticCurveTo(0.2, 0.55, -0.2, 0.3)
      p.quadraticCurveTo(-0.6, 0.6, -1.2, 0.5)
      p.quadraticCurveTo(-0.7, 0.25, -0.5, 0.12)
      p.quadraticCurveTo(-0.9, 0.05, -1.2, -0.1)
      p.quadraticCurveTo(-0.6, -0.2, -0.35, -0.2)
      p.quadraticCurveTo(-0.7, -0.4, -0.9, -0.5)
      p.closePath()
    },
  },
  bolt: { label: 'Lightning', aspect: 0.6, draw: (p) => poly(p, [[0.05, 0.5], [-0.3, -0.02], [-0.02, -0.02], [-0.12, -0.5], [0.3, 0.06], [0.02, 0.06], [0.2, 0.5]]) },
  checker: {
    label: 'Checkered',
    aspect: 2,
    draw: (p, second) => {
      const fill = p.fillStyle
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 4; j++) {
          p.fillStyle = (i + j) % 2 ? fill : second
          p.fillRect(-1 + i * 0.25, -0.5 + j * 0.25, 0.25, 0.25)
        }
      p.fillStyle = fill
    },
  },
  cactus: {
    label: 'Cactus',
    aspect: 0.8,
    draw: (p) => {
      poly(p, [[-0.08, -0.5], [0.08, -0.5], [0.08, 0.42], [-0.08, 0.42]])
      p.moveTo(0.08, 0.42)
      p.arc(0, 0.42, 0.08, 0, Math.PI * 2)
      poly(p, [[-0.08, -0.05], [-0.25, -0.05], [-0.25, 0.22], [-0.33, 0.22], [-0.33, -0.12], [-0.08, -0.12]])
      p.moveTo(-0.25, 0.22)
      p.arc(-0.29, 0.22, 0.04, 0, Math.PI * 2)
      poly(p, [[0.08, 0.05], [0.25, 0.05], [0.25, 0.3], [0.33, 0.3], [0.33, -0.02], [0.08, -0.02]])
      p.moveTo(0.33, 0.3)
      p.arc(0.29, 0.3, 0.04, 0, Math.PI * 2)
    },
  },
}

export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[]
