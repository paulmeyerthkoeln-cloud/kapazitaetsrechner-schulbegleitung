import { formatDatumOderKw } from '../lib/kalenderwochen'
import type { Person, Terminstatus } from '../lib/types'
import type { TerminZeile } from '../lib/terminUebersicht'
import './TerminUebersicht.css'

const STATUS_LABEL: Record<Terminstatus, string> = {
  festgelegt: 'Festgelegt',
  teilweise_festgelegt: 'Teilweise festgelegt',
  offen: 'Offen',
}

export function TerminUebersicht({
  zeilen,
  personen,
}: {
  zeilen: TerminZeile[]
  personen: Person[]
}) {
  const gefiltert = zeilen

  return (
    <details className="termin-uebersicht">
      <summary>Terminliste anzeigen ({zeilen.length} Termine)</summary>
      <div className="termin-uebersicht-inhalt">
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
