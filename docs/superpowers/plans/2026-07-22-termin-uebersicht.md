# Termin-Übersicht Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible "Terminliste" that lists every individual appointment (Schul-Einheiten and Veranstaltungs-Termine) chronologically in one place, filterable by Person/Schule-Veranstaltung/Terminstatus/Zeitraum, with same-day-same-person conflicts highlighted.

**Architecture:** A new pure-function module `src/lib/terminUebersicht.ts` flattens the existing `Datenbestand` (Schulen→Reihen→Einheiten and Veranstaltungen→Termine→Besetzungen) into one sorted `TerminZeile[]`, tags conflicting rows, and is exposed via `useAppData`. A new presentational component `src/components/TerminUebersicht.tsx` renders that list inside a native `<details>` element (collapsed by default) with client-side filtering in local state. It is wired into `App.tsx` as a new card between the existing `ThemenUebersicht` card and the `Schulen` heading.

**Tech Stack:** React 18 + TypeScript, Vitest + @testing-library/react, date-fns (via existing `src/lib/kalenderwochen.ts` helpers). No new dependencies.

## Global Constraints

- German identifiers/labels throughout (matches existing codebase: `Datenbestand`, `Terminstatus`, aria-labels in German).
- No new npm dependencies.
- Follow existing patterns: plain global CSS per component file (no CSS modules), `<details>`/`<summary>` for collapsible UI (see `DatumOderKwFeld.tsx`, `PersonenMehrfachauswahl.tsx`), checkbox fieldsets for multi-select filters (see `VeranstaltungenUebersicht.tsx` Schulen-fieldset).
- Reuse existing helpers instead of duplicating logic: `zuIsoDatum`, `parseZuWochenKey`, `formatDatumOderKw` from `src/lib/kalenderwochen.ts`; `PersonenMehrfachauswahl` component for the Person filter.
- Read-only view: no editing/mutation from this feature.

---

### Task 1: Zeilen-Aufbau aus Schulen (`src/lib/terminUebersicht.ts`)

**Files:**
- Create: `src/lib/terminUebersicht.ts`
- Test: `src/lib/terminUebersicht.test.ts`

**Interfaces:**
- Consumes: `Datenbestand`, `Schule`, `Reihe`, `Einheit`, `Terminstatus`, `Thema`, `Person` from `../lib/types`; `zuIsoDatum`, `parseZuWochenKey` from `./kalenderwochen`.
- Produces: `interface TerminZeile { id: string; isoDatum: string; datumOderKw: string; wochenKey: string; quelle: 'schule' | 'veranstaltung'; titel: string; schulId: string; schulName: string; thema?: Thema; terminstatus: Terminstatus; unterrichtsStunden: number; koordinationsStunden: number; begleitpersonIds: string[]; begleitpersonNamen: string[]; koordinatorIds: string[]; koordinatorNamen: string[]; hatKonflikt: boolean }` and `export function berechneTerminUebersicht(data: Datenbestand): TerminZeile[]` — used by Task 2 (adds Veranstaltungen), Task 3 (adds sort + conflicts), and by `useAppData.ts` in Task 7.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { berechneTerminUebersicht } from './terminUebersicht'
import type { Datenbestand, Einheit, Person, Reihe, Schule } from './types'

const settings: Datenbestand['settings'] = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: 'Anna',
    stunden_pro_woche_fuer_begleitung: 8,
    aktiv_ab: '2026-09-01',
    aktiv_bis: '2027-07-16',
    abwesenheiten: [],
    urlaub: [],
    ...overrides,
  }
}

function einheit(overrides: Partial<Einheit> = {}): Einheit {
  return {
    id: 'e1',
    index: 1,
    datum_oder_kw: '2026-11-09',
    kontaktzeit_h: 2,
    wir_begleiten: true,
    begleitperson_ids: [],
    koordinator_ids: [],
    ...overrides,
  }
}

function reihe(overrides: Partial<Reihe> = {}): Reihe {
  return {
    id: 'r1',
    titel: 'Reihe X',
    betreuungsmodell: 'A',
    status: 'zugesagt',
    extern_betreut: false,
    terminstatus: 'festgelegt',
    einheiten: [einheit()],
    ...overrides,
  }
}

function schule(overrides: Partial<Schule> = {}): Schule {
  return { id: 's1', name: 'Schule Eins', reihen: [reihe()], ...overrides }
}

function datenbestand(overrides: Partial<Datenbestand> = {}): Datenbestand {
  return {
    settings,
    personen: [person({ id: 'p1', name: 'Anna' }), person({ id: 'p2', name: 'Ben' })],
    kalender: { ferien: [] },
    schulen: [schule()],
    veranstaltungen: [],
    ...overrides,
  }
}

describe('berechneTerminUebersicht – Schulen', () => {
  it('creates one Zeile per Einheit with resolved names and hours', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            reihe({
              titel: 'Reihe X',
              terminstatus: 'festgelegt',
              einheiten: [
                einheit({
                  id: 'e1',
                  datum_oder_kw: '2026-11-09',
                  kontaktzeit_h: 2,
                  koordinationszeit_h: 0.5,
                  wir_begleiten: true,
                  begleitperson_ids: ['p1'],
                  koordinator_ids: ['p2'],
                  thema: 'Energie',
                }),
              ],
            }),
          ],
        }),
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]).toMatchObject({
      isoDatum: '2026-11-09',
      datumOderKw: '2026-11-09',
      wochenKey: '2026-KW46',
      quelle: 'schule',
      titel: 'Reihe X',
      schulId: 's1',
      schulName: 'Schule Eins',
      thema: 'Energie',
      terminstatus: 'festgelegt',
      unterrichtsStunden: 2,
      koordinationsStunden: 0.5,
      begleitpersonIds: ['p1'],
      begleitpersonNamen: ['Anna'],
      koordinatorIds: ['p2'],
      koordinatorNamen: ['Ben'],
    })
  })

  it('sets unterrichtsStunden to 0 when wir_begleiten is false, but keeps koordinationsStunden', () => {
    const data = datenbestand({
      schulen: [
        schule({
          reihen: [
            reihe({
              einheiten: [
                einheit({ kontaktzeit_h: 3, koordinationszeit_h: 1, wir_begleiten: false, begleitperson_ids: ['p1'] }),
              ],
            }),
          ],
        }),
      ],
    })
    const [zeile] = berechneTerminUebersicht(data)
    expect(zeile.unterrichtsStunden).toBe(0)
    expect(zeile.koordinationsStunden).toBe(1)
    expect(zeile.begleitpersonIds).toEqual([])
  })
})
```

Run: `npx vitest run src/lib/terminUebersicht.test.ts`
Expected: FAIL — `Cannot find module './terminUebersicht'`

- [ ] **Step 2: Implement `berechneTerminUebersicht` for Schulen only**

```ts
import { parseZuWochenKey, zuIsoDatum } from './kalenderwochen'
import type { Datenbestand, Terminstatus, Thema } from './types'

export interface TerminZeile {
  id: string
  isoDatum: string
  datumOderKw: string
  wochenKey: string
  quelle: 'schule' | 'veranstaltung'
  titel: string
  schulId: string
  schulName: string
  thema?: Thema
  terminstatus: Terminstatus
  unterrichtsStunden: number
  koordinationsStunden: number
  begleitpersonIds: string[]
  begleitpersonNamen: string[]
  koordinatorIds: string[]
  koordinatorNamen: string[]
  hatKonflikt: boolean
}

function personenNamen(ids: string[], personen: Datenbestand['personen']): string[] {
  return ids.map((id) => personen.find((p) => p.id === id)?.name ?? id)
}

function baueSchulZeilen(data: Datenbestand): TerminZeile[] {
  const zeilen: TerminZeile[] = []
  for (const schule of data.schulen) {
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        const begleitpersonIds = einheit.wir_begleiten ? einheit.begleitperson_ids : []
        zeilen.push({
          id: `schule_${einheit.id}`,
          isoDatum: zuIsoDatum(einheit.datum_oder_kw),
          datumOderKw: einheit.datum_oder_kw,
          wochenKey: parseZuWochenKey(einheit.datum_oder_kw),
          quelle: 'schule',
          titel: reihe.titel,
          schulId: schule.id,
          schulName: schule.name,
          thema: einheit.thema,
          terminstatus: reihe.terminstatus,
          unterrichtsStunden: einheit.wir_begleiten ? einheit.kontaktzeit_h : 0,
          koordinationsStunden: einheit.koordinationszeit_h ?? 0,
          begleitpersonIds,
          begleitpersonNamen: personenNamen(begleitpersonIds, data.personen),
          koordinatorIds: einheit.koordinator_ids,
          koordinatorNamen: personenNamen(einheit.koordinator_ids, data.personen),
          hatKonflikt: false,
        })
      }
    }
  }
  return zeilen
}

export function berechneTerminUebersicht(data: Datenbestand): TerminZeile[] {
  return baueSchulZeilen(data)
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/lib/terminUebersicht.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add src/lib/terminUebersicht.ts src/lib/terminUebersicht.test.ts
git commit -m "feat: build Termin-Uebersicht rows from Schulen"
```

---

### Task 2: Zeilen-Aufbau aus Veranstaltungen ergänzen

**Files:**
- Modify: `src/lib/terminUebersicht.ts`
- Test: `src/lib/terminUebersicht.test.ts`

**Interfaces:**
- Consumes: `Veranstaltung`, `VeranstaltungTermin`, `SchulBesetzung` from `../lib/types`; `TerminZeile` from Task 1.
- Produces: `berechneTerminUebersicht` now also includes rows with `quelle: 'veranstaltung'` — consumed unchanged by Task 3 and Task 7.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/terminUebersicht.test.ts`:

```ts
describe('berechneTerminUebersicht – Veranstaltungen', () => {
  it('creates one Zeile per Besetzung of a Veranstaltungs-Termin', () => {
    const data = datenbestand({
      schulen: [schule({ id: 's1', name: 'Schule Eins', reihen: [] }), schule({ id: 's2', name: 'Schule Zwei', reihen: [] })],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'themenwoche',
          titel: 'Nachhaltigkeitswoche',
          terminstatus: 'festgelegt',
          schulIds: ['s1', 's2'],
          termine: [
            {
              id: 't1',
              index: 1,
              datum_oder_kw: '2026-11-10',
              kontaktzeit_h: 1.5,
              thema: 'Stadtgrün',
              besetzungen: [
                { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0 },
                { schulId: 's2', wir_begleiten: false, begleitperson_ids: [], koordinator_ids: ['p2'], koordinationszeit_h: 1 },
              ],
            },
          ],
        },
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen).toHaveLength(2)
    expect(zeilen).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quelle: 'veranstaltung',
          titel: 'Nachhaltigkeitswoche',
          schulId: 's1',
          schulName: 'Schule Eins',
          thema: 'Stadtgrün',
          unterrichtsStunden: 1.5,
          koordinationsStunden: 0,
          begleitpersonNamen: ['Anna'],
        }),
        expect.objectContaining({
          quelle: 'veranstaltung',
          titel: 'Nachhaltigkeitswoche',
          schulId: 's2',
          schulName: 'Schule Zwei',
          unterrichtsStunden: 0,
          koordinationsStunden: 1,
          koordinatorNamen: ['Ben'],
        }),
      ])
    )
  })
})
```

Run: `npx vitest run src/lib/terminUebersicht.test.ts`
Expected: FAIL — 0 rows returned instead of 2 (this test's fixture overrides `schulen` with empty `reihen` on both entries, so `baueSchulZeilen` contributes nothing, and `berechneTerminUebersicht` doesn't build Veranstaltungs-Zeilen yet)

- [ ] **Step 2: Extend `berechneTerminUebersicht` with Veranstaltungen**

In `src/lib/terminUebersicht.ts`, add after `baueSchulZeilen`:

```ts
function baueVeranstaltungsZeilen(data: Datenbestand): TerminZeile[] {
  const zeilen: TerminZeile[] = []
  for (const veranstaltung of data.veranstaltungen) {
    for (const termin of veranstaltung.termine) {
      for (const besetzung of termin.besetzungen) {
        const begleitpersonIds = besetzung.wir_begleiten ? besetzung.begleitperson_ids : []
        const schulName = data.schulen.find((s) => s.id === besetzung.schulId)?.name ?? besetzung.schulId
        zeilen.push({
          id: `veranstaltung_${termin.id}_${besetzung.schulId}`,
          isoDatum: zuIsoDatum(termin.datum_oder_kw),
          datumOderKw: termin.datum_oder_kw,
          wochenKey: parseZuWochenKey(termin.datum_oder_kw),
          quelle: 'veranstaltung',
          titel: veranstaltung.titel,
          schulId: besetzung.schulId,
          schulName,
          thema: termin.thema,
          terminstatus: veranstaltung.terminstatus,
          unterrichtsStunden: besetzung.wir_begleiten ? termin.kontaktzeit_h : 0,
          koordinationsStunden: besetzung.koordinationszeit_h,
          begleitpersonIds,
          begleitpersonNamen: personenNamen(begleitpersonIds, data.personen),
          koordinatorIds: besetzung.koordinator_ids,
          koordinatorNamen: personenNamen(besetzung.koordinator_ids, data.personen),
          hatKonflikt: false,
        })
      }
    }
  }
  return zeilen
}
```

Replace the final export with:

```ts
export function berechneTerminUebersicht(data: Datenbestand): TerminZeile[] {
  return [...baueSchulZeilen(data), ...baueVeranstaltungsZeilen(data)]
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/lib/terminUebersicht.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add src/lib/terminUebersicht.ts src/lib/terminUebersicht.test.ts
git commit -m "feat: include Veranstaltungen in Termin-Uebersicht rows"
```

---

### Task 3: Sortierung und Konflikterkennung

**Files:**
- Modify: `src/lib/terminUebersicht.ts`
- Test: `src/lib/terminUebersicht.test.ts`

**Interfaces:**
- Consumes: `TerminZeile[]` from Tasks 1–2.
- Produces: `berechneTerminUebersicht` now returns rows sorted by `isoDatum` (then `schulName`, then `titel`) with `hatKonflikt` correctly set — consumed by Task 7 (`useAppData.ts`) and by the component tests in Tasks 4–6, which rely on `hatKonflikt` being pre-computed.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/terminUebersicht.test.ts`:

```ts
describe('berechneTerminUebersicht – Sortierung und Konflikte', () => {
  it('sorts rows chronologically by isoDatum', () => {
    const data = datenbestand({
      schulen: [
        schule({
          id: 's1',
          reihen: [
            reihe({
              einheiten: [
                einheit({ id: 'e1', datum_oder_kw: '2026-11-16' }),
                einheit({ id: 'e2', datum_oder_kw: '2026-11-09' }),
              ],
            }),
          ],
        }),
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen.map((z) => z.isoDatum)).toEqual(['2026-11-09', '2026-11-16'])
  })

  it('flags two rows on the same day sharing a Begleitperson as Konflikt', () => {
    const data = datenbestand({
      schulen: [
        schule({ id: 's1', name: 'Schule Eins', reihen: [reihe({ id: 'r1', einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-11-09', begleitperson_ids: ['p1'] })] })] }),
        schule({ id: 's2', name: 'Schule Zwei', reihen: [reihe({ id: 'r2', einheiten: [einheit({ id: 'e2', datum_oder_kw: '2026-11-09', begleitperson_ids: ['p1'] })] })] }),
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen.every((z) => z.hatKonflikt)).toBe(true)
  })

  it('does not flag a Konflikt when the shared Person is only listed but wir_begleiten is false and koordinationszeit_h is 0', () => {
    const data = datenbestand({
      schulen: [
        schule({ id: 's1', reihen: [reihe({ id: 'r1', einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-11-09', wir_begleiten: false, koordinationszeit_h: 0, begleitperson_ids: ['p1'] })] })] }),
        schule({ id: 's2', reihen: [reihe({ id: 'r2', einheiten: [einheit({ id: 'e2', datum_oder_kw: '2026-11-09', wir_begleiten: false, koordinationszeit_h: 0, begleitperson_ids: ['p1'] })] })] }),
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen.every((z) => !z.hatKonflikt)).toBe(true)
  })

  it('does not flag a Konflikt for the same Person on different days', () => {
    const data = datenbestand({
      schulen: [
        schule({ id: 's1', reihen: [reihe({ id: 'r1', einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-11-09', begleitperson_ids: ['p1'] })] })] }),
        schule({ id: 's2', reihen: [reihe({ id: 'r2', einheiten: [einheit({ id: 'e2', datum_oder_kw: '2026-11-16', begleitperson_ids: ['p1'] })] })] }),
      ],
    })
    const zeilen = berechneTerminUebersicht(data)
    expect(zeilen.every((z) => !z.hatKonflikt)).toBe(true)
  })
})
```

Run: `npx vitest run src/lib/terminUebersicht.test.ts`
Expected: FAIL — rows come back in insertion order (first test) and `hatKonflikt` stays `false` for every row (remaining tests)

- [ ] **Step 2: Implement sorting and conflict marking**

In `src/lib/terminUebersicht.ts`, add before the final export:

```ts
function markiereKonflikte(zeilen: TerminZeile[]): TerminZeile[] {
  const zeilenProPersonUndDatum = new Map<string, TerminZeile[]>()
  for (const zeile of zeilen) {
    const relevantePersonen = new Set([
      ...(zeile.unterrichtsStunden > 0 ? zeile.begleitpersonIds : []),
      ...(zeile.koordinationsStunden > 0 ? zeile.koordinatorIds : []),
    ])
    for (const personId of relevantePersonen) {
      const schluessel = `${zeile.isoDatum}__${personId}`
      const liste = zeilenProPersonUndDatum.get(schluessel) ?? []
      liste.push(zeile)
      zeilenProPersonUndDatum.set(schluessel, liste)
    }
  }

  const konfliktZeilenIds = new Set<string>()
  for (const liste of zeilenProPersonUndDatum.values()) {
    const eindeutigeIds = new Set(liste.map((z) => z.id))
    if (eindeutigeIds.size < 2) continue
    for (const id of eindeutigeIds) konfliktZeilenIds.add(id)
  }

  return zeilen.map((z) => (konfliktZeilenIds.has(z.id) ? { ...z, hatKonflikt: true } : z))
}

function sortiereChronologisch(zeilen: TerminZeile[]): TerminZeile[] {
  return [...zeilen].sort((a, b) => {
    if (a.isoDatum !== b.isoDatum) return a.isoDatum.localeCompare(b.isoDatum)
    if (a.schulName !== b.schulName) return a.schulName.localeCompare(b.schulName)
    return a.titel.localeCompare(b.titel)
  })
}
```

Replace the final export with:

```ts
export function berechneTerminUebersicht(data: Datenbestand): TerminZeile[] {
  const zeilen = [...baueSchulZeilen(data), ...baueVeranstaltungsZeilen(data)]
  return sortiereChronologisch(markiereKonflikte(zeilen))
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/lib/terminUebersicht.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 4: Commit**

```bash
git add src/lib/terminUebersicht.ts src/lib/terminUebersicht.test.ts
git commit -m "feat: sort Termin-Uebersicht rows and flag same-day Konflikte"
```

---

### Task 4: Komponenten-Grundgerüst (`TerminUebersicht.tsx`)

**Files:**
- Create: `src/components/TerminUebersicht.tsx`
- Create: `src/components/TerminUebersicht.css`
- Test: `src/components/TerminUebersicht.test.tsx`

**Interfaces:**
- Consumes: `TerminZeile` from `../lib/terminUebersicht`; `Person` from `../lib/types`.
- Produces: `export function TerminUebersicht({ zeilen, personen }: { zeilen: TerminZeile[]; personen: Person[] }): JSX.Element` — consumed by Task 5 (adds filters), Task 6 (adds Konflikt styling), and Task 7 (`App.tsx`).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TerminUebersicht } from './TerminUebersicht'
import type { Person } from '../lib/types'
import type { TerminZeile } from '../lib/terminUebersicht'

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
]

function zeile(overrides: Partial<TerminZeile> = {}): TerminZeile {
  return {
    id: 'z1',
    isoDatum: '2026-11-09',
    datumOderKw: '2026-11-09',
    wochenKey: '2026-KW46',
    quelle: 'schule',
    titel: 'Reihe X',
    schulId: 's1',
    schulName: 'Schule Eins',
    thema: undefined,
    terminstatus: 'festgelegt',
    unterrichtsStunden: 2,
    koordinationsStunden: 0,
    begleitpersonIds: [],
    begleitpersonNamen: [],
    koordinatorIds: [],
    koordinatorNamen: [],
    hatKonflikt: false,
    ...overrides,
  }
}

describe('TerminUebersicht', () => {
  it('shows the number of Termine in the collapsed summary', () => {
    render(<TerminUebersicht zeilen={[zeile({ id: 'z1' }), zeile({ id: 'z2' })]} personen={personen} />)
    expect(screen.getByText('Terminliste anzeigen (2 Termine)')).toBeInTheDocument()
  })

  it('renders one table row per Zeile with its key facts', () => {
    render(
      <TerminUebersicht
        zeilen={[zeile({ schulName: 'Schule Eins', titel: 'Reihe X', thema: 'Energie', unterrichtsStunden: 2, koordinationsStunden: 0.5 })]}
        personen={personen}
      />
    )
    expect(screen.getByText('Schule Eins')).toBeInTheDocument()
    expect(screen.getByText('Reihe X')).toBeInTheDocument()
    expect(screen.getByText('Energie')).toBeInTheDocument()
  })

  it('shows a placeholder message when there are no Zeilen', () => {
    render(<TerminUebersicht zeilen={[]} personen={personen} />)
    expect(screen.getByText('Terminliste anzeigen (0 Termine)')).toBeInTheDocument()
    expect(screen.getByText('Keine Termine für die aktuelle Filterauswahl.')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/components/TerminUebersicht.test.tsx`
Expected: FAIL — `Cannot find module './TerminUebersicht'`

- [ ] **Step 2: Implement the component skeleton**

Create `src/components/TerminUebersicht.css`:

```css
.termin-uebersicht {
  margin-top: var(--spacing-sm);
}

.termin-uebersicht > summary {
  cursor: pointer;
  font-weight: 600;
}

.termin-uebersicht-inhalt {
  margin-top: var(--spacing-sm);
}

.termin-uebersicht table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--spacing-sm);
}

.termin-uebersicht th,
.termin-uebersicht td {
  text-align: left;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid #eee;
  font-size: 0.9rem;
}
```

Create `src/components/TerminUebersicht.tsx`:

```tsx
import { formatDatumOderKw } from '../lib/kalenderwochen'
import type { Person, Terminstatus } from '../lib/types'
import type { TerminZeile } from '../lib/terminUebersicht'
import './TerminUebersicht.css'

const STATUS_LABEL: Record<Terminstatus, string> = {
  festgelegt: 'Festgelegt',
  teilweise_festgelegt: 'Teilweise festgelegt',
  offen: 'Offen',
}

export function TerminUebersicht({
  zeilen,
  personen,
}: {
  zeilen: TerminZeile[]
  personen: Person[]
}) {
  const gefiltert = zeilen

  return (
    <details className="termin-uebersicht">
      <summary>Terminliste anzeigen ({zeilen.length} Termine)</summary>
      <div className="termin-uebersicht-inhalt">
        {gefiltert.length === 0 ? (
          <p>Keine Termine für die aktuelle Filterauswahl.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Schule</th>
                <th>Titel</th>
                <th>Thema</th>
                <th>Std. Unterricht</th>
                <th>Std. Koordination</th>
                <th>Begleitpersonen</th>
                <th>Koordinatoren</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((z) => (
                <tr key={z.id}>
                  <td>{formatDatumOderKw(z.datumOderKw)}</td>
                  <td>{z.schulName}</td>
                  <td>{z.titel}</td>
                  <td>{z.thema ?? '—'}</td>
                  <td>{Math.round(z.unterrichtsStunden * 10) / 10}</td>
                  <td>{Math.round(z.koordinationsStunden * 10) / 10}</td>
                  <td>{z.begleitpersonNamen.length > 0 ? z.begleitpersonNamen.join(', ') : '—'}</td>
                  <td>{z.koordinatorNamen.length > 0 ? z.koordinatorNamen.join(', ') : '—'}</td>
                  <td>{STATUS_LABEL[z.terminstatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  )
}
```

`personen` is unused so far — it becomes load-bearing in Task 5 (Person filter). Leaving the parameter in place now avoids reshaping the public signature again in the next task.

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/components/TerminUebersicht.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add src/components/TerminUebersicht.tsx src/components/TerminUebersicht.css src/components/TerminUebersicht.test.tsx
git commit -m "feat: add TerminUebersicht table skeleton"
```

---

### Task 5: Filter (Person, Schule/Veranstaltung, Terminstatus, Zeitraum)

**Files:**
- Modify: `src/components/TerminUebersicht.tsx`
- Test: `src/components/TerminUebersicht.test.tsx`

**Interfaces:**
- Consumes: `PersonenMehrfachauswahl` from `./PersonenMehrfachauswahl` (existing component: `{ personen: Person[]; ausgewaehlt: string[]; onChange: (ids: string[]) => void; label: string }`).
- Produces: no change to the component's external props; internal filter state only.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/TerminUebersicht.test.tsx` (add `fireEvent` to the existing `@testing-library/react` import):

```tsx
  it('filters rows by Person', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', schulName: 'Schule A', begleitpersonIds: ['p1'], begleitpersonNamen: ['Anna'] }),
          zeile({ id: 'z2', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.click(screen.getByLabelText('Person filtern: Anna'))
    expect(screen.getByText('Schule A')).toBeInTheDocument()
    expect(screen.queryByText('Schule B')).not.toBeInTheDocument()
  })

  it('filters rows by Schule/Veranstaltung (Titel)', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', titel: 'Reihe X', schulName: 'Schule A' }),
          zeile({ id: 'z2', titel: 'Reihe Y', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.click(screen.getByLabelText('Ort filtern: Reihe X'))
    expect(screen.getByText('Schule A')).toBeInTheDocument()
    expect(screen.queryByText('Schule B')).not.toBeInTheDocument()
  })

  it('filters rows by Terminstatus', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', terminstatus: 'festgelegt', schulName: 'Schule A' }),
          zeile({ id: 'z2', terminstatus: 'offen', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.click(screen.getByLabelText('Terminstatus filtern: Festgelegt'))
    expect(screen.queryByText('Schule A')).not.toBeInTheDocument()
    expect(screen.getByText('Schule B')).toBeInTheDocument()
  })

  it('filters rows by Zeitraum (bis)', () => {
    render(
      <TerminUebersicht
        zeilen={[
          zeile({ id: 'z1', isoDatum: '2026-11-01', datumOderKw: '2026-11-01', schulName: 'Schule A' }),
          zeile({ id: 'z2', isoDatum: '2026-12-01', datumOderKw: '2026-12-01', schulName: 'Schule B' }),
        ]}
        personen={personen}
      />
    )
    fireEvent.change(screen.getByLabelText('Zeitraum bis'), { target: { value: '2026-11-15' } })
    expect(screen.getByText('Schule A')).toBeInTheDocument()
    expect(screen.queryByText('Schule B')).not.toBeInTheDocument()
  })
```

Run: `npx vitest run src/components/TerminUebersicht.test.tsx`
Expected: FAIL — no filter controls exist yet (`getByLabelText` throws)

- [ ] **Step 2: Implement filter state and controls**

Replace the body of `src/components/TerminUebersicht.tsx` with:

```tsx
import { useState } from 'react'
import { formatDatumOderKw } from '../lib/kalenderwochen'
import { PersonenMehrfachauswahl } from './PersonenMehrfachauswahl'
import type { Person, Terminstatus } from '../lib/types'
import type { TerminZeile } from '../lib/terminUebersicht'
import './TerminUebersicht.css'

const STATUS_LABEL: Record<Terminstatus, string> = {
  festgelegt: 'Festgelegt',
  teilweise_festgelegt: 'Teilweise festgelegt',
  offen: 'Offen',
}
const STATUS_WERTE: Terminstatus[] = ['festgelegt', 'teilweise_festgelegt', 'offen']

export function TerminUebersicht({
  zeilen,
  personen,
}: {
  zeilen: TerminZeile[]
  personen: Person[]
}) {
  const [personFilter, setPersonFilter] = useState<string[]>([])
  const [ortFilter, setOrtFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<Terminstatus[]>(STATUS_WERTE)
  const [vonDatum, setVonDatum] = useState('')
  const [bisDatum, setBisDatum] = useState('')

  const orte = [...new Set(zeilen.map((z) => z.titel))].sort((a, b) => a.localeCompare(b))

  function toggleOrt(ort: string, checked: boolean) {
    setOrtFilter((prev) => (checked ? [...prev, ort] : prev.filter((o) => o !== ort)))
  }

  function toggleStatus(status: Terminstatus, checked: boolean) {
    setStatusFilter((prev) => (checked ? [...prev, status] : prev.filter((s) => s !== status)))
  }

  const gefiltert = zeilen.filter((z) => {
    if (personFilter.length > 0 && !personFilter.some((id) => z.begleitpersonIds.includes(id) || z.koordinatorIds.includes(id))) return false
    if (ortFilter.length > 0 && !ortFilter.includes(z.titel)) return false
    if (!statusFilter.includes(z.terminstatus)) return false
    if (vonDatum && z.isoDatum < vonDatum) return false
    if (bisDatum && z.isoDatum > bisDatum) return false
    return true
  })

  return (
    <details className="termin-uebersicht">
      <summary>Terminliste anzeigen ({zeilen.length} Termine)</summary>
      <div className="termin-uebersicht-inhalt">
        <div className="termin-uebersicht-filter">
          <PersonenMehrfachauswahl personen={personen} ausgewaehlt={personFilter} onChange={setPersonFilter} label="Person filtern" />
          <fieldset>
            <legend>Schule/Veranstaltung</legend>
            {orte.map((ort) => (
              <label key={ort}>
                <input
                  type="checkbox"
                  aria-label={`Ort filtern: ${ort}`}
                  checked={ortFilter.includes(ort)}
                  onChange={(ev) => toggleOrt(ort, ev.target.checked)}
                />
                {ort}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Terminstatus</legend>
            {STATUS_WERTE.map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  aria-label={`Terminstatus filtern: ${STATUS_LABEL[status]}`}
                  checked={statusFilter.includes(status)}
                  onChange={(ev) => toggleStatus(status, ev.target.checked)}
                />
                {STATUS_LABEL[status]}
              </label>
            ))}
          </fieldset>
          <label>
            Von: <input type="date" aria-label="Zeitraum von" value={vonDatum} onChange={(ev) => setVonDatum(ev.target.value)} />
          </label>
          <label>
            Bis: <input type="date" aria-label="Zeitraum bis" value={bisDatum} onChange={(ev) => setBisDatum(ev.target.value)} />
          </label>
        </div>
        {gefiltert.length === 0 ? (
          <p>Keine Termine für die aktuelle Filterauswahl.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Schule</th>
                <th>Titel</th>
                <th>Thema</th>
                <th>Std. Unterricht</th>
                <th>Std. Koordination</th>
                <th>Begleitpersonen</th>
                <th>Koordinatoren</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {gefiltert.map((z) => (
                <tr key={z.id}>
                  <td>{formatDatumOderKw(z.datumOderKw)}</td>
                  <td>{z.schulName}</td>
                  <td>{z.titel}</td>
                  <td>{z.thema ?? '—'}</td>
                  <td>{Math.round(z.unterrichtsStunden * 10) / 10}</td>
                  <td>{Math.round(z.koordinationsStunden * 10) / 10}</td>
                  <td>{z.begleitpersonNamen.length > 0 ? z.begleitpersonNamen.join(', ') : '—'}</td>
                  <td>{z.koordinatorNamen.length > 0 ? z.koordinatorNamen.join(', ') : '—'}</td>
                  <td>{STATUS_LABEL[z.terminstatus]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  )
}
```

Add to `src/components/TerminUebersicht.css`:

```css
.termin-uebersicht-filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
  align-items: flex-start;
}

.termin-uebersicht-filter fieldset {
  border: 1px solid #ddd;
  border-radius: 0.35rem;
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/components/TerminUebersicht.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 4: Commit**

```bash
git add src/components/TerminUebersicht.tsx src/components/TerminUebersicht.css src/components/TerminUebersicht.test.tsx
git commit -m "feat: add filters to TerminUebersicht"
```

---

### Task 6: Konflikt-Markierung in der UI

**Files:**
- Modify: `src/components/TerminUebersicht.tsx`
- Modify: `src/components/TerminUebersicht.css`
- Test: `src/components/TerminUebersicht.test.tsx`

**Interfaces:**
- Consumes: `TerminZeile.hatKonflikt` (already computed by `berechneTerminUebersicht`, Task 3).
- Produces: no prop/type changes — purely visual.

- [ ] **Step 1: Write the failing tests**

Add to `src/components/TerminUebersicht.test.tsx`:

```tsx
  it('shows a Konflikt indicator for rows with hatKonflikt', () => {
    render(<TerminUebersicht zeilen={[zeile({ id: 'z1', hatKonflikt: true })]} personen={personen} />)
    expect(screen.getByTitle(/Terminkonflikt/)).toBeInTheDocument()
  })

  it('does not show a Konflikt indicator for conflict-free rows', () => {
    render(<TerminUebersicht zeilen={[zeile({ id: 'z1', hatKonflikt: false })]} personen={personen} />)
    expect(screen.queryByTitle(/Terminkonflikt/)).not.toBeInTheDocument()
  })

  it('includes the Konflikt count in the collapsed summary when Konflikte exist', () => {
    render(<TerminUebersicht zeilen={[zeile({ id: 'z1', hatKonflikt: true }), zeile({ id: 'z2', hatKonflikt: false })]} personen={personen} />)
    expect(screen.getByText('Terminliste anzeigen (2 Termine, 1 Konflikte)')).toBeInTheDocument()
  })
```

Run: `npx vitest run src/components/TerminUebersicht.test.tsx`
Expected: FAIL — no `title` attribute containing "Terminkonflikt" exists; summary text has no Konflikt count

- [ ] **Step 2: Add Konflikt styling and summary count**

In `src/components/TerminUebersicht.tsx`, replace the `<summary>` line with:

```tsx
      <summary>
        Terminliste anzeigen ({zeilen.length} Termine
        {anzahlKonflikte > 0 ? `, ${anzahlKonflikte} Konflikte` : ''})
      </summary>
```

Add above the `return` statement (after `gefiltert` is computed):

```tsx
  const anzahlKonflikte = zeilen.filter((z) => z.hatKonflikt).length
```

Replace the table row rendering with:

```tsx
                <tr key={z.id} className={z.hatKonflikt ? 'termin-zeile-konflikt' : undefined}>
                  <td>
                    {formatDatumOderKw(z.datumOderKw)}
                    {z.hatKonflikt && (
                      <span className="termin-konflikt-symbol" title="Terminkonflikt: mindestens eine beteiligte Person ist an diesem Tag mehrfach eingeplant">
                        {' '}⚠
                      </span>
                    )}
                  </td>
```

Add to `src/components/TerminUebersicht.css`:

```css
.termin-zeile-konflikt {
  background: #fff3e0;
}

.termin-konflikt-symbol {
  cursor: help;
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/components/TerminUebersicht.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 4: Commit**

```bash
git add src/components/TerminUebersicht.tsx src/components/TerminUebersicht.css src/components/TerminUebersicht.test.tsx
git commit -m "feat: highlight same-day Terminkonflikte in TerminUebersicht"
```

---

### Task 7: Integration in `useAppData.ts` und `App.tsx`

**Files:**
- Modify: `src/state/useAppData.ts`
- Modify: `src/App.tsx`
- Test: `src/state/useAppData.test.ts` (add one assertion; existing file)

**Interfaces:**
- Consumes: `berechneTerminUebersicht` (Task 3), `TerminUebersicht` component (Task 6).
- Produces: `useAppData()` return value gains `terminUebersichtZeilen: TerminZeile[]`.

- [ ] **Step 1: Write the failing test**

Check the existing shape of `src/state/useAppData.test.ts` first:

```bash
sed -n '1,40p' src/state/useAppData.test.ts
```

Add a test to that file following its existing pattern (same `renderHook`/`act` setup already present in the file) asserting the new field exists once data is loaded:

```ts
  it('exposes terminUebersichtZeilen once the Datenbestand is loaded', async () => {
    const { result } = renderHook(() => useAppData())
    await waitFor(() => expect(result.current.ladePhase).toBe('bereit'))
    expect(Array.isArray(result.current.terminUebersichtZeilen)).toBe(true)
  })
```

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `result.current.terminUebersichtZeilen` is `undefined`

- [ ] **Step 2: Wire up the hook**

In `src/state/useAppData.ts`, add the import next to the other `lib` imports:

```ts
import { berechneTerminUebersicht } from '../lib/terminUebersicht'
```

Add next to the other `useMemo` derivations (near `themenGanttZeilen`):

```ts
  const terminUebersichtZeilen = useMemo(() => berechneTerminUebersicht(data), [data])
```

Add `terminUebersichtZeilen,` to the returned object, next to `themenGanttZeilen,`.

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS

- [ ] **Step 4: Render the card in `App.tsx`**

In `src/App.tsx`, add `TerminUebersicht` to the imports:

```ts
import { TerminUebersicht } from './components/TerminUebersicht'
```

Add `terminUebersichtZeilen` to the destructured values from `useAppData()`, next to `themenGanttZeilen`.

Add a new card directly after the `ThemenUebersicht` card and before `<h2>Schulen</h2>`:

```tsx
          <div className="card">
            <TerminUebersicht zeilen={terminUebersichtZeilen} personen={data.personen} />
          </div>
```

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors

- [ ] **Step 7: Manual smoke test in the browser**

Run: `npm run dev` (leave running), then open the printed local URL.
Verify: a new "Terminliste anzeigen (N Termine…)" line appears between the Themen-Übersicht Gantt chart and the "Schulen" heading; clicking it expands the filterable table; the page's default (collapsed) height is otherwise unchanged. Stop the dev server afterward.

- [ ] **Step 8: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts src/App.tsx
git commit -m "feat: wire TerminUebersicht into the app"
```

---

## Self-Review Notes

- **Spec coverage:** Datenmodell (Tasks 1–3), Komponente inkl. Filter und Konflikt-Hervorhebung (Tasks 4–6), Integration als eingeklappte Karte zwischen Themen-Gantt und Schulen (Task 7), Tests für Lib und Komponente (every task) — all spec sections have a corresponding task.
- **Placeholder scan:** none found — every step has literal code and exact run commands.
- **Type consistency:** `TerminZeile` fields are identical across Tasks 1, 2, 3 and consumed as-is in Tasks 4–7; `berechneTerminUebersicht` signature (`(data: Datenbestand) => TerminZeile[]`) is unchanged from Task 1 through Task 7; `TerminUebersicht` props (`{ zeilen, personen }`) are unchanged from Task 4 through Task 7.
