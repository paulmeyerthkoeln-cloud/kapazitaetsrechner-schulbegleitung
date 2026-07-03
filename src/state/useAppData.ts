import { useMemo, useState } from 'react'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Person } from '../lib/types'

export function useAppData() {
  const [data, setData] = useState<Datenbestand>(seedData as Datenbestand)
  const [szenario, setSzenario] = useState<SzenarioTyp>('ziel')
  const [sensitivitaet, setSensitivitaet] = useState<SensitivitaetsParameter>({})

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

  function exportJson(): string {
    return JSON.stringify(data, null, 2)
  }

  function importJson(json: string) {
    setData(JSON.parse(json) as Datenbestand)
  }

  const ergebnis = useMemo(
    () => berechneSzenario(data, szenario, szenario === 'sensitivitaet' ? sensitivitaet : undefined),
    [data, szenario, sensitivitaet]
  )

  return {
    data,
    setPerson,
    setEinheitBegleitung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
  }
}
