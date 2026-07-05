# Kapazitätsrechner Schulbegleitung

Lokales Planungstool für das Projekt „Zukunft Wuppertal – Schulen gestalten Wandel".
Spezifikation: `docs/superpowers/specs/2026-07-02-berechnungstool-kapazitaetsrechner-design.md`

## Starten

```bash
npm install
npm run dev
```

## Tests

```bash
npm test
```

## Daten

Seed-Daten liegen in `src/data/data.json`. Im UI vorgenommene Änderungen sind
über den Export/Import-Button als JSON sicherbar; ohne Export gehen sie beim
Neuladen der Seite verloren (keine Datenbank).
