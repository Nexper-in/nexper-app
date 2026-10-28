-- 050: items made fresh when sold (tea, coffee, snacks cooked to order) --
-- these keep no stored quantity, so they shouldn't show as "in stock",
-- "low stock" or "out of stock" anywhere, and billing one should never be
-- blocked or reduce any number. track_stock = false is how an item opts
-- out of all of that; it still bills normally, just like a Play area game
-- charge (migration 047) already does for a line with no shop_product_id.
alter table shop_products add column if not exists track_stock boolean not null default true;

-- Same as migration 047's version, plus: a line whose shop_product has
-- track_stock = false is skipped too (no stock to take, no movement to log).
create or replace function _deduct_stock(p_shop_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line jsonb;
  current_stock numeric;
  current_tracked boolean;
  requested_qty numeric;
  item_name text;
begin
  for line in select * from jsonb_array_elements(p_lines) loop
    if coalesce(line->>'shop_product_id', '') = '' then
      continue;
    end if;

    requested_qty := (line->>'qty')::numeric;

    select stock, track_stock into current_stock, current_tracked from shop_products
      where id = (line->>'shop_product_id')::uuid and shop_id = p_shop_id
      for update; -- row lock: two simultaneous bills can't both oversell

    if current_stock is null then
      raise exception 'item % not found in this shop', line->>'shop_product_id';
    end if;

    if not current_tracked then
      continue;
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

select record_migration('050', '050_no_stock_items.sql');
