// Shared helpers for customer layers: the panels they can go on, ids and
// image uploads.

import type { LayerPanel } from '../store/config'
import { loadImage } from './graphics'

export const PANELS: [LayerPanel, string][] = [
  ['shroud', 'Shroud'],
  ['sidePlate', 'Side plate'],
  ['rearFender', 'Rear fender'],
  ['frontFender', 'Front fender'],
  ['kit', 'Whole kit'],
]
export const panelName = (p: LayerPanel) => PANELS.find(([id]) => id === p)?.[1] ?? 'Whole kit'
// Panels a customer can design on: plates-only orders just have the side plates.
export const panelsAllowed = (plates: boolean) => PANELS.filter(([p]) => !plates || p === 'sidePlate' || p === 'kit')

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

// Shrinks big photos so the design stays quick to edit and upload.
export async function prepareImage(file: File): Promise<string> {
  const src = await new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.onerror = rej
    fr.readAsDataURL(file)
  })
  if (file.type === 'image/svg+xml') return src
  const img = await loadImage(src)
  const max = 1800
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.naturalWidth * k), height: Math.round(img.naturalHeight * k) })
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const png = file.type === 'image/png'
  let out = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.9)
  // Keep uploads under the 2 MB order limit.
  for (let q = 0.8; out.length > 2.6e6 && q > 0.4; q -= 0.15) out = c.toDataURL('image/jpeg', q)
  return out
}
