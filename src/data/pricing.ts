// All prices in AED. Kit prices are Cactus Decal Lab's real prices; finish,
// material and extras prices are PLACEHOLDERS until confirmed. This file is shared by the website and the
// Stripe checkout function, so the price a customer sees is the price they pay.

import type { BikeType } from './bikes.js'

export const CURRENCY = 'AED'

export type KitId = 'full' | 'plates'
export type FinishId = 'gloss' | 'matte' | 'chrome' | 'holo'
export type MaterialId = 'standard' | 'premium'
export type ExtraId = 'rims' | 'seat' | 'mini' | 'install'

// A fully custom full kit; the price depends on the bike type.
export const KIT_PRICES: Record<BikeType, { label: string; price: number }> = {
  MX: { label: 'Custom motocross graphics kit', price: 900 },
  Trail: { label: 'Custom trail bike graphics kit', price: 1300 },
}
export const KIT_PARTS = 'Every piece of your model’s template: shrouds, side plates, front plate, fenders and the extra trim pieces'

// Number plates only: the front plate and both side plates, any bike.
export const PLATES_KIT = { label: 'Custom number plates (front + sides)', price: 400 }
export const PLATES_PARTS = 'Front number plate and both side plates, cut to your model’s template'

export const kitPrice = (kit: KitId | undefined, type: BikeType) => (kit === 'plates' ? PLATES_KIT : KIT_PRICES[type])

export const FINISHES: Record<FinishId, { label: string; price: number; note: string }> = {
  gloss: { label: 'Gloss', price: 0, note: 'Deep shine, easiest to clean' },
  matte: { label: 'Matte', price: 150, note: 'Stealth look, no glare' },
  chrome: { label: 'Chrome', price: 350, note: 'Mirror metallic laminate' },
  holo: { label: 'Holographic', price: 450, note: 'Colour-shifting rainbow film' },
}

export const MATERIALS: Record<MaterialId, { label: string; price: number; note: string }> = {
  standard: { label: 'Race 0.21 mm', price: 0, note: 'Standard thickness' },
  premium: { label: 'Armour 0.40 mm', price: 200, note: 'Extra thick for roost and boots' },
}

export const EXTRAS: Record<ExtraId, { label: string; price: number; note: string }> = {
  rims: { label: 'Rim decals', price: 120, note: 'Matching stripes for both rims' },
  seat: { label: 'Gripper seat cover', price: 350, note: 'Printed to match your design' },
  mini: { label: 'Mini plates', price: 60, note: 'Helmet and pit-board size' },
  install: { label: 'Professional fitting (Dubai)', price: 150, note: 'We apply it at our workshop' },
}

export const NEON_SURCHARGE = 75

export interface PriceInput {
  kit?: KitId
  bikeType: BikeType
  finish: FinishId
  material: MaterialId
  extras: ExtraId[]
  usesNeon: boolean
}

export interface PriceLine {
  label: string
  amount: number
}

export function priceLines(p: PriceInput): PriceLine[] {
  const kit = kitPrice(p.kit, p.bikeType)
  const lines: PriceLine[] = [{ label: kit.label, amount: kit.price }]
  if (FINISHES[p.finish].price) lines.push({ label: `${FINISHES[p.finish].label} finish`, amount: FINISHES[p.finish].price })
  if (MATERIALS[p.material].price) lines.push({ label: MATERIALS[p.material].label, amount: MATERIALS[p.material].price })
  if (p.usesNeon) lines.push({ label: 'Neon inks', amount: NEON_SURCHARGE })
  for (const id of p.extras) {
    lines.push({ label: EXTRAS[id].label, amount: EXTRAS[id].price })
  }
  return lines
}

export const priceTotal = (p: PriceInput) => priceLines(p).reduce((s, l) => s + l.amount, 0)

export const formatAED = (n: number) => `AED ${n.toLocaleString('en-AE')}`
