import { berechnePersonKapazitaetsbasis } from './berechnung'
import { alleWochenImZeitraum, getISOWochenKey, parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'

export interface PersonKapazitaetsWoche {
  wochenKey: string
  basis: number
  umverteilt: number
  zugewiesen: number
  verbleibend: number
}

export interface PersonKapazitaetsErgebnis {
  personId: string
  name: string
  wochen: PersonKapazitaetsWoche[]
}

function berechneZugewieseneStundenProWoche(data: Datenbestand, personId: string): Map<string, number> {
  const zugewiesen = new Map<string, number>()
  for (const schule of data.schulen) {
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (!einheit.wir_begleiten || einheit.begleitperson_id !== personId) continue
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        zugewiesen.set(wochenKey, (zugewiesen.get(wochenKey) ?? 0) + einheit.kontaktzeit_h)
      }
    }
  }
  return zugewiesen
}

export function berechnePersonenKapazitaet(data: Datenbestand): PersonKapazitaetsErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  const personenUmverteilungen = data.personenUmverteilungen ?? []

  return data.personen.map((person) => {
    const zugewieseneStunden = berechneZugewieseneStundenProWoche(data, person.id)
    const eigeneUmverteilungen = personenUmverteilungen.filter((u) => u.personId === person.id)

    const wochen: PersonKapazitaetsWoche[] = wochenStarts.map((montag) => {
      const wochenKey = getISOWochenKey(montag)
      const basis = berechnePersonKapazitaetsbasis(person, montag)
      const eingehend = eigeneUmverteilungen.filter((u) => u.zielWochenKey === wochenKey).reduce((summe, u) => summe + u.stunden, 0)
      const ausgehend = eigeneUmverteilungen.filter((u) => u.quelleWochenKey === wochenKey).reduce((summe, u) => summe + u.stunden, 0)
      const umverteilt = eingehend - ausgehend
      const zugewiesen = zugewieseneStunden.get(wochenKey) ?? 0
      return { wochenKey, basis, umverteilt, zugewiesen, verbleibend: basis + umverteilt - zugewiesen }
    })

    return { personId: person.id, name: person.name, wochen }
  })
}

export function berechneVerbleibendePersonenstunden(
  personenKapazitaet: PersonKapazitaetsErgebnis[],
  personId: string,
  quelleWochenKey: string
): number {
  const ergebnis = personenKapazitaet.find((p) => p.personId === personId)
  const woche = ergebnis?.wochen.find((w) => w.wochenKey === quelleWochenKey)
  return Math.max(0, woche?.verbleibend ?? 0)
}
