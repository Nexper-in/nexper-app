import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { MODULES } from "@/lib/modules";
import { isRateLimited } from "@/lib/rateLimit";

// Admin-scoped version of app/api/staff/update — same shape, but usable
// on any shop's member (owner or staff), not just by that shop's own
// owner. Editing an owner row's permissions is a no-op in practice
// (hasPermission() always returns true for role='owner'), so the UI
// only exposes permission editing for staff rows, but the route doesn't
// need to care either way.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  if (isRateLimited(`admin-update-member:${caller.id}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json({ error: "Too many attempts — wait a minute and try again" }, { status: 429 });
  }

  const { memberId, name, permissions, newPin } = await readJson(request);
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  if (newPin && String(newPin).length < 6) {
    return NextResponse.json({ error: "PIN must be at least 6 digits" }, { status: 400 });
  }

  const { data: target, error: targetError } = await admin
    .from("shop_members")
    .select("id, user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (targetError) return serverError(targetError, "api");
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  const updates = {};
  if (name?.trim()) updates.name = name.trim();
  if (permissions) updates.permissions = Object.fromEntries(MODULES.map((m) => [m.key, !!permissions[m.key]]));

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await admin.from("shop_members").update(updates).eq("id", memberId);
    if (updateError) return serverError(updateError, "api");
  }

  if (newPin) {
    const { error: pinError } = await admin.auth.admin.updateUserById(target.user_id, { password: String(newPin) });
    if (pinError) return serverError(pinError, "api");
  }

  await logAdminAction(admin, caller.id, caller.email, "update_member", "member", memberId, { name: updates.name, pinReset: !!newPin });
  return NextResponse.json({ ok: true });
}
