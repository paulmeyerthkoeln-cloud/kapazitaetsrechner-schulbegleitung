import type { FerienZeitraum, Person } from '../lib/types'
import './PersonenTabelle.css'

export function PersonenTabelle({
  personen,
  onChange,
  onAdd,
  onRemove,
  onFerienChange,
}: {
  personen: Person[]
  onChange: (id: string, patch: Partial<Person>) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onFerienChange: (personId: string, ferien: FerienZeitraum[]) => void
}) {
  return (
    <div>
      <h2>Personen & Stunden/Woche für Begleitung</h2>
      <div className="personen-tabelle-scroll">
      <table className="personen-tabelle">
        <thead>
          <tr>
            <th>Person</th>
            <th>Stunden/Woche für Begleitung</th>
            <th>Ferien</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {personen.map((p) => (
            <tr key={p.id}>
              <td>
                <input
                  type="text"
                  aria-label={`Name von ${p.name}`}
                  value={p.name}
                  onChange={(e) => onChange(p.id, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={p.stunden_pro_woche_fuer_begleitung}
                  onChange={(e) => onChange(p.id, { stunden_pro_woche_fuer_begleitung: Number(e.target.value) })}
                />
                <span> {p.stunden_pro_woche_fuer_begleitung} h</span>
              </td>
              <td>
                <ul className="personen-ferien-liste">
                  {p.ferien.map((f, i) => (
                    <li key={i}>
                      <input
                        type="text"
                        aria-label={`Ferien-Name ${i + 1} von ${p.name}`}
                        placeholder="Name"
                        value={f.name}
                        onChange={(e) =>
                          onFerienChange(p.id, p.ferien.map((ff, j) => (j === i ? { ...ff, name: e.target.value } : ff)))
                        }
                      />
                      <input
                        type="date"
                        aria-label={`Ferien-Von ${i + 1} von ${p.name}`}
                        value={f.von}
                        onChange={(e) =>
                          onFerienChange(p.id, p.ferien.map((ff, j) => (j === i ? { ...ff, von: e.target.value } : ff)))
                        }
                      />
                      <input
                        type="date"
                        aria-label={`Ferien-Bis ${i + 1} von ${p.name}`}
                        value={f.bis}
                        onChange={(e) =>
                          onFerienChange(p.id, p.ferien.map((ff, j) => (j === i ? { ...ff, bis: e.target.value } : ff)))
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Ferien ${i + 1} von ${p.name} löschen`}
                        onClick={() => onFerienChange(p.id, p.ferien.filter((_, j) => j !== i))}
                      >
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onFerienChange(p.id, [...p.ferien, { name: '', von: '', bis: '' }])}
                >
                  + Ferienzeitraum
                </button>
              </td>
              <td>
                <button type="button" onClick={() => onRemove(p.id)} aria-label={`${p.name} löschen`}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <button type="button" onClick={onAdd}>
        Person hinzufügen
      </button>
    </div>
  )
}
