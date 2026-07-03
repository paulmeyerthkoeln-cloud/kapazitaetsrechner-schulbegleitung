import { describe, it, expect } from 'vitest'
import data from './data.json'
import type { Datenbestand } from '../lib/types'

describe('seed data.json', () => {
  it('parses as a valid Datenbestand shape', () => {
    const d = data as Datenbestand
    expect(d.settings.planungszeitraum.start).toBe('2026-09-01')
    expect(d.personen.length).toBeGreaterThanOrEqual(5)
  })

  it('contains all 10 schools from spec section 5, including the schule_x placeholder', () => {
    const d = data as Datenbestand
    expect(d.schulen).toHaveLength(10)
    expect(d.schulen.find((s) => s.id === 'schule_x')).toBeDefined()
  })

  it('marks exactly one Person as szenario_optional (Person 5)', () => {
    const d = data as Datenbestand
    expect(d.personen.filter((p) => p.szenario_optional).length).toBe(1)
  })

  it('includes both confirmed 2026 and researched 2027 Ferien', () => {
    const d = data as Datenbestand
    const namen = d.kalender.ferien.map((f) => f.name)
    expect(namen).toContain('Herbstferien NRW')
    expect(namen).toContain('Osterferien NRW 2027')
    expect(d.kalender.ferien.find((f) => f.name === 'Osterferien NRW 2027')).toMatchObject({
      von: '2027-03-22',
      bis: '2027-04-03',
    })
  })

  it('gives Else Lasker / Parisa exactly Einheiten 1 and 3 as wir_begleiten', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    const parisa = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_parisa')!
    expect(parisa.einheiten.map((e) => e.wir_begleiten)).toEqual([true, false, true, false])
  })
})
