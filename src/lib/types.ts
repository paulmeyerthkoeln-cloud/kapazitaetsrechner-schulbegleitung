export interface Settings {
  planungszeitraum: { start: string; ende: string }
  schwellwert_warnung: number
  schwellwert_kritisch: number
  default_fahrzeit_h: number
  default_vorbereitungsfaktor_erstdurchfuehrung: number
  default_vorbereitungsfaktor_wiederholung: number
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
  urlaub: FerienZeitraum[]
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

export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'

export interface Einheit {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  erstdurchfuehrung: boolean
  wir_begleiten: boolean
  thema?: Thema
  koordinationszeit_h?: number
  begleitperson_ids: string[]
  koordinator_ids: string[]
}

export interface Muster {
  typ: 'woechentlich'
  von: string
  bis?: string
  anzahl_termine?: number
  kontaktzeit_h: number
}

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
  sperrzeiten?: Sperrzeit[]
}

export interface Schule {
  id: string
  name: string
  reihen: Reihe[]
}

export type VeranstaltungArt = 'themenwoche' | 'exkursion'

export interface SchulBesetzung {
  schulId: string
  wir_begleiten: boolean
  begleitperson_ids: string[]
  koordinator_ids: string[]
  koordinationszeit_h: number
  fahrzeit_h: number
}

export interface VeranstaltungTermin {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  erstdurchfuehrung: boolean
  thema?: Thema
  organisationspauschale_h?: number
  besetzungen: SchulBesetzung[]
}

export interface Veranstaltung {
  id: string
  art: VeranstaltungArt
  titel: string
  terminstatus: Terminstatus
  schulIds: string[]
  termine: VeranstaltungTermin[]
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
  veranstaltungen: Veranstaltung[]
  personenUmverteilungen?: PersonenUmverteilung[]
}
