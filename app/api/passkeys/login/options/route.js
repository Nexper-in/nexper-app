import { NextResponse } from "next/server";
import { passkeyContext, passkeyFailure } from "@/lib/passkeyRoute";
import { loginOptions } from "@/lib/passkeys";

// Step 1 of signing in with a passkey. Anyone may ask; it only returns a
// one-time challenge, nothing about any account.
export async function POST(request) {
  const ctx = await passkeyContext(request, { name: "login-options", max: 20 });
  if (ctx.error) return ctx.error;
  try {
    return NextResponse.json(await loginOptions(ctx));
  } catch (e) {
    return passkeyFailure(e, "passkeys/login/options");
  }
}
