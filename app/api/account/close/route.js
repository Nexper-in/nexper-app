import { NextResponse } from "next/server";
import { readJson } from "@/lib/apiSafe";
import { createAdminClient, getRequestUser } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { cancelClosure, closeAccount, closureOf } from "@/lib/accountClose";

// "Close my account" (owner): shops are closed (90 days to download or reopen), the sign-in is
// deleted after the last shop is removed. GET says whether a closure is under way; DELETE cancels it.
async function who(request) {
  const user = await getRequestUser(request);
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (await isRateLimited(`account-close:${user.id}`, { windowMs: 3_600_000, max: 10 })) return { error: NextResponse.json({ error: "Too many tries. Wait a while." }, { status: 429 }) };
  return { user };
}

export async function GET(request) {
  const { user, error } = await who(request);
  if (error) return error;
  return NextResponse.json(await closureOf({ admin: createAdminClient(), user }));
}

export async function POST(request) {
  const { user, error } = await who(request);
  if (error) return error;
  const { confirmEmail } = await readJson(request);
  const r = await closeAccount({ admin: createAdminClient(), user, confirmEmail });
  return NextResponse.json(r.body, { status: r.status });
}

export async function DELETE(request) {
  const { user, error } = await who(request);
  if (error) return error;
  const r = await cancelClosure({ admin: createAdminClient(), user });
  return NextResponse.json(r.body, { status: r.status });
}
