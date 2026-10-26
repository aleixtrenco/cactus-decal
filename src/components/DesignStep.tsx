import { useEffect, useMemo, useRef, useState } from 'react'
import { bikeById } from '../data/bikes'
import { swatchName } from '../data/designs'
import { FONTS, FONT_IDS, type FontId } from '../data/fonts'
import { formatAED, NEON_SURCHARGE } from '../data/pricing'
import { frontPlateColor, loadImage } from '../lib/graphics'
import { newId, panelName, panelsAllowed, piecePanels, prepareImage } from '../lib/layers'
import type { Paint } from '../lib/paint'
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

// The colour of the part being designed: a main panel or single piece, the
// plates' background, or the whole kit's base colour.
function PartColour({ panel }: { panel: LayerPanel }) {
  const { config, set, setRider } = useConfig()
  const template = useTemplates((s) => s.templates[config.bikeId])
  const front = piecePanels(template, false).find((x) => x.panel === panel)?.piece.role === 'frontPlate'
  const plate = panel === 'sidePlate' || front
  const kit = panel === 'kit'
  const value = panel === 'sidePlate' ? config.rider.plateColor : front ? frontPlateColor(config) : kit ? config.colors.base : (config.partColors[panel] ?? config.colors.base)
  const own = !plate && !kit && !!config.partColors[panel]
  const setPart = (c: Paint) =>
    panel === 'sidePlate'
      ? setRider({ plateColor: c })
      : front
        ? setRider({ frontPlateColor: c })
        : kit
          ? set({ colors: { ...config.colors, base: c } })
          : set({ partColors: { ...config.partColors, [panel]: c } })
  const backToKit = () => {
    const next = { ...config.partColors }
    delete next[panel]
    set({ partColors: next })
  }
  return (
    <div className="group">
      <div className="group-label">
        Colour <span>{plate ? 'Plate background' : own ? swatchName(value) : kit ? 'Every part without its own colour' : 'Kit colour'}</span>
      </div>
      <ColorField value={value} onChange={setPart} label={`${panelName(panel, template)} colour`} />
      {!plate && !kit && (
        <div className="chips" style={{ marginTop: 12 }}>
          <button className="chip chip-sm" onClick={() => set({ colors: { ...config.colors, base: value }, partColors: {} })}>
            Use on every part
          </button>
          {own && (
            <button className="chip chip-sm" onClick={backToKit}>
              Back to the kit colour
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Race number, name and the bike make lettering. They are moved, resized and
// turned on the template like any other item.
function RiderFields() {
  const { config, setRider, set } = useConfig()
  const r = config.rider
  return (
    <div className="group">
      <div className="group-label">
        Number &amp; name <span>Side plates, front plate and shrouds</span>
      </div>
      <div className="row-2">
        <div className="field">
          <label htmlFor="rider-number">Number</label>
          <input
            id="rider-number"
            className="input big"
            inputMode="text"
            maxLength={3}
            value={r.number}
            placeholder="27"
            onChange={(e) => setRider({ number: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '') })}
          />
        </div>
        <div className="field">
          <label htmlFor="rider-name">Name</label>
          <input
            id="rider-name"
            className="input big"
            maxLength={12}
            value={r.name}
            placeholder="Your name"
            onChange={(e) => setRider({ name: e.target.value.toUpperCase().replace(/[^A-Z0-9 .'-]/g, '') })}
            autoComplete="nickname"
          />
        </div>
      </div>
      {(r.number || r.name) && (
        <>
          <div className="group-label" style={{ marginTop: 16 }}>
            Font
          </div>
          <div className="chips">
            {FONT_IDS.map((f) => (
              <button key={f} className="chip font-chip" aria-pressed={r.font === f} onClick={() => setRider({ font: f })} style={{ font: FONTS[f].css(18) }}>
                {FONTS[f].label}
              </button>
            ))}
          </div>
          {r.number && (
            <>
              <div className="group-label" style={{ marginTop: 16 }}>
                Number colour <span>{swatchName(r.numberColor)}</span>
              </div>
              <ColorField value={r.numberColor} onChange={(p) => setRider({ numberColor: p })} label="Number colour" />
            </>
          )}
          {r.name && (
            <>
              <div className="group-label" style={{ marginTop: 16 }}>
                Name colour <span>{swatchName(r.nameColor)}</span>
              </div>
              <ColorField value={r.nameColor} onChange={(p) => setRider({ nameColor: p })} label="Name colour" />
            </>
          )}
        </>
      )}
      <button className="toggle" role="switch" aria-checked={config.makeLettering} onClick={() => set({ makeLettering: !config.makeLettering })} style={{ marginTop: 16 }}>
        <span>
          <b>Bike make lettering</b>
          <small style={{ display: 'block', color: 'var(--muted)', fontSize: 13 }}>Large “{bikeById(config.bikeId).make.toUpperCase()}” on the shrouds</small>
        </span>
        <span className="track" aria-hidden="true" />
      </button>
    </div>
  )
}

// The design step: the customer clicks a piece on the template, then colours
// it and adds shapes, text, logos or photos to it. The number and name are
// set here too.
export default function DesignStep() {
  const { config, addLayer, updateLayer, removeLayer, moveLayer, layerTo } = useConfig()
  const selected = useConfig((s) => s.selected)
  const setSelected = useConfig((s) => s.select)
  const chosen = useConfig((s) => s.panel)
  const setPanel = useConfig((s) => s.setPanel)
  const [picking, setPicking] = useState(false)
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
      <h2>Design</h2>
      <p className="lead">Click any piece on the template to work on it. Colour it, then add shapes, text, logos or photos. Drag, resize and turn them on the template; the 3D bike updates as you go.</p>

      <div className="editing-now" aria-live="polite">
        <small>Editing</small>
        <b>{name(panel)}</b>
        {panel !== 'kit' && (
          <button className="chip chip-sm" onClick={() => setPanel('kit')}>
            Whole kit
          </button>
        )}
      </div>

      <PartColour panel={panel} />

      <div className="group">
        <div className="group-label">Add to the {name(panel).toLowerCase()}</div>
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
            Nothing on this piece yet. Add a shape, text, logo or photo above.
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
                    ['Left / right', 'x', 0, 1, 0.01],
                    ['Up / down', 'y', 0, 1, 0.01],
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
      <RiderFields />
      <p className="note">
        Photos are printed as images. For the sharpest result, upload the largest version you have; we check every file before printing. Colours with a ring are neon inks (+ {formatAED(NEON_SURCHARGE)} once
        per kit).
      </p>
    </>
  )
}
