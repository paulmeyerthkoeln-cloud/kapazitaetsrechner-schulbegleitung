# Spec: Schnelleinrichtung, Terminstatus, Themen-Übersicht & Persistenz

**Datum:** 2026-07-05
**Status:** Vom Nutzer freigegeben, bereit für Umsetzungsplan

## Ausgangslage

Der Kapazitätsrechner Schulbegleitung läuft als statische Vite+React-App ohne Backend (GitHub Pages). Reihen (Schul-Serien) werden aktuell Termin für Termin manuell im `ReihenEditor` gepflegt; es gibt kein Feld dafür, ob Termine real bestätigt oder nur angenommene Platzhalter sind, und keinen Themenbezug pro Einheit. Wochen werden überall als ISO-KW-Codes (`2026-KW46`) angezeigt. Der App-Zustand lebt nur im React-State (Seed aus `src/data/data.json`) und geht bei jedem Reload verloren, sofern nicht manuell über den bestehenden JSON-Export gesichert.

## Ziel

1. Pro Schul-Serie (Reihe) eine Schnelleinrichtung (Unterrichtszeit, Startdatum, Anzahl Termine) anbieten, die automatisch wöchentliche Termine unter Aussparung der Ferien erzeugt.
2. Pro Einheit ein Thema hinterlegen können (Ernährung, Stadtgrün, Mobilität, Energie).
3. Pro Reihe erfassen, wie verbindlich die Termine sind (festgelegt / teilweise festgelegt / offen), und „offene" Reihen aus der Bedarfsrechnung herausnehmen.
4. Wochen überall als Datumsspanne (Montag–Sonntag) statt als KW-Code anzeigen.
5. Eine neue Übersicht ergänzen: welche Schule bearbeitet welches Thema in welcher Woche mit wie vielen Stunden (Tabelle + responsives, an die Werte angepasstes Balkendiagramm).
6. Eingaben im Browser automatisch speichern, damit sie einen Reload überstehen; der bestehende Export bleibt der Weg, eine aktualisierte `data.json` ins Repo zu committen.
7. Die Seed-Daten anhand der aktuellen Rückmeldungen zum Terminstatus korrigieren.

## 1. Datenmodell (`src/lib/types.ts`)

```ts
export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'

export interface Einheit {
  // ...bestehende Felder unverändert...
  thema?: Thema
}

export type Terminstatus = 'festgelegt' | 'teilweise_festgelegt' | 'offen'

export interface Reihe {
  // ...bestehende Felder unverändert, inkl. status (Zusage-Status, bleibt getrennt)...
  terminstatus: Terminstatus
}

export interface Muster {
  typ: 'woechentlich'
  von: string
  bis?: string
  anzahl_termine?: number
  kontaktzeit_h: number
}
```

- `terminstatus` ist ein **Pflichtfeld** (kein Optional), da jede Reihe im Alltag eindeutig einem der drei Zustände zugeordnet werden kann. Import älterer JSON-Dateien ohne dieses Feld setzt beim Einlesen den Default `'festgelegt'` (siehe Abschnitt 6, Migration).
- `status` (bestehendes Freitextfeld: „zugesagt", „in_klaerung", „platzhalter"...) bleibt unverändert bestehen — es bildet die Zusage der Schule ab, `terminstatus` bildet ab, ob die *Termine* real sind. Beide Felder sind unabhängig voneinander.
- `Muster.bis` wird optional; alternativ kann `anzahl_termine` gesetzt werden. Genau eines der beiden muss vorhanden sein (Konsumenten der neuen Schnelleinrichtung nutzen `anzahl_termine`, der bestehende Restkapazitäts-Planer nutzt weiterhin `bis`).
- Die Felder `kontaktzeit_h` (Einheit/Muster) behalten ihren internen Namen. Es ändert sich nur das UI-Label auf „Unterrichtszeit" (siehe Abschnitt 3). Export/Import-JSON bleibt unverändert kompatibel.

## 2. Berechnungslogik (`src/lib/berechnung.ts`)

- Vor der Bedarfsermittlung pro Woche werden Reihen mit `terminstatus === 'offen'` aus der Berechnung ausgeschlossen (ihre Einheiten tragen 0 zum Bedarf bei). Reihen mit `teilweise_festgelegt` zählen normal mit ihren aktuellen/angenommenen Terminen.
- Der Ausschluss betrifft nur den Bedarfs-Anteil der Reihe (Einsatz-Aufwand); die Koordinationspauschale pro Schule bleibt unabhängig davon bestehen, solange die Schule mindestens eine nicht-offene Reihe hat. Hat eine Schule *ausschließlich* offene Reihen, entfällt auch die Koordinationspauschale für sie in dem Zeitraum (keine aktive Reihe im Sinne von Abschnitt 4.2 des Konzepts).
- Die Ampel-Antwort, Engpass-Berichte und alle abgeleiteten Werte verwenden automatisch die gefilterte Zahl, da sie auf denselben Wochenergebnissen aufbauen.

## 3. UI: Schnelleinrichtung & Terminstatus (`ReihenEditor.tsx`, `SchuleAkkordionItem.tsx`)

Jede Reihe bekommt oberhalb der Termin-Tabelle einen neuen Einrichtungsblock:

- **Unterrichtszeit** (Minuten pro Termin), **Startdatum**, **Anzahl Termine**, Button **„Termine generieren"**.
  - Erzeugt beim Klick genau `anzahl_termine` wöchentliche Termine ab dem Startdatum, wobei Ferienwochen übersprungen werden (nicht mitgezählt — die Zählung läuft weiter, bis die gewünschte Anzahl realer Schulwochen erreicht ist).
  - Diese Erzeugung nutzt eine **neue, eigenständige Funktion** in `kalenderwochen.ts` (Arbeitsname `generiereWochentlicheTermine`), getrennt von der bestehenden `expandiereMuster`, damit der unveränderte Restkapazitäts-Planer nicht mit angefasst wird.
  - Ersetzt die aktuelle Terminliste der Reihe. Ist die Liste nicht leer, fragt ein Bestätigungsdialog (`window.confirm`) vor dem Ersetzen nach.
  - Der erste generierte Termin erhält `erstdurchfuehrung: true`, alle weiteren `false` (Standardannahme für neu angelegte Reihen).
- **Terminstatus**-Auswahl (Radio/Select): „Festgelegt" / „Teilweise festgelegt" / „Offen". Steuert direkt `Reihe.terminstatus`.
- Die Termin-Tabelle erhält eine neue Spalte **Thema** (Select: Ernährung / Stadtgrün / Mobilität / Energie / — kein Thema —) neben den bestehenden Spalten.
- Die Spaltenüberschrift „Kontaktzeit (min)" wird zu **„Unterrichtszeit (min)"** umbenannt (nur Anzeige, siehe Abschnitt 1).
- Reihen mit `terminstatus: 'offen'` erhalten in der Akkordion-Übersicht ein visuelles Badge (z. B. „offen – zählt nicht in der Bedarfsrechnung"), damit sichtbar ist, warum sie keine Stunden beisteuern.

## 4. Wochenanzeige: Datumsspanne statt KW-Code

Neue Funktion in `kalenderwochen.ts`, z. B. `formatWochenspanne(wochenKey: string): string`, die aus einem KW-Key wie `2026-KW46` den Montag und Sonntag dieser ISO-Woche ermittelt und als `„09.11.–15.11.2026"` formatiert (deutsches Datumsformat, `date-fns` `format`).

Wird überall eingesetzt, wo aktuell ein KW-Code angezeigt wird:
- `WochenHeatmap` (Tooltip-Text)
- `BedarfAngebotChart` (X-Achsen-Beschriftung/Tooltip)
- `EngpassBericht` (Liste der Top-Engpasswochen)
- Neue Themen-Übersicht (Abschnitt 5)

Der interne `wochenKey` (`YYYY-KWnn`) bleibt als Datenschlüssel und für Sortierung/Vergleiche unverändert bestehen — nur die Anzeige ändert sich.

## 5. Neue Übersicht: Schulen × Wochen × Thema

Neue Komponente, z. B. `ThemenUebersicht.tsx`, unterhalb des bestehenden Engpass-Berichts eingehängt:

- **Datengrundlage:** alle Einheiten aus nicht-offenen Reihen mit `wir_begleiten: true`, gruppiert nach Woche. Pro (Woche, Schule, Thema)-Kombination werden die Stunden aufsummiert. Einheiten ohne Thema laufen unter „Ohne Thema".
- **Tabelle:** Zeilen = Woche (als Datumsspanne) → Schule → Thema → Stunden, sortiert chronologisch.
- **Balkendiagramm** oberhalb der Tabelle: ein Balken pro Woche mit Aktivität (Wochen ganz ohne Einsatz werden nicht angezeigt, um das Diagramm nicht unnötig zu strecken), gestapelt nach Thema mit je einer festen Farbe pro Thema plus einer neutralen Farbe für „Ohne Thema". Höhe/Breite des Diagramms richten sich nach der tatsächlichen Datenspanne (kein fixer, oft halbleerer Kasten); bei vielen Wochen scrollt der Chart horizontal statt zusammengequetscht zu werden.

## 6. Persistenz (`useAppData.ts`)

- Der bestehende Hook wird um `localStorage` erweitert: beim Start wird versucht, gespeicherte Daten unter einem festen Schlüssel (z. B. `kapazitaetsrechner:data`) zu laden und gegen dieselben Pflichtfelder wie beim JSON-Import zu validieren; bei Erfolg werden sie statt der Seed-Daten verwendet, sonst greift `data.json` wie bisher.
- Jede Zustandsänderung wird automatisch nach `localStorage` geschrieben (z. B. per `useEffect` auf `data`).
- **Migration alter Daten:** Fehlt beim Laden (aus `localStorage` oder Import) einer Reihe das Feld `terminstatus`, wird es beim Einlesen auf `'festgelegt'` gesetzt, damit ältere JSON-Exporte weiter funktionieren.
- Der bestehende Export-Button bleibt der Weg, eine aktualisierte `data.json` herunterzuladen und ins Repo zu committen, wenn die geänderten Daten dauerhaft für alle Geräte/Deployments gelten sollen.
- Neuer Button „Zurücksetzen auf Ausgangsdaten" neben Export/Import: löscht den `localStorage`-Eintrag und lädt `data.json` neu, als Fluchtweg falls die lokal gespeicherten Daten defekt/unerwünscht sind.

## 7. Seed-Daten-Korrekturen (`src/data/data.json`)

`terminstatus` je Reihe gemäß aktuellem Rückmeldestand:

| Terminstatus | Schulen / Reihen |
|---|---|
| `festgelegt` | WDG (Theorieblöcke), Berufskolleg Barmen (Projektwochen), Hauptschule Hügelstraße, Alexander-Coppel-Gesamtschule (UNESCO-Stunde) |
| `teilweise_festgelegt` | Else Lasker – Parisa, Else Lasker – Simone, Else Lasker – Olaf, Realschule Max Planck, Bayreuther Gymnasium |
| `offen` | Gym. Sedanstraße (GNU-Kurs), Gym. Kothen (SoWi/Physik/Politik) |

Zusätzlich:
- `thema: 'Mobilität'` für alle Einheiten der Reihe „Parisa, Kl. 9, Mobilität" (Else Lasker).
- `thema: 'Ernährung'` für alle Einheiten der Reihe „Simone, Q2, Ernährung" (Else Lasker).
- Für Sedanstraße und Kothen bleiben die bestehenden (ursprünglich angenommenen) Termine als Datensatz erhalten, zählen aber wegen `terminstatus: 'offen'` nicht mehr in die Bedarfsrechnung — kein Datenverlust, aber korrekte Auswirkung auf die Auslastung.

### Offener Punkt (nicht Teil dieser Umsetzung)

Die Notiz zu Olaf/Else Lasker („Club Klimaresistente Schule nächstes Schuljahr") deutet darauf hin, dass diese Reihe im Schuljahr 2027/28 liegt, außerhalb des aktuellen Planungszeitraums (`2026-09-01` bis `2027-07-16`). Die Seed-Daten behalten vorerst die bestehenden Termine (laufendes Schuljahr) und werden nur mit `terminstatus: 'teilweise_festgelegt'` versehen; eine Verschiebung der Termine ins nächste Schuljahr erfolgt nicht automatisch, sondern wird dem Nutzer zur manuellen Prüfung überlassen (ggf. in einer separaten Anpassung).

## 8. Teststrategie

Konsistent mit dem bestehenden Muster (reine Funktionen in `src/lib` mit Vitest, Komponenten mit Testing Library):
- `kalenderwochen.test.ts`: Tests für `formatWochenspanne` und die neue Terminerzeugungs-Funktion (inkl. Ferien-Aussparung, exakte Anzahl trotz übersprungener Wochen).
- `berechnung.test.ts`: Testfall, der zeigt, dass eine `offen`-Reihe nicht in den Wochenbedarf einfließt, während `teilweise_festgelegt` normal zählt.
- Komponententests für `ReihenEditor` (Schnelleinrichtung erzeugt erwartete Termine, Terminstatus- und Thema-Auswahl ändern den Zustand korrekt) und die neue `ThemenUebersicht`.
- `useAppData.test.ts`: Persistenz-Roundtrip über einen gemockten `localStorage`, sowie Migration fehlender `terminstatus`-Felder.

## Out of Scope

- Keine Umsetzung von „Direct GitHub commit-back" (Token-basiertes automatisches Committen) — bewusst auf Browser-Autosave + manuellen Export begrenzt.
- Keine automatische Verschiebung der Olaf-Reihe ins nächste Schuljahr (siehe offener Punkt oben).
- Keine Änderung des internen Feldnamens `kontaktzeit_h` (nur UI-Label).
- Keine Einführung einer Personen-Zuordnung pro Termin (Konzept-Stufe 2) — außerhalb dieser Anfrage.
