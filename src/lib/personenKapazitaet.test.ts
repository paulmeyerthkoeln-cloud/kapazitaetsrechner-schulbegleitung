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
  koordination_h_pro_schule_pro_monat: 1.5,
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: 'Anna',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    ...overrides,
  }
}

function einheit(overrides: Partial<Einheit> = {}): Einheit {
  return {
    id: 'e1',
    index: 1,
    datum_oder_kw: '2026-KW46',
    kontaktzeit_h: 3,
    personen_parallel: 1,
    erstdurchfuehrung: false,
    wir_begleiten: true,
    typ: 'regulaer',
    ...overrides,
  }
}

function datenbestand(overrides: Partial<Datenbestand> = {}): Datenbestand {
  return {
    settings,
    personen: [person()],
    kalender: { ferien: [] },
    schulen: [],
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

  it('subtracts kontaktzeit_h from verbleibend for the week of an Einheit assigned to that Person', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(3)
    expect(kw46.verbleibend).toBe(5)
    const kw45 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW45')!
    expect(kw45.zugewiesen).toBe(0)
    expect(kw45.verbleibend).toBe(8)
  })

  it('ignores Einheiten in Reihen with terminstatus "offen"', () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' }, 'offen')],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('ignores Einheiten assigned to a different Person', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p2', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('ignores a stale begleitperson_id on an Einheit where wir_begleiten is false', () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_id: 'p1', wir_begleiten: false, kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })],
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
})

describe('berechneVerbleibendePersonenstunden', () => {
  it('returns the current verbleibend for that Person and week', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2026-KW46')).toBe(5)
  })

  it('floors at 0 when verbleibend is negative', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 20, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2026-KW46')).toBe(0)
  })

  it('returns 0 when the Person or week is not found', () => {
    const ergebnis = berechnePersonenKapazitaet(datenbestand())
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'unbekannt', '2026-KW46')).toBe(0)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2099-KW01')).toBe(0)
  })
})
