import test from "node:test";
import assert from "node:assert/strict";
import { installFakeSupabase } from "./helpers/fakeSupabase.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
delete process.env.RESEND_API_KEY; // sendEmail short-circuits before any network call

const { POST } = await import("../app/api/notify-login/route.js");

const req = () => new Request("http://x/api/notify-login", { method: "POST", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: "{}" });

let seq = 0;
function fakeFor(db) {
  const id = `person-${++seq}`;
  db.shop_members.forEach((m) => (m.user_id = id));
  return installFakeSupabase(db, { user: { id, email: id + "@x" } });
}

const OWNER_A = "00000000-0000-0000-0000-00000000000a";
const OWNER_B = "00000000-0000-0000-0000-00000000000b";

test("notify-login: looks up each distinct shop owner only once", async () => {
  const db = {
    shop_members: [{ shop_id: "s1" }, { shop_id: "s2" }], // both re-tagged to the caller in fakeFor
    shops: [
      { id: "s1", name: "Shop One", owner_id: OWNER_A },
      { id: "s2", name: "Shop Two", owner_id: OWNER_A }, // same owner as s1 -- must dedupe
    ],
  };
  const { log, restore } = fakeFor(db);
  try {
    const res = await POST(req());
    const body = await res.json();
    assert.equal(body.ok, true);
    const ownerLookups = log.filter((l) => l[0] === "auth-admin").map((l) => l[2]);
    assert.deepEqual(ownerLookups, [OWNER_A]); // exactly one lookup, not two
  } finally {
    restore();
  }
});

test("notify-login: two shops under different owners notify both, once each", async () => {
  const db = {
    shop_members: [{ shop_id: "s1" }, { shop_id: "s2" }],
    shops: [
      { id: "s1", name: "Shop One", owner_id: OWNER_A },
      { id: "s2", name: "Shop Two", owner_id: OWNER_B },
    ],
  };
  const { log, restore } = fakeFor(db);
  try {
    const res = await POST(req());
    assert.equal((await res.json()).ok, true);
    const ownerLookups = log.filter((l) => l[0] === "auth-admin").map((l) => l[2]).sort();
    assert.deepEqual(ownerLookups, [OWNER_A, OWNER_B].sort());
  } finally {
    restore();
  }
});

test("notify-login: no shop memberships at all is a no-op, not an error", async () => {
  const db = { shop_members: [], shops: [] };
  const { log, restore } = fakeFor(db);
  try {
    const res = await POST(req());
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.skipped, "no_shops");
    assert.equal(log.filter((l) => l[0] === "auth-admin").length, 0);
  } finally {
    restore();
  }
});

test("notify-login: refuses an unauthenticated request", async () => {
  const { restore } = installFakeSupabase({ shop_members: [], shops: [] }, { user: null });
  try {
    const res = await POST(req());
    assert.equal(res.status, 401);
  } finally {
    restore();
  }
});
