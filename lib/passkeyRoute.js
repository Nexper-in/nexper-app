import { NextResponse } from "next/server";
import { createAdminClient, getRequestUser } from "@/lib/supabaseAdmin";
import { isRateLimited, requestIp } from "@/lib/rateLimit";
import { mergeSettings } from "@/lib/platformDefaults";
import { evalFeature } from "@/lib/platformConfig";
import { PasskeyError, resolveRp } from "@/lib/passkeys";
import { serverError } from "@/lib/apiSafe";

// What every passkey route needs before doing anything: a request rate limit, a
// host we serve, the platform switch, and (when asked) a signed-in caller.
export async function passkeyContext(request, { needUser = false, name, max = 20 }) {
  if (isRateLimited(`passkey-${name}:${requestIp(request)}`, { windowMs: 60_000, max })) {
    return { error: NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 }) };
  }
  const rp = resolveRp(request.headers);
  if (!rp) return { error: NextResponse.json({ error: "Fingerprint sign-in isn't available on this address." }, { status: 400 }) };
  const admin = createAdminClient();
  const { data: rows } = await admin.from("platform_settings").select("key, value");
  if (!evalFeature(mergeSettings(rows), null, "passkey_login")) {
    return { error: NextResponse.json({ error: "This sign-in method is switched off right now." }, { status: 403 }) };
  }
  let user = null;
  if (needUser) {
    user = await getRequestUser(request);
    if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  }
  return { rp, admin, user };
}

export function passkeyFailure(error, where) {
  if (error instanceof PasskeyError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (/passkeys|passkey_challenges|schema cache|does not exist/i.test(error?.message || "")) {
    return NextResponse.json({ error: "Fingerprint sign-in needs a database update first (update 032)." }, { status: 503 });
  }
  return serverError(error, where);
}
