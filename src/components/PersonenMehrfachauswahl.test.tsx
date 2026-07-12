import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonenMehrfachauswahl } from './PersonenMehrfachauswahl'
import type { Person } from '../lib/types'

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
]

describe('PersonenMehrfachauswahl', () => {
  it('shows "— niemand —" in the summary when nothing is selected', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={[]} onChange={vi.fn()} label="Begleitpersonen" />)
    expect(screen.getByText('— niemand —')).toBeInTheDocument()
  })

  it('joins the selected names in the summary', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p1', 'p2']} onChange={vi.fn()} label="Begleitpersonen" />)
    expect(screen.getByText('Anna, Ben')).toBeInTheDocument()
  })

  it('renders one checkbox per Person, checked according to ausgewaehlt', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p2']} onChange={vi.fn()} label="Begleitpersonen" />)
    expect(screen.getByLabelText('Begleitpersonen: Anna')).not.toBeChecked()
    expect(screen.getByLabelText('Begleitpersonen: Ben')).toBeChecked()
  })

  it('calls onChange with the id added when an unchecked checkbox is checked', () => {
    const onChange = vi.fn()
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p1']} onChange={onChange} label="Begleitpersonen" />)
    fireEvent.click(screen.getByLabelText('Begleitpersonen: Ben'))
    expect(onChange).toHaveBeenCalledWith(['p1', 'p2'])
  })

  it('calls onChange with the id removed when a checked checkbox is unchecked', () => {
    const onChange = vi.fn()
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p1', 'p2']} onChange={onChange} label="Begleitpersonen" />)
    fireEvent.click(screen.getByLabelText('Begleitpersonen: Anna'))
    expect(onChange).toHaveBeenCalledWith(['p2'])
  })

  it('disables every checkbox when disabled is true', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={[]} onChange={vi.fn()} label="Begleitpersonen" disabled />)
    expect(screen.getByLabelText('Begleitpersonen: Anna')).toBeDisabled()
    expect(screen.getByLabelText('Begleitpersonen: Ben')).toBeDisabled()
  })
})
