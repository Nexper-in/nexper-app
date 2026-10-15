import { NextResponse } from "next/server";
import { readJson } from "@/lib/apiSafe";
import { createAdminClient, getRequestUser } from "@/lib/supabaseAdmin";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { scrub } from "@/lib/errorScrub";

// The app reports its own errors here (components/ErrorReporter.js) and they are kept in OUR
// database for 30 days, not sent to a third-party tracker. Never fails loudly: an error reporter
// must not make things worse.
export async function POST(request) {
  if (await isRateLimited(`log-error:${requestIp(request)}`, { windowMs: 60_000, max: 20 })) return new NextResponse(null, { status: 204 });
  const body = await readJson(request);
  if (typeof body.message !== "string" || !body.message) return new NextResponse(null, { status: 204 });

  const admin = createAdminClient();
  // Who and which shop, only if the sign-in checks out and the person really belongs to the shop.
  let userId = null;
  let shopId = null;
  const user = await getRequestUser(request).catch(() => null);
  if (user) {
    userId = user.id;
    if (typeof body.shopId === "string" && /^[0-9a-f-]{36}$/i.test(body.shopId)) {
      const { data } = await admin.from("shop_members").select("shop_id").eq("user_id", user.id).eq("shop_id", body.shopId).maybeSingle();
      if (data) shopId = data.shop_id;
    }
  }
  const { error } = await admin.from("client_errors").insert({
    shop_id: shopId,
    user_id: userId,
    route: scrub(body.route, 120) || null,
    message: scrub(body.message, 500),
    stack: scrub(body.stack, 2000) || null,
    app_version: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 12),
    user_agent: scrub(request.headers.get("user-agent"), 200) || null,
  });
  if (error && !/does not exist|schema cache/i.test(error.message)) console.error("[log-error]", error.message);
  return new NextResponse(null, { status: 204 });
}
