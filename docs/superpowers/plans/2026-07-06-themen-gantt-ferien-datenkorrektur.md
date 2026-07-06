# Themen-Gantt, Ferien-Kappung, Ferien-Warnung & Datenkorrekturen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three wrong Unterrichtszeit values in the seed data, make the Schnelleinrichtung's time suggestion smarter, cap Ferien-capacity redistribution per source week, warn when a Termin lands in the Ferien, and replace the Themen-Übersicht's stacked-hours chart with a Gantt-style calendar (rows = Schulen/Kurse, columns = KWs, bars = Themen-Zeiträume).

**Architecture:** Additive changes to the existing pure-function pipeline (`src/lib`) and its React consumers (`src/components`, `src/state/useAppData.ts`), following the codebase's established pattern (pure calculation functions tested with Vitest, thin React components on top). The Gantt chart is **not** built with `recharts` — unlike the older stacked-bar chart it replaces, it's a plain CSS Grid (rows/columns via `grid-template-rows`/`grid-template-columns`, bars as absolutely-placed grid items) with native `title` attributes for hover info, mirroring the existing `WochenHeatmap.tsx` convention exactly. This is a deliberate deviation from the illustrative recharts wording in the design spec — chosen because recharts requires real layout measurements that don't work reliably in the `jsdom` test environment (the project already avoids testing `BedarfAngebotChart`'s recharts internals for the same reason), while a CSS Grid renders real, assertable DOM nodes in tests, same as `WochenHeatmap` already does today.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, date-fns.

## Global Constraints

- `Reihe.terminstatus === 'offen'` Reihen stay excluded from every new calculation (Themen-Gantt, Ferien-Warnung still checks them, see Task 4) — consistent with the existing `berechneBedarfProWoche`/`berechneThemenUebersicht` filter.
- `kontaktzeit_h` keeps its internal name everywhere; only the seed **values** change in Task 1, never a field name or UI label.
- `Umverteilung.quelleWochenKey` is a **required** field (not optional) — every code path that constructs an `Umverteilung` must supply it, and old persisted/exported data missing it is migrated on load (never left `undefined`), matching how `Reihe.terminstatus` was introduced.
- macOS (`darwin`) BSD `sed` is used for the mechanical, uniform text substitutions in this plan (`sed -i ''`, not GNU `sed -i`). Where `-E` (extended regex) is used, it's noted explicitly.
- No new dependency is added — the Gantt chart uses plain CSS Grid + native DOM, not a new charting library.
- Run `npm run test` (equivalent to `npx vitest run`) and `npm run build` (`tsc -b && vite build`) at the end of every task; both must pass before committing.

---

### Task 1: Seed-Daten-Korrekturen

**Files:**
- Modify: `src/data/data.json`
- Modify: `src/data/data.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: corrected `kontaktzeit_h` values in the seed data — used implicitly by every later task that reads real seed data (none do directly; this task is self-contained).

- [ ] **Step 1: Write the failing tests**

In `src/data/data.test.ts`, append these tests inside the `describe('seed data.json', ...)` block, after the last existing `it` (before the block's closing `})`):

```ts

  it('sets Alexander-Coppel Unterrichtszeit to exactly 65 minutes per Termin', () => {
    const d = data as Datenbestand
    const coppel = d.schulen.find((s) => s.id === 'alexander_coppel')!
    expect(coppel.reihen[0].einheiten.every((e) => Math.round(e.kontaktzeit_h * 60) === 65)).toBe(true)
  })

  it('sets every Else-Lasker Termin (including the Exkursionen) to 90 minutes Unterrichtszeit', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    for (const reihe of elseLasker.reihen) {
      expect(reihe.einheiten.every((e) => e.kontaktzeit_h === 1.5)).toBe(true)
    }
  })

  it('leaves the Exkursions-Organisationspauschale at Else Lasker unchanged', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    const parisa = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_parisa')!
    const simone = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_simone')!
    expect(parisa.einheiten.find((e) => e.id === 'el_parisa_e3')?.organisationspauschale_h).toBe(2)
    expect(simone.einheiten.find((e) => e.id === 'el_simone_e4')?.organisationspauschale_h).toBe(2)
  })

  it('leaves WDG Unterrichtszeit at 4 Stunden per Termin', () => {
    const d = data as Datenbestand
    const wdg = d.schulen.find((s) => s.id === 'wdg')!
    expect(wdg.reihen[0].einheiten.every((e) => e.kontaktzeit_h === 4)).toBe(true)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/data.test.ts`
Expected: FAIL — Coppel is still at 66 minutes (`1.1`), Else Lasker is still at 120/240 minutes (`2`/`4`).

- [ ] **Step 3: Fix Alexander-Coppel (all 10 Termine, `1.1` → 65 minutes)**

`"kontaktzeit_h": 1.1` appears exactly 10 times in `data.json`, all on the `coppel_e1`–`coppel_e10` lines (verified — no other Reihe uses `1.1`). Run:

```bash
sed -i '' 's/"kontaktzeit_h": 1.1,/"kontaktzeit_h": 1.0833333333333333,/g' src/data/data.json
```

`1.0833333333333333` is `65/60`; the UI's `Math.round(kontaktzeit_h * 60)` display then shows exactly `65`.

- [ ] **Step 4: Fix Else-Lasker regular Termine (`2` → `1.5`)**

`"kontaktzeit_h": 2,` appears exactly 16 times in `data.json`, all across `el_parisa_e1`, `el_parisa_e2`, `el_parisa_e4`, `el_simone_e1`, `el_simone_e2`, `el_simone_e3`, `el_simone_e5`, `el_simone_e6`, and `el_olaf_e1`–`el_olaf_e8` (verified — no other Reihe uses `2`). Run:

```bash
sed -i '' 's/"kontaktzeit_h": 2,/"kontaktzeit_h": 1.5,/g' src/data/data.json
```

- [ ] **Step 5: Fix the two Else-Lasker Exkursionen (`4` → `1.5`, WDG's `4` must stay untouched)**

`"kontaktzeit_h": 4,` appears 6 times: 4 belong to WDG (`wdg_e1`–`wdg_e4`, must stay at 4 Std.) and 2 belong to the Else-Lasker Exkursionen `el_parisa_e3` and `el_simone_e4` (must become `1.5`). Target only those two lines by anchoring on their unique `id`:

```bash
sed -i '' 's/"id": "el_parisa_e3", \(.*\)"kontaktzeit_h": 4,/"id": "el_parisa_e3", \1"kontaktzeit_h": 1.5,/' src/data/data.json
sed -i '' 's/"id": "el_simone_e4", \(.*\)"kontaktzeit_h": 4,/"id": "el_simone_e4", \1"kontaktzeit_h": 1.5,/' src/data/data.json
```

- [ ] **Step 6: Verify the diff touches exactly the expected 28 lines**

Run: `git diff --stat src/data/data.json`
Expected: `1 file changed, 28 insertions(+), 28 deletions(-)` (10 Coppel + 16 Else-Lasker regular + 2 Else-Lasker Exkursion).

Run: `grep -c '"kontaktzeit_h": 1.0833333333333333' src/data/data.json` → expect `10`.
Run: `grep -c '"kontaktzeit_h": 1.5' src/data/data.json` → expect at least `18` more than before (16 + 2 new, plus the pre-existing Max-Planck/Sedanstraße/Kothen/SchuleX Reihen that already used `1.5`).
Run: `grep -c '"kontaktzeit_h": 4,' src/data/data.json` → expect `4` (only WDG left).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/data/data.test.ts`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 8: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/data/data.json src/data/data.test.ts
git commit -m "fix(berechnungstool): correct Unterrichtszeit for Alexander-Coppel and Else Lasker"
```

---

### Task 2: Schnelleinrichtung — smarter Unterrichtszeit-Vorschlag

**Files:**
- Modify: `src/lib/besetzung.ts`
- Modify: `src/lib/besetzung.test.ts`
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/components/ReihenEditor.test.tsx`

**Interfaces:**
- Produces: `ermittleHaeufigsteKontaktzeit(einheiten: Einheit[]): number | null` — used only by `ReihenEditor.tsx` in this task.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/lib/besetzung.test.ts`, append this new `describe` block at the end of the file:

```ts

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
```

And update the import line at the top of the file:

```ts
import { wendeBesetzungPreset, berechneUnserAnteil } from './besetzung'
```

becomes:

```ts
import { wendeBesetzungPreset, berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from './besetzung'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/besetzung.test.ts`
Expected: FAIL — `ermittleHaeufigsteKontaktzeit is not a function` (or an import error).

- [ ] **Step 3: Implement `ermittleHaeufigsteKontaktzeit`**

In `src/lib/besetzung.ts`, append at the end of the file:

```ts

export function ermittleHaeufigsteKontaktzeit(einheiten: Einheit[]): number | null {
  if (einheiten.length === 0) return null
  const haeufigkeiten = new Map<number, number>()
  for (const e of einheiten) {
    haeufigkeiten.set(e.kontaktzeit_h, (haeufigkeiten.get(e.kontaktzeit_h) ?? 0) + 1)
  }
  let bestesKontaktzeitH = einheiten[0].kontaktzeit_h
  let besteAnzahl = 0
  for (const [kontaktzeitH, anzahl] of haeufigkeiten) {
    if (anzahl > besteAnzahl) {
      besteAnzahl = anzahl
      bestesKontaktzeitH = kontaktzeitH
    }
  }
  return bestesKontaktzeitH
}
```

(`Map` iterates in insertion order, so on a tie the first-encountered value wins because a later value needs a strictly higher count to replace it.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/besetzung.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Write the failing ReihenEditor tests**

In `src/components/ReihenEditor.test.tsx`, append these tests inside the `describe('ReihenEditor', ...)` block, after the last existing `it` (before the block's closing `})`):

```ts

  it('defaults the Schnelleinrichtung Unterrichtszeit to the most common existing Kontaktzeit, in minutes', () => {
    const wdgAehnlicheReihe: Reihe = {
      ...reihe,
      einheiten: [
        { ...reihe.einheiten[0], id: 'w1', kontaktzeit_h: 4 },
        { ...reihe.einheiten[0], id: 'w2', kontaktzeit_h: 4 },
        { ...reihe.einheiten[0], id: 'w3', kontaktzeit_h: 1.5 },
      ],
    }
    render(
      <ReihenEditor
        reihe={wdgAehnlicheReihe}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
      />
    )
    const unterrichtszeit = screen.getByLabelText('Schnelleinrichtung Unterrichtszeit') as HTMLInputElement
    expect(unterrichtszeit.value).toBe('240')
  })

  it('falls back to 90 minutes for the Schnelleinrichtung Unterrichtszeit when the Reihe has no Termine yet', () => {
    const reiheOhneTermine = { ...reihe, einheiten: [] }
    render(
      <ReihenEditor
        reihe={reiheOhneTermine}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
      />
    )
    const unterrichtszeit = screen.getByLabelText('Schnelleinrichtung Unterrichtszeit') as HTMLInputElement
    expect(unterrichtszeit.value).toBe('90')
  })
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: FAIL — the first new test expects `'240'` but the field still hard-defaults to `90`.

- [ ] **Step 7: Use the derived default in `ReihenEditor`**

In `src/components/ReihenEditor.tsx`, replace:

```tsx
import { useState } from 'react'
import { format } from 'date-fns'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe, Terminstatus, Thema } from '../lib/types'
```

with:

```tsx
import { useState } from 'react'
import { format } from 'date-fns'
import { berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe, Terminstatus, Thema } from '../lib/types'
```

Replace:

```tsx
  const [schnellUnterrichtszeitMin, setSchnellUnterrichtszeitMin] = useState(90)
```

with:

```tsx
  const [schnellUnterrichtszeitMin, setSchnellUnterrichtszeitMin] = useState(() => {
    const haeufigste = ermittleHaeufigsteKontaktzeit(reihe.einheiten)
    return haeufigste !== null ? Math.round(haeufigste * 60) : 90
  })
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 9: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/besetzung.ts src/lib/besetzung.test.ts src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx
git commit -m "fix(berechnungstool): derive Schnelleinrichtung Unterrichtszeit default from existing Termine"
```

---

### Task 3: Ferien-Umverteilung — Kappung pro Quell-Woche

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/berechnung.ts`
- Modify: `src/lib/berechnung.test.ts`
- Modify: `src/components/KapazitaetsUmverteilung.tsx`
- Modify: `src/components/KapazitaetsUmverteilung.test.tsx`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `Umverteilung.quelleWochenKey: string` (required field); `berechneVerbleibendeFerienstunden(wochen: WochenErgebnis[], umverteilungen: Umverteilung[], quelleWochenKey: string): number`; `useAppData().addUmverteilung(quelleWochenKey: string, ferienName: string, zielWochenKey: string, zusatzStunden: number): void`.
- Consumes: existing `WochenErgebnis.angebotBasis`, `WochenErgebnis.istFerien`, `WochenErgebnis.ferienName`; existing `formatWochenspanne`, `alleWochenImZeitraum`, `ermittleFerienName`, `getISOWochenKey` from `kalenderwochen.ts`.

This task changes a required field on `Umverteilung`, so every file that constructs one must be fixed in the same task to keep the project compiling — that's why the data model, the calculation, the UI, and the state layer are bundled together here rather than split further.

- [ ] **Step 1: Add the required `quelleWochenKey` field**

In `src/lib/types.ts`, replace:

```ts
export interface Umverteilung {
  id: string
  ferienName: string
  zielWochenKey: string
  zusatzStunden: number
}
```

with:

```ts
export interface Umverteilung {
  id: string
  quelleWochenKey: string
  ferienName: string
  zielWochenKey: string
  zusatzStunden: number
}
```

- [ ] **Step 2: Fix the existing `Umverteilung` fixtures in `berechnung.test.ts` so the project still compiles**

All 5 `Umverteilung` object literals in this file use the pattern `ferienName: '...'` (a quoted string) — the `WochenErgebnis` fixture's `ferienName: null` is unaffected by this pattern. Run:

```bash
sed -i '' "s/ferienName: '/quelleWochenKey: '2026-KW44', ferienName: '/g" src/lib/berechnung.test.ts
```

Verify: `grep -c "quelleWochenKey: '2026-KW44'" src/lib/berechnung.test.ts` → expect `5`.

- [ ] **Step 3: Write the failing tests for `berechneVerbleibendeFerienstunden`**

In `src/lib/berechnung.test.ts`, replace the import line:

```ts
import { ampelFarbe, berechneWochenuebersicht, berechneMachbarkeit, berechneZusatzangebotProWoche } from './berechnung'
```

with:

```ts
import { ampelFarbe, berechneWochenuebersicht, berechneMachbarkeit, berechneZusatzangebotProWoche, berechneVerbleibendeFerienstunden } from './berechnung'
import type { WochenErgebnis } from './berechnung'
```

Append this new `describe` block after the `describe('berechneZusatzangebotProWoche', ...)` block's closing `})` (before `describe('berechneWochenuebersicht', ...)`):

```ts

describe('berechneVerbleibendeFerienstunden', () => {
  const wochen: WochenErgebnis[] = [
    {
      wochenKey: '2026-KW44',
      bedarf: 0,
      einsatzBedarf: 0,
      koordinationBedarf: 0,
      angebot: 32,
      angebotBasis: 32,
      zusatzangebot: 0,
      auslastung: 0,
      ampel: 'gruen',
      istFerien: true,
      ferienName: 'Herbstferien NRW',
    },
  ]

  it('returns the full angebotBasis when nothing has been redistributed from that week yet', () => {
    expect(berechneVerbleibendeFerienstunden(wochen, [], '2026-KW44')).toBe(32)
  })

  it('subtracts zusatzStunden already redistributed from that week', () => {
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW04', zusatzStunden: 10 },
      { id: 'u2', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW05', zusatzStunden: 5 },
    ]
    expect(berechneVerbleibendeFerienstunden(wochen, umverteilungen, '2026-KW44')).toBe(17)
  })

  it('ignores Umverteilungen from a different quelleWochenKey', () => {
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW45', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW04', zusatzStunden: 10 },
    ]
    expect(berechneVerbleibendeFerienstunden(wochen, umverteilungen, '2026-KW44')).toBe(32)
  })

  it('never returns a negative number, even when more was redistributed than available', () => {
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW04', zusatzStunden: 50 },
    ]
    expect(berechneVerbleibendeFerienstunden(wochen, umverteilungen, '2026-KW44')).toBe(0)
  })

  it('returns 0 for a quelleWochenKey that is not present in wochen', () => {
    expect(berechneVerbleibendeFerienstunden(wochen, [], '2099-KW01')).toBe(0)
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: FAIL — `berechneVerbleibendeFerienstunden is not a function` (or an import error).

- [ ] **Step 5: Implement `berechneVerbleibendeFerienstunden`**

In `src/lib/berechnung.ts`, append at the end of the file:

```ts

export function berechneVerbleibendeFerienstunden(
  wochen: WochenErgebnis[],
  umverteilungen: Umverteilung[],
  quelleWochenKey: string
): number {
  const basis = wochen.find((w) => w.wochenKey === quelleWochenKey)?.angebotBasis ?? 0
  const bereitsUmverteilt = umverteilungen
    .filter((u) => u.quelleWochenKey === quelleWochenKey)
    .reduce((summe, u) => summe + u.zusatzStunden, 0)
  return Math.max(0, basis - bereitsUmverteilt)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: PASS (all tests, including the 5 new ones).

- [ ] **Step 7: Replace the `KapazitaetsUmverteilung` tests**

Replace the full contents of `src/components/KapazitaetsUmverteilung.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KapazitaetsUmverteilung } from './KapazitaetsUmverteilung'
import type { Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

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
  woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW', angebotBasis: 32 }),
  woche({ wochenKey: '2026-KW46' }),
]

describe('KapazitaetsUmverteilung', () => {
  it('offers only Ferienwochen as Quell-Woche, labeled with the remaining hours', () => {
    render(<KapazitaetsUmverteilung umverteilungen={[]} wochen={wochen} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText(/26\.10\.–01\.11\.2026 – Herbstferien NRW – noch 32 Std verfügbar/)).toBeInTheDocument()
  })

  it('offers only Nicht-Ferienwochen as Ziel-Woche options', () => {
    render(<KapazitaetsUmverteilung umverteilungen={[]} wochen={wochen} onAdd={vi.fn()} onRemove={vi.fn()} />)
    const zielWocheSelect = screen.getByLabelText(/Ziel-Woche/i) as HTMLSelectElement
    const optionValues = Array.from(zielWocheSelect.options).map((o) => o.value)
    expect(optionValues).toEqual(['2026-KW46'])
  })

  it('calls onAdd with the Quell-Woche, its Ferienname, the Ziel-Woche, and the entered Zusatzstunden', () => {
    const onAdd = vi.fn()
    render(<KapazitaetsUmverteilung umverteilungen={[]} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Zusatzstunden/i), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).toHaveBeenCalledWith('2026-KW44', 'Herbstferien NRW', '2026-KW46', 10)
  })

  it('caps the entered Zusatzstunden to the remaining capacity of the Quell-Woche', () => {
    const onAdd = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 28 },
    ]
    render(<KapazitaetsUmverteilung umverteilungen={umverteilungen} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Zusatzstunden/i), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).toHaveBeenCalledWith('2026-KW44', 'Herbstferien NRW', '2026-KW46', 4)
  })

  it('disables the Hinzufügen button once the selected Quell-Woche is fully ausgeschöpft', () => {
    const onAdd = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 32 },
    ]
    render(<KapazitaetsUmverteilung umverteilungen={umverteilungen} wochen={wochen} onAdd={onAdd} onRemove={vi.fn()} />)
    expect(screen.getByText(/ausgeschöpft/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('calls onRemove with the correct id when the delete button is clicked', () => {
    const onRemove = vi.fn()
    const umverteilungen: Umverteilung[] = [
      { id: 'u1', quelleWochenKey: '2026-KW44', ferienName: 'Herbstferien NRW', zielWochenKey: '2026-KW46', zusatzStunden: 10 },
    ]
    render(<KapazitaetsUmverteilung umverteilungen={umverteilungen} wochen={wochen} onAdd={vi.fn()} onRemove={onRemove} />)
    fireEvent.click(screen.getByLabelText('Umverteilung u1 löschen'))
    expect(onRemove).toHaveBeenCalledWith('u1')
  })
})
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `npx vitest run src/components/KapazitaetsUmverteilung.test.tsx`
Expected: FAIL — the component doesn't yet accept these props/behavior.

- [ ] **Step 9: Replace the `KapazitaetsUmverteilung` component**

Replace the full contents of `src/components/KapazitaetsUmverteilung.tsx`:

```tsx
import { useState } from 'react'
import { berechneVerbleibendeFerienstunden } from '../lib/berechnung'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { Umverteilung } from '../lib/types'
import type { WochenErgebnis } from '../lib/berechnung'

export function KapazitaetsUmverteilung({
  umverteilungen,
  wochen,
  onAdd,
  onRemove,
}: {
  umverteilungen: Umverteilung[]
  wochen: WochenErgebnis[]
  onAdd: (quelleWochenKey: string, ferienName: string, zielWochenKey: string, zusatzStunden: number) => void
  onRemove: (id: string) => void
}) {
  const ferienWochen = wochen.filter((w) => w.istFerien)
  const zielWochen = wochen.filter((w) => !w.istFerien)
  const [quelleWochenKey, setQuelleWochenKey] = useState(ferienWochen[0]?.wochenKey ?? '')
  const [zielWochenKey, setZielWochenKey] = useState(zielWochen[0]?.wochenKey ?? '')
  const [zusatzStunden, setZusatzStunden] = useState(5)

  const verbleibend = berechneVerbleibendeFerienstunden(wochen, umverteilungen, quelleWochenKey)

  function hinzufuegen() {
    if (!quelleWochenKey || !zielWochenKey || verbleibend <= 0) return
    const ferienName = wochen.find((w) => w.wochenKey === quelleWochenKey)?.ferienName ?? ''
    const gekappt = Math.min(zusatzStunden, verbleibend)
    if (gekappt <= 0) return
    onAdd(quelleWochenKey, ferienName, zielWochenKey, gekappt)
  }

  return (
    <div>
      <h3>Kapazitäts-Umverteilung</h3>
      <label>
        Quell-Woche:{' '}
        <select value={quelleWochenKey} onChange={(e) => setQuelleWochenKey(e.target.value)}>
          {ferienWochen.map((w) => {
            const rest = berechneVerbleibendeFerienstunden(wochen, umverteilungen, w.wochenKey)
            return (
              <option key={w.wochenKey} value={w.wochenKey} disabled={rest <= 0}>
                {formatWochenspanne(w.wochenKey)} – {w.ferienName} – {rest <= 0 ? 'ausgeschöpft' : `noch ${rest} Std verfügbar`}
              </option>
            )
          })}
        </select>
      </label>
      <label>
        Ziel-Woche:{' '}
        <select value={zielWochenKey} onChange={(e) => setZielWochenKey(e.target.value)}>
          {zielWochen.map((w) => (
            <option key={w.wochenKey} value={w.wochenKey}>
              {formatWochenspanne(w.wochenKey)}
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
      <button onClick={hinzufuegen} disabled={verbleibend <= 0}>
        Hinzufügen
      </button>
      <ul>
        {umverteilungen.map((u) => (
          <li key={u.id}>
            {u.zusatzStunden} Std aus {formatWochenspanne(u.quelleWochenKey)} ({u.ferienName}) → {formatWochenspanne(u.zielWochenKey)}{' '}
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

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run src/components/KapazitaetsUmverteilung.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 11: Update `useAppData`'s `addUmverteilung` and add the migration**

In `src/state/useAppData.ts`, replace the import line:

```ts
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import { berechneThemenUebersicht } from '../lib/themenUebersicht'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'
```

with:

```ts
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import { berechneThemenUebersicht } from '../lib/themenUebersicht'
import { alleWochenImZeitraum, ermittleFerienName, getISOWochenKey } from '../lib/kalenderwochen'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'
```

Replace the `migriereDatenbestand` function:

```ts
function migriereDatenbestand(d: Datenbestand): Datenbestand {
  return {
    ...d,
    schulen: d.schulen.map((schule) => ({
      ...schule,
      reihen: schule.reihen.map((reihe) => ({
        ...reihe,
        terminstatus: reihe.terminstatus ?? ('festgelegt' as Terminstatus),
      })),
    })),
  }
}
```

with:

```ts
function ermittleQuelleWochenKeyFuerFerienname(d: Datenbestand, ferienName: string): string {
  const wochenStarts = alleWochenImZeitraum(d.settings.planungszeitraum.start, d.settings.planungszeitraum.ende)
  const treffer = wochenStarts.find((montag) => ermittleFerienName(montag, d.kalender.ferien) === ferienName)
  return treffer ? getISOWochenKey(treffer) : ''
}

function migriereDatenbestand(d: Datenbestand): Datenbestand {
  return {
    ...d,
    schulen: d.schulen.map((schule) => ({
      ...schule,
      reihen: schule.reihen.map((reihe) => ({
        ...reihe,
        terminstatus: reihe.terminstatus ?? ('festgelegt' as Terminstatus),
      })),
    })),
    umverteilungen: (d.umverteilungen ?? []).map((u) =>
      u.quelleWochenKey ? u : { ...u, quelleWochenKey: ermittleQuelleWochenKeyFuerFerienname(d, u.ferienName) }
    ),
  }
}
```

Replace `addUmverteilung`:

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
```

with:

```ts
  function addUmverteilung(quelleWochenKey: string, ferienName: string, zielWochenKey: string, zusatzStunden: number) {
    setData((prev) => ({
      ...prev,
      umverteilungen: [
        ...(prev.umverteilungen ?? []),
        { id: `umverteilung_${Date.now()}`, quelleWochenKey, ferienName, zielWochenKey, zusatzStunden },
      ],
    }))
  }
```

- [ ] **Step 12: Update `useAppData.test.ts`**

Replace:

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

with:

```ts
  it('addUmverteilung appends a new Umverteilung with the given values and leaves existing entries unchanged', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addUmverteilung('2026-KW44', 'Herbstferien NRW', '2027-KW04', 10)
    })
    const umverteilungen = result.current.data.umverteilungen ?? []
    expect(umverteilungen).toHaveLength(1)
    expect(umverteilungen[0].quelleWochenKey).toBe('2026-KW44')
    expect(umverteilungen[0].ferienName).toBe('Herbstferien NRW')
    expect(umverteilungen[0].zielWochenKey).toBe('2027-KW04')
    expect(umverteilungen[0].zusatzStunden).toBe(10)
    act(() => {
      result.current.addUmverteilung('2026-KW52', 'Weihnachtsferien NRW', '2027-KW05', 5)
    })
    const aktualisiert = result.current.data.umverteilungen ?? []
    expect(aktualisiert).toHaveLength(2)
    expect(aktualisiert[0].zielWochenKey).toBe('2027-KW04')
    expect(aktualisiert[1].zielWochenKey).toBe('2027-KW05')
  })

  it('removeUmverteilung deletes the matching entry and leaves others unchanged', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addUmverteilung('2026-KW44', 'Herbstferien NRW', '2027-KW04', 10)
    })
    act(() => {
      result.current.addUmverteilung('2026-KW52', 'Weihnachtsferien NRW', '2027-KW05', 5)
    })
    const zuLoeschen = (result.current.data.umverteilungen ?? [])[0]
    act(() => {
      result.current.removeUmverteilung(zuLoeschen.id)
    })
    const verbleibend = result.current.data.umverteilungen ?? []
    expect(verbleibend).toHaveLength(1)
    expect(verbleibend[0].zielWochenKey).toBe('2027-KW05')
  })

  it('assigns quelleWochenKey to a persisted Umverteilung missing that field, based on its ferienName', () => {
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
      kalender: { ferien: [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }] },
      schulen: [],
      umverteilungen: [{ id: 'u1', ferienName: 'Herbstferien NRW', zielWochenKey: '2027-KW04', zusatzStunden: 10 }],
    })
    localStorage.setItem('kapazitaetsrechner:data', roh)
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.umverteilungen?.[0].quelleWochenKey).toBe('2026-KW42')
  })
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS (all tests, including the new migration test).

- [ ] **Step 14: Update `App.tsx`'s `KapazitaetsUmverteilung` usage**

In `src/App.tsx`, replace:

```tsx
      <div className="card">
        <KapazitaetsUmverteilung
          umverteilungen={data.umverteilungen ?? []}
          ferien={data.kalender.ferien}
          wochen={ergebnis.wochen}
          onAdd={addUmverteilung}
          onRemove={removeUmverteilung}
        />
      </div>
```

with:

```tsx
      <div className="card">
        <KapazitaetsUmverteilung
          umverteilungen={data.umverteilungen ?? []}
          wochen={ergebnis.wochen}
          onAdd={addUmverteilung}
          onRemove={removeUmverteilung}
        />
      </div>
```

- [ ] **Step 15: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add src/lib/types.ts src/lib/berechnung.ts src/lib/berechnung.test.ts src/components/KapazitaetsUmverteilung.tsx src/components/KapazitaetsUmverteilung.test.tsx src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): cap Ferien-Umverteilung to the remaining capacity of its Quell-Woche"
```

---

### Task 4: Ferien-Warnung — Termine, die auf Ferienwochen fallen

**Files:**
- Create: `src/lib/ferienWarnung.ts`
- Create: `src/lib/ferienWarnung.test.ts`

**Interfaces:**
- Produces: `FerienWarnung { schule: string; reiheTitel: string; einheitIndex: number; datumOderKw: string; ferienName: string }`; `findeEinheitenInFerien(data: Datenbestand, wochen: WochenErgebnis[]): FerienWarnung[]` — used by Task 6 (`ThemenUebersicht.tsx` wiring).
- Consumes: existing `parseZuWochenKey` from `kalenderwochen.ts`; `WochenErgebnis.istFerien`/`ferienName`.

This task is purely additive (a new file with no existing consumers), so it's safe on its own.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ferienWarnung.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findeEinheitenInFerien } from './ferienWarnung'
import type { Datenbestand } from './types'
import type { WochenErgebnis } from './berechnung'

const settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
  return {
    wochenKey: '2026-KW44',
    bedarf: 0,
    einsatzBedarf: 0,
    koordinationBedarf: 0,
    angebot: 32,
    angebotBasis: 32,
    zusatzangebot: 0,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: true,
    ferienName: 'Herbstferien NRW',
    ...overrides,
  }
}

describe('findeEinheitenInFerien', () => {
  it('flags a Termin whose Woche falls inside a Ferienwoche', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }] },
      schulen: [
        {
          id: 's1',
          name: 'WDG',
          reihen: [
            {
              id: 'r1',
              titel: 'Theorieblöcke',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                {
                  id: 'e1',
                  index: 4,
                  datum_oder_kw: '2026-KW44',
                  kontaktzeit_h: 4,
                  personen_parallel: 1,
                  erstdurchfuehrung: false,
                  wir_begleiten: true,
                  typ: 'regulaer',
                },
              ],
            },
          ],
        },
      ],
    }
    expect(findeEinheitenInFerien(data, [woche()])).toEqual([
      { schule: 'WDG', reiheTitel: 'Theorieblöcke', einheitIndex: 4, datumOderKw: '2026-KW44', ferienName: 'Herbstferien NRW' },
    ])
  })

  it('does not flag a Termin outside any Ferienwoche', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'WDG',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                {
                  id: 'e1',
                  index: 1,
                  datum_oder_kw: '2026-KW46',
                  kontaktzeit_h: 4,
                  personen_parallel: 1,
                  erstdurchfuehrung: false,
                  wir_begleiten: true,
                  typ: 'regulaer',
                },
              ],
            },
          ],
        },
      ],
    }
    const wochen = [woche({ wochenKey: '2026-KW46', istFerien: false, ferienName: null })]
    expect(findeEinheitenInFerien(data, wochen)).toEqual([])
  })

  it('checks Einheiten regardless of terminstatus or wir_begleiten', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }] },
      schulen: [
        {
          id: 's1',
          name: 'Kothen',
          reihen: [
            {
              id: 'r1',
              titel: 'Platzhalter',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [
                {
                  id: 'e1',
                  index: 1,
                  datum_oder_kw: '2026-KW44',
                  kontaktzeit_h: 1.5,
                  personen_parallel: 1,
                  erstdurchfuehrung: false,
                  wir_begleiten: false,
                  typ: 'regulaer',
                },
              ],
            },
          ],
        },
      ],
    }
    expect(findeEinheitenInFerien(data, [woche()])).toHaveLength(1)
  })

  it('collects warnings across multiple Schulen', () => {
    const reiheFuer = (id: string) => ({
      id,
      titel: 'x',
      betreuungsmodell: 'A' as const,
      fahrzeit_h: 0,
      status: 'zugesagt',
      extern_betreut: false,
      terminstatus: 'festgelegt' as const,
      einheiten: [
        {
          id: `${id}_e`,
          index: 1,
          datum_oder_kw: '2026-KW44',
          kontaktzeit_h: 1,
          personen_parallel: 1,
          erstdurchfuehrung: false,
          wir_begleiten: true,
          typ: 'regulaer' as const,
        },
      ],
    })
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [{ name: 'Herbstferien NRW', von: '2026-10-17', bis: '2026-10-31' }] },
      schulen: [
        { id: 's1', name: 'Schule A', reihen: [reiheFuer('r_a')] },
        { id: 's2', name: 'Schule B', reihen: [reiheFuer('r_b')] },
      ],
    }
    expect(findeEinheitenInFerien(data, [woche()])).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/ferienWarnung.test.ts`
Expected: FAIL — `Cannot find module './ferienWarnung'`.

- [ ] **Step 3: Implement `findeEinheitenInFerien`**

Create `src/lib/ferienWarnung.ts`:

```ts
import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'
import type { WochenErgebnis } from './berechnung'

export interface FerienWarnung {
  schule: string
  reiheTitel: string
  einheitIndex: number
  datumOderKw: string
  ferienName: string
}

export function findeEinheitenInFerien(data: Datenbestand, wochen: WochenErgebnis[]): FerienWarnung[] {
  const warnungen: FerienWarnung[] = []
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        const woche = wochen.find((w) => w.wochenKey === wochenKey)
        if (woche?.istFerien && woche.ferienName) {
          warnungen.push({
            schule: schule.name,
            reiheTitel: reihe.titel,
            einheitIndex: einheit.index,
            datumOderKw: einheit.datum_oder_kw,
            ferienName: woche.ferienName,
          })
        }
      }
    }
  }
  return warnungen
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/ferienWarnung.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ferienWarnung.ts src/lib/ferienWarnung.test.ts
git commit -m "feat(berechnungstool): add findeEinheitenInFerien to flag Termine scheduled during the Ferien"
```

---

### Task 5: Themen-Gantt — Datenfunktionen

**Files:**
- Modify: `src/lib/themenUebersicht.ts`
- Modify: `src/lib/themenUebersicht.test.ts`

**Interfaces:**
- Produces: `ThemenGanttZeile { reiheId: string; zeilenLabel: string; balkenLabel: string; thema: Thema | null; startWochenKey: string; endWochenKey: string; stunden: number }`; `berechneThemenGantt(data: Datenbestand): ThemenGanttZeile[]`; `FerienBand { name: string; startWochenKey: string; endWochenKey: string }`; `berechneFerienBaender(wochen: WochenErgebnis[]): FerienBand[]` — both used by Task 6.
- Consumes: existing `parseZuWochenKey`.

This task **adds** the new functions alongside the existing `berechneThemenUebersicht`/`ThemenZeile` (left untouched — still used by `useAppData.ts` and `ThemenUebersicht.tsx` until Task 6 cuts over), so nothing else in the project needs to change here.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/themenUebersicht.test.ts` (keep the existing `describe('berechneThemenUebersicht', ...)` block untouched, add these new blocks after it):

```ts

describe('berechneThemenGantt', () => {
  it('spans a Zeile from its first to its last Woche with that Thema, summing the Stunden', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Else Lasker',
          reihen: [
            {
              id: 'r1',
              titel: 'Parisa',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'teilweise_festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
                { id: 'e2', index: 2, datum_oder_kw: '2026-09-29', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([
      { reiheId: 'r1', zeilenLabel: 'Else Lasker – Parisa', balkenLabel: 'Mobilität', thema: 'Mobilität', startWochenKey: '2026-KW37', endWochenKey: '2026-KW40', stunden: 3 },
    ])
  })

  it('falls back to the Reihentitel as balkenLabel when no Einheit has a thema', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'WDG',
          reihen: [
            {
              id: 'r1',
              titel: 'Theorieblöcke',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-11-09', kontaktzeit_h: 4, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([
      { reiheId: 'r1', zeilenLabel: 'WDG – Theorieblöcke', balkenLabel: 'Theorieblöcke', thema: null, startWochenKey: '2026-KW46', endWochenKey: '2026-KW46', stunden: 4 },
    ])
  })

  it('excludes Reihen with terminstatus "offen"', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Kothen',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-10-05', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([])
  })

  it('excludes a Reihe entirely when none of its Einheiten are wir_begleiten', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Hügelstraße',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-14', kontaktzeit_h: 0, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: false, typ: 'regulaer' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([])
  })

  it('creates two separate Zeilen with the same zeilenLabel when a Reihe mixes two Themen', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule X',
          reihen: [
            {
              id: 'r1',
              titel: 'Mix',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-07', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Energie' },
                { id: 'e2', index: 2, datum_oder_kw: '2026-09-14', kontaktzeit_h: 1.5, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Stadtgrün' },
              ],
            },
          ],
        },
      ],
    }
    const zeilen = berechneThemenGantt(data)
    expect(zeilen).toHaveLength(2)
    expect(zeilen.every((z) => z.zeilenLabel === 'Schule X – Mix')).toBe(true)
    expect(zeilen.map((z) => z.thema).sort()).toEqual(['Energie', 'Stadtgrün'])
  })

  it('sorts rows by startWochenKey, then by zeilenLabel', () => {
    const reiheFuer = (id: string, datum: string) => ({
      id,
      titel: 'x',
      betreuungsmodell: 'A' as const,
      fahrzeit_h: 0,
      status: 'zugesagt',
      extern_betreut: false,
      terminstatus: 'festgelegt' as const,
      einheiten: [
        { id: `${id}_e`, index: 1, datum_oder_kw: datum, kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' as const },
      ],
    })
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        { id: 's_b', name: 'B-Schule', reihen: [reiheFuer('r_b', '2026-11-09')] },
        { id: 's_a', name: 'A-Schule', reihen: [reiheFuer('r_a', '2026-11-09')] },
        { id: 's_c', name: 'C-Schule', reihen: [reiheFuer('r_c', '2026-09-07')] },
      ],
    }
    const zeilen = berechneThemenGantt(data)
    expect(zeilen.map((z) => z.zeilenLabel)).toEqual(['C-Schule – x', 'A-Schule – x', 'B-Schule – x'])
  })
})

describe('berechneFerienBaender', () => {
  function woche(overrides: Partial<WochenErgebnis> = {}): WochenErgebnis {
    return {
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
      ...overrides,
    }
  }

  it('merges consecutive Wochen with the same ferienName into one Band', () => {
    const wochen = [
      woche({ wochenKey: '2026-KW42', istFerien: false, ferienName: null }),
      woche({ wochenKey: '2026-KW43', istFerien: true, ferienName: 'Herbstferien NRW' }),
      woche({ wochenKey: '2026-KW44', istFerien: true, ferienName: 'Herbstferien NRW' }),
      woche({ wochenKey: '2026-KW45', istFerien: false, ferienName: null }),
    ]
    expect(berechneFerienBaender(wochen)).toEqual([
      { name: 'Herbstferien NRW', startWochenKey: '2026-KW43', endWochenKey: '2026-KW44' },
    ])
  })

  it('creates separate Bänder for non-adjacent Ferienzeiträume', () => {
    const wochen = [
      woche({ wochenKey: '2026-KW43', istFerien: true, ferienName: 'Herbstferien NRW' }),
      woche({ wochenKey: '2026-KW44', istFerien: false, ferienName: null }),
      woche({ wochenKey: '2026-KW52', istFerien: true, ferienName: 'Weihnachtsferien NRW' }),
    ]
    expect(berechneFerienBaender(wochen)).toEqual([
      { name: 'Herbstferien NRW', startWochenKey: '2026-KW43', endWochenKey: '2026-KW43' },
      { name: 'Weihnachtsferien NRW', startWochenKey: '2026-KW52', endWochenKey: '2026-KW52' },
    ])
  })

  it('returns an empty array when there are no Ferienwochen', () => {
    expect(berechneFerienBaender([woche()])).toEqual([])
  })
})
```

And update the import line at the top of `src/lib/themenUebersicht.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { berechneThemenUebersicht } from './themenUebersicht'
import type { Datenbestand } from './types'
```

becomes:

```ts
import { describe, it, expect } from 'vitest'
import { berechneThemenUebersicht, berechneThemenGantt, berechneFerienBaender } from './themenUebersicht'
import type { Datenbestand } from './types'
import type { WochenErgebnis } from './berechnung'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/themenUebersicht.test.ts`
Expected: FAIL — `berechneThemenGantt`/`berechneFerienBaender` are not exported yet.

- [ ] **Step 3: Implement `berechneThemenGantt` and `berechneFerienBaender`**

In `src/lib/themenUebersicht.ts`, replace the import line:

```ts
import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'
```

with:

```ts
import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand, Thema } from './types'
import type { WochenErgebnis } from './berechnung'
```

Append at the end of the file (after the existing `berechneThemenUebersicht` function):

```ts

export interface ThemenGanttZeile {
  reiheId: string
  zeilenLabel: string
  balkenLabel: string
  thema: Thema | null
  startWochenKey: string
  endWochenKey: string
  stunden: number
}

export function berechneThemenGantt(data: Datenbestand): ThemenGanttZeile[] {
  const zeilen: ThemenGanttZeile[] = []
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      if (reihe.terminstatus === 'offen') continue
      const begleiteteEinheiten = reihe.einheiten.filter((e) => e.wir_begleiten)
      if (begleiteteEinheiten.length === 0) continue

      const gruppen = new Map<Thema | null, { wochenKeys: string[]; stunden: number }>()
      for (const einheit of begleiteteEinheiten) {
        const thema = einheit.thema ?? null
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        const gruppe = gruppen.get(thema) ?? { wochenKeys: [], stunden: 0 }
        gruppe.wochenKeys.push(wochenKey)
        gruppe.stunden += einheit.kontaktzeit_h
        gruppen.set(thema, gruppe)
      }

      for (const [thema, gruppe] of gruppen) {
        zeilen.push({
          reiheId: reihe.id,
          zeilenLabel: `${schule.name} – ${reihe.titel}`,
          balkenLabel: thema ?? reihe.titel,
          thema,
          startWochenKey: gruppe.wochenKeys.reduce((kleinstes, k) => (k < kleinstes ? k : kleinstes)),
          endWochenKey: gruppe.wochenKeys.reduce((groesstes, k) => (k > groesstes ? k : groesstes)),
          stunden: gruppe.stunden,
        })
      }
    }
  }
  return zeilen.sort((a, b) =>
    a.startWochenKey === b.startWochenKey ? a.zeilenLabel.localeCompare(b.zeilenLabel) : a.startWochenKey.localeCompare(b.startWochenKey)
  )
}

export interface FerienBand {
  name: string
  startWochenKey: string
  endWochenKey: string
}

export function berechneFerienBaender(wochen: WochenErgebnis[]): FerienBand[] {
  const baender: FerienBand[] = []
  let aktuelles: FerienBand | null = null
  for (const w of wochen) {
    if (w.istFerien && w.ferienName) {
      if (aktuelles && aktuelles.name === w.ferienName) {
        aktuelles.endWochenKey = w.wochenKey
      } else {
        aktuelles = { name: w.ferienName, startWochenKey: w.wochenKey, endWochenKey: w.wochenKey }
        baender.push(aktuelles)
      }
    } else {
      aktuelles = null
    }
  }
  return baender
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/themenUebersicht.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/themenUebersicht.ts src/lib/themenUebersicht.test.ts
git commit -m "feat(berechnungstool): add berechneThemenGantt and berechneFerienBaender"
```

---

### Task 6: Themen-Gantt-Komponente & finale Verdrahtung

**Files:**
- Modify: `src/components/ThemenUebersicht.tsx`
- Modify: `src/components/ThemenUebersicht.test.tsx`
- Create: `src/components/ThemenUebersicht.css`
- Modify: `src/lib/themenUebersicht.ts`
- Modify: `src/lib/themenUebersicht.test.ts`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ThemenGanttZeile`, `berechneThemenGantt`, `FerienBand`, `berechneFerienBaender` (Task 5); `FerienWarnung`, `findeEinheitenInFerien` (Task 4); existing `formatWochenspanne`, `WochenErgebnis`.
- Produces: `ThemenUebersicht` with new props `{ zeilen: ThemenGanttZeile[]; wochen: WochenErgebnis[]; ferienWarnungen: FerienWarnung[] }`; `useAppData().themenGanttZeilen`, `useAppData().ferienWarnungen` (replacing `useAppData().themenUebersicht`).

This is the cutover task: it removes the now-superseded `berechneThemenUebersicht`/`ThemenZeile` and rewires `useAppData.ts`/`App.tsx` to the new Gantt data in one step, so the project never sits in a half-migrated, non-compiling state.

- [ ] **Step 1: Remove the superseded `berechneThemenUebersicht`/`ThemenZeile`**

In `src/lib/themenUebersicht.ts`, delete the `ThemenZeile` interface and the `berechneThemenUebersicht` function (the first two exports in the file — everything from `export interface ThemenZeile` through the end of `export function berechneThemenUebersicht(...) { ... }`), keeping the `berechneThemenGantt`/`berechneFerienBaender` code from Task 5 untouched.

In `src/lib/themenUebersicht.test.ts`, delete the entire `describe('berechneThemenUebersicht', ...)` block (the first `describe` in the file) and remove `berechneThemenUebersicht` from the import line:

```ts
import { berechneThemenUebersicht, berechneThemenGantt, berechneFerienBaender } from './themenUebersicht'
```

becomes:

```ts
import { berechneThemenGantt, berechneFerienBaender } from './themenUebersicht'
```

- [ ] **Step 2: Run the lib tests to verify they still pass**

Run: `npx vitest run src/lib/themenUebersicht.test.ts`
Expected: PASS (only the Task 5 tests remain).

- [ ] **Step 3: Replace the `ThemenUebersicht` component tests**

Replace the full contents of `src/components/ThemenUebersicht.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemenUebersicht } from './ThemenUebersicht'
import type { ThemenGanttZeile } from '../lib/themenUebersicht'
import type { FerienWarnung } from '../lib/ferienWarnung'
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
    render(<ThemenUebersicht zeilen={[]} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.getByText(/Keine Einheiten/)).toBeInTheDocument()
  })

  it('renders the Zeilen-Label and the Thema as balkenLabel on the chart', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.getByText('Else Lasker – Parisa')).toBeInTheDocument()
    expect(screen.getByText('Mobilität')).toBeInTheDocument()
  })

  it('marks a Ferienwoche with a titled band', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.getByTitle('Herbstferien NRW')).toBeInTheDocument()
  })

  it('does not show a warning box when there are no ferienWarnungen', () => {
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={[]} />)
    expect(screen.queryByText(/liegen? in den Ferien/)).not.toBeInTheDocument()
  })

  it('shows a warning box listing each Termin that falls into the Ferien', () => {
    const ferienWarnungen: FerienWarnung[] = [
      { schule: 'WDG', reiheTitel: 'Theorieblöcke', einheitIndex: 4, datumOderKw: '2026-KW44', ferienName: 'Weihnachtsferien NRW' },
    ]
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={ferienWarnungen} />)
    expect(screen.getByText(/1 Termin liegt in den Ferien/)).toBeInTheDocument()
    expect(screen.getByText(/WDG – Theorieblöcke, Termin 4/)).toBeInTheDocument()
  })

  it('pluralizes the warning heading for more than one Termin', () => {
    const ferienWarnungen: FerienWarnung[] = [
      { schule: 'WDG', reiheTitel: 'x', einheitIndex: 1, datumOderKw: '2026-KW44', ferienName: 'Herbstferien NRW' },
      { schule: 'Kothen', reiheTitel: 'y', einheitIndex: 2, datumOderKw: '2026-KW44', ferienName: 'Herbstferien NRW' },
    ]
    render(<ThemenUebersicht zeilen={zeilen} wochen={wochen} ferienWarnungen={ferienWarnungen} />)
    expect(screen.getByText(/2 Termine liegen in den Ferien/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/components/ThemenUebersicht.test.tsx`
Expected: FAIL — the component still takes the old `zeilen: ThemenZeile[]` prop shape and renders a table, not this Gantt structure.

- [ ] **Step 5: Create the Gantt CSS**

Create `src/components/ThemenUebersicht.css`:

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

.themen-gantt-scroll {
  overflow-x: auto;
  padding: 0.5rem 0;
}

.themen-gantt-grid {
  display: grid;
}

.themen-gantt-ecke {
  position: sticky;
  left: 0;
  background: #fff;
}

.themen-gantt-kw {
  font-size: 0.75rem;
  text-align: center;
  color: #555;
  border-bottom: 1px solid #d0d0d0;
  padding-bottom: 0.25rem;
}

.themen-gantt-label {
  position: sticky;
  left: 0;
  background: #fff;
  padding-right: 0.5rem;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  white-space: nowrap;
  z-index: 1;
}

.themen-gantt-ferien-band {
  background: repeating-linear-gradient(45deg, #cccccc, #cccccc 4px, #e8e8e8 4px, #e8e8e8 8px);
}

.themen-gantt-balken {
  display: flex;
  align-items: center;
  padding: 0 0.4rem;
  border-radius: 0.25rem;
  color: #fff;
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: visible;
  margin: 0.2rem 0;
}
```

- [ ] **Step 6: Replace the `ThemenUebersicht` component**

Replace the full contents of `src/components/ThemenUebersicht.tsx`:

```tsx
import './ThemenUebersicht.css'
import { formatWochenspanne } from '../lib/kalenderwochen'
import { berechneFerienBaender } from '../lib/themenUebersicht'
import type { ThemenGanttZeile } from '../lib/themenUebersicht'
import type { FerienWarnung } from '../lib/ferienWarnung'
import type { WochenErgebnis } from '../lib/berechnung'
import type { Thema } from '../lib/types'

const THEMEN_FARBEN: Record<Thema | 'ohne', string> = {
  Ernährung: '#e07a5f',
  Stadtgrün: '#3d9970',
  Mobilität: '#4a7fbf',
  Energie: '#e6b800',
  ohne: '#8a8a8a',
}

function kwNummer(wochenKey: string): string {
  const treffer = /^\d{4}-KW(\d{2})$/.exec(wochenKey)
  return treffer ? treffer[1] : wochenKey
}

export function ThemenUebersicht({
  zeilen,
  wochen,
  ferienWarnungen,
}: {
  zeilen: ThemenGanttZeile[]
  wochen: WochenErgebnis[]
  ferienWarnungen: FerienWarnung[]
}) {
  if (zeilen.length === 0) {
    return (
      <div>
        <h3>Themen-Übersicht</h3>
        <p>Keine Einheiten mit Terminstatus ungleich „offen“ vorhanden.</p>
      </div>
    )
  }

  const wochenKeys = wochen.map((w) => w.wochenKey)
  const indexVon = new Map(wochenKeys.map((key, i) => [key, i]))
  const ferienBaender = berechneFerienBaender(wochen)

  return (
    <div>
      <h3>Themen-Übersicht</h3>
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
      <div className="themen-gantt-scroll">
        <div
          className="themen-gantt-grid"
          style={{
            gridTemplateColumns: `14rem repeat(${wochenKeys.length}, 2.5rem)`,
            gridTemplateRows: `1.5rem repeat(${zeilen.length}, 2.25rem)`,
          }}
        >
          <div className="themen-gantt-ecke" style={{ gridColumn: 1, gridRow: 1 }} />
          {wochenKeys.map((key, i) => (
            <div key={key} className="themen-gantt-kw" style={{ gridColumn: i + 2, gridRow: 1 }} title={formatWochenspanne(key)}>
              {kwNummer(key)}
            </div>
          ))}
          {ferienBaender.map((band) => (
            <div
              key={`${band.name}-${band.startWochenKey}`}
              className="themen-gantt-ferien-band"
              title={band.name}
              style={{
                gridColumn: `${(indexVon.get(band.startWochenKey) ?? 0) + 2} / ${(indexVon.get(band.endWochenKey) ?? 0) + 3}`,
                gridRow: `2 / ${zeilen.length + 2}`,
              }}
            />
          ))}
          {zeilen.map((z, i) => (
            <div key={`${z.reiheId}-${z.balkenLabel}-label`} className="themen-gantt-label" style={{ gridColumn: 1, gridRow: i + 2 }}>
              {z.zeilenLabel}
            </div>
          ))}
          {zeilen.map((z, i) => (
            <div
              key={`${z.reiheId}-${z.balkenLabel}-balken`}
              className="themen-gantt-balken"
              title={`${z.zeilenLabel} – ${z.thema ?? 'Kein Thema'} – ${formatWochenspanne(z.startWochenKey)} bis ${formatWochenspanne(z.endWochenKey)} – ${Math.round(z.stunden * 10) / 10} Std`}
              style={{
                gridColumn: `${(indexVon.get(z.startWochenKey) ?? 0) + 2} / ${(indexVon.get(z.endWochenKey) ?? 0) + 3}`,
                gridRow: i + 2,
                background: THEMEN_FARBEN[z.thema ?? 'ohne'],
              }}
            >
              {z.balkenLabel}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run the component tests to verify they pass**

Run: `npx vitest run src/components/ThemenUebersicht.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 8: Wire the new data through `useAppData`**

In `src/state/useAppData.ts`, replace the import line:

```ts
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import { berechneThemenUebersicht } from '../lib/themenUebersicht'
import { alleWochenImZeitraum, ermittleFerienName, getISOWochenKey } from '../lib/kalenderwochen'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'
```

with:

```ts
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import { berechneThemenGantt } from '../lib/themenUebersicht'
import { findeEinheitenInFerien } from '../lib/ferienWarnung'
import { alleWochenImZeitraum, ermittleFerienName, getISOWochenKey } from '../lib/kalenderwochen'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'
```

Replace:

```ts
  const ergebnis = useMemo(
    () => berechneSzenario(data, szenario, szenario === 'sensitivitaet' ? sensitivitaet : undefined),
    [data, szenario, sensitivitaet]
  )
  const themenUebersicht = useMemo(() => berechneThemenUebersicht(data), [data])

  return {
    data,
    themenUebersicht,
```

with:

```ts
  const ergebnis = useMemo(
    () => berechneSzenario(data, szenario, szenario === 'sensitivitaet' ? sensitivitaet : undefined),
    [data, szenario, sensitivitaet]
  )
  const themenGanttZeilen = useMemo(() => berechneThemenGantt(data), [data])
  const ferienWarnungen = useMemo(() => findeEinheitenInFerien(data, ergebnis.wochen), [data, ergebnis.wochen])

  return {
    data,
    themenGanttZeilen,
    ferienWarnungen,
```

- [ ] **Step 9: Update `useAppData.test.ts`**

Replace:

```ts
  it('exposes themenUebersicht derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.themenUebersicht)).toBe(true)
    expect(result.current.themenUebersicht.length).toBeGreaterThan(0)
  })
```

with:

```ts
  it('exposes themenGanttZeilen derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.themenGanttZeilen)).toBe(true)
    expect(result.current.themenGanttZeilen.length).toBeGreaterThan(0)
  })

  it('exposes ferienWarnungen derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.ferienWarnungen)).toBe(true)
  })
```

- [ ] **Step 10: Run the hook tests to verify they pass**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS.

- [ ] **Step 11: Wire `App.tsx`**

Replace:

```tsx
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    setReiheTerminstatus,
    setReiheEinheiten,
    addUmverteilung,
    removeUmverteilung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    themenUebersicht,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  } = useAppData()
```

with:

```tsx
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    setReiheTerminstatus,
    setReiheEinheiten,
    addUmverteilung,
    removeUmverteilung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    themenGanttZeilen,
    ferienWarnungen,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  } = useAppData()
```

Replace:

```tsx
      <div className="card">
        <ThemenUebersicht zeilen={themenUebersicht} />
      </div>
```

with:

```tsx
      <div className="card">
        <ThemenUebersicht zeilen={themenGanttZeilen} wochen={ergebnis.wochen} ferienWarnungen={ferienWarnungen} />
      </div>
```

- [ ] **Step 12: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 13: Manual verification in the browser**

Run: `npm run dev`, open the app, and check:
- The Themen-Übersicht card shows one row per Schule/Kurs with a colored bar spanning its Termine, labeled with the Thema (or the Reihentitel where no Thema is set).
- Ferienwochen show as a hatched band behind the bars, and hovering it shows the Ferien name.
- If any Termin falls into a Ferienwoche, the warning box appears above the chart (there shouldn't be any after Task 1's data fix and the existing seed data — this is mainly to confirm the box does *not* show incorrectly).
- The Kapazitäts-Umverteilung card's Quell-Woche dropdown only lists Ferienwochen with their remaining hours, and picking a nearly-exhausted week caps the Zusatzstunden input on submit.

Stop the dev server (`Ctrl+C`) once confirmed.

- [ ] **Step 14: Commit**

```bash
git add src/components/ThemenUebersicht.tsx src/components/ThemenUebersicht.test.tsx src/components/ThemenUebersicht.css src/lib/themenUebersicht.ts src/lib/themenUebersicht.test.ts src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): replace Themen-Übersicht with a Gantt-style Schulen×KW chart"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (Datenkorrekturen) → Task 1. Section 2 (Schnelleinrichtung-Default) → Task 2. Section 3 (Themen-Gantt) → Tasks 5–6 (deliberately built on plain CSS Grid instead of recharts, see Architecture note above — same rows/columns/bars/labels/Ferien-bands/tooltip behavior). Section 4 (Ferien-Warnung) → Task 4, wired into the chart in Task 6. Section 5 (Ferien-Umverteilung-Kappung) → Task 3. Section 6 (Browser-`localStorage`-Hinweis) → already communicated to the user directly, no code change needed.
- **Type consistency:** `Umverteilung.quelleWochenKey`, `berechneVerbleibendeFerienstunden`, `ThemenGanttZeile`, `berechneThemenGantt`, `FerienBand`, `berechneFerienBaender`, `FerienWarnung`, `findeEinheitenInFerien` are named identically everywhere they're produced and consumed across Tasks 3–6.
- **Out of scope carried over from the design spec:** the Olaf/Else-Lasker school-year question, and no automatic fix of the user's own browser `localStorage` (they'll use the existing „Zurücksetzen auf Ausgangsdaten“ button after Task 1 ships).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-themen-gantt-ferien-datenkorrektur.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
