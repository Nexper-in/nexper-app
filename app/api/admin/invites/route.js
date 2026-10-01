import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { readJson, serverError } from "@/lib/apiSafe";
import { isRateLimited } from "@/lib/rateLimit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const { data, error: e } = await admin.from("tenant_invites").select("*").order("created_at", { ascending: false }).limit(200);
  if (e) return NextResponse.json({ invites: [], needsMigration: true });
  return NextResponse.json({ invites: data });
}

// action "create": invite an email to open a shop (optionally send the email).
// action "revoke": cancel a pending invite.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  if (isRateLimited(`admin-invite:${caller.id}`, { windowMs: 60_000, max: 30 })) {
    return NextResponse.json({ error: "Too many invites. Wait a minute." }, { status: 429 });
  }
  const body = await readJson(request);

  if (body.action === "revoke") {
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error: e } = await admin.from("tenant_invites").update({ status: "revoked" }).eq("id", body.id).eq("status", "pending");
    if (e) return serverError(e, "admin/invites");
    await logAdminAction(admin, caller.id, caller.email, "revoke_invite", "invite", body.id, {});
    return NextResponse.json({ ok: true });
  }

  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  const plan = body.plan === "pro" ? "pro" : "free";
  const note = String(body.note || "").slice(0, 300) || null;

  const { data: invite, error: e } = await admin
    .from("tenant_invites")
    .insert({ email, plan, note, invited_by: caller.id })
    .select()
    .single();
  if (e) {
    if (e.code === "23505") return NextResponse.json({ error: "That email already has a pending invite" }, { status: 400 });
    return serverError(e, "admin/invites");
  }

  let emailed = false;
  if (body.sendEmail) {
    // Uses the project's own email settings in Supabase. Fails quietly if none.
    const redirectTo = process.env.NEXT_PUBLIC_APP_URL || undefined;
    const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    emailed = !mailError;
  }
  await logAdminAction(admin, caller.id, caller.email, "create_invite", "invite", invite.id, { email, plan, emailed });
  return NextResponse.json({ ok: true, invite, emailed });
}
