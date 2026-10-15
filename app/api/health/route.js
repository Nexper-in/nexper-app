import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { EXPECTED_DB_VERSION } from "@/lib/dbVersion";

// Which version of the app and database is this deployment running? Protected by a
// token (HEALTH_TOKEN) so it can be checked from one place for every deployment
// (production, staging, a client's own). Returns versions only, never shop data.
const digest = (s) => createHash("sha256").update(String(s)).digest();

export async function GET(request) {
  const expected = process.env.HEALTH_TOKEN;
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!expected || !given || !timingSafeEqual(digest(expected), digest(given))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  let dbVersion = null;
  try {
    const { data } = await createAdminClient().rpc("db_version");
    dbVersion = typeof data === "string" ? data : null;
  } catch {
    dbVersion = null;
  }
  return NextResponse.json({
    app: (process.env.VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 12),
    env: process.env.NEXT_PUBLIC_NEXPER_ENV || "production",
    region: process.env.VERCEL_REGION || null,
    db: dbVersion,
    dbExpected: EXPECTED_DB_VERSION,
    dbUpToDate: dbVersion !== null && dbVersion >= EXPECTED_DB_VERSION,
  });
}
