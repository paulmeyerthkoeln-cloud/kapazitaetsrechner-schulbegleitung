import { describe, it, expect } from 'vitest'
import {
  getISOWochenKey,
  parseZuWochenKey,
  istDatumInFerien,
  istWocheInFerien,
  alleWochenImZeitraum,
  expandiereMuster,
} from './kalenderwochen'
import type { FerienZeitraum, Muster } from './types'

describe('getISOWochenKey', () => {
  it('formats a Monday in ISO week 46 of 2026', () => {
    expect(getISOWochenKey(new Date('2026-11-09'))).toBe('2026-KW46')
  })
})

describe('parseZuWochenKey', () => {
  it('passes through an already-formatted week key', () => {
    expect(parseZuWochenKey('2026-KW46')).toBe('2026-KW46')
  })

  it('converts an ISO date string to a week key', () => {
    expect(parseZuWochenKey('2026-11-09')).toBe('2026-KW46')
  })
})

const herbstferien: FerienZeitraum = { name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }

describe('istDatumInFerien', () => {
  it('returns true for a date inside the range', () => {
    expect(istDatumInFerien(new Date('2026-10-20'), [herbstferien])).toBe(true)
  })

  it('returns false for a date outside the range', () => {
    expect(istDatumInFerien(new Date('2026-11-09'), [herbstferien])).toBe(false)
  })
})

describe('istWocheInFerien', () => {
  it('returns true when the week overlaps a Ferien range', () => {
    expect(istWocheInFerien(new Date('2026-10-19'), [herbstferien])).toBe(true)
  })

  it('returns false when the week does not overlap', () => {
    expect(istWocheInFerien(new Date('2026-11-09'), [herbstferien])).toBe(false)
  })
})

describe('alleWochenImZeitraum', () => {
  it('returns one Monday per ISO week in the range, inclusive', () => {
    const wochen = alleWochenImZeitraum('2026-11-02', '2026-11-16')
    expect(wochen.map(getISOWochenKey)).toEqual(['2026-KW45', '2026-KW46', '2026-KW47'])
  })
})

describe('expandiereMuster', () => {
  it('generates one Einheit per non-Ferien weekly occurrence', () => {
    const muster: Muster = { typ: 'woechentlich', von: '2026-10-12', bis: '2026-11-02', kontaktzeit_h: 1.5 }
    const einheiten = expandiereMuster(muster, 'reihe_x', [herbstferien])
    expect(einheiten.map((e) => e.datum_oder_kw)).toEqual(['2026-10-12', '2026-11-02'])
    expect(einheiten[0]).toMatchObject({
      index: 1,
      kontaktzeit_h: 1.5,
      personen_parallel: 1,
      erstdurchfuehrung: false,
      wir_begleiten: true,
      typ: 'regulaer',
    })
    expect(einheiten[1].index).toBe(2)
  })
})
