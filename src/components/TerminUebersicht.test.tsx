import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TerminUebersicht } from './TerminUebersicht'
import type { Person } from '../lib/types'
import type { TerminZeile } from '../lib/terminUebersicht'

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
]

function zeile(overrides: Partial<TerminZeile> = {}): TerminZeile {
  return {
    id: 'z1',
    isoDatum: '2026-11-09',
    datumOderKw: '2026-11-09',
    wochenKey: '2026-KW46',
    quelle: 'schule',
    titel: 'Reihe X',
    schulId: 's1',
    schulName: 'Schule Eins',
    thema: undefined,
    terminstatus: 'festgelegt',
    unterrichtsStunden: 2,
    koordinationsStunden: 0,
    begleitpersonIds: [],
    begleitpersonNamen: [],
    koordinatorIds: [],
    koordinatorNamen: [],
    hatKonflikt: false,
    ...overrides,
  }
}

describe('TerminUebersicht', () => {
  it('shows the number of Termine in the collapsed summary', () => {
    render(<TerminUebersicht zeilen={[zeile({ id: 'z1' }), zeile({ id: 'z2' })]} personen={personen} />)
    expect(screen.getByText('Terminliste anzeigen (2 Termine)')).toBeInTheDocument()
  })

  it('renders one table row per Zeile with its key facts', () => {
    render(
      <TerminUebersicht
        zeilen={[zeile({ schulName: 'Schule Eins', titel: 'Reihe X', thema: 'Energie', unterrichtsStunden: 2, koordinationsStunden: 0.5 })]}
        personen={personen}
      />
    )
    const table = screen.getByRole('table')
    expect(screen.getByText('Schule Eins')).toBeInTheDocument()
    expect(within(table).getByText('Reihe X')).toBeInTheDocument()
    expect(screen.getByText('Energie')).toBeInTheDocument()
  })

  it('shows a placeholder message when there are no Zeilen', () => {
    render(<TerminUebersicht zeilen={[]} personen={personen} />)
    expect(screen.getByText('Terminliste anzeigen (0 Termine)')).toBeInTheDocument()
    expect(screen.getByText('Keine Termine für die aktuelle Filterauswahl.')).toBeInTheDocument()
  })

  it('filters rows by Person', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', schulName: 'Schule A', begleitpersonIds: ['p1'], begleitpersonNamen: ['Anna'] }),
          zeile({ id: 'z2', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.click(screen.getByLabelText('Person filtern: Anna'))
    expect(screen.getByText('Schule A')).toBeInTheDocument()
    expect(screen.queryByText('Schule B')).not.toBeInTheDocument()
  })

  it('filters rows by Schule/Veranstaltung (Titel)', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', titel: 'Reihe X', schulName: 'Schule A' }),
          zeile({ id: 'z2', titel: 'Reihe Y', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.click(screen.getByLabelText('Ort filtern: Reihe X'))
    expect(screen.getByText('Schule A')).toBeInTheDocument()
    expect(screen.queryByText('Schule B')).not.toBeInTheDocument()
  })

  it('filters rows by Terminstatus', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', terminstatus: 'festgelegt', schulName: 'Schule A' }),
          zeile({ id: 'z2', terminstatus: 'offen', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.click(screen.getByLabelText('Terminstatus filtern: Festgelegt'))
    expect(screen.queryByText('Schule A')).not.toBeInTheDocument()
    expect(screen.getByText('Schule B')).toBeInTheDocument()
  })

  it('filters rows by Zeitraum (bis)', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', isoDatum: '2026-11-01', datumOderKw: '2026-11-01', schulName: 'Schule A' }),
          zeile({ id: 'z2', isoDatum: '2026-12-01', datumOderKw: '2026-12-01', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.change(screen.getByLabelText('Zeitraum bis'), { target: { value: '2026-11-15' } })
    expect(screen.getByText('Schule A')).toBeInTheDocument()
    expect(screen.queryByText('Schule B')).not.toBeInTheDocument()
  })
})
