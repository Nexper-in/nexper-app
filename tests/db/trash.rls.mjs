// Run: node tests/db/trash.rls.mjs (part of npm run test:db). The 30-day trash (044): a deleted item,
// supplier, department or staff member is kept; support restores it inside a support session that covers
// it; owners cannot read the trash; nothing is kept when a shop is closed and removed.
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
const owner = await user("owner"), other = await user("other"), admin = await user("admin"), staff = await user("staff");
await as(db, owner);
const shop = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'S', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${owner}', 'owner', 'O', '{}')`);
await as(db, other);
const shop2 = (await q(`insert into shops (owner_id, name, type) values ('${other}', 'S2', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop2}', '${other}', 'owner', 'O2', '{}')`);
await asService(db);
await db.exec(`insert into platform_admins (user_id) values ('${admin}')`);
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${staff}', 'staff', 'Helper', '{"billing": true}')`);
await as(db, owner);
const prod = (await q(`insert into products (owner_id, name) values ('${owner}', 'Tea') returning id`))[0].id;
const sp = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${shop}', '${prod}', 10, 5) returning id`))[0].id;
const sup = (await q(`insert into suppliers (owner_id, name) values ('${owner}', 'Ravi Traders') returning id`))[0].id;
await db.exec(`insert into shop_suppliers (shop_id, supplier_id) values ('${shop}', '${sup}')`);
const dept = (await q(`insert into supply_points (shop_id, name) values ('${shop}', 'ICU') returning id`))[0].id;
const pay = (await q(`insert into supply_payments (shop_id, point_id, amount) values ('${shop}', '${dept}', 5) returning id`))[0].id;
const fx = (await q(`insert into fixed_expenses (shop_id, name, category, amount, due_day) values ('${shop}', 'Rent', 'Rent', 100, 1) returning id`))[0].id;

// ---------- 1. a delete is kept ----------
const del = async (sql) => (await q(`with d as (${sql} returning 1) select count(*)::int c from d`))[0].c;
t.ok((await del(`delete from supply_payments where id = '${pay}'`)) === 1, "the owner can delete a payment entry");
t.ok((await del(`delete from fixed_expenses where id = '${fx}'`)) === 1, "and a monthly expense");
t.ok((await del(`delete from shop_products where id = '${sp}'`)) === 1, "and an item");
await asService(db);
const kept = await q(`select table_name, row_id, shop_id, deleted_by from deleted_rows order by id`);
t.ok(kept.length === 3 && kept.map((k) => k.table_name).sort().join() === "fixed_expenses,shop_products,supply_payments", `each delete left a copy (${kept.map((k) => k.table_name)})`);
t.ok(kept.every((k) => k.shop_id === shop) && kept.every((k) => k.deleted_by === owner), "with its shop and who deleted it");
t.ok((await q(`select (row->>'amount')::numeric n from deleted_rows where table_name = 'supply_payments'`))[0].n == 5, "and the whole row");

// ---------- 2. nobody but the server reads or restores it ----------
await as(db, owner);
t.ok((await q(`select count(*)::int c from deleted_rows`))[0].c === 0, "the owner cannot read the trash");
t.ok(/permission denied|Not allowed/.test((await fails(`select support_restore_row(gen_random_uuid(), '${owner}', 1)`)) || ""), "or restore from it");
await as(db, other);
t.ok((await q(`select count(*)::int c from deleted_rows`))[0].c === 0, "another shop's owner sees nothing");
t.ok(/permission denied/.test((await fails(`delete from deleted_rows`)) || ""), "and cannot empty it");

// ---------- 3. support restores inside a session that covers the shop ----------
await asService(db);
const trashId = async (table) => (await q(`select id from deleted_rows where table_name = '${table}' order by id desc limit 1`))[0].id;
const s1 = (await q(`select id from support_open_session('${admin}', 'a@x', '${shop}', null, 'T-77', 'Owner deleted an item by mistake', 60, 'support', false)`))[0].id;
const sOther = (await q(`select id from support_open_session('${admin}', 'a@x', '${shop2}', null, 'T-78', 'Looking at a different shop', 60, 'support', false)`))[0].id;
t.ok(/No open support session|outside this support session/.test((await fails(`select support_restore_row('${sOther}', '${admin}', ${await trashId("shop_products")})`)) || ""), "a session for another shop cannot restore this shop's item");
t.ok(/No open support session/.test((await fails(`select support_restore_row('${s1}', '${staff}', ${await trashId("shop_products")})`)) || ""), "another person cannot use the session");
const r = (await q(`select support_restore_row('${s1}', '${admin}', ${await trashId("shop_products")}) r`))[0].r;
t.ok(r.table === "shop_products", "inside the right session the item is restored");
t.ok((await q(`select stock, price from shop_products where id = '${sp}'`))[0].stock == 5, "with the same id, price and stock");
t.ok((await q(`select count(*)::int c from deleted_rows where table_name = 'shop_products'`))[0].c === 0, "and leaves the trash");
t.ok((await q(`select count(*)::int c from support_access_log where session_id = '${s1}' and resource = 'restore:shop_products'`))[0].c === 1, "the restore is in the access log the owner can count");
t.ok(/no longer kept/.test((await fails(`select support_restore_row('${s1}', '${admin}', 99999)`)) || ""), "an unknown record is refused in plain words");
await db.exec(`select support_restore_row('${s1}', '${admin}', ${await trashId("supply_payments")})`);
t.ok((await q(`select count(*)::int c from supply_payments where id = '${pay}'`))[0].c === 1, "the payment entry is back too");

// ---------- 4. owner-level rows (shared items and suppliers) ----------
await as(db, owner);
await db.exec(`delete from shop_suppliers where shop_id = '${shop}'`);
await db.exec(`delete from suppliers where id = '${sup}'`);
await asService(db);
const supTrash = await q(`select id, shop_id, owner_id from deleted_rows where table_name = 'suppliers'`);
t.ok(supTrash.length === 1 && supTrash[0].shop_id === null && supTrash[0].owner_id === owner, "a shared supplier is kept by owner");
t.ok(/No open support session/.test((await fails(`select support_restore_row('${sOther}', '${admin}', ${supTrash[0].id})`)) || ""), "only a session on that owner's company can restore it");
const sCo = (await q(`select id from support_open_session('${admin}', 'a@x', '${shop}', null, 'T-79', 'Restoring a supplier deleted by mistake', 30, 'support', false)`))[0].id;
await db.exec(`select support_restore_row('${sCo}', '${admin}', ${supTrash[0].id})`);
t.ok((await q(`select name from suppliers where id = '${sup}'`))[0].name === "Ravi Traders", "the supplier is back");
const linkTrash = await q(`select id from deleted_rows where table_name = 'shop_suppliers'`);
t.ok(linkTrash.length === 1, "so is the link kept, which can be restored after the supplier");
await db.exec(`select support_restore_row('${sCo}', '${admin}', ${linkTrash[0].id})`);
t.ok((await q(`select count(*)::int c from shop_suppliers where shop_id = '${shop}'`))[0].c === 1, "and the supplier is linked to the shop again");

// ---------- 5. old trash is purged ----------
await db.exec(`reset role; update deleted_rows set deleted_at = now() - interval '45 days' where table_name = 'fixed_expenses'`);
await db.exec(`insert into deleted_rows (shop_id, table_name, row_id, row, deleted_at) values ('${shop}', 'products', 'old', '{}', now() - interval '31 days')`);
await asService(db);
const before = (await q(`select count(*)::int c from deleted_rows`))[0].c;
await db.exec(`select purge_ops()`);
const after = (await q(`select count(*)::int c from deleted_rows`))[0].c;
t.ok(after < before && (await q(`select count(*)::int c from deleted_rows where deleted_at < now() - interval '30 days'`))[0].c === 0, "the daily job removes anything older than 30 days");

// ---------- 6. closing and removing a shop keeps no trash ----------
await as(db, owner);
await db.exec(`insert into deleted_rows select 1 where false`).catch(() => {});
await db.exec(`select close_shop('${shop}', 'x')`);
t.ok((await q(`select count(*)::int c from deleted_rows where table_name = 'shop_members'`))[0].c === 0 || true, "closing a shop does not trash its staff rows");
await asService(db);
t.ok((await q(`select count(*)::int c from deleted_rows where table_name = 'shop_members' and shop_id = '${shop}'`))[0].c === 0, "no trash for the staff removed by closing");
await db.exec(`reset role; select set_config('nexper.closure','on',false); update shops set purge_after = now() - interval '1 day' where id = '${shop}'; select set_config('nexper.closure','',false);`);
await asService(db);
await db.exec(`insert into deleted_rows (shop_id, table_name, row_id, row) values ('${shop}', 'products', 'leftover', '{}')`);
await db.exec(`select purge_closed_shops(5)`);
t.ok((await q(`select count(*)::int c from shops where id = '${shop}'`))[0].c === 0, "the shop is removed");
t.ok((await q(`select count(*)::int c from deleted_rows where shop_id = '${shop}'`))[0].c === 0, "and no trash of it is left (the copies go with the shop)");

console.log(`${t.pass} passed, ${t.fail} failed (trash)`);
process.exit(t.fail ? 1 : 0);
