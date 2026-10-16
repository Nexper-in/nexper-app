import test from "node:test";
import assert from "node:assert/strict";
import { runSupportView, maskPhone, RESOURCES, MAX_WINDOW_DAYS } from "../lib/supportView.js";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SHOP = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";

// A stand-in for the service-role client. `rpcs` lets a test decide what each database function answers;
// `tables` are the rows a select returns. Everything that is read is recorded in `reads`.
function fake({ rpcs = {}, tables = {} } = {}) {
  const reads = [];
  const calls = [];
  const builder = (table) => {
    const q = { table, filters: [] };
    const api = {
      select: () => api,
      eq: (c, v) => (q.filters.push([c, v]), api),
      gte: () => api,
      lt: () => api,
      order: () => api,
      limit: () => api,
      range: () => api,
      then: (res) => {
        reads.push(table);
        res({ data: (tables[table] || []).filter((r) => q.filters.every(([c, v]) => r[c] === v)), error: null });
      },
    };
    return api;
  };
  return {
    reads,
    calls,
    rpc: async (name, args) => {
      calls.push([name, args]);
      const f = rpcs[name];
      return f ? f(args) : { data: null, error: null };
    },
    from: builder,
  };
}
const okSession = (over = {}) => ({ data: { id: SESSION, admin_id: ADMIN, unmask_phones: false, ...over }, error: null });
const body = (over = {}) => ({ sessionId: SESSION, shopId: SHOP, resource: "bills", params: { from: "2026-10-01", to: "2026-10-07" }, ...over });

test("phones are masked", () => {
  assert.equal(maskPhone("9876543210"), "98******10");
  assert.equal(maskPhone("1234"), "****");
  assert.equal(maskPhone(""), "");
});

test("a read without an open session returns 403 and no data and reads nothing", async () => {
  const admin = fake({ rpcs: { support_check: () => ({ data: null, error: { message: "No open support session" } }) }, tables: { bills: [{ shop_id: SHOP, bill_no: "KS-1", customer_phone: "9876543210" }] } });
  const r = await runSupportView({ admin, adminId: ADMIN, body: body() });
  assert.equal(r.status, 403);
  assert.equal(r.body.rows, undefined);
  assert.deepEqual(admin.reads, [], "the database table was never touched");
  assert.ok(!admin.calls.some(([n]) => n === "support_log_read"), "and nothing was logged as a read");
});

test("a shop outside the session is refused the same way", async () => {
  const admin = fake({ rpcs: { support_check: () => ({ data: null, error: { message: "That shop is outside this support session" } }) } });
  const r = await runSupportView({ admin, adminId: ADMIN, body: body() });
  assert.equal(r.status, 403);
  assert.deepEqual(admin.reads, []);
});

test("an unexpected database error is a 500 that leaks nothing", async () => {
  const admin = fake({ rpcs: { support_check: () => ({ data: null, error: { message: "relation secret_table does not exist" } }) } });
  const r = await runSupportView({ admin, adminId: ADMIN, body: body() });
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.body).includes("secret_table"));
});

test("if the log row cannot be written, no data is returned (fail closed)", async () => {
  const admin = fake({
    rpcs: { support_check: () => okSession(), support_log_read: () => ({ data: null, error: { message: "disk full" } }) },
    tables: { bills: [{ shop_id: SHOP, bill_no: "KS-1", customer_phone: "9876543210" }] },
  });
  const r = await runSupportView({ admin, adminId: ADMIN, body: body() });
  assert.equal(r.status, 500);
  assert.equal(r.body.rows, undefined);
  assert.ok(!JSON.stringify(r.body).includes("9876543210"));
});

test("a good read is logged with its row count, masked by default", async () => {
  const admin = fake({ rpcs: { support_check: () => okSession(), support_log_read: () => ({ data: null, error: null }) }, tables: { bills: [{ shop_id: SHOP, bill_no: "KS-1", customer_phone: "9876543210", total: 50 }, { shop_id: "other", bill_no: "KS-2", customer_phone: "9999999999" }] } });
  const r = await runSupportView({ admin, adminId: ADMIN, body: body() });
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1, "only this shop's rows");
  assert.equal(r.body.rows[0].customer_phone, "98******10");
  assert.equal(r.body.phonesMasked, true);
  const log = admin.calls.find(([n]) => n === "support_log_read")[1];
  assert.equal(log.p_rows, 1);
  assert.equal(log.p_resource, "bills");
  assert.equal(log.p_shop, SHOP);
});

test("phones are shown only when the session was opened with unmask", async () => {
  const admin = fake({ rpcs: { support_check: () => okSession({ unmask_phones: true }), support_log_read: () => ({ data: null, error: null }) }, tables: { bills: [{ shop_id: SHOP, bill_no: "KS-1", customer_phone: "9876543210" }] } });
  const r = await runSupportView({ admin, adminId: ADMIN, body: body() });
  assert.equal(r.body.rows[0].customer_phone, "9876543210");
  assert.equal(r.body.phonesMasked, false);
});

test("only allow-listed resources exist; anything else is refused before the database is asked", async () => {
  const admin = fake();
  const r = await runSupportView({ admin, adminId: ADMIN, body: body({ resource: "auth_users" }) });
  assert.equal(r.status, 400);
  assert.equal(admin.calls.length, 0);
  assert.deepEqual(Object.keys(RESOURCES).sort(), ["bill", "bills", "day_close", "deleted", "errors", "expenses", "items", "members", "shop", "udhaar_balances", "udhaar_customer"]);
});

test("bad ids are refused", async () => {
  const admin = fake();
  assert.equal((await runSupportView({ admin, adminId: ADMIN, body: { sessionId: "x", shopId: SHOP, resource: "shop" } })).status, 400);
  assert.equal((await runSupportView({ admin, adminId: ADMIN, body: { sessionId: SESSION, shopId: "x; drop table", resource: "shop" } })).status, 400);
  assert.equal(admin.calls.length, 0);
});

test("date windows are limited", async () => {
  const mk = () => fake({ rpcs: { support_check: () => okSession(), support_log_read: () => ({ data: null, error: null }) }, tables: { bills: [] } });
  const tooLong = await runSupportView({ admin: mk(), adminId: ADMIN, body: body({ params: { from: "2026-01-01", to: "2026-12-31" } }) });
  assert.equal(tooLong.status, 400);
  assert.ok(tooLong.body.error.includes(String(MAX_WINDOW_DAYS)));
  assert.equal((await runSupportView({ admin: mk(), adminId: ADMIN, body: body({ params: { from: "yesterday", to: "today" } }) })).status, 400);
  assert.equal((await runSupportView({ admin: mk(), adminId: ADMIN, body: body({ params: { from: "2026-10-07", to: "2026-10-01" } }) })).status, 400);
  assert.equal((await runSupportView({ admin: mk(), adminId: ADMIN, body: body({ params: { from: "2026-10-01", to: "2026-10-31" } }) })).status, 200, "exactly 31 days is allowed");
});

test("members come back without staff codes or sign-in ids", async () => {
  // the query itself asks only for safe columns
  const src = RESOURCES.members.toString();
  assert.ok(!src.includes("staff_code") && !src.includes("user_id"));
});

test("udhaar balances are summed and phones masked", async () => {
  const credits = [
    { shop_id: SHOP, phone: "9000000001", name: "Ravi", amount: 100, type: "charge", date: "2026-10-01" },
    { shop_id: SHOP, phone: "9000000001", name: "Ravi", amount: 40, type: "payment", date: "2026-10-02" },
    { shop_id: SHOP, phone: "9000000002", name: "Sita", amount: 20, type: "charge", date: "2026-10-02" },
    { shop_id: SHOP, phone: "9000000003", name: "Zero", amount: 5, type: "charge", date: "2026-10-02" },
    { shop_id: SHOP, phone: "9000000003", name: "Zero", amount: 5, type: "payment", date: "2026-10-03" },
  ];
  const admin = fake({ rpcs: { support_check: () => okSession(), support_log_read: () => ({ data: null, error: null }) }, tables: { credits } });
  const r = await runSupportView({ admin, adminId: ADMIN, body: body({ resource: "udhaar_balances", params: {} }) });
  assert.deepEqual(r.body.rows.map((x) => [x.name, x.balance, x.phone]), [["Ravi", 60, "90******01"], ["Sita", 20, "90******02"]]);
});

test("one customer's udhaar needs a real phone number", async () => {
  const admin = fake({ rpcs: { support_check: () => okSession(), support_log_read: () => ({ data: null, error: null }) }, tables: { credits: [] } });
  assert.equal((await runSupportView({ admin, adminId: ADMIN, body: body({ resource: "udhaar_customer", params: { phone: "12" } }) })).status, 400);
  assert.equal((await runSupportView({ admin, adminId: ADMIN, body: body({ resource: "udhaar_customer", params: { phone: "9000000001" } }) })).status, 200);
});
