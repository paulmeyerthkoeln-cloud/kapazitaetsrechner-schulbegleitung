# Veranstaltungen (Themenwoche/Exkursion), Mehrfachbesetzung, Stunden-Bugfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Themenwoche and Exkursion into a real cross-school `Veranstaltung` entity, let Kurse and Veranstaltungen each have multiple named Begleitpersonen/Koordinatoren instead of one, and fix the bug where a person's own capacity ledger silently drops their Vorbereitung/Fahrzeit hours.

**Architecture:** `Datenbestand` gains a `veranstaltungen: Veranstaltung[]` list alongside `schulen`. A `Veranstaltung` (`art: 'themenwoche' | 'exkursion'`) has its own shared `termine`, each with one `SchulBesetzung` per participating school (own Begleitpersonen/Koordinatoren/Fahrzeit/Koordination). Normal Kurs-`Einheit` gets `begleitperson_ids`/`koordinator_ids` arrays instead of a single id. `berechneBedarfProWoche` and `berechnePersonenKapazitaet` both grow a second loop over `veranstaltungen`, and the personal-capacity function now charges each named person the full individual cost of their assignment (Vorbereitung + Fahrzeit included) instead of only Kontaktzeit/Koordination.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, date-fns. No new dependencies — multi-select UI is a `<details>`/checkbox disclosure built from scratch.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-07-10-veranstaltungen-mehrfachbesetzung-design.md`. Follow its exact type/function shapes; this plan's code blocks are the authoritative, ready-to-paste version of that spec.
- Every task must leave `npm test` runnable (even if some later-fixed files still fail until their own task lands — don't let a task leave the repo in a state where it won't even compile far enough to run vitest, since vitest transpiles per-file and doesn't require the whole program to typecheck first). Run `npx tsc --noEmit` only becomes meaningful project-wide at Task 14; earlier tasks verify via `npx vitest run <specific file>`.
- No new npm dependencies.
- German identifiers/labels throughout, matching existing code (`Begleitpersonen`, `Koordinatoren`, `Themenwoche`, etc.) — copy the exact strings shown in each step, they are asserted on verbatim in tests.
- Commit after each task (not after each step) unless a step says otherwise.

---

## Task 1: Datenmodell (`src/lib/types.ts`)

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `Veranstaltung`, `VeranstaltungArt`, `VeranstaltungTermin`, `SchulBesetzung` types; `Einheit.begleitperson_ids: string[]`, `Einheit.koordinator_ids: string[]`; `Datenbestand.veranstaltungen: Veranstaltung[]`. Every later task imports these names exactly as spelled here.

This task has no test of its own (types have no runtime behavior) — it intentionally leaves every other file's typecheck broken until Tasks 2–13 catch up. That's expected; do not attempt to fix other files here.

- [ ] **Step 1: Replace the whole file content**

Replace the entire contents of `src/lib/types.ts` with:

```ts
export interface Settings {
  planungszeitraum: { start: string; ende: string }
  schwellwert_warnung: number
  schwellwert_kritisch: number
  default_fahrzeit_h: number
  default_vorbereitungsfaktor_erstdurchfuehrung: number
  default_vorbereitungsfaktor_wiederholung: number
}

export interface Abwesenheit {
  von: string
  bis: string
  grund: string
}

export interface Person {
  id: string
  name: string
  stunden_pro_woche_fuer_begleitung: number
  aktiv_ab: string
  aktiv_bis: string
  abwesenheiten: Abwesenheit[]
  urlaub: FerienZeitraum[]
  szenario_optional?: boolean
}

export interface FerienZeitraum {
  name: string
  von: string
  bis: string
}

export interface Sperrzeit {
  name: string
  von: string
  bis: string
}

export interface Kalender {
  ferien: FerienZeitraum[]
}

export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'

export interface Einheit {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  erstdurchfuehrung: boolean
  wir_begleiten: boolean
  thema?: Thema
  koordinationszeit_h?: number
  begleitperson_ids: string[]
  koordinator_ids: string[]
}

export interface Muster {
  typ: 'woechentlich'
  von: string
  bis?: string
  anzahl_termine?: number
  kontaktzeit_h: number
}

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
  sperrzeiten?: Sperrzeit[]
}

export interface Schule {
  id: string
  name: string
  reihen: Reihe[]
}

export type VeranstaltungArt = 'themenwoche' | 'exkursion'

export interface SchulBesetzung {
  schulId: string
  wir_begleiten: boolean
  begleitperson_ids: string[]
  koordinator_ids: string[]
  koordinationszeit_h: number
  fahrzeit_h: number
}

export interface VeranstaltungTermin {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  erstdurchfuehrung: boolean
  thema?: Thema
  organisationspauschale_h?: number
  besetzungen: SchulBesetzung[]
}

export interface Veranstaltung {
  id: string
  art: VeranstaltungArt
  titel: string
  terminstatus: Terminstatus
  schulIds: string[]
  termine: VeranstaltungTermin[]
}

export interface PersonenUmverteilung {
  id: string
  personId: string
  quelleWochenKey: string
  zielWochenKey: string
  stunden: number
}

export interface Datenbestand {
  settings: Settings
  personen: Person[]
  kalender: Kalender
  schulen: Schule[]
  veranstaltungen: Veranstaltung[]
  personenUmverteilungen?: PersonenUmverteilung[]
}
```

Removed compared to before: `Schule.koordination_h_pro_monat`, `Settings.koordination_h_pro_schule_pro_monat`, `Einheit.typ`/`organisationspauschale_h`/`themenwoche`/`personen_parallel`/`begleitperson_id`, the `EinheitTyp` type, and `'Exkursion'` from `Thema`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "refactor(berechnungstool): introduce Veranstaltung type, multi-person Einheit fields"
```

---

## Task 2: Berechnungslogik (`src/lib/berechnung.ts`)

**Files:**
- Modify: `src/lib/berechnung.ts`
- Modify: `src/lib/berechnung.test.ts`
- Modify: `src/lib/besetzung.test.ts` (fixture-only, see Step 4)

**Interfaces:**
- Consumes: `Veranstaltung`, `SchulBesetzung`, `VeranstaltungTermin`, `Einheit`, `Datenbestand`, `Settings` from Task 1.
- Produces: `berechneAufwandEinheit(kontaktzeit_h, fahrzeit_h, erstdurchfuehrung, settings, organisationspauschale_h = 0): number` (new signature — no more `einheit`/`personen_parallel`/`vorbereitungBereitsGezaehlt` params). `berechneBedarfProWoche` unchanged signature, new internals. `berechneKoordinationWoche` deleted.

- [ ] **Step 1: Update `berechneAufwandEinheit` and `berechneBedarfProWoche`, delete `berechneKoordinationWoche`**

In `src/lib/berechnung.ts`, replace the top of the file (imports through `berechneBedarfProWoche`) with:

```ts
import { eachDayOfInterval, isWeekend, endOfISOWeek, parseISO } from 'date-fns'
import {
  parseZuWochenKey,
  alleWochenImZeitraum,
  istWocheInFerien,
  getISOWochenKey,
  ermittleFerienName,
} from './kalenderwochen'
import type { Settings, Datenbestand, Person } from './types'

export function berechneAufwandEinheit(
  kontaktzeit_h: number,
  fahrzeit_h: number,
  erstdurchfuehrung: boolean,
  settings: Settings,
  organisationspauschale_h = 0
): number {
  const vorbereitungsfaktor = erstdurchfuehrung
    ? settings.default_vorbereitungsfaktor_erstdurchfuehrung
    : settings.default_vorbereitungsfaktor_wiederholung
  const vorbereitung = kontaktzeit_h * vorbereitungsfaktor
  return kontaktzeit_h + vorbereitung + fahrzeit_h + organisationspauschale_h
}

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
        const koordAnzahl = Math.max(1, einheit.koordinator_ids.length)
        koordinationBedarf += (einheit.koordinationszeit_h ?? 0) * koordAnzahl
        if (einheit.wir_begleiten) {
          const begleitAnzahl = Math.max(1, einheit.begleitperson_ids.length)
          const aufwand = berechneAufwandEinheit(einheit.kontaktzeit_h, reihe.fahrzeit_h, einheit.erstdurchfuehrung, data.settings)
          einsatzBedarf += aufwand * begleitAnzahl
        }
      }
    }
  }

  for (const veranstaltung of data.veranstaltungen) {
    if (veranstaltung.terminstatus === 'offen') continue
    for (const termin of veranstaltung.termine) {
      if (parseZuWochenKey(termin.datum_oder_kw) !== wochenKey) continue
      // Vorbereitung and (for Exkursionen) the Organisationspauschale are organizational
      // overhead shared once across the whole Veranstaltung, regardless of how many
      // schools/people attend — this is the entire point of a Themenwoche.
      const vorbereitungsfaktor = termin.erstdurchfuehrung
        ? data.settings.default_vorbereitungsfaktor_erstdurchfuehrung
        : data.settings.default_vorbereitungsfaktor_wiederholung
      const pauschale = veranstaltung.art === 'exkursion' ? termin.organisationspauschale_h ?? 2 : 0
      einsatzBedarf += termin.kontaktzeit_h * vorbereitungsfaktor + pauschale
      for (const besetzung of termin.besetzungen) {
        const koordAnzahl = Math.max(1, besetzung.koordinator_ids.length)
        koordinationBedarf += besetzung.koordinationszeit_h * koordAnzahl
        if (besetzung.wir_begleiten) {
          const begleitAnzahl = Math.max(1, besetzung.begleitperson_ids.length)
          einsatzBedarf += (termin.kontaktzeit_h + besetzung.fahrzeit_h) * begleitAnzahl
        }
      }
    }
  }

  return { einsatzBedarf, koordinationBedarf }
}
```

Leave everything from `berechnePersonKapazitaetsbasis` down to the end of the file (`berechneAngebotProWoche`, `ampelFarbe`, `WochenErgebnis`, `berechneWochenuebersicht`, `Machbarkeitsergebnis`, `berechneMachbarkeit`) exactly as it is — none of it references the removed fields.

- [ ] **Step 2: Rewrite `src/lib/berechnung.test.ts`**

Replace the file's `import` line and the `settings` fixture (lines 1–14) with:

```ts
import { describe, it, expect } from 'vitest'
import { berechneAufwandEinheit, berechneBedarfProWoche, berechneAngebotProWoche } from './berechnung'
import { ampelFarbe, berechneWochenuebersicht, berechneMachbarkeit } from './berechnung'
import type { Einheit, Settings, Datenbestand, Person, Veranstaltung } from './types'

const settings: Settings = {
  planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
}

function einheit(overrides: Partial<Einheit> = {}): Einheit {
  return {
    id: 'e1',
    index: 1,
    datum_oder_kw: '2026-KW46',
    kontaktzeit_h: 4,
    erstdurchfuehrung: true,
    wir_begleiten: true,
    begleitperson_ids: [],
    koordinator_ids: [],
    ...overrides,
  }
}
```

Replace the whole `describe('berechneAufwandEinheit', ...)` block with:

```ts
describe('berechneAufwandEinheit', () => {
  it('matches the WDG hand-calculation from spec section 9 (8.0h)', () => {
    expect(berechneAufwandEinheit(4, 1.0, true, settings)).toBeCloseTo(8.0, 5)
  })

  it('matches the Sedanstraße hand-calculation from spec section 9 (2.375h)', () => {
    expect(berechneAufwandEinheit(1.5, 0.5, false, settings)).toBeCloseTo(2.375, 5)
  })

  it('adds the Organisationspauschale when given', () => {
    expect(berechneAufwandEinheit(4, 0, false, settings, 2)).toBeCloseTo(4 + 4 * 0.25 + 2, 5)
  })
})
```

Delete the whole `describe('berechneKoordinationWoche', ...)` block entirely (function no longer exists).

In the `describe('berechneBedarfProWoche', ...)` block, every `Schule` fixture literal drops its `koordination_h_pro_monat` line (e.g. `koordination_h_pro_monat: 99,` on the `'s1'`/`'Schule 1'` fixture in the first test, and `koordination_h_pro_monat: 0.5,` on the two `'huegelstrasse'`/`'Hügelstraße'` fixtures) — just delete those lines, the tests' other assertions (`koordinationBedarf` values) are unaffected since that field was already dead (never read by `berechneKoordinationWoche`'s caller, because there wasn't one). Every `Datenbestand` literal in this describe block also gains `veranstaltungen: []`.

Add `personen_parallel: 1` → delete; `typ: 'regulaer'` → delete. Since this describe block's `einheit(...)` calls already go through the updated helper from Step 2 above (no `typ`/`personen_parallel` params), no further per-call changes are needed here — the helper absorbs it.

Replace the two `Datenbestand` literals in the 'excludes a Schule's coordination...' and 'still charges coordination for a Modell-X Schule...' tests: remove `koordination_h_pro_monat: 0.5,` from their `huegelstrasse` Schule fixture, add `veranstaltungen: []` to the `Datenbestand` literal.

Do the same for every remaining `Datenbestand` literal in the file (`'returns 0 for a Ferienwoche...'`, both tests in `'Reihe.terminstatus filtering'`): add `veranstaltungen: []`.

Add a new test to the `describe('berechneBedarfProWoche', ...)` block, replacing the deleted "doubles the total for personen_parallel: 2" unit test (that behavior moved from `berechneAufwandEinheit` to this function, driven by `begleitperson_ids.length`):

```ts
  it('multiplies einsatzBedarf by the number of assigned Begleitpersonen on a Reihen-Einheit', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      veranstaltungen: [],
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [einheit({ begleitperson_ids: ['p1', 'p2'] })],
            },
          ],
        },
      ],
    }
    const einzeln = berechneAufwandEinheit(4, 1, true, settings)
    expect(berechneBedarfProWoche(data, '2026-KW46', false).einsatzBedarf).toBeCloseTo(einzeln * 2, 5)
  })

  it('multiplies koordinationBedarf by the number of assigned Koordinatoren on a Reihen-Einheit', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      veranstaltungen: [],
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'A',
              fahrzeit_h: 1,
              status: 'zugesagt',
              extern_betreut: false,
              terminstatus: 'festgelegt',
              einheiten: [einheit({ wir_begleiten: false, koordinationszeit_h: 2, koordinator_ids: ['p1', 'p2'] })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false).koordinationBedarf).toBe(4)
  })
})
```

(Note the closing `})` above ends the `describe('berechneBedarfProWoche', ...)` block — make sure not to duplicate it.)

Delete the whole `describe('Themenwoche shared Vorbereitungszeit', ...)` block (lines using `.themenwoche`, `schuleMitThemenwocheEinheit` — that mechanism is gone) and replace it with:

```ts
describe('berechneBedarfProWoche with Veranstaltungen', () => {
  function veranstaltung(overrides: Partial<Veranstaltung> = {}): Veranstaltung {
    return {
      id: 'v1',
      art: 'themenwoche',
      titel: 'Testwoche',
      terminstatus: 'festgelegt',
      schulIds: ['s1', 's2'],
      termine: [
        {
          id: 't1',
          index: 1,
          datum_oder_kw: '2026-KW46',
          kontaktzeit_h: 1.5,
          erstdurchfuehrung: true,
          besetzungen: [
            { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 },
            { schulId: 's2', wir_begleiten: true, begleitperson_ids: ['p2'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 0.5 },
          ],
        },
      ],
      ...overrides,
    }
  }

  function leereDaten(overrides: Partial<Datenbestand> = {}): Datenbestand {
    return { settings, personen: [], kalender: { ferien: [] }, schulen: [], veranstaltungen: [], ...overrides }
  }

  it('charges Vorbereitung exactly once for a Themenwoche, regardless of how many schools participate', () => {
    const data = leereDaten({ veranstaltungen: [veranstaltung()] })
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    const vorbereitung = 1.5 * settings.default_vorbereitungsfaktor_erstdurchfuehrung
    const s1Anteil = 1.5 + 1 // kontaktzeit_h + s1 fahrzeit_h
    const s2Anteil = 1.5 + 0.5 // kontaktzeit_h + s2 fahrzeit_h
    expect(einsatzBedarf).toBeCloseTo(vorbereitung + s1Anteil + s2Anteil, 5)
  })

  it('adds the Organisationspauschale once for an Exkursion, defaulting to 2h', () => {
    const data = leereDaten({ veranstaltungen: [veranstaltung({ art: 'exkursion' })] })
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    const vorbereitung = 1.5 * settings.default_vorbereitungsfaktor_erstdurchfuehrung
    expect(einsatzBedarf).toBeCloseTo(vorbereitung + 2 + (1.5 + 1) + (1.5 + 0.5), 5)
  })

  it('multiplies a Schule-Besetzung´s contribution by its number of Begleitpersonen', () => {
    const v = veranstaltung()
    v.termine[0].besetzungen[0].begleitperson_ids = ['p1', 'p3']
    const data = leereDaten({ veranstaltungen: [v] })
    const { einsatzBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    const vorbereitung = 1.5 * settings.default_vorbereitungsfaktor_erstdurchfuehrung
    const s1Anteil = (1.5 + 1) * 2
    const s2Anteil = 1.5 + 0.5
    expect(einsatzBedarf).toBeCloseTo(vorbereitung + s1Anteil + s2Anteil, 5)
  })

  it('charges Koordination per Schule-Besetzung, independent of wir_begleiten, multiplied by Koordinator count', () => {
    const v = veranstaltung()
    v.termine[0].besetzungen[0].wir_begleiten = false
    v.termine[0].besetzungen[0].koordinationszeit_h = 1
    v.termine[0].besetzungen[0].koordinator_ids = ['k1', 'k2']
    const data = leereDaten({ veranstaltungen: [v] })
    const { koordinationBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    expect(koordinationBedarf).toBe(2)
  })

  it('ignores a Veranstaltung whose Terminstatus is offen', () => {
    const data = leereDaten({ veranstaltungen: [veranstaltung({ terminstatus: 'offen' })] })
    expect(berechneBedarfProWoche(data, '2026-KW46', false)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
  })

  it('ignores a Veranstaltungs-Termin scheduled for a different week', () => {
    const data = leereDaten({ veranstaltungen: [veranstaltung()] })
    expect(berechneBedarfProWoche(data, '2026-KW47', false)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
  })
})
```

- [ ] **Step 3: Run the berechnung tests**

```bash
npx vitest run src/lib/berechnung.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Fix `src/lib/besetzung.test.ts` fixture (no logic change in `besetzung.ts` itself)**

`berechneUnserAnteil`/`ermittleHaeufigsteKontaktzeit` only read `wir_begleiten`/`kontaktzeit_h`, untouched by this refactor — only the local `einheit()` helper needs its fixture updated to satisfy the new `Einheit` type. Replace the helper at the top of `src/lib/besetzung.test.ts`:

```ts
function einheit(index: number): Einheit {
  return {
    id: `e${index}`,
    index,
    datum_oder_kw: '2026-KW40',
    kontaktzeit_h: 1.5,
    erstdurchfuehrung: false,
    wir_begleiten: false,
    begleitperson_ids: [],
    koordinator_ids: [],
  }
}
```

- [ ] **Step 5: Run besetzung tests**

```bash
npx vitest run src/lib/besetzung.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/berechnung.ts src/lib/berechnung.test.ts src/lib/besetzung.test.ts
git commit -m "feat(berechnungstool): compute Bedarf across Kurse and Veranstaltungen with multi-person counts"
```

---

## Task 3: Personen-Kapazität Bugfix (`src/lib/personenKapazitaet.ts`)

**Files:**
- Modify: `src/lib/personenKapazitaet.ts`
- Modify: `src/lib/personenKapazitaet.test.ts`

**Interfaces:**
- Consumes: `berechneAufwandEinheit(kontaktzeit_h, fahrzeit_h, erstdurchfuehrung, settings, organisationspauschale_h)`, `berechnePersonKapazitaetsbasis` from Task 2's `berechnung.ts` (unchanged).
- Produces: `berechnePersonenKapazitaet`/`berechneVerbleibendePersonenstunden` — same public signatures as before, corrected internals.

- [ ] **Step 1: Rewrite `berechneZugewieseneStundenProWoche`**

Replace the whole file content of `src/lib/personenKapazitaet.ts` with:

```ts
import { berechneAufwandEinheit, berechnePersonKapazitaetsbasis } from './berechnung'
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
  const addiere = (wochenKey: string, stunden: number) => {
    zugewiesen.set(wochenKey, (zugewiesen.get(wochenKey) ?? 0) + stunden)
  }

  for (const schule of data.schulen) {
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        const wochenKey = parseZuWochenKey(einheit.datum_oder_kw)
        if (einheit.wir_begleiten && einheit.begleitperson_ids.includes(personId)) {
          addiere(wochenKey, berechneAufwandEinheit(einheit.kontaktzeit_h, reihe.fahrzeit_h, einheit.erstdurchfuehrung, data.settings))
        }
        if (einheit.koordinator_ids.includes(personId)) {
          addiere(wochenKey, einheit.koordinationszeit_h ?? 0)
        }
      }
    }
  }

  for (const veranstaltung of data.veranstaltungen) {
    if (veranstaltung.terminstatus === 'offen') continue
    for (const termin of veranstaltung.termine) {
      const wochenKey = parseZuWochenKey(termin.datum_oder_kw)
      const pauschale = veranstaltung.art === 'exkursion' ? termin.organisationspauschale_h ?? 2 : 0
      for (const besetzung of termin.besetzungen) {
        if (besetzung.wir_begleiten && besetzung.begleitperson_ids.includes(personId)) {
          addiere(wochenKey, berechneAufwandEinheit(termin.kontaktzeit_h, besetzung.fahrzeit_h, termin.erstdurchfuehrung, data.settings, pauschale))
        }
        if (besetzung.koordinator_ids.includes(personId)) {
          addiere(wochenKey, besetzung.koordinationszeit_h)
        }
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

- [ ] **Step 2: Rewrite `src/lib/personenKapazitaet.test.ts`**

Replace the `settings`/`einheit`/`schuleMitEinheit` fixtures (lines 5–69) with:

```ts
const settings: Datenbestand['settings'] = {
  planungszeitraum: { start: '2026-11-02', ende: '2026-11-16' },
  schwellwert_warnung: 0.7,
  schwellwert_kritisch: 0.9,
  default_fahrzeit_h: 1.0,
  default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
  default_vorbereitungsfaktor_wiederholung: 0.25,
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
    datum_oder_kw: '2026-KW46',
    kontaktzeit_h: 3,
    erstdurchfuehrung: false,
    wir_begleiten: true,
    begleitperson_ids: [],
    koordinator_ids: [],
    ...overrides,
  }
}

function datenbestand(overrides: Partial<Datenbestand> = {}): Datenbestand {
  return {
    settings,
    personen: [person()],
    kalender: { ferien: [] },
    schulen: [],
    veranstaltungen: [],
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
```

Replace `'subtracts kontaktzeit_h from verbleibend for the week of an Einheit assigned to that Person'`:

```ts
  it('charges the full Vorbereitung+Fahrzeit+Kontaktzeit for an assigned Begleitperson, not just Kontaktzeit', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    // kontaktzeit_h 3 + Vorbereitung (3 * 0.25 Wiederholungsfaktor) + Fahrzeit 1 (Reihe.fahrzeit_h) = 4.75
    expect(kw46.zugewiesen).toBeCloseTo(4.75, 5)
    expect(kw46.verbleibend).toBeCloseTo(3.25, 5)
    const kw45 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW45')!
    expect(kw45.zugewiesen).toBe(0)
    expect(kw45.verbleibend).toBe(8)
  })
```

Replace `"includes an assigned Einheit's koordinationszeit_h in zugewiesen and verbleibend, alongside kontaktzeit_h"`:

```ts
  it("adds an assigned Koordinator's koordinationszeit_h on top of a Begleitperson's own Kontaktzeit+Vorbereitung+Fahrzeit", () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], koordinator_ids: ['p1'], kontaktzeit_h: 3, koordinationszeit_h: 1, datum_oder_kw: '2026-KW46' })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    // 4.75 (Begleitperson-Anteil, see previous test) + 1 (Koordination) = 5.75
    expect(kw46.zugewiesen).toBeCloseTo(5.75, 5)
    expect(kw46.verbleibend).toBeCloseTo(2.25, 5)
  })

  it("charges only the Koordinationszeit, not Kontaktzeit, for a Person who is a Koordinator but not a Begleitperson", () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: [], koordinator_ids: ['p1'], kontaktzeit_h: 3, koordinationszeit_h: 1, datum_oder_kw: '2026-KW46' })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(1)
  })
```

Update `'ignores Einheiten in Reihen with terminstatus "offen"'`, `'ignores Einheiten assigned to a different Person'`, and `'ignores a stale begleitperson_id on an Einheit where wir_begleiten is false'` to use `begleitperson_ids: ['p1']` / `begleitperson_ids: ['p2']` instead of `begleitperson_id: 'p1'` / `begleitperson_id: 'p2'` (same test intent, just the array field name):

```ts
  it('ignores Einheiten in Reihen with terminstatus "offen"', () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' }, 'offen')],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('ignores Einheiten assigned to a different Person', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p2'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })

  it('ignores stale begleitperson_ids on an Einheit where wir_begleiten is false', () => {
    const data = datenbestand({
      schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], wir_begleiten: false, kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(kw46.zugewiesen).toBe(0)
    expect(kw46.verbleibend).toBe(8)
  })
```

Leave the `PersonenUmverteilung`/`Urlaub` tests and the whole `describe('berechneVerbleibendePersonenstunden', ...)` block as-is, except update the two `schuleMitEinheit({ begleitperson_id: 'p1', ... })` calls inside `berechneVerbleibendePersonenstunden` tests to `begleitperson_ids: ['p1']`, and recompute their expected numbers:

```ts
describe('berechneVerbleibendePersonenstunden', () => {
  it('returns the current verbleibend for that Person and week', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 3, datum_oder_kw: '2026-KW46' })] })
    const ergebnis = berechnePersonenKapazitaet(data)
    expect(berechneVerbleibendePersonenstunden(ergebnis, 'p1', '2026-KW46')).toBeCloseTo(3.25, 5)
  })

  it('floors at 0 when verbleibend is negative', () => {
    const data = datenbestand({ schulen: [schuleMitEinheit({ begleitperson_ids: ['p1'], kontaktzeit_h: 20, datum_oder_kw: '2026-KW46' })] })
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

Update the import line at the top to add `Terminstatus`: `import type { Datenbestand, Einheit, Person, Schule, Terminstatus } from './types'`.

Add a new describe block at the end of the file for Veranstaltungen coverage:

```ts
describe('berechnePersonenKapazitaet with Veranstaltungen', () => {
  function datenMitVeranstaltung(besetzungen: Datenbestand['veranstaltungen'][0]['termine'][0]['besetzungen']): Datenbestand {
    return datenbestand({
      personen: [person({ id: 'p1', name: 'Anna' }), person({ id: 'p2', name: 'Ben' })],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'themenwoche',
          titel: 'Testwoche',
          terminstatus: 'festgelegt',
          schulIds: besetzungen.map((b) => b.schulId),
          termine: [
            { id: 't1', index: 1, datum_oder_kw: '2026-KW46', kontaktzeit_h: 1.5, erstdurchfuehrung: true, besetzungen },
          ],
        },
      ],
    })
  }

  it('charges each Begleitperson at each participating Schule the full individual Vorbereitung — no dedup between people', () => {
    const data = datenMitVeranstaltung([
      { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 },
      { schulId: 's2', wir_begleiten: true, begleitperson_ids: ['p2'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 0.5 },
    ])
    const ergebnis = berechnePersonenKapazitaet(data)
    const anna = ergebnis.find((p) => p.personId === 'p1')!.wochen.find((w) => w.wochenKey === '2026-KW46')!
    const ben = ergebnis.find((p) => p.personId === 'p2')!.wochen.find((w) => w.wochenKey === '2026-KW46')!
    const vorbereitung = 1.5 * settings.default_vorbereitungsfaktor_erstdurchfuehrung
    expect(anna.zugewiesen).toBeCloseTo(1.5 + vorbereitung + 1, 5)
    expect(ben.zugewiesen).toBeCloseTo(1.5 + vorbereitung + 0.5, 5)
  })

  it('adds the Organisationspauschale to an assigned Begleitperson´s charge for an Exkursion', () => {
    const data = datenbestand({
      personen: [person({ id: 'p1' })],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'exkursion',
          titel: 'Testexkursion',
          terminstatus: 'festgelegt',
          schulIds: ['s1'],
          termine: [
            {
              id: 't1',
              index: 1,
              datum_oder_kw: '2026-KW46',
              kontaktzeit_h: 1.5,
              erstdurchfuehrung: true,
              organisationspauschale_h: 2,
              besetzungen: [{ schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 }],
            },
          ],
        },
      ],
    })
    const ergebnis = berechnePersonenKapazitaet(data)
    const kw46 = ergebnis[0].wochen.find((w) => w.wochenKey === '2026-KW46')!
    const vorbereitung = 1.5 * settings.default_vorbereitungsfaktor_erstdurchfuehrung
    expect(kw46.zugewiesen).toBeCloseTo(1.5 + vorbereitung + 1 + 2, 5)
  })

  it('ignores a Veranstaltung with terminstatus offen', () => {
    const data = datenMitVeranstaltung([
      { schulId: 's1', wir_begleiten: true, begleitperson_ids: ['p1'], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 },
    ])
    data.veranstaltungen[0].terminstatus = 'offen'
    const ergebnis = berechnePersonenKapazitaet(data)
    const anna = ergebnis.find((p) => p.personId === 'p1')!.wochen.find((w) => w.wochenKey === '2026-KW46')!
    expect(anna.zugewiesen).toBe(0)
  })
})
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/lib/personenKapazitaet.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/personenKapazitaet.ts src/lib/personenKapazitaet.test.ts
git commit -m "fix(berechnungstool): charge Vorbereitung+Fahrzeit to each assigned person, add Veranstaltungen"
```

---

## Task 4: Themen-Gantt (`src/lib/themenUebersicht.ts`)

**Files:**
- Modify: `src/lib/themenUebersicht.ts`
- Modify: `src/lib/themenUebersicht.test.ts`

**Interfaces:**
- Consumes: `Veranstaltung`, `Datenbestand` from Task 1.
- Produces: `berechneThemenGantt` — same signature, now also emits rows for `Veranstaltung` termine with a `thema` set. `ThemenGanttZeile.reiheId` is reused to hold a Veranstaltung's id for those rows (existing consumers only use it as an opaque grouping key, see `src/components/ThemenUebersicht.tsx`).

- [ ] **Step 1: Widen `sortiereEinheitenNachWoche` to a generic, then extend `berechneThemenGantt`**

In `src/lib/themenUebersicht.ts`, `sortiereEinheitenNachWoche` is currently typed for `Einheit[]` but only reads `.datum_oder_kw` — widen it to a generic so it also accepts `VeranstaltungTermin[]` without any cast:

```ts
function sortiereEinheitenNachWoche<T extends { datum_oder_kw: string }>(einheiten: T[]): T[] {
  return [...einheiten].sort((a, b) => parseZuWochenKey(a.datum_oder_kw).localeCompare(parseZuWochenKey(b.datum_oder_kw)))
}
```

The existing per-Reihe loop in `berechneThemenGantt` is unchanged (Einheiten still carry `thema` the same way, and `Einheit[]` still satisfies the generic). Add a second loop over Veranstaltungen right after the existing `for (const schule of data.schulen) { ... }` block, before the final `return zeilen.sort(...)`:

```ts
  for (const veranstaltung of data.veranstaltungen) {
    if (veranstaltung.terminstatus === 'offen') continue
    const themenTermine = sortiereEinheitenNachWoche(veranstaltung.termine.filter((t) => !!t.thema))
    if (themenTermine.length === 0) continue

    const zeilenLabel = `${veranstaltung.titel} (${veranstaltung.schulIds.map((id) => kuerzeSchulname(data.schulen.find((s) => s.id === id)?.name ?? id)).join(', ')})`

    let aktuelleGruppe: { thema: Thema; startWochenKey: string; endWochenKey: string; stunden: number } | null = null
    for (const termin of themenTermine) {
      const thema = termin.thema!
      const wochenKey = parseZuWochenKey(termin.datum_oder_kw)
      if (
        aktuelleGruppe &&
        aktuelleGruppe.thema === thema &&
        (aktuelleGruppe.endWochenKey === wochenKey || sindDirektAufeinanderfolgendeWochen(aktuelleGruppe.endWochenKey, wochenKey))
      ) {
        aktuelleGruppe.endWochenKey = wochenKey
        aktuelleGruppe.stunden += termin.kontaktzeit_h
        continue
      }
      if (aktuelleGruppe) {
        zeilen.push({
          reiheId: veranstaltung.id,
          zeilenLabel,
          balkenLabel: aktuelleGruppe.thema,
          thema: aktuelleGruppe.thema,
          startWochenKey: aktuelleGruppe.startWochenKey,
          endWochenKey: aktuelleGruppe.endWochenKey,
          stunden: aktuelleGruppe.stunden,
        })
      }
      aktuelleGruppe = { thema, startWochenKey: wochenKey, endWochenKey: wochenKey, stunden: termin.kontaktzeit_h }
    }
    if (aktuelleGruppe) {
      zeilen.push({
        reiheId: veranstaltung.id,
        zeilenLabel,
        balkenLabel: aktuelleGruppe.thema,
        thema: aktuelleGruppe.thema,
        startWochenKey: aktuelleGruppe.startWochenKey,
        endWochenKey: aktuelleGruppe.endWochenKey,
        stunden: aktuelleGruppe.stunden,
      })
    }
  }
```

No changes are needed to the type import at the top of the file — it stays `import type { Datenbestand, Einheit, Thema } from './types'` (the new loop only ever accesses `veranstaltung`/`termin` fields through `data: Datenbestand`, it doesn't need `Veranstaltung` imported by name).

- [ ] **Step 2: Update `src/lib/themenUebersicht.test.ts`**

Every inline Einheit literal in this file currently has `personen_parallel: 1` and `typ: 'regulaer' as const` (or `'regulaer'`) — delete both fields from every literal in the file (there are 10 occurrences across the `describe('berechneThemenGantt', ...)` tests). None of them set `begleitperson_ids`/`koordinator_ids`, and since `berechneThemenGantt` never reads those fields, they can be safely omitted only if TypeScript allows partial literals — it doesn't for a plain object literal typed as (or inferred against) `Einheit[]`, since `begleitperson_ids`/`koordinator_ids` are required (non-optional) fields. Add `begleitperson_ids: [], koordinator_ids: []` to every one of those 10 literals alongside removing `personen_parallel`/`typ`.

Add `veranstaltungen: []` to every `Datenbestand` literal in the file (9 occurrences, one per `it(...)` block).

Add a new describe block at the end of the file:

```ts
describe('berechneThemenGantt with Veranstaltungen', () => {
  it('creates a Gantt row for a Veranstaltungs-Termin with a Thema, labeled with Titel and Schulen', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        { id: 's1', name: 'WDG', reihen: [] },
        { id: 's2', name: 'Bayreuther Gymnasium', reihen: [] },
      ],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'themenwoche',
          titel: 'Nachhaltigkeit',
          terminstatus: 'festgelegt',
          schulIds: ['s1', 's2'],
          termine: [
            { id: 't1', index: 1, datum_oder_kw: '2026-11-09', kontaktzeit_h: 2, erstdurchfuehrung: true, thema: 'Energie', besetzungen: [] },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([
      { reiheId: 'v1', zeilenLabel: 'Nachhaltigkeit (WDG, Bayreuther)', balkenLabel: 'Energie', thema: 'Energie', startWochenKey: '2026-KW46', endWochenKey: '2026-KW46', stunden: 2 },
    ])
  })

  it('excludes a Veranstaltungs-Termin without a Thema', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [{ id: 's1', name: 'WDG', reihen: [] }],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'exkursion',
          titel: 'Exkursion',
          terminstatus: 'festgelegt',
          schulIds: ['s1'],
          termine: [{ id: 't1', index: 1, datum_oder_kw: '2026-11-09', kontaktzeit_h: 2, erstdurchfuehrung: true, besetzungen: [] }],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([])
  })

  it('excludes a Veranstaltung with terminstatus offen', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [{ id: 's1', name: 'WDG', reihen: [] }],
      veranstaltungen: [
        {
          id: 'v1',
          art: 'themenwoche',
          titel: 'Nachhaltigkeit',
          terminstatus: 'offen',
          schulIds: ['s1'],
          termine: [
            { id: 't1', index: 1, datum_oder_kw: '2026-11-09', kontaktzeit_h: 2, erstdurchfuehrung: true, thema: 'Energie', besetzungen: [] },
          ],
        },
      ],
    }
    expect(berechneThemenGantt(data)).toEqual([])
  })
})
```

Note `kuerzeSchulname` (already in the file, see `src/lib/themenUebersicht.ts`) shortens `'Bayreuther Gymnasium'` to `'Bayreuther'` and leaves `'WDG'` unchanged — verify this matches the existing `bekannteNamen` map (it does, see the map's `'Bayreuther Gymnasium': 'Bayreuther'` entry).

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/lib/themenUebersicht.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/themenUebersicht.ts src/lib/themenUebersicht.test.ts
git commit -m "feat(berechnungstool): include Veranstaltungen in the Themen-Gantt overview"
```

---

## Task 5: `src/lib/kalenderwochen.ts` — new Einheit shape, widened helper

**Files:**
- Modify: `src/lib/kalenderwochen.ts`
- Modify: `src/lib/kalenderwochen.test.ts`

**Interfaces:**
- Produces: `naechstesEinheitDatum(einheiten: { datum_oder_kw: string }[]): string` (widened from `Einheit[]` — a pure widening, still accepts `Einheit[]`/`VeranstaltungTermin[]` since both are structural supersets). `generiereWochentlicheTermine`/`expandiereMuster` construct `Einheit` objects with `begleitperson_ids: []`/`koordinator_ids: []` instead of `personen_parallel: 1`/`typ: 'regulaer'`.

- [ ] **Step 1: Update `expandiereMuster`, `generiereWochentlicheTermine`, and `naechstesEinheitDatum`**

In `src/lib/kalenderwochen.ts`, in `expandiereMuster`, replace the pushed object's `personen_parallel: 1,` and `typ: 'regulaer',` lines with `begleitperson_ids: [],` and `koordinator_ids: [],`:

```ts
      einheiten.push({
        id: `${reiheId}_muster_${index}`,
        index,
        datum_oder_kw: format(cursor, 'yyyy-MM-dd'),
        kontaktzeit_h: muster.kontaktzeit_h,
        erstdurchfuehrung: false,
        wir_begleiten: true,
        begleitperson_ids: [],
        koordinator_ids: [],
      })
```

In `generiereWochentlicheTermine`, make the same replacement:

```ts
      einheiten.push({
        id: `${reiheId}_termin_${index}`,
        index,
        datum_oder_kw: format(cursor, 'yyyy-MM-dd'),
        kontaktzeit_h: unterrichtszeitH,
        koordinationszeit_h: koordinationszeitH,
        erstdurchfuehrung: index === 1,
        wir_begleiten: true,
        begleitperson_ids: [],
        koordinator_ids: [],
      })
```

Widen `naechstesEinheitDatum`'s parameter type (only reads `.datum_oder_kw`, this is a pure widening so `Einheit[]` and the new `VeranstaltungTermin[]` both still satisfy it):

```ts
export function naechstesEinheitDatum(einheiten: { datum_oder_kw: string }[]): string {
```

(the rest of the function body is unchanged).

- [ ] **Step 2: Update `src/lib/kalenderwochen.test.ts` fixtures**

In the `describe('expandiereMuster', ...)` test, the `toMatchObject` call checks `personen_parallel: 1` and `typ: 'regulaer'` — remove those two lines from the `toMatchObject` argument (it doesn't need to assert the new array fields since `toMatchObject` only checks the keys given; the defaults are implicitly covered by the object being constructed successfully).

In `describe('berechneReiheZeitraum', ...)`, all three `Einheit` literals (`e1`/`e2`/`e3` in one test, `e1` in another) replace `personen_parallel: 1, ... typ: 'regulaer'` with `begleitperson_ids: [], koordinator_ids: []`:

```ts
        { id: 'e1', index: 1, datum_oder_kw: '2026-KW46', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
        { id: 'e2', index: 2, datum_oder_kw: '2027-KW05', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
        { id: 'e3', index: 3, datum_oder_kw: '2026-KW48', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
```
and
```ts
        { id: 'e1', index: 1, datum_oder_kw: '2026-09-07', kontaktzeit_h: 1, erstdurchfuehrung: false, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [] },
```

In `describe('naechstesEinheitDatum', ...)`, the local `einheit(datumOderKw)` helper drops `personen_parallel`/`typ` and adds the two array fields:

```ts
  function einheit(datumOderKw: string): Einheit {
    return {
      id: 'x',
      index: 1,
      datum_oder_kw: datumOderKw,
      kontaktzeit_h: 1,
      erstdurchfuehrung: false,
      wir_begleiten: true,
      begleitperson_ids: [],
      koordinator_ids: [],
    }
  }
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/lib/kalenderwochen.test.ts
```

Expected: all tests pass, including the pre-existing `generiereWochentlicheTermine`/`naechstesEinheitDatum` tests (unaffected by the widening — no assertions reference `personen_parallel`/`typ` there).

- [ ] **Step 4: Commit**

```bash
git add src/lib/kalenderwochen.ts src/lib/kalenderwochen.test.ts
git commit -m "refactor(berechnungstool): update kalenderwochen Einheit construction for multi-person fields"
```

---

## Task 6: `useAppData.ts` — migration, Kurs CRUD, Veranstaltung CRUD

**Files:**
- Modify: `src/state/useAppData.ts`
- Modify: `src/state/useAppData.test.ts`

**Interfaces:**
- Consumes: `Einheit`, `Veranstaltung`, `VeranstaltungArt`, `VeranstaltungTermin`, `SchulBesetzung`, `Reihe`, `Schule`, `Terminstatus`, `Thema`, `Datenbestand` from Task 1; `naechstesEinheitDatum` (widened, Task 5).
- Produces (new, in addition to everything `useAppData()` already returned): `addVeranstaltung(art: VeranstaltungArt, schulIds: string[]): void`, `removeVeranstaltung(veranstaltungId: string): void`, `setVeranstaltungTitel(veranstaltungId: string, titel: string): void`, `setVeranstaltungTerminstatus(veranstaltungId: string, terminstatus: Terminstatus): void`, `setVeranstaltungSchulen(veranstaltungId: string, schulIds: string[]): void`, `addVeranstaltungTermin(veranstaltungId: string): void`, `removeVeranstaltungTermin(veranstaltungId: string, terminId: string): void`, `setVeranstaltungTerminFelder(veranstaltungId, terminId, patch): void`, `setSchulBesetzungFelder(veranstaltungId, terminId, schulId, patch): void`. Changed: `addEinheit`, `setEinheitFelder` (patch type), `setEinheitBegleitung`, `removePerson` — all operate on `begleitperson_ids`/`koordinator_ids` arrays now. `migriereDatenbestand` extracts legacy `typ: 'exkursion'` Einheiten into new Veranstaltungen and backfills `veranstaltungen: []`.

- [ ] **Step 1: Rewrite the top of the file through `migriereDatenbestand`**

Replace lines 1–34 of `src/state/useAppData.ts` (imports through the end of `migriereDatenbestand`) with:

```ts
import { useEffect, useMemo, useState } from 'react'
import seedData from '../data/data.json'
import { berechneMachbarkeit, berechneWochenuebersicht } from '../lib/berechnung'
import { berechneThemenGantt } from '../lib/themenUebersicht'
import { berechnePersonenKapazitaet } from '../lib/personenKapazitaet'
import { naechstesEinheitDatum } from '../lib/kalenderwochen'
import type {
  Datenbestand,
  Einheit,
  FerienZeitraum,
  Person,
  Reihe,
  SchulBesetzung,
  Terminstatus,
  Veranstaltung,
  VeranstaltungArt,
  VeranstaltungTermin,
} from '../lib/types'

const PFLICHTFELDER = ['settings', 'personen', 'kalender', 'schulen'] as const
const STORAGE_KEY = 'kapazitaetsrechner:data'

function pruefePflichtfelder(geparst: unknown): geparst is Datenbestand {
  const istObjekt = typeof geparst === 'object' && geparst !== null
  return istObjekt && !PFLICHTFELDER.some((feld) => !(feld in (geparst as object)))
}

interface LegacyEinheit {
  id: string
  index: number
  datum_oder_kw: string
  kontaktzeit_h: number
  erstdurchfuehrung: boolean
  wir_begleiten: boolean
  thema?: Einheit['thema']
  koordinationszeit_h?: number
  begleitperson_id?: string | null
  begleitperson_ids?: string[]
  koordinator_ids?: string[]
  typ?: 'regulaer' | 'exkursion'
  organisationspauschale_h?: number
}

function migriereEinheit(roh: LegacyEinheit): Einheit {
  return {
    id: roh.id,
    index: roh.index,
    datum_oder_kw: roh.datum_oder_kw,
    kontaktzeit_h: roh.kontaktzeit_h,
    erstdurchfuehrung: roh.erstdurchfuehrung,
    wir_begleiten: roh.wir_begleiten,
    thema: roh.thema,
    koordinationszeit_h: roh.koordinationszeit_h,
    begleitperson_ids: roh.begleitperson_ids ?? (roh.begleitperson_id ? [roh.begleitperson_id] : []),
    koordinator_ids: roh.koordinator_ids ?? [],
  }
}

function migriereDatenbestand(d: Datenbestand): Datenbestand {
  const rohSchulen = d.schulen as unknown as Array<{
    id: string
    name: string
    reihen: Array<Reihe & { einheiten: LegacyEinheit[] }>
  }>
  const exkursionsVeranstaltungen: Veranstaltung[] = []

  const schulen = rohSchulen.map((schule) => ({
    id: schule.id,
    name: schule.name,
    reihen: schule.reihen.map((reihe) => {
      const terminstatus = reihe.terminstatus ?? ('festgelegt' as Terminstatus)
      const regulaereRoh: LegacyEinheit[] = []
      for (const roh of reihe.einheiten) {
        if (roh.typ !== 'exkursion') {
          regulaereRoh.push(roh)
          continue
        }
        exkursionsVeranstaltungen.push({
          id: `veranstaltung_${roh.id}`,
          art: 'exkursion',
          titel: `${reihe.titel} – Exkursion`,
          terminstatus,
          schulIds: [schule.id],
          termine: [
            {
              id: `${roh.id}_termin`,
              index: 1,
              datum_oder_kw: roh.datum_oder_kw,
              kontaktzeit_h: roh.kontaktzeit_h,
              erstdurchfuehrung: roh.erstdurchfuehrung,
              thema: roh.thema,
              organisationspauschale_h: roh.organisationspauschale_h ?? 2,
              besetzungen: [
                {
                  schulId: schule.id,
                  wir_begleiten: roh.wir_begleiten,
                  begleitperson_ids: roh.begleitperson_ids ?? (roh.begleitperson_id ? [roh.begleitperson_id] : []),
                  koordinator_ids: roh.koordinator_ids ?? [],
                  koordinationszeit_h: roh.koordinationszeit_h ?? 0,
                  fahrzeit_h: reihe.fahrzeit_h,
                },
              ],
            },
          ],
        })
      }
      return {
        ...reihe,
        terminstatus,
        einheiten: regulaereRoh.map(migriereEinheit).map((e, i) => ({ ...e, index: i + 1 })),
      }
    }),
  }))

  return {
    ...d,
    personen: d.personen
      .filter((person) => !person.szenario_optional)
      .map((person) => ({
        ...person,
        urlaub: person.urlaub ?? [],
      })),
    schulen,
    veranstaltungen: [...(d.veranstaltungen ?? []), ...exkursionsVeranstaltungen],
  }
}
```

- [ ] **Step 2: Update `removePerson`, `setEinheitBegleitung`, `addEinheit`, `setEinheitFelder`**

Replace `removePerson`:

```ts
  function removePerson(id: string) {
    setData((prev) => ({
      ...prev,
      personen: prev.personen.filter((p) => p.id !== id),
      schulen: prev.schulen.map((schule) => ({
        ...schule,
        reihen: schule.reihen.map((reihe) => ({
          ...reihe,
          einheiten: reihe.einheiten.map((e) => ({
            ...e,
            begleitperson_ids: e.begleitperson_ids.filter((pid) => pid !== id),
            koordinator_ids: e.koordinator_ids.filter((pid) => pid !== id),
          })),
        })),
      })),
      veranstaltungen: prev.veranstaltungen.map((v) => ({
        ...v,
        termine: v.termine.map((t) => ({
          ...t,
          besetzungen: t.besetzungen.map((b) => ({
            ...b,
            begleitperson_ids: b.begleitperson_ids.filter((pid) => pid !== id),
            koordinator_ids: b.koordinator_ids.filter((pid) => pid !== id),
          })),
        })),
      })),
      personenUmverteilungen: (prev.personenUmverteilungen ?? []).filter((u) => u.personId !== id),
    }))
  }
```

Replace `setEinheitBegleitung`:

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
                  e.id === einheitId ? { ...e, wir_begleiten: wert, begleitperson_ids: wert ? e.begleitperson_ids : [] } : e
                ),
              }
        ),
      })),
    }))
  }
```

Replace the `neueEinheit` object inside `addEinheit`:

```ts
          const neueEinheit: Einheit = {
            id: `${reihe.id}_neu_${Date.now()}`,
            index: reihe.einheiten.length + 1,
            datum_oder_kw: naechstesEinheitDatum(reihe.einheiten),
            kontaktzeit_h: 1.5,
            koordinationszeit_h: 0,
            erstdurchfuehrung: false,
            wir_begleiten: true,
            begleitperson_ids: [],
            koordinator_ids: [],
          }
```

Replace `setEinheitFelder`'s signature:

```ts
  function setEinheitFelder(
    reiheId: string,
    einheitId: string,
    patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema' | 'koordinationszeit_h' | 'begleitperson_ids' | 'koordinator_ids'>>
  ) {
```
(body unchanged).

- [ ] **Step 3: Delete `Schule.koordination_h_pro_monat` seeding concerns — none exist**

No code change needed here (the field was already removed from the type in Task 1 and was never written by `useAppData.ts`); this step is a no-op checkpoint, skip it.

- [ ] **Step 4: Add Veranstaltung CRUD functions**

Add these functions right after `setReiheEinheiten` (before `addPersonenUmverteilung`):

```ts
  function leereBesetzung(schulId: string): SchulBesetzung {
    return { schulId, wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 0 }
  }

  function addVeranstaltung(art: VeranstaltungArt, schulIds: string[]) {
    setData((prev) => {
      const neueVeranstaltung: Veranstaltung = {
        id: `veranstaltung_${Date.now()}`,
        art,
        titel: art === 'themenwoche' ? 'Neue Themenwoche' : 'Neue Exkursion',
        terminstatus: 'offen',
        schulIds,
        termine: [],
      }
      return { ...prev, veranstaltungen: [...prev.veranstaltungen, neueVeranstaltung] }
    })
  }

  function removeVeranstaltung(veranstaltungId: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.filter((v) => v.id !== veranstaltungId),
    }))
  }

  function setVeranstaltungTitel(veranstaltungId: string, titel: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => (v.id === veranstaltungId ? { ...v, titel } : v)),
    }))
  }

  function setVeranstaltungTerminstatus(veranstaltungId: string, terminstatus: Terminstatus) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => (v.id === veranstaltungId ? { ...v, terminstatus } : v)),
    }))
  }

  function setVeranstaltungSchulen(veranstaltungId: string, schulIds: string[]) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => {
        if (v.id !== veranstaltungId) return v
        return {
          ...v,
          schulIds,
          termine: v.termine.map((termin) => ({
            ...termin,
            besetzungen: schulIds.map((schulId) => termin.besetzungen.find((b) => b.schulId === schulId) ?? leereBesetzung(schulId)),
          })),
        }
      }),
    }))
  }

  function addVeranstaltungTermin(veranstaltungId: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => {
        if (v.id !== veranstaltungId) return v
        const neuerTermin: VeranstaltungTermin = {
          id: `${v.id}_termin_${Date.now()}`,
          index: v.termine.length + 1,
          datum_oder_kw: naechstesEinheitDatum(v.termine),
          kontaktzeit_h: 1.5,
          erstdurchfuehrung: v.termine.length === 0,
          besetzungen: v.schulIds.map((schulId) => leereBesetzung(schulId)),
        }
        return { ...v, termine: [...v.termine, neuerTermin] }
      }),
    }))
  }

  function removeVeranstaltungTermin(veranstaltungId: string, terminId: string) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) => {
        if (v.id !== veranstaltungId) return v
        const verbleibend = v.termine.filter((t) => t.id !== terminId)
        return { ...v, termine: verbleibend.map((t, i) => ({ ...t, index: i + 1 })) }
      }),
    }))
  }

  function setVeranstaltungTerminFelder(
    veranstaltungId: string,
    terminId: string,
    patch: Partial<Pick<VeranstaltungTermin, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema' | 'organisationspauschale_h' | 'erstdurchfuehrung'>>
  ) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) =>
        v.id !== veranstaltungId ? v : { ...v, termine: v.termine.map((t) => (t.id === terminId ? { ...t, ...patch } : t)) }
      ),
    }))
  }

  function setSchulBesetzungFelder(
    veranstaltungId: string,
    terminId: string,
    schulId: string,
    patch: Partial<Pick<SchulBesetzung, 'wir_begleiten' | 'begleitperson_ids' | 'koordinator_ids' | 'koordinationszeit_h' | 'fahrzeit_h'>>
  ) {
    setData((prev) => ({
      ...prev,
      veranstaltungen: prev.veranstaltungen.map((v) =>
        v.id !== veranstaltungId
          ? v
          : {
              ...v,
              termine: v.termine.map((t) =>
                t.id !== terminId
                  ? t
                  : { ...t, besetzungen: t.besetzungen.map((b) => (b.schulId === schulId ? { ...b, ...patch } : b)) }
              ),
            }
      ),
    }))
  }
```

Add all nine new functions to the object returned at the end of `useAppData()`:

```ts
    addVeranstaltung,
    removeVeranstaltung,
    setVeranstaltungTitel,
    setVeranstaltungTerminstatus,
    setVeranstaltungSchulen,
    addVeranstaltungTermin,
    removeVeranstaltungTermin,
    setVeranstaltungTerminFelder,
    setSchulBesetzungFelder,
```
(add these lines right after `setReiheEinheiten,` in the return object).

- [ ] **Step 5: Update `src/state/useAppData.test.ts`**

Replace the JSON literal in `'backfills an empty urlaub list for Personen persisted before the Urlaub field existed'` — its `settings` object drops the `koordination_h_pro_schule_pro_monat: 1.5,` line (harmless either way since it's parsed as loose JSON, but keep fixtures accurate):

```ts
      settings: {
        planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
        schwellwert_warnung: 0.7,
        schwellwert_kritisch: 0.9,
        default_fahrzeit_h: 1,
        default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
        default_vorbereitungsfaktor_wiederholung: 0.25,
      },
```

Same edit in `'defaults terminstatus to festgelegt when loading persisted data missing that field'`.

Replace `'addEinheit appends a new Einheit with default values and the correct index'`'s assertions:

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
    expect(neueEinheit.begleitperson_ids).toEqual([])
    expect(neueEinheit.koordinator_ids).toEqual([])
    expect(neueEinheit.erstdurchfuehrung).toBe(false)
    expect(neueEinheit.wir_begleiten).toBe(true)
    expect(neueEinheit.index).toBe(vorherigeAnzahl + 1)
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen[0].einheiten).toHaveLength(12)
  })
```

Replace `'setEinheitBegleitung clears begleitperson_id when toggled off'`:

```ts
  it('setEinheitBegleitung clears begleitperson_ids when toggled off', () => {
    const { result } = renderHook(() => useAppData())
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_ids: [personId] })
    })
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
    expect(aktualisierteReihe.einheiten[0].begleitperson_ids).toEqual([])
  })
```

Replace `'removePerson clears begleitperson_id on any Einheit that referenced the deleted Person'`:

```ts
  it('removePerson clears the deleted Person from any begleitperson_ids/koordinator_ids on a Reihen-Einheit', () => {
    const { result } = renderHook(() => useAppData())
    const personId = result.current.data.personen[0].id
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_ids: [personId], koordinator_ids: [personId] })
    })
    act(() => {
      result.current.removePerson(personId)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].begleitperson_ids).toEqual([])
    expect(aktualisierteReihe.einheiten[0].koordinator_ids).toEqual([])
  })
```

Replace the `neueEinheiten` literal in `'setReiheEinheiten replaces the einheiten of the matching Reihe only'`:

```ts
    const neueEinheiten = [
      {
        id: 'neu_1',
        index: 1,
        datum_oder_kw: '2027-03-01',
        kontaktzeit_h: 1.5,
        erstdurchfuehrung: true,
        wir_begleiten: true,
        begleitperson_ids: [],
        koordinator_ids: [],
      },
    ]
```

Add a new describe block at the end of the file (before the final closing of `describe('useAppData', ...)`):

```ts
  describe('Veranstaltungen', () => {
    it('addVeranstaltung appends a new Veranstaltung with the given art and schulIds', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const neue = result.current.data.veranstaltungen.at(-1)!
      expect(neue.art).toBe('themenwoche')
      expect(neue.titel).toBe('Neue Themenwoche')
      expect(neue.terminstatus).toBe('offen')
      expect(neue.schulIds).toEqual(['wdg', 'sedanstrasse'])
      expect(neue.termine).toEqual([])
    })

    it('removeVeranstaltung deletes the matching Veranstaltung only', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('exkursion', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.removeVeranstaltung(id)
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)).toBeUndefined()
    })

    it('setVeranstaltungTitel updates only the matching Veranstaltung', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.setVeranstaltungTitel(id, 'Klimawoche')
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)!.titel).toBe('Klimawoche')
    })

    it('setVeranstaltungSchulen adds a fresh Besetzung for a newly added Schule on every existing Termin', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg', 'sedanstrasse'])
      })
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === id)!
      expect(veranstaltung.schulIds).toEqual(['wdg', 'sedanstrasse'])
      expect(veranstaltung.termine[0].besetzungen.map((b) => b.schulId)).toEqual(['wdg', 'sedanstrasse'])
    })

    it('setVeranstaltungSchulen preserves an existing Besetzung for a Schule that remains selected', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setSchulBesetzungFelder(id, terminId, 'wdg', { fahrzeit_h: 2 })
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg', 'sedanstrasse'])
      })
      const besetzung = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].besetzungen.find((b) => b.schulId === 'wdg')!
      expect(besetzung.fahrzeit_h).toBe(2)
    })

    it('setVeranstaltungSchulen removes the Besetzung of a deselected Schule', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg'])
      })
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === id)!
      expect(veranstaltung.termine[0].besetzungen.map((b) => b.schulId)).toEqual(['wdg'])
    })

    it('addVeranstaltungTermin appends a Termin with one empty Besetzung per current schulId', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const termin = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0]
      expect(termin.index).toBe(1)
      expect(termin.kontaktzeit_h).toBe(1.5)
      expect(termin.erstdurchfuehrung).toBe(true)
      expect(termin.besetzungen.map((b) => b.schulId)).toEqual(['wdg', 'sedanstrasse'])
      expect(termin.besetzungen.every((b) => b.wir_begleiten && b.begleitperson_ids.length === 0)).toBe(true)
    })

    it('removeVeranstaltungTermin deletes the matching Termin and renumbers the rest', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const ersterTerminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.removeVeranstaltungTermin(id, ersterTerminId)
      })
      const termine = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine
      expect(termine).toHaveLength(1)
      expect(termine[0].index).toBe(1)
    })

    it('setVeranstaltungTerminFelder patches only the matching Termin', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setVeranstaltungTerminFelder(id, terminId, { kontaktzeit_h: 3 })
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].kontaktzeit_h).toBe(3)
    })

    it('setSchulBesetzungFelder patches only the matching Schule-Besetzung on the matching Termin', () => {
      const { result } = renderHook(() => useAppData())
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setSchulBesetzungFelder(id, terminId, 'sedanstrasse', { begleitperson_ids: ['p1'] })
      })
      const termin = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0]
      expect(termin.besetzungen.find((b) => b.schulId === 'sedanstrasse')!.begleitperson_ids).toEqual(['p1'])
      expect(termin.besetzungen.find((b) => b.schulId === 'wdg')!.begleitperson_ids).toEqual([])
    })

    it('migrates a legacy typ: exkursion Einheit in imported JSON into its own Veranstaltung', () => {
      const { result } = renderHook(() => useAppData())
      const roh = {
        settings: {
          planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
          schwellwert_warnung: 0.7,
          schwellwert_kritisch: 0.9,
          default_fahrzeit_h: 1,
          default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
          default_vorbereitungsfaktor_wiederholung: 0.25,
        },
        personen: [],
        kalender: { ferien: [] },
        schulen: [
          {
            id: 's1',
            name: 'Test',
            reihen: [
              {
                id: 'r1',
                titel: 'Kurs mit Exkursion',
                betreuungsmodell: 'A',
                fahrzeit_h: 1,
                status: 'zugesagt',
                extern_betreut: false,
                terminstatus: 'festgelegt',
                einheiten: [
                  { id: 'e1', index: 1, datum_oder_kw: '2026-10-05', kontaktzeit_h: 1.5, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
                  { id: 'e2', index: 2, datum_oder_kw: '2026-10-12', kontaktzeit_h: 1.5, erstdurchfuehrung: false, wir_begleiten: true, typ: 'exkursion', organisationspauschale_h: 2 },
                ],
              },
            ],
          },
        ],
      }
      act(() => {
        result.current.importJson(JSON.stringify(roh))
      })
      const schule = result.current.data.schulen.find((s) => s.id === 's1')!
      expect(schule.reihen[0].einheiten).toHaveLength(1)
      expect(schule.reihen[0].einheiten[0].id).toBe('e1')
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === 'veranstaltung_e2')!
      expect(veranstaltung.art).toBe('exkursion')
      expect(veranstaltung.schulIds).toEqual(['s1'])
      expect(veranstaltung.termine[0].organisationspauschale_h).toBe(2)
      expect(veranstaltung.termine[0].besetzungen[0]).toMatchObject({ schulId: 's1', wir_begleiten: true, fahrzeit_h: 1 })
    })
  })
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/state/useAppData.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts
git commit -m "feat(berechnungstool): add Veranstaltung CRUD and legacy Exkursion migration to useAppData"
```

---

## Task 7: Migrate `src/data/data.json`, update `src/data/data.test.ts`

**Files:**
- Create (temporary, deleted at the end of this task): `scripts/migrate-veranstaltungen.mjs`
- Modify: `src/data/data.json`
- Modify: `src/data/data.test.ts`

**Interfaces:**
- Produces: `data.json` in the new shape (no `typ`/`personen_parallel`/`organisationspauschale_h`/`begleitperson_id`/`koordination_h_pro_monat` fields; `begleitperson_ids: []`/`koordinator_ids: []` on every Einheit; a new top-level `veranstaltungen` array with 2 entries for the two former `typ: 'exkursion'` Einheiten at Else Lasker).

- [ ] **Step 1: Write and run the one-off migration script**

Create `scripts/migrate-veranstaltungen.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs'

const pfad = new URL('../src/data/data.json', import.meta.url)
const data = JSON.parse(readFileSync(pfad, 'utf-8'))

const veranstaltungen = []

for (const schule of data.schulen) {
  delete schule.koordination_h_pro_monat
  for (const reihe of schule.reihen) {
    const bleibendeEinheiten = []
    for (const einheit of reihe.einheiten) {
      const begleitperson_ids = einheit.begleitperson_id ? [einheit.begleitperson_id] : []
      if (einheit.typ === 'exkursion') {
        veranstaltungen.push({
          id: `veranstaltung_${einheit.id}`,
          art: 'exkursion',
          titel: `${reihe.titel} – Exkursion`,
          terminstatus: reihe.terminstatus ?? 'festgelegt',
          schulIds: [schule.id],
          termine: [
            {
              id: `${einheit.id}_termin`,
              index: 1,
              datum_oder_kw: einheit.datum_oder_kw,
              kontaktzeit_h: einheit.kontaktzeit_h,
              erstdurchfuehrung: einheit.erstdurchfuehrung,
              ...(einheit.thema ? { thema: einheit.thema } : {}),
              organisationspauschale_h: einheit.organisationspauschale_h ?? 2,
              besetzungen: [
                {
                  schulId: schule.id,
                  wir_begleiten: einheit.wir_begleiten,
                  begleitperson_ids,
                  koordinator_ids: [],
                  koordinationszeit_h: einheit.koordinationszeit_h ?? 0,
                  fahrzeit_h: reihe.fahrzeit_h,
                },
              ],
            },
          ],
        })
        continue
      }
      bleibendeEinheiten.push({
        id: einheit.id,
        index: bleibendeEinheiten.length + 1,
        datum_oder_kw: einheit.datum_oder_kw,
        kontaktzeit_h: einheit.kontaktzeit_h,
        erstdurchfuehrung: einheit.erstdurchfuehrung,
        wir_begleiten: einheit.wir_begleiten,
        ...(einheit.thema ? { thema: einheit.thema } : {}),
        ...(einheit.koordinationszeit_h !== undefined ? { koordinationszeit_h: einheit.koordinationszeit_h } : {}),
        begleitperson_ids,
        koordinator_ids: [],
      })
    }
    reihe.einheiten = bleibendeEinheiten
  }
}

data.veranstaltungen = veranstaltungen

writeFileSync(pfad, JSON.stringify(data, null, 2) + '\n')
console.log(`Migrated. ${veranstaltungen.length} Veranstaltung(en) extracted.`)
```

Run it:

```bash
node scripts/migrate-veranstaltungen.mjs
```

Expected output: `Migrated. 2 Veranstaltung(en) extracted.`

- [ ] **Step 2: Inspect the diff**

```bash
git diff --stat src/data/data.json
git diff src/data/data.json | head -100
```

Confirm: every Einheit lost `typ`/`personen_parallel`, gained `begleitperson_ids: []`/`koordinator_ids: []`; the two exkursion Einheiten (`el_parisa_e3`, `el_simone_e4`) are gone from their Reihen; a new top-level `"veranstaltungen"` array with 2 entries exists at the end of the file.

- [ ] **Step 3: Update `src/data/data.test.ts`**

Replace `'gives Else Lasker / Parisa exactly Einheiten 1 and 3 as wir_begleiten'`:

```ts
  it('gives Else Lasker / Parisa Einheit 1 as wir_begleiten among its remaining (non-Exkursion) Reihen-Einheiten', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    const parisa = elseLasker.reihen.find((r) => r.id === 'reihe_else_lasker_parisa')!
    expect(parisa.einheiten.map((e) => e.wir_begleiten)).toEqual([true, false, false])
  })

  it('extracts the Parisa and Simone Exkursionen into their own Veranstaltungen', () => {
    const d = data as Datenbestand
    expect(d.veranstaltungen).toHaveLength(2)
    expect(d.veranstaltungen.every((v) => v.art === 'exkursion')).toBe(true)
    expect(d.veranstaltungen.every((v) => v.schulIds.length === 1 && v.schulIds[0] === 'else_lasker')).toBe(true)
    // el_parisa_e3 had wir_begleiten: true, el_simone_e4 had wir_begleiten: false — both values must survive the move.
    const wirBegleitenWerte = d.veranstaltungen.map((v) => v.termine[0].besetzungen[0].wir_begleiten).sort()
    expect(wirBegleitenWerte).toEqual([false, true])
  })
```

Replace `'sets every Else-Lasker Termin (including the Exkursionen) to 90 minutes Unterrichtszeit'`:

```ts
  it('sets every Else-Lasker Termin, including the extracted Exkursions-Veranstaltungen, to 90 minutes Unterrichtszeit', () => {
    const d = data as Datenbestand
    const elseLasker = d.schulen.find((s) => s.id === 'else_lasker')!
    for (const reihe of elseLasker.reihen) {
      expect(reihe.einheiten.every((e) => e.kontaktzeit_h === 1.5)).toBe(true)
    }
    for (const veranstaltung of d.veranstaltungen) {
      expect(veranstaltung.termine.every((t) => t.kontaktzeit_h === 1.5)).toBe(true)
    }
  })
```

Replace `'leaves the Exkursions-Organisationspauschale at Else Lasker unchanged'`:

```ts
  it('leaves the Exkursions-Organisationspauschale for both extracted Veranstaltungen at 2h', () => {
    const d = data as Datenbestand
    expect(d.veranstaltungen).toHaveLength(2)
    expect(d.veranstaltungen.every((v) => v.termine[0].organisationspauschale_h === 2)).toBe(true)
  })
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/data/data.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Delete the one-off script and commit**

```bash
rm scripts/migrate-veranstaltungen.mjs
git add src/data/data.json src/data/data.test.ts
git commit -m "data(berechnungstool): migrate seed data.json to the Veranstaltung/multi-person Einheit shape"
```

---

## Task 8: `PersonenMehrfachauswahl` (new shared component)

**Files:**
- Create: `src/components/PersonenMehrfachauswahl.tsx`
- Create: `src/components/PersonenMehrfachauswahl.test.tsx`

**Interfaces:**
- Produces: `PersonenMehrfachauswahl({ personen, ausgewaehlt, onChange, label, disabled? })` — a `<details>` disclosure; summary shows selected names joined by `", "` or `"— niemand —"`; one checkbox per Person, `aria-label={`${label}: ${person.name}`}`.

- [ ] **Step 1: Write the failing test**

Create `src/components/PersonenMehrfachauswahl.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonenMehrfachauswahl } from './PersonenMehrfachauswahl'
import type { Person } from '../lib/types'

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
  { id: 'p2', name: 'Ben', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
]

describe('PersonenMehrfachauswahl', () => {
  it('shows "— niemand —" in the summary when nothing is selected', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={[]} onChange={vi.fn()} label="Begleitpersonen" />)
    expect(screen.getByText('— niemand —')).toBeInTheDocument()
  })

  it('joins the selected names in the summary', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p1', 'p2']} onChange={vi.fn()} label="Begleitpersonen" />)
    expect(screen.getByText('Anna, Ben')).toBeInTheDocument()
  })

  it('renders one checkbox per Person, checked according to ausgewaehlt', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p2']} onChange={vi.fn()} label="Begleitpersonen" />)
    expect(screen.getByLabelText('Begleitpersonen: Anna')).not.toBeChecked()
    expect(screen.getByLabelText('Begleitpersonen: Ben')).toBeChecked()
  })

  it('calls onChange with the id added when an unchecked checkbox is checked', () => {
    const onChange = vi.fn()
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p1']} onChange={onChange} label="Begleitpersonen" />)
    fireEvent.click(screen.getByLabelText('Begleitpersonen: Ben'))
    expect(onChange).toHaveBeenCalledWith(['p1', 'p2'])
  })

  it('calls onChange with the id removed when a checked checkbox is unchecked', () => {
    const onChange = vi.fn()
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={['p1', 'p2']} onChange={onChange} label="Begleitpersonen" />)
    fireEvent.click(screen.getByLabelText('Begleitpersonen: Anna'))
    expect(onChange).toHaveBeenCalledWith(['p2'])
  })

  it('disables every checkbox when disabled is true', () => {
    render(<PersonenMehrfachauswahl personen={personen} ausgewaehlt={[]} onChange={vi.fn()} label="Begleitpersonen" disabled />)
    expect(screen.getByLabelText('Begleitpersonen: Anna')).toBeDisabled()
    expect(screen.getByLabelText('Begleitpersonen: Ben')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/PersonenMehrfachauswahl.test.tsx
```

Expected: FAIL — `Cannot find module './PersonenMehrfachauswahl'`.

- [ ] **Step 3: Write the component**

Create `src/components/PersonenMehrfachauswahl.tsx`:

```tsx
import type { Person } from '../lib/types'

export function PersonenMehrfachauswahl({
  personen,
  ausgewaehlt,
  onChange,
  label,
  disabled = false,
}: {
  personen: Person[]
  ausgewaehlt: string[]
  onChange: (ids: string[]) => void
  label: string
  disabled?: boolean
}) {
  function toggle(personId: string, checked: boolean) {
    onChange(checked ? [...ausgewaehlt, personId] : ausgewaehlt.filter((id) => id !== personId))
  }

  const ausgewaehlteNamen = personen.filter((p) => ausgewaehlt.includes(p.id)).map((p) => p.name)

  return (
    <details className="personen-mehrfachauswahl">
      <summary>{ausgewaehlteNamen.length > 0 ? ausgewaehlteNamen.join(', ') : '— niemand —'}</summary>
      <div>
        {personen.map((person) => (
          <label key={person.id}>
            <input
              type="checkbox"
              aria-label={`${label}: ${person.name}`}
              checked={ausgewaehlt.includes(person.id)}
              disabled={disabled}
              onChange={(ev) => toggle(person.id, ev.target.checked)}
            />
            {person.name}
          </label>
        ))}
      </div>
    </details>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/PersonenMehrfachauswahl.test.tsx
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/PersonenMehrfachauswahl.tsx src/components/PersonenMehrfachauswahl.test.tsx
git commit -m "feat(berechnungstool): add PersonenMehrfachauswahl checkbox disclosure component"
```

---

## Task 9: `ReihenEditor.tsx` — multi-select, Exkursion button, remove Themenwoche

**Files:**
- Modify: `src/components/ReihenEditor.tsx`
- Modify: `src/components/ReihenEditor.test.tsx`

**Interfaces:**
- Consumes: `PersonenMehrfachauswahl` from Task 8.
- Produces: `ReihenEditor` props drop `themenwochen: string[]`, gain `onExkursionAdd: () => void`. `onEinheitFelderChange` patch type: `begleitperson_ids?: string[]`/`koordinator_ids?: string[]` replace `begleitperson_id?: string | null`.

- [ ] **Step 1: Rewrite the component**

Replace the whole content of `src/components/ReihenEditor.tsx`:

```tsx
import { useState } from 'react'
import { format } from 'date-fns'
import { berechneUnserAnteil, ermittleHaeufigsteKontaktzeit } from '../lib/besetzung'
import { PersonenMehrfachauswahl } from './PersonenMehrfachauswahl'
import type { Person, Reihe, Terminstatus, Thema } from '../lib/types'

const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie']

export function ReihenEditor({
  reihe,
  personen,
  onEinheitToggle,
  onEinheitAdd,
  onEinheitRemove,
  onEinheitFelderChange,
  onTerminstatusChange,
  onTermineGenerieren,
  onTitelChange,
  onExkursionAdd,
}: {
  reihe: Reihe
  personen: Person[]
  onEinheitToggle: (einheitId: string, wert: boolean) => void
  onEinheitAdd: () => void
  onEinheitRemove: (einheitId: string) => void
  onEinheitFelderChange: (
    einheitId: string,
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_ids?: string[]; koordinator_ids?: string[] }
  ) => void
  onTerminstatusChange: (wert: Terminstatus) => void
  onTermineGenerieren: (startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) => void
  onTitelChange: (titel: string) => void
  onExkursionAdd: () => void
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
      <input type="text" aria-label="Titel" value={reihe.titel} onChange={(ev) => onTitelChange(ev.target.value)} />
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
            <th>Begleitpersonen</th>
            <th>Koordinatoren</th>
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
                <PersonenMehrfachauswahl
                  personen={personen}
                  ausgewaehlt={e.begleitperson_ids}
                  disabled={!e.wir_begleiten}
                  onChange={(ids) => onEinheitFelderChange(e.id, { begleitperson_ids: ids })}
                  label={`Begleitpersonen für Termin ${e.index} in ${reihe.titel}`}
                />
              </td>
              <td>
                <PersonenMehrfachauswahl
                  personen={personen}
                  ausgewaehlt={e.koordinator_ids}
                  onChange={(ids) => onEinheitFelderChange(e.id, { koordinator_ids: ids })}
                  label={`Koordinatoren für Termin ${e.index} in ${reihe.titel}`}
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
      <button onClick={onExkursionAdd}>+ Exkursion hinzufügen</button>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `src/components/ReihenEditor.test.tsx`**

Replace the `reihe` fixture (lines 6–36):

```ts
const reihe: Reihe = {
  id: 'r1',
  titel: 'Testreihe',
  betreuungsmodell: 'A',
  fahrzeit_h: 1,
  status: 'zugesagt',
  extern_betreut: false, terminstatus: 'festgelegt',
  einheiten: [
    {
      id: 'e1',
      index: 1,
      datum_oder_kw: '2026-09-07',
      kontaktzeit_h: 1.5,
      erstdurchfuehrung: true,
      wir_begleiten: true,
      koordinationszeit_h: 0.5,
      begleitperson_ids: [],
      koordinator_ids: [],
    },
    {
      id: 'e2',
      index: 2,
      datum_oder_kw: '2026-09-14',
      kontaktzeit_h: 1.1,
      erstdurchfuehrung: false,
      wir_begleiten: false,
      begleitperson_ids: [],
      koordinator_ids: [],
    },
  ],
}
```

Replace `renderReihenEditor()` and every inline `<ReihenEditor ... />` usage's props: drop `themenwochen: []` (or the `themenwochen={[]}` JSX attribute), add `onExkursionAdd: vi.fn()` (or `onExkursionAdd={vi.fn()}`). There are 6 such prop sets in the file (the `renderReihenEditor` helper plus 5 inline `render(<ReihenEditor .../>)` calls in the `'shows an "offen" badge...'`, `'calls onTermineGenerieren...'` ×2, `'defaults the Schnelleinrichtung...'`, `'falls back to 90 minutes...'`, and `'offers existing themenwochen...'` tests) — apply the same drop/add to each.

`renderReihenEditor()` becomes:

```ts
function renderReihenEditor() {
  const props = {
    reihe,
    personen,
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onTermineGenerieren: vi.fn(),
    onTitelChange: vi.fn(),
    onExkursionAdd: vi.fn(),
  }
  render(<ReihenEditor {...props} />)
  return props
}
```

Delete the `'offers Exkursion as a Thema'` test entirely (`THEMEN` no longer includes it).

Delete the whole `'renders a Themenwoche input for each Termin, defaulting to empty'`, `'calls onEinheitFelderChange with the entered Themenwoche'`, and `'offers existing themenwochen values via a datalist for autocomplete'` tests entirely.

Replace the 5 Begleitperson single-select tests (`'renders a Begleitperson option for each Person, plus a niemand option'` through `'calls onEinheitFelderChange with null when Begleitperson is reset to — niemand —'`) with:

```ts
  it('renders a Begleitpersonen checkbox for each Person', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Anna')).toBeInTheDocument()
    expect(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Ben')).toBeInTheDocument()
  })

  it('disables the Begleitpersonen checkboxes when Wir begleiten is off', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Begleitpersonen für Termin 2 in Testreihe: Anna')).toBeDisabled()
  })

  it('enables the Begleitpersonen checkboxes when Wir begleiten is on', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Anna')).not.toBeDisabled()
  })

  it('calls onEinheitFelderChange with the updated begleitperson_ids when a Begleitpersonen checkbox is toggled', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByLabelText('Begleitpersonen für Termin 1 in Testreihe: Ben'))
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { begleitperson_ids: ['p2'] })
  })

  it('renders a Koordinatoren checkbox for each Person, not disabled when Wir begleiten is off', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Koordinatoren für Termin 2 in Testreihe: Anna')).not.toBeDisabled()
  })

  it('calls onEinheitFelderChange with the updated koordinator_ids when a Koordinatoren checkbox is toggled', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByLabelText('Koordinatoren für Termin 1 in Testreihe: Anna'))
    expect(props.onEinheitFelderChange).toHaveBeenCalledWith('e1', { koordinator_ids: ['p1'] })
  })

  it('calls onExkursionAdd when the Exkursion button is clicked', () => {
    const props = renderReihenEditor()
    fireEvent.click(screen.getByText('+ Exkursion hinzufügen'))
    expect(props.onExkursionAdd).toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/components/ReihenEditor.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx
git commit -m "feat(berechnungstool): multi-select Begleitpersonen/Koordinatoren in ReihenEditor, add Exkursion button"
```

---

## Task 10: `SchuleAkkordionItem.tsx` — Themenwoche button, thread onExkursionAdd

**Files:**
- Modify: `src/components/SchuleAkkordionItem.tsx`
- Modify: `src/components/SchuleAkkordionItem.test.tsx`

**Interfaces:**
- Consumes: `ReihenEditor`'s new `onExkursionAdd` prop (Task 9).
- Produces: `SchuleAkkordionItem` props drop `themenwochen: string[]`, gain `onExkursionAdd: () => void` and `onVeranstaltungAdd: () => void`. Renders a new `"+ Themenwoche hinzufügen"` button.

- [ ] **Step 1: Rewrite the component**

Replace the whole content of `src/components/SchuleAkkordionItem.tsx`:

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
  onReiheAdd,
  onReiheRemove,
  onReiheTitelChange,
  onExkursionAdd,
  onVeranstaltungAdd,
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
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_ids?: string[]; koordinator_ids?: string[] }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onTermineGenerieren: (reiheId: string, startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) => void
  onReiheAdd: () => void
  onReiheRemove: (reiheId: string) => void
  onReiheTitelChange: (reiheId: string, titel: string) => void
  onExkursionAdd: () => void
  onVeranstaltungAdd: () => void
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
              onExkursionAdd={onExkursionAdd}
            />
          </div>
        ))}
        <button onClick={onReiheAdd}>+ Kurs hinzufügen</button>
        <button onClick={onVeranstaltungAdd}>+ Themenwoche hinzufügen</button>
      </div>
    </details>
  )
}
```

- [ ] **Step 2: Update `src/components/SchuleAkkordionItem.test.tsx`**

Replace `renderItem()`'s props object:

```ts
function renderItem() {
  const props = {
    schule,
    settings,
    personen: [],
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onTermineGenerieren: vi.fn(),
    onReiheAdd: vi.fn(),
    onReiheRemove: vi.fn(),
    onReiheTitelChange: vi.fn(),
    onExkursionAdd: vi.fn(),
    onVeranstaltungAdd: vi.fn(),
  }
  render(<SchuleAkkordionItem {...props} />)
  return props
}
```

Add a new test after `'calls onReiheAdd when the "+ Kurs hinzufügen" button is clicked'`:

```ts
  it('calls onVeranstaltungAdd when the "+ Themenwoche hinzufügen" button is clicked', () => {
    const props = renderItem()
    fireEvent.click(screen.getByText('+ Themenwoche hinzufügen'))
    expect(props.onVeranstaltungAdd).toHaveBeenCalled()
  })

  it('calls onExkursionAdd when a Reihe´s "+ Exkursion hinzufügen" button is clicked', () => {
    const props = renderItem()
    const reiheEinsUeberschrift = screen.getByDisplayValue('Reihe Eins')
    const reiheEinsContainer = reiheEinsUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheEinsContainer).getByText('+ Exkursion hinzufügen'))
    expect(props.onExkursionAdd).toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/components/SchuleAkkordionItem.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SchuleAkkordionItem.tsx src/components/SchuleAkkordionItem.test.tsx
git commit -m "feat(berechnungstool): add Themenwoche hinzufügen button, thread onExkursionAdd through SchuleAkkordionItem"
```

---

## Task 11: `SchulenAccordion.tsx` — bind Veranstaltung callbacks per Schule

**Files:**
- Modify: `src/components/SchulenAccordion.tsx`
- Modify: `src/components/SchulenAccordion.test.tsx`

**Interfaces:**
- Consumes: `SchuleAkkordionItem`'s new `onExkursionAdd`/`onVeranstaltungAdd` props (Task 10).
- Produces: `SchulenAccordion` props drop `themenwochen: string[]`, gain `onVeranstaltungAdd: (art: VeranstaltungArt, schulIds: string[]) => void`. Internally binds `onExkursionAdd={() => onVeranstaltungAdd('exkursion', [schule.id])}` and `onVeranstaltungAdd={() => onVeranstaltungAdd('themenwoche', [schule.id])}` per Schule.

- [ ] **Step 1: Rewrite the component**

Replace the whole content of `src/components/SchulenAccordion.tsx`:

```tsx
import { SchuleAkkordionItem } from './SchuleAkkordionItem'
import { generiereWochentlicheTermine } from '../lib/kalenderwochen'
import type { Einheit, FerienZeitraum, Person, Schule, Settings, Terminstatus, Thema, VeranstaltungArt } from '../lib/types'
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
  onReiheAdd,
  onReiheRemove,
  onReiheTitelChange,
  onVeranstaltungAdd,
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
    patch: { datum_oder_kw?: string; kontaktzeit_h?: number; thema?: Thema; koordinationszeit_h?: number; begleitperson_ids?: string[]; koordinator_ids?: string[] }
  ) => void
  onTerminstatusChange: (reiheId: string, terminstatus: Terminstatus) => void
  onEinheitenReplace: (reiheId: string, einheiten: Einheit[]) => void
  onReiheAdd: (schuleId: string) => void
  onReiheRemove: (schuleId: string, reiheId: string) => void
  onReiheTitelChange: (reiheId: string, titel: string) => void
  onVeranstaltungAdd: (art: VeranstaltungArt, schulIds: string[]) => void
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
          onReiheAdd={() => onReiheAdd(schule.id)}
          onReiheRemove={(reiheId) => onReiheRemove(schule.id, reiheId)}
          onReiheTitelChange={onReiheTitelChange}
          onExkursionAdd={() => onVeranstaltungAdd('exkursion', [schule.id])}
          onVeranstaltungAdd={() => onVeranstaltungAdd('themenwoche', [schule.id])}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Update `src/components/SchulenAccordion.test.tsx`**

Update both `Schule` fixtures' `einheiten` (drop `personen_parallel: 1, typ: 'regulaer'`, add `begleitperson_ids: [], koordinator_ids: []`, add `erstdurchfuehrung: false` stays as-is — it's already there):

```ts
        einheiten: [
          {
            id: 'e1',
            index: 1,
            datum_oder_kw: '2026-09-07',
            kontaktzeit_h: 1,
            erstdurchfuehrung: false,
            wir_begleiten: false,
            begleitperson_ids: [],
            koordinator_ids: [],
          },
        ],
```
(apply the same shape to the `e2`/`'Schule Zwei'` fixture too).

Replace `renderAccordion()`'s props object:

```ts
function renderAccordion() {
  const props = {
    schulen,
    settings,
    personen: [],
    ferien: [],
    onEinheitToggle: vi.fn(),
    onEinheitAdd: vi.fn(),
    onEinheitRemove: vi.fn(),
    onEinheitFelderChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onEinheitenReplace: vi.fn(),
    onReiheAdd: vi.fn(),
    onReiheRemove: vi.fn(),
    onReiheTitelChange: vi.fn(),
    onVeranstaltungAdd: vi.fn(),
  }
  render(<SchulenAccordion {...props} />)
  return props
}
```

Add two new tests after `'forwards onReiheAdd with the correct Schule id'`:

```ts
  it('forwards onVeranstaltungAdd with art "themenwoche" and the correct Schule id when "+ Themenwoche hinzufügen" is clicked', () => {
    const props = renderAccordion()
    const schuleZweiSummary = screen.getByText('Schule Zwei').closest('summary') as HTMLElement
    const schuleZweiDetails = schuleZweiSummary.closest('details') as HTMLElement
    fireEvent.click(within(schuleZweiDetails).getByText('+ Themenwoche hinzufügen'))
    expect(props.onVeranstaltungAdd).toHaveBeenCalledWith('themenwoche', ['s2'])
  })

  it('forwards onVeranstaltungAdd with art "exkursion" and the correct Schule id when a Reihe´s "+ Exkursion hinzufügen" is clicked', () => {
    const props = renderAccordion()
    const reiheEinsUeberschrift = screen.getByDisplayValue('Reihe Eins')
    const reiheEinsContainer = reiheEinsUeberschrift.closest('div') as HTMLElement
    fireEvent.click(within(reiheEinsContainer).getByText('+ Exkursion hinzufügen'))
    expect(props.onVeranstaltungAdd).toHaveBeenCalledWith('exkursion', ['s1'])
  })
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run src/components/SchulenAccordion.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/SchulenAccordion.tsx src/components/SchulenAccordion.test.tsx
git commit -m "feat(berechnungstool): bind onVeranstaltungAdd per Schule in SchulenAccordion"
```

---

## Task 12: `VeranstaltungenUebersicht` (new top-level section)

**Files:**
- Create: `src/components/VeranstaltungenUebersicht.tsx`
- Create: `src/components/VeranstaltungenUebersicht.css`
- Create: `src/components/VeranstaltungenUebersicht.test.tsx`

**Interfaces:**
- Consumes: `PersonenMehrfachauswahl` (Task 8); `Veranstaltung`/`VeranstaltungArt`/`VeranstaltungTermin`/`Schule`/`Person`/`Terminstatus`/`Thema` (Task 1); `useAppData`'s `addVeranstaltung`/`removeVeranstaltung`/`setVeranstaltungTitel`/`setVeranstaltungTerminstatus`/`setVeranstaltungSchulen`/`addVeranstaltungTermin`/`removeVeranstaltungTermin`/`setVeranstaltungTerminFelder`/`setSchulBesetzungFelder` (Task 6).
- Produces: `VeranstaltungenUebersicht({ veranstaltungen, schulen, personen, onAdd, onRemove, onTitelChange, onTerminstatusChange, onSchulenChange, onTerminAdd, onTerminRemove, onTerminFelderChange, onBesetzungFelderChange })`.

- [ ] **Step 1: Write the failing test**

Create `src/components/VeranstaltungenUebersicht.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { VeranstaltungenUebersicht } from './VeranstaltungenUebersicht'
import type { Person, Schule, Veranstaltung } from '../lib/types'

const schulen: Schule[] = [
  { id: 's1', name: 'WDG', reihen: [] },
  { id: 's2', name: 'Bayreuther Gymnasium', reihen: [] },
]

const personen: Person[] = [
  { id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [], urlaub: [] },
]

const veranstaltungen: Veranstaltung[] = [
  {
    id: 'v1',
    art: 'themenwoche',
    titel: 'Nachhaltigkeit',
    terminstatus: 'festgelegt',
    schulIds: ['s1'],
    termine: [
      {
        id: 't1',
        index: 1,
        datum_oder_kw: '2026-11-09',
        kontaktzeit_h: 1.5,
        erstdurchfuehrung: true,
        besetzungen: [{ schulId: 's1', wir_begleiten: true, begleitperson_ids: [], koordinator_ids: [], koordinationszeit_h: 0, fahrzeit_h: 1 }],
      },
    ],
  },
]

function renderUebersicht(overrides: Partial<Veranstaltung>[] = []) {
  const props = {
    veranstaltungen: overrides.length > 0 ? overrides.map((o, i) => ({ ...veranstaltungen[i], ...o })) : veranstaltungen,
    schulen,
    personen,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onTitelChange: vi.fn(),
    onTerminstatusChange: vi.fn(),
    onSchulenChange: vi.fn(),
    onTerminAdd: vi.fn(),
    onTerminRemove: vi.fn(),
    onTerminFelderChange: vi.fn(),
    onBesetzungFelderChange: vi.fn(),
  }
  render(<VeranstaltungenUebersicht {...props} />)
  return props
}

describe('VeranstaltungenUebersicht', () => {
  it('renders the Titel of each Veranstaltung as an editable input', () => {
    renderUebersicht()
    expect(screen.getByDisplayValue('Nachhaltigkeit')).toBeInTheDocument()
  })

  it('calls onTitelChange when the Titel input changes', () => {
    const props = renderUebersicht()
    fireEvent.change(screen.getByDisplayValue('Nachhaltigkeit'), { target: { value: 'Klimawoche' } })
    expect(props.onTitelChange).toHaveBeenCalledWith('v1', 'Klimawoche')
  })

  it('calls onRemove when the delete button is clicked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Nachhaltigkeit löschen'))
    expect(props.onRemove).toHaveBeenCalledWith('v1')
  })

  it('renders one Schule checkbox per Schule, checked according to schulIds', () => {
    renderUebersicht()
    expect(screen.getByLabelText('Schule WDG für Nachhaltigkeit')).toBeChecked()
    expect(screen.getByLabelText('Schule Bayreuther Gymnasium für Nachhaltigkeit')).not.toBeChecked()
  })

  it('calls onSchulenChange with the added Schule id when an unchecked Schule checkbox is checked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Schule Bayreuther Gymnasium für Nachhaltigkeit'))
    expect(props.onSchulenChange).toHaveBeenCalledWith('v1', ['s1', 's2'])
  })

  it('renders one Besetzung row per participating Schule, showing Wir begleiten and Fahrzeit', () => {
    renderUebersicht()
    expect(screen.getByLabelText('Wir begleiten WDG bei Termin 1 in Nachhaltigkeit')).toBeChecked()
    expect(screen.getByLabelText('Fahrzeit für WDG bei Termin 1 in Nachhaltigkeit')).toHaveValue(1)
  })

  it('calls onBesetzungFelderChange when a Begleitpersonen checkbox for a Schule-Besetzung is toggled', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Begleitpersonen für WDG bei Termin 1 in Nachhaltigkeit: Anna'))
    expect(props.onBesetzungFelderChange).toHaveBeenCalledWith('v1', 't1', 's1', { begleitperson_ids: ['p1'] })
  })

  it('calls onTerminAdd when "+ Termin hinzufügen" is clicked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByText('+ Termin hinzufügen'))
    expect(props.onTerminAdd).toHaveBeenCalledWith('v1')
  })

  it('shows "+ Exkursion hinzufügen" for a Themenwoche and calls onAdd with art exkursion and the same Schulen', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByText('+ Exkursion hinzufügen'))
    expect(props.onAdd).toHaveBeenCalledWith('exkursion', ['s1'])
  })

  it('does not show "+ Exkursion hinzufügen" for an Exkursion', () => {
    renderUebersicht([{ art: 'exkursion' }])
    expect(screen.queryByText('+ Exkursion hinzufügen')).not.toBeInTheDocument()
  })

  it('shows an Organisationspauschale input only for an Exkursion, not for a Themenwoche', () => {
    renderUebersicht()
    expect(screen.queryByLabelText('Organisationspauschale für Termin 1 in Nachhaltigkeit')).not.toBeInTheDocument()
  })

  it('calls onTerminRemove when a Termin´s delete button is clicked', () => {
    const props = renderUebersicht()
    fireEvent.click(screen.getByLabelText('Termin 1 in Nachhaltigkeit löschen'))
    expect(props.onTerminRemove).toHaveBeenCalledWith('v1', 't1')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/VeranstaltungenUebersicht.test.tsx
```

Expected: FAIL — `Cannot find module './VeranstaltungenUebersicht'`.

- [ ] **Step 3: Write the component**

Create `src/components/VeranstaltungenUebersicht.css`:

```css
.veranstaltung {
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
}

.veranstaltung-termin {
  border-top: 1px solid #eee;
  padding-top: 0.5rem;
  margin-top: 0.5rem;
}
```

Create `src/components/VeranstaltungenUebersicht.tsx`:

```tsx
import { PersonenMehrfachauswahl } from './PersonenMehrfachauswahl'
import type { Person, Schule, Terminstatus, Thema, Veranstaltung, VeranstaltungArt, VeranstaltungTermin } from '../lib/types'
import './VeranstaltungenUebersicht.css'

const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie']

export function VeranstaltungenUebersicht({
  veranstaltungen,
  schulen,
  personen,
  onAdd,
  onRemove,
  onTitelChange,
  onTerminstatusChange,
  onSchulenChange,
  onTerminAdd,
  onTerminRemove,
  onTerminFelderChange,
  onBesetzungFelderChange,
}: {
  veranstaltungen: Veranstaltung[]
  schulen: Schule[]
  personen: Person[]
  onAdd: (art: VeranstaltungArt, schulIds: string[]) => void
  onRemove: (veranstaltungId: string) => void
  onTitelChange: (veranstaltungId: string, titel: string) => void
  onTerminstatusChange: (veranstaltungId: string, terminstatus: Terminstatus) => void
  onSchulenChange: (veranstaltungId: string, schulIds: string[]) => void
  onTerminAdd: (veranstaltungId: string) => void
  onTerminRemove: (veranstaltungId: string, terminId: string) => void
  onTerminFelderChange: (
    veranstaltungId: string,
    terminId: string,
    patch: Partial<Pick<VeranstaltungTermin, 'datum_oder_kw' | 'kontaktzeit_h' | 'thema' | 'organisationspauschale_h' | 'erstdurchfuehrung'>>
  ) => void
  onBesetzungFelderChange: (
    veranstaltungId: string,
    terminId: string,
    schulId: string,
    patch: { wir_begleiten?: boolean; begleitperson_ids?: string[]; koordinator_ids?: string[]; koordinationszeit_h?: number; fahrzeit_h?: number }
  ) => void
}) {
  const schulname = (schulId: string) => schulen.find((s) => s.id === schulId)?.name ?? schulId

  return (
    <div>
      <h3>Themenwochen & Exkursionen</h3>
      {veranstaltungen.map((v) => (
        <div key={v.id} className="veranstaltung">
          <input type="text" aria-label="Titel" value={v.titel} onChange={(ev) => onTitelChange(v.id, ev.target.value)} />
          <button onClick={() => onRemove(v.id)} aria-label={`${v.titel} löschen`}>
            🗑
          </button>
          <label>
            Terminstatus:{' '}
            <select
              aria-label={`Terminstatus für ${v.titel}`}
              value={v.terminstatus}
              onChange={(ev) => onTerminstatusChange(v.id, ev.target.value as Terminstatus)}
            >
              <option value="festgelegt">Festgelegt</option>
              <option value="teilweise_festgelegt">Teilweise festgelegt</option>
              <option value="offen">Offen</option>
            </select>
          </label>
          <fieldset>
            <legend>Schulen</legend>
            {schulen.map((schule) => (
              <label key={schule.id}>
                <input
                  type="checkbox"
                  aria-label={`Schule ${schule.name} für ${v.titel}`}
                  checked={v.schulIds.includes(schule.id)}
                  onChange={(ev) =>
                    onSchulenChange(v.id, ev.target.checked ? [...v.schulIds, schule.id] : v.schulIds.filter((id) => id !== schule.id))
                  }
                />
                {schule.name}
              </label>
            ))}
          </fieldset>
          {v.termine.map((termin) => (
            <div key={termin.id} className="veranstaltung-termin">
              <input
                type="text"
                value={termin.datum_oder_kw}
                placeholder="YYYY-MM-DD oder YYYY-KWnn"
                onChange={(ev) => onTerminFelderChange(v.id, termin.id, { datum_oder_kw: ev.target.value })}
              />
              <input
                type="number"
                step={5}
                min={0}
                aria-label={`Unterrichtszeit für Termin ${termin.index} in ${v.titel}`}
                value={Math.round(termin.kontaktzeit_h * 60)}
                onChange={(ev) => onTerminFelderChange(v.id, termin.id, { kontaktzeit_h: Number(ev.target.value) / 60 })}
              />
              <select
                aria-label={`Thema für Termin ${termin.index} in ${v.titel}`}
                value={termin.thema ?? ''}
                onChange={(ev) =>
                  onTerminFelderChange(v.id, termin.id, { thema: ev.target.value === '' ? undefined : (ev.target.value as Thema) })
                }
              >
                <option value="">— kein Thema —</option>
                {THEMEN.map((thema) => (
                  <option key={thema} value={thema}>
                    {thema}
                  </option>
                ))}
              </select>
              {v.art === 'exkursion' && (
                <input
                  type="number"
                  step={5}
                  min={0}
                  aria-label={`Organisationspauschale für Termin ${termin.index} in ${v.titel}`}
                  value={Math.round((termin.organisationspauschale_h ?? 2) * 60)}
                  onChange={(ev) => onTerminFelderChange(v.id, termin.id, { organisationspauschale_h: Number(ev.target.value) / 60 })}
                />
              )}
              <label>
                Erstdurchführung:{' '}
                <input
                  type="checkbox"
                  aria-label={`Erstdurchführung für Termin ${termin.index} in ${v.titel}`}
                  checked={termin.erstdurchfuehrung}
                  onChange={(ev) => onTerminFelderChange(v.id, termin.id, { erstdurchfuehrung: ev.target.checked })}
                />
              </label>
              <button onClick={() => onTerminRemove(v.id, termin.id)} aria-label={`Termin ${termin.index} in ${v.titel} löschen`}>
                🗑
              </button>
              <table>
                <thead>
                  <tr>
                    <th>Schule</th>
                    <th>Wir begleiten</th>
                    <th>Begleitpersonen</th>
                    <th>Koordinatoren</th>
                    <th>Koordination (min)</th>
                    <th>Fahrzeit (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {termin.besetzungen.map((besetzung) => (
                    <tr key={besetzung.schulId}>
                      <td>{schulname(besetzung.schulId)}</td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Wir begleiten ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                          checked={besetzung.wir_begleiten}
                          onChange={(ev) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { wir_begleiten: ev.target.checked })}
                        />
                      </td>
                      <td>
                        <PersonenMehrfachauswahl
                          personen={personen}
                          ausgewaehlt={besetzung.begleitperson_ids}
                          disabled={!besetzung.wir_begleiten}
                          onChange={(ids) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { begleitperson_ids: ids })}
                          label={`Begleitpersonen für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                        />
                      </td>
                      <td>
                        <PersonenMehrfachauswahl
                          personen={personen}
                          ausgewaehlt={besetzung.koordinator_ids}
                          onChange={(ids) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { koordinator_ids: ids })}
                          label={`Koordinatoren für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step={5}
                          min={0}
                          aria-label={`Koordinationszeit für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                          value={Math.round(besetzung.koordinationszeit_h * 60)}
                          onChange={(ev) =>
                            onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { koordinationszeit_h: Number(ev.target.value) / 60 })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step={0.25}
                          min={0}
                          aria-label={`Fahrzeit für ${schulname(besetzung.schulId)} bei Termin ${termin.index} in ${v.titel}`}
                          value={besetzung.fahrzeit_h}
                          onChange={(ev) => onBesetzungFelderChange(v.id, termin.id, besetzung.schulId, { fahrzeit_h: Number(ev.target.value) })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <button onClick={() => onTerminAdd(v.id)}>+ Termin hinzufügen</button>
          {v.art === 'themenwoche' && <button onClick={() => onAdd('exkursion', v.schulIds)}>+ Exkursion hinzufügen</button>}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/VeranstaltungenUebersicht.test.tsx
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/VeranstaltungenUebersicht.tsx src/components/VeranstaltungenUebersicht.css src/components/VeranstaltungenUebersicht.test.tsx
git commit -m "feat(berechnungstool): add VeranstaltungenUebersicht editor for Themenwochen/Exkursionen"
```

---

## Task 13: `App.tsx` wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx` (verify only, likely no changes needed)

**Interfaces:**
- Consumes: everything produced in Tasks 6, 11, 12.
- Produces: `App` renders `<VeranstaltungenUebersicht>` wired to `data.veranstaltungen`/`data.schulen`/`data.personen` and the 9 new `useAppData` functions; `SchulenAccordion` receives `onVeranstaltungAdd` instead of computing/passing `themenwochen`.

- [ ] **Step 1: Rewrite `src/App.tsx`**

Replace the whole content of `src/App.tsx`:

```tsx
import { useAppData } from './state/useAppData'
import { AmpelAntwort } from './components/AmpelAntwort'
import { WochenHeatmap } from './components/WochenHeatmap'
import { BedarfAngebotChart } from './components/BedarfAngebotChart'
import { SchulenAccordion } from './components/SchulenAccordion'
import { PersonenTabelle } from './components/PersonenTabelle'
import { PersonenKapazitaetsUebersicht } from './components/PersonenKapazitaetsUebersicht'
import { EngpassBericht } from './components/EngpassBericht'
import { ThemenUebersicht } from './components/ThemenUebersicht'
import { VeranstaltungenUebersicht } from './components/VeranstaltungenUebersicht'
import { PersonenUmverteilung } from './components/PersonenUmverteilung'
import { ExportImport } from './components/ExportImport'

export default function App() {
  const {
    data,
    setPerson,
    addPerson,
    removePerson,
    setPersonUrlaub,
    setEinheitBegleitung,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addReihe,
    removeReihe,
    setReiheTitel,
    setReiheTerminstatus,
    setReiheEinheiten,
    addVeranstaltung,
    removeVeranstaltung,
    setVeranstaltungTitel,
    setVeranstaltungTerminstatus,
    setVeranstaltungSchulen,
    addVeranstaltungTermin,
    removeVeranstaltungTermin,
    setVeranstaltungTerminFelder,
    setSchulBesetzungFelder,
    addPersonenUmverteilung,
    removePersonenUmverteilung,
    ergebnis,
    themenGanttZeilen,
    personenKapazitaet,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  } = useAppData()

  return (
    <main style={{ maxWidth: '75rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Kapazitätsrechner Schulbegleitung</h1>
      <div className="card">
        <PersonenTabelle
          personen={data.personen}
          onChange={setPerson}
          onAdd={addPerson}
          onRemove={removePerson}
          onUrlaubChange={setPersonUrlaub}
        />
      </div>
      <div className="card">
        <PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />
      </div>
      <div className="card">
        <AmpelAntwort machbarkeit={ergebnis.machbarkeit} />
      </div>
      <div className="card">
        <WochenHeatmap wochen={ergebnis.wochen} />
      </div>
      <div className="card">
        <BedarfAngebotChart wochen={ergebnis.wochen} />
      </div>
      <div className="card">
        <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
      </div>
      <div className="card">
        <ThemenUebersicht zeilen={themenGanttZeilen} wochen={ergebnis.wochen} />
      </div>
      <h2>Schulen</h2>
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
        onVeranstaltungAdd={addVeranstaltung}
        ferien={data.kalender.ferien}
      />
      <div className="card">
        <VeranstaltungenUebersicht
          veranstaltungen={data.veranstaltungen}
          schulen={data.schulen}
          personen={data.personen}
          onAdd={addVeranstaltung}
          onRemove={removeVeranstaltung}
          onTitelChange={setVeranstaltungTitel}
          onTerminstatusChange={setVeranstaltungTerminstatus}
          onSchulenChange={setVeranstaltungSchulen}
          onTerminAdd={addVeranstaltungTermin}
          onTerminRemove={removeVeranstaltungTermin}
          onTerminFelderChange={setVeranstaltungTerminFelder}
          onBesetzungFelderChange={setSchulBesetzungFelder}
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
      <div className="card">
        <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} zuruecksetzen={zuruecksetzen} />
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Run `App.test.tsx`**

```bash
npx vitest run src/App.test.tsx
```

Expected: PASS unchanged — `App.test.tsx` only queries for text/roles that still exist identically (`'Kapazitätsrechner Schulbegleitung'`, the WDG Reihe's Titel input, `'+ Termin hinzufügen'`, delete buttons), none of which are affected by this task's changes.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(berechnungstool): wire VeranstaltungenUebersicht and Veranstaltung CRUD into App"
```

---

## Task 14: Abschlussverifikation

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: every test file passes (all of `src/lib/*.test.ts`, `src/state/useAppData.test.ts`, `src/data/data.test.ts`, `src/components/*.test.tsx`, `src/App.test.tsx`).

- [ ] **Step 2: Typecheck and build**

```bash
npm run build
```

Expected: `tsc -b` reports no errors, Vite build succeeds. If there are leftover type errors, they are almost always a stale reference to a removed field (`personen_parallel`, `typ`, `begleitperson_id`, `themenwoche`, `organisationspauschale_h` on `Einheit`, `koordination_h_pro_monat`/`koordination_h_pro_schule_pro_monat`) — grep for the offending identifier and fix it using the same pattern as the task that introduced the equivalent fix elsewhere in this plan.

```bash
grep -rn "personen_parallel\|begleitperson_id[^s]\|themenwoche\b\|koordination_h_pro" src --include="*.ts" --include="*.tsx"
```

Expected: no matches (the only legitimate remaining use of `begleitperson_id` as a substring is `begleitperson_ids`, which the `[^s]` negative-lookahead in the grep above already excludes).

- [ ] **Step 3: Manual browser verification**

```bash
npm run dev
```

Open the printed local URL and check, in order:

1. Under any Schule, click "+ Themenwoche hinzufügen" — a new "Neue Themenwoche" card appears in the "Themenwochen & Exkursionen" section below "Schulen", with that Schule pre-checked.
2. In that new Veranstaltung, check a second Schule, click "+ Termin hinzufügen", and assign a different Begleitperson at each of the two Schulen via the new checkbox multi-selects.
3. Confirm the Bedarf/Angebot chart (`BedarfAngebotChart`) and the Personen-Kapazität grid (`PersonenKapazitaetsUebersicht`) both update, and that the assigned people's remaining capacity visibly drops (not just by Kontaktzeit — compare against `basis` before/after to eyeball that Vorbereitung/Fahrzeit are now deducted too).
4. In any Kurs, click "+ Exkursion hinzufügen" — a new "Neue Exkursion" card appears in the same section, with only that Kurs's Schule checked; confirm it shows the Organisationspauschale field and no Themenwoche-style "+ Exkursion hinzufügen" button of its own.
5. Confirm the "Themenwochen & Exkursionen" section has no more free-text "Themenwoche" column anywhere in any Kurs's Termine table.

No code changes expected from this step — if something looks wrong, treat it as a bug found by manual QA and fix it in a follow-up commit before considering the plan done.

- [ ] **Step 4: Final commit (only if Step 3 required fixes)**

```bash
git add -A
git commit -m "fix(berechnungstool): address issues found during manual verification"
```

If Step 3 required no fixes, skip this step — there is nothing to commit.
