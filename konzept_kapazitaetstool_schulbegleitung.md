# Konzept: Kapazitätsrechner Schulbegleitung
## Projekt „Zukunft Wuppertal – Schulen gestalten Wandel"

**Zweck dieses Dokuments:** Vollständige Spezifikation für ein Planungstool, umsetzbar mit Claude Code. Die Kernfrage des Tools: *Schaffen wir es mit 4 (bzw. 5) Personen, 10 Schulen aktiv durch das Projekt zu begleiten – und wo liegen die Engpässe?*

---

## 1. Grundprinzip der Berechnung

Das Tool ist ein **Angebot-vs.-Bedarf-Modell in Personenstunden pro Kalenderwoche**.

- **Angebot (Supply):** Wie viele Stunden pro Woche stehen dem Team für aktive Schulbegleitung zur Verfügung?
- **Bedarf (Demand):** Wie viele Personenstunden erfordert jede Schule in welcher Kalenderwoche?
- **Ergebnis:** Auslastung pro Woche = Bedarf ÷ Angebot. Die Antwort auf „schaffen wir 10 Schulen?" lautet: *Ja, wenn in keiner Schulwoche die Auslastung über einem definierten Schwellwert liegt (Standard: 90 %).*

Wichtig: Das Entwerfen der Einheiten ist **nicht** Teil dieser Rechnung (das macht ihr ohnehin für alle Schulen). Gerechnet wird nur die **aktive Begleitung**: Durchführung vor Ort, Vor-/Nachbereitung eines konkreten Einsatzes, Fahrzeit, Koordination mit der Schule.

Warum wochengenau und nicht als Summe? Weil die Last extrem ungleich verteilt ist: Die WDG-Blöcke liegen in Nov/Dez 2026, die Projektwochen am Berufskolleg in Jan/Feb 2027, Wochenreihen laufen parallel. Eine Jahressumme („480 h Bedarf, 800 h Angebot – passt") würde verdecken, dass z. B. in KW 4/2027 drei Dinge gleichzeitig stattfinden. **Der Engpass ist immer eine Woche, nie das Jahr.**

---

## 2. Datenmodell

Alle Daten liegen in einer editierbaren `data.json` (bzw. werden im UI gepflegt). Vier Entitätstypen:

### 2.1 `settings` (globale Parameter, alle im UI änderbar)

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

Erläuterung Vorbereitungsfaktor: Eine 4-h-Einheit, die zum ersten Mal durchgeführt wird, kostet zusätzlich 4 × 0,75 = 3 h Vorbereitung (Anpassung an die Zielgruppe, Material, Absprache mit Lehrkraft). Bei Wiederholung derselben Einheit an einer anderen Schule nur noch 4 × 0,25 = 1 h. Da ihr alle Einheiten ohnehin entwerft, ist die Grundkonzeption bereits abgedeckt – der Faktor bildet nur die einsatzspezifische Anpassung ab.

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

- 4 Personen als Basis, Person 5 mit Flag `"szenario_optional": true` (wird nur im 5-Personen-Szenario mitgerechnet).
- `stunden_pro_woche_fuer_begleitung` ist der wichtigste Stellhebel: Das ist NICHT die Arbeitszeit, sondern der Anteil, der realistisch für Schulbegleitung übrig ist (neben Einheiten-Entwicklung, Verwaltung, Gesamtprojekt). Startannahme z. B. 6–10 h/Woche pro Person – im Tool per Schieberegler variierbar.
- Sonderfall Martin Schulte (WDG): ab Februar 2027 als zusätzliche schulinterne Ressource verfügbar. Modellierbar als Person mit `aktiv_ab: "2027-02-01"` und Einsatz nur für WDG-Schülerprojekte, oder einfacher: der WDG-Bedarf ab Feb 2027 wird reduziert.

### 2.3 `kalender`

Ferien- und Sperrwochen NRW erzeugen schulfreie Zeiten. In Ferienwochen fällt kein Begleitbedarf an (das Angebot bleibt bestehen und kann als Puffer für Vorbereitung dienen, wird aber konservativ nicht gegengerechnet).

```json
{
  "ferien": [
    { "name": "Herbstferien NRW", "von": "2026-10-17", "bis": "2026-10-31" },
    { "name": "Weihnachtsferien NRW", "von": "2026-12-23", "bis": "2027-01-06" },
    { "name": "Osterferien NRW 2027", "von": "PRÜFEN", "bis": "PRÜFEN" },
    { "name": "Sommerferien NRW 2027", "von": "PRÜFEN", "bis": "PRÜFEN" }
  ]
}
```

Herbst- und Weihnachtsferien 2026/27 sind bestätigt; Oster- und Sommerferien 2027 bitte beim Schulministerium NRW nachtragen. Zusätzlich pro Schule optionale Sperrzeiten (z. B. Max Planck: 3 Wochen Praktikum nach den Osterferien, Klausurphasen bei Q2-Kursen).

### 2.4 `schulen` und `reihen`

Eine Schule kann mehrere Reihen haben (Else Lasker hat drei!). Die **Reihe** ist die eigentliche Recheneinheit:

```json
{
  "id": "reihe_wdg_theorie",
  "schule": "WDG",
  "titel": "Theorieblöcke Begabtenförderung",
  "betreuungsmodell": "A",
  "einsaetze": [
    { "datum_oder_kw": "2026-KW46", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true },
    { "datum_oder_kw": "2026-KW48", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true },
    { "datum_oder_kw": "2026-KW50", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true },
    { "datum_oder_kw": "2026-KW51", "kontaktzeit_h": 4, "personen_parallel": 1, "erstdurchfuehrung": true }
  ],
  "fahrzeit_h": 1.0,
  "status": "zugesagt",
  "extern_betreut": false
}
```

Alternativ zur expliziten Einsatzliste kann eine Reihe als **Muster** definiert werden (spart Tipparbeit bei Wochenreihen):

```json
{
  "muster": {
    "typ": "woechentlich",
    "von": "2026-09-14", "bis": "2027-01-29",
    "kontaktzeit_h": 1.5,
    "unser_anteil": 1.0
  }
}
```

`unser_anteil` ist zentral für das Betreuungsmodell: Bei Alexander Coppel läuft die UNESCO-Stunde wöchentlich, aber ihr kommt nur 1× im Monat → `unser_anteil: 0.25`. Der Rest wird von Lehrkräften getragen und erzeugt bei euch keinen Einsatzbedarf, nur Koordination.

---

## 3. Betreuungsmodelle (Intensitätsstufen)

Aus euren Notizen ergeben sich drei klar unterscheidbare Modelle – diese Typisierung ist das Herzstück, weil sie erklärt, warum 10 Schulen mit 4 Personen überhaupt denkbar sind:

| Modell | Beschreibung | Beispiel aus euren Notizen |
|---|---|---|
| **A – Volle Durchführung** | Wir führen (fast) alle Einheiten selbst durch | WDG (4×4h-Blöcke), Berufskolleg Barmen (Projektwochen) |
| **B – Tandem** | Wir übernehmen ausgewählte Einheiten, Lehrkraft den Rest | Else Lasker / Parisa (Einheit 1 Gastdozent, Einheit 2 Lehrerin, Einheit 3 Exkursion mit uns, Einheit 4 Lehrerin) |
| **C – Impulsgeber** | Kick-off / 1×monatlich / punktuelle Workshops, Lehrkräfte tragen die Reihe | Alexander Coppel (1 Gastdozent/Monat), Bayreuther Gymnasium (nur Einzelworkshops + Exkursionen) |
| **X – Extern betreut** | Läuft, bindet keine Teamkapazität (nur minimale Koordination) | Hauptschule Hügelstraße (Beate Petersen) |

Das Tool weist jedem Modell Default-Werte für `unser_anteil` zu (A = 1,0; B = 0,4–0,5; C = 0,15–0,25; X = 0), die pro Reihe überschreibbar sind.

---

## 4. Rechenlogik (exakte Formeln)

### 4.1 Aufwand pro Einsatz

```
aufwand_einsatz [h] = ( kontaktzeit
                        + kontaktzeit × vorbereitungsfaktor
                        + fahrzeit )
                      × personen_parallel
```

- `vorbereitungsfaktor` = 0,75 bei Erstdurchführung der Einheit (projektweit gezählt: die erste Schule, an der Einheit „Mobilität Teil 1" läuft, zahlt den hohen Faktor; jede weitere Schule den niedrigen), sonst 0,25.
- `personen_parallel`: Projektwochen am Berufskolleg mit bis zu 34 SuS in FA-Klassen plus 20 in der Höheren Handelsschule brauchen ggf. 2 Personen gleichzeitig → verdoppelt den Aufwand.
- Exkursionen (Weltacker, Mobilitätsprojekt-Besuch): eigener Einsatztyp mit höherer Kontaktzeit (halber Tag = 4 h) plus Organisationspauschale (z. B. +2 h).

### 4.2 Koordinationsaufwand pro Schule

```
koordination_woche [h] = koordination_h_pro_schule_pro_monat / 4.33
```

Fällt für jede aktive Schule an, solange dort eine Reihe läuft – auch bei Modell C und X (bei X reduziert, z. B. 0,5 h/Monat für die Abstimmung mit Beate). Das ist bewusst drin: 10 Schulen bedeuten 10 Kommunikationsbeziehungen, und genau das wird bei Kopfrechnungen immer vergessen.

### 4.3 Bedarf pro Kalenderwoche

```
bedarf(KW) = Σ über alle Einsätze in KW: aufwand_einsatz
           + Σ über alle in KW aktiven Schulen: koordination_woche
```

Einsätze in Ferienwochen sind ungültig → das Tool verschiebt sie nicht automatisch, sondern markiert sie als Datenfehler („Einsatz in Ferienwoche geplant").

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
- Gesamtantwort des Tools: `machbar = true`, wenn keine Schulwoche rot ist. Zusätzlich ausgeben: Anzahl gelber Wochen (Belastungsindikator) und die **Top-5-Engpasswochen** mit Aufschlüsselung, welche Reihen dort Last erzeugen.

### 4.6 Restkapazität für die 10. Schule

Die noch fehlende 10. Schule wird als **konfigurierbarer Platzhalter** modelliert: Der Nutzer wählt Betreuungsmodell (A/B/C), Umfang (z. B. „6 Einheiten à 1,5 h, wöchentlich") und Startzeitraum. Das Tool zeigt dann pro möglichem Startmonat, ob die Aufnahme ohne rote Wochen machbar wäre → beantwortet direkt: *„Welches Format können wir der 10. Schule noch anbieten, und wann?"*

### 4.7 Optionale Stufe 2: Personenzuordnung

Die Wochenrechnung (Stufe 1) prüft nur die Teamsumme. Stufe 2 (später nachrüstbar) ordnet Reihen konkreten Personen zu und prüft zusätzlich: keine Person über ihrer Wochenkapazität, keine Person an zwei Orten gleichzeitig (relevant v. a. bei den Projektwochen und parallelen Wochenterminen). Für die aktuelle Frage („schaffen wir es grundsätzlich?") reicht Stufe 1.

---

## 5. Seed-Daten aus dem Abstimmungsdokument (26.06.2026)

Diese Startbefüllung soll das Tool mitbringen; Annahmen sind als solche markiert und im UI korrigierbar:

| # | Schule | Reihe(n) | Modell | Umfang lt. Notizen | Annahmen (zu prüfen) |
|---|---|---|---|---|---|
| 1 | WDG | Theorieblöcke Begabtenförderung | A | 4 × 4 h, Nov/Dez 2026, ~20 SuS | Wochen: KW 46, 48, 50, 51; ab Feb 2027 evtl. Entlastung durch Martin Schulte |
| 2 | Gym. Sedanstraße | GNU-Kurs 9. Kl. | A oder B | 1,5 h/Woche (Doppelstunde) | Dauer der Reihe unklar → Annahme 12 Wochen; „mehr Praxis, kleine Aufgaben" |
| 3 | Gym. Kothen | SoWi 11 / Physik 8 / Politik 8 | B | noch offen (Kollegiumsabstimmung) | Platzhalter: 6 Einheiten à 1,5 h, `unser_anteil` 0,5 |
| 4a | Else Lasker | Parisa, Kl. 9, Mobilität, ab Sept. | B | 4 Einheiten: E1 wir, E2 Lehrerin, E3 Exkursion wir, E4 Lehrerin | Unser Anteil: 2 von 4 Einheiten, E3 als Exkursion (4 h + Orga) |
| 4b | Else Lasker | Simone, Q2, Ernährung | B | 6 Einheiten (Foodsharing, Kiosk, Schnippelparty, Weltacker, Kochshow) | Anteil unklar → Annahme 3 von 6; Q2-Klausur-/Abiphasen als Sperrzeit |
| 4c | Else Lasker | Olaf, Club „Klimaresistente Schule", nachmittags | C | laufend, freiwillig, Kl. 5–8 | Annahme: 1 Besuch/Monat à 2 h + Unterstützung Grünprojekt-Finanzierung |
| 5 | Berufskolleg Barmen | 2 Projektwochen | A | 3–4 Tage/Woche à 4–5 h, Jan/Feb 2027; bis 34 + 20 SuS | Annahme: 2 Wochen à 4 Tage à 4,5 h, `personen_parallel: 2` → Spitzenlast! |
| 6 | Alexander Coppel | UNESCO-Stunde, 3 × 9. Klassen (~80 SuS, Aula) | C | 65 min/Woche, wir 1×/Monat Gastdozent | ~10 Einsätze à 1,1 h übers Schuljahr; Rest Lehrkräfte |
| 7 | HS Hügelstraße | Kl. 7, Energierad/Weltacker/Fotos, ab Sept. | X | Beate Petersen betreut | `extern_betreut: true`, nur 0,5 h/Monat Koordination |
| 8 | Realschule Max Planck | 2 SoWi-Kurse 9. Kl. | A oder B | 2 × 90 min, 2 Kurse | Unklar, ob einmalig oder Reihe → Annahme: 4 Termine à 1,5 h je Kurs; Sperrzeit: 3 Wochen Praktikum nach Osterferien |
| 9 | Bayreuther Gym. | Einzelworkshops + Exkursionen | C | Kick-off Sept. 2026, Zukunftsstadt Jan. 2027 | 2 Einsätze à 3 h + Koordination; kein regelmäßiger Bedarf |
| 10 | **Platzhalter „Schule X"** | konfigurierbar | wählbar | — | Standard: Modell B, 6 × 1,5 h wöchentlich, Start wählbar |

---

## 6. Szenarien

Das Tool rechnet mindestens diese Szenarien nebeneinander (umschaltbar, Vergleichsansicht):

1. **Basis:** 4 Personen, 9 Schulen (ohne Schule X)
2. **Ziel:** 4 Personen, 10 Schulen
3. **Verstärkt:** 5 Personen, 10 Schulen
4. **Sensitivität:** Schieberegler für `stunden_pro_woche_fuer_begleitung` (4–12 h) und die Vorbereitungsfaktoren – live neu berechnet. Damit seht ihr sofort: „Bei wie viel Wochenstunden pro Person kippt es?"

---

## 7. Ausgaben / UI

1. **Ampel-Antwort ganz oben:** „10 Schulen mit 4 Personen: MACHBAR / KRITISCH / NICHT MACHBAR" + Begründung in einem Satz (z. B. „3 rote Wochen im Januar 2027, verursacht durch Projektwochen Barmen + Zukunftsstadt").
2. **Wochen-Heatmap** (Sept. 2026 – Juli 2027): eine Zeile pro Szenario, Zellen = KW, Farbe = Auslastung, Ferien grau. Klick auf eine Woche → Aufschlüsselung nach Reihen.
3. **Balkendiagramm** Bedarf vs. Angebot pro Woche mit Schwellwertlinien.
4. **Schulentabelle:** pro Schule Gesamtstunden, Modell, Zeitraum, Status (zugesagt / in Klärung).
5. **Engpass-Bericht:** Top-Engpasswochen + konkrete Entlastungsvorschläge nach fester Logik: (a) Reihe von Modell A auf B herabstufen, (b) Einsatz in Nachbarwoche verschieben, (c) `personen_parallel` reduzieren.
6. **Export:** Ergebnis als druckbare Übersicht (für die Abstimmung im Team / mit Schulen).

---

## 8. Technische Umsetzung (Empfehlung für Claude Code)

- **Architektur:** Lokale Single-Page-App ohne Backend. Ein Ordner, `npm run dev`, fertig. Vorschlag: **Vite + React**, Berechnungslogik als reine Funktionen in `src/lib/berechnung.ts` (kein UI-Code darin → gut testbar).
- **Daten:** `data.json` im Repo (Seed-Daten aus Abschnitt 5), im UI editierbar, Änderungen als JSON exportier-/importierbar. Kein Login, keine Datenbank – ihr seid 4–5 Leute.
- **Wochenlogik:** ISO-Kalenderwochen (`date-fns`, Funktionen `getISOWeek` / `startOfISOWeek`). Alle internen Berechnungen auf KW-Ebene; Einsätze mit konkretem Datum werden ihrer KW zugeordnet.
- **Tests:** Mindestens ein Testfall mit von Hand nachgerechnetem Ergebnis (siehe Abschnitt 9), damit die Formeln verifiziert sind. Vitest.
- **Diagramme:** Recharts (Balken) + eigene Heatmap als CSS-Grid (simpel, kein Library-Overhead).

### Aufgabenstellung für Claude Code (Kurzfassung zum Einfügen)

> Baue eine lokale Vite+React-App „Kapazitätsrechner Schulbegleitung" nach dieser Spezifikation. Reine Berechnungsfunktionen in `src/lib/berechnung.ts` mit Vitest-Tests (inkl. des Handrechen-Beispiels aus Abschnitt 9). Seed-Daten aus Abschnitt 5 in `src/data/data.json`. UI: Ampel-Antwort, Wochen-Heatmap pro Szenario, Bedarfs-/Angebotsdiagramm, editierbare Schulen-/Personentabellen, Szenario-Schieberegler, JSON-Export/-Import. Keine Backend-Abhängigkeiten.

---

## 9. Verifikations-Beispiel (Handrechnung)

Ein Testfall, den das Tool exakt reproduzieren muss:

**Gegeben:** KW 46/2026. Angebot: 4 Personen à 8 h = 32 h. Einsätze: WDG-Block (4 h Kontakt, Erstdurchführung, Faktor 0,75, Fahrzeit 1 h, 1 Person) und Sedanstraße-Doppelstunde (1,5 h Kontakt, Wiederholung, Faktor 0,25, Fahrzeit 0,5 h, 1 Person). Aktive Schulen mit Koordination in dieser Woche: 8 Schulen à 1,5 h/Monat sowie Hügelstraße mit 0,5 h/Monat.

**Rechnung:**
- WDG: 4 + 4×0,75 + 1 = **8,0 h**
- Sedanstraße: 1,5 + 1,5×0,25 + 0,5 = **2,375 h**
- Koordination: (8 × 1,5 + 0,5) / 4,33 = 12,5 / 4,33 = **2,887 h**
- Bedarf gesamt: 8,0 + 2,375 + 2,887 = **13,26 h**
- Auslastung: 13,26 / 32 = **41,4 % → Grün**

**Erwartung:** Das Tool gibt für KW 46 41 % (±1 Prozentpunkt Rundung) und Status Grün aus.

---

## 10. Offene Punkte (vor bzw. während der Umsetzung klären)

1. Oster- und Sommerferien NRW 2027 in `kalender` eintragen (Schulministerium NRW).
2. Sedanstraße und Max Planck: Anzahl der Termine der Reihe bestätigen (Annahmen: 12 bzw. 4).
3. Kothen: Rückmeldung aus der Kollegiumsabstimmung abwarten → bis dahin Platzhalterwerte.
4. Realistischer Wert für `stunden_pro_woche_fuer_begleitung` pro Person – ehrlich schätzen, das ist der sensibelste Parameter des ganzen Modells.
5. Entscheidung, ob Beate/Hügelstraße wirklich 0 h bindet oder ob z. B. Materialunterstützung anfällt.
