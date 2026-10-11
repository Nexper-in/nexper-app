import { NextResponse } from "next/server";
import { createAdminClient, getRequestUser } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { buildNightly, sendEmail } from "@/lib/notify";

// "Send me today's summary now": the same summary the nightly job sends, to
// the signed-in user's own address only (never an address from the request).
export async function POST(request) {
  const user = await getRequestUser(request);
  if (!user?.email) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (isRateLimited(`summary-now:${user.id}`, { windowMs: 60_000 * 10, max: 5 })) {
    return NextResponse.json({ error: "Too many emails. Try again in a few minutes." }, { status: 429 });
  }
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const shopId = String(body.shopId || "");
  if (!shopId) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: member } = await admin.from("shop_members").select("shop_id").eq("user_id", user.id).eq("shop_id", shopId).maybeSingle();
  if (!member) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const { data: shop } = await admin.from("shops").select("id, name, reminder_every_days, reminder_min_amount").eq("id", shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  let night;
  try { night = await buildNightly(admin, shop); } catch { return NextResponse.json({ error: "Could not load today's numbers." }, { status: 500 }); }
  const sent = await sendEmail(user.email, `${shop.name} – today's summary`, night.text);
  if (!sent.ok) return NextResponse.json({ error: "Email could not be sent." }, { status: 502 });
  return NextResponse.json({ ok: true, to: user.email });
}
