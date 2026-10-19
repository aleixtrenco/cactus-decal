import { parsePaint } from '../lib/paint.js'
import type { FontId } from './fontIds.js'
export type DesignId = 'factory' | 'sugar' | 'retro' | 'speedblock' | 'ysplit' | 'chrome' | 'dune' | 'saguaro' | 'shamal' | 'falcon' | 'hex' | 'mirage' | 'camo' | 'clean' | 'blank'

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
  // Number plates and lettering that suit the design.
  rider?: { plateColor: string; numberColor: string; nameColor: string; font: FontId }
  // Older designs kept so saved kits and orders still render.
  hidden?: boolean
}

export const DESIGNS: Design[] = [
  { id: 'blank', name: 'Blank', blurb: 'An empty kit: build it yourself with shapes, text and photos', palette: { base: '#f4f4f2', primary: '#101010', secondary: '#8a8f96', accent: '#5fae2e' } },
  // Current designs, each inspired by a kit we printed for a customer.
  {
    id: 'factory',
    name: 'Factory Strike',
    blurb: 'Black with swept white arrows, purple and orange slashes',
    palette: { base: '#101010', primary: '#f4f4f2', secondary: '#5b2a86', accent: '#ff6a13' },
    rider: { plateColor: '#101010', numberColor: '#f4f4f2', nameColor: '#f4f4f2', font: 'block' },
  },
  {
    id: 'sugar',
    name: 'Sugar Rush',
    blurb: 'Waffle cone, pink icing and sprinkles',
    palette: { base: '#f4f4f2', primary: '#f2a541', secondary: '#e0218a', accent: '#b8692c' },
    rider: { plateColor: 'lg(#ffd27a,#f2a541,90)', numberColor: '#e0218a', nameColor: '#e0218a', font: 'bungee' },
  },
  {
    id: 'retro',
    name: 'Retro Shot',
    blurb: 'Black with orange and red pinstripe swooshes',
    palette: { base: '#101010', primary: '#ff6a13', secondary: '#d4001f', accent: '#f4f4f2' },
    rider: { plateColor: '#ffd200', numberColor: '#101010', nameColor: '#f4f4f2', font: 'italic' },
  },
  {
    id: 'speedblock',
    name: 'Speed Block',
    blurb: 'Heritage blue with red and white speed blocks',
    palette: { base: '#1546b8', primary: '#d4001f', secondary: '#f4f4f2', accent: '#101010' },
    rider: { plateColor: '#f4f4f2', numberColor: '#101010', nameColor: '#f4f4f2', font: 'wide' },
  },
  {
    id: 'ysplit',
    name: 'Y-Split',
    blurb: 'A bold flag-style Y in four colours',
    palette: { base: '#d4001f', primary: '#007a4d', secondary: '#1546b8', accent: '#ffb612' },
    rider: { plateColor: '#f4f4f2', numberColor: '#101010', nameColor: '#f4f4f2', font: 'russo' },
  },
  {
    id: 'chrome',
    name: 'Chrome Fade',
    blurb: 'Orange to magenta fade with black cut-outs',
    palette: { base: 'lg(#ff8a00,#b5179e,300)', primary: '#101010', secondary: '#00b4d8', accent: '#f4f4f2' },
    rider: { plateColor: '#101010', numberColor: '#f4f4f2', nameColor: '#f4f4f2', font: 'block' },
  },
  { id: 'dune', name: 'Dune Line', blurb: 'Layered sand ridges that flow nose to tail', palette: { base: '#101010', primary: '#e9c88f', secondary: '#c2783a', accent: '#5fae2e' }, hidden: true },
  { id: 'shamal', name: 'Shamal', blurb: 'Wind-cut slashes built for speed', palette: { base: '#f4f4f2', primary: '#101010', secondary: '#ff6a13', accent: '#ffd200' }, hidden: true },
  { id: 'saguaro', name: 'Saguaro', blurb: 'Cactus ribs and spines, our signature', palette: { base: '#0f1a0c', primary: '#5fae2e', secondary: '#f4f4f2', accent: '#ffd200' }, hidden: true },
  { id: 'falcon', name: 'Falcon', blurb: 'Stacked chevrons, wings swept back', palette: { base: '#1546b8', primary: '#f4f4f2', secondary: '#101010', accent: '#ffd200' }, hidden: true },
  { id: 'hex', name: 'Hive', blurb: 'Honeycomb fade over a bold lower block', palette: { base: '#101010', primary: '#ff6a13', secondary: '#2b2b2b', accent: '#f4f4f2' }, hidden: true },
  { id: 'mirage', name: 'Mirage', blurb: 'Halftone heat haze with clean stripes', palette: { base: '#f4f4f2', primary: '#d4001f', secondary: '#101010', accent: '#00b4d8' }, hidden: true },
  { id: 'camo', name: 'Desert Camo', blurb: 'Digital camo in sand, rock and shadow', palette: { base: '#d9c49a', primary: '#a8875a', secondary: '#5c4a33', accent: '#101010' }, hidden: true },
  { id: 'clean', name: 'Factory Clean', blurb: 'Minimal stripe, maximum class', palette: { base: '#f4f4f2', primary: '#101010', secondary: '#8a8f96', accent: '#5fae2e' }, hidden: true },
]

export const designById = (id: DesignId) => DESIGNS.find((d) => d.id === id) ?? DESIGNS[1]
// Ready-made designs (everything except the blank start).
export const PRESETS = DESIGNS.filter((d) => d.id !== 'blank' && !d.hidden)

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
export const swatchName = (paint: string) => {
  const q = parsePaint(paint)
  const name = (hex: string) => SWATCHES.find((s) => s.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex.toUpperCase()
  return q.kind === 'solid' ? name(q.hex) : `${name(q.a)} → ${name(q.b)}`
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
