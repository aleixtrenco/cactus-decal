import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppLink from './AppLink'
import { CONTACT } from '../data/site'
import Icon from './Icon'

const LINKS = [
  ['Designs', 'designs'],
  ['Builds', 'builds'],
  ['Pricing', 'pricing'],
  ['How it works', 'how'],
  ['Finishes', 'finishes'],
  ['FAQ', 'faq'],
] as const

// Scrolls to a home-page section. Works with both browser and hash routing
// (a plain #anchor would be swallowed by the hash router).
function SectionLink({ id, children, onClick }: { id: string; children: ReactNode; onClick?: () => void }) {
  const nav = useNavigate()
  const loc = useLocation()
  return (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
        const go = () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
        if (loc.pathname === '/') go()
        else {
          nav('/')
          setTimeout(go, 120)
        }
      }}
    >
      {children}
    </a>
  )
}

export function Header({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''} ${solid ? 'solid' : ''}`}>
      <div className="container">
        <AppLink to="/" className="brand" aria-label="Cactus Decal Lab home">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={56} height={56} />
          <span>Cactus Decal Lab</span>
        </AppLink>
        <nav className="nav" aria-label="Main">
          {LINKS.map(([label, id]) => (
            <SectionLink key={id} id={id}>
              {label}
            </SectionLink>
          ))}
        </nav>
        <AppLink to="/configurator" className="btn btn-primary btn-sm">
          Design your kit <Icon name="arrow" size={18} />
        </AppLink>
        <button className="icon-btn menu-btn" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon name="menu" />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            className="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12, transition: { duration: 0.18 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <button className="icon-btn close" aria-label="Close menu" onClick={() => setOpen(false)} autoFocus>
              <Icon name="x" />
            </button>
            {LINKS.map(([label, id], i) => (
              <motion.div key={id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.04 }}>
                <SectionLink id={id} onClick={() => setOpen(false)}>
                  {label}
                </SectionLink>
              </motion.div>
            ))}
            <AppLink to="/configurator" className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setOpen(false)}>
              Design your kit <Icon name="arrow" size={18} />
            </AppLink>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <AppLink to="/" className="brand" aria-label="Cactus Decal Lab home">
              <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={56} height={56} />
              <span>Cactus Decal Lab</span>
            </AppLink>
            <p style={{ color: 'var(--muted)', marginTop: 12, maxWidth: '36ch' }}>
              Custom off-road graphics, designed by you and printed in Dubai.
            </p>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li>
                <a href={`https://wa.me/${CONTACT.whatsapp.replace(/\D/g, '')}`}>WhatsApp {CONTACT.whatsapp}</a>
              </li>
              <li>
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
              <li>{CONTACT.address}</li>
            </ul>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li>
                <AppLink to="/configurator">3D configurator</AppLink>
              </li>
              {LINKS.map(([label, id]) => (
                <li key={id}>
                  <SectionLink id={id}>{label}</SectionLink>
                </li>
              ))}
              <li>
                <a href={CONTACT.instagram}>Instagram</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="fine">
          <span>© {new Date().getFullYear()} Cactus Decal Lab. Dubai, UAE.</span>
          <span>Brand names are used only to identify bike fitment.</span>
          <span>
            Honda 3D model: “FREE Honda CRF 450” by Jacobdesigns (Sketchfab),{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
            , recoloured for previews.
          </span>
        </div>
      </div>
    </footer>
  )
}

// Topographic dune contour lines, used as a slow-drifting backdrop.
export function Contours() {
  const lines = Array.from({ length: 18 }, (_, i) => {
    const y = 40 + i * 48
    const a = 18 + (i % 5) * 6
    return `M-50 ${y} C 200 ${y - a}, 380 ${y + a * 1.6}, 620 ${y} S 1020 ${y - a * 1.4}, 1250 ${y + a * 0.6}`
  })
  return (
    <svg className="contours" viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={i % 4 === 0 ? 1.6 : 0.8} />
      ))}
    </svg>
  )
}

export function CactusSpines({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true" fill="currentColor">
      <path d="M92 200V40a18 18 0 0 1 36 0v160zM40 120V80a14 14 0 0 1 28 0v40a8 8 0 0 0 8 8h16v24H70a30 30 0 0 1-30-32zM160 100V70a14 14 0 0 1 28 0v30a32 32 0 0 1-32 32h-28v-24h24a8 8 0 0 0 8-8z" />
    </svg>
  )
}
