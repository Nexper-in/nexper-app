-- 028: lock down who can call the database functions
--
-- Postgres gives EXECUTE on every new function to PUBLIC by default, and
-- Supabase also grants it to the anon and authenticated roles. 007 says
-- admin_transfer_shop_ownership is "deliberately not granted" to signed-in
-- users, but never revoked the default, so anyone holding the public anon key
-- could call it over the API and move any shop to another owner. This closes
-- that, and makes every other function explicit: signed-in users only, never
-- anonymous callers.
--
-- Run in the Supabase SQL editor after 001-027. Safe to run more than once.
--
-- Check afterwards (all should return false):
--   select has_function_privilege('anon',          'admin_transfer_shop_ownership(uuid,uuid)', 'execute');
--   select has_function_privilege('authenticated', 'admin_transfer_shop_ownership(uuid,uuid)', 'execute');

-- 1. Admin-only: the service role (server API routes) is the only caller.
revoke all on function admin_transfer_shop_ownership(uuid, uuid) from public, anon, authenticated;
grant execute on function admin_transfer_shop_ownership(uuid, uuid) to service_role;

-- 2. Everything else that runs as the function owner: signed-in users only.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname <> 'admin_transfer_shop_ownership'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end
$$;
