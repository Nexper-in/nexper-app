// Run: npm test   (plain Node, no extra packages)
import test from "node:test";
import assert from "node:assert/strict";

const { isWeakPin } = await import("../lib/apiSafe.js");
const { matchItem } = await import("../lib/matchItems.js");
const m = await import("../lib/messaging.js");
const { isModuleEnabled } = await import("../lib/modules.js");
const { requestIp, isRateLimited } = await import("../lib/rateLimit.js");

test("weak PINs are rejected, normal ones accepted", () => {
  for (const p of ["111111", "123456", "654321", "000000", "123123", "999999", "012345"]) assert.equal(isWeakPin(p), true, p);
  for (const p of ["483920", "7K2m9Q", "190314", "246810"]) assert.equal(isWeakPin(p), false, p);
});

test("item matching: exact, contained, hindi name, shared words, no match", () => {
  const items = [
    { id: 1, name: "Tata Salt 1kg", hindi_name: "नमक" },
    { id: 2, name: "Toor Dal (Arhar)", hindi_name: "दाल" },
    { id: 3, name: "Aashirvaad Atta 5kg", hindi_name: "आटा" },
  ];
  assert.equal(matchItem("tata salt 1kg", items).id, 1);
  assert.equal(matchItem("Tata Salt", items).id, 1);
  assert.equal(matchItem("नमक", items).id, 1);
  assert.equal(matchItem("toor dal 1 kg", items).id, 2);
  assert.equal(matchItem("atta", items).id, 3);
  assert.equal(matchItem("laptop", items), null);
  assert.equal(matchItem("", items), null);
});

test("WhatsApp group link validation", () => {
  assert.equal(m.isGroupInviteLink("https://chat.whatsapp.com/AbC123xyz"), true);
  for (const bad of ["http://chat.whatsapp.com/abc", "https://evil.com/chat.whatsapp.com/abc", "javascript:alert(1)", "", "https://chat.whatsapp.com/"]) {
    assert.equal(m.isGroupInviteLink(bad), false, bad);
  }
});

test("messages: offer, invite, purchase order, bill footer", () => {
  const offer = m.offerMessageText({ kind: "offer", shopName: "Sharma Store", title: "10% off dals", details: "All dals", validTill: "2026-10-10", groupUrl: "https://chat.whatsapp.com/abc" });
  assert.match(offer, /\*10% off dals\*/);
  assert.match(offer, /Sharma Store/);
  assert.match(offer, /chat\.whatsapp\.com\/abc/);
  assert.match(m.groupInviteText("Sharma Store", "https://chat.whatsapp.com/abc"), /Join here/);
  const po = m.purchaseOrderText({ shopName: "S", supplierName: "Ramesh", lines: [{ item_name: "Sugar", qty: 10, unit: "kg" }] });
  assert.match(po, /1\. Sugar — 10 kg/);
  const bill = { bill_no: "KS-1", date: new Date().toISOString(), total: 100, items: [{ name: "X", qty: 1, unit: "pcs", price: 100, gst: 5 }] };
  assert.match(m.billMessageText(bill, "S", null, "https://chat.whatsapp.com/abc"), /Join our WhatsApp group/);
  assert.doesNotMatch(m.billMessageText(bill, "S", null), /Join our WhatsApp group/);
});

test("tax breakup treats prices as GST-inclusive", () => {
  const { taxable, taxAmt } = m.taxBreakup([{ qty: 1, price: 105, gst: 5 }]);
  assert.equal(taxable, 100);
  assert.equal(taxAmt, 5);
});

test("UPI link carries payee, amount and currency", () => {
  const u = m.upiUri("shop@upi", "Shop", 64, "Checkout");
  assert.match(u, /^upi:\/\/pay\?/);
  assert.match(u, /pa=shop%40upi/);
  assert.match(u, /am=64/);
  assert.match(u, /cu=INR/);
});

test("always-on modules and per-shop toggles", () => {
  assert.equal(isModuleEnabled({ enabled_modules: ["billing"] }, "purchase_orders"), true);
  assert.equal(isModuleEnabled({ enabled_modules: ["billing"] }, "clearance"), true);
  assert.equal(isModuleEnabled({ enabled_modules: ["billing"] }, "reports"), false);
  assert.equal(isModuleEnabled({ enabled_modules: ["billing", "reports"] }, "reports"), true);
});

test("rate limiter blocks after the limit and IP header preference", () => {
  const key = "t:" + Math.random();
  let blocked = 0;
  for (let i = 0; i < 12; i++) if (isRateLimited(key, { windowMs: 60000, max: 10 })) blocked++;
  assert.equal(blocked, 2);
  const h = (o) => ({ headers: { get: (k) => o[k] || null } });
  assert.equal(requestIp(h({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4");
  assert.equal(requestIp(h({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" })), "5.5.5.5");
});

test("every translation file has every key and matching placeholders", async () => {
  const fs = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const used = JSON.parse(execFileSync("node", ["tools/check-i18n.mjs", "--list"], { encoding: "utf8" }));
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
  for (const code of ["hi", "te", "kn", "ta", "ml"]) {
    const d = JSON.parse(fs.readFileSync(`i18n/${code}.json`, "utf8"));
    for (const k of Object.keys(used)) {
      assert.ok(d[k] && d[k].trim(), `${code} missing: ${k}`);
      assert.equal(ph(d[k]), ph(k), `${code} placeholders differ: ${k}`);
    }
  }
});

test("period reports: IST day/week/month ranges and summary", async () => {
  const { periodRange, summarizePeriod, periodText, istDateString } = await import("../lib/periodReport.js");
  // 2026-10-05 is a Monday. IST midnight = 18:30 UTC the day before.
  const day = periodRange("day", "2026-10-05");
  assert.equal(day.start, "2026-10-04T18:30:00.000Z");
  assert.equal(day.end, "2026-10-05T18:30:00.000Z");
  assert.equal(periodRange("week", "2026-10-08").start, day.start); // Thursday -> Monday
  assert.equal(periodRange("week", "2026-10-11").end, "2026-10-11T18:30:00.000Z"); // Sunday -> next Monday
  assert.equal(periodRange("month", "2026-10-20").start, "2026-09-30T18:30:00.000Z");
  assert.equal(periodRange("month", "2026-12-31").end, "2026-12-31T18:30:00.000Z");
  const { previousAnchor } = await import("../lib/periodReport.js");
  assert.equal(previousAnchor("day", "2026-03-01"), "2026-02-28");
  assert.equal(previousAnchor("week", "2026-10-05"), "2026-09-28");
  assert.equal(previousAnchor("month", "2026-01-15"), "2025-12-01");
  assert.equal(istDateString(new Date("2026-10-05T19:00:00Z")), "2026-10-06");
  const s = summarizePeriod(
    [{ total: 20, payment_type: "cash", payment_method: "cash" }, { total: 50, payment_type: "cash", payment_method: "upi" }, { total: 30, payment_type: "credit", payment_method: "cash" }],
    [{ amount: 40, category: "Rent" }, { amount: 10, category: "Rent" }, { amount: 5, category: "Tea" }]
  );
  assert.deepEqual([s.bills, s.sales, s.cash, s.digital, s.credit, s.expenses, s.net], [3, 100, 20, 50, 30, 55, 45]);
  assert.deepEqual(s.byCategory[0], { category: "Rent", amount: 50 });
  const txt = periodText({ shopName: "S", title: "Daily report", label: "x", s, prev: { sales: 80 }, period: "day" });
  assert.match(txt, /Net  ₹45/);
  assert.match(txt, /▲ 25% vs yesterday/);
});

// ---- returns, reminders, reports with returns ----
const { returnableLines, refundFor, refundMethods } = await import("../lib/returns.js");
const { dueReminders } = await import("../lib/reminders.js");
const { summarizePeriod } = await import("../lib/periodReport.js");
const { computeGstSummary, returnsAsBills } = await import("../lib/gstReport.js");

const sugarBill = {
  id: "b1", subtotal: 200, total: 180, payment_type: "cash", payment_method: "upi", customer_phone: "9999900000",
  items: [{ shop_product_id: "p1", name: "Sugar", unit: "kg", price: 50, gst: 5, qty: 4 }],
};

test("returnable quantity drops by what was already returned", () => {
  assert.equal(returnableLines(sugarBill, [])[0].left, 4);
  assert.equal(returnableLines(sugarBill, [{ items: [{ shop_product_id: "p1", qty: 1 }] }])[0].left, 3);
  assert.equal(returnableLines(sugarBill, [{ items: [{ shop_product_id: "p1", qty: 4 }] }]).length, 0);
});

test("refund follows the bill's discount, matching the database", () => {
  const lines = returnableLines(sugarBill, []);
  assert.equal(refundFor(sugarBill, lines, { p1: 1 }), 45);
  assert.equal(refundFor(sugarBill, lines, { p1: 4 }), 180);
  assert.equal(refundFor(sugarBill, lines, {}), 0);
});

test("refund methods: udhaar bills reduce udhaar, others refund the way they paid", () => {
  assert.deepEqual(refundMethods({ payment_type: "credit" }), ["credit"]);
  assert.deepEqual(refundMethods(sugarBill), ["upi", "credit"]);
  assert.deepEqual(refundMethods({ payment_type: "cash", payment_method: "cash" }), ["cash"]);
});

test("reports: a return comes off sales, the way it was paid, and top sellers", () => {
  const bills = [{ items: [{ name: "Sugar", qty: 4, price: 50 }], total: 180, payment_type: "cash", payment_method: "cash" }];
  const returns = [{ refund_amount: 45, refund_method: "cash", items: [{ name: "Sugar", qty: 1, amount: 45 }] }];
  const s = summarizePeriod(bills, [], returns);
  assert.equal(s.sales, 135);
  assert.equal(s.cash, 135);
  assert.equal(s.returns, 45);
  assert.equal(s.topItems[0].qty, 3);
  assert.equal(summarizePeriod(bills, [], []).sales, 180); // no returns: unchanged
});

test("GST summary nets returns off the same rate", () => {
  const bills = [{ items: [{ name: "Sugar", qty: 4, price: 50, gst: 5 }] }];
  const rets = [{ items: [{ name: "Sugar", qty: 1, price: 50, gst: 5 }] }];
  const gross = computeGstSummary(bills)[0];
  const net = computeGstSummary([...bills, ...returnsAsBills(rets)])[0];
  assert.equal(Math.round(gross.total), 200);
  assert.equal(Math.round(net.total), 150);
});

test("udhaar reminders: who is due, who is not", () => {
  const now = new Date("2026-10-10T12:00:00Z").getTime();
  const d = (n) => new Date(now - n * 86_400_000).toISOString();
  const credits = [
    { phone: "1", name: "Old", type: "charge", amount: 500, date: d(20) },
    { phone: "2", name: "Fresh", type: "charge", amount: 500, date: d(1) },
    { phone: "3", name: "Tiny", type: "charge", amount: 20, date: d(30) },
    { phone: "4", name: "Reminded", type: "charge", amount: 300, date: d(30) },
    { phone: "5", name: "Paid", type: "charge", amount: 300, date: d(30) },
    { phone: "5", name: "Paid", type: "payment", amount: 300, date: d(2) },
    { phone: "6", name: "Remindedlong", type: "charge", amount: 300, date: d(30) },
  ];
  const log = [{ phone: "4", sent_at: d(2) }, { phone: "6", sent_at: d(9) }];
  const due = dueReminders(credits, log, { reminder_every_days: 7, reminder_min_amount: 50 }, now);
  assert.deepEqual(due.map((c) => c.phone), ["1", "6"]);
  assert.equal(due[0].balance, 500);
  assert.equal(due[0].daysOwing, 20);
});
