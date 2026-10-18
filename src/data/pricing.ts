// All prices in AED. PLACEHOLDER VALUES: replace with the real Cactus Decal Lab
// price list before going live. This file is shared by the website and the
// Stripe checkout function, so the price a customer sees is the price they pay.

export const CURRENCY = 'AED'

export type KitId = 'full' | 'half' | 'plates'
export type FinishId = 'gloss' | 'matte' | 'chrome' | 'holo'
export type MaterialId = 'standard' | 'premium'
export type ExtraId = 'rims' | 'forks' | 'seat' | 'mini' | 'install'

export const KITS: Record<KitId, { label: string; price: number; parts: string }> = {
  full: { label: 'Full kit', price: 1190, parts: 'Shrouds, side plates, front plate, both fenders, fork guards' },
  half: { label: 'Half kit', price: 790, parts: 'Shrouds, side plates, front plate' },
  plates: { label: 'Number plates', price: 390, parts: 'Side plates and front plate' },
}

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
  forks: { label: 'Fork guard decals', price: 90, note: 'Included with full kit' },
  seat: { label: 'Gripper seat cover', price: 350, note: 'Printed to match your design' },
  mini: { label: 'Mini plates', price: 60, note: 'Helmet and pit-board size' },
  install: { label: 'Professional fitting (Dubai)', price: 150, note: 'We apply it at our workshop' },
}

export const NEON_SURCHARGE = 75

export interface PriceInput {
  kit: KitId
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
  const lines: PriceLine[] = [{ label: KITS[p.kit].label, amount: KITS[p.kit].price }]
  if (FINISHES[p.finish].price) lines.push({ label: `${FINISHES[p.finish].label} finish`, amount: FINISHES[p.finish].price })
  if (MATERIALS[p.material].price) lines.push({ label: MATERIALS[p.material].label, amount: MATERIALS[p.material].price })
  if (p.usesNeon) lines.push({ label: 'Neon inks', amount: NEON_SURCHARGE })
  for (const id of p.extras) {
    // Fork guard decals come with the full kit.
    if (id === 'forks' && p.kit === 'full') continue
    lines.push({ label: EXTRAS[id].label, amount: EXTRAS[id].price })
  }
  return lines
}

export const priceTotal = (p: PriceInput) => priceLines(p).reduce((s, l) => s + l.amount, 0)

export const formatAED = (n: number) => `AED ${n.toLocaleString('en-AE')}`
