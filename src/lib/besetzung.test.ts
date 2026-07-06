import { describe, it, expect } from 'vitest'
import { wendeBesetzungPreset, berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from './besetzung'
import type { Einheit } from './types'

function einheit(index: number): Einheit {
  return {
    id: `e${index}`,
    index,
    datum_oder_kw: '2026-KW40',
    kontaktzeit_h: 1.5,
    personen_parallel: 1,
    erstdurchfuehrung: false,
    wir_begleiten: false,
    typ: 'regulaer',
  }
}

const vier = [einheit(1), einheit(2), einheit(3), einheit(4)]

describe('wendeBesetzungPreset', () => {
  it('alle: sets every Einheit to true', () => {
    const result = wendeBesetzungPreset(vier, { typ: 'alle' })
    expect(result.map((e) => e.wir_begleiten)).toEqual([true, true, true, true])
  })

  it('keine: sets every Einheit to false', () => {
    const result = wendeBesetzungPreset(vier, { typ: 'keine' })
    expect(result.map((e) => e.wir_begleiten)).toEqual([false, false, false, false])
  })

  it('erste_n: sets only the first n to true', () => {
    const result = wendeBesetzungPreset(vier, { typ: 'erste_n', n: 2 })
    expect(result.map((e) => e.wir_begleiten)).toEqual([true, true, false, false])
  })

  it('letzte_n: sets only the last n to true', () => {
    const result = wendeBesetzungPreset(vier, { typ: 'letzte_n', n: 2 })
    expect(result.map((e) => e.wir_begleiten)).toEqual([false, false, true, true])
  })

  it('erste_und_letzte: sets first and last to true', () => {
    const result = wendeBesetzungPreset(vier, { typ: 'erste_und_letzte' })
    expect(result.map((e) => e.wir_begleiten)).toEqual([true, false, false, true])
  })

  it('jede_n_te: sets every nth Einheit (1-indexed) to true', () => {
    const result = wendeBesetzungPreset(vier, { typ: 'jede_n_te', n: 2 })
    expect(result.map((e) => e.wir_begleiten)).toEqual([false, true, false, true])
  })

  it('manuell: leaves existing flags untouched', () => {
    const custom = [{ ...einheit(1), wir_begleiten: true }, einheit(2)]
    const result = wendeBesetzungPreset(custom, { typ: 'manuell' })
    expect(result.map((e) => e.wir_begleiten)).toEqual([true, false])
  })
})

describe('berechneUnserAnteil', () => {
  it('counts true Einheiten against the total', () => {
    const result = berechneUnserAnteil([
      { ...einheit(1), wir_begleiten: true },
      { ...einheit(2), wir_begleiten: false },
      { ...einheit(3), wir_begleiten: true },
      { ...einheit(4), wir_begleiten: false },
    ])
    expect(result).toEqual({ anzahl: 2, gesamt: 4, anteil: 0.5 })
  })
})

describe('ermittleHaeufigsteKontaktzeit', () => {
  it('returns the most frequent kontaktzeit_h value', () => {
    const einheiten = [
      { ...einheit(1), kontaktzeit_h: 4 },
      { ...einheit(2), kontaktzeit_h: 4 },
      { ...einheit(3), kontaktzeit_h: 1.5 },
    ]
    expect(ermittleHaeufigsteKontaktzeit(einheiten)).toBe(4)
  })

  it('picks the value that appears first when two values tie', () => {
    const einheiten = [
      { ...einheit(1), kontaktzeit_h: 1.5 },
      { ...einheit(2), kontaktzeit_h: 1.0833333333333333 },
    ]
    expect(ermittleHaeufigsteKontaktzeit(einheiten)).toBe(1.5)
  })

  it('returns null for an empty list', () => {
    expect(ermittleHaeufigsteKontaktzeit([])).toBeNull()
  })
})
