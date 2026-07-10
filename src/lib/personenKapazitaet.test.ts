import { describe, it, expect } from 'vitest'
import { berechnePersonenKapazitaet, berechneVerbleibendePersonenstunden } from './personenKapazitaet'
import type { Datenbestand, Einheit, Person, Schule, Terminstatus } from './types'

const settings: Datenbestand['settings'] = {
  planungszeitraum: { start: '2026-11-02', ende: '2026-11-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
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
    erstdurchfuehrung: false,
    wir_begleiten: true,
    begleitperson_ids: [],
    koordinator_ids: [],
    ...overrides,
  }
}

function datenbestand(overrides: Partial<Datenbestand> = {}): Datenbestand {
  return {
    settings,
    personen: [person()],
    kalender: { ferien: [] },
    schulen: [],
    veranstaltungen: [],
    ...overrides,
  }
}

function schuleMitEinheit(einheitPatch: Partial<Einheit> = {}, terminstatus: Terminstatus = 'festgelegt'): Schule {
  return {
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
        terminstatus,
        einheiten: [einheit(einheitPatch)],
      },
    ],
  }
}

describe('berechnePersonenKapazitaet', () => {
  it('returns basis capacity with no assignments or redistribution for each week in the planning period', () => {
    const ergebnis = berechnePersonenKapazitaet(datenbestand())
    expect(ergebnis).toHaveLength(1)
    expect(ergebnis[0].personId).toBe('p1')
    expect(ergebnis[0].name).toBe('Anna')
    expect(ergebnis[0].wochen.map((w) => w.wochenKey)).toEqual(['2026-KW45', '2026-KW46', '2026-KW47'])
    expect(ergebnis[0].wochen.every((w) => w.basis === 8 && w.umverteilt === 0 && w.zugewiesen === 0 && w.verbleibend === 8)).toBe(true)
  })

  it('charges the full Vorbereitung+Fahrzeit+Kontaktzeit for an assigned Begleitperson, not just Kontaktzeit', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    // kontaktzeit_h 3 + Vorbereitung (3 * 0.25 Wiederholungsfaktor) + Fahrzeit 1 (Reihe.fahrzeit_h) = 4.75
    expect(kw46.zugewiesen).toBeCloseTo(4.75, 5)
    expect(kw46.verbleibend).toBeCloseTo(3.25, 5)
    const kw45 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW45')!
    expect(kw45.zugewiesen).toBe(0)
    expect(kw45.verbleibend).toBe(8)
  })

  it("adds an assigned Koordinator's koordinationszeit_h on top of a Begleitperson's own Kontaktzeit+Vorbereitung+Fahrzeit", () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], koordinator_ids: ['p1'], kontaktzeit_h: 3, koordinationszeit_h: 1, datum_oder_kw: '2026-KW46' })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    // 4.75 (Begleitperson-Anteil, see previous test) + 1 (Koordination) = 5.75
    expect(kw46.zugewiesen).toBeCloseTo(5.75, 5)
    expect(kw46.verbleibend).toBeCloseTo(2.25, 5)
  })

  it("charges only the Koordinationszeit, not Kontaktzeit, for a Person who is a Koordinator but not a Begleitperson", () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: [], koordinator_ids: ['p1'], kontaktzeit_h: 3, koordinationszeit_h: 1, datum_oder_kw: '2026-KW46' })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(1)
  })

  it('ignores Einheiten in Reihen with terminstatus "offen"', () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' }, 'offen')],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('ignores Einheiten assigned to a different Person', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p2'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('ignores stale begleitperson_ids on an Einheit where wir_begleiten is false', () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], wir_begleiten: false, kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('nets umverteilt from that Person\'s own PersonenUmverteilung entries, both source and target weeks', () => {
    const data = datenbestand({
      personenUmverteilungen: [{ id: 'u1', personId: 'p1', quelleWochenKey: '2026-KW45', zielWochenKey: '2026-KW47', stunden: 2 }],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw45 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW45')!
    const kw47 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW47')!
    expect(kw45.umverteilt).toBe(-2)
    expect(kw45.verbleibend).toBe(6)
    expect(kw47.umverteilt).toBe(2)
    expect(kw47.verbleibend).toBe(10)
  })

  it('ignores another Person\'s PersonenUmverteilung entries', () => {
    const data = datenbestand({
      personen: [person({ id: 'p1' }), person({ id: 'p2', name: 'Ben' })],
      personenUmverteilungen: [{ id: 'u1', personId: 'p2', quelleWochenKey: '2026-KW45', zielWochenKey: '2026-KW47', stunden: 2 }],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const anna = ergebnis.find((p) => p.personId === 'p1')!
    expect(anna.wochen.every((w) => w.umverteilt === 0)).toBe(true)
  })

  it("reduces a Person's basis capacity during their own Urlaub, independent of the school Kalender.ferien", () => {
    const data = datenbestand({
      personen: [person({ urlaub: [{ name: 'Herbstferien Familie', von: '2026-11-09', bis: '2026-11-13' }] })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.basis).toBe(0)
  })
})

describe('berechneVerbleibendePersonenstunden', () => {
  it('returns the current verbleibend for that Person and week', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2026-KW46')).toBeCloseTo(3.25, 5)
  })

  it('floors at 0 when verbleibend is negative', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 20, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2026-KW46')).toBe(0)
  })

  it('returns 0 when the Person or week is not found', () => {
    const ergebnis = berechnePersonenKapazitaet(datenbestand())
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'unbekannt', '2026-KW46')).toBe(0)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2099-KW01')).toBe(0)
  })
})

describe('berechnePersonenKapazitaet with Veranstaltungen', () => {
  function datenMitVeranstaltung(besetzungen: Datenbestand['veranstaltungen'][0]['termine'][0]['besetzungen']): Datenbestand {
    return datenbestand({
      personen: [person({ id: 'p1', name: 'Anna' }), person({ id: 'p2', name: 'Ben' })],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'themenwoche',
          titel: 'Testwoche',
          terminstatus: 'festgelegt',
          schulIds: besetzungen.map((b) => b.schulId),
          termine: [
            { id: 't1', index: 1, datum_oder_kw: '2026-KW46', kontaktzeit_h: 1.5, erstdurchfuehrung: true, besetzungen },
          ],
        },
      ],
    })
  }

  it('charges each Begleitperson at each participating Schule the full individual Vorbereitung — no dedup between people', () => {
    const data = datenMitVeranstaltung([
      { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 },
      { schulId: 's2', wir_begleiten: true, begleitperson_ids: ['p2'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 0.5 },
    ])
    const ergebnis = berechnePersonenKapazitaet(data)
    const anna = ergebnis.find((p) => p.personId === 'p1')!.wochen.find((w) => w.wochenKey === '2026-KW46')!
    const ben = ergebnis.find((p) => p.personId === 'p2')!.wochen.find((w) => w.wochenKey === '2026-KW46')!
    const vorbereitung = 1.5 * settings.default_vorbereitungsfaktor_erstdurchfuehrung
    expect(anna.zugewiesen).toBeCloseTo(1.5 + vorbereitung + 1, 5)
    expect(ben.zugewiesen).toBeCloseTo(1.5 + vorbereitung + 0.5, 5)
  })

  it('adds the Organisationspauschale to an assigned Begleitperson´s charge for an Exkursion', () => {
    const data = datenbestand({
      personen: [person({ id: 'p1' })],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'exkursion',
          titel: 'Testexkursion',
          terminstatus: 'festgelegt',
          schulIds: ['s1'],
          termine: [
            {
              id: 't1',
              index: 1,
              datum_oder_kw: '2026-KW46',
              kontaktzeit_h: 1.5,
              erstdurchfuehrung: true,
              organisationspauschale_h: 2,
              besetzungen: [{ schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 }],
            },
          ],
        },
      ],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    const vorbereitung = 1.5 * settings.default_vorbereitungsfaktor_erstdurchfuehrung
    expect(kw46.zugewiesen).toBeCloseTo(1.5 + vorbereitung + 1 + 2, 5)
  })

  it('ignores a Veranstaltung with terminstatus offen', () => {
    const data = datenMitVeranstaltung([
      { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 },
    ])
    data.veranstaltungen[0].terminstatus = 'offen'
    const ergebnis = berechnePersonenKapazitaet(data)
    const anna = ergebnis.find((p) => p.personId === 'p1')!.wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(anna.zugewiesen).toBe(0)
  })
})
