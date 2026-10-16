-- 046: closing an owner's account
--
-- An owner can close their whole account (Nexper, "My account data", "Close my account"). Their shops
-- are closed (read-only, 90 days to download or reopen) and this table records that the sign-in itself
-- is to be deleted after the last shop has been removed. The daily job (/api/cron/purge) does the
-- deleting. Cancelling removes the row. See docs/MULTITENANT_DESIGN.md section 3.9 (task T18).
create table if not exists account_closures (
  user_id uuid primary key,                 -- no foreign key: the record outlives the sign-in it describes until the job removes it
  email text,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null,
  staff_user_ids uuid[] not null default '{}'   -- the helpers' staff-code sign-ins of the closed shops, deleted with the account
);
alter table account_closures enable row level security;
-- No policies: written and read only by the server (service role).
revoke insert, update, delete, truncate on account_closures from anon, authenticated;

select record_migration('046', '046_account_closures.sql');
