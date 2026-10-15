// Apply the database updates in supabase/migrations to a database.
//   DATABASE_URL=postgres://... node tools/migrate.mjs [--dry-run]
// Use the Supabase "session pooler" connection string (Connect button in the
// dashboard). Never paste the URL into chat or commit it: it holds the database
// password. See docs/RELEASE.md and docs/MULTITENANT_DESIGN.md section 3.5.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyMigrations, pgClient } from "./migrate-core.mjs";
import { connect } from "./connect.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL (the Supabase session pooler connection string).");
  process.exit(2);
}
const dryRun = process.argv.includes("--dry-run");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase");

const client = await connect(url);
try {
  const r = await applyMigrations(pgClient(client), {
    root,
    dryRun,
    appliedBy: process.env.GITHUB_ACTIONS ? "github-actions" : "cli",
    log: (m) => console.log(m),
  });
  if (dryRun) console.log(r.pending.length ? `Would apply: ${r.pending.join(", ")}` : "Nothing to apply: the database is up to date.");
  else console.log(r.applied.length ? `Applied: ${r.applied.join(", ")}` : "Nothing to apply: the database is up to date.");
} catch (e) {
  console.error("FAILED: " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
