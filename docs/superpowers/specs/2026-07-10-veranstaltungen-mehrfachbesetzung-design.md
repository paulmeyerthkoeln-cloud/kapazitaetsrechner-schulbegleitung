# Berechnungstool: Veranstaltungen (Themenwoche/Exkursion), Mehrfachbesetzung, Stunden-Bugfix

## Context

Four requests, bundled because they touch the same core files (`types.ts`, `berechnung.ts`, `personenKapazitaet.ts`, `ReihenEditor.tsx`, `SchuleAkkordionItem.tsx`, `SchulenAccordion.tsx`, `App.tsx`):

1. **Themenwoche** is currently a free-text label field on individual Einheiten (with autocomplete) — not the tab/entity the user expects. It needs to become its own top-level thing: a "Themenwoche hinzufügen" button next to "Kurs hinzufügen", with its own tab for selecting participating schools (multi-select) whose Termine are synchronized.
2. **Mehrfachbesetzung**: an Einheit currently has a single `begleitperson_id` and an unused `personen_parallel` field (always `1` in all data, no UI to edit it) that's supposed to represent multiple people accompanying the same session in parallel. This needs to become a real multi-select of Begleitpersonen, plus a separate multi-select of Koordinatoren (coordination is tracked as its own time budget, separate from Unterrichtszeit, and may be done by different people).
3. **Stunden-Bug**: `personenKapazitaet.ts`'s `berechneZugewieseneStundenProWoche` only deducts `kontaktzeit_h + koordinationszeit_h` from an assigned person's weekly capacity — it ignores Vorbereitung (prep) and Fahrzeit (travel) entirely, both of which the org-wide Bedarf calculation (`berechneBedarfProWoche`) does include. This makes a person's personal capacity look better than it really is.
4. **Exkursion** is currently a value of the `Thema` enum *and* a separate `EinheitTyp` discriminator (redundant/confusing), embedded in a Kurs's own Einheiten. It should become a "Exkursion hinzufügen" button (next to "Termin hinzufügen") in both Kurse and Themenwochen, and — like Themenwochen — support multiple participating schools with synchronized Termine.

Given 1 and 4 both need "a shared Termin group spanning multiple schools," they're unified into one new concept: **Veranstaltung** (`art: 'themenwoche' | 'exkursion'`).

## 1. Data model (`src/lib/types.ts`)

### New `Veranstaltung` type

```ts
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
  organisationspauschale_h?: number // only meaningful when art === 'exkursion'
  besetzungen: SchulBesetzung[] // one entry per Schule in the parent Veranstaltung's schulIds
}

export interface Veranstaltung {
  id: string
  art: VeranstaltungArt
  titel: string
  terminstatus: Terminstatus
  schulIds: string[]
  termine: VeranstaltungTermin[]
}
```

`besetzungen` always has exactly one entry per `schulIds` member (kept in sync: adding/removing a school from `schulIds` adds/removes the matching `SchulBesetzung`, preserving existing entries for schools that remain).

### Changed `Einheit` type (Kurs/Reihe Einheiten)

```ts
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
```

Removed: `typ`, `organisationspauschale_h`, `themenwoche`, `personen_parallel`, `begleitperson_id`. `EinheitTyp` is deleted (no longer needed — Exkursion only exists as a `Veranstaltung`).

`Thema` drops `'Exkursion'`:

```ts
export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'
```

### `Datenbestand`

```ts
export interface Datenbestand {
  settings: Settings
  personen: Person[]
  kalender: Kalender
  schulen: Schule[]
  veranstaltungen: Veranstaltung[]
  personenUmverteilungen?: PersonenUmverteilung[]
}
```

## 2. Berechnungslogik

### `src/lib/berechnung.ts`

`berechneAufwandEinheit` drops the `personen_parallel` multiplication (moved to call sites, since the multiplier now comes from counting `begleitperson_ids`, and Veranstaltungen need per-Schule multipliers that a single shared function can't express) and drops the `vorbereitungBereitsGezaehlt` flag — with Veranstaltungen now a real shared structure, "count Vorbereitung once" falls out of *where* this function is called (once per `VeranstaltungTermin`) rather than needing a flag threaded through every call site:

```ts
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
```

Note this function now always includes Vorbereitung; call sites that need the "charge once for the whole Veranstaltung" behavior (the org-wide Bedarf loop below) simply don't call it per-Schule for that part — they add `kontaktzeit_h * vorbereitungsfaktor` directly, once, outside the per-Schule loop.

`berechneBedarfProWoche` gains a Veranstaltungen loop alongside the existing Schulen/Reihen loop:

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
    const zaehlendeReihen = schule.reihen.filter((reihe) => reihe.terminstatus !== 'offen')
    for (const reihe of zaehlendeReihen) {
      for (const einheit of reihe.einheiten) {
        if (parseZuWochenKey(einheit.datum_oder_kw) !== wochenKey) continue
        const begleitAnzahl = Math.max(1, einheit.begleitperson_ids.length)
        const koordAnzahl = Math.max(1, einheit.koordinator_ids.length)
        koordinationBedarf += (einheit.koordinationszeit_h ?? 0) * koordAnzahl
        if (einheit.wir_begleiten) {
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
      const pauschale = veranstaltung.art === 'exkursion' ? termin.organisationspauschale_h ?? 2 : 0
      const vorbereitungsfaktor = termin.erstdurchfuehrung
        ? data.settings.default_vorbereitungsfaktor_erstdurchfuehrung
        : data.settings.default_vorbereitungsfaktor_wiederholung
      // Vorbereitung and Pauschale are organizational overhead shared once across
      // the whole Veranstaltung, regardless of how many schools/people attend.
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

`gezaehlteThemenwochen`/`vorbereitungBereitsGezaehlt` dedup logic is deleted — a `Veranstaltung` is inherently one shared Termin group, so "count Vorbereitung once" falls out naturally from computing it once per `VeranstaltungTermin` rather than once per participating school.

`berechneKoordinationWoche` is deleted (confirmed dead code — a repo-wide grep shows no call sites, only its own definition), along with the now-unused `Schule.koordination_h_pro_monat` and `Settings.koordination_h_pro_schule_pro_monat` fields.

### `src/lib/personenKapazitaet.ts`

`berechneZugewieseneStundenProWoche` is rewritten to walk both Reihen and Veranstaltungen, charging each named person the **full** individual cost of their own assignment (no dedup across people/schools — confirmed: each accompanying person bears their own full Vorbereitung):

```ts
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
```

This is the fix for finding 3: a person's `zugewiesen`/`verbleibend` in `PersonenKapazitaetsUebersicht` now includes their share of Vorbereitung and Fahrzeit, matching what the org-wide Bedarf chart already counted.

### `src/lib/themenUebersicht.ts`

`berechneThemenGantt` gains a second loop over `data.veranstaltungen`, building one Gantt row per Veranstaltung for any `VeranstaltungTermin` with a `thema` set (contiguous same-`thema` weeks grouped exactly like the existing Reihen logic). Row label: `"<Titel> (<Schulkürzel, Schulkürzel, ...>)"` using the existing `kuerzeSchulname` helper resolved against `veranstaltung.schulIds`.

## 3. UI changes

### `src/components/ReihenEditor.tsx`

- "Begleitperson" single `<select>` → "Begleitpersonen" multi-select (new shared `PersonenMehrfachauswahl` component, see below). New "Koordinatoren" column, same component, bound to `koordinator_ids`.
- "Thema" column keeps its `<select>` but the `THEMEN` array drops `'Exkursion'`.
- "Themenwoche" column and its `<datalist>` are deleted entirely, along with the `themenwochen: string[]` prop (removed from `ReihenEditor`, `SchuleAkkordionItem`, `SchulenAccordion`, `App.tsx`).
- New button "+ Exkursion hinzufügen" next to "+ Termin hinzufügen", calling a new `onExkursionAdd: () => void` prop.
- `onEinheitFelderChange`'s patch type: replace `begleitperson_id?: string | null` with `begleitperson_ids?: string[]`, add `koordinator_ids?: string[]`.

### New `src/components/PersonenMehrfachauswahl.tsx`

A `<details>`/`<summary>` disclosure (no new dependency): summary shows selected names joined by ", " (or "— niemand —" if empty); body lists one checkbox per `Person`. Props: `personen: Person[]`, `ausgewaehlt: string[]`, `onChange: (ids: string[]) => void`, `label: string` (for `aria-label`s on the checkboxes, e.g. `` `${label} für Termin ${index}` ``). Shared by `ReihenEditor` (Begleitpersonen/Koordinatoren) and the new Veranstaltungs-Editor (Begleitpersonen/Koordinatoren per Schule).

### `src/components/SchuleAkkordionItem.tsx`

New button "+ Themenwoche hinzufügen" next to "+ Kurs hinzufügen", calling a new `onVeranstaltungAdd: (art: 'themenwoche') => void` prop (bound with `schule.id` at `SchulenAccordion`). `onExkursionAdd` (from `ReihenEditor`, per Reihe) is threaded through the same way `onTermineGenerieren` already is, ending in a call bound to the current `schule.id`.

### `src/components/SchulenAccordion.tsx`

Receives and binds `onVeranstaltungAdd(art, schuleId)` and `onExkursionAdd(schuleId)` (both ultimately call the same `addVeranstaltung(art, schulIds)` in `useAppData`, just with `schulIds: [schuleId]`).

### New `src/components/VeranstaltungenUebersicht.tsx`

Rendered in `App.tsx` as its own card, titled "Themenwochen & Exkursionen", below the "Schulen" heading. Lists all `data.veranstaltungen`; for each:

- Titel `<input>`, Terminstatus `<select>` (same pattern as `ReihenEditor`), delete button.
- "Schulen" section: one checkbox per `Schule` (`aria-label="Schule {name} für {titel}"`) toggling membership in `schulIds` — checking adds a new zeroed `SchulBesetzung` to every existing `termine[i].besetzungen`; unchecking removes the matching `SchulBesetzung` from every termin.
- Termine list: for each `VeranstaltungTermin`, a header row (Datum/KW, Unterrichtszeit (min), Thema, Organisationspauschale (min) if `art === 'exkursion'`, Erstdurchführung checkbox, delete) followed by a small table with one row per `schulIds` member (Schule name, Wir begleiten, Begleitpersonen, Koordinatoren, Koordination (min), Fahrzeit (h)) editing that Termin's matching `SchulBesetzung`.
- Buttons: "+ Termin hinzufügen" (always); "+ Exkursion hinzufügen" only when `art === 'themenwoche'` (creates a new Veranstaltung with `art: 'exkursion'` and the same `schulIds`).

### Wiring (`src/App.tsx`)

- Renders `<VeranstaltungenUebersicht veranstaltungen={data.veranstaltungen} personen={data.personen} schulen={data.schulen} .../>` as its own card, placed after the "Schulen" heading/`SchulenAccordion`.
- The inline `themenwochen = Array.from(new Set(...))` computation and the `themenwochen` prop passed to `SchulenAccordion` are deleted.
- `SchulenAccordion` gains `onVeranstaltungAdd`/`onExkursionAdd`/`onVeranstaltungTermineChange`-style props sourced from the new `useAppData` functions (section below); `App.tsx` passes them through unchanged (binding to a specific `schuleId` already happens one layer down, same as `onReiheAdd`/`onReiheRemove` today).
- `berechnePersonenKapazitaet`/`berechneWochenuebersicht`/`berechneThemenGantt` calls in `useAppData.ts` are unchanged at the call-site level — they already receive the whole `data: Datenbestand`, so they automatically pick up `data.veranstaltungen` once the lib functions are updated per section 2.

### `src/state/useAppData.ts`

New state slice functions: `addVeranstaltung(art, schulIds)`, `removeVeranstaltung(id)`, `setVeranstaltungTitel`, `setVeranstaltungTerminstatus`, `setVeranstaltungSchulen(id, schulIds)` (syncs `besetzungen` per termin as described above), `addVeranstaltungTermin(veranstaltungId)`, `removeVeranstaltungTermin`, `setVeranstaltungTerminFelder` (patches shared fields), `setSchulBesetzungFelder(veranstaltungId, terminId, schulId, patch)`.

`addEinheit`/`setEinheitFelder` updated for the new `Einheit` shape (`begleitperson_ids: []`, `koordinator_ids: []` on creation; patch type updated).

## 4. Migration (`migriereDatenbestand` in `useAppData.ts`)

For each Schule/Reihe/Einheit in old data:

- If `einheit.typ === 'exkursion'`: remove it from `reihe.einheiten` and instead push a new `Veranstaltung` (`art: 'exkursion'`, `schulIds: [schule.id]`, `titel: reihe.titel + ' – Exkursion'`) with one `VeranstaltungTermin` built from the old Einheit's fields (`organisationspauschale_h` carried over) and one `SchulBesetzung` (`schulId: schule.id`, `fahrzeit_h: reihe.fahrzeit_h`, `begleitperson_ids: einheit.begleitperson_id ? [einheit.begleitperson_id] : []`, `koordinator_ids: []`, `koordinationszeit_h: einheit.koordinationszeit_h ?? 0`).
- Otherwise: `begleitperson_ids: einheit.begleitperson_id ? [einheit.begleitperson_id] : []`, `koordinator_ids: []`; drop `begleitperson_id`, `personen_parallel`, `themenwoche`, `typ`, `organisationspauschale_h`.
- `data.veranstaltungen ?? []` ensures the field exists for pre-existing saved states (localStorage and `data.json`).

This runs both on the seed `data.json` load and on `importJson`, matching the existing `migriereDatenbestand` pattern (already handles e.g. `terminstatus ?? 'festgelegt'`).

## Out of scope

- The Datum/KW-Kalender-Picker (clicking the date field to choose between a single Termin and a whole KW) is a separate, independent spec — not part of this change. The date field stays a plain text input here.
- No UI to reorder `schulIds`/Termine beyond simple add/remove.
- No validation preventing a Veranstaltung with zero participating schools (an edge case the UI simply renders as an empty Termine/Besetzung area — not blocked, not common in practice).

## Testing

- `berechnung.test.ts`: `berechneAufwandEinheit`'s new signature; `berechneBedarfProWoche` with Reihen (multi-Begleitperson/Koordinator counts) and with Veranstaltungen (themenwoche Vorbereitung-dedup-by-construction, exkursion Pauschale, per-Schule Fahrzeit/Koordination, multi-person counts per Schule).
- `personenKapazitaet.test.ts`: a person assigned via `begleitperson_ids`/`koordinator_ids` on a Reihen-Einheit gets full Kontaktzeit+Vorbereitung+Fahrzeit / Koordination; a person assigned to a Veranstaltungs-Besetzung likewise, including two different people each assigned to two different schools of the same Themenwoche both getting full individual Vorbereitung (no dedup).
- `themenUebersicht.test.ts`: Gantt includes Veranstaltungen rows.
- `useAppData.test.ts`: `addVeranstaltung`/`removeVeranstaltung`/`setVeranstaltungSchulen` (Besetzung sync on add/remove of a Schule)/`setSchulBesetzungFelder`; migration of legacy `typ: 'exkursion'` Einheiten and legacy single `begleitperson_id` into the new shapes.
- `ReihenEditor.test.tsx`: Begleitpersonen/Koordinatoren multi-select renders and calls through; "+ Exkursion hinzufügen" button calls `onExkursionAdd`; Themenwoche column/datalist no longer render.
- New `VeranstaltungenUebersicht.test.tsx` and `PersonenMehrfachauswahl.test.tsx`.
- Run full `npm test` and `npm run build`; manually verify in the browser: create a Themenwoche across 3 schools, assign different Begleitpersonen per school, confirm Bedarf chart and Personen-Kapazität grid update plausibly; create an Exkursion from within a Kurs; confirm a person assigned via multiple Begleitpersonen/Koordinatoren shows correctly reduced capacity.
