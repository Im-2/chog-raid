-- Chog Raid: every migration in order (0001 -> 0003), plus a final security block.
-- Safe to run more than once. Generated from supabase/migrations/*.sql; keep them in sync.
-- Access model: only the Next.js server talks to the database, using the service role key
-- (which bypasses RLS). RLS is on for every table with NO policies, so the public anon and
-- authenticated roles can read or write nothing.

-- ===== 0001_raids.sql =====
-- Chog Raid: raids and defenses.
-- All access goes through the Next.js server with the service role key; RLS blocks direct client access.

create table if not exists raids (
  id uuid primary key,
  token_id integer not null,
  raider text not null,
  practice boolean not null default false,
  defender text,                   -- defense owner at raid start; null for practice
  traps jsonb not null,            -- trap snapshot at raid start (replays stay exact after edits)
  moves text not null default '',  -- e.g. 'RRUDL'; this is the replay
  move_count integer not null default 0,
  status text not null check (status in ('active', 'abandoned', 'breach', 'dead', 'exhausted')),
  hp integer not null,
  moves_left integer not null,
  end_x integer not null,
  end_y integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raids_room_idx on raids (token_id, created_at desc);
create index if not exists raids_raider_idx on raids (raider, created_at desc);

create table if not exists defenses (
  token_id integer primary key,
  owner text not null,
  traps jsonb not null,
  updated_at timestamptz not null default now()
);

alter table raids enable row level security;
alter table defenses enable row level security;

-- ===== 0002_retention.sql =====
-- Retention: per-raid scoring context, and small key-value state (alert read markers, used $CHOG payment hashes).
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

-- ===== 0003_outcome_names.sql =====
-- Raid outcomes renamed: dead -> defeated, exhausted -> out_of_moves.
alter table raids drop constraint if exists raids_status_check;
update raids set status = 'defeated' where status = 'dead';
update raids set status = 'out_of_moves' where status = 'exhausted';
alter table raids add constraint raids_status_check
  check (status in ('active', 'abandoned', 'breach', 'defeated', 'out_of_moves'));

-- ===== security: RLS on, no policies, no grants to public roles =====
alter table public.raids enable row level security;
alter table public.defenses enable row level security;
alter table public.kv enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('raids', 'defenses', 'kv')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

revoke all on table public.raids, public.defenses, public.kv from anon, authenticated;