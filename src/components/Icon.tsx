// Stroke icons (Lucide-style, 24px grid, 2px stroke). Decorative by default;
// pass `label` when the icon carries meaning on its own.

const PATHS = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  chevron: 'm6 9 6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  camera: 'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  layers: 'm12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.1.2 1.7-.5.7-1.6 1-2.7 1zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  cube: 'M21 16V8l-9-5-9 5v8l9 5 9-5zM3.3 7 12 12l8.7-5M12 22V12',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  message: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 7l9 6 9-6',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, size = 20, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
