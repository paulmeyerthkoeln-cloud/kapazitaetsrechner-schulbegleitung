import { parseZuWochenKey, zuIsoDatum } from './kalenderwochen'
import type { Datenbestand, Terminstatus, Thema } from './types'

export interface TerminZeile {
  id: string
  isoDatum: string
  datumOderKw: string
  wochenKey: string
  quelle: 'schule' | 'veranstaltung'
  titel: string
  schulId: string
  schulName: string
  thema?: Thema
  terminstatus: Terminstatus
  unterrichtsStunden: number
  koordinationsStunden: number
  begleitpersonIds: string[]
  begleitpersonNamen: string[]
  koordinatorIds: string[]
  koordinatorNamen: string[]
  hatKonflikt: boolean
}

function personenNamen(ids: string[], personen: Datenbestand['personen']): string[] {
  return ids.map((id) => personen.find((p) => p.id === id)?.name ?? id)
}

function baueSchulZeilen(data: Datenbestand): TerminZeile[] {
  const zeilen: TerminZeile[] = []
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        const begleitpersonIds = einheit.wir_begleiten ? einheit.begleitperson_ids : []
        zeilen.push({
          id: `schule_${einheit.id}`,
          isoDatum: zuIsoDatum(einheit.datum_oder_kw),
          datumOderKw: einheit.datum_oder_kw,
          wochenKey: parseZuWochenKey(einheit.datum_oder_kw),
          quelle: 'schule',
          titel: reihe.titel,
          schulId: schule.id,
          schulName: schule.name,
          thema: einheit.thema,
          terminstatus: reihe.terminstatus,
          unterrichtsStunden: einheit.wir_begleiten ? einheit.kontaktzeit_h : 0,
          koordinationsStunden: einheit.koordinationszeit_h ?? 0,
          begleitpersonIds,
          begleitpersonNamen: personenNamen(begleitpersonIds, data.personen),
          koordinatorIds: einheit.koordinator_ids,
          koordinatorNamen: personenNamen(einheit.koordinator_ids, data.personen),
          hatKonflikt: false,
        })
      }
    }
  }
  return zeilen
}

function baueVeranstaltungsZeilen(data: Datenbestand): TerminZeile[] {
  const zeilen: TerminZeile[] = []
  for (const veranstaltung of data.veranstaltungen) {
    for (const termin of veranstaltung.termine) {
      for (const besetzung of termin.besetzungen) {
        const begleitpersonIds = besetzung.wir_begleiten ? besetzung.begleitperson_ids : []
        const schulName = data.schulen.find((s) => s.id === besetzung.schulId)?.name ?? besetzung.schulId
        zeilen.push({
          id: `veranstaltung_${termin.id}_${besetzung.schulId}`,
          isoDatum: zuIsoDatum(termin.datum_oder_kw),
          datumOderKw: termin.datum_oder_kw,
          wochenKey: parseZuWochenKey(termin.datum_oder_kw),
          quelle: 'veranstaltung',
          titel: veranstaltung.titel,
          schulId: besetzung.schulId,
          schulName,
          thema: termin.thema,
          terminstatus: veranstaltung.terminstatus,
          unterrichtsStunden: besetzung.wir_begleiten ? termin.kontaktzeit_h : 0,
          koordinationsStunden: besetzung.koordinationszeit_h,
          begleitpersonIds,
          begleitpersonNamen: personenNamen(begleitpersonIds, data.personen),
          koordinatorIds: besetzung.koordinator_ids,
          koordinatorNamen: personenNamen(besetzung.koordinator_ids, data.personen),
          hatKonflikt: false,
        })
      }
    }
  }
  return zeilen
}

export function berechneTerminUebersicht(data: Datenbestand): TerminZeile[] {
  return [...baueSchulZeilen(data), ...baueVeranstaltungsZeilen(data)]
}
