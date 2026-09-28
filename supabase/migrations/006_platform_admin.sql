-- 006: Platform admin
--
-- A platform admin is separate from shop owner/staff — it's a global
-- role, not scoped to any shop, for managing Nexper itself (every
-- owner, every shop) rather than one owner's own business. Modeled as
-- a table of admin user ids rather than a hardcoded email, so admin
-- access can be granted to more than one person later just by
-- inserting a row — there's deliberately no UI for granting admin
-- access yet, only this table, to keep that action SQL-editor-only
-- until there's a real need for a UI.
--
-- Run this in the Supabase SQL editor after 001-005. After running it,
-- make yourself the first admin:
--   insert into platform_admins (user_id)
--   select id from auth.users where email = 'you@example.com';

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
-- No policies on purpose: the anon/authenticated client never reads this
-- table directly. is_platform_admin() below reads it as a SECURITY
-- DEFINER function (same pattern as is_shop_member() in schema.sql),
-- and app/api/admin/* routes read it with the service-role key.

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

grant execute on function is_platform_admin() to authenticated;
