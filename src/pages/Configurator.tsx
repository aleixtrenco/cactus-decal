import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Contours, Header } from '../components/Chrome'
import ColorField from '../components/ColorField'
import GraphicsStep from '../components/GraphicsStep'
import { newId, panelName, panelsAllowed, prepareImage } from '../lib/layers'
import TemplateDesigner from '../components/TemplateDesigner'
import Icon from '../components/Icon'
import { paintCss } from '../lib/paint'
import { AnimatedNumber, LazyStage, ProofCanvas } from '../components/bits'
import { BIKES, MAKES, bikeById, typeLabel, type Make } from '../data/bikes'
import { DESIGNS, PRESETS, designById, swatchName, type Palette } from '../data/designs'
import { FONTS as NUMBER_FONTS, type FontId as NumberFont } from '../data/fonts'
import {
  EXTRAS,
  FINISHES,
  KIT_PARTS,
  PLATES_KIT,
  PLATES_PARTS,
  kitPrice,
  type KitId,
  KIT_PRICES,
  MATERIALS,
  NEON_SURCHARGE,
  formatAED,
  priceLines,
  priceTotal,
  type ExtraId,
  type FinishId,
  type MaterialId,
} from '../data/pricing'
import { decodeConfig, encodeConfig } from '../lib/share'
import { drawProof } from '../lib/proof'
import { ensureAssets, loadImage } from '../lib/graphics'
import { STEPS, platesOnly, priceInput, useConfig, type KitConfig, type LayerPanel, type PlasticsId } from '../store/config'
import type { StageApi, View } from '../three/Stage'

const STEP_VIEW: View[] = ['three-quarter', 'right', 'three-quarter', 'right', 'plate', 'right', 'three-quarter', 'three-quarter']
const VIEW_BUTTONS: [View, string][] = [
  ['three-quarter', '3/4'],
  ['right', 'Right'],
  ['left', 'Left'],
  ['front', 'Front'],
  ['rear', 'Rear'],
  ['top', 'Top'],
]

export default function Configurator() {
  const { config, step, setStep, load, chooseDesign } = useConfig()
  const [params] = useSearchParams()
  const [view, setView] = useState<View>(STEP_VIEW[0])
  const [toast, setToast] = useState<string | null>(null)
  const stageApi = useRef<StageApi | null>(null)
  const bike = bikeById(config.bikeId)
  const total = priceTotal(priceInput(config))

  // Deep links: ?design=<id> starts from a design, ?d=<code> restores a saved
  // kit, ?kit=plates starts a number-plates-only order.
  useEffect(() => {
    const d = params.get('d')
    const design = params.get('design')
    const kit = params.get('kit')
    if (kit === 'plates' || kit === 'full') useConfig.getState().set({ kit })
    if (d) {
      const c = decodeConfig(d)
      if (c) load(c)
    } else if (design && DESIGNS.some((x) => x.id === design)) {
      chooseDesign(design as KitConfig['designId'])
      setStep(1)
    }
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The template is the main design surface; the 3D bike takes over on the
  // bike step and whenever the customer swaps it in.
  const [main, setMain] = useState<'design' | '3d'>(step === 0 ? '3d' : 'design')
  useEffect(() => {
    setView(STEP_VIEW[step])
    setMain(step === 0 ? '3d' : 'design')
  }, [step])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  const go = (n: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)))
    document.querySelector('.panel-body')?.scrollTo({ top: 0 })
    if (window.innerWidth <= 960) document.querySelector('.panel')?.scrollIntoView({ behavior: 'smooth' })
  }

  const onApi = useCallback((api: StageApi) => (stageApi.current = api), [])

  const snapshot = () => {
    const url = stageApi.current?.capture()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `cactus-decal-lab-${bike.make}-${config.designId}.png`.toLowerCase()
    a.click()
  }

  const share = async () => {
    const url = `${location.origin}${location.pathname}${location.hash.split('?')[0]}?d=${encodeConfig(config)}`
    try {
      if (navigator.share && window.innerWidth < 900) await navigator.share({ title: 'My Cactus Decal Lab kit', url })
      else {
        await navigator.clipboard.writeText(url)
        setToast('Link copied. Open it any time to keep designing.')
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <>
      <Header solid />
      <main className="cfg" id="main">
        <section className="viewer" data-main={main} aria-label="Design area">
          <Contours />
          <div className="viewer-design">
            <TemplateDesigner interactive={main === 'design'} />
            {main === '3d' && (
              <button className="inset-swap" onClick={() => setMain('design')}>
                <Icon name="layers" size={16} /> Edit template
              </button>
            )}
          </div>
          <div className="viewer-canvas">
            <LazyStage cfg={config} view={view} onApi={onApi} />
            {main === 'design' && (
              <button className="inset-swap" onClick={() => setMain('3d')}>
                <Icon name="cube" size={16} /> 3D view
              </button>
            )}
          </div>
          <div className="viewer-top">
            <div className="viewer-title">
              <AnimatePresence mode="wait">
                <motion.div
                  key={bike.id + config.designId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="display">
                    {bike.make} {designById(config.designId).name}
                  </div>
                  <small>
                    {bike.model} · {bike.years}
                  </small>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="viewer-tools">
              <button className="icon-btn" onClick={snapshot} aria-label="Download a picture of this view" title="Download picture">
                <Icon name="camera" />
              </button>
              <button className="icon-btn" onClick={share} aria-label="Copy a link to this design" title="Share design">
                <Icon name="share" />
              </button>
            </div>
          </div>
          {main === '3d' && (
            <>
              <div className="views" role="group" aria-label="Camera view">
                {VIEW_BUTTONS.map(([v, label]) => (
                  <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="viewer-hint" aria-hidden="true">
                Drag to rotate · Scroll to zoom
              </div>
            </>
          )}
        </section>

        <section className="panel" aria-label="Design options">
          <nav className="stepper" aria-label="Configurator steps">
            {STEPS.map((s, i) => (
              <button key={s} aria-current={i === step ? 'step' : undefined} onClick={() => go(i)}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                {s}
                {i === step && <motion.span layoutId="step-bar" className="bar" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              </button>
            ))}
          </nav>
          <div className="panel-body">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                {step === 0 && <BikeStep />}
                {step === 1 && <DesignStep />}
                {step === 2 && <ColourStep />}
                {step === 3 && <GraphicsStep />}
                {step === 4 && <RiderStep />}
                {step === 5 && <LogoStep />}
                {step === 6 && <ExtrasStep />}
                {step === 7 && <ReviewStep onToast={setToast} onShare={share} />}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="panel-foot">
            <div className="total" aria-live="polite">
              <small>{platesOnly(config) ? 'Your plates' : 'Your kit'}</small>
              <b>
                <AnimatedNumber value={total} format={formatAED} />
              </b>
            </div>
            {step > 0 && (
              <button className="icon-btn" onClick={() => go(step - 1)} aria-label="Previous step">
                <Icon name="back" />
              </button>
            )}
            {step < STEPS.length - 1 && (
              <button className="btn btn-primary btn-sm" onClick={() => go(step + 1)}>
                {STEPS[step + 1]} <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
        </section>
      </main>
      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" initial={{ opacity: 0, y: 16, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 8, x: '-50%' }}>
            <Icon name="check" size={18} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function StepHead({ title, lead }: { title: string; lead: string }) {
  return (
    <>
      <h2>{title}</h2>
      <p className="lead">{lead}</p>
    </>
  )
}

function BikeStep() {
  const { config, set } = useConfig()
  const current = bikeById(config.bikeId)
  const [make, setMake] = useState<Make>(current.make)
  const models = BIKES.filter((b) => b.make === make)
  return (
    <>
      <StepHead title="Your bike" lead="Choose what you're designing, then your make and model so every piece is cut to fit." />
      <div className="group">
        <div className="group-label">What are you designing?</div>
        <div className="options">
          {(
            [
              ['full', KIT_PRICES[bikeById(config.bikeId).type].label.replace('Custom ', 'Full '), KIT_PARTS, KIT_PRICES[bikeById(config.bikeId).type].price],
              ['plates', 'Number plates only', PLATES_PARTS, PLATES_KIT.price],
            ] as [KitId, string, string, number][]
          ).map(([id, label, note, price]) => (
            <button key={id} className="option" aria-pressed={config.kit === id} onClick={() => set({ kit: id })}>
              <span>
                <b>{label}</b>
                <small>{note}</small>
              </span>
              <span className="price">{formatAED(price)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">Make</div>
        <div className="chips">
          {MAKES.map((m) => (
            <button
              key={m.make}
              className="chip"
              aria-pressed={make === m.make}
              onClick={() => {
                setMake(m.make)
                const first = BIKES.find((b) => b.make === m.make)!
                set({ bikeId: first.id })
              }}
            >
              {m.make}
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">Model & year</div>
        <div className="options">
          {models.map((b) => (
            <button key={b.id} className="option" aria-pressed={config.bikeId === b.id} onClick={() => set({ bikeId: b.id })}>
              <span>
                <b>{b.model}</b>
                <small>
                  {b.years} · {typeLabel(b.type)} · {formatAED(kitPrice(config.kit, b.type).price)}
                </small>
              </span>
              {config.bikeId === b.id && <Icon name="check" />}
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">
          Plastics colour <span>Shows on any part without graphics</span>
        </div>
        <div className="chips">
          {(
            [
              ['oem', `Stock ${make}`],
              ['white', 'White'],
              ['black', 'Black'],
            ] as [PlasticsId, string][]
          ).map(([id, label]) => (
            <button key={id} className="chip" aria-pressed={config.plastics === id} onClick={() => set({ plastics: id })}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function DesignStep() {
  const { config, chooseDesign, setStep } = useConfig()
  const previews = useMemo(
    () =>
      PRESETS.map((d) => ({
        d,
        cfg: { ...config, designId: d.id, colors: { ...d.palette } },
      })),
    [config],
  )
  const blank = config.designId === 'blank'
  return (
    <>
      <StepHead title="Design" lead="Start from a blank kit and build your own, or pick one of our designs. You can change every colour later." />
      <button className="design-pick blank-pick" aria-pressed={blank} onClick={() => (blank ? setStep(3) : chooseDesign('blank'))}>
        <span className="blank-icon" aria-hidden="true">
          <Icon name="plus" size={26} />
        </span>
        <span>
          <b>Start blank</b>
          <small>{blank ? 'Selected. Next, add shapes, text or your own photo in Graphics.' : 'An empty kit in one colour. Add shapes, text and photos yourself.'}</small>
        </span>
      </button>
      <div className="group-label" style={{ marginTop: 22 }}>
        Or start from a design
      </div>
      <div className="design-grid">
        {previews.map(({ d, cfg }) => (
          <button key={d.id} className="design-pick" aria-pressed={config.designId === d.id} onClick={() => chooseDesign(d.id)}>
            <ProofCanvas cfg={cfg} width={360} label={`${d.name} preview`} />
            <b>{d.name}</b>
          </button>
        ))}
      </div>
      <p className="note">Choosing a new design resets the colours to that design's palette.</p>
    </>
  )
}

function ColourStep() {
  const { config, setColor, chooseDesign } = useConfig()
  const [open, setOpen] = useState<keyof Palette | null>('primary')
  const zones: [keyof Palette, string, string][] = [
    ['base', 'Base', 'The background colour across the kit'],
    ['primary', 'Primary', 'The main shapes of the design'],
    ['secondary', 'Secondary', 'Supporting shapes and blocks'],
    ['accent', 'Accent', 'Pinstripes, details and lettering'],
  ]
  return (
    <>
      <StepHead title="Colours" lead="Tap a zone, then pick a colour, type any hex code or make a gradient. The bike updates instantly." />
      <div className="group">
        {zones.map(([key, label, help]) => (
          <div className="zone" key={key}>
            <button className="zone-head" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
              <span className="sw" style={{ background: paintCss(config.colors[key]) }} aria-hidden="true" />
              <span>
                <b>{label}</b>
                <small>
                  {swatchName(config.colors[key])} · {help}
                </small>
              </span>
              <Icon name="chevron" />
            </button>
            <AnimatePresence initial={false}>
              {open === key && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="swatches">
                    <ColorField value={config.colors[key]} onChange={(p) => setColor(key, p)} label={`${label} colour`} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p className="note">Colours with a ring are neon inks (+ {formatAED(NEON_SURCHARGE)} once per kit). Screens vary, so we print to standard colour references.</p>
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => chooseDesign(config.designId)}>
        <Icon name="rotate" size={16} /> Reset to design colours
      </button>
    </>
  )
}

function RiderStep() {
  const { config, setRider, set } = useConfig()
  const r = config.rider
  return (
    <>
      <StepHead title="Name & number" lead="Your number goes on the side plates and front plate. Your name goes on the shrouds." />
      <div className="group row-2">
        <div className="field">
          <label htmlFor="rider-number">Number</label>
          <input
            id="rider-number"
            className="input big"
            inputMode="text"
            maxLength={3}
            value={r.number}
            onChange={(e) =>
              setRider({
                number: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''),
              })
            }
            aria-describedby="number-help"
          />
          <span className="help" id="number-help">
            Up to 3 characters
          </span>
        </div>
        <div className="field">
          <label htmlFor="rider-name">Name</label>
          <input
            id="rider-name"
            className="input big"
            maxLength={12}
            value={r.name}
            onChange={(e) =>
              setRider({
                name: e.target.value.toUpperCase().replace(/[^A-Z0-9 .'-]/g, ''),
              })
            }
            aria-describedby="name-help"
            autoComplete="nickname"
          />
          <span className="help" id="name-help">
            Up to 12 characters
          </span>
        </div>
      </div>
      <div className="group">
        <div className="group-label">Number & name font</div>
        <div className="chips">
          {(Object.keys(NUMBER_FONTS) as NumberFont[]).map((f) => (
            <button key={f} className="chip" aria-pressed={r.font === f} onClick={() => setRider({ font: f })} style={{ font: NUMBER_FONTS[f].css(20) }}>
              {NUMBER_FONTS[f].label}
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">
          Plate background <span>{swatchName(r.plateColor)}</span>
        </div>
        <ColorField value={r.plateColor} onChange={(p) => setRider({ plateColor: p })} label="Plate background colour" />
      </div>
      <div className="group">
        <div className="group-label">
          Number colour <span>{swatchName(r.numberColor)}</span>
        </div>
        <ColorField value={r.numberColor} onChange={(p) => setRider({ numberColor: p })} label="Number colour" />
      </div>
      <div className="group">
        <div className="group-label">
          Name colour <span>{swatchName(r.nameColor)}</span>
        </div>
        <ColorField value={r.nameColor} onChange={(p) => setRider({ nameColor: p })} label="Name colour" />
      </div>
      <div className="group">
        <button className="toggle" role="switch" aria-checked={config.makeLettering} onClick={() => set({ makeLettering: !config.makeLettering })}>
          <span>
            <b>Bike make lettering</b>
            <small style={{ display: 'block', color: 'var(--muted)', fontSize: 13 }}>Large “{bikeById(config.bikeId).make.toUpperCase()}” on the shrouds</small>
          </span>
          <span className="track" aria-hidden="true" />
        </button>
      </div>
    </>
  )
}

const MAX_LOGOS = 6

function LogoStep() {
  const { config, addLayer, removeLayer, updateLayer, select, setPanel, setStep } = useConfig()
  const chosen = useConfig((s) => s.panel)
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const logos = config.layers.filter((l) => l.logo)
  const allowed = panelsAllowed(platesOnly(config))
  const target: LayerPanel = allowed.some(([p]) => p === chosen) && chosen !== 'kit' ? chosen : allowed[0][0]

  const accept = async (files: FileList | null) => {
    setError(null)
    if (!files?.length) return
    const file = files[0]
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) return setError('That file type is not supported. Upload a PNG, JPG, SVG or WebP image.')
    if (file.size > 15 * 1024 * 1024) return setError('That file is over 15 MB. Export a smaller version and try again.')
    if (logos.length >= MAX_LOGOS) return setError(`You can add up to ${MAX_LOGOS} logos. Remove one to add another.`)
    try {
      const src = await prepareImage(file)
      await loadImage(src)
      const id = newId()
      addLayer({ id, kind: 'image', logo: true, src, name: file.name, panel: target, x: 0.5, y: 0.5, size: 0.25, rotation: 0, opacity: 1, fill: '#ffffff' })
      select(id)
    } catch {
      return setError('We could not read that image. Try exporting it again as PNG.')
    }
    if (input.current) input.current.value = ''
  }

  return (
    <>
      <StepHead title="Logos" lead="Add sponsor, team or shop logos, then drag them anywhere on the template. Use the corner handle to resize." />
      <div className="group">
        <label
          className={`upload ${drag ? 'drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            accept(e.dataTransfer.files)
          }}
        >
          <Icon name="upload" size={28} />
          <b>Upload a logo</b>
          <small>PNG with a transparent background or SVG works best. It goes on the {panelName(target).toLowerCase()} first.</small>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="sr-only"
            onChange={(e) => accept(e.target.files)}
            aria-describedby={error ? 'logo-error' : undefined}
          />
        </label>
        {error && (
          <p className="error" id="logo-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {logos.length > 0 && (
        <div className="group">
          <div className="group-label">
            Your logos{' '}
            <span>
              {logos.length} of {MAX_LOGOS}
            </span>
          </div>
          {logos.map((l) => (
            <div className="logo-row" key={l.id}>
              <img src={l.src} alt={l.name} />
              <select
                className="select"
                value={l.panel}
                onChange={(e) => {
                  const p = e.target.value as LayerPanel
                  updateLayer(l.id, { panel: p, x: 0.5, y: 0.5 })
                  setPanel(p)
                  select(l.id)
                }}
                aria-label={`Panel for ${l.name}`}
              >
                {allowed.map(([p, name]) => (
                  <option key={p} value={p}>
                    {name}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={() => (select(l.id), setStep(3))} aria-label={`Edit ${l.name}`} title="Size, rotation and more">
                <Icon name="layers" size={18} />
              </button>
              <button className="icon-btn" onClick={() => removeLayer(l.id)} aria-label={`Remove ${l.name}`}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="note">We check every logo before printing and will contact you if a file needs replacing. Logos are free to add.</p>
    </>
  )
}

function ExtrasStep() {
  const { config, set, toggleExtra } = useConfig()
  const bike = bikeById(config.bikeId)
  return (
    <>
      <StepHead title="Kit & finish" lead="Everything is fully custom. Choose the finish and any extras." />
      <div className="group">
        <div className="group-label">Your kit</div>
        <div className="option" aria-pressed="true" role="note">
          <span>
            <b>{kitPrice(config.kit, bike.type).label}</b>
            <small>{platesOnly(config) ? PLATES_PARTS : KIT_PARTS}</small>
          </span>
          <span className="price">{formatAED(kitPrice(config.kit, bike.type).price)}</span>
        </div>
      </div>
      <div className="group">
        <div className="group-label">Finish</div>
        <div className="options">
          {(Object.keys(FINISHES) as FinishId[]).map((f) => (
            <button key={f} className="option" aria-pressed={config.finish === f} onClick={() => set({ finish: f })}>
              <span>
                <b>{FINISHES[f].label}</b>
                <small>{FINISHES[f].note}</small>
              </span>
              <span className="price">{FINISHES[f].price ? `+ ${formatAED(FINISHES[f].price)}` : 'Included'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">Material</div>
        <div className="options">
          {(Object.keys(MATERIALS) as MaterialId[]).map((m) => (
            <button key={m} className="option" aria-pressed={config.material === m} onClick={() => set({ material: m })}>
              <span>
                <b>{MATERIALS[m].label}</b>
                <small>{MATERIALS[m].note}</small>
              </span>
              <span className="price">{MATERIALS[m].price ? `+ ${formatAED(MATERIALS[m].price)}` : 'Included'}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">Extras</div>
        <div className="options">
          {(Object.keys(EXTRAS) as ExtraId[]).map((x) => {
            const on = config.extras.includes(x)
            return (
              <button key={x} className="option" role="checkbox" aria-checked={on} onClick={() => toggleExtra(x)}>
                <span className="tick" aria-hidden="true">
                  {on && <Icon name="check" size={14} />}
                </span>
                <span style={{ marginRight: 'auto' }}>
                  <b>{EXTRAS[x].label}</b>
                  <small>{EXTRAS[x].note}</small>
                </span>
                <span className="price">+ {formatAED(EXTRAS[x].price)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function ReviewStep({ onToast, onShare }: { onToast: (s: string) => void; onShare: () => void }) {
  const { config, set } = useConfig()
  const [approved, setApproved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bike = bikeById(config.bikeId)

  useEffect(() => {
    if (!demo) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDemo(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [demo])
  const lines = priceLines(priceInput(config))
  const total = priceTotal(priceInput(config))

  const downloadProof = async () => {
    await ensureAssets(config)
    const W = 1600
    const out = document.createElement('canvas')
    out.width = W
    out.height = 1900
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#efece3'
    ctx.fillRect(0, 0, W, out.height)
    for (const [i, side] of (['right', 'left'] as const).entries()) {
      const c = document.createElement('canvas')
      c.width = W - 120
      c.height = Math.round((W - 120) * 0.56)
      drawProof(c, config, side)
      ctx.drawImage(c, 60, 140 + i * (c.height + 80))
      ctx.fillStyle = '#3a3a33'
      ctx.font = '700 22px Saira'
      ctx.fillText(`${side.toUpperCase()} SIDE`, 60, 130 + i * (c.height + 80))
    }
    ctx.fillStyle = '#101010'
    ctx.font = 'italic 800 64px "Saira Extra Condensed"'
    ctx.fillText('CACTUS DECAL LAB · PROOF', 60, 90)
    ctx.font = '500 26px Saira'
    const rows = [
      `${bike.make} ${bike.model} (${bike.years})`,
      `Design: ${designById(config.designId).name} · Finish: ${FINISHES[config.finish].label} · ${MATERIALS[config.material].label}`,
      `Name: ${config.rider.name || '-'} · Number: ${config.rider.number || '-'}`,
      `Total: ${formatAED(total)}`,
    ]
    rows.forEach((r, i) => ctx.fillText(r, 60, 1700 + i * 44))
    const a = document.createElement('a')
    a.href = out.toDataURL('image/png')
    a.download = `cactus-decal-lab-proof-${config.rider.number || 'kit'}.png`
    a.click()
    onToast('Proof downloaded')
  }

  const checkout = async () => {
    setBusy(true)
    setError(null)
    try {
      const { logos, layers, ...rest } = config
      // Upload logos and photos one by one first (keeps each request small).
      const upload = async (dataUrl: string, name: string) => {
        const up = await fetch('/api/logo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        })
        if (up.status === 404 || up.status === 405 || !up.headers.get('content-type')?.includes('json')) return null
        const j = await up.json()
        if (!up.ok) throw new Error(`${name}: ${j.error ?? 'upload failed'}`)
        return j.path as string
      }
      const stored: { name: string; slot: string; path: string }[] = []
      for (const l of logos) {
        const path = await upload(l.src, l.name)
        if (!path) return setDemo(true)
        stored.push({ name: l.name, slot: l.slot, path })
      }
      const storedLayers = []
      for (const l of layers) {
        if (l.kind !== 'image' || !l.src) {
          storedLayers.push(l)
          continue
        }
        const path = await upload(l.src, l.name ?? 'Photo')
        if (!path) return setDemo(true)
        storedLayers.push({ ...l, src: undefined, path })
      }
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: { ...rest, layers: storedLayers },
          logos: stored,
          share: encodeConfig(config),
        }),
      })
      if (res.status === 404 || res.status === 405 || !res.headers.get('content-type')?.includes('json')) {
        setDemo(true)
        return
      }
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Checkout failed')
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? `${e.message}. Please try again, or message us on WhatsApp.` : 'Checkout failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <StepHead title="Review" lead="Check your proof carefully. This is what we print." />
      <div className="group proofs">
        <figure>
          <ProofCanvas cfg={config} side="right" width={720} label="Right side proof" />
          <figcaption>Right side</figcaption>
        </figure>
        <figure>
          <ProofCanvas cfg={config} side="left" width={720} label="Left side proof" />
          <figcaption>Left side</figcaption>
        </figure>
      </div>
      <div className="group">
        <table className="summary">
          <tbody>
            <tr>
              <th scope="row">Bike</th>
              <td colSpan={2}>
                {bike.make} {bike.model}, {bike.years}
              </td>
            </tr>
            <tr>
              <th scope="row">Design</th>
              <td colSpan={2}>{designById(config.designId).name}</td>
            </tr>
            <tr>
              <th scope="row">Rider</th>
              <td colSpan={2}>
                {config.rider.name || '-'} #{config.rider.number || '-'}
              </td>
            </tr>
            <tr>
              <th scope="row">Logos</th>
              <td colSpan={2}>{config.logos.length ? config.logos.map((l) => l.name).join(', ') : 'None'}</td>
            </tr>
            {lines.map((l) => (
              <tr key={l.label}>
                <th scope="row">{l.label}</th>
                <td />
                <td className="amt">{formatAED(l.amount)}</td>
              </tr>
            ))}
            <tr className="total">
              <th scope="row">Total</th>
              <td />
              <td className="amt">{formatAED(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="group field">
        <label htmlFor="notes">Notes for our designers (optional)</label>
        <textarea
          id="notes"
          className="textarea"
          value={config.notes}
          maxLength={400}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="e.g. aftermarket plastics, logo spelling, delivery timing"
        />
      </div>
      <label className="check">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
        <span>I have checked my name, number, logos and colours. I understand you'll send a final proof before printing.</span>
      </label>
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} disabled={!approved || busy} onClick={checkout} aria-busy={busy}>
        <Icon name="lock" size={18} /> {busy ? 'Opening secure checkout…' : `Pay ${formatAED(total)}`}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="review-actions">
        <button className="btn btn-ghost btn-sm" onClick={downloadProof}>
          <Icon name="download" size={16} /> Download proof
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onShare}>
          <Icon name="share" size={16} /> Save link
        </button>
      </div>
      <p className="note">Secure payment by Stripe. Card, Apple Pay and Google Pay accepted.</p>
      <AnimatePresence>
        {demo && (
          <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDemo(false)}>
            <motion.div
              className="dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="demo-title"
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="demo-title">Preview mode</h2>
              <p>Payments aren't connected on this preview. Once the site is deployed with your Stripe keys, this button opens a secure Stripe checkout for {formatAED(total)}.</p>
              <div className="actions">
                <button className="btn btn-primary btn-sm" onClick={() => setDemo(false)} autoFocus>
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
