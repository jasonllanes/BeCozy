-- BeCozy: global leaderboard
-- Safe to run on an existing project: everything is prefixed `becozy_` and idempotent.
-- Run in: Supabase Dashboard → SQL Editor → New query → paste → Run.

create table if not exists public.becozy_scores (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- which game / ruleset the score belongs to (boards are separated by these)
  game_id     text not null check (char_length(game_id) between 1 and 40),
  mode        text not null check (char_length(mode) between 1 and 20),         -- classic | survival
  difficulty  text not null check (char_length(difficulty) between 1 and 20),   -- chill | normal | spicy
  duration_s  integer check (duration_s between 5 and 600),                      -- classic round length; null for survival

  -- the result
  player_name text not null check (char_length(btrim(player_name)) between 1 and 16),
  score       integer not null check (score between 0 and 100000),
  survived_s  integer check (survived_s between 0 and 86400),
  sliced      integer not null default 0 check (sliced between 0 and 100000),

  -- context
  gesture     text check (char_length(gesture) <= 20),                           -- point | fist | nose | custom
  players     smallint not null default 1 check (players between 1 and 4),
  stats       jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 2048)
);

comment on table public.becozy_scores is 'BeCozy game results shown on the public leaderboard.';

-- fast "top N for this board" lookups
create index if not exists becozy_scores_board_idx
  on public.becozy_scores (game_id, mode, difficulty, duration_s, score desc, created_at);

-- Row Level Security: anyone may read and post a score; nobody can edit or delete from the client.
alter table public.becozy_scores enable row level security;

drop policy if exists "becozy_scores_read" on public.becozy_scores;
create policy "becozy_scores_read"
  on public.becozy_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists "becozy_scores_insert" on public.becozy_scores;
create policy "becozy_scores_insert"
  on public.becozy_scores
  for insert
  to anon, authenticated
  with check (true);  -- shape and limits are enforced by the column CHECK constraints above

-- least privilege for the API roles
revoke all on public.becozy_scores from anon, authenticated;
grant select, insert on public.becozy_scores to anon, authenticated;
