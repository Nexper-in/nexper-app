-- 037: close a shop instead of deleting it
--
-- Before this, one call from the browser deleted a shop and everything under it, for good.
-- Now an owner CLOSES a shop: it becomes read-only, staff and company roles lose access, the
-- owner keeps access to download everything, and the shop can be reopened for 90 days. After
-- that a daily job removes it (purge_closed_shops). Nothing else deletes a shop.
-- See docs/MULTITENANT_DESIGN.md section 3.9 (task T07).

-- ---------- columns ----------
alter table shops add column if not exists status text not null default 'active';
alter table shops drop constraint if exists shops_status_check;
alter table shops add constraint shops_status_check check (status in ('active', 'closed'));
alter table shops add column if not exists closed_at timestamptz;
alter table shops add column if not exists closed_by uuid;
alter table shops add column if not exists close_reason text;
alter table shops add column if not exists purge_after timestamptz;
create index if not exists shops_purge_after_idx on shops (purge_after) where status = 'closed';

-- ---------- nobody deletes a shop from the browser any more ----------
drop policy if exists "Owners can delete their shops" on shops;

-- ---------- a closed shop is read-only ----------
-- Every write to a table of the shop's books is refused while the shop is closed, for
-- everyone including the server, unless a closing/reopening/purging function says so for
-- this transaction (nexper.closure = 'on').
create or replace function block_closed_shop_writes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid;
begin
  if coalesce(current_setting('nexper.closure', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_shop := case when tg_op = 'DELETE' then old.shop_id else new.shop_id end;
  if exists (select 1 from shops where id = v_shop and status = 'closed') then
    raise exception 'This shop is closed. Reopen it first.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function block_closed_offer_item_writes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_offer uuid;
begin
  if coalesce(current_setting('nexper.closure', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_offer := case when tg_op = 'DELETE' then old.offer_id else new.offer_id end;
  if exists (select 1 from clearance_offers o join shops s on s.id = o.shop_id where o.id = v_offer and s.status = 'closed') then
    raise exception 'This shop is closed. Reopen it first.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function block_closed_po_item_writes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_po uuid;
begin
  if coalesce(current_setting('nexper.closure', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_po := case when tg_op = 'DELETE' then old.po_id else new.po_id end;
  if exists (select 1 from purchase_orders p join shops s on s.id = p.shop_id where p.id = v_po and s.status = 'closed') then
    raise exception 'This shop is closed. Reopen it first.' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function shops_closed_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'closed' and coalesce(current_setting('nexper.closure', true), '') <> 'on' then
    raise exception 'This shop is closed. Reopen it first.' using errcode = '55000';
  end if;
  return new;
end $$;

drop trigger if exists shops_closed_guard_trg on shops;
create trigger shops_closed_guard_trg before update on shops
  for each row execute function shops_closed_guard();

do $$
declare
  t text;
begin
  foreach t in array array[
    'shop_members', 'shop_products', 'shop_suppliers', 'bills', 'sale_returns', 'credits', 'movements',
    'expenses', 'fixed_expenses', 'draws', 'reconciliations', 'stock_batches', 'offer_posts',
    'clearance_offers', 'purchase_orders', 'supply_points', 'supply_entries', 'supply_payments', 'reminder_log'
  ] loop
    execute format('drop trigger if exists %I on %I', t || '_closed_guard', t);
    execute format('create trigger %I before insert or update or delete on %I for each row execute function block_closed_shop_writes()', t || '_closed_guard', t);
  end loop;
end $$;
drop trigger if exists clearance_offer_items_closed_guard on clearance_offer_items;
create trigger clearance_offer_items_closed_guard before insert or update or delete on clearance_offer_items
  for each row execute function block_closed_offer_item_writes();
drop trigger if exists purchase_order_items_closed_guard on purchase_order_items;
create trigger purchase_order_items_closed_guard before insert or update or delete on purchase_order_items
  for each row execute function block_closed_po_item_writes();

-- ---------- the company's shop limit counts only open shops ----------
create or replace function shops_assign_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o organisations%rowtype;
  n integer;
begin
  -- Refuse early when someone tries to open a shop for another person, so the
  -- error says nothing about that person's company.
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null and new.owner_id is distinct from auth.uid() then
    raise exception 'new row violates row-level security policy for table "shops"' using errcode = '42501';
  end if;
  if new.org_id is null then
    select * into o from organisations where owner_id = new.owner_id for update;
    if not found then
      insert into organisations (name, owner_id) values (left(new.name, 80), new.owner_id) returning * into o;
      insert into org_members (org_id, user_id, role) values (o.id, new.owner_id, 'owner');
    end if;
    new.org_id := o.id;
  else
    select * into o from organisations where id = new.org_id for update;
    if not found or o.owner_id <> new.owner_id then
      raise exception 'That company is not yours';
    end if;
  end if;
  select count(*) into n from shops where org_id = o.id and status = 'active';
  if n >= o.max_shops then
    raise exception 'Your plan allows % shop(s). Contact us to add more branches.', o.max_shops;
  end if;
  return new;
end $$;


-- company team members are not given a closed shop
create or replace function sync_org_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  m org_members%rowtype;
  v_name text;
begin
  delete from shop_members where user_id = p_user and via_org = p_org;
  select * into m from org_members where org_id = p_org and user_id = p_user;
  if not found or m.role = 'owner' then
    return;  -- the owner's own rows are the normal direct ones
  end if;
  select coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), nullif(split_part(email, '@', 1), ''), 'Company')
    into v_name from auth.users where id = p_user;
  insert into shop_members (shop_id, user_id, role, name, permissions, via_org)
    select s.id, p_user, 'staff', coalesce(v_name, 'Company'), org_role_permissions(m.role), p_org
    from shops s
    where s.org_id = p_org and s.status = 'active' and (m.role <> 'area_manager' or s.id = any (m.shop_ids))
  on conflict (shop_id, user_id) do nothing;   -- a direct membership wins
end $$;


-- ---------- close, reopen, purge ----------
-- The shared part: who is acting (p_by) is checked by the callers below.
create or replace function _close_shop(p_shop uuid, p_reason text, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('nexper.closure', 'on', true);
  update shops set status = 'closed', closed_at = now(), closed_by = p_by,
         close_reason = left(p_reason, 200), purge_after = now() + interval '90 days'
   where id = p_shop and status = 'active';
  -- only the owner keeps access (to download everything and to reopen)
  delete from shop_members where shop_id = p_shop and role <> 'owner';
  update api_keys set revoked_at = now() where shop_id = p_shop and revoked_at is null;
end $$;

create or replace function close_shop(p_shop uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s shops%rowtype;
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  select * into s from shops where id = p_shop;
  if not found then raise exception 'Not allowed'; end if;
  if not (is_shop_owner(p_shop) or is_org_owner(s.org_id)) then raise exception 'Not allowed'; end if;
  if s.status = 'closed' then return; end if;
  perform _close_shop(p_shop, p_reason, auth.uid());
end $$;

-- Platform support closes a shop (service role): same effect, recorded as closed by nobody.
create or replace function admin_close_shop(p_shop uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  if not exists (select 1 from shops where id = p_shop) then raise exception 'Shop not found'; end if;
  perform _close_shop(p_shop, p_reason, null);
end $$;

create or replace function reopen_shop(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s shops%rowtype;
  o organisations%rowtype;
  n integer;
  m record;
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  select * into s from shops where id = p_shop;
  if not found then raise exception 'Not allowed'; end if;
  if not (is_shop_owner(p_shop) or is_org_owner(s.org_id)) then raise exception 'Not allowed'; end if;
  if s.status <> 'closed' then return; end if;
  if s.purge_after is null or s.purge_after <= now() then
    raise exception 'This shop can no longer be reopened.';
  end if;
  select * into o from organisations where id = s.org_id for update;
  select count(*) into n from shops where org_id = o.id and status = 'active';
  if n >= o.max_shops then
    raise exception 'Your plan allows % shop(s). Contact us to add more branches.', o.max_shops;
  end if;
  perform set_config('nexper.closure', 'on', true);
  update shops set status = 'active', closed_at = null, closed_by = null, close_reason = null, purge_after = null where id = p_shop;
  -- the company team gets the shop back; staff are added again by the owner
  for m in select user_id from org_members where org_id = s.org_id and role <> 'owner' loop
    perform sync_org_member(s.org_id, m.user_id);
  end loop;
end $$;

-- Daily job (service role): removes shops whose 90 days are over. Everything under them goes
-- with them (cascade). One audit row per shop; the audit log outlives the shop.
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
    delete from shops where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Support tool (service role): remove a shop that never had a bill (a test or spam sign-up)
-- right away. Refuses any shop that has bills.
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
  delete from shops where id = p_shop;
end $$;

revoke all on function _close_shop(uuid, text, uuid), close_shop(uuid, text), admin_close_shop(uuid, text), reopen_shop(uuid), purge_closed_shops(integer), purge_shop_now(uuid) from public, anon, authenticated;
grant execute on function close_shop(uuid, text), reopen_shop(uuid) to authenticated, service_role;
grant execute on function admin_close_shop(uuid, text), purge_closed_shops(integer), purge_shop_now(uuid) to service_role;
revoke all on function sync_org_member(uuid, uuid) from public, anon, authenticated;
grant execute on function sync_org_member(uuid, uuid) to service_role;

select record_migration('037', '037_shop_closure.sql');
