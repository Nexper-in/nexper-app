// Prints a stable JSON description of a database's structure and recorded updates.
//   DATABASE_URL=... node tools/db-snapshot.mjs > snapshot.json
// Reads only catalogs and app_migrations: no shop data. tools/db-drift.mjs compares
// snapshots with the repository and with each other.
import { snapshot } from "./db-drift-core.mjs";
import { pgClient } from "./migrate-core.mjs";
import { connect } from "./connect.mjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL.");
  process.exit(2);
}
const client = await connect(url);
try {
  console.log(JSON.stringify(await snapshot(pgClient(client)), null, 1));
} finally {
  await client.end();
}
