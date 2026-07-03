import { describe, it, expect } from 'vitest'
import { pruefeStartmonate } from './restkapazitaet'
import type { Datenbestand, Person } from './types'

const settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2026-12-31' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

function person(id: string): Person {
  return {
    id,
    name: id,
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
  }
}

describe('pruefeStartmonate', () => {
  it('marks a start month machbar when ample capacity exists', () => {
    const data: Datenbestand = {
      settings,
      personen: [person('p1'), person('p2'), person('p3'), person('p4')],
      kalender: { ferien: [] },
      schulen: [],
    }
    const ergebnisse = pruefeStartmonate(
      data,
      {
        titel: 'Schule X',
        fahrzeit_h: 1.0,
        muster: { typ: 'woechentlich', kontaktzeit_h: 1.5 },
        besetzung: { typ: 'alle' },
      },
      ['2026-10']
    )
    expect(ergebnisse).toEqual([{ startmonat: '2026-10', machbar: true }])
  })

  it('marks a start month nicht machbar when it pushes an existing week over the threshold', () => {
    const data: Datenbestand = {
      settings,
      personen: [person('p1')],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's_bestehend',
          name: 'Bestehend',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false,
              einheiten: [
                {
                  id: 'e1',
                  index: 1,
                  datum_oder_kw: '2026-10-05',
                  kontaktzeit_h: 6,
                  personen_parallel: 1,
                  erstdurchfuehrung: true,
                  wir_begleiten: true,
                  typ: 'regulaer',
                },
              ],
            },
          ],
        },
      ],
    }
    const ergebnisse = pruefeStartmonate(
      data,
      {
        titel: 'Schule X',
        fahrzeit_h: 1.0,
        muster: { typ: 'woechentlich', kontaktzeit_h: 3 },
        besetzung: { typ: 'alle' },
      },
      ['2026-10']
    )
    expect(ergebnisse).toEqual([{ startmonat: '2026-10', machbar: false }])
  })
})
