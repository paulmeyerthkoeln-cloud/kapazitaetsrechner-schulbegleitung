import './PersonenKapazitaetsUebersicht.css'
import { kwNummer } from '../lib/kalenderwochen'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

export function PersonenKapazitaetsUebersicht({ personenKapazitaet }: { personenKapazitaet: PersonKapazitaetsErgebnis[] }) {
  if (personenKapazitaet.length === 0) {
    return (
      <div>
        <h3>Personen-Kapazitäten</h3>
        <p>Keine Personen vorhanden.</p>
      </div>
    )
  }

  const wochenKeys = personenKapazitaet[0].wochen.map((w) => w.wochenKey)

  return (
    <div>
      <h3>Personen-Kapazitäten</h3>
      <div className="personen-kapazitaet-scroll">
        <div
          className="personen-kapazitaet-grid"
          style={{
            gridTemplateColumns: `8rem repeat(${wochenKeys.length}, 2.5rem)`,
            gridTemplateRows: `1.5rem repeat(${personenKapazitaet.length}, 1.75rem)`,
          }}
        >
          <div className="personen-kapazitaet-ecke" style={{ gridColumn: 1, gridRow: 1 }} />
          {wochenKeys.map((key, i) => (
            <div key={key} className="personen-kapazitaet-kw" style={{ gridColumn: i + 2, gridRow: 1 }}>
              {kwNummer(key)}
            </div>
          ))}
          {personenKapazitaet.map((person, zeile) => (
            <div
              key={`${person.personId}-label`}
              className="personen-kapazitaet-label"
              style={{ gridColumn: 1, gridRow: zeile + 2 }}
            >
              {person.name}
            </div>
          ))}
          {personenKapazitaet.map((person, zeile) =>
            person.wochen.map((w, spalte) => {
              const gerundet = Math.round(w.verbleibend * 10) / 10
              return (
                <div
                  key={`${person.personId}-${w.wochenKey}`}
                  className={`personen-kapazitaet-zelle ${gerundet >= 0 ? 'positiv' : 'negativ'}`}
                  style={{ gridColumn: spalte + 2, gridRow: zeile + 2 }}
                  title={`${person.name}, ${kwNummer(w.wochenKey)}: ${gerundet}h verbleibend`}
                >
                  {gerundet}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
