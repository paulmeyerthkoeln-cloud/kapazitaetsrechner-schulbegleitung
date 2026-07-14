import { formatDatumOderKw, zuIsoDatum } from '../lib/kalenderwochen'
import './DatumOderKwFeld.css'

export function DatumOderKwFeld({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <details className="datum-oder-kw-feld">
      <summary>{formatDatumOderKw(value)}</summary>
      <div className="datum-oder-kw-feld-overlay">
        <label>
          Kalender:{' '}
          <input
            type="date"
            aria-label={`${label} – Kalender`}
            value={zuIsoDatum(value)}
            onChange={(ev) => onChange(ev.target.value)}
          />
        </label>
        <label>
          Oder Text:{' '}
          <input
            type="text"
            aria-label={label}
            value={value}
            placeholder="YYYY-MM-DD oder YYYY-KWnn"
            onChange={(ev) => onChange(ev.target.value)}
          />
        </label>
      </div>
    </details>
  )
}
