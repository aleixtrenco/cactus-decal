import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { FONTS, FONT_IDS, type FontId } from '../data/fonts'
import { ensureAssets, layerFrame, loadImage, WORLD } from '../lib/graphics'
import { drawProof } from '../lib/proof'
import { SHAPES, SHAPE_IDS } from '../lib/shapes2d'
import { panelsFor, useTemplates } from '../lib/templates'
import { useConfig, type Layer, type LayerPanel, type ShapeId } from '../store/config'
import ColorField from './ColorField'
import Icon from './Icon'

const PANELS: [LayerPanel, string][] = [
  ['shroud', 'Shroud'],
  ['sidePlate', 'Side plate'],
  ['rearFender', 'Rear fender'],
  ['kit', 'Whole kit'],
]

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

// Shrinks big photos so the design stays quick to edit and upload.
async function prepareImage(file: File): Promise<string> {
  const src = await new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
  if (file.type === 'image/svg+xml') return src
  const img = await loadImage(src)
  const max = 1800
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) })
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const png = file.type === 'image/png'
  let out = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9)
  // Keep uploads under the 2 MB order limit.
  for (let q = 0.8; out.length > 2.6e6 && q > 0.4; q -= 0.15) out = c.toDataURL('image/jpeg', q)
  return out
}

function ShapeIcon({ id }: { id: ShapeId }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    const s = SHAPES[id]
    const k = Math.min(40 / s.aspect, 40)
    ctx.clearRect(0, 0, 48, 48)
    ctx.setTransform(k, 0, 0, -k, 24, 24)
    ctx.fillStyle = '#f2f0e8'
    ctx.beginPath()
    s.draw(ctx, '#3a3d33')
    ctx.fill()
  }, [id])
  return <canvas ref={ref} width={48} height={48} aria-hidden="true" />
}

// The flat template view: the design on the right side of the bike, where
// layers can be picked and dragged.
function TemplateView({ selected, onSelect }: { selected: string | null; onSelect: (id: string | null) => void }) {
  const { config, updateLayer } = useConfig()
  const template = useTemplates((s) => s.templates[config.bikeId])
  const ref = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const W = 900
  const H = Math.round(W * 0.56)
  const scale = W / (WORLD.x1 - WORLD.x0)
  const top = H / scale - 0.02
  const toPx = (x: number, y: number) => [(x - WORLD.x0) * scale, (top - y) * scale]
  const toWorld = (px: number, py: number) => [px / scale + WORLD.x0, top - py / scale]

  useEffect(() => {
    let alive = true
    const draw = () => ref.current && drawProof(ref.current, config, 'right')
    draw()
    ensureAssets(config).then(() => alive && draw())
    return () => {
      alive = false
    }
  }, [config, template])

  const panels = panelsFor(config)
  const frames = config.layers.map((l) => {
    const f = layerFrame(l, panels)
    const aspect = l.kind === 'shape' && l.shape ? SHAPES[l.shape].aspect : l.kind === 'text' ? Math.max(1, (l.text?.length ?? 1) * 0.6) : 1.4
    const [cx, cy] = toPx(f.cx, f.cy)
    return { l, f, cx, cy, w: f.h * aspect * scale, h: f.h * scale }
  })
  const sel = frames.find((x) => x.l.id === selected)

  const eventPx = (e: RPointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]
  }
  const down = (e: RPointerEvent) => {
    const [px, py] = eventPx(e)
    const hit = [...frames].reverse().find((x) => !x.l.cover && Math.abs(px - x.cx) < Math.max(14, x.w / 2) && Math.abs(py - x.cy) < Math.max(14, x.h / 2))
    onSelect(hit?.l.id ?? null)
    if (!hit) return
    drag.current = { id: hit.l.id, dx: px - hit.cx, dy: py - hit.cy }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const fr = frames.find((x) => x.l.id === d.id)
    if (!fr) return
    const [px, py] = eventPx(e)
    const [wx, wy] = toWorld(px - d.dx, py - d.dy)
    const p = fr.f.panel
    updateLayer(d.id, { x: +((wx - p.x) / p.w).toFixed(3), y: +((wy - p.y) / p.h).toFixed(3) })
  }

  return (
    <div className="template-view">
      <canvas
        ref={ref}
        width={W}
        height={H}
        role="img"
        aria-label="Your design on the right side of the bike. Drag a shape, text or image to move it."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
      />
      {sel && !sel.l.cover && (
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <rect
            x={sel.cx - sel.w / 2 - 6}
            y={sel.cy - sel.h / 2 - 6}
            width={sel.w + 12}
            height={sel.h + 12}
            transform={`rotate(${-sel.l.rotation} ${sel.cx} ${sel.cy})`}
            className="sel-box"
          />
        </svg>
      )}
      <small>Right side shown · drag to move · the left side mirrors it</small>
    </div>
  )
}

export default function GraphicsStep() {
  const { config, addLayer, updateLayer, removeLayer, moveLayer } = useConfig()
  const [selected, setSelected] = useState<string | null>(config.layers.at(-1)?.id ?? null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const layer = config.layers.find((l) => l.id === selected)

  const add = (l: Omit<Layer, 'id'>) => {
    const id = newId()
    addLayer({ ...l, id })
    setSelected(id)
    setPicking(false)
  }
  const addShape = (shape: ShapeId) =>
    add({ kind: 'shape', shape, panel: 'shroud', x: 0.5, y: 0.5, size: shape === 'stripe' || shape === 'twin' ? 0.12 : 0.35, rotation: 0, opacity: 1, fill: config.colors.accent })
  const addText = () =>
    add({ kind: 'text', text: 'SEND IT', font: 'racing', panel: 'shroud', x: 0.5, y: 0.55, size: 0.16, rotation: 0, opacity: 1, fill: '#f4f4f2', outline: '#101010' })
  const onFile = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) return setError('Please choose a photo or image (JPG, PNG, WebP or SVG).')
    if (f.size > 15 * 1024 * 1024) return setError('That image is over 15 MB. Choose a smaller photo.')
    try {
      const src = await prepareImage(f)
      await loadImage(src)
      add({ kind: 'image', src, name: f.name, panel: 'kit', x: 0.5, y: 0.5, size: 0.6, rotation: 0, opacity: 1, fill: '#ffffff', cover: true })
    } catch {
      setError('We could not read that image. Try saving it again as JPG or PNG.')
    }
    if (file.current) file.current.value = ''
  }
  const upd = (patch: Partial<Layer>) => layer && updateLayer(layer.id, patch)
  const label = (l: Layer) => (l.kind === 'text' ? `“${l.text}”` : l.kind === 'shape' ? SHAPES[l.shape!].label : l.cover ? 'Photo · whole kit' : `Image · ${l.name ?? ''}`)

  const fontChips = useMemo(
    () =>
      FONT_IDS.map((f: FontId) => (
        <button key={f} className="chip font-chip" aria-pressed={layer?.font === f} onClick={() => upd({ font: f })} style={{ font: FONTS[f].css(18) }}>
          {FONTS[f].label}
        </button>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layer?.font, layer?.id],
  )

  return (
    <>
      <h2>Graphics</h2>
      <p className="lead">Add shapes, text or your own photo. Drag them on the template; the 3D bike updates as you go.</p>
      <div className="group">
        <TemplateView selected={selected} onSelect={setSelected} />
      </div>
      <div className="add-row">
        <button className="btn btn-ghost btn-sm" aria-expanded={picking} onClick={() => setPicking(!picking)}>
          <Icon name="plus" size={16} /> Shape
        </button>
        <button className="btn btn-ghost btn-sm" onClick={addText}>
          <Icon name="plus" size={16} /> Text
        </button>
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          <Icon name="upload" size={16} /> Photo / design
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {picking && (
        <div className="shape-grid" role="group" aria-label="Choose a shape">
          {SHAPE_IDS.map((id) => (
            <button key={id} className="shape-pick" onClick={() => addShape(id)}>
              <ShapeIcon id={id} />
              <span>{SHAPES[id].label}</span>
            </button>
          ))}
        </div>
      )}

      {config.layers.length > 0 && (
        <div className="group">
          <div className="group-label">
            Your layers <span>Top of the list is drawn first</span>
          </div>
          <ul className="layer-list">
            {config.layers.map((l, i) => (
              <li key={l.id} className={l.id === selected ? 'on' : ''}>
                <button className="layer-name" onClick={() => setSelected(l.id)} aria-pressed={l.id === selected}>
                  {label(l)}
                </button>
                <button className="icon-btn icon-sm" onClick={() => moveLayer(l.id, -1)} disabled={i === 0} aria-label={`Move ${label(l)} back`}>
                  <Icon name="chevron" size={16} />
                </button>
                <button className="icon-btn icon-sm" onClick={() => moveLayer(l.id, 1)} disabled={i === config.layers.length - 1} aria-label={`Move ${label(l)} forward`} style={{ transform: 'rotate(180deg)' }}>
                  <Icon name="chevron" size={16} />
                </button>
                <button className="icon-btn icon-sm" onClick={() => (removeLayer(l.id), setSelected(null))} aria-label={`Delete ${label(l)}`}>
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {layer && (
        <div className="group layer-edit">
          {layer.kind === 'text' && (
            <>
              <div className="field">
                <label htmlFor="layer-text">Text</label>
                <input id="layer-text" className="input" maxLength={24} value={layer.text ?? ''} onChange={(e) => upd({ text: e.target.value })} />
              </div>
              <div className="group-label" style={{ marginTop: 16 }}>
                Font
              </div>
              <div className="chips">{fontChips}</div>
            </>
          )}
          {layer.kind === 'shape' && (
            <div className="shape-grid compact" role="group" aria-label="Shape">
              {SHAPE_IDS.map((id) => (
                <button key={id} className="shape-pick" aria-pressed={layer.shape === id} onClick={() => upd({ shape: id })} title={SHAPES[id].label}>
                  <ShapeIcon id={id} />
                </button>
              ))}
            </div>
          )}
          {layer.kind === 'image' && (
            <button className="toggle" role="switch" aria-checked={!!layer.cover} onClick={() => upd({ cover: !layer.cover })}>
              <span>
                <b>Use as the whole kit</b>
                <small style={{ display: 'block', color: 'var(--muted)', fontSize: 13 }}>Your photo covers every panel. Number, name and logos stay on top.</small>
              </span>
              <span className="track" aria-hidden="true" />
            </button>
          )}

          {layer.kind !== 'image' && (
            <>
              <div className="group-label" style={{ marginTop: 16 }}>
                Colour
              </div>
              <ColorField value={layer.fill} onChange={(fill) => upd({ fill })} label="Layer colour" />
              <div className="group-label" style={{ marginTop: 16 }}>
                Outline
              </div>
              <div className="chips">
                {[undefined, '#101010', '#f4f4f2', config.colors.accent.startsWith('#') ? config.colors.accent : '#ffd200'].map((o) => (
                  <button key={o ?? 'none'} className="chip chip-sm grad-end" aria-pressed={layer.outline === o} onClick={() => upd({ outline: o })}>
                    {o ? <i style={{ background: o }} /> : null}
                    {o ? (o === '#101010' ? 'Black' : o === '#f4f4f2' ? 'White' : 'Accent') : 'None'}
                  </button>
                ))}
              </div>
            </>
          )}

          {!(layer.kind === 'image' && layer.cover) && (
            <>
              <div className="group-label" style={{ marginTop: 16 }}>
                Placed on
              </div>
              <div className="chips">
                {PANELS.map(([p, l]) => (
                  <button key={p} className="chip chip-sm" aria-pressed={layer.panel === p} onClick={() => upd({ panel: p, x: 0.5, y: 0.5 })}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="sliders" style={{ marginTop: 12 }}>
                {(
                  [
                    ['Left / right', 'x', -0.2, 1.2, 0.01],
                    ['Up / down', 'y', -0.2, 1.2, 0.01],
                    ['Size', 'size', 0.03, 1.5, 0.01],
                    ['Rotation', 'rotation', -180, 180, 1],
                  ] as const
                ).map(([lab, key, min, max, step]) => (
                  <label key={key} className="slider">
                    <span>{lab}</span>
                    <input type="range" min={min} max={max} step={step} value={layer[key]} onChange={(e) => upd({ [key]: +e.target.value })} />
                  </label>
                ))}
              </div>
            </>
          )}
          <label className="slider" style={{ marginTop: 12 }}>
            <span>Opacity · {Math.round(layer.opacity * 100)}%</span>
            <input type="range" min={0.1} max={1} step={0.05} value={layer.opacity} onChange={(e) => upd({ opacity: +e.target.value })} />
          </label>
        </div>
      )}
      <p className="note">Photos are printed as images. For the sharpest result, upload the largest version you have; we check every file before printing.</p>
    </>
  )
}
