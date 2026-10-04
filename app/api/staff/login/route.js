import { NextResponse } from "next/server";
import { readJson, serverError } from "@/lib/apiSafe";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isRateLimited, requestIp } from "@/lib/rateLimit";

// Resolves a staff code to the login email for that worker's account —
// called before the browser's own supabase.auth.signInWithPassword, so
// the actual PIN check still goes through Supabase's normal secure
// sign-in (rate-limited, etc.), not this route. This route's own lookup
// is rate-limited too — without that, it's a free 404/200 oracle for
// enumerating valid staff codes before ever touching Supabase's auth
// rate limiting (see lib/rateLimit.js for this limiter's caveats).
export async function POST(request) {
  if (isRateLimited(`staff-login:${requestIp(request)}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json({ error: "Too many attempts — wait a minute and try again" }, { status: 429 });
  }

  const { staffCode } = await readJson(request);
  if (!staffCode || typeof staffCode !== "string" || staffCode.length > 20) return NextResponse.json({ error: "Staff code is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: member, error } = await admin
    .from("shop_members")
    .select("user_id")
    .eq("staff_code", String(staffCode).trim().toUpperCase())
    .maybeSingle();
  if (error) return serverError(error, "api");
  if (!member) return NextResponse.json({ error: "Staff code not found" }, { status: 404 });

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(member.user_id);
  if (userError || !userData?.user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  return NextResponse.json({ email: userData.user.email });
}
