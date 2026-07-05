# Design: Themen-Gantt, Ferien-Umverteilung mit Kappung, Ferien-Warnung & Datenkorrekturen

**Datum:** 2026-07-05
**Status:** Vom Nutzer freigegeben, bereit für Umsetzungsplan

## Ausgangslage

Der Terminstatus (`festgelegt`/`teilweise_festgelegt`/`offen`) in `src/data/data.json` wurde geprüft und stimmt bereits exakt mit dem aktuellen Rückmeldestand überein (WDG, Berufskolleg Barmen, Hügelstraße, Alexander-Coppel = `festgelegt`; Else Lasker, Max Planck, Bayreuther Gymnasium = `teilweise_festgelegt`; Sedanstraße, Kothen = `offen`). Daran ändert sich nichts.

Vier echte Probleme bleiben:

1. **Themen-Übersicht** (`ThemenUebersicht.tsx`) zeigt aktuell einen nach Thema gestapelten Stunden-Balken pro Woche plus eine Tabelle darunter. Gewünscht ist stattdessen ein Gantt-artiger Kalender: Zeilen = Schulen/Kurse, X-Achse = KWs, Balken = Zeitraum eines Themas mit dem Thema als Beschriftung auf dem Balken selbst.
2. **Kapazitäts-Umverteilung** (`KapazitaetsUmverteilung.tsx`) lässt beliebig viele Stunden aus einem benannten Ferienzeitraum (nicht einer konkreten Woche) in eine Zielwoche verschieben, ohne zu prüfen, ob in dem Zeitraum überhaupt noch ungenutzte Kapazität übrig ist.
3. Es gibt keine Warnung, wenn ein Termin versehentlich auf eine Ferienwoche fällt, und die Ferien sind in keinem Chart als Zeitraum markiert (nur in der `WochenHeatmap`, dort aber nicht bezogen auf Themen/Reihen).
4. **Unterrichtszeiten sind an drei Stellen falsch hinterlegt:**
   - Alexander-Coppel: `kontaktzeit_h: 1.1` (66 Min.) statt der tatsächlich vereinbarten 65 Min.
   - Else Lasker (Parisa, Simone, Olaf): `kontaktzeit_h: 2` (120 Min.) bzw. `4` (240 Min., Exkursionen) statt einheitlich 90 Min. — die Exkursionen sind inhaltlich noch nicht geplant, deshalb vorerst auch auf 90 Min.
   - WDG selbst ist in `data.json` bereits korrekt (4 Std./Termin). Zeigt der Browser des Nutzers trotzdem 90 Min., liegt das an einem lokal gespeicherten `localStorage`-Stand (siehe Abschnitt 6) und nicht an den Seed-Daten.
   - Ursache für zukünftige Fälle dieser Art: Die Schnelleinrichtung (`ReihenEditor.tsx`) startet ihr Vorschlagsfeld „Unterrichtszeit“ immer hart bei 90 Min., unabhängig von den bereits in der Reihe hinterlegten Terminen. Klickt man versehentlich „Termine generieren“, überschreibt das die echten Werte mit 90 Min. — vermutlich so beim WDG im Browser des Nutzers passiert.

## Ziel

1. Seed-Daten korrigieren (Alexander-Coppel, Else Lasker).
2. Schnelleinrichtung: Vorschlagswert für „Unterrichtszeit“ aus den bestehenden Terminen der Reihe ableiten statt hart auf 90 Min. zu setzen, damit dieser Fehler nicht wieder auftritt.
3. Themen-Übersicht als Gantt-Chart neu bauen (Zeilen = Reihen, X-Achse = KWs, Balken = Themenzeiträume, Ferien als Hintergrundbänder).
4. Kapazitäts-Umverteilung auf eine konkrete Quell-Woche mit gedeckelter Restkapazität umstellen.
5. Warnung ergänzen, wenn ein Termin auf eine Ferienwoche fällt.

## 1. Seed-Daten-Korrekturen (`src/data/data.json`)

- **Alexander-Coppel** (`reihe_coppel_unesco`, 10 Einheiten `coppel_e1`–`coppel_e10`): `kontaktzeit_h` von `1.1` auf `1.0833333333333333` (= 65/60 Std., rundet in der UI exakt auf 65 Min.).
- **Else Lasker**, alle drei Reihen, alle Einheiten:
  - `reihe_else_lasker_parisa` (4 Einheiten inkl. der Exkursion `el_parisa_e3`): `kontaktzeit_h` einheitlich auf `1.5` (90 Min.).
  - `reihe_else_lasker_simone` (6 Einheiten inkl. der Exkursion `el_simone_e4`): `kontaktzeit_h` einheitlich auf `1.5`.
  - `reihe_else_lasker_olaf` (8 Einheiten, aktuell durchgehend `2`): `kontaktzeit_h` einheitlich auf `1.5`.
  - `organisationspauschale_h: 2` auf den beiden Exkursions-Einheiten bleibt unverändert — das ist ein separater Organisationsaufwand, keine Unterrichtszeit.
- WDG bleibt unverändert (bereits korrekt bei 4 Std.).

## 2. Schnelleinrichtung: abgeleiteter Standardwert (`src/lib/besetzung.ts`, `ReihenEditor.tsx`)

Neue Funktion neben `berechneUnserAnteil`:

```ts
export function ermittleHaeufigsteKontaktzeit(einheiten: Einheit[]): number | null
```

- Zählt die Häufigkeit jedes `kontaktzeit_h`-Werts unter den übergebenen Einheiten und gibt den häufigsten zurück (bei Gleichstand den zuerst gefundenen, stabil in Termin-Reihenfolge). Gibt `null` zurück, wenn `einheiten` leer ist.
- In `ReihenEditor.tsx` wird `useState(90)` für `schnellUnterrichtszeitMin` ersetzt durch eine Lazy-Initialisierung: `ermittleHaeufigsteKontaktzeit(reihe.einheiten)` in Minuten umgerechnet (`Math.round(wert * 60)`), oder `90`, falls die Reihe noch keine Einheiten hat.
- Wirkt sich nur auf den Vorschlagswert beim Öffnen aus; bestehende Termine in der Tabelle ändern sich nicht von selbst.

## 3. Themen-Gantt-Chart

### 3.1 Datengrundlage (`src/lib/themenUebersicht.ts`, ersetzt die bisherige `ThemenZeile`/`berechneThemenUebersicht`)

```ts
export interface ThemenGanttZeile {
  reiheId: string
  zeilenLabel: string        // "Schule – Reihentitel"
  balkenLabel: string        // Thema, oder Reihentitel als Fallback ohne Thema
  thema: Thema | null        // null = kein Thema hinterlegt (Farbe: neutrales Grau)
  startWochenKey: string
  endWochenKey: string
  stunden: number
}

export function berechneThemenGantt(data: Datenbestand): ThemenGanttZeile[]
```

- Betrachtet werden alle Reihen mit `terminstatus !== 'offen'` und darin alle Einheiten mit `wir_begleiten: true` (identisch zum bisherigen Filter).
- Je Reihe werden die Einheiten nach `thema` gruppiert (`einheit.thema ?? null`). Für jede Gruppe: `startWochenKey`/`endWochenKey` = kleinster/größter `parseZuWochenKey(einheit.datum_oder_kw)`, `stunden` = Summe der `kontaktzeit_h`. `balkenLabel` = `thema`, oder — wenn `thema === null` — der `reihe.titel`.
- Reihen ohne jede zählende Einheit (z. B. Hügelstraße, durchgängig `wir_begleiten: false`) erzeugen keine Zeile.
- **Randfall:** Trägt eine Reihe künftig mehrere unterschiedliche Themen auf verschiedenen Terminen, entstehen mehrere `ThemenGanttZeile`-Einträge mit identischem `zeilenLabel` (eine Zeile pro Thema-Gruppe) statt mehrerer Balken in einer Chart-Zeile — hält die Rendering-Logik einfach, deckt den aktuell einzigen echten Anwendungsfall (ein Thema pro Reihe) ab.
- Sortierung der Rückgabe: nach `startWochenKey` aufsteigend, bei Gleichstand nach `zeilenLabel`.

### 3.2 Ferien-Bänder (`src/lib/themenUebersicht.ts`)

```ts
export interface FerienBand {
  name: string
  startWochenKey: string
  endWochenKey: string
}

export function berechneFerienBaender(wochen: WochenErgebnis[]): FerienBand[]
```

- Läuft linear über die bereits vorhandene `WochenErgebnis[]`-Liste (die für den gesamten Planungszeitraum `istFerien`/`ferienName` je Woche schon enthält) und fasst aufeinanderfolgende Wochen mit demselben `ferienName` zu einem Band zusammen. Keine neue Datumsberechnung nötig.

### 3.3 Komponente (`ThemenUebersicht.tsx`, komplett neu)

Props: `zeilen: ThemenGanttZeile[]`, `wochen: WochenErgebnis[]`, `ferienWarnungen: FerienWarnung[]` (Abschnitt 5).

- **Leerer Zustand:** wie bisher ein Hinweistext, wenn `zeilen.length === 0`.
- **Warnbox** (Abschnitt 5) oberhalb des Charts, nur sichtbar wenn `ferienWarnungen.length > 0`.
- **Chart:** horizontales Balkendiagramm (recharts, `layout="vertical"`), Y-Achse = Kategorie `zeilenLabel` (eine Zeile pro `ThemenGanttZeile`), X-Achse = numerischer Wochenindex über `wochen` (ein Tick pro Woche, Beschriftung = KW-Nummer aus dem `wochenKey`, z. B. „KW46“).
- Jede `ThemenGanttZeile` wird als „Range-Bar“ gerendert (recharts unterstützt `[start, ende]`-Wertepaare je Balken): `[index(startWochenKey), index(endWochenKey) + 1]`, damit der Balken die volle Breite der enthaltenen Wochen abdeckt. Farbe: feste Palette je `thema` (aus der bisherigen `THEMEN_FARBEN`-Zuordnung), neutrales Grau wenn `thema === null`.
- **Beschriftung auf dem Balken:** eigene `shape`-Renderfunktion zeichnet Rechteck + Text (`balkenLabel`). Passt der Text (grob geschätzt über Zeichenanzahl × Zeichenbreite) in die Balkenbreite, wird er zentriert und kontrastfarben (weiß) auf dem Balken platziert; ist der Balken zu schmal, rutscht der Text stattdessen leicht über den Balken (in Themafarbe), statt abgeschnitten oder überlappend zu werden.
- **Ferien-Bänder:** für jedes `FerienBand` ein recharts `ReferenceArea` über die volle Zeilenhöhe (`x1=index(start)`, `x2=index(ende)+1`), helles, halbtransparentes Grau, mit dem Ferien-Namen als kleine Beschriftung am oberen Rand.
- **Tooltip beim Hover:** Schule/Kurs, Thema (bzw. „Kein Thema“), Zeitraum (`formatWochenspanne`), Gesamtstunden — ersetzt die entfallende Tabelle.
- Breite des Charts richtet sich nach der Anzahl Wochen (analog zur bisherigen `chartBreite`-Berechnung), horizontal scrollbar im bestehenden `overflowX: auto`-Wrapper. Höhe richtet sich nach der Anzahl Zeilen (fixe Zeilenhöhe × Anzahl `zeilen`, keine feste Kastenhöhe).
- Legende und Tabelle entfallen ersatzlos.

## 4. Ferien-Warnung (neue Datei `src/lib/ferienWarnung.ts`)

```ts
export interface FerienWarnung {
  schule: string
  reiheTitel: string
  einheitIndex: number
  datumOderKw: string
  ferienName: string
}

export function findeEinheitenInFerien(data: Datenbestand, wochen: WochenErgebnis[]): FerienWarnung[]
```

- Prüft **alle** Einheiten in **allen** Reihen, unabhängig von `terminstatus` und `wir_begleiten` — auch offene/angenommene Platzhalter-Termine sollen früh auffallen, falls sie zufällig in die Ferien fallen.
- Für jede Einheit: `wochenKey = parseZuWochenKey(einheit.datum_oder_kw)`; die Zuordnung zu einem Ferienband erfolgt über einen Lookup in der übergebenen `wochen: WochenErgebnis[]` (liefert `istFerien`/`ferienName` für diese Woche), damit keine eigene Datumslogik dupliziert werden muss.
- Ergebnis wird in `ThemenUebersicht.tsx` als Warnbox gerendert (Abschnitt 3.3), z. B.: „⚠️ 2 Termine liegen in den Ferien: WDG – Theorieblöcke Begabtenförderung, Termin 4 (14.–20.12.2026, Weihnachtsferien NRW); …“.

## 5. Ferien-Umverteilung: Kappung pro Quell-Woche

### 5.1 Datenmodell (`src/lib/types.ts`)

```ts
export interface Umverteilung {
  id: string
  quelleWochenKey: string   // NEU: konkrete Ferienwoche statt nur Zeitraumsname
  ferienName: string        // bleibt zur Anzeige (Name des Zeitraums, der diese Woche enthält)
  zielWochenKey: string
  zusatzStunden: number
}
```

### 5.2 Berechnung (`src/lib/berechnung.ts`)

```ts
export function berechneVerbleibendeFerienstunden(
  wochen: WochenErgebnis[],
  umverteilungen: Umverteilung[],
  quelleWochenKey: string
): number
```

- `verbleibend = angebotBasis der Quell-Woche − Summe der zusatzStunden aller bestehenden Umverteilungen mit demselben quelleWochenKey`, nach unten auf 0 begrenzt.
- Kein neues Feld in `WochenErgebnis` nötig — `angebotBasis` existiert dort bereits.

### 5.3 UI (`KapazitaetsUmverteilung.tsx`)

- Dropdown „Ferienzeitraum“ entfällt; stattdessen ein Dropdown **„Quell-Woche“** mit allen Wochen, für die `w.istFerien === true`, beschriftet z. B. „26.10.–01.11.2026 – Herbstferien NRW – noch 32 Std verfügbar“ (Reststunden über `berechneVerbleibendeFerienstunden`). Wochen mit 0 Reststunden erscheinen als deaktivierte Option („– ausgeschöpft“).
- `ferienName` wird nicht mehr separat ausgewählt, sondern aus der gewählten Quell-Woche übernommen (`wochen.find(w => w.wochenKey === quelleWochenKey)?.ferienName`).
- Dropdown „Ziel-Woche“ bleibt (nur `!w.istFerien`), Beschriftung wechselt von rohem `wochenKey` auf `formatWochenspanne` (kleine Konsistenz-Korrektur, war bisher als einzige Stelle noch nicht umgestellt).
- Eingabe „Zusatzstunden“: beim Klick auf „Hinzufügen“ wird der Wert automatisch auf die verbleibenden Reststunden der gewählten Quell-Woche gekappt (`Math.min(eingabe, verbleibend)`); ist `verbleibend <= 0`, ist der Button deaktiviert und es wird nichts hinzugefügt.
- Bestehende Liste zeigt neu `${zusatzStunden} Std aus ${formatWochenspanne(quelleWochenKey)} (${ferienName}) → ${formatWochenspanne(zielWochenKey)}` plus 🗑-Button wie bisher.

### 5.4 State & Migration (`src/state/useAppData.ts`)

- `addUmverteilung(quelleWochenKey: string, ferienName: string, zielWochenKey: string, zusatzStunden: number)`.
- `migriereDatenbestand`: bestehende `umverteilungen`-Einträge ohne `quelleWochenKey` (alte Exporte/localStorage-Stände) bekommen beim Laden die erste zum gespeicherten `ferienName` passende Woche zugewiesen (Suche über die Wochen des Planungszeitraums nach `ermittleFerienName(...) === ferienName`); ohne Treffer bleibt der Eintrag unverändert mit leerem `quelleWochenKey` (kann dann in der UI nicht mehr eindeutig zugeordnet werden — Randfall, aktuell keine echten Daten betroffen).

## 6. Hinweis zum Browser-Zustand des Nutzers

Die App speichert Änderungen automatisch in `localStorage` (bestehende Funktion). Zeigt der Browser des Nutzers für WDG aktuell 90 Min. statt der in `data.json` korrekten 240 Min., liegt das vermutlich daran, dass die fehlerhafte Schnelleinrichtung (Abschnitt 2) schon einmal für WDG benutzt wurde und dabei die echten Termine überschrieben hat — das betrifft nur den lokal gespeicherten Stand, nicht das Repository. Der Nutzer wurde informiert, nach dieser Umsetzung den bestehenden „Zurücksetzen auf Ausgangsdaten“-Button zu nutzen, falls sein Browser-Stand betroffen ist (das verwirft dann aber auch alle anderen manuellen Änderungen, die er im Browser gemacht hat).

## Tests

- `besetzung.test.ts`: `ermittleHaeufigsteKontaktzeit` — häufigster Wert korrekt, Gleichstand nimmt den zuerst gefundenen, `null` bei leerer Liste.
- `ReihenEditor.test.tsx`: Schnelleinrichtungs-Vorschlag zeigt den häufigsten vorhandenen Wert (z. B. 240 bei einer WDG-artigen Fixture), Fallback 90 bei einer Reihe ohne Einheiten.
- `themenUebersicht.test.ts`: `berechneThemenGantt` (Gruppierung nach Thema, Fallback auf Reihentitel, Ausschluss offener/nicht-begleiteter Reihen, Randfall mit zwei Themen in einer Reihe → zwei Zeilen), `berechneFerienBaender` (aufeinanderfolgende Ferienwochen zu einem Band zusammengefasst, mehrere getrennte Ferienzeiträume ergeben mehrere Bänder).
- `ferienWarnung.test.ts` (neu): Termin in Ferienwoche wird erkannt, Termin außerhalb nicht, mehrere Treffer über verschiedene Schulen hinweg.
- `berechnung.test.ts`: `berechneVerbleibendeFerienstunden` — korrekte Restkapazität bei 0/1/mehreren bestehenden Umverteilungen aus derselben Woche, nie negativ.
- `KapazitaetsUmverteilung.test.tsx`: Quell-Woche-Dropdown zeigt nur Ferienwochen, ausgeschöpfte Wochen deaktiviert, „Hinzufügen“ kappt auf Reststunden, deaktiviert bei 0 Reststunden.
- `useAppData.test.ts`: `addUmverteilung` mit neuer Signatur, Migration eines alten Umverteilung-Eintrags ohne `quelleWochenKey`.
- `data.test.ts`: neue Assertions für die korrigierten `kontaktzeit_h`-Werte (Coppel 65 Min., alle Else-Lasker-Einheiten 90 Min.).
- `ThemenUebersicht.test.tsx`: komplett neu für die Gantt-Darstellung (Zeilen, Warnbox erscheint nur bei Treffern, keine Tabelle/Legende mehr vorhanden).

## Out of Scope

- Die Olaf/Else-Lasker-Frage („Club Klimaresistente Schule nächstes Schuljahr“ vs. aktuell hinterlegtes laufendes Schuljahr) wird hier **nicht** gelöst — bleibt ein offener Punkt aus der letzten Spec, unabhängig von dieser Umsetzung.
- Keine automatische Korrektur des `localStorage`-Stands im Browser des Nutzers — nur der bestehende „Zurücksetzen“-Button steht dafür zur Verfügung (Abschnitt 6).
- Keine Änderung der Exkursions-Organisationspauschale (`organisationspauschale_h`) bei Else Lasker.
- Keine Mehrfach-Segment-Darstellung mehrerer Themen in einer einzigen Gantt-Zeile (Abschnitt 3.1 Randfall) — wird bei Bedarf später ergänzt.
