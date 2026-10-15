// Builds the real database in memory (PGlite): the stand-ins for what Supabase
// provides, schema.sql, then every migration in order. Shared by the database
// tests. Updates run through tools/migrate-core.mjs, the same code production uses.
// An older update (before 036) may fail only if schema.sql already contains what it
// adds ("already exists"), or it is the one-off data fix for named accounts.
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, pgliteClient } from "../../tools/migrate-core.mjs";

export const ROOT = new URL("../../supabase/", import.meta.url).pathname;

export async function buildDb({ upTo = "999" } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') $$;
    create function uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
  `);
  // The same function production uses: schema.sql, then every update in order.
  await applyMigrations(pgliteClient(db), { root: ROOT, upTo, stripExtensions: true, appliedBy: "test" });
  // Supabase gives these roles access to everything in the public schema and
  // leaves the row-level security rules as the only gate. Do the same here.
  await db.exec(`
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant all on all sequences in schema public to anon, authenticated, service_role;
  `);
  return db;
}

// Run statements as a signed-in user ("uid"), as anonymous, or as the superuser.
export async function as(db, who) {
  const clear = `set_config('request.jwt.claim.role', '', false)`;
  if (who === null) return db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false), ${clear};`);
  if (who === "anon") return db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false), ${clear}; set role anon;`);
  return db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false), ${clear}; set role authenticated;`);
}

// The server (service role): what the platform admin's API routes run as.
export async function asService(db) {
  return db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false);`);
}

export function counter() {
  const r = { pass: 0, fail: 0, failures: [] };
  r.ok = (cond, msg) => {
    if (cond) r.pass++;
    else {
      r.fail++;
      r.failures.push(msg);
      console.log("FAIL:", msg);
    }
  };
  return r;
}
