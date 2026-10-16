import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";

// Closes a shop for the platform (it is read-only, hidden from staff, and removed after 90 days),
// or, for a shop that never had a bill (a test or spam sign-up), removes it at once after the
// admin types its name. Nothing deletes a shop with bills straight away any more.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });

  const { shopId, mode = "close", confirmName, reason } = await readJson(request);
  if (!shopId) return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  if (!["close", "purge"].includes(mode)) return NextResponse.json({ error: "mode must be close or purge" }, { status: 400 });

  const { data: shop } = await admin.from("shops").select("name, owner_id").eq("id", shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "Shop not found" }, { status: 404 });

  if (mode === "purge") {
    if (!confirmName || confirmName.trim() !== shop.name) return NextResponse.json({ error: "Type the shop's name to confirm." }, { status: 400 });
    const { error: e } = await admin.rpc("purge_shop_now", { p_shop: shopId });
    if (e) {
      if (/has bills/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 400 });
      if (/function|schema cache/i.test(e.message)) return NextResponse.json({ error: "Run database update 037 first (see MAQBOOL_TASKS)." }, { status: 400 });
      return serverError(e, "admin/delete-shop");
    }
    await logAdminAction(admin, caller.id, caller.email, "purge_empty_shop", "shop", shopId, { shopName: shop.name, ownerId: shop.owner_id });
    return NextResponse.json({ ok: true, mode });
  }

  const { error: e } = await admin.rpc("admin_close_shop", { p_shop: shopId, p_reason: (reason || "Closed by Nexper support").slice(0, 200) });
  if (e) {
    if (/function|schema cache/i.test(e.message)) return NextResponse.json({ error: "Run database update 037 first (see MAQBOOL_TASKS)." }, { status: 400 });
    return serverError(e, "admin/delete-shop");
  }
  await logAdminAction(admin, caller.id, caller.email, "close_shop", "shop", shopId, { shopName: shop.name, ownerId: shop.owner_id });
  return NextResponse.json({ ok: true, mode });
}
