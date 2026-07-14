import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
import type { SchulWochenDetail } from '../lib/wochenDetails'
import './WochenDetailOverlay.css'

export function WochenDetailOverlay({
  wochenKey,
  details,
  onClose,
}: {
  wochenKey: string
  details: SchulWochenDetail[]
  onClose: () => void
}) {
  return (
    <dialog open className="wochen-detail-overlay" aria-label={`Wochendetails KW${kwNummer(wochenKey)}`}>
      <h3>
        KW{kwNummer(wochenKey)} ({formatWochenspanne(wochenKey)})
      </h3>
      {details.length === 0 ? (
        <p>Keine Schule mit Stunden in dieser Woche.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Schule</th>
              <th>Stunden</th>
              <th>Begleitet von</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.schulId}>
                <td>{d.schulName}</td>
                <td>{Math.round(d.stunden * 10) / 10}</td>
                <td>{d.begleitpersonen.length > 0 ? d.begleitpersonen.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button onClick={onClose}>Schließen</button>
    </dialog>
  )
}
