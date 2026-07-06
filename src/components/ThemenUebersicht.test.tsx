import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemenUebersicht } from './ThemenUebersicht'
import type { ThemenGanttZeile } from '../lib/themenUebersicht'
import type { FerienWarnung } from '../lib/ferienWarnung'
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
    render(<ThemenUebersicht zeilen={[]} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.getByText(/Keine Einheiten/)).toBeInTheDocument()
  })

  it('renders the Zeilen-Label and the Thema as balkenLabel on the chart', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.getByText('Else Lasker – Parisa')).toBeInTheDocument()
    expect(screen.getByText('Mobilität')).toBeInTheDocument()
  })

  it('marks a Ferienwoche with a titled band', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.getByTitle('Herbstferien NRW')).toBeInTheDocument()
  })

  it('does not show a warning box when there are no ferienWarnungen', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.queryByText(/liegen? in den Ferien/)).not.toBeInTheDocument()
  })

  it('shows a warning box listing each Termin that falls into the Ferien', () => {
    const ferienWarnungen: FerienWarnung[] = [
      { schule: 'WDG', reiheTitel: 'Theorieblöcke', einheitIndex: 4, datumOderKw: '2026-KW44', ferienName: 'Weihnachtsferien NRW' },
    ]
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={ferienWarnungen} />)
    expect(screen.getByText(/1 Termin liegt in den Ferien/)).toBeInTheDocument()
    expect(screen.getByText(/WDG – Theorieblöcke, Termin 4/)).toBeInTheDocument()
  })

  it('pluralizes the warning heading for more than one Termin', () => {
    const ferienWarnungen: FerienWarnung[] = [
      { schule: 'WDG', reiheTitel: 'x', einheitIndex: 1, datumOderKw: '2026-KW44', ferienName: 'Herbstferien NRW' },
      { schule: 'Kothen', reiheTitel: 'y', einheitIndex: 2, datumOderKw: '2026-KW44', ferienName: 'Herbstferien NRW' },
    ]
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={ferienWarnungen} />)
    expect(screen.getByText(/2 Termine liegen in den Ferien/)).toBeInTheDocument()
  })
})
