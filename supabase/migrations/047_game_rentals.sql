-- 047: Play area (indoor games billed by the hour)
--
-- A tea shop / canteen that rents out a carom board, a chess set, a snooker
-- table or a game console by the hour. Each shop defines its own "stations",
-- each with its own hourly rate -- so two carom tables can be priced
-- differently, and a shop that doesn't care just gives every station of a
-- type the same number. Staff press Start when a customer begins and Stop
-- when they finish; the amount is computed from elapsed time (rounded up to
-- the minute) and, once stopped, can be added as a line on the customer's
-- bill like any other item -- see the change to _deduct_stock below, which
-- is what makes a bill line with no stock behind it possible.
--
-- Run in the Supabase SQL editor after 001-046. Safe to run more than once.

-- ---------- tables ----------
create table if not exists game_stations (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('carom', 'snooker', 'chess', 'video_game', 'other')),
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0 and hourly_rate <= 100000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists game_stations_shop_name_idx on game_stations (shop_id, lower(name));
create index if not exists game_stations_shop_idx on game_stations (shop_id);

create table if not exists game_sessions (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  station_id uuid not null references game_stations(id) on delete cascade,
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  rate_at_start numeric(10,2) not null,   -- the station's rate when play began: a later price change never rewrites a running or past session
  amount numeric(10,2),                   -- set when stopped
  bill_id uuid references bills(id) on delete set null,  -- set once this session is added to a bill
  started_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists game_sessions_shop_idx on game_sessions (shop_id, started_at desc);
create index if not exists game_sessions_station_idx on game_sessions (station_id);
-- A station can only have one session running at a time.
create unique index if not exists game_sessions_one_running_idx on game_sessions (station_id) where stopped_at is null;

-- A session must belong to the same shop as its station.
create or replace function check_game_session_shop()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from game_stations where id = new.station_id and shop_id = new.shop_id) then
    raise exception 'Station is not in this shop';
  end if;
  return new;
end $$;
drop trigger if exists game_sessions_same_shop on game_sessions;
create trigger game_sessions_same_shop before insert or update on game_sessions
  for each row execute function check_game_session_shop();

-- ---------- row-level security ----------
-- Everything here needs the 'play_area' permission (owners always have it),
-- so a staff member who only does billing cannot start, stop or re-rate a
-- station.
alter table game_stations enable row level security;
alter table game_sessions enable row level security;

drop policy if exists "Play area members view stations" on game_stations;
create policy "Play area members view stations" on game_stations for select
  using (has_shop_permission(shop_id, 'play_area'));
drop policy if exists "Play area members add stations" on game_stations;
create policy "Play area members add stations" on game_stations for insert
  with check (has_shop_permission(shop_id, 'play_area'));
drop policy if exists "Play area members edit stations" on game_stations;
create policy "Play area members edit stations" on game_stations for update
  using (has_shop_permission(shop_id, 'play_area')) with check (has_shop_permission(shop_id, 'play_area'));
-- No delete policy on purpose, same reasoning as supply_points: a station
-- with history is switched off (active = false), never removed, so past
-- sessions stay correct.

drop policy if exists "Play area members view sessions" on game_sessions;
create policy "Play area members view sessions" on game_sessions for select
  using (has_shop_permission(shop_id, 'play_area'));
-- No insert/update/delete policy: sessions are written only through the two
-- functions below, which set rate_at_start and amount correctly and stop two
-- people racing to start the same station.

-- A closed shop is read-only everywhere, these two tables included (migration 037).
drop trigger if exists game_stations_closed_guard on game_stations;
create trigger game_stations_closed_guard before insert or update or delete on game_stations
  for each row execute function block_closed_shop_writes();
drop trigger if exists game_sessions_closed_guard on game_sessions;
create trigger game_sessions_closed_guard before insert or update or delete on game_sessions
  for each row execute function block_closed_shop_writes();

-- ---------- start / stop ----------
create or replace function start_game_session(p_station uuid)
returns game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_rate numeric;
  v_row game_sessions;
begin
  select shop_id, hourly_rate into v_shop, v_rate from game_stations where id = p_station and active;
  if v_shop is null then raise exception 'Station not found'; end if;
  if not has_shop_permission(v_shop, 'play_area') then raise exception 'Not allowed'; end if;

  begin
    insert into game_sessions (shop_id, station_id, rate_at_start)
    values (v_shop, p_station, v_rate)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This station is already running';
  end;
  return v_row;
end;
$$;
revoke all on function start_game_session(uuid) from public, anon;
grant execute on function start_game_session(uuid) to authenticated, service_role;

-- Elapsed time is rounded up to the minute (a 90-second game is billed as
-- 2 minutes), so the shop is never short-changed for a part-minute.
create or replace function stop_game_session(p_session uuid)
returns game_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row game_sessions;
  v_minutes numeric;
begin
  select * into v_row from game_sessions where id = p_session for update;
  if v_row is null then raise exception 'Session not found'; end if;
  if not has_shop_permission(v_row.shop_id, 'play_area') then raise exception 'Not allowed'; end if;
  if v_row.stopped_at is not null then return v_row; end if; -- already stopped: calling twice is harmless

  v_minutes := greatest(1, ceil(extract(epoch from (now() - v_row.started_at)) / 60));
  update game_sessions
    set stopped_at = now(),
        amount = round(v_minutes * v_row.rate_at_start / 60, 2)
    where id = p_session
    returning * into v_row;
  return v_row;
end;
$$;
revoke all on function stop_game_session(uuid) from public, anon;
grant execute on function stop_game_session(uuid) to authenticated, service_role;

-- A finished, not-yet-billed session becomes a line on the customer's bill
-- (see useBilling / BillingParts for the client side). Once the bill is
-- saved this marks the session as settled so it can't be billed twice.
create or replace function attach_game_session_to_bill(p_session uuid, p_bill uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_bill_shop uuid;
begin
  select shop_id into v_shop from game_sessions where id = p_session and stopped_at is not null and bill_id is null;
  if v_shop is null then raise exception 'Session not found or already billed'; end if;
  if not has_shop_permission(v_shop, 'play_area') then raise exception 'Not allowed'; end if;
  select shop_id into v_bill_shop from bills where id = p_bill;
  if v_bill_shop is null or v_bill_shop <> v_shop then raise exception 'Bill is not in this shop'; end if;
  update game_sessions set bill_id = p_bill where id = p_session;
end;
$$;
revoke all on function attach_game_session_to_bill(uuid, uuid) from public, anon;
grant execute on function attach_game_session_to_bill(uuid, uuid) to authenticated, service_role;

-- Finished sessions waiting to be put on a bill. Not security definer: the
-- select policy above already limits this to a member with 'play_area'.
create or replace function unbilled_game_sessions(p_shop uuid)
returns table (id uuid, station_name text, type text, started_at timestamptz, stopped_at timestamptz, amount numeric)
language sql
stable
set search_path = public
as $$
  select s.id, st.name, st.type, s.started_at, s.stopped_at, s.amount
  from game_sessions s join game_stations st on st.id = s.station_id
  where s.shop_id = p_shop and s.stopped_at is not null and s.bill_id is null
  order by s.stopped_at desc;
$$;
revoke all on function unbilled_game_sessions(uuid) from public, anon;
grant execute on function unbilled_game_sessions(uuid) to authenticated, service_role;

-- ---------- let a bill carry a line with no stock behind it ----------
-- A finished game session has no shop_product_id: there's no stock to
-- deduct or movement to log for an hour of carom, so such a line is skipped
-- here instead of raising "item not found". Every stock-backed line still
-- goes through exactly the same checks as before (migration 042).
create or replace function _deduct_stock(p_shop_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
  current_stock numeric;
  requested_qty numeric;
  item_name text;
begin
  for line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(line->>'shop_product_id', '') = '' then
      continue;
    end if;

    requested_qty := (line->>'qty')::numeric;

    select stock into current_stock from shop_products
      where id = (line->>'shop_product_id')::uuid and shop_id = p_shop_id
      for update; -- row lock: two simultaneous bills can't both oversell

    if current_stock is null then
      raise exception 'item % not found in this shop', line->>'shop_product_id';
    end if;

    item_name := coalesce(line->>'name', 'this item');
    if current_stock < requested_qty then
      raise exception 'Only % of % left in stock — bill not saved', current_stock, item_name;
    end if;

    update shop_products
      set stock = current_stock - requested_qty
      where id = (line->>'shop_product_id')::uuid;

    insert into movements (shop_id, shop_product_id, item_name, type, qty, reason)
      values (p_shop_id, (line->>'shop_product_id')::uuid, line->>'name', 'out', requested_qty, 'sale');
  end loop;
end;
$$;
revoke all on function _deduct_stock(uuid, jsonb) from public, anon, authenticated;

select record_migration('047', '047_game_rentals.sql');
