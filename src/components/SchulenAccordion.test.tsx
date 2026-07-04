import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SchulenAccordion } from './SchulenAccordion'
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
      {
        id: 'r1',
        titel: 'Reihe Eins',
        betreuungsmodell: 'A',
        fahrzeit_h: 1,
        status: 'zugesagt',
        extern_betreut: false,
        einheiten: [
          {
            id: 'e1',
            index: 1,
            datum_oder_kw: '2026-09-07',
            kontaktzeit_h: 1,
            personen_parallel: 1,
            erstdurchfuehrung: false,
            wir_begleiten: false,
            typ: 'regulaer',
          },
        ],
      },
    ],
  },
  {
    id: 's2',
    name: 'Schule Zwei',
    reihen: [
      {
        id: 'r2',
        titel: 'Reihe Zwei',
        betreuungsmodell: 'C',
        fahrzeit_h: 0,
        status: 'zugesagt',
        extern_betreut: false,
        einheiten: [
          {
            id: 'e2',
            index: 1,
            datum_oder_kw: '2026-09-07',
            kontaktzeit_h: 1,
            personen_parallel: 1,
            erstdurchfuehrung: false,
            wir_begleiten: false,
            typ: 'regulaer',
          },
        ],
      },
    ],
  },
]

function renderAccordion() {
  const props = {
    schulen,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
  }
  render(<SchulenAccordion {...props} />)
  return props
}

describe('SchulenAccordion', () => {
  it('renders one details element per Schule with the Schule name as summary', () => {
    renderAccordion()
    const details = document.querySelectorAll('details')
    expect(details).toHaveLength(2)
    expect(screen.getByText('Schule Eins').closest('summary')).not.toBeNull()
    expect(screen.getByText('Schule Zwei').closest('summary')).not.toBeNull()
  })

  it('applies a Besetzung-Preset only to the matching Reihe, scoped to the correct Schule', () => {
    const props = renderAccordion()
    const reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheZweiContainer).getByText('Alle'))
    expect(props.onEinheitToggle).toHaveBeenCalledWith('r2', 'e2', true)
    expect(props.onEinheitToggle).not.toHaveBeenCalledWith('r1', 'e1', true)
  })

  it('forwards onEinheitAdd with the correct Reihe id for a specific Schule', () => {
    const props = renderAccordion()
    const reiheEinsUeberschrift = screen.getByRole('heading', { name: 'Reihe Eins' })
    const reiheEinsContainer = reiheEinsUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheEinsContainer).getByText('+ Termin hinzufügen'))
    expect(props.onEinheitAdd).toHaveBeenCalledWith('r1')
  })

  it('renders every Schule details element closed by default', () => {
    renderAccordion()
    const details = document.querySelectorAll('details')
    details.forEach((el) => {
      expect(el).not.toHaveAttribute('open')
    })
  })

  it('opens a Schule details element when its summary is clicked, and leaves other Schulen closed', () => {
    renderAccordion()
    const schuleEinsSummary = screen.getByText('Schule Eins').closest('summary') as HTMLElement
    const schuleEinsDetails = schuleEinsSummary.closest('details') as HTMLElement
    const schuleZweiDetails = screen.getByText('Schule Zwei').closest('details') as HTMLElement

    fireEvent.click(schuleEinsSummary)

    expect(schuleEinsDetails).toHaveAttribute('open')
    expect(schuleZweiDetails).not.toHaveAttribute('open')
  })
})
