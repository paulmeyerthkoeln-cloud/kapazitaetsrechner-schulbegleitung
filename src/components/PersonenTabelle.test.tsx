import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonenTabelle } from './PersonenTabelle'
import type { Person } from '../lib/types'

const personen: Person[] = [
  {
    id: 'p1',
    name: 'Anna',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    ferien: [{ name: 'Sommerurlaub', von: '2026-07-01', bis: '2026-07-10' }],
  },
]

function renderTabelle() {
  const props = {
    personen,
    onChange: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onFerienChange: vi.fn(),
  }
  render(<PersonenTabelle {...props} />)
  return props
}

describe('PersonenTabelle Ferien', () => {
  it('renders an existing Ferien entry for a Person', () => {
    renderTabelle()
    expect(screen.getByLabelText('Ferien-Name 1 von Anna')).toHaveValue('Sommerurlaub')
    expect(screen.getByLabelText('Ferien-Von 1 von Anna')).toHaveValue('2026-07-01')
    expect(screen.getByLabelText('Ferien-Bis 1 von Anna')).toHaveValue('2026-07-10')
  })

  it('clicking "+ Ferienzeitraum" appends a new empty entry', () => {
    const props = renderTabelle()
    fireEvent.click(screen.getByText('+ Ferienzeitraum'))
    expect(props.onFerienChange).toHaveBeenCalledWith('p1', [
      { name: 'Sommerurlaub', von: '2026-07-01', bis: '2026-07-10' },
      { name: '', von: '', bis: '' },
    ])
  })

  it('editing the Von date of an entry calls onFerienChange with the updated entry', () => {
    const props = renderTabelle()
    fireEvent.change(screen.getByLabelText('Ferien-Von 1 von Anna'), { target: { value: '2026-07-02' } })
    expect(props.onFerienChange).toHaveBeenCalledWith('p1', [
      { name: 'Sommerurlaub', von: '2026-07-02', bis: '2026-07-10' },
    ])
  })

  it('clicking the delete button removes that Ferien entry', () => {
    const props = renderTabelle()
    fireEvent.click(screen.getByLabelText('Ferien 1 von Anna löschen'))
    expect(props.onFerienChange).toHaveBeenCalledWith('p1', [])
  })
})
