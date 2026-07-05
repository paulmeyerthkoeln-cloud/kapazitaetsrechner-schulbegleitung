import { describe, it, expect } from 'vitest'
import { berechneThemenUebersicht } from './themenUebersicht'
import type { Datenbestand } from './types'

const settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

describe('berechneThemenUebersicht', () => {
  it('sums kontaktzeit_h per Woche/Schule/Thema across matching Einheiten', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Else Lasker',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'teilweise_festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 2, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
                { id: 'e2', index: 2, datum_oder_kw: '2026-09-08', kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([{ wochenKey: '2026-KW37', schule: 'Else Lasker', thema: 'Mobilität', stunden: 3 }])
  })

  it('groups Einheiten without a thema under "Ohne Thema"', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'WDG',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-11-09', kontaktzeit_h: 4, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([{ wochenKey: '2026-KW46', schule: 'WDG', thema: 'Ohne Thema', stunden: 4 }])
  })

  it('excludes Einheiten where wir_begleiten is false', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'x',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 2, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: false, typ: 'regulaer', thema: 'Energie' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([])
  })

  it('excludes Reihen with terminstatus "offen"', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'x',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 2, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Stadtgrün' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([])
  })

  it('sorts rows chronologically by Woche, then alphabetically by Schule', () => {
    const reiheFuer = (id: string, datum: string) => ({
      id,
      titel: 'x',
      betreuungsmodell: 'A' as const,
      fahrzeit_h: 0,
      status: 'zugesagt',
      extern_betreut: false,
      terminstatus: 'festgelegt' as const,
      einheiten: [
        { id: `${id}_e`, index: 1, datum_oder_kw: datum, kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' as const, thema: 'Energie' as const },
      ],
    })
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        { id: 's_b', name: 'B-Schule', reihen: [reiheFuer('r_b', '2026-11-09')] },
        { id: 's_a', name: 'A-Schule', reihen: [reiheFuer('r_a', '2026-11-09')] },
        { id: 's_c', name: 'C-Schule', reihen: [reiheFuer('r_c', '2026-09-07')] },
      ],
    }
    const zeilen = berechneThemenUebersicht(data)
    expect(zeilen.map((z) => `${z.wochenKey}/${z.schule}`)).toEqual(['2026-KW37/C-Schule', '2026-KW46/A-Schule', '2026-KW46/B-Schule'])
  })
})
