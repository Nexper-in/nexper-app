-- Kirana / multi-shop billing app — schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Mirrors the data model in PROJECT_BRIEF.md, ported from the working prototype.
--
-- Products and suppliers are OWNER-level master data, shared across every
-- shop that owner runs. shop_products/shop_suppliers are the per-shop
-- "instance" of a product/supplier. shop_members gives real, RLS-enforced
-- staff accounts: each worker is a genuine Supabase auth user (PIN as
-- their password, created server-side via app/api/staff/create) with
-- per-module permissions checked by every table's policies below, not
-- just hidden in the UI. shops.enabled_modules is a shop-level on/off
-- toggle per module, independent of per-worker permissions.
--
-- If you're upgrading an existing project instead of running this fresh,
-- use supabase/migrations/001_shared_catalog.sql and
-- supabase/migrations/002_staff_roles.sql instead.

create extension if not exists "uuid-ossp";

-- ---------- Shops ----------
-- One shop per owner, chosen at signup — see migrations/013_one_shop_per_owner.sql.
create table shops (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('kirana', 'supermarket', 'automobile', 'clothing', 'other')),
  gstin text,
  upi_id text,
  enabled_modules text[] not null default array[
    'dashboard','inventory','billing','history','credit','dayclose','expenses','cashbook','suppliers'
  ],
  theme text not null default 'light' check (theme in ('light', 'dark', 'warm')),
  created_at timestamptz not null default now()
);

-- ---------- Shop membership (owner + staff, with per-module permissions) ----------
create table shop_members (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  name text not null,
  staff_code text unique,          -- short login code for staff sign-in; null for owner rows
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);
create index shop_members_shop_id_idx on shop_members(shop_id);
create index shop_members_user_id_idx on shop_members(user_id);

-- ---------- Products (owner-level master catalog) ----------
create table products (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hindi_name text,
  barcode text,                   -- scanned via BarcodeDetector on the client
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
  code text,                      -- 2-digit quick-billing code, can differ per shop
  price numeric(12,2) not null,        -- selling price at this shop
  cost_price numeric(12,2),            -- purchase price at this shop
  gst numeric(4,2),                    -- percent, nullable = no GST (must stay optional per spec)
  stock numeric(12,3) not null default 0,
  low_at numeric(12,3) not null default 5,
  quick boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, product_id)
);
create index shop_products_shop_id_idx on shop_products(shop_id);
create index shop_products_product_id_idx on shop_products(product_id);

-- ---------- Stock batches (FIFO rotation + expiry tracking) ----------
-- Every stock-in becomes its own batch; shop_products.stock stays the
-- authoritative on-hand count, this is the parallel record of rotation
-- order. See migrations/010_stock_batches_fifo.sql for the full note.
create table stock_batches (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  shop_product_id uuid not null references shop_products(id) on delete cascade,
  qty_received numeric(12,3) not null,
  qty_remaining numeric(12,3) not null,
  cost_price numeric(12,2),
  received_date timestamptz not null default now(),
  expiry_date date,
  reason text not null default 'Purchase',
  supplier text,
  created_at timestamptz not null default now()
);
create index stock_batches_shop_id_idx on stock_batches(shop_id);
create index stock_batches_fifo_idx on stock_batches(shop_product_id, received_date);

-- ---------- Clearance offers (time-boxed % discounts) ----------
-- "Active" is purely start_date <= today <= end_date — no separate
-- enable flag or cron job. Billing reads the date range live, so an
-- offer auto-applies the day it starts and auto-reverts the day after
-- it ends. See migrations/011_clearance_offers.sql for the full note.
create table clearance_offers (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null default 'Clearance offer',
  discount_pct numeric(5,2) not null check (discount_pct > 0 and discount_pct <= 90),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now()
);
create index clearance_offers_shop_id_idx on clearance_offers(shop_id);

create table clearance_offer_items (
  id uuid primary key default uuid_generate_v4(),
  offer_id uuid not null references clearance_offers(id) on delete cascade,
  shop_product_id uuid not null references shop_products(id) on delete cascade,
  unique (offer_id, shop_product_id)
);
create index clearance_offer_items_offer_id_idx on clearance_offer_items(offer_id);
create index clearance_offer_items_shop_product_id_idx on clearance_offer_items(shop_product_id);

-- ---------- Stock movements (in/out log) ----------
create table movements (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  shop_product_id uuid references shop_products(id) on delete set null,
  item_name text not null,             -- denormalized so history survives item deletion
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
  items jsonb not null,                -- [{ shop_product_id, code, name, price, unit, gst, qty }, ...]
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

-- ---------- Cash reconciliation (Day Close) ----------
create table reconciliations (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  expected_cash numeric(12,2) not null,
  cash_counted numeric(12,2) not null,
  diff numeric(12,2) not null,
  date timestamptz not null default now()
);

-- ---------- Personal draws ----------
create table draws (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  amount numeric(12,2) not null,
  note text,
  date timestamptz not null default now()
);

-- ---------- Daily shop expenses ----------
create table expenses (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  category text not null,              -- Rent / Electricity / Staff salary / Transport / Maintenance / Subscription / Loan/EMI / Other
  amount numeric(12,2) not null,
  note text,
  date timestamptz not null default now()
);

-- ---------- Fixed monthly costs (standing recurring definitions —
-- rent, salaries, subscriptions — not tied to a single payment event,
-- unlike `expenses` above) ----------
create table fixed_expenses (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  category text not null,
  amount numeric(12,2) not null,
  due_day int not null check (due_day between 1 and 28),
  created_at timestamptz not null default now()
);
create index fixed_expenses_shop_id_idx on fixed_expenses(shop_id);

-- ---------- Suppliers (owner-level master, shared across shops) ----------
create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  items text,                          -- free-text description of what they supply
  created_at timestamptz not null default now()
);
create index suppliers_owner_id_idx on suppliers(owner_id);

-- ---------- Shop Suppliers (which shops a supplier serves) ----------
create table shop_suppliers (
  shop_id uuid not null references shops(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  owed numeric(12,2) not null default 0,  -- what this shop owes this supplier
  primary key (shop_id, supplier_id)
);

-- =========================================================
-- Helper functions (SECURITY DEFINER so they can read
-- shop_members/shops without recursing into the RLS policies
-- that call them).
-- =========================================================

create or replace function is_shop_member(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shop_members
    where shop_id = target_shop_id and user_id = auth.uid()
  );
$$;

create or replace function has_shop_permission(target_shop_id uuid, module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shop_members
    where shop_id = target_shop_id
      and user_id = auth.uid()
      and (role = 'owner' or (permissions->>module)::boolean is true)
  );
$$;

create or replace function is_shop_owner(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shop_members
    where shop_id = target_shop_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- For products/suppliers INSERT only (the row doesn't exist yet, so it
-- can't be linked via shop_products/shop_suppliers) — true if the caller
-- IS that owner, or is a member of some shop belonging to that owner
-- with the given permission (pass null to skip the permission check).
create or replace function owns_via_membership(target_owner_id uuid, required_permission text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_owner_id = auth.uid()
    or exists (
      select 1 from shops s
      join shop_members sm on sm.shop_id = s.id
      where s.owner_id = target_owner_id
        and sm.user_id = auth.uid()
        and (required_permission is null or sm.role = 'owner' or (sm.permissions->>required_permission)::boolean is true)
    );
$$;

-- For products/suppliers SELECT/UPDATE/DELETE: scoped to the specific
-- shop(s) the product/supplier is actually linked to, not just "any
-- shop this owner runs" — and requires the given permission for writes.
create or replace function product_linked_to_member_shop(target_product_id uuid, required_permission text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from shop_products sp
    join shop_members sm on sm.shop_id = sp.shop_id
    where sp.product_id = target_product_id
      and sm.user_id = auth.uid()
      and (required_permission is null or sm.role = 'owner' or (sm.permissions->>required_permission)::boolean is true)
  );
$$;

create or replace function supplier_linked_to_member_shop(target_supplier_id uuid, required_permission text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from shop_suppliers ss
    join shop_members sm on sm.shop_id = ss.shop_id
    where ss.supplier_id = target_supplier_id
      and sm.user_id = auth.uid()
      and (required_permission is null or sm.role = 'owner' or (sm.permissions->>required_permission)::boolean is true)
  );
$$;

-- =========================================================
-- Row Level Security — shops/products/suppliers are scoped by
-- ownership/membership directly; everything else is scoped
-- through the shop (and, for the "money" tables, gated by the
-- specific module permission a member holds — owners always
-- pass every permission check).
-- =========================================================

alter table shops enable row level security;
alter table shop_members enable row level security;
alter table products enable row level security;
alter table shop_products enable row level security;
alter table movements enable row level security;
alter table bills enable row level security;
alter table credits enable row level security;
alter table reconciliations enable row level security;
alter table draws enable row level security;
alter table expenses enable row level security;
alter table fixed_expenses enable row level security;
alter table stock_batches enable row level security;
alter table clearance_offers enable row level security;
alter table clearance_offer_items enable row level security;
alter table suppliers enable row level security;
alter table shop_suppliers enable row level security;

create policy "Members can view their shops" on shops for select
  using (owner_id = auth.uid() or is_shop_member(id));
create policy "Owners can insert shops" on shops for insert
  with check (owner_id = auth.uid());
create policy "Owners can update their shops" on shops for update
  using (is_shop_owner(id)) with check (is_shop_owner(id));
create policy "Owners can delete their shops" on shops for delete
  using (is_shop_owner(id));

create policy "Members can view their shop roster" on shop_members for select
  using (is_shop_member(shop_id));
create policy "Owners can add shop members" on shop_members for insert
  with check (
    is_shop_owner(shop_id)
    or exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid())
  );
create policy "Owners can update staff members" on shop_members for update
  using (is_shop_owner(shop_id) and role = 'staff')
  with check (is_shop_owner(shop_id) and role = 'staff');
create policy "Owners can remove staff members" on shop_members for delete
  using (is_shop_owner(shop_id) and role = 'staff');

create policy "Members can view products" on products for select
  using (owner_id = auth.uid() or product_linked_to_member_shop(id));
create policy "Members with inventory permission can insert products" on products for insert
  with check (owns_via_membership(owner_id, 'inventory'));
create policy "Members with inventory permission can update products" on products for update
  using (owner_id = auth.uid() or product_linked_to_member_shop(id, 'inventory'))
  with check (owner_id = auth.uid() or product_linked_to_member_shop(id, 'inventory'));
create policy "Members with inventory permission can delete products" on products for delete
  using (owner_id = auth.uid() or product_linked_to_member_shop(id, 'inventory'));

create policy "Members can view suppliers" on suppliers for select
  using (owner_id = auth.uid() or supplier_linked_to_member_shop(id));
create policy "Members with suppliers permission can insert" on suppliers for insert
  with check (owns_via_membership(owner_id, 'suppliers'));
create policy "Members with suppliers permission can update" on suppliers for update
  using (owner_id = auth.uid() or supplier_linked_to_member_shop(id, 'suppliers'))
  with check (owner_id = auth.uid() or supplier_linked_to_member_shop(id, 'suppliers'));
create policy "Members with suppliers permission can delete" on suppliers for delete
  using (owner_id = auth.uid() or supplier_linked_to_member_shop(id, 'suppliers'));

create policy "Members can view shop_products" on shop_products for select
  using (is_shop_member(shop_id));
create policy "Members with inventory permission can insert shop_products" on shop_products for insert
  with check (has_shop_permission(shop_id, 'inventory'));
create policy "Members with inventory permission can update shop_products" on shop_products for update
  using (has_shop_permission(shop_id, 'inventory')) with check (has_shop_permission(shop_id, 'inventory'));
create policy "Members with inventory permission can delete shop_products" on shop_products for delete
  using (has_shop_permission(shop_id, 'inventory'));

create policy "Members can view shop_suppliers" on shop_suppliers for select
  using (is_shop_member(shop_id));
create policy "Members with suppliers permission can insert shop_suppliers" on shop_suppliers for insert
  with check (has_shop_permission(shop_id, 'suppliers'));
create policy "Members with suppliers permission can delete shop_suppliers" on shop_suppliers for delete
  using (has_shop_permission(shop_id, 'suppliers'));
create policy "Members with suppliers permission can update shop_suppliers" on shop_suppliers for update
  using (has_shop_permission(shop_id, 'suppliers')) with check (has_shop_permission(shop_id, 'suppliers'));

create policy "Members can view movements" on movements for select
  using (is_shop_member(shop_id));
create policy "Members with inventory permission can insert movements" on movements for insert
  with check (has_shop_permission(shop_id, 'inventory'));

create policy "Members can view bills" on bills for select
  using (is_shop_member(shop_id));
create policy "Members with billing permission can insert bills" on bills for insert
  with check (has_shop_permission(shop_id, 'billing'));

create policy "Members can view credits" on credits for select
  using (is_shop_member(shop_id));
create policy "Members with credit permission can insert credits" on credits for insert
  with check (has_shop_permission(shop_id, 'credit'));

create policy "Members can view reconciliations" on reconciliations for select
  using (is_shop_member(shop_id));
create policy "Members with dayclose permission can insert reconciliations" on reconciliations for insert
  with check (has_shop_permission(shop_id, 'dayclose'));

create policy "Members can view draws" on draws for select
  using (is_shop_member(shop_id));
create policy "Members with dayclose permission can insert draws" on draws for insert
  with check (has_shop_permission(shop_id, 'dayclose'));

create policy "Members can view expenses" on expenses for select
  using (is_shop_member(shop_id));
create policy "Members with expenses permission can insert expenses" on expenses for insert
  with check (has_shop_permission(shop_id, 'expenses'));

create policy "Members can view fixed_expenses" on fixed_expenses for select
  using (is_shop_member(shop_id));
create policy "Members with expenses permission can insert fixed_expenses" on fixed_expenses for insert
  with check (has_shop_permission(shop_id, 'expenses'));
create policy "Members with expenses permission can update fixed_expenses" on fixed_expenses for update
  using (has_shop_permission(shop_id, 'expenses')) with check (has_shop_permission(shop_id, 'expenses'));
create policy "Members with expenses permission can delete fixed_expenses" on fixed_expenses for delete
  using (has_shop_permission(shop_id, 'expenses'));

-- Read-only for clients — every write goes through sell_items()/
-- adjust_stock() below.
create policy "Members can view stock_batches" on stock_batches for select
  using (is_shop_member(shop_id));

-- Any member can view (billing needs to price against active offers);
-- only the owner manages them.
create policy "Members can view clearance_offers" on clearance_offers for select
  using (is_shop_member(shop_id));
create policy "Owners can insert clearance_offers" on clearance_offers for insert
  with check (is_shop_owner(shop_id));
create policy "Owners can delete clearance_offers" on clearance_offers for delete
  using (is_shop_owner(shop_id));

create policy "Members can view clearance_offer_items" on clearance_offer_items for select
  using (exists (select 1 from clearance_offers co where co.id = offer_id and is_shop_member(co.shop_id)));
create policy "Owners can insert clearance_offer_items" on clearance_offer_items for insert
  with check (exists (select 1 from clearance_offers co where co.id = offer_id and is_shop_owner(co.shop_id)));
create policy "Owners can delete clearance_offer_items" on clearance_offer_items for delete
  using (exists (select 1 from clearance_offers co where co.id = offer_id and is_shop_owner(co.shop_id)));

-- =========================================================
-- Atomic stock operations — see migrations/005_atomic_stock_functions.sql
-- for the full explanation of why these are SECURITY DEFINER with an
-- explicit permission check, instead of plain client-side updates.
-- =========================================================

create or replace function sell_items(p_shop_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
  current_stock numeric;
  v_shop_product_id uuid;
  v_qty numeric;
  remaining_to_consume numeric;
  batch record;
  consume_qty numeric;
begin
  if not has_shop_permission(p_shop_id, 'billing') then
    raise exception 'not permitted to bill for this shop';
  end if;

  for line in select * from jsonb_array_elements(p_lines) loop
    v_shop_product_id := (line->>'shop_product_id')::uuid;
    v_qty := (line->>'qty')::numeric;

    select stock into current_stock from shop_products
      where id = v_shop_product_id and shop_id = p_shop_id
      for update;

    if current_stock is null then
      raise exception 'item % not found in this shop', line->>'shop_product_id';
    end if;

    update shop_products
      set stock = greatest(0, current_stock - v_qty)
      where id = v_shop_product_id;

    insert into movements (shop_id, shop_product_id, item_name, type, qty, reason)
      values (p_shop_id, v_shop_product_id, line->>'name', 'out', v_qty, 'sale');

    -- FIFO: consume oldest batches first for this line.
    remaining_to_consume := v_qty;
    for batch in
      select id, qty_remaining from stock_batches
        where shop_product_id = v_shop_product_id and qty_remaining > 0
        order by received_date asc
        for update
    loop
      exit when remaining_to_consume <= 0;
      consume_qty := least(batch.qty_remaining, remaining_to_consume);
      update stock_batches set qty_remaining = qty_remaining - consume_qty where id = batch.id;
      remaining_to_consume := remaining_to_consume - consume_qty;
    end loop;
  end loop;
end;
$$;

create or replace function adjust_stock(
  p_shop_id uuid,
  p_shop_product_id uuid,
  p_type text,
  p_qty numeric,
  p_reason text,
  p_supplier text default null,
  p_expiry_date date default null
)
returns shop_products
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stock numeric;
  item_name text;
  item_cost numeric;
  updated shop_products;
  remaining_to_consume numeric;
  batch record;
  consume_qty numeric;
begin
  if not has_shop_permission(p_shop_id, 'inventory') then
    raise exception 'not permitted to adjust inventory for this shop';
  end if;
  if p_type not in ('in', 'out') then
    raise exception 'type must be in or out';
  end if;

  select sp.stock, sp.cost_price, p.name into current_stock, item_cost, item_name
    from shop_products sp
    join products p on p.id = sp.product_id
    where sp.id = p_shop_product_id and sp.shop_id = p_shop_id
    for update of sp;

  if current_stock is null then
    raise exception 'item not found in this shop';
  end if;

  update shop_products
    set stock = case when p_type = 'in' then current_stock + p_qty
                     else greatest(0, current_stock - p_qty) end
    where id = p_shop_product_id
    returning * into updated;

  insert into movements (shop_id, shop_product_id, item_name, type, qty, reason, supplier)
    values (p_shop_id, p_shop_product_id, item_name, p_type, p_qty, p_reason, p_supplier);

  if p_type = 'in' then
    insert into stock_batches (shop_id, shop_product_id, qty_received, qty_remaining, cost_price, expiry_date, reason, supplier)
      values (p_shop_id, p_shop_product_id, p_qty, p_qty, item_cost, p_expiry_date, p_reason, p_supplier);
  else
    remaining_to_consume := p_qty;
    for batch in
      select id, qty_remaining from stock_batches
        where shop_product_id = p_shop_product_id and qty_remaining > 0
        order by received_date asc
        for update
    loop
      exit when remaining_to_consume <= 0;
      consume_qty := least(batch.qty_remaining, remaining_to_consume);
      update stock_batches set qty_remaining = qty_remaining - consume_qty where id = batch.id;
      remaining_to_consume := remaining_to_consume - consume_qty;
    end loop;
  end if;

  return updated;
end;
$$;

grant execute on function sell_items(uuid, jsonb) to authenticated;
grant execute on function adjust_stock(uuid, uuid, text, numeric, text, text, date) to authenticated;

-- =========================================================
-- Platform admin — see migrations/006_platform_admin.sql for the full
-- explanation. Separate from shop owner/staff; a global role for
-- managing Nexper itself, not scoped to any shop.
-- =========================================================

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

grant execute on function is_platform_admin() to authenticated;

-- Admin-driven ownership transfer — see migrations/007 for why this is
-- NOT granted to `authenticated`. Only callable via the service-role
-- key (app/api/admin/transfer-ownership), which does its own
-- requireAdmin() check before ever reaching this function.
create or replace function admin_transfer_shop_ownership(p_shop_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_owner_id uuid;
begin
  select owner_id into v_old_owner_id from shops where id = p_shop_id;
  if v_old_owner_id is null then
    raise exception 'shop not found';
  end if;

  if v_old_owner_id = p_new_owner_id then
    raise exception 'that member is already the owner';
  end if;

  if not exists (select 1 from shop_members where shop_id = p_shop_id and user_id = p_new_owner_id) then
    raise exception 'target user is not a member of this shop';
  end if;

  update shops set owner_id = p_new_owner_id where id = p_shop_id;
  update shop_members set role = 'staff' where shop_id = p_shop_id and user_id = v_old_owner_id;
  update shop_members set role = 'owner' where shop_id = p_shop_id and user_id = p_new_owner_id;
end;
$$;
