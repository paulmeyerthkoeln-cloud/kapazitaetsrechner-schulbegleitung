import type { Einheit, Settings, Schule } from './types'

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
