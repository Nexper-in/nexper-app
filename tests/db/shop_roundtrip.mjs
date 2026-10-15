// Run: node tests/db/shop_roundtrip.mjs (part of npm run test:db). S16: a shop exported and
// imported into an empty database comes back the same (ids and counts); a restore into the
// same database repairs a shop and never touches another shop's rows.
import { buildDb, counter } from "./setup.mjs";
import { pgliteClient } from "../../tools/migrate-core.mjs";
import { exportShop, importShop } from "../../tools/shop-copy-core.mjs";
import { seedStaging } from "../../scripts/seed-staging-core.mjs";
import { SHOP_EXPORT } from "../../lib/shopTables.js";

const t = counter();
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows;

const A = await buildDb();
const a = pgliteClient(A);
const owner = (await q(A, `insert into auth.users (email) values ('owner@staging.nexper.in') returning id`))[0].id;
const seeded = await seedStaging(a, owner);
const [shop1, shop2] = seeded.shops.map((s) => s.id);
// a returned bill, udhaar payment, staff row and a supply department make the data more varied
await A.exec(`
  insert into supply_points (shop_id, name) values ('${shop1}', 'Ward 3');
  insert into credits (shop_id, phone, name, amount, type, note) values ('${shop1}', '9000000010', 'Test Customer 1', 10, 'payment', 'paid');
  insert into expenses (shop_id, category, amount) values ('${shop1}', 'Rent', 500);
`);
const staff = (await q(A, `insert into auth.users (email) values ('helper@staging.nexper.in') returning id`))[0].id;
await A.exec(`insert into shop_members (shop_id, user_id, role, name, permissions, staff_code) values ('${shop1}', '${staff}', 'staff', 'Helper', '{"billing":true}', 'ABC123')`);

const counts = async (db, shopId) => {
  const out = {};
  for (const s of SHOP_EXPORT) {
    if (s.by === "self") out[s.table] = Number((await q(db, `select count(*) c from shops where id = $1`, [shopId]))[0].c);
    else if (s.by === "shop") out[s.table] = Number((await q(db, `select count(*) c from "${s.table}" where shop_id = $1${s.notNull ? ` and ${s.notNull} is null` : ""}`, [shopId]))[0].c);
    else if (s.by === "child") out[s.table] = Number((await q(db, `select count(*) c from "${s.table}" where "${s.fk}" in (select id from "${s.parent}" where shop_id = $1)`, [shopId]))[0].c);
    else out[s.table] = Number((await q(db, `select count(*) c from "${s.table}" where id in (select "${s.fk}" from "${s.via}" where shop_id = $1)`, [shopId]))[0].c);
  }
  return out;
};

const before1 = await counts(A, shop1);
const before2 = await counts(A, shop2);
t.ok(before1.bills === 40 && before1.shop_products === 12 && before1.supply_points === 1 && before1.shop_members === 2, "the shop has data in every kind of table");

// ---------- 1. export, then import into an EMPTY database ----------
const data = await exportShop(a, shop1);
t.ok(data.format === 1 && data.dbVersion && data.company, "the file carries format, database version and company");
t.ok(Object.keys(data.tables).length === SHOP_EXPORT.length, "every listed table is in the file");
t.ok(!JSON.stringify(data).includes("Staging Gandhi Road") , "nothing of the other shop is in the file");

const B = await buildDb();
const b = pgliteClient(B);
// the sign-in accounts come back first (see docs/RUNBOOK_RESTORE.md): same ids
await B.exec(`insert into auth.users (id, email) values ('${owner}', 'owner@staging.nexper.in'), ('${staff}', 'helper@staging.nexper.in')`);
const dry = await importShop(b, data, { dryRun: true });
t.ok(dry.dryRun && dry.tables.bills.inserted === 40, "a dry run reports what it would add");
t.ok(Number((await q(B, `select count(*) c from shops`))[0].c) === 0, "and a dry run changes nothing");
const rep = await importShop(b, data);
t.ok(rep.company === "created", "the company is created first");
const after1 = await counts(B, shop1);
t.ok(JSON.stringify(after1) === JSON.stringify(before1), "an empty database gets the same counts in every table");
const idsA = (await q(A, `select id from bills where shop_id = $1 order by id`, [shop1])).map((r) => r.id).join();
const idsB = (await q(B, `select id from bills where shop_id = $1 order by id`, [shop1])).map((r) => r.id).join();
t.ok(idsA === idsB, "bills come back with the same ids");
t.ok((await q(B, `select count(*) c from shops where id = $1`, [shop2]))[0].c == 0, "the other shop was not copied");
const sumA = (await q(A, `select sum(total) s from bills where shop_id = $1`, [shop1]))[0].s;
const sumB = (await q(B, `select sum(total) s from bills where shop_id = $1`, [shop1]))[0].s;
t.ok(Number(sumA) === Number(sumB), "totals match");
t.ok((await q(B, `select count(*) c from credits where shop_id = $1`, [shop1]))[0].c == before1.credits, "udhaar entries match");

// ---------- 2. importing the same file again adds nothing ----------
const again = await importShop(b, data);
t.ok(Object.values(again.tables).every((r) => r.inserted === 0), "importing twice adds nothing");

// ---------- 3. repair in the same database ----------
// shop 1 loses data by mistake; shop 2 must stay exactly as it is
await A.exec(`delete from bills where shop_id = '${shop1}'; delete from expenses where shop_id = '${shop1}'`);
const lost = await counts(A, shop1);
t.ok(lost.bills === 0, "the accident happened");
const mo = await importShop(a, data, { mode: "missing-only" });
t.ok(mo.tables.bills.inserted === 40 && mo.tables.shop_products.inserted === 0, "missing-only brings back what is gone and leaves the rest");
t.ok(JSON.stringify(await counts(A, shop1)) === JSON.stringify(before1), "shop 1 is whole again");
t.ok(JSON.stringify(await counts(A, shop2)) === JSON.stringify(before2), "shop 2 was not touched");

// ---------- 4. replace: a shop put back exactly, newer rows removed ----------
await A.exec(`insert into expenses (shop_id, category, amount) values ('${shop1}', 'Extra after backup', 1)`);
const beforeOther = JSON.stringify(await q(A, `select * from bills where shop_id = $1 order by id`, [shop2]));
const rp = await importShop(a, data, { mode: "replace" });
t.ok(rp.tables.expenses.removed === before1.expenses + 1 && rp.tables.expenses.inserted === before1.expenses, "replace removes the newer row and loads the file");
t.ok(JSON.stringify(await counts(A, shop1)) === JSON.stringify(before1), "the shop is exactly as in the file");
t.ok(JSON.stringify(await q(A, `select * from bills where shop_id = $1 order by id`, [shop2])) === beforeOther, "replace never touches another shop's bills");
t.ok(JSON.stringify(await counts(A, shop2)) === JSON.stringify(before2), "or any other table of another shop");
t.ok((await q(A, `select count(*) c from products where owner_id = $1`, [owner]))[0].c == 12, "the owner's shared items are kept");

// ---------- 5. refusals ----------
const C = await buildDb();
let msg = null;
try { await importShop(pgliteClient(C), data); } catch (e) { msg = e.message; }
t.ok(msg && /no sign-in account/.test(msg), "importing where the owner has no account is refused in plain words");
const old = await buildDb({ upTo: "036" });
let msg2 = null;
try { await importShop(pgliteClient(old), { ...data, dbVersion: "035" }); } catch (e) { msg2 = e.message; }
t.ok(msg2 && /same update|update 035/.test(msg2), "a file from another database update is refused");
let msg3 = null;
try { await importShop(a, { ...data, format: 99 }); } catch (e) { msg3 = e.message; }
t.ok(msg3 && /not a Nexper shop export/.test(msg3), "a wrong file is refused");
// a failure rolls the whole import back
const broken = JSON.parse(JSON.stringify(data));
broken.tables.bills[0].shop_id = "00000000-0000-0000-0000-000000000000";
const D = await buildDb();
await D.exec(`insert into auth.users (id, email) values ('${owner}', 'owner@staging.nexper.in')`);
let msg4 = null;
try { await importShop(pgliteClient(D), broken); } catch (e) { msg4 = e.message; }
t.ok(msg4 && Number((await q(D, `select count(*) c from shops`))[0].c) === 0, "a failed import leaves nothing behind");

console.log(`${t.pass} passed, ${t.fail} failed (shop export/import)`);
process.exit(t.fail ? 1 : 0);
