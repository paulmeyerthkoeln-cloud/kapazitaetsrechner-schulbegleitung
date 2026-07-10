import { describe, it, expect } from 'vitest'
import { format } from 'date-fns'
import {
  getISOWochenKey,
  parseZuWochenKey,
  istDatumInFerien,
  istWocheInFerien,
  alleWochenImZeitraum,
  expandiereMuster,
  berechneReiheZeitraum,
  ermittleFerienName,
  formatWochenspanne,
  generiereWochentlicheTermine,
  kwNummer,
  naechstesEinheitDatum,
} from './kalenderwochen'
import type { Einheit, FerienZeitraum, Muster, Reihe } from './types'

describe('getISOWochenKey', () => {
  it('formats a Monday in ISO week 46 of 2026', () => {
    expect(getISOWochenKey(new Date('2026-11-09'))).toBe('2026-KW46')
  })
})

describe('kwNummer', () => {
  it('extracts the week number from a KW key', () => {
    expect(kwNummer('2026-KW46')).toBe('46')
  })

  it('returns the input unchanged when it is not a valid KW key', () => {
    expect(kwNummer('nicht-ein-schluessel')).toBe('nicht-ein-schluessel')
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
      erstdurchfuehrung: false,
      wir_begleiten: true,
    })
    // Compare against the correct local-date string (fixed: no longer using
    // buggy toISOString().slice() which caused UTC day-shift in positive-offset timezones)
    expect(einheiten[0].datum_oder_kw).toBe('2026-11-02')
  })
})

describe('berechneReiheZeitraum', () => {
  const reiheBasis: Reihe = {
    id: 'r1',
    titel: 'x',
    betreuungsmodell: 'A',
    fahrzeit_h: 0,
    status: 'zugesagt',
    extern_betreut: false, terminstatus: 'festgelegt',
    einheiten: [],
  }

  it('returns null for a Reihe without Einheiten', () => {
    expect(berechneReiheZeitraum(reiheBasis)).toBeNull()
  })

  it('returns the min/max week key across all Einheiten, including across a year boundary', () => {
    const reihe: Reihe = {
      ...reiheBasis,
      einheiten: [
        { id: 'e1', index: 1, datum_oder_kw: '2026-KW46', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
        { id: 'e2', index: 2, datum_oder_kw: '2027-KW05', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
        { id: 'e3', index: 3, datum_oder_kw: '2026-KW48', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
      ],
    }
    expect(berechneReiheZeitraum(reihe)).toEqual({ von: '2026-KW46', bis: '2027-KW05' })
  })

  it('handles a Reihe with a single Einheit (von equals bis)', () => {
    const reihe: Reihe = {
      ...reiheBasis,
      einheiten: [
        { id: 'e1', index: 1, datum_oder_kw: '2026-09-07', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
      ],
    }
    expect(berechneReiheZeitraum(reihe)).toEqual({ von: '2026-KW37', bis: '2026-KW37' })
  })
})

describe('ermittleFerienName', () => {
  it('returns the name of the overlapping Ferienzeitraum', () => {
    expect(ermittleFerienName(new Date('2026-10-19'), [herbstferien])).toBe('Herbstferien NRW')
  })

  it('returns null when no Ferienzeitraum overlaps', () => {
    expect(ermittleFerienName(new Date('2026-11-09'), [herbstferien])).toBeNull()
  })

  it('returns the first matching name when multiple Ferienzeiträume are given', () => {
    const weihnachtsferien: FerienZeitraum = { name: 'Weihnachtsferien NRW', von: '2026-12-23', bis: '2027-01-06' }
    expect(ermittleFerienName(new Date('2026-10-19'), [herbstferien, weihnachtsferien])).toBe('Herbstferien NRW')
  })
})

describe('formatWochenspanne', () => {
  it('formats a week entirely within one month as dd.MM.–dd.MM.yyyy', () => {
    expect(formatWochenspanne('2026-KW46')).toBe('09.11.–15.11.2026')
  })

  it('formats a week that spans a month boundary correctly on both ends', () => {
    // 2026-KW44 runs Mon 2026-10-26 to Sun 2026-11-01.
    expect(formatWochenspanne('2026-KW44')).toBe('26.10.–01.11.2026')
  })

  it('returns the input unchanged when it is not a valid KW key', () => {
    expect(formatWochenspanne('nicht-ein-schluessel')).toBe('nicht-ein-schluessel')
  })
})

describe('generiereWochentlicheTermine', () => {
  it('generates exactly anzahlTermine weekly Einheiten, skipping Ferienwochen without counting them', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-10-12', 1.5, 0, 3, [herbstferien])
    expect(einheiten).toHaveLength(3)
    expect(einheiten.map((e) => e.datum_oder_kw)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
    expect(einheiten.map((e) => e.index)).toEqual([1, 2, 3])
  })

  it('marks only the first generated Termin as erstdurchfuehrung', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-09-07', 1.5, 0, 3, [])
    expect(einheiten.map((e) => e.erstdurchfuehrung)).toEqual([true, false, false])
  })

  it('uses the given unterrichtszeitH as kontaktzeit_h for every generated Termin', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-09-07', 2, 0, 2, [])
    expect(einheiten.every((e) => e.kontaktzeit_h === 2)).toBe(true)
  })

  it('ids each generated Termin uniquely using the reiheId and its position', () => {
    const einheiten = generiereWochentlicheTermine('reihe_test', '2026-09-07', 1.5, 0, 2, [])
    expect(einheiten.map((e) => e.id)).toEqual(['reihe_test_termin_1', 'reihe_test_termin_2'])
  })

  it('uses the given koordinationszeitH as koordinationszeit_h for every generated Termin', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-09-07', 1.5, 0.5, 2, [])
    expect(einheiten.every((e) => e.koordinationszeit_h === 0.5)).toBe(true)
  })
})

describe('naechstesEinheitDatum', () => {
  function einheit(datumOderKw: string): Einheit {
    return {
      id: 'x',
      index: 1,
      datum_oder_kw: datumOderKw,
      kontaktzeit_h: 1,
      erstdurchfuehrung: false,
      wir_begleiten: true,
      begleitperson_ids: [],
      koordinator_ids: [],
    }
  }

  it('returns the Monday of the week after the latest existing Einheit', () => {
    const einheiten = [einheit('2026-KW46'), einheit('2026-KW48'), einheit('2026-KW50'), einheit('2026-KW51')]
    expect(naechstesEinheitDatum(einheiten)).toBe('2026-12-21')
  })

  it('is not confused by insertion order — it looks at the latest week, not the last element', () => {
    const einheiten = [einheit('2026-KW51'), einheit('2026-KW46')]
    expect(naechstesEinheitDatum(einheiten)).toBe('2026-12-21')
  })

  it('falls back to today when there are no existing Einheiten', () => {
    expect(naechstesEinheitDatum([])).toBe(format(new Date(), 'yyyy-MM-dd'))
  })
})
