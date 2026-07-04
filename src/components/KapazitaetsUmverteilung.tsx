import { useState } from 'react'
import type { FerienZeitraum, Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

export function KapazitaetsUmverteilung({
  umverteilungen,
  ferien,
  wochen,
  onAdd,
  onRemove,
}: {
  umverteilungen: Umverteilung[]
  ferien: FerienZeitraum[]
  wochen: WochenErgebnis[]
  onAdd: (ferienName: string, zielWochenKey: string, zusatzStunden: number) => void
  onRemove: (id: string) => void
}) {
  const zielWochen = wochen.filter((w) => !w.istFerien)
  const [ferienName, setFerienName] = useState(ferien[0]?.name ?? '')
  const [zielWochenKey, setZielWochenKey] = useState(zielWochen[0]?.wochenKey ?? '')
  const [zusatzStunden, setZusatzStunden] = useState(5)

  function hinzufuegen() {
    if (!ferienName || !zielWochenKey) return
    onAdd(ferienName, zielWochenKey, zusatzStunden)
  }

  return (
    <div>
      <h3>Kapazitäts-Umverteilung</h3>
      <label>
        Ferienzeitraum:{' '}
        <select value={ferienName} onChange={(e) => setFerienName(e.target.value)}>
          {ferien.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ziel-Woche:{' '}
        <select value={zielWochenKey} onChange={(e) => setZielWochenKey(e.target.value)}>
          {zielWochen.map((w) => (
            <option key={w.wochenKey} value={w.wochenKey}>
              {w.wochenKey}
            </option>
          ))}
        </select>
      </label>
      <label>
        Zusatzstunden:{' '}
        <input
          type="number"
          min={0}
          step={0.5}
          value={zusatzStunden}
          onChange={(e) => setZusatzStunden(Number(e.target.value))}
          style={{ width: '4rem' }}
        />
      </label>
      <button onClick={hinzufuegen}>Hinzufügen</button>
      <ul>
        {umverteilungen.map((u) => (
          <li key={u.id}>
            {u.zusatzStunden} Std aus {u.ferienName} → {u.zielWochenKey}{' '}
            <button onClick={() => onRemove(u.id)} aria-label={`Umverteilung ${u.id} löschen`}>
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
