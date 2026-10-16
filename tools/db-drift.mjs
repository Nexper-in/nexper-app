// Compares snapshots (tools/db-snapshot.mjs) with the repository and with each other.
//   node tools/db-drift.mjs staging.json production.json
// Exit 1 and a readable list when something differs. Used by .github/workflows/drift.yml.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkAgainstRepo, compareSnapshots } from "./db-drift-core.mjs";

const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) {
  console.error("Usage: node tools/db-drift.mjs staging.json production.json");
  process.exit(2);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase");
const a = JSON.parse(fs.readFileSync(fa, "utf8"));
const b = JSON.parse(fs.readFileSync(fb, "utf8"));
const lines = [];
for (const [label, snap] of [["staging", a], ["production", b]]) {
  for (const p of checkAgainstRepo(snap, root)) lines.push(`${label}: ${p}`);
}
const cmp = compareSnapshots(a, b, "staging", "production");
if (cmp.skipped) console.log("Note: " + cmp.skipped);
lines.push(...cmp.diffs);
if (lines.length) {
  console.log("DRIFT FOUND:\n- " + lines.join("\n- "));
  process.exit(1);
}
console.log("No drift: both databases match the repository" + (cmp.skipped ? " (structure not compared)." : " and each other."));
