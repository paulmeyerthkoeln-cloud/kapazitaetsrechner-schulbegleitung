import { useState } from 'react'
import { format } from 'date-fns'
import { berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from '../lib/besetzung'
import type { Person, Reihe, Terminstatus, Thema } from '../lib/types'

const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie', 'Exkursion']

export function ReihenEditor({
  reihe,
  personen,
  themenwochen,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
  onTitelChange,
}: {
  reihe: Reihe
  personen: Person[]
  themenwochen: string[]
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null; themenwoche?: string }
  ) => void
  onTerminstatusChange: (wert: Terminstatus) => void
  onTermineGenerieren: (startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) => void
  onTitelChange: (titel: string) => void
}) {
  const anteil = berechneUnserAnteil(reihe.einheiten)
  const [schnellStartdatum, setSchnellStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [schnellUnterrichtszeitMin, setSchnellUnterrichtszeitMin] = useState(() => {
    const haeufigste = ermittleHaeufigsteKontaktzeit(reihe.einheiten)
    return haeufigste !== null ? Math.round(haeufigste * 60) : 90
  })
  const [schnellKoordinationMin, setSchnellKoordinationMin] = useState(0)
  const [schnellAnzahlTermine, setSchnellAnzahlTermine] = useState(reihe.einheiten.length || 1)

  function termineGenerieren() {
    if (reihe.einheiten.length > 0) {
      const bestaetigt = window.confirm('Die bestehenden Termine dieser Reihe werden ersetzt. Fortfahren?')
      if (!bestaetigt) return
    }
    onTermineGenerieren(schnellStartdatum, schnellUnterrichtszeitMin / 60, schnellKoordinationMin / 60, schnellAnzahlTermine)
  }

  return (
    <div>
      <input type="text" aria-label="Titel" value={reihe.titel} onChange={(ev) => onTitelChange(ev.target.value)} />
      <p>
        {anteil.anzahl} von {anteil.gesamt} Einheiten ({Math.round(anteil.anteil * 100)}%)
      </p>
      <div className="schnelleinrichtung">
        <label>
          Startdatum:{' '}
          <input
            type="date"
            aria-label="Schnelleinrichtung Startdatum"
            value={schnellStartdatum}
            onChange={(ev) => setSchnellStartdatum(ev.target.value)}
          />
        </label>
        <label>
          Unterrichtszeit (min):{' '}
          <input
            type="number"
            step={5}
            min={0}
            aria-label="Schnelleinrichtung Unterrichtszeit"
            value={schnellUnterrichtszeitMin}
            onChange={(ev) => setSchnellUnterrichtszeitMin(Number(ev.target.value))}
            style={{ width: '5rem' }}
          />
        </label>
        <label>
          Koordination (min):{' '}
          <input
            type="number"
            step={5}
            min={0}
            aria-label="Schnelleinrichtung Koordination"
            value={schnellKoordinationMin}
            onChange={(ev) => setSchnellKoordinationMin(Number(ev.target.value))}
            style={{ width: '5rem' }}
          />
        </label>
        <label>
          Anzahl Termine:{' '}
          <input
            type="number"
            min={1}
            aria-label="Schnelleinrichtung Anzahl Termine"
            value={schnellAnzahlTermine}
            onChange={(ev) => setSchnellAnzahlTermine(Number(ev.target.value))}
            style={{ width: '4rem' }}
          />
        </label>
        <button onClick={termineGenerieren}>Termine generieren</button>
      </div>
      <div>
        <label>
          Terminstatus:{' '}
          <select
            aria-label="Terminstatus"
            value={reihe.terminstatus}
            onChange={(ev) => onTerminstatusChange(ev.target.value as Terminstatus)}
          >
            <option value="festgelegt">Festgelegt</option>
            <option value="teilweise_festgelegt">Teilweise festgelegt</option>
            <option value="offen">Offen</option>
          </select>
        </label>
        {reihe.terminstatus === 'offen' && (
          <span className="terminstatus-badge">offen – zählt nicht in der Bedarfsrechnung</span>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Datum/KW</th>
            <th>Unterrichtszeit (min)</th>
            <th>Koordination (min)</th>
            <th>Thema</th>
            <th>Themenwoche</th>
            <th>Wir begleiten</th>
            <th>Begleitperson</th>
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
                  type="number"
                  step={5}
                  min={0}
                  aria-label={`Koordinationszeit für Termin ${e.index} in ${reihe.titel}`}
                  value={Math.round((e.koordinationszeit_h ?? 0) * 60)}
                  onChange={(ev) => onEinheitFelderChange(e.id, { koordinationszeit_h: Number(ev.target.value) / 60 })}
                  style={{ width: '5rem' }}
                />
              </td>
              <td>
                <select
                  aria-label={`Thema für Termin ${e.index} in ${reihe.titel}`}
                  value={e.thema ?? ''}
                  onChange={(ev) =>
                    onEinheitFelderChange(e.id, { thema: ev.target.value === '' ? undefined : (ev.target.value as Thema) })
                  }
                >
                  <option value="">— kein Thema —</option>
                  {THEMEN.map((thema) => (
                    <option key={thema} value={thema}>
                      {thema}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="text"
                  list="themenwochen-optionen"
                  aria-label={`Themenwoche für Termin ${e.index} in ${reihe.titel}`}
                  value={e.themenwoche ?? ''}
                  onChange={(ev) =>
                    onEinheitFelderChange(e.id, { themenwoche: ev.target.value === '' ? undefined : ev.target.value })
                  }
                  style={{ width: '8rem' }}
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
                <select
                  aria-label={`Begleitperson für Termin ${e.index} in ${reihe.titel}`}
                  value={e.begleitperson_id ?? ''}
                  disabled={!e.wir_begleiten}
                  onChange={(ev) =>
                    onEinheitFelderChange(e.id, { begleitperson_id: ev.target.value === '' ? null : ev.target.value })
                  }
                >
                  <option value="">— niemand —</option>
                  {personen.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button onClick={() => onEinheitRemove(e.id)} aria-label={`Termin ${e.index} in ${reihe.titel} löschen`}>
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <datalist id="themenwochen-optionen">
        {themenwochen.map((tw) => (
          <option key={tw} value={tw} />
        ))}
      </datalist>
      <button onClick={onEinheitAdd}>+ Termin hinzufügen</button>
    </div>
  )
}
