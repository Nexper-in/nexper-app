-- 045: usage per company (for the platform admin)
--
-- One row per company: shops, shops that billed in the month, bills in the month (from the per-day
-- summary, so no scan of the bills), AI scans, live API keys and a rough storage estimate.
-- Service role only. See docs/MULTITENANT_DESIGN.md section 3.10 (task T17).
--
-- The storage figure is an ESTIMATE: bills x 1.35 KB + stock movements x 0.2 KB (measured on this
-- schema with a 4-line bill). It ignores indexes and everything else, so it is only good for
-- comparing companies with each other and spotting a heavy one.
create or replace function admin_usage(p_month date)
returns table (org_id uuid, org_name text, shops integer, active_shops integer, bills_month bigint, bills_total bigint,
               movements_total bigint, ai_scans_month bigint, api_keys integer, est_storage_mb numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_to date := (date_trunc('month', coalesce(p_month, current_date)) + interval '1 month' - interval '1 day')::date;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  return query
  with sh as (
    select s.id, s.org_id from shops s where s.status = 'active' or s.status = 'closed'
  ),
  bills_m as (select d.shop_id, sum(d.bills) b from shop_day_stats d where d.day between v_from and v_to group by d.shop_id),
  bills_t as (select d.shop_id, sum(d.bills) b from shop_day_stats d group by d.shop_id),
  mov as (select m.shop_id, count(*) c from movements m group by m.shop_id),
  scans as (select u.org_id, count(*) c from ai_usage u where u.created_at >= v_from::timestamptz and u.created_at < (v_to + 1)::timestamptz group by u.org_id),
  keys as (select k.shop_id, count(*) c from api_keys k where k.revoked_at is null group by k.shop_id)
  select o.id, o.name,
         (select count(*)::integer from sh where sh.org_id = o.id),
         (select count(*)::integer from sh join bills_m bm on bm.shop_id = sh.id where sh.org_id = o.id and bm.b > 0),
         coalesce((select sum(bm.b) from sh join bills_m bm on bm.shop_id = sh.id where sh.org_id = o.id), 0)::bigint,
         coalesce((select sum(bt.b) from sh join bills_t bt on bt.shop_id = sh.id where sh.org_id = o.id), 0)::bigint,
         coalesce((select sum(mv.c) from sh join mov mv on mv.shop_id = sh.id where sh.org_id = o.id), 0)::bigint,
         coalesce((select sc.c from scans sc where sc.org_id = o.id), 0)::bigint,
         coalesce((select sum(ky.c) from sh join keys ky on ky.shop_id = sh.id where sh.org_id = o.id), 0)::integer,
         round((coalesce((select sum(bt.b) from sh join bills_t bt on bt.shop_id = sh.id where sh.org_id = o.id), 0) * 1.35
              + coalesce((select sum(mv.c) from sh join mov mv on mv.shop_id = sh.id where sh.org_id = o.id), 0) * 0.2) / 1024.0, 2)
  from organisations o
  order by o.name;
end $$;

revoke all on function admin_usage(date) from public, anon, authenticated;
grant execute on function admin_usage(date) to service_role;

select record_migration('045', '045_admin_usage.sql');
