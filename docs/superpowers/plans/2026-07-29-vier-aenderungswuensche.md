# Vier Änderungswünsche Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vier unabhängige Änderungen am Berechnungstool umsetzen: breiteres Kursname-Feld, Personen-Umverteilung wirkt sich auf den Wochenübersichtsgraphen aus, Zeitraum-im-Projekt-Felder für Personen, und ein "Projekttag"-Marker mit Trennlinie im Themen-Gantt.

**Architecture:** Vier größtenteils unabhängige Änderungen an bestehenden Dateien, kein neuer State-Mechanismus. Task 2 (Umverteilung im Graph) erweitert eine reine Berechnungsfunktion (`berechneAngebotProWoche`) um einen Parameter; Tasks 1/3/4 sind reine UI-Ergänzungen an bestehenden Komponenten unter Wiederverwendung bestehender Callback-Signaturen (`onChange`, `onEinheitFelderChange`, `onTerminFelderChange`).

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react, date-fns.

## Global Constraints

- Deutsche Bezeichner/Labels durchgängig beibehalten (Projekt-Konvention).
- Keine Änderung an der Bedarfsrechnung durch das neue `Thema`-Mitglied `Projekttag` — es fließt nur wie jedes andere `thema`-Feld in `berechneThemenGantt`/`ThemenUebersicht` ein, nicht in `berechneBedarfProWoche`.
- Kein neuer Callback-Typ für `aktiv_ab`/`aktiv_bis` — beide laufen über das bestehende `onChange: (id: string, patch: Partial<Person>) => void` in `PersonenTabelle.tsx`.
- `npm test` und `npm run build` müssen am Ende grün sein.

---

### Task 1: Kursname-Feld verbreitern

**Files:**
- Modify: `src/components/ReihenEditor.tsx:55`
- Test: `src/components/ReihenEditor.test.tsx`

**Interfaces:**
- Keine neuen Interfaces. Reines Styling einer bestehenden `<input>`.

- [ ] **Step 1: Write the failing test**

Öffne `src/components/ReihenEditor.test.tsx` und ergänze am Ende der Datei (innerhalb eines vorhandenen `describe`-Blocks oder als neuer `describe`):

```typescript
describe('Titel-Feld Breite', () => {
  it('renders the Titel input at full width so long Kursnamen stay readable', () => {
    renderReihenEditor()
    expect(screen.getByLabelText('Titel')).toHaveStyle({ width: '100%' })
  })
})
```

Die Datei hat bereits eine `renderReihenEditor()`-Hilfsfunktion (Zeile 40-55) mit vorgefertigten `reihe`/`personen`-Fixtures und `vi.fn()`-Props — diese wiederverwenden statt ein eigenes Render aufzusetzen.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ReihenEditor.test.tsx -t "Titel-Feld Breite"`
Expected: FAIL — `width: 100%` nicht vorhanden (aktuell hat das Input keinen Style).

- [ ] **Step 3: Write minimal implementation**

In `src/components/ReihenEditor.tsx:55`, ändere:

```tsx
<input type="text" aria-label="Titel" value={reihe.titel} onChange={(ev) => onTitelChange(ev.target.value)} />
```

zu:

```tsx
<input
  type="text"
  aria-label="Titel"
  value={reihe.titel}
  onChange={(ev) => onTitelChange(ev.target.value)}
  style={{ width: '100%' }}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: PASS (alle Tests der Datei)

- [ ] **Step 5: Commit**

```bash
git add src/components/ReihenEditor.tsx src/components/ReihenEditor.test.tsx
git commit -m "feat: widen Kursname (Titel) input to show full course names"
```

---

### Task 2: Personen-Umverteilung im Wochenübersichtsgraphen sichtbar machen

**Files:**
- Modify: `src/lib/berechnung.ts:9,69-71,101`
- Test: `src/lib/berechnung.test.ts`

**Interfaces:**
- Produces: `berechneAngebotProWoche(personen: Person[], wochenStartMontag: Date, personenUmverteilungen?: PersonenUmverteilung[]): number` — dritter Parameter ist optional (Default `[]`), bestehende Aufrufe ohne dritten Parameter bleiben unverändert lauffähig.
- Consumes: `PersonenUmverteilung` aus `../lib/types` (Felder: `personId`, `quelleWochenKey`, `zielWochenKey`, `stunden`), `getISOWochenKey` aus `./kalenderwochen` (bereits importiert in `berechnung.ts:6`).

- [ ] **Step 1: Write the failing test**

Füge in `src/lib/berechnung.test.ts` innerhalb von `describe('berechneAngebotProWoche', ...)` (nach der bestehenden `person`-Helper-Funktion, vor dem schließenden `})` des Blocks, z. B. direkt nach dem `'excludes people who are not active during that week'`-Test) folgenden Test ein:

```typescript
  it('shifts capacity between weeks according to personenUmverteilungen', () => {
    const personen = [person({ id: 'p1' })]
    const umverteilungen = [
      { id: 'u1', personId: 'p1', quelleWochenKey: '2026-KW46', zielWochenKey: '2026-KW47', stunden: 6 },
    ]
    // 2026-11-09 is the Monday of KW46/2026, 2026-11-16 is KW47/2026.
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'), umverteilungen)).toBeCloseTo(8 - 6, 5)
    expect(berechneAngebotProWoche(personen, new Date('2026-11-16'), umverteilungen)).toBeCloseTo(8 + 6, 5)
  })

  it('ignores personenUmverteilungen of other Personen', () => {
    const personen = [person({ id: 'p1' })]
    const umverteilungen = [
      { id: 'u1', personId: 'p2', quelleWochenKey: '2026-KW46', zielWochenKey: '2026-KW47', stunden: 6 },
    ]
    expect(berechneAngebotProWoche(personen, new Date('2026-11-09'), umverteilungen)).toBeCloseTo(8, 5)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/berechnung.test.ts -t "personenUmverteilungen"`
Expected: FAIL — `berechneAngebotProWoche` akzeptiert aktuell keinen dritten Parameter, Ergebnis bleibt bei 8 statt 2/14.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/berechnung.ts:9`, erweitere den Type-Import:

```typescript
import type { Settings, Datenbestand, Person, PersonenUmverteilung } from './types'
```

Ersetze `berechneAngebotProWoche` (aktuell Zeilen 69-71):

```typescript
export function berechneAngebotProWoche(personen: Person[], wochenStartMontag: Date): number {
  return personen.reduce((summe, person) => summe + berechnePersonKapazitaetsbasis(person, wochenStartMontag), 0)
}
```

durch:

```typescript
export function berechneAngebotProWoche(
  personen: Person[],
  wochenStartMontag: Date,
  personenUmverteilungen: PersonenUmverteilung[] = []
): number {
  const wochenKey = getISOWochenKey(wochenStartMontag)
  return personen.reduce((summe, person) => {
    const basis = berechnePersonKapazitaetsbasis(person, wochenStartMontag)
    const eigene = personenUmverteilungen.filter((u) => u.personId === person.id)
    const eingehend = eigene.filter((u) => u.zielWochenKey === wochenKey).reduce((s, u) => s + u.stunden, 0)
    const ausgehend = eigene.filter((u) => u.quelleWochenKey === wochenKey).reduce((s, u) => s + u.stunden, 0)
    return summe + basis + eingehend - ausgehend
  }, 0)
}
```

In `berechneWochenuebersicht` (Zeile 101), ändere:

```typescript
    const angebot = berechneAngebotProWoche(data.personen, montag)
```

zu:

```typescript
    const angebot = berechneAngebotProWoche(data.personen, montag, data.personenUmverteilungen ?? [])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/berechnung.test.ts`
Expected: PASS (alle Tests der Datei, inklusive der bereits bestehenden `berechneAngebotProWoche`-Tests ohne dritten Parameter)

- [ ] **Step 5: Commit**

```bash
git add src/lib/berechnung.ts src/lib/berechnung.test.ts
git commit -m "feat: apply Personen-Umverteilung to the Wochenübersicht capacity graph"
```

---

### Task 3: Zeitraum im Projekt für Personen (mit Kalenderauswahl)

**Files:**
- Modify: `src/components/PersonenTabelle.tsx`
- Test: `src/components/PersonenTabelle.test.tsx`

**Interfaces:**
- Consumes: bestehendes `onChange: (id: string, patch: Partial<Person>) => void` (kein neuer Prop nötig), `Person.aktiv_ab: string`, `Person.aktiv_bis: string` (bereits in `types.ts:17-18`).

- [ ] **Step 1: Write the failing test**

Füge in `src/components/PersonenTabelle.test.tsx` einen neuen `describe`-Block nach `describe('PersonenTabelle Urlaub', ...)` ein:

```typescript
describe('PersonenTabelle Zeitraum im Projekt', () => {
  it('renders the Aktiv-ab/Aktiv-bis dates for a Person', () => {
    renderTabelle()
    expect(screen.getByLabelText('Aktiv ab von Anna')).toHaveValue('2026-09-01')
    expect(screen.getByLabelText('Aktiv bis von Anna')).toHaveValue('2027-07-16')
  })

  it('editing Aktiv-ab calls onChange with the updated aktiv_ab', () => {
    const props = renderTabelle()
    fireEvent.change(screen.getByLabelText('Aktiv ab von Anna'), { target: { value: '2026-10-01' } })
    expect(props.onChange).toHaveBeenCalledWith('p1', { aktiv_ab: '2026-10-01' })
  })

  it('editing Aktiv-bis calls onChange with the updated aktiv_bis', () => {
    const props = renderTabelle()
    fireEvent.change(screen.getByLabelText('Aktiv bis von Anna'), { target: { value: '2027-06-01' } })
    expect(props.onChange).toHaveBeenCalledWith('p1', { aktiv_bis: '2027-06-01' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/PersonenTabelle.test.tsx -t "Zeitraum im Projekt"`
Expected: FAIL — `getByLabelText('Aktiv ab von Anna')` findet kein Element.

- [ ] **Step 3: Write minimal implementation**

In `src/components/PersonenTabelle.tsx`, ergänze im `<thead>` (nach `<th>Stunden/Woche für Begleitung</th>`, vor `<th>Urlaub</th>`) eine neue Spalte:

```tsx
            <th>Zeitraum im Projekt</th>
```

Ergänze im `<tbody>`, in der `<tr>` pro Person, nach dem `<td>` für Stunden/Woche (also vor dem `<td>` mit dem Urlaub) eine neue Zelle:

```tsx
              <td>
                <input
                  type="date"
                  aria-label={`Aktiv ab von ${p.name}`}
                  value={p.aktiv_ab}
                  onChange={(e) => onChange(p.id, { aktiv_ab: e.target.value })}
                />
                {' – '}
                <input
                  type="date"
                  aria-label={`Aktiv bis von ${p.name}`}
                  value={p.aktiv_bis}
                  onChange={(e) => onChange(p.id, { aktiv_bis: e.target.value })}
                />
              </td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/PersonenTabelle.test.tsx`
Expected: PASS (alle Tests der Datei)

- [ ] **Step 5: Commit**

```bash
git add src/components/PersonenTabelle.tsx src/components/PersonenTabelle.test.tsx
git commit -m "feat: add editable Zeitraum-im-Projekt (aktiv_ab/aktiv_bis) fields to PersonenTabelle"
```

---

### Task 4: "Projekttag" als Thema-Option (Kurse + Themenwochen)

**Files:**
- Modify: `src/lib/types.ts:40`
- Modify: `src/components/ReihenEditor.tsx:8`
- Modify: `src/components/VeranstaltungenUebersicht.tsx:6`
- Test: `src/components/ReihenEditor.test.tsx`
- Test: `src/components/VeranstaltungenUebersicht.test.tsx`

**Interfaces:**
- Produces: `Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie' | 'Projekttag'` — wird von Task-5-Code (`ThemenUebersicht.tsx`) als Legende/Farbschlüssel konsumiert.

- [ ] **Step 1: Write the failing test (ReihenEditor)**

Füge in `src/components/ReihenEditor.test.tsx` in einem bestehenden Test, der die Thema-Auswahl prüft (suche nach `option` bzw. `getByLabelText(/Thema/` in der Datei — falls kein solcher Test existiert, neuen Block ergänzen):

```typescript
describe('Projekttag als Thema-Option', () => {
  it('offers Projekttag as a selectable option in the Thema dropdown', () => {
    renderReihenEditor()
    const select = screen.getByLabelText(`Thema für Termin ${reihe.einheiten[0].index} in ${reihe.titel}`)
    expect(within(select).getByText('Projekttag')).toBeInTheDocument()
  })
})
```

Die Datei hat bereits `reihe` (mit zwei Einheiten, Zeilen 6-33) und `renderReihenEditor()` (Zeilen 40-55) — beide wiederverwenden. Ergänze am Dateianfang den Import `within` aus `@testing-library/react` (`import { render, screen, within, fireEvent } from '@testing-library/react'`, bestehende Importe aus Zeile 2 beibehalten).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ReihenEditor.test.tsx -t "Projekttag als Thema-Option"`
Expected: FAIL — `Projekttag` ist keine Option im Select.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/types.ts:40`, ändere:

```typescript
export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie'
```

zu:

```typescript
export type Thema = 'Ernährung' | 'Stadtgrün' | 'Mobilität' | 'Energie' | 'Projekttag'
```

In `src/components/ReihenEditor.tsx:8`, ändere:

```typescript
const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie']
```

zu:

```typescript
const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie', 'Projekttag']
```

In `src/components/VeranstaltungenUebersicht.tsx:6`, dieselbe Änderung:

```typescript
const THEMEN: Thema[] = ['Ernährung', 'Stadtgrün', 'Mobilität', 'Energie', 'Projekttag']
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ReihenEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Write the failing test (VeranstaltungenUebersicht)**

Füge in `src/components/VeranstaltungenUebersicht.test.tsx` (Import `within` aus `@testing-library/react` ergänzen) folgenden Test hinzu, unter Nutzung der bestehenden `veranstaltungen`-Fixture (Zeilen 15-32) und `renderUebersicht()`-Hilfsfunktion (Zeilen 34-51):

```typescript
describe('Projekttag als Thema-Option', () => {
  it('offers Projekttag as a selectable option in the Thema dropdown', () => {
    renderUebersicht()
    const termin = veranstaltungen[0].termine[0]
    const select = screen.getByLabelText(`Thema für Termin ${termin.index} in ${veranstaltungen[0].titel}`)
    expect(within(select).getByText('Projekttag')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/VeranstaltungenUebersicht.test.tsx`
Expected: PASS (Step 3 hat die Implementierung für beide Dateien bereits geliefert — dieser Test bestätigt es nur für die zweite Komponente)

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/components/ReihenEditor.tsx src/components/VeranstaltungenUebersicht.tsx src/components/ReihenEditor.test.tsx src/components/VeranstaltungenUebersicht.test.tsx
git commit -m "feat: add Projekttag as a selectable Thema for Kurse and Themenwochen"
```

---

### Task 5: Projekttag-Farbe und Theorie/Praxis-Trennlinie im Themen-Gantt

**Files:**
- Modify: `src/components/ThemenUebersicht.tsx`
- Test: `src/components/ThemenUebersicht.test.tsx`

**Interfaces:**
- Consumes: `ThemenGanttZeile` aus `../lib/themenUebersicht` (bereits vorhanden, Felder `reiheId`, `thema`, `startWochenKey`, `zeilenLabel` — keine Änderung an `themenUebersicht.ts` nötig, da die Gruppierung dort feldunabhängig vom konkreten `Thema`-Wert arbeitet).
- Produces: keine neuen Exporte — rein visuelle Ergänzung innerhalb der Komponente.

- [ ] **Step 1: Write the failing test**

Füge in `src/components/ThemenUebersicht.test.tsx` folgenden Test hinzu (nach dem letzten bestehenden Test im `describe('ThemenUebersicht', ...)`-Block):

```typescript
  it('renders a Theorie/Praxis divider line at the start of a Projekttag-Balken', () => {
    const projekttagZeilen: ThemenGanttZeile[] = [
      {
        reiheId: 'r1',
        zeilenLabel: 'Schule X - Kurs Y',
        balkenLabel: 'Projekttag',
        thema: 'Projekttag',
        startWochenKey: '2026-KW38',
        endWochenKey: '2026-KW38',
        stunden: 6,
      },
    ]
    render(<ThemenUebersicht zeilen={projekttagZeilen} wochen={wochen} />)
    expect(screen.getByTitle('Theorie → Praxis: Schule X - Kurs Y ab 2026-KW38')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ThemenUebersicht.test.tsx -t "Theorie/Praxis divider"`
Expected: FAIL — kein Element mit diesem `title` vorhanden.

- [ ] **Step 3: Write minimal implementation**

In `src/components/ThemenUebersicht.tsx:8-14`, ergänze `THEMEN_FARBEN` um `Projekttag`:

```typescript
const THEMEN_FARBEN: Record<Thema | 'ohne', string> = {
  Ernährung: '#e07a5f',
  Stadtgrün: '#3d9970',
  Mobilität: '#4a7fbf',
  Energie: '#e6b800',
  Projekttag: '#6b4c9a',
  ohne: '#8a8a8a',
}
```

Ergänze direkt darunter eine Konstante für die Trennlinien-Farbe:

```typescript
const THEORIE_PRAXIS_LINIE_FARBE = '#d62728'
```

Ergänze nach der Berechnung von `ferienBaender` (nach Zeile `const ferienBaender = berechneFerienBaender(wochen)`) die Ermittlung der Projekttag-Marker:

```typescript
  const projekttagMarker = zeilen.filter((z) => z.thema === 'Projekttag')
```

Ergänze im Grid, nach dem Block, der `zeilen.map((z) => ...)` rendert (also nach dem schließenden `))}` der Balken), ein neues Overlay:

```tsx
          {projekttagMarker.map((z) => (
            <div
              key={`${z.reiheId}-${z.startWochenKey}-praxis-linie`}
              className="themen-gantt-praxis-linie"
              title={`Theorie → Praxis: ${z.zeilenLabel} ab ${z.startWochenKey}`}
              style={{
                gridColumn: `${(indexVon.get(z.startWochenKey) ?? 0) + 2}`,
                gridRow: (rowVonReihe.get(z.reiheId) ?? 0) + 2,
                borderLeft: `3px solid ${THEORIE_PRAXIS_LINIE_FARBE}`,
              }}
            />
          ))}
```

Ergänze in `src/components/ThemenUebersicht.css` am Ende der Datei folgende Regel:

```css
.themen-gantt-praxis-linie {
  height: 100%;
  width: 0;
  pointer-events: none;
  z-index: 1;
}
```

Der Grid-Item nimmt so keine sichtbare Breite ein außer der per `borderLeft` inline gesetzten 3px-Linie, steht aber über die volle Höhe der Zeile (`height: 100%` innerhalb der Grid-Zelle) und blockiert keine Klicks auf den darunterliegenden Balken.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/ThemenUebersicht.test.tsx`
Expected: PASS (alle Tests der Datei, inklusive der bereits bestehenden vier Tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/ThemenUebersicht.tsx src/components/ThemenUebersicht.css src/components/ThemenUebersicht.test.tsx
git commit -m "feat: color-code Projekttag and mark the Theorie/Praxis transition with a divider line"
```

---

### Task 6: Gesamtabnahme

**Files:** keine neuen — Verifikation über die gesamte Suite.

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: alle Tests grün, keine Regressionen in anderen Dateien (insbesondere `useAppData.test.ts`, `personenKapazitaet.test.ts`, `themenUebersicht.test.ts`, die `Thema`/`PersonenUmverteilung` nutzen).

- [ ] **Step 2: Run build/typecheck**

Run: `npm run build`
Expected: erfolgreicher Build ohne TypeScript-Fehler (insbesondere wegen des erweiterten `Thema`-Union-Types und des neuen optionalen Parameters von `berechneAngebotProWoche`).

- [ ] **Step 3: Manual smoke check (optional, falls Dev-Server verfügbar)**

Run: `npm run dev`, im Browser: Kursname in einer Schule prüfen (breiteres Feld), Personen-Umverteilung anlegen und im Wochenübersichtsgraph die Verschiebung beobachten, bei einer Person Zeitraum ändern, einer Einheit "Projekttag" zuweisen und im Themen-Gantt die Trennlinie sehen.
