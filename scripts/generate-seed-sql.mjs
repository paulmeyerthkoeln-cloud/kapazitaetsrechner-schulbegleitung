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
