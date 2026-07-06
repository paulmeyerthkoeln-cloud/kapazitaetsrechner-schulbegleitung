import { describe, it, expect } from 'vitest'
import { findeEinheitenInFerien } from './ferienWarnung'
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

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW44',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    angebotBasis: 32,
    zusatzangebot: 0,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: true,
    ferienName: 'Herbstferien NRW',
    ...overrides,
  }
}

describe('findeEinheitenInFerien', () => {
  it('flags a Termin whose Woche falls inside a Ferienwoche', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }] },
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
                {
                  id: 'e1',
                  index: 4,
                  datum_oder_kw: '2026-KW44',
                  kontaktzeit_h: 4,
                  personen_parallel: 1,
                  erstdurchfuehrung: false,
                  wir_begleiten: true,
                  typ: 'regulaer',
                },
              ],
            },
          ],
        },
      ],
    }
    expect(findeEinheitenInFerien(data, [woche()])).toEqual([
      { schule: 'WDG', reiheTitel: 'Theorieblöcke', einheitIndex: 4, datumOderKw: '2026-KW44', ferienName: 'Herbstferien NRW' },
    ])
  })

  it('does not flag a Termin outside any Ferienwoche', () => {
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
                {
                  id: 'e1',
                  index: 1,
                  datum_oder_kw: '2026-KW46',
                  kontaktzeit_h: 4,
                  personen_parallel: 1,
                  erstdurchfuehrung: false,
                  wir_begleiten: true,
                  typ: 'regulaer',
                },
              ],
            },
          ],
        },
      ],
    }
    const wochen = [woche({ wochenKey: '2026-KW46', istFerien: false, ferienName: null })]
    expect(findeEinheitenInFerien(data, wochen)).toEqual([])
  })

  it('checks Einheiten regardless of terminstatus or wir_begleiten', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }] },
      schulen: [
        {
          id: 's1',
          name: 'Kothen',
          reihen: [
            {
              id: 'r1',
              titel: 'Platzhalter',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [
                {
                  id: 'e1',
                  index: 1,
                  datum_oder_kw: '2026-KW44',
                  kontaktzeit_h: 1.5,
                  personen_parallel: 1,
                  erstdurchfuehrung: false,
                  wir_begleiten: false,
                  typ: 'regulaer',
                },
              ],
            },
          ],
        },
      ],
    }
    expect(findeEinheitenInFerien(data, [woche()])).toHaveLength(1)
  })

  it('collects warnings across multiple Schulen', () => {
    const reiheFuer = (id: string) => ({
      id,
      titel: 'x',
      betreuungsmodell: 'A' as const,
      fahrzeit_h: 0,
      status: 'zugesagt',
      extern_betreut: false,
      terminstatus: 'festgelegt' as const,
      einheiten: [
        {
          id: `${id}_e`,
          index: 1,
          datum_oder_kw: '2026-KW44',
          kontaktzeit_h: 1,
          personen_parallel: 1,
          erstdurchfuehrung: false,
          wir_begleiten: true,
          typ: 'regulaer' as const,
        },
      ],
    })
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }] },
      schulen: [
        { id: 's1', name: 'Schule A', reihen: [reiheFuer('r_a')] },
        { id: 's2', name: 'Schule B', reihen: [reiheFuer('r_b')] },
      ],
    }
    expect(findeEinheitenInFerien(data, [woche()])).toHaveLength(2)
  })
})
