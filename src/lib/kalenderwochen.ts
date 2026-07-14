import { getISOWeek, getISOWeekYear, startOfISOWeek, addWeeks, areIntervalsOverlapping, endOfISOWeek, parseISO, format, setISOWeek, setISOWeekYear } from 'date-fns'
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

export function kwNummer(wochenKey: string): string {
  const treffer = KW_REGEX.exec(wochenKey)
  return treffer ? treffer[2] : wochenKey
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
  const ende = parseISO(muster.bis!)
  let index = 0
  while (cursor <= ende) {
    if (!istWocheInFerien(cursor, ferien)) {
      index += 1
      einheiten.push({
        id: `${reiheId}_muster_${index}`,
        index,
        datum_oder_kw: format(cursor, 'yyyy-MM-dd'),
        kontaktzeit_h: muster.kontaktzeit_h,
        wir_begleiten: true,
        begleitperson_ids: [],
        koordinator_ids: [],
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

export function formatWochenspanne(wochenKey: string): string {
  const treffer = KW_REGEX.exec(wochenKey)
  if (!treffer) return wochenKey
  const [, jahrStr, wocheStr] = treffer
  const referenz = setISOWeek(setISOWeekYear(new Date(), Number(jahrStr)), Number(wocheStr))
  const montag = startOfISOWeek(referenz)
  const sonntag = endOfISOWeek(referenz)
  return `${format(montag, 'dd.MM.')}–${format(sonntag, 'dd.MM.yyyy')}`
}

export function generiereWochentlicheTermine(
  reiheId: string,
  startdatum: string,
  unterrichtszeitH: number,
  koordinationszeitH: number,
  anzahlTermine: number,
  ferien: FerienZeitraum[]
): Einheit[] {
  const einheiten: Einheit[] = []
  let cursor = parseISO(startdatum)
  let index = 0
  while (index < anzahlTermine) {
    if (!istWocheInFerien(cursor, ferien)) {
      index += 1
      einheiten.push({
        id: `${reiheId}_termin_${index}`,
        index,
        datum_oder_kw: format(cursor, 'yyyy-MM-dd'),
        kontaktzeit_h: unterrichtszeitH,
        koordinationszeit_h: koordinationszeitH,
        wir_begleiten: true,
        begleitperson_ids: [],
        koordinator_ids: [],
      })
    }
    cursor = addWeeks(cursor, 1)
  }
  return einheiten
}

function montagDerWoche(jahrStr: string, wocheStr: string): Date {
  const referenz = setISOWeek(setISOWeekYear(new Date(), Number(jahrStr)), Number(wocheStr))
  return startOfISOWeek(referenz)
}

export function zuIsoDatum(datumOderKw: string): string {
  const treffer = KW_REGEX.exec(datumOderKw)
  if (treffer) {
    const [, jahrStr, wocheStr] = treffer
    return format(montagDerWoche(jahrStr, wocheStr), 'yyyy-MM-dd')
  }
  const datum = parseISO(datumOderKw)
  if (Number.isNaN(datum.getTime())) return format(new Date(), 'yyyy-MM-dd')
  return format(datum, 'yyyy-MM-dd')
}

// A reine KW-Angabe hat keinen konkreten Wochentag — als Stellvertreter wird der Montag
// der Woche angezeigt, ergänzt um die KW-Nummer in Klammern zur Einordnung.
export function formatDatumOderKw(datumOderKw: string): string {
  const treffer = KW_REGEX.exec(datumOderKw)
  if (treffer) {
    const [, jahrStr, wocheStr] = treffer
    return `${format(montagDerWoche(jahrStr, wocheStr), 'dd.MM.yyyy')} (KW${wocheStr})`
  }
  const datum = parseISO(datumOderKw)
  if (Number.isNaN(datum.getTime())) return datumOderKw
  return `${format(datum, 'dd.MM.yyyy')} (KW${kwNummer(getISOWochenKey(datum))})`
}

// Termine werden immer chronologisch angezeigt: nach jeder Änderung, die die Reihenfolge
// beeinflussen könnte (neuer Termin, geändertes Datum), wird neu sortiert und der Index
// (1..n) entsprechend der neuen Position neu vergeben.
export function sortiereNachDatum<T extends { datum_oder_kw: string; index: number }>(termine: T[]): T[] {
  return [...termine]
    .sort((a, b) => zuIsoDatum(a.datum_oder_kw).localeCompare(zuIsoDatum(b.datum_oder_kw)))
    .map((termin, i) => ({ ...termin, index: i + 1 }))
}

export function naechstesEinheitDatum(einheiten: { datum_oder_kw: string }[]): string {
  if (einheiten.length === 0) return format(new Date(), 'yyyy-MM-dd')
  const wochenKeys = einheiten.map((e) => parseZuWochenKey(e.datum_oder_kw))
  const groesstesKey = wochenKeys.reduce((groesstes, key) => (key > groesstes ? key : groesstes))
  const [, jahrStr, wocheStr] = KW_REGEX.exec(groesstesKey)!
  const referenz = setISOWeek(setISOWeekYear(new Date(), Number(jahrStr)), Number(wocheStr))
  const montag = startOfISOWeek(referenz)
  return format(addWeeks(montag, 1), 'yyyy-MM-dd')
}
