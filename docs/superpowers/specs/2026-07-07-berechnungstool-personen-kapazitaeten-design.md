# Berechnungstool: Personen-Kapazitäten, Begleitperson-Zuweisung & Umverteilung

## Context

Currently the app tracks capacity only in aggregate: `berechneAngebotProWoche` sums every Person's `stunden_pro_woche_fuer_begleitung` (adjusted for absences) into one weekly total, with no record of which specific Person does which Termin. `Einheit.wir_begleiten` is a plain boolean ("do we accompany this session") that gates whether the session's effort counts in the org-wide `Bedarf`. There is no way to see whether a *specific* Person is overbooked in a given week even when the aggregate looks fine, and the existing `Kapazitäts-Umverteilung` feature only moves unused Ferien-week capacity into the aggregate pool — it has no concept of a person.

This feature adds a **separate, additive layer**: assigning a specific Person as "Begleitperson" to a Termin, tracking each Person's own weekly capacity (base − assignments ± their own redistributions), and a new overview grid to see it at a glance. **The existing aggregate Bedarf/Angebot/Ampel calculation does not change** — this is new visibility, not a replacement.

## 1. Data model (`src/lib/types.ts`)

`Einheit.wir_begleiten: boolean` is untouched — it keeps gating `berechneBedarfProWoche`'s `einsatzBedarf` exactly as today, and the existing Besetzungs-Presets (`wendeBesetzungPreset` in `src/lib/besetzung.ts`) keep working unmodified.

Add a new, independent field:

```ts
export interface Einheit {
  // ...existing fields unchanged...
  begleitperson_id?: string | null
}
```

`begleitperson_id` only has meaning when `wir_begleiten` is `true`. It identifies which `Person.id` accompanies this Termin, for the new per-person capacity layer only.

Add a new redistribution type, separate from the existing `Umverteilung` (which stays as-is, moving Ferien-week slack into the aggregate pool):

```ts
export interface PersonenUmverteilung {
  id: string
  personId: string
  quelleWochenKey: string
  zielWochenKey: string
  stunden: number
}
```

Add to `Datenbestand`:

```ts
export interface Datenbestand {
  // ...existing fields unchanged...
  personenUmverteilungen?: PersonenUmverteilung[]
}
```

## 2. Begleitperson assignment (`ReihenEditor.tsx`, `SchuleAkkordionItem.tsx`, `SchulenAccordion.tsx`)

Add a "Begleitperson" column to the Termin table, immediately after "Wir begleiten". It's a `<select>` populated from the Personen list (`— niemand —` plus each `Person.name`), disabled whenever that row's `wir_begleiten` is `false`. Selecting a value calls `onEinheitFelderChange(e.id, { begleitperson_id: value || null })`.

`personen: Person[]` is threaded down through the existing prop-drilling path: `App.tsx` → `SchulenAccordion` → `SchuleAkkordionItem` → `ReihenEditor`, the same way `ferien` and `settings` already are.

When the "Wir begleiten" checkbox is toggled off, `begleitperson_id` is cleared back to `null` in the same state update (there's no one to deduct capacity from if the Termin isn't accompanied). `setEinheitBegleitung` in `useAppData.ts` is extended to do this.

`setEinheitFelder`'s patch type gains `begleitperson_id?: string | null`.

## 3. Per-person capacity calculation (new `src/lib/personenKapazitaet.ts`)

Extract the absence/`abzugsfaktor` logic currently inline in `berechneAngebotProWoche` (`berechnung.ts:49-65`) into a shared helper:

```ts
export function berechnePersonKapazitaetsbasis(person: Person, wochenStartMontag: Date): number
```

Same computation as today (weekday count in the ISO week, overlap with `person.abwesenheiten`, `abzugsfaktor = min(1, abwesendeTage * 0.2)`, returns `stunden_pro_woche_fuer_begleitung * (1 - abzugsfaktor)`), just factored out so both `berechneAngebotProWoche` (unchanged behavior) and the new per-person calculation reuse it — no behavior change to the aggregate.

New types and function:

```ts
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

export function berechnePersonenKapazitaet(
  data: Datenbestand,
  wochen: WochenErgebnis[]
): PersonKapazitaetsErgebnis[]
```

Per Person, per week (using the same week list as `wochen`, i.e. `alleWochenImZeitraum`):
- `basis` = `berechnePersonKapazitaetsbasis(person, wochenStartMontag)`.
- `umverteilt` = sum of `stunden` from that person's `PersonenUmverteilung` entries where `zielWochenKey` matches, minus sum where `quelleWochenKey` matches.
- `zugewiesen` = sum of `kontaktzeit_h` across all Einheiten (in Reihen where `terminstatus !== 'offen'`, matching how `berechneBedarfProWoche` already filters) where `begleitperson_id === person.id` and the Einheit's resolved week matches.
- `verbleibend` = `basis + umverteilt - zugewiesen`.

Add a cap helper mirroring `berechneVerbleibendeFerienstunden`:

```ts
export function berechneVerbleibendePersonenstunden(
  personenKapazitaet: PersonKapazitaetsErgebnis[],
  umverteilungen: PersonenUmverteilung[],
  personId: string,
  quelleWochenKey: string
): number
```

Returns that `(personId, quelleWochenKey)`'s current `verbleibend` (found via `berechnePersonenKapazitaet`), floored at 0. `verbleibend` is already net of that person's existing assignments *and* any redistributions already moved out of that week (via the `umverteilt` term), so this is the amount still safe to move out — no further subtraction needed. This means a redistribution can't move hours that are already committed to a Begleitperson assignment in the source week.

## 4. New components

**`PersonenKapazitaetsUebersicht.tsx`** — grid, same visual pattern as `WochenHeatmap`/`ThemenUebersicht` (reuses `kwNummer` for column headers): one row per Person (label = name), one column per week, cell = that person's `verbleibend` for the week, rounded to 1 decimal, with a green background if `>= 0` and red if `< 0`. Props: `{ personenKapazitaet: PersonKapazitaetsErgebnis[] }`.

**`PersonenUmverteilung.tsx`** — form with a Person `<select>`, Quell-Woche `<select>` (options show remaining hours via `berechneVerbleibendePersonenstunden`, disabled once exhausted, same UX pattern as the existing `KapazitaetsUmverteilung`'s Quell-Woche dropdown), Ziel-Woche `<select>`, Stunden `<input type="number">`, and a "Hinzufügen" button; below it, a list of existing `PersonenUmverteilung` entries (`"{stunden} Std von {Person} aus {Quell-Woche} → {Ziel-Woche}"`) each with a delete button. Props: `{ personen: Person[], personenKapazitaet: PersonKapazitaetsErgebnis[], personenUmverteilungen: PersonenUmverteilung[], onAdd, onRemove }`.

## 5. Wiring (`useAppData.ts`, `App.tsx`)

- `addPersonenUmverteilung(personId, quelleWochenKey, zielWochenKey, stunden)` / `removePersonenUmverteilung(id)` — mirror `addUmverteilung`/`removeUmverteilung`.
- `personenKapazitaet` computed via `useMemo(() => berechnePersonenKapazitaet(data, ergebnis.wochen), [data, ergebnis.wochen])`, returned from the hook.
- `removePerson(id)`: in the same update, clear `begleitperson_id` to `null` on every Einheit across all Schulen/Reihen where it equals the deleted person's id, and filter out any `PersonenUmverteilung` entries with that `personId` — no confirmation prompt, matching the app's existing no-confirmation delete pattern (e.g. Termin/Umverteilung deletion).
- `App.tsx` renders `PersonenKapazitaetsUebersicht` and `PersonenUmverteilung` as new cards; placement: `PersonenKapazitaetsUebersicht` directly under the existing `PersonenTabelle` card (capacity overview belongs next to where capacities are entered), `PersonenUmverteilung` directly under the existing `KapazitaetsUmverteilung` card (keeps both redistribution features adjacent).

## Testing

- `personenKapazitaet.test.ts`: `berechnePersonKapazitaetsbasis` (absence adjustment, matches existing aggregate behavior byte-for-byte), `berechnePersonenKapazitaet` (basis/umverteilt/zugewiesen/verbleibend arithmetic, `terminstatus === 'offen'` exclusion, multiple Personen), `berechneVerbleibendePersonenstunden` (capping).
- `berechnung.test.ts`: confirm `berechneAngebotProWoche`'s output is unchanged after the basis-helper extraction (regression guard for the "aggregate stays as-is" constraint).
- `ReihenEditor.test.tsx`: Begleitperson dropdown renders Personen, disabled when `wir_begleiten` is false, `onChange` fires `begleitperson_id`, toggling "Wir begleiten" off clears it.
- `PersonenKapazitaetsUebersicht.test.tsx`, `PersonenUmverteilung.test.tsx`: new component tests.
- `useAppData.test.ts`: `addPersonenUmverteilung`/`removePersonenUmverteilung`, `personenKapazitaet` exposed, `removePerson` cascade-clears `begleitperson_id` and `personenUmverteilungen`.
- Run full `npm test` and `npm run build` before considering this done.

## Out of scope

No changes to the aggregate `Bedarf`/`Angebot`/`Ampel`/`Machbarkeit` calculations, no changes to the existing Ferien-based `Kapazitäts-Umverteilung`, no changes to Besetzungs-Presets.
