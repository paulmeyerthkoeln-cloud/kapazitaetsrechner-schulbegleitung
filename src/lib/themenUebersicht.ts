import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand, Thema } from './types'
import type { WochenErgebnis } from './berechnung'

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

export interface ThemenGanttZeile {
  reiheId: string
  zeilenLabel: string
  balkenLabel: string
  thema: Thema | null
  startWochenKey: string
  endWochenKey: string
  stunden: number
}

export function berechneThemenGantt(data: Datenbestand): ThemenGanttZeile[] {
  const zeilen: ThemenGanttZeile[] = []
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      if (reihe.terminstatus === 'offen') continue
      const begleiteteEinheiten = reihe.einheiten.filter((e) => e.wir_begleiten)
      if (begleiteteEinheiten.length === 0) continue

      const gruppen = new Map<Thema | null, { wochenKeys: string[]; stunden: number }>()
      for (const einheit of begleiteteEinheiten) {
        const thema = einheit.thema ?? null
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        const gruppe = gruppen.get(thema) ?? { wochenKeys: [], stunden: 0 }
        gruppe.wochenKeys.push(wochenKey)
        gruppe.stunden += einheit.kontaktzeit_h
        gruppen.set(thema, gruppe)
      }

      for (const [thema, gruppe] of gruppen) {
        zeilen.push({
          reiheId: reihe.id,
          zeilenLabel: `${schule.name} – ${reihe.titel}`,
          balkenLabel: thema ?? reihe.titel,
          thema,
          startWochenKey: gruppe.wochenKeys.reduce((kleinstes, k) => (k < kleinstes ? k : kleinstes)),
          endWochenKey: gruppe.wochenKeys.reduce((groesstes, k) => (k > groesstes ? k : groesstes)),
          stunden: gruppe.stunden,
        })
      }
    }
  }
  return zeilen.sort((a, b) =>
    a.startWochenKey === b.startWochenKey ? a.zeilenLabel.localeCompare(b.zeilenLabel) : a.startWochenKey.localeCompare(b.startWochenKey)
  )
}

export interface FerienBand {
  name: string
  startWochenKey: string
  endWochenKey: string
}

export function berechneFerienBaender(wochen: WochenErgebnis[]): FerienBand[] {
  const baender: FerienBand[] = []
  let aktuelles: FerienBand | null = null
  for (const w of wochen) {
    if (w.istFerien && w.ferienName) {
      if (aktuelles && aktuelles.name === w.ferienName) {
        aktuelles.endWochenKey = w.wochenKey
      } else {
        aktuelles = { name: w.ferienName, startWochenKey: w.wochenKey, endWochenKey: w.wochenKey }
        baender.push(aktuelles)
      }
    } else {
      aktuelles = null
    }
  }
  return baender
}
