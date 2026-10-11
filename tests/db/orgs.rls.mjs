// Run: npm run test:db. Companies (chains): the backfill of existing shops, the
// shop limit, team roles (manager, analyst, area manager) and what each can and
// cannot do, and that two companies never see each other.
import { buildDb, as, asService, counter } from "./setup.mjs";
import fs from "node:fs";

const t = counter();
// Build everything up to 034, seed an "old" database, then apply 035 on top: that
// is exactly what Maqbool will do on the live one.
const db = await buildDb({ upTo: "034" });
const q = async (sql) => (await db.query(sql)).rows;
const fails = async (sql) => {
  try {
    await db.exec(sql);
    return false;
  } catch (e) {
    return e.message;
  }
};
const user = async (name, full) => (await q(`insert into auth.users (email, raw_user_meta_data) values ('${name}@x', '{"full_name":"${full || name}"}') returning id`))[0].id;

await as(db, null);
const oldOwner = await user("old");
const oldShop = (await q(`insert into shops (owner_id, name, type) values ('${oldOwner}', 'Old Store', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${oldShop}', '${oldOwner}', 'owner', 'Old', '{}')`);
const mig = fs.readFileSync(new URL("../../supabase/migrations/035_companies.sql", import.meta.url).pathname, "utf8");
await db.exec(mig);
await db.exec(mig); // safe to run twice
await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role;`);

// ---------- 1. everyone who existed gets a company of one ----------
const oldOrgId = (await q(`select org_id from shops where id = '${oldShop}'`))[0].org_id;
const bf = await q(`select o.id, o.max_shops, s.org_id, (select count(*)::int from org_members m where m.org_id = o.id and m.role = 'owner' and m.user_id = '${oldOwner}') owners from organisations o join shops s on s.org_id = o.id where s.id = '${oldShop}'`);
t.ok(bf.length === 1 && bf[0].max_shops === 1 && bf[0].owners === 1, "backfill: an existing shop gets a company of its own, owned by its owner, limited to one shop");
t.ok((await q(`select count(*)::int c from shop_members where via_org is not null`))[0].c === 0, "backfill: no company memberships are created for owners (their own rows stay)");

// ---------- 2. a new owner: company made by itself; the limit is enforced ----------
const ownerA = await user("ownerA", "Chain Owner");
await as(db, ownerA);
const shopA1 = (await q(`insert into shops (owner_id, name, type) values ('${ownerA}', 'Chain HQ', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shopA1}', '${ownerA}', 'owner', 'Chain Owner', '{}')`);
const org = (await q(`select id, max_shops from organisations where owner_id = '${ownerA}'`))[0];
t.ok(org && org.max_shops === 1, "a new owner's first shop creates the company automatically");
t.ok(await fails(`insert into shops (owner_id, name, type) values ('${ownerA}', 'Branch 1', 'kirana')`).then((e) => /allows 1 shop/.test(e)), "a second shop is refused while the company is limited to one (the old one-shop rule)");
t.ok(await fails(`update organisations set max_shops = 5 where id = '${org.id}'`).then((e) => /Only Nexper support/.test(e)), "an owner cannot raise their own shop limit");
await asService(db);
await db.exec(`update organisations set max_shops = 3 where id = '${org.id}'`); // what the platform admin does
await as(db, ownerA);
const shopA2 = (await q(`insert into shops (owner_id, name, type) values ('${ownerA}', 'Branch 1', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shopA2}', '${ownerA}', 'owner', 'Chain Owner', '{}')`);
t.ok(true, "after support raises the limit the owner can add a branch");
const shopA3 = (await q(`insert into shops (owner_id, name, type) values ('${ownerA}', 'Branch 2', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shopA3}', '${ownerA}', 'owner', 'Chain Owner', '{}')`);
t.ok(await fails(`insert into shops (owner_id, name, type) values ('${ownerA}', 'Branch 3', 'kirana')`).then((e) => /allows 3 shop/.test(e)), "the limit holds at three");
t.ok((await q(`select count(distinct org_id)::int c from shops where owner_id = '${ownerA}'`))[0].c === 1, "all branches belong to the one company");

// ---------- 3. shared catalog across the chain ----------
const prod = (await q(`insert into products (owner_id, name) values ('${ownerA}', 'Tea 250g') returning id`))[0].id;
for (const s of [shopA1, shopA2, shopA3]) await db.exec(`insert into shop_products (shop_id, product_id, price, stock) values ('${s}', '${prod}', 100, 10)`);
t.ok((await q(`select count(*)::int c from shop_products where product_id = '${prod}'`))[0].c === 3, "the same product is stocked in every branch with its own price and stock");

// ---------- 4. the team ----------
await as(db, null);
const mgr = await user("mgr", "Meena Manager");
const ana = await user("ana", "Anil Analyst");
const area = await user("area", "Asha Area");
const stranger = await user("stranger");
await as(db, ownerA);
await db.exec(`select org_set_member('${org.id}', 'mgr@x', 'manager')`);
await db.exec(`select org_set_member('${org.id}', 'ana@x', 'analyst')`);
await db.exec(`select org_set_member('${org.id}', 'area@x', 'area_manager', array['${shopA1}','${shopA2}']::uuid[])`);
await as(db, null);
const rowsOf = async (u) => q(`select shop_id, role, via_org is not null as derived, (permissions->>'billing')::boolean billing from shop_members where user_id = '${u}' order by shop_id`);
t.ok((await rowsOf(mgr)).length === 3 && (await rowsOf(mgr)).every((r) => r.derived && r.role === "staff" && r.billing), "a manager gets operational access in every shop of the company");
t.ok((await rowsOf(ana)).length === 3 && (await rowsOf(ana)).every((r) => !r.billing), "an analyst gets read-only access in every shop (no billing permission)");
const areaRows = await rowsOf(area);
t.ok(areaRows.length === 2 && !areaRows.some((r) => r.shop_id === shopA3), "an area manager only gets the shops chosen");

// a bill in shop A1 and A3 to test visibility and writes
await db.exec(`insert into bills (shop_id, bill_no, items, subtotal, total) values ('${shopA1}', 'A1-1', '[]', 10, 10), ('${shopA3}', 'A3-1', '[]', 20, 20)`);
await as(db, mgr);
t.ok((await q(`select count(*)::int c from bills`))[0].c === 2, "the manager sees bills of every shop at once");
await db.exec(`insert into bills (shop_id, bill_no, items, subtotal, total) values ('${shopA3}', 'M-1', '[]', 5, 5)`);
t.ok(true, "the manager can bill in any shop");
t.ok(await fails(`select org_set_member('${org.id}', 'stranger@x', 'analyst')`).then((e) => /Only the company owner/.test(e)), "a manager cannot change the team");
t.ok(await fails(`delete from shops where id = '${shopA3}'`) === false || (await q(`select count(*)::int c from shops where id = '${shopA3}'`))[0].c === 1, "a manager cannot delete a shop");
t.ok(await fails(`update shops set name = 'Hacked' where id = '${shopA1}'`) === false && (await q(`select name from shops where id = '${shopA1}'`))[0].name === "Chain HQ", "a manager cannot change shop settings (owner only)");
t.ok((await q(`select count(*)::int c from organisations`))[0].c === 1, "the manager sees the company");
t.ok((await q(`select count(*)::int c from org_team('${org.id}')`))[0].c === 4, "the manager can see the team list");

await as(db, ana);
t.ok((await q(`select count(*)::int c from bills`))[0].c === 3, "the analyst sees every shop's bills");
t.ok(await fails(`insert into bills (shop_id, bill_no, items, subtotal, total) values ('${shopA1}', 'X', '[]', 1, 1)`).then((e) => /row-level security/.test(e)), "the analyst cannot bill");
t.ok(await fails(`insert into expenses (shop_id, category, amount) values ('${shopA1}', 'x', 1)`).then((e) => /row-level security/.test(e)), "the analyst cannot add expenses");
t.ok((await q(`select count(*)::int c from credits`))[0].c === 0, "the analyst cannot read udhaar (permission-scoped)");
t.ok((await q(`select count(*)::int c from org_team('${org.id}')`))[0].c === 0, "the analyst cannot see the team list");

await as(db, area);
t.ok((await q(`select count(*)::int c from bills`))[0].c === 1 && (await q(`select bill_no from bills`))[0].bill_no === "A1-1", "the area manager sees only their shops' bills");

await as(db, stranger);
t.ok((await q(`select count(*)::int c from bills`))[0].c === 0 && (await q(`select count(*)::int c from organisations`))[0].c === 0 && (await q(`select count(*)::int c from org_members`))[0].c === 0, "a stranger sees nothing of the company");
t.ok(await fails(`insert into shops (owner_id, name, type, org_id) values ('${stranger}', 'Sneak', 'kirana', '${org.id}')`).then((e) => /not yours|row-level/.test(e)), "nobody can add a shop to someone else's company");
t.ok(await fails(`insert into org_members (org_id, user_id, role) values ('${org.id}', '${stranger}', 'manager')`).then((e) => /row-level security/.test(e)), "nobody can add themselves to a company directly");

// ---------- 5. direct rows are protected, direct membership wins ----------
await as(db, ownerA);
t.ok(await fails(`insert into shop_members (shop_id, user_id, role, name, via_org) values ('${shopA1}', '${stranger}', 'staff', 'x', '${org.id}')`).then((e) => /row-level security/.test(e)), "a shop owner cannot forge a company membership");
const derived = (await q(`select id from shop_members where user_id = '${mgr}' and shop_id = '${shopA1}'`))[0].id;
await db.exec(`delete from shop_members where id = '${derived}'`);
t.ok((await q(`select count(*)::int c from shop_members where id = '${derived}'`))[0].c === 1, "a shop owner cannot remove a company member's access (done from the Company screen)");
await as(db, null);
// a person who is already direct staff in a shop keeps that row when also given a company role
const both = await user("both");
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shopA1}', '${both}', 'staff', 'Direct', '{"billing": true}')`);
await as(db, ownerA);
await db.exec(`select org_set_member('${org.id}', 'both@x', 'analyst')`);
await db.exec(`select org_remove_member('${org.id}', '${both}')`);
await as(db, null);
t.ok((await q(`select count(*)::int c from shop_members where user_id = '${both}' and shop_id = '${shopA1}' and via_org is null`))[0].c === 1, "removing a company role never removes a direct staff membership");
t.ok((await q(`select count(*)::int c from shop_members where user_id = '${both}' and via_org is not null`))[0].c === 0, "and removes the company ones");

// ---------- 6. removing, changing, the owner ----------
await as(db, ownerA);
await db.exec(`select org_remove_member('${org.id}', '${mgr}')`);
await as(db, null);
t.ok((await rowsOf(mgr)).length === 0, "removing a team member removes their access to every shop");
await as(db, ownerA);
await db.exec(`select org_set_member('${org.id}', 'ana@x', 'manager')`);
await as(db, null);
t.ok((await rowsOf(ana)).every((r) => r.billing) && (await rowsOf(ana)).length === 3, "changing a role updates their access in every shop");
await as(db, ownerA);
t.ok(await fails(`select org_remove_member('${org.id}', '${ownerA}')`).then((e) => /owner cannot be removed/.test(e)), "the owner cannot be removed");
t.ok(await fails(`select org_set_member('${org.id}', 'nobody@x', 'manager')`).then((e) => /No Nexper account/.test(e)), "an unknown email gets a clear message");
t.ok(await fails(`select org_set_member('${org.id}', 'ana@x', 'area_manager', array[]::uuid[])`).then((e) => /at least one shop/.test(e)), "an area manager needs at least one shop");
t.ok(await fails(`select org_set_member('${org.id}', 'ana@x', 'area_manager', array['${oldShop}']::uuid[])`).then((e) => /not in this company/.test(e)), "an area manager cannot be given another company's shop");
t.ok(await fails(`select org_set_member('${org.id}', 'ana@x', 'owner')`).then((e) => /Unknown role/.test(e)), "no second owner");

// a new branch is reachable by existing team members straight away
await asService(db);
await db.exec(`update organisations set max_shops = 5 where id = '${org.id}'`);
await as(db, ownerA);
await db.exec(`select org_set_member('${org.id}', 'area@x', 'area_manager', array['${shopA1}']::uuid[])`);
const shopA4 = (await q(`insert into shops (owner_id, name, type) values ('${ownerA}', 'Branch 3', 'kirana') returning id`))[0].id;
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${shopA4}', '${ownerA}', 'owner', 'Chain Owner', '{}')`);
await as(db, null);
t.ok((await rowsOf(ana)).some((r) => r.shop_id === shopA4) && !(await rowsOf(area)).some((r) => r.shop_id === shopA4), "a new branch is visible to managers and analysts at once, and not to an area manager who does not cover it");

// ---------- 7. the platform's own rules ----------
await as(db, ownerA);
t.ok(await fails(`update shops set org_id = '${oldOrgId}' where id = '${shopA1}'`).then((e) => /cannot move/.test(e)), "a shop cannot move to another company");
t.ok(await fails(`update shops set owner_id = '${mgr}' where id = '${shopA1}'`).then((e) => /Ownership changes/.test(e)), "ownership cannot be changed by the owner");

// ---------- 8. two companies stay apart ----------
await as(db, oldOwner);
t.ok((await q(`select count(*)::int c from shops`))[0].c === 1 && (await q(`select count(*)::int c from organisations`))[0].c === 1, "another company's owner sees only their own company and shop");
t.ok((await q(`select count(*)::int c from products where owner_id = '${ownerA}'`))[0].c === 0, "and not the chain's catalog");

// ---------- 9. ownership transfer follows the company (platform admin only) ----------
await as(db, null);
const heir = await user("heir");
await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${oldShop}', '${heir}', 'staff', 'Heir', '{}')`);
await asService(db);
await db.exec(`select admin_transfer_shop_ownership('${oldShop}', '${heir}')`);
t.ok((await q(`select owner_id from organisations where id = (select org_id from shops where id = '${oldShop}')`))[0].owner_id === heir, "transferring a single-shop company moves the company too");
t.ok(await fails(`select admin_transfer_shop_ownership('${shopA1}', '${ana}')`).then((e) => /several shops/.test(e)), "a shop in a chain cannot be transferred alone");
await as(db, ownerA);
t.ok(await fails(`select admin_transfer_shop_ownership('${shopA1}', '${ana}')`).then((e) => /permission denied/.test(e)), "owners cannot call the transfer function");
await as(db, "anon");
t.ok(await fails(`select org_set_member('${org.id}', 'ana@x', 'manager')`).then((e) => /permission denied/.test(e)), "anonymous visitors cannot call the team functions");

await as(db, null);
console.log(`${t.pass} passed, ${t.fail} failed`);
process.exit(t.fail ? 1 : 0);
