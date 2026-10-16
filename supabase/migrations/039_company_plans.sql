-- 039: plans, expiry, limits and feature overrides belong to the COMPANY
--
-- A chain pays for one subscription, not one per shop. org_controls holds, per company, the
-- plan, when it ends, limits, feature overrides, billing details and where it is hosted.
-- Per-shop controls (tenant_controls) stay as support overrides. Nothing changes for anyone
-- on the day this runs: no company has a plan set, so every shop keeps evaluating as before.
-- Evaluation order (lib/platformConfig.js): shop override, company, legacy shop plan, free.
-- AI scans are counted per company (ai_usage.org_id). See docs/MULTITENANT_DESIGN.md 3.1.

create table if not exists org_controls (
  org_id uuid primary key references organisations(id) on delete cascade,
  plan text check (plan in ('free', 'pro')),
  plan_expires_at timestamptz,
  limits jsonb not null default '{}'::jsonb,
  feature_overrides jsonb not null default '{}'::jsonb,
  billing_name text check (billing_name is null or char_length(billing_name) <= 120),
  billing_gstin text check (billing_gstin is null or billing_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  billing_email text check (billing_email is null or char_length(billing_email) <= 160),
  deployment text not null default 'shared' check (char_length(deployment) between 1 and 40),
  notes text check (notes is null or char_length(notes) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table org_controls enable row level security;
drop policy if exists "Company members read their company controls" on org_controls;
create policy "Company members read their company controls" on org_controls for select
  using (is_org_member(org_id));
-- No write policies: the platform admin writes through the server (service role).

-- Every company has a row (plan empty = follow the shop's own plan, as today).
insert into org_controls (org_id) select id from organisations on conflict do nothing;

create or replace function org_controls_for_new_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into org_controls (org_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists organisations_controls_trg on organisations;
create trigger organisations_controls_trg after insert on organisations
  for each row execute function org_controls_for_new_org();

-- ---------- AI scans are counted per company ----------
alter table ai_usage add column if not exists org_id uuid;
update ai_usage u set org_id = s.org_id from shops s where s.id = u.shop_id and u.org_id is null;

create or replace function ai_usage_set_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    select org_id into new.org_id from shops where id = new.shop_id;
  end if;
  return new;
end $$;
drop trigger if exists ai_usage_org_trg on ai_usage;
create trigger ai_usage_org_trg before insert on ai_usage
  for each row execute function ai_usage_set_org();

create index if not exists ai_usage_org_month_idx on ai_usage (org_id, created_at desc);

select record_migration('039', '039_company_plans.sql');
