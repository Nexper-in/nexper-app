-- 035: companies (organisations): one owner, several shops, chain-wide roles
--
-- A chain is a company with several shops. Every shop still keeps its own bills,
-- stock, udhaar and staff, kept apart by shop_id and row-level security exactly
-- as before. What is new is the company above the shops:
--   organisations   the company (name, owner, how many shops it may have)
--   org_members     who works at company level and in what role
-- Roles: owner (everything), manager (runs every shop, but cannot change
-- settings or delete), analyst (reads sales and stock, changes nothing),
-- area_manager (a manager for chosen shops only).
--
-- How company roles reach the shops WITHOUT touching any of the existing
-- security rules: each company member gets an ordinary shop_members row in every
-- shop they cover (marked via_org), created and removed automatically. Every
-- policy already keyed on shop membership therefore works unchanged, and the
-- all-tables isolation test keeps proving it. A direct membership (an owner, a
-- staff login) always wins over a company one and is never removed by it.
--
-- Everyone who exists today gets a company of one shop, so nothing changes for
-- them. How many shops a company may have is set by the platform admin
-- (organisations.max_shops, default 1), which replaces the old "one shop per
-- owner" rule of migration 013.
--
-- Run in the Supabase SQL editor after 001-034. Safe to run more than once.

-- ---------- tables ----------
create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  max_shops integer not null default 1 check (max_shops between 1 and 500),
  created_at timestamptz not null default now()
);
create unique index if not exists organisations_owner_idx on organisations (owner_id);

create table if not exists org_members (
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'analyst', 'area_manager')),
  shop_ids uuid[] not null default '{}',   -- only used by area_manager
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on org_members (user_id);

alter table shops add column if not exists org_id uuid references organisations(id) on delete cascade;
alter table shop_members add column if not exists via_org uuid references organisations(id) on delete cascade;
create index if not exists shop_members_via_org_idx on shop_members (via_org) where via_org is not null;

-- ---------- everyone who exists gets a company ----------
do $$
declare
  r record;
  oid uuid;
begin
  for r in
    select owner_id, (array_agg(name order by created_at))[1] as shop_name, count(*)::int as n
    from shops where org_id is null group by owner_id
  loop
    insert into organisations (name, owner_id, max_shops)
      values (left(r.shop_name, 80), r.owner_id, greatest(r.n, 1))
    on conflict (owner_id) do update set max_shops = greatest(organisations.max_shops, excluded.max_shops)
    returning id into oid;
    insert into org_members (org_id, user_id, role) values (oid, r.owner_id, 'owner') on conflict do nothing;
    update shops set org_id = oid where owner_id = r.owner_id and org_id is null;
  end loop;
end $$;

alter table shops alter column org_id set not null;
create index if not exists shops_org_idx on shops (org_id);
-- The old rule is now "the company may have max_shops shops". It exists under two
-- names depending on how the database was built (schema.sql: shops_owner_id_key,
-- migration 013: shops_owner_id_unique), so remove any unique rule on owner_id alone.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.shops'::regclass
      and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname)
           from pg_attribute att where att.attrelid = con.conrelid and att.attnum = any (con.conkey)) = array['owner_id']
  loop
    execute format('alter table public.shops drop constraint %I', c.conname);
  end loop;
end $$;
create index if not exists shops_owner_idx on shops (owner_id);

-- ---------- helpers (run as the function owner so policies cannot loop) ----------
create or replace function is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members where org_id = target_org and user_id = auth.uid());
$$;

create or replace function is_org_owner(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members where org_id = target_org and user_id = auth.uid() and role = 'owner');
$$;

-- Owner and managers may see who else is on the company team.
create or replace function can_see_org_team(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members where org_id = target_org and user_id = auth.uid() and role in ('owner', 'manager'));
$$;

create or replace function org_full_permissions()
returns jsonb language sql immutable as $$
  select jsonb_build_object('dashboard', true, 'inventory', true, 'billing', true, 'supplies', true, 'history', true,
    'credit', true, 'dayclose', true, 'expenses', true, 'cashbook', true, 'suppliers', true, 'reports', true);
$$;

-- An analyst can look at Home, Bills and Reports; nothing that changes data.
create or replace function org_role_permissions(p_role text)
returns jsonb language sql immutable as $$
  select case when p_role = 'analyst'
    then jsonb_build_object('dashboard', true, 'history', true, 'reports', true)
    else org_full_permissions() end;
$$;

-- ---------- keep company members' shop memberships in step ----------
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
    where s.org_id = p_org and (m.role <> 'area_manager' or s.id = any (m.shop_ids))
  on conflict (shop_id, user_id) do nothing;   -- a direct membership wins
end $$;

create or replace function org_members_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform sync_org_member(old.org_id, old.user_id);
    return old;
  end if;
  perform sync_org_member(new.org_id, new.user_id);
  return new;
end $$;

create or replace function org_members_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o organisations%rowtype;
begin
  select * into o from organisations where id = new.org_id;
  if new.role = 'owner' and new.user_id <> o.owner_id then
    raise exception 'A company has one owner';
  end if;
  if new.user_id = o.owner_id and new.role <> 'owner' then
    raise exception 'The owner keeps the owner role';
  end if;
  return new;
end $$;

drop trigger if exists org_members_check_trg on org_members;
create trigger org_members_check_trg before insert or update on org_members
  for each row execute function org_members_check();
drop trigger if exists org_members_sync_trg on org_members;
create trigger org_members_sync_trg after insert or update or delete on org_members
  for each row execute function org_members_changed();

-- ---------- shops: join or create the company, respect the limit ----------
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
  select count(*) into n from shops where org_id = o.id;
  if n >= o.max_shops then
    raise exception 'Your plan allows % shop(s). Contact us to add more branches.', o.max_shops;
  end if;
  return new;
end $$;

drop trigger if exists shops_a_assign_org on shops;
create trigger shops_a_assign_org before insert on shops
  for each row execute function shops_assign_org();

create or replace function shops_after_insert_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  for m in select user_id from org_members where org_id = new.org_id and role <> 'owner' loop
    perform sync_org_member(new.org_id, m.user_id);
  end loop;
  return new;
end $$;

drop trigger if exists shops_b_sync_org on shops;
create trigger shops_b_sync_org after insert on shops
  for each row execute function shops_after_insert_org();

-- A shop never moves to another company, and ownership changes only through the
-- platform admin's function (service role).
create or replace function shops_guard_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.org_id is distinct from old.org_id then
      raise exception 'A shop cannot move to another company';
    end if;
    if new.owner_id is distinct from old.owner_id then
      raise exception 'Ownership changes are done by Nexper support';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists shops_guard_org_trg on shops;
create trigger shops_guard_org_trg before update on shops
  for each row execute function shops_guard_org();

-- Only the platform admin changes how many shops a company may have, or who owns it.
create or replace function organisations_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and (new.max_shops is distinct from old.max_shops or new.owner_id is distinct from old.owner_id) then
    raise exception 'Only Nexper support can change that';
  end if;
  return new;
end $$;

drop trigger if exists organisations_guard_trg on organisations;
create trigger organisations_guard_trg before update on organisations
  for each row execute function organisations_guard();

-- ---------- row-level security ----------
alter table organisations enable row level security;
alter table org_members enable row level security;

drop policy if exists "Company members view their company" on organisations;
create policy "Company members view their company" on organisations for select
  using (owner_id = auth.uid() or is_org_member(id));
drop policy if exists "Owner renames the company" on organisations;
create policy "Owner renames the company" on organisations for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- No insert or delete policy: companies are made by the shop trigger and removed by support.

drop policy if exists "Company team visibility" on org_members;
create policy "Company team visibility" on org_members for select
  using (user_id = auth.uid() or can_see_org_team(org_id));
-- No direct writes: use org_set_member() and org_remove_member() below.

-- Shop owners cannot forge or remove a company member's shop access.
drop policy if exists "Owners can add shop members" on shop_members;
create policy "Owners can add shop members" on shop_members for insert
  with check (
    via_org is null
    and (is_shop_owner(shop_id) or exists (select 1 from shops s where s.id = shop_members.shop_id and s.owner_id = auth.uid()))
  );
drop policy if exists "Owners can update staff members" on shop_members;
create policy "Owners can update staff members" on shop_members for update
  using (is_shop_owner(shop_id) and role = 'staff' and via_org is null)
  with check (is_shop_owner(shop_id) and role = 'staff' and via_org is null);
drop policy if exists "Owners can remove staff members" on shop_members;
create policy "Owners can remove staff members" on shop_members for delete
  using (is_shop_owner(shop_id) and role = 'staff' and via_org is null);

-- Existing company owners can open more branches whatever the sign-up mode is
-- (the shop limit above still applies); strangers still need an open sign-up.
drop policy if exists "Owners can insert shops" on shops;
create policy "Owners can insert shops" on shops for insert
  with check (
    owner_id = auth.uid()
    and (can_create_shop() or exists (select 1 from organisations o where o.owner_id = auth.uid()))
  );

-- ---------- managing the team ----------
create or replace function org_set_member(p_org uuid, p_email text, p_role text, p_shop_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_ids uuid[] := coalesce(p_shop_ids, '{}');
begin
  if auth.uid() is null or not is_org_owner(p_org) then
    raise exception 'Only the company owner can do that';
  end if;
  if p_role not in ('manager', 'analyst', 'area_manager') then
    raise exception 'Unknown role';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'No Nexper account has that email. Ask them to sign up first.';
  end if;
  if exists (select 1 from organisations where id = p_org and owner_id = v_user) then
    raise exception 'That is the owner';
  end if;
  if (select count(*) from org_members where org_id = p_org) >= 50 and not exists (select 1 from org_members where org_id = p_org and user_id = v_user) then
    raise exception 'A company can have at most 50 people on its team';
  end if;
  if p_role = 'area_manager' then
    if coalesce(array_length(v_ids, 1), 0) = 0 then
      raise exception 'Choose at least one shop for an area manager';
    end if;
    if (select count(*) from shops where org_id = p_org and id = any (v_ids)) <> (select count(distinct x) from unnest(v_ids) x) then
      raise exception 'One of those shops is not in this company';
    end if;
  else
    v_ids := '{}';
  end if;
  insert into org_members (org_id, user_id, role, shop_ids) values (p_org, v_user, p_role, v_ids)
  on conflict (org_id, user_id) do update set role = excluded.role, shop_ids = excluded.shop_ids;
end $$;

create or replace function org_remove_member(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_org_owner(p_org) then
    raise exception 'Only the company owner can do that';
  end if;
  if exists (select 1 from organisations where id = p_org and owner_id = p_user) then
    raise exception 'The owner cannot be removed';
  end if;
  delete from org_members where org_id = p_org and user_id = p_user;
end $$;

-- A name for each person on the team, for the Company screen (owner and managers only).
create or replace function org_team(p_org uuid)
returns table (user_id uuid, role text, shop_ids uuid[], name text, email text)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.role, m.shop_ids,
         coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)) as name,
         u.email::text
  from org_members m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and can_see_org_team(p_org)
  order by (m.role = 'owner') desc, m.created_at;
$$;

revoke all on function org_set_member(uuid, text, text, uuid[]) from public, anon;
revoke all on function org_remove_member(uuid, uuid) from public, anon;
revoke all on function org_team(uuid) from public, anon;
revoke all on function sync_org_member(uuid, uuid) from public, anon, authenticated;
grant execute on function org_set_member(uuid, text, text, uuid[]) to authenticated, service_role;
grant execute on function org_remove_member(uuid, uuid) to authenticated, service_role;
grant execute on function org_team(uuid) to authenticated, service_role;
grant execute on function sync_org_member(uuid, uuid) to service_role;
grant execute on function is_org_member(uuid), is_org_owner(uuid), can_see_org_team(uuid) to authenticated, service_role;

-- ---------- ownership transfer keeps the company in step ----------
create or replace function admin_transfer_shop_ownership(p_shop_id uuid, p_new_owner_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_old_owner_id uuid;
  v_org uuid;
begin
  select owner_id, org_id into v_old_owner_id, v_org from shops where id = p_shop_id;
  if v_old_owner_id is null then
    raise exception 'shop not found';
  end if;
  if v_old_owner_id = p_new_owner_id then
    raise exception 'that member is already the owner';
  end if;
  if not exists (select 1 from shop_members where shop_id = p_shop_id and user_id = p_new_owner_id) then
    raise exception 'target user is not a member of this shop';
  end if;
  if (select count(*) from shops where org_id = v_org) > 1 then
    raise exception 'This shop belongs to a company with several shops. Move the whole company instead.';
  end if;
  if exists (select 1 from organisations where owner_id = p_new_owner_id and id <> v_org) then
    raise exception 'The new owner already has a company of their own';
  end if;

  -- the company follows the shop
  delete from org_members where org_id = v_org and user_id = p_new_owner_id;
  update organisations set owner_id = p_new_owner_id where id = v_org;
  delete from org_members where org_id = v_org and role = 'owner';
  insert into org_members (org_id, user_id, role) values (v_org, p_new_owner_id, 'owner');

  update shops set owner_id = p_new_owner_id where id = p_shop_id;
  update shop_members set role = 'staff' where shop_id = p_shop_id and user_id = v_old_owner_id;
  update shop_members set role = 'owner', via_org = null where shop_id = p_shop_id and user_id = p_new_owner_id;
end $$;
revoke all on function admin_transfer_shop_ownership(uuid, uuid) from public, anon, authenticated;
grant execute on function admin_transfer_shop_ownership(uuid, uuid) to service_role;
