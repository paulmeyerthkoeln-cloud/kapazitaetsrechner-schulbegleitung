import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppData } from './useAppData'

describe('useAppData', () => {
  it('loads the seed data with a default szenario of "ziel"', () => {
    const { result } = renderHook(() => useAppData())
    expect(result.current.szenario).toBe('ziel')
    expect(result.current.data.personen.length).toBeGreaterThan(0)
    expect(result.current.ergebnis.wochen.length).toBeGreaterThan(0)
  })

  it('setPerson updates a person’s weekly hours and recomputes the ergebnis', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    const vorher = result.current.ergebnis.wochen[0].angebot
    act(() => {
      result.current.setPerson(personId, { stunden_pro_woche_fuer_begleitung: 20 })
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(20)
    expect(result.current.ergebnis.wochen[0].angebot).not.toBe(vorher)
  })

  it('setEinheitBegleitung toggles a single Einheit and recomputes the ergebnis', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
  })

  it('setSchuleKoordination updates a Schule\'s coordination override and leaves other Schulen unchanged', () => {
    const { result } = renderHook(() => useAppData())
    const vorherWdg = result.current.data.schulen.find((s) => s.id === 'wdg')!.koordination_h_pro_monat
    act(() => {
      result.current.setSchuleKoordination('huegelstrasse', 2)
    })
    const huegelstrasse = result.current.data.schulen.find((s) => s.id === 'huegelstrasse')!
    const wdg = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(huegelstrasse.koordination_h_pro_monat).toBe(2)
    expect(wdg.koordination_h_pro_monat).toBe(vorherWdg)
  })

  it('addEinheit appends a new Einheit with default values and the correct index', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const vorherigeAnzahl = reihe.einheiten.length
    act(() => {
      result.current.addEinheit(reihe.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten).toHaveLength(vorherigeAnzahl + 1)
    const neueEinheit = aktualisierteReihe.einheiten[vorherigeAnzahl]
    expect(neueEinheit.kontaktzeit_h).toBe(1.5)
    expect(neueEinheit.personen_parallel).toBe(1)
    expect(neueEinheit.erstdurchfuehrung).toBe(false)
    expect(neueEinheit.wir_begleiten).toBe(true)
    expect(neueEinheit.typ).toBe('regulaer')
    expect(neueEinheit.index).toBe(vorherigeAnzahl + 1)
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen[0].einheiten).toHaveLength(12)
  })

  it('removeEinheit deletes the matching Einheit and renumbers the rest', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const zuLoeschen = reihe.einheiten[1]
    act(() => {
      result.current.removeEinheit(reihe.id, zuLoeschen.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten).toHaveLength(3)
    expect(aktualisierteReihe.einheiten.find((e) => e.id === zuLoeschen.id)).toBeUndefined()
    expect(aktualisierteReihe.einheiten.map((e) => e.index)).toEqual([1, 2, 3])
  })

  it('setEinheitFelder updates datum_oder_kw and kontaktzeit_h without touching other fields', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { datum_oder_kw: '2026-12-01', kontaktzeit_h: 2 })
    })
    const aktualisierteEinheit = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].einheiten[0]
    expect(aktualisierteEinheit.datum_oder_kw).toBe('2026-12-01')
    expect(aktualisierteEinheit.kontaktzeit_h).toBe(2)
    expect(aktualisierteEinheit.wir_begleiten).toBe(einheit.wir_begleiten)
    expect(aktualisierteEinheit.id).toBe(einheit.id)
  })

  it('addUmverteilung appends a new Umverteilung with the given values and leaves existing entries unchanged', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addUmverteilung('Herbstferien NRW', '2027-KW04', 10)
    })
    const umverteilungen = result.current.data.umverteilungen ?? []
    expect(umverteilungen).toHaveLength(1)
    expect(umverteilungen[0].ferienName).toBe('Herbstferien NRW')
    expect(umverteilungen[0].zielWochenKey).toBe('2027-KW04')
    expect(umverteilungen[0].zusatzStunden).toBe(10)
    act(() => {
      result.current.addUmverteilung('Weihnachtsferien NRW', '2027-KW05', 5)
    })
    const aktualisiert = result.current.data.umverteilungen ?? []
    expect(aktualisiert).toHaveLength(2)
    expect(aktualisiert[0].zielWochenKey).toBe('2027-KW04')
    expect(aktualisiert[1].zielWochenKey).toBe('2027-KW05')
  })

  it('removeUmverteilung deletes the matching entry and leaves others unchanged', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addUmverteilung('Herbstferien NRW', '2027-KW04', 10)
    })
    act(() => {
      result.current.addUmverteilung('Weihnachtsferien NRW', '2027-KW05', 5)
    })
    const zuLoeschen = (result.current.data.umverteilungen ?? [])[0]
    act(() => {
      result.current.removeUmverteilung(zuLoeschen.id)
    })
    const verbleibend = result.current.data.umverteilungen ?? []
    expect(verbleibend).toHaveLength(1)
    expect(verbleibend[0].zielWochenKey).toBe('2027-KW05')
  })

  it('setSzenario switches the active scenario and recomputes the ergebnis', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.setSzenario('verstaerkt')
    })
    expect(result.current.szenario).toBe('verstaerkt')
  })

  it('exportJson then importJson round-trips the data unchanged', () => {
    const { result } = renderHook(() => useAppData())
    const exported = result.current.exportJson()
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 99 })
    })
    act(() => {
      result.current.importJson(exported)
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).not.toBe(99)
    expect(result.current.importError).toBeNull()
  })

  it('importJson with malformed JSON sets importError and leaves data unchanged', () => {
    const { result } = renderHook(() => useAppData())
    const vorherigeDaten = result.current.data
    act(() => {
      result.current.importJson('not json')
    })
    expect(result.current.importError).not.toBeNull()
    expect(result.current.data).toBe(vorherigeDaten)
  })

  it('importJson with valid JSON missing a required top-level key sets importError and leaves data unchanged', () => {
    const { result } = renderHook(() => useAppData())
    const vorherigeDaten = result.current.data
    act(() => {
      result.current.importJson(JSON.stringify({ settings: {}, personen: [], kalender: {} }))
    })
    expect(result.current.importError).not.toBeNull()
    expect(result.current.data).toBe(vorherigeDaten)
  })

  it('a failed import followed by a valid import succeeds and clears importError', () => {
    const { result } = renderHook(() => useAppData())
    const exported = result.current.exportJson()
    act(() => {
      result.current.importJson('not json')
    })
    expect(result.current.importError).not.toBeNull()
    act(() => {
      result.current.importJson(exported)
    })
    expect(result.current.importError).toBeNull()
    expect(result.current.data.personen.length).toBeGreaterThan(0)
  })

  it('setReiheTerminstatus updates only the matching Reihe and leaves others unchanged', () => {
    const { result } = renderHook(() => useAppData())
    const wdgReiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    const vorherSedanstrasse = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!.reihen[0].terminstatus
    act(() => {
      result.current.setReiheTerminstatus(wdgReiheId, 'offen')
    })
    const wdgReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    const sedanstrasseReihe = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!.reihen[0]
    expect(wdgReihe.terminstatus).toBe('offen')
    expect(sedanstrasseReihe.terminstatus).toBe(vorherSedanstrasse)
  })

  it('setReiheEinheiten replaces the einheiten of the matching Reihe only', () => {
    const { result } = renderHook(() => useAppData())
    const reiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    const neueEinheiten = [
      {
        id: 'neu_1',
        index: 1,
        datum_oder_kw: '2027-03-01',
        kontaktzeit_h: 1.5,
        personen_parallel: 1,
        erstdurchfuehrung: true,
        wir_begleiten: true,
        typ: 'regulaer' as const,
      },
    ]
    act(() => {
      result.current.setReiheEinheiten(reiheId, neueEinheiten)
    })
    const aktualisiert = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisiert.einheiten).toEqual(neueEinheiten)
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen[0].einheiten.length).toBeGreaterThan(1)
  })

  it('exposes themenUebersicht derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.themenUebersicht)).toBe(true)
    expect(result.current.themenUebersicht.length).toBeGreaterThan(0)
  })
})
