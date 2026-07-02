import { getISOWeek, getISOWeekYear, startOfISOWeek, endOfISOWeek } from 'date-fns'
import type { FerienZeitraum, Muster, Einheit } from './types'

export function getISOWochenKey(date: Date): string {
  const jahr = getISOWeekYear(date)
  const woche = getISOWeek(date)
  return `${jahr}-KW${String(woche).padStart(2, '0')}`
}

const KW_REGEX = /^(\d{4})-KW(\d{2})$/

export function parseZuWochenKey(datumOderKw: string): string {
  if (KW_REGEX.test(datumOderKw)) return datumOderKw
  return getISOWochenKey(new Date(datumOderKw))
}

export function istDatumInFerien(date: Date, ferien: FerienZeitraum[]): boolean {
  return ferien.some((f) => date >= new Date(f.von) && date <= new Date(f.bis))
}

export function istWocheInFerien(wochenStartMontag: Date, ferien: FerienZeitraum[]): boolean {
  const wocheStart = startOfISOWeek(wochenStartMontag)
  const wocheEnd = endOfISOWeek(wochenStartMontag)
  // Check if more than half (>3.5 days) of the week overlaps with ferien
  const WEEK_DAYS = 7
  const OVERLAP_THRESHOLD = WEEK_DAYS / 2

  for (const f of ferien) {
    const ferienStart = new Date(f.von)
    const ferienEnd = new Date(f.bis)

    // Calculate overlap interval
    const overlapStart = new Date(Math.max(wocheStart.getTime(), ferienStart.getTime()))
    const overlapEnd = new Date(Math.min(wocheEnd.getTime(), ferienEnd.getTime()))

    if (overlapStart.getTime() <= overlapEnd.getTime()) {
      // There is an overlap
      const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (24 * 60 * 60 * 1000)
      if (overlapDays > OVERLAP_THRESHOLD) {
        return true
      }
    }
  }

  return false
}

export function alleWochenImZeitraum(start: string, ende: string): Date[] {
  const wochen: Date[] = []
  let cursor = startOfISOWeek(new Date(start))
  const endeDatum = new Date(ende)
  while (cursor.getTime() <= endeDatum.getTime()) {
    wochen.push(new Date(cursor))
    cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
  return wochen
}

export function expandiereMuster(muster: Muster, reiheId: string, ferien: FerienZeitraum[]): Einheit[] {
  const einheiten: Einheit[] = []
  let cursor = new Date(muster.von)
  const ende = new Date(muster.bis)
  let index = 0
  while (cursor.getTime() <= ende.getTime()) {
    if (!istWocheInFerien(cursor, ferien)) {
      index += 1
      einheiten.push({
        id: `${reiheId}_muster_${index}`,
        index,
        datum_oder_kw: cursor.toISOString().slice(0, 10),
        kontaktzeit_h: muster.kontaktzeit_h,
        personen_parallel: 1,
        erstdurchfuehrung: false,
        wir_begleiten: true,
        typ: 'regulaer',
      })
    }
    cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000)
  }
  return einheiten
}
