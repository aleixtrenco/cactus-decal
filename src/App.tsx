import { MotionConfig } from 'framer-motion'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { StageLoading } from './components/bits'
import ErrorBoundary, { PageError } from './components/ErrorBoundary'
import Configurator from './pages/Configurator'
import Home from './pages/Home'
import Result from './pages/Result'
import { loadTemplates } from './lib/templates'

const Admin = lazy(() => import('./pages/Admin'))

// Sandboxed previews can't change the page URL, so they keep the route in
// memory. The real site uses normal URLs (/configurator, /admin).
const Router = import.meta.env.VITE_HASH_ROUTER ? MemoryRouter : BrowserRouter

// A crash on one page shows a message instead of a blank screen, and is
// cleared when the visitor moves to another page.
function RouteErrors({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname} fallback={(error, retry) => <PageError error={error} retry={retry} />}>
      {children}
    </ErrorBoundary>
  )
}

function ScrollReset() {
  const { pathname } = useLocation()
  // Braces matter: newer browsers return a Promise from scrollTo, and React
  // would try to call a returned value as the effect's cleanup.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  // Published bike templates replace the built-in panel shapes.
  useEffect(() => {
    loadTemplates()
  }, [])
  return (
    <MotionConfig reducedMotion="user">
      <Router>
        <ScrollReset />
        <RouteErrors>
        <Suspense fallback={<StageLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/configurator" element={<Configurator />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/checkout/success" element={<Result ok />} />
            <Route path="/checkout/cancel" element={<Result ok={false} />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
        </RouteErrors>
      </Router>
    </MotionConfig>
  )
}
