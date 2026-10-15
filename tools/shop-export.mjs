// Write one shop's books to a JSON file (format: lib/shopTables.js).
//   node tools/shop-export.mjs --from <postgres url> --shop <shop id> --out shop.json
// Or set DATABASE_URL instead of --from. The file holds customer names and phone numbers:
// keep it as private as the database.
import fs from "node:fs";
import { exportShop } from "./shop-copy-core.mjs";
import { pgClient } from "./migrate-core.mjs";
import { connect } from "./connect.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const url = arg("--from") || process.env.DATABASE_URL;
const shop = arg("--shop");
const out = arg("--out") || "shop.json";
if (!url || !shop) {
  console.error("Usage: node tools/shop-export.mjs --from <postgres url> --shop <shop id> [--out shop.json]");
  process.exit(2);
}
const client = await connect(url);
try {
  const data = await exportShop(pgClient(client), shop);
  fs.writeFileSync(out, JSON.stringify(data), { mode: 0o600 });
  const counts = Object.entries(data.tables).map(([t, r]) => `${t} ${r.length}`).join(", ");
  console.log(`Wrote ${out}: ${counts}`);
} catch (e) {
  console.error("FAILED: " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
