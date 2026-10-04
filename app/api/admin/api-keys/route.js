import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { readJson, serverError } from "@/lib/apiSafe";
import { generateApiKey } from "@/lib/apiKeys";
import { API_SCOPES } from "@/lib/platformDefaults";
import { isRateLimited } from "@/lib/rateLimit";

// Keys of one shop (never the secret, only its first characters).
export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const shopId = new URL(request.url).searchParams.get("shopId");
  let q = admin.from("api_keys").select("id, shop_id, name, key_prefix, scopes, created_at, last_used_at, revoked_at").order("created_at", { ascending: false });
  if (shopId) q = q.eq("shop_id", shopId);
  const { data, error: e } = await q.limit(200);
  if (e) return NextResponse.json({ keys: [], needsMigration: true });
  return NextResponse.json({ keys: data });
}

// action "create" returns the full key ONCE. action "revoke" disables a key.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  if (isRateLimited(`admin-api-key:${caller.id}`, { windowMs: 60_000, max: 20 })) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }
  const body = await readJson(request);

  if (body.action === "revoke") {
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error: e } = await admin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", body.id).is("revoked_at", null);
    if (e) return serverError(e, "admin/api-keys");
    await logAdminAction(admin, caller.id, caller.email, "revoke_api_key", "api_key", body.id, {});
    return NextResponse.json({ ok: true });
  }

  const { shopId } = body;
  const name = String(body.name || "").trim().slice(0, 60);
  if (!shopId || typeof shopId !== "string" || !name) return NextResponse.json({ error: "Shop and a key name are required" }, { status: 400 });
  const scopes = (Array.isArray(body.scopes) ? body.scopes : API_SCOPES).filter((s) => API_SCOPES.includes(s));
  if (scopes.length === 0) return NextResponse.json({ error: "Pick at least one scope" }, { status: 400 });
  const { data: shop } = await admin.from("shops").select("id, name").eq("id", shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

  const { key, prefix, hash } = generateApiKey();
  const { data: row, error: e } = await admin
    .from("api_keys")
    .insert({ shop_id: shopId, name, key_prefix: prefix, key_hash: hash, scopes, created_by: caller.id })
    .select("id, name, key_prefix, scopes, created_at")
    .single();
  if (e) return serverError(e, "admin/api-keys");
  await logAdminAction(admin, caller.id, caller.email, "create_api_key", "api_key", row.id, { shopName: shop.name, name, scopes });
  return NextResponse.json({ ok: true, key, record: row });
}
