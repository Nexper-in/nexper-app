// Run: npm test. The Supplies screen's maths: dates and periods, the day's
// round, what changed since it was saved, statements and balances.
import test from "node:test";
import assert from "node:assert/strict";

const S = await import("../lib/supplies.js");

test("dates: add days across a month and year end, weeks start on Monday", () => {
  assert.equal(S.addDays("2026-10-01", -1), "2026-09-30");
  assert.equal(S.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(S.addDays("2028-02-28", 1), "2028-02-29");
  // 2026-10-01 is a Thursday
  assert.deepEqual(S.rangeFor("week", "2026-10-01"), { from: "2026-09-28", to: "2026-10-01" });
  assert.deepEqual(S.rangeFor("week", "2026-09-28"), { from: "2026-09-28", to: "2026-09-28" });
});

test("periods: this month, last month (incl. January and leap February)", () => {
  assert.deepEqual(S.rangeFor("month", "2026-10-15"), { from: "2026-10-01", to: "2026-10-15" });
  assert.deepEqual(S.rangeFor("lastMonth", "2026-10-15"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(S.rangeFor("lastMonth", "2027-01-05"), { from: "2026-12-01", to: "2026-12-31" });
  assert.deepEqual(S.rangeFor("lastMonth", "2028-03-10"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(S.rangeFor("today", "2026-10-01"), { from: "2026-10-01", to: "2026-10-01" });
});

test("money: no floating point drift", () => {
  assert.equal(S.lineAmount(3, 0.1), 0.3);
  assert.equal(S.lineAmount(7, 1.15), 8.05);
});

test("round: only changed cells are sent, removed cells go as 0", () => {
  const saved = { "a|t": 5, "a|b": 2, "b|t": 4 };
  const edited = { "a|t": 6, "b|t": 4, "c|t": 3 }; // a|b removed, a|t changed, c|t new
  const rows = S.diffRound(saved, edited);
  assert.deepEqual(
    rows.sort((x, y) => (x.point_id + x.shop_product_id).localeCompare(y.point_id + y.shop_product_id)),
    [
      { point_id: "a", shop_product_id: "b", qty: 0 },
      { point_id: "a", shop_product_id: "t", qty: 6 },
      { point_id: "c", shop_product_id: "t", qty: 3 },
    ]
  );
  assert.deepEqual(S.diffRound(saved, { ...saved }), []);
});

test("round totals use the item's current price", () => {
  const items = [{ id: "t", name: "Tea", price: 10 }, { id: "b", name: "Biscuit", price: 5 }];
  const totals = S.roundTotals(items, { "icu|t": 12, "ward|t": 8, "icu|b": 10 });
  assert.equal(totals.qty, 30);
  assert.equal(totals.amount, 250);
  assert.deepEqual(totals.lines.map((l) => [l.name, l.qty, l.amount]), [["Tea", 20, 200], ["Biscuit", 10, 50]]);
  assert.deepEqual(S.roundTotals(items, {}), { lines: [], qty: 0, amount: 0 });
});

test("qty map adds rows for the same cell and ignores removed items", () => {
  const map = S.qtyMapFromEntries([
    { point_id: "a", shop_product_id: "t", qty: 5 },
    { point_id: "a", shop_product_id: null, qty: 9 },
  ]);
  assert.deepEqual(map, { "a|t": 5 });
});

const entries = [
  { entry_date: "2026-10-01", item_name: "Tea", qty: 12, unit_price: 10 },
  { entry_date: "2026-10-01", item_name: "Biscuit", qty: 10, unit_price: 5 },
  { entry_date: "2026-10-02", item_name: "Tea", qty: 10, unit_price: 12 }, // price changed that day
  { entry_date: "2026-10-09", item_name: "Tea", qty: 99, unit_price: 12 }, // outside the period
];
const payments = [
  { id: "p1", amount: 100, paid_on: "2026-10-02", method: "cash" },
  { id: "p2", amount: 500, paid_on: "2026-10-20", method: "upi" }, // outside
];

test("statement: totals, per-day lines, earlier balance and closing", () => {
  const st = S.buildStatement({ entries, payments, opening: 80, from: "2026-10-01", to: "2026-10-05" });
  assert.equal(st.charged, 120 + 50 + 120); // 290: each day at its own price
  assert.equal(st.paid, 100);
  assert.equal(st.opening, 80);
  assert.equal(st.closing, 80 + 290 - 100);
  assert.deepEqual(st.days.map((d) => [d.date, d.amount]), [["2026-10-01", 170], ["2026-10-02", 120]]);
  assert.deepEqual(st.items.map((i) => [i.name, i.qty, i.amount]), [["Tea", 22, 240], ["Biscuit", 10, 50]]);
  assert.equal(st.payments.length, 1);
});

test("statement for an empty period still shows the opening balance as the closing", () => {
  const st = S.buildStatement({ entries: [], payments: [], opening: 250, from: "2026-11-01", to: "2026-11-30" });
  assert.equal(st.closing, 250);
  assert.equal(st.days.length, 0);
});

test("balances: charged minus paid, advance shows as negative", () => {
  const points = [{ id: "a", name: "ICU" }, { id: "b", name: "Ward" }, { id: "c", name: "New" }];
  const balances = [
    { point_id: "a", charged: "300.50", paid: "100", last_date: "2026-10-02" },
    { point_id: "b", charged: 50, paid: 80, last_date: "2026-10-01" },
  ];
  const out = S.withBalances(points, balances);
  assert.equal(out[0].balance, 200.5);
  assert.equal(out[1].balance, -30);
  assert.equal(out[2].balance, 0);
  assert.equal(out[2].lastDate, null);
});

test("statement text reads well and leaves out empty lines", () => {
  const st = S.buildStatement({ entries, payments, opening: 0, from: "2026-10-01", to: "2026-10-05" });
  const text = S.statementText({ shopName: "Sri Tea", pointName: "ICU", statement: st });
  assert.match(text, /Sri Tea: statement for ICU/);
  assert.match(text, /Tea: 22 = Rs 240/);
  assert.match(text, /Balance due: Rs 190/);
  assert.doesNotMatch(text, /Earlier balance/);
});
