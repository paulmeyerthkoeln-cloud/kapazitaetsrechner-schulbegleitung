import { describe, it, expect } from 'vitest'
import { berechneWochenDetailsProSchule } from './wochenDetails'
import type { Datenbestand, Einheit, Person, Schule } from './types'

const settings: Datenbestand['settings'] = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: 'Anna',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    urlaub: [],
    ...overrides,
  }
}

function einheit(overrides: Partial<Einheit> = {}): Einheit {
  return {
    id: 'e1',
    index: 1,
    datum_oder_kw: '2026-KW46',
    kontaktzeit_h: 3,
    wir_begleiten: true,
    begleitperson_ids: [],
    koordinator_ids: [],
    ...overrides,
  }
}

function schule(overrides: Partial<Schule> = {}): Schule {
  return { id: 's1', name: 'Schule Eins', reihen: [], ...overrides }
}

function datenbestand(overrides: Partial<Datenbestand> = {}): Datenbestand {
  return {
    settings,
    personen: [person({ id: 'p1', name: 'Anna' }), person({ id: 'p2', name: 'Ben' })],
    kalender: { ferien: [] },
    schulen: [],
    veranstaltungen: [],
    ...overrides,
  }
}

describe('berechneWochenDetailsProSchule', () => {
  it('returns the Kontaktzeit and accompanying names for a Schule with a Reihen-Einheit in that week', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [einheit({ kontaktzeit_h: 4, begleitperson_ids: ['p1'] })],
            },
          ],
        }),
      ],
    })
    const details = berechneWochenDetailsProSchule(data, '2026-KW46')
    expect(details).toEqual([{ schulId: 's1', schulName: 'Schule Eins', stunden: 4, begleitpersonen: ['Anna'] }])
  })

  it('adds Koordinationszeit on top of Kontaktzeit for the same Schule and week', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [einheit({ kontaktzeit_h: 4, koordinationszeit_h: 1, begleitperson_ids: ['p1'] })],
            },
          ],
        }),
      ],
    })
    const details = berechneWochenDetailsProSchule(data, '2026-KW46')
    expect(details[0].stunden).toBe(5)
  })

  it('deduplicates Begleitpersonen across multiple Einheiten of the same Schule in that week', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                einheit({ id: 'e1', kontaktzeit_h: 2, begleitperson_ids: ['p1'] }),
                einheit({ id: 'e2', kontaktzeit_h: 2, begleitperson_ids: ['p1', 'p2'] }),
              ],
            },
          ],
        }),
      ],
    })
    const details = berechneWochenDetailsProSchule(data, '2026-KW46')
    expect(details[0].stunden).toBe(4)
    expect(details[0].begleitpersonen).toEqual(['Anna', 'Ben'])
  })

  it('ignores Einheiten in a different week', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [einheit({ datum_oder_kw: '2026-KW47' })],
            },
          ],
        }),
      ],
    })
    expect(berechneWochenDetailsProSchule(data, '2026-KW46')).toEqual([])
  })

  it('ignores Reihen with terminstatus offen', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [einheit()],
            },
          ],
        }),
      ],
    })
    expect(berechneWochenDetailsProSchule(data, '2026-KW46')).toEqual([])
  })

  it('includes a Veranstaltungs-Besetzung´s Kontaktzeit and Begleitpersonen for the participating Schule', () => {
    const data = datenbestand({
      schulen: [schule({ id: 's1', name: 'Schule Eins' }), schule({ id: 's2', name: 'Schule Zwei' })],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'themenwoche',
          titel: 'Testwoche',
          terminstatus: 'festgelegt',
          schulIds: ['s1', 's2'],
          termine: [
            {
              id: 't1',
              index: 1,
              datum_oder_kw: '2026-KW46',
              kontaktzeit_h: 1.5,
              besetzungen: [
                { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0 },
                { schulId: 's2', wir_begleiten: false, begleitperson_ids: [], koordinator_ids: ['p2'], koordinationszeit_h: 1 },
              ],
            },
          ],
        },
      ],
    })
    const details = berechneWochenDetailsProSchule(data, '2026-KW46')
    expect(details).toEqual(
      expect.arrayContaining([
        { schulId: 's1', schulName: 'Schule Eins', stunden: 1.5, begleitpersonen: ['Anna'] },
        { schulId: 's2', schulName: 'Schule Zwei', stunden: 1, begleitpersonen: [] },
      ])
    )
  })

  it('sorts results by Stunden descending', () => {
    const data = datenbestand({
      schulen: [
        schule({
          id: 's1',
          name: 'Wenig',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [einheit({ kontaktzeit_h: 1 })],
            },
          ],
        }),
        schule({
          id: 's2',
          name: 'Viel',
          reihen: [
            {
              id: 'r2',
              titel: 'x',
              betreuungsmodell: 'A',
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [einheit({ id: 'e2', kontaktzeit_h: 5 })],
            },
          ],
        }),
      ],
    })
    const details = berechneWochenDetailsProSchule(data, '2026-KW46')
    expect(details.map((d) => d.schulName)).toEqual(['Viel', 'Wenig'])
  })
})
