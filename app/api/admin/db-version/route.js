import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabaseAdmin";
import { EXPECTED_DB_VERSION, getDbVersion, versionAtLeast } from "@/lib/dbVersion";

// What the Platform tab shows: the database's newest update against the one this code expects.
export async function GET(request) {
  const { admin, error, status } = await requireAdmin(request);
  if (error) return NextResponse.json({ error }, { status });
  const version = await getDbVersion(admin);
  return NextResponse.json({ version, expected: EXPECTED_DB_VERSION, upToDate: versionAtLeast(version, EXPECTED_DB_VERSION) });
}
