// Run: npm test. Covers the platform console: settings validation, plan and
// feature rules, API keys, the shop queries behind the read API, and the MCP
// protocol, using an in-memory fake of the database client.
import test from "node:test";
import assert from "node:assert/strict";

const D = await import("../lib/platformDefaults.js");
const C = await import("../lib/platformConfig.js");
const K = await import("../lib/apiKeys.js");
const S = await import("../lib/shopApi.js");
const M = await import("../lib/mcpServer.js");

// ---------- settings validation ----------
test("pricing: accepts good values, rejects bad ones, drops unknown fields", () => {
  assert.deepEqual(D.normalizeSetting("pricing", { monthlyInr: "149", yearlyInr: 1299.4, trialDays: 14, evil: "x" }), { monthlyInr: 149, yearlyInr: 1299, trialDays: 14 });
  assert.throws(() => D.normalizeSetting("pricing", { monthlyInr: -5, yearlyInr: 10 }));
  assert.throws(() => D.normalizeSetting("pricing", { monthlyInr: "abc", yearlyInr: 10 }));
});
test("tax: GSTIN format and rate range", () => {
  const ok = D.normalizeSetting("tax", { gstRatePct: 18, pricesIncludeGst: true, gstin: "07aaaaa0000a1z5", sacCode: "998314" });
  assert.equal(ok.gstin, "07AAAAA0000A1Z5");
  assert.throws(() => D.normalizeSetting("tax", { gstRatePct: 18, gstin: "NOTAGSTIN" }));
  assert.throws(() => D.normalizeSetting("tax", { gstRatePct: 99 }));
});
test("signup mode, flags, integrations and unknown keys", () => {
  assert.equal(D.normalizeSetting("signup", { mode: "invite_only", message: "hi" }).mode, "invite_only");
  assert.throws(() => D.normalizeSetting("signup", { mode: "anyone" }));
  assert.deepEqual(D.normalizeSetting("flags", { ocr_scan: false, made_up: false, voice_billing: true }), { ocr_scan: false });
  assert.throws(() => D.normalizeSetting("integrations", { apiEnabled: true, rateLimitPerMin: 99999 }));
  assert.equal(D.normalizeSetting("integrations", { apiEnabled: "true", rateLimitPerMin: 120 }).apiEnabled, true);
  assert.throws(() => D.normalizeSetting("nope", {}));
});

test("plans: unknown features are dropped, limits are numbers", () => {
  const p = D.normalizeSetting("plans", { free: { label: "Basic", limits: { maxStaff: "2", aiScansPerMonth: 10 }, features: ["ocr_scan", "bogus"] }, pro: {} });
  assert.deepEqual(p.free.features, ["ocr_scan"]);
  assert.equal(p.free.limits.maxStaff, 2);
  assert.equal(p.pro.label, "pro");
});
test("defaults match the old behaviour: everyone is Pro, nothing enforced", () => {
  const cfg = D.mergeSettings([]);
  assert.equal(cfg.gating.enforce, false);
  assert.equal(C.evalPro(cfg, { plan: "free" }), true);
  assert.equal(C.evalFeature(cfg, { plan: "free" }, "ocr_scan"), true);
  assert.equal(C.evalFeature(cfg, { plan: "free" }, "api_access"), false, "API stays off by default");
  assert.equal(C.evalLimit(cfg, { plan: "free" }, "aiScansPerMonth"), null);
});
test("a bad stored setting falls back to its default", () => {
  const cfg = D.mergeSettings([{ key: "pricing", value: { monthlyInr: -1 } }, { key: "signup", value: { mode: "closed", message: "" } }]);
  assert.equal(cfg.pricing.monthlyInr, 99);
  assert.equal(cfg.signup.mode, "closed");
});
test("enforced plans, overrides, kill switch and expiry", () => {
  const cfg = D.mergeSettings([{ key: "gating", value: { enforce: true, allowSelfPlanSwitch: false } }]);
  assert.equal(C.evalPro(cfg, { plan: "free" }), false);
  assert.equal(C.evalPro(cfg, { plan: "pro" }), true);
  assert.equal(C.evalFeature(cfg, { plan: "free" }, "ocr_scan"), false);
  assert.equal(C.evalFeature(cfg, { plan: "free" }, "expiry"), true, "free plan keeps counter basics");
  assert.equal(C.evalFeature(cfg, { plan: "free", controls: { feature_overrides: { ocr_scan: true } } }, "ocr_scan"), true);
  assert.equal(C.evalFeature(cfg, { plan: "pro", controls: { feature_overrides: { ocr_scan: false } } }, "ocr_scan"), false);
  assert.equal(C.evalPro(cfg, { plan: "free", controls: { plan: "pro" } }), true, "admin plan override wins");
  assert.equal(C.evalPro(cfg, { plan: "pro", controls: { plan: "pro", plan_expires_at: "2020-01-01" } }), false, "expired plan drops to free");
  const off = D.mergeSettings([{ key: "flags", value: { ocr_scan: false } }]);
  assert.equal(C.evalFeature(off, { plan: "pro", controls: { feature_overrides: { ocr_scan: true } } }, "ocr_scan"), false, "kill switch beats overrides");
  assert.equal(C.evalLimit(cfg, { plan: "free" }, "maxStaff"), 1);
  assert.equal(C.evalLimit(cfg, { plan: "free", controls: { limits: { maxStaff: 5 } } }, "maxStaff"), 5);
});
test("GST on the price", () => {
  assert.deepEqual(C.priceWithTax(118, { gstRatePct: 18, pricesIncludeGst: true }), { base: 100, gst: 18, total: 118, rate: 18, inclusive: true });
  assert.deepEqual(C.priceWithTax(100, { gstRatePct: 18, pricesIncludeGst: false }), { base: 100, gst: 18, total: 118, rate: 18, inclusive: false });
});
test("tenant controls are cleaned", () => {
  const c = D.normalizeControls({ plan: "pro", plan_expires_at: "2027-01-31", limits: { maxStaff: "3", junk: 1 }, feature_overrides: { ocr_scan: true, nope: true, expiry: "yes" }, api_enabled: true, notes: "x".repeat(10) });
  assert.equal(c.plan, "pro");
  assert.deepEqual(c.limits, { maxStaff: 3 });
  assert.deepEqual(c.feature_overrides, { ocr_scan: true });
  assert.equal(c.api_enabled, true);
  assert.equal(c.mcp_enabled, false);
  assert.throws(() => D.normalizeControls({ plan_expires_at: "not a date" }));
  assert.equal(D.normalizeControls({ plan: "gold" }).plan, null);
});

// ---------- API keys ----------
test("API keys: format, hashing, no plaintext stored", () => {
  const { key, prefix, hash } = K.generateApiKey();
  assert.ok(K.looksLikeApiKey(key));
  assert.equal(key.slice(0, 10), prefix);
  assert.equal(K.hashApiKey(key), hash);
  assert.notEqual(hash, key);
  assert.notEqual(K.generateApiKey().key, key);
  for (const bad of ["", "nxp_short", "Bearer x", null, "nxp_" + "a".repeat(40), "sk-ant-123"]) assert.equal(K.looksLikeApiKey(bad), false, String(bad));
});

// ---------- a tiny in-memory database ----------
function fakeDb(tables) {
  const from = (name) => {
    let rows = [...(tables[name] || [])];
    const b = {
      select: () => b,
      eq: (c, v) => ((rows = rows.filter((r) => r[c] === v)), b),
      in: (c, vs) => ((rows = rows.filter((r) => vs.includes(r[c]))), b),
      gt: (c, v) => ((rows = rows.filter((r) => r[c] > v)), b),
      gte: (c, v) => ((rows = rows.filter((r) => r[c] >= v)), b),
      lte: (c, v) => ((rows = rows.filter((r) => r[c] <= v)), b),
      not: (c, op, v) => ((rows = rows.filter((r) => r[c] !== v)), b),
      is: (c, v) => ((rows = rows.filter((r) => r[c] === v)), b),
      order: () => b,
      limit: (n) => ((rows = rows.slice(0, n)), b),
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      single: async () => ({ data: rows[0] || null, error: null }),
      then: (res) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return b;
  };
  return { from };
}
const today = new Date().toISOString();
const ctx = (scopes) => ({
  shopId: "S1",
  scopes,
  admin: fakeDb({
    shops: [{ id: "S1", name: "Sharma Store", type: "kirana", gstin: null, created_at: today }, { id: "S2", name: "Other Shop" }],
    shop_products: [
      { id: "a", shop_id: "S1", code: "01", price: 10, stock: 2, low_at: 5, product: { id: "p1", name: "Sugar", unit: "kg" } },
      { id: "b", shop_id: "S1", code: "02", price: 50, stock: 40, low_at: 5, product: { id: "p2", name: "Atta", unit: "kg" } },
      { id: "c", shop_id: "S2", code: "01", price: 99, stock: 1, low_at: 5, product: { id: "p3", name: "SECRET ITEM", unit: "pcs" } },
    ],
    bills: [
      { shop_id: "S1", id: "b1", bill_no: "KS-1", date: today, total: 100, payment_type: "cash", payment_method: "cash", customer_name: "Ravi", customer_phone: "9876500001", items: [{ name: "Sugar", qty: 1, unit: "kg", price: 100 }] },
      { shop_id: "S1", id: "b2", bill_no: "KS-2", date: today, total: 60, payment_type: "credit", payment_method: null, customer_name: "Anil", customer_phone: "9876500003", items: [] },
      { shop_id: "S2", id: "b3", bill_no: "X", date: today, total: 9999, payment_type: "cash", items: [] },
    ],
    credits: [
      { shop_id: "S1", name: "Anil", phone: "9876500003", amount: 500, type: "charge" },
      { shop_id: "S1", name: "Anil", phone: "9876500003", amount: 100, type: "payment" },
      { shop_id: "S2", name: "Zed", phone: "1111111111", amount: 777, type: "charge" },
    ],
    stock_batches: [],
  }),
});
const FULL = ["read:shop", "read:stock", "read:bills", "read:udhaar"];

test("read API only ever returns the key's own shop", async () => {
  const c = ctx(FULL);
  const items = await S.listItems(c);
  assert.deepEqual(items.map((i) => i.name).sort(), ["Atta", "Sugar"]);
  assert.ok(!JSON.stringify(await S.listBills(c)).includes("9999"));
  assert.equal((await S.outstandingUdhaar(c)).total_outstanding, 400);
  assert.equal((await S.todaySummary(c)).sales_total, 160);
  assert.equal((await S.todaySummary(c)).udhaar, 60);
  assert.deepEqual((await S.lowStock(c)).map((i) => i.name), ["Sugar"]);
  assert.equal((await S.listItems(c, { q: "atta" }))[0].name, "Atta");
  assert.equal((await S.getShop(c)).name, "Sharma Store");
});

// ---------- MCP ----------
const call = (c, method, params, id = 1) => M.handleMcpMessage({ jsonrpc: "2.0", id, method, params }, c);

test("MCP: initialize, ping, notifications, unknown method, bad message", async () => {
  const c = ctx(FULL);
  const init = await call(c, "initialize", { protocolVersion: "2025-03-26" });
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(init.result.serverInfo.name, "nexper");
  assert.equal((await call(c, "initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion, "2025-03-26");
  assert.deepEqual((await call(c, "ping")).result, {});
  assert.equal(await M.handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, c), null);
  assert.equal((await call(c, "nope")).error.code, -32601);
  assert.equal((await M.handleMcpMessage({ foo: 1 }, c)).error.code, -32600);
});
test("MCP: tools list follows scopes", async () => {
  const all = (await call(ctx(FULL), "tools/list")).result.tools.map((t) => t.name);
  assert.ok(all.includes("outstanding_udhaar") && all.includes("search_items"));
  const stockOnly = (await call(ctx(["read:stock"]), "tools/list")).result.tools.map((t) => t.name);
  assert.deepEqual(stockOnly.sort(), ["expiring_items", "low_stock", "search_items"]);
  for (const t of (await call(ctx(FULL), "tools/list")).result.tools) assert.equal(t.annotations.readOnlyHint, true);
});
test("MCP: calls work, respect scopes, mask phone numbers, never cross shops", async () => {
  const c = ctx(FULL);
  const r = await call(c, "tools/call", { name: "search_items", arguments: { query: "sugar" } });
  assert.equal(r.result.isError, false);
  assert.match(r.result.content[0].text, /Sugar/);
  assert.doesNotMatch(r.result.content[0].text, /SECRET ITEM/);
  const bills = (await call(c, "tools/call", { name: "recent_bills", arguments: {} })).result.content[0].text;
  assert.doesNotMatch(bills, /9876500001/);
  assert.match(bills, /xxxxxx0001/);
  const ud = (await call(c, "tools/call", { name: "outstanding_udhaar", arguments: {} })).result.content[0].text;
  assert.doesNotMatch(ud, /9876500003/);
  const denied = await call(ctx(["read:stock"]), "tools/call", { name: "recent_bills", arguments: {} });
  assert.equal(denied.result.isError, true);
  assert.equal((await call(c, "tools/call", { name: "drop_database", arguments: {} })).error.code, -32602);
});
