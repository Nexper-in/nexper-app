// Run: node tests/db/migrate.mjs (part of npm run test:db). The release tool
// (tools/migrate-core.mjs) on an in-memory Postgres: what it applies, what it
// refuses, and that a failed update leaves nothing behind.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDb, ROOT, counter } from "./setup.mjs";
import { applyMigrations, pgliteClient } from "../../tools/migrate-core.mjs";

const t = counter();
const q = async (db, sql) => (await db.query(sql)).rows;
const fails = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message;
  }
};
// A copy of supabase/ in a temp folder that a test may add files to.
function tempRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexper-mig-"));
  fs.cpSync(ROOT, dir, { recursive: true });
  return dir;
}

// ---------- 1. an empty database ends up fully recorded ----------
const db = await buildDb();
const rows = await q(db, `select version, checksum, applied_by from app_migrations order by version`);
const versions = rows.map((r) => r.version);
t.ok(versions.includes("001") && versions.includes("035") && versions.includes("036"), "empty database: 001..036 are recorded");
t.ok(versions.includes("012b"), "012b is recorded (the Supabase CLI would skip it)");
t.ok(!versions.includes("032"), "the gap at 032 is not invented");
t.ok(rows.find((r) => r.version === "036").checksum, "036 has a checksum");
t.ok((await q(db, `select db_version() v`))[0].v === "036", "db_version() is 036");

// ---------- 2. running again applies nothing ----------
const again = await applyMigrations(pgliteClient(db), { root: ROOT });
t.ok(again.applied.length === 0, "second run applies nothing");

// ---------- 3. dry run on an empty database changes nothing ----------
{
  const empty = new PGlite();
  await empty.exec(`create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$; create function auth.role() returns text language sql as $$ select '' $$;
    create function uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$; create role anon nologin; create role authenticated nologin; create role service_role nologin;`);
  const r = await applyMigrations(pgliteClient(empty), { root: ROOT, dryRun: true });
  t.ok(r.pending[0] === "schema" && r.pending.includes("036"), "dry run on an empty database lists what it would do");
  t.ok((await q(empty, `select to_regclass('public.shops') is not null as ok`))[0].ok === false, "dry run did not touch the database");
}

// ---------- 4. an existing database (001-035 run by hand) gets only 036 and the history ----------
{
  const old = await buildDb({ upTo: "035" });
  t.ok((await q(old, `select to_regclass('public.app_migrations') is null as none`))[0].none, "existing database starts without tracking");
  const r = await applyMigrations(pgliteClient(old), { root: ROOT });
  t.ok(r.applied.join() === "036", `existing database: only 036 applied (got ${r.applied.join()})`);
  const n = (await q(old, `select count(*)::int c from app_migrations`))[0].c;
  t.ok(n === versions.length, `history backfilled: ${n} rows (expected ${versions.length})`);
}

// ---------- 5. 036 pasted by hand into the SQL editor is not applied twice ----------
{
  const old = await buildDb({ upTo: "035" });
  await old.exec(fs.readFileSync(ROOT + "migrations/036_migration_tracking.sql", "utf8"));
  const r = await applyMigrations(pgliteClient(old), { root: ROOT });
  t.ok(r.applied.length === 0, "036 run by hand is recognised, nothing applied");
}

// ---------- 6. a database without 001-035 is refused in plain words ----------
{
  const old = await buildDb({ upTo: "034" });
  const msg = await fails(() => applyMigrations(pgliteClient(old), { root: ROOT }));
  t.ok(msg && /Run database updates 001-035 first/.test(msg), "database without 035 is refused with the plain message");
  t.ok((await q(old, `select to_regclass('public.app_migrations') is null as none`))[0].none, "and nothing was created");
}

// ---------- 7. an applied file that was edited later fails the run ----------
{
  const dir = tempRoot();
  const mdb = await buildDb({ upTo: "035" });
  await applyMigrations(pgliteClient(mdb), { root: dir });
  fs.appendFileSync(path.join(dir, "migrations/036_migration_tracking.sql"), "\n-- sneaky edit\n");
  const msg = await fails(() => applyMigrations(pgliteClient(mdb), { root: dir }));
  t.ok(msg && /was changed after it was applied/.test(msg), "an edited applied update fails the run");
}

// ---------- 8. a failing update rolls back completely and stops the run ----------
{
  const dir = tempRoot();
  fs.writeFileSync(path.join(dir, "migrations/037_bad.sql"), `create table half_done (id int);\ninsert into half_done values (1);\nselect 1/0;\n`);
  fs.writeFileSync(path.join(dir, "migrations/038_never.sql"), `create table never_runs (id int);\n`);
  const mdb = await buildDb({ upTo: "035" });
  const msg = await fails(() => applyMigrations(pgliteClient(mdb), { root: dir }));
  t.ok(msg && /037_bad\.sql failed and was rolled back/.test(msg), "a failing update reports its file and rolls back");
  t.ok((await q(mdb, `select to_regclass('public.half_done') is null as none`))[0].none, "nothing of the failed update is left behind");
  t.ok((await q(mdb, `select to_regclass('public.never_runs') is null as none`))[0].none, "later updates did not run");
  t.ok((await q(mdb, `select db_version() v`))[0].v === "036", "the database stays at the last good update");
  // fix the file: the next run continues from there
  fs.writeFileSync(path.join(dir, "migrations/037_bad.sql"), `create table half_done (id int);\n`);
  const r = await applyMigrations(pgliteClient(mdb), { root: dir });
  t.ok(r.applied.join() === "037,038", `after the fix the run continues (${r.applied.join()})`);
}

// ---------- 9. a "no-transaction" update runs without one ----------
{
  const dir = tempRoot();
  fs.writeFileSync(path.join(dir, "migrations/037_notx.sql"), `-- nexper:no-transaction\ncreate table notx_ok (id int);\n`);
  const mdb = await buildDb({ upTo: "035" });
  const r = await applyMigrations(pgliteClient(mdb), { root: dir });
  t.ok(r.applied.join() === "036,037", "no-transaction update is applied");
  t.ok((await q(mdb, `select to_regclass('public.notx_ok') is not null as ok`))[0].ok, "and its table exists");
}

// ---------- 10. who may call the new functions ----------
{
  const grants = await q(
    db,
    `select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('record_migration', 'db_version')`
  );
  const g = Object.fromEntries(grants.map((r) => [r.proname, r]));
  t.ok(!g.record_migration.anon && !g.record_migration.auth, "record_migration cannot be called by anon or signed-in users");
  t.ok(!g.db_version.anon && g.db_version.auth, "db_version is for signed-in users only");
}

console.log(`${t.pass} passed, ${t.fail} failed (migration runner)`);
process.exit(t.fail ? 1 : 0);
