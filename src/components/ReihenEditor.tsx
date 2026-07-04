import { useState } from 'react'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe } from '../lib/types'

const PRESETS: { label: string; preset: (n: number) => BesetzungsPreset }[] = [
  { label: 'Alle', preset: () => ({ typ: 'alle' }) },
  { label: 'Keine', preset: () => ({ typ: 'keine' }) },
  { label: 'Erste & Letzte', preset: () => ({ typ: 'erste_und_letzte' }) },
]

export function ReihenEditor({
  reihe,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
}: {
  reihe: Reihe
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onPresetApply: (preset: BesetzungsPreset) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (einheitId: string, patch: { datum_oder_kw?: string; kontaktzeit_h?: number }) => void
}) {
  const [n, setN] = useState(1)
  const anteil = berechneUnserAnteil(reihe.einheiten)

  return (
    <div>
      <h3>{reihe.titel}</h3>
      <p>
        {anteil.anzahl} von {anteil.gesamt} Einheiten ({Math.round(anteil.anteil * 100)}%)
      </p>
      <div>
        {PRESETS.map(({ label, preset }) => (
          <button key={label} onClick={() => onPresetApply(preset(n))}>
            {label}
          </button>
        ))}
        <button onClick={() => onPresetApply({ typ: 'erste_n', n })}>Erste {n}</button>
        <button onClick={() => onPresetApply({ typ: 'letzte_n', n })}>Letzte {n}</button>
        <button onClick={() => onPresetApply({ typ: 'jede_n_te', n })}>Jede {n}. Einheit</button>
        <input type="number" min={1} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: '3rem' }} />
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Datum/KW</th>
            <th>Kontaktzeit (min)</th>
            <th>Wir begleiten</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {reihe.einheiten.map((e) => (
            <tr key={e.id}>
              <td>{e.index}</td>
              <td>
                <input
                  type="text"
                  value={e.datum_oder_kw}
                  placeholder="YYYY-MM-DD oder YYYY-KWnn"
                  onChange={(ev) => onEinheitFelderChange(e.id, { datum_oder_kw: ev.target.value })}
                  style={{ width: '10rem' }}
                />
              </td>
              <td>
                <input
                  type="number"
                  step={5}
                  min={0}
                  value={Math.round(e.kontaktzeit_h * 60)}
                  onChange={(ev) => onEinheitFelderChange(e.id, { kontaktzeit_h: Number(ev.target.value) / 60 })}
                  style={{ width: '5rem' }}
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={e.wir_begleiten}
                  onChange={(ev) => onEinheitToggle(e.id, ev.target.checked)}
                />
              </td>
              <td>
                <button onClick={() => onEinheitRemove(e.id)} aria-label={`Termin ${e.index} löschen`}>
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onEinheitAdd}>+ Termin hinzufügen</button>
    </div>
  )
}
