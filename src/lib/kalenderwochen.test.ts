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

  it('returns true for a minority overlap (any-overlap semantics, not majority)', () => {
    // Herbstferien ends 2026-10-31 (Saturday). The ISO week starting Monday
    // 2026-10-26 runs through Sunday 2026-11-01, so only Fri 10-30 and Sat
    // 10-31 (2 of 7 days) fall inside the Ferien range — a clear minority.
    expect(istWocheInFerien(new Date('2026-10-26'), [herbstferien])).toBe(true)
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
    // Under any-overlap semantics the 2026-10-12 week (Mon 10-12..Sun 10-18) already
    // overlaps Herbstferien (which starts 10-17), the 10-19 and 10-26 weeks overlap
    // fully/mostly, so only the 2026-11-02 occurrence survives.
    expect(einheiten).toHaveLength(1)
    expect(einheiten[0]).toMatchObject({
      index: 1,
      kontaktzeit_h: 1.5,
      personen_parallel: 1,
      erstdurchfuehrung: false,
      wir_begleiten: true,
      typ: 'regulaer',
    })
    // Compare against the correct local-date string (fixed: no longer using
    // buggy toISOString().slice() which caused UTC day-shift in positive-offset timezones)
    expect(einheiten[0].datum_oder_kw).toBe('2026-11-02')
  })
})
