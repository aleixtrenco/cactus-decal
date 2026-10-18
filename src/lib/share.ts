import { defaultConfig, type KitConfig } from '../store/config'

// Encodes a design (minus uploaded logos, which are too big for a URL) into
// a compact URL-safe string so customers can save or share their kit.
export function encodeConfig(c: KitConfig) {
  const { logos: _logos, ...rest } = c
  void _logos
  const json = JSON.stringify(rest)
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeConfig(s: string): KitConfig | null {
  try {
    const json = decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))
    const parsed = JSON.parse(json)
    const base = defaultConfig()
    return { ...base, ...parsed, colors: { ...base.colors, ...parsed.colors }, rider: { ...base.rider, ...parsed.rider }, logos: [] }
  } catch {
    return null
  }
}
