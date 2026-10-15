// What a Nexper support person may look at inside a client's shop, and how.
// SERVER-ONLY (uses the service-role client). Every read:
//   1. needs an open support session of this admin that covers the shop (database check),
//   2. is one of the allow-listed resources below, each an explicit, scoped query
//      (no free-form SQL, no "download everything"),
//   3. is logged BEFORE anything is returned: if the log cannot be written, nothing is shown,
//   4. shows customers' phone numbers masked unless the session was opened with unmask_phones.
// See docs/MULTITENANT_DESIGN.md section 3.2.
import { fetchAll } from "@/lib/fetchAll";

export const MAX_WINDOW_DAYS = 31;
export const MAX_ROWS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function maskPhone(p) {
  const s = String(p ?? "");
  if (!s) return s;
  if (s.length <= 4) return "*".repeat(s.length);
  return s.slice(0, 2) + "*".repeat(s.length - 4) + s.slice(-2);
}

class Bad extends Error {}

// A date window of at most 31 days: from and to are YYYY-MM-DD (to is included).
function windowOf(params) {
  const { from, to } = params || {};
  if (!DATE.test(from || "") || !DATE.test(to || "")) throw new Bad("Give a from and to date (YYYY-MM-DD).");
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) throw new Bad("The dates are not valid.");
  if ((b - a) / 86400000 + 1 > MAX_WINDOW_DAYS) throw new Bad(`At most ${MAX_WINDOW_DAYS} days at a time.`);
  const end = new Date(b.getTime() + 86400000).toISOString().slice(0, 10);
  return { from, end };
}

const maskRows = (rows, fields, unmask) => (unmask ? rows : rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fields.includes(k) ? maskPhone(v) : v]))));
const page = (params) => Math.max(0, Math.min(1000, Number(params?.page) || 0));
const must = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data || [];
};

export const RESOURCES = {
  // Shop settings (no payment details).
  shop: async (admin, shopId) => must(await admin.from("shops").select("id, name, type, plan, gstin, enabled_modules, status, org_id, created_at").eq("id", shopId)),
  // Members without staff codes or sign-in ids.
  members: async (admin, shopId) => must(await admin.from("shop_members").select("id, role, name, permissions, via_org, created_at").eq("shop_id", shopId).order("created_at").limit(MAX_ROWS)),
  items: async (admin, shopId, params) => {
    const from = page(params) * MAX_ROWS;
    return must(
      await admin
        .from("shop_products")
        .select("id, price, cost_price, gst, stock, low_at, quick, created_at, product:products(name, category, unit)")
        .eq("shop_id", shopId)
        .order("created_at")
        .order("id")
        .range(from, from + MAX_ROWS - 1)
    );
  },
  bill: async (admin, shopId, params, session) => {
    const billNo = String(params?.billNo || "").trim();
    if (!billNo || billNo.length > 30) throw new Bad("Give a bill number.");
    const rows = must(await admin.from("bills").select("*").eq("shop_id", shopId).eq("bill_no", billNo).limit(1));
    return maskRows(rows, ["customer_phone"], session.unmask_phones);
  },
  bills: async (admin, shopId, params, session) => {
    const { from, end } = windowOf(params);
    const rows = must(
      await admin
        .from("bills")
        .select("bill_no, date, customer_name, customer_phone, subtotal, discount_amount, total, payment_type, payment_method")
        .eq("shop_id", shopId)
        .gte("date", from)
        .lt("date", end)
        .order("date", { ascending: false })
        .limit(MAX_ROWS)
    );
    return maskRows(rows, ["customer_phone"], session.unmask_phones);
  },
  // What each customer owes, summed from every entry (paged: the API stops at 1000 rows).
  udhaar_balances: async (admin, shopId, params, session) => {
    const { data, error } = await fetchAll(() => admin.from("credits").select("phone, name, amount, type, date").eq("shop_id", shopId).order("date").order("id"), { max: 50000 });
    if (error) throw new Error(error.message);
    const by = new Map();
    for (const c of data) {
      const cur = by.get(c.phone) || { phone: c.phone, name: c.name, balance: 0, last: c.date };
      cur.balance += c.type === "charge" ? Number(c.amount) : -Number(c.amount);
      cur.name = c.name || cur.name;
      cur.last = c.date;
      by.set(c.phone, cur);
    }
    const rows = [...by.values()].filter((r) => Math.abs(r.balance) > 0.004).sort((a, b) => b.balance - a.balance).slice(0, MAX_ROWS);
    return maskRows(rows, ["phone"], session.unmask_phones);
  },
  udhaar_customer: async (admin, shopId, params, session) => {
    const phone = String(params?.phone || "").replace(/\D/g, "");
    if (phone.length < 6 || phone.length > 15) throw new Bad("Give the customer's full phone number.");
    const rows = must(await admin.from("credits").select("date, name, phone, amount, type, note").eq("shop_id", shopId).eq("phone", phone).order("date", { ascending: false }).limit(MAX_ROWS));
    return maskRows(rows, ["phone"], session.unmask_phones);
  },
  day_close: async (admin, shopId) => must(await admin.from("reconciliations").select("date, expected_cash, cash_counted, diff").eq("shop_id", shopId).order("date", { ascending: false }).limit(31)),
  expenses: async (admin, shopId, params) => {
    const { from, end } = windowOf(params);
    return must(await admin.from("expenses").select("date, category, amount, note").eq("shop_id", shopId).gte("date", from).lt("date", end).order("date", { ascending: false }).limit(MAX_ROWS));
  },
  // The shop's own error reports (table exists from update 041).
  errors: async (admin, shopId) => {
    const r = await admin.from("client_errors").select("at, route, message, app_version").eq("shop_id", shopId).order("at", { ascending: false }).limit(100);
    if (r.error && /does not exist|schema cache/i.test(r.error.message)) return [];
    return must(r);
  },
};

// Runs one support read. `admin` is the service-role client, `adminId` the signed-in platform admin.
// Returns { status, body }.
export async function runSupportView({ admin, adminId, body }) {
  const { sessionId, shopId, resource, params } = body || {};
  if (!UUID.test(sessionId || "") || !UUID.test(shopId || "")) return { status: 400, body: { error: "sessionId and shopId are required" } };
  const fetcher = RESOURCES[resource];
  if (!fetcher) return { status: 400, body: { error: "Unknown resource" } };

  // 1. the session must be open, this admin's, unexpired, and cover this shop
  const gate = await admin.rpc("support_check", { p_session: sessionId, p_admin: adminId, p_shop: shopId });
  if (gate.error) {
    const known = /No open support session|outside this support session/.test(gate.error.message);
    if (!known) console.error("[support/view] check failed:", gate.error.message);
    return { status: known ? 403 : 500, body: { error: known ? gate.error.message : "Something went wrong. Please try again." } };
  }
  const session = gate.data;

  // 2. the read
  let rows;
  try {
    rows = await fetcher(admin, shopId, params || {}, session);
  } catch (e) {
    if (e instanceof Bad) return { status: 400, body: { error: e.message } };
    console.error("[support/view] read failed:", e.message);
    return { status: 500, body: { error: "Something went wrong. Please try again." } };
  }

  // 3. the log row, before anything is returned. If it cannot be written, nothing is shown.
  const logged = await admin.rpc("support_log_read", {
    p_session: sessionId,
    p_admin: adminId,
    p_shop: shopId,
    p_resource: resource,
    p_params: params ? JSON.parse(JSON.stringify(params)) : null,
    p_rows: rows.length,
  });
  if (logged.error) {
    console.error("[support/view] log failed:", logged.error.message);
    return { status: 500, body: { error: "This view could not be recorded, so nothing is shown." } };
  }
  return { status: 200, body: { resource, rows, phonesMasked: !session.unmask_phones, count: rows.length } };
}
