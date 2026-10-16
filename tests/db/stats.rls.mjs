// Run: node tests/db/stats.rls.mjs (part of npm run test:db). S15: the per-day summary rows equal a
// recomputation from the books on random data, follow the Indian day (a bill at 23:59 and one
// at 00:01 land on different days), net returns the way the Reports screen does, and are readable
// only by people who may see the dashboard or reports of that shop.
import { buildDb, as, asService, counter } from "./setup.mjs";
import { summarizePeriod } from "../../lib/periodReport.js";

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
const owner = await user("owner"), other = await user("other"), reporter = await user("reporter"), biller = await user("biller");
await as(db, owner);
const shop = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'S', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${owner}', 'owner', 'O', '{}')`);
await as(db, other);
const shop2 = (await q(`insert into shops (owner_id, name, type) values ('${other}', 'S2', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop2}', '${other}', 'owner', 'O', '{}')`);
await asService(db);
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${reporter}', 'staff', 'R', '{"reports": true}'), ('${shop}', '${biller}', 'staff', 'B', '{"billing": true}')`);
await db.exec(`reset role`);

// ---------- random data over 12 days, with the awkward moments around IST midnight ----------
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ist = (ymd, hh, mm) => `${ymd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`;
const days = Array.from({ length: 12 }, (_, i) => `2026-09-${String(10 + i).padStart(2, "0")}`);
const bills = [], returns = [], expenses = [], pays = [];
for (const d of days) {
  for (let k = 0; k < 8; k++) {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ name: pick(["Tea", "Salt", "Oil", "Soap"]), qty: 1 + Math.floor(rnd() * 3), price: pick([10, 25, 40, 99]), gst: pick([0, 5, 12, 18]), cost_price: pick([null, 6, 20]) }));
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const disc = rnd() < 0.2 ? 5 : 0;
    const credit = rnd() < 0.25;
    bills.push({ at: ist(d, Math.floor(rnd() * 24), Math.floor(rnd() * 60)), lines, subtotal, disc, total: subtotal - disc, type: credit ? "credit" : "cash", method: credit ? "cash" : pick(["cash", "upi", "card", "bank"]) });
  }
  if (rnd() < 0.5) returns.push({ at: ist(d, 15, 0), amount: pick([10, 25]), method: pick(["cash", "credit", "upi"]) });
  expenses.push({ at: ist(d, 11, 0), amount: pick([100, 250]), cat: pick(["Rent", "Tea", "Power"]) });
  if (rnd() < 0.5) pays.push({ at: ist(d, 17, 0), amount: pick([30, 60]) });
}
// the boundary: 23:59 on the 20th and 00:01 on the 21st (IST)
bills.push({ at: ist("2026-09-20", 23, 59), lines: [{ name: "Edge", qty: 1, price: 100, gst: 0 }], subtotal: 100, disc: 0, total: 100, type: "cash", method: "cash" });
bills.push({ at: ist("2026-09-21", 0, 1), lines: [{ name: "Edge", qty: 1, price: 200, gst: 0 }], subtotal: 200, disc: 0, total: 200, type: "cash", method: "cash" });
let n = 0;
for (const b of bills) {
  await db.query(`insert into bills (shop_id, bill_no, items, subtotal, discount_amount, total, payment_type, payment_method, date) values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)`, [shop, `B-${++n}`, JSON.stringify(b.lines), b.subtotal, b.disc, b.total, b.type, b.method, b.at]);
}
for (const r of returns) await db.query(`insert into sale_returns (shop_id, bill_no, items, refund_amount, refund_method, date) values ($1, 'B-1', '[]'::jsonb, $2, $3, $4)`, [shop, r.amount, r.method, r.at]);
for (const e of expenses) await db.query(`insert into expenses (shop_id, category, amount, date) values ($1, $2, $3, $4)`, [shop, e.cat, e.amount, e.at]);
for (const p of pays) await db.query(`insert into credits (shop_id, phone, name, amount, type, date) values ($1, '9000000001', 'C', $2, 'payment', $3)`, [shop, p.amount, p.at]);
// another shop's data must stay separate
await db.query(`insert into bills (shop_id, bill_no, items, subtotal, total, date) values ($1, 'X-1', '[]'::jsonb, 77, 77, $2)`, [shop2, ist("2026-09-12", 10, 0)]);

// ---------- 1. incremental rows == recomputation from the books ----------
const cols = "to_char(day, 'YYYY-MM-DD') as day, bills, sales, cash, upi, card, bank, udhaar_sales, discount, gst, cost, returns, returns_amount, returns_cash, returns_credit, returns_digital, udhaar_received, expenses";
const live = await q(`select ${cols} from shop_day_stats where shop_id = '${shop}' order by 1`);
const ref = await q(`select ${cols} from _shop_day_rows('${shop}', null, null) order by 1`);
const norm = (rows) => JSON.stringify(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "day" ? v : Math.round(Number(v) * 100) / 100]))));
t.ok(live.length === days.length, `one row per active day (${live.length})`);
t.ok(norm(live) === norm(ref), "the rows kept up to date by the triggers equal a recomputation from the books");

// ---------- 2. the Indian day ----------
const day20 = live.find((r) => r.day === "2026-09-20"), day21 = live.find((r) => r.day === "2026-09-21");
const edge20 = (await q(`select coalesce(sum(total),0) s from bills where shop_id = '${shop}' and date >= '2026-09-20T00:00:00+05:30' and date < '2026-09-21T00:00:00+05:30'`))[0].s;
const edge21 = (await q(`select coalesce(sum(total),0) s from bills where shop_id = '${shop}' and date >= '2026-09-21T00:00:00+05:30' and date < '2026-09-22T00:00:00+05:30'`))[0].s;
t.ok(Math.abs(Number(day20.sales) - Number(edge20)) < 0.01 && Math.abs(Number(day21.sales) - Number(edge21)) < 0.01, "a bill at 23:59 IST and one at 00:01 IST fall on different days");

// ---------- 3. the same numbers the Reports screen shows ----------
let mismatches = 0;
for (const d of days) {
  const start = `${d}T00:00:00+05:30`, end = new Date(new Date(start).getTime() + 86400000).toISOString();
  const b = await q(`select items, total, payment_type, payment_method from bills where shop_id = '${shop}' and date >= '${start}' and date < '${end}'`);
  const e = await q(`select amount, category from expenses where shop_id = '${shop}' and date >= '${start}' and date < '${end}'`);
  const r = await q(`select items, refund_amount, refund_method from sale_returns where shop_id = '${shop}' and date >= '${start}' and date < '${end}'`);
  const s = summarizePeriod(b, e, r);
  const row = live.find((x) => x.day === d);
  const salesNet = Number(row.sales) - Number(row.returns_amount);
  const cashNet = Number(row.cash) - Number(row.returns_cash);
  const creditNet = Number(row.udhaar_sales) - Number(row.returns_credit);
  const digitalNet = Number(row.upi) + Number(row.card) + Number(row.bank) - Number(row.returns_digital);
  const close = (a, c) => Math.abs(a - c) < 0.011;
  if (!(close(salesNet, s.sales) && close(cashNet, s.cash) && close(creditNet, s.credit) && close(digitalNet, s.digital) && close(Number(row.expenses), s.expenses) && Number(row.bills) === s.bills && close(Number(row.returns_amount), s.returns))) mismatches++;
}
t.ok(mismatches === 0, `net sales, cash, UPI/card, udhaar, expenses and returns equal summarizePeriod() on all ${days.length} days (${mismatches} differ)`);

// ---------- 4. other shops stay separate ----------
t.ok((await q(`select count(*)::int c from shop_day_stats where shop_id = '${shop2}'`))[0].c === 1 && Number((await q(`select sales from shop_day_stats where shop_id = '${shop2}'`))[0].sales) === 77, "another shop has its own row");

// ---------- 5. deleting an expense takes it off ----------
const exp = (await q(`select id, amount, date from expenses where shop_id = '${shop}' limit 1`))[0];
const dayOf = (await q(`select ist_day('${new Date(exp.date).toISOString()}'::timestamptz) d`))[0].d;
const before = Number((await q(`select expenses from shop_day_stats where shop_id = '${shop}' and day = '${new Date(dayOf).toISOString().slice(0, 10)}'`))[0]?.expenses ?? 0);
await db.exec(`delete from expenses where id = '${exp.id}'`);
const after = Number((await q(`select expenses from shop_day_stats where shop_id = '${shop}' and day = '${new Date(dayOf).toISOString().slice(0, 10)}'`))[0]?.expenses ?? 0);
t.ok(Math.abs(before - after - Number(exp.amount)) < 0.01, "a deleted expense comes off that day");
t.ok(norm(await q(`select ${cols} from shop_day_stats where shop_id = '${shop}' order by 1`)) === norm(await q(`select ${cols} from _shop_day_rows('${shop}', null, null) order by 1`)), "and the rows still equal the recomputation");

// ---------- 6. refresh repairs a wrong row ----------
await db.exec(`update shop_day_stats set sales = 1, bills = 99 where shop_id = '${shop}' and day = '2026-09-12'`);
await asService(db);
await db.exec(`select refresh_shop_day_stats('${shop}', '2026-09-10', '2026-09-21')`);
t.ok(norm(await q(`select ${cols} from shop_day_stats where shop_id = '${shop}' order by 1`)) === norm(await q(`select ${cols} from _shop_day_rows('${shop}', null, null) order by 1`)), "refresh_shop_day_stats puts a damaged row right");
t.ok(/Bad range/.test((await fails(`select refresh_shop_day_stats('${shop}', '2026-09-21', '2026-09-10')`)) || ""), "a backwards range is refused");
await as(db, owner);
t.ok(/Not allowed|permission denied/.test((await fails(`select refresh_shop_day_stats('${shop}', '2026-09-10', '2026-09-12')`)) || ""), "an owner cannot call refresh");

// ---------- 7. who can read ----------
await as(db, owner);
t.ok((await q(`select count(*)::int c from shop_day_stats`))[0].c === days.length, "the owner reads their shop's rows");
await as(db, reporter);
t.ok((await q(`select count(*)::int c from shop_day_stats where shop_id = '${shop}'`))[0].c === days.length, "a helper with the reports permission reads them");
await as(db, biller);
t.ok((await q(`select count(*)::int c from shop_day_stats where shop_id = '${shop}'`))[0].c === 0, "a billing-only helper does not");
await as(db, other);
t.ok((await q(`select count(*)::int c from shop_day_stats where shop_id = '${shop}'`))[0].c === 0, "another shop's owner does not");
t.ok(/permission denied|row-level security/.test((await fails(`insert into shop_day_stats (shop_id, day) values ('${shop2}', '2026-01-01')`)) || ""), "and nobody writes the table directly");
await as(db, owner);
t.ok(/permission denied/.test((await fails(`update shop_day_stats set sales = 1`)) || ""), "not even the owner");

// ---------- 8. removing a shop removes its rows without error ----------
await as(db, other);
await db.exec(`select close_shop('${shop2}', 'x')`);
await db.exec(`reset role; select set_config('nexper.closure','on',false); update shops set purge_after = now() - interval '1 day' where id = '${shop2}'; select set_config('nexper.closure','',false);`);
await asService(db);
await db.exec(`select purge_closed_shops(5)`);
t.ok((await q(`select count(*)::int c from shop_day_stats where shop_id = '${shop2}'`))[0].c === 0 && (await q(`select count(*)::int c from shops where id = '${shop2}'`))[0].c === 0, "purging a shop removes its day rows with it");

console.log(`${t.pass} passed, ${t.fail} failed (day stats)`);
process.exit(t.fail ? 1 : 0);
