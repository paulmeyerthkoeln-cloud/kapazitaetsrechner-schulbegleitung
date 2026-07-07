export interface Settings {
  planungszeitraum: { start: string; ende: string }
  schwellwert_warnung: number
  schwellwert_kritisch: number
  default_fahrzeit_h: number
  default_vorbereitungsfaktor_erstdurchfuehrung: number
  default_vorbereitungsfaktor_wiederholung: number
  koordination_h_pro_schule_pro_monat: number
}

export interface Abwesenheit {
  von: string
  bis: string
  grund: string
}

export interface Person {
  id: string
  name: string
  stunden_pro_woche_fuer_begleitung: number
  aktiv_ab: string
  aktiv_bis: string
  abwesenheiten: Abwesenheit[]
  szenario_optional?: boolean
}

export interface FerienZeitraum {
  name: string
  von: string
  bis: string
}

export interface Sperrzeit {
  name: string
  von: string
  bis: string
}

export interface Kalender {
  ferien: FerienZeitraum[]
}

export type EinheitTyp = 'regulaer' | 'exkursion'

export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie' | 'Exkursion'

export interface Einheit {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  personen_parallel: number
  erstdurchfuehrung: boolean
  wir_begleiten: boolean
  typ: EinheitTyp
  organisationspauschale_h?: number
  thema?: Thema
  koordinationszeit_h?: number
  begleitperson_id?: string | null
}

export interface Muster {
  typ: 'woechentlich'
  von: string
  bis?: string
  anzahl_termine?: number
  kontaktzeit_h: number
}

export type BesetzungsPreset =
  | { typ: 'alle' }
  | { typ: 'keine' }
  | { typ: 'erste_n'; n: number }
  | { typ: 'letzte_n'; n: number }
  | { typ: 'erste_und_letzte' }
  | { typ: 'jede_n_te'; n: number }
  | { typ: 'manuell' }

export type Betreuungsmodell = 'A' | 'B' | 'C' | 'X'

export type Terminstatus = 'festgelegt' | 'teilweise_festgelegt' | 'offen'

export interface Reihe {
  id: string
  titel: string
  betreuungsmodell: Betreuungsmodell
  fahrzeit_h: number
  status: string
  extern_betreut: boolean
  terminstatus: Terminstatus
  einheiten: Einheit[]
  muster?: Muster
  besetzung?: BesetzungsPreset
  sperrzeiten?: Sperrzeit[]
}

export interface Schule {
  id: string
  name: string
  koordination_h_pro_monat?: number
  reihen: Reihe[]
}

export interface Umverteilung {
  id: string
  quelleWochenKey: string
  ferienName: string
  zielWochenKey: string
  zusatzStunden: number
}

export interface PersonenUmverteilung {
  id: string
  personId: string
  quelleWochenKey: string
  zielWochenKey: string
  stunden: number
}

export interface Datenbestand {
  settings: Settings
  personen: Person[]
  kalender: Kalender
  schulen: Schule[]
  umverteilungen?: Umverteilung[]
  personenUmverteilungen?: PersonenUmverteilung[]
}
