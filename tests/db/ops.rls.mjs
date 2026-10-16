// Run: node tests/db/ops.rls.mjs (part of npm run test:db). Shared rate limits and the error log (041).
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
const owner = await user("owner");
await as(db, owner);
const shop = (await q(`insert into shops (owner_id, name, type) values ('${owner}', 'S', 'kirana') returning id`))[0].id;

// ---------- rate_hit ----------
await asService(db);
const hit = async (key, win, max) => (await q(`select rate_hit('${key}', ${win}, ${max}) limited`))[0].limited;
const seq = [];
for (let i = 0; i < 5; i++) seq.push(await hit("login:1.2.3.4", 3600, 3));
t.ok(seq.join() === "false,false,false,true,true", `the 4th hit in a window is limited (${seq.join()})`);
t.ok((await hit("login:9.9.9.9", 3600, 3)) === false, "another key has its own count");
t.ok((await q(`select count from rate_limit_hits where key = 'login:1.2.3.4'`))[0].count === 5, "the counter is stored in the database (so it is shared between server instances)");
t.ok(/Bad window/.test((await fails(`select rate_hit('k', 0, 1)`)) || ""), "a nonsense window is refused");
t.ok(/Bad window/.test((await fails(`select rate_hit('k', 999999, 1)`)) || ""), "so is a window over a day");
// a new window starts a new count
await db.exec(`reset role; update rate_limit_hits set window_start = window_start - interval '2 hours' where key = 'login:1.2.3.4'`);
await asService(db);
t.ok((await hit("login:1.2.3.4", 3600, 3)) === false, "the next window starts again from zero");
await as(db, owner);
t.ok(/Not allowed|permission denied/.test((await fails(`select rate_hit('x', 60, 1)`)) || ""), "an owner cannot call it");
await as(db, "anon");
t.ok(/Not allowed|permission denied/.test((await fails(`select rate_hit('x', 60, 1)`)) || ""), "neither can a visitor");

// ---------- error log and housekeeping ----------
await asService(db);
await db.exec(`insert into client_errors (shop_id, message, route) values ('${shop}', 'recent', '/billing'), ('${shop}', 'old', '/billing')`);
await db.exec(`reset role; update client_errors set at = now() - interval '45 days' where message = 'old'; update rate_limit_hits set window_start = now() - interval '3 days' where key = 'login:9.9.9.9'`);
await asService(db);
const n = (await q(`select purge_ops() n`))[0].n;
t.ok(n >= 2, `the daily job removes old windows and error reports (${n})`);
t.ok((await q(`select message from client_errors`)).map((r) => r.message).join() === "recent", "reports older than 30 days are gone, recent ones stay");
t.ok((await q(`select count(*)::int c from rate_limit_hits where key = 'login:9.9.9.9'`))[0].c === 0, "windows older than a day are gone");
await as(db, owner);
t.ok((await q(`select count(*)::int c from client_errors`))[0].c === 0, "an owner cannot read the error log");
t.ok(/Not allowed|permission denied/.test((await fails(`select purge_ops()`)) || ""), "or run the purge");

console.log(`${t.pass} passed, ${t.fail} failed (shared limits and error log)`);
process.exit(t.fail ? 1 : 0);
