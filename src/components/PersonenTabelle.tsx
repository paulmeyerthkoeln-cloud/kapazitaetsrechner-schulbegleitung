import type { Person } from '../lib/types'
import './PersonenTabelle.css'

export function PersonenTabelle({
  personen,
  onChange,
  onAdd,
  onRemove,
}: {
  personen: Person[]
  onChange: (id: string, patch: Partial<Person>) => void
  onAdd: () => void
  onRemove: (id: string) => void
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
