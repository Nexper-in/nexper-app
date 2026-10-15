import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

// Daily housekeeping (vercel.json): removes shops whose 90 days after closing are over.
// Protected by CRON_SECRET like the nightly summary. Safe to run twice.
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed." }, { status: 401 });

  const admin = createAdminClient();
  const result = {};
  const { data: shops, error } = await admin.rpc("purge_closed_shops", { p_limit: 50 });
  // Before database update 037 the function does not exist: nothing to do yet.
  result.shopsRemoved = error ? 0 : shops;
  if (error && !/function|schema cache/i.test(error.message)) return NextResponse.json({ error: "Could not purge." }, { status: 500 });
  return NextResponse.json({ ok: true, ...result });
}
