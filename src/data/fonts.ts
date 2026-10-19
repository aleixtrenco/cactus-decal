// Racing fonts for numbers, names and text. All are open-licence Google
// fonts bundled with the site; `file` is used to turn lettering into vector
// outlines in print files.

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

export type FontId = 'block' | 'italic' | 'wide' | 'racing' | 'russo' | 'ops' | 'teko' | 'orbitron' | 'bungee' | 'bebas' | 'michroma'

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

export const FONTS: Record<FontId, FontDef> = {
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
}

export const FONT_IDS = Object.keys(FONTS) as FontId[]
export const fontById = (id: string | undefined) => FONTS[(id as FontId) in FONTS ? (id as FontId) : 'italic']

// Waits for the fonts a design uses so canvas lettering draws correctly.
export const loadFontFaces = (ids: (FontId | undefined)[]) => Promise.all([...new Set(ids)].map((id) => document.fonts.load(fontById(id).css(40)).catch(() => null)))
