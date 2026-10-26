import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Contours, Header } from '../components/Chrome'
import DesignStep from '../components/DesignStep'
import { sideOutlines, useAvailableBikes, useTemplates } from '../lib/templates'
import TemplateDesigner from '../components/TemplateDesigner'
import Icon from '../components/Icon'
import { AnimatedNumber, LazyStage } from '../components/bits'
import { BIKES, MAKES, bikeById, typeLabel, type Make } from '../data/bikes'
import { CONTACT } from '../data/site'
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
  formatAED,
  priceLines,
  priceTotal,
  type ExtraId,
  type FinishId,
  type MaterialId,
} from '../data/pricing'
import { decodeConfig, encodeConfig } from '../lib/share'
import { ensureAssets, loadImage } from '../lib/graphics'
import { STEPS, platesOnly, priceInput, useConfig, type PlasticsId } from '../store/config'
import type { StageApi, View } from '../three/Stage'

const STEP_VIEW: View[] = ['three-quarter', 'right', 'three-quarter', 'three-quarter']
const VIEW_BUTTONS: [View, string][] = [
  ['three-quarter', '3/4'],
  ['right', 'Right'],
  ['left', 'Left'],
  ['front', 'Front'],
  ['rear', 'Rear'],
  ['top', 'Top'],
]

export default function Configurator() {
  const { config, step, setStep, load } = useConfig()
  const [params] = useSearchParams()
  const [view, setView] = useState<View>(STEP_VIEW[0])
  const [toast, setToast] = useState<string | null>(null)
  const stageApi = useRef<StageApi | null>(null)
  const bike = bikeById(config.bikeId)
  const total = priceTotal(priceInput(config))

  // Deep links: ?d=<code> restores a saved kit, ?kit=plates starts a
  // number-plates-only order.
  useEffect(() => {
    const d = params.get('d')
    const kit = params.get('kit')
    if (kit === 'plates' || kit === 'full') useConfig.getState().set({ kit })
    if (d) {
      const c = decodeConfig(d)
      if (c) load(c)
    }
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Only bikes with a print template can be designed: move off any other.
  const available = useAvailableBikes()
  useEffect(() => {
    if (available.length && !available.some((b) => b.id === config.bikeId)) useConfig.getState().set({ bikeId: available[0].id })
  }, [available, config.bikeId])

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
    a.download = `cactus-decal-lab-${bike.make}-${bike.model}.png`.toLowerCase().replace(/[^a-z0-9.-]+/g, '-')
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
                  key={bike.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="display">{bike.make}</div>
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
                {step === 2 && <ExtrasStep />}
                {step === 3 && <ReviewStep onToast={setToast} onShare={share} />}
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

// A small side view of a model's kit: its printed pieces as they sit on the
// right side of the bike, so customers can recognise their plastics.
function TemplateThumb({ bikeId }: { bikeId: string }) {
  const t = useTemplates((s) => s.templates[bikeId])
  const paths = useMemo(() => {
    if (!t) return null
    const outlines = sideOutlines(t, 'right')
    if (!outlines.length) return null
    const pts = outlines.flat()
    const x0 = Math.min(...pts.map((p) => p[0]))
    const x1 = Math.max(...pts.map((p) => p[0]))
    const y0 = Math.min(...pts.map((p) => p[1]))
    const y1 = Math.max(...pts.map((p) => p[1]))
    // World y points up; SVG y points down.
    const d = outlines.map((o) => {
      const step = Math.max(1, Math.floor(o.length / 90))
      return `M${o.filter((_, i) => i % step === 0).map(([x, y]) => `${(x - x0).toFixed(3)},${(y1 - y).toFixed(3)}`).join('L')}Z`
    })
    return { box: `0 0 ${(x1 - x0).toFixed(3)} ${(y1 - y0).toFixed(3)}`, d }
  }, [t])
  if (!paths) return <span className="bike-thumb" aria-hidden="true" />
  return (
    <svg className="bike-thumb" viewBox={paths.box} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {paths.d.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

// "2019–2022" covers 2020: lets customers search by their bike's year.
const coversYear = (years: string, y: number) => {
  const [a, b] = years.split(/[–-]/).map((v) => parseInt(v, 10))
  return y >= a && y <= (b || a)
}

function BikeStep() {
  const { config, set } = useConfig()
  const current = bikeById(config.bikeId)
  const [make, setMake] = useState<Make>(current.make)
  const [query, setQuery] = useState('')
  const [showSoon, setShowSoon] = useState(false)
  const available = useAvailableBikes()
  const ready = (id: string) => available.some((b) => b.id === id)
  const q = query.trim().toLowerCase()
  const year = /^\d{4}$/.test(q) ? Number(q) : null
  const matches = (b: (typeof BIKES)[number]) => !q || (year ? coversYear(b.years, year) : `${b.model} ${b.years}`.toLowerCase().includes(q))
  const ofMake = BIKES.filter((b) => b.make === make && matches(b))
  const models = ofMake.filter((b) => ready(b.id))
  const soon = ofMake.filter((b) => !ready(b.id))
  const groups = (['MX', 'Trail'] as const).map((type) => ({ type, list: models.filter((b) => b.type === type) })).filter((g) => g.list.length)
  const request = (b: { make: string; model: string; years: string }) =>
    `https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Cactus Decal Lab, I'd like a custom kit for my ${b.make} ${b.model} (${b.years}).`)}`
  return (
    <>
      <StepHead title="Your bike" lead="Pick your brand, then your model and year. Every piece is cut from that model's real print template." />
      <div className="bike-current" aria-live="polite">
        <TemplateThumb bikeId={current.id} />
        <span>
          <small>Designing for</small>
          <b>
            {current.make} {current.model}
          </b>
          <small>
            {current.years} · {typeLabel(current.type)}
          </small>
        </span>
      </div>
      <div className="group">
        <div className="group-label">1 · Brand</div>
        <div className="chips">
          {MAKES.map((m) => {
            const n = available.filter((b) => b.make === m.make).length
            return (
              <button
                key={m.make}
                className={`chip${n ? '' : ' chip-soon'}`}
                aria-pressed={make === m.make}
                onClick={() => {
                  setMake(m.make)
                  setQuery('')
                  const first = available.find((b) => b.make === m.make)
                  if (first && current.make !== m.make) set({ bikeId: first.id })
                }}
              >
                {m.make}
                <small className={n ? 'count' : 'soon'}> {n ? n : 'soon'}</small>
              </button>
            )
          })}
        </div>
      </div>
      <div className="group">
        <div className="group-label">
          2 · Model & year <span>{models.length ? `${models.length} available` : ''}</span>
        </div>
        <label className="bike-search">
          <Icon name="search" size={16} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${make} models, e.g. 450 or 2021`} aria-label={`Search ${make} models`} />
        </label>
        {groups.map((g) => (
          <div key={g.type} className="bike-group">
            <div className="bike-type">{g.type === 'MX' ? 'Motocross' : 'Enduro, trail & adventure'}</div>
            <div className="options">
              {g.list.map((b) => (
                <button key={b.id} className="option bike-option" aria-pressed={config.bikeId === b.id} onClick={() => set({ bikeId: b.id })}>
                  <TemplateThumb bikeId={b.id} />
                  <span>
                    <b>{b.model}</b>
                    <small>
                      <i className="years">{b.years}</i> {formatAED(kitPrice(config.kit, b.type).price)}
                    </small>
                  </span>
                  {config.bikeId === b.id && <Icon name="check" />}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!models.length && <p className="note">{q ? `No ${make} model matches “${query}”.` : `No ${make} templates yet.`} Ask us below and we'll add yours.</p>}
        {soon.length > 0 && (
          <div className="bike-soon">
            <button className="link-btn" onClick={() => setShowSoon(!showSoon)} aria-expanded={showSoon || !models.length}>
              {showSoon || !models.length ? 'Hide' : 'Show'} models without a template yet ({soon.length})
            </button>
            {(showSoon || !models.length) && (
              <div className="options">
                {soon.map((b) => (
                  <div key={b.id} className="option soon-option">
                    <span>
                      <b>{b.model}</b>
                      <small>{b.years} · Template coming soon</small>
                    </span>
                    <a className="chip chip-sm" href={request(b)} target="_blank" rel="noreferrer">
                      Request
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="group">
        <div className="group-label">3 · What are you designing?</div>
        <div className="options">
          {(
            [
              ['full', KIT_PRICES[current.type].label.replace('Custom ', 'Full '), KIT_PARTS, KIT_PRICES[current.type].price],
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
  // The design on the model's real print template (the file we print from).
  const template = useTemplates((s) => s.templates[config.bikeId])
  const [proof, setProof] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let url: string | null = null
    setProof(null)
    ensureAssets(config)
      // Loaded when needed: it brings the font outlines with it.
      .then(() => import('../lib/printSvg'))
      .then((m) => m.buildPrintSvg(config, template, { info: false }))
      .then((f) => {
        if (!alive) return
        url = URL.createObjectURL(new Blob([f.svg], { type: 'image/svg+xml' }))
        setProof(url)
      })
      .catch(() => alive && setProof(null))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [config, template])

  const downloadProof = async () => {
    if (!proof) return
    const img = await loadImage(proof)
    const W = 2400
    const H = Math.round((W * img.naturalHeight) / img.naturalWidth)
    const out = document.createElement('canvas')
    out.width = W
    out.height = H + 220
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, out.height)
    ctx.fillStyle = '#101010'
    ctx.font = 'italic 800 72px "Saira Extra Condensed"'
    ctx.fillText('CACTUS DECAL LAB · PROOF', 60, 100)
    ctx.font = '500 32px Saira'
    ctx.fillText(`${bike.make} ${bike.model} (${bike.years}) · ${FINISHES[config.finish].label} · ${MATERIALS[config.material].label} · ${formatAED(total)}`, 60, 160)
    ctx.drawImage(img, 0, 200, W, H)
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
      <div className="group">
        <figure className="template-proof">
          {proof ? <img src={proof} alt={`Print template of your design for the ${bike.make} ${bike.model}`} /> : <div className="proof-wait">Preparing your print template…</div>}
          <figcaption>Your design on the {bike.make} print template, as it will be printed and cut (pink lines).</figcaption>
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
