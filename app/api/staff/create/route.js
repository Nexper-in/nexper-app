import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { createAdminClient, getRequestUser } from "@/lib/supabaseAdmin";
import { MODULES } from "@/lib/modules";

// Staff codes are half of a real login credential, so they're generated
// with a CSPRNG (crypto.randomInt), not Math.random().
function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, easy to read aloud
  let out = "";
  for (let i = 0; i < len; i++) out += chars[randomInt(chars.length)];
  return out;
}

// Creates a real Supabase auth account for a worker (PIN as their
// password) and a shop_members row with the given permissions. Only the
// shop's owner can call this. Uses the service role key — see
// lib/supabaseAdmin.js — so it must stay server-side.
export async function POST(request) {
  const caller = await getRequestUser(request);
  if (!caller) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { shopId, name, pin, permissions } = await request.json();
  if (!shopId || !name?.trim() || !pin || String(pin).length < 6) {
    return NextResponse.json({ error: "Shop, name, and a 6+ digit PIN are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: membership, error: membershipError } = await admin
    .from("shop_members")
    .select("role")
    .eq("shop_id", shopId)
    .eq("user_id", caller.id)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });
  if (!membership || membership.role !== "owner") {
    return NextResponse.json({ error: "Only the shop owner can add staff" }, { status: 403 });
  }

  const cleanPermissions = Object.fromEntries(MODULES.map((m) => [m.key, !!permissions?.[m.key]]));

  let staffCode = null;
  for (let attempt = 0; attempt < 5 && !staffCode; attempt++) {
    const candidate = randomCode();
    const { data: existing } = await admin.from("shop_members").select("id").eq("staff_code", candidate).maybeSingle();
    if (!existing) staffCode = candidate;
  }
  if (!staffCode) return NextResponse.json({ error: "Couldn't generate a unique staff code — try again" }, { status: 500 });

  const email = `staff-${staffCode.toLowerCase()}@workers.nexper.internal`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: String(pin),
    email_confirm: true,
    user_metadata: { full_name: name.trim(), is_staff: true },
  });
  if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });

  const { data: member, error: memberError } = await admin
    .from("shop_members")
    .insert({
      shop_id: shopId,
      user_id: created.user.id,
      role: "staff",
      name: name.trim(),
      staff_code: staffCode,
      permissions: cleanPermissions,
    })
    .select()
    .single();
  if (memberError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ member, staffCode });
}
