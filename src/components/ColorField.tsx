import { useEffect, useId, useState } from 'react'
import { SWATCHES } from '../data/designs'
import { gradient, paintCss, parsePaint, validHex, type Paint } from '../lib/paint'

// Pick a colour: a preset swatch, any hex code or the system colour picker,
// and optionally a two-colour gradient with an angle.
export default function ColorField({ value, onChange, label, allowGradient = true }: { value: Paint; onChange: (p: Paint) => void; label: string; allowGradient?: boolean }) {
  const id = useId()
  const q = parsePaint(value)
  const a = q.kind === 'solid' ? q.hex : q.a
  const b = q.kind === 'linear' ? q.b : '#ffffff'
  const angle = q.kind === 'linear' ? q.angle : 0
  const isGrad = q.kind === 'linear'
  // Which end of the gradient the swatches and hex box edit.
  const [end, setEnd] = useState<'a' | 'b'>('a')
  const current = isGrad && end === 'b' ? b : a
  const [hex, setHex] = useState(current.toUpperCase())
  useEffect(() => setHex(current.toUpperCase()), [current])

  const setColor = (c: string) => {
    if (!isGrad) onChange(c)
    else onChange(end === 'a' ? gradient(c, b, angle) : gradient(a, c, angle))
  }
  const commitHex = (raw: string) => {
    const v = (raw.startsWith('#') ? raw : `#${raw}`).toLowerCase()
    if (validHex(v)) setColor(v)
    else setHex(current.toUpperCase())
  }

  return (
    <div className="color-field" role="group" aria-label={label}>
      {allowGradient && (
        <div className="chips" style={{ marginBottom: 10 }}>
          <button className="chip chip-sm" aria-pressed={!isGrad} onClick={() => (setEnd('a'), onChange(a))}>
            Solid
          </button>
          <button className="chip chip-sm" aria-pressed={isGrad} onClick={() => !isGrad && onChange(gradient(a, b === a ? '#ffffff' : b, 0))}>
            Gradient
          </button>
          {isGrad && (
            <>
              <button className="chip chip-sm grad-end" aria-pressed={end === 'a'} onClick={() => setEnd('a')} aria-label="Edit start colour">
                <i style={{ background: a }} /> Start
              </button>
              <button className="chip chip-sm grad-end" aria-pressed={end === 'b'} onClick={() => setEnd('b')} aria-label="Edit end colour">
                <i style={{ background: b }} /> End
              </button>
            </>
          )}
        </div>
      )}
      <div className="swatch-row">
        {SWATCHES.map((s) => (
          <button key={s.hex} className="swatch" style={{ background: s.hex, color: s.hex }} aria-pressed={current.toLowerCase() === s.hex.toLowerCase()} aria-label={`${s.name}${s.neon ? ' (neon)' : ''}`} title={s.name} onClick={() => setColor(s.hex)}>
            {s.neon && <span className="neon" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="hex-row">
        <span className="hex-preview" style={{ background: paintCss(value) }} aria-hidden="true" />
        <label className="sr-only" htmlFor={`${id}-hex`}>
          {label} hex code
        </label>
        <input
          id={`${id}-hex`}
          className="input hex-input"
          value={hex}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => setHex(e.target.value.toUpperCase())}
          onBlur={(e) => commitHex(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commitHex((e.target as HTMLInputElement).value)}
        />
        <label className="picker" title="Pick any colour">
          <span className="sr-only">{label}: pick any colour</span>
          <input type="color" value={current} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      {isGrad && (
        <label className="slider" style={{ marginTop: 10 }}>
          <span>Gradient angle · {Math.round(angle)}°</span>
          <input type="range" min={0} max={360} step={5} value={angle} onChange={(e) => onChange(gradient(a, b, +e.target.value))} />
        </label>
      )}
    </div>
  )
}
