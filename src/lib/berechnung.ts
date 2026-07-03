import { eachDayOfInterval, isWeekend, endOfISOWeek, parseISO } from 'date-fns'
import { parseZuWochenKey } from './kalenderwochen'
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

export function berechneBedarfProWoche(data: Datenbestand, wochenKey: string, istFerien: boolean): number {
  if (istFerien) return 0

  let bedarf = 0
  for (const schule of data.schulen) {
    const hatReihenMitEinheiten = schule.reihen.some((r) => r.einheiten.length > 0)
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        if (einheit.wir_begleiten) {
          bedarf += berechneAufwandEinheit(einheit, reihe.fahrzeit_h, data.settings)
        }
      }
    }
    if (hatReihenMitEinheiten) {
      bedarf += berechneKoordinationWoche(schule, data.settings)
    }
  }
  return bedarf
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
