import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BedarfAngebotChart } from './BedarfAngebotChart'
import type { WochenErgebnis } from '../lib/berechnung'

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW37',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
    ...overrides,
  }
}

describe('BedarfAngebotChart', () => {
  it('shows a Ferien legend swatch alongside the existing ones', () => {
    render(<BedarfAngebotChart wochen={[woche()]} />)
    const legende = screen.getByLabelText('Legende Bedarf und Angebot')
    expect(legende).toHaveTextContent('Ferien')
  })

  it('renders without crashing when onWocheClick is provided', () => {
    render(<BedarfAngebotChart wochen={[woche()]} onWocheClick={vi.fn()} />)
    expect(screen.getByLabelText('Legende Bedarf und Angebot')).toBeInTheDocument()
  })
})
