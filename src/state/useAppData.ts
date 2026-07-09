import { useEffect, useMemo, useState } from 'react'
import seedData from '../data/data.json'
import { berechneMachbarkeit, berechneWochenuebersicht } from '../lib/berechnung'
import { berechneThemenGantt } from '../lib/themenUebersicht'
import { berechnePersonenKapazitaet } from '../lib/personenKapazitaet'
import { naechstesEinheitDatum } from '../lib/kalenderwochen'
import type { Datenbestand, Einheit, FerienZeitraum, Person, Reihe, Terminstatus } from '../lib/types'

const PFLICHTFELDER = ['settings', 'personen', 'kalender', 'schulen'] as const
const STORAGE_KEY = 'kapazitaetsrechner:data'

function pruefePflichtfelder(geparst: unknown): geparst is Datenbestand {
  const istObjekt = typeof geparst === 'object' && geparst !== null
  return istObjekt && !PFLICHTFELDER.some((feld) => !(feld in (geparst as object)))
}

function migriereDatenbestand(d: Datenbestand): Datenbestand {
  return {
    ...d,
    personen: d.personen
      .filter((person) => !person.szenario_optional)
      .map((person) => ({
        ...person,
        urlaub: person.urlaub ?? [],
      })),
    schulen: d.schulen.map((schule) => ({
      ...schule,
      reihen: schule.reihen.map((reihe) => ({
        ...reihe,
        terminstatus: reihe.terminstatus ?? ('festgelegt' as Terminstatus),
      })),
    })),
  }
}

function ladeGespeicherteDaten(): Datenbestand | null {
  try {
    const roh = localStorage.getItem(STORAGE_KEY)
    if (!roh) return null
    const geparst = JSON.parse(roh)
    if (!pruefePflichtfelder(geparst)) return null
    return migriereDatenbestand(geparst as Datenbestand)
  } catch {
    return null
  }
}

export function useAppData() {
  const [data, setData] = useState<Datenbestand>(() => ladeGespeicherteDaten() ?? migriereDatenbestand(seedData as Datenbestand))
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded, etc.) — degrade to non-persistent rather than crashing.
    }
  }, [data])

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
          einheiten: reihe.einheiten.map((e) => (e.begleitperson_id === id ? { ...e, begleitperson_id: null } : e)),
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
                  e.id === einheitId ? { ...e, wir_begleiten: wert, begleitperson_id: wert ? e.begleitperson_id : null } : e
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
            personen_parallel: 1,
            erstdurchfuehrung: false,
            wir_begleiten: true,
            typ: 'regulaer',
          }
          return { ...reihe, einheiten: [...reihe.einheiten, neueEinheit] }
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
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema' | 'koordinationszeit_h' | 'begleitperson_id'>>
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
                einheiten: reihe.einheiten.map((e) => (e.id === einheitId ? { ...e, ...patch } : e)),
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
          fahrzeit_h: prev.settings.default_fahrzeit_h,
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
    localStorage.removeItem(STORAGE_KEY)
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
    addPersonenUmverteilung,
    removePersonenUmverteilung,
    ergebnis,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  }
}
