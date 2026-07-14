import { useEffect, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    // jsdom (unit tests) doesn't implement showModal() — fall back to the plain
    // open attribute there so the dialog's content still renders for assertions.
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.open = true
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="wochen-detail-overlay"
      aria-label={`Wochendetails KW${kwNummer(wochenKey)}`}
      onClose={onClose}
      onClick={(ev) => {
        // A click on the ::backdrop bubbles up as a click on the <dialog> element
        // itself (never on a descendant) — that's how we detect "outside the box".
        if (ev.target === dialogRef.current) onClose()
      }}
    >
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
