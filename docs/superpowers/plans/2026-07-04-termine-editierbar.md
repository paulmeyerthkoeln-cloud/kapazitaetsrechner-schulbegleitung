# Termine editierbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users add, delete, and edit (Datum, Kontaktzeit) Termine (Einheiten) directly within an existing Reihe in the UI, resolving the "10th school stays empty" complaint since its placeholder Termine become fully editable.

**Architecture:** Three new immutable-update handlers (`addEinheit`, `removeEinheit`, `setEinheitFelder`) are added to `useAppData.ts` following the existing `setEinheitBegleitung` pattern. `ReihenEditor.tsx` gains editable Datum (text) and Kontaktzeit (minutes) inputs, a delete button per row, and an "add" button, wired through `App.tsx`.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, date-fns.

## Global Constraints

- Datum field is a plain text input everywhere (new and existing rows) — no native date picker, since existing entries can be in either `YYYY-MM-DD` or `YYYY-KWnn` format and a date picker cannot represent the latter. No format validation beyond what the existing calculation logic already tolerates (an unparseable string simply matches no week).
- Kontaktzeit is entered and displayed in **minutes**, converted to/from the stored `kontaktzeit_h` (hours) field. Conversion: displayed minutes = `Math.round(kontaktzeit_h * 60)`; stored hours = `minuten / 60`.
- Deleting a Termin is immediate — no confirmation dialog.
- A newly added Termin defaults to: today's date (`format(new Date(), 'yyyy-MM-dd')`), `kontaktzeit_h: 1.5` (90 minutes), `personen_parallel: 1`, `erstdurchfuehrung: false`, `wir_begleiten: true`, `typ: 'regulaer'`.
- `index` is recomputed sequentially (1..N, in array order) after every add/remove. This is display-only — no calculation logic reads `index` for anything other than display.
- Scope is limited to Termine within an already-existing Reihe. Creating new Reihen or Schulen is out of scope.

---

### Task 1: `addEinheit`, `removeEinheit`, `setEinheitFelder` handlers

**Files:**
- Modify: `src/state/useAppData.ts`
- Test: `src/state/useAppData.test.ts`

**Interfaces:**
- Consumes: existing `Datenbestand`/`Einheit` types from `../lib/types`, existing `setData` state setter pattern already used by `setPerson`/`setEinheitBegleitung`.
- Produces: `addEinheit(reiheId: string): void`, `removeEinheit(reiheId: string, einheitId: string): void`, `setEinheitFelder(reiheId: string, einheitId: string, patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h'>>): void` — all three returned from `useAppData()`, consumed by Task 2 (`App.tsx` → `ReihenEditor`).

- [ ] **Step 1: Write the failing tests**

Add to `src/state/useAppData.test.ts`, after the existing `setEinheitBegleitung` test (after line 34, before the `setSzenario` test):

```ts
  it('addEinheit appends a new Einheit with default values and the correct index', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const vorherigeAnzahl = reihe.einheiten.length
    act(() => {
      result.current.addEinheit(reihe.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten).toHaveLength(vorherigeAnzahl + 1)
    const neueEinheit = aktualisierteReihe.einheiten[vorherigeAnzahl]
    expect(neueEinheit.kontaktzeit_h).toBe(1.5)
    expect(neueEinheit.personen_parallel).toBe(1)
    expect(neueEinheit.erstdurchfuehrung).toBe(false)
    expect(neueEinheit.wir_begleiten).toBe(true)
    expect(neueEinheit.typ).toBe('regulaer')
    expect(neueEinheit.index).toBe(vorherigeAnzahl + 1)
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen[0].einheiten).toHaveLength(12)
  })

  it('removeEinheit deletes the matching Einheit and renumbers the rest', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const zuLoeschen = reihe.einheiten[1]
    act(() => {
      result.current.removeEinheit(reihe.id, zuLoeschen.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten).toHaveLength(3)
    expect(aktualisierteReihe.einheiten.find((e) => e.id === zuLoeschen.id)).toBeUndefined()
    expect(aktualisierteReihe.einheiten.map((e) => e.index)).toEqual([1, 2, 3])
  })

  it('setEinheitFelder updates datum_oder_kw and kontaktzeit_h without touching other fields', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { datum_oder_kw: '2026-12-01', kontaktzeit_h: 2 })
    })
    const aktualisierteEinheit = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].einheiten[0]
    expect(aktualisierteEinheit.datum_oder_kw).toBe('2026-12-01')
    expect(aktualisierteEinheit.kontaktzeit_h).toBe(2)
    expect(aktualisierteEinheit.wir_begleiten).toBe(einheit.wir_begleiten)
    expect(aktualisierteEinheit.id).toBe(einheit.id)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `result.current.addEinheit is not a function` (and similarly for `removeEinheit`/`setEinheitFelder`).

- [ ] **Step 3: Implement the three handlers**

In `src/state/useAppData.ts`, replace the import lines (lines 1–5):

```ts
import { useMemo, useState } from 'react'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Person } from '../lib/types'
```

with:

```ts
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import seedData from '../data/data.json'
import { berechneSzenario } from '../lib/szenario'
import type { SzenarioTyp, SensitivitaetsParameter } from '../lib/szenario'
import type { Datenbestand, Einheit, Person } from '../lib/types'
```

Then add the three new functions after `setEinheitBegleitung` (after line 37, before `exportJson`):

```ts

  function addEinheit(reiheId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => {
          if (reihe.id !== reiheId) return reihe
          const neueEinheit: Einheit = {
            id: `${reihe.id}_neu_${Date.now()}`,
            index: reihe.einheiten.length + 1,
            datum_oder_kw: format(new Date(), 'yyyy-MM-dd'),
            kontaktzeit_h: 1.5,
            personen_parallel: 1,
            erstdurchfuehrung: false,
            wir_begleiten: true,
            typ: 'regulaer',
          }
          return { ...reihe, einheiten: [...reihe.einheiten, neueEinheit] }
        }),
      })),
    }))
  }

  function removeEinheit(reiheId: string, einheitId: string) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => {
          if (reihe.id !== reiheId) return reihe
          const verbleibend = reihe.einheiten.filter((e) => e.id !== einheitId)
          return { ...reihe, einheiten: verbleibend.map((e, i) => ({ ...e, index: i + 1 })) }
        }),
      })),
    }))
  }

  function setEinheitFelder(
    reiheId: string,
    einheitId: string,
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h'>>
  ) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) =>
          reihe.id !== reiheId
            ? reihe
            : {
                ...reihe,
                einheiten: reihe.einheiten.map((e) => (e.id === einheitId ? { ...e, ...patch } : e)),
              }
        ),
      })),
    }))
  }
```

Finally, add the three functions to the returned object (replace lines 63–75):

```ts
  return {
    data,
    setPerson,
    setEinheitBegleitung,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
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
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all files — `App.tsx`/`ReihenEditor.tsx` don't consume these new handlers yet, so nothing else should be affected).

- [ ] **Step 6: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts
git commit -m "feat(berechnungstool): add addEinheit, removeEinheit, setEinheitFelder handlers"
```

---

### Task 2: Editable Termine in `ReihenEditor`

**Files:**
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/ReihenEditor.test.tsx` (new)

**Interfaces:**
- Consumes: `addEinheit(reiheId: string): void`, `removeEinheit(reiheId: string, einheitId: string): void`, `setEinheitFelder(reiheId: string, einheitId: string, patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h'>>): void` (Task 1).
- Produces: `ReihenEditor` now requires three additional props: `onEinheitAdd: () => void`, `onEinheitRemove: (einheitId: string) => void`, `onEinheitFelderChange: (einheitId: string, patch: { datum_oder_kw?: string; kontaktzeit_h?: number }) => void`.

- [ ] **Step 1: Write the failing test**

Create `src/components/ReihenEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReihenEditor } from './ReihenEditor'
import type { Reihe } from '../lib/types'

const reihe: Reihe = {
  id: 'r1',
  titel: 'Testreihe',
  betreuungsmodell: 'A',
  fahrzeit_h: 1,
  status: 'zugesagt',
  extern_betreut: false,
  einheiten: [
    {
      id: 'e1',
      index: 1,
      datum_oder_kw: '2026-09-07',
      kontaktzeit_h: 1.5,
      personen_parallel: 1,
      erstdurchfuehrung: true,
      wir_begleiten: true,
      typ: 'regulaer',
    },
    {
      id: 'e2',
      index: 2,
      datum_oder_kw: '2026-09-14',
      kontaktzeit_h: 1.1,
      personen_parallel: 1,
      erstdurchfuehrung: false,
      wir_begleiten: false,
      typ: 'regulaer',
    },
  ],
}

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

describe('ReihenEditor', () => {
  it('shows Kontaktzeit in minutes, converted from the stored hours', () => {
    renderReihenEditor()
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[1].value).toBe('90')
    expect(eingaben[2].value).toBe('66')
  })

  it('calls onEinheitFelderChange with kontaktzeit_h in hours when the minutes input changes', () => {
    const props = renderReihenEditor()
    const eingaben = screen.getAllByRole('spinbutton')
    fireEvent.change(eingaben[1], { target: { value: '120' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { kontaktzeit_h: 2 })
  })

  it('calls onEinheitFelderChange with the raw string when the Datum field changes', () => {
    const props = renderReihenEditor()
    const datumsfelder = screen.getAllByPlaceholderText('YYYY-MM-DD oder YYYY-KWnn')
    fireEvent.change(datumsfelder[0], { target: { value: '2026-KW50' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { datum_oder_kw: '2026-KW50' })
  })

  it('calls onEinheitRemove with the correct Einheit id when the delete button is clicked', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByLabelText('Termin 2 löschen'))
    expect(props.onEinheitRemove).toHaveBeenCalledWith('e2')
  })

  it('calls onEinheitAdd when the add button is clicked', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('+ Termin hinzufügen'))
    expect(props.onEinheitAdd).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: FAIL — `ReihenEditor` doesn't accept the three new props yet, doesn't render minute-based inputs, a delete button, or an add button.

- [ ] **Step 3: Implement the editable Termine UI**

Replace the full contents of `src/components/ReihenEditor.tsx`:

```tsx
import { useState } from 'react'
import { berechneUnserAnteil } from '../lib/besetzung'
import type { BesetzungsPreset, Reihe } from '../lib/types'

const PRESETS: { label: string; preset: (n: number) => BesetzungsPreset }[] = [
  { label: 'Alle', preset: () => ({ typ: 'alle' }) },
  { label: 'Keine', preset: () => ({ typ: 'keine' }) },
  { label: 'Erste & Letzte', preset: () => ({ typ: 'erste_und_letzte' }) },
]

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
  onEinheitFelderChange: (einheitId: string, patch: { datum_oder_kw?: string; kontaktzeit_h?: number }) => void
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
            <th>Kontaktzeit (min)</th>
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
                <input
                  type="checkbox"
                  checked={e.wir_begleiten}
                  onChange={(ev) => onEinheitToggle(e.id, ev.target.checked)}
                />
              </td>
              <td>
                <button onClick={() => onEinheitRemove(e.id)} aria-label={`Termin ${e.index} löschen`}>
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

Then wire it up in `src/App.tsx`: replace the destructured hook result (lines 15–27):

```ts
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
    importError,
  } = useAppData()
```

with:

```ts
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    szenario,
    setSzenario,
    sensitivitaet,
    setSensitivitaet,
    ergebnis,
    exportJson,
    importJson,
    importError,
  } = useAppData()
```

And replace the `<ReihenEditor>` usage (lines 55–60):

```tsx
          <ReihenEditor
            key={reihe.id}
            reihe={reihe}
            onEinheitToggle={(einheitId, wert) => setEinheitBegleitung(reihe.id, einheitId, wert)}
            onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
          />
```

with:

```tsx
          <ReihenEditor
            key={reihe.id}
            reihe={reihe}
            onEinheitToggle={(einheitId, wert) => setEinheitBegleitung(reihe.id, einheitId, wert)}
            onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
            onEinheitAdd={() => addEinheit(reihe.id)}
            onEinheitRemove={(einheitId) => removeEinheit(reihe.id, einheitId)}
            onEinheitFelderChange={(einheitId, patch) => setEinheitFelder(reihe.id, einheitId, patch)}
          />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/ReihenEditor.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all files across the project).

- [ ] **Step 6: Commit**

```bash
git add src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/App.tsx
git commit -m "feat(berechnungstool): make Termine addable, removable, and editable in ReihenEditor"
```

---

## Final Verification

- [ ] Run `npx vitest run` — all tests across the project pass.
- [ ] Run `npm run build` — TypeScript compiles cleanly (`tsc -b`) and Vite build succeeds.
- [ ] Run `npm run dev`, open the app, and for the "Schule X (Platzhalter)" Reihe: delete its seeded Termine, add a couple of new ones with a chosen date and Kontaktzeit in minutes, confirm they appear in the Wochen-Heatmap/Bedarf chart, then confirm deleting a Termin removes its contribution from the affected week.
