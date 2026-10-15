// Load a shop export (tools/shop-export.mjs) into a database.
//   node tools/shop-import.mjs --to <postgres url> --file shop.json [--mode missing-only|replace] [--dry-run]
// Or set DATABASE_URL instead of --to. A dry run does everything and rolls it back, so the
// counts it prints are what the real run will do. Only this one shop's rows are touched.
import fs from "node:fs";
import { importShop } from "./shop-copy-core.mjs";
import { pgClient } from "./migrate-core.mjs";
import { connect } from "./connect.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const url = arg("--to") || process.env.DATABASE_URL;
const file = arg("--file");
const mode = arg("--mode") || "missing-only";
const dryRun = process.argv.includes("--dry-run");
if (!url || !file) {
  console.error("Usage: node tools/shop-import.mjs --to <postgres url> --file shop.json [--mode missing-only|replace] [--dry-run]");
  process.exit(2);
}
const client = await connect(url);
try {
  const report = await importShop(pgClient(client), JSON.parse(fs.readFileSync(file, "utf8")), { mode, dryRun });
  console.log(dryRun ? "DRY RUN (rolled back):" : "Done:");
  for (const [t, r] of Object.entries(report.tables)) {
    const bits = [r.removed != null ? `removed ${r.removed}` : null, `added ${r.inserted ?? 0}`, `already there ${r.skipped ?? 0}`].filter(Boolean);
    console.log(`  ${t}: ${bits.join(", ")}`);
  }
} catch (e) {
  console.error("FAILED: " + e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
