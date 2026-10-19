import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { WORLD } from '../lib/graphics'
import { ROLE_LABELS, apply, defaultModelSetup, resolveModel, mul6, pieceToWorld, type BikeTemplate, type M6, type ModelSetup, type TemplatePiece } from '../lib/templates'
import { fitModel } from '../three/RealBike'
import Icon from './Icon'

const { x0, x1, y0, y1 } = WORLD
const WW = x1 - x0
const WH = y1 - y0

// Side-view picture of the fitted model, used as the backdrop for placing
// pieces. Rendered offscreen with the same framing as the decal artwork.
async function snapshot(setup: ModelSetup): Promise<string> {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/libs/draco/gltf/')
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(await resolveModel(setup.url))
  const root = gltf.scene
  fitModel(root, setup)
  const scene = new THREE.Scene()
  scene.add(root, new THREE.AmbientLight('#ffffff', 1.4), new THREE.DirectionalLight('#ffffff', 2).translateZ(3).translateY(2))
  const cam = new THREE.OrthographicCamera(x0, x1, y1, y0, 0.01, 6)
  cam.position.set(0, 0, 3)
  cam.lookAt(0, 0, 0)
  const W = 1400
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  r.setSize(W, W / 2, false)
  r.outputColorSpace = THREE.SRGBColorSpace
  r.render(scene, cam)
  const url = r.domElement.toDataURL('image/png')
  r.dispose()
  draco.dispose()
  return url
}

// Rotate/scale a placement about the piece's centre on the bike.
function around(m: M6, p: TemplatePiece, k: number, deg: number): M6 {
  const [cx, cy] = apply(m, [p.bbox.x + p.bbox.w / 2, p.bbox.y + p.bbox.h / 2])
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a) * k
  const s = Math.sin(a) * k
  const t: M6 = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]
  return mul6(t, m)
}

const editable = (p: TemplatePiece) => p.side === 'right' && p.parent === undefined && p.role !== 'ignore' && p.role !== 'frontPlate'

async function uploadModel(file: File, bikeId: string, pw: string) {
  const { upload } = await import('@vercel/blob/client')
  const blob = await upload(`models/${bikeId}.glb`, file, { access: 'public', handleUploadUrl: '/api/model-upload', clientPayload: pw })
  return blob.url
}

export default function ModelEditor({ template, onChange, pw, online }: { template: BikeTemplate; onChange: (t: BikeTemplate) => void; pw: string; online: boolean }) {
  const model = template.model
  const [shot, setShot] = useState<string | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; m: M6 } | null>(null)

  useEffect(() => {
    if (!model) return setShot(null)
    let alive = true
    const t = setTimeout(() => {
      snapshot(model)
        .then((u) => alive && setShot(u))
        .catch(() => alive && setError('That model could not be loaded. Check it is a valid .glb file.'))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [model])

  const setModel = (patch: Partial<ModelSetup>) => model && onChange({ ...template, model: { ...model, ...patch } })
  const setPlace = (id: number, place: M6 | undefined) => onChange({ ...template, pieces: template.pieces.map((p) => (p.id === id ? { ...p, place } : p)) })

  const onFile = async (file: File | undefined) => {
    setError(null)
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.glb')) return setError('Please choose a .glb file. In Blender: File › Export › glTF 2.0, format "glTF Binary".')
    if (file.size > 60 * 1024 * 1024) return setError('That model is over 60 MB. Reduce it (e.g. with gltf.report or Blender’s Decimate) so it loads quickly on phones.')
    setBusy('Uploading model…')
    try {
      const url = online ? await uploadModel(file, template.bikeId, pw) : URL.createObjectURL(file)
      onChange({ ...template, model: defaultModelSetup(url) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(null)
    }
  }

  // Trim pieces are hidden until asked for, so they don't clutter the bike.
  const [trim, setTrim] = useState(false)
  const pieces = useMemo(() => template.pieces.filter((p) => editable(p) && (trim || p.role !== 'other' || p.place)), [template.pieces, trim])
  const selected = pieces.find((p) => p.id === sel)

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: pt.x, y: -pt.y }
  }
  const down = (e: RPointerEvent, p: TemplatePiece) => {
    setSel(p.id)
    const { x, y } = toSvg(e)
    drag.current = { id: p.id, x, y, m: pieceToWorld(p, template.pieces) }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const move = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const { x, y } = toSvg(e)
    const m = d.m
    setPlace(d.id, [m[0], m[1], m[2], m[3], m[4] + x - d.x, m[5] + y - d.y])
  }
  const nudge = (k: number, deg: number, dx = 0, dy = 0) => {
    if (!selected) return
    const m = around(pieceToWorld(selected, template.pieces), selected, k, deg)
    setPlace(selected.id, [m[0], m[1], m[2], m[3], m[4] + dx, m[5] + dy])
  }

  return (
    <section className="model-editor" aria-label="3D model">
      <div className="group-label">
        3D model <span>{model ? 'Line it up, then place the pieces' : 'Optional: a real model of this bike'}</span>
      </div>
      {!model && (
        <label className="upload">
          <Icon name="cube" size={28} />
          <b>{busy ?? 'Upload a 3D model (.glb)'}</b>
          <small>A real model of this exact bike. Any .glb works: no special setup or UVs needed.</small>
          <input type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {model && (
        <>
          <div className="chips" style={{ marginBottom: 12 }}>
            <button className="chip" onClick={() => setModel({ yaw: (model.yaw + 180) % 360 })}>
              Flip front / back
            </button>
            <button className="chip" onClick={() => setModel({ yaw: (model.yaw + 90) % 360 })}>
              Turn 90°
            </button>
            <label className="chip" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              Replace model
              <input type="file" accept=".glb,model/gltf-binary" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            <button className="chip" onClick={() => onChange({ ...template, model: undefined })}>
              Remove model
            </button>
          </div>
          <div className="sliders">
            {(
              [
                ['Size', 'scale', 0.8, 1.25, 0.005],
                ['Move forward / back', 'dx', -0.3, 0.3, 0.005],
                ['Move up / down', 'dy', -0.2, 0.2, 0.005],
              ] as const
            ).map(([label, key, min, max, step]) => (
              <label key={key} className="slider">
                <span>{label}</span>
                <input type="range" min={min} max={max} step={step} value={model[key]} onChange={(e) => setModel({ [key]: +e.target.value })} />
              </label>
            ))}
            {(
              [
                ['Front plate height', 'y', 0.7, 1.4],
                ['Front plate width', 'w', 0.12, 0.5],
                ['Front plate tall', 'h', 0.12, 0.45],
              ] as const
            ).map(([label, key, min, max]) => (
              <label key={key} className="slider">
                <span>{label}</span>
                <input type="range" min={min} max={max} step={0.005} value={model.plate[key]} onChange={(e) => setModel({ plate: { ...model.plate, [key]: +e.target.value } })} />
              </label>
            ))}
          </div>

          <div className="group-label" style={{ marginTop: 20 }}>
            Place the pieces <span>Right side; the left side mirrors it</span>
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ marginBottom: 10 }}
            disabled={!!busy}
            aria-busy={busy === 'Placing pieces…'}
            onClick={async () => {
              setBusy('Placing pieces…')
              setError(null)
              try {
                const { autoPlace } = await import('../lib/autoPlace')
                onChange(await autoPlace(template))
              } catch {
                setError('Auto-place could not read this model. Place the pieces by hand instead.')
              } finally {
                setBusy(null)
              }
            }}
          >
            <Icon name="sparkle" size={16} /> {busy === 'Placing pieces…' ? 'Placing pieces…' : 'Auto-place on model'}
          </button>
          <button className="toggle" role="switch" aria-checked={trim} onClick={() => setTrim(!trim)} style={{ marginBottom: 10 }}>
            <span>Show trim pieces (shown on the 3D bike once placed)</span>
            <span className="track" aria-hidden="true" />
          </button>
          <div className="placer">
            <svg ref={svgRef} viewBox={`${x0} ${-y1} ${WW} ${WH}`} onPointerMove={move} onPointerUp={() => (drag.current = null)} role="group" aria-label="Drag each piece onto the bike">
              {shot ? <image href={shot} x={x0} y={-y1} width={WW} height={WH} /> : <text x={0} y={-0.7} fontSize={0.06} textAnchor="middle" fill="currentColor">Loading model…</text>}
              {pieces.map((p) => {
                const m = pieceToWorld(p, template.pieces)
                const pts = p.outline.map((q) => {
                  const [x, y] = apply(m, q)
                  return `${x},${-y}`
                })
                return (
                  <polygon
                    key={p.id}
                    points={pts.join(' ')}
                    className={`placer-piece ${sel === p.id ? 'on' : ''} ${p.place ? 'placed' : ''}`}
                    onPointerDown={(e) => down(e, p)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${ROLE_LABELS[p.role]} (piece ${p.id})`}
                    aria-pressed={sel === p.id}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.02 : 0.004
                      const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
                      if (keys[e.key]) {
                        e.preventDefault()
                        setSel(p.id)
                        nudge(1, 0, ...keys[e.key])
                      }
                    }}
                  >
                    <title>{ROLE_LABELS[p.role]}</title>
                  </polygon>
                )
              })}
            </svg>
          </div>
          {selected ? (
            <div className="chips" style={{ marginTop: 10 }} role="group" aria-label={`Adjust ${ROLE_LABELS[selected.role]}`}>
              <b style={{ alignSelf: 'center', marginRight: 6 }}>{ROLE_LABELS[selected.role]}</b>
              <button className="chip" onClick={() => nudge(0.98, 0)} aria-label="Smaller">
                Smaller
              </button>
              <button className="chip" onClick={() => nudge(1.02, 0)} aria-label="Bigger">
                Bigger
              </button>
              <button className="chip" onClick={() => nudge(1, 2)} aria-label="Rotate left">
                Rotate left
              </button>
              <button className="chip" onClick={() => nudge(1, -2)} aria-label="Rotate right">
                Rotate right
              </button>
              <button className="chip" onClick={() => setPlace(selected.id, undefined)}>
                Reset
              </button>
            </div>
          ) : (
            <p className="lead">Start with Auto-place, then drag any piece that needs it. Click a piece for size and rotation; arrow keys nudge it.</p>
          )}
        </>
      )}
    </section>
  )
}
