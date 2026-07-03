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
  auslastung: 0.414,
  ampel: 'gruen',
  istFerien: false,
  ...overrides,
})

describe('EngpassBericht', () => {
  it('breaks down Bedarf into Einsatz and Koordination for each top Engpass', () => {
    render(<EngpassBericht topEngpaesse={[woche()]} />)
    expect(
      screen.getByText(/13\.3h Bedarf \(10\.4h Einsatz \+ 2\.9h Koordination\) \/ 32h Angebot/)
    ).toBeInTheDocument()
  })
})
