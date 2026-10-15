-- 042: save a bill in one safe step
--
-- Before, the app deducted stock (sell_items), then wrote the bill, then wrote the udhaar entry,
-- as three separate calls. If the connection dropped between them, or an offline bill was replayed
-- later, stock could be taken twice and an udhaar charge added twice, and a bill could be left half
-- saved. save_bill does all of it in one transaction and is IDEMPOTENT: the bill's id is made on the
-- device, so sending the same bill again changes nothing and says "already saved".
-- Old app versions keep working: sell_items is still there. See docs/MULTITENANT_DESIGN.md (T14).

-- The stock part of sell_items, without the permission check (its callers check). Not callable
-- from outside.
create or replace function _deduct_stock(p_shop_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
  current_stock numeric;
  requested_qty numeric;
  item_name text;
begin
  for line in select * from jsonb_array_elements(p_lines) loop
    requested_qty := (line->>'qty')::numeric;

    select stock into current_stock from shop_products
      where id = (line->>'shop_product_id')::uuid and shop_id = p_shop_id
      for update; -- row lock: two simultaneous bills can't both oversell

    if current_stock is null then
      raise exception 'item % not found in this shop', line->>'shop_product_id';
    end if;

    item_name := coalesce(line->>'name', 'this item');
    if current_stock < requested_qty then
      raise exception 'Only % of % left in stock — bill not saved', current_stock, item_name;
    end if;

    update shop_products
      set stock = current_stock - requested_qty
      where id = (line->>'shop_product_id')::uuid;

    insert into movements (shop_id, shop_product_id, item_name, type, qty, reason)
      values (p_shop_id, (line->>'shop_product_id')::uuid, line->>'name', 'out', requested_qty, 'sale');
  end loop;
end;
$$;
revoke all on function _deduct_stock(uuid, jsonb) from public, anon, authenticated;

create or replace function sell_items(p_shop_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_shop_permission(p_shop_id, 'billing') then
    raise exception 'not permitted to bill for this shop';
  end if;
  perform _deduct_stock(p_shop_id, p_lines);
end;
$$;
grant execute on function sell_items(uuid, jsonb) to authenticated;

-- p_bill: { id, shop_id, bill_no, customer_name, customer_phone, items: [...], subtotal,
--           discount_amount, total, payment_type, payment_method, date, credit_id }
-- Returns { id, bill_no, created }: created = false when this bill had already been saved.
create or replace function save_bill(p_bill jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_shop uuid;
  v_no text;
  v_try integer := 1;
  v_type text;
  v_phone text;
  v_credit uuid;
  v_existing record;
begin
  if auth.uid() is null then raise exception 'not permitted to bill for this shop'; end if;
  v_id := (p_bill->>'id')::uuid;
  v_shop := (p_bill->>'shop_id')::uuid;
  if v_id is null or v_shop is null then raise exception 'A bill needs an id and a shop'; end if;
  if not has_shop_permission(v_shop, 'billing') then
    raise exception 'not permitted to bill for this shop';
  end if;
  if jsonb_typeof(p_bill->'items') <> 'array' or jsonb_array_length(p_bill->'items') = 0 then
    raise exception 'A bill needs at least one item';
  end if;
  v_type := coalesce(p_bill->>'payment_type', 'cash');
  if v_type not in ('cash', 'credit') then raise exception 'Unknown payment type'; end if;
  v_phone := nullif(trim(coalesce(p_bill->>'customer_phone', '')), '');
  if v_type = 'credit' and v_phone is null then raise exception 'An udhaar bill needs the customer''s mobile number'; end if;

  -- One save of this bill at a time (a double tap, or the app and its offline replay together).
  perform pg_advisory_xact_lock(hashtext(v_id::text));

  select id, shop_id, bill_no into v_existing from bills where id = v_id;
  if found then
    if v_existing.shop_id <> v_shop then raise exception 'not permitted to bill for this shop'; end if;
    return jsonb_build_object('id', v_existing.id, 'bill_no', v_existing.bill_no, 'created', false);
  end if;

  -- Stock first: if an item has run out nothing is saved at all.
  perform _deduct_stock(v_shop, p_bill->'items');

  -- The bill number is guessed by the device; if another device took it meanwhile, add -2, -3...
  v_no := coalesce(nullif(p_bill->>'bill_no', ''), 'KS-' || to_char(now(), 'YYMMDDHH24MISS'));
  loop
    begin
      insert into bills (id, shop_id, bill_no, customer_name, customer_phone, items, subtotal, discount_amount, total, payment_type, payment_method, date)
      values (
        v_id, v_shop, v_no, nullif(p_bill->>'customer_name', ''), v_phone, p_bill->'items',
        (p_bill->>'subtotal')::numeric, coalesce((p_bill->>'discount_amount')::numeric, 0), (p_bill->>'total')::numeric,
        v_type, coalesce(p_bill->>'payment_method', 'cash'), coalesce((p_bill->>'date')::timestamptz, now())
      );
      exit;
    exception when unique_violation then
      if sqlerrm like '%bill_no%' and v_try < 50 then
        v_try := v_try + 1;
        v_no := coalesce(nullif(p_bill->>'bill_no', ''), 'KS') || '-' || v_try;
      else
        raise;
      end if;
    end;
  end loop;

  -- An udhaar bill adds the charge in the same step. A billing-only helper may do this (open
  -- question 8: yes): the bill is theirs to make; the Udhaar screen stays hidden from them.
  if v_type = 'credit' then
    v_credit := coalesce(nullif(p_bill->>'credit_id', '')::uuid, gen_random_uuid());
    insert into credits (id, shop_id, phone, name, amount, type, note)
    values (v_credit, v_shop, v_phone, coalesce(nullif(p_bill->>'customer_name', ''), 'Customer'), (p_bill->>'total')::numeric, 'charge', 'Bill ' || v_no)
    on conflict (id) do nothing;
  end if;

  return jsonb_build_object('id', v_id, 'bill_no', v_no, 'created', true);
end;
$$;

revoke all on function save_bill(jsonb) from public, anon;
grant execute on function save_bill(jsonb) to authenticated, service_role;

select record_migration('042', '042_save_bill.sql');
