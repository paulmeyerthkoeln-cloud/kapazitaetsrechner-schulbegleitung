import './ThemenUebersicht.css'
import { formatWochenspanne } from '../lib/kalenderwochen'
import { berechneFerienBaender } from '../lib/themenUebersicht'
import type { ThemenGanttZeile } from '../lib/themenUebersicht'
import type { FerienWarnung } from '../lib/ferienWarnung'
import type { WochenErgebnis } from '../lib/berechnung'
import type { Thema } from '../lib/types'

const THEMEN_FARBEN: Record<Thema | 'ohne', string> = {
  Ernährung: '#e07a5f',
  Stadtgrün: '#3d9970',
  Mobilität: '#4a7fbf',
  Energie: '#e6b800',
  Exkursion: '#7b5ea7',
  ohne: '#8a8a8a',
}

function kwNummer(wochenKey: string): string {
  const treffer = /^\d{4}-KW(\d{2})$/.exec(wochenKey)
  return treffer ? treffer[1] : wochenKey
}

export function ThemenUebersicht({
  zeilen,
  wochen,
  ferienWarnungen,
}: {
  zeilen: ThemenGanttZeile[]
  wochen: WochenErgebnis[]
  ferienWarnungen: FerienWarnung[]
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

  return (
    <div>
      <h3>Themen-Übersicht</h3>
      {ferienWarnungen.length > 0 && (
        <div className="themen-warnung">
          ⚠️ {ferienWarnungen.length} Termin{ferienWarnungen.length === 1 ? '' : 'e'}{' '}
          {ferienWarnungen.length === 1 ? 'liegt' : 'liegen'} in den Ferien:
          <ul>
            {ferienWarnungen.map((w, i) => (
              <li key={i}>
                {w.schule} – {w.reiheTitel}, Termin {w.einheitIndex} ({w.datumOderKw}, {w.ferienName})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="themen-gantt-scroll">
        <div
          className="themen-gantt-grid"
          style={{
            gridTemplateColumns: `11rem repeat(${wochenKeys.length}, 2.5rem)`,
            gridTemplateRows: `1.5rem repeat(${zeilen.length}, 2.25rem)`,
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
                gridRow: `2 / ${zeilen.length + 2}`,
              }}
            />
          ))}
          {zeilen.map((z, i) => (
            <div key={`${z.reiheId}-${z.balkenLabel}-label`} className="themen-gantt-label" style={{ gridColumn: 1, gridRow: i + 2 }}>
              {z.zeilenLabel}
            </div>
          ))}
          {zeilen.map((z, i) => (
            <div
              key={`${z.reiheId}-${z.balkenLabel}-balken`}
              className="themen-gantt-balken"
              title={`${z.zeilenLabel} – ${z.thema} – ${formatWochenspanne(z.startWochenKey)} bis ${formatWochenspanne(z.endWochenKey)} – ${Math.round(z.stunden * 10) / 10} Std`}
              style={{
                gridColumn: `${(indexVon.get(z.startWochenKey) ?? 0) + 2} / ${(indexVon.get(z.endWochenKey) ?? 0) + 3}`,
                gridRow: i + 2,
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
