import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import AppLink from '../components/AppLink'
import { Header } from '../components/Chrome'
import Icon from '../components/Icon'
import ModelEditor from '../components/ModelEditor'
import PieceMapper from '../components/PieceMapper'
import { designPreview, LazyStage, ProofCanvas } from '../components/bits'
import { BIKES, MAKES, bikeById, type Make } from '../data/bikes'
import { DESIGNS, designById, type DesignId, type LogoSlot } from '../data/designs'
import { formatAED } from '../data/pricing'
import { ensureAssets } from '../lib/graphics'
import { buildPrintSvg, downloadText } from '../lib/printSvg'
import { decodeConfig, encodeConfig } from '../lib/share'
import { loadTemplates, parseTemplate, useTemplates, type BikeTemplate } from '../lib/templates'
import { defaultConfig, type KitConfig } from '../store/config'

type Mode = 'online' | 'offline'
const PW_KEY = 'cdl-admin-pw'

function readPw() {
  try {
    return sessionStorage.getItem(PW_KEY) ?? ''
  } catch {
    return ''
  }
}

async function api(path: string, pw: string, init: RequestInit = {}) {
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), 'x-admin-password': pw, 'Content-Type': 'application/json' } })
  const isJson = res.headers.get('content-type')?.includes('json')
  if (!isJson && (res.status === 404 || res.status === 405 || res.ok)) throw Object.assign(new Error('offline'), { offline: true })
  return res
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.readAsDataURL(b)
  })

export default function Admin() {
  const [pw, setPw] = useState(readPw)
  const [mode, setMode] = useState<Mode | null>(null)
  const [tab, setTab] = useState<'templates' | 'orders'>('templates')

  useEffect(() => {
    document.title = 'Admin · Cactus Decal Lab'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  return (
    <>
      <Header solid />
      <main className="admin" id="main">
        <div className="container">
          {!mode ? (
            <Gate
              initial={pw}
              onOk={(p, m) => {
                setPw(p)
                setMode(m)
                try {
                  sessionStorage.setItem(PW_KEY, p)
                } catch {
                  /* private mode */
                }
              }}
            />
          ) : (
            <>
              <div className="admin-head">
                <div>
                  <span className="eyebrow">Team area</span>
                  <h1 className="display">Workshop</h1>
                </div>
                <div className="chips" role="tablist" aria-label="Admin sections">
                  <button className="chip" role="tab" aria-selected={tab === 'templates'} aria-pressed={tab === 'templates'} onClick={() => setTab('templates')}>
                    Bike templates
                  </button>
                  <button className="chip" role="tab" aria-selected={tab === 'orders'} aria-pressed={tab === 'orders'} onClick={() => setTab('orders')}>
                    Orders & print files
                  </button>
                </div>
              </div>
              {mode === 'offline' && (
                <p className="note" role="status">
                  Preview mode: there is no server here, so uploads stay in this browser tab and orders are not available. Everything works for
                  real once the site is deployed with storage connected.
                </p>
              )}
              {tab === 'templates' ? <Templates pw={pw} mode={mode} /> : <Orders pw={pw} mode={mode} />}
            </>
          )}
        </div>
      </main>
    </>
  )
}

function Gate({ initial, onOk }: { initial: string; onOk: (pw: string, m: Mode) => void }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api('/api/admin?op=ping', value)
      if (res.ok) onOk(value, 'online')
      else setError(res.status === 401 ? 'That password is not right.' : 'The server could not be reached. Try again.')
    } catch (err) {
      if ((err as { offline?: boolean }).offline) onOk(value, 'offline')
      else setError('The server could not be reached. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="gate" onSubmit={submit}>
      <span className="eyebrow">Team area</span>
      <h1 className="display">Workshop login</h1>
      <div className="field" style={{ marginTop: 24 }}>
        <label htmlFor="admin-pw">Admin password</label>
        <input
          id="admin-pw"
          className="input"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'pw-error' : undefined}
          required
        />
        {error && (
          <p className="error" id="pw-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }} disabled={busy} aria-busy={busy}>
        {busy ? 'Checking…' : 'Enter'}
      </button>
    </form>
  )
}

// ---------------- Templates ----------------

interface Draft {
  template: BikeTemplate
  warnings: string[]
}

function Templates({ pw, mode }: { pw: string; mode: Mode }) {
  const templates = useTemplates((s) => s.templates)
  const [published, setPublished] = useState<Record<string, BikeTemplate>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [make, setMake] = useState<Make>('KTM')
  const [selected, setSelected] = useState(BIKES[0].id)
  const [designId, setDesignId] = useState<DesignId>('factory')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadTemplates().then(() => setPublished({ ...useTemplates.getState().templates }))
  }, [])

  const upload = async (bikeId: string, file: File | undefined) => {
    setMsg(null)
    if (!file) return
    if (!/svg/.test(file.type) && !file.name.toLowerCase().endsWith('.svg')) return setMsg({ kind: 'error', text: 'Please upload an SVG file (in Illustrator: File › Save As › SVG).' })
    if (file.size > 4 * 1024 * 1024) return setMsg({ kind: 'error', text: 'That SVG is over 4 MB. Remove embedded images or hidden layers and export again.' })
    try {
      const { template, warnings } = parseTemplate(await file.text(), bikeId, file.name)
      useTemplates.getState().put(template)
      setDrafts((d) => ({ ...d, [bikeId]: { template, warnings } }))
      setSelected(bikeId)
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not read that SVG.' })
    }
  }

  const discard = (bikeId: string) => {
    setDrafts(({ [bikeId]: _gone, ...rest }) => rest)
    const prev = published[bikeId]
    if (prev) useTemplates.getState().put(prev)
    else useTemplates.getState().remove(bikeId)
  }

  const publish = async (bikeId: string) => {
    const draft = drafts[bikeId]
    if (!draft) return
    setBusy(true)
    setMsg(null)
    try {
      const { svgText, ...meta } = draft.template
      const res = await api('/api/templates', pw, { method: 'POST', body: JSON.stringify({ template: meta, svgText }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Publish failed')
      setPublished((p) => ({ ...p, [bikeId]: draft.template }))
      setDrafts(({ [bikeId]: _gone, ...rest }) => rest)
      setMsg({ kind: 'ok', text: `${bikeLabel(bikeId)} template is live in the configurator.` })
    } catch (e) {
      setMsg({ kind: 'error', text: (e as { offline?: boolean }).offline ? 'Publishing needs the live server. In this preview the template only applies in this tab.' : e instanceof Error ? e.message : 'Publish failed' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (bikeId: string) => {
    if (!confirm(`Remove the template for ${bikeLabel(bikeId)}? The configurator goes back to the built-in shape.`)) return
    setBusy(true)
    try {
      const res = await api(`/api/templates?bikeId=${bikeId}`, pw, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Remove failed')
      setPublished(({ [bikeId]: _gone, ...rest }) => rest)
      useTemplates.getState().remove(bikeId)
      setMsg({ kind: 'ok', text: 'Template removed.' })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Remove failed' })
    } finally {
      setBusy(false)
    }
  }

  const testPrint = async (bikeId: string) => {
    const cfg = { ...designPreview(designId), bikeId }
    const t = templates[bikeId]
    let svgText = t?.svgText
    if (t && !svgText && mode === 'online') {
      const res = await api(`/api/admin?op=file&path=templates/${bikeId}.svg`, pw)
      if (res.ok) svgText = await res.text()
    }
    await ensureAssets(cfg)
    const file = await buildPrintSvg(cfg, t ? { ...t, svgText } : undefined)
    downloadText(file.svg, file.fileName)
  }

  const cfg = useMemo(() => ({ ...designPreview(designId), bikeId: selected }), [designId, selected])
  const draft = drafts[selected]
  const status = (id: string) => (drafts[id] ? 'Draft' : published[id]?.svgUrl ? 'Published' : published[id] ? 'Outline only' : 'Built-in shape')

  return (
    <div className="admin-grid">
      <section aria-label="Bike models">
        <TemplateGuide />
        <div className="chips" style={{ margin: '20px 0 12px' }}>
          {MAKES.map((m) => (
            <button key={m.make} className="chip" aria-pressed={make === m.make} onClick={() => setMake(m.make)}>
              {m.make}
            </button>
          ))}
        </div>
        <ul className="model-list">
          {BIKES.filter((b) => b.make === make).map((b) => (
            <li key={b.id} className={selected === b.id ? 'active' : ''}>
              <button className="model-pick" onClick={() => setSelected(b.id)} aria-pressed={selected === b.id}>
                <b>{b.model}</b>
                <small>{b.years}</small>
              </button>
              <span className={`badge ${status(b.id).replace(/\s.*/, '').toLowerCase()}`}>{status(b.id)}</span>
              <label className="btn btn-ghost btn-sm">
                <Icon name="upload" size={16} /> {published[b.id] || drafts[b.id] ? 'Replace' : 'Upload'} SVG
                <input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={(e) => upload(b.id, e.target.files?.[0])} />
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-preview" aria-label="Template preview">
        <div className="admin-preview-head">
          <div>
            <h2>{bikeLabel(selected)}</h2>
            <small>{draft ? `Draft from ${draft.template.fileName}, not published yet` : published[selected] ? `Published: ${published[selected].fileName}` : 'Using the built-in shape'}</small>
          </div>
          <select className="select" style={{ width: 'auto' }} value={designId} onChange={(e) => setDesignId(e.target.value as DesignId)} aria-label="Preview design">
            {DESIGNS.filter((d) => !d.hidden).map((d) => (
              <option key={d.id} value={d.id}>
                Preview: {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-stage">
          <LazyStage cfg={cfg} view="three-quarter" />
        </div>
        <div className="proofs" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <figure>
            <ProofCanvas cfg={cfg} side="right" width={560} label="Right side" />
            <figcaption>Right side</figcaption>
          </figure>
          <figure>
            <ProofCanvas cfg={cfg} side="left" width={560} label="Left side" />
            <figcaption>Left side</figcaption>
          </figure>
        </div>
        {draft && (
          <PieceMapper
            template={draft.template}
            onChange={(t) => {
              useTemplates.getState().put(t)
              setDrafts((d) => ({ ...d, [selected]: { ...d[selected], template: t } }))
            }}
          />
        )}
        {(draft?.template ?? templates[selected]) && (
          <ModelEditor
            template={(draft?.template ?? templates[selected])!}
            pw={pw}
            online={mode === 'online'}
            onChange={(t) => {
              useTemplates.getState().put(t)
              setDrafts((d) => ({ ...d, [selected]: { template: t, warnings: d[selected]?.warnings ?? [] } }))
            }}
          />
        )}
        {draft && draft.warnings.length > 0 && (
          <div className="note">
            {draft.warnings.map((w) => (
              <p key={w} style={{ marginTop: 6 }}>
                {w}
              </p>
            ))}
          </div>
        )}
        <AnimatePresence>
          {msg && (
            <motion.p className={msg.kind === 'error' ? 'error' : 'ok'} role={msg.kind === 'error' ? 'alert' : 'status'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {msg.text}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="review-actions">
          {draft && (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => publish(selected)} disabled={busy}>
                <Icon name="check" size={16} /> Publish template
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => discard(selected)}>
                Discard draft
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => testPrint(selected)}>
            <Icon name="download" size={16} /> Test print file (.svg)
          </button>
          {!draft && published[selected] && (
            <button className="btn btn-ghost btn-sm" onClick={() => remove(selected)} disabled={busy}>
              <Icon name="trash" size={16} /> Remove
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

const bikeLabel = (id: string) => {
  const b = bikeById(id)
  return `${b.make} ${b.model} ${b.years}`
}

function TemplateGuide() {
  return (
    <details className="guide">
      <summary>
        <Icon name="layers" size={18} /> How to prepare a template SVG
        <Icon name="chevron" size={18} />
      </summary>
      <ol>
        <li>Upload your normal cut file for the model, exactly as you print it: the bike’s right side on the left half, the left side mirrored on the right half, front plate and front fender in the middle.</li>
        <li>No layer names are needed. Each filled shape becomes a piece, and the shroud, side plate, rear fender, front fender and front plate are found automatically.</li>
        <li>Check the coloured piece map. If a piece is wrong, click it and pick what it is and which side it belongs to. Small trim pieces can stay as “Other piece”: they’re printed with the pattern but have no lettering.</li>
        <li>Check the 3D bike and the proofs, download a test print file, then publish.</li>
        <li>In Illustrator use File › Save As › SVG. Pink cut-line copies on top of the filled pieces are fine.</li>
      </ol>
    </details>
  )
}

// ---------------- Orders ----------------

interface Order {
  id: string
  createdAt: string
  sessionId?: string
  paymentStatus?: string
  customer?: { name?: string; email?: string; phone?: string }
  config: Omit<KitConfig, 'logos' | 'layers'> & { logos: { name: string; slot: LogoSlot; path: string }[]; layers?: (KitConfig['layers'][number] & { path?: string })[] }
  total: number
}

function Orders({ pw, mode }: { pw: string; mode: Mode }) {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'online') return
    api('/api/admin?op=orders', pw)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error)
        setOrders(j.orders)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load orders'))
  }, [pw, mode])

  const fileFor = async (cfg: KitConfig) => {
    await loadTemplates()
    const t = useTemplates.getState().templates[cfg.bikeId]
    let svgText = t?.svgText
    if (t && !svgText && mode === 'online') {
      const res = await api(`/api/admin?op=file&path=templates/${cfg.bikeId}.svg`, pw)
      if (res.ok) svgText = await res.text()
    }
    await ensureAssets(cfg)
    return await buildPrintSvg(cfg, t ? { ...t, svgText } : undefined)
  }

  const printOrder = async (o: Order) => {
    setWorking(o.id)
    try {
      const logos = await Promise.all(
        o.config.logos.map(async (l, i) => {
          const r = await api(`/api/admin?op=file&path=${encodeURIComponent(l.path)}`, pw)
          return { id: String(i), name: l.name, slot: l.slot, src: await blobToDataUrl(await r.blob()) }
        }),
      )
      // Customer photos are stored separately; bring them back into the design.
      const layers = await Promise.all(
        (o.config.layers ?? []).map(async ({ path, ...l }) => {
          if (!path) return l
          const r = await api(`/api/admin?op=file&path=${encodeURIComponent(path)}`, pw)
          return { ...l, src: await blobToDataUrl(await r.blob()) }
        }),
      )
      const cfg: KitConfig = { ...defaultConfig(), ...o.config, logos, layers }
      const file = await fileFor(cfg)
      downloadText(file.svg, `${o.id}-${file.fileName}`)
    } finally {
      setWorking(null)
    }
  }

  const fromLink = async () => {
    setLinkError(null)
    const code = /[?&]d=([^&#]+)/.exec(link)?.[1] ?? link.trim()
    const cfg = decodeConfig(code)
    if (!cfg) return setLinkError('That does not look like a design link. Copy the full link from the configurator’s Share button.')
    const file = await fileFor(cfg)
    downloadText(file.svg, file.fileName)
  }

  return (
    <div className="orders">
      <section className="order-tool">
        <h2>Print file from a design link</h2>
        <p className="lead">Paste a customer’s saved design link to download its Illustrator-ready SVG. Uploaded logos are not part of links.</p>
        <div className="row-inline">
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/configurator?d=…" aria-label="Design link" aria-describedby={linkError ? 'link-error' : undefined} />
          <button className="btn btn-primary btn-sm" onClick={fromLink} disabled={!link.trim()}>
            <Icon name="download" size={16} /> Print file
          </button>
        </div>
        {linkError && (
          <p className="error" id="link-error" role="alert">
            {linkError}
          </p>
        )}
      </section>

      <h2 style={{ marginTop: 40 }}>Orders</h2>
      {mode !== 'online' && <p className="lead">Orders appear here once the site is live with Stripe and storage connected.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {mode === 'online' && !orders && !error && <p className="lead">Loading orders…</p>}
      {orders && orders.length === 0 && <p className="lead">No orders yet.</p>}
      <ul className="order-list">
        {orders?.map((o) => {
          const bike = bikeById(o.config.bikeId)
          const paid = o.paymentStatus === 'paid'
          return (
            <li key={o.id}>
              <div>
                <b>{o.id}</b>
                <span className={`badge ${paid ? 'published' : 'draft'}`}>{paid ? 'Paid' : o.paymentStatus === 'unpaid' ? 'Not paid' : o.paymentStatus ?? 'Checkout started'}</span>
                <small>{new Date(o.createdAt).toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' })}</small>
              </div>
              <div>
                {bike.make} {bike.model} · {designById(o.config.designId).name} · {o.config.rider.name} #{o.config.rider.number}
                <small>
                  {o.customer?.name ?? ''} {o.customer?.phone ?? ''} {o.customer?.email ?? ''}
                </small>
              </div>
              <div className="amt">{formatAED(o.total)}</div>
              <div className="review-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-primary btn-sm" onClick={() => printOrder(o)} disabled={working === o.id} aria-busy={working === o.id}>
                  <Icon name="download" size={16} /> {working === o.id ? 'Building…' : 'Print file'}
                </button>
                <AppLink className="btn btn-ghost btn-sm" to={`/configurator?d=${encodeConfig({ ...defaultConfig(), ...o.config, logos: [], layers: (o.config.layers ?? []).filter((l) => !l.path) })}`} target="_blank">
                  Open design
                </AppLink>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
