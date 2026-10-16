// Fill the STAGING project with synthetic data (run from the "Seed staging" workflow).
// Needs: NEXPER_ENV=staging, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL,
// STAGING_TEST_PASSWORD. Refuses anything else, and refuses a database that holds real
// shops (see scripts/seed-staging-core.mjs).
import { assertStagingSafe, seedStaging, STAGING_DOMAIN } from "./seed-staging-core.mjs";
import { pgClient } from "../tools/migrate-core.mjs";

const need = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL", "STAGING_TEST_PASSWORD"];
if (process.env.NEXPER_ENV !== "staging") {
  console.error("Refusing: NEXPER_ENV must be 'staging'. This script is for the staging project only.");
  process.exit(2);
}
for (const k of need) {
  if (!process.env[k]) {
    console.error(`Missing ${k}.`);
    process.exit(2);
  }
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { default: pg } = await import("pg");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false } });
await db.connect();
try {
  const client = pgClient(db);
  await assertStagingSafe(client);

  const email = "owner" + STAGING_DOMAIN;
  let userId;
  const found = await client.rows(`select id from auth.users where email = $1`, [email]);
  if (found.length) userId = found[0].id;
  else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: process.env.STAGING_TEST_PASSWORD, email_confirm: true, user_metadata: { full_name: "Staging Owner" } });
    if (error) throw new Error("Could not create the test owner: " + error.message);
    userId = data.user.id;
  }
  const r = await seedStaging(client, userId);
  console.log("Seeded:", JSON.stringify(r));
  console.log(`Sign in at https://staging.nexper.in with ${email} and the staging test password.`);
} catch (e) {
  console.error("FAILED: " + e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
