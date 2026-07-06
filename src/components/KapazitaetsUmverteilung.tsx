import { useState } from 'react'
import { berechneVerbleibendeFerienstunden } from '../lib/berechnung'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

export function KapazitaetsUmverteilung({
  umverteilungen,
  wochen,
  onAdd,
  onRemove,
}: {
  umverteilungen: Umverteilung[]
  wochen: WochenErgebnis[]
  onAdd: (quelleWochenKey: string, ferienName: string, zielWochenKey: string, zusatzStunden: number) => void
  onRemove: (id: string) => void
}) {
  const ferienWochen = wochen.filter((w) => w.istFerien)
  const zielWochen = wochen.filter((w) => !w.istFerien)
  const [quelleWochenKey, setQuelleWochenKey] = useState(ferienWochen[0]?.wochenKey ?? '')
  const [zielWochenKey, setZielWochenKey] = useState(zielWochen[0]?.wochenKey ?? '')
  const [zusatzStunden, setZusatzStunden] = useState(5)

  const verbleibend = berechneVerbleibendeFerienstunden(wochen, umverteilungen, quelleWochenKey)

  function hinzufuegen() {
    if (!quelleWochenKey || !zielWochenKey || verbleibend <= 0) return
    const ferienName = wochen.find((w) => w.wochenKey === quelleWochenKey)?.ferienName ?? ''
    const gekappt = Math.min(zusatzStunden, verbleibend)
    if (gekappt <= 0) return
    onAdd(quelleWochenKey, ferienName, zielWochenKey, gekappt)
  }

  return (
    <div>
      <h3>Kapazitäts-Umverteilung</h3>
      <label>
        Quell-Woche:{' '}
        <select value={quelleWochenKey} onChange={(e) => setQuelleWochenKey(e.target.value)}>
          {ferienWochen.map((w) => {
            const rest = berechneVerbleibendeFerienstunden(wochen, umverteilungen, w.wochenKey)
            return (
              <option key={w.wochenKey} value={w.wochenKey} disabled={rest <= 0}>
                {formatWochenspanne(w.wochenKey)} – {w.ferienName} – {rest <= 0 ? 'ausgeschöpft' : `noch ${rest} Std verfügbar`}
              </option>
            )
          })}
        </select>
      </label>
      <label>
        Ziel-Woche:{' '}
        <select value={zielWochenKey} onChange={(e) => setZielWochenKey(e.target.value)}>
          {zielWochen.map((w) => (
            <option key={w.wochenKey} value={w.wochenKey}>
              {formatWochenspanne(w.wochenKey)}
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
      <button onClick={hinzufuegen} disabled={verbleibend <= 0}>
        Hinzufügen
      </button>
      <ul>
        {umverteilungen.map((u) => (
          <li key={u.id}>
            {u.zusatzStunden} Std aus {formatWochenspanne(u.quelleWochenKey)} ({u.ferienName}) → {formatWochenspanne(u.zielWochenKey)}{' '}
            <button onClick={() => onRemove(u.id)} aria-label={`Umverteilung ${u.id} löschen`}>
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
