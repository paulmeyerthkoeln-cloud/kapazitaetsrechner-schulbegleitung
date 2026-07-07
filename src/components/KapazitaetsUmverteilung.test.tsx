import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KapazitaetsUmverteilung } from './KapazitaetsUmverteilung'
import type { Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW46',
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
  woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW', angebotBasis: 32 }),
  woche({ wochenKey: '2026-KW46' }),
]

describe('KapazitaetsUmverteilung', () => {
  it('offers only Ferienwochen as Quell-Woche, labeled with the remaining hours', () => {
    render(<KapazitaetsUmverteilung umverteilungen={[]} wochen={wochen} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/26\.10\.–01\.11\.2026 – Herbstferien NRW – noch 32 Std verfügbar/)).toBeInTheDocument()
  })

  it('offers only Nicht-Ferienwochen as Ziel-Woche options', () => {
    render(<KapazitaetsUmverteilung umverteilungen={[]} wochen={wochen} onAdd={vi.fn()} onRemove={vi.fn()} />)
    const zielWocheSelect = screen.getByLabelText(/Ziel-Woche/i) as HTMLSelectElement
    const optionValues = Array.from(zielWocheSelect.options).map((o) => o.value)
    expect(optionValues).toEqual(['2026-KW46'])
  })

  it('calls onAdd with the Quell-Woche, its Ferienname, the Ziel-Woche, and the entered Zusatzstunden', () => {
    const onAdd = vi.fn()
    render(<KapazitaetsUmverteilung umverteilungen={[]} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Zusatzstunden/i), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).toHaveBeenCalledWith('2026-KW44', 'Herbstferien NRW', '2026-KW46', 10)
  })

  it('caps the entered Zusatzstunden to the remaining capacity of the Quell-Woche', () => {
    const onAdd = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 28 },
    ]
    render(<KapazitaetsUmverteilung umverteilungen={umverteilungen} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Zusatzstunden/i), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).toHaveBeenCalledWith('2026-KW44', 'Herbstferien NRW', '2026-KW46', 4)
  })

  it('disables the Hinzufügen button once the selected Quell-Woche is fully ausgeschöpft', () => {
    const onAdd = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 32 },
    ]
    render(<KapazitaetsUmverteilung umverteilungen={umverteilungen} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />)
    expect(screen.getByText(/ausgeschöpft/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('calls onRemove with the correct id when the delete button is clicked', () => {
    const onRemove = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 10 },
    ]
    render(<KapazitaetsUmverteilung umverteilungen={umverteilungen} wochen={wochen} onAdd={vi.fn()} onRemove={onRemove} />)
    fireEvent.click(screen.getByLabelText('Umverteilung u1 löschen'))
    expect(onRemove).toHaveBeenCalledWith('u1')
  })
})
