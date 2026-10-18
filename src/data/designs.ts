export type DesignId = 'dune' | 'saguaro' | 'shamal' | 'falcon' | 'hex' | 'mirage' | 'camo' | 'clean'

export interface Palette {
  base: string
  primary: string
  secondary: string
  accent: string
}

export interface Design {
  id: DesignId
  name: string
  blurb: string
  palette: Palette
}

export const DESIGNS: Design[] = [
  { id: 'dune', name: 'Dune Line', blurb: 'Layered sand ridges that flow nose to tail', palette: { base: '#101010', primary: '#e9c88f', secondary: '#c2783a', accent: '#5fae2e' } },
  { id: 'shamal', name: 'Shamal', blurb: 'Wind-cut slashes built for speed', palette: { base: '#f4f4f2', primary: '#101010', secondary: '#ff6a13', accent: '#ffd200' } },
  { id: 'saguaro', name: 'Saguaro', blurb: 'Cactus ribs and spines, our signature', palette: { base: '#0f1a0c', primary: '#5fae2e', secondary: '#f4f4f2', accent: '#ffd200' } },
  { id: 'falcon', name: 'Falcon', blurb: 'Stacked chevrons, wings swept back', palette: { base: '#1546b8', primary: '#f4f4f2', secondary: '#101010', accent: '#ffd200' } },
  { id: 'hex', name: 'Hive', blurb: 'Honeycomb fade over a bold lower block', palette: { base: '#101010', primary: '#ff6a13', secondary: '#2b2b2b', accent: '#f4f4f2' } },
  { id: 'mirage', name: 'Mirage', blurb: 'Halftone heat haze with clean stripes', palette: { base: '#f4f4f2', primary: '#d4001f', secondary: '#101010', accent: '#00b4d8' } },
  { id: 'camo', name: 'Desert Camo', blurb: 'Digital camo in sand, rock and shadow', palette: { base: '#d9c49a', primary: '#a8875a', secondary: '#5c4a33', accent: '#101010' } },
  { id: 'clean', name: 'Factory Clean', blurb: 'Minimal stripe, maximum class', palette: { base: '#f4f4f2', primary: '#101010', secondary: '#8a8f96', accent: '#5fae2e' } },
]

export const designById = (id: DesignId) => DESIGNS.find((d) => d.id === id) ?? DESIGNS[0]

export interface Swatch {
  name: string
  hex: string
  neon?: boolean
}

export const SWATCHES: Swatch[] = [
  { name: 'Black', hex: '#101010' },
  { name: 'Graphite', hex: '#2b2b2b' },
  { name: 'Steel', hex: '#8a8f96' },
  { name: 'White', hex: '#f4f4f2' },
  { name: 'Sand', hex: '#e9c88f' },
  { name: 'Desert', hex: '#d9c49a' },
  { name: 'Dune', hex: '#a8875a' },
  { name: 'Rust', hex: '#c2783a' },
  { name: 'Earth', hex: '#5c4a33' },
  { name: 'Orange', hex: '#ff6a13' },
  { name: 'Red', hex: '#d4001f' },
  { name: 'Yellow', hex: '#ffd200' },
  { name: 'Cactus', hex: '#5fae2e' },
  { name: 'Kawa Green', hex: '#5dbb2f' },
  { name: 'Forest', hex: '#0f1a0c' },
  { name: 'Royal Blue', hex: '#1546b8' },
  { name: 'Navy', hex: '#14213d' },
  { name: 'Teal', hex: '#00b4d8' },
  { name: 'Purple', hex: '#5b2a86' },
  { name: 'Neon Lime', hex: '#c8ff3d', neon: true },
  { name: 'Neon Green', hex: '#8cd63a', neon: true },
  { name: 'Neon Pink', hex: '#ff2e63', neon: true },
  { name: 'Neon Orange', hex: '#ff8a00', neon: true },
  { name: 'Neon Yellow', hex: '#f2ff00', neon: true },
]

export const NEON_HEXES = new Set(SWATCHES.filter((s) => s.neon).map((s) => s.hex))
export const swatchName = (hex: string) => SWATCHES.find((s) => s.hex === hex)?.name ?? hex

export type NumberFont = 'block' | 'italic' | 'wide'
export const NUMBER_FONTS: Record<NumberFont, { label: string; css: (px: number) => string }> = {
  block: { label: 'Block', css: (px) => `800 ${px}px "Saira Extra Condensed"` },
  italic: { label: 'Race italic', css: (px) => `italic 800 ${px}px "Saira Extra Condensed"` },
  wide: { label: 'Wide', css: (px) => `800 ${px}px "Saira"` },
}

export type LogoSlot = 'shroud-top' | 'shroud-low' | 'plate-top' | 'fender'
// Logo positions, relative to a panel's bounding box (0–1, y measured up),
// so they follow the panel shape of any uploaded template.
export type PanelKey = 'shroud' | 'sidePlate' | 'rearFender'
export interface Placement {
  panel: PanelKey
  rx: number
  ry: number
  rw: number
  rh: number
}
export const LOGO_SLOTS: Record<LogoSlot, Placement & { label: string }> = {
  'shroud-top': { label: 'Shroud, top', panel: 'shroud', rx: 0.46, ry: 0.88, rw: 0.29, rh: 0.09 },
  'shroud-low': { label: 'Shroud, lower', panel: 'shroud', rx: 0.65, ry: 0.15, rw: 0.25, rh: 0.11 },
  'plate-top': { label: 'Side plate, top', panel: 'sidePlate', rx: 0.5, ry: 0.82, rw: 0.4, rh: 0.15 },
  fender: { label: 'Rear fender', panel: 'rearFender', rx: 0.22, ry: 0.55, rw: 0.16, rh: 0.21 },
}

export const TEXT_PLACEMENTS: Record<'number' | 'name' | 'make' | 'tag', Placement> = {
  number: { panel: 'sidePlate', rx: 0.5, ry: 0.45, rw: 0.7, rh: 0.62 },
  name: { panel: 'shroud', rx: 0.5, ry: 0.38, rw: 0.58, rh: 0.155 },
  make: { panel: 'shroud', rx: 0.46, ry: 0.69, rw: 0.65, rh: 0.19 },
  tag: { panel: 'rearFender', rx: 0.49, ry: 0.27, rw: 0.3, rh: 0.126 },
}
