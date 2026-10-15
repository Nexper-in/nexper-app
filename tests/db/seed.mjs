// Run: node tests/db/seed.mjs (part of npm run test:db). The staging seed makes a small
// chain of synthetic shops, can run twice, and refuses a database with real shops.
import { buildDb, counter } from "./setup.mjs";
import { pgliteClient } from "../../tools/migrate-core.mjs";
import { seedStaging, assertStagingSafe } from "../../scripts/seed-staging-core.mjs";

const t = counter();
const q = async (db, sql) => (await db.query(sql)).rows;
const db = await buildDb();
const client = pgliteClient(db);
const owner = (await q(db, `insert into auth.users (email) values ('owner@staging.nexper.in') returning id`))[0].id;

const r = await seedStaging(client, owner);
t.ok(r.shops.length === 2 && r.shops.every((s) => s.created), "two shops are created");
t.ok((await q(db, `select count(distinct org_id)::int c from shops`))[0].c === 1, "both shops are in one company");
t.ok((await q(db, `select max_shops from organisations`))[0].max_shops === 3, "the company may have 3 shops");
t.ok((await q(db, `select count(*)::int c from bills`))[0].c === 80, "40 bills per shop");
t.ok((await q(db, `select count(*)::int c from shop_products`))[0].c === 24, "12 items per shop");
t.ok((await q(db, `select count(*)::int c from credits`))[0].c > 0, "some bills are udhaar, with credit entries");
t.ok((await q(db, `select count(*)::int c from shop_members where role = 'owner'`))[0].c === 2, "the owner is a member of both shops");

const again = await seedStaging(client, owner);
t.ok(again.shops.every((s) => !s.created) && (await q(db, `select count(*)::int c from bills`))[0].c === 80, "running again adds nothing");

// a database with a real shop is refused
const real = (await q(db, `insert into auth.users (email) values ('realperson@gmail.com') returning id`))[0].id;
await db.query(`insert into shops (owner_id, name, type) values ($1, 'Real Shop', 'kirana')`, [real]);
let msg = null;
try {
  await assertStagingSafe(client);
} catch (e) {
  msg = e.message;
}
t.ok(msg && /Refusing to seed/.test(msg) && /realperson@gmail.com/.test(msg), "a database with a real owner is refused");

console.log(`${t.pass} passed, ${t.fail} failed (staging seed)`);
process.exit(t.fail ? 1 : 0);
