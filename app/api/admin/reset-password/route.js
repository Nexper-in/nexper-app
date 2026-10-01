import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";

export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  if (isRateLimited(`admin-reset-password:${caller.id}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json({ error: "Too many attempts — wait a minute and try again" }, { status: 429 });
  }

  const { userId, newPassword } = await readJson(request);
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!newPassword || newPassword.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  const { data: targetUser } = await admin.auth.admin.getUserById(userId);
  const { error: resetError } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (resetError) return serverError(resetError, "api");

  await logAdminAction(admin, caller.id, caller.email, "reset_password", "user", userId, { targetEmail: targetUser?.user?.email });
  return NextResponse.json({ ok: true });
}
