import './ThemenUebersicht.css'
import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
import { berechneFerienBaender } from '../lib/themenUebersicht'
import type { ThemenGanttZeile } from '../lib/themenUebersicht'
import type { WochenErgebnis } from '../lib/berechnung'
import type { Thema } from '../lib/types'

const THEMEN_FARBEN: Record<Thema | 'ohne', string> = {
  Ernährung: '#e07a5f',
  Stadtgrün: '#3d9970',
  Mobilität: '#4a7fbf',
  Energie: '#e6b800',
  ohne: '#8a8a8a',
}

export function ThemenUebersicht({
  zeilen,
  wochen,
}: {
  zeilen: ThemenGanttZeile[]
  wochen: WochenErgebnis[]
}) {
  if (zeilen.length === 0) {
    return (
      <div>
        <h3>Themen-Übersicht</h3>
        <p>Keine Einheiten mit Terminstatus ungleich „offen“ vorhanden.</p>
      </div>
    )
  }

  const wochenKeys = wochen.map((w) => w.wochenKey)
  const indexVon = new Map(wochenKeys.map((key, i) => [key, i]))
  const ferienBaender = berechneFerienBaender(wochen)

  const reihenIds: string[] = []
  for (const z of zeilen) {
    if (!reihenIds.includes(z.reiheId)) reihenIds.push(z.reiheId)
  }
  const zeilenLabelVonReihe = new Map(zeilen.map((z) => [z.reiheId, z.zeilenLabel]))
  const rowVonReihe = new Map(reihenIds.map((id, i) => [id, i]))

  return (
    <div>
      <h3>Themen-Übersicht</h3>
      <div className="themen-gantt-scroll">
        <div
          className="themen-gantt-grid"
          style={{
            gridTemplateColumns: `11rem repeat(${wochenKeys.length}, 2.5rem)`,
            gridTemplateRows: `1.5rem repeat(${reihenIds.length}, 2.25rem)`,
          }}
        >
          <div className="themen-gantt-ecke" style={{ gridColumn: 1, gridRow: 1 }} />
          {wochenKeys.map((key, i) => (
            <div key={key} className="themen-gantt-kw" style={{ gridColumn: i + 2, gridRow: 1 }} title={formatWochenspanne(key)}>
              {kwNummer(key)}
            </div>
          ))}
          {ferienBaender.map((band) => (
            <div
              key={`${band.name}-${band.startWochenKey}`}
              className="themen-gantt-ferien-band"
              title={band.name}
              style={{
                gridColumn: `${(indexVon.get(band.startWochenKey) ?? 0) + 2} / ${(indexVon.get(band.endWochenKey) ?? 0) + 3}`,
                gridRow: `2 / ${reihenIds.length + 2}`,
              }}
            />
          ))}
          {reihenIds.map((reiheId) => (
            <div
              key={`${reiheId}-label`}
              className="themen-gantt-label"
              style={{ gridColumn: 1, gridRow: (rowVonReihe.get(reiheId) ?? 0) + 2 }}
            >
              {zeilenLabelVonReihe.get(reiheId)}
            </div>
          ))}
          {zeilen.map((z) => (
            <div
              key={`${z.reiheId}-${z.balkenLabel}-${z.startWochenKey}-balken`}
              className="themen-gantt-balken"
              title={`${z.zeilenLabel} – ${z.thema} – ${formatWochenspanne(z.startWochenKey)} bis ${formatWochenspanne(z.endWochenKey)} – ${Math.round(z.stunden * 10) / 10} Std`}
              style={{
                gridColumn: `${(indexVon.get(z.startWochenKey) ?? 0) + 2} / ${(indexVon.get(z.endWochenKey) ?? 0) + 3}`,
                gridRow: (rowVonReihe.get(z.reiheId) ?? 0) + 2,
                background: THEMEN_FARBEN[z.thema],
              }}
            >
              {z.balkenLabel}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
