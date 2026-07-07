import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PersonenKapazitaetsUebersicht } from './PersonenKapazitaetsUebersicht'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

const personenKapazitaet: PersonKapazitaetsErgebnis[] = [
  {
    personId: 'p1',
    name: 'Anna',
    wochen: [
      { wochenKey: '2026-KW46', basis: 8, umverteilt: 0, zugewiesen: 3, verbleibend: 5 },
      { wochenKey: '2026-KW47', basis: 8, umverteilt: 0, zugewiesen: 10, verbleibend: -2 },
    ],
  },
]

describe('PersonenKapazitaetsUebersicht', () => {
  it('shows a placeholder message when there are no Personen', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={[]} />)
    expect(screen.getByText(/Keine Personen/)).toBeInTheDocument()
  })

  it('shows the Person name as a row label', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('shows the KW number for each week column', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />)
    expect(screen.getByText('46')).toBeInTheDocument()
    expect(screen.getByText('47')).toBeInTheDocument()
  })

  it('shows verbleibend rounded to 1 decimal in each cell, positive and negative', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />)
    expect(screen.getByText('5')).toHaveClass('positiv')
    expect(screen.getByText('-2')).toHaveClass('negativ')
  })
})
