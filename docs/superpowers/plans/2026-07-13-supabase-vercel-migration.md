# Supabase + Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the local-only `localStorage`/JSON-export persistence of the Kapazitätsrechner with a single shared Supabase row so the whole team always works on the same up-to-date data, and replace the GitHub Pages deploy with Vercel.

**Architecture:** `useAppData.ts` gains a `ladePhase` (`'laedt' | 'fehler' | 'bereit'`) alongside the existing `data`. On mount it fetches the one `datenbestand` row from Supabase (`supabase.from('datenbestand').select('data').eq('id', 1).single()`), migrates it with the existing `migriereDatenbestand`, and flips to `'bereit'`. Every subsequent change to `data` is written straight back to that same row, plus a write-only `localStorage` snapshot as a safety net. `App.tsx` gates rendering on `ladePhase` so the ~30 existing setter functions in `useAppData.ts` never change. No auth, no realtime — see spec for the full rationale.

**Tech Stack:** React 19, Vite, Vitest + Testing Library, `@supabase/supabase-js`, Vercel (GitHub integration), GitHub Actions (CI only, no deploy).

**Spec:** `docs/superpowers/specs/2026-07-13-supabase-vercel-migration-design.md`

## Global Constraints

- No Supabase Auth / login — the app stays publicly reachable, anyone with the link can read and write (confirmed decision).
- No Realtime — data loads once on open, changes are written but other open sessions only see them after their own reload.
- Datenbestand stays a single `jsonb` blob in one row (`id = 1`) — no relational normalization.
- GitHub Pages is fully retired; `.github/workflows/deploy.yml` is deleted, Vercel takes over deployment via its GitHub integration.
- The Supabase `publishable` key is meant to be public (ships in the browser bundle) — this is expected, not a leak.
- `.env.local` (not `.env`) holds real values locally; it's already covered by the `*.local` pattern in `.gitignore`.
- `npm run build` and `npm test` must keep passing with no real Supabase network access (Vite only statically reads `import.meta.env.*`, it never executes app code during build; tests mock the Supabase client module).

---

### Task 1: Supabase client module

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/lib/supabaseClient.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `supabase` (a configured `SupabaseClient` instance), imported by later tasks as `import { supabase } from '../lib/supabaseClient'`.

- [ ] **Step 1: Install the Supabase client library**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Create the Supabase client module**

Create `src/lib/supabaseClient.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY müssen gesetzt sein (siehe .env.example).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
```

- [ ] **Step 3: Document the required env vars**

Create `.env.example`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
```

Then locally create `.env.local` (not committed — matches the existing `*.local` entry in `.gitignore`) with this project's real values from the Supabase dashboard (Project Settings → API), the same values already shared for this project.

- [ ] **Step 4: Verify it compiles**

Run: `npm run build`
Expected: build succeeds. (Vite only statically substitutes `import.meta.env.*` at build time — it doesn't execute `supabaseClient.ts`'s guard clause, so no real env vars are needed for this check. The guard only runs when the module is actually imported at runtime, e.g. `npm run dev` or in the browser.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/supabaseClient.ts .env.example
git commit -m "feat(berechnungstool): add Supabase client module"
```

---

### Task 2: Supabase schema and seed SQL

**Files:**
- Create: `supabase/schema.sql`
- Create: `scripts/generate-seed-sql.mjs`
- Modify: `package.json` (add script)
- Create: `supabase/seed.sql` (generated, not hand-written)

**Interfaces:**
- Produces: `supabase/schema.sql` and `supabase/seed.sql`, both meant to be pasted into the Supabase SQL editor manually (documented in Task 7's README update) — no other task depends on their content programmatically.

- [ ] **Step 1: Write the schema SQL**

Create `supabase/schema.sql`:

```sql
create table if not exists datenbestand (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);

alter table datenbestand enable row level security;

create policy "anon read/write" on datenbestand
  for all using (true) with check (true);
```

- [ ] **Step 2: Write the seed-SQL generator script**

Create `scripts/generate-seed-sql.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs'

const roh = readFileSync(new URL('../src/data/data.json', import.meta.url), 'utf8')
const daten = JSON.parse(roh)
const jsonLiteral = JSON.stringify(daten).replace(/'/g, "''")

const sql = `insert into datenbestand (id, data)
values (1, '${jsonLiteral}'::jsonb)
on conflict (id) do update set data = excluded.data, updated_at = now();
`

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), sql)
console.log('supabase/seed.sql geschrieben.')
```

- [ ] **Step 3: Add an npm script for it**

Modify `package.json`, in `"scripts"` add (after `"test": "vitest run"`):

```json
    "generate:seed-sql": "node scripts/generate-seed-sql.mjs"
```

- [ ] **Step 4: Run it and verify the output**

Run: `npm run generate:seed-sql`
Expected: prints `supabase/seed.sql geschrieben.`

Run: `head -c 200 supabase/seed.sql`
Expected: output starts with `insert into datenbestand (id, data)` followed by `values (1, '{"settings":...`

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql scripts/generate-seed-sql.mjs package.json supabase/seed.sql
git commit -m "feat(berechnungstool): add Supabase schema and seed SQL generation"
```

---

### Task 3: Load and save the Datenbestand through Supabase

This is the core change. `useAppData.ts`'s ~30 change functions (`setPerson`, `addEinheit`, ...) are untouched — only the loading/saving layer around them changes. `useAppData.test.ts` is rewritten first (TDD: it will fail against the current implementation), then the implementation is rewritten to match.

**Files:**
- Modify: `src/state/useAppData.test.ts` (full rewrite)
- Modify: `src/state/useAppData.ts:1-18` (imports), `:20-21` (constants), `:128-150` (load/save), `:504-507` (`zuruecksetzen`), `:516-550` (return object)

**Interfaces:**
- Consumes: `supabase` from `../lib/supabaseClient` (Task 1); `Datenbestand`, `migriereDatenbestand`, `pruefePflichtfelder` (already in this file).
- Produces: `useAppData()` now additionally returns `ladePhase: 'laedt' | 'fehler' | 'bereit'` and `ladeFehler: string | null`, on top of every existing field (`data`, `setPerson`, `exportJson`, `zuruecksetzen`, ...) which keep their exact existing signatures. `data` is **never** `null` — before the first successful load it holds an empty placeholder `Datenbestand`, so `App.tsx` (Task 4) only needs to gate rendering on `ladePhase`, not on `data` itself.

- [ ] **Step 1: Replace the test file**

Replace the full contents of `src/state/useAppData.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import seedData from '../data/data.json'
import type { Datenbestand } from '../lib/types'

const { selectSingleMock, updateMock, setLadeErgebnis, setUpdateFehler } = vi.hoisted(() => {
  let ladeErgebnis: { data: { data: unknown } | null; error: { message: string } | null } = {
    data: null,
    error: null,
  }
  let updateFehler: { message: string } | null = null
  const selectSingleMock = vi.fn(() => Promise.resolve(ladeErgebnis))
  const updateMock = vi.fn(() => ({ eq: () => Promise.resolve({ error: updateFehler }) }))
  return {
    selectSingleMock,
    updateMock,
    setLadeErgebnis: (naechstesErgebnis: typeof ladeErgebnis) => {
      ladeErgebnis = naechstesErgebnis
    },
    setUpdateFehler: (naechsterFehler: typeof updateFehler) => {
      updateFehler = naechsterFehler
    },
  }
})

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: selectSingleMock }) }),
      update: updateMock,
    }),
  },
}))

import { useAppData } from './useAppData'

async function renderBereitesAppData() {
  const utils = renderHook(() => useAppData())
  await waitFor(() => expect(utils.result.current.ladePhase).toBe('bereit'))
  return utils
}

describe('useAppData', () => {
  beforeEach(() => {
    localStorage.clear()
    setLadeErgebnis({ data: { data: seedData as unknown }, error: null })
    setUpdateFehler(null)
    selectSingleMock.mockClear()
    updateMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the seed data without legacy optional scenario people', async () => {
    const { result } = await renderBereitesAppData()
    expect(result.current.data.personen.length).toBeGreaterThan(0)
    expect(result.current.data.personen.some((p) => p.szenario_optional)).toBe(false)
    expect(result.current.ergebnis.wochen.length).toBeGreaterThan(0)
  })

  it('shows an error state when the Supabase load fails', async () => {
    setLadeErgebnis({ data: null, error: { message: 'Netzwerkfehler' } })
    const { result } = renderHook(() => useAppData())
    await waitFor(() => expect(result.current.ladePhase).toBe('fehler'))
    expect(result.current.ladeFehler).toBe('Netzwerkfehler')
  })

  it('shows an error state when the Supabase row is missing required fields', async () => {
    setLadeErgebnis({ data: { data: { settings: {} } }, error: null })
    const { result } = renderHook(() => useAppData())
    await waitFor(() => expect(result.current.ladePhase).toBe('fehler'))
    expect(result.current.ladeFehler).not.toBeNull()
  })

  it('setPerson updates a person’s weekly hours and recomputes the ergebnis', async () => {
    const { result } = await renderBereitesAppData()
    const personId = result.current.data.personen[0].id
    const vorher = result.current.ergebnis.wochen[0].angebot
    act(() => {
      result.current.setPerson(personId, { stunden_pro_woche_fuer_begleitung: 20 })
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(20)
    expect(result.current.ergebnis.wochen[0].angebot).not.toBe(vorher)
  })

  it('setEinheitBegleitung toggles a single Einheit and recomputes the ergebnis', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
  })

  it('addPerson appends a directly counted person with editable defaults', async () => {
    const { result } = await renderBereitesAppData()
    const vorherigeAnzahl = result.current.data.personen.length
    const vorherigesAngebot = result.current.ergebnis.wochen[0].angebot
    act(() => {
      result.current.addPerson()
    })
    expect(result.current.data.personen).toHaveLength(vorherigeAnzahl + 1)
    expect(result.current.data.personen.at(-1)?.name).toMatch(/Person/)
    expect(result.current.ergebnis.wochen[0].angebot).toBeGreaterThan(vorherigesAngebot)
  })

  it('removePerson deletes the selected person and recomputes the ergebnis', async () => {
    const { result } = await renderBereitesAppData()
    const zuLoeschen = result.current.data.personen[0]
    act(() => {
      result.current.removePerson(zuLoeschen.id)
    })
    expect(result.current.data.personen.find((p) => p.id === zuLoeschen.id)).toBeUndefined()
  })

  it('addPerson seeds an empty urlaub list', async () => {
    const { result } = await renderBereitesAppData()
    act(() => {
      result.current.addPerson()
    })
    expect(result.current.data.personen.at(-1)?.urlaub).toEqual([])
  })

  it('setPersonUrlaub replaces the urlaub list of the matching Person only', async () => {
    const { result } = await renderBereitesAppData()
    const [p1, p2] = result.current.data.personen
    const neuerUrlaub = [{ name: 'Sommerurlaub', von: '2026-11-09', bis: '2026-11-13' }]
    act(() => {
      result.current.setPersonUrlaub(p1.id, neuerUrlaub)
    })
    expect(result.current.data.personen.find((p) => p.id === p1.id)?.urlaub).toEqual(neuerUrlaub)
    expect(result.current.data.personen.find((p) => p.id === p2.id)?.urlaub).toEqual([])
  })

  it('backfills an empty urlaub list for Personen persisted before the Urlaub field existed', async () => {
    const roh = {
      settings: {
        planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
        schwellwert_warnung: 0.7,
        schwellwert_kritisch: 0.9,
        default_fahrzeit_h: 1,
        default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
        default_vorbereitungsfaktor_wiederholung: 0.25,
      },
      personen: [{ id: 'p1', name: 'Anna', stunden_pro_woche_fuer_begleitung: 8, aktiv_ab: '2026-09-01', aktiv_bis: '2027-07-16', abwesenheiten: [] }],
      kalender: { ferien: [] },
      schulen: [],
    }
    setLadeErgebnis({ data: { data: roh }, error: null })
    const { result } = await renderBereitesAppData()
    expect(result.current.data.personen[0].urlaub).toEqual([])
  })

  it('addEinheit appends a new Einheit with default values and the correct index', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const vorherigeAnzahl = reihe.einheiten.length
    act(() => {
      result.current.addEinheit(reihe.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten).toHaveLength(vorherigeAnzahl + 1)
    const neueEinheit = aktualisierteReihe.einheiten[vorherigeAnzahl]
    expect(neueEinheit.kontaktzeit_h).toBe(1.5)
    expect(neueEinheit.begleitperson_ids).toEqual([])
    expect(neueEinheit.koordinator_ids).toEqual([])
    expect(neueEinheit.erstdurchfuehrung).toBe(false)
    expect(neueEinheit.wir_begleiten).toBe(true)
    expect(neueEinheit.index).toBe(vorherigeAnzahl + 1)
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen[0].einheiten).toHaveLength(12)
  })

  it('addEinheit places the new Einheit one week after the Reihe\'s latest existing Einheit', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    act(() => {
      result.current.addEinheit(reihe.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    // Seed data for wdg's first Reihe has its latest existing Einheit in 2026-KW51 (see src/data/data.json).
    expect(aktualisierteReihe.einheiten.at(-1)?.datum_oder_kw).toBe('2026-12-21')
  })

  it('setEinheitBegleitung clears begleitperson_ids when toggled off', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_ids: [personId] })
    })
    act(() => {
      result.current.setEinheitBegleitung(reihe.id, einheit.id, false)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].wir_begleiten).toBe(false)
    expect(aktualisierteReihe.einheiten[0].begleitperson_ids).toEqual([])
  })

  it('removePerson clears the deleted Person from any begleitperson_ids/koordinator_ids on a Reihen-Einheit', async () => {
    const { result } = await renderBereitesAppData()
    const personId = result.current.data.personen[0].id
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { begleitperson_ids: [personId], koordinator_ids: [personId] })
    })
    act(() => {
      result.current.removePerson(personId)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten[0].begleitperson_ids).toEqual([])
    expect(aktualisierteReihe.einheiten[0].koordinator_ids).toEqual([])
  })

  it('removeEinheit deletes the matching Einheit and renumbers the rest', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const zuLoeschen = reihe.einheiten[1]
    act(() => {
      result.current.removeEinheit(reihe.id, zuLoeschen.id)
    })
    const aktualisierteReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisierteReihe.einheiten).toHaveLength(3)
    expect(aktualisierteReihe.einheiten.find((e) => e.id === zuLoeschen.id)).toBeUndefined()
    expect(aktualisierteReihe.einheiten.map((e) => e.index)).toEqual([1, 2, 3])
  })

  it('addReihe appends a new Reihe with sensible defaults to the correct Schule only', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const vorherigeAnzahl = schule.reihen.length
    act(() => {
      result.current.addReihe('wdg')
    })
    const aktualisierteSchule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(aktualisierteSchule.reihen).toHaveLength(vorherigeAnzahl + 1)
    const neueReihe = aktualisierteSchule.reihen.at(-1)!
    expect(neueReihe.titel).toBe('Neuer Kurs')
    expect(neueReihe.betreuungsmodell).toBe('A')
    expect(neueReihe.terminstatus).toBe('offen')
    expect(neueReihe.einheiten).toEqual([])
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen).toHaveLength(1)
  })

  it('removeReihe deletes the matching Reihe and leaves other Reihen/Schulen unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reiheId = schule.reihen[0].id
    act(() => {
      result.current.removeReihe('wdg', reiheId)
    })
    const aktualisierteSchule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    expect(aktualisierteSchule.reihen.find((r) => r.id === reiheId)).toBeUndefined()
  })

  it('setReiheTitel updates only the matching Reihe\'s titel', async () => {
    const { result } = await renderBereitesAppData()
    const wdgReiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    act(() => {
      result.current.setReiheTitel(wdgReiheId, 'Neuer Titel')
    })
    const wdgReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(wdgReihe.titel).toBe('Neuer Titel')
  })

  it('setEinheitFelder updates datum_oder_kw and kontaktzeit_h without touching other fields', async () => {
    const { result } = await renderBereitesAppData()
    const schule = result.current.data.schulen.find((s) => s.id === 'wdg')!
    const reihe = schule.reihen[0]
    const einheit = reihe.einheiten[0]
    act(() => {
      result.current.setEinheitFelder(reihe.id, einheit.id, { datum_oder_kw: '2026-12-01', kontaktzeit_h: 2 })
    })
    const aktualisierteEinheit = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].einheiten[0]
    expect(aktualisierteEinheit.datum_oder_kw).toBe('2026-12-01')
    expect(aktualisierteEinheit.kontaktzeit_h).toBe(2)
    expect(aktualisierteEinheit.wir_begleiten).toBe(einheit.wir_begleiten)
    expect(aktualisierteEinheit.id).toBe(einheit.id)
  })

  it('exportJson then importJson round-trips the data unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const exported = result.current.exportJson()
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 99 })
    })
    act(() => {
      result.current.importJson(exported)
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).not.toBe(99)
    expect(result.current.importError).toBeNull()
  })

  it('importJson with malformed JSON sets importError and leaves data unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const vorherigeDaten = result.current.data
    act(() => {
      result.current.importJson('not json')
    })
    expect(result.current.importError).not.toBeNull()
    expect(result.current.data).toBe(vorherigeDaten)
  })

  it('importJson with valid JSON missing a required top-level key sets importError and leaves data unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const vorherigeDaten = result.current.data
    act(() => {
      result.current.importJson(JSON.stringify({ settings: {}, personen: [], kalender: {} }))
    })
    expect(result.current.importError).not.toBeNull()
    expect(result.current.data).toBe(vorherigeDaten)
  })

  it('a failed import followed by a valid import succeeds and clears importError', async () => {
    const { result } = await renderBereitesAppData()
    const exported = result.current.exportJson()
    act(() => {
      result.current.importJson('not json')
    })
    expect(result.current.importError).not.toBeNull()
    act(() => {
      result.current.importJson(exported)
    })
    expect(result.current.importError).toBeNull()
    expect(result.current.data.personen.length).toBeGreaterThan(0)
  })

  it('setReiheTerminstatus updates only the matching Reihe and leaves others unchanged', async () => {
    const { result } = await renderBereitesAppData()
    const wdgReiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    const vorherSedanstrasse = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!.reihen[0].terminstatus
    act(() => {
      result.current.setReiheTerminstatus(wdgReiheId, 'offen')
    })
    const wdgReihe = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    const sedanstrasseReihe = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!.reihen[0]
    expect(wdgReihe.terminstatus).toBe('offen')
    expect(sedanstrasseReihe.terminstatus).toBe(vorherSedanstrasse)
  })

  it('setReiheEinheiten replaces the einheiten of the matching Reihe only', async () => {
    const { result } = await renderBereitesAppData()
    const reiheId = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0].id
    const neueEinheiten = [
      {
        id: 'neu_1',
        index: 1,
        datum_oder_kw: '2027-03-01',
        kontaktzeit_h: 1.5,
        erstdurchfuehrung: true,
        wir_begleiten: true,
        begleitperson_ids: [],
        koordinator_ids: [],
      },
    ]
    act(() => {
      result.current.setReiheEinheiten(reiheId, neueEinheiten)
    })
    const aktualisiert = result.current.data.schulen.find((s) => s.id === 'wdg')!.reihen[0]
    expect(aktualisiert.einheiten).toEqual(neueEinheiten)
    const andereSchule = result.current.data.schulen.find((s) => s.id === 'sedanstrasse')!
    expect(andereSchule.reihen[0].einheiten.length).toBeGreaterThan(1)
  })

  it('exposes themenGanttZeilen derived from the current data', async () => {
    const { result } = await renderBereitesAppData()
    expect(Array.isArray(result.current.themenGanttZeilen)).toBe(true)
    expect(result.current.themenGanttZeilen.length).toBeGreaterThan(0)
  })

  it('exposes personenKapazitaet derived from the current data', async () => {
    const { result } = await renderBereitesAppData()
    expect(Array.isArray(result.current.personenKapazitaet)).toBe(true)
    expect(result.current.personenKapazitaet).toHaveLength(result.current.data.personen.length)
  })

  it('addPersonenUmverteilung appends a new entry', async () => {
    const { result } = await renderBereitesAppData()
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.addPersonenUmverteilung(personId, '2026-KW46', '2026-KW47', 3)
    })
    expect(result.current.data.personenUmverteilungen).toHaveLength(1)
    expect(result.current.data.personenUmverteilungen?.[0]).toMatchObject({
      personId,
      quelleWochenKey: '2026-KW46',
      zielWochenKey: '2026-KW47',
      stunden: 3,
    })
  })

  it('removePersonenUmverteilung deletes the matching entry', async () => {
    const { result } = await renderBereitesAppData()
    const personId = result.current.data.personen[0].id
    act(() => {
      result.current.addPersonenUmverteilung(personId, '2026-KW46', '2026-KW47', 3)
    })
    const id = result.current.data.personenUmverteilungen![0].id
    act(() => {
      result.current.removePersonenUmverteilung(id)
    })
    expect(result.current.data.personenUmverteilungen).toHaveLength(0)
  })

  it('writes the updated data to Supabase after a change', async () => {
    const { result } = await renderBereitesAppData()
    updateMock.mockClear()
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    await waitFor(() => expect(updateMock).toHaveBeenCalled())
    const [[gespeichertesArgument]] = updateMock.mock.calls as [[{ data: Datenbestand; updated_at: string }]]
    expect(gespeichertesArgument.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42)
    expect(typeof gespeichertesArgument.updated_at).toBe('string')
  })

  it('keeps a local snapshot in localStorage after a successful save (Notanker)', async () => {
    const { result } = await renderBereitesAppData()
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    await waitFor(() => {
      const gespeichert = JSON.parse(localStorage.getItem('kapazitaetsrechner:data') ?? 'null')
      expect(gespeichert?.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42)
    })
  })

  it('does not crash when localStorage.setItem throws (e.g. private browsing / quota exceeded)', async () => {
    const { result } = await renderBereitesAppData()
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 77 })
    })
    await waitFor(() => expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(77))
    setItemSpy.mockRestore()
  })

  it('defaults terminstatus to festgelegt when loading persisted data missing that field', async () => {
    const roh = {
      settings: {
        planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
        schwellwert_warnung: 0.7,
        schwellwert_kritisch: 0.9,
        default_fahrzeit_h: 1,
        default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
        default_vorbereitungsfaktor_wiederholung: 0.25,
      },
      personen: [],
      kalender: { ferien: [] },
      schulen: [
        {
          id: 's1',
          name: 'Test',
          reihen: [{ id: 'r1', titel: 'x', betreuungsmodell: 'A', fahrzeit_h: 0, status: 'zugesagt', extern_betreut: false, einheiten: [] }],
        },
      ],
    }
    setLadeErgebnis({ data: { data: roh }, error: null })
    const { result } = await renderBereitesAppData()
    expect(result.current.data.schulen[0].reihen[0].terminstatus).toBe('festgelegt')
  })

  it('zuruecksetzen restores seed data and re-persists it', async () => {
    const { result } = await renderBereitesAppData()
    const urspruenglicheStunden = result.current.data.personen[0].stunden_pro_woche_fuer_begleitung
    act(() => {
      result.current.setPerson(result.current.data.personen[0].id, { stunden_pro_woche_fuer_begleitung: 42 })
    })
    await waitFor(() => expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(42))
    act(() => {
      result.current.zuruecksetzen()
    })
    expect(result.current.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
    await waitFor(() => {
      const [letzterAufruf] = updateMock.mock.calls.at(-1) as [{ data: Datenbestand }]
      expect(letzterAufruf.data.personen[0].stunden_pro_woche_fuer_begleitung).toBe(urspruenglicheStunden)
    })
  })

  describe('Veranstaltungen', () => {
    it('addVeranstaltung appends a new Veranstaltung with the given art and schulIds', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const neue = result.current.data.veranstaltungen.at(-1)!
      expect(neue.art).toBe('themenwoche')
      expect(neue.titel).toBe('Neue Themenwoche')
      expect(neue.terminstatus).toBe('offen')
      expect(neue.schulIds).toEqual(['wdg', 'sedanstrasse'])
      expect(neue.termine).toEqual([])
    })

    it('removeVeranstaltung deletes the matching Veranstaltung only', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('exkursion', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.removeVeranstaltung(id)
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)).toBeUndefined()
    })

    it('setVeranstaltungTitel updates only the matching Veranstaltung', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.setVeranstaltungTitel(id, 'Klimawoche')
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)!.titel).toBe('Klimawoche')
    })

    it('setVeranstaltungSchulen adds a fresh Besetzung for a newly added Schule on every existing Termin', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg', 'sedanstrasse'])
      })
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === id)!
      expect(veranstaltung.schulIds).toEqual(['wdg', 'sedanstrasse'])
      expect(veranstaltung.termine[0].besetzungen.map((b) => b.schulId)).toEqual(['wdg', 'sedanstrasse'])
    })

    it('setVeranstaltungSchulen preserves an existing Besetzung for a Schule that remains selected', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setSchulBesetzungFelder(id, terminId, 'wdg', { fahrzeit_h: 2 })
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg', 'sedanstrasse'])
      })
      const besetzung = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].besetzungen.find((b) => b.schulId === 'wdg')!
      expect(besetzung.fahrzeit_h).toBe(2)
    })

    it('setVeranstaltungSchulen removes the Besetzung of a deselected Schule', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.setVeranstaltungSchulen(id, ['wdg'])
      })
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === id)!
      expect(veranstaltung.termine[0].besetzungen.map((b) => b.schulId)).toEqual(['wdg'])
    })

    it('addVeranstaltungTermin appends a Termin with one empty Besetzung per current schulId', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const termin = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0]
      expect(termin.index).toBe(1)
      expect(termin.kontaktzeit_h).toBe(1.5)
      expect(termin.erstdurchfuehrung).toBe(true)
      expect(termin.besetzungen.map((b) => b.schulId)).toEqual(['wdg', 'sedanstrasse'])
      expect(termin.besetzungen.every((b) => b.wir_begleiten && b.begleitperson_ids.length === 0)).toBe(true)
    })

    it('removeVeranstaltungTermin deletes the matching Termin and renumbers the rest', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const ersterTerminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.removeVeranstaltungTermin(id, ersterTerminId)
      })
      const termine = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine
      expect(termine).toHaveLength(1)
      expect(termine[0].index).toBe(1)
    })

    it('setVeranstaltungTerminFelder patches only the matching Termin', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setVeranstaltungTerminFelder(id, terminId, { kontaktzeit_h: 3 })
      })
      expect(result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].kontaktzeit_h).toBe(3)
    })

    it('setSchulBesetzungFelder patches only the matching Schule-Besetzung on the matching Termin', async () => {
      const { result } = await renderBereitesAppData()
      act(() => {
        result.current.addVeranstaltung('themenwoche', ['wdg', 'sedanstrasse'])
      })
      const id = result.current.data.veranstaltungen.at(-1)!.id
      act(() => {
        result.current.addVeranstaltungTermin(id)
      })
      const terminId = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0].id
      act(() => {
        result.current.setSchulBesetzungFelder(id, terminId, 'sedanstrasse', { begleitperson_ids: ['p1'] })
      })
      const termin = result.current.data.veranstaltungen.find((v) => v.id === id)!.termine[0]
      expect(termin.besetzungen.find((b) => b.schulId === 'sedanstrasse')!.begleitperson_ids).toEqual(['p1'])
      expect(termin.besetzungen.find((b) => b.schulId === 'wdg')!.begleitperson_ids).toEqual([])
    })

    it('migrates a legacy typ: exkursion Einheit in imported JSON into its own Veranstaltung', async () => {
      const { result } = await renderBereitesAppData()
      const roh = {
        settings: {
          planungszeitraum: { start: '2026-09-01', ende: '2027-07-16' },
          schwellwert_warnung: 0.7,
          schwellwert_kritisch: 0.9,
          default_fahrzeit_h: 1,
          default_vorbereitungsfaktor_erstdurchfuehrung: 0.75,
          default_vorbereitungsfaktor_wiederholung: 0.25,
        },
        personen: [],
        kalender: { ferien: [] },
        schulen: [
          {
            id: 's1',
            name: 'Test',
            reihen: [
              {
                id: 'r1',
                titel: 'Kurs mit Exkursion',
                betreuungsmodell: 'A',
                fahrzeit_h: 1,
                status: 'zugesagt',
                extern_betreut: false,
                terminstatus: 'festgelegt',
                einheiten: [
                  { id: 'e1', index: 1, datum_oder_kw: '2026-10-05', kontaktzeit_h: 1.5, erstdurchfuehrung: true, wir_begleiten: true, typ: 'regulaer' },
                  { id: 'e2', index: 2, datum_oder_kw: '2026-10-12', kontaktzeit_h: 1.5, erstdurchfuehrung: false, wir_begleiten: true, typ: 'exkursion', organisationspauschale_h: 2 },
                ],
              },
            ],
          },
        ],
      }
      act(() => {
        result.current.importJson(JSON.stringify(roh))
      })
      const schule = result.current.data.schulen.find((s) => s.id === 's1')!
      expect(schule.reihen[0].einheiten).toHaveLength(1)
      expect(schule.reihen[0].einheiten[0].id).toBe('e1')
      const veranstaltung = result.current.data.veranstaltungen.find((v) => v.id === 'veranstaltung_e2')!
      expect(veranstaltung.art).toBe('exkursion')
      expect(veranstaltung.schulIds).toEqual(['s1'])
      expect(veranstaltung.termine[0].organisationspauschale_h).toBe(2)
      expect(veranstaltung.termine[0].besetzungen[0]).toMatchObject({ schulId: 's1', wir_begleiten: true, fahrzeit_h: 1 })
    })
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- useAppData`
Expected: FAIL — `ladePhase` is `undefined` on the current hook's return value (the current implementation doesn't have it yet), so the `waitFor(() => expect(...).toBe('bereit'))` calls time out.

- [ ] **Step 3: Rewrite the load/save layer in `useAppData.ts`**

Modify `src/state/useAppData.ts:1-2` (imports) — insert a new import line after the `seedData` import:

```ts
import { useEffect, useMemo, useState } from 'react'
import seedData from '../data/data.json'
import { supabase } from '../lib/supabaseClient'
import { berechneMachbarkeit, berechneWochenuebersicht } from '../lib/berechnung'
```

Modify `src/state/useAppData.ts:20-21` (constants) — add two new constants right after `STORAGE_KEY`:

```ts
const PFLICHTFELDER = ['settings', 'personen', 'kalender', 'schulen'] as const
const STORAGE_KEY = 'kapazitaetsrechner:data'
const DATENBESTAND_ROW_ID = 1

const LEERER_DATENBESTAND: Datenbestand = {
  settings: {
    planungszeitraum: { start: '', ende: '' },
    schwellwert_warnung: 0,
    schwellwert_kritisch: 0,
    default_fahrzeit_h: 0,
    default_vorbereitungsfaktor_erstdurchfuehrung: 0,
    default_vorbereitungsfaktor_wiederholung: 0,
  },
  personen: [],
  kalender: { ferien: [] },
  schulen: [],
  veranstaltungen: [],
}
```

Modify `src/state/useAppData.ts:128-138` — delete the `ladeGespeicherteDaten` function entirely (it's no longer used; `localStorage` is no longer read on load).

Modify `src/state/useAppData.ts:140-150` (the `useAppData` function's state/effect setup) — replace:

```ts
export function useAppData() {
  const [data, setData] = useState<Datenbestand>(() => ladeGespeicherteDaten() ?? migriereDatenbestand(seedData as Datenbestand))
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded, etc.) — degrade to non-persistent rather than crashing.
    }
  }, [data])
```

with:

```ts
export type LadePhase = 'laedt' | 'fehler' | 'bereit'

export function useAppData() {
  const [data, setData] = useState<Datenbestand>(LEERER_DATENBESTAND)
  const [ladePhase, setLadePhase] = useState<LadePhase>('laedt')
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      const { data: zeile, error } = await supabase
        .from('datenbestand')
        .select('data')
        .eq('id', DATENBESTAND_ROW_ID)
        .single()
      if (abgebrochen) return
      if (error || !zeile || !pruefePflichtfelder(zeile.data)) {
        setLadeFehler(error?.message ?? 'Datenbestand aus Supabase ist unvollständig oder beschädigt.')
        setLadePhase('fehler')
        return
      }
      setData(migriereDatenbestand(zeile.data))
      setLadePhase('bereit')
    }
    laden()
    return () => {
      abgebrochen = true
    }
  }, [])

  useEffect(() => {
    if (ladePhase !== 'bereit') return
    async function speichern() {
      const { error } = await supabase
        .from('datenbestand')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', DATENBESTAND_ROW_ID)
      if (error) return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch {
        // localStorage may be unavailable (private browsing, quota exceeded, etc.) — degrade to non-persistent rather than crashing.
      }
    }
    speichern()
  }, [data, ladePhase])
```

Modify `src/state/useAppData.ts:504-507` (`zuruecksetzen`) — replace:

```ts
  function zuruecksetzen() {
    localStorage.removeItem(STORAGE_KEY)
    setData(migriereDatenbestand(seedData as Datenbestand))
  }
```

with:

```ts
  function zuruecksetzen() {
    setData(migriereDatenbestand(seedData as Datenbestand))
  }
```

(the save effect above already re-persists the reset data to Supabase and the `localStorage` snapshot — no direct call needed here).

Modify `src/state/useAppData.ts:516-518` (start of the return object) — replace:

```ts
  return {
    data,
    themenGanttZeilen,
```

with:

```ts
  return {
    data,
    ladePhase,
    ladeFehler,
    themenGanttZeilen,
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- useAppData`
Expected: PASS (all tests, including the two new load-error tests, the two new save/Notanker tests, and the adjusted `zuruecksetzen` test).

- [ ] **Step 5: Commit**

```bash
git add src/state/useAppData.ts src/state/useAppData.test.ts
git commit -m "feat(berechnungstool): load and save Datenbestand through Supabase"
```

---

### Task 4: Gate the UI on load status

**Files:**
- Modify: `src/App.tsx` (full file)
- Modify: `src/App.test.tsx` (full file)

**Interfaces:**
- Consumes: `ladePhase`, `ladeFehler` from `useAppData()` (Task 3).

- [ ] **Step 1: Replace the test file**

Replace the full contents of `src/App.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import seedData from './data/data.json'

const { selectSingleMock, updateMock } = vi.hoisted(() => ({
  selectSingleMock: vi.fn(() => Promise.resolve({ data: { data: seedData }, error: null })),
  updateMock: vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) })),
}))

vi.mock('./lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: selectSingleMock }) }),
      update: updateMock,
    }),
  },
}))

import App from './App'

describe('App', () => {
  beforeEach(() => {
    selectSingleMock.mockClear()
    updateMock.mockClear()
  })

  it('renders the Ampel-Antwort and Wochen-Heatmap once the Datenbestand has loaded', async () => {
    render(<App />)
    expect(await screen.findByText(/MACHBAR|KRITISCH|NICHT MACHBAR/)).toBeInTheDocument()
  })

  it('shows a loading message before the Datenbestand has loaded', () => {
    render(<App />)
    expect(screen.getByText(/Lädt Datenbestand/i)).toBeInTheDocument()
  })

  it('shows an error message when loading the Datenbestand fails', async () => {
    selectSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'Netzwerkfehler' } })
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Netzwerkfehler')
  })

  it('adding and removing a Termin via the WDG ReihenEditor updates the rendered rows end-to-end', async () => {
    render(<App />)

    // Scope all queries to the WDG Reihe's own subtree, since every Reihe on the
    // page renders an identical "+ Termin hinzufügen" button and its own set of
    // "... löschen" delete buttons. ReihenEditor renders the Titel as
    // <input aria-label="Titel"> as the first child of the Reihe's single wrapping
    // <div>, so the input's nearest ancestor <div> is exactly that Reihe's container.
    const wdgUeberschrift = await screen.findByDisplayValue('Theorieblöcke Begabtenförderung')
    const wdgContainer = wdgUeberschrift.closest('div') as HTMLElement
    expect(wdgContainer).not.toBeNull()
    const wdg = within(wdgContainer)

    const zeilenVorher = wdg.getAllByRole('row').length
    const loeschButtonsVorher = wdg.getAllByRole('button', { name: /löschen/i })

    fireEvent.click(wdg.getByText('+ Termin hinzufügen'))

    expect(wdg.getAllByRole('row').length).toBe(zeilenVorher + 1)
    const loeschButtonsNachHinzufuegen = wdg.getAllByRole('button', { name: /löschen/i })
    expect(loeschButtonsNachHinzufuegen).toHaveLength(loeschButtonsVorher.length + 1)

    fireEvent.click(loeschButtonsNachHinzufuegen[0])

    expect(wdg.getAllByRole('row').length).toBe(zeilenVorher)
    expect(wdg.getAllByRole('button', { name: /löschen/i })).toHaveLength(loeschButtonsVorher.length)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- App.test`
Expected: FAIL — `App.tsx` doesn't yet render a loading message or an `alert` role, and rendering isn't gated on `ladePhase`.

- [ ] **Step 3: Update `App.tsx`**

Replace the full contents of `src/App.tsx`:

```tsx
import { useAppData } from './state/useAppData'
import { AmpelAntwort } from './components/AmpelAntwort'
import { WochenHeatmap } from './components/WochenHeatmap'
import { BedarfAngebotChart } from './components/BedarfAngebotChart'
import { SchulenAccordion } from './components/SchulenAccordion'
import { PersonenTabelle } from './components/PersonenTabelle'
import { PersonenKapazitaetsUebersicht } from './components/PersonenKapazitaetsUebersicht'
import { EngpassBericht } from './components/EngpassBericht'
import { ThemenUebersicht } from './components/ThemenUebersicht'
import { VeranstaltungenUebersicht } from './components/VeranstaltungenUebersicht'
import { PersonenUmverteilung } from './components/PersonenUmverteilung'
import { ExportImport } from './components/ExportImport'

export default function App() {
  const {
    data,
    ladePhase,
    ladeFehler,
    setPerson,
    addPerson,
    removePerson,
    setPersonUrlaub,
    setEinheitBegleitung,
    addEinheit,
    removeEinheit,
    setEinheitFelder,
    addReihe,
    removeReihe,
    setReiheTitel,
    setReiheTerminstatus,
    setReiheEinheiten,
    addVeranstaltung,
    removeVeranstaltung,
    setVeranstaltungTitel,
    setVeranstaltungTerminstatus,
    setVeranstaltungSchulen,
    addVeranstaltungTermin,
    removeVeranstaltungTermin,
    setVeranstaltungTerminFelder,
    setSchulBesetzungFelder,
    addPersonenUmverteilung,
    removePersonenUmverteilung,
    ergebnis,
    themenGanttZeilen,
    personenKapazitaet,
    exportJson,
    importJson,
    importError,
    zuruecksetzen,
  } = useAppData()

  return (
    <main style={{ maxWidth: '75rem', margin: '0 auto', padding: '1rem' }}>
      <h1>Kapazitätsrechner Schulbegleitung</h1>
      {ladePhase === 'laedt' && <p>Lädt Datenbestand…</p>}
      {ladePhase === 'fehler' && (
        <p role="alert" style={{ color: 'crimson' }}>
          Datenbestand konnte nicht geladen werden: {ladeFehler}
        </p>
      )}
      {ladePhase === 'bereit' && (
        <>
          <div className="card">
            <PersonenTabelle
              personen={data.personen}
              onChange={setPerson}
              onAdd={addPerson}
              onRemove={removePerson}
              onUrlaubChange={setPersonUrlaub}
            />
          </div>
          <div className="card">
            <PersonenKapazitaetsUebersicht personenKapazitaet={personenKapazitaet} />
          </div>
          <div className="card">
            <AmpelAntwort machbarkeit={ergebnis.machbarkeit} />
          </div>
          <div className="card">
            <WochenHeatmap wochen={ergebnis.wochen} />
          </div>
          <div className="card">
            <BedarfAngebotChart wochen={ergebnis.wochen} />
          </div>
          <div className="card">
            <EngpassBericht topEngpaesse={ergebnis.machbarkeit.topEngpaesse} />
          </div>
          <div className="card">
            <ThemenUebersicht zeilen={themenGanttZeilen} wochen={ergebnis.wochen} />
          </div>
          <h2>Schulen</h2>
          <SchulenAccordion
            schulen={data.schulen}
            settings={data.settings}
            personen={data.personen}
            onEinheitToggle={setEinheitBegleitung}
            onEinheitAdd={addEinheit}
            onEinheitRemove={removeEinheit}
            onEinheitFelderChange={setEinheitFelder}
            onTerminstatusChange={setReiheTerminstatus}
            onEinheitenReplace={setReiheEinheiten}
            onReiheAdd={addReihe}
            onReiheRemove={removeReihe}
            onReiheTitelChange={setReiheTitel}
            onVeranstaltungAdd={addVeranstaltung}
            ferien={data.kalender.ferien}
          />
          <div className="card">
            <VeranstaltungenUebersicht
              veranstaltungen={data.veranstaltungen}
              schulen={data.schulen}
              personen={data.personen}
              onAdd={addVeranstaltung}
              onRemove={removeVeranstaltung}
              onTitelChange={setVeranstaltungTitel}
              onTerminstatusChange={setVeranstaltungTerminstatus}
              onSchulenChange={setVeranstaltungSchulen}
              onTerminAdd={addVeranstaltungTermin}
              onTerminRemove={removeVeranstaltungTermin}
              onTerminFelderChange={setVeranstaltungTerminFelder}
              onBesetzungFelderChange={setSchulBesetzungFelder}
            />
          </div>
          <div className="card">
            <PersonenUmverteilung
              personen={data.personen}
              personenKapazitaet={personenKapazitaet}
              personenUmverteilungen={data.personenUmverteilungen ?? []}
              onAdd={addPersonenUmverteilung}
              onRemove={removePersonenUmverteilung}
            />
          </div>
          <div className="card">
            <ExportImport exportJson={exportJson} importJson={importJson} importError={importError} zuruecksetzen={zuruecksetzen} />
          </div>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- App.test`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions in other component tests, which don't touch `useAppData`)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(berechnungstool): gate rendering on Datenbestand load status"
```

---

### Task 5: Confirm before resetting the shared Datenbestand

**Files:**
- Modify: `src/components/ExportImport.tsx`
- Create: `src/components/ExportImport.test.tsx`

**Interfaces:**
- Consumes: `zuruecksetzen: () => void` prop (unchanged signature, from Task 3).

- [ ] **Step 1: Write the failing test**

Create `src/components/ExportImport.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ExportImport } from './ExportImport'

describe('ExportImport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls zuruecksetzen when the reset is confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const zuruecksetzen = vi.fn()
    render(<ExportImport exportJson={() => '{}'} importJson={() => {}} importError={null} zuruecksetzen={zuruecksetzen} />)
    fireEvent.click(screen.getByText('Zurücksetzen auf Ausgangsdaten'))
    expect(zuruecksetzen).toHaveBeenCalledTimes(1)
  })

  it('does not call zuruecksetzen when the reset is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const zuruecksetzen = vi.fn()
    render(<ExportImport exportJson={() => '{}'} importJson={() => {}} importError={null} zuruecksetzen={zuruecksetzen} />)
    fireEvent.click(screen.getByText('Zurücksetzen auf Ausgangsdaten'))
    expect(zuruecksetzen).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm test -- ExportImport`
Expected: FAIL — clicking the button currently calls `zuruecksetzen` unconditionally, so the "cancelled" test fails (`window.confirm` is never called, and even mocked to return `false`, `zuruecksetzen` still fires today).

- [ ] **Step 3: Add the confirm gate**

Replace the full contents of `src/components/ExportImport.tsx`:

```tsx
export function ExportImport({
  exportJson,
  importJson,
  importError,
  zuruecksetzen,
}: {
  exportJson: () => string
  importJson: (json: string) => void
  importError: string | null
  zuruecksetzen: () => void
}) {
  function herunterladen() {
    const blob = new Blob([exportJson()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kapazitaetsrechner-daten.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function hochladen(event: React.ChangeEvent<HTMLInputElement>) {
    const datei = event.target.files?.[0]
    if (!datei) return
    const reader = new FileReader()
    reader.onload = () => importJson(reader.result as string)
    reader.readAsText(datei)
  }

  function aufZuruecksetzenKlicken() {
    if (window.confirm('Datenbestand für alle im Team auf die Ausgangsdaten zurücksetzen? Nicht exportierte Änderungen gehen verloren.')) {
      zuruecksetzen()
    }
  }

  return (
    <div>
      <button onClick={herunterladen}>Als JSON exportieren</button>
      <input type="file" accept="application/json" onChange={hochladen} />
      <button onClick={aufZuruecksetzenKlicken}>Zurücksetzen auf Ausgangsdaten</button>
      {importError && <p role="alert" style={{ color: 'crimson' }}>{importError}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm test -- ExportImport`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ExportImport.tsx src/components/ExportImport.test.tsx
git commit -m "feat(berechnungstool): confirm before resetting the shared Datenbestand"
```

---

### Task 6: Replace the GitHub Pages deploy workflow with a test-only CI workflow

**Files:**
- Delete: `.github/workflows/deploy.yml`
- Create: `.github/workflows/ci.yml`

**Interfaces:** none (CI config only).

- [ ] **Step 1: Delete the old deploy workflow**

```bash
git rm .github/workflows/deploy.yml
```

- [ ] **Step 2: Add a test-only CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

- [ ] **Step 3: Verify the workflow YAML is well-formed**

Run: `python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" 2>/dev/null || node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')"`
Expected: no error (if `python3`/`pyyaml` isn't available, the fallback `node` command at least confirms the file is readable; visually confirm the YAML matches the structure above — 2-space indentation, no tabs).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "chore(berechnungstool): replace GitHub Pages deploy workflow with test-only CI"
```

---

### Task 7: Document the Supabase + Vercel setup

**Files:**
- Modify: `README.md` (full file)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Rewrite the README**

Replace the full contents of `README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(berechnungstool): document Supabase and Vercel setup"
```
