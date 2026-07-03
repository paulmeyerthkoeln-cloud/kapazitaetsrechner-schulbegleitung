import type { SensitivitaetsParameter, SzenarioTyp } from '../lib/szenario'

const OPTIONEN: { typ: SzenarioTyp; label: string }[] = [
  { typ: 'basis', label: 'Basis (4 Personen, 9 Schulen)' },
  { typ: 'ziel', label: 'Ziel (4 Personen, 10 Schulen)' },
  { typ: 'verstaerkt', label: 'Verstärkt (5 Personen, 10 Schulen)' },
  { typ: 'sensitivitaet', label: 'Sensitivität' },
]

export function SzenarioAuswahl({
  szenario,
  onSzenarioChange,
  sensitivitaet,
  onSensitivitaetChange,
}: {
  szenario: SzenarioTyp
  onSzenarioChange: (t: SzenarioTyp) => void
  sensitivitaet: SensitivitaetsParameter
  onSensitivitaetChange: (p: SensitivitaetsParameter) => void
}) {
  return (
    <div>
      {OPTIONEN.map((o) => (
        <label key={o.typ} style={{ marginRight: '1rem' }}>
          <input type="radio" checked={szenario === o.typ} onChange={() => onSzenarioChange(o.typ)} />
          {o.label}
        </label>
      ))}
      {szenario === 'sensitivitaet' && (
        <div>
          <label>
            Stunden/Woche pro Person (4–12):{' '}
            <input
              type="range"
              min={4}
              max={12}
              step={0.5}
              value={sensitivitaet.stundenProPersonUeberschreiben ?? 8}
              onChange={(e) =>
                onSensitivitaetChange({ ...sensitivitaet, stundenProPersonUeberschreiben: Number(e.target.value) })
              }
            />
            {' '}{sensitivitaet.stundenProPersonUeberschreiben ?? 8} h
          </label>
        </div>
      )}
    </div>
  )
}
