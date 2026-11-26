// Run: node tests/db/delete_item.rls.mjs (part of npm run test:db). Migration 056:
// delete_shop_product refuses an item with any movement or any bill against it, and
// otherwise deletes it (kept in the 30-day trash like any other delete); undo_batch
// refuses a batch that's been partly sold or used, and otherwise removes the batch and
// the one stock-in movement it came from, giving the stock back. Both check the
// 'inventory' permission and don't leak across shops.
import { buildDb, as, asService, counter } from "./setup.mjs";

const t = counter();
const db = await buildDb();
const q = async (sql) => (await db.query(sql)).rows;
const fails = async (sql) => {
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    return e.message;
  }
};
const user = async (n) => (await q(`insert into auth.users (email) values ('${n}@x') returning id`))[0].id;

await as(db, null);
const owner = await user("owner"), other = await user("other"), helper = await user("helper");
await as(db, owner);
const shop = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'S', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${owner}', 'owner', 'O', '{}')`);
await as(db, other);
const shop2 = (await q(`insert into shops (owner_id, name, type) values ('${other}', 'S2', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop2}', '${other}', 'owner', 'O2', '{}')`);
await asService(db);
// a helper on shop 1 who can see Stock but not change it
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${helper}', 'staff', 'Helper', '{"history": true}')`);

await as(db, owner);
const newProduct = async (name) => (await q(`insert into products (owner_id, name) values ('${owner}', '${name}') returning id`))[0].id;
const newItem = async (name, stock = 0) => {
  const p = await newProduct(name);
  return (await q(`insert into shop_products (shop_id, product_id, price, cost_price, stock) values ('${shop}', '${p}', 50, 30, ${stock}) returning id`))[0].id;
};
const stockOf = async (id) => Number((await q(`select stock from shop_products where id = '${id}'`))[0].stock);
const batchOf = async (id) => (await q(`select * from stock_batches where shop_product_id = '${id}' order by created_at desc limit 1`))[0];
// All 7 positional args, even though p_supplier/p_expiry_date default to null:
// a from-scratch test database (schema.sql's baked-in final state, replayed
// with the older migrations on top — see setup.mjs) ends up with migration
// 005's old 6-param adjust_stock still present alongside 010's 7-param one
// (010's own "drop function if exists" for the 6-param version never runs
// in that replay, because an earlier statement in the same file errors
// "already exists" against something schema.sql already created, and that
// whole legacy file is one untransacted batch — a test-harness-only quirk;
// production applied 010 for real, standalone, so it has no such duplicate).
// A 5-arg call is ambiguous between the two; 7 explicit args only matches
// the real one.
const adjust = (id, type, qty, reason = "Purchase") =>
  q(`select adjust_stock('${shop}', '${id}', '${type}', ${qty}, '${reason}', null, null) r`);

// ---------- 1. delete_shop_product: a clean item goes, a moved one doesn't ----------
const untouched = await newItem("QA Test Item", 1); // opening stock only, like Add item leaves — no movement at all
const moved = await newItem("Basmati Rice");
await adjust(moved, "in", 10, "Purchase");

t.ok(/stock history/.test((await fails(`select delete_shop_product('${moved}')`)) || ""), "an item with a movement refuses to delete");
t.ok((await q(`select count(*)::int c from shop_products where id = '${moved}'`))[0].c === 1, "and is left exactly as it was");

await db.exec(`select delete_shop_product('${untouched}')`);
t.ok((await q(`select count(*)::int c from shop_products where id = '${untouched}'`))[0].c === 0, "an untouched item (opening stock, no movement) deletes");
await asService(db);
t.ok((await q(`select count(*)::int c from deleted_rows where table_name = 'shop_products' and row_id = '${untouched}'`))[0].c === 1, "and is kept in the 30-day trash");

// ---------- 2. delete_shop_product: billed (even with no movement row) is refused too ----------
await as(db, owner);
const billed = await newItem("Sold Once");
await db.exec(
  `insert into bills (id, shop_id, bill_no, items, subtotal, total) values (gen_random_uuid(), '${shop}', 'KS-1', '[{"shop_product_id": "${billed}", "name": "Sold Once", "qty": 1, "price": 50}]'::jsonb, 50, 50)`
);
t.ok(/billed before/.test((await fails(`select delete_shop_product('${billed}')`)) || ""), "an item that appears on a bill refuses to delete, even with no movement");

// ---------- 3. delete_shop_product: permission ----------
await as(db, helper);
t.ok(/not permitted/.test((await fails(`select delete_shop_product('${moved}')`)) || ""), "a helper without inventory permission is refused");
await as(db, other);
t.ok(/not permitted/.test((await fails(`select delete_shop_product('${moved}')`)) || ""), "another shop's owner is refused, not told it doesn't exist");

// ---------- 4. undo_batch: an untouched stock-in reverses cleanly ----------
await as(db, owner);
const item = await newItem("Aashirvaad Atta 5kg");
await adjust(item, "in", 20, "Purchase");
const before = await stockOf(item);
const b1 = await batchOf(item);
t.ok(Number(b1.qty_remaining) === 20 && Number(b1.qty_received) === 20, "the stock-in made one fresh, untouched batch");
const movBefore = (await q(`select count(*)::int c from movements where shop_product_id = '${item}'`))[0].c;

await db.exec(`select undo_batch('${shop}', '${b1.id}')`);
t.ok((await stockOf(item)) === before - 20, "undoing it takes the stock right back off");
t.ok((await q(`select count(*)::int c from stock_batches where id = '${b1.id}'`))[0].c === 0, "the batch is gone");
t.ok((await q(`select count(*)::int c from movements where shop_product_id = '${item}'`))[0].c === movBefore - 1, "and so is the one movement it came from");
await asService(db);
t.ok((await q(`select count(*)::int c from deleted_rows where table_name = 'stock_batches'`))[0].c === 1, "the batch is kept in the trash");
t.ok((await q(`select count(*)::int c from deleted_rows where table_name = 'movements'`))[0].c === 1, "so is the movement");

// ---------- 5. undo_batch: refuses once some of it has sold or been used ----------
await as(db, owner);
await adjust(item, "in", 10, "Purchase");
const b2 = await batchOf(item);
await adjust(item, "out", 4, "Correction"); // FIFO consumes from b2, the only batch left
const stockAfterPartial = await stockOf(item);
t.ok(/already been sold or used/.test((await fails(`select undo_batch('${shop}', '${b2.id}')`)) || ""), "a batch that's been partly drawn down can't be undone as a whole");
t.ok((await stockOf(item)) === stockAfterPartial, "and nothing changes when it's refused");
t.ok((await q(`select count(*)::int c from stock_batches where id = '${b2.id}'`))[0].c === 1, "the batch is still there");

// ---------- 6. undo_batch: permission and cross-shop ----------
await adjust(item, "in", 5, "Purchase");
const b3 = await batchOf(item);
await as(db, helper);
t.ok(/not permitted/.test((await fails(`select undo_batch('${shop}', '${b3.id}')`)) || ""), "a helper without inventory permission is refused");
await as(db, other);
t.ok(/batch not found/.test((await fails(`select undo_batch('${shop2}', '${b3.id}')`)) || ""), "another shop can't reach this batch by id");
await as(db, owner);
t.ok((await q(`select count(*)::int c from stock_batches where id = '${b3.id}'`))[0].c === 1, "and it's untouched after both refusals");

console.log(`${t.pass} passed, ${t.fail} failed (delete item / undo batch)`);
process.exit(t.fail ? 1 : 0);
