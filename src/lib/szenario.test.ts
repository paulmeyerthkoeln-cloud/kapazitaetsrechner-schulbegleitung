import { describe, it, expect } from 'vitest'
import { berechneSzenario } from './szenario'
import type { Datenbestand, Person, Schule } from './types'

const settings = {
  planungszeitraum: { start: '2026-11-09', ende: '2026-11-09' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

function person(id: string, szenario_optional = false): Person {
  return {
    id,
    name: id,
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    urlaub: [],
    szenario_optional,
  }
}

function schuleX(): Schule {
  return { id: 'schule_x', name: 'Schule X', reihen: [] }
}

function baseData(): Datenbestand {
  return {
    settings,
    personen: [person('p1'), person('p2'), person('p3'), person('p4'), person('p5', true)],
    kalender: { ferien: [] },
    schulen: [{ id: 's1', name: 'S1', reihen: [] }, schuleX()],
  }
}

describe('berechneSzenario', () => {
  it('basis: excludes szenario_optional Personen and the "schule_x" Schule', () => {
    const { wochen } = berechneSzenario(baseData(), 'basis')
    expect(wochen[0].angebot).toBeCloseTo(32, 5)
  })

  it('ziel: includes schule_x but still excludes szenario_optional Personen', () => {
    const { wochen } = berechneSzenario(baseData(), 'ziel')
    expect(wochen[0].angebot).toBeCloseTo(32, 5)
  })

  it('verstaerkt: includes both szenario_optional Personen and schule_x', () => {
    const { wochen } = berechneSzenario(baseData(), 'verstaerkt')
    expect(wochen[0].angebot).toBeCloseTo(40, 5)
  })

  it('sensitivitaet: overrides stunden_pro_woche_fuer_begleitung for every person', () => {
    const { wochen } = berechneSzenario(baseData(), 'sensitivitaet', { stundenProPersonUeberschreiben: 6 })
    expect(wochen[0].angebot).toBeCloseTo(6 * 4, 5)
  })
})
