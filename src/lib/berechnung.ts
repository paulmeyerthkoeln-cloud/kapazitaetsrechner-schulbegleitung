import { eachDayOfInterval, isWeekend, endOfISOWeek, parseISO } from 'date-fns'
import { parseZuWochenKey, alleWochenImZeitraum, istWocheInFerien, getISOWochenKey, berechneReiheZeitraum } from './kalenderwochen'
import type { Einheit, Settings, Schule, Datenbestand, Person } from './types'

export function berechneAufwandEinheit(einheit: Einheit, fahrzeit_h: number, settings: Settings): number {
  const vorbereitungsfaktor = einheit.erstdurchfuehrung
    ? settings.default_vorbereitungsfaktor_erstdurchfuehrung
    : settings.default_vorbereitungsfaktor_wiederholung
  const pauschale = einheit.typ === 'exkursion' ? einheit.organisationspauschale_h ?? 2 : 0
  const basis = einheit.kontaktzeit_h + einheit.kontaktzeit_h * vorbereitungsfaktor + fahrzeit_h + pauschale
  return basis * einheit.personen_parallel
}

export function berechneKoordinationWoche(schule: Schule, settings: Settings): number {
  const proMonat = schule.koordination_h_pro_monat ?? settings.koordination_h_pro_schule_pro_monat
  return proMonat / 4.33
}

export function berechneBedarfProWoche(
  data: Datenbestand,
  wochenKey: string,
  istFerien: boolean
): { einsatzBedarf: number; koordinationBedarf: number } {
  if (istFerien) return { einsatzBedarf: 0, koordinationBedarf: 0 }

  let einsatzBedarf = 0
  let koordinationBedarf = 0
  for (const schule of data.schulen) {
    const istSchuleAktiv = schule.reihen.some((reihe) => {
      const zeitraum = berechneReiheZeitraum(reihe)
      return zeitraum !== null && zeitraum.von <= wochenKey && wochenKey <= zeitraum.bis
    })
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        if (einheit.wir_begleiten) {
          einsatzBedarf += berechneAufwandEinheit(einheit, reihe.fahrzeit_h, data.settings)
        }
      }
    }
    if (istSchuleAktiv) {
      koordinationBedarf += berechneKoordinationWoche(schule, data.settings)
    }
  }
  return { einsatzBedarf, koordinationBedarf }
}

export function berechneAngebotProWoche(personen: Person[], wochenStartMontag: Date): number {
  const wochenEnde = endOfISOWeek(wochenStartMontag)
  let angebot = 0
  for (const person of personen) {
    const aktivAb = parseISO(person.aktiv_ab)
    const aktivBis = parseISO(person.aktiv_bis)
    if (wochenEnde < aktivAb || wochenStartMontag > aktivBis) continue

    const wochentage = eachDayOfInterval({ start: wochenStartMontag, end: wochenEnde }).filter((d) => !isWeekend(d))
    const abwesendeTage = wochentage.filter((tag) =>
      person.abwesenheiten.some((a) => tag >= parseISO(a.von) && tag <= parseISO(a.bis))
    ).length
    const abzugsfaktor = Math.min(1, abwesendeTage * 0.2)
    angebot += person.stunden_pro_woche_fuer_begleitung * (1 - abzugsfaktor)
  }
  return angebot
}

export type AmpelFarbe = 'gruen' | 'gelb' | 'rot'

export function ampelFarbe(auslastung: number, settings: Settings): AmpelFarbe {
  if (auslastung > settings.schwellwert_kritisch) return 'rot'
  if (auslastung >= settings.schwellwert_warnung) return 'gelb'
  return 'gruen'
}

export interface WochenErgebnis {
  wochenKey: string
  bedarf: number
  einsatzBedarf: number
  koordinationBedarf: number
  angebot: number
  auslastung: number
  ampel: AmpelFarbe
  istFerien: boolean
}

export function berechneWochenuebersicht(data: Datenbestand): WochenErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  return wochenStarts.map((montag) => {
    const wochenKey = getISOWochenKey(montag)
    const istFerien = istWocheInFerien(montag, data.kalender.ferien)
    const { einsatzBedarf, koordinationBedarf } = berechneBedarfProWoche(data, wochenKey, istFerien)
    const bedarf = einsatzBedarf + koordinationBedarf
    const angebot = berechneAngebotProWoche(data.personen, montag)
    const auslastung = angebot === 0 ? 0 : bedarf / angebot
    return {
      wochenKey,
      bedarf,
      einsatzBedarf,
      koordinationBedarf,
      angebot,
      auslastung,
      ampel: ampelFarbe(auslastung, data.settings),
      istFerien,
    }
  })
}

export interface Machbarkeitsergebnis {
  machbar: boolean
  anzahlGelbeWochen: number
  topEngpaesse: WochenErgebnis[]
}

export function berechneMachbarkeit(wochen: WochenErgebnis[]): Machbarkeitsergebnis {
  const machbar = !wochen.some((w) => w.ampel === 'rot')
  const anzahlGelbeWochen = wochen.filter((w) => w.ampel === 'gelb').length
  const topEngpaesse = [...wochen].sort((a, b) => b.auslastung - a.auslastung).slice(0, 5)
  return { machbar, anzahlGelbeWochen, topEngpaesse }
}
