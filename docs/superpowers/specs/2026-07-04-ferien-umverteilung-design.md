# Design: Ferien deutlicher machen + Kapazitäts-Umverteilung

## Kontext

Die Wochen-Heatmap (`WochenHeatmap.tsx`) markiert Ferienwochen bereits grau (`.wochen-heatmap-zelle.ferien`), aber der Tooltip zeigt trotzdem eine Auslastungs-Prozentzahl wie bei normalen Wochen — die aber bedeutungslos ist, da in Ferienwochen `berechneBedarfProWoche` immer `0` liefert (Ferienwochen finden keine Einsätze statt). Zusätzlich bleibt das in Ferienwochen rechnerisch vorhandene Team-Angebot (`stunden_pro_woche_fuer_begleitung` der aktiven Personen) ungenutzt, weil dort nie Bedarf anfällt. Der Wunsch: Ferienwochen in der Heatmap eindeutiger als solche erkennbar machen, und die Möglichkeit schaffen, einen Teil dieser ungenutzten Ferien-Kapazität als zusätzliches Angebot in eine andere (nicht-Ferien-)Woche einzutragen.

Dieses Design ist bewusst **team-aggregiert** (keine Personen-Zuordnung, passt zum bestehenden Rechenmodell, das durchgängig nur Wochensummen betrachtet) und **ohne harte Obergrenze** (das Team trägt selbst ein, was realistisch ist — konsistent mit `stunden_pro_woche_fuer_begleitung`, das ebenfalls nirgends hart begrenzt wird).

## 1. Datenmodell

Neuer Typ in `src/lib/types.ts`:

```ts
export interface Umverteilung {
  id: string
  ferienName: string
  zielWochenKey: string
  zusatzStunden: number
}
```

`ferienName` ist rein dokumentarisch (Referenz auf `kalender.ferien[].name`, für die Anzeige "X Std aus Herbstferien NRW") und fließt nicht in eine Kappungs-Berechnung ein — es gibt keine Prüfung, ob der referenzierte Ferienzeitraum überhaupt so viel Angebot "hätte".

`Datenbestand` bekommt ein neues, **optionales** Feld:

```ts
export interface Datenbestand {
  settings: Settings
  personen: Person[]
  kalender: Kalender
  schulen: Schule[]
  umverteilungen?: Umverteilung[]
}
```

Optional, damit bestehende exportierte JSON-Dateien (ohne dieses Feld) weiterhin gültig importierbar bleiben; überall im Code wird `data.umverteilungen ?? []` gelesen.

## 2. Berechnungslogik

**`src/lib/kalenderwochen.ts`** — neue Funktion:

```ts
export function ermittleFerienName(wochenStartMontag: Date, ferien: FerienZeitraum[]): string | null
```

Gibt den `name` des ersten `FerienZeitraum`-Eintrags zurück, dessen Zeitraum die Woche überlappt (gleiche "any overlap"-Semantik wie das bestehende `istWocheInFerien`), sonst `null`.

**`src/lib/berechnung.ts`** — neue Funktion:

```ts
export function berechneZusatzangebotProWoche(umverteilungen: Umverteilung[], wochenKey: string): number
```

Summiert `zusatzStunden` aller Einträge, deren `zielWochenKey` der übergebenen Woche entspricht.

**`WochenErgebnis`** wird um drei Felder erweitert:

```ts
export interface WochenErgebnis {
  wochenKey: string
  bedarf: number
  einsatzBedarf: number
  koordinationBedarf: number
  angebot: number           // = angebotBasis + zusatzangebot
  angebotBasis: number       // neu — reines Personen-Angebot wie bisher
  zusatzangebot: number      // neu — Summe aus Umverteilungen dieser Woche
  auslastung: number
  ampel: AmpelFarbe
  istFerien: boolean
  ferienName: string | null  // neu
}
```

`berechneWochenuebersicht` berechnet `angebotBasis` wie bisher über `berechneAngebotProWoche`, addiert `zusatzangebot` aus `berechneZusatzangebotProWoche(data.umverteilungen ?? [], wochenKey)`, und ermittelt `ferienName` über `ermittleFerienName`.

## 3. Ferien-Sichtbarkeit

- `WochenHeatmap.tsx`: Der Tooltip (`title`-Attribut) zeigt für Ferienwochen `"Ferien: {ferienName}"` statt der Auslastungs-Prozentzahl.
- `WochenHeatmap.css`: `.wochen-heatmap-zelle.ferien` bekommt ein schraffiertes Muster über `repeating-linear-gradient` statt eines flachen Grautons — deutlich von den drei Ampelfarben unterscheidbar (auch bei Farbfehlsichtigkeit, da es sich um ein Muster und keine reine Farbe handelt).

## 4. UI: Kapazitäts-Umverteilung

Neue Komponente `src/components/KapazitaetsUmverteilung.tsx`:

- Formular: Dropdown "Ferienzeitraum" (Optionen aus `kalender.ferien[].name`), Dropdown "Ziel-Woche" (Optionen: alle `wochen[].wochenKey`, bei denen `istFerien === false`), Zahleneingabe "Zusatzstunden", Button "Hinzufügen".
- Liste bestehender Einträge: pro Zeile z. B. "20 Std aus Herbstferien NRW → 2027-KW04" plus 🗑-Löschen-Button (sofort, keine Bestätigung — konsistent mit dem bestehenden Muster bei Termin-Löschung).

Neue Handler in `src/state/useAppData.ts`, nach dem bestehenden Muster:

- `addUmverteilung(ferienName: string, zielWochenKey: string, zusatzStunden: number): void`
- `removeUmverteilung(id: string): void`

Wird in `App.tsx` neben `RestkapazitaetPlanner` eingebunden (beide sind "Was-wäre-wenn"-Kapazitätswerkzeuge), in einer `.card` wie die übrigen Abschnitte.

**Out of scope für diese Iteration:** `BedarfAngebotChart` und `EngpassBericht` bleiben unverändert — die Wirkung einer Umverteilung ist bereits über Heatmap-Farbe, Ampel-Antwort und die Auslastungszahl der Zielwoche sichtbar. Eine visuelle Aufschlüsselung im Balkendiagramm kann bei Bedarf später ergänzt werden.

## Tests

- `kalenderwochen.test.ts`: `ermittleFerienName` — korrekter Name bei Überlappung, `null` ohne Überlappung, "any overlap"-Randfall analog zu `istWocheInFerien`.
- `berechnung.test.ts`: `berechneZusatzangebotProWoche` — Summe korrekt bei mehreren passenden Einträgen, `0` ohne Treffer; `berechneWochenuebersicht` — eine Umverteilung erhöht `angebot`/senkt `auslastung` genau in der Zielwoche und nirgends sonst; bestehendes `berechneMachbarkeit`-Test-Literal (`WochenErgebnis`) um die drei neuen Felder ergänzt.
- `useAppData.test.ts`: `addUmverteilung` (neuer Eintrag mit korrekten Feldern, andere Einträge unverändert), `removeUmverteilung` (Eintrag entfernt, andere bleiben).
- Neue `KapazitaetsUmverteilung.test.tsx`: Dropdown-Optionen korrekt (nur Nicht-Ferienwochen als Ziel), Klick auf "Hinzufügen" ruft `onAdd` mit korrekten Werten auf, Klick auf 🗑 ruft `onRemove` mit korrekter ID auf.
