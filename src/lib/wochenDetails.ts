import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'

export interface SchulWochenDetail {
  schulId: string
  schulName: string
  stunden: number
  begleitpersonen: string[]
}

function personenNamen(ids: Iterable<string>, personen: Datenbestand['personen']): string[] {
  const namen = [...ids].map((id) => personen.find((p) => p.id === id)?.name ?? id)
  return [...new Set(namen)].sort((a, b) => a.localeCompare(b))
}

export function berechneWochenDetailsProSchule(data: Datenbestand, wochenKey: string): SchulWochenDetail[] {
  const stundenProSchule = new Map<string, number>()
  const begleitpersonenProSchule = new Map<string, Set<string>>()

  function addiere(schulId: string, stunden: number, begleitperson_ids: string[]) {
    stundenProSchule.set(schulId, (stundenProSchule.get(schulId) ?? 0) + stunden)
    const set = begleitpersonenProSchule.get(schulId) ?? new Set<string>()
    for (const id of begleitperson_ids) set.add(id)
    begleitpersonenProSchule.set(schulId, set)
  }

  for (const schule of data.schulen) {
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        const stunden = (einheit.wir_begleiten ? einheit.kontaktzeit_h : 0) + (einheit.koordinationszeit_h ?? 0)
        if (stunden === 0) continue
        addiere(schule.id, stunden, einheit.wir_begleiten ? einheit.begleitperson_ids : [])
      }
    }
  }

  for (const veranstaltung of data.veranstaltungen) {
    if (veranstaltung.terminstatus === 'offen') continue
    for (const termin of veranstaltung.termine) {
      if (parseZuWochenKey(termin.datum_oder_kw) !== wochenKey) continue
      for (const besetzung of termin.besetzungen) {
        const stunden = (besetzung.wir_begleiten ? termin.kontaktzeit_h : 0) + besetzung.koordinationszeit_h
        if (stunden === 0) continue
        addiere(besetzung.schulId, stunden, besetzung.wir_begleiten ? besetzung.begleitperson_ids : [])
      }
    }
  }

  return [...stundenProSchule.entries()]
    .map(([schulId, stunden]) => ({
      schulId,
      schulName: data.schulen.find((s) => s.id === schulId)?.name ?? schulId,
      stunden,
      begleitpersonen: personenNamen(begleitpersonenProSchule.get(schulId) ?? [], data.personen),
    }))
    .sort((a, b) => b.stunden - a.stunden)
}
