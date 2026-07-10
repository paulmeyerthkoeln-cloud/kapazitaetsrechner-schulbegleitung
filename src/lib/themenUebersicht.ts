import { parseZuWochenKey } from './kalenderwochen'
import { addWeeks, isEqual, startOfISOWeek, setISOWeek, setISOWeekYear } from 'date-fns'
import type { Datenbestand, Einheit, Thema } from './types'
import type { WochenErgebnis } from './berechnung'

export interface ThemenGanttZeile {
  reiheId: string
  zeilenLabel: string
  balkenLabel: string
  thema: Thema
  startWochenKey: string
  endWochenKey: string
  stunden: number
}

function wochenKeyZuMontag(wochenKey: string): Date {
  const treffer = /^(\d{4})-KW(\d{2})$/.exec(wochenKey)
  if (!treffer) return new Date(NaN)
  const [, jahr, woche] = treffer
  return startOfISOWeek(setISOWeek(setISOWeekYear(new Date(), Number(jahr)), Number(woche)))
}

function sindDirektAufeinanderfolgendeWochen(a: string, b: string): boolean {
  return isEqual(addWeeks(wochenKeyZuMontag(a), 1), wochenKeyZuMontag(b))
}

function kuerzeSchulname(name: string): string {
  const bekannteNamen: Record<string, string> = {
    'Alexander-Coppel-Gesamtschule': 'Coppel',
    'Gym. Sedanstraße': 'Sedan',
    'Gym. Kothen': 'Kothen',
    'Hauptschule Hügelstraße': 'Hügelstraße',
    'Realschule Max Planck': 'Max Planck',
    'Bayreuther Gymnasium': 'Bayreuther',
    'Berufskolleg Barmen': 'Barmen',
    'Schule X (Platzhalter)': 'Schule X',
  }
  return bekannteNamen[name] ?? name.replace(/Gym\.\s*/, '').replace(/Gesamtschule|Gymnasium|Realschule|Hauptschule/g, '').trim()
}

function kuerzeReihentitel(titel: string): string {
  return titel
    .replace(/\s*\([^)]*\)/g, '')
    .split(/[,—]/)[0]
    .replace(/UNESCO-Stunde/g, 'UNESCO')
    .replace(/\bKl\.\s*\d+\b/g, '')
    .replace(/\b\d+[×x]?\s*(?!\.)/g, '')
    .trim()
}

function baueZeilenLabel(schulname: string, reihentitel: string): string {
  return `${kuerzeSchulname(schulname)} - ${kuerzeReihentitel(reihentitel)}`.slice(0, 34)
}

function sortiereEinheitenNachWoche<T extends { datum_oder_kw: string }>(einheiten: T[]): T[] {
  return [...einheiten].sort((a, b) => parseZuWochenKey(a.datum_oder_kw).localeCompare(parseZuWochenKey(b.datum_oder_kw)))
}

export function berechneThemenGantt(data: Datenbestand): ThemenGanttZeile[] {
  const zeilen: ThemenGanttZeile[] = []
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      if (reihe.terminstatus === 'offen') continue
      const themenEinheiten = sortiereEinheitenNachWoche(reihe.einheiten.filter((e) => e.thema))
      if (themenEinheiten.length === 0) continue

      let aktuelleGruppe: { thema: Thema; startWochenKey: string; endWochenKey: string; stunden: number } | null = null
      for (const einheit of themenEinheiten) {
        const thema = einheit.thema!
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        if (
          aktuelleGruppe &&
          aktuelleGruppe.thema === thema &&
          (aktuelleGruppe.endWochenKey === wochenKey || sindDirektAufeinanderfolgendeWochen(aktuelleGruppe.endWochenKey, wochenKey))
        ) {
          aktuelleGruppe.endWochenKey = wochenKey
          aktuelleGruppe.stunden += einheit.kontaktzeit_h
          continue
        }
        if (aktuelleGruppe) {
          zeilen.push({
            reiheId: reihe.id,
            zeilenLabel: baueZeilenLabel(schule.name, reihe.titel),
            balkenLabel: aktuelleGruppe.thema,
            thema: aktuelleGruppe.thema,
            startWochenKey: aktuelleGruppe.startWochenKey,
            endWochenKey: aktuelleGruppe.endWochenKey,
            stunden: aktuelleGruppe.stunden,
          })
        }
        aktuelleGruppe = { thema, startWochenKey: wochenKey, endWochenKey: wochenKey, stunden: einheit.kontaktzeit_h }
      }

      if (aktuelleGruppe) {
        zeilen.push({
          reiheId: reihe.id,
          zeilenLabel: baueZeilenLabel(schule.name, reihe.titel),
          balkenLabel: aktuelleGruppe.thema,
          thema: aktuelleGruppe.thema,
          startWochenKey: aktuelleGruppe.startWochenKey,
          endWochenKey: aktuelleGruppe.endWochenKey,
          stunden: aktuelleGruppe.stunden,
        })
      }
    }
  }

  for (const veranstaltung of data.veranstaltungen) {
    if (veranstaltung.terminstatus === 'offen') continue
    const themenTermine = sortiereEinheitenNachWoche(veranstaltung.termine.filter((t) => !!t.thema))
    if (themenTermine.length === 0) continue

    const zeilenLabel = `${veranstaltung.titel} (${veranstaltung.schulIds.map((id) => kuerzeSchulname(data.schulen.find((s) => s.id === id)?.name ?? id)).join(', ')})`

    let aktuelleGruppe: { thema: Thema; startWochenKey: string; endWochenKey: string; stunden: number } | null = null
    for (const termin of themenTermine) {
      const thema = termin.thema!
      const wochenKey = parseZuWochenKey(termin.datum_oder_kw)
      if (
        aktuelleGruppe &&
        aktuelleGruppe.thema === thema &&
        (aktuelleGruppe.endWochenKey === wochenKey || sindDirektAufeinanderfolgendeWochen(aktuelleGruppe.endWochenKey, wochenKey))
      ) {
        aktuelleGruppe.endWochenKey = wochenKey
        aktuelleGruppe.stunden += termin.kontaktzeit_h
        continue
      }
      if (aktuelleGruppe) {
        zeilen.push({
          reiheId: veranstaltung.id,
          zeilenLabel,
          balkenLabel: aktuelleGruppe.thema,
          thema: aktuelleGruppe.thema,
          startWochenKey: aktuelleGruppe.startWochenKey,
          endWochenKey: aktuelleGruppe.endWochenKey,
          stunden: aktuelleGruppe.stunden,
        })
      }
      aktuelleGruppe = { thema, startWochenKey: wochenKey, endWochenKey: wochenKey, stunden: termin.kontaktzeit_h }
    }
    if (aktuelleGruppe) {
      zeilen.push({
        reiheId: veranstaltung.id,
        zeilenLabel,
        balkenLabel: aktuelleGruppe.thema,
        thema: aktuelleGruppe.thema,
        startWochenKey: aktuelleGruppe.startWochenKey,
        endWochenKey: aktuelleGruppe.endWochenKey,
        stunden: aktuelleGruppe.stunden,
      })
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
