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
  swoosh: {
    label: 'Swoosh',
    aspect: 3,
    draw: (p) => {
      // A curved blade, thick at the front (+x) and tapering back.
      p.moveTo(1.5, 0.15)
      p.quadraticCurveTo(0.2, 0.75, -1.5, 0.1)
      p.quadraticCurveTo(0.1, 0.3, 1.2, -0.5)
      p.quadraticCurveTo(1.45, -0.2, 1.5, 0.15)
      p.closePath()
    },
  },
  claw: {
    label: 'Claw marks',
    aspect: 1.2,
    draw: (p) => {
      for (const dx of [-0.36, -0.06, 0.24]) {
        p.moveTo(dx + 0.18, 0.5)
        p.quadraticCurveTo(dx + 0.12, 0, dx - 0.18, -0.5)
        p.quadraticCurveTo(dx + 0.03, -0.02, dx + 0.1, 0.5)
        p.closePath()
      }
    },
  },
  speed: {
    label: 'Speed lines',
    aspect: 3,
    draw: (p) => {
      // Lines tapering to points at the back (-x).
      for (const [y, h, x] of [
        [0.32, 0.16, -1.5],
        [0, 0.2, -1.1],
        [-0.32, 0.16, -1.4],
      ])
        poly(p, [
          [1.5, y + h / 2],
          [1.5, y - h / 2],
          [x, y],
        ])
    },
  },
  arrow: {
    label: 'Arrow',
    aspect: 2,
    draw: (p) =>
      poly(p, [
        [-1, 0.18],
        [0.35, 0.18],
        [0.35, 0.5],
        [1, 0],
        [0.35, -0.5],
        [0.35, -0.18],
        [-1, -0.18],
      ]),
  },
  diamond: { label: 'Diamond', aspect: 0.7, draw: (p) => poly(p, [[0, 0.5], [0.35, 0], [0, -0.5], [-0.35, 0]]) },
  hexagon: {
    label: 'Hexagon',
    aspect: 1.15,
    draw: (p) => poly(p, Array.from({ length: 6 }, (_, i): [number, number] => [Math.cos((i * Math.PI) / 3) * 0.577, Math.sin((i * Math.PI) / 3) * 0.577 * 0.866])),
  },
  wave: {
    label: 'Wave',
    aspect: 4,
    draw: (p) => {
      const top: [number, number][] = []
      const bot: [number, number][] = []
      for (let i = 0; i <= 40; i++) {
        const x = -2 + i * 0.1
        const y = Math.sin(x * Math.PI * 0.75) * 0.3
        top.push([x, y + 0.2])
        bot.push([x, y - 0.2])
      }
      poly(p, [...top, ...bot.reverse()])
    },
  },
  dots: {
    label: 'Halftone',
    aspect: 2,
    draw: (p) => {
      // Dots growing towards the front (+x).
      for (let i = 0; i < 10; i++)
        for (let j = 0; j < 5; j++) {
          const x = -0.9 + i * 0.2
          const y = -0.4 + j * 0.2
          const r = 0.02 + (i / 9) * 0.075
          p.moveTo(x + r, y)
          p.arc(x, y, r, 0, Math.PI * 2)
        }
    },
  },
  splat: {
    label: 'Splat',
    aspect: 1,
    draw: (p) => {
      // A paint splash: a lumpy blob with droplets.
      const n = 16
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2
        const r = (i % 2 ? 0.26 : 0.4) + 0.05 * Math.sin(i * 2.3)
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r
        if (i) p.quadraticCurveTo(Math.cos(a - Math.PI / n) * 0.3, Math.sin(a - Math.PI / n) * 0.3, x, y)
        else p.moveTo(x, y)
      }
      p.closePath()
      for (const [x, y, r] of [
        [0.45, 0.3, 0.05],
        [-0.42, -0.36, 0.04],
        [0.38, -0.42, 0.03],
      ]) {
        p.moveTo(x + r, y)
        p.arc(x, y, r, 0, Math.PI * 2)
      }
    },
  },
  shield: {
    label: 'Shield',
    aspect: 0.85,
    draw: (p) => {
      p.moveTo(-0.42, 0.5)
      p.lineTo(0.42, 0.5)
      p.lineTo(0.42, 0.05)
      p.quadraticCurveTo(0.4, -0.35, 0, -0.5)
      p.quadraticCurveTo(-0.4, -0.35, -0.42, 0.05)
      p.closePath()
    },
  },
}

export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[]
