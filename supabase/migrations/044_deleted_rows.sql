-- 044: a 30-day trash for deleted rows
--
-- When an owner (or a helper) deletes an item, a supplier, a department, a staff member or an expense
-- plan by mistake, a copy of the row is kept for 30 days and Nexper support can put it back from a
-- support session. Bills, udhaar, stock movements and the like are never deleted from the app, so they
-- are not here. Nothing is kept when a whole shop is removed (closing and purging a shop leaves no
-- trash behind). See docs/MULTITENANT_DESIGN.md (task T16).

create table if not exists deleted_rows (
  id bigint generated always as identity primary key,
  shop_id uuid,                        -- no foreign key on purpose: the copy outlives its parents for 30 days
  owner_id uuid,
  table_name text not null,
  row_id text not null,
  row jsonb not null,
  deleted_by uuid default auth.uid(),
  deleted_at timestamptz not null default now()
);
create index if not exists deleted_rows_shop_idx on deleted_rows (shop_id, deleted_at desc);
create index if not exists deleted_rows_owner_idx on deleted_rows (owner_id, deleted_at desc);
alter table deleted_rows enable row level security;
-- No policies: written by the trigger below, read and restored only by the server for support.
revoke insert, update, delete, truncate on deleted_rows from anon, authenticated, service_role;

create or replace function keep_deleted_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(old);
begin
  -- A shop being closed, purged or restored takes its rows with it: no trash for that.
  if coalesce(current_setting('nexper.closure', true), '') = 'on' or coalesce(current_setting('nexper.purging', true), '') = 'on' then
    return old;
  end if;
  insert into deleted_rows (shop_id, owner_id, table_name, row_id, row)
    values (nullif(j->>'shop_id', '')::uuid, nullif(j->>'owner_id', '')::uuid, tg_table_name, coalesce(j->>'id', j->>'shop_id'), j);
  return old;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['shop_products', 'products', 'suppliers', 'shop_suppliers', 'fixed_expenses', 'clearance_offers', 'offer_posts', 'purchase_orders', 'supply_points', 'supply_payments', 'shop_members'] loop
    execute format('drop trigger if exists %I on %I', t || '_keep_deleted', t);
    execute format('create trigger %I after delete on %I for each row execute function keep_deleted_row()', t || '_keep_deleted', t);
  end loop;
end $$;

-- ---------- restore ----------
-- Only these tables can be restored, and only into a shop that is open.
create or replace function _restore_trash_row(p_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  d deleted_rows%rowtype;
begin
  select * into d from deleted_rows where id = p_id;
  if not found then raise exception 'That deleted record is no longer kept (30 days).'; end if;
  if d.table_name <> all (array['shop_products', 'products', 'suppliers', 'shop_suppliers', 'fixed_expenses', 'clearance_offers', 'offer_posts', 'purchase_orders', 'supply_points', 'supply_payments', 'shop_members']) then raise exception 'That kind of record cannot be restored.'; end if;
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

-- A support person restores one row inside an open support session that covers it; the restore is
-- written to the access log like any other look inside the shop.
create or replace function support_restore_row(p_session uuid, p_admin uuid, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d deleted_rows%rowtype;
  s support_sessions%rowtype;
  v_table text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  select * into d from deleted_rows where id = p_id;
  if not found then raise exception 'That deleted record is no longer kept (30 days).'; end if;
  if d.shop_id is not null then
    s := support_check(p_session, p_admin, d.shop_id);
  else
    -- the owner's shared items and suppliers: the session's company must belong to that owner
    select * into s from support_sessions where id = p_session and admin_id = p_admin and ended_at is null and expires_at > now();
    if not found or not exists (select 1 from organisations where id = s.org_id and owner_id = d.owner_id) then
      raise exception 'No open support session';
    end if;
  end if;
  v_table := _restore_trash_row(p_id);
  insert into support_access_log (session_id, admin_id, shop_id, resource, params, row_count)
    values (p_session, p_admin, d.shop_id, left('restore:' || v_table, 60), jsonb_build_object('row_id', d.row_id), 1);
  return jsonb_build_object('table', v_table, 'row_id', d.row_id);
end $$;
revoke all on function support_restore_row(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function support_restore_row(uuid, uuid, bigint) to service_role;

-- ---------- nothing is kept for a removed shop; old trash is purged ----------
create or replace function purge_closed_shops(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  perform set_config('nexper.closure', 'on', true);
  for r in
    select id, name, owner_id, closed_at from shops
    where status = 'closed' and purge_after < now()
    order by purge_after limit greatest(coalesce(p_limit, 50), 1)
    for update skip locked
  loop
    insert into admin_audit_log (admin_id, action, target_type, target_id, meta)
      values ('00000000-0000-0000-0000-000000000000', 'purge_closed_shop', 'shop', r.id::text,
              jsonb_build_object('shopName', r.name, 'ownerId', r.owner_id, 'closedAt', r.closed_at));
    delete from deleted_rows where shop_id = r.id;
    delete from shops where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function purge_shop_now(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s shops%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  select * into s from shops where id = p_shop;
  if not found then raise exception 'Shop not found'; end if;
  if exists (select 1 from bills where shop_id = p_shop) then
    raise exception 'This shop has bills. Close it instead; it is removed after 90 days.';
  end if;
  perform set_config('nexper.closure', 'on', true);
  insert into admin_audit_log (admin_id, action, target_type, target_id, meta)
    values ('00000000-0000-0000-0000-000000000000', 'purge_empty_shop', 'shop', p_shop::text,
            jsonb_build_object('shopName', s.name, 'ownerId', s.owner_id));
  delete from deleted_rows where shop_id = p_shop;
  delete from shops where id = p_shop;
end $$;

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
  delete from deleted_rows where deleted_at < now() - interval '30 days';
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;

revoke all on function purge_closed_shops(integer), purge_shop_now(uuid), purge_ops() from public, anon, authenticated;
grant execute on function purge_closed_shops(integer), purge_shop_now(uuid), purge_ops() to service_role;

select record_migration('044', '044_deleted_rows.sql');
