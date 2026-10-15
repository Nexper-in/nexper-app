import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";

// Opens a support session: the only way a platform admin gets to read a client's shop data.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  if (isRateLimited(`support-start:${caller.id}`, { windowMs: 3_600_000, max: 30 })) return NextResponse.json({ error: "Too many sessions. Wait a while." }, { status: 429 });

  const { shopId, orgId, ticket, reason, minutes, kind, unmaskPhones } = await readJson(request);
  if (!shopId && !orgId) return NextResponse.json({ error: "Choose a shop or a company." }, { status: 400 });
  const { data, error: e } = await admin.rpc("support_open_session", {
    p_admin: caller.id,
    p_email: caller.email,
    p_shop: shopId || null,
    p_org: orgId || null,
    p_ticket: String(ticket || ""),
    p_reason: String(reason || ""),
    p_minutes: Number(minutes) || 60,
    p_kind: kind === "break_glass" ? "break_glass" : "support",
    p_unmask: Boolean(unmaskPhones),
  });
  if (e) {
    if (/violates check|5 to 120|not found|not in that company|Not allowed/i.test(e.message)) {
      const msg = /violates check/.test(e.message) ? "Give a ticket reference (3 to 40 characters) and a reason (10 to 300 characters)." : e.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (/function|schema cache/i.test(e.message)) return NextResponse.json({ error: "Run database update 038 first (see MAQBOOL_TASKS)." }, { status: 400 });
    return serverError(e, "admin/support/start");
  }
  await logAdminAction(admin, caller.id, caller.email, "support_start", "shop", shopId || orgId, { ticket, kind: data.kind, minutes: Number(minutes) || 60, unmaskPhones: Boolean(unmaskPhones) });
  return NextResponse.json({ session: data });
}
