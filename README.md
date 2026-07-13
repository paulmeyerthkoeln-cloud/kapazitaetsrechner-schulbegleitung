# Kapazitätsrechner Schulbegleitung

Planungstool für das Projekt „Zukunft Wuppertal – Schulen gestalten Wandel".
Spezifikation: `docs/superpowers/specs/2026-07-02-berechnungstool-kapazitaetsrechner-design.md`
Supabase/Vercel-Migration: `docs/superpowers/specs/2026-07-13-supabase-vercel-migration-design.md`

## Starten

```bash
npm install
npm run dev
```

Für `npm run dev` wird eine `.env.local` mit den Supabase-Zugangsdaten benötigt (siehe unten).

## Tests

```bash
npm test
```

## Daten

Der Datenbestand liegt zentral in Supabase (eine Zeile in der Tabelle
`datenbestand`) — alle im Team sehen beim Neuladen der Seite denselben,
aktuellen Stand. Es gibt kein Login; wer den Link hat, kann lesen und
schreiben. Export/Import als JSON über den entsprechenden Button bleiben
als manuelles Backup verfügbar.

## Supabase einrichten (einmalig)

1. Env-Datei anlegen: `.env.example` nach `.env.local` kopieren und mit den
   echten Werten aus dem Supabase-Dashboard (Project Settings → API)
   befüllen.
2. Tabelle anlegen: Inhalt von `supabase/schema.sql` im Supabase SQL-Editor
   ausführen.
3. Seed-Daten erzeugen und einspielen: `npm run generate:seed-sql` erzeugt
   `supabase/seed.sql` aus `src/data/data.json`; dessen Inhalt im Supabase
   SQL-Editor ausführen, um die Startdaten in die Tabelle zu schreiben.

## Auf Vercel veröffentlichen (einmalig)

1. Im Vercel-Dashboard ein neues Projekt aus diesem GitHub-Repo anlegen
   (Vercel erkennt Vite automatisch).
2. Unter Project Settings → Environment Variables die beiden Variablen aus
   `.env.example` mit den echten Werten eintragen
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
3. Ab jetzt deployed Vercel automatisch bei jedem Push auf `main`.
