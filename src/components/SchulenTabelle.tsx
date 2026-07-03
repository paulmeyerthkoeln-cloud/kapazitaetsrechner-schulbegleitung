import { berechneUnserAnteil } from '../lib/besetzung'
import type { Schule } from '../lib/types'

export function SchulenTabelle({ schulen }: { schulen: Schule[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Schule</th>
          <th>Reihe</th>
          <th>Modell</th>
          <th>Status</th>
          <th>Unser Anteil</th>
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
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
