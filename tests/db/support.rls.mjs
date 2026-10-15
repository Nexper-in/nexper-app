// Run: node tests/db/support.rls.mjs (part of npm run test:db). S10/S11 at the database level:
// support sessions can be opened only by a platform admin through the server, are limited in
// length and scope, every read needs an open session that covers the shop, owners see only their
// own sessions, and the audit logs cannot be changed by anyone who reaches the database through the API.
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
const user = async (n) => (await q(`insert into auth.users (email) values ('${n}@x') returning id`))[0].id;

await as(db, null);
const ownerA = await user("ownerA"), ownerB = await user("ownerB"), admin = await user("admin"), admin2 = await user("admin2"), plain = await user("plain");
const shop = async (o, name) => {
  await as(db, o);
  const id = (await q(`insert into shops (owner_id, name, type) values ('${o}', '${name}', 'kirana') returning id`))[0].id;
  await db.exec(`insert into shop_members (shop_id, user_id, role, name, permissions) values ('${id}', '${o}', 'owner', 'O', '{}')`);
  return id;
};
const A1 = await shop(ownerA, "A1");
const B1 = await shop(ownerB, "B1");
await asService(db);
const orgA = (await q(`select org_id from shops where id = '${A1}'`))[0].org_id;
const orgB = (await q(`select org_id from shops where id = '${B1}'`))[0].org_id;
await db.exec(`update organisations set max_shops = 3 where id = '${orgA}'`);
await as(db, ownerA);
const A2 = (await q(`insert into shops (owner_id, name, type) values ('${ownerA}', 'A2', 'kirana') returning id`))[0].id;
await asService(db);
await db.exec(`insert into platform_admins (user_id) values ('${admin}'), ('${admin2}')`);

const open = (opts = {}) =>
  `select id from support_open_session('${opts.admin || admin}', 'a@x', ${opts.shop === undefined ? `'${A1}'` : opts.shop ? `'${opts.shop}'` : "null"}, ${opts.org ? `'${opts.org}'` : "null"}, '${opts.ticket || "T-100"}', '${opts.reason || "Customer cannot see bills"}', ${opts.minutes ?? 60}, '${opts.kind || "support"}', ${opts.unmask ? "true" : "false"})`;

// ---------- 1. opening a session ----------
await as(db, ownerA);
t.ok(/permission denied|Not allowed/.test((await fails(open())) || ""), "an owner cannot open a support session");
await as(db, plain);
t.ok(/permission denied|Not allowed/.test((await fails(open())) || ""), "a signed-in non-admin cannot");
await as(db, "anon");
t.ok(/permission denied|Not allowed/.test((await fails(open())) || ""), "an anonymous visitor cannot");
await asService(db);
t.ok(/Not allowed/.test((await fails(open({ admin: plain }))) || ""), "the server refuses a user who is not a platform admin");
t.ok(/5 to 120/.test((await fails(open({ minutes: 121 }))) || ""), "a session longer than 2 hours is refused");
t.ok(/5 to 120/.test((await fails(open({ minutes: 1 }))) || ""), "so is a pointless 1-minute one");
t.ok(/violates check/.test((await fails(open({ ticket: "x" }))) || ""), "a ticket reference is required");
t.ok(/violates check/.test((await fails(open({ reason: "short" }))) || ""), "so is a real reason (10+ characters)");
t.ok(/not in that company/.test((await fails(open({ org: orgB }))) || ""), "a shop must belong to the company named");
const s1 = (await q(open()))[0].id;
const s2 = (await q(open({ shop: null, org: orgA, ticket: "T-200" })))[0].id;
t.ok(s1 && s2, "an admin opens a one-shop session and a whole-company session");

// ---------- 2. every read is checked ----------
const check = (sess, adm, sh) => fails(`select support_check('${sess}', '${adm}', '${sh}')`);
t.ok(!(await check(s1, admin, A1)), "the session covers its own shop");
t.ok(/outside this support session/.test((await check(s1, admin, A2)) || ""), "a one-shop session does not cover another shop of the company");
t.ok(!(await check(s2, admin, A2)), "a company session covers every shop of that company");
t.ok(/outside this support session/.test((await check(s2, admin, B1)) || ""), "but not another company's shop");
t.ok(/No open support session/.test((await check(s1, admin2, A1)) || ""), "another admin cannot use the session");
t.ok(/No open support session/.test((await check("00000000-0000-0000-0000-000000000000", admin, A1)) || ""), "a made-up session id is refused");
await as(db, ownerA);
t.ok(/permission denied|Not allowed/.test((await check(s1, admin, A1)) || ""), "an owner cannot call the check");
await asService(db);
t.ok(!(await fails(`select support_log_read('${s1}', '${admin}', '${A1}', 'items', '{"page":1}', 12)`)), "a read is logged with its row count");
t.ok((await q(`select count(*)::int c from support_access_log where session_id = '${s1}' and row_count = 12 and resource = 'items'`))[0].c === 1, "the log row is there");
t.ok(/outside this support session/.test((await fails(`select support_log_read('${s1}', '${admin}', '${A2}', 'items', null, 1)`)) || ""), "an out-of-scope read is not logged and is refused");
t.ok((await q(`select count(*)::int c from support_access_log where session_id = '${s1}'`))[0].c === 1, "so there is still one log row");

// ---------- 3. ending and expiry ----------
await db.exec(`select support_end_session('${s1}', '${admin2}')`);
t.ok(!(await check(s1, admin, A1)), "another admin cannot end somebody else's session");
await db.exec(`select support_end_session('${s1}', '${admin}')`);
t.ok(/No open support session/.test((await check(s1, admin, A1)) || ""), "an ended session no longer works");
t.ok(/No open support session/.test((await fails(`select support_log_read('${s1}', '${admin}', '${A1}', 'items', null, 1)`)) || ""), "and cannot log a read either");
// expiry: push the session's end into the past as the database owner (bypassing the guard on purpose)
const s3 = (await q(open({ ticket: "T-300" })))[0].id;
await db.exec(`reset role; alter table support_sessions disable trigger support_sessions_guard; update support_sessions set started_at = now() - interval '3 hours', expires_at = now() - interval '1 hour' where id = '${s3}'; alter table support_sessions enable trigger support_sessions_guard;`);
await asService(db);
t.ok(/No open support session/.test((await check(s3, admin, A1)) || ""), "an expired session no longer works");

// ---------- 4. nobody rewrites history ----------
// The real role this time (asService only carries the server's claim), so privileges apply.
await db.exec(`reset role; alter role service_role bypassrls; select set_config('request.jwt.claim.role', 'service_role', false); set role service_role`);
t.ok(/permission denied|append-only|only be ended/.test((await fails(`update support_access_log set resource = 'x'`)) || ""), "the server cannot change an access log row");
t.ok(/permission denied|append-only/.test((await fails(`delete from support_access_log`)) || ""), "or delete it");
t.ok(/permission denied|append-only|only be ended/.test((await fails(`update support_sessions set reason = 'something else entirely'`)) || ""), "or rewrite a session");
t.ok(/permission denied/.test((await fails(`delete from support_sessions`)) || ""), "or delete a session");
t.ok(/permission denied/.test((await fails(`insert into support_sessions (admin_id, org_id, ticket_ref, reason, kind, expires_at) values ('${admin}', '${orgA}', 'T-9', 'inserting around the function', 'support', now() + interval '1 hour')`)) || ""), "or make a session without the function (which checks the admin)");
await db.exec(`insert into admin_audit_log (admin_id, action, target_type) values ('${admin}', 'x', 'shop')`);
t.ok(/permission denied/.test((await fails(`update admin_audit_log set action = 'y'`)) || ""), "the admin audit log is append-only for the server too");
t.ok(/permission denied/.test((await fails(`delete from admin_audit_log`)) || ""), "and cannot be emptied");
// even the database owner is stopped by the trigger unless a purge says so
await db.exec(`reset role`);
t.ok(/append-only/.test((await fails(`update admin_audit_log set action = 'y'`)) || ""), "even a direct connection cannot edit the audit log by accident (trigger)");

// ---------- 5. what the owner sees ----------
await as(db, ownerA);
const mine = await q(`select ticket_ref, views, shop_name from support_session_summary('${orgA}') order by ticket_ref`);
t.ok(mine.length >= 2 && mine.find((r) => r.ticket_ref === "T-100").views === "1" || mine.find((r) => r.ticket_ref === "T-100").views === 1, "the owner sees their sessions with how many screens were viewed");
t.ok((await q(`select count(*)::int c from support_sessions`))[0].c === mine.length, "and can read the sessions table directly, only their own");
t.ok((await q(`select count(*)::int c from support_session_summary('${orgB}')`))[0].c === 0, "the summary of another company is empty");
t.ok((await q(`select count(*)::int c from support_access_log`))[0].c === 0, "the raw access log is not readable by owners");
await as(db, ownerB);
t.ok((await q(`select count(*)::int c from support_sessions where org_id = '${orgA}'`))[0].c === 0, "another owner sees none of company A's sessions");
await as(db, "anon");
t.ok((await q(`select count(*)::int c from support_session_summary('${orgA}')`).catch(() => [{ c: 0 }]))[0].c === 0, "an anonymous visitor sees nothing");

// ---------- 6. keeping records two years ----------
await asService(db);
await db.exec(`reset role; select set_config('nexper.purging', 'on', false); update support_access_log set at = now() - interval '3 years'; update admin_audit_log set created_at = now() - interval '3 years'; select set_config('nexper.purging', '', false);`);
await asService(db);
const gone = (await q(`select purge_old_audit() n`))[0].n;
t.ok(gone >= 2, `records older than 2 years are removed by the daily job (${gone})`);
t.ok((await q(`select count(*)::int c from support_sessions where id = '${s2}'`))[0].c === 1, "recent sessions stay");
await as(db, ownerA);
t.ok(/Not allowed|permission denied/.test((await fails(`select purge_old_audit()`)) || ""), "an owner cannot run the purge");

console.log(`${t.pass} passed, ${t.fail} failed (support sessions)`);
process.exit(t.fail ? 1 : 0);
