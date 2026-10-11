import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

// Run: npm run test:db. Loads schema.sql and migration 031 into an in-memory
// Postgres and checks process_return(): stock goes back, refunds are capped by
// what was sold and the bill's discount, udhaar is reduced, and other shops'
// data is untouchable.
const ROOT = new URL("../../supabase/", import.meta.url).pathname;
const db = new PGlite();
const run = (sql) => db.exec(sql);
await run(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
`);
await run(fs.readFileSync(ROOT + "schema.sql", "utf8").replace(/create extension[^;]*;/gi, ""));
await run(`grant usage on schema public, auth to anon, authenticated, service_role;
  grant all on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to authenticated, service_role;`);
const mig = fs.readFileSync(ROOT + "migrations/031_returns_reminders_summary.sql", "utf8");
await run(mig);
await run(mig); // safe to run twice
await run(`grant all on all tables in schema public to authenticated, service_role;`);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const as = async (uid) => { await run(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid === "anon" ? "anon" : "authenticated"};`); };
const fails = async (sql, re) => { try { await run(sql); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const q = async (sql) => (await db.query(sql)).rows;

await run("reset role");
const ids = {};
for (const n of ["A", "B", "S"]) ids[n] = (await q(`insert into auth.users (email) values ('${n}@x') returning id`))[0].id;
for (const n of ["A", "B"]) {
  const shop = (await q(`insert into shops (owner_id, name, type) values ('${ids[n]}', 'Shop ${n}', 'kirana') returning id`))[0].id;
  ids["shop" + n] = shop;
  await run(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${ids[n]}', 'owner', '${n}', '{}')`);
  const pid = (await q(`insert into products (owner_id, name) values ('${ids[n]}', 'Sugar') returning id`))[0].id;
  ids[n + "Sugar"] = (await q(`insert into shop_products (shop_id, product_id, price, stock, cost_price) values ('${shop}', '${pid}', 50, 10, 40) returning id`))[0].id;
}
await run(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${ids.shopA}', '${ids.S}', 'staff', 'S', '{"inventory": true}')`);

const mkBill = async (shop, pid, qty, price, discount, type, phone) => {
  const sub = qty * price;
  return (await q(`insert into bills (shop_id, bill_no, customer_name, customer_phone, items, subtotal, discount_amount, total, payment_type)
    values ('${shop}', 'B-${Math.random()}', 'Ravi', ${phone ? `'${phone}'` : "null"}, '${JSON.stringify([{ shop_product_id: pid, name: "Sugar", unit: "kg", price, gst: 5, qty }])}'::jsonb,
    ${sub}, ${discount}, ${sub - discount}, '${type}') returning id`))[0].id;
};
const cashBill = await mkBill(ids.shopA, ids.ASugar, 4, 50, 20, "cash", null); // total 180 for 4kg => 45/kg
const creditBill = await mkBill(ids.shopA, ids.ASugar, 2, 50, 0, "credit", "9999900000");
await run(`insert into credits (shop_id, phone, name, amount, type) values ('${ids.shopA}', '9999900000', 'Ravi', 100, 'charge')`);
const L = (qty) => `'${JSON.stringify([{ shop_product_id: ids.ASugar, qty }])}'::jsonb`;

await as(ids.A);
const r1 = (await q(`select refund_amount::float a, items from process_return('${ids.shopA}', '${cashBill}', ${L(1)}, 'cash', 'torn pack')`))[0];
ok(r1.a === 45, "refund honours the bill's discount (1 kg of a 20-off bill = 45, not 50)");
ok(Number((await q(`select stock::float s from shop_products where id='${ids.ASugar}'`))[0].s) === 11, "stock goes back up");
ok((await q(`select * from movements where reason='Return'`)).length === 1, "stock movement recorded");
ok((await q(`select * from stock_batches where reason='Return' and qty_remaining = 1`)).length === 1, "return recorded as a batch");
ok(await fails(`select process_return('${ids.shopA}', '${cashBill}', ${L(4)}, 'cash')`, /Only 3/), "cannot return more than was sold (after earlier returns)");
await run(`select process_return('${ids.shopA}', '${cashBill}', ${L(3)}, 'upi')`);
ok(await fails(`select process_return('${ids.shopA}', '${cashBill}', ${L(1)}, 'cash')`, /Only 0/), "fully returned bill cannot be returned again");
ok(await fails(`select process_return('${ids.shopA}', '${cashBill}', ${L(0)}, 'cash')`, /more than zero/), "zero quantity refused");
ok(await fails(`select process_return('${ids.shopA}', '${cashBill}', '[]'::jsonb, 'cash')`, /at least one/), "empty return refused");
ok(await fails(`select process_return('${ids.shopA}', '${cashBill}', ${L(1)}, 'bitcoin')`, /unknown refund/), "unknown refund method refused");
ok(await fails(`select process_return('${ids.shopA}', '${creditBill}', ${L(1)}, 'cash')`, /udhaar/), "an udhaar bill cannot be refunded in cash");
ok(await fails(`select process_return('${ids.shopA}', '${cashBill}', ${L(1)}, 'credit')`, /phone/), "udhaar adjustment needs a customer phone");
const r2 = (await q(`select refund_amount::float a, id from process_return('${ids.shopA}', '${creditBill}', ${L(1)}, 'credit')`))[0];
ok(r2.a === 50, "udhaar bill return refunds 50");
const cr = await q(`select amount::float a, type, return_id from credits where return_id is not null`);
ok(cr.length === 1 && cr[0].a === 50 && cr[0].type === "payment" && cr[0].return_id === r2.id, "customer's udhaar reduced by a linked payment row");

// who may do it
await as(ids.B);
ok(await fails(`select process_return('${ids.shopA}', '${creditBill}', ${L(1)}, 'credit')`, /not permitted/), "another shop's owner cannot take returns here");
ok((await q(`select * from sale_returns`)).length === 0, "another shop cannot read returns");
await as(ids.S);
ok(await fails(`select process_return('${ids.shopA}', '${creditBill}', ${L(1)}, 'credit')`, /not permitted/), "staff without billing permission cannot take returns");
await as(ids.A);
ok(await fails(`insert into sale_returns (shop_id, bill_no, items, refund_amount, refund_method) values ('${ids.shopA}', 'x', '[]', 1, 'cash')`, /row-level security/), "no direct inserts into sale_returns");
await as("anon");
ok(await fails(`select process_return('${ids.shopA}', '${creditBill}', ${L(1)}, 'credit')`, /permission denied/), "anonymous callers cannot take returns");

// reminder log + settings
await as(ids.A);
await run(`insert into reminder_log (shop_id, phone, amount) values ('${ids.shopA}', '9999900000', 50)`);
ok((await q(`select * from reminder_log`)).length === 1, "owner can log a reminder");
await as(ids.B);
ok(await fails(`insert into reminder_log (shop_id, phone) values ('${ids.shopA}', '1')`, /row-level security/), "cannot log reminders into another shop");
ok((await q(`select * from reminder_log`)).length === 0, "cannot read another shop's reminder log");
await as(ids.A);
await run(`update shops set summary_enabled = true, notify_phone = '9876543210', reminders_enabled = true, reminder_every_days = 3 where id = '${ids.shopA}'`);
ok(await fails(`update shops set reminder_every_days = 0 where id = '${ids.shopA}'`, /check/), "reminder interval must be 1-60 days");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
