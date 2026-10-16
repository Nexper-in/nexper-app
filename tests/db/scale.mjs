// Run: npm run test:db. A big shop must stay fast. Builds a synthetic shop with
// a lot of bills, credit entries and movements next to 39 small ones, then
// checks, as the shop's owner under the real access rules, that the questions
// the app asks use the indexes (never read the whole table) and answer quickly.
// Set N to try a bigger shop, for example: N=150000 node tests/db/scale.mjs
import { buildDb, as, counter } from "./setup.mjs";

const N = Number(process.env.N || 40000);
const db = await buildDb();
const t = counter();
const q = async (sql) => (await db.query(sql)).rows;

await as(db, null);
await db.exec(`
  insert into auth.users (email) select 'u'||g||'@x' from generate_series(1,40) g;
  insert into shops (owner_id, name, type) select id, 'Shop '||email, 'kirana' from auth.users;
  insert into shop_members (shop_id, user_id, role, name, permissions) select s.id, s.owner_id, 'owner', 'o', '{}' from shops s;
`);
const big = (await q(`select s.id shop, s.owner_id owner from shops s order by s.created_at, s.id limit 1`))[0];
await db.exec(`
  insert into bills (shop_id, bill_no, customer_name, customer_phone, items, subtotal, total, payment_type, date)
  select '${big.shop}', 'B'||g, 'Cust '||(g%3000), '9'||lpad((g%3000)::text,9,'0'),
    '[{"shop_product_id":"x","name":"Tea","price":10,"qty":2}]'::jsonb, 20, 20, case when g%9=0 then 'credit' else 'cash' end,
    now() - (g || ' minutes')::interval * 7
  from generate_series(1,${N}) g;
  insert into bills (shop_id, bill_no, items, subtotal, total, date)
  select s.id, 'B'||g, '[]'::jsonb, 10, 10, now() - (g||' hours')::interval from shops s, generate_series(1,500) g where s.id <> '${big.shop}';
  insert into credits (shop_id, phone, name, amount, type, date)
  select '${big.shop}', '9'||lpad((g%1500)::text,9,'0'), 'C'||(g%1500), 50, case when g%3=0 then 'payment' else 'charge' end, now() - (g||' minutes')::interval*20
  from generate_series(1,${Math.floor(N / 2)}) g;
  insert into movements (shop_id, item_name, type, qty, reason, date)
  select '${big.shop}', 'Tea', 'out', 1, 'Sale', now() - (g||' minutes')::interval*9 from generate_series(1,${Math.floor(N / 3)}) g;
  insert into expenses (shop_id, category, amount, date) select '${big.shop}', 'Rent', 100, now() - (g||' hours')::interval from generate_series(1,5000) g;
  analyze;
`);

const S = big.shop;
// The queries the screens run (see the screens listed on the right).
const QUERIES = [
  ["Home: last 35 days of bills", `select * from bills where shop_id='${S}' and date >= now()-interval '35 days' order by date desc, id`, "bills", 800],
  ["Day close: today's bills", `select * from bills where shop_id='${S}' and date >= date_trunc('day', now()) order by date, id`, "bills", 400],
  ["Bills page: newest 100", `select * from bills where shop_id='${S}' order by date desc, id limit 100`, "bills", 400],
  ["New bill: last 90 days, newest 2000", `select * from bills where shop_id='${S}' and date >= now()-interval '90 days' order by date desc limit 2000`, "bills", 800],
  ["Home: newest 6 stock movements", `select * from movements where shop_id='${S}' order by date desc limit 6`, "movements", 300],
  ["Udhaar: one customer's entries", `select * from credits where shop_id='${S}' and phone='9000000042'`, "credits", 300],
  ["Expenses: last 30 days", `select * from expenses where shop_id='${S}' and date >= now()-interval '30 days' order by date desc, id`, "expenses", 400],
];
await as(db, big.owner);
for (const [label, sql, table, budgetMs] of QUERIES) {
  const plan = (await q(`explain ${sql}`)).map((r) => r["QUERY PLAN"]).join("\n");
  t.ok(!new RegExp(`Seq Scan on ${table}\\b`).test(plan), `${label}: uses an index (no full read of ${table})`);
  const t0 = Date.now();
  const rows = (await q(sql)).length;
  const ms = Date.now() - t0;
  t.ok(rows > 0, `${label}: returns rows`);
  t.ok(ms < budgetMs, `${label}: ${ms} ms is under ${budgetMs} ms`);
}
// The admin totals come from the database, not from downloading every bill.
await as(db, null);
await db.exec(`set role service_role`);
const stats = await q(`select * from admin_shop_stats()`);
t.ok(stats.length === 40 && Number(stats.find((s) => s.shop_id === S).bill_count) === N, "admin totals: one row per shop with the right bill count");
t.ok(Number((await q(`select admin_udhaar_outstanding() v`))[0].v) !== 0, "admin totals: udhaar outstanding is summed in the database");
await as(db, big.owner);
t.ok(await db.exec(`select admin_shop_stats()`).then(() => false, () => true), "admin totals: a shop owner cannot call them");
await as(db, null);
console.log(`${t.pass} passed, ${t.fail} failed (shop with ${N} bills)`);
process.exit(t.fail ? 1 : 0);
