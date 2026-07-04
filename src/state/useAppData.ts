import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person } from '../lib/types'

const PFLICHTFELDER = ['settings', 'personen', 'kalender', 'schulen'] as const

export function useAppData() {
  const [data, setData] = useState<Datenbestand>(seedData as Datenbestand)
  const [szenario, setSzenario] = useState<SzenarioTyp>('ziel')
  const [sensitivitaet, setSensitivitaet] = useState<SensitivitaetsParameter>({})
  const [importError, setImportError] = useState<string | null>(null)

  function setPerson(id: string, patch: Partial<Person>) {
    setData((prev) => ({
      ...prev,
      personen: prev.personen.map((p) => (p.id === id ? { ...p, ...patch } : p)),
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
                einheiten: reihe.einheiten.map((e) => (e.id === einheitId ? { ...e, wir_begleiten: wert } : e)),
              }
        ),
      })),
    }))
  }

  function setSchuleKoordination(schuleId: string, wert: number) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => (schule.id === schuleId ? { ...schule, koordination_h_pro_monat: wert } : schule)),
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
            datum_oder_kw: format(new Date(), 'yyyy-MM-dd'),
            kontaktzeit_h: 1.5,
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
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h'>>
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

  function addUmverteilung(ferienName: string, zielWochenKey: string, zusatzStunden: number) {
    setData((prev) => ({
      ...prev,
      umverteilungen: [
        ...(prev.umverteilungen ?? []),
        { id: `umverteilung_${Date.now()}`, ferienName, zielWochenKey, zusatzStunden },
      ],
    }))
  }

  function removeUmverteilung(id: string) {
    setData((prev) => ({
      ...prev,
      umverteilungen: (prev.umverteilungen ?? []).filter((u) => u.id !== id),
    }))
  }

  function exportJson(): string {
    return JSON.stringify(data, null, 2)
  }

  function importJson(json: string) {
    try {
      const geparst = JSON.parse(json)
      const istObjekt = typeof geparst === 'object' && geparst !== null
      const fehltFeld = !istObjekt || PFLICHTFELDER.some((feld) => !(feld in geparst))
      if (fehltFeld) {
        throw new Error(`JSON fehlt eines der Pflichtfelder: ${PFLICHTFELDER.join(', ')}`)
      }
      setData(geparst as Datenbestand)
      setImportError(null)
    } catch (fehler) {
      setImportError(fehler instanceof Error ? fehler.message : 'Import fehlgeschlagen: ungültiges JSON')
    }
  }

  const ergebnis = useMemo(
    () => berechneSzenario(data, szenario, szenario === 'sensitivitaet' ? sensitivitaet : undefined),
    [data, szenario, sensitivitaet]
  )

  return {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addUmverteilung,
    removeUmverteilung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
    importError,
  }
}
