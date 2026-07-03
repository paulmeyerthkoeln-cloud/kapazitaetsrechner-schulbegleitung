import { berechneUnserAnteil } from '../lib/besetzung'
import type { Schule, Settings } from '../lib/types'

export function SchulenTabelle({
  schulen,
  settings,
  onKoordinationChange,
}: {
  schulen: Schule[]
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Schule</th>
          <th>Reihe</th>
          <th>Modell</th>
          <th>Status</th>
          <th>Unser Anteil</th>
          <th>Koordination h/Monat</th>
        </tr>
      </thead>
      <tbody>
        {schulen.flatMap((schule) =>
          schule.reihen.map((reihe) => {
            const anteil = berechneUnserAnteil(reihe.einheiten)
            return (
              <tr key={reihe.id}>
                <td>{schule.name}</td>
                <td>{reihe.titel}</td>
                <td>{reihe.betreuungsmodell}</td>
                <td>{reihe.status}</td>
                <td>
                  {anteil.anzahl} von {anteil.gesamt} ({Math.round(anteil.anteil * 100)}%)
                </td>
                <td>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={schule.koordination_h_pro_monat ?? settings.koordination_h_pro_schule_pro_monat}
                    onChange={(e) => onKoordinationChange(schule.id, Number(e.target.value))}
                    style={{ width: '4rem' }}
                  />
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
