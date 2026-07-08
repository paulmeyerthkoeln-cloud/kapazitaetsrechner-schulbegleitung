import type { Einheit } from './types'

export function berechneUnserAnteil(einheiten: Einheit[]): { anzahl: number; gesamt: number; anteil: number } {
  const anzahl = einheiten.filter((e) => e.wir_begleiten).length
  const gesamt = einheiten.length
  return { anzahl, gesamt, anteil: gesamt === 0 ? 0 : anzahl / gesamt }
}

export function ermittleHaeufigsteKontaktzeit(einheiten: Einheit[]): number | null {
  if (einheiten.length === 0) return null
  const haeufigkeiten = new Map<number, number>()
  for (const e of einheiten) {
    haeufigkeiten.set(e.kontaktzeit_h, (haeufigkeiten.get(e.kontaktzeit_h) ?? 0) + 1)
  }
  let bestesKontaktzeitH = einheiten[0].kontaktzeit_h
  let besteAnzahl = 0
  for (const [kontaktzeitH, anzahl] of haeufigkeiten) {
    if (anzahl > besteAnzahl) {
      besteAnzahl = anzahl
      bestesKontaktzeitH = kontaktzeitH
    }
  }
  return bestesKontaktzeitH
}
