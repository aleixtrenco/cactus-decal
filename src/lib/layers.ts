// Shared helpers for customer layers: the panels they can go on, ids and
// image uploads.

import { pieceIdOf, type LayerPanel } from '../store/config'
import { loadImage } from './graphics'
import { panelKey, twinOf, type BikeTemplate, type Role, type TemplatePiece } from './templates'

export const PANELS: [LayerPanel, string][] = [
  ['shroud', 'Shroud'],
  ['sidePlate', 'Side plate'],
  ['rearFender', 'Rear fender'],
  ['frontFender', 'Front fender'],
  ['kit', 'Whole kit'],
]
const MAIN: Role[] = ['shroud', 'sidePlate', 'rearFender', 'frontFender']
const SIDE = { right: 'right', left: 'left', center: 'centre' }

// Every template piece that isn't one of the main panels is a panel of its
// own (front plate, fork guards, fender centre, trim), so all of them can be
// designed. Numbered left to right as they sit on the template.
export function piecePanels(t: BikeTemplate | undefined, plates: boolean): { panel: LayerPanel; label: string; piece: TemplatePiece }[] {
  if (!t) return []
  // A pair of matching pieces (one per side) is one panel, named by its
  // right-hand piece.
  const own = t.pieces
    .filter((p) => p.parent === undefined && p.role !== 'ignore' && !MAIN.includes(p.role))
    .filter((p) => !plates || p.role === 'frontPlate')
    .filter((p) => panelKey(p, t.pieces) === `p${p.id}`)
    .sort((a, b) => a.bbox.x - b.bbox.x || a.bbox.y - b.bbox.y)
  // Pieces laid on the front fender (its centre strip) are named for it.
  const fender = t.pieces.find((p) => p.role === 'frontFender' && p.side === 'center')
  const onFender = (p: TemplatePiece) => {
    if (!fender || p.side !== 'center') return false
    const cx = p.bbox.x + p.bbox.w / 2
    const cy = p.bbox.y + p.bbox.h / 2
    const b = fender.bbox
    return cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h
  }
  let n = 0
  const frontPlates = own.filter((p) => p.role === 'frontPlate')
  const fenders = own.filter(onFender)
  // Numbered only when a template has more than one (e.g. two plate options).
  const nth = (list: TemplatePiece[], p: TemplatePiece) => (list.length > 1 ? ` ${list.indexOf(p) + 1}` : '')
  return own.map((p) => ({
    panel: `p${p.id}` as LayerPanel,
    piece: p,
    label: p.role === 'frontPlate' ? `Front plate${nth(frontPlates, p)}` : onFender(p) ? `Fender centre${nth(fenders, p)}` : `Trim ${++n} · ${twinOf(p, t.pieces) ? 'both sides' : SIDE[p.side]}`,
  }))
}

export function panelName(p: LayerPanel, t?: BikeTemplate) {
  if (pieceIdOf(p) !== null) return piecePanels(t, false).find((x) => x.panel === p)?.label ?? 'Piece'
  return PANELS.find(([id]) => id === p)?.[1] ?? 'Whole kit'
}
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
