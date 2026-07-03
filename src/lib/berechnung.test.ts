import { describe, it, expect } from 'vitest'
import { berechneAufwandEinheit, berechneKoordinationWoche } from './berechnung'
import type { Einheit, Settings, Schule } from './types'

const settings: Settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

function einheit(overrides: Partial<Einheit> = {}): Einheit {
  return {
    id: 'e1',
    index: 1,
    datum_oder_kw: '2026-KW46',
    kontaktzeit_h: 4,
    personen_parallel: 1,
    erstdurchfuehrung: true,
    wir_begleiten: true,
    typ: 'regulaer',
    ...overrides,
  }
}

describe('berechneAufwandEinheit', () => {
  it('matches the WDG hand-calculation from spec section 9 (8.0h)', () => {
    expect(berechneAufwandEinheit(einheit(), 1.0, settings)).toBeCloseTo(8.0, 5)
  })

  it('matches the Sedanstraße hand-calculation from spec section 9 (2.375h)', () => {
    const e = einheit({ kontaktzeit_h: 1.5, erstdurchfuehrung: false })
    expect(berechneAufwandEinheit(e, 0.5, settings)).toBeCloseTo(2.375, 5)
  })

  it('doubles the total for personen_parallel: 2', () => {
    const e = einheit({ personen_parallel: 2 })
    expect(berechneAufwandEinheit(e, 1.0, settings)).toBeCloseTo(16.0, 5)
  })

  it('adds the Organisationspauschale for Exkursionen', () => {
    const e = einheit({ typ: 'exkursion', kontaktzeit_h: 4, erstdurchfuehrung: false, organisationspauschale_h: 2 })
    expect(berechneAufwandEinheit(e, 0, settings)).toBeCloseTo(4 + 4 * 0.25 + 2, 5)
  })
})

describe('berechneKoordinationWoche', () => {
  const schule: Schule = { id: 's1', name: 'Test', reihen: [] }

  it('uses the settings default when no override is set', () => {
    expect(berechneKoordinationWoche(schule, settings)).toBeCloseTo(1.5 / 4.33, 5)
  })

  it('uses the per-school override when present (e.g. Hügelstraße)', () => {
    expect(berechneKoordinationWoche({ ...schule, koordination_h_pro_monat: 0.5 }, settings)).toBeCloseTo(0.5 / 4.33, 5)
  })
})
