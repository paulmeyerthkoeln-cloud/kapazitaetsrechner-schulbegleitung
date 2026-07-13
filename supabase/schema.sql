create table if not exists datenbestand (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);

alter table datenbestand enable row level security;

create policy "anon read/write" on datenbestand
  for all using (true) with check (true);
