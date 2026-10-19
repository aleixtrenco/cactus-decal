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

export type ShapeId =
  | 'stripe'
  | 'twin'
  | 'chevron'
  | 'slash'
  | 'star'
  | 'circle'
  | 'triangle'
  | 'flame'
  | 'bolt'
  | 'checker'
  | 'cactus'
  | 'swoosh'
  | 'claw'
  | 'speed'
  | 'arrow'
  | 'diamond'
  | 'hexagon'
  | 'wave'
  | 'dots'
  | 'splat'
  | 'shield'
// A main panel (both sides mirror), the whole kit, or one template piece
// ("p" + its id) such as a fork guard or the front plate.
export type LayerPanel = 'shroud' | 'sidePlate' | 'rearFender' | 'frontFender' | 'kit' | `p${number}`

export const pieceIdOf = (panel: LayerPanel): number | null => (/^p\d+$/.test(panel) ? +panel.slice(1) : null)

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
  // Image only: an uploaded logo (listed in the Logos step).
  logo?: boolean
}

export interface KitConfig {
  bikeId: string
  designId: DesignId
  colors: Palette
  plastics: PlasticsId
  // plateColor: the side plates; frontPlateColor: the front plate (follows
  // the side plates until it is set on its own).
  rider: { name: string; number: string; font: NumberFont; numberColor: string; plateColor: string; frontPlateColor?: string; nameColor: string }
  makeLettering: boolean
  logos: Logo[]
  layers: Layer[]
  // Base colour per part (main panels or single pieces "p<id>"); the plates
  // use the rider's plate colours, the whole kit colors.base.
  partColors: Partial<Record<LayerPanel, Paint>>
  kit: KitId
  finish: FinishId
  material: MaterialId
  extras: ExtraId[]
  notes: string
}

export const defaultConfig = (): KitConfig => {
  const d = designById('factory')
  return {
    // Start on a bike with a real 3D model.
    bikeId: 'husq-tcfc-16',
    designId: d.id,
    colors: { ...d.palette },
    plastics: 'black',
    rider: { name: 'CACTUS', number: '27', font: 'italic', numberColor: '#101010', plateColor: '#e9c88f', nameColor: '#f4f4f2', ...d.rider },
    makeLettering: true,
    logos: [],
    layers: [],
    partColors: {},
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
  [...Object.values(c.colors), ...Object.values(c.partColors ?? {}), c.rider.numberColor, c.rider.plateColor, c.rider.frontPlateColor ?? '', c.rider.nameColor, ...c.layers.map((l) => l.fill)].flatMap(paintColors).some((h) => NEON_HEXES.has(h))

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
  // The panel being designed: new layers go here and it is highlighted.
  panel: LayerPanel
  setPanel: (p: LayerPanel) => void
  duplicateLayer: (id: string) => void
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
  layerTo: (id: string, end: 'front' | 'back') => void
  setStep: (n: number) => void
  load: (c: KitConfig) => void
}

export const useConfig = create<Store>((set) => ({
  config: defaultConfig(),
  step: 0,
  selected: null,
  // Selecting a layer also switches to the panel it is on.
  select: (id) => set((s) => ({ selected: id, panel: s.config.layers.find((l) => l.id === id)?.panel ?? s.panel })),
  panel: 'shroud',
  setPanel: (panel) => set((s) => ({ panel, selected: s.config.layers.find((l) => l.id === s.selected)?.panel === panel ? s.selected : null })),
  duplicateLayer: (id) =>
    set((s) => {
      const l = s.config.layers.find((x) => x.id === id)
      if (!l) return s
      const copy = { ...l, id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), x: l.x + 0.06, y: l.y - 0.06 }
      return { config: { ...s.config, layers: [...s.config.layers, copy] }, selected: copy.id }
    }),
  set: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setRider: (patch) => set((s) => ({ config: { ...s.config, rider: { ...s.config.rider, ...patch } } })),
  setColor: (slot, hex) => set((s) => ({ config: { ...s.config, colors: { ...s.config.colors, [slot]: hex } } })),
  chooseDesign: (id) =>
    set((s) => {
      const d = designById(id)
      const c = s.config
      // A blank start is truly empty: no lettering, number, logos or layers,
      // and plates in the base colour, so the customer builds everything.
      if (id === 'blank')
        return {
          selected: null,
          config: {
            ...c,
            designId: id,
            colors: { ...d.palette },
            makeLettering: false,
            logos: [],
            layers: [],
            partColors: {},
            rider: { ...c.rider, name: '', number: '', plateColor: d.palette.base, frontPlateColor: undefined, numberColor: '#101010', nameColor: '#101010' },
          },
        }
      // Leaving a blank start brings the usual lettering back.
      const fromBlank = c.designId === 'blank'
      const base = defaultConfig().rider
      return {
        config: {
          ...c,
          designId: id,
          colors: { ...d.palette },
          partColors: {},
          makeLettering: fromBlank ? true : c.makeLettering,
          // Each design brings plates and lettering that suit it.
          rider: { ...c.rider, frontPlateColor: undefined, ...(fromBlank ? { name: c.rider.name || base.name, number: c.rider.number || base.number } : {}), ...d.rider },
        },
      }
    }),
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
  // Forward (+1) or backward (-1) past the next item on the same panel:
  // later in the list is drawn on top.
  moveLayer: (id, by) =>
    set((s) => {
      const ls = [...s.config.layers]
      const i = ls.findIndex((l) => l.id === id)
      if (i < 0) return s
      let j = i + by
      while (j >= 0 && j < ls.length && ls[j].panel !== ls[i].panel) j += by
      if (j < 0 || j >= ls.length) return s
      const [l] = ls.splice(i, 1)
      ls.splice(j, 0, l)
      return { config: { ...s.config, layers: ls } }
    }),
  layerTo: (id, end) =>
    set((s) => {
      const l = s.config.layers.find((x) => x.id === id)
      if (!l) return s
      const rest = s.config.layers.filter((x) => x.id !== id)
      return { config: { ...s.config, layers: end === 'front' ? [...rest, l] : [l, ...rest] } }
    }),
  setStep: (n) => set({ step: n }),
  load: (c) => set({ config: c }),
}))
