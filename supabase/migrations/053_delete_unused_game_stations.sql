-- 053: let an owner delete a play-area station that was never actually used
--
-- Migration 047 deliberately gave game_stations no delete policy: a station
-- with history is hidden (active = false) instead, never removed, so a
-- stopped session's station name stays correct everywhere it's read --
-- including the "ready to bill" list on New bill's Play area tab, which
-- isn't filtered by active at all (unbilled_game_sessions joins every
-- station regardless). Removing a station that already has a session,
-- billed or not, would either orphan that unbilled charge or -- since
-- game_sessions.station_id is "on delete cascade" -- silently wipe it out.
--
-- But a station added by mistake (wrong name, duplicate, a type never
-- actually offered) and never once started has no history to protect, and
-- "Hide this station" just leaves it as permanent clutter with nothing
-- gained. delete_station lets exactly that case be removed outright, and
-- still refuses -- with a clear reason -- the moment the station has ever
-- had a single session.

create or replace function delete_station(p_station uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
begin
  select shop_id into v_shop from game_stations where id = p_station;
  if v_shop is null then raise exception 'Station not found'; end if;
  if not has_shop_permission(v_shop, 'play_area') then raise exception 'Not allowed'; end if;
  if exists (select 1 from game_sessions where station_id = p_station) then
    raise exception 'This station has been used before -- hide it instead so past games still show correctly.';
  end if;
  delete from game_stations where id = p_station;
end;
$$;
revoke all on function delete_station(uuid) from public, anon;
grant execute on function delete_station(uuid) to authenticated, service_role;

-- A deleted station is kept for 30 days, restorable the same way as any
-- other trashed row (migration 044) -- harmless here since delete_station
-- only ever removes a station with zero sessions, so there's nothing for a
-- restore to conflict with.
drop trigger if exists game_stations_keep_deleted on game_stations;
create trigger game_stations_keep_deleted after delete on game_stations
  for each row execute function keep_deleted_row();

create or replace function _restore_trash_row(p_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  d deleted_rows%rowtype;
begin
  select * into d from deleted_rows where id = p_id;
  if not found then raise exception 'That deleted record is no longer kept (30 days).'; end if;
  if d.table_name <> all (array['shop_products', 'products', 'suppliers', 'shop_suppliers', 'fixed_expenses', 'clearance_offers', 'offer_posts', 'purchase_orders', 'supply_points', 'supply_payments', 'shop_members', 'game_stations']) then raise exception 'That kind of record cannot be restored.'; end if;
  begin
    execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', d.table_name, d.table_name) using d.row;
  exception when unique_violation then
    raise exception 'It already exists again, so there is nothing to restore.';
  when foreign_key_violation then
    raise exception 'It belongs to something that has been deleted too. Restore that first.';
  end;
  delete from deleted_rows where id = p_id;
  return d.table_name;
end $$;
revoke all on function _restore_trash_row(bigint) from public, anon, authenticated;

select record_migration('053', '053_delete_unused_game_stations.sql');
