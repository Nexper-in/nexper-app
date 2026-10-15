import test from "node:test";
import assert from "node:assert/strict";
import { installFakeSupabase } from "./helpers/fakeSupabase.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
const { isRateLimited } = await import("../lib/rateLimit.js");
const { scrub } = await import("../lib/errorScrub.js");

// A fake rate_hit that counts in "the database", shared by every caller (instance).
function sharedCounter() {
  const counts = new Map();
  return (a) => {
    const n = (counts.get(a.p_key) || 0) + 1;
    counts.set(a.p_key, n);
    return n > a.p_max;
  };
}

test("the limit is counted in the database, so it holds whichever server instance answers", async () => {
  const fake = installFakeSupabase({}, { rpc: { rate_hit: sharedCounter() } });
  try {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await isRateLimited("shared:test", { windowMs: 60_000, max: 3 }));
    assert.deepEqual(results, [false, false, false, true, true]);
    assert.equal(fake.log.filter((l) => l[0] === "rpc" && l[1] === "rate_hit").length, 5, "every check went to the database");
    assert.deepEqual(fake.log.find((l) => l[1] === "rate_hit")[2], { p_key: "shared:test", p_window_seconds: 60, p_max: 3 });
  } finally {
    fake.restore();
  }
});

test("if the database count says limited, that wins over a fresh local count (another instance saw the hits)", async () => {
  const fake = installFakeSupabase({}, { rpc: { rate_hit: () => true } });
  try {
    assert.equal(await isRateLimited("fresh:key", { windowMs: 60_000, max: 3 }), true);
  } finally {
    fake.restore();
  }
});

test("if the database call fails, it falls back to the in-memory count instead of failing open or crashing", async () => {
  const fake = installFakeSupabase({}, { rpc: {} }); // function missing: 404
  try {
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await isRateLimited("fallback:key", { windowMs: 60_000, max: 2 }));
    assert.deepEqual(r, [false, false, true, true]);
  } finally {
    fake.restore();
  }
});

test("the staff-code lookup is limited per code from any address", async () => {
  const db = { shop_members: [{ staff_code: "ABC123", user_id: "00000000-0000-4000-8000-0000000000aa" }] };
  const fake = installFakeSupabase(db, { rpc: { rate_hit: sharedCounter() } });
  try {
    const { POST } = await import("../app/api/staff/login/route.js");
    const call = (ip) => POST(new Request("http://x/api/staff/login", { method: "POST", headers: { "x-real-ip": ip, "content-type": "application/json" }, body: JSON.stringify({ staffCode: "abc123" }) }));
    let last;
    for (let i = 0; i < 15; i++) last = await call(`10.0.0.${i + 1}`); // 15 different addresses, each only once
    assert.notEqual(last.status, 429, "15 lookups are fine");
    const sixteenth = await call("10.9.9.9");
    assert.equal(sixteenth.status, 429, "the 16th for the same code is refused even from a brand-new address");
    assert.match((await sixteenth.json()).error, /this code/);
    const other = await POST(new Request("http://x/api/staff/login", { method: "POST", headers: { "x-real-ip": "10.9.9.9", "content-type": "application/json" }, body: JSON.stringify({ staffCode: "ZZZ999" }) }));
    assert.notEqual(other.status, 429, "another code is not affected");
  } finally {
    fake.restore();
  }
});

test("error reports lose long numbers and emails", () => {
  assert.equal(scrub("Failed for 9876543210 at bill 1234567", 100), "Failed for # at bill #");
  assert.equal(scrub("user ravi@example.com broke it", 100), "user <email> broke it");
  assert.equal(scrub("order 12345 ok", 100), "order 12345 ok", "short numbers stay");
  assert.equal(scrub("x".repeat(1000), 50).length, 50);
  assert.equal(scrub(null, 10), "");
});

test("/api/log-error stores a scrubbed report, attaches a shop only if the person belongs to it, and never throws", async () => {
  const SHOP = "00000000-0000-4000-8000-000000000001", OTHER = "00000000-0000-4000-8000-000000000002";
  const db = { client_errors: [], shop_members: [{ user_id: "u1", shop_id: SHOP }] };
  const fake = installFakeSupabase(db, { rpc: { rate_hit: () => false } });
  try {
    const { POST } = await import("../app/api/log-error/route.js");
    const post = (body, headers = {}) => POST(new Request("http://x/api/log-error", { method: "POST", headers: { "content-type": "application/json", "user-agent": "TestBrowser/1", ...headers }, body: JSON.stringify(body) }));
    assert.equal((await post({ message: "Boom for 9876543210", stack: "at x", route: "/billing", shopId: SHOP }, { authorization: "Bearer t" })).status, 204);
    assert.equal(db.client_errors.length, 1);
    assert.equal(db.client_errors[0].message, "Boom for #");
    assert.equal(db.client_errors[0].shop_id, SHOP);
    assert.equal(db.client_errors[0].user_id, "u1");
    await post({ message: "Another", shopId: OTHER }, { authorization: "Bearer t" });
    assert.equal(db.client_errors[1].shop_id, null, "a shop the person does not belong to is not attached");
    await post({ message: "Anonymous error" });
    assert.equal(db.client_errors[2].user_id, null);
    assert.equal(db.client_errors[2].shop_id, null);
    const before = db.client_errors.length;
    assert.equal((await post({ nothing: true })).status, 204, "garbage is ignored quietly");
    assert.equal(db.client_errors.length, before);
  } finally {
    fake.restore();
  }
  // before update 041 the table does not exist: still a quiet 204
  const fake2 = installFakeSupabase({ shop_members: [] }, { rpc: { rate_hit: () => false } });
  try {
    const { POST } = await import("../app/api/log-error/route.js");
    const r = await POST(new Request("http://x/api/log-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "x" }) }));
    assert.equal(r.status, 204);
  } finally {
    fake2.restore();
  }
});
