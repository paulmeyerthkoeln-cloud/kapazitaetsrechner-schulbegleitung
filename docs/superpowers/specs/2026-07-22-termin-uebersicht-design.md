# Termin-Übersicht – Design

## Kontext

Das Tool aggregiert Planung bisher ausschließlich auf ISO-Kalenderwochen (Wochen-Heatmap,
Bedarf/Angebot-Chart, Themen-Gantt). Das reicht für Kapazitätsplanung ("reicht die Zeit diese
Woche"), aber nicht für die operative Logistik ("wer muss an welchem konkreten Tag wohin"). Ein
Klick auf eine Woche öffnet zwar ein Detail-Overlay (`WochenDetailOverlay`), das zeigt aber nur
pro Schule aufsummierte Stunden für die angeklickte Woche – nicht die einzelnen Termine mit
Datum, Thema und den zugeordneten Personen, und nicht über mehrere Wochen hinweg.

## Zweck der neuen Übersicht

Eine chronologische, filterbare Liste aller Einzeltermine (Schul-Einheiten *und*
Veranstaltungs-Termine gemeinsam), die beantwortet:

- Welche konkreten Termine liegen chronologisch vor uns, mit welcher Schule/Veranstaltung,
  welchem Thema, wie vielen Stunden und welchen Personen?
- Welche Termine haben noch keinen festen Terminstatus ("offen"/"teilweise festgelegt") und
  brauchen Nachfassen?
- Ist eine Person an einem Tag mehrfach verplant (Konflikt)?

## Nicht-Ziele

- Keine Bearbeitung von Terminen aus dieser Ansicht heraus (nur Lesen/Filtern) – Bearbeitung
  bleibt bei `ReihenEditor` / `VeranstaltungenUebersicht`.
- Keine automatische Konfliktauflösung, nur Markierung.
- Keine Ersetzung von `WochenDetailOverlay` – dieses bleibt für den schnellen Wochen-Drilldown
  aus den Graphen bestehen.

## 1. Datenmodell (`src/lib/terminUebersicht.ts`)

Neue reine Funktionen, analog zum bestehenden Muster in `themenUebersicht.ts` /
`wochenDetails.ts`.

```ts
export interface TerminZeile {
  id: string                    // eindeutig je Zeile (Termin × Schule)
  isoDatum: string               // yyyy-MM-dd, aufgelöst über zuIsoDatum() – für Sortierung & Konfliktprüfung
  datumOderKw: string            // Rohwert, für Anzeige über formatDatumOderKw()
  wochenKey: string
  quelle: 'schule' | 'veranstaltung'
  titel: string                  // Reihe.titel bzw. Veranstaltung.titel
  schulId: string
  schulName: string
  thema?: Thema
  terminstatus: Terminstatus     // von Reihe bzw. Veranstaltung
  unterrichtsStunden: number     // wir_begleiten ? kontaktzeit_h : 0
  koordinationsStunden: number   // koordinationszeit_h ?? 0 (zählt unabhängig von wir_begleiten)
  begleitpersonIds: string[]
  begleitpersonNamen: string[]
  koordinatorIds: string[]
  koordinatorNamen: string[]
  hatKonflikt: boolean
}

export function berechneTerminUebersicht(data: Datenbestand): TerminZeile[]
```

Aufbau:

1. Für jede Schule → Reihe → Einheit: eine Zeile (Quelle `schule`, Titel = Reihe.titel,
   Terminstatus = Reihe.terminstatus).
2. Für jede Veranstaltung → Termin → Besetzung: eine Zeile pro Besetzung (Quelle
   `veranstaltung`, Titel = Veranstaltung.titel, Terminstatus = Veranstaltung.terminstatus,
   Thema = Termin.thema). Eine Veranstaltung mit mehreren Schulen erzeugt so eine Zeile je
   Schule, wie im bestehenden `WochenDetailOverlay`.
3. Personennamen werden wie in `wochenDetails.ts` über die `personen`-Liste aufgelöst.
4. Konfliktmarkierung (`hatKonflikt`): Zeilen werden nach `isoDatum` gruppiert; innerhalb einer
   Gruppe wird geprüft, ob dieselbe Person in mehr als einer Zeile als relevante Begleitperson
   (nur wenn `unterrichtsStunden > 0`) oder als Koordinator (nur wenn `koordinationsStunden > 0`)
   auftaucht. Trifft das zu, werden alle beteiligten Zeilen als Konflikt markiert.
5. Sortierung: aufsteigend nach `isoDatum`, bei Gleichstand nach `schulName`, dann `titel`.

Da rein KW-basierte Termine ohne festen Wochentag über `zuIsoDatum()` auf den Montag der Woche
fallen, können zwei solche Platzhalter derselben Person in derselben Woche als Konflikt
markiert werden, obwohl der reale Wochentag noch offen ist. Das ist hier akzeptiert: solche
Termine benötigen ohnehin ein festes Datum, der Hinweis ist ein Signal dafür.

## 2. Komponente (`src/components/TerminUebersicht.tsx`)

- Wurzel: `<details className="termin-uebersicht">`, analog zum Muster in `DatumOderKwFeld`
  und `PersonenMehrfachauswahl` (unkontrolliertes `<details>`, Klick außerhalb schließt nicht
  nötig, da kein Overlay-Verhalten – es ist ein normales Aufklapp-Element im Seitenfluss, kein
  Popover).
- `<summary>`: `Terminliste anzeigen (N Termine, davon M Konflikte)` – zeigt im eingeklappten
  Zustand direkt an, ob Handlungsbedarf besteht, ohne die Liste selbst zu rendern.
- Aufgeklappter Inhalt:
  - Filterzeile:
    - Person: Mehrfachauswahl, Wiederverwendung von `PersonenMehrfachauswahl`.
    - Schule/Veranstaltung: Mehrfachauswahl-`<select multiple>` oder Checkboxen-Liste über
      eindeutige `titel`-Werte aus den Zeilen.
    - Terminstatus: Checkboxen für die drei Werte (Default: alle drei aktiv).
    - Zeitraum: zwei `<input type="date">` (von/bis), leer = keine Einschränkung.
  - Tabelle (Spalten): Datum (formatiert via `formatDatumOderKw`) | Schule | Titel (mit Icon/Text
    für Quelle Schule vs. Themenwoche/Exkursion) | Thema | Std. Unterricht | Std. Koordination |
    Begleitpersonen | Koordinatoren | Status (Badge, wie `terminstatus-badge` in
    `ReihenEditor.css`).
  - Konflikt-Zeilen erhalten eine zusätzliche CSS-Klasse (Rahmen/Hintergrund) und ein Symbol mit
    `title`-Tooltip, das die betroffene Person nennt.
- Filterstatus lebt als lokaler `useState` in der Komponente (kein globaler State nötig, rein
  UI-seitige Ansicht ohne Persistenz).

## 3. Integration (`src/App.tsx`)

Neue `<div className="card">` mit `<TerminUebersicht ... />` direkt nach der bestehenden
`ThemenUebersicht`-Karte und vor der Überschrift `<h2>Schulen</h2>`. Da die Komponente
standardmäßig eingeklappt ist, wächst die Standardansicht der Seite nicht; die drei
Graphen bleiben optisch die dominanten Elemente.

Übergebene Daten: eine neue `useMemo`-Ableitung `terminUebersichtZeilen` in `useAppData.ts`
(`berechneTerminUebersicht(data)`), analog zu `themenGanttZeilen` und `personenKapazitaet`.

## 4. Tests

- `src/lib/terminUebersicht.test.ts`: Zeilenaufbau aus Schulen und Veranstaltungen, korrekte
  Stundenberechnung (`wir_begleiten`-Abhängigkeit, Koordination unabhängig davon),
  Konflikterkennung (gleiche Person, gleicher Tag, über Schul- und Veranstaltungs-Zeilen hinweg),
  Sortierung, Ausschluss offener Reihen/Veranstaltungen aus der Konfliktprüfung nur wenn
  `unterrichtsStunden`/`koordinationsStunden` 0 sind (nicht generell).
- `src/components/TerminUebersicht.test.tsx`: Rendering der Zusammenfassung im `<summary>`,
  Filterverhalten (Person, Schule/Veranstaltung, Status, Zeitraum), Anzeige der
  Konfliktmarkierung.

## Offene Rand-Aspekte (bewusst einfach gehalten)

- Keine Paginierung – bei den bisherigen Datenmengen (mehrere Schulen, wenige Dutzend Termine)
  ist eine einzelne scrollbare Tabelle ausreichend performant.
- Keine Speicherung des Filterzustands über Reloads hinweg.
