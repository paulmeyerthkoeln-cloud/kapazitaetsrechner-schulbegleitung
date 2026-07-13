import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import seedData from '../data/data.json'
import type { Datenbestand } from '../lib/types'

const { selectSingleMock, updateMock, setLadeErgebnis, setUpdateFehler } = vi.hoisted(() => {
  let ladeErgebnis: { data: { data: unknown } | null; error: { message: string } | null } = {
    data: null,
    error: null,
  }
  let updateFehler: { message: string } | null = null
  const selectSingleMock = vi.fn(() => Promise.resolve(ladeErgebnis))
  const updateMock = vi.fn(() => ({ eq: () => Promise.resolve({ error: updateFehler }) }))
  return {
    selectSingleMock,
    updateMock,
    setLadeErgebnis: (naechstesErgebnis: typeof ladeErgebnis) => {
      ladeErgebnis = naechstesErgebnis
    },
    setUpdateFehler: (naechsterFehler: typeof updateFehler) => {
      updateFehler = naechsterFehler
    },
  }
})

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: selectSingleMock }) }),
      update: updateMock,
    }),
  },
}))

import { useAppData } from './useAppData'

async function renderBereitesAppData() {
  const utils = renderHook(() => useAppData())
  await waitFor(() => expect(utils.result.current.ladePhase).toBe('bereit'))
  return utils
}

describe('useAppData', () => {
  beforeEach(() => {
    localStorage.clear()
    setLadeErgebnis({ data: { data: seedData as unknown }, error: null })
    setUpdateFehler(null)
    selectSingleMock.mockClear()
    updateMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the seed data without legacy optional scenario people', async () => {
    const { result } = await renderBereitesAppData()
    expect(result.current.data.personen.length).toBeGreaterThan(0)
    expect(result.current.data.personen.some((p) => p.szenario_optional)).toBe(false)
    expect(result.current.ergebnis.wochen.length).toBeGreaterThan(0)
  })

  it('shows an error state when the Supabase load fails', async () => {
    setLadeErgebnis({ data: null, error: { message: 'Netzwerkfehler' } })
    const { result } = renderHook(() => useAppData())
    await waitFor(() => expect(result.current.ladePhase).toBe('fehler'))
    expect(result.current.ladeFehler).toBe('Netzwerkfehler')
  })

  it('shows an error state when the Supabase row is missing required fields', async () => {
    setLadeErgebnis({ data: { data: { settings: {} } }, error: null })
    const { result } = renderHook(() => useAppData())
    await waitFor(() => expect(result.current.ladePhase).toBe('fehler'))
    expect(result.current.ladeFehler).not.toBeNull()
  })

  it('setPerson updates a person’s weekly hours and recomputes the ergebnis', async () => {
    const { result } = await renderBereitesAppData()
    const personId = result.current.data.personen[0].id
    const vorher = result.current.ergebnis.wochen[0].angebot
    act(() => {
      result.current.setPerson(personId, { stunden_pro_woche_fuer_begleitung: 20 })
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(20)
    expect(result.current.ergebnis.wochen[0].angebot).not.toBe(vorher)
  })

  it('setEinheitBegleitung toggles a single Einheit and recomputes the ergebnis', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
  })

  it('addPerson appends a directly counted person with editable defaults', async () => {
    const { result } = await renderBereitesAppData()
    const vorherigeAnzahl = result.current.data.personen.length
    const vorherigesAngebot = result.current.ergebnis.wochen[0].angebot
    act(() => {
      result.current.addPerson()
    })
    expect(result.current.data.personen).toHaveLength(vorherigeAnzahl + 1)
    expect(result.current.data.personen.at(-1)?.name).toMatch(/Person/)
    expect(result.current.ergebnis.wochen[0].angebot).toBeGreaterThan(vorherigesAngebot)
  })

  it('removePerson deletes the selected person and recomputes the ergebnis', async () => {
    const { result } = await renderBereitesAppData()
    const zuLoeschen = result.current.data.personen[0]
    act(() => {
      result.current.removePerson(zuLoeschen.id)
    })
    expect(result.current.data.personen.find((p) => p.id === zuLoeschen.id)).toBeUndefined()
  })

  it('addPerson seeds an empty urlaub list', async () => {
    const { result } = await renderBereitesAppData()
    act(() => {
      result.current.addPerson()
    })
    expect(result.current.data.personen.at(-1)?.urlaub).toEqual([])
  })

  it('setPersonUrlaub replaces the urlaub list of the matching Person only', async () => {
    const { result } = await renderBereitesAppData()
    const [p1, p2] = result.current.data.personen
    const neuerUrlaub = [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-13' }]
    act(() => {
      result.current.setPersonUrlaub(p1.id, neuerUrlaub)
    })
    expect(result.current.data.personen.find((p) => p.id === p1.id)?.urlaub).toEqual(neuerUrlaub)
    expect(result.current.data.personen.find((p) => p.id === p2.id)?.urlaub).toEqual([])
  })

  it('backfills an empty urlaub list for Personen persisted before the Urlaub field existed', async () => {
    const roh = {
      settings: {
        planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
        schwellwert_warnung: 0.7,
        schwellwert_kritisch: 0.9,
        default_fahrzeit_h: 1,
        default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
        default_vorbereitungsfaktor_wiederholung: 0.25,
      },
      personen: [{ id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] }],
      kalender: { ferien: [] },
      schulen: [],
    }
    setLadeErgebnis({ data: { data: roh }, error: null })
    const { result } = await renderBereitesAppData()
    expect(result.current.data.personen[0].urlaub).toEqual([])
  })

  it('addEinheit appends a new Einheit with default values and the correct index', async () => {
    const { result } = await renderBereitesAppData()
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
    expect(neueEinheit.begleitperson_ids).toEqual([])
    expect(neueEinheit.koordinator_ids).toEqual([])
    expect(neueEinheit.erstdurchfuehrung).toBe(false)
    expect(neueEinheit.wir_begleiten).toBe(true)
    expect(neueEinheit.index).toBe(vorherigeAnzahl + 1)
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen[0].einheiten).toHaveLength(12)
  })

  it('addEinheit places the new Einheit one week after the Reihe\'s latest existing Einheit', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    act(() => {
      result.current.addEinheit(reihe.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    // Seed data for wdg's first Reihe has its latest existing Einheit in 2026-KW51 (see src/data/data.json).
    expect(aktualisierteReihe.einheiten.at(-1)?.datum_oder_kw).toBe('2026-12-21')
  })

  it('setEinheitBegleitung clears begleitperson_ids when toggled off', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_ids: [personId] })
    })
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
    expect(aktualisierteReihe.einheiten[0].begleitperson_ids).toEqual([])
  })

  it('removePerson clears the deleted Person from any begleitperson_ids/koordinator_ids on a Reihen-Einheit', async () => {
    const { result } = await renderBereitesAppData()
    const personId = result.current.data.personen[0].id
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_ids: [personId], koordinator_ids: [personId] })
    })
    act(() => {
      result.current.removePerson(personId)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].begleitperson_ids).toEqual([])
    expect(aktualisierteReihe.einheiten[0].koordinator_ids).toEqual([])
  })

  it('removeEinheit deletes the matching Einheit and renumbers the rest', async () => {
    const { result } = await renderBereitesAppData()
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

  it('addReihe appends a new Reihe with sensible defaults to the correct Schule only', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const vorherigeAnzahl = schule.reihen.length
    act(() => {
      result.current.addReihe('wdg')
    })
    const aktualisierteSchule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(aktualisierteSchule.reihen).toHaveLength(vorherigeAnzahl + 1)
    const neueReihe = aktualisierteSchule.reihen.at(-1)!
    expect(neueReihe.titel).toBe('Neuer Kurs')
    expect(neueReihe.betreuungsmodell).toBe('A')
    expect(neueReihe.terminstatus).toBe('offen')
    expect(neueReihe.einheiten).toEqual([])
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen).toHaveLength(1)
  })

  it('removeReihe deletes the matching Reihe and leaves other Reihen/Schulen unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reiheId = schule.reihen[0].id
    act(() => {
      result.current.removeReihe('wdg', reiheId)
    })
    const aktualisierteSchule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(aktualisierteSchule.reihen.find((r) => r.id === reiheId)).toBeUndefined()
  })

  it('setReiheTitel updates only the matching Reihe\'s titel', async () => {
    const { result } = await renderBereitesAppData()
    const wdgReiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    act(() => {
      result.current.setReiheTitel(wdgReiheId, 'Neuer Titel')
    })
    const wdgReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(wdgReihe.titel).toBe('Neuer Titel')
  })

  it('setEinheitFelder updates datum_oder_kw and kontaktzeit_h without touching other fields', async () => {
    const { result } = await renderBereitesAppData()
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

  it('exportJson then importJson round-trips the data unchanged', async () => {
    const { result } = await renderBereitesAppData()
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

  it('importJson with malformed JSON sets importError and leaves data unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const vorherigeDaten = result.current.data
    act(() => {
      result.current.importJson('not json')
    })
    expect(result.current.importError).not.toBeNull()
    expect(result.current.data).toBe(vorherigeDaten)
  })

  it('importJson with valid JSON missing a required top-level key sets importError and leaves data unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const vorherigeDaten = result.current.data
    act(() => {
      result.current.importJson(JSON.stringify({ settings: {}, personen: [], kalender: {} }))
    })
    expect(result.current.importError).not.toBeNull()
    expect(result.current.data).toBe(vorherigeDaten)
  })

  it('a failed import followed by a valid import succeeds and clears importError', async () => {
    const { result } = await renderBereitesAppData()
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

  it('setReiheTerminstatus updates only the matching Reihe and leaves others unchanged', async () => {
    const { result } = await renderBereitesAppData()
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

  it('setReiheEinheiten replaces the einheiten of the matching Reihe only', async () => {
    const { result } = await renderBereitesAppData()
    const reiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    const neueEinheiten = [
      {
        id: 'neu_1',
        index: 1,
        datum_oder_kw: '2027-03-01',
        kontaktzeit_h: 1.5,
        erstdurchfuehrung: true,
        wir_begleiten: true,
        begleitperson_ids: [],
        koordinator_ids: [],
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

  it('exposes themenGanttZeilen derived from the current data', async () => {
    const { result } = await renderBereitesAppData()
    expect(Array.isArray(result.current.themenGanttZeilen)).toBe(true)
    expect(result.current.themenGanttZeilen.length).toBeGreaterThan(0)
  })

  it('exposes personenKapazitaet derived from the current data', async () => {
    const { result } = await renderBereitesAppData()
    expect(Array.isArray(result.current.personenKapazitaet)).toBe(true)
    expect(result.current.personenKapazitaet).toHaveLength(result.current.data.personen.length)
  })

  it('addPersonenUmverteilung appends a new entry', async () => {
    const { result } = await renderBereitesAppData()
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

  it('removePersonenUmverteilung deletes the matching entry', async () => {
    const { result } = await renderBereitesAppData()
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

  it('writes the updated data to Supabase after a change', async () => {
    const { result } = await renderBereitesAppData()
    updateMock.mockClear()
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    await waitFor(() => expect(updateMock).toHaveBeenCalled())
    const [[gespeichertesArgument]] = updateMock.mock.calls as [[{ data: Datenbestand; updated_at: string }]]
    expect(gespeichertesArgument.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42)
    expect(typeof gespeichertesArgument.updated_at).toBe('string')
  })

  it('keeps a local snapshot in localStorage after a successful save (Notanker)', async () => {
    const { result } = await renderBereitesAppData()
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    await waitFor(() => {
      const gespeichert = JSON.parse(localStorage.getItem('kapazitaetsrechner:data') ?? 'null')
      expect(gespeichert?.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42)
    })
  })

  it('does not crash when localStorage.setItem throws (e.g. private browsing / quota exceeded)', async () => {
    const { result } = await renderBereitesAppData()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 77 })
    })
    await waitFor(() => expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(77))
    setItemSpy.mockRestore()
  })

  it('defaults terminstatus to festgelegt when loading persisted data missing that field', async () => {
    const roh = {
      settings: {
        planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
        schwellwert_warnung: 0.7,
        schwellwert_kritisch: 0.9,
        default_fahrzeit_h: 1,
        default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
        default_vorbereitungsfaktor_wiederholung: 0.25,
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
    }
    setLadeErgebnis({ data: { data: roh }, error: null })
    const { result } = await renderBereitesAppData()
    expect(result.current.data.schulen[0].reihen[0].terminstatus).toBe('festgelegt')
  })

  it('zuruecksetzen restores seed data and re-persists it', async () => {
    const { result } = await renderBereitesAppData()
    const urspruenglicheStunden = result.current.data.personen[0].stunden_pro_woche_fuer_begleitung
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    await waitFor(() => expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42))
    act(() => {
      result.current.zuruecksetzen()
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
    await waitFor(() => {
      const [letzterAufruf] = updateMock.mock.calls.at(-1) as [{ data: Datenbestand }]
      expect(letzterAufruf.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
    })
  })

  describe('Veranstaltungen', () => {
    it('addVeranstaltung appends a new Veranstaltung with the given art and schulIds', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const neue = result.current.data.veranstaltungen.at(-1)!
      expect(neue.art).toBe('themenwoche')
      expect(neue.titel).toBe('Neue Themenwoche')
      expect(neue.terminstatus).toBe('offen')
      expect(neue.schulIds).toEqual(['wdg', 'sedanstrasse'])
      expect(neue.termine).toEqual([])
    })

    it('removeVeranstaltung deletes the matching Veranstaltung only', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('exkursion', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.removeVeranstaltung(id)
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)).toBeUndefined()
    })

    it('setVeranstaltungTitel updates only the matching Veranstaltung', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.setVeranstaltungTitel(id, 'Klimawoche')
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)!.titel).toBe('Klimawoche')
    })

    it('setVeranstaltungSchulen adds a fresh Besetzung for a newly added Schule on every existing Termin', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg', 'sedanstrasse'])
      })
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === id)!
      expect(veranstaltung.schulIds).toEqual(['wdg', 'sedanstrasse'])
      expect(veranstaltung.termine[0].besetzungen.map((b) => b.schulId)).toEqual(['wdg', 'sedanstrasse'])
    })

    it('setVeranstaltungSchulen preserves an existing Besetzung for a Schule that remains selected', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setSchulBesetzungFelder(id, terminId, 'wdg', { fahrzeit_h: 2 })
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg', 'sedanstrasse'])
      })
      const besetzung = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].besetzungen.find((b) => b.schulId === 'wdg')!
      expect(besetzung.fahrzeit_h).toBe(2)
    })

    it('setVeranstaltungSchulen removes the Besetzung of a deselected Schule', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg'])
      })
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === id)!
      expect(veranstaltung.termine[0].besetzungen.map((b) => b.schulId)).toEqual(['wdg'])
    })

    it('addVeranstaltungTermin appends a Termin with one empty Besetzung per current schulId', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const termin = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0]
      expect(termin.index).toBe(1)
      expect(termin.kontaktzeit_h).toBe(1.5)
      expect(termin.erstdurchfuehrung).toBe(true)
      expect(termin.besetzungen.map((b) => b.schulId)).toEqual(['wdg', 'sedanstrasse'])
      expect(termin.besetzungen.every((b) => b.wir_begleiten && b.begleitperson_ids.length === 0)).toBe(true)
    })

    it('removeVeranstaltungTermin deletes the matching Termin and renumbers the rest', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const ersterTerminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.removeVeranstaltungTermin(id, ersterTerminId)
      })
      const termine = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine
      expect(termine).toHaveLength(1)
      expect(termine[0].index).toBe(1)
    })

    it('setVeranstaltungTerminFelder patches only the matching Termin', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setVeranstaltungTerminFelder(id, terminId, { kontaktzeit_h: 3 })
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].kontaktzeit_h).toBe(3)
    })

    it('setSchulBesetzungFelder patches only the matching Schule-Besetzung on the matching Termin', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setSchulBesetzungFelder(id, terminId, 'sedanstrasse', { begleitperson_ids: ['p1'] })
      })
      const termin = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0]
      expect(termin.besetzungen.find((b) => b.schulId === 'sedanstrasse')!.begleitperson_ids).toEqual(['p1'])
      expect(termin.besetzungen.find((b) => b.schulId === 'wdg')!.begleitperson_ids).toEqual([])
    })

    it('migrates a legacy typ: exkursion Einheit in imported JSON into its own Veranstaltung', async () => {
      const { result } = await renderBereitesAppData()
      const roh = {
        settings: {
          planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
          schwellwert_warnung: 0.7,
          schwellwert_kritisch: 0.9,
          default_fahrzeit_h: 1,
          default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
          default_vorbereitungsfaktor_wiederholung: 0.25,
        },
        personen: [],
        kalender: { ferien: [] },
        schulen: [
          {
            id: 's1',
            name: 'Test',
            reihen: [
              {
                id: 'r1',
                titel: 'Kurs mit Exkursion',
                betreuungsmodell: 'A',
                fahrzeit_h: 1,
                status: 'zugesagt',
                extern_betreut: false,
                terminstatus: 'festgelegt',
                einheiten: [
                  { id: 'e1', index: 1, datum_oder_kw: '2026-10-05', kontaktzeit_h: 1.5, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
                  { id: 'e2', index: 2, datum_oder_kw: '2026-10-12', kontaktzeit_h: 1.5, erstdurchfuehrung: false, wir_begleiten: true, typ: 'exkursion', organisationspauschale_h: 2 },
                ],
              },
            ],
          },
        ],
      }
      act(() => {
        result.current.importJson(JSON.stringify(roh))
      })
      const schule = result.current.data.schulen.find((s) => s.id === 's1')!
      expect(schule.reihen[0].einheiten).toHaveLength(1)
      expect(schule.reihen[0].einheiten[0].id).toBe('e1')
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === 'veranstaltung_e2')!
      expect(veranstaltung.art).toBe('exkursion')
      expect(veranstaltung.schulIds).toEqual(['s1'])
      expect(veranstaltung.termine[0].organisationspauschale_h).toBe(2)
      expect(veranstaltung.termine[0].besetzungen[0]).toMatchObject({ schulId: 's1', wir_begleiten: true, fahrzeit_h: 1 })
    })
  })
})
