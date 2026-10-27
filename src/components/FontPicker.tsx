import { useEffect, useMemo, useState } from 'react'
import { FONT_IDS, fontById, fontCatalogue, isBuiltinFont, libraryFontId, type FontId, type LibraryFont } from '../data/fonts'

const CATEGORIES: [string, string][] = [
  ['display', 'Display'],
  ['sans-serif', 'Sans'],
  ['serif', 'Serif'],
  ['handwriting', 'Script'],
  ['monospace', 'Mono'],
]
const PAGE = 24

// The bundled racing fonts, plus a searchable library of 1,500+ open-licence
// fonts (Fontsource) that load when they are shown.
export default function FontPicker({ value, onChange, sample }: { value: FontId | undefined; onChange: (f: FontId) => void; sample?: string }) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<LibraryFont[] | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('display')
  const [shown, setShown] = useState(PAGE)

  useEffect(() => {
    if (!open || list) return
    fontCatalogue()
      .then(setList)
      .catch(() => setError(true))
  }, [open, list])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => (list ?? []).filter((f) => (q ? f.family.toLowerCase().includes(q) : f.category === category)), [list, q, category])
  const current = value && !isBuiltinFont(value) ? fontById(value) : null

  return (
    <>
      <div className="chips">
        {FONT_IDS.map((f) => (
          <button key={f} className="chip font-chip" aria-pressed={value === f} onClick={() => onChange(f)} style={{ font: fontById(f).css(18) }}>
            {fontById(f).label}
          </button>
        ))}
        {current && (
          <button className="chip font-chip" aria-pressed="true" style={{ font: current.css(18) }}>
            {current.label}
          </button>
        )}
        <button className="chip chip-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Close font library' : 'More fonts…'}
        </button>
      </div>
      {open && (
        <div className="font-library">
          <input className="input" type="search" placeholder="Search 1,500+ fonts, e.g. racing, stencil, graffiti" value={query} onChange={(e) => (setQuery(e.target.value), setShown(PAGE))} aria-label="Search fonts" />
          {!q && (
            <div className="chips" style={{ marginTop: 10 }}>
              {CATEGORIES.map(([id, label]) => (
                <button key={id} className="chip chip-sm" aria-pressed={category === id} onClick={() => (setCategory(id), setShown(PAGE))}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {error && <p className="note">The font library could not be reached. Check your connection and try again.</p>}
          {!list && !error && <p className="note">Loading fonts…</p>}
          {list && (
            <>
              <div className="font-grid">
                {matches.slice(0, shown).map((f) => {
                  const id = libraryFontId(f)
                  return (
                    <button key={f.id} className="font-pick" aria-pressed={value === id} onClick={() => onChange(id)} title={f.family}>
                      <span style={{ font: fontById(id).css(22) }}>{sample || '27 RACE'}</span>
                      <small>{f.family}</small>
                    </button>
                  )
                })}
              </div>
              {!matches.length && <p className="note">No font matches “{query}”.</p>}
              {matches.length > shown && (
                <button className="chip chip-sm" style={{ marginTop: 10 }} onClick={() => setShown(shown + PAGE)}>
                  Show more ({matches.length - shown})
                </button>
              )}
              <p className="note">Open-licence fonts from Fontsource, free to print on your kit.</p>
            </>
          )}
        </div>
      )}
    </>
  )
}
