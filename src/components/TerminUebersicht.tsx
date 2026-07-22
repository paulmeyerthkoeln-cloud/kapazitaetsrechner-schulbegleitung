import { useState } from 'react'
import { formatDatumOderKw } from '../lib/kalenderwochen'
import { PersonenMehrfachauswahl } from './PersonenMehrfachauswahl'
import type { Person, Terminstatus } from '../lib/types'
import type { TerminZeile } from '../lib/terminUebersicht'
import './TerminUebersicht.css'

const STATUS_LABEL: Record<Terminstatus, string> = {
  festgelegt: 'Festgelegt',
  teilweise_festgelegt: 'Teilweise festgelegt',
  offen: 'Offen',
}
const STATUS_WERTE: Terminstatus[] = ['festgelegt', 'teilweise_festgelegt', 'offen']

export function TerminUebersicht({
  zeilen,
  personen,
}: {
  zeilen: TerminZeile[]
  personen: Person[]
}) {
  const [personFilter, setPersonFilter] = useState<string[]>([])
  const [ortFilter, setOrtFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<Terminstatus[]>(STATUS_WERTE)
  const [vonDatum, setVonDatum] = useState('')
  const [bisDatum, setBisDatum] = useState('')

  const orte = [...new Set(zeilen.map((z) => z.titel))].sort((a, b) => a.localeCompare(b))

  function toggleOrt(ort: string, checked: boolean) {
    setOrtFilter((prev) => (checked ? [...prev, ort] : prev.filter((o) => o !== ort)))
  }

  function toggleStatus(status: Terminstatus, checked: boolean) {
    setStatusFilter((prev) => (checked ? [...prev, status] : prev.filter((s) => s !== status)))
  }

  const gefiltert = zeilen.filter((z) => {
    if (personFilter.length > 0 && !personFilter.some((id) => z.begleitpersonIds.includes(id) || z.koordinatorIds.includes(id))) return false
    if (ortFilter.length > 0 && !ortFilter.includes(z.titel)) return false
    if (!statusFilter.includes(z.terminstatus)) return false
    if (vonDatum && z.isoDatum < vonDatum) return false
    if (bisDatum && z.isoDatum > bisDatum) return false
    return true
  })

  return (
    <details className="termin-uebersicht">
      <summary>Terminliste anzeigen ({zeilen.length} Termine)</summary>
      <div className="termin-uebersicht-inhalt">
        <div className="termin-uebersicht-filter">
          <PersonenMehrfachauswahl personen={personen} ausgewaehlt={personFilter} onChange={setPersonFilter} label="Person filtern" />
          <fieldset>
            <legend>Schule/Veranstaltung</legend>
            {orte.map((ort) => (
              <label key={ort}>
                <input
                  type="checkbox"
                  aria-label={`Ort filtern: ${ort}`}
                  checked={ortFilter.includes(ort)}
                  onChange={(ev) => toggleOrt(ort, ev.target.checked)}
                />
                {ort}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Terminstatus</legend>
            {STATUS_WERTE.map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  aria-label={`Terminstatus filtern: ${STATUS_LABEL[status]}`}
                  checked={statusFilter.includes(status)}
                  onChange={(ev) => toggleStatus(status, ev.target.checked)}
                />
                {STATUS_LABEL[status]}
              </label>
            ))}
          </fieldset>
          <label>
            Von: <input type="date" aria-label="Zeitraum von" value={vonDatum} onChange={(ev) => setVonDatum(ev.target.value)} />
          </label>
          <label>
            Bis: <input type="date" aria-label="Zeitraum bis" value={bisDatum} onChange={(ev) => setBisDatum(ev.target.value)} />
          </label>
        </div>
        {gefiltert.length === 0 ? (
          <p>Keine Termine für die aktuelle Filterauswahl.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Schule</th>
                <th>Titel</th>
                <th>Thema</th>
                <th>Std. Unterricht</th>
                <th>Std. Koordination</th>
                <th>Begleitpersonen</th>
                <th>Koordinatoren</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((z) => (
                <tr key={z.id}>
                  <td>{formatDatumOderKw(z.datumOderKw)}</td>
                  <td>{z.schulName}</td>
                  <td>{z.titel}</td>
                  <td>{z.thema ?? '—'}</td>
                  <td>{Math.round(z.unterrichtsStunden * 10) / 10}</td>
                  <td>{Math.round(z.koordinationsStunden * 10) / 10}</td>
                  <td>{z.begleitpersonNamen.length > 0 ? z.begleitpersonNamen.join(', ') : '—'}</td>
                  <td>{z.koordinatorNamen.length > 0 ? z.koordinatorNamen.join(', ') : '—'}</td>
                  <td>{STATUS_LABEL[z.terminstatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  )
}
