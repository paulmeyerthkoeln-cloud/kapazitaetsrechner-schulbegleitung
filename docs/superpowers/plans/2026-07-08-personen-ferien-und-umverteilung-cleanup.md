# Personen-Ferien & Kapazitäts-Umverteilung-Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Ferien (vacation) function to Personen that reduces their weekly capacity like Abwesenheiten already do, and remove the now-redundant aggregate Kapazitäts-Umverteilung feature (superseded by the existing Personen-Umverteilung).

**Architecture:** `Person` gains a `ferien: FerienZeitraum[]` field (reusing the existing `{name, von, bis}` shape). `berechnePersonKapazitaetsbasis` folds Ferien days into the same day-count/20%-per-day capacity reduction it already applies to Abwesenheiten, deduped so an overlapping day isn't double-counted. A new inline editor in `PersonenTabelle` lets a user add/edit/remove a person's Ferien entries. Separately, the old aggregate `Umverteilung` type/component/calculation functions are deleted outright — `PersonenUmverteilung` (already shipped) is strictly more general and already covers the same use case per-person, for any week.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react, date-fns.

## Global Constraints

- Reuse the existing `FerienZeitraum` type (`{ name: string; von: string; bis: string }`) for `Person.ferien` — do not invent a new shape.
- Capacity reduction formula: identical to the existing Abwesenheiten formula (`abzugsfaktor = min(1, abwesendeTage * 0.2)`), just with a bigger "days off" input set (union of `abwesenheiten` and `ferien` day-ranges, deduped per weekday).
- `PersonenTabelle`'s new Ferien UI follows the same inline add/edit/remove-row pattern already used in `ReihenEditor.tsx`'s Termine table — no modal, no confirmation dialogs.
- Every step that changes code must leave `npm test` and `npm run build` passing before moving to the next task.
- Follow TDD for all new behavior (Tasks 1–3). Task 4 is a deletion/simplification — there is no new behavior to test-first, so its discipline is: remove implementation and its tests together, then verify the full suite is green with the remaining (updated) tests.

---

### Task 1: Person Ferien field + capacity calculation

**Files:**
- Modify: `src/lib/types.ts:17-25` (`Person` interface)
- Modify: `src/lib/berechnung.ts:49-61` (`berechnePersonKapazitaetsbasis`)
- Modify: `src/lib/berechnung.test.ts:381-407` (`describe('berechneAngebotProWoche', ...)`), plus fixture fixes at lines 496 and 619
- Modify: `src/lib/personenKapazitaet.test.ts:15-25` (`person()` helper) — add a regression test
- Modify: `src/lib/szenario.test.ts:15-25` (`person()` helper) — fixture fix only
- Modify: `src/components/ReihenEditor.test.tsx:38-41` — fixture fix only
- Modify: `src/components/PersonenUmverteilung.test.tsx:7-10` — fixture fix only

**Interfaces:**
- Produces: `Person.ferien: FerienZeitraum[]` (required field, every `Person` object must set it) — consumed by Task 2's `useAppData` wiring and Task 3's `PersonenTabelle` UI.
- Produces: `berechnePersonKapazitaetsbasis` now factors in `person.ferien` — no signature change, consumed transparently by `berechneAngebotProWoche` and `src/lib/personenKapazitaet.ts`'s `berechnePersonenKapazitaet` (both already call it).

- [ ] **Step 1: Add `ferien` to the `Person` interface**

In `src/lib/types.ts`, change:

```ts
export interface Person {
  id: string
  name: string
  stunden_pro_woche_fuer_begleitung: number
  aktiv_ab: string
  aktiv_bis: string
  abwesenheiten: Abwesenheit[]
  szenario_optional?: boolean
}
```

to:

```ts
export interface Person {
  id: string
  name: string
  stunden_pro_woche_fuer_begleitung: number
  aktiv_ab: string
  aktiv_bis: string
  abwesenheiten: Abwesenheit[]
  ferien: FerienZeitraum[]
  szenario_optional?: boolean
}
```

(`FerienZeitraum` is already defined a few lines below in the same file — no new import needed.)

- [ ] **Step 2: Write the failing tests**

In `src/lib/berechnung.test.ts`, inside `describe('berechneAngebotProWoche', ...)` (around line 381), update the `person` helper to include `ferien: []`:

```ts
const person = (overrides: Partial<Person> = {}): Person => ({
  id: 'p1',
  name: 'Person 1',
  stunden_pro_woche_fuer_begleitung: 8,
  aktiv_ab: '2026-09-01',
  aktiv_bis: '2027-07-16',
  abwesenheiten: [],
  ferien: [],
  ...overrides,
})
```

Then add two new tests directly after the existing `'reduces capacity by 20% per absent weekday in that week'` test (still inside the same `describe` block):

```ts
  it('reduces capacity by 20% per weekday covered by a Ferien entry', () => {
    const personen = [
      person({ ferien: [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-10' }] }),
    ]
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'))).toBeCloseTo(8 * (1 - 0.4), 5)
  })

  it('counts a weekday covered by both an Abwesenheit and a Ferien entry only once', () => {
    const personen = [
      person({
        abwesenheiten: [{ von: '2026-11-09', bis: '2026-11-09', grund: 'Arzt' }],
        ferien: [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-10' }],
      }),
    ]
    // 2026-11-09 is covered by both; 2026-11-10 only by Ferien -> 2 distinct days off, not 3.
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'))).toBeCloseTo(8 * (1 - 0.4), 5)
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: FAIL — both new tests fail (capacity is still `8`, unreduced, since `berechnePersonKapazitaetsbasis` doesn't look at `ferien` yet). It's fine if other tests in this file currently error due to the `Person` type change elsewhere not yet being fixed — focus on confirming these two new tests fail for the right reason (unreduced capacity), not a syntax error.

- [ ] **Step 4: Implement the capacity calculation change**

In `src/lib/berechnung.ts`, change `berechnePersonKapazitaetsbasis`:

```ts
export function berechnePersonKapazitaetsbasis(person: Person, wochenStartMontag: Date): number {
  const wochenEnde = endOfISOWeek(wochenStartMontag)
  const aktivAb = parseISO(person.aktiv_ab)
  const aktivBis = parseISO(person.aktiv_bis)
  if (wochenEnde < aktivAb || wochenStartMontag > aktivBis) return 0

  const wochentage = eachDayOfInterval({ start: wochenStartMontag, end: wochenEnde }).filter((d) => !isWeekend(d))
  const abwesendeTage = wochentage.filter((tag) =>
    person.abwesenheiten.some((a) => tag >= parseISO(a.von) && tag <= parseISO(a.bis)) ||
    person.ferien.some((f) => tag >= parseISO(f.von) && tag <= parseISO(f.bis))
  ).length
  const abzugsfaktor = Math.min(1, abwesendeTage * 0.2)
  return person.stunden_pro_woche_fuer_begleitung * (1 - abzugsfaktor)
}
```

(Only the `abwesendeTage` filter changed — added the `|| person.ferien.some(...)` clause.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: still FAIL on other tests in the file — fix those next (Step 6) — but the two new tests from Step 2 should now PASS. Confirm this by checking the test output names.

- [ ] **Step 6: Fix every other `Person` fixture so the project type-checks**

`Person.ferien` is now a required field. Fix each of these fixtures by adding `ferien: []` (verified via `grep -rn "abwesenheiten:" src` — every literal that sets `abwesenheiten` also needs `ferien`):

In `src/lib/berechnung.test.ts`, `describe('berechneWochenuebersicht', ...)`:
- Around line 496, inside the `Array.from({ length: 4 }, ...)` person-generator, add `ferien: [],` next to `abwesenheiten: [],`.
- Around line 619, inside the inline `personen: Person[] = [{ ... }]` literal, add `ferien: [],` next to `abwesenheiten: [],`.

In `src/lib/personenKapazitaet.test.ts`, the `person()` helper (line ~15-25):

```ts
function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: 'Anna',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    ferien: [],
    ...overrides,
  }
}
```

Also add this regression test inside `describe('berechnePersonenKapazitaet', ...)`:

```ts
  it("reduces a Person's basis capacity during their own Ferien, independent of the school Kalender.ferien", () => {
    const data = datenbestand({
      personen: [person({ ferien: [{ name: 'Herbstferien Familie', von: '2026-11-09', bis: '2026-11-13' }] })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.basis).toBe(0)
  })
```

In `src/lib/szenario.test.ts`, the `person()` helper (line ~15-25): add `ferien: [],` next to `abwesenheiten: [],`.

In `src/components/ReihenEditor.test.tsx` (lines 39-40), add `ferien: []` to both literals:

```ts
const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], ferien: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], ferien: [] },
]
```

In `src/components/PersonenUmverteilung.test.tsx` (lines 8-9), same fix:

```ts
const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], ferien: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], ferien: [] },
]
```

- [ ] **Step 7: Run the full suite and the build**

Run: `npm test`
Expected: PASS — all tests green (this project's `test` script is `vitest run`).

Run: `npm run build`
Expected: PASS — no TypeScript errors (this catches any remaining `Person` literal missing `ferien` that Vitest's transpile-only run wouldn't have flagged, e.g. in `src/App.tsx` or `src/data/data.json` consumers — note `src/state/useAppData.ts`'s `migriereDatenbestand` backfills `ferien` at runtime for seed/imported data, handled in Task 2, so `npm run build` should already be clean after this task since seed data is only type-asserted, not structurally checked).

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/berechnung.ts src/lib/berechnung.test.ts src/lib/personenKapazitaet.test.ts src/lib/szenario.test.ts src/components/ReihenEditor.test.tsx src/components/PersonenUmverteilung.test.tsx
git commit -m "feat(berechnungstool): reduce Person capacity for weekdays covered by Ferien"
```

---

### Task 2: Wire Ferien through `useAppData`

**Files:**
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`

**Interfaces:**
- Consumes: `Person.ferien: FerienZeitraum[]` (Task 1).
- Produces: `setPersonFerien(personId: string, ferien: FerienZeitraum[]): void`, returned from `useAppData()` — consumed by Task 3's `PersonenTabelle` wiring in `App.tsx`.

- [ ] **Step 1: Write the failing tests**

In `src/state/useAppData.test.ts`, add these three tests (anywhere after the `addPerson`/`removePerson` tests, e.g. right after `'removePerson deletes the selected person and recomputes the ergebnis'`):

```ts
  it('addPerson seeds an empty ferien list', () => {
    const { result } = renderHook(() => useAppData())
    act(() => {
      result.current.addPerson()
    })
    expect(result.current.data.personen.at(-1)?.ferien).toEqual([])
  })

  it('setPersonFerien replaces the ferien list of the matching Person only', () => {
    const { result } = renderHook(() => useAppData())
    const [p1, p2] = result.current.data.personen
    const neueFerien = [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-13' }]
    act(() => {
      result.current.setPersonFerien(p1.id, neueFerien)
    })
    expect(result.current.data.personen.find((p) => p.id === p1.id)?.ferien).toEqual(neueFerien)
    expect(result.current.data.personen.find((p) => p.id === p2.id)?.ferien).toEqual([])
  })

  it('backfills an empty ferien list for Personen persisted before the Ferien field existed', () => {
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
      personen: [{ id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] }],
      kalender: { ferien: [] },
      schulen: [],
    })
    localStorage.setItem('kapazitaetsrechner:data', roh)
    const { result } = renderHook(() => useAppData())
    expect(result.current.data.personen[0].ferien).toEqual([])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `addPerson` doesn't set `ferien`, `setPersonFerien` doesn't exist on the returned object (TypeError), and the migration doesn't backfill `ferien`.

- [ ] **Step 3: Implement the wiring**

In `src/state/useAppData.ts`, add `FerienZeitraum` to the type import:

```ts
import type { Datenbestand, Einheit, FerienZeitraum, Person, Terminstatus } from '../lib/types'
```

In `migriereDatenbestand`, change the `personen:` line from:

```ts
    personen: d.personen.filter((person) => !person.szenario_optional),
```

to:

```ts
    personen: d.personen
      .filter((person) => !person.szenario_optional)
      .map((person) => ({ ...person, ferien: person.ferien ?? [] })),
```

In `addPerson()`, add `ferien: []` to `neuePerson`:

```ts
      const neuePerson: Person = {
        id: `person_${jetzt}`,
        name: `Person ${prev.personen.length + 1}`,
        stunden_pro_woche_fuer_begleitung: 8,
        aktiv_ab: prev.settings.planungszeitraum.start,
        aktiv_bis: prev.settings.planungszeitraum.ende,
        abwesenheiten: [],
        ferien: [],
      }
```

Add a new function, next to `setPerson`:

```ts
  function setPersonFerien(personId: string, ferien: FerienZeitraum[]) {
    setData((prev) => ({
      ...prev,
      personen: prev.personen.map((p) => (p.id === personId ? { ...p, ferien } : p)),
    }))
  }
```

Add `setPersonFerien` to the object returned from `useAppData` (next to `setPerson`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts
git commit -m "feat(berechnungstool): wire Person Ferien through useAppData"
```

---

### Task 3: Ferien editor UI in `PersonenTabelle`

**Files:**
- Create: `src/components/PersonenTabelle.test.tsx`
- Modify: `src/components/PersonenTabelle.tsx`
- Modify: `src/components/PersonenTabelle.css`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `setPersonFerien` from `useAppData()` (Task 2).
- Produces: `PersonenTabelle` gains a required prop `onFerienChange: (personId: string, ferien: FerienZeitraum[]) => void`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/PersonenTabelle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonenTabelle } from './PersonenTabelle'
import type { Person } from '../lib/types'

const personen: Person[] = [
  {
    id: 'p1',
    name: 'Anna',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    ferien: [{ name: 'Sommerurlaub', von: '2026-07-01', bis: '2026-07-10' }],
  },
]

function renderTabelle() {
  const props = {
    personen,
    onChange: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onFerienChange: vi.fn(),
  }
  render(<PersonenTabelle {...props} />)
  return props
}

describe('PersonenTabelle Ferien', () => {
  it('renders an existing Ferien entry for a Person', () => {
    renderTabelle()
    expect(screen.getByLabelText('Ferien-Name 1 von Anna')).toHaveValue('Sommerurlaub')
    expect(screen.getByLabelText('Ferien-Von 1 von Anna')).toHaveValue('2026-07-01')
    expect(screen.getByLabelText('Ferien-Bis 1 von Anna')).toHaveValue('2026-07-10')
  })

  it('clicking "+ Ferienzeitraum" appends a new empty entry', () => {
    const props = renderTabelle()
    fireEvent.click(screen.getByText('+ Ferienzeitraum'))
    expect(props.onFerienChange).toHaveBeenCalledWith('p1', [
      { name: 'Sommerurlaub', von: '2026-07-01', bis: '2026-07-10' },
      { name: '', von: '', bis: '' },
    ])
  })

  it('editing the Von date of an entry calls onFerienChange with the updated entry', () => {
    const props = renderTabelle()
    fireEvent.change(screen.getByLabelText('Ferien-Von 1 von Anna'), { target: { value: '2026-07-02' } })
    expect(props.onFerienChange).toHaveBeenCalledWith('p1', [
      { name: 'Sommerurlaub', von: '2026-07-02', bis: '2026-07-10' },
    ])
  })

  it('clicking the delete button removes that Ferien entry', () => {
    const props = renderTabelle()
    fireEvent.click(screen.getByLabelText('Ferien 1 von Anna löschen'))
    expect(props.onFerienChange).toHaveBeenCalledWith('p1', [])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/PersonenTabelle.test.tsx`
Expected: FAIL — `PersonenTabelle` doesn't accept `onFerienChange` and renders no Ferien inputs, so `getByLabelText(...)` throws "Unable to find a label".

- [ ] **Step 3: Implement the Ferien column**

Replace `src/components/PersonenTabelle.tsx` entirely with:

```tsx
import type { FerienZeitraum, Person } from '../lib/types'
import './PersonenTabelle.css'

export function PersonenTabelle({
  personen,
  onChange,
  onAdd,
  onRemove,
  onFerienChange,
}: {
  personen: Person[]
  onChange: (id: string, patch: Partial<Person>) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onFerienChange: (personId: string, ferien: FerienZeitraum[]) => void
}) {
  return (
    <div>
      <h2>Personen & Stunden/Woche für Begleitung</h2>
      <div className="personen-tabelle-scroll">
      <table className="personen-tabelle">
        <thead>
          <tr>
            <th>Person</th>
            <th>Stunden/Woche für Begleitung</th>
            <th>Ferien</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {personen.map((p) => (
            <tr key={p.id}>
              <td>
                <input
                  type="text"
                  aria-label={`Name von ${p.name}`}
                  value={p.name}
                  onChange={(e) => onChange(p.id, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={p.stunden_pro_woche_fuer_begleitung}
                  onChange={(e) => onChange(p.id, { stunden_pro_woche_fuer_begleitung: Number(e.target.value) })}
                />
                <span> {p.stunden_pro_woche_fuer_begleitung} h</span>
              </td>
              <td>
                <ul className="personen-ferien-liste">
                  {p.ferien.map((f, i) => (
                    <li key={i}>
                      <input
                        type="text"
                        aria-label={`Ferien-Name ${i + 1} von ${p.name}`}
                        placeholder="Name"
                        value={f.name}
                        onChange={(e) =>
                          onFerienChange(p.id, p.ferien.map((ff, j) => (j === i ? { ...ff, name: e.target.value } : ff)))
                        }
                      />
                      <input
                        type="date"
                        aria-label={`Ferien-Von ${i + 1} von ${p.name}`}
                        value={f.von}
                        onChange={(e) =>
                          onFerienChange(p.id, p.ferien.map((ff, j) => (j === i ? { ...ff, von: e.target.value } : ff)))
                        }
                      />
                      <input
                        type="date"
                        aria-label={`Ferien-Bis ${i + 1} von ${p.name}`}
                        value={f.bis}
                        onChange={(e) =>
                          onFerienChange(p.id, p.ferien.map((ff, j) => (j === i ? { ...ff, bis: e.target.value } : ff)))
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Ferien ${i + 1} von ${p.name} löschen`}
                        onClick={() => onFerienChange(p.id, p.ferien.filter((_, j) => j !== i))}
                      >
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onFerienChange(p.id, [...p.ferien, { name: '', von: '', bis: '' }])}
                >
                  + Ferienzeitraum
                </button>
              </td>
              <td>
                <button type="button" onClick={() => onRemove(p.id)} aria-label={`${p.name} löschen`}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <button type="button" onClick={onAdd}>
        Person hinzufügen
      </button>
    </div>
  )
}
```

Append to `src/components/PersonenTabelle.css`:

```css
.personen-ferien-liste {
  list-style: none;
  margin: 0 0 0.25rem;
  padding: 0;
}

.personen-ferien-liste li {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  margin-bottom: 0.25rem;
}

.personen-ferien-liste input[type='text'] {
  max-width: 6rem;
}

.personen-ferien-liste input[type='date'] {
  max-width: 8.5rem;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/PersonenTabelle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the new prop in `App.tsx`**

In `src/App.tsx`, add `setPersonFerien` to the destructured values from `useAppData()`:

```ts
  const {
    data,
    setPerson,
    addPerson,
    removePerson,
    setPersonFerien,
    setEinheitBegleitung,
    ...
```

And pass it to `PersonenTabelle`:

```tsx
      <div className="card">
        <PersonenTabelle
          personen={data.personen}
          onChange={setPerson}
          onAdd={addPerson}
          onRemove={removePerson}
          onFerienChange={setPersonFerien}
        />
      </div>
```

- [ ] **Step 6: Run the full suite and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/PersonenTabelle.tsx src/components/PersonenTabelle.css src/components/PersonenTabelle.test.tsx src/App.tsx
git commit -m "feat(berechnungstool): add Ferien editor to PersonenTabelle"
```

---

### Task 4: Remove Kapazitäts-Umverteilung

This task deletes code and its tests together rather than following red/green (there's no new behavior — the aggregate `Umverteilung` mechanism is being removed because `PersonenUmverteilung` already supersedes it, per week, per person). The check at the end is that the full suite is green using only the *retained* tests.

**Files:**
- Delete: `src/components/KapazitaetsUmverteilung.tsx`
- Delete: `src/components/KapazitaetsUmverteilung.test.tsx`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/berechnung.ts`
- Modify: `src/lib/berechnung.test.ts`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/BedarfAngebotChart.tsx`
- Modify: `src/components/EngpassBericht.test.tsx`
- Modify: `src/components/ThemenUebersicht.test.tsx`
- Modify: `src/lib/themenUebersicht.test.ts`
- Modify: `src/components/WochenHeatmap.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `WochenErgebnis` no longer has `angebotBasis` / `zusatzangebot` / `abgezogenesFerienangebot` — only `angebot`. Any code constructing a `WochenErgebnis` fixture must drop those three fields.

- [ ] **Step 1: Delete the component and its test**

```bash
git rm src/components/KapazitaetsUmverteilung.tsx src/components/KapazitaetsUmverteilung.test.tsx
```

- [ ] **Step 2: Remove it from `App.tsx`**

Remove the import line:

```ts
import { KapazitaetsUmverteilung } from './components/KapazitaetsUmverteilung'
```

Remove the card:

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

Also remove `addUmverteilung` and `removeUmverteilung` from the destructured values pulled from `useAppData()` at the top of `App()`.

- [ ] **Step 3: Remove the `Umverteilung` type**

In `src/lib/types.ts`, delete the `Umverteilung` interface:

```ts
export interface Umverteilung {
  id: string
  quelleWochenKey: string
  ferienName: string
  zielWochenKey: string
  zusatzStunden: number
}
```

And remove the `umverteilungen?: Umverteilung[]` line from `Datenbestand`.

- [ ] **Step 4: Simplify `berechnung.ts`**

Remove `Umverteilung` from the type import:

```ts
import type { Einheit, Settings, Schule, Datenbestand, Person } from './types'
```

Delete these three functions entirely:

```ts
export function berechneZusatzangebotProWoche(umverteilungen: Umverteilung[], wochenKey: string): number { ... }

export function berechneAbgezogenesFerienangebotProWoche(
  umverteilungen: Umverteilung[],
  wochenKey: string,
  angebotBasis: number
): number { ... }
```

and (further down):

```ts
export function berechneVerbleibendeFerienstunden(
  wochen: WochenErgebnis[],
  umverteilungen: Umverteilung[],
  quelleWochenKey: string
): number { ... }
```

Simplify the `WochenErgebnis` interface:

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
  ferienName: string | null
}
```

Simplify `berechneWochenuebersicht`:

```ts
export function berechneWochenuebersicht(data: Datenbestand): WochenErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  return wochenStarts.map((montag) => {
    const wochenKey = getISOWochenKey(montag)
    const istFerien = istWocheInFerien(montag, data.kalender.ferien)
    const ferienName = ermittleFerienName(montag, data.kalender.ferien)
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
      ferienName,
    }
  })
}
```

- [ ] **Step 5: Remove the aggregate redistribution wiring from `useAppData.ts`**

Delete the `ermittleQuelleWochenKeyFuerFerienname` function entirely.

In `migriereDatenbestand`, remove the `umverteilungen:` line (the `.map(...)` backfill block) from the returned object — `Datenbestand` no longer has this field.

Delete `addUmverteilung` and `removeUmverteilung` in their entirety, and remove them from the object returned by `useAppData()`.

- [ ] **Step 6: Update `BedarfAngebotChart.tsx`**

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
  }))

  return (
    <div>
      <div className="chart-legende" aria-label="Legende Bedarf und Angebot">
        <span><i style={{ background: '#a5d6a7' }} /> Angebot (Personen-Kapazität)</span>
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

- [ ] **Step 7: Fix `berechnung.test.ts`**

Update the imports at the top:

```ts
import { berechneAufwandEinheit, berechneKoordinationWoche, berechneBedarfProWoche, berechneAngebotProWoche } from './berechnung'
import { ampelFarbe, berechneWochenuebersicht, berechneMachbarkeit } from './berechnung'
import type { WochenErgebnis } from './berechnung'
import type { Einheit, Settings, Schule, Datenbestand, Person } from './types'
```

Delete the entire `describe('berechneZusatzangebotProWoche', ...)` block (2 tests).

Delete the entire `describe('berechneVerbleibendeFerienstunden', ...)` block (5 tests).

Delete the entire `it('raises angebot in the Zielwoche and subtracts it from the Ferien-Quellwoche', ...)` test inside `describe('berechneWochenuebersicht', ...)`.

In `describe('berechneMachbarkeit', ...)`, simplify the `basis` fixture:

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
    ferienName: null,
  }
```

- [ ] **Step 8: Fix the remaining `WochenErgebnis` fixtures**

In `src/components/EngpassBericht.test.tsx`, `src/components/ThemenUebersicht.test.tsx`, `src/lib/themenUebersicht.test.ts`, and `src/components/WochenHeatmap.test.tsx`, each has a `woche()` helper containing:

```ts
    angebotBasis: 32,
    zusatzangebot: 0,
    abgezogenesFerienangebot: 0,
```

Delete those three lines from each of the four files' `woche()` helpers (leave every other field as-is).

- [ ] **Step 9: Fix `useAppData.test.ts`**

Delete these three tests entirely: `'addUmverteilung appends a new Umverteilung with the given values and leaves existing entries unchanged'`, `'removeUmverteilung deletes the matching entry and leaves others unchanged'`, and `'assigns quelleWochenKey to a persisted Umverteilung missing that field, based on its ferienName'`.

- [ ] **Step 10: Run the full suite and the build**

Run: `npm test`
Expected: PASS — no reference to `Umverteilung`, `angebotBasis`, `zusatzangebot`, or `abgezogenesFerienangebot` remains anywhere.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(berechnungstool): remove Kapazitäts-Umverteilung, superseded by Personen-Umverteilung"
```

---

### Task 5: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, all test files green.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: PASS, no TypeScript errors.

- [ ] **Step 3: Visual check in the browser**

Start the dev server (`npm run dev`), open the app, and confirm:
- The Personen table has a new "Ferien" column; adding, editing, and deleting a Ferien entry works and the row for the affected week in "Personen-Kapazitäten" drops accordingly.
- There is no "Kapazitäts-Umverteilung" card anywhere on the page; "Personen-Umverteilung" is still present and functions as before.
- The `BedarfAngebotChart` legend reads "Angebot (Personen-Kapazität)" and the chart still renders bars.
- No errors in the browser console.

Stop the dev server afterward.

- [ ] **Step 4: Report completion**

No commit needed for this task (verification only) unless Step 3 surfaces a bug — if so, fix it, re-run Steps 1–3, and commit the fix with an appropriate message before considering the plan complete.
