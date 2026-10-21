// Run: node tests/db/game_rentals.rls.mjs (part of npm run test:db). Migration 047: Play area
// stations and sessions are shop-isolated and gated by the 'play_area' permission; start/stop
// compute the right amount and can't double-run a station; a finished session becomes a line on
// a bill without touching stock, and stock-backed lines on the same bill still behave exactly as
// before (migration 042's save_bill / _deduct_stock).
import { buildDb, as, asService, counter } from "./setup.mjs";
import crypto from "node:crypto";

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
const ownerA = await user("ownerA"), ownerB = await user("ownerB"), helper = await user("helper"), biller = await user("biller");

await as(db, ownerA);
const shopA = (await q(`insert into shops (owner_id, name, type) values ('${ownerA}', 'Tea House', 'canteen') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shopA}', '${ownerA}', 'owner', 'OA', '{}')`);
await as(db, ownerB);
const shopB = (await q(`insert into shops (owner_id, name, type) values ('${ownerB}', 'Other Shop', 'canteen') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shopB}', '${ownerB}', 'owner', 'OB', '{}')`);
await asService(db);
// a helper with the play_area permission, and a billing-only staffer without it
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values
  ('${shopA}', '${helper}', 'staff', 'Helper', '{"play_area": true}'),
  ('${shopA}', '${biller}', 'staff', 'Biller', '{"billing": true}')`);

// --- stations: CRUD and isolation ---
await as(db, ownerA);
const carromId = (await q(`insert into game_stations (shop_id, name, type, hourly_rate) values ('${shopA}', 'Carrom Table 1', 'carrom', 50) returning id`))[0].id;
await db.exec(`insert into game_stations (shop_id, name, type, hourly_rate) values ('${shopA}', 'Carrom Table 2', 'carrom', 70), ('${shopA}', 'Chess Set', 'chess', 30)`);
t.ok(await fails(`insert into game_stations (shop_id, name, type, hourly_rate) values ('${shopA}', 'carrom table 1', 'carrom', 50)`), "station names are unique per shop, ignoring case");
t.ok((await q(`select * from game_stations`)).length === 3, "owner sees all three of their stations");

await as(db, ownerB);
t.ok((await q(`select * from game_stations`)).length === 0, "another shop's owner sees no stations");
t.ok(await fails(`insert into game_stations (shop_id, name, type, hourly_rate) values ('${shopA}', 'Sneaky', 'carrom', 1)`), "another owner cannot add a station to shop A");
const otherCarrom = (await q(`insert into game_stations (shop_id, name, type, hourly_rate) values ('${shopB}', 'Carrom Table 1', 'carrom', 999) returning id`))[0].id;
t.ok(otherCarrom, "the same station name is fine in a different shop");

await as(db, biller);
t.ok((await q(`select * from game_stations`)).length === 0, "billing-only staff cannot see stations");
t.ok(await fails(`select start_game_session('${carromId}')`), "billing-only staff cannot start a session");

// --- start / stop ---
await as(db, ownerA);
const started = (await q(`select * from start_game_session('${carromId}')`))[0];
t.ok(started.stopped_at === null && Number(started.rate_at_start) === 50, "starting records the station's current rate");
t.ok(await fails(`select start_game_session('${carromId}')`), "a station already running cannot be started again");

// back-date started_at to simulate 25 minutes of play, as the superuser (no RLS update policy for users)
await asService(db);
await db.exec(`update game_sessions set started_at = now() - interval '25 minutes' where id = '${started.id}'`);
await as(db, ownerA);
const stopped = (await q(`select * from stop_game_session('${started.id}')`))[0];
// Backdated 25 minutes, but a little real time also passes running the test itself, and the
// amount is rounded UP to the next full minute, then to the nearest rupee (049) -- so the
// true answer is 25 or 26 minutes at ₹50/hr (₹20.83 -> ₹21, or ₹21.67 -> ₹22), never less
// (that would mean time ran backwards).
t.ok(Number(stopped.amount) >= 21 && Number(stopped.amount) <= 22, `25ish minutes at ₹50/hr should round to ₹21-22 (got ${stopped.amount})`);
const again = (await q(`select * from stop_game_session('${started.id}')`))[0];
t.ok(Number(again.amount) === Number(stopped.amount), "stopping an already-stopped session is harmless and returns the same amount");

const started2 = (await q(`select * from start_game_session('${carromId}')`))[0];
await asService(db);
await db.exec(`update game_sessions set started_at = now() - interval '40 seconds' where id = '${started2.id}'`);
await as(db, ownerA);
const quick = (await q(`select * from stop_game_session('${started2.id}')`))[0];
t.ok(Number(quick.amount) === Math.round((1 * 50) / 60), "a part-minute session is rounded up to a full minute, then to the nearest rupee, never free");

await as(db, ownerB);
t.ok(await fails(`select stop_game_session('${started.id}')`), "another shop's owner cannot stop A's session");
t.ok((await q(`select * from unbilled_game_sessions('${shopA}')`)).length === 0, "another shop's owner gets nothing from A's unbilled sessions");

// --- attaching a finished session to a bill ---
await as(db, ownerA);
const unbilled = await q(`select * from unbilled_game_sessions('${shopA}')`);
t.ok(unbilled.length === 2 && unbilled.some((s) => s.station_name === "Carrom Table 1"), "both finished sessions are waiting to be billed");

const prod = (await q(`insert into products (owner_id, name) values ('${ownerA}', 'Tea') returning id`))[0].id;
const sp = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${shopA}', '${prod}', 10, 5) returning id`))[0].id;
const billId = crypto.randomUUID();
const billItems = JSON.stringify([
  { shop_product_id: sp, name: "Tea", qty: 2, price: 10, unit: "pcs", gst: 0 },
  { shop_product_id: null, session_id: started.id, name: "Carrom Table 1 (25 min)", qty: 1, price: Number(stopped.amount), unit: "session", gst: 0 },
]);
const saved = (await q(`select save_bill('${JSON.stringify({
  id: billId, shop_id: shopA, bill_no: "KS-9001", items: JSON.parse(billItems),
  subtotal: 20 + Number(stopped.amount), discount_amount: 0, total: 20 + Number(stopped.amount), payment_type: "cash", payment_method: "cash",
}).replace(/'/g, "''")}')`))[0].save_bill;
t.ok(saved.created === true, "a bill mixing a stock item and a game-session line saves");
t.ok(Number((await q(`select stock from shop_products where id = '${sp}'`))[0].stock) === 3, "the stock-backed line still deducts stock normally");
t.ok((await q(`select count(*)::int c from movements where shop_product_id = '${sp}'`))[0].c === 1, "the stock-backed line still logs a movement");
t.ok((await q(`select count(*)::int c from movements`))[0].c === 1, "the game-session line logs no movement at all");

await db.exec(`select attach_game_session_to_bill('${started.id}', '${billId}')`);
t.ok((await q(`select bill_id from game_sessions where id = '${started.id}'`))[0].bill_id === billId, "attaching records the bill on the session");
t.ok(await fails(`select attach_game_session_to_bill('${started.id}', '${billId}')`), "a session already billed cannot be attached again");
t.ok((await q(`select * from unbilled_game_sessions('${shopA}')`)).length === 1, "the billed session drops off the unbilled list");

await as(db, ownerB);
t.ok(await fails(`select attach_game_session_to_bill('${started2.id}', '${billId}')`), "a session cannot be attached to another shop's bill");

// --- a bogus shop_product_id is still refused (only a truly-absent one is skipped) ---
await as(db, ownerA);
const badBill = crypto.randomUUID();
t.ok(
  await fails(`select save_bill('${JSON.stringify({
    id: badBill, shop_id: shopA, bill_no: "KS-9002",
    items: [{ shop_product_id: crypto.randomUUID(), name: "Ghost", qty: 1, price: 5, unit: "pcs", gst: 0 }],
    subtotal: 5, discount_amount: 0, total: 5, payment_type: "cash", payment_method: "cash",
  }).replace(/'/g, "''")}')`),
  "a line naming a shop_product_id that doesn't exist is still refused, not silently skipped"
);

console.log(`${t.pass} passed, ${t.fail} failed (game rentals)`);
process.exit(t.fail ? 1 : 0);
