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

import type { FontId } from './fontIds'
export type { FontId }

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

export const FONT_IDS = Object.keys(FONTS) as FontId[]
export const fontById = (id: string | undefined) => FONTS[(id as FontId) in FONTS ? (id as FontId) : 'italic']

// Waits for the fonts a design uses so canvas lettering draws correctly.
export const loadFontFaces = (ids: (FontId | undefined)[]) => Promise.all([...new Set(ids)].map((id) => document.fonts.load(fontById(id).css(40)).catch(() => null)))
