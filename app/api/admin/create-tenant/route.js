import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { requireAdmin, logAdminAction } from "@/lib/supabaseAdmin";
import { readJson, serverError } from "@/lib/apiSafe";
import { defaultPermissions, defaultModulesForType } from "@/lib/modules";
import { isRateLimited } from "@/lib/rateLimit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TYPES = ["kirana", "supermarket", "automobile", "clothing", "canteen", "other"];

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 14 }, () => chars[randomInt(chars.length)]).join("");
}

// Opens a shop for a customer: creates their sign-in, the shop, their owner
// membership and their controls, all at once. Returns a one-time password to
// share with them securely; they should change it after the first sign-in.
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  if (isRateLimited(`admin-create-tenant:${caller.id}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute." }, { status: 429 });
  }
  const body = await readJson(request);
  const email = String(body.email || "").trim().toLowerCase();
  const shopName = String(body.shopName || "").trim();
  const ownerName = String(body.ownerName || "").trim().slice(0, 80);
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid owner email" }, { status: 400 });
  if (!shopName || shopName.length > 100) return NextResponse.json({ error: "Enter the shop name" }, { status: 400 });
  const type = TYPES.includes(body.type) ? body.type : "kirana";
  const plan = body.plan === "pro" ? "pro" : "free";

  const password = tempPassword();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: ownerName || undefined },
  });
  if (userError) {
    const taken = /already|registered|exists/i.test(userError.message);
    return NextResponse.json({ error: taken ? "That email already has an account" : "Couldn't create the account" }, { status: 400 });
  }
  const userId = created.user.id;

  const rollback = async () => {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  };

  const { data: shop, error: shopError } = await admin.from("shops").insert({ owner_id: userId, name: shopName, type, ...(defaultModulesForType(type) ? { enabled_modules: defaultModulesForType(type) } : {}) }).select().single();
  if (shopError) {
    await rollback();
    return serverError(shopError, "admin/create-tenant");
  }
  const { error: memberError } = await admin.from("shop_members").insert({
    shop_id: shop.id,
    user_id: userId,
    role: "owner",
    name: ownerName || "Owner",
    permissions: defaultPermissions(true),
  });
  if (memberError) {
    await admin.from("shops").delete().eq("id", shop.id);
    await rollback();
    return serverError(memberError, "admin/create-tenant");
  }
  await admin.from("tenant_controls").upsert({ shop_id: shop.id, plan, updated_by: caller.id });

  await logAdminAction(admin, caller.id, caller.email, "create_tenant", "shop", shop.id, { email, shopName, plan });
  return NextResponse.json({ ok: true, shopId: shop.id, email, password });
}
