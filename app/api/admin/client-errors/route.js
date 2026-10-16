import { NextResponse } from "next/server";
import { serverError } from "@/lib/apiSafe";
import { requireAdmin } from "@/lib/supabaseAdmin";

// The error reports from people's browsers (last 30 days). Messages are already scrubbed of long
// numbers and email addresses when they are stored.
export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const [errors, shops] = await Promise.all([
    admin.from("client_errors").select("id, at, shop_id, route, message, stack, app_version").order("at", { ascending: false }).limit(300),
    admin.from("shops").select("id, name").limit(2000),
  ]);
  if (errors.error) {
    if (/does not exist|schema cache/i.test(errors.error.message)) return NextResponse.json({ needsMigration: true, errors: [] });
    return serverError(errors.error, "admin/client-errors");
  }
  const names = Object.fromEntries((shops.data || []).map((s) => [s.id, s.name]));
  return NextResponse.json({ errors: errors.data.map((e) => ({ ...e, shop: names[e.shop_id] || null })) });
}
