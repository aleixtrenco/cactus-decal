import { useState } from 'react'
import { ROLE_LABELS, autoAssign, type BikeTemplate, type PieceSide, type Role, type TemplatePiece } from '../lib/templates'

// Colour per role, chosen to stay distinct on the dark admin surface.
const ROLE_COLORS: Record<Role, string> = {
  shroud: '#8cd63a',
  sidePlate: '#e9c88f',
  rearFender: '#ff7a1a',
  frontFender: '#00b4d8',
  frontPlate: '#f4f4f2',
  other: '#6f7466',
  ignore: '#2b2d27',
}
const ROLES = Object.keys(ROLE_LABELS) as Role[]
const SIDES: [PieceSide, string][] = [
  ['right', 'Right side'],
  ['left', 'Left side'],
  ['center', 'Centre'],
]

// Shows the template's pieces coloured by role. Click a piece to change
// what it is; the 3D preview and print file follow straight away.
export default function PieceMapper({ template, onChange }: { template: BikeTemplate; onChange: (t: BikeTemplate) => void }) {
  const [sel, setSel] = useState<number | null>(null)
  const [vx, vy, vw, vh] = template.viewBox
  const piece = template.pieces.find((p) => p.id === sel)

  const update = (patch: Partial<TemplatePiece>) => {
    if (!piece) return
    onChange({ ...template, pieces: template.pieces.map((p) => (p.id === piece.id ? { ...p, ...patch, parent: undefined } : p)) })
  }
  const counts = ROLES.map((r) => [r, template.pieces.filter((p) => p.role === r).length] as const).filter(([, n]) => n)

  return (
    <div className="mapper">
      <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} role="group" aria-label="Template pieces. Select a piece to set what it is.">
        {template.pieces.map((p) => (
          <polygon
            key={p.id}
            points={p.outline.map((q) => q.join(',')).join(' ')}
            fill={ROLE_COLORS[p.role]}
            fillOpacity={p.parent !== undefined ? 0.55 : 0.9}
            stroke={sel === p.id ? '#fff' : '#0b0c09'}
            strokeWidth={sel === p.id ? vw * 0.003 : vw * 0.0008}
            tabIndex={0}
            role="button"
            aria-label={`Piece ${p.id}: ${ROLE_LABELS[p.role]}, ${p.side}`}
            aria-pressed={sel === p.id}
            onClick={() => setSel(p.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(p.id))}
          >
            <title>{`${ROLE_LABELS[p.role]} (${p.side})`}</title>
          </polygon>
        ))}
      </svg>
      <div className="mapper-legend" aria-hidden="true">
        {counts.map(([r, n]) => (
          <span key={r}>
            <i style={{ background: ROLE_COLORS[r] }} /> {ROLE_LABELS[r]} × {n}
          </span>
        ))}
      </div>
      {piece ? (
        <div className="mapper-edit">
          <div className="group-label">
            Piece {piece.id} <span>{piece.parent !== undefined ? `Sits on piece ${piece.parent}` : ''}</span>
          </div>
          <div className="chips" role="group" aria-label="What this piece is">
            {ROLES.map((r) => (
              <button key={r} className="chip" aria-pressed={piece.role === r} onClick={() => update({ role: r })}>
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Which side of the bike" style={{ marginTop: 8 }}>
            {SIDES.map(([s, label]) => (
              <button key={s} className="chip" aria-pressed={piece.side === s} onClick={() => update({ side: s })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="lead">Click a piece to change what it is. Pieces left as “Other piece” are printed with the design but not shown in 3D.</p>
      )}
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => onChange({ ...template, pieces: autoAssign(template.pieces) })}>
        Detect pieces again
      </button>
    </div>
  )
}
