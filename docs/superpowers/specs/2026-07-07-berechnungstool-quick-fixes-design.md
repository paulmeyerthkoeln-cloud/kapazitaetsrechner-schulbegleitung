# Berechnungstool: Quick Fixes (Graphs, Themenübersicht, Schulen-Tabelle)

## Context

Five independent, low-ambiguity fixes/cleanups requested for the Berechnungstool, split off from a larger set of changes so they can ship before the bigger person-capacity feature (tracked separately). None of these touch the core calculation model (`berechnung.ts`) except where noted.

## 1. WochenHeatmap (Graph 1): label weeks under the squares

`src/components/WochenHeatmap.tsx` renders one button per week in a single-row CSS grid (`grid-auto-flow: column`, `grid-auto-columns: 1.75rem`, horizontally scrollable). Currently the only way to identify a week is via hover tooltip/aria-label — no visible label.

**Change:** wrap each `<button class="wochen-heatmap-zelle">` in a cell container that also renders a small label below it showing the KW number (e.g. `36`), reusing the `kwNummer()` helper (see section 3 below). Keep the existing grid column width so cells stay aligned; the label sits in an added grid row (`grid-template-rows: auto auto` or a nested flex column per cell). Tooltip/aria-label behavior is unchanged.

## 2. BedarfAngebotChart (Graph 2): visible x-axis

`src/components/BedarfAngebotChart.tsx` already has `<XAxis dataKey="wochenKey" hide />` — the axis exists but is hidden.

**Change:**
- Remove `hide`.
- Format ticks via `tickFormatter={kwNummer}` (shared helper).
- Angle the tick labels (`angle={-45}`, `textAnchor="end"`) so they stay readable with many weeks on screen.
- Increase bottom margin on the `BarChart`/`ResponsiveContainer` enough to fit the angled labels without clipping.

## 3. Shared `kwNummer` helper

`kwNummer()` currently exists as a private function inside `ThemenUebersicht.tsx` (parses `"2026-KW36"` → `"36"`). It's needed by both changes above.

**Change:** move it to `src/lib/kalenderwochen.ts` as an exported function; update `ThemenUebersicht.tsx`, `WochenHeatmap.tsx`, and `BedarfAngebotChart.tsx` to import it from there.

## 4. Remove Ferien-warning from Themenübersicht

`ThemenUebersicht.tsx:48-60` renders a "⚠️ N Termin(e) liegen in den Ferien" warning block, driven by `findeEinheitenInFerien()` in `src/lib/ferienWarnung.ts`, called from `useAppData.ts`.

**Change:** remove the warning block from `ThemenUebersicht.tsx`; delete `src/lib/ferienWarnung.ts` and `src/lib/ferienWarnung.test.ts`; remove the now-unused import/call of `findeEinheitenInFerien` from `useAppData.ts`.

## 5. Fix: multi-Einheit topics collapsing into one week

**Root cause:** `addEinheit()` in `src/state/useAppData.ts:111-133` always stamps a new Einheit's `datum_oder_kw` with `format(new Date(), 'yyyy-MM-dd')` regardless of other Einheiten already in the Reihe. Adding four Einheiten via "+ Termin hinzufügen" and assigning the same Thema to each gives them all today's date → same `wochenKey` → the (already-correct) Gantt grouping in `berechneThemenGantt` renders them as a single-week bar instead of four consecutive weeks.

**Change:** in `addEinheit()`, compute the latest `wochenKey` among the Reihe's existing Einheiten (via `parseZuWochenKey` on each `datum_oder_kw`, taking the max ISO week key), and set the new Einheit's date to the Monday of the week after that (`addWeeks(..., 1)`), formatted as `yyyy-MM-dd`. If the Reihe has no existing Einheiten, fall back to today's date (current behavior).

## 6. Unify Unterrichtszeit/Koordination to minutes

`ReihenEditor.tsx` currently shows Unterrichtszeit in minutes (converts to/from `kontaktzeit_h` hours) but Koordination directly in hours (`koordinationszeit_h`, no conversion) — same-looking numeric fields with different units side by side.

**Change:** give the Koordination input the same minutes display/edit treatment as Unterrichtszeit (`Math.round(e.koordinationszeit_h * 60)` displayed, `/ 60` stored on change). Header label changes from `Koordination h/KW` to `Koordination (min)`. Internal storage (`koordinationszeit_h`, hours) and all downstream calculations are unchanged — this is a display-layer fix only.

## 7. Remove "Restkapazität für die 10. Schule" section

`RestkapazitaetPlanner.tsx` is a standalone what-if planner (hardcoded candidate months, not tied to real school/Reihe data) rendered from `App.tsx`.

**Change:** delete `RestkapazitaetPlanner.tsx`, `src/lib/restkapazitaet.ts`, and their test files; remove the import and render call from `App.tsx`.

## Testing

- Existing test suites (`ThemenUebersicht.test.tsx`, `useAppData.test.ts`, `ReihenEditor.test.tsx`, `WochenHeatmap.test.tsx`) get updated/extended to cover: KW labels rendered under heatmap cells, visible x-axis ticks in the bar chart, absence of the Ferien-warning block, `addEinheit` producing sequential week dates for successive calls, and minutes-based Koordination round-tripping correctly.
- Delete `ferienWarnung.test.ts` and the Restkapazität test file(s) along with their source.
- Run full `npm test` and `npm run build`/typecheck before considering this done.

## Out of scope

Per-person capacity tracking, Begleitperson assignment, and per-person redistribution (items 4b/6 of the original request) are a separate, larger feature — brainstormed and planned separately.
