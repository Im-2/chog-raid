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
