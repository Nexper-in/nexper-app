// Run: node tests/db/game_session_orders.rls.mjs (part of npm run test:db). Migration 051:
// per-player orders on a running play-area session are shop-isolated, gated by 'play_area'
// the same as stations/sessions, a player/order must belong to the right session and shop,
// an order already on a bill can't be edited or removed, and attach_game_orders_to_bill marks
// a whole session's unbilled orders as billed in one call without touching stock itself (that
// still happens through the normal save_bill / _deduct_stock path, same as any other line).
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
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values
  ('${shopA}', '${helper}', 'staff', 'Helper', '{"play_area": true}'),
  ('${shopA}', '${biller}', 'staff', 'Biller', '{"billing": true}')`);

await as(db, ownerA);
const stationId = (await q(`insert into game_stations (shop_id, name, type, hourly_rate) values ('${shopA}', 'Snooker 1', 'snooker', 60) returning id`))[0].id;
const session = (await q(`select * from start_game_session('${stationId}')`))[0];

// --- players: CRUD, shop/session matching, isolation ---
const rahul = (await q(`insert into game_session_players (shop_id, session_id, name, phone) values ('${shopA}', '${session.id}', 'Rahul', '9900000001') returning id`))[0].id;
const priya = (await q(`insert into game_session_players (shop_id, session_id, name) values ('${shopA}', '${session.id}', 'Priya') returning id`))[0].id;
t.ok((await q(`select * from game_session_players where session_id = '${session.id}'`)).length === 2, "both players recorded against the session");
t.ok(await fails(`insert into game_session_players (shop_id, session_id, name) values ('${shopA}', '${session.id}', '')`), "an empty player name is refused");

await as(db, ownerB);
t.ok(await fails(`insert into game_session_players (shop_id, session_id, name) values ('${shopB}', '${session.id}', 'Sneaky')`), "a session from another shop can't be used, even by that shop's own owner");
t.ok((await q(`select * from game_session_players`)).length === 0, "another shop's owner sees no players from shop A");

await as(db, biller);
t.ok((await q(`select * from game_session_players`)).length === 0, "billing-only staff cannot see players");
t.ok(await fails(`insert into game_session_players (shop_id, session_id, name) values ('${shopA}', '${session.id}', 'Nope')`), "billing-only staff cannot add a player");

// --- orders: catalog item, shop/session/player matching ---
await as(db, ownerA);
const prodTea = (await q(`insert into products (owner_id, name) values ('${ownerA}', 'Tea') returning id`))[0].id;
const teaSp = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${shopA}', '${prodTea}', 10, 50) returning id`))[0].id;
const prodCig = (await q(`insert into products (owner_id, name) values ('${ownerA}', 'Cigarette') returning id`))[0].id;
const cigSp = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${shopA}', '${prodCig}', 15, 50) returning id`))[0].id;

const rahulOrder = (await q(
  `insert into game_session_orders (shop_id, session_id, player_id, shop_product_id, name, price, qty) values
   ('${shopA}', '${session.id}', '${rahul}', '${teaSp}', 'Tea', 10, 1) returning id`
))[0].id;
const priyaOrder = (await q(
  `insert into game_session_orders (shop_id, session_id, player_id, shop_product_id, name, price, qty) values
   ('${shopA}', '${session.id}', '${priya}', '${cigSp}', 'Cigarette', 15, 2) returning id`
))[0].id;
const sharedOrder = (await q(
  `insert into game_session_orders (shop_id, session_id, player_id, shop_product_id, name, price, qty) values
   ('${shopA}', '${session.id}', null, '${teaSp}', 'Tea', 10, 1) returning id`
))[0].id;
t.ok(await fails(
  `insert into game_session_orders (shop_id, session_id, player_id, shop_product_id, name, price, qty) values
   ('${shopA}', '${session.id}', '${rahul}', '${teaSp}', 'Tea', 10, 0)`
), "a zero-quantity order is refused");

// A player from a different session (even the same shop) can't be used.
const otherStation = (await q(`insert into game_stations (shop_id, name, type, hourly_rate) values ('${shopA}', 'Snooker 2', 'snooker', 60) returning id`))[0].id;
const otherSession = (await q(`select * from start_game_session('${otherStation}')`))[0];
t.ok(await fails(
  `insert into game_session_orders (shop_id, session_id, player_id, shop_product_id, name, price, qty) values
   ('${shopA}', '${otherSession.id}', '${rahul}', '${teaSp}', 'Tea', 10, 1)`
), "a player can't be tagged on an order for a different session");

await as(db, ownerB);
t.ok((await q(`select * from game_session_orders`)).length === 0, "another shop's owner sees none of shop A's orders");

// --- unbilled_game_orders: what the New bill screen pulls into the cart ---
await as(db, ownerA);
const unbilled = await q(`select * from unbilled_game_orders('${shopA}', '${session.id}')`);
t.ok(unbilled.length === 3, "all three orders (two players, one shared) are waiting to be billed");
t.ok(unbilled.find((o) => o.id === rahulOrder).player_name === "Rahul", "Rahul's order carries his name");
t.ok(unbilled.find((o) => o.id === sharedOrder).player_name === null, "the shared order has no player name");

await as(db, ownerB);
t.ok((await q(`select * from unbilled_game_orders('${shopA}', '${session.id}')`)).length === 0, "another shop's owner gets nothing from shop A's unbilled orders");

// --- attaching a whole session's orders to a bill, alongside the stock-backed lines ---
await as(db, ownerA);
const billId = crypto.randomUUID();
const billItems = [
  { shop_product_id: teaSp, name: "Tea", qty: 1, price: 10, unit: "pcs", gst: 0, player_name: "Rahul" },
  { shop_product_id: cigSp, name: "Cigarette", qty: 2, price: 15, unit: "pcs", gst: 0, player_name: "Priya" },
  { shop_product_id: teaSp, name: "Tea", qty: 1, price: 10, unit: "pcs", gst: 0 },
];
const saved = (await q(`select save_bill('${JSON.stringify({
  id: billId, shop_id: shopA, bill_no: "KS-9101", items: billItems,
  subtotal: 60, discount_amount: 0, total: 60, payment_type: "cash", payment_method: "cash",
}).replace(/'/g, "''")}')`))[0].save_bill;
t.ok(saved.created === true, "a bill with per-player lines saves normally");
t.ok(Number((await q(`select stock from shop_products where id = '${teaSp}'`))[0].stock) === 48, "both tea lines (Rahul's and the shared one) deduct stock, exactly like any normal line");
t.ok(Number((await q(`select stock from shop_products where id = '${cigSp}'`))[0].stock) === 48, "Priya's cigarette order deducts stock");

await db.exec(`select attach_game_orders_to_bill('${session.id}', '${billId}')`);
t.ok((await q(`select count(*)::int c from game_session_orders where session_id = '${session.id}' and bill_id = '${billId}'`))[0].c === 3, "all three of the session's orders are now marked billed");
t.ok((await q(`select * from unbilled_game_orders('${shopA}', '${session.id}')`)).length === 0, "nothing from this session is unbilled any more");

// A session with no unbilled orders at all is a harmless no-op, not an error
// (a table might be billed for its time only, with no food/drink taken).
t.ok(!(await fails(`select attach_game_orders_to_bill('${otherSession.id}', '${billId}')`)), "attaching a session with no unbilled orders does nothing, and doesn't fail");

// A billed order can no longer be removed -- RLS's delete policy simply
// matches nothing for it, rather than raising an error, so check the row
// is still there instead of expecting the delete itself to fail.
await db.exec(`delete from game_session_orders where id = '${rahulOrder}'`);
t.ok((await q(`select * from game_session_orders where id = '${rahulOrder}'`)).length === 1, "an order already on a bill cannot be deleted");
// An unbilled order from a different session can still be removed by someone with permission.
await as(db, helper);
const toRemove = (await q(
  `insert into game_session_orders (shop_id, session_id, player_id, shop_product_id, name, price, qty) values
   ('${shopA}', '${otherSession.id}', null, '${teaSp}', 'Tea', 10, 1) returning id`
))[0].id;
await db.exec(`delete from game_session_orders where id = '${toRemove}'`);
t.ok((await q(`select * from game_session_orders where id = '${toRemove}'`)).length === 0, "play_area staff can remove an unbilled order they're not the owner of");

// --- update: migration 052 -- the qty stepper (PR #35) and reassigning a
// removed player's orders back to shared (removePlayer) both update an
// unbilled order's row in place, which migration 051 never gave a policy for.
await as(db, ownerA);
const stepperOrder = (await q(
  `insert into game_session_orders (shop_id, session_id, player_id, shop_product_id, name, price, qty) values
   ('${shopA}', '${otherSession.id}', null, '${teaSp}', 'Tea', 10, 1) returning id`
))[0].id;
await db.exec(`update game_session_orders set qty = 2 where id = '${stepperOrder}'`);
t.ok(Number((await q(`select qty from game_session_orders where id = '${stepperOrder}'`))[0].qty) === 2, "play_area staff can change an unbilled order's quantity (the qty stepper)");

await db.exec(`update game_session_orders set player_id = null where id = '${stepperOrder}'`);
t.ok((await q(`select player_id from game_session_orders where id = '${stepperOrder}'`))[0].player_id === null, "an order can be reassigned to shared when its player is removed");

// A billed order is history -- the update policy excludes it, same as delete.
await db.exec(`update game_session_orders set qty = 99 where id = '${rahulOrder}'`);
t.ok(Number((await q(`select qty from game_session_orders where id = '${rahulOrder}'`))[0].qty) !== 99, "a billed order's quantity can no longer be changed");

await as(db, ownerB);
await db.exec(`update game_session_orders set qty = 5 where id = '${stepperOrder}'`);
await as(db, ownerA);
t.ok(Number((await q(`select qty from game_session_orders where id = '${stepperOrder}'`))[0].qty) !== 5, "another shop's owner cannot update shop A's order quantity");

await as(db, ownerB);
t.ok(await fails(`select attach_game_orders_to_bill('${session.id}', '${billId}')`), "another shop's owner cannot attach shop A's session to a bill");

console.log(`${t.pass} passed, ${t.fail} failed (game session players/orders)`);
process.exit(t.fail ? 1 : 0);
