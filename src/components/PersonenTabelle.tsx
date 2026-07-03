import type { Person } from '../lib/types'

export function PersonenTabelle({
  personen,
  onChange,
}: {
  personen: Person[]
  onChange: (id: string, patch: Partial<Person>) => void
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Person</th>
          <th>Stunden/Woche für Begleitung</th>
        </tr>
      </thead>
      <tbody>
        {personen.map((p) => (
          <tr key={p.id}>
            <td>
              {p.name}
              {p.szenario_optional ? ' (optional)' : ''}
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
          </tr>
        ))}
      </tbody>
    </table>
  )
}
