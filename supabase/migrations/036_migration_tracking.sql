-- 036: migration tracking
--
-- From now on every database update is recorded in app_migrations, so "which
-- updates has this database had?" is a query, not a guess, and a release tool
-- (tools/migrate.mjs, the same code the tests use) can apply what is missing and
-- refuse to run a file that was edited after it ran. See docs/MULTITENANT_DESIGN.md
-- section 3.5.
--
-- Run in the Supabase SQL editor after 001-035 (or let tools/migrate.mjs do it).
-- Safe to run more than once. It refuses to run on a database that has not had
-- 001-035 yet.

do $$
begin
  if to_regclass('public.organisations') is null then
    raise exception 'Run database updates 001-035 first (see MAQBOOL_TASKS), then run this one.';
  end if;
end $$;

create table if not exists app_migrations (
  version text primary key,
  name text not null,
  checksum text,
  applied_at timestamptz not null default now(),
  applied_by text not null default 'sql-editor'
);

-- Platform table: no browser access at all (the server uses the service role).
alter table app_migrations enable row level security;

-- Called as the last line of every migration from 036 on, so a file pasted by hand
-- into the SQL editor records itself too. Only the database owner (the role that
-- runs migrations) may call it.
create or replace function record_migration(p_version text, p_name text)
returns void
language sql
set search_path = public
as $$
  insert into app_migrations (version, name) values (p_version, p_name)
  on conflict (version) do nothing;
$$;
revoke all on function record_migration(text, text) from public, anon, authenticated;

-- The newest update this database has. The app uses it to say "needs the latest
-- database update" instead of failing on a missing table. Returns only a version
-- number, so any signed-in user (and the server) may ask.
create or replace function db_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select max(version) from app_migrations;
$$;
revoke all on function db_version() from public, anon;
grant execute on function db_version() to authenticated, service_role;

-- History: updates 001-035 were run by hand and never recorded.
insert into app_migrations (version, name, applied_by) values
    ('001', '001_shared_catalog.sql', 'history'),
    ('002', '002_staff_roles.sql', 'history'),
    ('003', '003_security_hardening.sql', 'history'),
    ('004', '004_fix_shop_creation.sql', 'history'),
    ('005', '005_atomic_stock_functions.sql', 'history'),
    ('006', '006_platform_admin.sql', 'history'),
    ('007', '007_admin_transfer_ownership.sql', 'history'),
    ('008', '008_supplier_payables.sql', 'history'),
    ('009', '009_fixed_expenses.sql', 'history'),
    ('010', '010_stock_batches_fifo.sql', 'history'),
    ('011', '011_clearance_offers.sql', 'history'),
    ('012', '012_split_demo_shops_to_new_owners.sql', 'history'),
    ('012b', '012b_remove_onboarding_duplicates.sql', 'history'),
    ('013', '013_one_shop_per_owner.sql', 'history'),
    ('014', '014_shop_theme.sql', 'history'),
    ('015', '015_admin_audit_log.sql', 'history'),
    ('016', '016_permission_scoped_reads.sql', 'history'),
    ('017', '017_prevent_oversell.sql', 'history'),
    ('018', '018_unique_bill_no.sql', 'history'),
    ('019', '019_atomic_receive_po.sql', 'history'),
    ('020', '020_add_mrp.sql', 'history'),
    ('021', '021_add_hsn_code.sql', 'history'),
    ('022', '022_add_payment_method.sql', 'history'),
    ('023', '023_add_shop_plan.sql', 'history'),
    ('024', '024_write_off_batch.sql', 'history'),
    ('025', '025_offers_whatsapp_group.sql', 'history'),
    ('026', '026_receive_po_with_quantities.sql', 'history'),
    ('027', '027_default_modules_include_reports.sql', 'history'),
    ('028', '028_lock_down_function_access.sql', 'history'),
    ('029', '029_platform_console.sql', 'history'),
    ('030', '030_supplies.sql', 'history'),
    ('031', '031_returns_reminders_summary.sql', 'history'),
    ('033', '033_scale_and_tracking.sql', 'history'),
    ('034', '034_passkeys.sql', 'history'),
    ('035', '035_companies.sql', 'history')
on conflict (version) do nothing;

select record_migration('036', '036_migration_tracking.sql');
