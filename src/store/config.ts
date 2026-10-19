import { create } from 'zustand'
import { bikeById, makeInfo } from '../data/bikes'
import { designById, NEON_HEXES, type DesignId, type LogoSlot, type Palette } from '../data/designs'
import type { FontId, FontId as NumberFont } from '../data/fonts'
import { paintColors, type Paint } from '../lib/paint'
import type { ExtraId, FinishId, KitId, MaterialId, PriceInput } from '../data/pricing'

export type PlasticsId = 'oem' | 'white' | 'black'

export interface Logo {
  id: string
  name: string
  src: string
  slot: LogoSlot
}

export type ShapeId = 'stripe' | 'twin' | 'chevron' | 'slash' | 'star' | 'circle' | 'triangle' | 'flame' | 'bolt' | 'checker' | 'cactus'
export type LayerPanel = 'shroud' | 'sidePlate' | 'rearFender' | 'kit'

// Something the customer added on top of the design: a shape, a line of
// text or an image. Position (x, y) is 0–1 across the panel; size is the
// height as a share of the panel's height; rotation in degrees.
export interface Layer {
  id: string
  kind: 'shape' | 'text' | 'image'
  panel: LayerPanel
  x: number
  y: number
  size: number
  rotation: number
  opacity: number
  fill: Paint
  outline?: string
  shape?: ShapeId
  text?: string
  font?: FontId
  src?: string
  name?: string
  // Image only: stretch over the whole kit as the background.
  cover?: boolean
}

export interface KitConfig {
  bikeId: string
  designId: DesignId
  colors: Palette
  plastics: PlasticsId
  rider: { name: string; number: string; font: NumberFont; numberColor: string; plateColor: string; nameColor: string }
  makeLettering: boolean
  logos: Logo[]
  layers: Layer[]
  kit: KitId
  finish: FinishId
  material: MaterialId
  extras: ExtraId[]
  notes: string
}

export const defaultConfig = (): KitConfig => {
  const d = designById('dune')
  return {
    // Start on a bike with a real 3D model.
    bikeId: 'husq-tcfc-16',
    designId: d.id,
    colors: { ...d.palette },
    plastics: 'black',
    rider: { name: 'CACTUS', number: '27', font: 'italic', numberColor: '#101010', plateColor: '#e9c88f', nameColor: '#f4f4f2' },
    makeLettering: true,
    logos: [],
    layers: [],
    kit: 'full',
    finish: 'gloss',
    material: 'standard',
    extras: [],
    notes: '',
  }
}

export const plasticsHex = (c: KitConfig) =>
  c.plastics === 'white' ? '#f4f4f2' : c.plastics === 'black' ? '#141414' : makeInfo(bikeById(c.bikeId).make).oem

export const usesNeon = (c: KitConfig) =>
  [...Object.values(c.colors), c.rider.numberColor, c.rider.plateColor, c.rider.nameColor, ...c.layers.map((l) => l.fill)].flatMap(paintColors).some((h) => NEON_HEXES.has(h))

export const priceInput = (c: KitConfig): PriceInput => ({
  kit: c.kit,
  bikeType: bikeById(c.bikeId).type,
  finish: c.finish,
  material: c.material,
  extras: c.extras,
  usesNeon: usesNeon(c),
})

export const platesOnly = (c: { kit?: KitId }) => c.kit === 'plates'

export const STEPS = ['Bike', 'Design', 'Colours', 'Graphics', 'Rider', 'Logos', 'Extras', 'Review'] as const
export type Step = (typeof STEPS)[number]

interface Store {
  config: KitConfig
  step: number
  // The layer being edited (shared by the Graphics panel and the designer).
  selected: string | null
  select: (id: string | null) => void
  set: (patch: Partial<KitConfig>) => void
  setRider: (patch: Partial<KitConfig['rider']>) => void
  setColor: (slot: keyof Palette, hex: string) => void
  chooseDesign: (id: DesignId) => void
  toggleExtra: (id: ExtraId) => void
  addLogo: (logo: Logo) => void
  updateLogo: (id: string, patch: Partial<Logo>) => void
  removeLogo: (id: string) => void
  addLayer: (layer: Layer) => void
  updateLayer: (id: string, patch: Partial<Layer>) => void
  removeLayer: (id: string) => void
  moveLayer: (id: string, by: number) => void
  setStep: (n: number) => void
  load: (c: KitConfig) => void
}

export const useConfig = create<Store>((set) => ({
  config: defaultConfig(),
  step: 0,
  selected: null,
  select: (id) => set({ selected: id }),
  set: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setRider: (patch) => set((s) => ({ config: { ...s.config, rider: { ...s.config.rider, ...patch } } })),
  setColor: (slot, hex) => set((s) => ({ config: { ...s.config, colors: { ...s.config.colors, [slot]: hex } } })),
  chooseDesign: (id) =>
    set((s) => ({
      // A blank start also drops the make lettering, so the kit is truly empty.
      config: { ...s.config, designId: id, colors: { ...designById(id).palette }, makeLettering: id === 'blank' ? false : s.config.designId === 'blank' ? true : s.config.makeLettering },
    })),
  toggleExtra: (id) =>
    set((s) => {
      const has = s.config.extras.includes(id)
      return { config: { ...s.config, extras: has ? s.config.extras.filter((e) => e !== id) : [...s.config.extras, id] } }
    }),
  addLogo: (logo) => set((s) => ({ config: { ...s.config, logos: [...s.config.logos, logo] } })),
  updateLogo: (id, patch) =>
    set((s) => ({ config: { ...s.config, logos: s.config.logos.map((l) => (l.id === id ? { ...l, ...patch } : l)) } })),
  removeLogo: (id) => set((s) => ({ config: { ...s.config, logos: s.config.logos.filter((l) => l.id !== id) } })),
  addLayer: (layer) => set((s) => ({ config: { ...s.config, layers: [...s.config.layers, layer] } })),
  updateLayer: (id, patch) =>
    set((s) => ({ config: { ...s.config, layers: s.config.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) } })),
  removeLayer: (id) => set((s) => ({ config: { ...s.config, layers: s.config.layers.filter((l) => l.id !== id) } })),
  moveLayer: (id, by) =>
    set((s) => {
      const ls = [...s.config.layers]
      const i = ls.findIndex((l) => l.id === id)
      const j = Math.max(0, Math.min(ls.length - 1, i + by))
      if (i < 0 || i === j) return s
      ;[ls[i], ls[j]] = [ls[j], ls[i]]
      return { config: { ...s.config, layers: ls } }
    }),
  setStep: (n) => set({ step: n }),
  load: (c) => set({ config: c }),
}))
