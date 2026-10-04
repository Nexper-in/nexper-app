-- 026: receive a purchase order with the quantities that actually arrived
--
-- 019's receive_purchase_order adds every line at the ordered quantity. Real
-- deliveries are short, over, or have expiry dates, so the Purchase orders
-- screen now asks for what arrived per line (and an optional expiry date) and
-- calls this instead. It adds that stock, writes the movement, and creates a
-- stock batch (with the expiry date) for each line, all in one transaction.
-- 019's function stays as a fallback. Run after 001-025.
--
-- p_lines is a JSON array: [{"line_id": "<purchase_order_items.id>",
--                            "qty": 12, "expiry_date": "2026-12-31" | null}]

create or replace function receive_purchase_order_lines(p_po_id uuid, p_shop_id uuid, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  po record;
  line record;
  l jsonb;
  v_qty numeric;
  v_expiry date;
  current_stock numeric;
  item_name text;
  item_cost numeric;
begin
  if not has_shop_permission(p_shop_id, 'inventory') then
    raise exception 'not permitted to adjust inventory for this shop';
  end if;

  select * into po from purchase_orders where id = p_po_id and shop_id = p_shop_id;
  if po is null then
    raise exception 'purchase order not found';
  end if;
  if po.status = 'received' then
    raise exception 'this purchase order was already received';
  end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((l->>'qty')::numeric, 0);
    if v_qty <= 0 then
      continue;
    end if;
    v_expiry := nullif(l->>'expiry_date', '')::date;

    select * into line from purchase_order_items
      where id = (l->>'line_id')::uuid and po_id = p_po_id;
    if line.id is null then
      raise exception 'order line not found';
    end if;
    if line.shop_product_id is null then
      continue;
    end if;

    select sp.stock, sp.cost_price, p.name into current_stock, item_cost, item_name
      from shop_products sp
      join products p on p.id = sp.product_id
      where sp.id = line.shop_product_id and sp.shop_id = p_shop_id
      for update of sp;
    if current_stock is null then
      raise exception 'item "%" no longer exists in this shop', line.item_name;
    end if;

    update shop_products set stock = current_stock + v_qty where id = line.shop_product_id;

    insert into movements (shop_id, shop_product_id, item_name, type, qty, reason, supplier)
      values (p_shop_id, line.shop_product_id, item_name, 'in', v_qty,
              'PO received — ' || coalesce(po.supplier_name, 'supplier'), po.supplier_name);

    insert into stock_batches (shop_id, shop_product_id, qty_received, qty_remaining, cost_price, expiry_date, reason, supplier)
      values (p_shop_id, line.shop_product_id, v_qty, v_qty, coalesce(line.unit_price, item_cost), v_expiry,
              'PO received', po.supplier_name);
  end loop;

  update purchase_orders set status = 'received' where id = p_po_id;
end;
$$;

grant execute on function receive_purchase_order_lines(uuid, uuid, jsonb) to authenticated;
