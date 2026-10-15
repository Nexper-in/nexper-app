// Run: node tests/db/company_plans.rls.mjs (part of npm run test:db). Company plans (039): every
// company has a controls row, members read it, nobody writes it from the browser, AI scans are
// stamped with their company, and an existing database changes for nobody on the day it runs.
import { buildDb, as, asService, counter } from "./setup.mjs";

const t = counter();
const db = await buildDb({ upTo: "038" });
const q = async (sql) => (await db.query(sql)).rows;
const fails = async (sql) => {
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    return e.message;
  }
};
const user = async (n) => (await q(`insert into auth.users (email) values ('${n}@x') returning id`))[0].id;

// An existing database (038) with a shop that scanned something, then 039 on top.
await as(db, null);
const owner = await user("owner"), other = await user("other"), mgr = await user("mgr");
await as(db, owner);
const shop = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'S', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${owner}', 'owner', 'O', '{}')`);
await asService(db);
await db.exec(`insert into ai_usage (shop_id, kind) values ('${shop}', 'scan'), ('${shop}', 'scan')`);
const fs = await import("node:fs");
const mig = fs.readFileSync(new URL("../../supabase/migrations/039_company_plans.sql", import.meta.url).pathname, "utf8");
await db.exec(mig);
await db.exec(mig); // safe twice
await db.exec(`reset role; grant all on all tables in schema public to anon, authenticated, service_role;`);

const org = (await q(`select org_id from shops where id = '${shop}'`))[0].org_id;
t.ok((await q(`select count(*)::int c from org_controls where org_id = '${org}' and plan is null and limits = '{}'::jsonb and deployment = 'shared'`))[0].c === 1, "an existing company gets a controls row with no plan set, so nothing changes for it");
t.ok((await q(`select count(*)::int c from ai_usage where org_id = '${org}'`))[0].c === 2, "earlier scans are stamped with their company");
await asService(db);
await db.exec(`insert into ai_usage (shop_id, kind) values ('${shop}', 'scan')`);
t.ok((await q(`select count(*)::int c from ai_usage where org_id = '${org}'`))[0].c === 3, "new scans are stamped by the database");

// a new company gets its row automatically
await as(db, other);
const shop2 = (await q(`insert into shops (owner_id, name, type) values ('${other}', 'S2', 'kirana') returning id`))[0].id;
const org2 = (await q(`select org_id from shops where id = '${shop2}'`))[0].org_id;
await asService(db);
t.ok((await q(`select count(*)::int c from org_controls where org_id = '${org2}'`))[0].c === 1, "a new company gets its controls row automatically");

// who reads
await db.exec(`insert into org_members (org_id, user_id, role) values ('${org}', '${mgr}', 'manager')`);
await as(db, owner);
t.ok((await q(`select count(*)::int c from org_controls`))[0].c === 1, "the owner reads their company's controls and no other");
await as(db, mgr);
t.ok((await q(`select count(*)::int c from org_controls where org_id = '${org}'`))[0].c === 1, "a company manager reads them too");
await as(db, other);
t.ok((await q(`select count(*)::int c from org_controls where org_id = '${org}'`))[0].c === 0, "another company's owner sees nothing");
await as(db, "anon");
t.ok((await q(`select count(*)::int c from org_controls`).catch(() => [{ c: 0 }]))[0].c === 0, "a visitor sees nothing");

// nobody writes from the browser
await as(db, owner);
const upd = (await q(`with u as (update org_controls set plan = 'pro' where org_id = '${org}' returning 1) select count(*)::int c from u`))[0].c;
t.ok(upd === 0, "an owner cannot give themselves a plan (the update changes nothing)");
t.ok(/row-level security|permission denied/.test((await fails(`insert into org_controls (org_id, plan) values ('${org2}', 'pro')`)) || ""), "or add controls for another company");
await asService(db);
t.ok(!(await fails(`update org_controls set plan = 'pro', plan_expires_at = now() + interval '30 days', limits = '{"aiScansPerMonth": 200}', billing_gstin = '07AAAAA0000A1Z5' where org_id = '${org}'`)), "the server sets plan, end date, limits and billing details");
t.ok(/violates check/.test((await fails(`update org_controls set billing_gstin = 'NOTAGSTIN' where org_id = '${org}'`)) || ""), "a bad GSTIN is refused");
t.ok(/violates check/.test((await fails(`update org_controls set plan = 'platinum' where org_id = '${org}'`)) || ""), "an unknown plan is refused");

console.log(`${t.pass} passed, ${t.fail} failed (company plans)`);
process.exit(t.fail ? 1 : 0);
