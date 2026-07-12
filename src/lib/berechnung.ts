import { eachDayOfInterval, isWeekend, endOfISOWeek, parseISO } from 'date-fns'
import {
  parseZuWochenKey,
  alleWochenImZeitraum,
  istWocheInFerien,
  getISOWochenKey,
  ermittleFerienName,
} from './kalenderwochen'
import type { Settings, Datenbestand, Person } from './types'

export function berechneAufwandEinheit(
  kontaktzeit_h: number,
  fahrzeit_h: number,
  erstdurchfuehrung: boolean,
  settings: Settings,
  organisationspauschale_h = 0
): number {
  const vorbereitungsfaktor = erstdurchfuehrung
    ? settings.default_vorbereitungsfaktor_erstdurchfuehrung
    : settings.default_vorbereitungsfaktor_wiederholung
  const vorbereitung = kontaktzeit_h * vorbereitungsfaktor
  return kontaktzeit_h + vorbereitung + fahrzeit_h + organisationspauschale_h
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
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        const koordAnzahl = Math.max(1, einheit.koordinator_ids.length)
        koordinationBedarf += (einheit.koordinationszeit_h ?? 0) * koordAnzahl
        if (einheit.wir_begleiten) {
          const begleitAnzahl = Math.max(1, einheit.begleitperson_ids.length)
          const aufwand = berechneAufwandEinheit(einheit.kontaktzeit_h, reihe.fahrzeit_h, einheit.erstdurchfuehrung, data.settings)
          einsatzBedarf += aufwand * begleitAnzahl
        }
      }
    }
  }

  for (const veranstaltung of data.veranstaltungen) {
    if (veranstaltung.terminstatus === 'offen') continue
    for (const termin of veranstaltung.termine) {
      if (parseZuWochenKey(termin.datum_oder_kw) !== wochenKey) continue
      // Vorbereitung and (for Exkursionen) the Organisationspauschale are organizational
      // overhead shared once across the whole Veranstaltung, regardless of how many
      // schools/people attend — this is the entire point of a Themenwoche.
      const vorbereitungsfaktor = termin.erstdurchfuehrung
        ? data.settings.default_vorbereitungsfaktor_erstdurchfuehrung
        : data.settings.default_vorbereitungsfaktor_wiederholung
      const pauschale = veranstaltung.art === 'exkursion' ? termin.organisationspauschale_h ?? 2 : 0
      // Only charge the shared organizational overhead if at least one participating
      // Schule actually accompanies this Termin — matching the Reihen-Einheit rule
      // just above (wir_begleiten gates the whole Aufwand, not only the per-Schule part).
      if (termin.besetzungen.some((b) => b.wir_begleiten)) {
        einsatzBedarf += termin.kontaktzeit_h * vorbereitungsfaktor + pauschale
      }
      for (const besetzung of termin.besetzungen) {
        const koordAnzahl = Math.max(1, besetzung.koordinator_ids.length)
        koordinationBedarf += besetzung.koordinationszeit_h * koordAnzahl
        if (besetzung.wir_begleiten) {
          const begleitAnzahl = Math.max(1, besetzung.begleitperson_ids.length)
          einsatzBedarf += (termin.kontaktzeit_h + besetzung.fahrzeit_h) * begleitAnzahl
        }
      }
    }
  }

  return { einsatzBedarf, koordinationBedarf }
}

export function berechnePersonKapazitaetsbasis(person: Person, wochenStartMontag: Date): number {
  const wochenEnde = endOfISOWeek(wochenStartMontag)
  const aktivAb = parseISO(person.aktiv_ab)
  const aktivBis = parseISO(person.aktiv_bis)
  if (wochenEnde < aktivAb || wochenStartMontag > aktivBis) return 0

  const wochentage = eachDayOfInterval({ start: wochenStartMontag, end: wochenEnde }).filter((d) => !isWeekend(d))
  const abwesendeTage = wochentage.filter((tag) =>
    person.abwesenheiten.some((a) => tag >= parseISO(a.von) && tag <= parseISO(a.bis)) ||
    person.urlaub.some((f) => tag >= parseISO(f.von) && tag <= parseISO(f.bis))
  ).length
  const abzugsfaktor = Math.min(1, abwesendeTage * 0.2)
  return person.stunden_pro_woche_fuer_begleitung * (1 - abzugsfaktor)
}

export function berechneAngebotProWoche(personen: Person[], wochenStartMontag: Date): number {
  return personen.reduce((summe, person) => summe + berechnePersonKapazitaetsbasis(person, wochenStartMontag), 0)
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
  ferienName: string | null
}

export function berechneWochenuebersicht(data: Datenbestand): WochenErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  return wochenStarts.map((montag) => {
    const wochenKey = getISOWochenKey(montag)
    const istFerien = istWocheInFerien(montag, data.kalender.ferien)
    const ferienName = ermittleFerienName(montag, data.kalender.ferien)
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
      ferienName,
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
