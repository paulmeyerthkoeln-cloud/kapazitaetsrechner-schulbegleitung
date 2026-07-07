# Personen-Kapazitäten, Begleitperson-Zuweisung & Umverteilung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separate, additive per-person capacity layer to the Berechnungstool: assigning a specific Person as "Begleitperson" to a Termin, tracking each Person's own weekly capacity (base minus assignments, plus/minus their own redistributions), a capacity overview grid, and a per-person redistribution feature distinct from the existing Ferien-based `Kapazitäts-Umverteilung`.

**Architecture:** New calculation module (`src/lib/personenKapazitaet.ts`) reuses an extracted helper from `berechnung.ts` (no behavior change to the existing aggregate Bedarf/Angebot/Ampel calculation — verified by the existing regression tests on `berechneAngebotProWoche`). Two new components render the overview and the redistribution form. `Einheit.begleitperson_id` is a new, independent, nullable field alongside the untouched `wir_begleiten` boolean.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + @testing-library/react, date-fns.

## Global Constraints

- Repo root is `/Users/PaulJ/Documents/Ideaalwerk`; run all commands from `/Users/PaulJ/Documents/Ideaalwerk/Berechnungstool`.
- Test with `npm test` (vitest run), typecheck+build with `npm run build` (`tsc -b && vite build`).
- `wir_begleiten` is never removed or renamed — it keeps gating `berechneBedarfProWoche`'s `einsatzBedarf` exactly as today, and the existing Besetzungs-Presets (`wendeBesetzungPreset`) are not touched by this plan.
- The existing aggregate `Bedarf`/`Angebot`/`Ampel`/`Machbarkeit` calculations do not change. The existing Ferien-based `Umverteilung`/`KapazitaetsUmverteilung` feature does not change.
- Spec: `docs/superpowers/specs/2026-07-07-berechnungstool-personen-kapazitaeten-design.md`.
- Deviation from the spec's stated signature: `berechnePersonenKapazitaet` takes only `data: Datenbestand` (no `wochen` parameter) — the per-person week list is derived from `data.settings.planungszeitraum` directly (the same way `berechneWochenuebersicht` derives it), and nothing in the per-person calculation needs `WochenErgebnis` (no Ferien/Bedarf dependency). Passing `wochen` in would be an unused parameter.
- Deviation from the spec's stated signature: `berechneVerbleibendePersonenstunden(personenKapazitaet, personId, quelleWochenKey)` — no separate `umverteilungen` parameter, since the per-person `verbleibend` returned by `berechnePersonenKapazitaet` is already net of that person's redistributions (via its `umverteilt` field); passing `umverteilungen` again would double-subtract.

---

### Task 1: Calculation layer — types, extracted basis helper, new `personenKapazitaet.ts`

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/berechnung.ts`
- Modify: `src/lib/berechnung.test.ts` (no new tests needed — existing `describe('berechneAngebotProWoche', ...)` tests at lines 380-407 already cover sum/absence/active-window behavior and serve as the regression guard for the extraction; this task must keep them passing unmodified)
- Create: `src/lib/personenKapazitaet.ts`
- Test: `src/lib/personenKapazitaet.test.ts`

**Interfaces:**
- Produces: `export function berechnePersonKapazitaetsbasis(person: Person, wochenStartMontag: Date): number` in `berechnung.ts`.
- Produces: `export interface PersonKapazitaetsWoche { wochenKey: string; basis: number; umverteilt: number; zugewiesen: number; verbleibend: number }`, `export interface PersonKapazitaetsErgebnis { personId: string; name: string; wochen: PersonKapazitaetsWoche[] }`, `export function berechnePersonenKapazitaet(data: Datenbestand): PersonKapazitaetsErgebnis[]`, `export function berechneVerbleibendePersonenstunden(personenKapazitaet: PersonKapazitaetsErgebnis[], personId: string, quelleWochenKey: string): number` — all in `src/lib/personenKapazitaet.ts`. Used by Tasks 3 and 4.

- [ ] **Step 1: Add the new fields to `types.ts`**

In `src/lib/types.ts`, add `begleitperson_id` to `Einheit` (after `koordinationszeit_h?: number`):

```ts
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
  koordinationszeit_h?: number
  begleitperson_id?: string | null
}
```

Add a new interface directly after `Umverteilung`:

```ts
export interface PersonenUmverteilung {
  id: string
  personId: string
  quelleWochenKey: string
  zielWochenKey: string
  stunden: number
}
```

Add a field to `Datenbestand`:

```ts
export interface Datenbestand {
  settings: Settings
  personen: Person[]
  kalender: Kalender
  schulen: Schule[]
  umverteilungen?: Umverteilung[]
  personenUmverteilungen?: PersonenUmverteilung[]
}
```

- [ ] **Step 2: Write the failing regression check for the extraction**

Run: `npm test -- berechnung`
Expected: PASS (this is the baseline before refactoring — confirm all existing `berechneAngebotProWoche` tests pass before touching the implementation, so any later failure is attributable to this task).

- [ ] **Step 3: Extract `berechnePersonKapazitaetsbasis` in `berechnung.ts`**

Replace the current `berechneAngebotProWoche` (lines 49-65) with:

```ts
export function berechnePersonKapazitaetsbasis(person: Person, wochenStartMontag: Date): number {
  const wochenEnde = endOfISOWeek(wochenStartMontag)
  const aktivAb = parseISO(person.aktiv_ab)
  const aktivBis = parseISO(person.aktiv_bis)
  if (wochenEnde < aktivAb || wochenStartMontag > aktivBis) return 0

  const wochentage = eachDayOfInterval({ start: wochenStartMontag, end: wochenEnde }).filter((d) => !isWeekend(d))
  const abwesendeTage = wochentage.filter((tag) =>
    person.abwesenheiten.some((a) => tag >= parseISO(a.von) && tag <= parseISO(a.bis))
  ).length
  const abzugsfaktor = Math.min(1, abwesendeTage * 0.2)
  return person.stunden_pro_woche_fuer_begleitung * (1 - abzugsfaktor)
}

export function berechneAngebotProWoche(personen: Person[], wochenStartMontag: Date): number {
  return personen.reduce((summe, person) => summe + berechnePersonKapazitaetsbasis(person, wochenStartMontag), 0)
}
```

This is behaviorally identical: a person outside their `aktiv_ab`/`aktiv_bis` window previously contributed nothing (via `continue`); now `berechnePersonKapazitaetsbasis` returns `0` for them and `reduce` adds `0` — same total.

- [ ] **Step 4: Run test to confirm the extraction didn't change behavior**

Run: `npm test -- berechnung`
Expected: PASS — same tests as Step 2, now against the refactored implementation.

- [ ] **Step 5: Write the failing tests for `personenKapazitaet.ts`**

Create `src/lib/personenKapazitaet.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { berechnePersonenKapazitaet, berechneVerbleibendePersonenstunden } from './personenKapazitaet'
import type { Datenbestand, Einheit, Person, Schule, Terminstatus } from './types'

const settings: Datenbestand['settings'] = {
  planungszeitraum: { start: '2026-11-02', ende: '2026-11-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
  koordination_h_pro_schule_pro_monat: 1.5,
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: 'Anna',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    ...overrides,
  }
}

function einheit(overrides: Partial<Einheit> = {}): Einheit {
  return {
    id: 'e1',
    index: 1,
    datum_oder_kw: '2026-KW46',
    kontaktzeit_h: 3,
    personen_parallel: 1,
    erstdurchfuehrung: false,
    wir_begleiten: true,
    typ: 'regulaer',
    ...overrides,
  }
}

function datenbestand(overrides: Partial<Datenbestand> = {}): Datenbestand {
  return {
    settings,
    personen: [person()],
    kalender: { ferien: [] },
    schulen: [],
    ...overrides,
  }
}

function schuleMitEinheit(einheitPatch: Partial<Einheit> = {}, terminstatus: Terminstatus = 'festgelegt'): Schule {
  return {
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
        terminstatus,
        einheiten: [einheit(einheitPatch)],
      },
    ],
  }
}

describe('berechnePersonenKapazitaet', () => {
  it('returns basis capacity with no assignments or redistribution for each week in the planning period', () => {
    const ergebnis = berechnePersonenKapazitaet(datenbestand())
    expect(ergebnis).toHaveLength(1)
    expect(ergebnis[0].personId).toBe('p1')
    expect(ergebnis[0].name).toBe('Anna')
    expect(ergebnis[0].wochen.map((w) => w.wochenKey)).toEqual(['2026-KW45', '2026-KW46', '2026-KW47'])
    expect(ergebnis[0].wochen.every((w) => w.basis === 8 && w.umverteilt === 0 && w.zugewiesen === 0 && w.verbleibend === 8)).toBe(true)
  })

  it('subtracts kontaktzeit_h from verbleibend for the week of an Einheit assigned to that Person', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(3)
    expect(kw46.verbleibend).toBe(5)
    const kw45 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW45')!
    expect(kw45.zugewiesen).toBe(0)
    expect(kw45.verbleibend).toBe(8)
  })

  it('ignores Einheiten in Reihen with terminstatus "offen"', () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' }, 'offen')],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('ignores Einheiten assigned to a different Person', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p2', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('nets umverteilt from that Person\'s own PersonenUmverteilung entries, both source and target weeks', () => {
    const data = datenbestand({
      personenUmverteilungen: [{ id: 'u1', personId: 'p1', quelleWochenKey: '2026-KW45', zielWochenKey: '2026-KW47', stunden: 2 }],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw45 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW45')!
    const kw47 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW47')!
    expect(kw45.umverteilt).toBe(-2)
    expect(kw45.verbleibend).toBe(6)
    expect(kw47.umverteilt).toBe(2)
    expect(kw47.verbleibend).toBe(10)
  })

  it('ignores another Person\'s PersonenUmverteilung entries', () => {
    const data = datenbestand({
      personen: [person({ id: 'p1' }), person({ id: 'p2', name: 'Ben' })],
      personenUmverteilungen: [{ id: 'u1', personId: 'p2', quelleWochenKey: '2026-KW45', zielWochenKey: '2026-KW47', stunden: 2 }],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const anna = ergebnis.find((p) => p.personId === 'p1')!
    expect(anna.wochen.every((w) => w.umverteilt === 0)).toBe(true)
  })
})

describe('berechneVerbleibendePersonenstunden', () => {
  it('returns the current verbleibend for that Person and week', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2026-KW46')).toBe(5)
  })

  it('floors at 0 when verbleibend is negative', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_id: 'p1', kontaktzeit_h: 20, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2026-KW46')).toBe(0)
  })

  it('returns 0 when the Person or week is not found', () => {
    const ergebnis = berechnePersonenKapazitaet(datenbestand())
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'unbekannt', '2026-KW46')).toBe(0)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2099-KW01')).toBe(0)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- personenKapazitaet`
Expected: FAIL — `./personenKapazitaet` module does not exist yet.

- [ ] **Step 7: Implement `src/lib/personenKapazitaet.ts`**

```ts
import { berechnePersonKapazitaetsbasis } from './berechnung'
import { alleWochenImZeitraum, getISOWochenKey, parseZuWochenKey } from './kalenderwochen'
import type { Datenbestand } from './types'

export interface PersonKapazitaetsWoche {
  wochenKey: string
  basis: number
  umverteilt: number
  zugewiesen: number
  verbleibend: number
}

export interface PersonKapazitaetsErgebnis {
  personId: string
  name: string
  wochen: PersonKapazitaetsWoche[]
}

function berechneZugewieseneStundenProWoche(data: Datenbestand, personId: string): Map<string, number> {
  const zugewiesen = new Map<string, number>()
  for (const schule of data.schulen) {
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (einheit.begleitperson_id !== personId) continue
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        zugewiesen.set(wochenKey, (zugewiesen.get(wochenKey) ?? 0) + einheit.kontaktzeit_h)
      }
    }
  }
  return zugewiesen
}

export function berechnePersonenKapazitaet(data: Datenbestand): PersonKapazitaetsErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  const personenUmverteilungen = data.personenUmverteilungen ?? []

  return data.personen.map((person) => {
    const zugewieseneStunden = berechneZugewieseneStundenProWoche(data, person.id)
    const eigeneUmverteilungen = personenUmverteilungen.filter((u) => u.personId === person.id)

    const wochen: PersonKapazitaetsWoche[] = wochenStarts.map((montag) => {
      const wochenKey = getISOWochenKey(montag)
      const basis = berechnePersonKapazitaetsbasis(person, montag)
      const eingehend = eigeneUmverteilungen.filter((u) => u.zielWochenKey === wochenKey).reduce((summe, u) => summe + u.stunden, 0)
      const ausgehend = eigeneUmverteilungen.filter((u) => u.quelleWochenKey === wochenKey).reduce((summe, u) => summe + u.stunden, 0)
      const umverteilt = eingehend - ausgehend
      const zugewiesen = zugewieseneStunden.get(wochenKey) ?? 0
      return { wochenKey, basis, umverteilt, zugewiesen, verbleibend: basis + umverteilt - zugewiesen }
    })

    return { personId: person.id, name: person.name, wochen }
  })
}

export function berechneVerbleibendePersonenstunden(
  personenKapazitaet: PersonKapazitaetsErgebnis[],
  personId: string,
  quelleWochenKey: string
): number {
  const ergebnis = personenKapazitaet.find((p) => p.personId === personId)
  const woche = ergebnis?.wochen.find((w) => w.wochenKey === quelleWochenKey)
  return Math.max(0, woche?.verbleibend ?? 0)
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- personenKapazitaet`
Expected: PASS

- [ ] **Step 9: Run the full test suite and typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds (confirms `types.ts` additions don't break any existing consumer — they're all optional/additive fields).

- [ ] **Step 10: Commit**

```bash
git add src/lib/types.ts src/lib/berechnung.ts src/lib/personenKapazitaet.ts src/lib/personenKapazitaet.test.ts
git commit -m "feat(berechnungstool): add per-person capacity calculation (personenKapazitaet.ts)"
```

---

### Task 2: Begleitperson assignment — UI and state

**Files:**
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/components/ReihenEditor.test.tsx`
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Einheit.begleitperson_id` (Task 1).
- Produces: `personen: Person[]` prop threaded through `SchulenAccordion` → `SchuleAkkordionItem` → `ReihenEditor`. `setEinheitFelder`'s patch type gains `begleitperson_id?: string | null`. `removePerson` now also clears `begleitperson_id` and filters `personenUmverteilungen` — the latter is a no-op today (no producer of `personenUmverteilungen` exists until Task 4) but is safe and forward-compatible since the field is optional.

- [ ] **Step 1: Write the failing tests for `ReihenEditor.tsx`**

In `src/components/ReihenEditor.test.tsx`, change the type import (line 4) from:

```tsx
import type { Reihe } from '../lib/types'
```

to:

```tsx
import type { Person, Reihe } from '../lib/types'
```

Add a `personen` fixture after the `reihe` constant:

```tsx
const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] },
]
```

Add `personen,` to the props object inside `renderReihenEditor()` (currently lines 39-48).

Add these tests inside `describe('ReihenEditor', ...)`:

```tsx
  it('renders a Begleitperson option for each Person, plus a niemand option', () => {
    renderReihenEditor()
    const begleitpersonSelects = screen.getAllByRole('combobox', { name: /Begleitperson für Termin/ })
    const optionLabels = Array.from(begleitpersonSelects[0].querySelectorAll('option')).map((o) => o.textContent)
    expect(optionLabels).toEqual(['— niemand —', 'Anna', 'Ben'])
  })

  it('disables the Begleitperson dropdown when Wir begleiten is off', () => {
    renderReihenEditor()
    expect(screen.getByRole('combobox', { name: 'Begleitperson für Termin 2 in Testreihe' })).toBeDisabled()
  })

  it('enables the Begleitperson dropdown when Wir begleiten is on', () => {
    renderReihenEditor()
    expect(screen.getByRole('combobox', { name: 'Begleitperson für Termin 1 in Testreihe' })).not.toBeDisabled()
  })

  it('calls onEinheitFelderChange with the selected Begleitperson id', () => {
    const props = renderReihenEditor()
    const begleitperson = screen.getByRole('combobox', { name: 'Begleitperson für Termin 1 in Testreihe' })
    fireEvent.change(begleitperson, { target: { value: 'p2' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { begleitperson_id: 'p2' })
  })

  it('calls onEinheitFelderChange with null when Begleitperson is reset to — niemand —', () => {
    const props = renderReihenEditor()
    const begleitperson = screen.getByRole('combobox', { name: 'Begleitperson für Termin 1 in Testreihe' })
    fireEvent.change(begleitperson, { target: { value: '' } })
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { begleitperson_id: null })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ReihenEditor`
Expected: FAIL — no `personen` prop exists yet, no Begleitperson combobox rendered.

- [ ] **Step 3: Update `ReihenEditor.tsx`**

Add `Person` to the type import (line 4): `import type { BesetzungsPreset, Person, Reihe, Terminstatus, Thema } from '../lib/types'`.

Add `personen` to the props destructuring and type (lines 14-35):

```tsx
export function ReihenEditor({
  reihe,
  personen,
  onEinheitToggle,
  onPresetApply,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
}: {
  reihe: Reihe
  personen: Person[]
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onPresetApply: (preset: BesetzungsPreset) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null }
  ) => void
  onTerminstatusChange: (wert: Terminstatus) => void
  onTermineGenerieren: (startdatum: string, unterrichtszeitH: number, anzahlTermine: number) => void
}) {
```

Add a new header cell after `<th>Wir begleiten</th>` (currently line 130):

```tsx
            <th>Begleitperson</th>
```

Add a new cell after the "Wir begleiten" checkbox cell (currently lines 184-190, the `<td>` containing the checkbox `<input>`):

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ReihenEditor`
Expected: PASS

- [ ] **Step 5: Thread `personen` through `SchuleAkkordionItem.tsx`**

Add `personen: Person[]` to the props type and pass it to `ReihenEditor`:

```tsx
import { ReihenEditor } from './ReihenEditor'
import type { BesetzungsPreset, Person, Schule, Settings, Terminstatus, Thema } from '../lib/types'

export function SchuleAkkordionItem({
  schule,
  personen,
  onEinheitToggle,
  onPresetApply,
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
  onPresetApply: (reiheId: string, preset: BesetzungsPreset) => void
  onEinheitAdd: (reiheId: string) => void
  onEinheitRemove: (reiheId: string, einheitId: string) => void
  onEinheitFelderChange: (
    reiheId: string,
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_id?: string | null }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onTermineGenerieren: (reiheId: string, startdatum: string, unterrichtszeitH: number, anzahlTermine: number) => void
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
              onPresetApply={(preset) => onPresetApply(reihe.id, preset)}
              onEinheitAdd={() => onEinheitAdd(reihe.id)}
              onEinheitRemove={(einheitId) => onEinheitRemove(reihe.id, einheitId)}
              onEinheitFelderChange={(einheitId, patch) => onEinheitFelderChange(reihe.id, einheitId, patch)}
              onTerminstatusChange={(wert) => onTerminstatusChange(reihe.id, wert)}
              onTermineGenerieren={(startdatum, unterrichtszeitH, anzahlTermine) =>
                onTermineGenerieren(reihe.id, startdatum, unterrichtszeitH, anzahlTermine)
              }
            />
          </div>
        ))}
      </div>
    </details>
  )
}
```

In `src/components/SchuleAkkordionItem.test.tsx`, add `personen: []` to the props object inside `renderItem()` (currently lines 26-36).

- [ ] **Step 6: Thread `personen` through `SchulenAccordion.tsx`**

Add `personen: Person[]` to the props type and pass it to `SchuleAkkordionItem`:

```tsx
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { wendeBesetzungPreset } from '../lib/besetzung'
import { generiereWochentlicheTermine } from '../lib/kalenderwochen'
import type { BesetzungsPreset, Einheit, FerienZeitraum, Person, Schule, Settings, Terminstatus, Thema } from '../lib/types'
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
    <div className="schulen-accordion">
      {schulen.map((schule) => (
        <SchuleAkkordionItem
          key={schule.id}
          schule={schule}
          settings={settings}
          personen={personen}
          onEinheitToggle={onEinheitToggle}
          onPresetApply={onPresetApply}
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

In `src/components/SchulenAccordion.test.tsx`, add `personen: [],` to the props object inside `renderAccordion()` (currently lines 71-82).

- [ ] **Step 7: Run the component test suite**

Run: `npm test -- ReihenEditor SchuleAkkordionItem SchulenAccordion`
Expected: PASS

- [ ] **Step 8: Write the failing `useAppData` tests**

Add to `src/state/useAppData.test.ts`, after the existing `'addEinheit places the new Einheit...'` test:

```ts
  it('setEinheitBegleitung clears begleitperson_id when toggled off', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_id: personId })
    })
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
    expect(aktualisierteReihe.einheiten[0].begleitperson_id).toBeNull()
  })

  it('removePerson clears begleitperson_id on any Einheit that referenced the deleted Person', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_id: personId })
    })
    act(() => {
      result.current.removePerson(personId)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].begleitperson_id).toBeNull()
  })
```

- [ ] **Step 9: Run test to verify it fails**

Run: `npm test -- useAppData`
Expected: FAIL — `setEinheitBegleitung` doesn't clear `begleitperson_id` yet, `removePerson` doesn't cascade yet.

- [ ] **Step 10: Update `useAppData.ts`**

Change `setEinheitBegleitung` (currently lines 92-107) to also clear `begleitperson_id` when turned off:

```ts
  function setEinheitBegleitung(reiheId: string, einheitId: string, wert: boolean) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) =>
          reihe.id !== reiheId
            ? reihe
            : {
                ...reihe,
                einheiten: reihe.einheiten.map((e) =>
                  e.id === einheitId ? { ...e, wir_begleiten: wert, begleitperson_id: wert ? e.begleitperson_id : null } : e
                ),
              }
        ),
      })),
    }))
  }
```

Change `removePerson` (currently lines 85-90) to cascade-clear:

```ts
  function removePerson(id: string) {
    setData((prev) => ({
      ...prev,
      personen: prev.personen.filter((p) => p.id !== id),
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => ({
          ...reihe,
          einheiten: reihe.einheiten.map((e) => (e.begleitperson_id === id ? { ...e, begleitperson_id: null } : e)),
        })),
      })),
      personenUmverteilungen: (prev.personenUmverteilungen ?? []).filter((u) => u.personId !== id),
    }))
  }
```

Change `setEinheitFelder`'s patch type (currently line 150) to include `begleitperson_id`:

```ts
  function setEinheitFelder(
    reiheId: string,
    einheitId: string,
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema' | 'koordinationszeit_h' | 'begleitperson_id'>>
  ) {
```

- [ ] **Step 11: Run test to verify it passes**

Run: `npm test -- useAppData`
Expected: PASS

- [ ] **Step 12: Wire `personen` into `App.tsx`**

Add `personen={data.personen}` to the `<SchulenAccordion>` call (currently lines 56-66):

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
        ferien={data.kalender.ferien}
      />
```

- [ ] **Step 13: Run the full test suite and typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds with no TypeScript errors.

- [ ] **Step 14: Commit**

```bash
git add src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): add Begleitperson assignment to each Termin"
```

---

### Task 3: Capacity overview grid

**Files:**
- Create: `src/components/PersonenKapazitaetsUebersicht.tsx`
- Create: `src/components/PersonenKapazitaetsUebersicht.css`
- Test: `src/components/PersonenKapazitaetsUebersicht.test.tsx`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PersonKapazitaetsErgebnis`, `berechnePersonenKapazitaet` from `src/lib/personenKapazitaet.ts` (Task 1); `kwNummer` from `src/lib/kalenderwochen.ts`.
- Produces: `personenKapazitaet: PersonKapazitaetsErgebnis[]` returned from `useAppData()`, consumed by Task 4.

- [ ] **Step 1: Write the failing component test**

Create `src/components/PersonenKapazitaetsUebersicht.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PersonenKapazitaetsUebersicht } from './PersonenKapazitaetsUebersicht'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

const personenKapazitaet: PersonKapazitaetsErgebnis[] = [
  {
    personId: 'p1',
    name: 'Anna',
    wochen: [
      { wochenKey: '2026-KW46', basis: 8, umverteilt: 0, zugewiesen: 3, verbleibend: 5 },
      { wochenKey: '2026-KW47', basis: 8, umverteilt: 0, zugewiesen: 10, verbleibend: -2 },
    ],
  },
]

describe('PersonenKapazitaetsUebersicht', () => {
  it('shows a placeholder message when there are no Personen', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={[]} />)
    expect(screen.getByText(/Keine Personen/)).toBeInTheDocument()
  })

  it('shows the Person name as a row label', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />)
    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('shows the KW number for each week column', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />)
    expect(screen.getByText('46')).toBeInTheDocument()
    expect(screen.getByText('47')).toBeInTheDocument()
  })

  it('shows verbleibend rounded to 1 decimal in each cell, positive and negative', () => {
    render(<PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />)
    expect(screen.getByText('5')).toHaveClass('positiv')
    expect(screen.getByText('-2')).toHaveClass('negativ')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PersonenKapazitaetsUebersicht`
Expected: FAIL — `./PersonenKapazitaetsUebersicht` module does not exist yet.

- [ ] **Step 3: Implement `PersonenKapazitaetsUebersicht.tsx`**

```tsx
import './PersonenKapazitaetsUebersicht.css'
import { kwNummer } from '../lib/kalenderwochen'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

export function PersonenKapazitaetsUebersicht({ personenKapazitaet }: { personenKapazitaet: PersonKapazitaetsErgebnis[] }) {
  if (personenKapazitaet.length === 0) {
    return (
      <div>
        <h3>Personen-Kapazitäten</h3>
        <p>Keine Personen vorhanden.</p>
      </div>
    )
  }

  const wochenKeys = personenKapazitaet[0].wochen.map((w) => w.wochenKey)

  return (
    <div>
      <h3>Personen-Kapazitäten</h3>
      <div className="personen-kapazitaet-scroll">
        <div
          className="personen-kapazitaet-grid"
          style={{
            gridTemplateColumns: `8rem repeat(${wochenKeys.length}, 2.5rem)`,
            gridTemplateRows: `1.5rem repeat(${personenKapazitaet.length}, 1.75rem)`,
          }}
        >
          <div className="personen-kapazitaet-ecke" style={{ gridColumn: 1, gridRow: 1 }} />
          {wochenKeys.map((key, i) => (
            <div key={key} className="personen-kapazitaet-kw" style={{ gridColumn: i + 2, gridRow: 1 }}>
              {kwNummer(key)}
            </div>
          ))}
          {personenKapazitaet.map((person, zeile) => (
            <div
              key={`${person.personId}-label`}
              className="personen-kapazitaet-label"
              style={{ gridColumn: 1, gridRow: zeile + 2 }}
            >
              {person.name}
            </div>
          ))}
          {personenKapazitaet.map((person, zeile) =>
            person.wochen.map((w, spalte) => {
              const gerundet = Math.round(w.verbleibend * 10) / 10
              return (
                <div
                  key={`${person.personId}-${w.wochenKey}`}
                  className={`personen-kapazitaet-zelle ${gerundet >= 0 ? 'positiv' : 'negativ'}`}
                  style={{ gridColumn: spalte + 2, gridRow: zeile + 2 }}
                  title={`${person.name}, ${kwNummer(w.wochenKey)}: ${gerundet}h verbleibend`}
                >
                  {gerundet}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `PersonenKapazitaetsUebersicht.css`**

```css
.personen-kapazitaet-scroll {
  overflow-x: auto;
  padding: 0.5rem 0;
}

.personen-kapazitaet-grid {
  display: grid;
}

.personen-kapazitaet-ecke {
  position: sticky;
  left: 0;
  background: #fff;
}

.personen-kapazitaet-kw {
  font-size: 0.75rem;
  text-align: center;
  color: #555;
  border-bottom: 1px solid #d0d0d0;
  padding-bottom: 0.25rem;
}

.personen-kapazitaet-label {
  position: sticky;
  left: 0;
  background: #fff;
  padding-right: 0.5rem;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 1;
}

.personen-kapazitaet-zelle {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  border: 1px solid #d0d0d0;
}

.personen-kapazitaet-zelle.positiv {
  background: #c8e6c9;
}

.personen-kapazitaet-zelle.negativ {
  background: #ffcdd2;
  font-weight: bold;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- PersonenKapazitaetsUebersicht`
Expected: PASS

- [ ] **Step 6: Write the failing `useAppData` test**

Add to `src/state/useAppData.test.ts`, after the existing `'exposes themenGanttZeilen...'` test:

```ts
  it('exposes personenKapazitaet derived from the current data', () => {
    const { result } = renderHook(() => useAppData())
    expect(Array.isArray(result.current.personenKapazitaet)).toBe(true)
    expect(result.current.personenKapazitaet).toHaveLength(result.current.data.personen.length)
  })
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- useAppData`
Expected: FAIL — `personenKapazitaet` is not returned from the hook yet.

- [ ] **Step 8: Wire `personenKapazitaet` into `useAppData.ts`**

Add the import (alongside the existing `themenUebersicht` import):

```ts
import { berechnePersonenKapazitaet } from '../lib/personenKapazitaet'
```

Add the memo, directly after `themenGanttZeilen`:

```ts
  const personenKapazitaet = useMemo(() => berechnePersonenKapazitaet(data), [data])
```

Add `personenKapazitaet` to the returned object (alongside `themenGanttZeilen`).

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- useAppData`
Expected: PASS

- [ ] **Step 10: Render it in `App.tsx`**

Add the import:

```tsx
import { PersonenKapazitaetsUebersicht } from './components/PersonenKapazitaetsUebersicht'
```

Add `personenKapazitaet` to the destructured hook result, and render a new card directly after the `PersonenTabelle` card:

```tsx
      <div className="card">
        <PersonenTabelle personen={data.personen} onChange={setPerson} onAdd={addPerson} onRemove={removePerson} />
      </div>
      <div className="card">
        <PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />
      </div>
```

- [ ] **Step 11: Run the full test suite and typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 12: Commit**

```bash
git add src/components/PersonenKapazitaetsUebersicht.tsx src/components/PersonenKapazitaetsUebersicht.css src/components/PersonenKapazitaetsUebersicht.test.tsx src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): add PersonenKapazitaetsUebersicht capacity overview grid"
```

---

### Task 4: Per-person redistribution

**Files:**
- Create: `src/components/PersonenUmverteilung.tsx`
- Test: `src/components/PersonenUmverteilung.test.tsx`
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PersonKapazitaetsErgebnis`, `berechneVerbleibendePersonenstunden` from `src/lib/personenKapazitaet.ts` (Task 1); `personenKapazitaet` from `useAppData()` (Task 3); `PersonenUmverteilung` type from `src/lib/types.ts` (Task 1).

- [ ] **Step 1: Write the failing component test**

Create `src/components/PersonenUmverteilung.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonenUmverteilung } from './PersonenUmverteilung'
import type { Person, PersonenUmverteilung as PersonenUmverteilungTyp } from '../lib/types'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] },
]

const personenKapazitaet: PersonKapazitaetsErgebnis[] = [
  {
    personId: 'p1',
    name: 'Anna',
    wochen: [
      { wochenKey: '2026-KW46', basis: 8, umverteilt: 0, zugewiesen: 3, verbleibend: 5 },
      { wochenKey: '2026-KW47', basis: 8, umverteilt: 0, zugewiesen: 0, verbleibend: 8 },
    ],
  },
  {
    personId: 'p2',
    name: 'Ben',
    wochen: [
      { wochenKey: '2026-KW46', basis: 8, umverteilt: 0, zugewiesen: 8, verbleibend: 0 },
      { wochenKey: '2026-KW47', basis: 8, umverteilt: 0, zugewiesen: 0, verbleibend: 8 },
    ],
  },
]

function renderKomponente(overrides: Partial<{
  personen: Person[]
  personenKapazitaet: PersonKapazitaetsErgebnis[]
  personenUmverteilungen: PersonenUmverteilungTyp[]
  onAdd: (personId: string, quelleWochenKey: string, zielWochenKey: string, stunden: number) => void
  onRemove: (id: string) => void
}> = {}) {
  const props = {
    personen,
    personenKapazitaet,
    personenUmverteilungen: [] as PersonenUmverteilungTyp[],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
  render(<PersonenUmverteilung {...props} />)
  return props
}

describe('PersonenUmverteilung', () => {
  it('labels the Quell-Woche options with the selected Person\'s remaining hours', () => {
    renderKomponente()
    expect(screen.getByText(/noch 5 Std verfügbar/)).toBeInTheDocument()
  })

  it('disables a Quell-Woche option once the selected Person is ausgeschöpft there', () => {
    renderKomponente()
    const personSelect = screen.getByLabelText(/^Person:/)
    fireEvent.change(personSelect, { target: { value: 'p2' } })
    const quelleSelect = screen.getByLabelText(/Quell-Woche/) as HTMLSelectElement
    const kw46Option = Array.from(quelleSelect.options).find((o) => o.value === '2026-KW46')!
    expect(kw46Option.disabled).toBe(true)
    expect(kw46Option.textContent).toMatch(/ausgeschöpft/)
  })

  it('calls onAdd with the selected Person, Quell-Woche, Ziel-Woche, and Stunden capped to verbleibend', () => {
    const props = renderKomponente()
    fireEvent.change(screen.getByLabelText(/Stunden/), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Hinzufügen'))
    expect(props.onAdd).toHaveBeenCalledWith('p1', '2026-KW46', '2026-KW46', 5)
  })

  it('renders existing Personen-Umverteilungen with a working delete button', () => {
    const props = renderKomponente({
      personenUmverteilungen: [{ id: 'u1', personId: 'p1', quelleWochenKey: '2026-KW46', zielWochenKey: '2026-KW47', stunden: 2 }],
    })
    expect(screen.getByText(/2 Std von Anna aus/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Personen-Umverteilung u1 löschen'))
    expect(props.onRemove).toHaveBeenCalledWith('u1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PersonenUmverteilung`
Expected: FAIL — `./PersonenUmverteilung` module does not exist yet.

- [ ] **Step 3: Implement `PersonenUmverteilung.tsx`**

```tsx
import { useState } from 'react'
import { berechneVerbleibendePersonenstunden } from '../lib/personenKapazitaet'
import { formatWochenspanne } from '../lib/kalenderwochen'
import type { Person, PersonenUmverteilung as PersonenUmverteilungTyp } from '../lib/types'
import type { PersonKapazitaetsErgebnis } from '../lib/personenKapazitaet'

export function PersonenUmverteilung({
  personen,
  personenKapazitaet,
  personenUmverteilungen,
  onAdd,
  onRemove,
}: {
  personen: Person[]
  personenKapazitaet: PersonKapazitaetsErgebnis[]
  personenUmverteilungen: PersonenUmverteilungTyp[]
  onAdd: (personId: string, quelleWochenKey: string, zielWochenKey: string, stunden: number) => void
  onRemove: (id: string) => void
}) {
  const wochenKeys = personenKapazitaet[0]?.wochen.map((w) => w.wochenKey) ?? []
  const [personId, setPersonId] = useState(personen[0]?.id ?? '')
  const [quelleWochenKey, setQuelleWochenKey] = useState(wochenKeys[0] ?? '')
  const [zielWochenKey, setZielWochenKey] = useState(wochenKeys[0] ?? '')
  const [stunden, setStunden] = useState(1)

  const verbleibend = berechneVerbleibendePersonenstunden(personenKapazitaet, personId, quelleWochenKey)

  function hinzufuegen() {
    if (!personId || !quelleWochenKey || !zielWochenKey || verbleibend <= 0) return
    const gekappt = Math.min(stunden, verbleibend)
    if (gekappt <= 0) return
    onAdd(personId, quelleWochenKey, zielWochenKey, gekappt)
  }

  function personName(id: string): string {
    return personen.find((p) => p.id === id)?.name ?? id
  }

  return (
    <div>
      <h3>Personen-Umverteilung</h3>
      <label>
        Person:{' '}
        <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
          {personen.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quell-Woche:{' '}
        <select value={quelleWochenKey} onChange={(e) => setQuelleWochenKey(e.target.value)}>
          {wochenKeys.map((key) => {
            const rest = berechneVerbleibendePersonenstunden(personenKapazitaet, personId, key)
            return (
              <option key={key} value={key} disabled={rest <= 0}>
                {formatWochenspanne(key)} – {rest <= 0 ? 'ausgeschöpft' : `noch ${rest} Std verfügbar`}
              </option>
            )
          })}
        </select>
      </label>
      <label>
        Ziel-Woche:{' '}
        <select value={zielWochenKey} onChange={(e) => setZielWochenKey(e.target.value)}>
          {wochenKeys.map((key) => (
            <option key={key} value={key}>
              {formatWochenspanne(key)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stunden:{' '}
        <input
          type="number"
          min={0}
          step={0.5}
          value={stunden}
          onChange={(e) => setStunden(Number(e.target.value))}
          style={{ width: '4rem' }}
        />
      </label>
      <button onClick={hinzufuegen} disabled={verbleibend <= 0}>
        Hinzufügen
      </button>
      <ul>
        {personenUmverteilungen.map((u) => (
          <li key={u.id}>
            {u.stunden} Std von {personName(u.personId)} aus {formatWochenspanne(u.quelleWochenKey)} → {formatWochenspanne(u.zielWochenKey)}{' '}
            <button onClick={() => onRemove(u.id)} aria-label={`Personen-Umverteilung ${u.id} löschen`}>
              🗑
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- PersonenUmverteilung`
Expected: PASS

- [ ] **Step 5: Write the failing `useAppData` tests**

Add to `src/state/useAppData.test.ts`, after the `'exposes personenKapazitaet...'` test:

```ts
  it('addPersonenUmverteilung appends a new entry', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.addPersonenUmverteilung(personId, '2026-KW46', '2026-KW47', 3)
    })
    expect(result.current.data.personenUmverteilungen).toHaveLength(1)
    expect(result.current.data.personenUmverteilungen?.[0]).toMatchObject({
      personId,
      quelleWochenKey: '2026-KW46',
      zielWochenKey: '2026-KW47',
      stunden: 3,
    })
  })

  it('removePersonenUmverteilung deletes the matching entry', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.addPersonenUmverteilung(personId, '2026-KW46', '2026-KW47', 3)
    })
    const id = result.current.data.personenUmverteilungen![0].id
    act(() => {
      result.current.removePersonenUmverteilung(id)
    })
    expect(result.current.data.personenUmverteilungen).toHaveLength(0)
  })
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- useAppData`
Expected: FAIL — `addPersonenUmverteilung`/`removePersonenUmverteilung` don't exist yet.

- [ ] **Step 7: Add the actions to `useAppData.ts`**

Add directly after `removeUmverteilung`:

```ts
  function addPersonenUmverteilung(personId: string, quelleWochenKey: string, zielWochenKey: string, stunden: number) {
    setData((prev) => ({
      ...prev,
      personenUmverteilungen: [
        ...(prev.personenUmverteilungen ?? []),
        { id: `personen_umverteilung_${Date.now()}`, personId, quelleWochenKey, zielWochenKey, stunden },
      ],
    }))
  }

  function removePersonenUmverteilung(id: string) {
    setData((prev) => ({
      ...prev,
      personenUmverteilungen: (prev.personenUmverteilungen ?? []).filter((u) => u.id !== id),
    }))
  }
```

Add both to the returned object (alongside `addUmverteilung`/`removeUmverteilung`).

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- useAppData`
Expected: PASS

- [ ] **Step 9: Render it in `App.tsx`**

Add the import:

```tsx
import { PersonenUmverteilung } from './components/PersonenUmverteilung'
```

Add `personenUmverteilungen`, `addPersonenUmverteilung`, `removePersonenUmverteilung` to the destructured hook result, and render a new card directly after the existing `KapazitaetsUmverteilung` card:

```tsx
      <div className="card">
        <KapazitaetsUmverteilung
          umverteilungen={data.umverteilungen ?? []}
          wochen={ergebnis.wochen}
          onAdd={addUmverteilung}
          onRemove={removeUmverteilung}
        />
      </div>
      <div className="card">
        <PersonenUmverteilung
          personen={data.personen}
          personenKapazitaet={personenKapazitaet}
          personenUmverteilungen={data.personenUmverteilungen ?? []}
          onAdd={addPersonenUmverteilung}
          onRemove={removePersonenUmverteilung}
        />
      </div>
```

- [ ] **Step 10: Run the full test suite and typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 11: Commit**

```bash
git add src/components/PersonenUmverteilung.tsx src/components/PersonenUmverteilung.test.tsx src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat(berechnungstool): add per-person capacity redistribution"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all tests PASS, zero failures.

- [ ] **Step 2: Typecheck and build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`, open the printed local URL, and confirm:
- Expanding a Schule shows a "Begleitperson" column next to "Wir begleiten", disabled when unchecked, offering every Person plus "— niemand —".
- Assigning a Person as Begleitperson to a Termin, then checking the new "Personen-Kapazitäten" grid (below the Personen table), shows that Person's remaining hours reduced in that Termin's week, colored red if it goes negative.
- The new "Personen-Umverteilung" section (below the existing "Kapazitäts-Umverteilung") lets you pick a Person, a Quell-Woche (showing remaining hours, disabled once exhausted), a Ziel-Woche, and Stunden, and adds/removes entries that update the capacity grid accordingly.
- Deleting a Person from the Personen table clears their Begleitperson assignments without errors.
- The top-of-page Ampel/Bedarf/Angebot numbers are unchanged by any of the above (confirms the aggregate calculation wasn't touched).

Stop the dev server afterward.
