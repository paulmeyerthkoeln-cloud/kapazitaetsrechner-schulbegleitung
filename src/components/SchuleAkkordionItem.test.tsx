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
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
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

  it('renders one ReihenEditor per Reihe, identifiable by its title heading', () => {
    renderItem()
    expect(screen.getByRole('heading', { name: 'Reihe Eins' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reihe Zwei' })).toBeInTheDocument()
  })

  it('calls onKoordinationChange with the Schule id when the coordination field changes', () => {
    const props = renderItem()
    const eingabe = screen.getByRole('spinbutton', { name: /Koordination/i })
    fireEvent.change(eingabe, { target: { value: '3' } })
    expect(props.onKoordinationChange).toHaveBeenCalledWith('s1', 3)
  })

  it('shows the global default Koordination value when the Schule has no override', () => {
    renderItem()
    const eingabe = screen.getByRole('spinbutton', { name: /Koordination/i })
    expect(eingabe).toHaveValue(settings.koordination_h_pro_schule_pro_monat)
  })

  it('shows the Schule-specific Koordination override value instead of the global default', () => {
    const props = {
      schule: { ...schule, koordination_h_pro_monat: 0.5 },
      settings,
      onKoordinationChange: vi.fn(),
      onEinheitToggle: vi.fn(),
      onPresetApply: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
      onTerminstatusChange: vi.fn(),
    }
    render(<SchuleAkkordionItem {...props} />)
    const eingabe = screen.getByRole('spinbutton', { name: /Koordination/i })
    expect(eingabe).toHaveValue(0.5)
  })

  it("calls onEinheitAdd with the correct Reihe id when that Reihe's add button is clicked", () => {
    const props = renderItem()
    const reiheEinsUeberschrift = screen.getByRole('heading', { name: 'Reihe Eins' })
    const reiheEinsContainer = reiheEinsUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheEinsContainer).getByText('+ Termin hinzufügen'))
    expect(props.onEinheitAdd).toHaveBeenCalledWith('r1')
  })

  it('calls onTerminstatusChange with the correct Reihe id when the Terminstatus dropdown changes', () => {
    const props = renderItem()
    const reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    const terminstatusSelect = within(reiheZweiContainer).getByRole('combobox', { name: 'Terminstatus' })
    fireEvent.change(terminstatusSelect, { target: { value: 'offen' } })
    expect(props.onTerminstatusChange).toHaveBeenCalledWith('r2', 'offen')
  })
})
