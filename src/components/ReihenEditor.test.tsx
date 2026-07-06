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
  extern_betreut: false, terminstatus: 'festgelegt',
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
    onTerminstatusChange: vi.fn(),
    onTermineGenerieren: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}

describe('ReihenEditor', () => {
  it('shows Kontaktzeit in minutes, converted from the stored hours', () => {
    renderReihenEditor()
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[3].value).toBe('90')
    expect(eingaben[4].value).toBe('66')
  })

  it('calls onEinheitFelderChange with kontaktzeit_h in hours when the minutes input changes', () => {
    const props = renderReihenEditor()
    const eingaben = screen.getAllByRole('spinbutton')
    fireEvent.change(eingaben[3], { target: { value: '120' } })
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

  it('labels the Kontaktzeit column as Unterrichtszeit', () => {
    renderReihenEditor()
    expect(screen.getByText('Unterrichtszeit (min)')).toBeInTheDocument()
  })

  it('defaults the Thema select to "— kein Thema —" when the Einheit has no thema', () => {
    renderReihenEditor()
    const thema1 = screen.getByRole('combobox', { name: 'Thema für Termin 1 in Testreihe' }) as HTMLSelectElement
    expect(thema1.value).toBe('')
  })

  it('calls onEinheitFelderChange with the selected Thema', () => {
    const props = renderReihenEditor()
    const thema1 = screen.getByRole('combobox', { name: 'Thema für Termin 1 in Testreihe' })
    fireEvent.change(thema1, { target: { value: 'Mobilität' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { thema: 'Mobilität' })
  })

  it('shows the current Terminstatus in the dropdown', () => {
    renderReihenEditor()
    const terminstatusSelect = screen.getByRole('combobox', { name: 'Terminstatus' }) as HTMLSelectElement
    expect(terminstatusSelect.value).toBe('festgelegt')
  })

  it('calls onTerminstatusChange when the Terminstatus dropdown changes', () => {
    const props = renderReihenEditor()
    const terminstatusSelect = screen.getByRole('combobox', { name: 'Terminstatus' })
    fireEvent.change(terminstatusSelect, { target: { value: 'offen' } })
    expect(props.onTerminstatusChange).toHaveBeenCalledWith('offen')
  })

  it('shows an "offen" badge only when Terminstatus is offen', () => {
    const { rerender } = render(
      <ReihenEditor
        reihe={reihe}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
      />
    )
    expect(screen.queryByText(/zählt nicht in der Bedarfsrechnung/)).not.toBeInTheDocument()
    rerender(
      <ReihenEditor
        reihe={{ ...reihe, terminstatus: 'offen' }}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
      />
    )
    expect(screen.getByText(/zählt nicht in der Bedarfsrechnung/)).toBeInTheDocument()
  })

  it('calls onTermineGenerieren with the entered Startdatum, Unterrichtszeit in hours, and Anzahl Termine', () => {
    const reiheOhneTermine = { ...reihe, einheiten: [] }
    const props = {
      reihe: reiheOhneTermine,
      onEinheitToggle: vi.fn(),
      onPresetApply: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
      onTerminstatusChange: vi.fn(),
      onTermineGenerieren: vi.fn(),
    }
    render(<ReihenEditor {...props} />)
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Startdatum'), { target: { value: '2026-09-07' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Unterrichtszeit'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Anzahl Termine'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('2026-09-07', 1.5, 4)
  })

  it('asks for confirmation before generating when the Reihe already has Termine, and skips the call when cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(window.confirm).toHaveBeenCalled()
    expect(props.onTermineGenerieren).not.toHaveBeenCalled()
  })

  it('proceeds with generation when the confirmation dialog is accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalled()
  })

  it('defaults the Schnelleinrichtung Unterrichtszeit to the most common existing Kontaktzeit, in minutes', () => {
    const wdgAehnlicheReihe: Reihe = {
      ...reihe,
      einheiten: [
        { ...reihe.einheiten[0], id: 'w1', kontaktzeit_h: 4 },
        { ...reihe.einheiten[0], id: 'w2', kontaktzeit_h: 4 },
        { ...reihe.einheiten[0], id: 'w3', kontaktzeit_h: 1.5 },
      ],
    }
    render(
      <ReihenEditor
        reihe={wdgAehnlicheReihe}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
      />
    )
    const unterrichtszeit = screen.getByLabelText('Schnelleinrichtung Unterrichtszeit') as HTMLInputElement
    expect(unterrichtszeit.value).toBe('240')
  })

  it('falls back to 90 minutes for the Schnelleinrichtung Unterrichtszeit when the Reihe has no Termine yet', () => {
    const reiheOhneTermine = { ...reihe, einheiten: [] }
    render(
      <ReihenEditor
        reihe={reiheOhneTermine}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
      />
    )
    const unterrichtszeit = screen.getByLabelText('Schnelleinrichtung Unterrichtszeit') as HTMLInputElement
    expect(unterrichtszeit.value).toBe('90')
  })
})
