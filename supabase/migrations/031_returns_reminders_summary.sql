-- 031: sales returns, automatic udhaar reminders, nightly summary
--
-- Run in the Supabase SQL editor after 001-030. Safe to run more than once.
--
-- 1. sale_returns: one row per return against a bill. Written only by
--    process_return(), which restocks the items, records the refund and (for
--    udhaar) reduces what the customer owes, all in one transaction.
-- 2. credits.return_id: marks an udhaar adjustment that came from a return,
--    so the Cashbook and Day close do not count it as cash received.
-- 3. shops notification settings (owner's phone, summary on/off, reminder
--    rules) and reminder_log (who was reminded when, so nobody is nagged).

-- ---------- sale_returns ----------
create table if not exists sale_returns (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  bill_id uuid references bills(id) on delete set null,
  bill_no text not null,                     -- kept even if the bill is removed
  items jsonb not null,                      -- [{ shop_product_id, name, unit, price, gst, qty, amount }]
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  refund_method text not null check (refund_method in ('cash', 'upi', 'card', 'bank', 'credit')),
  customer_name text,
  customer_phone text,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid(),
  date timestamptz not null default now()
);
create index if not exists sale_returns_shop_date_idx on sale_returns (shop_id, date);
create index if not exists sale_returns_bill_idx on sale_returns (bill_id);

alter table sale_returns enable row level security;
drop policy if exists "Members can view sale_returns" on sale_returns;
create policy "Members can view sale_returns" on sale_returns for select
  using (is_shop_member(shop_id));
-- No insert/update/delete policy on purpose: returns are written only by
-- process_return() below and are never edited, so reports stay correct.

alter table credits add column if not exists return_id uuid references sale_returns(id) on delete set null;

-- ---------- process_return ----------
-- p_lines: [{ "shop_product_id": "...", "qty": 1 }, ...]
-- Refund per line = qty x the price on the bill, scaled by the bill's own
-- discount (total / subtotal), so a discounted bill never refunds more than
-- the customer actually paid.
create or replace function process_return(
  p_shop_id uuid,
  p_bill_id uuid,
  p_lines jsonb,
  p_refund_method text,
  p_note text default null
)
returns sale_returns
language plpgsql
security definer
set search_path = public
as $$
declare
  b bills;
  ratio numeric;
  line jsonb;
  req_qty numeric;
  pid uuid;
  sold_qty numeric;
  back_qty numeric;
  unit_price numeric;
  unit_gst numeric;
  unit_name text;
  unit_label text;
  line_amount numeric;
  total_refund numeric := 0;
  out_items jsonb := '[]'::jsonb;
  cur_stock numeric;
  item_cost numeric;
  r sale_returns;
begin
  if not has_shop_permission(p_shop_id, 'billing') then
    raise exception 'not permitted to take returns for this shop';
  end if;
  if p_refund_method not in ('cash', 'upi', 'card', 'bank', 'credit') then
    raise exception 'unknown refund method';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'pick at least one item to return';
  end if;

  select * into b from bills where id = p_bill_id and shop_id = p_shop_id for update;
  if not found then
    raise exception 'bill not found in this shop';
  end if;

  if b.payment_type = 'credit' and p_refund_method <> 'credit' then
    raise exception 'This bill was on udhaar, so the refund must reduce the customer''s balance';
  end if;
  if p_refund_method = 'credit' and coalesce(b.customer_phone, '') = '' then
    raise exception 'Add the customer''s phone number on the bill to reduce their udhaar';
  end if;

  ratio := case when b.subtotal > 0 then b.total / b.subtotal else 1 end;

  for line in select * from jsonb_array_elements(p_lines) loop
    pid := (line->>'shop_product_id')::uuid;
    req_qty := (line->>'qty')::numeric;
    if req_qty is null or req_qty <= 0 then
      raise exception 'return quantity must be more than zero';
    end if;

    select coalesce(sum((it->>'qty')::numeric), 0),
           max((it->>'price')::numeric),
           max(coalesce((it->>'gst')::numeric, 0)),
           max(it->>'name'),
           max(coalesce(it->>'unit', ''))
      into sold_qty, unit_price, unit_gst, unit_name, unit_label
      from jsonb_array_elements(b.items) it
      where it->>'shop_product_id' = pid::text;
    if sold_qty = 0 then
      raise exception 'that item is not on this bill';
    end if;

    select coalesce(sum((ri->>'qty')::numeric), 0) into back_qty
      from sale_returns sr, jsonb_array_elements(sr.items) ri
      where sr.bill_id = b.id and ri->>'shop_product_id' = pid::text;

    if req_qty > sold_qty - back_qty then
      raise exception 'Only % of % can still be returned from this bill', (sold_qty - back_qty), unit_name;
    end if;

    line_amount := round(req_qty * unit_price * ratio, 2);
    total_refund := total_refund + line_amount;
    out_items := out_items || jsonb_build_object(
      'shop_product_id', pid, 'name', unit_name, 'unit', unit_label,
      'price', round(unit_price * ratio, 2), 'gst', unit_gst, 'qty', req_qty, 'amount', line_amount
    );

    -- Put the goods back on the shelf.
    select sp.stock, sp.cost_price into cur_stock, item_cost
      from shop_products sp where sp.id = pid and sp.shop_id = p_shop_id for update;
    if cur_stock is not null then
      update shop_products set stock = cur_stock + req_qty where id = pid;
      insert into movements (shop_id, shop_product_id, item_name, type, qty, reason)
        values (p_shop_id, pid, unit_name, 'in', req_qty, 'Return');
      insert into stock_batches (shop_id, shop_product_id, qty_received, qty_remaining, cost_price, reason)
        values (p_shop_id, pid, req_qty, req_qty, item_cost, 'Return');
    end if;
  end loop;

  insert into sale_returns (shop_id, bill_id, bill_no, items, refund_amount, refund_method, customer_name, customer_phone, note)
    values (p_shop_id, b.id, b.bill_no, out_items, total_refund, p_refund_method, b.customer_name, b.customer_phone, nullif(trim(p_note), ''))
    returning * into r;

  if p_refund_method = 'credit' then
    insert into credits (shop_id, phone, name, amount, type, note, return_id)
      values (p_shop_id, b.customer_phone, coalesce(b.customer_name, 'Customer'), total_refund, 'payment', 'Return - bill ' || b.bill_no, r.id);
  end if;

  return r;
end;
$$;

revoke all on function process_return(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function process_return(uuid, uuid, jsonb, text, text) to authenticated, service_role;

-- ---------- notification settings ----------
alter table shops add column if not exists notify_phone text
  check (notify_phone is null or char_length(notify_phone) between 10 and 15);
alter table shops add column if not exists summary_enabled boolean not null default false;
alter table shops add column if not exists reminders_enabled boolean not null default false;
alter table shops add column if not exists reminder_every_days integer not null default 7
  check (reminder_every_days between 1 and 60);
alter table shops add column if not exists reminder_min_amount numeric(10,2) not null default 50
  check (reminder_min_amount >= 0);

-- ---------- reminder_log ----------
create table if not exists reminder_log (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references shops(id) on delete cascade,
  phone text not null,
  amount numeric(12,2),
  channel text not null default 'whatsapp_link' check (channel in ('whatsapp_link', 'whatsapp_api')),
  sent_at timestamptz not null default now()
);
create index if not exists reminder_log_shop_phone_idx on reminder_log (shop_id, phone, sent_at desc);

alter table reminder_log enable row level security;
drop policy if exists "Members can view reminder_log" on reminder_log;
create policy "Members can view reminder_log" on reminder_log for select
  using (is_shop_member(shop_id));
drop policy if exists "Credit members add reminder_log" on reminder_log;
create policy "Credit members add reminder_log" on reminder_log for insert
  with check (has_shop_permission(shop_id, 'credit'));
