import { NextResponse } from "next/server";
import { serverError } from "@/lib/apiSafe";
import { requireAdmin } from "@/lib/supabaseAdmin";

// Usage per company for a month: the basis for pricing and for spotting a heavy tenant (migration 045).
export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const month = new URL(request.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month must look like 2026-10" }, { status: 400 });
  const { data, error: e } = await admin.rpc("admin_usage", { p_month: `${month}-01` });
  if (e) {
    if (/function|schema cache/i.test(e.message)) return NextResponse.json({ needsMigration: true, companies: [] });
    return serverError(e, "admin/usage");
  }
  return NextResponse.json({ month, companies: data });
}
