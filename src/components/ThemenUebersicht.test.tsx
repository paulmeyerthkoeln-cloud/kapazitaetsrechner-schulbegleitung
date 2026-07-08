import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemenUebersicht } from './ThemenUebersicht'
import type { ThemenGanttZeile } from '../lib/themenUebersicht'
import type { WochenErgebnis } from '../lib/berechnung'

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW37',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    angebotBasis: 32,
    zusatzangebot: 0,
    abgezogenesFerienangebot: 0,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
    ...overrides,
  }
}

const wochen: WochenErgebnis[] = [
  woche({ wochenKey: '2026-KW37' }),
  woche({ wochenKey: '2026-KW38' }),
  woche({ wochenKey: '2026-KW39', istFerien: true, ferienName: 'Herbstferien NRW' }),
]

const zeilen: ThemenGanttZeile[] = [
  {
    reiheId: 'r1',
    zeilenLabel: 'Else Lasker – Parisa',
    balkenLabel: 'Mobilität',
    thema: 'Mobilität',
    startWochenKey: '2026-KW37',
    endWochenKey: '2026-KW38',
    stunden: 3,
  },
]

describe('ThemenUebersicht', () => {
  it('shows a placeholder message when there are no Zeilen', () => {
    render(<ThemenUebersicht zeilen={[]} wochen={wochen} />)
    expect(screen.getByText(/Keine Einheiten/)).toBeInTheDocument()
  })

  it('renders the Zeilen-Label and the Thema as balkenLabel on the chart', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} />)
    expect(screen.getByText('Else Lasker – Parisa')).toBeInTheDocument()
    expect(screen.getByText('Mobilität')).toBeInTheDocument()
  })

  it('marks a Ferienwoche with a titled band', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} />)
    expect(screen.getByTitle('Herbstferien NRW')).toBeInTheDocument()
  })

  it('renders one Y-axis row per Reihe even when a course has multiple Themen-Balken', () => {
    const zweiThemenZeilen: ThemenGanttZeile[] = [
      {
        reiheId: 'r1',
        zeilenLabel: 'Schule X - Mix',
        balkenLabel: 'Energie',
        thema: 'Energie',
        startWochenKey: '2026-KW37',
        endWochenKey: '2026-KW37',
        stunden: 1.5,
      },
      {
        reiheId: 'r1',
        zeilenLabel: 'Schule X - Mix',
        balkenLabel: 'Mobilität',
        thema: 'Mobilität',
        startWochenKey: '2026-KW39',
        endWochenKey: '2026-KW39',
        stunden: 1.5,
      },
    ]
    render(<ThemenUebersicht zeilen={zweiThemenZeilen} wochen={wochen} />)
    expect(screen.getAllByText('Schule X - Mix')).toHaveLength(1)
    expect(screen.getByText('Energie')).toBeInTheDocument()
    expect(screen.getByText('Mobilität')).toBeInTheDocument()
  })
})
