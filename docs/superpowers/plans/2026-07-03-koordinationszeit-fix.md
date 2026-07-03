# Koordinationszeit: Zeitraum-Bindung, Editierbarkeit, Sichtbarkeit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Koordinationszeit-Berechnung so it only applies while a Schule's Reihe is actually running (not year-round), make the per-Schule override editable in the UI, and make Koordination visible as its own line item in the charts/reports instead of being hidden inside the total Bedarf.

**Architecture:** `berechneBedarfProWoche` (src/lib/berechnung.ts) currently returns a single `number` and gates coordination on a time-independent check (`schule.reihen.some(r => r.einheiten.length > 0)`). It becomes a function returning `{ einsatzBedarf, koordinationBedarf }`, gated by a new `berechneReiheZeitraum` helper (src/lib/kalenderwochen.ts) that derives each Reihe's active week-range from its Einheiten. `WochenErgebnis` carries the split forward through `berechneWochenuebersicht` to the UI. A new `setSchuleKoordination` handler in `useAppData.ts` makes the per-Schule override editable via a new column in `SchulenTabelle.tsx`. `BedarfAngebotChart.tsx` and `EngpassBericht.tsx` are updated to display the split.

**Tech Stack:** TypeScript, React 19, Vitest, @testing-library/react, date-fns, Recharts.

## Global Constraints

- Koordination stays independent of `einheit.wir_begleiten` — a Reihe with every Einheit set to `wir_begleiten: false` (Modell X, e.g. Hauptschule Hügelstraße) must still accrue coordination while it is active.
- Only the per-Schule override (`schule.koordination_h_pro_monat`) gets a UI field in this plan. The global default (`settings.koordination_h_pro_schule_pro_monat`) remains JSON-only — no UI field for it in this plan.
- The spec section 9 hand-calculation (KW46/2026 → ~41.4% Auslastung, Grün) must remain correct after all changes.
- Koordination for a Schule is counted once per active week even if multiple of its Reihen are simultaneously active (no double-counting).

---

### Task 1: `berechneReiheZeitraum` helper

**Files:**
- Modify: `src/lib/kalenderwochen.ts`
- Test: `src/lib/kalenderwochen.test.ts`

**Interfaces:**
- Consumes: `parseZuWochenKey(datumOderKw: string): string` (already exists in this file), `Reihe` type from `./types`.
- Produces: `berechneReiheZeitraum(reihe: Reihe): { von: string; bis: string } | null` — used by Task 2.

- [ ] **Step 1: Write the failing tests**

In `src/lib/kalenderwochen.test.ts`, replace the import block (lines 2–10):

```ts
import {
  getISOWochenKey,
  parseZuWochenKey,
  istDatumInFerien,
  istWocheInFerien,
  alleWochenImZeitraum,
  expandiereMuster,
} from './kalenderwochen'
import type { FerienZeitraum, Muster } from './types'
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
} from './kalenderwochen'
import type { FerienZeitraum, Muster, Reihe } from './types'
```

Then append a new `describe` block after the `expandiereMuster` block (after line 84, the file's last line):

```ts
describe('berechneReiheZeitraum', () => {
  const reiheBasis: Reihe = {
    id: 'r1',
    titel: 'x',
    betreuungsmodell: 'A',
    fahrzeit_h: 0,
    status: 'zugesagt',
    extern_betreut: false,
    einheiten: [],
  }

  it('returns null for a Reihe without Einheiten', () => {
    expect(berechneReiheZeitraum(reiheBasis)).toBeNull()
  })

  it('returns the min/max week key across all Einheiten, including across a year boundary', () => {
    const reihe: Reihe = {
      ...reiheBasis,
      einheiten: [
        { id: 'e1', index: 1, datum_oder_kw: '2026-KW46', kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' },
        { id: 'e2', index: 2, datum_oder_kw: '2027-KW05', kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' },
        { id: 'e3', index: 3, datum_oder_kw: '2026-KW48', kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' },
      ],
    }
    expect(berechneReiheZeitraum(reihe)).toEqual({ von: '2026-KW46', bis: '2027-KW05' })
  })

  it('handles a Reihe with a single Einheit (von equals bis)', () => {
    const reihe: Reihe = {
      ...reiheBasis,
      einheiten: [
        { id: 'e1', index: 1, datum_oder_kw: '2026-09-07', kontaktzeit_h: 1, personen_parallel: 1, erstdurchfuehrung: false, wir_begleiten: true, typ: 'regulaer' },
      ],
    }
    expect(berechneReiheZeitraum(reihe)).toEqual({ von: '2026-KW37', bis: '2026-KW37' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: FAIL — `berechneReiheZeitraum is not a function` (or a TypeScript import error, since the function doesn't exist yet).

- [ ] **Step 3: Implement `berechneReiheZeitraum`**

In `src/lib/kalenderwochen.ts`, change the type import on line 2 from:

```ts
import type { FerienZeitraum, Muster, Einheit } from './types'
```

to:

```ts
import type { FerienZeitraum, Muster, Einheit, Reihe } from './types'
```

Then append this function at the end of the file (after `expandiereMuster`):

```ts

export function berechneReiheZeitraum(reihe: Reihe): { von: string; bis: string } | null {
  if (reihe.einheiten.length === 0) return null
  const wochenKeys = reihe.einheiten.map((e) => parseZuWochenKey(e.datum_oder_kw))
  return {
    von: wochenKeys.reduce((kleinstes, key) => (key < kleinstes ? key : kleinstes)),
    bis: wochenKeys.reduce((groesstes, key) => (key > groesstes ? key : groesstes)),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kalenderwochen.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kalenderwochen.ts src/lib/kalenderwochen.test.ts
git commit -m "feat(berechnungstool): add berechneReiheZeitraum to derive a Reihe's active week range"
```

---

### Task 2: Gate Koordination to a Reihe's active window, split Einsatz/Koordination

**Files:**
- Modify: `src/lib/berechnung.ts`
- Test: `src/lib/berechnung.test.ts`

**Interfaces:**
- Consumes: `berechneReiheZeitraum(reihe: Reihe): { von: string; bis: string } | null` (Task 1).
- Produces: `berechneBedarfProWoche(data, wochenKey, istFerien): { einsatzBedarf: number; koordinationBedarf: number }` (changed return type — was `number`); `WochenErgebnis` gains `einsatzBedarf: number` and `koordinationBedarf: number` fields, used by Task 4/5/6 and by `szenario.ts`/`restkapazitaet.ts` (no changes needed there, they only pass `WochenErgebnis[]` through).

- [ ] **Step 1: Update `berechnung.test.ts` to express the new behavior (this makes several existing assertions fail and adds new ones)**

Replace the 6 dummy schools' and Hügelstraße's Einheit dates in the `berechneBedarfProWoche` hand-calculation test (currently `'2026-KW10'` on lines 113 and 129) with `'2026-KW46'`, and update the closing comment + assertion. Replace this block (lines 102–144):

```ts
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `schule_${i}`,
          name: `Schule ${i}`,
          reihen: [
            {
              id: `r_${i}`,
              titel: 'laufende Reihe',
              betreuungsmodell: 'C' as const,
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false,
              einheiten: [einheit({ id: `e_${i}`, datum_oder_kw: '2026-KW10', wir_begleiten: false })],
            },
          ],
        })),
        {
          id: 'huegelstrasse',
          name: 'HS Hügelstraße',
          koordination_h_pro_monat: 0.5,
          reihen: [
            {
              id: 'r_huegel',
              titel: 'laufend',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true,
              einheiten: [einheit({ id: 'e_huegel', datum_oder_kw: '2026-KW10', wir_begleiten: false })],
            },
          ],
        },
      ],
    }

    // 8 Schulen bei Koordination-Default (WDG, Sedanstraße, 6 Füll-Schulen) + Hügelstraße reduziert:
    // Koordination = (8*1.5 + 0.5) / 4.33 = 2.887h. Aufwand WDG 8.0h + Sedanstraße 2.375h.
    // Gesamt = 8.0 + 2.375 + 2.887 = 13.262h — matches spec section 9 exactly.
    // NOTE: koordination is charged per Schule that has any Einheit anywhere (not gated to
    // this exact wochenKey) — see the corrected berechneBedarfProWoche in Step 3 below. The
    // 6 dummy schools and Hügelstraße only have Einheiten dated 2026-KW10, not 2026-KW46,
    // to specifically exercise this "coordination doesn't require an Einheit this week" rule.
    expect(berechneBedarfProWoche(data, '2026-KW46', false)).toBeCloseTo(13.26, 1)
  })
```

with:

```ts
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `schule_${i}`,
          name: `Schule ${i}`,
          reihen: [
            {
              id: `r_${i}`,
              titel: 'laufende Reihe',
              betreuungsmodell: 'C' as const,
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false,
              einheiten: [einheit({ id: `e_${i}`, datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        })),
        {
          id: 'huegelstrasse',
          name: 'HS Hügelstraße',
          koordination_h_pro_monat: 0.5,
          reihen: [
            {
              id: 'r_huegel',
              titel: 'laufend',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true,
              einheiten: [einheit({ id: 'e_huegel', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }

    // 8 Schulen bei Koordination-Default (WDG, Sedanstraße, 6 Füll-Schulen) + Hügelstraße reduziert:
    // Koordination = (8*1.5 + 0.5) / 4.33 = 2.887h. Aufwand WDG 8.0h + Sedanstraße 2.375h.
    // Gesamt = 8.0 + 2.375 + 2.887 = 13.262h — matches spec section 9 exactly.
    // All 8 Schulen have an Einheit dated 2026-KW46, so their Reihe is active that week —
    // coordination is gated to a Reihe's active date range, not charged year-round.
    const { einsatzBedarf, koordinationBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    expect(einsatzBedarf + koordinationBedarf).toBeCloseTo(13.26, 1)
  })

  it('excludes a Schule\'s coordination before its Reihe has started or after it has ended', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          reihen: [
            {
              id: 'r1',
              titel: 'x',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false,
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2027-KW10', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
    expect(berechneBedarfProWoche(data, '2027-KW10', false).koordinationBedarf).toBeCloseTo(1.5 / 4.33, 5)
  })

  it('still charges coordination for a Modell-X Schule with wir_begleiten always false, while its Reihe is active', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 'huegel',
          name: 'Hügelstraße',
          koordination_h_pro_monat: 0.5,
          reihen: [
            {
              id: 'r_huegel',
              titel: 'x',
              betreuungsmodell: 'X',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: true,
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    const { einsatzBedarf, koordinationBedarf } = berechneBedarfProWoche(data, '2026-KW46', false)
    expect(einsatzBedarf).toBe(0)
    expect(koordinationBedarf).toBeCloseTo(0.5 / 4.33, 5)
  })

  it('counts a Schule\'s coordination only once even when multiple Reihen are simultaneously active', () => {
    const data: Datenbestand = {
      settings,
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Schule 1',
          reihen: [
            {
              id: 'r1',
              titel: 'a',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false,
              einheiten: [einheit({ id: 'e1', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
            {
              id: 'r2',
              titel: 'b',
              betreuungsmodell: 'C',
              fahrzeit_h: 0,
              status: 'zugesagt',
              extern_betreut: false,
              einheiten: [einheit({ id: 'e2', datum_oder_kw: '2026-KW46', wir_begleiten: false })],
            },
          ],
        },
      ],
    }
    expect(berechneBedarfProWoche(data, '2026-KW46', false).koordinationBedarf).toBeCloseTo(1.5 / 4.33, 5)
  })
```

Also update the Ferienwoche test's assertion (line 170), replacing:

```ts
    expect(berechneBedarfProWoche(data, '2026-KW46', true)).toBe(0)
```

with:

```ts
    expect(berechneBedarfProWoche(data, '2026-KW46', true)).toEqual({ einsatzBedarf: 0, koordinationBedarf: 0 })
```

Also update the `berechneWochenuebersicht` "reproduces 41% Grün" test — after the existing line `expect(wochen[0].ampel).toBe('gruen')` (line 300), add:

```ts
    expect(wochen[0].bedarf).toBeCloseTo(wochen[0].einsatzBedarf + wochen[0].koordinationBedarf, 10)
```

Also update the `berechneMachbarkeit` describe block's `basis` object (lines 305–312), replacing:

```ts
  const basis: import('./berechnung').WochenErgebnis = {
    wochenKey: '2026-KW01',
    bedarf: 0,
    angebot: 32,
    auslastung: 0,
    ampel: 'gruen',
    istFerien: false,
  }
```

with:

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
  }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: FAIL — the hand-calculation test fails because `einsatzBedarf`/`koordinationBedarf` are `undefined` on the current `number` return value (`undefined + undefined` is `NaN`, not close to 13.26); the three new tests fail because coordination is still charged for schools outside their Reihe's active window.

- [ ] **Step 3: Implement the split and the time-window gating**

In `src/lib/berechnung.ts`, add `berechneReiheZeitraum` to the import from `./kalenderwochen` on line 2:

```ts
import { parseZuWochenKey, alleWochenImZeitraum, istWocheInFerien, getISOWochenKey, berechneReiheZeitraum } from './kalenderwochen'
```

Replace the `berechneBedarfProWoche` function (lines 19–38):

```ts
export function berechneBedarfProWoche(data: Datenbestand, wochenKey: string, istFerien: boolean): number {
  if (istFerien) return 0

  let bedarf = 0
  for (const schule of data.schulen) {
    const hatReihenMitEinheiten = schule.reihen.some((r) => r.einheiten.length > 0)
    for (const reihe of schule.reihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        if (einheit.wir_begleiten) {
          bedarf += berechneAufwandEinheit(einheit, reihe.fahrzeit_h, data.settings)
        }
      }
    }
    if (hatReihenMitEinheiten) {
      bedarf += berechneKoordinationWoche(schule, data.settings)
    }
  }
  return bedarf
}
```

with:

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
}
```

Replace the `WochenErgebnis` interface (lines 66–73):

```ts
export interface WochenErgebnis {
  wochenKey: string
  bedarf: number
  angebot: number
  auslastung: number
  ampel: AmpelFarbe
  istFerien: boolean
}
```

with:

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
}
```

Replace the body of `berechneWochenuebersicht` (lines 75–85):

```ts
export function berechneWochenuebersicht(data: Datenbestand): WochenErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  return wochenStarts.map((montag) => {
    const wochenKey = getISOWochenKey(montag)
    const istFerien = istWocheInFerien(montag, data.kalender.ferien)
    const bedarf = berechneBedarfProWoche(data, wochenKey, istFerien)
    const angebot = berechneAngebotProWoche(data.personen, montag)
    const auslastung = angebot === 0 ? 0 : bedarf / angebot
    return { wochenKey, bedarf, angebot, auslastung, ampel: ampelFarbe(auslastung, data.settings), istFerien }
  })
}
```

with:

```ts
export function berechneWochenuebersicht(data: Datenbestand): WochenErgebnis[] {
  const wochenStarts = alleWochenImZeitraum(data.settings.planungszeitraum.start, data.settings.planungszeitraum.ende)
  return wochenStarts.map((montag) => {
    const wochenKey = getISOWochenKey(montag)
    const istFerien = istWocheInFerien(montag, data.kalender.ferien)
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
    }
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: PASS (all tests, including the 3 new ones and the updated hand-calculation/ferien/basis assertions).

- [ ] **Step 5: Run the full test suite to catch any other consumer of the old signature**

Run: `npx vitest run`
Expected: PASS. (`szenario.test.ts`, `restkapazitaet.test.ts`, and `App.test.tsx` only consume `WochenErgebnis[]`/`berechneWochenuebersicht` as a whole and don't construct `WochenErgebnis` literals themselves, so they should be unaffected — but this step confirms it.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/berechnung.ts src/lib/berechnung.test.ts
git commit -m "fix(berechnungstool): gate Koordinationszeit to a Reihe's active window and split it out of Bedarf"
```

---

### Task 3: `setSchuleKoordination` handler

**Files:**
- Modify: `src/state/useAppData.ts`
- Test: `src/state/useAppData.test.ts`

**Interfaces:**
- Consumes: `Datenbestand.schulen` (existing), `useState` setter pattern already used by `setPerson`.
- Produces: `setSchuleKoordination(schuleId: string, wert: number): void`, returned from `useAppData()` — consumed by Task 4 (`App.tsx` → `SchulenTabelle`).

- [ ] **Step 1: Write the failing test**

Add to `src/state/useAppData.test.ts`, after the `setEinheitBegleitung` test (after line 34, before the `setSzenario` test):

```ts
  it('setSchuleKoordination updates a Schule\'s coordination override and leaves other Schulen unchanged', () => {
    const { result } = renderHook(() => useAppData())
    const vorherWdg = result.current.data.schulen.find((s) => s.id === 'wdg')!.koordination_h_pro_monat
    act(() => {
      result.current.setSchuleKoordination('huegelstrasse', 2)
    })
    const huegelstrasse = result.current.data.schulen.find((s) => s.id === 'huegelstrasse')!
    const wdg = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(huegelstrasse.koordination_h_pro_monat).toBe(2)
    expect(wdg.koordination_h_pro_monat).toBe(vorherWdg)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: FAIL — `result.current.setSchuleKoordination is not a function`.

- [ ] **Step 3: Implement `setSchuleKoordination`**

In `src/state/useAppData.ts`, add this function after `setEinheitBegleitung` (after line 37):

```ts

  function setSchuleKoordination(schuleId: string, wert: number) {
    setData((prev) => ({
      ...prev,
      schulen: prev.schulen.map((schule) => (schule.id === schuleId ? { ...schule, koordination_h_pro_monat: wert } : schule)),
    }))
  }
```

Add `setSchuleKoordination` to the returned object (in the `return { ... }` block, after `setEinheitBegleitung,`):

```ts
  return {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/state/useAppData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts
git commit -m "feat(berechnungstool): add setSchuleKoordination handler"
```

---

### Task 4: Editable Koordination column in `SchulenTabelle`

**Files:**
- Modify: `src/components/SchulenTabelle.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/SchulenTabelle.test.tsx` (new)

**Interfaces:**
- Consumes: `setSchuleKoordination(schuleId: string, wert: number): void` (Task 3).
- Produces: `SchulenTabelle` now requires two additional props: `settings: Settings` and `onKoordinationChange: (schuleId: string, wert: number) => void`.

- [ ] **Step 1: Write the failing test**

Create `src/components/SchulenTabelle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchulenTabelle } from './SchulenTabelle'
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
      { id: 'r1', titel: 'Reihe Eins', betreuungsmodell: 'A', fahrzeit_h: 1, status: 'zugesagt', extern_betreut: false, einheiten: [] },
    ],
  },
  {
    id: 's2',
    name: 'Schule Zwei',
    koordination_h_pro_monat: 0.5,
    reihen: [
      { id: 'r2', titel: 'Reihe Zwei', betreuungsmodell: 'X', fahrzeit_h: 0, status: 'zugesagt', extern_betreut: true, einheiten: [] },
    ],
  },
]

describe('SchulenTabelle', () => {
  it('shows the global default coordination value when a Schule has no override', () => {
    render(<SchulenTabelle schulen={schulen} settings={settings} onKoordinationChange={vi.fn()} />)
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[0].value).toBe('1.5')
  })

  it('shows the per-Schule override when present', () => {
    render(<SchulenTabelle schulen={schulen} settings={settings} onKoordinationChange={vi.fn()} />)
    const eingaben = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(eingaben[1].value).toBe('0.5')
  })

  it('calls onKoordinationChange with the Schule id and the new value when edited', () => {
    const onKoordinationChange = vi.fn()
    render(<SchulenTabelle schulen={schulen} settings={settings} onKoordinationChange={onKoordinationChange} />)
    const eingaben = screen.getAllByRole('spinbutton')
    fireEvent.change(eingaben[0], { target: { value: '2' } })
    expect(onKoordinationChange).toHaveBeenCalledWith('s1', 2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/SchulenTabelle.test.tsx`
Expected: FAIL — TypeScript error / runtime error because `SchulenTabelle` doesn't accept `settings`/`onKoordinationChange` props yet and renders no `spinbutton` role elements.

- [ ] **Step 3: Implement the editable column**

Replace the full contents of `src/components/SchulenTabelle.tsx`:

```tsx
import { berechneUnserAnteil } from '../lib/besetzung'
import type { Schule, Settings } from '../lib/types'

export function SchulenTabelle({
  schulen,
  settings,
  onKoordinationChange,
}: {
  schulen: Schule[]
  settings: Settings
  onKoordinationChange: (schuleId: string, wert: number) => void
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Schule</th>
          <th>Reihe</th>
          <th>Modell</th>
          <th>Status</th>
          <th>Unser Anteil</th>
          <th>Koordination h/Monat</th>
        </tr>
      </thead>
      <tbody>
        {schulen.flatMap((schule) =>
          schule.reihen.map((reihe) => {
            const anteil = berechneUnserAnteil(reihe.einheiten)
            return (
              <tr key={reihe.id}>
                <td>{schule.name}</td>
                <td>{reihe.titel}</td>
                <td>{reihe.betreuungsmodell}</td>
                <td>{reihe.status}</td>
                <td>
                  {anteil.anzahl} von {anteil.gesamt} ({Math.round(anteil.anteil * 100)}%)
                </td>
                <td>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    value={schule.koordination_h_pro_monat ?? settings.koordination_h_pro_schule_pro_monat}
                    onChange={(e) => onKoordinationChange(schule.id, Number(e.target.value))}
                    style={{ width: '4rem' }}
                  />
                </td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
```

Then wire it up in `src/App.tsx`: add `setSchuleKoordination` to the destructured hook result (line 15-27), changing:

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

to:

```ts
  const {
    data,
    setPerson,
    setEinheitBegleitung,
    setSchuleKoordination,
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

And change the `<SchulenTabelle>` usage (line 51) from:

```tsx
      <SchulenTabelle schulen={data.schulen} />
```

to:

```tsx
      <SchulenTabelle schulen={data.schulen} settings={data.settings} onKoordinationChange={setSchuleKoordination} />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/SchulenTabelle.test.tsx src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SchulenTabelle.tsx src/components/SchulenTabelle.test.tsx src/App.tsx
git commit -m "feat(berechnungstool): make per-Schule Koordinationszeit editable in the UI"
```

---

### Task 5: Stacked Einsatz/Koordination bars in `BedarfAngebotChart`

**Files:**
- Modify: `src/components/BedarfAngebotChart.tsx`

**Interfaces:**
- Consumes: `WochenErgebnis.einsatzBedarf`, `WochenErgebnis.koordinationBedarf` (Task 2).
- Produces: no new exports; visual-only change, verified manually (this project has no existing Recharts component tests — `ResponsiveContainer` needs real layout dimensions that jsdom doesn't provide, so a rendering test would be unreliable here, consistent with there being no test file for this component today).

- [ ] **Step 1: Implement the stacked bars**

Replace the full contents of `src/components/BedarfAngebotChart.tsx`:

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { WochenErgebnis } from '../lib/berechnung'
import type { Settings } from '../lib/types'

export function BedarfAngebotChart({ wochen, settings }: { wochen: WochenErgebnis[]; settings: Settings }) {
  const chartData = wochen.map((w) => ({
    wochenKey: w.wochenKey,
    Einsatz: Number(w.einsatzBedarf.toFixed(2)),
    Koordination: Number(w.koordinationBedarf.toFixed(2)),
    Angebot: Number(w.angebot.toFixed(2)),
    Warnschwelle: Number((w.angebot * settings.schwellwert_warnung).toFixed(2)),
    Kritischeschwelle: Number((w.angebot * settings.schwellwert_kritisch).toFixed(2)),
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <XAxis dataKey="wochenKey" hide />
        <YAxis />
        <Tooltip />
        <Bar dataKey="Angebot" fill="#a5d6a7" />
        <Bar dataKey="Einsatz" stackId="bedarf" fill="#1976d2" />
        <Bar dataKey="Koordination" stackId="bedarf" fill="#64b5f6" />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Manually verify in the browser**

Run: `npm run dev`

Open the shown localhost URL, and confirm the Bedarf/Angebot chart now shows two stacked blue shades (dark = Einsatz, light = Koordination) making up the total Bedarf bar, and that hovering a bar shows both values in the tooltip alongside Angebot.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/BedarfAngebotChart.tsx
git commit -m "feat(berechnungstool): show Einsatz vs Koordination as a stacked bar"
```

---

### Task 6: Einsatz/Koordination breakdown in `EngpassBericht`

**Files:**
- Modify: `src/components/EngpassBericht.tsx`
- Test: `src/components/EngpassBericht.test.tsx` (new)

**Interfaces:**
- Consumes: `WochenErgebnis.einsatzBedarf`, `WochenErgebnis.koordinationBedarf` (Task 2).
- Produces: no new exports; text-content change only.

- [ ] **Step 1: Write the failing test**

Create `src/components/EngpassBericht.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EngpassBericht } from './EngpassBericht'
import type { WochenErgebnis } from '../lib/berechnung'

const woche = (overrides: Partial<WochenErgebnis> = {}): WochenErgebnis => ({
  wochenKey: '2026-KW46',
  bedarf: 13.26,
  einsatzBedarf: 10.375,
  koordinationBedarf: 2.887,
  angebot: 32,
  auslastung: 0.414,
  ampel: 'gruen',
  istFerien: false,
  ...overrides,
})

describe('EngpassBericht', () => {
  it('breaks down Bedarf into Einsatz and Koordination for each top Engpass', () => {
    render(<EngpassBericht topEngpaesse={[woche()]} />)
    expect(
      screen.getByText(/13\.3h Bedarf \(10\.4h Einsatz \+ 2\.9h Koordination\) \/ 32h Angebot/)
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/EngpassBericht.test.tsx`
Expected: FAIL — the current text has no "Einsatz"/"Koordination" breakdown.

- [ ] **Step 3: Implement the breakdown text**

Replace the full contents of `src/components/EngpassBericht.tsx`:

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
            {Math.round(w.einsatzBedarf * 10) / 10}h Einsatz + {Math.round(w.koordinationBedarf * 10) / 10}h
            Koordination) / {Math.round(w.angebot * 10) / 10}h Angebot)
          </li>
        ))}
      </ol>
      <p>
        Entlastungsoptionen: Einheiten von Modell A auf B herabstufen, Einheit in Nachbarwoche verschieben, oder
        <code>personen_parallel</code> reduzieren.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/EngpassBericht.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all tests across the project).

- [ ] **Step 6: Commit**

```bash
git add src/components/EngpassBericht.tsx src/components/EngpassBericht.test.tsx
git commit -m "feat(berechnungstool): break Bedarf down into Einsatz and Koordination in the Engpass-Bericht"
```

---

## Final Verification

- [ ] Run `npx vitest run` — all tests across the project pass.
- [ ] Run `npm run build` — TypeScript compiles cleanly (`tsc -b`) and Vite build succeeds.
- [ ] Run `npm run dev`, open the app, uncheck all "wir begleiten" boxes for a Reihe (e.g. WDG) whose date range doesn't overlap any other active Reihe, and confirm the corresponding weeks' Bedarf in the chart tooltip drops to 0 once that Reihe's own coordination window is also outside the visible weeks — and confirm the Koordination override input in the Schulentabelle changes the numbers live.
