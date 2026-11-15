-- 051: Players and their orders on a play-area table
--
-- A group sharing one station (say six people at the snooker table) often
-- orders food and drink through the game, each their own: one tea, one
-- cigarettes, another a 500ml water. Staff tag each player under the
-- running session and add their order as it's taken. When the game ends,
-- everything comes into one bill together as one payment -- but the bill
-- stays itemised by player (see useBilling.js / BillingParts.js), so it's
-- clear who had what. The table's own time charge (see migration 047)
-- stays its own separate line, not split between players.
--
-- Run in the Supabase SQL editor after 001-050. Safe to run more than once.

-- ---------- tables ----------
create table if not exists game_session_players (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  session_id uuid not null references game_sessions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  phone text check (phone is null or char_length(phone) <= 20),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists game_session_players_shop_idx on game_session_players (shop_id);
create index if not exists game_session_players_session_idx on game_session_players (session_id);

create table if not exists game_session_orders (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  session_id uuid not null references game_sessions(id) on delete cascade,
  player_id uuid references game_session_players(id) on delete cascade, -- null = shared, not one player's own
  shop_product_id uuid not null references shop_products(id) on delete cascade,
  name text not null,            -- snapshot of the item's name at order time, same reasoning as bills.items
  price numeric(10,2) not null check (price >= 0),  -- snapshot of shop_products.price at order time
  gst numeric(5,2) not null default 0,
  qty numeric(10,3) not null check (qty > 0),
  bill_id uuid references bills(id) on delete set null,  -- set once this order is added to a bill
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists game_session_orders_shop_idx on game_session_orders (shop_id);
create index if not exists game_session_orders_session_idx on game_session_orders (session_id);
create index if not exists game_session_orders_player_idx on game_session_orders (player_id);

-- A player must belong to the same shop as their session.
create or replace function check_game_session_player_shop()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from game_sessions where id = new.session_id and shop_id = new.shop_id) then
    raise exception 'Session is not in this shop';
  end if;
  return new;
end $$;
drop trigger if exists game_session_players_same_shop on game_session_players;
create trigger game_session_players_same_shop before insert or update on game_session_players
  for each row execute function check_game_session_player_shop();

-- An order must belong to the same shop as its session, and (if tagged to a
-- player) that player must be in the same session.
create or replace function check_game_session_order_shop()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from game_sessions where id = new.session_id and shop_id = new.shop_id) then
    raise exception 'Session is not in this shop';
  end if;
  if new.player_id is not null and not exists (select 1 from game_session_players where id = new.player_id and session_id = new.session_id) then
    raise exception 'Player is not in this session';
  end if;
  return new;
end $$;
drop trigger if exists game_session_orders_same_shop on game_session_orders;
create trigger game_session_orders_same_shop before insert or update on game_session_orders
  for each row execute function check_game_session_order_shop();

-- ---------- row-level security ----------
-- Same gate as game_stations/game_sessions (migration 047): the 'play_area'
-- permission, so a staff member who only does billing cannot add players or
-- orders. Unlike game_sessions, there's no start/stop race here, so plain
-- insert/update/delete policies are enough -- no security-definer functions
-- needed for the CRUD itself.
alter table game_session_players enable row level security;
alter table game_session_orders enable row level security;

drop policy if exists "Play area members view players" on game_session_players;
create policy "Play area members view players" on game_session_players for select
  using (has_shop_permission(shop_id, 'play_area'));
drop policy if exists "Play area members add players" on game_session_players;
create policy "Play area members add players" on game_session_players for insert
  with check (has_shop_permission(shop_id, 'play_area'));
drop policy if exists "Play area members edit players" on game_session_players;
create policy "Play area members edit players" on game_session_players for update
  using (has_shop_permission(shop_id, 'play_area')) with check (has_shop_permission(shop_id, 'play_area'));
drop policy if exists "Play area members remove players" on game_session_players;
create policy "Play area members remove players" on game_session_players for delete
  using (has_shop_permission(shop_id, 'play_area'));

drop policy if exists "Play area members view orders" on game_session_orders;
create policy "Play area members view orders" on game_session_orders for select
  using (has_shop_permission(shop_id, 'play_area'));
drop policy if exists "Play area members add orders" on game_session_orders;
create policy "Play area members add orders" on game_session_orders for insert
  with check (has_shop_permission(shop_id, 'play_area'));
-- An order already on a bill is history: it can't be edited or removed any more.
drop policy if exists "Play area members remove unbilled orders" on game_session_orders;
create policy "Play area members remove unbilled orders" on game_session_orders for delete
  using (has_shop_permission(shop_id, 'play_area') and bill_id is null);

-- A closed shop is read-only everywhere, these two tables included (migration 037).
drop trigger if exists game_session_players_closed_guard on game_session_players;
create trigger game_session_players_closed_guard before insert or update or delete on game_session_players
  for each row execute function block_closed_shop_writes();
drop trigger if exists game_session_orders_closed_guard on game_session_orders;
create trigger game_session_orders_closed_guard before insert or update or delete on game_session_orders
  for each row execute function block_closed_shop_writes();

-- ---------- billing ----------
-- Every not-yet-billed order for one session, with its player's name (null
-- for a shared/unassigned order) -- what the New bill screen pulls into the
-- cart when a table's tab is brought into a bill. Not security definer: the
-- select policy above already limits this to a member with 'play_area'.
create or replace function unbilled_game_orders(p_shop uuid, p_session uuid)
returns table (id uuid, player_id uuid, player_name text, shop_product_id uuid, name text, price numeric, gst numeric, qty numeric, session_id uuid)
language sql
stable
set search_path = public
as $$
  select o.id, o.player_id, p.name, o.shop_product_id, o.name, o.price, o.gst, o.qty, o.session_id
  from game_session_orders o left join game_session_players p on p.id = o.player_id
  where o.shop_id = p_shop and o.session_id = p_session and o.bill_id is null
  order by o.created_at;
$$;
revoke all on function unbilled_game_orders(uuid, uuid) from public, anon;
grant execute on function unbilled_game_orders(uuid, uuid) to authenticated, service_role;

-- Marks every not-yet-billed order of one session as billed, in one call --
-- mirroring attach_game_session_to_bill (migration 047) for the table-time
-- line itself. All or nothing: a session with no unbilled orders is simply
-- a no-op, not an error (a table might be billed for its time only).
create or replace function attach_game_orders_to_bill(p_session uuid, p_bill uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_bill_shop uuid;
begin
  select shop_id into v_shop from game_sessions where id = p_session;
  if v_shop is null then raise exception 'Session not found'; end if;
  if not has_shop_permission(v_shop, 'play_area') then raise exception 'Not allowed'; end if;
  select shop_id into v_bill_shop from bills where id = p_bill;
  if v_bill_shop is null or v_bill_shop <> v_shop then raise exception 'Bill is not in this shop'; end if;
  update game_session_orders set bill_id = p_bill where session_id = p_session and bill_id is null;
end;
$$;
revoke all on function attach_game_orders_to_bill(uuid, uuid) from public, anon;
grant execute on function attach_game_orders_to_bill(uuid, uuid) to authenticated, service_role;

select record_migration('051', '051_game_session_players.sql');
