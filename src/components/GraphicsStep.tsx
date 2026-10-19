import { useEffect, useMemo, useRef, useState } from 'react'
import { FONTS, FONT_IDS, type FontId } from '../data/fonts'
import { loadImage } from '../lib/graphics'
import { newId, panelName, panelsAllowed, piecePanels, prepareImage } from '../lib/layers'
import { useTemplates } from '../lib/templates'
import { SHAPES, SHAPE_IDS } from '../lib/shapes2d'
import { platesOnly, useConfig, type Layer, type LayerPanel, type ShapeId } from '../store/config'
import ColorField from './ColorField'
import Icon from './Icon'

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
export default function GraphicsStep() {
  const { config, addLayer, updateLayer, removeLayer, moveLayer, layerTo } = useConfig()
  const selected = useConfig((s) => s.selected)
  const setSelected = useConfig((s) => s.select)
  const chosen = useConfig((s) => s.panel)
  const setPanel = useConfig((s) => s.setPanel)
  const [picking, setPicking] = useState(false)
  const [allPieces, setAllPieces] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const logoFile = useRef<HTMLInputElement>(null)
  const layer = config.layers.find((l) => l.id === selected)
  // Plates-only orders print just the plates, so layers go there.
  const plates = platesOnly(config)
  const template = useTemplates((s) => s.templates[config.bikeId])
  // Main panels, then every other piece of the template on its own.
  const pieceChoices = piecePanels(template, plates)
  const allowed: [LayerPanel, string][] = [...panelsAllowed(plates), ...pieceChoices.map((x): [LayerPanel, string] => [x.panel, x.label])]
  const panel: LayerPanel = allowed.some(([p]) => p === chosen) ? chosen : 'sidePlate'
  const name = (p: LayerPanel) => panelName(p, template)
  const onPanel = config.layers.filter((l) => l.panel === panel)
  const count = (p: LayerPanel) => ((n) => (n ? `${n} item${n > 1 ? 's' : ''}` : 'Empty'))(config.layers.filter((x) => x.panel === p).length)
  const elsewhere = config.layers.length - onPanel.length

  const add = (l: Omit<Layer, 'id' | 'panel'>) => {
    const id = newId()
    addLayer({ ...l, id, panel: l.cover ? 'kit' : panel })
    setSelected(id)
    setPicking(false)
  }
  const small = panel === 'kit' ? 0.5 : 1
  const addShape = (shape: ShapeId) =>
    add({ kind: 'shape', shape, x: 0.5, y: 0.5, size: (shape === 'stripe' || shape === 'twin' ? 0.12 : 0.35) * small, rotation: 0, opacity: 1, fill: config.colors.accent })
  const addText = () =>
    add({ kind: 'text', text: plates ? 'RACING' : 'SEND IT', font: 'racing', x: 0.5, y: plates ? 0.85 : 0.55, size: (plates ? 0.12 : 0.16) * small, rotation: 0, opacity: 1, fill: '#f4f4f2', outline: '#101010' })
  const readImage = async (f: File | undefined, asLogo: boolean) => {
    setError(null)
    if (!f) return
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) return setError('Please choose an image (PNG, JPG, WebP or SVG).')
    if (f.size > 15 * 1024 * 1024) return setError('That image is over 15 MB. Choose a smaller file.')
    try {
      const src = await prepareImage(f)
      await loadImage(src)
      if (asLogo) add({ kind: 'image', logo: true, src, name: f.name, x: 0.5, y: 0.5, size: 0.25 * small, rotation: 0, opacity: 1, fill: '#ffffff' })
      else add({ kind: 'image', src, name: f.name, x: 0.5, y: 0.5, size: 0.6, rotation: 0, opacity: 1, fill: '#ffffff', cover: true })
    } catch {
      setError('We could not read that image. Try saving it again as PNG or JPG.')
    }
    if (file.current) file.current.value = ''
    if (logoFile.current) logoFile.current.value = ''
  }
  const upd = (patch: Partial<Layer>) => layer && updateLayer(layer.id, patch)
  const label = (l: Layer) =>
    l.kind === 'text' ? `“${l.text}”` : l.kind === 'shape' ? SHAPES[l.shape!].label : l.cover ? 'Photo · whole kit' : l.logo ? `Logo · ${l.name ?? ''}` : `Image · ${l.name ?? ''}`

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
      <p className="lead">Choose a panel, then add shapes, text, logos or photos to it. Drag them on the template; the 3D bike updates as you go.</p>

      <div className="group">
        <div className="group-label">
          1 · Choose a panel <span>or tap a piece on the template</span>
        </div>
        <div className="panel-picks" role="group" aria-label="Panel">
          {panelsAllowed(plates).map(([p, l]) => (
            <button key={p} className="panel-pick" aria-pressed={panel === p} onClick={() => setPanel(p)}>
              <b>{l}</b>
              <small>{count(p)}</small>
            </button>
          ))}
        </div>
        {pieceChoices.length > 0 && (
          <>
            <div className="group-label" style={{ marginTop: 14 }}>
              Other pieces <span>Front plate, fork guards, fender centre and trim</span>
            </div>
            <div className="chips" role="group" aria-label="Other pieces">
              {(allPieces ? pieceChoices : pieceChoices.slice(0, 8).concat(pieceChoices.filter((x, i) => i >= 8 && x.panel === panel))).map((x) => (
                <button key={x.panel} className="chip chip-sm" aria-pressed={panel === x.panel} onClick={() => setPanel(x.panel)}>
                  {x.label}
                  {config.layers.some((l) => l.panel === x.panel) ? ' •' : ''}
                </button>
              ))}
              {pieceChoices.length > 8 && (
                <button className="chip chip-sm" onClick={() => setAllPieces(!allPieces)} aria-expanded={allPieces}>
                  {allPieces ? 'Show fewer' : `Show all ${pieceChoices.length}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="group">
        <div className="group-label">2 · Add to the {name(panel).toLowerCase()}</div>
        <div className="add-row">
          <button className="btn btn-ghost btn-sm" aria-expanded={picking} onClick={() => setPicking(!picking)}>
            <Icon name="plus" size={16} /> Shape
          </button>
          <button className="btn btn-ghost btn-sm" onClick={addText}>
            <Icon name="plus" size={16} /> Text
          </button>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            <Icon name="tag" size={16} /> Logo
            <input ref={logoFile} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => readImage(e.target.files?.[0], true)} />
          </label>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={16} /> Photo / design
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => readImage(e.target.files?.[0], false)} />
          </label>
        </div>
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

      <div className="group">
        <div className="group-label">
          Layers on the {name(panel).toLowerCase()} <span>{elsewhere ? `Front first · ${elsewhere} on other panels` : 'Front first'}</span>
        </div>
        {onPanel.length ? (
          <ul className="layer-list">
            {[...onPanel].reverse().map((l, i, list) => {
              return (
                <li key={l.id} className={l.id === selected ? 'on' : ''}>
                  <button className="layer-name" onClick={() => setSelected(l.id)} aria-pressed={l.id === selected}>
                    {l.kind === 'image' && l.src && <img src={l.src} alt="" />}
                    {label(l)}
                  </button>
                  <button className="icon-btn icon-sm" onClick={() => moveLayer(l.id, 1)} disabled={i === 0} aria-label={`Bring ${label(l)} forward`} title="Bring forward">
                    <Icon name="up" size={16} />
                  </button>
                  <button className="icon-btn icon-sm" onClick={() => moveLayer(l.id, -1)} disabled={i === list.length - 1} aria-label={`Send ${label(l)} backward`} title="Send backward">
                    <Icon name="down" size={16} />
                  </button>
                  <button className="icon-btn icon-sm" onClick={() => (removeLayer(l.id), setSelected(null))} aria-label={`Delete ${label(l)}`}>
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="note" style={{ marginTop: 0 }}>
            Nothing on this panel yet. Add a shape, text, logo or photo above.
          </p>
        )}
      </div>

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
          {layer.kind === 'image' && !layer.logo && (
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
              <select
                className="select"
                value={layer.panel}
                aria-label="Panel this item is on"
                onChange={(e) => {
                  const p = e.target.value as LayerPanel
                  upd({ panel: p, x: 0.5, y: 0.5 })
                  setPanel(p)
                }}
              >
                {allowed.map(([p, l]) => (
                  <option key={p} value={p}>
                    {l}
                  </option>
                ))}
              </select>
              <div className="group-label" style={{ marginTop: 16 }}>
                Order <span>What sits in front</span>
              </div>
              <div className="chips">
                <button className="chip chip-sm" onClick={() => layerTo(layer.id, 'front')}>
                  To front
                </button>
                <button className="chip chip-sm" onClick={() => moveLayer(layer.id, 1)}>
                  Forward
                </button>
                <button className="chip chip-sm" onClick={() => moveLayer(layer.id, -1)}>
                  Backward
                </button>
                <button className="chip chip-sm" onClick={() => layerTo(layer.id, 'back')}>
                  To back
                </button>
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
