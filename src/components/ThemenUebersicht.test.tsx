import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemenUebersicht } from './ThemenUebersicht'
import type { ThemenZeile } from '../lib/themenUebersicht'

describe('ThemenUebersicht', () => {
  it('renders one table row per Zeile with Woche as a date range, Schule, Thema, and Stunden', () => {
    const zeilen: ThemenZeile[] = [
      { wochenKey: '2026-KW46', schule: 'WDG', thema: 'Ohne Thema', stunden: 8 },
      { wochenKey: '2026-KW37', schule: 'Else Lasker', thema: 'Mobilität', stunden: 2 },
    ]
    render(<ThemenUebersicht zeilen={zeilen} />)
    expect(screen.getByText('09.11.–15.11.2026')).toBeInTheDocument()
    expect(screen.getByText('WDG')).toBeInTheDocument()
    expect(screen.getByText('Mobilität')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows a placeholder message when there are no Zeilen', () => {
    render(<ThemenUebersicht zeilen={[]} />)
    expect(screen.getByText(/Keine Einheiten/)).toBeInTheDocument()
  })
})
