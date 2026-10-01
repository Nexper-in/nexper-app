import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";

// Reassigns a shop's owner to a different existing member. See
// supabase/migrations/007_admin_transfer_ownership.sql for why this
// goes through one atomic Postgres function instead of separate
// updates — shops.owner_id and shop_members.role must move together.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { shopId, newOwnerUserId } = await readJson(request);
  if (!shopId || !newOwnerUserId) {
    return NextResponse.json({ error: "shopId and newOwnerUserId are required" }, { status: 400 });
  }

  const { error: transferError } = await admin.rpc("admin_transfer_shop_ownership", {
    p_shop_id: shopId,
    p_new_owner_id: newOwnerUserId,
  });
  if (transferError) return NextResponse.json({ error: transferError.message }, { status: 400 });

  await logAdminAction(admin, caller.id, caller.email, "transfer_ownership", "shop", shopId, { newOwnerUserId });
  return NextResponse.json({ ok: true });
}
