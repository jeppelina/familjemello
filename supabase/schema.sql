-- Familje-Mello — durable game state (run once in the Supabase SQL Editor).
--
-- Live sync (joining, names, votes, ballots) runs over Realtime broadcast and needs
-- no database. This table only adds durability so an aborted game can be resumed:
-- the host writes a JSON snapshot of the whole game here, keyed by the game code.
--
-- No auth: this is a family party app. Anyone who knows a game's (random) code can
-- read/write that game. There is no personal data here — only song titles, chosen
-- nicknames, and star votes.

create table if not exists public.games (
  id         text primary key,
  snapshot   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

-- Permissive policies for the anon (browser) key. Recreate cleanly if re-run.
drop policy if exists games_anon_select on public.games;
drop policy if exists games_anon_insert on public.games;
drop policy if exists games_anon_update on public.games;

create policy games_anon_select on public.games for select to anon using (true);
create policy games_anon_insert on public.games for insert to anon with check (true);
create policy games_anon_update on public.games for update to anon using (true) with check (true);

-- Optional housekeeping: drop games no one has touched in 30 days.
-- (Run manually whenever you like; not scheduled.)
-- delete from public.games where updated_at < now() - interval '30 days';
