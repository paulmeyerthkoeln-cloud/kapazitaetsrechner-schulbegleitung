# Design: Koordinationszeit — Zeitraum-Bindung, Editierbarkeit, Sichtbarkeit

## Kontext

Der Kapazitätsrechner zeigt in Diagrammen einen konstanten Bedarfs-Sockel von ~3,23 h pro Woche, der unabhängig von der Begleitungs-Auswahl (`wir_begleiten`) und unabhängig davon, ob eine Reihe in der jeweiligen Woche überhaupt läuft, immer anfällt. Ursache: `berechneBedarfProWoche` (in `src/lib/berechnung.ts`) addiert die Koordinationszeit einer Schule (`koordination_h_pro_monat` bzw. globaler Default `settings.koordination_h_pro_schule_pro_monat`), sobald die Schule irgendwo im gesamten Datenbestand mindestens eine Einheit besitzt (`hatReihenMitEinheiten`) — für **jede** Woche im ganzen Planungszeitraum, auch Monate vor Reihenbeginn oder nach Reihenende.

Dieses Design behebt drei zusammenhängende Probleme:

1. **Zeitraum-Bindung:** Koordination soll nur in Wochen anfallen, in denen mindestens eine Reihe der Schule tatsächlich läuft (zwischen erstem und letztem Termin), nicht das ganze Schuljahr über. Sie bleibt bewusst **unabhängig von `wir_begleiten`** — auch Modell X (z. B. Hauptschule Hügelstraße, dort läuft nie eine Einheit mit `wir_begleiten: true`) braucht laut Konzept weiterhin Abstimmungsaufwand, solange die Reihe zeitlich läuft.
2. **Editierbarkeit:** Der Pro-Schule-Override `koordination_h_pro_monat` ist aktuell nur über `data.json` änderbar. Er bekommt ein Eingabefeld im UI.
3. **Sichtbarkeit:** Koordination ist aktuell unsichtbar im Gesamtbedarf verschwunden. Sie wird als eigener Posten ausgewiesen (Diagramm + Bericht).

Der globale Default-Wert (`settings.koordination_h_pro_schule_pro_monat`) bekommt in diesem Schritt **kein** UI-Feld — nur der Pro-Schule-Override wird editierbar.

## 1. Zeitraum-Logik

Neue Funktion `berechneReiheZeitraum(reihe: Reihe): { von: string; bis: string } | null` in `src/lib/kalenderwochen.ts`:

- Wandelt jedes `einheit.datum_oder_kw` der Reihe via vorhandenem `parseZuWochenKey` in einen Wochenschlüssel (`YYYY-KWnn`) um.
- Gibt `{ von: min, bis: max }` zurück (lexikografischer String-Vergleich ist korrekt, da Jahr 4-stellig und Woche 2-stellig nullgepolstert ist — funktioniert auch über Jahresgrenzen hinweg, z. B. `"2026-KW46" < "2027-KW01"`).
- Reihen ohne Einheiten liefern `null`.

In `berechneBedarfProWoche` (`src/lib/berechnung.ts`) wird `hatReihenMitEinheiten` (zeitunabhängige Prüfung) ersetzt durch eine Prüfung, ob der aktuelle `wochenKey` in den Zeitraum **mindestens einer** Reihe der Schule fällt (`von <= wochenKey <= bis`). Die Koordination wird weiterhin **einmal pro Schule** pro aktiver Woche gezählt (nicht pro Reihe), analog zum bisherigen Verhalten.

## 2. Datenmodell / Berechnung: Aufsplittung Einsatz/Koordination

`WochenErgebnis` (in `berechnung.ts`) bekommt zwei zusätzliche Felder:

```ts
export interface WochenErgebnis {
  wochenKey: string
  bedarf: number          // = einsatzBedarf + koordinationBedarf
  einsatzBedarf: number   // neu
  koordinationBedarf: number // neu
  angebot: number
  auslastung: number
  ampel: AmpelFarbe
  istFerien: boolean
}
```

`berechneBedarfProWoche` wird zu einer Funktion, die `{ einsatzBedarf, koordinationBedarf }` zurückgibt statt einer einzelnen Zahl; `berechneWochenuebersicht` summiert beide zu `bedarf` wie bisher für Auslastung/Ampel-Logik.

## 3. UI: Editierbarkeit

- `useAppData.ts`: neue Handler-Funktion `setSchuleKoordination(schuleId: string, wert: number)`, analog zu bestehenden Setter-Mustern (z. B. `setPerson`), aktualisiert `schule.koordination_h_pro_monat` unveränderlich im State.
- `SchulenTabelle.tsx`: neue Spalte "Koordination h/Monat" mit einem `<input type="number">` pro Zeile. Angezeigter/editierbarer Wert: `schule.koordination_h_pro_monat ?? settings.koordination_h_pro_schule_pro_monat`. Da eine Schule mit mehreren Reihen mehrfach als Tabellenzeile erscheint (z. B. Else Lasker dreimal), wirkt eine Änderung auf allen Zeilen dieser Schule identisch — das bestehende Zeilenformat bleibt unverändert, eine Restrukturierung (Gruppierung pro Schule) ist Teil eines späteren UI-Umbaus (Tabs/Accordion) und nicht Teil dieses Designs.

## 4. UI: Sichtbarkeit

- `BedarfAngebotChart.tsx`: Der bisherige einfarbige "Bedarf"-Balken wird durch zwei gestapelte Recharts-`Bar`-Serien ersetzt: "Einsatz" (dunkelblau, wie bisher) unten, "Koordination" (hellblau) oben (gleicher `stackId`). Angebot-Balken und Schwellwertlinien bleiben unverändert.
- `EngpassBericht.tsx`: Zeilentext wird erweitert, z. B. `13,3h Bedarf (10,4h Einsatz + 2,9h Koordination) / 32h Angebot`.

## Tests

Ergänzungen in `berechnung.test.ts`:

- Koordination fällt **nicht** an in Wochen vor dem ersten bzw. nach dem letzten Termin einer Reihe.
- Koordination fällt **weiterhin** an für eine Reihe, deren Einheiten alle `wir_begleiten: false` haben (Modell X), solange die Woche im Reihen-Zeitraum liegt.
- Bei mehreren Reihen einer Schule mit unterschiedlichen Zeiträumen: Koordination fällt an, sobald mindestens eine Reihe aktiv ist; keine Doppelzählung, wenn mehrere gleichzeitig aktiv sind.
- Regressionscheck: `einsatzBedarf + koordinationBedarf === bedarf` für alle Wochen; Handrechnungs-Beispiel aus Abschnitt 9 des Konzepts (KW 46/2026, erwartete Auslastung 41,4 %) bleibt unverändert korrekt.
- Neuer Test für `berechneReiheZeitraum`: korrekte Min/Max-Bestimmung über Jahresgrenzen hinweg, `null` bei leerer Einheitenliste.

Ergänzung in `useAppData.test.ts`: `setSchuleKoordination` aktualisiert den Override korrekt und lässt andere Schulen unverändert.
