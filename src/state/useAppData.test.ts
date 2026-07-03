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
