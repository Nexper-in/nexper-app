-- Migrates an existing Nexper project from shop-scoped items/suppliers
-- to the shared owner-level catalog (products/shop_products,
-- suppliers/shop_suppliers). Run this in the Supabase SQL editor.
--
-- This is a RESET, not a data-preserving migration: it drops items,
-- suppliers, movements, bills, and credits and recreates them in the new
-- shape. `shops` (and reconciliations/draws/expenses, which don't
-- reference items) are left untouched. Only run this if you're OK
-- losing existing items/bills/movements/credits/suppliers test data —
-- reseed afterwards with scripts/reseed-shop-products.mjs.

drop table if exists movements cascade;
drop table if exists bills cascade;
drop table if exists credits cascade;
drop table if exists items cascade;
drop table if exists suppliers cascade;

-- ---------- Products (owner-level master catalog) ----------
create table products (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hindi_name text,
  barcode text,
  image_url text,
  category text not null default 'General',
  unit text not null default 'pcs' check (unit in ('pcs','kg','g','l','ml','packet')),
  created_at timestamptz not null default now()
);
create index products_owner_id_idx on products(owner_id);

-- ---------- Shop Products (per-shop price/stock for a product) ----------
create table shop_products (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  code text,
  price numeric(12,2) not null,
  cost_price numeric(12,2),
  gst numeric(4,2),
  stock numeric(12,3) not null default 0,
  low_at numeric(12,3) not null default 5,
  quick boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, product_id)
);
create index shop_products_shop_id_idx on shop_products(shop_id);
create index shop_products_product_id_idx on shop_products(product_id);

-- ---------- Stock movements ----------
create table movements (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  shop_product_id uuid references shop_products(id) on delete set null,
  item_name text not null,
  type text not null check (type in ('in','out')),
  qty numeric(12,3) not null,
  reason text not null,
  supplier text,
  date timestamptz not null default now()
);
create index movements_shop_id_idx on movements(shop_id);

-- ---------- Bills ----------
create table bills (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  bill_no text not null,
  customer_name text,
  customer_phone text,
  items jsonb not null,
  subtotal numeric(12,2) not null,
  discount_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  payment_type text not null default 'cash' check (payment_type in ('cash','credit')),
  date timestamptz not null default now()
);
create index bills_shop_id_idx on bills(shop_id);
create index bills_customer_phone_idx on bills(customer_phone);

-- ---------- Udhaar (credit) ledger ----------
create table credits (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  phone text not null,
  name text not null,
  amount numeric(12,2) not null,
  type text not null check (type in ('charge','payment')),
  note text,
  date timestamptz not null default now()
);
create index credits_shop_id_idx on credits(shop_id);
create index credits_phone_idx on credits(phone);

-- ---------- Suppliers (owner-level master, shared across shops) ----------
create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  items text,
  created_at timestamptz not null default now()
);
create index suppliers_owner_id_idx on suppliers(owner_id);

-- ---------- Shop Suppliers (which shops a supplier serves) ----------
create table shop_suppliers (
  shop_id uuid not null references shops(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  primary key (shop_id, supplier_id)
);

-- ---------- RLS ----------
alter table products enable row level security;
alter table shop_products enable row level security;
alter table movements enable row level security;
alter table bills enable row level security;
alter table credits enable row level security;
alter table suppliers enable row level security;
alter table shop_suppliers enable row level security;

create policy "Owners manage their own products"
  on products for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage their own suppliers"
  on suppliers for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "Owners manage their own shop_products" on shop_products for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));

create policy "Owners manage their own shop_suppliers" on shop_suppliers for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));

create policy "Owners manage their own movements" on movements for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));

create policy "Owners manage their own bills" on bills for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));

create policy "Owners manage their own credits" on credits for all
  using (shop_id in (select id from shops where owner_id = auth.uid()))
  with check (shop_id in (select id from shops where owner_id = auth.uid()));
