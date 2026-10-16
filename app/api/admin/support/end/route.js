import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";

export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const { sessionId } = await readJson(request);
  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  const { error: e } = await admin.rpc("support_end_session", { p_session: sessionId, p_admin: caller.id });
  if (e) return serverError(e, "admin/support/end");
  await logAdminAction(admin, caller.id, caller.email, "support_end", "support_session", sessionId, {});
  return NextResponse.json({ ok: true });
}
