// Run: node tests/db/usage.rls.mjs (part of npm run test:db). admin_usage (045): only the server can call
// it, and the numbers per company are right.
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
const a = await user("a"), b = await user("b");
await as(db, a);
const a1 = (await q(`insert into shops (owner_id, name, type) values ('${a}', 'A1', 'kirana') returning id`))[0].id;
await asService(db);
await db.exec(`update organisations set max_shops = 3 where owner_id = '${a}'`);
await as(db, a);
const a2 = (await q(`insert into shops (owner_id, name, type) values ('${a}', 'A2', 'kirana') returning id`))[0].id;
await as(db, b);
const b1 = (await q(`insert into shops (owner_id, name, type) values ('${b}', 'B1', 'kirana') returning id`))[0].id;
await asService(db);
const today = new Date().toISOString().slice(0, 10);
const bill = (shop, n, when) => db.query(`insert into bills (shop_id, bill_no, items, subtotal, total, date) values ($1, $2, '[]'::jsonb, 10, 10, $3)`, [shop, n, when]);
for (let i = 0; i < 3; i++) await bill(a1, `A1-${i}`, new Date().toISOString());
await bill(a2, "A2-0", new Date().toISOString());
await bill(a1, "A1-old", "2020-01-15T10:00:00Z");
await bill(b1, "B1-0", new Date().toISOString());
await db.exec(`insert into movements (shop_id, item_name, type, qty, reason) values ('${a1}', 'x', 'out', 1, 'sale'), ('${a1}', 'x', 'out', 1, 'sale'), ('${b1}', 'x', 'out', 1, 'sale')`);
await db.exec(`insert into ai_usage (shop_id, kind) values ('${a1}', 'scan'), ('${a2}', 'scan'), ('${b1}', 'scan')`);
await db.exec(`insert into api_keys (shop_id, name, key_prefix, key_hash) values ('${a1}', 'k', 'p1', 'h1'), ('${a1}', 'k2', 'p2', 'h2')`);
await db.exec(`update api_keys set revoked_at = now() where key_prefix = 'p2'`);

const rows = await q(`select * from admin_usage('${today}')`);
const A = rows.find((r) => r.org_name === "A1"), B = rows.find((r) => r.org_name === "B1");
t.ok(rows.length === 2 && A && B, "one row per company");
t.ok(A.shops === 2 && A.active_shops === 2 && B.shops === 1, "shops and shops that billed this month");
t.ok(Number(A.bills_month) === 4 && Number(B.bills_month) === 1, `bills this month: the old bill is not counted (${A.bills_month})`);
t.ok(Number(A.bills_total) === 5, "bills all time include the old one");
t.ok(Number(A.movements_total) === 2 && Number(A.ai_scans_month) === 2, "movements and pooled AI scans per company");
t.ok(A.api_keys === 1, "only live API keys are counted");
t.ok(Math.abs(Number(A.est_storage_mb) - (5 * 1.35 + 2 * 0.2) / 1024) < 0.01, "storage is the documented estimate");
const older = await q(`select * from admin_usage('2020-01-20') where org_name = 'A1'`);
t.ok(Number(older[0].bills_month) === 1 && older[0].active_shops === 1, "another month shows that month");

await as(db, a);
t.ok(/Not allowed|permission denied/.test((await fails(`select * from admin_usage('${today}')`)) || ""), "an owner cannot call it");
await as(db, "anon");
t.ok(/Not allowed|permission denied/.test((await fails(`select * from admin_usage('${today}')`)) || ""), "a visitor cannot");

console.log(`${t.pass} passed, ${t.fail} failed (admin usage)`);
process.exit(t.fail ? 1 : 0);
