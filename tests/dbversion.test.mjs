import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compareVersions, versionAtLeast, getDbVersion, EXPECTED_DB_VERSION } from "../lib/dbVersion.js";

test("versions compare by number, then letter", () => {
  assert.equal(compareVersions("036", "035"), 1);
  assert.equal(compareVersions("035", "036"), -1);
  assert.equal(compareVersions("012b", "012"), 1);
  assert.equal(compareVersions("012b", "013"), -1);
  assert.equal(compareVersions("100", "99"), 1);
  assert.equal(compareVersions("036", "036"), 0);
});
test("a missing version is older than everything", () => {
  assert.equal(versionAtLeast(null, "036"), false);
  assert.equal(versionAtLeast(undefined, "001"), false);
  assert.equal(versionAtLeast("036", "036"), true);
  assert.equal(versionAtLeast("040", "037"), true);
  assert.equal(versionAtLeast("035", "036"), false);
});
test("getDbVersion is null before update 036 or on an error", async () => {
  assert.equal(await getDbVersion({ rpc: async () => ({ data: null, error: { message: "function does not exist" } }) }), null);
  assert.equal(await getDbVersion({ rpc: async () => ({ data: "037", error: null }) }), "037");
  assert.equal(await getDbVersion({ rpc: async () => ({ data: null, error: null }) }), null);
});

test("EXPECTED_DB_VERSION is the newest migration file (bump lib/dbVersion.js when you add one)", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url).pathname;
  const newest = fs.readdirSync(dir).filter((f) => /^\d{3}b?_.*\.sql$/.test(f)).map((f) => f.split("_")[0]).sort().pop();
  assert.equal(EXPECTED_DB_VERSION, newest);
});

test("/api/health refuses a request without the token and shows versions only with it", async () => {
  process.env.HEALTH_TOKEN = "s3cret-token";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
  const { GET } = await import("../app/api/health/route.js");
  const req = (h) => new Request("http://x/api/health", { headers: h });
  assert.equal((await GET(req({}))).status, 401);
  assert.equal((await GET(req({ authorization: "Bearer wrong" }))).status, 401);
  const ok = await GET(req({ authorization: "Bearer s3cret-token" }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.dbExpected, EXPECTED_DB_VERSION);
  assert.ok(!("shops" in body));
  delete process.env.HEALTH_TOKEN;
  assert.equal((await GET(req({ authorization: "Bearer " }))).status, 401);
});
