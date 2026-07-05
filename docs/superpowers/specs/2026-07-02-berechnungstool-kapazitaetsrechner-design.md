# Design: Kapazitätsrechner Schulbegleitung ("Berechnungstool")
## Projekt „Zukunft Wuppertal – Schulen gestalten Wandel"

**Status:** Approved (2026-07-02)
**Quelle:** Basiert auf `Berechnungstool/konzept_kapazitaetstool_schulbegleitung.md`, ergänzt um die Einheiten-Auswahl (Abschnitt 3a) und finale Ferientermine 2027.

**Zweck:** Ein lokales Planungstool ohne Backend, das beantwortet: *Schaffen wir es mit 4 (bzw. 5) Personen, 10 Schulen aktiv durch das Projekt zu begleiten – und wo liegen die Engpässe?*

---

## 1. Grundprinzip der Berechnung

Das Tool ist ein **Angebot-vs.-Bedarf-Modell in Personenstunden pro Kalenderwoche**.

- **Angebot (Supply):** Wie viele Stunden pro Woche stehen dem Team für aktive Schulbegleitung zur Verfügung?
- **Bedarf (Demand):** Wie viele Personenstunden erfordert jede Schule in welcher Kalenderwoche?
- **Ergebnis:** Auslastung pro Woche = Bedarf ÷ Angebot. „Schaffen wir 10 Schulen?" → *Ja, wenn in keiner Schulwoche die Auslastung über einem definierten Schwellwert liegt (Standard: 90 %).*

Gerechnet wird nur die **aktive Begleitung**: Durchführung vor Ort, Vor-/Nachbereitung eines konkreten Einsatzes, Fahrzeit, Koordination. Die Rechnung ist **wochengenau**, nicht als Jahressumme, weil die Last extrem ungleich verteilt ist (WDG-Blöcke Nov/Dez 2026, Projektwochen Berufskolleg Jan/Feb 2027, parallele Wochenreihen). **Der Engpass ist immer eine Woche, nie das Jahr.**

---

## 2. Datenmodell

Alle Daten liegen in einer editierbaren `data.json`, im UI pflegbar, als JSON export-/importierbar.

### 2.1 `settings`

```json
{
  "planungszeitraum": { "start": "2026-09-01", "ende": "2027-07-16" },
  "schwellwert_warnung": 0.7,
  "schwellwert_kritisch": 0.9,
  "default_fahrzeit_h": 1.0,
  "default_vorbereitungsfaktor_erstdurchfuehrung": 0.75,
  "default_vorbereitungsfaktor_wiederholung": 0.25,
  "koordination_h_pro_schule_pro_monat": 1.5
}
```

Vorbereitungsfaktor: Eine 4-h-Einheit, die zum ersten Mal (projektweit) durchgeführt wird, kostet zusätzlich 4 × 0,75 = 3 h Vorbereitung. Bei Wiederholung derselben Einheit an einer anderen Schule nur noch 4 × 0,25 = 1 h.

### 2.2 `personen`

```json
{
  "id": "p1",
  "name": "Person 1",
  "stunden_pro_woche_fuer_begleitung": 8,
  "aktiv_ab": "2026-09-01",
  "aktiv_bis": "2027-07-16",
  "abwesenheiten": [{ "von": "2026-11-09", "bis": "2026-11-13", "grund": "Urlaub" }]
}
```

- `stunden_pro_woche_fuer_begleitung` ist pro Person **frei editierbar** (Texteingabe und Schieberegler im UI) — kein einzelner globaler Default, sondern der wichtigste Stellhebel je Person. Startwert je Person: 8 h (konsistent mit dem Verifikationsbeispiel, Abschnitt 9).
- 4 Personen als Basis, Person 5 mit Flag `"szenario_optional": true` (nur im 5-Personen-Szenario mitgerechnet).
- Martin Schulte (WDG): ab Februar 2027 als zusätzliche schulinterne Ressource, modelliert über reduzierten WDG-Bedarf ab diesem Datum (nicht als eigene Person, da nur für WDG verfügbar).

### 2.3 `kalender`

```json
{
  "ferien": [
    { "name": "Herbstferien NRW", "von": "2026-10-17", "bis": "2026-10-31" },
    { "name": "Weihnachtsferien NRW", "von": "2026-12-23", "bis": "2027-01-06" },
    { "name": "Osterferien NRW 2027", "von": "2027-03-22", "bis": "2027-04-03" },
    { "name": "Sommerferien NRW 2027", "von": "2027-07-19", "bis": "2027-08-31" }
  ]
}
```

Alle vier Ferienzeiträume sind gemäß offizieller Ferienordnung NRW bestätigt (Herbst/Weihnachten aus dem Ursprungskonzept, Ostern/Sommer 2027 recherchiert und im UI wie gewohnt korrigierbar, falls das Ministerium abweicht). In Ferienwochen fällt kein Begleitbedarf an (Angebot bleibt bestehen, dient als Puffer, wird aber konservativ nicht gegengerechnet). Zusätzlich pro Schule optionale Sperrzeiten (z. B. Max Planck: 3 Wochen Praktikum nach den Osterferien, Klausurphasen bei Q2-Kursen).

### 2.4 `schulen` und `reihen`

Eine Schule kann mehrere Reihen haben (Else Lasker hat drei). Die **Reihe** ist die Recheneinheit und enthält jetzt eine vollständige Liste **aller** Einheiten (nicht nur der eigenen):

```json
{
  "id": "reihe_wdg_theorie",
  "schule": "WDG",
  "titel": "Theorieblöcke Begabtenförderung",
  "betreuungsmodell": "A",
  "fahrzeit_h": 1.0,
  "status": "zugesagt",
  "extern_betreut": false,
  "einheiten": [
    { "id": "e1", "index": 1, "datum_oder_kw": "2026-KW46", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
    { "id": "e2", "index": 2, "datum_oder_kw": "2026-KW48", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
    { "id": "e3", "index": 3, "datum_oder_kw": "2026-KW50", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" },
    { "id": "e4", "index": 4, "datum_oder_kw": "2026-KW51", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true, "wir_begleiten": true, "typ": "regulaer" }
  ]
}
```

Alternativ zur expliziten Liste kann eine Reihe als **Muster** definiert werden (spart Tipparbeit bei Wochenreihen); das Tool generiert daraus intern die einzelnen `einheiten` (eine pro Vorkommen im Zeitraum, unter Auslassung von Ferienwochen):

```json
{
  "muster": {
    "typ": "woechentlich",
    "von": "2026-09-14", "bis": "2027-01-29",
    "kontaktzeit_h": 1.5
  },
  "besetzung": { "preset": "alle" }
}
```

`typ` (Betreuungsmodelle A–X) bleibt als grobe Klassifikation für Reporting/Filter erhalten (Abschnitt 3), bestimmt aber nicht mehr direkt die Rechnung — das übernimmt jetzt `wir_begleiten` pro Einheit.

### 2.4a Einheiten-Auswahl (Erweiterung)

Jede Einheit hat ein Flag `wir_begleiten: true/false`. Nur Einheiten mit `true` fließen in die Aufwandsrechnung (4.1) ein; Koordinationsaufwand (4.2) bleibt davon unabhängig und fällt weiter pro aktiver Schule/Reihe an.

Presets zum schnellen Befüllen von `besetzung.preset` (setzen die initialen `wir_begleiten`-Werte, danach frei pro Einheit übersteuerbar):

| Preset | Wirkung |
|---|---|
| `alle` | alle Einheiten `true` |
| `keine` | alle Einheiten `false` (reine Koordination, z. B. Modell X) |
| `erste_n` (n) | erste n Einheiten `true` |
| `letzte_n` (n) | letzte n Einheiten `true` |
| `erste_und_letzte` | erste und letzte Einheit `true` |
| `jede_n_te` (n) | jede n-te Einheit `true` |
| `manuell` | keine automatische Zuweisung, alles per Checkbox |

`unser_anteil` wird zur abgeleiteten, angezeigten Kennzahl (`Anzahl wir_begleiten=true / Gesamtzahl`, z. B. "2 von 4 = 50 %") statt eines manuellen Eingabewerts. Beispiel Else Lasker/Parisa (E1 wir, E2 Lehrerin, E3 Exkursion wir, E4 Lehrerin): 4 Einheiten anlegen, `wir_begleiten = [true, false, true, false]`, E3 zusätzlich mit `typ: "exkursion"` markiert (höhere Kontaktzeit + Organisationspauschale, siehe 4.1).

UI: pro Reihe ein **Einheiten-Editor** — Tabelle mit einer Zeile pro Einheit (Index, Datum/KW, Kontaktzeit, Checkbox „wir begleiten"), darüber die Preset-Buttons. Änderungen wirken sofort auf die Wochenrechnung.

---

## 3. Betreuungsmodelle (Intensitätsstufen, Klassifikation)

| Modell | Beschreibung | Beispiel |
|---|---|---|
| **A – Volle Durchführung** | (fast) alle Einheiten `wir_begleiten: true` | WDG, Berufskolleg Barmen |
| **B – Tandem** | Teil der Einheiten `true`, Rest Lehrkraft | Else Lasker / Parisa, Simone |
| **C – Impulsgeber** | wenige Einheiten `true` (Kick-off, punktuell) | Alexander Coppel, Bayreuther Gym. |
| **X – Extern betreut** | alle Einheiten `false`, nur reduzierte Koordination | Hauptschule Hügelstraße |

Das Modell-Feld ist reine Klassifikation für Filter/Reporting; die tatsächliche Rechnung basiert ausschließlich auf den `wir_begleiten`-Flags der Einheiten (siehe 2.4a).

---

## 4. Rechenlogik (exakte Formeln)

### 4.1 Aufwand pro Einheit (nur wenn `wir_begleiten: true`)

```
aufwand_einheit [h] = ( kontaktzeit
                        + kontaktzeit × vorbereitungsfaktor
                        + fahrzeit )
                      × personen_parallel
```

- `vorbereitungsfaktor` = 0,75 bei projektweiter Erstdurchführung der Einheit, sonst 0,25.
- `personen_parallel`: Projektwochen am Berufskolleg (bis 34 + 20 SuS) brauchen ggf. 2 Personen gleichzeitig → verdoppelt den Aufwand.
- Exkursionen (`typ: "exkursion"`): höhere Kontaktzeit (halber Tag = 4 h) plus Organisationspauschale (+2 h).

### 4.2 Koordinationsaufwand pro Schule

```
koordination_woche [h] = koordination_h_pro_schule_pro_monat / 4.33
```

Fällt für jede aktive Schule an, solange dort eine Reihe läuft — unabhängig von der Anzahl übernommener Einheiten, auch bei Modell X (dort reduziert, z. B. 0,5 h/Monat).

### 4.3 Bedarf pro Kalenderwoche

```
bedarf(KW) = Σ über alle Einheiten mit wir_begleiten=true in KW: aufwand_einheit
           + Σ über alle in KW aktiven Schulen: koordination_woche
```

Einheiten in Ferienwochen sind ungültig → werden nicht automatisch verschoben, sondern als Datenfehler markiert („Einheit in Ferienwoche geplant").

### 4.4 Angebot pro Kalenderwoche

```
angebot(KW) = Σ über alle in KW aktiven Personen:
              stunden_pro_woche_fuer_begleitung
              − Abwesenheitsabzug (anteilig, 1 Abwesenheitstag = 20 % der Wochenkapazität)
```

### 4.5 Auslastung und Bewertung

```
auslastung(KW) = bedarf(KW) / angebot(KW)
```

- **Grün** < 70 % · **Gelb** 70–90 % · **Rot** > 90 %
- `machbar = true`, wenn keine Schulwoche rot ist. Zusätzlich: Anzahl gelber Wochen, **Top-5-Engpasswochen** mit Aufschlüsselung nach Reihen.

### 4.6 Restkapazität für die 10. Schule

Konfigurierbarer Platzhalter: Nutzer wählt Betreuungsmodell (A/B/C), Umfang (z. B. „6 Einheiten à 1,5 h, wöchentlich"), Besetzung (Preset) und Startzeitraum. Tool zeigt pro möglichem Startmonat, ob die Aufnahme ohne rote Wochen machbar wäre.

### 4.7 Optionale Stufe 2: Personenzuordnung

Stufe 1 (dieses Design) prüft nur die Teamsumme pro Woche. Stufe 2 (später nachrüstbar) ordnet Einheiten konkreten Personen zu und prüft zusätzlich Auslastung und Doppelbelegung pro Person. Für die aktuelle Frage reicht Stufe 1.

---

## 5. Seed-Daten (Stand Abstimmungsdokument 26.06.2026)

| # | Schule | Reihe(n) | Modell | Umfang lt. Notizen | Besetzung / Annahmen (im UI korrigierbar) |
|---|---|---|---|---|---|
| 1 | WDG | Theorieblöcke Begabtenförderung | A | 4 × 4 h, Nov/Dez 2026, ~20 SuS | KW 46, 48, 50, 51, alle `wir_begleiten: true`; ab Feb 2027 evtl. Entlastung durch Martin Schulte |
| 2 | Gym. Sedanstraße | GNU-Kurs 9. Kl. | A/B | 1,5 h/Woche | Annahme 12 Wochen, alle `true` |
| 3 | Gym. Kothen | SoWi 11 / Physik 8 / Politik 8 | B | offen | Platzhalter: 6 Einheiten à 1,5 h, Preset `erste_n(3)` |
| 4a | Else Lasker (Parisa) | Mobilität, Kl. 9 | B | 4 Einheiten | `[true, false, true, false]`, E3 = Exkursion |
| 4b | Else Lasker (Simone) | Ernährung, Q2 | B | 6 Einheiten | Annahme Preset `erste_n(3)`; Q2-Klausurphasen als Sperrzeit |
| 4c | Else Lasker (Olaf) | Klub „Klimaresistente Schule" | C | laufend, freiwillig | 1 Besuch/Monat à 2 h |
| 5 | Berufskolleg Barmen | 2 Projektwochen | A | Jan/Feb 2027, bis 34+20 SuS | 2 Wochen à 4 Tage à 4,5 h, `personen_parallel: 2`, alle `true` → Spitzenlast |
| 6 | Alexander Coppel | UNESCO-Stunde | C | 65 min/Woche, wir 1×/Monat | ~10 Einsätze à 1,1 h übers Schuljahr, Preset `jede_n_te(4)` |
| 7 | HS Hügelstraße | Kl. 7, diverse | X | extern betreut (Beate Petersen) | Preset `keine`, 0,5 h/Monat Koordination |
| 8 | Realschule Max Planck | 2 SoWi-Kurse 9. Kl. | A/B | 2 × 90 min, 2 Kurse | Annahme 4 Termine à 1,5 h je Kurs, alle `true`; Sperrzeit 3 Wochen nach Osterferien |
| 9 | Bayreuther Gym. | Einzelworkshops + Exkursionen | C | Kick-off Sept. 2026, Zukunftsstadt Jan. 2027 | 2 Einsätze à 3 h, alle `true` |
| 10 | Platzhalter „Schule X" | konfigurierbar | wählbar | — | Standard: Modell B, 6 × 1,5 h wöchentlich, Preset `erste_n(3)`, Start wählbar |

Offene Rückfragen aus dem Ursprungskonzept (Sedanstraße/Max Planck Termin-Anzahl, Kothen-Umfang) bleiben als markierte Annahmen bestehen und sind im UI jederzeit korrigierbar.

---

## 6. Szenarien

1. **Basis:** 4 Personen, 9 Schulen (ohne Schule X)
2. **Ziel:** 4 Personen, 10 Schulen
3. **Verstärkt:** 5 Personen, 10 Schulen
4. **Sensitivität:** Schieberegler für `stunden_pro_woche_fuer_begleitung` je Person (4–12 h) und Vorbereitungsfaktoren – live neu berechnet.

---

## 7. Ausgaben / UI

1. **Ampel-Antwort ganz oben:** „10 Schulen mit 4 Personen: MACHBAR / KRITISCH / NICHT MACHBAR" + Ein-Satz-Begründung.
2. **Wochen-Heatmap** (Sept. 2026 – Juli 2027): eine Zeile pro Szenario, Zellen = KW, Farbe = Auslastung, Ferien grau. Klick → Aufschlüsselung nach Reihen.
3. **Balkendiagramm** Bedarf vs. Angebot pro Woche mit Schwellwertlinien.
4. **Schulentabelle:** pro Schule Gesamtstunden, Modell, Zeitraum, Status.
5. **Reihen-Detailansicht mit Einheiten-Editor** (siehe 2.4a): Tabelle aller Einheiten + Preset-Buttons + Checkboxen.
6. **Engpass-Bericht:** Top-Engpasswochen + Entlastungsvorschläge: (a) Einheiten von `true` auf `false` umstellen (Modell A→B), (b) Einheit in Nachbarwoche verschieben, (c) `personen_parallel` reduzieren.
7. **Export:** druckbare Übersicht (Team-/Schulabstimmung).
8. **Personentabelle:** frei editierbare `stunden_pro_woche_fuer_begleitung` je Person (Zahlenfeld + Schieberegler).

---

## 8. Technische Umsetzung

- **Architektur:** Lokale Single-Page-App ohne Backend, ein Ordner (`Berechnungstool/`), `npm run dev`. Vite + React + TypeScript. Berechnungslogik als reine Funktionen in `src/lib/berechnung.ts` (kein UI-Code darin → gut testbar).
- **Daten:** `src/data/data.json` (Seed-Daten aus Abschnitt 5), im UI editierbar, JSON export-/importierbar. Kein Login, keine Datenbank.
- **Wochenlogik:** ISO-Kalenderwochen (`date-fns`, `getISOWeek`/`startOfISOWeek`). Muster-Reihen werden beim Laden/Bearbeiten zu individuellen `einheiten` expandiert.
- **Tests:** Vitest. Mindestens das Handrechen-Beispiel aus Abschnitt 9 als Testfall.
- **Diagramme:** Recharts (Balken) + eigene Heatmap als CSS-Grid.

---

## 9. Verifikations-Beispiel (Handrechnung, muss exakt reproduziert werden)

**Gegeben:** KW 46/2026. Angebot: 4 Personen à 8 h = 32 h. Einheiten (beide `wir_begleiten: true`): WDG-Block (4 h Kontakt, Erstdurchführung, Faktor 0,75, Fahrzeit 1 h, 1 Person) und Sedanstraße-Doppelstunde (1,5 h Kontakt, Wiederholung, Faktor 0,25, Fahrzeit 0,5 h, 1 Person). Aktive Schulen mit Koordination in dieser Woche: 8 Schulen à 1,5 h/Monat sowie Hügelstraße mit 0,5 h/Monat.

**Rechnung:**
- WDG: 4 + 4×0,75 + 1 = **8,0 h**
- Sedanstraße: 1,5 + 1,5×0,25 + 0,5 = **2,375 h**
- Koordination: (8 × 1,5 + 0,5) / 4,33 = 12,5 / 4,33 = **2,887 h**
- Bedarf gesamt: 8,0 + 2,375 + 2,887 = **13,26 h**
- Auslastung: 13,26 / 32 = **41,4 % → Grün**

**Erwartung:** Das Tool gibt für KW 46 41 % (±1 Prozentpunkt Rundung) und Status Grün aus.

---

## 10. Bewusst nicht abgedeckt (außerhalb des Scopes)

- Das Entwerfen der Einheiten selbst (Inhalte, Material) — das Tool rechnet nur die Begleitung.
- Stufe 2 (Personenzuordnung) — vorgesehen als spätere Erweiterung, kein Teil dieser Implementierung.
- Automatisches Verschieben von Einheiten aus Ferienwochen — wird nur als Datenfehler markiert, nicht automatisch korrigiert.
- Login/Mehrbenutzer-Synchronisation — 4–5 Personen, lokale Datei reicht.

Verbleibende inhaltliche Unsicherheiten (Terminanzahl Sedanstraße/Max Planck, Kothen-Umfang, exakte Startwerte je Person) sind bewusst als editierbare Annahmen im Seed-Datensatz abgelegt, nicht als Blocker für die Implementierung.
