-- Familje-Mello: durable game state.
--
-- Applied 2026-11-20 to the shared Supabase project (bhurxoknmyfqymtiaycx) as
-- migration "mello_games". Safe to re-run.
--
-- Live sync (joining, names, votes, reveals) runs over Realtime broadcast and needs
-- no database. This table only makes a game survive a reload or a crash: the host
-- writes a JSON snapshot of the whole game here, keyed by the 5-letter game code.
--
-- The browser never touches the table directly. It can only load one game whose
-- code it already knows, or save one, through the two functions below. So nobody
-- can list games (or the nicknames in them) with the public key.

create table if not exists public.mello_games (
  id         text primary key check (id ~ '^[A-HJ-NP-Z2-9]{5}$'),
  snapshot   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mello_games enable row level security;
-- No policies on purpose: anon/authenticated get no direct access.
revoke all on public.mello_games from anon, authenticated;

create or replace function public.mello_load_game(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select snapshot from public.mello_games where id = upper(p_id);
$$;

create or replace function public.mello_save_game(p_id text, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null or upper(p_id) !~ '^[A-HJ-NP-Z2-9]{5}$' then
    raise exception 'bad game id';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'bad snapshot';
  end if;
  if octet_length(p_snapshot::text) > 400000 then
    raise exception 'snapshot too large';
  end if;

  insert into public.mello_games (id, snapshot, updated_at)
  values (upper(p_id), p_snapshot, now())
  on conflict (id) do update set snapshot = excluded.snapshot, updated_at = now();

  -- Housekeeping now and then: forget games nobody has touched for half a year.
  if random() < 0.02 then
    delete from public.mello_games where updated_at < now() - interval '180 days';
  end if;
end;
$$;

revoke all on function public.mello_load_game(text) from public;
revoke all on function public.mello_save_game(text, jsonb) from public;
grant execute on function public.mello_load_game(text) to anon, authenticated;
grant execute on function public.mello_save_game(text, jsonb) to anon, authenticated;
