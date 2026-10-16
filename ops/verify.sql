-- Read-only checks run after a release's database step (psql -v ON_ERROR_STOP=1 -f ops/verify.sql).
-- Any problem raises an exception, which turns the release red before the app is released.
do $$
declare
  n int;
  v text;
begin
  select count(*) into n
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if n > 0 then
    raise exception 'VERIFY FAILED: % table(s) in public have row-level security OFF', n;
  end if;

  select max(version) into v from app_migrations;
  if v is null then
    raise exception 'VERIFY FAILED: app_migrations is empty';
  end if;

  if has_function_privilege('anon', 'public.admin_transfer_shop_ownership(uuid,uuid)', 'execute') then
    raise exception 'VERIFY FAILED: anon can call admin_transfer_shop_ownership (migration 028)';
  end if;

  select count(*) into n
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if n > 0 then
    raise exception 'VERIFY FAILED: % security definer function(s) without search_path', n;
  end if;

  raise notice 'verify ok: database is at update %', v;
end $$;
