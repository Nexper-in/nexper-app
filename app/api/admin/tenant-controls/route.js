import { NextResponse } from "next/server";
import { fetchAll } from "@/lib/fetchAll";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { readJson, serverError } from "@/lib/apiSafe";
import { normalizeControls } from "@/lib/platformDefaults";

// Every shop with its admin controls, this month's AI scans and API key count.
export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [shops, controls, usage, keys] = await Promise.all([
    fetchAll(() => admin.from("shops").select("id, name, type, plan, owner_id, created_at").order("created_at", { ascending: false }).order("id")),
    fetchAll(() => admin.from("tenant_controls").select("*").order("shop_id")),
    fetchAll(() => admin.from("ai_usage").select("id, shop_id").gte("created_at", monthStart.toISOString()).order("id")),
    fetchAll(() => admin.from("api_keys").select("id, shop_id").is("revoked_at", null).order("id")),
  ]);
  if (shops.error) return serverError(shops.error, "admin/tenant-controls");
  // Missing tables (migration 029 not run) just mean no controls yet.
  const ctl = Object.fromEntries((controls.data || []).map((c) => [c.shop_id, c]));
  const scans = {};
  for (const u of usage.data || []) scans[u.shop_id] = (scans[u.shop_id] || 0) + 1;
  const keyCount = {};
  for (const k of keys.data || []) keyCount[k.shop_id] = (keyCount[k.shop_id] || 0) + 1;

  return NextResponse.json({
    needsMigration: Boolean(controls.error),
    tenants: shops.data.map((s) => ({ ...s, controls: ctl[s.id] || null, ai_scans_this_month: scans[s.id] || 0, api_keys: keyCount[s.id] || 0 })),
  });
}

export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const { shopId, controls } = await readJson(request);
  if (!shopId || typeof shopId !== "string") return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  let clean;
  try {
    clean = normalizeControls(controls || {});
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const { data: shop } = await admin.from("shops").select("id, name").eq("id", shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  const { error: e } = await admin
    .from("tenant_controls")
    .upsert({ shop_id: shopId, ...clean, updated_at: new Date().toISOString(), updated_by: caller.id });
  if (e) return serverError(e, "admin/tenant-controls");
  await logAdminAction(admin, caller.id, caller.email, "update_tenant_controls", "shop", shopId, { shopName: shop.name, ...clean });
  return NextResponse.json({ ok: true });
}
