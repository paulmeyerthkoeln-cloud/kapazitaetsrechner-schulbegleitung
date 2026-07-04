import { getISOWeek, getISOWeekYear, startOfISOWeek, addWeeks, areIntervalsOverlapping, endOfISOWeek, parseISO, format } from 'date-fns'
import type { FerienZeitraum, Muster, Einheit, Reihe } from './types'

export function getISOWochenKey(date: Date): string {
  const jahr = getISOWeekYear(date)
  const woche = getISOWeek(date)
  return `${jahr}-KW${String(woche).padStart(2, '0')}`
}

const KW_REGEX = /^(\d{4})-KW(\d{2})$/

export function parseZuWochenKey(datumOderKw: string): string {
  if (KW_REGEX.test(datumOderKw)) return datumOderKw
  return getISOWochenKey(parseISO(datumOderKw))
}

export function istDatumInFerien(date: Date, ferien: FerienZeitraum[]): boolean {
  return ferien.some((f) => date >= parseISO(f.von) && date <= parseISO(f.bis))
}

export function istWocheInFerien(wochenStartMontag: Date, ferien: FerienZeitraum[]): boolean {
  const wocheInterval = { start: startOfISOWeek(wochenStartMontag), end: endOfISOWeek(wochenStartMontag) }
  return ferien.some((f) =>
    areIntervalsOverlapping(wocheInterval, { start: parseISO(f.von), end: parseISO(f.bis) }, { inclusive: true })
  )
}

export function alleWochenImZeitraum(start: string, ende: string): Date[] {
  const wochen: Date[] = []
  let cursor = startOfISOWeek(parseISO(start))
  const endeDatum = parseISO(ende)
  while (cursor <= endeDatum) {
    wochen.push(cursor)
    cursor = addWeeks(cursor, 1)
  }
  return wochen
}

export function expandiereMuster(muster: Muster, reiheId: string, ferien: FerienZeitraum[]): Einheit[] {
  const einheiten: Einheit[] = []
  let cursor = parseISO(muster.von)
  const ende = parseISO(muster.bis)
  let index = 0
  while (cursor <= ende) {
    if (!istWocheInFerien(cursor, ferien)) {
      index += 1
      einheiten.push({
        id: `${reiheId}_muster_${index}`,
        index,
        datum_oder_kw: format(cursor, 'yyyy-MM-dd'),
        kontaktzeit_h: muster.kontaktzeit_h,
        personen_parallel: 1,
        erstdurchfuehrung: false,
        wir_begleiten: true,
        typ: 'regulaer',
      })
    }
    cursor = addWeeks(cursor, 1)
  }
  return einheiten
}

export function berechneReiheZeitraum(reihe: Reihe): { von: string; bis: string } | null {
  if (reihe.einheiten.length === 0) return null
  const wochenKeys = reihe.einheiten.map((e) => parseZuWochenKey(e.datum_oder_kw))
  // String comparison of "YYYY-KWnn" keys is chronologically correct because
  // getISOWochenKey always produces a 4-digit year and a zero-padded week.
  return {
    von: wochenKeys.reduce((kleinstes, key) => (key < kleinstes ? key : kleinstes)),
    bis: wochenKeys.reduce((groesstes, key) => (key > groesstes ? key : groesstes)),
  }
}

export function ermittleFerienName(wochenStartMontag: Date, ferien: FerienZeitraum[]): string | null {
  const wocheInterval = { start: startOfISOWeek(wochenStartMontag), end: endOfISOWeek(wochenStartMontag) }
  const treffer = ferien.find((f) =>
    areIntervalsOverlapping(wocheInterval, { start: parseISO(f.von), end: parseISO(f.bis) }, { inclusive: true })
  )
  return treffer?.name ?? null
}
