import type { Machbarkeitsergebnis } from '../lib/berechnung'

export function AmpelAntwort({ machbarkeit }: { machbarkeit: Machbarkeitsergebnis }) {
  const status = !machbarkeit.machbar ? 'NICHT MACHBAR' : machbarkeit.anzahlGelbeWochen > 0 ? 'KRITISCH' : 'MACHBAR'
  const farbe = !machbarkeit.machbar ? '#c0392b' : machbarkeit.anzahlGelbeWochen > 0 ? '#e1a100' : '#2e7d32'

  const top = machbarkeit.topEngpaesse[0]
  const begruendung = !machbarkeit.machbar
    ? `Höchste Auslastung in ${top.wochenKey}: ${Math.round(top.auslastung * 100)}%.`
    : `${machbarkeit.anzahlGelbeWochen} gelbe Woche(n) im Planungszeitraum.`

  return (
    <div style={{ borderLeft: `6px solid ${farbe}`, padding: '0.75rem 1rem' }}>
      <h2 style={{ margin: 0, color: farbe }}>{status}</h2>
      <p style={{ margin: '0.25rem 0 0' }}>{begruendung}</p>
    </div>
  )
}
