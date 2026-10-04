-- 031: ready for big shops, and put purchase orders under version control
--
-- 1. Indexes for the questions the app asks of big tables ("this shop, newest
--    first", "this shop, this month"). Without them a shop with years of bills
--    sorts every bill on every screen. Tested on a synthetic shop with 150,000
--    bills: see tests/db/scale.mjs.
-- 2. purchase_orders and purchase_order_items were only ever created from a SQL
--    snippet shown inside the app, so no migration, test or fresh install had
--    them. They are tracked here with the same rules as before (owner only),
--    safe to run when they already exist.
-- 3. Platform totals for the admin page are computed in the database instead of
--    downloading every bill of every shop.
--
-- Run in the Supabase SQL editor after 001-030. Safe to run more than once.
-- On a large live database the indexes take a moment to build; run it when the
-- shops are quiet.

-- ---------- 1. indexes ----------
create index if not exists bills_shop_date_idx on bills (shop_id, date desc);
create index if not exists movements_shop_date_idx on movements (shop_id, date desc);
create index if not exists credits_shop_date_idx on credits (shop_id, date desc);
create index if not exists credits_shop_phone_idx on credits (shop_id, phone);
create index if not exists expenses_shop_date_idx on expenses (shop_id, date desc);
create index if not exists draws_shop_date_idx on draws (shop_id, date desc);
create index if not exists reconciliations_shop_date_idx on reconciliations (shop_id, date desc);
-- Expiry screen and Home "expiring soon": only batches that still have stock.
create index if not exists stock_batches_expiry_idx on stock_batches (shop_id, expiry_date)
  where qty_remaining > 0 and expiry_date is not null;

-- ---------- 2. purchase orders ----------
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops(id) on delete cascade not null,
  supplier_id uuid references suppliers(id) on delete set null,
  supplier_name text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'received')),
  expected_date date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id) on delete cascade not null,
  shop_product_id uuid references shop_products(id) on delete set null,
  item_name text not null,
  item_code text,
  qty numeric not null default 1,
  unit_price numeric,
  unit text default 'pcs'
);

alter table purchase_orders enable row level security;
alter table purchase_order_items enable row level security;

drop policy if exists "po_owner" on purchase_orders;
create policy "po_owner" on purchase_orders for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));

drop policy if exists "po_items_owner" on purchase_order_items;
create policy "po_items_owner" on purchase_order_items for all
  using (po_id in (select po.id from purchase_orders po join shops s on po.shop_id = s.id where s.owner_id = auth.uid()))
  with check (po_id in (select po.id from purchase_orders po join shops s on po.shop_id = s.id where s.owner_id = auth.uid()));

create index if not exists purchase_orders_shop_idx on purchase_orders (shop_id, created_at desc);
create index if not exists purchase_order_items_po_idx on purchase_order_items (po_id);

-- ---------- 3. platform totals for the admin page ----------
-- Called only by the server (service role). One row per shop.
create or replace function admin_shop_stats()
returns table (shop_id uuid, bill_count bigint, bill_total numeric, last_bill_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.shop_id, count(*), coalesce(sum(b.total), 0), max(b.date) from bills b group by b.shop_id;
$$;

create or replace function admin_udhaar_outstanding()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(case when type = 'charge' then amount else -amount end), 0) from credits;
$$;

revoke all on function admin_shop_stats() from public, anon, authenticated;
revoke all on function admin_udhaar_outstanding() from public, anon, authenticated;
grant execute on function admin_shop_stats() to service_role;
grant execute on function admin_udhaar_outstanding() to service_role;
