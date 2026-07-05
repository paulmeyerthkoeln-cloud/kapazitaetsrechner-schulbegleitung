# Schnelleinrichtung, Terminstatus, Themen-Übersicht & Persistenz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the team quickly set up a school series (Unterrichtszeit, start date, number of sessions), tag each session with a Thema (Ernährung/Stadtgrün/Mobilität/Energie), track whether a series' dates are actually confirmed (and exclude unconfirmed series from the workload calculation), show weeks as date ranges instead of KW codes, add a new Schools×Weeks×Topic overview, and persist edits in the browser across reloads.

**Architecture:** Additive changes to the existing pure-function calculation pipeline (`src/lib`) and its React consumers (`src/components`, `src/state/useAppData.ts`). `Reihe` gains a required `terminstatus` field that `berechneBedarfProWoche` uses to exclude unconfirmed series; `Einheit` gains an optional `thema` field consumed by a new `berechneThemenUebersicht` pure function and its `ThemenUebersicht` table+chart component. A new `generiereWochentlicheTermine` function (separate from the existing `expandiereMuster`, which stays untouched for the placeholder-10th-school planner) powers a "Termine generieren" quick-setup button in `ReihenEditor`. `useAppData` gains a `localStorage`-backed autosave with a migration step for old exported JSON.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, date-fns, recharts.

## Global Constraints

- No backend and no GitHub-token-based commit-back — persistence is `localStorage` autosave plus the existing manual JSON export/import, per the approved design.
- `terminstatus` is a **required** field on `Reihe` (`'festgelegt' | 'teilweise_festgelegt' | 'offen'`). Any `Reihe` missing it when loaded from `localStorage` or via JSON import is migrated to `'festgelegt'` — never left `undefined` — so older exported files keep working.
- A `Reihe` with `terminstatus: 'offen'` contributes 0 to both `einsatzBedarf` and `koordinationBedarf`, and its Einheiten are excluded from the new Themen-Übersicht. Its Einheiten are **not deleted** — only excluded from calculations.
- The internal field name `kontaktzeit_h` does **not** change. Only the UI label changes from "Kontaktzeit" to "Unterrichtszeit".
- `thema` is optional on `Einheit` (`'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'`); Einheiten without one are grouped under "Ohne Thema" in the new overview.
- "Termine generieren" (quick setup) **replaces** a Reihe's entire `einheiten` array; if the Reihe already has Einheiten, the UI asks for confirmation via `window.confirm` before replacing.
- `BedarfAngebotChart` gets no new automated test in this plan — it has none today (recharts + `ResponsiveContainer` isn't asserted on anywhere in this codebase); its Tooltip change is verified manually in Final Verification, consistent with the existing project convention.
- The "Olaf / Else Lasker Club Klimaresistente Schule may belong to next school year" question flagged in the design spec is **not** resolved by this plan — dates are left as-is, only `terminstatus` is set.
- macOS (`darwin`) BSD `sed` is used for the few mechanical, uniform text substitutions in this plan (`sed -i ''`, not GNU `sed -i`).

---

### Task 1: `formatWochenspanne` — show weeks as date ranges

**Files:**
- Modify: `src/lib/kalenderwochen.ts`
- Test: `src/lib/kalenderwochen.test.ts`

**Interfaces:**
- Consumes: existing `KW_REGEX`, `format` (already imported from `date-fns`); adds `setISOWeek`, `setISOWeekYear` to the `date-fns` import.
- Produces: `formatWochenspanne(wochenKey: string): string` — used by Task 7 (WochenHeatmap), Task 8 (BedarfAngebotChart), Task 9 (EngpassBericht), Task 11 (ThemenUebersicht).

- [ ] **Step 1: Write the failing tests**

In `src/lib/kalenderwochen.test.ts`, replace the import line (line 2-11):

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
  formatWochenspanne,
} from './kalenderwochen'
```

Append a new `describe` block at the end of the file:

```ts

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: FAIL — `formatWochenspanne is not a function` (or an import error).

- [ ] **Step 3: Implement `formatWochenspanne`**

In `src/lib/kalenderwochen.ts`, replace the import line (line 1):

```ts
import { getISOWeek, getISOWeekYear, startOfISOWeek, addWeeks, areIntervalsOverlapping, endOfISOWeek, parseISO, format } from 'date-fns'
```

with:

```ts
import { getISOWeek, getISOWeekYear, startOfISOWeek, addWeeks, areIntervalsOverlapping, endOfISOWeek, parseISO, format, setISOWeek, setISOWeekYear } from 'date-fns'
```

Append this function at the end of the file (after `ermittleFerienName`):

```ts

export function formatWochenspanne(wochenKey: string): string {
  const treffer = KW_REGEX.exec(wochenKey)
  if (!treffer) return wochenKey
  const [, jahrStr, wocheStr] = treffer
  const referenz = setISOWeek(setISOWeekYear(new Date(), Number(jahrStr)), Number(wocheStr))
  const montag = startOfISOWeek(referenz)
  const sonntag = endOfISOWeek(referenz)
  return `${format(montag, 'dd.MM.')}–${format(sonntag, 'dd.MM.yyyy')}`
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
git commit -m "feat(berechnungstool): add formatWochenspanne to show weeks as date ranges"
```

---

### Task 2: `Reihe.terminstatus` — type, calculation exclusion, and real seed data

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/berechnung.ts`
- Modify: `src/lib/berechnung.test.ts`
- Modify: `src/lib/kalenderwochen.test.ts`
- Modify: `src/lib/restkapazitaet.ts`
- Modify: `src/lib/restkapazitaet.test.ts`
- Modify: `src/components/ReihenEditor.test.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`
- Modify: `src/data/data.json`
- Modify: `src/data/data.test.ts`

**Interfaces:**
- Produces: `export type Terminstatus = 'festgelegt' | 'teilweise_festgelegt' | 'offen'`; `Reihe.terminstatus: Terminstatus` (required) — used by Task 4 (UI dropdown), Task 10 (`berechneThemenUebersicht`), Task 13 (migration on load/import).
- Consumes: nothing new from other tasks.

**Why seed data changes here, not later:** `src/data/data.json` is imported and cast with `data as Datenbestand` / `seedData as Datenbestand`. Verified empirically: TypeScript's `as` cast DOES flag a missing required nested property in this situation (`tsc -b` errors with "Property 'terminstatus' is missing... but required in type 'Reihe'"). So every Reihe in `data.json` needs a real `terminstatus` value in this same task, or the build breaks. The mapping used below comes directly from the team's current status update (see the design spec, `docs/superpowers/specs/2026-07-05-quicksetup-terminstatus-themen-design.md`, section 7).

- [ ] **Step 1: Add the `Terminstatus` type and the `Reihe.terminstatus` field**

In `src/lib/types.ts`, replace:

```ts
export type Betreuungsmodell = 'A' | 'B' | 'C' | 'X'

export interface Reihe {
  id: string
  titel: string
  betreuungsmodell: Betreuungsmodell
  fahrzeit_h: number
  status: string
  extern_betreut: boolean
  einheiten: Einheit[]
  muster?: Muster
  besetzung?: BesetzungsPreset
  sperrzeiten?: Sperrzeit[]
}
```

with:

```ts
export type Betreuungsmodell = 'A' | 'B' | 'C' | 'X'

export type Terminstatus = 'festgelegt' | 'teilweise_festgelegt' | 'offen'

export interface Reihe {
  id: string
  titel: string
  betreuungsmodell: Betreuungsmodell
  fahrzeit_h: number
  status: string
  extern_betreut: boolean
  terminstatus: Terminstatus
  einheiten: Einheit[]
  muster?: Muster
  besetzung?: BesetzungsPreset
  sperrzeiten?: Sperrzeit[]
}
```

- [ ] **Step 2: Fix every existing `Reihe` fixture so the project still compiles**

These files each construct one or more `Reihe` object literals using the exact substring `extern_betreut: false,` immediately before `einheiten:`. Run these commands to append a `terminstatus: 'festgelegt'` field to every one of them (this preserves current test behavior — it does not change what any existing test asserts):

```bash
sed -i '' "s/extern_betreut: false,/extern_betreut: false, terminstatus: 'festgelegt',/g" src/lib/kalenderwochen.test.ts
sed -i '' "s/extern_betreut: false,/extern_betreut: false, terminstatus: 'festgelegt',/g" src/lib/berechnung.test.ts
sed -i '' "s/extern_betreut: false,/extern_betreut: false, terminstatus: 'festgelegt',/g" src/lib/restkapazitaet.ts
sed -i '' "s/extern_betreut: false,/extern_betreut: false, terminstatus: 'festgelegt',/g" src/lib/restkapazitaet.test.ts
sed -i '' "s/extern_betreut: false,/extern_betreut: false, terminstatus: 'festgelegt',/g" src/components/ReihenEditor.test.tsx
sed -i '' "s/extern_betreut: false,/extern_betreut: false, terminstatus: 'festgelegt',/g" src/components/SchuleAkkordionItem.test.tsx
sed -i '' "s/extern_betreut: false,/extern_betreut: false, terminstatus: 'festgelegt',/g" src/components/SchulenAccordion.test.tsx
```

Verify the counts match expectations (12 in berechnung.test.ts, 1 in each of kalenderwochen.test.ts/restkapazitaet.ts/restkapazitaet.test.ts/ReihenEditor.test.tsx, 2 in each of SchuleAkkordionItem.test.tsx/SchulenAccordion.test.tsx):

```bash
git diff --stat src/lib/kalenderwochen.test.ts src/lib/berechnung.test.ts src/lib/restkapazitaet.ts src/lib/restkapazitaet.test.ts src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.test.tsx
```

Expected: each file shows modified lines only (no added/removed lines), one changed line per `Reihe` literal.

- [ ] **Step 3: Set the real `terminstatus` values in the seed data**

In `src/data/data.json`, apply the following 12 edits (each `old`/`new` pair below is unique in the file — match on the surrounding text shown):

1. WDG → `festgelegt`. Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "wdg_e1", "index": 1, "datum_oder_kw": "2026-KW46", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "festgelegt",
          "einheiten": [
            { "id": "wdg_e1", "index": 1, "datum_oder_kw": "2026-KW46", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

2. Gym. Sedanstraße → `offen` (no date/period was actually given). Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "sedan_e1", "index": 1, "datum_oder_kw": "2026-09-07", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "offen",
          "einheiten": [
            { "id": "sedan_e1", "index": 1, "datum_oder_kw": "2026-09-07", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

3. Gym. Kothen → `offen` (nothing fixed yet). Replace:
```
          "status": "in_klaerung",
          "extern_betreut": false,
          "einheiten": [
            { "id": "kothen_e1", "index": 1, "datum_oder_kw": "2026-10-05", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "in_klaerung",
          "extern_betreut": false,
          "terminstatus": "offen",
          "einheiten": [
            { "id": "kothen_e1", "index": 1, "datum_oder_kw": "2026-10-05", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

4. Else Lasker / Parisa → `teilweise_festgelegt`. Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "el_parisa_e1", "index": 1, "datum_oder_kw": "2026-09-08", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "teilweise_festgelegt",
          "einheiten": [
            { "id": "el_parisa_e1", "index": 1, "datum_oder_kw": "2026-09-08", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

5. Else Lasker / Simone → `teilweise_festgelegt`. Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "el_simone_e1", "index": 1, "datum_oder_kw": "2027-01-11", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "teilweise_festgelegt",
          "einheiten": [
            { "id": "el_simone_e1", "index": 1, "datum_oder_kw": "2027-01-11", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

6. Else Lasker / Olaf → `teilweise_festgelegt`. Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "el_olaf_e1", "index": 1, "datum_oder_kw": "2026-09-14", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "teilweise_festgelegt",
          "einheiten": [
            { "id": "el_olaf_e1", "index": 1, "datum_oder_kw": "2026-09-14", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

7. Berufskolleg Barmen → `festgelegt`. Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "barmen_w1_t1", "index": 1, "datum_oder_kw": "2027-01-18", "kontaktzeit_h": 4.5, "personen_parallel": 2, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "festgelegt",
          "einheiten": [
            { "id": "barmen_w1_t1", "index": 1, "datum_oder_kw": "2027-01-18", "kontaktzeit_h": 4.5, "personen_parallel": 2, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

8. Alexander-Coppel-Gesamtschule → `festgelegt`. Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "coppel_e1", "index": 1, "datum_oder_kw": "2026-09-21", "kontaktzeit_h": 1.1, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "festgelegt",
          "einheiten": [
            { "id": "coppel_e1", "index": 1, "datum_oder_kw": "2026-09-21", "kontaktzeit_h": 1.1, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

9. Hauptschule Hügelstraße → `festgelegt` (note: `extern_betreut` is `true` here, not `false`). Replace:
```
          "status": "zugesagt",
          "extern_betreut": true,
          "einheiten": [
            { "id": "huegel_e1", "index": 1, "datum_oder_kw": "2026-09-14", "kontaktzeit_h": 0, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": true,
          "terminstatus": "festgelegt",
          "einheiten": [
            { "id": "huegel_e1", "index": 1, "datum_oder_kw": "2026-09-14", "kontaktzeit_h": 0, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer" },
```

10. Realschule Max Planck → `teilweise_festgelegt` (note the `sperrzeiten` block between `extern_betreut` and `einheiten`). Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "sperrzeiten": [
            { "name": "Praktikum (3 Wochen nach den Osterferien)", "von": "2027-04-05", "bis": "2027-04-25" }
          ],
          "einheiten": [
            { "id": "maxplanck_k1_e1", "index": 1, "datum_oder_kw": "2027-02-01", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "teilweise_festgelegt",
          "sperrzeiten": [
            { "name": "Praktikum (3 Wochen nach den Osterferien)", "von": "2027-04-05", "bis": "2027-04-25" }
          ],
          "einheiten": [
            { "id": "maxplanck_k1_e1", "index": 1, "datum_oder_kw": "2027-02-01", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

11. Bayreuther Gymnasium → `teilweise_festgelegt`. Replace:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "einheiten": [
            { "id": "bayreuther_e1", "index": 1, "datum_oder_kw": "2026-09-14", "kontaktzeit_h": 3, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "zugesagt",
          "extern_betreut": false,
          "terminstatus": "teilweise_festgelegt",
          "einheiten": [
            { "id": "bayreuther_e1", "index": 1, "datum_oder_kw": "2026-09-14", "kontaktzeit_h": 3, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

12. Schule X (Platzhalter) → `festgelegt` (keeps its current full-counting behavior in the Ziel/Verstärkt scenarios, matching how it's used today — this Reihe is a deliberate hypothesis, not a real pending status). Replace:
```
          "status": "platzhalter",
          "extern_betreut": false,
          "einheiten": [
            { "id": "schulex_e1", "index": 1, "datum_oder_kw": "2027-04-12", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```
with:
```
          "status": "platzhalter",
          "extern_betreut": false,
          "terminstatus": "festgelegt",
          "einheiten": [
            { "id": "schulex_e1", "index": 1, "datum_oder_kw": "2027-04-12", "kontaktzeit_h": 1.5, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
```

- [ ] **Step 4: Run the seed-data test to verify it still parses, then add coverage for the new field**

Run: `npx vitest run src/data/data.test.ts`
Expected: PASS (the existing assertions don't check `terminstatus` yet, so they still pass once the JSON is valid against the type).

In `src/data/data.test.ts`, append these tests inside the `describe('seed data.json', ...)` block, after the last existing `it` (before the block's closing `})`):

```ts

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
```

- [ ] **Step 5: Run the data test again**

Run: `npx vitest run src/data/data.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 6: Write the failing tests for the calculation exclusion behavior**

In `src/lib/berechnung.test.ts`, append this new `describe` block after the `describe('berechneBedarfProWoche', ...)` block's closing `})` (before `describe('berechneAngebotProWoche', ...)`):

```ts

describe('Reihe.terminstatus filtering', () => {
  it('excludes an offen Reihe entirely from einsatzBedarf and koordinationBedarf', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule Offen',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', kontaktzeit_h: 4 })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
  })

  it('still counts a teilweise_festgelegt Reihe normally', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule Teilweise',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'teilweise_festgelegt',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', kontaktzeit_h: 4 })],
            },
          ],
        },
      ],
    }
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    expect(einsatzBedarf).toBeCloseTo(berechneAufwandEinheit(einheit({ kontaktzeit_h: 4 }), 1, settings), 5)
  })

  it('excludes koordination entirely when a Schule has only an offen Reihe', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Nur Offen',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'in_klaerung',
              extern_betreut: false,
              terminstatus: 'offen',
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false).koordinationBedarf).toBe(0)
  })
})
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: FAIL — `terminstatus` is not yet used by `berechneBedarfProWoche`, so an `offen` Reihe's Einheit and coordination still count.

- [ ] **Step 8: Implement the exclusion in `berechneBedarfProWoche`**

In `src/lib/berechnung.ts`, replace the loop body inside `berechneBedarfProWoche`:

```ts
  let einsatzBedarf = 0
  let koordinationBedarf = 0
  for (const schule of data.schulen) {
    const istSchuleAktiv = schule.reihen.some((reihe) => {
      const zeitraum = berechneReiheZeitraum(reihe)
      return zeitraum !== null && zeitraum.von <= wochenKey && wochenKey <= zeitraum.bis
    })
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        if (einheit.wir_begleiten) {
          einsatzBedarf += berechneAufwandEinheit(einheit, reihe.fahrzeit_h, data.settings)
        }
      }
    }
    if (istSchuleAktiv) {
      koordinationBedarf += berechneKoordinationWoche(schule, data.settings)
    }
  }
  return { einsatzBedarf, koordinationBedarf }
```

with:

```ts
  let einsatzBedarf = 0
  let koordinationBedarf = 0
  for (const schule of data.schulen) {
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    const istSchuleAktiv = zaehlendeReihen.some((reihe) => {
      const zeitraum = berechneReiheZeitraum(reihe)
      return zeitraum !== null && zeitraum.von <= wochenKey && wochenKey <= zeitraum.bis
    })
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        if (einheit.wir_begleiten) {
          einsatzBedarf += berechneAufwandEinheit(einheit, reihe.fahrzeit_h, data.settings)
        }
      }
    }
    if (istSchuleAktiv) {
      koordinationBedarf += berechneKoordinationWoche(schule, data.settings)
    }
  }
  return { einsatzBedarf, koordinationBedarf }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 10: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS — `tsc -b` compiles cleanly (this confirms `data.json` and every fixture now satisfy the required `terminstatus` field).

- [ ] **Step 11: Commit**

```bash
git add src/lib/types.ts src/lib/berechnung.ts src/lib/berechnung.test.ts src/lib/kalenderwochen.test.ts src/lib/restkapazitaet.ts src/lib/restkapazitaet.test.ts src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.test.tsx src/data/data.json src/data/data.test.ts
git commit -m "feat(berechnungstool): add Reihe.terminstatus and exclude offen Reihen from the workload calculation"
```

---

### Task 3: `Einheit.thema` — type and ReihenEditor Thema column

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/state/useAppData.ts`
- Modify: `src/components/ReihenEditor.test.tsx`

**Interfaces:**
- Produces: `export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'`; `Einheit.thema?: Thema` — used by Task 10 (`berechneThemenUebersicht`), Task 14 (seed data).
- Consumes: existing `onEinheitFelderChange` patch-callback pattern (extends its patch type with `thema?: Thema`).

- [ ] **Step 1: Add the `Thema` type and `Einheit.thema` field**

In `src/lib/types.ts`, replace:

```ts
export type EinheitTyp = 'regulaer' | 'exkursion'

export interface Einheit {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  personen_parallel: number
  erstdurchfuehrung: boolean
  wir_begleiten: boolean
  typ: EinheitTyp
  organisationspauschale_h?: number
}
```

with:

```ts
export type EinheitTyp = 'regulaer' | 'exkursion'

export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'

export interface Einheit {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  personen_parallel: number
  erstdurchfuehrung: boolean
  wir_begleiten: boolean
  typ: EinheitTyp
  organisationspauschale_h?: number
  thema?: Thema
}
```

- [ ] **Step 2: Write the failing tests**

In `src/components/ReihenEditor.test.tsx`, append these tests inside the `describe('ReihenEditor', ...)` block, after the last existing `it` (before the block's closing `})`):

```ts

  it('labels the Kontaktzeit column as Unterrichtszeit', () => {
    renderReihenEditor()
    expect(screen.getByText('Unterrichtszeit (min)')).toBeInTheDocument()
  })

  it('defaults the Thema select to "— kein Thema —" when the Einheit has no thema', () => {
    renderReihenEditor()
    const thema1 = screen.getByRole('combobox', { name: 'Thema für Termin 1 in Testreihe' }) as HTMLSelectElement
    expect(thema1.value).toBe('')
  })

  it('calls onEinheitFelderChange with the selected Thema', () => {
    const props = renderReihenEditor()
    const thema1 = screen.getByRole('combobox', { name: 'Thema für Termin 1 in Testreihe' })
    fireEvent.change(thema1, { target: { value: 'Mobilität' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { thema: 'Mobilität' })
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: FAIL — no element has the text "Unterrichtszeit (min)" and no combobox has the name "Thema für Termin 1 in Testreihe".

- [ ] **Step 4: Implement the Thema column and the Unterrichtszeit relabel**

Replace the full contents of `src/components/ReihenEditor.tsx`:

```tsx
import { useState } from 'react'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe, Thema } from '../lib/types'

const PRESETS: { label: string; preset: (n: number) => BesetzungsPreset }[] = [
  { label: 'Alle', preset: () => ({ typ: 'alle' }) },
  { label: 'Keine', preset: () => ({ typ: 'keine' }) },
  { label: 'Erste & Letzte', preset: () => ({ typ: 'erste_und_letzte' }) },
]

const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie']

export function ReihenEditor({
  reihe,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
}: {
  reihe: Reihe
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onPresetApply: (preset: BesetzungsPreset) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
}) {
  const [n, setN] = useState(1)
  const anteil = berechneUnserAnteil(reihe.einheiten)

  return (
    <div>
      <h3>{reihe.titel}</h3>
      <p>
        {anteil.anzahl} von {anteil.gesamt} Einheiten ({Math.round(anteil.anteil * 100)}%)
      </p>
      <div>
        {PRESETS.map(({ label, preset }) => (
          <button key={label} onClick={() => onPresetApply(preset(n))}>
            {label}
          </button>
        ))}
        <button onClick={() => onPresetApply({ typ: 'erste_n', n })}>Erste {n}</button>
        <button onClick={() => onPresetApply({ typ: 'letzte_n', n })}>Letzte {n}</button>
        <button onClick={() => onPresetApply({ typ: 'jede_n_te', n })}>Jede {n}. Einheit</button>
        <input type="number" min={1} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: '3rem' }} />
      </div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Datum/KW</th>
            <th>Unterrichtszeit (min)</th>
            <th>Thema</th>
            <th>Wir begleiten</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {reihe.einheiten.map((e) => (
            <tr key={e.id}>
              <td>{e.index}</td>
              <td>
                <input
                  type="text"
                  value={e.datum_oder_kw}
                  placeholder="YYYY-MM-DD oder YYYY-KWnn"
                  onChange={(ev) => onEinheitFelderChange(e.id, { datum_oder_kw: ev.target.value })}
                  style={{ width: '10rem' }}
                />
              </td>
              <td>
                <input
                  type="number"
                  step={5}
                  min={0}
                  value={Math.round(e.kontaktzeit_h * 60)}
                  onChange={(ev) => onEinheitFelderChange(e.id, { kontaktzeit_h: Number(ev.target.value) / 60 })}
                  style={{ width: '5rem' }}
                />
              </td>
              <td>
                <select
                  aria-label={`Thema für Termin ${e.index} in ${reihe.titel}`}
                  value={e.thema ?? ''}
                  onChange={(ev) =>
                    onEinheitFelderChange(e.id, { thema: ev.target.value === '' ? undefined : (ev.target.value as Thema) })
                  }
                >
                  <option value="">— kein Thema —</option>
                  {THEMEN.map((thema) => (
                    <option key={thema} value={thema}>
                      {thema}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={e.wir_begleiten}
                  onChange={(ev) => onEinheitToggle(e.id, ev.target.checked)}
                />
              </td>
              <td>
                <button onClick={() => onEinheitRemove(e.id)} aria-label={`Termin ${e.index} in ${reihe.titel} löschen`}>
                  🗑
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onEinheitAdd}>+ Termin hinzufügen</button>
    </div>
  )
}
```

- [ ] **Step 5: Thread the extended patch type through `SchuleAkkordionItem` and `SchulenAccordion`**

In `src/components/SchuleAkkordionItem.tsx`, replace:

```ts
import { ReihenEditor } from './ReihenEditor'
import type { BesetzungsPreset, Schule, Settings } from '../lib/types'
```

with:

```ts
import { ReihenEditor } from './ReihenEditor'
import type { BesetzungsPreset, Schule, Settings, Thema } from '../lib/types'
```

and replace:

```ts
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number }
  ) => void
```

with:

```ts
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
```

In `src/components/SchulenAccordion.tsx`, replace:

```ts
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import type { BesetzungsPreset, Schule, Settings } from '../lib/types'
import './SchulenAccordion.css'
```

with:

```ts
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import type { BesetzungsPreset, Schule, Settings, Thema } from '../lib/types'
import './SchulenAccordion.css'
```

and replace:

```ts
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number }
  ) => void
```

with:

```ts
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
```

- [ ] **Step 6: Extend `setEinheitFelder` in `useAppData`**

In `src/state/useAppData.ts`, replace:

```ts
  function setEinheitFelder(
    reiheId: string,
    einheitId: string,
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h'>>
  ) {
```

with:

```ts
  function setEinheitFelder(
    reiheId: string,
    einheitId: string,
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema'>>
  ) {
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 8: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.tsx src/components/SchulenAccordion.tsx src/state/useAppData.ts
git commit -m "feat(berechnungstool): add Einheit.thema and rename Kontaktzeit label to Unterrichtszeit"
```

---

### Task 4: Terminstatus dropdown in `ReihenEditor`

**Files:**
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/components/SchulenAccordion.css`
- Modify: `src/state/useAppData.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ReihenEditor.test.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`
- Modify: `src/state/useAppData.test.ts`

**Interfaces:**
- Consumes: `Reihe.terminstatus`, `Terminstatus` type (Task 2).
- Produces: `ReihenEditor` prop `onTerminstatusChange: (wert: Terminstatus) => void`; `useAppData().setReiheTerminstatus(reiheId: string, terminstatus: Terminstatus): void` — used by Task 13 tests as an example of the state-update pattern (no direct code dependency).

- [ ] **Step 1: Write the failing tests**

In `src/components/ReihenEditor.test.tsx`, replace the `renderReihenEditor` helper:

```ts
function renderReihenEditor() {
  const props = {
    reihe,
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}
```

with:

```ts
function renderReihenEditor() {
  const props = {
    reihe,
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}
```

Append these tests inside the `describe('ReihenEditor', ...)` block, after the last existing `it`:

```ts

  it('shows the current Terminstatus in the dropdown', () => {
    renderReihenEditor()
    const terminstatusSelect = screen.getByRole('combobox', { name: 'Terminstatus' }) as HTMLSelectElement
    expect(terminstatusSelect.value).toBe('festgelegt')
  })

  it('calls onTerminstatusChange when the Terminstatus dropdown changes', () => {
    const props = renderReihenEditor()
    const terminstatusSelect = screen.getByRole('combobox', { name: 'Terminstatus' })
    fireEvent.change(terminstatusSelect, { target: { value: 'offen' } })
    expect(props.onTerminstatusChange).toHaveBeenCalledWith('offen')
  })

  it('shows an "offen" badge only when Terminstatus is offen', () => {
    const { rerender } = render(
      <ReihenEditor
        reihe={reihe}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
      />
    )
    expect(screen.queryByText(/zählt nicht in der Bedarfsrechnung/)).not.toBeInTheDocument()
    rerender(
      <ReihenEditor
        reihe={{ ...reihe, terminstatus: 'offen' }}
        onEinheitToggle={vi.fn()}
        onPresetApply={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
      />
    )
    expect(screen.getByText(/zählt nicht in der Bedarfsrechnung/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: FAIL — no combobox named "Terminstatus" exists, and `onTerminstatusChange` is not an accepted prop.

- [ ] **Step 3: Add the Terminstatus dropdown and badge to `ReihenEditor`**

In `src/components/ReihenEditor.tsx`, replace:

```tsx
import { useState } from 'react'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe, Thema } from '../lib/types'
```

with:

```tsx
import { useState } from 'react'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe, Terminstatus, Thema } from '../lib/types'
```

Replace:

```tsx
export function ReihenEditor({
  reihe,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
}: {
  reihe: Reihe
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onPresetApply: (preset: BesetzungsPreset) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
}) {
  const [n, setN] = useState(1)
  const anteil = berechneUnserAnteil(reihe.einheiten)

  return (
    <div>
      <h3>{reihe.titel}</h3>
      <p>
        {anteil.anzahl} von {anteil.gesamt} Einheiten ({Math.round(anteil.anteil * 100)}%)
      </p>
      <div>
```

with:

```tsx
export function ReihenEditor({
  reihe,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
}: {
  reihe: Reihe
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onPresetApply: (preset: BesetzungsPreset) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (wert: Terminstatus) => void
}) {
  const [n, setN] = useState(1)
  const anteil = berechneUnserAnteil(reihe.einheiten)

  return (
    <div>
      <h3>{reihe.titel}</h3>
      <p>
        {anteil.anzahl} von {anteil.gesamt} Einheiten ({Math.round(anteil.anteil * 100)}%)
      </p>
      <div>
        <label>
          Terminstatus:{' '}
          <select
            aria-label="Terminstatus"
            value={reihe.terminstatus}
            onChange={(ev) => onTerminstatusChange(ev.target.value as Terminstatus)}
          >
            <option value="festgelegt">Festgelegt</option>
            <option value="teilweise_festgelegt">Teilweise festgelegt</option>
            <option value="offen">Offen</option>
          </select>
        </label>
        {reihe.terminstatus === 'offen' && (
          <span className="terminstatus-badge">offen – zählt nicht in der Bedarfsrechnung</span>
        )}
      </div>
      <div>
```

- [ ] **Step 4: Add the badge style**

In `src/components/SchulenAccordion.css`, append at the end of the file:

```css

.terminstatus-badge {
  color: #b45309;
  font-size: 0.85rem;
  margin-left: 0.5rem;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 6: Wire `onTerminstatusChange` through `SchuleAkkordionItem` and `SchulenAccordion`**

In `src/components/SchuleAkkordionItem.test.tsx`, replace the `renderItem` helper:

```ts
function renderItem() {
  const props = {
    schule,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
  }
  render(<SchuleAkkordionItem {...props} />)
  return props
}
```

with:

```ts
function renderItem() {
  const props = {
    schule,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
  }
  render(<SchuleAkkordionItem {...props} />)
  return props
}
```

Also replace the second, inline props object in the `'shows the Schule-specific Koordination override...'` test:

```ts
    const props = {
      schule: { ...schule, koordination_h_pro_monat: 0.5 },
      settings,
      onKoordinationChange: vi.fn(),
      onEinheitToggle: vi.fn(),
      onPresetApply: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
    }
```

with:

```ts
    const props = {
      schule: { ...schule, koordination_h_pro_monat: 0.5 },
      settings,
      onKoordinationChange: vi.fn(),
      onEinheitToggle: vi.fn(),
      onPresetApply: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
      onTerminstatusChange: vi.fn(),
    }
```

Append this test after the last existing `it` in the `describe('SchuleAkkordionItem', ...)` block:

```ts

  it('calls onTerminstatusChange with the correct Reihe id when the Terminstatus dropdown changes', () => {
    const props = renderItem()
    const reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    const terminstatusSelect = within(reiheZweiContainer).getByRole('combobox', { name: 'Terminstatus' })
    fireEvent.change(terminstatusSelect, { target: { value: 'offen' } })
    expect(props.onTerminstatusChange).toHaveBeenCalledWith('r2', 'offen')
  })
```

Run: `npx vitest run src/components/SchuleAkkordionItem.test.tsx`
Expected: FAIL — `SchuleAkkordionItem` doesn't accept or forward `onTerminstatusChange` yet.

In `src/components/SchuleAkkordionItem.tsx`, replace:

```ts
import { ReihenEditor } from './ReihenEditor'
import type { BesetzungsPreset, Schule, Settings, Thema } from '../lib/types'

export function SchuleAkkordionItem({
  schule,
  settings,
  onKoordinationChange,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
}: {
  schule: Schule
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onPresetApply: (reiheId: string, preset: BesetzungsPreset) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
}) {
```

with:

```ts
import { ReihenEditor } from './ReihenEditor'
import type { BesetzungsPreset, Schule, Settings, Terminstatus, Thema } from '../lib/types'

export function SchuleAkkordionItem({
  schule,
  settings,
  onKoordinationChange,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
}: {
  schule: Schule
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onPresetApply: (reiheId: string, preset: BesetzungsPreset) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
}) {
```

Replace:

```tsx
            <ReihenEditor
              reihe={reihe}
              onEinheitToggle={(einheitId, wert) => onEinheitToggle(reihe.id, einheitId, wert)}
              onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
            />
```

with:

```tsx
            <ReihenEditor
              reihe={reihe}
              onEinheitToggle={(einheitId, wert) => onEinheitToggle(reihe.id, einheitId, wert)}
              onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
            />
```

Run: `npx vitest run src/components/SchuleAkkordionItem.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 7: Wire `onTerminstatusChange` through `SchulenAccordion`**

In `src/components/SchulenAccordion.test.tsx`, replace the `renderAccordion` helper:

```ts
function renderAccordion() {
  const props = {
    schulen,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
  }
  render(<SchulenAccordion {...props} />)
  return props
}
```

with:

```ts
function renderAccordion() {
  const props = {
    schulen,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
  }
  render(<SchulenAccordion {...props} />)
  return props
}
```

Append this test after the last existing `it`:

```ts

  it('forwards onTerminstatusChange with the correct Reihe id for a specific Schule', () => {
    const props = renderAccordion()
    const reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    const terminstatusSelect = within(reiheZweiContainer).getByRole('combobox', { name: 'Terminstatus' })
    fireEvent.change(terminstatusSelect, { target: { value: 'teilweise_festgelegt' } })
    expect(props.onTerminstatusChange).toHaveBeenCalledWith('r2', 'teilweise_festgelegt')
  })
```

Run: `npx vitest run src/components/SchulenAccordion.test.tsx`
Expected: FAIL — `SchulenAccordion` doesn't accept or forward `onTerminstatusChange` yet.

In `src/components/SchulenAccordion.tsx`, replace:

```ts
import type { BesetzungsPreset, Schule, Settings, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  onKoordinationChange,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
}: {
  schulen: Schule[]
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
}) {
```

with:

```ts
import type { BesetzungsPreset, Schule, Settings, Terminstatus, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  onKoordinationChange,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
}: {
  schulen: Schule[]
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
}) {
```

Replace:

```tsx
        <SchuleAkkordionItem
          key={schule.id}
          schule={schule}
          settings={settings}
          onKoordinationChange={onKoordinationChange}
          onEinheitToggle={onEinheitToggle}
          onPresetApply={onPresetApply}
          onEinheitAdd={onEinheitAdd}
          onEinheitRemove={onEinheitRemove}
          onEinheitFelderChange={onEinheitFelderChange}
        />
```

with:

```tsx
        <SchuleAkkordionItem
          key={schule.id}
          schule={schule}
          settings={settings}
          onKoordinationChange={onKoordinationChange}
          onEinheitToggle={onEinheitToggle}
          onPresetApply={onPresetApply}
          onEinheitAdd={onEinheitAdd}
          onEinheitRemove={onEinheitRemove}
          onEinheitFelderChange={onEinheitFelderChange}
          onTerminstatusChange={onTerminstatusChange}
        />
```

Run: `npx vitest run src/components/SchulenAccordion.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 8: Add `setReiheTerminstatus` to `useAppData`**

In `src/state/useAppData.test.ts`, append this test after the last existing `it` in the `describe('useAppData', ...)` block:

```ts

  it('setReiheTerminstatus updates only the matching Reihe and leaves others unchanged', () => {
    const { result } = renderHook(() => useAppData())
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
```

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `result.current.setReiheTerminstatus is not a function`.

In `src/state/useAppData.ts`, replace the import line:

```ts
import type { Datenbestand, Einheit, Person } from '../lib/types'
```

with:

```ts
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'
```

Add this function after `setEinheitFelder` (after its closing `}`, before `addUmverteilung`):

```ts

  function setReiheTerminstatus(reiheId: string, terminstatus: Terminstatus) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => (reihe.id === reiheId ? { ...reihe, terminstatus } : reihe)),
      })),
    }))
  }
```

Add `setReiheTerminstatus` to the returned object, right after `setEinheitFelder,`:

```ts
    setEinheitFelder,
    setReiheTerminstatus,
```

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 9: Wire it into `App.tsx`**

In `src/App.tsx`, replace:

```tsx
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addUmverteilung,
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
    addUmverteilung,
```

Replace:

```tsx
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        onKoordinationChange={setSchuleKoordination}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
      />
```

with:

```tsx
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        onKoordinationChange={setSchuleKoordination}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
        onTerminstatusChange={setReiheTerminstatus}
      />
```

- [ ] **Step 10: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx src/components/SchulenAccordion.css src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): add Terminstatus dropdown and offen badge to ReihenEditor"
```

---

### Task 5: `generiereWochentlicheTermine` — weekly term generation

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/kalenderwochen.ts`
- Modify: `src/lib/kalenderwochen.test.ts`

**Interfaces:**
- Consumes: `istWocheInFerien` (existing, same file); `Einheit`, `FerienZeitraum` types (existing).
- Produces: `generiereWochentlicheTermine(reiheId: string, startdatum: string, unterrichtszeitH: number, anzahlTermine: number, ferien: FerienZeitraum[]): Einheit[]` — used by Task 6.

- [ ] **Step 1: Loosen `Muster` for the quick-setup case**

In `src/lib/types.ts`, replace:

```ts
export interface Muster {
  typ: 'woechentlich'
  von: string
  bis: string
  kontaktzeit_h: number
}
```

with:

```ts
export interface Muster {
  typ: 'woechentlich'
  von: string
  bis?: string
  anzahl_termine?: number
  kontaktzeit_h: number
}
```

- [ ] **Step 2: Write the failing tests**

In `src/lib/kalenderwochen.test.ts`, replace the import line:

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
  formatWochenspanne,
  generiereWochentlicheTermine,
} from './kalenderwochen'
```

Append this `describe` block at the end of the file:

```ts

describe('generiereWochentlicheTermine', () => {
  it('generates exactly anzahlTermine weekly Einheiten, skipping Ferienwochen without counting them', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-10-12', 1.5, 3, [herbstferien])
    expect(einheiten).toHaveLength(3)
    expect(einheiten.map((e) => e.datum_oder_kw)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
    expect(einheiten.map((e) => e.index)).toEqual([1, 2, 3])
  })

  it('marks only the first generated Termin as erstdurchfuehrung', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-09-07', 1.5, 3, [])
    expect(einheiten.map((e) => e.erstdurchfuehrung)).toEqual([true, false, false])
  })

  it('uses the given unterrichtszeitH as kontaktzeit_h for every generated Termin', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-09-07', 2, 2, [])
    expect(einheiten.every((e) => e.kontaktzeit_h === 2)).toBe(true)
  })

  it('ids each generated Termin uniquely using the reiheId and its position', () => {
    const einheiten = generiereWochentlicheTermine('reihe_test', '2026-09-07', 1.5, 2, [])
    expect(einheiten.map((e) => e.id)).toEqual(['reihe_test_termin_1', 'reihe_test_termin_2'])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: FAIL — `generiereWochentlicheTermine is not a function`.

- [ ] **Step 4: Implement `generiereWochentlicheTermine`**

Append this function at the end of `src/lib/kalenderwochen.ts` (after `formatWochenspanne`):

```ts

export function generiereWochentlicheTermine(
  reiheId: string,
  startdatum: string,
  unterrichtszeitH: number,
  anzahlTermine: number,
  ferien: FerienZeitraum[]
): Einheit[] {
  const einheiten: Einheit[] = []
  let cursor = parseISO(startdatum)
  let index = 0
  while (index < anzahlTermine) {
    if (!istWocheInFerien(cursor, ferien)) {
      index += 1
      einheiten.push({
        id: `${reiheId}_termin_${index}`,
        index,
        datum_oder_kw: format(cursor, 'yyyy-MM-dd'),
        kontaktzeit_h: unterrichtszeitH,
        personen_parallel: 1,
        erstdurchfuehrung: index === 1,
        wir_begleiten: true,
        typ: 'regulaer',
      })
    }
    cursor = addWeeks(cursor, 1)
  }
  return einheiten
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 6: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/kalenderwochen.ts src/lib/kalenderwochen.test.ts
git commit -m "feat(berechnungstool): add generiereWochentlicheTermine for quick series setup"
```

---

### Task 6: Quick-setup UI — Unterrichtszeit/Startdatum/Anzahl Termine + "Termine generieren"

**Files:**
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/state/useAppData.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/ReihenEditor.test.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`
- Modify: `src/state/useAppData.test.ts`

**Interfaces:**
- Consumes: `generiereWochentlicheTermine` (Task 5); `FerienZeitraum` type (existing).
- Produces: `ReihenEditor` prop `onTermineGenerieren: (startdatum: string, unterrichtszeitH: number, anzahlTermine: number) => void`; `useAppData().setReiheEinheiten(reiheId: string, einheiten: Einheit[]): void`.

- [ ] **Step 1: Write the failing tests for `ReihenEditor`**

In `src/components/ReihenEditor.test.tsx`, replace the `renderReihenEditor` helper again:

```ts
function renderReihenEditor() {
  const props = {
    reihe,
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}
```

with:

```ts
function renderReihenEditor() {
  const props = {
    reihe,
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onTermineGenerieren: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}
```

Append these tests after the last existing `it` in `describe('ReihenEditor', ...)`:

```ts

  it('calls onTermineGenerieren with the entered Startdatum, Unterrichtszeit in hours, and Anzahl Termine', () => {
    const reiheOhneTermine = { ...reihe, einheiten: [] }
    const props = {
      reihe: reiheOhneTermine,
      onEinheitToggle: vi.fn(),
      onPresetApply: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
      onTerminstatusChange: vi.fn(),
      onTermineGenerieren: vi.fn(),
    }
    render(<ReihenEditor {...props} />)
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Startdatum'), { target: { value: '2026-09-07' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Unterrichtszeit'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Anzahl Termine'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('2026-09-07', 1.5, 4)
  })

  it('asks for confirmation before generating when the Reihe already has Termine, and skips the call when cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(window.confirm).toHaveBeenCalled()
    expect(props.onTermineGenerieren).not.toHaveBeenCalled()
  })

  it('proceeds with generation when the confirmation dialog is accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: FAIL — no labeled elements "Schnelleinrichtung Startdatum" etc. exist, and `onTermineGenerieren` is not an accepted prop.

- [ ] **Step 3: Add the quick-setup block to `ReihenEditor`**

In `src/components/ReihenEditor.tsx`, replace the import line:

```tsx
import { useState } from 'react'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe, Terminstatus, Thema } from '../lib/types'
```

with:

```tsx
import { useState } from 'react'
import { format } from 'date-fns'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe, Terminstatus, Thema } from '../lib/types'
```

Replace:

```tsx
export function ReihenEditor({
  reihe,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
}: {
  reihe: Reihe
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onPresetApply: (preset: BesetzungsPreset) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (wert: Terminstatus) => void
}) {
  const [n, setN] = useState(1)
  const anteil = berechneUnserAnteil(reihe.einheiten)

  return (
    <div>
      <h3>{reihe.titel}</h3>
      <p>
        {anteil.anzahl} von {anteil.gesamt} Einheiten ({Math.round(anteil.anteil * 100)}%)
      </p>
      <div>
        <label>
          Terminstatus:{' '}
```

with:

```tsx
export function ReihenEditor({
  reihe,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
}: {
  reihe: Reihe
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onPresetApply: (preset: BesetzungsPreset) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (wert: Terminstatus) => void
  onTermineGenerieren: (startdatum: string, unterrichtszeitH: number, anzahlTermine: number) => void
}) {
  const [n, setN] = useState(1)
  const anteil = berechneUnserAnteil(reihe.einheiten)
  const [schnellStartdatum, setSchnellStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [schnellUnterrichtszeitMin, setSchnellUnterrichtszeitMin] = useState(90)
  const [schnellAnzahlTermine, setSchnellAnzahlTermine] = useState(reihe.einheiten.length || 1)

  function termineGenerieren() {
    if (reihe.einheiten.length > 0) {
      const bestaetigt = window.confirm('Die bestehenden Termine dieser Reihe werden ersetzt. Fortfahren?')
      if (!bestaetigt) return
    }
    onTermineGenerieren(schnellStartdatum, schnellUnterrichtszeitMin / 60, schnellAnzahlTermine)
  }

  return (
    <div>
      <h3>{reihe.titel}</h3>
      <p>
        {anteil.anzahl} von {anteil.gesamt} Einheiten ({Math.round(anteil.anteil * 100)}%)
      </p>
      <div className="schnelleinrichtung">
        <label>
          Startdatum:{' '}
          <input
            type="date"
            aria-label="Schnelleinrichtung Startdatum"
            value={schnellStartdatum}
            onChange={(ev) => setSchnellStartdatum(ev.target.value)}
          />
        </label>
        <label>
          Unterrichtszeit (min):{' '}
          <input
            type="number"
            step={5}
            min={0}
            aria-label="Schnelleinrichtung Unterrichtszeit"
            value={schnellUnterrichtszeitMin}
            onChange={(ev) => setSchnellUnterrichtszeitMin(Number(ev.target.value))}
            style={{ width: '5rem' }}
          />
        </label>
        <label>
          Anzahl Termine:{' '}
          <input
            type="number"
            min={1}
            aria-label="Schnelleinrichtung Anzahl Termine"
            value={schnellAnzahlTermine}
            onChange={(ev) => setSchnellAnzahlTermine(Number(ev.target.value))}
            style={{ width: '4rem' }}
          />
        </label>
        <button onClick={termineGenerieren}>Termine generieren</button>
      </div>
      <div>
        <label>
          Terminstatus:{' '}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Wire `onTermineGenerieren` through `SchuleAkkordionItem`**

In `src/components/SchuleAkkordionItem.test.tsx`, replace the `renderItem` helper:

```ts
function renderItem() {
  const props = {
    schule,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
  }
  render(<SchuleAkkordionItem {...props} />)
  return props
}
```

with:

```ts
function renderItem() {
  const props = {
    schule,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onPresetApply: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onTermineGenerieren: vi.fn(),
  }
  render(<SchuleAkkordionItem {...props} />)
  return props
}
```

Also add `onTermineGenerieren: vi.fn(),` to the inline props object in the `'shows the Schule-specific Koordination override...'` test, right after `onTerminstatusChange: vi.fn(),`.

Append this test after the last existing `it`:

```ts

  it("calls onTermineGenerieren with the correct Reihe id when that Reihe's quick-setup button is clicked", () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const props = renderItem()
    const reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheZweiContainer).getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('r2', expect.any(String), expect.any(Number), expect.any(Number))
  })
```

Run: `npx vitest run src/components/SchuleAkkordionItem.test.tsx`
Expected: FAIL — `SchuleAkkordionItem` doesn't accept or forward `onTermineGenerieren` yet.

In `src/components/SchuleAkkordionItem.tsx`, replace:

```ts
  onEinheitFelderChange,
  onTerminstatusChange,
}: {
  schule: Schule
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onPresetApply: (reiheId: string, preset: BesetzungsPreset) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
}) {
```

with:

```ts
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
}: {
  schule: Schule
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onPresetApply: (reiheId: string, preset: BesetzungsPreset) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onTermineGenerieren: (reiheId: string, startdatum: string, unterrichtszeitH: number, anzahlTermine: number) => void
}) {
```

Replace:

```tsx
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
            />
```

with:

```tsx
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
              onTermineGenerieren={(startdatum, unterrichtszeitH, anzahlTermine) =>
                onTermineGenerieren(reihe.id, startdatum, unterrichtszeitH, anzahlTermine)
              }
            />
```

Run: `npx vitest run src/components/SchuleAkkordionItem.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 6: Wire `ferien` and `onEinheitenReplace` through `SchulenAccordion`**

In `src/components/SchulenAccordion.test.tsx`, replace the `renderAccordion` helper:

```ts
function renderAccordion() {
  const props = {
    schulen,
    settings,
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
  }
  render(<SchulenAccordion {...props} />)
  return props
}
```

with:

```ts
function renderAccordion() {
  const props = {
    schulen,
    settings,
    ferien: [],
    onKoordinationChange: vi.fn(),
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onEinheitenReplace: vi.fn(),
  }
  render(<SchulenAccordion {...props} />)
  return props
}
```

Append this test after the last existing `it`:

```ts

  it('generates weekly Termine for the correct Reihe via onEinheitenReplace', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const props = renderAccordion()
    const reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    const reiheZwei = within(reiheZweiContainer)
    fireEvent.change(reiheZwei.getByLabelText('Schnelleinrichtung Startdatum'), { target: { value: '2026-09-07' } })
    fireEvent.change(reiheZwei.getByLabelText('Schnelleinrichtung Unterrichtszeit'), { target: { value: '90' } })
    fireEvent.change(reiheZwei.getByLabelText('Schnelleinrichtung Anzahl Termine'), { target: { value: '2' } })
    fireEvent.click(reiheZwei.getByText('Termine generieren'))
    expect(props.onEinheitenReplace).toHaveBeenCalledWith('r2', [
      expect.objectContaining({ datum_oder_kw: '2026-09-07', kontaktzeit_h: 1.5 }),
      expect.objectContaining({ datum_oder_kw: '2026-09-14', kontaktzeit_h: 1.5 }),
    ])
  })
```

Run: `npx vitest run src/components/SchulenAccordion.test.tsx`
Expected: FAIL — `SchulenAccordion` doesn't accept `ferien`/`onEinheitenReplace` yet.

In `src/components/SchulenAccordion.tsx`, replace:

```ts
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import type { BesetzungsPreset, Schule, Settings, Terminstatus, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  onKoordinationChange,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
}: {
  schulen: Schule[]
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
}) {
  function onPresetApply(reiheId: string, preset: BesetzungsPreset) {
    for (const schule of schulen) {
      const reihe = schule.reihen.find((r) => r.id === reiheId)
      if (!reihe) continue
      const aktualisiert = wendeBesetzungPreset(reihe.einheiten, preset)
      aktualisiert.forEach((e) => onEinheitToggle(reiheId, e.id, e.wir_begleiten))
    }
  }

  return (
```

with:

```ts
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import { generiereWochentlicheTermine } from '../lib/kalenderwochen'
import type { BesetzungsPreset, Einheit, FerienZeitraum, Schule, Settings, Terminstatus, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  ferien,
  onKoordinationChange,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onEinheitenReplace,
}: {
  schulen: Schule[]
  settings: Settings
  ferien: FerienZeitraum[]
  onKoordinationChange: (schuleId: string, wert: number) => void
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onEinheitenReplace: (reiheId: string, einheiten: Einheit[]) => void
}) {
  function onPresetApply(reiheId: string, preset: BesetzungsPreset) {
    for (const schule of schulen) {
      const reihe = schule.reihen.find((r) => r.id === reiheId)
      if (!reihe) continue
      const aktualisiert = wendeBesetzungPreset(reihe.einheiten, preset)
      aktualisiert.forEach((e) => onEinheitToggle(reiheId, e.id, e.wir_begleiten))
    }
  }

  function onTermineGenerieren(reiheId: string, startdatum: string, unterrichtszeitH: number, anzahlTermine: number) {
    const einheiten = generiereWochentlicheTermine(reiheId, startdatum, unterrichtszeitH, anzahlTermine, ferien)
    onEinheitenReplace(reiheId, einheiten)
  }

  return (
```

Replace:

```tsx
              onTerminstatusChange={onTerminstatusChange}
            />
```

with:

```tsx
              onTerminstatusChange={onTerminstatusChange}
              onTermineGenerieren={onTermineGenerieren}
            />
```

Run: `npx vitest run src/components/SchulenAccordion.test.tsx`
Expected: PASS (all tests, including the new one).

- [ ] **Step 7: Add `setReiheEinheiten` to `useAppData`**

In `src/state/useAppData.test.ts`, append this test after the last existing `it`:

```ts

  it('setReiheEinheiten replaces the einheiten of the matching Reihe only', () => {
    const { result } = renderHook(() => useAppData())
    const reiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    const neueEinheiten = [
      {
        id: 'neu_1',
        index: 1,
        datum_oder_kw: '2027-03-01',
        kontaktzeit_h: 1.5,
        personen_parallel: 1,
        erstdurchfuehrung: true,
        wir_begleiten: true,
        typ: 'regulaer' as const,
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
```

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `result.current.setReiheEinheiten is not a function`.

In `src/state/useAppData.ts`, add this function after `setReiheTerminstatus` (after its closing `}`, before `addUmverteilung`):

```ts

  function setReiheEinheiten(reiheId: string, einheiten: Einheit[]) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => (reihe.id === reiheId ? { ...reihe, einheiten } : reihe)),
      })),
    }))
  }
```

Add `setReiheEinheiten` to the returned object, right after `setReiheTerminstatus,`:

```ts
    setReiheTerminstatus,
    setReiheEinheiten,
```

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 8: Wire it into `App.tsx`**

In `src/App.tsx`, replace:

```tsx
    setEinheitFelder,
    setReiheTerminstatus,
    addUmverteilung,
```

with:

```tsx
    setEinheitFelder,
    setReiheTerminstatus,
    setReiheEinheiten,
    addUmverteilung,
```

Replace:

```tsx
        onEinheitFelderChange={setEinheitFelder}
        onTerminstatusChange={setReiheTerminstatus}
      />
```

with:

```tsx
        onEinheitFelderChange={setEinheitFelder}
        onTerminstatusChange={setReiheTerminstatus}
        onEinheitenReplace={setReiheEinheiten}
        ferien={data.kalender.ferien}
      />
```

- [ ] **Step 9: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): add quick-setup Termine generieren to ReihenEditor"
```

---

### Task 7: `WochenHeatmap` tooltip shows a date range

**Files:**
- Modify: `src/components/WochenHeatmap.tsx`
- Modify: `src/components/WochenHeatmap.test.tsx`

**Interfaces:**
- Consumes: `formatWochenspanne` (Task 1).

- [ ] **Step 1: Update the failing test**

In `src/components/WochenHeatmap.test.tsx`, replace:

```tsx
describe('WochenHeatmap', () => {
  it('shows the auslastung percentage in the title for a regular week', () => {
    render(<WochenHeatmap wochen={[woche()]} />)
    expect(screen.getByTitle('2026-KW46: 41%')).toBeInTheDocument()
  })
```

with:

```tsx
describe('WochenHeatmap', () => {
  it('shows the auslastung percentage with a date-range title for a regular week', () => {
    render(<WochenHeatmap wochen={[woche()]} />)
    expect(screen.getByTitle('09.11.–15.11.2026: 41%')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/WochenHeatmap.test.tsx`
Expected: FAIL — the tooltip still shows the raw `2026-KW46` key.

- [ ] **Step 3: Implement the change**

In `src/components/WochenHeatmap.tsx`, replace:

```tsx
import './WochenHeatmap.css'
import type { WochenErgebnis } from '../lib/berechnung'
```

with:

```tsx
import './WochenHeatmap.css'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'
```

Replace:

```tsx
          title={w.istFerien ? `Ferien: ${w.ferienName}` : `${w.wochenKey}: ${Math.round(w.auslastung * 100)}%`}
```

with:

```tsx
          title={w.istFerien ? `Ferien: ${w.ferienName}` : `${formatWochenspanne(w.wochenKey)}: ${Math.round(w.auslastung * 100)}%`}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/WochenHeatmap.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/WochenHeatmap.tsx src/components/WochenHeatmap.test.tsx
git commit -m "feat(berechnungstool): show week date ranges in the WochenHeatmap tooltip"
```

---

### Task 8: `BedarfAngebotChart` tooltip shows a date range

**Files:**
- Modify: `src/components/BedarfAngebotChart.tsx`

**Interfaces:**
- Consumes: `formatWochenspanne` (Task 1).

No test file exists for this component today (it renders a `recharts`/`ResponsiveContainer` chart with no assertions anywhere in the project), so this task has no automated test, consistent with that existing precedent — it's verified manually in Final Verification.

- [ ] **Step 1: Implement the change**

In `src/components/BedarfAngebotChart.tsx`, replace:

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WochenErgebnis } from '../lib/berechnung'
import type { Settings } from '../lib/types'
```

with:

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'
import type { Settings } from '../lib/types'
```

Replace:

```tsx
        <XAxis dataKey="wochenKey" hide />
        <YAxis />
        <Tooltip />
```

with:

```tsx
        <XAxis dataKey="wochenKey" hide />
        <YAxis />
        <Tooltip labelFormatter={(label) => formatWochenspanne(String(label))} />
```

- [ ] **Step 2: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/BedarfAngebotChart.tsx
git commit -m "feat(berechnungstool): show week date range in BedarfAngebotChart tooltip"
```

---

### Task 9: `EngpassBericht` shows a date range

**Files:**
- Modify: `src/components/EngpassBericht.tsx`
- Modify: `src/components/EngpassBericht.test.tsx`

**Interfaces:**
- Consumes: `formatWochenspanne` (Task 1).

- [ ] **Step 1: Write the failing test**

In `src/components/EngpassBericht.test.tsx`, append this test after the last existing `it` in `describe('EngpassBericht', ...)`:

```tsx

  it('shows the week as a date range instead of a KW code', () => {
    render(<EngpassBericht topEngpaesse={[woche()]} />)
    expect(screen.getByText(/^09\.11\.–15\.11\.2026:/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/EngpassBericht.test.tsx`
Expected: FAIL — the list item still starts with the raw `2026-KW46` key.

- [ ] **Step 3: Implement the change**

In `src/components/EngpassBericht.tsx`, replace:

```tsx
import type { WochenErgebnis } from '../lib/berechnung'

export function EngpassBericht({ topEngpaesse }: { topEngpaesse: WochenErgebnis[] }) {
  return (
    <div>
      <h3>Top-Engpasswochen</h3>
      <ol>
        {topEngpaesse.map((w) => (
          <li key={w.wochenKey}>
            {w.wochenKey}: {Math.round(w.auslastung * 100)}% ({Math.round(w.bedarf * 10) / 10}h Bedarf (
```

with:

```tsx
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { WochenErgebnis } from '../lib/berechnung'

export function EngpassBericht({ topEngpaesse }: { topEngpaesse: WochenErgebnis[] }) {
  return (
    <div>
      <h3>Top-Engpasswochen</h3>
      <ol>
        {topEngpaesse.map((w) => (
          <li key={w.wochenKey}>
            {formatWochenspanne(w.wochenKey)}: {Math.round(w.auslastung * 100)}% ({Math.round(w.bedarf * 10) / 10}h Bedarf (
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/EngpassBericht.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/EngpassBericht.tsx src/components/EngpassBericht.test.tsx
git commit -m "feat(berechnungstool): show week date range in EngpassBericht"
```

---

### Task 10: `berechneThemenUebersicht` — pure data derivation

**Files:**
- Create: `src/lib/themenUebersicht.ts`
- Test: `src/lib/themenUebersicht.test.ts`

**Interfaces:**
- Consumes: `parseZuWochenKey` (existing, `kalenderwochen.ts`); `Datenbestand`, `Reihe.terminstatus`, `Einheit.thema` types (Task 2, Task 3).
- Produces: `ThemenZeile { wochenKey: string; schule: string; thema: string; stunden: number }`; `berechneThemenUebersicht(data: Datenbestand): ThemenZeile[]` — used by Task 11, Task 12.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/themenUebersicht.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { berechneThemenUebersicht } from './themenUebersicht'
import type { Datenbestand } from './types'

const settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

describe('berechneThemenUebersicht', () => {
  it('sums kontaktzeit_h per Woche/Schule/Thema across matching Einheiten', () => {
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
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'teilweise_festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 2, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
                { id: 'e2', index: 2, datum_oder_kw: '2026-09-08', kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Mobilität' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([{ wochenKey: '2026-KW37', schule: 'Else Lasker', thema: 'Mobilität', stunden: 3 }])
  })

  it('groups Einheiten without a thema under "Ohne Thema"', () => {
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
                { id: 'e1', index: 1, datum_oder_kw: '2026-11-09', kontaktzeit_h: 4, personen_parallel: 1, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([{ wochenKey: '2026-KW46', schule: 'WDG', thema: 'Ohne Thema', stunden: 4 }])
  })

  it('excludes Einheiten where wir_begleiten is false', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'x',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'B',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 2, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: false, typ: 'regulaer', thema: 'Energie' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([])
  })

  it('excludes Reihen with terminstatus "offen"', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'x',
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
                { id: 'e1', index: 1, datum_oder_kw: '2026-09-08', kontaktzeit_h: 2, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer', thema: 'Stadtgrün' },
              ],
            },
          ],
        },
      ],
    }
    expect(berechneThemenUebersicht(data)).toEqual([])
  })

  it('sorts rows chronologically by Woche, then alphabetically by Schule', () => {
    const reiheFuer = (id: string, datum: string) => ({
      id,
      titel: 'x',
      betreuungsmodell: 'A' as const,
      fahrzeit_h: 0,
      status: 'zugesagt',
      extern_betreut: false,
      terminstatus: 'festgelegt' as const,
      einheiten: [
        { id: `${id}_e`, index: 1, datum_oder_kw: datum, kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' as const, thema: 'Energie' as const },
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
    const zeilen = berechneThemenUebersicht(data)
    expect(zeilen.map((z) => `${z.wochenKey}/${z.schule}`)).toEqual(['2026-KW37/C-Schule', '2026-KW46/A-Schule', '2026-KW46/B-Schule'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/themenUebersicht.test.ts`
Expected: FAIL — cannot find module `./themenUebersicht`.

- [ ] **Step 3: Implement `berechneThemenUebersicht`**

Create `src/lib/themenUebersicht.ts`:

```ts
import { parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'

export interface ThemenZeile {
  wochenKey: string
  schule: string
  thema: string
  stunden: number
}

export function berechneThemenUebersicht(data: Datenbestand): ThemenZeile[] {
  const zeilenMap = new Map<string, ThemenZeile>()
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      if (reihe.terminstatus === 'offen') continue
      for (const einheit of reihe.einheiten) {
        if (!einheit.wir_begleiten) continue
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        const thema = einheit.thema ?? 'Ohne Thema'
        const schluessel = `${wochenKey}__${schule.name}__${thema}`
        const bestehend = zeilenMap.get(schluessel)
        if (bestehend) {
          bestehend.stunden += einheit.kontaktzeit_h
        } else {
          zeilenMap.set(schluessel, { wochenKey, schule: schule.name, thema, stunden: einheit.kontaktzeit_h })
        }
      }
    }
  }
  return Array.from(zeilenMap.values()).sort((a, b) =>
    a.wochenKey === b.wochenKey ? a.schule.localeCompare(b.schule) : a.wochenKey.localeCompare(b.wochenKey)
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/themenUebersicht.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/themenUebersicht.ts src/lib/themenUebersicht.test.ts
git commit -m "feat(berechnungstool): add berechneThemenUebersicht for the Schools x Weeks x Topic overview"
```

---

### Task 11: `ThemenUebersicht` component — responsive chart + table

**Files:**
- Create: `src/components/ThemenUebersicht.tsx`
- Test: `src/components/ThemenUebersicht.test.tsx`

**Interfaces:**
- Consumes: `ThemenZeile`, `berechneThemenUebersicht` output shape (Task 10); `formatWochenspanne` (Task 1); `Thema` type (Task 3).
- Produces: `ThemenUebersicht({ zeilen: ThemenZeile[] })` component — used by Task 12.

- [ ] **Step 1: Write the failing tests**

Create `src/components/ThemenUebersicht.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemenUebersicht } from './ThemenUebersicht'
import type { ThemenZeile } from '../lib/themenUebersicht'

describe('ThemenUebersicht', () => {
  it('renders one table row per Zeile with Woche as a date range, Schule, Thema, and Stunden', () => {
    const zeilen: ThemenZeile[] = [
      { wochenKey: '2026-KW46', schule: 'WDG', thema: 'Ohne Thema', stunden: 8 },
      { wochenKey: '2026-KW37', schule: 'Else Lasker', thema: 'Mobilität', stunden: 2 },
    ]
    render(<ThemenUebersicht zeilen={zeilen} />)
    expect(screen.getByText('09.11.–15.11.2026')).toBeInTheDocument()
    expect(screen.getByText('WDG')).toBeInTheDocument()
    expect(screen.getByText('Mobilität')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows a placeholder message when there are no Zeilen', () => {
    render(<ThemenUebersicht zeilen={[]} />)
    expect(screen.getByText(/Keine Einheiten/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/ThemenUebersicht.test.tsx`
Expected: FAIL — cannot find module `./ThemenUebersicht`.

- [ ] **Step 3: Implement `ThemenUebersicht`**

Create `src/components/ThemenUebersicht.tsx`:

```tsx
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { ThemenZeile } from '../lib/themenUebersicht'
import type { Thema } from '../lib/types'

const ALLE_THEMEN: (Thema | 'Ohne Thema')[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie', 'Ohne Thema']

const THEMEN_FARBEN: Record<Thema | 'Ohne Thema', string> = {
  Ernährung: '#e07a5f',
  Stadtgrün: '#3d9970',
  Mobilität: '#4a7fbf',
  Energie: '#e6b800',
  'Ohne Thema': '#9e9e9e',
}

export function ThemenUebersicht({ zeilen }: { zeilen: ThemenZeile[] }) {
  if (zeilen.length === 0) {
    return (
      <div>
        <h3>Themen-Übersicht</h3>
        <p>Keine Einheiten mit Terminstatus ungleich „offen" vorhanden.</p>
      </div>
    )
  }

  const wochenKeys = Array.from(new Set(zeilen.map((z) => z.wochenKey))).sort()
  const chartData = wochenKeys.map((wochenKey) => {
    const eintrag: Record<string, number | string> = { wochenspanne: formatWochenspanne(wochenKey) }
    for (const thema of ALLE_THEMEN) {
      eintrag[thema] = zeilen
        .filter((z) => z.wochenKey === wochenKey && z.thema === thema)
        .reduce((summe, z) => summe + z.stunden, 0)
    }
    return eintrag
  })
  const chartBreite = Math.max(600, wochenKeys.length * 60)

  return (
    <div>
      <h3>Themen-Übersicht</h3>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ width: `${chartBreite}px`, height: '20rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="wochenspanne" angle={-45} textAnchor="end" height={70} interval={0} />
              <YAxis label={{ value: 'Stunden', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              {ALLE_THEMEN.map((thema) => (
                <Bar key={thema} dataKey={thema} stackId="themen" fill={THEMEN_FARBEN[thema]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Woche</th>
            <th>Schule</th>
            <th>Thema</th>
            <th>Stunden</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={`${z.wochenKey}__${z.schule}__${z.thema}`}>
              <td>{formatWochenspanne(z.wochenKey)}</td>
              <td>{z.schule}</td>
              <td>{z.thema}</td>
              <td>{Math.round(z.stunden * 10) / 10}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ThemenUebersicht.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ThemenUebersicht.tsx src/components/ThemenUebersicht.test.tsx
git commit -m "feat(berechnungstool): add ThemenUebersicht table and responsive stacked bar chart"
```

---

### Task 12: Wire `ThemenUebersicht` into the app

**Files:**
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `berechneThemenUebersicht` (Task 10), `ThemenUebersicht` (Task 11).
- Produces: `useAppData().themenUebersicht: ThemenZeile[]`.

- [ ] **Step 1: Write the failing test**

In `src/state/useAppData.test.ts`, append this test after the last existing `it`:

```ts

  it('exposes themenUebersicht derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.themenUebersicht)).toBe(true)
    expect(result.current.themenUebersicht.length).toBeGreaterThan(0)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `result.current.themenUebersicht` is `undefined`.

- [ ] **Step 3: Compute and expose `themenUebersicht`**

In `src/state/useAppData.ts`, replace the import lines:

```ts
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'
```

with:

```ts
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import { berechneThemenUebersicht } from '../lib/themenUebersicht'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'
```

Replace:

```ts
  const ergebnis = useMemo(
    () => berechneSzenario(data, szenario, szenario === 'sensitivitaet' ? sensitivitaet : undefined),
    [data, szenario, sensitivitaet]
  )

  return {
    data,
```

with:

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Render `ThemenUebersicht` in `App.tsx`**

In `src/App.tsx`, replace:

```tsx
import { EngpassBericht } from './components/EngpassBericht'
```

with:

```tsx
import { EngpassBericht } from './components/EngpassBericht'
import { ThemenUebersicht } from './components/ThemenUebersicht'
```

Replace:

```tsx
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
```

with:

```tsx
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    themenUebersicht,
    exportJson,
```

Replace:

```tsx
      <div className="card">
        <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      </div>
      <h2>Schulen</h2>
```

with:

```tsx
      <div className="card">
        <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      </div>
      <div className="card">
        <ThemenUebersicht zeilen={themenUebersicht} />
      </div>
      <h2>Schulen</h2>
```

- [ ] **Step 6: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): wire ThemenUebersicht into the app"
```

---

### Task 13: Persistence — `localStorage` autosave, migration, and reset

**Files:**
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/components/ExportImport.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `useAppData().zuruecksetzen(): void`; `ExportImport` prop `zuruecksetzen: () => void`.

- [ ] **Step 1: Write the failing tests**

In `src/state/useAppData.test.ts`, replace the import line and add a `beforeEach`:

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppData } from './useAppData'

describe('useAppData', () => {
```

with:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppData } from './useAppData'

describe('useAppData', () => {
  beforeEach(() => {
    localStorage.clear()
  })

```

Append these tests after the last existing `it`:

```ts

  it('persists data to localStorage after a change and reloads it on next mount', () => {
    const { result, unmount } = renderHook(() => useAppData())
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    unmount()
    const { result: result2 } = renderHook(() => useAppData())
    expect(result2.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42)
  })

  it('falls back to seed data when localStorage contains invalid JSON', () => {
    localStorage.setItem('kapazitaetsrechner:data', 'not json')
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.personen.length).toBeGreaterThan(0)
  })

  it('defaults terminstatus to festgelegt when loading persisted data missing that field', () => {
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
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Test',
          reihen: [{ id: 'r1', titel: 'x', betreuungsmodell: 'A', fahrzeit_h: 0, status: 'zugesagt', extern_betreut: false, einheiten: [] }],
        },
      ],
    })
    localStorage.setItem('kapazitaetsrechner:data', roh)
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.schulen[0].reihen[0].terminstatus).toBe('festgelegt')
  })

  it('zuruecksetzen restores seed data and re-persists it', () => {
    const { result } = renderHook(() => useAppData())
    const urspruenglicheStunden = result.current.data.personen[0].stunden_pro_woche_fuer_begleitung
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    act(() => {
      result.current.zuruecksetzen()
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
    const gespeichert = JSON.parse(localStorage.getItem('kapazitaetsrechner:data')!)
    expect(gespeichert.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — data isn't persisted or reloaded yet, and `result.current.zuruecksetzen` is not a function.

- [ ] **Step 3: Implement persistence and migration**

In `src/state/useAppData.ts`, replace the import lines and the `PFLICHTFELDER` constant:

```ts
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import { berechneThemenUebersicht } from '../lib/themenUebersicht'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'

const PFLICHTFELDER = ['settings', 'personen', 'kalender', 'schulen'] as const
```

with:

```ts
import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import { berechneThemenUebersicht } from '../lib/themenUebersicht'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person, Terminstatus } from '../lib/types'

const PFLICHTFELDER = ['settings', 'personen', 'kalender', 'schulen'] as const
const STORAGE_KEY = 'kapazitaetsrechner:data'

function pruefePflichtfelder(geparst: unknown): geparst is Datenbestand {
  const istObjekt = typeof geparst === 'object' && geparst !== null
  return istObjekt && !PFLICHTFELDER.some((feld) => !(feld in (geparst as object)))
}

function migriereDatenbestand(d: Datenbestand): Datenbestand {
  return {
    ...d,
    schulen: d.schulen.map((schule) => ({
      ...schule,
      reihen: schule.reihen.map((reihe) => ({
        terminstatus: 'festgelegt' as Terminstatus,
        ...reihe,
      })),
    })),
  }
}

function ladeGespeicherteDaten(): Datenbestand | null {
  try {
    const roh = localStorage.getItem(STORAGE_KEY)
    if (!roh) return null
    const geparst = JSON.parse(roh)
    if (!pruefePflichtfelder(geparst)) return null
    return migriereDatenbestand(geparst as Datenbestand)
  } catch {
    return null
  }
}
```

Replace:

```ts
export function useAppData() {
  const [data, setData] = useState<Datenbestand>(seedData as Datenbestand)
  const [szenario, setSzenario] = useState<SzenarioTyp>('ziel')
  const [sensitivitaet, setSensitivitaet] = useState<SensitivitaetsParameter>({})
  const [importError, setImportError] = useState<string | null>(null)
```

with:

```ts
export function useAppData() {
  const [data, setData] = useState<Datenbestand>(() => ladeGespeicherteDaten() ?? (seedData as Datenbestand))
  const [szenario, setSzenario] = useState<SzenarioTyp>('ziel')
  const [sensitivitaet, setSensitivitaet] = useState<SensitivitaetsParameter>({})
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }, [data])
```

Replace the body of `importJson`:

```ts
  function importJson(json: string) {
    try {
      const geparst = JSON.parse(json)
      const istObjekt = typeof geparst === 'object' && geparst !== null
      const fehltFeld = !istObjekt || PFLICHTFELDER.some((feld) => !(feld in geparst))
      if (fehltFeld) {
        throw new Error(`JSON fehlt eines der Pflichtfelder: ${PFLICHTFELDER.join(', ')}`)
      }
      setData(geparst as Datenbestand)
      setImportError(null)
    } catch (fehler) {
      setImportError(fehler instanceof Error ? fehler.message : 'Import fehlgeschlagen: ungültiges JSON')
    }
  }
```

with:

```ts
  function importJson(json: string) {
    try {
      const geparst = JSON.parse(json)
      if (!pruefePflichtfelder(geparst)) {
        throw new Error(`JSON fehlt eines der Pflichtfelder: ${PFLICHTFELDER.join(', ')}`)
      }
      setData(migriereDatenbestand(geparst as Datenbestand))
      setImportError(null)
    } catch (fehler) {
      setImportError(fehler instanceof Error ? fehler.message : 'Import fehlgeschlagen: ungültiges JSON')
    }
  }

  function zuruecksetzen() {
    setData(seedData as Datenbestand)
  }
```

Add `zuruecksetzen` to the returned object, right after `importError,`:

```ts
    importError,
    zuruecksetzen,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS (all tests, including the 4 new ones).

- [ ] **Step 5: Add the "Zurücksetzen" button to `ExportImport`**

Replace the full contents of `src/components/ExportImport.tsx`:

```tsx
export function ExportImport({
  exportJson,
  importJson,
  importError,
  zuruecksetzen,
}: {
  exportJson: () => string
  importJson: (json: string) => void
  importError: string | null
  zuruecksetzen: () => void
}) {
  function herunterladen() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kapazitaetsrechner-daten.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function hochladen(event: React.ChangeEvent<HTMLInputElement>) {
    const datei = event.target.files?.[0]
    if (!datei) return
    const reader = new FileReader()
    reader.onload = () => importJson(reader.result as string)
    reader.readAsText(datei)
  }

  return (
    <div>
      <button onClick={herunterladen}>Als JSON exportieren</button>
      <input type="file" accept="application/json" onChange={hochladen} />
      <button onClick={zuruecksetzen}>Zurücksetzen auf Ausgangsdaten</button>
      {importError && <p role="alert" style={{ color: 'crimson' }}>{importError}</p>}
    </div>
  )
}
```

- [ ] **Step 6: Wire it into `App.tsx`**

In `src/App.tsx`, replace:

```tsx
    ergebnis,
    themenUebersicht,
    exportJson,
    importJson,
    importError,
  } = useAppData()
```

with:

```tsx
    ergebnis,
    themenUebersicht,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  } = useAppData()
```

Replace:

```tsx
        <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} />
```

with:

```tsx
        <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} zuruecksetzen={zuruecksetzen} />
```

- [ ] **Step 7: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts src/components/ExportImport.tsx src/App.tsx
git commit -m "feat(berechnungstool): persist edits to localStorage with migration and a reset button"
```

---

### Task 14: Seed data — Thema for Else Lasker's Parisa and Simone series

**Files:**
- Modify: `src/data/data.json`
- Modify: `src/data/data.test.ts`

**Interfaces:**
- Consumes: `Einheit.thema` (Task 3, optional field — this task's data addition cannot break compilation).

- [ ] **Step 1: Write the failing test**

In `src/data/data.test.ts`, append this test inside the `describe('seed data.json', ...)` block, after the last existing `it`:

```ts

  it('assigns Mobilität to the Parisa Einheiten and Ernährung to the Simone Einheiten at Else Lasker', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    const parisa = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_parisa')!
    const simone = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_simone')!
    expect(parisa.einheiten.every((e) => e.thema === 'Mobilität')).toBe(true)
    expect(simone.einheiten.every((e) => e.thema === 'Ernährung')).toBe(true)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/data.test.ts`
Expected: FAIL — every Einheit's `thema` is currently `undefined`.

- [ ] **Step 3: Add `thema` to the seed data**

In `src/data/data.json`, replace the Parisa Einheiten block:

```
          "einheiten": [
            { "id": "el_parisa_e1", "index": 1, "datum_oder_kw": "2026-09-08", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
            { "id": "el_parisa_e2", "index": 2, "datum_oder_kw": "2026-09-15", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer" },
            { "id": "el_parisa_e3", "index": 3, "datum_oder_kw": "2026-09-22", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "exkursion", "organisationspauschale_h": 2 },
            { "id": "el_parisa_e4", "index": 4, "datum_oder_kw": "2026-09-29", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer" }
          ]
```

with:

```
          "einheiten": [
            { "id": "el_parisa_e1", "index": 1, "datum_oder_kw": "2026-09-08", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer", "thema": "Mobilität" },
            { "id": "el_parisa_e2", "index": 2, "datum_oder_kw": "2026-09-15", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer", "thema": "Mobilität" },
            { "id": "el_parisa_e3", "index": 3, "datum_oder_kw": "2026-09-22", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "exkursion", "organisationspauschale_h": 2, "thema": "Mobilität" },
            { "id": "el_parisa_e4", "index": 4, "datum_oder_kw": "2026-09-29", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer", "thema": "Mobilität" }
          ]
```

Replace the Simone Einheiten block:

```
          "einheiten": [
            { "id": "el_simone_e1", "index": 1, "datum_oder_kw": "2027-01-11", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
            { "id": "el_simone_e2", "index": 2, "datum_oder_kw": "2027-01-18", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": true, "typ": "regulaer" },
            { "id": "el_simone_e3", "index": 3, "datum_oder_kw": "2027-01-25", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": true, "typ": "regulaer" },
            { "id": "el_simone_e4", "index": 4, "datum_oder_kw": "2027-02-01", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": false, "typ": "exkursion", "organisationspauschale_h": 2 },
            { "id": "el_simone_e5", "index": 5, "datum_oder_kw": "2027-02-08", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer" },
            { "id": "el_simone_e6", "index": 6, "datum_oder_kw": "2027-02-15", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer" }
          ]
```

with:

```
          "einheiten": [
            { "id": "el_simone_e1", "index": 1, "datum_oder_kw": "2027-01-11", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer", "thema": "Ernährung" },
            { "id": "el_simone_e2", "index": 2, "datum_oder_kw": "2027-01-18", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": true, "typ": "regulaer", "thema": "Ernährung" },
            { "id": "el_simone_e3", "index": 3, "datum_oder_kw": "2027-01-25", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": true, "typ": "regulaer", "thema": "Ernährung" },
            { "id": "el_simone_e4", "index": 4, "datum_oder_kw": "2027-02-01", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": false, "typ": "exkursion", "organisationspauschale_h": 2, "thema": "Ernährung" },
            { "id": "el_simone_e5", "index": 5, "datum_oder_kw": "2027-02-08", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer", "thema": "Ernährung" },
            { "id": "el_simone_e6", "index": 6, "datum_oder_kw": "2027-02-15", "kontaktzeit_h": 2, "personen_parallel": 1, "erstdurchfuehrung": false, "wir_begleiten": false, "typ": "regulaer", "thema": "Ernährung" }
          ]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/data.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Run the full test suite and the build**

Run: `npx vitest run`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/data.json src/data/data.test.ts
git commit -m "feat(berechnungstool): tag Else Lasker Parisa/Simone Einheiten with their Thema"
```

---

## Final Verification

- [ ] Run `npx vitest run` — all tests across the project pass.
- [ ] Run `npm run build` — TypeScript compiles cleanly and the Vite build succeeds.
- [ ] Run `npm run dev`, open the app, and confirm end-to-end:
  - The Wochen-Heatmap tooltips and the Top-Engpasswochen list show date ranges (e.g. "09.11.–15.11.2026") instead of KW codes.
  - Opening WDG's Reihe shows a Terminstatus dropdown set to "Festgelegt", and opening Sedanstraße's or Kothen's Reihe shows it set to "Offen" with the "zählt nicht in der Bedarfsrechnung" badge — and confirm the Ampel-Antwort/Heatmap workload is now lower than before this plan for the weeks that used to include Sedanstraße/Kothen's invented placeholder dates.
  - In any Reihe's editor, use the quick-setup fields (pick a Startdatum, an Unterrichtszeit, and an Anzahl Termine) and click "Termine generieren" — confirm it asks for confirmation if the Reihe already has Termine, and that accepting replaces the term list with the expected weekly dates (skipping Ferienwochen).
  - Set a Thema on an Einheit in the Termine table and confirm the new "Themen-Übersicht" section further down the page updates its table and chart accordingly; confirm the chart only shows weeks with actual activity and scrolls horizontally rather than squeezing all weeks into a fixed box.
  - Change a value anywhere in the tool, reload the browser tab, and confirm the change is still there (localStorage autosave). Click "Zurücksetzen auf Ausgangsdaten" and confirm it reverts to the shipped seed data.
  - Export a JSON file, make further changes, then import that file back and confirm the tool returns to the exported state.
