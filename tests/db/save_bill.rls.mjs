// Run: node tests/db/save_bill.rls.mjs (part of npm run test:db). S13: save_bill is idempotent and
// all-or-nothing: the same bill sent again (a retry, an offline replay) changes nothing; stock
// never goes below zero; another shop, a visitor and a helper without billing are refused.
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
const owner = await user("owner"), other = await user("other"), biller = await user("biller"), reader = await user("reader");
await as(db, owner);
const shop = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'S', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${owner}', 'owner', 'O', '{}')`);
await as(db, other);
const shop2 = (await q(`insert into shops (owner_id, name, type) values ('${other}', 'S2', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop2}', '${other}', 'owner', 'O2', '{}')`);
await asService(db);
// a helper who can bill but not see udhaar, and one who cannot bill
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${biller}', 'staff', 'Biller', '{"billing": true}'), ('${shop}', '${reader}', 'staff', 'Reader', '{"history": true}')`);
await as(db, owner);
const prod = (await q(`insert into products (owner_id, name) values ('${owner}', 'Tea') returning id`))[0].id;
const sp = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${shop}', '${prod}', 10, 20) returning id`))[0].id;
const prod2 = (await q(`insert into products (owner_id, name) values ('${owner}', 'Rare') returning id`))[0].id;
const sp2 = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${shop}', '${prod2}', 50, 1) returning id`))[0].id;

const bill = (over = {}) => {
  const b = {
    id: crypto.randomUUID(),
    shop_id: shop,
    bill_no: "KS-1001",
    customer_name: null,
    customer_phone: null,
    items: [{ shop_product_id: sp, name: "Tea", qty: 2, price: 10, unit: "pcs", gst: 0 }],
    subtotal: 20,
    discount_amount: 0,
    total: 20,
    payment_type: "cash",
    payment_method: "cash",
    date: new Date().toISOString(),
    ...over,
  };
  return b;
};
const save = async (b) => (await q(`select save_bill('${JSON.stringify(b).replace(/'/g, "''")}'::jsonb) r`))[0].r;
const stock = async (id = sp) => Number((await q(`select stock from shop_products where id = '${id}'`))[0].stock);
const count = async (table, where = `shop_id = '${shop}'`) => (await q(`select count(*)::int c from ${table} where ${where}`))[0].c;

// ---------- 1. one bill, sent three times ----------
const b1 = bill();
const r1 = await save(b1);
t.ok(r1.created === true && r1.bill_no === "KS-1001" && r1.id === b1.id, "the first save creates the bill");
const r2 = await save(b1);
const r3 = await save(b1);
t.ok(r2.created === false && r3.created === false && r2.bill_no === "KS-1001", "the same bill again is answered 'already saved'");
t.ok((await count("bills")) === 1, "still exactly one bill");
t.ok((await stock()) === 18, "and stock went down once (20 -> 18), not three times");
t.ok((await count("movements", `shop_id = '${shop}' and reason = 'sale'`)) === 1, "one stock movement");

// ---------- 2. udhaar: one charge, however many times ----------
const creditId = crypto.randomUUID();
const b2 = bill({ bill_no: "KS-1002", payment_type: "credit", customer_name: "Ravi", customer_phone: "9000000001", credit_id: creditId, total: 20 });
await save(b2);
await save(b2);
await save(b2);
t.ok((await count("credits")) === 1, "an udhaar bill sent three times adds one charge");
t.ok(Number((await q(`select amount from credits where id = '${creditId}'`))[0].amount) === 20, "of the right amount, with the id the device chose");
t.ok((await stock()) === 16, "and took stock once");
t.ok(/mobile number/.test((await fails(`select save_bill('${JSON.stringify(bill({ payment_type: "credit" }))}'::jsonb)`)) || ""), "an udhaar bill needs a phone number");
t.ok((await count("bills")) === 2, "which saved nothing");

// ---------- 3. a clashing bill number gets the next free suffix ----------
const b3 = bill({ bill_no: "KS-1001" });
const r4 = await save(b3);
t.ok(r4.created === true && r4.bill_no === "KS-1001-2", `a number another device took becomes ${r4.bill_no}`);
const r5 = await save(bill({ bill_no: "KS-1001" }));
t.ok(r5.bill_no === "KS-1001-3", "and the next one -3");
t.ok((await stock()) === 12, "each real bill took stock once");

// ---------- 4. all or nothing ----------
const sBefore = await stock(), bBefore = await count("bills"), cBefore = await count("credits"), mBefore = await count("movements");
const tooMany = bill({ bill_no: "KS-2000", payment_type: "credit", customer_phone: "9000000002", customer_name: "Sita", items: [{ shop_product_id: sp, name: "Tea", qty: 1, price: 10 }, { shop_product_id: sp2, name: "Rare", qty: 5, price: 50 }], subtotal: 260, total: 260 });
t.ok(/Only .* left in stock/.test((await fails(`select save_bill('${JSON.stringify(tooMany)}'::jsonb)`)) || ""), "an item that has run out refuses the whole bill");
t.ok((await stock()) === sBefore && (await stock(sp2)) === 1, "no stock was taken, not even for the first item");
t.ok((await count("bills")) === bBefore && (await count("credits")) === cBefore && (await count("movements")) === mBefore, "no bill, no udhaar charge and no movement was left behind");
t.ok(/at least one item/.test((await fails(`select save_bill('${JSON.stringify(bill({ items: [] }))}'::jsonb)`)) || ""), "an empty bill is refused");
t.ok(/Unknown payment type/.test((await fails(`select save_bill('${JSON.stringify(bill({ payment_type: "barter" }))}'::jsonb)`)) || ""), "an unknown payment type is refused");
// a replay after the shop ran out is still just "already saved": the first save is the truth
await db.exec(`update shop_products set stock = 0 where id = '${sp}'`);
t.ok((await save(b1)).created === false, "replaying an old bill after stock ran out is harmless (still 'already saved')");

// ---------- 5. who may ----------
await db.exec(`update shop_products set stock = 50 where id = '${sp}'`);
await as(db, other);
t.ok(/not permitted/.test((await fails(`select save_bill('${JSON.stringify(bill())}'::jsonb)`)) || ""), "another shop's owner cannot save a bill into this shop");
await as(db, "anon");
t.ok(/not permitted|permission denied/.test((await fails(`select save_bill('${JSON.stringify(bill())}'::jsonb)`)) || ""), "a visitor cannot");
await as(db, reader);
t.ok(/not permitted/.test((await fails(`select save_bill('${JSON.stringify(bill())}'::jsonb)`)) || ""), "a helper without the billing permission cannot");
await as(db, biller);
const hb = bill({ bill_no: "KS-3001", payment_type: "credit", customer_name: "Mina", customer_phone: "9000000003", credit_id: crypto.randomUUID() });
t.ok((await save(hb)).created === true, "a billing-only helper can make an udhaar bill");
await as(db, owner);
t.ok((await count("credits", `phone = '9000000003'`)) === 1, "and the udhaar charge was recorded");
await as(db, biller);
t.ok((await q(`select count(*)::int c from credits`))[0].c === 0, "while the helper still cannot read the Udhaar list");
// a bill id that already exists in ANOTHER shop is refused
await as(db, other);
const foreign = bill({ shop_id: shop2, items: [{ shop_product_id: sp, name: "Tea", qty: 1 }] });
t.ok(/not found in this shop|not permitted/.test((await fails(`select save_bill('${JSON.stringify(foreign)}'::jsonb)`)) || ""), "an item of another shop cannot be sold");
const mine2 = (await q(`insert into products (owner_id, name) values ('${other}', 'Mine') returning id`))[0].id;
const msp = (await q(`insert into shop_products (shop_id, product_id, price, stock) values ('${shop2}', '${mine2}', 5, 9) returning id`))[0].id;
const stolenId = b1.id; // b1 lives in `shop`
const clash = bill({ id: stolenId, shop_id: shop2, items: [{ shop_product_id: msp, name: "Mine", qty: 1 }] });
t.ok(/not permitted/.test((await fails(`select save_bill('${JSON.stringify(clash)}'::jsonb)`)) || ""), "a bill id that belongs to another shop is refused, and reveals nothing");

// ---------- 6. a closed shop ----------
await as(db, owner);
await db.exec(`select close_shop('${shop}', 'test')`);
t.ok(/shop is closed/.test((await fails(`select save_bill('${JSON.stringify(bill())}'::jsonb)`)) || ""), "a closed shop takes no new bills");
await db.exec(`select reopen_shop('${shop}')`);

// ---------- 7. old app versions still work ----------
const s0 = await stock();
await db.exec(`select sell_items('${shop}', '[{"shop_product_id":"${sp}","name":"Tea","qty":3}]'::jsonb)`);
t.ok((await stock()) === s0 - 3, "the old sell_items call still works for apps not yet updated");
await as(db, other);
t.ok(/not permitted/.test((await fails(`select sell_items('${shop}', '[{"shop_product_id":"${sp}","name":"Tea","qty":1}]'::jsonb)`)) || ""), "and still checks the caller");
t.ok(/permission denied/.test((await fails(`select _deduct_stock('${shop}', '[]'::jsonb)`)) || ""), "the internal stock function cannot be called directly");

console.log(`${t.pass} passed, ${t.fail} failed (save_bill)`);
process.exit(t.fail ? 1 : 0);
