-- 029: platform admin console
--
-- Everything the platform admin page controls, kept out of the shop owner's
-- reach. Owners can READ what applies to them but never write it; all writes go
-- through app/api/admin/* with the service role.
--
--   platform_settings  pricing, tax, plans, feature switches, sign-up mode,
--                      announcement, maintenance, integrations (public to read)
--   tenant_controls    per shop: plan override, expiry, limits, feature
--                      overrides, API / MCP access
--   tenant_invites     who may open a shop when sign-up is invite-only
--   api_keys           keys for the read API and the MCP endpoint (hashed)
--   ai_usage           one row per scan, to enforce monthly quotas
--
-- Also: (1) the sign-up mode is enforced here, in the database, not just in the
-- screens, and (2) shop owners can no longer change shops.plan themselves once
-- the admin turns off self-service plan switching (it is on by default, which
-- matches today's free testing mode).
-- Run in the Supabase SQL editor after 001-028.

-- ---------- settings ----------
create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table platform_settings enable row level security;
drop policy if exists "Anyone can read platform settings" on platform_settings;
create policy "Anyone can read platform settings" on platform_settings for select
  to anon, authenticated using (true);

create or replace function platform_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from platform_settings where key = p_key
$$;
revoke all on function platform_setting(text) from public, anon;
grant execute on function platform_setting(text) to authenticated, service_role;

-- ---------- per-tenant controls ----------
create table if not exists tenant_controls (
  shop_id uuid primary key references shops(id) on delete cascade,
  plan text check (plan in ('free', 'pro')),
  plan_expires_at timestamptz,
  limits jsonb not null default '{}'::jsonb,
  feature_overrides jsonb not null default '{}'::jsonb,
  api_enabled boolean not null default false,
  mcp_enabled boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table tenant_controls enable row level security;
drop policy if exists "Members can read their tenant controls" on tenant_controls;
create policy "Members can read their tenant controls" on tenant_controls for select
  using (is_shop_member(shop_id));

-- ---------- invites ----------
create table if not exists tenant_invites (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  note text,
  status text not null default 'pending' check (status in ('pending', 'used', 'revoked')),
  invited_by uuid,
  shop_id uuid references shops(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create unique index if not exists tenant_invites_pending_email_idx on tenant_invites (lower(email)) where status = 'pending';
alter table tenant_invites enable row level security;  -- no policies: server only

-- ---------- API keys ----------
create table if not exists api_keys (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default array['read:shop','read:stock','read:bills','read:udhaar'],
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_shop_id_idx on api_keys(shop_id);
alter table api_keys enable row level security;  -- no policies: server only

-- ---------- AI usage ----------
create table if not exists ai_usage (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid references shops(id) on delete cascade,
  user_id uuid,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_shop_month_idx on ai_usage (shop_id, created_at desc);
alter table ai_usage enable row level security;  -- no policies: server only

-- ---------- sign-up mode, enforced in the database ----------
create or replace function can_create_shop()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mode text := coalesce(platform_setting('signup') ->> 'mode', 'open');
begin
  if mode = 'open' then
    return true;
  elsif mode = 'invite_only' then
    return exists (
      select 1 from tenant_invites
      where status = 'pending' and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
  end if;
  return false;  -- closed
end;
$$;
revoke all on function can_create_shop() from public, anon;
grant execute on function can_create_shop() to authenticated, service_role;

drop policy if exists "Owners can insert shops" on shops;
create policy "Owners can insert shops" on shops for insert
  with check (owner_id = auth.uid() and can_create_shop());

-- When a shop is created: use up the matching invite and start its controls row.
create or replace function after_shop_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  owner_email text;
begin
  select email into owner_email from auth.users where id = new.owner_id;
  select * into inv from tenant_invites
    where status = 'pending' and lower(email) = lower(coalesce(owner_email, ''))
    limit 1;
  if inv.id is not null then
    update tenant_invites set status = 'used', used_at = now(), shop_id = new.id where id = inv.id;
    insert into tenant_controls (shop_id, plan) values (new.id, inv.plan)
      on conflict (shop_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists shops_after_insert on shops;
create trigger shops_after_insert after insert on shops
  for each row execute function after_shop_created();

-- ---------- owners cannot change their own plan unless the admin allows it ----------
create or replace function protect_shop_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan is distinct from old.plan
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce((platform_setting('gating') ->> 'allowSelfPlanSwitch')::boolean, true) = false then
    new.plan := old.plan;
  end if;
  return new;
end;
$$;
drop trigger if exists shops_protect_plan on shops;
create trigger shops_protect_plan before update on shops
  for each row execute function protect_shop_plan();
