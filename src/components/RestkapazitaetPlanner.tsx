import { useState } from 'react'
import { pruefeStartmonate } from '../lib/restkapazitaet'
import type { PlatzhalterKonfiguration, StartmonatErgebnis } from '../lib/restkapazitaet'
import type { Datenbestand } from '../lib/types'

const KANDIDATEN_MONATE = [
  '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05',
]

export function RestkapazitaetPlanner({ data }: { data: Datenbestand }) {
  const [kontaktzeit, setKontaktzeit] = useState(1.5)
  const [ergebnisse, setErgebnisse] = useState<StartmonatErgebnis[] | null>(null)

  function pruefen() {
    const konfiguration: PlatzhalterKonfiguration = {
      titel: 'Schule X',
      fahrzeit_h: 1.0,
      muster: { typ: 'woechentlich', kontaktzeit_h: kontaktzeit },
      besetzung: { typ: 'alle' },
    }
    setErgebnisse(pruefeStartmonate(data, konfiguration, KANDIDATEN_MONATE))
  }

  return (
    <div>
      <h3>Restkapazität für die 10. Schule</h3>
      <label>
        Kontaktzeit pro Woche (h):{' '}
        <input type="number" step={0.5} value={kontaktzeit} onChange={(e) => setKontaktzeit(Number(e.target.value))} />
      </label>
      <button onClick={pruefen}>Startmonate prüfen</button>
      {ergebnisse && (
        <ul>
          {ergebnisse.map((r) => (
            <li key={r.startmonat}>
              {r.startmonat}: {r.machbar ? 'machbar' : 'nicht machbar'}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
