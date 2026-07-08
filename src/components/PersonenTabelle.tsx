import type { FerienZeitraum, Person } from '../lib/types'
import './PersonenTabelle.css'

export function PersonenTabelle({
  personen,
  onChange,
  onAdd,
  onRemove,
  onUrlaubChange,
}: {
  personen: Person[]
  onChange: (id: string, patch: Partial<Person>) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onUrlaubChange: (personId: string, urlaub: FerienZeitraum[]) => void
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
            <th>Urlaub</th>
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
                <ul className="personen-urlaub-liste">
                  {p.urlaub.map((u, i) => (
                    <li key={i}>
                      <input
                        type="text"
                        aria-label={`Urlaub-Name ${i + 1} von ${p.name}`}
                        placeholder="Name"
                        value={u.name}
                        onChange={(e) =>
                          onUrlaubChange(p.id, p.urlaub.map((uu, j) => (j === i ? { ...uu, name: e.target.value } : uu)))
                        }
                      />
                      <input
                        type="date"
                        aria-label={`Urlaub-Von ${i + 1} von ${p.name}`}
                        value={u.von}
                        onChange={(e) =>
                          onUrlaubChange(p.id, p.urlaub.map((uu, j) => (j === i ? { ...uu, von: e.target.value } : uu)))
                        }
                      />
                      <input
                        type="date"
                        aria-label={`Urlaub-Bis ${i + 1} von ${p.name}`}
                        value={u.bis}
                        onChange={(e) =>
                          onUrlaubChange(p.id, p.urlaub.map((uu, j) => (j === i ? { ...uu, bis: e.target.value } : uu)))
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Urlaub ${i + 1} von ${p.name} löschen`}
                        onClick={() => onUrlaubChange(p.id, p.urlaub.filter((_, j) => j !== i))}
                      >
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onUrlaubChange(p.id, [...p.urlaub, { name: '', von: '', bis: '' }])}
                >
                  + Urlaubszeitraum
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
