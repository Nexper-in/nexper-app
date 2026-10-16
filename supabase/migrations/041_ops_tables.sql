-- 041: shared rate limits and our own error log
--
-- rate_limit_hits: one counter per (key, time window) in the database, so a limit holds across
-- every server instance (the old in-memory limiter reset on each cold start).
-- client_errors: errors reported by the app in people's browsers, kept in OUR database (not a
-- third-party tracker), 30 days. See docs/MULTITENANT_DESIGN.md sections 3.7 and 3.10 (task T13).

-- ---------- rate limits ----------
-- Unlogged: fast, and losing a minute of counters in a crash does no harm.
create unlogged table if not exists rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
alter table rate_limit_hits enable row level security;

-- Counts one hit in the current window and says whether the limit is now exceeded.
-- Fixed windows of p_window_seconds. Service role only (the API routes).
create or replace function rate_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then raise exception 'Bad window'; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_limit_hits (key, window_start, count) values (left(p_key, 200), v_start, 1)
  on conflict (key, window_start) do update set count = rate_limit_hits.count + 1
  returning count into v_count;
  return v_count > p_max;
end $$;

-- ---------- error log ----------
create table if not exists client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  shop_id uuid references shops(id) on delete cascade,
  user_id uuid,
  route text,
  message text not null,
  stack text,
  app_version text,
  user_agent text
);
create index if not exists client_errors_shop_idx on client_errors (shop_id, at desc);
create index if not exists client_errors_at_idx on client_errors (at desc);
alter table client_errors enable row level security;
-- No policies: written and read only by the server (service role).

-- ---------- housekeeping (daily job, service role) ----------
create or replace function purge_ops()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  c integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  delete from rate_limit_hits where window_start < now() - interval '1 day';
  get diagnostics c = row_count; n := n + c;
  delete from client_errors where at < now() - interval '30 days';
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;

revoke all on function rate_hit(text, integer, integer), purge_ops() from public, anon, authenticated;
grant execute on function rate_hit(text, integer, integer), purge_ops() to service_role;

select record_migration('041', '041_ops_tables.sql');
