import { describe, it, expect } from 'vitest'
import data from './data.json'
import type { Datenbestand } from '../lib/types'

describe('seed data.json', () => {
  it('parses as a valid Datenbestand shape', () => {
    const d = data as Datenbestand
    expect(d.settings.planungszeitraum.start).toBe('2026-09-01')
    expect(d.personen.length).toBeGreaterThanOrEqual(5)
  })

  it('contains all 10 schools from spec section 5, including the schule_x placeholder', () => {
    const d = data as Datenbestand
    expect(d.schulen).toHaveLength(10)
    expect(d.schulen.find((s) => s.id === 'schule_x')).toBeDefined()
  })

  it('marks exactly one Person as szenario_optional (Person 5)', () => {
    const d = data as Datenbestand
    expect(d.personen.filter((p) => p.szenario_optional).length).toBe(1)
  })

  it('includes both confirmed 2026 and researched 2027 Ferien', () => {
    const d = data as Datenbestand
    const namen = d.kalender.ferien.map((f) => f.name)
    expect(namen).toContain('Herbstferien NRW')
    expect(namen).toContain('Osterferien NRW 2027')
    expect(d.kalender.ferien.find((f) => f.name === 'Osterferien NRW 2027')).toMatchObject({
      von: '2027-03-22',
      bis: '2027-04-03',
    })
  })

  it('gives Else Lasker / Parisa Einheit 1 as wir_begleiten among its remaining (non-Exkursion) Reihen-Einheiten', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    const parisa = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_parisa')!
    expect(parisa.einheiten.map((e) => e.wir_begleiten)).toEqual([true, false, false])
  })

  it('extracts the Parisa and Simone Exkursionen into their own Veranstaltungen', () => {
    const d = data as Datenbestand
    expect(d.veranstaltungen).toHaveLength(2)
    expect(d.veranstaltungen.every((v) => v.art === 'exkursion')).toBe(true)
    expect(d.veranstaltungen.every((v) => v.schulIds.length === 1 && v.schulIds[0] === 'else_lasker')).toBe(true)
    // el_parisa_e3 had wir_begleiten: true, el_simone_e4 had wir_begleiten: false — both values must survive the move.
    const wirBegleitenWerte = d.veranstaltungen.map((v) => v.termine[0].besetzungen[0].wir_begleiten).sort()
    expect(wirBegleitenWerte).toEqual([false, true])
  })

  it('marks Sedanstraße and Kothen as terminstatus "offen" since no real dates were given', () => {
    const d = data as Datenbestand
    const sedanstrasse = d.schulen.find((s) => s.id === 'sedanstrasse')!
    const kothen = d.schulen.find((s) => s.id === 'kothen')!
    expect(sedanstrasse.reihen[0].terminstatus).toBe('offen')
    expect(kothen.reihen[0].terminstatus).toBe('offen')
  })

  it('marks WDG, Berufskolleg Barmen, Hügelstraße, and Alexander Coppel as terminstatus "festgelegt"', () => {
    const d = data as Datenbestand
    for (const id of ['wdg', 'berufskolleg_barmen', 'huegelstrasse', 'alexander_coppel']) {
      const schule = d.schulen.find((s) => s.id === id)!
      expect(schule.reihen.every((r) => r.terminstatus === 'festgelegt')).toBe(true)
    }
  })

  it('marks Else Lasker, Max Planck, and Bayreuther Gymnasium as terminstatus "teilweise_festgelegt"', () => {
    const d = data as Datenbestand
    for (const id of ['else_lasker', 'max_planck', 'bayreuther_gymnasium']) {
      const schule = d.schulen.find((s) => s.id === id)!
      expect(schule.reihen.every((r) => r.terminstatus === 'teilweise_festgelegt')).toBe(true)
    }
  })

  it('assigns Mobilität to the Parisa Einheiten and Ernährung to the Simone Einheiten at Else Lasker', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    const parisa = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_parisa')!
    const simone = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_simone')!
    expect(parisa.einheiten.every((e) => e.thema === 'Mobilität')).toBe(true)
    expect(simone.einheiten.every((e) => e.thema === 'Ernährung')).toBe(true)
  })

  it('sets Alexander-Coppel Unterrichtszeit to exactly 65 minutes per Termin', () => {
    const d = data as Datenbestand
    const coppel = d.schulen.find((s) => s.id === 'alexander_coppel')!
    expect(coppel.reihen[0].einheiten.every((e) => Math.round(e.kontaktzeit_h * 60) === 65)).toBe(true)
  })

  it('sets every Else-Lasker Termin, including the extracted Exkursions-Veranstaltungen, to 90 minutes Unterrichtszeit', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    for (const reihe of elseLasker.reihen) {
      expect(reihe.einheiten.every((e) => e.kontaktzeit_h === 1.5)).toBe(true)
    }
    for (const veranstaltung of d.veranstaltungen) {
      expect(veranstaltung.termine.every((t) => t.kontaktzeit_h === 1.5)).toBe(true)
    }
  })

  it('leaves the Exkursions-Organisationspauschale for both extracted Veranstaltungen at 2h', () => {
    const d = data as Datenbestand
    expect(d.veranstaltungen).toHaveLength(2)
    expect(d.veranstaltungen.every((v) => v.termine[0].organisationspauschale_h === 2)).toBe(true)
  })

  it('leaves WDG Unterrichtszeit at 4 Stunden per Termin', () => {
    const d = data as Datenbestand
    const wdg = d.schulen.find((s) => s.id === 'wdg')!
    expect(wdg.reihen[0].einheiten.every((e) => e.kontaktzeit_h === 4)).toBe(true)
  })
})
