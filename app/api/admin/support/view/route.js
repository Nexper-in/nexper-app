import { NextResponse } from "next/server";
import { readJson } from "@/lib/apiSafe";
import { requireAdmin } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { runSupportView } from "@/lib/supportView";

// One read inside an open support session (see lib/supportView.js for the rules).
export async function POST(request) {
  const { caller, admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  if (await isRateLimited(`support-view:${caller.id}`, { windowMs: 60_000, max: 60 })) return NextResponse.json({ error: "Slow down." }, { status: 429 });
  const { status: code, body } = await runSupportView({ admin, adminId: caller.id, body: await readJson(request) });
  return NextResponse.json(body, { status: code });
}
