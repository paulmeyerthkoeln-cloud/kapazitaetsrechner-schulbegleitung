import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VeranstaltungenUebersicht } from './VeranstaltungenUebersicht'
import type { Person, Schule, Veranstaltung } from '../lib/types'

const schulen: Schule[] = [
  { id: 's1', name: 'WDG', reihen: [] },
  { id: 's2', name: 'Bayreuther Gymnasium', reihen: [] },
]

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
]

const veranstaltungen: Veranstaltung[] = [
  {
    id: 'v1',
    art: 'themenwoche',
    titel: 'Nachhaltigkeit',
    terminstatus: 'festgelegt',
    schulIds: ['s1'],
    termine: [
      {
        id: 't1',
        index: 1,
        datum_oder_kw: '2026-11-09',
        kontaktzeit_h: 1.5,
        besetzungen: [{ schulId: 's1', wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [], koordinationszeit_h: 0 }],
      },
    ],
  },
]

function renderUebersicht(overrides: Partial<Veranstaltung>[] = []) {
  const props = {
    veranstaltungen: overrides.length > 0 ? overrides.map((o, i) => ({ ...veranstaltungen[i], ...o })) : veranstaltungen,
    schulen,
    personen,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onTitelChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onSchulenChange: vi.fn(),
    onTerminAdd: vi.fn(),
    onTerminRemove: vi.fn(),
    onTerminFelderChange: vi.fn(),
    onBesetzungFelderChange: vi.fn(),
  }
  render(<VeranstaltungenUebersicht {...props} />)
  return props
}

describe('VeranstaltungenUebersicht', () => {
  it('renders the Titel of each Veranstaltung as an editable input', () => {
    renderUebersicht()
    expect(screen.getByDisplayValue('Nachhaltigkeit')).toBeInTheDocument()
  })

  it('calls onTitelChange when the Titel input changes', () => {
    const props = renderUebersicht()
    fireEvent.change(screen.getByDisplayValue('Nachhaltigkeit'), { target: { value: 'Klimawoche' } })
    expect(props.onTitelChange).toHaveBeenCalledWith('v1', 'Klimawoche')
  })

  it('calls onRemove when the delete button is clicked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Nachhaltigkeit löschen'))
    expect(props.onRemove).toHaveBeenCalledWith('v1')
  })

  it('renders one Schule checkbox per Schule, checked according to schulIds', () => {
    renderUebersicht()
    expect(screen.getByLabelText('Schule WDG für Nachhaltigkeit')).toBeChecked()
    expect(screen.getByLabelText('Schule Bayreuther Gymnasium für Nachhaltigkeit')).not.toBeChecked()
  })

  it('calls onSchulenChange with the added Schule id when an unchecked Schule checkbox is checked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Schule Bayreuther Gymnasium für Nachhaltigkeit'))
    expect(props.onSchulenChange).toHaveBeenCalledWith('v1', ['s1', 's2'])
  })

  it('renders one Besetzung row per participating Schule, showing Wir begleiten', () => {
    renderUebersicht()
    expect(screen.getByLabelText('Wir begleiten WDG bei Termin 1 in Nachhaltigkeit')).toBeChecked()
  })

  it('calls onBesetzungFelderChange when a Begleitpersonen checkbox for a Schule-Besetzung is toggled', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Begleitpersonen für WDG bei Termin 1 in Nachhaltigkeit: Anna'))
    expect(props.onBesetzungFelderChange).toHaveBeenCalledWith('v1', 't1', 's1', { begleitperson_ids: ['p1'] })
  })

  it('calls onTerminAdd when "+ Termin hinzufügen" is clicked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByText('+ Termin hinzufügen'))
    expect(props.onTerminAdd).toHaveBeenCalledWith('v1')
  })

  it('shows "+ Exkursion hinzufügen" for a Themenwoche and calls onAdd with art exkursion and the same Schulen', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByText('+ Exkursion hinzufügen'))
    expect(props.onAdd).toHaveBeenCalledWith('exkursion', ['s1'])
  })

  it('does not show "+ Exkursion hinzufügen" for an Exkursion', () => {
    renderUebersicht([{ art: 'exkursion' }])
    expect(screen.queryByText('+ Exkursion hinzufügen')).not.toBeInTheDocument()
  })

  it('does not show an Organisationspauschale input for either a Themenwoche or an Exkursion', () => {
    renderUebersicht()
    expect(screen.queryByLabelText('Organisationspauschale für Termin 1 in Nachhaltigkeit')).not.toBeInTheDocument()
    renderUebersicht([{ art: 'exkursion' }])
    expect(screen.queryByLabelText('Organisationspauschale für Termin 1 in Nachhaltigkeit')).not.toBeInTheDocument()
  })

  it('calls onTerminRemove when a Termin´s delete button is clicked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Termin 1 in Nachhaltigkeit löschen'))
    expect(props.onTerminRemove).toHaveBeenCalledWith('v1', 't1')
  })
})
