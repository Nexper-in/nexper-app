import { NextResponse } from "next/server";
import { readJson } from "@/lib/apiSafe";
import { passkeyContext, passkeyFailure } from "@/lib/passkeyRoute";

// The signed-in user's own devices: list them, remove one.
export async function GET(request) {
  const ctx = await passkeyContext(request, { needUser: true, name: "list", max: 60 });
  if (ctx.error) return ctx.error;
  try {
    const { data, error } = await ctx.admin
      .from("passkeys")
      .select("id, name, created_at, last_used_at, device_type, backed_up")
      .eq("user_id", ctx.user.id)
      .order("created_at");
    if (error) throw error;
    return NextResponse.json({ passkeys: data });
  } catch (e) {
    return passkeyFailure(e, "passkeys/list");
  }
}

export async function DELETE(request) {
  const ctx = await passkeyContext(request, { needUser: true, name: "remove", max: 30 });
  if (ctx.error) return ctx.error;
  const { id } = await readJson(request);
  if (typeof id !== "string" || id.length > 64) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    // Only the caller's own device can be removed.
    const { error } = await ctx.admin.from("passkeys").delete().eq("id", id).eq("user_id", ctx.user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return passkeyFailure(e, "passkeys/remove");
  }
}
