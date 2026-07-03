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
              extern_betreut: false,
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
              extern_betreut: false,
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
              extern_betreut: false,
              einheiten: [einheit({ id: `e_${i}`, datum_oder_kw: '2026-KW10', wir_begleiten: false })],
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
              extern_betreut: true,
              einheiten: [einheit({ id: 'e_huegel', datum_oder_kw: '2026-KW10', wir_begleiten: false })],
            },
          ],
        },
      ],
    }

    // 8 Schulen bei Koordination-Default (WDG, Sedanstraße, 6 Füll-Schulen) + Hügelstraße reduziert:
    // Koordination = (8*1.5 + 0.5) / 4.33 = 2.887h. Aufwand WDG 8.0h + Sedanstraße 2.375h.
    // Gesamt = 8.0 + 2.375 + 2.887 = 13.262h — matches spec section 9 exactly.
    // NOTE: koordination is charged per Schule that has any Einheit anywhere (not gated to
    // this exact wochenKey) — see the corrected berechneBedarfProWoche in Step 3 below. The
    // 6 dummy schools and Hügelstraße only have Einheiten dated 2026-KW10, not 2026-KW46,
    // to specifically exercise this "coordination doesn't require an Einheit this week" rule.
    expect(berechneBedarfProWoche(data, '2026-KW46', false)).toBeCloseTo(13.26, 1)
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
              extern_betreut: false,
              einheiten: [einheit({ datum_oder_kw: '2026-KW46' })],
            },
          ],
        },
      ],
    }

    expect(berechneBedarfProWoche(data, '2026-KW46', true)).toBe(0)
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
  it('reproduces 41% Grün for KW46/2026 (spec section 9 end-to-end)', () => {
    const personen: Person[] = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i}`,
      name: `Person ${i}`,
      stunden_pro_woche_fuer_begleitung: 8,
      aktiv_ab: '2026-09-01',
      aktiv_bis: '2027-07-16',
      abwesenheiten: [],
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
              extern_betreut: false,
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
              extern_betreut: false,
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
              extern_betreut: false,
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
              extern_betreut: true,
              einheiten: [einheit({ id: 'e_huegel', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }

    const wochen = berechneWochenuebersicht(data)
    expect(wochen).toHaveLength(1)
    expect(wochen[0].wochenKey).toBe('2026-KW46')
    expect(wochen[0].auslastung).toBeCloseTo(0.414, 2)
    expect(wochen[0].ampel).toBe('gruen')
  })
})

describe('berechneMachbarkeit', () => {
  const basis: import('./berechnung').WochenErgebnis = {
    wochenKey: '2026-KW01',
    bedarf: 0,
    angebot: 32,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
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
