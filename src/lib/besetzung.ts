import type { BesetzungsPreset, Einheit } from './types'

export function wendeBesetzungPreset(einheiten: Einheit[], preset: BesetzungsPreset): Einheit[] {
  const n = einheiten.length
  switch (preset.typ) {
    case 'alle':
      return einheiten.map((e) => ({ ...e, wir_begleiten: true }))
    case 'keine':
      return einheiten.map((e) => ({ ...e, wir_begleiten: false }))
    case 'erste_n':
      return einheiten.map((e, i) => ({ ...e, wir_begleiten: i < preset.n }))
    case 'letzte_n':
      return einheiten.map((e, i) => ({ ...e, wir_begleiten: i >= n - preset.n }))
    case 'erste_und_letzte':
      return einheiten.map((e, i) => ({ ...e, wir_begleiten: i === 0 || i === n - 1 }))
    case 'jede_n_te':
      return einheiten.map((e, i) => ({ ...e, wir_begleiten: (i + 1) % preset.n === 0 }))
    case 'manuell':
      return einheiten
  }
}

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
