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
})
