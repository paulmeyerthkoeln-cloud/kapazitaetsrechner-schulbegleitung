import { describe, it, expect } from 'vitest'
import { berechneAufwandEinheit, berechneKoordinationWoche, berechneBedarfProWoche, berechneAngebotProWoche } from './berechnung'
import { ampelFarbe, berechneWochenuebersicht, berechneMachbarkeit } from './berechnung'
import type { Einheit, Settings, Schule, Datenbestand, Person } from './types'

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

describe('berechneBedarfProWoche', () => {
  it('adds coordination from Einheiten scheduled in the selected week instead of a monthly school average', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          koordination_h_pro_monat: 99,
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false, koordinationszeit_h: 2 }),
                einheit({ id: 'e2', datum_oder_kw: '2026-KW47', wir_begleiten: false, koordinationszeit_h: 4 }),
              ],
            },
          ],
        },
      ],
    }

    expect(berechneBedarfProWoche(data, '2026-KW46', false).koordinationBedarf).toBe(2)
    expect(berechneBedarfProWoche(data, '2026-KW47', false).koordinationBedarf).toBe(4)
  })

  it('reproduces the full KW46/2026 hand-calculation from spec section 9 (~13.26h)', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 'wdg',
          name: 'WDG',
          reihen: [
            {
              id: 'r_wdg',
              titel: 'Theorieblöcke',
              betreuungsmodell: 'A',
              fahrzeit_h: 1.0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [einheit({ datum_oder_kw: '2026-KW46', kontaktzeit_h: 4, erstdurchfuehrung: true })],
            },
          ],
        },
        {
          id: 'sedanstrasse',
          name: 'Gym. Sedanstraße',
          reihen: [
            {
              id: 'r_sedan',
              titel: 'GNU-Kurs',
              betreuungsmodell: 'A',
              fahrzeit_h: 0.5,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [
                einheit({ id: 'e_sedan', datum_oder_kw: '2026-KW46', kontaktzeit_h: 1.5, erstdurchfuehrung: false }),
              ],
            },
          ],
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `schule_${i}`,
          name: `Schule ${i}`,
          reihen: [
            {
              id: `r_${i}`,
              titel: 'laufende Reihe',
              betreuungsmodell: 'C' as const,
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt' as const,
              einheiten: [einheit({ id: `e_${i}`, datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        })),
        {
          id: 'huegelstrasse',
          name: 'HS Hügelstraße',
          koordination_h_pro_monat: 0.5,
          reihen: [
            {
              id: 'r_huegel',
              titel: 'laufend',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true, terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e_huegel', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }

    // Per-unit coordination is now entered directly on each Einheit. The legacy monthly
    // defaults are no longer added automatically.
    const { einsatzBedarf, koordinationBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    expect(einsatzBedarf + koordinationBedarf).toBeCloseTo(10.375, 5)
    expect(koordinationBedarf).toBe(0)
  })

  it('excludes a Schule\'s coordination before its Reihe has started or after it has ended', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2027-KW10', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
    expect(berechneBedarfProWoche(data, '2027-KW10', false).koordinationBedarf).toBe(0)
  })

  it('still charges coordination for a Modell-X Schule with wir_begleiten always false, while its Reihe is active', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 'huegel',
          name: 'Hügelstraße',
          koordination_h_pro_monat: 0.5,
          reihen: [
            {
              id: 'r_huegel',
              titel: 'x',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true, terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    const { einsatzBedarf, koordinationBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    expect(einsatzBedarf).toBe(0)
    expect(koordinationBedarf).toBe(0)
  })

  it('counts a Schule\'s coordination only once even when multiple Reihen are simultaneously active', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          reihen: [
            {
              id: 'r1',
              titel: 'a',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
            {
              id: 'r2',
              titel: 'b',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e2', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false).koordinationBedarf).toBe(0)
  })

  it('returns 0 for a Ferienwoche regardless of scheduled Einheiten', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 'wdg',
          name: 'WDG',
          reihen: [
            {
              id: 'r_wdg',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1.0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [einheit({ datum_oder_kw: '2026-KW46' })],
            },
          ],
        },
      ],
    }

    expect(berechneBedarfProWoche(data, '2026-KW46', true)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
  })
})

describe('Reihe.terminstatus filtering', () => {
  it('excludes an offen Reihe entirely from einsatzBedarf and koordinationBedarf', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule Offen',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', kontaktzeit_h: 4 })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
  })

  it('still counts a teilweise_festgelegt Reihe normally', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule Teilweise',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'teilweise_festgelegt',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', kontaktzeit_h: 4 })],
            },
          ],
        },
      ],
    }
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    expect(einsatzBedarf).toBeCloseTo(berechneAufwandEinheit(einheit({ kontaktzeit_h: 4 }), 1, settings), 5)
  })

  it('excludes koordination entirely when a Schule has only an offen Reihe', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Nur Offen',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false).koordinationBedarf).toBe(0)
  })
})

describe('berechneAngebotProWoche', () => {
  const person = (overrides: Partial<Person> = {}): Person => ({
    id: 'p1',
    name: 'Person 1',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    ferien: [],
    ...overrides,
  })

  it('sums the weekly hours of 4 active people to 32h (spec section 9)', () => {
    const personen = [person({ id: 'p1' }), person({ id: 'p2' }), person({ id: 'p3' }), person({ id: 'p4' })]
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'))).toBeCloseTo(32, 5)
  })

  it('reduces capacity by 20% per absent weekday in that week', () => {
    const personen = [
      person({ abwesenheiten: [{ von: '2026-11-09', bis: '2026-11-10', grund: 'Urlaub' }] }),
    ]
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'))).toBeCloseTo(8 * (1 - 0.4), 5)
  })

  it('reduces capacity by 20% per weekday covered by a Ferien entry', () => {
    const personen = [
      person({ ferien: [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-10' }] }),
    ]
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'))).toBeCloseTo(8 * (1 - 0.4), 5)
  })

  it('counts a weekday covered by both an Abwesenheit and a Ferien entry only once', () => {
    const personen = [
      person({
        abwesenheiten: [{ von: '2026-11-09', bis: '2026-11-09', grund: 'Arzt' }],
        ferien: [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-10' }],
      }),
    ]
    // 2026-11-09 is covered by both; 2026-11-10 only by Ferien -> 2 distinct days off, not 3.
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'))).toBeCloseTo(8 * (1 - 0.4), 5)
  })

  it('excludes people who are not active during that week', () => {
    const personen = [person({ aktiv_ab: '2027-02-01' })]
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'))).toBe(0)
  })
})

describe('ampelFarbe', () => {
  it('is gruen below the warning threshold', () => {
    expect(ampelFarbe(0.5, settings)).toBe('gruen')
  })
  it('is gelb between the thresholds', () => {
    expect(ampelFarbe(0.8, settings)).toBe('gelb')
  })
  it('is rot above the critical threshold', () => {
    expect(ampelFarbe(0.95, settings)).toBe('rot')
  })
})

describe('berechneWochenuebersicht', () => {
  it('reproduces the KW46/2026 end-to-end load without legacy monthly coordination', () => {
    const personen: Person[] = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      name: `Person ${i}`,
      stunden_pro_woche_fuer_begleitung: 8,
      aktiv_ab: '2026-09-01',
      aktiv_bis: '2027-07-16',
      abwesenheiten: [],
      ferien: [],
    }))
    const data: Datenbestand = {
      settings: { ...settings, planungszeitraum: { start: '2026-11-09', ende: '2026-11-09' } },
      personen,
      kalender: { ferien: [] },
      schulen: [
        {
          id: 'wdg',
          name: 'WDG',
          reihen: [
            {
              id: 'r_wdg',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1.0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [einheit({ datum_oder_kw: '2026-KW46', kontaktzeit_h: 4, erstdurchfuehrung: true })],
            },
          ],
        },
        {
          id: 'sedanstrasse',
          name: 'Sedanstraße',
          reihen: [
            {
              id: 'r_sedan',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 0.5,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [
                einheit({ id: 'e_sedan', datum_oder_kw: '2026-KW46', kontaktzeit_h: 1.5, erstdurchfuehrung: false }),
              ],
            },
          ],
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `schule_${i}`,
          name: `Schule ${i}`,
          reihen: [
            {
              id: `r_${i}`,
              titel: 'x',
              betreuungsmodell: 'C' as const,
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt' as const,
              einheiten: [einheit({ id: `e_${i}`, datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        })),
        {
          id: 'huegelstrasse',
          name: 'Hügelstraße',
          koordination_h_pro_monat: 0.5,
          reihen: [
            {
              id: 'r_huegel',
              titel: 'x',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true, terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e_huegel', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }

    const wochen = berechneWochenuebersicht(data)
    expect(wochen).toHaveLength(1)
    expect(wochen[0].wochenKey).toBe('2026-KW46')
    expect(wochen[0].auslastung).toBeCloseTo(0.324, 2)
    expect(wochen[0].ampel).toBe('gruen')
    expect(wochen[0].bedarf).toBeCloseTo(wochen[0].einsatzBedarf + wochen[0].koordinationBedarf, 10)
  })

  it('does not add coordination unless an Einheit has explicit coordination time', () => {
    const data: Datenbestand = {
      settings: { ...settings, planungszeitraum: { start: '2026-11-02', ende: '2026-11-16' } },
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false, terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }

    const wochen = berechneWochenuebersicht(data)
    expect(wochen).toHaveLength(3)
    expect(wochen[0].wochenKey).toBe('2026-KW45')
    expect(wochen[1].wochenKey).toBe('2026-KW46')
    expect(wochen[2].wochenKey).toBe('2026-KW47')
    expect(wochen[0].koordinationBedarf).toBe(0)
    expect(wochen[2].koordinationBedarf).toBe(0)
    expect(wochen[1].koordinationBedarf).toBe(0)
  })

})

describe('berechneMachbarkeit', () => {
  const basis: import('./berechnung').WochenErgebnis = {
    wochenKey: '2026-KW01',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
  }

  it('is machbar when no week is rot', () => {
    const wochen = [basis, { ...basis, wochenKey: '2026-KW02', auslastung: 0.8, ampel: 'gelb' as const }]
    const result = berechneMachbarkeit(wochen)
    expect(result.machbar).toBe(true)
    expect(result.anzahlGelbeWochen).toBe(1)
  })

  it('is not machbar when at least one week is rot', () => {
    const wochen = [basis, { ...basis, wochenKey: '2026-KW02', auslastung: 0.95, ampel: 'rot' as const }]
    expect(berechneMachbarkeit(wochen).machbar).toBe(false)
  })

  it('returns the top 5 weeks by auslastung, descending', () => {
    const wochen = Array.from({ length: 8 }, (_, i) => ({
      ...basis,
      wochenKey: `2026-KW0${i}`,
      auslastung: i / 10,
    }))
    const top = berechneMachbarkeit(wochen).topEngpaesse
    expect(top).toHaveLength(5)
    expect(top[0].auslastung).toBeCloseTo(0.7, 5)
    expect(top[4].auslastung).toBeCloseTo(0.3, 5)
  })
})
