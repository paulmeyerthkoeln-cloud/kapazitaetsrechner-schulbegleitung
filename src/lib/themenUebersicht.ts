import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'

export interface ThemenZeile {
  wochenKey: string
  schule: string
  thema: string
  stunden: number
}

export function berechneThemenUebersicht(data: Datenbestand): ThemenZeile[] {
  const zeilenMap = new Map<string, ThemenZeile>()
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      if (reihe.terminstatus === 'offen') continue
      for (const einheit of reihe.einheiten) {
        if (!einheit.wir_begleiten) continue
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        const thema = einheit.thema ?? 'Ohne Thema'
        const schluessel = `${wochenKey}__${schule.name}__${thema}`
        const bestehend = zeilenMap.get(schluessel)
        if (bestehend) {
          bestehend.stunden += einheit.kontaktzeit_h
        } else {
          zeilenMap.set(schluessel, { wochenKey, schule: schule.name, thema, stunden: einheit.kontaktzeit_h })
        }
      }
    }
  }
  return Array.from(zeilenMap.values()).sort((a, b) =>
    a.wochenKey === b.wochenKey ? a.schule.localeCompare(b.schule) : a.wochenKey.localeCompare(b.wochenKey)
  )
}
