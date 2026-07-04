import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReihenEditor } from './ReihenEditor'
import type { Reihe } from '../lib/types'

const reihe: Reihe = {
  id: 'r1',
  titel: 'Testreihe',
  betreuungsmodell: 'A',
  fahrzeit_h: 1,
  status: 'zugesagt',
  extern_betreut: false,
  einheiten: [
    {
      id: 'e1',
      index: 1,
      datum_oder_kw: '2026-09-07',
      kontaktzeit_h: 1.5,
      personen_parallel: 1,
      erstdurchfuehrung: true,
      wir_begleiten: true,
      typ: 'regulaer',
    },
    {
      id: 'e2',
      index: 2,
      datum_oder_kw: '2026-09-14',
      kontaktzeit_h: 1.1,
      personen_parallel: 1,
      erstdurchfuehrung: false,
      wir_begleiten: false,
      typ: 'regulaer',
    },
  ],
}

function renderReihenEditor() {
  const props = {
    reihe,
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}

describe('ReihenEditor', () => {
  it('shows Kontaktzeit in minutes, converted from the stored hours', () => {
    renderReihenEditor()
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[1].value).toBe('90')
    expect(eingaben[2].value).toBe('66')
  })

  it('calls onEinheitFelderChange with kontaktzeit_h in hours when the minutes input changes', () => {
    const props = renderReihenEditor()
    const eingaben = screen.getAllByRole('spinbutton')
    fireEvent.change(eingaben[1], { target: { value: '120' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { kontaktzeit_h: 2 })
  })

  it('calls onEinheitFelderChange with the raw string when the Datum field changes', () => {
    const props = renderReihenEditor()
    const datumsfelder = screen.getAllByPlaceholderText('YYYY-MM-DD oder YYYY-KWnn')
    fireEvent.change(datumsfelder[0], { target: { value: '2026-KW50' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { datum_oder_kw: '2026-KW50' })
  })

  it('calls onEinheitRemove with the correct Einheit id when the delete button is clicked', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByLabelText('Termin 2 in Testreihe löschen'))
    expect(props.onEinheitRemove).toHaveBeenCalledWith('e2')
  })

  it('calls onEinheitAdd when the add button is clicked', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('+ Termin hinzufügen'))
    expect(props.onEinheitAdd).toHaveBeenCalled()
  })
})
