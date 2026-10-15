// Run: node tests/db/closure.rls.mjs (part of npm run test:db). S14: closing a shop instead of
// deleting it. A closed shop is read-only, only its owner can reach it, can be reopened for
// 90 days, and is removed only by the daily job after that. Nothing else deletes a shop.
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
const user = async (name) => (await q(`insert into auth.users (email) values ('${name}@x') returning id`))[0].id;

await as(db, null);
const owner = await user("owner"), other = await user("other"), staff = await user("staff"), mgr = await user("manager");
const shop = async (o, name) => {
  await as(db, o);
  const id = (await q(`insert into shops (owner_id, name, type) values ('${o}', '${name}', 'kirana') returning id`))[0].id;
  await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${id}', '${o}', 'owner', 'O', '{}')`);
  return id;
};
const A = await shop(owner, "A");
const B = await shop(other, "B");
await asService(db);
const orgA = (await q(`select org_id from shops where id = '${A}'`))[0].org_id;
await db.exec(`update organisations set max_shops = 2 where id = '${orgA}'`);
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${A}', '${staff}', 'staff', 'Helper', '{"billing":true,"history":true}')`);
await db.exec(`insert into org_members (org_id, user_id, role) values ('${orgA}', '${mgr}', 'manager')`);
await as(db, owner);
const prod = (await q(`insert into products (owner_id, name) values ('${owner}', 'Tea') returning id`))[0].id;
const sp = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${A}', '${prod}', 10, 50) returning id`))[0].id;
await db.exec(`
  insert into bills (shop_id, bill_no, items, subtotal, total) values ('${A}', 'KS-1', '[]', 10, 10);
  insert into credits (shop_id, phone, name, amount, type) values ('${A}', '9', 'C', 5, 'charge');
`);
const offer = (await q(`insert into clearance_offers (shop_id, discount_pct, start_date, end_date) values ('${A}', 5, current_date, current_date) returning id`))[0].id;
const po = (await q(`insert into purchase_orders (shop_id) values ('${A}') returning id`))[0].id;
await asService(db);
await db.exec(`insert into api_keys (shop_id, name, key_prefix, key_hash) values ('${A}', 'k', 'nxp_a', 'h')`);
await as(db, owner);

// ---------- 1. who may close ----------
await as(db, other);
t.ok(/Not allowed/.test(await fails(`select close_shop('${A}', 'x')`)), "another shop's owner cannot close shop A");
await as(db, staff);
t.ok(/Not allowed/.test(await fails(`select close_shop('${A}', 'x')`)), "a staff member cannot close the shop");
await as(db, mgr);
t.ok(/Not allowed/.test(await fails(`select close_shop('${A}', 'x')`)), "a company manager cannot close a shop");
await as(db, "anon");
t.ok(await fails(`select close_shop('${A}', 'x')`), "an anonymous visitor cannot close a shop");

// ---------- 2. closing ----------
await as(db, owner);
await db.exec(`select close_shop('${A}', 'Moving away')`);
const closed = (await q(`select status, closed_by, close_reason, purge_after > now() + interval '89 days' and purge_after < now() + interval '91 days' as ninety from shops where id = '${A}'`))[0];
t.ok(closed.status === "closed" && closed.closed_by === owner && closed.close_reason === "Moving away" && closed.ninety, "the shop is closed with a reason and a purge date about 90 days out");
await asService(db);
t.ok((await q(`select count(*)::int c from shop_members where shop_id = '${A}'`))[0].c === 1, "staff and company roles lost their access; only the owner is left");
t.ok((await q(`select count(*)::int c from api_keys where shop_id = '${A}' and revoked_at is null`))[0].c === 0, "API keys are revoked");
await as(db, staff);
t.ok((await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 0, "the helper can no longer read the closed shop");
await as(db, mgr);
t.ok((await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 0, "the company manager can no longer read it");
await as(db, other);
t.ok((await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 0, "a stranger sees nothing");
await as(db, owner);
t.ok((await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 1, "the owner can still read everything (to download it)");

// ---------- 3. read-only ----------
const ro = async (sql, label) => t.ok(/shop is closed/.test((await fails(sql)) || ""), label);
await ro(`insert into bills (shop_id, bill_no, items, subtotal, total) values ('${A}', 'KS-2', '[]', 1, 1)`, "the owner cannot add a bill to a closed shop");
await ro(`update shop_products set price = 1 where shop_id = '${A}'`, "or change an item");
await ro(`insert into clearance_offer_items (offer_id, shop_product_id) values ('${offer}', '${sp}')`, "or add to an offer");
await ro(`insert into purchase_order_items (po_id, item_name) values ('${po}', 'x')`, "or to a purchase order");
await ro(`update shops set name = 'renamed' where id = '${A}'`, "or rename the shop");
await ro(`select sell_items('${A}', '[]'::jsonb)`.replace("'[]'::jsonb", `'[{"shop_product_id":"${sp}","qty":1}]'::jsonb`), "selling through the function is refused too");
await asService(db);
await ro(`insert into bills (shop_id, bill_no, items, subtotal, total) values ('${A}', 'KS-3', '[]', 1, 1)`, "even the server cannot write to a closed shop by accident");
await ro(`update bills set total = 99 where shop_id = '${A}'`, "nor change a bill");
await ro(`delete from credits where shop_id = '${A}'`, "nor delete udhaar entries");
t.ok((await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 1, "nothing changed in the closed shop");

// ---------- 4. nothing deletes a shop ----------
await as(db, other);
const del = (await q(`with d as (delete from shops where id = '${B}' returning 1) select count(*)::int c from d`))[0].c;
t.ok(del === 0, "an owner deleting their own shop straight from the browser removes nothing (no delete rule)");
await as(db, owner);
t.ok((await q(`with d as (delete from shops where id = '${A}' returning 1) select count(*)::int c from d`))[0].c === 0, "same for a closed shop");

// ---------- 5. the limit counts open shops only ----------
await db.exec(`reset role`);
await as(db, owner);
const A2 = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'A2', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${A2}', '${owner}', 'owner', 'O', '{}')`);
const A3 = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'A3', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${A3}', '${owner}', 'owner', 'O', '{}')`);
t.ok(true, "with a limit of 2 and one closed shop the owner can have 2 open shops (closed ones do not count)");
t.ok(/allows 2 shop/.test((await fails(`insert into shops (owner_id, name, type) values ('${owner}', 'A4', 'kirana')`)) || ""), "a third open shop is refused");
t.ok(/allows 2 shop/.test((await fails(`select reopen_shop('${A}')`)) || ""), "reopening would exceed the limit, so it is refused with the same message");
await db.exec(`select close_shop('${A3}', null)`);

// ---------- 6. reopening ----------
await db.exec(`select reopen_shop('${A}')`);
t.ok((await q(`select status, purge_after from shops where id = '${A}'`))[0].status === "active", "the owner reopens within the 90 days");
await db.exec(`update bills set total = 11 where shop_id = '${A}'`);
t.ok(true, "and can write again");
await as(db, mgr);
t.ok((await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 1, "the company manager has the shop back (company roles are re-synced)");
await as(db, staff);
t.ok((await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 0, "staff are not restored: the owner adds them again");

// ---------- 7. the daily job ----------
await as(db, owner);
await db.exec(`select close_shop('${A}', 'again')`);
await as(db, owner);
t.ok(/Not allowed|permission denied/.test((await fails(`select purge_closed_shops(10)`)) || ""), "an owner cannot run the purge");
await asService(db);
t.ok((await q(`select purge_closed_shops(10) n`))[0].n === 0, "nothing is purged before the 90 days are over");
await db.exec(`reset role; select set_config('nexper.closure', 'on', false); update shops set purge_after = now() - interval '1 day' where id = '${A}'; select set_config('nexper.closure', '', false);`);
await as(db, owner);
t.ok(/no longer be reopened/.test((await fails(`select reopen_shop('${A}')`)) || ""), "after the date the shop cannot be reopened");
await asService(db);
const ap = (await q(`select purge_closed_shops(10) n`))[0].n;
t.ok(ap === 1, "the job removes the shop whose 90 days are over");
t.ok((await q(`select count(*)::int c from shops where id = '${A}'`))[0].c === 0 && (await q(`select count(*)::int c from bills where shop_id = '${A}'`))[0].c === 0 && (await q(`select count(*)::int c from shop_products where shop_id = '${A}'`))[0].c === 0, "with everything under it");
t.ok((await q(`select count(*)::int c from clearance_offer_items where offer_id = '${offer}'`))[0].c === 0, "including rows that hang off other rows");
t.ok((await q(`select count(*)::int c from admin_audit_log where action = 'purge_closed_shop' and target_id = '${A}'`))[0].c === 1, "one audit row is written");
t.ok((await q(`select count(*)::int c from shops where id in ('${B}', '${A2}')`))[0].c === 2, "other shops were not touched");

// ---------- 8. removing a shop that never had a bill ----------
await asService(db);
await as(db, owner);
t.ok(/Not allowed|permission denied/.test((await fails(`select purge_shop_now('${A2}')`)) || ""), "an owner cannot call the immediate purge");
await asService(db);
await db.exec(`insert into bills (shop_id, bill_no, items, subtotal, total) values ('${A2}', 'KS-9', '[]', 1, 1)`);
t.ok(/has bills/.test((await fails(`select purge_shop_now('${A2}')`)) || ""), "the immediate purge refuses a shop with bills");
await db.exec(`delete from bills where shop_id = '${A2}'`);
await db.exec(`select purge_shop_now('${A2}')`);
t.ok((await q(`select count(*)::int c from shops where id = '${A2}'`))[0].c === 0, "and removes an empty one");

console.log(`${t.pass} passed, ${t.fail} failed (shop closure)`);
process.exit(t.fail ? 1 : 0);
