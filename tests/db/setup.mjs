// Builds the real database in memory (PGlite): the stand-ins for what Supabase
// provides, schema.sql, then every migration in order. Shared by the database
// tests. A migration is allowed to fail only if schema.sql already contains what
// it adds ("already exists"), or it is the one-off data fix for named accounts.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

export const ROOT = new URL("../../supabase/", import.meta.url).pathname;
const SKIPPABLE = /already exists|has not signed up yet/;

export async function buildDb({ upTo = "999" } = {}) {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function uuid_generate_v4() returns uuid language sql as $$ select gen_random_uuid() $$;
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
  `);
  await db.exec(fs.readFileSync(ROOT + "schema.sql", "utf8").replace(/create extension[^;]*;/gi, ""));
  const files = fs.readdirSync(ROOT + "migrations").filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (f.slice(0, 3) > upTo) continue;
    try {
      await db.exec(fs.readFileSync(ROOT + "migrations/" + f, "utf8"));
    } catch (e) {
      if (!SKIPPABLE.test(e.message)) throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
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
  if (who === null) return db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  if (who === "anon") return db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  return db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who}', false); set role authenticated;`);
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
