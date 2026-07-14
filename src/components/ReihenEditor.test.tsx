import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReihenEditor } from './ReihenEditor'
import type { Person, Reihe } from '../lib/types'

const reihe: Reihe = {
  id: 'r1',
  titel: 'Testreihe',
  betreuungsmodell: 'A',
  status: 'zugesagt',
  extern_betreut: false, terminstatus: 'festgelegt',
  einheiten: [
    {
      id: 'e1',
      index: 1,
      datum_oder_kw: '2026-09-07',
      kontaktzeit_h: 1.5,
      wir_begleiten: true,
      koordinationszeit_h: 0.5,
      begleitperson_ids: [],
      koordinator_ids: [],
    },
    {
      id: 'e2',
      index: 2,
      datum_oder_kw: '2026-09-14',
      kontaktzeit_h: 1.1,
      wir_begleiten: false,
      begleitperson_ids: [],
      koordinator_ids: [],
    },
  ],
}

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
]

function renderReihenEditor() {
  const props = {
    reihe,
    personen,
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onTermineGenerieren: vi.fn(),
    onTitelChange: vi.fn(),
    onExkursionAdd: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}

describe('ReihenEditor', () => {
  it('renders the Titel as an editable input', () => {
    renderReihenEditor()
    const titel = screen.getByLabelText('Titel') as HTMLInputElement
    expect(titel.value).toBe('Testreihe')
  })

  it('calls onTitelChange when the Titel input changes', () => {
    const props = renderReihenEditor()
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Neuer Titel' } })
    expect(props.onTitelChange).toHaveBeenCalledWith('Neuer Titel')
  })

  it('shows Kontaktzeit in minutes, converted from the stored hours', () => {
    renderReihenEditor()
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[3].value).toBe('90')
    expect(eingaben[5].value).toBe('66')
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

  it('shows Koordination in minutes, converted from the stored hours', () => {
    renderReihenEditor()
    const koordinationE1 = screen.getByLabelText('Koordinationszeit für Termin 1 in Testreihe') as HTMLInputElement
    const koordinationE2 = screen.getByLabelText('Koordinationszeit für Termin 2 in Testreihe') as HTMLInputElement
    expect(koordinationE1.value).toBe('30')
    expect(koordinationE2.value).toBe('0')
  })

  it('calls onEinheitFelderChange with koordinationszeit_h in hours when the minutes input changes', () => {
    const props = renderReihenEditor()
    const koordinationszeit = screen.getByLabelText('Koordinationszeit für Termin 1 in Testreihe')
    fireEvent.change(koordinationszeit, { target: { value: '75' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { koordinationszeit_h: 1.25 })
  })

  it('labels the Koordination column in minutes', () => {
    renderReihenEditor()
    expect(screen.getByText('Koordination (min)')).toBeInTheDocument()
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
        personen={personen}
        onEinheitToggle={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
        onTitelChange={vi.fn()}
        onExkursionAdd={vi.fn()}
      />
    )
    expect(screen.queryByText(/zählt nicht in der Bedarfsrechnung/)).not.toBeInTheDocument()
    rerender(
      <ReihenEditor
        reihe={{ ...reihe, terminstatus: 'offen' }}
        personen={personen}
        onEinheitToggle={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
        onTitelChange={vi.fn()}
        onExkursionAdd={vi.fn()}
      />
    )
    expect(screen.getByText(/zählt nicht in der Bedarfsrechnung/)).toBeInTheDocument()
  })

  it('calls onTermineGenerieren with the entered Startdatum, Unterrichtszeit in hours, and Anzahl Termine', () => {
    const reiheOhneTermine = { ...reihe, einheiten: [] }
    const props = {
      reihe: reiheOhneTermine,
      personen,
      onEinheitToggle: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
      onTerminstatusChange: vi.fn(),
      onTermineGenerieren: vi.fn(),
      onTitelChange: vi.fn(),
      onExkursionAdd: vi.fn(),
    }
    render(<ReihenEditor {...props} />)
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Startdatum'), { target: { value: '2026-09-07' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Unterrichtszeit'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Anzahl Termine'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('2026-09-07', 1.5, 0, 4)
  })

  it('calls onTermineGenerieren with the entered Koordination in hours', () => {
    const reiheOhneTermine = { ...reihe, einheiten: [] }
    const props = {
      reihe: reiheOhneTermine,
      personen,
      onEinheitToggle: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
      onTerminstatusChange: vi.fn(),
      onTermineGenerieren: vi.fn(),
      onTitelChange: vi.fn(),
      onExkursionAdd: vi.fn(),
    }
    render(<ReihenEditor {...props} />)
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Startdatum'), { target: { value: '2026-09-07' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Unterrichtszeit'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Koordination'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Anzahl Termine'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('2026-09-07', 1.5, 0.25, 4)
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
        personen={personen}
        onEinheitToggle={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
        onTitelChange={vi.fn()}
        onExkursionAdd={vi.fn()}
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
        personen={personen}
        onEinheitToggle={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
        onTitelChange={vi.fn()}
        onExkursionAdd={vi.fn()}
      />
    )
    const unterrichtszeit = screen.getByLabelText('Schnelleinrichtung Unterrichtszeit') as HTMLInputElement
    expect(unterrichtszeit.value).toBe('90')
  })

  it('renders a Begleitpersonen checkbox for each Person', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Anna')).toBeInTheDocument()
    expect(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Ben')).toBeInTheDocument()
  })

  it('disables the Begleitpersonen checkboxes when Wir begleiten is off', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Begleitpersonen für Termin 2 in Testreihe: Anna')).toBeDisabled()
  })

  it('enables the Begleitpersonen checkboxes when Wir begleiten is on', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Anna')).not.toBeDisabled()
  })

  it('calls onEinheitFelderChange with the updated begleitperson_ids when a Begleitpersonen checkbox is toggled', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Ben'))
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { begleitperson_ids: ['p2'] })
  })

  it('renders a Koordinatoren checkbox for each Person, not disabled when Wir begleiten is off', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Koordinatoren für Termin 2 in Testreihe: Anna')).not.toBeDisabled()
  })

  it('calls onEinheitFelderChange with the updated koordinator_ids when a Koordinatoren checkbox is toggled', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByLabelText('Koordinatoren für Termin 1 in Testreihe: Anna'))
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { koordinator_ids: ['p1'] })
  })

  it('calls onExkursionAdd when the Exkursion button is clicked', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('+ Exkursion hinzufügen'))
    expect(props.onExkursionAdd).toHaveBeenCalled()
  })
})
