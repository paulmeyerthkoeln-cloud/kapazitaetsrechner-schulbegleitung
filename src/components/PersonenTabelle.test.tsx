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
    urlaub: [{ name: 'Sommerurlaub', von: '2026-07-01', bis: '2026-07-10' }],
  },
]

function renderTabelle() {
  const props = {
    personen,
    onChange: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onUrlaubChange: vi.fn(),
  }
  render(<PersonenTabelle {...props} />)
  return props
}

describe('PersonenTabelle Urlaub', () => {
  it('renders an existing Urlaub entry for a Person', () => {
    renderTabelle()
    expect(screen.getByLabelText('Urlaub-Name 1 von Anna')).toHaveValue('Sommerurlaub')
    expect(screen.getByLabelText('Urlaub-Von 1 von Anna')).toHaveValue('2026-07-01')
    expect(screen.getByLabelText('Urlaub-Bis 1 von Anna')).toHaveValue('2026-07-10')
  })

  it('clicking "+ Urlaubszeitraum" appends a new empty entry', () => {
    const props = renderTabelle()
    fireEvent.click(screen.getByText('+ Urlaubszeitraum'))
    expect(props.onUrlaubChange).toHaveBeenCalledWith('p1', [
      { name: 'Sommerurlaub', von: '2026-07-01', bis: '2026-07-10' },
      { name: '', von: '', bis: '' },
    ])
  })

  it('editing the Von date of an entry calls onUrlaubChange with the updated entry', () => {
    const props = renderTabelle()
    fireEvent.change(screen.getByLabelText('Urlaub-Von 1 von Anna'), { target: { value: '2026-07-02' } })
    expect(props.onUrlaubChange).toHaveBeenCalledWith('p1', [
      { name: 'Sommerurlaub', von: '2026-07-02', bis: '2026-07-10' },
    ])
  })

  it('clicking the delete button removes that Urlaub entry', () => {
    const props = renderTabelle()
    fireEvent.click(screen.getByLabelText('Urlaub 1 von Anna löschen'))
    expect(props.onUrlaubChange).toHaveBeenCalledWith('p1', [])
  })
})
