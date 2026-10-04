-- 030: Supplies (tea shops, canteens, small hotels that supply regular places)
--
-- A shop that carries tea and biscuits to the departments of a hospital, or
-- food to offices, records each day how many of each item went to which
-- "department" (supply point), then settles the account daily, weekly or
-- monthly. Three tables, all shared by every shop and separated by shop_id like
-- the rest of the app (row-level security):
--   supply_points    the departments / places that are supplied
--   supply_entries   quantity of one item supplied to one point on one day
--   supply_payments  money received from a point
-- Quantities are written only through save_supply_round(), which checks the
-- caller, takes the price from the shop's own item (a browser cannot set it)
-- and keeps the price that applied on the day.
--
-- Also adds the 'canteen' shop type. Run in the Supabase SQL editor after
-- 001-029. Safe to run more than once.

-- ---------- shop type ----------
alter table shops drop constraint if exists shops_type_check;
alter table shops add constraint shops_type_check
  check (type in ('kirana', 'supermarket', 'automobile', 'clothing', 'canteen', 'other'));

-- ---------- tables ----------
create table if not exists supply_points (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  phone text check (phone is null or char_length(phone) <= 20),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists supply_points_shop_name_idx on supply_points (shop_id, lower(name));
create index if not exists supply_points_shop_idx on supply_points (shop_id);

create table if not exists supply_entries (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  point_id uuid not null references supply_points(id) on delete cascade,
  shop_product_id uuid references shop_products(id) on delete set null,
  item_name text not null,                 -- kept even if the item is later removed
  unit_price numeric(10,2) not null check (unit_price >= 0),  -- price on that day
  qty integer not null check (qty > 0 and qty <= 10000),
  entry_date date not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists supply_entries_one_per_day_idx
  on supply_entries (point_id, entry_date, shop_product_id) where shop_product_id is not null;
create index if not exists supply_entries_shop_date_idx on supply_entries (shop_id, entry_date);
create index if not exists supply_entries_point_date_idx on supply_entries (point_id, entry_date);

create table if not exists supply_payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  point_id uuid not null references supply_points(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount < 10000000),
  paid_on date not null default current_date,
  method text not null default 'cash' check (method in ('cash', 'upi', 'other')),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists supply_payments_shop_idx on supply_payments (shop_id, paid_on);
create index if not exists supply_payments_point_idx on supply_payments (point_id);

-- ---------- row-level security ----------
-- Everything here needs the 'supplies' permission (owners always have it), so a
-- staff member who only does billing cannot read what departments owe.
alter table supply_points enable row level security;
alter table supply_entries enable row level security;
alter table supply_payments enable row level security;

drop policy if exists "Supplies members view points" on supply_points;
create policy "Supplies members view points" on supply_points for select
  using (has_shop_permission(shop_id, 'supplies'));
drop policy if exists "Supplies members add points" on supply_points;
create policy "Supplies members add points" on supply_points for insert
  with check (has_shop_permission(shop_id, 'supplies'));
drop policy if exists "Supplies members edit points" on supply_points;
create policy "Supplies members edit points" on supply_points for update
  using (has_shop_permission(shop_id, 'supplies')) with check (has_shop_permission(shop_id, 'supplies'));
-- No delete policy on purpose: a department with history is switched off
-- (active = false), never removed, so old statements stay correct.

-- Entries are read directly but written only by save_supply_round().
drop policy if exists "Supplies members view entries" on supply_entries;
create policy "Supplies members view entries" on supply_entries for select
  using (has_shop_permission(shop_id, 'supplies'));

drop policy if exists "Supplies members view payments" on supply_payments;
create policy "Supplies members view payments" on supply_payments for select
  using (has_shop_permission(shop_id, 'supplies'));
drop policy if exists "Supplies members add payments" on supply_payments;
create policy "Supplies members add payments" on supply_payments for insert
  with check (
    has_shop_permission(shop_id, 'supplies')
    and exists (select 1 from supply_points sp where sp.id = supply_payments.point_id and sp.shop_id = supply_payments.shop_id)
  );
-- Only the owner may undo a payment.
drop policy if exists "Owner deletes payments" on supply_payments;
create policy "Owner deletes payments" on supply_payments for delete
  using (is_shop_owner(shop_id));

-- A point must belong to the same shop as the row that names it.
create or replace function check_supply_point_shop()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from supply_points where id = new.point_id and shop_id = new.shop_id) then
    raise exception 'Department is not in this shop';
  end if;
  return new;
end $$;
drop trigger if exists supply_entries_same_shop on supply_entries;
create trigger supply_entries_same_shop before insert or update on supply_entries
  for each row execute function check_supply_point_shop();

-- ---------- save a day's round ----------
-- p_rows: [{ "point_id": uuid, "shop_product_id": uuid, "qty": int }, ...]
-- qty 0 removes that line. Sets (not adds) the quantity for the day, so saving
-- the same day again corrects it instead of doubling it.
create or replace function save_supply_round(p_shop uuid, p_date date, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_point uuid;
  v_item uuid;
  v_qty integer;
  v_name text;
  v_price numeric;
begin
  if auth.uid() is null or not has_shop_permission(p_shop, 'supplies') then
    raise exception 'Not allowed';
  end if;
  if p_date is null or p_date < current_date - 366 or p_date > current_date + 1 then
    raise exception 'Date is out of range';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 600 then
    raise exception 'Bad request';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_point := (r->>'point_id')::uuid;
    v_item := (r->>'shop_product_id')::uuid;
    v_qty := (r->>'qty')::integer;
    if v_qty is null or v_qty < 0 or v_qty > 10000 then
      raise exception 'Bad quantity';
    end if;
    if not exists (select 1 from supply_points where id = v_point and shop_id = p_shop) then
      raise exception 'Unknown department';
    end if;
    select p.name, sp.price into v_name, v_price
      from shop_products sp join products p on p.id = sp.product_id
      where sp.id = v_item and sp.shop_id = p_shop;
    if not found then
      raise exception 'Unknown item';
    end if;

    if v_qty = 0 then
      delete from supply_entries
        where point_id = v_point and entry_date = p_date and shop_product_id = v_item and shop_id = p_shop;
    else
      insert into supply_entries (shop_id, point_id, shop_product_id, item_name, unit_price, qty, entry_date)
        values (p_shop, v_point, v_item, v_name, v_price, v_qty, p_date)
      on conflict (point_id, entry_date, shop_product_id) where shop_product_id is not null
        do update set qty = excluded.qty, updated_at = now();
    end if;
  end loop;
end $$;

revoke all on function save_supply_round(uuid, date, jsonb) from public, anon;
grant execute on function save_supply_round(uuid, date, jsonb) to authenticated, service_role;

-- ---------- what each department owes, all time ----------
-- Runs as the caller, so the policies above apply: a member without the
-- 'supplies' permission gets nothing back.
create or replace function supply_balances(p_shop uuid)
returns table (point_id uuid, charged numeric, paid numeric, last_date date)
language sql
stable
set search_path = public
as $$
  select sp.id,
         coalesce(e.charged, 0),
         coalesce(pay.paid, 0),
         e.last_date
  from supply_points sp
  left join (
    select point_id, sum(qty * unit_price) as charged, max(entry_date) as last_date
    from supply_entries where shop_id = p_shop group by point_id
  ) e on e.point_id = sp.id
  left join (
    select point_id, sum(amount) as paid
    from supply_payments where shop_id = p_shop group by point_id
  ) pay on pay.point_id = sp.id
  where sp.shop_id = p_shop;
$$;

revoke all on function supply_balances(uuid) from public, anon;
grant execute on function supply_balances(uuid) to authenticated, service_role;

-- ---------- what a department owed before a date (for statements) ----------
create or replace function supply_opening(p_point uuid, p_before date)
returns numeric
language sql
stable
set search_path = public
as $$
  select coalesce((select sum(qty * unit_price) from supply_entries where point_id = p_point and entry_date < p_before), 0)
       - coalesce((select sum(amount) from supply_payments where point_id = p_point and paid_on < p_before), 0);
$$;

revoke all on function supply_opening(uuid, date) from public, anon;
grant execute on function supply_opening(uuid, date) to authenticated, service_role;
