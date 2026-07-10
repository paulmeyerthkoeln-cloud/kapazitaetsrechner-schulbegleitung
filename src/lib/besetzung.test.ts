import { describe, it, expect } from 'vitest'
import { berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from './besetzung'
import type { Einheit } from './types'

function einheit(index: number): Einheit {
  return {
    id: `e${index}`,
    index,
    datum_oder_kw: '2026-KW40',
    kontaktzeit_h: 1.5,
    erstdurchfuehrung: false,
    wir_begleiten: false,
    begleitperson_ids: [],
    koordinator_ids: [],
  }
}

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
