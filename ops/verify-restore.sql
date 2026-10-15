-- Run after a restore (psql -f ops/verify-restore.sql) and write the output in the restore
-- log (docs/RUNBOOK_RESTORE.md). Compare the numbers with what you expect: rows per table,
-- the newest bill (how far back did the backup go?), the update version, and the sign-in
-- accounts. Read-only.
\echo '--- rows per table (public) ---'
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as rows
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

\echo '--- how recent is the data ---'
select (select max(date) from bills) as newest_bill,
       (select max(created_at) from shops) as newest_shop,
       (select count(*) from shops) as shops,
       (select count(*) from organisations) as companies;

\echo '--- update version and sign-in accounts ---'
select (select max(version) from app_migrations) as db_version,
       (select count(*) from auth.users) as auth_users,
       (select count(*) from shop_members where via_org is null) as shop_members;
