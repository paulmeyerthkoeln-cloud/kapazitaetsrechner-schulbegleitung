import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonenUmverteilung } from './PersonenUmverteilung'
import type { Person, PersonenUmverteilung as PersonenUmverteilungTyp } from '../lib/types'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] },
]

const personenKapazitaet: PersonKapazitaetsErgebnis[] = [
  {
    personId: 'p1',
    name: 'Anna',
    wochen: [
      { wochenKey: '2026-KW46', basis: 8, umverteilt: 0, zugewiesen: 3, verbleibend: 5 },
      { wochenKey: '2026-KW47', basis: 8, umverteilt: 0, zugewiesen: 0, verbleibend: 8 },
    ],
  },
  {
    personId: 'p2',
    name: 'Ben',
    wochen: [
      { wochenKey: '2026-KW46', basis: 8, umverteilt: 0, zugewiesen: 8, verbleibend: 0 },
      { wochenKey: '2026-KW47', basis: 8, umverteilt: 0, zugewiesen: 0, verbleibend: 8 },
    ],
  },
]

function renderKomponente(overrides: Partial<{
  personen: Person[]
  personenKapazitaet: PersonKapazitaetsErgebnis[]
  personenUmverteilungen: PersonenUmverteilungTyp[]
  onAdd: (personId: string, quelleWochenKey: string, zielWochenKey: string, stunden: number) => void
  onRemove: (id: string) => void
}> = {}) {
  const props = {
    personen,
    personenKapazitaet,
    personenUmverteilungen: [] as PersonenUmverteilungTyp[],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
  render(<PersonenUmverteilung {...props} />)
  return props
}

describe('PersonenUmverteilung', () => {
  it('labels the Quell-Woche options with the selected Person\'s remaining hours', () => {
    renderKomponente()
    expect(screen.getByText(/noch 5 Std verfügbar/)).toBeInTheDocument()
  })

  it('disables a Quell-Woche option once the selected Person is ausgeschöpft there', () => {
    renderKomponente()
    const personSelect = screen.getByLabelText(/^Person:/)
    fireEvent.change(personSelect, { target: { value: 'p2' } })
    const quelleSelect = screen.getByLabelText(/Quell-Woche/) as HTMLSelectElement
    const kw46Option = Array.from(quelleSelect.options).find((o) => o.value === '2026-KW46')!
    expect(kw46Option.disabled).toBe(true)
    expect(kw46Option.textContent).toMatch(/ausgeschöpft/)
  })

  it('calls onAdd with the selected Person, Quell-Woche, Ziel-Woche, and Stunden capped to verbleibend', () => {
    const props = renderKomponente()
    fireEvent.change(screen.getByLabelText(/Stunden/), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(props.onAdd).toHaveBeenCalledWith('p1', '2026-KW46', '2026-KW46', 5)
  })

  it('renders existing Personen-Umverteilungen with a working delete button', () => {
    const props = renderKomponente({
      personenUmverteilungen: [{ id: 'u1', personId: 'p1', quelleWochenKey: '2026-KW46', zielWochenKey: '2026-KW47', stunden: 2 }],
    })
    expect(screen.getByText(/2 Std von Anna aus/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Personen-Umverteilung u1 löschen'))
    expect(props.onRemove).toHaveBeenCalledWith('u1')
  })
})
