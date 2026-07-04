# Design: Termine (Einheiten) pro Reihe editierbar machen

## Kontext

Der Kapazitätsrechner zeigt pro Reihe (`ReihenEditor.tsx`) bereits eine Tabelle ihrer Termine (Einheiten) mit Index, Datum/KW, Kontaktzeit und der "Wir begleiten"-Checkbox. Datum und Kontaktzeit werden nur als Text angezeigt; es gibt keine Möglichkeit, sie zu bearbeiten, neue Termine hinzuzufügen oder bestehende zu löschen — Änderungen sind nur über direktes Bearbeiten von `data.json` möglich. Das betrifft besonders die Platzhalter-Reihe "Schule X" (10. Schule): ihre Seed-Termine lassen sich im UI weder anpassen noch ersetzen, wodurch die 10. Schule im UI faktisch nicht befüllbar ist.

Dieses Design macht Termine direkt im `ReihenEditor` bearbeitbar: hinzufügen, löschen, und Datum/Kontaktzeit bestehender Termine ändern. Das Anlegen neuer Reihen oder Schulen bleibt außerhalb des Scopes — es geht ausschließlich um Termine innerhalb einer bereits existierenden Reihe.

## 1. Datenmodell

Keine Änderungen am bestehenden `Einheit`-Typ (`src/lib/types.ts`) nötig — alle benötigten Felder existieren bereits (`datum_oder_kw`, `kontaktzeit_h`, `personen_parallel`, `erstdurchfuehrung`, `wir_begleiten`, `typ`).

## 2. State: neue Handler in `useAppData.ts`

Drei neue Funktionen, nach dem bestehenden unveränderlichen Update-Muster von `setEinheitBegleitung`:

- `addEinheit(reiheId: string): void` — hängt eine neue Einheit an die Reihe an mit: `datum_oder_kw` = heutiges Datum (`format(new Date(), 'yyyy-MM-dd')`), `kontaktzeit_h: 1.5`, `personen_parallel: 1`, `erstdurchfuehrung: false`, `wir_begleiten: true`, `typ: 'regulaer'`, `id` per `crypto.randomUUID()`, `index` = `reihe.einheiten.length + 1`.
- `removeEinheit(reiheId: string, einheitId: string): void` — entfernt die Einheit mit passender `id` aus der Reihe und nummeriert die verbleibenden Einheiten der Reihe neu durch (`index` 1..N in Array-Reihenfolge). Die Neunummerierung ist rein für die Anzeige — die Berechnungslogik verwendet `index` nirgends.
- `setEinheitFelder(reiheId: string, einheitId: string, patch: Partial<Pick<Einheit, 'datum_oder_kw' | 'kontaktzeit_h'>>): void` — aktualisiert `datum_oder_kw` und/oder `kontaktzeit_h` der passenden Einheit.

Alle drei folgen exakt dem bestehenden Verschachtelungsmuster von `setEinheitBegleitung` (Schule → Reihe → Einheit, per `.map()`).

## 3. UI: `ReihenEditor.tsx`

- **Kontaktzeit-Spalte:** wird zu einem `<input type="number" step={5} min={0}>` in **Minuten**. Anzeige-/Eingabewert = `Math.round(einheit.kontaktzeit_h * 60)`. Bei Änderung: `onEinheitFelderChange(einheitId, { kontaktzeit_h: minuten / 60 })`.
- **Datum/KW-Spalte:** wird zu einem `<input type="text">`, vorbefüllt mit `einheit.datum_oder_kw`, Platzhalter `"YYYY-MM-DD oder YYYY-KWnn"`. Bei Änderung: `onEinheitFelderChange(einheitId, { datum_oder_kw: wert })`. Keine Format-Validierung über das hinaus, was die bestehende Berechnungslogik ohnehin toleriert (ein nicht parsbarer String zählt schlicht in keiner Woche — kein neues Risiko).
- **Neue Löschen-Spalte:** ein 🗑-Button pro Zeile, ruft sofort `onEinheitRemove(einheitId)` auf — keine Bestätigung.
- **Neue "Termin hinzufügen"-Zeile** am Tabellenende: ein Button "+ Termin hinzufügen", der `onEinheitAdd()` aufruft (fügt eine neue Einheit mit den in Abschnitt 2 genannten Defaultwerten hinzu; die neue Zeile ist danach über die bereits vorhandenen Kontaktzeit-/Datum-/Checkbox-Felder sofort weiter bearbeitbar).

`personen_parallel`, `erstdurchfuehrung` und `typ` bleiben ohne eigenes UI-Feld (wie bisher) — Defaultwerte gelten für neu angelegte Termine, bestehende Werte bleiben beim Bearbeiten von Datum/Kontaktzeit unangetastet.

## 4. Wiring: `App.tsx`

`ReihenEditor` bekommt drei neue Props (`onEinheitAdd`, `onEinheitRemove`, `onEinheitFelderChange`), gespeist aus den neuen `useAppData()`-Handlern, analog zum bestehenden `onEinheitToggle`.

## Tests

- `useAppData.test.ts`: je ein Test für `addEinheit` (neue Einheit mit korrekten Defaults, `index` korrekt, andere Reihen/Schulen unverändert), `removeEinheit` (Einheit entfernt, verbleibende neu durchnummeriert, andere Reihen unverändert), `setEinheitFelder` (aktualisiert nur die passende Einheit, andere Felder derselben Einheit bleiben unverändert).
- Neue `ReihenEditor.test.tsx`: Rendert eine Reihe mit 2 Einheiten; Tests für: Kontaktzeit-Eingabe zeigt Minuten (z. B. 1.5h → "90"), Ändern der Minuten ruft den Callback mit korrektem `kontaktzeit_h` auf, Ändern des Datumsfelds ruft den Callback mit dem rohen String auf, Klick auf 🗑 ruft `onEinheitRemove` mit der richtigen `einheitId` auf, Klick auf "+ Termin hinzufügen" ruft `onEinheitAdd` auf.
