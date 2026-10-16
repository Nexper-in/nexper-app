// Run: node tests/db/drift.mjs (part of npm run test:db). The drift check: a database
// that matches the repository passes; a hand-made change, an edited update or a table
// without row-level security is reported.
import { buildDb, ROOT, counter } from "./setup.mjs";
import { pgliteClient } from "../../tools/migrate-core.mjs";
import { snapshot, checkAgainstRepo, compareSnapshots } from "../../tools/db-drift-core.mjs";

const t = counter();
const snap = async (db) => snapshot(pgliteClient(db));

const a = await buildDb();
const b = await buildDb();
const sa = await snap(a);
const sb = await snap(b);
t.ok(checkAgainstRepo(sa, ROOT).length === 0, "a database built from the repository has no drift against it");
const same = compareSnapshots(sa, sb, "A", "B");
t.ok(!same.skipped && same.diffs.length === 0, "two identical databases match");
t.ok(sa.migrations.some((m) => m.version === "036" && m.checksum), "the snapshot carries recorded updates with checksums");
t.ok(sa.functions.length > 20 && sa.policies.length > 40, "the snapshot covers functions and policies");

// a hand-made change on one side
await b.exec(`create index hand_made_idx on bills (total)`);
await b.exec(`alter table expenses add column sneaky text`);
const d = compareSnapshots(sa, await snap(b), "A", "B");
t.ok(d.diffs.some((x) => x.includes("hand_made_idx")), "an index made by hand is reported");
t.ok(d.diffs.some((x) => x.includes("expenses.sneaky")), "a column added by hand is reported");

// a changed function body
await b.exec(`create or replace function is_shop_owner(target_shop_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select true $$`);
const d2 = compareSnapshots(sa, await snap(b), "A", "B");
t.ok(d2.diffs.some((x) => x.includes("is_shop_owner")), "a function changed by hand is reported");

// different update versions: not compared, said plainly
const old = await buildDb({ upTo: "035" });
await old.exec(`create table app_migrations (version text primary key, name text, checksum text)`);
const so = await snap(old);
const c = compareSnapshots(sa, so, "A", "B");
t.ok(c.skipped && /release is pending/.test(c.skipped), "databases at different versions are not compared");

// repository checks
const bad = JSON.parse(JSON.stringify(sa));
bad.migrations.find((m) => m.version === "036").checksum = "0".repeat(64);
t.ok(checkAgainstRepo(bad, ROOT).some((p) => /changed after it was applied/.test(p)), "an update whose checksum differs from the file is reported");
const unknown = JSON.parse(JSON.stringify(sa));
unknown.migrations.push({ version: "999", name: "999_mystery.sql", checksum: null });
t.ok(checkAgainstRepo(unknown, ROOT).some((p) => /not in the repository/.test(p)), "an update the repository does not know is reported");
const skipped = JSON.parse(JSON.stringify(sa));
skipped.migrations = skipped.migrations.filter((m) => m.version !== "030");
t.ok(checkAgainstRepo(skipped, ROOT).some((p) => /030_supplies\.sql.*not recorded/.test(p)), "an update skipped in the middle is reported");
await a.exec(`create table no_lock (id int)`);
t.ok(checkAgainstRepo(await snap(a), ROOT).some((p) => /no_lock \(RLS OFF\)/.test(p)), "a table without row-level security is reported");

console.log(`${t.pass} passed, ${t.fail} failed (drift check)`);
process.exit(t.fail ? 1 : 0);
