import { create } from 'zustand'
import { BIKES, bikeById, makeInfo } from '../data/bikes'
import { designById, NEON_HEXES, type DesignId, type LogoSlot, type NumberFont, type Palette } from '../data/designs'
import type { ExtraId, FinishId, KitId, MaterialId, PriceInput } from '../data/pricing'

export type PlasticsId = 'oem' | 'white' | 'black'

export interface Logo {
  id: string
  name: string
  src: string
  slot: LogoSlot
}

export interface KitConfig {
  bikeId: string
  designId: DesignId
  colors: Palette
  plastics: PlasticsId
  rider: { name: string; number: string; font: NumberFont; numberColor: string; plateColor: string; nameColor: string }
  makeLettering: boolean
  logos: Logo[]
  kit: KitId
  finish: FinishId
  material: MaterialId
  extras: ExtraId[]
  notes: string
}

export const defaultConfig = (): KitConfig => {
  const d = designById('dune')
  return {
    bikeId: BIKES[0].id,
    designId: d.id,
    colors: { ...d.palette },
    plastics: 'black',
    rider: { name: 'CACTUS', number: '27', font: 'italic', numberColor: '#101010', plateColor: '#e9c88f', nameColor: '#f4f4f2' },
    makeLettering: true,
    logos: [],
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
  [...Object.values(c.colors), c.rider.numberColor, c.rider.plateColor, c.rider.nameColor].some((h) => NEON_HEXES.has(h))

export const priceInput = (c: KitConfig): PriceInput => ({
  bikeType: bikeById(c.bikeId).type,
  finish: c.finish,
  material: c.material,
  extras: c.extras,
  usesNeon: usesNeon(c),
})

export const STEPS = ['Bike', 'Design', 'Colours', 'Rider', 'Logos', 'Extras', 'Review'] as const
export type Step = (typeof STEPS)[number]

interface Store {
  config: KitConfig
  step: number
  set: (patch: Partial<KitConfig>) => void
  setRider: (patch: Partial<KitConfig['rider']>) => void
  setColor: (slot: keyof Palette, hex: string) => void
  chooseDesign: (id: DesignId) => void
  toggleExtra: (id: ExtraId) => void
  addLogo: (logo: Logo) => void
  updateLogo: (id: string, patch: Partial<Logo>) => void
  removeLogo: (id: string) => void
  setStep: (n: number) => void
  load: (c: KitConfig) => void
}

export const useConfig = create<Store>((set) => ({
  config: defaultConfig(),
  step: 0,
  set: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  setRider: (patch) => set((s) => ({ config: { ...s.config, rider: { ...s.config.rider, ...patch } } })),
  setColor: (slot, hex) => set((s) => ({ config: { ...s.config, colors: { ...s.config.colors, [slot]: hex } } })),
  chooseDesign: (id) => set((s) => ({ config: { ...s.config, designId: id, colors: { ...designById(id).palette } } })),
  toggleExtra: (id) =>
    set((s) => {
      const has = s.config.extras.includes(id)
      return { config: { ...s.config, extras: has ? s.config.extras.filter((e) => e !== id) : [...s.config.extras, id] } }
    }),
  addLogo: (logo) => set((s) => ({ config: { ...s.config, logos: [...s.config.logos, logo] } })),
  updateLogo: (id, patch) =>
    set((s) => ({ config: { ...s.config, logos: s.config.logos.map((l) => (l.id === id ? { ...l, ...patch } : l)) } })),
  removeLogo: (id) => set((s) => ({ config: { ...s.config, logos: s.config.logos.filter((l) => l.id !== id) } })),
  setStep: (n) => set({ step: n }),
  load: (c) => set({ config: c }),
}))
