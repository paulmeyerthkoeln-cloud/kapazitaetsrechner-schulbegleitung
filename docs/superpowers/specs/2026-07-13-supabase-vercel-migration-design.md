# Supabase + Vercel Migration — Design

## Zweck

Das Kapazitätsrechner-Tool läuft heute rein lokal: Der Datenbestand liegt
pro Browser in `localStorage`, Änderungen anderer Teammitglieder werden nur
über manuellen JSON-Export/-Import geteilt, und die App wird per GitHub
Actions nach GitHub Pages deployed. Ziel dieser Migration: das ganze Team
arbeitet an einem gemeinsamen, immer aktuellen Datenbestand in Supabase,
und die App wird über Vercel (angebunden an GitHub) veröffentlicht.

## Entscheidungen (aus Brainstorming bestätigt)

- **Zugriffsschutz:** keiner. Die App ist öffentlich erreichbar, jeder mit
  dem Link kann lesen und schreiben. Kein Supabase-Auth-Login.
- **Kollaboration:** kein Live-Sync/Realtime. Datenbestand wird beim Öffnen
  der App geladen, jede Änderung wird sofort zurückgeschrieben. Andere
  Nutzer:innen sehen Änderungen erst nach eigenem Neuladen.
- **Datenmodell:** eine einzige Tabellenzeile mit einer `jsonb`-Spalte, die
  den kompletten heutigen `Datenbestand` (siehe `src/lib/types.ts`) als ein
  Objekt enthält — keine Normalisierung in Einzeltabellen.
- **Hosting:** Vercel löst GitHub Pages vollständig ab; der bestehende
  Deploy-Workflow wird entfernt.

## Architektur im Überblick

Die App bleibt eine reine Client-App (React/Vite) ohne eigenen
Server/Backend-Code. `useAppData.ts` lädt beim Start den Datenbestand aus
Supabase statt aus `localStorage`/`data.json` und schreibt jede Änderung
direkt zurück. Supabase übernimmt die Rolle der Datenbank direkt aus dem
Browser heraus (über den öffentlichen `anon`/`publishable` Key). Vercel
baut und hostet die App bei jedem Push auf `main` automatisch über die
GitHub-Integration.

## Supabase-Schema

```sql
create table datenbestand (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);

alter table datenbestand enable row level security;

create policy "anon read/write" on datenbestand
  for all using (true) with check (true);
```

Eine einzige Zeile (`id = 1`) enthält den kompletten `Datenbestand` als
JSON — exakt das, was heute `exportJson()` liefert. RLS wird aktiviert und
über eine "erlaube alles"-Policy für den `anon`-Key wieder geöffnet (statt
RLS ganz wegzulassen), damit sich später — falls doch mal Zugriffsschutz
gewünscht wird — eine Einschränkung nachrüsten lässt, ohne die
Tabellenstruktur zu ändern.

Die Erstbefüllung erfolgt einmalig per SQL-Insert aus den heutigen
Seed-Daten (`src/data/data.json`), damit das Team direkt mit dem aktuellen
Planungsstand startet:

```sql
insert into datenbestand (id, data) values (1, '<Inhalt von data.json>');
```

## Laden/Speichern in der App

- **Laden:** `supabase.from('datenbestand').select('data').eq('id', 1).single()`
  beim Start von `useAppData`. Bei Erfolg wird `migriereDatenbestand(row.data)`
  angewendet (bestehende Migrationslogik bleibt unverändert). Bei Fehler
  (kein Netz, Tabelle leer, RLS-Problem) wird ein Fehlerzustand angezeigt
  statt still auf die Seed-Daten zurückzufallen — niemand soll unbemerkt auf
  einem veralteten/lokalen Stand weiterarbeiten.
- **Speichern:** Der bestehende `useEffect(() => {...}, [data])`, der heute
  `localStorage.setItem(...)` aufruft, wird durch
  `supabase.from('datenbestand').update({ data, updated_at: new Date().toISOString() }).eq('id', 1)`
  ersetzt. Kein Debounce — Schreibvorgänge sind durch Formulareingaben
  getaktet, nicht durch Tastenanschläge.
- **Lokaler Notanker:** Zusätzlich zum Supabase-Schreiben wird bei jedem
  erfolgreichen Speichern ein Snapshot in `localStorage` abgelegt (nicht als
  Quelle der Wahrheit — nur als Rückfalloption, falls das Netz beim nächsten
  Speichern wegbricht und der zuletzt eingegebene Stand sonst verloren
  ginge).
- Alle ~30 bestehenden Änderungsfunktionen in `useAppData.ts`
  (`setPerson`, `addEinheit`, `setVeranstaltungSchulen`, ...) bleiben
  unverändert — sie arbeiten weiterhin auf dem in-memory `Datenbestand` und
  lösen über den bestehenden Effekt indirekt das Schreiben aus.

## Zurücksetzen-Knopf

Der bestehende "Zurücksetzen auf Ausgangsdaten"-Button (`zuruecksetzen()`
in `useAppData.ts`, aufgerufen aus `ExportImport.tsx`) setzt heute ohne
Rückfrage den lokalen Stand zurück. Da der Datenbestand jetzt geteilt ist,
würde ein versehentlicher Klick die Arbeit des ganzen Teams löschen. Vor
dem Zurücksetzen wird ein Bestätigungsdialog (`window.confirm(...)`)
ergänzt; erst bei Bestätigung wird die Seed-Struktur nach Supabase
zurückgeschrieben.

Export/Import als JSON bleiben als manuelles Backup-/Wiederherstellungswerkzeug
erhalten. `importJson` schreibt künftig ebenfalls in die geteilte
Supabase-Zeile statt nur in den lokalen State.

## Vercel + GitHub Deployment

- `.github/workflows/deploy.yml` wird gelöscht.
- Ersetzt durch einen schlanken CI-Workflow, der bei Push/PR nur
  `npm test` und `npm run build` ausführt (keine Deploy-Schritte), damit
  kaputte Tests/Builds weiterhin automatisch auffallen, auch wenn Vercel
  das eigentliche Deployment übernimmt.
- Das Anlegen des Vercel-Projekts, die Verbindung mit dem GitHub-Repo und
  das Eintragen der Env-Vars (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`) im Vercel-Dashboard sind manuelle
  Schritte, die der Nutzer im eigenen Vercel-Account durchführt. Die
  Implementierung liefert dafür eine kurze Schritt-für-Schritt-Anleitung.
- Das Ausführen des SQL-Schemas gegen die echte Supabase-Instanz ist
  ebenfalls ein manueller Schritt (SQL-Datei zum Einfügen in den Supabase
  SQL-Editor), sofern kein CLI-Zugriffstoken bereitgestellt wird.

## Env-Dateien & Secrets

- `.env.local` (nicht `.env`) für lokale Entwicklung mit
  `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY`. `.env.local`
  ist über das bestehende `*.local`-Muster in `.gitignore` bereits
  ausgeschlossen.
- `.env.example` ohne echte Werte wird eingecheckt, damit die benötigten
  Variablen dokumentiert sind.
- Der `publishable`-Key ist bewusst öffentlich (landet im Browser-Bundle) —
  das ist bei Supabase so vorgesehen und passt zur Entscheidung "kein
  Zugriffsschutz".

## Testing

Die bestehenden Vitest-Tests für `useAppData` (`useAppData.test.ts`)
mocken aktuell direkt `localStorage`. Sie werden auf ein gemocktes
Supabase-Client-Modul umgestellt (`vi.mock('../lib/supabase')`), damit
Laden/Speichern-Logik ohne echte Netzwerkaufrufe getestet wird. Die
bestehenden Tests für die Änderungsfunktionen selbst (die auf dem
in-memory State operieren) bleiben inhaltlich unverändert.

## Out of Scope

- Supabase Auth / Login pro Person.
- Realtime-Sync zwischen mehreren gleichzeitig geöffneten Sitzungen.
- Normalisierung des Datenbestands in Einzeltabellen.
- Versionierung/Historie von Änderungen über die Zeit hinaus (kein
  Audit-Log, kein "wer hat was geändert").
