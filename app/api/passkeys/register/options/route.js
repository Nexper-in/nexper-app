import { NextResponse } from "next/server";
import { passkeyContext, passkeyFailure } from "@/lib/passkeyRoute";
import { registrationOptions } from "@/lib/passkeys";

// Step 1 of adding this device: a signed-in user asks for the options.
export async function POST(request) {
  const ctx = await passkeyContext(request, { needUser: true, name: "reg-options", max: 20 });
  if (ctx.error) return ctx.error;
  try {
    return NextResponse.json(await registrationOptions(ctx));
  } catch (e) {
    return passkeyFailure(e, "passkeys/register/options");
  }
}
