-- 038: support access sessions and append-only audit logs
--
-- Nexper staff may read a client's data only inside a "support session": a ticket
-- reference, a reason, one shop (or the whole company), at most 2 hours, every read
-- logged. The owner of the shop or company sees their sessions. The audit logs cannot be
-- changed or deleted by anyone who can reach the database through the API, not even the
-- server. See docs/MULTITENANT_DESIGN.md section 3.2 (task T08).

-- ---------- tables ----------
-- No foreign keys to shops or companies on purpose: the record must outlive a purged shop.
create table if not exists support_sessions (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null,
  admin_email text,
  org_id uuid not null,
  shop_id uuid,
  ticket_ref text not null check (char_length(ticket_ref) between 3 and 40),
  reason text not null check (char_length(reason) between 10 and 300),
  kind text not null check (kind in ('support', 'break_glass')),
  unmask_phones boolean not null default false,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  check (expires_at > started_at and expires_at <= started_at + interval '2 hours')
);
create index if not exists support_sessions_org_idx on support_sessions (org_id, started_at desc);
create index if not exists support_sessions_admin_idx on support_sessions (admin_id, started_at desc);

create table if not exists support_access_log (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  admin_id uuid not null,
  shop_id uuid,
  resource text not null,
  params jsonb,
  row_count integer,
  at timestamptz not null default now()
);
create index if not exists support_access_log_session_idx on support_access_log (session_id);
create index if not exists support_access_log_shop_idx on support_access_log (shop_id, at desc);

alter table support_sessions enable row level security;
alter table support_access_log enable row level security;

-- The owner of the company (or of the one shop) sees the sessions that touched their data.
drop policy if exists "Owners see support sessions" on support_sessions;
create policy "Owners see support sessions" on support_sessions for select
  using (is_org_owner(org_id) or (shop_id is not null and is_shop_owner(shop_id)));
-- No write policies and no write privileges: sessions are made and ended by the functions below.
-- The access log has no policies at all; owners see counts through support_session_summary().

-- ---------- append-only ----------
create or replace function audit_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('nexper.purging', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;

drop trigger if exists admin_audit_log_append_only on admin_audit_log;
create trigger admin_audit_log_append_only before update or delete on admin_audit_log
  for each row execute function audit_append_only();
drop trigger if exists support_access_log_append_only on support_access_log;
create trigger support_access_log_append_only before update or delete on support_access_log
  for each row execute function audit_append_only();

-- A session may only be ended (ended_at set once); nothing else about it changes, and it is never deleted.
create or replace function support_session_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('nexper.purging', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE'
     and old.ended_at is null and new.ended_at is not null
     and (new.id, new.admin_id, new.admin_email, new.org_id, new.shop_id, new.ticket_ref, new.reason, new.kind, new.unmask_phones, new.started_at, new.expires_at)
         is not distinct from
         (old.id, old.admin_id, old.admin_email, old.org_id, old.shop_id, old.ticket_ref, old.reason, old.kind, old.unmask_phones, old.started_at, old.expires_at) then
    return new;
  end if;
  raise exception 'support_sessions can only be ended, never changed or deleted' using errcode = '42501';
end $$;
drop trigger if exists support_sessions_guard on support_sessions;
create trigger support_sessions_guard before update or delete on support_sessions
  for each row execute function support_session_guard();

-- Nobody reaches these tables' rows with a write through the API, the server included.
revoke insert, update, delete, truncate on support_sessions, support_access_log from anon, authenticated, service_role;
revoke update, delete, truncate on admin_audit_log from anon, authenticated, service_role;

-- ---------- opening, checking, logging, ending (service role only) ----------
create or replace function support_open_session(
  p_admin uuid, p_email text, p_shop uuid, p_org uuid, p_ticket text, p_reason text,
  p_minutes integer default 60, p_kind text default 'support', p_unmask boolean default false)
returns support_sessions
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := p_org;
  r support_sessions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  if not exists (select 1 from platform_admins where user_id = p_admin) then raise exception 'Not allowed'; end if;
  if p_shop is not null then
    select org_id into v_org from shops where id = p_shop;
    if v_org is null then raise exception 'Shop not found'; end if;
    if p_org is not null and p_org <> v_org then raise exception 'That shop is not in that company'; end if;
  elsif v_org is null or not exists (select 1 from organisations where id = v_org) then
    raise exception 'Company not found';
  end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 120 then raise exception 'A session lasts 5 to 120 minutes'; end if;
  insert into support_sessions (admin_id, admin_email, org_id, shop_id, ticket_ref, reason, kind, unmask_phones, expires_at)
    values (p_admin, p_email, v_org, p_shop, trim(p_ticket), trim(p_reason), p_kind, coalesce(p_unmask, false), now() + make_interval(mins => p_minutes))
    returning * into r;
  return r;
end $$;

-- Raises unless the session belongs to this admin, is open, has not expired, and covers the shop.
create or replace function support_check(p_session uuid, p_admin uuid, p_shop uuid)
returns support_sessions
language plpgsql security definer set search_path = public as $$
declare
  s support_sessions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  select * into s from support_sessions where id = p_session;
  if not found or s.admin_id <> p_admin or s.ended_at is not null or s.expires_at <= now() then
    raise exception 'No open support session';
  end if;
  if s.shop_id is not null then
    if p_shop is distinct from s.shop_id then raise exception 'That shop is outside this support session'; end if;
  elsif not exists (select 1 from shops where id = p_shop and org_id = s.org_id) then
    raise exception 'That shop is outside this support session';
  end if;
  return s;
end $$;

-- Checks again and writes the log row. The caller returns data only if this succeeds.
create or replace function support_log_read(p_session uuid, p_admin uuid, p_shop uuid, p_resource text, p_params jsonb, p_rows integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform support_check(p_session, p_admin, p_shop);
  insert into support_access_log (session_id, admin_id, shop_id, resource, params, row_count)
    values (p_session, p_admin, p_shop, left(p_resource, 60), p_params, p_rows);
end $$;

create or replace function support_end_session(p_session uuid, p_admin uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  update support_sessions set ended_at = now() where id = p_session and admin_id = p_admin and ended_at is null;
end $$;

-- What the owner sees: every session that could touch their company, with how many screens were viewed.
create or replace function support_session_summary(p_org uuid)
returns table (id uuid, started_at timestamptz, expires_at timestamptz, ended_at timestamptz, admin_email text,
               ticket_ref text, reason text, kind text, shop_id uuid, shop_name text, views bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.started_at, s.expires_at, s.ended_at, s.admin_email, s.ticket_ref, s.reason, s.kind, s.shop_id,
         (select name from shops where shops.id = s.shop_id),
         (select count(*) from support_access_log l where l.session_id = s.id)
  from support_sessions s
  where s.org_id = p_org and is_org_owner(p_org)
  order by s.started_at desc
  limit 200;
$$;

-- Daily job: audit records are kept 2 years.
create or replace function purge_old_audit()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  c integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not allowed'; end if;
  perform set_config('nexper.purging', 'on', true);
  delete from support_access_log where at < now() - interval '2 years';
  get diagnostics c = row_count; n := n + c;
  delete from support_sessions where started_at < now() - interval '2 years';
  get diagnostics c = row_count; n := n + c;
  delete from admin_audit_log where created_at < now() - interval '2 years';
  get diagnostics c = row_count; n := n + c;
  return n;
end $$;

revoke all on function support_open_session(uuid, text, uuid, uuid, text, text, integer, text, boolean), support_check(uuid, uuid, uuid),
  support_log_read(uuid, uuid, uuid, text, jsonb, integer), support_end_session(uuid, uuid), purge_old_audit(),
  support_session_summary(uuid) from public, anon, authenticated;
grant execute on function support_open_session(uuid, text, uuid, uuid, text, text, integer, text, boolean), support_check(uuid, uuid, uuid),
  support_log_read(uuid, uuid, uuid, text, jsonb, integer), support_end_session(uuid, uuid), purge_old_audit() to service_role;
grant execute on function support_session_summary(uuid) to authenticated, service_role;

select record_migration('038', '038_support_access.sql');
