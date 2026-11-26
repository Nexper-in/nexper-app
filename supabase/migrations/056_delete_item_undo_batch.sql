-- 056: let an owner delete a stock item that's never been touched, and undo
-- a stock-in that hasn't been sold from yet
--
-- delete_shop_product: Stock has never had a way to remove an item once
-- added (migration 001). shop_products already had a delete RLS policy
-- (migration 002) that nothing in the app called. This adds the guard a
-- careless delete needs: refuse while the item has any stock movement (a
-- purchase, sale, correction -- real history) or appears on any bill, the
-- same "nothing to protect, or a clear refusal" shape delete_station
-- (migration 053) uses for play-area stations. A deleted item is kept in
-- the existing 30-day trash -- migration 044 already covers shop_products.
--
-- undo_batch: migration 010 made every stock-in its own FIFO batch.
-- Undoing one is safe and precise exactly when nothing has sold from it yet
-- (qty_remaining = qty_received) -- the same qty_remaining check
-- write_off_batch (024) keys off, just run the other way: instead of
-- zeroing the batch and logging a write-off, this removes the batch and
-- the stock it added outright. It also removes the one movement row that
-- batch came from (found by shop_product_id + qty + timestamp -- the
-- movement and its batch are always written in the same statement, so they
-- share one now()). Movements were deliberately left out of the 30-day
-- trash in 044 because nothing ever deleted one; this is the first thing
-- that does, so movements (and stock_batches, so a restored movement's
-- batch can come back with it) join the trash list here, the same way 053
-- added game_stations when it became the first thing to delete those.
--
-- Scope: only a stock-IN can be undone this way -- a batch only ever comes
-- from stock going up (a purchase, a PO received, a sale return). A
-- stock-OUT logged by mistake (Damage/Wastage, Personal use, Correction)
-- has no batch of its own to target; the fix there is what it's always
-- been -- log an equal Stock In back, with whatever reason fits. Undoing a
-- PO's stock-in also doesn't flip that purchase order back from
-- "received" to "sent" -- a rare enough case that it's left as a known gap
-- rather than special-cased here.

create or replace function delete_shop_product(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop uuid;
begin
  select shop_id into v_shop from shop_products where id = p_item;
  if v_shop is null then
    raise exception 'Item not found';
  end if;
  if not has_shop_permission(v_shop, 'inventory') then
    raise exception 'not permitted to adjust inventory for this shop';
  end if;
  if exists (select 1 from movements where shop_product_id = p_item) then
    raise exception 'This item has stock history (purchases, sales or corrections) — it can''t be deleted. Set its stock to 0 instead if it''s no longer sold.';
  end if;
  if exists (
    select 1 from bills b
      where b.shop_id = v_shop
        and b.items @> jsonb_build_array(jsonb_build_object('shop_product_id', p_item::text))
  ) then
    raise exception 'This item has been billed before — it can''t be deleted, so old bills keep showing it correctly.';
  end if;
  delete from shop_products where id = p_item;
end;
$$;
revoke all on function delete_shop_product(uuid) from public, anon;
grant execute on function delete_shop_product(uuid) to authenticated, service_role;

create or replace function undo_batch(p_shop_id uuid, p_batch_id uuid)
returns shop_products
language plpgsql
security definer
set search_path = public
as $$
declare
  b stock_batches%rowtype;
  v_mov_id uuid;
  updated shop_products;
begin
  select * into b from stock_batches where id = p_batch_id and shop_id = p_shop_id for update;
  if b.id is null then
    raise exception 'batch not found';
  end if;
  if not has_shop_permission(p_shop_id, 'inventory') then
    raise exception 'not permitted to adjust inventory for this shop';
  end if;
  if b.qty_remaining <> b.qty_received then
    raise exception 'Some of this has already been sold or used — use Stock → Out to correct the remaining quantity instead.';
  end if;

  select id into v_mov_id from movements
    where shop_product_id = b.shop_product_id and type = 'in' and qty = b.qty_received and date = b.received_date
    order by id desc limit 1
    for update;

  update shop_products
    set stock = greatest(0, stock - b.qty_received)
    where id = b.shop_product_id and shop_id = p_shop_id
    returning * into updated;

  delete from stock_batches where id = p_batch_id;
  if v_mov_id is not null then
    delete from movements where id = v_mov_id;
  end if;

  return updated;
end;
$$;
revoke all on function undo_batch(uuid, uuid) from public, anon;
grant execute on function undo_batch(uuid, uuid) to authenticated, service_role;

-- movements and stock_batches join the 30-day trash: the first deletes of
-- either now exist, above.
do $$
declare
  t text;
begin
  foreach t in array array['movements', 'stock_batches'] loop
    execute format('drop trigger if exists %I on %I', t || '_keep_deleted', t);
    execute format('create trigger %I after delete on %I for each row execute function keep_deleted_row()', t || '_keep_deleted', t);
  end loop;
end $$;

create or replace function _restore_trash_row(p_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  d deleted_rows%rowtype;
begin
  select * into d from deleted_rows where id = p_id;
  if not found then raise exception 'That deleted record is no longer kept (30 days).'; end if;
  if d.table_name <> all (array['shop_products', 'products', 'suppliers', 'shop_suppliers', 'fixed_expenses', 'clearance_offers', 'offer_posts', 'purchase_orders', 'supply_points', 'supply_payments', 'shop_members', 'game_stations', 'movements', 'stock_batches']) then raise exception 'That kind of record cannot be restored.'; end if;
  begin
    execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', d.table_name, d.table_name) using d.row;
  exception when unique_violation then
    raise exception 'It already exists again, so there is nothing to restore.';
  when foreign_key_violation then
    raise exception 'It belongs to something that has been deleted too. Restore that first.';
  end;
  delete from deleted_rows where id = p_id;
  return d.table_name;
end $$;
revoke all on function _restore_trash_row(bigint) from public, anon, authenticated;

select record_migration('056', '056_delete_item_undo_batch.sql');
