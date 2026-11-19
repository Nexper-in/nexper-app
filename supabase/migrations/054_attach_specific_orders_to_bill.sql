-- 054: bill a specific set of a table's orders, not the whole session at once
--
-- attach_game_orders_to_bill (051) marks every still-unbilled order on a
-- session as billed in one call -- exactly right for the common case: one
-- table, one bill. Splitting a table's charge across several bills (one per
-- player, see useBilling.js's generateSplitBills) needs a finer-grained
-- version: mark just THESE specific orders -- one player's own lines, or
-- the shared/untagged ones -- as billed under THIS bill, leaving every
-- other player's still-unbilled orders on the same session untouched so the
-- next split bill in the sequence can go on to claim its own. The table's
-- own time charge (held on game_sessions, not game_session_orders) still
-- goes through the existing attach_game_session_to_bill -- whichever one
-- split bill is meant to carry it.

create or replace function attach_specific_orders_to_bill(p_order_ids uuid[], p_bill uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
  v_shop_count integer;
  v_bill_shop uuid;
begin
  select count(distinct shop_id), (array_agg(shop_id))[1] into v_shop_count, v_shop from game_session_orders where id = any(p_order_ids);
  if v_shop is null then raise exception 'Orders not found'; end if;
  if v_shop_count > 1 then raise exception 'Orders belong to more than one shop'; end if;
  if not has_shop_permission(v_shop, 'play_area') then raise exception 'Not allowed'; end if;
  select shop_id into v_bill_shop from bills where id = p_bill;
  if v_bill_shop is null or v_bill_shop <> v_shop then raise exception 'Bill is not in this shop'; end if;
  update game_session_orders set bill_id = p_bill where id = any(p_order_ids) and bill_id is null;
end;
$$;
revoke all on function attach_specific_orders_to_bill(uuid[], uuid) from public, anon;
grant execute on function attach_specific_orders_to_bill(uuid[], uuid) to authenticated, service_role;

select record_migration('054', '054_attach_specific_orders_to_bill.sql');
