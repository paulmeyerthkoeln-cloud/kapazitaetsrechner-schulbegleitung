# Berechnungstool Quick Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship five independent, low-ambiguity fixes to the Berechnungstool: visible week labels on both weekly graphs, removal of the Ferien-warning, a fix for the bug where multi-Einheit topics collapse into a single week, unification of Unterrichtszeit/Koordination display to minutes, and removal of the standalone Restkapazität planner section.

**Architecture:** No changes to the calculation core (`berechnung.ts`) or data model. All changes are display-layer fixes in existing components, one bug fix in `useAppData.ts`'s `addEinheit`, one small shared-helper extraction in `kalenderwochen.ts`, and deletion of dead/unused code (`ferienWarnung.ts`, `RestkapazitaetPlanner.tsx`, `restkapazitaet.ts`).

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react, date-fns, recharts.

## Global Constraints

- Repo root is `/Users/PaulJ/Documents/Ideaalwerk`; this project's own spec/plan docs live under `Berechnungstool/docs/superpowers/`, not the repo-root `docs/`.
- Run all commands from `/Users/PaulJ/Documents/Ideaalwerk/Berechnungstool`.
- Test with `npm test` (vitest run), typecheck+build with `npm run build` (`tsc -b && vite build`).
- Spec: `docs/superpowers/specs/2026-07-07-berechnungstool-quick-fixes-design.md`.

---

### Task 1: Extract shared `kwNummer` helper into `kalenderwochen.ts`

**Files:**
- Modify: `src/lib/kalenderwochen.ts`
- Modify: `src/lib/kalenderwochen.test.ts`
- Modify: `src/components/ThemenUebersicht.tsx:1-21`
- Test: `src/lib/kalenderwochen.test.ts`

**Interfaces:**
- Produces: `export function kwNummer(wochenKey: string): string` in `src/lib/kalenderwochen.ts` — extracts the two-digit week number from a `"YYYY-KWnn"` key, returning the input unchanged if it doesn't match. Used by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

In `src/lib/kalenderwochen.test.ts`, change the first import (currently `import { getISOWochenKey, parseZuWochenKey, istDatumInFerien, istWocheInFerien, alleWochenImZeitraum, expandiereMuster, berechneReiheZeitraum, ermittleFerienName, formatWochenspanne, generiereWochentlicheTermine } from './kalenderwochen'`) to:

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
  formatWochenspanne,
  generiereWochentlicheTermine,
  kwNummer,
} from './kalenderwochen'
```

Then add this new `describe` block after `describe('getISOWochenKey', ...)`:

```ts
describe('kwNummer', () => {
  it('extracts the week number from a KW key', () => {
    expect(kwNummer('2026-KW46')).toBe('46')
  })

  it('returns the input unchanged when it is not a valid KW key', () => {
    expect(kwNummer('nicht-ein-schluessel')).toBe('nicht-ein-schluessel')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- kalenderwochen`
Expected: FAIL — `kwNummer` is not exported from `./kalenderwochen`.

- [ ] **Step 3: Implement `kwNummer` in `kalenderwochen.ts`**

Add this function right after the existing `parseZuWochenKey` function (which already uses the module-level `KW_REGEX = /^(\d{4})-KW(\d{2})$/` defined at the top of the file):

```ts
export function kwNummer(wochenKey: string): string {
  const treffer = KW_REGEX.exec(wochenKey)
  return treffer ? treffer[2] : wochenKey
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- kalenderwochen`
Expected: PASS

- [ ] **Step 5: Replace the private copy in `ThemenUebersicht.tsx` with the shared import**

In `src/components/ThemenUebersicht.tsx`, change the import on line 2 from:

```ts
import { formatWochenspanne } from '../lib/kalenderwochen'
```

to:

```ts
import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
```

Then delete the now-redundant private function (lines 18-21):

```ts
function kwNummer(wochenKey: string): string {
  const treffer = /^\d{4}-KW(\d{2})$/.exec(wochenKey)
  return treffer ? treffer[1] : wochenKey
}
```

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: all tests PASS (in particular `ThemenUebersicht.test.tsx`, unaffected by this refactor).

- [ ] **Step 7: Commit**

```bash
git add src/lib/kalenderwochen.ts src/lib/kalenderwochen.test.ts src/components/ThemenUebersicht.tsx
git commit -m "refactor(berechnungstool): extract shared kwNummer helper into kalenderwochen.ts"
```

---

### Task 2: Show the KW number under each WochenHeatmap square

**Files:**
- Modify: `src/components/WochenHeatmap.tsx`
- Modify: `src/components/WochenHeatmap.css`
- Test: `src/components/WochenHeatmap.test.tsx`

**Interfaces:**
- Consumes: `kwNummer` from `src/lib/kalenderwochen.ts` (Task 1).

- [ ] **Step 1: Write the failing test**

Add to `src/components/WochenHeatmap.test.tsx`, inside the existing `describe('WochenHeatmap', ...)` block:

```tsx
  it('shows the KW number as a label under each square', () => {
    render(<WochenHeatmap wochen={[woche()]} />)
    expect(screen.getByText('46')).toBeInTheDocument()
  })
```

(The default `woche()` fixture already uses `wochenKey: '2026-KW46'`, so `'46'` is the expected label.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- WochenHeatmap`
Expected: FAIL — no element with text `'46'` is rendered.

- [ ] **Step 3: Update the component to render a label under each square**

Replace the full contents of `src/components/WochenHeatmap.tsx` with:

```tsx
import './WochenHeatmap.css'
import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'

export function WochenHeatmap({
  wochen,
  onWocheClick,
}: {
  wochen: WochenErgebnis[]
  onWocheClick?: (wochenKey: string) => void
}) {
  return (
    <div>
      <div className="wochen-heatmap-legende" aria-label="Legende Kapazitätsampel">
        <span><i className="wochen-legende-farbe gruen" /> Grün: unkritisch</span>
        <span><i className="wochen-legende-farbe gelb" /> Gelb: Warnung</span>
        <span><i className="wochen-legende-farbe rot" /> Rot: Problemwoche</span>
        <span><i className="wochen-legende-farbe ferien" /> Ferien</span>
      </div>
      <div className="wochen-heatmap">
        {wochen.map((w) => (
          <div className="wochen-heatmap-zelle-wrapper" key={w.wochenKey}>
            <button
              className={`wochen-heatmap-zelle ${w.istFerien ? 'ferien' : w.ampel}`}
              title={
                w.istFerien
                  ? `Ferien: ${w.ferienName}`
                  : `${formatWochenspanne(w.wochenKey)}: ${Math.round(w.auslastung * 100)}% Auslastung, ${Math.round(w.bedarf * 10) / 10}h Bedarf bei ${Math.round(w.angebot * 10) / 10}h Angebot`
              }
              aria-label={
                w.istFerien
                  ? `${formatWochenspanne(w.wochenKey)} Ferien ${w.ferienName}`
                  : `${formatWochenspanne(w.wochenKey)} ${w.ampel}, ${Math.round(w.auslastung * 100)} Prozent Auslastung`
              }
              onClick={() => onWocheClick?.(w.wochenKey)}
            />
            <span className="wochen-heatmap-kw">{kwNummer(w.wochenKey)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update the CSS for the wrapper/label**

Replace the `.wochen-heatmap` and `.wochen-heatmap-zelle` rules in `src/components/WochenHeatmap.css` (currently lines 22-35):

```css
.wochen-heatmap {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1.75rem;
  gap: 2px;
  overflow-x: auto;
  padding: 0.5rem 0;
}

.wochen-heatmap-zelle-wrapper {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.wochen-heatmap-zelle {
  height: 1.75rem;
  cursor: pointer;
  border: none;
}

.wochen-heatmap-kw {
  font-size: 0.65rem;
  text-align: center;
  color: #555;
  margin-top: 0.15rem;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- WochenHeatmap`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/WochenHeatmap.tsx src/components/WochenHeatmap.css src/components/WochenHeatmap.test.tsx
git commit -m "feat(berechnungstool): show the KW number under each WochenHeatmap square"
```

---

### Task 3: Show a visible, angled KW x-axis on BedarfAngebotChart

**Files:**
- Modify: `src/components/BedarfAngebotChart.tsx`

**Interfaces:**
- Consumes: `kwNummer` from `src/lib/kalenderwochen.ts` (Task 1).

No automated render test is added for this component: it renders inside recharts' `ResponsiveContainer`, which needs real layout dimensions (width/height) that jsdom does not provide — no test currently exists for this component for that reason, and none of the recharts-based components in this codebase are tested that way. Verification is manual (Task 8).

- [ ] **Step 1: Update the chart to show angled KW labels on the x-axis**

Replace the full contents of `src/components/BedarfAngebotChart.tsx` with:

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatWochenspanne, kwNummer } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'

export function BedarfAngebotChart({ wochen }: { wochen: WochenErgebnis[] }) {
  const chartData = wochen.map((w) => ({
    wochenKey: w.wochenKey,
    Unterrichtszeit: Number(w.einsatzBedarf.toFixed(2)),
    Koordination: Number(w.koordinationBedarf.toFixed(2)),
    Angebot: Number(w.angebot.toFixed(2)),
    'Ferien-Abzug': Number(w.abgezogenesFerienangebot.toFixed(2)),
  }))

  return (
    <div>
      <div className="chart-legende" aria-label="Legende Bedarf und Angebot">
        <span><i style={{ background: '#a5d6a7' }} /> Angebot nach Ferien-Abzug und Umverteilung</span>
        <span><i style={{ background: '#1976d2' }} /> Unterrichtszeit inkl. Vorbereitung/Fahrt</span>
        <span><i style={{ background: '#64b5f6' }} /> Koordination je Termin/KW</span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={chartData} margin={{ bottom: 20 }}>
          <XAxis
            dataKey="wochenKey"
            tickFormatter={kwNummer}
            angle={-45}
            textAnchor="end"
            height={50}
            interval={0}
            tick={{ fontSize: 11 }}
          />
          <YAxis />
          <Tooltip labelFormatter={(label) => formatWochenspanne(String(label))} />
          <Bar dataKey="Angebot" fill="#a5d6a7" />
          <Bar dataKey="Unterrichtszeit" stackId="bedarf" fill="#1976d2" />
          <Bar dataKey="Koordination" stackId="bedarf" fill="#64b5f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

(`height={340}` on `ResponsiveContainer`, up from 300, gives the taller x-axis room without squeezing the bars; `interval={0}` forces every week's tick to render rather than recharts thinning them out.)

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: all tests PASS (no test exercises this file directly).

- [ ] **Step 3: Commit**

```bash
git add src/components/BedarfAngebotChart.tsx
git commit -m "feat(berechnungstool): show angled KW labels on the BedarfAngebotChart x-axis"
```

---

### Task 4: Remove the Ferien-warning feature from Themenübersicht

**Files:**
- Modify: `src/components/ThemenUebersicht.tsx`
- Modify: `src/components/ThemenUebersicht.css`
- Modify: `src/components/ThemenUebersicht.test.tsx`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`
- Delete: `src/lib/ferienWarnung.ts`
- Delete: `src/lib/ferienWarnung.test.ts`

**Interfaces:**
- Removes: the `ferienWarnungen` prop from `ThemenUebersicht`, and the `ferienWarnungen` field from the object returned by `useAppData()`. No other task/file depends on either.

- [ ] **Step 1: Remove the warning block and prop from `ThemenUebersicht.tsx`**

Remove the `FerienWarnung` type import (line 5):

```ts
import type { FerienWarnung } from '../lib/ferienWarnung'
```

Remove `ferienWarnungen` from the props destructuring/type (currently lines 23-31):

```tsx
export function ThemenUebersicht({
  zeilen,
  wochen,
  ferienWarnungen,
}: {
  zeilen: ThemenGanttZeile[]
  wochen: WochenErgebnis[]
  ferienWarnungen: FerienWarnung[]
}) {
```

becomes:

```tsx
export function ThemenUebersicht({
  zeilen,
  wochen,
}: {
  zeilen: ThemenGanttZeile[]
  wochen: WochenErgebnis[]
}) {
```

Remove the warning block (currently lines 48-60):

```tsx
      {ferienWarnungen.length > 0 && (
        <div className="themen-warnung">
          ⚠️ {ferienWarnungen.length} Termin{ferienWarnungen.length === 1 ? '' : 'e'}{' '}
          {ferienWarnungen.length === 1 ? 'liegt' : 'liegen'} in den Ferien:
          <ul>
            {ferienWarnungen.map((w, i) => (
              <li key={i}>
                {w.schule} – {w.reiheTitel}, Termin {w.einheitIndex} ({w.datumOderKw}, {w.ferienName})
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 2: Remove the now-unused `.themen-warnung` CSS**

Delete lines 1-14 of `src/components/ThemenUebersicht.css`:

```css
.themen-warnung {
  background: #fff3cd;
  border: 1px solid #e1a100;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.themen-warnung ul {
  margin: 0.25rem 0 0;
  padding-left: 1.25rem;
}

```

- [ ] **Step 3: Update `ThemenUebersicht.test.tsx`**

Remove the `FerienWarnung` type import (line 5) and drop `ferienWarnungen={[]}` / `ferienWarnungen={ferienWarnungen}` from every `render(<ThemenUebersicht .../>)` call, and delete the three warning-specific tests. The full new file:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemenUebersicht } from './ThemenUebersicht'
import type { ThemenGanttZeile } from '../lib/themenUebersicht'
import type { WochenErgebnis } from '../lib/berechnung'

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW37',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    angebotBasis: 32,
    zusatzangebot: 0,
    abgezogenesFerienangebot: 0,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
    ferienName: null,
    ...overrides,
  }
}

const wochen: WochenErgebnis[] = [
  woche({ wochenKey: '2026-KW37' }),
  woche({ wochenKey: '2026-KW38' }),
  woche({ wochenKey: '2026-KW39', istFerien: true, ferienName: 'Herbstferien NRW' }),
]

const zeilen: ThemenGanttZeile[] = [
  {
    reiheId: 'r1',
    zeilenLabel: 'Else Lasker – Parisa',
    balkenLabel: 'Mobilität',
    thema: 'Mobilität',
    startWochenKey: '2026-KW37',
    endWochenKey: '2026-KW38',
    stunden: 3,
  },
]

describe('ThemenUebersicht', () => {
  it('shows a placeholder message when there are no Zeilen', () => {
    render(<ThemenUebersicht zeilen={[]} wochen={wochen} />)
    expect(screen.getByText(/Keine Einheiten/)).toBeInTheDocument()
  })

  it('renders the Zeilen-Label and the Thema as balkenLabel on the chart', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} />)
    expect(screen.getByText('Else Lasker – Parisa')).toBeInTheDocument()
    expect(screen.getByText('Mobilität')).toBeInTheDocument()
  })

  it('marks a Ferienwoche with a titled band', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} />)
    expect(screen.getByTitle('Herbstferien NRW')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the ThemenUebersicht tests**

Run: `npm test -- ThemenUebersicht`
Expected: PASS

- [ ] **Step 5: Remove `findeEinheitenInFerien` from `useAppData.ts`**

Remove the import (line 6):

```ts
import { findeEinheitenInFerien } from '../lib/ferienWarnung'
```

Remove the `ferienWarnungen` computation (currently line 234):

```ts
  const ferienWarnungen = useMemo(() => findeEinheitenInFerien(data, ergebnis.wochen), [data, ergebnis.wochen])
```

Remove `ferienWarnungen` from the returned object (currently line 239):

```ts
    ferienWarnungen,
```

- [ ] **Step 6: Remove the `ferienWarnungen` test from `useAppData.test.ts`**

Delete this test (currently lines 263-266):

```ts
  it('exposes ferienWarnungen derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.ferienWarnungen)).toBe(true)
  })

```

- [ ] **Step 7: Update `App.tsx`**

Remove `ferienWarnungen` from the destructured hook result (currently line 29):

```ts
    ferienWarnungen,
```

Update the `ThemenUebersicht` render call (currently line 55) from:

```tsx
        <ThemenUebersicht zeilen={themenGanttZeilen} wochen={ergebnis.wochen} ferienWarnungen={ferienWarnungen} />
```

to:

```tsx
        <ThemenUebersicht zeilen={themenGanttZeilen} wochen={ergebnis.wochen} />
```

- [ ] **Step 8: Delete the now-unused `ferienWarnung` lib files**

```bash
rm src/lib/ferienWarnung.ts src/lib/ferienWarnung.test.ts
```

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds with no TypeScript errors (confirms no dangling references to `FerienWarnung`/`findeEinheitenInFerien`/`ferienWarnungen`).

- [ ] **Step 10: Commit**

```bash
git add -A src/components/ThemenUebersicht.tsx src/components/ThemenUebersicht.css src/components/ThemenUebersicht.test.tsx src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx src/lib/ferienWarnung.ts src/lib/ferienWarnung.test.ts
git commit -m "feat(berechnungstool): remove the Ferien-in-Terminen warning from Themenübersicht"
```

---

### Task 5: Fix `addEinheit` so new Einheiten land in the next consecutive week

**Files:**
- Modify: `src/lib/kalenderwochen.ts`
- Modify: `src/lib/kalenderwochen.test.ts`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`

**Interfaces:**
- Produces: `export function naechstesEinheitDatum(einheiten: Einheit[]): string` in `src/lib/kalenderwochen.ts` — returns today's date (`yyyy-MM-dd`) when `einheiten` is empty, otherwise the Monday of the week after the latest existing Einheit's week, formatted `yyyy-MM-dd`.
- Consumes (in `useAppData.ts`): the `Einheit[]` array of the target Reihe, in place of `format(new Date(), 'yyyy-MM-dd')`.

- [ ] **Step 1: Write the failing test**

In `src/lib/kalenderwochen.test.ts`, add `naechstesEinheitDatum` to the import from `'./kalenderwochen'` added in Task 1 (append it after `kwNummer,`), and change the type import from:

```ts
import type { FerienZeitraum, Muster, Reihe } from './types'
```

to:

```ts
import type { Einheit, FerienZeitraum, Muster, Reihe } from './types'
```

Add a new import line for `format` (not otherwise imported in this test file):

```ts
import { format } from 'date-fns'
```

Then add this new `describe` block after `describe('generiereWochentlicheTermine', ...)`:

```ts
describe('naechstesEinheitDatum', () => {
  function einheit(datumOderKw: string): Einheit {
    return {
      id: 'x',
      index: 1,
      datum_oder_kw: datumOderKw,
      kontaktzeit_h: 1,
      personen_parallel: 1,
      erstdurchfuehrung: false,
      wir_begleiten: true,
      typ: 'regulaer',
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- kalenderwochen`
Expected: FAIL — `naechstesEinheitDatum` is not exported from `./kalenderwochen`.

- [ ] **Step 3: Implement `naechstesEinheitDatum`**

Add this function at the end of `src/lib/kalenderwochen.ts` (it uses `parseZuWochenKey`, `KW_REGEX`, `setISOWeek`, `setISOWeekYear`, `startOfISOWeek`, `addWeeks`, `format`, all already imported/defined in this file):

```ts
export function naechstesEinheitDatum(einheiten: Einheit[]): string {
  if (einheiten.length === 0) return format(new Date(), 'yyyy-MM-dd')
  const wochenKeys = einheiten.map((e) => parseZuWochenKey(e.datum_oder_kw))
  const groesstesKey = wochenKeys.reduce((groesstes, key) => (key > groesstes ? key : groesstes))
  const [, jahrStr, wocheStr] = KW_REGEX.exec(groesstesKey)!
  const referenz = setISOWeek(setISOWeekYear(new Date(), Number(jahrStr)), Number(wocheStr))
  const montag = startOfISOWeek(referenz)
  return format(addWeeks(montag, 1), 'yyyy-MM-dd')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- kalenderwochen`
Expected: PASS

- [ ] **Step 5: Write the failing test for `useAppData`'s `addEinheit`**

Add to `src/state/useAppData.test.ts`, directly after the existing `'addEinheit appends a new Einheit with default values and the correct index'` test:

```ts
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- useAppData`
Expected: FAIL — the new Einheit's `datum_oder_kw` is today's date, not `'2026-12-21'`.

- [ ] **Step 7: Fix `addEinheit` in `useAppData.ts`**

Change the import on line 7 from:

```ts
import { alleWochenImZeitraum, ermittleFerienName, getISOWochenKey } from '../lib/kalenderwochen'
```

to:

```ts
import { alleWochenImZeitraum, ermittleFerienName, getISOWochenKey, naechstesEinheitDatum } from '../lib/kalenderwochen'
```

Remove the now-unused `format` import (line 2, only other use was the line being replaced below):

```ts
import { format } from 'date-fns'
```

In `addEinheit` (currently lines 111-133), change:

```ts
          const neueEinheit: Einheit = {
            id: `${reihe.id}_neu_${Date.now()}`,
            index: reihe.einheiten.length + 1,
            datum_oder_kw: format(new Date(), 'yyyy-MM-dd'),
            kontaktzeit_h: 1.5,
```

to:

```ts
          const neueEinheit: Einheit = {
            id: `${reihe.id}_neu_${Date.now()}`,
            index: reihe.einheiten.length + 1,
            datum_oder_kw: naechstesEinheitDatum(reihe.einheiten),
            kontaktzeit_h: 1.5,
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- useAppData`
Expected: PASS

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/kalenderwochen.ts src/lib/kalenderwochen.test.ts src/state/useAppData.ts src/state/useAppData.test.ts
git commit -m "fix(berechnungstool): place new Einheiten in the week after the Reihe's latest, not always today"
```

---

### Task 6: Unify the Koordination input to minutes in ReihenEditor

**Files:**
- Modify: `src/components/ReihenEditor.tsx:126-167`
- Modify: `src/components/ReihenEditor.test.tsx`

**Interfaces:**
- No change to `onEinheitFelderChange`'s signature — it already accepts `{ koordinationszeit_h?: number }` in hours; only the displayed/edited unit changes.

- [ ] **Step 1: Write the failing tests**

Update the existing coordination test in `src/components/ReihenEditor.test.tsx` (currently lines 110-115) from:

```tsx
  it('calls onEinheitFelderChange with coordination hours when the coordination field changes', () => {
    const props = renderReihenEditor()
    const koordinationszeit = screen.getByLabelText('Koordinationszeit für Termin 1 in Testreihe')
    fireEvent.change(koordinationszeit, { target: { value: '1.25' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { koordinationszeit_h: 1.25 })
  })
```

to:

```tsx
  it('shows Koordination in minutes, converted from the stored hours', () => {
    renderReihenEditor()
    const koordinationE1 = screen.getByLabelText('Koordinationszeit für Termin 1 in Testreihe') as HTMLInputElement
    const koordinationE2 = screen.getByLabelText('Koordinationszeit für Termin 2 in Testreihe') as HTMLInputElement
    expect(koordinationE1.value).toBe('30')
    expect(koordinationE2.value).toBe('0')
  })

  it('calls onEinheitFelderChange with koordinationszeit_h in hours when the minutes input changes', () => {
    const props = renderReihenEditor()
    const koordinationszeit = screen.getByLabelText('Koordinationszeit für Termin 1 in Testreihe')
    fireEvent.change(koordinationszeit, { target: { value: '75' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { koordinationszeit_h: 1.25 })
  })

  it('labels the Koordination column in minutes', () => {
    renderReihenEditor()
    expect(screen.getByText('Koordination (min)')).toBeInTheDocument()
  })
```

(`e1` has `koordinationszeit_h: 0.5` in the fixture at the top of this test file → `30` minutes; `e2` has no `koordinationszeit_h` → defaults to `0`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ReihenEditor`
Expected: FAIL — the Koordination input currently displays `0.5` (hours) not `30` (minutes), and there's no `'Koordination (min)'` text.

- [ ] **Step 3: Update the header label and input**

In `src/components/ReihenEditor.tsx`, change the header (currently line 128):

```tsx
            <th>Koordination h/KW</th>
```

to:

```tsx
            <th>Koordination (min)</th>
```

Change the Koordination input cell (currently lines 157-167) from:

```tsx
              <td>
                <input
                  type="number"
                  step={0.25}
                  min={0}
                  aria-label={`Koordinationszeit für Termin ${e.index} in ${reihe.titel}`}
                  value={e.koordinationszeit_h ?? 0}
                  onChange={(ev) => onEinheitFelderChange(e.id, { koordinationszeit_h: Number(ev.target.value) })}
                  style={{ width: '5rem' }}
                />
              </td>
```

to:

```tsx
              <td>
                <input
                  type="number"
                  step={5}
                  min={0}
                  aria-label={`Koordinationszeit für Termin ${e.index} in ${reihe.titel}`}
                  value={Math.round((e.koordinationszeit_h ?? 0) * 60)}
                  onChange={(ev) => onEinheitFelderChange(e.id, { koordinationszeit_h: Number(ev.target.value) / 60 })}
                  style={{ width: '5rem' }}
                />
              </td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ReihenEditor`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx
git commit -m "fix(berechnungstool): display Koordination in minutes to match Unterrichtszeit's unit"
```

---

### Task 7: Remove the "Restkapazität für die 10. Schule" section

**Files:**
- Delete: `src/components/RestkapazitaetPlanner.tsx`
- Delete: `src/lib/restkapazitaet.ts`
- Delete: `src/lib/restkapazitaet.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- None — `RestkapazitaetPlanner`, `pruefeStartmonate`, `PlatzhalterKonfiguration`, and `StartmonatErgebnis` are used only within these three files (confirmed via repo-wide grep); nothing else references them.

- [ ] **Step 1: Delete the planner component and its lib code/tests**

```bash
rm src/components/RestkapazitaetPlanner.tsx src/lib/restkapazitaet.ts src/lib/restkapazitaet.test.ts
```

- [ ] **Step 2: Remove the import and render call from `App.tsx`**

Remove the import (currently line 9):

```ts
import { RestkapazitaetPlanner } from './components/RestkapazitaetPlanner'
```

Remove the render block (currently lines 69-71):

```tsx
      <div className="card">
        <RestkapazitaetPlanner data={data} />
      </div>
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds with no TypeScript errors (confirms nothing else imports the deleted files).

- [ ] **Step 4: Commit**

```bash
git add -A src/components/RestkapazitaetPlanner.tsx src/lib/restkapazitaet.ts src/lib/restkapazitaet.test.ts src/App.tsx
git commit -m "chore(berechnungstool): remove the standalone Restkapazität-für-die-10.-Schule planner"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all tests PASS, zero failures.

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`, open the printed local URL, and confirm:
- The WochenHeatmap (first graph, squares) shows a KW number under every square.
- The BedarfAngebotChart (second graph, bars) shows angled KW labels along its x-axis.
- The Themen-Übersicht no longer shows any "⚠️ ... liegen in den Ferien" warning.
- Adding 4 Termine to a Reihe via "+ Termin hinzufügen" and assigning the same Thema to each produces 4 consecutive weeks (spot-check against the WDG school used in the tests), rendering as one contiguous bar in the Themen-Übersicht Gantt instead of collapsing into a single week.
- In the Schulen accordion, both "Unterrichtszeit (min)" and "Koordination (min)" columns are minute-based.
- The "Restkapazität für die 10. Schule" section is gone from the page.

Stop the dev server afterward.
