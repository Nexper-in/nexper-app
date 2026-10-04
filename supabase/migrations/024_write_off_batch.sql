-- 024: remove one expired (or damaged) stock batch
--
-- Used by the Expiry screen. Takes the batch's remaining quantity out of the
-- item's stock, empties that batch, and records a stock movement so Reports
-- and the Cashbook trail still add up. Same permission as any other stock
-- change ('inventory'). Run in the Supabase SQL editor after 001-023.

create or replace function write_off_batch(
  p_shop_id uuid,
  p_batch_id uuid,
  p_reason text default 'Expired'
)
returns shop_products
language plpgsql
security definer
set search_path = public
as $$
declare
  b stock_batches;
  item_name text;
  updated shop_products;
begin
  if not has_shop_permission(p_shop_id, 'inventory') then
    raise exception 'not permitted to adjust inventory for this shop';
  end if;

  select * into b from stock_batches
    where id = p_batch_id and shop_id = p_shop_id and qty_remaining > 0
    for update;
  if b.id is null then
    raise exception 'batch not found or already empty';
  end if;

  select p.name into item_name
    from shop_products sp join products p on p.id = sp.product_id
    where sp.id = b.shop_product_id and sp.shop_id = p_shop_id;

  update shop_products
    set stock = greatest(0, stock - b.qty_remaining)
    where id = b.shop_product_id and shop_id = p_shop_id
    returning * into updated;

  update stock_batches set qty_remaining = 0 where id = b.id;

  insert into movements (shop_id, shop_product_id, item_name, type, qty, reason)
    values (p_shop_id, b.shop_product_id, item_name, 'out', b.qty_remaining, coalesce(nullif(p_reason, ''), 'Expired'));

  return updated;
end;
$$;

grant execute on function write_off_batch(uuid, uuid, text) to authenticated;
