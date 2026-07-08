# Berechnungstool: Ferien-Funktion für Personen & Entfernen der Kapazitäts-Umverteilung

## Context

Two related gaps/leftovers:

1. `Person.abwesenheiten` (day-based absences) already exists and already reduces a person's weekly capacity via `berechnePersonKapazitaetsbasis`, but there is no comparable way to mark a person as on **Ferien** (vacation), and no UI exists to edit `abwesenheiten` or any new equivalent at all — both are only reachable via raw JSON import today.
2. The original `Kapazitäts-Umverteilung` feature (aggregate: move unused Ferien-week capacity from the org-wide pool into a high-demand week) predates the later, more granular `PersonenUmverteilung` (per-person redistribution, any week, not just Ferien weeks — see `2026-07-07-berechnungstool-personen-kapazitaeten-design.md`). `PersonenUmverteilung` is strictly more general and fully supersedes it. The aggregate feature is now dead weight and should be removed, which simplifies `WochenErgebnis` at the same time.

These are bundled because both touch `berechnePersonKapazitaetsbasis` / `WochenErgebnis` and are easiest to verify together (adding a capacity-reducing input while removing a capacity-adjusting output).

## 1. Data model (`src/lib/types.ts`)

Add to `Person`, reusing the existing `FerienZeitraum` shape (`{ name, von, bis }`, already used for `Kalender.ferien`):

```ts
export interface Person {
  // ...existing fields unchanged...
  ferien: FerienZeitraum[]
}
```

Remove:

```ts
export interface Umverteilung { ... }          // deleted
// Datenbestand.umverteilungen?: Umverteilung[] // deleted
```

## 2. Capacity calculation (`src/lib/berechnung.ts`)

`berechnePersonKapazitaetsbasis(person, wochenStartMontag)`: extend the weekday-off count to include days covered by `person.ferien`, not just `person.abwesenheiten`. Dedupe so a day covered by both an Abwesenheit and a Ferien entry only counts once:

```ts
const abwesendeTage = wochentage.filter((tag) =>
  person.abwesenheiten.some((a) => tag >= parseISO(a.von) && tag <= parseISO(a.bis)) ||
  person.ferien.some((f) => tag >= parseISO(f.von) && tag <= parseISO(f.bis))
).length
```

Same `abzugsfaktor = min(1, abwesendeTage * 0.2)` formula — no new math, just a bigger "days off" input. This automatically flows through to `berechneAngebotProWoche` (aggregate `Angebot`) and `berechnePersonenKapazitaet` (per-person `basis`), since both already call this function.

Remove entirely (superseded by `PersonenUmverteilung` / `berechneVerbleibendePersonenstunden`):
- `berechneZusatzangebotProWoche`
- `berechneAbgezogenesFerienangebotProWoche`
- `berechneVerbleibendeFerienstunden`

Simplify `WochenErgebnis`: drop `angebotBasis`, `zusatzangebot`, `abgezogenesFerienangebot` — collapse to a single `angebot` field (sum of `berechnePersonKapazitaetsbasis` across all Personen; identical to today's `angebotBasis`, since the aggregate redistribution terms disappear). `berechneWochenuebersicht` computes `angebot` directly instead of the current `angebotBasis`/`zusatzangebot`/`abgezogenesFerienangebot` chain.

## 3. UI — Ferien input (`src/components/PersonenTabelle.tsx`)

Add a "Ferien" column per Person row: a compact inline list of existing entries, each showing `Name` (text input), `Von`/`Bis` (date inputs), and a 🗑 delete button, plus a "+ Ferienzeitraum" button below the list — same interaction pattern as the Termine table in `ReihenEditor.tsx` (add/edit/remove rows inline, no modal).

New `useAppData.ts` function, mirroring how `abwesenheiten` would be patched:

```ts
function setPersonFerien(personId: string, ferien: FerienZeitraum[]) 
```

(Simplest shape: replace the whole array on every add/edit/remove, same pattern as `setReiheEinheiten`.) `PersonenTabelle` gets a new `onFerienChange: (personId: string, ferien: FerienZeitraum[]) => void` prop.

`addPerson()` in `useAppData.ts` initializes `ferien: []` on new Personen.

`migriereDatenbestand` in `useAppData.ts` backfills `ferien: person.ferien ?? []` for Personen loaded from old saved data / imports that predate this field. Old stored/imported data may still contain an `umverteilungen` key from before this removal; since it's no longer part of the `Datenbestand` type, it's simply ignored by every reader — no explicit strip-out step is needed.

## 4. Removing Kapazitäts-Umverteilung

- Delete `src/components/KapazitaetsUmverteilung.tsx` and `KapazitaetsUmverteilung.test.tsx`.
- `useAppData.ts`: remove `addUmverteilung`, `removeUmverteilung`, and the `ermittleQuelleWochenKeyFuerFerienname` / `umverteilungen` migration backfill in `migriereDatenbestand`.
- `App.tsx`: remove the `KapazitaetsUmverteilung` import and its card.
- `src/components/BedarfAngebotChart.tsx`: drop the `'Ferien-Abzug'` bar/dataKey and its legend entry; update the `Angebot` legend label from "Angebot nach Ferien-Abzug und Umverteilung" to "Angebot (Personen-Kapazität)".
- Any test fixtures across the codebase that construct a `WochenErgebnis` object (`EngpassBericht.test.tsx`, `ThemenUebersicht.test.tsx`, `themenUebersicht.test.ts`, `berechnung.test.ts`, etc.) drop the three removed fields.

## Testing

- `berechnung.test.ts`: `berechnePersonKapazitaetsbasis` reduces capacity for weekdays covered by `Person.ferien`; a day covered by both `abwesenheiten` and `ferien` counts once (not double-deducted); `berechneWochenuebersicht`'s `angebot` reflects a person's Ferien.
- `personenKapazitaet.test.ts`: a person's `basis` drops during their own Ferien period, independent of the school `Kalender.ferien` calendar.
- `PersonenTabelle.test.tsx`: add/edit/remove a Ferien entry calls `onFerienChange` with the updated array; renders existing entries.
- `useAppData.test.ts`: `setPersonFerien` updates the right Person; `addPerson` seeds `ferien: []`; migration backfills `ferien: []` for old data; `addUmverteilung`/`removeUmverteilung` and their tests are deleted; confirm import of old JSON containing a stray `umverteilungen` key doesn't error (it's just ignored).
- Delete `KapazitaetsUmverteilung.test.tsx`. Update `BedarfAngebotChart.test.tsx` (if it asserts on the removed bar/legend text) and any other test referencing the removed `WochenErgebnis` fields or `Umverteilung` type.
- Run full `npm test` and `npm run build` before considering this done; visually verify in the browser that `PersonenTabelle` Ferien UI works and the `Kapazitäts-Umverteilung` card is gone with no layout regression.

## Out of scope

No change to `Abwesenheiten` (still JSON-only, not addressed here). No change to `PersonenUmverteilung`, `PersonenKapazitaetsUebersicht`, or Begleitperson assignment. No change to Besetzungs-Presets or the Schulen restructuring (separate item).
