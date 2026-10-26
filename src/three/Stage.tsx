import { CameraControls, ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type * as THREE from 'three'
import type { KitConfig } from '../store/config'
import { builtInTemplate, isHandheld, modelFor, useTemplates } from '../lib/templates'
import Bike from './Bike'
import RealBike from './RealBike'

export type View = 'hero' | 'three-quarter' | 'right' | 'left' | 'front' | 'rear' | 'plate' | 'top'

// [camera position, look-at target]
const VIEWS: Record<View, [[number, number, number], [number, number, number]]> = {
  hero: [[2.3, 1.25, 3.1], [0, 0.66, 0]],
  'three-quarter': [[2.4, 1.4, 3.0], [0, 0.66, 0]],
  right: [[0, 0.78, 4.1], [0, 0.72, 0]],
  left: [[0, 0.78, -4.1], [0, 0.72, 0]],
  front: [[3.6, 1.2, 1.1], [0.2, 0.8, 0]],
  rear: [[-3.4, 1.5, 1.6], [0, 0.7, 0]],
  plate: [[1.2, 1.15, 2.6], [-0.15, 0.86, 0]],
  top: [[0.01, 4.4, 0.4], [0, 0.6, 0]],
}

export interface StageApi {
  capture: () => string
}

function Rig({ view, autoRotate, onApi }: { view: View; autoRotate: boolean; onApi?: (api: StageApi) => void }) {
  const ref = useRef<CameraControls>(null)
  const { size, camera, gl, scene } = useThree()
  const interacting = useRef(false)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const [p, t] = VIEWS[view]
    // Pull the camera back on narrow screens so the whole bike fits.
    const persp = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const fitDist = 1.45 / (Math.tan((persp.fov * Math.PI) / 360) * aspect)
    const dx = p[0] - t[0]
    const dy = p[1] - t[1]
    const dz = p[2] - t[2]
    const dist = Math.hypot(dx, dy, dz)
    const k = Math.max(1, fitDist / dist)
    c.setLookAt(t[0] + dx * k, t[1] + dy * k, t[2] + dz * k, ...t, true)
  }, [view, size.width, size.height, camera])

  useEffect(() => {
    onApi?.({
      capture: () => {
        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      },
    })
  }, [gl, scene, camera, onApi])

  useFrame((_, dt) => {
    if (autoRotate && !interacting.current && ref.current) ref.current.azimuthAngle += dt * 0.22
  })

  return (
    <CameraControls
      ref={ref}
      minDistance={1.6}
      maxDistance={9}
      maxPolarAngle={Math.PI / 2 - 0.05}
      smoothTime={0.45}
      onStart={() => (interacting.current = true)}
      onEnd={() => (interacting.current = false)}
    />
  )
}

export default function Stage({
  cfg,
  view = 'three-quarter',
  autoRotate = false,
  onApi,
  interactive = true,
  stock = false,
}: {
  cfg: KitConfig
  view?: View
  autoRotate?: boolean
  onApi?: (api: StageApi) => void
  interactive?: boolean
  // Show the model as it comes, without graphics (e.g. on the home page).
  stock?: boolean
}) {
  // If the device drops the 3D context (usually out of graphics memory), stop
  // and let the surrounding error boundary show the flat preview instead of
  // a black box.
  const [lost, setLost] = useState(false)
  if (lost) throw new Error('The 3D preview ran out of graphics memory on this device.')
  return (
    <Canvas
      dpr={isHandheld() ? [1, 1.5] : [1, 2]}
      onCreated={({ gl }) =>
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          setLost(true)
        })
      }
      camera={{ position: [2.4, 1.4, 3.0], fov: 32, near: 0.1, far: 50 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
      style={{ touchAction: interactive ? 'none' : 'pan-y', pointerEvents: interactive ? 'auto' : 'none' }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} color="#fff1dc" />
      <directionalLight position={[-4, 3, -3]} intensity={0.9} color="#cfe3ff" />
      <Environment resolution={256}>
        <Lightformer intensity={2.5} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer intensity={1.6} position={[5, 1, 2]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} color="#ffd9a8" />
        <Lightformer intensity={1.2} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} color="#b9d7ff" />
        <Lightformer intensity={0.8} position={[0, 1, -6]} scale={[10, 3, 1]} />
      </Environment>
      <Suspense fallback={null}>
        <BikeFor cfg={cfg} stock={stock} />
        <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={5} blur={2.4} far={1.2} resolution={512} frames={1} color="#000" />
      </Suspense>
      <Rig view={view} autoRotate={autoRotate} onApi={onApi} />
    </Canvas>
  )
}

// The real 3D model when this bike has one, otherwise the built-in bike.
function BikeFor({ cfg, stock }: { cfg: KitConfig; stock: boolean }) {
  const templates = useTemplates((s) => s.templates)
  const own = templates[cfg.bikeId]
  const model = modelFor(cfg.bikeId, templates)
  // The bike's own pieces (or the standard layout) on its brand's model.
  const template = useMemo(() => (model ? { ...(own ?? builtInTemplate(cfg)), model } : null), [own, model, cfg.bikeId]) // eslint-disable-line react-hooks/exhaustive-deps
  if (template)
    return (
      <ModelFallback key={template.model.url} fallback={<Bike cfg={cfg} />}>
        <RealBike cfg={cfg} template={template} stock={stock} />
      </ModelFallback>
    )
  return <Bike cfg={cfg} />
}

// If a model can't load on this device, show the built-in bike instead.
class ModelFallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.error('3D model failed to load', e)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
