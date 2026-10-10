// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const { parseCsv, toCsv, csvCell } = await import("../lib/csv.js");
const { marginAlerts, deadStock, suggestedPrice } = await import("../lib/stockHealth.js");
const { planPriceChange } = await import("../lib/bulkPrice.js");
const { monthlyPnL } = await import("../lib/profitLoss.js");
const { readStatement, matchCredits, parseStatementDate, parseAmount } = await import("../lib/bankRecon.js");
const { buildTables } = await import("../lib/exportData.js");

test("csv: quotes, BOM, semicolons, formula safety", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n'), [["a", "b"], ["x, y", 'say "hi"']]);
  assert.deepEqual(parseCsv("a;b\n1;2"), [["a", "b"], ["1", "2"]]);
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell(-5), "-5");
  assert.equal(toCsv(["h"], [["a,b"]]), 'h\r\n"a,b"');
});

test("margin alerts: loss, cost rise and thin margin, worst first", () => {
  const items = [
    { id: "a", name: "Loss", price: 90, cost_price: 100 },
    { id: "b", name: "Rise", price: 120, cost_price: 100 },
    { id: "c", name: "Thin", price: 105, cost_price: 100 },
    { id: "d", name: "Fine", price: 150, cost_price: 100 },
    { id: "e", name: "NoCost", price: 50, cost_price: null },
  ];
  const batches = [
    { shop_product_id: "b", cost_price: 100, received_date: "2026-09-01" },
    { shop_product_id: "b", cost_price: 110, received_date: "2026-10-01" },
    { shop_product_id: "b", cost_price: 50, received_date: "2026-10-05", reason: "Return" },
  ];
  const out = marginAlerts(items, batches);
  assert.deepEqual(out.map((a) => [a.id, a.kind]), [["a", "loss"], ["b", "costUp"], ["c", "thin"]]);
  assert.equal(out[1].costUp.risePct, 10);
});

test("suggested price rounds up and never passes MRP", () => {
  assert.deepEqual(suggestedPrice(85, 15, null), { price: 100, cappedAtMrp: false });
  assert.deepEqual(suggestedPrice(85, 15, 95), { price: 95, cappedAtMrp: true });
});

test("dead stock: idle items, grace for new items, value", () => {
  const now = Date.parse("2026-10-10T00:00:00Z");
  const day = 86400000;
  const items = [
    { id: "old", name: "Old", stock: 10, price: 20, cost_price: 10, created_at: new Date(now - 90 * day).toISOString() },
    { id: "new", name: "New", stock: 5, price: 20, cost_price: 10, created_at: new Date(now - 3 * day).toISOString() },
    { id: "sold", name: "Sold", stock: 5, price: 20, cost_price: 10, created_at: new Date(now - 90 * day).toISOString() },
    { id: "empty", name: "Empty", stock: 0, price: 20, cost_price: 10, created_at: new Date(now - 90 * day).toISOString() },
  ];
  const bills = [{ date: new Date(now - 2 * day).toISOString(), items: [{ shop_product_id: "sold" }] }];
  const out = deadStock(items, bills, { days: 30, now });
  assert.deepEqual(out.map((d) => d.id), ["old"]);
  assert.equal(out[0].value, 100);
  assert.equal(out[0].neverSold, true);
});

test("bulk price: percent, rounding, MRP cap, below-cost flag, skips unchanged", () => {
  const items = [
    { id: "1", name: "A", category: "Oil", price: 100, mrp: 108, cost_price: 80 },
    { id: "2", name: "B", category: "Oil", price: 50, mrp: null, cost_price: 49 },
    { id: "3", name: "C", category: "Dal", price: 40, mrp: null, cost_price: null },
  ];
  const up = planPriceChange(items, { category: "Oil", mode: "percent", value: 10, roundTo: 1, capMrp: true });
  assert.deepEqual(up.map((r) => [r.id, r.next, r.capped]), [["1", 108, true], ["2", 55, false]]);
  const down = planPriceChange(items, { mode: "percent", value: -5, roundTo: 1 });
  assert.equal(down.find((r) => r.id === "2").next, 48);
  assert.equal(down.find((r) => r.id === "2").belowCost, true);
  assert.equal(planPriceChange(items, { mode: "amount", value: 0 }).length, 0);
});

test("profit and loss: GST out, returns, cost, no double counting", () => {
  const items = [{ id: "p", cost_price: 60 }];
  const bills = [{ total: 118, subtotal: 118, items: [{ shop_product_id: "p", qty: 1, price: 118, gst: 18 }] }];
  const r = monthlyPnL({
    bills, returns: [], items,
    expenses: [{ category: "Supplier payment", amount: 500 }, { category: "Rent", amount: 1000 }, { category: "Transport", amount: 20 }],
    fixed: [{ name: "Shop rent", category: "Rent", amount: 1000 }],
  });
  assert.equal(r.sales, 118);
  assert.equal(r.gst, 18);
  assert.equal(r.netSales, 100);
  assert.equal(r.cogs, 60);
  assert.equal(r.running, 20);
  assert.equal(r.fixed, 1000);
  assert.equal(r.profit, 100 - 60 - 20 - 1000);
  assert.equal(r.notes.skippedSupplier, 500);
  assert.equal(r.notes.skippedFixedDup, 1000);

  const ret = monthlyPnL({ bills, items, returns: [{ refund_amount: 118, items: [{ shop_product_id: "p", qty: 1, price: 118, gst: 18 }] }] });
  assert.equal(ret.netSales, 0);
  assert.equal(ret.cogs, 0);
  assert.equal(ret.profit, 0);
});

test("bank statement: dates, amounts, column detection", () => {
  assert.equal(parseStatementDate("05/10/2026"), "2026-10-05");
  assert.equal(parseStatementDate("5-Oct-26"), "2026-10-05");
  assert.equal(parseStatementDate("nonsense"), null);
  assert.equal(parseAmount("1,234.50"), 1234.5);
  assert.equal(parseAmount("₹ 99"), 99);
  const csv = "Account statement\nTxn Date,Narration,Withdrawal Amt,Deposit Amt,Balance\n05/10/2026,UPI/123/Ravi,,250.00,1000\n05/10/2026,ATM,500.00,,500\n06/10/2026,UPI/456,,80.00,580\n";
  const s = readStatement(csv);
  assert.deepEqual(s.credits.map((c) => [c.date, c.amount]), [["2026-10-05", 250], ["2026-10-06", 80]]);
});

test("bank match: exact within window, daily lump, leftovers", () => {
  const sales = [
    { id: "s1", date: "2026-10-05T10:00:00+05:30", amount: 250, label: "#1" },
    { id: "s2", date: "2026-10-05T11:00:00+05:30", amount: 100, label: "#2" },
    { id: "s3", date: "2026-10-05T12:00:00+05:30", amount: 60, label: "#3" },
    { id: "s4", date: "2026-10-04T13:00:00+05:30", amount: 999, label: "#4" },
  ];
  const credits = [
    { id: "c1", date: "2026-10-06", amount: 250, desc: "x" },
    { id: "c2", date: "2026-10-06", amount: 160, desc: "lump" },
    { id: "c3", date: "2026-10-07", amount: 77, desc: "stray" },
  ];
  const r = matchCredits(sales, credits, { windowDays: 3 });
  assert.equal(r.matched.length, 2);
  assert.deepEqual(r.unmatchedSales.map((s) => s.id), ["s4"]);
  assert.deepEqual(r.unmatchedCredits.map((c) => c.id), ["c3"]);
  assert.equal(r.totals.missing, 999);
});

test("export: item and bill tables", () => {
  const t = buildTables({ items: [{ code: "1", name: "Rice", price: 60 }], bills: [{ bill_no: "B1", date: "2026-10-01T00:00:00Z", total: 60, payment_type: "cash", payment_method: "upi", items: [{ name: "Rice", qty: 1, unit: "kg", price: 60 }] }] });
  assert.match(t["items.csv"], /Rice/);
  assert.match(t["bill_lines.csv"], /B1/);
  assert.match(t["bills.csv"], /upi/);
});
