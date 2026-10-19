// A procedural motocross bike. Decal panels are separate meshes whose UVs
// come from their side-view position, so they all sample one graphics sheet
// per side (see lib/graphics.ts). To use a real model later, load a .glb and
// apply the same three materials to meshes named shroud/sideplate/fender.

import { RoundedBox } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { bikeById, makeInfo } from '../data/bikes'
import type { FinishId } from '../data/pricing'
import { ensureAssets, paintFrontPlate, paintSheet, sheetWidth, uvFor, type Side } from '../lib/graphics'
import { FRONT_WHEEL, REAR_WHEEL, frontPlate, tracePath, type Seg } from '../lib/shapes'
import { panelSet, useTemplates, type PanelSet } from '../lib/templates'
import { plasticsHex, platesOnly, type KitConfig } from '../store/config'

function panelGeometry(segs: Seg[], depth: number, uv: (x: number, y: number) => [number, number]) {
  const shape = new THREE.Shape()
  tracePath(shape, segs)
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10 })
  const pos = g.attributes.position
  const uvs = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = uv(pos.getX(i), pos.getY(i))
    uvs[i * 2] = u
    uvs[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.computeVertexNormals()
  return g
}

function tube(points: [number, number, number][], r: number) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 40, r, 10)
}

const FINISH: Record<FinishId, Partial<THREE.MeshPhysicalMaterialParameters>> = {
  gloss: { roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, iridescence: 0 },
  matte: { roughness: 0.88, metalness: 0, clearcoat: 0, clearcoatRoughness: 1, iridescence: 0 },
  chrome: { roughness: 0.16, metalness: 0.75, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0 },
  holo: { roughness: 0.22, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.7 },
}

function useKitMaterials(cfg: KitConfig, panels: PanelSet) {
  const kit = useMemo(() => {
    const W = sheetWidth()
    const make = (w: number, h: number) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      return { c, t }
    }
    const right = make(W, W / 2)
    const left = make(W, W / 2)
    const plate = make(W / 4, W / 4)
    const mat = (map: THREE.Texture) => new THREE.MeshPhysicalMaterial({ map })
    return {
      right,
      left,
      plate,
      decal: { right: mat(right.t), left: mat(left.t), plate: mat(plate.t) },
      plastic: new THREE.MeshStandardMaterial({ roughness: 0.45 }),
    }
  }, [])

  // Repaint whenever the design changes. Fonts and logos load async, so
  // repaint again once they are ready.
  useEffect(() => {
    let alive = true
    const paint = () => {
      paintSheet(kit.right.c, cfg, 'right', panels)
      paintSheet(kit.left.c, cfg, 'left', panels)
      paintFrontPlate(kit.plate.c, cfg)
      kit.right.t.needsUpdate = kit.left.t.needsUpdate = kit.plate.t.needsUpdate = true
    }
    paint()
    ensureAssets(cfg).then(() => alive && paint())
    return () => {
      alive = false
    }
  }, [cfg, kit, panels])

  useEffect(() => {
    for (const m of Object.values(kit.decal)) {
      m.setValues(FINISH[cfg.finish])
      m.needsUpdate = true
    }
    kit.plastic.color.set(plasticsHex(cfg))
  }, [cfg, kit])

  useEffect(
    () => () => {
      for (const k of [kit.right, kit.left, kit.plate]) k.t.dispose()
      for (const m of Object.values(kit.decal)) m.dispose()
      kit.plastic.dispose()
    },
    [kit],
  )
  return kit
}

const metal = (color: string, roughness = 0.35, metalness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness, metalness })

function Wheel({ x, y, rimDecal, accent, front }: { x: number; y: number; rimDecal: boolean; accent: string; front?: boolean }) {
  const parts = useMemo(() => {
    const pts: number[] = []
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      const side = i % 2 ? 1 : -1
      pts.push(Math.cos(a + 0.15 * side) * 0.045, Math.sin(a + 0.15 * side) * 0.045, side * 0.06)
      pts.push(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0)
    }
    const spokes = new THREE.BufferGeometry()
    spokes.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return { spokes }
  }, [])
  return (
    <group position={[x, y, 0]}>
      <mesh castShadow>
        <torusGeometry args={[0.322, 0.05, 14, 56]} />
        <meshStandardMaterial color="#121212" roughness={0.95} />
      </mesh>
      <mesh>
        <torusGeometry args={[0.285, 0.013, 8, 56]} />
        <meshStandardMaterial color="#1b1b1b" roughness={0.3} metalness={0.8} />
      </mesh>
      {rimDecal && (
        <mesh position={[0, 0, 0.008]}>
          <torusGeometry args={[0.285, 0.008, 6, 56]} />
          <meshStandardMaterial color={accent} roughness={0.4} />
        </mesh>
      )}
      <lineSegments geometry={parts.spokes}>
        <lineBasicMaterial color="#9a9ea4" />
      </lineSegments>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.17, 20]} />
        <meshStandardMaterial color="#8d9196" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, front ? 0.075 : -0.075]}>
        <cylinderGeometry args={front ? [0.13, 0.13, 0.006, 40] : [0.11, 0.11, 0.008, 40]} />
        <meshStandardMaterial color={front ? '#a4a9ae' : '#2a2a2a'} metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  )
}

export default function Bike({ cfg }: { cfg: KitConfig }) {
  const make = makeInfo(bikeById(cfg.bikeId).make)
  const template = useTemplates((s) => s.templates[cfg.bikeId])
  const panels = useMemo(() => panelSet(template, make.shroudLift, make.tailRise), [template, make.shroudLift, make.tailRise])
  const kit = useKitMaterials(cfg, panels)
  // Every kit covers all panels, fork guards included.
  // A plates-only kit leaves the shrouds and fenders in plain plastic.
  const fullKit = !platesOnly(cfg)
  const halfOrMore = fullKit

  const geo = useMemo(() => {
    const D = 0.018
    const both = (segs: Seg[], depth: number) => ({
      right: panelGeometry(segs, depth, (x, y) => uvFor(x, y, 'right')),
      left: panelGeometry(segs, depth, (x, y) => uvFor(x, y, 'left')),
    })
    return {
      shroud: panels.shroud.map((p) => both(p, D)),
      sidePlate: panels.sidePlate.map((p) => both(p, D)),
      rearFender: panels.rearFender.map((p) => panelGeometry(p, 0.26, (x, y) => uvFor(x, y, 'right'))),
      frontFender: panels.frontFender.map((p) => panelGeometry(p, 0.2, (x, y) => uvFor(x, y, 'right'))),
      // Local plate space is 0.38 wide; map it into the square plate canvas.
      frontPlate: panelGeometry(frontPlate, 0.014, (x, y) => [(x + 0.19) / 0.38, (y + 0.19) / 0.38]),
      frame: [
        tube([[0.42, 1.0, 0.0], [0.2, 1.0, 0.07], [-0.05, 0.96, 0.09], [-0.18, 0.88, 0.09], [-0.2, 0.62, 0.09]], 0.024),
        tube([[0.42, 1.0, 0.0], [0.2, 1.0, -0.07], [-0.05, 0.96, -0.09], [-0.18, 0.88, -0.09], [-0.2, 0.62, -0.09]], 0.024),
        tube([[0.42, 0.98, 0.0], [0.36, 0.7, 0.05], [0.26, 0.42, 0.07], [0.0, 0.34, 0.07], [-0.2, 0.42, 0.08]], 0.02),
        tube([[0.42, 0.98, 0.0], [0.36, 0.7, -0.05], [0.26, 0.42, -0.07], [0.0, 0.34, -0.07], [-0.2, 0.42, -0.08]], 0.02),
        tube([[-0.15, 0.92, 0.08], [-0.5, 0.95, 0.08], [-0.86, 0.99, 0.06]], 0.014),
        tube([[-0.15, 0.92, -0.08], [-0.5, 0.95, -0.08], [-0.86, 0.99, -0.06]], 0.014),
      ],
      exhaust: tube([[0.16, 0.8, 0.05], [0.3, 0.7, 0.09], [0.31, 0.52, 0.13], [0.12, 0.56, 0.16], [-0.2, 0.72, 0.17], [-0.44, 0.8, 0.165]], 0.024),
      bar: tube([[0.33, 1.22, -0.4], [0.35, 1.2, -0.2], [0.37, 1.17, 0], [0.35, 1.2, 0.2], [0.33, 1.22, 0.4]], 0.014),
      swingarm: panelGeometry(
        [['M', -0.1, 0.6], ['L', -0.78, 0.4], ['L', -0.78, 0.32], ['L', -0.12, 0.48], ['L', -0.1, 0.6]],
        0.035,
        () => [0, 0],
      ),
    }
  }, [panels])

  useEffect(() => {
    const all: THREE.BufferGeometry[] = []
    const collect = (v: unknown) => {
      if (v instanceof THREE.BufferGeometry) all.push(v)
      else if (Array.isArray(v)) v.forEach(collect)
      else if (v && typeof v === 'object') Object.values(v).forEach(collect)
    }
    collect(geo)
    return () => all.forEach((g) => g.dispose())
  }, [geo])

  const mats = useMemo(
    () => ({
      frame: metal(make.frame, 0.4, 0.5),
      alu: metal('#b8bcc2', 0.3, 0.85),
      dark: metal('#262626', 0.5, 0.6),
      pipe: metal('#d8d4cc', 0.28, 0.6),
      black: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8 }),
    }),
    [make.frame],
  )

  const decal = (side: Side, on: boolean) => (on ? [kit.decal[side], kit.plastic] : kit.plastic)
  const rimDecals = cfg.extras.includes('rims')
  const seat = cfg.extras.includes('seat') ? cfg.colors.primary : '#141414'
  const forkAngle = Math.atan2(FRONT_WHEEL.x - 0.44, 1.1 - FRONT_WHEEL.y)

  const group = useRef<THREE.Group>(null)
  return (
    <group ref={group} position={[-0.03, 0, 0]}>
      {/* Decal panels: [cap material, edge material] */}
      {geo.shroud.map((g, i) => (
        <group key={`s${i}`}>
          <mesh geometry={g.right} material={decal('right', halfOrMore)} position={[0, 0, 0.165]} rotation={[0, 0.08, 0]} castShadow />
          <mesh geometry={g.left} material={decal('left', halfOrMore)} position={[0, 0, -0.165 - 0.018]} rotation={[0, -0.08, 0]} castShadow />
        </group>
      ))}
      {geo.sidePlate.map((g, i) => (
        <group key={`p${i}`}>
          <mesh geometry={g.right} material={decal('right', true)} position={[0, 0, 0.132]} castShadow />
          <mesh geometry={g.left} material={decal('left', true)} position={[0, 0, -0.132 - 0.018]} castShadow />
        </group>
      ))}
      {geo.rearFender.map((g, i) => (
        <mesh key={`r${i}`} geometry={g} material={decal('right', fullKit)} position={[0, 0, -0.13]} castShadow />
      ))}
      {geo.frontFender.map((g, i) => (
        <mesh key={`f${i}`} geometry={g} material={decal('right', fullKit)} position={[0, 0, -0.1]} castShadow />
      ))}
      <group position={[0.57, 1.0, 0]} rotation={[0, 0, 0.42]}>
        <mesh geometry={geo.frontPlate} material={[kit.decal.plate, kit.plastic]} rotation={[0, Math.PI / 2, 0]} />
      </group>

      {/* Bodywork */}
      <RoundedBox args={[0.42, 0.14, 0.26]} radius={0.05} position={[0.12, 0.98, 0]} material={kit.plastic} />
      <RoundedBox args={[1.0, 0.07, 0.22]} radius={0.03} position={[-0.38, 1.04, 0]} rotation={[0, 0, 0.035]}>
        <meshStandardMaterial color={seat} roughness={0.9} />
      </RoundedBox>

      {/* Chassis */}
      {geo.frame.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.frame} />
      ))}
      <mesh geometry={geo.swingarm} material={mats.alu} position={[0, 0, 0.09]} />
      <mesh geometry={geo.swingarm} material={mats.alu} position={[0, 0, -0.125]} />
      <mesh position={[-0.25, 0.7, 0]} rotation={[0, 0, 0.32]}>
        <cylinderGeometry args={[0.035, 0.035, 0.36, 16]} />
        <meshStandardMaterial color="#d9a31f" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Engine */}
      <RoundedBox args={[0.46, 0.36, 0.24]} radius={0.04} position={[-0.0, 0.53, 0]} material={mats.dark} />
      <RoundedBox args={[0.22, 0.2, 0.18]} radius={0.03} position={[0.1, 0.76, 0]} rotation={[0, 0, -0.25]} material={mats.dark} />
      <mesh geometry={geo.exhaust} material={mats.pipe} />
      <mesh position={[-0.7, 0.84, 0.165]} rotation={[0, 0, Math.PI / 2 - 0.2]} material={mats.pipe}>
        <cylinderGeometry args={[0.05, 0.055, 0.55, 24]} />
      </mesh>

      {/* Front end */}
      {[-0.095, 0.095].map((z) => (
        <group key={z} position={[0.44, 1.1, z]} rotation={[0, 0, forkAngle]}>
          <mesh position={[0, -0.25, 0]} material={mats.alu}>
            <cylinderGeometry args={[0.03, 0.03, 0.5, 16]} />
          </mesh>
          <mesh position={[0, -0.6, 0]} material={mats.black}>
            <cylinderGeometry args={[0.026, 0.026, 0.3, 16]} />
          </mesh>
          <RoundedBox args={[0.05, 0.22, 0.03]} radius={0.01} position={[0.03, -0.58, z > 0 ? 0.02 : -0.02]}>
            <meshStandardMaterial color={cfg.colors.primary} roughness={0.4} />
          </RoundedBox>
        </group>
      ))}
      <RoundedBox args={[0.1, 0.05, 0.26]} radius={0.015} position={[0.42, 1.12, 0]} rotation={[0, 0, forkAngle]} material={mats.alu} />
      <mesh geometry={geo.bar} material={mats.alu} />
      {[-0.36, 0.36].map((z) => (
        <mesh key={z} position={[0.33, 1.22, z]} rotation={[Math.PI / 2, 0, 0]} material={mats.black}>
          <cylinderGeometry args={[0.02, 0.02, 0.12, 12]} />
        </mesh>
      ))}
      <RoundedBox args={[0.06, 0.05, 0.16]} radius={0.02} position={[0.37, 1.2, 0]}>
        <meshStandardMaterial color={cfg.colors.accent} roughness={0.7} />
      </RoundedBox>
      {[-0.17, 0.17].map((z) => (
        <mesh key={z} position={[-0.12, 0.5, z]} material={mats.alu}>
          <boxGeometry args={[0.07, 0.025, 0.1]} />
        </mesh>
      ))}

      <Wheel x={REAR_WHEEL.x} y={REAR_WHEEL.y} rimDecal={rimDecals} accent={cfg.colors.accent} />
      <Wheel x={FRONT_WHEEL.x} y={FRONT_WHEEL.y} rimDecal={rimDecals} accent={cfg.colors.accent} front />
    </group>
  )
}
