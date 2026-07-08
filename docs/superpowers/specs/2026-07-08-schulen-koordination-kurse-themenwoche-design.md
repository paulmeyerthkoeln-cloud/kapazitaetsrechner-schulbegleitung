# Berechnungstool: Koordination in Termine generieren, Besetzungs-Presets entfernen, Kurs-Verwaltung, Themenwoche

## Context

Four related Schulen-area changes, requested together:

1. "Termine generieren" (the bulk quick-setup in `ReihenEditor.tsx`) sets `kontaktzeit_h` on every generated Einheit but never `koordinationszeit_h` — a user has to add it by hand per row afterward. Separately, `personenKapazitaet.ts`'s `berechneZugewieseneStundenProWoche` only deducts `kontaktzeit_h` from an assigned Begleitperson's weekly capacity, ignoring `koordinationszeit_h` — so a person assigned to a Termin with Koordination time appears to have more free capacity than they actually do.
2. The Besetzungs-Preset buttons ("Alle", "Keine", "Erste & Letzte", "Erste N", "Letzte N", "Jede N-te") in `ReihenEditor.tsx` bulk-toggle `wir_begleiten` across a Reihe's Einheiten. Since Begleitperson assignment is now per-Termin and deliberate, these presets are no longer wanted — remove them.
3. `Schule.reihen` (a school's "Kurse") is currently a fixed list seeded from `data.json`; there's no way to add or remove a course through the UI.
4. Some schools plan a joint "Themenwoche" (e.g. WDG, Bayreuther Gymnasium, Gym. Sedanstraße meeting at the same time) — each school still needs its own on-site Begleitperson (already possible today: each keeps its own Reihe/Einheit with its own `begleitperson_id`), but the shared curriculum's **Vorbereitungszeit** (prep time) shouldn't be counted once per participating school in the org-wide Bedarf — it's the same prep, done once, shared across the group.

These are bundled into one spec because 1 and 4 both touch `berechnung.ts`'s core Bedarf calculation, and 2/3 both touch the same `ReihenEditor`/`SchuleAkkordionItem`/`SchulenAccordion` chain — easiest to implement and verify together, but each is independently testable.

## 1. Koordination in Termine generieren + Begleitperson-Kapazität

### `src/lib/kalenderwochen.ts`

`generiereWochentlicheTermine` gains a `koordinationszeitH` parameter, set on every generated Einheit:

```ts
export function generiereWochentlicheTermine(
  reiheId: string,
  startdatum: string,
  unterrichtszeitH: number,
  koordinationszeitH: number,
  anzahlTermine: number,
  ferien: FerienZeitraum[]
): Einheit[] {
  // ...same loop...
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
  // ...
}
```

Parameter order places `koordinationszeitH` right after `unterrichtszeitH` (mirrors the Schnelleinrichtung UI order: Unterrichtszeit, then Koordination, then Anzahl Termine).

### `src/components/ReihenEditor.tsx`

Add a `schnellKoordinationMin` state (default `0`) and a "Koordination (min)" number input in the Schnelleinrichtung row, same pattern as the existing Unterrichtszeit input (`step={5} min={0}`, `aria-label="Schnelleinrichtung Koordination"`), positioned between Unterrichtszeit and Anzahl Termine. `termineGenerieren()` passes it through:

```ts
onTermineGenerieren(schnellStartdatum, schnellUnterrichtszeitMin / 60, schnellKoordinationMin / 60, schnellAnzahlTermine)
```

`onTermineGenerieren` prop type changes to `(startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) => void`.

### `src/components/SchuleAkkordionItem.tsx` and `src/components/SchulenAccordion.tsx`

Thread the new parameter through unchanged otherwise — `onTermineGenerieren` callback signature grows the extra argument at each layer, ending at `SchulenAccordion`'s:

```ts
function onTermineGenerieren(reiheId: string, startdatum: string, unterrichtszeitH: number, koordinationszeitH: number, anzahlTermine: number) {
  const einheiten = generiereWochentlicheTermine(reiheId, startdatum, unterrichtszeitH, koordinationszeitH, anzahlTermine, ferien)
  onEinheitenReplace(reiheId, einheiten)
}
```

### `src/lib/personenKapazitaet.ts`

`berechneZugewieseneStundenProWoche` adds Koordination to the deducted total:

```ts
zugewiesen.set(wochenKey, (zugewiesen.get(wochenKey) ?? 0) + einheit.kontaktzeit_h + (einheit.koordinationszeit_h ?? 0))
```

## 2. Remove Besetzungs-Presets

Delete entirely:
- `wendeBesetzungPreset` from `src/lib/besetzung.ts` (keep `berechneUnserAnteil` and `ermittleHaeufigsteKontaktzeit` — unrelated, still used).
- `BesetzungsPreset` type and the `besetzung?: BesetzungsPreset` field from `Reihe` in `src/lib/types.ts`.
- The `PRESETS` array and the whole preset-buttons `<div>` (including the "Erste {n}"/"Letzte {n}"/"Jede {n}. Einheit" buttons and the `n` `<input>`) from `src/components/ReihenEditor.tsx`. The `onPresetApply` prop is removed from `ReihenEditor`'s props.
- `onPresetApply` prop from `SchuleAkkordionItem.tsx` (prop and pass-through to `ReihenEditor`).
- `onPresetApply` function and prop from `SchulenAccordion.tsx`, and the `wendeBesetzungPreset` import.

The per-Termin "Wir begleiten" checkbox in `ReihenEditor`'s table is untouched — it remains the only way to toggle `wir_begleiten`, same as it already coexists with the presets today.

## 3. Course (Reihe) add/remove

### `src/state/useAppData.ts`

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
```

Both returned from `useAppData()`.

### `src/components/ReihenEditor.tsx`

`reihe.titel` becomes editable — replace the static `<h3>{reihe.titel}</h3>` with a text `<input>` (`aria-label="Titel"`, value `reihe.titel`) that calls a new `onTitelChange: (titel: string) => void` prop. This is the only way a freshly-added course (title "Neuer Kurs") becomes usable, and it's a natural extension of the existing per-field `onEinheitFelderChange` pattern already used throughout this component. `betreuungsmodell`/`status`/`fahrzeit_h` stay non-editable (out of scope — not requested).

`setReiheTitel(reiheId, titel)` added to `useAppData.ts` (mirrors `setReiheTerminstatus`), threaded through `SchuleAkkordionItem` → `SchulenAccordion` → `App.tsx` the same way `onTerminstatusChange` already is.

### `src/components/SchuleAkkordionItem.tsx`

Add a "+ Kurs hinzufügen" button below the mapped `reihe` list, calling a new `onReiheAdd: () => void` prop (no `schuleId` argument needed at this level — `SchulenAccordion` closes over it, same pattern as none currently, so `SchuleAkkordionItem` receives an already-bound `onReiheAdd` per school). Add a delete button (🗑, `aria-label="{reihe.titel} löschen"`) next to each Reihe's meta line, calling a new `onReiheRemove: (reiheId: string) => void` prop — no confirmation dialog (matches the app's existing no-confirmation delete pattern for Termine/Umverteilungen). `ReihenEditor`'s new `onTitelChange` (per-Reihe, no id, from the previous subsection) is wrapped here the same way `onTerminstatusChange` already is: `onTitelChange={(titel) => onReiheTitelChange(reihe.id, titel)}`.

### `src/components/SchulenAccordion.tsx`

Receives `onReiheAdd: (schuleId: string) => void` and `onReiheRemove: (schuleId: string, reiheId: string) => void` from `App.tsx`, and passes each `SchuleAkkordionItem` a pre-bound `onReiheAdd={() => onReiheAdd(schule.id)}` / `onReiheRemove={(reiheId) => onReiheRemove(schule.id, reiheId)}`.

## 4. Themenwoche (shared Vorbereitungszeit across schools)

### `src/lib/types.ts`

```ts
export interface Einheit {
  // ...existing fields unchanged...
  themenwoche?: string
}
```

Free-text label, optional. Two Einheiten (in any Schule/Reihe) sharing the same non-empty `themenwoche` value and scheduled in the same week are treated as one shared-prep group.

### `src/lib/berechnung.ts`

`berechneAufwandEinheit` gains a parameter for whether this call should skip charging Vorbereitungszeit (because another Einheit in the same Themenwoche group already did, for this week):

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

`vorbereitungBereitsGezaehlt` defaults to `false`, so every existing call site (and every existing test) is unaffected unless explicitly passed `true`.

`berechneBedarfProWoche` tracks which `themenwoche` labels have already had their Vorbereitungszeit counted, within that single week's computation:

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

`personenKapazitaet.ts` is **not** touched — each assigned person's own `kontaktzeit_h` (and now Koordination, per section 1) still deducts fully and independently from their personal capacity; only the aggregate org-wide `einsatzBedarf` dedupes Vorbereitungszeit.

### `src/components/ReihenEditor.tsx`

Add a "Themenwoche" text `<input>` column to the Termine table (same position/style as the "Thema" `<select>` column, placed after it), backed by a `<datalist>` populated from every distinct existing `themenwoche` value across the whole `Datenbestand` (not just this Reihe) — reduces typos when linking sessions across different schools' Reihen, without building a separate management screen. `onEinheitFelderChange`'s patch type gains `themenwoche?: string`.

Threading the full list of distinct `themenwoche` values down: `App.tsx` computes it once from `data.schulen` and passes it as a new `themenwochen: string[]` prop through `SchulenAccordion` → `SchuleAkkordionItem` → `ReihenEditor` (same prop-drilling path already used for `personen`/`ferien`).

## 5. Wiring (`src/App.tsx`)

`App()` destructures `addReihe`, `removeReihe`, `setReiheTitel` from `useAppData()` (alongside the existing `addEinheit`/`removeEinheit`/`setReiheTerminstatus`), computes `themenwochen` once via a small helper (e.g. a new exported `ermittleThemenwochen(data): string[]` in `src/lib/themenUebersicht.ts` or inline `Array.from(new Set(data.schulen.flatMap((s) => s.reihen.flatMap((r) => r.einheiten.map((e) => e.themenwoche).filter((t): t is string => !!t)))))`), and passes all of it into `SchulenAccordion`:

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
  themenwochen={themenwochen}
  ferien={data.kalender.ferien}
/>
```

`onPresetApply` is removed from this call (section 2). `SchulenAccordion`'s own props type grows `onReiheAdd: (schuleId: string) => void`, `onReiheRemove: (schuleId: string, reiheId: string) => void`, `onReiheTitelChange: (reiheId: string, titel: string) => void`, `themenwochen: string[]` — the last two threaded straight through to `SchuleAkkordionItem` → `ReihenEditor` unchanged (no per-school binding needed for `onReiheTitelChange`/`themenwochen`, only `onReiheAdd`/`onReiheRemove` need the `schuleId` bound at the `SchulenAccordion` layer per section 3).

## Testing

- `kalenderwochen.test.ts`: `generiereWochentlicheTermine` sets `koordinationszeit_h` from the new parameter on every generated Termin.
- `personenKapazitaet.test.ts`: an assigned Einheit's `koordinationszeit_h` reduces `zugewiesen`/`verbleibend` alongside `kontaktzeit_h`.
- `ReihenEditor.test.tsx`: Schnelleinrichtung Koordination input renders and is passed through `onTermineGenerieren`; Titel input renders and calls `onTitelChange`; Themenwoche input renders, is editable, and calls `onEinheitFelderChange` with `{ themenwoche }`; preset buttons ("Alle", "Keine", etc.) no longer render; `onPresetApply` prop and its tests are removed.
- `SchuleAkkordionItem.test.tsx`: `onPresetApply` removed from tests; add tests for the "+ Kurs hinzufügen" button calling `onReiheAdd`, and a course's delete button calling `onReiheRemove` with the correct id.
- `SchulenAccordion.test.tsx`: remove the existing `'applies a Besetzung-Preset only to the matching Reihe, scoped to the correct Schule'` test; add tests that `onReiheAdd`/`onReiheRemove` correctly bind the `schuleId` before calling through.
- `besetzung.test.ts`: remove all `wendeBesetzungPreset` tests; keep `berechneUnserAnteil`/`ermittleHaeufigsteKontaktzeit` tests as-is.
- `useAppData.test.ts`: `addReihe` appends a Reihe with the documented defaults to the correct Schule only; `removeReihe` removes only the matching Reihe; `setReiheTitel` updates only the matching Reihe's `titel`.
- `berechnung.test.ts`: `berechneAufwandEinheit` with `vorbereitungBereitsGezaehlt: true` omits the Vorbereitung term (existing calls/tests, which don't pass this argument, are unaffected — regression-test that explicitly); `berechneBedarfProWoche` with two Einheiten (different Schulen/Reihen) sharing a `themenwoche` label in the same week counts Vorbereitung once, not twice, while both Einheiten' full `kontaktzeit_h` still contribute; a third Einheit with a *different* `themenwoche` label (or none) is unaffected by the first group's dedup.
- Run full `npm test` and `npm run build`; visually verify in the browser: Koordination quick-setup field, Titel editing, course add/remove, Themenwoche input with autocomplete, and that the preset buttons are gone while the "Wir begleiten" checkbox still works.

## Out of scope

No change to `betreuungsmodell`/`status`/`fahrzeit_h` editability. No new top-level Themenwoche management screen (labels are just free text with autocomplete). No multi-person-per-Einheit field — Themenwoche's "several people accompany simultaneously" is satisfied by each school's own independent Einheit/`begleitperson_id`, already supported today.
