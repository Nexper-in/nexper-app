-- One-time, in the PRODUCTION and STAGING Supabase SQL editor. A login that can only
-- read which updates the database has and its structure (no shop data), used by the
-- weekly drift check so it does not need the release approval.
-- Replace PASTE-A-LONG-RANDOM-PASSWORD with a long random password from your password
-- manager (30+ characters, letters and digits only). Never type it into a chat.
create role nexper_drift login password 'PASTE-A-LONG-RANDOM-PASSWORD';
grant usage on schema public to nexper_drift;
grant select on public.app_migrations to nexper_drift;
-- app_migrations has row-level security on and no rules; this one lets only this login read it.
create policy "Drift check reads migrations" on public.app_migrations for select to nexper_drift using (true);
-- The structure (tables, columns, policies, functions) is readable by every login already.
-- The connection string for it is the same pooler address as the main one, with the user
-- name "nexper_drift.<project-ref>" instead of "postgres.<project-ref>".
