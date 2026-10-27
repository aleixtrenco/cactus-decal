// Font names on their own (no font files), so data shared with the API can
// refer to them.
// The fonts bundled with the site.
export type BuiltinFontId =
  | 'block'
  | 'italic'
  | 'wide'
  | 'racing'
  | 'russo'
  | 'ops'
  | 'teko'
  | 'orbitron'
  | 'bungee'
  | 'bebas'
  | 'michroma'
  | 'kanit'
  | 'exo'
  | 'chakra'
  | 'audiowide'
  | 'goldman'
  | 'zendots'
  | 'daysone'
  | 'bowlby'
  | 'rubikmono'
  | 'faster'
// A bundled font, or one from the online library: "fs:<id>:<weight>:<style>"
// (an open-licence font on Fontsource, see data/fonts.ts).
export type FontId = BuiltinFontId | `fs:${string}`
