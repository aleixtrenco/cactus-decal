import { MotionConfig } from 'framer-motion'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { StageLoading } from './components/bits'
import Home from './pages/Home'
import Result from './pages/Result'
import { loadTemplates } from './lib/templates'

const Configurator = lazy(() => import('./pages/Configurator'))
const Admin = lazy(() => import('./pages/Admin'))

// Static previews use hash routing so deep links work without server rewrites.
const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter

function ScrollReset() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
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
      </Router>
    </MotionConfig>
  )
}
