// Run: node tests/db/identity.rls.mjs (part of npm run test:db). S18: a shop helper's sign-in
// (staff code + PIN) can never join a company team; a person with their own account still can.
import { buildDb, as, asService, counter } from "./setup.mjs";

const t = counter();
const db = await buildDb();
const q = async (sql) => (await db.query(sql)).rows;
const fails = async (sql) => {
  try {
    await db.exec(sql);
    return null;
  } catch (e) {
    return e.message;
  }
};
const user = async (email) => (await q(`insert into auth.users (email) values ('${email}') returning id`))[0].id;

await as(db, null);
const owner = await user("owner@x"), person = await user("person@x");
const helper = await user("staff-abc123@workers.nexper.internal");
const codeHolder = await user("other@x"); // a normal-looking address that nevertheless holds a staff code
await as(db, owner);
const shop = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'S', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shop}', '${owner}', 'owner', 'O', '{}')`);
await asService(db);
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions, staff_code) values ('${shop}', '${helper}', 'staff', 'Helper', '{}', 'ABC123'), ('${shop}', '${codeHolder}', 'staff', 'Other', '{}', 'XYZ789')`);
const org = (await q(`select org_id from shops where id = '${shop}'`))[0].org_id;

await as(db, owner);
t.ok(/shop helper/.test((await fails(`select org_set_member('${org}', 'staff-abc123@workers.nexper.internal', 'manager')`)) || ""), "a helper's synthetic sign-in cannot be made a manager");
t.ok(/shop helper/.test((await fails(`select org_set_member('${org}', 'staff-abc123@workers.nexper.internal', 'analyst')`)) || ""), "or an analyst");
t.ok(/shop helper/.test((await fails(`select org_set_member('${org}', 'other@x', 'manager')`)) || ""), "an account that holds a staff code is refused whatever its address looks like");
t.ok(!(await fails(`select org_set_member('${org}', 'person@x', 'manager')`)), "a person with their own account can be added");
t.ok((await q(`select count(*)::int c from org_members where org_id = '${org}' and user_id = '${person}'`))[0].c === 1, "and is on the team");
t.ok((await q(`select count(*)::int c from org_members where user_id in ('${helper}', '${codeHolder}')`))[0].c === 0, "the refused ones are not");
await as(db, person);
t.ok(/Only the company owner/.test((await fails(`select org_set_member('${org}', 'other@x', 'manager')`)) || ""), "a manager still cannot add people");
await as(db, "anon");
t.ok(/permission denied/.test((await fails(`select org_set_member('${org}', 'person@x', 'manager')`)) || ""), "an anonymous visitor cannot call it");

console.log(`${t.pass} passed, ${t.fail} failed (identity guards)`);
process.exit(t.fail ? 1 : 0);
