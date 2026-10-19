import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { ensureAssets, layerBox, paintFrontPlate, paintSheet, sheetWidth, WORLD, type Side } from '../lib/graphics'
import { apply, builtInTemplate, invert, mul6, panelsFor, pieceToWorld, useTemplates, type M6, type Role, type TemplatePiece } from '../lib/templates'
import { platesOnly, useConfig, type Layer } from '../store/config'

// The main design surface: the model's real print template (the SVG cut
// file), every piece filled with its part of the design exactly as it will
// be printed. Shapes, text and photos can be dragged on any piece; the 3D
// bike follows.

type Pt = [number, number]
type View = 'both' | 'right' | 'left'

const LETTERED: Role[] = ['shroud', 'sidePlate', 'rearFender']
const PLATES: Role[] = ['frontPlate', 'sidePlate']
const MAIN: Role[] = ['shroud', 'sidePlate', 'rearFender', 'frontFender']
const GRAPHICS_STEP = 3

// Sheet pixel → world, for each side (inverse of the painter transform).
function sheetToWorld(side: Side, w: number): M6 {
  const k = (WORLD.x1 - WORLD.x0) / w
  return side === 'right' ? [k, 0, 0, -k, WORLD.x0, WORLD.y1] : [-k, 0, 0, -k, WORLD.x1, WORLD.y1]
}

function inside([x, y]: Pt, poly: Pt[]) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

const canvasOf = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })

// The four corners of a layer's box in world units.
function corners(b: { cx: number; cy: number; w: number; h: number }, rotation: number): Pt[] {
  const a = (rotation * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as Pt[]
  ).map(([u, v]) => {
    const x = (u * b.w) / 2
    const y = (v * b.h) / 2
    return [b.cx + x * c - y * s, b.cy + x * s + y * c]
  })
}

export default function TemplateDesigner({ interactive = true }: { interactive?: boolean }) {
  const { config, step, setStep, selected, select, updateLayer } = useConfig()
  const stored = useTemplates((s) => s.templates[config.bikeId])
  const template = useMemo(() => stored ?? builtInTemplate(config), [stored, config.bikeId]) // eslint-disable-line react-hooks/exhaustive-deps
  const exact = !!stored
  const wrap = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 700 ? 'right' : 'both'))
  const drag = useRef<{
    id: string
    piece: TemplatePiece
    dx: number
    dy: number
  } | null>(null)
  const plates = platesOnly(config)

  // Track the space available.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) =>
      setSize({
        w: Math.round(e.contentRect.width),
        h: Math.round(e.contentRect.height),
      }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Pieces that are printed for this order, and the ones shown for context.
  const pieces = useMemo(() => {
    const all = template.pieces.filter((p) => p.role !== 'ignore')
    const host = (p: TemplatePiece) => (p.parent !== undefined ? (all.find((q) => q.id === p.parent) ?? p) : p)
    const shown = all.filter((p) => view === 'both' || p.side === view)
    // Hosts first so layered pieces are drawn on top of them.
    shown.sort((a, b) => (a.parent === undefined ? 0 : 1) - (b.parent === undefined ? 0 : 1))
    return shown.map((p) => ({
      p,
      host: host(p),
      printed: !plates || PLATES.includes(host(p).role),
      toWorld: pieceToWorld(p, template.pieces),
    }))
  }, [template, view, plates])

  // Template units → CSS pixels, fitting the shown pieces.
  const fit = useMemo(() => {
    if (!pieces.length || !size.w || !size.h) return null
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const { p } of pieces) {
      x0 = Math.min(x0, p.bbox.x)
      y0 = Math.min(y0, p.bbox.y)
      x1 = Math.max(x1, p.bbox.x + p.bbox.w)
      y1 = Math.max(y1, p.bbox.y + p.bbox.h)
    }
    const padX = size.w * 0.04
    const padTop = interactive ? 76 : 8
    const padBottom = interactive ? 64 : 8
    const s = Math.min((size.w - padX * 2) / (x1 - x0), (size.h - padTop - padBottom) / (y1 - y0))
    const ox = (size.w - (x1 - x0) * s) / 2 - x0 * s
    const oy = padTop + (size.h - padTop - padBottom - (y1 - y0) * s) / 2 - y0 * s
    return { s, ox, oy, m: [s, 0, 0, s, ox, oy] as M6 }
  }, [pieces, size, interactive])

  // Paint the template.
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !fit) return
    let alive = true
    let frame = 0
    const SW = Math.min(sheetWidth(), 1536)
    const sheets = {
      right: canvasOf(SW, SW / 2),
      left: canvasOf(SW, SW / 2),
      rightPlain: canvasOf(SW, SW / 2),
      leftPlain: canvasOf(SW, SW / 2),
      plate: canvasOf(512, 512),
    }
    const draw = () => {
      if (!alive) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(size.w * dpr)
      canvas.height = Math.round(size.h * dpr)
      const panels = panelsFor(config)
      paintSheet(sheets.right, config, 'right', panels)
      paintSheet(sheets.left, config, 'left', panels)
      paintSheet(sheets.rightPlain, config, 'right', panels, {
        lettering: false,
      })
      paintSheet(sheets.leftPlain, config, 'left', panels, {
        lettering: false,
      })
      paintFrontPlate(sheets.plate, config)

      const ctx = canvas.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const V = fit.m.map((v) => v * dpr) as M6
      const setM = (m: M6) => ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
      const path = (p: TemplatePiece) => {
        ctx.beginPath()
        p.outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.closePath()
      }

      for (const { p, host, printed, toWorld } of pieces) {
        ctx.save()
        setM(V)
        path(p)
        if (!printed) {
          // Not part of this order: shown faintly for context.
          ctx.fillStyle = 'rgba(242, 240, 232, 0.05)'
          ctx.fill()
          ctx.restore()
          continue
        }
        ctx.clip()
        if (p.role === 'frontPlate') {
          const S = 512
          const k = Math.min(p.bbox.w, p.bbox.h * 1.1) / (S * 0.82)
          setM(mul6(V, [k, 0, 0, k, p.bbox.x + p.bbox.w / 2 - (S / 2) * k, p.bbox.y + p.bbox.h / 2 - (S / 2) * k]))
          ctx.drawImage(sheets.plate, 0, 0)
        } else {
          const side: Side = p.side === 'left' ? 'left' : 'right'
          const lettered = LETTERED.includes(host.role)
          const sheet = side === 'right' ? (lettered ? sheets.right : sheets.rightPlain) : lettered ? sheets.left : sheets.leftPlain
          setM(mul6(mul6(V, invert(toWorld)), sheetToWorld(side, SW)))
          ctx.drawImage(sheet, 0, 0)
        }
        ctx.restore()
      }
      // Cut lines on top.
      ctx.save()
      setM(V)
      ctx.lineJoin = 'round'
      ctx.lineWidth = 1.2 / fit.s
      for (const { p, printed } of pieces) {
        path(p)
        ctx.strokeStyle = printed ? 'rgba(242, 240, 232, 0.55)' : 'rgba(242, 240, 232, 0.18)'
        ctx.setLineDash(printed ? [] : [4 / fit.s, 4 / fit.s])
        ctx.stroke()
      }
      ctx.restore()
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    schedule()
    ensureAssets(config).then(schedule)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [config, pieces, fit, size])

  // --- Interaction -------------------------------------------------------

  const panels = panelsFor(config)
  const movable = config.layers.filter((l) => !(l.kind === 'image' && l.cover))

  const toTemplate = (e: RPointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect()
    return [(e.clientX - r.left - fit!.ox) / fit!.s, (e.clientY - r.top - fit!.oy) / fit!.s]
  }
  // The printed, non-plate piece under a template point (smallest first).
  const pieceAt = (t: Pt) => pieces.filter((x) => x.printed && x.p.role !== 'frontPlate' && inside(t, x.p.outline)).sort((a, b) => a.p.area - b.p.area)[0]

  const layerAt = (w: Pt): Layer | undefined =>
    [...movable].reverse().find((l) => {
      const b = layerBox(l, panels)
      const a = (-l.rotation * Math.PI) / 180
      const dx = w[0] - b.cx
      const dy = w[1] - b.cy
      const u = dx * Math.cos(a) - dy * Math.sin(a)
      const v = dx * Math.sin(a) + dy * Math.cos(a)
      const tol = 0.015
      return Math.abs(u) < b.w / 2 + tol && Math.abs(v) < b.h / 2 + tol
    })

  const down = (e: RPointerEvent) => {
    if (!fit) return
    const t = toTemplate(e)
    const hitPiece = pieceAt(t)
    if (!hitPiece) return select(null)
    const w = apply(hitPiece.toWorld, t)
    const l = layerAt(w)
    if (!l) return select(null)
    select(l.id)
    if (step !== GRAPHICS_STEP) setStep(GRAPHICS_STEP)
    const b = layerBox(l, panels)
    drag.current = {
      id: l.id,
      piece: hitPiece.p,
      dx: w[0] - b.cx,
      dy: w[1] - b.cy,
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d || !fit) {
      if (fit && ref.current) {
        const t = toTemplate(e)
        const hp = pieceAt(t)
        ref.current.style.cursor = hp && layerAt(apply(hp.toWorld, t)) ? 'move' : 'default'
      }
      return
    }
    const t = toTemplate(e)
    // Follow whichever piece the pointer is over; off the pieces, keep the
    // one the drag started on.
    const toWorld = pieceAt(t)?.toWorld ?? pieceToWorld(d.piece, template.pieces)
    const [wx, wy] = apply(toWorld, t)
    const l = config.layers.find((x) => x.id === d.id)
    if (!l) return
    const p = layerBox(l, panels).panel
    updateLayer(d.id, {
      x: +((wx - d.dx - p.x) / p.w).toFixed(3),
      y: +((wy - d.dy - p.y) / p.h).toFixed(3),
    })
  }
  const up = () => (drag.current = null)

  // Outline of the selected layer on every piece it lands on.
  const sel = movable.find((l) => l.id === selected)
  const selPolys = useMemo(() => {
    if (!sel || !fit) return []
    const b = layerBox(sel, panels)
    const world = corners(b, sel.rotation)
    const toCss = (pts: Pt[]) => pts.map(([x, y]) => `${(x * fit.s + fit.ox).toFixed(1)},${(y * fit.s + fit.oy).toFixed(1)}`).join(' ')
    // Only on the panel the layer belongs to (all main panels for whole-kit layers).
    const targets = pieces.filter(({ p, printed }) => printed && p.parent === undefined && (sel.panel === 'kit' ? MAIN.includes(p.role) : p.role === sel.panel))
    const on = targets.filter(({ p, toWorld }) => inside(apply(invert(toWorld), [b.cx, b.cy]), p.outline))
    // Dragged off its panel: still show it against that panel on each side.
    const shown = on.length ? on : targets.filter(({ p }, i) => targets.findIndex((x) => x.p.side === p.side) === i)
    const out = shown.map(({ toWorld }) => toCss(world.map((w) => apply(invert(toWorld), w))))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, fit, pieces, config])

  return (
    <div className={`designer${interactive ? '' : ' passive'}`} ref={wrap}>
      <canvas
        ref={ref}
        style={{ width: size.w, height: size.h }}
        role="img"
        aria-label={`Print template for your ${plates ? 'number plates' : 'kit'}. ${interactive ? 'Drag a shape, text or image to move it.' : ''}`}
        onPointerDown={interactive ? down : undefined}
        onPointerMove={interactive ? move : undefined}
        onPointerUp={up}
        onPointerCancel={up}
      />
      {interactive && selPolys.length > 0 && (
        <svg className="designer-sel" width={size.w} height={size.h} aria-hidden="true">
          {selPolys.map((pts, i) => (
            <polygon key={i} points={pts} />
          ))}
        </svg>
      )}
      {interactive && (
        <div className="designer-bar">
          <div className="seg" role="group" aria-label="Template view">
            {(
              [
                ['both', 'Both sides'],
                ['right', 'Right'],
                ['left', 'Left'],
              ] as [View, string][]
            ).map(([v, label]) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {label}
              </button>
            ))}
          </div>
          <small>
            {exact ? 'Your model’s print template' : 'Standard layout (no template for this model yet)'}
            {movable.length ? ' · drag to move' : ''}
          </small>
        </div>
      )}
    </div>
  )
}
