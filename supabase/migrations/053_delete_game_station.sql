-- 053: let an owner delete a play-area station once nothing of it is left unbilled
--
-- Migration 047 deliberately gave game_stations no delete policy: a station
-- with history is hidden (active = false) instead, never removed, so a
-- stopped session's station name stays correct everywhere it's read --
-- including the "ready to bill" list on New bill's Play area tab, which
-- isn't filtered by active at all (unbilled_game_sessions joins every
-- station regardless). Removing a station with a session still running, or
-- stopped but not yet billed, would either orphan that charge or -- since
-- game_sessions.station_id is "on delete cascade" -- silently wipe it out
-- from under an owner who hasn't collected it yet.
--
-- But once every one of a station's sessions is actually billed (or it was
-- never started at all), there's nothing left to protect: the bill itself
-- already carries the charge and the station's name as plain text forever,
-- independent of the live game_sessions row. delete_station allows exactly
-- that case, and still refuses -- with a clear reason -- while a game is
-- running on it or a charge is still waiting to be billed. (Deleting then
-- does cascade away the now-history-only game_sessions rows; nothing else
-- in the app reads them once billed, so nothing else is affected. Restoring
-- a deleted station from the 30-day trash brings the station back, but not
-- those cascaded sessions -- same as deleting any parent row elsewhere.)

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
  if exists (select 1 from game_sessions where station_id = p_station and (stopped_at is null or bill_id is null)) then
    raise exception 'This station still has a game running or a charge waiting to be billed -- finish that first, or hide the station instead.';
  end if;
  delete from game_stations where id = p_station;
end;
$$;
revoke all on function delete_station(uuid) from public, anon;
grant execute on function delete_station(uuid) to authenticated, service_role;

-- A deleted station is kept for 30 days, restorable the same way as any
-- other trashed row (migration 044).
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

select record_migration('053', '053_delete_game_station.sql');
