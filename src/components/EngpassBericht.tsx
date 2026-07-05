import { formatWochenspanne } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'

export function EngpassBericht({ topEngpaesse }: { topEngpaesse: WochenErgebnis[] }) {
  return (
    <div>
      <h3>Top-Engpasswochen</h3>
      <ol>
        {topEngpaesse.map((w) => (
          <li key={w.wochenKey}>
            {formatWochenspanne(w.wochenKey)}: {Math.round(w.auslastung * 100)}% ({Math.round(w.bedarf * 10) / 10}h Bedarf (
            {Math.round(w.einsatzBedarf * 10) / 10}h Einsatz + {Math.round(w.koordinationBedarf * 10) / 10}h
            Koordination) / {Math.round(w.angebot * 10) / 10}h Angebot)
          </li>
        ))}
      </ol>
      <p>
        Entlastungsoptionen: Einheiten von Modell A auf B herabstufen, Einheit in Nachbarwoche verschieben, oder
        <code>personen_parallel</code> reduzieren.
      </p>
    </div>
  )
}
