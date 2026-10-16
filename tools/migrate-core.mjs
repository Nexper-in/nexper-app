// The one function that applies database updates. tools/migrate.mjs runs it
// against a real Supabase database; tests/db/setup.mjs runs it against an
// in-memory Postgres. What the tests build is what production gets.
//
// Rules (docs/MULTITENANT_DESIGN.md section 3.5):
//  - An empty database gets supabase/schema.sql, then 001-035. Those old files
//    were written to be run by hand on top of schema.sql, so an "already exists"
//    error from them is tolerated (as it always was).
//  - A database that has had 001-035 but has no app_migrations table is an
//    existing database: only files from STRICT_FROM on are applied.
//  - Files from STRICT_FROM (036) on run one per transaction and must not fail.
//    A failing file rolls back and stops the run. Every applied file is recorded
//    with its checksum, and a file edited after it was applied fails the run.
//  - One run at a time (advisory lock). Short lock timeout, long statement timeout.
//  - A file whose first line is "-- nexper:no-transaction" runs outside a
//    transaction (needed for create index concurrently on a big table).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const STRICT_FROM = "036";
const LOCK_KEY = 7274001; // arbitrary, the same for every run
const TOLERATED = /already exists|has not signed up yet/;

const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
// "012b_x.sql" -> "012b"; "036_x.sql" -> "036"
const versionOf = (file) => file.split("_")[0];

// A client is anything with run(sql) (several statements, no result) and
// rows(sql, params) (one statement, returns the rows).
export function pgliteClient(db) {
  return { run: (sql) => db.exec(sql), rows: async (sql, params = []) => (await db.query(sql, params)).rows };
}
export function pgClient(client) {
  return {
    run: async (sql) => {
      await client.query(sql);
    },
    rows: async (sql, params = []) => (await client.query(sql, params)).rows,
  };
}

export function listMigrations(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}b?_.*\.sql$/.test(f))
    .sort()
    .map((file) => ({ file, version: versionOf(file), sql: fs.readFileSync(path.join(dir, file), "utf8") }));
}

// Returns { applied: [versions], pending: [versions] }. With dryRun nothing is changed.
export async function applyMigrations(client, { root, upTo = "999", dryRun = false, appliedBy = "runner", stripExtensions = false, log = () => {} } = {}) {
  const files = listMigrations(path.join(root, "migrations")).filter((m) => m.version.slice(0, 3) <= upTo);
  const legacy = files.filter((m) => m.version.slice(0, 3) < STRICT_FROM);
  const strict = files.filter((m) => m.version.slice(0, 3) >= STRICT_FROM);

  const [{ got }] = await client.rows("select pg_try_advisory_lock($1) as got", [LOCK_KEY]);
  if (!got) throw new Error("Another migration run is in progress. Wait for it to finish.");
  try {
    const has = async (rel) => (await client.rows("select to_regclass($1) is not null as ok", [rel]))[0].ok;
    const fresh = !(await has("public.shops"));
    const tracked = await has("public.app_migrations");

    if (!fresh && !tracked && !(await has("public.organisations"))) {
      throw new Error("Run database updates 001-035 first (see MAQBOOL_TASKS), then run this tool again.");
    }

    const applied = new Map();
    if (tracked) {
      for (const r of await client.rows("select version, checksum from app_migrations")) applied.set(r.version, r.checksum);
    }

    // A file edited after it was applied must not be silently ignored.
    for (const m of strict) {
      const was = applied.get(m.version);
      if (was && was !== sha(m.sql)) {
        throw new Error(`${m.file} was changed after it was applied. Never edit an applied update: add a new one instead.`);
      }
    }

    const pendingStrict = strict.filter((m) => !applied.has(m.version));
    if (dryRun) {
      return { applied: [], pending: [...(fresh ? ["schema", ...legacy.map((m) => m.version)] : []), ...pendingStrict.map((m) => m.version)] };
    }

    const done = [];
    if (fresh) {
      let base = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
      if (stripExtensions) base = base.replace(/create extension[^;]*;/gi, "");
      await client.run(base);
      for (const m of legacy) {
        try {
          await client.run(m.sql);
        } catch (e) {
          if (!TOLERATED.test(e.message)) throw new Error(`migration ${m.file} failed: ${e.message}`);
        }
      }
      log(`built schema + ${legacy.length} older updates`);
    }

    for (const m of pendingStrict) {
      const noTx = /^\s*--\s*nexper:no-transaction/.test(m.sql);
      try {
        if (noTx) {
          await client.run("set lock_timeout = '5s'; set statement_timeout = '10min'");
          await client.run(m.sql);
        } else {
          await client.run("begin; set local lock_timeout = '5s'; set local statement_timeout = '10min'");
          await client.run(m.sql);
        }
        // The runner records every file itself (checksum, who ran it) so history is
        // complete even if a file forgot its record_migration() line.
        await client.rows(
          `insert into app_migrations (version, name, checksum, applied_by) values ($1, $2, $3, $4)
           on conflict (version) do update set checksum = excluded.checksum, applied_by = excluded.applied_by`,
          [m.version, m.file, sha(m.sql), appliedBy]
        );
        if (!noTx) await client.run("commit");
      } catch (e) {
        if (!noTx) await client.run("rollback").catch(() => {});
        throw new Error(`migration ${m.file} failed and was rolled back: ${e.message}`);
      }
      done.push(m.version);
      log(`applied ${m.file}`);
    }
    return { applied: done, pending: [] };
  } finally {
    await client.rows("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
  }
}
