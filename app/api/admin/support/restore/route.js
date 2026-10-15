import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";

// Puts back one deleted record (from the 30-day trash) inside an open support session that covers it.
// The database checks the session and writes the access-log row (migration 044).
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  if (await isRateLimited(`support-restore:${caller.id}`, { windowMs: 60_000, max: 20 })) return NextResponse.json({ error: "Slow down." }, { status: 429 });
  const { sessionId, trashId } = await readJson(request);
  if (!sessionId || !Number.isInteger(trashId)) return NextResponse.json({ error: "sessionId and trashId are required" }, { status: 400 });
  const { data, error: e } = await admin.rpc("support_restore_row", { p_session: sessionId, p_admin: caller.id, p_id: trashId });
  if (e) {
    if (/No open support session|outside this support session|no longer kept|cannot be restored|already exists|deleted too/.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: /No open|outside/.test(e.message) ? 403 : 400 });
    }
    if (/function|schema cache/i.test(e.message)) return NextResponse.json({ error: "Run database update 044 first (see MAQBOOL_TASKS)." }, { status: 400 });
    return serverError(e, "admin/support/restore");
  }
  await logAdminAction(admin, caller.id, caller.email, "support_restore", "support_session", sessionId, data || {});
  return NextResponse.json({ ok: true, restored: data });
}
