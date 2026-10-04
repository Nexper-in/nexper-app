// Shared by the read API (/api/v1/*) and the MCP endpoint (/api/mcp):
// API-key sign-in and the read-only shop queries. Runs on the server with the
// service role, so EVERY query below is explicitly limited to the key's shop.
import { createAdminClient } from "@/lib/supabaseAdmin";
import { hashApiKey, looksLikeApiKey } from "@/lib/apiKeys";
import { isRateLimited } from "@/lib/rateLimit";
import { mergeSettings } from "@/lib/platformDefaults";
import { flattenShopProduct } from "@/lib/products";
import { fetchAll } from "@/lib/fetchAll";

// Checks the key and everything that has to be switched on. Returns
// { ctx: { admin, shopId, scopes, keyId, settings } } or { error, status }.
export async function authenticateKey(request, { feature }) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!looksLikeApiKey(token)) return { error: "Missing or invalid API key", status: 401 };

  const admin = createAdminClient();
  const { data: key } = await admin
    .from("api_keys")
    .select("id, shop_id, scopes, revoked_at, last_used_at")
    .eq("key_hash", hashApiKey(token))
    .maybeSingle();
  if (!key || key.revoked_at) return { error: "Missing or invalid API key", status: 401 };

  const { data: rows } = await admin.from("platform_settings").select("key, value");
  const settings = mergeSettings(rows);
  const on = feature === "mcp" ? settings.integrations.mcpEnabled : settings.integrations.apiEnabled;
  const flagKey = feature === "mcp" ? "mcp_access" : "api_access";
  if (!on || settings.flags[flagKey] === false) return { error: "This interface is switched off", status: 503 };

  const { data: ctl } = await admin.from("tenant_controls").select("api_enabled, mcp_enabled, feature_overrides").eq("shop_id", key.shop_id).maybeSingle();
  const allowed = feature === "mcp" ? ctl?.mcp_enabled : ctl?.api_enabled;
  if (!allowed || ctl?.feature_overrides?.[flagKey] === false) return { error: "Not enabled for this shop", status: 403 };

  if (isRateLimited(`apikey:${key.id}`, { windowMs: 60_000, max: settings.integrations.rateLimitPerMin })) {
    return { error: "Rate limit reached. Try again in a minute.", status: 429 };
  }
  // Record use at most once a minute.
  if (!key.last_used_at || Date.now() - new Date(key.last_used_at).getTime() > 60_000) {
    admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id).then(() => {}, () => {});
  }
  return { ctx: { admin, shopId: key.shop_id, scopes: key.scopes || [], keyId: key.id, settings } };
}

export const hasScope = (ctx, scope) => ctx.scopes.includes(scope);

const clampLimit = (n, def = 50, max = 200) => Math.max(1, Math.min(max, Number.isFinite(Number(n)) ? Math.floor(Number(n)) : def));
const maskPhone = (p) => (p && p.length > 4 ? `${"x".repeat(p.length - 4)}${p.slice(-4)}` : p || null);
const itemOut = (i) => ({ id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, price: i.price, mrp: i.mrp ?? null, stock: i.stock, low_at: i.low_at, gst: i.gst ?? null, barcode: i.barcode ?? null });

export async function getShop({ admin, shopId }) {
  const { data } = await admin.from("shops").select("id, name, type, gstin, created_at").eq("id", shopId).maybeSingle();
  return data;
}

export async function listItems({ admin, shopId }, { q, limit } = {}) {
  const { data, error } = await admin.from("shop_products").select("*, product:products(*)").eq("shop_id", shopId).order("code").limit(2000);
  if (error) throw error;
  let items = (data || []).map(flattenShopProduct);
  if (q) {
    const needle = String(q).toLowerCase().slice(0, 80);
    items = items.filter((i) => i.name.toLowerCase().includes(needle) || (i.code || "") === needle || (i.barcode || "") === needle);
  }
  return items.slice(0, clampLimit(limit)).map(itemOut);
}

export async function lowStock(c, { limit } = {}) {
  const { data, error } = await c.admin.from("shop_products").select("*, product:products(*)").eq("shop_id", c.shopId).limit(2000);
  if (error) throw error;
  return (data || [])
    .map(flattenShopProduct)
    .filter((i) => Number(i.stock) <= Number(i.low_at))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, clampLimit(limit))
    .map(itemOut);
}

export async function expiringItems({ admin, shopId }, { days = 14 } = {}) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + Math.max(1, Math.min(90, Number(days) || 14)));
  const { data: batches } = await admin
    .from("stock_batches")
    .select("shop_product_id, qty_remaining, expiry_date")
    .eq("shop_id", shopId)
    .gt("qty_remaining", 0)
    .not("expiry_date", "is", null)
    .lte("expiry_date", horizon.toISOString().slice(0, 10))
    .order("expiry_date");
  if (!batches?.length) return [];
  const { data: sp } = await admin.from("shop_products").select("id, product:products(name, unit)").eq("shop_id", shopId).in("id", [...new Set(batches.map((b) => b.shop_product_id))]);
  const byId = Object.fromEntries((sp || []).map((r) => [r.id, r.product]));
  return batches.slice(0, 200).map((b) => ({ item: byId[b.shop_product_id]?.name || null, unit: byId[b.shop_product_id]?.unit || null, qty: b.qty_remaining, expires: b.expiry_date }));
}

export async function listBills({ admin, shopId }, { from, to, limit, maskPhones = false } = {}) {
  let q = admin.from("bills").select("id, bill_no, date, total, discount_amount, payment_type, payment_method, customer_name, customer_phone, items").eq("shop_id", shopId).order("date", { ascending: false });
  if (from) q = q.gte("date", new Date(from).toISOString());
  if (to) q = q.lte("date", new Date(to).toISOString());
  const { data, error } = await q.limit(clampLimit(limit));
  if (error) throw error;
  return (data || []).map((b) => ({
    id: b.id,
    bill_no: b.bill_no,
    date: b.date,
    total: b.total,
    discount: b.discount_amount || 0,
    payment_type: b.payment_type,
    payment_method: b.payment_method,
    customer_name: b.customer_name || null,
    customer_phone: maskPhones ? maskPhone(b.customer_phone) : b.customer_phone || null,
    items: (b.items || []).map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price })),
  }));
}

export async function todaySummary({ admin, shopId }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data } = await fetchAll(() => admin.from("bills").select("id, total, payment_type, payment_method").eq("shop_id", shopId).gte("date", start.toISOString()).order("id"));
  const rows = data || [];
  const split = { cash: 0, upi: 0, other: 0, udhaar: 0 };
  for (const b of rows) {
    if (b.payment_type === "credit") split.udhaar += b.total;
    else if (b.payment_method === "upi") split.upi += b.total;
    else if (!b.payment_method || b.payment_method === "cash") split.cash += b.total;
    else split.other += b.total;
  }
  return { date: start.toISOString().slice(0, 10), bills: rows.length, sales_total: rows.reduce((s, b) => s + b.total, 0), ...split };
}

export async function outstandingUdhaar({ admin, shopId }, { limit, maskPhones = false } = {}) {
  // Every entry, page by page: a balance is a total over all of them.
  const { data, error } = await fetchAll(() => admin.from("credits").select("id, name, phone, amount, type").eq("shop_id", shopId).order("id"));
  if (error) throw error;
  const map = new Map();
  for (const c of data || []) {
    const cur = map.get(c.phone) || { name: c.name, phone: c.phone, balance: 0 };
    cur.balance += c.type === "charge" ? c.amount : -c.amount;
    cur.name = c.name || cur.name;
    map.set(c.phone, cur);
  }
  const owing = [...map.values()].filter((x) => x.balance > 0).sort((a, b) => b.balance - a.balance);
  return {
    total_outstanding: owing.reduce((s, x) => s + x.balance, 0),
    customers_owing: owing.length,
    customers: owing.slice(0, clampLimit(limit, 20)).map((x) => ({ name: x.name, phone: maskPhones ? maskPhone(x.phone) : x.phone, balance: x.balance })),
  };
}
