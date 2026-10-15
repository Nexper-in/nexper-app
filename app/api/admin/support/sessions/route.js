import { NextResponse } from "next/server";
import { serverError } from "@/lib/apiSafe";
import { requireAdmin } from "@/lib/supabaseAdmin";

// The calling admin's own open sessions, and the shops they can start one for.
export async function GET(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const [open, shops] = await Promise.all([
    admin.from("support_sessions").select("id, org_id, shop_id, ticket_ref, reason, kind, unmask_phones, started_at, expires_at").eq("admin_id", caller.id).is("ended_at", null).gt("expires_at", new Date().toISOString()).order("started_at", { ascending: false }),
    admin.from("shops").select("id, name, org_id, status").order("name").limit(1000),
  ]);
  if (open.error) {
    if (/does not exist|schema cache/i.test(open.error.message)) return NextResponse.json({ needsMigration: true, sessions: [], shops: [] });
    return serverError(open.error, "admin/support/sessions");
  }
  return NextResponse.json({ sessions: open.data, shops: shops.data || [] });
}
