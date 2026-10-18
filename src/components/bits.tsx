import { motion, useInView } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { designById, type DesignId } from '../data/designs'
import { drawProof } from '../lib/proof'
import { ensureAssets } from '../lib/graphics'
import { useTemplates } from '../lib/templates'
import { defaultConfig, type KitConfig } from '../store/config'
import type { StageApi, View } from '../three/Stage'

const Stage = lazy(() => import('../three/Stage'))

// Lazy 3D stage: three.js loads in its own chunk, and the canvas only
// mounts once the stage scrolls near the viewport.
export function LazyStage(props: { cfg: KitConfig; view?: View; autoRotate?: boolean; onApi?: (api: StageApi) => void; interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const near = useInView(ref, { margin: '200px', once: true })
  return (
    <div ref={ref} style={{ position: 'absolute', inset: 0 }}>
      {near && (
        <Suspense fallback={<StageLoading />}>
          <motion.div style={{ position: 'absolute', inset: 0 }} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}>
            <Stage {...props} />
          </motion.div>
        </Suspense>
      )}
    </div>
  )
}

export function StageLoading() {
  return (
    <div className="stage-loading" role="status">
      <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={96} height={96} />
      <span className="sr-only">Loading 3D preview</span>
    </div>
  )
}

export function Reveal({ children, delay = 0, y = 28 }: { children: ReactNode; delay?: number; y?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

// 2D proof of a design, drawn into a canvas. Used as a thumbnail.
export function ProofCanvas({ cfg, side = 'right', width = 640, label }: { cfg: KitConfig; side?: 'right' | 'left'; width?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const template = useTemplates((s) => s.templates[cfg.bikeId])
  useEffect(() => {
    let alive = true
    const draw = () => ref.current && drawProof(ref.current, cfg, side)
    draw()
    ensureAssets(cfg).then(() => alive && draw())
    return () => {
      alive = false
    }
  }, [cfg, side, template])
  return <canvas ref={ref} width={width} height={Math.round(width * 0.56)} role="img" aria-label={label} />
}

export function designPreview(id: DesignId): KitConfig {
  const d = designById(id)
  const c = defaultConfig()
  return { ...c, designId: id, colors: { ...d.palette }, rider: { ...c.rider, plateColor: d.palette.primary === '#101010' ? '#f4f4f2' : d.palette.primary, numberColor: d.palette.base === '#f4f4f2' ? '#101010' : d.palette.base } }
}

export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const tick = (t: number) => {
      const k = reduce ? 1 : Math.min(1, (t - start) / 450)
      const e = 1 - Math.pow(1 - k, 3)
      const v = Math.round(a + (value - a) * e)
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(shown)}</>
}
