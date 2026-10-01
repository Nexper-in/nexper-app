import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { createAdminClient, getRequestUser } from "@/lib/supabaseAdmin";

// Removes a staff member entirely — deletes their shop_members row and
// their underlying Supabase auth account. Only the shop's owner can
// call this. The owner's own membership row can never be deleted here.
export async function POST(request) {
  const caller = await getRequestUser(request);
  if (!caller) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { memberId } = await readJson(request);
  if (!memberId) return NextResponse.json({ error: "memberId is required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: target, error: targetError } = await admin
    .from("shop_members")
    .select("id, shop_id, user_id, role")
    .eq("id", memberId)
    .maybeSingle();
  if (targetError) return serverError(targetError, "api");
  if (!target) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
  if (target.role === "owner") return NextResponse.json({ error: "Can't remove the shop owner" }, { status: 400 });

  const { data: callerMembership } = await admin
    .from("shop_members")
    .select("role")
    .eq("shop_id", target.shop_id)
    .eq("user_id", caller.id)
    .maybeSingle();
  if (!callerMembership || callerMembership.role !== "owner") {
    return NextResponse.json({ error: "Only the shop owner can remove staff" }, { status: 403 });
  }

  const { error: deleteRowError } = await admin.from("shop_members").delete().eq("id", memberId);
  if (deleteRowError) return serverError(deleteRowError, "api");

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(target.user_id);
  if (deleteUserError) return serverError(deleteUserError, "api");

  return NextResponse.json({ ok: true });
}
