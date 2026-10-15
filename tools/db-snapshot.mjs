// Prints a stable JSON description of a database's structure and recorded updates.
//   DATABASE_URL=... node tools/db-snapshot.mjs > snapshot.json
// Reads only catalogs and app_migrations: no shop data. tools/db-drift.mjs compares
// snapshots with the repository and with each other.
import { snapshot } from "./db-drift-core.mjs";
import { pgClient } from "./migrate-core.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL.");
  process.exit(2);
}
const { default: pg } = await import("pg");
const local = /localhost|127\.0\.0\.1/.test(url);
let ssl = false;
if (!local) {
  if (process.argv.includes("--no-verify-ssl")) ssl = { rejectUnauthorized: false };
  else if (process.env.DATABASE_CA) ssl = { rejectUnauthorized: true, ca: (await import("node:fs")).readFileSync(process.env.DATABASE_CA, "utf8") };
  else ssl = { rejectUnauthorized: true };
}
const client = new pg.Client({ connectionString: url, ssl });
await client.connect();
try {
  console.log(JSON.stringify(await snapshot(pgClient(client)), null, 1));
} finally {
  await client.end();
}
