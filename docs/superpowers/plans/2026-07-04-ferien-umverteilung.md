# Ferien-Sichtbarkeit + Kapazitäts-Umverteilung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ferienwochen unmistakably distinct in the Wochen-Heatmap (name in the tooltip, striped pattern instead of flat gray), and let the team record team-aggregated "Kapazitäts-Umverteilung" entries that move unused Ferien-week capacity into a chosen busy week's Angebot.

**Architecture:** A new `Umverteilung` data type and two small pure functions (`ermittleFerienName`, `berechneZusatzangebotProWoche`) extend the existing calculation pipeline (`WochenErgebnis` gains `ferienName`, `angebotBasis`, `zusatzangebot`). The Heatmap tooltip/CSS consumes the new `ferienName` field. A new `KapazitaetsUmverteilung` component (backed by two new `useAppData` handlers) lets the team add/remove redistribution entries.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, date-fns.

## Global Constraints

- Kapazitäts-Umverteilung is team-aggregated — no per-person assignment, no new per-person data.
- No hard cap on `zusatzStunden` — the team enters whatever is realistic, consistent with how `stunden_pro_woche_fuer_begleitung` is already unconstrained.
- `Datenbestand.umverteilungen` is **optional** (`Umverteilung[] | undefined`) so existing exported JSON files without this field remain valid; always read as `data.umverteilungen ?? []`.
- `BedarfAngebotChart` and `EngpassBericht` are NOT touched in this plan — redistribution's effect is visible via the Heatmap, Ampel-Antwort, and the target week's Auslastung number, which is enough for this iteration.
- No changes to `berechneBedarfProWoche`, `berechneAngebotProWoche`, or any existing function's signature — only additive changes (new fields, new functions).

---

### Task 1: `ermittleFerienName` helper

**Files:**
- Modify: `src/lib/kalenderwochen.ts`
- Test: `src/lib/kalenderwochen.test.ts`

**Interfaces:**
- Consumes: `FerienZeitraum` type from `./types` (existing); `startOfISOWeek`, `endOfISOWeek`, `areIntervalsOverlapping`, `parseISO` from `date-fns` (already imported in this file).
- Produces: `ermittleFerienName(wochenStartMontag: Date, ferien: FerienZeitraum[]): string | null` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

In `src/lib/kalenderwochen.test.ts`, replace the import line (line 2-10):

```ts
import {
  getISOWochenKey,
  parseZuWochenKey,
  istDatumInFerien,
  istWocheInFerien,
  alleWochenImZeitraum,
  expandiereMuster,
  berechneReiheZeitraum,
} from './kalenderwochen'
```

with:

```ts
import {
  getISOWochenKey,
  parseZuWochenKey,
  istDatumInFerien,
  istWocheInFerien,
  alleWochenImZeitraum,
  expandiereMuster,
  berechneReiheZeitraum,
  ermittleFerienName,
} from './kalenderwochen'
```

Then append a new `describe` block at the end of the file (after the closing `})` of `describe('berechneReiheZeitraum', ...)`):

```ts

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: FAIL — `ermittleFerienName is not a function` (or an import error, since the function doesn't exist yet).

- [ ] **Step 3: Implement `ermittleFerienName`**

Append this function at the end of `src/lib/kalenderwochen.ts` (after `berechneReiheZeitraum`):

```ts

export function ermittleFerienName(wochenStartMontag: Date, ferien: FerienZeitraum[]): string | null {
  const wocheInterval = { start: startOfISOWeek(wochenStartMontag), end: endOfISOWeek(wochenStartMontag) }
  const treffer = ferien.find((f) =>
    areIntervalsOverlapping(wocheInterval, { start: parseISO(f.von), end: parseISO(f.bis) }, { inclusive: true })
  )
  return treffer?.name ?? null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kalenderwochen.ts src/lib/kalenderwochen.test.ts
git commit -m "feat(berechnungstool): add ermittleFerienName helper"
```

---

### Task 2: `Umverteilung` type, `berechneZusatzangebotProWoche`, `WochenErgebnis` extension

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/berechnung.ts`
- Modify: `src/lib/berechnung.test.ts`

**Interfaces:**
- Consumes: `ermittleFerienName(wochenStartMontag: Date, ferien: FerienZeitraum[]): string | null` (Task 1).
- Produces: `Umverteilung { id: string; ferienName: string; zielWochenKey: string; zusatzStunden: number }` type; `Datenbestand.umverteilungen?: Umverteilung[]`; `berechneZusatzangebotProWoche(umverteilungen: Umverteilung[], wochenKey: string): number`; `WochenErgebnis` gains `angebotBasis: number`, `zusatzangebot: number`, `ferienName: string | null` (in addition to existing fields) — used by Task 3, Task 4, Task 5.

- [ ] **Step 1: Write the failing tests**

In `src/lib/berechnung.test.ts`, replace the import lines (lines 1-4):

```ts
import { describe, it, expect } from 'vitest'
import { berechneAufwandEinheit, berechneKoordinationWoche, berechneBedarfProWoche, berechneAngebotProWoche } from './berechnung'
import { ampelFarbe, berechneWochenuebersicht, berechneMachbarkeit } from './berechnung'
import type { Einheit, Settings, Schule, Datenbestand, Person } from './types'
```

with:

```ts
import { describe, it, expect } from 'vitest'
import { berechneAufwandEinheit, berechneKoordinationWoche, berechneBedarfProWoche, berechneAngebotProWoche } from './berechnung'
import { ampelFarbe, berechneWochenuebersicht, berechneMachbarkeit, berechneZusatzangebotProWoche } from './berechnung'
import type { Einheit, Settings, Schule, Datenbestand, Person, Umverteilung } from './types'
```

Append a new `describe` block after the `describe('ampelFarbe', ...)` block (after its closing `})`, before `describe('berechneWochenuebersicht', ...)`):

```ts

describe('berechneZusatzangebotProWoche', () => {
  it('sums zusatzStunden across all entries matching the given wochenKey', () => {
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW04', zusatzStunden: 10 },
      { id: 'u2', ferienName: 'Weihnachtsferien NRW', zielWochenKey: '2027-KW04', zusatzStunden: 5 },
      { id: 'u3', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW05', zusatzStunden: 20 },
    ]
    expect(berechneZusatzangebotProWoche(umverteilungen, '2027-KW04')).toBe(15)
  })

  it('returns 0 when no entry matches the given wochenKey', () => {
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW04', zusatzStunden: 10 },
    ]
    expect(berechneZusatzangebotProWoche(umverteilungen, '2027-KW10')).toBe(0)
  })
})
```

In the `describe('berechneWochenuebersicht', ...)` block, add a new test after the existing `'gates koordinationBedarf to 0 outside a Reihe\'s active week across a multi-week sweep'` test (after its closing `})`, before the describe block's own closing `})`):

```ts

  it('raises angebot and lowers auslastung only in the Zielwoche of an Umverteilung', () => {
    const personen: Person[] = [
      {
        id: 'p1',
        name: 'Person 1',
        stunden_pro_woche_fuer_begleitung: 8,
        aktiv_ab: '2026-09-01',
        aktiv_bis: '2027-07-16',
        abwesenheiten: [],
      },
    ]
    const schulen: Schule[] = [
      {
        id: 's1',
        name: 'Schule 1',
        reihen: [
          {
            id: 'r1',
            titel: 'x',
            betreuungsmodell: 'A',
            fahrzeit_h: 0,
            status: 'zugesagt',
            extern_betreut: false,
            einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', kontaktzeit_h: 4, erstdurchfuehrung: false })],
          },
        ],
      },
    ]
    const basisDaten: Datenbestand = {
      settings: { ...settings, planungszeitraum: { start: '2026-11-02', ende: '2026-11-16' } },
      personen,
      kalender: { ferien: [] },
      schulen,
    }

    const ohneUmverteilung = berechneWochenuebersicht(basisDaten)
    const mitUmverteilung = berechneWochenuebersicht({
      ...basisDaten,
      umverteilungen: [{ id: 'u1', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 10 }],
    })

    expect(mitUmverteilung[1].wochenKey).toBe('2026-KW46')
    expect(mitUmverteilung[1].zusatzangebot).toBe(10)
    expect(mitUmverteilung[1].angebot).toBeCloseTo(ohneUmverteilung[1].angebot + 10, 5)
    expect(mitUmverteilung[1].auslastung).toBeLessThan(ohneUmverteilung[1].auslastung)

    expect(mitUmverteilung[0].zusatzangebot).toBe(0)
    expect(mitUmverteilung[0].auslastung).toBeCloseTo(ohneUmverteilung[0].auslastung, 5)
    expect(mitUmverteilung[2].zusatzangebot).toBe(0)
    expect(mitUmverteilung[2].auslastung).toBeCloseTo(ohneUmverteilung[2].auslastung, 5)
  })
```

Finally, update the `berechneMachbarkeit` describe block's `basis` object (near the end of the file), replacing:

```ts
  const basis: import('./berechnung').WochenErgebnis = {
    wochenKey: '2026-KW01',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
  }
```

with:

```ts
  const basis: import('./berechnung').WochenErgebnis = {
    wochenKey: '2026-KW01',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    angebotBasis: 32,
    zusatzangebot: 0,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
  }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: FAIL — `berechneZusatzangebotProWoche is not a function`; the `berechneWochenuebersicht` test fails because `zusatzangebot`/`angebotBasis` are `undefined`; the `berechneMachbarkeit` tests fail to type-check against the (as yet unchanged) `WochenErgebnis` interface once the test file references the new fields (or, if Vitest's esbuild transform doesn't type-check, these specific assertions fail at runtime with `undefined` comparisons).

- [ ] **Step 3: Add the `Umverteilung` type and extend `Datenbestand`**

In `src/lib/types.ts`, replace the `Datenbestand` interface (the last block in the file):

```ts
export interface Datenbestand {
  settings: Settings
  personen: Person[]
  kalender: Kalender
  schulen: Schule[]
}
```

with:

```ts
export interface Umverteilung {
  id: string
  ferienName: string
  zielWochenKey: string
  zusatzStunden: number
}

export interface Datenbestand {
  settings: Settings
  personen: Person[]
  kalender: Kalender
  schulen: Schule[]
  umverteilungen?: Umverteilung[]
}
```

- [ ] **Step 4: Implement `berechneZusatzangebotProWoche`, extend `WochenErgebnis`, wire into `berechneWochenuebersicht`**

In `src/lib/berechnung.ts`, replace the import lines (lines 1-3):

```ts
import { eachDayOfInterval, isWeekend, endOfISOWeek, parseISO } from 'date-fns'
import { parseZuWochenKey, alleWochenImZeitraum, istWocheInFerien, getISOWochenKey, berechneReiheZeitraum } from './kalenderwochen'
import type { Einheit, Settings, Schule, Datenbestand, Person } from './types'
```

with:

```ts
import { eachDayOfInterval, isWeekend, endOfISOWeek, parseISO } from 'date-fns'
import {
  parseZuWochenKey,
  alleWochenImZeitraum,
  istWocheInFerien,
  getISOWochenKey,
  berechneReiheZeitraum,
  ermittleFerienName,
} from './kalenderwochen'
import type { Einheit, Settings, Schule, Datenbestand, Person, Umverteilung } from './types'
```

Add `berechneZusatzangebotProWoche` right after `berechneAngebotProWoche` (before `export type AmpelFarbe = ...`):

```ts

export function berechneZusatzangebotProWoche(umverteilungen: Umverteilung[], wochenKey: string): number {
  return umverteilungen.filter((u) => u.zielWochenKey === wochenKey).reduce((summe, u) => summe + u.zusatzStunden, 0)
}
```

Replace the `WochenErgebnis` interface:

```ts
export interface WochenErgebnis {
  wochenKey: string
  bedarf: number
  einsatzBedarf: number
  koordinationBedarf: number
  angebot: number
  auslastung: number
  ampel: AmpelFarbe
  istFerien: boolean
}
```

with:

```ts
export interface WochenErgebnis {
  wochenKey: string
  bedarf: number
  einsatzBedarf: number
  koordinationBedarf: number
  angebot: number
  angebotBasis: number
  zusatzangebot: number
  auslastung: number
  ampel: AmpelFarbe
  istFerien: boolean
  ferienName: string | null
}
```

Replace the body of `berechneWochenuebersicht`:

```ts
export function berechneWochenuebersicht(data: Datenbestand): WochenErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  return wochenStarts.map((montag) => {
    const wochenKey = getISOWochenKey(montag)
    const istFerien = istWocheInFerien(montag, data.kalender.ferien)
    const { einsatzBedarf, koordinationBedarf } = berechneBedarfProWoche(data, wochenKey, istFerien)
    const bedarf = einsatzBedarf + koordinationBedarf
    const angebot = berechneAngebotProWoche(data.personen, montag)
    const auslastung = angebot === 0 ? 0 : bedarf / angebot
    return {
      wochenKey,
      bedarf,
      einsatzBedarf,
      koordinationBedarf,
      angebot,
      auslastung,
      ampel: ampelFarbe(auslastung, data.settings),
      istFerien,
    }
  })
}
```

with:

```ts
export function berechneWochenuebersicht(data: Datenbestand): WochenErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  return wochenStarts.map((montag) => {
    const wochenKey = getISOWochenKey(montag)
    const istFerien = istWocheInFerien(montag, data.kalender.ferien)
    const ferienName = ermittleFerienName(montag, data.kalender.ferien)
    const { einsatzBedarf, koordinationBedarf } = berechneBedarfProWoche(data, wochenKey, istFerien)
    const bedarf = einsatzBedarf + koordinationBedarf
    const angebotBasis = berechneAngebotProWoche(data.personen, montag)
    const zusatzangebot = berechneZusatzangebotProWoche(data.umverteilungen ?? [], wochenKey)
    const angebot = angebotBasis + zusatzangebot
    const auslastung = angebot === 0 ? 0 : bedarf / angebot
    return {
      wochenKey,
      bedarf,
      einsatzBedarf,
      koordinationBedarf,
      angebot,
      angebotBasis,
      zusatzangebot,
      auslastung,
      ampel: ampelFarbe(auslastung, data.settings),
      istFerien,
      ferienName,
    }
  })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: PASS (all tests, including the new ones).

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/berechnung.ts src/lib/berechnung.test.ts
git commit -m "feat(berechnungstool): add Umverteilung type and berechneZusatzangebotProWoche"
```

---

### Task 3: Ferien-Sichtbarkeit in `WochenHeatmap`

**Files:**
- Modify: `src/components/WochenHeatmap.tsx`
- Modify: `src/components/WochenHeatmap.css`
- Test: `src/components/WochenHeatmap.test.tsx` (new)

**Interfaces:**
- Consumes: `WochenErgebnis.ferienName: string | null` (Task 2).
- Produces: no new exports — visual/tooltip change only.

- [ ] **Step 1: Write the failing tests**

Create `src/components/WochenHeatmap.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WochenHeatmap } from './WochenHeatmap'
import type { WochenErgebnis } from '../lib/berechnung'

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW46',
    bedarf: 13.26,
    einsatzBedarf: 10.4,
    koordinationBedarf: 2.9,
    angebot: 32,
    angebotBasis: 32,
    zusatzangebot: 0,
    auslastung: 0.414,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
    ...overrides,
  }
}

describe('WochenHeatmap', () => {
  it('shows the auslastung percentage in the title for a regular week', () => {
    render(<WochenHeatmap wochen={[woche()]} />)
    expect(screen.getByTitle('2026-KW46: 41%')).toBeInTheDocument()
  })

  it('shows the Ferienname instead of a percentage for a Ferienwoche', () => {
    render(
      <WochenHeatmap
        wochen={[woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW', auslastung: 0 })]}
      />
    )
    expect(screen.getByTitle('Ferien: Herbstferien NRW')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/WochenHeatmap.test.tsx`
Expected: FAIL — the current tooltip always shows `${wochenKey}: {percent}%`, so `getByTitle('Ferien: Herbstferien NRW')` finds nothing.

- [ ] **Step 3: Implement the tooltip and CSS change**

Replace the full contents of `src/components/WochenHeatmap.tsx`:

```tsx
import './WochenHeatmap.css'
import type { WochenErgebnis } from '../lib/berechnung'

export function WochenHeatmap({
  wochen,
  onWocheClick,
}: {
  wochen: WochenErgebnis[]
  onWocheClick?: (wochenKey: string) => void
}) {
  return (
    <div className="wochen-heatmap">
      {wochen.map((w) => (
        <button
          key={w.wochenKey}
          className={`wochen-heatmap-zelle ${w.istFerien ? 'ferien' : w.ampel}`}
          title={w.istFerien ? `Ferien: ${w.ferienName}` : `${w.wochenKey}: ${Math.round(w.auslastung * 100)}%`}
          onClick={() => onWocheClick?.(w.wochenKey)}
        />
      ))}
    </div>
  )
}
```

Replace the `.wochen-heatmap-zelle.ferien` rule in `src/components/WochenHeatmap.css`:

```css
.wochen-heatmap-zelle.ferien {
  background: #cccccc;
}
```

with:

```css
.wochen-heatmap-zelle.ferien {
  background: repeating-linear-gradient(45deg, #cccccc, #cccccc 4px, #e8e8e8 4px, #e8e8e8 8px);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/WochenHeatmap.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/WochenHeatmap.tsx src/components/WochenHeatmap.css src/components/WochenHeatmap.test.tsx
git commit -m "feat(berechnungstool): show Ferienname in tooltip and stripe pattern for Ferienwochen"
```

---

### Task 4: `addUmverteilung`/`removeUmverteilung` handlers

**Files:**
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`

**Interfaces:**
- Consumes: `Umverteilung` type from `../lib/types` (Task 2), existing `setData` state-setter pattern.
- Produces: `addUmverteilung(ferienName: string, zielWochenKey: string, zusatzStunden: number): void`, `removeUmverteilung(id: string): void` — both returned from `useAppData()`, consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

In `src/state/useAppData.test.ts`, add these two tests after the existing `'setEinheitFelder updates datum_oder_kw and kontaktzeit_h without touching other fields'` test (after its closing `})`, before the `'setSzenario switches the active scenario...'` test):

```ts

  it('addUmverteilung appends a new Umverteilung with the given values and leaves existing entries unchanged', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addUmverteilung('Herbstferien NRW', '2027-KW04', 10)
    })
    const umverteilungen = result.current.data.umverteilungen ?? []
    expect(umverteilungen).toHaveLength(1)
    expect(umverteilungen[0].ferienName).toBe('Herbstferien NRW')
    expect(umverteilungen[0].zielWochenKey).toBe('2027-KW04')
    expect(umverteilungen[0].zusatzStunden).toBe(10)
    act(() => {
      result.current.addUmverteilung('Weihnachtsferien NRW', '2027-KW05', 5)
    })
    const aktualisiert = result.current.data.umverteilungen ?? []
    expect(aktualisiert).toHaveLength(2)
    expect(aktualisiert[0].zielWochenKey).toBe('2027-KW04')
    expect(aktualisiert[1].zielWochenKey).toBe('2027-KW05')
  })

  it('removeUmverteilung deletes the matching entry and leaves others unchanged', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addUmverteilung('Herbstferien NRW', '2027-KW04', 10)
    })
    act(() => {
      result.current.addUmverteilung('Weihnachtsferien NRW', '2027-KW05', 5)
    })
    const zuLoeschen = (result.current.data.umverteilungen ?? [])[0]
    act(() => {
      result.current.removeUmverteilung(zuLoeschen.id)
    })
    const verbleibend = result.current.data.umverteilungen ?? []
    expect(verbleibend).toHaveLength(1)
    expect(verbleibend[0].zielWochenKey).toBe('2027-KW05')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `result.current.addUmverteilung is not a function`.

- [ ] **Step 3: Implement the handlers**

In `src/state/useAppData.ts`, add these two functions after `setEinheitFelder` (after its closing `}`, before `exportJson`):

```ts

  function addUmverteilung(ferienName: string, zielWochenKey: string, zusatzStunden: number) {
    setData((prev) => ({
      ...prev,
      umverteilungen: [
        ...(prev.umverteilungen ?? []),
        { id: `umverteilung_${Date.now()}`, ferienName, zielWochenKey, zusatzStunden },
      ],
    }))
  }

  function removeUmverteilung(id: string) {
    setData((prev) => ({
      ...prev,
      umverteilungen: (prev.umverteilungen ?? []).filter((u) => u.id !== id),
    }))
  }
```

Add both functions to the returned object (replace the `return { ... }` block):

```ts
  return {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addUmverteilung,
    removeUmverteilung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
    importError,
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts
git commit -m "feat(berechnungstool): add addUmverteilung/removeUmverteilung handlers"
```

---

### Task 5: `KapazitaetsUmverteilung` component, wired into `App.tsx`

**Files:**
- Create: `src/components/KapazitaetsUmverteilung.tsx`
- Test: `src/components/KapazitaetsUmverteilung.test.tsx` (new)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `addUmverteilung`, `removeUmverteilung` (Task 4); `WochenErgebnis`, `Umverteilung`, `FerienZeitraum` types (Task 2 / existing).
- Produces: `KapazitaetsUmverteilung` component accepting `{ umverteilungen: Umverteilung[]; ferien: FerienZeitraum[]; wochen: WochenErgebnis[]; onAdd: (ferienName: string, zielWochenKey: string, zusatzStunden: number) => void; onRemove: (id: string) => void }`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/KapazitaetsUmverteilung.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KapazitaetsUmverteilung } from './KapazitaetsUmverteilung'
import type { FerienZeitraum, Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

const ferien: FerienZeitraum[] = [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }]

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW46',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    angebotBasis: 32,
    zusatzangebot: 0,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
    ...overrides,
  }
}

const wochen: WochenErgebnis[] = [
  woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW' }),
  woche({ wochenKey: '2026-KW46' }),
]

describe('KapazitaetsUmverteilung', () => {
  it('offers only Nicht-Ferienwochen as Ziel-Woche options', () => {
    render(
      <KapazitaetsUmverteilung umverteilungen={[]} ferien={ferien} wochen={wochen} onAdd={vi.fn()} onRemove={vi.fn()} />
    )
    const zielWocheSelect = screen.getByLabelText(/Ziel-Woche/i) as HTMLSelectElement
    const optionValues = Array.from(zielWocheSelect.options).map((o) => o.value)
    expect(optionValues).toEqual(['2026-KW46'])
  })

  it('calls onAdd with the selected Ferienzeitraum, Ziel-Woche, and entered Zusatzstunden', () => {
    const onAdd = vi.fn()
    render(
      <KapazitaetsUmverteilung umverteilungen={[]} ferien={ferien} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />
    )
    fireEvent.change(screen.getByLabelText(/Zusatzstunden/i), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).toHaveBeenCalledWith('Herbstferien NRW', '2026-KW46', 10)
  })

  it('calls onRemove with the correct id when the delete button is clicked', () => {
    const onRemove = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 10 },
    ]
    render(
      <KapazitaetsUmverteilung
        umverteilungen={umverteilungen}
        ferien={ferien}
        wochen={wochen}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />
    )
    fireEvent.click(screen.getByLabelText('Umverteilung u1 löschen'))
    expect(onRemove).toHaveBeenCalledWith('u1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/KapazitaetsUmverteilung.test.tsx`
Expected: FAIL — cannot find module `./KapazitaetsUmverteilung`.

- [ ] **Step 3: Implement `KapazitaetsUmverteilung`**

Create `src/components/KapazitaetsUmverteilung.tsx`:

```tsx
import { useState } from 'react'
import type { FerienZeitraum, Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

export function KapazitaetsUmverteilung({
  umverteilungen,
  ferien,
  wochen,
  onAdd,
  onRemove,
}: {
  umverteilungen: Umverteilung[]
  ferien: FerienZeitraum[]
  wochen: WochenErgebnis[]
  onAdd: (ferienName: string, zielWochenKey: string, zusatzStunden: number) => void
  onRemove: (id: string) => void
}) {
  const zielWochen = wochen.filter((w) => !w.istFerien)
  const [ferienName, setFerienName] = useState(ferien[0]?.name ?? '')
  const [zielWochenKey, setZielWochenKey] = useState(zielWochen[0]?.wochenKey ?? '')
  const [zusatzStunden, setZusatzStunden] = useState(5)

  function hinzufuegen() {
    if (!ferienName || !zielWochenKey) return
    onAdd(ferienName, zielWochenKey, zusatzStunden)
  }

  return (
    <div>
      <h3>Kapazitäts-Umverteilung</h3>
      <label>
        Ferienzeitraum:{' '}
        <select value={ferienName} onChange={(e) => setFerienName(e.target.value)}>
          {ferien.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ziel-Woche:{' '}
        <select value={zielWochenKey} onChange={(e) => setZielWochenKey(e.target.value)}>
          {zielWochen.map((w) => (
            <option key={w.wochenKey} value={w.wochenKey}>
              {w.wochenKey}
            </option>
          ))}
        </select>
      </label>
      <label>
        Zusatzstunden:{' '}
        <input
          type="number"
          min={0}
          step={0.5}
          value={zusatzStunden}
          onChange={(e) => setZusatzStunden(Number(e.target.value))}
          style={{ width: '4rem' }}
        />
      </label>
      <button onClick={hinzufuegen}>Hinzufügen</button>
      <ul>
        {umverteilungen.map((u) => (
          <li key={u.id}>
            {u.zusatzStunden} Std aus {u.ferienName} → {u.zielWochenKey}{' '}
            <button onClick={() => onRemove(u.id)} aria-label={`Umverteilung ${u.id} löschen`}>
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/KapazitaetsUmverteilung.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Wire it into `App.tsx`**

Replace the full contents of `src/App.tsx`:

```tsx
import { useAppData } from './state/useAppData'
import { AmpelAntwort } from './components/AmpelAntwort'
import { WochenHeatmap } from './components/WochenHeatmap'
import { BedarfAngebotChart } from './components/BedarfAngebotChart'
import { SchulenAccordion } from './components/SchulenAccordion'
import { PersonenTabelle } from './components/PersonenTabelle'
import { EngpassBericht } from './components/EngpassBericht'
import { RestkapazitaetPlanner } from './components/RestkapazitaetPlanner'
import { KapazitaetsUmverteilung } from './components/KapazitaetsUmverteilung'
import { SzenarioAuswahl } from './components/SzenarioAuswahl'
import { ExportImport } from './components/ExportImport'

export default function App() {
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addUmverteilung,
    removeUmverteilung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
    importError,
  } = useAppData()

  return (
    <main style={{ maxWidth: '75rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Kapazitätsrechner Schulbegleitung</h1>
      <div className="card">
        <SzenarioAuswahl
          szenario={szenario}
          onSzenarioChange={setSzenario}
          sensitivitaet={sensitivitaet}
          onSensitivitaetChange={setSensitivitaet}
        />
      </div>
      <div className="card">
        <AmpelAntwort machbarkeit={ergebnis.machbarkeit} />
      </div>
      <div className="card">
        <WochenHeatmap wochen={ergebnis.wochen} />
      </div>
      <div className="card">
        <BedarfAngebotChart wochen={ergebnis.wochen} settings={data.settings} />
      </div>
      <div className="card">
        <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      </div>
      <h2>Schulen</h2>
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        onKoordinationChange={setSchuleKoordination}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
      />
      <div className="card">
        <PersonenTabelle personen={data.personen} onChange={setPerson} />
      </div>
      <div className="card">
        <RestkapazitaetPlanner data={data} />
      </div>
      <div className="card">
        <KapazitaetsUmverteilung
          umverteilungen={data.umverteilungen ?? []}
          ferien={data.kalender.ferien}
          wochen={ergebnis.wochen}
          onAdd={addUmverteilung}
          onRemove={removeUmverteilung}
        />
      </div>
      <div className="card">
        <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} />
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all files across the project).

- [ ] **Step 7: Run the TypeScript/build check**

Run: `npm run build`
Expected: PASS — `tsc -b` compiles cleanly and the Vite build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/KapazitaetsUmverteilung.tsx src/components/KapazitaetsUmverteilung.test.tsx src/App.tsx
git commit -m "feat(berechnungstool): add KapazitaetsUmverteilung tool and wire it into App"
```

---

## Final Verification

- [ ] Run `npx vitest run` — all tests across the project pass.
- [ ] Run `npm run build` — TypeScript compiles cleanly and the Vite build succeeds.
- [ ] Run `npm run dev`, open the app, and confirm: Ferienwochen in the Heatmap show a striped pattern and hovering shows "Ferien: <Name>"; adding a Kapazitäts-Umverteilung entry (e.g. 10h from Herbstferien NRW into a specific busy week) visibly raises that week's Angebot and lowers its Auslastung/Ampel color in the Heatmap; removing the entry reverts it.
