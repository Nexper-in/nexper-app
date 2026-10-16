import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { installFakeSupabase } from "./helpers/fakeSupabase.mjs";
import { fetchPeriodSummary, fetchDaySummary, periodText, summaryFromDayStats, summarizePeriod, previousAnchor, PERIOD_TITLES } from "../lib/periodReport.js";

const SHOP = "00000000-0000-4000-8000-000000000001";
const DAY = "2026-10-12", PREV = previousAnchor("day", DAY);
const at = (ymd, h, m = 0) => new Date(`${ymd}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`).toISOString();

function world({ withStats = true } = {}) {
  const bills = [
    { shop_id: SHOP, date: at(DAY, 10), total: 100, payment_type: "cash", payment_method: "cash", items: [{ name: "Tea", qty: 2, price: 50 }] },
    { shop_id: SHOP, date: at(DAY, 12), total: 200, payment_type: "credit", payment_method: "cash", items: [{ name: "Rice", qty: 1, price: 200 }] },
    { shop_id: SHOP, date: at(DAY, 18), total: 50, payment_type: "cash", payment_method: "upi", items: [{ name: "Tea", qty: 1, price: 50 }] },
    { shop_id: SHOP, date: at(PREV, 11), total: 150, payment_type: "cash", payment_method: "cash", items: [{ name: "Oil", qty: 1, price: 150 }] },
  ];
  const sale_returns = [{ shop_id: SHOP, date: at(DAY, 14), refund_amount: 30, refund_method: "cash", items: [{ name: "Tea", qty: 1, amount: 30 }] }];
  const expenses = [{ shop_id: SHOP, date: at(DAY, 9), amount: 40, category: "Rent" }, { shop_id: SHOP, date: at(DAY, 9, 30), amount: 15, category: "Tea" }];
  const shop_day_stats = withStats
    ? [
        { shop_id: SHOP, day: DAY, bills: 3, sales: 350, cash: 100, upi: 50, card: 0, bank: 0, udhaar_sales: 200, returns: 1, returns_amount: 30, returns_cash: 30, returns_credit: 0, returns_digital: 0, expenses: 55 },
        { shop_id: SHOP, day: PREV, bills: 1, sales: 150, cash: 150, upi: 0, card: 0, bank: 0, udhaar_sales: 0, returns: 0, returns_amount: 0, returns_cash: 0, returns_credit: 0, returns_digital: 0, expenses: 0 },
      ]
    : undefined;
  const db = { bills, sale_returns, expenses };
  if (shop_day_stats) db.shop_day_stats = shop_day_stats;
  return db;
}
const client = () => createClient("http://supabase.test", "service", { auth: { persistSession: false } });

test("the nightly summary text from the day rows is identical to the one built from every bill", async () => {
  const fake = installFakeSupabase(world());
  try {
    const old = await fetchPeriodSummary(client(), SHOP, "day", DAY);
    const fast = await fetchDaySummary(client(), SHOP, DAY);
    assert.equal(fast.error, null);
    const text = (r) => periodText({ shopName: "Sharma Store", title: PERIOD_TITLES.day, label: r.range.label, s: r.s, prev: r.prev, period: "day" });
    assert.equal(text(fast), text(old), "same text, word for word");
    assert.deepEqual(fast.s, old.s);
    assert.equal(fast.prev.sales, old.prev.sales);
  } finally {
    fake.restore();
  }
});

test("without the day-stats table (before update 043) the old full read is used", async () => {
  const fake = installFakeSupabase(world({ withStats: false }));
  try {
    const r = await fetchDaySummary(client(), SHOP, DAY);
    assert.equal(r.error, null);
    assert.equal(r.s.sales, 320, "350 sold minus 30 returned, from the bills themselves");
  } finally {
    fake.restore();
  }
});

test("a row converts to the same shape the report uses, returns netted per payment method", () => {
  const s = summaryFromDayStats({ bills: 4, sales: 500, cash: 200, upi: 100, card: 20, bank: 30, udhaar_sales: 150, returns: 2, returns_amount: 70, returns_cash: 20, returns_credit: 30, returns_digital: 20, expenses: 80 });
  assert.equal(s.sales, 430);
  assert.equal(s.cash, 180);
  assert.equal(s.credit, 120);
  assert.equal(s.digital, 130);
  assert.equal(s.returns, 70);
  assert.equal(s.net, 350);
  const none = summaryFromDayStats(undefined);
  assert.equal(none.sales, 0);
  assert.equal(none.bills, 0);
  assert.deepEqual(summarizePeriod([], [], []).topItems, none.topItems);
});
