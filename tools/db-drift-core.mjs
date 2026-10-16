// Snapshot and comparison logic for the drift check (see tools/db-snapshot.mjs and
// tools/db-drift.mjs). Pure functions plus one query set, so tests can run it on the
// in-memory database.
import crypto from "node:crypto";
import path from "node:path";
import { listMigrations } from "./migrate-core.mjs";

const md5 = (s) => crypto.createHash("md5").update(String(s ?? "")).digest("hex");

// client: { rows(sql) }
export async function snapshot(client) {
  const rows = (sql) => client.rows(sql);
  const hasTracking = (await rows(`select to_regclass('public.app_migrations') is not null as ok`))[0].ok;
  const migrations = hasTracking ? await rows(`select version, name, checksum from app_migrations order by version`) : [];
  // pg_attribute, not information_schema: that one only shows columns the current login may use,
  // and the drift check runs as a limited login in production.
  const columns = await rows(
    `select c.relname t, a.attname c, format_type(a.atttypid, a.atttypmod) ty, a.attnotnull nn
     from pg_attribute a join pg_class c on c.oid = a.attrelid
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped order by 1, a.attnum`
  );
  const tables = await rows(`select c.relname t, c.relrowsecurity rls from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`);
  const indexes = await rows(`select tablename t, indexname i, indexdef d from pg_indexes where schemaname = 'public' order by 1, 2`);
  const policies = await rows(`select tablename t, policyname p, cmd, roles::text r, coalesce(qual, '') q, coalesce(with_check, '') w from pg_policies where schemaname = 'public' and policyname <> 'Drift check reads migrations' order by 1, 2`);
  const fns = await rows(
    `select p.proname n, pg_get_function_identity_arguments(p.oid) a, p.prosecdef d, coalesce(p.proconfig::text, '') cfg, p.prosrc s
     from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2`
  );
  return {
    migrations: migrations.map((m) => ({ version: m.version, name: m.name, checksum: m.checksum })),
    tables: tables.map((t) => `${t.t}${t.rls ? "" : " (RLS OFF)"}`),
    columns: columns.map((c) => `${c.t}.${c.c} ${c.ty}${c.nn ? " not null" : ""}`),
    indexes: indexes.map((i) => `${i.t}: ${i.d}`),
    policies: policies.map((p) => `${p.t}: ${p.p} ${p.cmd} ${p.r} using(${p.q}) check(${p.w})`),
    functions: fns.map((f) => `${f.n}(${f.a}) definer=${f.d} ${f.cfg} body=${md5(f.s)}`),
  };
}

const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

// Compares what a database recorded with the update files in the repository.
export function checkAgainstRepo(snap, root) {
  const problems = [];
  const files = listMigrations(path.join(root, "migrations"));
  const byVersion = new Map(files.map((f) => [f.version, f]));
  const recorded = new Map(snap.migrations.map((m) => [m.version, m]));
  if (!snap.migrations.length) problems.push("no updates are recorded (app_migrations is missing or empty)");
  for (const m of snap.migrations) {
    const f = byVersion.get(m.version);
    if (!f) problems.push(`database has update ${m.version} (${m.name}) that is not in the repository`);
    else if (m.checksum && m.checksum !== sha(f.sql)) problems.push(`update ${m.file ?? m.name} was changed after it was applied (checksum differs)`);
  }
  // A recorded update should be a prefix of the repo's list: nothing skipped in the middle.
  const newest = [...recorded.keys()].sort().pop();
  for (const f of files) {
    if (newest && f.version <= newest && !recorded.has(f.version)) problems.push(`update ${f.file} is older than the database's newest (${newest}) but is not recorded`);
  }
  for (const t of snap.tables) if (t.includes("(RLS OFF)")) problems.push(`table ${t}`);
  return problems;
}

// Two databases at the same update version should have the same structure.
export function compareSnapshots(a, b, labelA = "A", labelB = "B") {
  const va = a.migrations.map((m) => m.version).sort().pop();
  const vb = b.migrations.map((m) => m.version).sort().pop();
  if (va !== vb) return { skipped: `${labelA} is at ${va ?? "none"} and ${labelB} at ${vb ?? "none"}: a release is pending, structure not compared`, diffs: [] };
  const diffs = [];
  for (const key of ["tables", "columns", "indexes", "policies", "functions"]) {
    const sa = new Set(a[key]);
    const sb = new Set(b[key]);
    for (const x of sa) if (!sb.has(x)) diffs.push(`${key}: only in ${labelA}: ${x}`);
    for (const x of sb) if (!sa.has(x)) diffs.push(`${key}: only in ${labelB}: ${x}`);
  }
  return { skipped: null, diffs };
}

