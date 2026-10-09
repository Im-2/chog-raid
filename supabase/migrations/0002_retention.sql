-- Retention: per-raid scoring context, and small key-value state (alert read markers, simulated $CHOG ledger).
alter table raids add column if not exists par integer;         -- shortest safe path at raid start
alter table raids add column if not exists difficulty integer;  -- room difficulty 1-5 at raid start
create index if not exists raids_finished_idx on raids (status, created_at desc);
create index if not exists raids_defender_idx on raids (defender, created_at desc);

create table if not exists kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table kv enable row level security;
