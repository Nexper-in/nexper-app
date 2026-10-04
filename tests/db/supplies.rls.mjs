import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

// Run: npm run test:db. Loads schema.sql and migration 030 into an in-memory
// Postgres (PGlite) and checks, as real roles, that one shop can never read or
// write another shop's supply data and that the save function enforces its rules.
const ROOT = new URL("../../supabase/", import.meta.url).pathname;
const db = new PGlite();
const run = (sql) => db.exec(sql);

// --- stand-ins for what Supabase provides ---
await run(`
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
`);
let schema = fs.readFileSync(ROOT + "schema.sql", "utf8").replace(/create extension[^;]*;/gi, "");
try { await run(schema); } catch (e) { console.log("schema.sql load failed:", e.message); process.exit(1); }
await run(`grant usage on schema public, auth to anon, authenticated, service_role;
  grant all on all tables in schema public to authenticated, service_role;
  grant execute on all functions in schema public to authenticated, service_role;`);
const mig = fs.readFileSync(ROOT + "migrations/030_supplies.sql", "utf8");
await run(mig);
await run(mig); // safe to run twice
await run(`grant all on all tables in schema public to authenticated, service_role;`);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const as = async (uid) => { await run(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${uid === "anon" ? "anon" : "authenticated"};`); };
const fails = async (sql, re) => { try { await run(sql); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const q = async (sql) => (await db.query(sql)).rows;

// --- seed as superuser ---
await run("reset role");
const ids = {};
for (const n of ["A", "B", "S", "H"]) ids[n] = (await q(`insert into auth.users (email) values ('${n}@x') returning id`))[0].id;
for (const n of ["A", "B"]) {
  const shop = (await q(`insert into shops (owner_id, name, type) values ('${ids[n]}', 'Shop ${n}', 'canteen') returning id`))[0].id;
  ids["shop" + n] = shop;
  await run(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${ids[n]}', 'owner', '${n}', '{}')`);
  for (const [name, price] of [["Tea", 10], ["Biscuit", 5]]) {
    const pid = (await q(`insert into products (owner_id, name) values ('${ids[n]}', '${name}') returning id`))[0].id;
    ids[`${n}${name}`] = (await q(`insert into shop_products (shop_id, product_id, price) values ('${shop}', '${pid}', ${price}) returning id`))[0].id;
  }
}
await run(`insert into shop_members (shop_id, user_id, role, name, permissions) values
  ('${ids.shopA}', '${ids.S}', 'staff', 'S', '{"billing": true}'),
  ('${ids.shopA}', '${ids.H}', 'staff', 'H', '{"supplies": true}')`);

// --- departments ---
await as(ids.A);
await run(`insert into supply_points (shop_id, name, phone) values ('${ids.shopA}', 'ICU', '9876543210'), ('${ids.shopA}', 'Ward 3', null)`);
const icu = (await q(`select id from supply_points where name='ICU'`))[0].id;
const ward = (await q(`select id from supply_points where name='Ward 3'`))[0].id;
ok(await fails(`insert into supply_points (shop_id, name) values ('${ids.shopA}', 'icu')`, /unique|duplicate/), "department names are unique per shop, ignoring case");
await as(ids.B);
ok((await q(`select * from supply_points`)).length === 0, "B cannot see A's departments");
ok(await fails(`insert into supply_points (shop_id, name) values ('${ids.shopA}', 'Sneaky')`, /row-level security/), "B cannot add a department to A's shop");
await run(`insert into supply_points (shop_id, name) values ('${ids.shopB}', 'ICU')`); // same name in another shop is fine
ok(true, "same department name allowed in another shop");
const bIcu = (await q(`select id from supply_points`))[0].id;
await as(ids.S);
ok((await q(`select * from supply_points`)).length === 0, "billing-only staff cannot see departments");
ok(await fails(`insert into supply_points (shop_id, name) values ('${ids.shopA}', 'X')`, /row-level security/), "billing-only staff cannot add departments");

// --- saving the round ---
const rows = (arr) => `'${JSON.stringify(arr)}'::jsonb`;
const today = (await q(`select current_date::text d`))[0].d;
await as(ids.A);
await run(`select save_supply_round('${ids.shopA}', current_date, ${rows([
  { point_id: icu, shop_product_id: ids.ATea, qty: 12 }, { point_id: icu, shop_product_id: ids.ABiscuit, qty: 10 },
  { point_id: ward, shop_product_id: ids.ATea, qty: 8 }])})`);
let e = await q(`select point_id, item_name, qty, unit_price::float from supply_entries order by item_name, qty`);
ok(e.length === 3 && e.find((x) => x.item_name === "Tea" && x.qty === 12 && x.unit_price === 10), "round saved with the shop's own prices");
await run(`select save_supply_round('${ids.shopA}', current_date, ${rows([{ point_id: icu, shop_product_id: ids.ATea, qty: 15 }])})`);
ok((await q(`select qty from supply_entries where point_id='${icu}' and item_name='Tea'`))[0].qty === 15 && (await q(`select count(*)::int c from supply_entries`))[0].c === 3, "saving again sets the quantity, no doubling");
await run(`update shop_products set price = 12 where id = '${ids.ATea}'`);
await run(`select save_supply_round('${ids.shopA}', current_date, ${rows([{ point_id: icu, shop_product_id: ids.ATea, qty: 16 }])})`);
ok(Number((await q(`select unit_price::float p from supply_entries where point_id='${icu}' and item_name='Tea'`))[0].p) === 10, "a later price change does not rewrite the day's price");
await run(`select save_supply_round('${ids.shopA}', current_date - 1, ${rows([{ point_id: icu, shop_product_id: ids.ATea, qty: 20 }])})`);
ok(Number((await q(`select unit_price::float p from supply_entries where entry_date = current_date - 1`))[0].p) === 12, "a new day picks up the new price");
await run(`select save_supply_round('${ids.shopA}', current_date, ${rows([{ point_id: ward, shop_product_id: ids.ATea, qty: 0 }])})`);
ok((await q(`select * from supply_entries where point_id='${ward}'`)).length === 0, "quantity 0 removes the line");

// --- who may write ---
ok(await fails(`insert into supply_entries (shop_id, point_id, item_name, unit_price, qty, entry_date) values ('${ids.shopA}', '${icu}', 'Tea', 0, 500, current_date)`, /row-level security/), "no direct writes to entries (price cannot be set by the browser)");
ok(await fails(`update supply_entries set qty = 1`, null) || (await q(`select count(*)::int c from supply_entries where qty = 1`))[0].c === 0, "no direct updates to entries");
await as(ids.B);
ok(await fails(`select save_supply_round('${ids.shopA}', current_date, ${rows([])})`, /Not allowed/), "another shop's owner cannot save into A's round");
ok(await fails(`select save_supply_round('${ids.shopB}', current_date, ${rows([{ point_id: icu, shop_product_id: ids.BTea, qty: 1 }])})`, /Unknown department/), "a department from another shop is refused");
ok(await fails(`select save_supply_round('${ids.shopB}', current_date, ${rows([{ point_id: bIcu, shop_product_id: ids.ATea, qty: 1 }])})`, /Unknown item/), "an item from another shop is refused");
ok((await q(`select * from supply_entries`)).length === 0, "B cannot read A's entries");
await as(ids.S);
ok(await fails(`select save_supply_round('${ids.shopA}', current_date, ${rows([])})`, /Not allowed/), "billing-only staff cannot save a round");
ok((await q(`select * from supply_entries`)).length === 0, "billing-only staff cannot read entries");
await as(ids.H);
await run(`select save_supply_round('${ids.shopA}', current_date, ${rows([{ point_id: ward, shop_product_id: ids.ABiscuit, qty: 4 }])})`);
ok((await q(`select * from supply_entries where point_id='${ward}'`)).length === 1, "a helper with the Supplies permission can save");
await as(ids.A);
ok(await fails(`select save_supply_round('${ids.shopA}', current_date + 5, ${rows([])})`, /out of range/), "future dates are refused");
ok(await fails(`select save_supply_round('${ids.shopA}', current_date - 400, ${rows([])})`, /out of range/), "dates over a year old are refused");
ok(await fails(`select save_supply_round('${ids.shopA}', current_date, ${rows([{ point_id: icu, shop_product_id: ids.ATea, qty: -3 }])})`, /Bad quantity/), "negative quantity is refused");
ok(await fails(`select save_supply_round('${ids.shopA}', current_date, ${rows([{ point_id: icu, shop_product_id: ids.ATea, qty: 99999 }])})`, /Bad quantity/), "absurd quantity is refused");
await as("anon");
ok(await fails(`select save_supply_round('${ids.shopA}', current_date, ${rows([])})`, /permission denied/), "anonymous callers cannot run the save function");
ok(await fails(`select * from supply_balances('${ids.shopA}')`, /permission denied/), "anonymous callers cannot run balances");

// --- payments and balances ---
await as(ids.H);
await run(`insert into supply_payments (shop_id, point_id, amount, paid_on, method) values ('${ids.shopA}', '${icu}', 100, current_date, 'cash')`);
ok(await fails(`insert into supply_payments (shop_id, point_id, amount) values ('${ids.shopB}', '${icu}', 5)`, /row-level security/), "a helper cannot pay into another shop");
ok(await fails(`insert into supply_payments (shop_id, point_id, amount) values ('${ids.shopA}', '${bIcu}', 5)`, /row-level security/), "a payment cannot name another shop's department");
ok(await fails(`insert into supply_payments (shop_id, point_id, amount) values ('${ids.shopA}', '${icu}', -5)`, /check/), "payments must be positive");
await run(`delete from supply_payments`);
await as(ids.A);
ok((await q(`select * from supply_payments`)).length === 1, "a helper cannot remove a payment");
const bal = await q(`select point_id, charged::float, paid::float, last_date::text from supply_balances('${ids.shopA}') order by charged desc`);
// ICU: day (16 tea at 10 = 160) + (10 biscuit at 5 = 50) + yesterday 20 tea at 12 = 240 -> 450; paid 100
ok(bal.find((b) => b.point_id === icu)?.charged === 450 && bal.find((b) => b.point_id === icu)?.paid === 100, "balance = supplied minus paid");
ok(Number((await q(`select supply_opening('${icu}', current_date)`))[0].supply_opening) === 240, "opening balance counts only what came before the date");
await as(ids.B);
ok((await q(`select * from supply_balances('${ids.shopA}')`)).length === 0, "B gets no balances for A's shop");
await as(ids.A);
await run(`delete from supply_payments`);
ok((await q(`select * from supply_payments`)).length === 0, "the owner can remove a payment");
ok(await fails(`delete from supply_points where id='${icu}'`, null) || (await q(`select count(*)::int c from supply_points where id='${icu}'`))[0].c === 1, "departments cannot be deleted by users");

// --- history survives an item being removed ---
await run("reset role");
await run(`delete from shop_products where id = '${ids.ATea}'`);
const kept = await q(`select item_name, shop_product_id from supply_entries where item_name = 'Tea'`);
ok(kept.length >= 1 && kept.every((k) => k.shop_product_id === null), "removing an item keeps its supply history");
// --- shop removal cleans up ---
await run(`delete from shops where id = '${ids.shopA}'`);
ok((await q(`select count(*)::int c from supply_points where shop_id = '${ids.shopA}'`))[0].c === 0, "removing a shop removes its supply data");
ok((await q(`select count(*)::int c from supply_points where shop_id = '${ids.shopB}'`))[0].c === 1, "and leaves other shops alone");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
