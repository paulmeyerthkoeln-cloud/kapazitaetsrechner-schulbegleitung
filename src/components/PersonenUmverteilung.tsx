import { useState } from 'react'
import { berechneVerbleibendePersonenstunden } from '../lib/personenKapazitaet'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { Person, PersonenUmverteilung as PersonenUmverteilungTyp } from '../lib/types'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

export function PersonenUmverteilung({
  personen,
  personenKapazitaet,
  personenUmverteilungen,
  onAdd,
  onRemove,
}: {
  personen: Person[]
  personenKapazitaet: PersonKapazitaetsErgebnis[]
  personenUmverteilungen: PersonenUmverteilungTyp[]
  onAdd: (personId: string, quelleWochenKey: string, zielWochenKey: string, stunden: number) => void
  onRemove: (id: string) => void
}) {
  const wochenKeys = personenKapazitaet[0]?.wochen.map((w) => w.wochenKey) ?? []
  const [personId, setPersonId] = useState(personen[0]?.id ?? '')
  const [quelleWochenKey, setQuelleWochenKey] = useState(wochenKeys[0] ?? '')
  const [zielWochenKey, setZielWochenKey] = useState(wochenKeys[0] ?? '')
  const [stunden, setStunden] = useState(1)

  const verbleibend = berechneVerbleibendePersonenstunden(personenKapazitaet, personId, quelleWochenKey)

  function hinzufuegen() {
    if (!personId || !quelleWochenKey || !zielWochenKey || verbleibend <= 0) return
    const gekappt = Math.min(stunden, verbleibend)
    if (gekappt <= 0) return
    onAdd(personId, quelleWochenKey, zielWochenKey, gekappt)
  }

  function personName(id: string): string {
    return personen.find((p) => p.id === id)?.name ?? id
  }

  return (
    <div>
      <h3>Personen-Umverteilung</h3>
      <label>
        Person:{' '}
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {personen.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quell-Woche:{' '}
        <select value={quelleWochenKey} onChange={(e) => setQuelleWochenKey(e.target.value)}>
          {wochenKeys.map((key) => {
            const rest = berechneVerbleibendePersonenstunden(personenKapazitaet, personId, key)
            return (
              <option key={key} value={key} disabled={rest <= 0}>
                {formatWochenspanne(key)} – {rest <= 0 ? 'ausgeschöpft' : `noch ${rest} Std verfügbar`}
              </option>
            )
          })}
        </select>
      </label>
      <label>
        Ziel-Woche:{' '}
        <select value={zielWochenKey} onChange={(e) => setZielWochenKey(e.target.value)}>
          {wochenKeys.map((key) => (
            <option key={key} value={key}>
              {formatWochenspanne(key)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stunden:{' '}
        <input
          type="number"
          min={0}
          step={0.5}
          value={stunden}
          onChange={(e) => setStunden(Number(e.target.value))}
          style={{ width: '4rem' }}
        />
      </label>
      <button onClick={hinzufuegen} disabled={verbleibend <= 0}>
        Hinzufügen
      </button>
      <ul>
        {personenUmverteilungen.map((u) => (
          <li key={u.id}>
            {u.stunden} Std von {personName(u.personId)} aus {formatWochenspanne(u.quelleWochenKey)} → {formatWochenspanne(u.zielWochenKey)}{' '}
            <button onClick={() => onRemove(u.id)} aria-label={`Personen-Umverteilung ${u.id} löschen`}>
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
