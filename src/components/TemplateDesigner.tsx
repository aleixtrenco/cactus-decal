import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { drawPieceLayer, ensureAssets, fillPieceSolid, layerAspect, layerBox, paintFrontPlate, paintSheet, pieceFill, pieceFrame, sheetWidth, WORLD, type Side } from '../lib/graphics'
import { apply, builtInTemplate, invert, mul6, panelKey, panelPieces, panelsFor, pieceToWorld, useTemplates, type M6, type Role, type TemplatePiece } from '../lib/templates'
import { firstColor, paintCss } from '../lib/paint'
import { pieceIdOf, platesOnly, useConfig, type Layer, type LayerPanel } from '../store/config'
import { panelName } from '../lib/layers'
import Icon from './Icon'

// The main design surface: the model's real print template (the SVG cut
// file), every piece filled with its part of the design exactly as it will
// be printed. Shapes, text and photos can be dragged on any piece; the 3D
// bike follows.

type Pt = [number, number]
type View = 'both' | 'right' | 'left'

// Pieces that carry lettering and main-panel layers (others get the pattern,
// plus anything designed on that piece itself).
const LETTERED: Role[] = ['shroud', 'sidePlate', 'rearFender', 'frontFender']
const PLATES: Role[] = ['frontPlate', 'sidePlate']
const MAIN: Role[] = ['shroud', 'sidePlate', 'rearFender', 'frontFender']
const COLOURS_STEP = 2
const GRAPHICS_STEP = 3

// A piece-panel layer as it sits on `piece`: mirrored when that piece is the
// other side's twin of the piece naming the panel.
const onPiece = (l: Layer, piece: TemplatePiece): Layer => (l.panel === `p${piece.id}` ? l : { ...l, x: 1 - l.x, rotation: -l.rotation })

// Sheet pixel → world, for each side (inverse of the painter transform).
function sheetToWorld(side: Side, w: number): M6 {
  const k = (WORLD.x1 - WORLD.x0) / w
  return side === 'right' ? [k, 0, 0, -k, WORLD.x0, WORLD.y1] : [-k, 0, 0, -k, WORLD.x1, WORLD.y1]
}

// Point in outline, non-zero winding (the same rule the canvas fills with,
// so self-overlapping outlines behave as drawn).
function inside([x, y]: Pt, poly: Pt[]) {
  let wn = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[j]
    const [xj, yj] = poly[i]
    const side = (xj - xi) * (y - yi) - (x - xi) * (yj - yi)
    if (yi <= y) {
      if (yj > y && side > 0) wn++
    } else if (yj <= y && side < 0) wn--
  }
  return wn !== 0
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
  const { config, step, setStep, selected, select, updateLayer, removeLayer, duplicateLayer, moveLayer, panel: chosen, setPanel } = useConfig()
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
    own: boolean
    mirror: boolean
  } | null>(null)
  // Resizing or rotating the selected layer with its handles (CSS pixels).
  const handle = useRef<{ mode: 'size' | 'turn'; cx: number; cy: number; d0: number; a0: number; size: number; rotation: number; sign: number } | null>(null)
  // The panel a template piece belongs to: a main panel, or the piece itself
  // (shared with its twin on the other side).
  const panelOf = (host: TemplatePiece) => panelKey(host, template.pieces)
  const plates = platesOnly(config)
  // Plates-only orders can only be designed on the plates (or whole kit).
  const platePanel = (p: LayerPanel) => p === 'sidePlate' || p === 'kit' || template.pieces.some((x) => `p${x.id}` === p && x.role === 'frontPlate')
  const panel: LayerPanel = plates && !platePanel(chosen) ? 'sidePlate' : chosen

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
    // Per side: the design, the lettering, and the layers of each main panel,
    // drawn separately so each piece only shows its own panel's layers.
    const sheets = {
      plain: { right: canvasOf(SW, SW / 2), left: canvasOf(SW, SW / 2) },
      text: { right: canvasOf(SW, SW / 2), left: canvasOf(SW, SW / 2) },
      plate: canvasOf(512, 512),
    }
    const draw = () => {
      if (!alive) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(size.w * dpr)
      canvas.height = Math.round(size.h * dpr)
      const panels = panelsFor(config)
      // Part colours and plate backgrounds are filled piece by piece below.
      for (const side of ['right', 'left'] as const) {
        paintSheet(sheets.plain[side], config, side, panels, { pieces: true, lettering: false })
        paintSheet(sheets.text[side], config, side, panels, { pieces: true, art: false, layers: 'none' })
      }
      const layerSheets = new Map<string, HTMLCanvasElement | null>()
      const layersOf = (role: Role, side: Side) => {
        const k = `${role}|${side}`
        if (!layerSheets.has(k)) {
          const any = config.layers.some((l) => (l.panel === role || l.panel === 'kit') && !l.cover)
          const c = any ? canvasOf(SW, SW / 2) : null
          if (c) paintSheet(c, config, side, panels, { pieces: true, art: false, layers: role as LayerPanel, text: false })
          layerSheets.set(k, c)
        }
        return layerSheets.get(k)!
      }
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
          // A part with its own colour is filled with it completely; only
          // lettering and layers go on top.
          const solid = pieceFill(config, host, panelKey(host, template.pieces))
          if (solid) fillPieceSolid(ctx, config, p, solid, V)
          setM(mul6(mul6(V, invert(toWorld)), sheetToWorld(side, SW)))
          if (!solid) ctx.drawImage(sheets.plain[side], 0, 0)
          if (lettered) {
            // This panel's own layers, then the number and lettering.
            const own = layersOf(host.role, side)
            if (own) ctx.drawImage(own, 0, 0)
            ctx.drawImage(sheets.text[side], 0, 0)
          }
        }
        // Anything designed on this piece itself.
        const key = panelKey(host, template.pieces)
        for (const l of config.layers) if (l.panel === key && pieceIdOf(l.panel) !== null && !l.cover) drawPieceLayer(ctx, l, host.bbox, V, key !== `p${host.id}`)
        ctx.restore()
      }
      // Cut lines on top; the panel being designed stands out, the rest dims.
      ctx.save()
      setM(V)
      ctx.lineJoin = 'round'
      const focus = (x: (typeof pieces)[number]) => !interactive || panel === 'kit' || panelKey(x.host, template.pieces) === panel
      for (const x of pieces) {
        if (!x.printed || focus(x)) continue
        path(x.p)
        ctx.fillStyle = 'rgba(11, 12, 9, 0.55)'
        ctx.fill()
      }
      for (const x of pieces) {
        path(x.p)
        const on = x.printed && interactive && panel !== 'kit' && focus(x)
        ctx.lineWidth = (on ? 2.4 : 1.2) / fit.s
        ctx.strokeStyle = on ? '#8cd63a' : x.printed ? 'rgba(242, 240, 232, 0.55)' : 'rgba(242, 240, 232, 0.18)'
        ctx.setLineDash(x.printed ? [] : [4 / fit.s, 4 / fit.s])
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
  }, [config, template, pieces, fit, size, panel, interactive])

  // --- Interaction -------------------------------------------------------

  const panels = panelsFor(config)
  const movable = config.layers.filter((l) => !(l.kind === 'image' && l.cover))

  const toTemplate = (e: RPointerEvent): Pt => {
    const r = ref.current!.getBoundingClientRect()
    return [(e.clientX - r.left - fit!.ox) / fit!.s, (e.clientY - r.top - fit!.oy) / fit!.s]
  }
  // The printed piece under a template point (smallest first).
  const pieceAt = (t: Pt) => pieces.filter((x) => x.printed && inside(t, x.p.outline)).sort((a, b) => a.p.area - b.p.area)[0]
  type Hit = NonNullable<ReturnType<typeof pieceAt>>

  // Inside a box turned by `deg` (counter-clockwise, y up), with some slack.
  const inBox = (dx: number, dy: number, w: number, h: number, deg: number, tol: number) => {
    const a = (-deg * Math.PI) / 180
    const u = dx * Math.cos(a) - dy * Math.sin(a)
    const v = dx * Math.sin(a) + dy * Math.cos(a)
    return Math.abs(u) < w / 2 + tol && Math.abs(v) < h / 2 + tol
  }
  // Whether a main-panel (or whole-kit) layer shows on a piece.
  const onPanel = (l: Layer, host: TemplatePiece) => MAIN.includes(host.role) && (l.panel === 'kit' || l.panel === host.role)
  // A piece-panel layer's box in template units.
  const pieceBox = (l: Layer, piece: TemplatePiece) => {
    const f = pieceFrame(l, piece.bbox)
    return { cx: f.cx, cy: f.cy, w: f.h * layerAspect(l), h: f.h }
  }
  // The topmost layer under the pointer on the piece it hit.
  const layerAt = (t: Pt, hit: Hit): Layer | undefined =>
    [...movable].reverse().find((l) => {
      const pid = pieceIdOf(l.panel)
      if (pid !== null) {
        if (panelOf(hit.host) !== l.panel) return false
        const m = onPiece(l, hit.host)
        const b = pieceBox(m, hit.host)
        // Template y points down: flip it to measure the turn.
        return inBox(t[0] - b.cx, b.cy - t[1], b.w, b.h, m.rotation, 2 / fit!.s)
      }
      // A panel's layers only appear on that panel's pieces.
      if (!onPanel(l, hit.host)) return false
      const w = apply(hit.toWorld, t)
      const b = layerBox(l, panels)
      return inBox(w[0] - b.cx, w[1] - b.cy, b.w, b.h, l.rotation, 0.015)
    })

  const down = (e: RPointerEvent) => {
    if (!fit) return
    const t = toTemplate(e)
    const hitPiece = pieceAt(t)
    if (!hitPiece) return select(null)
    const l = layerAt(t, hitPiece)
    // Picking a part while colouring stays on the Colours step.
    if (step !== GRAPHICS_STEP && (l || step !== COLOURS_STEP)) setStep(GRAPHICS_STEP)
    if (!l) {
      // Tapping a piece picks its panel for designing.
      const p = panelOf(hitPiece.host)
      setPanel(plates && !platePanel(p) ? 'sidePlate' : p)
      return select(null)
    }
    select(l.id)
    if (pieceIdOf(l.panel) !== null) {
      // Dragged on whichever piece of the pair was touched.
      const piece = hitPiece.host
      const b = pieceBox(onPiece(l, piece), piece)
      drag.current = { id: l.id, piece, dx: t[0] - b.cx, dy: t[1] - b.cy, own: true, mirror: l.panel !== `p${piece.id}` }
    } else {
      const w = apply(hitPiece.toWorld, t)
      const b = layerBox(l, panels)
      drag.current = { id: l.id, piece: hitPiece.p, dx: w[0] - b.cx, dy: w[1] - b.cy, own: false, mirror: false }
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d || !fit) {
      if (fit && ref.current) {
        const t = toTemplate(e)
        const hp = pieceAt(t)
        ref.current.style.cursor = hp && layerAt(t, hp) ? 'move' : hp ? 'pointer' : 'default'
      }
      return
    }
    const t = toTemplate(e)
    if (d.own) {
      // A layer on its own piece moves in the piece's frame.
      const { x, y, w, h } = d.piece.bbox
      const fx = Math.min(1, Math.max(0, (t[0] - d.dx - x) / w))
      const fy = Math.min(1, Math.max(0, 1 - (t[1] - d.dy - y) / h))
      updateLayer(d.id, { x: +(d.mirror ? 1 - fx : fx).toFixed(3), y: +fy.toFixed(3) })
      return
    }
    // Follow whichever piece of the layer's panel the pointer is over; off
    // them, keep the one the drag started on. The layer can't leave its panel.
    const l = config.layers.find((x) => x.id === d.id)
    if (!l) return
    const over = pieceAt(t)
    const toWorld = over && onPanel(l, over.host) ? over.toWorld : pieceToWorld(d.piece, template.pieces)
    const [wx, wy] = apply(toWorld, t)
    const box = layerBox(l, panels)
    const p = box.panel
    // Keep the whole layer inside its panel (its centre, if it is bigger).
    const clamp = (v: number, half: number) => {
      const m = Math.min(0.5, half)
      return +Math.min(1 - m, Math.max(m, v)).toFixed(3)
    }
    updateLayer(d.id, { x: clamp((wx - d.dx - p.x) / p.w, box.w / 2 / p.w), y: clamp((wy - d.dy - p.y) / p.h, box.h / 2 / p.h) })
  }
  const up = () => (drag.current = null)

  // Outline of the selected layer on every piece it lands on.
  const sel = movable.find((l) => l.id === selected)
  const selPolys = useMemo(() => {
    if (!sel || !fit) return []
    const toCssPt = ([x, y]: Pt): Pt => [x * fit.s + fit.ox, y * fit.s + fit.oy]
    if (pieceIdOf(sel.panel) !== null) {
      // On each shown piece of the panel (both sides for a mirrored pair).
      return panelPieces(sel.panel, template.pieces)
        .filter((piece) => pieces.some((x) => x.p.id === piece.id))
        .map((piece) => {
          const m = onPiece(sel, piece)
          const b = pieceBox(m, piece)
          // Template y points down: a negative height and turn keep the box upright.
          const pts = corners({ ...b, h: -b.h }, -m.rotation).map(toCssPt)
          return { pts, points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), sign: m === sel ? -1 : 1 }
        })
    }
    const b = layerBox(sel, panels)
    const world = corners(b, sel.rotation)
    const toCss = (pts: Pt[]) => pts.map(([x, y]) => `${(x * fit.s + fit.ox).toFixed(1)},${(y * fit.s + fit.oy).toFixed(1)}`).join(' ')
    // Only on the panel the layer belongs to (all main panels for whole-kit layers).
    const targets = pieces.filter(({ p, printed }) => printed && p.parent === undefined && (sel.panel === 'kit' ? MAIN.includes(p.role) : p.role === sel.panel))
    const on = targets.filter(({ p, toWorld }) => inside(apply(invert(toWorld), [b.cx, b.cy]), p.outline))
    // Dragged off its panel: still show it against that panel on each side.
    const shown = on.length ? on : targets.filter(({ p }, i) => targets.findIndex((x) => x.p.side === p.side) === i)
    return shown.map(({ toWorld }) => {
      const pts = world.map((w) => apply(invert(toWorld), w)).map(([x, y]): Pt => [x * fit.s + fit.ox, y * fit.s + fit.oy])
      // Mirrored pieces turn the other way on screen.
      return { pts, points: toCss(pts.map(([x, y]): Pt => [(x - fit.ox) / fit.s, (y - fit.oy) / fit.s])), sign: Math.sign(toWorld[0] * toWorld[3] - toWorld[1] * toWorld[2]) || 1 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, fit, pieces, config])

  // Handles on the first outline: resize at a corner, rotate above the top edge.
  const grips = useMemo(() => {
    const first = selPolys[0]
    if (!first) return null
    const pts = first.pts
    const cx = pts.reduce((a, p) => a + p[0], 0) / 4
    const cy = pts.reduce((a, p) => a + p[1], 0) / 4
    const corner = pts.reduce((a, p) => (p[0] + p[1] > a[0] + a[1] ? p : a))
    // corners() lists [-1,-1], [1,-1], [1,1], [-1,1]: the last two make the top edge.
    const top: Pt = [(pts[2][0] + pts[3][0]) / 2, (pts[2][1] + pts[3][1]) / 2]
    const dx = top[0] - cx
    const dy = top[1] - cy
    const len = Math.hypot(dx, dy) || 1
    const turn: Pt = [top[0] + (dx / len) * 26, top[1] + (dy / len) * 26]
    return { cx, cy, corner, top, turn, sign: first.sign, minY: Math.min(...pts.map((p) => p[1]), turn[1]) }
  }, [selPolys])

  const local = (e: RPointerEvent): Pt => {
    const r = wrap.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const startHandle = (e: RPointerEvent, mode: 'size' | 'turn') => {
    if (!sel || !grips) return
    e.stopPropagation()
    const [x, y] = local(e)
    handle.current = {
      mode,
      cx: grips.cx,
      cy: grips.cy,
      d0: Math.hypot(x - grips.cx, y - grips.cy) || 1,
      a0: Math.atan2(y - grips.cy, x - grips.cx),
      size: sel.size,
      rotation: sel.rotation,
      sign: grips.sign,
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const moveHandle = (e: RPointerEvent) => {
    const h = handle.current
    if (!h || !sel) return
    const [x, y] = local(e)
    if (h.mode === 'size') {
      const k = Math.hypot(x - h.cx, y - h.cy) / h.d0
      updateLayer(sel.id, { size: +Math.min(1.5, Math.max(0.03, h.size * k)).toFixed(3) })
    } else {
      const da = ((Math.atan2(y - h.cy, x - h.cx) - h.a0) * 180) / Math.PI
      let r = h.rotation + da * h.sign
      r = ((((r + 180) % 360) + 360) % 360) - 180
      // Snap to straight angles when close.
      const snap = Math.round(r / 45) * 45
      updateLayer(sel.id, { rotation: Math.abs(r - snap) < 4 ? snap : Math.round(r) })
    }
  }
  const endHandle = () => (handle.current = null)
  const resize = (k: number) => sel && updateLayer(sel.id, { size: +Math.min(1.5, Math.max(0.03, sel.size * k)).toFixed(3) })

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
          {selPolys.map((x, i) => (
            <polygon key={i} points={x.points} />
          ))}
          {grips && (
            <>
              <line x1={grips.top[0]} y1={grips.top[1]} x2={grips.turn[0]} y2={grips.turn[1]} className="grip-line" />
              <circle className="grip turn" cx={grips.turn[0]} cy={grips.turn[1]} r={9} onPointerDown={(e) => startHandle(e, 'turn')} onPointerMove={moveHandle} onPointerUp={endHandle} />
              <rect className="grip size" x={grips.corner[0] - 8} y={grips.corner[1] - 8} width={16} height={16} rx={3} onPointerDown={(e) => startHandle(e, 'size')} onPointerMove={moveHandle} onPointerUp={endHandle} />
            </>
          )}
        </svg>
      )}
      {interactive && sel && grips && (
        <div className="sel-tools" style={{ left: Math.min(Math.max(grips.cx, 120), size.w - 120), top: Math.max(grips.minY - 58, 70) }}>
          <button onClick={() => resize(1 / 1.15)} aria-label="Smaller" title="Smaller">
            −
          </button>
          <button onClick={() => resize(1.15)} aria-label="Bigger" title="Bigger">
            +
          </button>
          {sel.kind !== 'image' && (
            <label className="sel-color" title="Colour">
              <span style={{ background: paintCss(sel.fill) }} />
              <input type="color" value={firstColor(sel.fill)} onChange={(e) => updateLayer(sel.id, { fill: e.target.value })} aria-label="Colour" />
            </label>
          )}
          <button onClick={() => moveLayer(sel.id, 1)} aria-label="Bring forward" title="Bring forward">
            <Icon name="up" size={16} />
          </button>
          <button onClick={() => moveLayer(sel.id, -1)} aria-label="Send backward" title="Send backward">
            <Icon name="down" size={16} />
          </button>
          <button onClick={() => duplicateLayer(sel.id)} aria-label="Duplicate" title="Duplicate">
            <Icon name="layers" size={16} />
          </button>
          <button onClick={() => (removeLayer(sel.id), select(null))} aria-label="Delete" title="Delete">
            <Icon name="trash" size={16} />
          </button>
        </div>
      )}
      {interactive && (
        <div className="designer-bar">
          <span className="editing-pill">
            Designing: <b>{panelName(panel, template)}</b>
          </span>
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
