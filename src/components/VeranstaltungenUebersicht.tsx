import { PersonenMehrfachauswahl } from './PersonenMehrfachauswahl'
import type { Person, Schule, Terminstatus, Thema, Veranstaltung, VeranstaltungArt, VeranstaltungTermin } from '../lib/types'
import './VeranstaltungenUebersicht.css'

const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie']

export function VeranstaltungenUebersicht({
  veranstaltungen,
  schulen,
  personen,
  onAdd,
  onRemove,
  onTitelChange,
  onTerminstatusChange,
  onSchulenChange,
  onTerminAdd,
  onTerminRemove,
  onTerminFelderChange,
  onBesetzungFelderChange,
}: {
  veranstaltungen: Veranstaltung[]
  schulen: Schule[]
  personen: Person[]
  onAdd: (art: VeranstaltungArt, schulIds: string[]) => void
  onRemove: (veranstaltungId: string) => void
  onTitelChange: (veranstaltungId: string, titel: string) => void
  onTerminstatusChange: (veranstaltungId: string, terminstatus: Terminstatus) => void
  onSchulenChange: (veranstaltungId: string, schulIds: string[]) => void
  onTerminAdd: (veranstaltungId: string) => void
  onTerminRemove: (veranstaltungId: string, terminId: string) => void
  onTerminFelderChange: (
    veranstaltungId: string,
    terminId: string,
    patch: Partial<Pick<VeranstaltungTermin, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema' | 'organisationspauschale_h' | 'erstdurchfuehrung'>>
  ) => void
  onBesetzungFelderChange: (
    veranstaltungId: string,
    terminId: string,
    schulId: string,
    patch: { wir_begleiten?: boolean; begleitperson_ids?: string[]; koordinator_ids?: string[]; koordinationszeit_h?: number; fahrzeit_h?: number }
  ) => void
}) {
  const schulname = (schulId: string) => schulen.find((s) => s.id === schulId)?.name ?? schulId

  return (
    <div>
      <h3>Themenwochen & Exkursionen</h3>
      {veranstaltungen.map((v) => (
        <div key={v.id} className="veranstaltung">
          <input type="text" aria-label="Titel" value={v.titel} onChange={(ev) => onTitelChange(v.id, ev.target.value)} />
          <button onClick={() => onRemove(v.id)} aria-label={`${v.titel} löschen`}>
            🗑
          </button>
          <label>
            Terminstatus:{' '}
            <select
              aria-label={`Terminstatus für ${v.titel}`}
              value={v.terminstatus}
              onChange={(ev) => onTerminstatusChange(v.id, ev.target.value as Terminstatus)}
            >
              <option value="festgelegt">Festgelegt</option>
              <option value="teilweise_festgelegt">Teilweise festgelegt</option>
              <option value="offen">Offen</option>
            </select>
          </label>
          <fieldset>
            <legend>Schulen</legend>
            {schulen.map((schule) => (
              <label key={schule.id}>
                <input
                  type="checkbox"
                  aria-label={`Schule ${schule.name} für ${v.titel}`}
                  checked={v.schulIds.includes(schule.id)}
                  onChange={(ev) =>
                    onSchulenChange(v.id, ev.target.checked ? [...v.schulIds, schule.id] : v.schulIds.filter((id) => id !== schule.id))
                  }
                />
                {schule.name}
              </label>
            ))}
          </fieldset>
          {v.termine.map((termin) => (
            <div key={termin.id} className="veranstaltung-termin">
              <input
                type="text"
                value={termin.datum_oder_kw}
                placeholder="YYYY-MM-DD oder YYYY-KWnn"
                onChange={(ev) => onTerminFelderChange(v.id, termin.id, { datum_oder_kw: ev.target.value })}
              />
              <input
                type="number"
                step={5}
                min={0}
                aria-label={`Unterrichtszeit für Termin ${termin.index} in ${v.titel}`}
                value={Math.round(termin.kontaktzeit_h * 60)}
                onChange={(ev) => onTerminFelderChange(v.id, termin.id, { kontaktzeit_h: Number(ev.target.value) / 60 })}
              />
              <select
                aria-label={`Thema für Termin ${termin.index} in ${v.titel}`}
                value={termin.thema ?? ''}
                onChange={(ev) =>
                  onTerminFelderChange(v.id, termin.id, { thema: ev.target.value === '' ? undefined : (ev.target.value as Thema) })
                }
              >
                <option value="">— kein Thema —</option>
                {THEMEN.map((thema) => (
                  <option key={thema} value={thema}>
                    {thema}
                  </option>
                ))}
              </select>
              {v.art === 'exkursion' && (
                <input
                  type="number"
                  step={5}
                  min={0}
                  aria-label={`Organisationspauschale für Termin ${termin.index} in ${v.titel}`}
                  value={Math.round((termin.organisationspauschale_h ?? 2) * 60)}
                  onChange={(ev) => onTerminFelderChange(v.id, termin.id, { organisationspauschale_h: Number(ev.target.value) / 60 })}
                />
              )}
              <label>
                Erstdurchführung:{' '}
                <input
                  type="checkbox"
                  aria-label={`Erstdurchführung für Termin ${termin.index} in ${v.titel}`}
                  checked={termin.erstdurchfuehrung}
                  onChange={(ev) => onTerminFelderChange(v.id, termin.id, { erstdurchfuehrung: ev.target.checked })}
                />
              </label>
              <button onClick={() => onTerminRemove(v.id, termin.id)} aria-label={`Termin ${termin.index} in ${v.titel} löschen`}>
                🗑
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Schule</th>
                    <th>Wir begleiten</th>
                    <th>Begleitpersonen</th>
                    <th>Koordinatoren</th>
                    <th>Koordination (min)</th>
                    <th>Fahrzeit (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {termin.besetzungen.map((besetzung) => (
                    <tr key={besetzung.schulId}>
                      <td>{schulname(besetzung.schulId)}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Wir begleiten ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                          checked={besetzung.wir_begleiten}
                          onChange={(ev) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { wir_begleiten: ev.target.checked })}
                        />
                      </td>
                      <td>
                        <PersonenMehrfachauswahl
                          personen={personen}
                          ausgewaehlt={besetzung.begleitperson_ids}
                          disabled={!besetzung.wir_begleiten}
                          onChange={(ids) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { begleitperson_ids: ids })}
                          label={`Begleitpersonen für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                        />
                      </td>
                      <td>
                        <PersonenMehrfachauswahl
                          personen={personen}
                          ausgewaehlt={besetzung.koordinator_ids}
                          onChange={(ids) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { koordinator_ids: ids })}
                          label={`Koordinatoren für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step={5}
                          min={0}
                          aria-label={`Koordinationszeit für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                          value={Math.round(besetzung.koordinationszeit_h * 60)}
                          onChange={(ev) =>
                            onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { koordinationszeit_h: Number(ev.target.value) / 60 })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step={0.25}
                          min={0}
                          aria-label={`Fahrzeit für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                          value={besetzung.fahrzeit_h}
                          onChange={(ev) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { fahrzeit_h: Number(ev.target.value) })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <button onClick={() => onTerminAdd(v.id)}>+ Termin hinzufügen</button>
          {v.art === 'themenwoche' && <button onClick={() => onAdd('exkursion', v.schulIds)}>+ Exkursion hinzufügen</button>}
        </div>
      ))}
    </div>
  )
}
