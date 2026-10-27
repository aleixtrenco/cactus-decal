// Racing fonts for numbers, names and text. The bundled ones are open-licence
// Google fonts; customers can also pick any font from the online Fontsource
// library (1,500+ open-licence fonts, free to print commercially), loaded
// when chosen. `file` is used to turn lettering into vector outlines in print
// files.

import ecUrl from '@fontsource/saira-extra-condensed/files/saira-extra-condensed-latin-800-normal.woff?url'
import s8Url from '@fontsource/saira/files/saira-latin-800-normal.woff?url'
import racingUrl from '@fontsource/racing-sans-one/files/racing-sans-one-latin-400-normal.woff?url'
import russoUrl from '@fontsource/russo-one/files/russo-one-latin-400-normal.woff?url'
import opsUrl from '@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff?url'
import tekoUrl from '@fontsource/teko/files/teko-latin-700-normal.woff?url'
import orbitronUrl from '@fontsource/orbitron/files/orbitron-latin-800-normal.woff?url'
import bungeeUrl from '@fontsource/bungee/files/bungee-latin-400-normal.woff?url'
import bebasUrl from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url'
import michromaUrl from '@fontsource/michroma/files/michroma-latin-400-normal.woff?url'
import audiowideUrl from '@fontsource/audiowide/files/audiowide-latin-400-normal.woff?url'
import fasterUrl from '@fontsource/faster-one/files/faster-one-latin-400-normal.woff?url'
import kanitUrl from '@fontsource/kanit/files/kanit-latin-900-italic.woff?url'
import exoUrl from '@fontsource/exo-2/files/exo-2-latin-900-italic.woff?url'
import bowlbyUrl from '@fontsource/bowlby-one/files/bowlby-one-latin-400-normal.woff?url'
import rubikMonoUrl from '@fontsource/rubik-mono-one/files/rubik-mono-one-latin-400-normal.woff?url'
import goldmanUrl from '@fontsource/goldman/files/goldman-latin-700-normal.woff?url'
import chakraUrl from '@fontsource/chakra-petch/files/chakra-petch-latin-700-italic.woff?url'
import zenDotsUrl from '@fontsource/zen-dots/files/zen-dots-latin-400-normal.woff?url'
import daysOneUrl from '@fontsource/days-one/files/days-one-latin-400-normal.woff?url'

import type { BuiltinFontId, FontId } from './fontIds'
export type { BuiltinFontId, FontId }

export interface FontDef {
  label: string
  family: string
  weight: number
  italic?: boolean
  file: string
  css: (px: number) => string
}

const def = (label: string, family: string, weight: number, file: string, italic = false): FontDef => ({
  label,
  family,
  weight,
  italic,
  file,
  css: (px) => `${italic ? 'italic ' : ''}${weight} ${px}px "${family}"`,
})

export const FONTS: Record<BuiltinFontId, FontDef> = {
  italic: def('Race italic', 'Saira Extra Condensed', 800, ecUrl, true),
  block: def('Block', 'Saira Extra Condensed', 800, ecUrl),
  wide: def('Wide', 'Saira', 800, s8Url),
  racing: def('Racing', 'Racing Sans One', 400, racingUrl),
  russo: def('Russo', 'Russo One', 400, russoUrl),
  ops: def('Stencil', 'Black Ops One', 400, opsUrl),
  teko: def('Teko', 'Teko', 700, tekoUrl),
  orbitron: def('Orbitron', 'Orbitron', 800, orbitronUrl),
  bungee: def('Bungee', 'Bungee', 400, bungeeUrl),
  bebas: def('Bebas', 'Bebas Neue', 400, bebasUrl),
  michroma: def('Michroma', 'Michroma', 400, michromaUrl),
  kanit: def('Kanit', 'Kanit', 900, kanitUrl, true),
  exo: def('Exo', 'Exo 2', 900, exoUrl, true),
  chakra: def('Chakra', 'Chakra Petch', 700, chakraUrl, true),
  audiowide: def('Audiowide', 'Audiowide', 400, audiowideUrl),
  goldman: def('Goldman', 'Goldman', 700, goldmanUrl),
  zendots: def('Zen Dots', 'Zen Dots', 400, zenDotsUrl),
  daysone: def('Days One', 'Days One', 400, daysOneUrl),
  bowlby: def('Bowlby', 'Bowlby One', 400, bowlbyUrl),
  rubikmono: def('Rubik Mono', 'Rubik Mono One', 400, rubikMonoUrl),
  faster: def('Faster', 'Faster One', 400, fasterUrl),
}

export const FONT_IDS = Object.keys(FONTS) as BuiltinFontId[]

// ---------- Online library (Fontsource) ----------

export const FONT_API = 'https://api.fontsource.org/v1/fonts'
const FONT_CDN = 'https://cdn.jsdelivr.net/fontsource/fonts'

export interface LibraryFont {
  id: string
  family: string
  category: string
  weights: number[]
  styles: string[]
  subsets: string[]
}

let catalogue: Promise<LibraryFont[]> | null = null
// Every library font with Latin letters (fetched once).
export function fontCatalogue() {
  catalogue ??= fetch(`${FONT_API}?subsets=latin`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Font library: ${r.status}`))))
    .then((list: LibraryFont[]) => list.filter((f) => f.subsets?.includes('latin') && f.weights?.length))
    .catch((e) => {
      catalogue = null
      throw e
    })
  return catalogue
}

// The id for a library font: its boldest weight up to 800 (lettering reads
// best bold), upright when it has an upright style.
export function libraryFontId(f: LibraryFont): FontId {
  const ws = [...f.weights].sort((a, b) => a - b)
  const weight = [...ws].reverse().find((w) => w <= 800) ?? ws[0]
  const style = f.styles.includes('normal') ? 'normal' : 'italic'
  return `fs:${f.id}:${weight}:${style}`
}

const library = new Map<string, FontDef>()
function libraryDef(id: string): FontDef | null {
  const m = /^fs:([a-z0-9-]+):(\d{3}):(normal|italic)$/.exec(id)
  if (!m) return null
  let d = library.get(id)
  if (d) return d
  const [, slug, w, style] = m
  const file = `${FONT_CDN}/${slug}@latest/latin-${w}-${style}.woff`
  const label = slug.replace(/(^|-)(\w)/g, (_, sp, c) => (sp ? ' ' : '') + c.toUpperCase())
  d = def(label, `CDL ${slug}`, +w, file, style === 'italic')
  // Registered once; the browser downloads it the first time it is drawn.
  if (typeof document !== 'undefined' && typeof FontFace !== 'undefined')
    document.fonts.add(new FontFace(d.family, `url(${file}2) format('woff2'), url(${file}) format('woff')`, { weight: w, style }))
  library.set(id, d)
  return d
}

export const isBuiltinFont = (id: string | undefined): id is BuiltinFontId => !!id && id in FONTS
export const fontById = (id: string | undefined): FontDef => (isBuiltinFont(id) ? FONTS[id] : ((id ? libraryDef(id) : null) ?? FONTS.italic))

// Waits for the fonts a design uses so canvas lettering draws correctly.
export const loadFontFaces = (ids: (FontId | undefined)[]) => Promise.all([...new Set(ids)].map((id) => document.fonts.load(fontById(id).css(40)).catch(() => null)))
