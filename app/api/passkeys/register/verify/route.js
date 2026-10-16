import { NextResponse } from "next/server";
import { readJson } from "@/lib/apiSafe";
import { passkeyContext, passkeyFailure } from "@/lib/passkeyRoute";
import { registrationVerify } from "@/lib/passkeys";

// Step 2: the device's answer is checked and, if good, the public key is stored.
export async function POST(request) {
  const ctx = await passkeyContext(request, { needUser: true, name: "reg-verify", max: 20 });
  if (ctx.error) return ctx.error;
  const { challengeId, response, name } = await readJson(request);
  try {
    return NextResponse.json({ ok: true, passkey: await registrationVerify({ ...ctx, challengeId, response, name }) });
  } catch (e) {
    return passkeyFailure(e, "passkeys/register/verify");
  }
}
