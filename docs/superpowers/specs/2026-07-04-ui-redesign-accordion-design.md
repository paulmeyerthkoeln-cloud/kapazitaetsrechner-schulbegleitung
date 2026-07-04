# Design: Schulen als Accordion + visuelle Auffrischung

## Kontext

Der Kapazitätsrechner rendert aktuell zwei getrennte, unstyled Ansichten für Schulen/Reihen: `SchulenTabelle.tsx` (eine große Tabelle mit einer Zeile pro Reihe — Schule, Reihe, Modell, Status, Unser Anteil, Koordination h/Monat, wobei Schulen mit mehreren Reihen mehrfach auftauchen und die Koordinationszeile dabei dupliziert wird) und darunter eine flache Liste von `ReihenEditor`-Blöcken (eine pro Reihe, unabhängig von der zugehörigen Schule sortiert). Die gesamte Seite ist reines unstyled HTML ohne jegliche visuelle Struktur.

Dieses Design gruppiert beide Ansichten pro Schule in ein aufklappbares Accordion-Element und ergänzt eine grundlegende visuelle Auffrischung der gesamten Seite.

## 1. Komponentenumbau

- **Entfernt:** `SchulenTabelle.tsx` und `SchulenTabelle.test.tsx`. Ihr Inhalt (Modell, Status, Unser Anteil, Koordination) wird in die neue Struktur überführt.
- **Unverändert:** `ReihenEditor.tsx` und `ReihenEditor.test.tsx` — die Komponente wird unverändert in die neue Struktur eingebettet (weiterhin dieselben Props: `reihe`, `onEinheitToggle`, `onPresetApply`, `onEinheitAdd`, `onEinheitRemove`, `onEinheitFelderChange`).
- **Neu:** `src/components/SchuleAkkordionItem.tsx` — rendert eine einzelne Schule als `<details>`-Element:
  - `<summary>`: Schulname (`schule.name`).
  - Aufgeklappter Bereich: Koordinationsfeld (Zahleneingabe, wie bisher in `SchulenTabelle`, aber **einmal pro Schule** statt einmal pro Reihe), danach pro `reihe` in `schule.reihen`: eine Metazeile "Modell {betreuungsmodell} · Status: {status}" gefolgt vom bestehenden `<ReihenEditor>` für diese Reihe.
- **Neu:** `src/components/SchulenAccordion.tsx` — mappt über `schulen: Schule[]` und rendert pro Schule ein `<SchuleAkkordionItem>`, reicht dabei alle nötigen Callbacks (Koordination, Einheit-Toggle/Add/Remove/Felder-Änderung, Preset-Anwendung) durch und übernimmt intern die Reihen-ID-Bindung, die aktuell in `App.tsx`'s `onPresetApply`/inline-Callbacks passiert.
- **`App.tsx`:** Die bestehende `flatMap`-Schleife über `data.schulen`/`reihen` sowie der direkte `<SchulenTabelle>`-Aufruf entfallen; stattdessen ein einzelner `<SchulenAccordion schulen={data.schulen} settings={data.settings} ... />`-Aufruf. Die `onPresetApply`-Funktion (aktuell in `App.tsx` definiert, sucht die Reihe über alle Schulen) wandert nach `SchulenAccordion.tsx`, da sie dort mit vollem Kontext (welche Schule/Reihe) einfacher zu verkabeln ist.

## 2. Accordion-Technik

Natives HTML `<details>`/`<summary>` statt eigenem React-`useState` pro Element — der Browser verwaltet den Auf-/Zu-Zustand selbst (kostenlos zugänglich per Tastatur/Screenreader, kein zusätzlicher State-Code nötig). Mehrere Schulen können gleichzeitig aufgeklappt sein (unabhängige `<details>`-Elemente).

Das Koordinationsfeld sitzt bewusst **im aufgeklappten Bereich**, nicht in der `<summary>`-Zeile — ein interaktives Eingabefeld direkt in der `<summary>` würde bei jedem Klick versehentlich das Element auf-/zuklappen (`<summary>` ist der komplette Klick-Ziel-Bereich für das Toggle).

## 3. Visuelle Auffrischung

Kein UI-Framework, nur CSS, passend zum bestehenden Muster einer komponentennahen `.css`-Datei (wie `WochenHeatmap.css`):

- `src/index.css` bekommt gemeinsame Basiswerte: CSS-Variablen für Abstände (`--spacing-sm`, `--spacing-md`, `--spacing-lg`), eine `.card`-Klasse (Rahmen, Radius, Innenabstand, Hintergrund), etwas großzügigere Überschriften-Typografie (`h1`–`h3` Margins/Größen).
- Neue `src/components/SchulenAccordion.css`: Styling für `<summary>` (Cursor: pointer, Innenabstand, Pfeil-Icon via `::marker` oder `list-style`), Einrückung des aufgeklappten Bereichs, Kartenrahmen um jedes `<details>`-Element, etwas Abstand zwischen den Schulen.
- `AmpelAntwort`, `WochenHeatmap` (Container, nicht die Zellen selbst), `BedarfAngebotChart`, `EngpassBericht`, `PersonenTabelle`, `SzenarioAuswahl` bekommen die `.card`-Klasse plus Innenabstand über ihr Wurzelelement in `App.tsx` oder direkt in der jeweiligen Komponente (deren Wahl obliegt der Umsetzung — konsistent mit den bestehenden Mustern der jeweiligen Datei).
- Keine Farb-/Layout-Neukonzeption, keine neuen Abhängigkeiten (kein Tailwind, keine Component-Library) — nur konsistente Boxen/Abstände statt nacktem HTML.

## 4. Datenfluss

Keine Änderungen an `useAppData.ts` oder der Berechnungslogik nötig — dieses Teilprojekt ist reine UI-Umstrukturierung. Alle bestehenden Handler (`setSchuleKoordination`, `setEinheitBegleitung`, `addEinheit`, `removeEinheit`, `setEinheitFelder`) werden unverändert weitergereicht, nur die Komponente, die sie konsumiert, ändert sich.

## Tests

- Neue `SchulenAccordion.test.tsx`: rendert mehrere Schulen, prüft dass jede Schule als eigenes `<details>`-Element erscheint, dass Klick auf eine `<summary>` deren Inhalt auf-/zuklappt (via `toHaveAttribute('open')` bzw. dessen Fehlen), dass mehrere Schulen unabhängig voneinander auf-/zugeklappt werden können.
- Neue `SchuleAkkordionItem.test.tsx`: rendert eine einzelne Schule mit 2 Reihen, prüft dass die Koordinationsänderung `onKoordinationChange` mit der richtigen Schul-ID aufruft, dass pro Reihe die Modell-/Status-Zeile korrekten Text zeigt, dass für jede Reihe ein `<ReihenEditor>` gerendert wird (z. B. über das Vorhandensein des Reihen-Titels als Überschrift).
- `App.test.tsx`: bestehender Test angepasst, falls er `SchulenTabelle`-spezifische Erwartungen hatte (aktuell prüft er nur Titel + Ampel-Text, vermutlich unverändert lauffähig).
- `ReihenEditor.test.tsx`: unverändert, da die Komponente nicht angefasst wird.
- `SchulenTabelle.test.tsx`: wird gelöscht (Komponente entfernt).
