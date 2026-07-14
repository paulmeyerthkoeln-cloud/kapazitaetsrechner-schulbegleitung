import { useEffect, useMemo, useState } from 'react'
import seedData from '../data/data.json'
import { supabase } from '../lib/supabaseClient'
import { berechneMachbarkeit, berechneWochenuebersicht } from '../lib/berechnung'
import { berechneThemenGantt } from '../lib/themenUebersicht'
import { berechnePersonenKapazitaet } from '../lib/personenKapazitaet'
import { naechstesEinheitDatum, sortiereNachDatum, bereinigeFerien } from '../lib/kalenderwochen'
import type {
  Datenbestand,
  Einheit,
  FerienZeitraum,
  Person,
  Reihe,
  SchulBesetzung,
  Terminstatus,
  Veranstaltung,
  VeranstaltungArt,
  VeranstaltungTermin,
} from '../lib/types'

const PFLICHTFELDER = ['settings', 'personen', 'kalender', 'schulen'] as const
const STORAGE_KEY = 'kapazitaetsrechner:data'
const DATENBESTAND_ROW_ID = 1

const LEERER_DATENBESTAND: Datenbestand = {
  settings: {
    planungszeitraum: { start: '', ende: '' },
    schwellwert_warnung: 0,
    schwellwert_kritisch: 0,
  },
  personen: [],
  kalender: { ferien: [] },
  schulen: [],
  veranstaltungen: [],
}

function pruefePflichtfelder(geparst: unknown): geparst is Datenbestand {
  const istObjekt = typeof geparst === 'object' && geparst !== null
  return istObjekt && !PFLICHTFELDER.some((feld) => !(feld in (geparst as object)))
}

interface LegacyEinheit {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  wir_begleiten: boolean
  thema?: Einheit['thema']
  koordinationszeit_h?: number
  begleitperson_id?: string | null
  begleitperson_ids?: string[]
  koordinator_ids?: string[]
  typ?: 'regulaer' | 'exkursion'
}

function migriereEinheit(roh: LegacyEinheit): Einheit {
  return {
    id: roh.id,
    index: roh.index,
    datum_oder_kw: roh.datum_oder_kw,
    kontaktzeit_h: roh.kontaktzeit_h,
    wir_begleiten: roh.wir_begleiten,
    thema: roh.thema,
    koordinationszeit_h: roh.koordinationszeit_h,
    begleitperson_ids: roh.begleitperson_ids ?? (roh.begleitperson_id ? [roh.begleitperson_id] : []),
    koordinator_ids: roh.koordinator_ids ?? [],
  }
}

function migriereDatenbestand(d: Datenbestand): Datenbestand {
  const rohSchulen = d.schulen as unknown as Array<{
    id: string
    name: string
    reihen: Array<Reihe & { einheiten: LegacyEinheit[] }>
  }>
  const exkursionsVeranstaltungen: Veranstaltung[] = []

  const schulen = rohSchulen.map((schule) => ({
    id: schule.id,
    name: schule.name,
    reihen: schule.reihen.map((reihe) => {
      const terminstatus = reihe.terminstatus ?? ('festgelegt' as Terminstatus)
      const regulaereRoh: LegacyEinheit[] = []
      for (const roh of reihe.einheiten) {
        if (roh.typ !== 'exkursion') {
          regulaereRoh.push(roh)
          continue
        }
        exkursionsVeranstaltungen.push({
          id: `veranstaltung_${roh.id}`,
          art: 'exkursion',
          titel: `${reihe.titel} – Exkursion`,
          terminstatus,
          schulIds: [schule.id],
          termine: [
            {
              id: `${roh.id}_termin`,
              index: 1,
              datum_oder_kw: roh.datum_oder_kw,
              kontaktzeit_h: roh.kontaktzeit_h,
              thema: roh.thema,
              besetzungen: [
                {
                  schulId: schule.id,
                  wir_begleiten: roh.wir_begleiten,
                  begleitperson_ids: roh.begleitperson_ids ?? (roh.begleitperson_id ? [roh.begleitperson_id] : []),
                  koordinator_ids: roh.koordinator_ids ?? [],
                  koordinationszeit_h: roh.koordinationszeit_h ?? 0,
                },
              ],
            },
          ],
        })
      }
      return {
        ...reihe,
        terminstatus,
        einheiten: regulaereRoh.map(migriereEinheit).map((e, i) => ({ ...e, index: i + 1 })),
      }
    }),
  }))

  return {
    ...d,
    personen: d.personen
      .filter((person) => !person.szenario_optional)
      .map((person) => ({
        ...person,
        urlaub: person.urlaub ?? [],
      })),
    kalender: { ...d.kalender, ferien: bereinigeFerien(d.kalender.ferien) },
    schulen,
    veranstaltungen: [...(d.veranstaltungen ?? []), ...exkursionsVeranstaltungen],
  }
}

export type LadePhase = 'laedt' | 'fehler' | 'bereit'

export function useAppData() {
  const [data, setData] = useState<Datenbestand>(LEERER_DATENBESTAND)
  const [ladePhase, setLadePhase] = useState<LadePhase>('laedt')
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      const { data: zeile, error } = await supabase
        .from('datenbestand')
        .select('data')
        .eq('id', DATENBESTAND_ROW_ID)
        .single()
      if (abgebrochen) return
      if (error || !zeile || !pruefePflichtfelder(zeile.data)) {
        setLadeFehler(error?.message ?? 'Datenbestand aus Supabase ist unvollständig oder beschädigt.')
        setLadePhase('fehler')
        return
      }
      setData(migriereDatenbestand(zeile.data))
      setLadePhase('bereit')
    }
    laden()
    return () => {
      abgebrochen = true
    }
  }, [])

  useEffect(() => {
    if (ladePhase !== 'bereit') return
    async function speichern() {
      const { error } = await supabase
        .from('datenbestand')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', DATENBESTAND_ROW_ID)
      setSpeicherFehler(error?.message ?? null)
      // Write the Notanker snapshot regardless of whether the Supabase save succeeded —
      // it exists specifically to protect the latest edit if the network drops mid-save.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        // localStorage may be unavailable (private browsing, quota exceeded, etc.) — degrade to non-persistent rather than crashing.
      }
    }
    speichern()
  }, [data, ladePhase])

  function setPerson(id: string, patch: Partial<Person>) {
    setData((prev) => ({
      ...prev,
      personen: prev.personen.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }))
  }

  function setPersonUrlaub(personId: string, urlaub: FerienZeitraum[]) {
    setData((prev) => ({
      ...prev,
      personen: prev.personen.map((p) => (p.id === personId ? { ...p, urlaub } : p)),
    }))
  }

  function addPerson() {
    setData((prev) => {
      const jetzt = Date.now()
      const neuePerson: Person = {
        id: `person_${jetzt}`,
        name: `Person ${prev.personen.length + 1}`,
        stunden_pro_woche_fuer_begleitung: 8,
        aktiv_ab: prev.settings.planungszeitraum.start,
        aktiv_bis: prev.settings.planungszeitraum.ende,
        abwesenheiten: [],
        urlaub: [],
      }
      return { ...prev, personen: [...prev.personen, neuePerson] }
    })
  }

  function removePerson(id: string) {
    setData((prev) => ({
      ...prev,
      personen: prev.personen.filter((p) => p.id !== id),
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => ({
          ...reihe,
          einheiten: reihe.einheiten.map((e) => ({
            ...e,
            begleitperson_ids: e.begleitperson_ids.filter((pid) => pid !== id),
            koordinator_ids: e.koordinator_ids.filter((pid) => pid !== id),
          })),
        })),
      })),
      veranstaltungen: prev.veranstaltungen.map((v) => ({
        ...v,
        termine: v.termine.map((t) => ({
          ...t,
          besetzungen: t.besetzungen.map((b) => ({
            ...b,
            begleitperson_ids: b.begleitperson_ids.filter((pid) => pid !== id),
            koordinator_ids: b.koordinator_ids.filter((pid) => pid !== id),
          })),
        })),
      })),
      personenUmverteilungen: (prev.personenUmverteilungen ?? []).filter((u) => u.personId !== id),
    }))
  }

  function setEinheitBegleitung(reiheId: string, einheitId: string, wert: boolean) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) =>
          reihe.id !== reiheId
            ? reihe
            : {
                ...reihe,
                einheiten: reihe.einheiten.map((e) =>
                  e.id === einheitId ? { ...e, wir_begleiten: wert, begleitperson_ids: wert ? e.begleitperson_ids : [] } : e
                ),
              }
        ),
      })),
    }))
  }

  function addEinheit(reiheId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => {
          if (reihe.id !== reiheId) return reihe
          const neueEinheit: Einheit = {
            id: `${reihe.id}_neu_${Date.now()}`,
            index: reihe.einheiten.length + 1,
            datum_oder_kw: naechstesEinheitDatum(reihe.einheiten),
            kontaktzeit_h: 1.5,
            koordinationszeit_h: 0,
            wir_begleiten: true,
            begleitperson_ids: [],
            koordinator_ids: [],
          }
          return { ...reihe, einheiten: sortiereNachDatum([...reihe.einheiten, neueEinheit]) }
        }),
      })),
    }))
  }

  function removeEinheit(reiheId: string, einheitId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => {
          if (reihe.id !== reiheId) return reihe
          const verbleibend = reihe.einheiten.filter((e) => e.id !== einheitId)
          return { ...reihe, einheiten: verbleibend.map((e, i) => ({ ...e, index: i + 1 })) }
        }),
      })),
    }))
  }

  function setEinheitFelder(
    reiheId: string,
    einheitId: string,
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema' | 'koordinationszeit_h' | 'begleitperson_ids' | 'koordinator_ids'>>
  ) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) =>
          reihe.id !== reiheId
            ? reihe
            : {
                ...reihe,
                einheiten: sortiereNachDatum(reihe.einheiten.map((e) => (e.id === einheitId ? { ...e, ...patch } : e))),
              }
        ),
      })),
    }))
  }

  function addReihe(schuleId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => {
        if (schule.id !== schuleId) return schule
        const neueReihe: Reihe = {
          id: `reihe_${Date.now()}`,
          titel: 'Neuer Kurs',
          betreuungsmodell: 'A',
          status: '',
          extern_betreut: false,
          terminstatus: 'offen',
          einheiten: [],
        }
        return { ...schule, reihen: [...schule.reihen, neueReihe] }
      }),
    }))
  }

  function removeReihe(schuleId: string, reiheId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) =>
        schule.id !== schuleId ? schule : { ...schule, reihen: schule.reihen.filter((r) => r.id !== reiheId) }
      ),
    }))
  }

  function setReiheTitel(reiheId: string, titel: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => (reihe.id === reiheId ? { ...reihe, titel } : reihe)),
      })),
    }))
  }

  function setReiheTerminstatus(reiheId: string, terminstatus: Terminstatus) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => (reihe.id === reiheId ? { ...reihe, terminstatus } : reihe)),
      })),
    }))
  }

  function setReiheEinheiten(reiheId: string, einheiten: Einheit[]) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => (reihe.id === reiheId ? { ...reihe, einheiten } : reihe)),
      })),
    }))
  }

  function leereBesetzung(schulId: string): SchulBesetzung {
    return { schulId, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [], koordinationszeit_h: 0 }
  }

  function addVeranstaltung(art: VeranstaltungArt, schulIds: string[]) {
    setData((prev) => {
      const neueVeranstaltung: Veranstaltung = {
        id: `veranstaltung_${Date.now()}`,
        art,
        titel: art === 'themenwoche' ? 'Neue Themenwoche' : 'Neue Exkursion',
        terminstatus: 'offen',
        schulIds,
        termine: [],
      }
      return { ...prev, veranstaltungen: [...prev.veranstaltungen, neueVeranstaltung] }
    })
  }

  function removeVeranstaltung(veranstaltungId: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.filter((v) => v.id !== veranstaltungId),
    }))
  }

  function setVeranstaltungTitel(veranstaltungId: string, titel: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => (v.id === veranstaltungId ? { ...v, titel } : v)),
    }))
  }

  function setVeranstaltungTerminstatus(veranstaltungId: string, terminstatus: Terminstatus) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => (v.id === veranstaltungId ? { ...v, terminstatus } : v)),
    }))
  }

  function setVeranstaltungSchulen(veranstaltungId: string, schulIds: string[]) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => {
        if (v.id !== veranstaltungId) return v
        return {
          ...v,
          schulIds,
          termine: v.termine.map((termin) => ({
            ...termin,
            besetzungen: schulIds.map((schulId) => termin.besetzungen.find((b) => b.schulId === schulId) ?? leereBesetzung(schulId)),
          })),
        }
      }),
    }))
  }

  function addVeranstaltungTermin(veranstaltungId: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => {
        if (v.id !== veranstaltungId) return v
        const neuerTermin: VeranstaltungTermin = {
          id: `${v.id}_termin_${Date.now()}`,
          index: v.termine.length + 1,
          datum_oder_kw: naechstesEinheitDatum(v.termine),
          kontaktzeit_h: 1.5,
          besetzungen: v.schulIds.map((schulId) => leereBesetzung(schulId)),
        }
        return { ...v, termine: sortiereNachDatum([...v.termine, neuerTermin]) }
      }),
    }))
  }

  function removeVeranstaltungTermin(veranstaltungId: string, terminId: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => {
        if (v.id !== veranstaltungId) return v
        const verbleibend = v.termine.filter((t) => t.id !== terminId)
        return { ...v, termine: verbleibend.map((t, i) => ({ ...t, index: i + 1 })) }
      }),
    }))
  }

  function setVeranstaltungTerminFelder(
    veranstaltungId: string,
    terminId: string,
    patch: Partial<Pick<VeranstaltungTermin, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema'>>
  ) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) =>
        v.id !== veranstaltungId
          ? v
          : { ...v, termine: sortiereNachDatum(v.termine.map((t) => (t.id === terminId ? { ...t, ...patch } : t))) }
      ),
    }))
  }

  function setSchulBesetzungFelder(
    veranstaltungId: string,
    terminId: string,
    schulId: string,
    patch: Partial<Pick<SchulBesetzung, 'wir_begleiten' | 'begleitperson_ids' | 'koordinator_ids' | 'koordinationszeit_h'>>
  ) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) =>
        v.id !== veranstaltungId
          ? v
          : {
              ...v,
              termine: v.termine.map((t) =>
                t.id !== terminId
                  ? t
                  : { ...t, besetzungen: t.besetzungen.map((b) => (b.schulId === schulId ? { ...b, ...patch } : b)) }
              ),
            }
      ),
    }))
  }

  function addPersonenUmverteilung(personId: string, quelleWochenKey: string, zielWochenKey: string, stunden: number) {
    setData((prev) => ({
      ...prev,
      personenUmverteilungen: [
        ...(prev.personenUmverteilungen ?? []),
        { id: `personen_umverteilung_${Date.now()}`, personId, quelleWochenKey, zielWochenKey, stunden },
      ],
    }))
  }

  function removePersonenUmverteilung(id: string) {
    setData((prev) => ({
      ...prev,
      personenUmverteilungen: (prev.personenUmverteilungen ?? []).filter((u) => u.id !== id),
    }))
  }

  function exportJson(): string {
    return JSON.stringify(data, null, 2)
  }

  function importJson(json: string) {
    try {
      const geparst = JSON.parse(json)
      if (!pruefePflichtfelder(geparst)) {
        throw new Error(`JSON fehlt eines der Pflichtfelder: ${PFLICHTFELDER.join(', ')}`)
      }
      setData(migriereDatenbestand(geparst as Datenbestand))
      setImportError(null)
    } catch (fehler) {
      setImportError(fehler instanceof Error ? fehler.message : 'Import fehlgeschlagen: ungültiges JSON')
    }
  }

  function zuruecksetzen() {
    setData(migriereDatenbestand(seedData as Datenbestand))
  }

  const ergebnis = useMemo(() => {
    const wochen = berechneWochenuebersicht(data)
    return { wochen, machbarkeit: berechneMachbarkeit(wochen) }
  }, [data])
  const themenGanttZeilen = useMemo(() => berechneThemenGantt(data), [data])
  const personenKapazitaet = useMemo(() => berechnePersonenKapazitaet(data), [data])

  return {
    data,
    ladePhase,
    ladeFehler,
    speicherFehler,
    themenGanttZeilen,
    personenKapazitaet,
    setPerson,
    setPersonUrlaub,
    addPerson,
    removePerson,
    setEinheitBegleitung,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addReihe,
    removeReihe,
    setReiheTitel,
    setReiheTerminstatus,
    setReiheEinheiten,
    addVeranstaltung,
    removeVeranstaltung,
    setVeranstaltungTitel,
    setVeranstaltungTerminstatus,
    setVeranstaltungSchulen,
    addVeranstaltungTermin,
    removeVeranstaltungTermin,
    setVeranstaltungTerminFelder,
    setSchulBesetzungFelder,
    addPersonenUmverteilung,
    removePersonenUmverteilung,
    ergebnis,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  }
}
