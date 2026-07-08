import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppData } from './useAppData'

describe('useAppData', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the seed data without legacy optional scenario people', () => {
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.personen.length).toBeGreaterThan(0)
    expect(result.current.data.personen.some((p) => p.szenario_optional)).toBe(false)
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

  it('addPerson appends a directly counted person with editable defaults', () => {
    const { result } = renderHook(() => useAppData())
    const vorherigeAnzahl = result.current.data.personen.length
    const vorherigesAngebot = result.current.ergebnis.wochen[0].angebot
    act(() => {
      result.current.addPerson()
    })
    expect(result.current.data.personen).toHaveLength(vorherigeAnzahl + 1)
    expect(result.current.data.personen.at(-1)?.name).toMatch(/Person/)
    expect(result.current.ergebnis.wochen[0].angebot).toBeGreaterThan(vorherigesAngebot)
  })

  it('removePerson deletes the selected person and recomputes the ergebnis', () => {
    const { result } = renderHook(() => useAppData())
    const zuLoeschen = result.current.data.personen[0]
    act(() => {
      result.current.removePerson(zuLoeschen.id)
    })
    expect(result.current.data.personen.find((p) => p.id === zuLoeschen.id)).toBeUndefined()
  })

  it('addPerson seeds an empty ferien list', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addPerson()
    })
    expect(result.current.data.personen.at(-1)?.ferien).toEqual([])
  })

  it('setPersonFerien replaces the ferien list of the matching Person only', () => {
    const { result } = renderHook(() => useAppData())
    const [p1, p2] = result.current.data.personen
    const neueFerien = [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-13' }]
    act(() => {
      result.current.setPersonFerien(p1.id, neueFerien)
    })
    expect(result.current.data.personen.find((p) => p.id === p1.id)?.ferien).toEqual(neueFerien)
    expect(result.current.data.personen.find((p) => p.id === p2.id)?.ferien).toEqual([])
  })

  it('backfills an empty ferien list for Personen persisted before the Ferien field existed', () => {
    const roh = JSON.stringify({
      settings: {
        planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
        schwellwert_warnung: 0.7,
        schwellwert_kritisch: 0.9,
        default_fahrzeit_h: 1,
        default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
        default_vorbereitungsfaktor_wiederholung: 0.25,
        koordination_h_pro_schule_pro_monat: 1.5,
      },
      personen: [{ id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] }],
      kalender: { ferien: [] },
      schulen: [],
    })
    localStorage.setItem('kapazitaetsrechner:data', roh)
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.personen[0].ferien).toEqual([])
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

  it('addEinheit places the new Einheit one week after the Reihe\'s latest existing Einheit', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    act(() => {
      result.current.addEinheit(reihe.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    // Seed data for wdg's first Reihe has its latest existing Einheit in 2026-KW51 (see src/data/data.json).
    expect(aktualisierteReihe.einheiten.at(-1)?.datum_oder_kw).toBe('2026-12-21')
  })

  it('setEinheitBegleitung clears begleitperson_id when toggled off', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_id: personId })
    })
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
    expect(aktualisierteReihe.einheiten[0].begleitperson_id).toBeNull()
  })

  it('removePerson clears begleitperson_id on any Einheit that referenced the deleted Person', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_id: personId })
    })
    act(() => {
      result.current.removePerson(personId)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].begleitperson_id).toBeNull()
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

  it('exposes themenGanttZeilen derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.themenGanttZeilen)).toBe(true)
    expect(result.current.themenGanttZeilen.length).toBeGreaterThan(0)
  })

  it('exposes personenKapazitaet derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.personenKapazitaet)).toBe(true)
    expect(result.current.personenKapazitaet).toHaveLength(result.current.data.personen.length)
  })

  it('addPersonenUmverteilung appends a new entry', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.addPersonenUmverteilung(personId, '2026-KW46', '2026-KW47', 3)
    })
    expect(result.current.data.personenUmverteilungen).toHaveLength(1)
    expect(result.current.data.personenUmverteilungen?.[0]).toMatchObject({
      personId,
      quelleWochenKey: '2026-KW46',
      zielWochenKey: '2026-KW47',
      stunden: 3,
    })
  })

  it('removePersonenUmverteilung deletes the matching entry', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.addPersonenUmverteilung(personId, '2026-KW46', '2026-KW47', 3)
    })
    const id = result.current.data.personenUmverteilungen![0].id
    act(() => {
      result.current.removePersonenUmverteilung(id)
    })
    expect(result.current.data.personenUmverteilungen).toHaveLength(0)
  })

  it('persists data to localStorage after a change and reloads it on next mount', () => {
    const { result, unmount } = renderHook(() => useAppData())
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    unmount()
    const { result: result2 } = renderHook(() => useAppData())
    expect(result2.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42)
  })

  it('falls back to seed data when localStorage contains invalid JSON', () => {
    localStorage.setItem('kapazitaetsrechner:data', 'not json')
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.personen.length).toBeGreaterThan(0)
  })

  it('defaults terminstatus to festgelegt when loading persisted data missing that field', () => {
    const roh = JSON.stringify({
      settings: {
        planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
        schwellwert_warnung: 0.7,
        schwellwert_kritisch: 0.9,
        default_fahrzeit_h: 1,
        default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
        default_vorbereitungsfaktor_wiederholung: 0.25,
        koordination_h_pro_schule_pro_monat: 1.5,
      },
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Test',
          reihen: [{ id: 'r1', titel: 'x', betreuungsmodell: 'A', fahrzeit_h: 0, status: 'zugesagt', extern_betreut: false, einheiten: [] }],
        },
      ],
    })
    localStorage.setItem('kapazitaetsrechner:data', roh)
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.schulen[0].reihen[0].terminstatus).toBe('festgelegt')
  })

  it('zuruecksetzen restores seed data and re-persists it', () => {
    const { result } = renderHook(() => useAppData())
    const urspruenglicheStunden = result.current.data.personen[0].stunden_pro_woche_fuer_begleitung
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    act(() => {
      result.current.zuruecksetzen()
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
    const gespeichert = JSON.parse(localStorage.getItem('kapazitaetsrechner:data')!)
    expect(gespeichert.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
  })

  it('does not crash when localStorage.setItem throws (e.g. private browsing / quota exceeded)', () => {
    const { result } = renderHook(() => useAppData())
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => {
      act(() => {
        result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 77 })
      })
    }).not.toThrow()
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(77)
    setItemSpy.mockRestore()
  })
})
