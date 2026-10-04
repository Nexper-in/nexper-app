import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { readJson, serverError } from "@/lib/apiSafe";
import { mergeSettings, normalizeSetting, SETTING_KEYS } from "@/lib/platformDefaults";

// All platform settings (defaults filled in), for the admin console.
export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const { data, error: e } = await admin.from("platform_settings").select("key, value, updated_at");
  if (e) {
    // Table missing: the console migration (029) hasn't been run yet.
    if (/platform_settings/.test(e.message)) return NextResponse.json({ settings: mergeSettings([]), needsMigration: true });
    return serverError(e, "admin/settings");
  }
  return NextResponse.json({ settings: mergeSettings(data), updatedAt: Object.fromEntries((data || []).map((r) => [r.key, r.updated_at])) });
}

// Saves one setting after validating it.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const { key, value } = await readJson(request);
  if (!SETTING_KEYS.includes(key)) return NextResponse.json({ error: "Unknown setting" }, { status: 400 });
  let clean;
  try {
    clean = normalizeSetting(key, value);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const { error: e } = await admin
    .from("platform_settings")
    .upsert({ key, value: clean, updated_at: new Date().toISOString(), updated_by: caller.id });
  if (e) return serverError(e, "admin/settings");
  await logAdminAction(admin, caller.id, caller.email, "update_setting", "setting", key, { value: clean });
  return NextResponse.json({ ok: true, key, value: clean });
}
