import { NextResponse } from "next/server";
import { getRequestUser, createAdminClient } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/notify";

// Called once per browser sign-in (see the SIGNED_IN listener in
// ShopContext.js) so a shop's owner finds out whenever anyone -- staff or
// the owner themselves -- signs into any shop they own. Best-effort: this
// must never block or fail the actual login, so every problem here is
// swallowed and reported back as ok:false rather than an error status.
export async function POST(request) {
  const caller = await getRequestUser(request);
  if (!caller) return NextResponse.json({ ok: false }, { status: 401 });

  // One notification per signed-in user per 10 minutes, regardless of how
  // many shops/owners it fans out to -- covers any double-fire of the
  // client's auth listener (tab refocus, token refresh) without staying
  // silent on a genuinely new sign-in later the same day.
  if (await isRateLimited(`login-notify:${caller.id}`, { windowMs: 10 * 60_000, max: 1 })) {
    return NextResponse.json({ ok: true, skipped: "rate_limited" });
  }

  try {
    const admin = createAdminClient();
    const { data: memberships } = await admin.from("shop_members").select("shop_id").eq("user_id", caller.id);
    const shopIds = [...new Set((memberships || []).map((m) => m.shop_id))];
    if (shopIds.length === 0) return NextResponse.json({ ok: true, skipped: "no_shops" });

    const { data: shops } = await admin.from("shops").select("id, name, owner_id").in("id", shopIds);
    const byOwner = new Map(); // owner_id -> [shop name, ...]
    for (const s of shops || []) {
      if (!s.owner_id) continue;
      if (!byOwner.has(s.owner_id)) byOwner.set(s.owner_id, []);
      byOwner.get(s.owner_id).push(s.name);
    }

    const who = caller.user_metadata?.full_name || caller.email || "Someone";
    const when = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

    // One owner's lookup/email failing (e.g. a stale owner_id) must not stop
    // the others from being notified, so each is its own try/catch rather
    // than one Promise.all that aborts the whole batch on the first reject.
    await Promise.all(
      [...byOwner.entries()].map(async ([ownerId, shopNames]) => {
        try {
          const { data } = await admin.auth.admin.getUserById(ownerId);
          const ownerEmail = data?.user?.email;
          if (!ownerEmail) return;
          const names = shopNames.join(", ");
          await sendEmail(ownerEmail, "Nexper sign-in", `${who} signed into Nexper (${names}) on ${when}.`);
        } catch (err) {
          console.error("[notify-login] owner", ownerId, err?.message || err);
        }
      })
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[notify-login]", err?.message || err);
    return NextResponse.json({ ok: false });
  }
}
