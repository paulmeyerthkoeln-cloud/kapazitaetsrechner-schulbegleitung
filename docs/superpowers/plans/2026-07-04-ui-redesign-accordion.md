# Schulen-Accordion + visuelle Auffrischung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group each Schule's summary info (Modell/Status/Koordination) and its Reihen (course series) into one collapsible per-Schule accordion element, replacing the current flat `SchulenTabelle` + separately-listed `ReihenEditor` blocks, and give the whole page basic consistent visual structure (card containers, spacing) instead of bare unstyled HTML.

**Architecture:** Two new components (`SchuleAkkordionItem` wrapping one Schule in a native `<details>`, `SchulenAccordion` mapping over all Schulen) replace `SchulenTabelle`. The existing, already-tested `ReihenEditor` is reused unchanged, nested inside `SchuleAkkordionItem`. `App.tsx` is rewired to use the new component and gains lightweight `.card` wrapper divs around its other top-level sections.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, plain CSS (no framework/library).

## Global Constraints

- Accordion uses native HTML `<details>`/`<summary>` — no custom React state for open/closed.
- The Koordination-h/Monat input sits inside the expanded body of a Schule's `<details>`, never inside `<summary>` (an interactive control inside `<summary>` would toggle the accordion on every click).
- `ReihenEditor.tsx` and `ReihenEditor.test.tsx` are NOT modified — reused as-is.
- `SchulenTabelle.tsx` and `SchulenTabelle.test.tsx` are deleted; their information (Modell, Status, Unser Anteil, Koordination) is preserved elsewhere: Anteil is already shown by `ReihenEditor` itself, Modell/Status move to a new per-Reihe meta line, Koordination becomes a once-per-Schule field.
- No changes to `useAppData.ts`, calculation logic (`src/lib/**`), or any existing handler signatures — this is a pure UI restructuring.
- No new dependencies (no CSS framework, no component library).

---

### Task 1: `SchuleAkkordionItem` component

**Files:**
- Create: `src/components/SchuleAkkordionItem.tsx`
- Test: `src/components/SchuleAkkordionItem.test.tsx`

**Interfaces:**
- Consumes: `ReihenEditor` (existing, unchanged) with its existing props `{ reihe, onEinheitToggle, onPresetApply, onEinheitAdd, onEinheitRemove, onEinheitFelderChange }`; `Schule`, `Settings`, `BesetzungsPreset` types from `../lib/types`.
- Produces: `SchuleAkkordionItem` component accepting `{ schule: Schule; settings: Settings; onKoordinationChange: (schuleId: string, wert: number) => void; onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void; onPresetApply: (reiheId: string, preset: BesetzungsPreset) => void; onEinheitAdd: (reiheId: string) => void; onEinheitRemove: (reiheId: string, einheitId: string) => void; onEinheitFelderChange: (reiheId: string, einheitId: string, patch: { datum_oder_kw?: string; kontaktzeit_h?: number }) => void }` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `src/components/SchuleAkkordionItem.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import type { Schule, Settings } from '../lib/types'

const settings: Settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

const schule: Schule = {
  id: 's1',
  name: 'Else Lasker',
  reihen: [
    { id: 'r1', titel: 'Reihe Eins', betreuungsmodell: 'A', fahrzeit_h: 1, status: 'zugesagt', extern_betreut: false, einheiten: [] },
    { id: 'r2', titel: 'Reihe Zwei', betreuungsmodell: 'C', fahrzeit_h: 0, status: 'in_klaerung', extern_betreut: false, einheiten: [] },
  ],
}

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

describe('SchuleAkkordionItem', () => {
  it('renders the Schule name inside a summary element', () => {
    renderItem()
    expect(screen.getByText('Else Lasker').closest('summary')).not.toBeNull()
  })

  it('shows a Modell/Status meta line for each Reihe', () => {
    renderItem()
    expect(screen.getByText('Modell A · Status: zugesagt')).toBeInTheDocument()
    expect(screen.getByText('Modell C · Status: in_klaerung')).toBeInTheDocument()
  })

  it('renders one ReihenEditor per Reihe, identifiable by its title heading', () => {
    renderItem()
    expect(screen.getByRole('heading', { name: 'Reihe Eins' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Reihe Zwei' })).toBeInTheDocument()
  })

  it('calls onKoordinationChange with the Schule id when the coordination field changes', () => {
    const props = renderItem()
    const eingabe = screen.getByRole('spinbutton', { name: /Koordination/i })
    fireEvent.change(eingabe, { target: { value: '3' } })
    expect(props.onKoordinationChange).toHaveBeenCalledWith('s1', 3)
  })

  it("calls onEinheitAdd with the correct Reihe id when that Reihe's add button is clicked", () => {
    const props = renderItem()
    const reiheEinsUeberschrift = screen.getByRole('heading', { name: 'Reihe Eins' })
    const reiheEinsContainer = reiheEinsUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheEinsContainer).getByText('+ Termin hinzufügen'))
    expect(props.onEinheitAdd).toHaveBeenCalledWith('r1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/SchuleAkkordionItem.test.tsx`
Expected: FAIL — cannot find module `./SchuleAkkordionItem` (the component doesn't exist yet).

- [ ] **Step 3: Implement `SchuleAkkordionItem`**

Create `src/components/SchuleAkkordionItem.tsx`:

```tsx
import { ReihenEditor } from './ReihenEditor'
import type { BesetzungsPreset, Schule, Settings } from '../lib/types'

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
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number }
  ) => void
}) {
  return (
    <details className="schule-akkordion-item">
      <summary>{schule.name}</summary>
      <div className="schule-akkordion-inhalt">
        <label>
          Koordination h/Monat:{' '}
          <input
            type="number"
            step={0.5}
            min={0}
            value={schule.koordination_h_pro_monat ?? settings.koordination_h_pro_schule_pro_monat}
            onChange={(e) => onKoordinationChange(schule.id, Number(e.target.value))}
            style={{ width: '4rem' }}
          />
        </label>
        {schule.reihen.map((reihe) => (
          <div key={reihe.id}>
            <p className="reihe-meta">
              Modell {reihe.betreuungsmodell} · Status: {reihe.status}
            </p>
            <ReihenEditor
              reihe={reihe}
              onEinheitToggle={(einheitId, wert) => onEinheitToggle(reihe.id, einheitId, wert)}
              onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
            />
          </div>
        ))}
      </div>
    </details>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/SchuleAkkordionItem.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (this component isn't used anywhere yet, so nothing else should be affected).

- [ ] **Step 6: Commit**

```bash
git add src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx
git commit -m "feat(berechnungstool): add SchuleAkkordionItem component"
```

---

### Task 2: `SchulenAccordion` component

**Files:**
- Create: `src/components/SchulenAccordion.tsx`
- Test: `src/components/SchulenAccordion.test.tsx`

**Interfaces:**
- Consumes: `SchuleAkkordionItem` (Task 1) with its exact prop shape; `wendeBesetzungPreset(einheiten: Einheit[], preset: BesetzungsPreset): Einheit[]` from `../lib/besetzung` (existing, unchanged).
- Produces: `SchulenAccordion` component accepting `{ schulen: Schule[]; settings: Settings; onKoordinationChange: (schuleId: string, wert: number) => void; onEinheitToggle: (reiheId: string, einheitId: string, wert: boolean) => void; onEinheitAdd: (reiheId: string) => void; onEinheitRemove: (reiheId: string, einheitId: string) => void; onEinheitFelderChange: (reiheId: string, einheitId: string, patch: { datum_oder_kw?: string; kontaktzeit_h?: number }) => void }` (no `onPresetApply` prop — this component computes it internally, since it needs to search across all `schulen` to find the matching Reihe, exactly like the current `App.tsx` does) — used by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/components/SchulenAccordion.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SchulenAccordion } from './SchulenAccordion'
import type { Schule, Settings } from '../lib/types'

const settings: Settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

const schulen: Schule[] = [
  {
    id: 's1',
    name: 'Schule Eins',
    reihen: [
      {
        id: 'r1',
        titel: 'Reihe Eins',
        betreuungsmodell: 'A',
        fahrzeit_h: 1,
        status: 'zugesagt',
        extern_betreut: false,
        einheiten: [
          {
            id: 'e1',
            index: 1,
            datum_oder_kw: '2026-09-07',
            kontaktzeit_h: 1,
            personen_parallel: 1,
            erstdurchfuehrung: false,
            wir_begleiten: false,
            typ: 'regulaer',
          },
        ],
      },
    ],
  },
  {
    id: 's2',
    name: 'Schule Zwei',
    reihen: [
      {
        id: 'r2',
        titel: 'Reihe Zwei',
        betreuungsmodell: 'C',
        fahrzeit_h: 0,
        status: 'zugesagt',
        extern_betreut: false,
        einheiten: [
          {
            id: 'e2',
            index: 1,
            datum_oder_kw: '2026-09-07',
            kontaktzeit_h: 1,
            personen_parallel: 1,
            erstdurchfuehrung: false,
            wir_begleiten: false,
            typ: 'regulaer',
          },
        ],
      },
    ],
  },
]

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

describe('SchulenAccordion', () => {
  it('renders one details element per Schule with the Schule name as summary', () => {
    renderAccordion()
    const details = document.querySelectorAll('details')
    expect(details).toHaveLength(2)
    expect(screen.getByText('Schule Eins').closest('summary')).not.toBeNull()
    expect(screen.getByText('Schule Zwei').closest('summary')).not.toBeNull()
  })

  it('applies a Besetzung-Preset only to the matching Reihe, scoped to the correct Schule', () => {
    const props = renderAccordion()
    const reiheZweiUeberschrift = screen.getByRole('heading', { name: 'Reihe Zwei' })
    const reiheZweiContainer = reiheZweiUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheZweiContainer).getByText('Alle'))
    expect(props.onEinheitToggle).toHaveBeenCalledWith('r2', 'e2', true)
    expect(props.onEinheitToggle).not.toHaveBeenCalledWith('r1', 'e1', true)
  })

  it('forwards onEinheitAdd with the correct Reihe id for a specific Schule', () => {
    const props = renderAccordion()
    const reiheEinsUeberschrift = screen.getByRole('heading', { name: 'Reihe Eins' })
    const reiheEinsContainer = reiheEinsUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheEinsContainer).getByText('+ Termin hinzufügen'))
    expect(props.onEinheitAdd).toHaveBeenCalledWith('r1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/SchulenAccordion.test.tsx`
Expected: FAIL — cannot find module `./SchulenAccordion`.

- [ ] **Step 3: Implement `SchulenAccordion`**

Create `src/components/SchulenAccordion.tsx`:

```tsx
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import type { BesetzungsPreset, Schule, Settings } from '../lib/types'

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
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number }
  ) => void
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
    <div className="schulen-accordion">
      {schulen.map((schule) => (
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
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/SchulenAccordion.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx
git commit -m "feat(berechnungstool): add SchulenAccordion component"
```

---

### Task 3: Wire `SchulenAccordion` into `App.tsx`, remove `SchulenTabelle`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Delete: `src/components/SchulenTabelle.tsx`
- Delete: `src/components/SchulenTabelle.test.tsx`

**Interfaces:**
- Consumes: `SchulenAccordion` (Task 2) with its exact prop shape; existing `useAppData()` handlers `setEinheitBegleitung`, `setSchuleKoordination`, `addEinheit`, `removeEinheit`, `setEinheitFelder` (unchanged, already match `SchulenAccordion`'s expected callback signatures directly — no wrapping needed in `App.tsx` anymore).
- Produces: nothing new — this task only rewires existing pieces.

- [ ] **Step 1: Delete the old components**

```bash
git rm src/components/SchulenTabelle.tsx src/components/SchulenTabelle.test.tsx
```

- [ ] **Step 2: Replace `App.tsx`**

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
      <SzenarioAuswahl
        szenario={szenario}
        onSzenarioChange={setSzenario}
        sensitivitaet={sensitivitaet}
        onSensitivitaetChange={setSensitivitaet}
      />
      <AmpelAntwort machbarkeit={ergebnis.machbarkeit} />
      <WochenHeatmap wochen={ergebnis.wochen} />
      <BedarfAngebotChart wochen={ergebnis.wochen} settings={data.settings} />
      <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      <SchulenAccordion
        schulen={data.schulen}
        settings={data.settings}
        onKoordinationChange={setSchuleKoordination}
        onEinheitToggle={setEinheitBegleitung}
        onEinheitAdd={addEinheit}
        onEinheitRemove={removeEinheit}
        onEinheitFelderChange={setEinheitFelder}
      />
      <PersonenTabelle personen={data.personen} onChange={setPerson} />
      <RestkapazitaetPlanner data={data} />
      <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} />
    </main>
  )
}
```

- [ ] **Step 3: Update the stale comment in `App.test.tsx`**

In `src/App.test.tsx`, the second test's comment currently reasons about ambiguity caused by `SchulenTabelle` also rendering the Reihe title as plain text — that component no longer exists after Step 1, so that specific justification is now inaccurate (the rest of the comment's reasoning about `getByRole('heading')` and `closest('div')` still holds, since `ReihenEditor` itself is unchanged). Replace this comment block:

```tsx
    // Scope all queries to the WDG Reihe's own subtree, since every Reihe on the
    // page renders an identical "+ Termin hinzufügen" button and its own set of
    // "... löschen" delete buttons. ReihenEditor renders <h3>{reihe.titel}</h3> as
    // the direct child of the Reihe's single wrapping <div>, so the heading's
    // nearest ancestor <div> is exactly that Reihe's container. We look it up via
    // role "heading" (not getByText) because SchulenTabelle also renders the same
    // Reihe title as a plain <td>, so a plain text query matches twice.
```

with:

```tsx
    // Scope all queries to the WDG Reihe's own subtree, since every Reihe on the
    // page renders an identical "+ Termin hinzufügen" button and its own set of
    // "... löschen" delete buttons. ReihenEditor renders <h3>{reihe.titel}</h3> as
    // the direct child of the Reihe's single wrapping <div>, so the heading's
    // nearest ancestor <div> is exactly that Reihe's container.
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. However, Schulen now render inside collapsed `<details>` elements by default (closed on initial render), and the existing WDG add/remove integration test in `App.test.tsx` does not open WDG's accordion before interacting with it. If this test fails because the WDG content can't be found/interacted with while collapsed, open it first by adding this line immediately before the line `const wdgUeberschrift = screen.getByRole('heading', { name: 'Theorieblöcke Begabtenförderung' })` in `src/App.test.tsx`:

```tsx
    fireEvent.click(screen.getByText('WDG'))
```

Only add this if the test genuinely fails for this reason — if it passes without it, leave the test as-is.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(berechnungstool): wire SchulenAccordion into App, remove SchulenTabelle"
```

---

### Task 4: Visual polish — shared CSS and card layout

**Files:**
- Modify: `src/index.css`
- Create: `src/components/SchulenAccordion.css`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: nothing new — pure CSS/JSX-wrapping changes on top of Task 3's `App.tsx`.
- Produces: nothing new — visual-only change, verified by the existing test suite (no test asserts on styling) plus a manual browser check.

- [ ] **Step 1: Add shared design tokens to `index.css`**

Replace the full contents of `src/index.css`:

```css
:root {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.card {
  border: 1px solid #d0d0d0;
  border-radius: 0.5rem;
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
  background: #fff;
}

h1 {
  font-size: 1.75rem;
  margin: 0 0 var(--spacing-md);
}

h2 {
  font-size: 1.25rem;
  margin: 0 0 var(--spacing-sm);
}

h3 {
  font-size: 1.05rem;
  margin: 0 0 var(--spacing-sm);
}
```

- [ ] **Step 2: Create `SchulenAccordion.css` and import it**

Create `src/components/SchulenAccordion.css`:

```css
.schulen-accordion {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.schule-akkordion-item {
  border: 1px solid #d0d0d0;
  border-radius: 0.5rem;
  padding: var(--spacing-sm) var(--spacing-md);
  background: #fff;
}

.schule-akkordion-item > summary {
  cursor: pointer;
  font-weight: 600;
  padding: var(--spacing-sm) 0;
}

.schule-akkordion-inhalt {
  padding-left: var(--spacing-md);
  padding-top: var(--spacing-sm);
}

.reihe-meta {
  color: #555;
  font-size: 0.9rem;
  margin: var(--spacing-md) 0 0.25rem;
}
```

In `src/components/SchulenAccordion.tsx`, add the CSS import at the top of the file, after the existing imports (after the `import type { BesetzungsPreset, Schule, Settings } from '../lib/types'` line):

```tsx
import './SchulenAccordion.css'
```

- [ ] **Step 3: Wrap the other top-level sections in `.card` containers in `App.tsx`**

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
        <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} />
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (wrapping divs don't change any text/role queries the existing tests rely on).

- [ ] **Step 5: Run the TypeScript/build check**

Run: `npm run build`
Expected: PASS — `tsc -b` compiles cleanly and the Vite build succeeds.

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`

Open the shown localhost URL and confirm: each Schule appears as a bordered, collapsible card with its name as the clickable header; clicking expands it to show the Koordination field and its Reihen (each with a "Modell X · Status: Y" line and the existing Termine table); the other sections (Ampel, Heatmap, Diagramm, Engpass-Bericht, Personentabelle, Restkapazität, Export/Import) each appear as a bordered card with consistent spacing.

- [ ] **Step 7: Commit**

```bash
git add src/index.css src/components/SchulenAccordion.css src/components/SchulenAccordion.tsx src/App.tsx
git commit -m "feat(berechnungstool): add card layout and shared spacing/typography"
```

---

## Final Verification

- [ ] Run `npx vitest run` — all tests across the project pass.
- [ ] Run `npm run build` — TypeScript compiles cleanly and the Vite build succeeds.
- [ ] In the browser (`npm run dev`), confirm multiple Schulen can be expanded simultaneously (e.g. open WDG and Else Lasker at the same time, both stay open), and that editing the Koordination field or a Termin inside one Schule's accordion doesn't affect any other Schule.
