import { describe, it, expect } from 'vitest'
import { berechneThemenGantt, berechneFerienBaender } from './themenUebersicht'
import type { Datenbestand } from './types'
import type { WochenErgebnis } from './berechnung'

const settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

describe('berechneThemenGantt', () => {
  it('creates one entry for consecutive Wochen with the same Thema, summing the Stunden', () => {
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
              titel: 'Parisa',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'teilweise_festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
                { id: 'e2', index: 2, datum_oder_kw: '2026-09-15', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: false, typ: 'regulaer', thema: 'Mobilität' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([
      { reiheId: 'r1', zeilenLabel: 'Else Lasker - Parisa', balkenLabel: 'Mobilität', thema: 'Mobilität', startWochenKey: '2026-KW37', endWochenKey: '2026-KW38', stunden: 3 },
    ])
  })

  it('does not create entries for Einheiten without a Thema', () => {
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
              titel: 'Theorieblöcke',
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
    expect(berechneThemenGantt(data)).toEqual([])
  })

  it('splits non-consecutive Wochen with the same Thema into separate entries', () => {
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
              titel: 'Parisa, Kl. 9, Mobilität',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'teilweise_festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
                { id: 'e2', index: 2, datum_oder_kw: '2026-09-29', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
              ],
            },
          ],
        },
      ],
    }
    const zeilen = berechneThemenGantt(data)
    expect(zeilen).toHaveLength(2)
    expect(zeilen.map((z) => `${z.startWochenKey}-${z.endWochenKey}`)).toEqual(['2026-KW37-2026-KW37', '2026-KW40-2026-KW40'])
  })

  it('shortens school and course labels for the left chart column', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Alexander-Coppel-Gesamtschule',
          reihen: [
            {
              id: 'r1',
              titel: 'UNESCO-Stunde, 3× 9. Klassen (~80 SuS, Aula) — unser Gastdozenten-Anteil',
              betreuungsmodell: 'C',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-21', kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Energie' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)[0].zeilenLabel).toBe('Coppel - UNESCO')
  })

  it('keeps a grade-level ordinal like "9." while still stripping a leading count', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Sedanstraße',
          reihen: [
            {
              id: 'r1',
              titel: 'GNU-Kurs 9. Klasse',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-07', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Energie' },
              ],
            },
            {
              id: 'r2',
              titel: '2 SoWi-Kurse 9. Klasse',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e2', index: 1, datum_oder_kw: '2026-09-07', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Energie' },
              ],
            },
          ],
        },
      ],
    }
    const zeilen = berechneThemenGantt(data)
    expect(zeilen.map((z) => z.zeilenLabel)).toEqual([
      'Sedanstraße - GNU-Kurs 9. Klasse',
      'Sedanstraße - SoWi-Kurse 9. Klasse',
    ])
  })

  it('excludes Reihen with terminstatus "offen"', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Kothen',
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
                { id: 'e1', index: 1, datum_oder_kw: '2026-10-05', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([])
  })

  it('excludes a Reihe entirely when none of its Einheiten are wir_begleiten', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Hügelstraße',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-14', kontaktzeit_h: 0, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: false, typ: 'regulaer' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([])
  })

  it('creates two separate Zeilen with the same zeilenLabel when a Reihe mixes two Themen', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule X',
          reihen: [
            {
              id: 'r1',
              titel: 'Mix',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-07', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Energie' },
                { id: 'e2', index: 2, datum_oder_kw: '2026-09-14', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Stadtgrün' },
              ],
            },
          ],
        },
      ],
    }
    const zeilen = berechneThemenGantt(data)
    expect(zeilen).toHaveLength(2)
    expect(zeilen.every((z) => z.zeilenLabel === 'Schule X - Mix')).toBe(true)
    expect(zeilen.map((z) => z.thema).sort()).toEqual(['Energie', 'Stadtgrün'])
  })

  it('sorts rows by startWochenKey, then by zeilenLabel', () => {
    const reiheFuer = (id: string, datum: string) => ({
      id,
      titel: 'x',
      betreuungsmodell: 'A' as const,
      fahrzeit_h: 0,
      status: 'zugesagt',
      extern_betreut: false,
      terminstatus: 'festgelegt' as const,
      einheiten: [
        { id: `${id}_e`, index: 1, datum_oder_kw: datum, kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' as const },
      ],
    })
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        { id: 's_b', name: 'B-Schule', reihen: [{ ...reiheFuer('r_b', '2026-11-09'), einheiten: reiheFuer('r_b', '2026-11-09').einheiten.map((e) => ({ ...e, thema: 'Energie' as const })) }] },
        { id: 's_a', name: 'A-Schule', reihen: [{ ...reiheFuer('r_a', '2026-11-09'), einheiten: reiheFuer('r_a', '2026-11-09').einheiten.map((e) => ({ ...e, thema: 'Energie' as const })) }] },
        { id: 's_c', name: 'C-Schule', reihen: [{ ...reiheFuer('r_c', '2026-09-07'), einheiten: reiheFuer('r_c', '2026-09-07').einheiten.map((e) => ({ ...e, thema: 'Energie' as const })) }] },
      ],
    }
    const zeilen = berechneThemenGantt(data)
    expect(zeilen.map((z) => z.zeilenLabel)).toEqual(['C-Schule - x', 'A-Schule - x', 'B-Schule - x'])
  })
})

describe('berechneFerienBaender', () => {
  function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
    return {
      wochenKey: '2026-KW01',
      bedarf: 0,
      einsatzBedarf: 0,
      koordinationBedarf: 0,
      angebot: 32,
      auslastung: 0,
      ampel: 'gruen',
      istFerien: false,
      ferienName: null,
      ...overrides,
    }
  }

  it('merges consecutive Wochen with the same ferienName into one Band', () => {
    const wochen = [
      woche({ wochenKey: '2026-KW42', istFerien: false, ferienName: null }),
      woche({ wochenKey: '2026-KW43', istFerien: true, ferienName: 'Herbstferien NRW' }),
      woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW' }),
      woche({ wochenKey: '2026-KW45', istFerien: false, ferienName: null }),
    ]
    expect(berechneFerienBaender(wochen)).toEqual([
      { name: 'Herbstferien NRW', startWochenKey: '2026-KW43', endWochenKey: '2026-KW44' },
    ])
  })

  it('creates separate Bänder for non-adjacent Ferienzeiträume', () => {
    const wochen = [
      woche({ wochenKey: '2026-KW43', istFerien: true, ferienName: 'Herbstferien NRW' }),
      woche({ wochenKey: '2026-KW44', istFerien: false, ferienName: null }),
      woche({ wochenKey: '2026-KW52', istFerien: true, ferienName: 'Weihnachtsferien NRW' }),
    ]
    expect(berechneFerienBaender(wochen)).toEqual([
      { name: 'Herbstferien NRW', startWochenKey: '2026-KW43', endWochenKey: '2026-KW43' },
      { name: 'Weihnachtsferien NRW', startWochenKey: '2026-KW52', endWochenKey: '2026-KW52' },
    ])
  })

  it('returns an empty array when there are no Ferienwochen', () => {
    expect(berechneFerienBaender([woche()])).toEqual([])
  })
})
