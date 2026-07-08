# Schulen: Koordination, Kurs-Verwaltung, Themenwoche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Koordination to the "Termine generieren" quick-setup (counted toward the assigned Begleitperson's capacity), remove the Besetzungs-Preset buttons, let users add/remove courses (Reihen) per school, and add a Themenwoche mechanism that shares Vorbereitungszeit once across schools jointly teaching a session.

**Architecture:** Four additive/simplifying changes to the existing `Schule → Reihe → Einheit` model and its `ReihenEditor` → `SchuleAkkordionItem` → `SchulenAccordion` → `App` prop-drilling chain. No new top-level data structures — Themenwoche is a free-text tag on `Einheit`, courses are ordinary array add/remove on `Schule.reihen`.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react.

## Global Constraints

- `generiereWochentlicheTermine`'s parameter order: `(reiheId, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine, ferien)` — Koordination goes right after Unterrichtszeit, mirroring the Schnelleinrichtung UI order.
- `onTermineGenerieren` callback signature throughout the chain: `(startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine)` (at `ReihenEditor` level, no `reiheId`); `(reiheId, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine)` at `SchuleAkkordionItem`/`SchulenAccordion` level.
- No confirmation dialogs on any new delete action (course removal) — matches the app's existing no-confirmation delete pattern (Termine, Umverteilungen, Ferien/Urlaub entries).
- Every step that changes code must leave `npm test` and `npm run build` passing.
- Follow TDD for all new behavior. Task 4 (verification) has no code changes.
- **Sequencing note for whoever dispatches this plan:** Tasks 1, 2, and 3 all edit `ReihenEditor.tsx`, `SchuleAkkordionItem.tsx`, `SchulenAccordion.tsx`, and `App.tsx` in sequence (each task builds on the previous task's edits to those same files). Before dispatching Task 2 or Task 3, re-read the current state of those four files rather than trusting this plan's "before" snippets verbatim — they describe the state *as of this plan being written*, not necessarily the state after a prior task's implementer made its own reasonable choices within scope.

---

### Task 1: Koordination in Termine generieren, Begleitperson-Kapazität, remove Besetzungs-Presets

**Files:**
- Modify: `src/lib/kalenderwochen.ts` (`generiereWochentlicheTermine`)
- Modify: `src/lib/kalenderwochen.test.ts`
- Modify: `src/lib/personenKapazitaet.ts` (`berechneZugewieseneStundenProWoche`)
- Modify: `src/lib/personenKapazitaet.test.ts`
- Modify: `src/lib/besetzung.ts` (remove `wendeBesetzungPreset`)
- Modify: `src/lib/besetzung.test.ts`
- Modify: `src/lib/types.ts` (remove `BesetzungsPreset`, `Reihe.besetzung`)
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/components/ReihenEditor.test.tsx`
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`

**Interfaces:**
- Produces: `generiereWochentlicheTermine(reiheId, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine, ferien): Einheit[]` — sets `koordinationszeit_h` on every generated Einheit.
- Produces: `onTermineGenerieren` signature grows a `koordinationszeitH: number` parameter at every layer (`ReihenEditor` → `SchuleAkkordionItem` → `SchulenAccordion`).
- Produces: `berechneZugewieseneStundenProWoche` (internal to `personenKapazitaet.ts`) now includes `koordinationszeit_h` in a person's deducted weekly hours — no signature change, consumed transparently by `berechnePersonenKapazitaet`.
- Removes: `wendeBesetzungPreset`, `BesetzungsPreset` type, `Reihe.besetzung`, `onPresetApply` at every layer.

- [ ] **Step 1: Write the failing tests for Koordination in `generiereWochentlicheTermine`**

In `src/lib/kalenderwochen.test.ts`, update the 4 existing `generiereWochentlicheTermine` calls (in `describe('generiereWochentlicheTermine', ...)`) to pass a `koordinationszeitH` argument (use `0` for all of them — they're not testing this behavior):

```ts
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
```

Add a new test directly after them, still inside the same `describe` block:

```ts
  it('uses the given koordinationszeitH as koordinationszeit_h for every generated Termin', () => {
    const einheiten = generiereWochentlicheTermine('reihe_x', '2026-09-07', 1.5, 0.5, 2, [])
    expect(einheiten.every((e) => e.koordinationszeit_h === 0.5)).toBe(true)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: FAIL — a TypeScript/argument-count mismatch (extra argument passed to a function that doesn't accept it yet) causes the new test and possibly others to fail; the new test specifically fails because `koordinationszeit_h` is `undefined`, not `0.5`.

- [ ] **Step 3: Implement `generiereWochentlicheTermine`'s new parameter**

In `src/lib/kalenderwochen.ts`, change:

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

to:

```ts
export function generiereWochentlicheTermine(
  reiheId: string,
  startdatum: string,
  unterrichtszeitH: number,
  koordinationszeitH: number,
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
        koordinationszeit_h: koordinationszeitH,
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: PASS (5 tests in the `generiereWochentlicheTermine` describe block).

- [ ] **Step 5: Write the failing test for Begleitperson-Kapazität including Koordination**

In `src/lib/personenKapazitaet.test.ts`, add this test inside `describe('berechnePersonenKapazitaet', ...)`, near the existing `'subtracts kontaktzeit_h from verbleibend...'` test:

```ts
  it("includes an assigned Einheit's koordinationszeit_h in zugewiesen and verbleibend, alongside kontaktzeit_h", () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 3, koordinationszeit_h: 1, datum_oder_kw: '2026-KW46' })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(4)
    expect(kw46.verbleibend).toBe(4)
  })
```

(`person()`'s default `stunden_pro_woche_fuer_begleitung` is 8, so `basis` is 8; `zugewiesen` = 3 + 1 = 4; `verbleibend` = 8 - 4 = 4.)

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run src/lib/personenKapazitaet.test.ts`
Expected: FAIL — `zugewiesen` is `3` (only `kontaktzeit_h`), not `4`.

- [ ] **Step 7: Implement the Koordination deduction**

In `src/lib/personenKapazitaet.ts`, change:

```ts
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        zugewiesen.set(wochenKey, (zugewiesen.get(wochenKey) ?? 0) + einheit.kontaktzeit_h)
```

to:

```ts
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        zugewiesen.set(wochenKey, (zugewiesen.get(wochenKey) ?? 0) + einheit.kontaktzeit_h + (einheit.koordinationszeit_h ?? 0))
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run src/lib/personenKapazitaet.test.ts`
Expected: PASS.

- [ ] **Step 9: Remove `wendeBesetzungPreset` and its tests**

In `src/lib/besetzung.ts`, delete the `wendeBesetzungPreset` function and the `BesetzungsPreset` import, leaving:

```ts
import type { Einheit } from './types'

export function berechneUnserAnteil(einheiten: Einheit[]): { anzahl: number; gesamt: number; anteil: number } {
  const anzahl = einheiten.filter((e) => e.wir_begleiten).length
  const gesamt = einheiten.length
  return { anzahl, gesamt, anteil: gesamt === 0 ? 0 : anzahl / gesamt }
}

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

In `src/lib/besetzung.test.ts`, remove the `import { wendeBesetzungPreset, ... }` (change to `import { berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from './besetzung'`) and delete the entire `describe('wendeBesetzungPreset', ...)` block (all 7 `it` cases). Leave `describe('berechneUnserAnteil', ...)` and `describe('ermittleHaeufigsteKontaktzeit', ...)` untouched.

- [ ] **Step 10: Remove `BesetzungsPreset` and `Reihe.besetzung` from the type model**

In `src/lib/types.ts`, delete:

```ts
export type BesetzungsPreset =
  | { typ: 'alle' }
  | { typ: 'keine' }
  | { typ: 'erste_n'; n: number }
  | { typ: 'letzte_n'; n: number }
  | { typ: 'erste_und_letzte' }
  | { typ: 'jede_n_te'; n: number }
  | { typ: 'manuell' }
```

and remove the `besetzung?: BesetzungsPreset` line from `Reihe`.

- [ ] **Step 11: Update `ReihenEditor.tsx`: add Koordination Schnelleinrichtung, remove presets**

Replace the whole file with:

```tsx
import { useState } from 'react'
import { format } from 'date-fns'
import { berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from '../lib/besetzung'
import type { Person, Reihe, Terminstatus, Thema } from '../lib/types'

const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie', 'Exkursion']

export function ReihenEditor({
  reihe,
  personen,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
}: {
  reihe: Reihe
  personen: Person[]
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null }
  ) => void
  onTerminstatusChange: (wert: Terminstatus) => void
  onTermineGenerieren: (startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) => void
}) {
  const anteil = berechneUnserAnteil(reihe.einheiten)
  const [schnellStartdatum, setSchnellStartdatum] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [schnellUnterrichtszeitMin, setSchnellUnterrichtszeitMin] = useState(() => {
    const haeufigste = ermittleHaeufigsteKontaktzeit(reihe.einheiten)
    return haeufigste !== null ? Math.round(haeufigste * 60) : 90
  })
  const [schnellKoordinationMin, setSchnellKoordinationMin] = useState(0)
  const [schnellAnzahlTermine, setSchnellAnzahlTermine] = useState(reihe.einheiten.length || 1)

  function termineGenerieren() {
    if (reihe.einheiten.length > 0) {
      const bestaetigt = window.confirm('Die bestehenden Termine dieser Reihe werden ersetzt. Fortfahren?')
      if (!bestaetigt) return
    }
    onTermineGenerieren(schnellStartdatum, schnellUnterrichtszeitMin / 60, schnellKoordinationMin / 60, schnellAnzahlTermine)
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
          Koordination (min):{' '}
          <input
            type="number"
            step={5}
            min={0}
            aria-label="Schnelleinrichtung Koordination"
            value={schnellKoordinationMin}
            onChange={(ev) => setSchnellKoordinationMin(Number(ev.target.value))}
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
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Datum/KW</th>
            <th>Unterrichtszeit (min)</th>
            <th>Koordination (min)</th>
            <th>Thema</th>
            <th>Wir begleiten</th>
            <th>Begleitperson</th>
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
                <select
                  aria-label={`Begleitperson für Termin ${e.index} in ${reihe.titel}`}
                  value={e.begleitperson_id ?? ''}
                  disabled={!e.wir_begleiten}
                  onChange={(ev) =>
                    onEinheitFelderChange(e.id, { begleitperson_id: ev.target.value === '' ? null : ev.target.value })
                  }
                >
                  <option value="">— niemand —</option>
                  {personen.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
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

(This removes the `PRESETS` array, the `n` state, and the whole preset-buttons `<div>`; adds the Koordination Schnelleinrichtung field; the table is otherwise unchanged from today.)

- [ ] **Step 12: Update `ReihenEditor.test.tsx`**

Remove every `onPresetApply: vi.fn()` line and every `onPresetApply={vi.fn()}` JSX attribute (there are 6 occurrences: the `renderReihenEditor()` helper's props object; the `'shows an "offen" badge only when Terminstatus is offen'` test, which has **two** — one in its initial `render(...)` and one in its `rerender(...)`; the inline `props` object in `'calls onTermineGenerieren with the entered Startdatum...'`; and one each in `'defaults the Schnelleinrichtung Unterrichtszeit...'` and `'falls back to 90 minutes...'`).

Change:

```ts
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('2026-09-07', 1.5, 4)
```

to:

```ts
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('2026-09-07', 1.5, 0, 4)
```

Add a new test directly after the `'calls onTermineGenerieren with the entered Startdatum, Unterrichtszeit in hours, and Anzahl Termine'` test:

```ts
  it('calls onTermineGenerieren with the entered Koordination in hours', () => {
    const reiheOhneTermine = { ...reihe, einheiten: [] }
    const props = {
      reihe: reiheOhneTermine,
      personen,
      onEinheitToggle: vi.fn(),
      onEinheitAdd: vi.fn(),
      onEinheitRemove: vi.fn(),
      onEinheitFelderChange: vi.fn(),
      onTerminstatusChange: vi.fn(),
      onTermineGenerieren: vi.fn(),
    }
    render(<ReihenEditor {...props} />)
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Startdatum'), { target: { value: '2026-09-07' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Unterrichtszeit'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Koordination'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('Schnelleinrichtung Anzahl Termine'), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Termine generieren'))
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('2026-09-07', 1.5, 0.25, 4)
  })
```

**Do not touch** the `'shows Kontaktzeit in minutes, converted from the stored hours'` test (`eingaben[3]`/`eingaben[5]` indices) — adding the Koordination Schnelleinrichtung input and removing the preset `n` input net out to zero change in the spinbutton count/order before the per-Termin table rows, so those indices remain correct.

- [ ] **Step 13: Update `SchuleAkkordionItem.tsx`**

Remove the `onPresetApply` prop and its pass-through, and add the `koordinationszeitH` parameter to the `onTermineGenerieren` wrapper:

```tsx
import { ReihenEditor } from './ReihenEditor'
import type { Person, Schule, Settings, Terminstatus, Thema } from '../lib/types'

export function SchuleAkkordionItem({
  schule,
  personen,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
}: {
  schule: Schule
  settings: Settings
  personen: Person[]
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onTermineGenerieren: (reiheId: string, startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) => void
}) {
  return (
    <details className="schule-akkordion-item">
      <summary>{schule.name}</summary>
      <div className="schule-akkordion-inhalt">
        {schule.reihen.map((reihe) => (
          <div key={reihe.id}>
            <p className="reihe-meta">
              Modell {reihe.betreuungsmodell} · Status: {reihe.status}
            </p>
            <ReihenEditor
              reihe={reihe}
              personen={personen}
              onEinheitToggle={(einheitId, wert) => onEinheitToggle(reihe.id, einheitId, wert)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
              onTermineGenerieren={(startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine) =>
                onTermineGenerieren(reihe.id, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine)
              }
            />
          </div>
        ))}
      </div>
    </details>
  )
}
```

In `src/components/SchuleAkkordionItem.test.tsx`: remove `onPresetApply: vi.fn()` from `renderItem()`'s props object; change the assertion:

```ts
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('r2', expect.any(String), expect.any(Number), expect.any(Number))
```

to:

```ts
    expect(props.onTermineGenerieren).toHaveBeenCalledWith('r2', expect.any(String), expect.any(Number), expect.any(Number), expect.any(Number))
```

- [ ] **Step 14: Update `SchulenAccordion.tsx`**

Remove the `wendeBesetzungPreset` import and the `onPresetApply` function, and add the `koordinationszeitH` parameter to `onTermineGenerieren`:

```tsx
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { generiereWochentlicheTermine } from '../lib/kalenderwochen'
import type { Einheit, FerienZeitraum, Person, Schule, Settings, Terminstatus, Thema } from '../lib/types'
import './SchulenAccordion.css'

export function SchulenAccordion({
  schulen,
  settings,
  personen,
  ferien,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onEinheitenReplace,
}: {
  schulen: Schule[]
  settings: Settings
  personen: Person[]
  ferien: FerienZeitraum[]
  onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onEinheitenReplace: (reiheId: string, einheiten: Einheit[]) => void
}) {
  function onTermineGenerieren(reiheId: string, startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) {
    const einheiten = generiereWochentlicheTermine(reiheId, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine, ferien)
    onEinheitenReplace(reiheId, einheiten)
  }

  return (
    <div className="schulen-accordion">
      {schulen.map((schule) => (
        <SchuleAkkordionItem
          key={schule.id}
          schule={schule}
          settings={settings}
          personen={personen}
          onEinheitToggle={onEinheitToggle}
          onEinheitAdd={onEinheitAdd}
          onEinheitRemove={onEinheitRemove}
          onEinheitFelderChange={onEinheitFelderChange}
          onTerminstatusChange={onTerminstatusChange}
          onTermineGenerieren={onTermineGenerieren}
        />
      ))}
    </div>
  )
}
```

In `src/components/SchulenAccordion.test.tsx`: delete the entire `'applies a Besetzung-Preset only to the matching Reihe, scoped to the correct Schule'` test. Leave everything else — the `'generates weekly Termine for the correct Reihe via onEinheitenReplace'` test doesn't fill in the new Koordination field, so it defaults to `0` and the test's `expect.objectContaining({...})` assertions (which don't check `koordinationszeit_h`) still pass unmodified.

- [ ] **Step 15: Run the full suite and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 16: Commit**

```bash
git add src/lib/kalenderwochen.ts src/lib/kalenderwochen.test.ts src/lib/personenKapazitaet.ts src/lib/personenKapazitaet.test.ts src/lib/besetzung.ts src/lib/besetzung.test.ts src/lib/types.ts src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx
git commit -m "feat(berechnungstool): add Koordination to Termine generieren, count it toward Begleitperson capacity, remove Besetzungs-Presets"
```

---

### Task 2: Course (Reihe) add/remove

**Files:**
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/components/ReihenEditor.tsx` (editable Titel)
- Modify: `src/components/ReihenEditor.test.tsx`
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: the post-Task-1 state of `ReihenEditor`/`SchuleAkkordionItem`/`SchulenAccordion` (re-read these three files' current content before starting — Task 1 changed all of them).
- Produces: `addReihe(schuleId: string): void`, `removeReihe(schuleId: string, reiheId: string): void`, `setReiheTitel(reiheId: string, titel: string): void` from `useAppData()`.
- Produces: `ReihenEditor` gains `onTitelChange: (titel: string) => void`. `SchuleAkkordionItem` gains `onReiheAdd: () => void` (no id — pre-bound per school) and `onReiheRemove: (reiheId: string) => void`. `SchulenAccordion` gains `onReiheAdd: (schuleId: string) => void`, `onReiheRemove: (schuleId: string, reiheId: string) => void`, `onReiheTitelChange: (reiheId: string, titel: string) => void`.

- [ ] **Step 1: Write the failing tests for `useAppData`**

In `src/state/useAppData.test.ts`, add these tests near the existing `addEinheit`/`removeEinheit` tests:

```ts
  it('addReihe appends a new Reihe with sensible defaults to the correct Schule only', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const vorherigeAnzahl = schule.reihen.length
    act(() => {
      result.current.addReihe('wdg')
    })
    const aktualisierteSchule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(aktualisierteSchule.reihen).toHaveLength(vorherigeAnzahl + 1)
    const neueReihe = aktualisierteSchule.reihen.at(-1)!
    expect(neueReihe.titel).toBe('Neuer Kurs')
    expect(neueReihe.betreuungsmodell).toBe('A')
    expect(neueReihe.terminstatus).toBe('offen')
    expect(neueReihe.einheiten).toEqual([])
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen).toHaveLength(1)
  })

  it('removeReihe deletes the matching Reihe and leaves other Reihen/Schulen unchanged', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reiheId = schule.reihen[0].id
    act(() => {
      result.current.removeReihe('wdg', reiheId)
    })
    const aktualisierteSchule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(aktualisierteSchule.reihen.find((r) => r.id === reiheId)).toBeUndefined()
  })

  it('setReiheTitel updates only the matching Reihe\'s titel', () => {
    const { result } = renderHook(() => useAppData())
    const wdgReiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    act(() => {
      result.current.setReiheTitel(wdgReiheId, 'Neuer Titel')
    })
    const wdgReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(wdgReihe.titel).toBe('Neuer Titel')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `addReihe`/`removeReihe`/`setReiheTitel` are not functions on the returned object.

- [ ] **Step 3: Implement `addReihe`, `removeReihe`, `setReiheTitel`**

In `src/state/useAppData.ts`, add `Reihe` to the type import (`import type { Datenbestand, Einheit, FerienZeitraum, Person, Reihe, Terminstatus } from '../lib/types'`), and add these functions (e.g. near `addEinheit`/`removeEinheit`):

```ts
  function addReihe(schuleId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => {
        if (schule.id !== schuleId) return schule
        const neueReihe: Reihe = {
          id: `reihe_${Date.now()}`,
          titel: 'Neuer Kurs',
          betreuungsmodell: 'A',
          fahrzeit_h: prev.settings.default_fahrzeit_h,
          status: '',
          extern_betreut: false,
          terminstatus: 'offen',
          einheiten: [],
        }
        return { ...schule, reihen: [...schule.reihen, neueReihe] }
      }),
    }))
  }

  function removeReihe(schuleId: string, reiheId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) =>
        schule.id !== schuleId ? schule : { ...schule, reihen: schule.reihen.filter((r) => r.id !== reiheId) }
      ),
    }))
  }

  function setReiheTitel(reiheId: string, titel: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => (reihe.id === reiheId ? { ...reihe, titel } : reihe)),
      })),
    }))
  }
```

Add `addReihe`, `removeReihe`, `setReiheTitel` to the object returned from `useAppData()`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the Titel input and course add/remove buttons**

Re-read the current `src/components/ReihenEditor.tsx` (post-Task-1) before editing. In `src/components/ReihenEditor.test.tsx`, add (adjust every existing standalone `render(<ReihenEditor .../>)` call and the `renderReihenEditor()` helper to also pass `onTitelChange: vi.fn()`):

```ts
  it('renders the Titel as an editable input', () => {
    renderReihenEditor()
    const titel = screen.getByLabelText('Titel') as HTMLInputElement
    expect(titel.value).toBe('Testreihe')
  })

  it('calls onTitelChange when the Titel input changes', () => {
    const props = renderReihenEditor()
    fireEvent.change(screen.getByLabelText('Titel'), { target: { value: 'Neuer Titel' } })
    expect(props.onTitelChange).toHaveBeenCalledWith('Neuer Titel')
  })
```

In `src/components/SchuleAkkordionItem.test.tsx`, add `onReiheAdd: vi.fn()`, `onReiheRemove: vi.fn()`, `onReiheTitelChange: vi.fn()` to `renderItem()`'s props, and add:

```ts
  it('calls onReiheAdd when the "+ Kurs hinzufügen" button is clicked', () => {
    const props = renderItem()
    fireEvent.click(screen.getByText('+ Kurs hinzufügen'))
    expect(props.onReiheAdd).toHaveBeenCalled()
  })

  it("calls onReiheRemove with the correct Reihe id when that Reihe's delete button is clicked", () => {
    const props = renderItem()
    fireEvent.click(screen.getByLabelText('Reihe Zwei löschen'))
    expect(props.onReiheRemove).toHaveBeenCalledWith('r2')
  })
```

In `src/components/SchulenAccordion.test.tsx`, add `onReiheAdd: vi.fn()`, `onReiheRemove: vi.fn()`, `onReiheTitelChange: vi.fn()` to `renderAccordion()`'s props, and add:

```ts
  it('forwards onReiheAdd with the correct Schule id', () => {
    const props = renderAccordion()
    const schuleZweiSummary = screen.getByText('Schule Zwei').closest('summary') as HTMLElement
    const schuleZweiDetails = schuleZweiSummary.closest('details') as HTMLElement
    fireEvent.click(within(schuleZweiDetails).getByText('+ Kurs hinzufügen'))
    expect(props.onReiheAdd).toHaveBeenCalledWith('s2')
  })

  it('forwards onReiheRemove with the correct Schule and Reihe id', () => {
    const props = renderAccordion()
    fireEvent.click(screen.getByLabelText('Reihe Zwei löschen'))
    expect(props.onReiheRemove).toHaveBeenCalledWith('s2', 'r2')
  })
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.test.tsx`
Expected: FAIL — no Titel input, no "+ Kurs hinzufügen" button, no delete-Reihe button exist yet.

- [ ] **Step 7: Implement the Titel input in `ReihenEditor.tsx`**

Re-read the file's current (post-Task-1) content first. Add `onTitelChange: (titel: string) => void` to the props type. Replace:

```tsx
      <h3>{reihe.titel}</h3>
```

with:

```tsx
      <input type="text" aria-label="Titel" value={reihe.titel} onChange={(ev) => onTitelChange(ev.target.value)} />
```

(Removing the `<h3>` changes how `ReihenEditor.test.tsx`'s and other files' tests find a Reihe's container via `screen.getByRole('heading', { name: reihe.titel })` — see Step 8.)

- [ ] **Step 8: Fix container-lookup tests that relied on the `<h3>` heading**

Since Step 7 replaces the `<h3>{reihe.titel}</h3>` with an `<input>`, every test that finds a Reihe's DOM subtree via `screen.getByRole('heading', { name: ... })` then `.closest('div')` breaks. The fix is the same one-line substitution everywhere: replace `getByRole('heading', { name: X })` with `getByDisplayValue(X)` — the rest of each test (`.closest('div')`, the variable names, everything after) stays exactly as-is, since `ReihenEditor`'s root `<div>` is still the direct parent of the Titel input, same as it was of the `<h3>`.

In `src/components/SchuleAkkordionItem.test.tsx`, three occurrences (in the tests `'renders one ReihenEditor per Reihe...'` doesn't need this — it asserts on `getByRole('heading', ...)` directly and should instead assert `getByDisplayValue(...)` is present; and the two tests that build a container):

```ts
    const reiheEinsUeberschrift = screen.getByRole('heading', { name: 'Reihe Eins' })
```
→
```ts
    const reiheEinsUeberschrift = screen.getByDisplayValue('Reihe Eins')
```

(same substitution for the two `reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })` lines — one in `'calls onEinheitAdd...'`... actually that one uses `'Reihe Eins'`, and the two `'Reihe Zwei'` ones are in `'calls onTerminstatusChange...'` and `"calls onTermineGenerieren with the correct Reihe id..."`). Also update the `'renders one ReihenEditor per Reihe, identifiable by its title heading'` test itself:

```ts
  it('renders one ReihenEditor per Reihe, identifiable by its title input', () => {
    renderItem()
    expect(screen.getByDisplayValue('Reihe Eins')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Reihe Zwei')).toBeInTheDocument()
  })
```

In `src/components/SchulenAccordion.test.tsx`, three remaining occurrences after Task 1 already deleted the Besetzung-Preset test (in `'forwards onEinheitAdd...'` — `reiheEinsUeberschrift = screen.getByRole('heading', { name: 'Reihe Eins' })`; in `'forwards onTerminstatusChange...'` and `'generates weekly Termine...'` — both `reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })`): apply the same `getByRole('heading', { name: X })` → `getByDisplayValue(X)` substitution to all three.

In `src/App.test.tsx`, one occurrence, in `'adding and removing a Termin via the WDG ReihenEditor...'`:

```ts
    const wdgUeberschrift = screen.getByRole('heading', { name: 'Theorieblöcke Begabtenförderung' })
```
→
```ts
    const wdgUeberschrift = screen.getByDisplayValue('Theorieblöcke Begabtenförderung')
```

(the rest of that test — `.closest('div')` and everything after — is unchanged.)

- [ ] **Step 9: Implement course add/remove in `SchuleAkkordionItem.tsx`**

Re-read the file's current (post-Task-1) content first. Add `onReiheAdd: () => void`, `onReiheRemove: (reiheId: string) => void`, `onReiheTitelChange: (reiheId: string, titel: string) => void` to the props type. Add the delete button as a **sibling after** the Reihe-meta `<p>`, not nested inside it — nesting it inside would append the button's "🗑" text to the `<p>`'s text content and break the existing exact-match test `screen.getByText('Modell A · Status: zugesagt')` in `SchuleAkkordionItem.test.tsx`, which must keep passing unchanged. Wrap `ReihenEditor`'s new `onTitelChange`; add a "+ Kurs hinzufügen" button after the mapped list:

```tsx
            <p className="reihe-meta">
              Modell {reihe.betreuungsmodell} · Status: {reihe.status}
            </p>
            <button onClick={() => onReiheRemove(reihe.id)} aria-label={`${reihe.titel} löschen`}>
              🗑
            </button>
            <ReihenEditor
              reihe={reihe}
              personen={personen}
              onEinheitToggle={(einheitId, wert) => onEinheitToggle(reihe.id, einheitId, wert)}
              onTitelChange={(titel) => onReiheTitelChange(reihe.id, titel)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
              onTermineGenerieren={(startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine) =>
                onTermineGenerieren(reihe.id, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine)
              }
            />
          </div>
        ))}
        <button onClick={onReiheAdd}>+ Kurs hinzufügen</button>
      </div>
    </details>
  )
}
```

(The closing `))}` / `</div>` / button placement: the "+ Kurs hinzufügen" button goes immediately after the `{schule.reihen.map(...)}` closing, still inside `<div className="schule-akkordion-inhalt">`.)

- [ ] **Step 10: Implement binding in `SchulenAccordion.tsx`**

Re-read the file's current (post-Task-1) content first. Add `onReiheAdd: (schuleId: string) => void`, `onReiheRemove: (schuleId: string, reiheId: string) => void`, `onReiheTitelChange: (reiheId: string, titel: string) => void` to the props type. Pass pre-bound versions into each `SchuleAkkordionItem`:

```tsx
        <SchuleAkkordionItem
          key={schule.id}
          schule={schule}
          settings={settings}
          personen={personen}
          onEinheitToggle={onEinheitToggle}
          onEinheitAdd={onEinheitAdd}
          onEinheitRemove={onEinheitRemove}
          onEinheitFelderChange={onEinheitFelderChange}
          onTerminstatusChange={onTerminstatusChange}
          onTermineGenerieren={onTermineGenerieren}
          onReiheAdd={() => onReiheAdd(schule.id)}
          onReiheRemove={(reiheId) => onReiheRemove(schule.id, reiheId)}
          onReiheTitelChange={onReiheTitelChange}
        />
```

- [ ] **Step 11: Wire `App.tsx`**

Destructure `addReihe`, `removeReihe`, `setReiheTitel` from `useAppData()`, and pass them into `SchulenAccordion`:

```tsx
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        personen={data.personen}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
        onTerminstatusChange={setReiheTerminstatus}
        onEinheitenReplace={setReiheEinheiten}
        onReiheAdd={addReihe}
        onReiheRemove={removeReihe}
        onReiheTitelChange={setReiheTitel}
        ferien={data.kalender.ferien}
      />
```

- [ ] **Step 12: Run the tests to verify they pass**

Run: `npx vitest run src/state/useAppData.test.ts src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 13: Run the full suite and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat(berechnungstool): add course (Reihe) add/remove and editable Titel per school"
```

---

### Task 3: Themenwoche (shared Vorbereitungszeit across schools)

**Files:**
- Modify: `src/lib/types.ts` (`Einheit.themenwoche`)
- Modify: `src/lib/berechnung.ts` (`berechneAufwandEinheit`, `berechneBedarfProWoche`)
- Modify: `src/lib/berechnung.test.ts`
- Modify: `src/components/ReihenEditor.tsx` (Themenwoche column)
- Modify: `src/components/ReihenEditor.test.tsx`
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: the post-Task-2 state of `ReihenEditor`/`SchuleAkkordionItem`/`SchulenAccordion`/`App.tsx` (re-read these before starting).
- Produces: `Einheit.themenwoche?: string`. `berechneAufwandEinheit(einheit, fahrzeit_h, settings, vorbereitungBereitsGezaehlt = false): number` — new optional 4th parameter, defaults preserve all existing behavior/call sites/tests. `themenwochen: string[]` prop threaded `App.tsx` → `SchulenAccordion` → `SchuleAkkordionItem` → `ReihenEditor`.

- [ ] **Step 1: Write the failing tests for `berechneAufwandEinheit` and `berechneBedarfProWoche`**

In `src/lib/berechnung.test.ts`, add inside `describe('berechneAufwandEinheit', ...)`:

```ts
  it('omits the Vorbereitungszeit when vorbereitungBereitsGezaehlt is true', () => {
    const e = einheit({ kontaktzeit_h: 4, erstdurchfuehrung: true })
    const mitVorbereitung = berechneAufwandEinheit(e, 1.0, settings)
    const ohneVorbereitung = berechneAufwandEinheit(e, 1.0, settings, true)
    expect(ohneVorbereitung).toBeCloseTo(mitVorbereitung - 4 * settings.default_vorbereitungsfaktor_erstdurchfuehrung, 5)
  })
```

Add a new `describe` block (near `describe('berechneBedarfProWoche', ...)`):

```ts
describe('Themenwoche shared Vorbereitungszeit', () => {
  function schuleMitThemenwocheEinheit(schuleId: string, reiheId: string, einheitId: string, themenwoche: string | undefined, kontaktzeitH = 1.5): Schule {
    return {
      id: schuleId,
      name: schuleId,
      reihen: [
        {
          id: reiheId,
          titel: 'x',
          betreuungsmodell: 'A',
          fahrzeit_h: 0,
          status: 'zugesagt',
          extern_betreut: false,
          terminstatus: 'festgelegt',
          einheiten: [einheit({ id: einheitId, datum_oder_kw: '2026-KW46', kontaktzeit_h: kontaktzeitH, erstdurchfuehrung: true, themenwoche })],
        },
      ],
    }
  }

  it('counts Vorbereitungszeit once for two Einheiten in different Schulen sharing a themenwoche label in the same week', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        schuleMitThemenwocheEinheit('s1', 'r1', 'e1', 'Herbst-Themenwoche'),
        schuleMitThemenwocheEinheit('s2', 'r2', 'e2', 'Herbst-Themenwoche'),
      ],
    }
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    const einzelMitVorbereitung = berechneAufwandEinheit(einheit({ kontaktzeit_h: 1.5, erstdurchfuehrung: true }), 0, settings)
    const einzelOhneVorbereitung = berechneAufwandEinheit(einheit({ kontaktzeit_h: 1.5, erstdurchfuehrung: true }), 0, settings, true)
    expect(einsatzBedarf).toBeCloseTo(einzelMitVorbereitung + einzelOhneVorbereitung, 5)
  })

  it('does not dedupe Vorbereitungszeit for an Einheit with a different themenwoche label', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        schuleMitThemenwocheEinheit('s1', 'r1', 'e1', 'Herbst-Themenwoche'),
        schuleMitThemenwocheEinheit('s2', 'r2', 'e2', 'Winter-Themenwoche'),
      ],
    }
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    const einzelMitVorbereitung = berechneAufwandEinheit(einheit({ kontaktzeit_h: 1.5, erstdurchfuehrung: true }), 0, settings)
    expect(einsatzBedarf).toBeCloseTo(einzelMitVorbereitung * 2, 5)
  })

  it('does not dedupe Vorbereitungszeit for Einheiten without any themenwoche label', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        schuleMitThemenwocheEinheit('s1', 'r1', 'e1', undefined),
        schuleMitThemenwocheEinheit('s2', 'r2', 'e2', undefined),
      ],
    }
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    const einzelMitVorbereitung = berechneAufwandEinheit(einheit({ kontaktzeit_h: 1.5, erstdurchfuehrung: true }), 0, settings)
    expect(einsatzBedarf).toBeCloseTo(einzelMitVorbereitung * 2, 5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: FAIL — `berechneAufwandEinheit` doesn't accept a 4th argument yet (TypeScript error / the argument is silently ignored so `ohneVorbereitung` equals `mitVorbereitung`), and `Einheit` doesn't have a `themenwoche` field yet, and the dedup test shows `einsatzBedarf` double-counting Vorbereitung.

- [ ] **Step 3: Add `Einheit.themenwoche`**

In `src/lib/types.ts`, add to `Einheit`:

```ts
export interface Einheit {
  // ...existing fields unchanged...
  themenwoche?: string
}
```

- [ ] **Step 4: Implement `berechneAufwandEinheit`'s new parameter and the dedup in `berechneBedarfProWoche`**

In `src/lib/berechnung.ts`, change:

```ts
export function berechneAufwandEinheit(einheit: Einheit, fahrzeit_h: number, settings: Settings): number {
  const vorbereitungsfaktor = einheit.erstdurchfuehrung
    ? settings.default_vorbereitungsfaktor_erstdurchfuehrung
    : settings.default_vorbereitungsfaktor_wiederholung
  const pauschale = einheit.typ === 'exkursion' ? einheit.organisationspauschale_h ?? 2 : 0
  const basis = einheit.kontaktzeit_h + einheit.kontaktzeit_h * vorbereitungsfaktor + fahrzeit_h + pauschale
  return basis * einheit.personen_parallel
}
```

to:

```ts
export function berechneAufwandEinheit(
  einheit: Einheit,
  fahrzeit_h: number,
  settings: Settings,
  vorbereitungBereitsGezaehlt = false
): number {
  const vorbereitungsfaktor = einheit.erstdurchfuehrung
    ? settings.default_vorbereitungsfaktor_erstdurchfuehrung
    : settings.default_vorbereitungsfaktor_wiederholung
  const vorbereitung = vorbereitungBereitsGezaehlt ? 0 : einheit.kontaktzeit_h * vorbereitungsfaktor
  const pauschale = einheit.typ === 'exkursion' ? einheit.organisationspauschale_h ?? 2 : 0
  const basis = einheit.kontaktzeit_h + vorbereitung + fahrzeit_h + pauschale
  return basis * einheit.personen_parallel
}
```

and change:

```ts
export function berechneBedarfProWoche(
  data: Datenbestand,
  wochenKey: string,
  istFerien: boolean
): { einsatzBedarf: number; koordinationBedarf: number } {
  if (istFerien) return { einsatzBedarf: 0, koordinationBedarf: 0 }

  let einsatzBedarf = 0
  let koordinationBedarf = 0
  for (const schule of data.schulen) {
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        koordinationBedarf += einheit.koordinationszeit_h ?? 0
        if (einheit.wir_begleiten) {
          einsatzBedarf += berechneAufwandEinheit(einheit, reihe.fahrzeit_h, data.settings)
        }
      }
    }
  }
  return { einsatzBedarf, koordinationBedarf }
}
```

to:

```ts
export function berechneBedarfProWoche(
  data: Datenbestand,
  wochenKey: string,
  istFerien: boolean
): { einsatzBedarf: number; koordinationBedarf: number } {
  if (istFerien) return { einsatzBedarf: 0, koordinationBedarf: 0 }

  let einsatzBedarf = 0
  let koordinationBedarf = 0
  const gezaehlteThemenwochen = new Set<string>()
  for (const schule of data.schulen) {
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        koordinationBedarf += einheit.koordinationszeit_h ?? 0
        if (einheit.wir_begleiten) {
          const vorbereitungBereitsGezaehlt = !!einheit.themenwoche && gezaehlteThemenwochen.has(einheit.themenwoche)
          if (einheit.themenwoche) gezaehlteThemenwochen.add(einheit.themenwoche)
          einsatzBedarf += berechneAufwandEinheit(einheit, reihe.fahrzeit_h, data.settings, vorbereitungBereitsGezaehlt)
        }
      }
    }
  }
  return { einsatzBedarf, koordinationBedarf }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: PASS. Also re-run the full suite once here (`npm test`) as a regression check, since `berechneAufwandEinheit`'s signature change touches a widely-used function — the default parameter value means every pre-existing call site and test is unaffected, but confirm this rather than assuming it.

- [ ] **Step 6: Write the failing test for the Themenwoche input in `ReihenEditor.tsx`**

Re-read the file's current (post-Task-2) content first. In `src/components/ReihenEditor.test.tsx`, add `themenwochen: []` to the `renderReihenEditor()` helper's props (and to every standalone `render(<ReihenEditor .../>)` call), then add:

```ts
  it('renders a Themenwoche input for each Termin, defaulting to empty', () => {
    renderReihenEditor()
    const themenwoche1 = screen.getByLabelText('Themenwoche für Termin 1 in Testreihe') as HTMLInputElement
    expect(themenwoche1.value).toBe('')
  })

  it('calls onEinheitFelderChange with the entered Themenwoche', () => {
    const props = renderReihenEditor()
    const themenwoche1 = screen.getByLabelText('Themenwoche für Termin 1 in Testreihe')
    fireEvent.change(themenwoche1, { target: { value: 'Herbst-Themenwoche' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { themenwoche: 'Herbst-Themenwoche' })
  })

  it('offers existing themenwochen values via a datalist for autocomplete', () => {
    render(
      <ReihenEditor
        reihe={reihe}
        personen={personen}
        themenwochen={['Herbst-Themenwoche', 'Winter-Themenwoche']}
        onEinheitToggle={vi.fn()}
        onTitelChange={vi.fn()}
        onEinheitAdd={vi.fn()}
        onEinheitRemove={vi.fn()}
        onEinheitFelderChange={vi.fn()}
        onTerminstatusChange={vi.fn()}
        onTermineGenerieren={vi.fn()}
      />
    )
    const options = Array.from(document.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))
    expect(options).toEqual(['Herbst-Themenwoche', 'Winter-Themenwoche'])
  })
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: FAIL — no Themenwoche input or datalist exist yet.

- [ ] **Step 8: Implement the Themenwoche column in `ReihenEditor.tsx`**

Re-read the file's current (post-Task-2) content first. Add `themenwochen: string[]` to the props type. Add a `<th>Themenwoche</th>` header after `<th>Thema</th>`, and a corresponding `<td>` after the Thema `<select>`'s `<td>`:

```tsx
              <td>
                <input
                  type="text"
                  list="themenwochen-optionen"
                  aria-label={`Themenwoche für Termin ${e.index} in ${reihe.titel}`}
                  value={e.themenwoche ?? ''}
                  onChange={(ev) =>
                    onEinheitFelderChange(e.id, { themenwoche: ev.target.value === '' ? undefined : ev.target.value })
                  }
                  style={{ width: '8rem' }}
                />
              </td>
```

Add a single shared `<datalist>` once, right after the closing `</table>`:

```tsx
      <datalist id="themenwochen-optionen">
        {themenwochen.map((tw) => (
          <option key={tw} value={tw} />
        ))}
      </datalist>
```

(Reference it from the input via `list="themenwochen-optionen"`, as shown above.)

- [ ] **Step 9: Thread `themenwochen` through `SchuleAkkordionItem.tsx` and `SchulenAccordion.tsx`**

Re-read both files' current (post-Task-2) content first. Add `themenwochen: string[]` to both components' props types, and pass it straight through unchanged (`SchulenAccordion` → `SchuleAkkordionItem` → `ReihenEditor`, no per-school binding needed — same list for every school, since Themenwoche links are cross-school by design).

- [ ] **Step 10: Compute and wire `themenwochen` in `App.tsx`**

Re-read the file's current (post-Task-2) content first. Add:

```ts
  const themenwochen = Array.from(
    new Set(
      data.schulen.flatMap((s) => s.reihen.flatMap((r) => r.einheiten.map((e) => e.themenwoche).filter((t): t is string => !!t)))
    )
  )
```

and pass `themenwochen={themenwochen}` into `<SchulenAccordion>`.

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.test.tsx src/App.test.tsx`
Expected: PASS (existing tests in `SchuleAkkordionItem.test.tsx`/`SchulenAccordion.test.tsx`/`App.test.tsx` that render these components need `themenwochen: []` added to their props/helpers if they weren't already updated to pass it — add it wherever a type error surfaces).

- [ ] **Step 12: Run the full suite and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/lib/types.ts src/lib/berechnung.ts src/lib/berechnung.test.ts src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx src/App.tsx
git commit -m "feat(berechnungstool): add Themenwoche — share Vorbereitungszeit once across schools jointly teaching a session"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, all test files green.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS, no TypeScript errors.

- [ ] **Step 3: Visual check in the browser**

Start the dev server (`npm run dev`), open the app, expand a school, and confirm:
- Schnelleinrichtung has a working Koordination (min) field; generated Termine carry it, and assigning a Begleitperson to one visibly reduces their Personen-Kapazität by both Unterrichtszeit and Koordination.
- The Besetzungs-Preset buttons ("Alle", "Keine", "Erste & Letzte", etc.) are gone; the per-Termin "Wir begleiten" checkbox still works.
- A course's title is editable inline; "+ Kurs hinzufügen" adds a new, immediately-editable course; a course's delete button removes it.
- A Termin's Themenwoche field accepts free text with autocomplete suggestions from existing values; setting the same Themenwoche label on Einheiten in two different schools' Reihen (same week) visibly reduces the combined Unterrichtszeit bar in the overview chart compared to what it'd be without the shared label (spot-check the numbers, or trust the unit-tested `berechneBedarfProWoche` logic and just confirm no crash/console errors).
- No errors in the browser console.

Stop the dev server afterward.

- [ ] **Step 4: Report completion**

No commit needed for this task (verification only) unless Step 3 surfaces a bug — if so, fix it, re-run Steps 1–3, and commit the fix with an appropriate message before considering the plan complete.
