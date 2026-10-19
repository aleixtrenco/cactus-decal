import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import AppLink from '../components/AppLink'
import { CactusSpines, Contours, Footer, Header } from '../components/Chrome'
import Icon, { type IconName } from '../components/Icon'
import { designPreview, LazyStage, ProofCanvas, Reveal } from '../components/bits'
import { MAKES } from '../data/bikes'
import { useAvailableBikes } from '../lib/templates'
import { DESIGNS, PRESETS } from '../data/designs'
import { FINISHES, formatAED, KIT_PARTS, KIT_PRICES, PLATES_KIT, PLATES_PARTS, type FinishId } from '../data/pricing'
import { FAQ } from '../data/site'

const HERO_BIKE = 'husq-tcfc-16'
const HERO_ROTATION = ['shamal', 'saguaro', 'falcon', 'dune', 'hex'] as const

function Hero() {
  const available = useAvailableBikes()
  const [i, setI] = useState(0)
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const finePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches

  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setI((n) => (n + 1) % HERO_ROTATION.length), 4200)
    return () => clearInterval(t)
  }, [reduce])

  const id = HERO_ROTATION[i]
  // The hero shows the real Husqvarna model.
  const cfg = useMemo(() => ({ ...designPreview(id), bikeId: HERO_BIKE }), [id])
  const name = DESIGNS.find((d) => d.id === id)!.name

  const line = {
    hidden: { y: '105%' },
    show: (k: number) => ({ y: 0, transition: { delay: 0.15 + k * 0.09, duration: 0.9, ease: [0.22, 1, 0.36, 1] as const } }),
  }

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-bg" />
      <Contours />
      <div className="container hero-grid">
        <div className="hero-copy">
          <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            Custom MX graphics · Dubai
          </motion.span>
          <h1 id="hero-title" className="display">
            {[
              <>Your bike.</>,
              <span className="stroke">Your lines.</span>,
              <span className="accent">Own the dunes.</span>,
            ].map((content, k) => (
              <span key={k} style={{ display: 'block', overflow: 'hidden', paddingRight: '0.08em' }}>
                <motion.span style={{ display: 'block' }} variants={line} custom={k} initial="hidden" animate="show">
                  {content}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.8 }}>
            <p>
              Design your own graphics kit on a live 3D bike. Pick your model, choose a design, add your name and number, and watch every
              change land in real time. We print it in Dubai and ship across the UAE.
            </p>
            <div className="hero-ctas">
              <AppLink to="/configurator" className="btn btn-primary">
                Start designing <Icon name="arrow" size={18} />
              </AppLink>
              <a
                href="#designs"
                className="btn btn-ghost"
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById('designs')?.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                Browse designs
              </a>
            </div>
            <p className="fits">
              Fits <strong>{MAKES.filter((m) => available.some((b) => b.make === m.make)).map((m) => m.make).join(' · ')}</strong>
            </p>
          </motion.div>
        </div>

        <div className="hero-stage">
          <div className="stage-fill">
            <LazyStage cfg={cfg} view="hero" autoRotate={!reduce} interactive={finePointer} />
          </div>
          <div className="now-showing" aria-live="polite">
            <span className="dot" aria-hidden="true" />
            Live 3D
            <AnimatePresence mode="wait">
              <motion.b key={id} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.3 }}>
                {name}
              </motion.b>
            </AnimatePresence>
          </div>
          {finePointer && (
            <div className="drag-hint" aria-hidden="true">
              <Icon name="rotate" size={16} /> Drag to spin
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function Ticker() {
  const words = ['Design it', 'Print it', 'Send it', 'Made in Dubai']
  const run = [...words, ...words, ...words]
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {[0, 1].map((k) => (
          <span key={k}>
            {run.map((w, i) => (
              <span key={i} style={{ padding: 0, gap: 28 }}>
                {w}
                <CactusSpines className="tick-ico" />
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  )
}

const STEPS: [string, string][] = [
  ['Pick your bike', 'Choose your make, model and year so every panel is cut to fit.'],
  ['Choose a design', 'Start from one of our designs and see it on the bike in 3D.'],
  ['Make it yours', 'Recolour every zone, add your name, number and sponsor logos.'],
  ['We print & ship', 'Approve your proof and we print in Dubai, then ship or fit it.'],
]

const FEATURES: [IconName, string, string][] = [
  ['cube', '360° live preview', 'Spin, zoom and check every angle as you design.'],
  ['palette', 'Every zone, your colours', 'Base, primary, secondary and accent, including neon inks.'],
  ['hash', 'Name & number', 'Race fonts, plate colours and outlines that stay readable.'],
  ['upload', 'Your sponsor logos', 'Upload team and sponsor logos and place them on the kit.'],
  ['sparkle', 'Four finishes', 'Gloss, matte, chrome or holographic, previewed in real light.'],
  ['tag', 'Instant AED pricing', 'The price updates with every option. No surprises.'],
]

const PLANS = [
  { title: 'Motocross kit', body: KIT_PARTS, price: KIT_PRICES.MX.price, to: '/configurator?kit=full', cta: 'Design a kit', cfg: designPreview('dune'), featured: true },
  { title: 'Trail bike kit', body: KIT_PARTS, price: KIT_PRICES.Trail.price, to: '/configurator?kit=full', cta: 'Design a kit', cfg: designPreview('shamal') },
  { title: 'Number plates only', body: `${PLATES_PARTS}.`, price: PLATES_KIT.price, to: '/configurator?kit=plates', cta: 'Design plates', cfg: { ...designPreview('saguaro'), kit: 'plates' as const } },
]

export default function Home() {
  const promoCfg = useMemo(() => ({ ...designPreview('saguaro'), bikeId: HERO_BIKE }), [])
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Ticker />

        <section id="how" className="section">
          <div className="container">
            <div className="section-head">
              <Reveal>
                <span className="eyebrow">How it works</span>
                <h2 className="display">
                  Four steps
                  <br />
                  to your kit
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p>No design skills needed. If you can pick colours, you can build a race-ready kit in about five minutes.</p>
              </Reveal>
            </div>
            <ol className="steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {STEPS.map(([title, body], i) => (
                <li key={title} className="step-card">
                  <Reveal delay={i * 0.08}>
                    <div className="num" aria-hidden="true">
                      0{i + 1}
                    </div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="designs" className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <Reveal>
                <span className="eyebrow">Start from a design</span>
                <h2 className="display">
                  Pick a base.
                  <br />
                  Make it yours.
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p>
                  Every design is fully editable: colours, name, number, logos and finish. A fully custom kit is {formatAED(KIT_PRICES.MX.price)} for a
                  motocross bike and {formatAED(KIT_PRICES.Trail.price)} for a trail bike.
                </p>
              </Reveal>
            </div>
            <div className="designs">
              <Reveal>
                <AppLink to="/configurator?design=blank" className="design-card blank-card">
                  <div className="thumb">
                    <span className="blank-plus" aria-hidden="true">
                      <Icon name="plus" size={40} />
                    </span>
                  </div>
                  <div className="meta">
                    <div>
                      <h3>Start blank</h3>
                      <p>An empty kit. Build it yourself with shapes, text and your own photos.</p>
                    </div>
                    <span className="go" aria-hidden="true">
                      <Icon name="arrow" size={18} />
                    </span>
                  </div>
                </AppLink>
              </Reveal>
              {PRESETS.map((d, i) => (
                <Reveal key={d.id} delay={((i + 1) % 4) * 0.06}>
                  <AppLink to={`/configurator?design=${d.id}`} className="design-card">
                    <div className="thumb">
                      <ProofCanvas cfg={designPreview(d.id)} width={560} label={`${d.name} design preview`} />
                    </div>
                    <div className="meta">
                      <div>
                        <h3>{d.name}</h3>
                        <p>{d.blurb}</p>
                      </div>
                      <span className="go" aria-hidden="true">
                        <Icon name="arrow" size={18} />
                      </span>
                    </div>
                  </AppLink>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <Reveal>
                <span className="eyebrow">Pricing</span>
                <h2 className="display">
                  Full kit
                  <br />
                  or just plates
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p>Everything is fully custom and cut to your model’s template. Finishes and extras are added in the configurator.</p>
              </Reveal>
            </div>
            <div className="plans">
              {PLANS.map((plan, i) => (
                <Reveal key={plan.title} delay={i * 0.07}>
                  <div className={`plan${plan.featured ? ' featured' : ''}`}>
                    <div className="plan-thumb">
                      <ProofCanvas cfg={plan.cfg} width={560} label={`${plan.title} preview`} />
                    </div>
                    <h3>{plan.title}</h3>
                    <p>{plan.body}</p>
                    <div className="plan-price">{formatAED(plan.price)}</div>
                    <AppLink to={plan.to} className={`btn ${plan.featured ? 'btn-primary' : 'btn-ghost'}`}>
                      {plan.cta} <Icon name="arrow" size={18} />
                    </AppLink>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container promo">
            <Reveal>
              <div className="promo-visual">
                <LazyStage cfg={promoCfg} view="front" autoRotate interactive={false} />
              </div>
            </Reveal>
            <div>
              <Reveal>
                <span className="eyebrow">The configurator</span>
                <h2 className="display" style={{ fontSize: 'clamp(48px, 6.5vw, 88px)', marginTop: 14 }}>
                  See it before
                  <br />
                  you ride it
                </h2>
              </Reveal>
              <ul className="feature-list">
                {FEATURES.map(([icon, title, body], i) => (
                  <motion.li
                    key={title}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Icon name={icon} size={24} />
                    <div>
                      <b>{title}</b>
                      <span>{body}</span>
                    </div>
                  </motion.li>
                ))}
              </ul>
              <Reveal>
                <AppLink to="/configurator" className="btn btn-primary" style={{ marginTop: 32 }}>
                  Open the configurator <Icon name="arrow" size={18} />
                </AppLink>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="finishes" className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <Reveal>
                <span className="eyebrow">Finishes</span>
                <h2 className="display">Pick your shine</h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p>Every finish is previewed in real lighting in the configurator, so you know exactly how it catches the sun.</p>
              </Reveal>
            </div>
            <div className="finishes">
              {(Object.keys(FINISHES) as FinishId[]).map((id, i) => (
                <Reveal key={id} delay={i * 0.07}>
                  <div className={`finish ${id}`}>
                    <div className="label">
                      <h3>{FINISHES[id].label}</h3>
                      <p>{FINISHES[id].note}</p>
                      <span className="price">{FINISHES[id].price ? `+ ${formatAED(FINISHES[id].price)}` : 'Included'}</span>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="why">
              {(
                [
                  ['sun', 'Built for UAE heat', 'Thick, UV-resistant laminate and high-tack adhesive chosen for desert riding.'],
                  ['pin', 'Printed in Dubai', 'Designed, printed and cut locally, with fast delivery across the Emirates.'],
                  ['wrench', 'Fitted by pros', 'Book fitting at our workshop and ride away with a bubble-free kit.'],
                ] as [IconName, string, string][]
              ).map(([icon, title, body], i) => (
                <div key={title}>
                  <Reveal delay={i * 0.08}>
                    <Icon name={icon} size={28} />
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head">
              <Reveal>
                <span className="eyebrow">FAQ</span>
                <h2 className="display">Good questions</h2>
              </Reveal>
            </div>
            <div className="faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>
                    {f.q}
                    <Icon name="plus" />
                  </summary>
                  <div className="answer">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="container" aria-labelledby="cta-title">
          <Reveal>
            <div className="cta-band">
              <CactusSpines className="spines" />
              <h2 id="cta-title" className="display">
                Your number.
                <br />
                Your colours.
              </h2>
              <AppLink to="/configurator" className="btn btn-primary">
                Build your kit now <Icon name="arrow" size={18} />
              </AppLink>
            </div>
          </Reveal>
        </section>
      </main>
      <Footer />
    </>
  )
}
