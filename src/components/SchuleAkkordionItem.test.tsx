import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import type { Schule, Settings } from '../lib/types'

const settings: Settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

const schule: Schule = {
  id: 's1',
  name: 'Else Lasker',
  reihen: [
    { id: 'r1', titel: 'Reihe Eins', betreuungsmodell: 'A', fahrzeit_h: 1, status: 'zugesagt', extern_betreut: false, terminstatus: 'festgelegt', einheiten: [] },
    { id: 'r2', titel: 'Reihe Zwei', betreuungsmodell: 'C', fahrzeit_h: 0, status: 'in_klaerung', extern_betreut: false, terminstatus: 'festgelegt', einheiten: [] },
  ],
}

function renderItem() {
  const props = {
    schule,
    settings,
    personen: [],
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onTermineGenerieren: vi.fn(),
    onReiheAdd: vi.fn(),
    onReiheRemove: vi.fn(),
    onReiheTitelChange: vi.fn(),
  }
  render(<SchuleAkkordionItem {...props} />)
  return props
}

describe('SchuleAkkordionItem', () => {
  it('renders the Schule name inside a summary element', () => {
    renderItem()
    expect(screen.getByText('Else Lasker').closest('summary')).not.toBeNull()
  })

  it('shows a Modell/Status meta line for each Reihe', () => {
    renderItem()
    expect(screen.getByText('Modell A · Status: zugesagt')).toBeInTheDocument()
    expect(screen.getByText('Modell C · Status: in_klaerung')).toBeInTheDocument()
  })

  it('renders one ReihenEditor per Reihe, identifiable by its title input', () => {
    renderItem()
    expect(screen.getByDisplayValue('Reihe Eins')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Reihe Zwei')).toBeInTheDocument()
  })

  it("calls onEinheitAdd with the correct Reihe id when that Reihe's add button is clicked", () => {
    const props = renderItem()
    const reiheEinsUeberschrift = screen.getByDisplayValue('Reihe Eins')
    const reiheEinsContainer = reiheEinsUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheEinsContainer).getByText('+ Termin hinzufügen'))
    expect(props.onEinheitAdd).toHaveBeenCalledWith('r1')
  })

  it('calls onTerminstatusChange with the correct Reihe id when the Terminstatus dropdown changes', () => {
    const props = renderItem()
    const reiheZweiUeberschrift = screen.getByDisplayValue('Reihe Zwei')
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    const terminstatusSelect = within(reiheZweiContainer).getByRole('combobox', { name: 'Terminstatus' })
    fireEvent.change(terminstatusSelect, { target: { value: 'offen' } })
    expect(props.onTerminstatusChange).toHaveBeenCalledWith('r2', 'offen')
  })

  it("calls onTermineGenerieren with the correct Reihe id when that Reihe's quick-setup button is clicked", () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const props = renderItem()
    const reiheZweiUeberschrift = screen.getByDisplayValue('Reihe Zwei')
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheZweiContainer).getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('r2', expect.any(String), expect.any(Number), expect.any(Number), expect.any(Number))
  })

  it('calls onReiheAdd when the "+ Kurs hinzufügen" button is clicked', () => {
    const props = renderItem()
    fireEvent.click(screen.getByText('+ Kurs hinzufügen'))
    expect(props.onReiheAdd).toHaveBeenCalled()
  })

  it("calls onReiheRemove with the correct Reihe id when that Reihe's delete button is clicked", () => {
    const props = renderItem()
    fireEvent.click(screen.getByLabelText('Reihe Zwei löschen'))
    expect(props.onReiheRemove).toHaveBeenCalledWith('r2')
  })
})
