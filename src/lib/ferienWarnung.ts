import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'
import type { WochenErgebnis } from './berechnung'

export interface FerienWarnung {
  schule: string
  reiheTitel: string
  einheitIndex: number
  datumOderKw: string
  ferienName: string
}

export function findeEinheitenInFerien(data: Datenbestand, wochen: WochenErgebnis[]): FerienWarnung[] {
  const warnungen: FerienWarnung[] = []
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        const woche = wochen.find((w) => w.wochenKey === wochenKey)
        if (woche?.istFerien && woche.ferienName) {
          warnungen.push({
            schule: schule.name,
            reiheTitel: reihe.titel,
            einheitIndex: einheit.index,
            datumOderKw: einheit.datum_oder_kw,
            ferienName: woche.ferienName,
          })
        }
      }
    }
  }
  return warnungen
}
