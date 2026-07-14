import { useEffect, useRef } from 'react'
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
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    // <details> is left uncontrolled on purpose: the native 'toggle' event doesn't
    // bubble, so React's onToggle can't reliably drive a controlled `open` state.
    // Instead we read/write ref.current.open directly against the live DOM node.
    function schliesseWennAusserhalb(ev: PointerEvent) {
      const details = ref.current
      if (details?.open && !details.contains(ev.target as Node)) details.open = false
    }
    document.addEventListener('pointerdown', schliesseWennAusserhalb)
    return () => document.removeEventListener('pointerdown', schliesseWennAusserhalb)
  }, [])

  return (
    <details ref={ref} className="datum-oder-kw-feld">
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
