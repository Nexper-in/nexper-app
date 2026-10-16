import { NextResponse } from "next/server";
import { readJson } from "@/lib/apiSafe";
import { passkeyContext, passkeyFailure } from "@/lib/passkeyRoute";
import { loginVerify } from "@/lib/passkeys";

// Step 2: the device's signature is checked; if it is good, a one-time token is
// returned that the browser exchanges for a normal session.
export async function POST(request) {
  const ctx = await passkeyContext(request, { name: "login-verify", max: 10 });
  if (ctx.error) return ctx.error;
  const { challengeId, response } = await readJson(request);
  try {
    const { tokenHash } = await loginVerify({ ...ctx, challengeId, response });
    return NextResponse.json({ ok: true, token_hash: tokenHash });
  } catch (e) {
    return passkeyFailure(e, "passkeys/login/verify");
  }
}
