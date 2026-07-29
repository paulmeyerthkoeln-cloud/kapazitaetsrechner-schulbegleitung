# Berechnungstool: Vier Änderungswünsche (Kursname-Breite, Umverteilung im Graph, Personen-Zeitraum, Projekttag)

## Context

Vier unabhängige, klar umrissene Änderungen, gemeinsam angefragt und gebündelt (Vorbild: `2026-07-07-berechnungstool-quick-fixes-design.md`).

## 1. Kursname-Feld verbreitern

`ReihenEditor.tsx:55` — `<input type="text" aria-label="Titel" value={reihe.titel} .../>` hat keine explizite Breite und fällt auf die Browser-Default-Breite (~20 Zeichen) zurück, wodurch lange Kursnamen abgeschnitten wirken.

**Change:** Input bekommt `style={{ width: '100%' }}`, damit der komplette Kursname sichtbar ist. Kein Layout-Wrapper nötig, das Input steht bereits allein in einer Zeile.

## 2. Personen-Umverteilung im Wochenübersichtsgraphen sichtbar machen

**Root cause:** `berechneWochenuebersicht()` (`berechnung.ts:93`) berechnet `angebot` über `berechneAngebotProWoche(data.personen, montag)`, welches nur `berechnePersonKapazitaetsbasis()` pro Person summiert — `data.personenUmverteilungen` wird hier komplett ignoriert. Die Umverteilungs-Logik existiert bereits korrekt in `personenKapazitaet.ts` (`berechnePersonenKapazitaet()`, Zeilen 69-71: `eingehend - ausgehend` pro Woche), wird aber nur für die "Verbleibend"-Anzeige im `PersonenUmverteilung`-Screen genutzt, nicht für den `BedarfAngebotChart`.

**Change:**
- `berechneAngebotProWoche(personen, wochenStartMontag)` bekommt einen neuen optionalen Parameter `personenUmverteilungen: PersonenUmverteilung[]` und addiert pro Person `eingehend - ausgehend` für die jeweilige Woche zur Basis-Kapazität (gleiche Berechnung wie `personenKapazitaet.ts:69-71`, per `getISOWochenKey(wochenStartMontag)`).
- `berechneWochenuebersicht(data)` übergibt `data.personenUmverteilungen ?? []` an `berechneAngebotProWoche`.
- Ergebnis: Verschiebt man 6 Std von Woche X nach Y für Person P, sinkt `angebot` in Woche X um 6 und steigt in Woche Y um 6 — sichtbar im `BedarfAngebotChart` (Angebot-Balken) und in der Ampel/Auslastung.
- Kapazität wird nicht negativ durch Umverteilung allein reduziert unter 0 (gleiche Toleranz wie bisher — keine zusätzliche Kappung nötig, da `PersonenUmverteilung`-UI bereits über `berechneVerbleibendePersonenstunden` verhindert, dass mehr umverteilt wird als in der Quellwoche verfügbar ist).

## 3. Zeitraum im Projekt für Personen (mit Kalenderauswahl)

`Person.aktiv_ab` / `Person.aktiv_bis` existieren bereits im Datenmodell (`types.ts:17-18`) und werden in `berechnePersonKapazitaetsbasis()` (`berechnung.ts:56-58`) bereits für die Kapazitätsberechnung ausgewertet (außerhalb des Zeitraums = 0 Kapazität in der jeweiligen Woche). Neue Personen bekommen bereits automatisch den gesamten Planungszeitraum als Default (`useAppData.ts:210-211`). Es fehlt nur die UI zum Anzeigen/Bearbeiten.

**Change:** `PersonenTabelle.tsx` bekommt eine neue Spalte "Zeitraum im Projekt" mit zwei `<input type="date">` (von = `aktiv_ab`, bis = `aktiv_bis`), analog zum bestehenden Urlaub-Von/Bis-Pattern (Zeilen 65-80). Änderungen laufen über das existierende `onChange(p.id, { aktiv_ab })` / `onChange(p.id, { aktiv_bis })` (gleicher Callback wie für Name/Stunden, kein neuer Callback-Typ nötig).

## 4. "Projekttag" als Marker für den Theorie→Praxis-Übergang

Projekttage haben kein festes inhaltliches Thema (Schüler:innen wählen frei) — anders als `Ernährung`/`Stadtgrün`/`Mobilität`/`Energie`. Trotzdem nutzen wir für die Umsetzung dieselbe technische Stelle (`thema`-Feld pro Einheit/Termin), da das bestehende Gantt-Gruppierungs- und Farb-System (`themenUebersicht.ts`, `ThemenUebersicht.tsx`) darüber bereits alles Nötige (Gruppierung aufeinanderfolgender Wochen, Legende, Balken) bietet — der Wert `'Projekttag'` bedeutet hier "Marker", nicht "Fachthema".

**Change:**
- `Thema`-Typ (`types.ts:40`) erweitern: `'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie' | 'Projekttag'`.
- `THEMEN`-Arrays in `ReihenEditor.tsx:8` und `VeranstaltungenUebersicht.tsx:6` um `'Projekttag'` ergänzen (gleiche Dropdown-Stelle wie die anderen Themen).
- `THEMEN_FARBEN` in `ThemenUebersicht.tsx:8-14` bekommt einen eigenen, auffälligen Farbwert für `Projekttag` (z.B. `#6b4c9a`, klar unterscheidbar von den bestehenden vier Themenfarben + Ferien-Grau).
- **Trennlinie:** In `ThemenUebersicht.tsx` wird zusätzlich zum normalen Themen-Balken pro Zeile, in der ein `Projekttag`-Balken vorkommt, eine vertikale Trennlinie unmittelbar vor dem Balkenstart gerendert — volle Zeilenhöhe dieser einen Kurs/Themenwoche-Zeile (nicht über die ganze Grafik), in einer vom Balken abweichenden Akzentfarbe (z.B. `#d62728`, kräftiges Rot), damit der Wechsel Theorie→Praxis auf einen Blick auffällt. Umsetzung als zusätzliches Overlay-Element analog zu den bestehenden Ferien-Bändern (`ferienBaender.map(...)`, Zeilen 60-70), positioniert per `gridColumn`/`gridRow` an der Startspalte des jeweiligen Projekttag-Balkens.
- Kommt "Projekttag" mehrfach in derselben Reihe vor (mehrere Gruppen), bekommt jede eine eigene Trennlinie.

## Testing

- Bestehende Tests aktualisieren/erweitern: `ReihenEditor.test.tsx` (Titel-Breite ggf. nicht testbar/relevant, überspringen falls nur Style), `berechnung.test.ts`/`useAppData.test.ts` (Umverteilung beeinflusst `berechneWochenuebersicht`-Ergebnis), `PersonenTabelle.test.tsx` (neue Zeitraum-Inputs, Default = Planungszeitraum), `ThemenUebersicht.test.tsx` (Projekttag-Farbe + Trennlinie), `VeranstaltungenUebersicht.test.tsx`/`ReihenEditor.test.tsx` (Projekttag im Thema-Dropdown wählbar).
- `npm test` und `npm run build`/Typecheck vor Abschluss.

## Out of scope

- Keine Änderung an der Bedarfsrechnung durch `Projekttag` (zählt wie jedes andere `thema`-Feld nicht in die Bedarfslogik, die ist unabhängig von `thema`).
- Keine automatische Verschiebung/Validierung, falls `aktiv_bis` vor `aktiv_ab` liegt (gleiches Verhalten wie bestehende Urlaubs-Zeiträume: keine Validierung).
