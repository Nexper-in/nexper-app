// The newest database update this version of the code expects. Bump it when a new file is
// added to supabase/migrations (tests/dbversion.test.mjs fails if it is forgotten).
export const EXPECTED_DB_VERSION = "047";

// Which database update the connected database has (migration 036 on). Pure
// helpers here; the React hook is in lib/useDbVersion.js. Code that needs a
// newer update checks this and shows "needs the latest database update"
// instead of failing on a missing table.

// "036" -> [36, ""], "012b" -> [12, "b"]. Anything else sorts as the oldest.
function parts(v) {
  const m = /^(\d+)([a-z]*)$/.exec(String(v ?? ""));
  return m ? [Number(m[1]), m[2]] : [-1, ""];
}

export function compareVersions(a, b) {
  const [an, as] = parts(a);
  const [bn, bs] = parts(b);
  if (an !== bn) return an < bn ? -1 : 1;
  return as === bs ? 0 : as < bs ? -1 : 1;
}

// have: what db_version() returned (null when the function does not exist yet).
export function versionAtLeast(have, need) {
  if (have == null) return false;
  return compareVersions(have, need) >= 0;
}

// null means "before update 036" (the function is not there) or unreachable.
export async function getDbVersion(supabase) {
  const { data, error } = await supabase.rpc("db_version");
  if (error || typeof data !== "string") return null;
  return data;
}
