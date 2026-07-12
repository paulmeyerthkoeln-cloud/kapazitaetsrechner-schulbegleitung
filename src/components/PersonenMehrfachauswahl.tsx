import type { Person } from '../lib/types'

export function PersonenMehrfachauswahl({
  personen,
  ausgewaehlt,
  onChange,
  label,
  disabled = false,
}: {
  personen: Person[]
  ausgewaehlt: string[]
  onChange: (ids: string[]) => void
  label: string
  disabled?: boolean
}) {
  function toggle(personId: string, checked: boolean) {
    onChange(checked ? [...ausgewaehlt, personId] : ausgewaehlt.filter((id) => id !== personId))
  }

  const ausgewaehlteNamen = personen.filter((p) => ausgewaehlt.includes(p.id)).map((p) => p.name)

  return (
    <details className="personen-mehrfachauswahl">
      <summary>{ausgewaehlteNamen.length > 0 ? ausgewaehlteNamen.join(', ') : '— niemand —'}</summary>
      <div>
        {personen.map((person) => (
          <label key={person.id}>
            <input
              type="checkbox"
              aria-label={`${label}: ${person.name}`}
              checked={ausgewaehlt.includes(person.id)}
              disabled={disabled}
              onChange={(ev) => toggle(person.id, ev.target.checked)}
            />
            {person.name}
          </label>
        ))}
      </div>
    </details>
  )
}
