import { describe, it, expect } from 'vitest'
import { berechneTerminUebersicht } from './terminUebersicht'
import type { Datenbestand, Einheit, Person, Reihe, Schule } from './types'

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
    datum_oder_kw: '2026-11-09',
    kontaktzeit_h: 2,
    wir_begleiten: true,
    begleitperson_ids: [],
    koordinator_ids: [],
    ...overrides,
  }
}

function reihe(overrides: Partial<Reihe> = {}): Reihe {
  return {
    id: 'r1',
    titel: 'Reihe X',
    betreuungsmodell: 'A',
    status: 'zugesagt',
    extern_betreut: false,
    terminstatus: 'festgelegt',
    einheiten: [einheit()],
    ...overrides,
  }
}

function schule(overrides: Partial<Schule> = {}): Schule {
  return { id: 's1', name: 'Schule Eins', reihen: [reihe()], ...overrides }
}

function datenbestand(overrides: Partial<Datenbestand> = {}): Datenbestand {
  return {
    settings,
    personen: [person({ id: 'p1', name: 'Anna' }), person({ id: 'p2', name: 'Ben' })],
    kalender: { ferien: [] },
    schulen: [schule()],
    veranstaltungen: [],
    ...overrides,
  }
}

describe('berechneTerminUebersicht – Schulen', () => {
  it('creates one Zeile per Einheit with resolved names and hours', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            reihe({
              titel: 'Reihe X',
              terminstatus: 'festgelegt',
              einheiten: [
                einheit({
                  id: 'e1',
                  datum_oder_kw: '2026-11-09',
                  kontaktzeit_h: 2,
                  koordinationszeit_h: 0.5,
                  wir_begleiten: true,
                  begleitperson_ids: ['p1'],
                  koordinator_ids: ['p2'],
                  thema: 'Energie',
                }),
              ],
            }),
          ],
        }),
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]).toMatchObject({
      isoDatum: '2026-11-09',
      datumOderKw: '2026-11-09',
      wochenKey: '2026-KW46',
      quelle: 'schule',
      titel: 'Reihe X',
      schulId: 's1',
      schulName: 'Schule Eins',
      thema: 'Energie',
      terminstatus: 'festgelegt',
      unterrichtsStunden: 2,
      koordinationsStunden: 0.5,
      begleitpersonIds: ['p1'],
      begleitpersonNamen: ['Anna'],
      koordinatorIds: ['p2'],
      koordinatorNamen: ['Ben'],
    })
  })

  it('sets unterrichtsStunden to 0 when wir_begleiten is false, but keeps koordinationsStunden', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            reihe({
              einheiten: [
                einheit({ kontaktzeit_h: 3, koordinationszeit_h: 1, wir_begleiten: false, begleitperson_ids: ['p1'] }),
              ],
            }),
          ],
        }),
      ],
    })
    const [zeile] = berechneTerminUebersicht(data)
    expect(zeile.unterrichtsStunden).toBe(0)
    expect(zeile.koordinationsStunden).toBe(1)
    expect(zeile.begleitpersonIds).toEqual([])
  })
})

describe('berechneTerminUebersicht – Veranstaltungen', () => {
  it('creates one Zeile per Besetzung of a Veranstaltungs-Termin', () => {
    const data = datenbestand({
      schulen: [schule({ id: 's1', name: 'Schule Eins', reihen: [] }), schule({ id: 's2', name: 'Schule Zwei', reihen: [] })],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'themenwoche',
          titel: 'Nachhaltigkeitswoche',
          terminstatus: 'festgelegt',
          schulIds: ['s1', 's2'],
          termine: [
            {
              id: 't1',
              index: 1,
              datum_oder_kw: '2026-11-10',
              kontaktzeit_h: 1.5,
              thema: 'Stadtgrün',
              besetzungen: [
                { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0 },
                { schulId: 's2', wir_begleiten: false, begleitperson_ids: [], koordinator_ids: ['p2'], koordinationszeit_h: 1 },
              ],
            },
          ],
        },
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen).toHaveLength(2)
    expect(zeilen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quelle: 'veranstaltung',
          titel: 'Nachhaltigkeitswoche',
          schulId: 's1',
          schulName: 'Schule Eins',
          thema: 'Stadtgrün',
          unterrichtsStunden: 1.5,
          koordinationsStunden: 0,
          begleitpersonNamen: ['Anna'],
        }),
        expect.objectContaining({
          quelle: 'veranstaltung',
          titel: 'Nachhaltigkeitswoche',
          schulId: 's2',
          schulName: 'Schule Zwei',
          unterrichtsStunden: 0,
          koordinationsStunden: 1,
          koordinatorNamen: ['Ben'],
        }),
      ])
    )
  })
})
