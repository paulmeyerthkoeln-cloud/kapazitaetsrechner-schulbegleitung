import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EngpassBericht } from './EngpassBericht'
import type { WochenErgebnis } from '../lib/berechnung'

const woche = (overrides: Partial<WochenErgebnis> = {}): WochenErgebnis => ({
  wochenKey: '2026-KW46',
  bedarf: 13.26,
  einsatzBedarf: 10.375,
  koordinationBedarf: 2.887,
  angebot: 32,
  angebotBasis: 32,
  zusatzangebot: 0,
  abgezogenesFerienangebot: 0,
  auslastung: 0.414,
  ampel: 'gruen',
  istFerien: false,
  ferienName: null,
  ...overrides,
})

describe('EngpassBericht', () => {
  it('breaks down Bedarf into Unterrichtszeit and Koordination for each top Engpass', () => {
    render(<EngpassBericht topEngpaesse={[woche()]} />)
    expect(
      screen.getByText(/13\.3h Bedarf \(10\.4h Unterrichtszeit \+ 2\.9h Koordination\) \/ 32h Angebot/)
    ).toBeInTheDocument()
  })

  it('shows the week as a date range instead of a KW code', () => {
    render(<EngpassBericht topEngpaesse={[woche()]} />)
    expect(screen.getByText(/^09\.11\.–15\.11\.2026:/)).toBeInTheDocument()
  })

  it('describes the parallel-Begleitpersonen relief option in plain German instead of the raw field name', () => {
    render(<EngpassBericht topEngpaesse={[woche()]} />)
    expect(screen.getByText(/Anzahl paralleler Begleitpersonen je Einheit reduzieren/)).toBeInTheDocument()
    expect(screen.queryByText('personen_parallel')).not.toBeInTheDocument()
  })
})
