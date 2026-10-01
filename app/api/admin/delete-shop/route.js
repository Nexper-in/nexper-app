import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";

// Deletes any shop platform-wide, regardless of who owns it — schema.sql
// cascades everything under it (items, bills, movements, credits,
// day-close history, expenses, supplier links, staff), same as an
// owner deleting their own shop from Store Settings.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { shopId } = await readJson(request);
  if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });

  const { data: shop } = await admin.from("shops").select("name, owner_id").eq("id", shopId).maybeSingle();
  const { error: deleteError } = await admin.from("shops").delete().eq("id", shopId);
  if (deleteError) return serverError(deleteError, "api");

  await logAdminAction(admin, caller.id, caller.email, "delete_shop", "shop", shopId, { shopName: shop?.name, ownerId: shop?.owner_id });
  return NextResponse.json({ ok: true });
}
