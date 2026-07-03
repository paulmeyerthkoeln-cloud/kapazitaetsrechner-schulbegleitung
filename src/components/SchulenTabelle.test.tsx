import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchulenTabelle } from './SchulenTabelle'
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

const schulen: Schule[] = [
  {
    id: 's1',
    name: 'Schule Eins',
    reihen: [
      { id: 'r1', titel: 'Reihe Eins', betreuungsmodell: 'A', fahrzeit_h: 1, status: 'zugesagt', extern_betreut: false, einheiten: [] },
    ],
  },
  {
    id: 's2',
    name: 'Schule Zwei',
    koordination_h_pro_monat: 0.5,
    reihen: [
      { id: 'r2', titel: 'Reihe Zwei', betreuungsmodell: 'X', fahrzeit_h: 0, status: 'zugesagt', extern_betreut: true, einheiten: [] },
    ],
  },
]

describe('SchulenTabelle', () => {
  it('shows the global default coordination value when a Schule has no override', () => {
    render(<SchulenTabelle schulen={schulen} settings={settings} onKoordinationChange={vi.fn()} />)
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[0].value).toBe('1.5')
  })

  it('shows the per-Schule override when present', () => {
    render(<SchulenTabelle schulen={schulen} settings={settings} onKoordinationChange={vi.fn()} />)
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[1].value).toBe('0.5')
  })

  it('calls onKoordinationChange with the Schule id and the new value when edited', () => {
    const onKoordinationChange = vi.fn()
    render(<SchulenTabelle schulen={schulen} settings={settings} onKoordinationChange={onKoordinationChange} />)
    const eingaben = screen.getAllByRole('spinbutton')
    fireEvent.change(eingaben[0], { target: { value: '2' } })
    expect(onKoordinationChange).toHaveBeenCalledWith('s1', 2)
  })
})
