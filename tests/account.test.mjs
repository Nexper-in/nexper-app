import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { installFakeSupabase } from "./helpers/fakeSupabase.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
const { closeAccount, cancelClosure, finishClosures, closureOf } = await import("../lib/accountClose.js");

const OWNER = "00000000-0000-4000-8000-0000000000a1", HELPER = "00000000-0000-4000-8000-0000000000b1", MGR = "00000000-0000-4000-8000-0000000000c1";
const admin = () => createClient("http://supabase.test", "service", { auth: { persistSession: false, autoRefreshToken: false } });
const user = { id: OWNER, email: "Suresh@Example.com" };
const world = () => ({
  organisations: [{ id: "orgA", owner_id: OWNER }, { id: "orgZ", owner_id: "someone-else" }],
  shops: [{ id: "s1", org_id: "orgA", owner_id: OWNER, status: "active" }, { id: "s2", org_id: "orgA", owner_id: OWNER, status: "active" }, { id: "s3", org_id: "orgA", owner_id: OWNER, status: "closed" }, { id: "z1", org_id: "orgZ", owner_id: "someone-else", status: "active" }],
  shop_members: [
    { shop_id: "s1", user_id: OWNER, role: "owner", staff_code: null },
    { shop_id: "s1", user_id: HELPER, role: "staff", staff_code: "ABC123", via_org: null },
    { shop_id: "s2", user_id: MGR, role: "staff", staff_code: null, via_org: "orgA" },
  ],
  account_closures: [],
  admin_audit_log: [],
});

test("closing needs the email typed, and only for someone who owns a shop", async () => {
  const fake = installFakeSupabase(world(), { rpc: { admin_close_shop: () => null } });
  try {
    assert.equal((await closeAccount({ admin: admin(), user, confirmEmail: "wrong@x.com" })).status, 400);
    assert.equal((await closeAccount({ admin: admin(), user: { id: "nobody", email: "n@x.com" }, confirmEmail: "n@x.com" })).status, 400, "a person with no shop has nothing to close here");
    assert.equal(fake.log.filter((l) => l[0] === "rpc").length, 0, "nothing was closed");
  } finally {
    fake.restore();
  }
});

test("closing closes every open shop of their companies and no one else's, and schedules the sign-in deletion", async () => {
  const db = world();
  const fake = installFakeSupabase(db, { rpc: { admin_close_shop: () => null } });
  try {
    const r = await closeAccount({ admin: admin(), user, confirmEmail: "suresh@example.com" });
    assert.equal(r.status, 200);
    assert.equal(r.body.shopsClosed, 2, "s1 and s2 (s3 was already closed, z1 is someone else's)");
    const closed = fake.log.filter((l) => l[0] === "rpc" && l[1] === "admin_close_shop").map((l) => l[2].p_shop).sort();
    assert.deepEqual(closed, ["s1", "s2"]);
    const row = db.account_closures[0];
    assert.equal(row.user_id, OWNER);
    assert.deepEqual(row.staff_user_ids, [HELPER], "the helper's staff-code sign-in goes too; the company manager (own account) does not");
    const days = (new Date(row.delete_after) - Date.now()) / 86400000;
    assert.ok(days > 90 && days < 92, `deleted about 91 days from now (${days.toFixed(1)})`);
  } finally {
    fake.restore();
  }
});

test("cancelling removes the closure, and the status says when it will happen", async () => {
  const db = world();
  db.account_closures.push({ user_id: OWNER, delete_after: new Date(Date.now() + 5 * 86400000).toISOString(), requested_at: new Date().toISOString() });
  const fake = installFakeSupabase(db);
  try {
    assert.ok((await closureOf({ admin: admin(), user })).closing.delete_after);
    assert.equal((await cancelClosure({ admin: admin(), user })).status, 200);
    assert.equal(db.account_closures.length, 0);
    assert.equal((await closureOf({ admin: admin(), user })).closing, null);
  } finally {
    fake.restore();
  }
});

test("the daily job deletes the sign-in only when the date has passed and no shop is left", async () => {
  const db = world();
  db.shops = [{ id: "z1", org_id: "orgZ", owner_id: "someone-else", status: "active" }]; // the owner's shops have been purged
  db.account_closures = [
    { user_id: OWNER, email: "s@x", delete_after: new Date(Date.now() - 86400000).toISOString(), staff_user_ids: [HELPER] },
    { user_id: "00000000-0000-4000-8000-0000000000d1", email: "later@x", delete_after: new Date(Date.now() + 5 * 86400000).toISOString(), staff_user_ids: [] },
  ];
  const fake = installFakeSupabase(db);
  try {
    const r = await finishClosures(admin());
    assert.deepEqual(r, { deleted: 1, cancelled: 0 });
    const del = fake.log.filter((l) => l[0] === "auth-admin" && l[1] === "DELETE").map((l) => l[2]);
    assert.deepEqual(del.sort(), [HELPER, OWNER].sort(), "the owner and the helper's login, nobody else");
    assert.equal(db.account_closures.length, 1, "the other owner's closure is untouched");
    assert.equal(db.admin_audit_log[0].action, "account_deleted");
  } finally {
    fake.restore();
  }
});

test("if a shop was reopened the account is not deleted and the closure is dropped", async () => {
  const db = world(); // s1 is still there, owned by OWNER
  db.account_closures = [{ user_id: OWNER, email: "s@x", delete_after: new Date(Date.now() - 86400000).toISOString(), staff_user_ids: [HELPER] }];
  const fake = installFakeSupabase(db);
  try {
    const r = await finishClosures(admin());
    assert.deepEqual(r, { deleted: 0, cancelled: 1 });
    assert.ok(!fake.log.some((l) => l[0] === "auth-admin" && l[1] === "DELETE"), "no sign-in was deleted");
    assert.equal(db.account_closures.length, 0);
  } finally {
    fake.restore();
  }
});

test("closed shops that are still waiting to be removed hold the deletion back until the next run", async () => {
  const db = world();
  db.shops = [{ id: "s3", org_id: "orgA", owner_id: OWNER, status: "closed" }];
  db.account_closures = [{ user_id: OWNER, email: "s@x", delete_after: new Date(Date.now() - 86400000).toISOString(), staff_user_ids: [] }];
  const fake = installFakeSupabase(db);
  try {
    assert.deepEqual(await finishClosures(admin()), { deleted: 0, cancelled: 0 });
    assert.equal(db.account_closures.length, 1, "the closure stays");
    assert.ok(!fake.log.some((l) => l[0] === "auth-admin" && l[1] === "DELETE"));
  } finally {
    fake.restore();
  }
});
