import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KapazitaetsUmverteilung } from './KapazitaetsUmverteilung'
import type { FerienZeitraum, Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

const ferien: FerienZeitraum[] = [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }]

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW46',
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
  woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW' }),
  woche({ wochenKey: '2026-KW46' }),
]

describe('KapazitaetsUmverteilung', () => {
  it('offers only Nicht-Ferienwochen as Ziel-Woche options', () => {
    render(
      <KapazitaetsUmverteilung umverteilungen={[]} ferien={ferien} wochen={wochen} onAdd={vi.fn()} onRemove={vi.fn()} />
    )
    const zielWocheSelect = screen.getByLabelText(/Ziel-Woche/i) as HTMLSelectElement
    const optionValues = Array.from(zielWocheSelect.options).map((o) => o.value)
    expect(optionValues).toEqual(['2026-KW46'])
  })

  it('calls onAdd with the selected Ferienzeitraum, Ziel-Woche, and entered Zusatzstunden', () => {
    const onAdd = vi.fn()
    render(
      <KapazitaetsUmverteilung umverteilungen={[]} ferien={ferien} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />
    )
    fireEvent.change(screen.getByLabelText(/Zusatzstunden/i), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).toHaveBeenCalledWith('Herbstferien NRW', '2026-KW46', 10)
  })

  it('calls onRemove with the correct id when the delete button is clicked', () => {
    const onRemove = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 10 },
    ]
    render(
      <KapazitaetsUmverteilung
        umverteilungen={umverteilungen}
        ferien={ferien}
        wochen={wochen}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />
    )
    fireEvent.click(screen.getByLabelText('Umverteilung u1 löschen'))
    expect(onRemove).toHaveBeenCalledWith('u1')
  })
})
