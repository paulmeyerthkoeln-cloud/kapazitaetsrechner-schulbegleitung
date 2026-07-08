import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WochenHeatmap } from './WochenHeatmap'
import type { WochenErgebnis } from '../lib/berechnung'

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW46',
    bedarf: 13.26,
    einsatzBedarf: 10.4,
    koordinationBedarf: 2.9,
    angebot: 32,
    auslastung: 0.414,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
    ...overrides,
  }
}

describe('WochenHeatmap', () => {
  it('shows the auslastung percentage with a date-range title for a regular week', () => {
    render(<WochenHeatmap wochen={[woche()]} />)
    expect(screen.getByTitle(/09\.11\.–15\.11\.2026: 41% Auslastung/)).toBeInTheDocument()
  })

  it('shows the Ferienname instead of a percentage for a Ferienwoche', () => {
    render(
      <WochenHeatmap
        wochen={[woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW', auslastung: 0 })]}
      />
    )
    expect(screen.getByTitle('Ferien: Herbstferien NRW')).toBeInTheDocument()
  })

  it('renders a visible legend explaining the colors', () => {
    render(<WochenHeatmap wochen={[woche()]} />)
    expect(screen.getByText(/Grün/)).toBeInTheDocument()
    expect(screen.getByText(/Gelb/)).toBeInTheDocument()
    expect(screen.getByText(/Rot/)).toBeInTheDocument()
    expect(screen.getByText(/Ferien/)).toBeInTheDocument()
  })

  it('shows the KW number as a label under each square', () => {
    render(<WochenHeatmap wochen={[woche()]} />)
    expect(screen.getByText('46')).toBeInTheDocument()
  })
})
